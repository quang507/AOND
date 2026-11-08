#!/usr/bin/env bash
# trien-khai-146.sh — đưa src/ (lõi aioi) lên máy 146 và khởi động lại "AOND Core" (SRS-5.1zzzzzzz397).
# Từ 06/11/2026 bỏ VPS (chủ dự án 08/11: "không dùng vps nữa chuyển sang máy"); lõi chạy ở 146, C:\aond\aond_core
# (KHÔNG phải git, chép file), Task Scheduler. Thay cho tu-cai-vps.yml / cai-vps (đã gỡ). Cần `ssh nuc` thông (Tailscale).
#   bash scripts/trien-khai-146.sh            # từ gốc repo, sau khi main đã có commit cần đưa lên
# Không động tới .env lõi trên 146 (khoá, model đặt ở đó) và bridge Zalo (C:\aond\bridge-zca) — đổi bridge thì làm tay.
set -euo pipefail
MAY="${MAY_146:-nuc}"
cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain -- src)" ]; then echo "src/ còn thay đổi chưa commit — commit trước" >&2; exit 1; fi
TAM=$(mktemp -d)
trap 'rm -rf "$TAM"' EXIT
tar -cf "$TAM/src.tar" --exclude=__pycache__ src
ssh "$MAY" "if exist C:\\aond\\thu\\src rmdir /s /q C:\\aond\\thu\\src" >/dev/null
scp -q "$TAM/src.tar" "$MAY:C:/aond/thu/src.tar"
cat > "$TAM/trien-khai.ps1" <<'PS'
$ErrorActionPreference = "Stop"
$core = "C:\aond\aond_core"
Set-Location C:\aond\thu
tar -xf src.tar
$bk = "C:\aond\backup\src_" + (Get-Date -Format "yyyyMMdd_HHmmss")
New-Item -ItemType Directory -Force $bk | Out-Null
robocopy "$core\src" $bk /E /NFL /NDL /NJH /NJS | Out-Null
"sao luu: $bk"
robocopy "C:\aond\thu\src" "$core\src" /E /XD __pycache__ /NFL /NDL /NJH /NJS | Out-Null
schtasks /End /TN "AOND Core" | Out-Null
Start-Sleep -Seconds 3
schtasks /Run /TN "AOND Core" | Out-Null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:8000/health"; "health " + $r.StatusCode; exit 0 } catch {}
}
"HEALTH FAIL - khoi phuc: robocopy $bk $core\src /MIR"
Get-ChildItem C:\aond\logs | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { Get-Content $_.FullName -Tail 30 }
exit 1
PS
ssh "$MAY" "powershell -NoProfile -EncodedCommand $(iconv -f utf-8 -t utf-16le "$TAM/trien-khai.ps1" | base64 -w0)"
echo "== 146 đã lên $(git rev-parse --short HEAD)"
