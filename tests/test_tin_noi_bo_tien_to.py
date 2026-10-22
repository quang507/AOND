"""22/10/2026 (SRS-5.1zzzzzzz134). Chủ dự án: "tin nào là tin debug tin nào là tin cho khách thật phải phân tách rõ ra, tin cho debug phải bắt đầu
với $$$$$". Tin hệ thống gửi CTV / admin (🙋 khách cần người thật, ⭐ chấm sao thấp, 🩺 sức khoẻ, báo cáo) nhìn y như tin khách thật. Đỏ khi
escalation-feed không đánh cờ `noi_bo` theo ĐÍCH (chủ nhà = không, CTV / admin = có), khi bridge không mở tin nội bộ bằng "$$$$$ ", hoặc khi
tin cho khách thật cũng bị gắn tiền tố; và khi workflow cài VPS không đưa khoá Gemini từ Vault vào .env lõi."""
import pathlib
import re

GOC = pathlib.Path(__file__).resolve().parents[1]


def _doc(rel: str) -> str:
    return (GOC / rel).read_text(encoding="utf-8")


def test_escalation_feed_danh_co_noi_bo_theo_dich():
    ts = _doc("bot/supabase/functions/escalation-feed/index.ts")
    assert "noi_bo: !chuNha" in ts                                   # đích CTV / admin = nội bộ, đích chủ nhà = không
    assert re.search(r'name: mua\?\.name \?\? ban\?\.name \?\? "khách", noi_bo: false', ts)   # tin soạn sẵn cho khách / chủ nhà: không tiền tố


def test_bridge_mo_tin_noi_bo_bang_dong_dola():
    mjs = _doc("bot/bridge-zca/index.mjs")
    assert 'it.noi_bo ? "$$$$$ " : ""' in mjs
    # tiền tố chỉ gắn ở đúng một chỗ gửi tin kéo từ feed, không rải
    assert mjs.count('? "$$$$$ " :') == 1


def test_cai_vps_dua_khoa_gemini_tu_vault_vao_env_loi():
    yml = _doc(".github/workflows/apply-migration.yml")
    sh = _doc("bot/bridge-zca/cai-vps.sh")
    for ten in ("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY_4"):
        assert f"'{ten}'" in yml
    assert "add-mask" in yml and "GEMINI_API_KEYS_MOI" in yml        # che trong log, đi qua stdin, không qua dòng lệnh
    assert "read -r GEMINI_API_KEYS_MOI" in yml
    assert "GEMINI_API_KEYS=%s" in sh and "chmod 600 /opt/aond_core/.env.moi" in sh
    assert "echo \"$GEMINI_API_KEYS_MOI\"" not in sh                 # không in giá trị khoá


def test_cai_vps_dua_khoa_anthropic_tu_vault_vao_env_loi():
    """SRS-5.1zzzzzzz135: khoá Claude trong .env lõi hết số dư mà Vault có khoá còn dùng → cai-vps ghi đè từ Vault (qua stdin, che log)."""
    yml = _doc(".github/workflows/apply-migration.yml")
    sh = _doc("bot/bridge-zca/cai-vps.sh")
    assert "'ANTHROPIC_API_KEY'" in yml and 'read -r ANTHROPIC_KEY_MOI' in yml and '"$AK"' in yml
    assert "ANTHROPIC_API_KEY=%s" in sh and "echo \"$ANTHROPIC_KEY_MOI\"" not in sh
