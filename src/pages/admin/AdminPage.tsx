import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Users, CalendarDays, ShieldCheck, ScrollText, DatabaseBackup, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { cx } from '@/lib/format'
import { PageHeader } from '@/components/ui'
import { PlayersAdmin } from './PlayersAdmin'
import { MatchesAdmin } from './MatchesAdmin'
import { StaffAdmin } from './StaffAdmin'
import { ActivityAdmin } from './ActivityAdmin'
import { BackupAdmin } from './BackupAdmin'
import { SettingsAdmin } from './SettingsAdmin'

export function AdminPage() {
  const { isAdmin } = useAuth()
  const items = [
    { to: '/admin/joueurs', label: 'Joueurs', icon: Users },
    { to: '/admin/matchs', label: 'Matchs', icon: CalendarDays },
    ...(isAdmin ? [{ to: '/admin/staff', label: 'Staff', icon: ShieldCheck }] : []),
    { to: '/admin/parametres', label: 'Paramètres', icon: SlidersHorizontal },
    { to: '/admin/activite', label: 'Activité', icon: ScrollText },
    ...(isAdmin ? [{ to: '/admin/sauvegarde', label: 'Sauvegarde', icon: DatabaseBackup }] : []),
  ]
  return (
    <div>
      <PageHeader title="Gestion" subtitle="Joueurs, matchs, comptes et journal d’activité." />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className={({ isActive }) => cx('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition', isActive ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
            <it.icon className="size-4" /> {it.label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Navigate to="/admin/joueurs" replace />} />
        <Route path="joueurs" element={<PlayersAdmin />} />
        <Route path="matchs" element={<MatchesAdmin />} />
        {isAdmin && <Route path="staff" element={<StaffAdmin />} />}
        <Route path="parametres" element={<SettingsAdmin />} />
        <Route path="activite" element={<ActivityAdmin />} />
        {isAdmin && <Route path="sauvegarde" element={<BackupAdmin />} />}
      </Routes>
    </div>
  )
}
