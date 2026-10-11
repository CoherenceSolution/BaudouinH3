import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyse, checkOp, detectAlerts, undoOpsOf } from '../src/lib/undoRules.ts'

const at = (min) => ({ toMillis: () => Date.UTC(2026, 9, 11, 12, 0) + min * 60_000 })
let n = 0
const entry = (o) => ({ id: `a${++n}`, actorUid: 'sec', actorName: 'Jarne', actorRole: 'secretary', action: 'update', entity: 'fine', entityId: 'f1', summary: 'x', at: at(0), ...o })

test('une ancienne création reste annulable ; une consultation ne l’est pas', () => {
  assert.deepEqual(undoOpsOf(entry({ action: 'create', entity: 'goal', entityId: 'g1' })), [{ op: 'delete', path: 'goals/g1' }])
  assert.equal(undoOpsOf(entry({ action: 'update', entity: 'ticket', entityId: 't1' })), null)
})

test('une annulation ne dépasse jamais les droits de son auteur', () => {
  const e = entry({ entity: 'ticket', entityId: 'm_p' })
  assert.equal(checkOp({ op: 'update', path: 'fines/f1', data: { paid: false } }, 'staff', e), 'ok')
  assert.equal(checkOp({ op: 'update', path: 'players/p1', data: { role: 'secretary' } }, 'staff', e), 'beyond')
  assert.equal(checkOp({ op: 'set', path: 'staff/x', data: { role: 'admin' } }, 'admin', e), 'forbidden')
  assert.equal(checkOp({ op: 'delete', path: 'identities/x' }, 'admin', e), 'forbidden')
  // Un membre : seulement son propre document de vote.
  assert.equal(checkOp({ op: 'delete', path: 'tickets/m_p' }, 'public', e), 'ok')
  // Le vote de quelqu'un d'autre : jamais d'office, l'admin doit cocher lui-même.
  assert.equal(checkOp({ op: 'delete', path: 'tickets/autre' }, 'public', e), 'beyond')
  assert.equal(checkOp({ op: 'set', path: 'config/bootstrap', data: {} }, 'public', e), 'forbidden')
  assert.equal(checkOp({ op: 'set', path: 'fines/f9', data: {} }, 'public', e), 'beyond')
})

test('conflit : quelqu’un d’autre a modifié les mêmes champs ensuite', () => {
  const mine = entry({ undo: [{ op: 'update', path: 'matches/m1', data: { homeScore: null, updatedAt: null } }], entity: 'match', entityId: 'm1' })
  const otherField = entry({ actorUid: 'adm', actorName: 'Bruno', at: at(5), entity: 'match', entityId: 'm1', undo: [{ op: 'update', path: 'matches/m1', data: { status: 'voting', updatedAt: null } }] })
  const sameField = entry({ actorUid: 'adm', actorName: 'Bruno', at: at(6), entity: 'match', entityId: 'm1', undo: [{ op: 'update', path: 'matches/m1', data: { homeScore: 3 } }] })
  const trust = () => 'staff'
  assert.equal(analyse([mine], [sameField, otherField, mine], trust).get(mine.id).kind, 'conflict')
  assert.equal(analyse([mine], [otherField, mine], trust).get(mine.id).kind, 'ok')
  // Déjà annulée.
  const undo = entry({ actorUid: 'adm', at: at(10), entity: 'undo', undoOf: [mine.id] })
  assert.equal(analyse([mine], [undo, mine], trust).get(mine.id).kind, 'undone')
})

test('alertes : rafale, suppressions en série, plusieurs appareils', () => {
  const list = []
  for (let i = 0; i < 9; i++) list.push(entry({ action: 'create', entity: 'fine', entityId: `f${i}`, at: at(i) }))
  for (let i = 0; i < 3; i++) list.push(entry({ action: 'delete', entity: 'goal', entityId: `g${i}`, at: at(20 + i) }))
  list.push(entry({ actorUid: 'autre-telephone', at: at(30) }))
  const ids = detectAlerts(list.reverse()).map((a) => a.id.split('-')[0])
  assert.ok(ids.includes('burst'))
  assert.ok(ids.includes('deletes'))
  assert.ok(ids.includes('devices'))
})
