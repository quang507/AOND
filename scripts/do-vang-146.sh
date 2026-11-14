#!/usr/bin/env bash
# Đo độ tự nhiên lời bot trên máy 146 (SRS-5.1zzzzzzz493): đóng gói lõi + bộ chấm của checkout hiện tại, chạy bộ vàng 15 kịch bản
# + barem N lần bằng API thật (như production; tốn tiền API, ~15 phút / lần), kéo bản ghi về, dựng trang bảng điểm.
#
#   MAY_146=nguye@100.85.245.112 bash scripts/do-vang-146.sh tuan46 2              # nhãn, số lần
#   ... bash scripts/do-vang-146.sh tuan47 2 ket-qua/kq_vang_tuan46_*.json          # thêm bản ghi tuần trước để hiện chênh
#
# Bản ghi + trang ở ket-qua/ (đã .gitignore — có lời bot đầy đủ, không đẩy lên repo công khai). Lõi trên 146 không bị đụng:
# chạy bản đóng gói ở C:\aond\tmp\vang, kho SQLite tạm, không Supabase / Zalo.
set -euo pipefail
cd "$(dirname "$0")/.."
MAY="${MAY_146:?đặt MAY_146=user@host}"
NHAN="${1:-$(date +%Y%m%d)}"; LAN="${2:-2}"; shift $(( $# >= 2 ? 2 : $# )) || true
mkdir -p ket-qua
tar -cf ket-qua/vang.tar src scripts/cham-kich-ban.py tests/kich_ban bot/cau-hinh-loi.env
scp -q ket-qua/vang.tar "$MAY:C:/aond/tmp/vang.tar"
scp -q scripts/do-vang-146.ps1 "$MAY:C:/aond/tmp/do-vang-146.ps1"
ds=()
for i in $(seq 1 "$LAN"); do
  echo "== lần $i / $LAN"
  ssh "$MAY" "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\aond\\tmp\\do-vang-146.ps1 -Nhan ${NHAN}_$i" | tail -12
  scp -q "$MAY:C:/aond/tmp/kq_vang_${NHAN}_$i.json" "ket-qua/kq_vang_${NHAN}_$i.json"
  ds+=("ket-qua/kq_vang_${NHAN}_$i.json")
done
truoc=(); [ $# -gt 0 ] && truoc=(--truoc "$@")
PYTHONIOENCODING=utf-8 python scripts/bang-diem.py "${ds[@]}" "${truoc[@]}" --ra "ket-qua/bang-diem_${NHAN}.html"
