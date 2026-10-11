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

test('top 5 par rangs entiers : jamais un groupe d’ex æquo coupé', async () => {
  const { topByRank } = await import('../../src/lib/rankings.ts')
  const rows = (counts) => counts.map((count, i) => ({ playerId: `p${i}`, count }))
  // Le cas signalé : un premier à 6, puis quatre ex æquo à 3 → les cinq tiennent, tous montrés.
  const a = topByRank(rows([6, 3, 3, 3, 3, 1]), 5)
  assert.deepEqual(a.rows.map((r) => [r.count, r.rank]), [[6, 1], [3, 2], [3, 2], [3, 2], [3, 2]])
  assert.deepEqual([a.next, a.rest], [{ rank: 6, count: 1, size: 1 }, 1])
  // Le groupe du 2e rang ne tient pas en entier : seul le premier est montré, le reste résumé.
  const b = topByRank(rows([6, 3, 3, 3, 3, 3, 1]), 5)
  assert.deepEqual(b.rows.map((r) => r.rank), [1])
  assert.deepEqual([b.next, b.rest], [{ rank: 2, count: 3, size: 5 }, 6])
  const c = topByRank(rows([9, 7, 7, 5, 4, 4, 4, 1]), 5)
  assert.deepEqual(c.rows.map((r) => [r.count, r.rank]), [[9, 1], [7, 2], [7, 2], [5, 4]])
  assert.deepEqual(c.next, { rank: 5, count: 4, size: 3 })
  // Trop d'ex æquo en tête : rien en barres, tout dans le résumé.
  const d = topByRank(rows(Array(8).fill(1)), 5)
  assert.deepEqual([d.rows.length, d.next, d.rest], [0, { rank: 1, count: 1, size: 8 }, 8])
  assert.deepEqual(topByRank([], 5), { rows: [], next: null, rest: 0 })
})
