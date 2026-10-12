#!/bin/bash
# Full WordPress archive → np2 DB + /home/np2/storage (Studio-equivalent WebP ladder).
set -euo pipefail
cd /home/np2/newspoint-app
mkdir -p logs
if pgrep -f import-archive.ts >/dev/null; then
  echo ALREADY_RUNNING
  pgrep -af import-archive.ts
  exit 0
fi
SINCE="${1:-2000-01-01T00:00:00Z}"
CONCURRENCY="${2:-20}"
export WP_IMPORT_PAUSE_MS="${WP_IMPORT_PAUSE_MS:-80}"
export WP_IMPORT_CONCURRENCY="$CONCURRENCY"
nohup pnpm --filter @newspoint/wp-import run wp:import:archive -- --since="$SINCE" --concurrency="$CONCURRENCY" \
  > logs/wp-archive-import.out 2>&1 &
echo STARTED_PID=$!
sleep 3
pgrep -af import-archive.ts || echo FAILED_TO_STAY_UP
tail -n 20 logs/wp-archive-import.out || true
