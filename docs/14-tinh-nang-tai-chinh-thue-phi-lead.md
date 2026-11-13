# 14 — Tính năng Tài chính, Thuế phí chuyển nhượng, Bộ lọc Bán nhanh & Bảo toàn Lead SĐT cho Chatbot Zalo

Phiên bản: **v1.2** · Ngày: **2026-11-06** · Trạng thái: **Đã duyệt triển khai (SRS-5.1zzzzzzz388, SRS-5.1zzzzzzz389, SRS-5.1zzzzzzz390)** · Phụ trách: **Dev & BA Agent**

---

## 1. Bối cảnh & Mục tiêu

Sau đợt khảo sát và phân tích toàn diện kho tính năng của đối thủ MOSO (`/cong-cu/`, 1.388 dự án TP.HCM, bộ sitemap và API), AOND chọn lọc những năng lực cốt lõi có giá trị thực chiến cao nhất để đưa vào **Chatbot Zalo (AI Ơi Nhà Đất)**.

### 1.1 Khác biệt cốt lõi giữa Web tĩnh (MOSO) và Chatbot đàm thoại (AOND)
* **MOSO**: Tiếp cận dạng Web/App với biểu mẫu click chuột, nhập số liệu tĩnh (`<form>`, dropdown, slider). Người dùng phải tự tìm đường dẫn `/cong-cu/...` để dùng.
* **AOND Zalo Chatbot**: Tiếp cận dạng **Conversational AI** (đàm thoại tự nhiên 1:1 trên Zalo). Khi khách hỏi bất kỳ câu hỏi nào về giá, vay vốn, thuế phí hoặc để lại số điện thoại, Bot phải **tự động tính toán tức thì, diễn giải minh bạch từng đồng** và giữ chân khách hàng (chốt lịch xem hoặc lưu SĐT).

### 1.2 Nguyên tắc thiết kế
1. **Bảo toàn 100% tài nguyên Supabase Free Tier (500 MB)**: Mọi công cụ tính thuế, phí, lãi suất vay đều được xây dựng bằng logic toán học thuần Python trong thư mục `src/aioi/`, chiếm **0 byte lưu trữ database**.
2. **Bảo tồn SSOT (Single Source of Truth)**: Không phá vỡ quan hệ khóa ngoại `listings.project_id`, bảo toàn cấu trúc dữ liệu dự án đã chuẩn hóa.
3. **Căn cứ pháp lý chính xác**: Thuế và phí được tính theo đúng biểu thuế hiện hành (Luật Thuế TNCN 109/2025/QH15, Nghị định 10/2022/NĐ-CP, Thông tư 257/2016/TT-BTC).

---

## 2. Đặc tả chi tiết các phân hệ

### 2.1 Module 1: Máy tính Thuế & Phí chuyển nhượng (`src/aioi/thue_phi.py`)

#### A. Căn cứ pháp lý
1. **Thuế thu nhập cá nhân (Bên bán chịu)**: 2% giá trị chuyển nhượng (Điều 14 Luật Thuế TNCN số 109/2025/QH15; Nghị định 253/2026/NĐ-CP). Miễn khi chuyển nhượng giữa người thân ruột thịt hoặc bán căn nhà/thửa đất duy nhất (sở hữu tối thiểu 183 ngày).
2. **Lệ phí trước bạ (Bên mua chịu)**: 0,5% giá trị nhà đất (Nghị định 10/2022/NĐ-CP, sửa đổi bởi Nghị định 175/2025/NĐ-CP).
3. **Phí công chứng hợp đồng mua bán**: Tính theo biểu phí lũy tiến từng phần quy định tại **Thông tư 257/2016/TT-BTC** (Điều 4) sửa đổi bởi Thông tư 111/2017/TT-BTC:
   - Dưới 50 triệu: 50.000 đ
   - Từ 50 triệu đến 100 triệu: 100.000 đ
   - Từ trên 100 triệu đến 1 tỷ: 0,1% giá trị
   - Từ trên 1 tỷ đến 3 tỷ: 1.000.000 đ + 0,06% phần vượt 1 tỷ
   - Từ trên 3 tỷ đến 5 tỷ: 2.200.000 đ + 0,05% phần vượt 3 tỷ
   - Từ trên 5 tỷ đến 10 tỷ: 3.200.000 đ + 0,04% phần vượt 5 tỷ
   - Từ trên 10 tỷ đến 100 tỷ: 5.200.000 đ + 0,03% phần vượt 10 tỷ
   - Trên 100 tỷ: 32.200.000 đ + 0,02% phần vượt 100 tỷ (tối đa 70.000.000 đ/trường hợp)
   - *(Hai bậc trên 10 tỷ sửa 08/11/2026 theo code — bản 06/11 ghi 0,02% và 23.200.000 đ + 0,01% là sai; một nguồn `phap_ly._BIEU_CONG_CHUNG` / `phap_ly.phi_cong_chung`.)*
4. **Lệ phí thẩm định hồ sơ & cấp đổi đăng bộ**: Tỉnh/thành quy định (ước tính 1.500.000 – 2.500.000 đ; code lấy 2.000.000 đ, `thue_phi.LE_PHI_DANG_BO_THAM_KHAO`).

#### B. Thiết kế hàm
```python
# phap_ly.py — một nguồn số (TY_LE_TNCN, TY_LE_TRUOC_BA, biểu công chứng); sửa 08/11/2026
def phi_cong_chung(gia: float) -> int:
    """Phí công chứng hợp đồng mua bán theo biểu TT 257/2016 (tham khảo)."""
    ...

# thue_phi.py
def tinh_thue_phi_chuyen_nhuong(gia_vnd: int, can_duy_nhat: bool = False) -> dict[str, int]:
    """Trả về chi tiết từng khoản thuế, phí và tổng chi phí của bên bán / bên mua."""
    ...

def dinh_dang_thue_phi_chat(gia_vnd: int, can_duy_nhat: bool = False) -> str:
    """Kết quả công cụ `tinh_thue_phi` — SỐ LIỆU để model viết lời, không phải câu gửi khách viết sẵn."""
    ...
```

---

### 2.2 Module 2: Máy tính Tài chính & Trả góp Ngân hàng (`src/aioi/tai_chinh.py`)

#### A. Căn cứ và công thức
* **Tỷ lệ vay chuẩn thị trường**: Tối đa 70% giá trị BĐS (vốn tự có tối thiểu 30%).
* **Phương thức trả**: Dư nợ giảm dần (Principal & Interest Amortization).
* **Công thức**:
  - Vốn tự có: $\text{Equity} = \text{Price} \times (1 - \text{Loan Ratio})$
  - Số tiền vay: $\text{Loan} = \text{Price} \times \text{Loan Ratio}$
  - Gốc hàng tháng: $\text{Monthly Principal} = \frac{\text{Loan}}{\text{Term in Months}}$
  - Lãi tháng đầu (cao nhất): $\text{Interest Month 1} = \text{Loan} \times \frac{\text{Annual Interest Rate}}{12}$
  - Tổng trả tháng đầu: $\text{Payment Month 1} = \text{Monthly Principal} + \text{Interest Month 1}$

#### B. Thiết kế hàm
```python
def tinh_vay_tra_gop(
    gia_vnd: int,
    ty_le_vay: float = 0.7,
    so_nam: int = 20,
    lai_suat_nam: float = 7.5
) -> dict:
    """Tính toán chi tiết khoản vay trả góp theo dư nợ giảm dần."""
    ...

def dinh_dang_vay_chat(gia_vnd: int, ty_le_vay: float = 0.7, so_nam: int = 20, lai_suat_nam: float = 7.5) -> str:
    """Kết quả công cụ `tinh_vay_tra_gop` — SỐ LIỆU để model viết lời (lãi là số tượng trưng), không phải câu gửi khách viết sẵn."""
    ...
```

---

### 2.3 Module 3: Bộ lọc Nguồn hàng Cần Bán Gấp / Ngộp / Giá tốt (`src/aioi/mua.py`)

#### A. Mục tiêu
Người mua và nhà đầu tư trên Zalo thường có nhu cầu "săn hàng ngộp", "cần bán gấp", "cắt lỗ". Hệ thống cần phát hiện ý định này để gợi ý các căn nhà có chủ gấp bán.

#### B. Cơ chế
> **Hiện trạng 13/11/2026 (đối chiếu code):** CHƯA có trong lõi — `src/aioi/mua.py` và công cụ `agent_mua.tim_can` không có tham số `ban_gap`, không lọc theo từ khoá gấp bán. Prompt chỉ dạy model hiểu "ngộp / kẹt tiền / cắt lỗ = cần bán gấp" (`prompts.py`). Phần dưới là thiết kế, chưa phải hành vi đang chạy.

1. **Nhận diện ý định (Intent detection)**:
   - Các từ khóa: `ngộp`, `bán gấp`, `cắt lỗ`, `hạ giá sâu`, `cần tiền bán gấp`, `bán nhanh`.
2. **Truy vấn Database**:
   - Thêm tham số `ban_gap: bool = False` vào hàm tìm kiếm.
   - Khi `ban_gap=True`: Lọc các tin có tiêu đề hoặc mô tả chứa từ khóa gấp bán, hoặc ưu tiên sắp xếp theo tỷ lệ giảm giá / đơn giá m² đất thấp hơn mức trung bình khu vực.

---

### 2.4 Module 4: Vá lỗi Bảo toàn Lead Số điện thoại (`src/aioi/mua.py`)

> **Đã sửa (SRS-5.1zzzzzzz388; soát lại 13/11/2026, SRS-5.1zzzzzzz464).** `mua.ghi_sdt_hen_xem` nay: có lịch chờ chưa có số → ghi `viewings.phone`
> + báo admin; không có lịch chờ → ghi `buyers.phone` + xếp tin báo admin (`_xep_tin_admin`, "Khách để lại SĐT … khi đang chat, gọi tư vấn hỗ trợ").
> Bot vẫn chỉ CHỦ ĐỘNG xin số một lần lúc chốt lịch xem (SRS-5.1zzzzzzz148). Mục A dưới là hiện trạng TRƯỚC khi sửa.

#### A. Lỗi nghiêm trọng phát hiện (lịch sử, trước SRS-5.1zzzzzzz388)
Ở dòng 694–695 file `src/aioi/mua.py` (bản cũ):
```python
def ghi_sdt_hen_xem(self, buyer_id: str, sdt: str) -> bool:
    # "Không có lịch chờ → không ghi gì: số khách gõ ngoài ngữ cảnh hẹn xem không được lưu."
```
Khi khách gửi SĐT trong câu nói thông thường (ví dụ: *"Tư vấn cho anh qua số 0909xxxxxx nhé"* hoặc *"Gọi anh số 0918xxxxxx"*), do chưa có lịch hẹn xem tạo trước đó, hàm trả về `False` và **vứt bỏ số điện thoại của khách**.

#### B. Giải pháp khắc phục
1. Tách hoặc mở rộng logic lưu SĐT:
   - Nếu có lịch hẹn chờ (`viewings`): Cập nhật vào lịch hẹn xem như cũ.
   - Nếu **không có lịch hẹn chờ**: Cập nhật trực tiếp số điện thoại vào bảng `buyers` (cột `phone`), đồng thời xếp tin báo Admin qua `reminders` (`_xep_tin_admin`; không có bảng `crm_events`):
     `"Khách để lại SĐT {sdt} khi đang nhắn tin, cần chuyên viên liên hệ tư vấn ngay"`.
2. Đảm bảo **100% số điện thoại khách để lại đều được bảo toàn** và chuyển tới Admin.

---

### 2.5 Module 5: Định giá sơ bộ tự động AVM trong Chat (`src/aioi/dinh_gia.py` & `src/aioi/agent_ban.py`)

* Khi khách gửi bán hỏi: *"Nhà tôi 4x15 hẻm xe hơi P.15 Q.8 bán được bao nhiêu?"*, *"Giá 12 tỷ anh đưa có cao quá không em?"*
* Bot gọi công cụ nguyên tử `dinh_gia_tham_khao` (AVM):
  - Tra cứu giá thị trường theo tên dự án (nếu có) hoặc theo khu vực (quận/huyện, phường, đường) và loại hình.
  - Tổng hợp đơn giá m² đất/nhà phổ biến đang rao trong cùng khu vực.
  - Phản hồi dải giá tham khảo, kèm diện tích quy đổi. *Hiện trạng code (`dinh_gia.tinh_dinh_gia_tham_khao`, sửa 08/11/2026): dải đơn giá lấy từ bảng số cứng `_BANG_GIA_BENCHMARK` theo VÙNG (quận / huyện / tỉnh) × loại hình, nhân diện tích — không tính ±10% quanh giá đang rao; dự án có sẵn "giá rao bán thị trường" thì trả dòng đó; không nhận ra vùng / loại hình thì trả "không có số".*
  - Khẳng định nguyên tắc tôn trọng quyền quyết định giá của chủ nhà, không tự ý phán xét giá đắt/rẻ.

---

### 2.6 Module 6: Chuẩn hóa AEO / AI Search (`public/llms.txt`)

* Xây dựng file `public/llms.txt` và `public/llms-full.txt` trên web repo Next.js. *(13/11/2026: repo chỉ có `public/llms.txt`; `llms-full.txt` chưa có.)*
* Cung cấp ngữ cảnh máy học cho ChatGPT Search, Claude, Gemini Search tự động trích dẫn dữ liệu 1.388 dự án của AOND và dẫn link về Zalo OA.

---

### 2.7 Module 7: Kiến trúc Function Calling chuẩn nguyên tử theo mô hình MOSO (`src/aioi/agent_mua.py` - SRS-5.1zzzzzzz389)

#### A. Đối sánh kiến trúc MOSO vs AOND
- **Mô hình cũ của AOND**: Chạy 2 vòng tuần tự cứng nhắc (Vòng 1 bóc tách ô nhu cầu/regex -> Code Python gọi DB -> Nhồi chuỗi text nghìn chữ vào Vòng 2 -> Gọi LLM lần 2 để trả lời). Kiến trúc này tốn gấp đôi độ trễ mạng và dễ gãy khi khách hỏi câu phức tạp nhiều ý.
- **Mô hình nâng cấp chuẩn Function Calling MOSO**: Cung cấp trực tiếp cho LLM bộ công cụ nguyên tử (Atomic Tools) qua JSON Schema trong `CONG_CU`:
  1. `tim_can` (tương đương `search_listings`): Tìm kiếm BĐS theo nhiều tiêu chí lọc linh hoạt.
  2. `xem_can` (tương đương `read_page`): Đọc chi tiết thông số của 1–3 căn đang hiện.
  3. `so_sanh_can` (tương đương `compare_listings`): So sánh 2–5 căn theo giá, đơn giá m² đất, diện tích, vị trí và pháp lý.
  4. `tra_du_an` & `du_an_trong_khu` (tương đương `search_projects`): Tra cứu thông tin 1.388 dự án TP.HCM.
  5. `tinh_thue_phi`: Tính chi tiết thuế TNCN 2%, trước bạ 0.5%, công chứng TT 257/2016.
  6. `tinh_vay_tra_gop`: Lập phương án vay mua nhà & lịch trả nợ dư nợ giảm dần (vốn 30%, vay 70%).
  7. `luu_so_dien_thoai` (tương đương `request_contact`): Tiếp nhận SĐT của khách để lưu hồ sơ và báo chuyên viên liên hệ ngay.
  8. `hen_xem`: Ghi lịch hẹn xem nhà trực tiếp.
  9. `hoi_chu_nha`: Gửi câu hỏi chuyên sâu cho chủ nhà/admin.
  10. `so_sanh_du_an`: So sánh 2 dự án (chủ đầu tư, phân khúc giá m², quy mô, tiện ích, pháp lý bàn giao).
  11. `tra_cuu_phong_thuy`: Tra phong thủy Bát Trạch theo năm sinh gia chủ, đánh giá hướng nhà đang xem.
  12. `tham_dinh_quy_hoach`: Thẩm định quy hoạch và lộ giới đường / hẻm theo địa chỉ.
  13. `goi_y_dam_phan`: Gợi ý khoảng giá đàm phán 3 mức theo loại hình và khu vực.
  14. `bo_loc_gia_dinh`: Bộ tiêu chuẩn chọn nhà cho gia đình đa thế hệ.
  - Bước ghi của vòng gộp (`cong_cu_ghi()`, không nằm trong `CONG_CU`): `ghi_nhu_cau`, `viec_can`, `ghi_y_khach`. (Danh sách soát theo code 13/11/2026.)
- LLM tự quyết định khi nào cần gọi tool trong vòng lặp hội thoại `converse`, hỗ trợ multi-turn reasoning và câu chat phức tạp tự nhiên.

---

### 2.8 Module 8: Bộ công cụ Ký Gửi Nhà Đất & Hỗ trợ Người Bán chuẩn MOSO (`src/aioi/agent_ban.py` & `src/aioi/dinh_gia.py` - SRS-5.1zzzzzzz390)

#### A. Đối sánh Quy trình Ký Gửi / Đăng Tin: MOSO vs AOND
| Tiêu chí | MOSO (`/dang-tin`, `post_listing`) | AOND Zalo Chatbot (`agent_ban.py`, `agent_gop.py`) |
|---|---|---|
| **Kênh tiếp nhận** | Biểu mẫu Web/App, nhập liệu tĩnh | Hội thoại Zalo cá nhân 1:1 (bridge `zca-js`, Zalo OA không dùng), tự nhiên, nhận ảnh sổ hồng & bảng tính |
| **Tốc độ ra tin** | "AI tạo tin chỉ 30 giây" | AI soạn tin tức thì chuẩn khuôn mẫu `AD_FORMAT` (4 phần đắt giá) |
| **Bảo mật người bán** | "Ẩn số nhà" trên tin công khai | Ẩn số nhà trên web công khai (FR-104) |
| **Chuẩn mực xác thực** | Tiêu chuẩn "3 THẬT" (Thông tin thật, Giá thật, Hình ảnh thật) | Cổng bằng chứng trích dẫn (ô tin chỉ ghi điều khách nói, SRS-5.1zzzzzzz73); không có chương trình "3 Thật" |
| **Chính sách phí** | 8 MP (8.000đ)/30 ngày, 5 MP xác thực | **CHỈ THU KHI THÀNH CÔNG** (1% bán, 0.75 tháng thuê) — 0 đồng trước |
| **Công cụ tương tác (Tool)** | Không có đàm thoại định giá | `dinh_gia_tham_khao` (AVM), `kiem_tra_phap_ly_so`, `tinh_phi_moi_gioi` |

#### B. Chi tiết 3 Công cụ Nguyên tử cho Người Bán
1. **`dinh_gia_tham_khao` (Automated Valuation Model - AVM)**:
   - Tra cứu khoảng đơn giá m² đất/nhà tham khảo theo khu vực (quận/huyện, phường, đường) hoặc theo dự án.
   - Tính dải giá tham khảo = dải đơn giá của bảng `_BANG_GIA_BENCHMARK` (vùng × loại hình) nhân diện tích (bản 06/11 ghi "±10% quanh mức giá phổ biến" — code không tính vậy).
   - Tôn trọng quyền định giá của chủ nhà, giải thích khách quan số liệu thị trường đang rao.
2. **`kiem_tra_phap_ly_so` (Tra cứu Pháp lý & Sổ hồng)**:
   - Giải đáp các vướng mắc pháp lý phổ biến của chủ nhà trước khi ký gửi: nhà chưa hoàn công, sổ đang thế chấp vay ngân hàng, mua bán vi bằng thừa phát lại, đồng sở hữu / thừa kế, quy hoạch lộ giới.
   - Dẫn chiếu điều luật chính xác từ Luật Đất đai 2024 và Luật Công chứng 2024 dựa trên kho chuẩn `src/aioi/phap_ly.py` (`MAC_DINH`).
3. **`tinh_phi_moi_gioi` (Minh bạch Phí Ký Gửi)**:
   - Tính toán minh bạch số tiền hoa hồng môi giới dự kiến theo giá trị BĐS — tỷ lệ một nguồn `revenue.SALE_FEE_RATE` / `RENTAL_FEE_MONTHS` theo vai người rao (chủ nhà 1%, môi giới 0.5%, 0.75 tháng tiền thuê; chủ đầu tư không báo số).
   - Chỉ nêu hai cam kết hệ thống có thật: 0 đồng trước (chỉ thu khi giao dịch thành công) và ẩn số nhà trên web (FR-104). Bản 06/11 hứa thêm "3 Thật", "lên Top", "hỗ trợ công chứng trọn gói", "che SĐT" — đã gỡ 08/11 (`src/aioi/dinh_gia.py`), hệ thống không có cam kết đó.

---


### 2.9 Module 9: Tái Cấu Trúc Toàn Diện Prompt & Quy Trình Ký Gửi Tinh Gọn (SRS-5.1zzzzzzz391)

#### A. Đối sánh Kiến trúc Trước & Sau Tái Cấu Trúc
| Tiêu chí | Hệ thống Cũ (Anh Luận / Tuần tự) | Hệ thống Mới Tinh Gọn (SRS-5.1zzzzzzz391) |
|---|---|---|
| **Dung lượng System Prompt** | ~7.100 tokens (>24.500 ký tự), phân mảnh 6 file | **~1.150 tokens (4.136 ký tự)**, tập trung, chuẩn hoá (số lúc viết 06/11; đo 13/11/2026: prompt gọn bán 2.554 token — SRS-5.1zzzzzzz471) |
| **Cơ chế xử lý** | 2 vòng tuần tự cứng (Haiku bóc form → Sonnet viết lời) | **Function Calling nguyên tử**: LLM tự động gọi tool khi cần |
| **Chi phí token / lượt** | $0.09 – $0.13 / lượt (Sonnet nuốt tới 13.1k tokens) | **~$0.015 / lượt** (giảm ~85% chi phí token vào) |
| **Ràng buộc luật & cấm đoán** | 40+ câu "CẤM..." tiêu cực rải rác | **Nguyên tắc hành động tích cực (Positive Directives)** |
| **Phân vai & Tác phong** | Hỏi máy móc theo thứ tự ô trống | **Thấu hiểu tâm lý & Chăm sóc khách hàng (Customer Insight)** |
| **Nhịp độ đặt câu hỏi** | 1 ô đơn lẻ kéo dài hoặc dồn dập | **MỘT ý mỗi lượt (`CUM_TOI_DA = 1`, SRS-5.1zzzzzzz407 — bản 391 từng nâng lên 2)** |
| **Ngưỡng ra tin nháp** | Chặn cứng đòi đủ 10 tiêu chí (hiện trạng, nội thất) | **Sàn rao (loại · vị trí · giá) + bốn nhóm `NHOM_SOAN` (vị thế · kích thước đất · quy mô xây dựng · pháp lý) trống tối đa MỘT nhóm** (SRS-5.1zzzzzzz418; "Fast-Draft ~50 điểm" của bản 391 đã gỡ 08/11) |

#### B. Chi tiết 4 Cải tiến Trọng điểm
1. **Thu gọn System Prompt <1.500 tokens**:
   - Chuyển các luật tra cứu cồng kềnh (bảng giá đất, luật sổ hồng, công thức hoa hồng, danh mục dự án & lãi vay) sang các Công cụ nguyên tử (Tools) độc lập.
   - Giữ nguyên 100% tinh hoa bản sắc chợ BĐS Sài Gòn của anh Luận (`luan8560/AOND`): Cấu trúc 4 phần `AD_FORMAT` (Tiêu đề rao chợ 15–25 từ; Mô tả 70–150 từ có nhịp cảm xúc; 4–5 gạch đầu dòng đắt giá; CTA thúc Zalo FOMO); từ điển tiếng lóng BĐS Sài Gòn (*tỏi, củ, xuyệc hẻm "/", giá net, ngộp, SHR, DTCN*); nguyên tắc trung thực tuyệt đối. *(Ghi chú 14/11/2026: tiêu đề và lời mời đã khác bản anh Luận từ SRS-5.1zzzzzzz486.)*
2. **Cắt bỏ các luật cấm tiêu cực (Negative Constraints)**:
   - Thay thế các câu cấm đoán tiêu cực gây gò bó mô hình ("CẤM...", "TUYỆT ĐỐI KHÔNG...") bằng các chỉ thị hành động tích cực: tập trung lắng nghe, trả lời trọng tâm, giải thích chân thành, đồng hành cùng khách.
3. **Phân vai Thấu hiểu & Chăm sóc khách hàng (Customer Insight & Empathy)**:
   - Thấu hiểu nỗi lo của chủ nhà (sợ bán hớ, sợ bị ép giá, nhà để trống sốt ruột, ngại thủ tục pháp lý).
   - Thấu hiểu áp lực của người mua (sợ dính quy hoạch, lo lắng pháp lý tranh chấp, gánh nặng lãi suất vay ngân hàng).
   - Tự động đổi vai mượt mà khi khách chuyển từ ký gửi sang hỏi mua căn hộ/nhà phố.
4. **Ngưỡng ra bản nháp & MỘT ý mỗi lượt (hiện hành theo `src/aioi/schema.py`)**:
   - Hiện trạng (đang ở / trống / cho thuê) không chặn bản nháp. Bot soạn bản nháp khi đủ sàn rao (loại hình + vị trí + giá, `minimal_missing`) và bốn nhóm `NHOM_SOAN` — vị thế · kích thước đất · quy mô xây dựng · pháp lý — trống tối đa MỘT nhóm (`SOAN_THIEU_TOI_DA = 1`; nhóm chỉ tính khi loại BĐS có ô mong đợi, tin cho thuê bỏ pháp lý — SRS-5.1zzzzzzz418, theo bản anh Luận). "Fast-Draft ~50 điểm / 4 trụ cột" của bản 391 đã gỡ 08/11.
   - Mỗi lượt chỉ hỏi MỘT ý (`CUM_TOI_DA = 1`, SRS-5.1zzzzzzz407, chủ dự án 11/11 "mỗi lượt chỉ hỏi 1 ý").

---

### 2.10 Module 10: Thống Nhất Đơn Model Sonnet & Khắc Phục Tách Vòng Haiku (SRS-5.1zzzzzzz392)

#### A. Đối sánh Luồng Gọi Model: Đa Model Cũ vs Đơn Model Sonnet Chuẩn MOSO
| Tiêu chí | Cơ chế Cũ (Haiku + Sonnet) | Chuẩn Đơn Model Sonnet (SRS-5.1zzzzzzz392) |
|---|---|---|
| **Model bóc tách (`AIOI_EXTRACT_MODEL`)** | `claude-haiku-5-5` | **`claude-sonnet-5-5`** |
| **Model hội thoại (`AIOI_CHAT_MODEL`)** | `claude-sonnet-5-5` | **`claude-sonnet-5-5`** |
| **Số lần gọi model / lượt** | 2 lần (Haiku quét form $
ightarrow$ Sonnet viết lời) | **1 lần duy nhất** (Sonnet vừa tự điều phối công cụ vừa viết lời) |
| **Hiện tượng debug header** | Hiện cả 2 dòng `claude-haiku` và `claude-sonnet` | **Chỉ còn 1 dòng thuần nhất `claude-sonnet-5-5`** |
| **Xử lý câu chào hỏi ("chào em")** | Rơi về form Haiku 24k ký tự vô ích | **Xử lý trực tiếp trên Sonnet với kế hoạch rỗng, không gọi Haiku** |

#### B. Chi tiết Kỹ thuật Cấu hình lõi & Mã nguồn
*(Ghi chú 12/11/2026: VPS và `cai-vps.sh` bỏ 06–08/11; model nay ghi ở `bot/cau-hinh-loi.env`, chạy thật đặt trong `C:\aond\aond_core\.env` trên máy 146. Phần dưới giữ nguyên như lúc viết.)*
1. **Đồng bộ hóa `cai-vps.sh`**:
   - Gán `MODEL_BOC="claude-sonnet-5-5"` đồng bộ tuyệt đối với `MODEL_CHAT="claude-sonnet-5-5"`.
   - File `.env` tại `/opt/aond_core/.env` khi cập nhật sẽ có `AIOI_EXTRACT_MODEL=claude-sonnet-5-5`.
2. **Khắc phục điểm rơi về Haiku trong `agent_gop.py`**:
   - Khi `_vong_ghi` không có công cụ nào được gọi (do khách chỉ chào hỏi hoặc hỏi câu chung chung), hệ thống không coi là lỗi để rơi về form Haiku, mà hoàn thành lượt ghi êm ái để Sonnet bước 2 sinh câu trả lời tự nhiên.

---

## 3. Kế hoạch Kiểm thử & Truy vết

1. **Unit Test Python (`tests/`)** — *bộ pytest `tests/` đã gỡ 13/11/2026 (SRS-5.1zzzzzzz469); năm file dưới không còn trong repo, giữ làm lịch sử. Kiểm nay = parse cú pháp + thử thật trên máy 146*:
   - `test_thue_phi_tai_chinh.py`: Kiểm tra tính phí công chứng tại các mốc 40 triệu đến 600 tỷ; kiểm tra tính thuế TNCN 2% và lệ phí trước bạ 0.5%; kiểm tra công thức trả góp ngân hàng dư nợ giảm dần.
   - `test_sdt_hen_xem_tai_chinh.py`: Kiểm tra trường hợp khách gửi SĐT khi **chưa có lịch hẹn xem**, xác nhận SĐT vẫn được lưu vào `buyers` và có thông báo gửi Admin.
   - `test_agent_mua_tools_389.py`: Kiểm tra toàn bộ 4 công cụ nguyên tử Function Calling (`so_sanh_can`, `tinh_thue_phi`, `tinh_vay_tra_gop`, `luu_so_dien_thoai`) thực thi trực tiếp qua `chay_cong_cu`.
   - `test_toi_uu_ky_gui_391.py`: Kiểm tra bản nháp không bị chặn bởi hiện trạng, `CUM_TOI_DA = 1` (SRS-5.1zzzzzzz407), `LEAN_SYSTEM_PROMPT` < 1.500 tokens, tích hợp Customer Insight và Function Calling (Fast-Draft đã gỡ 08/11).
   - `test_agent_ban_tools_390.py`: Kiểm tra toàn bộ 3 công cụ nguyên tử Ký Gửi phía Người Bán (`dinh_gia_tham_khao`, `kiem_tra_phap_ly_so`, `tinh_phi_moi_gioi`).
2. **Soát truy vết**: Chạy `scripts/soat-truy-vet.sh` đảm bảo không gãy liên kết ID nào.
