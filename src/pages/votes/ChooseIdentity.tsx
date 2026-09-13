import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { Link2, UserRound } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/auth/AuthProvider'
import { useActor } from '@/hooks/useActor'
import { logActivity } from '@/lib/activity'
import type { Player } from '@/lib/types'
import { playerFullLabel } from '@/lib/format'
import { PlayerPicker } from '@/components/PlayerPicker'
import { Button, Card } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

/** Un secrétaire ou un admin est aussi un joueur : il relie son compte à son nom pour voter. */
export function ChooseIdentity({ players }: { players: Player[] }) {
  const { staff } = useAuth()
  const actor = useActor()
  const toast = useToast()
  const [value, setValue] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function link() {
    if (!value || !staff) return
    setLoading(true)
    try {
      await updateDoc(doc(db, 'staff', staff.id), { playerId: value })
      await logActivity(actor, 'update', 'staff', staff.id, `Compte ${staff.displayName} relié au joueur ${playerFullLabel(players.find((p) => p.id === value))}`)
      toast('Compte relié, vous pouvez voter')
    } catch (e) {
      console.error(e)
      toast('Liaison impossible', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100"><UserRound className="size-5" /></span>
        <div>
          <p className="font-semibold">Quel joueur êtes-vous ?</p>
          <p className="text-[13px] text-muted">
            Votre compte administrateur n’est pas encore relié à un joueur de l’équipe. Choisissez votre nom : vos votes, votre avatar et vos statistiques seront liés à votre compte sur tous vos appareils. L’admin peut modifier ce lien dans Gestion → Staff.
          </p>
        </div>
      </div>
      <PlayerPicker players={players} value={value} onChange={setValue} allowCreate compact />
      <Button block className="mt-4" icon={<Link2 className="size-4" />} disabled={!value} loading={loading} onClick={link}>
        Relier mon compte à ce joueur
      </Button>
    </Card>
  )
}
