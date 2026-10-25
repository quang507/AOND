#!/usr/bin/env python3
"""Sinh migration nạp bảng `kien_thuc_phap_ly` từ `src/aioi/phap_ly.MAC_DINH` (SRS-5.1zzzzzzz176). Chạy:
    python scripts/sinh-migration-phap-ly.py <ten_migration>   # vd 20261025e_kien_thuc_phap_ly
Dòng chưa ai sửa (tra_loi = mac_dinh) chuyển sang câu mới; dòng admin đã sửa tay giữ nguyên (cùng cách migration cau_mau)."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from aioi import phap_ly  # noqa: E402


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> None:
    ten = sys.argv[1] if len(sys.argv) > 1 else "20261025e_kien_thuc_phap_ly"
    dong = []
    for i, (khoa, (tieu_de, tra_loi, nguon, nhom)) in enumerate(phap_ly.MAC_DINH.items(), start=1):
        dong.append(f"  ({q(khoa)}, {q(tieu_de)}, {q(tra_loi)}, {q(tra_loi)}, {q(nguon)}, {q(nhom)}, {q(phap_ly.CAP_NHAT)}, "
                    f"{q(phap_ly.KIEM_DUYET)}, {i})")
    sql = f"""-- {ten} — Kho kiến thức pháp lý / thủ tục nhà đất bot được phép trả lời (SRS-5.1zzzzzzz176, 25/10/2026; chủ dự án: "Nạp sẵn đi
-- nạp vào luôn, tôi ko biết duyệt"). SINH TỰ ĐỘNG bởi scripts/sinh-migration-phap-ly.py từ src/aioi/phap_ly.MAC_DINH — đừng sửa tay nội dung ở
-- đây; sửa ở phap_ly.py rồi sinh lại, hoặc admin sửa cột tra_loi trên DB (lõi đọc đè, nhớ 60 giây). Dòng chưa ai sửa (tra_loi = mac_dinh)
-- chuyển sang câu mới; dòng đã sửa tay giữ nguyên. Nội dung do AI soạn theo luật, CHƯA người có chuyên môn duyệt (kiem_duyet = 'chua').
create table if not exists public.kien_thuc_phap_ly (
  khoa text primary key,
  tieu_de text not null,
  tra_loi text not null,
  mac_dinh text not null,
  nguon text,
  nhom text,
  cap_nhat date not null default current_date,
  kiem_duyet text not null default 'chua',
  thu_tu integer not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.kien_thuc_phap_ly is '[BOT & HÀNG ĐỢI] Kho kiến thức pháp lý / thủ tục nhà đất bot được phép trả lời (SRS-5.1zzzzzzz176). AI chọn khoá theo nghĩa câu khách, lõi đọc tra_loi (đè câu mặc định trong src/aioi/phap_ly.py, nhớ 60 giây) và luôn nói "tham khảo". Khoá cố định trong code; admin chỉ sửa tra_loi / cap_nhat / kiem_duyet. Chỉ admin.';
comment on column public.kien_thuc_phap_ly.tra_loi is 'Câu bot dùng (admin sửa được). Bằng mac_dinh nghĩa là chưa ai sửa.';
comment on column public.kien_thuc_phap_ly.mac_dinh is 'Câu mặc định từ code — để biết dòng đã sửa tay hay chưa.';
comment on column public.kien_thuc_phap_ly.cap_nhat is 'Ngày nội dung được soạn / kiểm — bot nói "theo bản em có cập nhật tháng X".';
comment on column public.kien_thuc_phap_ly.kiem_duyet is 'chua = AI soạn, chưa người có chuyên môn duyệt; ghi tên người duyệt + ngày khi đã duyệt.';
alter table public.kien_thuc_phap_ly enable row level security;
revoke all on public.kien_thuc_phap_ly from anon, authenticated;
grant select, update on public.kien_thuc_phap_ly to authenticated;
drop policy if exists kien_thuc_phap_ly_admin_doc on public.kien_thuc_phap_ly;
create policy kien_thuc_phap_ly_admin_doc on public.kien_thuc_phap_ly for select to authenticated using (public.la_admin());
drop policy if exists kien_thuc_phap_ly_admin_sua on public.kien_thuc_phap_ly;
create policy kien_thuc_phap_ly_admin_sua on public.kien_thuc_phap_ly for update to authenticated using (public.la_admin()) with check (public.la_admin());

insert into public.kien_thuc_phap_ly (khoa, tieu_de, tra_loi, mac_dinh, nguon, nhom, cap_nhat, kiem_duyet, thu_tu) values
{",\n".join(dong)}
on conflict (khoa) do update set
  tra_loi = case when public.kien_thuc_phap_ly.tra_loi = public.kien_thuc_phap_ly.mac_dinh then excluded.tra_loi else public.kien_thuc_phap_ly.tra_loi end,
  mac_dinh = excluded.mac_dinh, tieu_de = excluded.tieu_de, nguon = excluded.nguon, nhom = excluded.nhom, thu_tu = excluded.thu_tu,
  cap_nhat = case when public.kien_thuc_phap_ly.tra_loi = public.kien_thuc_phap_ly.mac_dinh then excluded.cap_nhat else public.kien_thuc_phap_ly.cap_nhat end,
  updated_at = now();
"""
    out = pathlib.Path(__file__).resolve().parents[1] / "bot/supabase/migrations" / f"{ten}.sql"
    out.write_text(sql, encoding="utf-8")
    print(f"đã ghi {out} ({len(dong)} dòng)")


if __name__ == "__main__":
    main()
