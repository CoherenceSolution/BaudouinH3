import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Hand, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { takeoverFor } from '@/hooks/useSpeakerLead'
import type { Match } from '@/lib/types'

const SEEN_KEY = 'h3.takeoverSeen'

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/**
 * Prévient l'orateur dépossédé, sur toutes les pages : quelqu'un a pris la main sur la lecture,
 * il n'est plus l'orateur en cours et ne voit plus le nom des votants.
 * Le bandeau disparaît quand il le ferme ou qu'il reprend la main.
 */
export function SpeakerTakeoverNotices({ matches }: { matches: Match[] }) {
  const { user, identity } = useAuth()
  const [seen, setSeen] = useState<string[]>(readSeen)

  const notices = matches
    .filter((m) => m.status === 'voting' || m.status === 'reading')
    .map((m) => ({ match: m, takeover: takeoverFor(m, user?.uid, identity?.playerId) }))
    .filter((n) => n.takeover && !seen.includes(keyOf(n.match.id, n.takeover.at?.toMillis())))
  if (notices.length === 0) return null

  function dismiss(key: string) {
    const next = [...seen.slice(-20), key]
    setSeen(next)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next))
    } catch {
      /* navigation privée : fermé pour cette visite seulement */
    }
  }

  return (
    <>
      {notices.map(({ match, takeover }) => {
        const key = keyOf(match.id, takeover!.at?.toMillis())
        const at = takeover!.at?.toDate().toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
        return (
          <div key={key} role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-ink">
            <Hand className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <b>{takeover!.byName} a pris la main sur la lecture{at ? ` (${at})` : ''}.</b>{' '}
              Vous n’êtes plus l’orateur en cours contre {match.opponent} : le nom des votants ne vous est plus visible.{' '}
              <Link to={`/votes/${match.id}`} className="font-semibold underline">Ouvrir la console</Link>
            </div>
            <button type="button" title="Fermer" onClick={() => dismiss(key)} className="rounded-lg p-1 text-muted hover:bg-amber-100 hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </>
  )
}

function keyOf(matchId: string, at: number | undefined) {
  return `${matchId}:${at ?? 0}`
}
