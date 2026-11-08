# siet-acl-146.ps1 — siết ACL các thư mục dịch vụ chạy dưới SYSTEM trên máy 146 (SRS-5.1zzzzzzz399, audit N2 08/11/2026).
# Thư mục tạo thẳng dưới C:\ thừa hưởng "Authenticated Users: Modify" → user thường sửa .cmd/.py chạy dưới SYSTEM, đọc .env + cookie Zalo.
# Chạy (quyền admin, ví dụ ssh nuc): chép file sang rồi  powershell -ExecutionPolicy Bypass -File siet-acl-146.ps1
# Khôi phục ACL cũ: icacls C:\ /restore C:\ProgramData\acl-backup-20261108\<tên>.acl
# Thêm thư mục dịch vụ mới dưới C:\ thì thêm vào $RIENG (có bí mật) hoặc $CHUNG (runtime dùng chung, Users chỉ đọc).
$ErrorActionPreference = 'Stop'
$BK = 'C:\ProgramData\acl-backup-20261108'
$RIENG = 'C:\aond','C:\gatemonitor','C:\goi-bot','C:\stock-bot','C:\radar','C:\openwa-server'
$CHUNG = 'C:\Python311','C:\gm_venv','C:\tools'
if (-not (Test-Path $BK)) {
  New-Item -ItemType Directory $BK | Out-Null
  icacls $BK /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /Q | Out-Null
  foreach ($d in $RIENG + $CHUNG) {
    $ten = Split-Path $d -Leaf
    icacls $d /save "$BK\$ten.acl" /T /C /Q | Out-Null
    "sao luu $d -> $BK\$ten.acl ($((Get-Item "$BK\$ten.acl").Length) byte)"
  }
} else { "da co sao luu o $BK, khong ghi de" }
foreach ($d in $RIENG) {
  icacls $d /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /C /Q | Out-Null
  "siet RIENG $d (rc=$LASTEXITCODE)"
}
foreach ($d in $CHUNG) {
  icacls $d /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' /C /Q | Out-Null
  "siet CHUNG $d (rc=$LASTEXITCODE)"
}
