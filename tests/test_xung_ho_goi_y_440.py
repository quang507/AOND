"""SRS-5.1zzzzzzz440 — gợi ý xưng hô theo hồ sơ Zalo lưu SQLite: tin chủ động sau khởi động lại vẫn gọi chủ như lượt chat."""
from aioi.assistants import assign_assistant
from aioi.engine import Conversation, SqliteConversationStore, _detect_customer_pronoun


def test_goi_y_xung_ho_qua_khoi_dong_lai(tmp_path):
    kho = SqliteConversationStore(str(tmp_path / "c.db"))
    c = Conversation(user_key="thu-440", assistant=assign_assistant("thu-440"))
    c.xung_ho_goi_y = "anh"
    kho.save(c)
    lai = kho.load("thu-440")
    assert lai.xung_ho_goi_y == "anh"
    assert _detect_customer_pronoun(lai) == "anh"
