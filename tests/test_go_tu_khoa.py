"""SRS-5.1zzzzzzz55: gỡ nốt bộ dò từ khoá — xác nhận xoá, xin bản vẽ, hỏi dự án, tả dự án, ảnh tài liệu chung, loại BĐS,
phường / quận trong chữ địa chỉ. Lượt AI lập thao tác đọc theo nghĩa, code kiểm trích dẫn.
Mỗi ca dùng một cách nói bộ từ khoá cũ KHÔNG bắt được (hoặc bắt nhầm)."""
from aioi.engine import Engine, Listing
from aioi.schema import Property


class _Spy:
    def __init__(self, plan, tai_lieu=False):
        self.plan, self.tai_lieu, self.systems, self.extract_systems = plan, tai_lieu, [], []

    def extract(self, system, messages, schema):
        self.extract_systems.append(system)
        if "tai_lieu_chung" in schema.get("properties", {}):
            return {"tai_lieu_chung": self.tai_lieu}
        return dict(self.plan)

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return "Vâng anh."


def _ro_hai_can(eng, uid):
    conv = eng.conversation(uid)
    conv.active.prop.update({"loai_hinh": "nha_pho", "ma_so_can": "A1", "dia_chi": "12 Trần Hưng Đạo, Quận 5", "gia": "8 tỷ"})
    b = Listing()
    b.prop.update({"loai_hinh": "nha_pho", "ma_so_can": "B2", "dia_chi": "5 Lê Lợi, Quận 1", "gia": "9 tỷ"})
    conv.listings.append(b)
    conv.pending_destructive = [{"op": "keep_only", "targets": ["A1"]}]
    return conv


def test_xac_nhan_xoa_cach_noi_moi_do_ai_doc():
    # "ừa làm vậy đi em" — bộ từ cũ không có "lam vay" nên coi là KHÔNG xác nhận. AI đọc: đồng ý.
    spy = _Spy({"operations": [], "xac_nhan_xoa": "dong_y", "xac_nhan_trich_dan": "làm vậy đi"})
    eng = Engine(spy)
    conv = _ro_hai_can(eng, "d1")
    eng.handle("d1", "ừa làm vậy đi em")
    assert conv.pending_destructive == []
    assert [li.status for li in conv.listings].count("không rao") == 1


def test_ok_khong_kem_y_ai_thi_khong_xoa():
    # Bộ từ cũ: "ok" đứng một mình = xác nhận xoá. Nay chỉ AI quyết; AI không điền → giữ nguyên rổ hàng.
    spy = _Spy({"operations": []})
    eng = Engine(spy)
    conv = _ro_hai_can(eng, "d2")
    eng.handle("d2", "ok để anh coi lại")
    assert all(li.status != "không rao" for li in conv.listings)


def test_xin_ban_ve_cach_noi_moi_va_mat_bang_kinh_doanh():
    spy = _Spy({"operations": [], "xin_xem_ban_ve": "gửi anh coi hình vẽ căn 24"})
    eng = Engine(spy)
    r = eng.handle("m1", "gửi anh coi hình vẽ căn 24 với")      # không có chữ "bản vẽ / layout / sơ đồ"
    assert spy.systems == [] and r.reply                          # đi nhánh xin xem, không gọi lượt trả lời chung
    spy2 = _Spy({"operations": []})
    Engine(spy2).handle("m2", "cho thuê mặt bằng kinh doanh mặt tiền Q5")
    assert spy2.systems                                           # loại BĐS, đi luồng thường


def test_ta_du_an_do_ai_doc():
    spy = _Spy({"operations": [], "mo_ta_du_an": "khu này có hồ điều hoà với trường quốc tế"})
    eng = Engine(spy)
    conv = eng.conversation("t1")
    conv.prop.fields["du_an"] = "Dự Án Mẫu"
    hoc = []
    eng.register_project_from_text = lambda *a, **k: hoc.append(a) or None
    eng.handle("t1", "khu này có hồ điều hoà với trường quốc tế")   # bộ từ cũ không có "hồ điều hoà", "trường"
    assert hoc


def test_anh_tai_lieu_chung_do_ai_doc():
    assert Engine(_Spy({}, tai_lieu=True))._la_tai_lieu_chung("Ảnh chụp tấm bảng các block A B C và đường nội bộ")
    assert not Engine(_Spy({}, tai_lieu=False))._la_tai_lieu_chung("Ảnh phòng khách có cửa sổ hướng ra mặt bằng trống")
    assert not Engine(_Spy({}))._la_tai_lieu_chung("")


def test_lap_ke_hoach_nhan_dia_chi_dang_ghi():
    spy = _Spy({"operations": []})
    eng = Engine(spy)
    eng.conversation("a1").prop.fields["dia_chi"] = "12 Trần Hưng Đạo, Quận 5"
    eng.handle("a1", "phường 2 nha em")
    assert any("ĐỊA CHỈ ĐANG GHI của căn đang nói tới: 12 Trần Hưng Đạo, Quận 5" in s for s in spy.extract_systems)


def test_schema_khong_doan_loai_bang_tu_khoa():
    p = Property()
    p.update({"dia_chi": "hẻm 5 lầu Lê Lợi", "ket_cau": "1 trệt 2 lầu"})   # bản cũ: có "lầu / hẻm" → nhà phố
    assert p.loai_hinh is None


def test_dia_chi_ai_tra_ban_day_du_thi_ghi_nguyen():
    p = Property(fields={"dia_chi": "12 Trần Hưng Đạo, Quận 5"})
    p.update({"dia_chi": "12 Trần Hưng Đạo, Phường Chợ Quán, Quận 5"})
    assert p.fields["dia_chi"] == "12 Trần Hưng Đạo, Phường Chợ Quán, Quận 5"
    p.update({"dia_chi": "100/9"})                                   # số nhà đứng một mình vẫn thay số cũ
    assert p.fields["dia_chi"] == "100/9 Trần Hưng Đạo, Phường Chợ Quán, Quận 5"
