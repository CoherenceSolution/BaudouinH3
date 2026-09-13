import type { Timestamp } from 'firebase/firestore'

export type Role = 'admin' | 'secretary'

export interface StaffMember {
  id: string
  email: string
  displayName: string
  role: Role
  /** Joueur de l'équipe auquel ce compte est relié (nom, avatar, votes). */
  playerId?: string | null
  /** Compte technique partagé des secrétaires (ouvert par le code PIN). */
  shared?: boolean
  createdAt?: Timestamp
}

/** config/secretaryAccess : compte technique courant des secrétaires. */
export interface SecretaryAccess {
  email: string
  uid: string
  updatedAt?: Timestamp
}

export interface Player {
  id: string
  firstName: string
  lastName: string
  /** Surnom du vestiaire : affiché partout à la place du nom, et reconnu à la connexion et dans les recherches. */
  nickname?: string | null
  active: boolean
  /** Droits accordés par l'admin : le membre qui se connecte sous ce nom devient secrétaire. */
  role?: 'secretary' | null
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
  /** Minuteur des votes : instant de fin affiché en compte à rebours (posé par le staff). */
  voteDeadline?: Timestamp | null
  /** Durée choisie pour le minuteur, en minutes (mémorisée pour le bouton « relancer »). */
  voteTimerMinutes?: number | null
  /** Nom de la personne qui a lancé le minuteur. */
  voteTimerBy?: string | null
  createdBy: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export type VoteCategory = 'best' | 'worst' | 'moment'

export const VOTE_CATEGORIES: VoteCategory[] = ['best', 'worst', 'moment']

export interface CategoryDef {
  key: VoteCategory
  label: string
  emoji: string
  /** true : on désigne un joueur (toutes les catégories aujourd'hui) */
  pickPlayer: boolean
}

/** Libellés par défaut ; modifiables par le staff dans Gestion → Paramètres (config/settings). */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { key: 'best', label: 'Meilleur joueur', emoji: '🏆', pickPlayer: true },
  { key: 'worst', label: 'Pire joueur', emoji: '🥴', pickPlayer: true },
  { key: 'moment', label: 'Geste marquant', emoji: '⚡', pickPlayer: true },
]

export interface Settings {
  categories?: Partial<Record<VoteCategory, { label?: string; emoji?: string }>>
  /** Nombre de voix dans une catégorie à partir duquel le direct signale un joueur. */
  liveAlertThreshold?: number
}

/** Seuil par défaut de l'alerte « ce joueur revient souvent » pendant la lecture. */
export const DEFAULT_LIVE_ALERT_THRESHOLD = 3

export interface VoteEntry {
  playerId: string | null
  proposal: string // conservé pour compatibilité, non utilisé dans le formulaire
  comment: string
  /** Le votant demande que l'orateur lise le commentaire avant d'annoncer le nom. */
  commentFirst?: boolean
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

/**
 * La coum : à chaque match, chacun paie la même chose. L'application ne suit que le geste,
 * pas l'argent : un document par joueur et par match, où le trésorier (staff) coche ce qu'il a reçu.
 * « Recoumer » = redemander une coum aux présents : `rounds` augmente d'une unité.
 */
export interface Coum {
  id: string // = `${matchId}_${playerId}`
  matchId: string
  playerId: string
  /** Nombre de coums demandées : 1 au départ, +1 à chaque recoum. */
  rounds: number
  /** Nombre de coums reçues par le trésorier. */
  paid: number
  /** Joueur absent : il ne doit rien pour ce match. */
  absent: boolean
  lastPaidAt?: Timestamp | null
  collectedBy?: string
  collectedByName?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
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
