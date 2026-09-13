import type { Goal, Like, Ticket, VoteCategory } from './types'

export interface RankRow {
  playerId: string
  count: number
}

/** Tickets envoyés et déjà lus par l'orateur : les seuls qui comptent dans les classements. */
export function readTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.status === 'submitted' && t.readAt != null)
}

export function submittedTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.status === 'submitted')
}

/** Nombre de catégories remplies (0 à 3) d'un ticket. */
export function ticketCompletion(t: Ticket): number {
  let n = 0
  if (t.best?.playerId) n++
  if (t.worst?.playerId) n++
  if (t.moment?.playerId) n++
  return n
}

export function isTicketComplete(t: Ticket): boolean {
  return ticketCompletion(t) === 3
}

/** Les catégories où le votant demande que le commentaire soit lu avant le nom. */
export function commentFirstPicks(t: Ticket): VoteCategory[] {
  return (['best', 'worst', 'moment'] as VoteCategory[]).filter((c) => t[c]?.commentFirst && t[c]?.playerId)
}

/** Classement des nominations (meilleur / pire joueur) sur un ensemble de tickets. */
export function nominationRanking(tickets: Ticket[], category: VoteCategory): RankRow[] {
  const counts = new Map<string, number>()
  for (const t of tickets) {
    const id = t[category]?.playerId
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts.entries()].map(([playerId, count]) => ({ playerId, count })).sort((a, b) => b.count - a.count)
}

export type LikeCounts = Map<string, Record<VoteCategory, number>>

export function likeCounts(likes: Like[]): LikeCounts {
  const m: LikeCounts = new Map()
  for (const l of likes) {
    const rec = m.get(l.ticketId) ?? { best: 0, worst: 0, moment: 0 }
    rec[l.category] = (rec[l.category] ?? 0) + 1
    m.set(l.ticketId, rec)
  }
  return m
}

export interface Duo {
  assistPlayerId: string
  scorerPlayerId: string
  count: number
}

export function goalTotals(goals: Goal[]): { scorers: RankRow[]; assisters: RankRow[]; duos: Duo[] } {
  const s = new Map<string, number>()
  const a = new Map<string, number>()
  const d = new Map<string, Duo>()
  for (const g of goals) {
    s.set(g.scorerPlayerId, (s.get(g.scorerPlayerId) ?? 0) + 1)
    if (g.assistPlayerId) {
      a.set(g.assistPlayerId, (a.get(g.assistPlayerId) ?? 0) + 1)
      const key = `${g.assistPlayerId}>${g.scorerPlayerId}`
      const cur = d.get(key) ?? { assistPlayerId: g.assistPlayerId, scorerPlayerId: g.scorerPlayerId, count: 0 }
      cur.count++
      d.set(key, cur)
    }
  }
  const toRows = (m: Map<string, number>) => [...m.entries()].map(([playerId, count]) => ({ playerId, count })).sort((x, y) => y.count - x.count)
  return { scorers: toRows(s), assisters: toRows(a), duos: [...d.values()].sort((x, y) => y.count - x.count) }
}
