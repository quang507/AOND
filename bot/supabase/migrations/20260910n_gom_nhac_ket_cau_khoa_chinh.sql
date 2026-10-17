-- 20260910n — BA LỖI BẢN SOÁT LẦN HAI XÁC NHẬN TRÊN DB THẬT (E4, D3, F6).
--
-- Lần soát thứ hai (10/09 tối) lật lại 5 kết luận của bản review đầu — đúng là
-- 5 cái đó đã hết, vì tao vá lúc 19:40 còn họ đọc bản chụp commit `00e4a1d`
-- lúc 19:03. Nhưng ba lỗi dưới đây họ soi thẳng vào DB và chúng CÒN THẬT:
--   E4  `reminders` không có chỉ mục chống dồn cho `escalation`
--   D3  `listing_facts_sync_cols` không có nhánh `ket_cau`
--   F6  `required_facts` mất khoá chính
-- Cả ba đều đã kiểm lại bằng `pg_indexes` / `pg_constraint` / thân hàm trước khi
-- viết file này.

-- ─── E4. Năm câu hỏi của một khách = năm tin nhắn bắn cùng lúc ──────────────
-- `notify_info_request_escalation` chèn MỘT `reminders` cho MỖI dòng
-- `info_requests`, `due_at = now()`. Khách hỏi 5 thứ về cùng một căn → chủ nhà
-- nhận 5 tin liền. Năm `kind` khác (`sold`, `reengage`, `match`, `feedback`,
-- `viewing`) đều có UNIQUE partial index chống dồn; `escalation` không có cái nào.
--
-- KHÔNG vá bằng unique index — chính chú thích trong `chat-reply` đã cản đúng
-- chỗ này: `unique (buyer_id) where kind='escalation' and status='pending'` sẽ
-- chặn luôn việc "khách chốt kèo" khi khách đó còn một việc đang chờ, tức DB từ
-- chối báo một giao dịch đã chốt. Luật thật ở đây là GOM, không phải CẤM:
-- còn một việc y hệt CHƯA GỬI thì nối câu hỏi mới vào ghi chú đó, chủ nhà nhận
-- một tin có đủ hai câu. Đã gửi rồi thì tin mới là đúng.
create or replace function public.notify_info_request_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code   text;
  v_seller uuid;
  v_hoi    text;
  v_dia_chi text;
  v_goi    text;
  v_gom    int;
begin
  if coalesce(new.question, '') in ('xac_nhan_lich', 'con_ban') then return new; end if;

  select l.code, l.seller_id, coalesce(nullif(btrim(l.location_raw), ''), l.ward, 'của mình')
    into v_code, v_seller, v_dia_chi from listings l where l.id = new.listing_id;
  v_hoi := coalesce(new.question, 'thông tin');

  if new.assignee = 'admin' then
    -- Gom vào việc admin còn chờ của cùng căn (nếu có).
    with g as (
      update reminders set note = note || ' · khách hỏi thêm: "' || v_hoi || '"'
       where kind = 'escalation' and status = 'pending' and listing_id = new.listing_id
         and seller_id is null and ctv_id is null
         and created_at > now() - interval '15 minutes'
      returning 1
    ) select count(*) into v_gom from g;
    if v_gom = 0 then
      insert into reminders (kind, listing_id, due_at, note)
      values ('escalation', new.listing_id, now(),
        '❓ Khách hỏi căn #' || coalesce(v_code, '?') || ': "' || v_hoi
        || '" — không có CTV nào đang hoạt động. Admin hỏi chủ rồi nhắn bot "#'
        || coalesce(v_code, '?') || ': câu trả lời".');
    end if;

  elsif new.assignee = 'ctv' then
    with g as (
      update reminders set note = note || ' · khách hỏi thêm: "' || v_hoi || '"'
       where kind = 'escalation' and status = 'pending' and listing_id = new.listing_id
         and ctv_id is not distinct from new.ctv_id
         and created_at > now() - interval '15 minutes'
      returning 1
    ) select count(*) into v_gom from g;
    if v_gom = 0 then
      if new.source = 'buyer_ask' then
        insert into reminders (kind, listing_id, ctv_id, due_at, note)
        values ('escalation', new.listing_id, new.ctv_id, now(),
          'khách hỏi #' || coalesce(v_code, '?') || ': "' || v_hoi
          || '". Anh/chị hỏi chủ rồi nhắn lại em theo mẫu "#' || coalesce(v_code, '?')
          || ': câu trả lời" trong ' || public.ctv_sla_phut() || ' phút nha, em báo khách liền.');
      else
        insert into reminders (kind, listing_id, ctv_id, due_at, note)
        values ('escalation', new.listing_id, new.ctv_id, now(),
          'khách hỏi #' || coalesce(v_code, '?') || ' · cần: ' || public.nhan_fact(v_hoi)
          || ' · tin không có chính chủ trên hệ thống → giao ctv');
      end if;
    end if;

  elsif new.assignee = 'seller' and v_seller is not null
        and coalesce(new.source, '') = 'buyer_ask' then
    select coalesce(xung_ho, 'anh/chị') into v_goi from sellers where id = v_seller;
    with g as (
      update reminders set note = note || ' Khách hỏi thêm: "' || v_hoi || '".'
       where kind = 'escalation' and status = 'pending' and listing_id = new.listing_id
         and seller_id = v_seller
         and created_at > now() - interval '15 minutes'
      returning 1
    ) select count(*) into v_gom from g;
    if v_gom = 0 then
      insert into reminders (kind, listing_id, seller_id, due_at, note)
      values ('escalation', new.listing_id, v_seller, now(),
        '💬 ' || initcap(left(v_goi, 1)) || substr(v_goi, 2) || ' ơi, có khách đang hỏi căn ' || v_dia_chi
        || ': "' || v_hoi || '". ' || initcap(left(v_goi, 1)) || substr(v_goi, 2)
        || ' trả lời giúp em ở đây để em báo khách liền nha.');
    end if;
  end if;
  return new;
end $function$;

comment on function public.notify_info_request_escalation() is
  'FR-140: mở việc khi có câu hỏi cần người thật. GOM vào việc CHƯA GỬI của cùng căn '
  'trong 15 phút thay vì đẻ tin mới — khách hỏi 5 thứ thì chủ nhà nhận 1 tin, không phải 5 '
  '(soát 10/09 mục E4). Không dùng unique index vì nó sẽ chặn luôn việc "khách chốt kèo".';

-- ─── E4b. `huy_nhac_khi_da_tra_loi` huỷ lây vì so bằng LIKE ─────────────────
-- `note like '%' || v_nhan || '%'`: nhãn fact chứa `_` hay `%` thành ký tự đại
-- diện, huỷ lây nhắc của câu hỏi khác. Nhãn hôm nay đều là chữ thường tiếng
-- Việt nên chưa nổ, nhưng thêm một nhãn có gạch dưới là nổ ngay — mà nhãn thì
-- người ta thêm luôn.
create or replace function public.huy_nhac_khi_da_tra_loi()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_nhan text;
begin
  if new.status not in ('answered', 'expired') or old.status is not distinct from new.status then
    return null;
  end if;
  v_nhan := public.nhan_fact(coalesce(new.question, ''));
  -- Nhãn rơi về mặc định 'thông tin' thì KHÔNG lọc theo nhãn nữa: chuỗi đó có
  -- trong gần như mọi ghi chú, huỷ theo nó là huỷ nhầm tin của câu khác.
  if v_nhan = 'thông tin' then
    return null;
  end if;
  update reminders set status = 'cancelled'
   where kind = 'escalation' and status = 'pending'
     and listing_id = new.listing_id
     -- So CHUỖI THẬT, không phải khuôn LIKE (soát 10/09 mục E4).
     and position(v_nhan in note) > 0;
  return null;
end $function$;

-- ─── D3. Trả lời "3" cho câu kết cấu → `floors` mãi rỗng ────────────────────
-- Bot hỏi "Nhà mình xây mấy tầng rồi?" dưới khoá `ket_cau`, chủ nhà gõ đúng một
-- con số. `boc_thong_so('3')` không thấy chữ `tang|lau|tam|tret` nên trả `{}`,
-- mà `listing_facts_sync_cols` CHỈ có nhánh cho khoá `tang` — không có nhánh
-- `ket_cau`. Hệ quả: cột `floors` rỗng, `ro_hang_ban.ket_cau` rỗng, thẻ tin
-- không có số tầng — trong khi dòng `listing_facts` đã tồn tại nên
-- `listing_missing_facts` coi câu này ĐÃ TRẢ LỜI và không hỏi lại. Chủ nhà tin
-- là đã khai, hệ thống tin là đã hỏi, cột thì trống.
--
-- Vá đúng một chỗ: cho `ket_cau` đi chung nhánh với `tang`. Vẫn giữ nguyên luật
-- "chỉ ghi khi `boc_thong_so` không bóc được `floors`" và trần 0..80.
do $do$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'listing_facts_sync_cols'
   limit 1;

  if position('''ket_cau''' in v_src) > 0 then
    raise notice 'listing_facts_sync_cols da co nhanh ket_cau, bo qua';
  else
    v_src := replace(
      v_src,
      'elsif new.question = ''tang'' then',
      'elsif new.question in (''tang'', ''ket_cau'') then');
    if position('in (''tang'', ''ket_cau'')' in v_src) = 0 then
      raise exception 'Khong tim thay nhanh tang de noi ket_cau vao — dung, dung vá mù';
    end if;
    execute v_src;
  end if;
end $do$;

comment on function public.listing_facts_sync_cols() is
  'Đồng bộ câu trả lời fact xuống cột listings. Khoá `ket_cau` đi chung nhánh với `tang` '
  '(soát 10/09 mục D3): bot hỏi kết cấu, chủ nhà gõ "3" — trước bản này cột floors rỗng '
  'mà câu hỏi vẫn được coi là đã trả lời.';

-- ─── F6. `required_facts` mất khoá chính ───────────────────────────────────
-- `20260909h` thay constraint bằng hai UNIQUE partial index:
--   (property_type, fact_key)        where deal is null
--   (property_type, fact_key, deal)  where deal is not null
-- Hai vùng rời nhau, nên ('nha_pho','gia',null) và ('nha_pho','gia','ban') hợp
-- lệ ĐỒNG THỜI → bot hỏi giá hai lần. Đo hôm nay: 0 cặp như vậy, tức đây là bẫy
-- chờ chứ chưa nổ — vá lúc bảng còn sạch là rẻ nhất.
--
-- Thêm khoá chính thật (`id`) và một unique BAO CẢ HAI VÙNG. Giữ nguyên hai
-- index cũ: năm migration trước dùng chúng làm arbiter cho `on conflict`, xoá
-- đi là bài diễn tập phục hồi (replay toàn bộ migration) gãy giữa chừng.
alter table public.required_facts add column if not exists id bigint generated by default as identity;
update public.required_facts set id = default where id is null;
do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.required_facts'::regclass and contype = 'p'
  ) then
    alter table public.required_facts add constraint required_facts_pkey primary key (id);
  end if;
end $do$;

-- Chặn cặp (loại, khoá) tồn tại ĐỒNG THỜI ở cả bản chung (deal null) lẫn bản
-- riêng (deal có giá trị). Không dùng được unique index trên
-- `coalesce(deal::text,'*')`: cast enum → text là STABLE chứ không IMMUTABLE nên
-- Postgres từ chối làm biểu thức index. Nên chặn bằng trigger, nói thẳng lý do
-- trong câu lỗi để người thêm dòng biết phải sửa ở đâu.
create or replace function public.required_facts_khong_trung()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from required_facts r
     where r.property_type = new.property_type
       and r.fact_key = new.fact_key
       and (r.deal is null) <> (new.deal is null)
       and r.id is distinct from new.id
  ) then
    raise exception
      'required_facts: (%, %) da co ban % — them ban % nua la bot hoi hai lan',
      new.property_type, new.fact_key,
      case when new.deal is null then 'rieng theo deal' else 'chung (deal null)' end,
      case when new.deal is null then 'chung' else 'rieng' end
      using errcode = '23505';
  end if;
  return new;
end $function$;

drop trigger if exists trg_required_facts_khong_trung on public.required_facts;
create trigger trg_required_facts_khong_trung
  before insert or update of property_type, fact_key, deal on public.required_facts
  for each row execute function public.required_facts_khong_trung();

comment on function public.required_facts_khong_trung() is
  'Hai UNIQUE partial của 20260909h không nói chuyện với nhau: (nha_pho,gia,null) và '
  '(nha_pho,gia,ban) hợp lệ đồng thời → bot hỏi giá hai lần. Trigger này bịt khe đó '
  '(soát 10/09 mục F6).';
