-- 20261127a_mua_p1_p2 — SRS-5.1zzzzzzz553 (chủ dự án 27/11/2026: "Sửa P1/P2" — audit ECC chat Zalo 25/11, phía mua; PHIA_MUA vẫn tắt).
-- (1) P1: chủ nhà / admin trả lời hai câu của cùng (khách, căn) liền nhau → trigger cũ HUỶ nhắc `followup` chưa gửi của câu trước (kể cả tin
--     báo chốt lịch), và lõi chỉ đọc câu trả lời mới nhất → câu trước mất. Nay mỗi câu trả lời một nhắc, gắn `reminders.info_request_id`;
--     lõi (`gui_nhac._cau_da_tra`) đọc đúng câu đó. Không huỷ nhắc nào.
-- (2) P1: `tim_nha` so khu bằng `ilike '%Quận 1%'` → ra cả Quận 10 / 11 / 12 rồi gắn "đúng khu vực khách chọn". Nay khớp TRỌN tên khu
--     trên chữ bỏ dấu (số không dính số khác); "Q1", "Q.1", "quận1" đọc như "quan 1". Web đã lọc đúng từ SRS-433.
-- (3) P2: `mark_listing_interest` bỏ sót căn `da_coc` (tim_nha vẫn đưa căn đã cọc) → khách quan tâm căn đã cọc không có dòng `interests`.
-- (4) P2: nhắc `feedback` (hỏi cảm nhận sau xem) chỉ đẻ từ nhắc kind `viewing` đã gửi — không code nào tạo nhắc `viewing`, nên không bao giờ
--     hỏi. Nay lịch chốt có giờ (`viewings.slot`, lõi điền từ giờ AI đọc lúc chốt) → nhắc `feedback` 4 giờ sau buổi xem; đổi giờ thì dời nhắc.
begin;

alter table public.reminders add column if not exists info_request_id uuid references public.info_requests(id) on delete set null;

CREATE OR REPLACE FUNCTION public.info_request_bao_lai_khach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_code text; v_vw uuid;
begin
  if new.status = 'answered' and old.status is distinct from 'answered'
     and new.source = 'buyer_ask' and new.buyer_id is not null then
    select code into v_code from listings where id = new.listing_id;
    -- 20261127a (SRS-553): không huỷ nhắc chưa gửi của cùng (khách, căn) — mỗi câu trả lời một nhắc, gắn đúng câu (info_request_id)
    if coalesce(new.question, '') = 'xac_nhan_lich' then                       -- 20260904f FR-52 · 20261126g: không tự chốt lịch
      select id into v_vw from viewings
       where buyer_id = new.buyer_id and listing_id = new.listing_id
         and status in ('proposed', 'pending', 'confirmed')
       order by created_at desc limit 1;
      insert into reminders (kind, buyer_id, listing_id, viewing_id, info_request_id, due_at, note)
      values ('followup', new.buyer_id, new.listing_id, v_vw, new.id, now(),
        'trả lời lịch xem #' || coalesce(v_code, '?') || ': ' || left(coalesce(new.answer, ''), 200));
    else
      insert into reminders (kind, buyer_id, listing_id, info_request_id, due_at, note)
      values ('followup', new.buyer_id, new.listing_id, new.id, now(),
        'chủ nhà vừa trả lời câu khách hỏi về #' || coalesce(v_code, '?') || ' — "'
        || coalesce(new.question, '') || '": ' || left(coalesce(new.answer, ''), 300));
    end if;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.tim_nha(p_deal text, p_loai text DEFAULT NULL::text, p_gia_max bigint DEFAULT NULL::bigint, p_khu text DEFAULT NULL::text, p_dt_min numeric DEFAULT NULL::numeric, p_pn_min integer DEFAULT NULL::integer, p_xe_hoi boolean DEFAULT false, p_vec double precision[] DEFAULT NULL::double precision[], p_limit integer DEFAULT 3, p_tien_ich text[] DEFAULT NULL::text[], p_tang_min integer DEFAULT NULL::integer)
 RETURNS TABLE(can jsonb, diem numeric, ly_do text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  -- 20261127a (SRS-553): khớp TRỌN tên khu trên chữ bỏ dấu — số không dính số khác ("quan 1" không khớp "quan 10"); "Q1" / "Q.1" → "quan 1".
  with khu as (
    select case when v = '' then null
                else '(^|[^0-9])' || regexp_replace(v, '([.^$|?*+()\[\]{}\\])', '\\\1', 'g') || '([^0-9]|$)' end as mau
      from (select regexp_replace(regexp_replace(btrim(public.bo_dau(coalesce(p_khu, ''))), '\s+', ' ', 'g'),
                                  '^(q|quan)\s*\.?\s*([0-9]{1,2})$', 'quan \2') as v) s
  ),
  chon as (
    select l.*,
      case when k.mau is not null
                and (public.bo_dau(coalesce(l.ward, '')) ~ k.mau or public.bo_dau(coalesce(l.district, '')) ~ k.mau
                     or public.bo_dau(coalesce(l.street, '')) ~ k.mau) then 3 else 0 end as d_khu,
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
      from public.listings l cross join khu k
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
$function$
;

CREATE OR REPLACE FUNCTION public.mark_listing_interest(p_codes text[], p_buyer_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int;
begin
  n := public.mark_listing_interest(p_codes);
  if p_buyer_id is not null then
    insert into interests (buyer_id, listing_id)
    select p_buyer_id, l.id from listings l
     where (l.code = any(p_codes) or l.legacy_code = any(p_codes))
       and l.status in ('dang_ban', 'dang_quan_tam', 'da_coc', 'da_chot')   -- 20261127a (SRS-553): thêm da_coc
    on conflict (buyer_id, listing_id) do update set trang_thai = 'quan_tam', ly_do = null;
  end if;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.viewings_hen_hoi_cam_nhan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_code text;
begin
  -- 20261127a (SRS-553): lịch chốt có giờ → hỏi cảm nhận 4 giờ sau buổi xem (lõi gửi trong khung 8–21 giờ; lịch huỷ thì lõi bỏ nhắc).
  if new.status = 'confirmed' and new.slot is not null and new.buyer_id is not null
     and (old.status is distinct from 'confirmed' or old.slot is distinct from new.slot)
     and new.slot > now() then
    begin
      select code into v_code from listings where id = new.listing_id;
      insert into reminders (kind, buyer_id, listing_id, viewing_id, due_at, note)
      values ('feedback', new.buyer_id, new.listing_id, new.id, new.slot + interval '4 hours',
              'hỏi cảm nhận sau khi xem ' || coalesce('#' || coalesce(v_code, new.listing_code), 'nhà'))
      on conflict (viewing_id) where kind = 'feedback' and viewing_id is not null
      do update set due_at = excluded.due_at where reminders.status = 'pending';
    exception when others then
      perform public.log_loi('viewings_hen_hoi_cam_nhan', left(sqlerrm, 400), null::integer);
    end;
  end if;
  return null;
end $function$
;

drop trigger if exists trg_viewings_hen_hoi_cam_nhan on public.viewings;
CREATE TRIGGER trg_viewings_hen_hoi_cam_nhan AFTER UPDATE OF status, slot ON public.viewings FOR EACH ROW EXECUTE FUNCTION viewings_hen_hoi_cam_nhan();
revoke all on function public.viewings_hen_hoi_cam_nhan() from public, anon, authenticated;
grant execute on function public.viewings_hen_hoi_cam_nhan() to service_role;

commit;
