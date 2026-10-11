import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duplicateCopies, todayMatches, withCleanTeams } from '../../src/lib/matches.ts'
import { matchTitle } from '../../src/lib/format.ts'

const m = (id, o) => ({ id, date: '2026-10-18', time: '10:00', opponent: 'Herakles H-6', home: true, status: 'scheduled', homeScore: null, awayScore: null, ...o })

test('copies annulées en double masquées ; le vrai match et un match annulé seul restent', () => {
  const list = [
    m('a', { cancelled: true, opponent: 'Baudouin H-3-Herakles H-6' }),
    m('b', { cancelled: true }),
    m('c', { cancelled: false }),
    m('d', { cancelled: true, date: '2026-11-08', opponent: 'Indiana H-5' }),
    // Copies d'un match dont les votes ont commencé : c'est lui qui est gardé.
    m('e', { cancelled: true, date: '2026-10-11', opponent: 'Victory H-4', home: false }),
    m('f', { cancelled: false, status: 'voting', date: '2026-10-11', opponent: 'Victory H-4-Baudouin H-3' }),
  ]
  assert.deepEqual([...duplicateCopies(list)].sort(), ['a', 'b', 'e'])
})

test('ancien import au titre entier : titre lisible, domicile corrigé, score de Baudouin conservé', () => {
  const old = m('x', { opponent: 'Victory H-4-Baudouin H-3', home: true, homeScore: 3, awayScore: 1 })
  const clean = withCleanTeams(old)
  assert.equal(matchTitle(clean), 'Victory H-4 – Baudouin H3')
  assert.equal(clean.home, false)
  // Baudouin avait 3 (saisi comme « domicile ») : il garde 3, désormais côté extérieur.
  assert.deepEqual([clean.homeScore, clean.awayScore], [1, 3])
  const ok = m('y', { opponent: 'Rapid H-3' })
  assert.equal(withCleanTeams(ok), ok)
})

test('un match annulé n’est jamais « match du jour »', () => {
  const list = [m('a', { date: '2026-10-11', cancelled: true }), m('b', { date: '2026-10-11', cancelled: false, status: 'voting' })]
  assert.deepEqual(todayMatches(list, '2026-10-11').map((x) => x.id), ['b'])
})
