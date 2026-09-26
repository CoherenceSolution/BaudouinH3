// Lecture d'un agenda iCalendar (.ics), tel que Sportlink le publie, et conversion en matchs.
// Module pur (aucune dépendance) : utilisé par la synchronisation quotidienne et par ses tests.

export const TIME_ZONE = 'Europe/Brussels'

/** Déplie les lignes longues (RFC 5545 : une ligne qui commence par un espace prolonge la précédente). */
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function unescapeText(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim()
}

/** « DTSTART;TZID=Europe/Brussels:20261004T143000 » → { name, params, value }. */
function parseLine(line) {
  const colon = findValueColon(line)
  if (colon < 0) return null
  const [name, ...rawParams] = line.slice(0, colon).split(';')
  const params = {}
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) }
}

/** Premier « : » hors guillemets (un paramètre peut contenir « : » entre guillemets). */
function findValueColon(line) {
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted
    else if (line[i] === ':' && !quoted) return i
  }
  return -1
}

/** Événements bruts : une liste de { UID, SUMMARY, DTSTART: {value, params}, … }. */
export function parseEvents(text) {
  const events = []
  let current = null
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

const pad = (n) => String(n).padStart(2, '0')

/** Date et heure locales (fuseau de Bruxelles) d'un instant. */
export function localParts(date, timeZone = TIME_ZONE) {
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
export function parseStart(prop) {
  if (!prop) return null
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(prop.value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (h == null || prop.params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}`, time: null }
  if (z) return localParts(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))))
  return { date: `${y}-${mo}-${d}`, time: `${pad(+h)}:${mi}` }
}

/** Minuscules, sans accents ni ponctuation : pour reconnaître le nom de l'équipe. */
export function normalize(s) {
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
 * L'équipe est reconnue par un mot-clé (« Baudouin » par défaut) ; sans lui, on garde le titre entier.
 */
export function parseTeams(summary, teamKeyword = 'Baudouin') {
  const title = String(summary ?? '').trim()
  const key = normalize(teamKeyword)
  const sides = title.split(/\s+(?:-|–|—|vs\.?|contre)\s+/i)
  if (sides.length === 2 && key) {
    const [a, b] = sides.map((s) => s.trim())
    const ourA = normalize(a).includes(key)
    const ourB = normalize(b).includes(key)
    if (ourA && !ourB) return { home: true, opponent: b }
    if (ourB && !ourA) return { home: false, opponent: a }
  }
  return { home: true, opponent: title || 'Adversaire à confirmer' }
}

/**
 * Agenda complet → matchs prêts à écrire.
 * Chaque match garde l'UID Sportlink (`externalId`) : c'est lui qui relie l'événement au match
 * de l'application, même quand la date, l'heure ou le lieu changent.
 */
export function eventsToMatches(text, { teamKeyword = 'Baudouin' } = {}) {
  const out = []
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
