import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Star, Bookmark, Sparkles, Trophy } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useAllGoals, useAllLikes, useAllReadTickets, useFines, useMatches, usePlayers, useStatCategories, useStatEntries } from '@/hooks/useData'
import { goalTotals, likeCounts, nominationRanking, readTickets } from '@/lib/rankings'
import { currentSeason, formatDate, matchResult, matchTitle, playerName, seasonOf } from '@/lib/format'
import { formatEuro } from '@/lib/fines'
import { Card, PageHeader, SectionTitle, Select, Spinner, Stat } from '@/components/ui'
import { RankingList } from '@/components/RankingList'
import { ResultPill } from '@/components/MatchCard'
import { TicketCard } from '../votes/TicketCard'
import type { VoteCategory } from '@/lib/types'
import { useCategories } from '@/hooks/useSettings'

/** Rétrospective de saison : classements cumulés, tickets étoilés et conservés, buts, amendes. */
export function HistoryPage() {
  const { isStaff } = useAuth()
  const players = usePlayers(true)
  const matches = useMatches()
  const tickets = useAllReadTickets()
  const likes = useAllLikes()
  const goals = useAllGoals()
  const fines = useFines()
  const cats = useStatCategories()
  const entries = useStatEntries()
  const [season, setSeason] = useState(currentSeason())
  const categories = useCategories()

  const seasons = useMemo(() => {
    const s = new Set(matches.data.map((m) => seasonOf(m.date)))
    s.add(currentSeason())
    return [...s].sort().reverse()
  }, [matches.data])

  const seasonMatches = useMemo(() => matches.data.filter((m) => seasonOf(m.date) === season), [matches.data, season])
  const ids = useMemo(() => new Set(seasonMatches.map((m) => m.id)), [seasonMatches])
  const read = useMemo(() => readTickets(tickets.data.filter((t) => ids.has(t.matchId))), [tickets.data, ids])
  const best = useMemo(() => nominationRanking(read, 'best'), [read])
  const worst = useMemo(() => nominationRanking(read, 'worst'), [read])
  const moment = useMemo(() => nominationRanking(read, 'moment'), [read])
  const counts = useMemo(() => likeCounts(likes.data.filter((l) => ids.has(l.matchId))), [likes.data, ids])
  const starred = useMemo(() => read.filter((t) => t.starred), [read])
  const saved = useMemo(() => read.filter((t) => t.saved && !t.starred), [read])
  const totals = useMemo(() => goalTotals(goals.data.filter((g) => ids.has(g.matchId))), [goals.data, ids])
  const seasonFines = useMemo(() => fines.data.filter((f) => seasonOf(f.date) === season), [fines.data, season])
  const fineRows = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of seasonFines) m.set(f.playerId, (m.get(f.playerId) ?? 0) + f.amount)
    return [...m.entries()].map(([playerId, count]) => ({ playerId, count })).sort((a, b) => b.count - a.count)
  }, [seasonFines])

  const mostLiked = useMemo(() => {
    const out: { t: (typeof read)[number]; cat: VoteCategory; n: number }[] = []
    for (const t of read) {
      const c = counts.get(t.id)
      if (!c) continue
      for (const cat of ['best', 'worst', 'moment'] as VoteCategory[]) if (c[cat] > 0) out.push({ t, cat, n: c[cat] })
    }
    return out.sort((a, b) => b.n - a.n).slice(0, 5)
  }, [read, counts])

  const record = useMemo(() => {
    const r = { win: 0, draw: 0, loss: 0 }
    for (const m of seasonMatches) {
      const x = matchResult(m)
      if (x) r[x]++
    }
    return r
  }, [seasonMatches])

  if (players.loading || matches.loading) return <Spinner />

  const byMatch = new Map(seasonMatches.map((m) => [m.id, m]))

  return (
    <div>
      <PageHeader
        title="Rétrospective"
        subtitle="Le bilan de la saison : classements cumulés, votes à retenir, buts et amendes."
        actions={
          <Select value={season} onChange={(e) => setSeason(e.target.value)} className="w-48">
            {seasons.map((s) => <option key={s} value={s}>Saison {s}</option>)}
          </Select>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Matchs" value={seasonMatches.length} sub={`${record.win} V · ${record.draw} N · ${record.loss} D`} />
        <Stat label="Votes lus" value={read.length} sub={`${starred.length} étoilés`} tone="gold" />
        <Stat label="Buts" value={totals.scorers.reduce((s, r) => s + r.count, 0)} tone="accent" />
        <Stat label="Amendes" value={formatEuro(seasonFines.reduce((s, f) => s + f.amount, 0))} tone="rose" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>{categories[0].emoji} {categories[0].label} de la saison</SectionTitle>
          <RankingList rows={best} players={players.byId} tone="gold" unit="voix" empty="Aucun vote lu cette saison." />
        </Card>
        <Card className="p-5">
          <SectionTitle>{categories[1].emoji} {categories[1].label} de la saison</SectionTitle>
          <RankingList rows={worst} players={players.byId} tone="rose" unit="voix" empty="Aucun vote lu cette saison." />
        </Card>
        <Card className="p-5 md:col-span-2">
          <SectionTitle>{categories[2].emoji} {categories[2].label} de la saison</SectionTitle>
          <RankingList rows={moment} players={players.byId} tone="sky" unit="voix" empty="Aucun vote lu cette saison." />
        </Card>
        <Card className="p-5">
          <SectionTitle>⚽ Buteurs</SectionTitle>
          <RankingList rows={totals.scorers} players={players.byId} tone="accent" unit="but" max={5} empty="Aucun but encodé." />
        </Card>
        <Card className="p-5">
          <SectionTitle>🎯 Passeurs</SectionTitle>
          <RankingList rows={totals.assisters} players={players.byId} tone="sky" unit="passe" max={5} empty="Aucune passe encodée." />
        </Card>
        {totals.duos[0] && (
          <Card className="p-5 md:col-span-2">
            <SectionTitle>🤝 Duo de la saison</SectionTitle>
            <p className="text-[15px]"><b>{playerName(players.byId.get(totals.duos[0].assistPlayerId))}</b> a délivré <b>{totals.duos[0].count}</b> passe{totals.duos[0].count > 1 ? 's' : ''} décisive{totals.duos[0].count > 1 ? 's' : ''} à <b>{playerName(players.byId.get(totals.duos[0].scorerPlayerId))}</b>.</p>
          </Card>
        )}
        <Card className="p-5">
          <SectionTitle>💸 Caisse des amendes</SectionTitle>
          <RankingList rows={fineRows} players={players.byId} tone="rose" unit="€" unitPlural="€" max={5} empty="Aucune amende." />
        </Card>
        <Card className="p-5">
          <SectionTitle>🏅 Catégories maison</SectionTitle>
          {cats.data.filter((c) => c.active || isStaff).length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Aucune catégorie.</p>
          ) : (
            <ul className="space-y-2">
              {cats.data.filter((c) => c.active || isStaff).map((c) => {
                const m = new Map<string, number>()
                for (const e of entries.data.filter((e) => e.categoryId === c.id && seasonOf(e.date) === season)) m.set(e.playerId, (m.get(e.playerId) ?? 0) + (e.value || 1))
                const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
                return (
                  <li key={c.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-[14px]">
                    <span>{c.emoji} {c.label}</span>
                    <span className="font-semibold">{top ? `${playerName(players.byId.get(top[0]))} (${top[1]})` : '—'}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {mostLiked.length > 0 && (
        <section className="mt-8">
          <SectionTitle>❤️ Les contributions préférées du public</SectionTitle>
          <div className="space-y-2">
            {mostLiked.map(({ t, cat, n }) => {
              const e = t[cat]
              const m = byMatch.get(t.matchId)
              return (
                <Card key={`${t.id}-${cat}`} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-[13px] font-semibold text-rose">♥ {n}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{categories.find((c) => c.key === cat)?.label}</div>
                    {e.playerId && <div className="text-[14px] font-semibold">{playerName(players.byId.get(e.playerId))}</div>}
                    {(e.comment || e.proposal) && <p className="text-[13px] text-ink-2">{[e.proposal, e.comment].filter(Boolean).join(' — ')}</p>}
                    <div className="mt-1 text-[12px] text-muted">{m ? `${matchTitle(m)} · ${formatDate(m.date)}` : ''}</div>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {starred.length > 0 && (
        <section className="mt-8">
          <SectionTitle><span className="inline-flex items-center gap-1.5"><Star className="size-4 fill-current text-gold" /> Petites étoiles de l’orateur</span></SectionTitle>
          <div className="space-y-3">
            {starred.map((t) => {
              const m = byMatch.get(t.matchId)
              return (
                <div key={t.id}>
                  <div className="mb-1 text-[12px] font-medium text-muted">{m ? `${matchTitle(m)} · ${formatDate(m.date)}` : ''}</div>
                  <TicketCard ticket={t} players={players.byId} likes={counts} showAuthor={false} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {saved.length > 0 && (
        <section className="mt-8">
          <SectionTitle><span className="inline-flex items-center gap-1.5"><Bookmark className="size-4 fill-current text-sky" /> Votes conservés</span></SectionTitle>
          <div className="space-y-3">
            {saved.map((t) => {
              const m = byMatch.get(t.matchId)
              return (
                <div key={t.id}>
                  <div className="mb-1 text-[12px] font-medium text-muted">{m ? `${matchTitle(m)} · ${formatDate(m.date)}` : ''}</div>
                  <TicketCard ticket={t} players={players.byId} likes={counts} showAuthor={false} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="mt-8">
        <SectionTitle><span className="inline-flex items-center gap-1.5"><Trophy className="size-4" /> Matchs de la saison</span></SectionTitle>
        {seasonMatches.length === 0 ? (
          <p className="card px-5 py-8 text-center text-[14px] text-muted">Aucun match.</p>
        ) : (
          <Card className="divide-y divide-line">
            {seasonMatches.map((m) => {
              const mt = readTickets(tickets.data.filter((t) => t.matchId === m.id))
              const b = nominationRanking(mt, 'best')[0]
              return (
                <Link key={m.id} to={`/votes/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-semibold">{matchTitle(m)} <ResultPill match={m} /></div>
                    <div className="text-[12px] text-muted">{formatDate(m.date)} · {mt.length} vote{mt.length > 1 ? 's' : ''} lu{mt.length > 1 ? 's' : ''}{b ? ` · ${categories[0].emoji} ${playerName(players.byId.get(b.playerId))}` : ''}</div>
                  </div>
                  <Sparkles className="size-4 text-muted" />
                </Link>
              )
            })}
          </Card>
        )}
      </section>
    </div>
  )
}
