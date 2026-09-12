import type { FineType } from './types'

/** Calcule le montant d'une amende à partir de son type et d'une quantité (ex. minutes de retard). */
export function computeFineAmount(type: Pick<FineType, 'kind' | 'amount' | 'freeUnits' | 'cap'>, quantity: number | null): number {
  if (type.kind === 'fixed') return round2(type.amount)
  const q = Math.max(0, quantity ?? 0)
  const billable = Math.max(0, q - (type.freeUnits ?? 0))
  let total = billable * type.amount
  if (type.cap != null && type.cap > 0) total = Math.min(total, type.cap)
  return round2(total)
}

export function describeFineType(type: FineType): string {
  if (type.kind === 'fixed') return `${formatEuro(type.amount)} fixe`
  const parts = [`${formatEuro(type.amount)} / ${type.unitLabel || 'unité'}`]
  if (type.freeUnits) parts.push(`${type.freeUnits} ${type.unitLabel || 'unité'}s offertes`)
  if (type.cap) parts.push(`plafond ${formatEuro(type.cap)}`)
  return parts.join(' · ')
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
