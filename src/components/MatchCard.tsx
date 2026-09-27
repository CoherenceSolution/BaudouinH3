import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, Mic, Vote, CheckCircle2, CalendarClock, Ban, MapPin, Star } from 'lucide-react'
import type { Match } from '@/lib/types'
import { cx, formatDate, matchResult, matchScore, matchTitle } from '@/lib/format'
import { formatTime, mapsUrl } from '@/lib/matches'
import { Badge } from './ui'

export function MatchStatusBadge({ status, cancelled }: { status: Match['status']; cancelled?: boolean }) {
  if (cancelled && status === 'scheduled') return <Badge tone="rose"><Ban className="size-3" /> Annulé</Badge>
  if (status === 'scheduled') return <Badge tone="neutral"><CalendarClock className="size-3" /> À venir</Badge>
  if (status === 'voting') return <Badge tone="accent"><Vote className="size-3" /> Votes ouverts</Badge>
  if (status === 'reading') return <Badge tone="gold"><Mic className="size-3" /> Lecture en cours</Badge>
  return <Badge tone="neutral"><CheckCircle2 className="size-3" /> Terminé</Badge>
}

export function ResultPill({ match }: { match: Match }) {
  const r = matchResult(match)
  const score = matchScore(match)
  if (!score) return match.status === 'scheduled' ? null : <span className="text-[13px] text-muted">Score à venir</span>
  return (
    <span className={cx('rounded-lg px-2 py-0.5 text-[13px] font-bold tabular-nums', r === 'win' ? 'bg-accent-soft text-accent-strong' : r === 'loss' ? 'bg-rose-soft text-rose' : 'bg-slate-100 text-ink-2')}>
      {score}
    </span>
  )
}

/** Lieu cliquable : ouvre l'itinéraire dans Google Maps. */
export function VenueLink({ venue, className }: { venue: string; className?: string }) {
  return (
    <a href={mapsUrl(venue)} target="_blank" rel="noreferrer" className={cx('inline-flex items-start gap-1 hover:underline', className)}>
      <MapPin className="mt-0.5 size-3.5 shrink-0" />
      <span>{venue}</span>
    </a>
  )
}

export function MatchCard({ match, to, meta }: { match: Match; to: string; meta?: React.ReactNode }) {
  const upcoming = match.status === 'scheduled'
  return (
    <Link to={to} className={cx('card flex items-center gap-4 px-4 py-3.5 transition hover:-translate-y-px hover:shadow-md', upcoming && 'opacity-60 hover:opacity-100')}>
      <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-slate-100 py-1.5 leading-tight">
        <span className="text-[16px] font-bold">{formatDate(match.date, { day: 'numeric' })}</span>
        <span className="text-[10px] font-semibold uppercase text-muted">{formatDate(match.date, { month: 'short' }).replace('.', '')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx('truncate text-[15px] font-semibold', match.cancelled && 'line-through')}>{matchTitle(match)}</span>
          <ResultPill match={match} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <MatchStatusBadge status={match.status} cancelled={match.cancelled} />
          {match.time && <span className="font-medium text-ink-2">{formatTime(match.time)}</span>}
          {match.competition && <span>{match.competition}</span>}
          {upcoming && match.venue ? <span className="truncate">{match.venue}</span> : meta}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </Link>
  )
}

/** Le match du jour, mis en avant en tête de liste : grande carte, bordure verte et appel à l'action. */
export function FeaturedMatchCard({ match, to }: { match: Match; to: string }) {
  const action = match.cancelled && match.status === 'scheduled'
    ? 'Voir le match'
    : match.status === 'voting' ? 'Voter maintenant' : match.status === 'reading' ? 'Suivre la lecture' : match.status === 'closed' ? 'Voir les résultats' : 'Voir le match'
  return (
    <Link to={to} className="card block overflow-hidden border-2 border-accent-strong shadow-md ring-4 ring-accent-soft transition hover:-translate-y-px hover:shadow-lg">
      <div className="flex items-center gap-2 bg-ink px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-accent">
        <Star className="size-3.5 fill-current" /> Match du jour
        <span className="ml-auto font-semibold normal-case tracking-normal text-white/70">{formatDate(match.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx('text-[20px] font-extrabold leading-tight sm:text-[22px]', match.cancelled && 'line-through')}>{matchTitle(match)}</span>
          <ResultPill match={match} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <MatchStatusBadge status={match.status} cancelled={match.cancelled} />
          {match.time && <span className="font-semibold text-ink-2">{formatTime(match.time)}</span>}
          {match.competition && <span>{match.competition}</span>}
          {match.venue && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5 shrink-0" />{match.venue}</span>}
        </div>
        <span className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-[15px] font-bold text-ink">
          {action} <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  )
}
