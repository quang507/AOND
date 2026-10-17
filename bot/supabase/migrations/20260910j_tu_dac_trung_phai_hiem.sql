-- 20260910j — TỪ ĐẶC TRƯNG PHẢI LÀ TỪ HIẾM (FR-193 g).
--
-- Bắt tại trận 10/09/2026 ngay lượt bắn tin sau khi nới luật: khách nhắn "bán
-- căn hộ dự án Lam Sơn Riverside quận 4" thì bot đáp "Em ghi nhận: … dự án An
-- Sơn Riverside". Luật "một từ lõi ≥7 ký tự là đủ" (20260910g) khớp bằng chữ
-- "riverside" — mà "riverside", "residence", "central", "garden" là chữ hàng
-- chục dự án cùng dùng. Gán nhầm rồi ĐỌC TÊN SAI cho khách nghe còn tệ hơn im.
--
-- Luật mới: từ đó phải vừa DÀI (≥7) vừa HIẾM — xuất hiện trong nhiều nhất 3 tên
-- dự án của cả kho. "beverly" có 1, "centrosa" có 1 → nhận; "riverside" có mấy
-- chục → không. Tên nhiều từ như "Vinhomes Grand Park" hay "Masteri Thảo Điền"
-- vẫn vào bằng luật cụm ≥3 từ liên tiếp, không phụ thuộc luật này.
--
-- Tần suất tính ngay trong truy vấn: kho ~1.600 dòng, tách từ ra đếm vẫn rẻ hơn
-- nhiều so với một lượt gọi model, và tự đúng khi kho lớn lên.

create or replace function public.match_projects(p_text text)
returns setof projects
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with t as (
    select
      ' ' || btrim(regexp_replace(public.bo_dau(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g')) || ' ' as tu,
      regexp_replace(public.bo_dau(coalesce(p_text, '')), '[^a-z0-9]+', '', 'g')                       as lien
  ),
  chung as (
    select array['the','khu','can','ho','nha','pho','dat','nen','city','garden','residence',
                 'apartment','tower','block','phan','du','an','project','eco','new','and',
                 'chung','cu','biet','thu','villa','shophouse']::text[] as bo
  ),
  -- Từ lõi của TỪNG dự án (bỏ dấu, bỏ từ chung, ≥3 ký tự).
  tu_du_an as (
    select p.id, w
      from projects p,
           unnest(string_to_array(btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')), ' ')) w
     where length(w) >= 3 and not (w = any(select unnest(bo) from chung))
  ),
  -- Tần suất: từ này có mặt trong bao nhiêu dự án.
  tan_suat as (
    select w, count(distinct id) as so_du_an from tu_du_an group by w
  ),
  ung as (
    select p.id, p.name,
      (position(' ' || btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')) || ' ' in t.tu) > 0
       or (length(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', '', 'g')) >= 6
           and position(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', '', 'g') in t.lien) > 0)
       or (p.slug is not null and length(regexp_replace(p.slug, '[^a-z0-9]+', '', 'g')) >= 6
           and position(regexp_replace(p.slug, '[^a-z0-9]+', '', 'g') in t.lien) > 0)
      ) as tron,
      (select bool_or(position(' ' || cum || ' ' in t.tu) > 0)
         from (
           select array_to_string(w[i:i + 2], ' ') as cum
             from (select (select array_agg(x) from unnest(string_to_array(btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')), ' ')) x
                            where length(x) >= 3 and not (x = any(select unnest(bo) from chung))) as w) q,
                  generate_series(1, greatest(array_length(w, 1) - 2, 0)) i
         ) z
      ) as cum_khop,
      -- MỘT từ vừa dài (≥7) vừa hiếm (≤3 dự án dùng) là đủ.
      (select bool_or(position(' ' || d.w || ' ' in t.tu) > 0)
         from tu_du_an d join tan_suat s on s.w = d.w
        where d.id = p.id and length(d.w) >= 7 and s.so_du_an <= 3
      ) as tu_hiem,
      (select count(*) from tu_du_an d
        where d.id = p.id and position(' ' || d.w || ' ' in t.tu) > 0) as so_tu_khop
    from projects p, t
    where length(p.name) >= 4
  )
  select p2.*
  from ung join projects p2 on p2.id = ung.id
  where ung.tron or ung.cum_khop or ung.tu_hiem
  order by ung.tron desc, ung.so_tu_khop desc, length(p2.name), p2.priority nulls last, p2.name
  limit 2;
$$;

comment on function public.match_projects(text) is
  'Tìm dự án khách nhắc. FR-193 c–g: so trên chuỗi bỏ dấu; khớp TRỌN tên, hoặc CỤM '
  'LIÊN TIẾP ≥3 từ lõi, hoặc MỘT từ vừa dài ≥7 vừa HIẾM (≤3 dự án dùng). Chữ chung như '
  '"riverside" không còn kéo nhầm dự án khác — gán nhầm rồi đọc tên sai cho khách nghe '
  'còn tệ hơn im.';
