#!/bin/bash
# Build and restart NewsPoint 2.0 inside the np2 account only.
set -euo pipefail
if [[ "$(id -un)" != "np2" ]]; then
  echo "Refusing to run as $(id -un). This deploy is only for the np2 account." >&2
  exit 1
fi

APP="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ "$APP" != "$HOME/newspoint-app" ]]; then
  echo "Refusing to deploy outside $HOME/newspoint-app (got $APP)." >&2
  exit 1
fi
if [[ ! -f "$APP/.env.local" ]]; then
  echo "Missing $APP/.env.local on the server. Not continuing." >&2
  exit 1
fi

export PATH="$HOME/node/bin:$PATH"
export NODE_OPTIONS=--use-system-ca
cd "$APP"

read_env() {
  local key="$1"
  local fallback="$2"
  local value
  value="$(grep -E "^${key}=" "$APP/.env.local" | head -n 1 | cut -d= -f2- || true)"
  if [[ -z "$value" ]]; then
    printf '%s' "$fallback"
  else
    printf '%s' "$value"
  fi
}

export STUDIO_URL="$(read_env STUDIO_URL "http://127.0.0.1:3101")"
export WEB_URL="$(read_env WEB_URL "https://site44159-izdo3c.scloudsite101.com")"
export STUDIO_PUBLIC_URL="$(read_env STUDIO_PUBLIC_URL "${WEB_URL%/}/admin")"

echo "Installing dependencies..."
pnpm install

echo "Building web and Studio..."
pnpm --filter @newspoint/web build
pnpm --filter @newspoint/studio build

cp "$APP/deploy/np2/start-newspoint.sh" "$HOME/start-newspoint.sh"
chmod +x "$HOME/start-newspoint.sh" "$APP/deploy/np2/start-newspoint.sh"
echo "Restarting the new site..."
bash "$HOME/start-newspoint.sh"
echo "DEPLOY_OK"
