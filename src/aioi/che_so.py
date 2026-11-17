"""Che thông tin cá nhân trên ảnh sổ / giấy tờ — SRS-5.1zzzzzzz522 (chủ dự án 17/11/2026: "làm mấy cái này đi"; bản anh Luận
`docs/agents/boa-phaply.md`: "ảnh sổ luôn qua `_redact` — che số sổ, tên, số định danh, mã QR — trước khi lưu / đưa đi").

Mỗi ảnh giấy tờ (`listing_media`, bucket `listing-private`, `media_type` = giay_to, chưa xử lý) đi MỘT lần, cùng khuôn với `xoa_logo`:
1. model vision của lõi trả các khung 0–1 của thông tin CÁ NHÂN: họ tên người, số CCCD / CMND / định danh, năm sinh, địa chỉ thường trú
   của người, số phát hành / số vào sổ, mã QR / mã vạch, chữ ký. Số thửa, số tờ, diện tích, địa chỉ thửa đất, loại đất để nguyên —
   bên em cần các số đó để đối chiếu;
2. tô đen các khung (Pillow, nới vài px);
3. ảnh GỐC chép sang `listing-private/<uuid tin>/goc/<tên>` trước, chép xong mới ghi đè bản đã che lên đúng khoá cũ (admin mở giấy tờ ở
   CRM thấy bản đã che) và sinh lại bản nhỏ 480;
4. đánh dấu `variants.che_so` = khoá ảnh gốc ("" = bỏ qua: không phải giấy tờ / model không thấy vùng nào / tệp không đọc được).

Bot đã đọc số thửa / số tờ / diện tích ngay lượt chủ gửi ảnh (trước bước này). Chạy nền (`server._vong_che_so`), tắt bằng CHE_SO=tat; mọi
lỗi chỉ ghi log. Lời bot về ảnh sổ CHƯA đổi ("chỉ để em kiểm, không đăng") — độ trúng của khung trên sổ thật chưa đo."""
from __future__ import annotations

import io
import logging
import urllib.parse
from typing import Any

from .kho_anh import BUCKET_RIENG, CANH_BAN_NHO, SupabaseMediaStore, ban_nho_480
from .xoa_logo import DUOI_ANH, HONG_TOI_DA, _danh_dau, _dinh_dang, _goc, _tai, chuan_vung

log = logging.getLogger("aioi.che_so")

TOI_DA_MOT_LUOT = 10
NOI_KHUNG = 0.006   # nới khung model trả, theo cạnh ngắn ảnh — khung hay hụt mép chữ
_hong: dict[str, int] = {}

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "la_giay_to": {"type": "boolean", "description": "true khi ảnh chụp giấy tờ nhà đất hay giấy tờ tuỳ thân: sổ hồng, sổ đỏ, hợp đồng, "
                       "giấy phép, căn cước."},
        "vung": {"type": "array", "description": "Mỗi chỗ có thông tin cá nhân một khung; mảng rỗng khi không có.", "items": {
            "type": "object", "properties": {
                "x0": {"type": "number", "description": "Mép trái, 0–1 theo chiều rộng ảnh."},
                "y0": {"type": "number", "description": "Mép trên, 0–1 theo chiều cao ảnh."},
                "x1": {"type": "number", "description": "Mép phải, 0–1 theo chiều rộng ảnh."},
                "y1": {"type": "number", "description": "Mép dưới, 0–1 theo chiều cao ảnh."},
                "loai": {"type": "string", "enum": ["ho_ten", "so_dinh_danh", "nam_sinh", "dia_chi_nguoi", "so_phat_hanh", "ma_qr", "chu_ky"]}},
            "required": ["x0", "y0", "x1", "y1", "loai"]}},
    },
    "required": ["la_giay_to", "vung"],
}

HUONG_DAN = (
    "Bạn che thông tin cá nhân trên ảnh giấy tờ nhà đất trước khi lưu. Tìm MỌI chỗ ghi thông tin của NGƯỜI: họ tên (người đứng tên, vợ / "
    "chồng, người đồng sở hữu), số căn cước / chứng minh / định danh, năm sinh, địa chỉ thường trú của người, số phát hành và số vào sổ "
    "của giấy chứng nhận (dãy chữ số in ở góc trang), mã QR / mã vạch, chữ ký.\n"
    "Thông tin của THỬA ĐẤT và căn nhà thì để nguyên, không khoanh: số thửa, số tờ bản đồ, diện tích, địa chỉ thửa đất, loại đất, thời hạn "
    "sử dụng, sơ đồ thửa, diện tích xây dựng.\n"
    "Với mỗi chỗ, trả một khung ôm sát phần GIÁ TRỊ (toạ độ chuẩn hoá 0–1, gốc ở góc trái trên); nhãn in sẵn như \"Họ tên\", \"CCCD số\" "
    "không cần khoanh. Ảnh không phải giấy tờ thì la_giay_to=false và mảng vung rỗng.")


def tim_vung(engine: Any, data: bytes, mime: str) -> tuple[bool, list[tuple[float, float, float, float]]]:
    """(là giấy tờ?, các khung thông tin cá nhân). Model / JSON hỏng → (False, [])."""
    try:
        kq = engine._provider.extract_media([(data, mime or "image/jpeg")], HUONG_DAN, SCHEMA)
    except Exception as e:  # noqa: BLE001
        log.warning("che_so: model hụt (%s)", type(e).__name__)
        return False, []
    if not isinstance(kq, dict):
        return False, []
    return kq.get("la_giay_to") is True, chuan_vung(kq.get("vung"))


def to_den(data: bytes, vung: list[tuple[float, float, float, float]], khoa: str = "a.jpg") -> bytes | None:
    """Byte ảnh đã tô đen các khung, cùng định dạng với đuôi `khoa`; không đọc được ảnh → None."""
    try:
        from PIL import Image, ImageDraw, ImageOps
        with Image.open(io.BytesIO(data)) as goc:
            im = ImageOps.exif_transpose(goc).convert("RGB")
    except Exception as e:  # noqa: BLE001
        log.warning("che_so: đọc ảnh hụt (%s)", type(e).__name__)
        return None
    w, h = im.size
    no = max(2, round(min(w, h) * NOI_KHUNG))
    ve = ImageDraw.Draw(im)
    for x0, y0, x1, y1 in vung:
        ve.rectangle((max(0, int(x0 * w) - no), max(0, int(y0 * h) - no), min(w, int(x1 * w + 0.999) + no), min(h, int(y1 * h + 0.999) + no)),
                     fill=(0, 0, 0))
    dinh_dang, _ = _dinh_dang(khoa)
    ra = io.BytesIO()
    if dinh_dang == "JPEG":
        im.save(ra, "JPEG", quality=90, optimize=True)
    elif dinh_dang == "WEBP":
        im.save(ra, "WEBP", quality=90)
    else:
        im.save(ra, "PNG", optimize=True)
    return ra.getvalue()


def xu_ly_mot(engine: Any, kho: Any, kho_tep: SupabaseMediaStore, dong: dict) -> str:
    """Xử lý một dòng `listing_media` giấy tờ. Trả "xong" / "bo_qua" / "loi" (lỗi: không đánh dấu, lượt sau thử lại)."""
    mid, khoa = str(dong["id"]), str(dong["storage_path"])
    lid = khoa.split("/", 1)[0]
    variants = dict(dong.get("variants") or {})
    try:
        data, mime = _tai(kho, BUCKET_RIENG, khoa)
    except Exception as e:  # noqa: BLE001
        log.warning("che_so: tải ảnh hụt (%s)", type(e).__name__)
        return "loi"
    giay_to, vung = tim_vung(engine, data, dong.get("mime_type") or mime)
    moi = to_den(data, vung, khoa) if giay_to and vung else None
    if moi is None:
        _danh_dau(kho, mid, {**variants, "che_so": ""})
        return "bo_qua"
    _, ct = _dinh_dang(khoa)
    khoa_goc = f"{lid}/goc/{khoa.split('/', 1)[1]}"
    hd = {"apikey": kho.key, "Authorization": f"Bearer {kho.key}", "x-upsert": "true"}
    goc = _goc(kho)
    try:   # gốc sang thư mục goc/ TRƯỚC — chép hụt thì chưa đụng ảnh đang lưu
        kho_tep._gui("POST", f"{goc}/storage/v1/object/{BUCKET_RIENG}/{urllib.parse.quote(khoa_goc)}", data, {**hd, "Content-Type": mime or ct})
        kho_tep._gui("POST", f"{goc}/storage/v1/object/{BUCKET_RIENG}/{urllib.parse.quote(khoa)}", moi, {**hd, "Content-Type": ct})
    except Exception as e:  # noqa: BLE001
        log.warning("che_so: ghi kho hụt (%s)", type(e).__name__)
        return "loi"
    khoa_nho = str(variants.get(str(CANH_BAN_NHO)) or "")
    nho = ban_nho_480(moi) if khoa_nho else None   # bản nhỏ cũ cũng lộ thông tin — ghi đè bằng bản đã che
    if nho is not None:
        try:
            kho_tep._gui("POST", f"{goc}/storage/v1/object/{BUCKET_RIENG}/{urllib.parse.quote(khoa_nho)}", nho, {**hd, "Content-Type": "image/jpeg"})
        except Exception as e:  # noqa: BLE001
            log.warning("che_so: ghi bản nhỏ hụt (%s)", type(e).__name__)
    _danh_dau(kho, mid, {**variants, "che_so": khoa_goc})
    log.warning("che_so: %s — che %d vùng", khoa, len(vung))
    return "xong"


def chay_mot_luot(engine: Any) -> list[str]:
    """Một lượt: tối đa `TOI_DA_MOT_LUOT` ảnh giấy tờ mới nhất chưa xử lý. Trả danh sách kết quả từng ảnh."""
    kho = getattr(engine, "_convstore", None)
    if not getattr(kho, "is_configured", False):
        return []
    dongs = kho._get(f"listing_media?bucket=eq.{BUCKET_RIENG}&media_type=eq.giay_to&mime_type=like.image*&variants->>che_so=is.null"
                     f"&select=id,storage_path,mime_type,variants&order=created_at.desc&limit={TOI_DA_MOT_LUOT}")
    kho_tep = SupabaseMediaStore(_goc(kho), kho.key)
    ra: list[str] = []
    for d in dongs:
        mid = str(d.get("id"))
        try:
            kq = (xu_ly_mot(engine, kho, kho_tep, d) if str(d.get("storage_path") or "").lower().endswith(DUOI_ANH)
                  else "bo_qua_duoi")
        except Exception as e:  # noqa: BLE001 — một ảnh hỏng không chặn ảnh khác
            log.warning("che_so: ảnh hụt (%s)", type(e).__name__)
            kq = "loi"
        if kq == "loi":
            _hong[mid] = _hong.get(mid, 0) + 1
        if kq == "bo_qua_duoi" or _hong.get(mid, 0) >= HONG_TOI_DA:
            try:
                _danh_dau(kho, mid, {**(d.get("variants") or {}), "che_so": ""})
                _hong.pop(mid, None)
            except Exception as e:  # noqa: BLE001
                log.warning("che_so: đánh dấu hụt (%s)", type(e).__name__)
        ra.append(kq)
    return ra
