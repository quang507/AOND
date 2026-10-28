#!/bin/bash
# Cài phụ thuộc cho phiên Claude Code trên cloud để chạy được test lõi Python (`bun run test:py`) và kiểm kiểu web (`bun run kieu`).
# Chỉ chạy trên cloud; cài lại được nhiều lần (pip / bun bỏ qua gói đã có).
set -euo pipefail

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
