# CLAUDE.md — Harness dự án Aioinhadat (nhadat.cc)

Tài liệu điều hướng cho mọi phiên làm việc trên repo này. Đọc file này trước khi chạm vào file khác.
Bản đầy đủ cũ (tới 28/10/2026, gồm lịch sử phần TypeScript đã gỡ) ở `.claude/lich-su-claude-md.md` — chỉ tra cứu, không nạp, không cập nhật.
**Lý do, ca gốc và cách kiểm của từng thay đổi nằm ở `docs/07-srs.md` (mục SRS-5.1…, mới nhất ở đầu).** File này chỉ giữ điều ĐANG ÁP.

## 1. Dự án là gì

**Aioinhadat** (viết "AI Ơi Nhà Đất"; tiền thân nhadat.cc) — môi giới bất động sản "chat-first" tại TP.HCM và vùng lân cận.
Luận điểm: *listing chỉ là mồi, giao dịch xảy ra trong cuộc trò chuyện, và cuộc trò chuyện không bao giờ kết thúc.*

- **Kênh chat**: Zalo cá nhân qua bridge `zca-js` trên tài khoản Zalo clone (quyết định chủ dự án, không bàn lại). Hai số: số **ký gửi** (người bán, cũng trả lời người mua nhắn nhầm) và số **tư vấn người mua** (SRS-210). Trợ lý mỗi khách một tên người thật có chấm giữa (`assistants.ASSISTANT_NAMES`, SRS-183).
- **Người bán (S)** — **CCRB** (chính chủ) và **NMG** (môi giới) — rao bằng một câu rao thường, AI bóc tách ô và viết bản tin.
- **Người mua (B)** không trả phí; bot gợi căn, hẹn xem. Chỉ xin số điện thoại MỘT lần khi khách chốt lịch xem (SRS-148).
- **Web** (Next.js) là kênh SEO + listing + bản đồ, đẩy người dùng sang Zalo. Link do `src/aioi/web.py` quyết (env `AIOI_SITE_URL`, mặc định `aioinhadat.vercel.app`; `nhadat.cc` / `aioinhadat.com` chưa trỏ về web).
- **Doanh thu 100% phía bán**: CCRB 1%, NMG 0,5% giá trị giao dịch; cho thuê 0,75 tháng tiền thuê. Một nguồn: `prompts.muc_phi`.
- **Vùng nhận tin**: TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu, Long An, Tây Ninh, Đồng Nai (không nhận Bình Phước cũ). Một nguồn: `prompts.VUNG_NHAN_TIN`.

## 2. Bộ tài liệu BA (nguồn sự thật)

Thứ tự đọc = thứ tự phụ thuộc. Tài liệu sau **không được mâu thuẫn** tài liệu trước.

| # | File | Nội dung | ID prefix |
|---|---|---|---|
| 0 | `docs/00-dinh-huong.md` | Định hướng — BRD hợp nhất Aioinhadat × nhadat.cc; bất biến, sao Bắc Đẩu, lộ trình. Đứng trên mọi tầng dưới | `DH-` |
| 0 | `docs/00-glossary.md` | Từ điển thuật ngữ (B, S, CCRB, NMG, CTV, HXH…) | — |
| 1 | `docs/01-research.md` | Nghiên cứu thị trường, người dùng, đối thủ | `INS-` |
| 2 | `docs/02-requirements.md` | Mục tiêu KD, persona, yêu cầu chức năng / phi chức năng | `BR- FR- NFR-` |
| 3 | `docs/03-user-flows.md` | Luồng người dùng end-to-end | `UF-` |
| 4 | `docs/04-information-architecture.md` | Sitemap, URL/SEO, content model, taxonomy | `IA-` |
| 5 | `docs/05-wireframes.md` | Wireframe low-fi | `WF-` |
| 6 | `docs/06-ui-design.md` | Design system, token, component, tone giọng | `UI-` |
| 7 | `docs/07-srs.md` | Đặc tả phần mềm: kiến trúc, data model, API, acceptance; nhật ký sửa SRS-5.1… | `SRS-` |
| 8 | `docs/08-traceability.md` | Ma trận truy vết BR → FR → UF → WF → SRS | — |
| 9 | `docs/09-open-issues.md` | Mâu thuẫn / quyết định còn treo | `OPEN-` |
| 10 | `docs/10-ke-hoach-kiem-thu.md` | Kế hoạch kiểm thử 4 tầng | `TS-` |
| 11 | `docs/11-quy-trinh.md` | Quy trình BA và tester, ba cổng, định nghĩa XONG. Không sinh ID mới | — |
| — | `docs/SRD-AI-Oi-Nha-Dat.docx` | **Bản XUẤT**, không phải nguồn sự thật: `bun run srd` sinh lại từ các file md (`scripts/sinh-srd-docx.mjs`); sửa md rồi sinh lại, đừng sửa tay .docx | — |

**Lưu ý:** cả bộ docs được soát lại theo lõi Python và quyết định **bỏ hẳn CTV** ngày 28/10/2026 (SRS-5.1zzzzzzz237). Chỗ nào còn lệch với code thì code + mục SRS mới nhất ở docs/07 là bản đúng — sửa docs theo, đừng sửa code theo docs.

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

## 4. Quy ước làm việc

1. **Mọi câu khẳng định trong `docs/` phải truy được về nguồn** (`[nguồn: …]`). Không có nguồn → `[giả định BA]` hoặc đưa vào `09-open-issues.md`.
2. **Không tự ý chốt điều còn mơ hồ.** Mâu thuẫn → tạo `OPEN-xx`, nêu phương án + khuyến nghị, chờ chủ dự án.
3. **ID là bất biến.** Không đánh số lại; cấp ID kế tiếp, mục cũ đánh `[deprecated]`.
4. **Sửa tài liệu tầng trên → cập nhật `08-traceability.md` cùng commit.**
5. Tài liệu **tiếng Việt**, giữ thuật ngữ kỹ thuật tiếng Anh. Tên biến / bảng / API: tiếng Anh hoặc tiếng Việt không dấu, snake_case (theo code xung quanh).
6. Sơ đồ: **Mermaid**. Wireframe: ASCII box.
7. **Sửa lỗi / cải tiến bot và web không cần cấp FR trước** (30/09/2026): ghi một mục SRS ở `docs/07` cùng commit với code + test (ca gốc, nguyên nhân, chỗ sửa, cách kiểm).
8. **Mỗi lần sửa lỗi trả lời ba câu** trong mục docs/07 đó (01/10/2026): (1) *lớp lỗi* — cơ chế nào cho lỗi lọt; (2) *chỗ khác cùng lớp* — đã soát, sửa / còn; (3) *bài kiểm đỏ khi tắt bản sửa*, kèm ít nhất một cách nói mới. Lỗi kiểu "máy đoán ý bằng từ khoá" thì KHÔNG thêm từ vào regex — đưa quyết định sang AI (đọc theo nghĩa, code kiểm cụm trích), từ khoá chỉ là lưới đỡ.
9. Thêm ghi chú vào file này chỉ khi đó là LUẬT ĐANG ÁP mà phiên sau dễ làm sai; một dòng, kèm mã SRS. Chi tiết để ở docs/07.

## 5. Ranh giới bảo mật — TUYỆT ĐỐI

Các thư mục sau (nay không còn trên máy chủ dự án, vẫn trong `.gitignore`) **không bao giờ** được đọc-rồi-chép vào `docs/`, commit, PR:
`admin logins/` (credential) · `sổ đỏ samples/` (sổ đỏ, CCCD, địa chỉ thật) · `masterDB/` (nhà + ảnh thật) · `ThemeForest/` (theme có bản quyền).

- Số điện thoại, Zalo ID, tên thật khi trích vào `docs/` phải **ẩn danh** (`0903xxxxxx`, `chị D.`).
- **Repo đang PUBLIC.** Không ghi khoá `service_role` vào file; log Actions công khai — lời khách thật không in ra log (cụm trích chỉ in với ID thử).
- **SĐT không vào sổ lỗi**: `log_loi` che qua `che_sdt()`; đường ghi sổ mới phải đi qua đó.
- Web không trỏ `raw.githubusercontent.com/...`; tài nguyên tĩnh để trong `public/`.

## 6. Mã nguồn & vận hành

### 6.1 Kiến trúc hiện tại

- **Bộ não duy nhất: lõi Python `src/aioi/`** (từ 18/10/2026; chủ dự án: "dồn 100% vào lõi Python, tránh hai con AI sửa chéo"). Logic nghiệp vụ, prompt (`prompts.py`), bóc tách, xưng hô (`xung_ho.py`), phí, phiên chat (`engine.py`), câu hỏi theo loại BĐS (`schema.py`: `CORE_FIELDS`, `CORE_THEO_LOAI`, `FACETS`), phía mua (`mua.py`), kho Supabase (`supabase_store.py`), tra địa danh (`dia_danh.py`), pháp lý (`phap_ly.py`), câu mẫu (`cau_mau.py`). Test: `tests/` (pytest), chạy `bun run test:py`.
- **VPS**: `aond-core.service` cổng 8000 tại `/opt/aond_core`; bridge gọi `http://127.0.0.1:8000/chat-reply`. Hai bridge: `nhadat-bridge` (ký gửi) và `nhadat-bridge-tu-van.service` (`SO_NHAN=tu_van`). Cài / khởi động lại: workflow `apply-migration.yml` ô `dung_lai = cai-vps` (đưa `src/aioi` lên, khởi động lại lõi — **báo trước người đang chat thử**). `zca-js` ghim `2.2.0` trong `cai-vps.sh`; nâng thì đọc CHANGELOG trước.
- **Model**: lượt chat khách thật = **Sonnet 5.5**, một dòng `MODEL_CHAT` trong `bot/bridge-zca/cai-vps.sh` ghi `AIOI_CHAT_MODEL` vào `.env` lõi (SRS-235); bóc tách vẫn Haiku. ID thử đổi model qua env `AIOI_CHAT_MODEL_THU` (mặc định `tat`; `MODEL_CHAT_LUOT` — đường gọi model chat mới phải đọc `MODEL_CHAT_LUOT.get() or self._chat_model`). Claude hỏng → Gemini rồi Groq (`llm/du_phong.py`), có trần: mỗi lần ≤ 15 s, cả vòng ≤ 40 s, bridge chỉ chờ 90 s — đừng nới.
- **Supabase** project `rqxmmqmctpklqcmbfxuj` (Tokyo, gói Free — không tự sao lưu, chủ dự án chấp nhận). Edge function còn lại: `escalation-feed` (bridge kéo việc / báo sống / QR), `geocode-listings`, `media-cleanup`; `_shared/` còn cho ba hàm đó và web (`luat-tien.ts`, `luat-lien-he.ts`, `nhan.ts`, `ds-phuong.ts`, `tien-ich.ts`).
- **Web**: Next.js 15 + TS + Tailwind 4 ở root (`app/`, `components/`, `lib/`, `public/`), Bun (`bun.lock`), Vercel. Đọc Supabase bằng publishable key qua RLS; mô tả listing luôn qua `sanitizeDescription()`.
- **Kho tệp = Supabase Storage**: ảnh căn `listing-public/<uuid tin>/` (web đọc `listing_media` + `listing_photos_v`); sổ đỏ / giấy tờ / tệp dự án `listing-private` (`kho_anh.py`). `masterdb-raw` cố ý không có policy (chỉ `service_role`) — đừng trỏ web vào. `listing-photos` đã khoá.
- **Logging lõi**: lõi không cấu hình `logging` nên `log.info` KHÔNG ra journal — log để truy lỗi trên VPS phải là `warning` (SRS-233). Đọc log: ô `doc-log-loi`.

### 6.2 Luật đang áp — lõi bot

**Ghi ô tin**
- Ô tin chỉ ghi điều KHÁCH nói: mỗi ô mới / đổi phải có `bang_chung` nằm nguyên trong lời khách (`Engine._loc_o_tin` → `_gia_tri_ghi`, SRS-73); câu bot hỏi, lời AI tả ảnh không phải bằng chứng. Thêm đường ghi ô mới thì qua cùng cổng. Ngoại lệ có chủ đích, đánh dấu `_phuong_he_thong`: ghi tạm hai phường (SRS-214 mục 8), phường tra theo số nhà / hẻm (SRS-236), phường theo dự án / ngã tư.
- Ô tin một nguồn `listings.boc_tach` (đọc CÔNG KHAI với tin đang bán); ô riêng của chủ nhà (`schema.O_NOI_BO`) ghi bảng `listing_noi_bo` (SRS-116). Khoá bắt đầu `_` là nội bộ, không ra khách.
- Vai người rao (`seller_role`) chỉ nhận khi cụm trích GỌI TÊN vai (`_vai_co_bang_chung`, SRS-213) — phí theo vai đoán là báo sai tiền.
- Mỗi cờ "đã báo / đã hỏi" nằm ở chỗ nhớ qua lượt (ô tin / SQLite), không ở `y_luot` (làm mới mỗi lượt) (SRS-214).

**Địa chỉ / phường**
- Cột `listings.ward` chỉ mang `wards.ten_day_du` hoặc null; DB chặn lần cuối (`20261009b`). Xã Tây Ninh / Đồng Nai ở bảng riêng `xa_tinh_khac`, không nhét vào `wards`.
- Tra địa danh: `dia_danh.py` — chữ trước, vector Gemini sau, máy kiểm tên gần chữ khách; vector do lịch `nhung-tick` / `nhung-dia-danh-tick` / `nhung-luat-tick` nuôi — đừng gỡ. Tìm theo nghĩa đi qua `tim_dia_danh_theo_nghia` và `tim_nha(p_vec)`, đừng dựng hàm từng bảng (SRS-180).
- Phường cũ bị chia → kể các phường mới cho khách chọn, không hỏi trống; phường cũ về đúng một phường mới → dùng tên mới (SRS-191 / 220 / 233). Đừng dùng `chon_phuong_da_goi_ten` cho tên cũ có chữ.
- Số nhà / hẻm cụ thể → tra phường TRƯỚC (`engine._phuong_tu_dia_chi`): bản đồ (`TraDiaDanh.phuong_theo_so_nha`, rpc `tra_nominatim`) chỉ nhận khi ra ĐÚNG số nhà + đúng đường và phường nằm trong kho đường / hẻm — đừng nới sang kết quả mức đường; không ra thì kho hẻm một phường; vẫn không ra mới hỏi (SRS-236).
- Phường hỏi tối đa 2 lần rồi báo admin MỘT lần mỗi căn (`_phuong_bao_admin`); khối "Kho hẻm" chỉ vào lượt hệ thống hỏi phường (SRS-228). Địa chỉ chỉ có tên đường (không "/", hẻm, ngõ) → `lo_gioi_hem = "Mặt tiền"` (SRS-157).
- Từ điển tên đường bảng `duong` nạp bằng `node scripts/nap-duong.mjs`, không ghi tay; toạ độ tin tra `duong` trước Nominatim (SRS-224).

**Hỏi & bản nháp (phía bán)**
- Sàn rao (`Property.minimal_missing`) = loại hình + vị trí + giá; tự soạn bài khi còn ≤ 1 facet chính trống (`FACET_CHINH`) (SRS-200 / 202). Đừng thêm ô "bắt buộc" vào sàn hay nâng ngưỡng khi chưa đo. Ô còn thiếu hỏi SAU khi duyệt, mỗi lượt MỘT ô; khách lờ một ô 2 lần thì để sau.
- Lượt trình bản nháp phải ra bản tin có dòng mở riêng chứa 📋 (code gắn lại nếu thiếu, `_gan_dau_ban_tin`); mọi bước nhận bản tin dựa vào dấu này (SRS-204 / 222).
- Bản tin không tự thêm điều căn chưa có: hẻm / mặt tiền (SRS-155), tiện ích / tình trạng nhà (SRS-208), pháp lý / "chính chủ" (SRS-233), số không có trong ô tin / lời khách (`_so_khong_co_trong_tin`, SRS-218) → `_soat_hinh_thuc` gọi lại model. Bình giá và khoe khan hiếm trong tin rao: chủ dự án chấp nhận — đừng chặn.
- Lời khách dặn CÁCH VIẾT bản tin → ô `yeu_cau_viet` → khối `khoi_yeu_cau_viet` ở mọi prompt soạn tin (SRS-218). Bot KHÔNG tự học qua chat; đổi hành vi chỉ qua câu chuẩn / câu mẫu / code.
- Ô tự do `uu_the` chỉ giữ cụm nằm nguyên trong lời khách (SRS-205). Lời hứa với khách chỉ nói khi hệ thống có đường làm thật (SRS-205 / 216).

**Giọng & hình thức lời bot**
- Giọng phía bán theo khuôn anh Luận (SRS-207); `prompts.GIONG_VUI` là CHỖ DUY NHẤT dặn giọng (SRS-219 / 228) — đổi giọng sửa ở đó, ĐỪNG thêm luật giọng chồng lên. Ví dụ trong prompt chỉ là lời ĐÁP, không chứa câu hỏi của một ô cụ thể (model chép, SRS-196); không câu minh hoạ hoàn chỉnh.
- Xưng hô một nguồn `xung_ho.py` (`goi_toi`): khách xưng em → anh / chị theo tên trợ lý; khách xưng cháu / con → cô / chú; khách xưng chú / cô / bác giữ đúng chữ (`chu_co_bac:<chữ>`, SRS-234). Bot không gọi khách là "mình" ("mình" nghĩa chúng ta thì được, SRS-230); không mở đầu "Dạ". Câu mẫu / câu code ghép gọi khách bằng `{goi}`.
- Câu ghi nhận ("em ghi rồi…") tối đa MỘT lần mỗi cuộc chat (SRS-229). Hai lưới lặp hình thức (`_cung_mo_dau`, `_cau_lap_luot_truoc`) không được gỡ khi đổi giọng (SRS-213). Thêm luật cứng mới thì thêm vào `_ly_do_cung`.
- Mỗi lượt MỘT khối "ƯU TIÊN LƯỢT NÀY" (cần người > pháp lý > ngoài việc > hỏi về); khối mới đặt vào chuỗi `or` đó (SRS-178). Lượt được phép không có câu hỏi — đừng thêm lưới "lời phải có câu hỏi".
- Độ dài: "ngắn vừa vừa", ý chính rồi dừng (SRS-97).

**Phí, pháp lý, số liệu**
- Mức phí % trong lời bot phải bằng `prompts.muc_phi(vai, thuê)`; vai chưa rõ thì nêu cả hai mức hoặc hỏi vai (SRS-227).
- Pháp lý chỉ trả lời từ `phap_ly.MAC_DINH` (+ bảng `kien_thuc_phap_ly` admin sửa) kèm điều luật gần nghĩa (`dieu_luat`, SRS-231); luôn nói "tham khảo" (nội dung AI soạn, chưa người chuyên môn duyệt); không cho bot search web. Thêm mục = khoá ở `MAC_DINH` + `python scripts/sinh-migration-phap-ly.py <tên>`. Thêm / thay văn bản luật: `bot/supabase/luat/danh-muc.json` + `scripts/tach-dieu-luat.py` + ô `nap-luat`, không ghi tay. "Thuế phí" phải nộp khi mua bán là câu pháp lý, không phải phí môi giới (SRS-233).
- Số tài chính tham khảo (`tai_chinh.py`) là số TƯỢNG TRƯNG chưa kiểm — chỉ nói khi khách hỏi, kèm "tham khảo" (SRS-148).
- Câu mẫu nói nguyên văn chỉ ở `cau_mau.MAC_DINH` (chủ dự án sửa ở `/admin/cau-chuan`, bảng `cau_mau` đè); thêm câu = khoá + migration `*_cau_mau_*` (SRS-106). Câu chuẩn (bảng `cau_chuan`) là ví dụ trong prompt, chèn TRƯỚC `RANH_GIOI_CACHE` (SRS-180), lọc theo luật hình thức đang áp (SRS-215).

**Phía mua**
- Một Zalo = một khách = một hội thoại (`_hoi_thoai_chung` / `_tim_hoi_thoai`); một Zalo vừa mua vừa bán là hai bản ghi `sellers` + `buyers`; vai của lượt theo `user_intent` lượt đó (SRS-149 / 153). Tạo dòng khách mới thì đọc lại khi thua cuộc đua (SRS-230).
- Gợi căn cần khu vực VÀ ngân sách (`co_tieu_chi`, SRS-214); mọi đường gợi căn đi qua `engine._can_goi_y` (bỏ căn đã chê), đừng gọi `can_phu_hop` trần (SRS-175). Mỗi lượt MỘT căn, bốn đoạn = bốn tin Zalo (SRS-160); không nói mã tin / "rổ". Đừng chỉnh trọng số `tim_nha` khi chưa có số đo (`do-tim-nha`).
- Số ảnh nói thật (`_so_anh`); ảnh đã gửi đủ thì không gửi lại, đề nghị xin chủ nhà thêm (SRS-168 / 232). Số trong lời bot phía mua phải có trong dòng căn / lời khách / khối "SỐ TÍNH THEO CĂN" (`_so_khong_co_trong_can`).
- Việc của khối `mua` nhận theo căn cứ RIÊNG từng việc (`_loc_viec_mua`), đừng nhận / bỏ cả khối theo một trích dẫn (SRS-232). Lượt không ghi gì thì không nói "đã chuyển / đã giữ lịch".
- **CTV đã bỏ hẳn** (chủ dự án 28/10/2026): mọi đường báo của phía mua (lịch xem, câu hỏi chủ nhà) đi chủ nhà hoặc admin (SRS-165 / 170 / 172 / 173). Code / DB còn tàn dư CTV (bảng `ctvs`, view `ctv_ranks`, cột `ctv_id`, nhánh `ctv` của trigger `info_requests`, khối hạng CTV ở `/admin`) — chưa dọn; đừng thêm việc mới giao CTV.
- Tra dự án phía mua: `mua.hoi_du_an` → `tra_du_an` (chữ trước, vector sau — kết quả vector chỉ để khách xác nhận) (SRS-184 / 185). Bot chỉ hỏi "có phải dự án X" khi khách nhắc dự án hoặc địa chỉ trùng số nhà + đường (SRS-232).

**Gửi chủ động & nhắc**
- Báo căn mới cho khách mua: `bao_can_moi.py`, vòng 10 phút, 8–20 giờ, ≤ 1 tin / khách / 24 giờ, xoay 4 kiểu văn phong (SRS-150 / 188). Đừng bật lại trigger cũ `bao_tin_moi_khop` / `nudge` (hai chủ).
- Nhắc `followup` / `sold` / `feedback` / `admin_reply` do LÕI gửi (`gui_nhac.py`, vòng 60 s); thêm loại nhắc = thêm vào `KIND_LOI` + `soan_tin`, đừng mở đường gửi thứ hai; đừng ghi `noi_dung_gui` khi còn pending (SRS-216).
- Tin nội bộ (🙋 ⭐ 🩺) gửi CTV / admin mở bằng `$$$$$ `; tin cho khách thật không bao giờ có (SRS-134). Ảnh gửi qua `/send` của bridge, vòng tải ảnh chỉ ở `guiAnhQuaUrl`.
- Lệnh gõ tay trên Zalo (`lenh_zalo.py`): `/quit` (xoá phiên), `/state`, `/listings`, `/whoami`, `/import`, `/project`, `/link`; chạy TRƯỚC model, không vào lịch sử (SRS-211).

**Prompt, cache, chi phí**
- `RANH_GIOI_CACHE` (`llm/base.py`): phần cố định trước dấu, dữ liệu đổi mỗi lượt sau dấu; dựng prompt mới thì đặt dấu đúng chỗ, khối cố định mới chèn trước dấu (SRS-166 / 213). Batch API không hợp (chat thời gian thực).

### 6.3 Quyết định chủ dự án — không đưa ra bàn lại, không chấm là lỗi khi review

- Supabase gói Free (không sao lưu) và bridge zca-js trên Zalo clone.
- Văn tin rao thêm ý chung ("phù hợp ở kết hợp kinh doanh") — "kệ". Lời chat suy từ dữ kiện khách nói ("hẻm 3m thì ô tô nhỏ vào được") là OK.
- Theo bản anh Luận: khách duyệt bản nháp thì hỏi "có biết phí môi giới chưa"; gửi model 30 tin gần nhất. Khẳng định thị trường / đoán ý người mua: "để đó, ổn".
- Hạng Đồng / Bạc / Vàng trong prompt: GIỮ.
- Khách chấm sao AI một lần (SRS-104); dữ liệu dự án chủ dự án nhập tay (`chac_chan:`) thắng ngay (SRS-96).
- Phí thuê viết "0.75 tháng tiền thuê"; khách duyệt tin → "Em xin phép đăng tin ạ!".

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
- Dữ liệu THỬ / THẬT tách bằng `la_id_thu(zalo)` (chỗ DUY NHẤT giữ tiền tố ID thử). `reset_nguoi_test` từ chối ID thật. Rổ mẫu `listings.source = 'seed_thu'` (SEED0001..0242, người bán `thu-seed-001`) — đường xoá dữ liệu thử mới phải loại nó (SRS-179).
- Xem rổ hàng / log chat bằng mắt người: schema `so` (`so.ro_hang`, `so.nguoi_ban`, `so.hoi_thoai`), đừng mở `messages` / `listings` trần.

### 6.5 Web

- `bun run build` có thể im lặng bỏ sót lớp Tailwind MỚI khi `.next/cache` cũ (Vercel cũng khôi phục cache): khoảng cách sai so với mã nguồn → soi CSS đã build trước, `rm -rf .next/cache && bun run build`. Đổi bố cục thì CHỤP màn hình bản build thật.
- Trang tin phải nằm trong cache: route động cần `generateStaticParams()` trả `[]` (KHÔNG hỏi DB); bảng route sau build phải là `●` / `○`, thấy `ƒ` là hỏng; route đọc `searchParams` bọc truy vấn trong `unstable_cache` (`bot/tests/giam-egress.mjs`).
- Bản đồ: MapLibre (`maplibre-gl` ghim `6.13.0`) + OpenFreeMap; nạp qua `napMapLibre()` (đừng `import("maplibre-gl")` trần — worker mất, bản đồ trống mà build vẫn xanh); gom cụm qua `lib/cum-ghim.ts` (`cumGhim`); rpc `ban_do_khung` / `tim_moc`. Không có bài kiểm tự động — chụp bản build thật (SRS-206 / 217).

## 6b. Nguồn thiết kế

`design/` và Figma đã xoá 08/09/2026 (OPEN-45 đóng). Nguồn thiết kế: `docs/06-ui-design.md` và code (`app/globals.css` là token thật). Không dựng lại Figma trừ khi chủ dự án yêu cầu.

## 7. Cổng kiểm & bắn thử

Quy trình đầy đủ: `docs/11-quy-trinh.md`. Bản rút gọn cho agent: `.claude/skills/ba-pipeline/SKILL.md`.
Phiên cloud có hook `SessionStart` (`.claude/hooks/session-start.sh`) cài sẵn phụ thuộc Python + Bun.

```bash
bun run test:py    # pytest lõi Python — chạy trước mọi commit đụng src/aioi
bun run kiem       # tsc + deno check 3 edge function + build web + test:bot + test:rohang + truyvet
bun run truyvet    # scripts/soat-truy-vet.sh: ID gãy, FR thiếu truy vết, PII trong docs, khoá service_role, raw.githubusercontent
bun run test:sec   # TS-SEC trên DB thật (cần Internet); thoát 2 = "chưa kiểm được", không phải "đạt"
```

- CI: `.github/workflows/kiem.yml` (chạy mỗi PR; dispatch tay được trên nhánh).
- **Bắn thử production** (tiền thật, ID thử, tự dọn): `apply-migration.yml` ô `dung_lai` = `ban-thu-ban` / `ban-thu-mua` / `ban-thu-srd` / `ban-thu-ai` / `ban-thu-vm` / `ban-thu-khach-ao` / `ban-thu-5-khach` / `ban-thu-kb` / `ban-thu-dc` / `ban-thu-xa` / `ban-thu-sau` / `ban-thu-nhieu-can` / `ban-thu-dap-y` / `ban-thu-luan`; đọc log lõi `doc-log-loi`; nạp dữ liệu `nap-duong` / `nap-du-an` / `nap-tin-mau` / `nap-luat`; đo tìm nhà `do-tim-nha` (đáp án `cau-hoi.json` soạn cho 30 tin cũ — chưa dùng được). Script ở `bot/tests/ban-thu-*.sh`.
- Người và máy dùng chung script trong `package.json` — đừng gõ lệnh rời.

**Skill PM mượn ngoài** (`phuryn/pm-skills`, MIT; khai ở `.claude/settings.json`, không ghim commit): chỉ làm khung trình bày, kết quả đổi sang tiếng Việt và gắn ID tay. Đã dùng: `/product-strategy` (`docs/00 §0.4`), `/north-star-metric` (`§0.5`), `/strategy-red-team` (`§0.7`), `/intended-vs-implemented`, `/test-scenarios`, `/job-stories`.

## 8. Dùng với Cline (VS Code, chạy local)

`.clinerules/` có luật dự án tự nạp + 3 workflow: `/ba-pipeline.md`, `/soat-truy-vet.md`, `/review-docs.md`. Claude Code và Cline dùng chung nguồn sự thật (`docs/`) — đổi quy ước thì cập nhật cả hai bên.

## 9. Agent vai phụ (`.claude/agents/`)

| Agent | Việc | Khi nào |
|---|---|---|
| `soat-truy-vet` | Soát ID gãy, truy vết thiếu, số đếm lệch, PII | Trước mọi commit đụng docs/ |
| `reviewer` | Review diff/PR theo checklist BA, chỉ báo finding | Khi review PR |
