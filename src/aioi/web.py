"""Địa chỉ web khách xem tin — MỘT nguồn cho mọi lời bot (SRS-5.1zzzzzzz220).

Bot từng gửi `aioinhadat.com` (prompt, câu mẫu `hoi_phi`, câu "tin đã hiển thị trên …") trong khi tên miền đó trả lỗi / trang đỗ — chủ nhà bấm
vào không thấy tin (chat 27/10: "sao không thấy trên tin ko thấy trên biểu đồ" dù tin đang bán trên `aioinhadat.vercel.app` và có trên bản đồ).
Phía mua đã dùng `AIOI_SITE_URL` từ SRS-5.1zzzzzzz145; nay phía bán dùng chung. Khi `aioinhadat.com` trỏ về web thì đặt biến môi trường
`AIOI_SITE_URL` trên VPS, không sửa chữ ở chỗ khác. Mặc định cùng `lib/format.ts` SITE_URL."""
from __future__ import annotations

import os
from urllib.parse import urlparse

SITE_URL = os.environ.get("AIOI_SITE_URL", "https://aioinhadat.vercel.app").rstrip("/")
SITE_HOST = urlparse(SITE_URL).netloc or SITE_URL


def link_tin(ma: str | None) -> str:
    """Link trang chi tiết một tin theo mã (8 ký tự đầu UUID, viết hoa); không có mã → trang chủ."""
    return f"{SITE_URL}/nha-dat/{ma}" if ma else SITE_URL
