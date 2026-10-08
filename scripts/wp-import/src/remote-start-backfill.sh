#!/bin/bash
set -euo pipefail
cd /home/np2/newspoint-app
mkdir -p logs
if pgrep -f backfill-responsive-variants >/dev/null; then
  echo ALREADY_RUNNING
  pgrep -af backfill-responsive-variants
  exit 0
fi
nohup pnpm --filter @newspoint/wp-import run media:backfill -- --concurrency=2 \
  > logs/media-backfill.out 2>&1 &
echo STARTED_PID=$!
sleep 2
pgrep -af backfill-responsive-variants || echo FAILED_TO_STAY_UP
tail -n 15 logs/media-backfill.out || true
