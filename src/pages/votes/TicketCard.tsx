import type { ReactNode } from 'react'
import { Heart, Star, Bookmark, Eye, EyeOff, Smartphone } from 'lucide-react'
import type { Player, Ticket, VoteCategory } from '@/lib/types'
import { useCategories } from '@/hooks/useSettings'
import { cx, playerName } from '@/lib/format'
import type { LikeCounts } from '@/lib/rankings'
import { Badge } from '@/components/ui'

interface Props {
  ticket: Ticket
  players: Map<string, Player>
  likes?: LikeCounts
  /** Affiche le nom de l'auteur (révélé par l'orateur, ou vue staff) */
  showAuthor: boolean
  /** Vue orateur (réservé, sans effet visuel) */
  speakerView?: boolean
  actions?: ReactNode
  myLikes?: Partial<Record<VoteCategory, string>>
  onLike?: (category: VoteCategory) => void
  index?: number
  className?: string
}

const catTone: Record<VoteCategory, string> = {
  best: 'bg-gold-soft text-amber-700',
  worst: 'bg-rose-soft text-rose',
  moment: 'bg-sky-soft text-sky-700',
}

export function TicketCard({ ticket, players, likes, showAuthor, actions, myLikes, onLike, index, className }: Props) {
  const categories = useCategories()
  const author = players.get(ticket.authorPlayerId)
  const counts = likes?.get(ticket.id)
  const multiDevice = (ticket.authorUids?.length ?? 0) > 1

  return (
    <article className={cx('card rise overflow-hidden', ticket.starred && 'ring-2 ring-gold/60', className)}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {index != null && <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{index}</span>}
        <span className="text-[13px] font-medium">
          {showAuthor ? (
            <span className="inline-flex items-center gap-1"><Eye className="size-3.5 text-sky" /> {playerName(author)}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted"><EyeOff className="size-3.5" /> Vote anonyme</span>
          )}
        </span>
        {ticket.starred && <Badge tone="gold"><Star className="size-3 fill-current" /> Petite étoile</Badge>}
        {ticket.saved && <Badge tone="sky"><Bookmark className="size-3 fill-current" /> Conservé</Badge>}
        {multiDevice && <Badge tone="rose"><Smartphone className="size-3" /> Double auteur : rempli depuis {ticket.authorUids.length} appareils</Badge>}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </header>
      <div className="divide-y divide-line">
        {categories.map((c) => {
          const e = ticket[c.key]
          const p = e?.playerId ? players.get(e.playerId) : undefined
          const n = counts?.[c.key] ?? 0
          const mine = myLikes?.[c.key] === ticket.id
          const text = [e?.proposal, e?.comment].filter(Boolean).join(' — ')
          return (
            <div key={c.key} className="flex gap-3 px-4 py-3">
              <span className={cx('mt-0.5 flex h-6 shrink-0 items-center rounded-md px-1.5 text-[11px] font-semibold uppercase tracking-wide', catTone[c.key])} title={c.label}>{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{c.label}</div>
                {c.pickPlayer && <div className="text-[15px] font-semibold leading-snug">{p ? playerName(p) : <span className="text-muted">—</span>}</div>}
                {text ? <p className={cx('whitespace-pre-line text-[14px]', c.pickPlayer ? 'mt-1 text-ink-2' : 'text-[15px] font-medium text-ink')}>{text}</p> : !c.pickPlayer && <span className="text-muted">—</span>}
              </div>
              {(onLike || n > 0) && (
                <button
                  type="button"
                  disabled={!onLike}
                  onClick={() => onLike?.(c.key)}
                  className={cx(
                    'flex h-8 shrink-0 items-center gap-1 self-start rounded-full border px-2.5 text-[12px] font-semibold transition',
                    mine ? 'border-rose bg-rose text-white' : 'border-line bg-surface text-ink-2 hover:border-rose hover:text-rose disabled:hover:border-line disabled:hover:text-ink-2',
                  )}
                  title={onLike ? 'Ma contribution préférée dans cette catégorie' : undefined}
                >
                  <Heart className={cx('size-3.5', mine && 'fill-current')} /> {n}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </article>
  )
}
