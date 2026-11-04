#!/usr/bin/env bash
# ban-thu-model.sh — bắn thử production CÙNG câu mua + bán bằng hai model (Haiku 5.5 rồi Sonnet 5.5) để chủ dự án so giọng (chủ dự án
# 04/11/2026: "bắn thật bằng haiku đợt mua và bán và bắn thật bằng sonnet cùng câu mua và bán để test"). Đổi `AIOI_CHAT_MODEL_THU` trong
# .env lõi (chỉ ảnh hưởng ID thử `thu-`), khởi động lại lõi mỗi model, cuối cùng TRẢ LẠI giá trị cũ và khởi động lại (3 lần, mỗi lần vài giây
# — báo trước người đang chat thử). Model bóc tách form (khách mua lượt đầu) vẫn là MODEL_BOC. Chạy: apply-migration.yml ô dung_lai = ban-thu-model.
# Tự dọn (trừ khi GIU_DU_LIEU=giu). Tiền thật: 4 lượt chat.
set -euo pipefail
q() { curl -sS -f -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(jq -n --arg q "$1" '{query:$q}')"; }
J=$(q "select json_object_agg(name, decrypted_secret) as s from vault.decrypted_secrets where name in ('VPS_HOST','VPS_ROOT_PASSWORD')")
HOST=$(jq -r '.[0].s.VPS_HOST // empty' <<<"$J"); PW=$(jq -r '.[0].s.VPS_ROOT_PASSWORD // empty' <<<"$J"); unset J
for v in "$HOST" "$PW"; do [ -n "$v" ] && echo "::add-mask::$v"; done
if [ -z "$HOST" ] || [ -z "$PW" ]; then echo "::error::Thiếu VPS_HOST / VPS_ROOT_PASSWORD trong Vault"; exit 1; fi
command -v sshpass >/dev/null || sudo apt-get install -y -qq sshpass >/dev/null
export SSHPASS="$PW"; unset PW
vps() { sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o LogLevel=ERROR "root@$HOST" "$@"; }

RUN="${GITHUB_RUN_ID:-$(date +%s)}"
CHU="thu-model-chu-$RUN"; MA=$(printf 'M%07X' $(( RUN % 268435456 )))
CAU_BAN="anh cần bán nhà hẻm 4m Quận 8, 1 trệt 2 lầu, 3 phòng ngủ, giá 3 tỷ 2"
CAU_MUA="anh tìm nhà phố Quận 8 tầm 3 tỷ rưỡi, 3 phòng ngủ"
CU=$(vps "grep -E '^AIOI_CHAT_MODEL_THU=' /opt/aond_core/.env || true")
echo "== giá trị cũ: ${CU:-<không có dòng>}"
IDS="$CHU"

dat_model() {   # $1 = model hoặc "__cu__" để trả lại dòng cũ
  if [ "$1" = __cu__ ]; then
    vps "sed -i '/^AIOI_CHAT_MODEL_THU=/d' /opt/aond_core/.env; ${CU:+echo '$CU' >> /opt/aond_core/.env;} systemctl restart aond-core"
  else
    vps "sed -i '/^AIOI_CHAT_MODEL_THU=/d' /opt/aond_core/.env; echo 'AIOI_CHAT_MODEL_THU=$1' >> /opt/aond_core/.env; systemctl restart aond-core"
  fi
  for i in $(seq 1 30); do vps "curl -sf -m 3 http://127.0.0.1:8000/health >/dev/null" && return 0; sleep 2; done
  echo "::error::lõi không lên lại sau khi đổi model"; return 1
}
don() {
  echo "== trả model ID thử về giá trị cũ + dọn"
  dat_model __cu__ || true
  vps "grep -E '^AIOI_CHAT_MODEL_THU=' /opt/aond_core/.env || echo '(không có dòng)'" || true
  [ "${GIU_DU_LIEU:-}" = giu ] && return 0
  vps "for u in $IDS; do curl -sS -X POST http://127.0.0.1:8000/reset/\$u >/dev/null; done" || true
  for u in $IDS; do q "select reset_nguoi_test('$u') as kq" | jq -c '.[0]' || true; done
}
trap don EXIT

echo "== tin thử cho khách mua: #$MA nhà phố Quận 8, 3,4 tỷ, 3 phòng ngủ (người bán thử $CHU)"
q "with s as (insert into sellers (zalo_user_id, seller_type) values ('$CHU', 'ccrb') returning id)
   insert into listings (code, seller_id, deal, property_type, district, ward, street, area_m2, price_raw, price_vnd, status, source, description)
   select '$MA', s.id, 'ban', 'nha_pho', 'Quận 8', 'Phường Rạch Ông', 'Phạm Thế Hiển', 52, '3,4 tỷ', 3400000000, 'dang_ban', 'chat',
          'Nhà phố 1 trệt 2 lầu, 3 phòng ngủ (tin thử bắn tự động)' from s returning code" | jq -c '.' || echo "(không tạo được tin thử — khách mua có thể không có căn)"

chat() {   # $1 uid · $2 text · $3 so_nhan
  jq -n --arg u "$1" --arg t "$2" --arg s "$3" '{external_user_id:$u, text:$t, sender_name:"Khách thử", so_nhan:$s}' \
    | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-" \
    | jq -r '.replies[]? | "<< " + .' || echo "<< (không đọc được JSON)"
}
for M in claude-haiku-5-5 claude-sonnet-5-5; do
  ten=${M#claude-}; BAN="thu-model-ban-$ten-$RUN"; MUA="thu-model-mua-$ten-$RUN"; IDS="$IDS $BAN $MUA"
  echo; echo "################ MODEL ID THỬ = $M ################"
  dat_model "$M"
  echo; echo ">> [BÁN · số ký gửi] $CAU_BAN"; t=$(date +%s); chat "$BAN" "$CAU_BAN" ""; echo "   ($(( $(date +%s) - t )) s)"
  echo; echo ">> [MUA · số tư vấn] $CAU_MUA"; t=$(date +%s); chat "$MUA" "$CAU_MUA" "tu_van"; echo "   ($(( $(date +%s) - t )) s)"
done
