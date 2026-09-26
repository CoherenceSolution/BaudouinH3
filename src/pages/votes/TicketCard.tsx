import { useState, type ReactNode } from 'react'
import { Heart, Star, Bookmark, Eye, EyeOff, Smartphone, Megaphone, Flame, CheckCheck, ClipboardPen, Pencil } from 'lucide-react'
import type { Player, Ticket, VoteCategory } from '@/lib/types'
import { useCategories } from '@/hooks/useSettings'
import { cx, playerName } from '@/lib/format'
import type { LikeCounts } from '@/lib/rankings'
import { Badge, Button } from '@/components/ui'

interface Props {
  ticket: Ticket
  players: Map<string, Player>
  likes?: LikeCounts
  /** Affiche le nom de l'auteur (révélé par l'orateur, ou vue staff) */
  showAuthor: boolean
  /**
   * Vue orateur : sur les votes « commentaire d'abord », le nom attend que l'orateur
   * appuie sur « Annoncer le nom ». Ce repli est local à sa console : les autres écrans
   * (lecture en direct, classements) affichent le vote normalement.
   */
  speakerView?: boolean
  actions?: ReactNode
  myLikes?: Partial<Record<VoteCategory, string>>
  onLike?: (category: VoteCategory) => void
  /** Prévient la console qu'un nom vient d'être annoncé (consigne vue). */
  onReveal?: (category: VoteCategory) => void
  /** Affiche la consigne de lecture à côté du bouton d'annonce (première fois). */
  revealHint?: boolean
  index?: number
  className?: string
  /** Voix cumulées du joueur désigné, catégorie par catégorie, au moment de cette lecture. */
  nominationCounts?: Partial<Record<VoteCategory, number>>
  /** Seuil à partir duquel on signale le joueur (3 voix par défaut). */
  alertThreshold?: number
  /** Bouton ou contenu affiché sous le vote (ex. « Valider le vote »). */
  footer?: ReactNode
  /** Marque le vote comme déjà lu (console de l'orateur). */
  readBadge?: boolean
}

const catTone: Record<VoteCategory, string> = {
  best: 'bg-gold-soft text-amber-700',
  worst: 'bg-rose-soft text-rose',
  moment: 'bg-sky-soft text-sky-700',
}

export function TicketCard({ ticket, players, likes, showAuthor, speakerView, actions, myLikes, onLike, onReveal, revealHint, index, className, nominationCounts, alertThreshold, footer, readBadge }: Props) {
  const categories = useCategories()
  // Noms déjà annoncés par l'orateur pendant cette lecture (état local, rien n'est écrit).
  const [announced, setAnnounced] = useState<VoteCategory[]>([])
  const author = players.get(ticket.authorPlayerId)
  const counts = likes?.get(ticket.id)
  const multiDevice = (ticket.authorUids?.length ?? 0) > 1

  return (
    <article className={cx('card rise overflow-hidden', ticket.starred && 'ring-2 ring-gold/60', className)}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {index != null && <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{index}</span>}
        <span className="text-[13px] font-medium">
          {showAuthor ? (
            <span className="inline-flex items-center gap-1"><Eye className="size-3.5 text-sky" /> {author ? playerName(author) : 'Auteur non précisé'}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted"><EyeOff className="size-3.5" /> Vote anonyme</span>
          )}
        </span>
        {readBadge && <Badge tone="accent"><CheckCheck className="size-3" /> Lu</Badge>}
        {speakerView && ticket.manual && <Badge tone="violet"><ClipboardPen className="size-3" /> Hors plateforme</Badge>}
        {speakerView && ticket.correctedByName && <Badge><Pencil className="size-3" /> Nom corrigé par {ticket.correctedByName}</Badge>}
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
          // Voix cumulées du joueur désigné : au-delà du seuil, la lecture le signale.
          const reached = nominationCounts?.[c.key]
          const alert = alertThreshold != null && reached != null && reached >= alertThreshold
          // Consigne du votant : dans la console de l'orateur, le nom attend l'annonce.
          const guided = Boolean(speakerView && c.pickPlayer && e?.commentFirst && e?.playerId)
          const waiting = guided && !announced.includes(c.key)
          const pick = c.pickPlayer && (
            waiting ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="accent"
                  icon={<Megaphone className="size-4" />}
                  title="Lisez d’abord le commentaire, puis annoncez le nom voté."
                  onClick={() => { setAnnounced((a) => [...a, c.key]); onReveal?.(c.key) }}
                >
                  Annoncer le nom
                </Button>
                {revealHint && <span className="text-[12px] font-medium text-violet-700">Lisez d’abord le commentaire, puis annoncez le nom voté.</span>}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold leading-snug">{p ? playerName(p) : <span className="text-muted">—</span>}</span>
                {alert && (
                  <Badge tone="gold" className="font-semibold">
                    <Flame className="size-3" />
                    <span>{reached}<sup>e</sup> voix</span>
                  </Badge>
                )}
              </div>
            )
          )
          const comment = text ? <p className={cx('whitespace-pre-line text-[14px]', c.pickPlayer ? 'mt-1 text-ink-2' : 'text-[15px] font-medium text-ink')}>{text}</p> : !c.pickPlayer && <span className="text-muted">—</span>
          return (
            <div key={c.key} className="flex gap-3 px-4 py-3">
              <span className={cx('mt-0.5 flex h-6 shrink-0 items-center rounded-md px-1.5 text-[11px] font-semibold uppercase tracking-wide', catTone[c.key])} title={c.label}>{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{c.label}</div>
                {/* Dans la console, le commentaire passe avant le nom : c'est l'ordre de lecture demandé. */}
                {guided ? <>{comment}{pick}</> : <>{pick}{comment}</>}
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
      {footer && <div className="border-t border-line p-3">{footer}</div>}
    </article>
  )
}
