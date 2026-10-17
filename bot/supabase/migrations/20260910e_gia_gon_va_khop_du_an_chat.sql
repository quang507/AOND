-- 20260910e — GIÁ GỌN LẠI, KHỚP DỰ ÁN CHẶT LẠI (FR-193 e).
--
-- HAI LỖI BẮT ĐƯỢC Ở LƯỢT BẮN 15 TIN, 10/09/2026:
--
-- (1) GIÁ NUỐT CẢ CÂU. Chủ nhà gõ không dấu "gia 3 ty 2, so hong roi" trả lời
--     câu hỏi giá → `nhan_fact` gọi `chuan_hoa_gia_raw` và hàm này chỉ biết cắt
--     mấy tiểu từ ở ĐUÔI ("nha", "nhé", "ạ"). Cả câu vào cột, nên bản nháp gửi
--     cho khách in ra "💰 Giá: gia 3 ty 2, so hong roi". Nay hàm BÓC đúng cụm
--     giá đầu tiên trong câu ("3 ty 2"), chỉ giữ nguyên câu khi không bóc được
--     cụm nào mà `parse_vnd` vẫn ra số (để không làm hỏng ca cũ).
--
-- (2) KHỚP DỰ ÁN QUÁ RỘNG → SAI QUẬN/PHƯỜNG. Luật khớp theo từ (`20260910d`)
--     nhận ≥2 từ lõi rải rác trong câu. Hệ quả đo được:
--       · "Bán nhà hẻm 8m 125 Nguyễn Trãi phường 8 quận 5" → gán "Chung Cư
--         Nguyễn Trãi" (chỉ vì trùng tên đường);
--       · "cho thuê kho xưởng 1200m2 ở Bình Chánh giá 80 triệu/tháng" → gán
--         "Bcons Bình Thắng", vì "binh" khớp "Bình Chánh" và "thang" khớp
--         "tháng" — rồi tin lấy luôn PHƯỜNG của dự án đó.
--     Gán nhầm dự án tệ hơn không gán: nó ghi sai địa bàn vào kho hàng.
--     Nay bậc 2 đòi một CỤM LIÊN TIẾP ≥3 từ lõi đúng thứ tự trong tên. "Vinhomes
--     Grand Park" (3 từ) vẫn ra; "Nguyễn Trãi" (2 từ) và "Bình Thắng" thì không.

-- Ba chi tiết phải nhớ khi đọc hàm dưới (đo xong mới biết):
--   · Ranh giới từ trong Postgres viết là backslash-y; backslash-b là ký tự backspace,
--     dùng nhầm thì cụm giá không bao giờ khớp.
--   · Xếp hạng dự án theo SỐ TỪ KHỚP trước, rồi mới tới tên ngắn — nếu ngược lại thì
--     "cát tường phú sinh" ra "Cát Tường Phú Hòa" chỉ vì tên đó ngắn hơn.
--   · "park/plaza/center" là từ LÕI, không phải từ chung; bỏ chúng đi thì
--     "Vinhomes Grand Park" chỉ còn 2 từ lõi và trượt luật ≥3.

create or replace function public.chuan_hoa_gia_raw(p_text text)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  s   text := btrim(coalesce(p_text, ''));
  goc bigint := public.parse_vnd(p_text);
  t   text;
  m   text[];
  cum text;
begin
  if s = '' then return null; end if;

  t := public.bo_dau(s);
  m := regexp_match(t, '([0-9][0-9.,]*\s*(?:ty|ti|toi|trieu|tr|cu)\y(?:\s*[0-9]+)?(?:\s*/\s*(?:thang|nam|m2))?)');
  if m is not null then
    cum := btrim(substring(s from position(m[1] in t) for length(m[1])));
    if cum <> '' and public.parse_vnd(cum) is not null then
      return cum;
    end if;
  end if;

  loop
    t := public.bo_dau(s);
    m := regexp_match(
      t,
      '([[:space:],]+(nha|nhe|nhen|nhak|nho|a|ah|oi|em|anh|chi|do|day|luon|thoi|ok|nghen|he))$'
    );
    exit when m is null;
    s := btrim(substring(s from 1 for length(s) - length(m[1])));
    exit when s = '';
  end loop;

  if s = '' then return btrim(p_text); end if;
  if public.parse_vnd(s) is distinct from goc then return btrim(p_text); end if;
  return s;
end;
$$;

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
      (select count(*) from unnest(string_to_array(btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')), ' ')) w
        where length(w) >= 3 and not (w = any(select unnest(bo) from chung))
          and position(' ' || w || ' ' in t.tu) > 0) as so_tu_khop
    from projects p, t
    where length(p.name) >= 4
  )
  select p2.*
  from ung join projects p2 on p2.id = ung.id
  where ung.tron or ung.cum_khop
  order by ung.tron desc, ung.so_tu_khop desc, length(p2.name), p2.priority nulls last, p2.name
  limit 2;
$$;

comment on function public.match_projects(text) is
  'Tìm dự án được nhắc trong câu khách. FR-193 c/d/e: so trên chuỗi bỏ dấu; khớp '
  'TRỌN tên (kể cả viết liền, kể cả slug) hoặc một CỤM LIÊN TIẾP ≥3 từ lõi; xếp theo '
  'SỐ TỪ KHỚP trước rồi mới tới tên ngắn. Rải rác không tính — gán nhầm dự án ghi sai '
  'quận/phường vào kho hàng, tệ hơn không gán.';
