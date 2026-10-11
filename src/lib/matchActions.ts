import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { logActivity, type Actor, readBefore, undoUpdate } from './activity'
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
