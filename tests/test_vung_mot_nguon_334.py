"""SRS-5.1zzzzzzz334 (02/11/2026): trang /du-an gõ tay 5 tỉnh làm tab, thiếu Bà Rịa – Vũng Tàu — 7 dự án tỉnh đó chỉ thấy ở "Tất cả".
Vùng nhận tin một nguồn: lõi `prompts.VUNG_NHAN_TIN`, web giữ bản sao `lib/vung.ts`; bài này chặn hai bên lệch nhau và chặn trang /du-an
gõ tay tên tỉnh trở lại. Cột `tinh` phải đúng chữ bộ nạp dự án ghi vào `projects.province` (lọc `.eq("province", …)`)."""
import pathlib
import re

from aioi import prompts
from aioi.chu import bo_dau

GOC = pathlib.Path(__file__).resolve().parents[1]


def _vung_ts() -> list[tuple[str, str]]:
    ts = (GOC / "lib" / "vung.ts").read_text(encoding="utf-8")
    return re.findall(r'\{\s*tinh:\s*"([^"]+)",\s*nhan:\s*"([^"]+)"\s*\}', ts)


def _khoa(s: str) -> str:
    """So tên tỉnh bỏ dấu, bỏ "TP." / gạch nối / gạch ngang dài — "TP. Hồ Chí Minh" ~ "TP.HCM" không so được bằng chữ, nên đổi HCM."""
    k = re.sub(r"[^a-z]+", " ", bo_dau(s).lower()).replace("tp ", "").strip()
    return {"hcm": "ho chi minh"}.get(k, k)


def test_web_cung_danh_sach_vung_voi_loi():
    loi = sorted(_khoa(x) for x in prompts.VUNG_NHAN_TIN.split(","))
    web = sorted(_khoa(nhan) for _, nhan in _vung_ts())
    assert web == loi, f"lib/vung.ts lệch prompts.VUNG_NHAN_TIN: web {web} / lõi {loi}"
    assert all(prompts.trong_vung_nhan_tin(tinh) for tinh, _ in _vung_ts())


def test_tinh_dung_chu_bo_nap_du_an_ghi():
    nap = (GOC / "scripts" / "archive" / "thu-du-an-rever.mjs").read_text(encoding="utf-8")
    ghi = set(re.findall(r'\["[a-z ]+",\s*"([^"]+)"\]', nap))
    assert ghi, "không đọc được bảng tỉnh của thu-du-an-rever.mjs"
    thieu = [tinh for tinh, _ in _vung_ts() if tinh not in ghi]
    assert not thieu, f"lib/vung.ts có tỉnh bộ nạp không ghi đúng chữ đó vào projects.province: {thieu}"


def test_trang_du_an_khong_go_tay_ten_tinh():
    trang = (GOC / "app" / "du-an" / "page.tsx").read_text(encoding="utf-8")
    assert "VUNG_NHAN_TIN" in trang and "TEN_VUNG" in trang
    go_tay = [t for t, _ in _vung_ts() if f'"{t}"' in trang or f"'{t}'" in trang]
    assert not go_tay, f"app/du-an/page.tsx gõ tay tên tỉnh — dùng lib/vung.ts: {go_tay}"
