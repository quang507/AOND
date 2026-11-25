-- 20261125d — SRS-5.1zzzzzzz543: các mục DB của audit ECC 25/11 nhóm P2.
--
-- P2-12  buyers: người dùng web tự tạo / sửa dòng buyers của mình được đặt luôn `zalo_user_id` (sellers đã vá ở SRS-529, buyers chưa) —
--        biết uid Zalo của người khác là gắn hồ sơ web của mình vào lịch sử Zalo của họ. Nay: INSERT phải để trống `zalo_user_id`;
--        UPDATE đổi `zalo_user_id` chỉ service_role / admin (trigger — policy không thấy giá trị cũ). Web chỉ ghi name / phone.
-- P2-13  soat_db_cong_khai (mở cho anon để CI soát không cần secret) thôi trả 4 số cuối Zalo ID. ham_md5_cong_khai GIỮ NGUYÊN: chỉ tên hàm
--        + md5 thân hàm, mà schema.sql (repo PUBLIC) đã có đủ cả hai — thu quyền anon thì CI phải cầm khoá service_role, rủi ro hơn.
-- P2-14  tim_moc (anon gọi mỗi lần gõ ô tìm) quét `ilike '%…%'` trên 39 nghìn đường + bo_dau từng dự án: đo 552 ms → 7 ms với chỉ mục
--        trigram (thử trong giao dịch huỷ 25/11). Trigger đăng tin chỉ tính lại nhãn khi tin mới / đổi trạng thái / đổi người bán.
-- P2-16  gui_dang_ky_moi_gioi (anon) ghép nguyên tên / khu vực vào tin Zalo gửi admin → chặn link, bỏ ký tự điều khiển / vô hình.

-- ── P2-12 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists buyers_self_insert on public.buyers;
create policy buyers_self_insert on public.buyers as permissive for insert to authenticated
  with check ((auth_user_id = (select auth.uid() as uid)) and zalo_user_id is null);

create or replace function public.buyers_chan_doi_zalo()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  -- Người dùng web (authenticated, không phải admin) không được tự gắn / đổi Zalo ID — chỉ lõi (service_role) và admin.
  if new.zalo_user_id is distinct from old.zalo_user_id
     and coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.la_admin() then
    raise exception 'không được đổi zalo_user_id' using errcode = '42501';
  end if;
  return new;
end $function$;
revoke all on function public.buyers_chan_doi_zalo() from public, anon, authenticated;

drop trigger if exists trg_buyers_chan_doi_zalo on public.buyers;
create trigger trg_buyers_chan_doi_zalo before update of zalo_user_id on public.buyers
  for each row execute function public.buyers_chan_doi_zalo();

-- ── P2-13 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soat_db_cong_khai()
 RETURNS TABLE(ma text, muc text, so integer, chi_tiet text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  -- ── 1. (gỡ 19/10/2026, 20261019f) Phép soát policy chặn khoá của bảng fact cũ — bảng và policy đã gỡ.


  -- ── 2. VIEW NÀO THIẾU CHẾ ĐỘ QUYỀN ───────────────────────────────────────
  -- `security_invoker` là thứ bắt view chạy bằng quyền NGƯỜI GỌI, tức RLS còn
  -- áp. Thiếu nó, view đọc xuyên RLS. Ba view từng khai `= on` (Postgres giữ
  -- nguyên văn) làm `xuat_schema()` in thiếu mệnh đề — bản phục hồi hạ cấp bảo
  -- mật đúng lúc cần nhất. Ở đây bắt CẢ HAI: thiếu hẳn, và viết khác chuẩn.
  -- Mức tuỳ CÓ CỔNG TRONG THÂN VIEW hay không: nhiều view admin tự chặn bằng
  -- `la_admin()` / `admins` ngay trong WHERE, thiếu security_invoker ở đó không
  -- phơi gì (NHE). Không có cổng nào thì đúng là đọc xuyên RLS (NANG).
  return query
  select 'view_thieu_quyen',
         case when bool_and(pg_get_viewdef(c.oid) ~ '(la_admin|admins)') then 'NHE' else 'NANG' end,
         count(*)::int,
         -- Dấu " (!)" = view KHÔNG có cổng admin trong thân, tức thiếu
         -- security_invoker là đọc xuyên RLS thật. Không có dấu = có cổng
         -- trong WHERE, thiếu thuộc tính vẫn không phơi gì.
         coalesce(string_agg(
           c.relname
             || coalesce(' (' || c.reloptions::text || ')', '')
             || case when pg_get_viewdef(c.oid) ~ '(la_admin|admins)' then '' else ' (!)' end,
           ', ' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     -- `agents_public` cố ý là definer (đã khai `security_invoker=false`).
     and not (coalesce(c.reloptions::text[], '{}') @> array['security_invoker=false'])
     and not (coalesce(c.reloptions::text[], '{}') @> array['security_invoker=true'])
     -- CHỈ tính view mà `anon`/`authenticated` ĐỌC ĐƯỢC. Lượt chạy đầu báo 13
     -- view, gần hết là view nội bộ chỉ `service_role` mở được — thiếu
     -- `security_invoker` ở đó không phơi gì cho ai. Một cổng kêu 13 dòng mỗi
     -- lần chạy là một cổng sẽ bị bỏ qua.
     and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('authenticated', c.oid, 'SELECT'))
  having count(*) > 0;

  -- ── 3. HÀM NÀO TRÙNG CHỮ KÝ ──────────────────────────────────────────────
  -- `duyet_fact_du_an` có hai overload (2 và 3 tham số) vì migration thêm bản
  -- mới mà quên `drop` bản cũ. PostgREST gọi bằng 2 tham số → PGRST203
  -- "function is not unique" → nút duyệt ở /admin chết, hàng chờ đứng im.
  -- Overload là hợp lệ trong Postgres nhưng ĐỘC với PostgREST, nên soi ở đây.
  --
  -- Overload là HỢP LỆ trong Postgres — chỉ độc khi hai chữ ký cùng tên mà bộ
  -- TÊN THAM SỐ của cái này là TẬP CON của cái kia: lúc đó một lượt gọi bằng bộ
  -- tham số nhỏ khớp cả hai, PostgREST không chọn được. Lượt chạy đầu báo 5 hàm
  -- trùng tên, trong đó `next_listing_code`, `diem_tin`… là overload lành (khác
  -- kiểu, khác bộ tên) — báo cả 5 là dạy người đọc bỏ qua cổng này.
  return query
  with ham as (
    select p.oid, p.proname,
           coalesce((select array_agg(x order by x) from unnest(p.proargnames) x), '{}') as ten_ts
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  )
  select 'ham_trung_chu_ky', 'NANG', count(*)::int,
         coalesce(string_agg(distinct a.proname, ', ' order by a.proname), '')
    from ham a join ham b on a.proname = b.proname and a.oid <> b.oid
   where a.ten_ts <@ b.ten_ts
  having count(*) > 0;

  -- ── 4. BẢNG NÀO THIẾU KHOÁ CHÍNH ─────────────────────────────────────────
  -- `required_facts` mất PK khi `20260909h` đổi constraint thành hai index
  -- partial. Bảng không khoá chính là bảng cho phép hai dòng y hệt nhau —
  -- ở bảng danh mục câu hỏi thì đó là bot hỏi hai lần cùng một thứ.
  return query
  select 'bang_thieu_khoa_chinh', 'NANG', count(*)::int,
         coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')
  having count(*) > 0;

  -- ── 5. HÀM SECURITY DEFINER THIẾU `set search_path` ──────────────────────
  -- Định nghĩa của leo thang đặc quyền cổ điển: hàm chạy bằng quyền chủ sở hữu
  -- mà để người gọi tự đặt `search_path` là người gọi chọn được hàm nào sẽ chạy.
  -- Hôm nay 0 lỗ; phép soát này giữ cho nó ở 0.
  return query
  select 'definer_thieu_search_path', 'NANG', count(*)::int,
         coalesce(string_agg(p.proname, ', ' order by p.proname), '')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search\_path=%')
  having count(*) > 0;

  -- ── 6. BẢNG BẬT RLS MÀ KHÔNG CÓ POLICY NÀO ───────────────────────────────
  -- Không policy = không ai vào (trừ service_role). Với bảng nội bộ đó là CHỦ
  -- ĐÍCH; với bảng web phải đọc thì đó là trang trắng không rõ nguyên nhân —
  -- đúng sự cố /moi-gioi 27/08 → 04/09. Mức NHẸ: liệt kê để người đọc quyết.
  return query
  select 'rls_bat_khong_policy', 'NHE', count(*)::int,
         coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
     -- Bảng nội bộ bật RLS mà không policy là CHỦ ĐÍCH (không ai vào trừ
     -- service_role) — lượt chạy đầu báo 11 bảng loại đó. Chỉ đáng kêu khi web
     -- ĐÃ ĐƯỢC CẤP quyền đọc mà RLS lại chặn sạch: đúng hình sự cố /moi-gioi
     -- trắng trang 27/08 → 04/09, và nó câm chứ không báo lỗi.
     and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('authenticated', c.oid, 'SELECT'))
  having count(*) > 0;

  -- ── 7. TRIGGER BEFORE CHẠY SAI THỨ TỰ ────────────────────────────────────
  -- Postgres bắn BEFORE-row trigger theo THỨ TỰ CHỮ CÁI của tên. `fill_code`
  -- từng chạy trước `fill_property_type` nên mã tin đọc `property_type` lúc nó
  -- còn `chua_ro` → 100% tin từ chat mang tiền tố NP. Quy ước của dự án là ép
  -- thứ tự bằng tên (`trg_y_`, `trg_z_`, `trg_zz_`); phép soát canh đúng cặp đã
  -- từng gãy, để nó không gãy lại lần nữa sau một lượt đổi tên.
  return query
  select 'trigger_sai_thu_tu', 'NANG', 1,
         'trg_listings_zz_fill_code phải chạy SAU trg_listings_fill_property_type'
   where (select t.tgname from pg_trigger t
           where t.tgrelid = 'public.listings'::regclass and not t.tgisinternal
             and t.tgname like '%fill_code%' limit 1)
         < (select t.tgname from pg_trigger t
             where t.tgrelid = 'public.listings'::regclass and not t.tgisinternal
               and t.tgname like '%fill_property_type%' limit 1);

  -- ── 8. AI NHẬN QUÁ HAI TIN CHỦ ĐỘNG MỘT NGÀY ─────────────────────────────
  -- Đây là phép soát NGHIỆP VỤ duy nhất trong tám cái, và là cái đắt nhất nếu
  -- sai: bot nhắn dồn là khách chặn OA, mất luôn đường liên lạc. Trần thiết kế
  -- là 2 tin chủ động/người/ngày (FR-130 nhịp nhắn giống người).
  --
  -- KHÔNG trả Zalo ID trần, KHÔNG trả nội dung tin — chỉ trả 4 số cuối và số
  -- đếm. Hàm này mở cho `anon` nên chính chỗ này là chỗ dễ biến một cổng kiểm
  -- thành một lỗ rò.
  return query
  -- 23/10/2026 (SRS-5.1zzzzzzz156): dòng `escalation` đi tới chủ nhà / CTV / admin (escalation-feed), KHÔNG tới người mua — `buyer_id` ở đó
  -- chỉ nói việc về khách nào. Đếm nó vào người mua làm lịch hẹn xem thật (2 việc báo admin + 1 tin báo căn mới) hiện thành "3 tin" oan.
  -- 27/10/2026 (SRS-5.1zzzzzzz214 mục 7): tin NỘI BỘ (note mở bằng 🙋 ⭐ 🩺 ❓ 😟… — cùng luật `laTinNoiBo` của bridge: chữ đầu không phải chữ /
  -- số, không phải 💬) KHÔNG BAO GIỜ tới chủ nhà dù dòng gắn `seller_id` (escalation-feed, 01/10/2026) — nó đi CTV / admin. Đếm nó vào chủ nhà
  -- làm 15 tin 🙋 về admin (lỗi lặp cổng phường, đã sửa ở lõi) hiện thành "chủ nhà …8895 nhận 16 tin" oan. Tin tới admin có chỗ đếm riêng? Chưa —
  -- admin là người nhà, không phải khách bị nhắn dồn.
  with gui as (
    select coalesce(s.zalo_user_id, case when r.kind <> 'escalation' then b.zalo_user_id end) as uid, count(*) as so_tin
      from reminders r
      left join sellers s on s.id = r.seller_id
      left join buyers  b on b.id = r.buyer_id
     where r.status = 'sent' and r.sent_at > now() - interval '24 hours'
       and coalesce(s.zalo_user_id, case when r.kind <> 'escalation' then b.zalo_user_id end) is not null
       and not (coalesce(btrim(r.note), '') <> '' and btrim(r.note) not like '💬%' and left(btrim(r.note), 1) !~ '[[:alnum:]]')
       -- 27/10/2026 (SRS-5.1zzzzzzz216): `admin_reply` là admin NÓI CHUYỆN với khách qua ô gửi ở /admin/tin-nhan (lõi gửi hộ), không phải
       -- tin chủ động của bot — admin trả lời ba câu trong một ngày không phải "nhắn dồn".
       and r.kind <> 'admin_reply'
     group by 1 having count(*) > 2
  )
  select 'gui_qua_hai_tin_mot_ngay', 'NANG', count(*)::int,
         -- 20261125d (audit ECC P2-13): hàm mở cho anon — không kèm đuôi Zalo ID nữa, chỉ số tin mỗi người nhận. Ai cần biết là ai thì
         -- chạy câu `gui` trong SQL Editor (service_role).
         coalesce(string_agg(so_tin || ' tin', ', ' order by so_tin desc), '')
    from gui
  having count(*) > 0;
end $function$;

-- ── P2-14 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_trgm with schema extensions;
create index if not exists duong_ten_khong_dau_trgm on public.duong using gin (ten_khong_dau extensions.gin_trgm_ops);
create index if not exists tien_ich_ten_kd_trgm on public.tien_ich using gin (ten_kd extensions.gin_trgm_ops);
create index if not exists projects_ten_kd_trgm on public.projects using gin (public.bo_dau(name) extensions.gin_trgm_ops);

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
  -- 20261125d (audit ECC P2-14): bản trước tính lại mỗi UPDATE — cả lượt ghi nền (geocode, tiện ích gần) trên tin của người bán 962 tin
  -- tốn ~230 ms / lượt vì `diem_nguoi_ban` (~380 ms). Nay chỉ khi tin MỚI, đổi trạng thái hoặc đổi người bán. Nhãn có thể cũ đi khi
  -- hạng người bán đổi mà tin không đổi trạng thái — chấp nhận (nhãn chỉ là "cần kiểm chứng thêm", không ẩn tin).
  if new.seller_id is not null and coalesce(auth.role(), '') = 'service_role'
     and new.status in ('dang_ban', 'dang_quan_tam', 'da_coc')
     and (tg_op = 'INSERT' or new.status is distinct from old.status or new.seller_id is distinct from old.seller_id) then
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
end $function$;

-- ── P2-16 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.co_dau_hieu_link(p text)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  -- Dấu hiệu một đường link Zalo sẽ tự biến thành chỗ bấm: giao thức, www., hoặc tên miền có đuôi phổ biến. "TP.HCM" / "Q.7" không khớp.
  select coalesce(p, '') ~* '(://|www\.|[a-z0-9-]+\.(com|net|org|vn|info|xyz|top|io|me|ly|link|site|online|club|shop|app|biz|cc|co)(\M|/))'
$function$;
revoke all on function public.co_dau_hieu_link(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gui_dang_ky_moi_gioi(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_loai text := coalesce(p->>'loai', '');
  v_ten text := btrim(regexp_replace(coalesce(p->>'ho_ten', ''), '\s+', ' ', 'g'));
  v_sdt text := regexp_replace(coalesce(p->>'so_dien_thoai', ''), '\D', '', 'g');
  v_cty text := nullif(btrim(coalesce(p->>'cong_ty', '')), '');
  v_kn text := nullif(btrim(coalesce(p->>'kinh_nghiem', '')), '');
  v_ghi text := nullif(btrim(coalesce(p->>'ghi_chu', '')), '');
  v_can integer;
  v_khu text[];
  v_bds text[];
begin
  -- Mã lỗi ngắn để form hiện đúng chỗ; không bao giờ trả lại dữ liệu người khác.
  if v_loai not in ('ca_nhan', 'san') then return jsonb_build_object('ok', false, 'loi', 'loai'); end if;
  if char_length(v_ten) < 2 or char_length(v_ten) > 80 then return jsonb_build_object('ok', false, 'loi', 'ho_ten'); end if;
  -- 20261125d (audit ECC P2-16): tên và khu vực được ghép NGUYÊN vào tin Zalo gửi admin — người lạ (anon) chèn được link giả
  -- ("Nguyen Van A https://…"), Zalo tự biến thành link bấm được. Có dấu hiệu link thì trả lỗi đúng ô; ký tự điều khiển / vô hình bỏ đi.
  v_ten := regexp_replace(v_ten, '[[:cntrl:]\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]', '', 'g');
  if public.co_dau_hieu_link(v_ten) then return jsonb_build_object('ok', false, 'loi', 'ho_ten'); end if;
  if v_sdt like '84%' and char_length(v_sdt) = 11 then v_sdt := '0' || substr(v_sdt, 3); end if;
  if v_sdt !~ '^0[35789]\d{8}$' then return jsonb_build_object('ok', false, 'loi', 'so_dien_thoai'); end if;
  if coalesce(p->>'dong_y', '') <> 'true' then return jsonb_build_object('ok', false, 'loi', 'dong_y'); end if;
  if jsonb_typeof(p->'khu_vuc') is distinct from 'array' then return jsonb_build_object('ok', false, 'loi', 'khu_vuc'); end if;
  select array_agg(distinct btrim(x)) into v_khu from jsonb_array_elements_text(p->'khu_vuc') x where char_length(btrim(x)) between 2 and 60;
  if v_khu is null or cardinality(v_khu) > 5 then return jsonb_build_object('ok', false, 'loi', 'khu_vuc'); end if;
  if exists (select 1 from unnest(v_khu) k where public.co_dau_hieu_link(k) or k ~ '[[:cntrl:]\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]') then
    return jsonb_build_object('ok', false, 'loi', 'khu_vuc');
  end if;
  if jsonb_typeof(p->'loai_bds') = 'array' then
    select array_agg(distinct btrim(x)) into v_bds from jsonb_array_elements_text(p->'loai_bds') x where char_length(btrim(x)) between 2 and 40;
  end if;
  v_bds := coalesce(v_bds, '{}');
  if cardinality(v_bds) > 8 then return jsonb_build_object('ok', false, 'loi', 'loai_bds'); end if;
  if v_loai = 'san' and v_cty is null then return jsonb_build_object('ok', false, 'loi', 'cong_ty'); end if;
  if char_length(coalesce(v_cty, '')) > 120 or char_length(coalesce(v_kn, '')) > 60 or char_length(coalesce(v_ghi, '')) > 500 then
    return jsonb_build_object('ok', false, 'loi', 'qua_dai');
  end if;
  if coalesce(p->>'so_can', '') ~ '^\d{1,6}$' then v_can := (p->>'so_can')::integer; end if;

  -- Chống gửi dồn: cùng số trong 24 giờ thì coi như đã nhận (không thêm dòng); cả bảng quá 40 dòng / giờ thì hẹn thử lại.
  if exists (select 1 from dang_ky_moi_gioi d where d.so_dien_thoai = v_sdt and d.created_at > now() - interval '24 hours') then
    return jsonb_build_object('ok', true, 'da_co', true);
  end if;
  if (select count(*) from dang_ky_moi_gioi d where d.created_at > now() - interval '1 hour') >= 40 then
    return jsonb_build_object('ok', false, 'loi', 'qua_nhieu');
  end if;

  insert into dang_ky_moi_gioi (loai, ho_ten, so_dien_thoai, khu_vuc, loai_bds, cong_ty, kinh_nghiem, so_can, ghi_chu)
  values (v_loai, v_ten, v_sdt, v_khu, v_bds, v_cty, v_kn, v_can, v_ghi);
  -- SRS-5.1zzzzzzz525: báo admin qua Zalo (tin nội bộ, đường bridge); không kèm số điện thoại.
  insert into reminders (kind, due_at, note)
  values ('escalation', now(), '🆕 Môi giới mới đăng ký: ' || v_ten || ' (' || array_to_string(v_khu, ', ') || '). Xem ở /admin/moi-gioi');
  return jsonb_build_object('ok', true, 'da_co', false);
end $function$;
