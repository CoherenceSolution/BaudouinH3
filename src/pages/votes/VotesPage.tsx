import { useMemo, useState } from 'react'
import { Plus, Vote } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useMatches, usePlayers } from '@/hooks/useData'
import { Button, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { MatchCard } from '@/components/MatchCard'
import { MatchFormModal } from '@/components/MatchFormModal'
import { seasonOf } from '@/lib/format'

export function VotesPage() {
  const { isStaff } = useAuth()
  const matches = useMatches()
  const players = usePlayers()
  const [create, setCreate] = useState(false)

  const groups = useMemo(() => {
    const m = new Map<string, typeof matches.data>()
    for (const match of matches.data) {
      const s = seasonOf(match.date)
      m.set(s, [...(m.get(s) ?? []), match])
    }
    return [...m.entries()]
  }, [matches.data])

  return (
    <div>
      <PageHeader
        title="Votes du match"
        subtitle="Meilleur joueur, pire joueur et geste marquant, à chaque match."
        actions={isStaff && <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Nouveau match</Button>}
      />
      {matches.loading ? (
        <Spinner />
      ) : matches.data.length === 0 ? (
        <EmptyState icon={<Vote className="size-6" />} title="Aucun match pour le moment" description={isStaff ? 'Créez le premier match pour ouvrir les votes.' : 'Le secrétaire ouvrira les votes après le match.'} action={isStaff && <Button onClick={() => setCreate(true)}>Créer un match</Button>} />
      ) : (
        <div className="space-y-6">
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
