# Workflow: Thêm/sửa yêu cầu trong docs/ (giữ truy vết)

Dùng khi cần thêm FR mới, sửa luồng, cập nhật SRS.

0. **Sửa lỗi / cải tiến bot và web KHÔNG cần cấp FR** (CLAUDE.md §4 mục 7): ghi MỘT mục SRS ngắn ở `docs/07` (ca gốc · lớp
   lỗi · sửa · kiểm, ~5 dòng; sửa lỗi thì trả lời ba câu của §4 mục 8), cùng commit với code + test; `docs/07` chỉ giữ 10
   mục mới nhất — thêm mục mới thì chuyển mục cũ nhất sang `docs/07-srs-luu-tru.md`. Bỏ qua bước 2–4. Các bước dưới chỉ áp
   khi thật sự đổi FR / BR / UF / WF.
1. Yêu cầu đến từ đâu? Phân loại:
   - Từ tài liệu gốc → trích nguồn `[nguồn: file §mục]`.
   - Insight mới → thêm `INS-xx` vào `docs/01-research.md` TRƯỚC.
   - Việc trong tầm (kỹ thuật / UX / câu chữ / ngưỡng) → soát code + docs, tự chọn phương án tốt nhất, làm, ghi mục SRS
     "Quyết định (BA, uỷ quyền)" (CLAUDE.md §4 mục 2). Không dừng chờ.
   - Chỉ hỏi chủ dự án — một câu, rồi dừng — khi đụng tiền / phí, pháp lý, thương hiệu, dữ liệu khách thật, hoặc đảo một
     quyết định đã chốt trong docs. Mâu thuẫn tài liệu không tự giải được → `OPEN-xx` trong `docs/09-open-issues.md`
     (≥2 phương án + khuyến nghị).
2. Đọc `docs/02-requirements.md`, tìm ID `FR-` lớn nhất, cấp ID kế tiếp.
   Thêm dòng vào đúng nhóm (A WEB / B BOT / C ASK / D VIEW / E RET / F ADM / G SEL)
   với ưu tiên M/S/C và nguồn.
3. Đi hết chuỗi — bỏ mắt xích nào là tài liệu vỡ:
   - `docs/03-user-flows.md`: FR chạm luồng nào? Cập nhật hoặc thêm UF.
   - `docs/05-wireframes.md`: có màn hình nào đổi không?
   - `docs/07-srs.md`: data model / API / job nào phải đổi? Có cần AC mới?
   - Nếu chạm URL/trang → `docs/04`. Nếu chạm component/copy → `docs/06`.
4. Thêm dòng vào `docs/08-traceability.md` §8.3 (và §8.2 nếu có INS mới), cùng commit.
5. Trước khi push: chạy workflow `/soat-truy-vet.md` (`bun run truyvet`), sửa cho sạch.
6. Commit message tiếng Việt, mô tả cái gì + vì sao, một commit trọn vẹn chuỗi — commit THẲNG `main` rồi push, không mở PR
   (CLAUDE.md §7).
