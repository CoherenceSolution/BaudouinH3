import { useMemo, useState } from 'react'
import { Plus, Vote } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useMatches, usePlayers } from '@/hooks/useData'
import { Button, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { FeaturedMatchCard, MatchCard } from '@/components/MatchCard'
import { MatchFormModal } from '@/components/MatchFormModal'
import { seasonOf } from '@/lib/format'
import { todayMatches, upcomingMatches } from '@/lib/matches'
import { useCategories } from '@/hooks/useSettings'

export function VotesPage() {
  const { isStaff } = useAuth()
  const matches = useMatches()
  const players = usePlayers()
  const [create, setCreate] = useState(false)
  const categories = useCategories()

  const today = useMemo(() => todayMatches(matches.data), [matches.data])
  const upcoming = useMemo(() => {
    const featured = new Set(today.map((t) => t.id))
    return upcomingMatches(matches.data).filter((m) => !featured.has(m.id))
  }, [matches.data, today])
  const groups = useMemo(() => {
    const m = new Map<string, typeof matches.data>()
    const shown = new Set([...today, ...upcoming].map((u) => u.id))
    for (const match of matches.data) {
      if (shown.has(match.id)) continue
      const s = seasonOf(match.date)
      m.set(s, [...(m.get(s) ?? []), match])
    }
    return [...m.entries()]
  }, [matches.data, today, upcoming])

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
          {today.length > 0 && (
            <section aria-label="Match du jour" className="space-y-3">
              {today.map((m) => <FeaturedMatchCard key={m.id} match={m} to={`/votes/${m.id}`} />)}
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">À venir</h2>
              <div className="space-y-2">
                {upcoming.map((m) => <MatchCard key={m.id} match={m} to={`/votes/${m.id}`} />)}
              </div>
            </section>
          )}
          {groups.map(([season, list]) => (
            <section key={season}>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Saison {season}</h2>
              <div className="space-y-2">
                {list.map((m) => (
                  <MatchCard key={m.id} match={m} to={`/votes/${m.id}`} meta={<span className="text-muted">{players.data.length} joueurs</span>} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <MatchFormModal open={create} onClose={() => setCreate(false)} />
    </div>
  )
}
