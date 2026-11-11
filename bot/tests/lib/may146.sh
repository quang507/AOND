# may146.sh — nối các script bắn thử (`bot/tests/ban-thu-*.sh`, `doc-log-loi.sh`) với lõi production trên MÁY 146 (SRS-5.1zzzzzzz405).
# Thay khối VPS cũ (Vault VPS_HOST / VPS_ROOT_PASSWORD + sshpass root@VPS). Chạy TỪ MÁY CÁ NHÂN có `ssh "$MAY_146"` vào thẳng
# (mặc định Host `nuc` trong ~/.ssh/config, tài khoản admin Windows — cần để đọc khoá trong C:\aond\aond_core\.env, SRS-399).
# GitHub Actions không với tới 146 (lõi chỉ nghe 127.0.0.1, máy sau Tailscale) nên các script này không chạy trên Actions nữa.
#
# Nạp:  . "$(dirname "$0")/lib/may146.sh"   (sau khi script đã định nghĩa q(); đặt `trap 'don; dong_146' EXIT` sau don())
# Cần:  TOKEN (hoặc SUPABASE_ACCESS_TOKEN) — Management API cho q() đọc / dọn DB; PROJECT_REF mặc định project production.
# Đặt:  MAY_146 (mặc định nuc), CONG_146 (cổng đường hầm trên máy này, mặc định 18080),
#       CHI_DOC_LOG_146=1 — chỉ đọc nhật ký (không cần TOKEN, không lấy khoá, không mở đường hầm).
#
# Cung cấp:
#   vps "<lệnh>"   — giữ giao diện cũ: `curl … http://127.0.0.1:8000/…` chạy TẠI MÁY NÀY qua đường hầm, tự kèm header `x-noi-bo-key`
#                    (SRS-400); `journalctl …| phần sau` → nhật ký lõi trên 146 viết từ lúc nạp tệp này (C:\aond\logs, tệp mới nhất)
#                    đưa qua `phần sau`. Lệnh khác (systemctl, bash -s…) → lỗi, vì 146 là Windows.
#   log_146        — nhật ký lõi viết từ lúc nạp tệp này.   log_cuoi_146 N — N dòng cuối tệp nhật ký mới nhất.
#   dong_146       — đóng đường hầm.   KHOA_146 / AIOI_NOI_BO_KEY (export cho tiến trình con), CONG_146. Không in khoá ra màn hình.

MAY_146="${MAY_146:-nuc}"
CONG_146="${CONG_146:-18080}"
PROJECT_REF="${PROJECT_REF:-rqxmmqmctpklqcmbfxuj}"
export MAY_146 CONG_146 PROJECT_REF

# PowerShell trên 146 qua -EncodedCommand (UTF-16LE base64) — tránh lớp trích dẫn của cmd.exe (shell mặc định của OpenSSH Windows).
ps146() {
  ssh -o ConnectTimeout=20 -o LogLevel=ERROR "$MAY_146" \
    "powershell -NoProfile -NonInteractive -EncodedCommand $(printf '%s' "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $1" | iconv -f utf-8 -t utf-16le | base64 -w0)"
}

# Mốc nhật ký: tệp mới nhất trong C:\aond\logs và số dòng của nó lúc bắt đầu — log_146 chỉ in phần viết SAU mốc.
_PS_TEP_LOG='$f = Get-ChildItem C:\aond\logs -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1'
MOC_LOG_146=$(ps146 "$_PS_TEP_LOG; if (\$f) { \$f.FullName + '|' + @(Get-Content -LiteralPath \$f.FullName -Encoding UTF8).Count }" | tr -d '\r\n')

log_146() {
  local tep="${MOC_LOG_146%|*}" so="${MOC_LOG_146##*|}"
  [[ "$so" =~ ^[0-9]+$ ]] || so=0
  ps146 "$_PS_TEP_LOG; if (\$f) { \$bo = 0; if (\$f.FullName -eq '$tep') { \$bo = $so }; Get-Content -LiteralPath \$f.FullName -Encoding UTF8 | Select-Object -Skip \$bo }" \
    | tr -d '\r'
}

log_cuoi_146() {
  ps146 "$_PS_TEP_LOG; if (\$f) { '== ' + \$f.FullName; Get-Content -LiteralPath \$f.FullName -Encoding UTF8 -Tail ${1:-2000} }" | tr -d '\r'
}

dong_146() { [ -n "${HAM_146:-}" ] && kill "$HAM_146" 2>/dev/null; return 0; }

if [ "${CHI_DOC_LOG_146:-}" != 1 ]; then
  TOKEN="${TOKEN:-${SUPABASE_ACCESS_TOKEN:-}}"
  [ -n "$TOKEN" ] || { echo "Thiếu TOKEN (Supabase Management API) — export TOKEN=… hoặc SUPABASE_ACCESS_TOKEN=… rồi chạy lại"; exit 2; }
  export TOKEN

  KHOA_146=$(ps146 '(Select-String -LiteralPath C:\aond\aond_core\.env -Pattern "^AIOI_NOI_BO_KEY=" | Select-Object -First 1).Line.Substring(16)' \
             | tr -d '\r\n')
  [ -n "$KHOA_146" ] || { echo "Không đọc được AIOI_NOI_BO_KEY trong C:\\aond\\aond_core\\.env qua ssh $MAY_146 (cần tài khoản admin)"; exit 2; }
  AIOI_NOI_BO_KEY="$KHOA_146"
  export KHOA_146 AIOI_NOI_BO_KEY

  # Đường hầm 127.0.0.1:$CONG_146 (máy này) → 127.0.0.1:8000 (lõi trên 146).
  ssh -o ConnectTimeout=20 -o LogLevel=ERROR -o ExitOnForwardFailure=yes -N -L "$CONG_146:127.0.0.1:8000" "$MAY_146" &
  HAM_146=$!
  trap dong_146 EXIT   # script nạp tệp này đặt lại thành `trap 'don; dong_146' EXIT` sau khi định nghĩa don()
  for _i in $(seq 1 20); do curl -sS -m 3 "http://127.0.0.1:$CONG_146/health" >/dev/null 2>&1 && break; sleep 1; done
  curl -sS -m 5 "http://127.0.0.1:$CONG_146/health" >/dev/null 2>&1 \
    || { echo "Đường hầm tới lõi 146 không lên (ssh $MAY_146, cổng $CONG_146)"; exit 1; }
fi

vps() {
  local c="$1"
  case "$c" in
    journalctl*)
      local sau="cat"
      [[ "$c" == *"|"* ]] && sau="${c#*|}"
      log_146 | bash -c "$sau"
      ;;
    *curl*)
      [ -n "${KHOA_146:-}" ] || { echo "vps: chế độ CHI_DOC_LOG_146 không gọi được lõi" >&2; return 2; }
      c="${c//http:\/\/127.0.0.1:8000/http://127.0.0.1:$CONG_146}"
      c="${c//curl /curl -H \"x-noi-bo-key: \$KHOA_146\" }"
      bash -c "$c"
      ;;
    *)
      echo "vps: lệnh '${c%% *}' không chạy được trên máy 146 (Windows) — script này chưa chuyển sang 146" >&2
      return 2
      ;;
  esac
}
