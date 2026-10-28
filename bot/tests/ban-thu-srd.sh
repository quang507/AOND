#!/usr/bin/env bash
# ban-thu-srd.sh — bắn thử lõi Python production theo kịch bản mẫu trong `req + chat examples.docx` của anh Luận (SRD 23/06/2026,
# `luan8560/aond`) — SRS-5.1zzzzzzz225, chủ dự án 27/10/2026: "làm cái này đi, bắn e2e trước rồi bắn thử sau". Chạy trong
# apply-migration.yml ô `dung_lai` = ban-thu-srd. Bản offline cùng kịch bản: tests/test_kich_ban_srd_aond.py.
# Kiểm điều tất định (ô ghi vào DB, trạng thái tin, con số phí theo vai, ô riêng không lên tin); câu chữ model in ra ở dòng << cho người đọc.
# Bỏ có chủ ý (khác SRD vì quyết định đã chốt): nút bấm, mở "Dạ", lời hứa "kiểm tra giá thị trường", bóc tách ảnh sổ (thay bằng câu chữ),
# trợ lý bên mua gọi chủ nhà hẹn lịch (lịch xem đi thẳng admin).
# Chỉ dùng Zalo ID thử (`thu-`); cuối script xoá sạch. Cần: TOKEN (Management API), PROJECT_REF. Tiền thật: ~16 lượt chat × vài lượt AI.
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
SRD="thu-srd1-$RUN"; MO="thu-srd2-$RUN"; MUA="thu-srd5-$RUN"
TAT_CA="$SRD $MO $MUA"

don() {
  echo "== dọn dữ liệu thử"
  [ "${GIU_DU_LIEU:-}" = giu ] || vps "for u in $TAT_CA; do curl -sS -X POST http://127.0.0.1:8000/reset/\$u >/dev/null; done" || true
  # Kịch bản "đã bán" đẻ deal đã chốt — trigger FR-163 chặn xoá deal chốt, nên mở chốt deal của ID THỬ trước khi reset.
  for u in $TAT_CA; do
    q "update deals set closed_at = null where closed_at is not null and listing_id in (select l.id from listings l join sellers s
       on s.id = l.seller_id where s.zalo_user_id = '$u' and la_id_thu('$u'))" >/dev/null || true
    [ "${GIU_DU_LIEU:-}" = giu ] || q "select reset_nguoi_test('$u') as kq" | jq -c '.[0]' || true
  done
}
trap don EXIT

chat() {
  local uid="$1" text="$2"
  echo; echo ">> [$uid] $text"
  TRA=$(jq -n --arg u "$uid" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"
  LOI="$(jq -r '.reply // ""' <<<"$TRA")"
  MOI_LOI+=$'\n'"$(jq -r '.replies[]?' <<<"$TRA" 2>/dev/null || true)"
  LUOT=$((LUOT + 1))
  if [ -z "$LUOT_NHAP" ] && grep -q '📋' <<<"$TRA"; then LUOT_NHAP=$LUOT; fi
  # SRS-5.1zzzzzzz239 (chủ dự án 28/10: "bắn từ từ"): ID thử chat bằng Gemini — nghỉ giữa các lượt cho khỏi chạm trần nhịp của khoá.
  sleep "${NGHI_GIUA_LUOT:-12}"
}
loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
cho_luu() {   # lõi lưu nền: chờ tới 15 s cho tới khi điều kiện SQL ($2) trả 1 dòng
  for _ in $(seq 1 15); do [ "$(q "$1" | jq -r '.[0].n // 0')" -ge 1 ] && return 0; sleep 1; done; return 0; }
tin() { q "select l.id, l.code, l.status, l.property_type, l.street, l.district, l.area_m2, l.price_vnd, l.bedrooms, l.legal_status,
               l.access_type, l.boc_tach - '_cap_nhat' as boc_tach
             from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$1' order by l.updated_at desc limit 1" | jq -c '.[0] // {}'; }

# ==== Luồng 30 câu (PHẦN II của SRD): nhà hẻm 123 Trần Bình Trọng, Quận 5. Bước gửi ảnh sổ thay bằng câu chữ.
MOI_LOI=""; LUOT=0; LUOT_NHAP=""
for cau in "Anh muốn gửi bán căn nhà phố ở Quận 5." "Nhà hẻm 123 đường Trần Bình Trọng nha em." "Hẻm xe hơi 4m, ô tô tới cửa." \
           "1 trệt 2 lầu, 4 phòng ngủ." "Sổ hồng riêng, đất 50m2 em." "Giá bán 10 tỷ nha em. Có thương lượng."; do
  chat "$SRD" "$cau"; sleep 1
done
LOI_SAU_GIA="$LOI"
# Bản nháp chưa ra sau câu giá thì khách trả lời thêm hiện trạng (SRS-260: soạn bài khi đủ quy mô · pháp lý · hiện trạng).
[ -z "$LUOT_NHAP" ] && { chat "$SRD" "Nhà đang để trống em."; sleep 1; }
chat "$SRD" "OK em. Có khách báo anh."; sleep 1
chat "$SRD" "Tặng hết nội thất dính tường nha."; sleep 1
chat "$SRD" "Nhanh nha em, anh đang cần bán gấp."; sleep 1
chat "$SRD" "Vẫn đang bán nha, chưa chốt ai."; sleep 1
chat "$SRD" "OK. Phí môi giới bên em thu sao?"; PHI_CHUA_VAI="$LOI"; sleep 1
chat "$SRD" "Anh là chính chủ, vậy phí bao nhiêu em?"; PHI_CHINH_CHU="$LOI"; sleep 1

cho_luu "select count(*) as n from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$SRD' and l.price_vnd is not null"
r=$(tin "$SRD"); echo; echo "== soi DB luồng 30 câu"; jq '.' <<<"$r"
ID=$(jq -r '.id // ""' <<<"$r")
NB=$(q "select coalesce(du_lieu, '{}'::jsonb) as d from listing_noi_bo where listing_id = '${ID:-00000000-0000-0000-0000-000000000000}'" | jq -c '.[0].d // {}')
echo "listing_noi_bo: $NB"
kiem "SRD: loại nhà phố" "$(jq '.property_type == "nha_pho" | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: đường Trần Bình Trọng" "$(jq '(.street // "") | test("Trần Bình Trọng") | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: giá 10 tỷ" "$(jq '.price_vnd == 10000000000 | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: đất 50m²" "$(jq '((.area_m2 // 0) | tonumber) == 50 | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: 4 phòng ngủ" "$(jq '(.bedrooms // 0) == 4 | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: sổ hồng riêng" "$(jq '.legal_status == "so_hong_rieng" | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: hẻm xe hơi 4m có ghi" "$(jq '[.boc_tach | to_entries[] | select(.value | tostring | test("4 ?m"))] | length > 0 | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: bản tin 📋 ra trong ≤ 7 lượt (lượt ${LUOT_NHAP:-không có})" "$([ -n "$LUOT_NHAP" ] && [ "$LUOT_NHAP" -le 7 ] && echo 1 || echo 0)"
kiem "SRD: tặng nội thất có ghi" "$(jq '[.boc_tach | to_entries[] | select(.value | tostring | test("nội thất"))] | length > 0 | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: 'bán gấp' là ô riêng — KHÔNG nằm trong boc_tach công khai" "$(jq '[.boc_tach | to_entries[] | select(.value | tostring | test("bán gấp"))] | length == 0 | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: 'bán gấp' nằm ở listing_noi_bo" "$(jq 'tostring | test("bán gấp") | if . then 1 else 0 end' <<<"$NB")"
kiem "SRD: 'vẫn đang bán' không đổi trạng thái thành đã chốt / ẩn ($(jq -r '.status' <<<"$r"))" "$(jq '(.status // "") | test("dang_ban|cho_thong_tin") | if . then 1 else 0 end' <<<"$r")"
kiem "SRD: hỏi phí khi CHƯA rõ vai → không chọn một vai đoán (nêu cả hai mức hoặc hỏi vai)" \
  "$( { grep -qE '0[.,]5 ?%' <<<"$PHI_CHUA_VAI" && grep -qE '(^|[^0-9.,])1 ?%' <<<"$PHI_CHUA_VAI"; } || grep -qiE 'chủ nhà hay|chính chủ hay|hay môi giới' <<<"$PHI_CHUA_VAI" && echo 1 || echo 0)"
kiem "SRD: khách nói chính chủ → phí 1%, không 0,5%" "$(grep -qE '(^|[^0-9.,])1 ?%' <<<"$PHI_CHINH_CHU" && ! grep -qE '0[.,]5 ?%' <<<"$PHI_CHINH_CHU" && echo 1 || echo 0)"
kiem "SRD: không hứa 'kiểm tra giá thị trường' (bot không có số liệu thị trường)" "$(grep -qiE 'kiểm tra giá thị trường|giá thị trường khu' <<<"$MOI_LOI" && echo 0 || echo 1)"
echo "== SRD: lời bot sau câu giá (người đọc chấm): $(head -c 300 <<<"$LOI_SAU_GIA")"

# ==== Nhóm 5 (bot-to-bot): khách MUA hỏi đúng căn vừa rao — bot bên mua chỉ nói điều có trong tin, không bịa (người đọc chấm).
chat "$MUA" "Cho anh hỏi nhà hẻm xe hơi đường Trần Bình Trọng quận 5 giá 10 tỷ còn không em, có tặng nội thất không?"
kiem "Nhóm 5: khách mua hỏi căn → bot không hứa gọi chủ nhà hẹn giờ cụ thể khi chưa ghi lịch" "$(grep -qiE 'chiều nay [0-9]+ ?h|em dắt .* qua xem' <<<"$LOI" && echo 0 || echo 1)"

# ==== Nhóm 2.4 / FR-184: chủ báo đã bán → tin chuyển đã chốt (bot có thể hỏi xác nhận một lần).
chat "$SRD" "À em ơi, nhà anh vừa bán được rồi nha."; sleep 1
if ! q "select l.status from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$SRD' order by l.updated_at desc limit 1" \
     | jq -e '.[0].status | test("da_chot")' >/dev/null; then
  chat "$SRD" "Đúng rồi em, bán rồi."; sleep 1
fi
cho_luu "select count(*) as n from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$SRD' and l.status = 'da_chot'"
TT=$(q "select l.status from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$SRD' order by l.updated_at desc limit 1" | jq -r '.[0].status')
kiem "Nhóm 2.4: chủ báo đã bán → tin đã chốt ($TT)" "$([ "$TT" = da_chot ] && echo 1 || echo 0)"

# ==== Nhóm 1.1: khách chỉ mở lời, chưa có dữ liệu → bot hỏi, không đẻ tin rỗng (SRS-177 mục 3).
chat "$MO" "Anh muốn gửi bán nhà"
sleep 3
SO_TIN=$(q "select count(*) as n from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$MO'
            and coalesce(l.boc_tach - '_cap_nhat', '{}'::jsonb) not in ('{}'::jsonb)" | jq -r '.[0].n')
kiem "Nhóm 1.1: lời bot có câu hỏi" "$(grep -q '?' <<<"$LOI" && echo 1 || echo 0)"
kiem "Nhóm 1.1: không bản tin 📋 khi chưa có dữ liệu" "$(grep -q '📋' <<<"$LOI" && echo 0 || echo 1)"
echo "== Nhóm 1.1: số tin có ô của khách chỉ mở lời: $SO_TIN (lời chào không nên đẻ tin có ô; loại hình đọc từ 'nhà' là chấp nhận được)"

kiem "mọi lượt: không bong bóng nào mở đầu \"Dạ\"" "$(grep -qE '^Dạ' <<<"$MOI_LOI" && echo 0 || echo 1)"

vps "journalctl -u aond-core --since '-10 min' --no-pager -o cat | grep -E 'Bỏ ô|Kế hoạch:|Lời bot lệch luật' | sed -E 's/[0-9]{9,}/#/g' | tail -40" || true
q "select to_char(at, 'HH24:MI:SS') as luc, source, left(detail, 160) as chi_tiet from bot_errors
   where at > now() - interval '15 min' and (source like 'claude%' or source like 'stt%') order by at" | jq -c '.[]' || true
exit $loi
