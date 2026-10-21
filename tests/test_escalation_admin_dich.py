"""21/10/2026 (SRS-5.1zzzzzzz113). Chủ dự án thêm một admin chỉ đăng nhập CRM (email, không Zalo ID). escalation-feed lấy đích tin nội bộ
(⭐ chấm sao thấp, 🩺 sức khoẻ bot, khách cần người thật) bằng `admins … limit(1)` không lọc — có thể bốc trúng dòng không có Zalo và
tin báo admin mất đích. Đỏ khi truy vấn đích admin không lọc dòng có Zalo ID / SĐT Zalo."""
import pathlib
import re


def test_dich_admin_chi_lay_dong_co_zalo():
    goc = (pathlib.Path(__file__).parents[1] / "bot/supabase/functions/escalation-feed/index.ts").read_text()
    truy_van = re.findall(r'from\("admins"\)\.select\("zalo_user_id, zalo_phone"\)[^;]*', goc)
    assert truy_van, "không thấy truy vấn đích admin"
    for q in truy_van:
        assert "zalo_user_id.not.is.null" in q and "zalo_phone.not.is.null" in q, q
