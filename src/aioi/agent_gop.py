"""Vòng agent GỘP phía NGƯỜI BÁN — SRS-5.1zzzzzzz371 (chủ dự án 03/11/2026: "AI đọc lời của khách làm 2 việc cùng lúc, bóc tách ra lưu db
và trả lời lại khách. quá trình thu thập diễn ra song song với việc trả lời chăm sóc khách hàng" + "gộp đi").

Mỗi lượt người bán là MỘT cuộc hội thoại công cụ với model chat (Sonnet), theo khung "Suy nghĩ → Chọn công cụ → Thực thi → Đánh giá":

- Bước 1 (`mo`, trong `Engine._lap_ke_hoach`): system = phần cố định phía bán (`prompts.co_dinh_ban`: prompt gọn + kiến thức nghề)
  + luật ghi chung + dữ liệu của lượt. Model gọi công cụ GHI (`ghi_o`, `them_can`, `doi_trang_thai`, `bo_can`,
  `ghi_y_khach` — thân `_chay_ghi`, cổng trích + cổng rổ nhiều căn `Engine._chua_ro_can`), công cụ ĐỌC (rổ hàng / bộ nhớ dự án / giá đã gửi — thân
  là hàm khối của engine qua `agent_ban._khoi`) và công cụ TRA CỨU luật `tra_luat_o(o)` (RAG: luật ghi từng ô cắt NGUYÊN từ
  `OPERATIONS_SYSTEM_BAN` + mô tả schema, không nhồi cả 45.000 chữ vào mọi lượt).
- Engine áp kế hoạch NGAY sau vòng ghi, qua đúng các cổng hiện có (`_ap_dung_ke_hoach` → `_apply_operation` / `_loc_o_tin`, chuẩn địa danh, tra
  phường…) rồi dựng phiếu lượt mới như mọi lượt.
- Bước 2 (`viet`, ở chỗ viết lời người bán): CÙNG cuộc hội thoại, kết quả công cụ ghi = báo cáo thật sau khi áp (đã ghi gì / bỏ ô nào vì sao /
  ô còn thiếu / VIỆC LƯỢT NÀY); system = phiếu lượt engine vừa dựng (nguyên vẹn) + dặn đánh giá. Model đọc kết quả rồi viết lời — chỉ nói "đã
  ghi" điều báo cáo ghi.

Đường DUY NHẤT của lượt người bán đã rõ vai (chủ dự án 03/11/2026: "lấy phương án cuối cùng thôi", "các code không dùng thì xóa" — công tắc
AGENT_GOP / AGENT_BOC và agent_boc.py gỡ). Bước 1 lỗi / dự phòng không gọi được công cụ → trả None, engine đọc bằng form JSON (Haiku); bước 2
dự phòng → viết lại như agent_ban với đủ khối dữ liệu.

Người MUA đã rõ vai đi CÙNG vòng (SRS-5.1zzzzzzz380, chủ dự án 03/11 duyệt "Phía mua đi cùng kiểu vòng gộp như phía bán — một đường cho cả hai
phía, sửa luật một chỗ"): `mo_mua` / `viet_mua` dùng chung `_vong_ghi` / `_tin_buoc_2` / `_vong_viet`; system bước 1 = `prompts.mua_co_dinh`
+ `prompts.luat_doc_y_mua` (nguyên form mua gọn), công cụ + thân công cụ + báo cáo ở `agent_mua`. Khách mua chuyển sang ý bán → engine đọc
lại cả lượt bằng form đầy đủ (đường bán) như form gọn; vòng lỗi → form mua gọn (Haiku) + `agent_mua.chay` làm dự phòng."""
from __future__ import annotations

import copy
import json
import logging
import time
from typing import Any

from . import agent_ban, agent_mua

log = logging.getLogger(__name__)

MAX_VONG_GHI = 3    # bước 1: ghi / tra → sửa theo kết quả → xong
MAX_VONG_LOI = 3    # bước 2: tra thêm (nếu cần) → lời
HAN_GIAY = 30.0     # cả hai bước; trần lõi 40 s, bridge chờ 90 s — không nới
TRAN_KET_QUA = 6000
SUA = "Sẽ BỎ"      # dấu trong kết quả công cụ: model cần sửa cụm trích (mở thêm một vòng)
DAU_BUOC_2 = "=== BƯỚC 2 — ĐÁNH GIÁ KẾT QUẢ RỒI VIẾT LỜI GỬI KHÁCH ==="   # scripts/do-prompt.py nhận lần gọi viết lời bằng dấu này
DAU_KHAI_HOI = "<<HOI>>"   # SRS-5.1zzzzzzz511: dòng tự khai ô lời hỏi — `tach_khai_hoi` cắt trước khi gửi, lưới `engine._khai_o_hoi` đọc

GHI = ("ghi_o", "them_can", "doi_trang_thai", "bo_can", "ghi_y_khach")
DOC = tuple(c["name"] for c in agent_ban.CONG_CU)
# SRS-5.1zzzzzzz505: bước 1 (ghi) chỉ cần đọc DỮ LIỆU của khách để ghi đúng căn — rổ hàng, bộ nhớ dự án, giá đã gửi. Tám công cụ tư vấn (định
# giá, pháp lý, phí, phong thuỷ, quy hoạch, đàm phán, tra dự án theo tên / khu) là việc của bước viết lời, vốn đã có đủ ở `cong_cu_viet`;
# để ở cả hai bước là gửi ≈ 4.700 chữ khai báo công cụ thừa mỗi lượt.
DOC_BUOC_1 = ("ro_hang", "bo_nho_du_an", "gia_da_gui")


# ---------------------------------------------------------------------------------------------------------------------------------------------
# Luật ghi: cắt OPERATIONS_SYSTEM_BAN thành khối, mỗi khối về ĐÚNG MỘT chỗ — system (luật chung mọi lượt), mô tả một công cụ ghi, hay
# tra_luat_o(khoá). Không khối nào bị bỏ ngoài dòng "Trả về JSON đúng schema." (đường công cụ không trả JSON) và từ điển tiếng lóng `SLANG_NOTES` (phần cố định
# đã mang: phiếu lượt có nguyên khối; prompt gọn có bản rút "HIỂU TIẾNG NGHỀ" + khối `KIEN_THUC_NGHE` đi kèm — `prompts._lean_co_dinh`, SRS-504). (Test `test_agent_gop_371` đã gỡ 13/11/2026 cùng bộ pytest — thêm khối thì tự soát mọi khối có chỗ, mọi dấu còn khớp form.)
# ---------------------------------------------------------------------------------------------------------------------------------------------

HE = "he"           # system bước 1
BO = "bo"           # không cần ở đường công cụ (kèm lý do ở BANG_LUAT)

# (đầu khối, nơi đến). Nơi đến: HE · BO · "cc:<công cụ>" · "tra:<khoá>,<khoá>…". Khối không khớp dấu nào → HE (an toàn: không mất luật).
BANG_LUAT: list[tuple[str, str]] = [
    ("Bạn là bộ ĐIỀU PHỐI THAO TÁC", HE),
    ('Các loại "op":', HE),
    ('- "update":', "cc:ghi_o"),
    ('- "add":', "cc:them_can"),
    ('- "set_status":', "cc:doi_trang_thai"),
    ('- "remove":', "cc:bo_can"),
    ('- "keep_only":', "cc:bo_can"),
    ('- "clear":', "cc:bo_can"),
    ("⚠️ QUAN TRỌNG — AOND KHÔNG BAO GIỜ XÓA DỮ LIỆU", "cc:bo_can"),
    ("BÓC TÁCH KHÔNG THIẾU", HE),
    ('Ngoài "operations", lời khách CHO BIẾT vai', "tra:seller_role,seller_role_trich_dan"),   # dấu = câu đầu khối trong OPERATIONS_SYSTEM; đổi câu đó thì đổi ở đây (`scripts/do-prompt.py` soát)
    ("SỰ THẬT CỦA CĂN", "tra:phap_ly_trang_thai,duong_vao,tien_ich_gan,tinh_trang_nha,hoan_cong"),
    ('- "phap_ly_trang_thai":', "tra:phap_ly_trang_thai"),
    ('- "duong_vao":', "tra:duong_vao"),
    ('- "tien_ich_gan":', "tra:tien_ich_gan"),
    ('- "tinh_trang_nha":', "tra:tinh_trang_nha"),
    ('- "hoan_cong":', "tra:hoan_cong"),
    ("PHÂN BIỆT Ý ĐỊNH KHÁCH", HE),
    ('- "sell":', HE),
    ('- "buy":', HE),
    ('- "unknown":', HE),
    ('- "hoi_ngoai_viec":', HE),
    ('TRẢ LỜI CÂU KHÁCH HỎI ("tra_loi_khach_hoi"', "tra:tra_loi_khach_hoi"),
    ('CĂN CÒN BÁN ("con_ban")', HE),
    ("QUY TẮC:", HE),
    ("- Người rao chỉ khai thông tin bình thường", HE),
    ("- DUYỆT BẢN TIN / ĐỒNG Ý ĐĂNG TIN", HE),
    ("- CÂU HỎI hoặc YÊU CẦU XEM", HE),
    ("- Diện tích: nhà phố/biệt thự", "tra:dien_tich,dien_tich_dat,dien_tich_nha"),
    ("ĐỌC DẤU HIỆU NHƯ MÔI GIỚI LÂU NĂM", "tra:loai_hinh,dien_tich,dien_tich_dat,dien_tich_nha,mat_tien,lo_gioi_duong"),
    ("- Loại hình (loai_hinh)", "tra:loai_hinh"),
    ("- Diện tích nhà phố:", "tra:dien_tich,dien_tich_dat,dien_tich_nha,mat_tien,lo_gioi_duong,kich_thuoc"),
    ("- Đừng nhầm mã số căn", HE),
    ("- DUYỆT BẢN NHÁP (theo trạng thái)", "tra:duyet_ban_nhap,duyet_trich_dan"),
    ("- LỜI XÃ GIAO", "tra:loi_xa_giao,loi_xa_giao_trich_dan"),
    ("- KHÁCH HỎI VỀ GÌ", "tra:hoi_ve"),
    ("- HỎI PHÁP LÝ / THỦ TỤC / THUẾ PHÍ", "tra:hoi_phap_ly,phap_ly_trich_dan,phap_ly_nhay_cam"),
    ("- KHÁCH TỰ XƯNG", "tra:xung_ho,xung_ho_trich_dan"),
    ("- BOT VỪA HỎI GÌ", "tra:bot_vua_hoi"),
    ("- XIN XEM BẢN VẼ", "tra:xin_xem_ban_ve,ban_do_du_an"),
    ("- HỎI THÔNG TIN DỰ ÁN", "tra:cau_hoi_du_an"),
    ("- TẢ DỰ ÁN", "tra:mo_ta_du_an"),
    ("- XIN GẶP NGƯỜI THẬT", "tra:can_nguoi_that"),
    ("- NGOÀI VÙNG NHẬN TIN", "tra:ngoai_vung,ngoai_vung_trich_dan"),
    ("- KHÁCH BẢO ĐĂNG", "tra:xin_dang"),
    ("- KHÁCH DẶN CÁCH VIẾT BẢN TIN", "tra:yeu_cau_viet"),
    ("- GIÁ TRỊ Ô LÀ CỤM DỮ LIỆU", HE),
    ("- XÁC NHẬN XOÁ", "tra:xac_nhan_xoa,xac_nhan_trich_dan"),
    ("- ĐỊA CHỈ ĐẦY ĐỦ", HE),
    ("- TIN HỆ THỐNG trong ngoặc vuông", HE),
    ("Trả về JSON đúng schema.", BO),       # đường công cụ không trả JSON
]

# Luật nạp SẴN theo TRẠNG THÁI hội thoại (code quyết, không đoán chữ khách) — đỡ một lần gọi tra cho việc chắc chắn đụng tới lượt này.
NAP_THEO_TRANG_THAI = {
    "listing_proposed": ("duyet_ban_nhap",),
    "pending_destructive": ("xac_nhan_xoa",),
    "cau_hoi_cho": ("tra_loi_khach_hoi",),
}


def _khoi(form: str) -> list[str]:
    """Cắt form thành khối: đoạn cách nhau bằng dòng trống; trong đoạn, dòng cột 0 bắt đầu "- " hay dòng tiêu đề cột 0 kết bằng ":" mở khối
    mới (dòng nối tiếp thụt lề đi theo khối trước)."""
    ra: list[str] = []
    for doan in form.split("\n\n"):
        cur: list[str] = []
        for dong in doan.split("\n"):
            if cur and (dong.startswith("- ") or (dong[:1] not in ("", " ") and dong.rstrip().endswith(":"))):
                ra.append("\n".join(cur))
                cur = []
            cur.append(dong)
        if cur:
            ra.append("\n".join(cur))
    return ra


def _noi_den(khoi: str) -> str:
    dau = khoi.lstrip("\n")
    for tien_to, noi in BANG_LUAT:
        if dau.startswith(tien_to):
            return noi
    return HE


def chia_luat(form: str | None = None) -> dict[str, Any]:
    """{"he": [khối], "cc": {công cụ: [khối]}, "tra": {khoá: [khối]}, "bo": [khối]} — bảng "luật → nằm ở đâu" (một nguồn cho prompt và test)."""
    from .prompts import OPERATIONS_SYSTEM_BAN, SLANG_NOTES
    form = OPERATIONS_SYSTEM_BAN if form is None else form
    ra: dict[str, Any] = {"he": [], "cc": {}, "tra": {}, "bo": []}
    if SLANG_NOTES in form:   # từ điển + kiến thức nghề: phần cố định (`co_dinh_ban`) đã mang — không lặp (SRS-504)
        form = form.replace(SLANG_NOTES, "")
        ra["bo"].append(SLANG_NOTES)
    for k in _khoi(form):
        if not k.strip():
            continue
        noi = _noi_den(k)
        if noi in (HE, BO):
            ra[noi].append(k)
        elif noi.startswith("cc:"):
            ra["cc"].setdefault(noi[3:], []).append(k)
        else:
            for khoa in noi[4:].split(","):
                ra["tra"].setdefault(khoa, []).append(k)
    return ra


def _mo_ta_schema(schema: dict[str, Any]) -> dict[str, str]:
    """Mô tả NGUYÊN của từng khoá trong schema form bán gọn: ô tin (fields) và khoá cấp kế hoạch."""
    p = schema["properties"]
    ra = {k: str(v.get("description") or "") for k, v in p.items() if k != "operations"}
    for k, v in (p["operations"]["items"]["properties"]["fields"].get("properties") or {}).items():
        ra[k] = str(v.get("description") or "")
    return ra


def tra_luat(o: str, schema: dict[str, Any], chia: dict[str, Any]) -> str:
    o = str(o or "").strip()
    mo_ta = _mo_ta_schema(schema)
    khoi = chia["tra"].get(o, [])
    if not khoi and o not in mo_ta:
        return "Không có khoá này. Khoá có luật riêng: " + ", ".join(sorted(chia["tra"])) + "; còn lại xem mô tả trong công cụ."
    ra = [f"Khoá {o}: {mo_ta[o]}"] if mo_ta.get(o) else []
    return "\n".join(ra + [k.strip("\n") for k in khoi]) or f"Khoá {o}: không có luật riêng ngoài mô tả trong công cụ."


def _cong_cu_ghi(schema: dict[str, Any]) -> list[dict[str, Any]]:
    """Năm công cụ ghi, đầu vào cắt từ schema form bán gọn (không viết lại định nghĩa ô) — chuyển từ agent_boc.py (SRS-310, gỡ ở SRS-5.1zzzzzzz371)."""
    from .prompts import SU_THAT_CAN
    p = schema["properties"]
    op = p["operations"]["items"]["properties"]
    lay = lambda *ks: {k: copy.deepcopy(op[k]) for k in ks if k in op}
    bo = {"op": {"type": "string", "enum": ["remove", "keep_only", "clear"],
                 "description": "remove = bỏ vài căn; keep_only = chỉ giữ vài căn; clear = ngưng rao cả rổ."}, **lay("targets")}
    y = {k: copy.deepcopy(v) for k, v in p.items() if k != "operations"}
    return [
        {"name": "ghi_o", "description": "Ghi / sửa ô tin của MỘT căn (căn đang khai nếu target trống).",
         "input_schema": {"type": "object", "properties": lay("target", "fields", "bang_chung", "is_rental"), "required": ["fields", "bang_chung"]}},
        {"name": "them_can", "description": "Mở căn MỚI khác căn đang khai (cần can_khac_trich), kèm ô của căn đó.",
         "input_schema": {"type": "object", "properties": lay("targets", "fields", "bang_chung", "can_khac_trich", "is_rental"),
                          "required": ["can_khac_trich"]}},
        {"name": "doi_trang_thai", "description": "Đổi trạng thái giao dịch của một căn (đã bán, đã cọc, ngưng rao, rao lại…).",
         "input_schema": {"type": "object", "properties": lay("target", "status", "trich_dan_can"),
                          "required": ["status"]}},
        {"name": "bo_can", "description": "Ngưng rao (ẩn, giữ dữ liệu) vài căn / chỉ giữ vài căn / cả rổ — hệ thống hỏi khách xác nhận trước.",
         "input_schema": {"type": "object", "properties": bo, "required": ["op"]}},
        # SRS-5.1zzzzzzz519 (chat thử 17/11 trên Gemini flash-lite: khách nói "sổ hồng riêng", "trong hẻm", "ngang 4 dài 16" mà không mã nào
        # được ghi): sự thật của căn là trường tuỳ chọn nên model yếu bỏ qua cả cụm. Nay BẮT BUỘC trả đủ từng mã (chưa nói thì "chua_ro") —
        # engine vẫn chỉ nhận mã có cụm trích nằm trong lời khách (`_ghi_su_that_can`).
        {"name": "ghi_y_khach", "description": "Ý khách lượt này ngoài ô tin: vai, ý định, duyệt bản nháp, xin đăng, hỏi về, cần người thật…",
         # SRS-5.1zzzzzzz521 (bắn thử 17/11, 2 / 3 lần mã "sổ hồng riêng" không được ghi): mã bắt buộc mà cụm trích tuỳ chọn → flash-lite
         # trả mã, bỏ cụm trích, engine loại vì thiếu bằng chứng. Nay cụm trích cũng bắt buộc (mã chua_ro thì để "").
         "input_schema": {"type": "object", "properties": y,
                          "required": [x for k, _, _ in SU_THAT_CAN if k in y for x in (k, f"{k}_trich_dan") if x in y]}},
    ]


def _chay_ghi(engine: Any, conv: Any, ten: str, vao: dict[str, Any], plan: dict[str, Any]) -> str:
    """Thân công cụ: kiểm rồi gom vào kế hoạch (chưa áp dụng). Trả lời ngắn cho model."""
    from .engine import _trich_dan_khop
    loi_khach = conv.loi_khach_luot
    if ten == "ghi_y_khach":
        for k, v in vao.items():
            if v not in (None, "", [], {}):
                plan[k] = v
        return "Đã ghi."
    if ten in ("ghi_o", "them_can"):
        fields = vao.get("fields") if isinstance(vao.get("fields"), dict) else {}
        bc = vao.get("bang_chung") if isinstance(vao.get("bang_chung"), dict) else {}
        if ten == "them_can" and not _trich_dan_khop(vao.get("can_khac_trich"), loi_khach):
            return f"{SUA}: KHÔNG mở căn mới — can_khac_trich không nằm nguyên trong lời khách. Ô của căn đang khai thì dùng ghi_o."
        sai = [k for k, v in fields.items() if isinstance(v, str) and v.strip() and k != "uu_the"
               and not _trich_dan_khop(bc.get(k), loi_khach)]
        op = {"op": "update" if ten == "ghi_o" else "add", **{k: v for k, v in vao.items() if k in ("target", "targets", "can_khac_trich", "is_rental")},
              "fields": fields, "bang_chung": bc}
        plan["operations"].append(op)
        nhan = [k for k in fields if k not in sai]
        return ("Ghi: " + (", ".join(nhan) or "-")) + (
            f". {SUA} vì cụm trích không nằm nguyên trong lời khách: {', '.join(sai)} — sửa cụm trích đúng nguyên văn rồi gọi lại, hoặc thôi."
            if sai else ".")
    if ten == "doi_trang_thai":
        op = {"op": "set_status", **{k: vao[k] for k in ("target", "status", "trich_dan_can") if vao.get(k)}}
        chua_ro = engine._chua_ro_can(conv, op)   # cùng cổng với đường áp dụng (`Engine._apply_operation`)
        if chua_ro:
            plan["_chua_ro_can"] = chua_ro
            return "KHÔNG đổi: lời khách chưa chỉ ra căn nào trong rổ (" + "; ".join(chua_ro) + "). Đừng gọi lại — lời trả lời sẽ hỏi khách căn nào."
        plan["operations"].append(op)
        return f"Đổi trạng thái: {vao.get('status')}."
    if ten == "bo_can":
        plan["operations"].append({"op": vao.get("op"), **({"targets": vao["targets"]} if vao.get("targets") else {})})
        return "Ghi nhận — hệ thống sẽ hỏi khách xác nhận trước khi ẩn."
    return "Không rõ công cụ."


def _cau_dau(mo_ta: str, tran: int = 160) -> str:
    """Câu đầu của mô tả (≤ `tran` chữ); có cắt thì kết bằng "…" — mô tả NGUYÊN trả qua tra_luat_o."""
    cau = mo_ta.split(". ", 1)[0]
    if len(cau) > tran:
        return cau[:tran].rsplit(" ", 1)[0] + "…"
    return cau + ("…" if len(cau) < len(mo_ta.rstrip(". ")) else "")


# SRS-5.1zzzzzzz506: ô tin thường gặp / dễ lẫn giữ mô tả nguyên trong ghi_o; ô hiếm (dự án, kho xưởng, thương mại, phòng trọ, đất nông
# nghiệp, ô riêng của chủ…) chỉ ghi tên khoá — tên đã nói nghĩa, mô tả đủ qua tra_luat_o; lượt hệ thống hỏi ô nào thì luật ô đó nạp sẵn.
O_THUONG = frozenset({
    "dia_chi", "dien_tich", "gia", "dien_tich_dat", "dien_tich_nha", "ket_cau", "lo_gioi_hem", "tinh_trang_ban_giao", "phap_ly_hoan_cong",
    "so_phong_ngu", "tang_toa", "ban_cong_view", "noi_that", "phi_quan_ly", "phap_ly_so_hong", "hien_trang_su_dung", "kich_thuoc", "tho_cu",
    "lo_gioi_duong", "phap_ly_so_do", "quy_hoach", "mat_tien", "dai_m", "hau_m", "phap_ly", "the_chap", "thuong_luong", "thue_phi", "huong",
    "nam_xay", "co_hdt", "thu_nhap_thue", "hd_thue_con", "thoi_han_hd", "muc_coc", "gia_chot", "tien_coc", "uu_the", "hinh_anh",
    "loai_hinh", "ma_so_can", "du_an", "duong", "phuong", "quan", "gan_nga_tu", "unit_type",
})
# Khoá ý khách giữ mô tả nguyên dù dài: nghĩa nằm ở mô tả, mã enum không tự nói đủ (SRS-493 so_ngang).
Y_GIU_NGUYEN = frozenset({"so_ngang", "user_intent", "hoi_ngoai_viec", "con_ban", "hen_lai_luc", "tam_dung_den"})   # giờ hẹn → nhắc lại


def _tra_cong_cu(chia: dict[str, Any]) -> dict[str, Any]:
    return {"name": "tra_luat_o",
            "description": "TRA CỨU luật ghi của MỘT ô tin / khoá (nguyên văn luật hệ thống). Gọi trước khi ghi ô / khoá mà luật chưa có "
                           "trong lời nhắc, hoặc khoá có mô tả rút (\"…\") / ô hiếm. Khoá có luật riêng: " + ", ".join(sorted(chia["tra"])) + ".",
            "input_schema": {"type": "object", "properties": {"o": {"type": "string", "description": "tên khoá, vd dien_tich_dat, duyet_ban_nhap"}},
                             "required": ["o"]}}


def cong_cu(schema: dict[str, Any], chia: dict[str, Any]) -> list[dict[str, Any]]:
    """Công cụ bước 1 (ghi + đọc dữ liệu của khách `DOC_BUOC_1` + tra cứu luật). Ghi: cắt từ schema form; ô tin là MỘT danh sách khoá kèm mô tả nguyên (chỉ ở ghi_o); khoá ý
    khách có luật riêng chỉ giữ câu đầu của mô tả — mô tả NGUYÊN + luật đủ trả qua tra_luat_o, không viết hai lần mỗi lượt."""
    tools = _cong_cu_ghi(schema)
    o_tin = schema["properties"]["operations"]["items"]["properties"]["fields"].get("properties") or {}
    ds_o = "; ".join(f"{k}: {v.get('description') or k}" for k, v in o_tin.items() if k in O_THUONG).rstrip(". ")
    hiem = ", ".join(k for k in o_tin if k not in O_THUONG)
    for t in tools:
        props = t["input_schema"]["properties"]
        if "fields" in props:
            props["fields"] = {"type": "object", "description": (
                "Ô tin → giá trị (chuỗi; riêng uu_the là mảng cụm nguyên văn). Chỉ dùng các khoá — " + ds_o
                + ". Ô hiếm (tên khoá tự nói nghĩa, mô tả đủ: tra_luat_o): " + hiem + ".") if t["name"] == "ghi_o"
                else "Ô tin → giá trị, cùng bộ khoá như ghi_o."}
        if t["name"] == "them_can":   # bang_chung / is_rental cùng nghĩa ghi_o — không chép mô tả hai lần
            for k in ("bang_chung", "is_rental"):
                if k in props:
                    props[k] = {**{x: y for x, y in props[k].items() if x != "description"}, "description": "Như ở ghi_o."}
        if t["name"] == "ghi_y_khach":
            t["description"] += " Mô tả khoá kết bằng \"…\" là bản rút — mô tả đủ và luật riêng: tra_luat_o(khoá)."
            for k, v in props.items():
                mo = str(v.get("description") or "")
                if not mo or k in Y_GIU_NGUYEN:
                    continue
                if k in chia["tra"] or len(mo) > 200 or (k.endswith("_trich_dan") and len(mo) > 90):
                    v["description"] = _cau_dau(mo, 90 if k.endswith("_trich_dan") else 160)
        cc = chia["cc"].get(t["name"])
        if cc:
            t["description"] += "\n" + "\n".join(k.strip("\n") for k in cc)
    return tools + [_tra_cong_cu(chia)] + [copy.deepcopy(c) for c in agent_ban.CONG_CU if c["name"] in DOC_BUOC_1]


CONG_CU_KIEN_THUC = {   # SRS-5.1zzzzzzz536: kiến thức nghề không nằm sẵn trong bước viết nữa — model tự tra khi khách hỏi
    "name": "kien_thuc_nghe",
    "description": "Tiếng nghề và kiến thức nghề BĐS (diện tích đất / sàn / sử dụng, hẻm ô tô, chữ viết tắt tin rao, pháp lý kéo theo, tên "
                   "khu dân gian). Gọi khi khách hỏi nghĩa / kiến thức chung, hoặc có chữ nghề em chưa chắc nghĩa.",
    "input_schema": {"type": "object", "properties": {}}}


def cong_cu_viet(chia: dict[str, Any]) -> list[dict[str, Any]]:
    """Công cụ bước 2: chỉ đọc + tra cứu — bước ghi đã đóng (không còn công cụ ghi để gọi). `tra_luat_o` giữ TÊN (lịch sử bước 1 có lần gọi
    nó) nhưng mô tả ngắn: bước viết hầu như không cần danh sách khoá luật (SRS-5.1zzzzzzz536, ≈ 300 token mỗi lượt)."""
    tra = {**_tra_cong_cu(chia), "description": "Luật ghi nguyên văn của một khoá ô tin (bước ghi đã xong — bước này hiếm khi cần)."}
    return [tra, copy.deepcopy(CONG_CU_KIEN_THUC)] + copy.deepcopy(agent_ban.cong_cu_fda())   # SRS-5.1zzzzzzz526: FDA không tra cứu trong lượt


HUONG_DAN_GHI = (
    "\n\n=== BƯỚC 1 — ĐỌC Ý KHÁCH VÀ GHI VÀO HỆ THỐNG (gọi công cụ; CHƯA viết lời gửi khách) ===\n"
    "Lượt này em làm HAI việc cùng lúc: ghi điều khách nói vào hệ thống và trả lời khách. Bước 1: đọc tin khách mới nhất (các tin trước chỉ là "
    "ngữ cảnh), GỌI CÔNG CỤ cho từng việc ghi — gọi hết trong MỘT lượt; luôn gọi ghi_y_khach (ít nhất user_intent). Ghi một ô / khoá mà "
    "luật chi tiết chưa có trong lời nhắc này (khối LUẬT Ô NẠP SẴN) thì gọi tra_luat_o trước. Cần dữ liệu khách đã gửi / dự án thì gọi công cụ "
    "đọc. Hệ thống áp từng lần ghi qua cổng kiểm rồi trả kết quả: đã ghi gì, bỏ ô nào vì sao, ô còn thiếu và VIỆC LƯỢT NÀY — bước 2 em mới "
    "viết lời gửi khách. Ở bước 1 KHÔNG viết lời gửi khách.\n"
    "Kết quả có dòng \"Sẽ BỎ\" (cụm trích không nằm nguyên trong lời khách) thì sửa cụm trích đúng nguyên văn rồi gọi lại, hoặc thôi.\n\n"
    "LUẬT GHI CHUNG (mọi lượt):\n"
)

HUONG_DAN_VIET = (
    "\n\n" + DAU_BUOC_2 + "\n"
    "Kết quả công cụ cuối là KẾT QUẢ GHI LƯỢT NÀY (bước 1 đã ghi, hệ thống đã áp). Đọc nó rồi viết lời gửi khách theo việc lượt này; không kể "
    "cho khách tên công cụ, tên ô hay kết quả hệ thống.\n"
)
KHAI_HOI = (   # chỉ phía bán (lưới ô hỏi chỉ xét người bán) — bước viết phía mua dùng HUONG_DAN_VIET không kèm dòng này
    "Cuối lời, xuống dòng thêm MỘT dòng cho hệ thống (khách không thấy): " + DAU_KHAI_HOI + "[{\"o\": khoá ô (dòng KHOÁ Ô của kết quả ghi), "
    "\"trich\": cụm ngắn nguyên văn trong lời em, \"khach_vua_hoi\": true nếu chỉ để làm rõ điều khách vừa hỏi, \"trich_khach\": cụm nguyên "
    "văn của khách khi đó}] — mỗi chỗ lời em hỏi / xin khách một thông tin của căn, có \"?\" hay không; không tính hỏi duyệt / đăng tin, phí, "
    "lịch xem, chấm sao, chào, chữ trong bản tin. Không hỏi gì: " + DAU_KHAI_HOI + "[]\n"
)
# SRS-5.1zzzzzzz496: bỏ câu "Bước ghi lượt này đã đóng (bước 2 chỉ còn công cụ đọc)" — bộ vàng 14/11 lời gửi khách chép nguyên ("Bước ghi đã
# đóng, em rao lại bản tin…"); bước 2 vốn chỉ được giao công cụ đọc, gọi nhầm công cụ ghi thì `chay` trả lời riêng.


def tach_khai_hoi(conv: Any, loi: str) -> str:
    """Cắt dòng tự khai ô hỏi (SRS-5.1zzzzzzz511) khỏi lời gửi khách, cất `conv.y_luot["_hoi_tu_khai"]` = (lời đã cắt, danh sách) cho lưới
    `engine._khai_o_hoi` — thay lượt gọi model soát ô hỏi riêng. Không có dòng / JSON hỏng → không cất (lưới gọi model soát như cũ)."""
    i = (loi or "").rfind(DAU_KHAI_HOI)
    if i < 0:
        return loi
    goc, duoi = loi[:i].replace(DAU_KHAI_HOI, "").rstrip(), loi[i + len(DAU_KHAI_HOI):]
    ds = None
    try:
        a, b = duoi.index("["), duoi.rindex("]")
        ds = json.loads(duoi[a:b + 1])
        goc = goc or duoi[b + 1:].strip()   # model đặt dòng khai lên đầu: lời nằm sau mảng
    except ValueError:   # json.JSONDecodeError là ValueError
        goc = goc or duoi.strip()
    if isinstance(ds, list) and goc:
        conv.y_luot["_hoi_tu_khai"] = (goc, [x for x in ds if isinstance(x, dict) and isinstance(x.get("o"), str)])
    return goc


def _he_ghi(engine: Any, conv: Any, du_lieu: str, chia: dict[str, Any]) -> str:
    from .llm.base import RANH_GIOI_CACHE
    from .prompts import co_dinh_ban, describe_captured, ten_xuong_duoi
    nap = luat_nap_san(conv, chia)
    nap_txt = ("\n=== LUẬT Ô NẠP SẴN (trạng thái hội thoại) ===\n" + "\n\n".join(nap) + "\n") if nap else ""
    he = (co_dinh_ban(conv.assistant.name) + HUONG_DAN_GHI + "\n\n".join(k.strip("\n") for k in chia["he"]) + "\n"
          + RANH_GIOI_CACHE + du_lieu + nap_txt + "\nDỮ LIỆU CĂN ĐÃ GHI (hệ thống, từ lời khách):\n" + describe_captured(conv.prop) + "\n")
    return ten_xuong_duoi(he, conv.assistant.name)   # SRS-5.1zzzzzzz504: tên trợ lý không nằm trong phần được cache


def luat_nap_san(conv: Any, chia: dict[str, Any]) -> list[str]:
    """Luật nạp SẴN theo TRẠNG THÁI hội thoại (code quyết từ dữ liệu, không đọc chữ khách): khoá theo `NAP_THEO_TRANG_THAI`, các ô bot vừa
    hỏi (`o_vua_hoi` / `cum_vua_hoi` — khách thường đáp đúng ô đó) và loại hình khi căn chưa có. Khối trùng chỉ một lần."""
    khoas: list[str] = []
    for thuoc_tinh, ks in NAP_THEO_TRANG_THAI.items():
        if getattr(conv, thuoc_tinh, None):
            khoas += list(ks)
    khoas += [o for o in [getattr(conv, "o_vua_hoi", None), *(getattr(conv, "cum_vua_hoi", None) or [])] if o]
    if not conv.prop.fields.get("loai_hinh") and not getattr(conv.prop, "loai_hinh", None):
        khoas.append("loai_hinh")
    ra: list[str] = []
    for k in dict.fromkeys(khoas):
        for khoi in chia["tra"].get(k, []):
            if khoi.strip("\n") not in ra:
                ra.append(khoi.strip("\n"))
    return ra


def _schema() -> dict[str, Any]:
    from .prompts import operations_schema_ban
    return operations_schema_ban()


def _ghi(engine: Any, conv: Any, ten: str, vao: dict[str, Any], plan: dict[str, Any], o_hop_le: set[str]) -> str:
    """Thân công cụ ghi: lọc khoá ô lạ (ô tin là danh sách khoá, không còn schema chặn) rồi qua cổng `_chay_ghi`."""
    la: list[str] = []
    if isinstance(vao.get("fields"), dict):
        la = [k for k in vao["fields"] if k not in o_hop_le]
        vao["fields"] = {k: (v if isinstance(v, (str, list)) else str(v)) for k, v in vao["fields"].items() if k in o_hop_le}
    r = _chay_ghi(engine, conv, ten, vao, plan)
    return r + (f" Khoá ô không có trong hệ thống, bỏ: {', '.join(la)}." if la else "")


# ---------------------------------------------------------------------------------------------------------------------------------------------
# Vòng chung HAI vai (SRS-5.1zzzzzzz380, chủ dự án 03/11: "một đường cho cả hai phía, sửa luật một chỗ"): bước 1 `_vong_ghi`, bước 2
# `_vong_viet`, nối báo cáo `_tin_buoc_2`. Vai chỉ khác system, bộ công cụ và thân công cụ (người bán ở file này, người mua ở `agent_mua`).
# ---------------------------------------------------------------------------------------------------------------------------------------------

def _vong_ghi(engine: Any, he: str, tin: list[dict], tools: list[dict], chay: Any, nhan: str) -> tuple[list[dict], list[str], float] | None:
    """Bước 1: model gọi công cụ ghi / tra; `chay(tên, vào, vòng) -> (kết quả, mở thêm vòng)`. Trả (kết quả công cụ lần cuối — bước 2 gửi lại
    kèm báo cáo, các công cụ đã gọi, mốc giờ) hoặc None khi dự phòng / lỗi / model không gọi công cụ nào (engine đọc bằng form JSON). `tin`
    được nối thêm tại chỗ (cuộc hội thoại công cụ cất cho bước 2)."""
    da_goi: list[str] = []
    kq: list[dict] = []
    bat_dau = time.monotonic()
    try:
        for vong in range(MAX_VONG_GHI):
            turn = engine._provider.converse(he, tin, tools, max_tokens=2048)
            if turn.stop_reason == "du_phong":
                log.warning("%s: dự phòng không gọi công cụ — đọc bằng form", nhan)
                return None
            if not turn.tool_calls:
                if vong and tin and tin[-1]["role"] == "user" and isinstance(tin[-1]["content"], list):
                    kq = tin.pop()["content"]   # kết quả vòng trước: bước 2 gửi lại kèm báo cáo (tin còn kết thúc bằng lượt gọi công cụ)
                break
            tin.append({"role": "assistant", "content": turn.assistant_content})
            kq, mo_them = [], False
            for c in turn.tool_calls:
                da_goi.append(c.name)
                r, them = chay(c.name, dict(c.input or {}), vong)
                mo_them = mo_them or them
                kq.append({"type": "tool_result", "tool_use_id": c.id, "content": r[:TRAN_KET_QUA]})
            if not mo_them or vong == MAX_VONG_GHI - 1 or time.monotonic() - bat_dau > HAN_GIAY / 2:
                break
            tin.append({"role": "user", "content": kq})
            kq = []
    except Exception as e:  # noqa: BLE001 — vòng hỏng thì đọc bằng form, lượt vẫn chạy
        log.warning("%s lỗi (%s) — đọc bằng form", nhan, type(e).__name__)
        return None
    if not da_goi:
        log.warning("%s: model không gọi công cụ nào — đọc bằng form", nhan)
        return None
    log.warning("%s bước 1: công_cụ=%s giây=%.1f", nhan, ",".join(da_goi), time.monotonic() - bat_dau)
    return kq, da_goi, bat_dau


def _tin_buoc_2(st: dict[str, Any], bao: str) -> list[dict]:
    """Cuộc hội thoại bước 1 + báo cáo sau khi áp làm kết quả công cụ ghi (lượt gọi công cụ cuối của bước 1 nhận kết quả thật)."""
    tin = list(st["tin"])
    kq = [dict(b) for b in st["kq"]]
    if kq:
        kq[0]["content"] = bao + "\n\n(Kết quả riêng của lần gọi này: " + str(kq[0]["content"]) + ")"
        tin.append({"role": "user", "content": kq})
    else:
        tin.append({"role": "user", "content": bao})
    return tin


def _vong_viet(engine: Any, he: str, tin: list[dict], tools: list[dict], chay: Any, bat_dau: float, max_tokens: int, nhan: str,
               bo_ket: tuple[str, ...] = (), tran: int = TRAN_KET_QUA) -> tuple[str, list[str], list[str]] | None:
    """Bước 2: model đánh giá báo cáo, tra thêm nếu cần (`chay(lần gọi) -> kết quả`), rồi viết lời. Trả (lời — rỗng khi hết trần chưa viết,
    kết quả tra để ghép vào lời nhắc dự phòng, công cụ đã gọi) hoặc None khi dự phòng không gọi công cụ."""
    ket: list[str] = []
    da_goi: list[str] = []
    loi = ""
    for vong in range(MAX_VONG_LOI):
        turn = engine._provider.converse(he, tin, tools, max_tokens=max_tokens)
        if turn.stop_reason == "du_phong":
            return None
        if not turn.tool_calls:
            loi = (turn.text or "").strip()
            break
        if vong == MAX_VONG_LOI - 1 or time.monotonic() - bat_dau > HAN_GIAY:
            break
        tin.append({"role": "assistant", "content": turn.assistant_content})
        kq2 = []
        for c in turn.tool_calls:
            da_goi.append(c.name)
            try:
                r = chay(c)
            except Exception as e:  # noqa: BLE001
                log.warning("%s: công cụ %s lỗi: %s", nhan, c.name, type(e).__name__)
                r = "Tra lỗi — nói thật là em chưa tra được, không đoán."
            r = str(r)[:tran]
            if c.name not in bo_ket:
                ket.append(f"[{c.name}] {r}")
            kq2.append({"type": "tool_result", "tool_use_id": c.id, "content": r})
        tin.append({"role": "user", "content": kq2})
    return loi, ket, da_goi


def mo(engine: Any, conv: Any, du_lieu: str) -> dict[str, Any] | None:
    """Bước 1 người bán. Trả kế hoạch cùng dạng form cũ (engine áp như mọi lượt) và cất cuộc hội thoại công cụ vào `conv.vong_gop` cho bước 2.
    None khi model không gọi được công cụ / lỗi (engine đọc bằng form JSON)."""
    schema, chia = _schema(), chia_luat()
    o_hop_le = set(schema["properties"]["operations"]["items"]["properties"]["fields"].get("properties") or {})
    he = _he_ghi(engine, conv, du_lieu, chia)
    tools = cong_cu(schema, chia)
    tin: list[dict] = [{"role": m.role, "content": m.content} for m in conv.messages()]
    plan: dict[str, Any] = {"operations": []}
    nguon: dict[tuple[str, str], tuple[int, int]] = {}
    project = engine.project_for(conv.prop, conv)

    def chay(ten: str, vao: dict[str, Any], vong: int) -> tuple[str, bool]:
        if ten in GHI:
            truoc = len(plan["operations"])
            r = _ghi(engine, conv, ten, vao, plan, o_hop_le)
            khoa = (ten, str(vao.get("target") or ""))
            if ten in ("ghi_o", "them_can") and len(plan["operations"]) > truoc:
                cu = nguon.get(khoa)   # gọi lại sau khi sửa cụm trích → bản mới THAY bản vòng trước
                if cu is not None and cu[0] < vong:
                    plan["operations"][cu[1]] = plan["operations"].pop()
                else:
                    nguon[khoa] = (vong, len(plan["operations"]) - 1)
            return r, SUA in r
        if ten == "tra_luat_o":
            return tra_luat(vao.get("o"), schema, chia), True
        if ten in DOC:
            try:
                return agent_ban._khoi(engine, conv, project, ten, vao).strip() or "Không có dữ liệu này.", True
            except Exception as e:  # noqa: BLE001 — tra lỗi thì nói thật
                log.warning("Agent gộp: công cụ %s lỗi: %s", ten, type(e).__name__)
                return "Tra lỗi — nói thật là em chưa tra được, không đoán.", True
        return "Không rõ công cụ.", False

    ra = _vong_ghi(engine, he, tin, tools, chay, "Agent gộp")
    if ra is None:
        return None
    kq, _da_goi, bat_dau = ra
    plan.setdefault("user_intent", "sell")
    conv.vong_gop = {"tin": tin, "kq": kq, "bat_dau": bat_dau, "schema": schema, "chia": chia}
    return plan


def mo_mua(engine: Any, conv: Any, du_lieu: str) -> dict[str, Any] | None:
    """Bước 1 người MUA (SRS-5.1zzzzzzz380): cùng vòng với người bán. System = phần cố định của prompt mua NGUYÊN VẸN (`prompts.mua_co_dinh`)
    + luật đọc ý NGUYÊN form mua gọn (`prompts.luat_doc_y_mua`) + dữ liệu lượt; công cụ ghi `agent_mua.cong_cu_ghi` (thân `agent_mua.chay_ghi`,
    ô nhu cầu qua cổng trích `Engine._loc_nhu_cau`). Trả kế hoạch cùng dạng form mua (engine áp như mọi lượt) và cất cuộc hội thoại vào
    `conv.vong_mua`; None → engine đọc bằng form JSON (Haiku)."""
    from .llm.base import RANH_GIOI_CACHE
    from .prompts import luat_doc_y_mua, mua_co_dinh, ten_xuong_duoi
    he = ten_xuong_duoi(mua_co_dinh(conv.assistant.name) + agent_mua.HUONG_DAN_GHI + luat_doc_y_mua() + "\n" + RANH_GIOI_CACHE + du_lieu,
                        conv.assistant.name)
    tin: list[dict] = [{"role": m.role, "content": m.content} for m in conv.messages()]
    plan: dict[str, Any] = {"operations": []}
    st: dict[str, Any] = {"nhan": [], "bo": {}}
    ra = _vong_ghi(engine, he, tin, agent_mua.cong_cu_ghi(),
                   lambda ten, vao, _vong: agent_mua.chay_ghi(engine, conv, ten, vao, plan, st), "Agent gộp mua")
    if ra is None:
        return None
    kq, _da_goi, bat_dau = ra
    if not plan.get("user_intent"):   # model quên ý định: có ghi nhu cầu / việc căn là đang mua, không thì để engine quyết theo vai cũ
        plan["user_intent"] = "buy" if plan.get("buyer_lead") or plan.get("mua") else "unknown"
    conv.vong_mua = {"tin": tin, "kq": kq, "bat_dau": bat_dau, **st}
    return plan


def _nhan(o: str, prop: Any) -> str:
    from .prompts import nhan_o
    try:
        return nhan_o(o, prop)
    except Exception:  # noqa: BLE001
        return o


def bao_cao(engine: Any, conv: Any, system: str, captured: list[str]) -> str:
    """Kết quả thật sau khi engine áp kế hoạch — trả cho model ở kết quả công cụ ghi (bước "Đánh giá")."""
    from .prompts import NHAN_VIEC_LUOT
    f = conv.prop.fields
    dong = ["KẾT QUẢ GHI LƯỢT NÀY (hệ thống đã áp qua cổng kiểm):"]
    da = [f'{_nhan(k, conv.prop)} = "{f.get(k)}"' for k in captured if isinstance(f.get(k), str) and f.get(k) and not k.startswith("_")]
    # 20261105 (SRS-5.1zzzzzzz386): dòng này là dữ kiện, không phải việc báo khách — nhãn cũ "ĐÃ GHI" mỗi lượt gợi model nói "em ghi rồi" mọi lượt.
    dong.append("- Ô vừa lưu (hệ thống tự lưu, không báo khách là đã ghi): " + ("; ".join(da) if da else "không ô nào")
                + (" (nhắc tới thì dùng tên đường ngắn, không đọc lại địa chỉ đầy đủ)" if da else ""))
    bo = [f'{_nhan(k, conv.prop)} = "{v}" — {ly}' for (k, v, _bc, ly) in (conv.bo_luot or []) if v not in (None, "", [], {})]
    if bo:
        dong.append("- KHÔNG GHI (bị bỏ): " + "; ".join(bo))
    for r in conv.last_receipts or []:
        if r and r[0] == "set_status":
            dong.append(f"- ĐÃ ĐỔI trạng thái: {', '.join(li.label() for li in r[2])} → {r[1]}")
        elif r and r[0] == "add":
            dong.append("- ĐÃ MỞ thêm căn: " + (", ".join(map(str, r[1])) if r[1] else "căn mới"))
        elif r and r[0] == "confirm_destructive":
            dong.append(f"- CHƯA ẩn gì — chờ khách xác nhận: {r[1]}")
    if conv.y_luot.get("chua_ro_can"):
        dong.append("- CHƯA ĐỔI trạng thái căn nào (lời khách chưa chỉ ra căn nào)")
    dau = NHAN_VIEC_LUOT + ":"
    viec = (system.rsplit(dau, 1)[1].strip().split("\n\n", 1)[0] if dau in system
            else "theo các khối ưu tiên / dữ kiện hệ thống trong lời nhắc.")
    # Việc lượt đứng ĐẦU báo cáo; ô thiếu chỉ là dữ kiện (không phải việc để hỏi) — một câu hỏi mỗi lượt do engine chọn (`viec_luot`).
    dong.insert(1, f"- {dau} {viec} (lượt này CHỈ làm đúng việc này)")
    thieu = conv.prop.missing_fields()
    if thieu:
        dong.append("- Ô còn trống (dữ kiện; hệ thống tự hỏi dần ở các lượt sau — lượt này KHÔNG hỏi ô nào ngoài việc trên): "
                    + "; ".join(_nhan(o, conv.prop) for o in thieu))
    from .schema import O_HE_THONG_TRA
    co = [k for k, v in f.items() if not k.startswith("_") and v not in (None, "", [], {})]
    dong.append(f"- KHOÁ Ô (chỉ để khai dòng {DAU_KHAI_HOI}): đã có: {', '.join(co) or '-'}; còn trống: {', '.join(thieu) or '-'}; "
                f"hệ thống tự tra: {', '.join(sorted(O_HE_THONG_TRA))}")
    return "\n".join(dong)


def viet(engine: Any, conv: Any, project: Any, system: str, captured: list[str], max_tokens: int) -> tuple[str, str]:
    """Bước 2: cùng cuộc hội thoại công cụ — đưa báo cáo sau khi áp làm kết quả công cụ ghi, model đánh giá rồi viết lời. Trả (lời, khối kết
    quả để lần soát / gọi lại của lượt dùng tiếp — như agent_ban)."""
    from .engine import _AGENT_TOOL_GUIDE
    from .llm.base import RANH_GIOI_CACHE
    st, conv.vong_gop = conv.vong_gop, None
    bao = bao_cao(engine, conv, system, captured)
    kho_du_an = project is not None and bool(getattr(project, "units", None))
    huong_dan = HUONG_DAN_VIET + KHAI_HOI + agent_ban.HUONG_DAN + (_AGENT_TOOL_GUIDE if kho_du_an else "")
    he = system.replace(RANH_GIOI_CACHE, huong_dan + RANH_GIOI_CACHE, 1) if RANH_GIOI_CACHE in system else system + huong_dan
    tools = cong_cu_viet(st["chia"]) + (engine._inventory_tools() if kho_du_an else [])
    tin = _tin_buoc_2(st, bao)

    def chay(c: Any) -> str:
        vao = dict(c.input or {})
        if c.name == "tra_luat_o":
            return tra_luat(vao.get("o"), st["schema"], st["chia"])
        if c.name == "kien_thuc_nghe":
            from .prompts import KIEN_THUC_TRA
            return KIEN_THUC_TRA
        if c.name in DOC:
            return agent_ban._khoi(engine, conv, project, c.name, vao).strip() or "Không có dữ liệu này."
        if kho_du_an:
            return engine._exec_tool(conv, project, c)
        return "Không rõ công cụ."

    from .llm.base import KHONG_NGHI_LUOT
    co = KHONG_NGHI_LUOT.set(True)   # SRS-5.1zzzzzzz483: bước viết không nghĩ thêm — bước 1 đã đọc, ghi, áp xong; phía mua giữ nghĩ (tra kho ở bước này)
    try:
        ra = _vong_viet(engine, he, tin, tools, chay, st["bat_dau"], max_tokens, "Agent gộp", bo_ket=("tra_luat_o", "kien_thuc_nghe"))
    finally:
        KHONG_NGHI_LUOT.reset(co)
    if ra is None:
        them = "".join(agent_ban._khoi(engine, conv, project, t) for t in ("ro_hang", "bo_nho_du_an", "gia_da_gui"))
        log.warning("Agent gộp: dự phòng không gọi công cụ — viết lại với đủ khối dữ liệu")
        khoi_bao = "\n\n=== " + bao + "\n"
        return (tach_khai_hoi(conv, engine._provider.reply(system + khoi_bao + them, conv.messages(), max_tokens=max_tokens).strip()),
                khoi_bao + them)
    loi, ket, da_goi = ra
    them = ("\n\n=== " + bao + "\n") + (("\n=== KẾT QUẢ EM VỪA TRA (hệ thống tra, không phải khách nói) ===\n" + "\n".join(ket) + "\n")
                                         if ket else "")
    if not loi:
        loi = engine._provider.reply(system + them, conv.messages(), max_tokens=max_tokens).strip()
    log.warning("Agent gộp bước 2: công_cụ=%s giây=%.1f", ",".join(da_goi) or "-", time.monotonic() - st["bat_dau"])
    return tach_khai_hoi(conv, loi), them


def viet_mua(engine: Any, conv: Any, system: str, next_field: str | None, viec: list[str], can: list[dict],
             max_tokens: int) -> tuple[str, list[dict]]:
    """Bước 2 người MUA (SRS-5.1zzzzzzz380): cùng cuộc hội thoại công cụ với bước 1 — báo cáo sau khi áp (`agent_mua.bao_cao`) làm kết quả
    công cụ ghi; system = prompt mua engine vừa dựng (nguyên vẹn) + dặn đánh giá + hướng dẫn tra kho; công cụ CHỈ ĐỌC (`tim_can`, `xem_can`,
    `tra_du_an`, `du_an_trong_khu` — thân `agent_mua.chay_cong_cu`). Trả (lời, các căn công cụ đã tra — để lưới soát số / ảnh biết)."""
    from .llm.base import RANH_GIOI_CACHE
    st, conv.vong_mua = conv.vong_mua, None
    bao = agent_mua.bao_cao(conv, system, next_field, viec, can, st)
    huong_dan = HUONG_DAN_VIET + agent_mua.HUONG_DAN_DOC + agent_mua.DONG_CUOI
    he = system.replace(RANH_GIOI_CACHE, huong_dan + RANH_GIOI_CACHE, 1) if RANH_GIOI_CACHE in system else system + huong_dan
    gom: list[dict] = []

    def chay(c: Any) -> str:
        if c.name in agent_mua.GHI_DU_PHONG:   # bước ghi đã đóng — không có đường ghi thứ hai
            return "Bước ghi lượt này đã đóng — không ghi; nói theo KẾT QUẢ GHI LƯỢT NÀY."
        return agent_mua.chay_cong_cu(engine, conv, c.name, dict(c.input or {}), gom)

    ra = _vong_viet(engine, he, _tin_buoc_2(st, bao), copy.deepcopy(agent_mua.CONG_CU_DOC), chay, st["bat_dau"], max_tokens,
                    "Agent gộp mua", tran=agent_mua.TRAN_KET_QUA)
    khoi_bao = "\n\n=== " + bao + "\n"
    if ra is None:
        log.warning("Agent gộp mua: dự phòng không gọi công cụ — viết lại kèm kết quả ghi")
        return engine._provider.reply(system + khoi_bao, conv.messages(), max_tokens=max_tokens).strip(), gom
    loi, ket, da_goi = ra
    conv.y_luot["_ket_qua_tra"] = "\n".join(ket)   # SRS-5.1zzzzzzz416: lưới soát số coi kết quả công cụ là nguồn (số tài chính, thuế phí)
    if not loi:
        them = khoi_bao + (("\n=== KẾT QUẢ EM VỪA TRA KHO (hệ thống tra, không phải khách nói) ===\n" + "\n".join(ket) + "\n") if ket else "")
        loi = engine._provider.reply(system + them, conv.messages(), max_tokens=max_tokens).strip()
    log.warning("Agent gộp mua bước 2: công_cụ=%s căn_tra=%d giây=%.1f", ",".join(da_goi) or "-", len(gom), time.monotonic() - st["bat_dau"])
    return loi, gom
