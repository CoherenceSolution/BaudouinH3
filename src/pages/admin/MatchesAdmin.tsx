import { useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { useMatches } from '@/hooks/useData'
import type { Match } from '@/lib/types'
import { formatDate, matchTitle } from '@/lib/format'
import { Button, Card, Spinner } from '@/components/ui'
import { MatchStatusBadge, ResultPill } from '@/components/MatchCard'
import { MatchFormModal } from '@/components/MatchFormModal'

export function MatchesAdmin() {
  const matches = useMatches()
  const [editing, setEditing] = useState<Match | null | 'new'>(null)
  if (matches.loading) return <Spinner />
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Nouveau match</Button>
      </div>
      <Card className="divide-y divide-line">
        {matches.data.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted">Aucun match.</p>}
        {matches.data.map((m) => (
          <button key={m.id} onClick={() => setEditing(m)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">{matchTitle(m)} <ResultPill match={m} /></div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">{formatDate(m.date)} <MatchStatusBadge status={m.status} />{m.competition && <span>{m.competition}</span>}</div>
            </div>
            <Pencil className="size-4 text-muted" />
          </button>
        ))}
      </Card>
      <MatchFormModal open={editing !== null} match={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </div>
  )
}
