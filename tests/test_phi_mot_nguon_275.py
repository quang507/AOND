"""SRS-5.1zzzzzzz275 (chủ dự án 29/10: "vẫn giữ 1 thư viện tư liệu duy nhất SSOT để các bên nối vào rồi đúng ko"): mức phí "1% / 0.5% / 0.75
tháng" từng viết tay ở 4 chỗ (BUSINESS_CONTEXT, _fee_hint, khối hỏi phí trong engine, muc_phi) cạnh số tính tiền `revenue.SALE_FEE_RATE`. Nay
câu chữ dựng từ số ở `revenue`; bài này chặn viết tay trở lại."""
import ast
import pathlib
import re

from aioi import prompts
from aioi.revenue import RENTAL_FEE_MONTHS, SALE_FEE_RATE, SellerRole

GOC = pathlib.Path(__file__).resolve().parents[1] / "src" / "aioi"


def test_chu_phi_dung_so_tinh_tien():
    assert prompts.muc_phi(SellerRole.CHU_NHA, False) == f"{SALE_FEE_RATE[SellerRole.CHU_NHA] * 100:g}% giá chốt"
    assert prompts.muc_phi(SellerRole.MOI_GIOI, False) == f"{SALE_FEE_RATE[SellerRole.MOI_GIOI] * 100:g}% giá chốt"
    assert prompts.muc_phi(SellerRole.CHU_NHA, True) == f"{RENTAL_FEE_MONTHS:g} tháng tiền thuê"
    assert prompts.PT_CHU in prompts.BUSINESS_CONTEXT and prompts.PT_MG in prompts.BUSINESS_CONTEXT


def _chuoi_trong_code(duong: pathlib.Path) -> list[tuple[int, str]]:
    """Mọi chuỗi trong code (kể cả phần chữ của f-string), bỏ docstring — docstring / chú thích được kể lại lỗi cũ."""
    cay = ast.parse(duong.read_text(encoding="utf-8"))
    doc = set()
    for nut in ast.walk(cay):
        if isinstance(nut, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and nut.body:
            dau = nut.body[0]
            if isinstance(dau, ast.Expr) and isinstance(dau.value, ast.Constant) and isinstance(dau.value.value, str):
                doc.add(id(dau.value))
    return [(n.lineno, n.value) for n in ast.walk(cay)
            if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in doc]


def test_khong_viet_tay_muc_phi_trong_prompt_va_engine():
    mau = re.compile(r"\b(?:1|0[.,]5)\s?% (?:giá chốt|chính chủ|môi giới)|0[.,]75 tháng tiền thuê")
    for ten in ("prompts.py", "engine.py"):   # cau_mau: câu `bao_phi` dùng chỗ trống {phi} do code điền từ muc_phi
        for dong, chuoi in _chuoi_trong_code(GOC / ten):
            assert not mau.search(chuoi), f"{ten}:{dong} viết tay mức phí — dùng PT_CHU / PT_MG / PHI_THUE: {chuoi.strip()[:120]}"


def test_web_cung_muc_phi_voi_loi():
    """lib/phi.ts (bản sao phía web, web không đọc được Python) phải khớp số gốc ở revenue.py."""
    ts = (GOC.parents[1] / "lib" / "phi.ts").read_text(encoding="utf-8")
    gia_tri = dict(re.findall(r'export const (\w+) = "([^"]+)";', ts))
    assert gia_tri == {"PT_CHU": prompts.PT_CHU, "PT_MG": prompts.PT_MG, "PHI_THUE": prompts.PHI_THUE}


def test_web_khong_viet_tay_muc_phi():
    goc_web = GOC.parents[1]
    mau = re.compile(r"(?:chính chủ|môi giới|phí)[^\n]{0,12}\b(?:1|0[.,]5)\s?%")
    for thu_muc in ("app", "components"):
        for f in (goc_web / thu_muc).rglob("*.tsx"):
            for i, dong in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                assert not mau.search(dong), f"{f.relative_to(goc_web)}:{i} viết tay mức phí — dùng lib/phi.ts: {dong.strip()[:120]}"
