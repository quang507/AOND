#!/usr/bin/env bash
# ban-thu-dap-y.sh — bắn thử RIÊNG cuộc chat kiểu ảnh chủ dự án 26/10 (SRS-5.1zzzzzzz193): nhà phố mặt tiền Hoàng Hoa Thám, khách nhắn từng ý ngắn,
# sau bản nháp khách nói thêm "hiện có HĐT 35 triệu". Chạy trong apply-migration.yml ô `dung_lai` = ban-thu-dap-y. IN từng bong bóng bot
# kèm số từ / số dấu hỏi mỗi lượt, số lượt tới bản nháp, và lời đáp ở lượt HĐT để người đọc chấm: đáp có tự nhiên / đáp vào ý nghĩa không,
# khen có tự nhiên không, hỏi nhiều hay ít. Chỉ kiểm cứng điều tất định (luật cấm, ô HĐT không ghi nhầm). ID thử `thu-dy-`, tự dọn.
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
BAN="thu-dy-$RUN"
BAN_LC="thu-dy-lc-$RUN"   # cuộc chat riêng để thử gõ "$$$$$" / "json" (SRS-5.1zzzzzzz195: nay chỉ là tin thường)
don() {
  echo "== dọn dữ liệu thử"
  for id in "$BAN" "$BAN_LC"; do
    [ "${GIU_DU_LIEU:-}" = giu ] || vps "curl -sS -X POST http://127.0.0.1:8000/reset/$id >/dev/null" || true
    [ "${GIU_DU_LIEU:-}" = giu ] || q "select reset_nguoi_test('$id') as kq" | jq -c '.[0]' || true
  done
}
trap don EXIT

loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
LUOT=0; LUOT_NHAP=""; MOI_LOI=""; TONG_HOI=0

chat() {
  local text="$1"
  echo; echo ">> $text"
  TRA=$(jq -n --arg u "$BAN" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"
  local ban hoi tu
  ban=$(jq -r '.replies[]?' <<<"$TRA" 2>/dev/null || true)
  hoi=$(grep -o '?' <<<"$ban" | wc -l); tu=$(wc -w <<<"$ban")
  echo "   [lượt $((LUOT + 1)): $(jq -r '.replies | length' <<<"$TRA" 2>/dev/null || echo ?) tin, $tu từ, $hoi dấu hỏi]"
  TONG_HOI=$((TONG_HOI + hoi)); MOI_LOI+=$'\n'"$ban"; LUOT=$((LUOT + 1))
  if [ -z "$LUOT_NHAP" ] && grep -q '📋' <<<"$TRA"; then LUOT_NHAP=$LUOT; fi
}

for cau in "Anh cần bán nhà mặt tiền đường Hoàng Hoa Thám, Bình Thạnh" "Phường Gia Định" "ngang 5,2m dài 8m" "3 tầng kiên cố" \
           "sổ hồng hoàn công rồi" "giá 12,5 tỷ thương lượng nhẹ"; do
  chat "$cau"; sleep 1
done
echo; echo "== số lượt tới bản nháp: ${LUOT_NHAP:-chưa ra} / $LUOT lượt; tổng dấu hỏi tới giờ: $TONG_HOI"

# Lượt như ảnh chủ dự án: sau bản nháp khách nói thêm thông tin có hệ quả rõ cho người mua.
LUOT_TRUOC=$LUOT
chat "à hiện có HĐT 35 triệu nhé"
DAP=$(jq -r '.replies[]?' <<<"$TRA" 2>/dev/null || true)
sleep 3
KQ=$(q "select l.status, l.price_vnd, l.boc_tach - '_cap_nhat' as boc_tach from listings l join sellers s on s.id = l.seller_id
        where s.zalo_user_id = '$BAN' order by l.updated_at desc limit 1")
echo "== ô tin sau lượt HĐT:"; jq -c '.[0]' <<<"$KQ"
r=$(jq '.[0] // {}' <<<"$KQ")

kiem "HĐT: lời đáp nhắc tới hợp đồng thuê / dòng tiền (soát cứng tối thiểu; chất lượng do người đọc chấm)" \
  "$(grep -qiE 'hợp đồng thuê|HĐT|dòng tiền|đang cho thuê|thuê sẵn' <<<"$DAP" && echo 1 || echo 0)"
kiem "HĐT: 35 triệu không bị ghi nhầm vào mức cọc / thời hạn hợp đồng" \
  "$(jq '((.boc_tach.muc_coc // "") | tostring | test("35")) or ((.boc_tach.thoi_han_hd // "") | tostring | test("35")) | if . then 0 else 1 end' <<<"$r")"
kiem "HĐT: 35 triệu vào ô thu_nhap_thue (SRS-5.1zzzzzzz197) và co_hdt = co" \
  "$(jq '((.boc_tach.thu_nhap_thue // "") | tostring | test("35")) and ((.boc_tach.co_hdt // "") == "co") | if . then 1 else 0 end' <<<"$r")"
kiem "HĐT: giá bán vẫn 12,5 tỷ (không bị 35 triệu đè)" "$(jq '.price_vnd == 12500000000 | if . then 1 else 0 end' <<<"$r")"
kiem "mọi lượt: không nhận định thị trường / bình giá" \
  "$(grep -qiE 'thanh khoản|tìm (mua )?nhiều|hợp lý|vừa tầm|đắc địa|dễ bán|hấp dẫn lắm|lợi suất' <<<"$MOI_LOI" && echo 0 || echo 1)"
kiem "mọi lượt: không mở đầu \"Dạ\", không dấu **, không gọi khách là \"bạn\"" \
  "$(grep -qE '^Dạ|\*\*|(^|[ ,.!?])bạn([ ,.!?]|$)' <<<"$MOI_LOI" && echo 0 || echo 1)"
# SRS-5.1zzzzzzz195: gõ "$$$$$" và "json" giữa cuộc chat giờ chỉ là tin thường — không xoá phiên, không bật chế độ test, không in khối JSON.
BAN="$BAN_LC"
chat "Anh có nhà mặt tiền đường Lê Lai Quận 1 cần bán"
sleep 1
chat '$$$$$'
LENH1="$TRA"
chat "json"
LENH2="$TRA"
KQ2=$(q "select l.boc_tach - '_cap_nhat' as boc_tach, (select count(*) from messages m join conversations c on c.id = m.conversation_id
         where c.seller_id = s.id) as so_tin from listings l join sellers s on s.id = l.seller_id
         where s.zalo_user_id = '$BAN_LC' order by l.updated_at desc limit 1")
echo "== sau \"\$\$\$\$\$\" và \"json\":"; jq -c '.[0]' <<<"$KQ2"
r2=$(jq '.[0] // {}' <<<"$KQ2")
kiem "gõ \$\$\$\$\$: vẫn có phiên và ô tin cũ (không xoá)" "$(jq '(.boc_tach.duong // .boc_tach.dia_chi // "") != "" | if . then 1 else 0 end' <<<"$r2")"
kiem "gõ \$\$\$\$\$ và json: bot vẫn trả lời như tin thường (có lời đáp)" \
  "$([ -n "$(jq -r '.replies[]?' <<<"$LENH1")" ] && [ -n "$(jq -r '.replies[]?' <<<"$LENH2")" ] && echo 1 || echo 0)"
kiem "gõ \$\$\$\$\$ và json: không tin phụ \$\$\$\$\$, không khối JSON {…} trong lời đáp" \
  "$(jq -r '.replies[]?' <<<"$LENH1$LENH2" | grep -qE '^\$\$\$\$\$|^\{|\"gia\"|```' && echo 0 || echo 1)"
echo "== tóm tắt: bản nháp ở lượt ${LUOT_NHAP:-chưa ra}, tổng $LUOT lượt, $TONG_HOI dấu hỏi (cả lượt HĐT)"
exit $loi
