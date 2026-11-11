# siet-acl-146.ps1 — siết ACL thư mục bot AOND (C:\aond) trên máy 146 (SRS-5.1zzzzzzz399, audit N2 08/11/2026).
# Thư mục tạo thẳng dưới C:\ thừa hưởng "Authenticated Users: Modify" → user thường sửa .cmd/.py chạy dưới SYSTEM, đọc .env + cookie Zalo.
# CHỈ C:\aond — thư mục bot khác trên 146 không thuộc repo này, không đụng (chủ dự án 08/11: "bot khác kệ nó").
# Chạy (quyền admin, ví dụ ssh nguye@192.168.1.146): chép file sang rồi  powershell -ExecutionPolicy Bypass -File siet-acl-146.ps1
# Khôi phục ACL cũ: icacls C:\ /restore C:\ProgramData\acl-backup-20261108\aond.acl
$ErrorActionPreference = 'Stop'
$BK = 'C:\ProgramData\acl-backup-20261108'
$D = 'C:\aond'
if (-not (Test-Path "$BK\aond.acl")) {
  if (-not (Test-Path $BK)) {
    New-Item -ItemType Directory $BK | Out-Null
    icacls $BK /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /Q | Out-Null
  }
  icacls $D /save "$BK\aond.acl" /T /C /Q | Out-Null
  "sao luu $D -> $BK\aond.acl"
} else { "da co sao luu $BK\aond.acl, khong ghi de" }
icacls $D /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /C /Q | Out-Null
"siet $D (rc=$LASTEXITCODE)"
