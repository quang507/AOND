#!/usr/bin/env bash
# ban-thu-khach-ao.sh — 5 khách ẢO có cảm xúc (model đóng vai) chat với lõi production, giám khảo chấm (SRS-5.1zzzzzzz213). Chạy từ
# máy cá nhân (bash bot/tests/ban-thu-khach-ao.sh). Lõi chỉ nghe 127.0.0.1:8000 trên máy 146 nên mở đường hầm ssh (lib/may146.sh);
# khoá Anthropic lấy từ Vault (ANTHROPIC_API_KEY), không in ra. ID thử `thu-ka-<n>-<run>`, dọn cuối script kể cả khi hỏng.
# Tiền thật (xem đầu bot/tests/khach-ao.py). Cần: TOKEN (Management API), PROJECT_REF.
set -euo pipefail

q() { curl -sS -f -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(jq -n --arg q "$1" '{query:$q}')"; }

. "$(dirname "$0")/lib/may146.sh"   # SRS-5.1zzzzzzz405: lõi trên máy 146 qua ssh "$MAY_146" (mặc định nguye@192.168.1.146), đường hầm 127.0.0.1:$CONG_146

# Khoá Anthropic cho khách ảo + giám khảo: lấy từ Vault (không in ra màn hình).
KHOA=$(q "select decrypted_secret as s from vault.decrypted_secrets where name = 'ANTHROPIC_API_KEY'" | jq -r '.[0].s // empty')
[ -n "$KHOA" ] || { echo "Thiếu ANTHROPIC_API_KEY trong Vault"; exit 1; }
python3 -m pip install -q "anthropic>=0.49" >/dev/null

RUN="${GITHUB_RUN_ID:-$(date +%s)}"
CONG="$CONG_146"

don() {
  echo "== dọn dữ liệu thử"
  for n in 1 2 3 4 5; do
    id="thu-ka-$n-$RUN"
    [ "${GIU_DU_LIEU:-}" = giu ] || vps "curl -sS -m 10 -X POST http://127.0.0.1:8000/reset/$id >/dev/null" || true
    [ "${GIU_DU_LIEU:-}" = giu ] || q "select reset_nguoi_test('$id') as kq" | jq -c '.[0]' || true
  done
}
trap 'don; dong_146' EXIT

ANTHROPIC_API_KEY="$KHOA" CORE_URL="http://127.0.0.1:$CONG" RUN_ID="$RUN" python3 bot/tests/khach-ao.py   # không -I: pip cài anthropic vào user site, -I bỏ qua chỗ đó (lượt 40375596667 ModuleNotFoundError)
