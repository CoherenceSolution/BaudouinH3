import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { cx } from '@/lib/format'

type Kind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: Kind; message: string }

const ToastCtx = createContext<(message: string, kind?: Kind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((message: string, kind: Kind = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'rise pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-medium shadow-lg',
              t.kind === 'success' && 'bg-ink text-white',
              t.kind === 'error' && 'bg-rose text-white',
              t.kind === 'info' && 'bg-surface text-ink border border-line',
            )}
          >
            {t.kind === 'success' ? <CheckCircle2 className="size-4 text-accent" /> : t.kind === 'error' ? <AlertCircle className="size-4" /> : <Info className="size-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
