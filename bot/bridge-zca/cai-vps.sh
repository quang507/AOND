#!/usr/bin/env bash
# cai-vps.sh — dựng bridge Zalo trên VPS Ubuntu 22.04/24.04 bằng MỘT lệnh.
# Gói đúng các bước 1, 2, 4 của VPS.md; bước 3 (quét QR) bắt buộc làm tay.
#
# Chạy trên VPS với quyền root (hoặc user có sudo):
#     curl -fsSL https://raw.githubusercontent.com/quang507/Nhadat.cc/main/bot/bridge-zca/cai-vps.sh -o cai-vps.sh
#     sudo BRIDGE_SECRET='<giá trị trong Supabase → Vault → BRIDGE_SECRET>' bash cai-vps.sh
#
# Chạy lại được: máy đã có node/user/repo thì bỏ qua, chỉ `git pull` + `npm i`.
# Không có BRIDGE_SECRET trong env thì script hỏi (nhập không hiện chữ).
# Script KHÔNG in secret ra màn hình và KHÔNG ghi vào log.
set -euo pipefail

REPO=https://github.com/quang507/Nhadat.cc.git
# Nhánh lấy code (mặc định main). Cần chạy bản chưa merge thì NHANH=<tên nhánh>.
NHANH="${NHANH:-main}"
DIR=/opt/nhadat
BR=$DIR/bot/bridge-zca

buoc() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
xong() { printf '\033[32m✓ %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Chạy bằng root: sudo bash cai-vps.sh"; exit 1; }

buoc "1/5 Node 20 + git + tmux"
if command -v node >/dev/null && [ "$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')" -ge 20 ]; then
  xong "node $(node -v) đã có"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  xong "node $(node -v)"
fi
apt-get install -y -qq git tmux >/dev/null
command -v node >/dev/null && [ -x /usr/bin/node ] || ln -sf "$(command -v node)" /usr/bin/node

buoc "2/5 user nhadat + $DIR"
id nhadat >/dev/null 2>&1 || useradd -m -s /bin/bash nhadat
mkdir -p "$DIR" && chown nhadat:nhadat "$DIR"
if [ -d "$DIR/.git" ]; then
  sudo -u nhadat git -C "$DIR" fetch -q origin "$NHANH" && sudo -u nhadat git -C "$DIR" checkout -q "$NHANH" && sudo -u nhadat git -C "$DIR" pull --ff-only -q origin "$NHANH" && xong "repo đã có, nhánh $NHANH, pull xong"
else
  sudo -u nhadat git clone -q -b "$NHANH" "$REPO" "$DIR" && xong "clone xong (nhánh $NHANH)"
fi

buoc "3/5 npm i zca-js"
sudo -u nhadat bash -c "cd '$BR' && { [ -f package.json ] || npm init -y >/dev/null; } && npm i --no-audit --no-fund zca-js >/dev/null"
xong "zca-js $(sudo -u nhadat bash -c "cd '$BR' && node -p 'require(\"zca-js/package.json\").version'" 2>/dev/null || echo '?')"

buoc "4/5 BRIDGE_SECRET → $BR/.env"
if [ -f "$BR/.env" ] && grep -qE '^BRIDGE_SECRET=.+' "$BR/.env" && [ -z "${BRIDGE_SECRET:-}" ]; then
  xong ".env đã có secret, giữ nguyên"
else
  if [ -z "${BRIDGE_SECRET:-}" ]; then
    read -r -s -p "Dán BRIDGE_SECRET (Supabase → Project Settings → Vault): " BRIDGE_SECRET; echo
  fi
  # bỏ nháy/ngoặc nhọn nếu lỡ dán kèm (VPS.md §2)
  BRIDGE_SECRET="${BRIDGE_SECRET#\"}"; BRIDGE_SECRET="${BRIDGE_SECRET%\"}"
  BRIDGE_SECRET="${BRIDGE_SECRET#<}";  BRIDGE_SECRET="${BRIDGE_SECRET%>}"
  [ -n "$BRIDGE_SECRET" ] || { echo "BRIDGE_SECRET rỗng — dừng."; exit 1; }
  umask 077
  printf 'BRIDGE_SECRET=%s\n' "$BRIDGE_SECRET" > "$BR/.env"
  chown nhadat:nhadat "$BR/.env"; chmod 600 "$BR/.env"
  xong ".env ghi xong (chmod 600), ${#BRIDGE_SECRET} ký tự"
fi

buoc "5/5 systemd nhadat-bridge"
cp "$BR/nhadat-bridge.service" /etc/systemd/system/nhadat-bridge.service
systemctl daemon-reload
systemctl enable nhadat-bridge >/dev/null 2>&1
if [ -f "$BR/zalo-session.json" ]; then
  systemctl restart nhadat-bridge && xong "đã có zalo-session.json → service đang chạy"
  echo "  Xem log: journalctl -u nhadat-bridge -f"
else
  systemctl restart nhadat-bridge
  xong "service đang chạy và CHỜ QUÉT QR"
  cat <<'HD'

════════════════════════════════════════════════════════════════
CÒN MỘT BƯỚC LÀM TAY: quét QR bằng acc Zalo CLONE (VPS.md §3)

    journalctl -u nhadat-bridge -n 30 --no-pager
    # → có dòng "▶ QUÉT QR" kèm link http://<ip>:8787/qr-<token>.png
    # mở link đó trên điện thoại (hoặc trình duyệt máy tính), Zalo app → QR → quét
    # thấy "Bridge sẵn sàng" trong log là xong; service tự chạy tiếp, không cần làm gì thêm

Không mở được link → mở cổng 8787 ở Firewall của nhà cung cấp, hoặc:
    scp root@<ip>:/opt/nhadat/bot/bridge-zca/qr.png .   (rồi mở file mà quét)
Kiểm từ DB: select * from bot_health where who = 'bridge-zca'  → cột at phải nhích.
════════════════════════════════════════════════════════════════
HD
fi
