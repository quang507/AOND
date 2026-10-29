#!/usr/bin/env bash
# sau-gop.sh — việc sau khi gộp PR vào main, MỘT lệnh (SRS-5.1zzzzzzz297, B1 gọn quy trình):
#   1. lần gộp có đổi src/aioi / bot/bridge-zca → chờ `tu-cai-vps.yml` tự gọi cai-vps, rồi chờ lượt cai-vps đó xong;
#   2. đồng bộ nhánh làm việc với main (`merge -s ours`: squash merge làm lịch sử lệch) và push.
#   bash scripts/sau-gop.sh            # trên nhánh làm việc, ngay sau khi gộp
set -euo pipefail
NHANH=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin main
SHA=$(git rev-parse origin/main)
if [ -n "$(git diff --name-only "$SHA~1" "$SHA" -- src/aioi bot/bridge-zca)" ]; then
  echo "== lần gộp đổi lõi / bridge: chờ tự cài VPS (${SHA:0:7})"
  bash "$(dirname "$0")/cho-workflow.sh" tu-cai-vps.yml main 30 "$SHA"
  bash "$(dirname "$0")/cho-workflow.sh" apply-migration.yml main 60 "$SHA"
else
  echo "== lần gộp không đổi lõi / bridge: không cài VPS"
fi
git merge -q -s ours origin/main -m "Merge origin/main (sau gộp ${SHA:0:7})"
git push -q origin "$NHANH"
echo "== $NHANH đã đồng bộ với main ${SHA:0:7}"
