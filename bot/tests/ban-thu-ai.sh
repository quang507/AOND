#!/usr/bin/env bash
# ban-thu-ai.sh — bắn thử 11 mục do AI đọc theo NGHĨA trên lõi Python production (chủ dự án 28/10/2026: "viết kịch bản bắn thử cho 11 mục
# nhóm AI"), chạy trong apply-migration.yml ô `dung_lai` = ban-thu-ai. Test offline của các mục này dùng model giả — chỉ kiểm code nhận đúng KHI
# AI trả đúng; kịch bản này kiểm model thật có đọc ra đúng không. Mục: 162 ("ok" sau lịch đã chốt), 169 (xin ảnh), 171 (không gọi khách
# "mình"), 175 (tắt báo căn / chê căn), 176 (kho pháp lý + câu nhạy cảm), 178 (lượt không cần câu hỏi — GHI NHẬN, không tính trượt), 179
# (giá/m², thuế phí theo căn), 181 (gắn dự án, tên trợ lý), 184 / 185 (hỏi dự án theo chữ / theo nghĩa), 191 (phường cũ bị chia).
# Chỉ Zalo ID thử (`thu-`, la_id_thu); căn dùng là rổ mẫu `seed_thu`. Cuối script (kể cả khi hỏng) xoá sạch qua /reset của lõi + reset_nguoi_test.
# Cần: TOKEN (Management API), PROJECT_REF. Tiền thật: ~20 lượt chat × vài lượt AI (Haiku).
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
BAN="thu-ai-ban-$RUN"; DA="thu-ai-da-$RUN"; MUA="thu-ai-mua-$RUN"
LOI_TAT_CA=$(mktemp)

don() {
  echo "== dọn dữ liệu thử"
  for u in "$BAN" "$DA" "$MUA"; do vps "curl -sS -X POST http://127.0.0.1:8000/reset/$u >/dev/null" || true; done
  q "select reset_nguoi_test('$BAN') as ban, reset_nguoi_test('$DA') as da, reset_nguoi_test('$MUA') as mua" | jq -c '.[0]' || true
  rm -f "$LOI_TAT_CA"
}
trap don EXIT

# Lượt chat: in từng bong bóng; TRA = JSON thô, LOI = cả lời bot của lượt. Mọi lời bot gom vào LOI_TAT_CA (soát "mình" cuối script).
chat() {
  local uid="$1" text="$2"
  echo; echo ">> [$uid] $text"
  TRA=$(jq -n --arg u "$uid" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"
  LOI="$(jq -r '.reply // ""' <<<"$TRA")"
  printf '%s\n\x1e\n' "$LOI" >> "$LOI_TAT_CA"
  sleep 2
}

loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
ghi() { if [ "$2" = 1 ]; then echo "GHI NHẬN (đạt) $1"; else echo "GHI NHẬN (lệch) $1"; fi; }
co() { grep -qiF -- "$2" <<<"$1" && echo 1 || echo 0; }
so_tu() { wc -w <<<"$1" | tr -d ' '; }
# Lời có số kèm đơn vị (`triệu` / `tỷ`) sát giá trị mong đợi (VND) trong sai số 5 % không? (giá/m² dùng đơn vị "triệu").
gan_so() {
  python3 - "$1" "$2" <<'PY'
import re, sys
loi, ky_vong = sys.argv[1], float(sys.argv[2])
for so, dv in re.findall(r"(\d+(?:[.,]\d+)?)\s*(tỷ|triệu)", loi, re.I):
    v = float(so.replace(".", "").replace(",", ".") if so.count(".") > 1 else so.replace(",", ".")) * (1e9 if dv.lower() == "tỷ" else 1e6)
    if abs(v - ky_vong) <= 0.05 * ky_vong:
        print(1); sys.exit()
print(0)
PY
}

# ================= Phía BÁN =================
echo "======== Phía bán: chào, phường cũ bị chia, pháp lý, hẹn gửi sau, câu nhạy cảm"
chat "$BAN" "Chào em"
TEN=$(jq -r '.assistant_name // ""' <<<"$TRA")
kiem "181: tên trợ lý thuộc kho 13 tên có chấm giữa ($TEN)" \
  "$(PYTHONPATH=src python3 -c "import sys; from aioi.assistants import ASSISTANT_NAMES as A; print(1 if sys.argv[1] in A else 0)" "$TEN")"
ghi "163: lời chào được thả tim (tha_tim)" "$(jq '.tha_tim == true | if . then 1 else 0 end' <<<"$TRA")"

PHUONG_CHIA=$(q "select coalesce(json_agg(phuong_moi), '[]') as p from phuong_cu where ten = 'Phường 6' and quan_cu = 'Quận Bình Thạnh'" | jq -c '.[0].p')
chat "$BAN" "Anh cần bán nhà ở phường 6 quận Bình Thạnh, hẻm xe hơi, giá 7 tỷ"
if [ "$(jq 'length' <<<"$PHUONG_CHIA")" -ge 2 ]; then
  OK=1; for p in $(jq -r '.[] | @base64' <<<"$PHUONG_CHIA"); do t=$(base64 -d <<<"$p"); [ "$(co "$LOI" "$t")" = 1 ] || OK=0; done
  kiem "191: phường 6 cũ (Bình Thạnh) bị chia → bot kể đủ các phường mới $PHUONG_CHIA" "$OK"
else
  echo "BỎ QUA 191: kho phuong_cu không còn ca Phường 6 Bình Thạnh bị chia"
fi

chat "$BAN" "Bán nhà thì anh phải nộp những thuế phí gì em?"
kiem "176: câu thuế phí trả theo kho pháp lý — có \"tham khảo\" và mức 2%" "$( [ "$(co "$LOI" "tham khảo")" = 1 ] && [ "$(co "$LOI" "2%")" = 1 ] && echo 1 || echo 0)"

chat "$BAN" "Sổ anh để ở quê, mai anh chụp gửi em sau nhé"
ghi "178: khách hẹn gửi sau → lượt này bot không cần hỏi thêm (không có dấu ?)" "$(grep -q '?' <<<"$LOI" && echo 0 || echo 1)"

chat "$BAN" "Mà nhà này anh em trong nhà đang tranh chấp thừa kế, vậy có bán được không em?"
sleep 5
NH=$(q "select coalesce(bool_or(c.needs_human), false) as nh from conversations c left join sellers s on s.id = c.seller_id
          left join buyers b on b.id = c.buyer_id where s.zalo_user_id = '$BAN' or b.zalo_user_id = '$BAN'" | jq -r '.[0].nh')
kiem "176: câu pháp lý nhạy cảm (tranh chấp thừa kế) → báo người thật (needs_human)" "$([ "$NH" = true ] && echo 1 || echo 0)"
kiem "176: câu nhạy cảm — bot không tư vấn hướng xử lý (không nêu \"Điều\" / \"Luật\")" "$(grep -qE 'Điều [0-9]|Luật [A-ZĐ]' <<<"$LOI" && echo 0 || echo 1)"

echo "======== Phía bán: căn hộ trong dự án có trong kho → gắn project_id"
DU_AN=$(q "select id, name from projects where name = 'HaDo Centrosa Garden' limit 1" | jq -c '.[0] // {}')
if [ "$(jq -r '.id // empty' <<<"$DU_AN")" != "" ]; then
  chat "$DA" "Em bán căn hộ 2PN ở HaDo Centrosa Garden, 200 đường 3 Tháng 2, Quận 10, 86m2, giá 6 tỷ"
  chat "$DA" "Sổ hồng riêng, nhà đang để trống"
  sleep 5
  PID=$(q "select l.project_id from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$DA' order by l.updated_at desc limit 1" | jq -r '.[0].project_id // ""')
  kiem "181: căn hộ nêu tên + đường của dự án trong kho → gắn đúng project_id ($PID)" "$([ "$PID" = "$(jq -r '.id' <<<"$DU_AN")" ] && echo 1 || echo 0)"
else
  echo "BỎ QUA 181 (gắn dự án): kho projects không còn HaDo Centrosa Garden"
fi

# ================= Phía MUA =================
echo "======== Phía mua: gợi căn, xin ảnh, giá/m², thuế phí theo căn, hẹn xem, ok, chê căn, tắt báo"
chat "$MUA" "Chào em, anh đang tìm mua nhà phố ở Quận Tân Phú, tài chính tầm 6 tỷ"
MA=$(grep -oE 'nha-dat/[A-Za-z0-9]+' <<<"$LOI" | head -1 | cut -d/ -f2 || true)
ANH_DAU=$(jq '.photos | length' <<<"$TRA")
if [ -z "$MA" ]; then
  chat "$MUA" "Em gửi anh xem thử một căn đi"
  MA=$(grep -oE 'nha-dat/[A-Za-z0-9]+' <<<"$LOI" | head -1 | cut -d/ -f2 || true)
fi
kiem "mua: có khu vực + ngân sách → bot gợi một căn kèm link (#${MA:-không có})" "$([ -n "$MA" ] && echo 1 || echo 0)"

if [ -n "$MA" ]; then
  CAN=$(q "select l.price_vnd, l.area_m2, (select count(*) from listing_photos_v p where p.listing_id = l.id) as so_anh from listings l where l.code = '$MA'" | jq -c '.[0] // {}')
  echo "   căn #$MA: $CAN"

  chat "$MUA" "Cho anh xem thêm ảnh căn đó với em"
  SO_ANH=$(jq -r '.so_anh // 0' <<<"$CAN")
  if [ "$SO_ANH" -gt "${ANH_DAU:-0}" ]; then
    kiem "169: khách xin ảnh, còn ảnh chưa gửi → lượt có ảnh gửi kèm ($(jq '.photos | length' <<<"$TRA") ảnh)" "$(jq '(.photos | length) >= 1 | if . then 1 else 0 end' <<<"$TRA")"
  elif [ "$SO_ANH" -gt 0 ]; then
    # SRS-5.1zzzzzzz232 (chủ dự án 28/10: "nói thật, không gửi lại", "có thể xin thêm ảnh"): lời giới thiệu đã gửi đủ $SO_ANH ảnh.
    kiem "169: đã gửi đủ ảnh → không gửi lại ($(jq '.photos | length' <<<"$TRA") ảnh)" "$(jq '(.photos | length) == 0 | if . then 1 else 0 end' <<<"$TRA")"
    kiem "169: đã gửi đủ ảnh → không nói \"vừa gửi / gửi lại\", đề nghị xin chủ nhà thêm ảnh" \
      "$( ! grep -qiE 'vừa gửi|gửi lại ảnh|em gửi ảnh' <<<"$LOI" && grep -qi 'chủ nhà' <<<"$LOI" && echo 1 || echo 0)"
  else
    kiem "169: căn chưa có ảnh → bot nói thật, không hứa gửi" "$(grep -qiE 'em gửi (ngay|liền)|gửi ảnh ngay' <<<"$LOI" && echo 0 || echo 1)"
  fi

  GIA=$(jq -r '.price_vnd // 0' <<<"$CAN"); DT=$(jq -r '.area_m2 // 0' <<<"$CAN")
  chat "$MUA" "Căn này tính ra giá mỗi mét vuông là bao nhiêu em?"
  if [ "$GIA" != 0 ] && [ "$DT" != 0 ]; then
    KV=$(python3 -c "print($GIA / $DT)")
    kiem "179: giá/m² đúng giá ÷ diện tích của căn (≈ $(python3 -c "print(round($GIA/$DT/1e6,1))") triệu/m², sai số 5 %)" "$(gan_so "$LOI" "$KV")"
  fi

  chat "$MUA" "Nếu anh mua căn này thì thuế phí sang tên hết khoảng bao nhiêu tiền?"
  if [ "$GIA" != 0 ]; then
    kiem "179: thuế phí theo giá căn — lời có số thuế TNCN 2 % (≈ $(python3 -c "print(round($GIA*0.02/1e6))") triệu) hoặc trước bạ 0,5 %" \
      "$( [ "$(gan_so "$LOI" "$(python3 -c "print($GIA*0.02)")")" = 1 ] || [ "$(gan_so "$LOI" "$(python3 -c "print($GIA*0.005)")")" = 1 ] && echo 1 || echo 0)"
    kiem "176/179: lời thuế phí có chữ \"tham khảo\"" "$(co "$LOI" "tham khảo")"
  fi

  chat "$MUA" "Anh muốn đi xem căn này thứ 7 tuần này lúc 9h sáng được không em?"
  chat "$MUA" "Số anh 0900000002 nhé"
  sleep 4
  LICH=$(q "select count(*)::int n from viewings v join buyers b on b.id = v.buyer_id join listings l on l.id = v.listing_id
            where b.zalo_user_id = '$MUA' and l.code = '$MA'" | jq -r '.[0].n')
  kiem "162: hẹn xem thứ 7 9h sáng → ghi lịch hẹn (viewings, $LICH dòng)" "$([ "$LICH" -ge 1 ] && echo 1 || echo 0)"
  chat "$MUA" "ok em"
  N=$(so_tu "$LOI")
  kiem "162: khách \"ok\" sau khi lịch đã chốt → đáp MỘT câu rất ngắn ($N từ ≤ 25)" "$([ "$N" -le 25 ] && echo 1 || echo 0)"
  chat "$MUA" "ok"
  N2=$(so_tu "$LOI")
  kiem "162: \"ok\" lần hai vẫn ngắn, không lặp câu xác nhận lịch ($N2 từ)" "$([ "$N2" -le 25 ] && ! grep -qiE 'thứ 7.*9|9h.*thứ 7' <<<"$LOI" && echo 1 || echo 0)"

  chat "$MUA" "Mà căn đó anh thấy diện tích nhỏ quá, không hợp với nhà anh"
  sleep 4
  KH=$(q "select count(*)::int n from interests i join buyers b on b.id = i.buyer_id where b.zalo_user_id = '$MUA' and i.trang_thai = 'khong_hop'" | jq -r '.[0].n')
  kiem "175: khách chê căn → interests.trang_thai = khong_hop ($KH dòng)" "$([ "$KH" -ge 1 ] && echo 1 || echo 0)"
fi

chat "$MUA" "Thôi em đừng báo căn mới cho anh nữa nhé, khi nào cần anh nhắn lại"
sleep 4
BAO=$(q "select b.bao_can_moi from buyers b where b.zalo_user_id = '$MUA'" | jq -r '.[0].bao_can_moi // "null"')
kiem "175: khách xin thôi báo căn mới → buyers.bao_can_moi = false ($BAO)" "$([ "$BAO" = false ] && echo 1 || echo 0)"

echo "======== Phía mua: hỏi dự án theo tên đúng (184) và tên gõ sai (185, đi đường vector)"
if [ "$(q "select count(*)::int n from projects where name = 'Glory Tower'" | jq -r '.[0].n')" -ge 1 ]; then
  chat "$MUA" "Em ơi dự án Glory Tower ở quận 8 có hồ bơi không?"
  kiem "184: hỏi dự án theo tên → lời nhắc đúng tên dự án trong kho" "$(co "$LOI" "Glory Tower")"
else
  echo "BỎ QUA 184: kho projects không còn Glory Tower"
fi
if [ "$(q "select count(*)::int n from projects where name = 'Kingsway Tower'" | jq -r '.[0].n')" -ge 1 ]; then
  chat "$MUA" "Còn dự án Kingway Towr bên Bình Tân thì bàn giao chưa em?"
  kiem "185: tên dự án gõ sai → tra theo nghĩa ra đúng dự án (lời có \"Kingsway Tower\")" "$(co "$LOI" "Kingsway Tower")"
else
  echo "BỎ QUA 185: kho projects không còn Kingsway Tower"
fi

# ================= Mọi lượt =================
echo "======== Mọi lượt: không gọi khách là \"mình\" (171)"
VI=$(PYTHONPATH=src python3 - "$LOI_TAT_CA" <<'PY'
import sys
from aioi.xung_ho import goi_khach_la_minh
loi = [x.strip() for x in open(sys.argv[1], encoding="utf-8").read().split("\x1e") if x.strip()]
sai = [x for x in loi if goi_khach_la_minh(x)]
for x in sai:
    print("   lượt gọi khách là mình:", x.replace("\n", " ")[:200], file=sys.stderr)
print(len(sai))
PY
)
kiem "171: không lượt nào gọi khách là \"mình\" ($VI lượt vi phạm)" "$([ "$VI" = 0 ] && echo 1 || echo 0)"

echo "== lõi trên VPS: $(vps 'systemctl is-active aond-core')"
vps "journalctl -u aond-core --since '-10 min' --no-pager -o cat | grep -E 'Mua: |điều luật theo nghĩa|dự án theo nghĩa|Failed to|error|Error|exception|traceback' | grep -viE 'key|token|secret|password|bearer' | sed -E 's/[0-9]{9,}/#/g' | tail -30" || true
exit $loi
