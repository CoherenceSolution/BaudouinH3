import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeMergeSummary, mergedStatus, newMatchData, planMerge, planMergeIntoNew } from '../../src/lib/matchMerge.ts'

const match = (id, extra = {}) => ({ id, date: '2026-10-10', opponent: 'Dragons', homeScore: null, awayScore: null, home: true, status: 'voting', createdBy: 'x', ...extra })
const entry = (playerId = null, comment = '') => ({ playerId, proposal: '', comment })
const ticket = (matchId, author, { filled = true, ...extra } = {}) => ({
  id: `${matchId}_${author}`, matchId, authorPlayerId: author, coAuthorPlayerId: null, authorUids: [`uid-${author}`],
  best: filled ? entry('p1', 'top') : entry(), worst: filled ? entry('p2') : entry(), moment: entry(),
  status: filled ? 'submitted' : 'draft', readAt: null, readOrder: null, starred: false, saved: false, revealAuthor: false, ...extra,
})
const none = () => ({ tickets: [], likes: [], coums: [], goals: [], fines: [], statEntries: [] })
const writes = (plan) => plan.groups.flat()
const setAt = (plan, path) => writes(plan).find((w) => w.kind === 'set' && w.path === path)

test('chaque vote du doublon passe sur le match conservé, et disparaît du doublon', () => {
  const s = { ...none(), tickets: [ticket('B', 'ana'), ticket('B', 'manual-x1', { manual: true })] }
  const plan = planMerge(match('A'), match('B'), none(), s, { now: 'NOW', by: 'Admin' })
  assert.equal(setAt(plan, 'tickets/A_ana').data.matchId, 'A')
  assert.ok(setAt(plan, 'tickets/A_manual-x1').data.manual)
  assert.deepEqual(writes(plan).filter((w) => w.kind === 'delete').map((w) => w.path).sort(), ['tickets/B_ana', 'tickets/B_manual-x1'])
  // Création et suppression d'un même vote sont toujours dans le même groupe (écriture atomique).
  for (const g of plan.groups) assert.equal(new Set(g.map((w) => w.path.split('/')[0])).size, 1)
  assert.equal(plan.summary.tickets, 2)
})

test('un auteur qui a voté dans les deux matchs garde ses deux votes', () => {
  const t = { ...none(), tickets: [ticket('A', 'ana')] }
  const s = { ...none(), tickets: [ticket('B', 'ana')], likes: [{ id: 'B_bob_best', matchId: 'B', voterPlayerId: 'bob', category: 'best', ticketId: 'B_ana' }] }
  const plan = planMerge(match('A'), match('B'), t, s, { now: 'NOW', by: 'Admin' })
  const dup = setAt(plan, 'tickets/A_ana__B')
  assert.ok(dup && dup.data.mergeDuplicate)
  assert.equal(setAt(plan, 'tickets/A_ana'), undefined, 'le vote conservé n’est pas écrasé')
  assert.equal(setAt(plan, 'likes/A_bob_best').data.ticketId, 'A_ana__B', 'le coup de cœur suit son vote')
  assert.equal(plan.summary.duplicates, 1)
})

test('un brouillon vide ne remplace pas un vrai vote, mais un vrai vote remplace un brouillon vide', () => {
  const t1 = { ...none(), tickets: [ticket('A', 'ana')] }
  const p1 = planMerge(match('A'), match('B'), t1, { ...none(), tickets: [ticket('B', 'ana', { filled: false })] }, { now: 0, by: '' })
  assert.equal(writes(p1).filter((w) => w.kind === 'set').length, 0)
  const t2 = { ...none(), tickets: [ticket('A', 'ana', { filled: false, authorUids: ['u1'] })] }
  const p2 = planMerge(match('A'), match('B'), t2, { ...none(), tickets: [ticket('B', 'ana', { authorUids: ['u2'] })] }, { now: 0, by: '' })
  const w = setAt(p2, 'tickets/A_ana')
  assert.equal(w.data.best.playerId, 'p1')
  assert.deepEqual(w.data.authorUids, ['u1', 'u2'])
})

test('coups de cœur en double : les deux sont gardés', () => {
  const t = { ...none(), likes: [{ id: 'A_bob_best', matchId: 'A', voterPlayerId: 'bob', category: 'best', ticketId: 'A_x' }] }
  const s = { ...none(), likes: [{ id: 'B_bob_best', matchId: 'B', voterPlayerId: 'bob', category: 'best', ticketId: 'B_y' }] }
  const plan = planMerge(match('A'), match('B'), t, s, { now: 0, by: '' })
  assert.ok(setAt(plan, 'likes/A_bob_best__B'))
  assert.equal(setAt(plan, 'likes/A_bob_best'), undefined)
})

test('lecture : l’ordre des votes lus du doublon passe après ceux du match conservé', () => {
  const t = { ...none(), tickets: [ticket('A', 'ana', { readAt: 1, readOrder: 3 })] }
  const s = { ...none(), tickets: [ticket('B', 'bob', { readAt: 1, readOrder: 1 })] }
  const plan = planMerge(match('A', { status: 'reading' }), match('B', { status: 'reading' }), t, s, { now: 0, by: '' })
  assert.equal(setAt(plan, 'tickets/A_bob').data.readOrder, 4)
})

test('la coum de la même soirée se combine sans perdre un paiement', () => {
  const t = { ...none(), coums: [{ id: 'A_ana', matchId: 'A', playerId: 'ana', rounds: 1, paid: 0, absent: false }] }
  const s = { ...none(), coums: [{ id: 'B_ana', matchId: 'B', playerId: 'ana', rounds: 2, paid: 2, absent: false }, { id: 'B_bob', matchId: 'B', playerId: 'bob', rounds: 1, paid: 1, absent: false }] }
  const plan = planMerge(match('A'), match('B'), t, s, { now: 0, by: '' })
  const upd = writes(plan).find((w) => w.path === 'coums/A_ana')
  assert.deepEqual({ rounds: upd.data.rounds, paid: upd.data.paid, absent: upd.data.absent }, { rounds: 2, paid: 2, absent: false })
  assert.equal(setAt(plan, 'coums/A_bob').data.matchId, 'A')
})

test('buts, amendes et listes changent de match ; le doublon est marqué fusionné, pas supprimé', () => {
  const t = { ...none(), goals: [{ id: 'g1', matchId: 'A', scorerPlayerId: 'x', assistPlayerId: null, minute: null, order: 0 }] }
  const s = {
    ...none(),
    goals: [{ id: 'g2', matchId: 'B', scorerPlayerId: 'y', assistPlayerId: null, minute: null, order: 0 }],
    fines: [{ id: 'f1', matchId: 'B' }],
    statEntries: [{ id: 'e1', matchId: 'B' }],
  }
  const plan = planMerge(match('A'), match('B', { homeScore: 3, awayScore: 1, venue: 'Terrain 2' }), t, s, { now: 'NOW', by: 'Admin' })
  assert.deepEqual(writes(plan).find((w) => w.path === 'goals/g2').data, { matchId: 'A', order: 1 })
  assert.equal(writes(plan).find((w) => w.path === 'fines/f1').data.matchId, 'A')
  assert.equal(writes(plan).find((w) => w.path === 'statEntries/e1').data.matchId, 'A')
  const [targetPatch, sourcePatch] = plan.matchWrites
  assert.equal(targetPatch.data.homeScore, 3)
  assert.equal(targetPatch.data.venue, 'Terrain 2')
  assert.equal(sourcePatch.data.mergedInto, 'A')
  assert.ok(!plan.matchWrites.some((w) => w.kind === 'delete'))
  assert.equal(describeMergeSummary(plan.summary), '1 but, 1 amende, 1 entrée de liste')
})

test('état après fusion : des votes ouverts d’un côté restent ouverts', () => {
  assert.equal(mergedStatus('voting', 'closed', false), 'voting')
  assert.equal(mergedStatus('reading', 'closed', false), 'reading')
  assert.equal(mergedStatus('closed', 'closed', true), 'reading')
  assert.equal(mergedStatus('closed', 'closed', false), 'closed')
  assert.equal(mergedStatus('scheduled', 'scheduled', false), 'scheduled')
})

test('deux doublons → un troisième match qui reçoit tout, les deux anciens masqués', () => {
  const a = match('A', { venue: 'Terrain 1' })
  const b = match('B', { homeScore: 2, awayScore: 0 })
  const da = { ...none(), tickets: [ticket('A', 'ana'), ticket('A', 'bob')], coums: [{ id: 'A_ana', matchId: 'A', playerId: 'ana', rounds: 1, paid: 1, absent: false }] }
  const db = {
    ...none(),
    tickets: [ticket('B', 'ana'), ticket('B', 'cid')],
    likes: [{ id: 'B_bob_best', matchId: 'B', voterPlayerId: 'bob', category: 'best', ticketId: 'B_ana' }],
    coums: [{ id: 'B_ana', matchId: 'B', playerId: 'ana', rounds: 1, paid: 0, absent: false }],
    goals: [{ id: 'g1', matchId: 'B', scorerPlayerId: 'x', assistPlayerId: null, minute: null, order: 0 }],
  }
  const data = newMatchData(a, 'admin', 'NOW')
  assert.equal(data.venue, 'Terrain 1')
  assert.equal(data.source, undefined, 'le nouveau match n’est pas relié à Sportlink')
  const c = { id: 'C', ...data }
  const { first, second, summary } = planMergeIntoNew(c, a, b, da, db, { now: 'NOW', by: 'Admin' })
  const all = [...first.groups.flat(), ...second.groups.flat()]
  const sets = all.filter((w) => w.kind === 'set').map((w) => w.path).sort()
  assert.deepEqual(sets, ['coums/C_ana', 'likes/C_bob_best', 'tickets/C_ana', 'tickets/C_ana__B', 'tickets/C_bob', 'tickets/C_cid'])
  // La coum d'Ana payée dans A n'est pas écrasée par celle de B : elle est combinée.
  assert.equal(all.find((w) => w.kind === 'update' && w.path === 'coums/C_ana').data.paid, 1)
  assert.equal(all.find((w) => w.path === 'likes/C_bob_best').data.ticketId, 'C_ana__B')
  assert.equal(all.find((w) => w.path === 'goals/g1').data.matchId, 'C')
  // Le score de B comble le manque.
  assert.equal(second.matchWrites[0].data.homeScore, 2)
  assert.deepEqual([first.matchWrites[1].data.mergedInto, second.matchWrites[1].data.mergedInto], ['C', 'C'])
  assert.equal(summary.tickets, 4)
  assert.equal(summary.duplicates, 1)
})
