import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Mic, MicOff } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useSpeaker } from '@/hooks/useSpeaker'
import { useCoums, useLikes, useMatch, usePlayers, useTickets } from '@/hooks/useData'
import { formatDate, matchTitle } from '@/lib/format'
import { formatTime } from '@/lib/matches'
import { Button, Spinner, Tabs } from '@/components/ui'
import { MatchStatusBadge, ResultPill, VenueLink } from '@/components/MatchCard'
import { UpcomingMatchPanel } from '@/components/UpcomingMatch'
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
  const { identity, isStaff, setMode } = useAuth()
  const players = usePlayers()
  const tickets = useTickets(matchId)
  const likes = useLikes(matchId)
  const coums = useCoums(matchId)
  const match = useMatch(matchId)

  // Orateur : seulement un joueur de la liste désignée par l'admin.
  const { isSpeaker, canSpeak } = useSpeaker()
  const canAnimate = isSpeaker || isStaff

  // L'orateur et le staff ont tout au même endroit : la console contient aussi leur propre vote.
  const tabs = useMemo(() => {
    const list: { key: Tab; label: string }[] = []
    if (canAnimate) list.push({ key: 'console', label: 'Console orateur' }, { key: 'participation', label: 'Participation' })
    else list.push({ key: 'ticket', label: 'Mon vote' })
    list.push({ key: 'live', label: 'En direct' }, { key: 'rankings', label: 'Classement' }, { key: 'coum', label: 'Coum' })
    return list
  }, [canAnimate])

  const [tab, setTab] = useState<Tab>(tabs[0].key)
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0].key)
  }, [tabs, tab])
  // Prendre le rôle d'orateur ouvre directement la console.
  useEffect(() => {
    if (canAnimate) setTab('console')
  }, [canAnimate])

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
          {/* Le rôle d'orateur se prend ici, sans se déconnecter (le staff a la console d'office). */}
          {!isStaff && identity && canSpeak && !upcoming && match.status !== 'closed' && (
            isSpeaker ? (
              <Button size="sm" variant="ghost" className="mt-2" icon={<MicOff className="size-4" />} onClick={() => setMode('public')}>Je ne suis plus l’orateur</Button>
            ) : (
              <Button size="sm" variant="secondary" className="mt-2" icon={<Mic className="size-4" />} onClick={() => setMode('speaker')}>Je suis l’orateur</Button>
            )
          )}
        </div>
        {!upcoming && (
          <div className="overflow-x-auto">
            <Tabs value={tab} onChange={setTab} items={tabs} />
          </div>
        )}
      </div>

      {upcoming && <UpcomingMatchPanel match={match} />}

      {!upcoming && (
        <>
          {/* Le compte à rebours reste visible partout, console comprise. */}
          <VoteCountdown match={match} pending={votePending} />

          {tab === 'ticket' && (identity ? <TicketForm match={match} players={players.data} tickets={tickets.data} loaded={!tickets.loading} myPlayerId={identity.playerId} /> : <ChooseIdentity players={players.data} />)}
          {tab === 'console' && <SpeakerConsole match={match} players={players.byId} playerList={players.data} tickets={tickets.data} ticketsLoaded={!tickets.loading} likes={likes.data} />}
          {tab === 'participation' && <Participation players={players.data} tickets={tickets.data} />}
          {tab === 'live' && <LiveReading match={match} players={players.byId} playerList={players.data} tickets={tickets.data} likes={likes.data} myPlayerId={identity?.playerId ?? null} canEdit={canAnimate} />}
          {tab === 'rankings' && <Rankings players={players.byId} tickets={tickets.data} likes={likes.data} />}
          {tab === 'coum' && <CoumPanel match={match} players={players.data} coums={coums.data} loading={coums.loading} />}
        </>
      )}
    </div>
  )
}
