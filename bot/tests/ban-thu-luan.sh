#!/usr/bin/env bash
# ban-thu-luan.sh — chạy BẢN CỦA ANH LUẬN (github.com/luan8560/aond, nhánh main) trên VPS ở cổng 8001 rồi bắn CÙNG kịch bản vào bản đó và vào lõi của mình
# (cổng 8000, ID thử `thu-lc-…`, tự dọn) để so cạnh (SRS-5.1zzzzzzz199, chủ dự án 26/10/2026: "đưa bản của anh Luận lên VPS bắn thử").
# AN TOÀN: bản của anh Luận chạy thành dịch vụ RIÊNG `aond-luan` (127.0.0.1:8001, SQLite riêng /opt/aond_luan/aioi.db, chỉ mượn khoá
# Anthropic + tên model từ .env lõi — KHÔNG mượn khoá Supabase) — không đụng `aond-core` (cổng 8000), bridge Zalo hay Supabase. Chạy xong dừng dịch vụ.
# Cần: TOKEN (Management API), PROJECT_REF. Tiền thật: 2 kịch bản × ~6 lượt × 2 bản, mỗi lượt vài lượt AI. Chỉ IN để người đọc chấm; chỉ thoát
# khác 0 khi hạ tầng hỏng (dịch vụ không lên / không có lời đáp).
set -euo pipefail

q() { curl -sS -f -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(jq -n --arg q "$1" '{query:$q}')"; }

J=$(q "select json_object_agg(name, decrypted_secret) as s from vault.decrypted_secrets where name in ('VPS_HOST','VPS_ROOT_PASSWORD')")
HOST=$(jq -r '.[0].s.VPS_HOST // empty' <<<"$J"); PW=$(jq -r '.[0].s.VPS_ROOT_PASSWORD // empty' <<<"$J")
unset J
for v in "$HOST" "$PW"; do [ -n "$v" ] && echo "::add-mask::$v"; done
if [ -z "$HOST" ] || [ -z "$PW" ]; then echo "::error::Thiếu VPS_HOST / VPS_ROOT_PASSWORD trong Vault"; exit 1; fi
command -v sshpass >/dev/null || sudo apt-get install -y -qq sshpass >/dev/null
export SSHPASS="$PW"; unset PW
vps() { sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o LogLevel=ERROR "root@$HOST" "$@"; }

RUN="${GITHUB_RUN_ID:-$(date +%s)}"
ID_MINH_HHT="thu-lc-m-$RUN-hht"; ID_MINH_BH="thu-lc-m-$RUN-bh"
don() {
  echo; echo "== dọn: dừng aond-luan, xoá dữ liệu thử của lõi mình"
  vps "systemctl stop aond-luan 2>/dev/null; echo \"aond-luan: \$(systemctl is-active aond-luan 2>/dev/null)\"" || true
  for id in "$ID_MINH_HHT" "$ID_MINH_BH"; do
    vps "curl -sS -X POST http://127.0.0.1:8000/reset/$id >/dev/null" || true
    q "select reset_nguoi_test('$id') as kq" | jq -c '.[0]' || true
  done
}
trap don EXIT

# ───────────────────────── 1. Dựng bản anh Luận trên VPS ─────────────────────────
echo "== 1. dựng bản anh Luận ở cổng 8001"
vps "bash -s" <<'REMOTE'
set -euo pipefail
D=/opt/aond_luan
systemctl stop aond-luan 2>/dev/null || true
if ss -ltn | grep -q ':8001 '; then echo "cổng 8001 đang bị một tiến trình khác dùng — dừng, không động tới"; ss -ltnp | grep ':8001 ' | sed -E 's/users:.*//'; exit 1; fi

# Mã nguồn: bản công khai trên GitHub, nhánh main (untracked như .env / aioi.db / deps được giữ).
if [ -d "$D/.git" ]; then
  git -C "$D" fetch --depth=1 -q origin main && git -C "$D" reset -q --hard FETCH_HEAD
else
  rm -rf "$D.tmp"; git clone -q --depth 1 https://github.com/luan8560/aond "$D.tmp"
  mkdir -p "$D"; cp -a "$D.tmp"/. "$D"/; rm -rf "$D.tmp"
fi
echo "commit: $(git -C "$D" log -1 --format='%h %ad %s' --date=format:'%d/%m %H:%M')"

# Trình thông dịch: dùng đúng cái của aond-core (đã có anthropic / fastapi / uvicorn); thiếu gì thì cài vào $D/deps, không đụng hệ thống.
EXEC=$(systemctl cat aond-core | sed -nE 's/^ExecStart=//p' | head -1 | awk '{print $1}')
BIN=$(dirname "$EXEC")
if [ -x "$BIN/python" ]; then PY="$BIN/python"; elif [ -x "$BIN/python3" ]; then PY="$BIN/python3"; else PY=$(command -v python3); fi
SVC_USER=$(systemctl cat aond-core | sed -nE 's/^User=//p' | head -1); SVC_USER=${SVC_USER:-root}
echo "python: $PY ($("$PY" -V 2>&1)) · chạy bằng user: $SVC_USER"
mkdir -p "$D/deps"
for pair in PIL:pillow openpyxl:openpyxl dotenv:python-dotenv fastapi:fastapi uvicorn:uvicorn pydantic:pydantic anthropic:anthropic; do
  mod=${pair%%:*}; pkg=${pair##*:}
  if ! PYTHONPATH="$D/deps" "$PY" -c "import $mod" 2>/dev/null; then
    echo "thiếu $mod → pip install --target deps $pkg"
    "$PY" -m pip install -q --target "$D/deps" "$pkg" 2>&1 | tail -2
  fi
done

# .env: CHỈ khoá Anthropic + tên model mượn từ lõi mình (không in giá trị khoá), DB SQLite riêng. Không mượn khoá Supabase / Gemini / bridge.
KEY=$(grep -E '^ANTHROPIC_API_KEY=' /opt/aond_core/.env | tail -1 || true)
[ -n "$KEY" ] || { echo "không thấy ANTHROPIC_API_KEY trong /opt/aond_core/.env"; exit 1; }
{
  echo "$KEY"
  echo "AIOI_LLM_PROVIDER=claude"
  echo "AIOI_DB_PATH=$D/aioi.db"
  grep -E '^AIOI_(CHAT|EXTRACT|VISION)_MODEL=' /opt/aond_core/.env || true
} > "$D/.env"
chmod 600 "$D/.env"
echo ".env của bản Luận (chỉ tên biến + model): $(sed -nE 's/^(ANTHROPIC_API_KEY)=.*/\1=***/p; s/^(AIOI_[A-Z_]*)=(.*)/\1=\2/p' "$D/.env" | tr '\n' ' ')"
echo "(model mặc định nếu .env lõi không đặt: chat/extract claude-haiku-4-5 — theo config.py của anh Luận)"

rm -f "$D/aioi.db"   # mỗi lượt bắn bắt đầu từ DB trống để ID thử không dính kết quả cũ
chown -R "$SVC_USER" "$D"

cat > /etc/systemd/system/aond-luan.service <<UNIT
[Unit]
Description=AOND ban anh Luan (thu nghiem, 127.0.0.1:8001) - khong phai san pham
After=network.target

[Service]
User=$SVC_USER
WorkingDirectory=$D
Environment=PYTHONPATH=$D/src:$D/deps
EnvironmentFile=$D/.env
ExecStart=$PY -m uvicorn aioi.server:app --host 127.0.0.1 --port 8001
Restart=no

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl start aond-luan
for i in $(seq 1 30); do
  if H=$(curl -fsS -m 3 http://127.0.0.1:8001/health 2>/dev/null); then echo "aond-luan /health: $H"; exit 0; fi
  sleep 1
done
echo "aond-luan không trả /health sau 30 giây — nhật ký:"; journalctl -u aond-luan -n 30 --no-pager -o cat | grep -viE 'key|token|secret|password|bearer'
exit 1
REMOTE

# ───────────────────────── 2. Hai hàm chat, cùng giao diện ─────────────────────────
TRA=""; BAN=""
chat_luan() {   # $1 id  $2 text → BAN = lời đáp (một chuỗi), TRA = JSON
  TRA=$(jq -n --arg u "$1" --arg t "$2" '{user_key:$u, text:$t}' \
        | vps "curl -sS -m 150 -X POST http://127.0.0.1:8001/message -H 'Content-Type: application/json' -d @-") || TRA="{}"
  BAN=$(jq -r '.reply // empty' <<<"$TRA" 2>/dev/null || true)
}
chat_minh() {   # lõi của mình: nhiều bong bóng → nối bằng dòng trống
  TRA=$(jq -n --arg u "$1" --arg t "$2" '{external_user_id:$u, text:$t, sender_name:"Khách thử"}' \
        | vps "curl -sS -m 150 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-") || TRA="{}"
  BAN=$(jq -r '[.replies[]?] | join("\n\n")' <<<"$TRA" 2>/dev/null || true)
}

KET=""; TONG_LOI=0
chay() {   # $1 bản (luan|minh)  $2 tên kịch bản  $3 id  $4 lượt-giá (0 = không soát)  rest = các tin khách
  local ban="$1" ten="$2" id="$3" lg="$4"; shift 4
  local n=0 nhap="" hoi_tong=0 wow=0 hoi_gia=0 co_loi=0 text
  echo; echo "──────── [$ban] $ten (ID $id) ────────"
  for text in "$@"; do
    n=$((n + 1))
    echo; echo ">> $text"
    if [ "$ban" = luan ]; then chat_luan "$id" "$text"; else chat_minh "$id" "$text"; fi
    if [ -z "$BAN" ]; then echo "<< (KHÔNG có lời đáp) $(head -c 300 <<<"$TRA")"; co_loi=1; continue; fi
    sed 's/^/<< /' <<<"$BAN"
    local hoi tu
    hoi=$(grep -o '?' <<<"$BAN" | wc -l || true); tu=$(wc -w <<<"$BAN")
    hoi_tong=$((hoi_tong + hoi))
    echo "   [lượt $n: $tu từ, $hoi dấu hỏi]"
    if [ "$ban" = luan ]; then echo "   [next_field=$(jq -r '.next_field // "-"' <<<"$TRA" 2>/dev/null) · hoàn chỉnh=$(jq -r '.completeness // "-"' <<<"$TRA" 2>/dev/null)]"; fi
    [ -z "$nhap" ] && grep -q '📋' <<<"$BAN" && nhap=$n
    grep -qiE '(^|[^a-zà-ỹ])(wow|tuyệt vời)' <<<"$BAN" && wow=$((wow + 1))
    # Hỏi LẠI giá: sau lượt khách đã nói giá (lg), lời bot có câu hỏi về giá / mức bao nhiêu (người đọc chấm — chỉ cờ).
    if [ "$lg" -gt 0 ] && [ "$n" -gt "$lg" ] && grep -qiE '(giá|mức giá|bán.*bao nhiêu|bao nhiêu.*(tỷ|tiền))[^.!]*\?' <<<"$BAN"; then
      hoi_gia=$((hoi_gia + 1)); echo "   ⚑ lời bot có câu hỏi về GIÁ sau khi khách đã nói giá (lượt $lg)"
    fi
    sleep 1
  done
  [ "$co_loi" = 1 ] && TONG_LOI=$((TONG_LOI + 1))
  KET+=$(printf '\n%-5s %-14s lượt tới 📋: %-6s tổng dấu hỏi: %-3s wow/tuyệt vời: %-2s hỏi lại giá: %-2s' "$ban" "$ten" "${nhap:-chưa}" "$hoi_tong" "$wow" "$hoi_gia")
}

HHT=("Anh cần bán nhà mặt tiền đường Hoàng Hoa Thám, Bình Thạnh" "Phường Gia Định" "ngang 5,2m dài 8m" "3 tầng kiên cố"
     "sổ hồng hoàn công rồi" "giá 12,5 tỷ thương lượng nhẹ" "à hiện có HĐT 35 triệu nhé")
BH=("Anh bán nhà mặt tiền đường số trong khu dân cư Bình Hưng, kế bến xe quận 8" "150m2 em" "Giá: 9,25 tỷ. Thương lượng. em"
    "xã Bình Hưng, huyện Bình Chánh" "nhà anh đang ở")

echo; echo "== 2. kịch bản HHT (nhà phố + HĐT) và BH (ca Bình Hưng: đã nói giá rồi, trả lời hiện trạng) — bản anh Luận"
chay luan HHT "thu-lc-l-$RUN-hht" 6 "${HHT[@]}"
chay luan BH  "thu-lc-l-$RUN-bh"  3 "${BH[@]}"
echo; echo "== 3. cùng hai kịch bản — lõi của mình (cổng 8000)"
chay minh HHT "$ID_MINH_HHT" 6 "${HHT[@]}"
chay minh BH  "$ID_MINH_BH"  3 "${BH[@]}"

echo; echo "== SO CẠNH (chỉ số đếm được; chất lượng lời văn do người đọc chấm ở trên)"
printf '%s\n' "$KET"
echo; echo "Ghi chú: 'hỏi lại giá' là CỜ dò chữ, người đọc xác nhận ở các dòng ⚑. Bản anh Luận dùng model theo .env lõi mình mượn (tên model in ở bước 1)."
if [ "$TONG_LOI" -gt 0 ]; then echo "::error::có $TONG_LOI kịch bản không nhận được lời đáp (hạ tầng)"; exit 1; fi
