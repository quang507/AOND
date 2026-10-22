"""SRS-5.1zzzzzzz142: lưu tin nhắn GỐC của người bán vào `listing_noi_bo.du_lieu.tin_goc` để nhúng vector (chủ dự án 22/10/2026: "lưu luôn vào
trường, không cần sửa làm chuẩn, không thêm cột"). Lớp lỗi: bản tin AI viết lại cùng một khuôn nên vector các căn giống nhau, chi tiết người bán
chỉ nói bằng lời mình ("sau nhà có đất trống cho chó mèo chạy") mất ở khâu tìm. Test đỏ khi chữ bị sửa / chuẩn hoá, lọt SĐT, lẫn tin căn khác,
hoặc tin gốc không được ghi cùng ô riêng."""
from aioi.assistants import assign_assistant
from aioi.engine import Conversation, Listing, Turn
from aioi.schema import Property
from aioi.supabase_store import SupabaseConversationStore
from aioi.tin_goc import gom_tin_goc, la_tin_co_thong_tin

T0 = 1_791_000_000.0   # 2026-10-… (chỉ cần một mốc cố định)


def _t(role, text, at=T0):
    return Turn(role, text, at)


def test_giu_nguyen_van_khong_chuan_hoa_va_che_sdt():
    lich_su = [_t("user", "nhà hxh 4m dtsd 120m ngay Cách Mạng Tháng Tám, sau nhà có đất trống cho chó mèo chạy nha em"),
               _t("assistant", "Dạ em ghi nhận ạ, anh cho em xin giá nhé."),
               _t("user", "gọi chú 0903 123 456 nhé, giá 6.5 ty thương lượng chút")]
    kq = gom_tin_goc(lich_su, 0, len(lich_su))
    assert "hxh 4m dtsd 120m" in kq and "6.5 ty" in kq and "chó mèo chạy" in kq   # nguyên văn: không "hẻm xe hơi", không "6,5 tỷ"
    assert "0903" not in kq and "[số]" in kq                                       # SĐT bị che
    assert "ghi nhận" not in kq                                                    # lời bot không vào


def test_bo_luot_khong_co_thong_tin():
    for bo in ("ok em", "ừ", "dạ vâng ạ", "cảm ơn anh nhé", "$$$$$", "json", "[Khách gửi file/link >20MB: https://x]", "1234567890123456789012"):
        assert not la_tin_co_thong_tin(bo), bo
    # Bot hỏi từng ô nên câu trả lời ngắn LÀ thông tin (bắn thử ban-thu-ban: "giá 8,5 tỷ", "Nhà mặt tiền", "dt 4,5x11") — không được lọc theo độ dài
    for giu in ("giá 8,5 tỷ", "Nhà mặt tiền", "dt 4,5x11", "đã hoàn công đủ", "Quận 8", "nhà 4 tầng hẻm xe hơi gần chợ"):
        assert la_tin_co_thong_tin(giu), giu


def test_chi_lay_khoang_cua_mot_can_va_giu_tin_moi_khi_qua_tran():
    lich_su = [_t("user", "căn một: nhà phố Lê Văn Sỹ 60m2 hẻm xe hơi"), _t("user", "căn hai: kho xưởng Võ Văn Kiệt 1400m2 container vào được")]
    assert "Lê Văn Sỹ" in gom_tin_goc(lich_su, 0, 1) and "Võ Văn Kiệt" not in gom_tin_goc(lich_su, 0, 1)
    assert "Võ Văn Kiệt" in gom_tin_goc(lich_su, 1, 2) and "Lê Văn Sỹ" not in gom_tin_goc(lich_su, 1, 2)
    dai = [_t("user", f"tin số {i}: " + "nhà đẹp hẻm rộng " * 6) for i in range(30)]
    kq = gom_tin_goc(dai, 0, 30, toi_da=400)
    assert len(kq) <= 400 and "tin số 29" in kq and "tin số 0:" not in kq        # quá trần thì bỏ tin CŨ nhất


class _Kho(SupabaseConversationStore):
    def __init__(self):
        super().__init__(url="https://x.supabase.co", key="k")
        self.goi = []

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        return []


def test_ghi_noi_bo_kem_tin_goc_khong_bi_cat_500_chu():
    kho = _Kho()
    dai = "nhà " + "rất đẹp " * 200
    kho._ghi_noi_bo("l1", {"ly_do_ban": "cần tiền"}, dai)
    du_lieu = [d for m, e, d in kho.goi if "listing_noi_bo" in e][0]["du_lieu"]
    assert du_lieu["ly_do_ban"] == "cần tiền" and du_lieu["tin_goc"] == dai          # ô riêng vẫn ≤ 500, tin gốc nguyên vẹn
    kho.goi.clear()
    kho._ghi_noi_bo("l1", {}, "")
    assert "tin_goc" not in [d for m, e, d in kho.goi][0]["du_lieu"]


def test_tin_goc_cua_dung_can_theo_history_start():
    c = Conversation(user_key="u", assistant=assign_assistant("u"))
    c.history = [_t("user", "căn A: nhà phố Lê Văn Sỹ hẻm xe hơi 60m2"), _t("assistant", "dạ"), _t("user", "căn B: đất nền Long An 500m2 gần chợ")]
    a, b = Listing(prop=Property(loai_hinh="nha_pho"), history_start=0), Listing(prop=Property(loai_hinh="dat"), history_start=2)
    c.listings = [a, b]
    assert "Lê Văn Sỹ" in SupabaseConversationStore._tin_goc_cua(c, a) and "Long An" not in SupabaseConversationStore._tin_goc_cua(c, a)
    assert "Long An" in SupabaseConversationStore._tin_goc_cua(c, b) and "Lê Văn Sỹ" not in SupabaseConversationStore._tin_goc_cua(c, b)


class _KhoLuu(SupabaseConversationStore):
    def __init__(self):
        super().__init__(url="https://x.supabase.co", key="k")
        self.goi = []
        self._seller_cache["u"] = "s1"
        self._conv_cache["s1"] = "c1"

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if method == "POST" and endpoint == "listings":
            return [{"id": (data or {}).get("id")}]
        return []


def test_save_ghi_tin_goc_vao_listing_noi_bo_khong_vao_boc_tach_cong_khai():
    kho = _KhoLuu()
    c = Conversation(user_key="u", assistant=assign_assistant("u"))
    c.active.prop = Property(loai_hinh="nha_pho", fields={"duong": "Lê Văn Sỹ", "gia": "6 tỷ"})
    c.history = [_t("user", "nhà hxh 4m ngay Lê Văn Sỹ, sau nhà có sân cho chó mèo chạy, 6 tỷ")]
    kho.save(c)
    noi_bo = [d for m, e, d in kho.goi if "listing_noi_bo" in e]
    assert noi_bo and "sân cho chó mèo chạy" in noi_bo[0]["du_lieu"]["tin_goc"]
    tao = [d for m, e, d in kho.goi if m == "POST" and e == "listings"][0]
    assert "tin_goc" not in tao["boc_tach"] and "chó mèo" not in str(tao["boc_tach"])   # cột công khai không mang tin gốc
