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

_DAU_TRANG = re.compile(
    r"^(CÔNG BÁO/Số .*|Ký bởi:.*|Người ký:.*|Email:.*|Cơ quan:.*|Ngày ký:.*|Thời gian ký:.*|\d{1,4}\s+CÔNG BÁO/Số .*|CÔNG BÁO/Số .*\s+\d{1,4})$")
_SO_TRON = re.compile(r"^\d{1,4}$")   # số trang hoặc số chú thích đứng riêng một dòng
# Chú thích cuối trang của văn bản hợp nhất: "3" đứng riêng rồi "Điểm này được sửa đổi, bổ sung theo quy định tại … Luật số …".
_CHU_THICH = re.compile(r"^((Điểm|Khoản|Điều|Đoạn|Mục|Chương|Tên điều|Tiêu đề) này (được|có hiệu lực|bị|hết hiệu lực)\b|Cụm từ “|Cụm từ \"|"
                        r"Luật này có hiệu lực|Văn bản này)")
TRANG, SO = "\x00TRANG", "\x00SO"
# Mốc chú thích in DÍNH vào chữ (văn bản hợp nhất): "thôn5", "e)3", "4.25 Ủy ban…", "biển;21", "năm 20241". Không đụng m2 / m3 / km2 và
# số thập phân "0,5" (trước dấu là chữ số, không phải chữ).
_MOC_DINH = (
    (re.compile(r"^(\d+[a-zđ]?\.)(\d{1,3})(?=\s)"), r"\1"),
    (re.compile(r"^([a-zđ]\))(\d{1,3})(?=\s)"), r"\1"),
    (re.compile(r"(năm \d{4})\d{1,3}\b"), r"\1"),
    (re.compile(r"(?<![a-zà-ỹđ]m)(?<!\bm)(?<=[a-zà-ỹđ])\d{1,3}(?=[\s,.;:]|$)"), ""),
    (re.compile(r"(?<=[a-zà-ỹđ\)”][;.,:])\d{1,3}(?=\s|$)"), ""),
)


def bo_moc_dinh(d: str) -> str:
    for mau, thay in _MOC_DINH:
        d = mau.sub(thay, d)
    return d
_DIEU = re.compile(r"^Điều\s+(\d+[a-zđ]?)\.\s*(.*)$")
_MO_DOAN = re.compile(r"^(“(Điều\s+\d+[a-zđ]?\.|\d+[a-zđ]?\.\s|[a-zđ]\)\s)|Điều\s+\d+[a-zđ]?\.|Chương\s+[IVXLCDM]+\b|Mục\s+\d+\b|Phần\s+thứ\b|\d+[a-zđ]?\.\s|[a-zđ]\)\s|[-–+•]\s)")
_KHOAN = re.compile(r"(?m)^\d+[a-zđ]?\.\s")
_CHUONG = re.compile(r"^(Chương\s+[IVXLCDM]+\b|Mục\s+\d+\b|Phần\s+thứ\b)")
_KET = re.compile(r"^((Bộ luật|Luật|Nghị quyết) này (đã )?được Quốc hội|Nơi nhận:|TM\. CHÍNH PHỦ|CHỦ TỊCH QUỐC HỘI\b|XÁC THỰC VĂN BẢN HỢP NHẤT)")


def _chuan(s: str) -> str:
    s = unicodedata.normalize("NFC", s.replace("\f", "\n").replace(" ", " "))
    return re.sub(r"[ \t]+", " ", s)


def dong_sach(chu: str) -> list[str]:
    """Các dòng còn chữ, giữ thứ tự. Đầu / chân trang (Công báo, chữ ký số) → dấu `TRANG`; số đứng riêng một dòng → dấu `SO` (số trang
    hoặc mốc chú thích — `doan` phân biệt)."""
    ra = []
    for x in _chuan(chu).split("\n"):
        d = x.strip()
        if not d:
            continue
        ra.append(TRANG if _DAU_TRANG.match(d) else SO if _SO_TRON.match(d) else d)
    return ra


def doan(dong: list[str]) -> list[str]:
    """Nối dòng bị ngắt khi in: dòng mở điều / chương / khoản / điểm mới là đoạn mới, còn lại nối vào đoạn THÂN trước đó. Chú thích cuối
    trang (mốc số rồi "Điểm này được sửa đổi …") bị bỏ cùng các dòng nối của nó, tới hết trang; chữ thân sang trang nối tiếp đúng câu đang dở."""
    ra: list[str] = []
    chu_thich = False      # đang trong một chú thích cuối trang
    sau_trang = False      # số đứng riêng ngay sau đầu trang là số trang, không phải mốc chú thích
    moc = False            # vừa gặp mốc chú thích
    for d in dong:
        if d == TRANG:
            chu_thich, moc, sau_trang = False, False, True
            continue
        if d == SO:
            moc = not sau_trang
            sau_trang = False
            continue
        sau_trang = False
        if moc and _CHU_THICH.match(d):
            chu_thich, moc = True, False
            continue
        moc = False
        mo = _MO_DOAN.match(d) or _KET.match(d)
        if chu_thich and not mo:
            continue
        chu_thich = False
        # Tiêu đề điều xuống dòng thì dòng tiếp mở bằng chữ thường; dòng chữ HOA ngay sau tiêu đề là thân điều (điều không chia khoản).
        if not ra or mo or (_DIEU.match(ra[-1]) and d[:1].isupper()):
            ra.append(d)
        else:
            ra[-1] = ra[-1] + " " + d
    return ra


_BAI_BO = re.compile(r"^Điều \d+[a-zđ]?\.\s*\d*\s*\((được |đã |bị )?(bãi bỏ|hết hiệu lực)\)\s*$")


def tach_dieu(cac_doan: list[str], hop_nhat: bool = False) -> list[dict]:
    """Đoạn → điều. Tiêu đề điều là phần chữ sau "Điều N." cộng các dòng chữ thường nối tiếp (đã nối ở `doan`). Đoạn chương / mục không
    vào điều nào; gặp dòng kết văn bản (chữ ký, nơi nhận) thì dừng."""
    dieu: list[dict] = []
    # (Chỉ văn bản hợp nhất — luật / nghị định sửa đổi thì nội dung chính NẰM trong ngoặc kép.) Đoạn trích nguyên văn luật KHÁC ("“Điều 50. Hiệu lực thi hành … ”.") — không phải điều của văn bản này. Đếm ngoặc mở / đóng (trích
    # có thể dài nhiều đoạn, có ngoặc lồng bên trong); hết trích khi số ngoặc đóng bằng số ngoặc mở.
    mo = 0
    for p in cac_doan:
        if hop_nhat and (mo > 0 or re.match(r'^“(Điều\s+\d+[a-zđ]?\.|\d+[a-zđ]?\.\s|[a-zđ]\)\s)', p)):
            mo = max(0, mo + p.count("“") - p.count("”"))
            continue
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


def tach(chu: str, hop_nhat: bool = False) -> list[dict]:
    """`hop_nhat`: văn bản hợp nhất — bỏ thêm mốc chú thích dính vào chữ (`bo_moc_dinh`)."""
    dong = dong_sach(chu)
    if hop_nhat:
        dong = [d if d in (TRANG, SO) else bo_moc_dinh(d) for d in dong]
    ra = []
    # Văn bản hợp nhất giữ chỗ điều đã bãi bỏ ("Điều 23.67 (được bãi bỏ)") rồi in điều thay thế cùng số — bỏ dòng giữ chỗ.
    for d in [x for x in tach_dieu(doan(dong), hop_nhat) if not (_BAI_BO.match(x["tieu_de"]) and not x["than"])]:
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
    dong = tach(chu, hop_nhat=vb["loai"] == "vbhn")
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
