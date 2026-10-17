#!/usr/bin/env bash
# cai-vps.sh — dựng TRANG CHAT THỬ BOT trên VPS Ubuntu, chạy 24/7, tự nạp code mới (08/10/2026).
#
# Chủ dự án: "để link được lâu lâu tí chứ còn người khác test nữa", "t có vps, chạy trên vps được ko".
# Giống chat-web.yml (mã chat-reply THẬT, DB GIẢ trong bộ nhớ, đường hầm trycloudflare) nhưng không bị trần 6 giờ của
# GitHub Actions. Ba service systemd:
#   trang-thu          bun bot/tests/chat/chat.mjs --web, chỉ nghe 127.0.0.1:3100, user riêng `trangthu`
#                      (không đọc được session Zalo của bridge chạy bằng user `nhadat`)
#   trang-thu-ham      cloudflared quick tunnel → link https://….trycloudflare.com. Không tắt khi nạp code mới, nên
#                      LINK GIỮ NGUYÊN; chỉ đổi khi VPS khởi động lại hoặc service này bật lại. Xem link: `trang-thu-link`
#   trang-thu-cap-nhat (timer mỗi phút) nhánh có commit mới → tắt trang (chat.mjs --luu-trang cất lịch sử / DB giả /
#                      nhật ký / ảnh / bản sửa prompt), kéo code, bật lại và nạp. Code mới không bật được → quay về.
#
# Chạy trên VPS bằng root:
#   curl -fsSL https://raw.githubusercontent.com/quang507/Nhadat.cc/claude/zealous-ramanujan-p5ftyj/bot/tests/chat/cai-vps.sh -o cai-trang-thu.sh
#   sudo bash cai-trang-thu.sh
# Chạy lại được (đổi nhánh: NHANH=<tên nhánh>). Script hỏi ANTHROPIC_API_KEY (gõ không hiện chữ) và không in ra đâu cả;
# nên dùng một khoá RIÊNG có hạn mức chi — link lộ thì xoá khoá đó, production không ảnh hưởng.
# Tuỳ chọn một lần: SUPABASE_ACCESS_TOKEN=… trước `bash` để kéo công tắc + mẫu câu + tên đường production (keo-that.mjs);
# token chỉ dùng cho lệnh đó, KHÔNG lưu xuống máy.
set -euo pipefail

REPO=https://github.com/quang507/Nhadat.cc.git
NHANH="${NHANH:-claude/zealous-ramanujan-p5ftyj}"
DIR=/opt/trang-thu
U=trangthu
PORT=3100
TRAN="${TRAN:-3000}"
# sha256 của khoá đọc /nhat-ky (mã băm công khai được; khoá thật không bao giờ nằm ở đây). Trống = tắt /nhat-ky.
BAM_LOG="${BAM_LOG:-cb2c577b05276e004131b761cb086f99b5b80d61ea3ea1f224424a0959b286e7}"
ENVF=/etc/trang-thu.env

buoc() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
xong() { printf '\033[32m✓ %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Chạy bằng root: sudo bash $0"; exit 1; }

buoc "1/7 Gói hệ thống + RAM"
apt-get update -qq && apt-get install -y -qq git curl unzip jq >/dev/null
RAM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
echo "RAM ${RAM_MB} MB, swap ${SWAP_MB} MB"
if [ "$RAM_MB" -lt 1800 ] && [ "$SWAP_MB" -lt 512 ] && [ ! -f /swapfile ]; then
  # Đóng gói chat-reply (bun build) ăn vài trăm MB một lúc; máy 1 GB đang chạy bridge thì dễ hết RAM.
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  xong "thêm swap 1 GB (/swapfile)"
fi

buoc "2/7 user $U + bun"
id "$U" >/dev/null 2>&1 || useradd -m -s /bin/bash "$U"
if [ ! -x "/home/$U/.bun/bin/bun" ]; then
  sudo -iu "$U" bash -c 'curl -fsSL https://bun.sh/install | bash' >/dev/null
fi
BUN="/home/$U/.bun/bin/bun"
xong "bun $(sudo -iu "$U" "$BUN" --version)"

buoc "3/7 code nhánh $NHANH → $DIR"
mkdir -p "$DIR" && chown "$U:$U" "$DIR"
if [ -d "$DIR/.git" ]; then
  sudo -u "$U" git -C "$DIR" fetch -q --depth 1 origin "$NHANH"
  sudo -u "$U" git -C "$DIR" reset -q --hard FETCH_HEAD
else
  sudo -u "$U" git clone -q --depth 1 -b "$NHANH" "$REPO" "$DIR"
fi
sudo -u "$U" bash -c "cd '$DIR' && '$BUN' install --frozen-lockfile >/dev/null"
echo "$NHANH" > /etc/trang-thu.nhanh
xong "commit $(sudo -u "$U" git -C "$DIR" rev-parse --short HEAD)"

buoc "4/7 khoá Anthropic → $ENVF (chỉ root đọc)"
if [ -f "$ENVF" ] && grep -qE '^ANTHROPIC_API_KEY=.+' "$ENVF" && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  xong "đã có khoá, giữ nguyên"
else
  [ -n "${ANTHROPIC_API_KEY:-}" ] || { read -r -s -p "Dán ANTHROPIC_API_KEY (khoá riêng cho trang thử): " ANTHROPIC_API_KEY; echo; }
  [ -n "$ANTHROPIC_API_KEY" ] || { echo "Khoá rỗng — dừng."; exit 1; }
  umask 077
  { echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
    echo "ANTHROPIC_MODEL=claude-haiku-4-5-20251001"   # như chat-web.yml (chủ dự án 07/10: "model là haiku thôi")
    echo "CHAT_LOG_BAM=$BAM_LOG"
  } > "$ENVF"
  chmod 600 "$ENVF"
  xong "đã ghi (không in)"
fi

if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  buoc "4b kéo công tắc + mẫu câu + tên đường production (token không lưu)"
  sudo -u "$U" env SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" bash -c "cd '$DIR' && '$BUN' bot/tests/chat/keo-that.mjs" \
    && xong "that.json xong" || echo "Không kéo được — trang chạy công tắc mặc định."
fi

buoc "5/7 service trang-thu (127.0.0.1:$PORT)"
cat > /etc/systemd/system/trang-thu.service <<EOF
[Unit]
Description=Trang chat thu bot (DB gia, chat-reply that)
After=network-online.target

[Service]
User=$U
WorkingDirectory=$DIR
EnvironmentFile=$ENVF
StateDirectory=trang-thu
ExecStart=/bin/bash -c 'CHAT_PHIEN=\$\$(git rev-parse --short HEAD) exec $BUN bot/tests/chat/chat.mjs --web --host 127.0.0.1 --port $PORT --tran $TRAN --prompt code --luu-trang /var/lib/trang-thu/trang.json'
# SIGTERM: chat.mjs chờ lượt đang chạy xong rồi cất trạng thái
KillSignal=SIGTERM
TimeoutStopSec=100
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

buoc "6/7 đường hầm cloudflared"
if ! command -v cloudflared >/dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  dpkg -i /tmp/cloudflared.deb >/dev/null && rm -f /tmp/cloudflared.deb
fi
cat > /etc/systemd/system/trang-thu-ham.service <<EOF
[Unit]
Description=Duong ham trycloudflare cho trang chat thu
After=network-online.target trang-thu.service

[Service]
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$PORT
Restart=always
RestartSec=10
User=$U

[Install]
WantedBy=multi-user.target
EOF
cat > /usr/local/bin/trang-thu-link <<'EOF'
#!/usr/bin/env bash
# In link hiện tại của trang chat thử (link mới nhất trong log đường hầm).
journalctl -u trang-thu-ham --no-pager -o cat | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
EOF
chmod 755 /usr/local/bin/trang-thu-link

buoc "7/7 tự nạp code mới (timer mỗi phút)"
cat > /usr/local/bin/trang-thu-cap-nhat <<EOF
#!/usr/bin/env bash
# Nhánh có commit mới → tắt trang (cất trạng thái), kéo code, bật lại. Code mới không bật được → quay về commit cũ
# và nhớ commit hỏng để không thử lại mỗi phút (mỗi lần thử là một lần trang tắt).
set -uo pipefail
NHANH=\$(cat /etc/trang-thu.nhanh)
G() { sudo -u $U git -C $DIR "\$@"; }
G fetch -q --depth 1 origin "\$NHANH" 2>/dev/null || exit 0
CU=\$(G rev-parse HEAD); MOI=\$(G rev-parse FETCH_HEAD)
[ "\$CU" = "\$MOI" ] && exit 0
[ "\$MOI" = "\$(cat /var/lib/trang-thu-bo-qua 2>/dev/null)" ] && exit 0
song() { for i in \$(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:$PORT/ && return 0; sleep 2; done; return 1; }
echo "nạp \${MOI:0:7} (đang chạy \${CU:0:7})"
systemctl stop trang-thu
G reset -q --hard "\$MOI"
sudo -u $U bash -c "cd $DIR && $BUN install --frozen-lockfile >/dev/null 2>&1"
systemctl start trang-thu
if song; then echo "đã nạp \${MOI:0:7}"; exit 0; fi
echo "\${MOI:0:7} không bật được — quay về \${CU:0:7}"
echo "\$MOI" > /var/lib/trang-thu-bo-qua
systemctl stop trang-thu
G reset -q --hard "\$CU"
sudo -u $U bash -c "cd $DIR && $BUN install --frozen-lockfile >/dev/null 2>&1"
systemctl start trang-thu
EOF
chmod 755 /usr/local/bin/trang-thu-cap-nhat
cat > /etc/systemd/system/trang-thu-cap-nhat.service <<EOF
[Unit]
Description=Nap code moi cho trang chat thu

[Service]
Type=oneshot
ExecStart=/usr/local/bin/trang-thu-cap-nhat
EOF
cat > /etc/systemd/system/trang-thu-cap-nhat.timer <<EOF
[Unit]
Description=Moi phut soi nhanh cho trang chat thu

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable -q trang-thu trang-thu-ham trang-thu-cap-nhat.timer
systemctl restart trang-thu
for i in $(seq 1 60); do curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 2; done
curl -sf -o /dev/null "http://127.0.0.1:$PORT/" || { echo "Trang không bật được:"; journalctl -u trang-thu -n 30 --no-pager; exit 1; }
systemctl restart trang-thu-ham
systemctl start trang-thu-cap-nhat.timer
L=""; for i in $(seq 1 30); do L=$(trang-thu-link || true); [ -n "$L" ] && break; sleep 2; done
echo
xong "Trang chat thử: ${L:-(chưa có link — chạy lại: trang-thu-link)}"
echo "Xem link: trang-thu-link · log: journalctl -u trang-thu -f · tắt: systemctl disable --now trang-thu trang-thu-ham trang-thu-cap-nhat.timer"
