-- 20261018e (SRS-5.1zzzzzzz39): chuẩn hoá địa bàn từ chữ khách gõ — nhận CẢ HAI kiểu: trước gộp ("Phường 1, Quận 5") và sau gộp
-- ("Phường Chợ Quán"). Chủ dự án 18/10: "cột quận trên crm ok, có nên chuẩn hóa là lúc chưa gộp phường và lúc gộp rồi ko, sợ khách
-- nhắn cả 2 kiểu". Lõi Python (supabase_store.save) gọi hàm này để điền `listings.ward` (chỉ wards.ten_day_du, bất biến 5.1zzzzj)
-- và `listings.district` (quận CŨ — cách người mua / người bán vẫn nói, mô hình 2 cấp từ 01/07/2025 không còn quận).
--
-- Trả: phuong (wards.ten_day_du hoặc null), quan_cu (quan_cu.ten hoặc null), kieu:
--   'moi'     phường mới gọi tên ("phường Chợ Quán")
--   'cu'      phường cũ đổi sang phường mới qua phuong_cu ("phường 1 quận 5" → Phường Chợ Quán)
--   'mo_ho'   phường cũ bị chia cho nhiều phường mới → không đoán, để bot hỏi
--   'chi_quan' chỉ nhận ra quận cũ
--   'khong'   không nhận ra gì
-- Luật thà trống: phường gọi bằng TÊN phải có chữ "phường / p / xã / thị trấn" đứng trước (tên phường cũ trùng tên đường: "123
-- Nguyễn Cư Trinh, Q1" không được thành phường Nguyễn Cư Trinh); phường SỐ cần biết quận; quận gọi bằng tên chỉ lấy dòng quan_cu có
-- tiền tố quận / huyện / thành phố / thị xã (không lấy "Bình Dương" — trùng "Đại lộ Bình Dương").
create or replace function public.chuan_dia_ban(p_text text)
returns table(phuong text, quan_cu text, kieu text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  k text := ' ' || btrim(regexp_replace(public.bo_dau(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g')) || ' ';
  v_quan text;
  v_so text;
  v_moi text[];
  v_phuong text;
  v_kieu text := 'khong';
begin
  if length(btrim(k)) < 2 then
    return query select null::text, null::text, 'khong'::text;
    return;
  end if;

  -- 1. Quận cũ: số ("quận 5", "q5", "q.5") hoặc tên có tiền tố trong bảng quan_cu.
  v_so := substring(k from ' (?:quan|q) ?([0-9]{1,2}) ');
  if v_so is not null then
    select qc.ten into v_quan from public.quan_cu qc where qc.ten = 'Quận ' || v_so::int;
  end if;
  if v_quan is null then
    select qc.ten into v_quan
      from public.quan_cu qc
     where public.bo_dau(qc.ten) ~ '^(quan|huyen|thanh pho|thi xa) [a-z]'
       and position(' ' || regexp_replace(public.bo_dau(qc.ten), '^(quan|huyen|thanh pho|thi xa) ', '') || ' ' in k) > 0
     order by length(qc.ten) desc
     limit 1;
  end if;

  -- 2a. Phường cũ đánh số + quận cũ → phường mới.
  v_so := substring(k from ' (?:phuong|p) ?([0-9]{1,2}) ');
  if v_so is not null and v_quan is not null then
    select array_agg(distinct w.ten_day_du) into v_moi
      from public.phuong_cu p join public.wards w on w.ten = p.phuong_moi
     where p.quan_cu = v_quan and p.ten = 'Phường ' || v_so::int;
    if coalesce(array_length(v_moi, 1), 0) = 1 then
      v_phuong := v_moi[1]; v_kieu := 'cu';
    elsif coalesce(array_length(v_moi, 1), 0) > 1 then
      v_kieu := 'mo_ho';
    end if;
  end if;

  -- 2b. Phường mới gọi tên (có tiền tố) — ưu tiên phường thuộc quận cũ vừa nhận ra, tên dài trước.
  if v_phuong is null and v_kieu <> 'mo_ho' then
    select w.ten_day_du into v_phuong
      from public.wards w
     where position(' ' || (case when public.bo_dau(w.ten_day_du) like 'xa %' then 'xa'
                                 when public.bo_dau(w.ten_day_du) like 'dac khu %' then 'dac khu'
                                 else 'phuong' end) || ' ' || public.bo_dau(w.ten) || ' ' in k) > 0
        or position(' p ' || public.bo_dau(w.ten) || ' ' in k) > 0
     order by (v_quan is not null and w.quan_cu = v_quan) desc, length(w.ten) desc
     limit 1;
    if v_phuong is not null then v_kieu := 'moi'; end if;
  end if;

  -- 2c. Phường cũ gọi tên (có tiền tố) → phường mới.
  if v_phuong is null and v_kieu <> 'mo_ho' then
    select array_agg(distinct w.ten_day_du) into v_moi
      from public.phuong_cu p join public.wards w on w.ten = p.phuong_moi
     where p.ten !~ '^(Phường|Xã|Thị trấn) [0-9]+$'
       and (v_quan is null or p.quan_cu = v_quan)
       and (position(' ' || public.bo_dau(p.ten) || ' ' in k) > 0
            or position(' p ' || regexp_replace(public.bo_dau(p.ten), '^(phuong|xa|thi tran) ', '') || ' ' in k) > 0);
    if coalesce(array_length(v_moi, 1), 0) = 1 then
      v_phuong := v_moi[1]; v_kieu := 'cu';
    elsif coalesce(array_length(v_moi, 1), 0) > 1 then
      v_kieu := 'mo_ho';
    end if;
  end if;

  -- 3. Có phường mà chưa có quận → quận cũ của phường đó.
  if v_phuong is not null and v_quan is null then
    select w.quan_cu into v_quan from public.wards w where w.ten_day_du = v_phuong;
  end if;
  if v_kieu = 'khong' and v_quan is not null then v_kieu := 'chi_quan'; end if;

  return query select v_phuong, v_quan, v_kieu;
end;
$function$;

revoke all on function public.chuan_dia_ban(text) from public, anon, authenticated;
grant execute on function public.chuan_dia_ban(text) to service_role;

comment on function public.chuan_dia_ban(text) is
  '[HỆ THỐNG] Chữ địa chỉ khách gõ → (phuong = wards.ten_day_du, quan_cu, kieu moi/cu/mo_ho/chi_quan/khong). Nhận cả kiểu trước gộp '
  '("Phường 1, Quận 5") và sau gộp ("Phường Chợ Quán"); phường cũ bị chia → mo_ho, không đoán. Lõi Python dùng khi ghi listings '
  '(20261018e, SRS-5.1zzzzzzz39).';
