# 09 — Open Issues

Những điểm **chủ dự án cần quyết định**. Mỗi mục nêu vấn đề, phương án, khuyến nghị BA; không
tự chốt (quy ước 2, `CLAUDE.md`). Mục đã chốt hoặc đã đóng chỉ còn MỘT dòng ở bảng thứ hai (kết luận, ngày, hiện thực ở đâu);
thân mục xoá 07/09/2026 theo lệnh chủ dự án, lý lẽ gốc nằm trong lịch sử git. Ký hiệu:
✅ đã chốt · 🚫 đóng vì không còn hợp hướng AOND · 🟡 chốt một phần (vẫn tính còn chờ).

## Còn chờ chủ dự án (17)

| ID | Vấn đề | Mức | Liên quan |
|---|---|---|---|
| OPEN-02 | "Giao dịch thành công" tính phí ở thời điểm nào: đặt cọc, công chứng hay sang tên? | Cao | BR-05, OPEN-16 |
| OPEN-04 | ✅ **ĐÃ CHỐT 07/09/2026** — CTV chốt lịch và dẫn khách (FR-52, FR-173); NMG bận thì CTV thay, AOND §V "hệ thống tự điều phối CTV dẫn khách" | UF-06 |
| OPEN-05 | ✅ **ĐÃ CHỐT 07/09/2026** — phương án (b): chỉ xin SĐT ở bước chốt lịch xem, nêu mục đích, cho phép từ chối — đã là bất biến DH-02 #2 (03/09), FR-53 | FR-53, NFR-07 |
| OPEN-12 | ✅ **ĐÃ CHỐT 07/09/2026** — theo AOND §V nguyên văn: NMG bị chấm < 3 sao ngưng hợp tác (DH-03: AOND thắng ở mặt bán); phúc tra thủ công bởi admin trước khi ngưng [giả định BA] | FR-137, OPEN-26 |
| OPEN-21 | Vai người rao 5 loại (CĐT/sàn/NMG/lướt sóng/chủ nhà) + phí riêng cho CĐT — mở rộng nhị phân CCRB/NMG? | Trung bình | BR-05, OPEN-28 |
| OPEN-24 | `pg_net` mở cho `anon` (mồi SSRF), REVOKE từ vai `postgres` là no-op — gác cửa cấu hình + ticket Supabase? | Cao | NFR-06, SRS-3.9 |
| OPEN-26 | ✅ **ĐÃ CHỐT 05/10/2026** — chủ dự án "làm cho giống SRD": hạng theo ĐIỂM người rao (Đồng < 50 · Bạc 50–79 · Vàng ≥ 80), đặc quyền SRD §IV.3 (Đồng ≤ 5 căn; Vàng ưu tiên khách nét — mọi người bán, chốt 06/10 SRS-5.1zzx; CCRB Vàng đẩy rổ ≤ 20 NMG lõi); hạng vẫn ẩn khỏi web (27/08). SRS-5.1zzf | — | FR-155, OPEN-20 |
| OPEN-27 | ✅ **CHỐT 15/09** — nửa đầu 03/09: địa bàn = Sài Gòn phường mới + Long An, khởi điểm Quận 5 cũ (FR-174 đợt 1); nửa sau 15/09: DB lưu TÊN PHƯỜNG MỚI (`wards`, FR-209), quận/mã tin giữ tên cũ; còn thứ tự mở | Cao | FR-118, FR-174, BR-01 |
| OPEN-28 | 🟡 **CHỐT MỘT PHẦN 02/09** — nhãn CCRB/NMG gán lúc mở hồ sơ từ chat; còn: chính chủ rao tin thứ 3 có tự lật sang NMG (FR-160) và phí có đổi theo? | Cao | FR-160, BR-05 |
| OPEN-31 | Bậc nguồn: admin cầm sổ đỏ mà chủ nhà nhớ nhầm thì ai thắng? (FR-164 khoá cột sau `chu_xac_nhan`) | Trung bình | FR-164, FR-156 |
| OPEN-33 | Webhook Zalo không kiểm chữ ký vì Vault thiếu `ZALO_APP_SECRET`/`ZALO_APP_ID` — ai cũng giả được tin đến | Cao | FR-167, SRS-4.4 |
| OPEN-34 | Gộp `zalo-webhook` → `chat-reply` thành một lambda? | Trung bình | FR-171, SRS-2 |
| OPEN-35 | Nhắc lời hứa / hỏi thăm khách im: mẫu câu cố định hay lượt model? | Thấp | FR-133, FR-171 |
| OPEN-38 | Ảnh tin: thumbnail và watermark trên bậc Free | Thấp | FR-165, NFR-16 |
| OPEN-41 | Nhà cung cấp model: giữ Claude trên Supabase hay theo AOND §VII (Gemini rồi chạy local)? | Thấp | SRS-2, FR-138, DH-06 |
| OPEN-42 | Ngưỡng CTV: hạn trả lời 120 phút, hạng Vàng ≥90% / Bạc ≥70% — đều [giả định BA] | Trung bình | FR-173, FR-137, DH-03 |
| OPEN-47 | Tám bảng chưa từng được sao lưu — đã vá; còn treo: bucket `masterdb-raw` chưa có file, Storage `listing-public` chưa nằm trong bản sao nào · **11/09/2026: sao lưu bỏ hẳn (OPEN-25)** — phần "bảng thiếu trong bản sao" hết đối tượng | Cao | FR-165, OPEN-25 |
| OPEN-50 | **Ngưỡng điểm để tin được rao, và tin cũ có bị đo lại không** (FR-177 d, 07/09): (a) ngưỡng **70/100** là *[giả định BA]* — kịch bản Gemini của sếp chỉ nói "càng đủ điểm càng cao và được rao", không nêu con số. Cao quá thì chính chủ hụt vài điểm bị chặn rao; thấp quá thì cổng vô nghĩa. (b) Hiện chỉ tin **tạo từ chat** (`can_chu_duyet`) chịu cổng điểm + phải chủ gật; **173 tin nhập Excel/admin giữ luật cũ** (giá + diện tích + phường) — 38/164 tin đang rao có điểm < 70, nếu áp cổng cho cả chúng thì rổ hàng tụt ngay 23%. Phương án: (1) giữ nguyên — cổng chỉ cho hàng mới từ chat, hàng cũ để yên, dọn dần bằng vòng hỏi; (2) hạ ngưỡng xuống 60 rồi áp cho tất cả; (3) áp cho tất cả ở ngưỡng 70, chấp nhận 38 tin tụt về `cho_thong_tin` cho tới khi bổ sung. **Khuyến nghị BA: (1)** — sao Bắc Đẩu là lịch xem nhà, chặn hàng đang chạy không đổi lại được gì. | Trung bình | FR-177, FR-155, OPEN-26, DH-03 |
| OPEN-54 | **Ngưỡng "giọng có ra không" và đường chạy thật sau fine-tune** (FR-180, 09/09/2026): chủ dự án chốt lộ trình (300 mẫu → Qwen2.5-3B/7B Unsloth trên 4060 → Gemini Flash tuning hoặc VPS GPU) nhưng chưa chốt (a) ngưỡng ưng bằng số — đề xuất sếp chấm mù 20 câu kiểm, ≥ 14/20 chọn bản mới; (b) chạy thật bằng Gemini Flash tuning (rẻ, không tự vận hành, model đóng) hay VPS GPU chạy Qwen (giữ model mở, ~1–2 triệu/tháng, phải tự trực); (c) mẫu chứa chat thật có tên/SĐT — có che trước khi đưa lên Gemini không. **Khuyến nghị BA**: (a) 14/20; (b) Gemini Flash trước, VPS GPU khi có > 1.000 mẫu và cần ghi giọng riêng; (c) che SĐT bằng `che_sdt()` lúc xuất, giữ tên. **Cập nhật 22/09/2026**: có bộ đo giọng `bot/tests/giong` (FR-180 f) — đề xuất thay "sếp chấm mù 20 câu" bằng: cùng 24 ca, bản mới phải ≥ bản cũ ở TẦNG 1 (luật máy) và không thấp hơn ở cả bốn cờ TẦNG 2, chạy `--lap 2`; sếp chỉ đọc các lượt hai bản lệch nhau. Đường nền đo thật 22/09 (Haiku 4.5, giám khảo Opus 5, 24 ca): tầng 1 18/24; tầng 2 nghe như người 20/24 · đúng ý 17/24 · không bịa 17/24 · gọn 21/24 (TS-GIONG-02). Bản mới "ưng" = không tụt cờ nào và tổng đạt cao hơn nền trên cùng 24 ca. | Trung bình | FR-180, OPEN-42 |
| OPEN-53 | **Ảnh đếm tấm, chưa kiểm ảnh có thật là căn đó** (FR-177 f, 09/09/2026): chủ dự án chốt "có 3 ảnh thì tính đủ, ảnh nào cũng được" — 3 tấm bất kỳ là 10/10 điểm ảnh. Chủ nhà gửi 3 ảnh mạng / ảnh căn khác vẫn được điểm tối đa; web hiện ảnh đó cho khách. Phương án: (1) giữ nguyên, CTV khảo sát (FR-177 a bước cuối) là lưới; (2) chỉ tính ảnh sau khi admin duyệt (FR-105, đã cố ý chưa làm); (3) model chấm "ảnh có phải nhà/sổ/hẻm không" trước khi tính điểm. **Khuyến nghị BA: (1)** cho tới khi có khách thật bị lừa ảnh. | Thấp | FR-177, FR-105 |
| OPEN-51 | **Token Zalo OA sống 25 tiếng, không ai làm mới** — việc đã viết xong trên nhánh `claude/sua-25-loi` (commit `70a63ab`) nhưng chưa từng vào `main` và chưa từng áp lên DB. Chưa đau vì bot đang đi bridge zca-js, không dùng OA API | Thấp | FR-152, NFR-18, OPEN-46 |
| OPEN-52 | **Trần lượt đếm theo thứ người gọi tự đặt được** (`external_user_id`) — xoay id là bộ đếm về 0. Bản vá `rate_counters` cũng nằm ở `70a63ab`, chưa merge | Thấp | FR-146, FR-151, SEC-02 |

## Đã chốt / đã đóng (36)

| ID | Kết luận | Liên quan |
|---|---|---|
| OPEN-01 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: toán OKR 1.800 chat → 90 giao dịch là kế hoạch 2024; sao Bắc Đẩu nay là lịch xem nhà/tuần (DH-05) | Kế hoạch KD |
| OPEN-03 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: Slack relay/API vendor 2024 đã thay bằng Supabase (FR-166) | SRS-2.2, P2 |
| OPEN-06 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: file TOP-100 keyword 2014 không có, trang phụ SEO thuộc nhóm A của OPEN-48 | FR-12, OPEN-44 |
| OPEN-07 | ✅ **ĐÃ CHỐT 24/08/2026** — theme KingTheme (HTML template) cắt vào Next.js; không commit theme vào repo | `06`, OPEN-45 |
| OPEN-08 | ✅ **ĐÃ CHỐT 03/09/2026** — thương hiệu Aioinhadat, bot "Thái" (OPEN-39); tên miền vẫn nhadat.cc [giả định BA] | Copy toàn hệ thống |
| OPEN-09 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: đang chạy Zalo cá nhân qua bridge (FR-145), OA chưa duyệt; hỏi lại khi có OA | FR-63, FR-64 |
| OPEN-10 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: FR-99 định giá so sánh không có trong AOND; `/thong-ke` thuộc nhóm A của OPEN-48 | FR-99 |
| OPEN-11 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: Logstash là hạ tầng vendor 2024; hàng đợi thật nằm trong Postgres (FR-166) | NFR-04, FR-166 |
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
| OPEN-29 | ✅ **ĐÃ CHỐT 27/08/2026** — bỏ dấu trước khi khớp mọi regex cổng (FR-161) | FR-161 |
| OPEN-30 | ✅ **ĐÃ CHỐT 28/08/2026** — mọi lệnh gọi model bọc try/catch + `ghiLoi` + câu mẫu (chat-reply v40, nudge v14+) | FR-152, FR-161 |
| OPEN-36 | ✅ **ĐÃ CHỐT 02/09/2026** — lưu hết thông tin chủ chia sẻ, khách hỏi mới khai; liên hệ chỉ mở lúc chốt lịch xem | INS-11, FR-104 |
| OPEN-37 | 🚫 Đóng 07/09/2026 — không còn hợp hướng: lớp POI/quy hoạch/ngập thuộc nhóm A của OPEN-48; quy hoạch vẫn là câu hỏi lại chủ (DH-02 #3) | FR-28, INS-13, OPEN-40 |
| OPEN-32 | ✅ **ĐÃ CHỐT 09/09/2026** — phương án (b): ảnh chat kéo về kho rồi phân loại; giấy tờ / không phân loại được → `listing-private`, ảnh nhà → `listing-public`, sổ đọc diện tích đối chiếu (FR-185) | FR-185, FR-165 |
| OPEN-39 | ✅ **CHỐT LẠI 09/09/2026** (đảo bản 03/09) — thương hiệu Aioinhadat giữ; trợ lý KHÔNG còn một tên Thái: mỗi khách một tên riêng từ kho •ai (T•ai, Kh•ai… 20 tên, viết hoa chữ đầu, không P•ai), gán tất định theo Zalo ID và giữ suốt (FR-181). Bản 03/09 "một tên Thái" chạy 03–09/09 | OPEN-08, FR-181, DH-01 |
| OPEN-40 | ✅ **ĐÃ CHỐT 09/09/2026 tối** — phương án (b) làm cả ba nhóm AOND §III, bằng `required_facts` chứ không thêm cột: cho thuê (FR-186 chiều: nội thất, cọc, thời hạn, trượt giá, fit-out); đất (hướng, hạ tầng, xây dựng + `dat_nong_nghiep`, `dat_kinh_doanh`); công nghiệp `kho_xuong` + toà nhà dòng tiền `toa_nha` (`20260909i`). Lệnh: "đọc lại 2 cái chat Gemini xem có trường hợp nào, đây là production nên không thể bỏ sót cái gì cả" | FR-186, FR-187, DH-03 |
| OPEN-45 | 🚫 Đóng 10/09/2026 — `design/tokens.json` và Figma đã xoá khỏi repo 08/09 (commit `459008d`); chỉ còn `06 §6.2` (bản thiết kế) và `app/globals.css` (token thật) — CODE làm gốc, `06` là tham chiếu tone/component, không đối chiếu từng token nữa | UI-01…, OPEN-07 |
| OPEN-55 | ✅ **ĐÃ CHỐT 09/09/2026** — chủ dự án đọc lại chat Gemini "AI Ơi Nhà Đất" 21–27/06 (share) + chat 07/09 (PDF) rồi chốt 14 dòng chat ↔ hệ thống: (1) kênh Zalo cá nhân qua bridge, chỉ gửi chữ — GIỮ (nút bấm chờ OA); (2) mỗi khách một tên T•ai, Kh•ai… — THEO CHAT → FR-181; (3) loại BĐS trước, vị trí linh hoạt — GIỮ (sếp 07/09); (4) hỏi hướng — THEO CHAT cho chung cư và đất, nhà phố vẫn không → FR-186; (5) hỏi đúng một thông tin — GIỮ; (6) gán nhãn tự động, không nêu phí — GIỮ; (7) khách hỏi thứ thiếu → bot hỏi CHỦ NHÀ trước, 12 giờ không hồi âm mới hỏi CTV — MỚI → FR-173 a; (8) lên kệ khi đủ giá + diện tích + phường hoặc 70 điểm, ảnh 10 điểm, sổ không bắt buộc — GIỮ; (9) hỏi địa chỉ nêu lý do "kiểm tra giá thị trường khu vực" — THEO CHAT (đảo quyết định sáng 09/09 "bỏ định giá"; bot vẫn không đưa con số) → FR-177 h; (10) có CẢ điểm từng tin và điểm người rao — THEO CHAT → FR-183; (11) nhịp hỏi bù 5 phút / 30 phút / 3 câu/ngày / 2 căn/người, KHÔNG luật 7 ngày Zalo — GIỮ; (12) bot tự nêu kiến thức dự án ("Sunrise City có hồ bơi Olympic") — THEO CHAT → FR-114 d; (13) SharePoint/Power Automate/Dialogflow — không nhận, Supabase; (14) domain aioinhadat.vercel.app — GIỮ. Thêm: "bán rồi" → FR-184; ảnh vào kho + phân loại + OCR → FR-185; bộ câu hỏi theo loại + cho thuê → FR-186. 10/09/2026 chủ dự án ra lệnh làm hết phần treo: keep-alive 6 ngày + hỏi bổ sung → FR-191; người thật giữ/trả bot → FR-189; CTV theo khu + trần 15 ca → FR-190; gấp bên bán + bên mua → FR-188; không hỏi lần thứ hai → FR-186 o. Còn treo: phân loại lại ảnh đã có trong kho (kho đang 0 file), hạng theo điểm người rao (OPEN-26) | FR-181…186, FR-173, FR-177, FR-114 |
| OPEN-56 | 🟡 **ĐÃ NẠP DỮ LIỆU 10/09/2026** (1.643 dự án: TP.HCM 1.160 · Bình Dương 284 · Long An 199, qua `scripts/thu-du-an.mjs`; chủ dự án chốt "crawl đi, lấy tối đa" và cho biết nguồn cũng là dự án của nhà mình). Còn treo: soát chất lượng từng dòng (640/1.160 dòng HCM có chủ đầu tư), và bổ sung ảnh/mặt bằng tự chụp. **Kho DỰ ÁN gần như trống nên bot không nhận ra tên dự án.** Bảng `projects` có **1 dòng**; chủ dự án nhắn thật 10/09 "bán căn ho ở Hà đô centrosa garden" → `match_projects` rỗng, tin không lấy được quận/phường của dự án (Hà Đô Centrosa ở Quận 10), khối kiến thức dự án của FR-114 d không có gì để nạp. Sếp muốn (10/09, qua chủ dự án) có chỗ giữ thông tin chung về dự án ở TP.HCM, Bình Dương, Long An. Cột đã đủ sẵn (`developer`, `province`, `district`, `ward`, `price_min`/`price_max`, `unit_types`, `specs`, `amenities`, `images`, `handover`, `legal_status`, `source_url`…) nên đây là việc DỰNG DỮ LIỆU, không phải dựng schema. Ba phương án nguồn: **(A)** chép từ trang đối thủ (mogi.vn có 1.613 dự án HCM · 333 Bình Dương · 223 Long An, mỗi dự án có CĐT, địa chỉ, giá từ, tổng diện tích, diện tích sản phẩm, pháp lý, ảnh, bài giới thiệu) — nhanh và đủ trường, NHƯNG bài viết và ảnh là tài sản của họ (trang dán DMCA), chép cả khối là vi phạm bản quyền và điều khoản dịch vụ, và repo này vừa xoá dữ liệu crawl hôm 08/09; **(B)** nhập tay từ nguồn chính thức (web chủ đầu tư, công bố của sở xây dựng, giấy phép mở bán) — sạch pháp lý, số liệu chuẩn, tốn công; **(C)** chỉ giữ DANH MỤC (tên · chủ đầu tư · phường/quận · loại hình) để bot nhận ra tên và suy ra quận, phần mô tả tự viết — tên và địa chỉ là dữ kiện chứ không phải tác phẩm. **Khuyến nghị BA:** làm C trước (~200–400 dự án ba tỉnh, đủ để `match_projects` hết trượt), rồi B cho vài chục dự án hay gặp; không chọn A. **Chờ chủ dự án chốt.** | FR-193 d, FR-114 d, FR-174 |
| OPEN-57 | 🟡 **Mảnh câu xác nhận rơi vào `bo_sung`** (kịch bản C bắn lại 22/09/2026 sau deploy #189): chủ nhà gõ "đúng rồi em, Trần Bình Trọng. à mà phường 2 chứ không phải phường 4" — phường vào đúng cột, tên đường xác nhận đúng, nhưng mảnh thừa "Trần Bình Trọng. à mà" được ghi làm `bo_sung` và in ra bản nháp "📝 Thêm: Trần Bình Trọng. à mà". Nguyên nhân chưa truy: sau khi bóc phần gật + phần sửa, phần còn lại không rỗng nên đi đường "thông tin bổ sung" (FR-177 c) dù chỉ là tiểu từ + tên đường vừa xác nhận. **Phương án**: (a) phần còn lại sau khi bóc mà chỉ gồm tiểu từ/tên đường đang gợi ý thì bỏ; (b) mọi `bo_sung` < 4 chữ có nghĩa thì bỏ. **Khuyến nghị BA:** (a). **Chờ chủ dự án chốt** (vá nhỏ, ghép vào lượt sửa kế). | FR-177 c, FR-209, TS-GIONG-05 |
| OPEN-58 | 🟡 **Tra phường theo SỐ NHÀ** (chủ dự án 25/09/2026: "google map api muốn dùng cần trả bao nhiêu, hiện tại người ta đưa số nhà và tên đường và quận rồi nhưng mà lại cố hỏi là phường nào"). FR-223 (n) tra bảng `duong` (OSM, miễn phí) theo quận: đủ khi đường nằm gọn một phường, còn đường qua nhiều phường thì vẫn phải hỏi chọn, và bảng lúc đó mới có đường của 94/168 phường TP.HCM. Nominatim (OSM, miễn phí) đang trả "Access denied". **Phương án**: (a) nạp nốt bảng `duong` cho 74 phường còn lại (`scripts/nap-duong.mjs`, cần khoá service_role trên máy chủ dự án) — miễn phí, vẫn không biết số nhà; (b) Google Geocoding API theo số nhà — theo trang giá Google (cập nhật 17/09/2026): 10.000 lượt miễn phí mỗi tháng, sau đó 5 USD / 1.000 lượt; cần tài khoản Google Cloud có thẻ; CHƯA kiểm Google trả phường MỚI (sau sáp nhập 07/2025) hay phường cũ — phải thử trước khi dùng. **Khuyến nghị BA:** (a) ngay, (b) thử 20–50 địa chỉ thật trước khi quyết. **Chủ dự án chốt (a) 25/09/2026** ("uk"): đã nạp thẳng từ Overpass qua `pg_net` trong DB (không cần khoá trên máy) — 168/168 phường có tên đường, thêm ~3.000 dòng (tổng 10.083); ba phường tra riêng theo toạ độ (Tân Phú, Long Bình trùng tên phường Đồng Nai; Côn Đảo ngoài hộp bao); đã xoá 59 dòng rác lượt này (hầm chui, đường nội khu, "Hèm …"), lượt 21/09 còn ~86 dòng cùng loại chưa dọn. **(b) còn treo** — chỉ cần khi đường nhiều phường trong một quận làm khách phiền. | FR-223 n, FR-209, FR-212 |
| OPEN-59 | 🟡 **Một căn vừa BÁN vừa CHO THUÊ** (chủ dự án 08/10/2026, khi duyệt SRS-5.1zzzw: "nhưng vậy thì khi người ta vừa bán vừa cho thuê, hoặc chuyển đổi có được ko"). Hiện cột `listings.deal` là enum MỘT giá trị (`ban` \| `cho_thue`) và AI bóc tách trả một `loai_giao_dich`. **Đổi ý** đã chạy: câu mới nói rõ ("đổi ý, cho thuê luôn", "cần bán, không phải cho thuê") thì AI trích trong chính câu đó và tin đổi theo (e2e `SRS-5.1zzzw-b`, và trigger đồng bộ fact `loai_giao_dich` → `deal`). **"Bán hoặc cho thuê đều được" cho cùng một căn** thì chưa có thiết kế: tin chỉ mang một loại, giá thuê và giá bán không cùng chỗ. **Phương án**: (a) mở HAI tin cho cùng một căn (một bán, một thuê), hai giá riêng, gắn chung mã căn — web và người mua thấy hai tin; (b) một tin thêm cờ "nhận cả cho thuê" + ô giá thuê phụ (đổi schema, web, bản nháp, phí theo cả hai); (c) giữ một loại, bot hỏi khách chọn loại chính, ý còn lại ghi vào thông tin thêm. **Khuyến nghị BA:** (a) — không đổi schema, mỗi tin một giá, phí đã tính theo loại (`cauPhi`). Chờ chủ dự án chốt. | FR-150, SRS-5.1zzzw |
| OPEN-60 | 🟢 **Chủ dự án chốt (a) 09/10/2026** ("ừ") — **đã làm phần có văn bản** (SRS-5.1zzzzl, migration `20261009d`, chưa áp DB): hai đợt gộp phường số trước 07/2025 là **NQ 1111/NQ-UBTVQH14 ngày 09/12/2020** (Điều 2, hiệu lực 01/01/2021) và **NQ 1278/NQ-UBTVQH15 ngày 14/11/2024** (Điều 1, hiệu lực 01/01/2025) — đọc toàn văn bản PDF có chữ ký số trên vanban.chinhphu.vn (docid 202092 và 211796, URL ở đầu migration). Thêm cột `phuong_cu.nguon` + 57 dòng, mỗi dòng ghi số NQ + Điều / khoản / điểm; phường mới lấy theo dòng NQ 1685 đã có của phường trung gian. Theo quận (số cũ → phường mới; `*` = bị chia, bot vẫn hỏi): **Quận 3** (NQ 1111 Đ2 k1 a; NQ 1278 Đ1 k1 a–b): 6, 7, 8 → Xuân Hòa; 10, 13 → Nhiêu Lộc · **Quận 4** (NQ 1111 Đ2 k2 a–b; NQ 1278 Đ1 k2 a–c): 6, 10 → Khánh Hội; 12 → Xóm Chiếu; 5*, 14* · **Quận 5** (NQ 1111 Đ2 k3 a; NQ 1278 Đ1 k3 a–d): 3 → Chợ Quán; 6, 8 → An Đông; 10, 15 → Chợ Lớn · **Quận 10** (NQ 1111 Đ2 k4 a; NQ 1278 Đ1 k6 a–c): 3, 11 → Vườn Lài; 5, 7 → Diên Hồng · **Phú Nhuận** (NQ 1111 Đ2 k5 a–b; NQ 1278 Đ1 k10 a–b): 12, 14 → Phú Nhuận; 3 → Đức Nhuận; 17* · **Bình Thạnh** (NQ 1278 Đ1 k8 a–h): 3, 15 → Gia Định; 21 → Thạnh Mỹ Tây; 24 → Bình Thạnh; 6* · cùng văn bản, ngoài nhóm ưu tiên: **Quận 6** (Đ1 k4): 3, 4 → Bình Tiên; 5, 6 → Bình Tây · **Quận 8** (Đ1 k5): 1, 2, 3, 8, 9, 10 → Chánh Hưng; 11, 12, 13 → Phú Định · **Quận 11** (Đ1 k7): 2, 4, 6 → Minh Phụng; 9 → Bình Thới; 13 → Phú Thọ; 12* · **Gò Vấp** (Đ1 k9): 4, 7 → Hạnh Thông; 9 → Thông Tây Hội; 13*. **Còn treo (không có trong hai văn bản — không thêm, bot vẫn hỏi):** Quận 4 P7/11/17 · Phú Nhuận P6 · Gò Vấp P2 · Bình Thạnh P4/8/9/10/16/18/20/23 · Vũng Tàu P6 (có thể gộp ở đợt trước 2019 hoặc chưa từng có số đó — cần văn bản để biết); phường tên chữ cũ của Thủ Đức ở NQ 1111 Điều 1 khoản 2 (An Khánh cũ, Bình Khánh, Bình An) cố ý chưa thêm vì trùng tên phường khác; phường cũ bị chia không "toàn bộ" (Quận 3 P4, Tân Bình P15, Quận 8 P5/7/16…) vẫn hỏi như cũ. Nội dung gốc giữ dưới làm dấu vết. 🟡 **Phường SỐ cũ gộp trước 2025 không đổi được sang phường mới** (SRS-5.1zzzzj, bắn production 09/10/2026: "phường 6 quận 3 cũ"). Bảng `phuong_cu` sinh từ NQ 1685/2025 (`wards.don_vi_cu`) nên chỉ có tên phường ĐANG tồn tại lúc 07/2025; phường đã gộp ở các đợt 2018–2021 không có dòng, và repo không có văn bản nguồn của các đợt đó. Thiếu (đo trên `ds-phuong.ts`): Quận 5 P3/6/8/10 · Quận 3 P6/7/8/10/13 · Quận 4 P5/6/7/10/11/12/14/17 · Quận 6 P3/4/5/6 · Quận 8 P1/2/3/8/9/10/11/12/13 · Quận 10 P3/5/7/11 · Quận 11 P2/4/6/9/12/13 · Phú Nhuận P3/6/12/14 · Gò Vấp P2/4/7/9/13 · Bình Thạnh P3/4/6/8/9/10/15/16/18/20/21/23/24 · Vũng Tàu P6; phường cũ bị chia không có phần "toàn bộ" (Quận 3 P4, Tân Bình P15, Quận 8 P5/7/16, Quận 10 P14, Quận 11 P8, Phú Nhuận P15, Quận 4 P2/4/15). Hiện: cửa `tenPhuongCot` trả null → cột phường trống, bot hỏi lại (bất biến giữ, không bịa). **Phương án**: (a) BA lấy văn bản gốc (nghị quyết UBTVQH về sắp xếp đơn vị hành chính TP.HCM 2018–2021) rồi thêm dòng `phuong_cu` (số cũ → phường trung gian → phường mới 2025, ghi nguồn từng dòng) bằng migration; (b) để nguyên, bot hỏi. **Khuyến nghị BA:** (a) cho Quận 3, 4, 5, 10, Phú Nhuận, Bình Thạnh (khách còn gọi số cũ nhiều nhất). Không thêm dòng nào khi chưa có văn bản. | SRS-5.1zzzzj, FR-209 |
| OPEN-61 | ✅ **ĐÃ CHỐT 09/10/2026 — phương án (a)** (chủ dự án: "để chính chủ đi"): mặc định vẫn gán chính chủ khi mở hồ sơ (FR-159), con số phí chỉ nói khi vai đã xác nhận (`tu_nhan` / `admin`). Không đổi mặc định sang `unknown`. Nội dung cũ giữ dưới làm dấu vết. 🟡 **Nhãn người rao ĐOÁN dùng cho kế toán, chưa xác nhận dùng cho lời nói** (SRS-5.1zzzzj, bắn production 09/10/2026: "phí sao em" → "1% giá chốt" với người chưa nói vai). FR-159 (chủ dự án 02/09) gán chính chủ ngay khi mở hồ sơ để deal có phí (FR-170 f), hạng, ưu tiên chủ nhà (FR-173 a) chạy. Đã làm: cột `sellers.seller_type_source` (suy_doan / tu_nhan / admin), con số phí chỉ nói khi tu_nhan / admin; nhãn và mọi chỗ dùng nhãn khác KHÔNG đổi. **Còn treo**: có nên đổi luôn mặc định nhãn sang `unknown` tới khi người rao tự nói (deal của nhãn `unknown` không có phí, hạng / ưu tiên không tính) không; và các nhãn `nmg` / `ccrb` có trên DB trước 20261009c đều là `suy_doan` (bot không nói số cho họ tới khi họ tự nói lại hoặc admin đặt). **Phương án**: (a) giữ như đã làm; (b) mặc định `unknown` + bot hỏi khéo vai ở lượt đầu. **Khuyến nghị BA:** (a). Chờ chủ dự án chốt. | FR-159, FR-170, SRS-5.1zzzzj |
| OPEN-62 | ✅ **ĐÃ CHỐT 09/10/2026 — phương án (a)** (chủ dự án: "bật đi"): bỏ gạch dài "—" và "anh/chị" gạch chéo LUÔN bật ở đường ra, không theo công tắc `luat_loi_bot`; lời khen đoán người mua bỏ. Nội dung cũ giữ dưới làm dấu vết. 🟡 **Hai việc đổi một phần quyết định giọng 06/10 (SRS-5.1zzn) — cần chủ dự án xác nhận** (SRS-5.1zzzzj). (1) Gạch dài "—" và "anh/chị" gạch chéo nay LUÔN chuẩn ở đường ra (trước: tắt khi `luat_loi_bot` = gọn) — TONE_RULES cấm cả hai, nên lưới chỉ giữ đúng điều prompt nói; các van sửa VĂN khác vẫn theo công tắc. (2) Lời khen đoán NGƯỜI MUA ("hẻm xe hơi là khách chuộng lắm", "căn này dễ bán lắm") bỏ khỏi câu mẫu giọng và lượt soát bỏ nó — khen chỉ nói lợi ích thật của đặc điểm ("ô tô tới tận nhà, đi lại tiện lắm"). Bảng `mau_cau` (mẫu chuẩn sửa tay trên DB, FR-180) nếu còn câu "khách chuộng" thì sẽ dạy ngược — cần soát tay. **Phương án**: (a) giữ cả hai; (b) trả (1) về công tắc. **Khuyến nghị BA:** (a). | SRS-5.1zzn, SRS-5.1zzzzj, FR-180 |
| OPEN-43 | 🚫 Đóng 07/09/2026 — gộp vào OPEN-48: phần còn lại (FR-16/95/28/160/118, `?ref=`) đều nằm trong danh mục bỏ/giữ ở đó | SRS-2/4/5, `10 §10.8` |
| OPEN-44 | 🚫 Đóng 07/09/2026 — gộp vào OPEN-48: SEO nền đã dựng; TOP-100 keyword chết theo OPEN-06; Search Console là việc vận hành, không phải quyết định | FR-12, NFR-09, OPEN-06 |
| OPEN-46 | 🚫 Đóng 07/09/2026 — đã giảm nhẹ 05/09, không còn gì để chốt: `soat-migration.mjs` chặn trôi, `schema.sql` là lưới dựng lại; nội dung 41 migration mất vĩnh viễn | NFR-04, `bot/README.md` |
| OPEN-48 | ✅ **ĐÃ CHỐT 08/09/2026** — Sếp và Chủ dự án quyết định bỏ nhóm tính năng thừa kế 2024 (form web /raoban, tài khoản cá nhân, trang phụ SEO, đánh giá 3 thời điểm), chuẩn hóa 100% tài liệu theo Aioinhadat 2026 | DH-01…04, `00 §0.2–0.3`, OPEN-49 |
| OPEN-49 | ✅ **ĐÃ CHỐT 07/09/2026** theo kịch bản Gemini của sếp (tài liệu gốc `Kịch bản huấn luyện môi giới (Gemini 07-09-2026).md`) → FR-177: hỏi 1 thông tin/lần theo thứ tự địa chỉ → giá → hẻm → diện tích → tầng → phòng → pháp lý → ảnh → lịch khảo sát; mỗi câu trả lời có khích lệ; đủ thì gửi bản nháp tin + điểm 100/7 tiêu chí; đủ điểm mới rao | FR-176, FR-129, OPEN-20/26, AOND §II, §VI |

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

### OPEN-24 · `pg_net` mở cho `anon` — mồi SSRF không vá được bằng SQL
**Vấn đề**: `anon` có USAGE schema `net` + EXECUTE `net.http_post` (đo 26/08); chưa khai thác được
chỉ vì PostgREST không phơi `net` — hàng rào cấu hình, không phải quyền. Không tự REVOKE được: schema
thuộc `supabase_admin`, lệnh từ vai `postgres` là no-op im lặng.
**Phương án**: (a) gác cửa — giữ Exposed schemas đúng `public, graphql_public`, cấm hàm SECURITY
INVOKER trong `public` gọi `net.*`; (b) ticket Supabase xin thu hồi grant mặc định; (c) bỏ `pg_net`
— không khả thi, cron gọi edge function qua nó.
**Khuyến nghị BA**: (a) ngay + (b) song song. **Chờ**: chủ dự án (ticket Supabase).

### OPEN-26 · Ngưỡng hạng Đồng/Bạc/Vàng
**Vấn đề**: FR-155 chạy với ngưỡng [giả định BA] (NMG: Vàng ≥10 tin và chốt ≥5%, Bạc ≥5 tin hoặc ≥1
chốt; CCRB: Vàng ≥1 chốt, Bạc đủ thông tin lên sàn). Chỉ vế NMG có nguồn (`/moi-gioi`, `biz
model.docx`). Kho chưa có giao dịch `da_chot` nên chưa ai lên Vàng được.
🟡 Chủ dự án chốt phần hiển thị 27/08 ("ẩn hạng khỏi web đi"): hạng chỉ hiện ở `/admin`.
**Phương án**: (a) chốt ngưỡng thật kèm quyền lợi mỗi hạng (ưu tiên khách nét? giảm phí? trần số căn
cho Đồng như AOND?); (b) giữ ngưỡng tạm tới khi có số thật.
**Khuyến nghị BA**: (b) rồi (a) khi có giao dịch thật để định cỡ.
**✅ Chốt 05/10/2026** (chủ dự án, đối chiếu SRD: "thôi làm cho giống luôn"): (a) theo SRD §IV.3 — ngưỡng theo ĐIỂM người rao (50/80), quyền lợi: Đồng tối đa 5 căn; Vàng được ưu tiên khách nét (06/10: áp cho MỌI người bán Vàng, không riêng NMG — SRS-5.1zzx); CCRB Vàng được đẩy rổ tới 20 NMG lõi. Hiện thực `20261005a`, SRS-5.1zzf. Hạng vẫn ẩn khỏi web.

### OPEN-27 · Mở địa bàn ra HCM mới + Long An
**Vấn đề**: 27/08 chủ dự án: "đánh bds trong khu vực hcm mới và long an tây ninh, nhưng hiển thị
hoặc tìm kiếm vẫn là tên cũ cho user dễ dùng". 🟡 Chốt nửa đầu 03/09: "bán sản phẩm bất động sản ở
Sài Gòn, các phường mới và Long An" → địa bàn = TP.HCM phường mới + Long An (không Tây Ninh), trọng
tâm bán, khởi điểm Quận 5 cũ; ghi vào `00 §0.1/0.2/0.8`, BR-01/02, FR-174 đợt 1. Còn ghi cứng: regex
phường, 16 phường ở form admin, từ điển lóng, 15 toạ độ `lib/geo.ts`.
**Phương án (nửa sau)**: (a) "tên cũ" lấy mốc nào — trước NQ 202/2025 hay tên dân gọi; (b) DB lưu
tên cũ hay mới, bên nào là bản dịch (bảng `wards` — FR-118); (c) mã tin `BDS-Q5-####` giữ làm ID vô
nghĩa hay đổi; (d) thứ tự mở cụm/huyện; (e) "các phường mới" là địa bàn hay tên hiển thị.
**Khuyến nghị BA**: hiện cả hai tên; bảng `wards` một nguồn (mã, tên mới/cũ, quận cũ, tỉnh, toạ độ);
giữ mã tin; mở Long An theo MỘT huyện có hàng thật → FR-174 đợt 2.
**✅ Chốt nửa sau 15/09/2026** (chủ dự án, sau lượt Zalo thật "sao nó cứ mặc định là quận 5"): "lấy nguồn công
khai đi, bot hỏi xác nhận trước khi ghi, chốt OPEN-27 nửa sau vậy lấy tên mới cho nó dùng được Nominatim"
→ (b) DB lưu TÊN MỚI ở `listings.ward`, `wards` (`20260915a`) là bảng dịch mới ↔ quận cũ; (a) "tên cũ" = quận
trước sáp nhập, phường TP Thủ Đức lấy quận trước 2021 (Quận 2/9/Thủ Đức) vì dân vẫn gọi vậy; (c) mã tin
giữ, đi theo quận cũ; (e) "các phường mới" là địa bàn LẪN tên lưu. Còn treo: (d) thứ tự mở cụm/huyện Long
An. Việc: FR-209.

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

### OPEN-32 · Ảnh gửi qua chat nằm ngoài ranh giới công khai/riêng tư
**Vấn đề**: FR-165 ràng `so_do`/`giay_to` phải ở `listing-private`, nhưng chỉ với file đi qua kho.
Ảnh chủ nhà gửi qua Zalo được `chat-reply` lưu URL CDN thành fact `hinh_anh` bất kể câu hỏi đang chờ
(kể cả `phap_ly` — trả lời bằng ảnh sổ là chuyện thường), rồi FR-143 gộp vào `photos` gửi khách.
**Phương án**: (a) ảnh trả lời câu `phap_ly` (hoặc model đọc ra là giấy tờ) ghi nhãn `giay_to`,
không vào `photos`; (b) kéo ảnh chat về `listing-private` rồi phân loại; (c) chặn ở duyệt tay FR-105.
**Khuyến nghị BA**: (a), làm sớm — đường rò giấy tờ đất của người dân. **Chờ**: chủ dự án (đợt
FR-165 khoanh vùng "không đụng luồng chat").

### OPEN-33 · Webhook Zalo đang nhận sự kiện KHÔNG kiểm chữ ký
**Vấn đề**: `zalo-webhook` chạy `verify_jwt=false`, hàng rào duy nhất là chữ ký `X-ZEvent-Signature`;
khối verify chỉ chạy khi Vault có `ZALO_APP_SECRET` + `ZALO_APP_ID` — hiện không có. Đo 29/08: POST
sự kiện bịa → 200. Giả được tin với bất kỳ `sender.id` (bơm fact vào tin người khác, bơm rác đốt tiền
model). FR-167 cho nó kêu vào `bot_errors`.
**Phương án**: (a) đặt hai secret vào Vault — verify tự bật, không sửa code; (b) chặn cứng — bot chết.
**Khuyến nghị BA**: (a), việc 5 phút. **Chờ**: chủ dự án (chỉ chủ dự án có secret app Zalo).

### OPEN-34 · Gộp `zalo-webhook` → `chat-reply` thành một lambda?
**Vấn đề**: mỗi tin đi qua hai edge function (nhận + gọi HTTP nội bộ sang `chat-reply`), tốn
~200–400 ms và compute đôi. Nêu ở FR-171, cố ý chưa làm vì ranh giới hai hàm đang giữ luật chống gửi
đúp (FR-162/166) và `chat-reply` là bộ não dùng chung mọi kênh (NFR-12).
**Phương án**: (a) giữ hai hàm; (b) gộp khi lưu lượng lên ~10×.
**Khuyến nghị BA**: (a) — thứ đáng tiền hiện là model, không phải lambda. **Chờ**: chủ dự án.

### OPEN-35 · Nhắc lời hứa / hỏi thăm khách im: mẫu câu hay lượt model?
**Vấn đề**: `nudge` và `ask-seller` gọi model cho mỗi tin nhắc/câu hỏi nhỏ giọt dù khuôn gần cố
định. Mẫu câu xoay 3–4 biến thể làm được ~80% với chi phí 0, nhưng nghe "máy" hơn và follow-up căn
(FR-32) cần một chi tiết thật từ fact.
**Phương án**: (a) giữ model cho follow-up căn + câu hỏi nhỏ giọt, mẫu câu cho nhắc lịch xem + nhắc
lời hứa; (b) model hết như hiện tại.
**Khuyến nghị BA**: (a), chốt sau vài tuần có số ở thẻ "Tiền bộ não" `/admin`. **Chờ**: chủ dự án.

### OPEN-38 · Ảnh tin: thumbnail và watermark trên bậc Free
**Vấn đề**: ta lưu file gốc (vài MB/tấm) trong `listing-public`; lưới 24 thẻ = vài chục MB nếu có
ảnh thật. Biến đổi ảnh của Supabase là tính năng Pro (NFR-16).
**Phương án**: (a) `up-anh.mjs`/upload web sinh thêm bản 480px (sharp) vào `listing_media.variants`;
(b) `next/image` loader tự viết (Hobby có hạn mức); (c) chờ Pro. Watermark: chỉ khi có tin bị chép.
**Khuyến nghị BA**: (a), làm khi có >20 tin có ảnh thật. **Chờ**: chủ dự án.

### OPEN-41 · Nhà cung cấp model
**Vấn đề**: AOND §VII bắt đầu bằng Gemini rồi chuyển về chạy local (máy ASUS GX10); hệ thống thật
chạy Claude qua Supabase Edge với lớp gọi model duy nhất `_shared/claude.ts`, não cấu hình được
(FR-138), đo tiền (FR-169), chuông hết tiền (FR-168); bộ `10` neo vào hành vi model hiện tại.
**Phương án**: (a) giữ, ghi nhận lớp gọi model là chỗ đổi duy nhất; (b) đổi sang Gemini; (c) lai —
Gemini cho OCR giấy tờ, Claude cho hội thoại.
**Khuyến nghị BA**: (a); xem lại khi hoá đơn vượt ngưỡng FR-168 hai tháng liền. **Chờ**: chủ dự án.

### OPEN-42 · Ngưỡng CTV: hạn trả lời và mốc hạng
**Vấn đề**: chủ dự án 03/09: "nếu CTV bận sau khoảng thời gian chưa rep thì chấm điểm Đồng/Bạc/Vàng,
và nhắn để admin hỗ trợ khách" — không nêu số. BA đặt tạm: hạn 120 phút (`ctv_sla_phut()`, kiểm 15
phút trong 8–20h VN); hạng theo tỷ lệ đúng hạn 30 ngày Vàng ≥90%, Bạc ≥70%, dưới 3 câu = chưa đủ dữ
liệu (FR-173). Thang riêng cho CTV, khác FR-155.
**Phương án**: (a) giữ tới khi có ~30 câu thật rồi định cỡ; (b) hạn theo giờ làm việc; (c) gộp vào
điểm chăm khách 4 tiêu chí FR-137.
**Khuyến nghị BA**: (a), ngưỡng để trong hàm DB; hạng phải kèm hệ quả (ưu tiên đơn? thưởng?) — chốt
cùng lúc. **Chờ**: chủ dự án.

### OPEN-47 · Tám bảng chưa từng được sao lưu
**11/09/2026: sao lưu đã bỏ hẳn (OPEN-25)** — `sao-luu.mjs` gỡ khỏi repo. Các đoạn
dưới là lịch sử; chỉ còn ý nghĩa ở phần ảnh gốc (`masterdb-raw`).
**Vấn đề** (soát 05/09/2026): `scripts/sao-luu.mjs` liệt kê tay 22 bảng, DB có 30. Tám
bảng chưa từng vào bản sao nào: `app_config`, `curated_lists`, `inbound_events`,
`inbound_ledger`, `listing_media`, `media_cleanup_queue`, `property_events`,
`ratings_log`. Nặng nhất là `listing_media` — bản đồ ảnh ↔ tin (FR-165); mất nó thì file
trong Storage còn nguyên mà không ai biết ảnh của tin nào.
**Đã vá 05/09**: thêm đủ 30 bảng; `liet_ke_bang()` (`20260905b`) cho script tự hỏi DB mỗi
lần chạy, thiếu bảng là DỪNG với mã thoát khác 0 thay vì bỏ sót im lặng.
**Còn treo — và từ 07/09 đã thành ĐAU THẬT**: Storage (bucket `listing-public`) vẫn CHƯA
được sao lưu, `sao-luu.mjs` chỉ kéo bảng. Câu cũ ở đây viết "hôm nay 0 file nên chưa đau;
chạy `up-anh.mjs` xong là phải có lối sao lưu file" — `up-anh.mjs` đã chạy 07/09, bucket
giờ có **1005 file / 148 MB**, nên điều kiện đó đã tới. Mất bucket lúc này thì DB còn đủ
`listing_media` mà 171 tin không còn một tấm ảnh nào; dựng lại được chỉ vì `masterDB/`
trên máy local vẫn còn — tức lưới an toàn hiện nay là **một ổ đĩa cá nhân**, không phải
một quy trình. **ĐÃ CHỐT 07/09/2026**: chủ dự án chọn cất bản gốc lên chính Supabase —
bucket **`masterdb-raw`** (`20260907b`), riêng tư tuyệt đối, trần 50 MB/file, KHÔNG policy nào
cho `anon` lẫn `authenticated` nên chỉ `service_role` vào được. Khác `listing-public` ở chỗ:
`listing-public` là ảnh ĐÃ nén để phục vụ web, còn `masterdb-raw` là bản GỐC chưa đụng vào,
không phục vụ ai. **Đường đẩy đã có 07/09**: `scripts/up-masterdb.mjs` (chạy trên máy local, KHÔNG nén,
chạy lại bỏ qua file đã có, cuối cùng đối chiếu đếm đĩa ↔ đếm bucket rồi mới dám báo xong) +
bài tự kiểm TS-MASTERDB 24 ca trên Storage giả, trong `bun run kiem` và CI.
**Còn treo**: bucket vẫn CHƯA có file nào — dựng cái tủ và viết cả chìa khoá vẫn không phải là
cất đồ vào tủ. Chừng nào chưa ai chạy `node scripts/up-masterdb.mjs "<đường dẫn masterDB>"` thì
lưới an toàn vẫn là ổ đĩa cá nhân y như cũ.
**Bẫy thứ tự, gặp ngay lần đầu**: bản sao 07/09 chạy lúc 09:29, `up-anh.mjs` chạy sau —
nên `listing_media.json` trong bản sao đó chỉ 1 KB trong khi bảng thật có 1005 dòng.
Thư mục trông đủ 31 file, `trang_thai: "day_du"`, mà đúng cái cột nối ảnh ↔ tin thì rỗng.
Luật: **đổi dữ liệu lớn xong phải sao lưu lại**, và đọc SỐ DÒNG trong `manifest.json`
chứ đừng nhìn thư mục thấy đủ file rồi yên tâm.

---

### Advisor Supabase — các cảnh báo cố ý giữ

Ghi lại để lần sau không ai đi "vá" nhầm. Mọi cảnh báo dưới đây là chủ ý, đã đo.

| Cảnh báo | Đối tượng | Vì sao giữ |
|---|---|---|
| `security_definer_view` (ERROR) | `agents_public` | Anon phải đọc được hình chiếu NMG đã cắt sạch liên hệ (FR-125). View **tự chứa**, không join view khác — `20260827g` từng lỡ đổi sang invoker làm `/moi-gioi` trống, vá `20260904b` (TS-SEC-08) |
| `security_definer_view` (ERROR) | `listing_photos_v` | Ghép URL từ `app_config` mà anon đã bị thu quyền đọc (TS-KHO-21); chỉ trả ảnh bucket public của tin đã lên kệ (FR-167c) |
| `security_definer_view` (ERROR) | `ctv_ranks`, `hoi_thoai_thong_ke`, `khach_can_nguoi_that`, `nmg_hoat_dong`, `bds_hot`, `bot_do_tre` | Bảng nguồn bật RLS không policy; view tự gác cổng bằng `auth.role() = 'service_role'` hoặc email trong `admins`; anon đọc 0 dòng (TS-CTV, TS-ADM2) |
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


### OPEN-51 · Token Zalo OA sống 25 tiếng, không ai làm mới

**Vấn đề** (dựng lại 08/09/2026 từ nhánh `claude/sua-25-loi`, commit `70a63ab`): access
token của Zalo OA hết hạn sau **25 giờ**, nhưng nó nằm chết một chỗ trong Vault
(`ZALO_OA_ACCESS_TOKEN`) — không cron nào, không dòng code nào đổi nó. Cấp tay một lần thì
bot sống được một ngày rồi câm, và câm theo kiểu tệ nhất: `sendZalo()` trả `error != 0` →
hàm trả `false`, edge function **vẫn trả HTTP 200**, nên `bot_health_tick()` (chỉ soi mã
HTTP) không thấy gì. Đúng loại hỏng im lặng NFR-18 nói tới.

**Vì sao chưa đau** (đo 08/09/2026): `vault.secrets` hiện **không có secret Zalo nào**, và
bot đang nói chuyện qua bridge zca-js trên tài khoản clone chứ không qua OA API. Đường này
chỉ sống lại khi chuyển sang Zalo OA thật.

**Đã có sẵn nhưng chưa dùng được**: `70a63ab` có bảng `bot_tokens` (giữ cặp
access/refresh + hạn + lỗi lần gần nhất), edge function `zalo-token-refresh`, và cron 12
tiếng. **Không merge thẳng được**: nhánh đó chậm 93 commit và số hiệu FR đã bị cấp lại —
`FR-158` ở đó là "token Zalo tự làm mới", `FR-158` trên `main` là "câu rao sinh mã tin
ngay". Dựng lại thì phải cấp FR mới và viết migration mới theo schema hiện tại.

**Một chi tiết dễ mất**: Zalo **XOAY** refresh_token — mỗi lần đổi là cái cũ chết ngay. Nên
bảng giữ nó là bản duy nhất còn dùng được; mất là phải vào Zalo Developers cấp tay từ đầu,
và từ 11/09/2026 không còn sao lưu (OPEN-25), nên mất DB là mất luôn token này.

**Phương án**: (a) để treo tới khi thật sự dùng OA API; (b) dựng lại ngay thành FR mới.
**Khuyến nghị BA**: (a) — dựng một đường làm mới token cho một API không ai gọi là code
chết, mà code chết thì không ai chạy nên hỏng lúc nào không biết. **Chờ**: chủ dự án chốt
có chuyển sang Zalo OA hay ở lại bridge (OPEN-48 cũng đụng chuyện này).

### OPEN-52 · Trần lượt đếm theo thứ người gọi tự đặt được

**Vấn đề** (cùng nguồn `70a63ab`): FR-146 đếm lượt theo `conversation_id`, mà conversation
sinh ra từ `external_user_id` — một chuỗi **do người gọi tự đặt** và không ai kiểm. Đổi id
mỗi request là bộ đếm về 0. Trần chặn đúng người nó không định chặn (khách thật nhắn nhiều)
và không chặn được người nó định chặn.

**Rủi ro thấp hơn lời mô tả gốc**: comment trong `70a63ab` viết trước khi có cổng SEC-02
fail-closed. Đo thật 08/09/2026 — POST body hợp lệ vào `chat-reply` không kèm
`x-bridge-secret` trả **403 `forbidden`**, không ghi dòng nào. Nên muốn xoay id thì trước
hết phải cầm được `BRIDGE_SECRET` hoặc service key. Trần toàn cục theo ngày (FR-151,
`bump_model_quota`) vẫn giữ phần tiền.

**Còn hở ở đâu**: ai đã cầm được bí mật cổng thì xoay id vẫn đốt sạch hạn mức ngày của cả
hệ, và khách thật ăn 429 tới hết ngày. Bản vá là bảng `rate_counters` (cửa sổ cố định, một
dòng cho mỗi khoá mỗi cửa sổ) đếm theo thứ người gọi KHÔNG tự đặt được.

**Một điểm cần soát lại nếu dựng**: câu kiểm tham số (`external_user_id và text bắt buộc`,
trả 400) đứng **trước** cổng bí mật, nên người chưa qua cổng vẫn phân biệt được 400 với
403. Không mất gì — nhánh 400 return trước mọi truy vấn — nhưng nó nói ra tên tham số. Dựng
lại thì đảo thứ tự luôn.

**Phương án**: (a) treo; (b) dựng `rate_counters` thành FR mới.
**Khuyến nghị BA**: (a) chừng nào `BRIDGE_SECRET` chưa từng lộ; chuyển sang (b) ngay khi có
thêm người gọi ngoài bridge và zalo-webhook. **Chờ**: chủ dự án.
