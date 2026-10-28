#!/usr/bin/env bash
# ban-thu-5-khach.sh — 5 khách giả, 5 tính cách, chat với lõi Python production bằng ID thử `thu-5k-` (SRS-5.1zzzzzzz212, chủ dự án 26/10/2026:
# "soi lại cách bot hỏi khách theo mấy lỗi đó … mocking thành 5 người vào nhắn tin với bot tính cách khác nhau"). "Mấy lỗi đó" = bài UX
# Qualitative Interview: (1) câu hỏi Có/Không, (2) câu hỏi dẫn dắt (kèm tính từ cảm xúc / "đúng không"), (3) đặt vấn đề quá sớm.
# Lời khách viết sẵn (không phải AI đóng vai) — rẻ và lặp lại được, nhưng khách không đổi lời theo câu bot hỏi. In từng bong bóng bot, gắn
# nhãn từng câu hỏi ([CÓ/KHÔNG] [DẪN DẮT] [MỞ]) để người đọc chấm; KHÔNG có phép đạt / trượt — nhãn là máy đoán theo chữ, người chấm mới là kết luận.
# Chạy trong apply-migration.yml ô `dung_lai` = ban-thu-5-khach. Cần: TOKEN (Management API), PROJECT_REF. Tiền thật: ~37 lượt chat × vài lượt AI.
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
OUT=$(mktemp -d)
IDS=()
don() {
  echo "== dọn dữ liệu thử"
  for id in "${IDS[@]}"; do
    [ "${GIU_DU_LIEU:-}" = giu ] || vps "curl -sS -X POST http://127.0.0.1:8000/reset/$id >/dev/null" || true
    [ "${GIU_DU_LIEU:-}" = giu ] || q "select reset_nguoi_test('$id') as kq" | jq -c '.[0]' || true
  done
}
trap don EXIT

# Gắn nhãn từng câu hỏi trong lời bot (đọc stdin). Máy đoán theo chữ — chỉ để người chấm nhìn nhanh.
NHAN=$(cat <<'PY'
import re, sys
loi = sys.stdin.read()
cau = [c.strip() for c in re.findall(r"[^.!?\n]*\?", loi) if c.strip()]
for c in cau:
    t = c.lower()
    nhan = []
    if re.search(r"(không|chưa|hông|hok|ko|đúng không|phải không|được không)\s*(ạ|nhỉ|nha|nhé|vậy ạ|vậy|ha)?\s*\?$", t):
        nhan.append("CÓ/KHÔNG")
    if re.search(r"hấp dẫn|tuyệt|đẹp|ưng|thích|phiền|đúng không|phải không|chắc là|chắc hẳn|có phải", t):
        nhan.append("DẪN DẮT")
    if re.search(r"\b(hay|hoặc)\b", t) and "CÓ/KHÔNG" not in nhan:
        nhan.append("CHỌN")
    if not nhan:
        nhan.append("MỞ")
    print(f"      ? [{' '.join(nhan)}] {c}")
print(f"SO_CAU={len(cau)}")
PY
)

# chat <file kết quả> <id> <so_nhan> <lời khách>
chat() {
  local f="$1" uid="$2" so="$3" text="$4" tra bat dau
  dau=$(date +%s)
  tra=$(jq -n --arg u "$uid" --arg t "$text" --arg s "$so" '{external_user_id:$u, text:$t, sender_name:"Khách thử"} + (if $s == "" then {} else {so_nhan:$s} end)' \
        | vps "curl -sS -m 120 -X POST http://127.0.0.1:8000/chat-reply -H 'Content-Type: application/json' -d @-" || echo '{}')
  bat=$(jq -r '.replies[]?' <<<"$tra" 2>/dev/null || true)
  {
    echo; echo "  KHÁCH: $text"
    if [ -n "$bat" ]; then jq -r '.replies[]? | "  BOT:   " + (gsub("\n"; "\n         "))' <<<"$tra"; else echo "  BOT:   (im lặng / không đọc được) ${tra:0:200}"; fi
    local nhan; nhan=$(python3 -c "$NHAN" <<<"$bat")
    grep -v '^SO_CAU=' <<<"$nhan" || true
    echo "      [$(( $(date +%s) - dau )) s · $(wc -w <<<"$bat") từ · $(grep '^SO_CAU=' <<<"$nhan" | cut -d= -f2) câu hỏi]"
  } >>"$f"
}

# khach <số thứ tự> <so_nhan> <mô tả> <lời 1> <lời 2> …
khach() {
  local n="$1" so="$2" ta="$3"; shift 3
  local uid="thu-5k-$n-$RUN" f="$OUT/$n.txt"
  echo "=== KHÁCH $n — $ta (số $([ -n "$so" ] && echo "tư vấn" || echo "ký gửi"))" >"$f"
  for cau in "$@"; do chat "$f" "$uid" "$so" "$cau"; sleep 2; done
}

IDS=("thu-5k-1-$RUN" "thu-5k-2-$RUN" "thu-5k-3-$RUN" "thu-5k-4-$RUN" "thu-5k-5-$RUN")

khach 1 "" "Cô Tư, chủ nhà lớn tuổi, gõ không dấu, trả lời cụt, hơi nghi ngờ" \
  "alo" "co can nha muon ban" "hem duong Tran Hung Dao quan 5" "sao hoi nhieu vay con" "4x16, 1 tret 2 lau" \
  "so hong rieng" "9 ty" "phi bao nhieu" "ok" &
khach 2 "" "Anh Hùng, môi giới, vội, nhắn một lèo, viết tắt" \
  "Em gửi căn MT Nguyễn Trãi P. Chợ Quán, 4.2x18, trệt 3 lầu ST, 5PN 5WC, SHR HC đủ, đang cho thuê 60tr/th, giá 28 tỷ TL. Đăng giúp em" \
  "ko có ảnh, đăng chữ trước đi" "a là MG, phí bên em tính sao" "ok đăng đi" "HĐ thuê còn 2 năm" &
khach 3 tu_van "Chị Lan, mua nhà lần đầu, lo lắng, chưa rõ nhu cầu" \
  "chào em" "chị muốn mua nhà mà chưa biết bắt đầu từ đâu" "chắc tầm 3-4 tỷ, chị cũng không rõ đủ không" \
  "Gò Vấp hoặc Phú Nhuận, gần chỗ chị làm" "mua qua bên em có bị lừa không em" "nhà hẻm cũng được, miễn an ninh" \
  "chị sợ thủ tục lắm, mua nhà cần giấy tờ gì" &
khach 4 tu_van "Anh Minh, nhà đầu tư, dứt khoát, ghét bị hỏi nhiều" \
  "Tìm nhà phố Q.10 hoặc Q.3, ngân sách 15 tỷ, mua đầu tư cho thuê" "căn nào đang có HĐ thuê thì gửi" "giá/m2 bao nhiêu" \
  "không cần hỏi nhiều, gửi 2-3 căn sát nhất" "căn đầu tiên xem được thứ 7 không" &
khach 5 tu_van "Vy, sinh viên mới đi làm, tìm thuê, teen code, hay đổi ý" \
  "hii" "e tìm thuê căn hộ 1pn á" "q7 or q4, tầm 8-10tr" "có nuôi mèo đc hok" "à mà thôi 2pn đi, ở ghép vs bạn" \
  "có ảnh hk a" "thôi để e suy nghĩ thêm" &
wait

for n in 1 2 3 4 5; do cat "$OUT/$n.txt"; echo; done
echo "=== TỔNG nhãn câu hỏi (máy đoán theo chữ — người chấm mới là kết luận)"
for n in 1 2 3 4 5; do
  f="$OUT/$n.txt"
  echo "khách $n: $(grep -c 'KHÁCH:' "$f") lượt · $(grep -c '? \[' "$f") câu hỏi · CÓ/KHÔNG $(grep -c 'CÓ/KHÔNG' "$f") · DẪN DẮT $(grep -c 'DẪN DẮT' "$f") · CHỌN $(grep -c '\[CHỌN' "$f") · MỞ $(grep -c '\[MỞ' "$f") · im lặng $(grep -c 'im lặng' "$f")"
done
