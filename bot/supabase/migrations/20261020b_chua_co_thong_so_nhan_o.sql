-- 20261020b — SRS-5.1zzzzzzz85. Lõi Python gửi `boc_thong_so` chuỗi "nhãn ô: giá trị"; 10/74 nhãn tự bật cột (nhãn ô thuong_luong
-- "khả năng thương lượng, bớt lộc" → negotiable = true với MỌI giá trị). Lõi đã sửa (supabase_store.NHAN_TRUNG_TINH) nhưng cột đã ghi
-- không tự xoá (save chỉ gửi cột đọc ra được). Đọc lại cờ từ chính giá trị ô (không nhãn) cho tin chat. Đo 20/10: 1 tin thật dính
-- (đất "giá chỉ áp dụng trong tháng 10" → thương lượng); cờ căn góc / thang máy / mặt tiền chưa tin chat nào sai, vẫn đọc lại cho chắc.
update public.listings l set
  negotiable = (public.boc_thong_so(l.boc_tach->>'thuong_luong', l.property_type::text)->>'negotiable')::boolean
where l.source = 'chat_zalo' and l.boc_tach ? 'thuong_luong' and l.negotiable is not null;

update public.listings l set
  corner_lot = (public.boc_thong_so(l.boc_tach->>'can_goc', l.property_type::text)->>'corner_lot')::boolean
where l.source = 'chat_zalo' and l.boc_tach ? 'can_goc' and l.corner_lot is not null;

update public.listings l set
  has_elevator = (public.boc_thong_so(l.boc_tach->>'thang_may', l.property_type::text)->>'has_elevator')::boolean
where l.source = 'chat_zalo' and l.boc_tach ? 'thang_may' and l.has_elevator is not null;

update public.listings l set
  access_type = coalesce(public.boc_thong_so(l.boc_tach->>'lo_gioi_hem', l.property_type::text)->>'access_type', l.access_type)
where l.source = 'chat_zalo' and l.boc_tach ? 'lo_gioi_hem';
