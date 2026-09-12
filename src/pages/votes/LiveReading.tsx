import { useMemo } from 'react'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Radio } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import type { Like, Match, Player, Ticket, VoteCategory } from '@/lib/types'
import { likeCounts, readTickets, submittedTickets } from '@/lib/rankings'
import { EmptyState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { TicketCard } from './TicketCard'

interface Props {
  match: Match
  players: Map<string, Player>
  tickets: Ticket[]
  likes: Like[]
  myPlayerId: string | null
}

/** Vue "En direct" : les tickets lus apparaissent au fur et à mesure, chacun peut voter pour sa contribution préférée. */
export function LiveReading({ match, players, tickets, likes, myPlayerId }: Props) {
  const { isStaff } = useAuth()
  const toast = useToast()
  const read = useMemo(() => readTickets(tickets).sort((a, b) => (b.readAt?.toMillis() ?? 0) - (a.readAt?.toMillis() ?? 0)), [tickets])
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
            showAuthor={t.revealAuthor || isStaff}
            index={read.length - i}
            myLikes={myLikes}
            onLike={myPlayerId ? (c) => toggleLike(t.id, c) : undefined}
          />
        ))
      )}
    </div>
  )
}
