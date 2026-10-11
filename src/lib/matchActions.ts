import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { logActivity, readBefore, undoUpdate, type Actor } from './activity'
import { formatDate } from './format'
import { withEffectiveStatus } from './matches'
import { describeMergeSummary, newMatchData, planMerge, planMergeIntoNew, type MatchData, type MergeSummary, type MergeWrite } from './matchMerge'
import type { Match } from './types'

const STATUS_LABEL: Record<Match['status'], string> = { scheduled: 'À venir', voting: 'Votes ouverts', reading: 'Lecture', closed: 'Terminé' }

/**
 * Rouvre les votes d'un match, quel que soit son état (à venir, en lecture, terminé).
 * Les votes déjà lus le restent ; chacun peut de nouveau envoyer ou modifier un vote non lu.
 */
export async function reopenVotes(match: Match, actor: Actor) {
  const before = await readBefore(`matches/${match.id}`)
  await updateDoc(doc(db, 'matches', match.id), { status: 'voting', voteDeadline: null, voteTimerBy: null, updatedAt: serverTimestamp() })
  await logActivity(actor, 'update', 'match', match.id, `Votes rouverts pour ${match.opponent}`, [{ field: 'Statut', before: STATUS_LABEL[match.status], after: STATUS_LABEL.voting }], undoUpdate(`matches/${match.id}`, before, ['status', 'voteDeadline', 'voteTimerBy']))
}

/**
 * Score du match, saisi du point de vue de l'équipe (« nous » / « eux ») et rangé en domicile / extérieur.
 * Score vide : null des deux côtés.
 */
export async function saveScore(match: Match, ours: number | null, theirs: number | null, actor: Actor) {
  const homeScore = match.home ? ours : theirs
  const awayScore = match.home ? theirs : ours
  const path = `matches/${match.id}`
  const before = await readBefore(path)
  await updateDoc(doc(db, 'matches', match.id), { homeScore, awayScore, updatedAt: serverTimestamp() })
  const fmt = (h: number | null | undefined, a: number | null | undefined) => (h == null || a == null ? '—' : `${h} – ${a}`)
  await logActivity(
    actor,
    'update',
    'match',
    match.id,
    `Score ${match.homeScore == null ? 'encodé' : 'corrigé'} : ${match.opponent} ${fmt(homeScore, awayScore)}`,
    [{ field: 'Score', before: fmt(match.homeScore, match.awayScore), after: fmt(homeScore, awayScore) }],
    undoUpdate(path, before, ['homeScore', 'awayScore']),
  )
}

const MATCH_COLLECTIONS = ['tickets', 'likes', 'coums', 'goals', 'fines', 'statEntries'] as const

/** Tout ce qui est rattaché à un match, lu directement sur le serveur. */
export async function loadMatchData(matchId: string): Promise<MatchData> {
  const lists = await Promise.all(
    MATCH_COLLECTIONS.map(async (name) => (await getDocs(query(collection(db, name), where('matchId', '==', matchId)))).docs.map((d) => ({ id: d.id, ...d.data() }))),
  )
  return Object.fromEntries(MATCH_COLLECTIONS.map((name, i) => [name, lists[i]])) as unknown as MatchData
}

async function loadMatch(id: string): Promise<Match> {
  const snap = await getDoc(doc(db, 'matches', id))
  if (!snap.exists()) throw new Error('Match introuvable')
  return withEffectiveStatus({ id: snap.id, ...(snap.data() as Omit<Match, 'id'>) })
}

/**
 * Aperçu de la fusion de deux doublons dans un nouveau match, sans rien écrire.
 * `baseId` : le match dont le nouveau reprend les informations (date, adversaire…).
 */
export async function previewMergeIntoNew(baseId: string, otherId: string) {
  const [a, b, da, dbData] = await Promise.all([loadMatch(baseId), loadMatch(otherId), loadMatchData(baseId), loadMatchData(otherId)])
  const target = { id: 'nouveau', ...newMatchData(a, '', null) } as unknown as Match
  return planMergeIntoNew(target, a, b, da, dbData, { now: null, by: '' })
}

/**
 * Écrit les groupes par lots atomiques (une écriture groupée est limitée à 500 opérations).
 * Un groupe ne se coupe jamais : un document est créé et supprimé dans le même lot.
 */
async function commitGroups(groups: MergeWrite[][]) {
  let batch = writeBatch(db)
  let size = 0
  const apply = (w: MergeWrite) => {
    const ref = doc(db, w.path)
    if (w.kind === 'set') batch.set(ref, w.data)
    else if (w.kind === 'update') batch.update(ref, w.data)
    else batch.delete(ref)
  }
  for (const group of groups) {
    if (size + group.length > 450) {
      await batch.commit()
      batch = writeBatch(db)
      size = 0
    }
    group.forEach(apply)
    size += group.length
  }
  if (size) await batch.commit()
}

/**
 * Déplace tout ce qui est rattaché à `sourceId` sur `targetId` (voir lib/matchMerge), puis marque
 * `sourceId` fusionné. Un vote envoyé sur l'ancien match pendant la fusion est rattrapé par un second passage.
 */
async function moveInto(targetId: string, sourceId: string, actor: Actor) {
  const [target, source] = await Promise.all([loadMatch(targetId), loadMatch(sourceId)])
  if (source.mergedInto) throw new Error('Ce match a déjà été fusionné')
  const now = serverTimestamp()
  const plan = planMerge(target, source, await loadMatchData(targetId), await loadMatchData(sourceId), { now, by: actor.name })
  await commitGroups(plan.groups)
  await commitGroups([plan.matchWrites])

  const total = { ...plan.summary }
  for (let pass = 0; pass < 3; pass++) {
    const late = await loadMatchData(sourceId)
    if (!MATCH_COLLECTIONS.some((name) => late[name].length)) break
    const again = planMerge(await loadMatch(targetId), source, await loadMatchData(targetId), late, { now, by: actor.name, withMatches: false })
    await commitGroups(again.groups)
    for (const k of Object.keys(total) as (keyof MergeSummary)[]) total[k] += again.summary[k]
  }
  return { summary: total, status: plan.status, source }
}

/**
 * Deux matchs en double → un troisième, neuf, qui récupère tout ce qui est rattaché aux deux :
 * votes, coups de cœur, coum, buts, amendes et listes maison. Rien n'est perdu (voir lib/matchMerge).
 * Les deux anciens sont marqués fusionnés et disparaissent de l'application ; leurs liens mènent au nouveau.
 * `baseId` : le match dont le nouveau reprend les informations (les manques sont comblés par l'autre).
 * Renvoie l'identifiant du nouveau match et le bilan.
 */
export async function mergeIntoNewMatch(baseId: string, otherId: string, actor: Actor): Promise<{ id: string; summary: MergeSummary }> {
  if (baseId === otherId) throw new Error('Choisissez deux matchs différents')
  const [a, b] = await Promise.all([loadMatch(baseId), loadMatch(otherId)])
  if (a.mergedInto || b.mergedInto) throw new Error('Un de ces matchs a déjà été fusionné')

  const ref = await addDoc(collection(db, 'matches'), newMatchData(a, actor.uid, serverTimestamp()))
  const label = (m: Match) => `${m.opponent} (${formatDate(m.date)})`
  await logActivity(actor, 'create', 'match', ref.id, `Match créé pour fusionner deux doublons : ${label(a)}`)

  const first = await moveInto(ref.id, a.id, actor)
  const second = await moveInto(ref.id, b.id, actor)
  const summary = { ...first.summary }
  for (const k of Object.keys(summary) as (keyof MergeSummary)[]) summary[k] += second.summary[k]

  await logActivity(actor, 'update', 'match', ref.id, `Matchs fusionnés dans un nouveau match : ${label(a)} + ${label(b)} — ${describeMergeSummary(summary)}`, [
    { field: 'Statut', before: `${STATUS_LABEL[a.status]} / ${STATUS_LABEL[b.status]}`, after: STATUS_LABEL[second.status] },
  ])
  for (const m of [a, b]) await logActivity(actor, 'update', 'match', m.id, `Match en double fusionné dans le nouveau match : ${label(m)}`)
  return { id: ref.id, summary }
}
