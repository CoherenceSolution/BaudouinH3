import { collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { readBefore, undoDelete } from './activity'
import type { UndoOp } from './types'

/**
 * Supprime une liste maison (« Papa de l'année », « Homme du match »…) et toutes ses entrées :
 * sans cela les entrées resteraient dans la base sans jamais être affichées.
 * Renvoie le nombre d'entrées supprimées et de quoi tout recréer (annulation par l'admin).
 */
export async function deleteStatCategory(categoryId: string): Promise<{ removed: number; undo: UndoOp[] }> {
  const snap = await getDocs(query(collection(db, 'statEntries'), where('categoryId', '==', categoryId)))
  const docs = snap.docs
  const undo = [
    ...undoDelete(`statCategories/${categoryId}`, await readBefore(`statCategories/${categoryId}`)),
    ...docs.flatMap((d) => undoDelete(`statEntries/${d.id}`, d.data())),
  ]
  // Une écriture groupée est limitée à 500 opérations.
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db)
    for (const d of docs.slice(i, i + 400)) batch.delete(d.ref)
    await batch.commit()
  }
  await deleteDoc(doc(db, 'statCategories', categoryId))
  return { removed: docs.length, undo }
}
