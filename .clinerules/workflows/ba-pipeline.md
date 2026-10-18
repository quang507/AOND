# Workflow: Thêm/sửa yêu cầu trong docs/ (giữ truy vết)

Dùng khi cần thêm FR mới, sửa luồng, cập nhật SRS.

1. Hỏi user yêu cầu đến từ đâu. Phân loại:
   - Từ tài liệu gốc → trích nguồn `[nguồn: file §mục]`.
   - Insight mới → thêm `INS-xx` vào `docs/01-research.md` TRƯỚC.
   - Ý muốn tự phát chưa rõ → tạo `OPEN-xx` trong `docs/09-open-issues.md`
     (nêu ≥2 phương án + khuyến nghị), DỪNG chờ user chốt.
2. Đọc `docs/02-requirements.md`, tìm ID `FR-` lớn nhất, cấp ID kế tiếp.
   Thêm dòng vào đúng nhóm (A WEB / B BOT / C ASK / D VIEW / E RET / F ADM / G SEL)
   với ưu tiên M/S/C và nguồn.
3. Đi hết chuỗi — bỏ mắt xích nào là tài liệu vỡ:
   - `docs/03-user-flows.md`: FR chạm luồng nào? Cập nhật hoặc thêm UF.
   - `docs/05-wireframes.md`: có màn hình nào đổi không?
   - `docs/07-srs.md`: data model / API / job nào phải đổi? Có cần AC mới?
   - Nếu chạm URL/trang → `docs/04`. Nếu chạm component/copy → `docs/06`.
4. Thêm dòng vào `docs/08-traceability.md` §8.3 (và §8.2 nếu có INS mới).
5. Chạy workflow `/soat-truy-vet.md`. Sửa cho sạch rồi mới commit.
6. Commit message tiếng Việt, mô tả cái gì + vì sao, một commit trọn vẹn chuỗi.
