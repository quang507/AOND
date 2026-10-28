#!/usr/bin/env bash
# ban-thu-vm.sh — bắn thử khách VỪA BÁN VỪA MUA trên lõi Python production (SRS-5.1zzzzzzz153), chạy trong apply-migration.yml ô
# `dung_lai` = ban-thu-vm. MỘT Zalo thử rao bán một căn rồi quay sang đi mua và hẹn xem nhà bằng ba tin ngắn rời nhau ("thứ 7" / "sáng nhé" / "9h").
# Đạt khi: lịch hẹn được ghi (viewings) kèm việc báo người phụ trách (reminders escalation gắn viewing), số điện thoại khách gõ vào lịch hẹn, phía bán còn nguyên.
# Dựa trên ban-thu-mua.sh (SRS-5.1zzzzzzz70). Lõi chỉ nghe 127.0.0.1:8000 trên VPS nên mỗi lượt chat đi qua ssh.
# Chỉ dùng Zalo ID thử (`thu-`, la_id_thu): người bán thử + một tin thử Quận 5 do script tạo — câu khách hỏi giao cho người bán
# thử, không tới chủ nhà / CTV thật. Cuối script (kể cả khi hỏng) xoá sạch qua reset_nguoi_test + /reset của lõi.
# Cần: TOKEN (Management API), PROJECT_REF. Tiền thật: ~3 lượt chat × vài lượt AI.
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
BAN="thu-ban-$RUN"; MUA="thu-vm-$RUN"
MA=$(printf '%08X' $(( RUN % 4294967296 )))

don() {
  echo "== dọn dữ liệu thử"
  # Lõi trước, DB sau (SRS-5.1zzzzzzz91): dọn DB trước thì tin nhắc / lượt ghi nền của lõi còn chạy tạo lại hội thoại mồ côi
  # (20/10: hội thoại "Khách thử" chỉ có một tin nhắc "bản tin nháp em soạn ở trên").
  [ "${GIU_DU_LIEU:-}" = giu ] || vps "curl -sS -X POST http://127.0.0.1:8000/reset/$MUA >/dev/null; curl -sS -X POST http://127.0.0.1:8000/reset/$BAN >/dev/null" || true
  [ "${GIU_DU_LIEU:-}" = giu ] || q "select reset_nguoi_test('$MUA') as mua, reset_nguoi_test('$BAN') as ban" | jq -c '.[0]' || true
}
trap don EXIT

# Lượt chat: in từng bong bóng bot trả; trả JSON thô vào biến TRA.
chat() {
  local uid="$1" text="$2"
  echo; echo ">> [$uid] $text"
  TRA=$(jq -n --arg u "$uid" --arg t "$text" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
  jq -r '.replies[]? | "<< " + .' <<<"$TRA" || echo "<< (không đọc được JSON) $TRA"
}

echo "== tạo người bán thử $BAN + tin thử #$MA (nhà phố Quận 5, 5 tỷ, đang bán)"
q "with s as (insert into sellers (zalo_user_id, seller_type) values ('$BAN', 'ccrb') returning id)
   insert into listings (code, seller_id, deal, property_type, district, ward, street, area_m2, price_raw, price_vnd, status, source, description)
   select '$MA', s.id, 'ban', 'nha_pho', 'Quận 5', 'Phường Chợ Quán', 'Trần Bình Trọng', 60, '5 tỷ', 5000000000, 'dang_ban', 'chat',
          'Nhà phố 1 trệt 2 lầu, hẻm xe hơi (tin thử bắn tự động)' from s returning code, status" | jq -c '.'

chat "$MUA" "Chào em, nhà chị ở Lê Văn Sỹ quận 3, 60m2, chị muốn bán 9 tỷ"
sleep 4
chat "$MUA" "Chị cũng đang tìm mua nhà phố ở Quận 5, tài chính tầm 5 tỷ"
sleep 2
chat "$MUA" "Căn #$MA chị thấy được đó em, chị xem thử thứ 7 được không?"
sleep 2
chat "$MUA" "sáng nhé"
sleep 2
chat "$MUA" "9h"
sleep 2
chat "$MUA" "số chị 0900000001 nha"
sleep 3

echo; echo "== soi DB"
KQ=$(q "with l as (select id from listings where code = '$MA'), b as (select id from buyers where zalo_user_id = '$MUA'), s as (select id from sellers where zalo_user_id = '$MUA')
  select
   (select count(*) from b) as buyers,
   (select json_agg(json_build_object('status', v.status, 'time_text', v.time_text, 'co_sdt', v.phone is not null)) from viewings v where v.listing_id in (select id from l) and v.buyer_id in (select id from b)) as viewings,
   (select count(*) from reminders m where m.kind = 'escalation' and m.viewing_id in (select v.id from viewings v where v.listing_id in (select id from l) and v.buyer_id in (select id from b))) as bao_nguoi_phu_trach,
   (select count(*) from listings x where x.seller_id in (select id from s) and (x.price_vnd is not null or x.area_m2 is not null)) as tin_ban_that,
   (select count(*) from conversations c where c.buyer_id in (select id from b) or c.seller_id in (select id from s)) as hoi_thoai")
jq '.[0]' <<<"$KQ"

loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
r=$(jq '.[0]' <<<"$KQ")
kiem "có dòng buyers cho khách vừa mua vừa bán" "$(jq '(.buyers|tonumber) >= 1 | if . then 1 else 0 end' <<<"$r")"
kiem "ghi lịch hẹn xem (viewings) dù khách từng rao bán" "$(jq '(.viewings // []) | length >= 1 | if . then 1 else 0 end' <<<"$r")"
kiem "lịch hẹn kéo theo việc báo người phụ trách (reminders escalation gắn viewing)" "$(jq '(.bao_nguoi_phu_trach|tonumber) >= 1 | if . then 1 else 0 end' <<<"$r")"
kiem "số điện thoại khách gõ được ghi vào lịch hẹn" "$(jq '[(.viewings // [])[] | select(.co_sdt == true)] | length >= 1 | if . then 1 else 0 end' <<<"$r")"
kiem "phía bán còn nguyên (≥ 1 tin bán thật)" "$(jq '(.tin_ban_that|tonumber) >= 1 | if . then 1 else 0 end' <<<"$r")"
kiem "một khách một hội thoại (đúng 1)" "$(jq '(.hoi_thoai|tonumber) == 1 | if . then 1 else 0 end' <<<"$r")"
echo "== lõi trên VPS: $(vps 'systemctl is-active aond-core')"
vps "journalctl -u aond-core --since '-5 min' --no-pager -o cat | grep -E 'Mua: |Failed to|ghi_hen_xem|ghi_sdt|error|Error|exception|traceback' | grep -viE 'key|token|secret|password|bearer' | sed -E 's/[0-9]{9,}/#/g' | tail -30" || true
exit $loi
