"""Kho ảnh / tài liệu trên Supabase Storage (19/10/2026, SRS-5.1zzzzzzz56) — thay SharePoint.

Chủ dự án: "ảnh lên web trước, ko dùng sharepoint nữa. lưu ảnh ở supabase". Trước bản này VPS không cấu hình SharePoint nên
lõi Python ghi ảnh vào thư mục `sharepoint_store/` trên đĩa VPS: `listing_media` 0 dòng, web không có ảnh nào.

Luật kho (§5 CLAUDE.md, ràng buộc `listing_media` trên DB):
- Ảnh của MỘT căn (thư mục = UUID tin, `thu_muc_can`) → bucket CÔNG KHAI `listing-public/<uuid>/…`, web hiện qua
  `listing_photos_v` khi tin đang đăng.
- Mọi thứ khác → bucket RIÊNG `listing-private`: sổ đỏ / giấy tờ (`rieng=True`), PDF / tài liệu, tệp cấp dự án. Không có link công
  khai (`web_url` rỗng) — chỉ admin ký link xem.
Dòng `listing_media` do `SupabaseConversationStore.save` ghi SAU khi tin đã có trên DB (khoá ngoại), đọc từ `Listing.media`.
"""
from __future__ import annotations

import io
import logging
import re
import unicodedata
import urllib.parse
import urllib.request
import uuid
from typing import Callable

from .kho_tep import MediaRef, MediaStore, KhoTepError

BUCKET_CONG_KHAI = "listing-public"
BUCKET_RIENG = "listing-private"
CANH_BAN_NHO = 480   # OPEN-38 (chủ dự án 28/10/2026): bản nhỏ cho lưới thẻ — biến đổi ảnh của Supabase là tính năng Pro

log = logging.getLogger("aioi.kho_anh")


def ban_nho_480(data: bytes) -> bytes | None:
    """JPEG cạnh dài ≤ `CANH_BAN_NHO` px của ảnh, hoặc None khi không đọc được ảnh (tệp hỏng, định dạng Pillow không mở được)."""
    try:
        from PIL import Image, ImageOps
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im)
            im.thumbnail((CANH_BAN_NHO, CANH_BAN_NHO))
            ra = io.BytesIO()
            im.convert("RGB").save(ra, "JPEG", quality=80, optimize=True)
            return ra.getvalue()
    except Exception:  # noqa: BLE001 — bản nhỏ là phần thêm: không sinh được thì web dùng ảnh gốc
        return None


def _khoa_an_toan(s: str) -> str:
    """Khoá Storage chỉ nhận ký tự an toàn URL: bỏ dấu, giữ a-z 0-9 . _ - /, gom phần còn lại thành '-'."""
    s = s.replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Za-z0-9._/-]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-/")
    return re.sub(r"/{2,}", "/", s).replace("..", ".")


def la_uuid(s: str) -> bool:
    try:
        uuid.UUID(s)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


class SupabaseMediaStore(MediaStore):
    """`gui(method, url, data, headers)` để test thay lời gọi mạng."""

    def __init__(self, supabase_url: str, service_key: str,
                 gui: Callable[[str, str, bytes | None, dict[str, str]], None] | None = None):
        self._goc = supabase_url.rstrip("/")
        self._key = service_key
        self._gui = gui or self._gui_that

    def _gui_that(self, method: str, url: str, data: bytes | None, headers: dict[str, str]) -> None:
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                r.read()
        except Exception as e:  # noqa: BLE001 — engine bắt KhoTepError: tải hỏng thì bỏ tệp đó, lượt chat vẫn chạy
            raise KhoTepError(f"supabase storage {method}: {type(e).__name__}") from e

    @staticmethod
    def thu_muc_can(listing_id: str) -> str:
        """Thư mục ảnh của một căn = UUID tin (DB tạo tin với đúng id này — ràng buộc listing_media_duong_dan_theo_uuid)."""
        return str(uuid.UUID(listing_id))

    def upload(self, folder: str, filename: str, data: bytes, content_type: str, rieng: bool = False) -> MediaRef:
        cong_khai = (not rieng) and content_type.startswith("image/") and la_uuid(folder.split("/", 1)[0])
        bucket = BUCKET_CONG_KHAI if cong_khai else BUCKET_RIENG
        khoa = _khoa_an_toan(f"{folder}/{filename}")
        url = f"{self._goc}/storage/v1/object/{bucket}/{urllib.parse.quote(khoa)}"
        self._gui("POST", url, data, {
            "apikey": self._key, "Authorization": f"Bearer {self._key}",
            "Content-Type": content_type or "application/octet-stream", "x-upsert": "true",
        })
        web = f"{self._goc}/storage/v1/object/public/{bucket}/{urllib.parse.quote(khoa)}" if cong_khai else ""
        return MediaRef(item_id=f"{bucket}/{khoa}", web_url=web, path=f"{bucket}/{khoa}",
                        filename=filename, content_type=content_type, ban_nho=self._tai_ban_nho(khoa, data) if cong_khai else "")

    def _tai_ban_nho(self, khoa: str, data: bytes) -> str:
        """Tải bản nhỏ 480px cạnh ảnh gốc: `<uuid>/480/<tên>.jpg` (OPEN-38). Hỏng thì "" — ảnh gốc vẫn dùng được."""
        nho = ban_nho_480(data)
        if nho is None:
            return ""
        thu_muc, _, ten = khoa.rpartition("/")
        khoa_nho = f"{thu_muc}/480/{ten.rsplit('.', 1)[0]}.jpg"
        try:
            self._gui("POST", f"{self._goc}/storage/v1/object/{BUCKET_CONG_KHAI}/{urllib.parse.quote(khoa_nho)}", nho, {
                "apikey": self._key, "Authorization": f"Bearer {self._key}", "Content-Type": "image/jpeg", "x-upsert": "true"})
        except KhoTepError as e:
            log.warning("tải bản nhỏ 480 lỗi: %s", e)
            return ""
        return f"{BUCKET_CONG_KHAI}/{khoa_nho}"

    def delete(self, item_id: str) -> None:
        bucket, _, khoa = item_id.partition("/")
        if bucket not in (BUCKET_CONG_KHAI, BUCKET_RIENG) or not khoa:
            return
        self._gui("DELETE", f"{self._goc}/storage/v1/object/{bucket}/{urllib.parse.quote(khoa)}", None,
                  {"apikey": self._key, "Authorization": f"Bearer {self._key}"})
