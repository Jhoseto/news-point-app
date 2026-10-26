#!/usr/bin/env bash
# Separate city collection and watchdog; no web restart or publication changes.
set -euo pipefail
umask 077
[[ "$(id -un)" == "np2" ]] || { echo "Only np2 may run the city collector" >&2; exit 1; }
APP="/home/np2/newspoint-app"
BASE="/home/np2/city-guide-collector"
DATA="/home/np2/city-guide-data"
MARKER="# NP_CITY_COLLECTOR"
WATCH_MARKER="# NP_CITY_MONITOR"
SCRIPT="$BASE/cron.sh"
LINE="*/5 * * * * /bin/bash $SCRIPT --tick >/dev/null 2>&1 $MARKER"
WATCH_LINE="*/5 * * * * /bin/bash $SCRIPT --monitor >/dev/null 2>&1 $WATCH_MARKER"
NODE="/home/np2/node/bin/node"
case "${1:-}" in
 --tick|--bootstrap)
  [[ -d "$DATA" && -f "$APP/.env.local" ]] || exit 1
  exec 9>"$DATA/collector.lock"
  /usr/bin/flock -n 9 || exit 0
  date -u +%s >"$DATA/cycle.started"
  cd "$APP/apps/worker"
  export NODE_ENV=production CITY_GUIDE_STORAGE_DIR="$DATA" CITY_PILOT_OUTPUT_DIR="$DATA" CITY_PILOT_STORE_PREVIEW=1 CITY_PILOT_PERSIST_DB=1 CITY_PILOT_QUIET_SKIPS=1
  [[ ! -f "$DATA/certificates/intermediates.pem" ]] || export NODE_EXTRA_CA_CERTS="$DATA/certificates/intermediates.pem"
  args=(--release)
  if [[ "$1" == "--bootstrap" ]]; then
    sources="$("$NODE" --import tsx --input-type=module -e 'import {CITY_SOURCE_POLICY,citySourceInRelease} from "@newspoint/content/city-sources";process.stdout.write(Object.keys(CITY_SOURCE_POLICY).filter(citySourceInRelease).join(","))')"
    [[ -n "$sources" ]] || exit 1
    args+=(--refresh "--sources=$sources")
  fi
  result=0
  /usr/bin/timeout --signal=TERM --kill-after=30s 20m "$NODE" --use-system-ca --import tsx src/city-pilot/cli.ts "${args[@]}" >>"$DATA/collector.log" 2>&1 || result=$?
  date -u +%s >"$DATA/cycle.finished"
  printf '%s exit=%s\n' "$(date -u +%FT%TZ)" "$result" >>"$DATA/launcher.log"
  "$SCRIPT" --monitor || /usr/bin/logger -t newspoint-city "City monitor failed; inspect private monitor logs"
  exit "$result"
  ;;
 --monitor|--test-alert)
  [[ -d "$DATA" ]] || exit 1
  exec 8>"$DATA/monitor.lock"
  /usr/bin/flock -n 8 || exit 0
  args=()
  [[ "$1" != "--test-alert" ]] || args+=(--test)
  "$NODE" "$BASE/monitor.mjs" "${args[@]}" >>"$DATA/monitor.log" 2>&1
  ;;
 --install|--remove)
  [[ -f "$APP/.env.local" && -f "$APP/apps/worker/src/city-pilot/cli.ts" && -f "$BASE/monitor.mjs" ]] || { echo "Missing collector/config" >&2; exit 1; }
  mkdir -p "$DATA"; chmod 700 "$DATA"
  old="$(mktemp "$DATA/cron-old.XXXXXX")"; next="$(mktemp "$DATA/cron-next.XXXXXX")"; error="$(mktemp "$DATA/cron-error.XXXXXX")"
  trap 'rm -f "$old" "$next" "$error"' EXIT
  if ! LC_ALL=C crontab -l >"$old" 2>"$error"; then grep -Fqx "no crontab for np2" "$error" || { cat "$error" >&2; exit 1; }; fi
  for marker in "$MARKER" "$WATCH_MARKER"; do count="$(grep -Fc "$marker" "$old" || true)"; [[ "$count" -le 1 ]] || { echo "Duplicate city cron entries" >&2; exit 1; }; done
  grep -Fv -e "$MARKER" -e "$WATCH_MARKER" "$old" >"$next" || true
  if [[ "$1" == "--install" ]]; then printf '%s\n%s\n' "$LINE" "$WATCH_LINE" >>"$next"; fi
  crontab "$next"
  if [[ "$1" == "--install" ]]; then crontab -l | grep -Fqx "$LINE"; crontab -l | grep -Fqx "$WATCH_LINE"; fi
  ;;
 *) echo "Usage: $0 --install|--tick|--bootstrap|--monitor|--test-alert|--remove" >&2; exit 2;;
esac
