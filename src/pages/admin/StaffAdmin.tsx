import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { ShieldCheck, ShieldOff, Link2, KeyRound } from 'lucide-react'
import { PIN_PATTERN, setSecretaryPin } from '@/lib/secretaryAccess'
import { humanizePinError } from '@/lib/pinErrors'
import type { SecretaryAccess } from '@/lib/types'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { usePlayers, useStaffList } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { Player, StaffMember } from '@/lib/types'
import { cx, playerFullLabel, playerMatches, playerName, playerRealName } from '@/lib/format'
import { Avatar, Badge, Button, Card, Input, Select, Spinner } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { ErrorNotice } from '@/components/ErrorNotice'

/**
 * Droits (admin uniquement).
 * - Les secrétaires n'ont ni e-mail ni mot de passe : l'admin accorde les droits à un joueur,
 *   et le membre qui se connecte sous ce nom devient secrétaire.
 * - Le compte administrateur (e-mail + mot de passe) est relié à un joueur pour voter.
 */
export function StaffAdmin() {
  const { user } = useAuth()
  const staff = useStaffList()
  const players = usePlayers(true)
  const actor = useActor()
  const toast = useToast()
  const [q, setQ] = useState('')

  const secretaries = useMemo(() => players.data.filter((p) => p.role === 'secretary'), [players.data])
  const list = useMemo(() => players.data.filter((p) => playerMatches(p, q)), [players.data, q])

  async function setSecretary(p: Player, grant: boolean) {
    try {
      await updateDoc(doc(db, 'players', p.id), { role: grant ? 'secretary' : null })
      await logActivity(actor, 'update', 'staff', p.id, grant ? `Droits de secrétaire accordés à ${playerFullLabel(p)}` : `Droits de secrétaire retirés à ${playerFullLabel(p)}`)
      toast(grant ? `${playerName(p)} est maintenant secrétaire` : `Droits retirés à ${playerName(p)}`)
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  async function linkPlayer(s: StaffMember, pid: string) {
    try {
      await updateDoc(doc(db, 'staff', s.id), { playerId: pid || null })
      await logActivity(actor, 'update', 'staff', s.id, pid ? `${s.displayName} relié au joueur ${playerFullLabel(players.byId.get(pid))}` : `${s.displayName} : lien joueur retiré`)
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  if (staff.loading || players.loading) return <Spinner />

  return (
    <div className="space-y-5">
      <PinSection />

      <section>
        <h3 className="mb-2 text-[15px] font-semibold">Secrétaires ({secretaries.length})</h3>
        <p className="mb-3 text-[13px] text-muted">
          Un secrétaire n’a pas d’e-mail ni de mot de passe personnel : il se connecte avec son prénom et son nom, entre le code commun une fois sur son téléphone, et peut gérer matchs, amendes, buts et joueurs. Retirez les droits ici à tout moment.
        </p>
        <ErrorNotice error={players.error} />
        {secretaries.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {secretaries.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2 text-[13px] font-medium">
                <Avatar player={p} size="sm" /> {playerName(p)}
                <button onClick={() => setSecretary(p, false)} className="rounded-full p-1 text-muted hover:bg-rose-soft hover:text-rose" title="Retirer les droits"><ShieldOff className="size-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        <Input placeholder="Rechercher un nom ou un surnom…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
        <Card className="divide-y divide-line">
          {list.map((p) => {
            const isSec = p.role === 'secretary'
            return (
              <div key={p.id} className={cx('flex items-center gap-3 px-4 py-2.5', p.active === false && 'opacity-60')}>
                <Avatar player={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{playerName(p)}</span>
                  {playerRealName(p) && <span className="block truncate text-[12px] text-muted">{playerRealName(p)}</span>}
                </span>
                {isSec && <Badge tone="accent"><ShieldCheck className="size-3" /> Secrétaire</Badge>}
                <Button size="sm" variant={isSec ? 'ghost' : 'secondary'} icon={isSec ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />} onClick={() => setSecretary(p, !isSec)}>
                  {isSec ? 'Retirer' : 'Rendre secrétaire'}
                </Button>
              </div>
            )
          })}
          {list.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted">Aucun joueur.</p>}
        </Card>
      </section>

      <section>
        <h3 className="mb-2 text-[15px] font-semibold">Compte administrateur</h3>
        <Card className="divide-y divide-line">
          {staff.data.filter((s) => !s.shared).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {s.playerId && players.byId.get(s.playerId) ? <Avatar player={players.byId.get(s.playerId)} /> : <span className="flex size-9 items-center justify-center rounded-full bg-ink text-white"><ShieldCheck className="size-4" /></span>}
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{s.displayName || s.email} {s.id === user?.uid && <Badge tone="accent">Vous</Badge>}</div>
                <div className="text-[12px] text-muted">{s.email} · {s.role === 'admin' ? 'administrateur' : 'secrétaire'}{s.playerId ? ` · joueur : ${playerFullLabel(players.byId.get(s.playerId))}` : ' · non relié à un joueur'}</div>
              </div>
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-muted" />
                <Select value={s.playerId ?? ''} onChange={(e) => linkPlayer(s, e.target.value)} className="w-48" title="Joueur relié">
                  <option value="">— Joueur —</option>
                  {players.data.map((p) => <option key={p.id} value={p.id}>{playerFullLabel(p)}</option>)}
                </Select>
              </div>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-[12px] text-muted">Le mot de passe de l’administrateur se change depuis la console Firebase (Authentication → Users).</p>
      </section>
    </div>
  )
}

/** Code commun des secrétaires : définition, changement, réinitialisation. */
function PinSection() {
  const actor = useActor()
  const toast = useToast()
  const [access, setAccess] = useState<SecretaryAccess | null | undefined>(undefined)
  const [newPin, setNewPin] = useState('')
  const [oldPin, setOldPin] = useState('')
  const [forgot, setForgot] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => onSnapshot(doc(db, 'config', 'secretaryAccess'), (snap) => setAccess(snap.exists() ? (snap.data() as SecretaryAccess) : null)), [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!PIN_PATTERN.test(newPin)) {
      setError('Le code doit comporter entre 4 et 8 chiffres.')
      return
    }
    setLoading(true)
    try {
      await setSecretaryPin(newPin, access && !forgot ? oldPin : undefined)
      await logActivity(actor, access ? 'update' : 'create', 'staff', 'secretaryAccess', access ? 'Code des secrétaires modifié' : 'Code des secrétaires défini')
      toast(access ? 'Code modifié' : 'Code défini')
      setNewPin(''); setOldPin(''); setForgot(false)
    } catch (err) {
      setError(humanizePinError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-[15px] font-semibold">Code commun des secrétaires</h3>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><KeyRound className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px]">
              {access === undefined ? 'Chargement…' : access ? <>Un code est défini{access.updatedAt ? ` (mis à jour le ${access.updatedAt.toDate().toLocaleDateString('fr-BE')})` : ''}. Partagez-le uniquement avec les secrétaires.</> : <b>Aucun code défini : les secrétaires ne peuvent pas encore activer leurs droits.</b>}
            </p>
            <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
              {access && !forgot && (
                <Input label="Code actuel" type="password" inputMode="numeric" value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))} className="w-36" maxLength={8} />
              )}
              <Input label={access ? 'Nouveau code' : 'Code (4 à 8 chiffres)'} type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} className="w-40" maxLength={8} />
              <Button type="submit" loading={loading} disabled={!newPin || (Boolean(access) && !forgot && !oldPin)}>{access ? 'Changer le code' : 'Définir le code'}</Button>
            </form>
            {access && (
              <label className="mt-2 flex items-center gap-2 text-[12px] text-muted">
                <input type="checkbox" checked={forgot} onChange={(e) => setForgot(e.target.checked)} className="size-3.5" /> J’ai oublié le code actuel (un nouvel accès est créé, l’ancien code cesse de fonctionner)
              </label>
            )}
            {error && <p className="mt-2 text-[13px] text-rose">{error}</p>}
            <p className="mt-2 text-[12px] text-muted">Les secrétaires déjà connectés restent connectés jusqu’à ce qu’ils changent d’utilisateur ; changer le code ne les déconnecte pas.</p>
          </div>
        </div>
      </Card>
    </section>
  )
}
