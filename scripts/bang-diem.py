"""Trang bảng điểm giọng bot cho chủ dự án (SRS-5.1zzzzzzz493) — dựng từ bản ghi `scripts/cham-kich-ban.py --barem --ra`.

  python scripts/bang-diem.py kq1.json kq2.json --truoc nen1.json nen2.json --ra bang-diem.html

Nhiều bản ghi cùng một bên thì gộp trung bình (model viết lời dao động giữa các lần chạy — chạy ≥ 2 lần mỗi bên mới so được). `--truoc` là
các lần chạy của bản cũ để hiện chênh. Trang là HTML tĩnh một tệp: điểm trung bình /12, phần trăm lượt đạt, lỗi nặng, bản tin /5, sáu
tiêu chí, từng kịch bản, ba lượt tệ nhất và ba lượt tốt nhất kèm lời bot. Kịch bản bộ vàng là hội thoại tạo sẵn, không có dữ liệu khách thật.
"""
from __future__ import annotations

import argparse
import html
import importlib.util
import json
import os
import statistics
from collections import Counter, defaultdict

GOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
_spec = importlib.util.spec_from_file_location("cham_kich_ban", os.path.join(GOC, "scripts", "cham-kich-ban.py"))
CKB = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(CKB)   # một nguồn: tên tiêu chí và cách đọc bộ kịch bản lấy từ bộ chấm

TEN_TC = {"dung_viec": ("Đúng việc", "Đáp trọn điều khách hỏi, hỏi đúng ý kế"),
          "thang": ("Thẳng", "Vào việc ngay, không đọc lại, không báo đã ghi"),
          "that": ("Thật", "Chỉ nói điều khách kể hay dữ liệu có"),
          "gon": ("Gọn", "Độ dài hợp ý khách, một câu hỏi mỗi lượt"),
          "nguoi": ("Người", "Nhận cảm xúc, xưng hô tự nhiên"),
          "da_dang": ("Đa dạng", "Mỗi lượt một vẻ, không lặp khuôn")}
TEN_NANG = {"bia": "Bịa sự thật", "lo_luat": "Lộ luật nội bộ", "xung_ho": "Sai xưng hô", "da": "Mở bằng “Dạ”", "loi_he_thong": "Lỗi hệ thống"}


def doc(ds: list[str]) -> list[dict]:
    return [json.load(open(p, encoding="utf-8")) for p in ds]


def gom(runs: list[dict]) -> dict:
    """Gộp các lần chạy: lượt (có điểm barem) kèm lời khách / bot, điểm từng kịch bản."""
    luot, theo_kb = [], defaultdict(list)
    for r in runs:
        for kq in r["ket_qua"]:
            for b in kq.get("barem") or []:
                if b.get("diem") is None:
                    continue
                l = kq["luot"][b["so"] - 1] if b["so"] <= len(kq.get("luot") or []) else {}
                x = {**b, "id": kq["id"], "khach": l.get("khach", ""), "bot": l.get("bot", "")}
                luot.append(x)
                theo_kb[kq["id"]].append(x)
    if not luot:
        raise SystemExit("bản ghi không có điểm barem — chạy cham-kich-ban.py với --barem")
    tin = [x["tin"] for x in luot if x.get("tin") is not None]
    nang = Counter(c for x in luot for c in x["loi_nang"])
    return {"so_lan": len(runs), "so_luot": len(luot), "luot": luot, "theo_kb": theo_kb,
            "diem_tb": statistics.mean(x["diem"] for x in luot),
            "luot_dat": 100 * sum(1 for x in luot if not x["loi_nang"] and min(x[k] for k in CKB.TIEU_CHI_BAREM_DS) > 0) / len(luot),
            "nang": nang, "nang_moi_lan": sum(nang.values()) / len(runs),
            "tc": {k: statistics.mean(x[k] for x in luot) for k in CKB.TIEU_CHI_BAREM_DS},
            "tin_tb": statistics.mean(tin) if tin else None, "meta": runs[0]}


def e(s: object) -> str:
    return html.escape(str(s or ""))


def chenh(moi: float | None, cu: float | None, don_vi: str = "", nguoc: bool = False, so_le: int = 1) -> str:
    if moi is None or cu is None:
        return ""
    d = moi - cu
    if abs(d) < 10 ** -so_le / 2:
        return '<span class="delta">bằng tuần trước</span>'
    tot = (d < 0) if nguoc else (d > 0)
    return f'<span class="delta {"up" if tot else "down"}">{"▲" if d > 0 else "▼"} {abs(d):.{so_le}f}{don_vi} so với trước</span>'


def loi_chat(bot: str, toi_da: int = 420) -> str:
    """Phần bot đáng đọc: lời chat; lượt chỉ có bản tin thì lấy đầu bản tin."""
    chat = bot.split("📋", 1)[0].strip()
    s = chat if len(chat) >= 12 else bot.strip()
    return s if len(s) <= toi_da else s[:toi_da].rsplit(" ", 1)[0] + " …"


def the_luot(x: dict, mo_ta: dict) -> str:
    ghi = f'<p class="note">{e(x["ghi"])}</p>' if x.get("ghi") else ""
    nang = "".join(f'<span class="chip bad">{e(TEN_NANG.get(c, c))}</span>' for c in x["loi_nang"])
    return (f'<article class="turn"><header><span class="score {"lo" if x["diem"] < 8 else "hi" if x["diem"] >= 11 else ""}">'
            f'{x["diem"]}<small>/12</small></span><span class="kb">{e(x["id"])} · lượt {x["so"]}</span>{nang}</header>'
            f'<p class="ctx">{e(mo_ta.get(x["id"], ""))}</p>'
            f'<div class="bubble them"><b>Khách</b>{e(x["khach"])}</div>'
            f'<div class="bubble us"><b>Bot</b>{e(loi_chat(x["bot"]))}</div>{ghi}</article>')


def dung(moi: dict, cu: dict | None, mo_ta: dict) -> str:
    m = moi["meta"]
    tb_cu = lambda k: (cu or {}).get(k)
    kpi = [
        ("Điểm trung bình", f'{moi["diem_tb"]:.1f}<small>/12</small>', chenh(moi["diem_tb"], tb_cu("diem_tb"))),
        ("Lượt đạt", f'{moi["luot_dat"]:.0f}<small>%</small>', chenh(moi["luot_dat"], tb_cu("luot_dat"), " điểm %", so_le=0)),
        ("Lỗi nặng mỗi lần chạy", f'{moi["nang_moi_lan"]:.1f}', chenh(moi["nang_moi_lan"], tb_cu("nang_moi_lan"), nguoc=True)),
        ("Bản tin", f'{moi["tin_tb"]:.1f}<small>/5</small>' if moi["tin_tb"] is not None else "—", chenh(moi["tin_tb"], tb_cu("tin_tb"))),
    ]
    o_kpi = "".join(f'<div class="kpi"><span class="lbl">{a}</span><span class="num">{b}</span>{c}</div>' for a, b, c in kpi)
    o_tc = "".join(
        f'<div class="tc"><div class="tc-h"><b>{TEN_TC[k][0]}</b><span>{v:.2f}<small>/2</small> '
        f'{chenh(v, (cu or {}).get("tc", {}).get(k), so_le=2)}</span></div>'
        f'<div class="bar"><i style="width:{v / 2 * 100:.0f}%"></i></div><p>{TEN_TC[k][1]}</p></div>'
        for k, v in sorted(moi["tc"].items(), key=lambda kv: kv[1]))
    nang = ", ".join(f'{TEN_NANG.get(c, c)} {n}' for c, n in moi["nang"].most_common()) or "không có"
    hang = []
    for kb, ds in sorted(moi["theo_kb"].items(), key=lambda kv: statistics.mean(x["diem"] for x in kv[1])):
        tb = statistics.mean(x["diem"] for x in ds)
        cu_kb = (cu or {}).get("theo_kb", {}).get(kb)
        d = chenh(tb, statistics.mean(x["diem"] for x in cu_kb) if cu_kb else None) if cu_kb else ""
        hang.append(f'<tr><td><b>{e(kb)}</b><span>{e(mo_ta.get(kb, ""))}</span></td><td class="r">{tb:.1f}{d}</td>'
                    f'<td class="barcell"><div class="bar"><i style="width:{tb / 12 * 100:.0f}%"></i></div></td></tr>')
    # ba lượt tệ nhất (mỗi kịch bản một lượt) và ba lượt tốt nhất là lời chat (không phải lượt chỉ có bản tin / câu cố định)
    te, tot, da = [], [], set()
    for x in sorted(moi["luot"], key=lambda x: (x["diem"], -len(x["loi_nang"]))):
        if x["id"] not in da and len(te) < 3:
            te.append(x)
            da.add(x["id"])
    da = set()
    for x in sorted(moi["luot"], key=lambda x: -x["diem"]):
        chat = x["bot"].split("📋", 1)[0].strip()
        if x["id"] not in da and len(chat) > 40 and "xin phép đăng tin" not in chat and len(tot) < 3:
            tot.append(x)
            da.add(x["id"])
    ngay = m.get("luc") or ""
    ngay = "/".join(reversed(ngay[:10].split("-"))) if ngay[:4].isdigit() else ngay   # 2026-11-14 → 14/11/2026
    nguon = f'bộ {e(m.get("bo") or "vang.json")} · {moi["so_luot"] // max(moi["so_lan"], 1)} lượt × {moi["so_lan"]} lần chạy · viết lời {e(m.get("chat"))} · giám khảo {e(m.get("giam_khao") or "claude-sonnet-5-5")}'
    so_sanh = (f'<p class="cmp">So với {cu["so_lan"]} lần chạy trước ({e(cu["meta"].get("luc") or "")}).</p>' if cu else
               '<p class="cmp">Đây là lần đo đầu tiên — tuần sau mới có chênh.</p>')
    return f"""<title>Bảng điểm giọng bot</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap">
<style>
:root{{--bg:#f6f7f9;--surface:#fff;--fg:#13151d;--mute:#5d6a7a;--line:#e8ebed;--brand:#e60023;--brand-soft:#ffe5ea;--good:#0f766e;--good-soft:#dff3f0;
--bad:#b8001c;--bar:#0f766e;--track:#e8ebed;--them:#fff;--us:#ddf2fd;--us-fg:#0b2a4a}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#13151d;--surface:#1b1f28;--fg:#eef1f4;--mute:#a3afbd;--line:#2c323d;
--brand:#ff5470;--brand-soft:#3a1820;--good:#2dd4bf;--good-soft:#11302d;--bad:#ff7a8e;--bar:#2dd4bf;--track:#2c323d;--them:#232830;--us:#16324f;--us-fg:#dcecff;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#13151d;--surface:#1b1f28;--fg:#eef1f4;--mute:#a3afbd;--line:#2c323d;--brand:#ff5470;--brand-soft:#3a1820;
--good:#2dd4bf;--good-soft:#11302d;--bad:#ff7a8e;--bar:#2dd4bf;--track:#2c323d;--them:#232830;--us:#16324f;--us-fg:#dcecff;color-scheme:dark}}
*{{box-sizing:border-box}}
body{{background:var(--bg);color:var(--fg);font-family:Nunito,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.55;
padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 48px}}
main{{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:28px}}
h1{{font-size:clamp(24px,4vw,32px);font-weight:800;margin:0;letter-spacing:-.01em;text-wrap:balance}}
h2{{font-size:18px;font-weight:800;margin:0 0 12px}}
.eyebrow{{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand);margin:0 0 6px}}
.src,.cmp{{color:var(--mute);margin:6px 0 0;font-size:13px}}
small{{font-size:.55em;font-weight:600;color:var(--mute);margin-left:2px}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}}
.kpi{{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:2px;min-width:0}}
.kpi .lbl{{font-size:13px;color:var(--mute);font-weight:600}}
.kpi .num{{font-size:34px;font-weight:800;line-height:1.15;font-variant-numeric:tabular-nums}}
.delta{{font-size:12px;font-weight:700;color:var(--mute)}} .delta.up{{color:var(--good)}} .delta.down{{color:var(--bad)}}
section{{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px}}
.tcs{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px 24px}}
.tc-h{{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap}} .tc-h span{{font-weight:800;font-variant-numeric:tabular-nums}}
.tc p{{margin:4px 0 0;color:var(--mute);font-size:13px}}
.bar{{height:8px;background:var(--track);border-radius:8px;overflow:hidden;margin-top:6px}} .bar i{{display:block;height:100%;background:var(--bar);border-radius:8px}}
.nang{{margin:14px 0 0;font-size:14px}} .nang b{{color:var(--bad)}}
.tbl{{overflow-x:auto}} table{{width:100%;border-collapse:collapse;font-size:14px}}
td{{padding:10px 8px;border-top:1px solid var(--line);vertical-align:top}} td span{{display:block;color:var(--mute);font-size:13px}}
td.r{{text-align:right;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}} td.r .delta{{display:block}}
td.barcell{{width:28%;min-width:90px;padding-top:16px}}
.turns{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}}
.turn{{border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;min-width:0;background:var(--bg)}}
.turn header{{display:flex;align-items:center;gap:8px;flex-wrap:wrap}}
.score{{font-weight:800;font-size:20px;padding:2px 10px;border-radius:8px;background:var(--track);font-variant-numeric:tabular-nums}}
.score.lo{{background:var(--brand-soft);color:var(--bad)}} .score.hi{{background:var(--good-soft);color:var(--good)}}
.kb{{font-weight:700;font-size:13px;color:var(--mute)}}
.chip{{font-size:12px;font-weight:700;padding:2px 8px;border-radius:8px}} .chip.bad{{background:var(--brand-soft);color:var(--bad)}}
.ctx{{margin:0;font-size:13px;color:var(--mute)}}
.bubble{{border-radius:14px;padding:10px 12px;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}}
.bubble b{{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin-bottom:2px}}
.them{{background:var(--them);border:1px solid var(--line)}} .us{{background:var(--us);color:var(--us-fg)}}
.note{{margin:0;font-size:13px;border-left:3px solid var(--brand);padding-left:10px}}
.legend{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px 24px;font-size:14px}} .legend p{{margin:0}}
</style>
<main>
<header>
<p class="eyebrow">AI Ơi Nhà Đất · giọng bot</p>
<h1>Bảng điểm giọng bot · {e(ngay)}</h1>
<p class="src">{nguon}</p>
{so_sanh}
</header>
<div class="kpis">{o_kpi}</div>
<section><h2>Sáu tiêu chí</h2><div class="tcs">{o_tc}</div>
<p class="nang"><b>Lỗi nặng:</b> {e(nang)} (tổng {sum(moi["nang"].values())} trên {moi["so_luot"]} lượt).</p></section>
<section><h2>Ba lượt cần sửa nhất</h2><div class="turns">{"".join(the_luot(x, mo_ta) for x in te)}</div></section>
<section><h2>Ba lượt hay nhất</h2><div class="turns">{"".join(the_luot(x, mo_ta) for x in tot)}</div></section>
<section><h2>Từng kịch bản</h2><div class="tbl"><table>{"".join(hang)}</table></div></section>
<section><h2>Cách chấm</h2><div class="legend">
<p>Mỗi lượt bot trả lời được chấm sáu tiêu chí, mỗi tiêu chí 0–2 điểm, tổng 12. Giám khảo là một model đọc cả cuộc chat; phần đếm được (mở bằng “Dạ”, câu báo đã ghi, lặp mở đầu, nhiều câu hỏi, nhãn trong bản tin) do code chốt.</p>
<p><b>Lỗi nặng</b> — bịa sự thật, lộ luật nội bộ, sai xưng hô, mở bằng “Dạ” — làm cả lượt về 0. <b>Lượt đạt</b> là lượt không lỗi nặng và không tiêu chí nào 0 điểm.</p>
<p><b>Bản tin /5</b>: đúng dữ liệu khách đưa, tiêu đề đủ vị trí · diện tích · giá, mời gọi một lần, 4–5 gạch đầu dòng gọn, không ghi nhãn kiểu “Giá:”.</p>
<p>Bộ vàng là 15 cuộc chat tạo sẵn, mỗi cuộc một kiểu khách khó, giữ cố định để tuần này so được với tuần trước.</p>
</div></section>
</main>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ban_ghi", nargs="+", help="bản ghi --ra của các lần chạy bản hiện tại")
    ap.add_argument("--truoc", nargs="*", default=[], help="bản ghi các lần chạy bản trước, để hiện chênh")
    ap.add_argument("--bo", default=os.path.join(GOC, "tests", "kich_ban", "vang.json"))
    ap.add_argument("--ra", default="bang-diem.html")
    a = ap.parse_args()
    mo_ta = {k["id"]: k.get("mo_ta", "") for k in CKB.doc_bo(a.bo)}
    moi = gom(doc(a.ban_ghi))
    cu = gom(doc(a.truoc)) if a.truoc else None
    open(a.ra, "w", encoding="utf-8").write(dung(moi, cu, mo_ta))
    print(f"ghi {a.ra}: {moi['diem_tb']:.2f}/12 · lượt đạt {moi['luot_dat']:.0f}% · lỗi nặng {sum(moi['nang'].values())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
