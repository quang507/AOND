-- 20260910p — TÁM PHÉP SOÁT CHỈ ĐỌC, GỌI ĐƯỢC BẰNG KHOÁ CÔNG KHAI (TS-DB-01).
--
-- Chủ dự án 10/09/2026 tối: "Tầng hai là tám câu truy vấn chỉ đọc, gói thành
-- một script chạy mỗi lần gửi thay đổi, dưới một phút, không rủi ro."
--
-- Tầng một (`20260910o`) hỏi "repo và DB có cùng DANH SÁCH migration không".
-- Tầng này hỏi câu khác: "DB đang ở trạng thái nào" — vì cả năm lỗi nặng hôm
-- nay đều KHÔNG nhìn thấy được từ danh sách migration:
--   · policy chặn một khoá không tồn tại  → chỉ thấy khi soi khoá ĐANG có
--   · view mất `security_invoker`         → chỉ thấy khi soi `reloptions`
--   · hàm hai chữ ký                      → chỉ thấy khi đếm `pg_proc`
--   · bảng mất khoá chính                 → chỉ thấy khi soi `pg_constraint`
--
-- VÌ SAO GÓI VÀO MỘT HÀM TRONG DB, KHÔNG PHẢI TÁM CÂU Ở SCRIPT:
--  1. Script chạy ở CI chỉ có KHOÁ CÔNG KHAI. Khoá đó không đọc được catalog
--     (`pg_policy`, `pg_proc`…) qua PostgREST, mà nhét `service_role` vào CI
--     của một repo PUBLIC là mở toang — đổi cả kho dữ liệu khách lấy một cổng
--     kiểm là lỗ vốn.
--  2. Hàm chạy TRONG DB nên tám phép soát là tám lượt quét catalog cục bộ,
--     tính bằng mili giây, không phải tám vòng đi về qua Internet.
--  3. Nó chỉ TRẢ VỀ KẾT LUẬN (tên phép soát · mức · số lượng · chi tiết ngắn),
--     không trả dữ liệu thô. Cột `chi_tiet` có ràng buộc riêng: không được chứa
--     nội dung tin nhắn, không được chứa Zalo ID trần — xem phép soát 8.
--
-- KHÔNG RỦI RO theo đúng nghĩa đen: hàm `stable`, chỉ `select`, không đụng bảng
-- nghiệp vụ, không ghi gì. Chạy nhầm mười lần cũng không đổi một dòng dữ liệu.

create or replace function public.soat_db_cong_khai()
returns table (ma text, muc text, so int, chi_tiet text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $ham$
begin
  -- ── 1. POLICY CÓ PHỦ HẾT KHOÁ ĐANG TỒN TẠI KHÔNG ─────────────────────────
  -- Bẫy đã nổ 10/09: policy `anon_read_listing_facts` chặn `dia_chi_chi_tiet`
  -- — một khoá KHÔNG TỒN TẠI — trong khi khoá thật mang số nhà là `vi_tri`,
  -- sinh sau policy 14 ngày. Danh sách chặn viết bằng TÊN thì mỗi khoá mới là
  -- một lần quên nữa. Phép soát này so danh sách chặn với khoá ĐANG SỐNG.
  return query
  with chan as (
    select pg_get_expr(polqual, polrelid) as q
      from pg_policy where polname = 'anon_read_listing_facts'
  ),
  -- Khoá mang địa chỉ chính xác hay liên hệ: tên chứa mấy gốc từ này.
  nhay_cam as (
    select distinct k from (
      select fact_key as k from required_facts
      union select question from listing_facts
    ) t
    -- Khớp CẢ KHOÁ, không phải chuỗi con: lượt chạy đầu của phép soát này báo
    -- `doanh_thu`, `nganh_hang_phu_hop`, `ranh_gioi` là "khoá địa chỉ" — vì cả
    -- ba đều chứa chữ "anh". Đúng cái bẫy đã cắn hôm nay ở chỗ khác (chặn chữ
    -- "anh" trần giết luôn câu rút tin thật "anh không bán nữa").
    where k ~ '^(vi_tri|dia_chi[a-z_]*|so_nha|lien_he|sdt|so_dien_thoai|hinh_anh)$'
  )
  select 'policy_phu_khoa', 'NANG', count(*)::int,
         coalesce(string_agg(n.k, ', ' order by n.k), '')
    from nhay_cam n, chan c
   where position('''' || n.k || '''' in c.q) = 0
  having count(*) > 0;

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
     and c.relname <> 'agents_public'
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
  with gui as (
    select coalesce(s.zalo_user_id, b.zalo_user_id) as uid, count(*) as so_tin
      from reminders r
      left join sellers s on s.id = r.seller_id
      left join buyers  b on b.id = r.buyer_id
     where r.status = 'sent' and r.sent_at > now() - interval '24 hours'
       and coalesce(s.zalo_user_id, b.zalo_user_id) is not null
     group by 1 having count(*) > 2
  )
  select 'gui_qua_hai_tin_mot_ngay', 'NANG', count(*)::int,
         coalesce(string_agg('…' || right(uid, 4) || ': ' || so_tin || ' tin', ', ' order by so_tin desc), '')
    from gui
  having count(*) > 0;
end $ham$;

comment on function public.soat_db_cong_khai() is
  'TS-DB-01: tám phép soát CHỈ ĐỌC trên trạng thái DB (policy phủ khoá, view thiếu quyền, '
  'hàm trùng chữ ký, bảng thiếu khoá chính, definer thiếu search_path, RLS không policy, '
  'trigger sai thứ tự, gửi quá 2 tin/ngày). Chỉ trả KẾT LUẬN — không trả dữ liệu thô, '
  'Zalo ID che còn 4 số cuối. Mở cho anon để cổng CI chạy mà không cần secret.';

revoke execute on function public.soat_db_cong_khai() from public;
grant execute on function public.soat_db_cong_khai() to anon, authenticated, service_role;
