import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Mic, MicOff, PenLine, RotateCcw } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useSpeaker } from '@/hooks/useSpeaker'
import { useSpeakerLead } from '@/hooks/useSpeakerLead'
import { useCoums, useLikes, useMatch, usePlayers, useTickets } from '@/hooks/useData'
import { formatDate, matchTitle } from '@/lib/format'
import type { Match, Player } from '@/lib/types'
import { reopenVotes } from '@/lib/matchActions'
import { useActor } from '@/hooks/useActor'
import { useToast } from '@/components/ui/Toast'
import { formatTime } from '@/lib/matches'
import { Button, Spinner, Tabs } from '@/components/ui'
import { MatchStatusBadge, ResultPill, VenueLink } from '@/components/MatchCard'
import { UpcomingMatchPanel } from '@/components/UpcomingMatch'
import { MatchSummary } from '@/components/MatchSummary'
import { VoteCountdown } from '@/components/VoteTimer'
import { TicketForm } from './TicketForm'
import { SpeakerConsole } from './SpeakerConsole'
import { LiveReading } from './LiveReading'
import { Rankings } from './Rankings'
import { Participation } from './Participation'
import { ChooseIdentity } from './ChooseIdentity'
import { CoumPanel } from './CoumPanel'

type Tab = 'resume' | 'ticket' | 'console' | 'participation' | 'live' | 'rankings' | 'coum'
const TABS: Tab[] = ['resume', 'ticket', 'console', 'participation', 'live', 'rankings', 'coum']

export function MatchVotePage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { identity, isStaff, isAdmin, setMode } = useAuth()
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
    const list: { key: Tab; label: string }[] = [{ key: 'resume', label: 'Résumé' }]
    if (canAnimate) list.push({ key: 'console', label: 'Console orateur' }, { key: 'participation', label: 'Participation' })
    else list.push({ key: 'ticket', label: 'Mon vote' })
    list.push({ key: 'live', label: 'En direct' }, { key: 'rankings', label: 'Classement' }, { key: 'coum', label: 'Coum' })
    return list
  }, [canAnimate])

  // Onglet d'arrivée : celui demandé dans le lien (?tab=coum), sinon ce qui compte à ce moment de la soirée :
  // la console pour l'orateur et le staff, le vote pour les autres, le résumé une fois la lecture terminée.
  const [params] = useSearchParams()
  const asked = params.get('tab') as Tab | null
  const defaultTab = (status: Match['status'] | undefined): Tab =>
    status === 'closed' ? 'resume' : canAnimate ? 'console' : status === 'voting' ? 'ticket' : status === 'reading' ? 'live' : 'resume'
  const [tab, setTab] = useState<Tab>(asked && TABS.includes(asked) ? asked : 'resume')
  const chosen = useRef(Boolean(asked))
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0].key)
  }, [tabs, tab])
  // Une fois le match chargé, on se place sur l'onglet utile (sauf si le lien en demandait un).
  useEffect(() => {
    if (match && !chosen.current) {
      chosen.current = true
      setTab(defaultTab(match.status))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id])
  // Prendre le rôle d'orateur ouvre directement la console.
  const wasAnimating = useRef(canAnimate)
  useEffect(() => {
    if (canAnimate && !wasAnimating.current) setTab('console')
    wasAnimating.current = canAnimate
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
            {match.speakerName && !upcoming && <span>Orateur : {match.speakerName}</span>}
          </div>
          {match.venue && !upcoming && <VenueLink venue={match.venue} className="mt-1 text-[13px] text-muted" />}
          {/* Score pas encore encodé : un geste depuis l'en-tête. */}
          {isStaff && !upcoming && (match.homeScore == null || match.awayScore == null) && tab !== 'resume' && (
            <Button size="sm" variant="secondary" className="mr-2 mt-2" icon={<PenLine className="size-4" />} onClick={() => setTab('resume')}>Entrer le score</Button>
          )}
          {/* L'admin rouvre les votes d'un match terminé ou en lecture, directement depuis sa page. */}
          {isAdmin && (match.status === 'closed' || match.status === 'reading') && <ReopenButton match={match} />}
          {/* Le rôle d'orateur se prend ici, sans se déconnecter (le staff a la console d'office). */}
          {!isStaff && identity && canSpeak && !upcoming && (
            isSpeaker ? (
              <StepDownButton match={match} players={players.byId} onDone={() => setMode('public')} />
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

          {tab === 'resume' && <MatchSummary match={match} onOpenTab={setTab} />}
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

/** Quitte le rôle d'orateur sur cet appareil et rend la main sur la lecture s'il l'avait. */
function StepDownButton({ match, players, onDone }: { match: Match; players: Map<string, Player>; onDone: () => void }) {
  const { release } = useSpeakerLead(match, players)
  const [busy, setBusy] = useState(false)
  async function stepDown() {
    setBusy(true)
    try {
      await release()
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
      onDone()
    }
  }
  return (
    <Button size="sm" variant="ghost" className="mt-2" icon={<MicOff className="size-4" />} loading={busy} onClick={stepDown}>Je ne suis plus l’orateur</Button>
  )
}

/** Admin : rouvre les votes du match (les votes déjà lus le restent). */
function ReopenButton({ match }: { match: Match }) {
  const actor = useActor()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function reopen() {
    if (!confirm('Rouvrir les votes de ce match ? Les votes déjà lus le restent.')) return
    setBusy(true)
    try {
      await reopenVotes(match, actor)
      toast('Votes rouverts')
    } catch (e) {
      console.error(e)
      toast('Impossible de rouvrir les votes', 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="sm" variant="secondary" className="mr-2 mt-2" icon={<RotateCcw className="size-4" />} loading={busy} onClick={reopen}>Rouvrir les votes</Button>
  )
}
