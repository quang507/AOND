#!/usr/bin/env python3
"""sinh-xa-tay-ninh.py — sinh migration dữ liệu bảng `xa_tinh_khac` (96 xã / phường MỚI của tỉnh Tây Ninh sau sáp nhập Long An + Tây Ninh
01/07/2025) từ Nghị quyết 1682/NQ-UBTVQH15 (16/06/2025, Điều 1). SRS-5.1zzzzzzz128, chủ dự án 22/10/2026: "nạp danh sách xã Long An đi".

Nguồn: toàn văn NQ do hoatieu.vn đăng lại (tải bằng script này, KHÔNG nhập tay). Mỗi khoản n của Điều 1 = một đơn vị mới + các đơn vị cũ gộp
vào (có khi chỉ "một phần diện tích"). NQ không ghi huyện / tỉnh cũ của từng đơn vị (chỉ ghi trong ngoặc khi trùng tên) nên bảng KHÔNG có cột đó.

    python3 -I scripts/sinh-xa-tay-ninh.py [đường-dẫn-NQ.txt] > bot/supabase/migrations/20261022a_xa_tinh_khac_tay_ninh.sql

Không đưa tham số thì tải trang nguồn. Soát: phải ra đúng 96 khoản, 82 xã + 14 phường (số liệu công bố của NQ); lệch thì thoát 1.
"""
from __future__ import annotations

import html
import re
import sys
import unicodedata
import urllib.request

NGUON_URL = "https://hoatieu.vn/phap-luat/nghi-quyet-1682-nq-ubtvqh15-2025-233558"
TINH = "Tây Ninh"
RAC = re.compile(r"(?i)\s*(sau khi sắp xếp theo quy định tại khoản.*?Điều này)\s*")


def tai_van_ban(duong_dan: str | None) -> str:
    if duong_dan:
        return open(duong_dan, encoding="utf-8").read()
    with urllib.request.urlopen(urllib.request.Request(NGUON_URL, headers={"User-Agent": "AOND/1.0"}), timeout=60) as r:
        s = r.read().decode("utf-8", "ignore")
    s = re.sub(r"(?is)<(script|style).*?</\1>", "", s)
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", s)
    t = html.unescape(re.sub(r"<[^>]+>", "", s))
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t)


def tach_don_vi_cu(trai: str) -> list[tuple[str, str]]:
    """Phần bên trái "… thành xã mới có tên gọi là …" → [(tên cũ có chữ loại, "toan_bo" | "mot_phan")]."""
    trai = RAC.sub(" ", trai)
    trai = re.sub(r"(?i)^sắp xếp\s+", "", trai.strip())
    ra: list[tuple[str, str]] = []
    # tách theo cụm "toàn bộ ... của" / "một phần ... của" / "phần còn lại của"
    cum = re.split(r"(?i)(toàn bộ diện tích tự nhiên, quy mô dân số(?: của)?|một phần diện tích tự nhiên, quy mô dân số(?: của)?|"
                   r"phần còn lại(?: diện tích tự nhiên, quy mô dân số)?(?: của)?)", trai)
    che_do = "toan_bo"
    for ph in cum:
        low = ph.lower().strip()
        if low.startswith("toàn bộ"):
            che_do = "toan_bo"
            continue
        if low.startswith("một phần") or low.startswith("phần còn lại"):
            che_do = "mot_phan"
            continue
        ph = re.sub(r"^\s*(của|,|và)\s+", "", ph.strip())
        if not ph:
            continue
        loai = None
        for tok in re.split(r",\s*|\s+và\s+", ph):
            tok = tok.strip().strip(",")
            if not tok:
                continue
            m = re.match(r"(?i)^(các\s+)?(xã|thị trấn|phường|thành phố|thị xã)\s+(.*)$", tok)
            if m:
                loai = m.group(2).lower()
                ten = m.group(3).strip()
            else:
                if loai is None:
                    continue
                ten = tok
            ten = re.sub(r"\s+(và|,)+$", "", re.sub(r"\s+", " ", ten).strip(" ."))
            if ten:
                ra.append((f"{loai} {ten}", che_do))
    return ra


def doc_khoan(van_ban: str) -> list[dict]:
    van_ban = unicodedata.normalize("NFC", van_ban)   # nguồn có khoản (vd 44) gõ chữ có dấu dạng tổ hợp ("xa" + dấu ngã)
    i, j = van_ban.find("Điều 1."), van_ban.find("Điều 2.")
    thân = van_ban[i:j]
    ds = []
    for so, nd in re.findall(r"^(\d+)\.\s+(Sắp xếp.*)$", thân, flags=re.M):
        m = re.search(r"thành\s+(xã|phường)\s+mới có tên gọi là\s+(xã|phường)\s+(.+?)\.?\s*$", nd)
        if not m:
            raise SystemExit(f"khoản {so}: không đọc được đơn vị mới: {nd[:120]}")
        loai, ten = m.group(2), m.group(3).strip()
        cu = tach_don_vi_cu(nd[:m.start()])
        ds.append({"so": int(so), "loai": "xa" if loai == "xã" else "phuong", "ten": ten, "cu": cu})
    return ds


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> None:
    ds = doc_khoan(tai_van_ban(sys.argv[1] if len(sys.argv) > 1 else None))
    xa = sum(d["loai"] == "xa" for d in ds)
    if len(ds) != 96 or xa != 82 or len(ds) - xa != 14:
        raise SystemExit(f"lệch số liệu NQ: {len(ds)} đơn vị ({xa} xã, {len(ds) - xa} phường), cần 96 = 82 + 14")
    if len({(d['loai'], d['ten']) for d in ds}) != 96:
        raise SystemExit("tên đơn vị mới trùng nhau")
    out = [
        "-- 20261022a — Bảng `xa_tinh_khac`: 96 xã / phường MỚI của tỉnh Tây Ninh (hợp nhất Long An + Tây Ninh từ 01/07/2025) và các đơn vị cũ gộp vào",
        "-- (SRS-5.1zzzzzzz128). Chủ dự án 22/10/2026: \"xã phước lý tức là hết huyện rồi… nạp danh sách xã Long An đi\". Lõi Python tra bảng này để nhận",
        "-- \"xã Phước Lý\" (cũ hay mới) là xã của tỉnh Tây Ninh, không hỏi huyện. KHÔNG đụng bảng `wards` (168 phường TP.HCM, khoá chính là tên ngắn, ràng buộc",
        "-- tinh_cu chỉ cho TP.HCM / Bình Dương / Bà Rịa – Vũng Tàu, và là nguồn duy nhất của cột listings.ward — bất biến SRS-5.1zzzzj).",
        "-- NGUỒN: Nghị quyết 1682/NQ-UBTVQH15 (16/06/2025) Điều 1, toàn văn hoatieu.vn — SINH TỰ ĐỘNG bằng scripts/sinh-xa-tay-ninh.py, không nhập tay.",
        "",
        "create table if not exists public.xa_tinh_khac (",
        "  ten_day_du text primary key,                 -- \"Xã Phước Lý\" / \"Phường Gia Lộc\"",
        "  ten text not null,                           -- tên ngắn: \"Phước Lý\"",
        "  loai text not null check (loai in ('xa', 'phuong')),",
        "  tinh text not null,                          -- tỉnh MỚI",
        "  don_vi_cu jsonb not null default '[]'::jsonb, -- [{\"ten\": \"xã Long Thượng\", \"toan_bo\": true}, …] — đơn vị cũ gộp vào",
        "  nguon text not null",
        ");",
        "comment on table public.xa_tinh_khac is '[RỔ HÀNG] Xã / phường MỚI của tỉnh Tây Ninh sau hợp nhất Long An (NQ 1682/NQ-UBTVQH15, 01/07/2025) + đơn vị cũ gộp vào. Lõi tra để nhận địa chỉ xã, không hỏi huyện. Không phải wards (TP.HCM).';",
        "comment on column public.xa_tinh_khac.don_vi_cu is 'Đơn vị cấp xã cũ gộp vào (kèm \"toan_bo\": false khi chỉ một phần diện tích). NQ không ghi huyện cũ.';",
        "alter table public.xa_tinh_khac enable row level security;",
        "revoke all on public.xa_tinh_khac from anon, authenticated;",
        "grant all on public.xa_tinh_khac to service_role;",
        "",
        "insert into public.xa_tinh_khac (ten_day_du, ten, loai, tinh, don_vi_cu, nguon) values",
    ]
    dong = []
    for d in ds:
        tien_to = "Xã" if d["loai"] == "xa" else "Phường"
        cu = [{"ten": ten, "toan_bo": cd == "toan_bo"} for ten, cd in d["cu"]]
        import json
        dong.append(f"  ({q(tien_to + ' ' + d['ten'])}, {q(d['ten'])}, {q(d['loai'])}, {q(TINH)}, {q(json.dumps(cu, ensure_ascii=False))}::jsonb, "
                    f"{q('NQ 1682/NQ-UBTVQH15 k.' + str(d['so']) + ' (hoatieu.vn)')})")
    out.append(",\n".join(dong))
    out.append("on conflict (ten_day_du) do update set don_vi_cu = excluded.don_vi_cu, nguon = excluded.nguon, tinh = excluded.tinh;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
