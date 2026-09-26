import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Actor } from '@/lib/activity'
import type { CalendarConfig } from '@/lib/types'
import { prepareSync, syncWrites, type ExistingMatch, type SyncSummary } from './plan.ts'

/** Page GitHub qui lance la même synchronisation côté serveur (bouton « Run workflow »). */
export const GITHUB_SYNC_URL = 'https://github.com/CoherenceSolution/BaudouinH3/actions/workflows/sync-calendar.yml'

/** Sportlink n'autorise pas la lecture depuis le navigateur : il faut passer par GitHub. */
export class BrowserBlockedError extends Error {}

/**
 * Bouton « Mettre à jour le calendrier » : même synchronisation que la tâche du matin,
 * faite depuis le navigateur de l'admin avec ses droits (règles Firestore du staff).
 */
export async function syncCalendarFromBrowser(actor: Actor): Promise<SyncSummary> {
  const configRef = doc(db, 'config', 'calendar')
  const config = ((await getDoc(configRef)).data() ?? {}) as CalendarConfig
  if (!config.icalUrl) throw new Error('Collez d’abord le lien de l’agenda dans Gestion → Paramètres.')

  let ics: string
  try {
    const res = await fetch(config.icalUrl, { headers: { Accept: 'text/calendar, */*' } })
    if (!res.ok) throw new Error(`Agenda inaccessible (HTTP ${res.status})`)
    ics = await res.text()
  } catch (e) {
    // Une TypeError de fetch = lecture refusée par le navigateur (CORS) ou réseau coupé.
    if (e instanceof TypeError) throw new BrowserBlockedError('Sportlink ne laisse pas le navigateur lire l’agenda.')
    throw e
  }

  try {
    const snap = await getDocs(query(collection(db, 'matches'), where('source', '==', 'sportlink')))
    const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExistingMatch)
    const { plan, summary } = await prepareSync(ics, existing, { teamKeyword: config.teamKeyword })

    const batch = writeBatch(db)
    const writes = syncWrites(plan, summary, { actorUid: actor.uid, actorName: actor.name, actorRole: actor.role }, serverTimestamp())
    for (const w of writes) {
      if (w.kind === 'add') batch.set(doc(collection(db, w.collection)), w.data)
      else if (w.kind === 'update') batch.update(doc(db, w.path), w.data)
      else batch.set(doc(db, w.path), w.data, { merge: true })
    }
    await batch.commit()
    return summary
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await setDoc(configRef, { lastSync: { at: serverTimestamp(), ok: false, by: actor.name, error: error.slice(0, 300) } }, { merge: true }).catch(() => {})
    throw e
  }
}
