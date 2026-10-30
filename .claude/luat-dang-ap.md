# Luật đang áp chi tiết — lõi bot, DB, web, tài liệu gốc

Tách khỏi CLAUDE.md ngày 29/10/2026 (SRS-5.1zzzzzzz297, B1 gọn quy trình): CLAUDE.md nạp vào MỌI lượt nên dài là tốn ngữ cảnh và hay bị compact.
File này KHÔNG tự nạp — **đọc mục tương ứng TRƯỚC khi sửa** `src/aioi/` (§6.2), DB / migration (§6.4), web (§6.5), hay tra tài liệu gốc (§3).
Nội dung chuyển nguyên văn; mục SRS mới nhất ở docs/07 vẫn thắng. Luật mới thêm vào đây (một dòng, kèm mã SRS), không thêm vào CLAUDE.md.

## 3. Tài liệu gốc & phân định phạm vi

Tài liệu gốc 2024 **không còn trong repo** (xoá ở commit `459008d` ngày 08/09/2026; OPEN-48). Muốn xem: `git show 459008d^:"<tên file>"`. Trích dẫn `[nguồn: biz model.docx §…]` trong `docs/` giữ làm dấu vết — không phải lời mời đi tìm file.
**Nguồn sự thật hiện nay:**
1. Bộ `docs/` chuẩn hoá theo Aioinhadat 2026.
2. `Kịch bản huấn luyện môi giới (Gemini 07-09-2026).md` và `Kịch bản AI Ơi Nhà Đất (Gemini 21-06-2026, share).md` (chủ dự án chốt 14 dòng ở `docs/09` OPEN-55 → FR-181…186).
3. SRD Aioinhadat `AOND req + chat examples.docx` — đã chưng cất vào `06 §6.8`, `09` OPEN-20/21; file gốc đã xoá. Bản bot của anh Luận (`luan8560/AOND`) là khuôn giọng phía bán (SRS-207).

Bản đồ "file gốc (đã xoá) → chưng cất ở đâu":

| File gốc | Được chưng cất vào |
|---|---|
| `Tài liệu hệ thống nhadat.cc.pdf`, `SS/` | `07-srs.md` |
| `nhadat.cc website.docx` | `02`, `04`, `05`, `06` |
| `biz model.docx` / `.pdf` | `01`, `02` |
| `S's side.docx` | `02`, `03` |
| `chats w B.docx` | `03`, `06`, `07` |
| `demo2Vitalify.docx` | `01` |
| `OKRs eo2024.pptx` | `01` |
| `dự kiến vốn 6 tháng đầu.xlsx` | `01` |
| `AOND req + chat examples.docx` | `06` §6.8, `09` OPEN-20/21 |
| `hình samples/` | `05`, `06` |
| `Kịch bản huấn luyện môi giới (Gemini 07-09-2026).md` | `02` FR-177, `09` OPEN-49 |
| `Kịch bản AI Ơi Nhà Đất (Gemini 21-06-2026, share).md` | `09` OPEN-55, `02` FR-181, FR-183…187, FR-173 a, FR-114 d, FR-177 h |

### 6.2 Luật đang áp — lõi bot

**Ghi ô tin**
- Ô tin chỉ ghi điều KHÁCH nói: mỗi ô mới / đổi phải có `bang_chung` nằm nguyên trong lời khách (`Engine._loc_o_tin` → `_gia_tri_ghi`, SRS-73); câu bot hỏi, lời AI tả ảnh không phải bằng chứng. Thêm đường ghi ô mới thì qua cùng cổng. Ngoại lệ có chủ đích, đánh dấu `_phuong_he_thong`: ghi tạm hai phường (SRS-214 mục 8), phường tra theo số nhà / hẻm (SRS-236), phường theo dự án / ngã tư.
- Ô tin một nguồn `listings.boc_tach` (đọc CÔNG KHAI với tin đang bán); ô riêng của chủ nhà (`schema.O_NOI_BO`) ghi bảng `listing_noi_bo` (SRS-116). Khoá bắt đầu `_` là nội bộ, không ra khách.
- Vai người rao (`seller_role`) chỉ nhận khi cụm trích GỌI TÊN vai (`_vai_co_bang_chung`, SRS-213) — phí theo vai đoán là báo sai tiền.
- Mỗi cờ "đã báo / đã hỏi" nằm ở chỗ nhớ qua lượt (ô tin / SQLite), không ở `y_luot` (làm mới mỗi lượt) (SRS-214).

**Dự án (một nguồn, SRS-249)**
- `projects` là kho chung (mogi + `thong_tin` đã duyệt; hai phía bot cùng đọc qua `SupabaseProjectStore` / `tra_du_an`); `du_an_kien_thuc` chỉ giữ phần học thêm nối `project_id` — đừng chép lại cột mogi sang đó. Dữ liệu riêng (giá, mã căn) ở tin (`listings.unit_code`) hoặc `rieng`, không vào kho chung.
- Câu "🤔 có phải dự án X" (tên gần trùng) chỉ hỏi khi dự án kho CÙNG vị trí với căn (`_cung_vi_tri_du_an`), là câu hỏi duy nhất của lượt (`_hoi_trung_ten`; lời đã có câu hỏi thì sang lượt sau) (SRS-254).
- Chung / riêng theo khuôn anh Luận: căn kế thừa dự án ⊕ mẫu nhà, căn thắng, giá luôn riêng; phía mua qua `projects.dong_ke_thua` (`Engine._gan_ke_thua`), web trang dự án đọc `thong_tin` đè cột mogi (SRS-283).
- Lời người bán về dự án là PHIẾU theo hạng (Đồng 1 / Bạc 2 / Vàng 3, chốt ≥ 6, phe khác ≤ 2), admin (`admins`) = `chac_chan:` ghi thẳng; mã phiếu chỉ do `Engine._ma_phieu` tính — đừng nhận phiếu từ model. Tệp mẫu nhà lưu `du-an/…` (bucket công khai) để gửi được.

**Địa chỉ / phường**
- Cột `listings.ward` chỉ mang `wards.ten_day_du` hoặc null; DB chặn lần cuối (`20261009b`). Xã Tây Ninh / Đồng Nai ở bảng riêng `xa_tinh_khac`, không nhét vào `wards`.
- Tra địa danh: `dia_danh.py` — chữ trước, vector Gemini sau, máy kiểm tên gần chữ khách; vector do lịch `nhung-tick` / `nhung-dia-danh-tick` / `nhung-luat-tick` nuôi — đừng gỡ. Tìm theo nghĩa đi qua `tim_dia_danh_theo_nghia` và `tim_nha(p_vec)`, đừng dựng hàm từng bảng (SRS-180).
- Phường cũ bị chia → kể các phường mới cho khách chọn, không hỏi trống; phường cũ về đúng một phường mới → dùng tên mới (SRS-191 / 220 / 233). Đừng dùng `chon_phuong_da_goi_ten` cho tên cũ có chữ.
- Số nhà / hẻm cụ thể → tra phường TRƯỚC (`engine._phuong_tu_dia_chi`): bản đồ (`TraDiaDanh.phuong_theo_so_nha`, rpc `tra_nominatim`) chỉ nhận khi ra ĐÚNG số nhà + đúng đường và phường nằm trong kho đường / hẻm — đừng nới sang kết quả mức đường; không ra thì kho hẻm một phường; vẫn không ra mới hỏi (SRS-236).
- Phường hỏi tối đa 2 lần rồi báo admin MỘT lần mỗi căn (`_phuong_bao_admin`); khối "Kho hẻm" chỉ vào lượt hệ thống hỏi phường (SRS-228). Địa chỉ chỉ có tên đường (không "/", hẻm, ngõ) → `lo_gioi_hem = "Mặt tiền"` (SRS-157).
- Tên đường khớp ngang nhau nhiều đường (bỏ dấu: Mã Lò / Mã Lộ) → gõ đúng dấu thì nhận tên đó, không thì kể các tên cho khách chọn (`TraDiaDanh.ung_vien_duong`, SRS-270 / 271).
- Từ điển tên đường bảng `duong` nạp bằng `node scripts/nap-duong.mjs`, không ghi tay; toạ độ tin tra `duong` trước Nominatim (SRS-224).

**Hỏi & bản nháp (phía bán)**
- Sàn rao (`Property.minimal_missing`) = loại hình + vị trí (địa chỉ / đường / dự án HOẶC khu vực) + giá; tự soạn bài khi đủ ba nhóm `NHOM_SOAN` — quy mô · pháp lý · hiện trạng (chủ dự án 28/10, SRS-260; cho thuê bỏ pháp lý). Đổi bộ ô cơ bản là quyết định chủ dự án — đừng tự thêm / bớt. Ô còn thiếu hỏi SAU khi duyệt, mỗi lượt MỘT ô; khách lờ một ô 2 lần thì để sau.
- Duyệt bản nháp: cụm trích ở tin vừa nhắn, hoặc (chỉ đồng ý) ở tin khách SAU bản nháp 📋 chưa duyệt — mốc `_duyet_ban` (SRS-247).
- Lượt trình bản nháp phải ra bản tin có dòng mở riêng chứa 📋 (code gắn lại nếu thiếu, `_gan_dau_ban_tin`); mọi bước nhận bản tin dựa vào dấu này (SRS-204 / 222).
- Bản tin không tự thêm điều căn chưa có: hẻm / mặt tiền (SRS-155), tiện ích / tình trạng nhà (SRS-208), pháp lý / "chính chủ" (SRS-233), số không có trong ô tin / lời khách (`_so_khong_co_trong_tin`, SRS-218) → `_soat_hinh_thuc` gọi lại model. Bình giá và khoe khan hiếm trong tin rao: chủ dự án chấp nhận — đừng chặn.
- Lời khách dặn CÁCH VIẾT bản tin → ô `yeu_cau_viet` → khối `khoi_yeu_cau_viet` ở mọi prompt soạn tin (SRS-218). Bot KHÔNG tự học qua chat; đổi hành vi chỉ qua câu chuẩn / câu mẫu / code.
- Ô tự do `uu_the` chỉ giữ cụm nằm nguyên trong lời khách (SRS-205). Lời hứa với khách chỉ nói khi hệ thống có đường làm thật (SRS-205 / 216).

**Giọng & hình thức lời bot**
- Giọng phía bán theo khuôn anh Luận (SRS-207); `prompts.GIONG_VUI` là CHỖ DUY NHẤT dặn giọng (SRS-219 / 228 / 248) — đổi giọng sửa ở đó; không kèm cặp ví dụ cụ thể (model chép thành khuôn, SRS-248), ĐỪNG thêm luật giọng chồng lên. Ví dụ trong prompt chỉ là lời ĐÁP, không chứa câu hỏi của một ô cụ thể (model chép, SRS-196); không câu minh hoạ hoàn chỉnh.
- Xưng hô một nguồn `xung_ho.py` (`goi_toi`): khách xưng em → anh / chị theo tên trợ lý; khách xưng cháu / con → cô / chú; khách xưng chú / cô / bác giữ đúng chữ (`chu_co_bac:<chữ>`, SRS-234). Bot không gọi khách là "mình" ("mình" nghĩa chúng ta thì được, SRS-230); không mở đầu "Dạ". Câu mẫu / câu code ghép gọi khách bằng `{goi}`; mảnh chữ code ghép sẵn "anh/chị" + "em" thì qua `engine._xung_ho_cau` (SRS-250); câu mẫu gửi thẳng khách qua `Engine._cau_khach` (SRS-254). Giới tính Zalo chỉ là ĐOÁN — vào prompt qua `khoi_xung_ho(..., doan=_xung_ho_doan(conv))`, không thành "khách xưng anh" (SRS-245).
- Câu ghi nhận ("em ghi rồi…") tối đa MỘT lần mỗi cuộc chat (SRS-229). Chế độ `SOAT_GON` (SRS-298): luật giọng / lặp chỉ ghi log, gọi lại model tối đa một lần, "Dạ" do code bỏ — luật mới phân rõ nhóm `ly_do` (gọi lại) hay `mem` (log). Hai lưới lặp hình thức (`_cung_mo_dau`, `_cau_lap_luot_truoc`) không được gỡ khi đổi giọng (SRS-213). Thêm luật cứng mới thì thêm vào `_ly_do_cung`.
- Chống lặp mở đầu / chào lại giữa chừng báo TRƯỚC trong prompt bằng dữ kiện `khoi_mo_dau_vua_dung` (sau ranh giới cache), không thêm luật giọng ngoài `GIONG_VUI`; khối chào lần đầu chỉ khi khách chưa đưa ô tin (SRS-301).
- Bot tự hiểu từ dữ kiện đã có rồi làm, KHÔNG hỏi lại khách để xác nhận nghĩa / số lệch (chủ dự án 30/10); số khách nói thắng số tự tính (SRS-302). Ví dụ trong prompt bóc tách không được đá định nghĩa ô.
- Form bóc tách người bán gọn (`OPERATIONS_SYSTEM_BAN`, SRS-303) CẮT từ form đầy đủ như form mua gọn — sửa luật ở `OPERATIONS_SYSTEM`. Tiêu đề: prompt dặn 15–25 từ, lưới gọi lại khi quá 30.
- Gỡ / thêm luật prompt hay luật soát phải chạy `bun run cham` ≥ 2 lần mỗi bên và so điểm (SRS-304); điểm tụt thì không gộp.
- Lưới soát lời phía bán soi phần CHAT (`_phan_chat_quanh_ban_tin`); chỉ lưới về nội dung tin (số, hẻm, pháp lý, tiêu đề) soi thân bản tin 📋 — thân tin viết cho người mua (SRS-306).
- Agent phía bán (`agent_ban.py`, công tắc `AGENT_BAN`, SRS-307): khối DỮ LIỆU (rổ hàng, bộ nhớ dự án, giá đã gửi) đi qua công cụ — thân công cụ là chính hàm khối của engine, sửa ở hàm đó. Luật HÀNH VI đừng giấu trong khối dữ liệu (model chỉ thấy khi gọi công cụ) — đặt ở `agent_ban.HUONG_DAN`. Khối dữ liệu mới thì thêm vào `CONG_CU` + `_khoi`.
- Lỗi bot đáng giữ → thêm kịch bản vào `tests/kich_ban/ban.json`, không thêm câu luật vào prompt (SRS-305). `docs/07-srs.md` giữ 10 mục nhật ký mới nhất, mục cũ ở `docs/07-srs-luu-tru.md` (không thêm mục mới vào đó).
- Mỗi lượt MỘT khối "ƯU TIÊN LƯỢT NÀY" (cần người > pháp lý > ngoài việc > hỏi về); khối mới đặt vào chuỗi `or` đó (SRS-178). Lượt được phép không có câu hỏi — đừng thêm lưới "lời phải có câu hỏi"; nhưng tối đa MỘT câu hỏi (`_nhieu_cau_hoi`, SRS-252), khối dặn hỏi xác nhận phải là câu hỏi duy nhất, không cộng thêm.
- Độ dài: "ngắn vừa vừa", ý chính rồi dừng (SRS-97).

**Phí, pháp lý, số liệu**
- Tiêu đề tin rao viết thường như câu nói, không viết HOA cả cụm (`_viet_hoa_ca_cum`, SRS-241). Chính sách không bớt phí / có ký HĐ / không độc quyền ở `prompts.BUSINESS_CONTEXT`.
- Mức phí % trong lời bot phải bằng `prompts.muc_phi(vai, thuê)` với vai = `conv.vai_phi` (từ tin BÁN thứ 3 trong rổ tính như môi giới, tin thuê không đếm; CĐT không báo số, báo admin) — đừng đưa `user_type` trần vào đường phí; vai chưa rõ thì nêu cả hai mức hoặc hỏi vai (SRS-227 / 240).
- Mức phí một nguồn: số ở `revenue.py`, chữ trong prompt / engine dùng `prompts.PT_CHU` / `PT_MG` / `PHI_THUE`, web dùng `lib/phi.ts` (test đối chiếu) — đừng gõ tay "1%" / "0.5%" (SRS-275).
- Pháp lý chỉ trả lời từ `phap_ly.MAC_DINH` (+ bảng `kien_thuc_phap_ly` admin sửa) kèm điều luật gần nghĩa (`dieu_luat`, SRS-231); luôn nói "tham khảo" (nội dung AI soạn, chưa người chuyên môn duyệt); trả lời tối đa 2 câu trúng ý hỏi, bỏ ý phụ (SRS-282); không cho bot search web. Thêm mục = khoá ở `MAC_DINH` + `python scripts/sinh-migration-phap-ly.py <tên>`. Thêm / thay văn bản luật: `bot/supabase/luat/danh-muc.json` + `scripts/tach-dieu-luat.py` + ô `nap-luat`, không ghi tay. "Thuế phí" phải nộp khi mua bán là câu pháp lý, không phải phí môi giới (SRS-233).
- Số tài chính tham khảo (`tai_chinh.py`) là số TƯỢNG TRƯNG chưa kiểm — chỉ nói khi khách hỏi, kèm "tham khảo" (SRS-148).
- Câu mẫu nói nguyên văn chỉ ở `cau_mau.MAC_DINH` (chủ dự án sửa ở `/admin/cau-chuan`, bảng `cau_mau` đè); thêm câu = khoá + migration `*_cau_mau_*` (SRS-106). Câu chuẩn (bảng `cau_chuan`) là ví dụ trong prompt, chèn TRƯỚC `RANH_GIOI_CACHE` (SRS-180), lọc theo luật hình thức đang áp (SRS-215).

**Phía mua**
- Một Zalo = một khách = một hội thoại (`_hoi_thoai_chung` / `_tim_hoi_thoai`); một Zalo vừa mua vừa bán là hai bản ghi `sellers` + `buyers`; vai của lượt theo `user_intent` lượt đó (SRS-149 / 153). Tạo dòng khách mới thì đọc lại khi thua cuộc đua (SRS-230).
- Gợi căn cần khu vực VÀ ngân sách (`co_tieu_chi`, SRS-214); mọi đường gợi căn đi qua `engine._can_goi_y` (bỏ căn đã chê), đừng gọi `can_phu_hop` trần (SRS-175). Mỗi lượt MỘT căn, bốn đoạn = bốn tin Zalo (SRS-160); không nói mã tin / "rổ". Đừng chỉnh trọng số `tim_nha` khi chưa có số đo (`do-tim-nha`).
- Một khách nhiều bộ nhu cầu: `conv.buyer_lead` = bộ đang nói, `conv.nhu_cau_khac` = bộ đã cất; mở bộ mới CHỈ khi AI đặt `nhu_cau_moi`, thôi bộ khi AI ghi `nhu_cau_thoi` (`Engine._chon_nhu_cau`, so nhãn AI ghi — không dò chữ khách, SRS-287); DB `buyer_needs` (sàn / trần số qua `parse_vnd`), `buyers.preferences` = bộ đang nói (SRS-286).
- Khách không gõ mã căn: mã lấy từ link lời bot gần nhất CHỈ khi lời đó có đúng một căn; nhiều căn thì hỏi lại, không lấy căn đầu (`_ma_can_bot_vua_nhac`, SRS-288).
- Một nhà có thể có nhiều tin (nhiều người rao): "đã giới thiệu / đã báo / đã chê" so theo `mua.khoa_nha` (số nhà + đường + phường) chứ không chỉ id tin (SRS-278).
- Số ảnh nói thật (`_so_anh`); ảnh đã gửi đủ thì không gửi lại (SRS-168 / 232). Hết ảnh / chưa có ảnh → nhờ chủ nhà NGAY (`xin_them_anh`, câu `mua.XIN_THEM_ANH` qua `info_requests`); chủ nhà gửi ảnh → `tra_loi_xin_anh` → báo lại khách (SRS-254). Số trong lời bot phía mua phải có trong dòng căn / lời khách / khối "SỐ TÍNH THEO CĂN" (`_so_khong_co_trong_can`).
- Việc bot TỰ GIAO (khối `mua`: hẹn xem, câu hỏi chủ nhà, xin ảnh, chê căn, thôi báo, tra dự án, căn cụ thể; `can_nguoi_that`; `hoi_ve`; `hoi_phap_ly`) làm theo ý AI đọc — KHÔNG so nguyên văn lời khách, đừng gắn lại cổng trích (chủ dự án 29/10: "AI hiểu ý khách, thực thi đúng ý", "kệ hallucinate", SRS-280 / 281). Cổng nguyên văn chỉ cho ô dữ liệu / tiền / đăng / xoá (SRS-281 mục 3). Câu trả lời chủ nhà chuyển khách mua: cụm trích khớp hoặc nguyên lời chủ nhà. Lượt không ghi gì thì không nói "đã chuyển / đã giữ lịch".
- **CTV đã bỏ hẳn** (chủ dự án 28/10/2026): mọi đường báo của phía mua (lịch xem, câu hỏi chủ nhà) đi chủ nhà (hạn 12 giờ) hoặc admin (hạn 5 giờ, `admin_han_gio`) (SRS-165 / 170 / 238). Code và DB đã gỡ CTV (SRS-238 / 239: bảng `ctvs`, cột `ctv_id`, view `ctv_ranks` đã xoá; enum `msg_sender` còn giá trị `ctv` không ai dùng); đừng thêm lại vai / bảng / nhánh CTV.
- Câu khách hỏi căn rổ mẫu (`listings.source = 'seed_thu'`) giao thẳng admin, không qua người bán thử (`route_info_request`, SRS-269).
- Dự án phía mua (SRS-250): "khu X có dự án gì" → `du_an_theo_khu`; tìm căn / bảng căn còn bán trong dự án → `can_trong_du_an` (nối `project_id`); câu về dự án không chỉ căn → chủ nhà của một căn trong dự án, không có căn thì báo admin một lần. `?ref=` từ web không tới được Zalo cá nhân.
- Tra dự án phía mua: `mua.hoi_du_an` → `tra_du_an` (chữ trước, vector sau — kết quả vector chỉ để khách xác nhận) (SRS-184 / 185). Bot chỉ hỏi "có phải dự án X" khi khách nhắc dự án hoặc địa chỉ trùng số nhà + đường (SRS-232).

**Gửi chủ động & nhắc**
- Báo căn mới cho khách mua: `bao_can_moi.py`, vòng 10 phút, 8–20 giờ, ≤ 1 tin / khách / 24 giờ, xoay 4 kiểu văn phong (SRS-150 / 188). Đừng bật lại trigger cũ `bao_tin_moi_khop` / `nudge` (hai chủ).
- Hỏi chủ nhà căn còn bán: `hoi_con_ban.py`, tin chưa xác nhận 20 ngày (chủ dự án chốt), một tin / người bán, 8–20 giờ; chủ đáp còn → `con_ban` → `listings.xac_nhan_con_ban_at`. Căn đã cọc → hỏi `O_COC` (ô riêng), mỗi lượt một ô. Phí hợp đồng = mức chuẩn, không có phí thoả thuận (SRS-295).
- Tin chống Zalo xoá kết nối (FR-63): `giu_ket_noi.py`, khách im 6–7 ngày, 8–20 giờ, câu mẫu cố định, giữ chỗ `reminders` `reengage` (SRS-238).
- Nhắc `followup` / `sold` / `feedback` / `admin_reply` / `len_web` do LÕI gửi (`gui_nhac.py`, vòng 60 s; `len_web` chờ tin `dang_ban` rồi nhắn chủ nhà — bot chỉ hứa "tin hiển thị em nhắn" khi `hen_bao_len_web` đã ghi, SRS-254); thêm loại nhắc = thêm vào `KIND_LOI` + `soan_tin`, đừng mở đường gửi thứ hai; đừng ghi `noi_dung_gui` khi còn pending (SRS-216).
- Tin nội bộ (🙋 ⭐ 🩺) gửi CTV / admin mở bằng `$$$$$ `; tin cho khách thật không bao giờ có (SRS-134) — trừ tin phụ "Đã trích xuất" khi công tắc `DONG_TRICH_XUAT` trong `cai-vps.sh` = `bat` (giai đoạn test, SRS-252; chạy thật thì `tat`). Ảnh gửi qua `/send` của bridge, vòng tải ảnh chỉ ở `guiAnhQuaUrl` (mọi ảnh một tin, SRS-280).
- Việc bridge kéo qua `escalation-feed`: đích ID thử bị huỷ ở `pull` (`la_id_thu`), gửi hụt báo `hut` (thử lại 5 phút × lần, 5 lần → `dead`) — đường gửi mới phải có trần như vậy (SRS-276).
- Tin khách bấm "Trả lời" trên Zalo: bridge `quote_text` → `conv.tin_tra_loi` → `prompts.khoi_tin_tra_loi`; nội dung trích KHÔNG phải lời khách, không làm bằng chứng ô tin (SRS-270).
- Tin khách tới lúc bot đang soạn: lời vừa soạn bỏ, lượt kế đọc gộp (`server._bo_loi_cu_neu_co_tin_moi`, SRS-279) — đừng gửi lời soạn trên hội thoại đã cũ.
- Lệnh gõ tay trên Zalo (`lenh_zalo.py`): `/quit` (xoá phiên), `/state`, `/listings`, `/whoami`, `/import`, `/project`, `/link`; chạy TRƯỚC model, không vào lịch sử (SRS-211).

**Prompt, cache, chi phí**
- `RANH_GIOI_CACHE` (`llm/base.py`): phần cố định trước dấu, dữ liệu đổi mỗi lượt sau dấu; dựng prompt mới thì đặt dấu đúng chỗ, khối cố định mới chèn trước dấu (SRS-166 / 213). Batch API không hợp (chat thời gian thực).

### 6.4 DB, migration, cổng soát

- **Thay đổi schema bắt buộc đi qua một file trong `bot/supabase/migrations/`**, và mở PR cho file đó — áp migration xong mà chưa có PR thì việc chưa xong (vết OPEN-46: 41–52 migration áp thẳng không file, nội dung mất).
- **`bot/supabase/schema.sql` là bản dựng lại từ số không**, do `xuat_schema()` sinh — cổng đỏ vì schema.sql thì SINH LẠI, đừng sửa tay: `node scripts/sinh-schema.mjs` (đọc service_role từ `scripts/.env`), hoặc dispatch `apply-migration` trên nhánh PR với ô `commit_schema = commit` (commit do bot đẩy không kích CI — push thêm một commit thật). Lệnh curl tương đương:

```bash
curl -s -X POST "https://rqxmmqmctpklqcmbfxuj.supabase.co/rest/v1/rpc/xuat_schema" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{}' | jq -r . > bot/supabase/schema.sql
```

- Dựng lại DB: chỉ nạp `schema.sql` (+ file schema `so`, `luu_tru` — `xuat_schema()` không quét hai schema đó) qua `scripts/dung-lai-db.mjs` / ô `dung_lai`; KHÔNG replay thư mục migration.
- Cổng CI: `soat-migration.mjs` (so md5 từng thân hàm schema.sql ↔ DB qua `ham_md5_cong_khai()`), `soat-db.mjs` (8 phép soát trạng thái DB qua `soat_db_cong_khai()`; bản nền `scripts/soat-db-da-biet.json`). **Thêm dòng vào bản nền / `DA-DOI-CHIEU.json` là một quyết định kèm lý do, không phải cách làm cổng xanh.**
- **View MỚI mặc định LỘ** cho `anon` / `authenticated` (default privileges): `revoke all … from anon, authenticated` TRƯỚC rồi mới grant. Bảng / cột mới thêm `comment on` trong cùng migration.
- `=` trong khối `NOT (…)` trên cột có thể NULL là bẫy — dùng `IS NOT DISTINCT FROM` (`bot/tests/null-ba-tri.mjs`).
- Nhúng `listings ↔ sellers` phải chỉ tên khoá ngoại: `sellers!listings_seller_id_fkey(...)` (PGRST201); `maybeSingle` / `catch` phải đọc `error`.
- Đừng tin `cron.job_run_details.status` — `net.http_post` chỉ xếp hàng; kết quả thật ở `net._http_response`. Đường báo động mới phải có bằng chứng tới nơi.
- Sổ lỗi `bot_errors` là đầu vào của còi `bot_health_tick`: đường đi đúng thiết kế không ghi sổ (vòng tự nuôi 08/09); mọi `catch` mới phải nối vào sổ.
- Luật tiền MỘT NGUỒN: `_shared/extraction/luat-tien.ts` + SQL `parse_vnd` cùng trả lời bảng ca `bot/tests/luat/tien.json` (`bun run doi-chieu:tien`). Nhãn tìm kiếm: `_shared/extraction/nhan.ts` + `ten_nhan()` SQL.
- Dữ liệu THỬ / THẬT tách bằng `la_id_thu(zalo)` (chỗ DUY NHẤT giữ tiền tố ID thử). `reset_nguoi_test` từ chối ID thật. Rổ mẫu `listings.source = 'seed_thu'` (SEED0001..0242, người bán `thu-seed-001`) — không có ảnh (ảnh mẫu vẽ đã gỡ, SRS-280) — đường xoá dữ liệu thử mới phải loại nó (SRS-179).
- Cột thông số tin: ô AI đúng khuôn số đọc thẳng (`supabase_store.cot_tu_o`), còn lại qua `boc_thong_so` — cột trống vì chữ khác từ khoá thì đưa AI trả mã, đừng thêm từ vào regex DB. Đổi giá ghi `property_events.doi_gia`; `deals` một dòng mỗi lần chốt (SRS-285).
- Xem rổ hàng / log chat bằng mắt người: schema `so` (`so.ro_hang`, `so.nguoi_ban`, `so.hoi_thoai`), đừng mở `messages` / `listings` trần.

### 6.5 Web

- `bun run build` có thể im lặng bỏ sót lớp Tailwind MỚI khi `.next/cache` cũ (Vercel cũng khôi phục cache): khoảng cách sai so với mã nguồn → soi CSS đã build trước, `rm -rf .next/cache && bun run build`. Đổi bố cục thì CHỤP màn hình bản build thật.
- Trang tin phải nằm trong cache: route động cần `generateStaticParams()` trả `[]` (KHÔNG hỏi DB); bảng route sau build phải là `●` / `○`, thấy `ƒ` là hỏng; route đọc `searchParams` bọc truy vấn trong `unstable_cache` (`bot/tests/giam-egress.mjs`).
- Bản đồ: MapLibre (`maplibre-gl` ghim `6.13.0`) + OpenFreeMap; nạp qua `napMapLibre()` (đừng `import("maplibre-gl")` trần — worker mất, bản đồ trống mà build vẫn xanh); gom cụm qua `lib/cum-ghim.ts` (`cumGhim`); rpc `ban_do_khung` / `tim_moc`. Không có bài kiểm tự động — chụp bản build thật (SRS-206 / 217).
- Provider `claude_cli` (`claude -p`, quota gói Claude Code) CHỈ để test trên máy mình (`scripts/thu-cli.py`); không đặt cho lõi VPS phục vụ khách (SRS-300).
