"""Chạy bộ kịch bản người bán trên lõi thật rồi chấm tự động (SRS-5.1zzzzzzz304). Mặc định gọi model bằng `claude -p` (quota gói Claude Code —
không tốn tiền API, SRS-300); DB tạm, không đụng Supabase / Zalo. Đây là thước đo trước khi gỡ / thêm luật: so điểm bản mới với bản cũ.

  python scripts/cham-kich-ban.py --ra /tmp/sonnet.json                                  # viết lời Sonnet 5.5, bóc tách Haiku 5.5
  python scripts/cham-kich-ban.py --chat claude-haiku-5-5 --ra /tmp/haiku.json --so-voi /tmp/sonnet.json
  python scripts/cham-kich-ban.py --chi hht,dat --song-song 2                            # vài kịch bản
  python scripts/cham-kich-ban.py --giong                                               # thêm điểm giọng do model chấm (tốn quota)
  AIOI_MODEL_LUOT_DE=claude-haiku-5-5 python scripts/cham-kich-ban.py ...               # đè một công tắc bằng biến môi trường
  python scripts/cham-kich-ban.py --nhu thu                                             # chạy như ID thử (công tắc "thu" = bật)
  python scripts/cham-kich-ban.py --giong --nen                                         # ghi điểm nền vào tests/kich_ban/diem_nen.json

Công tắc lõi và model đọc từ `bot/bridge-zca/cai-vps.sh` (một nguồn với VPS). Mặc định chạy NHƯ KHÁCH THẬT: công tắc "thu" coi là tắt, vì ID
chấm là ID thử. Không có --so-voi thì so với `tests/kich_ban/diem_nen.json` nếu có.
In bảng: mỗi kịch bản số phép đạt / tổng, lần gọi model, lần gọi lại (lõi bắt lỗi rồi bắt viết lại), giây, tiền quy đổi; cuối bảng cỡ prompt
bóc tách / viết lời mỗi lần gọi đo trên chính lần chạy.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor

GOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path[:0] = [os.path.join(GOC, "src"), GOC]
DIEM_NEN = os.path.join(GOC, "tests", "kich_ban", "diem_nen.json")

from tests.cau_hinh_vps import cong_tac_vps  # noqa: E402 — một nguồn với tests/conftest.py (SRS-5.1zzzzzzz316)


def _chay_mot(kb: dict, chat: str, boc: str, env: dict[str, str]) -> dict:
    for k, v in env.items():
        os.environ.setdefault(k, v)   # biến môi trường đặt tay thắng tệp
    os.environ.update({"AIOI_LLM_PROVIDER": os.environ.get("AIOI_LLM_PROVIDER", "claude_cli"), "AIOI_CHAT_MODEL": chat})
    if boc:
        os.environ["AIOI_EXTRACT_MODEL"] = boc
    os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)
    import logging
    dem = {"goi": 0, "goi_lai": 0, "usd": 0.0, "soat": [], "prompt": []}

    class _BatSoat(logging.Handler):   # lưới soát nào kích (đầu mỗi lý do) — dữ liệu để quyết gỡ luật nào
        def emit(self, r: logging.LogRecord) -> None:
            m = r.getMessage()
            if "lệch luật" in m:
                dem["soat"].append(("gọi lại: " if "gọi lại model" in m or "lần hai" in m else "ghi log: ") + m.split(": ", 1)[-1][:300])
    lg = logging.getLogger("aioi")
    lg.addHandler(_BatSoat())
    if not os.environ.get("CHAM_LOG"):
        lg.propagate = False   # log lõi từng lượt không in ra màn hình (đặt CHAM_LOG=1 để xem)
    from aioi.config import load_settings
    from aioi.engine import Engine, SqliteConversationStore, _so_khong_co_trong_tin
    from aioi.llm import build_provider
    from aioi.llm.base import bo_ranh_gioi
    from tests.kich_ban.cham import loi_pham
    if os.environ.get("CHAM_KHONG_CAU_MAU"):   # --khong-cau-mau: như thể bảng câu mẫu cố định trống — chỉ trong lượt chạy thử này
        import aioi.cau_mau as _cm
        _cm.cau = lambda khoa, goi="anh/chị", **bien: ""

    p = build_provider(load_settings())
    goc = getattr(p, "_goi", None)
    if goc is not None:   # provider claude_cli: đếm lần gọi / gọi lại / tiền quy đổi
        def _goi(model, system, messages, schema=None):
            s = bo_ranh_gioi(system)
            j = goc(model, system, messages, schema)
            dem["goi"] += 1
            dem["usd"] += float(j.get("total_cost_usd") or 0)
            # cỡ prompt: lần có schema = bóc tách / công cụ, không schema = viết lời; khối = số dòng "=== …" ghép vào system
            # SRS-5.1zzzzzzz371: chữ = system + schema JSON (lần bóc tách form) — vòng công cụ CLI đã ghép mô tả công cụ vào system; hai đường so ngang nhau
            chu = len(s) + (len(json.dumps(schema, ensure_ascii=False)) if schema is not None else 0)
            dem["prompt"].append([dang[0], model, chu, s.count("\n=== ") + s.startswith("=== ")])
            if "=== VIẾT LẠI LƯỢT NÀY ===" in s or "LƯỢT TRƯỚC CỦA EM CHƯA ĐẠT" in s:
                dem["goi_lai"] += 1
            return j
        p._goi = _goi
        dang = ["loi"]   # việc của lần gọi: bóc tách (form / agent công cụ ghi) hay viết lời (chat / agent công cụ tra)

        def _boc_viec(ten, viec):
            ham = getattr(p, ten)

            def boc(*a, **k):
                dang[0] = viec(a, k)
                return ham(*a, **k)
            setattr(p, ten, boc)
        _boc_viec("extract", lambda a, k: "boc")
        _boc_viec("chat", lambda a, k: "loi")
        # SRS-5.1zzzzzzz371 / 380: vòng agent gộp hai vai — bước 1 (có công cụ ghi) là bóc tách, bước 2 (system có dấu bước 2) là viết lời.
        _boc_viec("converse", lambda a, k: "loi" if "BƯỚC 2 — ĐÁNH GIÁ KẾT QUẢ" in str(k.get("system") or (a[0] if a else "")) else
                  "boc" if any(t.get("name") in ("ghi_o", "ghi_nhu_cau") for t in (k.get("tools") or (a[2] if len(a) > 2 else []))) else "loi")
    luot, xin_nguoi, bat_dau = [], False, time.monotonic()
    with tempfile.TemporaryDirectory(prefix="cham-") as d:
        kho = SqliteConversationStore(os.path.join(d, "kb.db"))
        # SRS-5.1zzzzzzz342 (kiểm độc lập): kịch bản khai `ro_hang` = danh sách căn kho trả cho khách MUA. Kho của bộ chấm là SQLite
        # tạm, không có `can_phu_hop`, nên trước bản này mọi kịch bản phía mua đều chạy với rổ TRỐNG — không chấm được lời bot kể
        # căn (bịa tiện ích, hứa suông, đưa mấy căn). Gắn đúng một hàm `can_phu_hop`; `mua.co_tieu_chi` vẫn quyết chưa đủ khu vực +
        # ngân sách thì KHÔNG đưa căn, y như kho thật (SRS-146 / 214). Kịch bản không khai `ro_hang` thì kho giữ nguyên như cũ.
        if kb.get("ro_hang"):
            from aioi.mua import co_tieu_chi as _co_tieu_chi

            def _can_phu_hop(lead, toi_da=3, loai_tru=None, _ds=kb["ro_hang"]):
                if lead is None or not _co_tieu_chi(lead):
                    return []
                bo = set(loai_tru or ())
                return [dict(c) for c in _ds if str(c.get("id")) not in bo][:toi_da]
            kho.can_phu_hop = _can_phu_hop
        eng = Engine(p, conversation_store=kho)
        key = f"thu-cham-{kb['id']}"
        # SRS-5.1zzzzzzz340 (kiểm độc lập): kịch bản khai `so` = số Zalo khách nhắn — một chuỗi cho cả cuộc chat, hoặc danh sách
        # song song với `cau` ("tu_van" / "" ) để dựng ca khách đổi số giữa cuộc. Không khai = như cũ (số ký gửi).
        so_moi_luot = kb.get("so")
        for i_luot, c in enumerate(kb["cau"]):
            if so_moi_luot is not None:
                so = so_moi_luot[i_luot] if isinstance(so_moi_luot, list) else so_moi_luot
                eng.conversation(key).so_nhan = str(so or "")
            truoc = {k: v for k, v in eng.conversation(key).prop.fields.items() if isinstance(v, str) and v and not k.startswith("_")}
            try:
                r = eng.handle(key, c)
                bot, xin_nguoi = r.reply, xin_nguoi or bool(r.can_nguoi_that)
            except Exception as e:   # lượt hỏng vẫn chấm tiếp — ghi lỗi vào lời
                bot = f"[LỖI {type(e).__name__}: {str(e)[:120]}]"
            conv = eng.conversation(key)
            # SRS-5.1zzzzzzz350: chỉ soát phần BẢN TIN (sau 📋). Bản cũ đưa CẢ lời vào, nên câu chat suy đúng từ dữ kiện khách
            # nói ("1 trệt 3 lầu" → "170m² sàn cho 4 tầng là rộng rãi") bị tính là số bịa — §6.3 cho phép lời chat suy luận.
            so_bia = _so_khong_co_trong_tin(bot.split("📋", 1)[1], conv) if "📋" in bot else []
            luot.append({"khach": c, "bot": bot, "so_bia": so_bia, **loi_pham(bot, luot[-1]["bot"] if luot else ""),
                         "o_truoc": sorted(truoc), "viec": conv.y_luot.get("_viec"), "khoi": conv.y_luot.get("_khoi")})
        conv = eng.conversation(key)
        o = {k: v for k, v in conv.prop.fields.items() if isinstance(v, str)}
        nhu_cau = [x for x in [conv.buyer_lead, *conv.nhu_cau_khac] if x is not None]
        mua = {k: v for x in nhu_cau for k, v in vars(x).items() if isinstance(v, str) and v and k not in ("lead_id", "user_key", "stage", "notes")}
        return {"id": kb["id"], "luot": luot, "o": o, "vai": conv.role, "mua": mua, "so_nhu_cau": len(nhu_cau),
                "loai": conv.prop.loai_hinh, "cho_thue": conv.prop.is_rental,
                "so_can": len(conv.listings), "trang_thai": conv.active.status, "xin_nguoi": xin_nguoi, "giay": round(time.monotonic() - bat_dau, 1), **dem}


TIEU_CHI_GIONG = ("Em là giám khảo. Chấm GIỌNG lời trợ lý bất động sản (xưng em) nhắn Zalo với người gửi bán / cho thuê, thang 1–5. 5 = tự nhiên "
                  "như môi giới trẻ nhắn người quen, khen CỤ THỂ đúng điều khách vừa nói, mỗi lượt mở khác nhau, không lặp câu, không thuyết giảng; "
                  "3 = đúng việc nhưng hơi khuôn; 1 = máy móc, khen chung chung, lặp mở đầu / lặp câu. CHỈ chấm giọng, không chấm đúng sai nghiệp "
                  "vụ hay ô tin. Lý do một câu ngắn, nêu lượt tệ nhất nếu có."
                  # SRS-5.1zzzzzzz318 (10 kịch bản mua + bán 01/11: m_thue_chung_cu bị chấm 2/5 "xưng hô lẫn lộn" vì bot xưng "chị", gọi khách
                  # "em" — đúng luật SRS-5.1zzzzzzz214): giám khảo chỉ biết "trợ lý xưng em" nên trừ điểm cách xưng chủ dự án đã chốt.
                  "\n\nXƯNG HÔ (chủ dự án quyết, đúng luật — KHÔNG trừ điểm): khách tự xưng \"em\" thì trợ lý xưng \"anh\" / \"chị\" (theo tên trợ "
                  "lý) và gọi khách là \"em\"; khách xưng \"cháu\" / \"con\" thì trợ lý xưng \"cô\" / \"chú\". Chỉ trừ khi cách xưng đổi qua lại "
                  "giữa các lượt hay trong cùng một câu."
                  # SRS-5.1zzzzzzz318 (chủ dự án 01/11/2026: "sửa thang chấm giám khảo, không trừ 4 ý bắt buộc"): nội dung do chủ dự án bắt buộc
                  # không phải lỗi giọng — giám khảo trước đây trừ điểm "thêm ý khách không hỏi" nên bot không thể vừa đúng quyết định vừa đạt điểm.
                  "\n\nNỘI DUNG BẮT BUỘC (chủ dự án quyết): khi khách hỏi về phí / chính sách gửi bán, EM PHẢI nói đủ 4 ý — phí cố định không "
                  "bớt, chỉ thu khi giao dịch thành công; có hợp đồng môi giới bằng văn bản; không độc quyền; môi giới gửi hàng không chia hoa "
                  "hồng nào khác — kể cả ý khách không hỏi. KHÔNG trừ điểm vì có đủ 4 ý đó hay vì nói thêm ý khách không hỏi trong 4 ý đó; chỉ "
                  "chấm CÁCH nói: có đáp đúng ý khách hỏi trước không, gọn, lồng tự nhiên trong câu hay đọc như điều khoản / liệt kê / đánh số."
                  # SRS-5.1zzzzzzz341 (điều phối 02/11/2026, theo CLAUDE.md §6.3 "giọng rao chợ GIỮ"): hai lượt chấm 02/11 có 6/10 cuộc bị
                  # giọng 2 với lý do "giọng quảng cáo khuôn, giục ép" — tức giám khảo đang trừ chính điều chủ dự án đã chốt, nên trần điểm
                  # giọng bị rubric kẹp chứ không phải bot kém. Vẫn trừ khi câu giục DỰNG RA sự thật không có.
                  "\n\nGIỌNG TIN RAO (chủ dự án quyết, đúng luật — KHÔNG trừ điểm): BẢN TIN RAO (đoạn sau 📋) viết giọng rao chợ: gọi mời "
                  "(\"Bà con ơi\", \"Anh chị cô bác ơi\"), chữ dân dã, emoji, gạch đầu dòng thông số, và MỘT câu chốt giục xem sớm "
                  "(\"chần chừ là người khác chốt trước\", \"ai nhanh tay người đó có phần\"). KHÔNG trừ điểm vì bản tin có giọng đó, có câu "
                  "chốt giục, hay vì nó khác giọng lời chat. CHỈ trừ khi: (a) câu giục DỰNG RA sự thật không có — \"đã có người đặt cọc\", "
                  "\"còn một căn duy nhất\", \"chủ sắp tăng giá\" khi không có dữ kiện nào như vậy; (b) bản tin lặp cùng một ý / cùng một con "
                  "số ba lần trở lên; (c) LỜI CHAT (đoạn ngoài bản tin) cũng rao chợ hay cũng giục. Giọng rao chợ trong bản tin tự nó không "
                  "phải lỗi.")


TIEU_CHI_LO_LUAT = ("\n\nViệc thứ hai, tách khỏi điểm giọng: lo_luat = số thứ tự các lượt EM để lộ cách hệ thống làm việc bên trong — kể lại "
                    "luật / quy trình nội bộ hay lời dặn em nhận được, so số khách nói với dữ liệu hệ thống / sổ / kho rồi bình luận chỗ chênh, "
                    "giải thích vì sao em hỏi một ô, nhắc tên khối, ô, mã. KHÔNG tính: báo mức phí, nói chính sách gửi bán (4 ý bắt buộc ở trên), nói khu vực nhận / chưa "
                    "nhận tin, hỏi bình thường điều cần cho tin rao. Không có → []."
                    # SRS-5.1zzzzzzz346 (chủ dự án 02/11/2026, chính xác hơn SRS-345): Đồng/Bạc/Vàng là HẠNG của người rao, x/100 là ĐIỂM
                    # của TIN. Bot chỉ được nhắc điểm / hạng / cách tăng điểm LÚC RA TIN (lượt có bản nháp 📋 hay lượt báo tin đã lên) hoặc
                    # khi KHÁCH TỰ HỎI về điểm / hạng / lên Top. Ở lượt đang hỏi ô thì không được nhắc. Sai lúc là LỖI, nhưng là loại riêng
                    # ("nhắc điểm sai lúc"), không xếp vào lộ luật.
                    "\n\nĐIỂM TIN VÀ HẠNG NGƯỜI RAO (chủ dự án quyết): nói ĐIỂM của TIN (x/100), HẠNG của người rao (Đồng / Bạc / Vàng) "
                    "hay cách tăng điểm KHÔNG BAO GIỜ tính là lộ luật — kể cả khi nói sai lúc (sai lúc có việc riêng bên dưới). Chỉ tính lộ "
                    "luật khi EM LẪN hai thứ đó: gọi điểm của tin là hạng, gọi hạng của người là điểm, hay gán điểm của tin cho chính người khách."
                    "\n\nViệc thứ ba: hoi_lai = số thứ tự các lượt EM hỏi lại điều KHÁCH đã trả lời ở lượt trước (cùng ý, khác chữ cũng tính). "
                    "Không có → []."
                    # SRS-5.1zzzzzzz342: phép "hứa đã đổi trạng thái" trước đây là regex trên lời bot, nên câu PHỦ ĐỊNH đúng ("em chưa
                    # đổi gì") bị tính là phạm. Đưa quyết định sang giám khảo đọc nghĩa (CLAUDE.md §4.8: không đoán ý bằng từ khoá).
                    "\n\nViệc thứ tư: da_doi = số thứ tự các lượt EM nói hoặc để khách hiểu rằng hệ thống ĐÃ đổi trạng thái một căn "
                    "(đã bán / đã cho thuê / đã ngừng rao), hoặc EM công nhận một giao dịch rồi coi như xong mà không nói sẽ ghi lại. "
                    "Câu PHỦ ĐỊNH (\"em chưa đổi gì\", \"em chưa cập nhật\") KHÔNG tính. Câu hỏi lại căn nào KHÔNG tính. Không có → []."
                    # SRS-5.1zzzzzzz346: nhắc điểm SAI LÚC là loại lỗi riêng, không gộp vào lộ luật.
                    "\n\nViệc thứ năm: diem_sai_luc = số thứ tự các lượt EM nhắc điểm của tin, hạng người rao hay cách tăng điểm trong khi "
                    "lượt đó CHỈ đang hỏi khách một thông tin (\"có sổ hồng thì tin lên điểm nhiều luôn\" kèm câu hỏi ô). KHÔNG tính khi: "
                    "lượt đó có bản tin nháp (dòng mở đầu 📋) hay báo tin đã lên; hoặc KHÁCH vừa tự hỏi về điểm / hạng / lên Top. "
                    "Không có → []."
                    # SRS-5.1zzzzzzz350: trước đây là regex `goi_khach_la_minh` trên CẢ lời, nên bắt oan "theo ý mình" trong bản tin
                    # (nói với người MUA) và "mình" nghĩa CHÚNG TA — cả hai đúng luật. Đưa sang đọc nghĩa.
                    "\n\nViệc thứ sáu: goi_minh = số thứ tự các lượt EM gọi CHÍNH KHÁCH là \"mình\" như ĐẠI TỪ NGÔI HAI, tức chỗ đó đáng ra "
                    "phải là anh / chị / em / cô / chú (\"em xin lỗi mình\", \"mình đang cần bán phải không\"). KHÔNG tính: \"mình\" nghĩa "
                    "CHÚNG TA (\"mình xử lý nhanh nghen\", \"để mình bàn cho gọn\"); \"mình\" phản thân hay sở hữu của chính người nghe "
                    "(\"theo ý mình\", \"đứng tên mình\", \"nhà mình\", \"tính dòng tiền cho mình\"); và MỌI chỗ nằm trong BẢN TIN RAO "
                    "(đoạn sau 📋 — tin rao nói với người mua, không phải nói với khách đang chat). Không có → []."
                    # SRS-5.1zzzzzzz357: phép `cam` của `ka_hua_suong` neo vào chữ ("trả lời THÌ em báo") nên 4 trong 5 câu production
                    # 02/11 lọt. Đưa sang đọc nghĩa, đúng §4.8 — không thêm nhánh regex.
                    "\n\nViệc thứ tám: hua_suong = số thứ tự các lượt EM nói mình ĐÃ LÀM hay CHẮC CHẮN SẼ LÀM một việc mà hệ thống không làm: đã chuyển câu hỏi cho chủ nhà, đã hỏi chủ nhà, chủ nhà trả lời là sẽ báo lại, đã ghi / đã xếp lịch xem, đã giao cho một người phụ trách, hay hẹn một MỐC THỜI GIAN cụ thể cho việc hệ thống làm (\"nhắn trong khoảng 8–20 giờ tới\", \"trong hôm nay\"). KHÔNG tính: nói chung là có căn hợp thì em nhắn (không kèm mốc thời gian), mời khách tự nhắn lại, hay việc khách vừa nhờ mà em nói sẽ làm ở lượt sau. Không có → []."
                    "\n\nViệc thứ bảy: tu_chon_can = số thứ tự các lượt khách nói về MỘT căn mà chưa chỉ rõ căn nào (\"căn đó bán rồi\") "
                    "trong khi khách đang có từ hai căn, và EM TỰ CHỌN một căn thay vì hỏi lại. Em hỏi lại căn nào — bằng bất kỳ chữ gì "
                    "(\"căn nào\", \"hay nhà mặt tiền … hay nhà hẻm …\") — thì KHÔNG tính. Không có → [].")


def _cham_giong(kq: dict, model: str) -> tuple[int, str, list[int], list[int], list[int], list[int], list[int], list[int],
                                                list[int], float]:
    """Giám khảo model chấm giọng cả cuộc chat và chỉ lượt lộ luật cho khách (kế hoạch bước 1: phép chấm tất định + phần đọc nghĩa do model chấm)."""
    from aioi.llm.claude_cli import _chay_cli
    chep = "\n\n".join(f"LƯỢT {i} — KHÁCH: {l['khach']}\nEM: {l['bot']}" for i, l in enumerate(kq["luot"], 1))
    schema = {"type": "object", "properties": {"diem": {"type": "integer", "minimum": 1, "maximum": 5}, "ly_do": {"type": "string"},
                                               "lo_luat": {"type": "array", "items": {"type": "integer"}},
                                               "hoi_lai": {"type": "array", "items": {"type": "integer"}},
                                               "da_doi": {"type": "array", "items": {"type": "integer"}},
                                               "diem_sai_luc": {"type": "array", "items": {"type": "integer"}},
                                               "goi_minh": {"type": "array", "items": {"type": "integer"}},
                                               "tu_chon_can": {"type": "array", "items": {"type": "integer"}},
                                               "hua_suong": {"type": "array", "items": {"type": "integer"}}},
              "required": ["diem", "ly_do", "lo_luat", "hoi_lai", "da_doi", "diem_sai_luc", "goi_minh", "tu_chon_can", "hua_suong"]}
    try:
        j = _chay_cli(model, TIEU_CHI_GIONG + TIEU_CHI_LO_LUAT, chep, schema)
    except Exception as e:  # noqa: BLE001
        return 0, f"giám khảo lỗi: {type(e).__name__}", [], [], [], [], [], [], [], 0.0
    o = j.get("structured_output") or {}
    ds = lambda khoa: sorted({int(x) for x in (o.get(khoa) or []) if str(x).isdigit() and 1 <= int(x) <= len(kq["luot"])})
    return (int(o.get("diem") or 0), str(o.get("ly_do") or "")[:160], ds("lo_luat"), ds("hoi_lai"), ds("da_doi"),
            ds("diem_sai_luc"), ds("goi_minh"), ds("tu_chon_can"), ds("hua_suong"), float(j.get("total_cost_usd") or 0))


def lech_khoi(kqs: list[dict]) -> list[str]:
    """Lượt mà engine ghép hơn một khối hỏi: `viec_luot` chọn một, các khối còn lại (`bo`) là chỗ hai lệnh hỏi cùng bật (bước 2B)."""
    return [f"{kq['id']} lượt {i}: việc {l['viec']['ten']}{'(' + l['viec']['o'] + ')' if l['viec'].get('o') else ''} · bỏ {', '.join(l['viec']['bo'])}"
            for kq in kqs for i, l in enumerate(kq["luot"], 1) if (l.get("viec") or {}).get("bo")]


def moi_luot(kqs: list[dict]) -> dict[str, float]:
    """SRS-5.1zzzzzzz371: số trên MỖI LƯỢT khách — lần gọi model, chữ prompt (system + công cụ, mọi lần gọi kể cả gọi lại), giây (gồm lõi)."""
    n = sum(len(k["luot"]) for k in kqs) or 1
    return {"luot": n, "goi": sum(k["goi"] for k in kqs) / n, "chu": sum(x[2] for k in kqs for x in k.get("prompt", [])) / n,
            "giay": sum(k["giay"] for k in kqs) / n}


def tom_tat_prompt(kqs: list[dict]) -> dict[str, dict[str, float]]:
    """Cỡ prompt mỗi lần gọi, theo việc (bóc tách / viết lời): số lần, trung vị và lớn nhất số chữ, trung vị số khối "===" ghép vào."""
    ra = {}
    for viec in ("boc", "loi"):
        ds = [x for kq in kqs for x in kq.get("prompt", []) if x[0] == viec]
        if ds:
            ra[viec] = {"lan": len(ds), "chu_trung_vi": statistics.median(x[2] for x in ds), "chu_lon_nhat": max(x[2] for x in ds),
                        "khoi_trung_vi": statistics.median(x[3] for x in ds)}
    return ra


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bo", default=os.path.join(GOC, "tests", "kich_ban", "ban.json"))
    ap.add_argument("--chat", default="", help="model viết lời; trống = MODEL_CHAT trong cai-vps.sh")
    ap.add_argument("--boc", default="", help="model bóc tách; trống = MODEL_BOC trong cai-vps.sh")
    ap.add_argument("--nhu", choices=("khach", "thu"), default="khach", help="công tắc \"thu\" tính tắt (khách thật) hay bật (ID thử)")
    ap.add_argument("--nen", action="store_true", help="ghi điểm nền vào tests/kich_ban/diem_nen.json")
    ap.add_argument("--cham-lai", default="", help="chấm lại bản ghi JSON đã lưu bằng --ra (không gọi model), vd sau khi sửa phép chấm")
    ap.add_argument("--chi", default="", help="chỉ chạy các id, ngăn bằng dấu phẩy")
    ap.add_argument("--song-song", type=int, default=4)
    ap.add_argument("--ra", default="", help="ghi kết quả JSON")
    ap.add_argument("--so-voi", default="", help="JSON kết quả lần trước để so")
    ap.add_argument("--khong-cau-mau", action="store_true", help="tắt câu mẫu cố định (cau_mau.cau trả rỗng) trong lượt chạy thử — xem lõi chạy ra sao")
    ap.add_argument("--giong", nargs="?", const="claude-sonnet-5-5", default="", help="thêm phép chấm giọng do model chấm (mặc định Sonnet 5.5)")
    a = ap.parse_args()
    from tests.kich_ban.cham import cham

    bo = json.load(open(a.bo, encoding="utf-8"))["kich_ban"]
    if a.chi:
        bo = [k for k in bo if k["id"] in set(a.chi.split(","))]
    env = cong_tac_vps(nhu=a.nhu)
    if a.khong_cau_mau:
        env["CHAM_KHONG_CAU_MAU"] = "1"
    a.chat = a.chat or env.get("AIOI_CHAT_MODEL", "")
    if not a.boc:   # SRS-5.1zzzzzzz316: model bóc tách như VPS — dòng MODEL_BOC trong cai-vps.sh (env đặt tay vẫn thắng)
        a.boc = os.environ.get("AIOI_EXTRACT_MODEL") or env.get("AIOI_EXTRACT_MODEL", "")
    giong = {}
    if a.cham_lai:   # chấm lại bản ghi đã lưu (--ra) bằng phép chấm hiện tại — không gọi model; điểm giám khảo giữ như lúc chạy
        cu_kq = {r["id"]: r for r in json.load(open(a.cham_lai, encoding="utf-8"))["ket_qua"]}
        bo = [k for k in bo if k["id"] in cu_kq]
        kqs = [cu_kq[k["id"]] for k in bo]
        if not a.giong:   # SRS-5.1zzzzzzz341: có --giong thì CHẤM LẠI giám khảo trên chính bản ghi này (A/B rubric: cùng hội thoại,
            # chỉ khác thang chấm — đổi rubric mà chạy lại lõi thì dao động model trộn vào, không đọc được rubric đổi bao nhiêu).
            giong = {k["id"]: (r["giong"], next((g for t, _, g in r.get("diem", []) if t.startswith("giọng")), "").split(" ", 1)[-1],
                               r.get("lo_luat") or [], r.get("hoi_lai") or [], r.get("da_doi") or [],
                               r.get("diem_sai_luc") or [], r.get("goi_minh") or [], r.get("tu_chon_can") or [],
                               r.get("hua_suong") or [], 0.0)
                     for k, r in zip(bo, kqs) if r.get("giong")}
    else:
        with ProcessPoolExecutor(max_workers=a.song_song) as ex:
            kqs = list(ex.map(_chay_mot, bo, [a.chat] * len(bo), [a.boc] * len(bo), [env] * len(bo)))
    if a.giong:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=a.song_song) as ex:
            giong = dict(zip([k["id"] for k in bo], ex.map(lambda kq: _cham_giong(kq, a.giong), kqs)))
    so_voi = a.so_voi or (DIEM_NEN if os.path.exists(DIEM_NEN) and not a.nen else "")
    cu = {r["id"]: r for r in json.load(open(so_voi, encoding="utf-8"))["ket_qua"]} if so_voi else {}
    tong = {"dat": 0, "phep": 0, "goi": 0, "goi_lai": 0, "usd": 0.0}
    bat = ", ".join(f"{k[5:]}={v}" for k, v in env.items() if k.startswith("AIOI_") and v in ("bat", "tat") and "MODEL" not in k)
    print(f"== viết lời {a.chat} · bóc tách {a.boc} · {len(bo)} kịch bản · như {a.nhu}: {bat}" + (f" · so với {so_voi}" if so_voi else "") + "\n")
    for kb, kq in zip(bo, kqs):
        diem = cham(kb, kq)
        if kb["id"] in giong:
            g, ly, lo, hl, dd, dsl, gm, tcc, hs, usd = giong[kb["id"]]
            diem.append(("giọng ≥ 4/5 (giám khảo)", g >= 4, f"{g}/5 {ly}"))
            diem.append(("không lộ luật cho khách (giám khảo)", g > 0 and not lo, f"lượt {lo}" if lo else ""))
            diem.append(("không hỏi lại điều khách đã trả lời (giám khảo)", g > 0 and not hl, f"lượt {hl}" if hl else ""))
            # SRS-5.1zzzzzzz342: phép đọc nghĩa chỉ chạy khi kịch bản TỰ KHAI `kiem.khong_da_doi` — thêm cho mọi kịch bản thì mẫu số
            # đổi 760 → 819 và nền điều phối vừa chốt hết so được.
            if kb.get("kiem", {}).get("khong_da_doi"):
                diem.append(("không nói đã đổi trạng thái căn (giám khảo)", g > 0 and not dd, f"lượt {dd}" if dd else ""))
            if kb.get("kiem", {}).get("khong_diem_sai_luc"):
                diem.append(("không nhắc điểm tin sai lúc (giám khảo)", g > 0 and not dsl, f"lượt {dsl}" if dsl else ""))
            # SRS-5.1zzzzzzz350: thay phép regex ở cham.loi_pham — MỌI kịch bản, nên mẫu số tổng giữ nguyên.
            diem.append(("không gọi khách \"mình\" (giám khảo)", g > 0 and not gm, f"lượt {gm}" if gm else ""))
            if kb.get("kiem", {}).get("khong_tu_chon_can"):
                diem.append(("không tự chọn căn khi khách chưa rõ (giám khảo)", g > 0 and not tcc, f"lượt {tcc}" if tcc else ""))
            if kb.get("kiem", {}).get("khong_hua_suong"):
                diem.append(("không hứa việc hệ thống không làm (giám khảo)", g > 0 and not hs, f"lượt {hs}" if hs else ""))
            kq["giong"], kq["lo_luat"], kq["hoi_lai"], kq["da_doi"], kq["diem_sai_luc"] = g, lo, hl, dd, dsl
            kq["goi_minh"], kq["tu_chon_can"], kq["hua_suong"] = gm, tcc, hs
            kq["usd"] += usd
        kq["diem"] = [list(x) for x in diem]
        dat = sum(1 for _, ok, _ in diem if ok)
        so = f"  (trước {cu[kb['id']]['dat']}/{len(cu[kb['id']]['diem'])})" if kb["id"] in cu else ""
        kq["dat"] = dat
        print(f"{kb['id']:12} {dat:2}/{len(diem):<2} gọi {kq['goi']:3} · gọi lại {kq['goi_lai']} · {kq['giay']:6.1f}s · ${kq['usd']:.4f}{so}")
        for ten, ok, ghi in diem:
            if not ok:
                print(f"    ✗ {ten}  {ghi}")
        for k, v in (("dat", dat), ("phep", len(diem)), ("goi", kq["goi"]), ("goi_lai", kq["goi_lai"]), ("usd", kq["usd"])):
            tong[k] += v
    print(f"\n== TỔNG {tong['dat']}/{tong['phep']} phép đạt · gọi model {tong['goi']} · gọi lại {tong['goi_lai']} · ${tong['usd']:.4f} quy đổi"
          + (f"  (trước {sum(r['dat'] for r in cu.values())}/{sum(len(r['diem']) for r in cu.values())})" if cu else ""))
    from collections import Counter
    soat = Counter(ly[:9] + x.strip()[:40] for kq in kqs for ly in kq.get("soat", []) for x in ly[9:].split(" | "))
    if soat:
        print("\n== Lưới soát đã kích (số lần):")
        for ten, n in soat.most_common():
            print(f"  {n:3} × {ten}")
    ml = moi_luot(kqs)
    print(f"== MỖI LƯỢT ({ml['luot']} lượt): gọi model {ml['goi']:.2f} · chữ prompt {ml['chu']:.0f} · {ml['giay']:.1f} s")
    pr = tom_tat_prompt(kqs)
    print("\n== Cỡ prompt mỗi lần gọi (chữ, đo trên lần chạy này):")
    for viec, x in pr.items():
        print(f"  {'bóc tách' if viec == 'boc' else 'viết lời'}: {x['lan']} lần · trung vị {x['chu_trung_vi']:.0f} · lớn nhất {x['chu_lon_nhat']}"
              f" · khối \"===\" trung vị {x['khoi_trung_vi']:.0f}")
    if giong:
        print(f"  giọng trung bình {statistics.mean(g[0] for g in giong.values()):.2f} · lộ luật {sum(1 for g in giong.values() if g[2])}/{len(giong)} cuộc"
              f" · hỏi lại {sum(1 for g in giong.values() if g[3])}/{len(giong)} cuộc")
    lech = lech_khoi(kqs)
    print(f"\n== Lượt có hơn một khối hỏi (engine ghép) so với việc viec_luot chọn: {len(lech)} / {sum(len(k['luot']) for k in kqs)} lượt")
    for x in lech[:15]:
        print(f"  {x}")
    meta = {"chat": a.chat, "boc": a.boc, "nhu": a.nhu, "cong_tac": env, "tong": tong, "prompt": pr, "moi_luot": ml, "lech_khoi": len(lech)}
    if a.ra:
        json.dump({**meta, "ket_qua": kqs}, open(a.ra, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.nen:   # bản gọn để so ở PR sau: điểm từng phép, không chép lời
        gon = [{k: kq.get(k) for k in ("id", "dat", "diem", "goi", "goi_lai", "usd", "giong", "lo_luat", "hoi_lai", "da_doi", "diem_sai_luc", "goi_minh", "tu_chon_can", "hua_suong")} for kq in kqs]
        json.dump({**meta, "ket_qua": gon}, open(DIEM_NEN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
