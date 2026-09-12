import { useMemo } from 'react'
import { Heart } from 'lucide-react'
import type { Like, Player, Ticket, VoteCategory } from '@/lib/types'
import { useCategories } from '@/hooks/useSettings'
import { likeCounts, nominationRanking, readTickets } from '@/lib/rankings'
import { playerName } from '@/lib/format'
import { Card, SectionTitle } from '@/components/ui'
import { RankingList } from '@/components/RankingList'

interface Props {
  players: Map<string, Player>
  tickets: Ticket[]
  likes: Like[]
}

/** Classements du match, mis à jour en temps réel à chaque lecture. */
export function Rankings({ players, tickets, likes }: Props) {
  const categories = useCategories()
  const [cBest, cWorst, cMoment] = categories
  const read = useMemo(() => readTickets(tickets), [tickets])
  const best = useMemo(() => nominationRanking(read, 'best'), [read])
  const worst = useMemo(() => nominationRanking(read, 'worst'), [read])
  const counts = useMemo(() => likeCounts(likes), [likes])

  const favourites = useMemo(() => {
    const out: Record<VoteCategory, { ticket: Ticket; n: number }[]> = { best: [], worst: [], moment: [] }
    for (const t of read) {
      const c = counts.get(t.id)
      if (!c) continue
      for (const cat of ['best', 'worst', 'moment'] as VoteCategory[]) if (c[cat] > 0) out[cat].push({ ticket: t, n: c[cat] })
    }
    for (const cat of Object.keys(out) as VoteCategory[]) out[cat].sort((a, b) => b.n - a.n)
    return out
  }, [read, counts])

  const moments = useMemo(
    () => read.filter((t) => t.moment?.comment || t.moment?.proposal).map((t) => ({ t, n: counts.get(t.id)?.moment ?? 0 })).sort((a, b) => b.n - a.n),
    [read, counts],
  )

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <SectionTitle right={<span className="text-[12px] text-muted">{read.length} votes lus</span>}>{cBest.emoji} {cBest.label}</SectionTitle>
        <RankingList rows={best} players={players} tone="gold" unit="voix" empty="Aucun vote lu pour l’instant." />
      </Card>
      <Card className="p-5">
        <SectionTitle>{cWorst.emoji} {cWorst.label}</SectionTitle>
        <RankingList rows={worst} players={players} tone="rose" unit="voix" empty="Aucun vote lu pour l’instant." />
      </Card>
      <Card className="p-5 md:col-span-2">
        <SectionTitle>{cMoment.emoji} {cMoment.label}</SectionTitle>
        {moments.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Rien de lu pour l’instant.</p>
        ) : (
          <ul className="space-y-2">
            {moments.map(({ t, n }) => (
              <li key={t.id} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <p className="min-w-0 flex-1 whitespace-pre-line text-[14px] text-ink">{[t.moment.proposal, t.moment.comment].filter(Boolean).join(' — ')}{t.moment.playerId && <span className="text-muted"> — {playerName(players.get(t.moment.playerId))}</span>}</p>
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-rose"><Heart className="size-3.5 fill-current" /> {n}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-5 md:col-span-2">
        <SectionTitle>❤️ Coups de cœur du public</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {categories.map((c) => {
            const top = favourites[c.key][0]
            const entry = top?.ticket[c.key]
            const p = entry?.playerId ? players.get(entry.playerId) : undefined
            return (
              <div key={c.key} className="rounded-xl border border-line p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{c.emoji} {c.label}</div>
                {top ? (
                  <>
                    {c.pickPlayer && <div className="mt-1 text-[14px] font-semibold">{playerName(p)}</div>}
                    {(entry?.comment || entry?.proposal) && <p className="mt-0.5 line-clamp-3 text-[13px] text-ink-2">{[entry?.proposal, entry?.comment].filter(Boolean).join(' — ')}</p>}
                    <div className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-rose"><Heart className="size-3 fill-current" /> {top.n}</div>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] text-muted">Pas encore de vote.</p>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
