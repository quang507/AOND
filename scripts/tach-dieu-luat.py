#!/usr/bin/env python3
"""Tách nguyên văn một văn bản pháp luật (chữ pdftotext của bản Công báo / văn bản hợp nhất) thành từng ĐIỀU để nạp bảng `dieu_luat`
(SRS-5.1zzzzzzz231, 28/10/2026). Không gọi mạng, không gọi AI: chỉ đọc chữ, bỏ dòng đầu trang / số trang / chữ ký số, nối dòng bị ngắt,
cắt điều dài theo khoản.

Dùng:
    pdftotext <văn bản>.pdf <văn bản>.txt          # KHÔNG dùng -layout (cột lệch làm vỡ dòng)
    python3 scripts/tach-dieu-luat.py <so_hieu> <file.txt> [<file2.txt> …]

`so_hieu` phải có trong bot/supabase/luat/danh-muc.json (tên, loại, hiệu lực, link nguồn chính thức). Ra bot/supabase/luat/<tệp>.json;
nạp lên DB bằng scripts/nap-luat.mjs (apply-migration ô `nap-luat`). Văn bản đã sửa đổi thì nạp bản HỢP NHẤT, không nạp luật sửa đổi rời
(luật sửa đổi viết "sửa đổi khoản 2 Điều 45 như sau:" — tách theo điều sẽ ra điều giả).

Thoát 1 khi số điều trùng (tách sai) hoặc không ra điều nào; thiếu số điều chỉ cảnh báo (văn bản hợp nhất có điều bị bãi bỏ)."""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

GOC = Path(__file__).resolve().parent.parent
THU_MUC = GOC / "bot" / "supabase" / "luat"
TOI_DA = 1800   # ký tự mỗi phần — vừa một lượt nhúng (gemini-embedding-001 ~2.048 token), đủ ngắn để trích cho model

_BO_DONG = re.compile(
    r"^(CÔNG BÁO/Số .*|\d{1,4}|Ký bởi:.*|Người ký:.*|Email:.*|Cơ quan:.*|Ngày ký:.*|Thời gian ký:.*|"
    r"\d{1,4}\s+CÔNG BÁO/Số .*|CÔNG BÁO/Số .*\s+\d{1,4})$")
_DIEU = re.compile(r"^Điều\s+(\d+[a-zđ]?)\.\s*(.*)$")
_MO_DOAN = re.compile(r"^(Điều\s+\d+[a-zđ]?\.|Chương\s+[IVXLCDM]+\b|Mục\s+\d+\b|Phần\s+thứ\b|\d+[a-zđ]?\.\s|[a-zđ]\)\s|[-–+•]\s)")
_KHOAN = re.compile(r"(?m)^\d+[a-zđ]?\.\s")
_CHUONG = re.compile(r"^(Chương\s+[IVXLCDM]+\b|Mục\s+\d+\b|Phần\s+thứ\b)")
_KET = re.compile(r"^((Bộ luật|Luật|Nghị quyết) này (đã )?được Quốc hội|Nơi nhận:|TM\. CHÍNH PHỦ|CHỦ TỊCH QUỐC HỘI\b|XÁC THỰC VĂN BẢN HỢP NHẤT)")


def _chuan(s: str) -> str:
    s = unicodedata.normalize("NFC", s.replace("\f", "\n").replace(" ", " "))
    return re.sub(r"[ \t]+", " ", s)


def dong_sach(chu: str) -> list[str]:
    """Bỏ dòng rác đầu / chân trang, giữ nguyên thứ tự các dòng còn lại."""
    return [d for d in (x.strip() for x in _chuan(chu).split("\n")) if d and not _BO_DONG.match(d)]


def doan(dong: list[str]) -> list[str]:
    """Nối dòng bị ngắt khi in: dòng mở điều / chương / khoản / điểm mới là đoạn mới, còn lại nối vào đoạn trước."""
    ra: list[str] = []
    for d in dong:
        # Tiêu đề điều xuống dòng thì dòng tiếp mở bằng chữ thường; dòng chữ HOA ngay sau tiêu đề là thân điều (điều không chia khoản).
        if not ra or _MO_DOAN.match(d) or _KET.match(d) or (_DIEU.match(ra[-1]) and d[:1].isupper()):
            ra.append(d)
        else:
            ra[-1] = ra[-1] + " " + d
    return ra


def tach_dieu(cac_doan: list[str]) -> list[dict]:
    """Đoạn → điều. Tiêu đề điều là phần chữ sau "Điều N." cộng các dòng chữ thường nối tiếp (đã nối ở `doan`). Đoạn chương / mục không
    vào điều nào; gặp dòng kết văn bản (chữ ký, nơi nhận) thì dừng."""
    dieu: list[dict] = []
    for p in cac_doan:
        if _KET.match(p):
            break
        m = _DIEU.match(p)
        if m:
            so, ten = m.group(1), m.group(2).strip()
            dieu.append({"dieu": so, "tieu_de": f"Điều {so}. {ten}".strip(), "than": []})
            continue
        if _CHUONG.match(p) or not dieu:
            continue
        dieu[-1]["than"].append(p)
    return dieu


def cat_phan(than: list[str], toi_da: int = TOI_DA) -> list[str]:
    """Ghép các đoạn của một điều thành ≤ `toi_da` ký tự mỗi phần, cắt ở ranh giới đoạn (khoản / điểm); một đoạn quá dài thì cắt ở câu."""
    manh: list[str] = []
    for p in than:
        while len(p) > toi_da:
            cat = p.rfind(". ", 0, toi_da)
            cat = cat + 1 if cat > toi_da // 2 else toi_da
            manh.append(p[:cat].strip())
            p = p[cat:].strip()
        if p:
            manh.append(p)
    phan: list[str] = []
    for m in manh:
        if phan and len(phan[-1]) + 1 + len(m) <= toi_da:
            phan[-1] += "\n" + m
        else:
            phan.append(m)
    return phan or [""]


def tach(chu: str) -> list[dict]:
    ra = []
    for d in tach_dieu(doan(dong_sach(chu))):
        for i, nd in enumerate(cat_phan(d["than"]), 1):
            ra.append({"dieu": d["dieu"], "phan": i, "tieu_de": d["tieu_de"], "noi_dung": nd})
    return ra


def _so(dieu: str) -> int:
    return int(re.match(r"\d+", dieu).group())


def kiem(dong: list[dict]) -> tuple[list[str], list[str]]:
    """(lỗi, cảnh báo). Lỗi: trùng điều, rỗng. Cảnh báo: số điều nhảy cóc (có thể điều bị bãi bỏ trong văn bản hợp nhất)."""
    loi, canh = [], []
    if not dong:
        return ["không tách được điều nào"], []
    thu_tu = [d["dieu"] for d in dong if d["phan"] == 1]
    trung = sorted({x for x in thu_tu if thu_tu.count(x) > 1}, key=_so)
    if trung:
        loi.append("trùng số điều: " + ", ".join(trung[:20]))
    so = [_so(x) for x in thu_tu]
    for a, b in zip(so, so[1:]):
        if b < a:
            loi.append(f"số điều đi lùi: {a} → {b}")
        elif b > a + 1:
            canh.append(f"nhảy từ Điều {a} sang Điều {b}")
    rong = [d["dieu"] for d in dong if not d["noi_dung"].strip()]
    if rong:
        canh.append("điều không có nội dung: " + ", ".join(rong[:20]))
    return loi, canh


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    so_hieu, tep = argv[1], argv[2:]
    danh_muc = json.loads((THU_MUC / "danh-muc.json").read_text(encoding="utf-8"))
    vb = next((v for v in danh_muc["van_ban"] if v["so_hieu"] == so_hieu), None)
    if vb is None:
        print(f"Không có {so_hieu} trong danh-muc.json")
        return 2
    chu = "\n".join(Path(t).read_text(encoding="utf-8", errors="replace") for t in tep)
    dong = tach(chu)
    loi, canh = kiem(dong)
    for c in canh[:30]:
        print("  cảnh báo:", c)
    for e in loi:
        print("  LỖI:", e)
    if loi:
        return 1
    ra = THU_MUC / vb["tep"]
    ra.write_text(json.dumps({"so_hieu": so_hieu, "dieu": dong}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    so_dieu = len({d["dieu"] for d in dong})
    print(f"{so_hieu}: {so_dieu} điều, {len(dong)} phần → {ra.relative_to(GOC)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
