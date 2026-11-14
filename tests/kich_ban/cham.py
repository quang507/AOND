"""Chấm một kịch bản đã chạy (SRS-5.1zzzzzzz304) — phép chấm TẤT ĐỊNH trên kết quả lõi thật: ô tin, loại, bản tin ra ở lượt nào, lời bot có
phạm luật cứng không. Dùng chung một nguồn luật với lớp soát lời của lõi (`engine._mo_dau_da`, `xung_ho.goi_khach_la_minh`, lưới bình luận giá,
lưới số bịa) để điểm chấm khớp điều lõi đang bắt. Không chấm câu chữ / giọng."""
from __future__ import annotations

import re
import unicodedata
from typing import Any


# Thước đo cho bộ chấm (SRS-5.1zzzzzzz431: lõi đã gỡ lưới `_BINH_LUAN_GIA` ở lời chat) — chỉ đếm, không chặn.
_BINH_GIA_DO = re.compile(
    r"(thanh khoản|đắt khách|dễ bán|đắc địa|người mua tìm nhiều|nhiều người (?:hỏi|tìm|quan tâm)|"
    r"(?:mức giá|giá)(?:(?!,\s)[^.!?;\n]){0,50}?(?:hợp lý|vừa tầm|cạnh tranh|mềm|quá tốt|rất tốt|tốt lắm|tốt rồi|quá rẻ|rẻ lắm)|"
    r"(?:hợp lý|vừa tầm)(?:(?!,\s)[^.!?;\n]){0,25}?(?:mức giá|giá))", re.I)


# SRS-5.1zzzzzzz493: nhãn đầu dòng trong bản tin ("Giá: 19 tỷ", "💰 Diện tích: 80m²") — AD_FORMAT dặn ghi thẳng con số. Barem đếm, không chặn.
_NHAN_TIN = re.compile(r"(?m)^[ \t]*(?:[-•*·][ \t]*)?(?:\S{1,3}[ \t]+)?(?:Giá(?: bán| thuê)?|Diện tích|Pháp lý|Vị trí|Địa chỉ|Kết cấu|Hướng)[ \t]*:")


def bo_dau(s: object) -> str:
    t = unicodedata.normalize("NFD", str(s or "")).replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower()


def chua(gia_tri: object, mong: str) -> bool:
    """`mong` nằm trong `gia_tri` — so không dấu, không khoảng trắng, "," ≡ "." trong số ("12.5" ≡ "12,5")."""
    gon = lambda x: re.sub(r"\s+", "", bo_dau(x)).replace(".", ",")
    return bool(gia_tri) and gon(mong) in gon(gia_tri)


def cham(kb: dict[str, Any], kq: dict[str, Any]) -> list[tuple[str, bool, str]]:
    """Danh sách (tên phép chấm, đạt, ghi chú). `kq` do `scripts/cham-kich-ban.py` dựng: luot[{bot, so_bia, phạm luật…}], o, loai, cho_thue,
    so_can, xin_nguoi."""
    k, luot, o = kb.get("kiem", {}), kq["luot"], kq["o"]
    ra: list[tuple[str, bool, str]] = []
    for ten, mong in k.get("o", {}).items():
        ra.append((f"ô {ten} ∋ {mong}", chua(o.get(ten), mong), str(o.get(ten) or "—")[:60]))
    for ten in k.get("o_khong", []):
        ra.append((f"ô {ten} trống", not o.get(ten), str(o.get(ten) or "")[:60]))
    for ten, cam in k.get("o_khong_chua", {}).items():
        ra.append((f"ô {ten} ∌ {cam}", not chua(o.get(ten), cam), str(o.get(ten) or "—")[:60]))
    if "loai" in k:
        loai = str(kq.get("loai") or "")   # "dat" nhận cả "dat_tho_cu" / "dat_nong_nghiep"…
        ra.append((f"loại = {k['loai']}", loai == k["loai"] or loai.startswith(k["loai"] + "_"), loai))
    if "cho_thue" in k:
        ra.append((f"cho thuê = {k['cho_thue']}", bool(kq.get("cho_thue")) == k["cho_thue"], str(kq.get("cho_thue"))))
    if "vai" in k:
        ra.append((f"vai = {k['vai']}", kq.get("vai") == k["vai"], str(kq.get("vai"))))
    for ten, mong in k.get("mua", {}).items():   # nhu cầu người mua (buyer_lead + các bộ khác), so không dấu
        ra.append((f"mua {ten} ∋ {mong}", chua((kq.get("mua") or {}).get(ten), mong), str((kq.get("mua") or {}).get(ten) or "—")[:60]))
    if "so_nhu_cau" in k:
        ra.append((f"số bộ nhu cầu ≥ {k['so_nhu_cau']}", (kq.get("so_nhu_cau") or 0) >= k["so_nhu_cau"], str(kq.get("so_nhu_cau"))))
    if "so_can" in k:
        ra.append((f"số căn = {k['so_can']}", kq.get("so_can") == k["so_can"], str(kq.get("so_can"))))
    if k.get("xin_nguoi"):
        ra.append(("báo người thật", bool(kq.get("xin_nguoi")), ""))
    dau_nhap = next((i for i, l in enumerate(luot, 1) if "📋" in (l["bot"] or "")), None)
    if "nhap_truoc" in k:
        ra.append((f"bản tin ở lượt ≤ {k['nhap_truoc']}", dau_nhap is not None and dau_nhap <= k["nhap_truoc"], f"lượt {dau_nhap}"))
    if k.get("khong_nhap"):
        ra.append(("không soạn bản tin", dau_nhap is None, f"lượt {dau_nhap}"))
    for mau in k.get("cam", []):
        lo = [i for i, l in enumerate(luot, 1) if re.search(mau, l["bot"] or "", re.I)]
        ra.append((f"không có /{mau}/", not lo, f"lượt {lo}" if lo else ""))
    if "ban_tin_khong" in k:   # SRS-5.1zzzzzzz320: chỉ soi phần BẢN TIN (sau 📋) mọi lượt — lời chat được nhắc tới chữ đó
        lo = [i for i, l in enumerate(luot, 1) if "📋" in (l["bot"] or "") and re.search(k["ban_tin_khong"], l["bot"].split("📋", 1)[1], re.I)]
        ra.append((f"bản tin không có /{k['ban_tin_khong']}/", not lo, f"lượt {lo}" if lo else ""))
    for so, mau in k.get("luot", {}).items():
        i = int(so)
        bot = luot[i - 1]["bot"] if i <= len(luot) else ""
        ra.append((f"lượt {i} có /{mau}/", re.search(mau, bot or "", re.I) is not None, (bot or "")[:50].replace("\n", " ")))
    for so, mau in k.get("luot_khong", {}).items():
        i = int(so)
        bot = luot[i - 1]["bot"] if i <= len(luot) else ""
        ra.append((f"lượt {i} không có /{mau}/", re.search(mau, bot or "", re.I) is None, (bot or "")[:50].replace("\n", " ")))
    if "trang_thai" in k:
        ra.append((f"trạng thái ∋ {k['trang_thai']}", chua(kq.get("trang_thai"), k["trang_thai"]), str(kq.get("trang_thai"))))
    # Luật cứng chung mọi kịch bản — đếm số lượt phạm trên LỜI CUỐI gửi khách (sau khi lõi đã gọi lại).
    # SRS-5.1zzzzzzz350: phép "gọi khách mình" chuyển sang giám khảo đọc nghĩa (`goi_minh` trong scripts/cham-kich-ban.py) — bản regex
    # bắt oan "theo ý mình" / "đứng tên mình" trong BẢN TIN (nói với người mua) và "mình" nghĩa CHÚNG TA, cả hai đều đúng luật
    # (CLAUDE.md: cấm "mình" ĐẠI TỪ NGÔI HAI; cho phép nghĩa chúng ta). Ô `minh` vẫn tính để tra cứu, không còn là phép chấm ở đây.
    for ten, khoa in (("không mở \"Dạ\"", "da"), ("không bình luận giá", "binh_gia"),
                      ("bản tin không có số bịa", "so_bia"), ("tối đa 1 câu hỏi / lượt", "nhieu_hoi"),
                      ("không mở bằng câu ghi nhận", "ghi_nhan"), ("không mở giống lượt trước", "lap_mo_dau")):
        lo = [i for i, l in enumerate(luot, 1) if l.get(khoa)]
        ra.append((ten, not lo, f"lượt {lo}" if lo else ""))
    return ra


def loi_pham(bot: str, truoc_do: str = "") -> dict[str, Any]:
    """Các luật trên một lời bot (lõi đã soát xong): luật cứng + hai luật giọng mà chế độ soát gọn (SRS-298) chỉ ghi log — câu ghi nhận và mở
    đầu giống lời bot lượt trước. Không có 📋 mà quá một dấu hỏi = hỏi nhiều ý một lượt."""
    from aioi.engine import _cung_mo_dau, _mo_dau_da, _mo_dau_ghi_nhan
    from aioi.xung_ho import goi_khach_la_minh
    truoc = (bot or "").split("📋", 1)[0]
    return {"da": _mo_dau_da(bot), "minh": goi_khach_la_minh(bot or ""), "binh_gia": bool(_BINH_GIA_DO.search(bot or "")),
            "nhieu_hoi": "📋" not in (bot or "") and truoc.count("?") > 1, "ghi_nhan": _mo_dau_ghi_nhan(bot or ""),
            "lap_mo_dau": bool(truoc_do) and _cung_mo_dau(bot or "", truoc_do),
            "nhan_tin": "📋" in (bot or "") and bool(_NHAN_TIN.search((bot or "").split("📋", 1)[1]))}
