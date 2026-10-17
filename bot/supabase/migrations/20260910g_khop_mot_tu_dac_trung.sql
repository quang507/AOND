-- 20260910g — KHỚP TÊN DỰ ÁN BẰNG MỘT TỪ ĐẶC TRƯNG (FR-193 f).
--
-- Đo 10/09 sau khi siết luật ≥3 từ liên tiếp: khách hỏi "The Beverly có mấy loại
-- căn, diện tích bao nhiêu" thì KHÔNG khớp dự án nào — tên trong kho là "The
-- Beverly - Vinhomes Grand Park", bỏ từ chung còn đúng một từ lõi "beverly".
-- Bot đành nói "em chưa nắm chắc" trong khi kho có đủ diện tích từng loại căn.
--
-- Thêm bậc: MỘT từ lõi dài từ 7 ký tự trở lên xuất hiện trong câu cũng đủ.
-- Chọn ngưỡng 7 vì tiếng Việt là ngôn ngữ đơn âm — "nguyen", "phuong",
-- "truong" đều ≤6, nên tên đường và tên người không lọt; còn "beverly",
-- "vinhomes", "centrosa", "masteri" thì lọt. Đây chính là chỗ phân biệt tên
-- riêng của dự án với tên đường trùng chữ.
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
      -- MỘT từ đặc trưng (≥7 ký tự) là đủ: tiếng Việt đơn âm nên tên đường và
      -- tên người không dài tới đó, còn tên riêng dự án thì có.
      (select bool_or(position(' ' || w || ' ' in t.tu) > 0)
         from unnest(string_to_array(btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')), ' ')) w
        where length(w) >= 7 and not (w = any(select unnest(bo) from chung))
      ) as tu_dac_trung,
      (select count(*) from unnest(string_to_array(btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')), ' ')) w
        where length(w) >= 3 and not (w = any(select unnest(bo) from chung))
          and position(' ' || w || ' ' in t.tu) > 0) as so_tu_khop
    from projects p, t
    where length(p.name) >= 4
  )
  select p2.*
  from ung join projects p2 on p2.id = ung.id
  where ung.tron or ung.cum_khop or ung.tu_dac_trung
  order by ung.tron desc, ung.so_tu_khop desc, length(p2.name), p2.priority nulls last, p2.name
  limit 2;
$$;

comment on function public.match_projects(text) is
  'Tìm dự án được nhắc trong câu khách. FR-193 c/d/e/f: so trên chuỗi bỏ dấu; khớp '
  'TRỌN tên, hoặc CỤM LIÊN TIẾP ≥3 từ lõi, hoặc MỘT từ lõi ≥7 ký tự (tên riêng dự án '
  'dài hơn tên đường tiếng Việt). Xếp theo số từ khớp rồi tên ngắn.';
