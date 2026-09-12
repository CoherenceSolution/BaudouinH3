import { useMemo } from 'react'
import { CheckCircle2, CircleDashed, Circle } from 'lucide-react'
import type { Player, Ticket } from '@/lib/types'
import { ticketCompletion } from '@/lib/rankings'
import { cx, playerName } from '@/lib/format'
import { Avatar, Card, SectionTitle } from '@/components/ui'

interface Props {
  players: Player[]
  tickets: Ticket[]
}

/** Qui a voté, qui a un brouillon incomplet, qui n'a rien fait. Visible par l'orateur et le staff. */
export function Participation({ players, tickets }: Props) {
  const rows = useMemo(() => {
    const byAuthor = new Map(tickets.map((t) => [t.authorPlayerId, t]))
    return players
      .map((p) => {
        const t = byAuthor.get(p.id)
        const state: 'done' | 'draft' | 'none' = t?.status === 'submitted' ? 'done' : t ? 'draft' : 'none'
        return { p, t, state, filled: t ? ticketCompletion(t) : 0 }
      })
      .sort((a, b) => order[a.state] - order[b.state] || playerName(a.p).localeCompare(playerName(b.p)))
  }, [players, tickets])

  const done = rows.filter((r) => r.state === 'done').length
  const draft = rows.filter((r) => r.state === 'draft').length
  const pct = players.length ? Math.round((done / players.length) * 100) : 0

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionTitle right={<span className="text-[13px] font-semibold">{done} / {players.length}</span>}>Complétion des votes</SectionTitle>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5 text-accent-strong" /> {done} envoyés</span>
          <span className="inline-flex items-center gap-1"><CircleDashed className="size-3.5 text-amber-500" /> {draft} en cours</span>
          <span className="inline-flex items-center gap-1"><Circle className="size-3.5" /> {players.length - done - draft} sans vote</span>
        </div>
      </Card>
      <Card className="divide-y divide-line">
        {rows.map(({ p, state, filled, t }) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar player={p} size="sm" />
            <span className={cx('flex-1 text-[14px]', state === 'none' && 'text-muted')}>{playerName(p)}</span>
            {state === 'done' && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-strong"><CheckCircle2 className="size-4" /> Envoyé{t?.coAuthorPlayerId ? ' (à deux)' : ''}</span>}
            {state === 'draft' && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-600"><CircleDashed className="size-4" /> En cours · {filled}/3</span>}
            {state === 'none' && <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Circle className="size-4" /> Pas de vote</span>}
          </div>
        ))}
      </Card>
    </div>
  )
}

const order = { done: 0, draft: 1, none: 2 }
