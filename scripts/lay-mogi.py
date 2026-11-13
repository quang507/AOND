"""Lấy tin rao từ Mogi làm DATASET THỬ cho AOND (chủ dự án 13/11/2026: "lấy thông tin và 1000 căn từ mogi về để có dataset còn test tính
năng", "trong phạm vi của AOND cần thôi").

Phạm vi AOND = TP.HCM mới (168 phường — gồm TP.HCM, Bình Dương, Bà Rịa–Vũng Tàu cũ). Chỉ lấy ô AOND dùng: loại, giao dịch, giá, diện tích,
phòng ngủ / WC, số tầng, đường vào, pháp lý, địa chỉ (đường, phường cũ, quận), toạ độ. KHÔNG lấy ảnh, tên / số điện thoại người đăng.
robots.txt của Mogi cho phép trang danh sách / chi tiết (chỉ cấm /api/, /Property/, /trang-ca-nhan/…); mỗi lần gọi cách nhau ≥ 1,2 giây.

Chạy:  python scripts/lay-mogi.py <thu_muc_ra> [tong=1000]
Ra:    <thu_muc_ra>/mogi.jsonl (mỗi dòng một tin, ghi nối — chạy lại thì bỏ qua tin đã có). Nạp DB bằng scripts/nap-mogi.py.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import time
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
NGHI = 1.2

# (đường dẫn danh mục, giao dịch, loại AOND, đường vào gợi ý, số tin) — tổng 1000
KE_HOACH = [
    ("ho-chi-minh/mua-nha-hem-ngo", "ban", "nha_pho", "hem", 220),
    ("ho-chi-minh/mua-nha-mat-tien-pho", "ban", "nha_pho", "mat_tien", 130),
    ("ho-chi-minh/mua-can-ho-chung-cu", "ban", "chung_cu", None, 150),
    ("ho-chi-minh/mua-dat-tho-cu", "ban", "dat", None, 60),
    ("ho-chi-minh/mua-nha-biet-thu-lien-ke", "ban", "biet_thu", None, 30),
    ("ho-chi-minh/thue-can-ho", "cho_thue", "chung_cu", None, 120),
    ("ho-chi-minh/thue-nha", "cho_thue", "nha_pho", None, 80),
    ("ho-chi-minh/thue-phong-tro-nha-tro", "cho_thue", "phong_tro", None, 40),
    ("ho-chi-minh/thue-mat-bang-cua-hang-shop", "cho_thue", "mat_bang", "mat_tien", 30),
    ("binh-duong/mua-nha", "ban", "nha_pho", None, 60),
    ("binh-duong/mua-dat", "ban", "dat", None, 40),
    ("ba-ria-vung-tau/mua-nha", "ban", "nha_pho", None, 40),
]

_lan_cuoi = 0.0


def lay(url: str) -> str:
    global _lan_cuoi
    for thu in range(3):
        cho = NGHI - (time.time() - _lan_cuoi)
        if cho > 0:
            time.sleep(cho)
        _lan_cuoi = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "vi"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8", errors="ignore")
        except Exception as e:  # noqa: BLE001
            print(f"  lỗi {type(e).__name__} lần {thu + 1}: {url}", flush=True)
            time.sleep(5 * (thu + 1))
    return ""


def chu(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s or "")).split())


def thuoc_tinh(trang: str) -> dict[str, str]:
    khoi = re.search(r'class="info-attrs[^"]*">(.*?)<!--Gioi thieu-->', trang, re.S)
    ra = {}
    for k, v in re.findall(r'<div class="info-attr clearfix">\s*<span>(.*?)</span>\s*<span>(.*?)</span>', khoi.group(1) if khoi else "", re.S):
        ra[chu(k)] = chu(v)
    return ra


def so(s: str | None) -> float | None:
    m = re.search(r"\d+(?:[.,]\d+)?", s or "")
    return float(m.group(0).replace(",", ".")) if m else None


def doc_tin(url: str, trang: str, deal: str, loai: str, loi_vao: str | None) -> dict | None:
    tieu_de = chu((re.search(r'<div class="title">\s*<h1>(.*?)</h1>', trang, re.S) or [None, ""])[1])
    dia_chi = chu((re.search(r'<div class="address">(.*?)</div>', trang, re.S) or [None, ""])[1])
    gia = chu((re.search(r'<div class="main-info">.*?<div class="price">(.*?)</div>', trang, re.S) or [None, ""])[1])
    toa = re.search(r"maps/embed/v1/place\?[^\"']*?q=(-?\d+\.\d+),(-?\d+\.\d+)", trang)
    mo_ta = chu((re.search(r'<div class="info-content-body">(.*?)</div>', trang, re.S) or [None, ""])[1])
    tt = thuoc_tinh(trang)
    if not (tieu_de and gia and toa) or not re.search(r"\d", gia) or "thỏa thuận" in gia.lower():
        return None
    lat, lng = float(toa.group(1)), float(toa.group(2))
    phan = [p.strip() for p in dia_chi.split(",")]
    duong = phan[0] if len(phan) >= 4 else None
    phuong_cu = next((p for p in phan if re.match(r"(Phường|Xã|Thị trấn)\b", p)), None)
    quan = next((re.sub(r"\s*\(.*\)$", "", p) for p in phan if re.match(r"(Quận|Huyện|Thành phố|Thị xã|TP\.?)\s", p)), None)
    dt_dat, dt_sd = so(tt.get("Diện tích đất")), so(tt.get("Diện tích sử dụng"))
    dt = (dt_dat or dt_sd) if loai in ("nha_pho", "dat", "biet_thu") and deal == "ban" else (dt_sd or dt_dat)
    if not dt:
        return None
    goc = f"{tieu_de}. {mo_ta}"
    tang = re.search(r"(\d)\s*(?:tầng|lầu|tấm)\b", goc, re.I)
    hem = re.search(r"h[ẻẽ]m\s*(?:xe hơi\s*)?(\d+(?:[.,]\d+)?)\s*m\b", goc, re.I)
    vao = loi_vao
    if loai in ("nha_pho", "dat") and deal == "ban" and vao is None:
        vao = "mat_tien" if re.search(r"mặt tiền|\bMT\b", tieu_de) else "hem" if re.search(r"h[ẻẽ]m", goc, re.I) else None
    if vao == "hem" and re.search(r"\bHXH\b|xe hơi|ô tô|oto", goc, re.I):
        vao = "hem_xe_hoi"
    return {
        "mogi_id": re.search(r"-id(\d+)$", url).group(1), "url": url, "deal": deal, "loai": loai, "loi_vao": vao,
        "tieu_de": tieu_de, "dia_chi": dia_chi, "duong": duong, "phuong_cu": phuong_cu, "quan": quan,
        "gia": gia + (" /tháng" if deal == "cho_thue" and "tháng" not in gia else ""), "dien_tich": dt,
        "dt_dat": dt_dat, "dt_su_dung": dt_sd, "phong_ngu": int(so(tt.get("Phòng ngủ")) or 0) or None,
        "wc": int(so(tt.get("Nhà tắm")) or 0) or None, "phap_ly": tt.get("Pháp lý"), "ngay_dang": tt.get("Ngày đăng"),
        "so_tang": int(tang.group(1)) if tang and loai in ("nha_pho", "biet_thu") else None,
        "hem_rong": float(hem.group(1).replace(",", ".")) if hem and vao and vao.startswith("hem") else None,
        "lat": lat, "lng": lng, "mo_ta": mo_ta[:2000],
    }


def main() -> None:
    ra_dir = sys.argv[1]
    tong = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    os.makedirs(ra_dir, exist_ok=True)
    tep = os.path.join(ra_dir, "mogi.jsonl")
    da = {}
    if os.path.exists(tep):
        for d in open(tep, encoding="utf-8"):
            j = json.loads(d)
            da[j["mogi_id"]] = j
    he_so = tong / sum(k[4] for k in KE_HOACH)
    with open(tep, "a", encoding="utf-8") as f:
        for duong_dan, deal, loai, loi_vao, can in KE_HOACH:
            can = max(1, round(can * he_so))
            co = sum(1 for j in da.values() if j.get("danh_muc") == duong_dan)
            trang_so = 1
            print(f"== {duong_dan}: cần {can}, đã có {co}", flush=True)
            while co < can and trang_so <= 60:
                ds = lay(f"https://mogi.vn/{duong_dan}" + (f"?cp={trang_so}" if trang_so > 1 else ""))
                links = list(dict.fromkeys(re.findall(r'class="link-overlay" href="(https://mogi\.vn/[^"]+-id\d+)"', ds)))
                if not links:
                    break
                for u in links:
                    if co >= can:
                        break
                    mid = re.search(r"-id(\d+)$", u).group(1)
                    if mid in da:
                        continue
                    t = doc_tin(u, lay(u), deal, loai, loi_vao)
                    if t is None:
                        continue
                    t["danh_muc"] = duong_dan
                    da[mid] = t
                    f.write(json.dumps(t, ensure_ascii=False) + "\n")
                    f.flush()
                    co += 1
                print(f"   trang {trang_so}: {co}/{can}", flush=True)
                trang_so += 1
    print(f"xong: {len(da)} tin trong {tep}", flush=True)


if __name__ == "__main__":
    main()
