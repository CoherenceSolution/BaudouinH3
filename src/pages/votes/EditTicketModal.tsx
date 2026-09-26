import { useEffect, useState } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Save } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useActor } from '@/hooks/useActor'
import { useCategories } from '@/hooks/useSettings'
import { logActivity } from '@/lib/activity'
import type { Player, Ticket, VoteCategory } from '@/lib/types'
import { playerFullLabel, playerName } from '@/lib/format'
import { PlayerPicker } from '@/components/PlayerPicker'
import { Button, Modal } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface Props {
  ticket: Ticket | null
  players: Player[]
  onClose: () => void
}

type Picks = Record<VoteCategory, string | null>

/**
 * Correction d'un vote : le votant s'est trompé de nom. L'orateur, un secrétaire ou l'admin
 * remplace le joueur désigné dans une ou plusieurs catégories. Les commentaires ne changent pas ;
 * les classements et le direct se mettent à jour aussitôt.
 */
export function EditTicketModal({ ticket, players, onClose }: Props) {
  const categories = useCategories()
  const actor = useActor()
  const toast = useToast()
  const [picks, setPicks] = useState<Picks>({ best: null, worst: null, moment: null })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ticket) setPicks({ best: ticket.best?.playerId ?? null, worst: ticket.worst?.playerId ?? null, moment: ticket.moment?.playerId ?? null })
  }, [ticket])

  if (!ticket) return null
  const byId = new Map(players.map((p) => [p.id, p]))
  const changed = categories.filter((c) => (ticket[c.key]?.playerId ?? null) !== picks[c.key])

  async function save() {
    if (!ticket || changed.length === 0) return
    setSaving(true)
    try {
      const patch: Record<string, unknown> = { correctedByName: actor.name, updatedAt: serverTimestamp() }
      for (const c of changed) patch[`${c.key}.playerId`] = picks[c.key]
      await updateDoc(doc(db, 'tickets', ticket.id), patch)
      const summary = changed
        .map((c) => `${c.label} : ${playerFullLabel(byId.get(ticket[c.key]?.playerId ?? '')) || '—'} → ${playerFullLabel(byId.get(picks[c.key] ?? '')) || '—'}`)
        .join(' ; ')
      const changes = changed.map((c) => ({
        field: c.label,
        before: playerFullLabel(byId.get(ticket[c.key]?.playerId ?? '')) || '—',
        after: playerFullLabel(byId.get(picks[c.key] ?? '')) || '—',
      }))
      await logActivity(actor, 'update', 'ticket', ticket.id, `Vote corrigé — ${summary}`, changes)
      toast('Vote corrigé, classements mis à jour')
      onClose()
    } catch (e) {
      console.error(e)
      toast('Correction impossible', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Modifier les noms de ce vote"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="accent" icon={<Save className="size-4" />} loading={saving} disabled={changed.length === 0} onClick={save}>
            Enregistrer la correction
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-muted">
        Le votant s’est trompé de nom ? Choisissez le bon joueur. Les commentaires restent tels quels, le vote reste anonyme,
        et les classements se mettent à jour pour tout le monde.
      </p>
      <div className="space-y-5">
        {categories.map((c) => {
          const e = ticket[c.key]
          const initial = e?.playerId ? byId.get(e.playerId) : undefined
          return (
            <section key={c.key}>
              <h4 className="mb-1 flex items-center gap-2 text-[14px] font-bold"><span>{c.emoji}</span> {c.label}</h4>
              {(e?.comment || e?.proposal) && <p className="mb-2 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-ink-2">{[e?.proposal, e?.comment].filter(Boolean).join(' — ')}</p>}
              {initial && picks[c.key] !== initial.id && <p className="mb-1 text-[12px] text-muted">Avant : {playerName(initial)}</p>}
              <PlayerPicker players={players} value={picks[c.key]} onChange={(id) => setPicks((p) => ({ ...p, [c.key]: id }))} compact />
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
