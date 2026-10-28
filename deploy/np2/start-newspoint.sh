#!/bin/bash
# Restart only the NewsPoint 2.0 processes owned by this account.
# Does not touch the old WordPress site, its files, or its web server config.
set -euo pipefail
if [[ "$(id -un)" != "np2" ]]; then
  echo "Refusing to run as $(id -un). This script is only for the np2 account." >&2
  exit 1
fi

export PATH="$HOME/node/bin:$PATH"
export NODE_OPTIONS="--use-system-ca --dns-result-order=ipv4first"
APP="$HOME/newspoint-app"
mkdir -p "$APP/logs"

ensure_poll_env() {
  local env_file="$APP/.env.local"
  [[ -f "$env_file" ]] || return 0
  if grep -qE '^POLL_TRUSTED_IP_HEADER=' "$env_file"; then
    return 0
  fi
  {
    echo ""
    echo "# Poll voting: Apache injects X-Real-IP (see public_html/.htaccess)."
    echo "POLL_TRUSTED_IP_HEADER=x-real-ip"
  } >> "$env_file"
}

ensure_poll_env

# Validate/render before any running process is stopped. Do not trust forwarded
# headers for TLS: the origin must have HTTPS and Cloudflare must use Full (strict).
node "$APP/deploy/np2/render-ingress.mjs" "$APP/.env.local" > "$APP/logs/ingress.htaccess.next"
# Apache must be able to read the published rules even when the deploy shell has
# a private umask. This file contains public routing rules, never credentials.
chmod 644 "$APP/logs/ingress.htaccess.next"

stop_pid() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      local role="${file##*/}"
      role="${role%.pid}"
      if [[ "$role" == web || "$role" == studio ]]; then
        [[ "$(readlink "/proc/$pid/cwd")" == "$APP/apps/$role" ]] || return 1
        kill -TERM "$pid" 2>/dev/null || true
        for _ in {1..15}; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
        if kill -0 "$pid" 2>/dev/null; then
          for child in $(pgrep -P "$pid" || true); do
            [[ "$(readlink "/proc/$child/cwd")" == "$APP/apps/$role" ]] && kill -KILL "$child" 2>/dev/null || true
          done
          kill -KILL "$pid" 2>/dev/null || true
        fi
        rm -f "$file"
        return 0
      fi
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

stop_pid "$APP/logs/web.pid"
stop_pid "$APP/logs/studio.pid"
stop_pid "$APP/logs/worker.pid"
: > "$APP/logs/web.log"
: > "$APP/logs/studio.log"
: > "$APP/logs/worker.log"

NEXT_BIN="$(find "$APP/node_modules" -path '*/next/dist/bin/next' -type f | head -n 1)"
if [[ -z "$NEXT_BIN" ]]; then
  echo "next binary not found" >&2
  exit 1
fi

cd "$APP/apps/studio"
nohup bash "$APP/deploy/np2/run-diagnostics.sh" studio > "$APP/logs/studio.log" 2>&1 &
echo $! > "$APP/logs/studio.pid"

cd "$APP/apps/web"
nohup bash "$APP/deploy/np2/run-diagnostics.sh" web > "$APP/logs/web.log" 2>&1 &
echo $! > "$APP/logs/web.pid"

cd "$APP"
nohup "$HOME/node/bin/pnpm" --filter @newspoint/worker start > "$APP/logs/worker.log" 2>&1 &
echo $! > "$APP/logs/worker.pid"

for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if grep -q "Ready" "$APP/logs/web.log" && grep -q "Ready" "$APP/logs/studio.log"; then
    break
  fi
  sleep 1
done

# Only this account's public folder. The old site has its own document root.
mv "$APP/logs/ingress.htaccess.next" "$HOME/public_html/.htaccess"

echo "NewsPoint 2.0 restarted (web :3100, studio :3101, sync worker)."
