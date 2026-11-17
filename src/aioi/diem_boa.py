"""Điểm chất lượng của bốn mảng BOA — ảnh · pháp lý · vị thế · giá — SRS-5.1zzzzzzz520 (chủ dự án 17/11/2026: "có docs thì làm đi";
bộ `docs/agents/` của anh Luận, `boa.md` §3: "mỗi chuyên môn trả về một điểm chất lượng → cộng vào Điểm uy tín của tin").

Mỗi mảng một số 0–1, tính TIỀN ĐỊNH từ điều chủ đã nói / giấy đã đọc (không gọi model). Mảng chưa có gì để chấm thì không có khoá — ô còn
trống đã mất điểm ở phần đủ ô, không trừ hai lần. Một cơ chế cho cả bốn mảng, như điểm ảnh từ SRS-424 ("đừng khó quá"): điểm chất lượng chỉ
chỉnh mục của nó trong khoảng 0,75–1, không bao giờ về 0.
- Lượt chat: `engine.do_du_tin` (điểm tin bot nói với chủ).
- DB: lúc ghi tin, bộ điểm đi theo `listings.boc_tach._diem_boa`; `diem_tin` nhân bốn mục pháp lý / giá / tiềm năng / ảnh với
  0,75 + 0,25 × điểm (migration 20261117a) → `diem_nguoi_ban` → hạng người rao.
- Vòng nền `hoi_sau_dang` xét tin điểm thấp trước (`trung_binh`)."""
from __future__ import annotations

import json
from typing import Any

from .schema import FACETS, loai_phap_ly

MANG = ("anh", "phap_ly", "vi_the", "gia")
KHOA_LUU = "_diem_boa"
# Thang pháp lý của anh Luận (boa-phaply.md, chắc → yếu): sổ riêng → sổ chung → chờ sổ → giấy tay. "Có sổ +, ảnh sổ ++, hoàn công +, vi bằng −".
BAC_GIAY = {"so_hong_rieng": 0.6, "so_hong": 0.5, "so_hong_chung": 0.4, "hdmb": 0.3, "dang_lam": 0.3, "dat_thue": 0.3, "uy_quyen": 0.2,
            "giay_tay": 0.0, "chua_co": 0.0}
CONG_ANH_SO = 0.3      # ảnh sổ bot đã đọc (số thửa / số tờ)
CONG_HOAN_CONG = 0.1   # đã hoàn công; loại không có chuyện hoàn công (đất, căn hộ) thì được luôn
O_VI_THE = next(ks for fid, _, ks in FACETS if fid == "vi_the")
VI_THE_DU = 3          # ba điểm vị thế cụ thể (hẻm / lộ giới, hướng, view, góc, hợp kinh doanh, chỗ đậu xe…) là trọn
GIA_CO, GIA_SO_SANH, GIA_THUONG_LUONG = 0.4, 0.3, 0.3   # có giá · chủ đã xem căn đang rao gần · rõ còn thương lượng hay không


def chat_luong_boa(li: Any) -> dict[str, float]:
    """{mảng: 0–1} của một căn. Chỉ có khoá của mảng đã có thứ để chấm."""
    from .engine import chat_luong_anh
    prop = li.prop
    f = prop.fields
    ra: dict[str, float] = {}
    anh = chat_luong_anh(li)
    if anh is not None:
        ra["anh"] = anh
    loai = None if prop.is_rental else loai_phap_ly(f)
    if loai is not None:
        d = BAC_GIAY.get(f.get("_phap_ly_trang_thai") or "", 0.0)
        if f.get("_da_doc_so") or f.get("so_thua") or f.get("so_to"):
            d += CONG_ANH_SO
        if f.get("_hoan_cong") == "da_hoan_cong" or "phap_ly_hoan_cong" not in prop.expected_fields():
            d += CONG_HOAN_CONG
        ra["phap_ly"] = min(d, 1.0)
    if f.get("gia"):
        da_hoi = set((f.get("_sau_da_hoi") or "").split(","))
        ra["gia"] = GIA_CO + (GIA_SO_SANH if "sau:so_sanh" in da_hoi else 0) + (GIA_THUONG_LUONG if f.get("thuong_luong") else 0)
        ra["vi_the"] = min(sum(1 for k in O_VI_THE if f.get(k)) / VI_THE_DU, 1.0)   # có giá = tin đã thành hình, mới chấm vị thế
    return {k: round(v, 2) for k, v in ra.items()}


def chuoi_luu(li: Any) -> str | None:
    """Chuỗi JSON ghi vào `boc_tach._diem_boa` (None = chưa có mảng nào để chấm)."""
    d = chat_luong_boa(li)
    return json.dumps(d, sort_keys=True) if d else None


def trung_binh(chuoi: Any) -> float:
    """Điểm chung của một tin từ chuỗi đã lưu — tin chưa chấm hay chuỗi hỏng tính 0 (xét trước)."""
    try:
        d = json.loads(chuoi) if isinstance(chuoi, str) else chuoi
    except ValueError:
        return 0.0
    so = [float(v) for k, v in (d or {}).items() if k in MANG and isinstance(v, (int, float))] if isinstance(d, dict) else []
    return sum(so) / len(MANG) if so else 0.0
