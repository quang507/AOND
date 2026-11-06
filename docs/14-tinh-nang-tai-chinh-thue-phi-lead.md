# 14 — Tính năng Tài chính, Thuế phí chuyển nhượng, Bộ lọc Bán nhanh & Bảo toàn Lead SĐT cho Chatbot Zalo

Phiên bản: **v1.0** · Ngày: **2026-11-06** · Trạng thái: **Đã duyệt triển khai (SRS-5.1zzzzzzz388)** · Phụ trách: **Dev & BA Agent**

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
   - Từ trên 10 tỷ đến 100 tỷ: 5.200.000 đ + 0,02% phần vượt 10 tỷ
   - Trên 100 tỷ: 23.200.000 đ + 0,01% phần vượt 100 tỷ (tối đa 70.000.000 đ/trường hợp)
4. **Lệ phí thẩm định hồ sơ & cấp đổi đăng bộ**: Tỉnh/thành quy định (ước tính 1.500.000 – 2.500.000 đ).

#### B. Thiết kế hàm
```python
def tinh_phi_cong_chung(gia_vnd: int) -> int:
    """Tính phí công chứng hợp đồng mua bán theo Thông tư 257/2016/TT-BTC."""
    ...

def tinh_thue_phi_chuyen_nhuong(gia_vnd: int, can_duy_nhat: bool = False) -> dict:
    """Trả về chi tiết từng khoản thuế, phí và tổng chi phí của bên bán / bên mua."""
    ...

def dinh_dang_thue_phi_chat(gia_vnd: int, ket_qua: dict) -> str:
    """Định dạng bong bóng chat Zalo trực quan, rõ ràng."""
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

def dinh_dang_vay_chat(gia_vnd: int, ket_qua: dict) -> str:
    """Trả về định dạng tin nhắn tư vấn gói vay mua nhà rõ ràng cho khách Zalo."""
    ...
```

---

### 2.3 Module 3: Bộ lọc Nguồn hàng Cần Bán Gấp / Ngộp / Giá tốt (`src/aioi/mua.py`)

#### A. Mục tiêu
Người mua và nhà đầu tư trên Zalo thường có nhu cầu "săn hàng ngộp", "cần bán gấp", "cắt lỗ". Hệ thống cần phát hiện ý định này để gợi ý các căn nhà có chủ gấp bán.

#### B. Cơ chế
1. **Nhận diện ý định (Intent detection)**:
   - Các từ khóa: `ngộp`, `bán gấp`, `cắt lỗ`, `hạ giá sâu`, `cần tiền bán gấp`, `bán nhanh`.
2. **Truy vấn Database**:
   - Thêm tham số `ban_gap: bool = False` vào hàm tìm kiếm.
   - Khi `ban_gap=True`: Lọc các tin có tiêu đề hoặc mô tả chứa từ khóa gấp bán, hoặc ưu tiên sắp xếp theo tỷ lệ giảm giá / đơn giá m² đất thấp hơn mức trung bình khu vực.

---

### 2.4 Module 4: Vá lỗi Bảo toàn Lead Số điện thoại (`src/aioi/mua.py`)

#### A. Lỗi nghiêm trọng phát hiện
Ở dòng 694–695 file `src/aioi/mua.py`:
```python
def ghi_sdt_hen_xem(self, buyer_id: str, sdt: str) -> bool:
    # "Không có lịch chờ → không ghi gì: số khách gõ ngoài ngữ cảnh hẹn xem không được lưu."
```
Khi khách gửi SĐT trong câu nói thông thường (ví dụ: *"Tư vấn cho anh qua số 0909xxxxxx nhé"* hoặc *"Gọi anh số 0918xxxxxx"*), do chưa có lịch hẹn xem tạo trước đó, hàm trả về `False` và **vứt bỏ số điện thoại của khách**.

#### B. Giải pháp khắc phục
1. Tách hoặc mở rộng logic lưu SĐT:
   - Nếu có lịch hẹn chờ (`viewings`): Cập nhật vào lịch hẹn xem như cũ.
   - Nếu **không có lịch hẹn chờ**: Cập nhật trực tiếp số điện thoại vào bảng `buyers` (cột `phone`), đồng thời bắn bản ghi sự kiện `crm_events` hoặc `reminders` cho Admin:
     `"Khách để lại SĐT {sdt} khi đang nhắn tin, cần chuyên viên liên hệ tư vấn ngay"`.
2. Đảm bảo **100% số điện thoại khách để lại đều được bảo toàn** và chuyển tới Admin.

---

### 2.5 Module 5: Định giá sơ bộ tự động AVM trong Chat (`src/aioi/agent_ban.py`)

* Khi khách gửi bán hỏi: *"Nhà tôi 4x15 hẻm xe hơi P.15 Q.8 bán được bao nhiêu?"*
* Bot tổng hợp dữ liệu median đơn giá m² đất của các căn cùng đường/phường trong DB.
* Phản hồi dải giá tham khảo: $\pm 10\%$ quanh giá trị median diện tích đất.

---

### 2.6 Module 6: Chuẩn hóa AEO / AI Search (`public/llms.txt`)

* Xây dựng file `public/llms.txt` và `public/llms-full.txt` trên web repo Next.js.
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
- LLM tự quyết định khi nào cần gọi tool trong vòng lặp hội thoại `converse`, hỗ trợ multi-turn reasoning và câu chat phức tạp tự nhiên.

---

## 3. Kế hoạch Kiểm thử & Truy vết

1. **Unit Test Python (`tests/`)**:
   - `test_thue_phi_tai_chinh.py`: Kiểm tra tính phí công chứng tại các mốc 40 triệu đến 600 tỷ; kiểm tra tính thuế TNCN 2% và lệ phí trước bạ 0.5%; kiểm tra công thức trả góp ngân hàng dư nợ giảm dần.
   - `test_sdt_hen_xem_tai_chinh.py`: Kiểm tra trường hợp khách gửi SĐT khi **chưa có lịch hẹn xem**, xác nhận SĐT vẫn được lưu vào `buyers` và có thông báo gửi Admin.
   - `test_agent_mua_tools_389.py`: Kiểm tra toàn bộ 4 công cụ nguyên tử Function Calling (`so_sanh_can`, `tinh_thue_phi`, `tinh_vay_tra_gop`, `luu_so_dien_thoai`) thực thi trực tiếp qua `chay_cong_cu`.
2. **Soát truy vết**: Chạy `scripts/soat-truy-vet.sh` đảm bảo không gãy liên kết ID nào.
