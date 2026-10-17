-- Bản tham chiếu 4 migration đã áp lên tbcdpupiarkuxtntmosl ngày 26/08/2026.
-- Đợt "sửa cấu trúc, không đụng dữ liệu": dữ liệu thiếu là chuyện bình thường
-- của kho import; tội của cấu trúc là biến "thiếu một trường" thành "chết lặng,
-- không báo gì". Bốn chỗ dưới đây đều thuộc loại đó.

-- ── 1. add_property_type_chua_ro ────────────────────────────────────────────
-- (chạy riêng transaction: ALTER TYPE ADD VALUE chưa dùng được ngay trong cùng tx)
alter type property_type add value if not exists 'chua_ro';

-- ── 2. missing_facts_never_silent ───────────────────────────────────────────
-- listing_missing_facts nối INNER JOIN theo property_type. Cột nullable + inner
-- join = thiếu loại BĐS thì view trả 0 dòng, im lặng. Máy hỏi nhỏ giọt tưởng
-- "hết gì để hỏi" trong khi thật ra là "không biết đây là nhà gì".
insert into required_facts (property_type, fact_key, priority)
values ('chua_ro', 'loai_bds', 1) on conflict do nothing;

alter table listings alter column property_type set default 'chua_ro';
update listings set property_type = 'chua_ro' where property_type is null;

create or replace view public.listing_missing_facts as
select l.id as listing_id, rf.fact_key, rf.priority
from listings l
join required_facts rf
  on rf.property_type = coalesce(l.property_type, 'chua_ro'::property_type)
left join listing_facts lf on lf.listing_id = l.id and lf.question = rf.fact_key
where lf.id is null
order by l.id, rf.priority, rf.fact_key;
grant select on public.listing_missing_facts to anon, authenticated, service_role;

-- ── 3. autopublish_on_listings_update ───────────────────────────────────────
-- Logic "đủ thông tin thì lên web" treo trên trigger của bảng PHỤ
-- (listing_facts) chứ không phải bảng nó quan tâm. Kết quả phụ thuộc THỨ TỰ hai
-- lệnh ghi trong code: ghi fact trước, ghi area_m2 sau thì trigger đọc phải
-- area_m2 còn NULL. Đúng lượt khách trả lời diện tích thì tin không lên web.
create or replace function public.listings_try_publish(p_listing_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.listings set status = 'dang_ban'
  where id = p_listing_id and status = 'cho_thong_tin'
    and price_vnd is not null and area_m2 is not null and ward is not null;
$$;

create or replace function public.listing_facts_touch_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.listings_try_publish(new.listing_id);
  return new;
end $$;

create or replace function public.listings_autopublish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.listings_try_publish(new.id);
  return null;
end $$;

drop trigger if exists trg_listings_autopublish on public.listings;
create trigger trg_listings_autopublish
after update of area_m2, price_vnd, ward on public.listings
for each row execute function public.listings_autopublish();
-- Không đệ quy: listings_try_publish chỉ SET status, mà status không nằm trong
-- danh sách UPDATE OF nên trigger này không tự kích lại chính nó.

-- price_vnd trước đây chỉ tính lúc INSERT: sửa price_raw sau này thì price_vnd
-- đứng im và bộ lọc giá trên web lọc theo số cũ, sai âm thầm.
drop trigger if exists trg_listings_price_vnd on public.listings;
create trigger trg_listings_price_vnd
before insert or update of price_raw on public.listings
for each row execute function public.listings_set_price_vnd();

-- ── 4. drip_dung_trang_thai_fr139 ───────────────────────────────────────────
-- seller_drip_tick lọc status in ('active','unverified') — hai giá trị KHÔNG
-- CÒN TỒN TẠI từ khi FR-139 đổi vòng đời sang tiếng Việt. Cron 30 phút vẫn chạy
-- đều nhưng lúc nào cũng khớp 0 dòng: hỏng mà không kêu.
create or replace function public.seller_drip_tick()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    with asked as (
      select l2.seller_id, count(distinct q.listing_id) as c
      from info_requests q join listings l2 on l2.id = q.listing_id
      where q.created_at > now() - interval '24 hours'
      group by l2.seller_id
    ),
    cand as (
      select l.id, l.seller_id, l.created_at, coalesce(a.c, 0) as asked24,
             row_number() over (partition by l.seller_id order by l.created_at desc) as rn
      from listings l
      join sellers s on s.id = l.seller_id
      left join asked a on a.seller_id = l.seller_id
      where l.status = 'cho_thong_tin'   -- FR-144: đủ đăng rồi thì để yên
        and (s.zalo_user_id is not null or l.created_at > now() - interval '7 days')
        and exists (select 1 from listing_missing_facts m where m.listing_id = l.id)
        and not exists (select 1 from info_requests q
                          where q.listing_id = l.id and q.status = 'pending')
        and (select count(*) from info_requests q
               where q.listing_id = l.id and q.created_at > now() - interval '24 hours') < 3
    )
    select id from cand where rn + asked24 <= 2 order by created_at desc limit 10
  loop
    perform ask_seller_drip(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Điều kiện cũ "property_type is not null" vô tình là thứ DUY NHẤT chặn bão
-- http_post khi import hàng loạt. Thay bằng điều kiện thật.
create or replace function public.trg_listing_drip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.seller_id is not null and new.status = 'cho_thong_tin' then
    perform ask_seller_drip(new.id);
  end if;
  return new;
end $$;
