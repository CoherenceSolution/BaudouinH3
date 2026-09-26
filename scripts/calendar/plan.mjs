// Décide, sans rien écrire, ce que la synchronisation doit faire : créer, mettre à jour, annuler.
// Séparé de l'accès à Firestore pour pouvoir être testé.
import { createHash } from 'node:crypto'

/** Champs tenus à jour depuis l'agenda. Score, votes, coum, compétition… ne sont jamais touchés. */
export const SYNCED_FIELDS = ['date', 'time', 'opponent', 'home', 'venue', 'details', 'cancelled']

/** Identifiant stable d'un match Sportlink, dérivé de l'UID de l'événement. */
export function matchIdFor(externalId) {
  return 'sl_' + createHash('sha1').update(externalId).digest('hex').slice(0, 20)
}

function pick(m) {
  return Object.fromEntries(SYNCED_FIELDS.map((k) => [k, m[k] ?? (k === 'cancelled' ? false : null)]))
}

/**
 * @param feed      matchs lus dans l'agenda (eventsToMatches)
 * @param existing  matchs Sportlink déjà présents : [{ id, ...données }]
 * @param today     'YYYY-MM-DD' à Bruxelles
 * @returns { create: [{id, data}], update: [{id, before, data}], cancel: [{id, before}] }
 */
export function planSync(feed, existing, today) {
  const byId = new Map(existing.map((m) => [m.id, m]))
  const seen = new Set()
  const plan = { create: [], update: [], cancel: [] }

  for (const m of feed) {
    const id = matchIdFor(m.externalId)
    if (seen.has(id)) continue
    seen.add(id)
    const before = byId.get(id)
    // Les matchs passés ne sont ni importés ni modifiés : l'historique reste tel quel.
    if (m.date < today) continue
    const data = pick(m)
    if (!before) {
      plan.create.push({ id, data: { ...data, externalId: m.externalId } })
    } else if (SYNCED_FIELDS.some((k) => (before[k] ?? (k === 'cancelled' ? false : null)) !== data[k])) {
      plan.update.push({ id, before, data })
    }
  }

  // Un match à venir qui disparaît de l'agenda est marqué annulé (jamais supprimé : rien ne se perd).
  // Le jour même ou une fois les votes lancés, on n'y touche plus.
  for (const m of existing) {
    if (seen.has(m.id) || m.cancelled || m.date <= today || m.status !== 'scheduled') continue
    plan.cancel.push({ id: m.id, before: m })
  }
  return plan
}

const FR_DATE = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortDate = (iso) => FR_DATE.format(new Date(iso + 'T12:00:00Z'))
const when = (m) => `${shortDate(m.date)}${m.time ? ` ${m.time.replace(':', 'h')}` : ''}`

/** Phrase lisible pour le journal d'activité : « Match déplacé : Dragons H4 (4 oct. 14h30 → 11 oct. 12h00) ». */
export function describeUpdate(before, data) {
  const changes = []
  if (before.date !== data.date || (before.time ?? null) !== data.time) changes.push(`${when(before)} → ${when(data)}`)
  if ((before.venue ?? null) !== data.venue) changes.push(`lieu : ${data.venue ?? '—'}`)
  if (before.opponent !== data.opponent || before.home !== data.home) changes.push(data.home ? 'à domicile' : 'à l’extérieur')
  if (Boolean(before.cancelled) !== data.cancelled) changes.push(data.cancelled ? 'annulé' : 'rétabli')
  const moved = before.date !== data.date || (before.time ?? null) !== data.time
  return `${moved ? 'Match déplacé' : 'Match mis à jour'} : ${data.opponent}${changes.length ? ` (${changes.join(', ')})` : ''}`
}

export { when as describeWhen }
