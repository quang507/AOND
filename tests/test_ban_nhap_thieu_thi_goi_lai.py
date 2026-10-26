"""26/10/2026 (SRS-5.1zzzzzzz204; bắn thử `ban-thu-ban` bản 9f9b9d0, kịch bản Âu Cơ TRƯỢT "ra bản nháp": đủ loại · vị trí · giá · cả 4 facet mà tám
lượt không có bản tin). Gốc: lượt trình bản nháp đặt `listing_proposed = True` TRƯỚC khi biết model có thật sự gửi bản tin — model đáp như chat
thường thì lượt sau chuyển sang nói phí và khách chưa bao giờ thấy bản tin. Nay: không ra bản tin thì gọi lại một lần; vẫn không ra thì tắt
`listing_proposed` để lượt sau trình lại. Đỏ khi bỏ khối gọi lại ở `Engine.handle`."""
from aioi.engine import Engine

BAN_TIN = ("📋 Em sẽ rao như vầy nhé anh chị:\n\nMời xem nhà mặt tiền Âu Cơ Q.11, 80m², 5 tầng, sổ riêng, chỉ 16 tỷ 🏠\n\n"
           "Nhà mặt tiền Âu Cơ, 80m² đất, 5 tầng, sổ riêng, anh chị ghé xem nhé.\n\n- Mặt tiền Âu Cơ, Q.11\n- 80m², 5 tầng\n- Sổ riêng\n- 16 tỷ\n\n"
           "Anh chị muốn xem nhà thì nhắn Zalo cho em sớm nhé.\n\n"
           "Anh/chị thấy bản tin này hấp dẫn chưa ạ?")
LOI_CHAT = "Em nhận giá 16 tỷ anh nhé. Tổng diện tích sàn nhà mình khoảng bao nhiêu m² vậy anh?"


class _Seq:
    def __init__(self, loi):
        self.loi, self.goi = list(loi), 0

    def extract(self, *a, **k):
        return {"operations": []}

    def reply(self, system, messages, **k):
        return self.chat(system, messages, **k)

    def chat(self, system, messages, **k):
        self.goi += 1
        return self.loi.pop(0) if len(self.loi) > 1 else self.loi[0]


def _chuan_bi(loi):
    spy = _Seq(loi)
    eng = Engine(spy)
    conv = eng.conversation("bn1")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({"dia_chi": "110 Âu Cơ", "duong": "Âu Cơ", "gia": "16 tỷ", "lo_gioi_hem": "mặt tiền", "dien_tich_dat": "80m2",
                             "ket_cau": "5 tầng", "phap_ly": "sổ riêng"})
    return eng, spy, conv


def test_model_dap_chat_thuong_thi_goi_lai_va_lay_ban_tin():
    eng, spy, conv = _chuan_bi([LOI_CHAT, BAN_TIN])
    r = eng.handle("bn1", "nhà mình đang ở giá 16 tỉ nhé")
    assert "📋" in r.reply and conv.listing_proposed and spy.goi >= 2


def test_goi_lai_van_khong_ra_ban_tin_thi_lan_sau_trinh_lai():
    eng, spy, conv = _chuan_bi([LOI_CHAT])
    eng.handle("bn1", "nhà mình đang ở giá 16 tỉ nhé")
    assert not conv.listing_proposed                       # chưa hề trình bản tin nên không được coi là đã trình
    spy.loi = [BAN_TIN]
    r = eng.handle("bn1", "ừ em")
    assert "📋" in r.reply and conv.listing_proposed        # lượt sau trình lại


def test_ban_tin_ra_ngay_thi_khong_goi_lai():
    eng, spy, conv = _chuan_bi([BAN_TIN])
    eng.handle("bn1", "nhà mình đang ở giá 16 tỉ nhé")
    assert conv.listing_proposed and spy.goi == 1


def test_ban_tin_thieu_cau_moi_zalo_thi_goi_lai_lay_ban_co_cau_moi():
    thieu = BAN_TIN.replace("Anh chị muốn xem nhà thì nhắn Zalo cho em sớm nhé.\n\n", "")
    eng, spy, conv = _chuan_bi([thieu, BAN_TIN])
    r = eng.handle("bn1", "nhà mình đang ở giá 16 tỉ nhé")
    assert "Zalo" in r.reply and spy.goi >= 2 and conv.listing_proposed


def test_goi_lai_van_thieu_cau_moi_thi_giu_ban_tin_cu_va_da_trinh():
    thieu = BAN_TIN.replace("Anh chị muốn xem nhà thì nhắn Zalo cho em sớm nhé.\n\n", "")
    eng, spy, conv = _chuan_bi([thieu])
    r = eng.handle("bn1", "nhà mình đang ở giá 16 tỉ nhé")
    assert "📋" in r.reply and conv.listing_proposed        # khách vẫn thấy bản tin; không vì thiếu câu mời mà bỏ cả bản tin
