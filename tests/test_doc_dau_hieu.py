"""19/10/2026 (SRS-5.1zzzzzzz74): bot đọc dấu hiệu như môi giới — "căn nhà ở Âu Cơ Quận 11" là nhà phố, "80m 5 tầng" là diện tích
đất. Ca gốc (chat thử chủ dự án 15:25): bot hỏi "80m² đó là diện tích đất hay diện tích sàn" — prompt bảo "một con số m2 không rõ thì
đừng đoán, để tạm dien_tich", nên mọi nhà phố đều bị hỏi lại. Luật nằm trong hai prompt bóc tách (lượt lập thao tác + bóc tách rời);
bắn thử model thật ở bot/tests/ban-thu-ban.sh kịch bản 2. Đỏ khi bỏ khối ĐỌC DẤU HIỆU."""
from aioi.prompts import EXTRACTION_SYSTEM, OPERATIONS_SYSTEM


def test_hai_prompt_boc_tach_co_luat_doc_dau_hieu():
    for p in (OPERATIONS_SYSTEM, EXTRACTION_SYSTEM):
        assert "ĐỌC DẤU HIỆU NHƯ MÔI GIỚI LÂU NĂM" in p
        assert "80m 5 tầng" in p and "dien_tich_dat" in p            # một số m² kèm số tầng = đất
        assert "Quận 1–12" in p and "nha_pho" in p                    # quận nội thành → nhà phố
        assert "Bình Chánh" in p                                      # vùng ven chỉ nói "nhà" → hỏi


def test_khong_con_luat_cam_doan_dat_hay_nha():
    assert "ĐỪNG đoán đó là cái nào" not in EXTRACTION_SYSTEM
