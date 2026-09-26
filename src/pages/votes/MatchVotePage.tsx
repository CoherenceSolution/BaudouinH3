import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useCoums, useLikes, useMatch, usePlayers, useTickets } from '@/hooks/useData'
import { formatDate, matchTitle } from '@/lib/format'
import { Spinner, Tabs } from '@/components/ui'
import { MatchStatusBadge, ResultPill, VenueLink } from '@/components/MatchCard'
import { UpcomingMatchPanel } from '@/components/UpcomingMatch'
import { formatTime } from '@/lib/matches'
import { VoteCountdown } from '@/components/VoteTimer'
import { TicketForm } from './TicketForm'
import { SpeakerConsole } from './SpeakerConsole'
import { LiveReading } from './LiveReading'
import { Rankings } from './Rankings'
import { Participation } from './Participation'
import { ChooseIdentity } from './ChooseIdentity'
import { CoumPanel } from './CoumPanel'

type Tab = 'ticket' | 'console' | 'participation' | 'live' | 'rankings' | 'coum'

export function MatchVotePage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { identity, isStaff } = useAuth()
  const players = usePlayers()
  const tickets = useTickets(matchId)
  const likes = useLikes(matchId)
  const coums = useCoums(matchId)
  const match = useMatch(matchId)

  const isSpeaker = identity?.mode === 'speaker'
  const canAnimate = isSpeaker || isStaff


  const tabs = useMemo(() => {
    const list: { key: Tab; label: string }[] = []
    if (!isSpeaker) list.push({ key: 'ticket', label: 'Mon vote' })
    if (canAnimate) list.push({ key: 'console', label: 'Console' }, { key: 'participation', label: 'Participation' })
    list.push({ key: 'live', label: 'En direct' }, { key: 'rankings', label: 'Classement' }, { key: 'coum', label: 'Coum' })
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

  const myTicket = identity ? tickets.data.find((t) => t.id === `${matchId}_${identity.playerId}`) : undefined
  const votePending = Boolean(identity) && myTicket?.status !== 'submitted'

  if (match === undefined || players.loading) return <Spinner />
  if (match === null)
    return (
      <div>
        <Link to="/votes" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-4" /> Retour</Link>
        <p className="mt-6 text-muted">Ce match n’existe plus.</p>
      </div>
    )

  // Match à venir : seulement sa fiche (date, heure, lieu). Les onglets de vote apparaissent le jour du match.
  const upcoming = match.status === 'scheduled'

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
            <span>{formatDate(match.date, { weekday: 'long', day: 'numeric', month: 'long' })}{match.time ? ` · ${formatTime(match.time)}` : ''}</span>
            <MatchStatusBadge status={match.status} cancelled={match.cancelled} />
            {match.speakerName && !upcoming && match.status !== 'voting' && <span>Orateur : {match.speakerName}</span>}
          </div>
          {match.venue && !upcoming && <VenueLink venue={match.venue} className="mt-1 text-[13px] text-muted" />}
        </div>
        {!upcoming && (
          <div className="overflow-x-auto">
            <Tabs value={tab} onChange={setTab} items={tabs} />
          </div>
        )}
      </div>

      {upcoming && <UpcomingMatchPanel match={match} />}

      {/* La console a son propre bloc minuteur : inutile d'y répéter le bandeau. */}
      {!upcoming && tab !== 'console' && <VoteCountdown match={match} pending={votePending} />}

      {!upcoming && (
        <>
          {tab === 'ticket' && (identity ? <TicketForm match={match} players={players.data} tickets={tickets.data} loaded={!tickets.loading} myPlayerId={identity.playerId} /> : <ChooseIdentity players={players.data} />)}
          {tab === 'console' && <SpeakerConsole match={match} players={players.byId} tickets={tickets.data} likes={likes.data} />}
          {tab === 'participation' && <Participation players={players.data} tickets={tickets.data} />}
          {tab === 'live' && <LiveReading match={match} players={players.byId} tickets={tickets.data} likes={likes.data} myPlayerId={identity?.playerId ?? null} />}
          {tab === 'rankings' && <Rankings players={players.byId} tickets={tickets.data} likes={likes.data} />}
          {tab === 'coum' && <CoumPanel match={match} players={players.data} coums={coums.data} loading={coums.loading} />}
        </>
      )}
    </div>
  )
}
