-- 20260905d — SEC-05: trần gọi model THEO TỪNG NGƯỜI, bên cạnh trần toàn cục.
--
-- VÌ SAO. Trần hiện có (`bump_model_quota`, mặc định 1000 lượt/ngày) là trần
-- TOÀN CỤC. Chạm trần thì bot im với TẤT CẢ mọi người. Nghĩa là một kẻ gửi
-- 1000 request rác trong vài phút tắt được dịch vụ cho cả ngày, với chi phí
-- gần bằng 0 — trần vốn để giữ ví lại thành nút tắt ai cũng bấm được.
--
-- Bình luận cũ trong `chat-reply` nói đúng vấn đề: đếm theo `external_user_id`
-- vô nghĩa vì chuỗi đó do người gọi tự đặt. Điều đó ĐÚNG khi webhook không
-- kiểm chữ ký. Sau khi vá SEC-01 (webhook fail-closed + verify chữ ký),
-- `sender.id` là do Zalo ký, không bịa được nữa — nên đếm theo uid mới có
-- nghĩa, và đây là chỗ đặt trần cá nhân.
--
-- Hai trần cùng lúc, cái nào chạm trước thì chặn:
--   · 30 lượt / giờ / uid  — chặn kẻ bơm liên tục
--   · 120 lượt / ngày / uid — chặn kẻ bơm rải đều
-- Người quen (đã có trong `sellers`/`ctvs`/`admins`) được nới gấp 4: chủ nhà
-- rao một căn có thể nhắn hàng chục lượt liền, chặn nhầm họ là hỏng việc thật.
--
-- Trần toàn cục GIỮ NGUYÊN làm chốt chặn cuối về tiền: trần cá nhân chặn một
-- kẻ, trần toàn cục chặn một nghìn kẻ.

create table if not exists public.chat_quota (
  zalo_user_id text not null,
  gio          timestamptz not null,     -- đầu giờ, date_trunc('hour')
  calls        integer not null default 0,
  primary key (zalo_user_id, gio)
);

alter table public.chat_quota enable row level security;
-- Không policy = chặn hết, chỉ service_role đụng được (cùng khuôn các bảng nội bộ).

comment on table public.chat_quota is
  'SEC-05: đếm lượt gọi model theo uid theo từng giờ. Dọn tự động trong bump_user_quota.';

create or replace function public.bump_user_quota(
  p_uid       text,
  p_gio_limit integer default 30,
  p_ngay_limit integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gio   timestamptz := date_trunc('hour', now());
  v_quen  boolean;
  v_he    integer;
  v_trong_gio integer;
  v_trong_ngay integer;
begin
  if p_uid is null or btrim(p_uid) = '' then
    return true;                        -- không có uid thì trần này không áp được
  end if;

  -- Người quen được nới gấp 4. Một truy vấn, không ba.
  select exists (
    select 1 from sellers s where s.zalo_user_id = p_uid
    union all
    select 1 from ctvs c   where c.zalo_user_id = p_uid
    union all
    select 1 from admins a where a.zalo_user_id = p_uid
  ) into v_quen;
  v_he := case when v_quen then 4 else 1 end;

  insert into chat_quota (zalo_user_id, gio, calls)
  values (p_uid, v_gio, 1)
  on conflict (zalo_user_id, gio) do update set calls = chat_quota.calls + 1
  returning calls into v_trong_gio;

  select coalesce(sum(calls), 0) into v_trong_ngay
  from chat_quota
  where zalo_user_id = p_uid and gio > now() - interval '24 hours';

  -- Dọn rác: hàng của chính uid này, và thỉnh thoảng quét toàn bảng. Để trong
  -- hàm cho khỏi thêm một cron job nữa phải trông.
  delete from chat_quota where zalo_user_id = p_uid and gio < now() - interval '48 hours';
  if random() < 0.01 then
    delete from chat_quota where gio < now() - interval '48 hours';
  end if;

  if v_trong_gio > p_gio_limit * v_he or v_trong_ngay > p_ngay_limit * v_he then
    return false;
  end if;
  return true;
end $$;

revoke all on function public.bump_user_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.bump_user_quota(text, integer, integer) to service_role;

create index if not exists chat_quota_gio_idx on public.chat_quota (gio);
