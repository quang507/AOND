-- 20261006c — Điểm phản hồi chỉ đo trên lượt bot CHỦ ĐỘNG nhắn, cần ≥ 5 lượt mới tính vào điểm người rao (06/10/2026, SRS-5.1zzx).
--
-- Ca gốc (bắn thử production 06/10): người bán thử vừa rao căn đầu tiên đã ở hạng Vàng. Tin 74 điểm, điểm phản hồi 100 →
-- (74 + 100) / 2 = 87 ≥ 80. Điểm phản hồi 100 vì `diem_phan_hoi` đếm MỌI lượt bot, kể cả lượt bot trả lời ngay khi chủ nhà
-- đang ngồi chat: lượt nào chủ cũng nhắn tiếp sau vài giây. Lần rao đầu nào cũng vậy, nên gần như ai tin đủ cũng lên Vàng.
--
-- Lớp lỗi: đo "kịp thời" trên lượt mà chính người được đo đang giữ nhịp. Sửa: chỉ đếm lượt bot nhắn khi chủ nhà đã im > 30
-- phút (hỏi bù, "còn bán không", giữ kết nối…) — đó mới là lúc phải "phản hồi". Dưới 5 lượt như vậy thì chưa kết luận, điểm
-- người rao dùng 100% hoàn chỉnh (như trước khi có điểm phản hồi, FR-183).
--
-- Cùng lớp, sửa luôn: hai lượt bot chủ động liền nhau (lượt đầu bị lờ) bị điều kiện "tin kế không phải của bot" loại cả lượt
-- đầu, nên người lờ mọi tin nhắc KHÔNG BAO GIỜ bị điểm 0. Nay lượt bot kết thúc khi tin kế không phải bot HOẶC tin bot kế
-- cách > 5 phút; lượt bị lờ như vậy tính 0 như comment cũ đã định.
create or replace function public.diem_phan_hoi(p_seller_id uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with tin as (
    select m.created_at, m.sender,
           lead(m.sender)     over w as sender_ke,
           lead(m.created_at) over w as luc_ke,
           max(m.created_at) filter (where m.sender = 'seller') over (w rows between unbounded preceding and 1 preceding) as luc_chu_truoc
      from messages m
      join conversations c on c.id = m.conversation_id
     where c.seller_id = p_seller_id
       and m.created_at >= now() - interval '90 days'
    window w as (partition by m.conversation_id order by m.created_at, m.seq)
  ),
  luot as (
    select created_at,
           case when sender_ke = 'seller' then extract(epoch from luc_ke - created_at) / 3600.0 end as gio_tra_loi
      from tin
     where sender = 'bot'
       -- bong bóng cuối của một lượt bot: tin kế không phải của bot, hoặc tin bot kế đã là lượt khác (> 5 phút)
       and (sender_ke is distinct from 'bot' or luc_ke > created_at + interval '5 minutes')
       -- lượt CHỦ ĐỘNG: chủ nhà đã im > 30 phút (lượt bot đáp ngay khi chủ đang chat không đo được gì)
       and (luc_chu_truoc is null or created_at > luc_chu_truoc + interval '30 minutes')
       -- lượt bot mới nhất mà chưa quá 7 ngày và chưa ai trả lời: chưa kết luận, không tính
       and not (sender_ke is null and created_at > now() - interval '7 days')
  ),
  diem as (
    select case
             when gio_tra_loi is null then 0
             when gio_tra_loi <= 1   then 100
             when gio_tra_loi <= 12  then 80
             when gio_tra_loi <= 24  then 60
             when gio_tra_loi <= 72  then 30
             else 0 end as d,
           gio_tra_loi
      from luot
  )
  select case when count(*) = 0 then jsonb_build_object('diem', null, 'so_luot', 0, 'tb_gio', null)
              else jsonb_build_object('diem', round(avg(d))::int, 'so_luot', count(*),
                                      'tb_gio', round(avg(gio_tra_loi)::numeric, 1)) end
    from diem;
$$;
revoke all on function public.diem_phan_hoi(uuid) from public, anon, authenticated;
grant execute on function public.diem_phan_hoi(uuid) to service_role;
comment on function public.diem_phan_hoi(uuid) is
  'SRD §IV.1 (SRS-5.1zzd, đổi 06/10/2026 SRS-5.1zzx): độ KỊP THỜI phản hồi của người bán 0–100, đo theo messages 90 ngày, CHỈ trên lượt bot chủ động (chủ nhà đã im > 30 phút); lượt bị lờ tới lượt bot kế hoặc quá 7 ngày = 0. {diem, so_luot, tb_gio}; diem null = chưa có lượt nào. Chỉ ghi, không nhắn.';

create or replace function public.diem_nguoi_ban(p_seller_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
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
   where l.seller_id = p_seller_id and l.status in ('dang_ban', 'dang_quan_tam', 'cho_thong_tin');
  if coalesce(v_n, 0) = 0 then
    return jsonb_build_object('diem', 0, 'diem_tb', 0, 'so_tin', 0, 'he_so', 1, 'diem_phan_hoi', null, 'so_luot_phan_hoi', 0);
  end if;
  if v_type = 'nmg' then
    v_he_so := 1 + 0.06 * least(v_n, 10)
                 + 0.04 * greatest(least(v_n, 30) - 10, 0)
                 + 0.015 * greatest(v_n - 30, 0);
  end if;
  v_ph := public.diem_phan_hoi(p_seller_id);
  -- SRS-5.1zzx: dưới 5 lượt chủ động thì chưa đủ để kết luận "kịp thời" → chưa tính (null), dùng 100% hoàn chỉnh.
  v_ph_diem := case when coalesce((v_ph->>'so_luot')::int, 0) >= 5 then (v_ph->>'diem')::int end;
  v_goc := case when v_ph_diem is null then v_tb else 0.5 * v_tb + 0.5 * v_ph_diem end;
  v_diem := least(100, round(v_goc * v_he_so))::int;
  return jsonb_build_object('diem', v_diem, 'diem_tb', round(v_tb, 1), 'so_tin', v_n, 'he_so', round(v_he_so, 3),
                            'diem_phan_hoi', v_ph_diem, 'so_luot_phan_hoi', coalesce((v_ph->>'so_luot')::int, 0));
end $$;
comment on function public.diem_nguoi_ban(uuid) is
  'FR-183 + SRD §IV.1 (SRS-5.1zzd, đổi 06/10/2026 SRS-5.1zzx): điểm người rao 0–100 = (50% trung bình diem_tin các tin đang rao + 50% diem_phan_hoi) × hệ số quy mô NMG; diem_phan_hoi chỉ tính khi có ≥ 5 lượt bot chủ động, chưa đủ thì 100% hoàn chỉnh. Trả {diem, diem_tb, so_tin, he_so, diem_phan_hoi, so_luot_phan_hoi}. Chỉ service_role/admin.';
