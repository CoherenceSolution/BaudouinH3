// Synchronisation quotidienne de l'agenda Sportlink avec les matchs de l'application.
//
// Lancée chaque matin par GitHub Actions (.github/workflows/sync-calendar.yml), ou à la main :
//   GOOGLE_APPLICATION_CREDENTIALS=cle.json node scripts/calendar/sync.mjs
// Même logique que le bouton « Mettre à jour le calendrier » de l'application (src/lib/calendar/).
//
// Le lien de l'agenda est lu dans Firestore (config/calendar.icalUrl, collé dans Gestion → Paramètres),
// ou dans la variable d'environnement SPORTLINK_ICAL_URL si elle est définie.
// SYNC_DRY_RUN=1 affiche ce qui serait fait sans rien écrire.
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { describeSummary, describeUpdate, describeWhen, prepareSync, syncWrites } from '../../src/lib/calendar/plan.ts'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'baudouinheren3'
const DRY_RUN = process.env.SYNC_DRY_RUN === '1'
const ACTOR = { actorUid: 'sportlink', actorName: 'Agenda Sportlink', actorRole: 'admin' }

initializeApp({ projectId: PROJECT_ID })
const db = getFirestore()
const configRef = db.doc('config/calendar')

async function main() {
  const config = (await configRef.get()).data() ?? {}
  const url = process.env.SPORTLINK_ICAL_URL || config.icalUrl
  if (!url) {
    console.log('Aucun lien d’agenda : collez-le dans Gestion → Paramètres → Agenda Sportlink.')
    return
  }

  const res = await fetch(url, { headers: { Accept: 'text/calendar, */*' } })
  if (!res.ok) throw new Error(`Agenda inaccessible (HTTP ${res.status})`)
  // Tous les matchs : un match saisi à la main peut être relié à son événement Sportlink.
  const snap = await db.collection('matches').get()
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const { plan, summary } = await prepareSync(await res.text(), existing, { teamKeyword: config.teamKeyword })

  console.log(`Agenda : ${summary.events} événement(s). ${describeSummary(summary)}.`)
  for (const c of plan.create) console.log(`  + ${describeWhen(c.data)} ${c.data.home ? 'vs' : '@'} ${c.data.opponent}`)
  for (const u of plan.update) console.log(`  ~ ${describeUpdate(u.before, u.data)}`)
  for (const c of plan.cancel) console.log(`  × ${describeWhen(c.before)} ${c.before.opponent}`)
  for (const r of plan.remove) console.log(`  − doublon ${describeWhen(r.before)} ${r.before.opponent}`)
  if (DRY_RUN) return

  const batch = db.batch()
  for (const w of syncWrites(plan, summary, ACTOR, FieldValue.serverTimestamp())) {
    if (w.kind === 'add') batch.set(db.collection(w.collection).doc(), w.data)
    else if (w.kind === 'update') batch.update(db.doc(w.path), w.data)
    else if (w.kind === 'delete') batch.delete(db.doc(w.path))
    else batch.set(db.doc(w.path), w.data, { merge: true })
  }
  await batch.commit()
  console.log('Synchronisation terminée.')
}

main().catch(async (err) => {
  console.error(err)
  process.exitCode = 1
  if (DRY_RUN) return
  // L'échec est visible dans Gestion → Paramètres (sans jamais y recopier le lien secret).
  try {
    await configRef.set({ lastSync: { at: FieldValue.serverTimestamp(), ok: false, by: ACTOR.actorName, error: String(err.message ?? err).slice(0, 300) } }, { merge: true })
  } catch (e) {
    console.error('Impossible d’enregistrer l’erreur :', e)
  }
})
