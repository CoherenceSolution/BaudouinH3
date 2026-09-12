import { useEffect, useMemo, useRef, useState } from 'react'
import { arrayUnion, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { CheckCircle2, Lock, Pencil, Send, AlertTriangle } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { useCategories } from '@/hooks/useSettings'
import type { CategoryDef, Match, Player, Ticket, VoteCategory, VoteEntry } from '@/lib/types'
import { cx, playerName } from '@/lib/format'
import { isTicketComplete } from '@/lib/rankings'
import { PlayerPicker } from '@/components/PlayerPicker'
import { Button, Card, Textarea } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { logActivity } from '@/lib/activity'
import { useActor } from '@/hooks/useActor'

interface Props {
  match: Match
  players: Player[]
  tickets: Ticket[]
  /** true une fois la première lecture des votes terminée */
  loaded: boolean
  myPlayerId: string
}

const emptyEntry = (): VoteEntry => ({ playerId: null, proposal: '', comment: '' })

/** Formulaire de vote (une entrée par catégorie) avec brouillon auto-sauvegardé. */
export function TicketForm({ match, players, tickets, loaded, myPlayerId }: Props) {
  const { user } = useAuth()
  const categories = useCategories()
  const actor = useActor()
  const toast = useToast()
  const ticketId = `${match.id}_${myPlayerId}`
  const existing = tickets.find((t) => t.id === ticketId)
  const me = players.find((p) => p.id === myPlayerId)

  const [entries, setEntries] = useState<Record<VoteCategory, VoteEntry>>({ best: emptyEntry(), worst: emptyEntry(), moment: emptyEntry() })
  const [editing, setEditing] = useState(false)
  const [sending, setSending] = useState(false)
  const hydrated = useRef(false)
  const dirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydratation depuis le vote existant (brouillon ou envoyé), une seule fois après le chargement.
  useEffect(() => {
    if (hydrated.current || !loaded) return
    if (existing) {
      setEntries({ best: existing.best ?? emptyEntry(), worst: existing.worst ?? emptyEntry(), moment: existing.moment ?? emptyEntry() })
    }
    hydrated.current = true
  }, [existing, loaded])

  const locked = match.status !== 'voting' || Boolean(existing?.readAt)
  const submitted = existing?.status === 'submitted'
  const otherDevice = Boolean(existing && user && existing.authorUids && !existing.authorUids.includes(user.uid))
  const showForm = !locked && (!submitted || editing)

  const complete = useMemo(() => isTicketComplete({ best: entries.best, worst: entries.worst, moment: entries.moment } as Ticket), [entries])

  function payload(status: Ticket['status']) {
    return {
      matchId: match.id,
      authorPlayerId: myPlayerId,
      coAuthorPlayerId: null,
      authorUids: arrayUnion(user?.uid ?? 'anonymous'),
      best: entries.best,
      worst: entries.worst,
      moment: entries.moment,
      status,
      updatedAt: serverTimestamp(),
    }
  }

  const baseFields = () => ({
    readAt: existing?.readAt ?? null,
    readOrder: existing?.readOrder ?? null,
    starred: existing?.starred ?? false,
    saved: existing?.saved ?? false,
    revealAuthor: existing?.revealAuthor ?? false,
    createdAt: existing?.createdAt ?? serverTimestamp(),
  })

  // Sauvegarde automatique du brouillon (tant que le vote n'est pas envoyé)
  useEffect(() => {
    if (!hydrated.current || !dirty.current || locked || submitted) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      setDoc(doc(db, 'tickets', ticketId), { ...payload('draft'), ...baseFields() }, { merge: true }).catch(console.error)
    }, 800)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  function update(cat: VoteCategory, patch: Partial<VoteEntry>) {
    dirty.current = true
    setEntries((e) => ({ ...e, [cat]: { ...e[cat], ...patch } }))
  }

  async function send() {
    // Un brouillon en attente ne doit pas écraser l'envoi.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    setSending(true)
    try {
      await setDoc(doc(db, 'tickets', ticketId), { ...payload('submitted'), ...baseFields() }, { merge: true })
      await logActivity(actor, existing?.status === 'submitted' ? 'update' : 'create', 'ticket', ticketId, `Vote ${existing?.status === 'submitted' ? 'modifié' : 'envoyé'} pour ${match.opponent}`)
      setEditing(false)
      toast('Vote envoyé, merci !')
    } catch (e) {
      console.error(e)
      toast('Envoi impossible', 'error')
    } finally {
      setSending(false)
    }
  }

  if (locked && !submitted) {
    return (
      <Card className="flex items-start gap-3 p-5">
        <Lock className="mt-0.5 size-5 shrink-0 text-muted" />
        <div>
          <p className="font-semibold">Les votes sont clos</p>
          <p className="text-[14px] text-muted">{existing?.status === 'draft' ? 'Votre brouillon n’a pas été envoyé à temps.' : 'Vous n’avez pas voté pour ce match.'} Suivez la lecture dans l’onglet « En direct ».</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {otherDevice && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-gold-soft px-4 py-3 text-[13px] text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Un vote existe déjà au nom de <b>{playerName(me)}</b> depuis un autre appareil. Si ce n’est pas vous, changez d’utilisateur. Sinon, vos modifications remplaceront le contenu existant.</span>
        </div>
      )}

      {submitted && !editing && (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><CheckCircle2 className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Vote envoyé</p>
              <p className="text-[14px] text-muted">
                {existing?.readAt ? 'Votre vote a été lu par l’orateur.' : match.status === 'voting' ? 'Vous pouvez encore le modifier tant que la lecture n’a pas commencé.' : 'La lecture est en cours.'}
              </p>
            </div>
            {!locked && <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Modifier</Button>}
          </div>
          <div className="mt-4 space-y-3">
            {categories.map((c) => (
              <TicketSummaryRow key={c.key} category={c} entry={existing![c.key]} players={players} />
            ))}
          </div>
        </Card>
      )}

      {showForm && (
        <>
          <Card className="p-4 sm:p-5">
            <p className="text-[15px] font-semibold">Vous votez en tant que {playerName(me)}</p>
            <p className="text-[13px] text-muted">Votre vote est anonyme. Seul l’orateur peut, s’il en a besoin, voir votre nom depuis sa console.</p>
          </Card>

          {categories.map((c) => (
            <CategoryBlock key={c.key} category={c} entry={entries[c.key]} players={players} onChange={(patch) => update(c.key, patch)} />
          ))}

          <div className="sticky bottom-20 z-10 md:static">
            <Button block size="lg" variant="accent" icon={<Send className="size-4" />} loading={sending} disabled={!complete} onClick={send}>
              {submitted ? 'Mettre à jour mon vote' : 'Envoyer mon vote'}
            </Button>
            {!complete && <p className="mt-2 text-center text-[12px] text-muted">Remplissez les trois catégories pour envoyer. Votre brouillon est sauvegardé automatiquement.</p>}
          </div>
        </>
      )}
    </div>
  )
}

function CategoryBlock({ category, entry, players, onChange }: { category: CategoryDef; entry: VoteEntry; players: Player[]; onChange: (p: Partial<VoteEntry>) => void }) {
  const tone = category.key === 'best' ? 'border-l-gold' : category.key === 'worst' ? 'border-l-rose' : 'border-l-sky'
  return (
    <Card className={cx('border-l-4 p-4 sm:p-5', tone)}>
      <h3 className="mb-3 flex items-center gap-2 text-[16px] font-bold"><span>{category.emoji}</span> {category.label}</h3>
      <div className="space-y-3">
        {category.pickPlayer && <PlayerPicker players={players} value={entry.playerId} onChange={(id) => onChange({ playerId: id })} label="Votre choix" />}
        <Textarea
          label="Commentaire"
          placeholder={category.key === 'moment' ? 'Racontez le geste ou le moment (ce sera lu à voix haute !)' : 'Justifiez votre vote (ce sera lu à voix haute !)'}
          value={entry.comment}
          onChange={(e) => onChange({ comment: e.target.value })}
        />
      </div>
    </Card>
  )
}

export function TicketSummaryRow({ category, entry, players }: { category: CategoryDef; entry: VoteEntry | undefined; players: Player[] | Map<string, Player> }) {
  const p = entry?.playerId ? (players instanceof Map ? players.get(entry.playerId) : players.find((x) => x.id === entry.playerId)) : undefined
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{category.emoji} {category.label}</div>
      {category.pickPlayer && <div className="mt-0.5 text-[14px] font-semibold">{p ? playerName(p) : '—'}</div>}
      {(entry?.comment || entry?.proposal) && <p className="mt-0.5 whitespace-pre-line text-[14px] text-ink-2">{[entry?.proposal, entry?.comment].filter(Boolean).join(' — ')}</p>}
    </div>
  )
}
