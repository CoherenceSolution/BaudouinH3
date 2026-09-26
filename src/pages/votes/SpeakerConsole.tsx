import { useMemo, useState } from 'react'
import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { ArrowDown, ArrowUp, Bookmark, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardPen, Eye, EyeOff, Flag, Lock, Megaphone, Mic, Pencil, RotateCcw, Shuffle, Star } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { usePlayers } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { Like, Match, Player, Ticket } from '@/lib/types'
import { commentFirstPicks, likeCounts, submittedTickets } from '@/lib/rankings'
import { cx, playerName } from '@/lib/format'
import { Button, Card } from '@/components/ui'
import { VoteTimerControl } from '@/components/VoteTimer'
import { useToast } from '@/components/ui/Toast'
import { useLocalFlag } from '@/hooks/useLocalFlag'
import { TicketCard } from './TicketCard'
import { TicketForm } from './TicketForm'
import { ChooseIdentity } from './ChooseIdentity'
import { EditTicketModal } from './EditTicketModal'
import { ManualVoteModal } from './ManualVoteModal'

interface Props {
  match: Match
  players: Map<string, Player>
  /** Joueurs actifs, pour voter et corriger un nom. */
  playerList: Player[]
  tickets: Ticket[]
  ticketsLoaded: boolean
  likes: Like[]
}

/**
 * Console de l'orateur (et du staff), tout au même endroit :
 * 1. son propre vote, 2. le minuteur, 3. la clôture des votes de tout le monde,
 * puis la lecture : une file d'attente, « Valider le vote » qui l'envoie à tous, les votes lus grisés.
 */
export function SpeakerConsole({ match, players, playerList, tickets, ticketsLoaded, likes }: Props) {
  const { identity, user, isStaff } = useAuth()
  const allPlayers = usePlayers(true)
  const actor = useActor()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<Ticket | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [showRead, setShowRead] = useState(true)
  // La consigne de lecture ne s'affiche que la première fois, sur cet appareil.
  const [revealHintSeen, setRevealHintSeen] = useLocalFlag('h3.revealHintSeen')

  const submitted = useMemo(() => submittedTickets(tickets), [tickets])
  const unread = useMemo(
    () => submitted.filter((t) => !t.readAt).sort((a, b) => (a.readOrder ?? 1e9) - (b.readOrder ?? 1e9) || (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)),
    [submitted],
  )
  const read = useMemo(() => submitted.filter((t) => t.readAt).sort((a, b) => (a.readAt!.toMillis() ?? 0) - (b.readAt!.toMillis() ?? 0)), [submitted])
  const counts = useMemo(() => likeCounts(likes), [likes])
  const drafts = tickets.filter((t) => t.status === 'draft').length
  // Votes dont l'auteur demande que le commentaire soit lu avant le nom.
  const guidedCount = useMemo(() => submitted.reduce((n, t) => n + commentFirstPicks(t).length, 0), [submitted])
  const hintTicketId = useMemo(() => [...read, ...unread].find((t) => commentFirstPicks(t).length > 0)?.id ?? null, [read, unread])

  const me = identity ? allPlayers.byId.get(identity.playerId) : null
  const myTicket = identity ? tickets.find((t) => t.id === `${match.id}_${identity.playerId}`) : undefined
  const speakerName = me ? playerName(me) : actor.name

  async function setStatus(status: Match['status']) {
    setBusy('status')
    try {
      const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() }
      if (status === 'reading') Object.assign(patch, { speakerName, speakerUid: user?.uid ?? null, readingStartedAt: serverTimestamp() })
      if (status === 'closed') patch.closedAt = serverTimestamp()
      // Le minuteur n'a plus de sens hors phase de vote.
      if (status !== 'voting') Object.assign(patch, { voteDeadline: null, voteTimerBy: null })
      await updateDoc(doc(db, 'matches', match.id), patch)
      await logActivity(actor, 'update', 'match', match.id, status === 'reading' ? `Votes clôturés, lecture commencée par ${speakerName}` : status === 'closed' ? 'Soirée terminée' : 'Votes réouverts')
      toast(status === 'reading' ? 'Votes clôturés pour tout le monde. Bonne lecture !' : status === 'closed' ? 'Soirée terminée' : 'Votes réouverts')
    } catch (e) {
      console.error(e)
      toast('Action impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function patchTicket(t: Ticket, patch: Partial<Ticket> | Record<string, unknown>, summary?: string) {
    setBusy(t.id)
    try {
      await updateDoc(doc(db, 'tickets', t.id), { ...patch, updatedAt: serverTimestamp() })
      if (summary) await logActivity(actor, 'update', 'ticket', t.id, summary)
    } catch (e) {
      console.error(e)
      toast('Action impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function announce(t: Ticket) {
    await patchTicket(t, { readAt: serverTimestamp(), readOrder: t.readOrder ?? read.length + 1 })
    toast(commentFirstPicks(t).length ? 'Vote validé et envoyé à tous. Lisez le commentaire, puis annoncez le nom.' : 'Vote validé et envoyé à tous, classements mis à jour')
  }

  async function move(t: Ticket, dir: -1 | 1) {
    const idx = unread.findIndex((x) => x.id === t.id)
    const other = unread[idx + dir]
    if (!other) return
    const batch = writeBatch(db)
    // Normalise l'ordre sur la liste courante puis échange les deux positions.
    unread.forEach((x, i) => {
      const order = i === idx ? idx + dir : i === idx + dir ? idx : i
      batch.update(doc(db, 'tickets', x.id), { readOrder: order })
    })
    await batch.commit().catch((e) => { console.error(e); toast('Réorganisation impossible', 'error') })
  }

  async function shuffle() {
    const ids = unread.map((t) => t.id)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
    const batch = writeBatch(db)
    ids.forEach((id, i) => batch.update(doc(db, 'tickets', id), { readOrder: i }))
    await batch.commit().then(() => toast('Ordre mélangé')).catch((e) => { console.error(e); toast('Mélange impossible', 'error') })
  }

  const editButton = (t: Ticket) => (
    <IconBtn title="Modifier les noms de ce vote" onClick={() => setEditing(t)}><Pencil className="size-4" /></IconBtn>
  )
  const next = unread[0]
  const waiting = unread.slice(1)

  return (
    <div className="space-y-5">
      {/* Bandeau de pilotage : où en est la soirée */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-ink text-accent"><Mic className="size-5" /></span>
            <div>
              <div className="font-semibold">Console de l’orateur</div>
              <div className="text-[13px] text-muted">
                {match.status === 'voting' ? 'Votes ouverts' : match.status === 'reading' ? `Lecture par ${match.speakerName ?? speakerName}` : 'Soirée terminée'}
                {' · '}{submitted.length} votes envoyés · {drafts} en cours · {read.length} lus
              </div>
            </div>
          </div>
          <Stepper status={match.status} />
        </div>
      </Card>

      {match.status === 'voting' && (
        <>
          {/* 1. Mon vote : l'orateur vote comme tout le monde, sans quitter sa console. */}
          <Step n={1} title="Mon vote" done={myTicket?.status === 'submitted'} hint={myTicket?.status === 'submitted' ? 'Envoyé. Vous pouvez le modifier jusqu’à la clôture.' : 'Remplissez votre propre vote avant de clôturer.'}>
            {identity ? (
              <TicketForm match={match} players={playerList} tickets={tickets} loaded={ticketsLoaded} myPlayerId={identity.playerId} />
            ) : (
              <ChooseIdentity players={playerList} />
            )}
          </Step>

          {/* 2. Minuteur : visible par tout le monde, sur toutes les pages. */}
          <Step n={2} title="Minuteur (facultatif)" hint="Donnez un temps limite aux retardataires : le compte à rebours s’affiche chez tout le monde.">
            <VoteTimerControl match={match} />
          </Step>

          {/* 3. Clôture : les votes de tout le monde sont figés, la lecture peut commencer. */}
          <Step n={3} title="Clôturer les votes" hint="Plus personne ne peut voter ni modifier son vote. Vous pourrez rouvrir si besoin.">
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[14px]">
                  <b>{submitted.length}</b> vote{submitted.length > 1 ? 's' : ''} prêt{submitted.length > 1 ? 's' : ''} à lire
                  {drafts > 0 && <span className="text-amber-700"> · {drafts} encore en cours (non envoyé{drafts > 1 ? 's' : ''})</span>}
                </div>
                <Button variant="accent" icon={<Lock className="size-4" />} loading={busy === 'status'} onClick={() => setStatus('reading')}>
                  Clôturer les votes de tout le monde
                </Button>
              </div>
            </Card>
          </Step>
        </>
      )}

      {/* Lecture : file d'attente des votes à lire, puis les votes déjà lus, grisés. */}
      <Step
        n={match.status === 'voting' ? 4 : undefined}
        title={match.status === 'voting' ? 'Préparer la lecture' : 'Lecture des votes'}
        hint={
          match.status === 'voting'
            ? 'Vous pouvez déjà ordonner la file et donner des étoiles. « Valider le vote » s’active après la clôture.'
            : 'Lisez le vote en tête de file à voix haute, puis appuyez sur « Valider le vote » : il s’affiche chez tout le monde et compte dans les classements.'
        }
        right={
          <div className="flex flex-wrap gap-2">
            {isStaff && <Button size="sm" variant="secondary" icon={<ClipboardPen className="size-4" />} onClick={() => setManualOpen(true)}>Vote hors plateforme</Button>}
            {unread.length > 1 && <Button size="sm" variant="secondary" icon={<Shuffle className="size-4" />} onClick={shuffle}>Mélanger</Button>}
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-muted">Les votes sont anonymes. L’icône œil affiche le nom de l’auteur d’un vote pour vous seul ; le crayon corrige un nom mal choisi.</p>
          {guidedCount > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-violet-soft px-3 py-2 text-[13px] font-medium text-violet-700">
              <Megaphone className="mt-0.5 size-4 shrink-0" />
              <span>{guidedCount} vote{guidedCount > 1 ? 's' : ''} demande{guidedCount > 1 ? 'nt' : ''} que vous lisiez le commentaire avant le nom : le nom s’affiche ici quand vous appuyez sur « Annoncer le nom ».</span>
            </p>
          )}

          {submitted.length > 0 && (
            <div>
              <div className="mb-1 flex justify-between text-[12px] font-medium text-muted">
                <span>{read.length} lu{read.length > 1 ? 's' : ''} sur {submitted.length}</span>
                <span>{unread.length} dans la file</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.round((read.length / submitted.length) * 100)}%` }} />
              </div>
            </div>
          )}

          {!next ? (
            <p className="card px-5 py-8 text-center text-[14px] text-muted">{submitted.length === 0 ? 'Aucun vote envoyé pour l’instant.' : 'Tous les votes ont été lus. 🎉'}</p>
          ) : (
            <section>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-accent-strong">{match.status === 'voting' ? 'Premier vote de la file' : 'À lire maintenant'}</h3>
              <TicketCard
                key={next.id}
                ticket={next}
                players={players}
                showAuthor={next.revealAuthor}
                speakerView
                index={read.length + 1}
                className="ring-2 ring-accent-strong/60"
                onReveal={() => setRevealHintSeen(true)}
                revealHint={!revealHintSeen && next.id === hintTicketId}
                actions={
                  <>
                    {waiting.length > 0 && <IconBtn title="Descendre" onClick={() => move(next, 1)}><ArrowDown className="size-4" /></IconBtn>}
                    <StarBtn t={next} onToggle={() => patchTicket(next, { starred: !next.starred }, next.starred ? 'Étoile retirée' : 'Petite étoile attribuée')} />
                    <SaveBtn t={next} onToggle={() => patchTicket(next, { saved: !next.saved }, next.saved ? 'Vote retiré des conservés' : 'Vote conservé')} />
                    <RevealBtn t={next} onToggle={() => patchTicket(next, { revealAuthor: !next.revealAuthor }, next.revealAuthor ? 'Nom de l’auteur masqué (orateur)' : 'Nom de l’auteur consulté (orateur)')} />
                    {editButton(next)}
                  </>
                }
                footer={
                  <Button block size="lg" variant="accent" icon={<CheckCircle2 className="size-5" />} loading={busy === next.id} onClick={() => announce(next)} disabled={match.status === 'voting'}>
                    {match.status === 'voting' ? 'Clôturez d’abord les votes' : 'Valider le vote'}
                  </Button>
                }
              />
            </section>
          )}

          {waiting.length > 0 && (
            <section>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">File d’attente ({waiting.length})</h3>
              <div className="space-y-3">
                {waiting.map((t, i) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    players={players}
                    showAuthor={t.revealAuthor}
                    speakerView
                    index={read.length + i + 2}
                    onReveal={() => setRevealHintSeen(true)}
                    revealHint={!revealHintSeen && t.id === hintTicketId}
                    actions={
                      <>
                        <IconBtn title="Monter" onClick={() => move(t, -1)}><ArrowUp className="size-4" /></IconBtn>
                        <IconBtn title="Descendre" disabled={i === waiting.length - 1} onClick={() => move(t, 1)}><ArrowDown className="size-4" /></IconBtn>
                        <StarBtn t={t} onToggle={() => patchTicket(t, { starred: !t.starred }, t.starred ? 'Étoile retirée' : 'Petite étoile attribuée')} />
                        <SaveBtn t={t} onToggle={() => patchTicket(t, { saved: !t.saved }, t.saved ? 'Vote retiré des conservés' : 'Vote conservé')} />
                        <RevealBtn t={t} onToggle={() => patchTicket(t, { revealAuthor: !t.revealAuthor }, t.revealAuthor ? 'Nom de l’auteur masqué (orateur)' : 'Nom de l’auteur consulté (orateur)')} />
                        {editButton(t)}
                      </>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* Déjà lus : grisés, repliables, toujours corrigeables. */}
          {read.length > 0 && (
            <section>
              <button type="button" onClick={() => setShowRead((v) => !v)} className="mb-2 flex w-full items-center gap-2 text-left text-[12px] font-semibold uppercase tracking-wider text-muted hover:text-ink">
                {showRead ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                Déjà lus ({read.length})
              </button>
              {showRead && (
                <div className="space-y-3">
                  {[...read].reverse().map((t) => (
                    <TicketCard
                      key={t.id}
                      ticket={t}
                      players={players}
                      likes={counts}
                      showAuthor={t.revealAuthor}
                      speakerView
                      index={read.indexOf(t) + 1}
                      className="bg-slate-50 opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
                      readBadge
                      onReveal={() => setRevealHintSeen(true)}
                      revealHint={!revealHintSeen && t.id === hintTicketId}
                      actions={
                        <>
                          <StarBtn t={t} onToggle={() => patchTicket(t, { starred: !t.starred }, t.starred ? 'Étoile retirée' : 'Petite étoile attribuée')} />
                          <SaveBtn t={t} onToggle={() => patchTicket(t, { saved: !t.saved }, t.saved ? 'Vote retiré des conservés' : 'Vote conservé')} />
                          <RevealBtn t={t} onToggle={() => patchTicket(t, { revealAuthor: !t.revealAuthor }, t.revealAuthor ? 'Nom de l’auteur masqué (orateur)' : 'Nom de l’auteur consulté (orateur)')} />
                          {editButton(t)}
                          <IconBtn title="Remettre dans la file" onClick={() => patchTicket(t, { readAt: null })}><RotateCcw className="size-4" /></IconBtn>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </Step>

      {/* Fin de soirée */}
      {match.status !== 'voting' && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="text-[13px] text-muted">
            {match.status === 'reading' ? 'Tous les votes sont lus ? Terminez la soirée. Besoin d’un vote en plus ? Rouvrez les votes.' : 'La soirée est terminée. Vous pouvez reprendre la lecture si besoin.'}
          </div>
          <div className="flex flex-wrap gap-2">
            {match.status === 'reading' && (
              <>
                <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" />} loading={busy === 'status'} onClick={() => setStatus('voting')}>Rouvrir les votes</Button>
                <Button icon={<Flag className="size-4" />} loading={busy === 'status'} onClick={() => setStatus('closed')}>Terminer la soirée</Button>
              </>
            )}
            {match.status === 'closed' && (
              <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" />} loading={busy === 'status'} onClick={() => setStatus('reading')}>Reprendre la lecture</Button>
            )}
          </div>
        </Card>
      )}

      <EditTicketModal ticket={editing} players={playerList} onClose={() => setEditing(null)} />
      {isStaff && <ManualVoteModal open={manualOpen} match={match} players={playerList} tickets={tickets} onClose={() => setManualOpen(false)} />}
    </div>
  )
}

/** Les trois temps de la soirée, pour savoir d'un coup d'œil où l'on en est. */
function Stepper({ status }: { status: Match['status'] }) {
  const steps: { key: Match['status']; label: string }[] = [
    { key: 'voting', label: 'Votes ouverts' },
    { key: 'reading', label: 'Lecture' },
    { key: 'closed', label: 'Terminé' },
  ]
  const current = steps.findIndex((s) => s.key === status)
  return (
    <ol className="flex items-center gap-1.5 text-[12px] font-medium">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className={cx('rounded-full px-2.5 py-1', i === current ? 'bg-ink text-accent' : i < current ? 'bg-accent-soft text-accent-strong' : 'bg-slate-100 text-muted')}>{s.label}</span>
          {i < steps.length - 1 && <ChevronRight className="size-3.5 text-muted" />}
        </li>
      ))}
    </ol>
  )
}

/** Une étape numérotée de la console. */
function Step({ n, title, hint, done, right, children }: { n?: number; title: string; hint?: string; done?: boolean; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-start gap-2.5">
          {n != null && (
            <span className={cx('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold', done ? 'bg-accent text-ink' : 'bg-ink text-white')}>
              {done ? <Check className="size-3.5" /> : n}
            </span>
          )}
          <div>
            <h2 className="text-[16px] font-bold leading-tight">{title}</h2>
            {hint && <p className="text-[13px] text-muted">{hint}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function IconBtn({ children, title, onClick, disabled, active, activeClass }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; active?: boolean; activeClass?: string }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx('flex size-8 items-center justify-center rounded-lg transition disabled:opacity-30', active ? activeClass : 'text-muted hover:bg-slate-100 hover:text-ink')}
    >
      {children}
    </button>
  )
}

function StarBtn({ t, onToggle }: { t: Ticket; onToggle: () => void }) {
  return (
    <IconBtn title={t.starred ? 'Retirer la petite étoile' : 'Attribuer une petite étoile'} onClick={onToggle} active={t.starred} activeClass="bg-gold-soft text-amber-600">
      <Star className={cx('size-4', t.starred && 'fill-current')} />
    </IconBtn>
  )
}

function SaveBtn({ t, onToggle }: { t: Ticket; onToggle: () => void }) {
  return (
    <IconBtn title={t.saved ? 'Ne plus conserver' : 'Conserver ce vote'} onClick={onToggle} active={t.saved} activeClass="bg-sky-soft text-sky-700">
      <Bookmark className={cx('size-4', t.saved && 'fill-current')} />
    </IconBtn>
  )
}

function RevealBtn({ t, onToggle }: { t: Ticket; onToggle: () => void }) {
  return (
    <IconBtn title={t.revealAuthor ? 'Masquer le nom de l’auteur' : 'Voir le nom de l’auteur (pour vous seul)'} onClick={onToggle} active={t.revealAuthor} activeClass="bg-violet-soft text-violet-700">
      {t.revealAuthor ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </IconBtn>
  )
}
