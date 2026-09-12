import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth'
import { deleteDoc, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth, db, firebaseConfig, useEmulators } from './firebase'
import type { SecretaryAccess } from './types'

/**
 * Accès des secrétaires par code PIN.
 *
 * Les secrétaires n'ont ni e-mail ni mot de passe individuel. L'admin fixe un code à 4 chiffres ou plus ;
 * ce code ouvre un compte technique partagé (Firebase Auth e-mail/mot de passe) dont le document
 * staff/{uid} porte le rôle 'secretary'. Les règles Firestore restent donc verrouillées : sans le code,
 * aucune écriture n'est possible, même en connaissant le nom d'un secrétaire.
 */

const ACCESS_DOC = doc(db, 'config', 'secretaryAccess')

export const PIN_PATTERN = /^\d{4,8}$/

function pinToPassword(pin: string) {
  return `pin-${pin}`
}

function sharedEmail() {
  const domain = firebaseConfig.authDomain || 'baudouin-h3.local'
  return `secretaires-${Date.now()}@${domain}`
}

export async function readSecretaryAccess(): Promise<SecretaryAccess | null> {
  const snap = await getDoc(ACCESS_DOC)
  return snap.exists() ? (snap.data() as SecretaryAccess) : null
}

/** Ouvre la session secrétaire avec le code. Lève une erreur Firebase (code 'auth/invalid-credential') si le code est faux. */
export async function signInSecretary(pin: string): Promise<void> {
  const access = await readSecretaryAccess()
  if (!access) throw Object.assign(new Error('Aucun code défini'), { code: 'app/no-secretary-access' })
  await signInWithEmailAndPassword(auth, access.email, pinToPassword(pin.trim()))
}

/**
 * Définit (ou remplace) le code des secrétaires. Admin uniquement.
 * Si l'ancien code est connu, le mot de passe du compte existant est changé.
 * Sinon, un nouveau compte technique est créé et l'ancien perd ses droits.
 */
export async function setSecretaryPin(newPin: string, previousPin?: string): Promise<void> {
  const pin = newPin.trim()
  if (!PIN_PATTERN.test(pin)) throw new Error('Le code doit comporter entre 4 et 8 chiffres.')
  const current = await readSecretaryAccess()
  const secondary = initializeApp(firebaseConfig, `secretary-access-${Date.now()}`)
  const secAuth = getAuth(secondary)
  if (useEmulators) connectAuthEmulator(secAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
  try {
    if (current && previousPin?.trim()) {
      // Changement de code sur le compte existant
      const cred = await signInWithEmailAndPassword(secAuth, current.email, pinToPassword(previousPin.trim()))
      await updatePassword(cred.user, pinToPassword(pin))
      await signOut(secAuth)
      const batch = writeBatch(db)
      batch.set(ACCESS_DOC, { ...current, updatedAt: serverTimestamp() })
      await batch.commit()
      return
    }
    // Nouveau compte technique (première définition ou code oublié)
    const email = sharedEmail()
    const cred = await createUserWithEmailAndPassword(secAuth, email, pinToPassword(pin))
    await signOut(secAuth)
    const batch = writeBatch(db)
    batch.set(doc(db, 'staff', cred.user.uid), { email, displayName: 'Secrétaires (code commun)', role: 'secretary', shared: true, playerId: null, createdAt: serverTimestamp() })
    batch.set(ACCESS_DOC, { email, uid: cred.user.uid, updatedAt: serverTimestamp() })
    await batch.commit()
    if (current?.uid) await deleteDoc(doc(db, 'staff', current.uid)).catch(() => {})
  } finally {
    await deleteApp(secondary).catch(() => {})
  }
}
