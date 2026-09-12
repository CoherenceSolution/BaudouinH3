import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { firebaseConfigured } from './lib/firebase'
import { AppShell } from './layout/AppShell'
import { Spinner } from './components/ui'
import { LoginPage } from './pages/LoginPage'
import { SetupPage } from './pages/SetupPage'
import { HomePage } from './pages/HomePage'
import { VotesPage } from './pages/votes/VotesPage'
import { MatchVotePage } from './pages/votes/MatchVotePage'
import { FinesPage } from './pages/fines/FinesPage'
import { StatsPage } from './pages/stats/StatsPage'
import { MatchStatsPage } from './pages/stats/MatchStatsPage'
import { HistoryPage } from './pages/history/HistoryPage'
import { AdminPage } from './pages/admin/AdminPage'
import { ConfigMissingPage } from './pages/ConfigMissingPage'

export default function App() {
  const { ready, bootstrapped, user, isStaff, identity } = useAuth()

  if (!firebaseConfigured) return <ConfigMissingPage />
  if (!ready) return <Spinner className="min-h-dvh" />
  if (bootstrapped === false) return <SetupPage />

  const loggedIn = isStaff || (user && identity)
  if (!loggedIn) return <LoginPage />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="votes" element={<VotesPage />} />
        <Route path="votes/:matchId" element={<MatchVotePage />} />
        <Route path="amendes" element={<FinesPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="stats/:matchId" element={<MatchStatsPage />} />
        <Route path="historique" element={<HistoryPage />} />
        <Route path="admin/*" element={isStaff ? <AdminPage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
