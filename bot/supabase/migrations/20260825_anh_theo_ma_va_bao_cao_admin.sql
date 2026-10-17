-- 20260825161548 add_photo_bucket_report_kind_fr146_148
-- Bản tham chiếu của migration đã áp lên project tbcdpupiarkuxtntmosl.
-- FR-146 (trần 100 tin/24h) không cần schema mới — dùng lại `messages` +
-- `conversations.needs_human` + reminders kind 'escalation' đã có.

-- FR-148: kho ảnh thật theo MÃ tin — bucket public, đường dẫn "<mã>/<tên file>"
-- (chủ dự án tự up qua Supabase Storage; web + bot đọc chung một chỗ).
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do update set public = true;

-- View tra ảnh theo mã (web anon + bot service_role dùng chung).
-- Chỉ lộ tên file trong bucket ĐÃ public, không đụng bucket khác.
create or replace view public.listing_photos_v as
select
  split_part(o.name, '/', 1) as code,
  'https://tbcdpupiarkuxtntmosl.supabase.co/storage/v1/object/public/listing-photos/'
    || o.name as url,
  o.name as path
from storage.objects o
where o.bucket_id = 'listing-photos'
  and o.name like '%/%';
grant select on public.listing_photos_v to anon, authenticated, service_role;

-- FR-149: báo cáo CTV 17h đi về Zalo cá nhân admin qua bridge (không dùng OA)
-- → thêm kind 'report' cho reminders; feed/nudge gửi note NGUYÊN VĂN.
alter table reminders drop constraint if exists reminders_kind_check;
alter table reminders add constraint reminders_kind_check
  check (kind in ('promise','reengage','viewing','followup','escalation','report'));

-- FR-147: leo thang "cần người thật" — CTV trước, quá 30 phút chưa ai đụng tay
-- thì báo admin. Cột đánh dấu đã leo lên admin để khỏi báo lặp.
alter table conversations
  add column if not exists human_escalated_at timestamptz;
