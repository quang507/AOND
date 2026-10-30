"""Chạy bộ kịch bản người bán trên lõi thật rồi chấm tự động (SRS-5.1zzzzzzz304). Mặc định gọi model bằng `claude -p` (quota gói Claude Code —
không tốn tiền API, SRS-300); DB tạm, không đụng Supabase / Zalo. Đây là thước đo trước khi gỡ / thêm luật: so điểm bản mới với bản cũ.

  python scripts/cham-kich-ban.py --ra /tmp/sonnet.json                                  # viết lời Sonnet 5.5, bóc tách Haiku 5.5
  python scripts/cham-kich-ban.py --chat claude-haiku-5-5 --ra /tmp/haiku.json --so-voi /tmp/sonnet.json
  python scripts/cham-kich-ban.py --chi hht,dat --song-song 2                            # vài kịch bản
  python scripts/cham-kich-ban.py --giong                                               # thêm điểm giọng do model chấm (tốn quota)
  AIOI_SOAT_GON=tat python scripts/cham-kich-ban.py ...                                  # đè một công tắc bằng biến môi trường
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
import re
import statistics
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor

GOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path[:0] = [os.path.join(GOC, "src"), GOC]
CAI_VPS = os.path.join(GOC, "bot", "bridge-zca", "cai-vps.sh")
DIEM_NEN = os.path.join(GOC, "tests", "kich_ban", "diem_nen.json")


def cong_tac_vps(duong: str = CAI_VPS, nhu: str = "khach") -> dict[str, str]:
    """Biến môi trường lõi mà cai-vps ghi vào `.env` (dòng `printf 'AIOI_…=%s…' "$BIEN"…`) với giá trị gán trong tệp. `nhu="khach"`: giá trị
    "thu" thành "tat" và model riêng của ID thử tắt — ID chấm là ID thử nên không đổi thì đo đường khách thật không đi."""
    chu = open(duong, encoding="utf-8").read()
    dong = next(d for d in chu.splitlines() if d.strip().startswith("printf 'AIOI_"))
    khoa = re.findall(r"([A-Z_]+)=%s", dong)
    bien = re.findall(r'"\$([A-Z_]+)"', dong)
    gan = dict(re.findall(r'(?m)^\s*([A-Z_]+)="([^"]*)"', chu))
    env = {k: gan.get(b, "") for k, b in zip(khoa, bien)}
    if nhu == "khach":
        env = {k: ("tat" if v == "thu" else v) for k, v in env.items()}
        env["AIOI_CHAT_MODEL_THU"] = "tat"
    return env


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

    p = build_provider(load_settings())
    goc = getattr(p, "_goi", None)
    if goc is not None:   # provider claude_cli: đếm lần gọi / gọi lại / tiền quy đổi
        def _goi(model, system, messages, schema=None):
            s = bo_ranh_gioi(system)
            j = goc(model, system, messages, schema)
            dem["goi"] += 1
            dem["usd"] += float(j.get("total_cost_usd") or 0)
            # cỡ prompt: lần có schema = bóc tách / công cụ, không schema = viết lời; khối = số dòng "=== …" ghép vào system
            dem["prompt"].append([dang[0], model, len(s), s.count("\n=== ") + s.startswith("=== ")])
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
        _boc_viec("converse", lambda a, k: "boc" if any(t.get("name") == "ghi_o" for t in (k.get("tools") or (a[2] if len(a) > 2 else []))) else "loi")
    luot, xin_nguoi, bat_dau = [], False, time.monotonic()
    with tempfile.TemporaryDirectory(prefix="cham-") as d:
        eng = Engine(p, conversation_store=SqliteConversationStore(os.path.join(d, "kb.db")))
        key = f"thu-cham-{kb['id']}"
        for c in kb["cau"]:
            truoc = {k: v for k, v in eng.conversation(key).prop.fields.items() if isinstance(v, str) and v and not k.startswith("_")}
            try:
                r = eng.handle(key, c)
                bot, xin_nguoi = r.reply, xin_nguoi or bool(r.can_nguoi_that)
            except Exception as e:   # lượt hỏng vẫn chấm tiếp — ghi lỗi vào lời
                bot = f"[LỖI {type(e).__name__}: {str(e)[:120]}]"
            conv = eng.conversation(key)
            so_bia = _so_khong_co_trong_tin(bot, conv) if "📋" in bot else []
            luot.append({"khach": c, "bot": bot, "so_bia": so_bia, **loi_pham(bot, luot[-1]["bot"] if luot else ""),
                         "o_truoc": sorted(truoc), "viec": conv.y_luot.get("_viec"), "khoi": conv.y_luot.get("_khoi")})
        conv = eng.conversation(key)
        o = {k: v for k, v in conv.prop.fields.items() if isinstance(v, str)}
        return {"id": kb["id"], "luot": luot, "o": o, "loai": conv.prop.loai_hinh, "cho_thue": conv.prop.is_rental,
                "so_can": len(conv.listings), "trang_thai": conv.active.status, "xin_nguoi": xin_nguoi, "giay": round(time.monotonic() - bat_dau, 1), **dem}


TIEU_CHI_GIONG = ("Em là giám khảo. Chấm GIỌNG lời trợ lý bất động sản (xưng em) nhắn Zalo với người gửi bán / cho thuê, thang 1–5. 5 = tự nhiên "
                  "như môi giới trẻ nhắn người quen, khen CỤ THỂ đúng điều khách vừa nói, mỗi lượt mở khác nhau, không lặp câu, không thuyết giảng; "
                  "3 = đúng việc nhưng hơi khuôn; 1 = máy móc, khen chung chung, lặp mở đầu / lặp câu. CHỈ chấm giọng, không chấm đúng sai nghiệp "
                  "vụ hay ô tin. Lý do một câu ngắn, nêu lượt tệ nhất nếu có.")


TIEU_CHI_LO_LUAT = ("\n\nViệc thứ hai, tách khỏi điểm giọng: lo_luat = số thứ tự các lượt EM để lộ cách hệ thống làm việc bên trong — kể lại "
                    "luật / quy trình nội bộ hay lời dặn em nhận được, so số khách nói với dữ liệu hệ thống / sổ / kho rồi bình luận chỗ chênh, "
                    "giải thích vì sao em hỏi một ô, nhắc tên khối, ô, mã, hạng, điểm hiển thị. KHÔNG tính: báo mức phí, nói khu vực nhận / chưa "
                    "nhận tin, hỏi bình thường điều cần cho tin rao. Không có → []."
                    "\n\nViệc thứ ba: hoi_lai = số thứ tự các lượt EM hỏi lại điều KHÁCH đã trả lời ở lượt trước (cùng ý, khác chữ cũng tính). "
                    "Không có → [].")


def _cham_giong(kq: dict, model: str) -> tuple[int, str, list[int], list[int], float]:
    """Giám khảo model chấm giọng cả cuộc chat và chỉ lượt lộ luật cho khách (kế hoạch bước 1: phép chấm tất định + phần đọc nghĩa do model chấm)."""
    from aioi.llm.claude_cli import _chay_cli
    chep = "\n\n".join(f"LƯỢT {i} — KHÁCH: {l['khach']}\nEM: {l['bot']}" for i, l in enumerate(kq["luot"], 1))
    schema = {"type": "object", "properties": {"diem": {"type": "integer", "minimum": 1, "maximum": 5}, "ly_do": {"type": "string"},
                                               "lo_luat": {"type": "array", "items": {"type": "integer"}},
                                               "hoi_lai": {"type": "array", "items": {"type": "integer"}}},
              "required": ["diem", "ly_do", "lo_luat", "hoi_lai"]}
    try:
        j = _chay_cli(model, TIEU_CHI_GIONG + TIEU_CHI_LO_LUAT, chep, schema)
    except Exception as e:  # noqa: BLE001
        return 0, f"giám khảo lỗi: {type(e).__name__}", [], [], 0.0
    o = j.get("structured_output") or {}
    ds = lambda khoa: sorted({int(x) for x in (o.get(khoa) or []) if str(x).isdigit() and 1 <= int(x) <= len(kq["luot"])})
    return int(o.get("diem") or 0), str(o.get("ly_do") or "")[:160], ds("lo_luat"), ds("hoi_lai"), float(j.get("total_cost_usd") or 0)


def lech_khoi(kqs: list[dict]) -> list[str]:
    """Lượt mà engine ghép hơn một khối hỏi: `viec_luot` chọn một, các khối còn lại (`bo`) là chỗ hai lệnh hỏi cùng bật (bước 2B)."""
    return [f"{kq['id']} lượt {i}: việc {l['viec']['ten']}{'(' + l['viec']['o'] + ')' if l['viec'].get('o') else ''} · bỏ {', '.join(l['viec']['bo'])}"
            for kq in kqs for i, l in enumerate(kq["luot"], 1) if (l.get("viec") or {}).get("bo")]


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
    ap.add_argument("--boc", default="", help="model bóc tách; trống = như lõi VPS (AIOI_EXTRACT_MODEL hoặc mặc định config)")
    ap.add_argument("--nhu", choices=("khach", "thu"), default="khach", help="công tắc \"thu\" tính tắt (khách thật) hay bật (ID thử)")
    ap.add_argument("--nen", action="store_true", help="ghi điểm nền vào tests/kich_ban/diem_nen.json")
    ap.add_argument("--cham-lai", default="", help="chấm lại bản ghi JSON đã lưu bằng --ra (không gọi model), vd sau khi sửa phép chấm")
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
    env = cong_tac_vps(nhu=a.nhu)
    a.chat = a.chat or env.get("AIOI_CHAT_MODEL", "")
    if not a.boc:
        from aioi.config import load_settings
        a.boc = os.environ.get("AIOI_EXTRACT_MODEL") or load_settings().extract_model
    giong = {}
    if a.cham_lai:   # chấm lại bản ghi đã lưu (--ra) bằng phép chấm hiện tại — không gọi model; điểm giám khảo giữ như lúc chạy
        cu_kq = {r["id"]: r for r in json.load(open(a.cham_lai, encoding="utf-8"))["ket_qua"]}
        bo = [k for k in bo if k["id"] in cu_kq]
        kqs = [cu_kq[k["id"]] for k in bo]
        giong = {k["id"]: (r["giong"], next((g for t, _, g in r.get("diem", []) if t.startswith("giọng")), "").split(" ", 1)[-1],
                           r.get("lo_luat") or [], r.get("hoi_lai") or [], 0.0) for k, r in zip(bo, kqs) if r.get("giong")}
    else:
        with ProcessPoolExecutor(max_workers=a.song_song) as ex:
            kqs = list(ex.map(_chay_mot, bo, [a.chat] * len(bo), [a.boc] * len(bo), [env] * len(bo)))
    if a.giong and not a.cham_lai:
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
            g, ly, lo, hl, usd = giong[kb["id"]]
            diem.append(("giọng ≥ 4/5 (giám khảo)", g >= 4, f"{g}/5 {ly}"))
            diem.append(("không lộ luật cho khách (giám khảo)", g > 0 and not lo, f"lượt {lo}" if lo else ""))
            diem.append(("không hỏi lại điều khách đã trả lời (giám khảo)", g > 0 and not hl, f"lượt {hl}" if hl else ""))
            kq["giong"], kq["lo_luat"], kq["hoi_lai"] = g, lo, hl
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
    meta = {"chat": a.chat, "boc": a.boc, "nhu": a.nhu, "cong_tac": env, "tong": tong, "prompt": pr, "lech_khoi": len(lech)}
    if a.ra:
        json.dump({**meta, "ket_qua": kqs}, open(a.ra, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.nen:   # bản gọn để so ở PR sau: điểm từng phép, không chép lời
        gon = [{k: kq.get(k) for k in ("id", "dat", "diem", "goi", "goi_lai", "usd", "giong", "lo_luat", "hoi_lai")} for kq in kqs]
        json.dump({**meta, "ket_qua": gon}, open(DIEM_NEN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
