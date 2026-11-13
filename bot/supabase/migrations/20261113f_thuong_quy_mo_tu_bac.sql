-- SRS-5.1zzzzzzz473 · Thưởng quy mô chỉ từ hạng Bạc (SRD §IV.3) — 13/11/2026
--
-- SRD: "Hạng Đồng (< 50đ): Giới hạn 5 căn rao … Hạng Bạc (50 - 79đ): Mở rổ hàng không giới hạn, kích hoạt Thưởng quy mô." Bản cũ nhân
-- hệ số quy mô cho mọi môi giới kể cả hạng Đồng (kế thừa khuôn anh Luận `luan8560/AOND`, nơi `perks_for(DONG).scale_bonus_active=False`
-- được khai báo mà không dùng) → rao đủ 6 căn là lên Bạc, trần 5 căn (SRS-5.1zzzzzzz466) gần như không bao giờ chạm (bắn thử production
-- 13/11: 5 căn 47 điểm → căn thứ 6 lên 61). Nay điểm gốc ≥ 50 mới nhân hệ số. Chủ dự án 13/11: "Sửa theo SRD".

CREATE OR REPLACE FUNCTION public.diem_nguoi_ban(p_seller_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type seller_type;
  v_tb numeric;
  v_n int;
  v_he_so numeric := 1;
  v_ph jsonb;
  v_ph_diem int;
  v_goc numeric;
  v_diem int;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  select seller_type into v_type from sellers where id = p_seller_id;
  if v_type is null then return null; end if;
  select avg((public.diem_tin(l)->>'diem')::numeric), count(*)
    into v_tb, v_n
    from listings l
   where l.seller_id = p_seller_id and l.status in ('dang_ban', 'dang_quan_tam', 'da_coc', 'cho_thong_tin');
  if coalesce(v_n, 0) = 0 then
    return jsonb_build_object('diem', 0, 'diem_tb', 0, 'so_tin', 0, 'he_so', 1, 'diem_phan_hoi', null, 'so_luot_phan_hoi', 0);
  end if;
  v_ph := public.diem_phan_hoi(p_seller_id);
  -- SRS-5.1zzx: dưới 5 lượt chủ động thì chưa đủ để kết luận "kịp thời" → chưa tính (null), dùng 100% hoàn chỉnh.
  v_ph_diem := case when coalesce((v_ph->>'so_luot')::int, 0) >= 5 then (v_ph->>'diem')::int end;
  v_goc := case when v_ph_diem is null then v_tb else 0.5 * v_tb + 0.5 * v_ph_diem end;
  -- SRS-5.1zzzzzzz473 (SRD §IV.3: Bạc "kích hoạt Thưởng quy mô"): điểm gốc từ 50 (đã Bạc) mới nhân hệ số — hạng Đồng
  -- không thoát Đồng bằng cách rao thêm căn.
  if v_type = 'nmg' and v_goc >= 50 then
    v_he_so := 1 + 0.06 * least(v_n, 10)
                 + 0.04 * greatest(least(v_n, 30) - 10, 0)
                 + 0.015 * greatest(v_n - 30, 0);
  end if;
  v_diem := least(100, round(v_goc * v_he_so))::int;
  return jsonb_build_object('diem', v_diem, 'diem_tb', round(v_tb, 1), 'so_tin', v_n, 'he_so', round(v_he_so, 3),
                            'diem_phan_hoi', v_ph_diem, 'so_luot_phan_hoi', coalesce((v_ph->>'so_luot')::int, 0));
end $function$;
