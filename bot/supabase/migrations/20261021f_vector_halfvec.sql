-- 20261021f — Vector tìm theo nghĩa đổi sang halfvec (nửa độ chính xác) — SRS-5.1zzzzzzz114. Chủ dự án 21/10/2026: "dùng halfvec đi,
-- tôi muốn sau con bot sẽ cover hết các trường hợp người ta chat" — giữ nhúng hết (cả hẻm), bớt dung lượng thay vì bớt dữ liệu.
-- Đo trước khi đổi: DB 293 MB / trần gói Free ~500 MB; riêng `duong` 198 MB (vector 87 MB + chỉ mục HNSW 86 MB), mới nhúng 22.104 /
-- 39.421 dòng và lịch nhung-tick vẫn nhúng tiếp. halfvec = 2 byte / chiều thay vì 4 → vector và chỉ mục còn khoảng một nửa.
-- Chỉ mục HNSW GIỮ: đo trên DB, tìm 40 tên gần nghĩa nhất có chỉ mục ~0,4 s, quét cả bảng ~6,9 s.

-- Một giao dịch: hỏng ở bước nào (kể cả quá giờ) thì DB quay lại nguyên như trước. Đổi kiểu bảng duong (198 MB) chạy quá 60 giây
-- khi thử (MCP cắt) — nới giờ chờ cho riêng giao dịch này; bảng duong bị khoá trong lúc chạy (bot tra tên đường chờ theo).
begin;
set local statement_timeout = '15min';
set local maintenance_work_mem = '64MB';

-- (1) Bỏ chỉ mục cũ (kiểu vector_cosine_ops không dùng được cho cột halfvec).
drop index if exists public.listings_nhung_hnsw;
drop index if exists public.projects_nhung_hnsw;
drop index if exists public.wards_nhung_hnsw;
drop index if exists public.phuong_cu_nhung_hnsw;
drop index if exists public.quan_cu_nhung_hnsw;
drop index if exists public.duong_nhung_hnsw;

-- (2) Đổi kiểu cột — giá trị đã nhúng giữ nguyên (làm tròn về 16 bit), không phải gọi Gemini nhúng lại.
alter table public.listings  alter column nhung type extensions.halfvec(768) using nhung::extensions.halfvec(768);
alter table public.projects  alter column nhung type extensions.halfvec(768) using nhung::extensions.halfvec(768);
alter table public.wards     alter column nhung type extensions.halfvec(768) using nhung::extensions.halfvec(768);
alter table public.phuong_cu alter column nhung type extensions.halfvec(768) using nhung::extensions.halfvec(768);
alter table public.quan_cu   alter column nhung type extensions.halfvec(768) using nhung::extensions.halfvec(768);
alter table public.duong     alter column nhung type extensions.halfvec(768) using nhung::extensions.halfvec(768);

-- (3) Dựng lại chỉ mục HNSW theo halfvec.
create index listings_nhung_hnsw  on public.listings  using hnsw (nhung extensions.halfvec_cosine_ops);
create index projects_nhung_hnsw  on public.projects  using hnsw (nhung extensions.halfvec_cosine_ops);
create index wards_nhung_hnsw     on public.wards     using hnsw (nhung extensions.halfvec_cosine_ops);
create index phuong_cu_nhung_hnsw on public.phuong_cu using hnsw (nhung extensions.halfvec_cosine_ops);
create index quan_cu_nhung_hnsw   on public.quan_cu   using hnsw (nhung extensions.halfvec_cosine_ops);
create index duong_nhung_hnsw     on public.duong     using hnsw (nhung extensions.halfvec_cosine_ops);

-- (4) Hàm ghi / tìm vector: ép kiểu theo halfvec. Sáu hàm (nhung_tick, nhung_dia_danh_tick, tim_tin_theo_nghia, tim_du_an_theo_nghia,
-- tim_phuong_theo_nghia, tim_dia_danh_theo_nghia) chỉ khác ở chỗ ép kiểu — đổi chữ trong thân hàm đang chạy trên DB (DB là bản thật,
-- schema.sql sinh lại từ đó), giữ nguyên quyền và search_path.
do $$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~ 'extensions\.vector'
  loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'extensions.vector(768)', 'extensions.halfvec(768)');
    d := replace(d, '::extensions.vector', '::extensions.halfvec');
    execute d;
  end loop;
end $$;

-- (5) tim_dia_danh_theo_nghia: tra PHƯỜNG (p_loai chỉ có loại phường) vẫn quét chỉ mục bảng duong rồi lọc bỏ hết (~0,4 s thừa mỗi lượt).
-- Thêm điều kiện không đụng cột (p_loai có loại đường / hẻm / số) — Postgres xét một lần, sai thì bỏ hẳn nhánh này.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.tim_dia_danh_theo_nghia(double precision[], text[], double precision, double precision, integer)'::regprocedure);
  if position('p_loai && array[''duong'', ''hem'', ''so'']' in d) = 0 then
    d := replace(d, 'from public.duong d, v where d.nhung is not null and (p_loai is null or d.loai = any(p_loai))',
                    'from public.duong d, v where d.nhung is not null and (p_loai is null or p_loai && array[''duong'', ''hem'', ''so'']::text[])'
                    || ' and (p_loai is null or d.loai = any(p_loai))');
    if position('p_loai && array[''duong'', ''hem'', ''so'']' in d) = 0 then
      raise exception 'tim_dia_danh_theo_nghia: không thấy nhánh duong để thêm điều kiện';
    end if;
    execute d;
  end if;
end $$;

-- (6) Còn sót chỗ nào ép kiểu vector cũ thì dừng (cả migration quay lui).
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~ 'extensions\.vector') then
    raise exception 'còn hàm ép kiểu extensions.vector';
  end if;
end $$;

comment on column public.duong.nhung is 'Vector nghĩa 768 chiều (Gemini gemini-embedding-001, RETRIEVAL_DOCUMENT), kiểu halfvec từ 20261021f. Lịch nhung-dia-danh-tick nuôi; tim_dia_danh_theo_nghia đọc qua chỉ mục duong_nhung_hnsw.';

commit;
