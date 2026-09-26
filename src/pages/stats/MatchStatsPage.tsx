import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { ArrowLeft, Plus, Trash2, Handshake, Goal as GoalIcon } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { useGoals, useMatch, usePlayers } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { Goal, Match } from '@/lib/types'
import { formatDate, matchTitle, playerFullLabel, playerName } from '@/lib/format'
import { Avatar, Button, Card, EmptyState, Input, Modal, Spinner } from '@/components/ui'
import { ResultPill } from '@/components/MatchCard'
import { PlayerPicker } from '@/components/PlayerPicker'
import { useToast } from '@/components/ui/Toast'

/** Feuille de match : buts et passes décisives, but par but. */
export function MatchStatsPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { isStaff } = useAuth()
  const players = usePlayers()
  const goals = useGoals(matchId)
  const actor = useActor()
  const toast = useToast()
  const match = useMatch(matchId)
  const [add, setAdd] = useState(false)


  const ours = useMemo(() => (match ? (match.home ? match.homeScore : match.awayScore) : null), [match])

  async function remove(g: Goal) {
    if (!match || !confirm('Supprimer ce but ?')) return
    try {
      await deleteDoc(doc(db, 'goals', g.id))
      await logActivity(actor, 'delete', 'goal', g.id, `But supprimé (${playerFullLabel(players.byId.get(g.scorerPlayerId))}) — ${match.opponent}`)
      toast('But supprimé')
    } catch (e) {
      console.error(e)
      toast('Suppression impossible', 'error')
    }
  }

  if (match === undefined || players.loading) return <Spinner />
  if (!match) return <p className="text-muted">Ce match n’existe plus.</p>

  return (
    <div>
      <Link to="/stats" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-4" /> Statistiques</Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{matchTitle(match)}</h1>
            <ResultPill match={match} />
          </div>
          <p className="mt-1 text-[13px] text-muted">{formatDate(match.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {goals.data.length} but{goals.data.length > 1 ? 's' : ''} encodé{goals.data.length > 1 ? 's' : ''}{ours != null && ours !== goals.data.length ? ` (score annoncé : ${ours})` : ''}</p>
        </div>
        {isStaff && <Button icon={<Plus className="size-4" />} onClick={() => setAdd(true)}>Ajouter un but</Button>}
      </div>

      {goals.data.length === 0 ? (
        <EmptyState icon={<GoalIcon className="size-6" />} title="Aucun but encodé" description={isStaff ? 'Ajoutez chaque but avec son buteur et, le cas échéant, son passeur.' : 'Le secrétaire encodera les buts après le match.'} />
      ) : (
        <Card className="divide-y divide-line">
          {goals.data.map((g, i) => {
            const s = players.byId.get(g.scorerPlayerId)
            const a = g.assistPlayerId ? players.byId.get(g.assistPlayerId) : null
            return (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-strong">{i + 1}</span>
                <Avatar player={s} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{playerName(s)}{g.minute != null && <span className="ml-1 text-[12px] font-medium text-muted">{g.minute}’</span>}</div>
                  {a ? <div className="inline-flex items-center gap-1 text-[13px] text-muted"><Handshake className="size-3.5" /> sur passe de {playerName(a)}</div> : <div className="text-[13px] text-muted">Sans passeur</div>}
                </div>
                {isStaff && <button onClick={() => remove(g)} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-rose"><Trash2 className="size-4" /></button>}
              </div>
            )
          })}
        </Card>
      )}

      {add && <AddGoalModal match={match} nextOrder={goals.data.length} onClose={() => setAdd(false)} />}
    </div>
  )
}

function AddGoalModal({ match, nextOrder, onClose }: { match: Match; nextOrder: number; onClose: () => void }) {
  const players = usePlayers()
  const actor = useActor()
  const toast = useToast()
  const [scorer, setScorer] = useState<string | null>(null)
  const [assist, setAssist] = useState<string | null>(null)
  const [minute, setMinute] = useState('')
  const [loading, setLoading] = useState(false)
  const [order, setOrder] = useState(nextOrder)

  async function submit(again: boolean) {
    if (!scorer) return
    setLoading(true)
    try {
      const ref = await addDoc(collection(db, 'goals'), {
        matchId: match.id, scorerPlayerId: scorer, assistPlayerId: assist, minute: minute === '' ? null : Number(minute), order, createdAt: serverTimestamp(),
      })
      const s = players.byId.get(scorer)
      const a = assist ? players.byId.get(assist) : null
      await logActivity(actor, 'create', 'goal', ref.id, `But de ${playerFullLabel(s)}${a ? ` sur passe de ${playerFullLabel(a)}` : ''} — ${match.opponent}`)
      toast(`But de ${playerName(s)} enregistré`)
      if (again) {
        setScorer(null); setAssist(null); setMinute(''); setOrder((o) => o + 1)
      } else onClose()
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`But n° ${order + 1}`} wide footer={<><Button variant="ghost" onClick={onClose}>Fermer</Button><Button variant="secondary" loading={loading} disabled={!scorer} onClick={() => submit(true)}>Enregistrer et suivant</Button><Button loading={loading} disabled={!scorer} onClick={() => submit(false)}>Enregistrer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <PlayerPicker players={players.data} value={scorer} onChange={setScorer} label="⚽ Buteur" exclude={assist ? [assist] : []} allowCreate compact />
        <PlayerPicker players={players.data} value={assist} onChange={setAssist} label="🎯 Passeur décisif (optionnel)" exclude={scorer ? [scorer] : []} allowNone allowCreate compact />
      </div>
      <Input label="Minute (optionnel)" type="number" min={0} max={130} inputMode="numeric" value={minute} onChange={(e) => setMinute(e.target.value)} className="mt-4 max-w-[160px]" />
    </Modal>
  )
}
