-- 20260901c — Vá chuông HẾT TIỀN kêu nhầm trên mọi lỗi không có mã HTTP
--
-- LỖI CỦA CHÍNH TÔI, ÁP HÔM NAY, BẮT ĐƯỢC HÔM NAY. `20260901a` dựng chuông báo
-- hết tiền tài khoản AI. Nó chạy đúng trên mọi ca dương tính, nhưng ca ÂM TÍNH
-- thì hỏng: một lỗi thường ngày KHÔNG có mã HTTP cũng làm chuông kêu.
--
-- GỐC RỄ — logic BA trạng thái của SQL. Điều kiện lọc cũ:
--
--   if not ( …like… or …like… or new.status_code = 402 ) then return null;
--
-- Khi `status_code` rỗng thì `NULL = 402` cho ra **NULL** chứ không phải false.
-- Cả mệnh đề thành `false or false or NULL` = **NULL**, rồi `not NULL` = **NULL**,
-- và `if NULL then` KHÔNG chạy. Nên hàm không return, rơi thẳng xuống nhánh kêu
-- chuông. Đo được ngày 01/09:
--
--   status_code = 500  → không kêu  (đúng: 500 = 402 là false)
--   status_code = NULL → KÊU        (sai)
--
-- VÌ SAO NGHIÊM TRỌNG HƠN VẺ NGOÀI. Gần như mọi dòng trong `bot_errors` đều có
-- `status_code` rỗng — `ghiLoi()` từ edge function không truyền mã. Nghĩa là
-- chuông sẽ kêu 6 tiếng một lần trên lỗi vặt bất kỳ. Một cái chuông kêu sai là
-- một cái chuông người ta thôi nghe, và khi hết tiền thật thì nó nằm lẫn giữa
-- đống báo động giả do chính nó tạo ra — đúng cái bệnh mà `20260901a` được viết
-- ra để chữa.
--
-- BÀI HỌC GHI LẠI. Trong một mệnh đề `or` dùng để LỌC BỎ, mọi vế so sánh với cột
-- cho phép rỗng phải bọc `coalesce`. Kiểm một điều kiện lọc thì ca âm tính quan
-- trọng ngang ca dương tính: `20260901a` đã được thử với dữ liệu hết tiền thật
-- và thấy "chạy đúng", nhưng chưa ai thử một lỗi BÌNH THƯỜNG để xem nó có im
-- không. Nay ca đó là TS-CHUONG-06 (docs/10).

create or replace function public.bat_het_tien_api()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lan_cuoi timestamptz;
  v_noi_dung text;
begin
  -- Không tự soi chính mình — nếu không là đệ quy vô tận.
  if new.source = 'HET TIEN API' then
    return null;
  end if;

  -- Dấu hiệu hết tiền / hết hạn mức thanh toán. Bắt rộng một chút: thà kêu thừa
  -- một lần rồi người ta bỏ qua, còn hơn im lúc bot đang câm.
  --
  -- `coalesce(new.status_code, 0)` là bản vá: thiếu nó thì cột rỗng biến cả mệnh
  -- đề thành NULL và chuông kêu trên MỌI lỗi (xem đầu file).
  if not (
       lower(coalesce(new.detail,'')) like '%credit balance%'
    or lower(coalesce(new.detail,'')) like '%plans & billing%'
    or lower(coalesce(new.detail,'')) like '%plans and billing%'
    or lower(coalesce(new.detail,'')) like '%insufficient%quota%'
    or lower(coalesce(new.detail,'')) like '%billing%'
    or coalesce(new.status_code, 0) = 402
  ) then
    return null;
  end if;

  select max(at) into v_lan_cuoi
    from bot_errors where source = 'HET TIEN API';

  if v_lan_cuoi is not null and v_lan_cuoi > now() - interval '6 hours' then
    return null; -- đã kêu rồi, chưa tới lượt kêu lại
  end if;

  v_noi_dung :=
    '🔴 BỘ NÃO ĐANG CÂM — HẾT TIỀN TÀI KHOẢN AI. Mọi tin khách nhắn vào sẽ KHÔNG '
    || 'có câu trả lời cho tới khi nạp tiền. Vào console.anthropic.com → Plans & '
    || 'Billing để nạp, rồi xem mục Usage để biết khoá nào tiêu hết. '
    || 'Nguồn báo: ' || coalesce(new.source,'?')
    || ' · nguyên văn: ' || left(coalesce(new.detail,''), 200);

  insert into bot_errors (source, status_code, detail)
  values ('HET TIEN API', new.status_code, left(v_noi_dung, 500));

  return null;
exception when others then
  -- Chuông hỏng thì thôi, TUYỆT ĐỐI không được làm hỏng luôn việc ghi lỗi gốc.
  return null;
end $$;

-- Trigger không đổi, vẫn trỏ vào hàm này — `create or replace function` là đủ.
