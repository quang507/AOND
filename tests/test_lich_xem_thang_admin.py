"""SRS-5.1zzzzzzz165 (chủ dự án 23/10/2026: "bỏ qua bước ctv luôn để đưa thông tin cho admin luôn"): lịch xem đi THẲNG admin. Trigger nằm trong DB nên
test này chỉ soi chữ của migration `20261023g` (bản chạy thật kiểm bằng giao dịch hoàn tác trên DB, ghi ở SRS-165). Đỏ khi migration lại tra CTV của
hội thoại, giao câu xác nhận lịch cho CTV, hoặc đặt hạn leo thang CTV."""
from pathlib import Path

SQL = (Path(__file__).resolve().parent.parent / "bot/supabase/migrations/20261023g_lich_xem_thang_admin_bo_ctv.sql").read_text(encoding="utf-8")
KHONG_COMMENT = "\n".join(d for d in SQL.splitlines() if not d.strip().startswith("--"))


def test_lich_xem_khong_con_tra_ctv_cua_hoi_thoai():
    assert "v_ctv := null" in KHONG_COMMENT
    assert "from conversations" not in KHONG_COMMENT and "from ctvs" not in KHONG_COMMENT


def test_cau_xac_nhan_lich_giao_admin_khong_han_sla_ctv():
    assert "'xac_nhan_lich', 'pending', 'buyer_ask', 'admin', null, null" in KHONG_COMMENT
    assert "ctv_sla_phut" not in KHONG_COMMENT and "'ctv'" not in KHONG_COMMENT


def test_van_nhac_escalation_va_email_admin():
    assert "insert into reminders (kind, buyer_id, listing_id, viewing_id, ctv_id, due_at, note)" in KHONG_COMMENT
    assert "email_admin('VIEWING'" in KHONG_COMMENT
