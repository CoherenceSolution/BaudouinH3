import type { Match } from './types'
import { todayIso } from './format'

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
