#!/usr/bin/env python3
"""do-prompt.py — ĐO cỡ prompt theo KHỐI, không sửa lõi (SRS-5.1zzzzzzz366).

Chủ dự án 02/11 hỏi prompt có dông dài không. Sổ `bot_usage_model` cho token VÀO mỗi lần gọi (gồm cache): Sonnet viết lời
29/10 = 10.733 → 02/11 = 19.402 (+80% trong 4 ngày); Haiku bóc tách 19–24k mỗi lần.

Cách đo — bắt prompt THẬT, không dựng lại bằng tay và KHÔNG tốn tiền model:
  1. Chạy `Engine.handle` với provider GIẢ (`MockProvider`) cho từng loại lượt; móc `reply` / `chat` / `extract` ghi lại
     toàn văn system prompt. Lõi vẫn ghép prompt y như chạy thật, chỉ không gọi model.
  2. Cắt khối theo HẰNG CHUỖI của `prompts.py`: mọi hằng IN HOA > 300 ký tự được dò đúng chuỗi trong prompt bắt được, nên
     phần lớn byte được gán CHÍNH XÁC theo tên, không đoán theo văn bản.
  3. Phần còn lại cắt theo dòng tiêu đề `=== TÊN ===`; sót lại thì gom theo đoạn (nhãn = mấy chữ đầu).

Token: ước = ký tự / 3,5 (tiếng Việt có dấu). Đây là ƯỚC LƯỢNG, không phải số của API.

LƯU Ý khi đọc số: con số của `bot_usage_model` là token VÀO MỖI LẦN GỌI, gồm cả lời chat trong hội thoại, định nghĩa công cụ
và phần cache — system prompt chỉ là MỘT phần. Bảng này chỉ đo system prompt.

Dùng: python3 scripts/do-prompt.py [--goc <commit>] [--sl 15]
"""
from __future__ import annotations

import argparse
import inspect
import os
import re
import subprocess
import sys

GOC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(GOC, "src"))
CHU_MOI_TOKEN = 3.5


def tok(s: str) -> int:
    return round(len(s) / CHU_MOI_TOKEN)


# ---------- 1. bắt prompt thật ----------

def bat_prompt() -> list[tuple[str, str, str]]:
    """[(loại lượt, việc gọi: boc/loi, toàn văn system)] — chạy lõi với provider giả."""
    os.environ.setdefault("AIOI_LLM", "mock")
    from aioi.config import load_settings
    from aioi.engine import Engine
    from aioi.llm.mock import MockProvider

    ghi: list[tuple[str, str, str]] = []
    nhan = ["?"]

    class P(MockProvider):
        def reply(self, system, messages, **k):
            ghi.append((nhan[0], "loi", system))
            return MockProvider.chat(self, system, messages, **k)

        def chat(self, system, messages, **k):
            ghi.append((nhan[0], "loi", system))
            return MockProvider.chat(self, system, messages, **k)

        def extract(self, system, *a, **k):
            ghi.append((nhan[0], "boc", system))
            return MockProvider.extract(self, system, *a, **k)

    # mỗi loại lượt: (nhãn, các câu khách nói tới lượt đó)
    CA = [
        ("bán · lượt đầu", ["anh bán nhà hẻm Cao Lỗ quận 8, 50m2, 1 trệt 2 lầu, 8 tỷ"]),
        ("bán · hỏi ô", ["anh bán nhà hẻm Cao Lỗ quận 8", "50m2, 1 trệt 2 lầu", "sổ hồng riêng", "8 tỷ"]),
        ("bán · ra bản tin", ["anh bán nhà hẻm 4m Cao Lỗ quận 8, 50m2, 1 trệt 2 lầu, sổ hồng riêng, 8 tỷ, nhà trống"]),
        ("bán · hỏi phí", ["anh bán nhà hẻm Cao Lỗ quận 8, 50m2, 8 tỷ", "phí môi giới bên em thu sao?"]),
        ("mua · lượt đầu", ["anh cần tìm mua nhà quận 8 dưới 7 tỉ"]),
    ]
    for ten, cau in CA:
        eng = Engine(P(load_settings()))
        key = "thu-do-" + re.sub(r"[^a-z]+", "", ten)
        for i, c in enumerate(cau):
            nhan[0] = ten if i == len(cau) - 1 else f"{ten} (lượt {i+1})"
            try:
                eng.handle(key, c)
            except Exception as e:   # noqa: BLE001 — provider giả không phủ hết nhánh; vẫn đo được lượt đã bắt
                print(f"   (bỏ qua {ten} lượt {i+1}: {type(e).__name__})", file=sys.stderr)
    ra = [(t, v, s) for t, v, s in ghi if not t.endswith(")")]
    ra += bat_hai_luot_nang()
    return ra


def bat_hai_luot_nang() -> list[tuple[str, str, str]]:
    """Hai lượt NẶNG NHẤT (ra bản tin, hỏi phí) provider giả không tới được — gọi THẲNG hàm dựng của lõi với ô tin đầy đủ.
    Đây đúng là hai lượt mà số Sonnet 19.402 token của `bot_usage_model` nói tới."""
    from aioi.prompts import build_fee_followup_system, build_listing_proposal_system
    from aioi.revenue import SellerRole
    from aioi.schema import Property
    prop = Property(loai_hinh="nha_pho")
    prop.fields.update({"duong": "Cao Lỗ", "quan": "Quận 8", "phuong": "Phường Chánh Hưng", "gia": "8 tỷ",
                        "dien_tich": "50m²", "ket_cau": "1 trệt 2 lầu", "phap_ly": "so_hong_rieng",
                        "duong_vao": "hẻm 4m", "tinh_trang": "nhà trống", "so_phong_ngu": "3"})
    return [
        ("bán · ra bản tin", "loi", build_listing_proposal_system("M•ai", prop, xung_ho="anh", toi="em")),
        ("bán · hỏi phí", "loi", build_fee_followup_system("M•ai", prop, SellerRole.CHU_NHA,
                                                           web={"len_web": True, "ma": "AD21244D"}, duyet="dong_y")),
    ]


# ---------- 2. cắt khối ----------

def hang_prompt(mod) -> list[tuple[str, str]]:
    """Hằng chuỗi IN HOA > 300 ký tự trong prompts.py, dài trước (khối lớn trùm khối nhỏ)."""
    ra = [(n, v) for n, v in vars(mod).items() if isinstance(v, str) and len(v) > 300 and n.isupper()]
    return sorted(ra, key=lambda x: -len(x[1]))


def cat_khoi(system: str, hang: list[tuple[str, str]]) -> list[tuple[str, int]]:
    """[(tên khối, số ký tự)] — gán theo hằng trước (chính xác), rồi theo '=== TÊN ===', rồi theo đoạn."""
    con = [(0, len(system), None)]   # các khoảng chưa gán
    for ten, v in hang:
        moi = []
        for a, b, nhan in con:
            if nhan is not None:
                moi.append((a, b, nhan)); continue
            i = system.find(v, a, b)
            if i < 0:
                moi.append((a, b, None)); continue
            if i > a:
                moi.append((a, i, None))
            moi.append((i, i + len(v), ten))
            if i + len(v) < b:
                moi.append((i + len(v), b, None))
        con = moi
    ra: list[tuple[str, int]] = []
    for a, b, nhan in con:
        doan = system[a:b]
        if nhan is not None:
            ra.append((nhan, len(doan))); continue
        # chưa gán: cắt theo "=== TÊN ==="
        moc = [(m.start(), m.group(1).strip()) for m in re.finditer(r"^=== (.+?) ===", doan, re.M)]
        if not moc:
            for p in [x for x in re.split(r"\n\s*\n", doan) if x.strip()]:
                ra.append(("(rời) " + re.sub(r"\s+", " ", p.strip())[:46], len(p)))
            continue
        if moc[0][0] > 0:
            dau = doan[:moc[0][0]]
            if dau.strip():
                ra.append(("(rời) " + re.sub(r"\s+", " ", dau.strip())[:46], len(dau)))
        for j, (i, ten) in enumerate(moc):
            het = moc[j + 1][0] if j + 1 < len(moc) else len(doan)
            ra.append(("=== " + ten[:44], het - i))
    return ra


# ---------- 3. so với 29/10 ----------

def co_hang_o_commit(commit: str) -> dict[str, int]:
    """Cỡ từng hằng prompt ở một commit — đọc prompts.py của commit đó, không checkout."""
    try:
        src = subprocess.run(["git", "-C", GOC, "show", f"{commit}:src/aioi/prompts.py"],
                             capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        return {}
    ra: dict[str, int] = {}
    # hằng gán bằng chuỗi ba nháy: NAME = """...."""
    for m in re.finditer(r'^([A-Z][A-Z0-9_]+)\s*(?::[^=\n]+)?=\s*(\'\'\'|""")(.*?)\2', src, re.S | re.M):
        ra[m.group(1)] = max(ra.get(m.group(1), 0), len(m.group(3)))
    return ra


# ---------- 4. hai cột soát ----------

LUAT_CODE_CHAN = {
    "tieu_de": "bản tin phải có giá trong tiêu đề",
    "lo_rieng": "không lộ thông tin riêng của khách khác",
    "khang_dinh": "không khẳng định điều ô tin không có (hẻm / tiện ích / pháp lý)",
    "ten_khoi": "không gọi tên khối nội bộ",
    "tu_noi_bo": "không dùng từ nội bộ (\"rổ\"…)",
    "da_mo_dau": "không mở đầu \"Dạ\"",
    "goi_minh": "không gọi khách là \"mình\"",
    "phi_vai": "mức phí phải khớp vai người rao",
    "tin_dang_hien": "không nói tin đang hiện khi chưa lên",
    "mot_cau_hoi": "tối đa MỘT câu hỏi mỗi lượt",
    "hua_gui_anh": "không hứa gửi ảnh",
    "phuong_cu": "không dùng tên phường cũ",
    "mt_can_ho": "căn hộ không nói mặt tiền",
    "don_vi": "số phải kèm đơn vị",
    "binh_luan_gia": "không bình luận giá",
    "so_can_mua": "không sai số căn phía mua",
    "so_trong_tin": "bản tin không có số khách không nói",
    "yeu_cau_viet": "khách dặn cách viết thì phải rao lại",
    "lap": "không lặp mở đầu lượt trước (mềm)",
    "dap_ok_dai": "đáp \"ok\" không dài dòng (mềm)",
}

# dấu nhận một luật trong prompt: (tên luật code, các mẫu chữ xuất hiện trong prompt)
DAU_LUAT = {
    "mot_cau_hoi": [r"một câu hỏi", r"MỘT câu hỏi", r"chỉ hỏi MỘT"],
    "goi_minh": [r"\"mình\"", r"gọi khách là ['\"]?mình"],
    "da_mo_dau": [r"KHÔNG mở đầu [\"']?Dạ", r"không bắt đầu bằng [\"']?Dạ"],
    "binh_luan_gia": [r"không (nhận xét|bình luận)[^.\n]{0,24}giá", r"KHÔNG nhận xét[^.\n]{0,24}giá"],
    "so_trong_tin": [r"không tự nhân", r"KHÔNG tự nhân", r"số.{0,20}chủ nhà KHÔNG", r"không (được )?bịa số"],
    "tu_noi_bo": [r"\brổ\b"],
    "khang_dinh": [r"không (được )?bịa", r"KHÔNG bịa", r"chưa có thông tin"],
    "tieu_de": [r"tiêu đề[^.\n]{0,30}giá"],
    "don_vi": [r"kèm đơn vị"],
    "phi_vai": [r"1% giá chốt", r"0[.,]5% "],
    "hua_gui_anh": [r"không hứa[^.\n]{0,20}ảnh"],
    "phuong_cu": [r"phường cũ"],
}


def soat_trung_va_code(khoi_van: dict[str, str]) -> tuple[list[tuple[str, list[str]]], list[tuple[str, str, list[str]]]]:
    """(a) luật nói TRÙNG ở ≥ 2 khối; (b) luật prompt mà LUAT_SOAT đã chặn bằng code."""
    trung, boi_code = [], []
    for luat, maus in DAU_LUAT.items():
        co = [ten for ten, van in khoi_van.items() if any(re.search(m, van, re.I) for m in maus)]
        if len(co) >= 2:
            trung.append((luat, co))
        if co and luat in LUAT_CODE_CHAN:
            boi_code.append((luat, LUAT_CODE_CHAN[luat], co))
    return sorted(trung, key=lambda x: -len(x[1])), boi_code


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--goc", default="15805d7", help="commit để so (mặc định: commit cuối 29/10)")
    ap.add_argument("--sl", type=int, default=15, help="số khối lớn nhất in ra")
    a = ap.parse_args()

    from aioi import prompts
    hang = hang_prompt(prompts)
    bat = bat_prompt()
    print(f"\nĐã bắt {len(bat)} prompt thật từ {len({t for t,_,_ in bat})} loại lượt (provider giả, 0 đồng).")

    # gộp theo khối: tổng ký tự lớn nhất từng thấy, và loại lượt nào có
    khoi: dict[str, dict] = {}
    for ten_luot, viec, s in bat:
        for ten_khoi, n in cat_khoi(s, hang):
            d = khoi.setdefault(ten_khoi, {"chu": 0, "o": set(), "viec": set()})
            d["chu"] = max(d["chu"], n)
            d["o"].add(ten_luot)
            d["viec"].add(viec)

    cu = co_hang_o_commit(a.goc)
    print(f"\n{'KHỐI':<46} {'token':>7} {'ký tự':>8} {'29/10':>8} {'đổi':>9}  việc · lượt")
    print("-" * 118)
    for ten, d in sorted(khoi.items(), key=lambda x: -x[1]["chu"])[:a.sl]:
        truoc = cu.get(ten.lstrip("=== ").strip())
        if truoc is None and ten in cu:
            truoc = cu[ten]
        doi = "—" if truoc is None else (f"+{d['chu']-truoc:,}" if d["chu"] >= truoc else f"{d['chu']-truoc:,}")
        print(f"{ten[:45]:<46} {tok(str('x')*d['chu']):>7,} {d['chu']:>8,} {('—' if truoc is None else f'{truoc:,}'):>8} {doi:>9}  "
              f"{'/'.join(sorted(d['viec'])):<8} {len(d['o'])} lượt")

    tong_boc = max((len(s) for _, v, s in bat if v == "boc"), default=0)
    tong_loi = max((len(s) for _, v, s in bat if v == "loi"), default=0)
    print(f"\nSystem prompt LỚN NHẤT bắt được: bóc tách {tong_boc:,} ký tự (~{tok('x'*tong_boc):,} token) · "
          f"viết lời {tong_loi:,} ký tự (~{tok('x'*tong_loi):,} token)")

    khoi_van = {n: v for n, v in hang}
    trung, boi_code = soat_trung_va_code(khoi_van)
    print(f"\n(a) LUẬT NÓI TRÙNG — cùng một ý ở ≥ 2 khối ({len(trung)}):")
    for luat, co in trung:
        print(f"   {luat:<16} ở {len(co)} khối: {', '.join(co)}")
    print(f"\n(b) LUẬT PROMPT mà LUAT_SOAT (engine.py:1836) ĐÃ CHẶN BẰNG CODE ({len(boi_code)}):")
    for luat, tomtat, co in boi_code:
        print(f"   {luat:<16} {tomtat}")
        print(f"   {'':<16} còn dặn trong: {', '.join(co)}")
    print("\nLƯU Ý: token ở đây là ƯỚC LƯỢNG (ký tự / 3,5) và CHỈ system prompt. Số của `bot_usage_model` là token VÀO mỗi lần "
          "gọi, gồm lời chat trong hội thoại, định nghĩa công cụ và phần cache — nên luôn lớn hơn bảng này.")
    in_sol()
    return 0


# Đọc từ `bot_usage_model` ngày 02/11/2026 (SQL ở dưới — chạy lại được). Bảng có TÁCH cột, nên bóc được "token vào" thành ba phần.
SOL = {
    "Sonnet viết lời": [("29/10", 223, 3622, 4187, 2924), ("01/11", 431, 2741, 13580, 1693), ("02/11", 1040, 3372, 14118, 1912)],
    "Haiku bóc tách": [("29/10", 251, 1338, 19276, 3082), ("01/11", 116, 1076, 17124, 3671), ("02/11", 279, 1166, 13358, 4703)],
}
SQL_SOL = """select day, model, calls,
  round(in_tokens::numeric/nullif(calls,0))          as in_moi_lan,
  round(cache_read_tokens::numeric/nullif(calls,0))  as cache_doc_moi_lan,
  round(cache_write_tokens::numeric/nullif(calls,0)) as cache_ghi_moi_lan
from bot_usage_model where day between '2026-10-29' and '2026-11-02' order by model, day;"""


def in_sol() -> None:
    """Bóc "token vào mỗi lần gọi" thành ba phần — chỗ phình KHÔNG phải nội dung gửi mới."""
    print("\n" + "=" * 100)
    print("BÓC TÁCH SỐ THẬT của `bot_usage_model` — vì sao \"token vào\" tăng 80% mà prompt KHÔNG dài thêm")
    for ten, rows in SOL.items():
        print(f"\n### {ten}")
        print(f"{'ngày':<7}{'lần gọi':>9}{'in (gửi mới)':>14}{'cache đọc':>11}{'cache ghi':>11}{'tổng vào':>10}{'giá quy đổi*':>14}")
        for ng, c, i, cr, cw in rows:
            print(f"{ng:<7}{c:>9,}{i:>14,}{cr:>11,}{cw:>11,}{i+cr+cw:>10,}{i + cr*0.1 + cw*1.25:>14,.0f}")
        d, c_ = rows[0], rows[-1]
        print(f"   → in (nội dung GỬI MỚI mỗi lần): {d[2]:,} → {c_[2]:,} ({(c_[2]/d[2]-1)*100:+.0f}%)")
        print(f"   → tổng token vào:                {d[2]+d[3]+d[4]:,} → {c_[2]+c_[3]+c_[4]:,} "
              f"({((c_[2]+c_[3]+c_[4])/(d[2]+d[3]+d[4])-1)*100:+.0f}%)")
        print(f"   → SỐ LẦN GỌI mỗi ngày:           {d[1]:,} → {c_[1]:,} ({(c_[1]/d[1]-1)*100:+.0f}%)")
    print("\n* quy đổi theo tỉ lệ Anthropic công bố cho prompt caching: cache ĐỌC 0,1× giá token vào, cache GHI 1,25×.")
    print("  (nên kiểm lại tỉ lệ với bảng giá hiện hành trước khi dùng để tính tiền)")
    print("\nSQL dựng lại:\n" + SQL_SOL)


if __name__ == "__main__":
    raise SystemExit(main())
