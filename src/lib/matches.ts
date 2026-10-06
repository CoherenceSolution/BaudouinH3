import type { Match } from './types'
import { normalize, todayIso } from './format'

/**
 * Un match « à venir » ouvre ses votes le jour même, sans geste de personne : l'état est déduit
 * de la date à la lecture. Dans la base, il reste « scheduled » jusqu'à ce que l'orateur lance la lecture.
 * Un match annulé dans l'agenda n'ouvre jamais ses votes.
 */
export function withEffectiveStatus(m: Match, today = todayIso()): Match {
  if (m.status === 'scheduled' && !m.cancelled && m.date <= today) return { ...m, status: 'voting' }
  return m
}

/** Match joué ou en cours : exclut les matchs à venir (statistiques, amendes, rétrospective). */
export function isPlayed(m: Match): boolean {
  return m.status !== 'scheduled'
}

/** Matchs à venir, du plus proche au plus lointain. */
export function upcomingMatches(matches: Match[], today = todayIso()): Match[] {
  return matches.filter((m) => m.status === 'scheduled' && m.date >= today).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
}

/**
 * « Match du jour » : les matchs joués aujourd'hui, plus celui d'hier soir dont les votes ou la lecture
 * se prolongent après minuit. Mis en avant en tête de la liste des matchs.
 */
export function todayMatches(matches: Match[], today = todayIso()): Match[] {
  const d = new Date(today + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  const yesterday = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
  return matches
    .filter((m) => m.date === today || (m.date === yesterday && (m.status === 'voting' || m.status === 'reading')))
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
}

/** « Demain », « Dans 5 jours », « Dans 3 semaines » : délai avant un match à venir. */
export function relativeDay(date: string, today = todayIso()): string {
  const days = Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86_400_000)
  if (days <= 0) return 'Aujourd’hui'
  if (days === 1) return 'Demain'
  if (days < 14) return `Dans ${days} jours`
  return `Dans ${Math.round(days / 7)} semaines`
}

/** Recherche dans la liste des matchs : adversaire, compétition, lieu (sans accents ni majuscules). */
export function matchMatchesQuery(m: Match, query: string): boolean {
  const q = normalize(query).trim()
  return !q || [m.opponent, m.competition, m.venue].some((f) => normalize(f ?? '').includes(q))
}

/** Prochain match qui aura bien lieu. */
export function nextMatch(matches: Match[], today = todayIso()): Match | undefined {
  return upcomingMatches(matches, today).find((m) => !m.cancelled)
}

/** État à la création d'un match saisi à la main : votes ouverts s'il a lieu aujourd'hui ou s'il est passé. */
export function initialStatus(date: string, today = todayIso()): Match['status'] {
  return date > today ? 'scheduled' : 'voting'
}

/** « 14h30 » */
export function formatTime(time: string | null | undefined): string {
  return time ? time.replace(':', 'h') : ''
}

/** Itinéraire Google Maps vers le lieu du match. */
export function mapsUrl(venue: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`
}
