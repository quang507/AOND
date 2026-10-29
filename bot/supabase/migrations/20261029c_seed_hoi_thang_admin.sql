-- 20261029c_seed_hoi_thang_admin — SRS-5.1zzzzzzz269 (chủ dự án 29/10/2026: "làm đi, giao thẳng admin luôn"): câu khách hỏi về căn rổ mẫu
-- (`listings.source = 'seed_thu'`, chủ là người bán thử `thu-seed-001` không có Zalo thật) trước đây giao "chủ nhà" hạn 12 giờ — tin nhắn chủ
-- nhà không tới ai, người test chờ ≥ 12 giờ mới thấy admin được báo. Nay giao thẳng admin như tin không có chủ nhà (hạn `admin_han_gio`, 5 giờ).
CREATE OR REPLACE FUNCTION public.route_info_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_seller_zalo text; v_district text; v_source text;
begin
  if new.assignee is not null then return new; end if;
  select s.zalo_user_id, l.district, l.source into v_seller_zalo, v_district, v_source
    from listings l join sellers s on s.id = l.seller_id where l.id = new.listing_id;
  if v_seller_zalo is not null and v_source is distinct from 'seed_thu' then
    new.assignee := 'seller';
    if new.source = 'buyer_ask' then
      new.sla_due_at := now() + make_interval(hours => public.chu_nha_han_gio());
    end if;
    return new;
  end if;
  new.assignee := 'admin';   -- 20261024a: không có chủ nhà trên hệ thống thì giao thẳng admin; 20261029c: căn rổ mẫu cũng vậy
  if new.source = 'buyer_ask' and coalesce(new.question, '') <> 'xac_nhan_lich' then
    new.sla_due_at := now() + make_interval(hours => public.admin_han_gio());   -- 20261028c: hạn admin 5 giờ
  end if;
  return new;
end $function$
;
