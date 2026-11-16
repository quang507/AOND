# FDA / BOA một hồ sơ — bản thiết kế (đề xuất, 16/11/2026)

> **Trạng thái (16/11/2026, SRS-5.1zzzzzzz511):** đã làm phần đo được không cần model thật — xem mục 0. Phần còn lại là ĐỀ XUẤT; số "mới"
> ở các mục sau là **ước tính**.

## 0. Đã làm và đã đổi khi làm (16/11/2026)

| Mục | Kết quả | Đo (`do-prompt.py`, ký tự / lượt) |
|---|---|---|
| Bỏ lượt gọi soát ô hỏi | Bước viết phía bán tự khai các ô lời mình hỏi ở một dòng `<<HOI>>[…]` cuối lời (`agent_gop.KHAI_HOI`, `tach_khai_hoi` cắt trước khi gửi); lưới `engine._khai_o_hoi` đọc dòng này, chỉ gọi model soát khi thiếu dòng hoặc lời là bản viết lại. Code vẫn là trọng tài (`_hoi_sai_o` không đổi) | hỏi thông tin 3 → **2** lượt gọi, 62.325 → 57.586; duyệt 64.277 → 59.436; hỏi phí 64.433 → 59.590 |
| Tin đầu vai chưa rõ | Đi thẳng vòng agent theo số đang nhắn (ký gửi → vòng bán, tư vấn → vòng mua); đọc ra ý ngược vai thì form đầy đủ như cũ. Gỡ `_doc_nhanh_chua_ro_vai`, `DOC_NHANH_SYSTEM` | chào 4 → **2** lượt gọi, 85.919 → 57.178. Khách MUA nhắn số ký gửi lần đầu: vẫn 3 lượt gọi, 77.069 → 112.732 ký tự (phần lớn là phần cố định đã cache của vòng bán) |
| Ảnh xem một lần (mục 4.4, làm khác) | Image LQC chỉ gửi ảnh MỚI cho model, ảnh đã chấm đi bằng nhãn chữ; bộ chỉ bớt ảnh thì không gọi model (`qc_anh._nhan_cu`, `_ghep`). Không gộp với lượt đọc ảnh trong chat: lượt chat đọc ảnh từng tin lúc chủ đang khai, QC chấm cả bộ đã lên web — gộp thì lượt chat nào có ảnh cũng gánh khuôn QC | thêm 1 ảnh vào bộ 8: 9 ảnh → 1 ảnh gửi model |
| GĐ 1 hồ sơ chung | Không tạo bảng / ô mới: sổ tay đã nằm chung một chỗ (`_hen_*`, `_tam_dung_den`, `_ngung_cham`, `_khong_co`, `_sau_da_hoi`, `_qc_anh` trong ô nội bộ của căn), tin BOA vừa gửi nằm trong lịch sử chat FDA đọc mỗi lượt | — |
| GĐ 2 tin viết sẵn | **Bỏ.** Tin viết sẵn chỉ dùng được ở lượt FDA cuối trước khi khách im; mọi lượt trước đó viết ra rồi bỏ (khách nhắn tiếp là hết hạn). Không biết trước lượt nào là cuối nên phải viết ở MỌI lượt sau đăng → tốn hơn hẳn MỘT lượt gọi tin chủ động (trần 3 tin / người bán / ngày) | — |
| GĐ 3 một lượt gọi (ghi + viết) | **Chưa làm.** Lời nhắc bước viết (việc lượt, khối ưu tiên, trình bản tin) do code tính SAU khi áp ô; gộp thì model phải đoán trước — cần đo trên model thật (% gọi lại, ghi sai ô). Anthropic trên 146 đang hết số dư | — |

> Tên gọi theo chủ dự án 16/11/2026: **FDA** (Front Desk Agent) = bot chat với người bán; **BOA** (Back Office Agent) = LQC,
> phần chạy nền. Khách chỉ thấy MỘT người — tên trợ lý gán cho khách đó (Kh•ải, H•ải…), xưng "em" (SRS-5.1zzzzzzz509).

## 1. Mục tiêu

Ít lượt gọi model, ít lời nhắc, bàn giao FDA ↔ BOA không rơi việc — mà **không đổi quyết định 03/11** "chú trọng độ chính xác":
code vẫn là trọng tài cho mọi ô ghi vào tin.

| Lượt | Hiện nay (đo `do-prompt.py`, 16/11) | Mục tiêu (ước tính) |
|---|---|---|
| Người bán trả lời câu hỏi thông tin | 3 lượt gọi (ghi → viết → soát), 62.325 ký tự | **1** (2 khi code bắt lệch) |
| Tin đầu, vai chưa rõ | 4 (đọc nhanh 955 + form JSON ≈ 33,6k + viết + soát) | **1** |
| Trình bản tin | ≈ 4 thật (6 trong stub vì stub kích hoạt viết lại) | **1–2** |
| Tin chủ động BOA | 1 lượt gọi / tin (prompt 4,3–5,1k) | **0** khi dùng tin viết sẵn, 1 khi không |
| Ảnh mới | 2 lượt đọc (đọc trong lượt chat + Image LQC chấm riêng) | **1** |
| Xấu nhất một lượt | ≈ 9 | ≤ 3 |

Mốc lịch sử để so: trước 03/11 (Haiku form → Sonnet → soát) 3,65 lượt gọi, 23,5 s, $8,19 / 59 kịch bản; vòng gộp từ 03/11
3,84 lượt gọi, 24,8 s, $23,15 / 59 kịch bản.

## 2. Nguyên tắc

1. **Một danh tính.** Mọi lời tới khách do FDA viết bằng `khoi_nhan_vat` + GIỌNG. BOA không bao giờ tự soạn lời.
2. **Code là trọng tài.** Model đề xuất, code áp: ô chỉ ghi khi có `bang_chung` khớp lời khách (cổng hiện có); lời gửi đi qua luật
   hình thức bằng code. Gọi model lại **chỉ khi code bắt được lệch**, không gọi soát "cho chắc".
3. **Hồ sơ là chỗ bàn giao duy nhất.** FDA kết thúc lượt bằng việc ghi hồ sơ; BOA chỉ đọc hồ sơ. Không bên nào phải đọc lại cả
   đoạn chat dài để biết bên kia đã làm gì.
4. **Mỗi việc một nguồn.** Luật giờ nhắn / trần tin ở `lqc.ly_do_khong_nhan`; nhân vật ở `khoi_nhan_vat`; chính sách phí ở
   `CHINH_SACH_PHI`. Thiết kế này không thêm bản sao luật nào.
5. **Đường mới chạy trên ID thử trước** (`engine._TIEN_TO_ID_THU`: `thu-`, `b15-`, `hoi-`, `z-`, `e2e-`, `b-`, `lx-`, `do-`), đo xong
   thì bật cho tất cả và **xoá đường cũ** — không giữ hai đường song song lâu.

## 3. Hiện trạng (để biết bỏ cái gì)

Một lượt người bán (`Engine.handle`):

1. Bridge gom tin nhắn dồn 0,5–1,8 s (SRS-482).
2. Tin đầu vai chưa rõ: `_doc_nhanh_chua_ro_vai` (DOC_NHANH_SYSTEM); không thì form JSON đầy đủ (`provider.extract`, OPERATIONS_SYSTEM + schema).
3. Ảnh / thoại: `build_media_read_instruction`.
4. `agent_gop.mo` **bước 1 ghi** (tools, `MAX_VONG_GHI=3`) → cổng code `bang_chung` áp ô.
5. Engine tính ô kế, việc lượt (`viec_luot.py`), khối ưu tiên.
6. `agent_gop.viet` **bước 2 viết** (`MAX_VONG_LOI=3`).
7. `_soat_hinh_thuc`: luật code + model `_hoi_sai_o` (≈ 5k ký tự) + với bản tin thêm `_binh_gia_trong_tin`; tối đa 1 lần viết lại rồi soát lại.

Nền (BOA): `lqc.py` (luật chung: 8–21 giờ, chat im ≥ 10 phút, nhường người thật, 3 tin / người bán / ngày, chờ đáp 24 giờ, bỏ qua
2 tin liền thì thôi; hẹn / bận / không có / thôi hỏi), `hoi_sau_dang.py` (trần `TRAN_CAU_SAU_DANG` = 10 câu / căn), `qc_anh.py`
(chấm ảnh có `bam` đổi, lưu `_qc_anh` trong `listing_noi_bo`), `followup.py` (nhắc hỏi lại 5 phút, xin ảnh sau đăng),
`giu_ket_noi.py` / `hoi_con_ban.py` (câu mẫu).

Khoảng 10 loại lời nhắc model: ghi, viết, soát hỏi ô, bình giá trong tin, đọc nhanh, form JSON, đọc media, tin chủ động, chấm ảnh,
hỏi sau đăng (khối riêng). Bàn giao FDA → BOA hiện đi qua ô rải rác (`_hen_*`, `_tam_dung_den`, `_ngung_cham`, `_khong_co`, `_qc_anh`)
cộng việc BOA tự đọc lại lịch sử chat khi viết tin.

## 4. Kiến trúc mới

```mermaid
sequenceDiagram
    participant K as Người bán (Zalo)
    participant F as FDA (1 lượt gọi)
    participant C as Code trọng tài
    participant H as Hồ sơ chung
    participant B as BOA (nền, không gọi model)
    K->>F: tin nhắn (đã gom) + hồ sơ + vài tin gần nhất
    F->>C: ket_qua_luot {ghi + bang_chung, loi, hoi_o, so_tay, tin_ke}
    C->>C: áp ô có bằng chứng; kiểm hoi_o == ô kế; luật hình thức
    alt lệch
        C->>F: gọi lại 1 lần kèm lỗi cụ thể
    end
    C->>K: gửi lời
    C->>H: ô tin, sổ tay, tin_ke, phiên bản +1
    B->>H: tick: đọc hồ sơ, lqc.ly_do_khong_nhan
    alt tin_ke còn hợp lệ
        B->>K: gửi nguyên tin_ke (0 lượt gọi)
    else
        B->>F: 1 lượt gọi chế độ "tin chủ động"
        F->>K: tin mới
    end
    B->>H: ghi đã gửi gì, lúc nào
```

### 4.1 Hồ sơ chung (một khối, mỗi người bán)

| Phần | Nội dung | Đã có ở đâu | Mới |
|---|---|---|---|
| `can[]` | ô tin từng căn, ảnh + kết quả đọc ảnh | ô listing, `_qc_anh` | gắn kết quả đọc ảnh vào đây (4.4) |
| `so_tay` | `hen` (lúc), `ban_den`, `tu_choi[]` (ô khách không muốn nói), `khong_co[]`, `ngung_cham`, `lo_ngai[]`, `diem_khoe[]` | `_hen_*`, `_tam_dung_den`, `_ngung_cham`, `_khong_co` | gom một khối; thêm `lo_ngai`, `diem_khoe`, `tu_choi` do FDA ghi |
| `hang_viec` | việc BOA có thể làm kế (xin ảnh, pháp lý, lợi thế, giá…) | code tính mỗi tick (`hoi_sau_dang.cum_sau_ke`, `qc_anh`) | không lưu — vẫn tính bằng code |
| `tin_ke` | `{noi_dung, viec_ma, viet_luc, phien_ban_ho_so, het_han_luc}` | — | mới |
| `tin_chu_dong_cuoi` | việc + lúc BOA vừa gửi | rải trong lqc | gom, FDA đọc khi khách đáp |
| `phien_ban` | số tăng mỗi khi có tin khách / ô đổi | — | mới |

Chỗ lưu: ô nội bộ theo khuôn `O_NOI_BO` → `listing_noi_bo` (chỉ admin) như `_qc_anh` đang làm; khối theo người bán nằm cạnh các ô `_hen_*`
hiện có. Chốt bảng / cột cụ thể ở giai đoạn 1 sau khi đọc `docs/data-model.md`. Giới hạn cỡ: sổ tay tối đa ~12 mục, mục hết hạn bị cắt.

### 4.2 FDA một lượt gọi

**Đầu vào** (theo thứ tự để cache):
1. Phần cố định: nhân vật + GIỌNG, bối cảnh / chính sách, luật ghi ô, định nghĩa tool. Giống nhau cho mọi khách → cache.
2. Phần đổi: HỒ SƠ (ô đã có, ô còn trống theo thứ tự hỏi, sổ tay, tin chủ động cuối), vài tin gần nhất, tin khách lượt này.
3. Một dòng CHẾ ĐỘ: `trả lời` · `tin đầu` · `trình bản tin` · `tin chủ động` · `xem ảnh`.

**Đầu ra:** một tool kết thúc `ket_qua_luot`:

```json
{
  "ghi":    [{"o": "dien_tich", "gia_tri": "80", "bang_chung": "nhà 80m2"}],
  "loi":    "…lời gửi khách…",
  "hoi_o":  "so_tang",
  "so_tay": [{"loai": "hen", "noi_dung": "tối gửi ảnh", "den_luc": "2026-11-16T19:00"}],
  "tin_ke": {"viec_ma": "xin_anh", "noi_dung": "…", "het_han_luc": "…"}
}
```

Tool đọc (tra dự án, định giá…) vẫn gọi được trong cùng vòng; khi cần tra thì lượt đó tốn thêm vòng — chấp nhận, vì phần lớn lượt
không cần.

**Code làm sau khi nhận:**
1. Áp `ghi` qua cổng `bang_chung` hiện có (ô không có bằng chứng → bỏ, không gọi lại).
2. Tính ô kế sau khi áp. `hoi_o` khác ô kế, hoặc lời hỏi ô đã có / ô khách đã từ chối → **gọi lại 1 lần** kèm lỗi cụ thể.
3. Luật hình thức bằng code (độ dài, số câu hỏi, chữ cấm, câu cố định) — thay phần model `_hoi_sai_o`.
4. Ghi hồ sơ, tăng `phien_ban`.

Chế độ `tin đầu`: cùng lượt gọi, model tự ghi ô vai (chủ / môi giới) qua `ghi` khi có bằng chứng; bỏ đọc nhanh và form JSON.
Chế độ `trình bản tin`: lời = bản tin; bình giá trong tin gộp vào luật của chế độ này, không gọi riêng.

**Dự phòng:** provider dự phòng (Gemini, Groq) phải gọi được tool `ket_qua_luot`; provider nào không hỗ trợ thì giữ đường hai
bước cũ cho provider đó tới khi thay được.

### 4.3 BOA không gọi model khi không cần

Mỗi tick (lịch nền hiện có):
1. `lqc.ly_do_khong_nhan` như cũ — giờ, im, trần, nhường người thật, sổ tay (hẹn / bận / thôi hỏi).
2. Code chọn việc như cũ (`hoi_sau_dang`, `qc_anh`, `followup`).
3. `tin_ke` dùng được khi: `viec_ma` trùng việc vừa chọn, `phien_ban_ho_so` = `phien_ban` hiện tại, chưa quá `het_han_luc` (mặc định
   24 giờ). Đủ cả ba → gửi nguyên văn, **0 lượt gọi**.
4. Không đủ → 1 lượt gọi FDA chế độ `tin chủ động` (`build_tin_chu_dong_system`, đã có từ SRS-509), đầu vào là hồ sơ, không phải
   cả lịch sử chat.
5. Ghi `tin_chu_dong_cuoi`; khách đáp thì lượt FDA kế thấy ngay em vừa nhắn gì.

Câu mẫu (`giu_ket_noi`, `hoi_con_ban`) giữ nguyên.

### 4.4 Ảnh đọc một lần

Ảnh có `bam` mới → **một** lượt đọc ra cả hai phần:
- phần QC như `qc_anh` đang lưu (`diem`, `khop_noi_dung`, `goc_can_xin`, `the_manh_chua_co_anh`, `anh_khong_khop`…);
- ô thấy được từ ảnh (loại hình, số tầng, nội thất…) đi vào `ghi` với `bang_chung = "ảnh #i"` — **chỉ điền ô đang trống**, không đè
  lời khách.

FDA và BOA cùng đọc kết quả dạng chữ trong hồ sơ; `qc_anh` không chấm lại ảnh đã có kết quả.

### 4.5 Một lời nhắc + dòng chế độ

| Lời nhắc cũ | Đi về đâu |
|---|---|
| Bước 1 ghi (`agent_gop.mo`) | gộp vào FDA một lượt (phần `ghi`) |
| Bước 2 viết (`agent_gop.viet`) | gộp vào FDA một lượt (phần `loi`) |
| Soát hỏi ô `_hoi_sai_o` | bỏ — `hoi_o` + code kiểm |
| Bình giá trong tin | gộp vào chế độ `trình bản tin` |
| Đọc nhanh vai (DOC_NHANH_SYSTEM) | bỏ — chế độ `tin đầu` |
| Form JSON (OPERATIONS_SYSTEM + schema) | bỏ — chế độ `tin đầu` |
| Đọc media | chế độ `xem ảnh` (4.4) |
| Tin chủ động (`build_tin_chu_dong_system`) | giữ, thành chế độ `tin chủ động`; phần lớn được thay bằng `tin_ke` |
| Chấm ảnh `qc_anh` | gộp vào chế độ `xem ảnh` |
| Khối hỏi sau đăng | giữ khối, đưa vào VIỆC của chế độ `tin chủ động` (như hiện nay) |

## 5. Lộ trình — bốn giai đoạn, mỗi giai đoạn đo rồi mới qua

| GĐ | Làm | File chính | Đo | Qua khi |
|---|---|---|---|---|
| **1. Hồ sơ chung** | gom sổ tay; BOA viết tin từ hồ sơ thay vì lịch sử; FDA thêm khối HỒ SƠ ngắn | `lqc.py`, `hoi_sau_dang.py`, `followup.py`, `qc_anh.py`, `schema.py`, `engine.py`, `prompts.py` | cỡ prompt tin chủ động và lượt chat | `do-prompt.py` 3/3, truyvet sạch, tin chủ động trên ID thử nhắc đúng hẹn / bận |
| **2. Tin viết sẵn** | bước 2 hiện tại trả thêm `tin_ke`; BOA dùng khi hợp lệ | `agent_gop.py`, `lqc.py`, `prompts.py` | % tin chủ động dùng `tin_ke`; lượt gọi nền / ngày | ≥ 50 % dùng được, đọc tay 20 tin thật thấy liền mạch |
| **3. FDA một lượt gọi** | `ket_qua_luot`; bỏ soát model, đọc nhanh, form JSON | `agent_gop.py`, `engine.py`, `prompts.py`, `llm/` | lượt gọi / lượt, % gọi lại, giây / lượt, chi phí (`bot_usage_model`) | ≤ 1,3 lượt gọi / lượt; đọc 30 lượt thật không thấy ghi sai ô nhiều hơn trước → bật tất cả, xoá bước 1/2 cũ và soát model |
| **4. Ảnh một lần** | một lượt đọc ảnh ra QC + ô | `engine.py`, `qc_anh.py`, `prompts.py` | lượt đọc ảnh / ảnh | = 1; ô từ ảnh không đè lời khách |

GĐ 1, 2, 4 không đụng cách ghi ô nên làm được ngay; GĐ 3 cần chủ dự án gật (mục 7).

Cách đo theo luật dự án: `PYTHONUTF8=1 PYTHONPATH=src python scripts/do-prompt.py`, bảng `bot_usage_model`, đọc chat thật. Không dựng
giám khảo / bộ vàng. Hiện Anthropic trên máy 146 hết số dư, bot chạy Gemini dự phòng — số đo Claude thật phải chờ nạp tiền.

## 6. Rủi ro và cách chặn

| Rủi ro | Chặn |
|---|---|
| Model viết lời trước khi code áp ô → hỏi lệch ô | đưa sẵn danh sách ô trống theo thứ tự; code kiểm `hoi_o`; lệch thì gọi lại 1 lần |
| Một lượt gọi sai cả ghi lẫn lời | cổng `bang_chung` giữ nguyên; luật hình thức code giữ nguyên |
| `tin_ke` cũ so với chuyện mới | `phien_ban` tăng mỗi tin khách; hạn 24 giờ; việc phải trùng |
| Hồ sơ phình | trần ~12 mục sổ tay, cắt mục hết hạn |
| Đọc ảnh sai vào ô | chỉ điền ô trống, bằng chứng ghi rõ "ảnh #i" để admin thấy nguồn |
| Provider dự phòng không gọi tool chuẩn | giữ đường cũ riêng cho provider đó tới khi thay |
| Thiếu số đo Claude thật | chạy trên ID thử khi có số dư; trước đó chỉ đo cỡ prompt |

## 7. Cần chủ dự án quyết

03/11 chủ dự án chọn vòng gộp hai bước vì độ chính xác. GĐ 3 gộp hai bước thành **một lượt gọi** nhưng vẫn giữ code làm trọng tài
(cổng bằng chứng + kiểm ô hỏi + luật hình thức) và gọi lại khi lệch. Hai hướng:
- **Thử GĐ 3 trên ID thử**, quyết bật hay không sau khi có số (lượt gọi, % gọi lại, ghi sai ô).
- **Giữ hai bước**, chỉ làm GĐ 1, 2, 4. Lượt chat vẫn 3 lượt gọi (soát model chỉ bỏ được ở GĐ 3); phần tiết kiệm nằm ở nền và ảnh.

Các việc kỹ thuật còn lại (tên ô, chỗ lưu, hạn `tin_ke`) tự chốt khi làm và ghi vào SRS.
