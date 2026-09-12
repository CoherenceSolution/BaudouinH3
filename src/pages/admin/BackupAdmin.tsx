import { useState } from 'react'
import { Download, DatabaseBackup, CheckCircle2 } from 'lucide-react'
import { BACKUP_COLLECTIONS, buildBackup, downloadBlob } from '@/lib/backup'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import { Button, Card } from '@/components/ui'
import { ErrorNotice } from '@/components/ErrorNotice'

const LABELS: Record<string, string> = {
  players: 'Joueurs', staff: 'Comptes staff', matches: 'Matchs', tickets: 'Tickets de vote', likes: 'Coups de cœur', goals: 'Buts et passes',
  fineTypes: 'Barème des amendes', fines: 'Amendes', statCategories: 'Catégories maison', statEntries: 'Entrées de catégories', activity: 'Journal d’activité',
}

/** Sauvegarde complète : un ZIP avec un CSV par table et un export JSON. Réservé à l'admin. */
export function BackupAdmin() {
  const actor = useActor()
  const [step, setStep] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<Error | null>(null)

  async function run() {
    setError(null)
    setDone(null)
    try {
      const { blob, filename, counts } = await buildBackup(setStep)
      downloadBlob(blob, filename)
      setDone(counts)
      await logActivity(actor, 'create', 'backup', filename, `Sauvegarde téléchargée (${Object.values(counts).reduce((a, b) => a + b, 0)} enregistrements)`)
    } catch (e) {
      setError(e as Error)
    } finally {
      setStep(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100"><DatabaseBackup className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Sauvegarde locale de toute l’application</p>
            <p className="mt-1 text-[14px] text-muted">
              Télécharge une archive ZIP contenant un fichier CSV par table (lisible dans Excel) et un export JSON complet.
              Conservez-la sur votre ordinateur ou un disque externe. Rien n’est modifié dans l’application.
            </p>
            <ul className="mt-3 grid gap-1 text-[13px] text-ink-2 sm:grid-cols-2">
              {BACKUP_COLLECTIONS.map((c) => (
                <li key={c} className="flex items-center gap-2">
                  {done ? <CheckCircle2 className="size-3.5 text-accent-strong" /> : <span className="size-1.5 rounded-full bg-slate-300" />}
                  {LABELS[c]}{done ? <span className="text-muted">· {done[c]}</span> : null}
                </li>
              ))}
            </ul>
            <Button className="mt-4" icon={<Download className="size-4" />} loading={step !== null} onClick={run}>
              {step ? `Lecture : ${LABELS[step] ?? step}…` : 'Télécharger la sauvegarde (ZIP)'}
            </Button>
            {done && <p className="mt-2 text-[13px] text-accent-strong">Sauvegarde téléchargée. Chaque export compte comme quelques centaines de lectures sur le quota gratuit, une fois par semaine ne pose aucun problème.</p>}
          </div>
        </div>
      </Card>
      <ErrorNotice error={error} title="La sauvegarde a échoué" />
      <p className="text-[12px] text-muted">
        Conseil : faites une sauvegarde après chaque soirée de votes et à la fin de la saison. Le fichier <code>backup.json</code> contient
        les identifiants techniques nécessaires à une restauration à l’identique.
      </p>
    </div>
  )
}
