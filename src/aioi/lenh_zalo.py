"""Lệnh gõ tay trên Zalo (SRS-5.1zzzzzzz211, chủ dự án 26/10/2026: "cái quit thì mình không có dùng để tắt zalo dc … sửa dùng nó để reset xóa dữ liệu
đi"; "làm cho trên zalo cũng bấm dc mấy cái này đi" — /state, /listings, /seller, /whoami, /import, /project, /link của `cli.py`).

Chỉ nhận khi CHỮ ĐẦU của tin đúng tên lệnh (không phân biệt hoa thường) — câu khách gõ có dấu "/" ở giữa ("hẻm 12/3") không phải lệnh.
Lời của lệnh xem (/state, /listings, /whoami…) là tin DEBUG: mở bằng "$$$$$ " (chủ dự án 22/10: "tin nào là tin debug … phải phân tách rõ"),
KHÔNG vào lịch sử model, KHÔNG ghi CRM — nạp lại phiên sau khởi động lại không kéo chúng vào lời bot. `/quit` xoá sạch phiên của chính người gõ,
im lặng như lệnh `$$$$$` cũ (chủ dự án 22/10: "không cần thông báo"). `/link <url>` chỉ bỏ chữ lệnh rồi đi đường tin thường.
`trang_thai()` cũng là `/state` của `cli.py` — một nguồn, hai chỗ dùng."""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from .engine import Engine

DAU_DEBUG = "$$$$$ "
TEN_LENH = ("/quit", "/state", "/listings", "/whoami", "/seller", "/import", "/project", "/link")
DAI_TOI_DA = 1500   # mỗi bong bóng Zalo — tin /state dài thì tách theo căn


@dataclass
class KetQuaLenh:
    replies: list[str]            # bong bóng gửi lại (rỗng = im lặng)
    text_moi: str | None = None   # /link: tin đi tiếp đường thường với chữ này


def ten_lenh(text: str) -> str | None:
    dau = (text or "").strip().split(maxsplit=1)
    return dau[0].lower() if dau and dau[0].lower() in TEN_LENH else None


def _goi_bong(dong: list[str]) -> list[str]:
    """Gộp các dòng thành bong bóng ≤ DAI_TOI_DA ký tự, mỗi bong bóng mở bằng dấu debug."""
    bong, cur = [], ""
    for d in dong:
        if cur and len(cur) + len(d) + 1 > DAI_TOI_DA:
            bong.append(cur)
            cur = ""
        cur = f"{cur}\n{d}" if cur else d
    if cur:
        bong.append(cur)
    return [DAU_DEBUG + b for b in bong]


def trang_thai(engine: "Engine", user: str) -> list[str]:
    """Mọi thứ AOND đã bóc tách cho người này: từng căn trong rổ (ô theo facet + đủ rao chưa), giá riêng người rao gửi, kiến thức dự án chung."""
    conv = engine.conversation(user)
    dong = ["AOND ĐÃ BÓC TÁCH ĐƯỢC", f"Người: {user} · vai: {conv.role} · loại khách: {conv.user_type.value}",
            f"RỔ HÀNG ({len(conv.listings)} căn)"]
    for i, li in enumerate(conv.listings, 1):
        active = " ← đang nhập" if li.listing_id == conv.active_listing_id else ""
        thieu = li.prop.thieu_toi_thieu()
        rao = "đủ để RAO ✓" if not thieu else f"CHƯA đủ rao (cần {', '.join(thieu)})"
        dong.append(f"[{i}] {li.label()}{active} — {rao}")
        if li.prop.loai_hinh:
            dong.append(f"   loại hình: {li.prop.loai_hinh}")
        for _fid, label, kv in li.prop.by_facet():
            dong.append(f"   • {label}: " + " · ".join(f"{k}={v}" for k, v in kv.items()))
    if conv.price_book:
        dong.append(f"GIÁ ĐÃ LƯU (riêng người rao, {len(conv.price_book)} căn)")
        for row in conv.price_book.values():
            dong.append(f"   căn {row.get('ma_so_can', '?')} ({row.get('unit_type', '?')}): {row.get('gia_goi') or row.get('gia') or '?'}")
    if conv.role == "buyer" and conv.buyer_lead is not None:
        bl = conv.buyer_lead
        nhu_cau = {"giao dịch": bl.loai_giao_dich, "loại": bl.loai_bds, "ngân sách": bl.ngan_sach, "khu vực": bl.khu_vuc,
                   "phòng ngủ": bl.so_phong_ngu}
        dong.append("NHU CẦU MUA: " + (" · ".join(f"{k}={v}" for k, v in nhu_cau.items() if v) or "chưa có"))
        for khac in conv.nhu_cau_khac:   # SRS-5.1zzzzzzz286: các bộ nhu cầu đã cất
            dong.append(f"   bộ khác «{khac.fields.get('nhu_cau') or khac.muc_dich or '?'}»: "
                        + (" · ".join(f"{k}={v}" for k, v in (("loại", khac.loai_bds), ("ngân sách", khac.ngan_sach),
                                                                ("khu vực", khac.khu_vuc)) if v) or "chưa có"))
    project = engine.project_for(conv.prop)
    if project is None:
        for li in conv.listings:
            p = engine._projects.get(li.prop.fields.get("du_an"))
            if p is not None:
                project = p
                break
    if project is not None:
        dong.append(f"KIẾN THỨC DỰ ÁN: {project.name} (CHUNG)")
        dong += [f"   • {x}" for x in project.facts()]
        for ut in project.unit_types:
            dong.append(f"   mẫu {ut.name}: " + ("; ".join(ut.facts()) if ut.specs else "(chưa có thông số)"))
        dong.append(f"   danh mục căn: {len(project.units)} · tài liệu: {', '.join(d.get('title', '?') for d in project.docs) or '(chưa có)'}")
    return _goi_bong(dong)


def ro_hang(engine: "Engine", user: str) -> list[str]:
    conv = engine.conversation(user)
    dong = [f"Rổ hàng ({len(conv.listings)} căn)"]
    for i, li in enumerate(conv.listings, 1):
        dong.append(f"{i}. {li.label()}{' ← đang nhập' if li.listing_id == conv.active_listing_id else ''}")
    return _goi_bong(dong)


def toi_la(engine: "Engine", user: str) -> list[str]:
    conv = engine.conversation(user)
    so = "tư vấn" if conv.so_nhan else "ký gửi"
    return _goi_bong([f"Người: {user} · trợ lý: {conv.assistant.name} · số Zalo: {so} · vai: {conv.role} · rổ hàng: {len(conv.listings)} căn"])


def chay(engine: "Engine", user: str, text: str, huy_nhac: Callable[[str], None] | None = None) -> KetQuaLenh | None:
    """Chạy lệnh nếu tin là lệnh; không phải lệnh → None (tin đi đường thường)."""
    lenh = ten_lenh(text)
    if lenh is None:
        return None
    phan_con = text.strip()[len(lenh):].strip()
    if lenh == "/quit":
        so_nhan = engine.conversation(user).so_nhan   # số Zalo khách đang nhắn — xoá dữ liệu, không xoá số
        if huy_nhac is not None:
            huy_nhac(user)
        engine.reset(user)
        engine.conversation(user).so_nhan = so_nhan
        return KetQuaLenh([])
    if lenh == "/state":
        return KetQuaLenh(trang_thai(engine, user))
    if lenh == "/listings":
        return KetQuaLenh(ro_hang(engine, user))
    if lenh == "/whoami":
        return KetQuaLenh(toi_la(engine, user))
    if lenh == "/seller":
        return KetQuaLenh(_goi_bong(["/seller chỉ dùng ở cli.py: trên Zalo mỗi số Zalo là một người, không đổi được."]))
    if lenh == "/link":
        return KetQuaLenh([], text_moi=phan_con) if phan_con else KetQuaLenh(_goi_bong(["Cách dùng: /link <đường dẫn>"]))
    if lenh == "/import":
        if not phan_con.startswith(("http://", "https://")):
            return KetQuaLenh(_goi_bong(["Cách dùng trên Zalo: /import <link bảng tính> (Google Sheets / .xlsx / .csv)."]))
        try:
            n = engine.import_from_url(user, phan_con.split()[0])
        except Exception as e:  # noqa: BLE001 — link hỏng không được làm hỏng lượt
            return KetQuaLenh(_goi_bong([f"Không nhập được: {type(e).__name__}"]))
        return KetQuaLenh(_goi_bong([f"Đã nhập {n} căn vào rổ hàng."]))
    # /project <mô tả>
    if not phan_con:
        return KetQuaLenh(_goi_bong(["Cách dùng: /project <mô tả dự án — tên, chủ đầu tư, vị trí, tiện ích…>"]))
    proj = engine.register_project_from_text(phan_con, voter=user)
    if proj is None:
        return KetQuaLenh(_goi_bong(["Không nhận ra tên dự án trong mô tả."]))
    # SRS-5.1zzzzzzz249: /project là lời của người gõ — admin ghi thẳng kho chung, người khác là một phiếu theo hạng (chờ đủ điểm).
    admin = engine._ma_phieu(user).startswith("chac_chan:")
    return KetQuaLenh(_goi_bong([f"{'Đã ghi vào kho chung' if admin else 'Đã ghi nhận phiếu (chờ đủ người xác nhận)'}: dự án {proj.name} · "
                                 f"tiện ích trong kho: {', '.join(proj.amenities) or '—'}"
                                 + (f" · đang chờ: {len(proj.pending())} ý" if proj.pending() else "")]))
