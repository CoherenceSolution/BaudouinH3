import { useEffect, useState } from 'react'
import { doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore'
import { AlarmClock, Play, Plus, Square } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { Match } from '@/lib/types'
import { cx } from '@/lib/format'
import { Button, Card } from './ui'
import { useToast } from './ui/Toast'

/** Fin du minuteur en millisecondes, ou null si aucun minuteur n'est en cours. */
function deadlineMs(match: Match): number | null {
  const d = match.voteDeadline
  return d && typeof d.toMillis === 'function' ? d.toMillis() : null
}

/** Temps restant en millisecondes (négatif une fois le temps écoulé), rafraîchi chaque seconde. */
export function useRemaining(match: Match): number | null {
  const ms = deadlineMs(match)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (ms == null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [ms])
  return ms == null ? null : ms - now
}

/** 9:05, ou 1 h 09 au-delà d'une heure. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Compte à rebours affiché à tout le monde pendant la phase de vote :
 * ceux qui n'ont pas encore voté (ou pas fini) voient combien de temps il leur reste.
 */
export function VoteCountdown({ match, pending }: { match: Match; pending: boolean }) {
  const remaining = useRemaining(match)
  if (remaining == null || match.status !== 'voting') return null
  const expired = remaining <= 0
  const urgent = !expired && remaining <= 120_000
  return (
    <div
      role="status"
      className={cx(
        'mb-4 flex items-center gap-3 rounded-xl border px-4 py-3',
        expired ? 'border-rose/40 bg-rose-soft text-rose' : urgent ? 'border-amber-300 bg-gold-soft text-amber-800' : 'border-line bg-surface text-ink',
      )}
    >
      <AlarmClock className={cx('size-5 shrink-0', !expired && 'animate-pulse')} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{expired ? 'Temps écoulé' : pending ? 'Il vous reste du temps pour voter' : 'Fin des votes'}</div>
        <div className="text-[12px] opacity-80">
          {expired
            ? pending
              ? 'Envoyez votre vote tout de suite : l’orateur va clôturer.'
              : 'L’orateur peut clôturer les votes.'
            : pending
              ? 'Remplissez et envoyez votre vote avant la fin du compte à rebours.'
              : 'Votre vote est envoyé ; vous pouvez encore le modifier.'}
          {match.voteTimerBy ? ` · Minuteur lancé par ${match.voteTimerBy}` : ''}
        </div>
      </div>
      <span className="shrink-0 text-2xl font-bold tabular-nums">{expired ? '0:00' : formatRemaining(remaining)}</span>
    </div>
  )
}

const QUICK_MINUTES = [5, 10, 15]

/**
 * Réglage du minuteur, réservé au staff (admin ou secrétaire) : c'est lui qui déclenche le décompte.
 * Les règles Firestore n'autorisent que le staff à écrire ces champs sur le match.
 */
export function VoteTimerControl({ match }: { match: Match }) {
  const actor = useActor()
  const toast = useToast()
  const remaining = useRemaining(match)
  const running = remaining != null
  const [minutes, setMinutes] = useState(String(match.voteTimerMinutes ?? 10))
  const [busy, setBusy] = useState(false)

  async function apply(patch: Record<string, unknown>, summary: string, message: string) {
    setBusy(true)
    try {
      await updateDoc(doc(db, 'matches', match.id), { ...patch, updatedAt: serverTimestamp() })
      await logActivity(actor, 'update', 'match', match.id, summary)
      toast(message)
    } catch (e) {
      console.error(e)
      toast('Minuteur impossible à régler', 'error')
    } finally {
      setBusy(false)
    }
  }

  const start = (mins: number) =>
    apply(
      { voteDeadline: Timestamp.fromMillis(Date.now() + mins * 60_000), voteTimerMinutes: mins, voteTimerBy: actor.name },
      `Minuteur des votes lancé : ${mins} minutes`,
      `Minuteur lancé : ${mins} minutes`,
    )

  const extend = (mins: number) => {
    const base = remaining != null && remaining > 0 ? Date.now() + remaining : Date.now()
    return apply(
      { voteDeadline: Timestamp.fromMillis(base + mins * 60_000), voteTimerBy: actor.name },
      `Minuteur des votes prolongé de ${mins} minutes`,
      `+${mins} minutes`,
    )
  }

  const stop = () => apply({ voteDeadline: null, voteTimerBy: null }, 'Minuteur des votes arrêté', 'Minuteur arrêté')

  const custom = Number(minutes)
  const customValid = Number.isFinite(custom) && custom > 0 && custom <= 180

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cx('flex size-11 items-center justify-center rounded-xl', running ? 'bg-accent-soft text-accent-strong' : 'bg-slate-100 text-ink-2')}>
            <AlarmClock className="size-5" />
          </span>
          <div>
            <div className="font-semibold">Minuteur des votes</div>
            <div className="text-[13px] text-muted">
              {running
                ? remaining! > 0
                  ? `Il reste ${formatRemaining(remaining!)} aux votants.`
                  : 'Temps écoulé : les votants voient « Temps écoulé ».'
                : 'Donnez un temps limite aux votants : ils voient le décompte sur toutes les pages du match.'}
            </div>
          </div>
        </div>
        {running && <span className="text-2xl font-bold tabular-nums">{formatRemaining(remaining!)}</span>}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {QUICK_MINUTES.map((m) => (
          <Button key={m} size="sm" variant={running ? 'secondary' : 'accent'} icon={<Play className="size-4" />} loading={busy} onClick={() => start(m)}>
            {m} min
          </Button>
        ))}
        <input
          type="number"
          min={1}
          max={180}
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="field h-8 w-20 px-2.5 py-0 text-[13px]"
          aria-label="Durée du minuteur en minutes"
        />
        <Button size="sm" variant="secondary" loading={busy} disabled={!customValid} onClick={() => start(Math.round(custom))}>
          Lancer
        </Button>
        {running && (
          <>
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} loading={busy} onClick={() => extend(2)}>2 min</Button>
            <Button size="sm" variant="ghost" icon={<Square className="size-4" />} loading={busy} onClick={stop}>Arrêter</Button>
          </>
        )}
      </div>
      <p className="mt-3 text-[13px] text-muted">
        Le minuteur n’arrête rien tout seul : à la fin, clôturez les votes quand vous êtes prêt.
      </p>
    </Card>
  )
}
