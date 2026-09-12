import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, Vote, Euro, BarChart3, History, Settings, LogOut, Mic, UserRound, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { usePlayers } from '@/hooks/useData'
import { cx, playerName } from '@/lib/format'
import { Avatar } from '@/components/ui'
import { ErrorBoundary } from '@/components/ErrorNotice'

const NAV = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/votes', label: 'Votes', icon: Vote },
  { to: '/amendes', label: 'Amendes', icon: Euro },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
  { to: '/historique', label: 'Historique', icon: History },
]

export function AppShell() {
  const { identity, staff, isStaff, logout, clearIdentity } = useAuth()
  const players = usePlayers(true)
  const navigate = useNavigate()
  const me = identity ? players.byId.get(identity.playerId) : null
  const displayName = me ? playerName(me) : isStaff ? staff?.displayName || staff?.email || '' : ''

  const nav = isStaff ? [...NAV, { to: '/admin', label: 'Gestion', icon: Settings }] : NAV

  async function handleLogout() {
    if (isStaff) await logout()
    else clearIdentity()
    navigate('/')
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* Barre latérale (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-[13px] font-extrabold text-accent">H3</span>
          <div>
            <div className="text-[15px] font-bold leading-tight">Baudouin H3</div>
            <div className="text-[11px] text-muted">Votes · Amendes · Stats</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition', isActive ? 'bg-ink text-white' : 'text-ink-2 hover:bg-slate-100')
              }
            >
              <n.icon className="size-[18px]" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <IdentityCard me={displayName} player={me} mode={isStaff ? staff!.role : identity?.mode ?? 'public'} onLogout={handleLogout} />
        </div>
      </aside>

      {/* Contenu */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/85 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-[12px] font-extrabold text-accent">H3</span>
            <span className="text-[15px] font-bold">Baudouin H3</span>
          </div>
          <IdentityCard compact me={displayName} player={me} mode={isStaff ? staff!.role : identity?.mode ?? 'public'} onLogout={handleLogout} />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Barre du bas (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden safe-bottom">
        <div className={cx('grid', nav.length === 6 ? 'grid-cols-6' : 'grid-cols-5')}>
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('flex flex-col items-center gap-1 py-2 text-[10.5px] font-medium', isActive ? 'text-ink' : 'text-muted')}
            >
              {({ isActive }) => (
                <>
                  <span className={cx('flex h-7 w-11 items-center justify-center rounded-full transition', isActive && 'bg-ink text-accent')}>
                    <n.icon className="size-[18px]" />
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

function IdentityCard({ me, player, mode, onLogout, compact }: { me: string; player: ReturnType<typeof usePlayers>['data'][number] | null | undefined; mode: string; onLogout: () => void; compact?: boolean }) {
  const modeLabel = mode === 'admin' ? 'Administrateur' : mode === 'secretary' ? 'Secrétaire' : mode === 'speaker' ? 'Orateur' : 'Votant'
  const Icon = mode === 'admin' || mode === 'secretary' ? ShieldCheck : mode === 'speaker' ? Mic : UserRound
  if (compact) {
    return (
      <button onClick={onLogout} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-[12px] font-medium" title="Changer d'utilisateur">
        {player ? <Avatar player={player} size="sm" /> : <span className="flex size-7 items-center justify-center rounded-full bg-ink text-white"><Icon className="size-3.5" /></span>}
        <span className="max-w-[110px] truncate">{me || modeLabel}</span>
        <LogOut className="size-3.5 text-muted" />
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5">
      {player ? <Avatar player={player} /> : <span className="flex size-9 items-center justify-center rounded-full bg-ink text-white"><Icon className="size-4" /></span>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{me || modeLabel}</div>
        <div className="text-[11px] text-muted">{modeLabel}</div>
      </div>
      <button onClick={onLogout} className="rounded-lg p-1.5 text-muted hover:bg-slate-200 hover:text-ink" title="Changer d'utilisateur">
        <LogOut className="size-4" />
      </button>
    </div>
  )
}
