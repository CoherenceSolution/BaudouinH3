import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { ActivityAction, ActivityChange, ActivityLog } from './types'

export interface Actor {
  uid: string
  name: string
  role: ActivityLog['actorRole']
}

/**
 * Écrit une entrée dans le journal d'activité (ajout seul, rien ne peut y être modifié ni supprimé).
 * `changes` garde, pour une modification, la valeur de chaque champ avant et après.
 * Ne bloque jamais l'action métier en cas d'échec.
 */
export async function logActivity(actor: Actor, action: ActivityAction, entity: string, entityId: string, summary: string, changes?: ActivityChange[]) {
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
