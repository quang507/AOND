# may146.sh — đọc nhật ký lõi production trên MÁY 146 cho `bot/tests/doc-log-loi.sh` (SRS-5.1zzzzzzz405). CHỈ ĐỌC: không gọi lõi, không mở
# đường hầm, không cần khoá. Chạy TỪ MÁY CÁ NHÂN có `ssh "$MAY_146"` vào thẳng (mặc định `nguye@192.168.1.146` qua LAN, như
# scripts/trien-khai-146.sh; ngoài mạng đặt MAY_146=nguye@100.85.245.112 — Tailscale). GitHub Actions không với tới 146.
# SRS-5.1zzzzzzz505: phần đường hầm + khoá nội bộ + `vps()` + `log_146` chỉ phục vụ các script bắn thử `ban-thu-*` đã gỡ (SRS-498) — đã bỏ.
#
# Nạp:  . "$(dirname "$0")/lib/may146.sh"
# Cung cấp:  log_cuoi_146 N — N dòng cuối tệp nhật ký mới nhất trong C:\aond\logs (dòng đầu là "== <đường dẫn tệp>").

MAY_146="${MAY_146:-nguye@192.168.1.146}"
export MAY_146

# PowerShell trên 146 qua -EncodedCommand (UTF-16LE base64) — tránh lớp trích dẫn của cmd.exe (shell mặc định của OpenSSH Windows).
ps146() {
  ssh -o ConnectTimeout=20 -o LogLevel=ERROR "$MAY_146" \
    "powershell -NoProfile -NonInteractive -EncodedCommand $(printf '%s' "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $1" | iconv -f utf-8 -t utf-16le | base64 -w0)"
}

_PS_TEP_LOG='$f = Get-ChildItem C:\aond\logs -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1'

log_cuoi_146() {
  ps146 "$_PS_TEP_LOG; if (\$f) { '== ' + \$f.FullName; Get-Content -LiteralPath \$f.FullName -Encoding UTF8 -Tail ${1:-2000} }" | tr -d '\r'
}
