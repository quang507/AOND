-- 20261021g — Thông tin RIÊNG của chủ nhà, tách khỏi `listings.boc_tach` (SRS-5.1zzzzzzz116). Chủ dự án 21/10/2026 gửi bộ câu môi giới
-- hỏi chủ nhà (người đứng tên sổ, lý do bán / bán gấp, khung giờ dẫn khách xem, ai giữ chìa khoá…). Soát cùng ngày: `boc_tach` của tin
-- đang bán ĐỌC CÔNG KHAI qua API (policy anon_read_listings, trang tin đọc cột này) — lý do bán gấp lọt tới người mua là chủ mất thế
-- thương lượng. Lõi Python ghi các ô này vào bảng riêng dưới đây (schema.O_NOI_BO), chỉ admin đọc; service_role (lõi) ghi.

create table if not exists public.listing_noi_bo (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  du_lieu jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
comment on table public.listing_noi_bo is '[RỔ HÀNG] Thông tin RIÊNG của chủ nhà theo tin (người đứng tên sổ, lý do bán / mức gấp, giờ dẫn khách xem, ai giữ chìa khoá — schema.O_NOI_BO của lõi Python). Không lên web, không vào bản tin; chỉ admin đọc. SĐT trong giá trị bị che lúc ghi.';
comment on column public.listing_noi_bo.du_lieu is 'Ô riêng: khoá dung_ten_so · ly_do_ban · gio_xem · chia_khoa → chữ khách nói (đã qua cổng bằng chứng của lõi).';

alter table public.listing_noi_bo enable row level security;
-- View / bảng mới ở project này mặc định LỘ (alter default privileges cấp sẵn cho anon, authenticated) — revoke trước rồi mới grant.
revoke all on public.listing_noi_bo from anon, authenticated;
grant select on public.listing_noi_bo to authenticated;
grant all on public.listing_noi_bo to service_role;
drop policy if exists listing_noi_bo_admin_read on public.listing_noi_bo;
create policy listing_noi_bo_admin_read on public.listing_noi_bo as permissive for select to authenticated using (public.la_admin());

-- Nút "Xoá hàng loạt" chép mọi bảng dữ liệu khách sang `luu_tru` trước khi xoá, và khôi phục theo cùng danh sách (20260929b) — thêm bảng
-- mới vào cả hai, không thì xoá rồi khôi phục là mất ô riêng (xoá tin kéo theo dòng này qua on delete cascade).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.admin_xoa_het_khach_va_ro_hang(text)'::regprocedure);
  if position('''listing_noi_bo''' in d) = 0 then
    d := replace(d, '''curated_lists'', ''chat_quota''] loop', '''curated_lists'', ''chat_quota'', ''listing_noi_bo''] loop');
    if position('''listing_noi_bo''' in d) = 0 then
      raise exception 'admin_xoa_het_khach_va_ro_hang: không thấy danh sách bảng để thêm listing_noi_bo';
    end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.admin_khoi_phuc_lan_xoa(bigint)'::regprocedure);
  if position('''listing_noi_bo''' in d) = 0 then
    d := replace(d, '''chat_quota'', ''reminders''] loop', '''chat_quota'', ''reminders'', ''listing_noi_bo''] loop');
    if position('''listing_noi_bo''' in d) = 0 then
      raise exception 'admin_khoi_phuc_lan_xoa: không thấy danh sách bảng để thêm listing_noi_bo';
    end if;
    execute d;
  end if;
end $$;
