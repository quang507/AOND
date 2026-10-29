"""29/10/2026 (SRS-5.1zzzzzzz280). Chủ dự án test mua:
(a) bot hỏi "Em hỏi chủ nhà giúp anh nhé?", khách "hỏi giúp a đi e" → log lõi "Mua: bỏ việc ['hoi_chu_nha', …] — không có căn cứ": câu khách hỏi
    ở lượt trước ("nhà này vào ở ngay được khoogn?") bị AI sửa chính tả khi chép nên so nguyên văn trượt — câu hỏi không đi tới ai;
(b) "ảnh gửi 1 lần có được ko, nhìn nó phóng trên zalo to lắm" — bridge gửi từng tấm;
(c) "bỏ luôn mấy cái ảnh mẫu vẽ kia" — công cụ nạp ảnh mẫu cho rổ seed_thu gỡ khỏi repo.
Mỗi ca đỏ khi gỡ bản sửa."""
import pathlib

from aioi.engine import _loc_viec_mua

GOC = pathlib.Path(__file__).parents[1]


def test_khach_dong_y_hoi_chu_nha_cau_hoi_co_loi_go_van_nhan():
    mua = {"hoi_chu_nha": "nhà này vào ở ngay được không?", "ma_can": ["SEED0002"], "trich_dan": "hỏi giúp a đi e"}
    ra = _loc_viec_mua(mua)
    assert ra.get("hoi_chu_nha") == "nhà này vào ở ngay được không?" and ra.get("ma_can") == ["SEED0002"]


def test_cau_hoi_ai_viet_lai_nhan_luon():
    """Chủ dự án 29/10: "AI sẽ tự diễn giải và viết lại câu hỏi gửi chủ nhà cho rõ ràng và tạo code tạo yêu cầu luôn, kệ hallucinate"."""
    hoi = "Nhà vào ở ngay được không, 2 tuần nữa khách dọn vào được không?"
    ra = _loc_viec_mua({"hoi_chu_nha": hoi, "ma_can": ["SEED0002"]})
    assert ra.get("hoi_chu_nha") == hoi and ra.get("ma_can") == ["SEED0002"]
    ra2 = _loc_viec_mua({"hoi_chu_nha": "Chủ có bán gấp không?"})   # không đòi căn cứ trong lời khách
    assert ra2.get("hoi_chu_nha") == "Chủ có bán gấp không?"


def test_prompt_cau_hoi_chu_nha_doc_theo_y():
    from aioi.prompts import operations_schema
    from aioi import prompts
    goc = pathlib.Path(prompts.__file__).read_text(encoding="utf-8")
    assert "ĐỌC THEO Ý khách" in goc and "hoi_chu_nha_trich" not in goc


def test_bridge_gui_moi_anh_mot_lan():
    mjs = (GOC / "bot/bridge-zca/index.mjs").read_text(encoding="utf-8")
    assert 'attachments: tep }' in mjs                                     # một tin nhiều tệp
    assert "for (const url of Array.isArray(photos)" not in mjs            # không còn vòng gửi từng tấm
    assert "anhDaGui = await guiAnhQuaUrl(threadId, anh)" in mjs


def test_cong_cu_anh_mau_da_go():
    assert not (GOC / "bot/tests/tim-nha/nap-anh-mau.mjs").exists()
    assert not (GOC / "bot/tests/tim-nha/anh-mau").exists()
    wf = (GOC / ".github/workflows/apply-migration.yml").read_text(encoding="utf-8")
    assert "nap-anh-mau" not in wf


def test_khach_dong_y_hoi_giup_tao_info_request_voi_cau_ai_viet_lai():
    """Đi hết đường thật (engine → `_viec_mua` → `info_requests`): bản cài 29/10 sửa `_loc_viec_mua` nhưng `_viec_mua` còn so nguyên văn lần hai
    — câu hỏi vẫn không đi tới ai."""
    from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine
    kho = KhoGia()
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("mua-280", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    eng.handle("mua-280", "nhà này vào ở ngay được khoogn?")
    hoi = "Nhà vào ở ngay được không, khách định 2 tuần nữa dọn vào?"
    eng._provider.ke_hoach = {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "hoi_chu_nha": hoi}}
    eng.handle("mua-280", "hỏi giúp a đi e")
    ir = kho.ghi("POST", "info_requests")
    assert ir and ir[0]["question"] == hoi and ir[0]["listing_id"] == CAN["id"] and ir[0]["status"] == "pending"
    assert "chuyển câu" in ai.system[-1]
