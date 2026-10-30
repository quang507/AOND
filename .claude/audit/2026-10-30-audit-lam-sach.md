# Audit làm sạch repo AOND — giai đoạn 1 (chỉ đọc)

- **Mốc:** `main` @ `141492d8e301eb0620ec17e774ff59fce4168e40` (30/10/2026 16:22, SRS-309, PR #235).
- **Nền:** `python -m pytest -q tests` → **1281 passed / 20,8 s** (chạy thật trên mốc này). Bản clone nông (50 commit), nên không đo được lịch sử cũ hơn.
- **Cách làm:** đọc code và docs, grep, đo prompt bằng cách gọi thật các hàm dựng, đo hàm bằng `ast`, chạy thử vài hàm. Giai đoạn này **chưa sửa gì**.
- **Mức tin cậy của từng dòng:**
  - **[đã chạy]**: tôi tự chạy lại hoặc tự đọc lại code để xác nhận.
  - **[đã đọc]**: rút từ code đã đọc, chưa chạy.
  - **[cần xác minh]**: chưa chắc, không được coi là kết luận.
- **Về tên miền:** chủ dự án xác nhận 30/10 là hiện test trên Vercel, sau mới chuyển `aioinhadat.com`. Các phát hiện liên quan tên miền đã tính theo điều này.

---

## Tóm tắt một trang

Repo chưa "hỏng" theo nghĩa test đỏ: 1281 bài xanh, tên hàm / hằng mà docs nhắc đều còn, các ngưỡng số (12 giờ / 5 giờ, 20 ngày, 15 s / 40 s / 90 s…) khớp giữa code và docs. Vấn đề nằm ở **6 cơ chế gốc**. Chính các cơ chế này làm "luật mới đè luật cũ" và "bot không còn hiểu đúng vấn đề":

| # | Cơ chế gốc | Biểu hiện chính | Mức |
|---|---|---|---|
| **R1** | **Công tắc A/B để lại hai đường song song.** Luật nằm ở đường cũ bị rơi khi bật đường mới, còn test vẫn chạy đường cũ. | Phiếu lượt (`PHIEU_LUOT=bat`) mất chính sách phí và vài phần hiểu tin hệ thống. Lưới SRS-292 không chạy dưới `SOAT_GON=bat`. Khối prompt trỏ tới nhãn không còn. Không có `conftest.py`, nên ~190/198 file test chạy nhánh production đã tắt. | **nặng** |
| **R2** | **Máy đoán ý khách bằng từ khoá** (trái CLAUDE.md §4.8 / SRS-281) | Lưới "chính chủ / sổ hồng" lấy bằng chứng từ chữ khách: môi giới nói "chủ nhà nhờ bán" thì tin được ghi "Chính chủ". Lưới "gần chợ / nhà mới" khớp chữ "cho" / "mới" có ở hầu hết câu, nên thực tế không bắt được gì. `loai_tien_ich` đọc "môi trường" thành `truong_hoc`. | **nặng** |
| **R3** | **Nhiều nơi cùng quyết một đầu ra**, không có thứ tự ưu tiên | Ít nhất 7 khối tự nhận là "câu hỏi DUY NHẤT" nằm ngoài chuỗi ưu tiên. Duyệt bản nháp được quyết ở 4 nơi. Vai người rao có hai nguồn (`vai_phi` và `user_type` + regex). Phía mua có hai lệnh ngược nhau về việc "hỏi chủ nhà". | **nặng / vừa** |
| **R4** | **"Một nguồn" mới có trên giấy** | 6 regex SĐT khác nhau: SĐT viết có dấu cách / chấm **lọt qua bộ che PII**. 11 hàm bỏ dấu, 2 hàm không đổi "Đ" hoa. Khoá `thang_may` khai trùng. `EXTRACTION_SYSTEM` chép tay một khối của `OPERATIONS_SYSTEM` và đã lệch. | **nặng** (PII) / vừa |
| **R5** | **Prompt dày luật cấm, luật giọng rải nhiều nơi** | Cận trên số chữ "không": 65 trong `build_chat_system`, 95 trong `build_fee_followup_system`. "Dạ" được dặn 33 lần với 3 cách nói khác nhau. Khen bắt buộc ↔ "không khen gượng". `fee_followup` để 9.772 ký tự cố định nằm sau dấu cache. | vừa |
| **R6** | **Test kiểm giả định của người viết vá** | 92 test chỉ kiểm chữ trong prompt. LLM giả lấy cả câu khách làm "bằng chứng", nên cổng SRS-73 không bao giờ chặn. Lời giả mặc định mở bằng "Dạ", nên đường "model viết đúng ngay lần đầu" hầu như không được test. Bộ chấm dùng lại chính bộ dò của lõi và chỉ có phía bán. | **nặng** (vì che R1–R3) |
| — | **Docs tả hiện trạng đã cũ** | docs/07 §1.2 còn tả "tàn dư CTV chưa dọn" (code / DB đã gỡ). Bảng lịch cron sai tên. docs/13 không vẽ công tắc. FR-140 / 173 còn CTV. BR-01 / FR-174 ghi vùng "Sài Gòn + Long An". | vừa |

**Ba việc nên làm trước:**
1. Đợt 0: dựng nền test theo cấu hình production. Không có nền này thì mọi bản sửa sau đều "xanh giả".
2. Đợt 1: vá lọt PII SĐT.
3. Đợt 2: luật rơi khi bật đường mới, gồm chính sách phí ở phiếu lượt và lưới SRS-292.

Kế hoạch có 9 đợt PR (§3). Có 9 câu cần chủ dự án chốt (§4); đợt nào phụ thuộc câu nào đều ghi rõ.

---

## 1. Phát hiện — xếp theo mức độ

Định dạng: **ID · lớp gốc · vị trí · bằng chứng · đề xuất sửa gốc · rủi ro.**

### 1.1 NẶNG

**AU-01 · R4 · SĐT có dấu cách / chấm lọt bộ che PII [đã chạy]**
- Vị trí: `src/aioi/engine.py:239` `_PII_PHONE_RE = (?<!\d)(?:\+?84|0)\d{9}(?!\d)`, dùng ở `_redact_personal_data` (`:270`), là lưới che cứng sau lớp AI khi chép sổ đỏ / tài liệu.
- Bằng chứng (chạy thật): `0903123456` → bắt; `0903 123 456` → **không**; `0903.123.456` → **không**.
- Còn 5 bản regex SĐT khác: `mua.py:55`, `prompts.py:2420`, `tin_goc.py:13` (che thừa cả giá "12.500.000.000"), SQL `che_sdt` (`schema.sql:2373`, theo regex thì cũng không bắt dạng có dấu cách [cần xác minh trên DB]), `_shared/luat-lien-he.ts:27`.
- Sửa gốc: một hàm `che_sdt()` Python dùng chung, kèm bảng ca `bot/tests/luat/sdt.json` đối chiếu với SQL `che_sdt` (theo khuôn `doi-chieu:tien`).
- Rủi ro: che thừa số không phải SĐT (giá, diện tích). Bảng ca phải có cả ca âm.

**AU-02 · R1 · Phiếu lượt không mang chính sách phí [đã đọc]**
- Vị trí: `prompts.py:517-553` `build_phieu_luot` không chèn `BUSINESS_CONTEXT` (`:273`, chỉ có ở `build_chat_system :479`, listing `:959`, fee followup `:1144`).
- Khi khách hỏi phí, khối `hoi_ve_luot == "phi"` (`engine.py:2921-2928`) vẫn đưa **con số** theo vai. Nhưng các ý chính sách sau **không có** ở lượt thu thập: không bớt phí, có ký HĐ, không độc quyền, môi giới không chia hoa hồng khác. Khối đó còn trỏ "theo VAI NGƯỜI RAO / BỐI CẢNH **ở trên**", là phần không còn trong phiếu lượt.
- Hệ quả [cần xác minh bằng `cham`]: khách hỏi "bớt được không / có ký HĐ không" trước bản nháp thì model tự trả lời về tiền / pháp lý.
- Sửa gốc: tách hằng `CHINH_SACH_PHI` từ `BUSINESS_CONTEXT` (một nguồn), chèn vào khối hỏi phí hoặc phần cố định của phiếu lượt. Thêm kịch bản "xin bớt phí", "có độc quyền không" vào `tests/kich_ban/ban.json`.
- Rủi ro: prompt dài thêm vài trăm chữ, phải đo `cham` ≥ 2 lần.

**AU-03 · R2 + R3 · "Chính chủ" / pháp lý trên tin công khai quyết bằng từ khoá lời khách [đã đọc]**
- Vị trí: `engine.py:1271-1273`
  - `co_phap_ly = … or _KHACH_NOI_PHAP_LY_RE.search(khach)`
  - `chu_nha = user_type == CHU_NHA or re.search(r"chinh chu|chu nha", khach)`
- Bằng chứng:
  - Khách nói "**chưa có** sổ hồng" thì lưới coi là đã có pháp lý.
  - Môi giới nói "**chủ nhà** nhờ anh bán" thì lưới cho in "Chính chủ".
  - Đường phí lại dùng `conv.vai_phi` (cổng `_vai_co_bang_chung`, `:311`), nên có thể ra tin "Chính chủ" mà phí tính theo môi giới.
- Sửa gốc: lưới chỉ đối chiếu ô pháp lý đã qua cổng bằng chứng (`KHOA_PHAP_LY`) và `conv.vai_phi`, bỏ vế dò chữ khách.
- Rủi ro: thấp. Lưới bắt nhiều hơn nên số lần gọi lại tăng nhẹ.

**AU-04 · R3 · Phía mua: hai lệnh ngược nhau trong cùng lượt [đã chạy grep]**
- Vị trí: `mua.py:983-984` ("không có thì **hỏi khách có muốn em hỏi chủ** của căn đang nói không") ↔ `agent_mua.py:34-35` ("khách hỏi tức là muốn biết, **KHÔNG hỏi lại khách 'có muốn em hỏi chủ nhà không'**"). Cả hai vào cùng lượt khi `AGENT_MUA=bat` (`engine.py:2711` + `2730`).
- Câu trong `mua.py` cũng trái SRS-280 / 281.
- Cùng lớp, chưa chạy grep lại: `mua.py:978` ("nói sẽ báo khi có căn") ↔ `mua.py:1062` ("không hứa sẽ báo lại") [đã đọc qua nhánh audit].
- Sửa gốc: bỏ mệnh đề ở `khoi_can_cho_khach`. Lời hứa báo lại thành dữ kiện: khách đang nhận `bao_can_moi` thì được nói.
- Rủi ro: đường dự phòng Gemini không có công cụ. Cần giữ hướng dẫn riêng cho nhánh đó.

**AU-05 · R1 + R6 · Test không chạy cấu hình production [đã chạy]**
- Không có `tests/conftest.py`. Mọi công tắc đều trả "tắt" khi env rỗng (`engine.py:379-390`: `_phieu_luot`, `_soat_gon`…), trong khi `cai-vps.sh:144-177` đặt `bat` cho cả 6 công tắc.
- Mỗi công tắc chỉ được bật trong đúng một file test riêng. Còn lại: 23 file / 51 chỗ gọi `build_chat_system`, trong khi lượt thu thập production dùng `build_phieu_luot`.
- Hệ quả: một bản sửa có thể xanh trên nhánh tắt và hỏng trên nhánh production. AU-02, AU-06 lọt chính vì thế.
- Sửa gốc: `conftest.py` đọc thẳng các dòng công tắc từ `cai-vps.sh` (một nguồn). Bài cần nhánh cũ thì tự `monkeypatch` về `tat`.
- Rủi ro: bật lên sẽ đỏ hàng loạt (bài kiểm chữ của `build_chat_system`). Cách làm ở Đợt 0.

### 1.2 VỪA

| ID | Lớp | Vị trí | Bằng chứng | Sửa gốc |
|---|---|---|---|---|
| AU-06 | R1 | `engine.py:3253`, `:3285` | Lưới SRS-292 (không rao lại 📋 cho tin đang hiển thị) chỉ có trong `_ly_do_cung`. Với `gon` thì `con = []`, nên lưới **không chạy ở production**. Khối prompt `KHOI_TIN_DANG_HIEN_NGOAI_CHAT` (`:2844`) vẫn còn. Cùng chỗ: `_viet_hoa_ca_cum` là `mem` ở lần đầu nhưng là "cứng" ở `_ly_do_cung` [đã chạy grep]. | Một bảng luật duy nhất `(tên, hàm, nhóm ly_do/mem)` dùng cho cả lần đầu lẫn lần gọi lại. |
| AU-07 | R2 | `engine.py:1246-1249` | Lưới bịa tiện ích so `(?<![a-z])cho(?![a-z])` và `moi` trên lời khách đã bỏ dấu. "cho" / "môi" / "mới" có ở hầu hết câu, nên "gần chợ", "nhà mới" gần như không bao giờ bị bắt [đã đọc]. | Đối chiếu với ô `tien_ich` / `hien_trang`, không dò lời khách. |
| AU-08 | R2 | `mua.py:135-141`, `:218-224` | `loai_tien_ich`: "môi trường yên tĩnh" → `truong_hoc`; "gần chỗ làm" → `cho` [đã chạy]. Kết quả vào `tim_nha(p_tien_ich)` và `_chua_ro_tien_ich`. | AI bóc tách trả thẳng enum 5 mã trong `buyer_lead`. |
| AU-09 | R3 | `engine.py:2890`, `:2893`, `:2907`; `prompts.py:371`, `:386`, `:829`; `dia_danh.py` ~`597`/`603`; `agent_ban.HUONG_DAN` | ≥ 7 khối tự nhận "câu hỏi DUY NHẤT / THAY câu hỏi kế" nằm ngoài chuỗi `or` ưu tiên (SRS-178), có thể cùng bật. `_nhieu_cau_hoi` bắt được nhưng phải gọi lại model [đã đọc]. | Code chọn MỘT việc hỏi rồi đưa vào "VIỆC LƯỢT NÀY" của phiếu lượt. |
| AU-10 | R3 | `engine.py:4755-4766`, `:4864-4869`, `:4875-4884`, mốc `_duyet_ban` | Duyệt bản nháp quyết ở 4 nơi: `xin_dang` có thể đặt `dong_y` đè `khong_dong_y` của AI và không kiểm mốc `_duyet_ban` [cần xác minh bằng ca chạy]. | Một hàm `_quyet_duyet()` với thứ tự rõ ràng. |
| AU-11 | R1 | `engine.py:3844`; `prompts.py:460` ↔ `engine.py:3849` | Lượt khách gửi ảnh sổ **luôn** dùng `build_chat_system` (không qua `PHIEU_LUOT`), trái luat-dang-ap ("lượt thu thập không còn đọc build_chat_system"). Trong cùng prompt: "Hãy khen ngợi điểm mạnh… trước" ↔ "KHÔNG khen sổ / pháp lý". | Lượt ảnh sổ đi qua phiếu lượt với việc riêng. |
| AU-12 | R1 | `prompts.py:861`, `dia_danh.py:581`, `engine.py:3848`, `:2926` | Khối trỏ nhãn "Thông tin cần hỏi tiếp theo" / "BỐI CẢNH ở trên", là nhãn chỉ có trong prompt cũ. Phiếu lượt dùng nhãn "VIỆC LƯỢT NÀY" [đã đọc]. | Hằng nhãn chung. |
| AU-13 | R1 | `prompts.py:499` (cũ) ↔ phiếu lượt | Phiếu lượt bỏ phần hiểu tin hệ thống trong ngoặc vuông (server gửi "[Khách gửi tin nhắn thoại… rè]", `server.py:218/686/690`), bỏ `SLANG_NOTES` [cần xác minh: SRS-309 bỏ có chủ ý hay sót]. | Xem câu hỏi Q1. |
| AU-14 | R3 | `engine.py:2990`, `:2992`, `:3003` | SRS-298 ghi "tối đa MỘT lần gọi lại". Lượt trình bản nháp có thể gọi lại tới 3 lần ở chế độ gọn (soát → cổng `trinh_nhap` → soát) [cần xác minh độ trễ thật so với trần 90 s của bridge]. | Gộp thành một vòng soát có trần chung. |
| AU-15 | R5 | `prompts.py:277`, `:318`, `:987` ↔ `:474`, `:488`, `:538`, `:711` | "Khích lệ đăng thêm hàng (≥10 căn) để **lên Top**" ↔ "đừng gạ rao thêm căn" và "không hứa lên Top". Không thấy code xếp tin theo điểm [cần xác minh]. | Q3. |
| AU-16 | R5 | `GIONG_VUI:417-419`, `prompts.py:452/460/482/487`, `KHOI_MOT_UU_TIEN:689` | "Khen ngợi điểm mạnh trước khi hỏi" ↔ "không khen gượng" / "KHÔNG mở bằng lời khen bắt buộc". Ngay trong `GIONG_VUI` dòng 417 cũng lệch dòng 418. | Một câu ở `GIONG_VUI`, xoá câu khen bắt buộc. |
| AU-17 | R5 | `prompts.py:498` ↔ `:503`; `:450-455`; `engine.py:230`; `prompts.py:823-831` | SRS-302 "không hỏi lại để xác nhận" ↔ các khối dặn hỏi xác nhận (đường / quận lệch, diện tích đất hay nhà, mặt tiền, số lệch kho dự án). | Q4. |
| AU-18 | R5 | `engine.py:766`, `:772` | Khối xưng hô cài câu chào hoàn chỉnh ("Em chào anh ạ") ở **mọi** lượt. Đây đúng là lỗi SRS-301 ghi ("lượt 3 tự chào giữa chừng"). | Bỏ ví dụ. |
| AU-19 | R5 | `prompts.py:1147-1181` | `build_fee_followup_system`: 9.772 / 13.735 ký tự nằm **sau** `RANH_GIOI_CACHE` (gồm `AD_FORMAT`, `FEE_VALUE_POINTS`), vì phần đổi mỗi lượt chen ở giữa. `khoi_can_cho_khach` (`mua.py:980-1004`) cũng thế. | Đưa phần cố định lên trước dấu. Gom phần đổi thành một khối "LƯỢT NÀY". |
| AU-20 | R4 | `prompts.py:115` ↔ `:143` | `FIELD_LABELS["thang_may"]` khai trùng khoá: nhãn bên bán bị nhãn bên mua ("có cần nhà có thang máy không") đè [đã chạy grep]. Người bán có ô này (`schema.py:343`). | Tách nhãn bán / mua. |
| AU-21 | R4 | `prompts.py:1630-1640` ↔ `:1853`, `:1866` | `EXTRACTION_SYSTEM` chép tay khối "ĐỌC DẤU HIỆU" và đã lệch: thiếu `da_coc`, dùng "XÓA" so với "KHÔNG BAO GIỜ XÓA". Vẫn dùng ở `engine.py:4141`, `:5520`. | Cắt từ `OPERATIONS_SYSTEM` như form gọn. |
| AU-22 | R4 | 11 hàm Python, 7 hàm TS | Bỏ dấu chép tay. `llm/claude.py:70` và `SuaTinModal.tsx:76` không đổi "Đ" hoa (nhánh audit chạy ra `'Đong Nai ĐUONG'`). | Gom về `dia_danh.bo_dau` và `lib/bo-dau.ts`. |
| AU-23 | R4 | `engine.py:337` ↔ SQL `la_id_thu` | Tiền tố ID thử ở hai nơi, hiện khớp (8 tiền tố), nhưng **không có test đối chiếu**. CLAUDE.md coi SQL là "chỗ DUY NHẤT". | Test so tuple Python với regex trong `schema.sql`. |
| AU-24 | R4 | `supabase_store.py:743`, `:754` | `_hoi_thoai_mua` định nghĩa **hai lần** [đã chạy grep]. Bản sau (đường cũ SRS-83, hội thoại mua riêng) đè bản SRS-149. Hiện không ai gọi. | Xoá cả hai. |
| AU-25 | R6 | `llm/mock.py:163-165` ↔ `engine._gia_tri_ghi :5400` | LLM giả lấy **toàn bộ** lời khách làm `bang_chung`, nên cổng SRS-73 không bao giờ chặn ở mọi bài dùng `MockProvider`. | Giả trích đúng cụm (`m.group(0)`). |
| AU-26 | R6 | `tests/test_viec_mua.py:77` (32 file dùng); `llm/mock.py` | Lời giả mặc định "Dạ em ghi nhận rồi ạ." Mỗi lượt test đi đường gọi lại 2 lần rồi code bỏ "Dạ". Đường bình thường hầu như không được test. | Đồ giả chung, lời mặc định hợp luật. |
| AU-27 | R6 | `tests/kich_ban/cham.py:68-77` | Bộ chấm import chính `_mo_dau_da`, `_BINH_LUAN_GIA`, `_cung_mo_dau`… của lõi, nên lõi sót gì bộ chấm sót y vậy. 40 kịch bản / 149 lượt, **chỉ phía bán**. Không chạy trong CI. Chạy qua `claude -p` (khác đường API: không `gui_khach`, không ảnh). | Bộ dò riêng hoặc giám khảo model. Thêm `mua.json`. |
| AU-28 | R6 | ví dụ `test_doc_y_khach.py:29-33`, `test_engine.py:1709` | Bài "AI đọc theo nghĩa / cách nói mới" cài sẵn quyết định của AI trong đồ giả, đổi câu khách vẫn xanh. 92 test chỉ kiểm chữ trong prompt. | Ghi rõ là bài "nối dây". Phần hiểu nghĩa đo bằng kịch bản chấm. |
| AU-29 | docs | `docs/07-srs.md:35-38`, `:130`, `:154`, `:775-795` | §1.2 tả "tàn dư CTV chưa dọn" (bảng `ctvs`, `chon_ctv`…), nhưng code / DB đã gỡ (luat-dang-ap:94 đúng). Còn tên `viewings_bao_ctv_va_email` (nay `viewings_bao_admin_va_email`), lịch `ctv-sla-tick` (nay `info-request-sla-tick`). Bảng cron liệt kê 6 lịch không còn và thiếu 4 lịch đang chạy. | Lấy lại từ `schema.sql` (`cron.schedule` :7545-7557). |
| AU-30 | docs | `docs/02-requirements.md:12`, `:231`, `:264`, `:265`; `docs/08:122,158` | FR-140 / FR-173 còn luồng CTV, chưa `[deprecated]`. BR-01 / FR-174 ghi vùng "Sài Gòn + Long An", trong khi code và CLAUDE.md có 6 tỉnh. | Sửa FR kèm docs/08 trong cùng commit (§4.4). |
| AU-31 | docs | `docs/13-so-do-nhan-va-boc-tach.md` §13.2–13.4 | Sơ đồ không có `build_phieu_luot`, `agent_ban/agent_mua.chay`, form gọn. Đây là tài liệu mà phiên sau sẽ đọc để hiểu luồng. | Vẽ nhánh theo công tắc production. |
| AU-32 | web | `app/du-an/page.tsx:12`, `:14`, `:22` | Title / mô tả / bộ lọc trang `/du-an` **thiếu Bà Rịa – Vũng Tàu** (vùng nhận tin có 6 tỉnh) [đã chạy grep]. | Dựng từ một nguồn vùng. |

### 1.3 NHẸ (gom theo lớp)

- **Code chết** [đã đọc, nhánh audit grep lại bằng tay]:
  - `supabase_store._get_or_create_conversation :732`; `phap_ly.NHOM_NHAY_CAM :233` (ý này lại được gõ tay ở `:386` và `prompts.py:2275`); `revenue.py:43-47` các hằng NMG; `server.CAU_THU_LAI_HONG :254`; `followup._GOI :34`.
  - `kho_tep.MediaRef.from_dict :94`; field `Conversation.de_xuat_luot` (chỉ ghi, không ai đọc) [cần xác minh]; import thừa `engine.py:41`, `prompts.py:8`.
  - **Chỉ test gọi** (~135 dòng): `revenue.quote_fee / nmg_eligibility` (~60 dòng, tự gõ "0.75 tháng", định dạng `1.0%` lệch `PT_CHU`); `gamification.perks_for`; `engine._looks_personal_doc` (bộ nhận diện tài liệu PII không được nối vào đâu) [cần xác minh có cố ý]; `start_new_listing`, `switch_listing`, `handle_media`; `prompts.build_greeting` / `Engine.greeting`; `_mo_dau_ghi_nhan` (bộ chấm dùng).
- **Nhánh chết theo công tắc production:**
  - `SOAT_GON=bat`: ~36 dòng (`_ly_do_cung`, gọi lại lần hai).
  - `CONG_CU_GUI_KHACH=tat`: ~30 dòng.
  - `MODEL_CHAT_THU` trùng `MODEL_CHAT`: đè model cho ID thử thành no-op.
  - `_agent_reply` (`engine.py:3429`) gần như không tới được khi `AGENT_BAN=bat` [cần xác minh].
  - Xoá các nhánh này là đảo quyết định "công tắc để đổi qua lại", xem Q1.
- **Quy ước công tắc lệch:** `CONG_CU_GUI_KHACH` đọc `!= "tat"` (`llm/claude.py:102`): env rỗng là **bật**, ngược bảng CLAUDE.md ("khác = tắt"). Production đang `tat` nên hiện đúng. Bảng CLAUDE.md §6.1 thiếu `DONG_TRICH_XUAT` (đang `bat` cho mọi khách, `cai-vps.sh:155`) và `MODEL_GEMINI`.
- **Mặc định cũ:**
  - `config.py:48`, `:50`: chat / extract mặc định `claude-haiku-4-5`. cai-vps không đặt `AIOI_EXTRACT_MODEL`, nên bóc tách production chạy `claude-haiku-4-5`, còn bộ chấm dùng `claude-haiku-5-5` [cần xác minh `.env` VPS].
  - `engine.py:1944` tên trợ lý mặc định `"Đ•ai"`, không có trong `ASSISTANT_NAMES`.
- **Prompt lặt vặt:**
  - Tiêu đề có 3 ngưỡng: 15–25 từ (`prompts.py:772`), 20–25 khi gọi lại (`engine.py:3117`), lưới > 30.
  - Phí thuê viết "3/4 tháng" ở 4 chỗ, trong khi §6.3 chốt "0.75 tháng tiền thuê".
  - `OPERATIONS_SYSTEM_BAN :1888` còn nhắc `buyer_lead`, ô mà schema bán đã bỏ.
  - `server._CAU_DAN_THUA :498` cắt chữ SAU khi lời đã vào `conv.history`, nên lịch sử khác lời đã gửi.
  - Docstring đầu `prompts.py:1-5` và comment `engine.py:711-712` mô tả luật cũ.
- **Test lặt vặt:**
  - 3 assert `aioinhadat.com` (`test_engine.py:369`, `:1741`, `test_conversational_and_deed.py:60`) kiểm lại chữ do chính `mock.py` trả, không chứng minh engine dựng link. Hiện đang test trên Vercel, ngày đổi tên miền các bài này vẫn xanh dù link sai. Nên assert theo `web.SITE_HOST`.
  - 11 chỗ `assert r.reply` trần.
  - `bun run kiem` không có `test:py` (CI thì có).
- **Docs lặt vặt:**
  - `docs/10` §10.7.0 tự nhận "đủ" nhưng ghi 157 file pytest (thực 198), thiếu `bun run cham`.
  - `.clinerules/00-du-an.md` mục 1–2 ngược CLAUDE.md §2 / §4.2.
  - luat-dang-ap.md:104 còn "gửi CTV"; thiếu lệnh `/seller`.
  - CLAUDE.md:91 danh sách `_shared/` thiếu 4 tệp.
- **Script mồ côi:** `scripts/gop-hoi-thoai-theo-zalo.sql` (chạy một lần, 23/10), `scripts/crawl_mogi_projects.py`, `scripts/dao-sau-du-an.mjs` [cần xác minh còn dùng].

---

## 2. Số liệu tham khảo

| Mục | Số | Nguồn |
|---|---|---|
| Comment nhắc mã SRS | engine 392 · prompts 135 · mua 58 | grep |
| Comment dẫn ca gốc ("bắn thử", "chat thử"…) trong engine | 85 | grep (nhánh audit) |
| Hàm dài nhất | `_handle` 516 dòng · `_lap_ke_hoach` 361 · `handle_media_batch` 235 · `_soat_hinh_thuc` 175 | `ast` |
| Prompt lượt thu thập bán (phiếu lượt) | 3.009 ký tự (cũ `build_chat_system` 10.125) | gọi hàm thật |
| Prompt sau bản nháp (`fee_followup`) | 13.735 ký tự, 9.772 sau dấu cache | gọi hàm thật |
| Form bóc tách | đầy đủ 27.984 · bán gọn 23.719 · mua gọn 13.883 | gọi hàm thật |
| Test | 198 file · 1254 hàm · 92 test chỉ kiểm chữ prompt · 14 tautology | `ast` (nhánh audit) |
| Lưới hậu kiểm lời bot | ~25 hàm trong `_soat_hinh_thuc` | đọc code |

---

## 3. Kế hoạch dọn dẹp — mỗi đợt một PR, sửa theo lớp

Mọi đợt đều theo vòng §7 CLAUDE.md:
- Có mục SRS (ca gốc · lớp lỗi · sửa · kiểm).
- `bun run test:py`, `bun run truyvet`.
- Đợt đụng hành vi bot thì chạy `bun run cham` ≥ 2 lần mỗi bên và so điểm. Điểm tụt thì không gộp.

"Bài đỏ" là bài sẽ **đỏ khi gỡ bản sửa**.

| Đợt | Lớp | Nội dung | Bài đỏ khi tắt bản sửa | Phụ thuộc |
|---|---|---|---|---|
| **0 · Nền test** | R1, R6 | `tests/conftest.py` đọc công tắc từ `cai-vps.sh`. `tests/gia.py` là một bộ đồ giả chung: lời mặc định hợp luật, trích bằng chứng đúng cụm, đi qua `chuan_theo_schema`, store giả gặp đường lạ thì `raise`. Bài cần nhánh cũ thì `monkeypatch` về `tat`. Bài kiểm chữ của `build_chat_system` cho lượt thu thập: chuyển sang `Engine.handle`, hoặc đánh dấu là bài cho đường ảnh sổ. | Bài canh `test_cau_hinh_nhu_production`: đọc `cai-vps.sh`, khẳng định `_phieu_luot(None)` / `_soat_gon(None)` là True. Bài cổng bằng chứng: AI giả ghi ô với cụm KHÔNG có trong lời khách thì ô không được ghi (AU-25). | Không đổi hành vi production. Làm trước. |
| **1 · PII SĐT** | R4 | Một `che_sdt()` Python dùng ở `_redact_personal_data`, `mua`, `prompts`, `tin_goc`. Bảng ca `bot/tests/luat/sdt.json` đối chiếu SQL `che_sdt`. | `"0903 123 456"`, `"0903.123.456"`, `"+84 903 123 456"` phải bị che; `"12.500.000.000"` không bị che. | Sửa SQL thì cần migration (áp trước khi gộp). |
| **2 · Luật rơi khi đổi đường** | R1 | Hằng `CHINH_SACH_PHI` (một nguồn từ `BUSINESS_CONTEXT`) vào phiếu lượt. Một bảng luật soát dùng chung cho lần đầu và lần gọi lại (AU-06). Hằng nhãn "VIỆC LƯỢT NÀY" (AU-12). Lượt ảnh sổ qua phiếu lượt (AU-11). Xử lý theo Q1 phần ngoặc vuông / `SLANG_NOTES` (AU-13). | `Engine.handle` với `PHIEU_LUOT=bat`, khách hỏi bớt phí → system có `CHINH_SACH_PHI`. `_tin_dang_hien_ngoai_chat` + lời có 📋 dưới `SOAT_GON=bat` → có gọi lại. Kịch bản `cham` "xin bớt phí" (cách nói mới: "chị giảm chút phí cho em được hông"). | Q2. |
| **3 · Bỏ đoán ý bằng từ khoá ở lưới bản tin và tiện ích** | R2 | Ba lưới bịa (hẻm / tiện ích / pháp lý-vai) gộp thành một hàm đối chiếu **ô tin + `vai_phi`**, không đọc chữ khách. `loai_tien_ich` thành enum AI trả. | Môi giới (vai_phi = MG) nói "chủ nhà nhờ anh bán", bản tin "Chính chủ" → bị bắt. "chưa có sổ hồng" + tin ghi "sổ hồng" → bị bắt. `moi_truong_song="môi trường yên tĩnh"` → `[]`. | Không. |
| **4 · Một quyết định một nơi** | R3 | Code chọn MỘT việc hỏi cho lượt (gộp khối mặt tiền / dự án / tách bán-thuê / tên đường vào chuỗi ưu tiên). `_quyet_duyet()` một hàm. Vai một nguồn `vai_phi`. Gỡ hai mâu thuẫn phía mua (AU-04). Trần gọi lại chung cho lượt bản nháp (AU-14). | Hai khối hỏi cùng kích → system chỉ chứa một. `duyet_ban_nhap=khong_dong_y` + `xin_dang` có trích → không thành `dong_y`. Prompt mua không còn đồng thời "hỏi có muốn em hỏi chủ" và "KHÔNG hỏi lại". | Q4, Q5. |
| **5 · Prompt gọn** | R5 | Luật giọng gom về `GIONG_VUI` (khen, "Dạ" một dòng, 30 từ, ghi nhận). Bỏ ví dụ chào trong khối xưng hô (AU-18). Đưa phần cố định của `fee_followup` / `khoi_can_cho_khach` lên trước dấu cache. `EXTRACTION_SYSTEM` cắt từ `OPERATIONS_SYSTEM`. Tách nhãn `thang_may`. Một ngưỡng tiêu đề. | Bài cấu trúc: phần sau `RANH_GIOI_CACHE` của `fee_followup` < 1.500 ký tự. Không có hai khoá trùng trong `FIELD_LABELS` (kiểm bằng `ast`). `EXTRACTION_SYSTEM` chứa nguyên đoạn cắt từ `OPERATIONS_SYSTEM`. Phần giọng đo bằng `cham --giong` ≥ 2 lần. | Q3, Q6, Q8. |
| **6 · Code chết và một nguồn** | R4 | Xoá code chết ở §1.3, `_hoi_thoai_mua` trùng, `revenue.quote_fee` (hoặc cho `muc_phi` gọi nó). Gom bỏ dấu. Test đối chiếu tiền tố ID thử Python ↔ SQL. `/du-an` lấy vùng từ một nguồn. | Không có method định nghĩa hai lần trong một class (bài `ast`). `bo_dau("Đồng Nai ĐƯỜNG")` ở mọi bản = `dong nai duong`. Tuple ID thử == regex `la_id_thu` trong `schema.sql`. Trang `/du-an` có "Bà Rịa". | Không (web: chụp bản build). |
| **7 · Docs khớp code** | docs | docs/07 §1.2, §2, bảng cron. docs/02 FR-140 / 173, BR-01 / FR-174 kèm docs/08. docs/13 vẽ công tắc. docs/10 sổ test. `.clinerules`. Bảng công tắc CLAUDE.md thêm `DONG_TRICH_XUAT`, `MODEL_GEMINI`, ngoại lệ `CONG_CU_GUI_KHACH`. luat-dang-ap bỏ "CTV". | `bun run truyvet` mở rộng: tên hàm / lịch ở docs/07 §2 phải có trong `schema.sql` hoặc `src/`. | Không. |
| **8 · Gỡ nhánh cũ của công tắc** | R1 | Gỡ đường `tat` của `PHIEU_LUOT`, `SOAT_GON`, `FORM_*_GON`, `AGENT_*` (và `build_chat_system` nếu Đợt 2 đã chuyển đường ảnh sổ). | Bài canh Đợt 0 chuyển thành: không còn đọc env của các công tắc đã gỡ. | **Chỉ khi chủ dự án chốt Q1.** |

**Thứ tự đề xuất:** 0 → 1 → 2 → 3 → 4 → 6 → 5 → 7 → 8.
- Đợt 5 (prompt) để sau 4: khi code đã quyết một việc mỗi lượt thì mới gỡ được chữ dặn trong prompt.
- Đợt 7 làm song song cũng được, vì chỉ đụng docs.

---

## 4. Câu hỏi cần chủ dự án chốt trước khi sửa

Đây chỉ là những câu đụng tiền / pháp lý / thương hiệu / dữ liệu khách thật / đảo quyết định đã chốt (CLAUDE.md §4.2). Phần kỹ thuật tôi tự quyết trong kế hoạch trên.

1. **Q1 — Công tắc là nút tạm hay vĩnh viễn?** `PHIEU_LUOT`, `SOAT_GON`, `FORM_*_GON`, `AGENT_*` đều đang `bat`. Có gỡ hẳn đường cũ (Đợt 8) không, hay giữ để quay lại? Kèm theo: phiếu lượt bỏ phần hiểu tin hệ thống `[…]` và `SLANG_NOTES` là cố ý hay sót?
2. **Q2 — Tiền:** lượt thu thập (trước bản nháp) có phải nói đủ chính sách "không bớt phí / có ký HĐ / không độc quyền / môi giới không chia hoa hồng" khi khách hỏi không?
3. **Q3 — Thương hiệu / lời hứa:** có cơ chế "lên Top" thật không? Nếu không, bỏ 3 chỗ dặn khích lệ "đăng ≥10 căn để lên Top".
4. **Q4 — Đảo quyết định:** SRS-302 ("không hỏi lại để xác nhận") có đè các câu hỏi xác nhận đã chốt không? Gồm: mặt tiền là bề ngang hay đường (SRS-96), "căn này thuộc dự án X đúng không", số lệch kho dự án (SRS-105), diện tích đất hay sàn.
5. **Q5 — Phạm vi SRS-281:** `hoi_ngoai_viec`, `xin_xem_ban_ve`, `cau_hoi_du_an`, `mo_ta_du_an`, `xong_viec_mua` vẫn đòi cụm trích nguyên văn. Đây là "việc bot tự giao" (bỏ cổng) hay "dữ liệu" (giữ cổng)?
6. **Q6 — Luật cứng của chủ dự án:** "không gọi khách là mình" đang gọi lại model mỗi khi lưới đoán sai nghĩa "mình = chúng ta". Giữ gọi lại hay hạ xuống chỉ ghi log?
7. **Q7 — Dữ liệu khách thật:** `DONG_TRICH_XUAT=bat` đang gửi tin phụ "$$$$$ Đã trích xuất" cho **mọi khách thật** (cai-vps ghi "chạy thật thì đổi tat"). Vẫn đang giai đoạn test?
8. **Q8 — Khuôn anh Luận:** luật "không câu minh hoạ hoàn chỉnh" có áp cho `AD_FORMAT` không? (Câu mở "Bà con ơi", câu mời chốt mẫu.)
9. **Q9 — Thứ tự:** chủ dự án duyệt thứ tự 0 → 1 → 2 → 3 → 4 → 6 → 5 → 7 → 8, hay muốn đẩy đợt nào lên?

Đã có trả lời: tên miền (30/10). Hiện test trên Vercel, sau chuyển `aioinhadat.com`, nên link giữ theo `web.py` / env `AIOI_SITE_URL`.

**Chỉ bắt đầu sửa code khi chủ dự án đã duyệt kế hoạch này.**
