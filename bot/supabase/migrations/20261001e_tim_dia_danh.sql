-- 20261001e: tim_dia_danh(p_ten) — dò MỘT tên khách gõ trong cả bốn từ điển địa danh (01/10/2026).
--
-- Chủ dự án 01/10: "khi nào người ta đưa tên lên thì có thể đó là đường phường xã quận gì đó, vào search được đúng
-- không … làm hàm dò địa danh chung đi". Trước đây mỗi bảng một đường tra riêng: `tim_duong` (chỉ bảng duong), `wards`
-- (ilike đúng chữ), `tim_*_theo_nghia` (vector). Tên trơn ("tay thanh", "go vap", "tan dinh") không biết là đường,
-- phường mới, phường cũ hay quận cũ. Hàm này trả ứng viên ở CẢ BỐN bảng, kèm loại, để code chọn theo ngữ cảnh
-- (`chonDiaDanh`, _shared/extraction/dia-danh.ts). Tìm theo NGHĨA vẫn là `tim_dia_danh_theo_nghia` (code gọi khi đây rỗng).
--
-- khoang_cach: 0 = đúng chữ (bỏ dấu) · 1 = đảo thứ tự chữ ("tây thông hội" ↔ "thông tây hội", chỉ phường/quận) ·
-- 1 + Levenshtein khi tên ≥ 6 ký tự và lệch ≤ p_toi_da. Hẻm (`duong.loai = 'hem'`) không tra ở đây.

create or replace function public.tim_dia_danh(p_ten text, p_toi_da integer default 1)
 returns table(loai text, ten text, ten_day_du text, phuong text, quan_cu text, khoang_cach integer)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with q as (
    select x.k, (select string_agg(w, ' ' order by w) from unnest(string_to_array(x.k, ' ')) w) as ks,
           least(greatest(coalesce(p_toi_da, 1), 0), 2) as toi_da
      from (select regexp_replace(public.bo_dau(btrim(coalesce(p_ten, ''))), '\s+', ' ', 'g') as k) x
  ),
  ung as (
    select 'phuong_moi'::text as loai, w.ten, w.ten_day_du, w.ten_day_du as phuong, w.quan_cu,
           public.bo_dau(w.ten) as k, true as dao
      from public.wards w
    union all
    select 'phuong_cu', p.ten, p.ten || ', ' || p.quan_cu, ww.ten_day_du, p.quan_cu,
           regexp_replace(public.bo_dau(p.ten), '^(phuong|xa|thi tran)\s+', ''), true
      from public.phuong_cu p join public.wards ww on ww.ten = p.phuong_moi
    union all
    select 'quan_cu', qc.ten, qc.ten, null, qc.ten,
           regexp_replace(public.bo_dau(qc.ten), '^(quan|huyen|thanh pho|thi xa)\s+', ''), true
      from public.quan_cu qc
    union all
    -- Một tên đường nằm ở nhiều phường: gộp một dòng; quận chỉ trả khi cả tên đường nằm trong MỘT quận cũ.
    select min(d.loai), d.ten, d.ten, null,
           case when count(distinct d.quan_cu) = 1 then min(d.quan_cu) end, min(d.ten_khong_dau), false
      from public.duong d
     where d.loai <> 'hem'
     group by d.ten
  ),
  kc as (
    select u.loai, u.ten, u.ten_day_du, u.phuong, u.quan_cu,
           case when u.k = q.k then 0
                when u.dao and position(' ' in q.k) > 0
                     and (select string_agg(w, ' ' order by w) from unnest(string_to_array(u.k, ' ')) w) = q.ks then 1
                when length(q.k) >= 6 and abs(length(u.k) - length(q.k)) <= q.toi_da
                     and levenshtein_less_equal(u.k, q.k, q.toi_da) <= q.toi_da
                  then 1 + levenshtein_less_equal(u.k, q.k, q.toi_da)
           end as khoang_cach
      from ung u, q
     where length(q.k) between 3 and 60 and q.k ~ '[a-z]'
       and abs(length(u.k) - length(q.k)) <= greatest(q.toi_da, 0)
  )
  select kc.loai, kc.ten, kc.ten_day_du, kc.phuong, kc.quan_cu, kc.khoang_cach
    from kc
   where kc.khoang_cach is not null
   order by kc.khoang_cach, kc.loai, kc.ten
   limit 20;
$function$;

comment on function public.tim_dia_danh(text, integer) is
  '[BOT & HÀNG ĐỢI] Dò một tên khách gõ trong cả 4 từ điển địa danh (wards, phuong_cu, quan_cu, duong không hẻm). '
  'khoang_cach 0 = đúng chữ bỏ dấu, 1 = đảo chữ (phường/quận), 1+Levenshtein khi tên ≥ 6 ký tự. Code chọn theo ngữ cảnh '
  '(chonDiaDanh, _shared/extraction/dia-danh.ts). 20261001e.';

revoke all on function public.tim_dia_danh(text, integer) from public, anon, authenticated;
grant execute on function public.tim_dia_danh(text, integer) to service_role;
