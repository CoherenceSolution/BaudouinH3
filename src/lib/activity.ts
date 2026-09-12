import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { ActivityAction, ActivityLog } from './types'

export interface Actor {
  uid: string
  name: string
  role: ActivityLog['actorRole']
}

/** Écrit une entrée dans le journal d'activité. Ne bloque jamais l'action métier en cas d'échec. */
export async function logActivity(actor: Actor, action: ActivityAction, entity: string, entityId: string, summary: string) {
  try {
    await addDoc(collection(db, 'activity'), {
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      entity,
      entityId,
      summary,
      at: serverTimestamp(),
    })
  } catch (e) {
    console.warn('Journal d’activité indisponible', e)
  }
}
