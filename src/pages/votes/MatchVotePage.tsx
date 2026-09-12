import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { useLikes, usePlayers, useTickets } from '@/hooks/useData'
import type { Match } from '@/lib/types'
import { formatDate, matchTitle } from '@/lib/format'
import { Spinner, Tabs } from '@/components/ui'
import { MatchStatusBadge, ResultPill } from '@/components/MatchCard'
import { TicketForm } from './TicketForm'
import { SpeakerConsole } from './SpeakerConsole'
import { LiveReading } from './LiveReading'
import { Rankings } from './Rankings'
import { Participation } from './Participation'
import { ChooseIdentity } from './ChooseIdentity'

type Tab = 'ticket' | 'console' | 'participation' | 'live' | 'rankings'

export function MatchVotePage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { identity, isStaff } = useAuth()
  const players = usePlayers()
  const tickets = useTickets(matchId)
  const likes = useLikes(matchId)
  const [match, setMatch] = useState<Match | null | undefined>(undefined)

  const isSpeaker = identity?.mode === 'speaker'
  const canAnimate = isSpeaker || isStaff

  useEffect(() => {
    if (!matchId) return
    return onSnapshot(doc(db, 'matches', matchId), (snap) => setMatch(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Match, 'id'>) }) : null))
  }, [matchId])

  const tabs = useMemo(() => {
    const list: { key: Tab; label: string }[] = []
    if (!isSpeaker) list.push({ key: 'ticket', label: 'Mon vote' })
    if (canAnimate) list.push({ key: 'console', label: 'Console' }, { key: 'participation', label: 'Participation' })
    list.push({ key: 'live', label: 'En direct' }, { key: 'rankings', label: 'Classement' })
    return list
  }, [identity, isSpeaker, canAnimate])

  const [tab, setTab] = useState<Tab>(tabs[0].key)
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0].key)
  }, [tabs, tab])

  // Un votant bascule automatiquement sur la lecture quand l'orateur commence.
  useEffect(() => {
    if (match?.status === 'reading' && !canAnimate && tab === 'ticket') setTab('live')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status])

  if (match === undefined || players.loading) return <Spinner />
  if (match === null)
    return (
      <div>
        <Link to="/votes" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-4" /> Retour</Link>
        <p className="mt-6 text-muted">Ce match n’existe plus.</p>
      </div>
    )

  return (
    <div>
      <Link to="/votes" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-4" /> Tous les matchs</Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{matchTitle(match)}</h1>
            <ResultPill match={match} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span>{formatDate(match.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <MatchStatusBadge status={match.status} />
            {match.speakerName && match.status !== 'voting' && <span>Orateur : {match.speakerName}</span>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Tabs value={tab} onChange={setTab} items={tabs} />
        </div>
      </div>

      {tab === 'ticket' && (identity ? <TicketForm match={match} players={players.data} tickets={tickets.data} loaded={!tickets.loading} myPlayerId={identity.playerId} /> : <ChooseIdentity players={players.data} />)}
      {tab === 'console' && <SpeakerConsole match={match} players={players.byId} tickets={tickets.data} likes={likes.data} />}
      {tab === 'participation' && <Participation players={players.data} tickets={tickets.data} />}
      {tab === 'live' && <LiveReading match={match} players={players.byId} tickets={tickets.data} likes={likes.data} myPlayerId={identity?.playerId ?? null} />}
      {tab === 'rankings' && <Rankings players={players.byId} tickets={tickets.data} likes={likes.data} />}
    </div>
  )
}
