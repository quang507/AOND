-- duyet-ban-nhap.sql — tin từ chat (can_chu_duyet) chỉ lên web khi chu_duyet_at có; xoá dấu duyệt là hạ xuống (20261018k, SRS-5.1zzzzzzz47).
begin;
set local client_min_messages = warning;
alter table listings disable trigger trg_listings_zz_toa_do;
insert into quan_cu (ten) values ('Quận 5') on conflict do nothing;
insert into wards (ten, loai, ten_day_du, quan_cu, don_vi_2025, tinh_cu, nguon)
  values ('Chợ Quán', 'phuong', 'Phường Chợ Quán', 'Quận 5', '{}', 'TP.HCM', 'thu') on conflict do nothing;
insert into sellers (id, zalo_user_id, name, seller_type) values ('00000000-0000-0000-0000-0000000000aa', 'thu-duyet-1', 'Thử', 'ccrb');
insert into listings (seller_id, code, deal, status, price_raw, area_m2, ward, can_chu_duyet)
  values ('00000000-0000-0000-0000-0000000000aa', 'ABCD1234', 'ban', 'cho_thong_tin', '5 tỷ', 60, 'Phường Chợ Quán', true);
do $$ declare s text; begin
  select status into s from listings where code='ABCD1234';
  if s <> 'cho_thong_tin' then raise exception 'chưa duyệt mà đã lên: %', s; end if;
  update listings set chu_duyet_at = now() where code='ABCD1234';
  select status into s from listings where code='ABCD1234';
  if s <> 'dang_ban' then raise exception 'đã duyệt mà chưa lên: % (giá %, phường %)', s, (select price_vnd from listings where code='ABCD1234'), (select ward from listings where code='ABCD1234'); end if;
  update listings set chu_duyet_at = null where code='ABCD1234';
  select status into s from listings where code='ABCD1234';
  if s <> 'cho_thong_tin' then raise exception 'không đồng ý mà vẫn hiện: %', s; end if;
end $$;
rollback;
