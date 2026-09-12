export function ConfigMissingPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card max-w-lg p-8">
        <h1 className="text-xl font-bold">Configuration Firebase manquante</h1>
        <p className="mt-2 text-[14px] text-muted">
          Copiez le fichier <code className="rounded bg-slate-100 px-1">.env.example</code> vers <code className="rounded bg-slate-100 px-1">.env</code> et renseignez les clés de votre projet Firebase
          (console Firebase → Paramètres du projet → Vos applications). Puis relancez l’application.
        </p>
      </div>
    </div>
  )
}
