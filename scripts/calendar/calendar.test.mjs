import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventsToMatches, parseStart, parseTeams } from '../../src/lib/calendar/ical.ts'
import { describeChanges, matchIdFor, matchKey, planSync, prepareSync, syncWrites } from '../../src/lib/calendar/plan.ts'

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
    { status: 'scheduled', ...a, date: '2026-10-03', time: '20:00', homeScore: 5 },
    { status: 'scheduled', ...b },
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

test('un match à venir retiré de l’agenda est annulé, jamais supprimé ; le passé et le jour même restent', async () => {
  const existing = [
    { id: 'sl_futur', status: 'scheduled', date: '2026-10-20', opponent: 'Futur' },
    { id: 'sl_jour', status: 'scheduled', date: TODAY, opponent: 'Aujourd’hui' },
    { id: 'sl_passe', status: 'closed', date: '2026-09-01', opponent: 'Passé' },
    { id: 'sl_vote', status: 'voting', date: '2026-10-20', opponent: 'Votes lancés' },
  ]
  const autre = (await withIds(eventsToMatches(ICS))).slice(0, 1)
  const plan = planSync(autre, existing, TODAY)
  assert.deepEqual(plan.cancel.map((c) => c.id), ['sl_futur'])
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

test('titres Sportlink collés : « Baudouin H-3-Rapid H-3 »', () => {
  assert.deepEqual(parseTeams('Baudouin H-3-Rapid H-3'), { home: true, opponent: 'Rapid H-3' })
  assert.deepEqual(parseTeams('Leuven H-8-Baudouin H-3'), { home: false, opponent: 'Leuven H-8' })
  assert.deepEqual(parseTeams('Old-Club H-3-Baudouin H-3'), { home: false, opponent: 'Old-Club H-3' })
  assert.equal(matchKey({ opponent: 'Baudouin H-3-Rapid H-3', home: true }), matchKey({ opponent: 'Rapid H-3', home: true }))
  assert.notEqual(matchKey({ opponent: 'Leuven H-7', home: true }), matchKey({ opponent: 'Leuven H-7', home: false }))
})

// Sportlink régénère l'UID de chaque événement à chaque lecture (constaté dans la tâche du matin :
// « 15 matchs ajoutés, 15 annulés » chaque jour).
const feedWithUids = (suffix) =>
  [
    ['2026-10-18', 'Baudouin H-3-Herakles H-6'],
    ['2026-10-25', 'Dragons H-5-Baudouin H-3'],
    ['2027-04-11', 'Herakles H-6-Baudouin H-3'],
  ].map(([date, summary]) => ({ externalId: `${summary}-${suffix}`, date, time: '10:00', ...parseTeams(summary), venue: null, details: null, cancelled: false, summary }))

test('UID différent à chaque lecture : rien n’est recréé ni annulé', async () => {
  const today = '2026-10-11'
  const first = planSync(await withIds(feedWithUids('a')), [], today)
  const existing = first.create.map((c) => ({ id: c.id, status: 'scheduled', ...c.data }))
  const second = planSync(await withIds(feedWithUids('b')), existing, today)
  assert.deepEqual([second.create.length, second.update.length, second.cancel.length, second.purge.length], [0, 0, 0, 0])
})

test('réparation : ancien import (titre entier), doublons annulés supprimés, votes préservés', async () => {
  const today = '2026-10-11'
  const old = (id, extra) => ({ id, status: 'scheduled', date: '2026-10-18', time: '10:00', opponent: 'Baudouin H-3-Herakles H-6', home: true, venue: null, details: null, ...extra })
  const existing = [
    old('sl_jour1', { cancelled: true }),
    old('sl_jour2', { cancelled: true }),
    old('sl_jour3', { cancelled: false }),
    { id: 'sl_dragons', status: 'scheduled', date: '2026-10-25', time: '10:00', opponent: 'Dragons H-5-Baudouin H-3', home: true, cancelled: true },
    { id: 'sl_dragons_vote', status: 'voting', date: '2026-10-25', time: '10:00', opponent: 'Dragons H-5-Baudouin H-3', home: true, cancelled: true },
  ]
  const plan = planSync(await withIds(feedWithUids('c')), existing, today)
  // Le match encore actif est repris et corrigé (adversaire, extérieur), pas recréé.
  assert.deepEqual(plan.update.map((u) => [u.id, u.data.opponent, u.data.home, u.data.cancelled]), [
    ['sl_jour3', 'Herakles H-6', true, false],
    ['sl_dragons_vote', 'Dragons H-5', false, false],
  ])
  assert.equal(plan.create.length, 1, 'seul le match d’avril est nouveau')
  assert.deepEqual(plan.cancel, [])
  assert.deepEqual(plan.purge.map((p) => p.id).sort(), ['sl_dragons', 'sl_jour1', 'sl_jour2'])
})

test('un doublon qui porte des données n’est jamais supprimé', async () => {
  const existing = [
    { id: 'sl_a', status: 'scheduled', date: '2026-10-18', opponent: 'Herakles H-6', home: true, cancelled: false },
    { id: 'sl_b', status: 'scheduled', date: '2026-10-18', opponent: 'Herakles H-6', home: true, cancelled: true },
    { id: 'sl_c', status: 'scheduled', date: '2026-10-18', opponent: 'Herakles H-6', home: true, cancelled: true },
  ]
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x', 'DTSTART:20261018T080000Z', 'SUMMARY:Baudouin H-3-Herakles H-6', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const { plan, summary } = await prepareSync(ics, existing, { now: new Date('2026-10-11T08:00:00Z'), referenced: async () => new Set(['sl_c']) })
  assert.deepEqual(plan.purge.map((p) => p.id), ['sl_b'])
  assert.equal(summary.removed, 1)
  const writes = syncWrites(plan, summary, { actorUid: 'u', actorName: 'Bruno', actorRole: 'admin' }, 'NOW')
  assert.deepEqual(writes.filter((w) => w.kind === 'delete').map((w) => w.path), ['matches/sl_b'])
  // Sans vérification possible, rien n'est supprimé.
  assert.equal((await prepareSync(ics, existing, { now: new Date('2026-10-11T08:00:00Z') })).plan.purge.length, 0)
})

test('un agenda vide n’annule rien', () => {
  const existing = [{ id: 'sl_futur', status: 'scheduled', date: '2026-10-20', opponent: 'Futur' }]
  assert.deepEqual(planSync([], existing, TODAY).cancel, [])
})
