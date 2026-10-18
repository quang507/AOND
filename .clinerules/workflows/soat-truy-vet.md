# Workflow: Soát truy vết docs/

Chạy trước MỌI commit đụng vào docs/.

1. Chạy lần lượt và báo kết quả:
```bash
# ID được tham chiếu nhưng không tồn tại (kết quả phải RỖNG)
# \b bắt buộc: mẫu cũ 'FR-[0-9]+' ăn luôn đuôi của NFR-18 thành FR-18, nên vừa
# đếm dư vừa CHE mất một FR gãy nếu số của nó trùng đuôi một NFR đang có.
#
# 01/09/2026 — nới vùng quét. Mẫu cũ dừng ở docs/08 nên docs/09 (open issues) và
# docs/10 (kế hoạch kiểm thử) NẰM NGOÀI TẦM MẮT: một FR gãy chỉ xuất hiện ở
# docs/10 thì lệnh này vẫn báo sạch. Bắt được đúng lúc thêm TS-TIEN cho FR-169.
comm -13 <(grep -oE '\bFR-[0-9]+' docs/02-requirements.md | sort -u) \
         <(grep -ohE '\bFR-[0-9]+' docs/0[3-9]*.md docs/1[0-9]*.md | sort -u)
comm -13 <(grep -o '^## UF-[0-9]\+' docs/03-user-flows.md | sed 's/^## //' | sort -u) \
         <(grep -oh 'UF-[0-9]\+' docs/02*.md docs/0[4-9]*.md docs/1[0-9]*.md | sort -u)
comm -13 <(grep -o '^## WF-[0-9]\+' docs/05-wireframes.md | sed 's/^## //' | sort -u) \
         <(grep -oh 'WF-[0-9]\+' docs/0[1-4]*.md docs/0[6-9]*.md docs/1[0-9]*.md | sort -u)
# FR nhắc trong MÃ NGUỒN nhưng không có định nghĩa (bình luận code trích FR luôn)
comm -13 <(grep -oE '\bFR-[0-9]+' docs/02-requirements.md | sort -u) \
         <(grep -rohE '\bFR-[0-9]+' app/ bot/ lib/ components/ scripts/ 2>/dev/null | sort -u)
comm -13 <(grep -o '^### OPEN-[0-9]\+' docs/09-open-issues.md | sed 's/^### //' | sort -u) \
         <(grep -oh 'OPEN-[0-9]\+' docs/*.md CLAUDE.md | sort -u)
# Số đếm để đối chiếu README
echo "FR: $(grep -oE '\bFR-[0-9]+' docs/02-requirements.md | sort -u | wc -l)"
echo "INS: $(grep -c '^### INS-' docs/01-research.md)"
```
2. Nếu có ID gãy: sửa docs (thêm định nghĩa hoặc sửa tham chiếu), KHÔNG xoá lặng lẽ.
3. Đối chiếu số đếm với bảng trong `README.md` — lệch thì cập nhật README.
4. Kiểm tra nhanh: không có số điện thoại thật / Zalo ID thật trong diff
   (`git diff --cached | grep -E '09[0-9]{8}'` phải rỗng).
5. Báo tổng kết: sạch / đã sửa gì.
