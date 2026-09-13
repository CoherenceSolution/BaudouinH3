import { forwardRef, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { cx } from '@/lib/format'
import type { Player } from '@/lib/types'
import { initials } from '@/lib/format'

/* ---------- Button ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  block?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-slate-800 active:bg-slate-900 shadow-sm',
  accent: 'bg-accent text-ink hover:bg-lime-400 active:bg-lime-500 shadow-sm font-semibold',
  secondary: 'bg-surface text-ink border border-line hover:bg-slate-50 active:bg-slate-100',
  ghost: 'text-ink-2 hover:bg-slate-100 active:bg-slate-200',
  danger: 'bg-rose-soft text-rose hover:bg-rose-100 active:bg-rose-200',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[14px] gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-medium transition select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})

/* ---------- Inputs ---------- */

interface FieldProps {
  label?: string
  hint?: string
  error?: string
  className?: string
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <input ref={ref} id={inputId} className={cx('field', error && 'border-rose focus:border-rose')} {...rest} />
      {error ? <p className="mt-1 text-[12px] text-rose">{error}</p> : hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <textarea ref={ref} id={inputId} className={cx('field min-h-[88px] resize-y', error && 'border-rose')} {...rest} />
      {error ? <p className="mt-1 text-[12px] text-rose">{error}</p> : hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(function Select(
  { label, hint, error, className, children, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <select ref={ref} id={inputId} className={cx('field appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%2364748b%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', error && 'border-rose')} {...rest}>
        {children}
      </select>
      {error ? <p className="mt-1 text-[12px] text-rose">{error}</p> : hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  )
})

/** Case à cocher lisible au doigt, avec un libellé cliquable et une explication facultative. */
export function Checkbox({ checked, onChange, label, hint, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-2.5 select-none', disabled && 'cursor-not-allowed opacity-50', className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-md border border-line accent-accent-strong"
      />
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] text-muted">{hint}</span>}
      </span>
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-[14px] text-ink-2"
    >
      <span className={cx('relative inline-flex h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  )
}

/* ---------- Layout bits ---------- */

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('card', onClick && 'cursor-pointer transition hover:-translate-y-px hover:shadow-md', className)}>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {right}
    </div>
  )
}

type Tone = 'neutral' | 'accent' | 'gold' | 'rose' | 'sky' | 'violet' | 'ink'

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-ink-2',
  accent: 'bg-accent-soft text-accent-strong',
  gold: 'bg-gold-soft text-amber-700',
  rose: 'bg-rose-soft text-rose',
  sky: 'bg-sky-soft text-sky-700',
  violet: 'bg-violet-soft text-violet-700',
  ink: 'bg-ink text-white',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Avatar({ player, size = 'md', className }: { player: Player | undefined | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'sm' ? 'size-7 text-[11px]' : size === 'lg' ? 'size-12 text-[16px]' : 'size-9 text-[13px]'
  const hue = player ? (player.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360) : 210
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink', s, className)}
      style={{ background: `oklch(0.92 0.06 ${hue})`, color: `oklch(0.4 0.1 ${hue})` }}
    >
      {initials(player)}
    </span>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-ink-2">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[14px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center justify-center py-16 text-muted', className)}>
      <Loader2 className="size-6 animate-spin" />
    </div>
  )
}

export function Stat({ label, value, tone = 'neutral', sub }: { label: string; value: ReactNode; tone?: Tone; sub?: ReactNode }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className={cx('mt-0.5 text-2xl font-bold tracking-tight', tone === 'accent' ? 'text-accent-strong' : tone === 'rose' ? 'text-rose' : tone === 'gold' ? 'text-amber-600' : 'text-ink')}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
    </div>
  )
}

/* ---------- Modal ---------- */

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  // Portail : la modale vit hors de son parent (évite les formulaires imbriqués et les soucis de z-index).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        className={cx('pop card flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-[16px] font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" aria-label="Fermer">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3 safe-bottom">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- Tabs ---------- */

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={cx('rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition', value === it.key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Segmented / chips ---------- */

export function Chip({ active, onClick, children, tone = 'ink' }: { active?: boolean; onClick?: () => void; children: ReactNode; tone?: Tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full border px-3 py-1.5 text-[13px] font-medium transition',
        active ? cx(tones[tone], 'border-transparent') : 'border-line bg-surface text-ink-2 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  )
}
