#!/usr/bin/env bash
# ban-thu-mua.sh — bắn thử luồng NGƯỜI MUA trên lõi Python production (SRS-5.1zzzzzzz70), chạy trong apply-migration.yml ô
# `dung_lai` = ban-thu-mua. Lõi chỉ nghe 127.0.0.1:8000 trên VPS nên mỗi lượt chat đi qua ssh.
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
BAN="thu-ban-$RUN"; MUA="thu-mua-$RUN"
MA=$(printf '%08X' $(( RUN % 4294967296 )))

don() {
  echo "== dọn dữ liệu thử"
  # Lõi trước, DB sau (SRS-5.1zzzzzzz91): dọn DB trước thì tin nhắc / lượt ghi nền của lõi còn chạy tạo lại hội thoại mồ côi
  # (20/10: hội thoại "Khách thử" chỉ có một tin nhắc "bản tin nháp em soạn ở trên").
  vps "curl -sS -X POST http://127.0.0.1:8000/reset/$MUA >/dev/null; curl -sS -X POST http://127.0.0.1:8000/reset/$BAN >/dev/null" || true
  q "select reset_nguoi_test('$MUA') as mua, reset_nguoi_test('$BAN') as ban" | jq -c '.[0]' || true
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

chat "$MUA" "Chào em, anh đang tìm mua nhà phố ở Quận 5, tài chính tầm 5 tỷ"
# Nhiều lượt bắn thử chạy cùng lúc thì mỗi lượt có một căn thử cùng khu — bot kể căn của lượt khác cũng là đúng. Đạt khi bot đưa
# ra ít nhất một mã căn; căn của chính lượt này được chọn ở lượt 2.
co_ma=0; grep -qE "#?[0-9A-F]{8}" <<<"$TRA" && co_ma=1
chat "$MUA" "Căn #$MA anh thấy được đó em. Chiều thứ 7 này 3h anh qua xem nhà được không, mà nhà này sổ hồng riêng không em?"
sleep 2
chat "$BAN" "Dạ căn đó sổ hồng riêng chính chủ nha em, công chứng ngay được"
LOI_BAN="$TRA"
sleep 2

echo; echo "== soi DB"
KQ=$(q "with l as (select id from listings where code = '$MA'), b as (select id from buyers where zalo_user_id = '$MUA')
  select
   (select count(*) from b) as buyers,
   (select count(*) from interests i where i.listing_id in (select id from l) and i.buyer_id in (select id from b)) as interests,
   (select json_agg(json_build_object('status', v.status, 'time_text', v.time_text)) from viewings v where v.listing_id in (select id from l)) as viewings,
   (select json_agg(json_build_object('q', r.question, 'status', r.status, 'assignee', r.assignee, 'answer', r.answer, 'source', r.source) order by r.created_at)
      from info_requests r where r.listing_id in (select id from l)) as info_requests,
   (select count(*) from reminders m where m.listing_id in (select id from l)) as reminders,
   (select status from listings where id in (select id from l)) as listing_status")
jq '.[0]' <<<"$KQ"

loi=0
kiem() { if [ "$2" = 1 ]; then echo "ĐẠT  $1"; else echo "TRƯỢT $1"; loi=1; fi; }
r=$(jq '.[0]' <<<"$KQ")
kiem "lượt 1: bot đưa ra căn (mã #…)" "$co_ma"
# SRS-5.1zzzzzzz77: chủ nhà (có tin, chưa có hội thoại) trả lời câu khách mua → không bị hỏi lại loại nhà, không sinh tin rỗng.
kiem "chủ nhà trả lời xong không bị hỏi loại nhà" "$(grep -qiE 'chung cư, nhà phố|nhà phố hay|hay lô đất|hay đất' <<<"$LOI_BAN" && echo 0 || echo 1)"
SO_TIN=$(q "select count(*) as n from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = '$BAN'" | jq -r '.[0].n')
kiem "người bán vẫn đúng 1 tin (không sinh tin rỗng) — có $SO_TIN" "$([ "$SO_TIN" = 1 ] && echo 1 || echo 0)"
kiem "có dòng buyers cho khách mua" "$(jq '(.buyers|tonumber) >= 1 | if . then 1 else 0 end' <<<"$r")"
kiem "ghi quan tâm căn (interests)" "$(jq '(.interests|tonumber) >= 1 | if . then 1 else 0 end' <<<"$r")"
kiem "ghi hẹn xem (viewings)" "$(jq '(.viewings // []) | length >= 1 | if . then 1 else 0 end' <<<"$r")"
kiem "ghi câu hỏi cho chủ nhà (info_requests buyer_ask, giao seller)" \
  "$(jq '[(.info_requests // [])[] | select(.source == "buyer_ask" and .assignee == "seller")] | length >= 1 | if . then 1 else 0 end' <<<"$r")"
kiem "chủ nhà trả lời → câu hỏi chuyển answered" \
  "$(jq '[(.info_requests // [])[] | select(.source == "buyer_ask" and .status == "answered" and (.answer // "") != "")] | length >= 1 | if . then 1 else 0 end' <<<"$r")"
echo "== lõi trên VPS: $(vps 'systemctl is-active aond-core')"
vps "journalctl -u aond-core --since '-5 min' --no-pager -o cat | grep -iE 'error|exception|traceback' | grep -viE 'key|token|secret|password|bearer' | sed -E 's/[0-9]{9,}/#/g' | tail -15" || true
exit $loi
