import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Coins } from 'lucide-react'
import type { Coum, Match, Player, Settings } from '@/lib/types'
import { coumAmountOf, coumRows, coumSeasonRows, coumSeasonTotals, coumTotals } from '@/lib/coums'
import { formatEuro } from '@/lib/fines'
import { formatDate, matchTitle, playerName } from '@/lib/format'
import { Avatar, Badge, Card, EmptyState, SectionTitle, Stat } from '@/components/ui'

interface Props {
  matches: Match[]
  players: Player[]
  coums: Coum[]
  settings: Settings
}

/** Récapitulatif des coums de la saison : qui a payé, qui doit encore, match par match. */
export function CoumsSeason({ matches, players, coums, settings }: Props) {
  const withAmount = useMemo(() => matches.map((m) => ({ match: m, amount: coumAmountOf(m, settings) })), [matches, settings])

  const rows = useMemo(
    () => coumSeasonRows(players, withAmount.map(({ match, amount }) => ({ id: match.id, amount })), coums),
    [players, withAmount, coums],
  )
  const totals = useMemo(() => coumSeasonTotals(rows), [rows])

  const perMatch = useMemo(
    () =>
      withAmount.map(({ match, amount }) => {
        const list = coums.filter((c) => c.matchId === match.id)
        return { match, amount, totals: coumTotals(coumRows(players, list, () => 0), amount) }
      }),
    [withAmount, coums, players],
  )

  if (matches.length === 0) return <EmptyState icon={<Coins className="size-6" />} title="Aucun match cette saison" description="La coum se suit match par match, depuis l’onglet Coum de chaque match." />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Dans le pot" value={formatEuro(totals.paid)} tone="accent" />
        <Stat label="Reste à encaisser" value={formatEuro(totals.outstanding)} tone="rose" />
        <Stat label="Matchs" value={matches.length} sub="coums attendues" />
      </div>

      <section>
        <SectionTitle>Par joueur</SectionTitle>
        <Card className="divide-y divide-line">
          {rows.map((r) => {
            const p = players.find((x) => x.id === r.playerId)
            const outstanding = Math.max(0, r.due - r.paid)
            return (
              <div key={r.playerId} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar player={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{playerName(p)}</div>
                  <div className="text-[12px] text-muted">
                    {r.coumsPaid} coum{r.coumsPaid > 1 ? 's' : ''} payée{r.coumsPaid > 1 ? 's' : ''}
                    {r.absentMatches > 0 ? ` · ${r.absentMatches} match${r.absentMatches > 1 ? 's' : ''} absent` : ''}
                  </div>
                </div>
                <span className="text-[14px] font-bold tabular-nums">{formatEuro(r.paid)}</span>
                {outstanding > 0 ? (
                  <Badge tone="rose">{formatEuro(outstanding)} à payer</Badge>
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
          {perMatch.map(({ match, amount, totals: t }) => (
            <Link key={match.id} to={`/votes/${match.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{matchTitle(match)}</div>
                <div className="text-[12px] text-muted">{formatDate(match.date)} · {formatEuro(amount)} par personne · {t.paidPlayers}/{t.present} ont coumé</div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-bold tabular-nums">{formatEuro(t.collected)}</div>
                {t.outstanding > 0 && <div className="text-[12px] font-medium text-rose">{formatEuro(t.outstanding)} à encaisser</div>}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </Link>
          ))}
        </Card>
      </section>
    </div>
  )
}
