-- 20261019a — kho kiến thức dự án của lõi Python lên Supabase (docs/07 SRS-5.1zzzzzzz56; chủ dự án 19/10/2026: "xóa mấy cái
-- thừa"). Trước đó kiến thức bot học được về dự án (tài liệu .md đã che thông tin cá nhân, mẫu nhà, rổ căn theo mã lô, phiếu bầu
-- khi người rao nói khác nhau) nằm trong SQLite trên VPS: hai nguồn với bảng projects, không ai ngoài VPS thấy, VPS hỏng là mất.
-- Lõi Python lần đầu khởi động chép từ SQLite sang (SupabaseProjectStore.chep_tu). Chỉ service_role đọc ghi.
create table if not exists public.du_an_kien_thuc (
  khoa text primary key,
  ten text not null,
  du_lieu jsonb not null default '{}'::jsonb,
  cap_nhat timestamptz not null default now()
);

comment on table public.du_an_kien_thuc is '[BOT & HÀNG ĐỢI] Kiến thức dự án lõi Python học từ chat / tài liệu (mẫu nhà, rổ căn, tài liệu .md đã che thông tin cá nhân, phiếu bầu). Chỉ service_role. Khác bảng projects (kho dự án công khai cho web).';
comment on column public.du_an_kien_thuc.khoa is 'Tên dự án chuẩn hoá (projects.normalize_project_name) — khoá tìm gần đúng';
comment on column public.du_an_kien_thuc.du_lieu is 'Project của lõi Python dạng JSON (projects.project_to_dict)';

alter table public.du_an_kien_thuc enable row level security;
revoke all on public.du_an_kien_thuc from anon, authenticated;
grant select, insert, update, delete on public.du_an_kien_thuc to service_role;
