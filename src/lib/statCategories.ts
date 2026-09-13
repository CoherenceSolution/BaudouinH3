import { collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Supprime une liste maison (« Papa de l'année », « Homme du match »…) et toutes ses entrées :
 * sans cela les entrées resteraient dans la base sans jamais être affichées.
 * Renvoie le nombre d'entrées supprimées.
 */
export async function deleteStatCategory(categoryId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'statEntries'), where('categoryId', '==', categoryId)))
  const docs = snap.docs
  // Une écriture groupée est limitée à 500 opérations.
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db)
    for (const d of docs.slice(i, i + 400)) batch.delete(d.ref)
    await batch.commit()
  }
  await deleteDoc(doc(db, 'statCategories', categoryId))
  return docs.length
}
