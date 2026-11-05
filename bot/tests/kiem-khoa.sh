#!/usr/bin/env bash
# kiem-khoa.sh — CHỈ ĐỌC: kiểm khoá Gemini / Groq (Whisper) còn dùng được không, từ chính VPS (khoá nằm trong /opt/aond_core/.env, không
# in ra, chỉ in mã HTTP), và đếm trong nhật ký lõi 7 ngày các lượt sticker đọc hỏng / tin thoại hỏng / rơi dự phòng (chỉ đếm, không lời khách).
# Chủ dự án 05/11/2026: "mấy cái key gemini groq đọc âm thanh chuyển qua còn dùng tốt ko". Chạy: apply-migration.yml ô dung_lai = kiem-khoa.
set -euo pipefail
q() { curl -sS -f -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(jq -n --arg q "$1" '{query:$q}')"; }
J=$(q "select json_object_agg(name, decrypted_secret) as s from vault.decrypted_secrets where name in ('VPS_HOST','VPS_ROOT_PASSWORD')")
HOST=$(jq -r '.[0].s.VPS_HOST // empty' <<<"$J"); PW=$(jq -r '.[0].s.VPS_ROOT_PASSWORD // empty' <<<"$J"); unset J
for v in "$HOST" "$PW"; do [ -n "$v" ] && echo "::add-mask::$v"; done
if [ -z "$HOST" ] || [ -z "$PW" ]; then echo "::error::Thiếu VPS_HOST / VPS_ROOT_PASSWORD trong Vault"; exit 1; fi
command -v sshpass >/dev/null || sudo apt-get install -y -qq sshpass >/dev/null
export SSHPASS="$PW"; unset PW
vps() { sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o LogLevel=ERROR "root@$HOST" "$@"; }

echo "== /health lõi"; vps "curl -sS -m 5 http://127.0.0.1:8000/health" || echo "(không gọi được)"; echo

vps 'bash -s' <<'VPS'
set -u
ENV=/opt/aond_core/.env
lay() { grep -E "^$1=" "$ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'"; }
GEM="$(lay GEMINI_API_KEY),$(lay GEMINI_API_KEYS)"; GROQ="$(lay GROQ_API_KEY)"; WM="$(lay GROQ_WHISPER_MODEL)"; WM="${WM:-whisper-large-v3-turbo}"
echo "== Gemini (mỗi khoá một dòng, chỉ mã HTTP: 200 = dùng được, 400/403 = khoá sai, 429 = hết hạn mức)"
i=0; IFS=',' read -ra KS <<<"$GEM"
for k in "${KS[@]}"; do k="$(echo "$k" | xargs)"; [ -z "$k" ] && continue; i=$((i+1))
  c=$(curl -sS -o /dev/null -w '%{http_code}' -m 15 -H "x-goog-api-key: $k" "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1" || echo "lỗi mạng")
  echo "  Gemini khoá #$i (${#k} ký tự): HTTP $c"
done
[ "$i" = 0 ] && echo "  (không có khoá Gemini trong .env)"
echo "== Groq"
if [ -z "$GROQ" ]; then echo "  (không có GROQ_API_KEY trong .env → tin thoại KHÔNG đọc được)"; else
  c=$(curl -sS -o /dev/null -w '%{http_code}' -m 15 -H "Authorization: Bearer $GROQ" https://api.groq.com/openai/v1/models || echo "lỗi mạng")
  echo "  Groq khoá (${#GROQ} ký tự) danh sách model: HTTP $c"
  python3 - <<'PY'
import wave, struct
with wave.open('/tmp/kiem-1s.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(struct.pack('<'+'h'*16000, *([0]*16000)))
PY
  r=$(curl -sS -m 40 -w '\n%{http_code}' -H "Authorization: Bearer $GROQ" -F "file=@/tmp/kiem-1s.wav" -F "model=$WM" -F "language=vi" https://api.groq.com/openai/v1/audio/transcriptions || echo -e "\nlỗi mạng")
  code=$(tail -n1 <<<"$r"); body=$(head -n -1 <<<"$r" | tr -d '\n' | cut -c1-120)
  echo "  Whisper ($WM) chuyển 1 giây im lặng: HTTP $code — trả về: ${body:-(rỗng)}"
  rm -f /tmp/kiem-1s.wav
fi
echo "== nhật ký lõi 7 ngày (chỉ đếm dòng)"
for p in "sticker: đọc hỏng" "sticker: không tải được" "Voice note transcription failed" "Lượt chỉ thả cảm xúc" "dự phòng" "Claude hỏng"; do
  n=$(journalctl -u aond-core --since '7 days ago' --no-pager 2>/dev/null | grep -c "$p" || true); echo "  $p: $n"
done
VPS
