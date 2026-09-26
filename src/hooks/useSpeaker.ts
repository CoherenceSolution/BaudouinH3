import { useAuth } from '@/auth/AuthProvider'
import { usePlayers } from './useData'

/**
 * Rôle d'orateur effectif sur cet appareil : le membre l'a pris (connexion ou page du match)
 * ET l'admin l'a inscrit dans la liste des orateurs (`players.canSpeak`).
 * Si l'admin le retire de la liste, la console disparaît aussitôt.
 */
export function useSpeaker() {
  const { identity } = useAuth()
  const players = usePlayers(true)
  const me = identity ? players.byId.get(identity.playerId) : undefined
  const canSpeak = Boolean(me?.canSpeak)
  return { canSpeak, isSpeaker: canSpeak && identity?.mode === 'speaker' }
}
