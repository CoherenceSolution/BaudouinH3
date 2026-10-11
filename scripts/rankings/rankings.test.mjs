import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leaders, titleRanking } from '../../src/lib/rankings.ts'

const entry = (playerId = null) => ({ playerId, proposal: '', comment: '' })
let n = 0
const ticket = (matchId, best, worst = null) => ({
  id: `t${n++}`, matchId, best: entry(best), worst: entry(worst), moment: entry(),
  status: 'submitted', readAt: { toMillis: () => n },
})

test('compte les matchs remportés plutôt que les voix', () => {
  const tickets = [
    // Match A : ana écrase avec 5 voix.
    ...Array.from({ length: 5 }, () => ticket('A', 'ana')),
    ticket('A', 'bob'),
    // Matchs B et C : bob gagne de justesse.
    ticket('B', 'bob'), ticket('B', 'bob'), ticket('B', 'ana'),
    ticket('C', 'bob'), ticket('C', 'bob'),
  ]
  assert.deepEqual(titleRanking(tickets, 'best'), [
    { playerId: 'bob', count: 2, votes: 5 },
    { playerId: 'ana', count: 1, votes: 6 },
  ])
})

test('les ex æquo d’un match remportent chacun le titre', () => {
  const tickets = [ticket('A', 'ana'), ticket('A', 'bob'), ticket('A', 'cy', 'ana')]
  assert.deepEqual(titleRanking(tickets, 'best').map((r) => r.playerId).sort(), ['ana', 'bob', 'cy'])
  assert.deepEqual(titleRanking(tickets, 'worst'), [{ playerId: 'ana', count: 1, votes: 1 }])
})

test('leaders renvoie toutes les égalités en tête', () => {
  assert.deepEqual(leaders([]), [])
  assert.deepEqual(leaders([{ playerId: 'a', count: 3 }, { playerId: 'b', count: 3 }, { playerId: 'c', count: 1 }]).map((r) => r.playerId), ['a', 'b'])
})

test('top 5 avec ex æquo : rangs sportifs, ex æquo du dernier rang gardés', async () => {
  const { topWithTies } = await import('../../src/lib/rankings.ts')
  const rows = [9, 7, 7, 5, 4, 4, 4, 1].map((count, i) => ({ playerId: `p${i}`, count }))
  const top = topWithTies(rows, 5)
  assert.deepEqual(top.rows.map((r) => [r.count, r.rank]), [[9, 1], [7, 2], [7, 2], [5, 4], [4, 5], [4, 5], [4, 5]])
  assert.equal(top.hidden, 0)
  const many = topWithTies(Array.from({ length: 12 }, (_, i) => ({ playerId: `x${i}`, count: 1 })), 3)
  assert.deepEqual([many.rows.length, many.hidden], [6, 6])
})
