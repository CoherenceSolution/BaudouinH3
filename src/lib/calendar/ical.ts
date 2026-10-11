// Lecture d'un agenda iCalendar (.ics), tel que Sportlink le publie, et conversion en matchs.
// Module pur, sans dépendance : partagé par le bouton « Mettre à jour » (navigateur),
// la synchronisation quotidienne (scripts/calendar/sync.mjs) et les tests.
// Syntaxe TypeScript « effaçable » uniquement : Node l'exécute directement.

export const TIME_ZONE = 'Europe/Brussels'

interface Prop {
  value: string
  params: Record<string, string>
}

type RawEvent = Record<string, Prop>

/** Match tel que décrit par l'agenda. */
export interface FeedMatch {
  externalId: string
  date: string
  time: string | null
  opponent: string
  home: boolean
  venue: string | null
  details: string | null
  cancelled: boolean
  summary: string
}

/** Déplie les lignes longues (RFC 5545 : une ligne qui commence par un espace prolonge la précédente). */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim()
}

/** Premier « : » hors guillemets (un paramètre peut contenir « : » entre guillemets). */
function findValueColon(line: string): number {
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted
    else if (line[i] === ':' && !quoted) return i
  }
  return -1
}

/** « DTSTART;TZID=Europe/Brussels:20261004T143000 » → { name, params, value }. */
function parseLine(line: string): (Prop & { name: string }) | null {
  const colon = findValueColon(line)
  if (colon < 0) return null
  const [name, ...rawParams] = line.slice(0, colon).split(';')
  const params: Record<string, string> = {}
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) }
}

/** Événements bruts : une liste de { UID, SUMMARY, DTSTART: {value, params}, … }. */
export function parseEvents(text: string): RawEvent[] {
  const events: RawEvent[] = []
  let current: RawEvent | null = null
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current)
      current = null
      continue
    }
    if (!current) continue
    const parsed = parseLine(line)
    if (parsed && !(parsed.name in current)) current[parsed.name] = { value: parsed.value, params: parsed.params }
  }
  return events
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Date et heure locales (fuseau de Bruxelles) d'un instant. */
export function localParts(date: Date, timeZone = TIME_ZONE): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/**
 * DTSTART → { date: 'YYYY-MM-DD', time: 'HH:MM' | null } à l'heure de Bruxelles.
 * Heure UTC (suffixe Z) : convertie. Heure avec TZID ou « flottante » : prise telle quelle
 * (Sportlink publie à l'heure locale belge/néerlandaise). Date seule : pas d'heure.
 */
export function parseStart(prop: Prop | undefined): { date: string; time: string | null } | null {
  if (!prop) return null
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(prop.value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (h == null || prop.params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}`, time: null }
  if (z) return localParts(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))))
  return { date: `${y}-${mo}-${d}`, time: `${pad(+h)}:${mi}` }
}

/** Minuscules, sans accents ni ponctuation : pour reconnaître le nom de l'équipe. */
export function normalizeTeam(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Titre de l'événement → adversaire et domicile/extérieur.
 * « Baudouin H3 - Dragons H4 » : domicile. « Dragons H4 - Baudouin H3 » : extérieur.
 * Sportlink colle les équipes sans espaces et met des tirets dans leurs noms (« Baudouin H-3-Rapid H-3 ») :
 * on coupe alors au tiret qui suit un chiffre et précède une lettre.
 * L'équipe est reconnue par un mot-clé (« Baudouin » par défaut) ; sans lui, on garde le titre entier.
 */
export function parseTeams(summary: string, teamKeyword = 'Baudouin'): { home: boolean; opponent: string } {
  const title = String(summary ?? '').trim()
  const key = normalizeTeam(teamKeyword)
  const split = (a: string, b: string) => {
    const ourA = normalizeTeam(a).includes(key)
    const ourB = normalizeTeam(b).includes(key)
    if (!a.trim() || !b.trim() || ourA === ourB) return null
    return ourA ? { home: true, opponent: b.trim() } : { home: false, opponent: a.trim() }
  }
  if (key) {
    const sides = title.split(/\s+(?:-|–|—|vs\.?|contre)\s+/i)
    const spaced = sides.length === 2 ? split(sides[0], sides[1]) : null
    if (spaced) return spaced
    // Tirets collés : le meilleur point de coupe est entre un chiffre et une lettre (« H-3-Rapid »).
    let best: { score: number; result: { home: boolean; opponent: string } } | null = null
    for (let i = 1; i < title.length - 1; i++) {
      if (!'-–—'.includes(title[i])) continue
      const result = split(title.slice(0, i), title.slice(i + 1))
      if (!result) continue
      const score = (/\d/.test(title[i - 1]) ? 2 : 0) + (/\D/.test(title[i + 1]) ? 1 : 0) - (/\d/.test(title[i + 1]) ? 3 : 0)
      if (!best || score > best.score) best = { score, result }
    }
    if (best && best.score > 0) return best.result
  }
  return { home: true, opponent: title || 'Adversaire à confirmer' }
}

/**
 * Agenda complet → matchs.
 * Chaque match garde l'UID Sportlink (`externalId`) : c'est lui qui relie l'événement au match
 * de l'application, même quand la date, l'heure ou le lieu changent.
 */
export function eventsToMatches(text: string, { teamKeyword = 'Baudouin' }: { teamKeyword?: string } = {}): FeedMatch[] {
  const out: FeedMatch[] = []
  for (const ev of parseEvents(text)) {
    const uid = ev.UID?.value?.trim()
    const start = parseStart(ev.DTSTART)
    if (!uid || !start) continue
    const summary = unescapeText(ev.SUMMARY?.value ?? '')
    const { home, opponent } = parseTeams(summary, teamKeyword)
    out.push({
      externalId: uid,
      date: start.date,
      time: start.time,
      opponent,
      home,
      venue: unescapeText(ev.LOCATION?.value ?? '') || null,
      details: unescapeText(ev.DESCRIPTION?.value ?? '').slice(0, 1500) || null,
      cancelled: (ev.STATUS?.value ?? '').trim().toUpperCase() === 'CANCELLED',
      summary,
    })
  }
  return out
}
