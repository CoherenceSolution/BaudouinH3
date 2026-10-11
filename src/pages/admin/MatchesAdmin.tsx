import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, RefreshCw, RotateCcw, Merge, Trash2 } from 'lucide-react'
import { useCalendarConfig, useMatches } from '@/hooks/useData'
import type { Match } from '@/lib/types'
import { formatDate, matchTitle } from '@/lib/format'
import { formatTime } from '@/lib/matches'
import { Badge, Button, Card, Spinner } from '@/components/ui'
import { MatchStatusBadge, ResultPill } from '@/components/MatchCard'
import { MatchFormModal } from '@/components/MatchFormModal'
import { MergeMatchesModal } from '@/components/MergeMatchesModal'
import { SyncStatus } from './CalendarSettings'
import { CalendarSyncButton } from './CalendarSyncButton'
import { useAuth } from '@/auth/AuthProvider'
import { useActor } from '@/hooks/useActor'
import { useToast } from '@/components/ui/Toast'
import { findDuplicateCopies, removeDuplicateCopies, reopenVotes } from '@/lib/matchActions'

export function MatchesAdmin() {
  const matches = useMatches()
  const calendar = useCalendarConfig()
  const { isAdmin } = useAuth()
  const [editing, setEditing] = useState<Match | null | 'new'>(null)
  const [reopening, setReopening] = useState<string | null>(null)
  const [merging, setMerging] = useState<Match | null>(null)
  const [cleaning, setCleaning] = useState(false)
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
  // Copies annulées en double (anciennes lectures de l'agenda) : déjà masquées partout, supprimées ici.
  async function clean() {
    setCleaning(true)
    try {
      const { removable, kept } = await findDuplicateCopies()
      const note = kept ? ` ${kept} autre${kept > 1 ? 's' : ''}, qui porte${kept > 1 ? 'nt' : ''} des données (votes, coum, amendes…), ser${kept > 1 ? 'ont' : 'a'} gardée${kept > 1 ? 's' : ''}.` : ''
      if (removable.length === 0) {
        toast(kept ? `Aucun doublon supprimable.${note}` : 'Aucun doublon : la liste est propre.', 'info')
        return
      }
      if (!confirm(`Supprimer ${removable.length} copie${removable.length > 1 ? 's' : ''} annulée${removable.length > 1 ? 's' : ''} en double ? Le vrai match est gardé à chaque fois.${note} L’opération peut être annulée depuis Gestion → Surveillance.`)) return
      await removeDuplicateCopies(removable, actor)
      toast(`${removable.length} doublon${removable.length > 1 ? 's' : ''} supprimé${removable.length > 1 ? 's' : ''}`)
    } catch (e) {
      console.error(e)
      toast('Nettoyage impossible', 'error')
    } finally {
      setCleaning(false)
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
          {isAdmin && <Button variant="secondary" icon={<Trash2 className="size-4" />} loading={cleaning} onClick={clean}>Supprimer les doublons</Button>}
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
            {isAdmin && matches.data.length > 1 && (
              <Button size="sm" variant="ghost" icon={<Merge className="size-4" />} title="Fusionner avec un match en double" onClick={() => setMerging(m)}>
                <span className="hidden sm:inline">Fusionner</span>
              </Button>
            )}
            {isAdmin && m.status !== 'voting' && (
              <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} loading={reopening === m.id} onClick={() => reopen(m)}>
                {m.status === 'scheduled' ? 'Ouvrir les votes' : 'Rouvrir les votes'}
              </Button>
            )}
          </div>
        ))}
      </Card>
      <MergeMatchesModal match={merging} matches={matches.data} onClose={() => setMerging(null)} />
      <MatchFormModal open={editing !== null} match={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </div>
  )
}
