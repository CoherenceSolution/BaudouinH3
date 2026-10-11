import { useEffect, useState, type FormEvent } from 'react'
import { Mic, ShieldCheck, UserRound, ArrowLeft } from 'lucide-react'
import { useAuth, type Mode } from '@/auth/AuthProvider'
import { usePlayers } from '@/hooks/useData'
import type { Player } from '@/lib/types'
import { Button, Checkbox, Input } from '@/components/ui'
import { normalize, playerName } from '@/lib/format'
import { ErrorNotice } from '@/components/ErrorNotice'

type Step = 'member' | 'staff'

/**
 * Connexion. Tout le monde — votants, orateur, secrétaires — entre par le même formulaire :
 * prénom et nom. Les droits de secrétaire suivent le nom, sans code ni mot de passe,
 * et le rôle d'orateur se coche ici ou se prend plus tard depuis la page du match.
 */
export function LoginPage() {
  const { user, ensureAnonymous, setIdentity, loginStaff } = useAuth()
  const [step, setStep] = useState<Step>('member')
  const [error, setError] = useState('')

  // Connexion anonyme dès l'arrivée : nécessaire pour lire la liste des joueurs.
  useEffect(() => {
    if (!user) ensureAnonymous().catch((e) => setError(humanizeAuthError(e)))
  }, [user, ensureAnonymous])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-4 py-10 text-white">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-accent text-2xl font-black text-ink shadow-lg">H3</div>
        <h1 className="text-3xl font-bold tracking-tight">Baudouin H3</h1>
        <p className="mt-1 text-[14px] text-slate-400">Votes du match · Amendes · Buts et passes</p>
      </div>

      <div className="w-full max-w-md">
        {step === 'member' && (
          <>
            <PickName onPick={(id, mode) => setIdentity(id, mode)} />
            <button
              type="button"
              onClick={() => setStep('staff')}
              className="mx-auto mt-5 flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white"
            >
              <ShieldCheck className="size-4" /> Connexion administrateur
            </button>
          </>
        )}
        {step === 'staff' && <StaffLogin onBack={() => setStep('member')} onLogin={loginStaff} />}
        {error && <p className="mt-4 text-center text-[13px] text-rose-300">{error}</p>}
      </div>
    </div>
  )
}

function PickName({ onPick }: { onPick: (id: string, mode: Mode) => void }) {
  const players = usePlayers()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [speaker, setSpeaker] = useState(false)
  const [error, setError] = useState('')
  const mode: Mode = speaker ? 'speaker' : 'public'
  const speakers = players.data.filter((p) => p.canSpeak)

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const match = findPlayerByName(players.data, firstName, lastName)
    if (match === 'none') {
      setError('Aucun joueur ne porte ce nom. Vérifiez l’orthographe ou demandez au secrétaire de vous ajouter.')
      return
    }
    if (match === 'ambiguous') {
      setError('Plusieurs joueurs correspondent. Indiquez le nom complet.')
      return
    }
    // L'orateur est choisi parmi la liste désignée par l'admin.
    if (speaker && !match.canSpeak) {
      setError('Vous n’êtes pas dans la liste des orateurs désignés par l’admin. Décochez « Je suis l’orateur ce soir » pour voter normalement.')
      return
    }
    onPick(match.id, mode)
  }

  return (
    <form onSubmit={submit} className="rise card p-5 text-ink">
      <h2 className="flex items-center gap-2 text-lg font-bold"><UserRound className="size-5" /> Se connecter</h2>
      <p className="mb-4 text-[13px] text-muted">Entrez votre prénom et votre nom tels qu’ils figurent dans l’équipe. Vous resterez connecté sur cet appareil. Si l’admin vous a donné des droits de secrétaire, ils s’appliquent automatiquement.</p>
      {players.error ? (
        <ErrorNotice error={players.error} title="Impossible de charger la liste des joueurs" />
      ) : (
        <>
          <Input label="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" autoFocus required className="mb-3" />
          <Input label="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required error={error} />
        </>
      )}
      {speakers.length > 0 && <Checkbox
        checked={speaker}
        onChange={setSpeaker}
        label={<span className="inline-flex items-center gap-1.5"><Mic className="size-4" /> Je suis l’orateur ce soir</span>}
        hint={`Réservé aux orateurs désignés par l’admin (${speakers.map((p) => playerName(p)).join(', ')}). Vous votez comme tout le monde, et vous avez en plus la console pour lancer le minuteur, clôturer les votes et les lire.`}
        className="mt-4 rounded-xl bg-slate-50 p-3"
      />}
      <Button type="submit" block size="lg" className="mt-4" variant={speaker ? 'accent' : 'primary'} disabled={players.loading || !firstName.trim() || !lastName.trim()} loading={players.loading}>
        {speaker ? 'Entrer comme orateur' : 'Continuer'}
      </Button>
    </form>
  )
}

/**
 * Retrouve un joueur par prénom + nom, sans tenir compte des accents, de la casse ni de l'ordre.
 * Le surnom sert à l'affichage et à la recherche, jamais à la connexion.
 */
export function findPlayerByName(players: Player[], firstName: string, lastName: string): Player | 'none' | 'ambiguous' {
  const a = normalize(firstName)
  const b = normalize(lastName)
  if (!a || !b) return 'none'
  const exact = players.filter((p) => (normalize(p.firstName) === a && normalize(p.lastName) === b) || (normalize(p.firstName) === b && normalize(p.lastName) === a))
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return 'ambiguous'
  // Tolérance : nom composé saisi partiellement (« Van Bellinghen » ↔ « Bellinghen »)
  const loose = players.filter((p) => normalize(p.firstName) === a && (normalize(p.lastName).includes(b) || b.includes(normalize(p.lastName))))
  if (loose.length === 1) return loose[0]
  return loose.length > 1 ? 'ambiguous' : 'none'
}

function StaffLogin({ onBack, onLogin }: { onBack: () => void; onLogin: (e: string, p: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await onLogin(email.trim(), password)
    } catch (err) {
      setError(humanizeAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="rise card p-5 text-ink">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Retour
      </button>
      <h2 className="text-lg font-bold">Connexion administrateur</h2>
      <p className="mb-4 text-[13px] text-muted">Réservé à l’administrateur. Les secrétaires et l’orateur n’ont pas de mot de passe : ils se connectent avec leur prénom et leur nom, leurs droits suivent leur nom.</p>
      <Input label="Adresse e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mb-3" />
      <Input label="Mot de passe" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required error={error} />
      <Button type="submit" block size="lg" className="mt-4" loading={loading}>
        Se connecter
      </Button>
    </form>
  )
}

export function humanizeAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code.includes('invalid-credential') || code.includes('invalid-login') || code.includes('wrong-password') || code.includes('user-not-found')) return 'E-mail ou mot de passe incorrect.'
  if (code.includes('too-many-requests')) return 'Trop de tentatives, réessayez dans quelques minutes.'
  if (code.includes('network')) return 'Pas de connexion réseau.'
  if (code.includes('admin-restricted-operation') || code.includes('operation-not-allowed')) return 'Méthode de connexion non activée dans la console Firebase (voir README).'
  if (code.includes('email-already-in-use')) return 'Cette adresse e-mail est déjà utilisée.'
  if (code.includes('weak-password')) return 'Mot de passe trop court (6 caractères minimum).'
  return 'Une erreur est survenue. ' + ((e as Error)?.message ?? '')
}
