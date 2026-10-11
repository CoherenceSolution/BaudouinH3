import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { ActivityAction, ActivityChange, ActivityLog, UndoOp } from './types'

export interface Actor {
  uid: string
  name: string
  role: ActivityLog['actorRole']
}

/**
 * Écrit une entrée dans le journal d'activité (ajout seul, rien ne peut y être modifié ni supprimé).
 * `changes` garde, pour une modification, la valeur de chaque champ avant et après.
 * `undo` garde les écritures qui remettent la base dans l'état d'avant : l'admin peut ainsi annuler
 * l'action plus tard (Gestion → Surveillance). Voir undoCreate, undoUpdate, undoDelete.
 * Ne bloque jamais l'action métier en cas d'échec.
 */
export async function logActivity(actor: Actor, action: ActivityAction, entity: string, entityId: string, summary: string, changes?: ActivityChange[], undo?: UndoOp[]) {
  try {
    await addDoc(collection(db, 'activity'), {
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      entity,
      entityId,
      summary,
      ...(changes && changes.length ? { changes } : {}),
      ...(undo && undo.length ? { undo: clean(undo) } : {}),
      at: serverTimestamp(),
    })
  } catch (e) {
    console.warn('Journal d’activité indisponible', e)
  }
}

/** Valeur lisible pour le journal : « — » pour vide, « oui / non » pour un booléen. */
export function logValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'oui' : 'non'
  return String(v)
}

/**
 * Compare deux états et renvoie les champs modifiés, sous leur libellé lisible.
 * Seuls les champs présents dans `labels` sont comparés (dans cet ordre).
 */
export function diffChanges(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string>): ActivityChange[] {
  const out: ActivityChange[] = []
  for (const [key, field] of Object.entries(labels)) {
    const b = logValue(before[key])
    const a = logValue(after[key])
    if (a !== b) out.push({ field, before: b, after: a })
  }
  return out
}

/** Résumé court des changements, pour la ligne du journal : « Adversaire : A → B ; Score : … ». */
export function changesText(changes: ActivityChange[]): string {
  return changes.map((c) => `${c.field} : ${c.before} → ${c.after}`).join(' ; ')
}

// ---- Annulation ----
// Avant d'écrire, on lit l'état brut du document (sans l'identifiant ni l'état « effectif » calculé
// par l'application) ; après, on enregistre dans le journal l'écriture inverse.

export type Snapshot = Record<string, unknown> | null | undefined

/** État d'un document juste avant de le modifier : null s'il n'existe pas, undefined si la lecture échoue. */
export async function readBefore(path: string): Promise<Snapshot> {
  try {
    const snap = await getDoc(doc(db, path))
    return snap.exists() ? snap.data() : null
  } catch (e) {
    console.warn('État avant modification illisible', path, e)
    return undefined
  }
}

/** Plusieurs documents d'un coup (suppression en série). */
export async function readBeforeMany(paths: string[]): Promise<Map<string, Snapshot>> {
  const entries = await Promise.all(paths.map(async (p) => [p, await readBefore(p)] as const))
  return new Map(entries)
}

/** Un document créé : l'annuler, c'est le supprimer. */
export function undoCreate(path: string): UndoOp[] {
  return [{ op: 'delete', path }]
}

/** Un document supprimé : l'annuler, c'est le recréer tel qu'il était. */
export function undoDelete(path: string, before: Snapshot): UndoOp[] {
  return before ? [{ op: 'set', path, data: before }] : []
}

/**
 * Un document modifié : l'annuler, c'est remettre l'ancienne valeur des seuls champs touchés
 * (les autres champs, modifiés entre-temps par quelqu'un d'autre, ne bougent pas).
 * Un document qui n'existait pas (écriture « merge ») est simplement supprimé.
 */
export function undoUpdate(path: string, before: Snapshot, keys: string[]): UndoOp[] {
  if (before === undefined) return []
  if (before === null) return undoCreate(path)
  return [{ op: 'update', path, data: Object.fromEntries(keys.map((k) => [k, valueAt(before, k) ?? null])) }]
}

/** Valeur d'un champ, chemins pointés compris (« best.playerId »). */
function valueAt(data: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), data)
}

/** Firestore refuse `undefined` : on le retire partout. */
function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clean(x)])) as T
  }
  return v
}
