#!/usr/bin/env bash
# Ignored Build Step của Vercel (vercel.json "ignoreCommand"): exit 0 = BỎ QUA build, exit 1 = build.
#
# Vì sao: main nhận 10-20 commit/ngày, phần lớn chỉ sửa bot (bot/, docs/, tests/...). Mỗi commit
# đều dựng lại web production -> tốn phút build, Deployment Storage, và làm cache ISR dựng lại từ đầu.
# Chỉ build khi có ÍT NHẤT MỘT file ngoài danh sách "không phải web" dưới đây thay đổi.
# Không chắc (thiếu SHA gốc, git lỗi) thì luôn build.
set -u

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  BASE="HEAD^"
  git cat-file -e "HEAD^{commit}" 2>/dev/null && git cat-file -e "HEAD^^{commit}" 2>/dev/null || { echo "[ignore] thiếu lịch sử git -> build"; exit 1; }
fi

FILES="$(git diff --name-only "$BASE" HEAD)" || { echo "[ignore] git diff lỗi -> build"; exit 1; }
[ -z "$FILES" ] && { echo "[ignore] không có file đổi -> build"; exit 1; }

while IFS= read -r f; do
  case "$f" in
    # web import trực tiếp từ đây (lib/parse-query.ts, app/nha-dat/[code], app/admin/dang-tin)
    bot/supabase/functions/_shared/extraction/*) echo "[ignore] web đổi: $f -> build"; exit 1 ;;
    bot/*|docs/*|tests/*|src/*|scripts/*|.claude/*|.github/*|.clinerules|cli.py|pyproject.toml|deno.lock) ;;
    *.md) [ "${f#*/}" = "$f" ] || { echo "[ignore] web đổi: $f -> build"; exit 1; } ;;   # chỉ bỏ qua .md ở gốc repo
    *) echo "[ignore] web đổi: $f -> build"; exit 1 ;;
  esac
done <<< "$FILES"

echo "[ignore] chỉ đổi bot/docs/tests ($BASE..HEAD) -> bỏ qua build"
exit 0
