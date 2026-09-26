import { useEffect, useState, type FormEvent } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { RefreshCw, Trash2 } from 'lucide-react'
import { db } from '@/lib/firebase'
import type { Match } from '@/lib/types'
import { formatDate, todayIso } from '@/lib/format'
import { logActivity } from '@/lib/activity'
import { initialStatus } from '@/lib/matches'
import { useActor } from '@/hooks/useActor'
import { Button, Input, Modal, Select, Toggle } from './ui'
import { useToast } from './ui/Toast'

interface Props {
  open: boolean
  onClose: () => void
  match?: Match | null
  onCreated?: (id: string) => void
}

/** Création / édition d'un match par le staff. */
export function MatchFormModal({ open, onClose, match, onCreated }: Props) {
  const actor = useActor()
  const toast = useToast()
  const [date, setDate] = useState(todayIso())
  const [opponent, setOpponent] = useState('')
  const [competition, setCompetition] = useState('')
  const [time, setTime] = useState('')
  const [venue, setVenue] = useState('')
  const [home, setHome] = useState(true)
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [status, setStatus] = useState<Match['status']>('voting')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setDate(match?.date ?? todayIso())
    setOpponent(match?.opponent ?? '')
    setCompetition(match?.competition ?? '')
    setTime(match?.time ?? '')
    setVenue(match?.venue ?? '')
    setHome(match?.home ?? true)
    setHomeScore(match?.homeScore != null ? String(match.homeScore) : '')
    setAwayScore(match?.awayScore != null ? String(match.awayScore) : '')
    setStatus(match?.status ?? 'voting')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, match?.id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const data = {
      date,
      opponent: opponent.trim(),
      competition: competition.trim(),
      time: time || null,
      venue: venue.trim() || null,
      home,
      homeScore: homeScore === '' ? null : Number(homeScore),
      awayScore: awayScore === '' ? null : Number(awayScore),
      updatedAt: serverTimestamp(),
    }
    try {
      if (match) {
        await updateDoc(doc(db, 'matches', match.id), { ...data, status })
        await logActivity(actor, 'update', 'match', match.id, `Match modifié : ${opponent.trim()} (${formatDate(date)})`)
        toast('Match mis à jour')
      } else {
        const initial = initialStatus(date)
        const ref = await addDoc(collection(db, 'matches'), { ...data, status: initial, createdBy: actor.uid, createdAt: serverTimestamp() })
        const opened = initial === 'voting'
        await logActivity(actor, 'create', 'match', ref.id, `Match créé : ${opponent.trim()} (${formatDate(date)}) — ${opened ? 'votes ouverts' : 'à venir'}`)
        toast(opened ? 'Match créé, les votes sont ouverts' : 'Match ajouté : les votes s’ouvriront le jour du match')
        onCreated?.(ref.id)
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function remove() {
    if (!match) return
    const again = match.source === 'sportlink' ? ' S’il figure toujours dans l’agenda Sportlink, il reviendra à la prochaine synchronisation.' : ''
    if (!confirm(`Supprimer ce match et tous ses votes ? Cette action est définitive.${again}`)) return
    setLoading(true)
    try {
      await deleteDoc(doc(db, 'matches', match.id))
      await logActivity(actor, 'delete', 'match', match.id, `Match supprimé : ${match.opponent} (${formatDate(match.date)})`)
      toast('Match supprimé')
      onClose()
    } catch (err) {
      console.error(err)
      toast('Suppression impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={match ? 'Modifier le match' : 'Nouveau match'}
      footer={
        <>
          {match && (
            <Button type="button" variant="danger" icon={<Trash2 className="size-4" />} onClick={remove} className="mr-auto">
              Supprimer
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="match-form" loading={loading}>{match ? 'Enregistrer' : initialStatus(date) === 'voting' ? 'Créer et ouvrir les votes' : 'Ajouter le match'}</Button>
        </>
      }
    >
      <form id="match-form" onSubmit={submit} className="space-y-3">
        {match?.source === 'sportlink' && (
          <p className="flex gap-2 rounded-xl bg-sky-soft px-3 py-2 text-[12px] text-sky-700">
            <RefreshCw className="mt-0.5 size-3.5 shrink-0" />
            Match importé de l’agenda Sportlink : la date, l’heure, le lieu et l’adversaire y sont repris chaque jour. Le score, la compétition et les votes ne sont jamais modifiés.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Input label="Heure" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Input label="Compétition" placeholder="Championnat, Coupe…" value={competition} onChange={(e) => setCompetition(e.target.value)} />
        <Input label="Lieu" placeholder="Nom du club, adresse…" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <Input label="Adversaire" placeholder="Nom de l’équipe adverse" value={opponent} onChange={(e) => setOpponent(e.target.value)} required />
        <Toggle checked={home} onChange={setHome} label={home ? 'Baudouin H3 joue à domicile' : 'Baudouin H3 joue à l’extérieur'} />
        <div>
          <label className="label">Score {home ? '(Baudouin H3 – Adversaire)' : '(Adversaire – Baudouin H3)'}</label>
          <div className="flex items-center gap-2">
            <Input type="number" min={0} inputMode="numeric" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} className="flex-1" placeholder="–" />
            <span className="text-muted">–</span>
            <Input type="number" min={0} inputMode="numeric" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} className="flex-1" placeholder="–" />
          </div>
          <p className="mt-1 text-[12px] text-muted">Le score peut être renseigné plus tard.</p>
        </div>
        {match && (
          <Select label="État des votes" value={status} onChange={(e) => setStatus(e.target.value as Match['status'])}>
            <option value="scheduled">À venir (votes ouverts le jour du match)</option>
            <option value="voting">Votes ouverts</option>
            <option value="reading">Lecture en cours</option>
            <option value="closed">Terminé</option>
          </Select>
        )}
      </form>
    </Modal>
  )
}
