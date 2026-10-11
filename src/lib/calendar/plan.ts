// Décide ce que la synchronisation doit faire (créer, mettre à jour, annuler) et le traduit en écritures.
// Pur et sans dépendance : le navigateur (bouton de l'admin) et la tâche quotidienne (firebase-admin)
// appliquent les mêmes écritures, chacun avec son SDK.
import { eventsToMatches, localParts, normalizeTeam, parseTeams, type FeedMatch } from './ical.ts'

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
  cancelled?: boolean
}

export interface SyncPlan {
  create: { id: string; data: SyncedData & { externalId: string } }[]
  update: { id: string; before: ExistingMatch; data: SyncedData }[]
  cancel: { id: string; before: ExistingMatch }[]
  /** Doublons laissés par les anciennes synchronisations : annulés, sans votes, remplacés par un autre match. */
  purge: { id: string; before: ExistingMatch }[]
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
 * Clé « naturelle » d'un match : adversaire + domicile/extérieur.
 * Sportlink change l'UID de ses événements à chaque lecture de l'agenda : l'UID seul ne suffit donc pas
 * à reconnaître un match. Les anciens imports gardaient le titre entier comme adversaire
 * (« Baudouin H-3-Rapid H-3 ») : il est relu pour retrouver la même clé.
 */
export function matchKey(m: { opponent?: string | null; home?: boolean | null }, teamKeyword = 'Baudouin'): string {
  let opponent = String(m.opponent ?? '')
  let home = m.home !== false
  const key = normalizeTeam(teamKeyword)
  if (key && normalizeTeam(opponent).includes(key)) ({ opponent, home } = parseTeams(opponent, teamKeyword))
  return `${home ? 'dom' : 'ext'}|${normalizeTeam(opponent)}`
}

const dayNumber = (iso: string) => Date.parse(iso + 'T12:00:00Z') / 86_400_000

/**
 * @param feed      matchs de l'agenda, avec leur identifiant (voir matchIdFor)
 * @param existing  matchs Sportlink déjà présents
 * @param today     'YYYY-MM-DD' à Bruxelles
 */
export function planSync(feed: (FeedMatch & { id: string })[], existing: ExistingMatch[], today: string, { teamKeyword = 'Baudouin' } = {}): SyncPlan {
  const plan: SyncPlan = { create: [], update: [], cancel: [], purge: [] }
  const keyOf = (m: { opponent?: string | null; home?: boolean | null }) => matchKey(m, teamKeyword)
  const unclaimed = new Map(existing.map((m) => [m.id, m]))
  const claimed = new Set<string>()
  const events = [...new Map(feed.map((m) => [m.id, m])).values()]
  const pairs = new Map<FeedMatch & { id: string }, ExistingMatch | undefined>()

  // 1. Même UID qu'à la lecture précédente.
  for (const m of events) {
    const before = unclaimed.get(m.id)
    if (!before) continue
    unclaimed.delete(m.id)
    pairs.set(m, before)
  }
  // 2. Sinon, même adversaire et même terrain (domicile / extérieur). Parmi plusieurs candidats, on garde
  //    d'abord celui dont les votes ont commencé, puis celui qui n'est pas annulé, puis la date la plus proche.
  for (const m of events) {
    if (pairs.has(m)) continue
    const key = keyOf(m)
    const rank = (e: ExistingMatch) => [e.status !== 'scheduled' ? 0 : 1, e.cancelled ? 1 : 0, Math.abs(dayNumber(e.date) - dayNumber(m.date))]
    const candidates = [...unclaimed.values()].filter((e) => keyOf(e) === key)
    candidates.sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || a.id.localeCompare(b.id)
    })
    const before = candidates[0]
    if (before) unclaimed.delete(before.id)
    pairs.set(m, before)
  }

  for (const m of events) {
    const before = pairs.get(m)
    if (before) claimed.add(before.id)
    // Les matchs passés ne sont ni importés ni modifiés : l'historique reste tel quel.
    if (m.date < today) continue
    const data = pick(m)
    if (!before) {
      // Identifiant déjà pris par un autre match : on ne l'écrase jamais.
      if (existing.some((e) => e.id === m.id)) continue
      plan.create.push({ id: m.id, data: { ...data, externalId: m.externalId } })
    } else if (SYNCED_FIELDS.some((k) => (before[k] ?? fallback(k)) !== data[k])) {
      plan.update.push({ id: before.id, before, data })
    }
  }

  // Un match à venir qui disparaît de l'agenda est marqué annulé (jamais supprimé : rien ne se perd).
  // Le jour même ou une fois les votes lancés, on n'y touche plus. Un agenda vide (lien expiré, erreur de
  // Sportlink) n'annule rien.
  if (events.length > 0) {
    for (const m of unclaimed.values()) {
      if (m.cancelled || m.date <= today || m.status !== 'scheduled') continue
      plan.cancel.push({ id: m.id, before: m })
    }
  }

  // Doublons des anciennes synchronisations : un match annulé, jamais ouvert aux votes, dont l'adversaire
  // et le terrain sont déjà portés par un autre match que l'on garde.
  const kept = new Set(existing.filter((e) => claimed.has(e.id) || !e.cancelled || e.status !== 'scheduled').map(keyOf))
  for (const m of unclaimed.values()) {
    if (m.cancelled && m.status === 'scheduled' && kept.has(keyOf(m))) plan.purge.push({ id: m.id, before: m })
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
  /** Doublons supprimés. */
  removed: number
}

/** Lit l'agenda et prépare le plan, sans rien écrire. */
/**
 * @param referenced  parmi ces matchs, ceux qui portent déjà des données (votes, coum, buts, amendes…) :
 *                    ils ne sont jamais supprimés comme doublons.
 */
export async function prepareSync(
  ics: string,
  existing: ExistingMatch[],
  { teamKeyword, now = new Date(), referenced }: { teamKeyword?: string; now?: Date; referenced?: (ids: string[]) => Promise<Set<string>> } = {},
) {
  if (!ics.includes('BEGIN:VCALENDAR')) throw new Error('Le lien ne renvoie pas un agenda iCalendar')
  const keyword = teamKeyword || 'Baudouin'
  const feed = eventsToMatches(ics, { teamKeyword: keyword })
  const withIds = await Promise.all(feed.map(async (m) => ({ ...m, id: await matchIdFor(m.externalId) })))
  const plan = planSync(withIds, existing, localParts(now).date, { teamKeyword: keyword })
  if (plan.purge.length) {
    // Sans moyen de vérifier, on ne supprime rien.
    const used = referenced ? await referenced(plan.purge.map((p) => p.id)) : new Set(plan.purge.map((p) => p.id))
    plan.purge = plan.purge.filter((p) => !used.has(p.id))
  }
  const summary: SyncSummary = { events: feed.length, created: plan.create.length, updated: plan.update.length, cancelled: plan.cancel.length, removed: plan.purge.length }
  return { plan, summary }
}

/** Collections qui rattachent des données à un match : un match qui en porte n'est jamais supprimé. */
export const LINKED_COLLECTIONS = ['tickets', 'likes', 'coums', 'goals', 'fines', 'statEntries'] as const

/** Découpe une liste en paquets (requêtes « in » limitées à 30 valeurs, lots d'écritures à 500). */
export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
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
    log('update', id, describeUpdate(before, data), describeChanges(before, data))
  }
  for (const { id, before } of plan.cancel) {
    writes.push({ kind: 'update', path: `matches/${id}`, data: { cancelled: true, updatedAt: now, syncedAt: now } })
    log('update', id, `Match retiré de l’agenda Sportlink, marqué annulé : ${before.opponent} (${describeWhen(before)})`, [{ field: 'Annulé', before: 'non', after: 'oui' }])
  }
  for (const { id } of plan.purge) writes.push({ kind: 'delete', path: `matches/${id}` })
  if (plan.purge.length) {
    const n = plan.purge.length
    log('delete', 'sportlink', `${n} doublon${n > 1 ? 's' : ''} de l’agenda Sportlink supprimé${n > 1 ? 's' : ''} (matchs annulés en double, sans votes)`)
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
    s.removed ? `${s.removed} doublon${s.removed > 1 ? 's' : ''} supprimé${s.removed > 1 ? 's' : ''}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'aucun changement'
}
