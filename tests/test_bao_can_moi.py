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
        self.anh, self.loi_anh = {}, False   # mã căn → link ảnh; loi_anh: truy vấn ảnh hỏng

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
        if bang == "listing_photos_v":
            if self.loi_anh:
                raise OSError("mạng")
            ma = re.search(r"code=eq\.([^&]+)", q).group(1)
            return [{"url": u} for u in self.anh.get(ma, [])]
        return []


def chay(kho, bay_gio=TRUA, gui=None, xung_ho="chi"):
    daGui = []

    def _gui(zalo, noi_dung, ten, can, anh):
        daGui.append((zalo, noi_dung))
        kho.anh_da_gui = list(anh)
        return True if gui is None else gui(zalo, noi_dung, ten, can, anh)
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
    # SRS-5.1zzzzzzz159: bốn đoạn = bốn tin Zalo — mở lời · thông số + vì sao hợp · link · câu hỏi lịch xem
    d = bao_can_moi.tach_tin(t)
    assert len(d) == 4
    assert d[0] == "Chị ơi, em đang có căn này hợp với nhu cầu của chị nè, chị xem qua nha."
    assert d[1] == ("Nhà phố Trần Phú, Phường 4, Quận 5, 60m², giá 6.8 tỷ, 3 phòng ngủ. "
                    "Hợp vì đúng khu Quận 5, đúng loại nhà phố, giá trong ngân sách tầm 7 tỷ, xe hơi vào được.")
    assert d[2].startswith("Xem hình và chi tiết ở đây ạ: ") and d[2].endswith("/nha-dat/SEED0001")
    assert d[3] == "Chị có muốn em sắp lịch xem thử không ạ?" and "nhỉnh" not in t
    assert len(kho.reminders) == 1 and kho.reminders[0]["kind"] == "match" and kho.reminders[0]["status"] == "sent"
    assert kho.reminders[0]["listing_id"] == "l1" and kho.reminders[0]["noi_dung_gui"] == t


def test_can_vuot_ngan_sach_mot_chut_van_bao_va_noi_ro_phan_tram():
    kho = KhoGia([tin("l1", "SEED0002", 7.7e9)])    # 7,7 / 7 = +10 %
    ra, gui = chay(kho)
    assert len(ra) == 1 and ra[0]["vuot"] == 10
    d = bao_can_moi.tach_tin(gui[0][1])
    assert len(d) == 4 and d[1].endswith("Hợp vì đúng khu Quận 5, đúng loại nhà phố, xe hơi vào được. Giá nhỉnh hơn ngân sách chị nêu khoảng 10%.")
    assert "giá trong ngân sách" not in gui[0][1] and d[3].endswith("nhé?")


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
    assert gui[0][1].startswith("Em ơi, mình đang có căn này hợp với nhu cầu của em nè, em xem qua nha.") and "Em có muốn mình sắp lịch" in gui[0][1]


def test_khach_chua_neu_khu_vuc_hay_ngan_sach_thi_khong_bao():
    ngan = {**NGAN, "preferences": {"loai_bds": "nha_pho", "loai_giao_dich": "mua"}}
    kho = KhoGia([tin("l1", "A", 6.8e9)], khach=(ngan,))
    ra, gui = chay(kho)
    assert ra == [] and gui == []


def test_khong_co_tin_moi_thi_khong_goi_them_truy_van():
    kho = KhoGia([])
    ra, gui = chay(kho)
    assert ra == [] and gui == []


U = "https://x.supabase.co/storage/v1/object/public/listing-public/"


def test_can_co_anh_thi_gui_kem_toi_da_bon_anh_https():
    kho = KhoGia([tin("l1", "A", 6.8e9)])
    kho.anh["A"] = [U + "1.jpg", "http://khong-https/2.jpg", U + "1.jpg", U + "3.jpg", U + "4.jpg"]
    ra, gui = chay(kho)
    assert len(ra) == 1 and kho.anh_da_gui == [U + "1.jpg", U + "3.jpg", U + "4.jpg"]      # bỏ http, bỏ trùng
    kho2 = KhoGia([tin("l1", "B", 6.8e9)])
    kho2.anh["B"] = [U + f"{i}.jpg" for i in range(1, 7)]
    chay(kho2)
    assert kho2.anh_da_gui == [U + f"{i}.jpg" for i in range(1, 5)]                          # tối đa 4 ảnh


def test_can_chua_co_anh_hoac_loi_anh_thi_van_gui_chu():
    kho = KhoGia([tin("l1", "A", 6.8e9)])
    ra, gui = chay(kho)
    assert len(ra) == 1 and kho.anh_da_gui == [] and len(gui) == 1            # chưa có ảnh: chỉ chữ
    kho2 = KhoGia([tin("l1", "B", 6.8e9)])
    kho2.anh["B"], kho2.loi_anh = [U + "1.jpg"], True
    ra, gui = chay(kho2)
    assert len(ra) == 1 and kho2.anh_da_gui == [] and len(gui) == 1           # truy vấn ảnh hỏng không chặn tin báo


def test_bridge_send_nhan_photos_chi_https_va_dung_chung_ham_gui_anh():
    """SRS-5.1zzzzzzz151: /send của bridge nhận `photos` (chỉ https, tối đa 4) và dùng CHUNG `guiAnhQuaUrl` với luồng chat — không viết lại vòng tải ảnh."""
    import pathlib
    js = (pathlib.Path(__file__).parents[1] / "bot/bridge-zca/index.mjs").read_text()
    send = js[js.index("req.url === '/send'"):]
    assert "photos" in send.split("res.end")[0] and "startsWith('https://')" in send and ".slice(0, 4)" in send and "guiAnhQuaUrl" in send
    assert js.count("api.sendMessage({ msg: \"\", attachments: [f] }") == 1       # chỉ MỘT chỗ tải-và-gửi ảnh
    assert "for (const url of Array.isArray(photos) ? photos : []) await guiAnhQuaUrl(threadId, url);" in js


def test_gui_nhieu_tin_lan_luot_anh_di_sau_tin_co_link(monkeypatch):
    """SRS-5.1zzzzzzz159: `_gui_bao_can_moi` gửi MỖI đoạn một tin, nghỉ giữa các tin, ảnh gắn vào tin có link; lịch sử ghi đúng những đoạn đã đi."""
    from aioi import server
    di, ngu = [], []
    monkeypatch.setattr(server, "_gui_bridge", lambda zalo, text, photos=None: di.append((text, photos)) or {"anh_da_gui": len(photos or [])})
    monkeypatch.setattr(server.time, "sleep", lambda g: ngu.append(g))
    monkeypatch.setattr(server, "sync_to_supabase_async", lambda **k: None)
    tin_bao = bao_can_moi.viet_tin(tin("l1", "SEED0001", 6.8e9), "chi", bao_can_moi.nhu_cau_tu_ho_so(NGAN["preferences"]))
    ok = server._gui_bao_can_moi("zl-gui-nhieu", tin_bao, "Ngân", {"code": "SEED0001"}, [U + "1.jpg", U + "2.jpg"])
    assert ok and [t.split("\n")[0][:22] for t, _ in di] == [t.split("\n")[0][:22] for t in bao_can_moi.tach_tin(tin_bao)] and len(di) == 4
    assert [p for _, p in di] == [None, None, [U + "1.jpg", U + "2.jpg"], None]            # ảnh đi cùng tin có link (tin thứ ba), tin sau đó là câu hỏi
    assert len(ngu) == 3                                                                    # nghỉ giữa 4 tin
    assert server._engine.conversation("zl-gui-nhieu").history[-1].content == tin_bao        # lịch sử = đủ bốn đoạn


def test_tin_dau_hut_thi_khong_gui_gi_va_tin_sau_hut_thi_van_tinh_la_da_bao(monkeypatch):
    from aioi import server
    monkeypatch.setattr(server.time, "sleep", lambda g: None)
    monkeypatch.setattr(server, "sync_to_supabase_async", lambda **k: None)
    tin_bao = bao_can_moi.viet_tin(tin("l1", "SEED0002", 6.8e9), "chi", bao_can_moi.nhu_cau_tu_ho_so(NGAN["preferences"]))

    def hut_tu(n):
        goi = []

        def gui(zalo, text, photos=None):
            goi.append(text)
            if len(goi) >= n:
                raise OSError("bridge")
            return {}
        return goi, gui
    goi, gui = hut_tu(1)
    monkeypatch.setattr(server, "_gui_bridge", gui)
    assert server._gui_bao_can_moi("zl-hut-1", tin_bao, None, {"code": "SEED0002"}, []) is False and len(goi) == 1   # chưa gì tới khách → thử lại lượt sau
    goi, gui = hut_tu(3)
    monkeypatch.setattr(server, "_gui_bridge", gui)
    assert server._gui_bao_can_moi("zl-hut-3", tin_bao, None, {"code": "SEED0002"}, []) is True and len(goi) == 3      # khách đã nhận 2 tin: không gửi lại
    assert server._engine.conversation("zl-hut-3").history[-1].content == "\n\n".join(bao_can_moi.tach_tin(tin_bao)[:2])


def test_hai_tin_bao_lien_nhau_cho_mot_khach_khong_cung_van_phong():
    """SRS-5.1zzzzzzz188 (chủ dự án 26/10, ảnh chụp hai tin báo liền nhau cùng mở lời / câu link / câu hỏi: "văn phong gì trùng nhau nữa"):
    kiểu văn phong xoay theo số tin báo đã gửi cho khách — mỗi cặp tin liền nhau khác nhau ở MỌI đoạn (mở lời, chữ mở "vì sao hợp", câu link, câu hỏi),
    hết 4 kiểu thì quay lại kiểu đầu. Đỏ khi bỏ `kieu=len(mine) % SO_KIEU` trong `chay_mot_luot`."""
    kho = KhoGia([tin("l1", "A", 6.8e9)])
    tin_gui = []
    for i, ma in enumerate(["A", "B", "C", "D", "E"]):
        if i:
            kho.tins.append(tin(f"l{i + 1}", ma, 6.8e9))
        _, gui = chay(kho, bay_gio=TRUA + timedelta(hours=25 * i))
        assert len(gui) == 1, ma
        tin_gui.append(bao_can_moi.tach_tin(gui[0][1]))
    for truoc, sau in zip(tin_gui, tin_gui[1:]):
        assert len(truoc) == len(sau) == 4
        for a, b in zip(truoc, sau):
            if "/nha-dat/" in a:
                a, b = a.split(":")[0], b.split(":")[0]       # đoạn link: chỉ so câu dẫn, không so đường dẫn
            elif a.startswith(("Nhà phố", "Căn")):
                a, b = a.split(". ", 1)[1].split(" ")[0], b.split(". ", 1)[1].split(" ")[0]   # đoạn thông số: so chữ mở "vì sao hợp"
            assert a != b, (a, b)
    assert tin_gui[0][0] == tin_gui[4][0]                   # kiểu thứ 5 quay lại kiểu đầu
    assert len({t[0] for t in tin_gui[:4]}) == 4 and len({t[3] for t in tin_gui[:4]}) == 4


def test_kieu_vuot_ngan_sach_cung_xoay_va_giu_phan_tram():
    kho = KhoGia([tin("l1", "A", 7.7e9)])
    gui_ra = []
    for i, ma in enumerate(["A", "B", "C", "D"]):
        if i:
            kho.tins.append(tin(f"l{i + 1}", ma, 7.7e9))
        _, gui = chay(kho, bay_gio=TRUA + timedelta(hours=25 * i))
        gui_ra.append(gui[0][1])
    assert len(set(gui_ra)) == 4 and all("10%" in t and "/nha-dat/" in t for t in gui_ra)
    assert len({bao_can_moi.tach_tin(t)[0] for t in gui_ra}) == 4


def test_viet_tin_kieu_ngoai_khoang_thi_quay_vong_va_mac_dinh_khong_doi():
    c = {**tin("l1", "A", 6.8e9)}
    lead = bao_can_moi.nhu_cau_tu_ho_so(NGAN["preferences"])
    assert bao_can_moi.viet_tin(c, "chi", lead) == bao_can_moi.viet_tin(c, "chi", lead, kieu=0) == bao_can_moi.viet_tin(c, "chi", lead, kieu=4)
    assert bao_can_moi.viet_tin(c, "chi", lead, kieu=1) != bao_can_moi.viet_tin(c, "chi", lead, kieu=0)
    assert "Khớp ở chỗ" in bao_can_moi.viet_tin(c, "chi", lead, kieu=1)
