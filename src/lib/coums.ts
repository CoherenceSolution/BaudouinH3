import type { Coum, Player } from './types'

/** Identifiant d'une coum : un document par joueur et par match. */
export function coumId(matchId: string, playerId: string): string {
  return `${matchId}_${playerId}`
}

export type CoumState = 'paid' | 'pending' | 'absent'

export interface CoumRow {
  player: Player
  coum: Coum | undefined
  /** Nombre de coums demandées (au moins une tant que le joueur n'est pas absent). */
  rounds: number
  /** Nombre de coums reçues par le trésorier. */
  paid: number
  absent: boolean
  state: CoumState
}

function normalize(c: Coum | undefined): { rounds: number; paid: number; absent: boolean } {
  const rounds = Math.max(1, Math.round(c?.rounds ?? 1))
  const paid = Math.min(rounds, Math.max(0, Math.round(c?.paid ?? 0)))
  return { rounds, paid, absent: Boolean(c?.absent) }
}

export function coumState(c: Coum | undefined): CoumState {
  const { rounds, paid, absent } = normalize(c)
  if (absent) return 'absent'
  return paid >= rounds ? 'paid' : 'pending'
}

const stateOrder: Record<CoumState, number> = { pending: 0, paid: 1, absent: 2 }

/** Une ligne par joueur : ceux qui doivent encore d'abord, puis ceux qui ont coumé, puis les absents. */
export function coumRows(players: Player[], coums: Coum[], compareNames: (a: Player, b: Player) => number): CoumRow[] {
  const byPlayer = new Map(coums.map((c) => [c.playerId, c]))
  return players
    .map((player) => {
      const coum = byPlayer.get(player.id)
      const { rounds, paid, absent } = normalize(coum)
      return { player, coum, rounds, paid, absent, state: coumState(coum) }
    })
    .sort((a, b) => stateOrder[a.state] - stateOrder[b.state] || compareNames(a.player, b.player))
}

export interface CoumTotals {
  /** Joueurs présents (non marqués absents). */
  present: number
  paidPlayers: number
  pendingPlayers: number
  absent: number
  /** Coums demandées et reçues (le compte dépasse le nombre de joueurs après une recoum). */
  roundsDue: number
  roundsPaid: number
  /** true dès qu'une coum supplémentaire a été demandée à quelqu'un. */
  recoumed: boolean
}

export function coumTotals(rows: CoumRow[]): CoumTotals {
  let present = 0
  let paidPlayers = 0
  let absent = 0
  let roundsDue = 0
  let roundsPaid = 0
  let recoumed = false
  for (const r of rows) {
    if (r.absent) {
      absent++
      // Un absent qui avait déjà coumé garde sa coum ; il ne doit rien de plus.
      roundsDue += r.paid
      roundsPaid += r.paid
      continue
    }
    present++
    if (r.state === 'paid') paidPlayers++
    if (r.rounds > 1) recoumed = true
    roundsDue += r.rounds
    roundsPaid += r.paid
  }
  return { present, paidPlayers, pendingPlayers: present - paidPlayers, absent, roundsDue, roundsPaid, recoumed }
}
