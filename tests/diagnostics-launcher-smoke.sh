#!/bin/bash
# Synthetic HOME, no production ports/content/environment files.
set -euo pipefail
QA="${1:?QA directory required}"
[[ "$QA" == /home/np2/availability-diagnostics-qa-20261027.* && -d "$QA" ]] || exit 1
TEST_HOME="$(mktemp -d "$QA/launcher.XXXXXX")"
mkdir -p "$TEST_HOME/node/bin" "$TEST_HOME/newspoint-app/apps/web/node_modules/next/dist/bin" "$TEST_HOME/newspoint-app/logs" \
  "$TEST_HOME/newspoint-app/deploy/np2" "$TEST_HOME/newspoint-app/scripts"
ln -s /home/np2/node/bin/node "$TEST_HOME/node/bin/node"
cp -r "$QA/scripts/diagnostics" "$TEST_HOME/newspoint-app/scripts/"
cp "$QA/run-diagnostics.sh" "$TEST_HOME/newspoint-app/deploy/np2/"
printf 'setInterval(() => {}, 1000);\n' > "$TEST_HOME/newspoint-app/apps/web/node_modules/next/dist/bin/next"
mkdir -m 700 "$TEST_HOME/availability-diagnostics"
touch "$TEST_HOME/availability-diagnostics/enabled"
CHILD=''
trap 'if [[ -n "$CHILD" ]]; then kill "$CHILD" 2>/dev/null || true; wait "$CHILD" 2>/dev/null || true; fi' EXIT
launch() {
  HOME="$TEST_HOME" bash "$QA/run-diagnostics.sh" web > "$TEST_HOME/output" 2>&1 &
  CHILD=$!
  for i in {1..30}; do
    if [[ -s "$TEST_HOME/availability-diagnostics/web.lock" && -s "$TEST_HOME/availability-diagnostics/web.0.jsonl" ]]; then
      read -r OWNER < "$TEST_HOME/availability-diagnostics/web.lock"
      if kill -0 "$OWNER" 2>/dev/null && grep observer-ready "$TEST_HOME/availability-diagnostics/web.0.jsonl" | grep -q "\"pid\":$OWNER,"; then break; fi
    fi
    sleep 0.1
  done
  kill -0 "$CHILD"
  grep -q observer-ready "$TEST_HOME/availability-diagnostics/web.0.jsonl"
  if flock -n "$TEST_HOME/availability-diagnostics/web.guard" true; then echo 'guard not held' >&2; exit 1; fi
}
launch
kill "$CHILD"; wait "$CHILD" || true; CHILD=''
flock -n "$TEST_HOME/availability-diagnostics/web.guard" true
# Explicit dead-owner journal lock simulates an unclean shutdown.
printf '2147483647\n' > "$TEST_HOME/availability-diagnostics/web.lock"
launch
[[ -f "$TEST_HOME/availability-diagnostics/web.1.jsonl" ]]
kill "$CHILD"; wait "$CHILD" || true; CHILD=''
for starter in start-newspoint.sh remote-deploy.sh; do
  APP="$TEST_HOME/newspoint-app"
  LIVE="$APP"
  source <(sed -n '/^stop_pid() {/,/^}/p' "$QA/$starter")
  launch
  printf '%s\n' "$CHILD" > "$APP/logs/web.pid"
  stop_pid "$APP/logs/web.pid"
  wait "$CHILD" || true
  CHILD=''
  flock -n "$TEST_HOME/availability-diagnostics/web.guard" true
done
echo 'LAUNCHER_QA_OK guard-retained stale-lock-recovery rotation'
