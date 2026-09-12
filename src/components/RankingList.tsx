import type { Player } from '@/lib/types'
import type { RankRow } from '@/lib/rankings'
import { cx, playerName, pluralize } from '@/lib/format'
import { Avatar } from './ui'

const medals = ['🥇', '🥈', '🥉']

export function RankingList({ rows, players, tone = 'accent', unit = 'voix', unitPlural, max = 10, empty = 'Pas encore de données.' }: { rows: RankRow[]; players: Map<string, Player>; tone?: 'accent' | 'rose' | 'sky' | 'gold'; unit?: string; unitPlural?: string; max?: number; empty?: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-[13px] text-muted">{empty}</p>
  const top = rows[0].count
  const bar = tone === 'rose' ? 'bg-rose' : tone === 'sky' ? 'bg-sky' : tone === 'gold' ? 'bg-gold' : 'bg-accent'
  return (
    <ol className="space-y-2">
      {rows.slice(0, max).map((r, i) => {
        const p = players.get(r.playerId)
        return (
          <li key={r.playerId} className="rise flex items-center gap-3" style={{ animationDelay: `${i * 30}ms` }}>
            <span className="w-6 text-center text-[15px]">{medals[i] ?? <span className="text-[12px] font-semibold text-muted">{i + 1}</span>}</span>
            <Avatar player={p} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cx('truncate text-[14px]', i === 0 ? 'font-semibold' : 'font-medium')}>{playerName(p)}</span>
                <span className="shrink-0 text-[12px] font-medium text-muted">{pluralize(r.count, unit, unitPlural)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={cx('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${Math.max(6, (r.count / top) * 100)}%` }} />
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
