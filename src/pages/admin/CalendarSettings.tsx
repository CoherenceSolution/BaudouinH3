import { useEffect, useState } from 'react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { CalendarSync, CheckCircle2, AlertTriangle, Save } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useCalendarConfig } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import { formatDateTime } from '@/lib/format'
import type { CalendarConfig } from '@/lib/types'
import { describeSummary } from '@/lib/calendar/plan'
import { Button, Card, Input } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

/** Lien de l'agenda Sportlink : collé une fois, lu chaque jour par la synchronisation (GitHub Actions). */
export function CalendarSettings() {
  const config = useCalendarConfig()
  const actor = useActor()
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [keyword, setKeyword] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setUrl(config?.icalUrl ?? '')
    setKeyword(config?.teamKeyword ?? '')
  }, [config?.icalUrl, config?.teamKeyword])

  const validUrl = /^https?:\/\/\S+$/.test(url.trim())

  async function save() {
    setSaving(true)
    try {
      await setDoc(doc(db, 'config', 'calendar'), { icalUrl: url.trim(), teamKeyword: keyword.trim() || null, updatedAt: serverTimestamp() }, { merge: true })
      // Le lien contient un jeton : il n'apparaît jamais dans le journal.
      await logActivity(actor, 'update', 'settings', 'calendar', 'Lien de l’agenda Sportlink enregistré')
      toast('Agenda enregistré : il sera lu à la prochaine synchronisation')
    } catch (e) {
      console.error(e)
      toast('Enregistrement impossible', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 font-semibold"><CalendarSync className="size-4" /> Agenda Sportlink</h3>
      <p className="mb-4 mt-1 text-[13px] text-muted">
        Collez le lien de l’agenda de l’équipe (« ical-team »). Chaque matin, les matchs à venir sont ajoutés et tenus à jour :
        date, heure, lieu, adversaire. Les matchs passés, les scores et les votes ne sont jamais modifiés.
      </p>
      <div className="space-y-3">
        <Input label="Lien de l’agenda" type="url" placeholder="https://data.sportlink.com/ical-team?token=…" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false} />
        <Input label="Nom de l’équipe dans l’agenda" placeholder="Baudouin" value={keyword} onChange={(e) => setKeyword(e.target.value)} hint="Sert à reconnaître domicile et extérieur dans « Équipe A - Équipe B ». Par défaut : Baudouin." />
      </div>
      <SyncStatus lastSync={config?.lastSync} hasUrl={Boolean(config?.icalUrl)} />
      <div className="mt-4 flex justify-end">
        <Button icon={<Save className="size-4" />} loading={saving} onClick={save} disabled={!validUrl || config === undefined}>Enregistrer</Button>
      </div>
    </Card>
  )
}

/** Dernière synchronisation : réussie (avec le bilan) ou en échec (avec la raison). */
export function SyncStatus({ lastSync, hasUrl }: { lastSync: CalendarConfig['lastSync']; hasUrl: boolean }) {
  if (!hasUrl) return null
  if (!lastSync) return <p className="mt-3 text-[12px] text-muted">Pas encore synchronisé : première lecture demain matin, ou tout de suite avec « Mettre à jour le calendrier » (Gestion → Matchs).</p>
  const when = lastSync.at ? formatDateTime(lastSync.at.toDate()) : ''
  const by = lastSync.by && lastSync.by !== 'Agenda Sportlink' ? ` par ${lastSync.by}` : ''
  if (!lastSync.ok)
    return (
      <p className="mt-3 flex gap-1.5 text-[12px] text-rose">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Échec de la synchronisation {when && `du ${when}`}{by} : {lastSync.error ?? 'erreur inconnue'}
      </p>
    )
  return (
    <p className="mt-3 flex gap-1.5 text-[12px] text-muted">
      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent-strong" />
      Synchronisé {when && `le ${when}`}{by} · {describeSummary(lastSync)}
    </p>
  )
}
