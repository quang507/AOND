-- 20260910k — SỬA PROMPT BOT NGAY TRONG CRM (FR-200).
--
-- Chủ dự án 10/09/2026: "có chỗ để điều chỉnh prompt bot trong crm, tao chỉ cần
-- sửa chỗ đó thì nó đồng bộ hết luôn chưa".
--
-- Trước bản này: sửa prompt phải mở Supabase Table Editor (bảng `bot_prompts`)
-- — tức là phải có tài khoản Supabase, phải biết bảng nào, và ai lỡ tay sửa
-- bảng bên cạnh thì không có gì cản. Bảng đó cố ý chỉ mở cho `service_role`
-- (`20260829d`: `revoke insert, update, delete ... from anon, authenticated`),
-- nên web không ghi thẳng được, và KHÔNG được mở quyền ghi bảng cho web chỉ vì
-- muốn có cái nút.
--
-- Hai hàm SECURITY DEFINER, tự kiểm `la_admin()`. Cửa hẹp: đọc được đúng bảng
-- prompt, ghi được đúng một khoá, và mọi lượt ghi để lại dấu (`sua_boi`,
-- `updated_at`) — sửa giọng bot là việc ảnh hưởng tới mọi khách, phải biết ai
-- vừa sửa gì.
--
-- ĐỒNG BỘ TỚI ĐÂU: bảng này ĐÈ bản trong code lúc chạy (FR-138), nhớ tạm 60
-- giây, và cả 5 edge function đọc chung một chỗ — nên sửa ở đây là mọi kênh
-- (Zalo OA, Zalo cá nhân, web) đổi trong vòng một phút, không cần deploy.
-- Cái KHÔNG tự đồng bộ là bản trong git (`_shared/prompts.ts`): nó vẫn là bản
-- cũ cho tới khi ai đó chạy `bun run prompt --keo` rồi mở PR. Trang /admin/prompt
-- nói thẳng điều đó ra màn hình, vì đúng chỗ này đã sinh ra sự cố 10/09 (DB cũ
-- hơn code suốt mấy ngày, bot chạy bộ câu hỏi cũ mà không ai biết).

alter table public.bot_prompts
  add column if not exists sua_boi text;

comment on column public.bot_prompts.sua_boi is
  'Email người sửa lần cuối qua /admin/prompt. Null = do migration hoặc script đặt.';

-- ─── Đọc: trả cả bảng cho admin ────────────────────────────────────────────
create or replace function public.doc_bot_prompts()
returns table (key text, content text, updated_at timestamptz, sua_boi text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;
  return query
    select p.key, p.content, p.updated_at, p.sua_boi
      from public.bot_prompts p
     order by p.key;
end $$;

comment on function public.doc_bot_prompts() is
  'FR-200: đọc bảng prompt cho màn /admin/prompt. Admin hoặc service_role.';

revoke execute on function public.doc_bot_prompts() from public, anon;
grant execute on function public.doc_bot_prompts() to authenticated, service_role;

-- ─── Ghi: một khoá một lượt ────────────────────────────────────────────────
create or replace function public.sua_bot_prompt(p_key text, p_content text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_email text;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;
  if coalesce(btrim(p_key), '') = '' then
    raise exception 'Thieu khoa prompt' using errcode = '22023';
  end if;
  -- Prompt RỖNG là bot mất luật, không phải "xoá cho gọn". Chặn ở đây vì màn
  -- hình có thể bị bôi trắng do trượt tay, và hậu quả chỉ lộ ra ở tin nhắn
  -- khách nhận được — nơi không ai đang nhìn.
  if coalesce(btrim(p_content), '') = '' then
    raise exception 'Noi dung prompt khong duoc de trong' using errcode = '22023';
  end if;
  v_email := coalesce((select auth.jwt() ->> 'email'), 'service_role');
  insert into public.bot_prompts (key, content, updated_at, sua_boi)
  values (btrim(p_key), p_content, now(), v_email)
  on conflict (key) do update
    set content = excluded.content, updated_at = now(), sua_boi = excluded.sua_boi;
  return jsonb_build_object('key', btrim(p_key), 'sua_boi', v_email, 'luc', now());
end $$;

comment on function public.sua_bot_prompt(text, text) is
  'FR-200: sửa MỘT khoá prompt từ /admin/prompt. Bot đọc lại trong 60 giây (nhớ tạm), '
  'không cần deploy. Bản trong git không tự đổi theo — chạy `bun run prompt --keo` rồi mở PR.';

revoke execute on function public.sua_bot_prompt(text, text) from public, anon;
grant execute on function public.sua_bot_prompt(text, text) to authenticated, service_role;
