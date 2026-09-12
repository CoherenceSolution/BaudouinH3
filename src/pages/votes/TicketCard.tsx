import type { ReactNode } from 'react'
import { Heart, Star, Bookmark, Users, Eye, EyeOff, Smartphone } from 'lucide-react'
import { VOTE_CATEGORIES, type Player, type Ticket, type VoteCategory } from '@/lib/types'
import { cx, playerName } from '@/lib/format'
import type { LikeCounts } from '@/lib/rankings'
import { Badge } from '@/components/ui'

interface Props {
  ticket: Ticket
  players: Map<string, Player>
  likes?: LikeCounts
  /** Affiche le nom de l'auteur (révélé par l'orateur, ou vue staff) */
  showAuthor: boolean
  /** Vue orateur : indique que l'auteur est masqué (sans le nommer) */
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

export function TicketCard({ ticket, players, likes, showAuthor, speakerView, actions, myLikes, onLike, index, className }: Props) {
  const author = players.get(ticket.authorPlayerId)
  const coAuthor = ticket.coAuthorPlayerId ? players.get(ticket.coAuthorPlayerId) : null
  const counts = likes?.get(ticket.id)
  const multiDevice = (ticket.authorUids?.length ?? 0) > 1

  return (
    <article className={cx('card rise overflow-hidden', ticket.starred && 'ring-2 ring-gold/60', className)}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {index != null && <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{index}</span>}
        <span className="text-[13px] font-medium">
          {showAuthor ? (
            <span className="inline-flex items-center gap-1"><Eye className="size-3.5 text-sky" /> {playerName(author)}{coAuthor ? ` & ${playerName(coAuthor)}` : ''}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted"><EyeOff className="size-3.5" /> {speakerView ? 'Auteur masqué' : 'Ticket anonyme'}</span>
          )}
        </span>
        {ticket.coAuthorPlayerId && <Badge tone="violet"><Users className="size-3" /> Ticket à deux</Badge>}
        {ticket.starred && <Badge tone="gold"><Star className="size-3 fill-current" /> Petite étoile</Badge>}
        {ticket.saved && <Badge tone="sky"><Bookmark className="size-3 fill-current" /> Conservé</Badge>}
        {multiDevice && speakerView && <Badge tone="rose"><Smartphone className="size-3" /> Modifié depuis {ticket.authorUids.length} appareils</Badge>}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </header>
      <div className="divide-y divide-line">
        {VOTE_CATEGORIES.map((c) => {
          const e = ticket[c.key]
          const p = e?.playerId ? players.get(e.playerId) : undefined
          const n = counts?.[c.key] ?? 0
          const mine = myLikes?.[c.key] === ticket.id
          return (
            <div key={c.key} className="flex gap-3 px-4 py-3">
              <span className={cx('mt-0.5 flex h-6 shrink-0 items-center rounded-md px-1.5 text-[11px] font-semibold uppercase tracking-wide', catTone[c.key])}>{c.emoji} {c.short}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold leading-snug">
                  {e?.proposal && <span>{e.proposal}</span>}
                  {e?.proposal && p && <span className="text-muted"> — </span>}
                  {p ? <span>{playerName(p)}</span> : !e?.proposal ? <span className="text-muted">—</span> : null}
                </div>
                {e?.comment && <p className="mt-1 whitespace-pre-line text-[14px] text-ink-2">{e.comment}</p>}
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
