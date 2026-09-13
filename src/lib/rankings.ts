import type { Goal, Like, Ticket, VoteCategory } from './types'
import { VOTE_CATEGORIES } from './types'

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

/** Classement des nominations (meilleur / pire joueur) sur un ensemble de tickets. */
export function nominationRanking(tickets: Ticket[], category: VoteCategory): RankRow[] {
  const counts = new Map<string, number>()
  for (const t of tickets) {
    const id = t[category]?.playerId
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts.entries()].map(([playerId, count]) => ({ playerId, count })).sort((a, b) => b.count - a.count)
}

/** Un joueur qui atteint le seuil de voix dans une catégorie pendant la lecture. */
export interface NominationAlert {
  category: VoteCategory
  playerId: string
  count: number
}

export interface NominationProgress {
  /** Voix par catégorie et par joueur sur les votes déjà lus. */
  counts: Record<VoteCategory, Map<string, number>>
  /** Voix du joueur désigné au moment de cette lecture : clé `${ticketId}:${category}`. */
  running: Map<string, number>
  /** Joueurs ayant atteint le seuil (3 voix par défaut), du plus cité au moins cité. */
  alerts: NominationAlert[]
}

/**
 * Décompte des nominations au fil des lectures : permet d'indiquer en direct
 * qu'un joueur vient d'atteindre 3 voix dans une catégorie.
 */
export function nominationProgress(tickets: Ticket[], threshold: number): NominationProgress {
  const counts: Record<VoteCategory, Map<string, number>> = { best: new Map(), worst: new Map(), moment: new Map() }
  const running = new Map<string, number>()
  const ordered = [...tickets].sort((a, b) => (a.readAt?.toMillis() ?? 0) - (b.readAt?.toMillis() ?? 0))
  for (const t of ordered) {
    for (const category of VOTE_CATEGORIES) {
      const playerId = t[category]?.playerId
      if (!playerId) continue
      const n = (counts[category].get(playerId) ?? 0) + 1
      counts[category].set(playerId, n)
      running.set(`${t.id}:${category}`, n)
    }
  }
  const alerts: NominationAlert[] = []
  for (const category of VOTE_CATEGORIES) {
    for (const [playerId, count] of counts[category]) {
      if (count >= threshold) alerts.push({ category, playerId, count })
    }
  }
  alerts.sort((a, b) => b.count - a.count || VOTE_CATEGORIES.indexOf(a.category) - VOTE_CATEGORIES.indexOf(b.category))
  return { counts, running, alerts }
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
