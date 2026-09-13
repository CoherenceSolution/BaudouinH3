import type { Coum, Match, Player, Settings } from './types'
import { DEFAULT_COUM_AMOUNT } from './types'

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
  /** Nombre de coums encaissées. */
  paid: number
  absent: boolean
  state: CoumState
}

/** Montant de la coum pour un match : valeur du match, sinon paramètre global, sinon 10 €. */
export function coumAmountOf(match: Pick<Match, 'coumAmount'> | null | undefined, settings: Settings): number {
  const value = match?.coumAmount ?? settings.coum?.amount
  return typeof value === 'number' && value >= 0 ? value : DEFAULT_COUM_AMOUNT
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

/** Une ligne par joueur : ceux qui doivent encore d'abord, puis ceux qui ont payé, puis les absents. */
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
  /** Coums dues et encaissées, en nombre puis en euros. */
  roundsDue: number
  roundsPaid: number
  collected: number
  outstanding: number
  /** true dès qu'une coum supplémentaire a été demandée à quelqu'un. */
  recoumed: boolean
}

export function coumTotals(rows: CoumRow[], amount: number): CoumTotals {
  let present = 0
  let paidPlayers = 0
  let absent = 0
  let roundsDue = 0
  let roundsPaid = 0
  let recoumed = false
  for (const r of rows) {
    if (r.absent) {
      absent++
      // Un absent qui avait déjà payé garde sa coum au pot ; il ne doit rien de plus.
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
  return {
    present,
    paidPlayers,
    pendingPlayers: present - paidPlayers,
    absent,
    roundsDue,
    roundsPaid,
    collected: roundsPaid * amount,
    outstanding: Math.max(0, roundsDue - roundsPaid) * amount,
    recoumed,
  }
}

/** Résumé par joueur sur plusieurs matchs (page Amendes → onglet Coums). */
export interface CoumSeasonRow {
  playerId: string
  /** Montants en euros (le tarif peut changer d'un match à l'autre). */
  due: number
  paid: number
  coumsDue: number
  coumsPaid: number
  /** Matchs où le joueur doit encore quelque chose. */
  pendingMatches: number
  absentMatches: number
}

/**
 * Récapitulatif par joueur sur un ensemble de matchs, avec le tarif propre à chaque match.
 * Un joueur sans document pour un match doit la coum de base : c'est ce qu'affiche aussi la feuille du match.
 */
export function coumSeasonRows(players: Player[], matches: { id: string; amount: number }[], coums: Coum[]): CoumSeasonRow[] {
  const byKey = new Map(coums.map((c) => [coumId(c.matchId, c.playerId), c]))
  return players
    .map((player) => {
      const row: CoumSeasonRow = { playerId: player.id, due: 0, paid: 0, coumsDue: 0, coumsPaid: 0, pendingMatches: 0, absentMatches: 0 }
      for (const match of matches) {
        const { rounds, paid, absent } = normalize(byKey.get(coumId(match.id, player.id)))
        row.coumsPaid += paid
        row.paid += paid * match.amount
        if (absent) {
          row.absentMatches++
          // Ce qu'il a déjà mis au pot reste acquis, mais il ne doit rien de plus.
          row.coumsDue += paid
          row.due += paid * match.amount
          continue
        }
        row.coumsDue += rounds
        row.due += rounds * match.amount
        if (paid < rounds) row.pendingMatches++
      }
      return row
    })
    .sort((a, b) => b.due - b.paid - (a.due - a.paid) || b.paid - a.paid)
}

export function coumSeasonTotals(rows: CoumSeasonRow[]): { due: number; paid: number; outstanding: number } {
  const due = rows.reduce((s, r) => s + r.due, 0)
  const paid = rows.reduce((s, r) => s + r.paid, 0)
  return { due, paid, outstanding: Math.max(0, due - paid) }
}
