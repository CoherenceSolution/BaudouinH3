import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventsToMatches, parseStart, parseTeams } from '../../src/lib/calendar/ical.ts'
import { describeChanges, matchIdFor, planSync, prepareSync, syncWrites } from '../../src/lib/calendar/plan.ts'

const withIds = (feed) => Promise.all(feed.map(async (m) => ({ ...m, id: await matchIdFor(m.externalId) })))

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Sportlink//NL',
  'BEGIN:VEVENT',
  'UID:wedstrijd-1001@sportlink',
  'DTSTART;TZID=Europe/Brussels:20261004T143000',
  'SUMMARY:Royal Baudouin H3 - Dragons H4',
  'LOCATION:Complexe sportif\\, Avenue du Hockey 1\\, 1000 Bruxelles',
  'DESCRIPTION:Terrain 2\\nArbitre : à désigner',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:wedstrijd-1002@sportlink',
  'DTSTART:20261011T100000Z',
  'SUMMARY:Léopold H3 – Baudouin H3',
  'LOCATION:Léopold',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:wedstrijd-1003@sportlink',
  'DTSTART;VALUE=DATE:20261018',
  'SUMMARY:Baudouin H3 - Un adversaire au nom',
  '  très long',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

test('lit les événements : heure locale, heure UTC convertie, date seule, lignes pliées', () => {
  const [a, b, c] = eventsToMatches(ICS)
  assert.deepEqual([a.date, a.time, a.home, a.opponent], ['2026-10-04', '14:30', true, 'Dragons H4'])
  assert.equal(a.venue, 'Complexe sportif, Avenue du Hockey 1, 1000 Bruxelles')
  assert.equal(a.details, 'Terrain 2\nArbitre : à désigner')
  assert.deepEqual([b.date, b.time, b.home, b.opponent], ['2026-10-11', '12:00', false, 'Léopold H3'])
  assert.deepEqual([c.date, c.time, c.opponent, c.cancelled], ['2026-10-18', null, 'Un adversaire au nom très long', true])
})

test('heure UTC en hiver : +1 h à Bruxelles', () => {
  assert.deepEqual(parseStart({ value: '20261205T190000Z', params: {} }), { date: '2026-12-05', time: '20:00' })
  assert.deepEqual(parseStart({ value: '20261231T233000Z', params: {} }), { date: '2027-01-01', time: '00:30' })
})

test('titre sans le nom de l’équipe : on garde le titre entier', () => {
  assert.deepEqual(parseTeams('Tournoi de Noël'), { home: true, opponent: 'Tournoi de Noël' })
  assert.deepEqual(parseTeams('Dragons - Baudouin H3', 'baudouin'), { home: false, opponent: 'Dragons' })
})

const TODAY = '2026-10-01'

test('crée les matchs à venir, ignore les matchs passés', async () => {
  const feed = [
    ...eventsToMatches(ICS),
    { externalId: 'ancien', date: '2026-09-20', time: '10:00', opponent: 'Passé', home: true, venue: null, details: null, cancelled: false },
  ]
  const plan = planSync(await withIds(feed), [], TODAY)
  assert.equal(plan.create.length, 3)
  assert.ok(!plan.create.some((c) => c.data.opponent === 'Passé'))
  assert.equal(plan.create[0].id, await matchIdFor('wedstrijd-1001@sportlink'))
  assert.match(plan.create[0].id, /^sl_[0-9a-f]{20}$/)
})

test('un match déplacé est mis à jour ; un match inchangé ne l’est pas', async () => {
  const [a, b] = await withIds(eventsToMatches(ICS))
  const existing = [
    { status: 'scheduled', source: 'sportlink', ...a, date: '2026-10-03', time: '20:00', homeScore: 5 },
    { status: 'scheduled', source: 'sportlink', ...b },
  ]
  const plan = planSync([a, b], existing, TODAY)
  assert.equal(plan.create.length, 0)
  assert.equal(plan.update.length, 1)
  assert.deepEqual([plan.update[0].data.date, plan.update[0].data.time], ['2026-10-04', '14:30'])
  assert.ok(!('homeScore' in plan.update[0].data), 'le score n’est jamais écrasé')
  assert.ok(!('status' in plan.update[0].data), 'l’état des votes n’est jamais écrasé')
  assert.deepEqual(describeChanges(plan.update[0].before, plan.update[0].data), [
    { field: 'Date', before: '3 oct.', after: '4 oct.' },
    { field: 'Heure', before: '20h00', after: '14h30' },
  ])
})

test('un match à venir retiré de l’agenda est annulé, jamais supprimé ; le passé et le jour même restent', () => {
  const existing = [
    { id: 'sl_futur', source: 'sportlink', status: 'scheduled', date: '2026-10-20', opponent: 'Futur' },
    { id: 'sl_jour', source: 'sportlink', status: 'scheduled', date: TODAY, opponent: 'Aujourd’hui' },
    { id: 'sl_passe', source: 'sportlink', status: 'closed', date: '2026-09-01', opponent: 'Passé' },
    { id: 'sl_vote', source: 'sportlink', status: 'voting', date: '2026-10-20', opponent: 'Votes lancés' },
    { id: 'manuel', status: 'scheduled', date: '2026-10-20', opponent: 'Saisi à la main' },
  ]
  const feed = [
    { id: 'sl_a', externalId: 'a', date: '2026-10-10', time: null, opponent: 'Autre', home: true, venue: null, details: null, cancelled: false },
    { id: 'sl_b', externalId: 'b', date: '2026-10-30', time: null, opponent: 'Encore', home: true, venue: null, details: null, cancelled: false },
  ]
  const plan = planSync(feed, existing, TODAY)
  assert.deepEqual(plan.cancel.map((c) => c.id), ['sl_futur'])
})

test('un agenda vide ou qui ne couvre que les prochaines semaines n’annule rien au-delà', () => {
  const existing = [{ id: 'sl_loin', source: 'sportlink', status: 'scheduled', date: '2027-02-20', opponent: 'Loin' }]
  assert.equal(planSync([], existing, TODAY).cancel.length, 0)
  const feed = [{ id: 'sl_a', externalId: 'a', date: '2026-10-10', time: null, opponent: 'Proche', home: true, venue: null, details: null, cancelled: false }]
  assert.equal(planSync(feed, existing, TODAY).cancel.length, 0)
})

const ev = (externalId, date, opponent, extra = {}) => ({ externalId, date, time: '14:30', opponent, home: true, venue: 'Club', details: null, cancelled: false, ...extra })

test('identifiant Sportlink changé : le match existant est repris, ni dupliqué ni annulé', async () => {
  const before = await withIds([ev('ancien-uid', '2026-10-04', 'Dragons H4')])
  const existing = [{ ...before[0], source: 'sportlink', status: 'scheduled' }]
  const after = await withIds([ev('nouvel-uid', '2026-10-04', 'Dragons H4'), ev('nouveau-match', '2026-10-11', 'Léopold H3')])
  const plan = planSync(after, existing, TODAY)
  assert.deepEqual(plan.create.map((c) => c.data.opponent), ['Léopold H3'])
  assert.equal(plan.cancel.length, 0)
  assert.equal(plan.update.length, 1)
  assert.equal(plan.update[0].id, existing[0].id)
  assert.equal(plan.update[0].data.externalId, 'nouvel-uid')
})

test('identifiant changé et match déplacé : repris s’il n’y a qu’un match contre cet adversaire', async () => {
  const [old] = await withIds([ev('ancien-uid', '2026-10-04', 'Dragons H4')])
  const existing = [{ ...old, source: 'sportlink', status: 'scheduled' }]
  const plan = planSync(await withIds([ev('nouvel-uid', '2026-10-18', 'Dragons H4')]), existing, TODAY)
  assert.equal(plan.create.length, 0)
  assert.deepEqual([plan.update[0].id, plan.update[0].data.date], [old.id, '2026-10-18'])
})

test('un match saisi à la main est relié à son événement au lieu d’être dupliqué', async () => {
  const existing = [{ id: 'manuel', status: 'scheduled', date: '2026-10-04', opponent: 'dragons h4', homeScore: null }]
  const plan = planSync(await withIds([ev('uid', '2026-10-04', 'Dragons H4')]), existing, TODAY)
  assert.equal(plan.create.length, 0)
  assert.equal(plan.update[0].id, 'manuel')
  assert.equal(plan.update[0].data.source, 'sportlink')
  const writes = syncWrites(plan, { events: 1, created: 0, updated: 1, cancelled: 0, removed: 0 }, { actorUid: 'u', actorName: 'B', actorRole: 'admin' }, 'NOW')
  assert.equal(writes[0].path, 'matches/manuel')
})

test('les doublons annulés laissés par une ancienne synchronisation sont retirés', async () => {
  const [cur] = await withIds([ev('nouvel-uid', '2026-10-04', 'Dragons H4')])
  const existing = [
    { ...cur, source: 'sportlink', status: 'scheduled' },
    { id: 'sl_vieux', externalId: 'ancien-uid', source: 'sportlink', status: 'scheduled', cancelled: true, date: '2026-10-04', opponent: 'Dragons H4' },
    { id: 'sl_vote', externalId: 'x', source: 'sportlink', status: 'voting', cancelled: true, date: '2026-10-04', opponent: 'Dragons H4' },
  ]
  const plan = planSync([cur], existing, TODAY)
  assert.deepEqual(plan.remove.map((r) => r.id), ['sl_vieux'])
  assert.equal(plan.create.length + plan.update.length + plan.cancel.length, 0)
  const writes = syncWrites(plan, { events: 1, created: 0, updated: 0, cancelled: 0, removed: 1 }, { actorUid: 'u', actorName: 'B', actorRole: 'admin' }, 'NOW')
  assert.deepEqual(writes[0], { kind: 'delete', path: 'matches/sl_vieux' })
})

test('une synchronisation relancée sans changement n’écrit aucun match', async () => {
  const feed = await withIds(eventsToMatches(ICS))
  const first = planSync(feed, [], TODAY)
  const existing = first.create.map((c) => ({ id: c.id, ...c.data, source: 'sportlink', status: 'scheduled' }))
  const again = planSync(feed, existing, TODAY)
  assert.equal(again.create.length + again.update.length + again.cancel.length + again.remove.length, 0)
})

test('écritures : match créé « à venir », journal, bilan ; le lien n’apparaît nulle part', async () => {
  const { plan, summary } = await prepareSync(ICS, [], { now: new Date('2026-10-01T08:00:00Z') })
  assert.deepEqual(summary, { events: 3, created: 3, updated: 0, cancelled: 0, removed: 0 })
  const writes = syncWrites(plan, summary, { actorUid: 'u', actorName: 'Bruno', actorRole: 'admin' }, 'NOW')
  const created = writes.find((w) => w.kind === 'set' && w.path.startsWith('matches/'))
  assert.equal(created.data.status, 'scheduled')
  assert.equal(created.data.source, 'sportlink')
  assert.equal(writes.filter((w) => w.kind === 'add').length, 3)
  const last = writes.at(-1)
  assert.equal(last.path, 'config/calendar')
  assert.equal(last.data.lastSync.by, 'Bruno')
  assert.ok(!JSON.stringify(writes).includes('token'))
})

test('un contenu qui n’est pas un agenda est refusé', async () => {
  await assert.rejects(prepareSync('<html>Erreur</html>', []), /pas un agenda/)
})
