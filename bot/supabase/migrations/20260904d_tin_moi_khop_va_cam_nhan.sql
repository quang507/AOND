-- 20260904d — Tin mới khớp tiêu chí (FR-64) + hỏi cảm nhận sau buổi xem (FR-56)
--
-- Nghiệm thu 04/09/2026 (docs/10 §10.8) lộ ba FR có tài liệu mà chưa có code:
-- FR-64 (báo khách khi có tin mới khớp), FR-56 (hỏi cảm nhận sau xem), FR-54
-- (link bản đồ khi nhắc lịch xem). Phần SQL của FR-64 và FR-56 nằm ở đây;
-- FR-54 và phần GỬI của cả ba nằm ở edge `nudge` v24 — nơi DUY NHẤT gửi tin
-- chủ động, đi đúng đường `nhan_viec_nhac` / `bao_hong_nhac` / cửa 8–21h.
--
-- Bám cái đã có, không phát minh đường mới: hai loại việc mới là hai `kind`
-- của `reminders` (`match`, `feedback`), y như `promise`/`viewing`/`followup`.
-- Không dựng bảng `saved_criteria` (SRS-3.8b) — tiêu chí của khách đang nằm ở
-- `buyers.preferences` (chat-reply bóc ra), thêm bảng là thêm một chỗ lệch.
-- Không dựng cron `match_new_listings` 15 phút (SRS-5.3) — trigger trên
-- `listings` bắt ngay lúc tin lên `dang_ban`, rẻ hơn và không có nhịp quét.
--
-- Lịch sử áp: apply_migration 04/09/2026; ngay sau đó thân `bao_tin_moi_khop`
-- được `create or replace` lại một lần (execute_sql) vì bản đầu in "40m2"
-- thành "4m2" (cắt số 0 cuối bằng trim) — file này là bản ĐÃ SỬA, khớp DB.

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) HAI KIND MỚI
-- ═══════════════════════════════════════════════════════════════════════════
-- Soát chỗ liệt kê kind cứng: `nhan_viec_nhac(p_kinds)` nhận mảng từ người gọi;
-- `reminders_mot_reengage_cho_idx` và `nha_viec_nhac`/`bo_dem_nhac_treo` chỉ
-- soi `reengage`/`escalation`/`report`. Không có gì cần đổi ngoài CHECK này.
alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check
  check (kind in ('promise','reengage','viewing','followup','escalation','report',
                  'match','feedback'));

-- Một khách chỉ được báo MỘT lần cho MỘT tin, bất kể trạng thái — trọng tài là
-- index, không phải câu đếm (bất biến 13 FR-166: đọc-rồi-hành-động không đủ).
create unique index if not exists reminders_mot_match_moi_tin_idx
  on public.reminders (buyer_id, listing_id)
  where kind = 'match';

-- Một buổi xem chỉ sinh MỘT câu hỏi cảm nhận.
create unique index if not exists reminders_mot_feedback_moi_buoi_idx
  on public.reminders (viewing_id)
  where kind = 'feedback' and viewing_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) FR-64 — bao_tin_moi_khop(p_listing_id)
-- ═══════════════════════════════════════════════════════════════════════════
-- Chọn khách theo hồ sơ `buyers.preferences` (khoá `deal`/`area`/`budget` do
-- chat-reply bóc — kiểm 04/09 trên DB thật: area "Quận 5", "Quận 8", "156/2A …
-- An Lạc, Bình Tân"; budget "tầm 5 tỷ"; deal "ban"):
--   * có `zalo_user_id` (không có kênh thì không báo được);
--   * `last_contact_at` trong 30 ngày (khách cũ hơn thì Zalo đã tự ngắt, INS-03);
--   * `deal` khớp: khách null → coi là `ban`; "thue"/"cho_thue" ↔ tin `cho_thue`;
--   * khu vực: `area` NÊU số phường thì phải ĐÚNG phường của tin (cùng regex
--     `soPhuong` của chat-reply: "phường 8", "phuong8", "p.8", "P8"); `area`
--     KHÔNG nêu phường thì khớp theo quận/huyện (`district`, so không dấu qua
--     `bo_dau`, "quận 5"/"q5"/"q.5"). Khách nói "phường 8 quận 5" mà tin ở
--     phường 3 quận 5 → KHÔNG khớp: phường nêu ra là điều kiện, quận chỉ là
--     dự phòng khi khách không nói phường. Phường không số ("Nguyễn Cư Trinh")
--     so theo tên không dấu;
--   * ngân sách: `parse_vnd(budget)` nằm trong [0,7× ; 1,15×] giá tin. Không
--     có ngân sách → bỏ qua (thà không báo còn hơn báo căn 20 tỷ cho người
--     chưa nói tiền).
-- Van: mỗi khách tối đa MỘT `match` pending/sent trong 24 giờ (tin chủ động
-- không được thành spam — FR-146 cùng tinh thần), và không quá một cho cùng
-- tin (index trên). Mỗi tin báo tối đa 50 khách gần nhất — trần an toàn, hôm
-- nay kho 173 tin / vài chục khách nên chưa bao giờ chạm.
-- `note` ghép từ CỘT ("#mã · phường, quận · giá · diện tích · đường vào") để
-- `nudge` gửi theo mẫu cố định, KHÔNG gọi model (OPEN-35 nghiêng mẫu câu).
create or replace function public.bao_tin_moi_khop(p_listing_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  l          record;
  v_deal     text;
  v_ward_no  text;
  v_ward_kd  text;
  v_dist_kd  text;
  v_dist_re  text;
  v_note     text;
  v_n        integer := 0;
begin
  select id, code, deal::text as deal, district, ward, price_vnd, price_raw,
         area_m2, access_type, alley_width_m
    into l
    from listings where id = p_listing_id;
  if l.id is null or l.price_vnd is null or l.ward is null or btrim(l.ward) = '' then
    return 0;
  end if;

  v_deal    := coalesce(l.deal, 'ban');
  v_ward_kd := btrim(regexp_replace(public.bo_dau(l.ward), '^phuong\s*', ''));
  v_ward_no := (regexp_match(v_ward_kd, '^([0-9]{1,2})$'))[1];
  v_dist_kd := btrim(public.bo_dau(coalesce(l.district, '')));
  -- "quan 5" → khớp "quan 5" / "q5" / "q.5" (không dính "quan 50", "q15")
  v_dist_re := case
    when v_dist_kd ~ '^(quan|q)\s*\.?\s*[0-9]{1,2}$'
      then '(quan|q)\s*\.?\s*' || (regexp_match(v_dist_kd, '([0-9]{1,2})$'))[1] || '\M'
    when v_dist_kd <> '' then '\m' || v_dist_kd || '\M'
    else null end;

  v_note := '#' || l.code
         || ' · ' || l.ward || coalesce(', ' || l.district, '')
         || coalesce(' · ' || l.price_raw, '')
         || coalesce(' · ' || rtrim(to_char(l.area_m2, 'FM9999999990.99'), '.') || 'm2', '')
         || coalesce(' · ' || case l.access_type
              when 'mat_tien'   then 'mặt tiền'
              when 'hem_xe_tai' then 'hẻm xe tải'
              when 'hem_xe_hoi' then 'hẻm xe hơi'
              when 'hem_xe_may' then 'hẻm xe máy'
              when 'hem'        then 'trong hẻm' end
            || coalesce(' ' || rtrim(to_char(l.alley_width_m, 'FM9999990.99'), '.') || 'm', ''), '');

  insert into reminders (kind, buyer_id, listing_id, due_at, note)
  select 'match', b.id, l.id, now(), v_note
    from (
      select b.id, b.last_contact_at,
             public.bo_dau(coalesce(b.preferences->>'area', '')) as area_kd,
             coalesce(b.preferences->>'deal', 'ban')             as deal,
             public.parse_vnd(b.preferences->>'budget')          as budget
        from buyers b
       where b.zalo_user_id is not null
         and b.last_contact_at >= now() - interval '30 days'
         and b.preferences is not null
    ) b
   where -- giao dịch
         (case when b.deal in ('thue', 'cho_thue') then 'cho_thue' else 'ban' end) = v_deal
     -- ngân sách trong dải
     and b.budget is not null
     and b.budget between (l.price_vnd * 0.7)::bigint and (l.price_vnd * 1.15)::bigint
     -- khu vực
     and b.area_kd <> ''
     and (
       case
         -- khách NÊU số phường → phải đúng phường của tin
         when b.area_kd ~ '(phuong\s*\.?\s*[0-9]{1,2}|(^|[^a-z0-9])p\.?\s*[0-9]{1,2}(?![0-9]))' then
              v_ward_no is not null
              and b.area_kd ~ ('(phuong\s*\.?\s*' || v_ward_no || '(?![0-9])|(^|[^a-z0-9])p\.?\s*' || v_ward_no || '(?![0-9]))')
         -- không nêu phường: tên phường chữ, hoặc quận/huyện
         else (v_ward_no is null and v_ward_kd <> '' and b.area_kd ~ ('\m' || v_ward_kd || '\M'))
              or (v_dist_re is not null and b.area_kd ~ v_dist_re)
       end
     )
     -- van 24 giờ: một khách một tin chủ động loại này mỗi ngày
     and not exists (select 1 from reminders r
                      where r.buyer_id = b.id and r.kind = 'match'
                        and r.status in ('pending', 'sent')
                        and r.created_at > now() - interval '24 hours')
   order by b.last_contact_at desc
   limit 50
  on conflict (buyer_id, listing_id) where kind = 'match' do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function public.bao_tin_moi_khop(uuid) is
  'FR-64: chèn reminders kind=match cho khách có preferences khớp tin (deal, phường/quận, ngân sách 0,7–1,15×), '
  'van 1 match/khách/24h + 1 match/khách/tin. nudge gửi theo mẫu cố định. Trả số dòng chèn.';

revoke execute on function public.bao_tin_moi_khop(uuid) from public, anon, authenticated;
grant  execute on function public.bao_tin_moi_khop(uuid) to service_role;

-- Trigger: chạy khi tin VỪA thành `dang_ban` — từ trạng thái khác `dang_ban`/
-- `dang_quan_tam` (tin đang được quan tâm quay về đang bán sau 7 ngày decay
-- FR-139 KHÔNG phải tin mới). Cố ý KHÔNG dùng `update of status`: trigger
-- BEFORE `listings_quyet_dinh_dang_tin` lật `cho_thong_tin` → `dang_ban` ngay
-- lúc chủ nhà bổ sung giá/diện tích, câu UPDATE đó không hề SET `status` nên
-- `update of status` sẽ không bắt được — mà đó lại là đường tin lên kệ hay gặp
-- nhất (FR-144). So `old.status is distinct from new.status` là đủ rẻ.
-- Lỗi trong khớp KHÔNG được chặn việc đăng tin: bọc exception → `log_loi`
-- (FR-152 d — không nuốt im).
create or replace function public.listings_bao_tin_moi_khop()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'dang_ban'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and (tg_op = 'INSERT' or old.status not in ('dang_ban', 'dang_quan_tam'))
     and new.price_vnd is not null and new.ward is not null then
    begin
      perform public.bao_tin_moi_khop(new.id);
    exception when others then
      perform public.log_loi('bao_tin_moi_khop', left(sqlerrm, 400), null::integer);
    end;
  end if;
  return null;
end $$;

drop trigger if exists trg_listings_bao_tin_moi_khop on public.listings;
create trigger trg_listings_bao_tin_moi_khop
  after insert or update on public.listings
  for each row execute function public.listings_bao_tin_moi_khop();

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) FR-56 — hỏi cảm nhận sau buổi xem
-- ═══════════════════════════════════════════════════════════════════════════
-- Đặt ở SQL chứ không ở `nudge`, vì ba lẽ: (a) nó bám vào ĐÚNG khoảnh khắc
-- nhắc `viewing` được đánh `sent` — cùng transaction với dòng UPDATE, không
-- có cửa sổ "gửi rồi mà chưa kịp hẹn" khi instance chết; (b) `dry_run` của
-- nudge không đánh `sent` nên tự nhiên không ghi gì (TS-HQ-07), khỏi thêm một
-- guard; (c) không thêm `catch` mới trong TypeScript phải nối dây.
-- Giờ hẹn: `viewings.slot` + 4 giờ (giờ XEM thật). Nhắc `viewing` đi trước
-- giờ xem 45 phút (chat-reply), nên khi không có slot thì lấy `due_at` + 45'
-- + 4h. Không có `viewing_id` (nhắc tạo tay) thì vẫn hẹn từ `due_at`.
create or replace function public.reminders_hen_hoi_cam_nhan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v record;
begin
  if new.kind = 'viewing' and new.status = 'sent' and old.status is distinct from 'sent'
     and new.buyer_id is not null then
    begin
      select vw.slot, vw.listing_id, l.code
        into v
        from viewings vw left join listings l on l.id = vw.listing_id
       where vw.id = new.viewing_id;
      insert into reminders (kind, buyer_id, listing_id, viewing_id, due_at, note)
      values ('feedback', new.buyer_id, v.listing_id, new.viewing_id,
              coalesce(v.slot, new.due_at + interval '45 minutes') + interval '4 hours',
              'hỏi cảm nhận sau khi xem ' || coalesce('#' || v.code, 'nhà'))
      on conflict (viewing_id) where kind = 'feedback' and viewing_id is not null do nothing;
    exception when others then
      perform public.log_loi('reminders_hen_hoi_cam_nhan', left(sqlerrm, 400), null::integer);
    end;
  end if;
  return null;
end $$;

drop trigger if exists trg_reminders_hen_hoi_cam_nhan on public.reminders;
create trigger trg_reminders_hen_hoi_cam_nhan
  after update of status on public.reminders
  for each row execute function public.reminders_hen_hoi_cam_nhan();

comment on trigger trg_reminders_hen_hoi_cam_nhan on public.reminders is
  'FR-56: nhắc viewing đánh sent → chèn reminders kind=feedback hẹn slot + 4h (nudge hỏi cảm nhận theo mẫu cố định).';
