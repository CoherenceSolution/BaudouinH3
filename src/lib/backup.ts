import { collection, getDocs, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import { buildZip, type ZipEntry } from './zip'
import type { Player } from './types'
import { playerFullLabel } from './format'

/** Collections exportées, dans l'ordre d'apparition dans l'archive. */
export const BACKUP_COLLECTIONS = [
  'players',
  'staff',
  'matches',
  'tickets',
  'likes',
  'goals',
  'fineTypes',
  'fines',
  'statCategories',
  'statEntries',
  'activity',
] as const

type Row = Record<string, unknown>

/** Convertit les valeurs Firestore (Timestamp, objets imbriqués) en valeurs sérialisables. */
function plain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(plain)
  if (value && typeof value === 'object') {
    const out: Row = {}
    for (const [k, v] of Object.entries(value as Row)) out[k] = plain(v)
    return out
  }
  return value
}

/** Aplatit un objet imbriqué : { best: { playerId } } → { best_playerId }. */
function flatten(row: Row, prefix = ''): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    const key = prefix ? `${prefix}_${k}` : k
    if (Array.isArray(v)) out[key] = v.join('|')
    else if (v && typeof v === 'object') Object.assign(out, flatten(v as Row, key))
    else out[key] = v
  }
  return out
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV avec séparateur point-virgule et BOM UTF-8, lisible directement dans Excel en français. */
export function toCsv(rows: Row[], firstColumns: string[] = ['id']): string {
  const cols = [...firstColumns]
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  const lines = [cols.join(';'), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(';'))]
  return '﻿' + lines.join('\r\n')
}

async function fetchCollection(name: string): Promise<Row[]> {
  const snap = await getDocs(collection(db, name))
  return snap.docs.map((d) => ({ id: d.id, ...(plain(d.data()) as Row) }))
}

const NAME_FIELDS: Record<string, string[]> = {
  tickets: ['authorPlayerId', 'coAuthorPlayerId', 'best_playerId', 'worst_playerId', 'moment_playerId'],
  likes: ['voterPlayerId'],
  goals: ['scorerPlayerId', 'assistPlayerId'],
  fines: ['playerId'],
  statEntries: ['playerId'],
}

/**
 * Lit toutes les collections et construit une archive ZIP :
 *  - un CSV par collection, avec les noms des joueurs ajoutés à côté des identifiants ;
 *  - un export JSON brut complet (backup.json), fidèle à la base ;
 *  - un fichier LISEZMOI.txt.
 */
export async function buildBackup(onProgress?: (step: string) => void): Promise<{ blob: Blob; filename: string; counts: Record<string, number> }> {
  const data: Record<string, Row[]> = {}
  const counts: Record<string, number> = {}
  for (const name of BACKUP_COLLECTIONS) {
    onProgress?.(name)
    data[name] = await fetchCollection(name)
    counts[name] = data[name].length
  }

  const players = new Map<string, string>()
  for (const p of data.players as unknown as Player[]) players.set(p.id, playerFullLabel(p))
  const matches = new Map<string, string>()
  for (const m of data.matches) matches.set(String(m.id), `${m.date} ${m.opponent}`)

  const enc = { encode: (t: string) => new TextEncoder().encode(t) as Uint8Array<ArrayBuffer> }
  const entries: ZipEntry[] = []
  const now = new Date()
  const stamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', 'h')

  for (const name of BACKUP_COLLECTIONS) {
    const rows = data[name].map((r) => flatten(r))
    for (const r of rows) {
      for (const f of NAME_FIELDS[name] ?? []) {
        if (r[f]) r[f.replace(/Id$/, '')] = players.get(String(r[f])) ?? ''
      }
      if (r.matchId) r.match = matches.get(String(r.matchId)) ?? ''
    }
    entries.push({ name: `csv/${name}.csv`, data: enc.encode(toCsv(rows)) })
  }

  entries.push({
    name: 'backup.json',
    data: enc.encode(JSON.stringify({ exportedAt: now.toISOString(), project: 'baudouin-h3', collections: data }, null, 2)),
  })
  entries.push({
    name: 'LISEZMOI.txt',
    data: enc.encode(
      [
        `Sauvegarde Baudouin H3 — ${now.toLocaleString('fr-BE')}`,
        '',
        'csv/          un fichier par table, séparateur « ; », encodage UTF-8 (ouvrir dans Excel ou LibreOffice).',
        '              Les colonnes *Id contiennent les identifiants techniques ; les colonnes voisines (ex. « scorerPlayer »)',
        '              contiennent les noms correspondants pour la lecture.',
        'backup.json   export complet et fidèle de la base, utilisable pour une restauration.',
        '',
        ...BACKUP_COLLECTIONS.map((c) => `${c.padEnd(16)} ${counts[c]} enregistrement(s)`),
      ].join('\r\n'),
    ),
  })

  return { blob: buildZip(entries, now), filename: `baudouin-h3-sauvegarde-${stamp}.zip`, counts }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
