-- 20260909g — bot_prompts: đổi mọi "nhadat.cc" thành thương hiệu "AI Ơi Nhà Đất" (09/09/2026)
--
-- Chủ dự án: "đổi tên tất cả mọi chỗ là AI Ơi Nhà Đất, cả vercel domain là
-- aioinhadat.vercel.app". Cùng phép thay với _shared/prompts.ts (md5 khớp,
-- TS-KYGUI-16): địa chỉ web trước, rồi tên thương hiệu.
update public.bot_prompts
   set content = replace(replace(content, 'web: nhadat.cc', 'web: aioinhadat.vercel.app'), 'nhadat.cc', 'AI Ơi Nhà Đất'),
       updated_at = now()
 where content like '%nhadat.cc%';
