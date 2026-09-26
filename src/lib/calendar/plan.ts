// Décide ce que la synchronisation doit faire (créer, mettre à jour, annuler) et le traduit en écritures.
// Pur et sans dépendance : le navigateur (bouton de l'admin) et la tâche quotidienne (firebase-admin)
// appliquent les mêmes écritures, chacun avec son SDK.
import { eventsToMatches, localParts, type FeedMatch } from './ical.ts'

/** Champs tenus à jour depuis l'agenda. Score, votes, coum, compétition… ne sont jamais touchés. */
export const SYNCED_FIELDS = ['date', 'time', 'opponent', 'home', 'venue', 'details', 'cancelled'] as const

type SyncedField = (typeof SYNCED_FIELDS)[number]
export type SyncedData = Pick<FeedMatch, SyncedField>

/** Match Sportlink déjà présent dans l'application (seuls les champs utiles ici). */
export interface ExistingMatch extends Partial<SyncedData> {
  id: string
  date: string
  opponent: string
  status: string
}

export interface SyncPlan {
  create: { id: string; data: SyncedData & { externalId: string } }[]
  update: { id: string; before: ExistingMatch; data: SyncedData }[]
  cancel: { id: string; before: ExistingMatch }[]
}

/** Identifiant stable d'un match Sportlink, dérivé de l'UID de l'événement : « sl_ » + SHA-1 tronqué. */
export async function matchIdFor(externalId: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(externalId))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return 'sl_' + hex.slice(0, 20)
}

const fallback = (k: SyncedField) => (k === 'cancelled' ? false : null)

function pick(m: FeedMatch): SyncedData {
  return Object.fromEntries(SYNCED_FIELDS.map((k) => [k, m[k] ?? fallback(k)])) as SyncedData
}

/**
 * @param feed      matchs de l'agenda, avec leur identifiant (voir matchIdFor)
 * @param existing  matchs Sportlink déjà présents
 * @param today     'YYYY-MM-DD' à Bruxelles
 */
export function planSync(feed: (FeedMatch & { id: string })[], existing: ExistingMatch[], today: string): SyncPlan {
  const byId = new Map(existing.map((m) => [m.id, m]))
  const seen = new Set<string>()
  const plan: SyncPlan = { create: [], update: [], cancel: [] }

  for (const m of feed) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    const before = byId.get(m.id)
    // Les matchs passés ne sont ni importés ni modifiés : l'historique reste tel quel.
    if (m.date < today) continue
    const data = pick(m)
    if (!before) {
      plan.create.push({ id: m.id, data: { ...data, externalId: m.externalId } })
    } else if (SYNCED_FIELDS.some((k) => (before[k] ?? fallback(k)) !== data[k])) {
      plan.update.push({ id: m.id, before, data })
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
const shortDate = (iso: string) => FR_DATE.format(new Date(iso + 'T12:00:00Z'))

/** « 4 oct. 14h30 » */
export function describeWhen(m: { date: string; time?: string | null }): string {
  return `${shortDate(m.date)}${m.time ? ` ${m.time.replace(':', 'h')}` : ''}`
}

/** Phrase lisible pour le journal d'activité : « Match déplacé : Dragons H4 (4 oct. 14h30 → 11 oct. 12h00) ». */
export function describeUpdate(before: ExistingMatch, data: SyncedData): string {
  const moved = before.date !== data.date || (before.time ?? null) !== data.time
  const changes: string[] = []
  if (moved) changes.push(`${describeWhen(before)} → ${describeWhen(data)}`)
  if ((before.venue ?? null) !== data.venue) changes.push(`lieu : ${data.venue ?? '—'}`)
  if (before.opponent !== data.opponent || before.home !== data.home) changes.push(data.home ? 'à domicile' : 'à l’extérieur')
  if (Boolean(before.cancelled) !== data.cancelled) changes.push(data.cancelled ? 'annulé' : 'rétabli')
  return `${moved ? 'Match déplacé' : 'Match mis à jour'} : ${data.opponent}${changes.length ? ` (${changes.join(', ')})` : ''}`
}

/** Bilan d'une synchronisation, enregistré dans config/calendar.lastSync. */
export interface SyncSummary {
  events: number
  created: number
  updated: number
  cancelled: number
}

/** Lit l'agenda et prépare le plan, sans rien écrire. */
export async function prepareSync(ics: string, existing: ExistingMatch[], { teamKeyword, now = new Date() }: { teamKeyword?: string; now?: Date } = {}) {
  if (!ics.includes('BEGIN:VCALENDAR')) throw new Error('Le lien ne renvoie pas un agenda iCalendar')
  const feed = eventsToMatches(ics, { teamKeyword: teamKeyword || 'Baudouin' })
  const withIds = await Promise.all(feed.map(async (m) => ({ ...m, id: await matchIdFor(m.externalId) })))
  const plan = planSync(withIds, existing, localParts(now).date)
  const summary: SyncSummary = { events: feed.length, created: plan.create.length, updated: plan.update.length, cancelled: plan.cancel.length }
  return { plan, summary }
}

/** Une écriture Firestore, indépendante du SDK. `now` est remplacé par l'horodatage serveur. */
export type SyncWrite =
  | { kind: 'set'; path: string; data: Record<string, unknown> }
  | { kind: 'update'; path: string; data: Record<string, unknown> }
  | { kind: 'add'; collection: string; data: Record<string, unknown> }

export interface SyncActor {
  actorUid: string
  actorName: string
  actorRole: string
}

/** Le plan traduit en écritures : matchs, journal d'activité et bilan dans config/calendar. */
export function syncWrites(plan: SyncPlan, summary: SyncSummary, actor: SyncActor, now: unknown): SyncWrite[] {
  const writes: SyncWrite[] = []
  const log = (action: 'create' | 'update', entityId: string, text: string) =>
    writes.push({ kind: 'add', collection: 'activity', data: { ...actor, action, entity: 'match', entityId, summary: text, at: now } })

  for (const { id, data } of plan.create) {
    writes.push({
      kind: 'set',
      path: `matches/${id}`,
      data: { ...data, source: 'sportlink', competition: '', homeScore: null, awayScore: null, status: 'scheduled', createdBy: 'sportlink', createdAt: now, updatedAt: now, syncedAt: now },
    })
    log('create', id, `Match importé de Sportlink : ${data.opponent} (${describeWhen(data)})`)
  }
  for (const { id, before, data } of plan.update) {
    writes.push({ kind: 'update', path: `matches/${id}`, data: { ...data, updatedAt: now, syncedAt: now } })
    log('update', id, describeUpdate(before, data))
  }
  for (const { id, before } of plan.cancel) {
    writes.push({ kind: 'update', path: `matches/${id}`, data: { cancelled: true, updatedAt: now, syncedAt: now } })
    log('update', id, `Match retiré de l’agenda Sportlink, marqué annulé : ${before.opponent} (${describeWhen(before)})`)
  }
  writes.push({ kind: 'set', path: 'config/calendar', data: { lastSync: { at: now, ok: true, by: actor.actorName, ...summary, error: null } } })
  return writes
}

/** Phrase de bilan : « 2 matchs ajoutés, 1 mis à jour » ou « Aucun changement ». */
export function describeSummary(s: Partial<SyncSummary>): string {
  const parts = [
    s.created ? `${s.created} match${s.created > 1 ? 's' : ''} ajouté${s.created > 1 ? 's' : ''}` : '',
    s.updated ? `${s.updated} mis à jour` : '',
    s.cancelled ? `${s.cancelled} annulé${s.cancelled > 1 ? 's' : ''}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'aucun changement'
}
