import { useMemo, useState } from 'react'
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { Check, CheckCheck, Coins, RefreshCw, RotateCcw, UserRoundX, UserRoundCheck } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { Coum, Match, Player } from '@/lib/types'
import { coumId, coumRows, coumTotals, type CoumRow } from '@/lib/coums'
import { cx, playerName } from '@/lib/format'
import { Avatar, Badge, Button, Card, SectionTitle, Spinner, Stat } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface Props {
  match: Match
  players: Player[]
  coums: Coum[]
  loading: boolean
}

/**
 * La coum d'un match : qui a payé, qui doit encore, qui est absent.
 * C'est une feuille du moment, pour les présents du jour — ni montants, ni caisse, ni historique :
 * le trésorier (staff) coche ce qu'il a reçu, tout le monde voit qui a coumé.
 */
export function CoumPanel({ match, players, coums, loading }: Props) {
  const { isStaff } = useAuth()
  const actor = useActor()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const rows = useMemo(
    () => coumRows(players, coums, (a, b) => playerName(a).localeCompare(playerName(b), 'fr')),
    [players, coums],
  )
  const totals = useMemo(() => coumTotals(rows), [rows])
  const pct = totals.roundsDue ? Math.round((Math.min(totals.roundsPaid, totals.roundsDue) / totals.roundsDue) * 100) : 0
  const done = totals.present > 0 && totals.pendingPlayers === 0

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
      `Coum reçue : ${playerName(row.player)}`,
    )

  const cancel = (row: CoumRow) =>
    write(row, { paid: Math.max(0, row.paid - 1) }, `Coum annulée : ${playerName(row.player)}`)

  const toggleAbsent = (row: CoumRow) =>
    write(row, { absent: !row.absent }, row.absent ? `${playerName(row.player)} n'est plus noté absent` : `${playerName(row.player)} noté absent (pas de coum)`)

  const recoumOne = (row: CoumRow) =>
    write(row, { rounds: row.rounds + 1, absent: false }, `Recoum : une coum de plus demandée à ${playerName(row.player)}`)

  /** Recoumer : une coum de plus pour tous les présents. */
  async function recoumAll() {
    const present = rows.filter((r) => !r.absent)
    if (present.length === 0) return
    if (!confirm(`Redemander une coum à ${present.length} présent${present.length > 1 ? 's' : ''} ?`)) return
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
      await logActivity(actor, 'update', 'coum', match.id, `Recoum : une coum de plus demandée à ${present.length} présents`)
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
              <div className="text-[13px] text-muted">Chacun paie la même chose : on note simplement qui a coumé, parmi les présents.</div>
            </div>
          </div>
          {isStaff && (
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={busy === 'all'} onClick={recoumAll} disabled={totals.present === 0}>
              Recoumer les présents
            </Button>
          )}
        </div>

        {done ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-3 text-[14px] font-semibold text-accent-strong">
            <CheckCheck className="size-4 shrink-0" />
            Tout le monde a coumé. Rien à relancer.
          </div>
        ) : (
          <>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {totals.recoumed && (
              <div className="mt-2 text-[12px] text-muted">{totals.roundsPaid} coum{totals.roundsPaid > 1 ? 's' : ''} reçue{totals.roundsPaid > 1 ? 's' : ''} sur {totals.roundsDue} demandée{totals.roundsDue > 1 ? 's' : ''} (recoum en cours)</div>
            )}
          </>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Ont coumé" value={`${totals.paidPlayers} / ${totals.present}`} tone="accent" />
          <Stat label="Doivent encore" value={totals.pendingPlayers} tone="rose" />
          <Stat label="Absents" value={totals.absent} sub="ne doivent rien" />
        </div>

        <p className="mt-3 text-[13px] text-muted">
          {isStaff
            ? 'Cochez « A payé » dès que vous recevez la coum d’un joueur. « Recoumer » en redemande une aux présents.'
            : 'Le trésorier coche les coums qu’il a reçues. Tout le monde voit qui a coumé.'}
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

function CoumRowView({
  row, isStaff, busy, onCollect, onCancel, onToggleAbsent, onRecoum,
}: {
  row: CoumRow
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
          <div className="text-[12px] text-muted">{row.paid} reçue{row.paid > 1 ? 's' : ''} sur {row.rounds} demandée{row.rounds > 1 ? 's' : ''}</div>
        )}
      </div>
      {row.state === 'paid' && <Badge tone="accent"><Check className="size-3" /> A coumé{row.rounds > 1 ? ` ×${row.rounds}` : ''}</Badge>}
      {row.state === 'pending' && <Badge tone="rose">Pas encore{owed > 1 ? ` ×${owed}` : ''}</Badge>}
      {row.state === 'absent' && <Badge tone="neutral">Absent</Badge>}
      {isStaff && (
        <div className="flex items-center gap-1">
          {!row.absent && row.state !== 'paid' && (
            <Button size="sm" variant="secondary" icon={<Check className="size-4 text-accent-strong" />} loading={busy} onClick={onCollect}>A payé</Button>
          )}
          {row.paid > 0 && (
            <IconButton title="Annuler la dernière coum reçue" onClick={onCancel}><RotateCcw className="size-4" /></IconButton>
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
