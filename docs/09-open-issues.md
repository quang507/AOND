# 09 — Open Issues

Những điểm **chủ dự án cần quyết định**. Mỗi mục nêu vấn đề, phương án, khuyến nghị BA; không
tự chốt (quy ước 2, `CLAUDE.md`). Mục đã chốt hoặc đã đóng chỉ còn MỘT dòng ở bảng thứ hai (kết luận, ngày, hiện thực ở đâu);
thân mục xoá 07/09/2026 theo lệnh chủ dự án, lý lẽ gốc nằm trong lịch sử git. Ký hiệu:
✅ đã chốt · 🚫 đóng vì không còn hợp hướng AOND hoặc mất đối tượng (thứ được hỏi đã gỡ) · 🟡 chốt một phần (vẫn tính còn chờ,
nằm ở bảng thứ nhất).

## Còn chờ chủ dự án (12)

| ID | Vấn đề | Mức | Liên quan |
|---|---|---|---|
| OPEN-02 | "Giao dịch thành công" tính phí ở thời điểm nào: đặt cọc, công chứng hay sang tên? | Cao | BR-05, OPEN-16 |
| OPEN-21 | Vai người rao 5 loại (CĐT/sàn/NMG/lướt sóng/chủ nhà) + phí riêng cho CĐT — mở rộng nhị phân CCRB/NMG? | Trung bình | BR-05, OPEN-28 |
| OPEN-24 | `pg_net` mở cho `anon` (mồi SSRF), REVOKE từ vai `postgres` là no-op — gác cửa cấu hình + ticket Supabase? | Cao | NFR-06, SRS-3.9 |
| OPEN-28 | 🟡 **CHỐT MỘT PHẦN 02/09** — nhãn CCRB/NMG gán lúc mở hồ sơ từ chat; còn: chính chủ rao tin thứ 3 có tự lật sang NMG (FR-160) và phí có đổi theo? | Cao | FR-160, BR-05 |
| OPEN-31 | Bậc nguồn: admin cầm sổ đỏ mà chủ nhà nhớ nhầm thì ai thắng? (FR-164 khoá cột sau `chu_xac_nhan`) | Trung bình | FR-164, FR-156 |
| OPEN-38 | Ảnh tin: thumbnail và watermark trên bậc Free | Thấp | FR-165, NFR-16 |
| OPEN-53 | Ảnh đếm tấm, chưa kiểm ảnh có thật là căn đó | Thấp | FR-177, FR-105 |
| OPEN-59 | Một căn vừa BÁN vừa CHO THUÊ: hai tin, một tin hai giá, hay chọn một loại chính? | Trung bình | FR-150, SRS-5.1zzzw |
| OPEN-63 | Ba chính sách người bán hay hỏi chưa có câu trả lời: thương lượng phí, hợp đồng môi giới / độc quyền, NMG chia hoa hồng | Trung bình | SRS-5.1zzzzzzz116 |
| OPEN-65 | Hạn admin trả lời câu khách hỏi: DB không đặt `sla_due_at` cho dòng giao admin — đặt bao nhiêu giờ, và ngưỡng dừng của I3? | Cao | SRS-5.1zzzzzzz170, FR-140, DH-05 |
| OPEN-66 | Phí CCRB 1% trước có phần CTV hưởng 0,5% (FR-112) — bỏ CTV thì phần đó về đâu? | Trung bình | BR-05, FR-112 |
| OPEN-67 | Chỉ số I4, I5 (`00 §0.5`) không đo được: lõi không ghi `buyers.last_contact_at`, không ghi câu nguồn `seller_flow` / `seller_drip` mà `nmg_hoat_dong` đếm — đo lại thế nào? | Trung bình | FR-63, FR-155, DH-05 |

## Đã chốt / đã đóng (55)

28/10/2026: soát lại theo quyết định chủ dự án (bỏ hẳn CTV; đóng OPEN đã mất đối tượng sau khi bot TypeScript gỡ 18/10) — đóng OPEN-04, 33, 34, 35, 41, 42, 47, 50, 51, 52, 54, 57, 58; dòng 🟡 / 🟢 nằm nhầm bảng này đã xếp lại (56, 60, 64 đã chốt; 59, 63 lên bảng còn chờ; 53 thêm thân mục); mở OPEN-65…67 cho chỗ trống bỏ CTV để lại. [nguồn: chủ dự án 28/10/2026, chat]

| ID | Kết luận | Liên quan |
|---|---|---|
| OPEN-01 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: toán OKR 1.800 chat → 90 giao dịch là kế hoạch 2024; sao Bắc Đẩu nay là lịch xem nhà/tuần (DH-05) | Kế hoạch KD |
| OPEN-03 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: Slack relay/API vendor 2024 đã thay bằng Supabase (FR-166) | SRS-2.2, P2 |
| OPEN-04 | 🚫 Đóng 28/10/2026 — hết đối tượng: bỏ hẳn CTV [nguồn: chủ dự án 28/10/2026, chat]. Bản chốt 07/09 (CTV chốt lịch và dẫn khách, FR-52, FR-173) thôi áp dụng: lịch xem đi thẳng admin (SRS-5.1zzzzzzz165), admin tự báo người dẫn khách qua Zalo (SRS-5.1zzzzzzz172) | UF-06 |
| OPEN-05 | ✅ **ĐÃ CHỐT 07/09/2026** — phương án (b): chỉ xin SĐT ở bước chốt lịch xem, nêu mục đích, cho phép từ chối — đã là bất biến DH-02 #2 (03/09), FR-53 | FR-53, NFR-07 |
| OPEN-06 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: file TOP-100 keyword 2014 không có, trang phụ SEO thuộc nhóm A của OPEN-48 | FR-12, OPEN-44 |
| OPEN-07 | ✅ **ĐÃ CHỐT 24/08/2026** — theme KingTheme (HTML template) cắt vào Next.js; không commit theme vào repo | `06`, OPEN-45 |
| OPEN-08 | ✅ **ĐÃ CHỐT 03/09/2026** — thương hiệu Aioinhadat, bot "Thái" (OPEN-39); tên miền vẫn nhadat.cc [giả định BA] | Copy toàn hệ thống |
| OPEN-09 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: đang chạy Zalo cá nhân qua bridge (FR-145), OA chưa duyệt; hỏi lại khi có OA | FR-63, FR-64 |
| OPEN-10 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: FR-99 định giá so sánh không có trong AOND; `/thong-ke` thuộc nhóm A của OPEN-48 | FR-99 |
| OPEN-11 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: Logstash là hạ tầng vendor 2024; hàng đợi thật nằm trong Postgres (FR-166) | NFR-04, FR-166 |
| OPEN-12 | ✅ **ĐÃ CHỐT 07/09/2026** — theo AOND §V nguyên văn: NMG bị chấm < 3 sao ngưng hợp tác (DH-03: AOND thắng ở mặt bán); phúc tra thủ công bởi admin trước khi ngưng [giả định BA] | FR-137, OPEN-26 |
| OPEN-13 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: tiện ích quanh BĐS (FR-28) thuộc nhóm A của OPEN-48 | FR-28, OPEN-37 |
| OPEN-14 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: fingerprint (FR-16) thuộc nhóm A của OPEN-48, chưa dựng, không dựng | FR-16, NFR-08 |
| OPEN-15 | ✅ **ĐÃ CHỐT 24/08/2026** — phương án (b): MVP chỉ đặt nền data model hàng dự án → FR-113…117 | FR-113…117 |
| OPEN-16 | ✅ **ĐÃ CHỐT 08/2026** — phương án (b): thêm bảng `deals` (FR-112), không mua CRM ngoài; định nghĩa stage chờ OPEN-02 | FR-112, OPEN-02 |
| OPEN-17 | 🚫 Đóng 07/09/2026 — đã hết nghĩa: DB, URL và chat đều đi `BDS-Q5-####` từ FR-158; bot gọi căn bằng địa chỉ (FR-176) | FR-158, OPEN-27 |
| OPEN-18 | ✅ **ĐÃ CHỐT 29/08/2026** — Supabase Storage (FR-165: hai bucket + `listing_media`; upload web FR-96). Còn dọn bảng `media` cũ + bucket `listing-photos` | FR-165, FR-96 |
| OPEN-19 | ✅ **ĐÃ CHỐT 25/08/2026** — (b): tính lãi vay dạng trang `/tinh-lai-vay` (FR-119); quy hoạch không tự khẳng định; thời gian di chuyển giai đoạn 2 | FR-119 |
| OPEN-20 | ✅ **ĐÃ CHỐT 27/08/2026** — LÀM hạng người rao (FR-155), nhưng bằng công thức khác AOND; ngưỡng treo ở OPEN-26 | FR-155, OPEN-26 |
| OPEN-22 | ✅ **ĐÃ CHỐT 27/08/2026** — dữ liệu chia theo dòng; người nhận theo `zalo_user_id`, vai xét từng lượt theo nội dung (FR-157 d) | FR-157 |
| OPEN-23 | ✅ **ĐÃ CHỐT 27/08/2026** — xoá `rate-ctv` + bảng `ratings`; FR-102 `[deprecated → FR-137]` | FR-137 |
| OPEN-25 | ✅ **ĐÃ CHỐT 27/08/2026** — ở lại Free, điều kiện: chạy `sao-luu.mjs` định kỳ + giám sát bridge; xem lại khi có giao dịch thật đầu tiên · **11/09/2026: chủ dự án bỏ sao lưu, chấp nhận rủi ro** [nguồn: chủ dự án 11/09/2026 — "giờ không cần backup ở trên OneDrive nữa, bỏ hết file backup và câu lệnh backup đi, chơi đơn giản"; chọn "Bỏ hết sạch"]. Gỡ `sao-luu.mjs`, `phuc-hoi.mjs`, `soat-phuc-hoi.mjs`, `xuat-onedrive.mjs`. Supabase gói Free không tự sao lưu — mất dữ liệu là không lấy lại được | NFR-16, FR-152 |
| OPEN-26 | ✅ **ĐÃ CHỐT 05/10/2026** — chủ dự án "làm cho giống SRD": hạng theo ĐIỂM người rao (Đồng < 50 · Bạc 50–79 · Vàng ≥ 80), đặc quyền SRD §IV.3 (Đồng ≤ 5 căn; Vàng ưu tiên khách nét — mọi người bán, chốt 06/10 SRS-5.1zzx; CCRB Vàng đẩy rổ ≤ 20 NMG lõi); hạng vẫn ẩn khỏi web (27/08). SRS-5.1zzf | FR-155, OPEN-20 |
| OPEN-27 | ✅ **CHỐT 15/09/2026** — nửa đầu 03/09: địa bàn TP.HCM phường mới + Long An, khởi điểm Quận 5 cũ (FR-174 đợt 1); nửa sau 15/09: DB lưu TÊN PHƯỜNG MỚI (`wards`, FR-209), quận / mã tin giữ tên cũ. Phần (d) thứ tự mở hết đối tượng 20/10/2026: vùng nhận tin mở cùng lúc TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu, Long An, Tây Ninh, Đồng Nai (`prompts.VUNG_NHAN_TIN`, SRS-5.1zzzzzzz86) [nguồn: chủ dự án 20/10/2026 — "hcm long an tây ninh bình dương đồng nai vũng tàu thôi"] | FR-118, FR-174, BR-01 |
| OPEN-29 | ✅ **ĐÃ CHỐT 27/08/2026** — bỏ dấu trước khi khớp mọi regex cổng (FR-161) | FR-161 |
| OPEN-30 | ✅ **ĐÃ CHỐT 28/08/2026** — mọi lệnh gọi model bọc try/catch + `ghiLoi` + câu mẫu (chat-reply v40, nudge v14+) | FR-152, FR-161 |
| OPEN-32 | ✅ **ĐÃ CHỐT 09/09/2026** — phương án (b): ảnh chat kéo về kho rồi phân loại; giấy tờ / không phân loại được → `listing-private`, ảnh nhà → `listing-public`, sổ đọc diện tích đối chiếu (FR-185) | FR-185, FR-165 |
| OPEN-33 | 🚫 Đóng 28/10/2026 — mất đối tượng: edge function `zalo-webhook` gỡ 18/10/2026 (SRS-5.1zzzzzzz31); kênh là Zalo cá nhân qua bridge zca-js, không nhận sự kiện OA [nguồn: chủ dự án 20/10/2026 — "zalo clone là ý chí của tui, ko cần bàn lại"] [nguồn: chủ dự án 28/10/2026, chat]. Chuyển sang OA thì mở OPEN mới | FR-167, SRS-4.4 |
| OPEN-34 | 🚫 Đóng 28/10/2026 — mất đối tượng: cả `zalo-webhook` lẫn `chat-reply` đã gỡ 18/10/2026 (SRS-5.1zzzzzzz31); bridge gọi thẳng lõi Python `127.0.0.1:8000/chat-reply` [nguồn: chủ dự án 28/10/2026, chat] | FR-171, SRS-2 |
| OPEN-35 | 🚫 Đóng 28/10/2026 — mất đối tượng: `nudge`, `ask-seller` gỡ 18/10/2026 (SRS-5.1zzzzzzz31); nhắc cho khách nay lõi gửi bằng câu mẫu điền từ cột thật (`src/aioi/gui_nhac.py`, SRS-5.1zzzzzzz216), báo căn mới cũng câu mẫu (SRS-5.1zzzzzzz188) [nguồn: chủ dự án 28/10/2026, chat] | FR-133, FR-171 |
| OPEN-36 | ✅ **ĐÃ CHỐT 02/09/2026** — lưu hết thông tin chủ chia sẻ, khách hỏi mới khai; liên hệ chỉ mở lúc chốt lịch xem | INS-11, FR-104 |
| OPEN-37 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: lớp POI/quy hoạch/ngập thuộc nhóm A của OPEN-48; quy hoạch vẫn là câu hỏi lại chủ (DH-02 #3) | FR-28, INS-13, OPEN-40 |
| OPEN-39 | ✅ **CHỐT LẠI 09/09/2026** (đảo bản 03/09) — thương hiệu Aioinhadat giữ; trợ lý KHÔNG còn một tên Thái: mỗi khách một tên riêng từ kho •ai (T•ai, Kh•ai… 20 tên, viết hoa chữ đầu, không P•ai), gán tất định theo Zalo ID và giữ suốt (FR-181). Bản 03/09 "một tên Thái" chạy 03–09/09. **14/10/2026 (SRS-5.1zzzzzzz9):** kho •ai bỏ, thay 20 tên người thật — vẫn mỗi khách một tên **25/10/2026 (SRS-5.1zzzzzzz183):** 13 tên có chấm giữa | OPEN-08, FR-181, DH-01 |
| OPEN-40 | ✅ **ĐÃ CHỐT 09/09/2026 tối** — phương án (b) làm cả ba nhóm AOND §III, bằng `required_facts` chứ không thêm cột: cho thuê (FR-186 chiều: nội thất, cọc, thời hạn, trượt giá, fit-out); đất (hướng, hạ tầng, xây dựng + `dat_nong_nghiep`, `dat_kinh_doanh`); công nghiệp `kho_xuong` + toà nhà dòng tiền `toa_nha` (`20260909i`). Lệnh: "đọc lại 2 cái chat Gemini xem có trường hợp nào, đây là production nên không thể bỏ sót cái gì cả" | FR-186, FR-187, DH-03 |
| OPEN-41 | ✅ Chốt 28/10/2026 — phương án (a): giữ Claude làm đường chính, gọi từ lõi Python (`src/aioi/llm/`, không còn qua Supabase Edge): chat khách thật Sonnet 5.5, bóc tách Haiku (SRS-5.1zzzzzzz235); Claude hỏng thì Gemini rồi Groq (SRS-5.1zzzzzzz117, SRS-5.1zzzzzzz133) [nguồn: chủ dự án 28/10/2026 — "để sonnet 5.5 đi, khi nào cần thì thôi đổi lại"] | SRS-2, FR-138, DH-06 |
| OPEN-42 | 🚫 Đóng 28/10/2026 — hết đối tượng: bỏ hẳn CTV [nguồn: chủ dự án 28/10/2026, chat]; hạn 120 phút và hạng CTV không còn dùng. Tàn dư chưa dọn: bảng `ctvs`, view `ctv_ranks`, `ctv_sla_phut()`, nhánh `ctv` của `info_request_sla_tick` cho dòng cũ | FR-173, FR-137, DH-03 |
| OPEN-43 | 🚫 Đóng 07/09/2026 — gộp vào OPEN-48: phần còn lại (FR-16/95/28/160/118, `?ref=`) đều nằm trong danh mục bỏ/giữ ở đó | SRS-2/4/5, `10 §10.8` |
| OPEN-44 | 🚫 Đóng 07/09/2026 — gộp vào OPEN-48: SEO nền đã dựng; TOP-100 keyword chết theo OPEN-06; Search Console là việc vận hành, không phải quyết định | FR-12, NFR-09, OPEN-06 |
| OPEN-45 | 🚫 Đóng 10/09/2026 — `design/tokens.json` và Figma đã xoá khỏi repo 08/09 (commit `459008d`); chỉ còn `06 §6.2` (bản thiết kế) và `app/globals.css` (token thật) — CODE làm gốc, `06` là tham chiếu tone/component, không đối chiếu từng token nữa | UI-01…, OPEN-07 |
| OPEN-46 | 🚫 Đóng 07/09/2026 — đã giảm nhẹ 05/09, không còn gì để chốt: `soat-migration.mjs` chặn trôi, `schema.sql` là lưới dựng lại; nội dung 41 migration mất vĩnh viễn | NFR-04, `bot/README.md` |
| OPEN-47 | 🚫 Đóng 28/10/2026 — mất đối tượng: sao lưu bỏ 11/09 (OPEN-25); `masterDB/` không còn trên máy chủ dự án từ 09/09 nên bucket `masterdb-raw` không còn gì để cất; `up-masterdb.mjs` và bài tự kiểm gỡ 19/10 [nguồn: chủ dự án 28/10/2026, chat] | FR-165, OPEN-25 |
| OPEN-48 | ✅ **ĐÃ CHỐT 08/09/2026** — Sếp và Chủ dự án quyết định bỏ nhóm tính năng thừa kế 2024 (form web /raoban, tài khoản cá nhân, trang phụ SEO, đánh giá 3 thời điểm), chuẩn hóa 100% tài liệu theo Aioinhadat 2026 | DH-01…04, `00 §0.2–0.3`, OPEN-49 |
| OPEN-49 | ✅ **ĐÃ CHỐT 07/09/2026** theo kịch bản Gemini của sếp (tài liệu gốc `Kịch bản huấn luyện môi giới (Gemini 07-09-2026).md`) → FR-177: hỏi 1 thông tin/lần theo thứ tự địa chỉ → giá → hẻm → diện tích → tầng → phòng → pháp lý → ảnh → lịch khảo sát; mỗi câu trả lời có khích lệ; đủ thì gửi bản nháp tin + điểm 100/7 tiêu chí; đủ điểm mới rao | FR-176, FR-129, OPEN-20/26, AOND §II, §VI |
| OPEN-50 | 🚫 Đóng 28/10/2026 — mất đối tượng: không còn cổng điểm 70. Bản nháp ra khi đủ loại hình + vị trí + giá (SRS-5.1zzzzzzz200, SRS-5.1zzzzzzz202, chủ dự án 26/10); tin lên web theo trigger `listings_quyet_dinh_dang_tin` = giá + diện tích + phường + chủ gật; điểm tin chỉ còn đưa cho model (`prompts.khoi_diem_tin`) [nguồn: chủ dự án 28/10/2026, chat] | FR-177, FR-155, OPEN-26, DH-03 |
| OPEN-51 | 🚫 Đóng 28/10/2026 — mất đối tượng: không còn đường gọi Zalo OA API nào, kênh ở lại bridge zca-js [nguồn: chủ dự án 20/10/2026 — "zalo clone là ý chí của tui, ko cần bàn lại"]; nhánh `70a63ab` không dựng lại [nguồn: chủ dự án 28/10/2026, chat] | FR-152, NFR-18, OPEN-46 |
| OPEN-52 | 🚫 Đóng 28/10/2026 — mất đối tượng: trần FR-146 đếm theo `external_user_id` nằm trong `chat-reply` TypeScript, gỡ 18/10/2026 (SRS-5.1zzzzzzz31); bridge gọi lõi Python ở `127.0.0.1:8000`. Trần lượt của lõi chưa soát, cần thì mở OPEN mới [nguồn: chủ dự án 28/10/2026, chat] | FR-146, FR-151, SEC-02 |
| OPEN-54 | 🚫 Đóng 28/10/2026 — mất đối tượng: FR-180 `[deprecated 18/10/2026]` (bảng `mau_cau`, trang `/admin/mau-cau` gỡ), bộ đo giọng `bot/tests/giong/` và thư mục `train/` không còn trong repo. Giọng nay chỉnh bằng câu chuẩn `/admin/cau-chuan` (SRS-5.1zzzzzzz88) và prompt `src/aioi/prompts.py` [nguồn: chủ dự án 28/10/2026, chat] | FR-180, OPEN-42 |
| OPEN-55 | ✅ **ĐÃ CHỐT 09/09/2026** — chủ dự án đọc lại chat Gemini "AI Ơi Nhà Đất" 21–27/06 (share) + chat 07/09 (PDF) rồi chốt 14 dòng chat ↔ hệ thống: (1) kênh Zalo cá nhân qua bridge, chỉ gửi chữ — GIỮ (nút bấm chờ OA); (2) mỗi khách một tên T•ai, Kh•ai… — THEO CHAT → FR-181; (3) loại BĐS trước, vị trí linh hoạt — GIỮ (sếp 07/09); (4) hỏi hướng — THEO CHAT cho chung cư và đất, nhà phố vẫn không → FR-186; (5) hỏi đúng một thông tin — GIỮ; (6) gán nhãn tự động, không nêu phí — GIỮ; (7) khách hỏi thứ thiếu → bot hỏi CHỦ NHÀ trước, 12 giờ không hồi âm mới hỏi CTV — MỚI → FR-173 a; (8) lên kệ khi đủ giá + diện tích + phường hoặc 70 điểm, ảnh 10 điểm, sổ không bắt buộc — GIỮ; (9) hỏi địa chỉ nêu lý do "kiểm tra giá thị trường khu vực" — THEO CHAT (đảo quyết định sáng 09/09 "bỏ định giá"; bot vẫn không đưa con số) → FR-177 h; (10) có CẢ điểm từng tin và điểm người rao — THEO CHAT → FR-183; (11) nhịp hỏi bù 5 phút / 30 phút / 3 câu/ngày / 2 căn/người, KHÔNG luật 7 ngày Zalo — GIỮ; (12) bot tự nêu kiến thức dự án ("Sunrise City có hồ bơi Olympic") — THEO CHAT → FR-114 d; (13) SharePoint/Power Automate/Dialogflow — không nhận, Supabase; (14) domain aioinhadat.vercel.app — GIỮ. Thêm: "bán rồi" → FR-184; ảnh vào kho + phân loại + OCR → FR-185; bộ câu hỏi theo loại + cho thuê → FR-186. 10/09/2026 chủ dự án ra lệnh làm hết phần treo: keep-alive 6 ngày + hỏi bổ sung → FR-191; người thật giữ/trả bot → FR-189; CTV theo khu + trần 15 ca → FR-190; gấp bên bán + bên mua → FR-188; không hỏi lần thứ hai → FR-186 o. Còn treo: phân loại lại ảnh đã có trong kho (kho đang 0 file), hạng theo điểm người rao (OPEN-26) | FR-181…186, FR-173, FR-177, FR-114 |
| OPEN-56 | ✅ **CHỐT 10/09/2026** — nguồn kho dự án là mogi (chủ dự án: "crawl đi, lấy tối đa"), `scripts/thu-du-an.mjs` chỉ lấy DỮ KIỆN, mô tả viết lại, giữ `source_url`. Nay kho ~2.362 dự án (SRS-5.1zzzzzzz180); phía mua tra theo tên và vector (SRS-5.1zzzzzzz184, SRS-5.1zzzzzzz185). Soát chất lượng từng dòng là việc vận hành, không còn quyết định treo | FR-193 d, FR-114 d, FR-174 |
| OPEN-57 | 🚫 Đóng 28/10/2026 — mất đối tượng: đường `bo_sung` thuộc bóc tách TypeScript (`chat-reply`), gỡ 18/10/2026 (SRS-5.1zzzzzzz46); lõi Python không có ô `bo_sung`, ô tự do `uu_the` chỉ giữ cụm nằm nguyên trong lời khách (SRS-5.1zzzzzzz205) [nguồn: chủ dự án 28/10/2026, chat] | FR-177 c, FR-209, TS-GIONG-05 |
| OPEN-58 | ✅ Chốt 28/10/2026 — (a) đã làm 25/09 (bảng `duong` đủ 168/168 phường TP.HCM); (b) Google Geocoding không dùng: địa chỉ có số nhà tra Nominatim qua rpc `tra_nominatim` trước, không ra mới hỏi (`engine._phuong_tu_dia_chi`, SRS-5.1zzzzzzz236) [nguồn: chủ dự án 28/10/2026 — "search phường trước bằng nominatim, nếu search không được mới hỏi"] | FR-223 n, FR-209, FR-212 |
| OPEN-60 | ✅ **CHỐT (a) 09/10/2026** ("ừ") — thêm 57 dòng `phuong_cu` có nguồn NQ 1111/NQ-UBTVQH14 (2020) và NQ 1278/NQ-UBTVQH15 (2024), mỗi dòng ghi số NQ + Điều / khoản (SRS-5.1zzzzl, migration `20261009d`). Phường số không có trong hai văn bản vẫn để bot hỏi, không thêm dòng khi chưa có văn bản | SRS-5.1zzzzj, FR-209 |
| OPEN-61 | ✅ **ĐÃ CHỐT 09/10/2026 — phương án (a)** (chủ dự án: "để chính chủ đi"): mặc định vẫn gán chính chủ khi mở hồ sơ (FR-159), con số phí chỉ nói khi vai đã xác nhận (`tu_nhan` / `admin`). Không đổi mặc định sang `unknown`. Nội dung cũ giữ dưới làm dấu vết. 🟡 **Nhãn người rao ĐOÁN dùng cho kế toán, chưa xác nhận dùng cho lời nói** (SRS-5.1zzzzj, bắn production 09/10/2026: "phí sao em" → "1% giá chốt" với người chưa nói vai). FR-159 (chủ dự án 02/09) gán chính chủ ngay khi mở hồ sơ để deal có phí (FR-170 f), hạng, ưu tiên chủ nhà (FR-173 a) chạy. Đã làm: cột `sellers.seller_type_source` (suy_doan / tu_nhan / admin), con số phí chỉ nói khi tu_nhan / admin; nhãn và mọi chỗ dùng nhãn khác KHÔNG đổi. **Còn treo**: có nên đổi luôn mặc định nhãn sang `unknown` tới khi người rao tự nói (deal của nhãn `unknown` không có phí, hạng / ưu tiên không tính) không; và các nhãn `nmg` / `ccrb` có trên DB trước 20261009c đều là `suy_doan` (bot không nói số cho họ tới khi họ tự nói lại hoặc admin đặt). **Phương án**: (a) giữ như đã làm; (b) mặc định `unknown` + bot hỏi khéo vai ở lượt đầu. **Khuyến nghị BA:** (a). Chờ chủ dự án chốt. | FR-159, FR-170, SRS-5.1zzzzj |
| OPEN-62 | ✅ **ĐÃ CHỐT 09/10/2026 — phương án (a)** (chủ dự án: "bật đi"): bỏ gạch dài "—" và "anh/chị" gạch chéo LUÔN bật ở đường ra, không theo công tắc `luat_loi_bot`; lời khen đoán người mua bỏ. Nội dung cũ giữ dưới làm dấu vết. 🟡 **Hai việc đổi một phần quyết định giọng 06/10 (SRS-5.1zzn) — cần chủ dự án xác nhận** (SRS-5.1zzzzj). (1) Gạch dài "—" và "anh/chị" gạch chéo nay LUÔN chuẩn ở đường ra (trước: tắt khi `luat_loi_bot` = gọn) — TONE_RULES cấm cả hai, nên lưới chỉ giữ đúng điều prompt nói; các van sửa VĂN khác vẫn theo công tắc. (2) Lời khen đoán NGƯỜI MUA ("hẻm xe hơi là khách chuộng lắm", "căn này dễ bán lắm") bỏ khỏi câu mẫu giọng và lượt soát bỏ nó — khen chỉ nói lợi ích thật của đặc điểm ("ô tô tới tận nhà, đi lại tiện lắm"). Bảng `mau_cau` (mẫu chuẩn sửa tay trên DB, FR-180) nếu còn câu "khách chuộng" thì sẽ dạy ngược — cần soát tay. **Phương án**: (a) giữ cả hai; (b) trả (1) về công tắc. **Khuyến nghị BA:** (a). | SRS-5.1zzn, SRS-5.1zzzzj, FR-180 |
| OPEN-64 | ✅ **CHỐT 23/10/2026** — phương án (a): giữ 63 cột `listings`, chỉ dọn khi có cột chết mới [nguồn: chủ dự án 23/10/2026 — "từ từ vẫn giữ vậy đi"]; 7 cột chết đã gỡ (70 → 63, SRS-5.1zzzzzzz140) | SRS-5.1zzzzzzz140 |

---

### OPEN-02 · Định nghĩa "giao dịch thành công"
**Vấn đề**: không tài liệu nào định nghĩa thời điểm phát sinh phí (cọc, công chứng, sang tên), cũng
chưa rõ hệ thống ghi nhận giao dịch hay làm ngoài (ASM-05). Stage của bảng `deals` (OPEN-16) phụ
thuộc câu này.
**Phương án**: (a) đặt cọc; (b) công chứng HĐMB; (c) sang tên.
**Khuyến nghị BA**: (b); MVP ghi nhận thủ công trong admin, chưa cần module hợp đồng.
**Chờ**: chủ dự án.

### OPEN-21 · Vai người rao 5 loại + phí riêng cho chủ đầu tư
**Vấn đề**: `AOND req + chat examples.docx §V` — thực tế có 5 vai: CĐT (bán sơ cấp, trả hoa hồng cho
sàn, KHÔNG trả 1%), sàn, NMG, lướt sóng (giữ HĐMB), chủ nhà. Nhị phân CCRB 1%/NMG 0.5% của BR-05 là
đơn giản hoá; gặp CĐT bot không được tự báo con số phí.
**Phương án**: (a) giữ nhị phân, thêm cờ "là CĐT?" để bot né báo phí; (b) mở `seller_type` thành 5
vai + luật hỏi theo giai đoạn dự án; (c) chờ gặp CĐT thật.
**Khuyến nghị BA**: (a) ngay, (b) khi có dự án sơ cấp đầu tiên. **Chờ**: chủ dự án.
**06/10/2026 (SRS-5.1zzq)**: câu phí nay MỘT NGUỒN `cauPhi()` — thuê 3/4 tháng, vai `unknown` không báo số; `FEE_RULES`
đã dặn model không báo số cho CĐT. Còn thiếu đúng phần nhận diện: thêm giá trị `chu_dau_tu` vào `Vai` của AI
(`_shared/ai/boc-rao.ts`, có trích dẫn, code kiểm `docVai`) + cột/cờ `la_cdt` trên `sellers` (migration) → `cauPhi` trả
"để em kết nối bộ phận hợp tác dự án". Một PR riêng khi chủ dự án chốt (a).
**28/10/2026**: `cauPhi()`, `FEE_RULES` và `_shared/ai/boc-rao.ts` đã gỡ cùng bot TypeScript (SRS-5.1zzzzzzz46). Phí nay một
nguồn `prompts.muc_phi(vai, thuê)` ở lõi Python, lưới `engine._phi_lech_vai` (SRS-5.1zzzzzzz227); vai chỉ nhận khi khách gọi tên
vai (`_vai_co_bang_chung`, SRS-5.1zzzzzzz213). Làm (a) thì thêm vai CĐT ở hai chỗ đó.

### OPEN-24 · `pg_net` mở cho `anon` — mồi SSRF không vá được bằng SQL
**Vấn đề**: `anon` có USAGE schema `net` + EXECUTE `net.http_post` (đo 26/08); chưa khai thác được
chỉ vì PostgREST không phơi `net` — hàng rào cấu hình, không phải quyền. Không tự REVOKE được: schema
thuộc `supabase_admin`, lệnh từ vai `postgres` là no-op im lặng.
**Phương án**: (a) gác cửa — giữ Exposed schemas đúng `public, graphql_public`, cấm hàm SECURITY
INVOKER trong `public` gọi `net.*`; (b) ticket Supabase xin thu hồi grant mặc định; (c) bỏ `pg_net`
— không khả thi, cron gọi edge function qua nó.
**Khuyến nghị BA**: (a) ngay + (b) song song. **Chờ**: chủ dự án (ticket Supabase).

### OPEN-28 · Phí có đi theo phân loại tự động của FR-160 không?
**Vấn đề**: FR-160 định "≥3 tin rao bán = môi giới", nhưng `seller_type` đồng thời là căn cứ phí
(CCRB 1%, NMG 0.5%): chính chủ mở tin thứ ba là phí tự rơi một nửa, gỡ tin lại leo.
🟡 Chủ dự án chốt nửa đầu 02/09 ("Gán nhãn khi ai bóc tách là họ có bds muốn bán"): nhãn gán lúc mở
hồ sơ từ chat — có BĐS bán = chính chủ, tự xưng môi giới = môi giới (FR-159, `20260902a`); `unknown`
→ `fee_pct = null`. Nghiệm thu 04/09: FR-160 chưa có trong code, hàm DB không ghi đè nhãn đã có.
**Phương án**: (a) tách hai khái niệm — cột dẫn xuất `vai_hanh_vi` từ số tin (cho giọng drip +
hạng), `seller_type` khai tay là căn cứ phí; (b) ghép làm một, phí trôi theo số tin.
**Khuyến nghị BA**: (a) — phí là cam kết, không đổi sau lưng. **Chờ**: chủ dự án, trước khi code FR-160.

### OPEN-31 · Bậc nguồn khi admin cầm bằng chứng cứng
**Vấn đề**: FR-164(a) xếp `chu_xac_nhan` (3) > `admin` (2) > `suy_doan` (1) và KHOÁ cột sau lời chủ
— đúng với tin admin nhặt từ Chợ Tốt/Facebook (FR-156), nhưng admin cầm sổ đỏ mà chủ nhà nhớ nhầm
diện tích/phường thì không ghi đè được.
**Phương án**: (a) thêm bậc `admin_xac_minh` (4) cho trường hợp đã đối chiếu giấy tờ; (b) giữ
nguyên, admin nhắn hỏi để chủ nhà tự sửa.
**Khuyến nghị BA**: (a) — bằng chứng giấy tờ khác hẳn lời nói. **Chờ**: chủ dự án. Chưa dựng.

### OPEN-38 · Ảnh tin: thumbnail và watermark trên bậc Free
**Vấn đề**: ta lưu file gốc (vài MB/tấm) trong `listing-public`; lưới 24 thẻ = vài chục MB nếu có
ảnh thật. Biến đổi ảnh của Supabase là tính năng Pro (NFR-16).
**Phương án**: (a) `up-anh.mjs`/upload web sinh thêm bản 480px (sharp) vào `listing_media.variants`;
(b) `next/image` loader tự viết (Hobby có hạn mức); (c) chờ Pro. Watermark: chỉ khi có tin bị chép.
**Khuyến nghị BA**: (a), làm khi có >20 tin có ảnh thật. **Chờ**: chủ dự án.

### OPEN-53 · Ảnh đếm tấm, chưa kiểm ảnh có thật là căn đó
**Vấn đề** (FR-177 f, 09/09/2026): chủ dự án chốt "có 3 ảnh thì tính đủ, ảnh nào cũng được" — 3 tấm bất kỳ là đủ điểm ảnh.
Chủ nhà gửi ảnh mạng / ảnh căn khác vẫn đủ điểm, và web hiện ảnh đó cho khách.
**28/10/2026**: phương án cũ (1) dựa vào CTV khảo sát làm lưới — CTV đã bỏ [nguồn: chủ dự án 28/10/2026, chat]; điểm tin
không còn chặn lên web (OPEN-50 đóng) nhưng ảnh vẫn hiện cho khách.
**Phương án**: (1) giữ nguyên, admin là lưới khi có khách phản ánh; (2) chỉ hiện ảnh sau khi admin duyệt (FR-105, cố ý chưa
làm); (3) model chấm "ảnh có phải nhà / sổ / hẻm không" trước khi tính điểm và hiện.
**Khuyến nghị BA**: (1) cho tới khi có khách thật bị lừa ảnh. **Chờ**: chủ dự án.

### OPEN-59 · Một căn vừa BÁN vừa CHO THUÊ
**Vấn đề** (chủ dự án 08/10/2026, khi duyệt SRS-5.1zzzw: "nhưng vậy thì khi người ta vừa bán vừa cho thuê, hoặc chuyển đổi
có được ko"): cột `listings.deal` là enum MỘT giá trị (`ban` | `cho_thue`). Đổi ý ("đổi ý, cho thuê luôn") đã chạy; "bán hoặc
cho thuê đều được" cho cùng một căn thì chưa có thiết kế — tin chỉ mang một loại, giá thuê và giá bán không cùng chỗ.
**Phương án**: (a) mở HAI tin cho cùng một căn (một bán, một thuê), hai giá riêng, gắn chung mã căn; (b) một tin thêm cờ
"nhận cả cho thuê" + ô giá thuê phụ (đổi schema, web, bản nháp, phí theo cả hai); (c) giữ một loại, bot hỏi khách chọn loại
chính, ý còn lại ghi vào thông tin thêm.
**Khuyến nghị BA**: (a) — không đổi schema, mỗi tin một giá, phí theo loại (`prompts.muc_phi(vai, thuê)`; `cauPhi` TypeScript
cũ đã gỡ 18/10). **Chờ**: chủ dự án.

### OPEN-63 · Ba chính sách người bán hay hỏi, bot chưa có câu trả lời
**Vấn đề** (soát 21/10/2026 theo bộ câu môi giới chủ dự án gửi; chủ dự án: "4 5 6 từ từ"): (1) **thương lượng phí** — chủ
nhà "0.5% được không", "chính chủ bớt phí nhé"; bot chỉ nhắc lại mức phí (`prompts.muc_phi`), không có luật giảm. (2) **Hợp
đồng môi giới / độc quyền** — "có ký hợp đồng không", "gửi riêng bên em hay nhiều nơi", "thống nhất phí bằng văn bản"; chưa
có văn bản mẫu. (3) **NMG hỏi chia hoa hồng / bán chung** — chưa có kịch bản riêng. Cùng nhóm: xin chủ đồng ý chụp ảnh, quay
video, đăng quảng cáo. Hiện bot không hứa gì ngoài chính sách.
**Phương án**: (a) chủ dự án chốt từng chính sách rồi BA viết câu trả lời (câu mẫu ở `/admin/cau-chuan`) + luật; (b) để
nguyên, bot báo admin.
**Khuyến nghị BA**: (a), làm (2) trước — văn bản hợp đồng là thứ khách hỏi sớm nhất. **Chờ**: chủ dự án.

### OPEN-65 · Hạn admin trả lời câu khách hỏi
**Vấn đề** (soát 28/10/2026 sau khi bỏ CTV [nguồn: chủ dự án 28/10/2026, chat — bỏ CTV]): trigger `route_info_request` chỉ đặt `sla_due_at` khi câu giao chủ nhà
(`chu_nha_han_gio()`, 12 giờ). Câu giao thẳng admin (tin không có chủ nhà trên hệ thống, SRS-5.1zzzzzzz170) không có hạn, và
câu chủ nhà quá hạn chuyển admin thì `info_request_sla_tick` đặt `sla_due_at = null`. Hậu quả: I3 (`00 §0.5`) không đo được
phần admin, không có gì nhắc admin khi để câu khách nằm lâu. Ngưỡng dừng "<30% câu được trả lời trong 48 giờ; admin phải đỡ
>50%" ở `00 §0.7` cũng là *[giả định BA]*.
**Phương án**: (a) đặt hạn admin 24 giờ *[giả định BA]* bằng migration (trigger + vòng tick nhắc lại admin), I3 đếm cả hai
phía; (b) không đặt hạn, I3 chỉ đo phần chủ nhà, phần admin đọc tay ở `/admin`.
**Khuyến nghị BA**: (a) — câu khách chờ không ai nhắc là đúng loại hỏng im lặng NFR-18. **Chờ**: chủ dự án chốt con số và
ngưỡng dừng.

### OPEN-66 · Phần phí CTV hưởng sau khi bỏ CTV
**Vấn đề**: FR-112 ghi `deals` "phí CCRB 1% (CTV hưởng 0.5%)", `00 §0.10` cũng ghi "phần 0,5% trước chia CTV". Bỏ CTV
[nguồn: chủ dự án 28/10/2026, chat — bỏ CTV] thì phần đó chưa có chỗ: người dẫn khách nay do admin tự báo qua Zalo (SRS-5.1zzzzzzz172), không có trong hệ thống. Mức phí
khách trả không đổi (`prompts.muc_phi`).
**Phương án**: (a) cả 1% về công ty; (b) giữ một phần cho người dẫn khách admin chọn, ghi tay vào `deals`; (c) để ngoài hệ
thống, `deals` chỉ ghi tổng phí.
**Khuyến nghị BA**: (c) cho tới khi có giao dịch thật đầu tiên — hệ thống chưa có vai người dẫn khách để gắn tiền. **Chờ**: chủ
dự án.

### OPEN-67 · Đo lại I4, I5 sau khi bỏ bot TypeScript
**Vấn đề** (soát 28/10/2026): I4 "kết nối Zalo sống sau 30 ngày" dựa vào `buyers.last_contact_at` — lõi Python không ghi cột
này, DB cũng không có trigger nào ghi (chỉ `/admin` đọc). I5 "NMG hoạt động" dựa vào view `nmg_hoat_dong`, view đếm câu
`info_requests` nguồn `seller_flow` / `seller_drip` trả lời trong 7 ngày — lõi chỉ ghi nguồn `buyer_ask`, hỏi người bán
nằm trong phiên chat chứ không thành dòng `info_requests`. Hai chỉ số luôn ra 0 dù có hoạt động.
**Phương án**: (a) I4 đếm từ `messages` (khách mua có tin sau ngày 30), I5 đếm tin người bán trong `messages` + tin đang rao,
sửa view bằng migration; (b) lõi ghi lại `last_contact_at` mỗi lượt và giữ view cũ; (c) bỏ I4 / I5 khỏi bộ chỉ số.
**Khuyến nghị BA**: (a) — đo từ dữ liệu có sẵn, không thêm đường ghi. Cách đo cụ thể *[giả định BA]*. **Chờ**: chủ dự án.

---

### Advisor Supabase — các cảnh báo cố ý giữ

Ghi lại để lần sau không ai đi "vá" nhầm. Mọi cảnh báo dưới đây là chủ ý, đã đo.

| Cảnh báo | Đối tượng | Vì sao giữ |
|---|---|---|
| `security_definer_view` (ERROR) | `agents_public` | Anon phải đọc được hình chiếu NMG đã cắt sạch liên hệ (FR-125). View **tự chứa**, không join view khác — `20260827g` từng lỡ đổi sang invoker làm `/moi-gioi` trống, vá `20260904b` (TS-SEC-08) |
| `security_definer_view` (ERROR) | `listing_photos_v` | Ghép URL từ `app_config` mà anon đã bị thu quyền đọc (TS-KHO-21); chỉ trả ảnh bucket public của tin đã lên kệ (FR-167c) |
| `security_definer_view` (ERROR) | `ctv_ranks`, `hoi_thoai_thong_ke`, `khach_can_nguoi_that`, `nmg_hoat_dong`, `bds_hot`, `bot_do_tre` | Bảng nguồn bật RLS không policy; view tự gác cổng bằng `auth.role() = 'service_role'` hoặc email trong `admins`; anon đọc 0 dòng (TS-ADM2). `ctv_ranks` là tàn dư CTV (bỏ 28/10/2026), chưa gỡ |
| `anon_security_definer_function_executable` (WARN) | `doc_danh_sach(text)` | Trang `/ds/<token>` đọc bằng publishable key (FR-100); hàm chỉ trả tin đã lên kệ của một token còn hạn, không trả `buyer_id`. **Đừng thu hồi** — thu là trang danh sách riêng trắng |
| `anon_security_definer_function_executable` (WARN) | `log_loi` | Web chạy publishable key nên phải mở cho anon (FR-152 d); có van 20 dòng/nguồn/giờ và 200 dòng/giờ |
| `extension_in_public` (WARN) | `pg_net` | Schema thuộc `supabase_admin`, không tự chuyển được — cùng gốc OPEN-24 |
| `rls_enabled_no_policy` (INFO ×12) | `messages`, `conversations`, `reminders`, `deals`… | Bật RLS không policy = chặn hết, chỉ `service_role` đụng được — đúng ý |
| `multiple_permissive_policies` (WARN hiệu năng) | `listings`, vai `authenticated` | Giữ 3 policy cho rõ luật quyền; gộp khi `listings` qua ~10k dòng. 8 index chưa dùng: để đó, bảng còn nhỏ |

**Đã vá, không còn trong danh sách trên** — `20260904h` (04/09/2026): 8 hàm
trigger tạo mới ở `20260904c/d/f` nhận EXECUTE mặc định của `public` nên lộ ra
`/rest/v1/rpc/`; nay chỉ còn `service_role`. Hàm trigger cũ không dính vì
`create or replace` giữ nguyên quyền đã thu hồi.

### OPEN-48 · Bớt kế thừa nhadat.cc — bỏ gì để giống Aioinhadat hơn
✅ **ĐÃ CHỐT 08/09/2026**: Sếp và Chủ dự án quyết định đóng dứt điểm nhóm A (tính năng 2024 cũ),
bỏ hoàn toàn việc bắt điền form trên web `/raoban`, bỏ tài khoản người dùng và các trang phụ SEO cũ,
tập trung 100% tài liệu và sản phẩm vào triết lý Aioinhadat 2026 (Zalo chat tự nhiên + Rổ hàng + Hẹn xem nhà).
**Nguồn sếp chưa đọc được:** yêu cầu đầy đủ nằm ở Gemini share `z7XT8gqQzGCI` (chủ dự án gửi
07/09) — môi trường làm việc bị chặn `share.gemini.google`, nên bản dưới chỉ dựa trên SRD AOND
và câu tóm tắt của chủ dự án. **Cần chép nội dung share đó vào thư mục gốc (tài liệu gốc, chỉ
đọc) rồi soát lại danh mục A/B/C** trước khi sếp tick.

**Vấn đề.** `00 §0.1` chốt "mặt bán theo AOND, mặt mua + web theo nhadat.cc" (03/09). Sếp nay
muốn nghiêng hẳn về AOND. Nhưng "giống AOND hơn" không tự nói bỏ cái gì: SRD AOND KHÔNG có
website, KHÔNG có tài khoản, KHÔNG có trang phụ — chỉ có Zalo + kho + CTV. Nếu cắt đúng theo
SRD thì cắt cả phễu web, mà DH-02 bất biến 1 ("mọi trang web là phễu về Zalo") và INS-01 vẫn
đứng. Dưới đây là danh mục **chỉ có ở nhadat.cc 2024, AOND không có** để sếp tick từng dòng;
BA không tự cắt (quy ước 2).

**A · Có thể bỏ ngay — không đụng DH-02, AOND không có, hoặc đã có đường thay:**

| FR | Là gì | Vì sao bỏ được | Trạng thái |
|---|---|---|---|
| FR-90, FR-94 | Mini-site `/raoban` 3 bước + `/quan-ly` xác nhận bản bóc tách | AOND §I: rao trong Zalo, không form; FR-158 đã thay bằng câu rao Zalo sinh mã tin | ✅ đang chạy |
| FR-124, FR-126, FR-121, FR-95 | Đăng nhập NMG magic-link, tài khoản người mua, tin yêu thích, Zalo SSO | AOND không có tài khoản; người rao sống trong Zalo (`sellers.zalo_user_id`) | ✅/✅/✅/❌ |
| FR-119, FR-120, FR-122, FR-125 | `/tinh-lai-vay`, `/thong-ke`, `/ban-do`, `/moi-gioi` | Trang phụ SEO, không nằm trong hai luồng Zalo | ✅ |
| FR-93, FR-16, FR-28, FR-15 | Biến thể câu rao, fingerprint, tiện ích quanh nhà, điều hướng nội bộ | Chưa dựng hoặc một phần — bỏ là bỏ trên giấy | ❌/❌/❌/🟡 |
| FR-56, FR-65 | Xin đánh giá 3 thời điểm, chấm sao sau xem | AOND §V chỉ có "NMG < 3 sao ngưng hợp tác" — một chỗ, không phải ba | 🟡 |
| FR-81, FR-57 | Email `[QUESTION]/[VIEWING]` cho admin | AOND §VII: Live Chat Monitor + nhãn; ta đã có Zalo admin (FR-149) + còi ntfy | 🟡 |
| FR-100 | Danh sách riêng cho một khách (`curated_lists`) | AOND không có; 0 dòng dữ liệu | 🟡 |

**B · Giữ, vì bất biến hoặc vì AOND cũng cần:** phễu web tối thiểu (FR-01/07/10/13/14/17/145 —
DH-02 #1, INS-01), toàn bộ mặt mua trong Zalo (FR-20…32, 40…47, 50…55, 60…64 — AOND §VII
bot-to-bot cũng cần một "tổ người mua"), phí BR-05, CTV FR-136/173 (AOND §V "hệ thống điều
phối CTV"), sổ lỗi/nhịp tim (vận hành, không phải tính năng).

**C · Hỏi lại trước khi đụng:** tầng dự án sơ cấp FR-113…117, FR-132 (AOND không có nhóm này,
nhưng kho đang giữ dự án Ny'ah Phú Đông và OPEN-21 CĐT còn treo); admin FR-70…80 (AOND có
Live Chat Monitor — giữ `/admin` nhưng dựng theo nhãn `[AI_HANDLING]/[NEED_HUMAN]` thay bảng
thống kê kiểu 2024?).

**Phương án.** (a) Bỏ hẳn nhóm A: gỡ route, đánh `[deprecated]` trong `02`, cập nhật `04`
sitemap + `08`; (b) **Ẩn trước, xoá sau**: gỡ khỏi menu/sitemap/nội dung SEO nhưng giữ code
một đợt, để đo có ai vào không; (c) giữ nguyên, chỉ đổi copy cho giống AOND.
**Khuyến nghị BA:** (b) ngay cho A, vì repo và web đang public, trang đã được index — xoá là
mất link Google đã có; đo 30 ngày rồi (a). Nhóm C hỏi sếp từng dòng. Mọi dòng A bỏ thì
`00 §0.2` cột "Hôm nay" và `§0.3` đổi theo, `02` đánh `[deprecated → …]` không đánh số lại.
**Chờ:** sếp tick A và trả lời C. Cho tới lúc đó không gỡ gì (DH-07).

