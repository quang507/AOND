-- Mở Supabase Table Editor ra, 31 bảng xếp A→Z: admins, app_config, bot_errors,
-- bot_health, buyers, chat_quota, conversations… Nhìn danh sách KHÔNG biết cái
-- nào thuộc rổ hàng, cái nào là ruột bot. 22/31 bảng câm hoàn toàn: mở
-- `interests` ra thấy ba cột, không một chữ nói nó là gì.
--
-- File này KHÔNG đụng một dòng dữ liệu, KHÔNG thêm/bớt/dời cột nào. Nó chỉ ghi
-- metadata (comment) + thêm một view đọc-người. Đổi tên bảng / dời cột / tách
-- listings vẫn đang bị chặn bởi ba lẽ ở docs/sale-only-audit.md §7: chưa có bản
-- sao nào tồn tại, 41 migration đã mất (OPEN-46), và Postgres không dời được
-- thứ tự cột nên "sắp lại" thực chất là dựng bảng mới.
--
-- Quy ước chú thích bảng: [NHÓM] việc gì · ai ghi · ai đọc · FR nào.
-- Tiền tố [NHÓM] để Table Editor vẫn sort A→Z mà mắt vẫn gom được theo việc.

-- ══ [RỔ HÀNG] — 8 bảng ══

comment on table public.listings is
  '[RỔ HÀNG] Tin rao, mỗi dòng một căn. Bot ghi (câu rao người bán), admin ghi (form đăng tin), script nhập Excel ghi. Web + bot đọc. 56 cột — đọc chú thích từng cột, đừng đoán theo tên. FR-163/164/172.';

comment on table public.media is
  '[RỔ HÀNG] Ảnh lối CŨ: storage_path trỏ file NGOÀI Supabase (masterDB/photos/<STT>/<n>.jpg trên OneDrive/máy local), nên storage.objects rỗng mà bảng này vẫn 1005 dòng. Lối mới là listing_media (FR-165).';

comment on table public.listing_media is
  '[RỔ HÀNG] Ảnh lối MỚI, file nằm trong Supabase Storage. Danh tính file neo vào listings.id (UUID bất biến), KHÔNG neo vào listings.code — mã tin đổi được. FR-165.';

comment on table public.listing_facts is
  '[RỔ HÀNG] Hỏi–đáp của chủ nhà về một căn (question = fact_key của required_facts). source=''chu_xac_nhan'' là bậc nguồn CAO NHẤT. Trigger listing_facts_sync_cols đồng bộ 11 trong 38 khoá sang cột listings — 27 khoá còn lại chỉ sống ở đây. FR-164.';

comment on table public.required_facts is
  '[RỔ HÀNG] Danh mục câu hỏi bắt buộc THEO LOẠI BĐS — 38 câu / 7 loại, bot hỏi chủ nhà theo priority. Đây chính là chỗ rổ hàng đã chia theo loại BĐS; không cần bảng <loai>_specs riêng.';

comment on table public.media_cleanup_queue is
  '[RỔ HÀNG] Hàng đợi xoá file Storage mồ côi. Cron media-cleanup ăn; trang_thai cho/dang_lam/xong/loi/chet + next_retry_at là lùi dần. FR-166.';

comment on table public.projects is
  '[RỔ HÀNG] Dự án sơ cấp (FR-113, OPEN-15 phương án b). Câu hỏi tầng dự án trả lời từ đây, không tạo info_request (FR-115).';

comment on table public.listing_views is
  '[RỔ HÀNG] Ai (auth.users) xem căn nào, lúc nào. Trigger sinh property_events từ đây. FR-70.';

-- ══ [NGƯỜI & HỘI THOẠI] — 10 bảng ══

comment on table public.buyers is
  '[NGƯỜI & HỘI THOẠI] Người mua (B). Không trả phí, không bắt để SĐT — neo theo zalo_user_id. preferences (jsonb) là nhu cầu đã chốt; KHÔNG có bảng buyer_preferences riêng.';

comment on table public.sellers is
  '[NGƯỜI & HỘI THOẠI] Người bán (S): CCRB chính chủ hoặc NMG môi giới, xem seller_type. CẢNH BÁO: phone có UNIQUE, nên chèn trùng sinh lỗi 23505 kèm nguyên "Key (phone)=(09…)" — mọi đường ghi sổ phải qua che_sdt() (§5 CLAUDE.md, repo đang public).';

comment on table public.conversations is
  '[NGƯỜI & HỘI THOẠI] Một cuộc trò chuyện. CHECK bắt ĐÚNG một vai: buyer_id XOR seller_id. needs_human là cờ khách cần người thật; human_touch_at là lúc người thật chạm vào (FR-77).';

comment on table public.messages is
  '[NGƯỜI & HỘI THOẠI] Từng tin nhắn trong hội thoại. seq là thứ tự toàn cục (UNIQUE) — dùng nó để sắp, không dùng created_at. zalo_msg_id UNIQUE chặn ghi trùng khi provider giao lại.';

comment on table public.interests is
  '[NGƯỜI & HỘI THOẠI] Khách bấm quan tâm căn nào. Khoá chính (buyer_id, listing_id) nên ghi lại nhiều lần cũng chỉ một dòng.';

comment on table public.info_requests is
  '[NGƯỜI & HỘI THOẠI] Câu khách hỏi mà bot không tự trả lời được, giao ra người thật: assignee = seller | ctv | admin. sla_due_at / sla_missed_at là căn cứ chấm hạng CTV. FR-173.';

comment on table public.viewings is
  '[NGƯỜI & HỘI THOẠI] Lịch dẫn khách đi xem. Neo theo listing_id HOẶC listing_code (CHECK viewings_can_neo_check) vì có lúc chỉ biết mã tin.';

comment on table public.deals is
  '[NGƯỜI & HỘI THOẠI] Giao dịch đã chốt — nguồn doanh thu DUY NHẤT (CCRB 1%, NMG 0.5%). UNIQUE NULLS NOT DISTINCT (listing_id, buyer_id) chặn ghi đôi cùng một thương vụ.';

comment on table public.reminders is
  '[NGƯỜI & HỘI THOẠI] Việc bot phải làm sau — 10 loại (promise, reengage, viewing, followup, escalation, report, match, feedback, sold, rating). Cron nudge ăn theo due_at; locked_by + locked_at là lease chống hai tiến trình cùng gửi một lời nhắc.';

comment on table public.ratings_log is
  '[NGƯỜI & HỘI THOẠI] FR-65: một sao / khách / căn (idempotent cho ghi_danh_gia). Bot-only, không policy.';

-- ══ [BOT & HÀNG ĐỢI] — 7 bảng ══

comment on table public.inbound_events is
  '[BOT & HÀNG ĐỢI] FR-162: danh tính SỰ KIỆN inbound theo msg_id của Zalo. Provider giao trùng bao nhiêu lần cũng MỘT dòng, delivery_count đếm số lần giao. Webhook ghi TRƯỚC khi ack.';

comment on table public.inbound_ledger is
  '[BOT & HÀNG ĐỢI] FR-162: vòng đời xử lý mỗi tin đến theo zalo_msg_id (received/processing/completed/failed/dead) + payload trả lời để phát lại khi retry. started_at→finished_at là nguồn của view bot_do_tre.';

comment on table public.bot_errors is
  '[BOT & HÀNG ĐỢI] Sổ lỗi. MỌI catch mới phải nối vào đây (ghiLoi trong edge function / bridge, instrumentation.ts phía web) — console.error một mình là mất, log bậc Free chỉ giữ 1 ngày. detail đã che SĐT qua che_sdt(). FR-152.';

comment on table public.bot_health is
  '[BOT & HÀNG ĐỢI] Dấu "lần cuối X còn sống", who = bridge | ntfy | … CẢNH BÁO đã cháy một lần: dấu ntfy CHỈ được đóng sau khi ĐỌC LẠI net._http_response của lượt trước — net.http_post() trả về ngay lúc xếp hàng, "đã gọi hàm gửi" không phải bằng chứng đã tới nơi (20260906a).';

comment on table public.bot_usage is
  '[BOT & HÀNG ĐỢI] Đếm lượt gọi model theo ngày (giờ VN) để chặn đốt tiền. Chỉ bot ghi.';

comment on table public.chat_quota is
  '[BOT & HÀNG ĐỢI] SEC-05: đếm lượt gọi model theo uid theo từng giờ. Dọn tự động trong bump_user_quota.';

comment on table public.bot_prompts is
  '[BOT & HÀNG ĐỢI] Prompt hệ thống sửa được mà không cần deploy lại edge function. chat-reply nạp lúc chạy.';

-- ══ [CTV] — 2 bảng ══

comment on table public.ctvs is
  '[CTV] Cộng tác viên trả câu hỏi khách khi bot bí. last_assigned_at để chia việc vòng tròn. FR-173.';

comment on table public.ctv_daily_reports is
  '[CTV] Báo cáo 17h mỗi ngày gửi admin. UNIQUE (report_date, ctv_id) nên chạy lại trong ngày không sinh dòng trùng.';

-- ══ [HỆ THỐNG] — 4 bảng ══

comment on table public.admins is
  '[HỆ THỐNG] Danh sách admin theo email — căn cứ của la_admin() trong RLS. Giữ thêm zalo_user_id/zalo_phone để bot nhận ra admin ngay trong chat.';

comment on table public.app_config is
  '[HỆ THỐNG] Cấu hình sửa được mà không cần deploy (khoá → giá trị chữ). Nhiều view SECURITY DEFINER đọc điều kiện lên kệ từ đây, nên sửa một dòng ở đây đổi cả mặt công khai.';

comment on table public.curated_lists is
  '[HỆ THỐNG] FR-100: danh sách vài chục căn lọc riêng cho một người mua, mở bằng /ds/<token>. Anon chỉ đọc qua RPC doc_danh_sach; tạo qua RPC tao_danh_sach (admin/service_role).';

comment on table public.property_events is
  '[HỆ THỐNG] FR-70: sự kiện theo tin, sinh bằng trigger từ listing_views/info_requests/interests/viewings/deals/reminders/listings. Admin đọc (CSV từ Table Editor — NFR-11); bot ghi qua trigger.';

-- ══ Năm view còn câm ══

comment on view public.listing_missing_facts is
  'Căn nào còn THIẾU câu hỏi bắt buộc nào: required_facts trừ đi listing_facts đã có, trừ tiếp những khoá đã suy ra được từ cột listings (ket_cau←floors, phap_ly←legal_status…). Đầu vào của ask-seller.';

comment on view public.media_mo_coi_db is
  'Dòng listing_media trỏ tới file KHÔNG còn trong storage.objects — ảnh gãy. Soi bằng mắt, đừng xoá tự động.';

comment on view public.media_mo_coi_storage is
  'File trong bucket listing-public/listing-private mà KHÔNG dòng listing_media nào nhận — tốn dung lượng, không ai biết của tin nào. Đầu vào của media_cleanup_queue.';

comment on view public.public_listings is
  'Hình chiếu CỘT của listings (11 cột, bỏ seller_id/lat/lng/cột thông số). CHÚ Ý: KHÔNG lọc dòng — điều kiện lên kệ KHÔNG nằm ở đây. security_invoker=on nên RLS của người gọi vẫn áp; hiện chỉ service_role được cấp quyền.';

comment on view public.public_media is
  'Ảnh lối cũ đã duyệt (media.approved). Đi kèm bảng media, tức storage_path trỏ file NGOÀI Supabase.';

-- ══ Rổ hàng đọc bằng mắt người ══
-- Mở `listings` ra là 56 cột, giá 6800000000, loại 'nha_pho', pháp lý
-- 'so_hong_rieng'. View này để mở thay cho nó: đơn vị đổi sẵn ra tỷ/triệu, nhãn
-- tiếng Việt, và một cột CẢNH_BÁO nói thẳng con số nào là máy đoán chứ chưa ai
-- xác nhận — 22 dòng đang như vậy, mở listings trần thì không thấy.
--
-- security_invoker=on: view KHÔNG tự nâng quyền, RLS của người gọi vẫn áp.
-- Đây là view MỚI nên phải revoke anon tường minh — mặc định ở project này là
-- lộ, và TS-SEC bắt đúng chỗ đó.

create or replace view public.ro_hang_ban
with (security_invoker = on) as
select
  l.code as ma,
  case l.property_type
    when 'nha_pho'   then 'nhà phố'
    when 'nha_cap4'  then 'nhà cấp 4'
    when 'chung_cu'  then 'chung cư'
    when 'dat'       then 'đất'
    when 'biet_thu'  then 'biệt thự'
    when 'phong_tro' then 'phòng trọ'
    when 'mat_bang'  then 'mặt bằng'
    else 'chưa rõ'
  end as loai,
  l.ward   as phuong,
  l.street as duong,
  l.area_m2 as dien_tich_m2,
  -- ::numeric tường minh: round(double precision, int) KHÔNG tồn tại trong
  -- Postgres, để nguyên là view tạo lỗi lúc chạy chứ không phải lúc soát.
  round(l.price_vnd::numeric        / 1000000000, 2) as gia_ty,
  round(l.price_per_m2_vnd::numeric / 1000000,    1) as gia_m2_trieu,
  l.frontage_m as ngang,
  l.length_m   as dai,
  coalesce(l.floors_text, l.floors || ' tầng') as ket_cau,
  l.bedrooms  as phong_ngu,
  l.bathrooms as phong_tam,
  case l.legal_status
    when 'so_hong_rieng' then 'sổ hồng riêng'
    when 'so_hong_chung' then 'sổ hồng chung'
    when 'so_hong'       then 'có sổ'
    when 'hdmb'          then 'hợp đồng mua bán'
    when 'giay_tay'      then 'giấy tay'
    else null
  end || case when l.has_completion then ', hoàn công' else '' end as phap_ly,
  case l.access_type
    when 'mat_tien'    then 'mặt tiền'
    when 'hem_xe_tai'  then 'hẻm xe tải'
    when 'hem_xe_hoi'  then 'hẻm xe hơi'
    when 'hem_xe_may'  then 'hẻm xe máy'
    when 'hem'         then 'trong hẻm'
    else null
  end || coalesce(' ' || l.alley_width_m || 'm', '') as duong_vao,
  case l.status
    when 'cho_thong_tin'  then 'chờ thông tin'
    when 'dang_ban'       then 'đang bán'
    when 'dang_quan_tam'  then 'đang quan tâm'
    when 'da_chot'        then 'đã chốt'
    when 'an'             then 'ẩn'
    else l.status
  end as trang_thai,
  nullif(concat_ws(' · ',
    case when l.property_type_source = 'suy_doan'  then 'LOẠI do máy đoán'   end,
    case when l.specs_source        = 'boc_mo_ta' then 'THÔNG SỐ bóc từ mô tả' end,
    case when l.price_source        = 'suy_doan'  then 'GIÁ do máy đoán'    end,
    case when l.ward_source         = 'suy_doan'  then 'PHƯỜNG do máy đoán' end
  ), '') as canh_bao,
  l.created_at as ngay_vao_ro,
  l.id
from public.listings l
where l.deal = 'ban';

-- Project này có `alter default privileges` cấp SẴN toàn quyền cho anon và
-- authenticated trên mọi quan hệ mới — nên `grant select` KHÔNG siết được gì,
-- phải revoke trước. Đo lượt đầu: authenticated=arwdDxtm (toàn quyền), đúng cái
-- bẫy mà các view admin cũ (bds_hot: authenticated=r) đã tránh được.
revoke all on public.ro_hang_ban from anon, authenticated;
grant select on public.ro_hang_ban to authenticated, service_role;

comment on view public.ro_hang_ban is
  'Rổ hàng BÁN đọc bằng mắt người: 20 cột thay cho 56, giá quy ra tỷ, nhãn tiếng Việt. Cột canh_bao nói thẳng trường nào là máy đoán (suy_doan / boc_mo_ta) chứ chưa ai xác nhận — mở listings trần thì không thấy. security_invoker=on, anon bị revoke.';

-- ══ Chú thích cột — listings (56 cột, đang có 6) ══

comment on column public.listings.id is 'Khoá chính BẤT BIẾN. Ảnh (listing_media) và mọi liên kết neo vào đây, KHÔNG neo vào code.';
comment on column public.listings.code is 'Mã tin người đọc được, dãy BDS-Q5-#### (FR-158). UNIQUE nhưng ĐỔI ĐƯỢC — đừng dùng làm neo file.';
comment on column public.listings.legacy_sst is 'Số thứ tự trong file Excel gốc. Là cầu duy nhất sang ảnh lối cũ: media.storage_path = masterDB/photos/<legacy_sst>/<n>.jpg.';
comment on column public.listings.seller_id is 'Người rao. NULL với tin nhập từ Excel chưa gán chủ (113/173 dòng đang NULL).';
comment on column public.listings.deal is 'ban | cho_thue. Hiện CHỈ triển khai ''ban''; nhánh cho_thue để nguyên, không có tin mới.';
comment on column public.listings.district is 'Quận/huyện. Mặc định Quận 5 — thị trường khởi điểm.';
comment on column public.listings.ward is 'Phường, dạng "Phường 8". Bậc nguồn ở ward_source.';
comment on column public.listings.location_raw is 'Địa chỉ nguyên văn trong câu rao, chưa tách. Có thể chứa số nhà thật — không đưa ra mặt công khai.';
comment on column public.listings.area_m2 is 'Diện tích công bố (m²). Với chung cư CHƯA chốt là tim tường hay thông thuỷ (câu hỏi treo ở docs/sale-only-audit.md).';
comment on column public.listings.price_vnd is 'Giá quy ra đồng. NULL khi câu rao chỉ nói "thương lượng".';
comment on column public.listings.price_raw is 'Giá nguyên văn ("6 tỷ 8", "6ty8"). Bot lọc tin theo cột này khác rỗng — tin không có giá KHÔNG lên kệ.';
comment on column public.listings.description is 'Câu rao GỐC, giữ nguyên văn. Web luôn render qua sanitizeDescription() để lọc SĐT (FR-104) — đừng render thẳng.';
comment on column public.listings.source is 'Tin từ đâu: import_excel | zalo | admin…';
comment on column public.listings.source_url is 'Link tin gốc bên ngoài nếu có (38/173 dòng).';
comment on column public.listings.cc_link is 'Link chính chủ / hồ sơ đi kèm (21/173 dòng).';
comment on column public.listings.status is 'cho_thong_tin | dang_ban | dang_quan_tam | da_chot | an. "LÊN KỆ" nghĩa là dang_ban HOẶC dang_quan_tam — bot và web đều lọc theo hai giá trị này.';
comment on column public.listings.last_confirmed_at is 'Lần cuối chủ xác nhận căn còn. Quá TTL thì phải hỏi lại trước khi khẳng định với khách (FR-116). Hiện 0/173 dòng có giá trị.';
comment on column public.listings.project_id is 'Thuộc dự án sơ cấp nào (projects). Hiện 0/173 dòng — rổ hàng đang toàn thứ cấp.';
comment on column public.listings.unit_code is 'Mã căn trong dự án (A-12.05). Chỉ có nghĩa khi project_id khác NULL.';
comment on column public.listings.floor is 'Căn nằm ở TẦNG THỨ MẤY — dùng cho chung cư. Đừng lẫn với floors (nhà cao mấy tầng).';
comment on column public.listings.direction is 'Hướng nhà.';
comment on column public.listings.lat is 'Vĩ độ, do edge function geocode-listings điền.';
comment on column public.listings.lng is 'Kinh độ, do edge function geocode-listings điền.';
comment on column public.listings.bedrooms is 'Số phòng ngủ. CHỈ 81/173 dòng có. Bộ lọc gte() của bot LOẠI mọi dòng NULL, nên 92 tin rơi khỏi kết quả tìm mà không ai thấy.';
comment on column public.listings.last_interest_at is 'Lần cuối có khách quan tâm. Dùng để xếp tin nóng.';
comment on column public.listings.street is 'Tên đường. Đã bỏ phần hẻm (20260902f) — "hẻm 88 Trần Hưng Đạo" cho ra "Trần Hưng Đạo".';
comment on column public.listings.access_type is 'Đường vào: mat_tien | hem_xe_tai | hem_xe_hoi | hem_xe_may | hem. Ở Quận 5 đây là thứ khách hỏi ngay sau giá.';
comment on column public.listings.alley_width_m is 'Bề rộng đường vào (m): rộng hẻm khi access_type là hem_*, rộng lòng đường khi mat_tien. Tên cột nói "alley" nhưng dữ liệu và thongSoNgan() đều dùng cả hai trường hợp.';
comment on column public.listings.distance_to_street_m is 'Từ nhà ra mặt đường lớn bao nhiêu mét.';
comment on column public.listings.frontage_m is 'Ngang (m) — số đầu trong "4x15".';
comment on column public.listings.length_m is 'Dài (m) — số sau trong "4x15".';
comment on column public.listings.rear_width_m is 'Ngang MẶT HẬU (m). Khác frontage_m thì đất nở hậu / tóp hậu.';
comment on column public.listings.legal_area_m2 is 'Diện tích theo SỔ. Lệch area_m2 là chuyện thường và là chuyện phải nói với khách.';
comment on column public.listings.built_area_m2 is 'Diện tích SÀN xây dựng, cộng hết các tầng. Khác area_m2 (diện tích đất).';
comment on column public.listings.floors_text is 'Kết cấu nguyên văn ("1 trệt 2 lầu sân thượng"). Lửng/sân thượng/hầm CHỈ nằm ở đây, floors không đếm.';
comment on column public.listings.bathrooms is 'Số WC.';
comment on column public.listings.legal_status is 'so_hong_rieng | so_hong_chung | so_hong | hdmb | giay_tay.';
comment on column public.listings.has_completion is 'Có giấy hoàn công. Nhà xây sai phép thì sổ có mà hoàn công không.';
comment on column public.listings.planning_status is 'Dính quy hoạch / lộ giới hay không.';
comment on column public.listings.has_elevator is 'Có thang máy.';
comment on column public.listings.car_in_house is 'Xe hơi vào ĐƯỢC TRONG NHÀ. Khác với hẻm xe hơi (xe vào tới cửa rồi đậu ngoài).';
comment on column public.listings.corner_lot is 'Căn góc / hai mặt tiền.';
comment on column public.listings.furnishing is 'full | co_ban | khong.';
comment on column public.listings.year_built is 'Năm xây.';
comment on column public.listings.negotiable is 'Giá còn thương lượng.';
comment on column public.listings.rent_income_vnd is 'Thu nhập cho thuê hiện tại của căn ĐANG BÁN (đồng/tháng) — KHÔNG phải giá cho thuê. Dùng để nói lợi suất với khách đầu tư.';
comment on column public.listings.price_per_m2_vnd is 'Cột TỰ TÍNH price_vnd / area_m2 (default expression). Đừng ghi tay.';

-- ══ Chú thích cột — mấy chỗ hay hiểu nhầm ở bảng khác ══

comment on column public.sellers.phone is 'SĐT người bán. CÓ UNIQUE — chèn trùng sinh 23505 kèm nguyên số trong thông báo lỗi; đường ghi sổ phải qua che_sdt().';
comment on column public.sellers.phone_proxy is 'Số trung gian hiện ra mặt công khai thay cho phone (FR-104).';
comment on column public.sellers.seller_type is 'ccrb (chính chủ, phí 1%) | nmg (môi giới, phí 0.5%) | unknown.';
comment on column public.sellers.active_listing_id is 'Tin người này ĐANG rao dở trong chat — để bot biết câu tiếp theo nói về căn nào.';
comment on column public.buyers.preferences is 'Nhu cầu đã chốt của khách (jsonb). Không có bảng buyer_preferences riêng — chỗ này là nó.';
comment on column public.conversations.needs_human is 'Bot đã giơ cờ cần người thật. Xem việc còn treo ở view khach_can_nguoi_that (FR-77).';
comment on column public.conversations.human_touch_at is 'Lúc người thật thực sự chạm vào. NULL mà needs_human = true nghĩa là khách đang chờ.';
comment on column public.reminders.locked_by is 'Lease chống hai tiến trình cùng gửi một lời nhắc. Đi cặp với locked_at — hết hạn thì lượt sau giành lại được.';
comment on column public.reminders.next_retry_at is 'Lùi dần sau mỗi lần hụt. Quá số lần thì status chuyển ''dead''.';
comment on column public.listing_facts.source is 'Ai trả lời: chu_xac_nhan (bậc 3, cao nhất) | admin (2) | suy_doan (1). Xem hàm bac_nguon().';
comment on column public.media.storage_path is 'Đường dẫn NGOÀI Supabase (masterDB/photos/<legacy_sst>/<n>.jpg). File không nằm trong Storage, nên web không phục vụ được từ đây.';
