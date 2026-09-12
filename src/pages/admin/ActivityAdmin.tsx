import { useMemo, useState } from 'react'
import { PlusCircle, MinusCircle, PencilLine } from 'lucide-react'
import { useActivity } from '@/hooks/useData'
import { formatDateTime } from '@/lib/format'
import { Badge, Card, Chip, Spinner } from '@/components/ui'
import type { ActivityLog } from '@/lib/types'

const ENTITY_LABELS: Record<string, string> = {
  player: 'Joueur', match: 'Match', ticket: 'Vote', fine: 'Amende', fineType: 'Barème', goal: 'But', statEntry: 'Statistique', statCategory: 'Catégorie', staff: 'Staff', setup: 'Installation', backup: 'Sauvegarde', settings: 'Paramètres',
}

export function ActivityAdmin() {
  const activity = useActivity(400)
  const [filter, setFilter] = useState<string>('all')
  const entities = useMemo(() => [...new Set(activity.data.map((a) => a.entity))], [activity.data])
  const list = useMemo(() => activity.data.filter((a) => filter === 'all' || a.entity === filter), [activity.data, filter])

  if (activity.loading) return <Spinner />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tout</Chip>
        {entities.map((e) => <Chip key={e} active={filter === e} onClick={() => setFilter(e)}>{ENTITY_LABELS[e] ?? e}</Chip>)}
      </div>
      <Card className="divide-y divide-line">
        {list.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted">Aucune activité.</p>}
        {list.map((a) => <Row key={a.id} a={a} />)}
      </Card>
      <p className="text-[12px] text-muted">Les {activity.data.length} dernières actions. Le journal est en ajout seul : rien ne peut y être modifié ou supprimé.</p>
    </div>
  )
}

function Row({ a }: { a: ActivityLog }) {
  const Icon = a.action === 'create' ? PlusCircle : a.action === 'delete' ? MinusCircle : PencilLine
  const color = a.action === 'create' ? 'text-accent-strong' : a.action === 'delete' ? 'text-rose' : 'text-sky'
  const roleLabel = a.actorRole === 'admin' ? 'Admin' : a.actorRole === 'secretary' ? 'Secrétaire' : a.actorRole === 'speaker' ? 'Orateur' : 'Membre'
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px]">{a.summary}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span className="font-medium text-ink-2">{a.actorName}</span>
          <Badge>{roleLabel}</Badge>
          <Badge>{ENTITY_LABELS[a.entity] ?? a.entity}</Badge>
          <span>{formatDateTime(a.at?.toDate?.())}</span>
        </div>
      </div>
    </div>
  )
}
