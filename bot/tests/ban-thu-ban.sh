#!/usr/bin/env bash
# ban-thu-ban.sh — bắn thử luồng NGƯỜI BÁN trên lõi Python production (SRS-5.1zzzzzzz73), chạy trong apply-migration.yml ô
# `dung_lai` = ban-thu-ban. Kịch bản theo lượt chat thử của chủ dự án 19/10 (nhà phố mặt tiền Cao Lỗ Q8): soi ô tin ghi đủ, và ô
# bot TỰ HỎI mà chủ nhà không trả lời (thương lượng) không được ghi. Chỉ dùng Zalo ID thử (`thu-`); cuối script xoá sạch.
# Cần: TOKEN (Management API), PROJECT_REF. Tiền thật: ~40 lượt chat × vài lượt AI (8 kịch bản, chạy tuần tự).
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
BAN="thu-ban-$RUN"; BAN2="thu-ban2-$RUN"; BAN3="thu-ban3-$RUN"
BAN4="thu-ban4-$RUN"; BAN5="thu-ban5-$RUN"; BAN6="thu-ban6-$RUN"; BAN7="thu-ban7-$RUN"; BAN8="thu-ban8-$RUN"
TAT_CA="$BAN $BAN2 $BAN3 $BAN4 $BAN5 $BAN6 $BAN7 $BAN8"

don() {
  echo "== dọn dữ liệu thử"
  # Lõi trước, DB sau (SRS-5.1zzzzzzz91): dọn DB trước thì tin nhắc / lượt ghi nền của lõi còn chạy tạo lại hội thoại mồ côi
  # (20/10: hội thoại "Khách thử" chỉ có một tin nhắc "bản tin nháp em soạn ở trên").
  vps "for u in $TAT_CA; do curl -sS -X POST http://127.0.0.1:8000/reset/\$u >/dev/null; done" || true
  for u in $TAT_CA; do q "select reset_nguoi_test('$u') as kq" | jq -c '.[0]' || true; done
}
trap don EXIT

# Lượt chat: in từng bong bóng bot trả; trả JSON thô vào biến TRA.
chat() {
  local uid="$1" text="$2"
  echo; echo ">> [$uid] $text"
  TRA=$(jq -n --arg u "$uid" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"
  LOI_BOT+=" $(jq -r '.reply // ""' <<<"$TRA")"
  MOI_LOI+=$'\n'"$(jq -r '.replies[]?' <<<"$TRA" 2>/dev/null || true)"
  LUOT=$((LUOT + 1))
  # SRS-5.1zzzzzzz79: chỉ số "số lượt tới bản nháp" — đo hỏi theo cụm có làm cuộc chat ngắn đi không.
  if [ -z "$LUOT_NHAP" ] && grep -q '📋' <<<"$TRA"; then LUOT_NHAP=$LUOT; fi
}
LOI_BOT=""; LUOT=0; LUOT_NHAP=""; MOI_LOI=""; HOI_SAN=0

for cau in "Mình cần bán nhà phố" "Nhà đường Cao Lỗ, Phường Chánh Hưng, Quận 8" "Nhà mặt tiền" "dt 4,5x11" "Nhà xây 1 trệt 3 lầu" \
           "nhà mình có sổ riêng" "giá 8,5 tỷ" "đã hoàn công đủ" "diện tích sàn tầm 170m vuông"; do
  chat "$BAN" "$cau"
  # SRS-5.1zzzzzzz80: đếm số lượt bot hỏi diện tích sàn trước khi khách nói (kịch bản này khách lờ câu sàn mấy lượt liền).
  if [ "$cau" != "diện tích sàn tầm 170m vuông" ] && [ -z "$LUOT_NHAP" ] && grep -qi 'sàn' <<<"$(jq -r '.reply // ""' <<<"$TRA")"; then
    HOI_SAN=$((HOI_SAN + 1)); fi
  sleep 1
done

echo; echo "== soi DB"
KQ=$(q "select l.code, l.status, l.property_type, l.ward, l.district, l.street, l.area_m2, l.price_vnd, l.floors, l.legal_status, l.access_type,
          l.boc_tach - '_cap_nhat' as boc_tach
        from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN' order by l.updated_at desc limit 1")
jq '.[0]' <<<"$KQ"
r=$(jq '.[0] // {}' <<<"$KQ")
loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
kiem "loại nhà phố" "$(jq '.property_type == "nha_pho" | if . then 1 else 0 end' <<<"$r")"
kiem "phường chuẩn" "$(jq '.ward == "Phường Chánh Hưng" | if . then 1 else 0 end' <<<"$r")"
kiem "Cao Lỗ: khách lờ câu diện tích sàn thì hỏi tối đa 2 lần trước bản nháp (hỏi $HOI_SAN)" "$([ "$HOI_SAN" -le 2 ] && echo 1 || echo 0)"
kiem "giá 8,5 tỷ" "$(jq '.price_vnd == 8500000000 | if . then 1 else 0 end' <<<"$r")"
kiem "diện tích đất 49,5" "$(jq '((.area_m2 // 0) | tonumber) == 49.5 | if . then 1 else 0 end' <<<"$r")"
kiem "mặt tiền" "$(jq '.access_type == "mat_tien" | if . then 1 else 0 end' <<<"$r")"
kiem "sổ hồng riêng" "$(jq '.legal_status == "so_hong_rieng" | if . then 1 else 0 end' <<<"$r")"
kiem "kết cấu có ghi" "$(jq '((.boc_tach.ket_cau // "") != "") or ((.floors // 0) > 0) | if . then 1 else 0 end' <<<"$r")"
kiem "diện tích sàn 170 có ghi" "$(jq '[.boc_tach | to_entries[] | select(.value | tostring | test("170"))] | length > 0 | if . then 1 else 0 end' <<<"$r")"
kiem "KHÔNG có ô thương lượng (chủ nhà không nói)" "$(jq '(.boc_tach.thuong_luong // "") == "" | if . then 1 else 0 end' <<<"$r")"
# SRS-5.1zzzzzzz142: tin nhắn gốc của chủ nhà nằm trong listing_noi_bo.du_lieu.tin_goc (không thêm cột) và đi vào văn bản nhúng.
# Bot hỏi từng ô nên câu trả lời ngắn ("giá 8,5 tỷ", "Nhà mặt tiền") là thông tin chính — bộ lọc không được bỏ chúng.
TG=$(q "select n.du_lieu->>'tin_goc' as tg, public.van_ban_nhung(l.id) as vb from listings l join sellers s on s.id = l.seller_id
        left join listing_noi_bo n on n.listing_id = l.id where s.zalo_user_id = '$BAN' order by l.updated_at desc limit 1")
TIN_GOC=$(jq -r '.[0].tg // ""' <<<"$TG"); VAN_BAN=$(jq -r '.[0].vb // ""' <<<"$TG")
echo "== tin gốc đã lưu:"; echo "$TIN_GOC"
kiem "tin gốc: lời ngắn của chủ nhà giữ nguyên văn (giá 8,5 tỷ · Nhà mặt tiền · dt 4,5x11)" \
  "$(grep -q 'giá 8,5 tỷ' <<<"$TIN_GOC" && grep -q 'Nhà mặt tiền' <<<"$TIN_GOC" && grep -q 'dt 4,5x11' <<<"$TIN_GOC" && echo 1 || echo 0)"
kiem "tin gốc: không lẫn lời bot / bản nháp" "$(grep -q '📋' <<<"$TIN_GOC" && echo 0 || echo 1)"
kiem "văn bản nhúng dùng tin gốc (dòng \"Người bán nhắn\")" "$(grep -q 'Người bán nhắn' <<<"$VAN_BAN" && echo 1 || echo 0)"
echo "== số ô tin: $(jq '.boc_tach | length' <<<"$r")"
echo "== Cao Lỗ: số lượt tới bản nháp: ${LUOT_NHAP:-chưa ra} / $LUOT lượt"

# Kịch bản 2 (SRS-5.1zzzzzzz74, chat thử chủ dự án 19/10 15:19): nhà Âu Cơ Q11 — bot phải TỰ hiểu nhà phố và "80m 5 tầng" là đất,
# không hỏi "nhà phố, chung cư hay đất" / "80m² là đất hay sàn".
LOI_BOT=""; LUOT=0; LUOT_NHAP=""
for cau in "anh cần bán căn nhà ở đường âu cơ, quận 11 em biết đường đó ko" "Phường 9 em" "mặt tiền" "nhà số 110 em" "80m 5 tầng em" \
           "nhà mình ở lâu rồi, sổ riêng" "nhà mình đang ở giá 16 tỉ nhé" "diện tích sàn là 240m"; do
  chat "$BAN2" "$cau"
  [ "$cau" = "nhà mình ở lâu rồi, sổ riêng" ] && LOI_BOT+=" ##DA_NOI_SO## "
  sleep 1
done
KQ2=$(q "select l.property_type, l.area_m2, l.boc_tach - '_cap_nhat' as boc_tach
        from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN2' order by l.updated_at desc limit 1")
jq '.[0]' <<<"$KQ2"
r2=$(jq '.[0] // {}' <<<"$KQ2")
kiem "Âu Cơ: tự hiểu nhà phố" "$(jq '.property_type == "nha_pho" | if . then 1 else 0 end' <<<"$r2")"
kiem "Âu Cơ: 80m 5 tầng là diện tích đất" "$(jq '((.area_m2 // 0) | tonumber) == 80 and ((.boc_tach.dien_tich_dat // "") | test("80")) | if . then 1 else 0 end' <<<"$r2")"
kiem "Âu Cơ: không hỏi loại nhà" "$(grep -qiE 'nhà phố, chung cư|chung cư, nhà phố|chung cư hay|hay lô đất' <<<"$LOI_BOT" && echo 0 || echo 1)"
kiem "Âu Cơ: không hỏi lại tên đường" "$(grep -qiE 'đường nào|trên đường gì' <<<"$LOI_BOT" && echo 0 || echo 1)"
kiem "Âu Cơ: không hỏi lại phường sau khi khách nói Phường 9" "$(grep -qiE 'Phường 9 hay|hay Phường 9' <<<"$LOI_BOT" && echo 0 || echo 1)"
kiem "Âu Cơ: không hỏi đất hay sàn" "$(grep -qiE 'đất hay (diện tích )?(sàn|nhà)|sàn hay (diện tích )?đất' <<<"$LOI_BOT" && echo 0 || echo 1)"
# SRS-5.1zzzzzzz76: đủ đường, phường, đất, tầng, sổ, giá, sàn là ra bản nháp — không hỏi hoàn công / đang ở hay cho thuê trước đó.
kiem "Âu Cơ: ra bản nháp sau câu diện tích sàn" "$(grep -q '📋' <<<"$LOI_BOT" && echo 1 || echo 0)"
echo "== Âu Cơ: số lượt tới bản nháp: ${LUOT_NHAP:-chưa ra} / $LUOT lượt"
SAU_SO="${LOI_BOT#*##DA_NOI_SO##}"; SAU_SO="${SAU_SO%%📋*}"
# 20/10 (SRS-5.1zzzzzzz81): hiện trạng lại hỏi trước bản nháp như bản anh Luận — chỉ còn soát hoàn công / thương lượng.
kiem "Âu Cơ: sau khi khách nói sổ, không hỏi hoàn công / thương lượng trước bản nháp" "$(grep -qiE 'hoàn công|thương lượng' <<<"$SAU_SO" && echo 0 || echo 1)"
# SRS-5.1zzzzzzz75: bot không có số liệu thị trường — không được khen "thanh khoản", "người mua tìm nhiều", bình giá "hợp lý / vừa tầm".
kiem "Âu Cơ: không nhận định thị trường / bình giá" "$(grep -qiE 'thanh khoản|tìm (mua )?nhiều|hợp lý|vừa tầm' <<<"$LOI_BOT" && echo 0 || echo 1)"
# Kịch bản 3 (SRS-5.1zzzzzzz79): khách trả lời ĐÚNG THEO CỤM bot hỏi — bản nháp phải ra trong ≤ 4 lượt (chỉ số hỏi theo cụm; hai kịch
# bản trên mỗi lượt chỉ nói một ý nên luôn ra nháp ở lượt cuối, không đo được).
LOI_BOT=""; LUOT=0; LUOT_NHAP=""
for cau in "chị bán nhà mặt tiền đường Nguyễn Trãi quận 5" "Phường Chợ Quán em" "ngang 4 dài 20, 1 trệt 3 lầu, sàn tầm 300m" \
           "sổ hồng riêng, giá 25 tỷ"; do
  chat "$BAN3" "$cau"
  [ "$LUOT" = 1 ] && LOI_DAU=$(jq -r '.reply // ""' <<<"$TRA")
  sleep 1
done
echo "== Nguyễn Trãi (trả lời theo cụm): số lượt tới bản nháp: ${LUOT_NHAP:-chưa ra} / $LUOT lượt"
kiem "Nguyễn Trãi: trả lời theo cụm thì ra bản nháp trong ≤ 4 lượt" "$([ -n "$LUOT_NHAP" ] && [ "$LUOT_NHAP" -le 4 ] && echo 1 || echo 0)"
# SRS-5.1zzzzzzz85 (người test 20/10: "tiêu đề ngắn thôi — vị trí, diện tích, giá"): tiêu đề = dòng có chữ đầu tiên sau dòng 📋.
TIEU_DE=$(jq -r '.reply // ""' <<<"$TRA" | sed -n '/📋/,$p' | sed 1d | awk 'NF{print; exit}')
echo "== Nguyễn Trãi: tiêu đề \"$TIEU_DE\" ($(wc -w <<<"$TIEU_DE") từ)"
kiem "Nguyễn Trãi: tiêu đề ≤ 15 từ, có đường, diện tích và giá" \
  "$([ -n "$TIEU_DE" ] && [ "$(wc -w <<<"$TIEU_DE")" -le 15 ] && grep -q 'Nguyễn Trãi' <<<"$TIEU_DE" && grep -qE 'm²|m2|[0-9] ?x ?[0-9]' <<<"$TIEU_DE" && grep -q 'tỷ' <<<"$TIEU_DE" && echo 1 || echo 0)"
# Lượt đầu khách chưa nói phường: phường từ kho chỉ được nhắc dạng hỏi, không khẳng định.
# SRS-5.1zzzzzzz81: khách duyệt bản nháp → bot hỏi khách biết phí môi giới chưa (như bản anh Luận), không tự báo con số. Tin chưa
# lên web (còn thiếu ô) thì lượt đó hỏi ô thiếu trước, không hỏi phí.
chat "$BAN3" "ok em, đăng đi"
DUYET=$(jq -r '.reply // ""' <<<"$TRA")
if grep -qi 'aioinhadat' <<<"$DUYET"; then
  kiem "Nguyễn Trãi: khách duyệt → hỏi biết phí môi giới chưa, không tự báo con số" "$(grep -qi 'phí' <<<"$DUYET" && ! grep -qE '[0-9] ?%' <<<"$DUYET" && echo 1 || echo 0)"
else echo "== Nguyễn Trãi: tin chưa lên web sau khi duyệt — không soát câu phí lượt này"; fi
# SRS-5.1zzzzzzz82: tin đã duyệt hiện trên web đúng phường; khách quay lại sửa giá → DB cập nhật.
CODE3=$(q "select l.code, l.status from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN3'
           order by l.updated_at desc limit 1" | jq -r '.[0] | "\(.code) \(.status)"')
read -r MA3 TT3 <<<"$CODE3"
echo "== Nguyễn Trãi: mã $MA3, trạng thái $TT3"
if [[ "$TT3" =~ ^(dang_ban|dang_quan_tam|da_coc)$ ]]; then
  WEB=$(curl -sS -m 30 "https://aioinhadat.vercel.app/nha-dat/$MA3" || true)
  kiem "Nguyễn Trãi: trang tin trên web có đường và phường" "$(grep -q 'Nguyễn Trãi' <<<"$WEB" && grep -q 'Chợ Quán' <<<"$WEB" && echo 1 || echo 0)"
else echo "== Nguyễn Trãi: tin chưa ở trạng thái hiện web — không soát trang web"; fi
chat "$BAN3" "à em ơi, sửa giá căn này còn 24 tỷ nhé"
sleep 3
GIA3=$(q "select l.price_vnd from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN3'
          order by l.updated_at desc limit 1" | jq -r '.[0].price_vnd')
kiem "Nguyễn Trãi: khách quay lại sửa giá → giá 24 tỷ ($GIA3)" "$([ "$GIA3" = 24000000000 ] && echo 1 || echo 0)"
kiem "Nguyễn Trãi: lượt đầu không khẳng định phường từ kho" "$(grep -oiE '(thuộc|nằm ở|ở) (khu vực )?phường [^?.!]*([.!]|$)' <<<"$LOI_DAU" | grep -qviE 'phường nào' && echo 0 || echo 1)"
# ==== Các loại BĐS khác + nhiều căn + xin gặp người (SRS-5.1zzzzzzz82). Kiểm điều tất định (loại, giá, câu hỏi sai loại), không
# chấm câu chữ model.
dong() { q "select l.property_type, l.deal, l.price_vnd, l.bedrooms, l.boc_tach - '_cap_nhat' as boc_tach from listings l
             join sellers s on s.id = l.seller_id where s.zalo_user_id = '$1' order by l.updated_at desc limit 1" | jq -c '.[0] // {}'; }

LOI_BOT=""
for cau in "em bán căn hộ chung cư Sunrise City quận 7, 2 phòng ngủ 76m2" "tầng 12 block V3, giá 4,2 tỷ" \
           "sổ hồng rồi, nội thất đầy đủ" "view sông, phí quản lý tầm 1 triệu 5"; do chat "$BAN4" "$cau"; sleep 1; done
r4=$(dong "$BAN4"); echo "$r4"
kiem "Chung cư: loại căn hộ / chung cư" "$(jq '(.property_type // "") | test("chung_cu|can_ho") | if . then 1 else 0 end' <<<"$r4")"
kiem "Chung cư: giá 4,2 tỷ" "$(jq '.price_vnd == 4200000000 | if . then 1 else 0 end' <<<"$r4")"
kiem "Chung cư: không hỏi hẻm / mặt tiền / mấy tầng lầu" "$(grep -qiE 'hẻm|mặt tiền hay|mấy lầu|trệt' <<<"$LOI_BOT" && echo 0 || echo 1)"

LOI_BOT=""
for cau in "chị cho thuê nhà nguyên căn hẻm xe hơi đường Lê Văn Sỹ quận 3" "giá 25 triệu một tháng em" \
           "ngang 4 dài 16, 1 trệt 2 lầu, 3 phòng ngủ" "cọc 2 tháng, hợp đồng tối thiểu 1 năm"; do chat "$BAN5" "$cau"; sleep 1; done
r5=$(dong "$BAN5"); echo "$r5"
kiem "Cho thuê: tin cho thuê" "$(jq '.deal == "cho_thue" | if . then 1 else 0 end' <<<"$r5")"
kiem "Cho thuê: giá 25 triệu / tháng" "$(jq '.price_vnd == 25000000 | if . then 1 else 0 end' <<<"$r5")"
kiem "Cho thuê: không nói phí 1% giá bán" "$(grep -qE '1 ?% ?(giá|giao)' <<<"$LOI_BOT" && echo 0 || echo 1)"

LOI_BOT=""
for cau in "bán lô đất thổ cư đường Trần Văn Giàu huyện Bình Chánh" "ngang 5 dài 20, full thổ cư, sổ riêng" \
           "đường trước đất rộng 8m, giá 3 tỷ"; do chat "$BAN6" "$cau"; sleep 1; done
r6=$(dong "$BAN6"); echo "$r6"
kiem "Đất: loại đất" "$(jq '(.property_type // "") | test("dat") | if . then 1 else 0 end' <<<"$r6")"
kiem "Đất: giá 3 tỷ" "$(jq '.price_vnd == 3000000000 | if . then 1 else 0 end' <<<"$r6")"
kiem "Đất: không hỏi tầng / phòng ngủ" "$(grep -qiE 'mấy tầng|mấy lầu|phòng ngủ' <<<"$LOI_BOT" && echo 0 || echo 1)"

chat "$BAN7" "anh có 2 căn cần bán: căn 1 nhà hẻm đường Bùi Minh Trực quận 8 giá 5 tỷ, căn 2 nhà mặt tiền đường Phạm Hùng quận 8 giá 12 tỷ"
sleep 3
SO7=$(q "select count(*) as n from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN7'" | jq -r '.[0].n')
kiem "Nhiều căn: một tin nhắn hai căn → hai tin rao ($SO7)" "$([ "$SO7" = 2 ] && echo 1 || echo 0)"

chat "$BAN8" "chị muốn nói chuyện trực tiếp với nhân viên bên em"
NGUOI=$(jq -r '.reply // ""' <<<"$TRA")
sleep 4
CN=$(q "select coalesce(bool_or(c.needs_human), false) as cn,
               (select count(*) from reminders r join sellers s2 on s2.id = r.seller_id where s2.zalo_user_id = '$BAN8') as nhac
          from conversations c join sellers s on s.id = c.seller_id where s.zalo_user_id = '$BAN8'" | jq -c '.[0]')
echo "== xin gặp người: $CN"
kiem "Xin gặp người: bot nói đã báo người phụ trách" "$(grep -qi 'báo' <<<"$NGUOI" && echo 1 || echo 0)"
kiem "Xin gặp người: bật needs_human" "$(jq '.cn == true | if . then 1 else 0 end' <<<"$CN")"
kiem "Xin gặp người: ID thử không nhắn admin" "$(jq '.nhac == 0 | if . then 1 else 0 end' <<<"$CN")"

# SRS-5.1zzzzzzz80: bắn thử 20/10 có 2/3 kịch bản bot mở đầu "Dạ không, em ghi nhận…" khi khách không hỏi gì.
kiem "mọi kịch bản: không bong bóng nào mở đầu \"Dạ không\"" "$(grep -qE '^Dạ không' <<<"$MOI_LOI" && echo 0 || echo 1)"

vps "journalctl -u aond-core --since '-10 min' --no-pager -o cat | grep -E 'Bỏ ô|Kế hoạch:|Đầu ra công cụ' | sed -E 's/[0-9]{9,}/#/g' | tail -40" || true
# SRS-5.1zzzzzzz76: lượt model bị cắt / ra rỗng ghi sổ lỗi (chỉ lý do, không nội dung khách) — in ra để biết lượt nào hụt.
q "select to_char(at, 'HH24:MI:SS') as luc, source, left(detail, 160) as chi_tiet from bot_errors
   where at > now() - interval '15 min' and (source like 'claude%' or source like 'stt%') order by at" | jq -c '.[]' || true
exit $loi
