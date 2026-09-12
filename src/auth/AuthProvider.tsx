import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db, firebaseConfigured } from '@/lib/firebase'
import type { Player, Role, StaffMember } from '@/lib/types'
import type { Actor } from '@/lib/activity'

/**
 * Session applicative.
 *  - "public"  : membre connecté anonymement, qui a choisi son nom dans la liste des joueurs.
 *  - "speaker" : idem, mais en mode orateur.
 *  - "staff"   : secrétaire ou admin (e-mail + mot de passe).
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

  const setIdentity = useCallback((playerId: string, mode: Mode) => {
    const next = { playerId, mode }
    setIdentityState(next)
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(next))
    } catch {
      /* stockage indisponible */
    }
  }, [])

  const clearIdentity = useCallback(() => {
    setIdentityState(null)
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
    const role = staff?.role ?? null
    // Compte staff relié à un joueur : identité imposée par le compte, valable sur tous les appareils.
    const effectiveIdentity: PublicIdentity | null = staff?.playerId ? { playerId: staff.playerId, mode: 'public' } : identity
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
      clearIdentity,
      loginStaff,
      ensureAnonymous,
      logout,
      actorFor: (players: Player[]) => {
        if (staff) return { uid: staff.id, name: staff.displayName || staff.email, role: staff.role }
        const p = players.find((x) => x.id === effectiveIdentity?.playerId)
        return {
          uid: user?.uid ?? 'anonymous',
          name: p ? `${p.firstName} ${p.lastName}` : 'Membre',
          role: effectiveIdentity?.mode === 'speaker' ? 'speaker' : 'public',
        }
      },
    }
  }, [authReady, staffReady, bootstrapped, user, staff, identity, setIdentity, clearIdentity, loginStaff, ensureAnonymous, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
