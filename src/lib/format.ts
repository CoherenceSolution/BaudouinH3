import type { Player, Match } from './types'

export function playerName(p: Player | undefined | null): string {
  if (!p) return 'Inconnu'
  return `${p.firstName} ${p.lastName}`.trim()
}

export function initials(p: Player | undefined | null): string {
  if (!p) return '?'
  return `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase()
}

export function formatDate(iso: string | undefined | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!iso) return ''
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-BE', opts).format(d)
}

export function formatDateTime(d: Date | undefined | null): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
}

export function todayIso(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function matchTitle(m: Match | undefined | null): string {
  if (!m) return ''
  return m.home ? `Baudouin H3 – ${m.opponent}` : `${m.opponent} – Baudouin H3`
}

export function matchScore(m: Match | undefined | null): string | null {
  if (!m || m.homeScore == null || m.awayScore == null) return null
  return `${m.homeScore} – ${m.awayScore}`
}

export function matchResult(m: Match | undefined | null): 'win' | 'loss' | 'draw' | null {
  if (!m || m.homeScore == null || m.awayScore == null) return null
  const ours = m.home ? m.homeScore : m.awayScore
  const theirs = m.home ? m.awayScore : m.homeScore
  if (ours > theirs) return 'win'
  if (ours < theirs) return 'loss'
  return 'draw'
}

export function seasonOf(iso: string): string {
  // Saison sportive : août -> juillet
  const d = new Date(iso + 'T12:00:00')
  const y = d.getFullYear()
  const start = d.getMonth() >= 7 ? y : y - 1
  return `${start}-${String(start + 1).slice(-2)}`
}

export function currentSeason(): string {
  return seasonOf(todayIso())
}

export function pluralize(n: number, singular: string, plural = singular + 's'): string {
  return `${n} ${n > 1 ? plural : singular}`
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
