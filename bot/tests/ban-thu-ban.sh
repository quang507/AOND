#!/usr/bin/env bash
# ban-thu-ban.sh — bắn thử luồng NGƯỜI BÁN trên lõi Python production (SRS-5.1zzzzzzz73), chạy trong apply-migration.yml ô
# `dung_lai` = ban-thu-ban. Kịch bản theo lượt chat thử của chủ dự án 19/10 (nhà phố mặt tiền Cao Lỗ Q8): soi ô tin ghi đủ, và ô
# bot TỰ HỎI mà chủ nhà không trả lời (thương lượng) không được ghi. Chỉ dùng Zalo ID thử (`thu-`); cuối script xoá sạch.
# Cần: TOKEN (Management API), PROJECT_REF. Tiền thật: ~8 lượt chat × vài lượt AI.
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
BAN="thu-ban-$RUN"

don() {
  echo "== dọn dữ liệu thử"
  q "select reset_nguoi_test('$BAN') as ban" | jq -c '.[0]' || true
  vps "curl -sS -X POST http://127.0.0.1:8000/reset/$BAN >/dev/null" || true
}
trap don EXIT

# Lượt chat: in từng bong bóng bot trả; trả JSON thô vào biến TRA.
chat() {
  local uid="$1" text="$2"
  echo; echo ">> [$uid] $text"
  TRA=$(jq -n --arg u "$uid" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"
}

for cau in "Mình cần bán nhà phố" "Nhà đường Cao Lỗ, Phường Chánh Hưng, Quận 8" "Nhà mặt tiền" "dt 4,5x11" "Nhà xây 1 trệt 3 lầu" \
           "nhà mình có sổ riêng" "giá 8,5 tỷ" "đã hoàn công đủ" "diện tích sàn tầm 170m vuông"; do
  chat "$BAN" "$cau"
  sleep 1
done

echo; echo "== soi DB"
KQ=$(q "select l.code, l.status, l.ward, l.district, l.street, l.area_m2, l.price_vnd, l.floors, l.legal_status, l.access_type,
          l.boc_tach - '_cap_nhat' as boc_tach
        from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN' order by l.updated_at desc limit 1")
jq '.[0]' <<<"$KQ"
r=$(jq '.[0] // {}' <<<"$KQ")
loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
kiem "phường chuẩn" "$(jq '.ward == "Phường Chánh Hưng" | if . then 1 else 0 end' <<<"$r")"
kiem "giá 8,5 tỷ" "$(jq '.price_vnd == 8500000000 | if . then 1 else 0 end' <<<"$r")"
kiem "diện tích đất 49,5" "$(jq '(.area_m2 // 0) == 49.5 | if . then 1 else 0 end' <<<"$r")"
kiem "mặt tiền" "$(jq '.access_type == "mat_tien" | if . then 1 else 0 end' <<<"$r")"
kiem "sổ hồng riêng" "$(jq '.legal_status == "so_hong_rieng" | if . then 1 else 0 end' <<<"$r")"
kiem "kết cấu có ghi" "$(jq '((.boc_tach.ket_cau // "") != "") or ((.floors // 0) > 0) | if . then 1 else 0 end' <<<"$r")"
kiem "KHÔNG có ô thương lượng (chủ nhà không nói)" "$(jq '(.boc_tach.thuong_luong // "") == "" | if . then 1 else 0 end' <<<"$r")"
echo "== số ô tin: $(jq '.boc_tach | length' <<<"$r")"
vps "journalctl -u aond-core --since '-10 min' --no-pager -o cat | grep -E 'Bỏ ô' | sed -E 's/[0-9]{9,}/#/g' | tail -15" || true
exit $loi
