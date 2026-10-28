#!/usr/bin/env bash
# ban-thu-khach-ao.sh — 5 khách ẢO có cảm xúc (model đóng vai) chat với lõi production, giám khảo chấm (SRS-5.1zzzzzzz213). Chạy trong
# apply-migration.yml ô `dung_lai` = ban-thu-khach-ao. Lõi chỉ nghe 127.0.0.1:8000 trên VPS nên mở đường hầm ssh về máy chạy;
# khoá Anthropic lấy từ Vault (ANTHROPIC_API_KEY), che trong log. ID thử `thu-ka-<n>-<run>`, dọn cuối script kể cả khi hỏng.
# Tiền thật (xem đầu bot/tests/khach-ao.py). Cần: TOKEN (Management API), PROJECT_REF.
set -euo pipefail

q() { curl -sS -f -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(jq -n --arg q "$1" '{query:$q}')"; }

J=$(q "select json_object_agg(name, decrypted_secret) as s from vault.decrypted_secrets where name in ('VPS_HOST','VPS_ROOT_PASSWORD','ANTHROPIC_API_KEY')")
HOST=$(jq -r '.[0].s.VPS_HOST // empty' <<<"$J"); PW=$(jq -r '.[0].s.VPS_ROOT_PASSWORD // empty' <<<"$J")
KHOA=$(jq -r '.[0].s.ANTHROPIC_API_KEY // empty' <<<"$J")
unset J
for v in "$HOST" "$PW" "$KHOA"; do [ -n "$v" ] && echo "::add-mask::$v"; done
if [ -z "$HOST" ] || [ -z "$PW" ] || [ -z "$KHOA" ]; then echo "::error::Thiếu VPS_HOST / VPS_ROOT_PASSWORD / ANTHROPIC_API_KEY trong Vault"; exit 1; fi
command -v sshpass >/dev/null || sudo apt-get install -y -qq sshpass >/dev/null
python3 -m pip install -q "anthropic>=0.49" >/dev/null
export SSHPASS="$PW"; unset PW

RUN="${GITHUB_RUN_ID:-$(date +%s)}"
CONG=18000
# Đường hầm: 127.0.0.1:18000 (máy này) → 127.0.0.1:8000 (lõi trên VPS). -N không chạy lệnh, ExitOnForwardFailure để biết ngay khi hỏng.
sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o LogLevel=ERROR \
  -o ExitOnForwardFailure=yes -N -L "$CONG:127.0.0.1:8000" "root@$HOST" &
HAM=$!
vps() { sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o LogLevel=ERROR "root@$HOST" "$@"; }

don() {
  echo "== dọn dữ liệu thử"
  for n in 1 2 3 4 5; do
    id="thu-ka-$n-$RUN"
    [ "${GIU_DU_LIEU:-}" = giu ] || curl -sS -m 10 -X POST "http://127.0.0.1:$CONG/reset/$id" >/dev/null 2>&1 || vps "curl -sS -X POST http://127.0.0.1:8000/reset/$id >/dev/null" || true
    [ "${GIU_DU_LIEU:-}" = giu ] || q "select reset_nguoi_test('$id') as kq" | jq -c '.[0]' || true
  done
  kill "$HAM" 2>/dev/null || true
}
trap don EXIT

for i in $(seq 1 20); do curl -sS -m 3 "http://127.0.0.1:$CONG/" >/dev/null 2>&1 && break; sleep 1; done
curl -sS -m 5 "http://127.0.0.1:$CONG/" >/dev/null 2>&1 || { echo "::error::Đường hầm tới lõi không lên"; exit 1; }

ANTHROPIC_API_KEY="$KHOA" CORE_URL="http://127.0.0.1:$CONG" RUN_ID="$RUN" python3 bot/tests/khach-ao.py   # không -I: pip cài anthropic vào user site, -I bỏ qua chỗ đó (lượt 40375596667 ModuleNotFoundError)
