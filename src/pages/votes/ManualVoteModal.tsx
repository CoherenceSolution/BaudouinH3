import { useMemo, useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { ClipboardPen } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useActor } from '@/hooks/useActor'
import { useCategories } from '@/hooks/useSettings'
import { logActivity, readBefore, undoCreate, undoDelete } from '@/lib/activity'
import type { Match, Player, Ticket, VoteCategory, VoteEntry } from '@/lib/types'
import { playerFullLabel } from '@/lib/format'
import { PlayerPicker } from '@/components/PlayerPicker'
import { Button, Modal } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { CategoryBlock } from './TicketForm'

interface Props {
  open: boolean
  match: Match
  players: Player[]
  tickets: Ticket[]
  onClose: () => void
}

const emptyEntry = (): VoteEntry => ({ playerId: null, proposal: '', comment: '', commentFirst: false })

/**
 * Vote hors plateforme : quelqu'un a voté sur papier, par message ou de vive voix.
 * Le staff l'encode ici pour qu'il soit lu et comptabilisé comme les autres.
 * L'auteur est facultatif ; s'il est connu, son vote prend la place habituelle (un vote par joueur).
 */
export function ManualVoteModal({ open, match, players, tickets, onClose }: Props) {
  const categories = useCategories()
  const actor = useActor()
  const toast = useToast()
  const [author, setAuthor] = useState<string | null>(null)
  const [entries, setEntries] = useState<Record<VoteCategory, VoteEntry>>({ best: emptyEntry(), worst: emptyEntry(), moment: emptyEntry() })
  const [saving, setSaving] = useState(false)

  // Les joueurs qui ont déjà un vote envoyé ne peuvent pas en avoir un second.
  const alreadyVoted = useMemo(() => tickets.filter((t) => t.status === 'submitted').map((t) => t.authorPlayerId), [tickets])
  const filled = categories.filter((c) => entries[c.key].playerId).length

  function reset() {
    setAuthor(null)
    setEntries({ best: emptyEntry(), worst: emptyEntry(), moment: emptyEntry() })
  }

  function close() {
    reset()
    onClose()
  }

  async function save() {
    if (filled === 0) return
    setSaving(true)
    try {
      const authorPlayerId = author ?? `manual-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const id = `${match.id}_${authorPlayerId}`
      const existing = tickets.find((t) => t.id === id)
      const before = await readBefore(`tickets/${id}`)
      await setDoc(doc(db, 'tickets', id), {
        matchId: match.id,
        authorPlayerId,
        coAuthorPlayerId: null,
        authorUids: [],
        best: entries.best,
        worst: entries.worst,
        moment: entries.moment,
        status: 'submitted',
        readAt: null,
        readOrder: null,
        starred: false,
        saved: false,
        revealAuthor: false,
        manual: true,
        enteredByName: actor.name,
        createdAt: existing?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      const who = author ? playerFullLabel(players.find((p) => p.id === author)) : 'auteur non précisé'
      await logActivity(actor, 'create', 'ticket', id, `Vote hors plateforme encodé (${who}) pour ${match.opponent}`, undefined, before ? undoDelete(`tickets/${id}`, before) : undoCreate(`tickets/${id}`))
      toast('Vote ajouté à la file de lecture')
      close()
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      wide
      onClose={close}
      title="Ajouter un vote hors plateforme"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Annuler</Button>
          <Button variant="accent" icon={<ClipboardPen className="size-4" />} loading={saving} disabled={filled === 0} onClick={save}>
            Comptabiliser ce vote
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-muted">
        Pour quelqu’un qui a voté en dehors de l’application (papier, message, à voix haute). Le vote rejoint la file de lecture
        et compte dans les classements dès qu’il est lu, comme les autres. Il reste anonyme dans le direct.
      </p>
      <div className="space-y-4">
        <section>
          <h4 className="mb-1 text-[14px] font-bold">Qui a voté ? <span className="font-normal text-muted">(facultatif)</span></h4>
          <p className="mb-2 text-[12px] text-muted">Si vous le connaissez, il ne pourra plus envoyer d’autre vote pour ce match. Sinon, laissez « Aucun ».</p>
          <PlayerPicker players={players} value={author} onChange={setAuthor} exclude={alreadyVoted} allowNone compact />
        </section>
        {categories.map((c) => (
          <CategoryBlock
            key={c.key}
            category={c}
            entry={entries[c.key]}
            players={players}
            commentPlaceholder="Commentaire à lire (facultatif)"
            onChange={(patch) => setEntries((e) => ({ ...e, [c.key]: { ...e[c.key], ...patch } }))}
          />
        ))}
        {filled === 0 && <p className="text-center text-[12px] text-muted">Choisissez au moins un joueur dans une catégorie.</p>}
      </div>
    </Modal>
  )
}
