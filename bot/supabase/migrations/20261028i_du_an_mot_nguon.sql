-- 20261028i — Dữ liệu dự án MỘT NGUỒN (SRS-5.1zzzzzzz249).
-- Chủ dự án 28/10/2026: "gộp 2 cái này là 1 … single source of truth … thông tin dự án lấy từ mogi là thông tin sơ khởi ban đầu, còn sau thì
-- ghi thêm, cả bên mua và bên bán đều truy cập được"; "ai nhắn zalo thì dựa theo hạng đồng bạc vàng để vote cho kiến thức dự án, còn admin
-- nhắn thì ghi thẳng".
-- Trước bản này: `projects` (2.362 dự án, mogi) và `du_an_kien_thuc` (2.352 dòng) giữ HAI bản của cùng dữ kiện — 2.349 dòng kiến thức chỉ là
-- bản chép chủ đầu tư / quận / phường / thông số (khoá `supabase_id`), thiếu tiện ích (1.351 dự án có), pháp lý, bàn giao, mẫu căn (191 dự án)
-- nên phía bán không bao giờ thấy chúng; phía mua lại đọc `projects` + tài liệu theo TÊN.
-- Nay: `projects` là kho chung (nguồn mogi + `thong_tin` = dữ kiện ĐÃ DUYỆT: đủ phiếu theo hạng hoặc admin ghi); `du_an_kien_thuc` chỉ giữ phần
-- học thêm (phiếu chờ, mẫu nhà học được, rổ căn chủ đầu tư, tài liệu) nối `project_id`; dòng chỉ là bản chép mogi bị xoá.

-- 0. Lưu trữ nguyên trạng trước khi đổi (khôi phục được).
create table if not exists luu_tru.du_an_kien_thuc_20261028 as table public.du_an_kien_thuc with no data;
insert into luu_tru.du_an_kien_thuc_20261028 select * from public.du_an_kien_thuc;
revoke all on luu_tru.du_an_kien_thuc_20261028 from anon, authenticated;
comment on table luu_tru.du_an_kien_thuc_20261028 is
  'Bản du_an_kien_thuc trước khi gộp một nguồn (20261028i, SRS-5.1zzzzzzz249) — chỉ để khôi phục.';

-- 1. Kho chung: dữ kiện đã duyệt.
alter table public.projects add column if not exists thong_tin jsonb not null default '{}'::jsonb;
comment on column public.projects.thong_tin is
  'Dữ kiện dự án ĐÃ DUYỆT ngoài nguồn mogi (SRS-5.1zzzzzzz249): {"thuoc_tinh": {nhãn: giá trị}, "tien_ich": [..]}. Lõi Python ghi khi phiếu người bán đủ điểm theo hạng (Đồng 1 / Bạc 2 / Vàng 3, chốt ≥ 6) hoặc admin nói. Phiếu chờ + Zalo ID người nói ở du_an_kien_thuc (riêng tư), không ở đây.';

-- 2. Phần học thêm nối project_id.
alter table public.du_an_kien_thuc add column if not exists project_id uuid unique references public.projects(id) on delete set null;
comment on column public.du_an_kien_thuc.project_id is
  'Dự án trong kho chung `projects` (SRS-5.1zzzzzzz249). NULL = dự án mới chỉ nghe qua chat, chưa có dòng projects (không đẻ dòng web từ lời một người).';
comment on table public.du_an_kien_thuc is
  'Kiến thức dự án lõi Python HỌC THÊM (SRS-5.1zzzzzzz56 / 249): phiếu chờ theo hạng, mẫu nhà học được, rổ căn chủ đầu tư, tài liệu .md, `rieng` (giá bảng giá — không vào prompt). Dữ kiện chung đọc ở projects; chỉ service_role.';

update public.du_an_kien_thuc k set project_id = p.id
  from public.projects p
 where k.project_id is null and p.id::text = k.du_lieu->'attributes'->>'supabase_id';
update public.du_an_kien_thuc k set project_id = p.id
  from public.projects p
 where k.project_id is null and p.name = k.ten
   and not exists (select 1 from public.du_an_kien_thuc k2 where k2.project_id = p.id);

-- 3. Phiếu tài liệu chủ dự án nạp tay 20/10 là nguồn chắc chắn (admin) — thiếu tiền tố nên lõi mới coi là một phiếu thường.
update public.du_an_kien_thuc
   set du_lieu = replace(du_lieu::text, '"tai_lieu_chu_du_an_20261020"', '"chac_chan:tai_lieu_chu_du_an_20261020"')::jsonb
 where du_lieu::text like '%"tai_lieu_chu_du_an_20261020"%';

-- 4. Giá là dữ liệu RIÊNG (chủ dự án 28/10: "dữ liệu riêng như nhà giá bao nhiêu, tầng nào số căn hướng … ghi ở chỗ listing"): giá từng căn
--    và tài liệu bảng giá Ny'ah Phú Định ra khỏi kho chung, giữ ở `rieng` (không vào prompt) để sau nhập thành tin rao.
update public.du_an_kien_thuc k
   set du_lieu = jsonb_set(jsonb_set(k.du_lieu,
         '{units}', (select coalesce(jsonb_agg(u || jsonb_build_object(
             'attrs', (select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb) from jsonb_each(coalesce(u->'attrs', '{}'::jsonb)) a
                        where a.key not like 'gia%' and a.key not like 'ghi_chu_gia%'),
             'votes', (select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb) from jsonb_each(coalesce(u->'votes', '{}'::jsonb)) a
                        where a.key not like 'gia%' and a.key not like 'ghi_chu_gia%'))), '[]'::jsonb)
                     from jsonb_array_elements(coalesce(k.du_lieu->'units', '[]'::jsonb)) u)),
         '{docs}', (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(coalesce(k.du_lieu->'docs', '[]'::jsonb)) d
                     where d->>'kind' is distinct from 'bang_gia'))
       || jsonb_build_object('rieng', jsonb_build_object(
         'gia_can', (select coalesce(jsonb_object_agg(u->>'ma_so_can',
                       (select jsonb_object_agg(a.key, a.value) from jsonb_each(u->'attrs') a where a.key like 'gia%' or a.key like 'ghi_chu_gia%')),
                       '{}'::jsonb)
                     from jsonb_array_elements(coalesce(k.du_lieu->'units', '[]'::jsonb)) u
                     where exists (select 1 from jsonb_each(coalesce(u->'attrs', '{}'::jsonb)) a where a.key like 'gia%' or a.key like 'ghi_chu_gia%')),
         'docs', (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(coalesce(k.du_lieu->'docs', '[]'::jsonb)) d
                  where d->>'kind' = 'bang_gia')))
 where exists (select 1 from jsonb_array_elements(coalesce(k.du_lieu->'units', '[]'::jsonb)) u, jsonb_each(coalesce(u->'attrs', '{}'::jsonb)) a
               where a.key like 'gia%' or a.key like 'ghi_chu_gia%')
    or exists (select 1 from jsonb_array_elements(coalesce(k.du_lieu->'docs', '[]'::jsonb)) d where d->>'kind' = 'bang_gia');

-- 5. Dữ kiện học thêm đã có (thuộc tính ngoài bản chép mogi, tiện ích ngoài cột amenities) lên kho chung `projects.thong_tin`.
update public.projects p
   set thong_tin = jsonb_build_object(
         'thuoc_tinh', (select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb) from jsonb_each(coalesce(k.du_lieu->'attributes', '{}'::jsonb)) a
                        where a.key not in ('supabase_id', 'developer', 'district', 'ward', 'specs') and jsonb_typeof(a.value) = 'string'
                          and a.value #>> '{}' <> ''),
         'tien_ich', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(coalesce(k.du_lieu->'amenities', '[]'::jsonb)) x
                      where not (coalesce(p.amenities, '[]'::jsonb) @> jsonb_build_array(x))))
  from public.du_an_kien_thuc k
 where k.project_id = p.id
   and (exists (select 1 from jsonb_each(coalesce(k.du_lieu->'attributes', '{}'::jsonb)) a
                where a.key not in ('supabase_id', 'developer', 'district', 'ward', 'specs'))
        or jsonb_array_length(coalesce(k.du_lieu->'amenities', '[]'::jsonb)) > 0);

-- 6. Dòng đã nối projects: bỏ thuộc tính / tiện ích (giờ ở projects); dòng chỉ là bản chép mogi (không còn gì học thêm) xoá.
update public.du_an_kien_thuc set du_lieu = du_lieu - 'attributes' - 'amenities' where project_id is not null;
delete from public.du_an_kien_thuc
 where coalesce(du_lieu->'votes', '{}'::jsonb) = '{}'::jsonb
   and coalesce(du_lieu->'units', '[]'::jsonb) = '[]'::jsonb
   and coalesce(du_lieu->'unit_types', '[]'::jsonb) = '[]'::jsonb
   and coalesce(du_lieu->'docs', '[]'::jsonb) = '[]'::jsonb
   and not du_lieu ? 'rieng'
   and (project_id is not null
        or (coalesce(du_lieu->'attributes', '{}'::jsonb) = '{}'::jsonb and coalesce(du_lieu->'amenities', '[]'::jsonb) = '[]'::jsonb));

-- 7. Mã căn của tin rao (`listings.unit_code`, lõi ghi từ ô `ma_so_can` khi tin gắn dự án): hai tin cùng một căn là chuyện thường (bán + cho
--    thuê cùng căn, SRS-5.1zzzzzzz241; hai môi giới cùng rao) — chỉ mục duy nhất làm lần lưu tin thứ hai hỏng. Đổi sang chỉ mục thường.
drop index if exists public.listings_project_unit_uniq;
create index if not exists listings_project_unit_idx on public.listings (project_id, unit_code)
  where project_id is not null and unit_code is not null;
