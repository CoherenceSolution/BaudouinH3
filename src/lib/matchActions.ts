import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { logActivity, type Actor } from './activity'
import { formatDate } from './format'
import { withEffectiveStatus } from './matches'
import { describeMergeSummary, planMerge, type MatchData, type MergePlan, type MergeSummary, type MergeWrite } from './matchMerge'
import type { Match } from './types'

const STATUS_LABEL: Record<Match['status'], string> = { scheduled: 'À venir', voting: 'Votes ouverts', reading: 'Lecture', closed: 'Terminé' }

/**
 * Rouvre les votes d'un match, quel que soit son état (à venir, en lecture, terminé).
 * Les votes déjà lus le restent ; chacun peut de nouveau envoyer ou modifier un vote non lu.
 */
export async function reopenVotes(match: Match, actor: Actor) {
  await updateDoc(doc(db, 'matches', match.id), { status: 'voting', voteDeadline: null, voteTimerBy: null, updatedAt: serverTimestamp() })
  await logActivity(actor, 'update', 'match', match.id, `Votes rouverts pour ${match.opponent}`, [{ field: 'Statut', before: STATUS_LABEL[match.status], after: STATUS_LABEL.voting }])
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

/** Aperçu d'une fusion, sans rien écrire. */
export async function previewMerge(targetId: string, sourceId: string): Promise<MergePlan> {
  const [target, source, t, s] = await Promise.all([loadMatch(targetId), loadMatch(sourceId), loadMatchData(targetId), loadMatchData(sourceId)])
  return planMerge(target, source, t, s, { now: null, by: '' })
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
 * Fusionne le match `sourceId` (doublon) dans `targetId` : votes, coups de cœur, coum, buts, amendes et
 * listes maison passent sur le match conservé ; rien n'est perdu (voir lib/matchMerge).
 * Le doublon est ensuite marqué fusionné et disparaît de l'application.
 * Un vote envoyé pendant la fusion sur le doublon est rattrapé par un second passage.
 */
export async function mergeMatches(targetId: string, sourceId: string, actor: Actor): Promise<MergeSummary> {
  if (targetId === sourceId) throw new Error('Choisissez deux matchs différents')
  const [target, source] = await Promise.all([loadMatch(targetId), loadMatch(sourceId)])
  if (target.mergedInto || source.mergedInto) throw new Error('Un de ces matchs a déjà été fusionné')

  const now = serverTimestamp()
  const plan = planMerge(target, source, await loadMatchData(targetId), await loadMatchData(sourceId), { now, by: actor.name })
  await commitGroups(plan.groups)
  await commitGroups([plan.matchWrites])

  // Rattrapage : un vote ou un coup de cœur écrit sur le doublon pendant la fusion.
  const total = { ...plan.summary }
  for (let pass = 0; pass < 3; pass++) {
    const late = await loadMatchData(sourceId)
    if (!MATCH_COLLECTIONS.some((name) => late[name].length)) break
    const again = planMerge(await loadMatch(targetId), source, await loadMatchData(targetId), late, { now, by: actor.name, withMatches: false })
    await commitGroups(again.groups)
    for (const k of Object.keys(total) as (keyof MergeSummary)[]) total[k] += again.summary[k]
  }

  const label = (m: Match) => `${m.opponent} (${formatDate(m.date)})`
  await logActivity(actor, 'update', 'match', target.id, `Matchs fusionnés : ${label(source)} → ${label(target)} — ${describeMergeSummary(total)}`, [
    { field: 'Statut', before: STATUS_LABEL[target.status], after: STATUS_LABEL[plan.status] },
  ])
  await logActivity(actor, 'update', 'match', source.id, `Match en double fusionné dans ${label(target)} : ${label(source)}`)
  return total
}
