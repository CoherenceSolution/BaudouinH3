// Annulation groupée d'actions (Gestion → Surveillance, admin seulement) et repérage des anomalies.
//
// Chaque entrée du journal garde, dans `undo`, les écritures qui remettent la base dans l'état d'avant
// (voir lib/activity). Annuler, c'est appliquer ces écritures, de la plus récente à la plus ancienne,
// puis ajouter au journal une entrée « Annulation » qui liste les actions annulées (`undoOf`) et qui
// est elle-même annulable. Le journal reste en ajout seul : rien n'y est effacé.
import { addDoc, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { readBeforeMany, type Actor, type Snapshot } from './activity'
import type { ActivityLog, UndoOp } from './types'
import { ms, undoOpsOf } from './undoRules'

export * from './undoRules'

/**
 * Annule des actions : leurs écritures inverses sont appliquées de la plus récente à la plus ancienne.
 * Une modification d'un document supprimé entre-temps est sautée (et signalée).
 * L'annulation est elle-même journalisée, avec de quoi la défaire.
 */
export async function applyUndo(entries: ActivityLog[], actor: Actor, label: string): Promise<{ applied: number; skipped: number }> {
  const ordered = [...entries].sort((a, b) => ms(b) - ms(a))
  const ops = ordered.flatMap((a) => undoOpsOf(a) ?? [])
  const paths = [...new Set(ops.map((o) => o.path))]
  const current = await readBeforeMany(paths)

  // État d'aujourd'hui, pour pouvoir défaire l'annulation.
  const redo: UndoOp[] = paths.flatMap((p): UndoOp[] => {
    const s: Snapshot = current.get(p)
    if (s === undefined) return []
    return s === null ? [{ op: 'delete', path: p }] : [{ op: 'set', path: p, data: s }]
  })

  const exists = new Map(paths.map((p) => [p, current.get(p) != null]))
  let skipped = 0
  const writes: UndoOp[] = []
  for (const o of ops) {
    if (o.op === 'update' && !exists.get(o.path)) {
      skipped++
      continue
    }
    writes.push(o)
    exists.set(o.path, o.op !== 'delete')
  }

  // Lots de 400 écritures (limite Firestore : 500 par lot).
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db)
    for (const o of writes.slice(i, i + 400)) {
      const ref = doc(db, o.path)
      if (o.op === 'delete') batch.delete(ref)
      else if (o.op === 'set') batch.set(ref, o.data)
      else batch.update(ref, o.data)
    }
    await batch.commit()
  }

  await addDoc(collection(db, 'activity'), {
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'update',
    entity: 'undo',
    entityId: ordered[0]?.id ?? 'undo',
    summary: `Annulation de ${entries.length} action${entries.length > 1 ? 's' : ''} — ${label}`,
    undoOf: entries.map((a) => a.id),
    ...(redo.length ? { undo: redo } : {}),
    at: serverTimestamp(),
  })
  return { applied: entries.length, skipped }
}
