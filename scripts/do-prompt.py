"""Đo prompt THẬT lõi gửi đi mỗi lượt và soát ba điều dễ hỏng khi sửa prompt (SRS-5.1zzzzzzz504). KHÔNG gọi model, không đọc DB, không tốn
tiền: lõi chạy với một provider giả ghi lại system + công cụ + lịch sử của từng lần gọi. Thay cho bộ chấm đã gỡ ở việc "sửa prompt xong
biết ngay to nhỏ ra sao" — không chấm lời bot (lời bot đọc ở chat thật trong DB).

Chạy:  python scripts/do-prompt.py            # bảng số ký tự từng lần gọi + ba phép soát; thoát 1 nếu có phép trượt
       python scripts/do-prompt.py --luu DIR  # thêm: ghi nguyên văn từng lần gọi ra DIR để đọc

Ba phép soát:
1. BẢNG LUẬT: mọi dấu đầu khối trong `agent_gop.BANG_LUAT` còn khớp một khối của `OPERATIONS_SYSTEM_BAN` (đổi câu mở đầu một khối mà quên
   sửa bảng thì khối rơi về system mọi lượt — đã gặp 16/11).
2. KIẾN THỨC NGHỀ có mặt ở system bước ghi lẫn bước viết của lượt hỏi thông tin người bán (16/11: thêm vào từ điển cũ, không tới model).
3. CACHE: phần cố định (trước `RANH_GIOI_CACHE`) và bộ công cụ của cùng một bước GIỐNG HỆT giữa hai khách có tên trợ lý khác nhau — tên
   trợ lý nằm trong phần cố định thì mỗi tên là một bản cache riêng (ghi cache là khoản tiền lớn nhất mỗi lần gọi).
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import sys
import tempfile

GOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
for d in open(os.path.join(GOC, "bot", "cau-hinh-loi.env"), encoding="utf-8"):   # công tắc như lõi production
    if "=" in d and not d.lstrip().startswith("#"):
        k, v = d.strip().split("=", 1)
        os.environ.setdefault(k, v)
os.environ["SUPABASE_URL"] = ""
os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)
logging.disable(logging.CRITICAL)
sys.path.insert(0, os.path.join(GOC, "src"))
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from aioi import agent_gop  # noqa: E402
from aioi import prompts as P  # noqa: E402
from aioi.engine import Engine, SqliteConversationStore  # noqa: E402
from aioi.llm.base import LLMProvider, ToolCall, ToolTurn, tach_on_dinh  # noqa: E402

GHI: list[dict] = []
LUOT, Y_DINH, LOI = ["?"], ["sell"], ["Nhà mình ở đường nào vậy anh?"]


class Gia(LLMProvider):
    """Provider giả: ghi lại mọi lần gọi; bước ghi gọi đúng một công cụ rồi dừng, bước viết trả một câu — đủ để lõi đi đúng đường thật."""

    def _ghi(self, loai, system, messages, tools=None, schema=None):
        on, dong = tach_on_dinh(system or "")
        m = json.dumps([getattr(x, "content", None) or (x.get("content") if isinstance(x, dict) else "") for x in messages],
                       ensure_ascii=False, default=str)
        t = json.dumps(tools, ensure_ascii=False) if tools else (json.dumps(schema, ensure_ascii=False) if schema else "")
        GHI.append({"luot": LUOT[0], "loai": loai, "on_dinh": on, "dong": dong, "cong_cu": t, "lich_su": m})

    def chat(self, system, messages, max_tokens=256):
        self._ghi("viet-don", system, messages)
        return LOI[0]

    def reply(self, system, messages, max_tokens=256):
        self._ghi("viet-don", system, messages)
        return LOI[0]

    def extract(self, system, messages, json_schema):
        ten = "soat" if "SẮP GỬI" in (system or "")[:200] else "form"
        self._ghi(ten, system, messages, schema=json_schema)
        return {"user_intent": Y_DINH[0]} if "user_intent" in ((json_schema or {}).get("properties") or {}) else {}

    def converse(self, system, messages, tools, max_tokens=1024):
        ten = [t.get("name") for t in tools or []]
        buoc1 = any(n in ten for n in ("ghi_o", "ghi_y_khach", "ghi_nhu_cau"))
        self._ghi("buoc1-ghi" if buoc1 else "buoc2-viet", system, messages, tools)
        da_goi = any(isinstance(m.get("content"), list) for m in messages if isinstance(m, dict))
        if buoc1 and not da_goi:
            n = "ghi_y_khach" if "ghi_y_khach" in ten else ten[0]
            tc = ToolCall(id="t1", name=n, input={"user_intent": Y_DINH[0]})
            return ToolTurn(text="", tool_calls=[tc], assistant_content=[{"type": "tool_use", "id": "t1", "name": n, "input": tc.input}],
                            stop_reason="tool_use")
        return ToolTurn(text="" if buoc1 else LOI[0] + "\n" + agent_gop.DAU_KHAI_HOI + "[]", tool_calls=[])   # bước viết tự khai ô hỏi (SRS-511)

    def describe_media(self, *a, **k):
        return ""

    def group_media(self, *a, **k):
        return {}

    def extract_media(self, *a, **k):
        return {}


CAN = {"loai_hinh": "nha_pho", "dia_chi": "12 Hoàng Hoa Thám", "duong": "Hoàng Hoa Thám", "quan": "Bình Thạnh", "gia": "12 tỷ",
       "ket_cau": "1 trệt 2 lầu", "dien_tich_dat": "4x16"}
BAN_TIN = "📋 Em sẽ rao như vầy nhé:\n\nNhà Hoàng Hoa Thám 12 tỷ\n\nMô tả.\n\n- 64 m²\n\nNhắn Zalo ngay!\n\nAnh thấy ổn chưa ạ?"


def chay(eng: Engine, key: str, nhan: str, ban: bool = True) -> None:
    """Một cuộc chat mẫu: người bán 5 lượt (chào · hỏi thông tin · trình bản tin · duyệt · hỏi phí) hoặc người mua 2 lượt."""
    def luot(ten, cau, loi=None):
        LUOT[0] = f"{nhan} {ten}"
        if loi:
            LOI[0] = loi
        try:
            eng.handle(key, cau)
        except Exception as e:  # noqa: BLE001 — in ra, đo tiếp các lượt còn lại
            print(f"  ! lượt {LUOT[0]} lỗi: {type(e).__name__}: {str(e)[:160]}")
    if not ban:
        Y_DINH[0] = "buy"
        luot("M1 chào", "anh muốn tìm mua nhà quận 7 tầm 5 tỷ", "Anh tìm nhà phố hay căn hộ ạ?")
        luot("M2 nhu cầu", "nhà phố, 3 phòng ngủ", "Em lọc liền.")
        return
    Y_DINH[0] = "sell"
    luot("1 chào", "chào em, anh muốn gửi bán nhà", "Nhà mình ở đường nào vậy anh?")
    eng.conversation(key).prop.update({"loai_hinh": "nha_pho"})
    luot("2 hỏi thông tin", "nhà ở Hoàng Hoa Thám Bình Thạnh nha")
    eng.conversation(key).prop.update(CAN)
    luot("3 trình bản tin", "giá 12 tỷ em", BAN_TIN)
    luot("4 duyệt", "ok em đăng đi", "Em xin phép đăng tin ạ! Anh biết phí bên em chưa?")
    luot("5 hỏi phí", "phí bao nhiêu vậy em", "Phí tính khi bán được anh nha.")


def hai_khoa_khac_ten(eng: Engine) -> tuple[str, str]:
    a, ten_a = "do-prompt-a", None
    ten_a = eng.conversation(a).assistant.name
    for i in range(200):
        b = f"do-prompt-b{i}"
        if eng.conversation(b).assistant.name != ten_a:
            return a, b
    return a, a


def main() -> int:
    luu = sys.argv[sys.argv.index("--luu") + 1] if "--luu" in sys.argv else ""
    with tempfile.TemporaryDirectory(prefix="dop-", ignore_cleanup_errors=True) as d:
        eng = Engine(Gia(), conversation_store=SqliteConversationStore(os.path.join(d, "kb.db")))
        a, b = hai_khoa_khac_ten(eng)
        ten_a, ten_b = eng.conversation(a).assistant.name, eng.conversation(b).assistant.name
        chay(eng, a, "A")
        chay(eng, b, "B")
        chay(eng, "do-prompt-mua", "A", ban=False)

    print(f"{'lượt':22} {'lần gọi':11} {'cố định':>8} {'đổi/lượt':>9} {'công cụ':>8} {'lịch sử':>8}")
    tong: dict[str, int] = {}
    for i, g in enumerate(x for x in GHI if x["luot"].startswith("A ")):
        so = [len(g[k]) for k in ("on_dinh", "dong", "cong_cu", "lich_su")]
        print(f"{g['luot'][2:]:22} {g['loai']:11} {so[0]:8} {so[1]:9} {so[2]:8} {so[3]:8}")
        tong[g["luot"][2:]] = tong.get(g["luot"][2:], 0) + sum(so)
        if luu:
            os.makedirs(luu, exist_ok=True)
            ten = re.sub(r"[^a-zA-Z0-9]+", "_", f"{i:02d}_{g['luot']}_{g['loai']}")
            io.open(os.path.join(luu, ten + ".txt"), "w", encoding="utf-8").write(
                g["on_dinh"] + "\n\n######## SAU RANH GIỚI CACHE ########\n" + g["dong"] + "\n\n######## CÔNG CỤ / SCHEMA ########\n" + g["cong_cu"])
    print("\nTổng ký tự mỗi lượt:", "  ·  ".join(f"{k}: {v:,}".replace(",", ".") for k, v in tong.items()))
    print(f"GIONG {len(P.GIONG):,} / 4.000 · LEAN_SYSTEM_PROMPT {len(P.LEAN_SYSTEM_PROMPT):,} / 8.000".replace(",", "."))

    loi: list[str] = []
    # 1. bảng luật
    khoi = [k.lstrip("\n") for k in agent_gop._khoi(P.OPERATIONS_SYSTEM_BAN.replace(P.SLANG_NOTES, "")) if k.strip()]
    lac = [t for t, _ in agent_gop.BANG_LUAT if not any(k.startswith(t) for k in khoi)]
    if lac:
        loi.append("BẢNG LUẬT: dấu đầu khối không còn khớp khối nào — " + " | ".join(x[:60] for x in lac))
    # 2. kiến thức nghề
    def cua(nhan, loai):
        return next((g for g in GHI if g["luot"] == nhan and g["loai"] == loai), None)
    for loai in ("buoc1-ghi", "buoc2-viet"):
        g = cua("A 2 hỏi thông tin", loai)
        if g is None:
            loi.append(f"KIẾN THỨC NGHỀ: không thấy lần gọi {loai} ở lượt hỏi thông tin (lõi không đi đường vòng công cụ?)")
        elif "KIẾN THỨC NGHỀ" not in g["on_dinh"] + g["dong"]:
            loi.append(f"KIẾN THỨC NGHỀ: không có trong system {loai} của lượt hỏi thông tin")
    # 3. cache không tách theo tên trợ lý
    if ten_a == ten_b:
        loi.append("CACHE: không tìm được hai khách có tên trợ lý khác nhau để so")
    for luot_ten in ("2 hỏi thông tin", "3 trình bản tin", "4 duyệt"):
        for loai in ("buoc1-ghi", "buoc2-viet"):
            x, y = cua(f"A {luot_ten}", loai), cua(f"B {luot_ten}", loai)
            if x and y and (x["on_dinh"] != y["on_dinh"] or x["cong_cu"] != y["cong_cu"]):
                loi.append(f"CACHE: phần cố định / công cụ của {loai} ở lượt \"{luot_ten}\" khác nhau giữa trợ lý {ten_a} và {ten_b}")
    print(f"\nSOÁT: {3 - len({x.split(':')[0] for x in loi})}/3 phép đạt")
    for x in loi:
        print("  ✗", x)
    return 1 if loi else 0


if __name__ == "__main__":
    sys.exit(main())
