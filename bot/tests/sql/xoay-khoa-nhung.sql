-- xoay-khoa-nhung.sql — vòng khoá Gemini cho nhúng nền (20261018d, SRS-5.1zzzzzzz34). 429 → đổi khoá kế; đổi đủ vòng mới trả false
-- (để nhung_tick / nhung_dia_danh_tick dừng như cũ); khoá chính GEMINI_API_KEY không nằm trong vòng. Đỏ khi bỏ hai hàm hoặc
-- khi vòng đổi sai thứ tự. Vault giả bằng get_secret thay tạm trong giao dịch; rollback cuối.
begin;
set local client_min_messages = warning;
create or replace function public.get_secret(secret_name text) returns text language sql as $$
  select case secret_name when 'GEMINI_API_KEY' then 'k1' when 'GEMINI_API_KEY_2' then 'k2' when 'GEMINI_API_KEY_3' then 'k3'
    when 'GEMINI_NHUNG_4' then 'k4' when 'GEMINI_NHUNG_5' then 'k5' when 'GEMINI_NHUNG_6' then 'k6' end $$;
insert into app_config (key, value) values
  ('nhung_khoa_ds', 'GEMINI_API_KEY_2,GEMINI_API_KEY_3,GEMINI_NHUNG_4,GEMINI_NHUNG_5,GEMINI_NHUNG_6'),
  ('nhung_khoa_so', '1'), ('nhung_khoa_vong', '0')
on conflict (key) do update set value = excluded.value;
create temp table ca (ten text, co text, mong text) on commit drop;
create function pg_temp.kt(p_ten text, p_co text, p_mong text) returns void language plpgsql as $$
begin insert into ca values (p_ten, coalesce(p_co, 'NULL'), p_mong); end $$;
select pg_temp.kt('khoá đầu vòng là _2 (khoá chính để dành khách)', public.khoa_nhung_nen(), 'k2');
select pg_temp.kt('429 lần 1 → còn khoá', public.nhung_doi_khoa()::text, 'true');
select pg_temp.kt('… sang _3', public.khoa_nhung_nen(), 'k3');
select pg_temp.kt('429 lần 2 → còn khoá', public.nhung_doi_khoa()::text, 'true');
select pg_temp.kt('429 lần 3 → còn khoá', public.nhung_doi_khoa()::text, 'true');
select pg_temp.kt('429 lần 4 → còn khoá, tới khoá mới thứ 3', (public.nhung_doi_khoa()::text) || ' ' || public.khoa_nhung_nen(), 'true k6');
select pg_temp.kt('429 lần 5 = đủ vòng → false (dừng), quay về _2', (public.nhung_doi_khoa()::text) || ' ' || public.khoa_nhung_nen(), 'false k2');
select pg_temp.kt('đủ vòng thì bộ đếm vòng về 0', cau_hinh('nhung_khoa_vong'), '0');
update app_config set value = 'GEMINI_KHONG_CO' where key = 'nhung_khoa_ds';
select pg_temp.kt('danh sách hỏng / thiếu secret → lùi về _2', public.khoa_nhung_nen(), 'k2');
select pg_temp.kt('một khoá thì không đổi', public.nhung_doi_khoa()::text, 'false');
do $$ declare r record; n int := 0; begin
  for r in select * from ca where co is distinct from mong loop
    raise warning '✗ %: được "%", mong "%"', r.ten, r.co, r.mong; n := n + 1;
  end loop;
  if n > 0 then raise exception '% ca xoay khoá sai', n; end if;
end $$;
rollback;
