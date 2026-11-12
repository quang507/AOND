"""Image LQC (Listing Quality Controller) — QC ảnh tin rao, SRS-5.1zzzzzzz422 (chủ dự án 11/11/2026: "một con loop như quality controller về hình ảnh của các tin rao, xem các hình
đang có có giống nội dung rao đăng không, và có phù hợp với điểm mạnh của BĐS đang rao không"; chọn: chạy nền trên máy 146, ghi kết quả +
tự nhắn chủ xin góc thiếu).

Mỗi lượt (`QC_ANH_CHU_KY_GIAY`, server): quét thư mục ảnh công khai `listing-public/<id tin>/` của tin đang hiện; bộ ảnh ĐỔI (băm tên tệp) thì
model vision chấm MỘT lần: ảnh có đúng căn trong tin không (đối chiếu loại hình, mô tả, hiện trạng — căn đang cho thuê kinh doanh thì ảnh
quán bên trong vẫn là ảnh căn), thế mạnh nào đã có ảnh / chưa có ảnh, góc nên xin nhất. Kết quả:
- sổ cục bộ `QC_ANH_SO` (JSON cạnh lõi) theo id tin — không chấm lại bộ ảnh cũ;
- ô riêng `_qc_anh` của căn trong lõi (schema.O_NOI_BO → bảng `listing_noi_bo`, chỉ admin) — khối xin ảnh trong lượt chat và tin nhắc 10 phút
  đọc `goc_can_xin` từ đây (`prompts.goc_anh_goi_y`);
- nhắn chủ (8–21 giờ, chat im từ 10 phút, mỗi bộ ảnh tối đa một tin, mỗi căn tối đa `TOI_DA_NHAN_MOI_CAN` tin QC): model viết MỘT câu khéo
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

GOC_ANH = ("mặt tiền", "đường trước nhà", "xung quanh", "phòng khách", "phòng ngủ", "phòng tắm", "bếp", "sân thượng / ban công",
           "cầu thang", "mặt bằng kinh doanh", "view", "giấy tờ", "khác")   # nhãn góc của từng ảnh (SRS-5.1zzzzzzz425)

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "khop_noi_dung": {"type": "boolean", "description": "Bộ ảnh nhìn chung đúng là căn trong tin (loại hình, hiện trạng, quy mô)."},
        "anh_khong_khop": {"type": "array", "items": {"type": "object", "properties": {
            "tep": {"type": "string", "description": "Số thứ tự ảnh (1 = tấm đầu tiên)."}, "ly_do": {"type": "string"},
            "chac_chan": {"type": "boolean"}},
            "required": ["tep", "ly_do", "chac_chan"]},
            "description": "Ảnh có dấu hiệu KHÔNG phải căn này (ảnh mạng, căn khác, loại hình khác). Ảnh quán / cửa hàng bên trong căn đang "
                           "cho thuê kinh doanh KHÔNG tính là không khớp."},
        "the_manh_da_co_anh": {"type": "array", "items": {"type": "string"}, "description": "Thế mạnh trong tin đã có ảnh thể hiện."},
        "the_manh_chua_co_anh": {"type": "array", "items": {"type": "string"}, "description": "Thế mạnh trong tin chưa có ảnh nào thể hiện."},
        "goc_can_xin": {"type": "string", "description": "MỘT góc ảnh nên xin chủ nhất để làm nổi thế mạnh chưa có ảnh; rỗng nếu bộ ảnh đã đủ. KHÔNG xin số nhà / biển số nhà (web không hiện số nhà)."},
        "diem": {"type": "integer", "description": "0–100: bộ ảnh lột tả căn và thế mạnh của nó tới đâu."},
        # SRS-5.1zzzzzzz425 — LQC mảng Ảnh (đặc tả anh Luận 12/11, docs/lqc-listing-quality-controller.md mục 1.1 · 1.3 · 1.4)
        "nhan_anh": {"type": "array", "description": "MỖI ảnh một dòng, theo thứ tự ảnh gửi kèm.", "items": {"type": "object", "properties": {
            "so": {"type": "integer", "description": "Số thứ tự ảnh (1 = tấm đầu tiên)."},
            "goc": {"type": "string", "enum": list(GOC_ANH)},
            "mo_ta": {"type": "string", "description": "Tả ngắn tấm ảnh bằng nội dung để nhắc với chủ, vd \"tấm chụp cầu thang có biển quán\"."},
            "xau": {"type": "boolean", "description": "true CHỈ khi ảnh rõ ràng kém: mờ nhoè, tối không thấy gì, nghiêng lệch nặng, gần như trùng "
                                                       "y hệt một tấm khác. Hơi kém thì false."},
            "ly_do_xau": {"type": "string", "description": "Kém ở đâu, nói nhẹ: \"hơi tối\", \"hơi mờ\", \"trùng tấm khác\". Rỗng nếu xau=false."}},
            "required": ["so", "goc", "mo_ta", "xau"]}},
        "goc_da_co": {"type": "array", "items": {"type": "string"}, "description": "Các góc bộ ảnh đã có (tên góc như trong nhan_anh)."},
        "goc_con_thieu": {"type": "array", "items": {"type": "string"},
                          "description": "Góc quan trọng với LOẠI căn này mà bộ ảnh chưa có, quan trọng nhất trước (vd nhà ở: phòng tắm, bếp; "
                                         "mặt tiền kinh doanh: mặt tiền thấy trọn căn, xung quanh). Rỗng nếu đủ."},
        "anh_dep_nhat": {"type": "object", "properties": {
            "so": {"type": "integer", "description": "Số thứ tự tấm đẹp nhất, đủ làm ảnh bìa: thấy rõ căn, sáng, góc rộng. 0 nếu không tấm nào đủ."},
            "ly_do": {"type": "string", "description": "Đẹp ở đâu, vd \"nắng đẹp, thấy trọn mặt tiền\", \"nội thất lên đèn ấm\"."}},
            "required": ["so", "ly_do"],
            "description": "Không chọn ảnh giấy tờ, ảnh nghi không phải căn, ảnh xấu."},
        "nhan_xet": {"type": "string", "description": "Một câu nhận xét cho admin."},
    },
    "required": ["khop_noi_dung", "anh_khong_khop", "the_manh_da_co_anh", "the_manh_chua_co_anh", "goc_can_xin", "diem", "nhan_xet",
                 "nhan_anh", "goc_con_thieu", "anh_dep_nhat"],
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
    """{id tin: [đường dẫn ảnh đang hiện]} — đọc `listing_media` (bucket công khai, chưa ẩn). SRS-5.1zzzzzzz425: ảnh chủ đã đồng ý ẩn không
    vào bộ ảnh nữa (bộ đổi → chấm lại); bản đầu liệt kê thư mục storage nên ảnh ẩn vẫn bị chấm và hỏi lại."""
    ra: dict[str, list[str]] = {}
    for r in kho._get("listing_media?bucket=eq.listing-public&an_khoi_web=is.false&select=listing_id,storage_path&limit=5000"):
        duong = str(r.get("storage_path") or "")
        if duong.lower().endswith(DUOI_ANH):
            ra.setdefault(str(r["listing_id"]), []).append(duong)
    return {k: sorted(v) for k, v in ra.items()}


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
            + ("CĂN NÀY ĐANG CÓ HỢP ĐỒNG THUÊ: ảnh quán / nhà hàng / cửa hàng / văn phòng bên trong là ảnh của căn — KHÔNG ghi vào anh_khong_khop.\n"
               if (boc.get("co_hdt") == "co" or boc.get("thu_nhap_thue") or boc.get("hd_thue_con")) else "")   # cùng điều kiện prompts.dang_cho_thue
            + "Chấm: (1) ảnh có đúng căn này không — căn đang cho thuê / kinh doanh thì ảnh quán, cửa hàng bên trong là ảnh của căn; chỉ ghi "
            "không khớp khi có dấu hiệu rõ (căn khác loại, ảnh mạng, phối cảnh, khác hẳn mô tả), chac_chan=true chỉ khi gần như chắc chắn; "
            "(2) thế mạnh nào trong tin đã / chưa có ảnh thể hiện; (3) MỘT góc nên xin chủ nhất. Chỉ dựa vào điều thấy trong ảnh và tin, "
            "không đoán thêm.\n"
            "Ảnh gửi kèm theo THỨ TỰ, gọi ảnh bằng số thứ tự (1 là tấm đầu). Thêm: (4) gắn nhãn TỪNG ảnh (góc, tả ngắn, có xấu rõ ràng không); "
            "(5) góc còn thiếu theo loại căn, quan trọng nhất trước; (6) tấm đẹp nhất làm ảnh bìa. Nhẹ tay: chỉ gọi là xấu khi rõ ràng kém.")


def cham(engine: Any, kho: Any, tin: dict, tep: list[str]) -> dict | None:
    """Model vision chấm bộ ảnh của một tin; lỗi → None (lượt sau thử lại)."""
    goc = f"{_goc_storage(kho)}/storage/v1/object/public/{BUCKET}/"   # `tep` là đường dẫn đầy đủ trong bucket (SRS-425)
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
        kq["_duong"] = tep[:TOI_DA_ANH_MOT_LAN]   # số thứ tự ảnh model thấy → đường dẫn
        dat_bia(kho, lid, kq)
        da_nhan = _ghi_va_nhan(engine, tin, kq, bay_gio, gui, xung_ho_cua, ghi_lich_su)
        so[lid] = {"bam": bam(tep), "luc": time.time(), "ma": tin.get("code"), "ket_qua": kq, "da_nhan": da_nhan}
        log.warning("Image LQC #%s: %s/100, khớp=%s, xin: %s%s", tin.get("code"), kq.get("diem"), kq.get("khop_noi_dung"),
                    kq.get("goc_can_xin") or "-", " (đã nhắn chủ)" if da_nhan else "")
        ra.append({"ma": tin.get("code"), "diem": kq.get("diem"), "da_nhan": da_nhan})
    _ghi_so(so)
    return ra


def dat_bia(kho: Any, lid: str, kq: dict) -> bool:
    """Tấm đẹp nhất QC chọn làm ảnh bìa (`dat_anh_bia`, SRS-5.1zzzzzzz425). Bìa cũ là tấm đầu tiên được lưu, kể cả tấm biển quán."""
    dep = anh_dep_nhat(kq)
    if dep is None:
        return False
    try:
        return kho._request("POST", "rpc/dat_anh_bia", {"p_listing_id": lid, "p_storage_path": dep["duong"]}) is True
    except Exception as e:  # noqa: BLE001
        log.warning("qc_anh: đặt bìa hụt (%s)", type(e).__name__)
        return False


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
                                                           "nhan_xet", "so_anh", "goc_da_co", "goc_con_thieu", "anh_dep_nhat")},
                                  ensure_ascii=False)
        so_lan = int(f.get("_qc_da_nhan") or 0)
        im = not conv.history or time.time() - conv.history[-1].at >= IM_TOI_THIEU_GIAY
        from .followup import cau_hoi_cuoi_cua_bot
        if cau_hoi_cuoi_cua_bot(conv):   # 12/11 (chat anh Luận): "Sổ đứng tên ai?" chưa đáp, QC chồng thêm tin xin ảnh
            im = False
        viec = chon_viec(kq)
        if (viec and so_lan < TOI_DA_NHAN_MOI_CAN and im and trong_khung_gio(bay_gio)
                and getattr(conv, "nhuong_san_den", 0) <= time.time()):
            from .engine import _detect_customer_pronoun
            goi, toi = goi_toi(_detect_customer_pronoun(conv, ""), getattr(conv.assistant, "name", None))
            chu = viet_tin_nhan(engine, conv, li, kq, goi, toi, viec)
            if chu and viec["loai"] == "xau":   # chủ trả lời "ừ / ok" → lượt chat ẩn ảnh (engine `an_anh`), "thôi" → giữ nguyên
                conv.pending_destructive = [{"op": "an_anh", "listing_uuid": str(tin["id"]), "path": viec["anh"]["duong"],
                                             "mo_ta": viec["anh"].get("mo_ta") or ""}]
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


def _anh_so(kq: dict, so: Any) -> dict | None:
    """Dòng nhãn + đường dẫn của ảnh số `so` (1 = tấm đầu) trong lượt chấm."""
    try:
        i = int(so)
    except (TypeError, ValueError):
        return None
    duong = kq.get("_duong") or []
    if not 1 <= i <= len(duong):
        return None
    nhan = next((a for a in (kq.get("nhan_anh") or []) if isinstance(a, dict) and a.get("so") == i), {})
    return {**nhan, "so": i, "duong": duong[i - 1]}


def anh_dep_nhat(kq: dict) -> dict | None:
    """Tấm đẹp nhất QC chọn (không phải tấm nghi không phải căn, không phải tấm xấu)."""
    d = kq.get("anh_dep_nhat") or {}
    a = _anh_so(kq, d.get("so"))
    if a is None or a.get("xau") or a.get("goc") == "giấy tờ" or str(a["so"]) in {str(x.get("tep")) for x in _anh_nghi(kq)}:
        return None
    return {**a, "ly_do": d.get("ly_do") or ""}


def chon_viec(kq: dict) -> dict | None:
    """MỘT việc cho tin nhắn QC, theo thứ tự (SRS-5.1zzzzzzz425): ảnh nghi không phải căn → hỏi lại; ảnh xấu → xin ẩn (tin còn ảnh khác);
    thiếu góc → nói đã có gì, xin góc thiếu (mở đầu bằng lời khen tấm đẹp nếu có); bộ ảnh chưa đủ mà có tấm đẹp → xin thêm cùng kiểu."""
    nghi = _anh_nghi(kq)
    if nghi:
        return {"loai": "nghi", "anh": nghi[0]}
    so_anh = int(kq.get("so_anh") or 0)
    if so_anh > 1:
        for a in kq.get("nhan_anh") or []:
            x = _anh_so(kq, a.get("so")) if isinstance(a, dict) and a.get("xau") is True else None
            if x:
                return {"loai": "xau", "anh": x}
    dep = anh_dep_nhat(kq)
    thieu = [g for g in (kq.get("goc_con_thieu") or []) if isinstance(g, str) and g.strip()]
    goc = thieu[0] if thieu else (kq.get("goc_can_xin") or "")
    if goc:
        return {"loai": "thieu", "goc": goc, "da_co": [g for g in (kq.get("goc_da_co") or []) if isinstance(g, str)], "dep": dep}
    from .schema import ANH_TIN_DEP
    if dep and so_anh < ANH_TIN_DEP:
        return {"loai": "them_kieu", "dep": dep}
    return None


def _anh_nghi(kq: dict) -> list[dict]:
    """Ảnh QC chấm gần như chắc chắn không phải căn — hỏi lại chủ, không trừ điểm (SRS-5.1zzzzzzz424)."""
    return [a for a in (kq.get("anh_khong_khop") or []) if isinstance(a, dict) and a.get("chac_chan") is True]


def viet_tin_nhan(engine: Any, conv: Any, li: Any, kq: dict, goi: str, toi: str, viec: dict | None = None) -> str:
    """Model viết MỘT tin khéo cho đúng MỘT việc `chon_viec` chọn; hụt → "" (SRS-422 → 425)."""
    from .llm import Message
    from .prompts import LUAT_XIN_ANH_KHEO
    viec = viec or chon_viec(kq)
    if not viec:
        return ""
    gan = "\n".join(f"{'Khách' if t.role == 'user' else 'Em'}: {(t.content or '')[:300]}" for t in conv.history[-6:])
    loai = viec["loai"]
    if loai == "nghi":
        viec_txt = (f"Có ảnh trông chưa giống căn: {viec['anh'].get('ly_do')}. HỎI KHÉO tấm đó có phải ảnh căn mình không (tả tấm ảnh bằng "
                    "nội dung, không nói số thứ tự / tên tệp, không nói ảnh sai / bị loại / bị trừ điểm).")
    elif loai == "xau":
        a = viec["anh"]
        viec_txt = (f"Tấm {a.get('mo_ta') or 'ảnh'} {a.get('ly_do_xau') or 'chưa được đẹp'}. Hỏi khéo chủ cho em ẨN tấm đó khỏi tin cho tin đẹp "
                    "hơn — chỉ ẩn, không xoá, muốn hiện lại lúc nào cũng được. Nói nhẹ (\"hơi tối\", \"hơi mờ\"), không dùng chữ \"xấu\". "
                    "Tin kết thúc bằng câu hỏi xin phép.")
    elif loai == "thieu":
        dep = viec.get("dep")
        viec_txt = ((f"Mở đầu bằng MỘT lời khen ngắn tấm {dep.get('mo_ta')} ({dep.get('ly_do')}). " if dep else "")
                    + (f"Bộ ảnh đã có: {', '.join(viec['da_co'])}. " if viec.get("da_co") else "")
                    + f"Còn thiếu: {viec['goc']}. Nói ngắn đã có góc nào rồi (nếu có), rồi xin góc còn thiếu; có thể hỏi mở để chủ tự khoe "
                    "(vd \"bếp nhà mình đẹp không anh?\").")
    else:
        dep = viec["dep"]
        viec_txt = (f"Tấm {dep.get('mo_ta')} đẹp ({dep.get('ly_do')}). Khen ngắn tấm đó rồi hỏi chủ còn tấm nào kiểu vậy nữa không, "
                    "để em gửi khách xem.")
    he = (f"Bạn là {getattr(conv.assistant, 'name', 'em')}, trợ lý sàn nhà đất, đang chăm sóc chủ nhà có tin rao ĐÃ LÊN WEB "
          f"({kq.get('so_anh')} ảnh). Bộ phận QC ảnh vừa xem bộ ảnh.\nVIỆC CỦA TIN NÀY: {viec_txt}\n"
          f"Viết ĐÚNG MỘT tin Zalo gửi chủ nhà. Gọi khách là \"{goi}\", tự xưng \"{toi}\". Không chào lại, không nhắc chuyện QC / "
          f"chấm điểm, không hỏi chuyện khác, không dùng chữ \"máy\". {LUAT_XIN_ANH_KHEO}\nChỉ trả về nguyên văn tin gửi khách.")
    try:
        tin = engine._provider.reply(he, [Message("user", f"Mấy lượt vừa nói:\n{gan or '(chưa có)'}\n\nViết tin.")],
                                     max_tokens=200).strip()
    except Exception as e:  # noqa: BLE001
        log.warning("qc_anh: viết tin hụt (%s)", type(e).__name__)
        return ""
    return tin if 0 < len(tin) <= 400 else ""
