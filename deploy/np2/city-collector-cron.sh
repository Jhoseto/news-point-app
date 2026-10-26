#!/usr/bin/env bash
# Permanent, separate city collection. Installation is an explicit release step.
# No web restart, WordPress access, publication-state change or migration.
set -euo pipefail
umask 077
[[ "$(id -un)" == "np2" ]] || { echo "Only np2 may run the city collector" >&2; exit 1; }
APP="/home/np2/newspoint-app"
DATA="/home/np2/city-guide-data"
MARKER="# NP_CITY_COLLECTOR"
SCRIPT="$APP/deploy/np2/city-collector-cron.sh"
LINE="*/5 * * * * /bin/bash $SCRIPT --tick >/dev/null 2>&1 $MARKER"

case "${1:-}" in
  --tick)
    [[ -d "$DATA" && -f "$APP/.env.local" ]] || { echo "City storage/config not prepared" >&2; exit 1; }
    # A tick during an existing run is skipped. The next tick recovers a failed process.
    exec 9>"$DATA/collector.lock"
    /usr/bin/flock -n 9 || exit 0
    cd "$APP/apps/worker"
    export NODE_ENV=production
    export CITY_GUIDE_STORAGE_DIR="$DATA"
    export CITY_PILOT_OUTPUT_DIR="$DATA"
    export CITY_PILOT_STORE_PREVIEW=1
    export CITY_PILOT_PERSIST_DB=1
    if ! /home/np2/node/bin/node --use-system-ca --import tsx src/city-pilot/cli.ts --release >>"$DATA/collector.log" 2>&1; then
      if [[ ! -f "$DATA/alert-active" ]]; then
        printf '%s\n' "$(date -u +%FT%TZ)" >"$DATA/alert-active"
        /usr/bin/logger -t newspoint-city "Collection failed or a source is degraded; see private city collector log" || true
      fi
      exit 1
    fi
    if [[ -f "$DATA/alert-active" ]]; then
      rm -f "$DATA/alert-active"
      /usr/bin/logger -t newspoint-city "City collection recovered" || true
    fi
    ;;
  --install|--remove)
    [[ -f "$APP/.env.local" && -f "$APP/apps/worker/src/city-pilot/cli.ts" ]] || { echo "Missing deployed collector/config" >&2; exit 1; }
    mkdir -p "$DATA"
    chmod 700 "$DATA"
    old="$(mktemp "$DATA/cron-old.XXXXXX")"
    next="$(mktemp "$DATA/cron-next.XXXXXX")"
    error="$(mktemp "$DATA/cron-error.XXXXXX")"
    trap 'rm -f "$old" "$next" "$error"' EXIT
    if ! LC_ALL=C crontab -l >"$old" 2>"$error"; then
      grep -Fqx "no crontab for np2" "$error" || { cat "$error" >&2; exit 1; }
    fi
    count="$(grep -Fc "$MARKER" "$old" || true)"
    [[ "$count" -le 1 ]] || { echo "Unexpected city cron entries; refusing to alter them" >&2; exit 1; }
    grep -Fv "$MARKER" "$old" >"$next" || true
    if [[ "$1" == "--install" ]]; then printf '%s\n' "$LINE" >>"$next"; fi
    crontab "$next"
    if [[ "$1" == "--install" ]]; then crontab -l | grep -Fqx "$LINE"; else ! crontab -l | grep -Fq "$MARKER"; fi
    ;;
  *) echo "Usage: $0 --install|--tick|--remove" >&2; exit 2 ;;
esac
