import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { FineType, Match, Player } from '@/lib/types'
import { computeFineAmount, describeFineType, formatEuro } from '@/lib/fines'
import { formatDate, matchTitle, playerFullLabel, playerName, todayIso } from '@/lib/format'
import { PlayerPicker } from '@/components/PlayerPicker'
import { Button, Input, Modal, Select } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface Props {
  open: boolean
  onClose: () => void
  players: Player[]
  types: FineType[]
  matches: Match[]
}

export function AddFineModal({ open, onClose, players, types, matches }: Props) {
  const actor = useActor()
  const toast = useToast()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [typeId, setTypeId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [override, setOverride] = useState('')
  const [date, setDate] = useState(todayIso())
  const [matchId, setMatchId] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setPlayerId(null); setQuantity(''); setOverride(''); setDate(todayIso()); setNote('')
    setTypeId(types[0]?.id ?? '')
    const live = matches.find((m) => m.status !== 'closed') ?? matches[0]
    setMatchId(live?.id ?? '')
    if (live?.date) setDate(live.date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const type = types.find((t) => t.id === typeId)
  const computed = useMemo(() => (type ? computeFineAmount(type, quantity === '' ? null : Number(quantity)) : 0), [type, quantity])
  const amount = override !== '' ? Number(override) : computed

  async function submit() {
    if (!playerId || !type) return
    setLoading(true)
    try {
      const ref = await addDoc(collection(db, 'fines'), {
        playerId,
        fineTypeId: type.id,
        label: type.label,
        matchId: matchId || null,
        date,
        quantity: type.kind === 'perUnit' ? Number(quantity || 0) : null,
        amount,
        note: note.trim(),
        paid: false,
        paidAt: null,
        createdBy: actor.uid,
        createdByName: actor.name,
        createdAt: serverTimestamp(),
      })
      const p = players.find((x) => x.id === playerId)
      await logActivity(actor, 'create', 'fine', ref.id, `Amende infligée : ${type.label} ${formatEuro(amount)} — ${playerFullLabel(p)} (${formatDate(date)})`)
      toast(`Amende de ${formatEuro(amount)} infligée à ${playerName(p)}`)
      onClose()
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Infliger une amende"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button loading={loading} disabled={!playerId || !type || amount < 0} onClick={submit}>Confirmer {amount > 0 ? formatEuro(amount) : ''}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <PlayerPicker players={players} value={playerId} onChange={setPlayerId} label="Joueur" allowCreate compact />
        <Select label="Type d’amende" value={typeId} onChange={(e) => { setTypeId(e.target.value); setOverride('') }}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.label} — {describeFineType(t)}</option>)}
        </Select>
        {type?.kind === 'perUnit' && (
          <Input label={`Nombre de ${type.unitLabel || 'unités'}s`} type="number" min={0} inputMode="numeric" value={quantity} onChange={(e) => { setQuantity(e.target.value); setOverride('') }} hint={`${type.freeUnits ? `${type.freeUnits} offertes · ` : ''}${formatEuro(type.amount)} par ${type.unitLabel || 'unité'}${type.cap ? ` · plafond ${formatEuro(type.cap)}` : ''}`} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Montant (€)" type="number" step="0.5" min={0} value={override !== '' ? override : computed} onChange={(e) => setOverride(e.target.value)} hint={override !== '' ? 'Montant ajusté manuellement' : 'Calculé automatiquement'} />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Select label="Match (optionnel)" value={matchId} onChange={(e) => setMatchId(e.target.value)}>
          <option value="">— Hors match —</option>
          {matches.map((m) => <option key={m.id} value={m.id}>{formatDate(m.date)} · {matchTitle(m)}</option>)}
        </Select>
        <Input label="Note (optionnel)" placeholder="Ex. : arrivé à 20h20 pour un rendez-vous 20h" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  )
}
