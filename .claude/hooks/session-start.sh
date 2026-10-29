#!/bin/bash
# Cài phụ thuộc cho phiên Claude Code trên cloud để chạy được test lõi Python (`bun run test:py`) và kiểm kiểu web (`bun run kieu`).
# Chỉ chạy trên cloud; cài lại được nhiều lần (pip / bun bỏ qua gói đã có).
set -euo pipefail

# Nhắc việc mỗi lần phiên bắt đầu / vừa compact (stdout của hook SessionStart vào ngữ cảnh agent): chat bị nén thì quên, docs thì không.
# Chỉ in tiêu đề 6 mục SRS mới nhất — chi tiết agent tự đọc ở docs/07 khi đụng tới.
if [ -f "${CLAUDE_PROJECT_DIR:-.}/docs/07-srs.md" ]; then
  echo "NHẮC (CLAUDE.md §7 'Vòng giao việc'): đọc mục SRS liên quan ở docs/07 TRƯỚC khi sửa; quyết định chủ dự án nói trong chat phải ghi vào docs/07 cùng commit."
  echo "6 mục SRS mới nhất:"
  # Mục không nằm theo thứ tự trong file → xếp theo mã: chuỗi z dài hơn rồi số lớn hơn là mới hơn (SRS-5.1zzzzzzz264 > …zzzzzzz99).
  python3 - "${CLAUDE_PROJECT_DIR:-.}/docs/07-srs.md" <<'PY' || true
import re, sys
ds = re.findall(r"^### (SRS-5\.1(z*)(\d*)([a-z]?)\b.*)$", open(sys.argv[1], encoding="utf-8").read(), re.M)
for d in sorted(ds, key=lambda m: (len(m[1]), int(m[2] or 0), m[3]), reverse=True)[:6]:
    print(d[0][:150])
PY
fi

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Lõi Python src/aioi — cùng lệnh với job CI `py` trong .github/workflows/kiem.yml
python3 -m pip install -q -e ".[dev]" httpx

# Web Next.js + script bot (bun.lock)
bun install

# pytest đọc pythonpath từ pyproject; lệnh rời (python -c "import aioi") cần thêm src
echo 'export PYTHONPATH="$CLAUDE_PROJECT_DIR/src${PYTHONPATH:+:$PYTHONPATH}"' >> "$CLAUDE_ENV_FILE"
