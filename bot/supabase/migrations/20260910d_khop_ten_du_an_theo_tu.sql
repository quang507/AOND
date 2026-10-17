-- 20260910d — KHỚP TÊN DỰ ÁN THEO TỪ, KHÔNG BẮT NÓI ĐỦ TÊN (FR-193 d).
--
-- BẮT ĐƯỢC ngay sau khi nạp 1.643 dự án (10/09/2026): khách nói "Vinhomes Grand
-- Park" thì KHÔNG khớp, vì trong kho tên đầy đủ là "Glory Heights - Vinhomes
-- Grand Park", "The Beverly - Vinhomes Grand Park"… — luật cũ đòi TÊN NẰM TRỌN
-- trong câu khách, mà khách chỉ nói phần lõi. "cát tường phú sinh" cũng trượt vì
-- kho ghi "Cát Tường Phú Sinh Eco City".
--
-- Thêm bậc 2: đếm TỪ. Tên dự án cắt thành từ (bỏ dấu, bỏ từ ngắn và mấy từ chung
-- như "khu", "the", "city"…), khớp khi câu khách chứa ĐỦ ít nhất 2 từ lõi và
-- phủ ≥ 60% số từ lõi của tên. Xếp: khớp trọn tên trước, rồi tới số từ khớp
-- nhiều, rồi tên NGẮN hơn — vì tên ngắn thường là dự án mẹ ("Vinhomes Grand
-- Park") còn tên dài là một toà trong đó; gắn nhầm vào toà cụ thể tệ hơn gắn
-- vào dự án mẹ, và quận/phường thì hai bên như nhau.
--
-- Vẫn `limit 2` như cũ: bên gọi lấy [0] để suy quận/phường, còn toà nào thì hỏi
-- chủ nhà, không đoán.

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
                 'apartment','tower','block','phan','khu','du','an','project','eco','new','and']::text[] as bo
  ),
  ung as (
    select p.*,
      -- khớp TRỌN tên trong câu (bậc 1)
      (position(' ' || btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')) || ' ' in t.tu) > 0
       or (length(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', '', 'g')) >= 6
           and position(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', '', 'g') in t.lien) > 0)
       or (p.slug is not null and length(regexp_replace(p.slug, '[^a-z0-9]+', '', 'g')) >= 6
           and position(regexp_replace(p.slug, '[^a-z0-9]+', '', 'g') in t.lien) > 0)
      ) as tron,
      -- từ lõi của tên và số từ có mặt trong câu (bậc 2)
      (select count(*) from unnest(string_to_array(btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')), ' ')) w
        where length(w) >= 3 and not (w = any(select unnest(bo) from chung))) as so_tu_loi,
      (select count(*) from unnest(string_to_array(btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')), ' ')) w
        where length(w) >= 3 and not (w = any(select unnest(bo) from chung))
          and position(' ' || w || ' ' in t.tu) > 0) as so_tu_khop
    from projects p, t
    where length(p.name) >= 4
  )
  select p2.*
  from ung join projects p2 on p2.id = ung.id
  where ung.tron
     or (ung.so_tu_loi >= 2 and ung.so_tu_khop >= 2 and ung.so_tu_khop::numeric / ung.so_tu_loi >= 0.6)
  order by ung.tron desc, ung.so_tu_khop desc, length(ung.name), ung.priority nulls last, ung.name
  limit 2;
$$;

comment on function public.match_projects(text) is
  'Tìm dự án được nhắc trong câu khách. FR-193 c/d (10/09): so trên chuỗi bỏ dấu, '
  'khớp trọn tên HOẶC khớp theo từ lõi (≥2 từ và ≥60%) để khách nói "Vinhomes Grand '
  'Park" vẫn ra dù kho ghi "Glory Heights - Vinhomes Grand Park"; tên ngắn (dự án mẹ) '
  'xếp trước tên dài (một toà trong đó).';
