-- 20260911b — NHẮC LỊCH ĐI QUA ZALO CLONE KHI CHƯA CÓ OA (FR-202), VÀ QUÉT QR
-- ĐĂNG NHẬP ZALO CLONE NGAY TRÊN CRM (FR-203).
--
-- ══ 1. FR-202 ═══════════════════════════════════════════════════════════════
-- Chủ dự án 11/09/2026: "Nhắc lịch xem nhà đánh sent trong khi chưa có OA nên
-- không gửi đi đâu, có zalo clone rồi mà, dùng zalo clone gửi cho id zalo chủ nhà".
--
-- Chuyện đã xảy ra, theo thứ tự:
--   1. `nudge` soạn xong lời nhắc, chưa có OA nên không gửi được, vẫn đánh
--      `status='sent'` → khách không nhận gì mà sổ ghi là đã nhắc (review C1).
--   2. Bản vá 10/09 đổi thành "để `pending` cho bridge kéo". Nhưng bridge chỉ
--      kéo MỘT cửa — `escalation-feed` — và cửa đó chỉ phục vụ loại
--      `escalation`/`report`, chỉ tra người bán/CTV/admin. Không ai kéo lời
--      nhắc lịch xem. Tệ hơn: `nhan_viec_nhac` nhận lại dòng `pending` đó sau
--      5 phút → `nudge` gọi model soạn lại cùng một tin, mãi mãi. Chưa tốn
--      đồng nào chỉ vì hàng đợi đang không có lời nhắc loại đó.
--   3. Chủ nhà không bao giờ được nhắc trước buổi xem — chỉ khách. Người mở
--      cửa là chủ nhà.
--
-- Nay nối thật:
--   · `nudge` soạn xong mà chưa có OA → cất tin vào `reminders.noi_dung_gui`,
--     nhả hợp đồng thuê, giữ `pending`.
--   · `nhan_viec_nhac` BỎ QUA dòng đã có `noi_dung_gui` — không soạn lại lần hai.
--   · `escalation-feed` đưa cả những dòng đó cho bridge, kèm Zalo ID của đúng
--     người nhận (người mua HOẶC chủ nhà). Bridge gửi bằng acc clone rồi ack.
--   · Lịch xem thì `nudge` đặt thêm một dòng cho CHỦ NHÀ, tin mẫu cố định.

alter table public.reminders
  add column if not exists noi_dung_gui text;

comment on column public.reminders.noi_dung_gui is
  'Tin ĐÃ SOẠN SẴN chờ bridge Zalo clone gửi (chưa có OA). Có giá trị = nudge đã soạn xong, '
  'đừng soạn lại; escalation-feed đưa nó cho bridge, ack xong mới thành `sent` (FR-202, 11/09).';

-- Nhận việc cho nudge: bỏ qua dòng đã soạn sẵn chờ bridge.
create or replace function public.nhan_viec_nhac(p_kinds text[], p_limit integer default 20, p_worker text default null::text)
returns setof reminders
language sql
security definer
set search_path to 'public'
as $function$
  update public.reminders r
     set locked_at = now(), locked_by = p_worker, attempts = r.attempts + 1
   where r.id in (
     select id from public.reminders
      where status='pending' and kind = any(p_kinds) and due_at <= now()
        and (locked_at is null or locked_at < now() - interval '5 minutes')
        and coalesce(next_retry_at, '-infinity'::timestamptz) <= now()
        -- Đã soạn sẵn chờ bridge Zalo clone gửi thì KHÔNG nhận lại: nhận lại
        -- là gọi model soạn cùng một tin mỗi 5 phút, mãi mãi (11/09).
        and noi_dung_gui is null
      order by due_at limit p_limit for update skip locked)
  returning r.*;
$function$;

comment on function public.nhan_viec_nhac(text[], integer, text) is
  'FR-166: giành việc nhắc cho nudge (hợp đồng thuê 5 phút). Bỏ qua dòng đã có '
  'noi_dung_gui — tin đã soạn, đang chờ bridge Zalo clone gửi (FR-202, 20260911b).';

-- ══ 2. FR-203 ═══════════════════════════════════════════════════════════════
-- Chủ dự án 11/09/2026: "cần quét zalo clone lại ko, viết lên crm dc ko" →
-- "qr cũng hiện trên crm để quét là được".
--
-- Trước bản này, phiên Zalo của acc clone chết (cookie `zpw_sek` hết hiệu
-- lực) thì bridge KHÔNG biết: nó cứ kéo việc, gửi, hỏng, ghi một dòng lỗi mỗi
-- việc mỗi phút — từ chiều 10/09 tới sáng 11/09, 21 tin báo admin nằm chờ. Và
-- muốn quét lại thì phải ssh vào VPS đọc `journalctl` lấy link QR.
-- Nay bridge thấy phiên chết → cất phiên sang bên, khởi động lại vào luồng QR,
-- đẩy ảnh QR lên bảng này qua `escalation-feed`; /admin đọc và hiện ra để quét.
--
-- ẢNH QR LÀ THỨ NHẠY. Ai quét nó bằng acc của mình thì acc ĐÓ thành acc bot:
-- nhận tin khách, gửi tin dưới tên AI Ơi Nhà Đất. Nên chỉ admin đọc được (RLS),
-- không mở cho anon, và ảnh bị xoá ngay khi bridge báo trạng thái khác
-- `cho_quet`. Web không ghi thẳng bảng; nút "Đăng nhập lại" đi qua một hàm
-- SECURITY DEFINER tự kiểm `la_admin()`.
create table if not exists public.bridge_dang_nhap (
  id smallint primary key default 1 check (id = 1),
  trang_thai text not null default 'chua_ro'
    check (trang_thai in ('chua_ro', 'dang_nhap', 'cho_quet', 'da_quet', 'het_han', 'tu_choi')),
  qr_png text
    check (qr_png is null or (qr_png like 'data:image/png;base64,%' and length(qr_png) <= 200000)),
  yeu_cau_quet_lai boolean not null default false,
  ghi_chu text,
  cap_nhat timestamptz not null default now()
);

comment on table public.bridge_dang_nhap is
  '[HỆ THỐNG] Trạng thái đăng nhập acc Zalo clone của bridge + ảnh QR để quét lại ngay trên /admin '
  '(FR-203). Đúng một dòng (id = 1). Bridge ghi qua escalation-feed (action "qr"); admin chỉ đọc, '
  'và bấm "Đăng nhập lại" qua yeu_cau_quet_lai_zalo().';
comment on column public.bridge_dang_nhap.trang_thai is
  'dang_nhap · cho_quet (có ảnh QR) · da_quet (chờ bấm xác nhận trên điện thoại) · het_han · tu_choi · chua_ro (bridge bản cũ).';
comment on column public.bridge_dang_nhap.qr_png is
  'Ảnh QR dạng data URL, CHỈ có khi cho_quet. Nhạy: quét bằng acc nào thì acc đó thành acc bot — admin đọc thôi.';
comment on column public.bridge_dang_nhap.yeu_cau_quet_lai is
  'Admin bấm "Đăng nhập lại" → true; bridge thấy ở lượt kéo việc kế tiếp thì bỏ phiên, vào luồng QR, và đặt lại false.';

insert into public.bridge_dang_nhap (id) values (1) on conflict (id) do nothing;

alter table public.bridge_dang_nhap enable row level security;
-- View/bảng mới ở project này mặc định LỘ (default privileges cấp sẵn cho
-- anon/authenticated) — revoke TRƯỚC rồi mới grant (CLAUDE.md §6).
revoke all on public.bridge_dang_nhap from public, anon, authenticated;
grant select on public.bridge_dang_nhap to authenticated;
grant all on public.bridge_dang_nhap to service_role;
drop policy if exists bridge_dang_nhap_admin_read on public.bridge_dang_nhap;
create policy bridge_dang_nhap_admin_read on public.bridge_dang_nhap
  for select to authenticated
  using (public.la_admin());

create or replace function public.yeu_cau_quet_lai_zalo()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;
  update public.bridge_dang_nhap
     set yeu_cau_quet_lai = true,
         ghi_chu = 'yêu cầu đăng nhập lại từ /admin (' ||
                   coalesce((select auth.jwt()) ->> 'email', 'service_role') || ')',
         cap_nhat = now()
   where id = 1;
end $$;

comment on function public.yeu_cau_quet_lai_zalo() is
  'FR-203: nút "Đăng nhập lại" ở /admin. Chỉ bật cờ; bridge đọc cờ ở lượt kéo việc kế tiếp (≤ 5 phút).';

revoke execute on function public.yeu_cau_quet_lai_zalo() from public, anon;
grant execute on function public.yeu_cau_quet_lai_zalo() to authenticated, service_role;
