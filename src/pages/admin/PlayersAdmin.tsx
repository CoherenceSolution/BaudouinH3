import { useMemo, useState, type FormEvent } from 'react'
import { collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { Plus, Pencil, Trash2, UserX, UserCheck, Download } from 'lucide-react'
import { db } from '@/lib/firebase'
import { usePlayers } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { createPlayer } from '@/lib/players'
import { INITIAL_PLAYERS } from '@/lib/initialPlayers'
import { logActivity } from '@/lib/activity'
import type { Player } from '@/lib/types'
import { cx, fullName, playerFullLabel, playerMatches, playerName, playerRealName } from '@/lib/format'
import { Avatar, Badge, Button, Card, Input, Modal, Spinner } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { ErrorNotice } from '@/components/ErrorNotice'

export function PlayersAdmin() {
  const players = usePlayers(true)
  const actor = useActor()
  const toast = useToast()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nick, setNick] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Player | null>(null)
  const [q, setQ] = useState('')

  const list = useMemo(() => players.data.filter((p) => playerMatches(p, q)), [players.data, q])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) return
    setAdding(true)
    try {
      await createPlayer(actor, firstName, lastName, nick)
      toast(`${nick.trim() || `${firstName} ${lastName}`} ajouté`)
      setFirstName(''); setLastName(''); setNick('')
    } catch (err) {
      console.error(err)
      toast('Ajout impossible', 'error')
    } finally {
      setAdding(false)
    }
  }

  async function toggleActive(p: Player) {
    try {
      await updateDoc(doc(db, 'players', p.id), { active: !(p.active !== false) })
      await logActivity(actor, 'update', 'player', p.id, `${playerFullLabel(p)} ${p.active !== false ? 'désactivé' : 'réactivé'}`)
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  async function remove(p: Player) {
    if (!confirm(`Supprimer définitivement ${playerFullLabel(p)} ? Préférez la désactivation pour garder l’historique.`)) return
    try {
      await deleteDoc(doc(db, 'players', p.id))
      await logActivity(actor, 'delete', 'player', p.id, `Joueur supprimé : ${playerFullLabel(p)}`)
      toast('Joueur supprimé')
    } catch (err) {
      console.error(err)
      toast('Suppression impossible', 'error')
    }
  }

  const missing = INITIAL_PLAYERS.filter((ip) => !players.data.some((p) => p.firstName.toLowerCase() === ip.firstName.toLowerCase() && p.lastName.toLowerCase() === ip.lastName.toLowerCase()))

  async function importInitial() {
    if (!confirm(`Ajouter les ${missing.length} joueurs manquants de la liste initiale ?`)) return
    try {
      const batch = writeBatch(db)
      missing.forEach((p) => batch.set(doc(collection(db, 'players')), { nickname: null, ...p, active: true, createdAt: serverTimestamp() }))
      await batch.commit()
      await logActivity(actor, 'create', 'player', 'import', `Import de la liste initiale : ${missing.length} joueurs`)
      toast(`${missing.length} joueurs ajoutés`)
    } catch (err) {
      console.error(err)
      toast('Import impossible', 'error')
    }
  }

  if (players.loading) return <Spinner />

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <Input label="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="min-w-[140px] flex-1" />
          <Input label="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} className="min-w-[140px] flex-1" />
          <Input label="Surnom (facultatif)" value={nick} onChange={(e) => setNick(e.target.value)} className="min-w-[140px] flex-1" />
          <Button type="submit" icon={<Plus className="size-4" />} loading={adding} disabled={!firstName.trim() || !lastName.trim()}>Ajouter</Button>
        </form>
      </Card>
      <ErrorNotice error={players.error} />
      {missing.length > 0 && !players.error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-muted">
          <span>{missing.length} joueur{missing.length > 1 ? 's' : ''} de la liste initiale de l’équipe ne figure{missing.length > 1 ? 'nt' : ''} pas encore ici.</span>
          <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={importInitial}>Importer la liste initiale</Button>
        </div>
      )}
      <Input placeholder="Rechercher un nom ou un surnom…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="divide-y divide-line">
        {list.map((p) => {
          const active = p.active !== false
          return (
            <div key={p.id} className={cx('flex items-center gap-3 px-4 py-2.5', !active && 'opacity-60')}>
              <Avatar player={p} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{playerName(p)}</span>
                {playerRealName(p) && <span className="block truncate text-[12px] text-muted">{playerRealName(p)}</span>}
              </span>
              {!active && <Badge>Inactif</Badge>}
              <button onClick={() => setEditing(p)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink" title="Renommer"><Pencil className="size-4" /></button>
              <button onClick={() => toggleActive(p)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink" title={active ? 'Désactiver' : 'Réactiver'}>{active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}</button>
              <button onClick={() => remove(p)} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-rose" title="Supprimer"><Trash2 className="size-4" /></button>
            </div>
          )
        })}
        {list.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted">Aucun joueur.</p>}
      </Card>
      <p className="text-[12px] text-muted">{players.data.length} joueurs dont {players.data.filter((p) => p.active !== false).length} actifs. Un joueur inactif n’apparaît plus dans les listes de vote mais conserve son historique. Le surnom, s’il est renseigné, remplace le nom partout dans l’application et permet aussi de se connecter.</p>
      {editing && <RenameModal player={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function RenameModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const actor = useActor()
  const toast = useToast()
  const [firstName, setFirstName] = useState(player.firstName)
  const [lastName, setLastName] = useState(player.lastName)
  const [nick, setNick] = useState(player.nickname ?? '')
  const [loading, setLoading] = useState(false)
  async function save() {
    setLoading(true)
    try {
      const next = { firstName: firstName.trim(), lastName: lastName.trim(), nickname: nick.trim() || null }
      await updateDoc(doc(db, 'players', player.id), next)
      await logActivity(actor, 'update', 'player', player.id, `Joueur renommé : ${playerFullLabel(player)} → ${playerFullLabel({ ...player, ...next })}`)
      toast('Joueur renommé')
      onClose()
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Renommer ${fullName(player)}`} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={loading} onClick={save} disabled={!firstName.trim() || !lastName.trim()}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Input label="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <Input label="Surnom" value={nick} onChange={(e) => setNick(e.target.value)} className="col-span-2" hint="Laissez vide pour afficher le prénom et le nom" />
      </div>
    </Modal>
  )
}
