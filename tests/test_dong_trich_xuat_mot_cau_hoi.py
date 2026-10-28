"""SRS-5.1zzzzzzz252 (chủ dự án 28/10/2026: "Sao dặn hỏi 1 câu rồi mà nó lại hỏi nhiều thế vẫn trong giai đoạn test có dòng $ đã trích xuất nữa đi").
Ca gốc chat thử 28/10 19:01: "Cho em hỏi cho chắc, con số 7m đó là bề ngang căn hay đường trước nhà rộng chừng đó? Với lại sổ hồng riêng đã hoàn công đầy
đủ chưa anh?" — hai câu hỏi một lượt (khối "BỀ NGANG HAY ĐƯỜNG" dặn GỘP thêm một ý vào câu hỏi ô kế). Đỏ khi bỏ `_nhieu_cau_hoi` khỏi lượt soát, bỏ
câu "câu hỏi DUY NHẤT" ở khối mặt tiền, hoặc bỏ tin phụ."""
from aioi import che_do_test
from aioi.engine import _nhieu_cau_hoi
from aioi.prompts import khoi_hoi_mat_tien
from tests.test_doc_y_khach import _eng


def test_dem_cau_hoi_bo_ban_tin_va_link():
    assert _nhieu_cau_hoi("Con số 7m đó là bề ngang căn hay đường trước nhà? Với lại sổ đã hoàn công chưa anh?")
    assert _nhieu_cau_hoi("Nhà mấy tầng vậy anh?? Còn sổ thì sao ạ?")
    assert not _nhieu_cau_hoi("Wow, ngang 7m lận. Nhà mình mấy tầng vậy anh?")
    assert not _nhieu_cau_hoi("Xem ở đây https://x.vn/a?b=1&c=2 nha. Anh tiện đi xem hôm nào?")
    assert not _nhieu_cau_hoi("Em gửi bản nháp nhé?\n📋 Em sẽ rao như vầy:\nNhà đẹp không? Gọi ngay!\nAnh xem được chưa?")
    assert not _nhieu_cau_hoi("")


def test_khoi_mat_tien_la_cau_hoi_duy_nhat():
    k = khoi_hoi_mat_tien("7m")
    assert "câu hỏi DUY NHẤT" in k and "KHÔNG hỏi thêm ô nào" in k and "gộp" not in k.lower()


def test_loi_hai_cau_hoi_thi_goi_lai_mot_lan(monkeypatch):
    eng, spy = _eng({"operations": [{"op": "update", "fields": {"gia": "12,5 tỷ"}, "bang_chung": {"gia": "12.5 tỉ"}}], "user_intent": "sell"})
    loi = iter(["Ồ, 12,5 tỷ. Nhà mấy tầng vậy anh? Với lại sổ hồng riêng chưa anh?", "Ồ, 12,5 tỷ. Nhà mấy tầng vậy anh?"])
    monkeypatch.setattr(spy, "reply", lambda system, messages, max_tokens=256: (spy.systems.append(system), next(loi))[1], raising=False)
    r = eng.handle("hoi-1", "bán nhà Mã Lò 12.5 tỉ")
    assert r.reply.count("?") == 1
    assert any("NHIỀU HƠN MỘT câu" in s for s in spy.systems)


def test_tin_phu_trich_xuat_theo_cong_tac(monkeypatch):
    plan = {"operations": [{"op": "update", "fields": {"gia": "12,5 tỷ"}, "bang_chung": {"gia": "12.5 tỉ"}}], "user_intent": "sell"}
    eng, _ = _eng(plan)
    monkeypatch.delenv("AIOI_DONG_TRICH_XUAT", raising=False)
    assert eng.handle("tp-1", "bán nhà 12.5 tỉ").chu_thich == ""
    monkeypatch.setenv("AIOI_DONG_TRICH_XUAT", "bat")
    eng2, _ = _eng(plan)
    ct = eng2.handle("tp-2", "bán nhà 12.5 tỉ").chu_thich
    assert ct.startswith(che_do_test.DAU + " Đã trích xuất:") and "12.5 tỉ" in ct and "Tốn:" in ct
    assert len(ct.splitlines()) <= 4
    assert all(ct not in t.content for t in eng2.conversation("tp-2").history)   # không vào lịch sử model đọc


def test_khong_con_prompt_dan_hoi_chong_cau():
    """SRS-252 mục 5 (chủ dự án 28/10: "đoạn prompt nào có cái này thì xoá đi"): prompt lượt ảnh và lượt hỏi lại đất / nhà không còn dặn hỏi thêm ý."""
    import inspect
    from aioi import prompts
    nguon = inspect.getsource(prompts)
    assert "hỏi luôn số diện tích còn lại" not in nguon
    assert "Nhà mặt tiền hay trong hẻm vậy ạ?" not in nguon
    from aioi.schema import Property
    p = Property()
    p.fields.update({"loai_hinh": "nha_pho"})
    assert "CHỈ MỘT câu hỏi cả lượt" in prompts.build_media_read_instruction("Lai", prop=p, next_field="gia")
