import { useMemo, useState } from 'react'
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStatCategories, useStatEntries } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import { deleteStatCategory } from '@/lib/statCategories'
import type { StatCategory } from '@/lib/types'
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui'
import { StatCategoryModal } from '@/components/StatCategoryModal'
import { useToast } from '@/components/ui/Toast'

/**
 * Listes maison (« Papa de l'année », « Homme du match »…) : création, renommage, suppression.
 * Supprimer une liste efface aussi toutes ses entrées.
 */
export function ListsAdmin() {
  const cats = useStatCategories()
  const entries = useStatEntries()
  const actor = useActor()
  const toast = useToast()
  const [editing, setEditing] = useState<StatCategory | null | 'new'>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries.data) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1)
    return m
  }, [entries.data])

  async function remove(c: StatCategory) {
    const n = counts.get(c.id) ?? 0
    const warning = n > 0 ? ` ${n} entrée${n > 1 ? 's' : ''} seront supprimées avec elle.` : ''
    if (!confirm(`Supprimer la liste « ${c.label} » ?${warning} Cette action est définitive.`)) return
    setBusy(c.id)
    try {
      const { removed, undo } = await deleteStatCategory(c.id)
      await logActivity(actor, 'delete', 'statCategory', c.id, `Liste supprimée : ${c.label}${removed ? ` (${removed} entrée${removed > 1 ? 's' : ''})` : ''}`, undefined, undo)
      toast('Liste supprimée')
    } catch (e) {
      console.error(e)
      toast('Suppression impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (cats.loading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          Les listes maison apparaissent dans <b>Stats</b> : « Papa de l’année », « Homme du match »… Vous pouvez les renommer, les masquer ou les supprimer.
        </p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Nouvelle liste</Button>
      </div>

      {cats.data.length === 0 ? (
        <EmptyState icon={<ListChecks className="size-6" />} title="Aucune liste maison" description="Créez par exemple « Homme du match » pour compter les nominations." action={<Button onClick={() => setEditing('new')}>Créer une liste</Button>} />
      ) : (
        <Card className="divide-y divide-line">
          {cats.data.map((c) => {
            const n = counts.get(c.id) ?? 0
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-[20px]">{c.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                    {c.label}
                    {!c.active && <Badge tone="neutral">Masquée</Badge>}
                  </div>
                  <div className="text-[12px] text-muted">{n} entrée{n > 1 ? 's' : ''}</div>
                </div>
                <button onClick={() => setEditing(c)} title="Modifier" className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"><Pencil className="size-4" /></button>
                <button onClick={() => remove(c)} disabled={busy === c.id} title="Supprimer la liste" className="rounded-lg p-1.5 text-muted transition hover:bg-rose-soft hover:text-rose disabled:opacity-40"><Trash2 className="size-4" /></button>
              </div>
            )
          })}
        </Card>
      )}

      <StatCategoryModal
        open={editing !== null}
        category={editing === 'new' ? null : editing}
        nextOrder={cats.data.length}
        entryCount={editing && editing !== 'new' ? (counts.get(editing.id) ?? 0) : 0}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
