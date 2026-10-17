-- 20260911c — "báo lại thứ đã lưu" cho nhánh người bán (chat-reply), kèm hàng
-- rào để bong bóng 💾 không bao giờ thành mẫu câu dạy model.
--
-- Chủ dự án 11/09/2026 (giai đoạn test): "chat một câu là nhắn đã thu thập được
-- gì trong Supabase". Sau khi mọi nhánh đã ghi, bot ĐỌC LẠI dòng tin (và câu
-- trả lời gốc) từ DB rồi gửi kèm một bong bóng 💾 — xem
-- bot/supabase/functions/_shared/bao_lai.ts.
--
-- Giá trị công tắc: tat | thay_doi | day_du. Không có dòng = tat (code mặc định
-- tắt, nên deploy code mà chưa áp migration này thì chưa ai thấy gì).
-- Giai đoạn test đặt day_du. TRƯỚC KHI MỞ CHO KHÁCH THẬT phải đổi về thay_doi
-- hoặc tat: day_du đẻ thêm một bong bóng mỗi lượt và in cả mã tin — trái luật
-- tối đa 2 bong bóng và luật cấm đọc mã tin cho khách.
-- Đổi giá trị: Table Editor → app_config → bao_lai_da_luu. Có hiệu lực lượt kế.

-- ── 1. Công tắc ─────────────────────────────────────────────────────────────
insert into public.app_config (key, value, ghi_chu)
values (
  'bao_lai_da_luu',
  'day_du',
  'Báo lại cho người bán thứ ĐÃ LƯU trong DB sau mỗi lượt. tat | thay_doi (chỉ khi dữ liệu đổi, gắn vào bong bóng cuối, không in mã tin) | day_du (mọi lượt, bong bóng riêng, kèm mã tin + câu trả lời gốc — CHỈ giai đoạn test). Có hiệu lực lượt kế, không cần deploy.'
)
on conflict (key) do nothing;

-- ── 2. Hàng rào mẫu câu ─────────────────────────────────────────────────────
-- Câu chuẩn (FR-180) đi thẳng vào system prompt qua mau_cau_fewshot và vào dữ
-- liệu fine-tune. Bong bóng 💾 là bảng số liệu, không phải lời thoại; một bảng
-- lọt vào mẫu là model học in bảng cho mọi khách. Chặn ở DB vì MỌI đường ghi
-- (màn CRM tin-nhan, màn mau-cau, service_role, script) đều đi qua bảng này —
-- màn CRM chỉ là lớp ngoài. Lúc viết: 0 mẫu nào chứa 💾, nên ràng buộc áp thẳng.
do $d$ begin
  alter table public.mau_cau add constraint mau_cau_khong_bang_bao_lai
    check (position('💾' in cau_chuan) = 0);
exception when duplicate_object then null; end $d$;

-- ── 3. Ngữ cảnh chụp kèm mẫu câu ────────────────────────────────────────────
-- ngu_canh_tin chụp 8 tin trước câu bot để làm ngữ cảnh mẫu và dữ liệu
-- fine-tune (lượt bot → "gpt"). Bỏ các bong bóng 💾 riêng, và cắt đuôi
-- "\n💾…" gắn cuối câu bot ở chế độ thay_doi. Giữ nguyên chữ ký, STABLE,
-- SECURITY DEFINER, search_path; `create or replace` giữ nguyên quyền đã cấp.
create or replace function public.ngu_canh_tin(p_message_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('ai', x.sender, 'noi_dung', x.body,
           'luc', to_char(x.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')) order by x.seq), '[]'::jsonb)
    from (select m2.sender,
                 case when m2.sender = 'bot' then split_part(m2.body, E'\n💾', 1) else m2.body end as body,
                 m2.created_at, m2.seq
            from public.messages m
            join public.messages m2 on m2.conversation_id = m.conversation_id and m2.seq < m.seq
           where m.id = p_message_id
             and not (m2.sender = 'bot' and coalesce(m2.body, '') like '💾%')
           order by m2.seq desc limit 8) x
$function$;
