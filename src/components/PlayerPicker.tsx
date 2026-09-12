import { useMemo, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import type { Player } from '@/lib/types'
import { cx, playerName } from '@/lib/format'
import { Avatar, Button, Input } from './ui'
import { useAuth } from '@/auth/AuthProvider'
import { useActor } from '@/hooks/useActor'
import { createPlayer } from '@/lib/players'
import { useToast } from './ui/Toast'

interface Props {
  players: Player[]
  value: string | null
  onChange: (id: string | null) => void
  label?: string
  placeholder?: string
  exclude?: string[]
  allowNone?: boolean
  compact?: boolean
  /** Le staff peut ajouter un joueur manquant directement depuis le sélecteur. */
  allowCreate?: boolean
}

/**
 * Sélecteur de joueur avec recherche.
 * Sur téléphone : liste verticale à grandes lignes, faciles à lire et à toucher.
 * Sur grand écran : grille sur deux ou trois colonnes.
 */
export function PlayerPicker({ players, value, onChange, label, placeholder = 'Rechercher un joueur…', exclude = [], allowNone, compact, allowCreate }: Props) {
  const [q, setQ] = useState('')
  const { isStaff } = useAuth()
  const [creating, setCreating] = useState(false)
  const list = useMemo(() => {
    const norm = normalize(q)
    return players
      .filter((p) => !exclude.includes(p.id))
      .filter((p) => !norm || normalize(playerName(p)).includes(norm))
  }, [players, q, exclude])
  const selected = players.find((p) => p.id === value)

  return (
    <div>
      {label && <label className="label">{label}</label>}
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-ink bg-ink px-3 py-2.5 text-white">
          <Avatar player={selected} />
          <span className="flex-1 text-[16px] font-semibold">{playerName(selected)}</span>
          <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Changer de joueur">
            <X className="size-5" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="field pl-9" />
          </div>
          <div className={cx('mt-2 grid gap-1.5', compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
            {allowNone && (
              <button type="button" onClick={() => onChange(null)} className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed border-line px-3 text-left text-[15px] text-muted hover:bg-slate-50">
                Aucun
              </button>
            )}
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.id)}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-3 text-left text-[15px] font-medium text-ink transition hover:border-ink hover:bg-slate-50 active:bg-slate-100"
              >
                <Avatar player={p} size="sm" />
                <span className="truncate">{playerName(p)}</span>
                {p.id === value && <Check className="ml-auto size-4 text-accent-strong" />}
              </button>
            ))}
            {list.length === 0 && <p className="col-span-full py-3 text-center text-[13px] text-muted">Aucun joueur trouvé.</p>}
          </div>
          {allowCreate && isStaff && (
            creating ? (
              <QuickAddPlayer initial={q} onDone={(id) => { setCreating(false); if (id) onChange(id) }} />
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-strong hover:underline">
                <Plus className="size-4" /> Ajouter un joueur manquant
              </button>
            )
          )}
        </>
      )}
    </div>
  )
}

/** Minuscules, sans accents, espaces normalisés : « Jérôme  Fetu » → « jerome fetu ». */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function QuickAddPlayer({ initial, onDone }: { initial: string; onDone: (id: string | null) => void }) {
  const parts = initial.trim().split(/\s+/)
  const [firstName, setFirstName] = useState(parts[0] ?? '')
  const [lastName, setLastName] = useState(parts.slice(1).join(' '))
  const [loading, setLoading] = useState(false)
  const actor = useActor()
  const toast = useToast()

  async function save() {
    if (!firstName.trim() || !lastName.trim()) return
    setLoading(true)
    try {
      const id = await createPlayer(actor, firstName, lastName)
      toast(`${firstName} ${lastName} ajouté à l’équipe`)
      onDone(id)
    } catch (e) {
      toast('Impossible d’ajouter le joueur', 'error')
      console.error(e)
      onDone(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-dashed border-accent-strong/50 bg-accent-soft/40 p-3">
      <p className="mb-2 text-[13px] font-semibold text-ink">Nouveau joueur</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
        <Input placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={() => onDone(null)}>Annuler</Button>
        <Button size="sm" variant="accent" type="button" loading={loading} onClick={save} disabled={!firstName.trim() || !lastName.trim()}>Ajouter</Button>
      </div>
    </div>
  )
}
