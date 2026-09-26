import { useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useActor } from '@/hooks/useActor'
import { BrowserBlockedError, GITHUB_SYNC_URL, syncCalendarFromBrowser } from '@/lib/calendar/syncFromBrowser'
import { describeSummary } from '@/lib/calendar/plan'
import { Button, Modal } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

/**
 * « Mettre à jour le calendrier » : l'admin relit l'agenda Sportlink sans attendre la tâche du matin.
 * Si Sportlink refuse la lecture depuis le navigateur, on propose de lancer la même mise à jour sur GitHub.
 */
export function CalendarSyncButton() {
  const actor = useActor()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const summary = await syncCalendarFromBrowser(actor)
      toast(`Calendrier à jour : ${describeSummary(summary)}`)
    } catch (e) {
      if (e instanceof BrowserBlockedError) setBlocked(true)
      else {
        console.error(e)
        toast(e instanceof Error ? e.message : 'Mise à jour impossible', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  function openGitHub() {
    window.open(GITHUB_SYNC_URL, '_blank', 'noopener')
    setBlocked(false)
  }

  return (
    <>
      <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={busy} onClick={run}>
        Mettre à jour le calendrier
      </Button>
      <Modal
        open={blocked}
        onClose={() => setBlocked(false)}
        title="Mise à jour par GitHub"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setBlocked(false)}>Fermer</Button>
            <Button type="button" icon={<ExternalLink className="size-4" />} onClick={openGitHub}>Ouvrir GitHub</Button>
          </>
        }
      >
        <div className="space-y-2 text-[14px]">
          <p>Sportlink ne laisse pas l’application lire l’agenda directement depuis le navigateur.</p>
          <p>La même mise à jour se lance depuis GitHub, en un clic :</p>
          <ol className="list-decimal space-y-1 pl-5 text-ink-2">
            <li>Ouvrez GitHub (connecté à votre compte).</li>
            <li>Cliquez sur <strong>Run workflow</strong>, puis sur le bouton vert <strong>Run workflow</strong>.</li>
            <li>Environ une minute plus tard, les matchs sont à jour ici.</li>
          </ol>
          <p className="text-[12px] text-muted">La mise à jour automatique de chaque matin continue de fonctionner.</p>
        </div>
      </Modal>
    </>
  )
}
