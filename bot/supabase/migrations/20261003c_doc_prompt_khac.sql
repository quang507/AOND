-- 03/10/2026 (giảm egress Supabase, docs/07 SRS-5.1zl): đo một lượt bot bằng bộ đếm `_luu_luong` — chat-reply kéo NGUYÊN
-- bảng bot_prompts (~38 KB) mỗi lượt, 60–80% byte của lượt. Mỗi lượt chạy trên isolate mới nên nhớ tạm trong bộ nhớ không ăn
-- (đã đo). Hàm này nhận mã băm SHA-256 của bản prompt trong code, chỉ trả những khoá được hỏi mà nội dung DB KHÁC bản code.
-- Khi hai bên đồng bộ (`bun run prompt`) lượt bot nhận về rỗng; sửa tay ở Table Editor vẫn có hiệu lực ngay lượt kế.
create or replace function public.doc_prompt_khac(p_bam jsonb)
returns table(key text, content text)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.key, p.content
    from public.bot_prompts p
   where p_bam ? p.key
     and p_bam ->> p.key is distinct from encode(sha256(convert_to(p.content, 'UTF8')), 'hex');
$$;

comment on function public.doc_prompt_khac(jsonb) is
  '[BOT & HÀNG ĐỢI] chat-reply gửi {khoá: sha256 bản code}; trả khoá có nội dung DB khác bản code (bản sửa tay đè code). SRS-5.1zl.';

revoke all on function public.doc_prompt_khac(jsonb) from public, anon, authenticated;
grant execute on function public.doc_prompt_khac(jsonb) to service_role;
