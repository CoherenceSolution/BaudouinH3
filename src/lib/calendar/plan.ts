// Décide ce que la synchronisation doit faire (créer, mettre à jour, annuler) et le traduit en écritures.
// Pur et sans dépendance : le navigateur (bouton de l'admin) et la tâche quotidienne (firebase-admin)
// appliquent les mêmes écritures, chacun avec son SDK.
import { eventsToMatches, localParts, normalizeTeam, type FeedMatch } from './ical.ts'

/** Champs tenus à jour depuis l'agenda. Score, votes, coum, compétition… ne sont jamais touchés. */
export const SYNCED_FIELDS = ['date', 'time', 'opponent', 'home', 'venue', 'details', 'cancelled'] as const

type SyncedField = (typeof SYNCED_FIELDS)[number]
export type SyncedData = Pick<FeedMatch, SyncedField>

/** Match déjà présent dans l'application (seuls les champs utiles ici). */
export interface ExistingMatch extends Partial<SyncedData> {
  id: string
  date: string
  opponent: string
  status: string
  /** 'sportlink' pour un match importé ; absent pour un match saisi à la main. */
  source?: string
  externalId?: string
}

/** Lien vers l'agenda, ajouté quand un match est retrouvé sous un nouvel identifiant Sportlink. */
type Link = { externalId: string; source: 'sportlink' }

export interface SyncPlan {
  create: { id: string; data: SyncedData & { externalId: string } }[]
  update: { id: string; before: ExistingMatch; data: SyncedData & Partial<Link> }[]
  cancel: { id: string; before: ExistingMatch }[]
  /** Doublons laissés par d'anciennes synchronisations : à venir, annulés, jamais ouverts aux votes. */
  remove: { id: string; before: ExistingMatch }[]
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

/** Même jour, même adversaire : c'est le même match, quel que soit son identifiant. */
const sameMatchKey = (m: { date: string; opponent: string }) => `${m.date}|${normalizeTeam(m.opponent)}`
const sameOpponent = (a: { opponent: string; home?: boolean }, b: { opponent: string; home?: boolean }) =>
  normalizeTeam(a.opponent) === normalizeTeam(b.opponent) && Boolean(a.home) === Boolean(b.home)

/**
 * Compare l'agenda aux matchs de l'application et décide quoi écrire.
 *
 * Un événement est relié à un match existant, dans l'ordre :
 *   1. par son identifiant Sportlink (cas normal) ;
 *   2. par le même jour et le même adversaire : Sportlink change parfois l'identifiant de ses événements
 *      quand il republie l'agenda, et un match saisi à la main avant l'import est ainsi repris ;
 *   3. par le même adversaire (domicile / extérieur compris) s'il n'y a qu'un seul candidat : match déplacé.
 * Ainsi, l'agenda se met à jour sans jamais dupliquer ni annuler les matchs déjà connus.
 *
 * @param feed      matchs de l'agenda, avec leur identifiant (voir matchIdFor)
 * @param existing  matchs déjà présents (importés ou saisis à la main)
 * @param today     'YYYY-MM-DD' à Bruxelles
 */
export function planSync(feed: (FeedMatch & { id: string })[], existing: ExistingMatch[], today: string): SyncPlan {
  const byId = new Map(existing.map((m) => [m.id, m]))
  const byExternal = new Map(existing.filter((m) => m.externalId).map((m) => [m.externalId!, m]))
  const plan: SyncPlan = { create: [], update: [], cancel: [], remove: [] }

  // Dédoublonnage de l'agenda, puis matchs déjà reliés par leur identifiant.
  const events: (FeedMatch & { id: string })[] = []
  const claimed = new Set<string>()
  const direct = new Map<string, ExistingMatch>()
  for (const m of feed) {
    if (events.some((e) => e.id === m.id)) continue
    events.push(m)
    const found = byId.get(m.id) ?? byExternal.get(m.externalId)
    if (found && !claimed.has(found.id)) {
      claimed.add(found.id)
      direct.set(m.id, found)
    }
  }

  const free = (m: ExistingMatch) => !claimed.has(m.id) && m.date >= today
  const known = new Set<string>()
  for (const m of events) {
    // Les matchs passés ne sont ni importés ni modifiés : l'historique reste tel quel.
    if (m.date < today) continue
    let before = direct.get(m.id)
    if (!before) {
      before = existing.find((e) => free(e) && sameMatchKey(e) === sameMatchKey(m))
      if (!before) {
        const candidates = existing.filter((e) => free(e) && e.status === 'scheduled' && sameOpponent(e, m))
        if (candidates.length === 1) before = candidates[0]
      }
      if (before) claimed.add(before.id)
    }
    known.add(sameMatchKey(m))
    const data = pick(m)
    if (!before) {
      plan.create.push({ id: m.id, data: { ...data, externalId: m.externalId } })
      continue
    }
    const relink = before.externalId !== m.externalId || before.source !== 'sportlink'
    if (relink || SYNCED_FIELDS.some((k) => (before[k] ?? fallback(k)) !== data[k])) {
      plan.update.push({ id: before.id, before, data: relink ? { ...data, externalId: m.externalId, source: 'sportlink' } : data })
    }
  }

  // Un match à venir qui disparaît de l'agenda est marqué annulé (jamais supprimé : rien ne se perd),
  // mais seulement s'il tombe dans la période que couvre l'agenda : un agenda qui ne montre que les
  // prochaines semaines, ou qui revient vide, n'annule rien. Le jour même ou une fois les votes lancés,
  // on n'y touche plus. Les matchs saisis à la main ne sont jamais annulés.
  const dates = events.map((e) => e.date).sort()
  const [first, last] = [dates[0], dates.at(-1)]
  for (const m of existing) {
    if (m.source !== 'sportlink' || claimed.has(m.id) || m.date <= today || m.status !== 'scheduled') continue
    if (m.cancelled) {
      // Doublon d'un match bien présent dans l'agenda (ancien identifiant) : on le retire de la liste.
      if (known.has(sameMatchKey(m))) plan.remove.push({ id: m.id, before: m })
      continue
    }
    if (first && last && m.date >= first && m.date <= last) plan.cancel.push({ id: m.id, before: m })
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

const CHANGE_LABELS: [SyncedField, string][] = [
  ['date', 'Date'],
  ['time', 'Heure'],
  ['venue', 'Lieu'],
  ['opponent', 'Adversaire'],
  ['home', 'Domicile / extérieur'],
  ['details', 'Informations'],
  ['cancelled', 'Annulé'],
]

function changeValue(k: SyncedField, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (k === 'date') return shortDate(String(v))
  if (k === 'time') return String(v).replace(':', 'h')
  if (k === 'home') return v ? 'domicile' : 'extérieur'
  if (typeof v === 'boolean') return v ? 'oui' : 'non'
  return String(v)
}

/** Détail avant / après pour le journal d'activité (même forme que diffChanges dans lib/activity). */
export function describeChanges(before: ExistingMatch, data: SyncedData): { field: string; before: string; after: string }[] {
  return CHANGE_LABELS.map(([k, field]) => ({ field, before: changeValue(k, before[k] ?? fallback(k)), after: changeValue(k, data[k]) })).filter(
    (c) => c.before !== c.after,
  )
}

/** Bilan d'une synchronisation, enregistré dans config/calendar.lastSync. */
export interface SyncSummary {
  events: number
  created: number
  updated: number
  cancelled: number
  /** Doublons retirés (facultatif : absent des bilans enregistrés avant son ajout). */
  removed?: number
}

/** Lit l'agenda et prépare le plan, sans rien écrire. */
export async function prepareSync(ics: string, existing: ExistingMatch[], { teamKeyword, now = new Date() }: { teamKeyword?: string; now?: Date } = {}) {
  if (!ics.includes('BEGIN:VCALENDAR')) throw new Error('Le lien ne renvoie pas un agenda iCalendar')
  const feed = eventsToMatches(ics, { teamKeyword: teamKeyword || 'Baudouin' })
  const withIds = await Promise.all(feed.map(async (m) => ({ ...m, id: await matchIdFor(m.externalId) })))
  const plan = planSync(withIds, existing, localParts(now).date)
  const summary: SyncSummary = { events: feed.length, created: plan.create.length, updated: plan.update.length, cancelled: plan.cancel.length, removed: plan.remove.length }
  return { plan, summary }
}

/** Une écriture Firestore, indépendante du SDK. `now` est remplacé par l'horodatage serveur. */
export type SyncWrite =
  | { kind: 'set'; path: string; data: Record<string, unknown> }
  | { kind: 'update'; path: string; data: Record<string, unknown> }
  | { kind: 'add'; collection: string; data: Record<string, unknown> }
  | { kind: 'delete'; path: string }

export interface SyncActor {
  actorUid: string
  actorName: string
  actorRole: string
}

/** Le plan traduit en écritures : matchs, journal d'activité et bilan dans config/calendar. */
export function syncWrites(plan: SyncPlan, summary: SyncSummary, actor: SyncActor, now: unknown): SyncWrite[] {
  const writes: SyncWrite[] = []
  const log = (action: 'create' | 'update' | 'delete', entityId: string, text: string, changes?: ReturnType<typeof describeChanges>) =>
    writes.push({
      kind: 'add',
      collection: 'activity',
      data: { ...actor, action, entity: 'match', entityId, summary: text, ...(changes?.length ? { changes } : {}), at: now },
    })

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
    const changes = describeChanges(before, data)
    log('update', id, data.externalId && !changes.length ? `Match relié à l’agenda Sportlink : ${data.opponent} (${describeWhen(data)})` : describeUpdate(before, data), changes)
  }
  for (const { id, before } of plan.cancel) {
    writes.push({ kind: 'update', path: `matches/${id}`, data: { cancelled: true, updatedAt: now, syncedAt: now } })
    log('update', id, `Match retiré de l’agenda Sportlink, marqué annulé : ${before.opponent} (${describeWhen(before)})`, [{ field: 'Annulé', before: 'non', after: 'oui' }])
  }
  for (const { id, before } of plan.remove) {
    writes.push({ kind: 'delete', path: `matches/${id}` })
    log('delete', id, `Doublon retiré (ancienne copie de l’agenda) : ${before.opponent} (${describeWhen(before)})`)
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
    s.removed ? `${s.removed} doublon${s.removed > 1 ? 's' : ''} retiré${s.removed > 1 ? 's' : ''}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'aucun changement'
}
