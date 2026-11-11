#!/usr/bin/env bash
# ban-thu-nhieu-can.sh — bắn thử RIÊNG ca "một tin nhắn hai căn" trên lõi Python production (SRS-5.1zzzzzzz142), chạy trong apply-migration.yml ô
# `dung_lai` = ban-thu-nhieu-can. Lý do: ban-thu-ban 22/10 trượt ca này (DB đếm 0 tin sau 3 giây). Chờ lưu nền tới 25 s và IN thời gian thật tới
# lúc đủ 2 tin — phân biệt "chậm" với "không bao giờ ghi". Kiểm luôn tin gốc của từng căn. ID thử `thu-nc-`, tự dọn. Tiền thật: một lượt chat.
# Cần: TOKEN (Management API), PROJECT_REF.
set -euo pipefail

q() { curl -sS -f -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(jq -n --arg q "$1" '{query:$q}')"; }

. "$(dirname "$0")/lib/may146.sh"   # SRS-5.1zzzzzzz405: lõi trên máy 146 qua ssh "$MAY_146" (mặc định nuc) — chạy từ máy cá nhân, không chạy trên Actions

RUN="${GITHUB_RUN_ID:-$(date +%s)}"
BAN="thu-nc-$RUN"
don() {
  echo "== dọn dữ liệu thử"
  [ "${GIU_DU_LIEU:-}" = giu ] || vps "curl -sS -X POST http://127.0.0.1:8000/reset/$BAN >/dev/null" || true
  [ "${GIU_DU_LIEU:-}" = giu ] || q "select reset_nguoi_test('$BAN') as kq" | jq -c '.[0]' || true
}
trap 'don; dong_146' EXIT

loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }

CAU="anh có 2 căn cần bán: căn 1 nhà hẻm đường Bùi Minh Trực quận 8 giá 5 tỷ, căn 2 nhà mặt tiền đường Phạm Hùng quận 8 giá 12 tỷ"
echo ">> [$BAN] $CAU"
TRA=$(jq -n --arg u "$BAN" --arg t "$CAU" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
      | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"

T0=$(date +%s); SO=0; DEM3=""
for i in $(seq 1 25); do
  SO=$(q "select count(*) as n from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN'" | jq -r '.[0].n')
  [ "$i" = 3 ] && DEM3=$SO
  [ "$SO" = 2 ] && break
  sleep 1
done
echo "== số tin trong DB sau $(( $(date +%s) - T0 )) giây: $SO (lúc ~3 giây: ${DEM3:-chưa đo})"
kiem "Nhiều căn: một tin nhắn hai căn → hai tin rao ($SO)" "$([ "$SO" = 2 ] && echo 1 || echo 0)"
if [ "$SO" != 2 ]; then
  # Không đủ 2 tin sau 25 s thì không phải "chậm": in log lõi quanh lượt này (lỗi lưu nếu có) và hiện trạng DB của khách thử.
  echo "== log lõi (dòng nhắc lưu / lỗi / số căn)"
  vps "journalctl -u aond-core --since '5 minutes ago' --no-pager 2>/dev/null | grep -iE 'save|lưu|Supabase|error|Traceback|listing|căn' | tail -40" || true
  echo "== DB: seller / hội thoại / tin của khách thử"
  q "select (select count(*) from sellers where zalo_user_id='$BAN') as sellers,
            (select count(*) from listings l join sellers s on s.id=l.seller_id where s.zalo_user_id='$BAN') as listings,
            (select count(*) from bot_errors where at > now() - interval '5 minutes') as loi_5_phut" | jq -c '.[0]' || true
fi

TG=$(q "select l.code, n.du_lieu->>'tin_goc' as tg from listings l join sellers s on s.id = l.seller_id
        left join listing_noi_bo n on n.listing_id = l.id where s.zalo_user_id = '$BAN' order by l.code")
echo "$TG" | jq -c '.[]'
kiem "Nhiều căn: cả hai căn đều có tin gốc nguyên văn" \
  "$(jq '[.[] | select((.tg // "") | contains("Bùi Minh Trực") and contains("Phạm Hùng"))] | length == 2 | if . then 1 else 0 end' <<<"$TG")"
# SRS-5.1zzzzzzz310: rổ hai căn, khách "căn đó bán rồi" chưa chỉ ra căn nào → KHÔNG tin nào đổi trạng thái trên DB, bot hỏi lại căn nào.
sleep "${NGHI_GIUA_LUOT:-5}"
CAU2="à căn đó anh bán được rồi em nhé"
echo ">> [$BAN] $CAU2"
TRA2=$(jq -n --arg u "$BAN" --arg t "$CAU2" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
      | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
jq -r '.replies[]? | "<< " + .' <<<"$TRA2" || echo "<< (không đọc được JSON) $TRA2"
sleep 5
ST=$(q "select l.status from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN' order by l.code")
echo "$ST" | jq -c '[.[].status]'
kiem "Nhiều căn: \"căn đó bán rồi\" chưa rõ căn → không tin nào thành đã chốt" \
  "$(jq '[.[] | select(.status == "da_chot")] | length == 0 | if . then 1 else 0 end' <<<"$ST")"
exit $loi
