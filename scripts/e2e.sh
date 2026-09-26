#!/usr/bin/env bash
# Test de bout en bout : joue une soirée complète dans un vrai navigateur, contre des émulateurs
# Firebase locaux. Aucune donnée réelle n'est touchée, aucun service payant n'est utilisé.
#
#   npm run verify:e2e
#
# Le script démarre les émulateurs et le serveur de développement, attend qu'ils répondent,
# vide les données de test, joue le scénario e2e/scenario.mjs, puis arrête tout.
# Les captures d'écran atterrissent dans e2e/shots/.
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
LOGS="$ROOT/node_modules/.cache/e2e"
mkdir -p "$LOGS" e2e/shots

PROJECT="demo-baudouin-h3"
FIRESTORE_PORT=8080
AUTH_PORT=9099
VITE_PORT=5173

# Arrêt fiable : les émulateurs lancent des processus enfants (Java, Node) qui survivent à un simple
# kill du parent et gardent les ports occupés. On tue donc le groupe de processus entier.
stop_group() {
  local pid=$1
  [ -n "$pid" ] || return 0
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.5
  done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  stop_group "${VITE_PID:-}"
  stop_group "${EMU_PID:-}"
  exit $code
}
trap cleanup EXIT INT TERM

fail() {
  echo
  echo "❌ $1"
  [ -n "${2:-}" ] && { echo "--- $2 ---"; tail -25 "$2"; }
  exit 1
}

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&-; return 0; } || return 1; }

for port in "$FIRESTORE_PORT" "$AUTH_PORT" "$VITE_PORT"; do
  port_busy "$port" && fail "Le port $port est déjà utilisé. Arrêtez l'émulateur ou le serveur qui tourne déjà."
done

# Les émulateurs Firestore ont besoin de Java.
command -v java >/dev/null || fail "Java est nécessaire pour l'émulateur Firestore (apt install default-jre)."

# Le navigateur : celui préinstallé dans l'environnement, sinon celui de Playwright.
if [ -z "${CHROMIUM_PATH:-}" ] && [ -x /opt/pw-browsers/chromium ]; then
  export CHROMIUM_PATH=/opt/pw-browsers/chromium
fi

echo "▶ Démarrage des émulateurs Firebase (projet $PROJECT)"
setsid npx --yes firebase-tools emulators:start --only auth,firestore \
  --project "$PROJECT" --config firebase.e2e.json > "$LOGS/emulators.log" 2>&1 &
EMU_PID=$!

for _ in $(seq 1 60); do
  grep -q "All emulators ready" "$LOGS/emulators.log" 2>/dev/null && break
  kill -0 "$EMU_PID" 2>/dev/null || fail "Les émulateurs se sont arrêtés." "$LOGS/emulators.log"
  sleep 2
done
grep -q "All emulators ready" "$LOGS/emulators.log" || fail "Les émulateurs n'ont pas démarré à temps." "$LOGS/emulators.log"

echo "▶ Démarrage du serveur de développement"
setsid npx vite --mode e2e --port "$VITE_PORT" --strictPort > "$LOGS/vite.log" 2>&1 &
VITE_PID=$!

for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$VITE_PORT/" 2>/dev/null)" = "200" ] && break
  kill -0 "$VITE_PID" 2>/dev/null || fail "Le serveur de développement s'est arrêté." "$LOGS/vite.log"
  sleep 1
done
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$VITE_PORT/" 2>/dev/null)" = "200" ] \
  || fail "Le serveur de développement n'a pas démarré à temps." "$LOGS/vite.log"

echo "▶ Remise à zéro des données de test"
curl -s -X DELETE "http://127.0.0.1:$FIRESTORE_PORT/emulator/v1/projects/$PROJECT/databases/(default)/documents" -o /dev/null
curl -s -X DELETE "http://127.0.0.1:$AUTH_PORT/emulator/v1/projects/$PROJECT/accounts" -o /dev/null

echo "▶ Scénario complet dans le navigateur"
if node e2e/scenario.mjs; then
  echo
  echo "✅ Test de bout en bout réussi. Captures dans e2e/shots/"
else
  fail "Le scénario a échoué (détail ci-dessus). Journaux : $LOGS/"
fi
