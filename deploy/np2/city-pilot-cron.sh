#!/usr/bin/env bash
# Isolated seven-day source feasibility pilot. Does not touch the live app.
set -euo pipefail

BASE="/home/np2/city-source-pilot"
MARKER="# NP_CITY_SOURCE_PILOT_20261024"
CRON_LINE="*/5 * * * * /bin/bash ${BASE}/cron.sh --tick >/dev/null 2>&1 ${MARKER}"

if [[ "$(id -un)" != "np2" ]]; then
  echo "Pilot must run as np2" >&2
  exit 1
fi

read_end() {
  local value
  value="$(cat "$BASE/until.epoch")"
  if [[ ! "$value" =~ ^[0-9]{10,}$ ]]; then
    echo "Invalid pilot end timestamp" >&2
    exit 1
  fi
  printf '%s' "$value"
}

remove_cron() (
  local old next count
  old="$(mktemp "$BASE/crontab-old.XXXXXX")"
  next="$(mktemp "$BASE/crontab-next.XXXXXX")"
  trap 'rm -f "$old" "$next"' EXIT
  crontab -l > "$old"
  count="$(grep -Fc "$MARKER" "$old" || true)"
  if [[ "$count" == "0" ]]; then return; fi
  if [[ "$count" != "1" ]]; then
    echo "Refusing to alter crontab: unexpected pilot entry count $count" >&2
    exit 1
  fi
  grep -Fv "$MARKER" "$old" > "$next" || true
  crontab "$next"
  if crontab -l | grep -F "$MARKER" > /dev/null; then
    echo "Pilot crontab removal did not verify" >&2
    exit 1
  fi
  printf '%s pilot cron removed\n' "$(date -u +%FT%TZ)" >> "$BASE/launcher.log"
)

case "${1:-}" in
  --install)
    [[ -f "$BASE/pilot.mjs" && -f "$BASE/until.epoch" ]] || { echo "Missing pilot bundle or end timestamp" >&2; exit 1; }
    [[ "$(read_end)" -gt "$(date -u +%s)" ]] || { echo "Pilot end is in the past" >&2; exit 1; }
    old="$(mktemp "$BASE/crontab-old.XXXXXX")"
    trap 'rm -f "$old"' EXIT
    crontab -l > "$old"
    if grep -Fq "$MARKER" "$old"; then echo "Pilot cron already installed" >&2; exit 1; fi
    { cat "$old"; printf '%s\n' "$CRON_LINE"; } | crontab -
    crontab -l | grep -F "$MARKER" > /dev/null || { echo "Pilot cron install did not verify" >&2; exit 1; }
    printf '%s pilot cron installed until %s\n' "$(date -u +%FT%TZ)" "$(read_end)" >> "$BASE/launcher.log"
    ;;
  --tick)
    printf '%s pilot tick\n' "$(date -u +%FT%TZ)" >> "$BASE/launcher.log"
    if [[ "$(date -u +%s)" -ge "$(read_end)" ]]; then
      remove_cron
      exit 0
    fi
    mkdir -p "$BASE/evidence"
    if ! CITY_PILOT_OUTPUT_DIR="$BASE/evidence" CITY_PILOT_QUIET_SKIPS=1 /usr/bin/flock -n "$BASE/runner.lock" /home/np2/node/bin/node --use-system-ca "$BASE/pilot.mjs" >> "$BASE/runner.log" 2>&1; then
      printf '%s pilot invocation failed or was already running\n' "$(date -u +%FT%TZ)" >> "$BASE/launcher.log"
    fi
    ;;
  --remove)
    remove_cron
    ;;
  *)
    echo "Usage: $0 --install|--tick|--remove" >&2
    exit 2
    ;;
esac
