#!/usr/bin/env bash
# ban-thu-dc.sh — bắn thử ĐỊA CHỈ CÓ SỐ HẺM trên lõi Python production (SRS-5.1zzzzzzz115), chạy trong apply-migration.yml ô
# `dung_lai` = ban-thu-dc. Chủ dự án 21/10/2026: "họ nói 137/28 đường số 59 con bot có hiểu ko … bắn thử bằng chat xem". Mỗi ca một
# tin rao có số nhà trong hẻm của một đường đi qua nhiều phường; kho hẻm (bảng duong, loai = hem) chỉ có hẻm đó ở MỘT phường → bot
# nên gợi ý đúng phường đó (dạng hỏi). DC4 là nhà MẶT TIỀN số 285 — không được lấy phường của hẻm 285. Chỉ Zalo ID thử, cuối script
# dọn sạch. Tiền thật: 5 lượt chat × vài lượt AI.
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

RUN="${GITHUB_RUN_ID:-$(date +%s)}"
TAT_CA=""; for i in 1 2 3 4 5; do TAT_CA+=" thu-dc$i-$RUN"; done
BAT_DAU=$(date -u +%s)
don() {
  echo "== đưa câu bot vào Câu chuẩn"
  for u in $TAT_CA; do q "select cau_chuan_tu_zalo('$u') as so_cau" | jq -c '.[0]' || true; done
  echo "== dọn dữ liệu thử"
  vps "for u in $TAT_CA; do curl -sS -X POST http://127.0.0.1:8000/reset/\$u >/dev/null; done" || true
  for u in $TAT_CA; do q "select reset_nguoi_test('$u') as kq" | jq -c '.[0]' || true; done
}
trap don EXIT

loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
chat() {
  local uid="$1" text="$2"
  echo; echo ">> [$uid] $text"
  TRA=$(jq -n --arg u "$uid" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  LOI=$(jq -r '[.replies[]?] | join("\n")' <<<"$TRA" 2>/dev/null || echo "$TRA")
  sed 's/^/<< /' <<<"$LOI"
  sleep 1
}
dong() { q "select l.street, l.ward, l.district, l.boc_tach->>'dia_chi' as dia_chi, l.boc_tach->>'duong' as duong,
              l.boc_tach->>'phuong' as phuong from listings l join sellers s on s.id = l.seller_id
            where s.zalo_user_id = '$1' order by l.updated_at desc limit 1" | jq -c '.[0] // {}'; }

# uid | tin rao | phường kho hẻm (trống = KHÔNG được gợi ý phường từ hẻm) | phường không được nói
CA=(
  "1|Chị bán nhà 137/28 đường số 59, 4x15m, 1 trệt 2 lầu, giá 6 tỷ 2|An Hội Tây|"
  "2|Bán nhà hẻm 965 Quang Trung, nhà 4x16, 3 tầng, giá 7 tỷ|An Hội Tây|"
  "3|nha 387/12 phan van tri 3.5x12 2 lau gia 5ty|Chợ Quán|"
  "4|Bán nhà mặt tiền 285 Cách Mạng Tháng Tám, 4x20, 25 tỷ||Hòa Hưng"
  "5|Bán nhà 860/5 Huỳnh Tấn Phát, 4x12, 2 lầu, giá 5,5 tỷ|Tân Mỹ|"
)
for c in "${CA[@]}"; do
  IFS='|' read -r i tin dung cam <<<"$c"
  chat "thu-dc$i-$RUN" "$tin"
  echo "   ô tin: $(dong "thu-dc$i-$RUN")"
  if [ -n "$dung" ]; then kiem "DC$i: bot nhắc đúng phường kho hẻm ($dung)" "$(grep -q "$dung" <<<"$LOI" && echo 1 || echo 0)"; fi
  if [ -n "$cam" ]; then kiem "DC$i: nhà mặt tiền — không lấy phường của hẻm cùng số ($cam)" "$(grep -q "$cam" <<<"$LOI" && echo 0 || echo 1)"; fi
done
echo "== nhật ký lõi: địa danh"
vps "journalctl -u aond-core --since @$BAT_DAU -o cat --no-pager | grep -oE '(phường theo hẻm|đường theo nghĩa|phường theo nghĩa).*' | tail -20" || true
exit $loi
