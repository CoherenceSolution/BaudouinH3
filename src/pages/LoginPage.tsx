import { useEffect, useState, type FormEvent } from 'react'
import { Mic, ShieldCheck, UserRound, ArrowLeft } from 'lucide-react'
import { useAuth, type Mode } from '@/auth/AuthProvider'
import { usePlayers } from '@/hooks/useData'
import { PinDialog } from '@/components/PinDialog'
import type { Player } from '@/lib/types'
import { Button, Input } from '@/components/ui'
import { cx, fullName, normalize, nickname } from '@/lib/format'
import { ErrorNotice } from '@/components/ErrorNotice'

type Step = 'choose' | 'public' | 'speaker' | 'staff'

export function LoginPage() {
  const { user, ensureAnonymous, setIdentity, loginStaff } = useAuth()
  const [step, setStep] = useState<Step>('choose')
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
        {step === 'choose' && (
          <div className="rise space-y-3">
            <RoleCard icon={UserRound} title="Je vote" desc="J’entre mon nom et je remplis mon vote." onClick={() => setStep('public')} />
            <RoleCard icon={Mic} title="Je suis l’orateur" desc="Je lis les votes et j’anime la soirée." onClick={() => setStep('speaker')} accent />
            <RoleCard icon={ShieldCheck} title="Administrateur" desc="Compte protégé par mot de passe." onClick={() => setStep('staff')} />
          </div>
        )}
        {(step === 'public' || step === 'speaker') && (
          <PickName mode={step} onBack={() => setStep('choose')} onPick={(id) => setIdentity(id, step)} />
        )}
        {step === 'staff' && <StaffLogin onBack={() => setStep('choose')} onLogin={loginStaff} />}
        {error && <p className="mt-4 text-center text-[13px] text-rose-300">{error}</p>}
      </div>
    </div>
  )
}

function RoleCard({ icon: Icon, title, desc, onClick, accent }: { icon: typeof UserRound; title: string; desc: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-px',
        accent ? 'border-accent/40 bg-accent/10 hover:bg-accent/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
      )}
    >
      <span className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl', accent ? 'bg-accent text-ink' : 'bg-white/10 text-white')}>
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-[16px] font-semibold">{title}</span>
        <span className="block text-[13px] text-slate-400">{desc}</span>
      </span>
    </button>
  )
}

function PickName({ mode, onBack, onPick }: { mode: Mode; onBack: () => void; onPick: (id: string) => void }) {
  const players = usePlayers()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [pinFor, setPinFor] = useState<Player | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const match = findPlayerByName(players.data, firstName, lastName)
    if (match === 'none') {
      setError(
        lastName.trim()
          ? 'Aucun joueur ne porte ce nom ni ce surnom. Vérifiez l’orthographe ou demandez au secrétaire de vous ajouter.'
          : 'Aucun joueur ne porte ce surnom. Ajoutez votre nom de famille, ou demandez au secrétaire de vous ajouter.',
      )
      return
    }
    if (match === 'ambiguous') {
      setError('Plusieurs joueurs correspondent. Indiquez le nom complet.')
      return
    }
    // Joueur avec droits de secrétaire : le code commun active les droits sur cet appareil.
    if (match.role === 'secretary') {
      setPinFor(match)
      return
    }
    onPick(match.id)
  }

  return (
    <form onSubmit={submit} className="rise card p-5 text-ink">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Retour
      </button>
      <h2 className="text-lg font-bold">{mode === 'speaker' ? 'Qui est l’orateur ce soir ?' : 'Qui êtes-vous ?'}</h2>
      <p className="mb-4 text-[13px] text-muted">Entrez votre prénom et votre nom tels qu’ils figurent dans l’équipe — ou simplement votre surnom. Vous resterez connecté sur cet appareil. Si l’admin vous a donné des droits de secrétaire, ils s’appliquent automatiquement.</p>
      {players.error ? (
        <ErrorNotice error={players.error} title="Impossible de charger la liste des joueurs" />
      ) : (
        <>
          <Input label="Prénom ou surnom" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" autoFocus required className="mb-3" />
          <Input label="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" error={error} hint={error ? undefined : 'Inutile si vous avez entré votre surnom'} />
        </>
      )}
      <Button type="submit" block size="lg" className="mt-4" variant={mode === 'speaker' ? 'accent' : 'primary'} disabled={players.loading || !firstName.trim()} loading={players.loading}>
        {mode === 'speaker' ? 'Entrer comme orateur' : 'Continuer'}
      </Button>
      {pinFor && (
        <PinDialog
          open
          playerLabel={fullName(pinFor)}
          onClose={() => { const id = pinFor.id; setPinFor(null); onPick(id) }}
          onSuccess={() => { const id = pinFor.id; setPinFor(null); onPick(id) }}
        />
      )}
    </form>
  )
}

/**
 * Retrouve un joueur par surnom, ou par prénom + nom, sans tenir compte des accents,
 * de la casse ni de l'ordre. Le surnom seul suffit (« Bubu ») : le nom reste facultatif.
 */
export function findPlayerByName(players: Player[], firstName: string, lastName: string): Player | 'none' | 'ambiguous' {
  const a = normalize(firstName)
  const b = normalize(lastName)
  if (!a && !b) return 'none'
  const typed = [a, b].filter(Boolean).join(' ')
  // Surnom : seul (« Bubu »), en deux morceaux (« Le » + « Chat ») ou suivi du nom de famille.
  const byNickname = players.filter((p) => {
    const n = normalize(nickname(p))
    return n !== '' && (n === typed || (n === a && (!b || normalize(p.lastName) === b)))
  })
  if (byNickname.length === 1) return byNickname[0]
  if (byNickname.length > 1) return 'ambiguous'
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
      <p className="mb-4 text-[13px] text-muted">Les secrétaires n’ont pas de mot de passe : ils se connectent avec « Je vote » et leurs droits suivent leur nom.</p>
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
