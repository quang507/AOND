# Kiến trúc agent — FDA và BOA

> Lấy từ bộ `docs/agents/` của anh Luận (16/11/2026; mục 0 thêm 17/11 theo commit `59e3ac3` của anh), chỉnh theo code và các quyết định của repo này (SRS-5.1zzzzzzz513).
> Chi tiết: [`fda.md`](fda.md) · [`boa.md`](boa.md). Bàn giao dữ liệu giữa hai bên: [`../fda-boa-mot-ho-so.md`](../fda-boa-mot-ho-so.md).

## 0. Mốc r1 → r2

Anh Luận đánh dấu bước nhảy bằng **sự có mặt của BOA**:

| | r1 | r2 |
|---|---|---|
| Agent | Chỉ FDA | FDA + BOA |
| Nhịp | Trong lượt chat | Thêm vòng nền |
| Việc | Lấy tin → soạn rao | + Soi ảnh / sổ / lợi thế / giá, chủ động chăm tin |
| Giác quan | Lời khách | + Đọc ảnh, tra căn đang rao gần, đối chiếu sổ ↔ nhà |

- **Repo anh Luận** (`luan8560/aond`): `r1` là tag ở commit `207a145` (26/10); r2 mới có tài liệu (`59e3ac3`, 17/11), nhánh `r2-boa` chưa có code.
- **Repo này đã chạy r2:** BOA (tên cũ LQC) chạy từ 12/11/2026, trạng thái từng câu mẫu ở [`../lqc-listing-quality-controller.md`](../lqc-listing-quality-controller.md) §4. Không tách tag hay nhánh, mọi thứ ở `main`.

## 1. Khách chỉ thấy một người

Người bán chỉ trò chuyện với **một nhân vật**: tên trợ lý gán riêng cho khách đó (Kh•ải, H•ải, M•ai…), xưng "em", một giọng, một trí nhớ.
FDA và BOA là tên nội bộ; khách không bao giờ biết có hai bộ máy.

- **Một tên, một giọng.** Tin BOA nhắn dùng đúng tên và giọng của lượt chat (`prompts.build_tin_chu_dong_system`, SRS-509).
- **Nối mạch, không mở màn lại.** Không "Chào anh, em là…"; đọc lịch sử chat để biết khách đã kể gì, từ chối gì.
- **Không giẫm chân nhau.** Khách đang nhắn thì BOA im (chat im ≥ 10 phút mới nhắn).
- **Chung một hồ sơ căn.** Không hỏi lại điều đã có; phí, trạng thái đã nói sao thì giữ vậy.

```
        Khách ───── "em" (H•ải) ← một danh tính
                        │
      ┌─────────────────┴─────────────────┐
  FDA (quầy, tức thì)            BOA (hậu trường, nền)
  lấy tin · soạn rao        ảnh · pháp lý · lợi thế · giá
      └────── chung hồ sơ căn + một giọng ──────┘
```

## 2. Hai nhịp

| | FDA — Front Desk Agent | BOA — Back Office Agent |
|---|---|---|
| Nhịp | Trong lượt chat, đáp ngay | Vòng nền, có thời gian xem lại |
| Việc | Lấy tin tới ngưỡng rao, soạn bản tin, báo phí | Soi tin đã lên web, nhắn một việc đáng nhất |
| Code | `engine.py`, `agent_gop.py`, `prompts.py` | `lqc.py`, `qc_anh.py`, `hoi_sau_dang.py`, `followup.py` |

BOA có bốn chuyên môn (ảnh · pháp lý · lợi thế · giá, xem `boa.md`). Bản anh Luận để ngỏ hai chuyên môn về sau: ghép khách mua (Matcher) và hâm tin nguội
(Re-engagement). Ở đây đã có một phần: báo căn mới cho người mua (`bao_can_moi.py`), hỏi còn bán sau 20 ngày, giữ kết nối sau 6 ngày.

Tên "LQC": bản anh Luận dùng cho riêng chuyên môn ảnh (BOA số 1). Ở đây `lqc.py` là bộ điều phối mọi tin chủ động (vai BOA chung), `qc_anh.py` mới là BOA số 1; chưa đổi tên tệp.

## 3. Ranh FDA ↔ BOA là độ nghiêng, không phải bức tường

- **Mặc định:** FDA nghiêng về nhanh và nông — gom đủ ngưỡng rao rồi dừng. Chuyện "đẹp không / đủ không / đúng không" để BOA.
- **Khách luôn thắng:** khách tự kể hay hỏi sâu thì FDA tiếp ngay, không "cái đó để sau". Khách đang hăng thì theo khách, hưởng ứng thật,
  hỏi nối cho khách kể thêm; ý cần thì lượm dọc đường, không cắt ngang để điền ô trống, không nhắc khách còn thiếu gì.
- **Một điều cứng:** việc cần xem kỹ ảnh / so giá / đối chiếu sổ mà lượt đó chưa có dữ liệu thì **không đoán** — hẹn xem kỹ rồi nhắn lại,
  và hẹn cũng phải giữ hứng cho khách.

Luật này nằm trong khối GIỌNG của FDA (`prompts.GIONG`).

## 4. Luật an toàn chung

1. **Không tự chế.** Chỉ ghi điều khách đã nói hoặc ảnh / giấy đã chứng minh; cụm trích phải nằm trong lời khách (code kiểm).
2. **Ảnh sổ:** vào kho riêng, không lên web; vòng nền tô đen thông tin cá nhân, bản gốc giữ riêng (SRS-522). Bot vẫn chỉ nói "để em kiểm, không đăng" — độ trúng trên sổ thật chưa đo.
3. **Không gấp gáp giả.** "Vừa cọc", "có khách" chỉ nói khi dữ liệu có.
4. **Giá:** đưa căn thật đang rao, nhận xét nhẹ khi đủ căn cùng lối vào; không kê giá mới, không khuyên đầu tư.
5. **Không tự xoá.** Ảnh kém: chủ đồng ý từng tấm mới ẩn.
6. **Nhịp nền có chừng mực:** 8–21 giờ, tối đa 3 tin chủ động / người bán / ngày, chủ bỏ qua 2 tin liền thì thôi, chủ kêu phiền thì thôi hỏi (vẫn còn hỏi còn bán / giữ kết nối).

## 5. Khác bản anh Luận (đã chốt hoặc do code)

| Bản anh Luận | Repo này |
|---|---|
| BOA ~1 nhắc / ngày | 3 tin / người bán / ngày, 10 câu / căn (chốt 12/11) |
| FDA chỉ có lời khách, việc cần tra thì hẹn BOA | FDA có công cụ (đọc ảnh trong lượt, so giá, tra dự án, quy hoạch) nên nhiều việc làm ngay; chỉ hẹn khi lượt đó chưa có dữ liệu |
| FDA chỉ rao bán | Có cả phía mua (số tư vấn) |
| Hứa "em xoá thông tin trên ảnh sổ" | Chỉ nói "để em kiểm, không đăng" |
| Điểm chất lượng của BOA cộng vào điểm uy tín | Đã nối cả bốn mảng (SRS-520, `diem_boa.py`): mỗi mảng 0–1, chỉnh mục của nó trong khoảng 0,75–1 ở điểm tin lượt chat và ở `diem_tin` trên DB (→ hạng) |
| Mỗi ngày soi lại tin điểm còn thấp | Vòng nền chạy liên tục trong khung giờ, xét tin điểm BOA thấp trước (SRS-520) |
