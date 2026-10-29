#!/usr/bin/env bash
# ban-thu-kiem.sh — bắn thử production các việc đã có code + test offline nhưng CHƯA kiểm thật (SRS-5.1zzzzzzz268, chủ dự án 29/10/2026: "kiểm đi"
# sau bảng soát SRS-267). Chạy trong apply-migration.yml ô `dung_lai` = ban-thu-kiem. Chỉ Zalo ID thử (`thu-`), tự dọn (trừ khi GIU_DU_LIEU=giu).
#   A. Lời chào số tư vấn (SRS-261)            B. Tìm nhà theo số tầng (SRS-262)
#   C. Khách hỏi đúng một căn không có (262)    D. Khách gõ mã căn không có (SRS-264)
#   E. Kho xưởng: đủ vị trí · diện tích · pháp lý mới ra bản nháp (SRS-263)
#   F. Chủ nhà hai căn gửi ảnh → ảnh vào căn khách mua đang xin (SRS-258 / 254)
#   G. Sticker tới dạng ảnh .png → đọc như lời chào, không lưu thành ảnh căn (SRS-255)
# Kiểm điều tất định (DB, mã căn trong link); câu chữ bot in ra ở dòng << cho người đọc. Từ khoá trong lời bot chỉ là lưới đỡ.
# Cần: TOKEN (Management API), PROJECT_REF. Tiền thật: ~16 lượt chat.
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
TV="thu-kiem-tv-$RUN"; MUA="thu-kiem-mua-$RUN"; KHO="thu-kiem-kho-$RUN"; CHU="thu-kiem-chu-$RUN"; MUA2="thu-kiem-mua2-$RUN"; ST="thu-kiem-st-$RUN"
TAT_CA="$TV $MUA $KHO $CHU $MUA2 $ST"
MA_A=$(printf 'A%07X' $(( RUN % 268435456 ))); MA_B=$(printf 'B%07X' $(( RUN % 268435456 )))

don() {
  echo "== dọn dữ liệu thử"
  [ "${GIU_DU_LIEU:-}" = giu ] && return 0
  vps "for u in $TAT_CA; do curl -sS -X POST http://127.0.0.1:8000/reset/\$u >/dev/null; done" || true
  for u in $TAT_CA; do q "select reset_nguoi_test('$u') as kq" | jq -c '.[0]' || true; done
}
trap don EXIT

LOI=""; MOI_LOI=""
gui() {   # gui <uid> <json payload thêm> <mô tả>
  local uid="$1" them="$2" mo_ta="$3"
  echo; echo ">> [$uid] $mo_ta"
  TRA=$(jq -n --arg u "$uid" --argjson t "$them" '{external_user_id:$u, sender_name:"Khách thử"} + $t' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"
  LOI="$(jq -r '[.replies[]?] | join("\n")' <<<"$TRA" 2>/dev/null || true)"
  MOI_LOI+=$'\n'"$LOI"
  sleep "${NGHI_GIUA_LUOT:-12}"
}
chat() { gui "$1" "$(jq -n --arg t "$2" '{text:$t}')" "$2"; }
loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
mot() { q "$1" | jq -r '.[0].n // 0'; }

# ==== A. Lời chào số tư vấn (SRS-261)
gui "$TV" '{"text":"alo em","so_nhan":"tu_van"}' "alo em (số tư vấn)"
kiem "A: lời chào số tư vấn nói rõ vai tư vấn mua / thuê" "$(grep -qi 'tư vấn mua' <<<"$LOI" && echo 1 || echo 0)"
kiem "A: lời chào không hỏi gửi bán" "$(grep -qi 'gửi bán' <<<"$LOI" && echo 0 || echo 1)"

# ==== B. Tìm nhà theo số tầng (SRS-262): rổ mẫu Quận 5 có căn 4 tầng ≤ 12 tỷ — căn bot đưa ra phải đủ 4 tầng.
chat "$MUA" "Chào em, anh tìm mua nhà phố quận 5, tài chính tầm 12 tỷ, nhà 1 trệt 3 lầu nha"
MA_GOI=$(grep -oE 'nha-dat/[0-9A-Z]{8}' <<<"$LOI" | head -1 | cut -d/ -f2 || true)
TANG=$( [ -n "$MA_GOI" ] && q "select coalesce(floors, 0) as n from listings where code = '$MA_GOI'" | jq -r '.[0].n // 0' || echo 0)
echo "== B: căn bot gợi ý: ${MA_GOI:-không có} · số tầng: $TANG"
kiem "B: căn gợi ý cho khách cần 4 tầng có đủ 4 tầng (căn $MA_GOI, $TANG tầng)" "$([ "${TANG:-0}" -ge 4 ] && echo 1 || echo 0)"

# ==== C. Khách hỏi đúng một căn không có trên hệ thống (SRS-262)
chat "$MUA" "Cho anh hỏi căn nhà hẻm xe hơi đường Nguyễn Chí Thanh quận 5 giá 11 tỷ 7 đăng hôm qua còn không em?"
kiem "C: căn khách tả không có → bot nói thẳng chưa thấy (lưới đỡ bằng chữ)" \
  "$(grep -qiE 'chưa (thấy|tìm thấy|có)|không (thấy|tìm thấy)' <<<"$LOI" && echo 1 || echo 0)"

# ==== D. Khách gõ mã căn không có (SRS-264)
chat "$MUA" "Căn mã #ZZZZ9999 còn bán không em?"
kiem "D: mã căn không có → bot nói thẳng chưa thấy căn mã đó (lưới đỡ bằng chữ)" \
  "$(grep -qiE 'chưa (thấy|tìm thấy|có)|không (thấy|tìm thấy|có căn)|kiểm tra lại|gửi (giúp )?(em )?link' <<<"$LOI" && echo 1 || echo 0)"

# ==== E. Kho xưởng (SRS-263): chưa có sổ thì chưa ra bản nháp; có sổ thì ra.
NHAP_TRUOC_SO=0
for cau in "Anh cần bán kho xưởng ở huyện Đức Hòa, Long An" "Diện tích 1.000m2, đường xe container vào được" "Giá 20 tỷ em"; do
  chat "$KHO" "$cau"; grep -q '📋' <<<"$LOI" && NHAP_TRUOC_SO=1
done
kiem "E: kho xưởng chưa nói pháp lý thì CHƯA ra bản nháp" "$([ "$NHAP_TRUOC_SO" = 0 ] && echo 1 || echo 0)"
kiem "E: bot hỏi pháp lý / sổ" "$(grep -qiE 'sổ|pháp lý' <<<"$LOI" && echo 1 || echo 0)"
chat "$KHO" "Sổ đỏ riêng, đất SKC 50 năm"
if ! grep -q '📋' <<<"$LOI"; then chat "$KHO" "Vậy đủ rồi đó em"; fi
kiem "E: có sổ thì ra bản nháp 📋" "$(grep -q '📋' <<<"$LOI" && echo 1 || echo 0)"

# ==== F. Chủ nhà hai căn: khách mua xin thêm ảnh căn B → chủ nhà gửi ảnh lúc đang nói căn A → ảnh vào căn B (SRS-258)
q "with s as (insert into sellers (zalo_user_id, seller_type) values ('$CHU', 'ccrb') returning id)
   insert into listings (code, seller_id, deal, property_type, district, ward, street, area_m2, price_raw, price_vnd, status, source, description, updated_at)
   select x.code, s.id, 'ban', 'nha_pho', 'Quận 5', 'Phường Chợ Quán', x.duong, 60, '9 tỷ', 9000000000, 'dang_ban', 'chat', 'Tin thử bắn tự động', x.luc
     from s, (values ('$MA_B', 'Trần Hưng Đạo', now() - interval '1 hour'), ('$MA_A', 'An Dương Vương', now())) as x(code, duong, luc)
   returning code" | jq -c '.'
chat "$MUA2" "Chào em, anh tìm nhà phố quận 5 tầm 9 tỷ. Căn #$MA_B gửi anh thêm ảnh thực tế được không em?"
XIN=$(mot "select count(*) as n from info_requests r join listings l on l.id = r.listing_id where l.code = '$MA_B' and r.question = 'Khách xin thêm ảnh thực tế của căn' and r.status = 'pending'")
kiem "F: khách xin ảnh căn chưa có ảnh → câu xin ảnh giao chủ nhà (info_requests)" "$([ "$XIN" -ge 1 ] && echo 1 || echo 0)"
# Ảnh nhà thật có sẵn trên web của dự án (public/img/house1.jpg). Ảnh rổ mẫu SEED là ảnh minh hoạ — AI chấm ảnh (OPEN-53) bỏ đúng,
# lần bắn 29/10 trượt F vì thế (SRS-5.1zzzzzzz268).
ANH="https://aioinhadat.vercel.app/img/house1.jpg"
curl -sS -m 20 -o /dev/null -f "$ANH" || ANH=""
if [ -n "$ANH" ]; then
  gui "$CHU" "$(jq -n --arg u "$ANH" '{text:"", image_urls:[$u]}')" "(chủ nhà gửi 1 ảnh, không kèm chữ)"
  for _ in $(seq 1 20); do [ "$(mot "select count(*) as n from listing_media m join listings l on l.id = m.listing_id where l.code = '$MA_B'")" -ge 1 ] && break; sleep 2; done
  VAO_B=$(mot "select count(*) as n from listing_media m join listings l on l.id = m.listing_id where l.code = '$MA_B'")
  VAO_A=$(mot "select count(*) as n from listing_media m join listings l on l.id = m.listing_id where l.code = '$MA_A'")
  echo "== F: ảnh vào căn B: $VAO_B · căn A: $VAO_A"
  kiem "F: ảnh chủ nhà vào ĐÚNG căn khách xin (B), không vào căn đang nói (A)" "$([ "$VAO_B" -ge 1 ] && [ "$VAO_A" = 0 ] && echo 1 || echo 0)"
  DA_TL=$(mot "select count(*) as n from info_requests r join listings l on l.id = r.listing_id where l.code = '$MA_B' and r.question = 'Khách xin thêm ảnh thực tế của căn' and r.status = 'answered'")
  kiem "F: câu xin ảnh chuyển answered (khách sẽ được báo lại)" "$([ "$DA_TL" -ge 1 ] && echo 1 || echo 0)"
else
  echo "TRƯỢT F: không tìm được ảnh mẫu công khai để gửi"; loi=1
fi

# ==== G. Sticker Zalo tới dạng ảnh .png (SRS-255): đọc như lời chào, không tạo tin / không lưu ảnh căn.
gui "$ST" '{"text":"","image_urls":["https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f44b.png"]}' "(khách mới gửi sticker vẫy tay dạng .png)"
ANH_ST=$(mot "select count(*) as n from listing_media m join listings l on l.id = m.listing_id join sellers s on s.id = l.seller_id where s.zalo_user_id = '$ST'")
kiem "G: sticker không bị lưu thành ảnh căn" "$([ "$ANH_ST" = 0 ] && echo 1 || echo 0)"
kiem "G: bot đáp như lời chào (lưới đỡ bằng chữ)" "$(grep -qiE 'chào|xin chào' <<<"$LOI" && echo 1 || echo 0)"

kiem "mọi lượt: không bong bóng nào mở đầu \"Dạ\"" "$(grep -qE '^Dạ' <<<"$MOI_LOI" && echo 0 || echo 1)"
vps "journalctl -u aond-core --since '-15 min' --no-pager -o cat | grep -E 'Ảnh chủ nhà|Bỏ ô|Lời bot lệch luật|lỗi' | sed -E 's/[0-9]{9,}/#/g' | tail -30" || true
exit $loi
