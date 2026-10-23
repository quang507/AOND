"""SRS-5.1zzzzzzz150 (23/10/2026) — chủ dự án: "lúc người ta tìm mua có cơ chế nhắc khi có căn mới vừa tiêu chí ko, nhắn thẳng vào zalo" →
"khung giờ 8–20 giờ, căn vượt ngân sách một chút báo luôn". Đỏ khi: nhắn ngoài khung giờ, báo căn sai khu vực / vượt quá 15 % ngân sách, báo hai tin
trong 24 giờ cho một khách, báo một căn hai lần, quên ghi sổ `reminders`, hoặc gửi hụt mà không gỡ dòng giữ chỗ (căn đó sẽ không bao giờ được báo lại)."""
import re
import urllib.parse
from datetime import datetime, timedelta, timezone

from aioi import bao_can_moi
from aioi.supabase_store import SupabaseConversationStore

UTC = timezone.utc
TRUA = datetime(2026, 10, 23, 5, 0, tzinfo=UTC)        # 12:00 giờ Việt Nam
KHUYA = datetime(2026, 10, 23, 15, 0, tzinfo=UTC)      # 22:00 giờ Việt Nam
NGAN = {"id": "b1", "name": "Ngân", "zalo_user_id": "zl-ngan",
        "preferences": {"khu_vuc": "Quận 5", "loai_bds": "nha_pho", "ngan_sach": "tầm 7 tỷ", "loai_giao_dich": "mua",
                        "yeu_cau_xe_hoi": "hẻm xe hơi"}}


def tin(id_, code, gia, quan="Quận 5", loai="nha_pho", access="hem_xe_hoi", deal="ban"):
    return {"id": id_, "code": code, "property_type": loai, "deal": deal, "street": "Trần Phú", "ward": "Phường 4", "district": quan,
            "area_m2": 60.0, "price_raw": f"{gia / 1e9:g} tỷ", "price_vnd": int(gia), "bedrooms": 3, "access_type": access,
            "car_in_house": False, "status": "dang_ban", "updated_at": "2026-10-23T04:00:00+00:00"}


class KhoGia(SupabaseConversationStore):
    """PostgREST giả: đủ bộ lọc `can_moi_khop` dùng; sổ `reminders` có trạng thái."""
    def __init__(self, tins, khach=(NGAN,)):
        super().__init__(url="https://x.invalid", key="k")
        self.tins, self.khach, self.reminders, self.n = list(tins), list(khach), [], 0

    def _request(self, method, endpoint, data=None, prefer=None):
        bang = endpoint.split("?")[0]
        q = urllib.parse.unquote(endpoint.split("?", 1)[1]) if "?" in endpoint else ""
        if method == "POST" and bang == "rpc/parse_vnd":
            m = re.search(r"(\d+(?:[.,]\d+)?)\s*tỷ", data["p"])
            return int(float(m.group(1).replace(",", ".")) * 1e9) if m else None
        if method == "POST" and bang == "reminders":
            self.n += 1
            r = {"id": f"r{self.n}", "created_at": (data.get("sent_at") or ""), **data}
            self.reminders.append(r)
            return [r]
        if method == "DELETE" and bang == "reminders":
            i = q.split("id=eq.")[1]
            self.reminders = [r for r in self.reminders if r["id"] != i]
            return None
        if method != "GET":
            return None
        if bang == "listings" and "created_at=gte" in q:
            return [{"id": t["id"]} for t in self.tins]
        if bang == "listings":
            rows = [t for t in self.tins if f"id=in.({t['id']}" in q or f",{t['id']}" in q or f"({t['id']})" in q]
            if "deal=eq.ban" in q:
                rows = [t for t in rows if t["deal"] == "ban"]
            if (m := re.search(r"property_type=eq\.(\w+)", q)):
                rows = [t for t in rows if t["property_type"] == m.group(1)]
            if (m := re.search(r"price_vnd=lte\.(\d+)", q)):
                rows = [t for t in rows if t["price_vnd"] <= int(m.group(1))]
            if (m := re.search(r"district\.ilike\.\*(.+?)\*", q)):
                rows = [t for t in rows if m.group(1).lower() in t["district"].lower()]
            return rows
        if bang == "conversations":
            return [{"buyer_id": k["id"]} for k in self.khach]
        if bang == "buyers":
            return self.khach
        if bang == "reminders":
            return list(self.reminders)
        return []


def chay(kho, bay_gio=TRUA, gui=None, xung_ho="chi"):
    daGui = []

    def _gui(zalo, noi_dung, ten, can):
        daGui.append((zalo, noi_dung))
        return True if gui is None else gui(zalo, noi_dung, ten, can)
    ra = bao_can_moi.chay_mot_luot(kho, _gui, lambda _z: xung_ho, bay_gio)
    return ra, daGui


def test_khung_gio_8_den_20_gio_viet_nam():
    assert bao_can_moi.trong_khung_gio(datetime(2026, 10, 23, 1, 0, tzinfo=UTC))        # 08:00
    assert not bao_can_moi.trong_khung_gio(datetime(2026, 10, 23, 0, 59, tzinfo=UTC))   # 07:59
    assert bao_can_moi.trong_khung_gio(datetime(2026, 10, 23, 12, 59, tzinfo=UTC))      # 19:59
    assert not bao_can_moi.trong_khung_gio(datetime(2026, 10, 23, 13, 0, tzinfo=UTC))   # 20:00


def test_bao_can_dung_ngan_sach_ghi_so_va_xung_ho():
    kho = KhoGia([tin("l1", "SEED0001", 6.8e9)])
    ra, gui = chay(kho)
    assert len(ra) == 1 and len(gui) == 1 and gui[0][0] == "zl-ngan"
    t = gui[0][1]
    assert t.startswith("Chị ơi, em vừa có căn mới hợp nhu cầu của chị: nhà phố Trần Phú, Phường 4, Quận 5, 60m², giá 6.8 tỷ, 3 phòng ngủ.")
    assert "/nha-dat/SEED0001" in t and t.rstrip().endswith("không ạ?") and "nhỉnh" not in t
    assert len(kho.reminders) == 1 and kho.reminders[0]["kind"] == "match" and kho.reminders[0]["status"] == "sent"
    assert kho.reminders[0]["listing_id"] == "l1" and kho.reminders[0]["noi_dung_gui"] == t


def test_can_vuot_ngan_sach_mot_chut_van_bao_va_noi_ro_phan_tram():
    kho = KhoGia([tin("l1", "SEED0002", 7.7e9)])    # 7,7 / 7 = +10 %
    ra, gui = chay(kho)
    assert len(ra) == 1 and ra[0]["vuot"] == 10
    assert "Giá nhỉnh hơn ngân sách chị nêu khoảng 10%" in gui[0][1] and gui[0][1].rstrip().endswith("nhé?")


def test_khong_bao_can_vuot_qua_15_phan_tram_khac_khu_vuc_hay_thieu_xe_hoi():
    kho = KhoGia([tin("l1", "A", 8.2e9), tin("l2", "B", 6e9, quan="Quận 3"), tin("l3", "C", 6e9, access="hem_xe_may")])
    ra, gui = chay(kho)
    assert ra == [] and gui == [] and kho.reminders == []


def test_trong_hai_can_dung_ngan_sach_xep_truoc_can_vuot():
    kho = KhoGia([tin("l1", "VUOT", 7.5e9), tin("l2", "DUNG", 6.5e9)])
    _, gui = chay(kho)
    assert "/nha-dat/DUNG" in gui[0][1] and "nhỉnh" not in gui[0][1]


def test_ngoai_khung_gio_khong_nhan_va_khong_xep_hang():
    kho = KhoGia([tin("l1", "SEED0001", 6.8e9)])
    ra, gui = chay(kho, bay_gio=KHUYA)
    assert ra == [] and gui == [] and kho.reminders == []
    ra, gui = chay(kho)                       # sáng hôm sau/trong khung: đi bình thường
    assert len(gui) == 1


def test_mot_khach_mot_tin_moi_24_gio_va_mot_can_khong_bao_hai_lan():
    kho = KhoGia([tin("l1", "A", 6.8e9)])
    chay(kho)
    kho.tins.append(tin("l2", "B", 6.5e9))
    ra, gui = chay(kho, bay_gio=TRUA + timedelta(hours=5))
    assert ra == [] and gui == []                                         # chưa đủ 24 giờ
    ra, gui = chay(kho, bay_gio=TRUA + timedelta(hours=25))
    assert len(gui) == 1 and "/nha-dat/B" in gui[0][1]                    # căn mới, không nhắc lại căn A
    ra, gui = chay(kho, bay_gio=TRUA + timedelta(hours=60))
    assert ra == [] and gui == []                                         # hết căn mới chưa báo


def test_gui_hut_thi_go_dong_giu_cho_de_lan_sau_thu_lai():
    kho = KhoGia([tin("l1", "A", 6.8e9)])
    ra, gui = chay(kho, gui=lambda *_: False)
    assert ra == [] and len(gui) == 1 and kho.reminders == []
    ra, gui = chay(kho)
    assert len(ra) == 1 and len(kho.reminders) == 1


def test_khach_xung_em_thi_bot_xung_minh():
    kho = KhoGia([tin("l1", "A", 6.8e9)])
    _, gui = chay(kho, xung_ho="em")
    assert gui[0][1].startswith("Em ơi, mình vừa có căn mới hợp nhu cầu của em:") and "Em có muốn mình sắp lịch" in gui[0][1]


def test_khach_chua_neu_khu_vuc_hay_ngan_sach_thi_khong_bao():
    ngan = {**NGAN, "preferences": {"loai_bds": "nha_pho", "loai_giao_dich": "mua"}}
    kho = KhoGia([tin("l1", "A", 6.8e9)], khach=(ngan,))
    ra, gui = chay(kho)
    assert ra == [] and gui == []


def test_khong_co_tin_moi_thi_khong_goi_them_truy_van():
    kho = KhoGia([])
    ra, gui = chay(kho)
    assert ra == [] and gui == []
