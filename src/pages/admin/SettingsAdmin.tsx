import { useEffect, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { Save } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useSettings } from '@/hooks/useSettings'
import { useActor } from '@/hooks/useActor'
import { diffChanges, logActivity } from '@/lib/activity'
import { DEFAULT_CATEGORIES, DEFAULT_LIVE_ALERT_THRESHOLD, type VoteCategory } from '@/lib/types'
import { Button, Card, Input } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { CalendarSettings } from './CalendarSettings'

/** Paramètres modifiables par le staff : agenda Sportlink, catégories de vote, alerte du direct. */
export function SettingsAdmin() {
  const { categories, settings } = useSettings()
  const actor = useActor()
  const toast = useToast()
  const [form, setForm] = useState<Record<VoteCategory, { label: string; emoji: string }>>({
    best: { label: '', emoji: '' }, worst: { label: '', emoji: '' }, moment: { label: '', emoji: '' },
  })
  const [threshold, setThreshold] = useState(String(DEFAULT_LIVE_ALERT_THRESHOLD))
  const [loading, setLoading] = useState(false)
  const [savingAlert, setSavingAlert] = useState(false)

  useEffect(() => {
    setThreshold(String(settings.liveAlertThreshold ?? DEFAULT_LIVE_ALERT_THRESHOLD))
  }, [settings])

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
      const before: Record<string, string> = {}
      const after: Record<string, string> = {}
      const labels: Record<string, string> = {}
      categories.forEach((c) => {
        before[c.key] = `${c.emoji} ${c.label}`
        after[c.key] = `${form[c.key].emoji} ${form[c.key].label}`
        labels[c.key] = `Catégorie « ${c.label} »`
      })
      await logActivity(actor, 'update', 'settings', 'settings', `Catégories renommées : ${form.best.label} / ${form.worst.label} / ${form.moment.label}`, diffChanges(before, after, labels))
      toast('Paramètres enregistrés')
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function saveAlert() {
    const alert = Math.round(Number(threshold))
    if (!Number.isFinite(alert) || alert < 1) return
    setSavingAlert(true)
    try {
      await setDoc(doc(db, 'config', 'settings'), { liveAlertThreshold: alert }, { merge: true })
      await logActivity(actor, 'update', 'settings', 'settings', `Alerte du direct à ${alert} voix`, diffChanges({ n: settings.liveAlertThreshold ?? DEFAULT_LIVE_ALERT_THRESHOLD }, { n: alert }, { n: 'Seuil de l’alerte (voix)' }))
      toast('Paramètres enregistrés')
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setSavingAlert(false)
    }
  }

  return (
    <div className="space-y-4">
      <CalendarSettings />

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

      <Card className="p-5">
        <h3 className="font-semibold">Alerte en direct</h3>
        <p className="mb-4 mt-1 text-[13px] text-muted">
          Pendant la lecture, un joueur qui atteint ce nombre de voix dans une catégorie est signalé dans l’onglet « En direct ».
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Nombre de voix"
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            hint={`Par défaut : ${DEFAULT_LIVE_ALERT_THRESHOLD} voix`}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button icon={<Save className="size-4" />} loading={savingAlert} onClick={saveAlert}>Enregistrer</Button>
        </div>
      </Card>
    </div>
  )
}
