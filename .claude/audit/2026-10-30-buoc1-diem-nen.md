# Bước 1 — đo hiện trạng, điểm nền bộ chấm, kế hoạch bước 2

- **Mốc:** `main` @ `a1d2dbbaaeb6193e4c737163561b43c20009c669` (30/10/2026 20:51, SRS-312), cộng phần sửa bộ chấm ở PR này (SRS-313).
- **Cách đo:**
  - Gọi thật các hàm dựng prompt.
  - Chạy thật `scripts/cham-kich-ban.py` hai lần trên 40 kịch bản, bằng quota `claude -p`.
  - Không bắn production. Không sửa prompt hay luật nào.
- **Ký hiệu:** **[đã chạy]** là đã chạy hoặc đọc lại code để xác nhận; **[cần xác minh]** là chưa chắc, không được coi là kết luận.

---

## 1. Hiện trạng: số trong đề bài so với số đo trên code

| Đề bài | Đo thật | Ghi chú |
|---|---|---|
| Form bóc tách phía bán ~23.400 chữ | **24.062 chữ** (`OPERATIONS_SYSTEM_BAN`). Lúc chạy: trung vị **24.136**, lớn nhất **28.327** | Bản đầy đủ 28.327 chữ dùng khi chưa rõ vai, hoặc khi đọc lại vì ra ý mua [đã chạy] |
| Mẫu JSON ~18.800 chữ | **19.080 chữ** (`operations_schema_ban`); bản đầy đủ 24.888 | [đã chạy] |
| Sonnet viết lời từ ~28 khối | Lời viết trung vị **4.768 chữ**, lớn nhất **16.374**. Trung vị 2 dòng `===` | Lượt thu thập đã dùng phiếu lượt từ SRS-309 (3.009 chữ). Lượt trình bản nháp (`build_listing_proposal_system`, 7.918) và sau bản nháp (`build_fee_followup_system`, 13.735) vẫn là văn xuôi dài. Đếm `===` chỉ là cận dưới số khối, vì nhiều khối ghép không có tiêu đề [đã chạy] |
| ~26 luật soát | **22 luật** ở lần soát đầu (`engine.py` `_soat_hinh_thuc`, SRS-312 vừa gỡ 4), cộng 6 luật ở lần soát bản gọi lại | 6 luật sau **không chạy** khi `SOAT_GON=bat`, tức là trên production. Trên 40 kịch bản: kích 9–10 lần mỗi lần chạy, 7 lần gọi lại trên 156 lần viết lời (≈ 4,5 %) [đã chạy] |
| Code đếm sai số từ tiêu đề | **Đã sửa** ở SRS-302 (số thập phân tính một từ) | [đã đọc] |
| "em rao lại xem" ngược định nghĩa `xin_dang` | **Sửa một phần** ở SRS-302. Form vẫn dạy **ba nghĩa** cho "rao lại": đăng lại căn ẩn (`prompts.py:1859`), `xin_dang` khi chưa có bản nháp (`:2044`), bỏ trống khi đã có bản nháp (`:2045`), và "không bao giờ là giá trị ô" (`:2052`) | Nghĩa nào đúng phụ thuộc trạng thái mà code đã biết. Đúng kiểu "code quyết" ở bước 2 [đã đọc] |
| Model kể lại luật ("sổ ghi 34,5m², chênh khá nhiều") | Không tái hiện trong 40 kịch bản: chưa kịch bản nào có số sổ lệch số khách nói | Sẽ thêm kịch bản ở bước 2A |
| 179 lần bắn production / 12 ngày | **Không xác minh được.** `apply-migration.yml` có tổng 577 lần chạy, nhưng tiêu đề không ghi ô `dung_lai` | [cần xác minh] |
| (thêm) Mã SRS / ngày tháng trong chữ gửi model | Form phía bán có **21 mã SRS**, khoảng 20 ngày tháng; form phía mua có 12 mã SRS | Trái nguyên tắc 5 của kiến trúc đích [đã chạy] |
| (thêm) 30–50 cuộc chat thật | DB chỉ có **8 hội thoại khách thật** (7 bán, 1 mua). Chỉ **3** cuộc có từ 4 tin khách trở lên | Chỉ đếm, chưa đọc nội dung. Xem Q1 [đã chạy] |

---

## 2. Sửa bộ chấm trong lượt này (SRS-313)

Bộ kịch bản và bộ chấm đã có từ SRS-304 / 309. Trước khi lấy điểm nền, tôi phải sửa ba chỗ khiến số đo không đại diện cho khách thật:

1. **Bộ chấm đo sai đường.**
   - ID chấm (`thu-cham-*`) là ID thử, nên `AGENT_BOC="thu"` bật agent bóc tách trong bộ chấm, trong khi khách thật vẫn dùng form.
   - Model bóc tách cũng lệch: bộ chấm dùng `claude-haiku-5-5`, còn VPS dùng mặc định `claude-haiku-4-5` (`config.py:50`; cai-vps không đặt `AIOI_EXTRACT_MODEL`).
   - Hệ quả: số đo ở SRS-310…312 là của đường agent bóc tách, không phải đường khách thật.
   - Sửa: `cong_tac_vps()` đọc đúng dòng `printf` của `cai-vps.sh` (một nguồn với VPS), mặc định coi "thu" là tắt. Muốn đo đường ID thử thì dùng `--nhu thu`.
2. **Đo cỡ prompt mỗi lần gọi**, tách bóc tách và viết lời, in ở cuối bảng. Số ở §1 lấy từ đây.
3. **Giám khảo thêm phép "không lộ luật cho khách"** và ghi `tests/kich_ban/diem_nen.json` (`--nen`). Lần chạy sau tự so với nền.

Kiểm: `tests/test_cham_nhu_khach.py` (sẽ đỏ nếu bộ chấm không đổi "thu" thành tắt). Pytest toàn bộ: 1288 passed.

---

## 3. Điểm nền (40 kịch bản người bán · Sonnet 5.5 viết lời · Haiku 4.5 bóc tách · như khách thật)

| Chỉ số | Lần 1 | Lần 2 |
|---|---|---|
| Phép tất định (ô, loại, bản tin đúng lượt, số bịa, 1 câu hỏi, "Dạ", "mình"…) | **407 / 408** | **405 / 408** |
| Giọng trung bình (giám khảo, 1–5) | **2,62** | **2,73** |
| Số cuộc có giọng ≥ 4/5 | 3 / 40 | 4 / 40 |
| Số cuộc bị đánh dấu lộ luật | 2 / 40 | 3 / 40 |
| Gọi model / gọi lại | 306 / 7 | 305 / 7 |
| Tiền quy đổi (quota CLI, không phải tiền thật) | $12,40 | $12,76 |
| Thời gian | ~45 phút | ~50 phút |

Lần 2 được ghi làm nền ở `tests/kich_ban/diem_nen.json`. Nền là **điểm từng phép**, không chép lời bot.

**Cách đọc:**
- **Phép tất định đã bão hoà** (≥ 99 %). Nó giữ được các lỗi cũ, nhưng không phân biệt được bản tốt hơn với bản tệ hơn. **Tín hiệu thật hiện nay là giọng**: 36/40 cuộc dưới 4/5.
- **Lý do giám khảo nêu lặp lại** (rút từ 80 lời chấm):
  1. **Cảm thán theo khuôn** "Wow / Ngon lành / Đẹp luôn / Tuyệt vời / Ồ hay quá". Đây đúng nguyên văn danh sách ví dụ trong `GIONG_VUI` (`prompts.py:418`): model chép ví dụ thành khuôn, đúng lớp lỗi SRS-248 đã ghi [đã chạy grep].
  2. **Hỏi lại điều khách đã trả lời** (giấy tờ, tình trạng nhà ở `cao_lo`, `srd_phi`, `ma_lo_7m`, `hdt_35tr`). Chưa rõ do bóc tách không ghi ô hay do phiếu lượt chọn lại ô [cần xác minh].
  3. **Bản tin sáo, giục chốt** ("chần chừ là người khác chốt", "Anh chị cô bác ơi"). Câu này không có trong prompt, model tự sinh theo `AD_FORMAT` (khuôn anh Luận).
  4. **Câu mẫu báo phí giọng tổng đài**: "Em xin phép báo phí… nhắn em hỗ trợ ạ" (`cau_mau.py:33`, câu chủ dự án đã chốt).
  5. **Gọi "anh/chị" khi khách đã xưng** [cần xác minh chỗ sinh ra].
- **Phép lộ luật có độ chính xác thấp.** Trong 5 cờ chỉ có 1 cờ thật: `phi_moi_gioi` "từ 10 căn trở lên là có cơ hội lên Top hiển thị", lấy từ `BUSINESS_CONTEXT` (`prompts.py:277`) mà chưa thấy cơ chế "Top" thật. Các cờ còn lại là câu báo phí hoặc vùng nhận tin đúng quy định. Bước 2A sẽ chỉnh tiêu chí của giám khảo.
- **Độ dao động giữa hai lần:** tất định ±2 phép, giọng ±0,1. Một thay đổi chỉ coi là tốt hơn khi vượt các mức này, trên ≥ 2 lần chạy.

**Khoảng trống còn lại của bộ kịch bản so với kiến trúc đích:**
- Câu khách lấy từ script bắn thử, chưa phải chat thật (Q1).
- Chỉ có phía bán, chưa có phía mua.
- Store là SQLite trống, nên công cụ tra rổ / dự án của agent bán luôn trả rỗng.
- Phép "1 câu hỏi" và "Dạ" dùng chung bộ dò với lõi.
- Một lần chạy mất khoảng 45 phút và cần CLI đã đăng nhập, nên **không chạy trong CI được**. "Mỗi PR so điểm" hiện là bước tay: chạy `bun run cham` rồi đính số vào PR, so với `diem_nen.json`.

---

## 4. Luật mâu thuẫn và chỗ lộ luật (file:dòng trên `a1d2dbba`)

| # | Cặp mâu thuẫn / lộ luật | Vị trí | Mức |
|---|---|---|---|
| M1 | Phía mua: "hỏi khách có muốn em hỏi chủ" ↔ "KHÔNG hỏi lại khách 'có muốn em hỏi chủ nhà không'". Cả hai vào cùng một lượt | `mua.py:984` ↔ `agent_mua.py:36` | nặng |
| M2 | "Khích lệ đăng ≥10 căn để **lên Top**" ↔ "đừng gạ rao thêm căn" và "không hứa lên Top". **Đã lộ ra khách** trong bộ chấm (`phi_moi_gioi` lượt 2, cả hai lần chạy) | `prompts.py:277`, `:318`, `:987` ↔ `:488`, `:538`, `:711` | nặng |
| M3 | "Rao lại" có ba nghĩa trong cùng form bóc tách | `prompts.py:1859` ↔ `:2044–2045` ↔ `:2052` | vừa |
| M4 | Danh sách cảm thán mẫu ↔ "không khen gượng". Ví dụ bị chép thành khuôn (lý do số 1 khiến giọng thấp) | `prompts.py:418` (cùng một dòng) | vừa |
| M5 | "Khen ngợi điểm mạnh… trước khi hỏi" ↔ "KHÔNG mở bằng lời khen bắt buộc" | `prompts.py:460`, `:487` ↔ `:689` | vừa |
| M6 | SRS-302 "không hỏi lại để xác nhận" ↔ "hỏi xác nhận nhẹ một câu" ngay trên nó, cùng khối hỏi mặt tiền | `prompts.py:498` ↔ `:503`; `:823–831` | vừa |
| M7 | Khối xưng hô cài câu chào hoàn chỉnh ở mọi lượt ↔ "không chào lại giữa chừng" (SRS-301) | `engine.py:773`, `:779` | vừa |
| M8 | Nhiều khối cùng tự nhận "câu hỏi DUY NHẤT", không có thứ tự ưu tiên chung | khối mặt tiền `prompts.py:829`, khối dự án, tách bán/thuê, tên đường `dia_danh.py`, `agent_ban.HUONG_DAN` | vừa |
| M9 | Phiếu lượt không mang chính sách phí ("không bớt / ký HĐ / không độc quyền"). Khối phí trỏ tới "BỐI CẢNH ở trên", là khối không còn trong phiếu | `prompts.py:517–553`; `engine.py:2906` | vừa |
| M10 | Nhãn treo "Thông tin cần hỏi tiếp theo" chỉ có trong prompt cũ | `prompts.py:861`, `dia_danh.py:581`, `engine.py:3819` | nhẹ |
| M11 | `FIELD_LABELS["thang_may"]` khai trùng khoá: nhãn phía mua đè nhãn phía bán | `prompts.py:115` ↔ `:143` | nhẹ |
| M12 | Lưới SRS-292 nằm ở lần soát bản gọi lại, không chạy khi `SOAT_GON=bat` | `engine.py:3256` | nhẹ (khối prompt vẫn còn) |

Các phát hiện khác (PII SĐT, lưới đoán ý bằng từ khoá, test chạy nhánh cũ) vẫn giữ như báo cáo audit `.claude/audit/2026-10-30-audit-lam-sach.md`.

---

## 5. Kế hoạch chi tiết bước 2: "code quyết, model viết" cho mọi lượt phía bán

**Hiện trạng:** code đã chia lượt phía bán thành 3 nhánh (`engine.py:2787–2820`): thu thập → phiếu lượt; trình bản nháp → `build_listing_proposal_system`; sau bản nháp → `build_fee_followup_system`. Trên đó ghép thêm các khối ưu tiên và khối hỏi. Bước 2 làm cho cả ba nhánh cùng đi qua **một phiếu**.

Mỗi PR dưới đây độc lập, đặt sau công tắc, và chạy `bun run cham` ≥ 2 lần mỗi bên.

| PR | Việc | Hành vi khách thật | Bài đỏ khi gỡ |
|---|---|---|---|
| **2A · Bộ kịch bản đủ để đo** | Thêm khoảng 10 kịch bản: số sổ lệch số khách nói (ca "34,5m² chênh"); "em rao lại xem" sau bản nháp; xin bớt phí; "có độc quyền không"; khách hỏi "lên Top"; khách đã trả lời giấy tờ rồi (bắt lỗi hỏi lại); gửi ảnh sổ; tin nhắn thoại rè. Thêm phép **"không hỏi lại ô đã có"**: code so ô trong câu hỏi với ô đã ghi. Chỉnh tiêu chí lộ luật: báo phí / vùng đúng quy định thì không tính. Ghi lại nền. | Không đổi | Mỗi kịch bản mới phải trượt trên ít nhất một ca tôi cài lỗi tay |
| **2B · `viec_luot(conv)` một nơi** | Hàm thuần trả về MỘT việc: `hoi_o(o)` · `tra_loi(phi / uy_tin / link / phap_ly / ngoai_viec)` · `trinh_nhap` · `sua_nhap` · `bao_phi` / `hoi_phi` · `xin_dang` · `cap_nhat_tin_dang_hien` · `ngoai_vung` · `can_nguoi` · `chot`. Thứ tự ưu tiên chỉ đặt ở đây, thay cho chuỗi khối "ƯU TIÊN" và ≥ 7 khối "câu hỏi duy nhất". "Rao lại" quyết theo trạng thái (M3), không do form đoán. | Không đổi (chưa dùng) | Bảng ca theo trạng thái: hai khối hỏi cùng kích thì chỉ ra một việc; "rao lại" khi đã / chưa có bản nháp / căn ẩn ra ba việc khác nhau |
| **2C · Phiếu cho mọi lượt phía bán** (công tắc `PHIEU_TOAN_BO`, `thu` trước) | Phiếu gồm `GIONG_GON` (cố định, trước dấu cache, mô tả ý, **không danh sách cảm thán, không câu mẫu**), dữ liệu căn, và việc do 2B chọn. Dữ kiện chỉ kèm khi việc cần (việc phí thì có số theo vai + `CHINH_SACH_PHI`). Phiếu "viết bản tin" chỉ giữ khung `AD_FORMAT`, không câu mẫu. Câu mẫu nói nguyên văn (`bao_phi`, `hoi_phi`, xin đăng) do **code gửi thẳng**, không nhờ model chép. Bài lint: chữ gửi model không có `SRS-`, ngày tháng, "bắn thử". | Chỉ ID thử | Lint chữ gửi model. Trung vị prompt viết lời ≤ 1.500 chữ, lớn nhất ≤ 3.000 (≈ 1/5 hiện nay) |
| **2D · Bật cho mọi khách** | Đổi một dòng ở `cai-vps.sh` khi số đo đạt tiêu chí bên dưới. | Mọi khách | Bài canh công tắc |
| **2E · Gỡ prompt cũ** | Gỡ `build_chat_system`, `build_listing_proposal_system`, `build_fee_followup_system` và các khối ghép sau khi 2D chạy ổn | — | Bài canh: không còn đường gọi |

**Tiêu chí gộp 2C → 2D** (so với `diem_nen.json`, ≥ 2 lần mỗi bên):
- tất định ≥ 403/408 (nền 405–407, trừ 2 cho dao động);
- giọng trung bình ≥ 2,8 (nền 2,62–2,73);
- lộ luật thật = 0;
- gọi lại ≤ 7;
- prompt viết lời trung vị ≤ 1.500 chữ.

Không đạt thì không bật.

**Ngoài bước 2** (để bước 3–4):
- form bóc tách → agent công cụ ghi (`agent_boc.py` đã có, `AGENT_BOC=thu`);
- chia Haiku / Sonnet (`MODEL_LUOT_DE` đã có, đang tắt);
- gỡ luật soát mà điểm không tụt.

---

## 6. Câu hỏi cần chủ dự án chốt

1. **Q1 — Chat thật (dữ liệu khách thật, repo PUBLIC).** DB chỉ có 8 hội thoại khách thật, 3 cuộc dài. Bạn muốn:
   - (a) tôi ẩn danh 3–8 cuộc này rồi đưa vào `tests/kich_ban/` trên repo public;
   - (b) giữ ngoài repo (Supabase Storage riêng / máy chủ dự án);
   - (c) bạn gửi thêm cuộc chat thật?

   Chưa có câu trả lời thì bộ kịch bản tiếp tục dùng câu từ script bắn thử.
2. **Q2 — "Lên Top" (lời hứa với khách).** Bot đang nói "từ 10 căn trở lên là có cơ hội lên Top hiển thị" (đã lộ trong bộ chấm). Có cơ chế Top thật không? Nếu không, 2C bỏ ý này khỏi phiếu.
3. **Q3 — Câu mẫu báo phí (quyết định đã chốt §6.3).** Giám khảo chê "Em xin phép báo phí… nhắn em hỗ trợ ạ" là giọng tổng đài. Giữ nguyên văn (code gửi thẳng ở 2C), hay cho viết lại câu mẫu ở `/admin/cau-chuan`?
4. **Q4 — Duyệt kế hoạch bước 2** (2A → 2E và tiêu chí gộp ở §5).

Tôi dừng ở đây theo phạm vi lượt này; chưa bắt đầu bước 2.
