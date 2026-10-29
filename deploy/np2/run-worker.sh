#!/bin/bash
# One supervised worker for this app. Never start an extra Smart-only processor.
set -euo pipefail
[[ "$(id -un)" == np2 ]] || exit 1
APP="$HOME/newspoint-app"
cd "$APP/apps/worker"
mkdir -p "$APP/logs"
exec 9> "$APP/logs/worker.guard"
flock -n 9 || { echo '[worker-supervisor] another worker supervisor is active'; exit 1; }
export NODE_ENV=production
child=""
stop() {
  trap - TERM INT
  if [[ -n "$child" ]]; then
    kill -TERM "$child" 2>/dev/null || true
    wait "$child" 2>/dev/null || true
  fi
  exit 0
}
trap stop TERM INT
while true; do
  "$HOME/node/bin/node" --use-system-ca --dns-result-order=ipv4first --conditions=react-server --import tsx src/index.ts &
  child=$!
  set +e
  wait "$child"
  result=$?
  set -e
  echo "[worker-supervisor] worker exited ($result); restarting in 5 seconds"
  child=""
  sleep 5 &
  child=$!
  wait "$child" || true
  child=""
done
