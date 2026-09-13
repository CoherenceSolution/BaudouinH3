import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { db } from '@/lib/firebase'
import { useCollection } from './useCollection'
import type { Coum, Fine, FineType, Goal, Like, Match, Player, StaffMember, StatCategory, StatEntry, Ticket, ActivityLog } from '@/lib/types'
import { playerName } from '@/lib/format'
import { useAuth } from '@/auth/AuthProvider'

export function usePlayers(includeInactive = false) {
  const { user } = useAuth()
  // Un seul orderBy : deux champs exigeraient un index composite en production.
  const res = useCollection<Player>(() => (user ? query(collection(db, 'players'), orderBy('lastName')) : null), [user?.uid])
  const data = useMemo(
    () =>
      res.data
        .filter((p) => includeInactive || p.active !== false)
        // Tri sur le nom affiché : un joueur surnommé se trouve sous son surnom.
        .sort((a, b) => playerName(a).localeCompare(playerName(b), 'fr')),
    [res.data, includeInactive],
  )
  const byId = useMemo(() => new Map(res.data.map((p) => [p.id, p])), [res.data])
  return { ...res, data, byId }
}

export function useMatches() {
  const { user } = useAuth()
  return useCollection<Match>(() => (user ? query(collection(db, 'matches'), orderBy('date', 'desc')) : null), [user?.uid])
}

export function useTickets(matchId: string | undefined) {
  const { user } = useAuth()
  return useCollection<Ticket>(
    () => (user && matchId ? query(collection(db, 'tickets'), where('matchId', '==', matchId)) : null),
    [user?.uid, matchId],
  )
}

export function useLikes(matchId: string | undefined) {
  const { user } = useAuth()
  return useCollection<Like>(
    () => (user && matchId ? query(collection(db, 'likes'), where('matchId', '==', matchId)) : null),
    [user?.uid, matchId],
  )
}

/** Les coums d'un match : qui a payé, qui doit encore, qui est absent. Lisible par tout le monde. */
export function useCoums(matchId: string | undefined) {
  const { user } = useAuth()
  return useCollection<Coum>(
    () => (user && matchId ? query(collection(db, 'coums'), where('matchId', '==', matchId)) : null),
    [user?.uid, matchId],
  )
}

export function useGoals(matchId: string | undefined) {
  const { user } = useAuth()
  const res = useCollection<Goal>(
    () => (user && matchId ? query(collection(db, 'goals'), where('matchId', '==', matchId)) : null),
    [user?.uid, matchId],
  )
  const data = useMemo(() => [...res.data].sort((a, b) => a.order - b.order), [res.data])
  return { ...res, data }
}

export function useFineTypes() {
  const { user } = useAuth()
  return useCollection<FineType>(() => (user ? query(collection(db, 'fineTypes'), orderBy('order')) : null), [user?.uid])
}

export function useFines() {
  const { user } = useAuth()
  return useCollection<Fine>(() => (user ? query(collection(db, 'fines'), orderBy('date', 'desc')) : null), [user?.uid])
}

export function useStatCategories() {
  const { user } = useAuth()
  return useCollection<StatCategory>(() => (user ? query(collection(db, 'statCategories'), orderBy('order')) : null), [user?.uid])
}

export function useStatEntries() {
  const { user } = useAuth()
  return useCollection<StatEntry>(() => (user ? query(collection(db, 'statEntries'), orderBy('date', 'desc')) : null), [user?.uid])
}

export function useStaffList() {
  const { isAdmin, user } = useAuth()
  return useCollection<StaffMember>(() => (isAdmin ? query(collection(db, 'staff'), orderBy('displayName')) : null), [isAdmin, user?.uid])
}

export function useActivity(limitTo = 300) {
  const { isStaff, user } = useAuth()
  return useCollection<ActivityLog>(
    () => (isStaff ? query(collection(db, 'activity'), orderBy('at', 'desc'), limit(limitTo)) : null),
    [isStaff, user?.uid, limitTo],
  )
}

/** Tous les buts de tous les matchs (rétrospective, accueil). */
export function useAllGoals() {
  const { user } = useAuth()
  return useCollection<Goal>(() => (user ? query(collection(db, 'goals')) : null), [user?.uid])
}

/** Tous les tickets envoyés de tous les matchs (rétrospective). */
export function useAllReadTickets() {
  const { user } = useAuth()
  return useCollection<Ticket>(() => (user ? query(collection(db, 'tickets'), where('status', '==', 'submitted')) : null), [user?.uid])
}

export function useAllLikes() {
  const { user } = useAuth()
  return useCollection<Like>(() => (user ? query(collection(db, 'likes')) : null), [user?.uid])
}
