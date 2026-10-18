# 03 — User Flows

13 luồng end-to-end. Mỗi luồng ghi actor, FR liên quan, sơ đồ Mermaid hoặc bước
chính, nhánh lỗi, và **một dòng trạng thái dựng** (đối chiếu code 04/09/2026 —
`docs/10 §10.8`; chi tiết chưa dựng gom ở OPEN-43).

## Bản đồ toàn cảnh

```mermaid
flowchart TD
    G[Google / quảng cáo] --> W[Website nhadat.cc]
    W -->|UF-01 search| L[Kết quả listing]
    L -->|UF-02| D[Chi tiết BĐS]
    D -->|UF-03 hộp mời kết nối| Z[Zalo OA]
    W -->|UF-09| SM["Mini-site /raoban"]
    Z -->|UF-04| NEED[Khai thác nhu cầu]
    NEED --> REC[Gợi ý 3 căn]
    REC -->|UF-05| ASK[Hỏi bổ sung thông tin]
    ASK --> SS[S Side]
    SS -->|UF-10| S[CCRB / NMG]
    S --> ASK
    REC -->|UF-06| BOOK[Đặt lịch xem nhà]
    BOOK --> CTV[CTV / NMG dẫn xem]
    CTV -->|UF-07| FB[Phản hồi sau xem]
    FB --> REC
    REC -.im lặng.-> UF8[UF-08 tái kích hoạt]
    UF8 --> REC
    ASK -.không giải quyết được.-> ADM[UF-11 escalation admin]
```

---

## UF-01 — Tìm kiếm trên web bằng ngôn ngữ tự nhiên
**Actor** khách vãng lai · **FR** FR-02, FR-08, FR-09, FR-16
🟡 một phần: `/api/search` + `lib/parse-query.ts` bóc câu tìm rồi 302 sang `/{tag}` khớp hoặc `/mua-ban?q=` / `/cho-thue?q=`; lưu tiêu chí vào phiên (fingerprint) chưa dựng.

1. Vào trang chủ hoặc trang tag từ Google, gõ vào ô chat *"tìm mua nhà phố HXH 8 tỉ ở Q8"*.
2. Hệ thống parse thành tiêu chí có cấu trúc (`giao dịch`, `loại`, `đường`, `giá`, `khu vực`).
3. Trang kết quả: *"Tìm thấy N mục theo yêu cầu"* + tiêu đề diễn giải.
4. Lưu tiêu chí vào phiên để dùng ở UF-03.

**Nhánh lỗi**: không parse được → hỏi lại một câu kèm 3 gợi ý, không trả lỗi; 0 kết
quả → nới lỏng lần lượt giá ±20% → phường → quận lân cận, nói rõ đã nới gì.
**Ra**: có ≥1 kết quả hoặc có hộp mời kết nối Zalo — không bao giờ là ngõ cụt.

---

## UF-02 — Xem chi tiết một BĐS
**Actor** khách vãng lai · **FR** FR-10, FR-11, FR-15
✅ đã dựng: `/nha-dat/[code]` (gallery, thông số, JSON-LD, cue mã tin); khối "BĐS tương tự" trên web chưa có — FR-31 chạy trong chat.

1. Click card → trang chi tiết: gallery, mô tả, bảng thông số, vị trí.
2. Cue cố định *"Khi Zalo nhớ hỏi #35148"* (FR-11).
3. Khối "BĐS tương tự" giữ người dùng 3–5 trang (FR-15).

**Ra**: sang Zalo (UF-03) hoặc xem tiếp.

---

## UF-03 — Chuyển từ web sang Zalo OA kèm ngữ cảnh
**Actor** khách vãng lai → B · **FR** FR-13, FR-14, FR-30
❌ chưa dựng: deep link mang ngữ cảnh (`?ref=`) không ai đọc (OPEN-43); hôm nay khách gõ `#mã tin` trong Zalo và bot tra theo mã.

```mermaid
sequenceDiagram
    participant U as Khách
    participant W as Website
    participant Z as Zalo OA
    participant BS as B Side
    U->>W: Tìm kiếm / xem chi tiết
    W->>W: Lưu ngữ cảnh (tiêu chí, BĐS đã xem) vào fingerprint
    U->>W: Click "Bắt đầu kết nối"
    W->>Z: Deep link kèm mã ngữ cảnh
    Z->>BS: Sự kiện follow OA + mã ngữ cảnh
    BS->>BS: Nối fingerprint ↔ Zalo ID
    BS->>U: "Anh đang tìm mua nhà phố HXH 8 tỉ ở Q8 phải không ạ?"
```

**Ra**: tin đầu tiên của bot nhắc đúng nhu cầu — điểm đo chính của phễu (BR-09).
**Nhánh lỗi**: mất ngữ cảnh → rơi về UF-04, không im lặng.

---

## UF-04 — Chat lần đầu & khai thác nhu cầu
**Actor** B · **FR** FR-20, FR-22, FR-23, FR-24, FR-25, FR-26
✅ đã dựng: `chat-reply` nhánh buyer — hồ sơ nhu cầu `buyers.preferences` (FR-130), lọc kho khi đủ khu vực + giá.

```mermaid
flowchart TD
    A[B nhắn tin đầu tiên] --> B{Có ngữ cảnh từ web?}
    B -->|Có| C[Xác nhận lại tiêu chí]
    B -->|Không| D["Chào + xin tên để xưng hô"]
    D --> E["Anh/chị tìm nhà ở đâu ạ?"]
    C --> F[Thu đủ: khu vực + giá]
    E --> F
    F --> G{Đủ tiêu chí tối thiểu?}
    G -->|Chưa| H[Hỏi thêm 1 tiêu chí mỗi lượt]
    H --> F
    G -->|Rồi| I["Gửi 3 căn hot nhất"]
    I --> J{B phản hồi?}
    J -->|Xem thêm| K[Gửi 3 căn tiếp]
    J -->|Hỏi 1 căn| UF05
    J -->|Xin ảnh| L[Gửi vài ảnh, hỏi xem thêm không]
    J -->|Im lặng| UF08
    K --> J
    L --> J
    I --> M["Hỏi: mua ở hay đầu tư?"]
    M --> N{Đầu tư/kinh doanh?}
    N -->|Kinh doanh| O["Hỏi loại hình: văn phòng/quán/showroom"]
    N -->|Để ở| P[Hỏi số PN, trường học gần]
```

**Tiêu chí tối thiểu**: khu vực (≥ cấp quận) **và** khoảng giá. Tối đa 3 listing/tin
(FR-24); hỏi gọn, không thành bảng hỏi (`06 §6.8`).

---

## UF-05 — Hỏi bổ sung thông tin từ S (vòng lặp trung tâm)
**Actor** B, hệ thống, S · **FR** FR-40…FR-47, FR-98, FR-173
✅ đã dựng: `info_requests` + kho `listing_facts`/`media` tra trước (FR-44); câu khách hỏi giao CTV (FR-173), timeout FR-110 qua cron `info-timeout-tick`.

```mermaid
sequenceDiagram
    participant B as Người mua (Zalo)
    participant BS as B Side
    participant SS as S Side
    participant S as CCRB/NMG
    B->>BS: "Cho chị xem sổ đỏ cái"
    BS->>BS: Phân loại → cần xác minh, KHÔNG tự trả lời
    BS->>B: "Chị chờ em một chút"
    BS->>SS: API {BĐS ID, Requested Info ID, nguyên văn câu hỏi}
    BS->>B: "Trong khi chờ, chị có câu hỏi gì khác không ạ?"
    SS->>S: Chuyển câu hỏi (chủ tin / CTV / chuyên viên)
    S->>SS: "Đây em" + [ảnh sổ]
    SS->>BS: API {Requested Info ID, nội dung trả lời, file đính kèm}
    BS->>BS: Cập nhật listing (FR-44)
    BS->>B: "Chào chị, em có sổ đỏ rồi nè chị"
    BS->>BS: Ghi sự kiện INFO_ADDED
```

- **Kho trước, hỏi S sau** (FR-44): có trong `media`/`listing_facts` thì trả ngay;
  câu trả lời mới lọc liên hệ (FR-105) rồi lưu kho. Nhắc S sau 24h, quá 48h đóng
  và báo thật cho B (FR-110).
- **Câu khách hỏi** (`buyer_ask`, FR-173): giao CTV đang hoạt động ít việc nhất
  (không có → admin); CTV trả lời theo mẫu `#mã tin: câu trả lời`; quá 120' nhắc
  admin, CTV tụt hạng. Câu nhỏ giọt nuôi tin vẫn đi S.
- **Hàng dự án** (INS-10, FR-115/116): câu tầng dự án trả lời từ dữ liệu chung,
  không info_request; câu tầng căn đọc `unit_status`, chỉ hỏi S khi quá hạn xác nhận (FR-116).
- **Quy tắc vàng (RSK-03)**: pháp lý, quy hoạch, "còn bán không" — không bao giờ
  khẳng định: *"Cho tới 15h ngày 17/9 thì còn. Nhưng để em hỏi lại anh nhé."*

**Nhánh lỗi**: S không trả lời trong SLA → escalate CTV → chuyên viên (FR-47), báo
B trung thực.

---

## UF-06 — Đặt lịch xem nhà
**Actor** B, CTV/NMG · **FR** FR-50…FR-57
🟡 một phần: chốt lịch + xin SĐT đúng kịch bản (`chat-reply`), trigger `viewings` → escalation CTV/admin + `xac_nhan_lich` (FR-52), nhắc trước giờ kèm bản đồ (`nudge`, FR-54/55); email `[VIEWING]` nay đi `email_admin()` → ntfy (cần `NTFY_TOKEN`); mở khoá danh tính hai bên (FR-104) chưa dựng.

1. B đề nghị xem, hoặc bot đề nghị sau ≥3 câu hỏi về một căn.
2. Bot xác nhận đúng căn, hỏi khung giờ.
3. **Xin số điện thoại** — nêu rõ chỉ dùng cho buổi xem, có đường từ chối (FR-53 ↔ OPEN-05).
4. Đọc lại lịch cho B xác nhận; sinh `VIEWING_REQUESTED` + báo admin (FR-57).
5. CTV/NMG xác nhận → bot chốt giờ + link bản đồ (FR-54); nhắc trước giờ (FR-55).
6. Sau buổi xem → UF-07.

**Mở khoá danh tính (FR-104)**: chỉ khi lịch **đã chốt** hai bên mới biết SĐT của
nhau (B nhận địa chỉ chính xác + người dẫn xem; S nhận tên + SĐT B). Trước đó bot
khai địa chỉ/thông số/fact đã lưu khi khách hỏi, chỉ SĐT/Zalo chờ tới bước này (OPEN-36).

**Nhánh lỗi**: B không cho số → vẫn nhận lịch, liên hệ qua Zalo (NFR-07); không ai
dẫn được (RSK-05) → đề xuất giờ khác, không huỷ im lặng.

---

## UF-07 — Sau khi xem nhà
**Actor** B · **FR** FR-56, FR-65
🟡 một phần: hỏi cảm nhận 4 giờ sau buổi xem (`feedback`, nudge v25) + chấm sao → `ghi_danh_gia` (FR-65); ghi lý do không ưng thành tiêu chí mới của B chưa dựng.

1. *"Chị ưng căn này không ạ?"* — không ưng → hỏi chưa phù hợp chỗ nào.
2. Câu trả lời (*"mặt tiền trên 4m thôi"*) ghi thành tiêu chí mới, áp cho mọi gợi ý sau.
3. Xin đánh giá 5 sao → chấm cho NMG (FR-102). Quay lại UF-04 với tiêu chí đã tinh chỉnh.

Đây là cơ chế học sở thích chính [nguồn: OKRs eo2024.pptx slide 5].

---

## UF-08 — Tái kích hoạt & chống mất kết nối Zalo
**Actor** hệ thống → B · **FR** FR-60…FR-64 · **Rủi ro** RSK-01
✅ đã dựng: `nudge` v25 — hỏi thăm khi im đủ 5 ngày, sáu góc xoay vòng, im ≥6 ngày buộc câu giữ kết nối, `match` tin mới khớp tiêu chí (trigger DB).

```mermaid
flowchart TD
    A[Kết thúc tương tác] --> B[Ngày +5: follow-up]
    B --> C{B trả lời?}
    C -->|Có| Z[Về UF-04]
    C -->|Không| D[Ngày +6: tin CHỐNG XOÁ]
    D --> E["Nhờ anh nhắn cho em 1 tin, nếu không Zalo sẽ xóa kết nối"]
    E --> F{B trả lời?}
    F -->|Có| Z
    F -->|Không| G[Kết nối bị Zalo xoá — ghi nhận mất khách]
    H[Có listing mới khớp tiêu chí] -->|bất cứ lúc nào| I["Em mới nhận căn này, chị xem nhé?"]
    I --> Z
```

Góc follow-up xoay vòng, không lặp cùng mẫu hai lần liên tiếp: căn cuối đã xem
(FR-61) · căn khác cùng khu/tầm giá (FR-62) · căn mới nhận (FR-64) · hỏi thẳng
*"Chị đã tìm mua được nhà chưa ạ?"*. Mọi tin chủ động kết bằng **một câu hỏi** —
mục tiêu là B *nhắn lại*, chỉ gửi trong 8h–21h VN (FR-133).

---

## UF-09 — S rao tin từ website
**Actor** CCRB / NMG · **FR** FR-90…FR-96, FR-101, FR-114
🟡 một phần: `/raoban` + `/api/listing/parse` (bóc câu rao) + upload ảnh (FR-96) + `/quan-ly`; đăng nhập là Google/magic link chứ không Zalo SSO; biến thể câu rao (FR-93) chưa dựng.

```mermaid
flowchart TD
    A["Vào nhadat-cc.vercel.app/raoban"] --> B[Đăng nhập]
    B --> C["Gõ MỘT câu rao thông thường"]
    C --> D[AI bóc tách trường]
    D --> E["Hiển thị bản đã bóc tách: Vị trí / Đường / Quy mô / Giá"]
    E --> F{S xác nhận?}
    F -->|Sửa| E
    F -->|OK| G[Upload ảnh]
    G --> H[Chọn CCRB hay NMG → xác định mức phí]
    H --> I[Đăng — sinh BĐS ID]
    I --> J["Hiển thị mã: Khi Zalo nhớ hỏi #35148"]
    I --> K[Sự kiện LISTING_CREATED]
```

**Ví dụ bóc tách** [nguồn: S's side.docx]: *"Bán nhà HXH xe tải quay đầu, gần ngã
tư Trần Bình Trọng và An Dương Vương, giá 9 tỉ có thể bớt lộc, Phường 4 Quận 5 nhà
trệt dễ xây lại"* → Vị trí: ngã tư TBT–ADV, P4 Q5 · Đường: HXH xe tải quay đầu ·
Quy mô: nhà trệt, dễ xây lại · Giá: 9 tỉ, thương lượng.

**Hàng dự án (FR-114)**: trường tuỳ chọn "Thuộc dự án" + mã căn; bỏ qua = hàng lẻ,
không thêm ma sát cho CCRB (INS-05).

---

## UF-10 — S rao tin ngay trong Zalo (F1)
**Actor** CCRB / NMG · **FR** FR-109, FR-111, FR-106, FR-144, FR-150, FR-157, FR-176, FR-177, FR-178 · *(FR-97 bản cũ deprecated)* [nguồn: artifact "Cầu Nối BĐS" v2, 08/2026; kịch bản Gemini của sếp 07/09/2026; SRD AOND §I–II]
✅ đã dựng: `chat-reply` nhánh seller (tạo tin nháp, hỏi nhỏ giọt, `ask-seller` cron), ảnh về bucket `listing-public` (FR-165), `20260907h` chấm điểm + cổng duyệt.

```mermaid
flowchart TD
    A["S nhắn câu rao"] --> B["Tạo tin cho_thong_tin, can_chu_duyet = true"]
    B --> C{Còn thiếu gì?}
    C -->|Nhóm CƠ BẢN| D["Hỏi: loại · phường · diện tích · giá<br/>(thứ tự bám câu S vừa nói)"]
    C -->|Nhóm CHUYÊN MÔN| E["Hỏi: hẻm → kết cấu → phòng ngủ → pháp lý → ảnh"]
    D --> F{Câu S nhắn có trả lời không?}
    E --> F
    F -->|Khớp| G["Ghi fact, đóng câu hỏi"]
    F -->|Lệch, nhận ra fact khác| H["Ghi fact ĐÓ, câu hỏi gốc VẪN treo"]
    F -->|Lệch, không nhận ra| I["Ghi nguyên văn vào bo_sung, câu hỏi gốc vẫn treo"]
    F -->|Ừ/ok · dặn xưng hô · hỏi ngược| J["Xử lý ý đó, KHÔNG ghi fact"]
    G --> C
    H --> C
    I --> C
    J --> C
    C -->|Hết câu + điểm ≥ 70| K["Gửi BẢN NHÁP TIN + điểm<br/>hỏi: như vậy được chưa?"]
    C -->|Hết câu, điểm < 70| L["Nói còn thiếu gì, hỏi tiếp"]
    L --> C
    K --> M{S trả lời}
    M -->|Gật| N["chu_duyet_at → tin LÊN KỆ dang_ban"]
    M -->|Sửa| O["Ghi fact mới, gửi LẠI bản nháp"]
    O --> M
    M -->|Hỏi ngược| P["Trả lời rồi hỏi lại"]
    P --> M
    N --> Q["Vòng đời theo UF-13"]
```

1. S nhắn *"Cần bán nhà MT Trần Bình Trọng giá 6 tỉ"* → tin `cho_thong_tin`, cờ
   `can_chu_duyet` bật (FR-177 c). Loại BĐS **không hỏi** — trigger suy từ chính
   câu rao (FR-150), chỉ hỏi khi không đoán được.
2. **Thứ tự hỏi** (FR-177 a): nhóm **cơ bản** trước (loại, phường, diện tích, giá);
   trong nhóm thì bám thứ S vừa nhắc — nghe "ngang 5" hỏi tiếp chiều dài, chưa
   nhảy sang giá. Xong cơ bản mới tới **chuyên môn**: hẻm rộng mấy mét, ô tô vào
   được không → mấy lầu → mấy phòng ngủ → pháp lý → xin ảnh. Hướng, quy hoạch,
   năm xây **không hỏi**, chỉ ghi khi S tự kể. Thứ tự nằm ở `required_facts`
   (`nhom` + `priority`), không ở prompt.
3. **Mỗi tin dưới 30 từ**: nhắc lại chi tiết vừa nghe kèm một câu khích lệ có nghĩa
   gắn với khách mua, rồi hỏi đúng **một** thông tin (FR-177 b, FR-178 b).
4. **Hỏi một đường, trả lời một nẻo thì VẪN GHI** (FR-177 e): nhận ra S đang nói
   fact nào thì ghi vào đúng fact đó; không nhận ra thì ghi nguyên văn vào
   `bo_sung`. Câu hỏi gốc vẫn treo, bot hỏi lại bằng lời khác. Chỉ ừ/ok, dặn xưng
   hô, hỏi ngược là không ghi (FR-176).
5. Ảnh Zalo là URL tạm → tải về, lưu kho, ghi `listing_media` (FR-111/165).
6. **Đủ thông tin → gửi bản nháp tin** (FR-177 c): tiêu đề · vị trí · thông số ·
   kết cấu · pháp lý · tiềm năng · giá · lời gọi hành động, kèm **điểm đầy đủ
   0–100** (7 tiêu chí, FR-177 d) và câu "như vậy được chưa?". Bản nháp là chữ
   **tiền định**, không do model soạn — số liệu phải đúng từng chữ với cột.
7. **S gật → tin lên kệ** (`chu_duyet_at`, rồi `dang_ban`). S sửa → ghi fact rồi
   gửi lại bản nháp. Điều kiện lên kệ của tin tạo từ chat: đủ giá + diện tích +
   phường **và** điểm ≥ 70 **và** S đã gật *[ngưỡng 70 là giả định BA — OPEN-50]*.
   Tin nhập Excel/admin (`can_chu_duyet = false`) giữ luật cũ (FR-139/144).
8. Vòng đời sau đó theo UF-13. Mã công khai: OPEN-17.

**Không đọc mã tin cho S** (FR-178 a): gọi căn bằng địa chỉ ("căn Trần Bình Trọng
của mình"); S rao nhiều căn thì phân biệt cũng bằng địa chỉ. Mã vẫn sinh, vẫn lưu,
vẫn hiện trên web và trong tin cho CTV/admin — chỉ không đọc ra trong chat.
Mỗi lần đăng là một listing riêng (FR-104). `/raoban` (UF-09) là kênh song song.

---

## UF-11 — Escalation sang admin
**Actor** hệ thống → chuyên viên · **FR** FR-76…FR-81
⛔ thay bằng: `reminders` → `escalation-feed` → bridge Zalo (+ ntfy `email_admin()` từ `20260904f`); admin xem tại `/admin` (`20260904c`). Email SMTP không dựng.

| Trigger | Loại | FR |
|---|---|---|
| B hỏi, cần S trả lời | `[QUESTION] <Zalo ID>` | FR-76 |
| B muốn nói chuyện trực tiếp | `[VOICE] <Zalo ID>` | FR-79 |
| B yêu cầu xem nhà | `[VIEWING] <Zalo ID>` | FR-78 |
| B có phản ứng tiêu cực | `[UPSET] <Zalo ID>` | FR-77 |

Body chứa field của danh sách tương ứng, kèm mô tả BĐS nếu có. Định nghĩa "phản
ứng tiêu cực": `07-srs.md §5.4`.

---

## UF-12 — Gửi danh sách riêng cho một người mua
**Actor** hệ thống → B · **FR** FR-100
🟡 một phần: trang `/ds/[token]` đã có (`20260904g`, `noindex`, robots chặn `/ds/`); bot chưa tự tạo danh sách và gửi link.

1. B Side tạo danh sách `{User ID, [BĐS ID…]}` khi cần chào nhiều hơn 3 căn (FR-24).
2. Sinh URL `nhadat-cc.vercel.app/ds/<token>`; bot gửi link kèm câu hỏi xin phép.
3. B mở → trang listing lọc sẵn, mỗi card có cue mã để hỏi lại trên Zalo.

**Riêng tư**: token không đoán được, `noindex`, không lộ thông tin B trên trang.

---

## UF-13 — Vòng đời listing & báo sold cho người đang chờ
**Actor** hệ thống, admin, S, B · **FR** FR-139, FR-108, FR-164, FR-103 · *(FR-106, FR-107 bản cũ deprecated)* [nguồn: artifact "Cầu Nối BĐS" v2, 08/2026]
✅ đã dựng: 5 trạng thái + trigger `trg_zz_listings_dang_tin`; `da_chot` → kind `sold` cho khách trong `interests` (nudge v25); tin im 30 ngày → hỏi chủ "còn bán không" (`stale-listing-tick`, FR-103). TTL xác nhận 7 ngày nay chỉ còn áp cho căn trong dự án (FR-116).

```mermaid
stateDiagram-v2
    [*] --> cho_thong_tin: S nhắn câu rao (FR-144)
    cho_thong_tin --> dang_ban: đủ giá + diện tích + phường (trg_zz_listings_dang_tin — FR-164d)
    dang_ban --> cho_thong_tin: mất một trong ba trường đó (FR-164d)
    dang_ban --> dang_quan_tam: khách hỏi / bot đưa căn ra
    dang_quan_tam --> dang_ban: 7 ngày không ai hỏi (cron)
    dang_ban --> da_chot: khách đồng ý chốt (FR-142)
    dang_quan_tam --> da_chot: khách đồng ý chốt (FR-142)
    dang_ban --> an: S báo ngừng bán / quá TTL không xác nhận
    an --> dang_ban: S xác nhận còn bán
```

1. Trạng thái gắn vào **từng BĐS**; S báo "bán rồi" ở bất kỳ đâu đều được nhận diện.
2. `last_confirmed_at` điều khiển TTL: quá hạn bot hỏi S *"Căn [mã] còn bán không?"*
   trước khi giới thiệu B mới — không hỏi lặp mỗi lần có khách.
3. Sang `da_chot`: quét `interests`, báo mọi B đang chờ kèm căn thay thế (FR-108).
4. `an` không xoá listing — chỉ ẩn khỏi matching tới khi S xác nhận lại.
5. Tin chủ động ngoài cửa sổ tương tác Zalo cần ZNS trả phí (OPEN-09).
