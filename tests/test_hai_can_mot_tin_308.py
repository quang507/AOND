"""30/10/2026 (SRS-5.1zzzzzzz308). Thử CLI: "anh có 2 căn: căn 1 nhà hẻm Bùi Minh Trực 5 tỷ, căn 2 mặt tiền Phạm Hùng 12 tỷ" → hai căn đều mang
dữ liệu Bùi Minh Trực, căn Phạm Hùng mất — nhánh "add" bỏ ô AI đã bóc cho căn mới rồi đọc lại CẢ tin (chứa hai căn). Đỏ khi gỡ bản sửa."""
from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.mock import MockProvider

TIN = "anh có 2 căn cần bán: căn 1 nhà hẻm đường Bùi Minh Trực quận 8 giá 5 tỷ, căn 2 nhà mặt tiền đường Phạm Hùng quận 8 giá 12 tỷ"


class _Ai(MockProvider):
    def extract(self, system, messages, json_schema):
        if "operations" in json_schema.get("properties", {}):
            bc = {k: TIN for k in ("duong", "gia", "loai_hinh")}
            return {"operations": [
                {"op": "update", "fields": {"loai_hinh": "nha_pho", "duong": "Bùi Minh Trực", "gia": "5 tỷ"}, "bang_chung": bc},
                {"op": "add", "fields": {"loai_hinh": "nha_pho", "duong": "Phạm Hùng", "gia": "12 tỷ"}, "bang_chung": bc,
                 "can_khac_trich": "căn 2"}]}
        return super().extract(system, messages, json_schema)   # đọc lại cả tin → ra căn đầu (Bùi Minh Trực / 5 tỷ)


def test_hai_can_trong_mot_tin_moi_can_giu_o_cua_rieng_no():
    eng = Engine(_Ai(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")))
    eng.handle("s308h", TIN)
    ds = [li.prop.fields for li in eng.conversation("s308h").listings]
    assert len(ds) == 2
    assert {(f.get("duong"), f.get("gia")) for f in ds} == {("Bùi Minh Trực", "5 tỷ"), ("Phạm Hùng", "12 tỷ")}


def test_nhac_ten_duong_tim_ra_can_chi_co_o_duong():
    eng = Engine(_Ai(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")))
    eng.handle("s308m", TIN)
    conv = eng.conversation("s308m")
    li = eng._match_listing(conv, "căn Bùi Minh Trực")
    assert li is not None and li.prop.fields.get("gia") == "5 tỷ" and li.listing_id != conv.active_listing_id
