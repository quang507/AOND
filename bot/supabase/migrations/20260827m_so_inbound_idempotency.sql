-- Task idempotency (FR-162) · Sổ trạng thái cho MỖI tin nhắn đến theo zalo_msg_id.
--
-- Trước bản này, chống-trùng duy nhất là unique index messages.zalo_msg_id:
-- kênh gửi lại tin cũ → insert dính 23505 → chat-reply trả {deduped:true} RỖNG.
-- Bốn lỗ cùng một gốc:
--   (1) retry bị NUỐT — khách không bao giờ nhận lại câu trả lời, dù AI đã chạy
--       xong ở lượt trước (Zalo gửi hụt là mất trắng);
--   (2) bump_model_quota chạy TRƯỚC kiểm trùng — tin duplicate vẫn đốt quota;
--   (3) không phân biệt nổi "đã trả lời xong" với "chết giữa chừng" — cả hai
--       đều là một dòng messages, nên chết giữa chừng cũng bị nuốt nốt;
--   (4) hai bản sao cùng msg_id đến đồng thời: cả hai qua cổng quota (đốt 2
--       lượt) rồi mới có một bên thua ở unique index.
--
-- Sổ này cho mỗi msg_id một vòng đời: received → processing → completed/failed.
--   * completed thì LƯU NGUYÊN payload trả lời (cột reply) — retry sau đó được
--     PHÁT LẠI y nguyên, không gọi model, không tốn quota. Đây cũng chính là
--     đường retry outbound: Zalo gửi hụt thì kênh cứ gọi lại cùng msg_id.
--   * failed (hoặc processing/received quá hạn — function chết giữa chừng) thì
--     claim lại được, attempts + 1: retry KHÔNG bị nuốt.
--   * đang received/processing còn tươi → 'in_flight': bản sao thứ hai đứng
--     ngoài, không xử lý đôi, không đốt quota.
--
-- messages.zalo_msg_id + 23505 VẪN GIỮ làm lưới đỡ cuối (sổ hỏng thì hành vi
-- cũ còn nguyên) — sổ này đứng TRƯỚC, không thay thế.

create table public.inbound_ledger (
  zalo_msg_id text primary key,
  status      text not null default 'received'
              check (status in ('received', 'processing', 'completed', 'failed')),
  attempts    int  not null default 1,
  -- Nguyên payload jsonResponse đã trả cho kênh (replies, photos, role…) —
  -- nguồn để phát lại. NULL khi chưa xong.
  reply       jsonb,
  -- Lỗi cuối cùng khi failed (cắt 500 ký tự phía ghi).
  detail      text,
  -- Outbound (đường OA): zalo-webhook ghi lại kết quả GỬI — sent_at có nghĩa là
  -- mọi bong bóng đã tới Zalo; send_error là gửi hụt dù đã thử lại.
  sent_at     timestamptz,
  send_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.inbound_ledger is
  'FR-162: vong doi xu ly moi tin den theo zalo_msg_id (received/processing/completed/failed) + payload tra loi de phat lai khi retry.';

-- Chỉ service_role (edge functions) được đụng. RLS bật không policy = anon và
-- authenticated bị chặn sạch kể cả khi quyền bảng lọt.
alter table public.inbound_ledger enable row level security;
revoke all on public.inbound_ledger from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- claim_inbound: MỘT cú gọi atomic quyết định lượt này được làm gì.
--   'claimed'   → xử lý đi (r_attempts = 1 là tin mới; > 1 là retry sau failed/
--                 chết giữa chừng — chat-reply dựa vào đó để KHÔNG nuốt 23505).
--   'completed' → đã trả lời xong từ trước, r_reply là payload để phát lại.
--   'in_flight' → một lượt khác đang cầm đúng msg_id này — đứng ngoài chờ.
--
-- Chống race bằng chính unique key: hai lượt cùng insert thì lượt sau khựng ở
-- unique index tới khi lượt đầu commit (transaction RPC ngắn), rồi rơi vào
-- nhánh `select ... for update`. Không khoá bảng, không advisory — một dòng,
-- một khoá dòng, không có đường deadlock.
--
-- p_stale_secs = 150: quá ngần ấy giây mà chưa completed/failed thì coi như
-- function đã chết giữa chừng (wall-clock limit của edge function còn ngắn
-- hơn), cho claim lại. Đặt NGẮN hơn là nguy: nhánh seller gọi model 2-3 lần,
-- lượt sống lâu có thật — reclaim khi lượt gốc còn chạy là trả lời ĐÔI.
create or replace function public.claim_inbound(p_msg_id text, p_stale_secs int default 150)
returns table (r_state text, r_reply jsonb, r_attempts int)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v inbound_ledger%rowtype;
begin
  if p_msg_id is null or btrim(p_msg_id) = '' then
    -- Không có msg_id thì không có gì để chống trùng — cho qua như tin mới.
    return query select 'claimed'::text, null::jsonb, 1; return;
  end if;

  -- Dọn sổ cũ thi thoảng (~1% lượt gọi): msg_id của Zalo không quay vòng trong
  -- 30 ngày, giữ lâu hơn chỉ tốn chỗ. Không cần cron riêng cho việc này.
  if random() < 0.01 then
    delete from inbound_ledger where created_at < now() - interval '30 days';
  end if;

  insert into inbound_ledger (zalo_msg_id) values (p_msg_id)
  on conflict (zalo_msg_id) do nothing;
  if found then
    return query select 'claimed'::text, null::jsonb, 1; return;
  end if;

  select * into v from inbound_ledger where zalo_msg_id = p_msg_id for update;

  if v.status = 'completed' then
    return query select 'completed'::text, v.reply, v.attempts; return;
  end if;

  if v.status = 'failed'
     or v.updated_at < now() - make_interval(secs => p_stale_secs) then
    update inbound_ledger
       set status = 'received', attempts = attempts + 1,
           detail = null, updated_at = now()
     where zalo_msg_id = p_msg_id;
    return query select 'claimed'::text, null::jsonb, v.attempts + 1; return;
  end if;

  return query select 'in_flight'::text, null::jsonb, v.attempts;
end $fn$;

comment on function public.claim_inbound(text, int) is
  'FR-162: claim atomic mot luot xu ly theo zalo_msg_id. claimed = lam di; completed = phat lai r_reply; in_flight = luot khac dang cam.';

revoke all on function public.claim_inbound(text, int) from public, anon, authenticated;
grant execute on function public.claim_inbound(text, int) to service_role;
