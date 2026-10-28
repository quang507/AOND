"""SRS-5.1zzzzzzz233 (chat chị Ngân 28/10/2026 sau khi cài bản #142): chủ nhà "125 Bình Long, Bình Hưng Hòa A, Bình Tân, 70m2, giá 3 tỷ" → (1) bản nháp
viết "Chính chủ bán…", "Nhà có sổ hồng rõ ràng" dù chị chưa nói pháp lý / vai; (2) "Bình Hưng Hòa A" cũ chia về Bình Hưng Hòa + Bình Trị Đông mà
hệ thống chỉ tra phường cũ ĐÁNH SỐ nên bot hỏi trống "tên phường mới", rồi xin lại số nhà đã có. Đề xuất pháp lý: chủ nhà hỏi thuế phí thì tính theo
giá căn mình đang rao. Đỏ khi tắt từng bản sửa."""
from aioi import phap_ly, prompts
from aioi.dia_danh import phuong_cu_chia
from aioi.engine import Conversation, Engine, Turn, _phap_ly_vai_khong_co_du_lieu
from aioi.revenue import SellerRole
from tests.test_phap_ly import CHU_NHA
from tests.test_viec_mua import KhoGia, _engine

PHUONG_CU = [
    {"ten": "Phường Bình Hưng Hòa A", "quan_cu": "Quận Bình Tân", "phuong_moi": "Bình Hưng Hòa"},
    {"ten": "Phường Bình Hưng Hòa A", "quan_cu": "Quận Bình Tân", "phuong_moi": "Bình Trị Đông"},
    {"ten": "Phường Bình Hưng Hòa", "quan_cu": "Quận Bình Tân", "phuong_moi": "Bình Hưng Hòa"},
    {"ten": "Phường Tân Tạo A", "quan_cu": "Quận Bình Tân", "phuong_moi": "Tân Tạo"},
]
WARDS = [{"ten": "Bình Hưng Hòa", "ten_day_du": "Phường Bình Hưng Hòa"}, {"ten": "Bình Trị Đông", "ten_day_du": "Phường Bình Trị Đông"},
         {"ten": "Tân Tạo", "ten_day_du": "Phường Tân Tạo"}]


def _doc(bang, ts):
    if bang == "phuong_cu":
        return PHUONG_CU if "ten" not in ts else [d for d in PHUONG_CU if d["ten"] == ts["ten"].removeprefix("eq.")]
    if bang == "wards":
        if "ten" not in ts:
            return WARDS
        ten = {t.strip('"') for t in ts["ten"].removeprefix("in.(").removesuffix(")").split(",")}
        return [w for w in WARDS if w["ten"] in ten]
    raise AssertionError(bang)


def test_phuong_cu_co_ten_bi_chia_ke_du_phuong_moi():
    assert phuong_cu_chia(_doc, None, "Bình Tân", "Bình Hưng Hòa A") == ["Phường Bình Hưng Hòa", "Phường Bình Trị Đông"]
    assert phuong_cu_chia(_doc, None, "Quận Bình Tân", "phuong binh hung hoa a") == ["Phường Bình Hưng Hòa", "Phường Bình Trị Đông"]  # không dấu
    assert phuong_cu_chia(_doc, None, "Bình Tân", "Bình Hưng Hòa") == []       # tên trùng phường MỚI → khách nói tên mới, không hỏi
    assert phuong_cu_chia(_doc, None, "Bình Tân", "Tân Tạo A") == []           # chỉ về một phường → không phải "bị chia"
    assert phuong_cu_chia(_doc, None, "Quận 8", "Bình Hưng Hòa A") == []       # khác quận


def _conv(*loi_khach: str) -> Conversation:
    c = Engine(None).conversation("k-233")
    for x in loi_khach:
        c.history.append(Turn("user", x, 0.0))
    return c


BAN_NHAP = ("📋 Em sẽ rao như vầy nhé chị:\n\nChính chủ bán nhà phố mặt tiền Bình Long, Bình Tân, 70m² sàn, giá chỉ 3 tỷ! 🏡\n\nBà con ơi, nhà phố "
            "mặt tiền đường Bình Long đang được chủ bán với mức giá 3 tỷ. Nhà có sổ hồng rõ ràng, anh chị yên tâm.\n\n- 70m² sàn\n- Giá 3 tỷ\n\n"
            "Cô bác muốn xem nhà thì nhắn Zalo ngay hôm nay!\n\nChị muốn sửa chỗ nào, hay em đăng luôn ạ?")


def test_ban_nhap_bia_phap_ly_va_chinh_chu_bi_bat():
    c = _conv("chị cần bán nhà", "Chị bán nhà ở 125 Bình Long, Bình Hưng Hòa A, Bình Tân, 70m2, giá 3 tỷ", "diện tích sàn")
    assert _phap_ly_vai_khong_co_du_lieu(BAN_NHAP, c) == ["chính chủ", "sổ hồng"]
    c2 = _conv("Nhà chính chủ, sổ hồng riêng, 125 Bình Long giá 3 tỷ")             # khách tự nói → không bắt
    assert _phap_ly_vai_khong_co_du_lieu(BAN_NHAP, c2) == []
    c3 = _conv("bán nhà 125 Bình Long giá 3 tỷ, giấy tờ đầy đủ")                  # nói giấy tờ, chưa nói vai
    c3.user_type = SellerRole.CHU_NHA                                              # vai đã nhận có bằng chứng ở lượt khác
    assert _phap_ly_vai_khong_co_du_lieu(BAN_NHAP, c3) == []
    assert _phap_ly_vai_khong_co_du_lieu("Nhà có sổ hồng, giá 3 tỷ.", c) == []    # không phải bản tin 📋 → không soát
    assert "\"chính chủ\" chỉ viết khi chủ nhà tự nói là chủ" in prompts.AD_FORMAT


def test_chu_nha_hoi_thue_tinh_theo_gia_rao():
    phap_ly.dang_ky(None)
    kho = KhoGia()
    kho._ngan_sach_vnd = lambda gia: 3_000_000_000 if gia == "3 tỷ" else None   # type: ignore[attr-defined]  # parse_vnd của DB
    eng, ai = _engine(kho, {**CHU_NHA, "operations": [{"op": "update", "fields": {"gia": "3 tỷ"}, "bang_chung": "giá 3 tỷ"}],
                            "hoi_phap_ly": "thue_phi_sang_ten", "phap_ly_trich_dan": "phải nộp những thuế phí gì"})
    eng.handle("pl-233", "Nhà chị giá 3 tỷ, bán thì chị phải nộp những thuế phí gì em?")
    assert any("SỐ TÍNH THEO CĂN (giá 3 tỷ của căn của khách đang rao" in s and "thuế TNCN bên bán 2 % ≈ 60 triệu" in s for s in ai.system)
