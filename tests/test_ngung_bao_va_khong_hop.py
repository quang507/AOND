"""SRS-5.1zzzzzzz175 (soát UX 25/10/2026, chủ dự án: "Làm luôn 2 cái đầu đi"). Hai lỗ hổng điều khiển của khách mua:
(1) "Căn đã giới thiệu không nhắc lại" chỉ là lời dặn model, code không lọc; khách chê căn ("không hợp, xa trường con quá") không có chỗ ghi nên
    căn quay lại ở lượt sau và tin báo căn mới cũng không biết. Nay AI đọc `mua.khong_hop` + `ly_do` (cụm trích trong lời khách), lõi ghi
    `interests.trang_thai = khong_hop`, `can_phu_hop(loai_tru=…)` và `bao_can_moi` loại căn đó.
(2) Không có lệnh tắt tin chủ động: khách bảo "đừng gửi nữa" mà hôm sau lõi vẫn báo căn mới. Nay `mua.ngung_bao` → `buyers.bao_can_moi`.
Đỏ khi: bỏ `loai_tru` khỏi `can_phu_hop`, bỏ cờ `bao_can_moi` / danh sách chê khỏi `chay_mot_luot`, ghi lý do AI bịa (không có trong lời khách),
hoặc vẫn ghi "quan tâm" cho căn khách vừa chê."""
from aioi import bao_can_moi
from tests.test_bao_can_moi import NGAN, KhoGia as KhoBao, chay, tin
from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine

CAN2 = {**CAN, "id": "22222222-2222-2222-2222-222222222222", "code": "EFGH5678", "street": "Nguyễn Trãi"}


class KhoHaiCan(KhoGia):
    """Kho giả có hai căn hợp; `che` = id căn khách đã chê (bảng `interests`)."""

    def __init__(self, che=()):
        super().__init__()
        self.che = list(che)

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "POST" and endpoint.startswith("rpc/tim_nha"):
            self.goi.append((method, endpoint, data))
            return [{"can": CAN, "diem": 3, "ly_do": "đúng khu"}, {"can": CAN2, "diem": 2, "ly_do": "đúng khu"}][: data["p_limit"]]
        if method == "GET" and endpoint.startswith("buyers?zalo_user_id=eq."):
            return [{"id": "b1"}]
        if method == "GET" and endpoint.startswith("interests?buyer_id=eq.b1&trang_thai=eq.khong_hop"):
            return [{"listing_id": i} for i in self.che]
        if method == "GET" and endpoint.startswith("listings?or=(code.in.("):
            return [c for c in (CAN, CAN2) if c["code"] in endpoint]
        if method == "POST" and endpoint.startswith("interests?on_conflict="):
            self.goi.append((method, endpoint, data))
            self.che.extend(d["listing_id"] for d in data)
            return None
        return super()._request(method, endpoint, data, prefer)


def test_can_khach_da_che_khong_duoc_goi_lai():
    kho = KhoHaiCan(che=[CAN["id"]])
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("mua-che-1", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    khoi = [s for s in ai.system if "CĂN ĐANG RAO" in s]
    assert khoi and all("#EFGH5678" in s and "#ABCD1234" not in s for s in khoi)
    tim = [d for m, e, d in kho.goi if e.startswith("rpc/tim_nha")]
    assert tim and tim[0]["p_limit"] == 6           # xin thêm đúng số căn đã loại + 2 chỗ cho tin trùng nhà (SRS-5.1zzzzzzz278)


def test_khach_che_can_ghi_khong_hop_kem_ly_do_va_bo_khoi_loi_dap():
    kho = KhoHaiCan()
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "khong_hop": True, "quan_tam": True,
                                                  "ly_do": "xa trường con quá", "trich_dan": "căn đó không hợp"}})
    eng.handle("mua-che-2", "Căn đó không hợp em ơi, xa trường con quá")
    ghi = [d for m, e, d in kho.goi if e.startswith("interests?on_conflict=")]
    assert ghi == [[{"buyer_id": "b1", "listing_id": CAN["id"], "trang_thai": "khong_hop", "ly_do": "xa trường con quá"}]]
    assert not [d for m, e, d in kho.goi if e.startswith("rpc/mark_listing_interest")]   # không ghi "quan tâm" căn vừa chê
    assert any("KHÔNG HỢP với khách (lý do khách nói: \"xa trường con quá\")" in s and "KHÔNG thuyết phục lại" in s for s in ai.system)
    dong = [l for l in ai.system[-1].splitlines() if l.startswith("- #")]   # dòng căn đưa cho model: chỉ căn kế, không có căn vừa chê
    assert len(dong) == 1 and dong[0].startswith("- #EFGH5678")


def test_ly_do_ai_tom_y_van_ghi():
    # SRS-5.1zzzzzzz281 (chủ dự án 29/10: "sửa để ai hiểu ý khách, thực thi đúng ý khách"): AI đọc ra là làm — không so nguyên văn.
    kho = KhoHaiCan()
    eng, _ = _engine(kho, {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "khong_hop": True, "ly_do": "hẻm nhỏ, xe hơi không vào"}})
    eng.handle("mua-che-3", "Thôi bỏ căn này đi em, hẻm vậy xe anh sao chui vô")
    ghi = [d for m, e, d in kho.goi if e.startswith("interests?on_conflict=")]
    assert ghi and ghi[0][0]["ly_do"] == "hẻm nhỏ, xe hơi không vào"


def test_khach_che_ma_chua_ro_can_nao_thi_hoi_lai():
    kho = KhoHaiCan()
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"khong_hop": True, "trich_dan": "không hợp"}})
    eng.handle("mua-che-4", "Căn này không hợp")                           # chưa có link bot nhắc, không mã
    assert not [d for m, e, d in kho.goi if e.startswith("interests?on_conflict=")]
    assert any("chưa rõ căn nào" in s for s in ai.system)


def test_ngung_bao_tat_va_bat_lai():
    kho = KhoHaiCan()
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"ngung_bao": "tat", "trich_dan": "đừng gửi nữa"}})
    eng.handle("mua-tat", "Thôi đừng gửi nữa em")
    co = lambda: [d for d in kho.ghi("PATCH", "buyers?id=eq.b1") if "bao_can_moi" in d]   # noqa: E731 — bỏ PATCH preferences
    assert co() == [{"bao_can_moi": False}]
    assert any("hệ thống ĐÃ TẮT" in s and "KHÔNG nài" in s for s in ai.system)
    eng._provider.ke_hoach = {**KHACH_MUA, "mua": {"ngung_bao": "bat", "trich_dan": "có căn mới thì nhắn anh"}}
    eng.handle("mua-tat", "Có căn mới thì nhắn anh nha")
    assert co()[-1] == {"bao_can_moi": True}


def test_ngung_bao_theo_y_khach_noi_khac_chu():
    # SRS-5.1zzzzzzz281 (chủ dự án 29/10: "sửa để ai hiểu ý khách, thực thi đúng ý khách"): AI đọc ra là làm — không so nguyên văn.
    kho = KhoHaiCan()
    eng, _ = _engine(kho, {**KHACH_MUA, "mua": {"ngung_bao": "tat"}})
    eng.handle("mua-tat-2", "anh mua được nhà rồi, em khỏi nhắn mấy căn nữa nha")
    assert [d for d in kho.ghi("PATCH", "buyers?id=eq.b1") if d.get("bao_can_moi") is False]


class KhoBaoCanMoi(KhoBao):
    def __init__(self, tins, khach=(NGAN,), che=()):
        super().__init__(tins, khach)
        self.che = list(che)

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("interests?"):
            return [{"buyer_id": "b1", "listing_id": i} for i in self.che]
        return super()._request(method, endpoint, data, prefer)


def test_bao_can_moi_bo_qua_khach_da_tat_va_can_da_che():
    kho = KhoBaoCanMoi([tin("l1", "SEED0001", 6.8e9)], khach=({**NGAN, "bao_can_moi": False},))
    ra, gui = chay(kho)
    assert ra == [] and gui == [] and kho.reminders == []
    kho = KhoBaoCanMoi([tin("l1", "SEED0001", 6.8e9), tin("l2", "SEED0002", 6.5e9)], che=["l1"])
    ra, gui = chay(kho)
    assert len(ra) == 1 and ra[0]["listing_id"] == "l2" and "SEED0002" in gui[0][1]
    assert bao_can_moi.TOI_DA_ANH == 4


def test_cau_chao_so_ky_gui_chi_hoi_gui_ban():
    """SRS-5.1zzzzzzz251 (chủ dự án 28/10: "1 số chuyên gửi bán 1 số chuyên mua nhé, sửa câu chào"): đổi quyết định 25/10 (SRS-174) — số
    ký gửi chỉ hỏi gửi bán / cho thuê, một câu; số tư vấn hỏi chuyện tìm mua."""
    from aioi import cau_mau
    from aioi.prompts import khoi_chao_lan_dau
    for k in ("chao_lan_dau", "chao_lam_moi"):
        mau = cau_mau.MAC_DINH[k][0]
        assert "tìm mua" not in mau and "gửi bán hay cho thuê" in mau and mau.count("?") == 1
    assert "tìm mua" in cau_mau.MAC_DINH["chao_tu_van"][0] or "tìm căn" in cau_mau.MAC_DINH["chao_tu_van"][0]
    assert "KHÔNG hỏi khách có tìm mua" in khoi_chao_lan_dau("Lai", "x")
