import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { FineType } from '@/lib/types'
import { describeFineType } from '@/lib/fines'
import { Badge, Button, Card, Input, Modal, Select, Toggle } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

/** Barème des amendes : lecture publique, édition par le staff. */
export function FineTypesEditor({ types, isStaff }: { types: FineType[]; isStaff: boolean }) {
  const [editing, setEditing] = useState<FineType | null | 'new'>(null)
  const actor = useActor()
  const toast = useToast()

  async function remove(t: FineType) {
    if (!confirm(`Supprimer « ${t.label} » du barème ? Les amendes déjà infligées sont conservées.`)) return
    try {
      await deleteDoc(doc(db, 'fineTypes', t.id))
      await logActivity(actor, 'delete', 'fineType', t.id, `Type d’amende supprimé : ${t.label}`)
      toast('Supprimé du barème')
    } catch (e) {
      console.error(e)
      toast('Suppression impossible', 'error')
    }
  }

  return (
    <div>
      {isStaff && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Ajouter au barème</Button>
        </div>
      )}
      <Card className="divide-y divide-line">
        {types.length === 0 && <p className="px-5 py-8 text-center text-[14px] text-muted">Le barème est vide.</p>}
        {types.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[15px] font-semibold">{t.label} {!t.active && <Badge>Inactif</Badge>}</div>
              <div className="text-[13px] text-muted">{describeFineType(t)}{t.description ? ` · ${t.description}` : ''}</div>
            </div>
            {isStaff && (
              <div className="flex gap-1">
                <button onClick={() => setEditing(t)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink" title="Modifier"><Pencil className="size-4" /></button>
                <button onClick={() => remove(t)} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-rose" title="Supprimer"><Trash2 className="size-4" /></button>
              </div>
            )}
          </div>
        ))}
      </Card>
      <FineTypeModal open={editing !== null} type={editing === 'new' ? null : editing} nextOrder={types.length} onClose={() => setEditing(null)} />
    </div>
  )
}

function FineTypeModal({ open, type, nextOrder, onClose }: { open: boolean; type: FineType | null; nextOrder: number; onClose: () => void }) {
  const actor = useActor()
  const toast = useToast()
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<FineType['kind']>('fixed')
  const [amount, setAmount] = useState('2')
  const [unitLabel, setUnitLabel] = useState('minute')
  const [freeUnits, setFreeUnits] = useState('0')
  const [cap, setCap] = useState('')
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [key, setKey] = useState<string | null>(null)

  // Réinitialise le formulaire à chaque ouverture
  const openKey = open ? (type?.id ?? 'new') : null
  if (openKey !== key) {
    setKey(openKey)
    setLabel(type?.label ?? '')
    setDescription(type?.description ?? '')
    setKind(type?.kind ?? 'fixed')
    setAmount(String(type?.amount ?? 2))
    setUnitLabel(type?.unitLabel || 'minute')
    setFreeUnits(String(type?.freeUnits ?? 0))
    setCap(type?.cap != null ? String(type.cap) : '')
    setActive(type?.active ?? true)
  }

  async function submit() {
    setLoading(true)
    const data = {
      label: label.trim(),
      description: description.trim(),
      kind,
      amount: Number(amount || 0),
      unitLabel: kind === 'perUnit' ? unitLabel.trim() : '',
      freeUnits: kind === 'perUnit' ? Number(freeUnits || 0) : 0,
      cap: kind === 'perUnit' && cap !== '' ? Number(cap) : null,
      active,
    }
    try {
      if (type) {
        await updateDoc(doc(db, 'fineTypes', type.id), data)
        await logActivity(actor, 'update', 'fineType', type.id, `Barème modifié : ${data.label}`)
      } else {
        const ref = await addDoc(collection(db, 'fineTypes'), { ...data, order: nextOrder, createdAt: serverTimestamp() })
        await logActivity(actor, 'create', 'fineType', ref.id, `Barème : ajout de « ${data.label} »`)
      }
      toast('Barème enregistré')
      onClose()
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={type ? 'Modifier le type d’amende' : 'Nouveau type d’amende'} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={loading} disabled={!label.trim()} onClick={submit}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <Input label="Libellé" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. : Retard, Carton jaune…" />
        <Input label="Description (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select label="Mode de calcul" value={kind} onChange={(e) => setKind(e.target.value as FineType['kind'])}>
          <option value="fixed">Montant fixe</option>
          <option value="perUnit">Par unité (ex. par minute de retard)</option>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label={kind === 'fixed' ? 'Montant (€)' : 'Montant par unité (€)'} type="number" step="0.5" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          {kind === 'perUnit' && <Input label="Unité" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="minute" />}
        </div>
        {kind === 'perUnit' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Unités offertes" type="number" min={0} value={freeUnits} onChange={(e) => setFreeUnits(e.target.value)} hint="Ex. : 5 premières minutes" />
            <Input label="Plafond (€)" type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} hint="Vide = sans plafond" />
          </div>
        )}
        <Toggle checked={active} onChange={setActive} label="Actif (proposé lors de l’ajout d’une amende)" />
      </div>
    </Modal>
  )
}
