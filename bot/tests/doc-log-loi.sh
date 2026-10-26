#!/usr/bin/env bash
# doc-log-loi.sh — CHỈ ĐỌC: in nhật ký lõi Python trên VPS trong một khoảng giờ (SRS-5.1zzzzzzz195), chạy trong apply-migration.yml ô
# `dung_lai` = doc-log-loi, khoảng giờ truyền ở ô `migration_file` dạng "2026-10-26 02:09:00|2026-10-26 02:14:00" (giờ UTC). Lý do: chat
# thật 26/10 mất giá giữa chừng mà DB chỉ giữ kết quả cuối — dòng "Kế hoạch" / "Bỏ ô" của lõi cho biết lượt nào ghi hoặc bỏ ô nào.
# Chỉ in dòng chứa tên ô / lý do bỏ ô (không có lời khách); tin nhắn, SĐT, tên khách bị loại. Không ghi gì lên VPS hay DB.
# Cần: TOKEN (Management API), PROJECT_REF, KHOANG ("từ|đến").
set -euo pipefail

q() { curl -sS -f -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(jq -n --arg q "$1" '{query:$q}')"; }

TU="${KHOANG%%|*}"; DEN="${KHOANG##*|}"
[[ "$TU" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9:]{8}$ && "$DEN" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9:]{8}$ ]] \
  || { echo "::error::KHOANG phải dạng 'YYYY-MM-DD HH:MM:SS|YYYY-MM-DD HH:MM:SS'"; exit 1; }

J=$(q "select json_object_agg(name, decrypted_secret) as s from vault.decrypted_secrets where name in ('VPS_HOST','VPS_ROOT_PASSWORD')")
HOST=$(jq -r '.[0].s.VPS_HOST // empty' <<<"$J"); PW=$(jq -r '.[0].s.VPS_ROOT_PASSWORD // empty' <<<"$J")
unset J
for v in "$HOST" "$PW"; do [ -n "$v" ] && echo "::add-mask::$v"; done
if [ -z "$HOST" ] || [ -z "$PW" ]; then echo "::error::Thiếu VPS_HOST / VPS_ROOT_PASSWORD trong Vault"; exit 1; fi
command -v sshpass >/dev/null || sudo apt-get install -y -qq sshpass >/dev/null
export SSHPASS="$PW"; unset PW
vps() { sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o LogLevel=ERROR "root@$HOST" "$@"; }

echo "== nhật ký lõi UTC $TU → $DEN (đã loại SĐT / số dài); múi giờ VPS: $(vps 'date +%Z%z')"
vps "journalctl -u aond-core --no-pager -o short-iso | head -1" || true   # dòng nhật ký cũ nhất còn giữ
vps "journalctl -u aond-core --utc --since '$TU UTC' --until '$DEN UTC' --no-pager -o short-iso | grep -E 'Kế hoạch|Bỏ ô|ô hỏi|gom .* tin|thời gian lượt|khởi động|Started|Stopped|lệch luật|gọi lại' | sed -E 's/[0-9]{9,}/#/g' | cut -c1-900" || true
