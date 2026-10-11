import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Coins, Euro, Goal as GoalIcon, Handshake, Pencil, Plus, Trophy } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useActor } from '@/hooks/useActor'
import { useCoums, useFines, useFineTypes, useGoals, usePlayers, useTickets } from '@/hooks/useData'
import { useCategories } from '@/hooks/useSettings'
import { saveScore } from '@/lib/matchActions'
import { coumRows, coumTotals } from '@/lib/coums'
import { formatEuro } from '@/lib/fines'
import { nominationRanking, readTickets, submittedTickets } from '@/lib/rankings'
import { cx, matchResult, playerName } from '@/lib/format'
import type { Match } from '@/lib/types'
import { Avatar, Button, Card } from './ui'
import { useToast } from './ui/Toast'
import { AddGoalModal } from '@/pages/stats/MatchStatsPage'
import { AddFineModal } from '@/pages/fines/AddFineModal'

export type SummaryTab = 'live' | 'rankings' | 'coum'

interface Props {
  match: Match
  /** Sur la page du match : ouvre l'onglet voulu. Ailleurs : lien vers la page du match. */
  onOpenTab?: (tab: SummaryTab) => void
}

/**
 * Le match en un coup d'œil, de son point de vue : score (encodé ici par le staff), buts et passes,
 * résultats des votes, amendes et coum du match, avec un lien vers chaque détail.
 */
export function MatchSummary({ match, onOpenTab }: Props) {
  const { isStaff } = useAuth()
  const players = usePlayers(true)
  const goals = useGoals(match.id)
  const tickets = useTickets(match.id)
  const coums = useCoums(match.id)
  const fines = useFines()
  const types = useFineTypes()
  const categories = useCategories()
  const [addGoal, setAddGoal] = useState(false)
  const [addFine, setAddFine] = useState(false)

  const read = useMemo(() => readTickets(tickets.data), [tickets.data])
  const sent = useMemo(() => submittedTickets(tickets.data).length, [tickets.data])
  const matchFines = useMemo(() => fines.data.filter((f) => f.matchId === match.id), [fines.data, match.id])
  const finesTotal = matchFines.reduce((s, f) => s + f.amount, 0)
  const coum = useMemo(() => coumTotals(coumRows(players.data.filter((p) => p.active !== false), coums.data, (a, b) => playerName(a).localeCompare(playerName(b), 'fr'))), [players.data, coums.data])

  const to = (tab: SummaryTab) => (onOpenTab ? undefined : `/votes/${match.id}?tab=${tab}`)
  const open = (tab: SummaryTab) => onOpenTab?.(tab)

  return (
    <div className="space-y-3">
      <ScoreCard match={match} goalsCount={goals.data.length} canEdit={isStaff} />

      <div className="grid gap-3 md:grid-cols-2">
        {/* Buts et passes */}
        <Block
          icon={<GoalIcon className="size-4" />}
          title="Buts et passes"
          action={isStaff && <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAddGoal(true)}>But</Button>}
          footer={<FooterLink to={`/stats/${match.id}`}>Feuille de match</FooterLink>}
        >
          {goals.data.length === 0 ? (
            <p className="text-[13px] text-muted">Aucun but encodé.</p>
          ) : (
            <ol className="space-y-1.5">
              {goals.data.map((g) => {
                const s = players.byId.get(g.scorerPlayerId)
                const a = g.assistPlayerId ? players.byId.get(g.assistPlayerId) : null
                return (
                  <li key={g.id} className="flex items-center gap-2 text-[14px]">
                    <Avatar player={s} size="sm" />
                    <span className="font-semibold">{playerName(s)}</span>
                    {g.minute != null && <span className="text-[12px] text-muted">{g.minute}’</span>}
                    {a && <span className="inline-flex min-w-0 items-center gap-1 truncate text-[12px] text-muted"><Handshake className="size-3.5 shrink-0" /> {playerName(a)}</span>}
                  </li>
                )
              })}
            </ol>
          )}
        </Block>

        {/* Résultats des votes : seuls les votes lus comptent, comme dans les classements. */}
        <Block
          icon={<Trophy className="size-4" />}
          title="Votes"
          footer={<FooterLink to={to('rankings')} onClick={() => open('rankings')}>Voir les votes</FooterLink>}
        >
          {read.length === 0 ? (
            <p className="text-[13px] text-muted">
              {match.status === 'voting' ? `Votes ouverts : ${sent} vote${sent > 1 ? 's' : ''} envoyé${sent > 1 ? 's' : ''}.` : sent ? `${sent} vote${sent > 1 ? 's' : ''}, pas encore lu${sent > 1 ? 's' : ''}.` : 'Aucun vote.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {categories.map((c) => {
                const top = nominationRanking(read, c.key)
                const first = top[0]
                const tied = first ? top.filter((r) => r.count === first.count) : []
                return (
                  <li key={c.key} className="flex items-center gap-2 text-[14px]">
                    <span className="w-5 text-center">{c.emoji}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-[12px] text-muted">{c.label} · </span>
                      <b>{first ? tied.map((r) => playerName(players.byId.get(r.playerId))).join(', ') : '—'}</b>
                    </span>
                    {first && <span className="shrink-0 text-[12px] text-muted">{first.count} voix</span>}
                  </li>
                )
              })}
              <li className="text-[12px] text-muted">{read.length} vote{read.length > 1 ? 's' : ''} lu{read.length > 1 ? 's' : ''} sur {sent}</li>
            </ul>
          )}
        </Block>

        {/* Amendes du match */}
        <Block
          icon={<Euro className="size-4" />}
          title="Amendes"
          action={isStaff && <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAddFine(true)}>Amende</Button>}
          footer={<FooterLink to="/amendes">Toutes les amendes</FooterLink>}
        >
          {matchFines.length === 0 ? (
            <p className="text-[13px] text-muted">Aucune amende pour ce match.</p>
          ) : (
            <ul className="space-y-1">
              {matchFines.slice(0, 5).map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-[14px]">
                  <span className="min-w-0 flex-1 truncate"><b>{playerName(players.byId.get(f.playerId))}</b> <span className="text-[12px] text-muted">{f.label}</span></span>
                  <span className={cx('shrink-0 tabular-nums', f.paid ? 'text-muted line-through' : 'font-semibold')}>{formatEuro(f.amount)}</span>
                </li>
              ))}
              <li className="text-[12px] text-muted">
                {matchFines.length > 5 ? `+ ${matchFines.length - 5} autre${matchFines.length > 6 ? 's' : ''} · ` : ''}Total {formatEuro(finesTotal)}
              </li>
            </ul>
          )}
        </Block>

        {/* La coum */}
        <Block icon={<Coins className="size-4" />} title="Coum" footer={<FooterLink to={to('coum')} onClick={() => open('coum')}>Voir la coum</FooterLink>}>
          {coums.data.length === 0 ? (
            <p className="text-[13px] text-muted">Pas encore commencée.</p>
          ) : (
            <p className="text-[14px]">
              <b>{coum.paidPlayers}</b> sur {coum.present} présent{coum.present > 1 ? 's' : ''} {coum.paidPlayers > 1 ? 'ont' : 'a'} coumé
              {coum.pendingPlayers === 0 ? ' 🎉' : <span className="text-muted"> · {coum.pendingPlayers} pas encore</span>}
            </p>
          )}
        </Block>
      </div>

      {addGoal && <AddGoalModal match={match} nextOrder={goals.data.length} onClose={() => setAddGoal(false)} />}
      {isStaff && <AddFineModal open={addFine} onClose={() => setAddFine(false)} players={players.data.filter((p) => p.active !== false)} types={types.data.filter((t) => t.active)} matches={[match]} />}
    </div>
  )
}

/** Score, saisi en deux chiffres « nous / eux ». Le staff l'encode ou le corrige ici. */
function ScoreCard({ match, goalsCount, canEdit }: { match: Match; goalsCount: number; canEdit: boolean }) {
  const actor = useActor()
  const toast = useToast()
  const ours = match.home ? match.homeScore : match.awayScore
  const theirs = match.home ? match.awayScore : match.homeScore
  const known = ours != null && theirs != null
  const [editing, setEditing] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [saving, setSaving] = useState(false)
  const result = matchResult(match)

  function start() {
    setA(ours != null ? String(ours) : String(goalsCount || ''))
    setB(theirs != null ? String(theirs) : '')
    setEditing(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (a === '' || b === '') return
    setSaving(true)
    try {
      await saveScore(match, Number(a), Number(b), actor)
      toast('Score enregistré')
      setEditing(false)
    } catch (err) {
      console.error(err)
      toast('Score impossible à enregistrer', 'error')
    } finally {
      setSaving(false)
    }
  }

  const showForm = canEdit && (editing || !known)
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ScoreSide label="Baudouin H3" value={ours} strong />
          <span className="text-2xl font-bold text-muted">–</span>
          <ScoreSide label={match.opponent} value={theirs} />
        </div>
        {known && (
          <span className={cx('rounded-lg px-2.5 py-1 text-[13px] font-semibold', result === 'win' ? 'bg-accent-soft text-accent-strong' : result === 'loss' ? 'bg-rose-soft text-rose' : 'bg-slate-100 text-ink-2')}>
            {result === 'win' ? 'Victoire' : result === 'loss' ? 'Défaite' : 'Match nul'}
          </span>
        )}
        {canEdit && known && !editing && (
          <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={start}>Corriger le score</Button>
        )}
        {!canEdit && !known && <span className="text-[13px] text-muted">Score à venir</span>}
      </div>
      {showForm && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <span className="w-full text-[13px] font-medium">{known ? 'Corriger le score' : 'Entrer le score du match'}</span>
          <ScoreInput label="Baudouin H3" value={a} onChange={setA} />
          <span className="pb-2 text-lg font-bold text-muted">–</span>
          <ScoreInput label={match.opponent} value={b} onChange={setB} />
          <Button type="submit" loading={saving} disabled={a === '' || b === ''}>Enregistrer</Button>
          {known && <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>}
          {goalsCount > 0 && !known && <span className="w-full text-[12px] text-muted">{goalsCount} but{goalsCount > 1 ? 's' : ''} déjà encodé{goalsCount > 1 ? 's' : ''} pour Baudouin.</span>}
        </form>
      )}
    </Card>
  )
}

function ScoreSide({ label, value, strong }: { label: string; value: number | null | undefined; strong?: boolean }) {
  return (
    <div className="text-center">
      <div className={cx('text-3xl font-bold tabular-nums', !strong && 'text-ink-2')}>{value ?? '–'}</div>
      <div className="max-w-[9rem] truncate text-[12px] text-muted">{label}</div>
    </div>
  )
}

function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col text-[12px] text-muted">
      <span className="max-w-[8rem] truncate">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 2))}
        aria-label={`Score ${label}`}
        className="w-16 rounded-xl border border-line bg-surface px-3 py-2 text-center text-lg font-bold text-ink"
      />
    </label>
  )
}

function Block({ icon, title, action, footer, children }: { icon: ReactNode; title: string; action?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">{icon} {title}</h3>
        {action}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-3 border-t border-line pt-2">{footer}</div>}
    </Card>
  )
}

function FooterLink({ to, onClick, children }: { to?: string; onClick?: () => void; children: ReactNode }) {
  const cls = 'inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink hover:underline'
  return to ? (
    <Link to={to} className={cls}>{children} <ArrowRight className="size-3.5" /></Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{children} <ArrowRight className="size-3.5" /></button>
  )
}
