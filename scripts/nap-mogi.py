"""Nạp dataset thử Mogi (scripts/lay-mogi.py) vào `listings` + `listing_noi_bo` qua hàm DB `nap_tin_mogi(jsonb)` (chỉ service_role gọi được).

Chạy:  python scripts/nap-mogi.py <mogi.jsonl> <tệp .env có SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY> [so_tin_moi_me=20]
       (trên máy 146: .env của lõi — C:/aond/aond_core/.env; script không in khoá)

- Người bán: MỘT người bán thử `thu-mogi` ("Dữ liệu thử Mogi") — xoá cả bộ: xoá listings có source = 'mogi_thu' rồi người bán này.
- Phường: `phuong_tai_diem(lat, lng)` theo ranh giới 168 phường TP.HCM mới; ngoài ranh giới → bỏ (ngoài phạm vi AOND). Toạ độ Mogi là ghim
  gần đúng (nhiều tin chung một điểm) → `toa_do_muc = 'phuong'`.
- Lời mô tả công khai SINH từ ô đã bóc (không chép lời người đăng Mogi); tiêu đề + mô tả gốc + link nằm ở `listing_noi_bo.du_lieu` (nội bộ).
- Chạy lại không nhân đôi: `legacy_code = 'mogi:<mã>'` đã có thì bỏ.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

PHAP_LY = {"sổ hồng": "so_hong", "sổ đỏ": "so_hong", "hợp đồng mua bán": "hdmb", "giấy tay": "giay_tay", "vi bằng": "giay_tay"}
TEN = {"nha_pho": "nhà phố", "chung_cu": "căn hộ", "dat": "đất", "biet_thu": "biệt thự", "phong_tro": "phòng trọ", "mat_bang": "mặt bằng"}
VAO = {"mat_tien": "mặt tiền", "hem": "trong hẻm", "hem_xe_hoi": "hẻm xe hơi"}


def vnd(gia: str) -> int | None:
    s = gia.lower().replace(",", ".")
    tong, co = 0.0, False
    for so_, dv in re.findall(r"(\d+(?:\.\d+)?)\s*(tỷ|triệu|nghìn|ngàn)", s):
        tong += float(so_) * {"tỷ": 1e9, "triệu": 1e6, "nghìn": 1e3, "ngàn": 1e3}[dv]
        co = True
    return int(round(tong)) if co else None


def gia_chu(v: int, thue: bool) -> str:
    if thue:
        tr = v / 1e6
        return (f"{tr:.1f}".rstrip("0").rstrip(".") if tr < 10 else f"{round(tr)}").replace(".", ",") + " triệu/tháng"
    if v >= 1e9:
        return f"{v / 1e9:.2f}".rstrip("0").rstrip(".").replace(".", ",") + " tỷ"
    return f"{round(v / 1e6)} triệu"


SDT = re.compile(r"(?:\+?84|0)(?:[\s.\-]?\d){8,10}")   # số điện thoại người đăng — không giữ, kể cả ở bảng nội bộ


def so_tang(j: dict) -> int | None:
    """"4 tầng" → 4; "1 trệt 2 lầu" → 3 (trệt + lầu). Chỉ nhà phố / biệt thự."""
    if j["loai"] not in ("nha_pho", "biet_thu"):
        return None
    goc = f"{j['tieu_de']}. {j.get('mo_ta') or ''}"
    m = re.search(r"(\d)\s*tầng\b", goc, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d)\s*lầu\b", goc, re.I)
    return int(m.group(1)) + 1 if m else None


def dong(j: dict) -> str | None:
    v = vnd(j["gia"])
    thue = j["deal"] == "cho_thue"
    if not v or (not thue and v < 1e8) or (thue and v > 5e9):
        return None
    gia = gia_chu(v, thue)
    pl = next((m for k, m in PHAP_LY.items() if k in (j.get("phap_ly") or "").lower()), None)
    ten = TEN[j["loai"]] + (f" {VAO[j['loi_vao']]}" if j.get("loi_vao") in VAO and j["loai"] == "nha_pho" else "")
    duong = j.get("duong") or ""
    o_duong = (f" {duong}" if re.match(r"(đường|quốc lộ|tỉnh lộ|đt|ql)\b", duong, re.I) else f" đường {duong}") if duong else ""
    phan = [f"{'Cho thuê' if thue else 'Bán'} {ten}{o_duong}", f"{j['dien_tich']:g} m²".replace(".", ",")]
    tang = so_tang(j)
    if tang:
        phan.append(f"{tang} tầng")
    phong = j.get("phong_ngu") if 1 <= (j.get("phong_ngu") or 0) <= 60 else None   # ngoài 1–60 (toà khách sạn "100 phòng") → bỏ, ràng buộc listings_bedrooms_check
    if phong:
        phan.append(f"{phong} phòng ngủ")
    if j.get("hem_rong"):
        phan.append(f"hẻm rộng {j['hem_rong']:g} m".replace(".", ","))
    if pl:
        phan.append("có sổ" if pl == "so_hong" else "hợp đồng mua bán" if pl == "hdmb" else "giấy tay")
    phan.append(f"giá {gia}")
    mo_ta = ", ".join(phan) + "."
    tin_goc = SDT.sub("[số đt]", f"{j['tieu_de']}\n{j.get('mo_ta') or ''}")[:2500]
    quan = re.sub(r"^thành phố\s+", "Thành phố ", j.get("quan") or "", flags=re.I).strip() or None
    if quan:
        quan = " ".join(w[:1].upper() + w[1:] for w in quan.split())
    khoa = ("legacy", "deal", "ptype", "district", "street", "area", "price_raw", "descr", "beds", "baths", "floors", "access", "alley", "legal",
            "lat", "lng", "tin_goc", "url", "dia_chi_goc")
    return dict(zip(khoa, ("mogi:" + j["mogi_id"], j["deal"], j["loai"], quan, j.get("duong"), float(j["dien_tich"]), gia, mo_ta,
                           phong, j.get("wc") if (j.get("wc") or 0) <= 60 else None, tang, j.get("loi_vao"), j.get("hem_rong"), pl, j["lat"], j["lng"], tin_goc,
                           j["url"], j.get("dia_chi"))))


def doc_env(tep: str) -> dict[str, str]:
    ra = {}
    for d in open(tep, encoding="utf-8"):
        if "=" in d and not d.lstrip().startswith("#"):
            k, v = d.split("=", 1)
            ra[k.strip()] = v.strip().strip('"').strip("'")
    return ra


def main() -> None:
    src, env_tep = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 20   # mẻ nhỏ: vai authenticator có statement_timeout 8 giây
    env = doc_env(env_tep)
    url, khoa = env["SUPABASE_URL"].rstrip("/"), env["SUPABASE_SERVICE_ROLE_KEY"]
    rows = [r for r in (dong(json.loads(d)) for d in open(src, encoding="utf-8")) if r]
    tong = 0
    for i in range(0, len(rows), n):
        req = urllib.request.Request(f"{url}/rest/v1/rpc/nap_tin_mogi", data=json.dumps({"ds": rows[i:i + n]}).encode(), method="POST",
                                     headers={"apikey": khoa, "Authorization": f"Bearer {khoa}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                moi = int(r.read().decode() or 0)
        except urllib.error.HTTPError as e:   # in lỗi DB (không có khoá trong đó), mẻ sau vẫn chạy
            print(f"mẻ {i // n}: lỗi {e.code} {e.read().decode(errors='ignore')[:400]}", flush=True)
            continue
        tong += moi
        print(f"mẻ {i // n}: gửi {len(rows[i:i + n])}, nạp mới {moi}", flush=True)
    print(f"xong: {len(rows)} tin hợp lệ, nạp mới {tong} (tin ngoài 168 phường / đã có thì bỏ)")


if __name__ == "__main__":
    main()
