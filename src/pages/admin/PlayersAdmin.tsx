import { useMemo, useState, type FormEvent } from 'react'
import { deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { Plus, Pencil, Trash2, UserX, UserCheck } from 'lucide-react'
import { db } from '@/lib/firebase'
import { usePlayers } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { createPlayer } from '@/lib/players'
import { logActivity } from '@/lib/activity'
import type { Player } from '@/lib/types'
import { cx, playerName } from '@/lib/format'
import { Avatar, Badge, Button, Card, Input, Modal, Spinner } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

export function PlayersAdmin() {
  const players = usePlayers(true)
  const actor = useActor()
  const toast = useToast()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Player | null>(null)
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return players.data.filter((p) => !n || playerName(p).toLowerCase().includes(n))
  }, [players.data, q])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) return
    setAdding(true)
    try {
      await createPlayer(actor, firstName, lastName)
      toast(`${firstName} ${lastName} ajouté`)
      setFirstName(''); setLastName('')
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
      await logActivity(actor, 'update', 'player', p.id, `${playerName(p)} ${p.active !== false ? 'désactivé' : 'réactivé'}`)
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  async function remove(p: Player) {
    if (!confirm(`Supprimer définitivement ${playerName(p)} ? Préférez la désactivation pour garder l’historique.`)) return
    try {
      await deleteDoc(doc(db, 'players', p.id))
      await logActivity(actor, 'delete', 'player', p.id, `Joueur supprimé : ${playerName(p)}`)
      toast('Joueur supprimé')
    } catch (err) {
      console.error(err)
      toast('Suppression impossible', 'error')
    }
  }

  if (players.loading) return <Spinner />

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <Input label="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="min-w-[140px] flex-1" />
          <Input label="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} className="min-w-[140px] flex-1" />
          <Button type="submit" icon={<Plus className="size-4" />} loading={adding} disabled={!firstName.trim() || !lastName.trim()}>Ajouter</Button>
        </form>
      </Card>
      <Input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="divide-y divide-line">
        {list.map((p) => {
          const active = p.active !== false
          return (
            <div key={p.id} className={cx('flex items-center gap-3 px-4 py-2.5', !active && 'opacity-60')}>
              <Avatar player={p} size="sm" />
              <span className="flex-1 text-[14px] font-medium">{playerName(p)}</span>
              {!active && <Badge>Inactif</Badge>}
              <button onClick={() => setEditing(p)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink" title="Renommer"><Pencil className="size-4" /></button>
              <button onClick={() => toggleActive(p)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink" title={active ? 'Désactiver' : 'Réactiver'}>{active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}</button>
              <button onClick={() => remove(p)} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-rose" title="Supprimer"><Trash2 className="size-4" /></button>
            </div>
          )
        })}
        {list.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted">Aucun joueur.</p>}
      </Card>
      <p className="text-[12px] text-muted">{players.data.length} joueurs dont {players.data.filter((p) => p.active !== false).length} actifs. Un joueur inactif n’apparaît plus dans les listes de vote mais conserve son historique.</p>
      {editing && <RenameModal player={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function RenameModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const actor = useActor()
  const toast = useToast()
  const [firstName, setFirstName] = useState(player.firstName)
  const [lastName, setLastName] = useState(player.lastName)
  const [loading, setLoading] = useState(false)
  async function save() {
    setLoading(true)
    try {
      await updateDoc(doc(db, 'players', player.id), { firstName: firstName.trim(), lastName: lastName.trim() })
      await logActivity(actor, 'update', 'player', player.id, `Joueur renommé : ${playerName(player)} → ${firstName.trim()} ${lastName.trim()}`)
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
    <Modal open onClose={onClose} title="Renommer le joueur" footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={loading} onClick={save} disabled={!firstName.trim() || !lastName.trim()}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Input label="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
    </Modal>
  )
}
