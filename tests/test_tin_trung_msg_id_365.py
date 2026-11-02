"""SRS-5.1zzzzzzz365 — sổ lỗi 21/10–01/11: "supabase sync: ghi tin vào messages hỏng: HTTP Error 409: Conflict" 34 lần. Nguyên nhân: khoá duy
nhất `messages.zalo_msg_id`; cùng một tin tới hai lần (bridge thử lại; khách thả cảm xúc nhiều lần lên CÙNG một tin — msg_id `react-<luồng>-<tin>`)
→ 409 → `ghi_luot_chat` tưởng hội thoại đã xoá, ghi lại vẫn 409 rồi ném → dòng LỜI BOT của lượt mất khỏi CRM. Sửa: dòng khách ghi kiểu
"trùng khoá thì bỏ qua", lời bot vẫn ghi. (TypeError 'NoneType' 15 lần tới 29/10 đã hết từ SRS-276 — tên người bán NULL.)"""
import io
import urllib.error

from aioi.supabase_store import SupabaseConversationStore


class _Kho(SupabaseConversationStore):
    """PostgREST giả: unique zalo_msg_id — POST trùng khoá mà không `on_conflict` + ignore-duplicates thì 409 như thật."""

    def __init__(self):
        super().__init__(url="https://x.invalid", key="khoa-gia")
        self.msg_ids, self.dong = set(), []

    def _hoi_thoai_chung(self, user_key, user_name, vai):
        return "conv-1"

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "POST" and endpoint.startswith("messages"):
            mid = (data or {}).get("zalo_msg_id")
            if mid and mid in self.msg_ids:
                if "on_conflict=zalo_msg_id" in endpoint and "ignore-duplicates" in (prefer or ""):
                    return []
                raise urllib.error.HTTPError(endpoint, 409, "Conflict", {}, io.BytesIO(b""))
            if mid:
                self.msg_ids.add(mid)
            self.dong.append(data)
        return []


def test_cung_tin_toi_hai_lan_van_ghi_loi_bot():
    k = _Kho()
    k.ghi_luot_chat("thu-365", "[khách thả cảm xúc /-heart]", "Em vẫn ở đây ạ.", zalo_msg_id="react-thu-365-111")
    k.ghi_luot_chat("thu-365", "[khách thả cảm xúc /-heart]", "Tim đủ đầy rồi ạ.", zalo_msg_id="react-thu-365-111")   # cùng tin được thả lần 2
    k.ghi_luot_chat("thu-365", "anh hỏi căn Q7", "Dạ căn Q7 còn ạ.", zalo_msg_id="m-thu-1")
    k.ghi_luot_chat("thu-365", "anh hỏi căn Q7", "Dạ căn Q7 còn ạ.", zalo_msg_id="m-thu-1")                      # bridge thử lại cùng tin
    bot = [d["body"] for d in k.dong if d.get("sender") == "bot"]
    assert bot == ["Em vẫn ở đây ạ.", "Tim đủ đầy rồi ạ.", "Dạ căn Q7 còn ạ.", "Dạ căn Q7 còn ạ."]
    assert sum(1 for d in k.dong if d.get("zalo_msg_id") == "react-thu-365-111") == 1    # tin khách vẫn một dòng
