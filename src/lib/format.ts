import type { Player, Match } from './types'

/** Nom d'état civil : « Bruno Huberty ». */
export function fullName(p: Player | undefined | null): string {
  if (!p) return 'Inconnu'
  return `${p.firstName} ${p.lastName}`.trim()
}

/** Surnom épuré, ou chaîne vide si le joueur n'en a pas. */
export function nickname(p: Player | undefined | null): string {
  return p?.nickname?.trim() ?? ''
}

/** Nom affiché partout dans l'application : le surnom s'il existe, sinon le nom complet. */
export function playerName(p: Player | undefined | null): string {
  return nickname(p) || fullName(p)
}

/** Nom complet à afficher en second, sous le surnom ; vide si le joueur n'a pas de surnom. */
export function playerRealName(p: Player | undefined | null): string {
  return nickname(p) ? fullName(p) : ''
}

/** « Bubu (Bruno Huberty) » pour les écrans de gestion, les journaux et les exports. */
export function playerFullLabel(p: Player | undefined | null): string {
  return nickname(p) ? `${nickname(p)} (${fullName(p)})` : fullName(p)
}

export function initials(p: Player | undefined | null): string {
  if (!p) return '?'
  const nick = nickname(p)
  if (nick) {
    const words = nick.split(/\s+/).filter(Boolean)
    return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : nick.slice(0, 2)).toUpperCase()
  }
  return `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase()
}

/** Minuscules, sans accents, espaces normalisés : « Jérôme  Fetu » → « jerome fetu ». */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Texte de recherche d'un joueur : prénom, nom et surnom, normalisés. */
export function playerSearchText(p: Player): string {
  return normalize(`${p.firstName} ${p.lastName} ${nickname(p)}`)
}

/** true si la saisie (nom, prénom ou surnom, même partiels) correspond au joueur. */
export function playerMatches(p: Player, query: string): boolean {
  const q = normalize(query)
  return !q || playerSearchText(p).includes(q)
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
