// Règles de l'annulation groupée et du repérage des anomalies (Gestion → Surveillance).
// Module pur, sans Firebase : testé par scripts/undo.test.mjs. Les écritures sont dans lib/undo.
// Syntaxe TypeScript « effaçable » uniquement : Node l'exécute directement.
import type { ActivityLog, UndoOp } from './types.ts'

/** Collection de chaque type d'entité du journal. */
export const ENTITY_COLLECTIONS: Record<string, string> = {
  player: 'players',
  match: 'matches',
  ticket: 'tickets',
  like: 'likes',
  coum: 'coums',
  fine: 'fines',
  fineType: 'fineTypes',
  goal: 'goals',
  statEntry: 'statEntries',
  statCategory: 'statCategories',
}

/** Écritures qui annulent une entrée, ou null si elle ne peut pas l'être (consultation, ancienne modification…). */
export function undoOpsOf(a: ActivityLog): UndoOp[] | null {
  if (a.undo?.length) return a.undo
  // Entrées d'avant l'annulation : une création se défait quand même, en supprimant le document créé.
  const coll = ENTITY_COLLECTIONS[a.entity]
  if (a.action === 'create' && coll && a.entityId && !a.entityId.includes('/') && a.entityId !== 'import') return [{ op: 'delete', path: `${coll}/${a.entityId}` }]
  return null
}

/** Documents touchés par une entrée. */
export function pathsOf(a: ActivityLog): string[] {
  const paths = new Set((a.undo ?? []).map((o) => o.path))
  const coll = ENTITY_COLLECTIONS[a.entity]
  if (coll && a.entityId && !a.entityId.includes('/')) paths.add(`${coll}/${a.entityId}`)
  return [...paths]
}

/** Droits de l'auteur d'une action : une annulation ne doit jamais aller au-delà. */
export type Trust = 'admin' | 'staff' | 'public'

const STAFF_COLLECTIONS = ['players', 'matches', 'tickets', 'likes', 'coums', 'goals', 'fines', 'fineTypes', 'statCategories', 'statEntries']
/** Champs d'un match qu'un membre (orateur) peut modifier : les mêmes que dans firestore.rules. */
const SPEAKER_MATCH_FIELDS = ['status', 'speakerName', 'speakerUid', 'speakerPlayerId', 'speakerSince', 'speakerTakeover', 'readingStartedAt', 'closedAt', 'voteDeadline', 'voteTimerMinutes', 'voteTimerBy', 'updatedAt']

export type OpCheck = 'ok' | 'beyond' | 'forbidden'

/**
 * Le journal est écrit par les appareils eux-mêmes : une entrée pourrait contenir une « annulation »
 * fabriquée. On vérifie donc chaque écriture :
 *  - 'forbidden' : jamais (comptes staff, identités, journal, installation) ;
 *  - 'beyond'    : au-delà des droits actuels de l'auteur (ex. secrétaire dont les droits ont été retirés
 *                  depuis) : appliquée seulement si l'admin la coche lui-même ;
 *  - 'ok'        : dans les droits de l'auteur.
 */
export function checkOp(op: UndoOp, trust: Trust, entry: ActivityLog): OpCheck {
  const [coll, id, ...rest] = op.path.split('/')
  if (!coll || !id || rest.length) return 'forbidden'
  if (coll === 'activity' || coll === 'identities' || coll === 'staff' || (coll === 'config' && id === 'bootstrap')) {
    // Seul l'admin touche aux comptes staff (lien vers un joueur).
    return coll === 'staff' && trust === 'admin' && op.op === 'update' && Object.keys(op.data).every((k) => k === 'playerId') ? 'ok' : 'forbidden'
  }
  if (trust === 'admin') return 'ok'
  const keys = op.op === 'delete' ? [] : Object.keys(op.data)
  // Droits de secrétaire et liste des orateurs : réservés à l'admin.
  const adminOnly = coll === 'players' && keys.some((k) => k === 'role' || k === 'canSpeak')
  const staffLevel = !adminOnly && (STAFF_COLLECTIONS.includes(coll) || (coll === 'config' && (id === 'settings' || id === 'calendar')))
  if (trust === 'staff') return staffLevel ? 'ok' : 'beyond'
  // Membre : uniquement le document de sa propre entrée (son vote, son coup de cœur, la lecture du match).
  const own = op.path === `${ENTITY_COLLECTIONS[entry.entity]}/${entry.entityId}`
  const memberLevel = own && (coll === 'tickets' || coll === 'likes' || (coll === 'matches' && op.op === 'update' && keys.every((k) => SPEAKER_MATCH_FIELDS.includes(k))))
  if (memberLevel) return 'ok'
  return staffLevel ? 'beyond' : 'forbidden'
}

/** Une action ultérieure `b` touche-t-elle aux mêmes champs que ces écritures d'annulation ? */
function overlaps(ops: UndoOp[], b: ActivityLog): boolean {
  const fields = (o: UndoOp) => (o.op === 'update' ? Object.keys(o.data).filter((k) => k !== 'updatedAt') : null)
  if (b.undo?.length) {
    return b.undo.some((bo) =>
      ops.some((o) => {
        if (o.path !== bo.path) return false
        const mine = fields(o)
        const theirs = fields(bo)
        // Création, suppression ou remise à l'identique : tout le document est concerné.
        return !mine || !theirs || mine.some((k) => theirs.includes(k))
      }),
    )
  }
  // Consulter le nom d'un votant ne modifie rien.
  if (b.summary.startsWith('Nom de l’auteur consulté')) return false
  const paths = new Set(ops.map((o) => o.path))
  return pathsOf(b).some((p) => paths.has(p))
}

export type EntryStatus =
  | { kind: 'ok' }
  | { kind: 'undone'; by: string }
  | { kind: 'impossible' }
  | { kind: 'forbidden' }
  | { kind: 'beyond' }
  | { kind: 'conflict'; later: ActivityLog[] }

export const ms = (a: ActivityLog) => a.at?.toMillis?.() ?? Date.now()

/**
 * État de chaque action candidate à l'annulation.
 * @param selected  actions retenues (personne + période)
 * @param all       tout le journal chargé depuis le début de la période (pour voir ce qui a suivi)
 * @param trustOf   droits actuels de l'auteur d'une action
 */
export function analyse(selected: ActivityLog[], all: ActivityLog[], trustOf: (uid: string) => Trust): Map<string, EntryStatus> {
  const undoneBy = new Map<string, string>()
  for (const a of all) for (const id of a.undoOf ?? []) undoneBy.set(id, a.actorName)
  const chosen = new Set(selected.map((a) => a.id))
  const out = new Map<string, EntryStatus>()
  for (const a of selected) {
    const by = undoneBy.get(a.id)
    if (by) {
      out.set(a.id, { kind: 'undone', by })
      continue
    }
    const ops = undoOpsOf(a)
    if (!ops) {
      out.set(a.id, { kind: 'impossible' })
      continue
    }
    const checks = ops.map((o) => checkOp(o, trustOf(a.actorUid), a))
    if (checks.includes('forbidden')) {
      out.set(a.id, { kind: 'forbidden' })
      continue
    }
    // Quelqu'un d'autre a touché aux mêmes données ensuite : annuler effacerait aussi son travail.
    const later = all.filter((b) => !chosen.has(b.id) && !undoneBy.has(b.id) && !b.undoOf?.length && ms(b) > ms(a) && overlaps(ops, b))
    if (later.length) out.set(a.id, { kind: 'conflict', later })
    else if (checks.includes('beyond')) out.set(a.id, { kind: 'beyond' })
    else out.set(a.id, { kind: 'ok' })
  }
  return out
}

// ---- Surveillance : ce qui mérite un coup d'œil ----

export interface Alert {
  id: string
  level: 'warn' | 'info'
  title: string
  detail: string
  actorUid?: string
  from: number
  to: number
}

/** Actions qui changent vraiment les données de l'équipe (amendes, buts, joueurs, droits…). */
function sensitive(a: ActivityLog): boolean {
  if (a.undoOf?.length) return false
  if (a.action === 'delete') return true
  return ['fine', 'fineType', 'player', 'staff', 'settings', 'goal', 'statEntry', 'statCategory'].includes(a.entity)
}

const HOUR = 3_600_000
const brusselsHour = (t: number) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)))

/** Repère dans le journal les comportements inhabituels. `entries` : du plus récent au plus ancien. */
export function detectAlerts(entries: ActivityLog[]): Alert[] {
  const alerts: Alert[] = []
  const byActor = new Map<string, ActivityLog[]>()
  for (const a of entries) {
    if (!a.actorUid || a.actorUid === 'sportlink') continue
    byActor.set(a.actorUid, [...(byActor.get(a.actorUid) ?? []), a])
  }

  for (const [uid, list] of byActor) {
    const name = list[0].actorName
    const asc = [...list].sort((a, b) => ms(a) - ms(b))

    // Rafale : beaucoup de modifications sensibles en un quart d'heure.
    const sens = asc.filter(sensitive)
    let start = 0
    let best: [number, number] | null = null
    for (let end = 0; end < sens.length; end++) {
      while (ms(sens[end]) - ms(sens[start]) > HOUR / 4) start++
      if (end - start + 1 >= 8 && (!best || end - start > best[1] - best[0])) best = [start, end]
    }
    if (best) {
      const [s, e] = best
      alerts.push({ id: `burst-${uid}`, level: 'warn', title: `${name} : ${e - s + 1} modifications en ${Math.max(1, Math.round((ms(sens[e]) - ms(sens[s])) / 60000))} min`, detail: 'Amendes, buts, joueurs ou suppressions en rafale.', actorUid: uid, from: ms(sens[s]), to: ms(sens[e]) })
    }

    // Suppressions en série.
    const dels = asc.filter((a) => a.action === 'delete' && !a.undoOf?.length)
    start = 0
    for (let end = 0; end < dels.length; end++) {
      while (ms(dels[end]) - ms(dels[start]) > HOUR) start++
      if (end - start + 1 >= 3) {
        alerts.push({ id: `deletes-${uid}`, level: 'warn', title: `${name} : ${end - start + 1} suppressions en moins d’une heure`, detail: dels.slice(start, end + 1).map((a) => a.summary).slice(0, 3).join(' · '), actorUid: uid, from: ms(dels[start]), to: ms(dels[end]) })
        break
      }
    }

    // En pleine nuit.
    const night = sens.filter((a) => {
      const h = brusselsHour(ms(a))
      return h >= 1 && h < 6
    })
    if (night.length) alerts.push({ id: `night-${uid}`, level: 'info', title: `${name} : ${night.length} modification${night.length > 1 ? 's' : ''} en pleine nuit`, detail: night.slice(0, 2).map((a) => a.summary).join(' · '), actorUid: uid, from: ms(night[0]), to: ms(night[night.length - 1]) })
  }

  // Droits de secrétaire utilisés depuis plusieurs appareils : ils suivent le nom, quelqu'un peut l'emprunter.
  const devices = new Map<string, Set<string>>()
  for (const a of entries) {
    if (a.actorRole !== 'secretary') continue
    devices.set(a.actorName, (devices.get(a.actorName) ?? new Set()).add(a.actorUid))
  }
  for (const [name, uids] of devices) {
    if (uids.size < 2) continue
    const list = entries.filter((a) => a.actorName === name && a.actorRole === 'secretary')
    alerts.push({ id: `devices-${name}`, level: 'info', title: `Droits de secrétaire de ${name} utilisés depuis ${uids.size} appareils`, detail: 'Nouveau téléphone, ou quelqu’un qui s’est connecté sous ce nom ? Vérifiez les actions de chaque appareil.', from: ms(list[list.length - 1]), to: ms(list[0]) })
  }

  // Score d'un match modifié plusieurs fois.
  const scores = new Map<string, ActivityLog[]>()
  for (const a of entries) {
    if (a.entity !== 'match' || !a.changes?.some((c) => c.field.startsWith('Score'))) continue
    scores.set(a.entityId, [...(scores.get(a.entityId) ?? []), a])
  }
  for (const [id, list] of scores) {
    if (list.length < 2) continue
    const who = [...new Set(list.map((a) => a.actorName))].join(', ')
    alerts.push({ id: `score-${id}`, level: 'info', title: `Score modifié ${list.length} fois`, detail: `${list[0].summary} · par ${who}`, from: ms(list[list.length - 1]), to: ms(list[0]) })
  }

  return alerts.sort((a, b) => (a.level === b.level ? b.to - a.to : a.level === 'warn' ? -1 : 1))
}
