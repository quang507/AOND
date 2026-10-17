-- 20260910f — LƯỢM THÔNG TIN DỰ ÁN TỪ CHAT, CÓ CỬA DUYỆT (FR-195).
--
-- Chủ dự án 10/09/2026: "thông tin của dự án nó có lượm lặt thêm trong khi chat
-- với khách hàng được ko, lưu ở đâu" → "làm đi".
--
-- VÌ SAO KHÔNG GHI THẲNG VÀO `projects`. Bảng đó là thứ bot đọc để nói chuyện
-- với MỌI khách. Một chủ nhà nhớ nhầm phí quản lý, một môi giới nói quá về tiện
-- ích, ghi thẳng vào là cả kho sai theo và không ai biết sai từ đâu. Nên lời
-- người ta nói vào `project_facts` ở trạng thái `cho_duyet`, admin gật thì mới
-- nhập vào `projects`. Mỗi dòng giữ đủ dấu vết: ai nói, ở tin nào, hội thoại nào.
--
-- KHÔNG có trigger tự nhập. Nhập là việc của `duyet_fact_du_an()`, gọi bằng tay
-- từ /admin — đúng luật "hành động không đảo được thì phải có người bấm".

create table if not exists public.project_facts (
  id           bigserial primary key,
  project_id   uuid not null references public.projects(id) on delete cascade,
  khoa         text not null,
  gia_tri      text not null,
  nguon        text not null default 'seller_chat'
                 check (nguon in ('seller_chat', 'buyer_chat', 'ctv', 'admin', 'crawl', 'llm')),
  listing_id   uuid references public.listings(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  trang_thai   text not null default 'cho_duyet'
                 check (trang_thai in ('cho_duyet', 'da_duyet', 'bo')),
  duyet_at     timestamptz,
  duyet_boi    text,
  created_at   timestamptz not null default now()
);

comment on table public.project_facts is
  '[RỔ HÀNG] FR-195: thông tin DỰ ÁN lượm được trong lúc chat (tiện ích, phí quản lý, '
  'bàn giao…). Vào đây ở trạng thái cho_duyet; admin gật thì duyet_fact_du_an() mới '
  'nhập vào projects. Không ghi thẳng: một người nói nhầm là cả kho sai theo.';
comment on column public.project_facts.khoa is 'Khoá fact — cùng bộ khoá với listing_facts.';
comment on column public.project_facts.nguon is 'Ai nói: chủ nhà, người mua, CTV, admin, trang nguồn, hay model.';
comment on column public.project_facts.trang_thai is 'cho_duyet → da_duyet (đã nhập vào projects) hoặc bo (không dùng).';

create index if not exists project_facts_cho_duyet_idx
  on public.project_facts (trang_thai, created_at desc);
create unique index if not exists project_facts_khong_trung_idx
  on public.project_facts (project_id, khoa, gia_tri)
  where trang_thai <> 'bo';

alter table public.project_facts enable row level security;
revoke all on public.project_facts from anon, authenticated;
grant select on public.project_facts to authenticated;
drop policy if exists project_facts_admin_read on public.project_facts;
create policy project_facts_admin_read on public.project_facts
  for select to authenticated
  using (public.la_admin());

-- Ghi một điều nghe được về dự án. Trùng khoá+giá trị thì thôi, không đẻ dòng mới.
create or replace function public.ghi_fact_du_an(
  p_project_id uuid,
  p_khoa       text,
  p_gia_tri    text,
  p_nguon      text default 'seller_chat',
  p_listing_id uuid default null,
  p_conversation_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id bigint;
begin
  if p_project_id is null or coalesce(btrim(p_gia_tri), '') = '' then return null; end if;
  insert into project_facts (project_id, khoa, gia_tri, nguon, listing_id, conversation_id)
  values (p_project_id, p_khoa, btrim(p_gia_tri), coalesce(p_nguon, 'seller_chat'), p_listing_id, p_conversation_id)
  on conflict do nothing
  returning id into v_id;
  return v_id;
exception when others then
  -- Đây là việc phụ. Hỏng thì thôi, tuyệt đối không làm hỏng lượt trả lời khách.
  return null;
end $$;

comment on function public.ghi_fact_du_an(uuid, text, text, text, uuid, uuid) is
  'FR-195: ghi một điều nghe được về dự án vào project_facts (cho_duyet). Nuốt lỗi — '
  'đây là việc phụ, không được làm hỏng lượt trả lời khách.';

-- Admin gật: nhập vào `projects` rồi đóng dấu. Tiện ích thì NỐI vào mảng (không
-- trùng); các khoá khác vào `specs` theo đúng tên khoá. `bo` thì chỉ đóng dấu.
create or replace function public.duyet_fact_du_an(p_id bigint, p_ok boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare f project_facts%rowtype;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;
  select * into f from project_facts where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'vi', 'khong thay dong'); end if;
  if f.trang_thai <> 'cho_duyet' then
    return jsonb_build_object('ok', false, 'vi', 'dong nay da xu ly roi');
  end if;

  if not p_ok then
    update project_facts set trang_thai = 'bo', duyet_at = now(),
           duyet_boi = coalesce((select auth.jwt() ->> 'email'), 'service_role')
     where id = p_id;
    return jsonb_build_object('ok', true, 'trang_thai', 'bo');
  end if;

  if f.khoa in ('tien_ich_gan', 'tien_ich', 'ha_tang', 'khu_compound') then
    update projects
       set amenities = (
             select jsonb_agg(distinct x)
             from jsonb_array_elements_text(coalesce(amenities, '[]'::jsonb) || to_jsonb(array[f.gia_tri])) x
           ),
           updated_at = now()
     where id = f.project_id;
  else
    update projects
       set specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(f.khoa, f.gia_tri),
           updated_at = now()
     where id = f.project_id;
  end if;

  update project_facts set trang_thai = 'da_duyet', duyet_at = now(),
         duyet_boi = coalesce((select auth.jwt() ->> 'email'), 'service_role')
   where id = p_id;
  return jsonb_build_object('ok', true, 'trang_thai', 'da_duyet', 'khoa', f.khoa);
end $$;

comment on function public.duyet_fact_du_an(bigint, boolean) is
  'FR-195: admin gật một dòng project_facts → nhập vào projects (tiện ích nối vào '
  'mảng, còn lại vào specs) rồi đóng dấu. Chỉ admin hoặc service_role.';

revoke execute on function public.ghi_fact_du_an(uuid, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ghi_fact_du_an(uuid, text, text, text, uuid, uuid) to service_role;
revoke execute on function public.duyet_fact_du_an(bigint, boolean) from public, anon;
grant execute on function public.duyet_fact_du_an(bigint, boolean) to authenticated, service_role;

-- Cửa đọc cho /admin: dòng chờ duyệt kèm tên dự án và mã tin.
create or replace view public.project_facts_cho_duyet as
select f.id, f.project_id, p.name as du_an, p.district as quan,
       f.khoa, f.gia_tri, f.nguon, f.created_at,
       l.code as ma_tin
  from project_facts f
  join projects p on p.id = f.project_id
  left join listings l on l.id = f.listing_id
 where f.trang_thai = 'cho_duyet'
 order by f.created_at desc;

comment on view public.project_facts_cho_duyet is
  'FR-195: hàng chờ duyệt thông tin dự án, hiện ở /admin tab Vận hành.';
revoke all on public.project_facts_cho_duyet from anon, authenticated;
grant select on public.project_facts_cho_duyet to authenticated;
