export function humanizePinError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code === 'app/no-secretary-access') return 'L’administrateur n’a pas encore défini de code.'
  if (code.includes('invalid-credential') || code.includes('invalid-login') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Code incorrect.'
  if (code.includes('too-many-requests')) return 'Trop de tentatives, réessayez dans quelques minutes.'
  if (code.includes('network')) return 'Pas de connexion réseau.'
  if (code.startsWith('auth/')) return 'Code incorrect.'
  return (e as Error)?.message || 'Une erreur est survenue.'
}
