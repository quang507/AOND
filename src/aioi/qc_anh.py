"""Image LQC (Listing Quality Controller) — QC ảnh tin rao, SRS-5.1zzzzzzz422 (chủ dự án 11/11/2026: "một con loop như quality controller về hình ảnh của các tin rao, xem các hình
đang có có giống nội dung rao đăng không, và có phù hợp với điểm mạnh của BĐS đang rao không"; chọn: chạy nền trên máy 146, ghi kết quả +
tự nhắn chủ xin góc thiếu).

Mỗi lượt (`QC_ANH_CHU_KY_GIAY`, server): quét thư mục ảnh công khai `listing-public/<id tin>/` của tin đang hiện; bộ ảnh ĐỔI (băm tên tệp) thì
model vision chấm MỘT lần: ảnh có đúng căn trong tin không (đối chiếu loại hình, mô tả, hiện trạng — căn đang cho thuê kinh doanh thì ảnh
quán bên trong vẫn là ảnh căn), thế mạnh nào đã có ảnh / chưa có ảnh, góc nên xin nhất. Kết quả:
- sổ cục bộ `QC_ANH_SO` (JSON cạnh lõi) theo id tin — không chấm lại bộ ảnh cũ;
- ô riêng `_qc_anh` của căn trong lõi (schema.O_NOI_BO → bảng `listing_noi_bo`, chỉ admin) — khối xin ảnh trong lượt chat và tin nhắc 10 phút
  đọc `goc_can_xin` từ đây (`prompts.goc_anh_goi_y`);
- nhắn chủ (8–20 giờ, chat im từ 10 phút, mỗi bộ ảnh tối đa một tin, mỗi căn tối đa `TOI_DA_NHAN_MOI_CAN` tin QC): model viết MỘT câu khéo
  xin đúng góc thiếu. Ghi mốc `sau:anh` để tin nhắc 10 phút không xin lại lần đầu.
Không gọi model khi bộ ảnh không đổi; mỗi lượt tối đa `TOI_DA_MOT_LUOT` tin."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable

from .bao_can_moi import trong_khung_gio
from .xung_ho import goi_toi

log = logging.getLogger(__name__)

BUCKET = "listing-public"
TOI_DA_MOT_LUOT = 10
TOI_DA_ANH_MOT_LAN = 8
TOI_DA_NHAN_MOI_CAN = 2
IM_TOI_THIEU_GIAY = int(os.environ.get("SAU_DANG_NHAC_GIAY", "600"))
# Sổ cạnh lõi (aond_core/qc_anh.json trên 146) — task chạy dưới SYSTEM không có thư mục làm việc cố định.
QC_ANH_SO = os.environ.get("QC_ANH_SO", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "qc_anh.json"))
DUOI_ANH = (".jpg", ".jpeg", ".png", ".webp")

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "khop_noi_dung": {"type": "boolean", "description": "Bộ ảnh nhìn chung đúng là căn trong tin (loại hình, hiện trạng, quy mô)."},
        "anh_khong_khop": {"type": "array", "items": {"type": "object", "properties": {
            "tep": {"type": "string"}, "ly_do": {"type": "string"}, "chac_chan": {"type": "boolean"}},
            "required": ["tep", "ly_do", "chac_chan"]},
            "description": "Ảnh có dấu hiệu KHÔNG phải căn này (ảnh mạng, căn khác, loại hình khác). Ảnh quán / cửa hàng bên trong căn đang "
                           "cho thuê kinh doanh KHÔNG tính là không khớp."},
        "the_manh_da_co_anh": {"type": "array", "items": {"type": "string"}, "description": "Thế mạnh trong tin đã có ảnh thể hiện."},
        "the_manh_chua_co_anh": {"type": "array", "items": {"type": "string"}, "description": "Thế mạnh trong tin chưa có ảnh nào thể hiện."},
        "goc_can_xin": {"type": "string", "description": "MỘT góc ảnh nên xin chủ nhất để làm nổi thế mạnh chưa có ảnh; rỗng nếu bộ ảnh đã đủ."},
        "diem": {"type": "integer", "description": "0–100: bộ ảnh lột tả căn và thế mạnh của nó tới đâu."},
        "nhan_xet": {"type": "string", "description": "Một câu nhận xét cho admin."},
    },
    "required": ["khop_noi_dung", "anh_khong_khop", "the_manh_da_co_anh", "the_manh_chua_co_anh", "goc_can_xin", "diem", "nhan_xet"],
}


def _goc_storage(kho: Any) -> str:
    return str(getattr(kho, "url", "")).removesuffix("/rest/v1")


def _goi_storage(kho: Any, duong: str, data: dict | None = None) -> Any:
    req = urllib.request.Request(f"{_goc_storage(kho)}/storage/v1/{duong}", method="POST" if data is not None else "GET",
                                 data=json.dumps(data).encode() if data is not None else None,
                                 headers={"apikey": kho.key, "Authorization": f"Bearer {kho.key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode() or "null")


def thu_muc_anh(kho: Any) -> dict[str, list[str]]:
    """{id tin: [tên tệp ảnh]} trong bucket ảnh công khai."""
    ra: dict[str, list[str]] = {}
    for tm in _goi_storage(kho, f"object/list/{BUCKET}", {"prefix": "", "limit": 1000}) or []:
        ten = tm.get("name")
        if not ten or tm.get("id"):   # thư mục không có id
            continue
        tep = [t["name"] for t in (_goi_storage(kho, f"object/list/{BUCKET}", {"prefix": ten + "/", "limit": 100}) or [])
               if str(t.get("name", "")).lower().endswith(DUOI_ANH)]
        if tep:
            ra[ten] = sorted(tep)
    return ra


def bam(tep: list[str]) -> str:
    return hashlib.md5("|".join(sorted(tep)).encode()).hexdigest()


def _doc_so() -> dict[str, dict]:
    try:
        with open(QC_ANH_SO, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _ghi_so(so: dict[str, dict]) -> None:
    tam = QC_ANH_SO + ".tmp"
    with open(tam, "w", encoding="utf-8") as f:
        json.dump(so, f, ensure_ascii=False)
    os.replace(tam, QC_ANH_SO)


def huong_dan_qc(tin: dict) -> str:
    boc = tin.get("boc_tach") or {}
    khach = "; ".join(f"{k}: {v}" for k, v in boc.items() if not str(k).startswith("_") and v)[:1500]
    from .prompts import goc_anh_goi_y
    from .schema import Property
    p = Property()
    p.loai_hinh = boc.get("loai_hinh") or tin.get("property_type")
    p.fields.update({k: str(v) for k, v in boc.items() if isinstance(v, (str, int, float))})
    return ("Bạn là người kiểm soát chất lượng (QC) ẢNH của tin rao nhà đất. Đối chiếu bộ ảnh với NỘI DUNG TIN dưới đây.\n"
            f"Loại: {tin.get('property_type') or 'chưa rõ'} · {'cho thuê' if tin.get('deal') == 'cho_thue' else 'bán'} · "
            f"{tin.get('street') or ''} {tin.get('ward') or ''} {tin.get('district') or ''}\n"
            f"Mô tả tin: {(tin.get('description') or '')[:1500]}\n"
            f"Dữ kiện chủ nhà nói: {khach}\n"
            f"Góc ảnh thường làm nổi loại căn này: {goc_anh_goi_y(p)}\n"
            "Chấm: (1) ảnh có đúng căn này không — căn đang cho thuê / kinh doanh thì ảnh quán, cửa hàng bên trong là ảnh của căn; chỉ ghi "
            "không khớp khi có dấu hiệu rõ (căn khác loại, ảnh mạng, phối cảnh, khác hẳn mô tả), chac_chan=true chỉ khi gần như chắc chắn; "
            "(2) thế mạnh nào trong tin đã / chưa có ảnh thể hiện; (3) MỘT góc nên xin chủ nhất. Chỉ dựa vào điều thấy trong ảnh và tin, "
            "không đoán thêm.")


def cham(engine: Any, kho: Any, tin: dict, tep: list[str]) -> dict | None:
    """Model vision chấm bộ ảnh của một tin; lỗi → None (lượt sau thử lại)."""
    goc = f"{_goc_storage(kho)}/storage/v1/object/public/{BUCKET}/{tin['id']}/"
    items: list[tuple[bytes, str]] = []
    for t in tep[:TOI_DA_ANH_MOT_LAN]:
        try:
            with urllib.request.urlopen(goc + t, timeout=20) as r:
                items.append((r.read(), r.headers.get_content_type() or "image/jpeg"))
        except Exception as e:  # noqa: BLE001
            log.warning("qc_anh: tải ảnh hụt (%s)", type(e).__name__)
    if not items:
        return None
    try:
        kq = engine._provider.extract_media(items, huong_dan_qc(tin), SCHEMA)
    except Exception as e:  # noqa: BLE001
        log.warning("qc_anh: chấm hụt (%s)", type(e).__name__)
        return None
    return kq if isinstance(kq, dict) else None


def _conv_co_san(engine: Any, uk: str) -> Any:
    """Hội thoại đã có của người bán (bộ nhớ hoặc kho) — KHÔNG tạo hội thoại rỗng mới."""
    conv = engine._conversations.get(uk)
    if conv is None and engine._convstore is not None and engine._convstore.load(uk) is not None:
        conv = engine.conversation(uk)
    return conv


def chay_mot_luot(engine: Any, gui: Callable[[str, str], bool], xung_ho_cua: Callable[[str], Any] | None = None,
                  ghi_lich_su: Callable[[str, str, str, str | None, str], None] | None = None,
                  bay_gio: datetime | None = None) -> list[dict]:
    """Một lượt QC. Trả danh sách tin vừa chấm (kèm `da_nhan`)."""
    kho = engine._convstore
    if not getattr(kho, "is_configured", False):
        return []
    bay_gio = bay_gio or datetime.now(timezone.utc)
    so = _doc_so()
    anh = thu_muc_anh(kho)
    can_cham = [(i, t) for i, t in anh.items() if so.get(i, {}).get("bam") != bam(t)][:TOI_DA_MOT_LUOT]
    if not can_cham:
        return []
    ids = ",".join(i for i, _ in can_cham)
    tin_theo_id = {str(r["id"]): r for r in kho._get(
        f"listings?id=in.({ids})&status=in.(dang_ban,dang_quan_tam)"
        "&select=id,code,deal,property_type,street,ward,district,description,boc_tach,"
        "sellers!listings_seller_id_fkey(zalo_user_id,name)")}   # hai khoá ngoại listings↔sellers: chỉ rõ, không thì PostgREST trả 300
    ra: list[dict] = []
    for lid, tep in can_cham:
        tin = tin_theo_id.get(lid)
        if tin is None:   # tin không hiện — ghi băm để khỏi xét lại mỗi lượt
            so[lid] = {"bam": bam(tep), "luc": time.time(), "bo_qua": "tin không hiện"}
            continue
        kq = cham(engine, kho, tin, tep)
        if kq is None:
            continue
        kq["so_anh"] = len(tep)
        da_nhan = _ghi_va_nhan(engine, tin, kq, bay_gio, gui, xung_ho_cua, ghi_lich_su)
        so[lid] = {"bam": bam(tep), "luc": time.time(), "ma": tin.get("code"), "ket_qua": kq, "da_nhan": da_nhan}
        log.warning("Image LQC #%s: %s/100, khớp=%s, xin: %s%s", tin.get("code"), kq.get("diem"), kq.get("khop_noi_dung"),
                    kq.get("goc_can_xin") or "-", " (đã nhắn chủ)" if da_nhan else "")
        ra.append({"ma": tin.get("code"), "diem": kq.get("diem"), "da_nhan": da_nhan})
    _ghi_so(so)
    return ra


def _ghi_va_nhan(engine: Any, tin: dict, kq: dict, bay_gio: datetime, gui: Callable[[str, str], bool],
                 xung_ho_cua: Callable[[str], Any] | None, ghi_lich_su: Callable[..., None] | None) -> bool:
    """Ghi `_qc_anh` vào căn trong lõi; đủ điều kiện thì nhắn chủ xin góc thiếu. True = đã nhắn."""
    seller = tin.get("sellers") or {}
    uk = seller.get("zalo_user_id")
    if not uk:
        return False
    lid = str(tin["id"]).replace("-", "")
    chu = ""
    with engine.khoa_luot(uk):
        conv = _conv_co_san(engine, uk)
        if conv is None:
            return False
        li = next((x for x in conv.listings if str(x.listing_id).replace("-", "") == lid), None)
        if li is None:
            return False
        f = li.prop.fields
        f["_qc_anh"] = json.dumps({k: kq.get(k) for k in ("diem", "khop_noi_dung", "goc_can_xin", "the_manh_chua_co_anh", "anh_khong_khop",
                                                           "nhan_xet", "so_anh")}, ensure_ascii=False)
        so_lan = int(f.get("_qc_da_nhan") or 0)
        im = not conv.history or time.time() - conv.history[-1].at >= IM_TOI_THIEU_GIAY
        if (kq.get("goc_can_xin") and so_lan < TOI_DA_NHAN_MOI_CAN and im and trong_khung_gio(bay_gio)
                and getattr(conv, "nhuong_san_den", 0) <= time.time()):
            xh = xung_ho_cua(uk) if xung_ho_cua else "unknown"
            xh, ten_tro_ly = (xh if isinstance(xh, tuple) else (xh, None))
            goi, toi = goi_toi(xh, ten_tro_ly or getattr(conv.assistant, "name", None))
            chu = viet_tin_nhan(engine, conv, li, kq, goi, toi)
            if chu:
                f["_qc_da_nhan"] = str(so_lan + 1)
                da = {x for x in (f.get("_sau_da_hoi") or "").split(",") if x}
                f["_sau_da_hoi"] = ",".join(sorted(da | {"sau:anh"}))   # tin nhắc 10 phút không xin lại lần đầu
        if engine._convstore is not None:
            engine._convstore.save(conv)
    if not chu:
        return False
    try:
        if not gui(uk, chu):
            return False
    except Exception as e:  # noqa: BLE001
        log.warning("qc_anh: bridge hụt (%s)", type(e).__name__)
        return False
    if ghi_lich_su:
        try:
            ghi_lich_su(uk, chu, "seller", seller.get("name"), "bot")
        except Exception as e:  # noqa: BLE001
            log.warning("qc_anh: ghi lịch sử hụt (%s)", type(e).__name__)
    return True


def viet_tin_nhan(engine: Any, conv: Any, li: Any, kq: dict, goi: str, toi: str) -> str:
    """Model viết MỘT câu khéo xin đúng góc QC thấy thiếu; hụt → ""."""
    from .llm import Message
    from .prompts import LUAT_XIN_ANH_KHEO
    gan = "\n".join(f"{'Khách' if t.role == 'user' else 'Em'}: {(t.content or '')[:300]}" for t in conv.history[-6:])
    he = (f"Bạn là {getattr(conv.assistant, 'name', 'em')}, trợ lý sàn nhà đất, đang chăm sóc chủ nhà có tin rao ĐÃ LÊN WEB "
          f"({kq.get('so_anh')} ảnh). Bộ phận QC ảnh vừa xem tin: thế mạnh chưa có ảnh — {', '.join(kq.get('the_manh_chua_co_anh') or []) or 'không'}; "
          f"góc nên xin — {kq.get('goc_can_xin')}.\n"
          f"Viết ĐÚNG MỘT tin Zalo gửi chủ nhà xin góc đó. Gọi khách là \"{goi}\", tự xưng \"{toi}\". Không chào lại, không nhắc chuyện QC / "
          f"chấm điểm, không hỏi chuyện khác, không dùng chữ \"máy\". {LUAT_XIN_ANH_KHEO}\nChỉ trả về nguyên văn tin gửi khách.")
    try:
        tin = engine._provider.reply(he, [Message("user", f"Mấy lượt vừa nói:\n{gan or '(chưa có)'}\n\nViết tin xin ảnh.")],
                                     max_tokens=200).strip()
    except Exception as e:  # noqa: BLE001
        log.warning("qc_anh: viết tin hụt (%s)", type(e).__name__)
        return ""
    return tin if 0 < len(tin) <= 400 else ""
