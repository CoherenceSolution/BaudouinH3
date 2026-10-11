import { useMemo, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { ShieldCheck, ShieldOff, Link2, Mic, MicOff } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { usePlayers, useStaffList } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { logActivity, readBefore, undoUpdate } from '@/lib/activity'
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
  const speakers = useMemo(() => players.data.filter((p) => p.canSpeak), [players.data])
  const list = useMemo(() => players.data.filter((p) => playerMatches(p, q)), [players.data, q])

  async function setSecretary(p: Player, grant: boolean) {
    try {
      const before = await readBefore(`players/${p.id}`)
      await updateDoc(doc(db, 'players', p.id), { role: grant ? 'secretary' : null })
      await logActivity(actor, 'update', 'staff', p.id, grant ? `Droits de secrétaire accordés à ${playerFullLabel(p)}` : `Droits de secrétaire retirés à ${playerFullLabel(p)}`, undefined, undoUpdate(`players/${p.id}`, before, ['role']))
      toast(grant ? `${playerName(p)} est maintenant secrétaire` : `Droits retirés à ${playerName(p)}`)
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  async function setSpeaker(p: Player, grant: boolean) {
    try {
      const before = await readBefore(`players/${p.id}`)
      await updateDoc(doc(db, 'players', p.id), { canSpeak: grant })
      await logActivity(actor, 'update', 'staff', p.id, grant ? `${playerFullLabel(p)} ajouté à la liste des orateurs` : `${playerFullLabel(p)} retiré de la liste des orateurs`, [
        { field: 'Orateur désigné', before: grant ? 'non' : 'oui', after: grant ? 'oui' : 'non' },
      ], undoUpdate(`players/${p.id}`, before, ['canSpeak']))
      toast(grant ? `${playerName(p)} peut être orateur` : `${playerName(p)} n’est plus orateur`)
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  async function linkPlayer(s: StaffMember, pid: string) {
    try {
      const before = await readBefore(`staff/${s.id}`)
      await updateDoc(doc(db, 'staff', s.id), { playerId: pid || null })
      await logActivity(actor, 'update', 'staff', s.id, pid ? `${s.displayName} relié au joueur ${playerFullLabel(players.byId.get(pid))}` : `${s.displayName} : lien joueur retiré`, undefined, undoUpdate(`staff/${s.id}`, before, ['playerId']))
    } catch (err) {
      console.error(err)
      toast('Action impossible', 'error')
    }
  }

  if (staff.loading || players.loading) return <Spinner />

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-[15px] font-semibold">Secrétaires et orateurs</h3>
        <p className="mb-3 text-[13px] text-muted">
          Un secrétaire n’a ni e-mail, ni mot de passe, ni code : il se connecte avec son prénom et son nom, et ses droits s’appliquent aussitôt (matchs, amendes, buts, joueurs). Ils suivent le nom : quiconque se connecte sous ce nom les obtient, et chaque geste reste dans le journal d’activité. Retirez les droits ici à tout moment, l’effet est immédiat.
        </p>
        <ErrorNotice error={players.error} />
        <div className="mb-3 rounded-xl bg-violet-soft/60 p-3">
          <p className="mb-2 text-[13px] text-ink-2">
            <b>Orateurs ({speakers.length})</b> — seuls ces joueurs peuvent prendre le rôle d’orateur et ouvrir la console (en plus des secrétaires et de l’admin).
          </p>
          {speakers.length === 0 ? (
            <p className="text-[12px] text-muted">Aucun orateur désigné : utilisez le bouton « Orateur » dans la liste ci-dessous.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {speakers.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2 text-[13px] font-medium">
                  <Avatar player={p} size="sm" /> {playerName(p)}
                  <button onClick={() => setSpeaker(p, false)} className="rounded-full p-1 text-muted hover:bg-rose-soft hover:text-rose" title="Retirer de la liste des orateurs"><MicOff className="size-3.5" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
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
                {p.canSpeak && <Badge tone="violet"><Mic className="size-3" /> Orateur</Badge>}
                <Button size="sm" variant={p.canSpeak ? 'ghost' : 'secondary'} icon={p.canSpeak ? <MicOff className="size-4" /> : <Mic className="size-4" />} onClick={() => setSpeaker(p, !p.canSpeak)}>
                  {p.canSpeak ? 'Retirer orateur' : 'Orateur'}
                </Button>
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
