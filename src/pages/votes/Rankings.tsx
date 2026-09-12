import { useMemo } from 'react'
import { Heart } from 'lucide-react'
import { VOTE_CATEGORIES, type Like, type Player, type Ticket, type VoteCategory } from '@/lib/types'
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
    () => read.filter((t) => t.moment?.proposal || t.moment?.playerId).map((t) => ({ t, n: counts.get(t.id)?.moment ?? 0 })).sort((a, b) => b.n - a.n),
    [read, counts],
  )

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <SectionTitle right={<span className="text-[12px] text-muted">{read.length} tickets lus</span>}>🏆 Meilleur joueur</SectionTitle>
        <RankingList rows={best} players={players} tone="gold" empty="Aucun ticket lu pour l’instant." />
      </Card>
      <Card className="p-5">
        <SectionTitle>🥴 Pire joueur</SectionTitle>
        <RankingList rows={worst} players={players} tone="rose" empty="Aucun ticket lu pour l’instant." />
      </Card>
      <Card className="p-5 md:col-span-2">
        <SectionTitle>⚡ Gestes marquants</SectionTitle>
        {moments.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Aucun geste lu pour l’instant.</p>
        ) : (
          <ul className="space-y-2">
            {moments.map(({ t, n }) => (
              <li key={t.id} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{t.moment.proposal || '—'}{t.moment.playerId && <span className="font-normal text-muted"> — {playerName(players.get(t.moment.playerId))}</span>}</div>
                  {t.moment.comment && <p className="text-[13px] text-ink-2">{t.moment.comment}</p>}
                </div>
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-rose"><Heart className="size-3.5 fill-current" /> {n}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-5 md:col-span-2">
        <SectionTitle>❤️ Coups de cœur du public</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {VOTE_CATEGORIES.map((c) => {
            const top = favourites[c.key][0]
            const entry = top?.ticket[c.key]
            const p = entry?.playerId ? players.get(entry.playerId) : undefined
            return (
              <div key={c.key} className="rounded-xl border border-line p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{c.emoji} {c.label}</div>
                {top ? (
                  <>
                    <div className="mt-1 text-[14px] font-semibold">{entry?.proposal ? entry.proposal : playerName(p)}</div>
                    {entry?.comment && <p className="mt-0.5 line-clamp-3 text-[13px] text-ink-2">{entry.comment}</p>}
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
