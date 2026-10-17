-- 20260904e — I5 "NMG hoạt động" đo được (docs/00 §0.5, nghiệm thu 04/09).
--
-- `seller_ranks` chỉ đếm tin; vế "trả lời drip trong 7 ngày" của I5 không có
-- cột nào đo. View này ghép hai vế: NMG có ≥1 tin đang lên kệ VÀ ≥1 câu hỏi
-- nhỏ giọt (`info_requests.source` = 'seller_flow', mặc định của ask-seller) được trả
-- lời trong 7 ngày.
-- Gác cổng như `ctv_ranks`: chỉ service_role hoặc admin đăng nhập (hàm auth.*
-- xét theo phiên người gọi). Không phơi SĐT/Zalo.
create or replace view public.nmg_hoat_dong as
select
  s.id,
  s.name,
  coalesce(t.active, 0)::int  as active_count,
  coalesce(d.tra_loi_7d, 0)::int as drip_answered_7d,
  d.last_answer_at,
  (coalesce(t.active, 0) > 0 and coalesce(d.tra_loi_7d, 0) > 0) as hoat_dong
from public.sellers s
left join lateral (
  select count(*) filter (where l.status in ('dang_ban', 'dang_quan_tam')) as active
  from public.listings l where l.seller_id = s.id
) t on true
left join lateral (
  select count(*) as tra_loi_7d, max(q.answered_at) as last_answer_at
  from public.info_requests q
  join public.listings l on l.id = q.listing_id
  where l.seller_id = s.id
    and q.source in ('seller_flow', 'seller_drip')
    and q.answered_at >= now() - interval '7 days'
) d on true
where s.seller_type = 'nmg'
  and (
    auth.role() = 'service_role'
    or exists (select 1 from public.admins a where a.email = (auth.jwt() ->> 'email'))
  );

revoke all on public.nmg_hoat_dong from public, anon;
grant select on public.nmg_hoat_dong to authenticated, service_role;

comment on view public.nmg_hoat_dong is
  'I5 (docs/00 §0.5): NMG hoat dong = co tin len ke VA tra loi >=1 cau drip trong 7 ngay. Chi admin/service_role doc.';
