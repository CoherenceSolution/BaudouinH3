import { useEffect, useMemo, useState } from 'react'
import { onSnapshot, type DocumentData, type Query } from 'firebase/firestore'

interface State<T> {
  data: T[]
  loading: boolean
  error: Error | null
}

/**
 * Abonnement temps réel à une requête Firestore.
 * `deps` doit lister les valeurs dont dépend la requête (ids, filtres…).
 */
export function useCollection<T extends { id: string }>(
  build: () => Query<DocumentData> | null,
  deps: unknown[],
): State<T> {
  const [state, setState] = useState<State<T>>({ data: [], loading: true, error: null })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(build, deps)

  useEffect(() => {
    if (!query) {
      setState({ data: [], loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    return onSnapshot(
      query,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) }) as T)
        setState({ data, loading: false, error: null })
      },
      (error) => {
        console.error('Firestore :', error)
        setState({ data: [], loading: false, error })
      },
    )
  }, [query])

  return state
}
