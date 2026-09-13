import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { logActivity, type Actor } from './activity'

/** Ajoute un joueur "sur le pouce" (surnom facultatif) et journalise l'action. */
export async function createPlayer(actor: Actor, firstName: string, lastName: string, nickname = ''): Promise<string> {
  const nick = nickname.trim()
  const ref = await addDoc(collection(db, 'players'), {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    nickname: nick || null,
    active: true,
    createdAt: serverTimestamp(),
  })
  const label = `${firstName.trim()} ${lastName.trim()}${nick ? ` « ${nick} »` : ''}`
  await logActivity(actor, 'create', 'player', ref.id, `Joueur ajouté : ${label}`)
  return ref.id
}
