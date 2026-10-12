#!/bin/bash
set -euo pipefail
cd /home/np2/newspoint-app
mkdir -p logs
if pgrep -f import-views.ts >/dev/null; then
  echo ALREADY_RUNNING
  pgrep -af import-views.ts
  exit 0
fi
export WP_IMPORT_VIEW_CONCURRENCY="${WP_IMPORT_VIEW_CONCURRENCY:-24}"
nohup pnpm --filter @newspoint/wp-import run wp:import:views \
  > logs/wp-view-import.out 2>&1 &
echo STARTED_PID=$!
sleep 3
pgrep -af import-views.ts || echo FAILED_TO_STAY_UP
tail -n 10 logs/wp-view-import.out || true
