import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import type { Player } from '@/lib/types'
import { PlayerPicker } from '@/components/PlayerPicker'
import { Button, Card } from '@/components/ui'

/** Un secrétaire ou un admin est aussi un joueur : il choisit son nom pour voter. */
export function ChooseIdentity({ players }: { players: Player[] }) {
  const { setIdentity, staff } = useAuth()
  const [value, setValue] = useState<string | null>(null)
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100"><UserRound className="size-5" /></span>
        <div>
          <p className="font-semibold">Sous quel nom votez-vous ?</p>
          <p className="text-[13px] text-muted">
            Vous êtes connecté comme {staff?.role === 'admin' ? 'administrateur' : 'secrétaire'}. Choisissez votre nom de joueur pour remplir votre ticket ; il sera mémorisé sur cet appareil.
          </p>
        </div>
      </div>
      <PlayerPicker players={players} value={value} onChange={setValue} allowCreate compact />
      <Button block className="mt-4" disabled={!value} onClick={() => value && setIdentity(value, 'public')}>
        Continuer
      </Button>
    </Card>
  )
}
