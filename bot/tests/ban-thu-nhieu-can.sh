#!/usr/bin/env bash
# ban-thu-nhieu-can.sh — bắn thử RIÊNG ca "một tin nhắn hai căn" trên lõi Python production (SRS-5.1zzzzzzz142), chạy trong apply-migration.yml ô
# `dung_lai` = ban-thu-nhieu-can. Lý do: ban-thu-ban 22/10 trượt ca này (DB đếm 0 tin sau 3 giây). Chờ lưu nền tới 25 s và IN thời gian thật tới
# lúc đủ 2 tin — phân biệt "chậm" với "không bao giờ ghi". Kiểm luôn tin gốc của từng căn. ID thử `thu-nc-`, tự dọn. Tiền thật: một lượt chat.
# Cần: TOKEN (Management API), PROJECT_REF.
set -euo pipefail

q() { curl -sS -f -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(jq -n --arg q "$1" '{query:$q}')"; }

J=$(q "select json_object_agg(name, decrypted_secret) as s from vault.decrypted_secrets where name in ('VPS_HOST','VPS_ROOT_PASSWORD')")
HOST=$(jq -r '.[0].s.VPS_HOST // empty' <<<"$J"); PW=$(jq -r '.[0].s.VPS_ROOT_PASSWORD // empty' <<<"$J")
unset J
for v in "$HOST" "$PW"; do [ -n "$v" ] && echo "::add-mask::$v"; done
if [ -z "$HOST" ] || [ -z "$PW" ]; then echo "::error::Thiếu VPS_HOST / VPS_ROOT_PASSWORD trong Vault"; exit 1; fi
command -v sshpass >/dev/null || sudo apt-get install -y -qq sshpass >/dev/null
export SSHPASS="$PW"; unset PW
vps() { sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o LogLevel=ERROR "root@$HOST" "$@"; }

RUN="${GITHUB_RUN_ID:-$(date +%s)}"
BAN="thu-nc-$RUN"
don() {
  echo "== dọn dữ liệu thử"
  vps "curl -sS -X POST http://127.0.0.1:8000/reset/$BAN >/dev/null" || true
  q "select reset_nguoi_test('$BAN') as kq" | jq -c '.[0]' || true
}
trap don EXIT

loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }

CAU="anh có 2 căn cần bán: căn 1 nhà hẻm đường Bùi Minh Trực quận 8 giá 5 tỷ, căn 2 nhà mặt tiền đường Phạm Hùng quận 8 giá 12 tỷ"
echo ">> [$BAN] $CAU"
TRA=$(jq -n --arg u "$BAN" --arg t "$CAU" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
      | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"

T0=$(date +%s); SO=0; DEM3=""
for i in $(seq 1 25); do
  SO=$(q "select count(*) as n from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN'" | jq -r '.[0].n')
  [ "$i" = 3 ] && DEM3=$SO
  [ "$SO" = 2 ] && break
  sleep 1
done
echo "== số tin trong DB sau $(( $(date +%s) - T0 )) giây: $SO (lúc ~3 giây: ${DEM3:-chưa đo})"
kiem "Nhiều căn: một tin nhắn hai căn → hai tin rao ($SO)" "$([ "$SO" = 2 ] && echo 1 || echo 0)"

TG=$(q "select l.code, n.du_lieu->>'tin_goc' as tg from listings l join sellers s on s.id = l.seller_id
        left join listing_noi_bo n on n.listing_id = l.id where s.zalo_user_id = '$BAN' order by l.code")
echo "$TG" | jq -c '.[]'
kiem "Nhiều căn: cả hai căn đều có tin gốc nguyên văn" \
  "$(jq '[.[] | select((.tg // "") | contains("Bùi Minh Trực") and contains("Phạm Hùng"))] | length == 2 | if . then 1 else 0 end' <<<"$TG")"
exit $loi
