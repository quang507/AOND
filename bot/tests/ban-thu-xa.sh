#!/usr/bin/env bash
# ban-thu-xa.sh — bắn thử đất ở xã (SRS-5.1zzzzzzz126), chạy trong apply-migration.yml ô `dung_lai` = ban-thu-xa.
# Chủ dự án 22/10/2026 test đất "xã Phước Lý" (Long An): bot hỏi "thuộc huyện nào" (từ 1/7/2025 không còn cấp huyện). Kịch bản XA1: rao đất →
# nói Long An → gửi cả cục thông tin đất (diện tích, chủ trương, hiện trạng, pháp lý, thuê đất). Kiểm: lời bot KHÔNG hỏi quận / huyện, có hỏi
# gần chỗ nào hoặc đường nào, không bịa thị trường. Chỉ Zalo ID thử (`thu-`), cuối script xoá sạch. Log chỉ in lời bot — tin thử này không có
# dữ liệu khách thật. Tiền thật: ~4 lượt chat (đang chạy qua Gemini khi Claude hết số dư).
set -euo pipefail

q() { curl -sS -f -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(jq -n --arg q "$1" '{query:$q}')"; }

. "$(dirname "$0")/lib/may146.sh"   # SRS-5.1zzzzzzz405: lõi trên máy 146 qua ssh "$MAY_146" (mặc định nuc) — chạy từ máy cá nhân, không chạy trên Actions

RUN="${GITHUB_RUN_ID:-$(date +%s)}"
XA1="thu-xa1-$RUN"
TAT_CA="$XA1"
BAT_DAU=$(date -u +%s)

don() {
  echo "== nhật ký lõi: cụm hỏi thêm, duyệt, kế hoạch (chỉ cờ + tên ô)"
  vps "journalctl -u aond-core --since @$BAT_DAU -o cat --no-pager | grep -oE '(Hỏi sau đăng: |Duyệt: AI=|Kế hoạch: |Dự phòng[: ]|ghi listing_noi_bo lỗi|đọc listing_noi_bo lỗi|tinh_hinh_tin lỗi).*' | sort | uniq -c | sort -rn | head -60" || true
  echo "== đưa câu bot vào Câu chuẩn"
  for u in $TAT_CA; do q "select cau_chuan_tu_zalo('$u') as so_cau" | jq -c '.[0]' || true; done
  echo "== dọn dữ liệu thử"
  [ "${GIU_DU_LIEU:-}" = giu ] || vps "for u in $TAT_CA; do curl -sS -X POST http://127.0.0.1:8000/reset/\$u >/dev/null; done" || true
  [ "${GIU_DU_LIEU:-}" = giu ] || for u in $TAT_CA; do q "select reset_nguoi_test('$u') as kq" | jq -c '.[0]' || true; done
  [ "${GIU_DU_LIEU:-}" = giu ] || q "delete from danh_gia_ai where la_thu and zalo_user_id in ('$XA1')" >/dev/null || true
}
trap 'don; dong_146' EXIT

loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
LOI=""; MUA_LOI=""
chat() {
  local uid="$1" text="$2"
  echo; echo ">> [$uid] $text"
  TRA=$(jq -n --arg u "$uid" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 150 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  LOI=$(jq -r '[.replies[]?] | join("\n")' <<<"$TRA" 2>/dev/null || echo "$TRA")
  sed 's/^/<< /' <<<"$LOI"
  sleep 1
}
cum_log() { vps "journalctl -u aond-core --since @$BAT_DAU -o cat --no-pager | grep -oE 'Hỏi sau đăng: cụm [a-z_]+' | sed 's/.* //' | tr '\n' ' '" || true; }

# ---------------- XA1: đất ở xã ----------------
chat "$XA1" "anh cần rao bán lô đất"
chat "$XA1" "Nhà ở Long An nhé!"
chat "$XA1" "Cần chuyển nhượng: đất dự án 31.314m2 trong ở xã phước lý
có sẵn chủ trương sx giầy da, có thể thay đổi chủ trương đa ngành nghề
Hiện trạng: chưa san lấp, mặt đường quốc lộ, lô góc đẹp
Pháp lý: thời hạn 2067
Thuê đất trả tiền hàng năm, được miễn thuế đất 7 năm"
kiem "XA1: không hỏi quận / huyện" "$(grep -qiE 'huyện nào|quận nào|thuộc huyện|thuộc quận|và quận|, quận' <<<"$LOI" && echo 0 || echo 1)"
kiem "XA1: có hỏi tiếp một ý (có dấu hỏi)" "$(grep -q '?' <<<"$LOI" && echo 1 || echo 0)"
kiem "XA1: không bịa thị trường" "$(grep -qiE 'thanh khoản|đắt khách|giá hợp lý|dễ bán lắm|đắc địa' <<<"$LOI" && echo 0 || echo 1)"
chat "$XA1" "quốc lộ 50, gần chợ Phước Lý"
kiem "XA1: sau khi khách nói đường / mốc, không hỏi lại địa chỉ" "$(grep -qiE 'đường nào|gần chỗ nào|địa chỉ chi tiết|huyện nào' <<<"$LOI" && echo 0 || echo 1)"

echo "== sổ lỗi lõi trong khung chạy"
q "select count(*) as so_loi from bot_errors where at >= to_timestamp($BAT_DAU)" | jq -c '.[0]' || true
exit $loi
