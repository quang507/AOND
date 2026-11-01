#!/usr/bin/env python3
"""doi-chieu-sdt.py — CÁC BẢN LUẬT SĐT PHẢI TRẢ LỜI CÙNG MỘT BẢNG CA (audit Đợt 1, AU-01, SRS-5.1zzzzzzz317).

Mẫu gốc là `src/aioi/sdt.py` (`MAU_SDT`). SQL `public.che_sdt` không import được Python nên chép nguyên chuỗi. "Một nguồn" cho hai ngôn ngữ
nghĩa là một BẢNG CA (`luat/sdt.json`, khuôn `luat/tien.json` + `doi-chieu-tien.mjs`), và:
  · Python `che_sdt` và SQL `che_sdt` phải ra ĐÚNG `mong` trên mọi ca (cả chuỗi sau khi che);
  · TS `thayLienHe` (`luat-lien-he.ts`, che liên hệ trên web) trên MỌI ca dương phải che ra đúng chuỗi như Python `che_sdt(cau, thay=NHAN)` — kiểm
    cả số thứ hai trong câu (chỉ hỏi "có SĐT không" thì số thứ hai lọt vẫn xanh, review PR #241). Ca âm không kiểm: web được che thừa.

Phía SQL chạy hàm trong file migration MỚI NHẤT có `public.che_sdt`, trên một Postgres cục bộ (CI: service postgres), và luôn gói trong
`begin … rollback`. Kết nối theo biến PG* chuẩn (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE). Không trỏ vào DB thật: host khác
localhost / 127.0.0.1 thì dừng. Không có Postgres thì thoát 2 ("chưa kiểm được"), KHÔNG phải "đạt", cùng luật với doi-chieu:tien.

    bun run doi-chieu:sdt
"""
from __future__ import annotations

import glob
import json
import os
import subprocess
import sys

GOC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(GOC, "src"))
from aioi.sdt import che_sdt  # noqa: E402

NHAN = "[số]"

CA = json.load(open(os.path.join(GOC, "bot", "tests", "luat", "sdt.json"), encoding="utf-8"))["ca"]


def migration_che_sdt() -> str:
    tep = sorted(glob.glob(os.path.join(GOC, "bot", "supabase", "migrations", "*.sql")))
    co = [t for t in tep if "function public.che_sdt(" in open(t, encoding="utf-8").read()]
    return co[-1]


def chay_sql(tep: str) -> dict[str, str] | None:
    host = os.environ.get("PGHOST", "127.0.0.1")
    if host not in ("127.0.0.1", "localhost", "::1") and not host.startswith("/"):
        print(f"PGHOST={host} không phải máy cục bộ — bài này không chạy trên DB thật.", file=sys.stderr)
        return None
    cau = json.dumps([c["cau"] for c in CA], ensure_ascii=False)
    lenh = (f"begin;\n\\i {tep}\n"
            "select json_agg(json_build_object('cau', c, 'kq', public.che_sdt(c)) order by i) "
            f"from json_array_elements_text($ca${cau}$ca$::json) with ordinality as t(c, i);\nrollback;\n")
    try:
        r = subprocess.run(["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", host], input=lenh, capture_output=True, text=True,
                           timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"Không chạy được psql: {e}", file=sys.stderr)
        return None
    if r.returncode != 0:
        print(f"psql lỗi: {r.stderr.strip()[:400]}", file=sys.stderr)
        return None
    dong = [d for d in r.stdout.splitlines() if d.startswith("[")]
    return {x["cau"]: x["kq"] for x in json.loads(dong[-1])} if dong else None


def chay_ts() -> dict[str, str] | None:
    ma = ("import { thayLienHe } from './bot/supabase/functions/_shared/extraction/luat-lien-he.ts';"
          f"const ca = JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify(ca.map((c) => [c, thayLienHe(c, {json.dumps(NHAN)})])));")
    try:
        r = subprocess.run(["bun", "-e", ma], input=json.dumps([c["cau"] for c in CA], ensure_ascii=False), capture_output=True, text=True,
                           cwd=GOC, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"Không chạy được bun: {e}", file=sys.stderr)
        return None
    if r.returncode != 0:
        print(f"bun lỗi: {r.stderr.strip()[:400]}", file=sys.stderr)
        return None
    return dict(json.loads(r.stdout.strip().splitlines()[-1]))


def main() -> int:
    tep = migration_che_sdt()
    sql = chay_sql(tep)
    if sql is None:
        print(f"→ CHƯA KIỂM ĐƯỢC phía SQL (không phải 'đạt'). Cần Postgres cục bộ; hàm ở {os.path.relpath(tep, GOC)}.", file=sys.stderr)
        return 2
    ts = chay_ts()
    if ts is None:
        print("→ CHƯA KIỂM ĐƯỢC phía TS (không phải 'đạt').", file=sys.stderr)
        return 2
    print(f"ĐỐI CHIẾU LUẬT SĐT — {len(CA)} ca · Python che_sdt ↔ SQL che_sdt ({os.path.basename(tep)}) · TS thayLienHe che như Python trên ca dương\n")
    hong = 0
    for c in CA:
        py, sq, duong = che_sdt(c["cau"]), sql.get(c["cau"]), c["mong"] != c["cau"]
        loi = []
        if py != c["mong"]:
            loi.append(f"Python {py!r} ≠ mong")
        if sq != c["mong"]:
            loi.append(f"SQL {sq!r} ≠ mong")
        if duong and ts.get(c["cau"]) != che_sdt(c["cau"], thay=NHAN):
            loi.append(f"TS {ts.get(c['cau'])!r} ≠ Python {che_sdt(c['cau'], thay=NHAN)!r} (TS lọt)")
        nhan = f"{c['cau']!r}".ljust(42)
        if loi:
            hong += 1
            print(f"\x1b[31m✗\x1b[0m {nhan} {' · '.join(loi)}  (mong {c['mong']!r}{', ' + c['vi_sao'] if c.get('vi_sao') else ''})")
        else:
            print(f"\x1b[32m✓\x1b[0m {nhan} {'che → ' + py if duong else 'giữ nguyên'}")
    duong = sum(c["mong"] != c["cau"] for c in CA)
    print(f"\n{len(CA) - hong}/{len(CA)} ca đạt ({duong} dương, {len(CA) - duong} âm)")
    if hong:
        print("\x1b[31mĐỐI CHIẾU SĐT HỎNG\x1b[0m — luật SĐT Python / SQL / TS đã trôi xa nhau.")
        return 1
    print("\x1b[32mĐỐI CHIẾU SĐT ĐẠT\x1b[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
