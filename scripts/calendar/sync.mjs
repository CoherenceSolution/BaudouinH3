// Synchronisation de l'agenda Sportlink avec les matchs de l'application.
//
// Lancée chaque jour par GitHub Actions (.github/workflows/sync-calendar.yml), ou à la main :
//   GOOGLE_APPLICATION_CREDENTIALS=cle.json node scripts/calendar/sync.mjs
//
// Le lien de l'agenda est lu dans Firestore (config/calendar.icalUrl, collé dans Gestion → Paramètres),
// ou dans la variable d'environnement SPORTLINK_ICAL_URL si elle est définie.
// SYNC_DRY_RUN=1 affiche ce qui serait fait sans rien écrire.
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { eventsToMatches, localParts } from './ical.mjs'
import { describeUpdate, describeWhen, planSync } from './plan.mjs'

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
  const text = await res.text()
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Le lien ne renvoie pas un agenda iCalendar')

  const feed = eventsToMatches(text, { teamKeyword: config.teamKeyword || 'Baudouin' })
  const today = localParts(new Date()).date
  const snap = await db.collection('matches').where('source', '==', 'sportlink').get()
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const plan = planSync(feed, existing, today)

  console.log(`Agenda : ${feed.length} événement(s). À créer : ${plan.create.length}, à mettre à jour : ${plan.update.length}, à annuler : ${plan.cancel.length}.`)
  for (const c of plan.create) console.log(`  + ${describeWhen(c.data)} ${c.data.home ? 'vs' : '@'} ${c.data.opponent}`)
  for (const u of plan.update) console.log(`  ~ ${describeUpdate(u.before, u.data)}`)
  for (const c of plan.cancel) console.log(`  × ${describeWhen(c.before)} ${c.before.opponent}`)
  if (DRY_RUN) return

  const now = FieldValue.serverTimestamp()
  const batch = db.batch()
  const log = (action, entityId, summary) =>
    batch.set(db.collection('activity').doc(), { ...ACTOR, action, entity: 'match', entityId, summary, at: now })

  for (const { id, data } of plan.create) {
    batch.set(db.doc(`matches/${id}`), {
      ...data,
      source: 'sportlink',
      competition: '',
      homeScore: null,
      awayScore: null,
      status: 'scheduled',
      createdBy: 'sportlink',
      createdAt: now,
      updatedAt: now,
      syncedAt: now,
    })
    log('create', id, `Match importé de Sportlink : ${data.opponent} (${describeWhen(data)})`)
  }
  for (const { id, before, data } of plan.update) {
    batch.update(db.doc(`matches/${id}`), { ...data, updatedAt: now, syncedAt: now })
    log('update', id, describeUpdate(before, data))
  }
  for (const { id, before } of plan.cancel) {
    batch.update(db.doc(`matches/${id}`), { cancelled: true, updatedAt: now, syncedAt: now })
    log('update', id, `Match retiré de l’agenda Sportlink, marqué annulé : ${before.opponent} (${describeWhen(before)})`)
  }
  batch.set(
    configRef,
    { lastSync: { at: now, ok: true, events: feed.length, created: plan.create.length, updated: plan.update.length, cancelled: plan.cancel.length, error: null } },
    { merge: true },
  )
  await batch.commit()
  console.log('Synchronisation terminée.')
}

main().catch(async (err) => {
  console.error(err)
  process.exitCode = 1
  if (DRY_RUN) return
  // L'échec est visible dans Gestion → Paramètres (sans jamais y recopier le lien secret).
  try {
    await configRef.set({ lastSync: { at: FieldValue.serverTimestamp(), ok: false, error: String(err.message ?? err).slice(0, 300) } }, { merge: true })
  } catch (e) {
    console.error('Impossible d’enregistrer l’erreur :', e)
  }
})
