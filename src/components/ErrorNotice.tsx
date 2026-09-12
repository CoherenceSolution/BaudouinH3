import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

/** Message d'erreur lisible, avec le détail technique pour le diagnostic. */
export function ErrorNotice({ error, title = 'Impossible de charger les données' }: { error: Error | null | undefined; title?: string }) {
  if (!error) return null
  const code = (error as { code?: string }).code
  const hint =
    code === 'permission-denied'
      ? 'Accès refusé par les règles de sécurité. Vérifiez que vous êtes bien connecté avec le bon rôle.'
      : code === 'failed-precondition'
        ? 'La base de données a besoin d’un index. Le message ci-dessous contient le lien pour le créer.'
        : code === 'unavailable'
          ? 'Pas de connexion au serveur. Vérifiez le réseau.'
          : ''
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose/30 bg-rose-soft px-4 py-3 text-[13px] text-rose">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {hint && <p className="mt-0.5">{hint}</p>}
        <p className="mt-1 break-words font-mono text-[11px] opacity-80">{code ? `${code} — ` : ''}{error.message}</p>
      </div>
    </div>
  )
}

interface State { error: Error | null }

/** Évite qu'une erreur de rendu ne laisse une page blanche. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error(error)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg p-6">
          <ErrorNotice error={this.state.error} title="Une erreur est survenue dans cette page" />
          <button onClick={() => this.setState({ error: null })} className="mt-3 text-[13px] font-medium underline">
            Réessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
