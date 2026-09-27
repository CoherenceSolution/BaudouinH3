import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, RefreshCw, RotateCcw } from 'lucide-react'
import { useCalendarConfig, useMatches } from '@/hooks/useData'
import type { Match } from '@/lib/types'
import { formatDate, matchTitle } from '@/lib/format'
import { formatTime } from '@/lib/matches'
import { Badge, Button, Card, Spinner } from '@/components/ui'
import { MatchStatusBadge, ResultPill } from '@/components/MatchCard'
import { MatchFormModal } from '@/components/MatchFormModal'
import { SyncStatus } from './CalendarSettings'
import { CalendarSyncButton } from './CalendarSyncButton'
import { useAuth } from '@/auth/AuthProvider'
import { useActor } from '@/hooks/useActor'
import { useToast } from '@/components/ui/Toast'
import { reopenVotes } from '@/lib/matchActions'

export function MatchesAdmin() {
  const matches = useMatches()
  const calendar = useCalendarConfig()
  const { isAdmin } = useAuth()
  const [editing, setEditing] = useState<Match | null | 'new'>(null)
  const [reopening, setReopening] = useState<string | null>(null)
  const actor = useActor()
  const toast = useToast()

  // L'admin rouvre les votes d'un match en un geste (terminé, en lecture, à venir ou annulé).
  async function reopen(m: Match) {
    if (!confirm(`Rouvrir les votes du match ${matchTitle(m)} ? Les votes déjà lus le restent.`)) return
    setReopening(m.id)
    try {
      await reopenVotes(m, actor)
      toast('Votes rouverts')
    } catch (e) {
      console.error(e)
      toast('Impossible de rouvrir les votes', 'error')
    } finally {
      setReopening(null)
    }
  }
  if (matches.loading) return <Spinner />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-[13px] text-muted">
          {calendar?.icalUrl ? (
            <SyncStatus lastSync={calendar.lastSync} hasUrl />
          ) : calendar !== undefined ? (
            <p className="mt-3">
              Agenda Sportlink non relié.{' '}
              <Link to="/admin/parametres" className="font-medium text-ink hover:underline">Coller le lien dans Paramètres</Link>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && calendar?.icalUrl && <CalendarSyncButton />}
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Nouveau match</Button>
        </div>
      </div>
      <Card className="divide-y divide-line">
        {matches.data.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted">Aucun match.</p>}
        {matches.data.map((m) => (
          <div key={m.id} className="flex items-center gap-2 pr-3 hover:bg-slate-50">
            <button onClick={() => setEditing(m)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">{matchTitle(m)} <ResultPill match={m} /></div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  {formatDate(m.date)}{m.time && ` · ${formatTime(m.time)}`} <MatchStatusBadge status={m.status} cancelled={m.cancelled} />
                  {m.source === 'sportlink' && <Badge tone="sky"><RefreshCw className="size-3" /> Sportlink</Badge>}
                  {m.competition && <span>{m.competition}</span>}
                </div>
              </div>
              <Pencil className="size-4 text-muted" />
            </button>
            {isAdmin && m.status !== 'voting' && (
              <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} loading={reopening === m.id} onClick={() => reopen(m)}>
                {m.status === 'scheduled' ? 'Ouvrir les votes' : 'Rouvrir les votes'}
              </Button>
            )}
          </div>
        ))}
      </Card>
      <MatchFormModal open={editing !== null} match={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </div>
  )
}
