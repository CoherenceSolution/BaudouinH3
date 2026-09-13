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

/** Résumé par joueur sur plusieurs matchs (page Amendes → onglet Coums). */
export interface CoumSeasonRow {
  playerId: string
  /** Coums demandées et coums reçues sur la période. */
  due: number
  paid: number
  /** Matchs où le joueur doit encore sa coum, et matchs où il était absent. */
  pendingMatches: number
  absentMatches: number
}

/**
 * Récapitulatif par joueur sur un ensemble de matchs.
 * Un joueur sans document pour un match doit la coum de base : c'est ce qu'affiche aussi la feuille du match.
 */
export function coumSeasonRows(players: Player[], matchIds: string[], coums: Coum[]): CoumSeasonRow[] {
  const byKey = new Map(coums.map((c) => [coumId(c.matchId, c.playerId), c]))
  return players
    .map((player) => {
      const row: CoumSeasonRow = { playerId: player.id, due: 0, paid: 0, pendingMatches: 0, absentMatches: 0 }
      for (const matchId of matchIds) {
        const { rounds, paid, absent } = normalize(byKey.get(coumId(matchId, player.id)))
        row.paid += paid
        if (absent) {
          row.absentMatches++
          // Ce qu'il a déjà coumé reste acquis, mais il ne doit rien de plus.
          row.due += paid
          continue
        }
        row.due += rounds
        if (paid < rounds) row.pendingMatches++
      }
      return row
    })
    .sort((a, b) => b.due - b.paid - (a.due - a.paid) || b.paid - a.paid)
}

export function coumSeasonTotals(rows: CoumSeasonRow[]): { due: number; paid: number; pending: number } {
  const due = rows.reduce((s, r) => s + r.due, 0)
  const paid = rows.reduce((s, r) => s + r.paid, 0)
  return { due, paid, pending: Math.max(0, due - paid) }
}
