# CLAUDE.md — Harness dự án Aioinhadat (nhadat.cc)

Tài liệu điều hướng cho mọi phiên làm việc trên repo này. Đọc file này trước khi chạm vào file khác.
Bản đầy đủ cũ (tới 28/10/2026, gồm lịch sử phần TypeScript đã gỡ) ở `.claude/lich-su-claude-md.md` — chỉ tra cứu, không nạp, không cập nhật.
**Lý do, ca gốc và cách kiểm của từng thay đổi nằm ở `docs/07-srs.md` (10 mục SRS-5.1… mới nhất, mới nhất ở đầu; mục cũ hơn ở `docs/07-srs-luu-tru.md`).** File này chỉ giữ điều ĐANG ÁP.

## 1. Dự án là gì

**Aioinhadat** (viết "AI Ơi Nhà Đất"; tiền thân nhadat.cc) — môi giới bất động sản "chat-first" tại TP.HCM và vùng lân cận.
Luận điểm: *listing chỉ là mồi, giao dịch xảy ra trong cuộc trò chuyện, và cuộc trò chuyện không bao giờ kết thúc.*

- **Kênh chat**: Zalo cá nhân qua bridge `zca-js` trên tài khoản Zalo clone (quyết định chủ dự án, không bàn lại). Hai số chuyên việc: số **ký gửi** (người bán; câu chào chỉ hỏi gửi bán / cho thuê, SRS-251; người mua nhắn nhầm vẫn được trả lời) và số **tư vấn người mua** (SRS-210); kiến thức dự án dùng chung. Trợ lý mỗi khách một tên người thật có chấm giữa (`assistants.ASSISTANT_NAMES`, SRS-183).
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
| 7 | `docs/07-srs.md` | Đặc tả phần mềm: kiến trúc, data model, API, acceptance; 10 mục nhật ký sửa SRS-5.1… mới nhất | `SRS-` |
| 7 | `docs/07-srs-luu-tru.md` | Nhật ký sửa cũ — LƯU TRỮ, chỉ tra cứu, không thêm mục | `SRS-` |
| — | `docs/02-…`, `08-…`, `10-…-luu-tru.md` | Bản đầy đủ cũ của FR (02 §2.4), ma trận (08 §8.3), bộ test đã ngừng (10 §10.7) — LƯU TRỮ, chỉ tra cứu | — |
| 8 | `docs/08-traceability.md` | Ma trận truy vết BR → FR → UF → WF → SRS | — |
| 9 | `docs/09-open-issues.md` | Mâu thuẫn / quyết định còn treo | `OPEN-` |
| 10 | `docs/10-ke-hoach-kiem-thu.md` | Kế hoạch kiểm thử 4 tầng | `TS-` |
| 11 | `docs/11-quy-trinh.md` | Quy trình BA và tester, ba cổng, định nghĩa XONG. Không sinh ID mới | — |
| — | `docs/SRD-AI-Oi-Nha-Dat.docx` | **Bản XUẤT**, không phải nguồn sự thật: `bun run srd` sinh lại từ các file md (`scripts/sinh-srd-docx.mjs`); sửa md rồi sinh lại, đừng sửa tay .docx | — |

**Lưu ý:** cả bộ docs được soát lại theo lõi Python và quyết định **bỏ hẳn CTV** ngày 28/10/2026 (SRS-5.1zzzzzzz237). Chỗ nào còn lệch với code thì code + mục SRS mới nhất ở docs/07 là bản đúng — sửa docs theo, đừng sửa code theo docs.

## 3. Tài liệu gốc & phân định phạm vi

Tài liệu gốc 2024 không còn trong repo (OPEN-48). Nguồn sự thật: bộ `docs/`, hai file kịch bản Gemini, khuôn bot anh Luận (`luan8560/AOND`, SRS-207). Bản đồ "file gốc → chưng cất ở đâu" và cách xem lại: `.claude/luat-dang-ap.md` §3.

## 4. Quy ước làm việc

1. **Mọi câu khẳng định trong `docs/` phải truy được về nguồn** (`[nguồn: …]`). Không có nguồn → `[giả định BA]` hoặc đưa vào `09-open-issues.md`.
2. **Tự quyết việc trong tầm, chỉ hỏi việc của chủ dự án** (chủ dự án uỷ quyền 28–29/10/2026: "bạn quyết thêm đi … làm luôn", "cấu hình hết rồi sao còn hỏi lại", SRS-266). Việc kỹ thuật / UX / câu chữ / ngưỡng hỏi → soát code + docs trước, tự chọn phương án tốt nhất, làm, ghi mục SRS "Quyết định (BA, uỷ quyền)". CHỈ hỏi — một câu, rồi dừng — khi đụng: tiền / phí, pháp lý, thương hiệu, dữ liệu khách thật, hoặc đảo một quyết định đã chốt trong docs. Mâu thuẫn tài liệu không tự giải được → `OPEN-xx` kèm khuyến nghị. Scope đổi thường xuyên là bình thường: mục SRS mới nhất thắng mục cũ. Báo cáo xong KHÔNG kết bằng câu mời "bạn muốn thì tôi sửa" cho việc trong tầm — tự quyết rồi nói đã chọn gì (chủ dự án 29/10: "lại kêu t sửa vá nữa").
3. **ID là bất biến.** Không đánh số lại; cấp ID kế tiếp, mục cũ đánh `[deprecated]`.
4. **Sửa tài liệu tầng trên (đổi FR / BR / UF / WF) → cập nhật `08-traceability.md` cùng commit.** Mục SRS sửa lỗi / cải tiến không cần dòng docs/08 (SRS-297).
5. Tài liệu **tiếng Việt**, giữ thuật ngữ kỹ thuật tiếng Anh. Tên biến / bảng / API: tiếng Anh hoặc tiếng Việt không dấu, snake_case (theo code xung quanh).
6. Sơ đồ: **Mermaid**. Wireframe: ASCII box.
7. **Sửa lỗi / cải tiến bot và web không cần cấp FR trước** (30/09/2026): ghi một mục SRS ở `docs/07` cùng commit với code + test (ca gốc, nguyên nhân, chỗ sửa, cách kiểm).
8. **Mỗi lần sửa lỗi trả lời ba câu** trong mục docs/07 đó (01/10/2026): (1) *lớp lỗi* — cơ chế nào cho lỗi lọt; (2) *chỗ khác cùng lớp* — đã soát, sửa / còn; (3) *bài kiểm đỏ khi tắt bản sửa*, kèm ít nhất một cách nói mới. Lỗi kiểu "máy đoán ý bằng từ khoá" thì KHÔNG thêm từ vào regex — đưa quyết định sang AI (đọc theo nghĩa, code kiểm cụm trích), từ khoá chỉ là lưới đỡ.
9. Thêm ghi chú vào file này chỉ khi đó là LUẬT ĐANG ÁP mà phiên sau dễ làm sai; một dòng, kèm mã SRS. Chi tiết để ở docs/07.
10. **Mục SRS ngắn**: tối đa ~5 dòng (ca gốc · lớp lỗi · sửa · kiểm). `docs/07-srs.md` chỉ giữ 10 mục mới nhất — thêm mục mới thì chuyển mục cũ nhất sang `docs/07-srs-luu-tru.md`.

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
- **Model và công tắc** — một nguồn: các dòng biến trong `bot/bridge-zca/cai-vps.sh` (cai-vps ghi vào `.env` lõi). Đổi = sửa dòng đó + gộp (tự cài VPS).

  | Biến | Hiện | Ý nghĩa |
  |---|---|---|
  | `MODEL_CHAT` | `claude-sonnet-5-5` | model viết lời khách thật (bóc tách luôn Haiku) — SRS-235 / 308 |
  | `MODEL_CHAT_THU` | `claude-sonnet-5-5` | model của ID thử (`ban-thu-*`); `gemini` = gọi thẳng Gemini — SRS-239 / 243 |
  | `AGENT_MUA` / `AGENT_BAN` | `bat` / `bat` | lượt viết lời có công cụ (`agent_mua.py` chỉ đọc + `hen_xem` / `hoi_chu_nha`; `agent_ban.py` tra rổ / dự án / giá) — SRS-290 / 307 |
  | `FORM_MUA_GON` / `FORM_BAN_GON` | `bat` / `bat` | form bóc tách gọn CẮT từ form đầy đủ — sửa luật ở form đầy đủ — SRS-293 / 303 |
  | `SOAT_GON` | `bat` | luật giọng / lặp chỉ ghi log, gọi lại tối đa 1 lần — SRS-298 |
  | `CONG_CU_GUI_KHACH` | `tat` | `bat` = ép công cụ `gui_khach` — SRS-246 |

  `thu` = chỉ ID thử, `bat` = mọi khách, khác = tắt. Đường gọi model chat mới đọc `MODEL_CHAT_LUOT.get() or self._chat_model`. Claude hỏng → Gemini
  rồi Groq (`llm/du_phong.py`): mỗi lần ≤ 15 s, cả vòng ≤ 40 s, bridge chờ 90 s — đừng nới.
- **Supabase** project `rqxmmqmctpklqcmbfxuj` (Tokyo, gói Free — không tự sao lưu, chủ dự án chấp nhận). Edge function còn lại: `escalation-feed` (bridge kéo việc / báo sống / QR), `geocode-listings`, `media-cleanup`; `_shared/` còn cho ba hàm đó và web (`luat-tien.ts`, `luat-lien-he.ts`, `nhan.ts`, `ds-phuong.ts`, `tien-ich.ts`).
- **Web**: Vercel không dựng preview cho nhánh `claude/**` (`vercel.json` `git.deploymentEnabled`, SRS-247) và bỏ qua bản dựng `main` khi lần đẩy không đổi file web (`ignoreCommand`, SRS-248 — thêm thư mục web mới thì thêm vào danh sách đó). Next.js 15 + TS + Tailwind 4 ở root (`app/`, `components/`, `lib/`, `public/`), Bun (`bun.lock`), Vercel. Đọc Supabase bằng publishable key qua RLS; mô tả listing luôn qua `sanitizeDescription()`.
- **Kho tệp = Supabase Storage**: ảnh căn `listing-public/<uuid tin>/` (web đọc `listing_media` + `listing_photos_v`); sổ đỏ / giấy tờ / tệp dự án `listing-private` (`kho_anh.py`). `masterdb-raw` cố ý không có policy (chỉ `service_role`) — đừng trỏ web vào. `listing-photos` đã khoá.
- **Logging lõi**: lõi không cấu hình `logging` nên `log.info` KHÔNG ra journal — log để truy lỗi trên VPS phải là `warning` (SRS-233). Đọc log: ô `doc-log-loi`.

### 6.2 Luật đang áp — lõi bot

Chi tiết (ghi ô tin, dự án, địa chỉ, bản nháp, giọng, phí, phía mua, gửi chủ động, cache) ở `.claude/luat-dang-ap.md` §6.2 — **đọc trước khi sửa `src/aioi/`**. Năm luật hay sai nhất:
- Ô tin chỉ ghi điều KHÁCH nói (bằng chứng nằm nguyên trong lời khách, `Engine._loc_o_tin`, SRS-73); việc bot tự giao làm theo ý AI đọc, không so nguyên văn (SRS-281).
- Một nguồn: phí `revenue.py` / `prompts.muc_phi` (đừng gõ tay "1%"), giọng `prompts.GIONG_VUI`, xưng hô `xung_ho.py`, câu mẫu `cau_mau.MAC_DINH` (+ migration `*_cau_mau_*`).
- Tối đa MỘT câu hỏi mỗi lượt; mỗi lượt MỘT khối "ƯU TIÊN LƯỢT NÀY"; không mở đầu "Dạ", không gọi khách "mình".
- Đổi hành vi theo ý khách: đưa quyết định cho AI (đọc theo nghĩa), KHÔNG thêm từ khoá vào regex.
- Khối cố định trong prompt đặt TRƯỚC `RANH_GIOI_CACHE`, dữ liệu đổi mỗi lượt đặt sau.

### 6.3 Quyết định chủ dự án — không đưa ra bàn lại, không chấm là lỗi khi review

- Supabase gói Free (không sao lưu) và bridge zca-js trên Zalo clone.
- Văn tin rao thêm ý chung ("phù hợp ở kết hợp kinh doanh") — "kệ". Lời chat suy từ dữ kiện khách nói ("hẻm 3m thì ô tô nhỏ vào được") là OK.
- Theo bản anh Luận: khách duyệt bản nháp thì hỏi "có biết phí môi giới chưa"; gửi model 30 tin gần nhất. Khẳng định thị trường / đoán ý người mua: "để đó, ổn".
- Hạng Đồng / Bạc / Vàng trong prompt: GIỮ.
- Khách chấm sao AI một lần (SRS-104); dữ liệu dự án chủ dự án nhập tay (`chac_chan:`) thắng ngay (SRS-96).
- Phí thuê viết "0.75 tháng tiền thuê"; khách duyệt tin → "Em xin phép đăng tin ạ!".

### 6.4 DB, migration · 6.5 Web

Chi tiết ở `.claude/luat-dang-ap.md` §6.4 / §6.5 — **đọc trước khi đụng DB / migration / web**. Gốc: schema đổi phải qua file `bot/supabase/migrations/` + PR, áp TRƯỚC khi gộp; `schema.sql` chỉ sinh lại (ô `commit_schema = commit`), không sửa tay; view mới `revoke` trước khi `grant`.

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

- CI: `.github/workflows/kiem.yml` TỰ chạy khi mở PR / đẩy thêm commit vào nhánh có PR — không dispatch tay (SRS-297).
- Gộp vào `main` có đổi `src/aioi/` hoặc `bot/bridge-zca/` → `.github/workflows/tu-cai-vps.yml` TỰ chạy cai-vps (lõi khởi động lại ~1 phút).

**Vòng giao việc của agent** (SRS-265 / 297 — gom việc cùng chủ đề vào MỘT PR, đừng mỗi sửa nhỏ một vòng):
1. Trước khi sửa: đọc mục SRS liên quan (`grep -n "<từ khoá>" docs/07*.md`) + mục tương ứng của `.claude/luat-dang-ap.md`.
2. Sửa → `bun run test:py` (+ bài kiểm đỏ khi gỡ bản sửa) → `bun run truyvet` → commit, push → PR draft.
3. Có migration: chạy thử trên DB thật trong giao dịch huỷ, rồi áp TRƯỚC khi gộp (`apply-migration.yml` ô `migration_file`, kèm `commit_schema = commit`).
4. `bash scripts/cho-workflow.sh kiem.yml <nhánh>` → xanh thì bỏ draft, gộp squash → `bash scripts/sau-gop.sh` (tự chờ cài VPS nếu có, đồng bộ nhánh).
5. Hành vi bot đổi → chạy `bun run cham` (bộ kịch bản offline bằng quota CLI, so điểm với bản trước, SRS-304) rồi mới bắn thử production (`ban-thu-*`); báo kết quả thật, chưa chạy thì nói chưa. Chat tay: `bun run chat:cli`.
6. Docs: mỗi thay đổi MỘT mục SRS ở docs/07 (quyết định chủ dự án ghi cùng commit). docs/08 chỉ khi đổi FR / tài liệu tầng trên. Luật mới → một dòng ở `.claude/luat-dang-ap.md`; CLAUDE.md chỉ đổi khi đổi quy trình / ranh giới.
- **Bắn thử production** (ô `giu_du_lieu = giu` giữ hội thoại cho CRM, chủ dự án tự xoá — SRS-245; ID thử chạy model theo `MODEL_CHAT_THU`, hiện Sonnet 5.5 — SRS-243; chủ dự án 28/10: ưu tiên test offline, bắn production thì bắn chậm `NGHI_GIUA_LUOT`; tự dọn): `apply-migration.yml` ô `dung_lai` = `ban-thu-ban` / `ban-thu-mua` / `ban-thu-srd` / `ban-thu-ai` / `ban-thu-vm` / `ban-thu-khach-ao` / `ban-thu-5-khach` / `ban-thu-kb` / `ban-thu-dc` / `ban-thu-xa` / `ban-thu-sau` / `ban-thu-nhieu-can` / `ban-thu-dap-y` / `ban-thu-luan` / `ban-thu-kiem`; đọc log lõi `doc-log-loi`; nạp dữ liệu `nap-duong` / `nap-du-an` / `nap-tin-mau` / `nap-luat`; đo tìm nhà `do-tim-nha`. Script ở `bot/tests/ban-thu-*.sh`.
- Người và máy dùng chung script trong `package.json` — đừng gõ lệnh rời.

**Skill PM mượn ngoài** (`phuryn/pm-skills`, MIT; khai ở `.claude/settings.json`, không ghim commit): chỉ làm khung trình bày, kết quả đổi sang tiếng Việt và gắn ID tay. Đã dùng: `/product-strategy` (`docs/00 §0.4`), `/north-star-metric` (`§0.5`), `/strategy-red-team` (`§0.7`), `/intended-vs-implemented`, `/test-scenarios`, `/job-stories`.

## 8. Dùng với Cline (VS Code, chạy local)

`.clinerules/` có luật dự án tự nạp + 3 workflow: `/ba-pipeline.md`, `/soat-truy-vet.md`, `/review-docs.md`. Claude Code và Cline dùng chung nguồn sự thật (`docs/`) — đổi quy ước thì cập nhật cả hai bên.

## 9. Agent vai phụ (`.claude/agents/`)

| Agent | Việc | Khi nào |
|---|---|---|
| `soat-truy-vet` | Soát ID gãy, truy vết thiếu, số đếm lệch, PII | Trước mọi commit đụng docs/ |
| `reviewer` | Review diff/PR theo checklist BA, chỉ báo finding | Khi review PR |
