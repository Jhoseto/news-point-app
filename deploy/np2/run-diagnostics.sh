#!/bin/bash
# Opt-in launch adapter. No changes to the application, worker, ingress or secrets.
set -euo pipefail
[[ "$(id -un)" == "np2" ]] || exit 1
APP="$HOME/newspoint-app"
DIR="$HOME/availability-diagnostics"
SERVICE="${1:-}"
case "$SERVICE" in
  web) PORT=3100 ;;
  studio) PORT=3101 ;;
  origin) ;;
  *) exit 2 ;;
esac
plain_next() {
  cd "$APP/apps/$SERVICE"
  exec "$HOME/node/bin/node" "$APP/apps/$SERVICE/node_modules/next/dist/bin/next" start --hostname 127.0.0.1 --port "$PORT"
}
unavailable() {
  echo '[np-diagnostics] launcher unavailable; inspect private diagnostics ownership/lock' >&2
  if [[ "$SERVICE" == "origin" ]]; then exit 1; else plain_next; fi
}
if [[ ! -f "$DIR/enabled" ]]; then
  if [[ "$SERVICE" == "origin" ]]; then exit 0; else plain_next; fi
fi
[[ ! -L "$DIR" && "$(stat -c '%a:%U' "$DIR")" == "700:np2" ]] || unavailable
[[ -f "$APP/scripts/diagnostics/journal.mjs" ]] || unavailable
# Keep the kernel lock in this shell: Node may close inherited descriptors.
# Forward normal stop signals and wait for the child before releasing the guard.
exec 9> "$DIR/$SERVICE.guard"
flock -n 9 || { [[ "$SERVICE" == "origin" ]] && exit 0; unavailable; }
if [[ -e "$DIR/$SERVICE.lock" ]]; then
  read -r OWNER < "$DIR/$SERVICE.lock" || unavailable
  [[ "$OWNER" =~ ^[0-9]+$ ]] || unavailable
  if kill -0 "$OWNER" 2>/dev/null; then unavailable; fi
  rm -- "$DIR/$SERVICE.lock"
fi
run_guarded() {
  "$@" &
  CHILD=$!
  trap 'kill -TERM "$CHILD" 2>/dev/null || true; wait "$CHILD" 2>/dev/null || true; exit 0' TERM INT
  set +e
  wait "$CHILD"
  RESULT=$?
  exit "$RESULT"
}
if [[ "$SERVICE" == "origin" ]]; then
  cd "$APP"
  run_guarded env NP_DIAGNOSTICS_DIR="$DIR" "$HOME/node/bin/node" --use-system-ca --dns-result-order=ipv4first \
    "$APP/scripts/diagnostics/availability.mjs" --profile origin --watch
fi
[[ -f "$APP/scripts/diagnostics/http-observer.mjs" ]] || unavailable
cd "$APP/apps/$SERVICE"
run_guarded env NP_REQUEST_DIAGNOSTICS=1 NP_DIAGNOSTICS_DIR="$DIR" NP_DIAGNOSTICS_SERVICE="$SERVICE" \
  "$HOME/node/bin/node" --use-system-ca --dns-result-order=ipv4first \
  --import "$APP/scripts/diagnostics/http-observer.mjs" \
  "$APP/apps/$SERVICE/node_modules/next/dist/bin/next" start --hostname 127.0.0.1 --port "$PORT"
