"""SRS-5.1zzzzzzz225 — e2e offline theo `req + chat examples.docx` của anh Luận (`luan8560/aond`, SRD 23/06/2026): 5 nhóm kịch bản mẫu
và luồng giả lập 30 câu (nhà hẻm 123 Trần Bình Trọng, Quận 5). Chủ dự án 27/10/2026: "làm cái này đi, bắn e2e trước rồi bắn thử sau".

Model giả: lượt lập thao tác trả đúng kế hoạch đặt sẵn từng lượt (cụm bằng chứng nằm nguyên trong lời khách), lời gửi khách là câu soạn sẵn
theo tinh thần lời mẫu SRD. Bài chỉ kiểm điều CODE quyết — ô nào ghi, khi nào trình bản nháp, khối phí theo vai, ô riêng của chủ, đổi trạng
thái, tin nhắc, khối điểm — không chấm câu chữ model (việc đó ở bắn thử `ban-thu-srd`).

Bỏ có chủ ý (khác SRD vì quyết định đã chốt, không phải lỗi): nút bấm (bot chỉ có lời nhắn), mở đầu "Dạ", lời hứa "kiểm tra giá thị trường",
bóc tách diện tích từ ảnh sổ (luồng 30 câu dùng câu chữ "Sổ hồng riêng, đất 50m2 em" thay cho bước gửi ảnh sổ), con số điểm / "lên Top"
(khối ĐIỂM TIN chỉ đưa số thật), bước trợ lý bên mua gọi chủ nhà hẹn lịch (lịch xem đi thẳng admin — SRS-165)."""
import re

from aioi.config import Settings
from aioi.engine import Engine, KHONG_RAO, Turn
from aioi.followup import cau_nhac
from aioi.gamification import scale_bonus_multiplier
from aioi.llm.mock import MockProvider
from aioi.prompts import khoi_diem_tin
from aioi.schema import O_NOI_BO, Property

S = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")


class KichBan(MockProvider):
    """Lượt lập thao tác: kế hoạch đặt sẵn. Lời gửi khách: câu đặt sẵn của lượt (lượt gọi lại vẫn trả câu đó)."""

    def __init__(self):
        super().__init__(S)
        self.ke_hoach, self.loi, self.systems = {"operations": []}, "", []

    def extract(self, system, messages, json_schema):
        if "operations" in (json_schema.get("properties") or {}):
            return dict(self.ke_hoach)
        return super().extract(system, messages, json_schema)

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return self.loi or super().chat(system, messages, **k)

    reply = chat


def _ghi(fields: dict, bang_chung: dict, **them) -> dict:
    ke = {"operations": [{"op": "update", "fields": fields, "bang_chung": bang_chung}] if fields else [], "user_intent": "sell"}
    ke.update(them)
    return ke


BAN_NHAP = ("📋 Em sẽ rao như vầy nhé anh:\n\n"
            "🏠 Nhà hẻm xe hơi 4m Trần Bình Trọng Quận 5, đất 50m², 1 trệt 2 lầu 4 phòng ngủ, sổ hồng riêng, chỉ 10 tỷ!\n\n"
            "Anh chị ơi, nhà trong hẻm xe hơi 4m đường Trần Bình Trọng, ô tô tới cửa, đất 50m², 1 trệt 2 lầu với 4 phòng ngủ, sổ hồng "
            "riêng. Giá 10 tỷ, chủ có thương lượng.\n\n"
            "- Hẻm xe hơi 4m, ô tô tới cửa\n- Đất 50m², 1 trệt 2 lầu, 4 phòng ngủ\n- Sổ hồng riêng\n- 10 tỷ (có thương lượng)\n\n"
            "Nhắn Zalo cho em liền để xem nhà nha!\n\nAnh xem bản tin này được chưa ạ?")

# Luồng 30 câu của SRD (phần người rao nói), theo thứ tự. Mỗi dòng: lời khách · kế hoạch AI · lời bot đặt sẵn.
LUONG_30 = [
    ("Anh muốn gửi bán căn nhà phố ở Quận 5.",
     _ghi({"loai_hinh": "nha_pho", "quan": "Quận 5"}, {"loai_hinh": "căn nhà phố", "quan": "Quận 5"}),
     "Nhà phố Quận 5 thì em nhận liền anh ơi! Nhà mình ở đường nào vậy anh?"),
    ("Nhà hẻm 123 đường Trần Bình Trọng nha em.",
     _ghi({"dia_chi": "hẻm 123 đường Trần Bình Trọng", "duong": "Trần Bình Trọng"},
          {"dia_chi": "hẻm 123 đường Trần Bình Trọng", "duong": "Trần Bình Trọng"}),
     "Trần Bình Trọng ngay trung tâm Quận 5, đi đâu cũng gần! Hẻm trước nhà rộng khoảng mấy mét anh?"),
    ("Hẻm xe hơi 4m, ô tô tới cửa.",
     _ghi({"lo_gioi_hem": "Hẻm xe hơi 4m, ô tô tới cửa"}, {"lo_gioi_hem": "Hẻm xe hơi 4m, ô tô tới cửa"}),
     "Tuyệt vời, xe hơi tới tận cửa là điểm cộng lớn đó anh! Nhà xây mấy lầu, mấy phòng ngủ anh?"),
    ("1 trệt 2 lầu, 4 phòng ngủ.",
     _ghi({"ket_cau": "1 trệt 2 lầu", "phong_ngu": "4"}, {"ket_cau": "1 trệt 2 lầu", "phong_ngu": "4 phòng ngủ"}),
     "1 trệt 2 lầu 4 phòng ngủ là rộng rãi cho cả nhà rồi anh! Nhà có sổ chưa anh, đất bao nhiêu mét vuông?"),
    ("Sổ hồng riêng, đất 50m2 em.",
     _ghi({"phap_ly": "Sổ hồng riêng", "dien_tich_dat": "50m2"}, {"phap_ly": "Sổ hồng riêng", "dien_tich_dat": "đất 50m2"}),
     "Sổ hồng riêng thì khách mua yên tâm hẳn anh ơi! Anh muốn bán giá bao nhiêu?"),
    ("Giá bán 10 tỷ nha em. Có thương lượng.",
     _ghi({"gia": "10 tỷ", "thuong_luong": "Có thương lượng"}, {"gia": "10 tỷ", "thuong_luong": "Có thương lượng"}),
     BAN_NHAP),
]


def _chay_luong_30(eng: Engine, spy: KichBan, khach: str = "srd-30") -> list:
    kq = []
    for loi_khach, ke_hoach, loi_bot in LUONG_30:
        spy.ke_hoach, spy.loi = ke_hoach, loi_bot
        kq.append(eng.handle(khach, loi_khach))
    return kq


def _cau_bao_phi(system: str) -> str:
    """Câu mẫu báo phí (code điền {phi} theo vai) mà khối KHÁCH HỎI VỀ PHÍ dặn model nói nguyên văn."""
    m = re.search(r'Báo phí bằng NGUYÊN VĂN câu mẫu: "([^"]+)"', system)
    assert m, "khối phí không có câu mẫu báo phí"
    return m.group(1)


def _chuan_bi():
    spy = KichBan()
    return Engine(spy), spy


# ---------- Luồng 30 câu ----------

def test_luong_30_ghi_dung_o_moi_luot_va_ra_ban_nhap_khi_du_gia():
    eng, spy = _chuan_bi()
    kq = _chay_luong_30(eng, spy)
    c = eng.conversation("srd-30")
    f = c.active.prop.fields
    assert c.active.prop.loai_hinh == "nha_pho"
    assert f["duong"] == "Trần Bình Trọng" and f["quan"] == "Quận 5" and f["dien_tich_dat"] == "50m2"
    assert f["lo_gioi_hem"] == "Hẻm xe hơi 4m, ô tô tới cửa" and f["ket_cau"] == "1 trệt 2 lầu" and f["phong_ngu"] == "4"
    assert f["gia"] == "10 tỷ" and f["phap_ly"] == "Sổ hồng riêng"
    # Bản nháp chỉ trình khi đã có loại hình + vị trí + giá (SRS-200): năm lượt đầu là chat, lượt nói giá ra bản tin 📋.
    assert [r.is_listing_post for r in kq] == [False, False, False, False, False, True]
    assert c.listing_proposed and "📋" in kq[-1].reply
    assert not any(r.reply.startswith("Dạ") for r in kq)


def test_luong_30_khong_ghi_o_khach_khong_noi():
    eng, spy = _chuan_bi()
    _chay_luong_30(eng, spy)
    spy.ke_hoach = _ghi({"huong": "Đông Nam", "gia": "10 tỷ"}, {"huong": "hướng Đông Nam"})   # AI bịa hướng, cụm không có trong lời khách
    spy.loi = "Vâng anh."
    eng.handle("srd-30", "OK em")
    assert "huong" not in eng.conversation("srd-30").active.prop.fields


def test_luong_30_duyet_ban_nhap_roi_hoi_phi_vai_chua_ro_khong_bao_so():
    eng, spy = _chuan_bi()
    _chay_luong_30(eng, spy)
    spy.ke_hoach = _ghi({}, {}, duyet_ban_nhap="dong_y", duyet_trich_dan="OK em")
    spy.loi = "Em xin phép đăng tin ạ! Anh biết phí môi giới bên em chưa ạ?"
    eng.handle("srd-30", "OK em. Có khách báo anh.")
    c = eng.conversation("srd-30")
    assert c.duyet_luot == "dong_y"
    # SRD: "Anh là Chính chủ, phí 1%" — khách CHƯA nói vai thì bot không được đoán vai để báo số (SRS-213).
    spy.ke_hoach = _ghi({}, {}, hoi_ve="phi", hoi_ve_trich_dan="Phí môi giới bên em thu sao")
    spy.loi = "Phí chỉ thu khi giao dịch thành công anh ơi. Anh là chủ nhà hay môi giới để em báo đúng mức ạ?"
    eng.handle("srd-30", "OK. Phí môi giới bên em thu sao?")
    phi = _cau_bao_phi(spy.systems[-1])
    assert "1% giá chốt nếu là chủ nhà" in phi and "0.5% nếu là môi giới" in phi   # nêu cả hai, không chọn một vai đoán


def test_luong_30_tu_nhan_chinh_chu_thi_phi_mot_phan_tram():
    eng, spy = _chuan_bi()
    _chay_luong_30(eng, spy)
    spy.ke_hoach = _ghi({}, {}, seller_role="chu_nha", seller_role_trich_dan="anh là chính chủ", hoi_ve="phi",
                        hoi_ve_trich_dan="phí môi giới bên em thu sao")
    spy.loi = "Chính chủ thì phí 1% giá chốt, chỉ thu khi giao dịch thành công anh nha."
    eng.handle("srd-30", "anh là chính chủ, phí môi giới bên em thu sao?")
    phi = _cau_bao_phi(spy.systems[-1])
    assert "1% giá chốt" in phi and "0.5%" not in phi


def test_luong_30_ban_gap_la_o_rieng_khong_len_ban_tin():
    eng, spy = _chuan_bi()
    _chay_luong_30(eng, spy)
    spy.ke_hoach = _ghi({"ly_do_ban": "anh đang cần bán gấp"}, {"ly_do_ban": "anh đang cần bán gấp"})
    spy.loi = "Em hiểu rồi anh, em sẽ ưu tiên đẩy tin cho anh."
    eng.handle("srd-30", "Nhanh nha em, anh đang cần bán gấp.")
    f = eng.conversation("srd-30").active.prop.fields
    assert f.get("ly_do_ban") == "anh đang cần bán gấp" and "ly_do_ban" in O_NOI_BO
    # Bản tin / web chỉ lấy ô KHÔNG thuộc O_NOI_BO (supabase_store lọc cùng tập này).
    assert "ly_do_ban" not in {k for k in f if k not in O_NOI_BO}


def test_luong_30_tang_noi_that_ghi_o_noi_that():
    eng, spy = _chuan_bi()
    _chay_luong_30(eng, spy)
    spy.ke_hoach = _ghi({"noi_that": "Tặng hết nội thất dính tường"}, {"noi_that": "Tặng hết nội thất dính tường"})
    spy.loi = "Tặng luôn nội thất dính tường thì khách vào ở liền được rồi anh!"
    eng.handle("srd-30", "Tặng hết nội thất dính tường nha.")
    assert eng.conversation("srd-30").active.prop.fields.get("noi_that") == "Tặng hết nội thất dính tường"


def test_luong_30_van_dang_ban_khong_doi_trang_thai_ban_roi_thi_an():
    eng, spy = _chuan_bi()
    _chay_luong_30(eng, spy)
    c = eng.conversation("srd-30")
    truoc = c.active.status
    spy.ke_hoach, spy.loi = _ghi({}, {}), "Vâng anh, em giữ tin cho anh nha."
    eng.handle("srd-30", "Vẫn đang bán nha, chưa chốt ai.")
    assert c.active.status == truoc and Engine._rao_count(c) == 1
    # Nhóm 2.4 SRD: chủ báo đã bán → căn chuyển "đã bán", không còn đếm là đang rao (FR-184).
    spy.ke_hoach = {"operations": [{"op": "set_status", "status": "da_ban", "fields": {}}], "user_intent": "sell"}
    spy.loi = ""
    eng.handle("srd-30", "Nhà anh bán được rồi em.")
    assert c.active.status == "đã bán" and Engine._rao_count(c) == 0 and c.active.status != KHONG_RAO


# ---------- Nhóm 1: gửi bán lần đầu ----------

def test_nhom1_chi_mo_loi_khong_tao_o_khong_bao_ban_nhap():
    eng, spy = _chuan_bi()
    spy.ke_hoach, spy.loi = {"operations": [], "user_intent": "sell"}, "Bên em nhận liền anh ơi! Anh bán nhà phố, chung cư hay đất ạ?"
    r = eng.handle("srd-11", "Anh muốn gửi bán nhà")
    c = eng.conversation("srd-11")
    assert Engine._listing_empty(c.active) and not c.listing_proposed and not r.is_listing_post and "?" in r.reply


def test_nhom1_vua_dua_dia_chi_thi_hoi_mot_y_ke_tiep():
    eng, spy = _chuan_bi()
    for loi_khach, ke, loi_bot in LUONG_30[:2]:
        spy.ke_hoach, spy.loi = ke, loi_bot
        r = eng.handle("srd-12", loi_khach)
    # Mỗi lượt hệ thống chọn MỘT ô để hỏi (không gửi form dài) — SRD 1.2 "chỉ hỏi tối đa 1 thông tin/lần".
    assert r.next_field and not eng.conversation("srd-12").listing_proposed


# ---------- Nhóm 2: tin nhắc giữ cửa sổ Zalo ----------

def test_nhom2_tin_nhac_hoi_lai_dung_cau_dang_cho():
    eng, spy = _chuan_bi()
    spy.ke_hoach, spy.loi = LUONG_30[0][1], LUONG_30[0][2]
    eng.handle("srd-21", LUONG_30[0][0])
    c = eng.conversation("srd-21")
    nhac = cau_nhac(c, c.active, "anh")
    assert "đường nào" in nhac            # hỏi lại đúng câu bot đang chờ, không hỏi dồn ô khác


def test_nhom2_khach_da_tra_loi_het_thi_xin_anh():
    eng, spy = _chuan_bi()
    _chay_luong_30(eng, spy)
    c = eng.conversation("srd-30")
    c.history.append(Turn("user", "OK em", 0.0))
    assert cau_nhac(c, c.active, "anh")    # không còn câu chờ, căn chưa có ảnh → xin ảnh (SRD 2.3)


# ---------- Nhóm 3 + 4: điểm / hạng ----------

def test_nhom3_khoi_diem_chi_dua_so_that_va_cach_tang_diem():
    k = khoi_diem_tin(62.4, "Bạc", 70.0, ["dien_tich_nha", "huong"], 0, Property(loai_hinh="nha_pho"))
    assert "62/100" in k and "Bạc" in k and "Để tăng điểm" in k and "không hứa lên Top" in k


def test_nhom3_ro_hang_tang_thi_he_so_thuong_tang_dan():
    assert scale_bonus_multiplier(1) <= scale_bonus_multiplier(10) <= scale_bonus_multiplier(30) <= scale_bonus_multiplier(60)


def test_nhom4_prompt_ban_co_khoi_diem_tin_moi_luot():
    eng, spy = _chuan_bi()
    _chay_luong_30(eng, spy)
    spy.ke_hoach, spy.loi = _ghi({}, {}), "Vâng anh."
    eng.handle("srd-30", "ok")
    assert any("=== ĐIỂM TIN" in s for s in spy.systems[-3:])
