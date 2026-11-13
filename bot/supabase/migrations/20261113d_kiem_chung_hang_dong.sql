-- SRS-5.1zzzzzzz466 (sửa 13/11/2026): trần hạng Đồng = nhãn "thông tin cần kiểm chứng thêm", không giữ tin lại
--
-- Chủ dự án 13/11, đọc bản 20261113c (căn thứ 6 nằm ở cho_thong_tin): "không phải là chờ thông tin mà là có thông tin, đem ra dùng nhưng
-- nói rõ là thông tin cần kiểm chứng thêm". Nay căn thứ 6 trở đi của người rao hạng Đồng vẫn lên kệ như mọi căn, gắn
-- `listings.can_kiem_chung = true`: web hiện nhãn, bot phía mua nói kèm, bot phía bán báo chủ nhà lên Bạc là bỏ nhãn.
-- Cùng tinh thần thông tin dự án một người gửi (SRS-5.1zzzzzzz445): có thì dùng, nói rõ chưa chắc.
--
-- Tính lại mỗi lần lõi bot (service_role) ghi một căn đang hiện: đếm căn đang hiện KHÔNG mang nhãn của người đó (trừ căn này); ≥ 5 và hạng
-- `dong` → gắn nhãn, ngược lại bỏ nhãn. Lên Bạc / gỡ bớt căn → lượt ghi kế bỏ nhãn. Admin ghi (không phải service_role) không đổi nhãn.
-- Cột `ly_do_chua_dang` của bản 20261113c bỏ (chưa dòng nào dùng).

alter table public.listings add column if not exists can_kiem_chung boolean not null default false;
comment on column public.listings.can_kiem_chung is
  'SRS-5.1zzzzzzz466: true = căn thứ 6 trở đi của người rao hạng Đồng (SRD §IV.3) — vẫn hiển thị, kèm nhãn "thông tin cần kiểm chứng thêm".';
alter table public.listings drop column if exists ly_do_chua_dang;

CREATE OR REPLACE FUNCTION public.listings_quyet_dinh_dang_tin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_du boolean := public.listing_du_dang_tin(new.price_vnd, new.area_m2, new.ward);
  v_dang_hien int;
begin
  if v_du and new.can_chu_duyet then
    v_du := new.chu_duyet_at is not null;
  end if;
  if v_du and new.status = 'cho_thong_tin' then
    new.status := 'dang_ban';
  elsif not v_du and new.status = 'dang_ban' then
    new.status := 'cho_thong_tin';
  end if;
  -- SRS-5.1zzzzzzz466: hạng Đồng hiển thị bình thường tối đa 5 căn; căn thứ 6 trở đi vẫn lên kệ, gắn nhãn "cần kiểm chứng thêm"
  if new.seller_id is not null and coalesce(auth.role(), '') = 'service_role'
     and new.status in ('dang_ban', 'dang_quan_tam', 'da_coc') then
    begin
      select count(*) into v_dang_hien
        from listings l
       where l.seller_id = new.seller_id and l.id <> new.id and not l.can_kiem_chung
         and l.status in ('dang_ban', 'dang_quan_tam', 'da_coc');
      if v_dang_hien < 5 then
        new.can_kiem_chung := false;
      else
        new.can_kiem_chung := public.hang_theo_diem((public.diem_nguoi_ban(new.seller_id)->>'diem')::int) = 'dong';
      end if;
    exception when others then
      null;   -- tính hạng hỏng thì giữ nhãn như cũ, không chặn ghi tin
    end;
  end if;
  return new;
end $function$
;

revoke all on function public.listings_quyet_dinh_dang_tin() from public, anon, authenticated;
grant execute on function public.listings_quyet_dinh_dang_tin() to service_role;

-- tim_nha: trả cờ cho bot phía mua (thân hàm như schema.sql, thêm một khoá `can_kiem_chung`)
CREATE OR REPLACE FUNCTION public.tim_nha(p_deal text, p_loai text DEFAULT NULL::text, p_gia_max bigint DEFAULT NULL::bigint, p_khu text DEFAULT NULL::text, p_dt_min numeric DEFAULT NULL::numeric, p_pn_min integer DEFAULT NULL::integer, p_xe_hoi boolean DEFAULT false, p_vec double precision[] DEFAULT NULL::double precision[], p_limit integer DEFAULT 3, p_tien_ich text[] DEFAULT NULL::text[], p_tang_min integer DEFAULT NULL::integer)
 RETURNS TABLE(can jsonb, diem numeric, ly_do text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  with chon as (
    select l.*,
      case when nullif(btrim(p_khu), '') is not null
                and (l.ward ilike '%' || btrim(p_khu) || '%' or l.district ilike '%' || btrim(p_khu) || '%'
                     or l.street ilike '%' || btrim(p_khu) || '%') then 3 else 0 end as d_khu,
      case when p_dt_min is not null and l.area_m2 >= p_dt_min then 1 else 0 end as d_dt,
      case when p_pn_min is not null and l.bedrooms >= p_pn_min then 1 else 0 end as d_pn,
      case when p_tang_min is not null and l.floors >= p_tang_min then 1 else 0 end as d_tang,
      case when coalesce(p_xe_hoi, false)
                and (l.access_type::text in ('mat_tien', 'hem_xe_tai', 'hem_xe_hoi') or coalesce(l.car_in_house, false)) then 2 else 0 end as d_xe,
      case when p_vec is not null and l.nhung is not null
           then greatest(0, 1 - (l.nhung <=> (p_vec::extensions.halfvec(768)))) * 4 else 0 end as d_vec,
      case when p_tien_ich is not null and jsonb_typeof(l.tien_ich_gan) = 'array'
           then (select count(*) from jsonb_array_elements(l.tien_ich_gan) t
                  where t->>'loai' = any(p_tien_ich) and coalesce((t->>'m')::numeric, 99999) <= 1000) * 2
           else 0 end as d_ti
      from public.listings l
     where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc')
       and l.deal::text = p_deal
       and (p_loai is null or l.property_type::text = p_loai)
       and (p_gia_max is null or l.price_vnd <= p_gia_max)
  ),
  cham as materialized (
    select c.*, (c.d_khu + c.d_dt + c.d_pn + c.d_tang + c.d_xe + c.d_vec + c.d_ti)::numeric as d_tong from chon c
  ),
  -- SRS-5.1zzzzzzz361: mức khớp của suất cuối cùng — chỉ các căn có mức khớp >= mốc này còn tranh chỗ, nên chỉ tính hạng người rao
  -- cho họ (diem_nguoi_ban chấm mọi tin của người rao — tính cho cả kho thì chậm).
  moc as materialized (
    select d_tong from cham order by d_tong desc, updated_at desc
    offset greatest(1, least(coalesce(p_limit, 3), 10)) - 1 limit 1
  ),
  hang as materialized (
    select t.seller_id, public.hang_so_nguoi_ban(t.seller_id) as hang_so
      from (select distinct seller_id from cham where d_tong >= coalesce((select d_tong from moc), -1)) t
  )
  select jsonb_build_object(
           'id', c.id, 'code', c.code, 'property_type', c.property_type, 'deal', c.deal, 'street', c.street, 'ward', c.ward,
           'district', c.district, 'area_m2', c.area_m2, 'price_raw', c.price_raw, 'price_vnd', c.price_vnd, 'bedrooms', c.bedrooms,
           'floors', c.floors, 'floors_text', c.floors_text, 'legal_status', c.legal_status, 'direction', c.direction,
           'access_type', c.access_type, 'alley_width_m', c.alley_width_m, 'status', c.status, 'tien_ich_gan', c.tien_ich_gan, 'can_kiem_chung', c.can_kiem_chung,
           'chinh_chu', (select s.seller_type = 'ccrb' from public.sellers s where s.id = c.seller_id)) as can,
         (c.d_khu + c.d_dt + c.d_pn + c.d_tang + c.d_xe + c.d_vec + c.d_ti)::numeric as diem,
         nullif(concat_ws('; ',
           case when c.d_khu > 0 then 'đúng khu vực khách chọn'
                when nullif(btrim(p_khu), '') is not null then 'KHÁC khu vực khách chọn' end,
           case when c.d_xe > 0 then 'xe hơi vào được' end,
           case when c.d_dt > 0 then 'đủ diện tích' end,
           case when c.d_pn > 0 then 'đủ phòng ngủ' end,
           case when c.d_tang > 0 then 'đủ số tầng' end,
           case when c.d_ti > 0 then
             (select string_agg('gần ' || (t->>'ten') || ' ~' || (t->>'m') || ' m', ', ' order by (t->>'m')::numeric)
                from jsonb_array_elements(c.tien_ich_gan) t
               where t->>'loai' = any(p_tien_ich) and coalesce((t->>'m')::numeric, 99999) <= 1000) end), '') as ly_do
    from cham c
    left join hang h on h.seller_id is not distinct from c.seller_id
   -- Mức khớp trước; cùng mức khớp thì uy tín người rao (Vàng > Bạc > Đồng — gamification anh Luận: Đồng "xếp cuối luồng ưu tiên");
   -- hạng KHÔNG thắng mức khớp và không ra kết quả (hạng ẩn khỏi khách / web).
   order by c.d_tong desc, coalesce(h.hang_so, 1) desc, c.updated_at desc
   limit greatest(1, least(coalesce(p_limit, 3), 10));
$function$;
