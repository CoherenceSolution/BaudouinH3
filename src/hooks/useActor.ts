import { useAuth } from '@/auth/AuthProvider'
import { usePlayers } from './useData'
import type { Actor } from '@/lib/activity'

export function useActor(): Actor {
  const { actorFor } = useAuth()
  const players = usePlayers(true)
  return actorFor(players.data)
}
