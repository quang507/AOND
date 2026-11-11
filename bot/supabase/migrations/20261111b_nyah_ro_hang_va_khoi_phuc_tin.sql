-- SRS-5.1zzzzzzz413 (11/11/2026, chủ dự án: "ny'ah phú định còn dư mấy căn mà sao ko thấy … căn 25 26 nữa, thêm vào đi,
-- bữa trước tôi có 2 trăm mấy dự án cho vào để test mà đâu hết rồi"). ĐÃ ÁP trên DB thật 11/11.
--
-- 1. Rổ hàng Ny'ah Phú Định (`du_an_kien_thuc` khoá 'ny ah phú định'): danh mục 50 căn dựng lại từ "50 lo - Bang chuan, So do & Gia tung lo.md"
--    (OneDrive NPD mktg …/ChatBotData_Upload/01_NyAh-PhuDinh/). Bản cũ (đọc ảnh 20/10) thiếu lô 25, 26, ghi sai mẫu nhà, không giá.
--    Mỗi căn: mau_nha, vi_tri, so_tang, thang_may, dien_tich_dat (đất THỰC nếu có), dien_tich_san, mat_tien, huong, tinh_trang
--    ("còn trống (rổ hàng T10.2026)" / "đã bán"), gia + dien_tich_dat_so_do + ghi_chu bán cặp cho 9 lô còn trống:
--    01, 02, 03, 23, 24, 25, 26, 42, 50. Tài liệu markdown: thay mục "Phân lô theo rổ hàng" bằng "Rổ hàng T10.2026", điền Cosmo Gen 2
--    và Signature (hết ⚠). Dữ liệu giá KHÔNG chép vào repo công khai — nguồn là file OneDrive trên, nạp lại bằng script tạm.
--
-- 2. Khôi phục tin thử: nút admin "Xoá hết khách + rổ hàng" (lần xoá 12, 11/11 13:33) đã xoá 243 tin rao mẫu + 5 người bán.
--    Khôi phục từ `luu_tru.ban_ghi` CHỈ sellers / listings / listing_noi_bo (không khôi phục hội thoại, tin nhắn cũ — giữ cuộc chat
--    test đang chạy). Kết quả: 244 tin (242 đang bán), 0 tin mồ côi.
begin;
set local session_replication_role = replica;
do $$
declare t text; v_cot text; v_r text;
begin
  foreach t in array array['sellers', 'listings', 'listing_noi_bo'] loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum), string_agg('r.' || quote_ident(a.attname), ', ' order by a.attnum)
      into v_cot, v_r from pg_attribute a
     where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    execute format('insert into public.%I (%s) select %s from luu_tru.ban_ghi b, jsonb_populate_record(null::public.%I, b.du_lieu) r
        where b.lan = 12 and b.bang = %L on conflict do nothing', t, v_cot, v_r, t, t);
  end loop;
end $$;
update luu_tru.lan_xoa set khoi_phuc_luc = now() where lan = 12;
commit;
