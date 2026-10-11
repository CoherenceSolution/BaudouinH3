import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { leaders, topByRank } from '@/lib/rankings'
import { cx } from '@/lib/format'

/** Une ligne du classement : un joueur et sa valeur (buts, matchs remportés, euros…). */
export interface LeaderRow {
  playerId: string
  name: string
  count: number
  /** Détail au survol (ex. « 3 fois · 7 voix »). */
  detail?: string
  /** Total de voix derrière des titres (classements de vote). */
  votes?: number
}

/**
 * Couleur des barres, une par tuile (une seule série par graphique : le titre de la tuile la nomme).
 * Teintes validées (scripts/validate_palette.js de la compétence dataviz) : contraste >= 3:1 sur le blanc,
 * assez saturées pour ne pas se confondre avec le gris du texte.
 */
export const BAR_COLORS = {
  gold: '#d97706',
  rose: '#e11d48',
  violet: '#7c3aed',
  lime: '#65a30d',
  sky: '#0284c7',
} as const

interface Props {
  label: string
  rows: LeaderRow[]
  color: keyof typeof BAR_COLORS
  /** Page des statistiques liées. */
  to: string
  format: (count: number) => string
  /** Phrase sous le nom du premier (ou des premiers ex æquo). */
  describe: (top: LeaderRow, tied: boolean) => string
  empty: string
  /** Chiffre clé à la place du nom du premier (ex. total des amendes impayées). */
  summary?: { value: string; sub: string }
}

/** Lignes au plus dans le graphique d'une tuile, sur téléphone comme sur ordinateur. */
const MAX_ROWS = 5

/**
 * Tuile de classement : le premier (ou les premiers ex æquo) en titre, puis le top 5 en barres
 * horizontales, par rangs entiers : un groupe d'ex æquo est montré en entier ou résumé en une ligne
 * (« 2e rang : 4 ex æquo à 3 »), jamais coupé. Toute la tuile mène aux statistiques liées.
 */
export function LeaderChart({ label, rows, color, to, format, describe, empty, summary }: Props) {
  const ranked = rows.filter((r) => r.count > 0)
  const top = topByRank(ranked, MAX_ROWS)
  const max = ranked[0]?.count ?? 0
  const firsts = leaders(ranked)
  const tied = firsts.length > 1
  const headline = tied
    ? firsts.length > 3
      ? `${firsts.slice(0, 3).map((r) => r.name).join(' · ')} +${firsts.length - 3}`
      : firsts.map((r) => r.name).join(' · ')
    : firsts[0]?.name
  const hue = BAR_COLORS[color]

  return (
    <Link
      to={to}
      className="card group flex flex-col px-4 py-3.5 transition hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      aria-label={`${label} : voir les statistiques`}
    >
      <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-muted">
        <span>{label}{tied && !summary ? ` · ${firsts.length} ex æquo` : ''}</span>
        <ArrowRight className="size-3.5 shrink-0 transition group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>

      {ranked.length === 0 ? (
        <>
          <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">—</div>
          <div className="mt-0.5 text-[12px] text-muted">{empty}</div>
        </>
      ) : (
        <>
          {summary ? (
            <>
              <div className="mt-0.5 text-xl font-bold tracking-tight text-ink">{summary.value}</div>
              <div className="text-[12px] text-muted">{summary.sub}</div>
            </>
          ) : (
            <>
              <div className={cx('mt-0.5 font-bold tracking-tight text-ink', tied ? 'text-[16px] leading-snug' : 'text-xl')} title={firsts.map((r) => r.name).join(', ')}>
                {headline}
              </div>
              <div className="text-[12px] text-muted">{describe(firsts[0], tied)}</div>
            </>
          )}

          {/* Top 5 par rangs entiers : barres fines, valeur au bout, rang en tête. */}
          {top.rows.length > 0 && <ol className="mt-3 space-y-1.5" aria-label={`Classement : ${label}`}>
            {top.rows.map((r) => (
              <li
                key={r.playerId}
                className="grid grid-cols-[1.25rem_minmax(0,7rem)_1fr_auto] items-center gap-2 text-[12px]"
                title={`${r.rank}. ${r.name} — ${r.detail ?? format(r.count)}`}
              >
                <span className="text-right tabular-nums text-muted">{r.rank}</span>
                <span className={cx('truncate', r.rank === 1 ? 'font-semibold text-ink' : 'text-ink-2')}>{r.name}</span>
                <span className="h-2 min-w-0">
                  <span className="block h-2 rounded-r-[4px]" style={{ width: `${Math.max(4, (r.count / max) * 100)}%`, background: hue }} />
                </span>
                <span className="tabular-nums text-ink-2">{format(r.count)}</span>
              </li>
            ))}
          </ol>}
          {top.next && (
            <div className={cx('text-[12px] text-muted', top.rows.length > 0 ? 'mt-1.5' : 'mt-3')}>
              {top.next.size > 1
                ? `${top.next.rank === 1 ? '1er' : `${top.next.rank}e`} rang : ${top.next.size} ex æquo à ${format(top.next.count)}`
                : `+ ${top.rest} autre${top.rest > 1 ? 's' : ''}`}
              {top.rest > top.next.size && top.next.size > 1 ? `, puis ${top.rest - top.next.size} autre${top.rest - top.next.size > 1 ? 's' : ''}` : ''}
            </div>
          )}
        </>
      )}
    </Link>
  )
}
