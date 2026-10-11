import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, firebaseConfigured } from '@/lib/firebase'
import type { Player, Role, StaffMember } from '@/lib/types'
import type { Actor } from '@/lib/activity'

/**
 * Session applicative.
 *  - "public"  : membre connecté anonymement, qui a choisi son nom dans la liste des joueurs.
 *  - "speaker" : idem, mais en mode orateur (rôle pris à la connexion ou depuis la page du match).
 *  - "staff"   : admin (e-mail + mot de passe), ou secrétaire : un membre dont le joueur porte
 *                role = 'secretary'. Ses droits suivent son nom, sans code : l'appareil déclare son
 *                joueur dans identities/{uid}, que lisent les règles Firestore.
 */
export type Mode = 'public' | 'speaker'

interface PublicIdentity {
  playerId: string
  mode: Mode
}

interface AuthState {
  ready: boolean
  bootstrapped: boolean | null
  user: User | null
  staff: StaffMember | null
  role: Role | null
  isStaff: boolean
  isAdmin: boolean
  identity: PublicIdentity | null
  setIdentity: (playerId: string, mode: Mode) => void
  /** Prend ou quitte le rôle d'orateur sur cet appareil, sans se reconnecter. */
  setMode: (mode: Mode) => void
  clearIdentity: () => void
  loginStaff: (email: string, password: string) => Promise<void>
  ensureAnonymous: () => Promise<User>
  logout: () => Promise<void>
  actorFor: (players: Player[]) => Actor
}

const AuthContext = createContext<AuthState | null>(null)

const IDENTITY_KEY = 'bh3.identity'

function readIdentity(): PublicIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    return raw ? (JSON.parse(raw) as PublicIdentity) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [staff, setStaff] = useState<StaffMember | null>(null)
  const [staffReady, setStaffReady] = useState(false)
  const [bootstrapped, setBootstrapped] = useState<boolean | null>(null)
  const [identity, setIdentityState] = useState<PublicIdentity | null>(readIdentity)
  /** Joueur déclaré dans identities/{uid} (confirmé par la base) et droits de secrétaire de ce joueur. */
  const [linkedPlayerId, setLinkedPlayerId] = useState<string | null>(null)
  const [playerIsSecretary, setPlayerIsSecretary] = useState(false)

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthReady(true)
      setStaffReady(true)
      setBootstrapped(true)
      return
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthReady(true)
    })
  }, [])

  // Le document config/bootstrap indique si la première installation a été faite.
  useEffect(() => {
    if (!firebaseConfigured) return
    return onSnapshot(
      doc(db, 'config', 'bootstrap'),
      (snap) => setBootstrapped(snap.exists()),
      () => setBootstrapped(true),
    )
  }, [])

  // Rôle staff : suit staff/{uid} en temps réel.
  // Dépend de l'uid (et non de l'objet User, qui peut être recréé lors d'un rafraîchissement
  // de jeton) pour ne pas démonter l'application inutilement.
  const uid = user?.uid ?? null
  const anonymous = user?.isAnonymous ?? true
  useEffect(() => {
    if (!uid || anonymous) {
      setStaff(null)
      setStaffReady(true)
      return
    }
    setStaffReady(false)
    return onSnapshot(
      doc(db, 'staff', uid),
      (snap) => {
        setStaff(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<StaffMember, 'id'>) }) : null)
        setStaffReady(true)
      },
      () => {
        setStaff(null)
        setStaffReady(true)
      },
    )
  }, [uid, anonymous])

  // Membre connecté sous un nom : l'appareil déclare son joueur (identities/{uid}). C'est ce document
  // qui donne aux secrétaires leurs droits d'écriture dans les règles Firestore, sans code à saisir.
  const playerId = identity?.playerId ?? null
  useEffect(() => {
    if (!uid || !anonymous) {
      setLinkedPlayerId(null)
      return
    }
    return onSnapshot(
      doc(db, 'identities', uid),
      (snap) => setLinkedPlayerId(snap.exists() ? ((snap.data().playerId as string) ?? null) : null),
      () => setLinkedPlayerId(null),
    )
  }, [uid, anonymous])

  useEffect(() => {
    if (!uid || !anonymous || !playerId || linkedPlayerId === playerId) return
    setDoc(doc(db, 'identities', uid), { playerId, updatedAt: serverTimestamp() }).catch((e) => console.error('Identité non enregistrée', e))
  }, [uid, anonymous, playerId, linkedPlayerId])

  // Droits de secrétaire du joueur : accordés ou retirés par l'admin, appliqués en direct.
  useEffect(() => {
    if (!uid || !anonymous || !playerId) {
      setPlayerIsSecretary(false)
      return
    }
    return onSnapshot(
      doc(db, 'players', playerId),
      (snap) => setPlayerIsSecretary(snap.exists() && snap.data().role === 'secretary'),
      () => setPlayerIsSecretary(false),
    )
  }, [uid, anonymous, playerId])

  const setIdentity = useCallback((playerId: string, mode: Mode) => {
    const next = { playerId, mode }
    setIdentityState(next)
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(next))
    } catch {
      /* stockage indisponible */
    }
  }, [])

  const setMode = useCallback((mode: Mode) => {
    setIdentityState((cur) => {
      if (!cur) return cur
      const next = { ...cur, mode }
      try {
        localStorage.setItem(IDENTITY_KEY, JSON.stringify(next))
      } catch {
        /* stockage indisponible */
      }
      return next
    })
  }, [])

  const clearIdentity = useCallback(() => {
    setIdentityState(null)
    // L'appareil ne porte plus le nom (ni les droits) de ce joueur.
    const current = auth.currentUser
    if (current?.isAnonymous) deleteDoc(doc(db, 'identities', current.uid)).catch(() => {})
    try {
      localStorage.removeItem(IDENTITY_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const ensureAnonymous = useCallback(async () => {
    if (auth.currentUser) return auth.currentUser
    const cred = await signInAnonymously(auth)
    return cred.user
  }, [])

  const loginStaff = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
    clearIdentity()
  }, [clearIdentity])

  const logout = useCallback(async () => {
    clearIdentity()
    await fbSignOut(auth)
  }, [clearIdentity])

  const value = useMemo<AuthState>(() => {
    // Compte staff relié à un joueur : identité imposée par le compte, valable sur tous les appareils.
    const effectiveIdentity: PublicIdentity | null = staff?.playerId ? { playerId: staff.playerId, mode: 'public' } : identity
    // Secrétaire par son nom : dès que la base a enregistré le joueur de cet appareil (sinon les règles refuseraient).
    const namedSecretary = !staff && playerIsSecretary && !!identity && linkedPlayerId === identity.playerId
    const role: Role | null = staff?.role ?? (namedSecretary ? 'secretary' : null)
    return {
      ready: authReady && staffReady && bootstrapped !== null,
      bootstrapped,
      user,
      staff,
      role,
      isStaff: role !== null,
      isAdmin: role === 'admin',
      identity: effectiveIdentity,
      setIdentity,
      setMode,
      clearIdentity,
      loginStaff,
      ensureAnonymous,
      logout,
      actorFor: (players: Player[]) => {
        const p = players.find((x) => x.id === effectiveIdentity?.playerId)
        if (staff) return { uid: staff.id, name: p ? `${p.firstName} ${p.lastName}` : staff.displayName || staff.email, role: staff.role }
        return {
          uid: user?.uid ?? 'anonymous',
          name: p ? `${p.firstName} ${p.lastName}` : 'Membre',
          role: namedSecretary ? 'secretary' : effectiveIdentity?.mode === 'speaker' ? 'speaker' : 'public',
        }
      },
    }
  }, [authReady, staffReady, bootstrapped, user, staff, identity, linkedPlayerId, playerIsSecretary, setIdentity, setMode, clearIdentity, loginStaff, ensureAnonymous, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
