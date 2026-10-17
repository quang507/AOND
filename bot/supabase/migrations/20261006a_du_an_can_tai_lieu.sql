-- 20261006a — Kho CĂN DỰ ÁN + tài liệu dự án (SRS-5.1zzj, 06/10/2026 — theo demo AOND projects.py / inventory.py).
--
-- Người bán gửi bảng giá / bản phân lô / brochure (ảnh, PDF, link) → model đọc ra từng căn theo mã lô
-- → ghi vào đây, CHUNG cho mọi người bán rao trong dự án đó (demo: "kiến thức chung của dự án, dùng lại
-- cho seller sau"). Khác `listings`: đây là DỮ KIỆN dự án (căn tồn tại, mẫu nhà, giá niêm yết), không
-- phải tin rao của ai. Tin rao "căn A5" của người bán sẽ tự điền diện tích / mẫu nhà từ đây.
--
-- Tài liệu gốc cất bucket `listing-private` (đường `du-an/<project_id>/…`), không bao giờ phát ra ngoài:
-- brochure có thể in SĐT môi giới, bảng giá có thể có tên khách.

create table if not exists public.du_an_tai_lieu (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  seller_id uuid references public.sellers(id) on delete set null,
  bucket text not null,
  storage_path text not null,
  ten_tep text,
  mime text,
  loai text not null default 'khac' check (loai in ('bang_gia', 'phan_lo', 'brochure', 'mat_bang', 'khac')),
  so_can_doc integer not null default 0 check (so_can_doc >= 0 and so_can_doc <= 10000),
  tom_tat text,
  noi_dung jsonb,
  created_at timestamptz not null default now()
);
comment on table public.du_an_tai_lieu is
  '[RỔ HÀNG] Tài liệu dự án người bán gửi qua chat (bảng giá, phân lô, brochure, mặt bằng) — file nằm ở bucket riêng tư, dòng này chỉ là tham chiếu + model đọc được bao nhiêu căn. SRS-5.1zzj.';
comment on column public.du_an_tai_lieu.loai is 'bang_gia · phan_lo · brochure · mat_bang · khac — model phân loại.';
comment on column public.du_an_tai_lieu.noi_dung is 'Kết quả model đọc (mẫu nhà, căn) giữ lại khi CHƯA biết dự án nào — người bán nói tên dự án ở lượt sau thì gắn và ghi du_an_can từ đây.';
comment on column public.du_an_tai_lieu.so_can_doc is 'Số căn model đọc ra từ tài liệu này (đã ghi vào du_an_can).';
create index if not exists du_an_tai_lieu_project_idx on public.du_an_tai_lieu (project_id);

create table if not exists public.du_an_can (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  ma_can text not null,
  mau_nha text,
  dien_tich_m2 numeric,
  dien_tich_dat_m2 numeric,
  gia_raw text,
  price_vnd bigint,
  huong text,
  tang integer,
  thuoc_tinh jsonb not null default '{}'::jsonb,
  nguon text not null default 'tai_lieu' check (nguon in ('tai_lieu', 'nguoi_ban', 'admin')),
  tai_lieu_id uuid references public.du_an_tai_lieu(id) on delete set null,
  seller_id uuid references public.sellers(id) on delete set null,
  trang_thai text not null default 'cho_duyet' check (trang_thai in ('cho_duyet', 'da_duyet', 'loai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ma_can)
);
comment on table public.du_an_can is
  '[RỔ HÀNG] Kho CĂN DỰ ÁN — từng căn / lô của một dự án theo mã (A5, LK-12), đọc từ bảng giá / phân lô người bán gửi hoặc admin nhập. Dữ kiện chung của dự án, KHÔNG phải tin rao: giá là giá niêm yết, không tự thành giá rao. Tin rao "căn A5" tự điền diện tích / mẫu nhà từ đây. SRS-5.1zzj.';
comment on column public.du_an_can.ma_can is 'Mã căn / mã lô chép nguyên như tài liệu in. Duy nhất trong một dự án.';
comment on column public.du_an_can.mau_nha is 'Mẫu nhà / loại căn (Cosmo Gen 2, 2PN, Shophouse) — thông số chung ở projects.unit_types.';
comment on column public.du_an_can.gia_raw is 'Giá niêm yết chép nguyên chữ; price_vnd do trigger parse_vnd đọc ra (cùng bảng ca với TS).';
comment on column public.du_an_can.thuoc_tinh is 'Thuộc tính tự do đọc từ tài liệu: {"ghi_chu":"lô góc","view":"hồ"}.';
comment on column public.du_an_can.nguon is 'tai_lieu (model đọc tài liệu) · nguoi_ban (chủ nhà nói) · admin.';
comment on column public.du_an_can.trang_thai is 'cho_duyet mặc định — bot vẫn dùng để nhắc, nói rõ "theo bảng giá anh/chị gửi"; admin duyệt thành da_duyet hoặc loai.';
create index if not exists du_an_can_project_idx on public.du_an_can (project_id);

-- Giá niêm yết → số, cùng luật tiền với mọi chỗ khác (parse_vnd ↔ luat-tien.ts, bảng ca tien.json).
create or replace function public.du_an_can_doc_gia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.gia_raw is distinct from coalesce(old.gia_raw, '') or new.price_vnd is null then
    new.price_vnd := case when new.gia_raw is null then null else public.parse_vnd(new.gia_raw) end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_du_an_can_doc_gia on public.du_an_can;
create trigger trg_du_an_can_doc_gia
  before insert or update on public.du_an_can
  for each row execute function public.du_an_can_doc_gia();

-- Quyền: bot (service_role) ghi; admin đọc qua web; anon và người đăng nhập thường không thấy
-- (bảng có thể mang giá niêm yết chưa công bố và ghi chú nội bộ của môi giới).
alter table public.du_an_tai_lieu enable row level security;
alter table public.du_an_can enable row level security;
revoke all on public.du_an_tai_lieu from anon, authenticated;
revoke all on public.du_an_can from anon, authenticated;
grant select on public.du_an_tai_lieu to authenticated;
grant select on public.du_an_can to authenticated;
drop policy if exists du_an_tai_lieu_admin_read on public.du_an_tai_lieu;
create policy du_an_tai_lieu_admin_read on public.du_an_tai_lieu for select to authenticated using (public.la_admin());
drop policy if exists du_an_can_admin_read on public.du_an_can;
create policy du_an_can_admin_read on public.du_an_can for select to authenticated using (public.la_admin());

-- Kho căn của một dự án cho bot đọc gọn (mã · mẫu · m² · giá · tầng · ghi chú), tối đa 60 căn, mã xếp tự nhiên.
create or replace function public.can_du_an(p_project_id uuid, p_gioi_han integer default 60)
returns table (ma_can text, mau_nha text, dien_tich_m2 numeric, dien_tich_dat_m2 numeric, gia_raw text, huong text, tang integer, thuoc_tinh jsonb, trang_thai text)
language sql
stable
set search_path = public
as $$
  select c.ma_can, c.mau_nha, c.dien_tich_m2, c.dien_tich_dat_m2, c.gia_raw, c.huong, c.tang, c.thuoc_tinh, c.trang_thai
    from public.du_an_can c
   where c.project_id = p_project_id and c.trang_thai <> 'loai'
   order by length(c.ma_can), c.ma_can
   limit greatest(1, least(coalesce(p_gioi_han, 60), 200));
$$;
revoke execute on function public.can_du_an(uuid, integer) from public, anon, authenticated;
grant execute on function public.can_du_an(uuid, integer) to service_role;
comment on function public.can_du_an(uuid, integer) is 'Bot đọc kho căn dự án cho khối CĂN TRONG DỰ ÁN (SRS-5.1zzj). service_role.';
