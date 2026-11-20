-- 20/11/2026 (SRS-5.1zzzzzzz531, chủ dự án: "zalo bán xóa rồi mà xóa sạch đi ko cần tạo qr nữa"): số Zalo tư vấn đã thoát có chủ đích 18/11
-- (trả lại chủ dự án). Trang /admin vẫn hiện thẻ "Zalo tư vấn — Phiên hết hạn — Bridge đang khởi động lại để sinh mã QR mới". Gỡ dòng
-- bridge_dang_nhap id 2 (trang admin chỉ còn đọc id 1; bot_health_tick đã thôi canh số này ở 20261119a). Đã áp lên DB ngày 20/11.
delete from public.bridge_dang_nhap where id = 2;
