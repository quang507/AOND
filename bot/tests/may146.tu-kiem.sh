#!/usr/bin/env bash
# may146.tu-kiem.sh — tự kiểm bot/tests/lib/may146.sh bằng ssh GIẢ (SRS-5.1zzzzzzz405), không cần máy 146.
# Đỏ khi: log_cuoi_146 thôi trả tên tệp + dòng cuối, còn sót \r của Windows, hoặc nạp tệp mà gọi ssh (nạp phải không chạm mạng).
# SRS-5.1zzzzzzz505: các ca M146-01…08 kiểm đường hầm / khoá / vps() của script bắn thử đã gỡ — bỏ cùng phần đó.
set -euo pipefail
GOC="$(cd "$(dirname "$0")/../.." && pwd)"
TAM=$(mktemp -d); trap 'rm -rf "$TAM"' EXIT
mkdir -p "$TAM/bin"; export GHI="$TAM/ssh.log"; : >"$GHI"

cat >"$TAM/bin/ssh" <<'EOF'
#!/usr/bin/env bash
echo goi >>"$GHI"
printf '== C:/aond/logs/a.log\r\ndong cuoi\r\n'
EOF
chmod +x "$TAM/bin/ssh"
export PATH="$TAM/bin:$PATH"

hong=0
ok() { if [ "$2" = 0 ]; then echo "✓ $1"; else echo "✗ $1"; hong=$((hong + 1)); fi; }

. "$GOC/bot/tests/lib/may146.sh"
ok "M146-10 nạp tệp không gọi ssh" "$([ ! -s "$GHI" ] && echo 0 || echo 1)"

CUOI=$(log_cuoi_146 50)
# So khớp bằng [[ ]] chứ không bằng grep: grep của Git Bash trên Windows bỏ \r ở mẫu → mẫu rỗng khớp mọi dòng.
loi=0
[[ "$CUOI" == "== C:"* ]] || loi=1
[[ "$CUOI" == *"dong cuoi"* ]] || loi=1
[[ "$CUOI" != *$'\r'* ]] || loi=1
ok "M146-09 log_cuoi_146 trả tên tệp + dòng cuối, bỏ \\r" "$loi"

[ "$hong" = 0 ] && echo "may146: đạt" || { echo "may146: $hong ca hỏng"; exit 1; }
