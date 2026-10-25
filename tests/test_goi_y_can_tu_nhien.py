"""SRS-5.1zzzzzzz145: bot giới thiệu căn cho khách MUA phải nói như người, không lộ chữ nội bộ. Chủ dự án 23/10/2026 xem chat thử: "đưa cả mã tin vậy sợ sếp chửi,
sếp thích trả lời như người", "đưa luôn link trên web", "mỗi tin 1–2 hình", "khen một cái". Lớp lỗi: prompt đưa model chữ NỘI BỘ ("RỔ", "luôn kèm mã #", "em" giữa lời
xưng "cháu") và model nói lại nguyên văn; bộ tách tin cắt sau "P." làm đứt địa chỉ; `tim_nha` nới giá 20 % mà giá không là điểm nên căn vượt ngân sách đứng trên căn đúng
ngân sách. Đỏ khi: lộ mã / "rổ" / "em" trong khối, thiếu link, căn vượt giá đứng trước, địa chỉ bị cắt giữa chừng, ảnh gửi nhầm căn / quá số lượng / gửi lại / cho người bán."""
import pytest

from aioi.anh_can import anh_can_gui_kem, ma_can_trong_loi
from aioi.anh_du_an import BoNhoAnhDaGui
from aioi.delivery import chunk_reply
from aioi.mua import SITE_URL, KhoNguoiMua, dong_can, khoi_can_cho_khach
from aioi.schema import BuyerLead


def _can(code, gia, **kw):
    return {"code": code, "property_type": "nha_pho", "street": "Phạm Văn Chiêu", "ward": "Phường An Hội Tây", "district": "Quận Gò Vấp",
            "area_m2": 56, "price_raw": f"{gia / 1e9:g} tỷ".replace(".", ","), "price_vnd": int(gia), "bedrooms": 4, **kw}


def test_khoi_can_noi_nhu_nguoi_khong_lo_chu_noi_bo():
    khoi = khoi_can_cho_khach([_can("A1", 5.5e9)])
    assert f"link {SITE_URL}/nha-dat/A1" in khoi                      # mỗi căn có link để khách xem hình / chi tiết
    assert "#A1" in khoi                                              # mã vẫn có cho thao tác (quan tâm / hẹn xem), nhưng...
    assert "KHÔNG nói mã ra lời" in khoi and "Không nói chữ \"rổ\"" in khoi   # ...cấm nói ra
    assert "RỔ" not in khoi and "luôn kèm mã" not in khoi            # chữ nội bộ cũ đã bỏ
    assert "MỘT căn tốt nhất" in khoi and "MỘT lời khen" in khoi      # SRS-160: mỗi lượt một căn, mở bằng một lời khen ngắn
    assert "nói em" not in khoi.lower()                               # "em" cứng làm model xưng lẫn với "cháu"
    rong = khoi_can_cho_khach([])
    assert "RỔ" not in rong and "nói em" not in rong.lower() and "KHÔNG bịa căn" in rong


class _Kho(KhoNguoiMua):
    is_configured = True

    def __init__(self, hang):
        self._hang = hang
        self.so_parse = 0

    def _request(self, method, endpoint, data=None, prefer=None):
        if endpoint == "rpc/parse_vnd":
            self.so_parse += 1
            return 6_000_000_000
        if endpoint == "rpc/tim_nha":
            return self._hang
        return []


def _hang(*c):
    return [{"can": x, "diem": 9 - i, "ly_do": "đúng khu vực khách chọn"} for i, x in enumerate(c)]


def test_can_vuot_ngan_sach_xep_sau_va_ghi_ro_muc_vuot():
    # đúng như chat thử 23/10: "dưới 6 tỷ" — tim_nha trả 6,2 tỷ đứng trước 5,5 tỷ
    kho = _Kho(_hang(_can("C44", 6.2e9), _can("C16", 5.5e9), _can("C43", 6.5e9)))
    can = kho.can_phu_hop(BuyerLead(loai_giao_dich="mua", ngan_sach="dưới 6 tỷ", khu_vuc="Gò Vấp"))
    assert [c["code"] for c in can] == ["C16", "C44", "C43"]          # đúng ngân sách lên trước, trong nhóm vượt giữ thứ hạng của tim_nha
    assert "_vuot_ngan_sach" not in can[0] and can[1]["_vuot_ngan_sach"] == 3 and can[2]["_vuot_ngan_sach"] == 8
    assert "VƯỢT ngân sách khách nêu khoảng 3%" in dong_can(can[1]) and "VƯỢT" not in dong_can(can[0])
    assert kho.so_parse == 1                                          # vẫn MỘT lượt parse_vnd (nhớ theo chữ), không thêm lượt gọi DB


def test_khong_co_ngan_sach_thi_giu_nguyen_thu_tu():
    kho = _Kho(_hang(_can("C44", 6.2e9), _can("C16", 5.5e9)))
    can = kho.can_phu_hop(BuyerLead(loai_giao_dich="mua", khu_vuc="Gò Vấp"))
    assert [c["code"] for c in can] == ["C44", "C16"] and not any("_vuot_ngan_sach" in c for c in can)


def test_dia_chi_viet_tat_khong_bi_cat_giua_chung():
    cau = ("1. Nhà phố Quang Trung, P. An Nhơn, Gò Vấp · 75 m² · 6,2 tỷ · 4 phòng ngủ · sổ hồng · xe hơi vào tận nơi. "
           "Lưu ý giá này hơi vượt 6 tỷ một chút.")
    chunks = chunk_reply(cau)
    assert len(chunks) >= 2 and not any(c.endswith(("P.", "Q.", "TP.")) for c in chunks)
    assert any("P. An Nhơn" in c for c in chunks)                     # địa chỉ nằm trọn trong MỘT bong bóng
    assert not any(c.endswith("TP.") for c in chunk_reply("Căn này ở TP. Hồ Chí Minh, gần chợ Bến Thành, sổ hồng riêng, hẻm xe hơi vào tận nơi nhé anh. Anh xem thử nha."))
    # câu thường vẫn tách như cũ
    assert chunk_reply("Em gửi anh hai căn nhé. Anh xem giúp em căn đầu trước, rồi mình chọn tiếp ạ. Anh rảnh lúc nào để đi xem?" * 2)[1:]


L = lambda ma: f"{SITE_URL}/nha-dat/{ma}"   # noqa: E731


def test_ma_can_doc_tu_link_theo_thu_tu_bo_trung():
    r = f"Căn này nha cô: {L('SEED0016')} còn căn này {L('seed0044')} và lại {L('SEED0016')}"
    assert ma_can_trong_loi(r) == ["SEED0016", "SEED0044"]
    assert ma_can_trong_loi("em chưa có căn nào") == []


def _goi(dong):
    def goi(ma):
        return [d for d in dong if d["code"] in ma]
    return goi


KHO_ANH = [{"code": "SEED0016", "url": f"https://x/{i}.jpg"} for i in range(5)] + [{"code": "SEED0044", "url": "https://x/44.jpg"},
                                                                                 {"code": "SEED0044", "url": "http://x/loi.jpg"}, {"code": "KHAC", "url": "https://x/k.jpg"}]


def test_anh_toi_da_hai_moi_can_dung_can_dung_thu_tu_va_chi_https():
    r = f"cô xem {L('SEED0044')} và {L('SEED0016')}"
    anh = anh_can_gui_kem("k1", "buyer", r, goi=_goi(KHO_ANH), bo_nho=BoNhoAnhDaGui())
    assert anh == ["https://x/44.jpg", "https://x/0.jpg", "https://x/1.jpg"]   # theo thứ tự bot nhắc; 0044 chỉ có 1 ảnh https; 0016 cắt còn 2
    assert not any("KHAC" in a or a.startswith("http://") for a in anh)


def test_anh_khong_gui_lai_khong_gui_cho_nguoi_ban_loi_thi_bo_qua():
    bn, r = BoNhoAnhDaGui(), f"xem {L('SEED0016')}"
    assert anh_can_gui_kem("k1", "buyer", r, goi=_goi(KHO_ANH), bo_nho=bn)
    assert anh_can_gui_kem("k1", "buyer", r, goi=_goi(KHO_ANH), bo_nho=bn) == []          # cùng khách, cùng căn: không gửi lại
    assert anh_can_gui_kem("k2", "buyer", r, goi=_goi(KHO_ANH), bo_nho=bn)                # khách khác vẫn nhận
    assert anh_can_gui_kem("k3", "seller", r, goi=_goi(KHO_ANH), bo_nho=BoNhoAnhDaGui()) == []
    assert anh_can_gui_kem("k4", "buyer", "em chưa có căn nào", goi=_goi(KHO_ANH), bo_nho=BoNhoAnhDaGui()) == []

    def hong(_):
        raise RuntimeError("mạng")
    assert anh_can_gui_kem("k5", "buyer", r, goi=hong, bo_nho=BoNhoAnhDaGui()) == []      # lỗi → không ảnh, không ném
    assert len(anh_can_gui_kem("k6", "buyer", " ".join(L(f"SEED00{n}") for n in (16, 44, 17, 18)), goi=_goi(KHO_ANH), bo_nho=BoNhoAnhDaGui())) <= 4


@pytest.mark.parametrize("ten", ["SITE_URL"])
def test_site_url_khong_phai_nhadat_cc_chua_tro_ve_web(ten):
    assert SITE_URL.startswith("https://") and "nhadat.cc" not in SITE_URL


# --- SRS-5.1zzzzzzz146: gợi ý căn TRƯỚC, hỏi thêm SAU, câu hỏi NGẮN (chủ dự án 23/10: "hỏi thêm thông tin hơi dài… gửi luôn căn gợi ý rồi sau mới hỏi") ---
def test_co_tieu_chi_can_khu_vuc_hoac_ngan_sach_loai_bds_mot_minh_chua_du():
    from aioi.mua import co_tieu_chi
    assert not co_tieu_chi(BuyerLead(loai_giao_dich="mua", loai_bds="nha_pho"))
    assert co_tieu_chi(BuyerLead(khu_vuc="Gò Vấp")) and co_tieu_chi(BuyerLead(ngan_sach="5 tỷ"))
    b = BuyerLead()
    b.fields["khu_vuc"] = "Quận 5"
    assert co_tieu_chi(b) and not co_tieu_chi(BuyerLead(khu_vuc="  "))


def test_chua_co_tieu_chi_thi_khong_goi_y_can_khong_goi_db():
    kho = _Kho(_hang(_can("C16", 5.5e9)))
    assert kho.can_phu_hop(BuyerLead(loai_giao_dich="mua", loai_bds="nha_pho")) == []   # "nhà phố" một mình: căn nào cũng khớp → không đoán
    assert kho.so_parse == 0
    chua = khoi_can_cho_khach([], chua_co_tieu_chi=True)
    assert "chưa nêu khu vực hay ngân sách" in chua and "KHÔNG nói \"chưa có căn\"" in chua
    assert "báo khi có căn" not in chua                                             # câu "chưa có căn" chỉ dành cho khách ĐÃ nêu tiêu chí
    assert "báo khi có căn" in khoi_can_cho_khach([], chua_co_tieu_chi=False)


def test_khoi_can_dat_thu_tu_khen_can_roi_moi_hoi_ngan():
    khoi = khoi_can_cho_khach([_can("A1", 5.5e9)])
    assert "BỐN ĐOẠN" in khoi and "MỘT DÒNG TRỐNG" in khoi and "khoảng 15 chữ" in khoi          # SRS-160: bốn tin, câu hỏi ngắn ở đoạn cuối
    assert "không khen lần hai ở cuối" in khoi and "KHÔNG nhắc lại" in khoi         # một lời khen mở tin, không lặp căn đã gửi
    assert khoi.index("(1) Mở lời") < khoi.index("(2) Thông số") < khoi.index("(3) Link") < khoi.index("(4) Tối đa MỘT câu hỏi")   # thứ tự: mở lời · thông số + vì sao hợp · link · hỏi


def test_prompt_mua_noi_can_truoc_hoi_sau_va_cau_hoi_ngan():
    from aioi.prompts import build_buyer_chat_system
    p = build_buyer_chat_system("Hằng", BuyerLead(khu_vuc="Gò Vấp"), "ngan_sach")
    assert "GỢI Ý TRƯỚC, HỎI SAU" in p and "CUỐI tin" in p and "khoảng 15 chữ" in p
    assert "vì sao giúp em lọc căn sát hơn" not in p                              # lời khen kèm giải thích làm tin dài
    assert "rồi hỏi đúng 1 câu này một cách" not in p


def test_mot_can_thi_gui_toi_bon_anh_nhieu_can_chia_deu():
    """SRS-5.1zzzzzzz160 (chủ dự án 23/10: "đến link đến 3 4 tấm ảnh"): lượt chỉ giới thiệu MỘT căn được cả 4 ảnh; hai căn chia đều 2 ảnh mỗi căn."""
    nhieu = [{"code": "SEED0016", "url": f"https://x/{i}.jpg"} for i in range(1, 7)]
    anh = anh_can_gui_kem("k7", "buyer", f"xem {L('SEED0016')}", goi=lambda ma: nhieu, bo_nho=BoNhoAnhDaGui())
    assert anh == [f"https://x/{i}.jpg" for i in range(1, 5)]
    hai = nhieu + [{"code": "SEED0044", "url": f"https://y/{i}.jpg"} for i in range(1, 4)]
    anh = anh_can_gui_kem("k8", "buyer", f"xem {L('SEED0016')} và {L('SEED0044')}", goi=lambda ma: hai, bo_nho=BoNhoAnhDaGui())
    assert anh == ["https://x/1.jpg", "https://x/2.jpg", "https://y/1.jpg", "https://y/2.jpg"]
