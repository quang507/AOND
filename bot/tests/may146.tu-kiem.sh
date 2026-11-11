#!/usr/bin/env bash
# may146.tu-kiem.sh — tự kiểm bot/tests/lib/may146.sh bằng ssh / curl GIẢ (SRS-5.1zzzzzzz405), không cần máy 146.
# Đỏ khi: vps() thôi kèm header x-noi-bo-key (lõi trả 401, SRS-400) hoặc thôi đổi cổng sang đường hầm; mất stdin của curl -d @-;
# journalctl không còn đổi sang nhật ký 146; lệnh Linux khác lặng lẽ "chạy"; khoá bị in ra màn hình; thiếu TOKEN mà vẫn chạy tiếp.
set -euo pipefail
GOC="$(cd "$(dirname "$0")/../.." && pwd)"
TAM=$(mktemp -d); trap 'rm -rf "$TAM"' EXIT
mkdir -p "$TAM/bin"; export GHI="$TAM/curl.log"; : >"$GHI"

cat >"$TAM/bin/ssh" <<'EOF'
#!/usr/bin/env bash
for a in "$@"; do [ "$a" = -N ] && exec sleep 600; done
last="${*: -1}"
ps=$(printf '%s' "${last##*EncodedCommand }" | base64 -d | iconv -f utf-16le -t utf-8)
case "$ps" in
  *AIOI_NOI_BO_KEY*) printf 'khoa-thu-123\r\n' ;;
  *"-Skip"*)         printf 'dong 4 Kế hoạch: gia\r\ndong 5 khac\r\n' ;;
  *"-Tail"*)         printf '== C:\\aond\\logs\\a.log\r\ndong cuoi Bỏ ô x\r\n' ;;
  *Count*)           printf 'C:\\aond\\logs\\a.log|3\r\n' ;;
esac
EOF
cat >"$TAM/bin/curl" <<'EOF'
#!/usr/bin/env bash
vao=""; for a in "$@"; do [ "$a" = "@-" ] && vao=$(cat); done
printf '%s\n' "ARGS: $* STDIN: $vao" >>"$GHI"
case "$*" in *chat-reply*) echo '{"replies":["ok"]}' ;; esac
exit 0
EOF
chmod +x "$TAM/bin/ssh" "$TAM/bin/curl"
export PATH="$TAM/bin:$PATH"

hong=0
ok() { if [ "$2" = 0 ]; then echo "✓ $1"; else echo "✗ $1"; hong=$((hong + 1)); fi; }

# Thiếu TOKEN → thoát 2, không mở đường hầm.
( unset TOKEN SUPABASE_ACCESS_TOKEN; . "$GOC/bot/tests/lib/may146.sh" ) >/dev/null 2>&1 && r=0 || r=$?
ok "M146-01 thiếu TOKEN thì dừng (mã 2)" "$([ "$r" = 2 ] && echo 0 || echo 1)"

export TOKEN=token-gia
RA=$( { . "$GOC/bot/tests/lib/may146.sh"; echo "KHOA=$KHOA_146 ENV=$(printenv AIOI_NOI_BO_KEY) CONG=$CONG_146"; dong_146; } 2>&1 )
ok "M146-02 đọc khoá nội bộ qua ssh, export AIOI_NOI_BO_KEY" "$(grep -q 'KHOA=khoa-thu-123 ENV=khoa-thu-123 CONG=18080' <<<"$RA" && echo 0 || echo 1)"
ok "M146-03 nạp tệp không in khoá ra màn hình" "$([ "$(grep -c khoa-thu-123 <<<"$RA")" = 1 ] && echo 0 || echo 1)"

. "$GOC/bot/tests/lib/may146.sh"
: >"$GHI"
vps "curl -sS -X POST http://127.0.0.1:8000/reset/abc >/dev/null"
ok "M146-04 curl tới lõi kèm x-noi-bo-key và đi qua cổng đường hầm" \
   "$(grep -q 'ARGS: -H x-noi-bo-key: khoa-thu-123 -sS -X POST http://127.0.0.1:18080/reset/abc' "$GHI" && echo 0 || echo 1)"

: >"$GHI"
vps "for u in a b; do curl -sS -X POST http://127.0.0.1:8000/reset/\$u >/dev/null; done"
ok "M146-05 vòng for dọn nhiều ID: mỗi lượt đều kèm khoá" "$([ "$(grep -c 'x-noi-bo-key: khoa-thu-123 .*18080/reset/[ab]' "$GHI")" = 2 ] && echo 0 || echo 1)"

: >"$GHI"
TRA=$(jq -nc '{external_user_id:"thu-1", text:"chào em"}' | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-")
ok "M146-06 chat-reply giữ stdin (-d @-) và trả JSON" "$(grep -q 'STDIN: .*chào em' "$GHI" && [ "$(jq -r '.replies[0]' <<<"$TRA")" = ok ] && echo 0 || echo 1)"

LOG=$(vps "journalctl -u aond-core --since '-10 min' --no-pager -o cat | grep -E 'Kế hoạch'")
ok "M146-07 journalctl → nhật ký 146 từ mốc, qua phần lọc phía sau" "$([ "$LOG" = 'dong 4 Kế hoạch: gia' ] && echo 0 || echo 1)"

vps "systemctl stop aond-luan" 2>/dev/null && r=0 || r=$?
ok "M146-08 lệnh Linux khác không lặng lẽ chạy (mã 2)" "$([ "$r" = 2 ] && echo 0 || echo 1)"

CUOI=$(log_cuoi_146 50)
ok "M146-09 log_cuoi_146 trả tên tệp + dòng cuối, bỏ \\r" "$(grep -q '^== C:' <<<"$CUOI" && ! grep -q $'\r' <<<"$CUOI" && echo 0 || echo 1)"
dong_146

[ "$hong" = 0 ] && echo "may146: đạt" || { echo "may146: $hong ca hỏng"; exit 1; }
