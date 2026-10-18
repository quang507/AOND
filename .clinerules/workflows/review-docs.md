# Workflow: Review một PR/diff đụng docs/

1. Đọc diff. Với TỪNG thay đổi, kiểm theo thứ tự:
   - Khẳng định mới có nguồn không? (`[nguồn: …]` / `[giả định BA]` / OPEN-xx)
   - Có mâu thuẫn với tầng trên không? (docs số nhỏ hơn thắng)
   - Có phá 3 bất biến sản phẩm không: phễu về Zalo (IA-P1) ·
     không thu số ĐT ngoài đặt lịch xem (NFR-07) ·
     không khẳng định điều chưa xác minh (RSK-03) · ≤3 listing/tin (FR-24)?
   - ID mới có được cấp đúng (kế tiếp, không đánh số lại)?
2. Chạy `/soat-truy-vet.md`.
3. Kiểm rò rỉ: không nội dung từ thư mục cấm, không PII.
4. Kết luận: liệt kê finding theo mức (chặn / nên sửa / gợi ý),
   mỗi finding trỏ file:dòng. Không tự sửa nếu user chỉ nhờ review.
