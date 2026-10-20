-- 20261020c — SRS-5.1zzzzzzz86 (bắn thử 3 kịch bản tester 20/10). "Phường Thảo Điền, Quận 2" → chuan_dia_ban trả phường RỖNG (căn
-- Masteri Thảo Điền không lên web; bot hỏi khách "dự án này thuộc phường nào"). Gốc: hai bảng gọi một quận cũ hai kiểu — `phuong_cu`
-- ghi "Thành phố Thủ Đức" / "Thành phố Vũng Tàu" / "Thành phố Bà Rịa" / "Thành phố Phú Mỹ", còn `wards` / `quan_cu` có "Quận 2",
-- "Quận 9", "Quận Thủ Đức", "Vũng Tàu"… và mọi phép so dùng `=`. Quận 2 / 9 / Thủ Đức gộp thành TP Thủ Đức từ 2021 nên khách nói
-- "Quận 2" không bao giờ khớp 38 phường cũ của TP Thủ Đức. Vũng Tàu chạy được chỉ nhờ tên dài "Thành phố Vũng Tàu" thắng ở bước nhận
-- quận. Sửa ở MỘT chỗ: `cung_quan_cu(a, b)` — bỏ tiền tố hành chính, Quận 2 / Quận 9 / Quận Thủ Đức ≡ TP Thủ Đức — và mọi phép so quận
-- cũ giữa các bảng địa bàn đi qua nó: chuan_dia_ban (3 chỗ), tim_duong (ưu tiên đường đúng quận), van_ban_dia_danh (văn bản nhúng của
-- quận). Thân hàm lấy từ schema.sql (bản DB), chỉ thay phép so.

create or replace function public.cung_quan_cu(a text, b text)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $$
  select a is not null and b is not null and (
    with k as (select regexp_replace(public.bo_dau(x), '^(quan|huyen|thanh pho|thi xa|tp)\s+', '') as v from unnest(array[a, b]) x),
         n as (select case when v in ('2', '9', 'thu duc') then 'thu duc' else v end as v from k)
    select count(distinct v) = 1 from n)
$$;

comment on function public.cung_quan_cu(text, text) is
  'Hai tên quận cũ có cùng một quận không (bỏ tiền tố Quận / Huyện / Thành phố / Thị xã; Quận 2, Quận 9, Quận Thủ Đức ≡ TP Thủ Đức). Mọi phép so quận cũ giữa wards / phuong_cu / quan_cu / duong đi qua đây (20261020c, SRS-5.1zzzzzzz86).';

CREATE OR REPLACE FUNCTION public.chuan_dia_ban(p_text text)
 RETURNS TABLE(phuong text, quan_cu text, kieu text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
     where public.cung_quan_cu(p.quan_cu, v_quan) and p.ten = 'Phường ' || v_so::int;
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
     order by (v_quan is not null and public.cung_quan_cu(w.quan_cu, v_quan)) desc, length(w.ten) desc
     limit 1;
    if v_phuong is not null then v_kieu := 'moi'; end if;
  end if;

  -- 2c. Phường cũ gọi tên (có tiền tố) → phường mới.
  if v_phuong is null and v_kieu <> 'mo_ho' then
    select array_agg(distinct w.ten_day_du) into v_moi
      from public.phuong_cu p join public.wards w on w.ten = p.phuong_moi
     where p.ten !~ '^(Phường|Xã|Thị trấn) [0-9]+$'
       and (v_quan is null or public.cung_quan_cu(p.quan_cu, v_quan))
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
$function$
;

CREATE OR REPLACE FUNCTION public.tim_duong(p_ten text, p_quan text DEFAULT NULL::text, p_toi_da integer DEFAULT 2)
 RETURNS TABLE(ten text, khoang_cach integer, quan_cu text[], phuong text[], tinh text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with q as (
    select public.bo_dau(regexp_replace(btrim(coalesce(p_ten, '')), '\s+', ' ', 'g')) as k
  ), c as (
    select d.ten, d.quan_cu, d.phuong, d.tinh,
           levenshtein_less_equal(d.ten_khong_dau, q.k, greatest(coalesce(p_toi_da, 0), 0)) as kc
      from public.duong d, q
     where length(q.k) between 4 and 200
       and d.loai <> 'hem'
       and abs(length(d.ten_khong_dau) - length(q.k)) <= greatest(coalesce(p_toi_da, 0), 0)
  )
  select c.ten,
         min(c.kc)::integer,
         array_remove(array_agg(distinct c.quan_cu), null),
         array_remove(array_agg(distinct c.phuong), ''),
         array_agg(distinct c.tinh)
    from c
   where c.kc <= greatest(coalesce(p_toi_da, 0), 0)
   group by c.ten
   order by min(c.kc),
            (p_quan is not null and bool_or(public.cung_quan_cu(c.quan_cu, p_quan))) desc,
            c.ten
   limit 8;
$function$
;

CREATE OR REPLACE FUNCTION public.van_ban_dia_danh(p_bang text, p_khoa text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_bang
    when 'wards' then (
      select concat_ws('. ',
        w.ten_day_du || ', ' || w.quan_cu || ' (cũ), ' || w.tinh_cu,
        'Tên ngắn: ' || w.ten,
        (select 'Gồm ' || string_agg(p.ten || ' ' || p.quan_cu, ', ' order by p.ten) || ' (trước 07/2025)'
           from public.phuong_cu p where p.phuong_moi = w.ten))
        from public.wards w where w.ten = p_khoa)
    when 'phuong_cu' then (
      select p.ten || ', ' || p.quan_cu || ' (trước 07/2025). Nay thuộc ' || w.ten_day_du || case when p.toan_bo then '' else ' (một phần)' end
        from public.phuong_cu p join public.wards w on w.ten = p.phuong_moi where p.id::text = p_khoa)
    when 'quan_cu' then (
      select q.ten || ' (cũ, trước 07/2025), TP.HCM. Nay gồm các phường: '
             || coalesce((select string_agg(distinct w.ten_day_du, ', ') from public.wards w where public.cung_quan_cu(w.quan_cu, q.ten)), '')
        from public.quan_cu q where q.ten = p_khoa)
    when 'duong' then (
      select concat_ws(', ', case when d.loai = 'duong' then 'Đường ' || d.ten else d.ten end,
                       nullif(d.phuong, ''), case when d.quan_cu is not null then d.quan_cu || ' (cũ)' end, d.tinh)
        from public.duong d where d.id::text = p_khoa)
  end;
$function$
;
