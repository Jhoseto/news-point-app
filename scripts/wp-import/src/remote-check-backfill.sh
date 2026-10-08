#!/bin/bash
set -euo pipefail
pgrep -af backfill || echo NO_PROC
echo OUT_LINES=$(wc -l < /home/np2/newspoint-app/logs/media-backfill.out 2>/dev/null || echo 0)
tail -n 8 /home/np2/newspoint-app/logs/media-backfill.out 2>/dev/null || true
node -e 'const p=require("/home/np2/newspoint-app/logs/media-responsive-backfill.json"); console.log("done="+p.doneIds.length+" opt="+p.optimized+" skip="+p.skipped+" fail="+p.failed.length+" at="+p.updatedAt)'
echo W_VARIANTS=$(find /home/np2/storage/news -name '*-w*.webp' | wc -l)
