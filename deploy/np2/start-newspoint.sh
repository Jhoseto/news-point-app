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

stop_pid() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
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
nohup "$HOME/node/bin/node" "$NEXT_BIN" start --hostname 127.0.0.1 --port 3101 > "$APP/logs/studio.log" 2>&1 &
echo $! > "$APP/logs/studio.pid"

cd "$APP/apps/web"
nohup "$HOME/node/bin/node" "$NEXT_BIN" start --hostname 127.0.0.1 --port 3100 > "$APP/logs/web.log" 2>&1 &
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
cat > "$HOME/public_html/.htaccess" << 'HT'
RewriteEngine On

# Single client IP for poll rate limits (overwrites any browser spoof).
SetEnvIf Remote_Addr "(.+)" NP_CLIENT_IP=$1
RequestHeader set X-Real-IP %{NP_CLIENT_IP}e env=NP_CLIENT_IP

RewriteRule ^index\.html$ http://127.0.0.1:3100/ [P,L]
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteRule ^ http://127.0.0.1:3100%{REQUEST_URI} [P,L,QSA]
HT

echo "NewsPoint 2.0 restarted (web :3100, studio :3101, sync worker)."
