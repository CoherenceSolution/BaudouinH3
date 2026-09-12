import type { Timestamp } from 'firebase/firestore'

export type Role = 'admin' | 'secretary'

export interface StaffMember {
  id: string
  email: string
  displayName: string
  role: Role
  createdAt?: Timestamp
}

export interface Player {
  id: string
  firstName: string
  lastName: string
  active: boolean
  createdAt?: Timestamp
}

export type MatchStatus = 'voting' | 'reading' | 'closed'

export interface Match {
  id: string
  date: string // YYYY-MM-DD
  opponent: string
  competition?: string
  homeScore: number | null
  awayScore: number | null
  home: boolean // Baudouin H3 joue à domicile
  status: MatchStatus
  speakerName?: string | null
  speakerUid?: string | null
  readingStartedAt?: Timestamp | null
  closedAt?: Timestamp | null
  createdBy: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export type VoteCategory = 'best' | 'worst' | 'moment'

export const VOTE_CATEGORIES: { key: VoteCategory; label: string; short: string; emoji: string }[] = [
  { key: 'best', label: 'Meilleur joueur', short: 'Meilleur', emoji: '🏆' },
  { key: 'worst', label: 'Pire joueur', short: 'Pire', emoji: '🥴' },
  { key: 'moment', label: 'Geste marquant', short: 'Geste', emoji: '⚡' },
]

export interface VoteEntry {
  playerId: string | null
  proposal: string // pour "moment" : description du geste ; pour best/worst : libre (optionnel)
  comment: string
}

export type TicketStatus = 'draft' | 'submitted'

export interface Ticket {
  id: string // = `${matchId}_${authorPlayerId}`
  matchId: string
  authorPlayerId: string
  coAuthorPlayerId: string | null
  authorUids: string[]
  best: VoteEntry
  worst: VoteEntry
  moment: VoteEntry
  status: TicketStatus
  readAt: Timestamp | null
  readOrder: number | null
  starred: boolean
  saved: boolean
  revealAuthor: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface Like {
  id: string // `${matchId}_${voterPlayerId}_${category}`
  matchId: string
  voterPlayerId: string
  category: VoteCategory
  ticketId: string
  createdAt?: Timestamp
}

export type FineKind = 'fixed' | 'perUnit'

export interface FineType {
  id: string
  label: string
  description?: string
  kind: FineKind
  amount: number // montant fixe, ou montant par unité
  unitLabel?: string // ex : "minute"
  freeUnits?: number // ex : 5 premières minutes offertes
  cap?: number | null // plafond
  active: boolean
  order: number
  createdAt?: Timestamp
}

export interface Fine {
  id: string
  playerId: string
  fineTypeId: string
  label: string
  matchId: string | null
  date: string
  quantity: number | null
  amount: number
  note: string
  paid: boolean
  paidAt?: Timestamp | null
  createdBy: string
  createdByName: string
  createdAt?: Timestamp
}

export interface Goal {
  id: string
  matchId: string
  scorerPlayerId: string
  assistPlayerId: string | null
  minute: number | null
  order: number
  createdAt?: Timestamp
}

export interface StatCategory {
  id: string
  label: string
  emoji: string
  active: boolean
  order: number
}

export interface StatEntry {
  id: string
  categoryId: string
  playerId: string
  matchId: string | null
  date: string
  value: number
  note: string
  createdBy: string
  createdAt?: Timestamp
}

export type ActivityAction = 'create' | 'update' | 'delete'

export interface ActivityLog {
  id: string
  actorUid: string
  actorName: string
  actorRole: Role | 'public' | 'speaker'
  action: ActivityAction
  entity: string
  entityId: string
  summary: string
  at: Timestamp
}
