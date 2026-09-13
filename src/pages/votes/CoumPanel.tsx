import { useMemo, useState } from 'react'
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { Check, Coins, Pencil, RefreshCw, RotateCcw, UserRoundX, UserRoundCheck } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { useActor } from '@/hooks/useActor'
import { useSettings } from '@/hooks/useSettings'
import { logActivity } from '@/lib/activity'
import type { Coum, Match, Player } from '@/lib/types'
import { coumAmountOf, coumId, coumRows, coumTotals, type CoumRow } from '@/lib/coums'
import { formatEuro } from '@/lib/fines'
import { cx, playerName } from '@/lib/format'
import { Avatar, Badge, Button, Card, Input, SectionTitle, Spinner, Stat } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface Props {
  match: Match
  players: Player[]
  coums: Coum[]
  loading: boolean
}

/**
 * La coum d'un match : chacun met la même somme au pot.
 * Tout le monde voit qui a coumé ; le trésorier (staff) encaisse, marque les absents et peut « recoumer ».
 */
export function CoumPanel({ match, players, coums, loading }: Props) {
  const { isStaff } = useAuth()
  const { settings } = useSettings()
  const actor = useActor()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const amount = coumAmountOf(match, settings)
  const rows = useMemo(
    () => coumRows(players, coums, (a, b) => playerName(a).localeCompare(playerName(b), 'fr')),
    [players, coums],
  )
  const totals = useMemo(() => coumTotals(rows, amount), [rows, amount])
  const pct = totals.roundsDue ? Math.round((Math.min(totals.roundsPaid, totals.roundsDue) / totals.roundsDue) * 100) : 0

  /** Écrit la coum d'un joueur (le document est créé au premier geste du trésorier). */
  async function write(row: CoumRow, patch: Record<string, unknown>, summary: string) {
    setBusy(row.player.id)
    try {
      await setDoc(
        doc(db, 'coums', coumId(match.id, row.player.id)),
        {
          matchId: match.id,
          playerId: row.player.id,
          rounds: row.rounds,
          paid: row.paid,
          absent: row.absent,
          ...patch,
          createdAt: row.coum?.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      await logActivity(actor, 'update', 'coum', coumId(match.id, row.player.id), summary)
    } catch (e) {
      console.error(e)
      toast('Action impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  const collect = (row: CoumRow) =>
    write(
      row,
      { paid: Math.min(row.rounds, row.paid + 1), absent: false, lastPaidAt: serverTimestamp(), collectedBy: actor.uid, collectedByName: actor.name },
      `Coum encaissée : ${playerName(row.player)} — ${formatEuro(amount)}`,
    )

  const cancel = (row: CoumRow) =>
    write(row, { paid: Math.max(0, row.paid - 1) }, `Coum annulée : ${playerName(row.player)} — ${formatEuro(amount)}`)

  const toggleAbsent = (row: CoumRow) =>
    write(row, { absent: !row.absent }, row.absent ? `${playerName(row.player)} n'est plus noté absent` : `${playerName(row.player)} noté absent (pas de coum)`)

  const recoumOne = (row: CoumRow) =>
    write(row, { rounds: row.rounds + 1, absent: false }, `Recoum : une coum de plus demandée à ${playerName(row.player)}`)

  /** Recoumer : une coum de plus pour tous les présents. */
  async function recoumAll() {
    const present = rows.filter((r) => !r.absent)
    if (present.length === 0) return
    if (!confirm(`Redemander une coum de ${formatEuro(amount)} à ${present.length} présent${present.length > 1 ? 's' : ''} ?`)) return
    setBusy('all')
    try {
      const batch = writeBatch(db)
      for (const r of present) {
        batch.set(
          doc(db, 'coums', coumId(match.id, r.player.id)),
          {
            matchId: match.id,
            playerId: r.player.id,
            rounds: r.rounds + 1,
            paid: r.paid,
            absent: false,
            createdAt: r.coum?.createdAt ?? serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      }
      await batch.commit()
      await logActivity(actor, 'update', 'coum', match.id, `Recoum : une coum de plus demandée à ${present.length} présents (${formatEuro(amount)} chacun)`)
      toast('Recoum lancée : une coum de plus pour les présents')
    } catch (e) {
      console.error(e)
      toast('Recoum impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-ink text-accent"><Coins className="size-5" /></span>
            <div>
              <div className="font-semibold">La coum du match</div>
              <AmountLine match={match} amount={amount} isStaff={isStaff} />
            </div>
          </div>
          {isStaff && (
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={busy === 'all'} onClick={recoumAll} disabled={totals.present === 0}>
              Recoumer les présents
            </Button>
          )}
        </div>

        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted">
          <span>{totals.paidPlayers} / {totals.present} présents ont coumé</span>
          {totals.recoumed && <span>{totals.roundsPaid} / {totals.roundsDue} coums encaissées</span>}
          {totals.absent > 0 && <span>{totals.absent} absent{totals.absent > 1 ? 's' : ''}</span>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Dans le pot" value={formatEuro(totals.collected)} tone="accent" />
          <Stat label="Reste à encaisser" value={formatEuro(totals.outstanding)} tone="rose" sub={`${totals.pendingPlayers} joueur${totals.pendingPlayers > 1 ? 's' : ''}`} />
          <Stat label="Absents" value={totals.absent} sub="ne doivent rien" />
        </div>

        <p className="mt-3 text-[13px] text-muted">
          {isStaff
            ? 'Marquez « Encaissé » dès que vous recevez l’argent. « Recoumer » redemande une coum aux présents.'
            : 'Le trésorier coche les coums qu’il a encaissées. Tout le monde voit qui a coumé.'}
        </p>
      </Card>

      <section>
        <SectionTitle right={<span className="text-[13px] font-semibold">{totals.paidPlayers} / {totals.present}</span>}>Qui a coumé ?</SectionTitle>
        <Card className="divide-y divide-line">
          {rows.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted">Aucun joueur dans l’équipe.</p>}
          {rows.map((row) => (
            <CoumRowView
              key={row.player.id}
              row={row}
              amount={amount}
              isStaff={isStaff}
              busy={busy === row.player.id}
              onCollect={() => collect(row)}
              onCancel={() => cancel(row)}
              onToggleAbsent={() => toggleAbsent(row)}
              onRecoum={() => recoumOne(row)}
            />
          ))}
        </Card>
      </section>
    </div>
  )
}

function AmountLine({ match, amount, isStaff }: { match: Match; amount: number; isStaff: boolean }) {
  const actor = useActor()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(amount))
  const [loading, setLoading] = useState(false)

  async function save() {
    const n = Number(value.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return
    setLoading(true)
    try {
      await setDoc(doc(db, 'matches', match.id), { coumAmount: n, updatedAt: serverTimestamp() }, { merge: true })
      await logActivity(actor, 'update', 'match', match.id, `Montant de la coum : ${formatEuro(n)} par personne`)
      toast('Montant de la coum enregistré')
      setEditing(false)
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-1 flex items-end gap-2">
        <Input label="Montant par personne (€)" type="number" min={0} step="0.5" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="w-44" />
        <Button size="sm" loading={loading} onClick={save}>Enregistrer</Button>
        <Button size="sm" variant="ghost" onClick={() => { setValue(String(amount)); setEditing(false) }}>Annuler</Button>
      </div>
    )
  }
  return (
    <div className="text-[13px] text-muted">
      {formatEuro(amount)} par personne
      {isStaff && (
        <button onClick={() => { setValue(String(amount)); setEditing(true) }} className="ml-1.5 rounded-lg p-1 align-middle text-muted hover:bg-slate-100 hover:text-ink" title="Changer le montant pour ce match">
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function CoumRowView({
  row, amount, isStaff, busy, onCollect, onCancel, onToggleAbsent, onRecoum,
}: {
  row: CoumRow
  amount: number
  isStaff: boolean
  busy: boolean
  onCollect: () => void
  onCancel: () => void
  onToggleAbsent: () => void
  onRecoum: () => void
}) {
  const owed = Math.max(0, row.rounds - row.paid)
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <Avatar player={row.player} size="sm" />
      <div className="min-w-0 flex-1">
        <div className={cx('text-[14px]', row.absent ? 'text-muted' : 'font-medium')}>{playerName(row.player)}</div>
        {(row.rounds > 1 || row.paid > 0) && (
          <div className="text-[12px] text-muted">
            {row.paid} encaissée{row.paid > 1 ? 's' : ''} sur {row.rounds} demandée{row.rounds > 1 ? 's' : ''}
            {owed > 0 && !row.absent ? ` · ${formatEuro(owed * amount)} à payer` : ''}
          </div>
        )}
      </div>
      {row.state === 'paid' && <Badge tone="accent"><Check className="size-3" /> A coumé{row.rounds > 1 ? ` ×${row.rounds}` : ''}</Badge>}
      {row.state === 'pending' && <Badge tone="rose">À payer{owed > 1 ? ` ×${owed}` : ''}</Badge>}
      {row.state === 'absent' && <Badge tone="neutral">Absent</Badge>}
      {isStaff && (
        <div className="flex items-center gap-1">
          {!row.absent && row.state !== 'paid' && (
            <Button size="sm" variant="secondary" icon={<Check className="size-4 text-accent-strong" />} loading={busy} onClick={onCollect}>Encaissé</Button>
          )}
          {row.paid > 0 && (
            <IconButton title="Annuler le dernier encaissement" onClick={onCancel}><RotateCcw className="size-4" /></IconButton>
          )}
          {!row.absent && (
            <IconButton title="Recoumer ce joueur (une coum de plus)" onClick={onRecoum}><RefreshCw className="size-4" /></IconButton>
          )}
          <IconButton title={row.absent ? 'Il était finalement présent' : 'Noter absent (ne doit pas la coum)'} onClick={onToggleAbsent}>
            {row.absent ? <UserRoundCheck className="size-4" /> : <UserRoundX className="size-4" />}
          </IconButton>
        </div>
      )}
    </div>
  )
}

function IconButton({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" title={title} onClick={onClick} className="flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-slate-100 hover:text-ink">
      {children}
    </button>
  )
}
