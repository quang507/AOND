-- 20261125e — SRS-5.1zzzzzzz544 (audit ECC chat Zalo, đợt A).
-- (1) P1-7: parse_vnd đọc "3 tỷ 85" thành 3,085 tỷ (hai chữ số sau tỷ nhân 1e6) — web lệch 765 triệu so với bản tin. Phần lẻ nay lấp nhóm
--     ba chữ số từ trái (1 chữ số = trăm triệu, 2 = chục triệu, 3 = triệu); nhánh triệu cùng luật. TS `docTien` + web `lib/parse-query.ts`
--     cùng luật; ca mới ở `bot/tests/luat/tien.json`. Tin đã lưu tính lại `price_vnd` (trigger `listings_set_price_vnd`).
-- (2) P1-2: bump_user_quota — hệ số ×4 chỉ cho admin / môi giới đã duyệt / người có tin đang hiện; người có dòng `sellers` khác ×2.
-- CREATE OR REPLACE giữ nguyên quyền EXECUTE hiện có.

CREATE OR REPLACE FUNCTION public.parse_vnd(p text)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  t    text;
  m    text[];
  v    numeric;
  ruoi boolean;
  -- 20260928f (FR-241): so viet bang CHU — cung bang, cung thu tu voi luat-tien.ts SO_CHU / soChuThanhSo.
  so_chu text[] := array['một','mốt','mot','hai','ba','bốn','bon','tư','năm','nam','lăm','sáu','sau','bảy','bẩy','bay','tám','tam','chín','chin'];
  so_so  text[] := array['1','1','1','2','3','4','4','4','5','5','5','6','6','7','7','7','8','8','9','9'];
  don_vi text := '(?=\s*(tỷ|tỏi|tỉ|ty|triệu|trieu|củ|trăm|tram)(?![[:alpha:]]))';
  i int;
begin
  if p is null or btrim(p) = '' then return null; end if;
  t := lower(p);
  -- Gia MOI m2 khong phai gia ca can (luat-tien.ts GIA_THEO_M2).
  if t ~ '(tỷ|tỉ|tỏi|triệu|trieu|tr|củ|cu|ty|ti)\s*(/|mỗi|moi|một|mot|1)\s*(m2|m²|mét|met|m\M)' then
    return null;
  end if;
  -- 20260928f (FR-241, bắn thật lx-72 "giá chín tỷ rưỡi"): chữ số → chữ số CHỈ khi đứng ngay trước đơn vị tiền,
  -- hoặc trơ cuối câu ngay sau "tỷ" ("chín tỷ hai"). "năm 2020", "bán năm căn" giữ nguyên.
  -- 20260928g: lọc trước — vòng đổi tốn ~100 lượt regex, mà parse_vnd bị gọi trong hàm quét nhiều dòng; chạy cho mọi câu
  -- làm DB Free quá giờ (bắn lại 28/09). Chỉ chạy khi có chữ số sát đơn vị tiền / sau "tỷ" / "<số> trăm" (luat-tien.ts CO_SO_CHU).
  if t ~ '(một|mốt|mot|hai|ba|bốn|bon|tư|năm|nam|lăm|sáu|sau|bảy|bẩy|bay|tám|tam|chín|chin|mười|muoi|mươi)\s*(tỷ|tỏi|tỉ|ty|triệu|trieu|củ|trăm|tram)(?![[:alpha:]])'
     or t ~ '(tỷ|tỏi|tỉ)\s+(một|mốt|mot|hai|ba|bốn|bon|tư|năm|nam|lăm|sáu|sau|bảy|bẩy|bay|tám|tam|chín|chin|mười|muoi|mươi)(?!\s*[[:alnum:]])'
     or t ~ '[0-9]\s*(trăm|tram)(?![[:alpha:]])' then
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![[:alnum:]])(mười|muoi)\s+' || so_chu[i] || don_vi, '1' || so_so[i], 'g');
    t := regexp_replace(t, '(?<![[:alnum:]])' || so_chu[i] || '\s+(mươi|muoi)(?![[:alpha:]])', so_so[i] || '0', 'g');
  end loop;
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![0-9])([1-9])0\s+' || so_chu[i] || don_vi, '\1' || so_so[i], 'g');
  end loop;
  t := regexp_replace(t, '(?<![[:alnum:]])(mười|muoi)' || don_vi, '10', 'g');
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![[:alnum:]])' || so_chu[i] || don_vi, so_so[i], 'g');
  end loop;
  t := regexp_replace(t, '([0-9])\s*(trăm|tram)(?![[:alpha:]])', '\100', 'g');
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(tỷ|tỏi|tỉ)\s+' || so_chu[i] || '(?!\s*[[:alnum:]])', '\1 ' || so_so[i], 'g');
  end loop;
  end if;
  ruoi := t ~ 'rưỡi|rươi|ruoi';

  t := regexp_replace(t, 'tỏi|tỷ|tỉ|tị|tỹ', ' _ty ', 'g');
  t := regexp_replace(t, 'triệu|trieu|củ',  ' _trieu ', 'g');

  t := regexp_replace(t, '([0-9])\s*t[yi]\s*([0-9])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*tr\s*([0-9])', '\1 _trieu \2', 'g');
  -- 13/09/2026: "1t2l" / "1t 2l" la 1 tret 2 lau, khong phai 1,2 ty (luat-tien.ts).
  t := regexp_replace(t, '([0-9])\s*t\s*([0-9]{1,3})(?![0-9[:alpha:]])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*t[yi]\M',         '\1 _ty ',   'g');
  t := regexp_replace(t, '([0-9])\s*tr\M',         '\1 _trieu ', 'g');
  t := regexp_replace(t, '([0-9])\s*t\M(?!\s*[0-9]+\s*(l|lầu|lau)\M)', '\1 _ty ', 'g');

  -- Phan le sau don vi: "5 ty 5" = 5,5 ty | "3 ty 200" = 3,2 ty.
  -- 20261125e (SRS-5.1zzzzzzz544, audit ECC chat Zalo P1-7): phan le lap nhom ba chu so TU TRAI — "3 ty 85" = 3,85 ty (ban truoc
  -- 3,085 ty: hai chu so nhan 1e6). Nhanh trieu cung luat ("3 trieu 85" = 3,85 trieu). luat-tien.ts docTien cung luat.
  -- Chan hai kieu bat nham: "5 ty 50m2" (dien tich) va viec cat bot chu so
  -- ("50" bi lui ve "5" cho khop) — nen cam ca chu so lan m dung ngay sau.
  -- 20261125c (SRS-5.1zzzzzzz543, audit ECC P2-9): so sau ty ma la so LUONG ("nha 5 ty 2 phong ngu", "4 ty 3 tang")
  -- khong phai phan le — cung danh sach chan cua nhanh trieu; luat-tien.ts docTien cung luat.
  m := regexp_match(t, '([0-9]+)\s*_ty\s*([0-9]{1,3})(?![0-9.,]|\s*(m|phòng|phong|pn|lầu|lau|tầng|tang|tấm|tam|wc|tháng|thang|năm|nam|người|nguoi|căn|can))');
  if m is not null then
    return (m[1]::numeric * 1e9
            + m[2]::numeric * power(10::numeric, 9 - length(m[2])))::bigint;
  end if;

  m := regexp_match(t, '([0-9]+[.,]?[0-9]*)\s*_ty');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric * 1e9;
    if ruoi then v := v + 5e8; end if;
    return v::bigint;
  end if;

  -- Phan le sau trieu: "3 trieu 5" = 3,5 trieu | "3 trieu 500" = 3,5 trieu.
  -- So dung sau ma la so LUONG (thang, phong, m2...) thi khong phai phan le.
  m := regexp_match(t, '([0-9]+)\s*_trieu\s*([0-9]{1,3})(?![0-9.,]|\s*(m2|m²|mét|met|m\M|phòng|phong|pn|lầu|lau|tầng|tang|tấm|tam|wc|tháng|thang|năm|nam|người|nguoi|căn|can))');
  if m is not null then
    return (m[1]::numeric * 1e6
            + m[2]::numeric * power(10::numeric, 6 - length(m[2])))::bigint;
  end if;

  m := regexp_match(t, '([0-9]+[.,]?[0-9]*)\s*_trieu');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric * 1e6;
    if ruoi then v := v + 5e5; end if;
    return v::bigint;
  end if;

  -- 20260927b: số đồng viết đủ ("8.000.000.000", "8000000000"), không mở bằng 0, không phải số đo; 1 triệu..10 nghìn tỷ.
  m := regexp_match(t, '(?<![0-9.,])([1-9][0-9]{0,2}(?:[.,][0-9]{3}){2,}|[1-9][0-9]{6,12})(?![0-9.,]*[0-9])(?!\s*(m2|m²|mét|met|m\M))');
  if m is not null then
    v := regexp_replace(m[1], '[.,]', '', 'g')::numeric;
    if v >= 1e6 and v <= 1e13 then return v::bigint; end if;
  end if;

  return null;
exception when others then
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION public.bump_user_quota(p_uid text, p_gio_limit integer DEFAULT 30, p_ngay_limit integer DEFAULT 120)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_gio   timestamptz := date_trunc('hour', now());
  v_he    integer;
  v_trong_gio integer;
  v_trong_ngay integer;
begin
  if p_uid is null or btrim(p_uid) = '' then
    return true;
  end if;

  -- 20261125e (SRS-5.1zzzzzzz544, audit ECC chat Zalo P1-2): ban truoc moi nguoi co dong `sellers` (lo tao cho bat ky ai nhan so ky gui)
  -- deu x4 = 480 luot/ngay — ba tai khoan la dot het tran chung cua ca he thong. Nay: admin / moi gioi da duyet / nguoi co tin dang
  -- hien x4; nguoi co dong sellers khac x2; con lai x1.
  if exists (select 1 from admins a where a.zalo_user_id = p_uid)
     or exists (select 1 from sellers s
                 where s.zalo_user_id = p_uid
                   and (s.ma_moi_gioi is not null
                        or exists (select 1 from listings l
                                    where l.seller_id = s.id
                                      and l.status in ('dang_ban', 'dang_quan_tam', 'da_coc', 'da_chot')))) then
    v_he := 4;
  elsif exists (select 1 from sellers s where s.zalo_user_id = p_uid) then
    v_he := 2;
  else
    v_he := 1;
  end if;

  insert into chat_quota (zalo_user_id, gio, calls)
  values (p_uid, v_gio, 1)
  on conflict (zalo_user_id, gio) do update set calls = chat_quota.calls + 1
  returning calls into v_trong_gio;

  select coalesce(sum(calls), 0) into v_trong_ngay
  from chat_quota
  where zalo_user_id = p_uid and gio > now() - interval '24 hours';

  delete from chat_quota where zalo_user_id = p_uid and gio < now() - interval '48 hours';
  if random() < 0.01 then
    delete from chat_quota where gio < now() - interval '48 hours';
  end if;

  if v_trong_gio > p_gio_limit * v_he or v_trong_ngay > p_ngay_limit * v_he then
    return false;
  end if;
  return true;
end $function$
;

-- Tin đã lưu: tính lại giá theo luật mới (chạm `price_raw` để trigger `listings_set_price_vnd` chạy; chỉ dòng lệch).
update public.listings
   set price_raw = price_raw
 where price_raw is not null
   and price_vnd is distinct from public.parse_vnd(price_raw);
