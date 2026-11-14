# Chay bo vang (tests/kich_ban/vang.json) + barem tren may 146 bang API that, nhu production (SRS-5.1zzzzzzz493).
# Goi tu scripts/do-vang-146.sh - script nay nam o C:\aond\tmp tren 146. Luu khong dau (PowerShell 5.1 doc .ps1 theo ANSI).
# Khoa API doc tu .env loi, khong in; Supabase de trong (kho SQLite tam, khong dung DB that / Zalo).
param([string]$Nhan = "thu", [string]$Chi = "", [string]$Thu = "vang", [string]$ChamLai = "")
if (Test-Path C:\aond\.env) { "CO C:\aond\.env - dung lai (loi se doc nham)"; exit 1 }
if ($Thu -notmatch '^vang[a-z0-9_]*$') { "Thu phai la vang... (vd vang, vang2) - khong xoa thu muc khac"; exit 1 }   # 14/11: xoa nham ca C:\aond\tmp
$thu = "C:\aond\tmp\$Thu"   # thu muc rieng cho moi luot chay song song
if (Test-Path $thu) { Remove-Item -Recurse -Force $thu }
New-Item -ItemType Directory $thu | Out-Null
tar -xf C:\aond\tmp\vang.tar -C $thu
$dong = Get-Content C:\aond\aond_core\.env | Where-Object { $_ -match '^ANTHROPIC_API_KEY=' } | Select-Object -First 1
$env:ANTHROPIC_API_KEY = ($dong -replace '^ANTHROPIC_API_KEY=', '').Trim().Trim('"')
if (-not $env:ANTHROPIC_API_KEY) { "thieu khoa API trong .env loi"; exit 1 }
$env:AIOI_LLM_PROVIDER = 'claude'; $env:SUPABASE_URL = ''; $env:PYTHONIOENCODING = 'utf-8'
Set-Location $thu
$a = @('scripts\cham-kich-ban.py', '--bo', 'tests\kich_ban\vang.json', '--barem', '--song-song', '4', '--ra', "C:\aond\tmp\kq_vang_$Nhan.json")
if ($Chi) { $a += @('--chi', $Chi) }
if ($ChamLai) { $a += @('--cham-lai', $ChamLai) }   # cham lai ban ghi cu bang barem hien tai, khong chay lai loi
& C:\aond\venv\Scripts\python.exe @a 2>&1 | Where-Object { "$_" -notmatch '^\s*\[' } | Out-File -Encoding utf8 "C:\aond\tmp\log_vang_$Nhan.txt"
Get-Content -Encoding utf8 "C:\aond\tmp\log_vang_$Nhan.txt" | Select-Object -Last 45
