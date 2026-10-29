"""29/10/2026 (SRS-5.1zzzzzzz280). Chủ dự án test mua:
(a) bot hỏi "Em hỏi chủ nhà giúp anh nhé?", khách "hỏi giúp a đi e" → log lõi "Mua: bỏ việc ['hoi_chu_nha', …] — không có căn cứ": câu khách hỏi
    ở lượt trước ("nhà này vào ở ngay được khoogn?") bị AI sửa chính tả khi chép nên so nguyên văn trượt — câu hỏi không đi tới ai;
(b) "ảnh gửi 1 lần có được ko, nhìn nó phóng trên zalo to lắm" — bridge gửi từng tấm;
(c) "bỏ luôn mấy cái ảnh mẫu vẽ kia" — công cụ nạp ảnh mẫu cho rổ seed_thu gỡ khỏi repo.
Mỗi ca đỏ khi gỡ bản sửa."""
import pathlib

from aioi.engine import _loc_viec_mua, _trich_gan_khop

GOC = pathlib.Path(__file__).parents[1]
TRUOC = "a mua để ở nha. nhà này vào ở ngay được khoogn?"


def test_khach_dong_y_hoi_chu_nha_cau_hoi_co_loi_go_van_nhan():
    mua = {"hoi_chu_nha": "nhà này vào ở ngay được không?", "ma_can": ["SEED0002"], "trich_dan": "hỏi giúp a đi e"}
    ra = _loc_viec_mua(mua, "hỏi giúp a đi e", [TRUOC, "hỏi giúp a đi e"])
    assert ra.get("hoi_chu_nha") == "nhà này vào ở ngay được không?" and ra.get("ma_can") == ["SEED0002"]


def test_cau_hoi_bia_khong_co_trong_loi_khach_van_bo():
    assert not _trich_gan_khop("chủ có bớt giá không", "hỏi giúp a đi e")
    assert not _trich_gan_khop("còn ko", "còn không")              # dưới 3 chữ trùng: không chịu lỗi
    ra = _loc_viec_mua({"hoi_chu_nha": "sổ riêng hay sổ chung vậy", "ma_can": ["SEED0002"]}, "hỏi giúp a đi e", [TRUOC])
    assert "hoi_chu_nha" not in ra


def test_cau_hoi_ai_viet_lai_theo_y_khach_nhan_theo_cum_can_cu():
    """Chủ dự án 29/10: "khách có muôn vàn câu hỏi … sửa để AI hiểu ý khách". AI viết lại câu hỏi (gộp hai tin, sửa chính tả); code chỉ kiểm cụm
    căn cứ ngắn `hoi_chu_nha_trich` trong lời khách."""
    hoi = "Nhà vào ở ngay được không, 2 tuần nữa khách dọn vào được không?"
    gan = [TRUOC, "2 tuần nữa vào ở được không", "hỏi giúp a đi e"]
    ra = _loc_viec_mua({"hoi_chu_nha": hoi, "hoi_chu_nha_trich": "hỏi giúp a đi", "ma_can": ["SEED0002"]}, "hỏi giúp a đi e", gan)
    assert ra.get("hoi_chu_nha") == hoi
    # cụm căn cứ không có trong lời khách → bỏ (AI tự bịa câu hỏi)
    ra2 = _loc_viec_mua({"hoi_chu_nha": "Chủ có bán gấp không?", "hoi_chu_nha_trich": "chủ bán gấp không", "ma_can": ["SEED0002"]},
                        "ok em", ["ok em"])
    assert "hoi_chu_nha" not in ra2


def test_prompt_cau_hoi_chu_nha_doc_theo_y():
    from aioi.prompts import operations_schema
    from aioi import prompts
    goc = pathlib.Path(prompts.__file__).read_text(encoding="utf-8")
    assert "ĐỌC THEO Ý khách" in goc and '"hoi_chu_nha_trich"' in goc


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
