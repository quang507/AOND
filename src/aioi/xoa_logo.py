"""Xoá logo / watermark in đè trên ảnh tin rồi đóng dấu AOND — SRS-5.1zzzzzzz454 (chủ dự án 13/11/2026, theo công cụ "Xoá logo watermark"
của moso.vn). Ảnh chủ / môi giới gửi qua Zalo hay có logo sàn, số điện thoại, website, tên công ty khác in đè.

Mỗi ảnh công khai (`listing_media`, bucket `listing-public`, chưa ẩn, chưa xử lý) đi MỘT lần:
1. model vision của lõi (`engine._provider.extract_media`, cùng đường gọi với `qc_anh`) trả JSON các khung toạ độ 0–1 của lớp chữ / logo IN ĐÈ
   (chữ có thật trong cảnh như biển hiệu, bảng tên đường, chữ trên sổ thì giữ). Model hỏng / JSON hỏng → coi như không có vùng nào;
2. OpenCV `cv2.inpaint` (TELEA) xoá các vùng đó, mặt nạ nới rộng vài px. Máy thiếu numpy / cv2 → bỏ bước này;
3. đóng dấu logo AOND (`tai_nguyen/logo-aond.png`) góc dưới phải, rộng ~16 % cạnh ngắn, mờ 70 % (Pillow);
4. ảnh GỐC chép sang bucket RIÊNG `listing-private/<uuid tin>/goc/<tên>` trước, chép xong mới ghi đè bản đã xử lý lên đúng khoá cũ ở
   `listing-public` (đường dẫn, bìa, băm bộ ảnh của QC giữ nguyên) và sinh lại bản nhỏ 480;
5. đánh dấu `variants.xoa_logo` = khoá ảnh gốc trong bucket riêng ("" = bỏ qua, vd ảnh giấy tờ) để không xử lý lần hai.

Ảnh model nhận ra là giấy tờ / sổ thì giữ nguyên, không đóng dấu. Chạy nền (`server._vong_xoa_logo`), không chặn lượt chat; mọi lỗi chỉ
ghi log — luồng lưu ảnh không bao giờ hỏng vì bước này."""
from __future__ import annotations

import io
import logging
import os
import urllib.parse
import urllib.request
from typing import Any

from .kho_anh import BUCKET_CONG_KHAI, BUCKET_RIENG, CANH_BAN_NHO, SupabaseMediaStore, ban_nho_480

log = logging.getLogger("aioi.xoa_logo")

TOI_DA_MOT_LUOT = 10
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tai_nguyen", "logo-aond.png")
TI_LE_LOGO = 0.16        # bề rộng logo / cạnh ngắn ảnh
TI_LE_LE = 0.03          # lề tới mép ảnh / cạnh ngắn
DO_MO = 0.70             # độ đậm logo (70 %)
TOI_DA_VUNG = 12
DIEN_TICH_VUNG_TOI_DA = 0.35   # khung lớn hơn 35 % ảnh = watermark phủ cả ảnh; inpaint sẽ phá ảnh → bỏ khung đó
DUOI_ANH = (".jpg", ".jpeg", ".png", ".webp")
HONG_TOI_DA = 3          # ảnh hụt quá số lượt này (tệp hỏng, mất object) → đánh dấu bỏ qua, khỏi chiếm chỗ ảnh mới mỗi lượt
_hong: dict[str, int] = {}

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "la_giay_to": {"type": "boolean", "description": "true khi ảnh chụp giấy tờ: sổ, hợp đồng, bản vẽ, giấy phép, hoá đơn."},
        "vung": {"type": "array", "description": "Mỗi lớp chữ / logo in đè một khung; mảng rỗng khi ảnh sạch.", "items": {
            "type": "object", "properties": {
                "x0": {"type": "number", "description": "Mép trái, 0–1 theo chiều rộng ảnh."},
                "y0": {"type": "number", "description": "Mép trên, 0–1 theo chiều cao ảnh."},
                "x1": {"type": "number", "description": "Mép phải, 0–1 theo chiều rộng ảnh."},
                "y1": {"type": "number", "description": "Mép dưới, 0–1 theo chiều cao ảnh."},
                "loai": {"type": "string", "enum": ["logo", "watermark", "so_dien_thoai", "website", "chu_quang_cao"]}},
            "required": ["x0", "y0", "x1", "y1", "loai"]}},
    },
    "required": ["la_giay_to", "vung"],
}

HUONG_DAN = (
    "Bạn soát ảnh tin rao nhà đất trước khi lên web. Tìm các lớp chữ / logo được THÊM ĐÈ lên ảnh bằng phần mềm sau khi chụp: logo sàn "
    "hay công ty môi giới, watermark mờ, số điện thoại, website, tên người / công ty, chữ quảng cáo chèn thêm.\n"
    "Dấu hiệu lớp in đè: nằm phẳng trên mặt ảnh, đứng yên bất kể phối cảnh, thường ở góc hoặc giữa ảnh, hay trong suốt hoặc có viền / nền riêng.\n"
    "Chữ thuộc cảnh thật là một phần của căn nhà, để nguyên: biển hiệu cửa hàng, bảng tên đường, số nhà gắn tường, chữ in trên vật dụng, "
    "chữ trên sổ / giấy tờ được chụp.\n"
    "Với mỗi lớp in đè, trả một khung ôm sát (toạ độ chuẩn hoá 0–1, gốc ở góc trái trên). Ảnh sạch thì trả mảng vung rỗng. "
    "Ghi la_giay_to=true khi cả tấm ảnh là giấy tờ (sổ, hợp đồng, bản vẽ, giấy phép).")


# ---------------------------------------------------------------- tìm vùng

def _so(v: Any) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return min(1.0, max(0.0, x))


def chuan_vung(vung: Any) -> list[tuple[float, float, float, float]]:
    """Khung model trả → danh sách (x0, y0, x1, y1) hợp lệ trong 0–1; bỏ khung hỏng, khung rỗng, khung phủ gần hết ảnh."""
    ra: list[tuple[float, float, float, float]] = []
    for v in vung if isinstance(vung, list) else []:
        if not isinstance(v, dict):
            continue
        x0, y0, x1, y1 = (_so(v.get(k)) for k in ("x0", "y0", "x1", "y1"))
        if None in (x0, y0, x1, y1):
            continue
        x0, x1 = min(x0, x1), max(x0, x1)   # type: ignore[type-var]
        y0, y1 = min(y0, y1), max(y0, y1)   # type: ignore[type-var]
        dt = (x1 - x0) * (y1 - y0)
        if dt <= 0 or dt > DIEN_TICH_VUNG_TOI_DA:
            continue
        ra.append((x0, y0, x1, y1))
    return ra[:TOI_DA_VUNG]


def tim_vung(engine: Any, data: bytes, mime: str) -> tuple[bool, list[tuple[float, float, float, float]]]:
    """(là giấy tờ?, các khung in đè). Model / JSON hỏng → (False, [])."""
    try:
        kq = engine._provider.extract_media([(data, mime or "image/jpeg")], HUONG_DAN, SCHEMA)
    except Exception as e:  # noqa: BLE001
        log.warning("xoa_logo: model hụt (%s)", type(e).__name__)
        return False, []
    if not isinstance(kq, dict):
        return False, []
    return kq.get("la_giay_to") is True, chuan_vung(kq.get("vung"))


# ---------------------------------------------------------------- xử lý ảnh

def _net_chu(cv2: Any, np: Any, xam: Any, no: int) -> Any:
    """Mặt nạ nét chữ / logo trong một khung: điểm sáng hoặc tối vọt hẳn so với nền quanh nó (top-hat + black-hat, nửa ngưỡng Otsu), nới `no` px.
    Nét chiếm quá ít / quá nhiều khung (không tách được chữ khỏi nền) → vá cả khung."""
    hh, ww = xam.shape[:2]
    if hh < 3 or ww < 3:
        return np.full((hh, ww), 255, np.uint8)
    k = max(3, min(hh, ww) // 2) | 1
    nhan = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    noi = cv2.max(cv2.morphologyEx(xam, cv2.MORPH_TOPHAT, nhan), cv2.morphologyEx(xam, cv2.MORPH_BLACKHAT, nhan))
    nguong, _ = cv2.threshold(noi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    _, net = cv2.threshold(noi, max(8.0, nguong * 0.5), 255, cv2.THRESH_BINARY)   # nửa ngưỡng Otsu: bắt cả nét mờ của watermark trong suốt
    ti_le = float(np.count_nonzero(net)) / net.size
    if not 0.02 <= ti_le <= 0.85:
        return np.full((hh, ww), 255, np.uint8)
    return cv2.dilate(net, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * no + 1, 2 * no + 1)))


def xoa_vung(im: Any, vung: list[tuple[float, float, float, float]]) -> Any:
    """Ảnh PIL RGB đã xoá các khung bằng `cv2.inpaint` (TELEA). Thiếu numpy / cv2 hay lỗi → trả nguyên ảnh."""
    if not vung:
        return im
    try:
        import cv2
        import numpy as np
    except ImportError:
        log.warning("xoa_logo: thiếu numpy / opencv — chỉ đóng dấu")
        return im
    try:
        from PIL import Image
        w, h = im.size
        no = max(3, round(min(w, h) * 0.005))   # nới mặt nạ vài px — viền chữ / bóng đổ của logo
        bgr = cv2.cvtColor(np.asarray(im.convert("RGB")), cv2.COLOR_RGB2BGR)
        xam = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        mat_na = np.zeros((h, w), dtype=np.uint8)
        for x0, y0, x1, y1 in vung:
            # khung model trả thường lệch / rộng: nới thêm rồi chỉ lấy NÉT CHỮ trong khung (top-hat + black-hat), vùng cần vá nhỏ → vá sạch
            c0, c1 = max(0, int(x0 * w) - 2 * no), min(w, int(x1 * w + 0.999) + 2 * no)
            r0, r1 = max(0, int(y0 * h) - 2 * no), min(h, int(y1 * h + 0.999) + 2 * no)
            mat_na[r0:r1, c0:c1] = np.maximum(mat_na[r0:r1, c0:c1], _net_chu(cv2, np, xam[r0:r1, c0:c1], no))
        sach = cv2.inpaint(bgr, mat_na, no, cv2.INPAINT_TELEA)
        return Image.fromarray(cv2.cvtColor(sach, cv2.COLOR_BGR2RGB))
    except Exception as e:  # noqa: BLE001
        log.warning("xoa_logo: inpaint hụt (%s)", type(e).__name__)
        return im


def dong_dau(im: Any, logo_path: str = LOGO) -> Any:
    """Ảnh PIL có logo AOND góc dưới phải (rộng `TI_LE_LOGO` cạnh ngắn, mờ `DO_MO`). Thiếu tệp logo → trả nguyên ảnh."""
    try:
        from PIL import Image
        with Image.open(logo_path) as lg:
            logo = lg.convert("RGBA")
    except Exception as e:  # noqa: BLE001
        log.warning("xoa_logo: đọc logo hụt (%s)", type(e).__name__)
        return im
    w, h = im.size
    ngan = min(w, h)
    lw = max(24, round(ngan * TI_LE_LOGO))
    lh = max(1, round(logo.height * lw / logo.width))
    logo = logo.resize((lw, lh), Image.LANCZOS)
    logo.putalpha(logo.getchannel("A").point(lambda a: round(a * DO_MO)))
    le = round(ngan * TI_LE_LE)
    nen = im.convert("RGBA")
    nen.alpha_composite(logo, (max(0, w - lw - le), max(0, h - lh - le)))
    return nen.convert("RGB")


def _dinh_dang(khoa: str) -> tuple[str, str]:
    d = khoa.lower().rsplit(".", 1)[-1]
    if d == "png":
        return "PNG", "image/png"
    if d == "webp":
        return "WEBP", "image/webp"
    return "JPEG", "image/jpeg"


def xu_ly(data: bytes, vung: list[tuple[float, float, float, float]], khoa: str = "a.jpg") -> bytes | None:
    """Byte ảnh đã xoá vùng + đóng dấu, cùng định dạng với đuôi `khoa`; không đọc được ảnh → None."""
    try:
        from PIL import Image, ImageOps
        with Image.open(io.BytesIO(data)) as goc:
            im = ImageOps.exif_transpose(goc).convert("RGB")
    except Exception as e:  # noqa: BLE001
        log.warning("xoa_logo: đọc ảnh hụt (%s)", type(e).__name__)
        return None
    im = dong_dau(xoa_vung(im, vung))
    dinh_dang, _ = _dinh_dang(khoa)
    ra = io.BytesIO()
    if dinh_dang == "JPEG":
        im.save(ra, "JPEG", quality=90, optimize=True)
    elif dinh_dang == "WEBP":
        im.save(ra, "WEBP", quality=90)
    else:
        im.save(ra, "PNG", optimize=True)
    return ra.getvalue()


# ---------------------------------------------------------------- vòng nền

def _goc(kho: Any) -> str:
    return str(getattr(kho, "url", "")).removesuffix("/rest/v1")


def _tai(kho: Any, bucket: str, khoa: str) -> tuple[bytes, str]:
    """Tải object bằng khoá dịch vụ (không qua link công khai — tránh bản đệm CDN)."""
    req = urllib.request.Request(f"{_goc(kho)}/storage/v1/object/{bucket}/{urllib.parse.quote(khoa)}",
                                 headers={"apikey": kho.key, "Authorization": f"Bearer {kho.key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read(), r.headers.get_content_type() or "image/jpeg"


def _danh_dau(kho: Any, mid: str, variants: dict) -> None:
    kho._request("PATCH", f"listing_media?id=eq.{mid}", data={"variants": variants}, prefer="return=minimal")


def xu_ly_mot(engine: Any, kho: Any, kho_tep: SupabaseMediaStore, dong: dict) -> str:
    """Xử lý một dòng `listing_media`. Trả "xong" / "bo_qua" / "loi" (lỗi: không đánh dấu, lượt sau thử lại)."""
    mid, khoa = str(dong["id"]), str(dong["storage_path"])
    lid = khoa.split("/", 1)[0]
    variants = dict(dong.get("variants") or {})
    try:
        data, mime = _tai(kho, BUCKET_CONG_KHAI, khoa)
    except Exception as e:  # noqa: BLE001
        log.warning("xoa_logo: tải ảnh hụt (%s)", type(e).__name__)
        return "loi"
    giay_to, vung = tim_vung(engine, data, dong.get("mime_type") or mime)
    if giay_to:
        _danh_dau(kho, mid, {**variants, "xoa_logo": ""})
        return "bo_qua"
    moi = xu_ly(data, vung, khoa)
    if moi is None:
        _danh_dau(kho, mid, {**variants, "xoa_logo": ""})
        return "bo_qua"
    _, ct = _dinh_dang(khoa)
    khoa_goc = f"{lid}/goc/{khoa.split('/', 1)[1]}"
    hd = {"apikey": kho.key, "Authorization": f"Bearer {kho.key}", "x-upsert": "true"}
    goc = _goc(kho)
    try:   # gốc vào bucket riêng TRƯỚC — chép hụt thì chưa đụng ảnh công khai
        kho_tep._gui("POST", f"{goc}/storage/v1/object/{BUCKET_RIENG}/{urllib.parse.quote(khoa_goc)}", data,
                     {**hd, "Content-Type": mime or ct})
        kho_tep._gui("POST", f"{goc}/storage/v1/object/{BUCKET_CONG_KHAI}/{urllib.parse.quote(khoa)}", moi, {**hd, "Content-Type": ct})
    except Exception as e:  # noqa: BLE001
        log.warning("xoa_logo: ghi kho hụt (%s)", type(e).__name__)
        return "loi"
    nho = ban_nho_480(moi)
    if nho is not None:
        khoa_nho = str(variants.get(str(CANH_BAN_NHO)) or "") or f"{lid}/{CANH_BAN_NHO}/{khoa.split('/')[-1].rsplit('.', 1)[0]}.jpg"
        try:
            kho_tep._gui("POST", f"{goc}/storage/v1/object/{BUCKET_CONG_KHAI}/{urllib.parse.quote(khoa_nho)}", nho,
                         {**hd, "Content-Type": "image/jpeg"})
            variants[str(CANH_BAN_NHO)] = khoa_nho
        except Exception as e:  # noqa: BLE001
            log.warning("xoa_logo: ghi bản nhỏ hụt (%s)", type(e).__name__)
    # variants chỉ chứa khoá đường dẫn (trigger listing_media_xep_hang_don dọn theo giá trị) — ghi khoá ảnh gốc ở bucket riêng
    _danh_dau(kho, mid, {**variants, "xoa_logo": khoa_goc})
    log.warning("xoa_logo: %s — xoá %d vùng in đè, đã đóng dấu", khoa, len(vung))
    return "xong"


def chay_mot_luot(engine: Any) -> list[str]:
    """Một lượt: tối đa `TOI_DA_MOT_LUOT` ảnh công khai mới nhất chưa xử lý. Trả danh sách kết quả từng ảnh."""
    kho = getattr(engine, "_convstore", None)
    if not getattr(kho, "is_configured", False):
        return []
    dongs = kho._get("listing_media?bucket=eq.listing-public&an_khoi_web=is.false&mime_type=like.image*&variants->>xoa_logo=is.null"
                     f"&select=id,storage_path,mime_type,variants&order=created_at.desc&limit={TOI_DA_MOT_LUOT}")
    kho_tep = SupabaseMediaStore(_goc(kho), kho.key)
    ra: list[str] = []
    for d in dongs:
        mid = str(d.get("id"))
        try:
            kq = (xu_ly_mot(engine, kho, kho_tep, d) if str(d.get("storage_path") or "").lower().endswith(DUOI_ANH)
                  else "bo_qua_duoi")
        except Exception as e:  # noqa: BLE001 — một ảnh hỏng không chặn ảnh khác
            log.warning("xoa_logo: ảnh hụt (%s)", type(e).__name__)
            kq = "loi"
        if kq == "loi":
            _hong[mid] = _hong.get(mid, 0) + 1
        if kq == "bo_qua_duoi" or _hong.get(mid, 0) >= HONG_TOI_DA:
            try:
                _danh_dau(kho, mid, {**(d.get("variants") or {}), "xoa_logo": ""})
                _hong.pop(mid, None)
            except Exception as e:  # noqa: BLE001
                log.warning("xoa_logo: đánh dấu hụt (%s)", type(e).__name__)
        ra.append(kq)
    return ra
