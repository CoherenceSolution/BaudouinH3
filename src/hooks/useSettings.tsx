import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, firebaseConfigured } from '@/lib/firebase'
import { DEFAULT_CATEGORIES, type CategoryDef, type Settings, type VoteCategory } from '@/lib/types'
import { useAuth } from '@/auth/AuthProvider'

interface SettingsState {
  settings: Settings
  categories: CategoryDef[]
  category: (key: VoteCategory) => CategoryDef
}

const Ctx = createContext<SettingsState>({ settings: {}, categories: DEFAULT_CATEGORIES, category: (k) => DEFAULT_CATEGORIES.find((c) => c.key === k)! })

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState<Settings>({})

  useEffect(() => {
    if (!firebaseConfigured || !user) return
    return onSnapshot(
      doc(db, 'config', 'settings'),
      (snap) => setSettings(snap.exists() ? (snap.data() as Settings) : {}),
      (e) => console.warn('Paramètres indisponibles', e),
    )
  }, [user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<SettingsState>(() => {
    const categories = DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      label: settings.categories?.[c.key]?.label?.trim() || c.label,
      emoji: settings.categories?.[c.key]?.emoji?.trim() || c.emoji,
    }))
    return { settings, categories, category: (k) => categories.find((c) => c.key === k)! }
  }, [settings])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSettings() {
  return useContext(Ctx)
}

/** Les trois catégories de vote avec leurs libellés personnalisés. */
export function useCategories(): CategoryDef[] {
  return useContext(Ctx).categories
}
