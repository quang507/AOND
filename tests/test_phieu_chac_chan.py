"""21/10/2026 (SRS-5.1zzzzzzz96). Chủ dự án nạp bảng giá Ny'ah Phú Định nhập tay: "phải có trường để người ta biểu quyết đủ thì thay
dữ liệu cũ"; "cái này tôi nhập tay nên là chắc chắn". Phiếu nguồn chắc chắn (`chac_chan:`) thắng ngay; phiếu khách vẫn bầu như cũ.
Kèm: lượt chép SQLite → Supabase không đẻ dự án thứ hai khi tên chỉ khác dấu nháy / khoảng trắng."""
from aioi.projects import CHAC_CHAN, Project, SupabaseProjectStore, Unit, _fact_lines, merge_facts


def test_phieu_chac_chan_thang_ngay_va_khong_bi_phieu_khach_lat():
    u = Unit("01", {"mau_nha": "Opus"}, {"mau_nha": {"Opus": ["tai_lieu_cu"]}})
    u.learn({"mau_nha": "Office 1", "gia": "14.443.000.000 đ"}, CHAC_CHAN + "bang_gia_T3_2026")
    assert u.attrs["mau_nha"] == "Office 1" and "CHƯA CHẮC" not in " ".join(_fact_lines(u.attrs, u.votes))
    for i in range(10):   # mười khách nói khác vẫn không lật nguồn chắc chắn
        u.learn({"mau_nha": "Opus"}, f"khach-{i}")
    assert u.attrs["mau_nha"] == "Office 1"


def test_phieu_thuong_van_bau_nhu_cu():
    cur, votes = {}, {}
    merge_facts(cur, votes, {"huong": "Đông"}, "a")
    merge_facts(cur, votes, {"huong": "Tây"}, "b")
    assert cur["huong"] == "Đông"                         # hoà thì giữ giá trị thấy trước
    merge_facts(cur, votes, {"huong": "Tây"}, "c")
    assert cur["huong"] == "Tây"                          # nhiều phiếu hơn thì thay


def test_chep_sqlite_khong_de_du_an_thu_hai_khac_dau_nhay():
    goi: list[tuple] = []
    def rpc(method, endpoint, body=None):
        goi.append((method, endpoint, body))
        return [{"khoa": "ny ah phú định"}] if endpoint.startswith("du_an_kien_thuc?select=khoa") else None
    kho = SupabaseProjectStore("https://x.invalid", "k", rpc=rpc)
    class Cu:
        def all(self):
            return [Project("Nyah Phú Định", attributes={"vị trí": "Quận 8"}), Project("Sun Wah Tower"), Project("Sunwah Tower")]
    assert kho.chep_tu(Cu()) == 1                         # chỉ Sun Wah Tower; "Sunwah Tower" trùng nó sau khi bỏ khoảng trắng
    assert [b["khoa"] for m, e, b in goi if m == "POST"] == ["sun wah tower"]


def test_hoi_lai_mat_tien_khi_chua_co_hai_chieu_lo(monkeypatch):
    """SRS-5.1zzzzzzz96: chủ dự án "có cho hỏi" — "mặt tiền 5m" khi chưa có kích thước lô: hỏi lại một lần, ngang căn hay đường rộng."""
    from tests.test_duyet_ban_nhap import _eng
    ke = {"operations": [{"op": "update", "fields": {"mat_tien": "5m"}, "bang_chung": {"mat_tien": "mặt tiền 5m"}}]}
    eng, _, seen, conv = _eng(ke, monkeypatch)
    eng.handle("u-duyet", "nhà mặt tiền 5m")
    assert conv.prop.fields.get("mat_tien") == "5m" and sum("BỀ NGANG HAY ĐƯỜNG" in s and "LƯỢT TRƯỚC CỦA EM CHƯA ĐẠT" not in s for s in seen) == 1   # bỏ lượt gọi lại của SRS-204
    seen.clear()
    eng.handle("u-duyet", "nhà mặt tiền 5m nha")                   # đã hỏi một lần thì thôi
    assert not any("BỀ NGANG HAY ĐƯỜNG" in s for s in seen)

    eng2, _, seen2, conv2 = _eng(ke, monkeypatch)
    conv2.prop.fields["kich_thuoc"] = "5x20"                        # có hai chiều lô: luật bề ngang ≤ lô tự kiểm, khỏi hỏi
    eng2.handle("u-duyet", "nhà mặt tiền 5m")
    assert not any("BỀ NGANG HAY ĐƯỜNG" in s for s in seen2)
