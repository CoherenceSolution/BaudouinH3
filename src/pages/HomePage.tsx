import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Euro, MapPin, Mic, Trophy, Vote, Target, Sparkles } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useAllGoals, useAllReadTickets, useFines, useMatches, usePlayers } from '@/hooks/useData'
import { currentSeason, formatDate, matchTitle, playerName, seasonOf } from '@/lib/format'
import { formatTime, isPlayed, nextMatch } from '@/lib/matches'
import { goalTotals, nominationRanking, readTickets } from '@/lib/rankings'
import { formatEuro } from '@/lib/fines'
import { useCategories } from '@/hooks/useSettings'
import { Card, Stat } from '@/components/ui'
import { MatchCard, MatchStatusBadge } from '@/components/MatchCard'

export function HomePage() {
  const { identity, staff, isStaff } = useAuth()
  const players = usePlayers(true)
  const matches = useMatches()
  const fines = useFines()
  const goals = useAllGoals()
  const tickets = useAllReadTickets()
  const season = currentSeason()
  const categories = useCategories()

  const me = identity ? players.byId.get(identity.playerId) : null
  const live = matches.data.find((m) => m.status === 'voting' || m.status === 'reading')
  const next = nextMatch(matches.data)
  const recent = matches.data.filter((m) => m.status === 'closed').slice(0, 3)

  const seasonMatchIds = new Set(matches.data.filter((m) => isPlayed(m) && seasonOf(m.date) === season).map((m) => m.id))
  const seasonGoals = goals.data.filter((g) => seasonMatchIds.has(g.matchId))
  const totals = goalTotals(seasonGoals)
  const seasonTickets = readTickets(tickets.data.filter((t) => seasonMatchIds.has(t.matchId)))
  const best = nominationRanking(seasonTickets, 'best')[0]
  const unpaid = fines.data.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0)

  const hour = new Date().getHours()
  const greeting = hour < 18 ? 'Bonjour' : 'Bonsoir'
  const name = me ? me.firstName : (staff?.displayName?.split(' ')[0] ?? '')

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] font-medium text-muted">Saison {season}</p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {greeting}{name ? `, ${name}` : ''} 👋
        </h1>
      </div>

      {live ? (
        <Card className="overflow-hidden">
          <div className="bg-ink px-5 py-5 text-white">
            <div className="mb-2 flex items-center gap-2">
              <MatchStatusBadge status={live.status} />
            </div>
            <div className="text-xl font-bold">{matchTitle(live)}</div>
            <p className="mt-1 text-[13px] text-slate-400">
              {live.status === 'voting'
                ? 'Les votes sont ouverts. Remplissez votre vote avant la lecture.'
                : `Lecture en cours${live.speakerName ? ` par ${live.speakerName}` : ''}. Suivez la lecture et votez pour vos préférés.`}
            </p>
            <Link to={`/votes/${live.id}`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[14px] font-semibold text-ink transition hover:bg-lime-400">
              {identity?.mode === 'speaker' || isStaff ? <Mic className="size-4" /> : <Vote className="size-4" />}
              {identity?.mode === 'speaker' ? 'Ouvrir la console orateur' : isStaff && !identity ? 'Ouvrir le match' : live.status === 'voting' ? 'Remplir mon vote' : 'Suivre la lecture'}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold">Aucun vote en cours</div>
            <div className="text-[13px] text-muted">{isStaff && !next ? 'Créez un match pour ouvrir les votes.' : 'Les votes s’ouvriront le jour du prochain match.'}</div>
          </div>
          {isStaff && (
            <Link to="/votes" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink hover:underline">
              Gérer les matchs <ArrowRight className="size-4" />
            </Link>
          )}
        </Card>
      )}

      {next && (
        <section>
          <h2 className="mb-2 text-[15px] font-semibold">Prochain match</h2>
          <Link to={`/votes/${next.id}`} className="card flex flex-wrap items-center gap-4 px-5 py-4 transition hover:-translate-y-px hover:shadow-md">
            <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-slate-100 py-2 leading-tight">
              <span className="text-[11px] font-semibold uppercase text-muted">{formatDate(next.date, { weekday: 'short' }).replace('.', '')}</span>
              <span className="text-[20px] font-bold">{formatDate(next.date, { day: 'numeric' })}</span>
              <span className="text-[11px] font-semibold uppercase text-muted">{formatDate(next.date, { month: 'short' }).replace('.', '')}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold">{matchTitle(next)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                <span className="inline-flex items-center gap-1 font-medium text-ink-2"><Clock className="size-3.5" /> {next.time ? formatTime(next.time) : 'Heure à confirmer'}</span>
                <span>{next.home ? 'À domicile' : 'À l’extérieur'}</span>
                {next.venue && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="size-3.5 shrink-0" /> <span className="truncate">{next.venue}</span></span>}
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted" />
          </Link>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={categories[0].label} value={best ? playerName(players.byId.get(best.playerId)) : '—'} sub={best ? `${best.count} voix cette saison` : 'Aucune lecture'} tone="gold" />
        <Stat label="Meilleur buteur" value={totals.scorers[0] ? playerName(players.byId.get(totals.scorers[0].playerId)) : '—'} sub={totals.scorers[0] ? `${totals.scorers[0].count} buts` : 'Aucun but encodé'} tone="accent" />
        <Stat label="Meilleur passeur" value={totals.assisters[0] ? playerName(players.byId.get(totals.assisters[0].playerId)) : '—'} sub={totals.assisters[0] ? `${totals.assisters[0].count} passes` : 'Aucune passe encodée'} />
        <Stat label="Amendes impayées" value={formatEuro(unpaid)} sub={`${fines.data.filter((f) => !f.paid).length} en attente`} tone="rose" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink to="/votes" icon={Trophy} title="Votes" desc="Vote, lecture, classements" />
        <QuickLink to="/amendes" icon={Euro} title="Amendes" desc="Barème et retards" />
        <QuickLink to="/stats" icon={Target} title="Buts & passes" desc="Buteurs, passeurs, duos" />
      </div>

      {recent.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Derniers matchs</h2>
            <Link to="/historique" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
              <Sparkles className="size-3.5" /> Rétrospective
            </Link>
          </div>
          <div className="space-y-2">
            {recent.map((m) => <MatchCard key={m.id} match={m} to={`/votes/${m.id}`} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function QuickLink({ to, icon: Icon, title, desc }: { to: string; icon: typeof Trophy; title: string; desc: string }) {
  return (
    <Link to={to} className="card flex items-center gap-3 px-4 py-3.5 transition hover:-translate-y-px hover:shadow-md">
      <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-ink"><Icon className="size-5" /></span>
      <span>
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block text-[12px] text-muted">{desc}</span>
      </span>
      <ArrowRight className="ml-auto size-4 text-muted" />
    </Link>
  )
}
