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
export TTS_CACHE_DIR="$(read_env TTS_CACHE_DIR "$HOME/.cache/newspoint/tts")"
case "$TTS_CACHE_DIR" in
  /*) ;;
  *) echo "TTS_CACHE_DIR must be an absolute private directory." >&2; exit 1 ;;
esac
TTS_CACHE_DIR="$(realpath -m -- "$TTS_CACHE_DIR")"
case "$TTS_CACHE_DIR/" in
  "$LIVE/"*|"$STAGE/"*|"$PREV/"*|"$HOME/public_html/"*|"$HOME/storage/"*)
    echo "TTS_CACHE_DIR must stay outside replaced/public directories." >&2; exit 1 ;;
esac

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
  bash "$SOURCE/deploy/np2/preserve-tts-cache.sh" "$LIVE/apps/web/.tts-cache" "$TTS_CACHE_DIR"
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
if ! bash "$SOURCE/deploy/np2/preserve-tts-cache.sh" "$LIVE/apps/web/.tts-cache" "$TTS_CACHE_DIR"; then
  echo "Could not preserve paid TTS recordings. Keeping the live checkout." >&2
  bash "$HOME/start-newspoint.sh"
  exit 1
fi
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
