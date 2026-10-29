#!/usr/bin/env bash
# cho-workflow.sh — chờ lượt chạy MỚI NHẤT của một workflow GitHub Actions trên một nhánh xong, in kết luận + job hỏng.
# Dùng trong vòng giao việc của agent (CLAUDE.md §7): sau khi dispatch `kiem.yml` / `apply-migration.yml`.
#   bash scripts/cho-workflow.sh kiem.yml claude/ten-nhanh
#   bash scripts/cho-workflow.sh apply-migration.yml main
#   bash scripts/cho-workflow.sh apply-migration.yml main 60 <sha>   # chỉ nhận lượt chạy trên đúng commit đó (SRS-5.1zzzzzzz297)
# Repo PUBLIC nên đọc API không cần token. Thoát 0 = success, 1 = hỏng / hết giờ.
set -uo pipefail
WF="${1:?tên workflow, vd kiem.yml}"; NHANH="${2:?tên nhánh}"; LAN="${3:-60}"   # LAN × 20 s = tối đa 20 phút
SHA="${4:-}"   # có SHA: lượt mới nhất chưa phải của commit này (chưa kịp hiện) thì chờ tiếp, không lấy lượt cũ
REPO="quang507/AOND"; API="https://api.github.com/repos/$REPO/actions"
sleep 30   # cho lượt vừa dispatch kịp hiện
for _ in $(seq 1 "$LAN"); do
  r=$(curl -s "$API/workflows/$WF/runs?branch=$NHANH&per_page=1" \
      | python3 -c "import sys,json;r=json.load(sys.stdin)['workflow_runs'][0];print(r['id'],r['head_sha'][:7],r['status'],r['conclusion'])")
  if [ -n "$SHA" ] && [ "$(echo "$r" | cut -d' ' -f2)" != "${SHA:0:7}" ]; then sleep 20; continue; fi
  case "$r" in
    *" completed success") echo "$r"; exit 0 ;;
    *" completed "*) echo "$r"
       curl -s "$API/runs/${r%% *}/jobs" | python3 -c "
import sys,json
for j in json.load(sys.stdin)['jobs']:
  if j['conclusion'] not in ('success','skipped'): print('  hỏng:', j['id'], j['name'])"
       exit 1 ;;
  esac
  sleep 20
done
echo "hết giờ chờ: $r"; exit 1
