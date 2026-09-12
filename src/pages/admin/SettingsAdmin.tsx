import { useEffect, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { Save } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useSettings } from '@/hooks/useSettings'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import { DEFAULT_CATEGORIES, type VoteCategory } from '@/lib/types'
import { Button, Card, Input } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

/** Paramètres modifiables par le staff : libellés et emojis des trois catégories de vote. */
export function SettingsAdmin() {
  const { categories } = useSettings()
  const actor = useActor()
  const toast = useToast()
  const [form, setForm] = useState<Record<VoteCategory, { label: string; emoji: string }>>({
    best: { label: '', emoji: '' }, worst: { label: '', emoji: '' }, moment: { label: '', emoji: '' },
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setForm({
      best: { label: categories[0].label, emoji: categories[0].emoji },
      worst: { label: categories[1].label, emoji: categories[1].emoji },
      moment: { label: categories[2].label, emoji: categories[2].emoji },
    })
  }, [categories])

  async function save() {
    setLoading(true)
    try {
      await setDoc(doc(db, 'config', 'settings'), { categories: form }, { merge: true })
      await logActivity(actor, 'update', 'settings', 'settings', `Catégories renommées : ${form.best.label} / ${form.worst.label} / ${form.moment.label}`)
      toast('Paramètres enregistrés')
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-semibold">Catégories de vote</h3>
        <p className="mb-4 mt-1 text-[13px] text-muted">Ces noms apparaissent partout : formulaire de vote, lecture, classements, rétrospective. Les votes déjà enregistrés sont conservés.</p>
        <div className="space-y-3">
          {DEFAULT_CATEGORIES.map((c) => (
            <div key={c.key} className="grid grid-cols-[72px_1fr] gap-3">
              <Input label="Emoji" value={form[c.key].emoji} maxLength={4} onChange={(e) => setForm((f) => ({ ...f, [c.key]: { ...f[c.key], emoji: e.target.value } }))} />
              <Input label={`Catégorie ${c.key === 'best' ? '1' : c.key === 'worst' ? '2' : '3'} (par défaut : ${c.label})`} value={form[c.key].label} onChange={(e) => setForm((f) => ({ ...f, [c.key]: { ...f[c.key], label: e.target.value } }))} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button icon={<Save className="size-4" />} loading={loading} onClick={save} disabled={Object.values(form).some((v) => !v.label.trim())}>Enregistrer</Button>
        </div>
      </Card>
      <p className="text-[12px] text-muted">Chaque catégorie désigne un joueur, accompagné d’un commentaire lu à voix haute.</p>
    </div>
  )
}
