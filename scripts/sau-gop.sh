#!/usr/bin/env bash
# sau-gop.sh — việc sau khi gộp PR vào main, MỘT lệnh (SRS-5.1zzzzzzz297, B1 gọn quy trình):
#   1. lần gộp có đổi src/aioi → đưa lõi lên máy 146 (scripts/trien-khai-146.sh; VPS bỏ từ 06/11, SRS-5.1zzzzzzz397);
#      đổi bot/bridge-zca → bridge trên 146 (C:\aond\bridge-zca) phải cập nhật tay;
#   2. đồng bộ nhánh làm việc với main (`merge -s ours`: squash merge làm lịch sử lệch) và push.
#   bash scripts/sau-gop.sh            # trên nhánh làm việc, ngay sau khi gộp
set -euo pipefail
NHANH=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin main
SHA=$(git rev-parse origin/main)
git merge -q -s ours origin/main -m "Merge origin/main (sau gộp ${SHA:0:7})"
git push -q origin "$NHANH"
echo "== $NHANH đã đồng bộ với main ${SHA:0:7}"
if [ -n "$(git diff --name-only "$SHA~1" "$SHA" -- src/aioi)" ]; then
  echo "== lần gộp đổi lõi: đưa main ${SHA:0:7} lên máy 146"
  DICH=$(mktemp -d); trap 'git worktree remove --force "$DICH" >/dev/null 2>&1 || true' EXIT
  git worktree add -q --detach "$DICH" "$SHA"
  (cd "$DICH" && bash scripts/trien-khai-146.sh)
fi
if [ -n "$(git diff --name-only "$SHA~1" "$SHA" -- bot/bridge-zca)" ]; then
  echo "== CHÚ Ý: lần gộp đổi bot/bridge-zca — bridge trên 146 chưa tự cập nhật"
fi
