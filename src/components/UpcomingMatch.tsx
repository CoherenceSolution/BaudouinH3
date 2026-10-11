import { useState } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { CalendarClock, Clock, House, Info, Pencil, RefreshCw, Vote } from 'lucide-react'
import type { Match } from '@/lib/types'
import { db } from '@/lib/firebase'
import { formatDate } from '@/lib/format'
import { formatTime } from '@/lib/matches'
import { logActivity, readBefore, undoUpdate } from '@/lib/activity'
import { useAuth } from '@/auth/AuthProvider'
import { useActor } from '@/hooks/useActor'
import { useSpeaker } from '@/hooks/useSpeaker'
import { useToast } from './ui/Toast'
import { Button, Card } from './ui'
import { VenueLink } from './MatchCard'
import { MatchFormModal } from './MatchFormModal'

/**
 * Fiche d'un match à venir : date, heure, lieu. Les votes s'ouvrent seuls le jour du match ;
 * le staff et les orateurs désignés peuvent les ouvrir plus tôt (ou pour un match marqué annulé).
 */
export function UpcomingMatchPanel({ match }: { match: Match }) {
  const { isStaff } = useAuth()
  const { canSpeak } = useSpeaker()
  const actor = useActor()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [opening, setOpening] = useState(false)

  async function openVotes() {
    if (match.cancelled && !confirm('Ce match est marqué annulé dans l’agenda. Ouvrir quand même les votes ?')) return
    setOpening(true)
    try {
      const before = await readBefore(`matches/${match.id}`)
      await updateDoc(doc(db, 'matches', match.id), { status: 'voting', updatedAt: serverTimestamp() })
      await logActivity(actor, 'update', 'match', match.id, `Votes ouverts à la main pour ${match.opponent}`, [{ field: 'Statut', before: 'À venir', after: 'Votes ouverts' }], undoUpdate(`matches/${match.id}`, before, ['status']))
      toast('Votes ouverts')
    } catch (e) {
      console.error(e)
      toast('Impossible d’ouvrir les votes', 'error')
    } finally {
      setOpening(false)
    }
  }
  return (
    <Card className="space-y-4 p-5">
      {match.cancelled ? (
        <p className="rounded-xl bg-rose-soft px-4 py-3 text-[14px] font-medium text-rose">Ce match a été annulé ou retiré de l’agenda Sportlink.</p>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-[14px] text-ink-2">
          <CalendarClock className="size-4 shrink-0" /> Les votes s’ouvriront le jour du match.
        </p>
      )}
      {(isStaff || canSpeak) && (
        <Button variant="accent" icon={<Vote className="size-4" />} loading={opening} onClick={openVotes}>
          Ouvrir les votes maintenant
        </Button>
      )}
      <dl className="grid gap-3 text-[14px] sm:grid-cols-2">
        <Row icon={CalendarClock} label="Date">{formatDate(match.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Row>
        <Row icon={Clock} label="Coup d’envoi">{match.time ? formatTime(match.time) : 'Heure à confirmer'}</Row>
        <Row icon={House} label="Rencontre">{match.home ? 'À domicile' : 'À l’extérieur'}{match.competition ? ` · ${match.competition}` : ''}</Row>
        <div>
          <dt className="text-[12px] font-medium text-muted">Lieu</dt>
          <dd className="mt-0.5">{match.venue ? <VenueLink venue={match.venue} className="font-medium" /> : 'Lieu à confirmer'}</dd>
        </div>
      </dl>
      {match.details && (
        <div className="flex gap-2 text-[13px] text-muted">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p className="whitespace-pre-line">{match.details}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1">
          {match.source === 'sportlink' ? <><RefreshCw className="size-3.5" /> Tenu à jour par l’agenda Sportlink</> : 'Match ajouté à la main'}
        </span>
        {isStaff && <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Modifier</Button>}
      </div>
      {isStaff && <MatchFormModal open={editing} match={match} onClose={() => setEditing(false)} />}
    </Card>
  )
}

function Row({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[12px] font-medium text-muted"><Icon className="size-3.5" /> {label}</dt>
      <dd className="mt-0.5 font-medium first-letter:uppercase">{children}</dd>
    </div>
  )
}
