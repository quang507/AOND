-- SRS-5.1zzzzzzz472 (13/11/2026) — chủ dự án: "tin debug $$$$$ trên crm để cho thấy luôn đi". Tin phụ chế độ test (che_do_test.chu_thich:
-- đã trích xuất · bỏ · điểm / soạn nháp / hỏi tiếp · tốn $) trước đây chỉ gửi Zalo, không vào CRM. Nay lưu kèm dòng lời bot của lượt đó.
-- Đọc theo RLS sẵn có của messages (chỉ admin). Không vào lịch sử hội thoại bot đọc lại (supabase_store chỉ đọc body).
alter table public.messages add column if not exists ghi_chu_test text;
comment on column public.messages.ghi_chu_test is 'Tin phụ $$$$$ của lượt (công tắc AIOI_DONG_TRICH_XUAT) — chỉ hiện ở /admin/tin-nhan (SRS-5.1zzzzzzz472).';
