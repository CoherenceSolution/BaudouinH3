import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { Plus, Handshake, Pencil, Trash2, ClipboardList, Settings2 } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { useAllGoals, useMatches, usePlayers, useStatCategories, useStatEntries } from '@/hooks/useData'
import { isPlayed } from '@/lib/matches'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { Match, Player, StatCategory, StatEntry } from '@/lib/types'
import { goalTotals } from '@/lib/rankings'
import { currentSeason, formatDate, matchTitle, playerFullLabel, playerName, seasonOf, todayIso } from '@/lib/format'
import { Avatar, Button, Card, EmptyState, Input, Modal, PageHeader, SectionTitle, Select, Spinner, Stat, Chip } from '@/components/ui'
import { StatCategoryModal } from '@/components/StatCategoryModal'
import { RankingList } from '@/components/RankingList'
import { PlayerPicker } from '@/components/PlayerPicker'
import { useToast } from '@/components/ui/Toast'

type Tab = 'scorers' | 'assists' | 'duos' | 'matches' | string

export function StatsPage() {
  const { isStaff } = useAuth()
  const players = usePlayers(true)
  const allMatches = useMatches()
  // Les matchs à venir n'entrent ni dans les statistiques ni dans les listes de choix.
  const played = useMemo(() => allMatches.data.filter(isPlayed), [allMatches.data])
  const matches = { ...allMatches, data: played }
  const goals = useAllGoals()
  const cats = useStatCategories()
  const entries = useStatEntries()
  const [tab, setTab] = useState<Tab>('scorers')
  const [season, setSeason] = useState(currentSeason())
  const [addEntry, setAddEntry] = useState<StatCategory | null>(null)
  const [editCat, setEditCat] = useState<StatCategory | null | 'new'>(null)

  const seasons = useMemo(() => {
    const s = new Set(matches.data.map((m) => seasonOf(m.date)))
    s.add(currentSeason())
    return [...s].sort().reverse()
  }, [matches.data])

  const seasonMatches = useMemo(() => matches.data.filter((m) => seasonOf(m.date) === season), [matches.data, season])
  const ids = useMemo(() => new Set(seasonMatches.map((m) => m.id)), [seasonMatches])
  const seasonGoals = useMemo(() => goals.data.filter((g) => ids.has(g.matchId)), [goals.data, ids])
  const totals = useMemo(() => goalTotals(seasonGoals), [seasonGoals])
  const seasonEntries = useMemo(() => entries.data.filter((e) => seasonOf(e.date) === season), [entries.data, season])
  const activeCats = cats.data.filter((c) => c.active || isStaff)

  if (players.loading || matches.loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Buts & passes"
        subtitle="Buteurs, passeurs décisifs, duos et catégories maison."
        actions={isStaff && <Button variant="secondary" icon={<Settings2 className="size-4" />} onClick={() => setEditCat('new')}>Nouvelle liste</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={tab === 'scorers'} onClick={() => setTab('scorers')}>⚽ Buteurs</Chip>
        <Chip active={tab === 'assists'} onClick={() => setTab('assists')}>🎯 Passeurs</Chip>
        <Chip active={tab === 'duos'} onClick={() => setTab('duos')}>🤝 Duos</Chip>
        <Chip active={tab === 'matches'} onClick={() => setTab('matches')}>📋 Par match</Chip>
        {activeCats.map((c) => <Chip key={c.id} active={tab === c.id} onClick={() => setTab(c.id)}>{c.emoji} {c.label}</Chip>)}
        <Select value={season} onChange={(e) => setSeason(e.target.value)} className="ml-auto w-48">
          {seasons.map((s) => <option key={s} value={s}>Saison {s}</option>)}
        </Select>
      </div>

      {(tab === 'scorers' || tab === 'assists' || tab === 'duos') && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <Stat label="Buts marqués" value={seasonGoals.length} tone="accent" />
          <Stat label="Passes décisives" value={seasonGoals.filter((g) => g.assistPlayerId).length} />
          <Stat label="Matchs encodés" value={new Set(seasonGoals.map((g) => g.matchId)).size} sub={`sur ${seasonMatches.length}`} />
        </div>
      )}

      {tab === 'scorers' && (
        <Card className="p-5">
          <SectionTitle>⚽ Classement des buteurs</SectionTitle>
          <RankingList rows={totals.scorers} players={players.byId} tone="accent" unit="but" max={30} empty="Aucun but encodé cette saison." />
        </Card>
      )}
      {tab === 'assists' && (
        <Card className="p-5">
          <SectionTitle>🎯 Classement des passeurs</SectionTitle>
          <RankingList rows={totals.assisters} players={players.byId} tone="sky" unit="passe" max={30} empty="Aucune passe décisive encodée cette saison." />
        </Card>
      )}
      {tab === 'duos' && (
        <Card className="p-5">
          <SectionTitle>🤝 Duos passeur → buteur</SectionTitle>
          {totals.duos.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Aucun duo cette saison.</p>
          ) : (
            <ul className="space-y-2">
              {totals.duos.slice(0, 30).map((d) => {
                const a = players.byId.get(d.assistPlayerId)
                const s = players.byId.get(d.scorerPlayerId)
                return (
                  <li key={`${d.assistPlayerId}>${d.scorerPlayerId}`} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                    <Avatar player={a} size="sm" />
                    <span className="text-[14px] font-medium">{playerName(a)}</span>
                    <Handshake className="size-4 text-muted" />
                    <Avatar player={s} size="sm" />
                    <span className="text-[14px] font-medium">{playerName(s)}</span>
                    <span className="ml-auto text-[13px] font-semibold text-ink">{d.count} {d.count > 1 ? 'passes' : 'passe'}</span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-muted">Exemple de lecture : « {totals.duos[0] ? `${playerName(players.byId.get(totals.duos[0].assistPlayerId))} a fait ${totals.duos[0].count} passe${totals.duos[0].count > 1 ? 's' : ''} décisive${totals.duos[0].count > 1 ? 's' : ''} à ${playerName(players.byId.get(totals.duos[0].scorerPlayerId))}` : 'Mathis a fait 17 assists à Max Vigne'} sur la saison ».</p>
        </Card>
      )}
      {tab === 'matches' && <MatchesList matches={seasonMatches} goalsCount={(id) => seasonGoals.filter((g) => g.matchId === id).length} isStaff={isStaff} />}
      {activeCats.some((c) => c.id === tab) && (
        <CategoryView category={activeCats.find((c) => c.id === tab)!} entries={seasonEntries.filter((e) => e.categoryId === tab)} players={players.byId} isStaff={isStaff} onAdd={() => setAddEntry(activeCats.find((c) => c.id === tab)!)} onEdit={() => setEditCat(activeCats.find((c) => c.id === tab)!)} />
      )}

      {addEntry && <AddEntryModal category={addEntry} players={players.data} matches={matches.data} onClose={() => setAddEntry(null)} />}
      <StatCategoryModal
        open={editCat !== null}
        category={editCat === 'new' ? null : editCat}
        nextOrder={cats.data.length}
        entryCount={editCat && editCat !== 'new' ? entries.data.filter((e) => e.categoryId === editCat.id).length : 0}
        onClose={() => setEditCat(null)}
        onDeleted={() => setTab('scorers')}
      />
    </div>
  )
}

function MatchesList({ matches, goalsCount, isStaff }: { matches: Match[]; goalsCount: (id: string) => number; isStaff: boolean }) {
  if (matches.length === 0) return <EmptyState icon={<ClipboardList className="size-6" />} title="Aucun match cette saison" />
  return (
    <div className="space-y-2">
      {matches.map((m) => {
        const n = goalsCount(m.id)
        const ours = m.home ? m.homeScore : m.awayScore
        return (
          <Link key={m.id} to={`/stats/${m.id}`} className="card flex items-center gap-4 px-4 py-3 transition hover:-translate-y-px hover:shadow-md">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{matchTitle(m)}</div>
              <div className="text-[12px] text-muted">{formatDate(m.date)}{m.competition ? ` · ${m.competition}` : ''}</div>
            </div>
            <div className="text-right">
              <div className="text-[14px] font-semibold">{n} but{n > 1 ? 's' : ''} encodé{n > 1 ? 's' : ''}</div>
              {ours != null && ours !== n && <div className="text-[12px] text-amber-600">Score : {ours} but{ours > 1 ? 's' : ''}</div>}
            </div>
            {isStaff && <Pencil className="size-4 text-muted" />}
          </Link>
        )
      })}
    </div>
  )
}

function CategoryView({ category, entries, players, isStaff, onAdd, onEdit }: { category: StatCategory; entries: StatEntry[]; players: Map<string, Player>; isStaff: boolean; onAdd: () => void; onEdit: () => void }) {
  const actor = useActor()
  const toast = useToast()
  const rows = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) m.set(e.playerId, (m.get(e.playerId) ?? 0) + (e.value || 1))
    return [...m.entries()].map(([playerId, count]) => ({ playerId, count })).sort((a, b) => b.count - a.count)
  }, [entries])

  async function remove(e: StatEntry) {
    if (!confirm('Supprimer cette entrée ?')) return
    try {
      await deleteDoc(doc(db, 'statEntries', e.id))
      await logActivity(actor, 'delete', 'statEntry', e.id, `${category.label} : entrée supprimée pour ${playerFullLabel(players.get(e.playerId))}`)
      toast('Entrée supprimée')
    } catch (err) {
      console.error(err)
      toast('Suppression impossible', 'error')
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <SectionTitle right={isStaff && <div className="flex gap-1"><Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={onEdit}>Modifier la liste</Button><Button size="sm" icon={<Plus className="size-4" />} onClick={onAdd}>Ajouter</Button></div>}>
          {category.emoji} {category.label}
        </SectionTitle>
        <RankingList rows={rows} players={players} tone="gold" unit="fois" max={30} empty="Aucune entrée cette saison." />
      </Card>
      <Card className="divide-y divide-line">
        <div className="px-4 py-3 text-[13px] font-semibold text-muted">Détail</div>
        {entries.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted">Rien à afficher.</p>}
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar player={players.get(e.playerId)} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{playerName(players.get(e.playerId))}{e.value > 1 ? ` × ${e.value}` : ''}</div>
              <div className="text-[12px] text-muted">{formatDate(e.date)}{e.note ? ` · ${e.note}` : ''}</div>
            </div>
            {isStaff && <button onClick={() => remove(e)} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-rose"><Trash2 className="size-4" /></button>}
          </div>
        ))}
      </Card>
    </div>
  )
}

function AddEntryModal({ category, players, matches, onClose }: { category: StatCategory; players: Player[]; matches: Match[]; onClose: () => void }) {
  const actor = useActor()
  const toast = useToast()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [date, setDate] = useState(todayIso())
  const [matchId, setMatchId] = useState('')
  const [value, setValue] = useState('1')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!playerId) return
    setLoading(true)
    try {
      const ref = await addDoc(collection(db, 'statEntries'), {
        categoryId: category.id, playerId, matchId: matchId || null, date, value: Number(value || 1), note: note.trim(), createdBy: actor.uid, createdAt: serverTimestamp(),
      })
      await logActivity(actor, 'create', 'statEntry', ref.id, `${category.label} : +${value} pour ${playerFullLabel(players.find((p) => p.id === playerId))}`)
      toast('Entrée ajoutée')
      onClose()
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`${category.emoji} ${category.label} — ajouter`} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={loading} disabled={!playerId} onClick={submit}>Ajouter</Button></>}>
      <div className="space-y-3">
        <PlayerPicker players={players} value={playerId} onChange={setPlayerId} label="Joueur" allowCreate compact />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Quantité" type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Select label="Match (optionnel)" value={matchId} onChange={(e) => { setMatchId(e.target.value); const m = matches.find((x) => x.id === e.target.value); if (m) setDate(m.date) }}>
          <option value="">— Hors match —</option>
          {matches.map((m) => <option key={m.id} value={m.id}>{formatDate(m.date)} · {matchTitle(m)}</option>)}
        </Select>
        <Input label="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  )
}
