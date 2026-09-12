import { useEffect, useState, type FormEvent } from 'react'
import { Mic, ShieldCheck, UserRound, ArrowLeft } from 'lucide-react'
import { useAuth, type Mode } from '@/auth/AuthProvider'
import { usePlayers } from '@/hooks/useData'
import { PlayerPicker } from '@/components/PlayerPicker'
import { Button, Input } from '@/components/ui'
import { cx } from '@/lib/format'

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
            <RoleCard icon={UserRound} title="Je vote" desc="Je choisis mon nom et je remplis mon ticket." onClick={() => setStep('public')} />
            <RoleCard icon={Mic} title="Je suis l’orateur" desc="Je lis les tickets et j’anime la soirée." onClick={() => setStep('speaker')} accent />
            <RoleCard icon={ShieldCheck} title="Secrétaire / Admin" desc="Amendes, buts, joueurs, gestion." onClick={() => setStep('staff')} />
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
  const [value, setValue] = useState<string | null>(null)
  return (
    <div className="rise card p-5 text-ink">
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Retour
      </button>
      <h2 className="text-lg font-bold">{mode === 'speaker' ? 'Qui est l’orateur ce soir ?' : 'Qui êtes-vous ?'}</h2>
      <p className="mb-4 text-[13px] text-muted">Choisissez votre nom complet dans la liste.</p>
      {players.loading ? (
        <p className="py-6 text-center text-[13px] text-muted">Chargement des joueurs…</p>
      ) : (
        <PlayerPicker players={players.data} value={value} onChange={setValue} />
      )}
      <Button block size="lg" className="mt-4" variant={mode === 'speaker' ? 'accent' : 'primary'} disabled={!value} onClick={() => value && onPick(value)}>
        {mode === 'speaker' ? 'Entrer comme orateur' : 'Continuer'}
      </Button>
    </div>
  )
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
      <h2 className="text-lg font-bold">Connexion staff</h2>
      <p className="mb-4 text-[13px] text-muted">Réservé aux secrétaires et à l’administrateur.</p>
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
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'E-mail ou mot de passe incorrect.'
  if (code.includes('too-many-requests')) return 'Trop de tentatives, réessayez dans quelques minutes.'
  if (code.includes('network')) return 'Pas de connexion réseau.'
  if (code.includes('admin-restricted-operation') || code.includes('operation-not-allowed')) return 'Méthode de connexion non activée dans la console Firebase (voir README).'
  if (code.includes('email-already-in-use')) return 'Cette adresse e-mail est déjà utilisée.'
  if (code.includes('weak-password')) return 'Mot de passe trop court (6 caractères minimum).'
  return 'Une erreur est survenue. ' + ((e as Error)?.message ?? '')
}
