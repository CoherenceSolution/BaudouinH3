import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Coins } from 'lucide-react'
import type { Coum, Match, Player } from '@/lib/types'
import { coumRows, coumSeasonRows, coumSeasonTotals, coumTotals } from '@/lib/coums'
import { formatDate, matchTitle, playerName } from '@/lib/format'
import { Avatar, Badge, Card, EmptyState, SectionTitle, Spinner, Stat } from '@/components/ui'

interface Props {
  matches: Match[]
  players: Player[]
  coums: Coum[]
  /** true tant que la première lecture des coums n'est pas arrivée. */
  loading: boolean
}

/** Récapitulatif des coums de la saison : qui a coumé, qui doit encore, match par match. */
export function CoumsSeason({ matches, players, coums, loading }: Props) {
  const matchIds = useMemo(() => matches.map((m) => m.id), [matches])
  const rows = useMemo(() => coumSeasonRows(players, matchIds, coums), [players, matchIds, coums])
  const totals = useMemo(() => coumSeasonTotals(rows), [rows])

  const perMatch = useMemo(
    () =>
      matches.map((match) => ({
        match,
        totals: coumTotals(coumRows(players, coums.filter((c) => c.matchId === match.id), () => 0)),
      })),
    [matches, coums, players],
  )

  if (loading) return <Spinner />
  if (matches.length === 0) {
    return <EmptyState icon={<Coins className="size-6" />} title="Aucun match cette saison" description="La coum se suit match par match, depuis l’onglet Coum de chaque match." />
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Coums reçues" value={`${totals.paid} / ${totals.due}`} tone="accent" />
        <Stat label="Coums en attente" value={totals.pending} tone="rose" />
        <Stat label="Matchs" value={matches.length} sub="coums attendues" />
      </div>

      <section>
        <SectionTitle>Par joueur</SectionTitle>
        <Card className="divide-y divide-line">
          {rows.map((r) => {
            const p = players.find((x) => x.id === r.playerId)
            const pending = Math.max(0, r.due - r.paid)
            return (
              <div key={r.playerId} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar player={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{playerName(p)}</div>
                  <div className="text-[12px] text-muted">
                    {r.paid} coum{r.paid > 1 ? 's' : ''} sur {r.due} demandée{r.due > 1 ? 's' : ''}
                    {r.absentMatches > 0 ? ` · ${r.absentMatches} match${r.absentMatches > 1 ? 's' : ''} absent` : ''}
                  </div>
                </div>
                {pending > 0 ? (
                  <Badge tone="rose">{r.pendingMatches} match{r.pendingMatches > 1 ? 's' : ''} à régulariser</Badge>
                ) : (
                  <Badge tone="accent">À jour</Badge>
                )}
              </div>
            )
          })}
        </Card>
      </section>

      <section>
        <SectionTitle>Par match</SectionTitle>
        <Card className="divide-y divide-line">
          {perMatch.map(({ match, totals: t }) => (
            <Link key={match.id} to={`/votes/${match.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{matchTitle(match)}</div>
                <div className="text-[12px] text-muted">
                  {formatDate(match.date)}
                  {t.absent > 0 ? ` · ${t.absent} absent${t.absent > 1 ? 's' : ''}` : ''}
                  {t.recoumed ? ' · recoum' : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-bold tabular-nums">{t.paidPlayers} / {t.present}</div>
                {t.pendingPlayers > 0 && <div className="text-[12px] font-medium text-rose">{t.pendingPlayers} à relancer</div>}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </Link>
          ))}
        </Card>
      </section>
    </div>
  )
}
