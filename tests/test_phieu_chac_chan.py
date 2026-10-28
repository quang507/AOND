"""21/10/2026 (SRS-5.1zzzzzzz96). Chủ dự án nạp bảng giá Ny'ah Phú Định nhập tay: "phải có trường để người ta biểu quyết đủ thì thay
dữ liệu cũ"; "cái này tôi nhập tay nên là chắc chắn". Phiếu nguồn chắc chắn (`chac_chan:`) thắng ngay; phiếu khách vẫn bầu như cũ.
28/10 (SRS-5.1zzzzzzz249): phiếu khách có trọng số theo hạng; admin = phiếu chắc chắn."""
from aioi.projects import CHAC_CHAN, Unit, _fact_lines, merge_facts


def test_phieu_chac_chan_thang_ngay_va_khong_bi_phieu_khach_lat():
    u = Unit("01", {"mau_nha": "Opus"}, {"mau_nha": {"Opus": ["tai_lieu_cu"]}})
    u.learn({"mau_nha": "Office 1", "gia": "14.443.000.000 đ"}, CHAC_CHAN + "bang_gia_T3_2026")
    assert u.attrs["mau_nha"] == "Office 1" and "CHƯA CHẮC" not in " ".join(_fact_lines(u.attrs, u.votes))
    for i in range(10):   # mười khách nói khác vẫn không lật nguồn chắc chắn
        u.learn({"mau_nha": "Opus"}, f"khach-{i}")
    assert u.attrs["mau_nha"] == "Office 1"


def test_phieu_theo_hang_dong_bac_vang():
    """SRS-5.1zzzzzzz249 (chủ dự án 28/10: "dựa theo hạng đồng bạc vàng để vote … admin nhắn thì ghi thẳng"). Tắt trọng số (`_diem` đếm
    mỗi phiếu là 1) thì hai phiếu Vàng không chốt được — đỏ."""
    cur, votes = {}, {}
    merge_facts(cur, votes, {"huong": "Đông"}, "dong:a")
    merge_facts(cur, votes, {"huong": "Tây"}, "dong:b")
    assert cur == {}                                      # chưa đủ điểm: chưa vào kho chung
    merge_facts(cur, votes, {"huong": "Tây"}, "vang:c")
    assert cur == {}                                      # 4 điểm < 6
    merge_facts(cur, votes, {"huong": "Tây"}, "vang:d")
    assert cur["huong"] == "Tây"                          # 1 + 3 + 3 = 7 ≥ 6, phe khác 1 ≤ 2 → chốt
    merge_facts(cur, votes, {"huong": "Tây"}, "bac:c")    # c lên/xuống hạng: vẫn MỘT phiếu
    assert sum(1 for v in votes["huong"]["Tây"] if v.endswith(":c")) == 1


def test_admin_ghi_thang():
    cur, votes = {"phap ly": "sổ chung"}, {}
    merge_facts(cur, votes, {"phap ly": "sổ hồng riêng"}, "dong:a")
    assert cur["phap ly"] == "sổ chung"                   # nguồn mogi giữ tới khi phiếu đủ
    merge_facts(cur, votes, {"phap ly": "sổ hồng từng căn"}, CHAC_CHAN + "admin:84900")
    assert cur["phap ly"] == "sổ hồng từng căn"


def test_hoi_lai_mat_tien_khi_chua_co_hai_chieu_lo(monkeypatch):
    """SRS-5.1zzzzzzz96: chủ dự án "có cho hỏi" — "mặt tiền 5m" khi chưa có kích thước lô: hỏi lại một lần, ngang căn hay đường rộng."""
    from tests.test_duyet_ban_nhap import _eng
    ke = {"operations": [{"op": "update", "fields": {"mat_tien": "5m"}, "bang_chung": {"mat_tien": "mặt tiền 5m"}}]}
    eng, _, seen, conv = _eng(ke, monkeypatch)
    eng.handle("u-duyet", "nhà mặt tiền 5m")
    # bỏ lượt gọi lại của SRS-204 và của lưới hình thức (SRS-218: bản tin mock có số không có trong dữ liệu → gọi lại)
    assert conv.prop.fields.get("mat_tien") == "5m" and sum("BỀ NGANG HAY ĐƯỜNG" in s and "LƯỢT TRƯỚC CỦA EM CHƯA ĐẠT" not in s
                                                            and "VIẾT LẠI LƯỢT NÀY" not in s for s in seen) == 1
    seen.clear()
    eng.handle("u-duyet", "nhà mặt tiền 5m nha")                   # đã hỏi một lần thì thôi
    assert not any("BỀ NGANG HAY ĐƯỜNG" in s for s in seen)

    eng2, _, seen2, conv2 = _eng(ke, monkeypatch)
    conv2.prop.fields["kich_thuoc"] = "5x20"                        # có hai chiều lô: luật bề ngang ≤ lô tự kiểm, khỏi hỏi
    eng2.handle("u-duyet", "nhà mặt tiền 5m")
    assert not any("BỀ NGANG HAY ĐƯỜNG" in s for s in seen2)


def test_engine_admin_zalo_ghi_thang_khach_theo_hang():
    """SRS-5.1zzzzzzz249: engine tự tính mã phiếu — Zalo ID trong bảng `admins` ghi thẳng; người khác là một phiếu theo hạng. Bỏ nhánh admin
    trong `Engine._ma_phieu` thì dữ kiện admin nói chỉ là phiếu chờ — đỏ."""
    from tests.test_engine import _engine
    eng = _engine()

    class Kho:
        def la_nhan_vien(self, u):
            return u == "84admin"
    eng._convstore = Kho()
    eng.register_project("Sky Garden", attributes={"cổng": "Nguyễn Văn Linh"}, voter="84admin")
    eng.register_project("Sky Garden", attributes={"an ninh": "24/7"}, voter="84khach")
    p = eng._projects.get("Sky Garden")
    assert p.attributes == {"cổng": "Nguyễn Văn Linh"}
    assert p.votes["cổng"] == {"Nguyễn Văn Linh": [CHAC_CHAN + "admin:84admin"]} and p.votes["an ninh"] == {"24/7": ["dong:84khach"]}
    assert eng._ma_phieu("84admin").startswith(CHAC_CHAN) and eng._ma_phieu(CHAC_CHAN + "x") == CHAC_CHAN + "x"
