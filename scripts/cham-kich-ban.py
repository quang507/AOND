"""Chạy bộ kịch bản người bán trên lõi thật rồi chấm tự động (SRS-5.1zzzzzzz304). Mặc định gọi model bằng `claude -p` (quota gói Claude Code —
không tốn tiền API, SRS-300); DB tạm, không đụng Supabase / Zalo. Đây là thước đo trước khi gỡ / thêm luật: so điểm bản mới với bản cũ.

  python scripts/cham-kich-ban.py --ra /tmp/sonnet.json                                  # viết lời Sonnet 5.5, bóc tách Haiku 5.5
  python scripts/cham-kich-ban.py --chat claude-haiku-5-5 --ra /tmp/haiku.json --so-voi /tmp/sonnet.json
  python scripts/cham-kich-ban.py --chi hht,dat --song-song 2                            # vài kịch bản
  python scripts/cham-kich-ban.py --giong                                               # thêm điểm giọng do model chấm (tốn quota)
  AIOI_SOAT_GON=tat python scripts/cham-kich-ban.py ...                                  # công tắc lõi đặt bằng biến môi trường như VPS

In bảng: mỗi kịch bản số phép đạt / tổng, lần gọi model, lần gọi lại (lõi bắt lỗi rồi bắt viết lại), giây, tiền quy đổi.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor

GOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path[:0] = [os.path.join(GOC, "src"), GOC]


def _chay_mot(kb: dict, chat: str, boc: str) -> dict:
    os.environ.update({"AIOI_LLM_PROVIDER": os.environ.get("AIOI_LLM_PROVIDER", "claude_cli"), "AIOI_CHAT_MODEL": chat, "AIOI_EXTRACT_MODEL": boc})
    os.environ.setdefault("AIOI_SOAT_GON", "bat")
    os.environ.setdefault("AIOI_FORM_BAN_GON", "bat")
    os.environ.setdefault("AIOI_AGENT_BAN", "thu")   # như VPS (ID chấm là ID thử)
    os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)
    import logging
    dem = {"goi": 0, "goi_lai": 0, "usd": 0.0, "soat": []}

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

    p = build_provider(load_settings())
    goc = getattr(p, "_goi", None)
    if goc is not None:   # provider claude_cli: đếm lần gọi / gọi lại / tiền quy đổi
        def _goi(model, system, messages, schema=None):
            s = bo_ranh_gioi(system)
            j = goc(model, system, messages, schema)
            dem["goi"] += 1
            dem["usd"] += float(j.get("total_cost_usd") or 0)
            if "=== VIẾT LẠI LƯỢT NÀY ===" in s or "LƯỢT TRƯỚC CỦA EM CHƯA ĐẠT" in s:
                dem["goi_lai"] += 1
            return j
        p._goi = _goi
    luot, xin_nguoi, bat_dau = [], False, time.monotonic()
    with tempfile.TemporaryDirectory(prefix="cham-") as d:
        eng = Engine(p, conversation_store=SqliteConversationStore(os.path.join(d, "kb.db")))
        key = f"thu-cham-{kb['id']}"
        for c in kb["cau"]:
            try:
                r = eng.handle(key, c)
                bot, xin_nguoi = r.reply, xin_nguoi or bool(r.can_nguoi_that)
            except Exception as e:   # lượt hỏng vẫn chấm tiếp — ghi lỗi vào lời
                bot = f"[LỖI {type(e).__name__}: {str(e)[:120]}]"
            conv = eng.conversation(key)
            so_bia = _so_khong_co_trong_tin(bot, conv) if "📋" in bot else []
            luot.append({"khach": c, "bot": bot, "so_bia": so_bia, **loi_pham(bot, luot[-1]["bot"] if luot else "")})
        conv = eng.conversation(key)
        o = {k: v for k, v in conv.prop.fields.items() if isinstance(v, str)}
        return {"id": kb["id"], "luot": luot, "o": o, "loai": conv.prop.loai_hinh, "cho_thue": conv.prop.is_rental,
                "so_can": len(conv.listings), "trang_thai": conv.active.status, "xin_nguoi": xin_nguoi, "giay": round(time.monotonic() - bat_dau, 1), **dem}


TIEU_CHI_GIONG = ("Em là giám khảo. Chấm GIỌNG lời trợ lý bất động sản (xưng em) nhắn Zalo với người gửi bán / cho thuê, thang 1–5. 5 = tự nhiên "
                  "như môi giới trẻ nhắn người quen, khen CỤ THỂ đúng điều khách vừa nói, mỗi lượt mở khác nhau, không lặp câu, không thuyết giảng; "
                  "3 = đúng việc nhưng hơi khuôn; 1 = máy móc, khen chung chung, lặp mở đầu / lặp câu. CHỈ chấm giọng, không chấm đúng sai nghiệp "
                  "vụ hay ô tin. Lý do một câu ngắn, nêu lượt tệ nhất nếu có.")


def _cham_giong(kq: dict, model: str) -> tuple[int, str, float]:
    """Giám khảo model chấm giọng cả cuộc chat (kế hoạch bước 1: phép chấm tất định + giọng do model chấm)."""
    from aioi.llm.claude_cli import _chay_cli
    chep = "\n\n".join(f"KHÁCH: {l['khach']}\nEM: {l['bot']}" for l in kq["luot"])
    schema = {"type": "object", "properties": {"diem": {"type": "integer", "minimum": 1, "maximum": 5}, "ly_do": {"type": "string"}},
              "required": ["diem", "ly_do"]}
    try:
        j = _chay_cli(model, TIEU_CHI_GIONG, chep, schema)
    except Exception as e:  # noqa: BLE001
        return 0, f"giám khảo lỗi: {type(e).__name__}", 0.0
    o = j.get("structured_output") or {}
    return int(o.get("diem") or 0), str(o.get("ly_do") or "")[:160], float(j.get("total_cost_usd") or 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bo", default=os.path.join(GOC, "tests", "kich_ban", "ban.json"))
    ap.add_argument("--chat", default="claude-sonnet-5-5")
    ap.add_argument("--boc", default="claude-haiku-5-5")
    ap.add_argument("--chi", default="", help="chỉ chạy các id, ngăn bằng dấu phẩy")
    ap.add_argument("--song-song", type=int, default=4)
    ap.add_argument("--ra", default="", help="ghi kết quả JSON")
    ap.add_argument("--so-voi", default="", help="JSON kết quả lần trước để so")
    ap.add_argument("--giong", nargs="?", const="claude-sonnet-5-5", default="", help="thêm phép chấm giọng do model chấm (mặc định Sonnet 5.5)")
    a = ap.parse_args()
    from tests.kich_ban.cham import cham

    bo = json.load(open(a.bo, encoding="utf-8"))["kich_ban"]
    if a.chi:
        bo = [k for k in bo if k["id"] in set(a.chi.split(","))]
    with ProcessPoolExecutor(max_workers=a.song_song) as ex:
        kqs = list(ex.map(_chay_mot, bo, [a.chat] * len(bo), [a.boc] * len(bo)))
    giong = {}
    if a.giong:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=a.song_song) as ex:
            giong = dict(zip([k["id"] for k in bo], ex.map(lambda kq: _cham_giong(kq, a.giong), kqs)))
    cu = {r["id"]: r for r in json.load(open(a.so_voi, encoding="utf-8"))["ket_qua"]} if a.so_voi else {}
    tong = {"dat": 0, "phep": 0, "goi": 0, "goi_lai": 0, "usd": 0.0}
    print(f"== viết lời {a.chat} · bóc tách {a.boc} · {len(bo)} kịch bản\n")
    for kb, kq in zip(bo, kqs):
        diem = cham(kb, kq)
        if kb["id"] in giong:
            g, ly, usd = giong[kb["id"]]
            diem.append(("giọng ≥ 4/5 (giám khảo)", g >= 4, f"{g}/5 {ly}"))
            kq["giong"] = g
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
    if a.ra:
        json.dump({"chat": a.chat, "boc": a.boc, "ket_qua": kqs, "tong": tong}, open(a.ra, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
