-- 20260910h — BÁO ĐÚNG KHI ĐANG CHẠY DỰ PHÒNG, VÀ GHI NHẬN DỰ ÁN CHƯA CÓ TRONG KHO.
--
-- Chủ dự án 10/09/2026 nhìn màn hình /admin: "model sửa có cả groq rồi mà nhỉ" —
-- băng đỏ vẫn viết "Model đang KHÔNG gọi được", trong khi bot đang trả lời bình
-- thường bằng Groq. Băng nói sai trạng thái thì lần sau không ai tin nó nữa.
-- `quota_tieu_hao()` nay trả thêm hai ô: có khoá dự phòng hay không, và có lượt
-- nào vừa chuyển sang dự phòng trong một giờ qua.
--
-- Và: "nếu người ta chat dự án mà ko có trong chỗ mình có cũng ghi nhận được
-- đúng ko" — được, sau bản này. `project_facts.project_id` thành nullable, thêm
-- `ten_du_an` để ghi tên khách nhắc mà kho chưa có. Admin đọc hàng chờ, thấy dự
-- án lạ thì thêm vào `projects` rồi gật.

alter table public.project_facts alter column project_id drop not null;
alter table public.project_facts add column if not exists ten_du_an text;
comment on column public.project_facts.ten_du_an is
  'Tên dự án khách nhắc khi kho CHƯA CÓ dòng nào (project_id null). Admin thêm dự án rồi gật.';

alter table public.project_facts drop constraint if exists project_facts_co_dich;
alter table public.project_facts add constraint project_facts_co_dich
  check (project_id is not null or coalesce(btrim(ten_du_an), '') <> '');

drop index if exists project_facts_khong_trung_idx;
create unique index if not exists project_facts_khong_trung_idx
  on public.project_facts (coalesce(project_id::text, lower(btrim(ten_du_an))), khoa, gia_tri)
  where trang_thai <> 'bo';

create or replace function public.ghi_fact_du_an(
  p_project_id uuid,
  p_khoa       text,
  p_gia_tri    text,
  p_nguon      text default 'seller_chat',
  p_listing_id uuid default null,
  p_conversation_id uuid default null,
  p_ten_du_an  text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id bigint;
begin
  if coalesce(btrim(p_gia_tri), '') = '' then return null; end if;
  if p_project_id is null and coalesce(btrim(p_ten_du_an), '') = '' then return null; end if;
  insert into project_facts (project_id, ten_du_an, khoa, gia_tri, nguon, listing_id, conversation_id)
  values (p_project_id, nullif(btrim(p_ten_du_an), ''), p_khoa, btrim(p_gia_tri),
          coalesce(p_nguon, 'seller_chat'), p_listing_id, p_conversation_id)
  on conflict do nothing
  returning id into v_id;
  return v_id;
exception when others then
  return null;   -- việc phụ, không được làm hỏng lượt trả lời khách
end $$;

comment on function public.ghi_fact_du_an(uuid, text, text, text, uuid, uuid, text) is
  'FR-195: ghi một điều nghe được về dự án. Kho chưa có dự án đó thì truyền p_ten_du_an '
  '(project_id null) — vẫn ghi nhận, admin thêm dự án sau.';

revoke execute on function public.ghi_fact_du_an(uuid, text, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ghi_fact_du_an(uuid, text, text, text, uuid, uuid, text) to service_role;

-- Gật một dòng chưa gắn dự án thì phải gắn trước: hàm nhận thêm p_project_id.
create or replace function public.duyet_fact_du_an(
  p_id bigint, p_ok boolean default true, p_project_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare f project_facts%rowtype; v_pid uuid;
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

  v_pid := coalesce(f.project_id, p_project_id);
  if v_pid is null then
    return jsonb_build_object('ok', false, 'vi',
      format('dong nay chua gan du an ("%s") — them du an vao kho roi gat lai', coalesce(f.ten_du_an, '?')));
  end if;

  if f.khoa in ('tien_ich_gan', 'tien_ich', 'ha_tang', 'khu_compound') then
    update projects
       set amenities = (
             select jsonb_agg(distinct x)
             from jsonb_array_elements_text(coalesce(amenities, '[]'::jsonb) || to_jsonb(array[f.gia_tri])) x
           ), updated_at = now()
     where id = v_pid;
  else
    update projects
       set specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(f.khoa, f.gia_tri),
           updated_at = now()
     where id = v_pid;
  end if;

  update project_facts set trang_thai = 'da_duyet', project_id = v_pid, duyet_at = now(),
         duyet_boi = coalesce((select auth.jwt() ->> 'email'), 'service_role')
   where id = p_id;
  return jsonb_build_object('ok', true, 'trang_thai', 'da_duyet', 'khoa', f.khoa);
end $$;

revoke execute on function public.duyet_fact_du_an(bigint, boolean, uuid) from public, anon;
grant execute on function public.duyet_fact_du_an(bigint, boolean, uuid) to authenticated, service_role;

drop view if exists public.project_facts_cho_duyet;
create view public.project_facts_cho_duyet as
select f.id, f.project_id, coalesce(p.name, f.ten_du_an) as du_an,
       (f.project_id is null) as du_an_chua_co, p.district as quan,
       f.khoa, f.gia_tri, f.nguon, f.created_at, l.code as ma_tin
  from project_facts f
  left join projects p on p.id = f.project_id
  left join listings l on l.id = f.listing_id
 where f.trang_thai = 'cho_duyet'
 order by f.created_at desc;
revoke all on public.project_facts_cho_duyet from anon, authenticated;
grant select on public.project_facts_cho_duyet to authenticated;

-- Quota: nói rõ có đường dự phòng hay không, và có đang chạy bằng nó không.
create or replace function public.quota_tieu_hao()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ngay        date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_tran_ngay   integer;
  v_hom_nay     record;
  v_gio_limit   integer := 30;
  v_ngay_limit  integer := 120;
  v_nguoi       jsonb;
  v_credit      record;
  v_tran_nguoi  integer;
  v_co_du_phong boolean := false;
  v_dang_du_phong timestamptz;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  begin
    v_tran_ngay := nullif(btrim(coalesce(public.get_secret('DAILY_MODEL_CALL_CAP'), '')), '')::integer;
  exception when others then v_tran_ngay := null; end;
  v_tran_ngay := coalesce(v_tran_ngay, 1000);

  begin
    v_co_du_phong := coalesce(btrim(coalesce(public.get_secret('GROQ_API_KEY'), '')), '') <> '';
  exception when others then v_co_du_phong := false; end;

  select coalesce(u.model_calls, 0) as luot,
         coalesce(u.in_tokens,0)+coalesce(u.out_tokens,0)+coalesce(u.cache_write_tokens,0)+coalesce(u.cache_read_tokens,0) as tokens,
         u.capped_at
    into v_hom_nay from bot_usage u where u.day = v_ngay;

  select coalesce(jsonb_agg(x order by x.trong_24h desc), '[]'::jsonb) into v_nguoi
    from (
      select q.zalo_user_id as uid, sum(q.calls) as trong_24h,
             sum(q.calls) filter (where q.gio = date_trunc('hour', now())) as trong_gio,
             exists (
               select 1 from sellers s where s.zalo_user_id = q.zalo_user_id
               union all select 1 from ctvs c where c.zalo_user_id = q.zalo_user_id
               union all select 1 from admins a where a.zalo_user_id = q.zalo_user_id
             ) as nguoi_quen
        from chat_quota q where q.gio > now() - interval '24 hours'
       group by q.zalo_user_id order by 2 desc limit 10
    ) x;

  select count(*)::int as so_loi, max(e.at) as lan_cuoi into v_credit
    from bot_errors e
   where e.at > now() - interval '24 hours'
     and e.detail ilike '%credit balance is too low%';

  select max(e.at) into v_dang_du_phong
    from bot_errors e
   where e.at > now() - interval '1 hour' and e.source ilike 'model chinh hong%';

  select count(*)::int into v_tran_nguoi from (
    select q.zalo_user_id from chat_quota q where q.gio > now() - interval '24 hours'
     group by q.zalo_user_id having sum(q.calls) >= v_ngay_limit) y;

  return jsonb_build_object(
    'ngay', v_ngay, 'luot_hom_nay', coalesce(v_hom_nay.luot, 0), 'tran_ngay', v_tran_ngay,
    'capped_at', v_hom_nay.capped_at, 'token_hom_nay', coalesce(v_hom_nay.tokens, 0),
    'tran_gio_nguoi', v_gio_limit, 'tran_ngay_nguoi', v_ngay_limit, 'he_so_nguoi_quen', 4,
    'nguoi_dot_nhieu', coalesce(v_nguoi, '[]'::jsonb),
    'so_nguoi_cham_tran', coalesce(v_tran_nguoi, 0),
    'het_credit', coalesce(v_credit.so_loi, 0) > 0,
    'credit_loi_24h', coalesce(v_credit.so_loi, 0),
    'credit_lan_cuoi', v_credit.lan_cuoi,
    'co_du_phong', v_co_du_phong,
    'dang_chay_du_phong', v_dang_du_phong is not null
  );
end $$;

comment on function public.quota_tieu_hao() is
  'FR-192/194: quota tiêu hao cho /admin. Từ 10/09 trả thêm co_du_phong và '
  'dang_chay_du_phong để băng cảnh báo nói ĐÚNG: hết số dư model chính nhưng bot '
  'vẫn chạy bằng model dự phòng, chứ không phải "không gọi được".';
