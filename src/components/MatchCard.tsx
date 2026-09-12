import { Link } from 'react-router-dom'
import { ChevronRight, Mic, Vote, CheckCircle2 } from 'lucide-react'
import type { Match } from '@/lib/types'
import { cx, formatDate, matchResult, matchScore, matchTitle } from '@/lib/format'
import { Badge } from './ui'

export function MatchStatusBadge({ status }: { status: Match['status'] }) {
  if (status === 'voting') return <Badge tone="accent"><Vote className="size-3" /> Votes ouverts</Badge>
  if (status === 'reading') return <Badge tone="gold"><Mic className="size-3" /> Lecture en cours</Badge>
  return <Badge tone="neutral"><CheckCircle2 className="size-3" /> Terminé</Badge>
}

export function ResultPill({ match }: { match: Match }) {
  const r = matchResult(match)
  const score = matchScore(match)
  if (!score) return <span className="text-[13px] text-muted">Score à venir</span>
  return (
    <span className={cx('rounded-lg px-2 py-0.5 text-[13px] font-bold tabular-nums', r === 'win' ? 'bg-accent-soft text-accent-strong' : r === 'loss' ? 'bg-rose-soft text-rose' : 'bg-slate-100 text-ink-2')}>
      {score}
    </span>
  )
}

export function MatchCard({ match, to, meta }: { match: Match; to: string; meta?: React.ReactNode }) {
  return (
    <Link to={to} className="card flex items-center gap-4 px-4 py-3.5 transition hover:-translate-y-px hover:shadow-md">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-slate-100 py-1.5 leading-tight">
        <span className="text-[16px] font-bold">{formatDate(match.date, { day: 'numeric' })}</span>
        <span className="text-[10px] font-semibold uppercase text-muted">{formatDate(match.date, { month: 'short' }).replace('.', '')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{matchTitle(match)}</span>
          <ResultPill match={match} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <MatchStatusBadge status={match.status} />
          {match.competition && <span>{match.competition}</span>}
          {meta}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </Link>
  )
}
