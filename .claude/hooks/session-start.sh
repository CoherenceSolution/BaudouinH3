#!/bin/bash
# Prépare la session pour que les vérifications tournent immédiatement, sans rien installer à la main
# et sans GitHub Actions :
#
#   npm run verify       types, tests unitaires, build            (~30 s)
#   npm run verify:e2e   scénario complet dans un navigateur       (~2 min)
#   npm run verify:all   les deux
#
# Synchrone : la session démarre une fois l'installation terminée, ce qui évite de lancer un test
# avant que les dépendances soient prêtes.
set -euo pipefail

# Uniquement dans les sessions distantes (Claude Code sur le web) ; en local, chacun gère son poste.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

echo "Installation des dépendances…"
npm install --no-audit --no-fund

# Navigateur du test de bout en bout : celui préinstallé dans l'environnement s'il existe,
# sinon celui que Playwright télécharge.
if [ -x /opt/pw-browsers/chromium ]; then
  echo 'export CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "${CLAUDE_ENV_FILE:-/dev/null}"
  echo "Navigateur : /opt/pw-browsers/chromium"
elif [ -d node_modules/playwright ]; then
  npx --yes playwright install chromium >/dev/null 2>&1 || echo "Navigateur Playwright non installé : npm run verify:e2e ne fonctionnera pas."
fi

# L'émulateur Firestore tourne sur Java.
if command -v java >/dev/null 2>&1; then
  echo "Java présent : les émulateurs Firebase peuvent démarrer."
else
  echo "Java absent : npm run verify:e2e ne fonctionnera pas (npm run verify reste disponible)."
fi

echo "Prêt. Vérifications : npm run verify · npm run verify:e2e"
