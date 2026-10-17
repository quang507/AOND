-- 20260828g — Kho ảnh tin rao: danh tính theo UUID, có bảng media thật (FR-165)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SOÁT HIỆN TRẠNG TRƯỚC KHI ĐỔI (đo trên bản live 28/08/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--   * 173 tin trong `listings`.
--   * Bucket `listing-photos` (public) — **0 object**. Kho ảnh RỖNG.
--   * `listing_facts` question='hinh_anh' — **0 dòng**. Không URL nào được lưu
--     ở đâu cả: view `listing_photos_v` DỰNG url lúc đọc.
--   * Web (`lib/photos.ts`) đọc view đó; vì bucket rỗng nên MỌI tin đang hiện
--     ảnh minh hoạ.
--   → Không có ảnh nào để hỏng, nên KHÔNG cần đường chuyển tiếp cho dữ liệu.
--     Thứ phải giữ tương thích là HỢP ĐỒNG ĐỌC (`listing_photos_v` với cột
--     code/url/path) vì web lẫn bot cùng gọi — giữ nguyên, không ai phải sửa.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BỆNH
-- ═══════════════════════════════════════════════════════════════════════════
-- (1) Đường dẫn neo vào `listings.code` — cột MUTABLE (`listings_code_key` chỉ
--     là UNIQUE, không có gì cấm UPDATE). Đổi mã một cái là toàn bộ ảnh của
--     tin đó rơi khỏi tin, âm thầm, không một dòng lỗi.
-- (2) KHÔNG có bảng media. "Bảng" là một VIEW trên `storage.objects`, nên
--     không có khoá ngoại, không ràng buộc được gì: bằng chứng không truy về
--     tin được, xoá tin không đụng tới file, xoá file không ai biết.
-- (3) View nhúng CỨNG URL project. Đổi project là sửa migration.
-- (4) Thứ tự ảnh = thứ tự TÊN FILE. `1.jpg, 10.jpg, 2.jpg` xếp ra 1, 10, 2 —
--     ảnh bìa là "tấm đầu theo tên", tức phụ thuộc người đặt tên file.
-- (5) Bucket không giới hạn MIME, không giới hạn dung lượng.
-- (6) SRS-3.9 + NFR-06 ĐÃ đòi bucket riêng cho sổ đỏ (signed URL ≤15 phút,
--     chặn truy cập thẳng) — chưa bao giờ dựng. Vòng drip FR-129 có hỏi
--     `phap_ly`, mà chủ nhà trả lời câu đó thường bằng ẢNH CHỤP SỔ. Chỉ có
--     một bucket, và nó công khai.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- (0) HAI BUCKET, TÁCH CÔNG KHAI / RIÊNG TƯ
-- ═══════════════════════════════════════════════════════════════════════════
-- `listing-photos` cũ: KHÔNG xoá được bằng SQL — Supabase chặn
-- `delete from storage.buckets` bằng `storage.protect_delete()` ("Use the
-- Storage API instead"), đúng cái luật "đừng thao tác thẳng vào bảng storage"
-- mà chính bản này tuân theo. Nên thay vì xoá, ta TƯỚC VŨ KHÍ của nó: hạ khỏi
-- chế độ công khai và siết MIME/dung lượng, để nó thôi là một bucket công khai
-- không giới hạn nằm chờ tai nạn. Nó đang RỖNG (đo 28/08) nên không mất gì.
-- Muốn xoá hẳn thì chủ dự án xoá ở Dashboard → Storage; đó là thao tác Storage
-- API, không phải việc của migration.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-public', 'listing-public', true,
  10485760,                                   -- 10 MB/ảnh
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-private', 'listing-private', false,
  20971520,                                   -- 20 MB (bản scan sổ thường nặng)
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets
   set public = false,
       file_size_limit = 1,
       allowed_mime_types = array['application/x-nonexistent']
 where id = 'listing-photos';

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) BẢNG MEDIA THẬT
-- ═══════════════════════════════════════════════════════════════════════════
-- Chỉ những cột có người dùng. `is_public` của SRS-3.9 KHÔNG thêm: `bucket`
-- đã nói lên điều đó, hai cột cùng nói một chuyện là chỗ để chúng cãi nhau —
-- đúng bài học FR-164. Suy ra `is_public` bằng `bucket = 'listing-public'`.
create table if not exists public.listing_media (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  bucket       text not null check (bucket in ('listing-public','listing-private')),
  storage_path text not null,
  media_type   text not null check (media_type in
                 ('mat_tien','trong_nha','hem','so_do','giay_to','khac')),
  mime_type    text not null,
  sort_order   int  not null default 0,
  is_cover     boolean not null default false,
  created_at   timestamptz not null default now(),

  -- Bất biến 2 + 7: đường dẫn PHẢI mở đầu bằng UUID của tin. UUID không đổi
  -- được (khoá chính), nên đổi `code` không còn đụng tới ảnh.
  constraint listing_media_duong_dan_theo_uuid
    check (storage_path like listing_id::text || '/%'),
  -- Không cho leo thư mục, không cho đường dẫn tuyệt đối.
  constraint listing_media_duong_dan_sach
    check (storage_path !~ '(^/)|(\.\.)|(//)'),
  -- Bất biến 8 + SRS-3.9: giấy tờ KHÔNG được nằm trong bucket công khai.
  constraint listing_media_giay_to_phai_rieng
    check (media_type not in ('so_do','giay_to') or bucket = 'listing-private'),
  -- Ảnh bìa là thứ hiện công khai, nên nó phải ở bucket công khai.
  constraint listing_media_bia_phai_cong_khai
    check (not is_cover or bucket = 'listing-public'),

  constraint listing_media_path_key unique (bucket, storage_path)
);

comment on table public.listing_media is
  'FR-165: bản ghi media của tin rao. Danh tính file neo vào listings.id (UUID '
  'bất biến), KHÔNG neo vào listings.code. bucket quyết định công khai/riêng tư.';
comment on column public.listing_media.storage_path is
  'Đường dẫn TRONG bucket, dạng "<listing_id>/<media_id>.<đuôi>". Không chứa '
  'tên bucket, không chứa host — URL do tầng đọc dựng.';

-- Bất biến: mỗi tin nhiều nhất MỘT ảnh bìa.
create unique index if not exists listing_media_mot_bia_idx
  on public.listing_media (listing_id) where is_cover;

-- Truy vấn thật: lấy media của một tin theo đúng thứ tự hiển thị.
create index if not exists listing_media_tin_thu_tu_idx
  on public.listing_media (listing_id, sort_order, created_at, id);

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) THỨ TỰ TẤT ĐỊNH + ẢNH BÌA TẤT ĐỊNH
-- ═══════════════════════════════════════════════════════════════════════════
-- Không bao giờ xếp theo tên file nữa. Khoá xếp là (sort_order, created_at,
-- id) — id là chốt chặn cuối để hai ảnh cùng sort_order và cùng mili-giây vẫn
-- ra một thứ tự cố định, không bốc thăm.
--
-- Ảnh bìa: tấm công khai ĐẦU TIÊN theo khoá đó tự được đánh dấu. Xoá bìa thì
-- tấm kế tiếp lên thay. Nghĩa là "bìa" luôn có giá trị xác định mà không cần
-- ai bấm nút.
create or replace function public.listing_media_chon_bia(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if exists (select 1 from listing_media
              where listing_id = p_listing_id and is_cover) then
    return;                                   -- đã có bìa, không đụng
  end if;
  select id into v_id from listing_media
   where listing_id = p_listing_id and bucket = 'listing-public'
   order by sort_order, created_at, id
   limit 1;
  if v_id is not null then
    update listing_media set is_cover = true where id = v_id;
  end if;
end $$;

create or replace function public.listing_media_giu_bia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.listing_media_chon_bia(
    coalesce(new.listing_id, old.listing_id));
  return null;
end $$;

drop trigger if exists trg_listing_media_bia on public.listing_media;
create trigger trg_listing_media_bia
after insert or delete or update of is_cover, bucket, sort_order
on public.listing_media
for each row execute function public.listing_media_giu_bia();

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) NƠI CẤU HÌNH URL — thôi nhúng cứng vào business logic
-- ═══════════════════════════════════════════════════════════════════════════
-- View cũ nhúng thẳng 'https://tbcdpupiarkuxtntmosl.supabase.co/...'. Đổi
-- project, khôi phục sang project khác, hay dựng bản staging là phải sửa
-- migration đã áp — thứ không được phép sửa. Đưa vào DỮ LIỆU: đổi bằng một
-- lệnh UPDATE, không cần migration.
create table if not exists public.app_config (
  key   text primary key,
  value text not null,
  ghi_chu text
);
comment on table public.app_config is
  'FR-165: cấu hình chạy được sửa mà không cần migration. Không đựng bí mật — '
  'bí mật nằm ở Vault (xem get_secret).';

insert into public.app_config (key, value, ghi_chu)
values (
  'storage_public_base_url',
  'https://tbcdpupiarkuxtntmosl.supabase.co/storage/v1/object/public',
  'Tiền tố URL của bucket công khai. Đổi project thì UPDATE dòng này.'
)
on conflict (key) do nothing;

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

create or replace function public.cau_hinh(p_key text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$ select value from public.app_config where key = p_key $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) CỬA ĐỌC — GIỮ NGUYÊN HỢP ĐỒNG CŨ
-- ═══════════════════════════════════════════════════════════════════════════
-- Web (`lib/photos.ts`) và bot (`chat-reply`) cùng select code/url/path từ
-- `listing_photos_v`. Giữ đúng ba cột đó nên KHÔNG bên nào phải sửa; thêm
-- sort_order/is_cover để bên đọc bỏ được lối xếp theo tên file.
-- CHỈ lộ bucket công khai: bucket riêng không bao giờ đi qua cửa này.
-- Có `created_at` để tầng đọc xếp ĐÚNG khoá canonical (sort_order, created_at,
-- id) — thiếu nó thì web xếp một kiểu, trigger chọn bìa xếp một kiểu, và "ảnh
-- đầu" hoá ra khác "ảnh bìa" mỗi khi trùng sort_order.
-- DROP rồi CREATE, không `create or replace`: view cũ (20260825) có bộ cột
-- khác, mà `create or replace view` không đổi được danh sách cột — replay lại
-- từ đầu sẽ gãy đúng chỗ đó.
drop view if exists public.listing_photos_v;
create view public.listing_photos_v
with (security_invoker = false) as
select
  l.code                                                   as code,
  -- ĐỌC THẲNG app_config, KHÔNG gọi `cau_hinh()`: view security-definer cho
  -- phép đọc BẢNG dưới bằng quyền CHỦ VIEW, nhưng quyền EXECUTE một HÀM vẫn
  -- xét theo NGƯỜI GỌI. Gọi hàm ở đây là anon vỡ ngay khi ta siết execute
  -- ("permission denied for function cau_hinh" — đo được). Subquery thì đi
  -- đường quyền của chủ view, mà anon vẫn không SELECT được app_config.
  (select c.value from public.app_config c where c.key = 'storage_public_base_url')
    || '/' || m.bucket || '/' || m.storage_path            as url,
  m.storage_path                                           as path,
  m.sort_order                                             as sort_order,
  m.is_cover                                               as is_cover,
  m.created_at                                             as created_at,
  m.listing_id                                             as listing_id,
  m.id                                                     as media_id
from public.listing_media m
join public.listings l on l.id = m.listing_id
where m.bucket = 'listing-public';

grant select on public.listing_photos_v to anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.listing_photos_v
  from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) HÀNG ĐỢI DỌN FILE — xoá dòng DB ≠ xoá file
-- ═══════════════════════════════════════════════════════════════════════════
-- Postgres không xoá được object trong Storage; phải gọi Storage API. Nên
-- KHÔNG giả vờ hai việc đó là một: xoá/thay dòng media chỉ GHI Ý ĐỊNH vào
-- hàng đợi, một worker mang ý định đó đi thực hiện và đánh dấu xong.
-- Retry được vì việc chưa `xong` thì vẫn nằm đó.
create table if not exists public.media_cleanup_queue (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null,
  storage_path text not null,
  trang_thai   text not null default 'cho'
                 check (trang_thai in ('cho','dang_lam','xong','loi')),
  attempts     int  not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.media_cleanup_queue is
  'FR-165: ý định xoá file vật lý. Ghi lúc xoá/thay dòng listing_media, worker '
  'media-cleanup mang đi gọi Storage API. Chưa xong thì còn nằm đây → retry được.';

create index if not exists media_cleanup_can_lam_idx
  on public.media_cleanup_queue (trang_thai, created_at)
  where trang_thai in ('cho','dang_lam');

-- Cùng luật trạng-thái-kết của FR-163: `xong` là kết, không lùi về được.
create or replace function public.media_cleanup_giu_trang_thai()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.trang_thai = 'xong' and new.trang_thai is distinct from 'xong' then
    raise exception 'media_cleanup_queue: đã xong thì không lùi trạng thái';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_media_cleanup_trang_thai on public.media_cleanup_queue;
create trigger trg_media_cleanup_trang_thai
before update on public.media_cleanup_queue
for each row execute function public.media_cleanup_giu_trang_thai();

-- Xoá dòng media (kể cả do CASCADE khi xoá tin) → xếp hàng dọn file.
-- Đổi đường dẫn (thay ảnh) → xếp hàng dọn file CŨ.
create or replace function public.listing_media_xep_hang_don()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    insert into media_cleanup_queue (bucket, storage_path)
    values (old.bucket, old.storage_path);
    return old;
  end if;
  if old.bucket is distinct from new.bucket
     or old.storage_path is distinct from new.storage_path then
    insert into media_cleanup_queue (bucket, storage_path)
    values (old.bucket, old.storage_path);
  end if;
  return new;
end $$;

drop trigger if exists trg_listing_media_don_file on public.listing_media;
create trigger trg_listing_media_don_file
after delete or update of bucket, storage_path on public.listing_media
for each row execute function public.listing_media_xep_hang_don();

-- Worker nhận việc: lấy việc `cho`, và lấy lại việc `dang_lam` đã kẹt quá
-- 10 phút (worker chết giữa chừng). Cùng lối claim của FR-162.
create or replace function public.nhan_viec_don_media(p_limit int default 50)
returns setof public.media_cleanup_queue
language sql
security definer
set search_path to 'public'
as $$
  update public.media_cleanup_queue q
     set trang_thai = 'dang_lam', attempts = q.attempts + 1, updated_at = now()
   where q.id in (
     select id from public.media_cleanup_queue
      where trang_thai = 'cho'
         or (trang_thai in ('dang_lam','loi') and updated_at < now() - interval '10 minutes')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning q.*;
$$;

revoke all on function public.nhan_viec_don_media(int) from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) PHÁT HIỆN MỒ CÔI (bất biến 5 và 6)
-- ═══════════════════════════════════════════════════════════════════════════
-- Chỉ ĐỌC `storage.objects` để đối chiếu — không đụng vào nó để thao tác file.
create or replace view public.media_mo_coi_storage as
select o.bucket_id as bucket, o.name as storage_path, o.created_at
from storage.objects o
where o.bucket_id in ('listing-public','listing-private')
  and not exists (
    select 1 from public.listing_media m
     where m.bucket = o.bucket_id and m.storage_path = o.name
  );
comment on view public.media_mo_coi_storage is
  'FR-165 bất biến 5: file nằm trong bucket mà không có dòng media nào nhận.';

create or replace view public.media_mo_coi_db as
select m.id, m.listing_id, m.bucket, m.storage_path, m.created_at
from public.listing_media m
where not exists (
  select 1 from storage.objects o
   where o.bucket_id = m.bucket and o.name = m.storage_path
);
comment on view public.media_mo_coi_db is
  'FR-165 bất biến 6: dòng media trỏ tới file không tồn tại (upload hỏng giữa '
  'chừng, hoặc file bị xoá tay).';

revoke all on public.media_mo_coi_storage, public.media_mo_coi_db
  from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) QUYỀN
-- ═══════════════════════════════════════════════════════════════════════════
-- `storage.objects` đang bật RLS và KHÔNG có policy nào — nghĩa là anon và
-- authenticated không ghi được gì, chỉ service_role (vốn bỏ qua RLS) mới ghi.
-- Đó đã là tư thế đúng, nên ở đây CỐ Ý KHÔNG thêm policy nào: thêm một policy
-- rộng tay là mở đường cho "ghi vào đường dẫn bất kỳ". Đọc bucket công khai đi
-- qua route /object/public, không hỏi RLS; bucket riêng chỉ mở bằng signed URL
-- do service_role ký (NFR-06 ≤15 phút).
alter table public.listing_media enable row level security;
alter table public.media_cleanup_queue enable row level security;

-- Web đọc ảnh qua view (security definer). Bảng thì anon chỉ được đọc phần
-- công khai, và không bao giờ được ghi.
revoke all on public.listing_media from anon, authenticated;
grant select on public.listing_media to anon, authenticated;

drop policy if exists listing_media_doc_cong_khai on public.listing_media;
create policy listing_media_doc_cong_khai on public.listing_media
  for select to anon, authenticated
  using (bucket = 'listing-public');

revoke all on public.media_cleanup_queue from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- (8) SIẾT QUYỀN EXECUTE
-- ═══════════════════════════════════════════════════════════════════════════
-- Bẫy: Postgres cấp EXECUTE cho PUBLIC theo mặc định, nên
-- `revoke ... from anon, authenticated` KHÔNG có tác dụng — hai role đó vẫn
-- thừa kế qua PUBLIC. Phải revoke từ chính PUBLIC. (Security advisor bắt được
-- đúng chỗ này sau lượt áp đầu.)
revoke execute on function public.cau_hinh(text)                  from public, anon, authenticated;
revoke execute on function public.nhan_viec_don_media(int)        from public, anon, authenticated;
revoke execute on function public.listing_media_chon_bia(uuid)    from public, anon, authenticated;
revoke execute on function public.listing_media_giu_bia()         from public, anon, authenticated;
revoke execute on function public.listing_media_xep_hang_don()    from public, anon, authenticated;
revoke execute on function public.media_cleanup_giu_trang_thai()  from public, anon, authenticated;

grant execute on function public.cau_hinh(text)               to service_role;
grant execute on function public.nhan_viec_don_media(int)     to service_role;
grant execute on function public.listing_media_chon_bia(uuid) to service_role;
