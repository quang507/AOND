#!/usr/bin/env bash
# ban-thu-sau.sh — bắn thử bộ câu môi giới (SRS-5.1zzzzzzz116) trên lõi Python production, chạy trong apply-migration.yml ô `dung_lai` =
# ban-thu-sau. Chủ dự án 21/10/2026 gửi bộ câu hỏi chủ nhà (pháp lý, giá, dẫn khách xem, chi tiết nhà) và 7 câu hỏi khách mua:
#   SD1 (bán): rao → bản nháp → duyệt → phí → chấm sao → 5 cụm hỏi thêm (mỗi cụm một lần) → "có ai hỏi mua chưa" → "giá cao không".
#        Kiểm: đủ 5 cụm đúng thứ tự, ô riêng vào `listing_noi_bo` (không vào `boc_tach` / mô tả web), số khách đọc thật, không tự định giá.
#   SM1 (mua): nhu cầu → các câu tư vấn → có ông bà thì hỏi thang máy; nhu cầu mới xuống `buyers.preferences`; không xin số điện thoại.
# Chỉ Zalo ID thử (`thu-`), cuối script xoá sạch. Log chỉ in lời bot, tên ô / cờ — không in giá trị riêng từ DB. Tiền thật: ~25 lượt chat.
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
SD1="thu-sd1-$RUN"; SM1="thu-sm1-$RUN"
TAT_CA="$SD1 $SM1"
BAT_DAU=$(date -u +%s)

don() {
  echo "== nhật ký lõi: cụm hỏi thêm, duyệt, kế hoạch (chỉ cờ + tên ô)"
  vps "journalctl -u aond-core --since @$BAT_DAU -o cat --no-pager | grep -oE '(Hỏi sau đăng: |Duyệt: AI=|Kế hoạch: |ghi listing_noi_bo lỗi|đọc listing_noi_bo lỗi|tinh_hinh_tin lỗi).*' | tail -60" || true
  echo "== đưa câu bot vào Câu chuẩn"
  for u in $TAT_CA; do q "select cau_chuan_tu_zalo('$u') as so_cau" | jq -c '.[0]' || true; done
  echo "== dọn dữ liệu thử"
  vps "for u in $TAT_CA; do curl -sS -X POST http://127.0.0.1:8000/reset/\$u >/dev/null; done" || true
  for u in $TAT_CA; do q "select reset_nguoi_test('$u') as kq" | jq -c '.[0]' || true; done
  q "delete from danh_gia_ai where la_thu and zalo_user_id in ('$SD1', '$SM1')" >/dev/null || true
}
trap don EXIT

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

# ---------------- SD1: người bán ----------------
chat "$SD1" "Chị bán nhà 146 Trần Bình Trọng phường Chợ Quán quận 5, ngang 4 dài 15, 1 trệt 2 lầu 3 phòng ngủ 3 WC, hẻm xe hơi 6m, sổ hồng riêng hoàn công rồi, nhà đang ở, giá 9 tỷ"
for _ in 1 2 3 4 5; do
  grep -q '📋' <<<"$LOI" && break
  chat "$SD1" "diện tích sàn khoảng 150m2, nhà chị đang ở, sổ hồng riêng hoàn công đầy đủ, hẻm xe hơi 6m em nhé"
done
kiem "SD1: ra bản nháp 📋" "$(grep -q '📋' <<<"$LOI" && echo 1 || echo 0)"
chat "$SD1" "ok em đăng đi"
chat "$SD1" "phí bên em sao chị chưa biết"
chat "$SD1" "5 sao nha em"
chat "$SD1" "ừ em"
chat "$SD1" "sổ hai vợ chồng chị đứng tên, cả hai đồng ý bán rồi, không thế chấp, không dính quy hoạch gì"
chat "$SD1" "giá có bớt chút cho khách thiện chí, chị bán để đi định cư nên cần bán trong 2 tháng"
chat "$SD1" "thuế phí thì bên mua chịu, chị nhận tiền 2 đợt, cho vay ngân hàng được"
chat "$SD1" "chiều sau 5 giờ xem được, em liên hệ chị luôn, chìa khoá chị giữ"
chat "$SD1" "nhà hướng đông nam, xây năm 2015, để lại toàn bộ nội thất"
CUM=$(cum_log); echo "   cụm đã hỏi: $CUM"
kiem "SD1: hỏi đủ 5 cụm, đúng thứ tự, mỗi cụm một lần" "$([ "$(echo $CUM)" = "phap_ly gia thue_phi xem_nha chi_tiet" ] && echo 1 || echo 0)"

LID=$(q "select l.id from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$SD1' order by l.updated_at desc limit 1" | jq -r '.[0].id // empty')
echo "   tin: ${LID:-(không có)}"
if [ -n "$LID" ]; then
  NB=$(q "select coalesce((select array_to_json(array(select jsonb_object_keys(du_lieu))) from listing_noi_bo where listing_id = '$LID'), '[]'::json) as k" | jq -c '.[0].k')
  echo "   ô riêng đã lưu (chỉ tên ô): $NB"
  kiem "SD1: ô riêng vào listing_noi_bo (≥ 3 ô)" "$([ "$(jq 'length' <<<"$NB")" -ge 3 ] && echo 1 || echo 0)"
  LO=$(q "select (boc_tach ?| array['dung_ten_so','ly_do_ban','gio_xem','chia_khoa']) as lo, status, coalesce(description,'') ilike '%định cư%' as mo_ta_lo,
           array_to_json(array(select k from jsonb_object_keys(boc_tach) k where k in ('the_chap','quy_hoach','thuong_luong','thue_phi','thanh_toan','huong','nam_xay','noi_that'))) as o_cong_khai
         from listings where id = '$LID'" | jq -c '.[0]')
  echo "   boc_tach: $LO"
  kiem "SD1: ô riêng KHÔNG nằm trong boc_tach (đọc công khai)" "$([ "$(jq -r '.lo' <<<"$LO")" = false ] && echo 1 || echo 0)"
  kiem "SD1: mô tả web không có lý do bán" "$([ "$(jq -r '.mo_ta_lo' <<<"$LO")" = false ] && echo 1 || echo 0)"
  kiem "SD1: ô công khai mới đã ghi (≥ 4 ô)" "$([ "$(jq '.o_cong_khai | length' <<<"$LO")" -ge 4 ] && echo 1 || echo 0)"
  echo "   trạng thái tin: $(jq -r '.status' <<<"$LO")"
fi

chat "$SD1" "căn của chị có ai hỏi mua chưa em"
kiem "SD1: hỏi có khách chưa → nói thật (tin thử chưa có khách)" "$(grep -qiE 'chưa' <<<"$LOI" && ! grep -qiE 'nhiều khách' <<<"$LOI" && echo 1 || echo 0)"
chat "$SD1" "chị để giá 9 tỷ vậy có cao không em, khu đó giờ bao nhiêu"
SO=$(grep -oiE '[0-9]+([.,][0-9]+)? ?(tỷ|tỉ|triệu)' <<<"$LOI" | grep -viE '^9 ?(tỷ|tỉ)$' || true)
kiem "SD1: hỏi giá thị trường → không tự nêu con số" "$([ -z "$SO" ] && echo 1 || echo 0)"

# ---------------- SM1: người mua ----------------
chat "$SM1" "Em tìm mua nhà phố quận 5 tầm 9 tỷ để ở, hẻm xe hơi, 3 phòng ngủ"; MUA_LOI+=$'\n'"$LOI"
for tra in "em thích chỗ yên tĩnh, gần chợ với trường học" "nhà có vợ chồng em, 2 bé với ông bà nội" "em làm ở quận 1, con học quận 5" \
           "tầm 60m2 sàn trở lên là được" "có thang máy thì tốt cho ông bà" "vợ em cùng quyết nữa" "chắc vay khoảng 50%"; do
  chat "$SM1" "$tra"; MUA_LOI+=$'\n'"$LOI"
done
kiem "SM1: có hỏi khu muốn sống / gia đình / nơi làm việc" "$(grep -qiE 'yên tĩnh|khu như|gồm những ai|đi làm|làm việc' <<<"$MUA_LOI" && echo 1 || echo 0)"
kiem "SM1: nhà có ông bà → bot nhắc thang máy" "$(grep -qiE 'thang máy' <<<"$MUA_LOI" && echo 1 || echo 0)"
kiem "SM1: không xin số điện thoại" "$(grep -qiE 'xin số|số điện thoại của anh|số điện thoại của chị|để lại số' <<<"$MUA_LOI" && echo 0 || echo 1)"
PF=$(q "select array_to_json(array(select jsonb_object_keys(coalesce(preferences,'{}'::jsonb)))) as k from buyers where zalo_user_id = '$SM1'" | jq -c '.[0].k // []')
echo "   nhu cầu đã lưu (chỉ tên ô): $PF"
kiem "SM1: nhu cầu mới xuống buyers.preferences" "$(jq -e 'index("thanh_vien") != null' <<<"$PF" >/dev/null && echo 1 || echo 0)"

echo "== sổ lỗi lõi trong khung chạy"
q "select count(*) as so_loi from bot_errors where at >= to_timestamp($BAT_DAU)" | jq -c '.[0]' || true
exit $loi
