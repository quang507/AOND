"""22/10/2026 (SRS-5.1zzzzzzz134). Chủ dự án: "tin nào là tin debug tin nào là tin cho khách thật phải phân tách rõ ra, tin cho debug phải bắt đầu
với $$$$$". Tin hệ thống gửi CTV / admin (🙋 khách cần người thật, ⭐ chấm sao thấp, 🩺 sức khoẻ, báo cáo) nhìn y như tin khách thật. Đỏ khi
escalation-feed không đánh cờ `noi_bo` theo ĐÍCH (chủ nhà = không, CTV / admin = có), khi bridge không mở tin nội bộ bằng "$$$$$ ", hoặc khi
tin cho khách thật cũng bị gắn tiền tố. (Bài kiểm workflow cài VPS đưa khoá Vault vào .env lõi gỡ cùng VPS — SRS-5.1zzzzzzz401.)"""
import pathlib
import re

GOC = pathlib.Path(__file__).resolve().parents[1]


def _doc(rel: str) -> str:
    return (GOC / rel).read_text(encoding="utf-8")


def test_escalation_feed_danh_co_noi_bo_theo_dich():
    ts = _doc("bot/supabase/functions/escalation-feed/index.ts")
    assert "noi_bo: !chuNha" in ts                                   # đích CTV / admin = nội bộ, đích chủ nhà = không
    assert "noi_dung_gui" not in ts.split("\n", 8)[-1]               # nhánh tin soạn sẵn đã gỡ (02/11/2026): tin cho khách do lõi gửi


def test_bridge_mo_tin_noi_bo_bang_dong_dola():
    mjs = _doc("bot/bridge-zca/index.mjs")
    assert 'it.noi_bo ? "$$$$$ " : ""' in mjs
    # tiền tố chỉ gắn ở đúng một chỗ gửi tin kéo từ feed, không rải
    assert mjs.count('? "$$$$$ " :') == 1
