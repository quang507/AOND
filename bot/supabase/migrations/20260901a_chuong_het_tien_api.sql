-- 20260901a — Chuông báo HẾT TIỀN API
--
-- ⚠️ BẢN NÀY CÓ LỖI, ĐÃ ĐƯỢC `20260901c` THAY THẾ CÙNG NGÀY. Điều kiện lọc dưới
-- đây so `new.status_code = 402` mà không bọc `coalesce`, nên với cột rỗng thì
-- cả mệnh đề ra NULL, `not NULL` cũng NULL, `if` không chạy và chuông kêu trên
-- MỌI lỗi. Giữ file này nguyên trạng làm chứng tích; muốn đọc hàm đang chạy thật
-- thì mở `20260901c`.
--
-- VÌ SAO CẦN. Ngày 28/08 sổ `bot_errors` có 9 dòng `chat-reply model` với nội
-- dung "Your credit balance is too low to access the Anthropic API". Nghĩa là
-- bộ não CÂM HOÀN TOÀN: mọi tin khách nhắn vào đều không có câu trả lời. Nhưng
-- nó nằm lẫn giữa các dòng lỗi khác, cùng một nguồn tên `chat-reply model` như
-- lỗi model thường ngày, nên chẳng có gì phân biệt "model trả lời hơi kỳ" với
-- "hệ thống chết vì hết tiền". Không ai biết cho tới lúc mở trang /admin ngó.
--
-- BA QUYẾT ĐỊNH THIẾT KẾ, nói rõ để người sau khỏi sửa nhầm:
--
-- 1. Làm bằng TRIGGER trên `bot_errors`, không sửa edge function.
--    Mọi lỗi đều đã chảy qua bảng này rồi. Bắt ở đây thì không phải deploy lại
--    hàm nào — mà deploy qua công cụ hiện tại là chép tay cả file, tỷ lệ sai
--    khoảng một ký tự mỗi 7KB (xem bot/README §29/08). Đổi một dòng SQL an toàn
--    hơn nhiều so với chép lại 57KB TypeScript.
--
-- 2. GHI THẲNG vào `bot_errors`, KHÔNG đi qua `log_loi`.
--    `log_loi` có hai van chặn ngập sổ: 20 dòng/nguồn/giờ và 200 dòng/giờ tổng.
--    Van đó đúng cho lỗi thường. Nhưng chuông báo sập hệ thống mà bị van chặn
--    đúng lúc sổ đang ngập thì vô dụng — mà sổ ngập chính là lúc dễ có sự cố
--    lớn nhất. Nên chuông này đi cửa riêng.
--
-- 3. KHÔNG tạo lời nhắc escalation.
--    Đường escalation đi qua cầu nối chạy trên máy chủ dự án. Cầu nối đang chết
--    từ 27/08, và hệ quả là 83 dòng cảnh báo "cầu nối đang im" xếp hàng chờ
--    chính cái cầu nối đang im để được gửi đi — cảnh báo về X mà lại phải nhờ X
--    chuyển giúp. Chuông hết tiền không được rơi vào cùng cái bẫy đó, nên nó chỉ
--    ghi sổ (hiện ở /admin), không đẩy qua cầu nối.
--
-- TỰ HÃM NHỊP. Sáu tiếng mới kêu lại một lần. Bài học từ `bo_dem_nhac_treo` mà
-- chính tôi viết hôm 29/08: nó ghi mỗi 30 phút, thành 48 dòng/ngày, và chỉ sau
-- hai ngày đã chiếm gần nửa sổ lỗi — báo động đúng nhưng nhịp sai thì cũng là
-- một dạng làm ngập sổ.

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
  if not (
       lower(coalesce(new.detail,'')) like '%credit balance%'
    or lower(coalesce(new.detail,'')) like '%plans & billing%'
    or lower(coalesce(new.detail,'')) like '%plans and billing%'
    or lower(coalesce(new.detail,'')) like '%insufficient%quota%'
    or lower(coalesce(new.detail,'')) like '%billing%'
    or new.status_code = 402
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

comment on function public.bat_het_tien_api() is
  'Soi mỗi dòng ghi vào bot_errors; thấy dấu hiệu hết tiền API thì dựng một dòng '
  'cảnh báo riêng, tên nguồn HET TIEN API, tối đa 6 giờ một lần. Ghi thẳng, không '
  'qua log_loi, để van chống ngập sổ không nuốt mất chuông.';

drop trigger if exists trg_bot_errors_het_tien on public.bot_errors;
create trigger trg_bot_errors_het_tien
  after insert on public.bot_errors
  for each row execute function public.bat_het_tien_api();

revoke execute on function public.bat_het_tien_api() from public, anon, authenticated;
