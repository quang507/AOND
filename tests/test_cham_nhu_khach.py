"""Bộ chấm đọc công tắc từ cai-vps.sh và mặc định chạy NHƯ KHÁCH THẬT (ID chấm là ID thử: không đổi "thu" thì đo đường khách thật không đi).
Không gọi model."""
import importlib.util
import os

GOC = os.path.join(os.path.dirname(__file__), "..")
_sp = importlib.util.spec_from_file_location("cham_kich_ban", os.path.join(GOC, "scripts", "cham-kich-ban.py"))
cham_kich_ban = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(cham_kich_ban)

MAU = '''  MODEL_CHAT="claude-sonnet-5-5"
  MODEL_CHAT_THU="gemini"
  SOAT_GON="bat"
  AGENT_BOC="thu"
  MODEL_AGENT_BOC=""
    printf 'AIOI_CHAT_MODEL=%s\\nAIOI_CHAT_MODEL_THU=%s\\nAIOI_SOAT_GON=%s\\nAIOI_AGENT_BOC=%s\\nAIOI_AGENT_BOC_MODEL=%s\\n' "$MODEL_CHAT" "$MODEL_CHAT_THU" "$SOAT_GON" "$AGENT_BOC" "$MODEL_AGENT_BOC" >> x
'''


def test_cong_tac_nhu_khach_that(tmp_path):
    f = tmp_path / "cai-vps.sh"
    f.write_text(MAU, encoding="utf-8")
    env = cham_kich_ban.cong_tac_vps(str(f))
    assert env["AIOI_CHAT_MODEL"] == "claude-sonnet-5-5" and env["AIOI_SOAT_GON"] == "bat"
    assert env["AIOI_AGENT_BOC"] == "tat"            # "thu" chỉ bật cho ID thử — khách thật đi form
    assert env["AIOI_CHAT_MODEL_THU"] == "tat"       # model riêng của ID thử không áp cho khách thật
    thu = cham_kich_ban.cong_tac_vps(str(f), nhu="thu")
    assert thu["AIOI_AGENT_BOC"] == "thu" and thu["AIOI_CHAT_MODEL_THU"] == "gemini"


def test_cong_tac_tep_that_du_cac_cong_tac_chinh():
    env = cham_kich_ban.cong_tac_vps()
    for k in ("AIOI_CHAT_MODEL", "AIOI_SOAT_GON", "AIOI_PHIEU_LUOT", "AIOI_AGENT_BAN", "AIOI_FORM_BAN_GON", "AIOI_AGENT_BOC"):
        assert k in env, k
    assert "thu" not in env.values()


def test_tom_tat_prompt_tach_boc_va_viet_loi():
    kqs = [{"prompt": [["boc", "h", 24000, 1], ["loi", "s", 3000, 2], ["loi", "s", 5000, 4]]}, {"prompt": [["boc", "h", 26000, 1]]}]
    t = cham_kich_ban.tom_tat_prompt(kqs)
    assert t["boc"]["lan"] == 2 and t["boc"]["chu_trung_vi"] == 25000 and t["loi"]["chu_lon_nhat"] == 5000 and t["loi"]["khoi_trung_vi"] == 3
