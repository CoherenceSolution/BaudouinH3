import { useMemo, useState } from 'react'
import { Plus, Vote } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useMatches, usePlayers } from '@/hooks/useData'
import { Button, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { MatchCard } from '@/components/MatchCard'
import { MatchFormModal } from '@/components/MatchFormModal'
import { seasonOf } from '@/lib/format'
import { upcomingMatches } from '@/lib/matches'
import { useCategories } from '@/hooks/useSettings'

export function VotesPage() {
  const { isStaff } = useAuth()
  const matches = useMatches()
  const players = usePlayers()
  const [create, setCreate] = useState(false)
  const categories = useCategories()

  const upcoming = useMemo(() => upcomingMatches(matches.data), [matches.data])
  const groups = useMemo(() => {
    const m = new Map<string, typeof matches.data>()
    const shown = new Set(upcoming.map((u) => u.id))
    for (const match of matches.data) {
      if (shown.has(match.id)) continue
      const s = seasonOf(match.date)
      m.set(s, [...(m.get(s) ?? []), match])
    }
    return [...m.entries()]
  }, [matches.data])

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
