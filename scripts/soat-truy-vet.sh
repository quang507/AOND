#!/usr/bin/env bash
# Soát truy vết bộ docs/ — bản chạy máy của agent `soat-truy-vet` và workflow
# Cline `/soat-truy-vet.md`. Chạy tay trước commit đụng docs/, và tự động trong
# CI (`.github/workflows/kiem.yml`, job `truyvet`).
#
# Trả 0 khi sạch, 1 khi có lỗi CHẶN. Mọi lỗi đều in ra kèm cách sửa.
#
# Không dùng `set -e`: script phải chạy HẾT mọi phép kiểm rồi mới kết luận —
# dừng ở lỗi đầu tiên thì mỗi lần chạy chỉ lộ một lỗi, phải sửa mười vòng.
set -uo pipefail
cd "$(dirname "$0")/.."

LOI=0
canh() { printf '\n\033[31m✗ %s\033[0m\n' "$1"; LOI=1; }
xanh() { printf '\033[32m✓\033[0m %s\n' "$1"; }

# ── 1. ID được tham chiếu nhưng không được định nghĩa ───────────────────────
# `\b` bắt buộc: mẫu 'FR-[0-9]+' không có ranh giới sẽ ăn đuôi của NFR-18 thành
# FR-18 — vừa đếm dư, vừa CHE mất một FR gãy nếu số của nó trùng đuôi một NFR.
kiem_id() {
  local ten="$1" dinh_nghia="$2" tham_chieu="$3" sua="$4"
  local gay
  gay=$(comm -13 <(eval "$dinh_nghia" | sort -u) <(eval "$tham_chieu" | sort -u))
  if [[ -n "$gay" ]]; then
    canh "$ten gãy — được nhắc nhưng không có định nghĩa:"
    printf '   %s\n' $gay
    printf '   → %s\n' "$sua"
  else
    xanh "$ten: không có ID gãy"
  fi
}

kiem_id "FR (trong docs)" \
  "grep -ohE '\bFR-[0-9]+' docs/02-requirements.md" \
  "grep -ohE '\bFR-[0-9]+' docs/0[3-9]*.md docs/1[0-9]*.md" \
  "thêm định nghĩa vào docs/02, hoặc sửa tham chiếu. Đừng xoá lặng lẽ."

# Bình luận trong mã nguồn cũng trích FR — một FR bị đổi số mà quên sửa code là
# truy vết gãy thật, chỉ có điều nó nằm ngoài docs/ nên vòng quét cũ không thấy.
# Trừ chính file này ra: comment của nó nêu FR-18 làm ví dụ về bẫy `\b`.
kiem_id "FR (trong mã nguồn)" \
  "grep -ohE '\bFR-[0-9]+' docs/02-requirements.md" \
  "grep -rohE --exclude=soat-truy-vet.sh '\bFR-[0-9]+' app/ bot/ lib/ components/ scripts/ 2>/dev/null" \
  "thêm định nghĩa vào docs/02, hoặc sửa bình luận trong code."

kiem_id "UF" \
  "grep -o '^## UF-[0-9]\+' docs/03-user-flows.md | sed 's/^## //'" \
  "grep -oh 'UF-[0-9]\+' docs/02*.md docs/0[4-9]*.md docs/1[0-9]*.md" \
  "thêm mục '## UF-xx' vào docs/03."

kiem_id "WF" \
  "grep -o '^## WF-[0-9]\+' docs/05-wireframes.md | sed 's/^## //'" \
  "grep -oh 'WF-[0-9]\+' docs/0[1-4]*.md docs/0[6-9]*.md docs/1[0-9]*.md" \
  "thêm mục '## WF-xx' vào docs/05."

# Từ 07/09/2026 mục đã chốt/đã đóng chỉ còn MỘT hàng trong bảng (thân mục xoá), nên
# định nghĩa của một OPEN là hàng '| OPEN-xx |' trong docs/09 — mục còn chờ có thêm
# '### OPEN-xx' ở dưới, mục đã đóng thì không.
kiem_id "OPEN" \
  "grep -o '^| OPEN-[0-9]\+' docs/09-open-issues.md | sed 's/^| //'" \
  "grep -oh 'OPEN-[0-9]\+' docs/*.md CLAUDE.md" \
  "thêm hàng '| OPEN-xx |' vào bảng trong docs/09."

# ── 2. FR mới phải có dòng trong ma trận truy vết ───────────────────────────
# Luật CLAUDE.md §4: sửa tầng trên thì cập nhật docs/08 CÙNG COMMIT. Thiếu là
# CHẶN — FR không truy vết được là FR không ai kiểm thử được.
#
# docs/08 viết dải `FR-20…FR-32` cho một nhóm liền số, nên phải nở dải ra trước
# khi so; không nở thì 19 FR nằm giữa các dải bị báo thiếu oan.
fr_trong_08() {
  grep -ohE 'FR-[0-9]+…FR-[0-9]+|\bFR-[0-9]+' docs/08-traceability.md |
    awk -F'…' '
      NF == 2 {
        sub(/FR-/, "", $1); sub(/FR-/, "", $2)
        for (i = $1 + 0; i <= $2 + 0; i++) printf "FR-%02d\n", i
        next
      }
      { print }'
}
thieu_truy_vet=$(comm -23 \
  <(grep -ohE '\bFR-[0-9]+' docs/02-requirements.md | sort -u) \
  <(fr_trong_08 | sort -u))
if [[ -n "$thieu_truy_vet" ]]; then
  canh "FR có trong docs/02 nhưng KHÔNG có trong ma trận docs/08:"
  printf '   %s\n' $thieu_truy_vet
  printf '   → thêm dòng vào docs/08 §8.3 (BR → FR → UF → WF → SRS → AC).\n'
else
  xanh "Truy vết: mọi FR đều có dòng trong docs/08"
fi

# ── 3. Số đếm trong README phải khớp thực tế ────────────────────────────────
dem() { echo "$1"; }
n_fr=$(grep -ohE '\bFR-[0-9]+' docs/02-requirements.md | sort -u | wc -l)
n_nfr=$(grep -ohE '\bNFR-[0-9]+' docs/02-requirements.md | sort -u | wc -l)
n_br=$(grep -ohE '\bBR-[0-9]+' docs/02-requirements.md | sort -u | wc -l)
n_uf=$(grep -c '^## UF-' docs/03-user-flows.md)
n_wf=$(grep -c '^## WF-' docs/05-wireframes.md)
n_open=$(grep -c '^| OPEN-' docs/09-open-issues.md)
n_ins=$(grep -c '^### INS-' docs/01-research.md)

kiem_dem() {
  local nhan="$1" thuc="$2" file="$3" mau="$4"
  if grep -qE "$mau" "$file"; then
    xanh "$nhan = $thuc, khớp $file"
  else
    canh "$nhan thực tế là $thuc nhưng $file ghi số khác."
    grep -nE "$(echo "$mau" | sed 's/[0-9]\+/[0-9]+/g')" "$file" | head -3 | sed 's/^/   /'
    printf '   → sửa số trong %s.\n' "$file"
  fi
}

# Không đóng mẫu bằng `\b` sau chữ tiếng Việt: với grep -E trong locale C, `đ`
# và `ề` không phải ký tự từ, nên `\b` sau chúng không khớp và mọi dòng đều báo
# lệch. Ranh giới trái là đủ để "45" không ăn nhầm "145".
kiem_dem "BR"   "$n_br"   README.md      "\\b$n_br BR\\b"
kiem_dem "FR"   "$n_fr"   README.md      "\\b$n_fr FR\\b"
kiem_dem "NFR"  "$n_nfr"  README.md      "\\b$n_nfr NFR\\b"
kiem_dem "UF"   "$n_uf"   README.md      "\\b$n_uf luồng"
kiem_dem "WF"   "$n_wf"   README.md      "\\b$n_wf màn hình"
kiem_dem "OPEN" "$n_open" README.md      "\\b$n_open vấn đề"
kiem_dem "OPEN" "$n_open" docs/README.md "\\b$n_open vấn đề"

# ── 4. PII: số điện thoại thật lọt vào docs/ ────────────────────────────────
# Ẩn danh theo CLAUDE.md §5 là `0903xxxxxx` — tức 4 số đầu rồi chữ x. Mẫu dưới
# chỉ bắt dãy 10 chữ số liền, nên bản đã ẩn danh không dính.
pii=$(grep -rnE '\b0(9|3|7|8|5)[0-9]{8}\b' docs/ CLAUDE.md README.md 2>/dev/null)
if [[ -n "$pii" ]]; then
  canh "Số điện thoại thật trong tài liệu:"
  printf '%s\n' "$pii" | sed 's/^/   /'
  printf '   → ẩn danh kiểu 0903xxxxxx (CLAUDE.md §5).\n'
else
  xanh "PII: không có SĐT thật trong docs/"
fi

# ── 5. Nội dung thư mục cấm không được trích vào docs/ ──────────────────────
# Không đọc các thư mục đó — chỉ soi xem docs/ có TRỎ vào đường dẫn của chúng
# không. Bảng đối chiếu nguồn trong CLAUDE.md §3 được miễn (nó chỉ nêu tên).
cam=$(grep -rn -E '(admin logins|sổ đỏ samples|masterDB|ThemeForest)/[^ `)|]' docs/ 2>/dev/null)
if [[ -n "$cam" ]]; then
  canh "docs/ trỏ vào file trong thư mục cấm:"
  printf '%s\n' "$cam" | sed 's/^/   /'
  printf '   → bỏ đường dẫn; chỉ được nhắc tên thư mục, không trích nội dung.\n'
else
  xanh "Ranh giới bảo mật: docs/ không trích thư mục cấm"
fi

# ── 6. Khoá service_role không được nằm trong file của repo ─────────────────
# CLAUDE.md §6: khoá đó bỏ qua mọi RLS. JWT Supabase bắt đầu bằng `eyJ` và dài;
# publishable key thì được phép (nó vốn công khai). Đòi ≥30 ký tự base64 sau
# `eyJ` để chỗ hướng dẫn viết tắt `eyJhbG...` trong scripts/*.mjs không
# bị báo oan — một khoá thật dài hơn thế nhiều.
# Chỉ soi file GIT ĐANG TRACK: `scripts/.env` và `bot/bridge-zca/.env` giữ khoá
# thật THEO THIẾT KẾ và đã gitignore — quét cả working tree thì máy chủ dự án
# đỏ mãi trong khi CI xanh (07/09/2026). Và chỉ in file:dòng, KHÔNG in khoá —
# in ra là khoá nằm trong log CI / terminal, tức là lộ bằng chính bài kiểm.
khoa=$(git ls-files -z 2>/dev/null | xargs -0 grep -ln -E 'SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*["'"'"']?eyJ[A-Za-z0-9_-]{30,}' 2>/dev/null)
if [[ -n "$khoa" ]]; then
  canh "Khoá service_role bị ghi vào file GIT ĐANG TRACK:"
  printf '%s\n' "$khoa" | sed 's/^/   /'
  printf '   → xoá ngay, xoay khoá ở Supabase, đọc từ biến môi trường.\n'
else
  xanh "Bí mật: không có service_role key trong file repo"
fi

# ── 7. Web không được trỏ ảnh vào raw.githubusercontent ─────────────────────
# CLAUDE.md §6: set repo private một cái là raw trả 404, ảnh vỡ sạch.
raw=$(grep -rn 'raw.githubusercontent.com/quang507' app/ components/ lib/ public/ 2>/dev/null)
if [[ -n "$raw" ]]; then
  canh "Web trỏ tài nguyên vào raw.githubusercontent:"
  printf '%s\n' "$raw" | sed 's/^/   /'
  printf '   → để file trong public/ rồi tham chiếu đường dẫn tương đối.\n'
else
  xanh "Tài nguyên tĩnh: không phụ thuộc raw.githubusercontent"
fi

# Bỏ cùng sao lưu 11/09/2026: soát bảng migration ↔ BANG (sao-luu.mjs) và hàm migration ↔ schema.sql.

# ── schema.sql có theo kịp migration không? ─────────────────────────────────
# 11/09/2026: sao lưu đã bỏ, nên KHÔNG còn script sinh lại schema.sql — càng
# phải giữ phép soát này, vì schema.sql là bản duy nhất để dựng lại từ số không.
# (Phép soát bảng ↔ BANG của sao-luu.mjs thì bỏ cùng sao lưu.) Bắt 08/09/2026:
# `20260907h` merge mà schema.sql không có `diem_tin` — repo tụt sau DB.
# Chỉ soi tên HÀM; hàm migration sau đã `drop function` thì bỏ qua. Phép so NỘI DUNG
# (md5 từng thân hàm schema.sql ↔ DB) nằm ở soat-migration.mjs — cổng CI thứ 7 (13/09/2026).
ham_mig=$(grep -rhoiE 'create or replace function +(public\.)?[a-z_][a-z0-9_]*' \
  bot/supabase/migrations/*.sql 2>/dev/null \
  | sed -E 's/.*[[:space:]]//; s/^public\.//' | grep -vx 'public' | sort -u)
ham_bo=$(grep -rhoiE 'drop function +(if exists +)?(public\.)?[a-z_][a-z0-9_]*' \
  bot/supabase/migrations/*.sql 2>/dev/null \
  | sed -E 's/.*[[:space:]]//; s/^public\.//' | grep -vx 'public' | sort -u)
thieu_ham=""
for f in $ham_mig; do
  grep -qxF "$f" <<<"$ham_bo" && continue
  grep -qi "FUNCTION public\.$f(" bot/supabase/schema.sql || thieu_ham+="$f "
done
if [[ -n "$thieu_ham" ]]; then
  canh "Hàm có trong migration nhưng KHÔNG có trong schema.sql: $thieu_ham"
  printf '   → thêm tay định nghĩa vào bot/supabase/schema.sql: chạy trên DB pg_get_functiondef(<hàm>::regprocedure) rồi dán vào (kèm trigger nếu có).\n'
  printf '   → không còn script sinh lại schema.sql (sao lưu đã bỏ 11/09/2026).
'
else
  printf '[32m✓[0m schema.sql có đủ hàm mà migration sinh ra
'
fi

printf '\n── Số đếm hiện tại ──\n'
printf '%s BR · %s FR · %s NFR · %s UF · %s WF · %s OPEN · %s INS\n' \
  "$n_br" "$n_fr" "$n_nfr" "$n_uf" "$n_wf" "$n_open" "$n_ins"

if [[ $LOI -ne 0 ]]; then
  printf '\n\033[31mSOÁT TRUY VẾT: HỎNG\033[0m — sửa các mục ✗ ở trên rồi chạy lại.\n'
  exit 1
fi
printf '\n\033[32mSOÁT TRUY VẾT: SẠCH\033[0m\n'
