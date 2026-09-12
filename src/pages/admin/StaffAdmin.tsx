import { useState, type FormEvent } from 'react'
import { deleteApp, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signOut, updateProfile } from 'firebase/auth'
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { Plus, Trash2, ShieldCheck } from 'lucide-react'
import { db, firebaseConfig } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { usePlayers, useStaffList } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { Role, StaffMember } from '@/lib/types'
import { Avatar, Badge, Button, Card, Input, Select, Spinner } from '@/components/ui'
import { playerName } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import { humanizeAuthError } from '../LoginPage'

/**
 * Gestion des comptes staff (admin uniquement).
 * La création d'un compte passe par une instance Firebase secondaire afin de ne pas
 * déconnecter l'administrateur (pas de Cloud Functions nécessaires).
 */
export function StaffAdmin() {
  const { user } = useAuth()
  const staff = useStaffList()
  const players = usePlayers(true)
  const actor = useActor()
  const toast = useToast()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('secretary')
  const [playerId, setPlayerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function create(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const secondary = initializeApp(firebaseConfig, `staff-creator-${Date.now()}`)
    try {
      const secAuth = getAuth(secondary)
      const cred = await createUserWithEmailAndPassword(secAuth, email.trim(), password)
      await updateProfile(cred.user, { displayName: displayName.trim() })
      await signOut(secAuth)
      await setDoc(doc(db, 'staff', cred.user.uid), { email: email.trim(), displayName: displayName.trim(), role, playerId: playerId || null, createdAt: serverTimestamp() })
      await logActivity(actor, 'create', 'staff', cred.user.uid, `Compte ${role === 'admin' ? 'administrateur' : 'secrétaire'} créé : ${displayName.trim()} (${email.trim()})`)
      toast(`Compte créé pour ${displayName.trim()}`)
      setDisplayName(''); setEmail(''); setPassword(''); setPlayerId('')
    } catch (err) {
      setError(humanizeAuthError(err))
    } finally {
      await deleteApp(secondary).catch(() => {})
      setLoading(false)
    }
  }

  async function changeRole(s: StaffMember, r: Role) {
    try {
      await updateDoc(doc(db, 'staff', s.id), { role: r })
      await logActivity(actor, 'update', 'staff', s.id, `${s.displayName} : rôle → ${r === 'admin' ? 'administrateur' : 'secrétaire'}`)
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  async function linkPlayer(s: StaffMember, pid: string) {
    try {
      await updateDoc(doc(db, 'staff', s.id), { playerId: pid || null })
      await logActivity(actor, 'update', 'staff', s.id, pid ? `${s.displayName} relié au joueur ${playerName(players.byId.get(pid))}` : `${s.displayName} : lien joueur retiré`)
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  async function remove(s: StaffMember) {
    if (!confirm(`Retirer les droits de ${s.displayName} ? Le compte pourra toujours se connecter mais n’aura plus aucun accès staff.`)) return
    try {
      await deleteDoc(doc(db, 'staff', s.id))
      await logActivity(actor, 'delete', 'staff', s.id, `Droits retirés : ${s.displayName} (${s.email})`)
      toast('Droits retirés')
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  if (staff.loading) return <Spinner />

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="mb-3 text-[14px] font-semibold">Nouveau compte staff</h3>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Input label="Nom" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Mot de passe provisoire" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} hint="À communiquer à la personne" />
          <Select label="Rôle" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="secretary">Secrétaire</option>
            <option value="admin">Administrateur</option>
          </Select>
          <Select label="Joueur de l’équipe correspondant" value={playerId} onChange={(e) => { setPlayerId(e.target.value); const p = players.byId.get(e.target.value); if (p && !displayName) setDisplayName(playerName(p)) }} hint="Relie le compte à son nom pour les votes" className="sm:col-span-2">
            <option value="">— Pas encore relié —</option>
            {players.data.map((p) => <option key={p.id} value={p.id}>{playerName(p)}</option>)}
          </Select>
          {error && <p className="text-[13px] text-rose sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" icon={<Plus className="size-4" />} loading={loading}>Créer le compte</Button>
          </div>
        </form>
      </Card>
      <Card className="divide-y divide-line">
        {staff.data.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            {s.playerId && players.byId.get(s.playerId) ? <Avatar player={players.byId.get(s.playerId)} /> : <span className="flex size-9 items-center justify-center rounded-full bg-ink text-white"><ShieldCheck className="size-4" /></span>}
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{s.displayName || s.email} {s.id === user?.uid && <Badge tone="accent">Vous</Badge>}</div>
              <div className="text-[12px] text-muted">{s.email}{s.playerId ? ` · joueur : ${playerName(players.byId.get(s.playerId))}` : ' · non relié à un joueur'}</div>
            </div>
            <Select value={s.playerId ?? ''} onChange={(e) => linkPlayer(s, e.target.value)} className="w-48" title="Joueur relié">
              <option value="">— Joueur —</option>
              {players.data.map((p) => <option key={p.id} value={p.id}>{playerName(p)}</option>)}
            </Select>
            <Select value={s.role} onChange={(e) => changeRole(s, e.target.value as Role)} disabled={s.id === user?.uid} className="w-40">
              <option value="secretary">Secrétaire</option>
              <option value="admin">Administrateur</option>
            </Select>
            <button onClick={() => remove(s)} disabled={s.id === user?.uid} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-rose disabled:opacity-30" title="Retirer les droits"><Trash2 className="size-4" /></button>
          </div>
        ))}
      </Card>
    </div>
  )
}
