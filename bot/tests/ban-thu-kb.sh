#!/usr/bin/env bash
# ban-thu-kb.sh — 4 kịch bản tester 20/10/2026 (SRS-5.1zzzzzzz86) trên lõi Python production, chạy trong apply-migration.yml ô
# `dung_lai` = ban-thu-kb. KB1: nhà riêng phân lô mặt ngõ Nguyễn Chí Thanh (Hà Nội — dữ kiện lấy từ đường link tin batdongsan chủ
# dự án gửi: 65m², 7 tầng, MT 4,5m, 22,5 tỷ có thương lượng; trang tin trả 403 nên lời nhắn do tester viết lại, không chép tin).
# Từ bản sửa: KB1 Hà Nội là NGOÀI vùng nhận tin (bot nói khéo, không đăng); KB4 cùng kiểu nhà ở Quận 5 (bịa "ô tô vào", "đăng đi").
# KB2: nhà phố trong dự án LakeView City. KB3: căn hộ trong dự án Masteri Thảo Điền. Mỗi lượt đo thời gian bot trả lời; cuối script in
# số token / chi phí của khung chạy (sổ bot_usage_model — gồm cả khách thật nhắn cùng lúc nếu có), soi DB, trang web, sổ lỗi.
# KB5 (SRS-5.1zzzzzzz87): dựng lại chat tester chị N. Câu bot của mọi kịch bản vào trang Câu chuẩn trước khi dọn (SRS-5.1zzzzzzz88).
# Chỉ Zalo ID thử (`thu-`), cuối script xoá sạch. Tiền thật: ~17 lượt chat × vài lượt AI.
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
KB1="thu-kb1-$RUN"; KB2="thu-kb2-$RUN"; KB3="thu-kb3-$RUN"; KB4="thu-kb4-$RUN"; KB5="thu-kb5-$RUN"
# SRS-5.1zzzzzzz96: 8 ca một lượt đo nhận vùng — 5 ngoài vùng, 3 trong vùng dễ nhầm (Thủ Đức, Dĩ An, Long Thành).
KV=""; for i in 1 2 3 4 5 6 7 8; do KV+=" thu-kv$i-$RUN"; done
TAT_CA="$KB1 $KB2 $KB3 $KB4 $KB5$KV"
BAT_DAU=$(date -u +%s)

don() {
  # SRS-5.1zzzzzzz94: dòng journal "Duyệt:" của lượt bắn — chỉ cờ (AI trả gì, cụm trích có khớp, có lời bảo đăng, kết quả), không có lời
  # khách, để biết lượt bảo đăng hụt ở AI hay ở code.
  echo "== nhật ký lõi: duyệt, vùng, kế hoạch (chỉ cờ + tên ô)"
  # SRS-5.1zzzzzzz96: thêm "Vùng:" / "Kế hoạch:" (tên ô) / "Bỏ …" / "Giữ …" — đều chỉ cờ và tên ô, không có giá trị khách nói.
  vps "journalctl -u aond-core --since @$BAT_DAU -o cat --no-pager | grep -oE '(Duyệt: AI=|Xin đăng: |Vùng: AI=|Kế hoạch: |Bỏ ô |Bỏ cờ |Giữ loại ).*' | tail -120" || true
  # SRS-5.1zzzzzzz88: mọi câu bot của lượt bắn vào trang Câu chuẩn (CRM) kèm ngữ cảnh TRƯỚC khi dọn — chủ dự án chấm / sửa tay dần.
  echo "== đưa câu bot vào Câu chuẩn"
  for u in $TAT_CA; do q "select cau_chuan_tu_zalo('$u') as so_cau" | jq -c '.[0]' || true; done
  echo "== dọn dữ liệu thử"
  # Lõi trước, DB sau (SRS-5.1zzzzzzz91): dọn DB trước thì tin nhắc / lượt ghi nền của lõi còn chạy tạo lại hội thoại mồ côi
  # (20/10: hội thoại "Khách thử" chỉ có một tin nhắc "bản tin nháp em soạn ở trên").
  vps "for u in $TAT_CA; do curl -sS -X POST http://127.0.0.1:8000/reset/\$u >/dev/null; done" || true
  for u in $TAT_CA; do q "select reset_nguoi_test('$u') as kq" | jq -c '.[0]' || true; done
}
trap don EXIT

so_token() { q "select coalesce(sum(calls),0) as calls, coalesce(sum(in_tokens),0) as i, coalesce(sum(out_tokens),0) as o,
                coalesce(sum(cache_write_tokens),0) as cw, coalesce(sum(cache_read_tokens),0) as cr
                from bot_usage_model where day >= current_date - 1" | jq -c '.[0] | map_values(tonumber)'; }   # bigint về dạng chuỗi
TRUOC=$(so_token)

loi=0; LUOT_TONG=0; GIAY_TONG=0; GIAY_MAX=0; MOI_LOI=""; TG_ALL=""
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
chat() {
  local uid="$1" text="$2" t0 t1 g
  echo; echo ">> [$uid] $text"
  t0=$(date +%s%N)
  TRA=$(jq -n --arg u "$uid" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  t1=$(date +%s%N); g=$(( (t1 - t0) / 1000000 ))
  jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"
  echo "   (${g} ms) khâu: $(jq -c '.thoi_gian_ms // {}' <<<"$TRA" 2>/dev/null || echo '{}')"
  # SRS-5.1zzzzzzz96: "ngoai_may_chu" = thời gian đo ở runner trừ thời gian máy chủ báo (ssh + mạng), không phải của bot.
  TG_ALL+="$(jq -c --argjson g "$g" '(.thoi_gian_ms // {}) | if .may_chu then . + {ngoai_may_chu: ($g - .may_chu)} else . end' <<<"$TRA" 2>/dev/null || echo '{}')"$'\n'
  MOI_LOI+=$'\n'"$(jq -r '.replies[]?' <<<"$TRA" 2>/dev/null || true)"
  LUOT_TONG=$((LUOT_TONG + 1)); GIAY_TONG=$((GIAY_TONG + g)); [ "$g" -gt "$GIAY_MAX" ] && GIAY_MAX=$g
  if grep -q '📋' <<<"$TRA"; then
    # Bản tin cập nhật ghi tiêu đề NGAY trên dòng 📋 ("📋 Bản tin cập nhật: <tiêu đề>"); bản nháp đầu thì tiêu đề ở dòng kế
    # (SRS-5.1zzzzzzz105: lượt 205 đọc nhầm đoạn mô tả thành tiêu đề 111 từ).
    TIEU_DE=$(jq -r '.reply // ""' <<<"$TRA" | sed -n '/📋/,$p' | awk 'NR==1{sub(/^.*📋[^:]*:[ ]*/,""); if (NF) {print; exit} next} NF{print; exit}')
  fi
  sleep 1
}
dong() { q "select l.code, l.status, l.property_type, l.deal, l.price_vnd, l.area_m2, l.floors, l.frontage_m, l.bedrooms,
              l.access_type, l.alley_width_m, l.negotiable, l.legal_status, l.ward, l.district, l.street, p.name as du_an,
              l.boc_tach - '_cap_nhat' as boc_tach
            from listings l join sellers s on s.id = l.seller_id left join projects p on p.id = l.project_id
            where s.zalo_user_id = '$1' order by l.updated_at desc limit 1" | jq -c '.[0] // {}'; }
tieu_de_dat() {   # $1 = chữ phải có (vị trí); tiêu đề ≤ 15 từ, có vị trí, diện tích, giá
  [ -n "$TIEU_DE" ] && [ "$(wc -w <<<"$TIEU_DE")" -le 15 ] && grep -qiE "$1" <<<"$TIEU_DE" \
    && grep -qE 'm²|m2|[0-9]+([.,][0-9]+)? ?x ?[0-9]+([.,][0-9]+)? ?m' <<<"$TIEU_DE" && grep -qE 'tỷ|triệu' <<<"$TIEU_DE" && echo 1 || echo 0
}
web_co() {   # trang tin trên web có chữ $2 (tin mã $1)
  # Đọc hết trang rồi mới dò (SRS-5.1zzzzzzz93): `curl | grep -q` dưới pipefail — grep thoát sớm, curl ghi vào ống đã đóng (lỗi 23),
  # cả ống thành "trượt" dù trang có chữ cần tìm (bắn thử 21/10).
  local trang; trang=$(curl -sS -m 30 "https://aioinhadat.vercel.app/nha-dat/$1" || true)
  grep -qi "$2" <<<"$trang" && echo 1 || echo 0
}

echo "=================== KB1 — nhà phân lô mặt ngõ Nguyễn Chí Thanh, Đống Đa, Hà Nội (ngoài vùng nhận tin) ==================="
# 20/10/2026 chủ dự án: chỉ nhận TP.HCM, Bình Dương, Vũng Tàu, Long An, Tây Ninh, Đồng Nai → nói khéo, không hỏi, không soạn, không đăng.
TIEU_DE=""
for cau in "Bán nhà riêng phân lô mặt ngõ đường Nguyễn Chí Thanh, kinh doanh được, 65m2, 7 tầng, mặt tiền 4,5m, giá 22,5 tỷ có thương lượng" \
           "nhà ở quận Đống Đa, Hà Nội em"; do
  chat "$KB1" "$cau"
done
LOI_KB1_2=$(jq -r '.reply // ""' <<<"$TRA")
chat "$KB1" "ok em đăng đi"
r1=$(dong "$KB1"); echo "$r1"
kiem "KB1: biết Hà Nội thì không hỏi phường nữa" "$(grep -qi 'phường' <<<"$LOI_KB1_2" && echo 0 || echo 1)"
kiem "KB1: không ra bản nháp 📋" "$([ -z "$TIEU_DE" ] && echo 1 || echo 0)"
kiem "KB1: tin không lên web (ẩn hoặc không tạo)" "$(jq '(.status // "an") == "an" | if . then 1 else 0 end' <<<"$r1")"

echo; echo "=================== KB4 — cùng kiểu nhà, hẻm 3m Nguyễn Chí Thanh Quận 5 (TP.HCM) ==================="
TIEU_DE=""
for cau in "Bán nhà hẻm đường Nguyễn Chí Thanh quận 5, kinh doanh được, 65m2, 7 tầng, ngang 4,5m, giá 22,5 tỷ có thương lượng" \
           "hẻm trước nhà rộng 3m" "ok em đăng đi"; do
  chat "$KB4" "$cau"
done
r4=$(dong "$KB4"); echo "$r4"
echo "== KB4 tiêu đề: \"$TIEU_DE\" ($(wc -w <<<"$TIEU_DE") từ)"
kiem "KB4: giá 22,5 tỷ" "$(jq '.price_vnd == 22500000000 | if . then 1 else 0 end' <<<"$r4")"
kiem "KB4: 7 tầng" "$(jq '.floors == 7 | if . then 1 else 0 end' <<<"$r4")"
kiem "KB4: có thương lượng" "$(jq '.negotiable == true | if . then 1 else 0 end' <<<"$r4")"
kiem "KB4: hẻm, không phải mặt tiền đường" "$(jq '(.access_type // "") | test("hem") | if . then 1 else 0 end' <<<"$r4")"
kiem "KB4: không ô nào bịa \"ô tô vào\" từ hẻm 3m" "$(jq '[.boc_tach[]? | strings | test("ô tô|xe hơi")] | any | not | if . then 1 else 0 end' <<<"$r4")"
kiem "KB4: \"đăng đi\" — ra 📋 thật hoặc hỏi ý còn thiếu, không bài đăng giả" \
     "$([ -n "$TIEU_DE" ] || ! grep -qE '^- ' <<<"$(jq -r '.reply // ""' <<<"$TRA")" && echo 1 || echo 0)"
if [ -n "$TIEU_DE" ]; then kiem "KB4: tiêu đề ≤ 15 từ, có Nguyễn Chí Thanh, diện tích, giá" "$(tieu_de_dat 'Nguyễn Chí Thanh')"; fi

echo; echo "=================== KB2 — nhà phố trong dự án LakeView City ==================="
TIEU_DE=""; MOC_KB2=${#MOI_LOI}
for cau in "Em gửi căn nhà phố LakeView City, 5x20, 1 trệt 3 lầu, 4 phòng ngủ, giá 27 tỷ" \
           "sổ hồng riêng, đang cho thuê 50 triệu/tháng" "hướng Đông Nam, nội thất cơ bản" "ok đăng đi em"; do
  chat "$KB2" "$cau"
done
r2=$(dong "$KB2"); echo "$r2"
echo "== KB2 tiêu đề: \"$TIEU_DE\" ($(wc -w <<<"$TIEU_DE") từ)"
kiem "KB2: nhà phố trong dự án không bị hỏi tầng / tòa" "$(grep -qi 'tòa' <<<"${MOI_LOI:$MOC_KB2}" && echo 0 || echo 1)"
kiem "KB2: nhà phố" "$(jq '.property_type == "nha_pho" | if . then 1 else 0 end' <<<"$r2")"
kiem "KB2: gắn dự án LakeView City" "$(jq '(.du_an // "") | test("(?i)lake ?view") | if . then 1 else 0 end' <<<"$r2")"
kiem "KB2: phường An Phú (từ dự án)" "$(jq '(.ward // "") | test("An Phú|An Khánh") | if . then 1 else 0 end' <<<"$r2")"
kiem "KB2: giá 27 tỷ" "$(jq '.price_vnd == 27000000000 | if . then 1 else 0 end' <<<"$r2")"
kiem "KB2: diện tích 100" "$(jq '((.area_m2 // 0) | tonumber) == 100 | if . then 1 else 0 end' <<<"$r2")"
kiem "KB2: 4 tầng" "$(jq '.floors == 4 | if . then 1 else 0 end' <<<"$r2")"
kiem "KB2: 4 phòng ngủ" "$(jq '.bedrooms == 4 | if . then 1 else 0 end' <<<"$r2")"
if [ -n "$TIEU_DE" ]; then kiem "KB2: tiêu đề ≤ 15 từ, có LakeView, diện tích, giá" "$(tieu_de_dat 'lake ?view')"
else echo "== KB2: chưa ra bản nháp (còn thiếu ô tối thiểu — mã căn / diện tích sàn), không kiểm tiêu đề"; fi

echo; echo "=================== KB3 — căn hộ trong dự án Masteri Thảo Điền ==================="
TIEU_DE=""
for cau in "Cần bán căn hộ Masteri Thảo Điền 2PN 2WC 68m2, tháp T3 tầng 15, view sông, giá 6,8 tỷ còn thương lượng" \
           "sổ hồng rồi em, full nội thất" "phí quản lý khoảng 1,2 triệu" "ok đăng đi"; do
  chat "$KB3" "$cau"
done
r3=$(dong "$KB3"); echo "$r3"
echo "== KB3 tiêu đề: \"$TIEU_DE\" ($(wc -w <<<"$TIEU_DE") từ)"
kiem "KB3: căn hộ / chung cư" "$(jq '(.property_type // "") | test("chung_cu|can_ho") | if . then 1 else 0 end' <<<"$r3")"
kiem "KB3: gắn dự án Masteri Thảo Điền" "$(jq '(.du_an // "") | test("(?i)masteri th") | if . then 1 else 0 end' <<<"$r3")"
kiem "KB3: phường Thảo Điền (từ dự án)" "$(jq '(.ward // "") | test("Thảo Điền|An Khánh") | if . then 1 else 0 end' <<<"$r3")"
kiem "KB3: giá 6,8 tỷ" "$(jq '.price_vnd == 6800000000 | if . then 1 else 0 end' <<<"$r3")"
kiem "KB3: 2 phòng ngủ" "$(jq '.bedrooms == 2 | if . then 1 else 0 end' <<<"$r3")"
kiem "KB3: có thương lượng" "$(jq '.negotiable == true | if . then 1 else 0 end' <<<"$r3")"
kiem "KB3: tiêu đề ≤ 15 từ, có Masteri, diện tích, giá" "$(tieu_de_dat 'masteri')"
kiem "KB3: tiêu đề căn hộ không có \"MT\"" "$(grep -qw 'MT' <<<"$TIEU_DE" && echo 0 || echo 1)"
kiem "KB3: không hỏi hẻm / mặt tiền" "$(grep -qiE 'hẻm|mặt tiền' <<<"$(jq -r '.reply' <<<"$TRA")" && echo 0 || echo 1)"
# SRS-5.1zzzzzzz94: sau bản nháp bot ghi thêm phí quản lý (tin ngay trước không còn là bản nháp) — "ok đăng đi" vẫn là duyệt.
kiem "KB3: \"ok đăng đi\" sau khi bot ghi thêm ý vẫn là duyệt — tin lên web" "$(jq '.status == "dang_ban" | if . then 1 else 0 end' <<<"$r3")"

echo; echo "=================== KB5 — chat tester chị N. 20/10: nhà trong Ny'ah Phú Định, dtsd, MT 20m, ok liên tục ==================="
# SRS-5.1zzzzzzz87: duyệt bản nháp hỏi lại mãi; "dtsd: 245m" vào ô đất; "MT 20 mét" (đường) thành bề ngang; tên dự án không dấu.
TIEU_DE=""; MOC_KB5=${#MOI_LOI}
for cau in "mình cần bán nhà trong khu dự án Nyah Phu Dinh"            "Bán nhà trong khu dân cư Nyah Phú Định, Trương Đình Hội • MT 20 mét, giá 6,95 tỷ, DT 4 x 11m, 1 trệt 1 lửng 3 lầu sân thượng, garage trong nhà, SHR hoàn công đầy đủ"            "dtsd: 245m vuông"; do
  chat "$KB5" "$cau"
done
# SRS-5.1zzzzzzz94: "rao tin này giúp mình" — đã có bản nháp thì là DUYỆT (tin lên web ngay lượt đó); chưa có thì là xin soạn tin (ra 📋).
NHAP_TRUOC=$(grep -c '📋' <<<"${MOI_LOI:$MOC_KB5}" || true)
chat "$KB5" "rao tin này giúp mình"
TT_RAO=$(dong "$KB5" | jq -r '.status // ""'); LOI_RAO=$(jq -r '.reply // ""' <<<"$TRA")
chat "$KB5" "ok"
LOI_KB5_CUOI=$(jq -r '.reply // ""' <<<"$TRA")
chat "$KB5" "ok"
r5=$(dong "$KB5"); echo "$r5"
kiem "KB5: gắn dự án Ny'ah Phú Định (khách gõ không dấu)" "$(jq "(.du_an // \"\") | test(\"(?i)ny.?ah\") | if . then 1 else 0 end" <<<"$r5")"
kiem "KB5: dtsd 245 vào diện tích sàn, không vào ô đất" \
     "$(jq '((.boc_tach.dien_tich_nha // "") | test("245")) and (((.boc_tach.dien_tich_dat // "") | test("245")) | not) | if . then 1 else 0 end' <<<"$r5")"
kiem "KB5: diện tích đất 44 (4x11)" "$(jq '((.area_m2 // 0) | tonumber) == 44 | if . then 1 else 0 end' <<<"$r5")"
kiem "KB5: \"MT 20 mét\" không thành bề ngang 20m" "$(jq '((.frontage_m // 0) | tonumber) != 20 and (((.boc_tach.mat_tien // "") | test("20")) | not) | if . then 1 else 0 end' <<<"$r5")"
kiem "KB5: một cụm không vào hai ô pháp lý" "$(jq '(.boc_tach.phap_ly // "x") != (.boc_tach.phap_ly_hoan_cong // "y") | if . then 1 else 0 end' <<<"$r5")"
if [ "${NHAP_TRUOC:-0}" -gt 0 ]; then
  kiem "KB5: \"rao tin này giúp mình\" sau bản nháp là duyệt (tin lên web ngay lượt đó)" "$([ "$TT_RAO" = dang_ban ] && echo 1 || echo 0)"
else
  kiem "KB5: \"rao tin này giúp mình\" khi chưa có bản nháp thì ra bản nháp" "$(grep -q '📋' <<<"$LOI_RAO" && echo 1 || echo 0)"
fi
# SRS-5.1zzzzzzz95: `alley_width_m` = độ rộng ĐƯỜNG VÀO; "MT 20 mét" cạnh tên đường là đường rộng 20 m, không phải ngang căn 20 m.
kiem "KB5: \"MT 20 mét\" là đường rộng 20 m (cột đường vào)" "$(jq '((.alley_width_m // 0) | tonumber) == 20 | if . then 1 else 0 end' <<<"$r5")"
kiem "KB5: khách ok rồi thì tin lên web" "$(jq '.status == "dang_ban" | if . then 1 else 0 end' <<<"$r5")"
kiem "KB5: sau \"ok\" bot không hỏi xác nhận lại" "$(grep -qiE 'xác nhận (giúp|lại|lần)|đã ổn chưa' <<<"$LOI_KB5_CUOI$(jq -r '.reply // ""' <<<"$TRA")" && echo 0 || echo 1)"

echo; echo "=================== KV — nhận vùng nhận tin (8 ca, một lượt) ==================="
# SRS-5.1zzzzzzz96 (chủ dự án 21/10: "đo thêm"): lượt 194 KB1 Hà Nội lọt một lần — đo tỷ lệ thay vì một ca.
KV_CA=("ngoai|Bán nhà mặt phố Hoàng Quốc Việt, Cầu Giấy, Hà Nội, 50m2, 5 tầng, giá 15 tỷ"
       "ngoai|Cần bán căn hộ 2PN ở Sơn Trà, Đà Nẵng, view biển, giá 3,2 tỷ"
       "ngoai|Bán lô đất 100m2 ở Ninh Kiều, Cần Thơ, giá 2 tỷ"
       "ngoai|Nhà 4x15 đường Lạch Tray, Ngô Quyền, Hải Phòng, 3 tầng, giá 6 tỷ"
       "ngoai|Bán nhà hẻm 3m đường Trần Phú, Nha Trang, 60m2, giá 4,5 tỷ"
       "trong|Bán nhà hẻm xe hơi đường Võ Văn Ngân, Thủ Đức, 4x16, 2 lầu, giá 7 tỷ"
       "trong|Bán nhà 1 trệt 1 lầu ở Dĩ An, 5x20, giá 3,5 tỷ"
       "trong|Bán đất 200m2 ở Long Thành, Đồng Nai, giá 2,8 tỷ")
KV_DUNG=0; i=0
for ca in "${KV_CA[@]}"; do
  i=$((i + 1)); loai="${ca%%|*}"; u="thu-kv$i-$RUN"
  chat "$u" "${ca#*|}"
  # Lần lưu cuối của lượt chạy nền (SRS-5.1zzzzzzz92) — đọc DB ngay thì tin chưa kịp tạo (lượt 198: 3 ca "khong_tao" oan; lượt
  # 203: chờ 4 giây vẫn hụt một ca). Chờ có giới hạn: tin trong vùng phải có dòng trong 15 giây; ngoài vùng thì đợi đủ 15 giây.
  for _ in 1 2 3 4 5; do sleep 3; st=$(dong "$u" | jq -r '.status // "khong_tao"'); [ "$st" != khong_tao ] && break; done
  # Trong vùng mà khách chưa nói tên đường thì tin chưa có dòng (lượt 205: Dĩ An, Long Thành — bot hỏi đường đúng nhưng chấm SAI).
  # Chấm theo lời bot: ngoài vùng phải nói "chưa nhận" và không có tin đang mở; trong vùng thì không nói "chưa nhận" và tin không ẩn.
  loi_kv=$(jq -r '[.replies[]?] | join(" ")' <<<"$TRA" 2>/dev/null || true)
  if [ "$loai" = ngoai ]; then ok=$({ [ "$st" = an ] || [ "$st" = khong_tao ]; } && grep -qi 'chưa nhận' <<<"$loi_kv" && echo 1 || echo 0)
  else ok=$([ "$st" != an ] && ! grep -qi 'chưa nhận' <<<"$loi_kv" && echo 1 || echo 0); fi
  echo "   KV$i ($loai vùng): tin $st → $([ "$ok" = 1 ] && echo đúng || echo SAI)"
  KV_DUNG=$((KV_DUNG + ok))
done
echo "== nhận vùng: đúng $KV_DUNG / ${#KV_CA[@]}"
kiem "KV: nhận vùng đúng ≥ 7/8 ca" "$([ "$KV_DUNG" -ge 7 ] && echo 1 || echo 0)"

echo; echo "=================== web, giọng, chi phí, thời gian, sổ lỗi ==================="
for r in "$r1" "$r2" "$r3" "$r4" "$r5"; do
  ma=$(jq -r '.code // empty' <<<"$r"); st=$(jq -r '.status // empty' <<<"$r")
  [ -z "$ma" ] && continue
  if [ "$st" = dang_ban ] || [ "$st" = dang_quan_tam ]; then
    kiem "web: trang tin $ma (status $st) mở được, có giá" "$(web_co "$ma" 'tỷ')"
  else
    echo "== web: tin $ma status $st — chưa lên web"
  fi
done
kiem "giọng: không bong bóng nào mở đầu \"Dạ\"" "$(grep -qE '^Dạ' <<<"$MOI_LOI" && echo 0 || echo 1)"
kiem "giọng: không gọi khách là \"bạn\"" "$(grep -qiE '(^|[ ,.!?])bạn([ ,.!?]|$)' <<<"$MOI_LOI" && echo 0 || echo 1)"
sleep 5   # sổ token ghi nền
SAU=$(so_token)
jq -n --argjson a "$TRUOC" --argjson b "$SAU" --argjson n "$LUOT_TONG" '
  ($b.calls - $a.calls) as $c | ($b.i - $a.i) as $i | ($b.o - $a.o) as $o | ($b.cw - $a.cw) as $cw | ($b.cr - $a.cr) as $cr |
  (($i*0.1 + $o*0.5 + $cw*0.125 + $cr*0.01) / 1000000) as $usd |
  {luot_chat: $n, luot_goi_model: $c, token_vao: $i, token_ra: $o, ghi_cache: $cw, doc_cache: $cr,
   usd_tong: ($usd*10000|round/10000), usd_moi_luot_chat: (if $n > 0 then ($usd/$n*100000|round/100000) else null end),
   ghi_chu: "giá Haiku 5.5 bậc thấp (lib/gia-model.ts); gồm cả khách thật nhắn cùng khung nếu có"}'
echo "== trung bình ms từng khâu trong lõi (lap_thao_tac / tra_loi / ghi_kho / con_lai / tong):"
jq -s -c 'map(select(length > 0)) as $a | ($a | length) as $n | if $n == 0 then {} else
  ([$a[] | keys[]] | unique) as $k | reduce $k[] as $x ({}; .[$x] = (([$a[] | .[$x] // 0] | add) / $n | round)) end' <<<"$TG_ALL" || true
echo "== chậm nhất từng khâu (ms):"
jq -s -c 'map(select(length > 0)) as $a | ([$a[] | keys[]] | unique) as $k | reduce $k[] as $x ({}; .[$x] = ([$a[] | .[$x] // 0] | max))' <<<"$TG_ALL" || true
echo "== 3 lượt chậm nhất (theo máy chủ):"
jq -s -c 'map(select(length > 0)) | sort_by(-(.may_chu // .tong // 0)) | .[:3][]' <<<"$TG_ALL" || true
echo "== thời gian bot trả lời: trung bình $(( GIAY_TONG / (LUOT_TONG > 0 ? LUOT_TONG : 1) )) ms / lượt, chậm nhất $GIAY_MAX ms ($LUOT_TONG lượt)"
q "select to_char(at, 'HH24:MI:SS') as luc, source, left(detail, 160) as chi_tiet from bot_errors
   where at > now() - interval '20 min' and source not in ('geocode-listings') order by at" | jq -c '.[]' || true
exit $loi
