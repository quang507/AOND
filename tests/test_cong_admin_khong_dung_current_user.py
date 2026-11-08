"""SRS-5.1zzzzzzz398 (audit N1, 08/11/2026): hàm SECURITY DEFINER không được dùng `current_user` để gác quyền.

Trong hàm SECURITY DEFINER, `current_user` là CHỦ HÀM (postgres) chứ không phải người gọi, nên vế
`current_user in ('postgres', …)` luôn đúng → mọi tài khoản `authenticated` gọi được hàm admin (kể cả xoá hết dữ liệu).
Gác quyền bằng `la_admin()` / `auth.role() = 'service_role'`; cần cho phiên quản trị (pg_cron, mgmt-api) thì `session_user`.
Đọc `bot/supabase/schema.sql` (sinh từ DB thật bằng `xuat_schema()`), nên bài này đỏ khi DB còn hàm như vậy.
"""
import re
from pathlib import Path

SCHEMA = Path(__file__).resolve().parents[1] / "bot/supabase/schema.sql"
# Mỗi hàm `xuat_schema()` in ra kết thúc bằng `$function$` rồi dòng `;` — kể cả thân viết một dòng (`AS $function$ select … $function$`).
_HAM = re.compile(r"CREATE OR REPLACE FUNCTION (public\.\w+)\(.*?\$function\$\n;\n", re.S)


def _ham_definer() -> dict[str, str]:
    s = SCHEMA.read_text(encoding="utf-8")
    return {m.group(1): m.group(0) for m in _HAM.finditer(s) if "SECURITY DEFINER" in m.group(0)}


def test_co_doc_duoc_ham_definer():
    ham = _ham_definer()
    assert len(ham) > 30, "không tách được hàm SECURITY DEFINER khỏi schema.sql — sửa regex"
    assert "public.admin_xoa_het_khach_va_ro_hang" in ham


def test_ham_definer_khong_gac_quyen_bang_current_user():
    lot = sorted(ten for ten, than in _ham_definer().items() if re.search(r"\bcurrent_user\b", than))
    assert not lot, f"hàm SECURITY DEFINER dùng current_user (luôn là chủ hàm): {lot}"
