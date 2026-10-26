-- 20261026e_so_zalo_tu_van_cau_mau — Số Zalo thứ hai: tư vấn người mua (SRS-5.1zzzzzzz210, chủ dự án 26/10/2026: "1 số điện thoại nhận đầu vào kí gửi 1 số điện thoại
-- nhận đầu ra tư vấn người mua"; "số hiện tại làm số ký gửi, nhắn nhầm vẫn trả lời, tin nội bộ và nhắc người bán vẫn đi từ số hiện tại";
-- "đặt trên VPS"). Bridge thứ hai (`SO_NHAN=tu_van`) chạy cạnh bridge cũ trên cùng VPS.
-- 1) `bridge_dang_nhap` thêm dòng id = 2 cho số tư vấn — trạng thái đăng nhập + ảnh QR của hai số không đè nhau trên /admin.
-- 2) `yeu_cau_quet_lai_zalo(p_id)` — nút "Đăng nhập lại" chọn đúng số. Bỏ bản không tham số để không có hai chữ ký (PGRST203); gọi không
--    tham số vẫn ra số ký gửi (mặc định 1), web cũ không vỡ.
-- 3) Câu mẫu `chao_tu_van` — lời chào lượt đầu ở số tư vấn (chỉ hỏi chuyện tìm mua / thuê).

alter table public.bridge_dang_nhap drop constraint if exists bridge_dang_nhap_id_check;
alter table public.bridge_dang_nhap add constraint bridge_dang_nhap_id_check check (id in (1, 2));
insert into public.bridge_dang_nhap (id) values (1), (2) on conflict (id) do nothing;
comment on column public.bridge_dang_nhap.id is
  '1 = số Zalo ký gửi (số cũ, nhận tin người bán, gửi tin nội bộ + nhắc người bán); 2 = số Zalo tư vấn người mua (SRS-5.1zzzzzzz210)';

drop function if exists public.yeu_cau_quet_lai_zalo();
create or replace function public.yeu_cau_quet_lai_zalo(p_id smallint default 1)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;
  if p_id is null or p_id not in (1, 2) then
    raise exception 'p_id phai la 1 (so ky gui) hoac 2 (so tu van)' using errcode = '22023';
  end if;
  update public.bridge_dang_nhap
     set yeu_cau_quet_lai = true,
         ghi_chu = 'yêu cầu đăng nhập lại từ /admin (' ||
                   coalesce((select auth.jwt()) ->> 'email', 'service_role') || ')',
         cap_nhat = now()
   where id = p_id;
end $function$;
comment on function public.yeu_cau_quet_lai_zalo(smallint) is
  'Nút "Đăng nhập lại" ở /admin: đánh dấu bridge số p_id (1 ký gửi, 2 tư vấn) bỏ phiên và vào luồng QR (FR-203, SRS-5.1zzzzzzz210)';
revoke all on function public.yeu_cau_quet_lai_zalo(smallint) from public, anon, authenticated;
grant execute on function public.yeu_cau_quet_lai_zalo(smallint) to authenticated;
grant execute on function public.yeu_cau_quet_lai_zalo(smallint) to service_role;

insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('chao_tu_van', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
{Goi} đang tìm mua hay thuê căn chung cư, nhà phố hay đất ở khu vực nào vậy ạ?', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
{Goi} đang tìm mua hay thuê căn chung cư, nhà phố hay đất ở khu vực nào vậy ạ?', 'Khách chào lần đầu ở số Zalo TƯ VẤN người mua. {ten} = tên trợ lý', 'SRS-5.1zzzzzzz210 · chủ dự án 26/10: một số nhận ký gửi, một số tư vấn người mua', 40)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
