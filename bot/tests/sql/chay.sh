#!/usr/bin/env bash
# chay.sh — chạy bài kiểm TRIGGER / HÀM SQL thật trên một Postgres tạm (02/10/2026, SRS-5.1v).
#
# Mock e2e không mô phỏng `boc_thong_so` / `listing_facts_sync_cols` (regex SQL), nên lỗi ở tầng đó — "không có hẻm" thành
# hẻm — e2e xanh vẫn không chứng minh gì. Bài này dựng Postgres trống, nạp `schema.sql` (thay kiểu vector bằng text, bỏ qua
# phần cần extension Supabase), áp các migration MỚI HƠN schema.sql truyền vào, rồi chạy từng file `*.sql` trong thư mục này.
# File kiểm `raise exception` khi sai → thoát 1. Không có Postgres trên máy → thoát 2 ("chưa kiểm được", không phải đạt).
#   bash bot/tests/sql/chay.sh [migration.sql …]
set -uo pipefail
cd "$(dirname "$0")/../../.."
PGB=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
if [ -z "$PGB" ] || [ ! -x "$PGB/initdb" ]; then echo "SQL: không có Postgres trên máy — CHƯA KIỂM ĐƯỢC"; exit 2; fi
D=$(mktemp -d /var/tmp/pgthu.XXXXXX); chmod 755 "$D"
NGUOI=""; [ "$(id -u)" = 0 ] && { chown postgres "$D"; NGUOI="postgres"; }
chay() { if [ -n "$NGUOI" ]; then su "$NGUOI" -c "$*"; else bash -c "$*"; fi; }
don() { chay "$PGB/pg_ctl -D $D/data stop -m immediate" >/dev/null 2>&1; rm -rf "$D"; }
trap don EXIT
chay "$PGB/initdb -D $D/data -A trust -U postgres" >/dev/null || { echo "SQL: initdb hỏng"; exit 2; }
PORT=$((54000 + RANDOM % 1000))
chay "$PGB/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log -w start" >/dev/null || { echo "SQL: không bật được Postgres"; exit 2; }
P="psql -h $D -p $PORT -U postgres -X -q"
$P -c "create database thu" >/dev/null
$P -d thu >/dev/null 2>&1 <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema extensions; create schema net; create schema auth; create schema cron; create schema vault; create schema storage;
create extension unaccent schema extensions; create extension pg_trgm schema extensions; create extension fuzzystrmatch schema extensions;
create function auth.uid() returns uuid language sql as 'select null::uuid';
create function auth.role() returns text language sql as 'select null::text';
create function auth.jwt() returns jsonb language sql as 'select null::jsonb';
SQL
# vector → text; cột sinh `price_per_m2_vnd` được xuat_schema() in thành "default <biểu thức>" (Postgres từ chối) → generated.
python3 - "$D" <<'PY'
import re, sys
s = open("bot/supabase/schema.sql").read()
s = re.sub(r"extensions\.vector\(\d+\)|extensions\.vector|vector\(768\)", "text", s)
s = re.sub(r"(price_per_m2_vnd bigint) default \n(CASE.*?END),", r"\1 generated always as (\n\2) stored,", s, flags=re.S)
open(sys.argv[1] + "/schema.sql", "w").write(s)
PY
$P -d thu -f "$D/schema.sql" >/dev/null 2>&1
for m in "$@"; do $P -d thu -v ON_ERROR_STOP=1 -f "$m" >/dev/null || { echo "SQL: áp $m hỏng"; exit 1; }; done
hong=0
for f in bot/tests/sql/*.sql; do
  if $P -d thu -v ON_ERROR_STOP=1 -o /dev/null -f "$f" 2>"$D/loi"; then echo "✓ $(basename "$f")"
  else hong=1; echo "✗ $(basename "$f")"; sed 's/^/     → /' "$D/loi" | head -5; fi
done
[ $hong = 0 ] && echo "SQL: TẤT CẢ ĐẠT" || echo "SQL: CÓ BÀI HỎNG"
exit $hong
