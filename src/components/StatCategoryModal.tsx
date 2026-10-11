import { useState } from 'react'
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { Trash2 } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useActor } from '@/hooks/useActor'
import { diffChanges, logActivity, readBefore, undoCreate, undoUpdate } from '@/lib/activity'
import { deleteStatCategory } from '@/lib/statCategories'
import type { StatCategory } from '@/lib/types'
import { Button, Input, Modal } from './ui'
import { useToast } from './ui/Toast'

interface Props {
  open: boolean
  /** null : création d'une nouvelle liste. */
  category: StatCategory | null
  nextOrder: number
  /** Nombre d'entrées déjà enregistrées dans cette liste (affiché avant suppression). */
  entryCount?: number
  onClose: () => void
  onDeleted?: () => void
}

/** Création, renommage et suppression d'une liste maison (catégorie de statistiques). */
export function StatCategoryModal({ open, category, nextOrder, entryCount = 0, onClose, onDeleted }: Props) {
  const actor = useActor()
  const toast = useToast()
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState('🏅')
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const openKey = open ? (category?.id ?? 'new') : null
  if (openKey !== key) {
    setKey(openKey)
    setLabel(category?.label ?? '')
    setEmoji(category?.emoji ?? '🏅')
    setActive(category?.active ?? true)
  }

  async function submit() {
    setLoading(true)
    try {
      if (category) {
        const next = { label: label.trim(), emoji: emoji.trim() || '🏅', active }
        const before = await readBefore(`statCategories/${category.id}`)
        await updateDoc(doc(db, 'statCategories', category.id), next)
        const changes = diffChanges({ ...category }, next, { label: 'Nom', emoji: 'Emoji', active: 'Visible' })
        await logActivity(actor, 'update', 'statCategory', category.id, `Liste modifiée : ${label.trim()}`, changes, undoUpdate(`statCategories/${category.id}`, before, Object.keys(next)))
      } else {
        const ref = await addDoc(collection(db, 'statCategories'), { label: label.trim(), emoji: emoji.trim() || '🏅', active, order: nextOrder })
        await logActivity(actor, 'create', 'statCategory', ref.id, `Liste créée : ${label.trim()}`, undefined, undoCreate(`statCategories/${ref.id}`))
      }
      toast('Liste enregistrée')
      onClose()
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function remove() {
    if (!category) return
    const warning = entryCount > 0 ? ` ${entryCount} entrée${entryCount > 1 ? 's' : ''} seront supprimées avec elle.` : ''
    if (!confirm(`Supprimer la liste « ${category.label} » ?${warning} Cette action est définitive.`)) return
    setLoading(true)
    try {
      const { removed, undo } = await deleteStatCategory(category.id)
      await logActivity(actor, 'delete', 'statCategory', category.id, `Liste supprimée : ${category.label}${removed ? ` (${removed} entrée${removed > 1 ? 's' : ''})` : ''}`, undefined, undo)
      toast('Liste supprimée')
      onDeleted?.()
      onClose()
    } catch (e) {
      console.error(e)
      toast('Suppression impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? 'Modifier la liste' : 'Nouvelle liste'}
      footer={
        <>
          {category && <Button variant="danger" className="mr-auto" icon={<Trash2 className="size-4" />} loading={loading} onClick={remove}>Supprimer</Button>}
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button loading={loading} disabled={!label.trim()} onClick={submit}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <Input label="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
          <Input label="Nom" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. : Papa de l’année, Homme du match" />
        </div>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-lime-500" /> Visible pour tous
        </label>
        {category && <p className="text-[12px] text-muted">{entryCount} entrée{entryCount > 1 ? 's' : ''} enregistrée{entryCount > 1 ? 's' : ''} dans cette liste.</p>}
      </div>
    </Modal>
  )
}
