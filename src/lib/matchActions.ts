import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { logActivity, type Actor } from './activity'
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
