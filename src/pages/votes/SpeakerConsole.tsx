import { useMemo, useState } from 'react'
import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { ArrowDown, ArrowUp, Bookmark, BookOpenCheck, Eye, EyeOff, Megaphone, Mic, Play, RotateCcw, Shuffle, Star, Flag } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { usePlayers } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { Like, Match, Player, Ticket } from '@/lib/types'
import { commentFirstPicks, likeCounts, submittedTickets } from '@/lib/rankings'
import { cx, playerName } from '@/lib/format'
import { Button, Card, SectionTitle } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { useLocalFlag } from '@/hooks/useLocalFlag'
import { TicketCard } from './TicketCard'

interface Props {
  match: Match
  players: Map<string, Player>
  tickets: Ticket[]
  likes: Like[]
}

/** Console de l'orateur : ordre de lecture, étoiles, annonce des lectures, révélation d'auteur. */
export function SpeakerConsole({ match, players, tickets, likes }: Props) {
  const { identity, user } = useAuth()
  const allPlayers = usePlayers(true)
  const actor = useActor()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
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
  const speakerName = me ? playerName(me) : actor.name

  async function setStatus(status: Match['status']) {
    setBusy('status')
    try {
      const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() }
      if (status === 'reading') Object.assign(patch, { speakerName, speakerUid: user?.uid ?? null, readingStartedAt: serverTimestamp() })
      if (status === 'closed') patch.closedAt = serverTimestamp()
      await updateDoc(doc(db, 'matches', match.id), patch)
      await logActivity(actor, 'update', 'match', match.id, status === 'reading' ? `Votes clôturés, lecture commencée par ${speakerName}` : status === 'closed' ? 'Soirée terminée' : 'Votes réouverts')
      toast(status === 'reading' ? 'Votes clôturés. Bonne lecture !' : status === 'closed' ? 'Soirée terminée' : 'Votes réouverts')
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
    toast(commentFirstPicks(t).length ? 'Lecture annoncée. Lisez le commentaire, puis annoncez le nom.' : 'Lecture annoncée, classements mis à jour')
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

  return (
    <div className="space-y-5">
      {/* Bandeau de pilotage */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-ink text-accent"><Mic className="size-5" /></span>
            <div>
              <div className="font-semibold">{match.status === 'voting' ? 'Phase de vote' : match.status === 'reading' ? `Lecture par ${match.speakerName ?? speakerName}` : 'Soirée terminée'}</div>
              <div className="text-[13px] text-muted">
                {submitted.length} votes envoyés · {drafts} brouillons · {read.length} lus
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {match.status === 'voting' && (
              <Button variant="accent" icon={<Play className="size-4" />} loading={busy === 'status'} onClick={() => setStatus('reading')}>
                Clôturer les votes et lire
              </Button>
            )}
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
        </div>
        {match.status === 'voting' && <p className="mt-3 text-[13px] text-muted">Vous pouvez déjà préparer l’ordre de lecture et les étoiles. Les votes restent modifiables par leurs auteurs jusqu’à la clôture.</p>}
        <p className="mt-3 text-[13px] text-muted">Les votes sont anonymes. L’icône œil affiche le nom de l’auteur d’un vote pour vous seul, dans cette console.</p>
        {guidedCount > 0 && (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-violet-soft px-3 py-2 text-[13px] font-medium text-violet-700">
            <Megaphone className="mt-0.5 size-4 shrink-0" />
            <span>{guidedCount} vote{guidedCount > 1 ? 's' : ''} demande{guidedCount > 1 ? 'nt' : ''} que vous lisiez le commentaire avant le nom : le nom s’affiche ici quand vous appuyez sur « Annoncer le nom ».</span>
          </p>
        )}
      </Card>

      {/* À lire */}
      <section>
        <SectionTitle right={unread.length > 1 && <Button size="sm" variant="secondary" icon={<Shuffle className="size-4" />} onClick={shuffle}>Mélanger</Button>}>
          À lire ({unread.length})
        </SectionTitle>
        {unread.length === 0 ? (
          <p className="card px-5 py-8 text-center text-[14px] text-muted">{submitted.length === 0 ? 'Aucun vote envoyé pour l’instant.' : 'Tous les votes ont été lus. 🎉'}</p>
        ) : (
          <div className="space-y-3">
            {unread.map((t, i) => (
              <TicketCard
                key={t.id}
                ticket={t}
                players={players}
                showAuthor={t.revealAuthor}
                speakerView
                index={i + 1}
                onReveal={() => setRevealHintSeen(true)}
                revealHint={!revealHintSeen && t.id === hintTicketId}
                actions={
                  <>
                    <IconBtn title="Monter" disabled={i === 0} onClick={() => move(t, -1)}><ArrowUp className="size-4" /></IconBtn>
                    <IconBtn title="Descendre" disabled={i === unread.length - 1} onClick={() => move(t, 1)}><ArrowDown className="size-4" /></IconBtn>
                    <StarBtn t={t} onToggle={() => patchTicket(t, { starred: !t.starred }, t.starred ? 'Étoile retirée' : 'Petite étoile attribuée')} />
                    <SaveBtn t={t} onToggle={() => patchTicket(t, { saved: !t.saved }, t.saved ? 'Vote retiré des conservés' : 'Vote conservé')} />
                    <RevealBtn t={t} onToggle={() => patchTicket(t, { revealAuthor: !t.revealAuthor }, t.revealAuthor ? 'Nom de l’auteur masqué (orateur)' : 'Nom de l’auteur consulté (orateur)')} />
                    <Button size="sm" variant="accent" icon={<BookOpenCheck className="size-4" />} loading={busy === t.id} onClick={() => announce(t)} disabled={match.status === 'voting'} title={match.status === 'voting' ? 'Clôturez d’abord les votes' : 'Annoncer la lecture de ce vote'}>
                      Lire
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Déjà lus */}
      {read.length > 0 && (
        <section>
          <SectionTitle>Lus ({read.length})</SectionTitle>
          <div className="space-y-3 opacity-90">
            {read.map((t, i) => (
              <TicketCard
                key={t.id}
                ticket={t}
                players={players}
                likes={counts}
                showAuthor={t.revealAuthor}
                speakerView
                index={i + 1}
                onReveal={() => setRevealHintSeen(true)}
                revealHint={!revealHintSeen && t.id === hintTicketId}
                actions={
                  <>
                    <StarBtn t={t} onToggle={() => patchTicket(t, { starred: !t.starred }, t.starred ? 'Étoile retirée' : 'Petite étoile attribuée')} />
                    <SaveBtn t={t} onToggle={() => patchTicket(t, { saved: !t.saved }, t.saved ? 'Vote retiré des conservés' : 'Vote conservé')} />
                    <RevealBtn t={t} onToggle={() => patchTicket(t, { revealAuthor: !t.revealAuthor }, t.revealAuthor ? 'Nom de l’auteur masqué (orateur)' : 'Nom de l’auteur consulté (orateur)')} />
                    <IconBtn title="Remettre à lire" onClick={() => patchTicket(t, { readAt: null })}><RotateCcw className="size-4" /></IconBtn>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
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
