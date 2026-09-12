import { useState, type FormEvent } from 'react'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { Rocket } from 'lucide-react'
import { auth, db } from '@/lib/firebase'
import { INITIAL_FINE_TYPES, INITIAL_PLAYERS, INITIAL_STAT_CATEGORIES } from '@/lib/initialPlayers'
import { Button, Input, Toggle } from '@/components/ui'
import { humanizeAuthError } from './LoginPage'

/**
 * Première installation : crée le compte administrateur et précharge
 * joueurs, barème d'amendes et catégories de statistiques.
 */
export function SetupPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [seed, setSeed] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      await updateProfile(cred.user, { displayName: displayName.trim() })
      const uid = cred.user.uid
      const batch = writeBatch(db)
      batch.set(doc(db, 'staff', uid), { email: email.trim(), displayName: displayName.trim(), role: 'admin', createdAt: serverTimestamp() })
      batch.set(doc(db, 'config', 'bootstrap'), { claimedBy: uid, at: serverTimestamp() })
      if (seed) {
        INITIAL_PLAYERS.forEach((p) => batch.set(doc(collection(db, 'players')), { ...p, active: true, createdAt: serverTimestamp() }))
        INITIAL_FINE_TYPES.forEach((t, i) => batch.set(doc(collection(db, 'fineTypes')), { description: '', unitLabel: '', freeUnits: 0, cap: null, ...t, active: true, order: i, createdAt: serverTimestamp() }))
        INITIAL_STAT_CATEGORIES.forEach((c, i) => batch.set(doc(collection(db, 'statCategories')), { ...c, active: true, order: i }))
      }
      batch.set(doc(collection(db, 'activity')), {
        actorUid: uid, actorName: displayName.trim(), actorRole: 'admin', action: 'create', entity: 'setup', entityId: uid,
        summary: 'Première installation de l’application', at: serverTimestamp(),
      })
      await batch.commit()
    } catch (err) {
      setError(humanizeAuthError(err))
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-4 py-10">
      <form onSubmit={submit} className="rise card w-full max-w-md p-6">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-ink"><Rocket className="size-6" /></div>
        <h1 className="text-xl font-bold">Première installation</h1>
        <p className="mb-5 mt-1 text-[14px] text-muted">Créez le compte administrateur. Cette étape n’apparaît qu’une seule fois.</p>
        <Input label="Votre nom" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="mb-3" />
        <Input label="Adresse e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mb-3" autoComplete="email" />
        <Input label="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} hint="6 caractères minimum" className="mb-4" autoComplete="new-password" />
        <Toggle checked={seed} onChange={setSeed} label={`Précharger l’équipe (${INITIAL_PLAYERS.length} joueurs), le barème d’amendes et les catégories`} />
        {error && <p className="mt-3 text-[13px] text-rose">{error}</p>}
        <Button type="submit" block size="lg" className="mt-5" loading={loading}>Créer l’administrateur</Button>
      </form>
    </div>
  )
}
