import { useMemo, useState } from 'react'
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Plus, Euro, Check, Trash2, ChevronDown, ChevronUp, Settings2 } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { useFines, useFineTypes, useMatches, usePlayers } from '@/hooks/useData'
import { isPlayed } from '@/lib/matches'
import { useActor } from '@/hooks/useActor'
import { logActivity, readBefore, undoDelete, undoUpdate } from '@/lib/activity'
import type { Fine, Player } from '@/lib/types'
import { formatEuro } from '@/lib/fines'
import { currentSeason, cx, formatDate, playerFullLabel, playerName, seasonOf } from '@/lib/format'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Select, Spinner, Stat, Tabs } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { AddFineModal } from './AddFineModal'
import { FineTypesEditor } from './FineTypesEditor'

type Tab = 'players' | 'all' | 'types'

export function FinesPage() {
  const { isStaff } = useAuth()
  const players = usePlayers(true)
  const fines = useFines()
  const types = useFineTypes()
  const allMatches = useMatches()
  // Les matchs à venir n'entrent ni dans les statistiques ni dans les listes de choix.
  const played = useMemo(() => allMatches.data.filter(isPlayed), [allMatches.data])
  const matches = { ...allMatches, data: played }
  const [tab, setTab] = useState<Tab>('players')
  const [add, setAdd] = useState(false)
  const [season, setSeason] = useState(currentSeason())

  const seasons = useMemo(() => {
    const s = new Set(fines.data.map((f) => seasonOf(f.date)))
    s.add(currentSeason())
    return [...s].sort().reverse()
  }, [fines.data])
  const list = useMemo(() => fines.data.filter((f) => seasonOf(f.date) === season), [fines.data, season])
  const total = list.reduce((s, f) => s + f.amount, 0)
  const unpaid = list.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0)

  return (
    <div>
      <PageHeader
        title="Amendes"
        subtitle="Le barème est public. Seuls les secrétaires et l’admin peuvent infliger une amende."
        actions={isStaff && <Button icon={<Plus className="size-4" />} onClick={() => setAdd(true)}>Infliger une amende</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onChange={setTab} items={[{ key: 'players', label: 'Par joueur' }, { key: 'all', label: 'Historique' }, { key: 'types', label: <span className="inline-flex items-center gap-1"><Settings2 className="size-3.5" /> Barème</span> }]} />
        {tab !== 'types' && (
          <Select value={season} onChange={(e) => setSeason(e.target.value)} className="w-48">
            {seasons.map((s) => <option key={s} value={s}>Saison {s}</option>)}
          </Select>
        )}
      </div>

      {tab !== 'types' && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <Stat label="Total saison" value={formatEuro(total)} />
          <Stat label="Impayé" value={formatEuro(unpaid)} tone="rose" />
          <Stat label="Amendes" value={list.length} />
        </div>
      )}

      {fines.loading || players.loading ? (
        <Spinner />
      ) : tab === 'players' ? (
        <ByPlayer fines={list} players={players.data} isStaff={isStaff} />
      ) : tab === 'all' ? (
        <AllFines fines={list} players={players.byId} isStaff={isStaff} />
      ) : (
        <FineTypesEditor types={types.data} isStaff={isStaff} />
      )}

      <AddFineModal open={add} onClose={() => setAdd(false)} players={players.data} types={types.data.filter((t) => t.active)} matches={matches.data} />
    </div>
  )
}

function useFineActions() {
  const actor = useActor()
  const toast = useToast()
  const players = usePlayers(true)
  async function togglePaid(f: Fine) {
    try {
      const before = await readBefore(`fines/${f.id}`)
      await updateDoc(doc(db, 'fines', f.id), { paid: !f.paid, paidAt: f.paid ? null : serverTimestamp() })
      await logActivity(actor, 'update', 'fine', f.id, `${f.paid ? 'Paiement annulé' : 'Amende payée'} : ${f.label} ${formatEuro(f.amount)} — ${playerFullLabel(players.byId.get(f.playerId))}`, undefined, undoUpdate(`fines/${f.id}`, before, ['paid', 'paidAt']))
    } catch (e) {
      console.error(e)
      toast('Action impossible', 'error')
    }
  }
  async function remove(f: Fine) {
    if (!confirm(`Supprimer l’amende « ${f.label} » de ${formatEuro(f.amount)} ?`)) return
    try {
      const before = await readBefore(`fines/${f.id}`)
      await deleteDoc(doc(db, 'fines', f.id))
      await logActivity(actor, 'delete', 'fine', f.id, `Amende supprimée : ${f.label} ${formatEuro(f.amount)} — ${playerFullLabel(players.byId.get(f.playerId))}`, undefined, undoDelete(`fines/${f.id}`, before))
      toast('Amende supprimée')
    } catch (e) {
      console.error(e)
      toast('Suppression impossible', 'error')
    }
  }
  return { togglePaid, remove }
}

function FineRow({ f, isStaff, showPlayer, players }: { f: Fine; isStaff: boolean; showPlayer?: boolean; players?: Map<string, Player> }) {
  const { togglePaid, remove } = useFineActions()
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-[14px]">
          {showPlayer && players && <span className="font-semibold">{playerName(players.get(f.playerId))}</span>}
          <span className={showPlayer ? 'text-ink-2' : 'font-medium'}>{f.label}{f.quantity != null ? ` (${f.quantity})` : ''}</span>
        </div>
        <div className="text-[12px] text-muted">{formatDate(f.date)}{f.note ? ` · ${f.note}` : ''}{f.createdByName ? ` · par ${f.createdByName}` : ''}</div>
      </div>
      <span className={cx('text-[14px] font-bold tabular-nums', f.paid ? 'text-muted line-through' : 'text-ink')}>{formatEuro(f.amount)}</span>
      {f.paid ? <Badge tone="accent"><Check className="size-3" /> Payée</Badge> : <Badge tone="rose">À payer</Badge>}
      {isStaff && (
        <div className="flex gap-1">
          <button onClick={() => togglePaid(f)} title={f.paid ? 'Marquer impayée' : 'Marquer payée'} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-accent-strong"><Check className="size-4" /></button>
          <button onClick={() => remove(f)} title="Supprimer" className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-rose"><Trash2 className="size-4" /></button>
        </div>
      )}
    </div>
  )
}

function ByPlayer({ fines, players, isStaff }: { fines: Fine[]; players: Player[]; isStaff: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const rows = useMemo(
    () =>
      players
        .map((p) => {
          const list = fines.filter((f) => f.playerId === p.id)
          return { p, list, total: list.reduce((s, f) => s + f.amount, 0), unpaid: list.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0) }
        })
        .filter((r) => r.list.length > 0)
        .sort((a, b) => b.total - a.total),
    [fines, players],
  )
  if (rows.length === 0) return <EmptyState icon={<Euro className="size-6" />} title="Aucune amende cette saison" description="Une équipe exemplaire, ou un secrétaire indulgent." />
  return (
    <div className="space-y-2">
      {rows.map(({ p, list, total, unpaid }) => (
        <Card key={p.id}>
          <button onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <Avatar player={p} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{playerName(p)}</div>
              <div className="text-[12px] text-muted">{list.length} amende{list.length > 1 ? 's' : ''}</div>
            </div>
            <div className="text-right">
              <div className="text-[15px] font-bold tabular-nums">{formatEuro(total)}</div>
              {unpaid > 0 ? <div className="text-[12px] font-medium text-rose">{formatEuro(unpaid)} à payer</div> : <div className="text-[12px] text-accent-strong">Tout est payé</div>}
            </div>
            {open === p.id ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
          </button>
          {open === p.id && <div className="divide-y divide-line border-t border-line">{list.map((f) => <FineRow key={f.id} f={f} isStaff={isStaff} />)}</div>}
        </Card>
      ))}
    </div>
  )
}

function AllFines({ fines, players, isStaff }: { fines: Fine[]; players: Map<string, Player>; isStaff: boolean }) {
  if (fines.length === 0) return <EmptyState icon={<Euro className="size-6" />} title="Aucune amende cette saison" />
  return <Card className="divide-y divide-line">{fines.map((f) => <FineRow key={f.id} f={f} isStaff={isStaff} showPlayer players={players} />)}</Card>
}
