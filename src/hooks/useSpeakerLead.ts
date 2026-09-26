import { useCallback } from 'react'
import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { logActivity } from '@/lib/activity'
import type { Match, Player, SpeakerTakeover } from '@/lib/types'
import { playerName } from '@/lib/format'
import { useActor } from './useActor'

/**
 * L'appareil tient-il la main sur la lecture de ce match ?
 * Uid Firebase ET joueur : le compte technique des secrétaires est partagé entre plusieurs personnes.
 * (Les matchs lus avant l'introduction de `speakerPlayerId` se contentent de l'uid.)
 */
export function holdsLead(match: Pick<Match, 'speakerUid' | 'speakerPlayerId'>, uid: string | null | undefined, playerId: string | null | undefined): boolean {
  if (!uid || !match.speakerUid || match.speakerUid !== uid) return false
  return !match.speakerPlayerId || match.speakerPlayerId === (playerId ?? null)
}

/** Prise de main dont cet appareil a fait les frais, s'il ne l'a pas reprise depuis. */
export function takeoverFor(match: Match, uid: string | null | undefined, playerId: string | null | undefined): SpeakerTakeover | null {
  const t = match.speakerTakeover
  if (!t || !uid || t.uid !== uid || (t.playerId ?? null) !== (playerId ?? null)) return null
  if (holdsLead(match, uid, playerId)) return null
  return t
}

/**
 * Orateur en cours d'un match : une seule personne à la fois « a la main ».
 * Elle seule, avec l'admin, peut consulter le nom des votants. Quelqu'un d'autre peut prendre
 * la main : l'ancien orateur perd l'accès aux noms et en est informé sur son appareil.
 */
export function useSpeakerLead(match: Match, players: Map<string, Player>) {
  const { user, identity, isAdmin } = useAuth()
  const actor = useActor()
  const uid = user?.uid ?? null
  const playerId = identity?.playerId ?? null
  // Nom du joueur, pas celui du compte (le compte des secrétaires est commun).
  const me = playerId ? players.get(playerId) : undefined
  const myName = me ? playerName(me) : actor.name
  const isLead = holdsLead(match, uid, playerId)
  const hasLead = Boolean(match.speakerUid)

  /**
   * Prend la main. Sans `force`, seulement si personne ne l'a (retourne false sinon).
   * Avec `force`, la prend à l'orateur en cours, qui en sera informé.
   */
  const claim = useCallback(
    async (force = false): Promise<boolean> => {
      if (!uid) return false
      const ref = doc(db, 'matches', match.id)
      const previous = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists()) return false
        const cur = snap.data() as Match
        if (holdsLead(cur, uid, playerId)) return null
        const taken = Boolean(cur.speakerUid)
        if (taken && !force) return false
        const patch: Record<string, unknown> = {
          speakerUid: uid,
          speakerPlayerId: playerId,
          speakerName: myName,
          speakerSince: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
        if (taken) {
          patch.speakerTakeover = {
            uid: cur.speakerUid,
            playerId: cur.speakerPlayerId ?? null,
            name: cur.speakerName ?? 'L’orateur',
            byName: myName,
            at: Timestamp.now(),
          }
        }
        tx.update(ref, patch)
        return taken ? (cur.speakerName ?? 'l’orateur') : ''
      })
      if (previous === false) return false
      if (previous === null) return true
      await logActivity(actor, 'update', 'match', match.id, previous ? `${myName} a pris la main sur l’orateur ${previous}` : `${myName} est l’orateur en cours`)
      return true
    },
    [uid, playerId, actor, myName, match.id],
  )

  /** Rend la main (« Je ne suis plus l'orateur »). Sans effet si quelqu'un d'autre l'a. */
  const release = useCallback(async () => {
    if (!uid) return
    const ref = doc(db, 'matches', match.id)
    const released = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists() || !holdsLead(snap.data() as Match, uid, playerId)) return false
      tx.update(ref, { speakerUid: null, speakerPlayerId: null, speakerName: null, speakerSince: null, updatedAt: serverTimestamp() })
      return true
    })
    if (released) await logActivity(actor, 'update', 'match', match.id, `${myName} n’est plus l’orateur en cours`)
  }, [uid, playerId, actor, myName, match.id])

  return {
    /** Cet appareil a la main. */
    isLead,
    /** Quelqu'un (peut-être cet appareil) a la main. */
    hasLead,
    leadName: match.speakerName ?? null,
    /** Seuls l'orateur en cours et l'admin voient le nom des votants. */
    canSeeNames: isLead || isAdmin,
    /** Prise de main subie par cet appareil, à lui signaler. */
    takeover: takeoverFor(match, uid, playerId),
    claim,
    release,
  }
}
