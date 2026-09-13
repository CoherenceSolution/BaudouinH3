import { useCallback, useState } from 'react'

/**
 * Petit indicateur mémorisé sur l'appareil (localStorage) : sert aux consignes
 * qui ne doivent s'afficher que la première fois.
 */
export function useLocalFlag(key: string): [boolean, (v: boolean) => void] {
  const [flag, setFlag] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const set = useCallback(
    (v: boolean) => {
      setFlag(v)
      try {
        if (v) localStorage.setItem(key, '1')
        else localStorage.removeItem(key)
      } catch {
        /* navigation privée : l'indicateur reste en mémoire seulement */
      }
    },
    [key],
  )
  return [flag, set]
}
