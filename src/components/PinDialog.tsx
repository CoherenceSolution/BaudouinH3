import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { humanizePinError } from '@/lib/pinErrors'
import { Button, Input, Modal } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  /** Appelé après une connexion réussie */
  onSuccess: () => void
  playerLabel: string
}

/** Saisie du code commun des secrétaires. */
export function PinDialog({ open, onClose, onSuccess, playerLabel }: Props) {
  const { loginSecretary } = useAuth()
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await loginSecretary(pin)
      setPin('')
      onSuccess()
    } catch (err) {
      setError(humanizePinError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Code des secrétaires" footer={<><Button variant="ghost" onClick={onClose}>Plus tard</Button><Button type="submit" form="pin-form" loading={loading} disabled={pin.trim().length < 4}>Valider</Button></>}>
      <form id="pin-form" onSubmit={submit}>
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><KeyRound className="size-5" /></span>
          <p className="text-[14px] text-muted">{playerLabel} a des droits de secrétaire. Entrez le code commun fixé par l’administrateur pour les activer sur cet appareil.</p>
        </div>
        <Input label="Code" type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} error={error} autoFocus maxLength={8} />
      </form>
    </Modal>
  )
}
