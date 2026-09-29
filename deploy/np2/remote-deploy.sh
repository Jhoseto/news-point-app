#!/bin/bash
# Replace the np2 app with the uploaded source, then build and restart it.
# A failed build leaves the running site in place.
# Server .env.local is kept. The laptop env file is not part of the upload.
set -euo pipefail
if [[ "$(id -un)" != "np2" ]]; then
  echo "Refusing to run as $(id -un). This deploy is only for the np2 account." >&2
  exit 1
fi

SOURCE="$(cd "$(dirname "$0")/../.." && pwd)"
LIVE="$HOME/newspoint-app"
PREV="$HOME/newspoint-app.previous"
STAGE="$HOME/newspoint-app.next"

if [[ "$SOURCE" != "$LIVE" && "$SOURCE" != "$STAGE" ]]; then
  echo "Refusing to deploy from $SOURCE." >&2
  exit 1
fi
if [[ "$PREV" != "$HOME/newspoint-app.previous" || "$LIVE" != "$HOME/newspoint-app" ]]; then
  echo "Refusing to touch an unexpected path." >&2
  exit 1
fi

export PATH="$HOME/node/bin:$PATH"
export NODE_OPTIONS=--use-system-ca

if [[ "$SOURCE" != "$LIVE" && -f "$LIVE/.env.local" ]]; then
  cp -a "$LIVE/.env.local" "$SOURCE/.env.local"
fi
if [[ ! -f "$SOURCE/.env.local" ]]; then
  echo "Missing .env.local on the server. The live site was not replaced." >&2
  exit 1
fi

read_env() {
  local key="$1"
  local fallback="$2"
  local value
  value="$(grep -E "^${key}=" "$SOURCE/.env.local" | head -n 1 | cut -d= -f2- || true)"
  if [[ -z "$value" ]]; then
    printf '%s' "$fallback"
  else
    printf '%s' "$value"
  fi
}

export STUDIO_URL="$(read_env STUDIO_URL "http://127.0.0.1:3101")"
export WEB_URL="$(read_env WEB_URL "https://site44159-izdo3c.scloudsite101.com")"
export STUDIO_PUBLIC_URL="$(read_env STUDIO_PUBLIC_URL "${WEB_URL%/}/admin")"

cd "$SOURCE"
echo "Installing dependencies..."
if ! pnpm install; then
  echo "Install failed. The live site was not replaced." >&2
  exit 1
fi
echo "Building web and Studio..."
if ! pnpm --filter @newspoint/web build || ! pnpm --filter @newspoint/studio build; then
  echo "Build failed. The live site was not replaced." >&2
  exit 1
fi

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

install_starter() {
  cp "$LIVE/deploy/np2/start-newspoint.sh" "$HOME/start-newspoint.sh"
  chmod +x "$HOME/start-newspoint.sh" "$LIVE/deploy/np2/start-newspoint.sh"
}

if [[ "$SOURCE" == "$LIVE" ]]; then
  install_starter
  echo "Restarting the new site..."
  bash "$HOME/start-newspoint.sh"
  echo "DEPLOY_OK"
  exit 0
fi

echo "Build succeeded. Replacing the live copy with this source..."
stop_pid "$LIVE/logs/web.pid"
stop_pid "$LIVE/logs/studio.pid"
stop_pid "$LIVE/logs/worker.pid"
rm -rf "$PREV"
if [[ -d "$LIVE" ]]; then
  mv "$LIVE" "$PREV"
fi
if ! mv "$SOURCE" "$LIVE"; then
  echo "Could not move the new build into place. Restoring the previous site." >&2
  if [[ -d "$PREV" ]]; then
    mv "$PREV" "$LIVE"
    bash "$LIVE/deploy/np2/start-newspoint.sh" || true
  fi
  exit 1
fi
rm -rf "$PREV"
install_starter
echo "Restarting the new site..."
bash "$LIVE/deploy/np2/start-newspoint.sh"
echo "DEPLOY_OK"
