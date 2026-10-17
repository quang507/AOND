-- 20261008a — căn hộ: TÊN DỰ ÁN khách nói là câu trả lời vị trí (SRS-5.1zzzs).
--
-- Chủ dự án 08/10/2026: "làm tiếp 4 việc còn lại đi … sửa từ gốc nhé". Bắn thử …kb4thue: "chị có căn hộ Sunrise City cần cho
-- thuê", dự án CHƯA có trong kho → tên chỉ vào fact `du_an_ten`; `listing_missing_facts` chỉ coi vị trí là có khi có
-- `location_raw` / `street` / `project_id` → bot hỏi "căn hộ mình ở đâu" rồi "dự án nào" dù khách vừa nói. SRS-5.1zzzm vá trong
-- code ở MỘT nhánh (tạo tin một căn ghi thêm fact `vi_tri` = tên dự án); nhánh nhiều căn, chia mảnh theo tin, câu trả lời sau
-- và admin không qua chỗ vá đó.
--
-- Sửa ở MỘT chỗ cuối đường ghi: trigger fact → cột `trg_vi_tri_vao_cot` (mọi đường ghi fact đều qua). Fact `du_an_ten` của tin
-- căn hộ (`chung_cu`) mà `location_raw` còn trống → `location_raw` = tên dự án. View thiếu-thông-tin, điểm tin (`diem_tin` đọc
-- `location_raw`) và bản nháp cùng thấy, không phải sửa từng nơi. Không đè địa chỉ đã có; tin không phải căn hộ thì thôi
-- (nhà phố nói tên khu chưa phải địa chỉ). So sánh loại bằng `IS NOT DISTINCT FROM` (bẫy NULL ba trị, 20260925b).
CREATE OR REPLACE FUNCTION public.trg_vi_tri_vao_cot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.question = 'vi_tri' and coalesce(btrim(new.answer), '') <> '' then
    update public.listings
       set location_raw = btrim(new.answer),
           street = case when street is not distinct from public.boc_ten_duong(location_raw) then null else street end
     where id = new.listing_id
       and (coalesce(btrim(location_raw), '') = ''
            or new.source ilike 'admin%' or new.source ilike 'ctv%'
            or not exists (
              select 1 from public.listing_facts f
               where f.listing_id = new.listing_id and f.question = 'vi_tri' and f.id <> new.id
                 and (f.source ilike 'admin%' or f.source ilike 'ctv%')));
  elsif new.question = 'du_an_ten' and coalesce(btrim(new.answer), '') <> '' then
    update public.listings
       set location_raw = btrim(new.answer)
     where id = new.listing_id
       and property_type is not distinct from 'chung_cu'::property_type
       and coalesce(btrim(location_raw), '') = '';
  end if;
  return null;
end $function$
;

revoke all on function public.trg_vi_tri_vao_cot() from public, anon, authenticated;
grant execute on function public.trg_vi_tri_vao_cot() to service_role;
comment on function public.trg_vi_tri_vao_cot() is
  'FR-177 (09/09/2026): fact vi_tri (vị trí cụ thể chủ nhà trả lời) → listings.location_raw khi cột trống, hoặc khi nguồn là admin/CTV. SRS-5.1zzzs (08/10/2026): tin căn hộ — fact du_an_ten (tên dự án khách nói) điền location_raw khi còn trống.';
