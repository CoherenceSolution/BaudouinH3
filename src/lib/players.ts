import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { logActivity, type Actor } from './activity'

/** Ajoute un joueur "sur le pouce" et journalise l'action. */
export async function createPlayer(actor: Actor, firstName: string, lastName: string): Promise<string> {
  const ref = await addDoc(collection(db, 'players'), {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    active: true,
    createdAt: serverTimestamp(),
  })
  await logActivity(actor, 'create', 'player', ref.id, `Joueur ajouté : ${firstName.trim()} ${lastName.trim()}`)
  return ref.id
}
