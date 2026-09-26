import { useMemo, useState } from 'react'
import { PlusCircle, MinusCircle, PencilLine, ChevronDown } from 'lucide-react'
import { useActivity } from '@/hooks/useData'
import { formatDateTime, normalize } from '@/lib/format'
import { Badge, Button, Card, Chip, Input, Select, Spinner } from '@/components/ui'
import type { ActivityLog } from '@/lib/types'

const ENTITY_LABELS: Record<string, string> = {
  player: 'Joueur', match: 'Match', ticket: 'Vote', like: 'Coup de cœur', coum: 'Coum', fine: 'Amende', fineType: 'Barème', goal: 'But',
  statEntry: 'Statistique', statCategory: 'Catégorie', staff: 'Staff', setup: 'Installation', backup: 'Sauvegarde', settings: 'Paramètres',
}

const PAGE = 400

/**
 * Journal d'activité : toute modification laisse une trace (qui, quoi, quand, et pour une modification
 * la valeur avant → après). Le journal est en ajout seul : les règles Firestore interdisent d'y modifier
 * ou d'y supprimer quoi que ce soit.
 */
export function ActivityAdmin() {
  const [limitTo, setLimitTo] = useState(PAGE)
  const activity = useActivity(limitTo)
  const [filter, setFilter] = useState<string>('all')
  const [actor, setActor] = useState<string>('all')
  const [q, setQ] = useState('')
  const entities = useMemo(() => [...new Set(activity.data.map((a) => a.entity))], [activity.data])
  const actors = useMemo(() => [...new Set(activity.data.map((a) => a.actorName))].sort((a, b) => a.localeCompare(b, 'fr')), [activity.data])
  const list = useMemo(() => {
    const needle = normalize(q)
    return activity.data.filter(
      (a) =>
        (filter === 'all' || a.entity === filter) &&
        (actor === 'all' || a.actorName === actor) &&
        (!needle || normalize([a.summary, a.actorName, ...(a.changes ?? []).map((c) => `${c.field} ${c.before} ${c.after}`)].join(' ')).includes(needle)),
    )
  }, [activity.data, filter, actor, q])

  if (activity.loading && activity.data.length === 0) return <Spinner />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tout</Chip>
        {entities.map((e) => <Chip key={e} active={filter === e} onClick={() => setFilter(e)}>{ENTITY_LABELS[e] ?? e}</Chip>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Rechercher (joueur, montant, champ modifié…)" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={actor} onChange={(e) => setActor(e.target.value)} title="Filtrer par personne">
          <option value="all">Toutes les personnes</option>
          {actors.map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <Card className="divide-y divide-line">
        {list.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted">Aucune activité.</p>}
        {list.map((a) => <Row key={a.id} a={a} />)}
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">
          {list.length} action{list.length > 1 ? 's' : ''} affichée{list.length > 1 ? 's' : ''} sur les {activity.data.length} dernières. Le journal est en ajout seul : rien ne peut y être modifié ou supprimé.
        </p>
        {activity.data.length >= limitTo && (
          <Button size="sm" variant="secondary" icon={<ChevronDown className="size-4" />} loading={activity.loading} onClick={() => setLimitTo((n) => n + PAGE)}>
            Charger plus ancien
          </Button>
        )}
      </div>
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
        {a.changes && a.changes.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
            {a.changes.map((c, i) => (
              <li key={i} className="flex flex-wrap gap-x-1.5">
                <span className="font-semibold text-ink-2">{c.field} :</span>
                <span className="text-rose line-through decoration-rose/50">{c.before}</span>
                <span className="text-muted">→</span>
                <span className="font-medium text-accent-strong">{c.after}</span>
              </li>
            ))}
          </ul>
        )}
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
