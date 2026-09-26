import { useMemo, useState } from 'react'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Flame, Pencil, Radio } from 'lucide-react'
import { db } from '@/lib/firebase'
import type { Like, Match, Player, Ticket, VoteCategory } from '@/lib/types'
import { VOTE_CATEGORIES } from '@/lib/types'
import { useCategories, useLiveAlertThreshold } from '@/hooks/useSettings'
import { likeCounts, nominationProgress, readTickets, submittedTickets } from '@/lib/rankings'
import { playerName } from '@/lib/format'
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { TicketCard } from './TicketCard'
import { EditTicketModal } from './EditTicketModal'

interface Props {
  match: Match
  players: Map<string, Player>
  playerList: Player[]
  tickets: Ticket[]
  likes: Like[]
  myPlayerId: string | null
  /** Orateur, secrétaire ou admin : peut corriger un nom mal choisi dans un vote lu. */
  canEdit?: boolean
}

/** Vue "En direct" : les tickets lus apparaissent au fur et à mesure, chacun peut voter pour sa contribution préférée. */
export function LiveReading({ match, players, playerList, tickets, likes, myPlayerId, canEdit }: Props) {
  const toast = useToast()
  const [editing, setEditing] = useState<Ticket | null>(null)
  const threshold = useLiveAlertThreshold()
  const readAsc = useMemo(() => readTickets(tickets).sort((a, b) => (a.readAt?.toMillis() ?? 0) - (b.readAt?.toMillis() ?? 0)), [tickets])
  const read = useMemo(() => [...readAsc].reverse(), [readAsc])
  const progress = useMemo(() => nominationProgress(readAsc, threshold), [readAsc, threshold])
  const counts = useMemo(() => likeCounts(likes), [likes])
  const total = submittedTickets(tickets).length
  const myLikes = useMemo(() => {
    const m: Partial<Record<VoteCategory, string>> = {}
    for (const l of likes) if (l.voterPlayerId === myPlayerId) m[l.category] = l.ticketId
    return m
  }, [likes, myPlayerId])

  async function toggleLike(ticketId: string, category: VoteCategory) {
    if (!myPlayerId) return
    const ref = doc(db, 'likes', `${match.id}_${myPlayerId}_${category}`)
    try {
      if (myLikes[category] === ticketId) await deleteDoc(ref)
      else await setDoc(ref, { voterPlayerId: myPlayerId, category, ticketId, matchId: match.id, createdAt: serverTimestamp() })
    } catch (e) {
      console.error(e)
      toast('Vote impossible', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-white">
        <div className="flex items-center gap-2 text-[14px]">
          <Radio className={match.status === 'reading' ? 'size-4 animate-pulse text-accent' : 'size-4 text-slate-400'} />
          {match.status === 'voting' ? 'En attente du début de la lecture' : match.status === 'reading' ? 'Lecture en cours' : 'Lecture terminée'}
        </div>
        <span className="text-[13px] text-slate-300">{read.length} / {total} votes lus</span>
      </div>

      <NominationAlerts alerts={progress.alerts} players={players} threshold={threshold} />

      {myPlayerId && read.length > 0 && <p className="text-[13px] text-muted">Touchez ♥ pour désigner votre contribution préférée dans chaque catégorie (un seul choix par catégorie, modifiable).</p>}
      {read.length === 0 ? (
        <EmptyState icon={<Radio className="size-6" />} title="Aucun vote lu pour le moment" description="Les votes apparaîtront ici dès que l’orateur annoncera leur lecture." />
      ) : (
        read.map((t, i) => (
          <TicketCard
            key={t.id}
            ticket={t}
            players={players}
            likes={counts}
            showAuthor={false}
            index={read.length - i}
            myLikes={myLikes}
            onLike={myPlayerId ? (c) => toggleLike(t.id, c) : undefined}
            nominationCounts={nominationCountsOf(progress.running, t.id)}
            alertThreshold={threshold}
            actions={
              canEdit && (
                <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(t)} title="Corriger un nom mal choisi dans ce vote">
                  Modifier
                </Button>
              )
            }
          />
        ))
      )}
      {canEdit && <EditTicketModal ticket={editing} players={playerList} onClose={() => setEditing(null)} />}
    </div>
  )
}

function nominationCountsOf(running: Map<string, number>, ticketId: string): Partial<Record<VoteCategory, number>> {
  const out: Partial<Record<VoteCategory, number>> = {}
  for (const c of VOTE_CATEGORIES) {
    const n = running.get(`${ticketId}:${c}`)
    if (n != null) out[c] = n
  }
  return out
}

/** Bandeau du direct : les joueurs qui ont atteint le seuil de voix dans une catégorie. */
function NominationAlerts({ alerts, players, threshold }: { alerts: ReturnType<typeof nominationProgress>['alerts']; players: Map<string, Player>; threshold: number }) {
  const categories = useCategories()
  if (alerts.length === 0) return null
  return (
    <Card className="border-gold/40 bg-gold-soft/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-amber-800">
        <Flame className="size-4 animate-pulse" />
        {threshold} voix atteintes
      </div>
      <ul className="space-y-2">
        {alerts.map((a) => {
          const c = categories.find((x) => x.key === a.category)
          const p = players.get(a.playerId)
          return (
            <li key={`${a.category}:${a.playerId}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2">
              <Avatar player={p} size="sm" />
              <span className="text-[14px] font-semibold">{playerName(p)}</span>
              <span className="text-[13px] text-muted">{c?.emoji} {c?.label}</span>
              <Badge tone="gold" className="ml-auto font-semibold">{a.count} voix</Badge>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[12px] text-amber-800/80">Dès qu’un joueur atteint {threshold} voix dans une catégorie, il apparaît ici et sur les votes lus.</p>
    </Card>
  )
}
