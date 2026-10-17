-- Bucket `masterdb-raw` — kho bản gốc chưa qua xử lý của masterDB.
--
-- VÌ SAO CÓ: OPEN-47 ghi rằng bucket `listing-public` (1005 file / 148 MB) KHÔNG
-- nằm trong bản sao lưu nào, và dựng lại được chỉ vì `masterDB/` còn trên MỘT Ổ
-- ĐĨA CÁ NHÂN. Đó không phải một quy trình, đó là may mắn. Bucket này là chỗ cất
-- bản gốc lên chỗ có sao lưu của nhà cung cấp, để cái ổ đĩa kia không còn là mắt
-- xích duy nhất.
--
-- KHÁC `listing-public` Ở CHỖ NÀO:
--   listing-public  = ảnh ĐÃ nén (sharp, ngang ≤2500px, q80), phục vụ web, CÔNG KHAI
--   masterdb-raw    = bản GỐC chưa đụng vào, KHÔNG phục vụ ai, RIÊNG TƯ tuyệt đối
-- Đừng trỏ web vào bucket này. Nó không phải CDN, nó là tủ hồ sơ.
--
-- QUYỀN: cố ý KHÔNG viết policy nào cho `anon` lẫn `authenticated`. RLS trên
-- `storage.objects` đang bật, nên không policy = không ai vào được, trừ
-- `service_role` (khoá đó bỏ qua RLS theo thiết kế của Postgres). Đây là chủ đích,
-- không phải quên: bản gốc mang địa chỉ nhà dân và có thể lẫn giấy tờ, đúng ranh
-- giới CLAUDE.md §5. Muốn ai đọc thì phải viết policy MỚI và nói rõ vì sao.
--
-- KHÔNG đặt `allowed_mime_types`: đây là kho lưu trữ, không biết trước sẽ cất gì
-- (jpg, png, heic từ điện thoại, xlsx, pdf). Chặn kiểu file ở đây là tự khoá tay
-- mình lúc cần cất một thứ chưa lường trước. Trần dung lượng 50 MB/file thì giữ,
-- để một lần lỡ tay kéo nhầm video 2 GB không ăn hết hạn mức bậc Free.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('masterdb-raw', 'masterdb-raw', false, 52428800, null)
on conflict (id) do nothing;

-- Chốt: bucket phải RIÊNG TƯ. Nếu ai đó sau này bật `public = true` bằng tay trên
-- dashboard thì migration này không biết — nhưng ít nhất câu dưới bắt được ngay
-- lúc chạy lại, và `soat-truy-vet.sh` không soi được Storage nên đây là chỗ duy
-- nhất nói ra điều đó.
do $$
declare v_public boolean;
begin
  select public into v_public from storage.buckets where id = 'masterdb-raw';
  if v_public is null then
    raise exception 'masterdb-raw: bucket không tồn tại sau khi chèn';
  end if;
  if v_public then
    raise exception 'masterdb-raw: bucket đang CÔNG KHAI — bản gốc có địa chỉ nhà dân (CLAUDE.md §5)';
  end if;
end $$;
