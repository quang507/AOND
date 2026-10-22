#!/usr/bin/env bash
# ban-thu-92.sh — bắn thử ca "giá 9.2 không nhớ" + chế độ test $$$$$ + bỏ ghi nhận / khen 100% (SRS-5.1zzzzzzz130–131), chạy trong
# apply-migration.yml ô `dung_lai` = ban-thu-92. Tái hiện chat Lê Quang 22/10 11:54–12:05: khách nói giá ngay tin đầu ("Bán nhà chính chủ ở
# quận 10 giá 9.2") mà đến lượt 6 bot vẫn hỏi "giá bán mong muốn". Kiểm bằng TIN PHỤ "$$$$$ Đã trích xuất…" (code ghép): lệnh $$$$$ im lặng;
# lượt 1 ô giá được ghi (hoặc tin phụ nói rõ AI không đề xuất / code bỏ vì sao); không lượt nào mở bằng "Em ghi nhận / lưu rồi"; không hỏi lại
# giá; không bịa "hẻm xe hơi" khi khách chỉ nói "hẻm 130". Chỉ Zalo ID thử (`thu-`), cuối script xoá sạch. Log chỉ in lời bot + tin phụ — tin
# thử không có dữ liệu khách thật. Tiền thật ~7 lượt chat (đang chạy Gemini khi Claude hết số dư).
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
U="thu-92-$RUN"
DAU='$$$$$'
BAT_DAU=$(date -u +%s)

don() {
  echo "== nhật ký lõi (chỉ cờ + tên ô)"
  vps "journalctl -u aond-core --since @$BAT_DAU -o cat --no-pager | grep -oE '(Kế hoạch: |Bỏ ô [a-z_]+: |Giữ loại|Dự phòng[: ]|Lời bot lệch luật hình thức).*' | sort | uniq -c | sort -rn | head -40" || true
  echo "== đưa câu bot vào Câu chuẩn"
  q "select cau_chuan_tu_zalo('$U') as so_cau" | jq -c '.[0]' || true
  echo "== dọn dữ liệu thử"
  vps "curl -sS -X POST http://127.0.0.1:8000/reset/$U >/dev/null" || true
  q "select reset_nguoi_test('$U') as kq" | jq -c '.[0]' || true
  q "delete from danh_gia_ai where la_thu and zalo_user_id = '$U'" >/dev/null || true
}
trap don EXIT

loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
LOI=""; PHU=""; SO_TRA=0
chat() {
  local text="$1"
  echo; echo ">> [$U] $text"
  TRA=$(jq -n --arg u "$U" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 150 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  SO_TRA=$(jq -r '[.replies[]?] | length' <<<"$TRA" 2>/dev/null || echo 0)
  PHU=$(jq -r --arg d "$DAU" '[.replies[]? | select(startswith($d))] | join("\n")' <<<"$TRA" 2>/dev/null || echo "")
  LOI=$(jq -r --arg d "$DAU" '[.replies[]? | select(startswith($d) | not)] | join("\n")' <<<"$TRA" 2>/dev/null || echo "$TRA")
  sed 's/^/<< /' <<<"$LOI"; [ -n "$PHU" ] && sed 's/^/   /' <<<"$PHU"
  sleep 1
}
ghi_nhan() { grep -qiE '^\s*em\s+(đã\s+)?(ghi nhận|ghi rồi|ghi lại|lưu (vào|lại|rồi)|nắm rồi|thêm vào tin)' <<<"$1" && echo 1 || echo 0; }

chat "$DAU"
kiem "lệnh \$\$\$\$\$ im lặng (0 tin)" "$([ "$SO_TRA" = 0 ] && echo 1 || echo 0)"

chat "Bán nhà chính chủ ở quận 10 giá 9.2"
kiem "L1: có tin phụ" "$([ -n "$PHU" ] && echo 1 || echo 0)"
kiem "L1: tin phụ có dòng tiền" "$(grep -q 'Tốn lượt này' <<<"$PHU" && echo 1 || echo 0)"
kiem "L1: ô giá được ghi (tin phụ liệt kê giá)" "$(grep -qE '^• giá:' <<<"$PHU" && echo 1 || echo 0)"
kiem "L1: không mở bằng câu ghi nhận" "$([ "$(ghi_nhan "$LOI")" = 0 ] && echo 1 || echo 0)"
kiem "L1: có khen (không chỉ hỏi cộc)" "$([ "$(wc -w <<<"$LOI")" -ge 8 ] && echo 1 || echo 0)"

chat "nhà anh là nhà phố,"
kiem "L2: không mở bằng câu ghi nhận" "$([ "$(ghi_nhan "$LOI")" = 0 ] && echo 1 || echo 0)"
chat "hẻm 130 Cách Mạng Tháng 8, Phường Nhiêu Lộc Tp. Hồ Chí Minh"
kiem "L3: không bịa 'hẻm xe hơi' khi khách chưa nói rộng" "$(grep -qiE 'hẻm xe hơi|xe hơi' <<<"$LOI" && echo 0 || echo 1)"
kiem "L3: không mở bằng câu ghi nhận" "$([ "$(ghi_nhan "$LOI")" = 0 ] && echo 1 || echo 0)"
chat "5x10"
kiem "L4: '5x10' không rơi vào ô trang thiết bị" "$(grep -qE '^• hiện trạng bàn giao và trang thiết bị.*5x10' <<<"$PHU" && echo 0 || echo 1)"
chat "nhà 6 tầng, mới xây hoàn công 2025, đang trống"
kiem "L5: không hỏi lại giá (đã nói từ L1)" "$(grep -qiE 'giá bán mong muốn|mong muốn thu về|giá bao nhiêu|mức giá' <<<"$LOI" && echo 0 || echo 1)"
chat "không nhớ giá sao?"
kiem "L6: nhắc lại giá 9.2 đã ghi, không đi kiểm tra giao dịch" "$(grep -q '9[.,]2' <<<"$LOI" && ! grep -qi 'kiểm tra các giao dịch' <<<"$LOI" && echo 1 || echo 0)"
kiem "L6: không mở bằng câu ghi nhận" "$([ "$(ghi_nhan "$LOI")" = 0 ] && echo 1 || echo 0)"
kiem "L6: không bình luận giá (hợp lý / đắt khách / dễ bán…)" "$(grep -qiE 'hợp lý|đắt khách|dễ bán|thanh khoản|đắc địa|vừa tầm' <<<"$LOI" && echo 0 || echo 1)"

echo "== sổ lỗi lõi trong khung chạy"
q "select count(*) as so_loi from bot_errors where at >= to_timestamp($BAT_DAU)" | jq -c '.[0]' || true
exit $loi
