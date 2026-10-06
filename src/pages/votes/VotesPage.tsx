import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Vote } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useMatches, usePlayers } from '@/hooks/useData'
import { Button, EmptyState, PageHeader, Spinner, Tabs } from '@/components/ui'
import { FeaturedMatchCard, MatchCard } from '@/components/MatchCard'
import { MatchFormModal } from '@/components/MatchFormModal'
import type { Match } from '@/lib/types'
import { formatDate, seasonOf } from '@/lib/format'
import { matchMatchesQuery, relativeDay, todayMatches, upcomingMatches } from '@/lib/matches'
import { useCategories } from '@/hooks/useSettings'

type View = 'upcoming' | 'played' | 'cancelled'

/** Regroupe une liste déjà triée sous des intertitres (mois ou saison), dans l'ordre d'apparition. */
function groupBy(list: Match[], key: (m: Match) => string): [string, Match[]][] {
  const m = new Map<string, Match[]>()
  for (const match of list) m.set(key(match), [...(m.get(key(match)) ?? []), match])
  return [...m.entries()]
}

const monthOf = (m: Match) => {
  const label = formatDate(m.date, { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Liste des matchs, du plus utile au moins utile :
 * à l'affiche, le match du jour (ou, à défaut, le prochain match) ; puis trois onglets
 * « À venir » (du plus proche au plus lointain), « Joués » (du plus récent au plus ancien) et « Annulés ».
 */
export function VotesPage() {
  const { isStaff } = useAuth()
  const matches = useMatches()
  const players = usePlayers()
  const [create, setCreate] = useState(false)
  const categories = useCategories()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')

  const sorted = useMemo(() => {
    const today = todayMatches(matches.data)
    const featured = today.length > 0 ? today : upcomingMatches(matches.data).filter((m) => !m.cancelled).slice(0, 1)
    const shown = new Set(featured.map((m) => m.id))
    const rest = matches.data.filter((m) => !shown.has(m.id) && matchMatchesQuery(m, q))
    const isCancelled = (m: Match) => Boolean(m.cancelled) && m.status === 'scheduled'
    const upcomingIds = new Set(upcomingMatches(rest).map((m) => m.id))
    return {
      featured,
      isToday: today.length > 0,
      upcoming: upcomingMatches(rest).filter((m) => !isCancelled(m)),
      // Les matchs arrivent triés du plus récent au plus ancien.
      played: rest.filter((m) => !upcomingIds.has(m.id) && !isCancelled(m)),
      cancelled: rest.filter(isCancelled),
    }
  }, [matches.data, q])

  const requested = params.get('vue') as View | null
  const view: View = requested && ['upcoming', 'played', 'cancelled'].includes(requested) ? requested : sorted.upcoming.length > 0 || sorted.played.length === 0 ? 'upcoming' : 'played'
  const setView = (v: View) => setParams((p) => { p.set('vue', v); return p }, { replace: true })

  const tabs: { key: View; label: string }[] = [
    { key: 'upcoming', label: `À venir (${sorted.upcoming.length})` },
    { key: 'played', label: `Joués (${sorted.played.length})` },
    ...(sorted.cancelled.length > 0 || view === 'cancelled' ? [{ key: 'cancelled' as View, label: `Annulés (${sorted.cancelled.length})` }] : []),
  ]
  const groups = view === 'upcoming' ? groupBy(sorted.upcoming, monthOf) : view === 'played' ? groupBy(sorted.played, (m) => `Saison ${seasonOf(m.date)}`) : groupBy(sorted.cancelled, monthOf)

  return (
    <div>
      <PageHeader
        title="Votes du match"
        subtitle={categories.map((c) => c.label).join(', ') + ', à chaque match.'}
        actions={isStaff && <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Nouveau match</Button>}
      />
      {matches.loading ? (
        <Spinner />
      ) : matches.data.length === 0 ? (
        <EmptyState icon={<Vote className="size-6" />} title="Aucun match pour le moment" description={isStaff ? 'Les matchs de l’agenda Sportlink arrivent ici tout seuls ; vous pouvez aussi en créer un à la main.' : 'Les matchs apparaîtront ici dès leur publication dans l’agenda.'} action={isStaff && <Button onClick={() => setCreate(true)}>Créer un match</Button>} />
      ) : (
        <div className="space-y-6">
          {sorted.featured.length > 0 && (
            <section aria-label={sorted.isToday ? 'Match du jour' : 'Prochain match'} className="space-y-3">
              {sorted.featured.map((m) => (
                <FeaturedMatchCard key={m.id} match={m} to={`/votes/${m.id}`} label={sorted.isToday ? 'Match du jour' : 'Prochain match'} when={sorted.isToday ? undefined : relativeDay(m.date)} />
              ))}
            </section>
          )}

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="-mx-1 overflow-x-auto px-1">
                <Tabs value={view} onChange={setView} items={tabs} />
              </div>
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un adversaire…" className="field pl-9" aria-label="Rechercher un match" />
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="card px-4 py-8 text-center text-[14px] text-muted">
                {q ? 'Aucun match ne correspond à cette recherche.' : view === 'upcoming' ? 'Aucun autre match à venir pour le moment.' : view === 'played' ? 'Aucun match joué pour le moment.' : 'Aucun match annulé.'}
              </p>
            ) : (
              groups.map(([title, list]) => (
                <div key={title}>
                  <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
                  <div className="space-y-2">
                    {list.map((m) => (
                      <MatchCard key={m.id} match={m} to={`/votes/${m.id}`} meta={view === 'played' ? <span className="text-muted">{players.data.length} joueurs</span> : undefined} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
      <MatchFormModal open={create} onClose={() => setCreate(false)} />
    </div>
  )
}
