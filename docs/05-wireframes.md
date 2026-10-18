# 05 — Wireframes

Low-fidelity, **mobile-first**. Ký hiệu: `[ ]` nút · `( )` input · `▢` ảnh · `···` lặp.
Mỗi màn có một dòng trạng thái dựng (đối chiếu code 04/09/2026 — `docs/10 §10.8`,
OPEN-43/45). URL trong tiêu đề là URL đặc tả; URL thật ghi ở dòng trạng thái.

---

## WF-01 — Trang chủ `/`  → IA-01, FR-01…06, FR-13
✅ đã dựng: `app/page.tsx` (ô chat search, hộp mời Zalo, 4 khối lời hứa, BĐS mới, CTA người bán).

```
┌──────────────────────────────────────────┐
│ nhadat.cc   Mua bán  Thuê  Giới thiệu    │
│                    [Rao bán] [● Zalo]    │
├──────────────────────────────────────────┤
│                                          │
│   Tìm nhà như đang trò chuyện            │
│   Aioinhadat — người môi giới không nghỉ │
│                                          │
│   ( tìm mua nhà phố HXH 8 tỉ ở Q8   )[→] │
│                                          │
│   Thử: "nhà trọ Q3 3PN" ·                │
│        "thuê chung cư Q7 3PN dưới 15tr"  │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ ● Mời anh/chị kết nối ngay với tụi   │ │
│ │   em — có nhà hợp là báo liền.       │ │
│ │            [ Bắt đầu kết nối ]       │ │
│ └──────────────────────────────────────┘ │   ← FR-13
├──────────────────────────────────────────┤
│ HỎI BẤT KỲ, CÓ TỨC THÌ            (FR-03)│
│  ┌────────┐   ┌────────┐   ┌────────┐    │
│  │ Anh chị│ → │ Tụi em │ → │ …báo   │    │
│  │ hỏi    │   │ hỏi    │   │ ngay   │    │
│  │ tụi em │   │ người  │   │ anh chị│    │
│  └────────┘   │ bán    │   └────────┘    │
│               └────────┘                 │
├──────────────────────────────────────────┤
│ BAO LỄ VÀ CN (24x7++)                    │
│ AI và các nhà môi giới của tụi em cùng   │
│ trực, không kể thời gian.                │
├──────────────────────────────────────────┤
│ TỤI EM KHÔNG HỎI SỐ ĐT CỦA ANH CHỊ (FR-04)│
│ ✓ Không cần tiết lộ số điện thoại        │
│ ✓ Chỉ liên hệ bằng Zalo                  │
│ ✓ Ngắt kết nối bất kỳ lúc nào            │
├──────────────────────────────────────────┤
│ MẤT VÀI NĂM MỚI TÌM ĐƯỢC CĂN NHÀ? (FR-05)│
│ Tụi em không ngơi nghỉ. Mỗi khi có căn   │
│ hot hợp yêu cầu, tụi em báo ngay.        │
├──────────────────────────────────────────┤
│ BĐS MỚI NHẤT                             │
│ ▢ card  ▢ card  ▢ card  ···               │
├──────────────────────────────────────────┤
│ BÁN HAY CHO THUÊ VỚI NHADAT.CC? [Xem]    │   ← FR-06
├──────────────────────────────────────────┤
│ FOOTER: 4 cột tag/khu vực/về/riêng tư    │
└──────────────────────────────────────────┘
   mobile: sticky bottom bar [● Chat Zalo]
```

Hero **không** có form dropdown — một ô, một dòng (INS-07). Hộp mời kết nối đặt
**trên** danh sách listing.

---

## WF-02 — Kết quả tìm kiếm `/tim-kiem` → IA-02, FR-07, FR-08
⛔ thay bằng `/mua-ban?q=` · `/cho-thue?q=` (`components/ListingBrowse.tsx`: lọc giá/diện tích/sắp xếp FR-123, hộp Zalo đầu lưới). Chip bỏ từng tiêu chí, nút Xem thêm, nới tiêu chí khi 0 kết quả: chưa dựng.

```
┌──────────────────────────────────────────┐
│ header                                   │
├──────────────────────────────────────────┤
│ ( tìm mua nhà phố HXH 8 tỉ ở Q8    )[→]  │  ← sticky
├──────────────────────────────────────────┤
│ Tìm thấy 234 mục theo yêu cầu            │
│ Mua nhà · Nhà phố · HXH · 8 tỉ · Quận 8  │  ← chip, bỏ được từng cái
│                        Sắp xếp: [Hot ▾]  │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ ▢▢▢▢▢  #35148                        │ │
│ │ Bán nhà hẻm xe hơi, khu dân cư sang  │ │
│ │ trọng, không ngập nước, đường trước  │ │
│ │ nhà thông thoáng…                    │ │
│ │ Vị trí: hẻm XH 572 Nguyễn Trãi P8 Q5 │ │
│ │ DT: 4.2 x 17m                        │ │
│ │ Giá: 12.7 tỉ                         │ │
│ └──────────────────────────────────────┘ │
│ ··· (card 2, card 3)                     │
├──────────────────────────────────────────┤
│ ┌ HỘP MỜI KẾT NỐI ZALO ────────────────┐ │  ← sau card 3
│ │ Chưa thấy căn ưng ý? Chat với tụi em │ │
│ │            [ Bắt đầu kết nối ]       │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ ··· card 4 → 12                          │
│ [ Xem thêm ]                             │
├──────────────────────────────────────────┤
│ TÌM KIẾM LIÊN QUAN (link chéo tag)       │  ← IA-P4
│ [Nhà HXH Q5] [Nhà dưới 8 tỉ] [MT Q8] ··· │
└──────────────────────────────────────────┘
```

Card đúng 4 dòng: **mô tả rút gọn · Vị trí · DT · Giá** [nguồn: nhadat.cc website.docx §Listing].

**0 kết quả**
```
│ Chưa có căn nào khớp đúng yêu cầu.       │
│ Em nới giá lên 9.6 tỉ thì có 41 căn:     │  ← nói rõ đã nới gì
│ ··· cards ···                            │
│ [ Bắt đầu kết nối ] để tụi em tìm riêng  │
```

---

## WF-03 — Chi tiết BĐS `/bds/{slug}-{id}` → IA-04, FR-10, FR-11
🟡 một phần: `/nha-dat/[code]` có gallery, bảng thông số, cue mã, JSON-LD, banner "đã giao dịch"; chip câu hỏi gợi sẵn (UI-C06), khối BĐS tương tự, "cập nhật lần cuối": chưa dựng.

```
┌──────────────────────────────────────────┐
│ Trang chủ › Bán nhà Q5 › HXH › #35148    │  breadcrumb
├──────────────────────────────────────────┤
│ ▢▢▢▢  GALLERY (swipe)          1/12  ▢▢  │
├──────────────────────────────────────────┤
│ ┌── BẢNG THÔNG SỐ (nổi trên ảnh) ──────┐ │
│ │ Loại      DT đất   Kết cấu   Giá     │ │
│ │ Nhà phố   4.2x17m  1T3L      12.7 tỉ │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ 📍 Hẻm xe hơi 572 Nguyễn Trãi, P8, Q5    │
│ Bán nhà hẻm xe hơi #35148                │
│ Cập nhật lần cuối: 3 ngày trước          │  ← RSK-06
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ 💬 Khi Zalo nhớ hỏi #35148           │ │  ← FR-11, luôn hiện
│ │             [ Chat về căn này ]      │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ MÔ TẢ                                    │
│ (câu rao biến thể dài, AI sinh)          │
├──────────────────────────────────────────┤
│ THÔNG SỐ CHI TIẾT                        │
│ DT công nhận · DT xây dựng · Mặt tiền ·  │
│ Số tầng · PN · WC · Hướng · Pháp lý ·    │
│ Hoàn công                                │
│ ⓘ Thông tin pháp lý do người bán cung    │
│   cấp — hỏi tụi em để xác minh lại.      │  ← RSK-03
├──────────────────────────────────────────┤
│ VỊ TRÍ  ▢ bản đồ                         │
│ Gần: Trường ABC 120m · Chợ XYZ 300m      │  ← FR-28
├──────────────────────────────────────────┤
│ CHƯA CÓ THÔNG TIN NÀY?                   │
│ [Còn bán không?] [Xem sổ đỏ] [Ảnh hẻm]   │  ← 1 chạm → UF-05
│ [Mở quán được không?] [Quy hoạch?]       │
├──────────────────────────────────────────┤
│ BĐS TƯƠNG TỰ  ▢ ▢ ▢                      │  ← IA-P4
└──────────────────────────────────────────┘
   sticky mobile: [ 💬 Hỏi về #35148 ]
```

Nút câu hỏi gợi sẵn biến FR-46 thành hành động một chạm — yêu cầu tới hệ thống đã
chuẩn hoá.

---

## WF-04 — Trang tag `/{tag}` → IA-03, FR-12
✅ đã dựng: `app/[tag]` (H1, mô tả, lưới card, link chéo tag, tag rỗng không 404). FAQ schema: chưa.

```
┌──────────────────────────────────────────┐
│ H1: Bán nhà hẻm xe hơi Quận 5            │
│ 128 căn đang rao · cập nhật hôm nay      │
│ (đoạn mô tả 80–120 từ, chèn keyword tự   │
│  nhiên, phục vụ SEO)                     │
├──────────────────────────────────────────┤
│ ( ô search chat, prefill theo tag  )[→]  │
├──────────────────────────────────────────┤
│ ··· cards (giống WF-02) ···              │
│ ┌ HỘP MỜI KẾT NỐI ZALO ────────────────┐ │
├──────────────────────────────────────────┤
│ TAG LIÊN QUAN  (6–8 link chéo)           │
│ [Nhà HXH Q8] [Nhà MT Q5] [Nhà <8 tỉ Q5]  │
├──────────────────────────────────────────┤
│ CÂU HỎI THƯỜNG GẶP (FAQ schema)          │
└──────────────────────────────────────────┘
```

Tag rỗng → giữ bố cục, thay lưới bằng hộp mời kết nối cỡ lớn + tag lân cận. **Không 404** (IA-P1).

---

## WF-05 — Chat Zalo: khai thác nhu cầu → UF-04
✅ đã dựng: `chat-reply` nhánh buyer (lời chào "em là Thái, bên Aioinhadat", hồ sơ nhu cầu, tối đa 3 căn/lượt).

```
┌─ Zalo OA · Aioinhadat ───────────────────┐
│                                          │
│ ┌────────────────────────────────────┐   │
│ │ Aioinhadat xin cảm ơn! Công ty em  │   │
│ │ có 30 nhà môi giới túc trực để tìm │   │
│ │ nhà đất chung cư cho anh/chị.      │   │
│ │ Em tên là Thái. Em xin tên anh/chị │   │
│ │ để xưng hô cho lễ phép ạ           │   │
│ └────────────────────────────────────┘   │
│                        ┌───────────┐     │
│                        │  Hưng     │     │
│                        └───────────┘     │
│ ┌────────────────────────────────────┐   │
│ │ Dạ. Anh tìm nhà ở đâu ạ?           │   │
│ └────────────────────────────────────┘   │
│                        ┌───────────┐     │
│                        │ Quận 5    │     │
│                        └───────────┘     │
│ ┌────────────────────────────────────┐   │
│ │ Em hiện có 24 mục. Anh xem thử vài │   │
│ │ mục hot nhất nha                   │   │
│ │ ┌──────────────────────────────┐   │   │
│ │ │▢ #24 nhà phố 4 tầng HXH Trần │   │   │
│ │ │  Bình Trọng, nhà mới  9.8 tỉ │   │   │
│ │ └──────────────────────────────┘   │   │
│ │ ┌ #56 … 8.4 tỉ ────────────────┐   │   │
│ │ ┌ #234 … 9.45 tỉ ──────────────┐   │   │
│ │      [Xem thêm] [Xem chi tiết] │   │   │
│ │ Anh muốn xem thêm không ạ?     │   │   │
│ └────────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

**Bất biến**: tối đa 3 card mỗi lượt (FR-24); hỏi gọn theo `06 §6.8`.

---

## WF-06 — Chat Zalo: hỏi bổ sung thông tin → UF-05
✅ đã dựng: `ask_owner` → `info_requests`, câu giữ nhịp "Trong khi chờ…" (FR-45), báo lại khách khi chủ trả lời (`followup`).

```
│                    ┌──────────────────┐  │
│                    │ Cho chị xem sổ đỏ│  │
│                    └──────────────────┘  │
│ ┌────────────────────────────────────┐   │
│ │ Chị chờ giùm một chút. Em hỏi chủ  │   │
│ │ nhà ngay ạ.                        │   │
│ │ Trong khi chờ, chị có câu hỏi nào  │   │  ← FR-45 giữ nhịp
│ │ khác không ạ?                      │   │
│ └────────────────────────────────────┘   │
│ ┌ ⏳ Đang hỏi chủ nhà · #35148 ──────┐   │  ← trạng thái hiển thị
│ ┌────────────────────────────────────┐   │
│ │ Chào chị Dương. Em có sổ đỏ rồi nè │   │
│ │ chị. Em gửi chị nhé?               │   │
│ │ ▢ [ảnh sổ]                         │   │
│ │ Sổ cấp 2023. Chị cần gì thêm báo   │   │
│ │ em nha.                            │   │
│ └────────────────────────────────────┘   │
```

---

## WF-07 — Chat Zalo: đặt lịch xem nhà → UF-06
✅ đã dựng: `chat-reply` chốt lịch + xin SĐT kèm lý do và đường từ chối; `nudge` nhắc trước giờ kèm link bản đồ (FR-54/55).

```
│ ┌────────────────────────────────────┐   │
│ │ Chị xem căn MS30148 Trần Bình Trọng│   │  ← xác nhận đúng căn
│ │ Phường 4 Quận 5 giá 12 tỉ phải     │   │
│ │ không chị? Lúc nào thuận tiện ạ?   │   │
│ └────────────────────────────────────┘   │
│               ┌──────────────────────┐   │
│               │ Mai 9h               │   │
│               └──────────────────────┘   │
│ ┌────────────────────────────────────┐   │
│ │ Để em thu xếp người dẫn chị đi xem,│   │  ← nêu rõ mục đích
│ │ chị cho em xin số ĐT liên lạc nha. │   │
│ │ Số này chỉ dùng cho buổi xem thôi ạ│   │  ← FR-53 / NFR-07
│ │        [Gửi số] [Chỉ liên hệ Zalo] │   │  ← luôn có đường từ chối
│ └────────────────────────────────────┘   │
│ ┌────────────────────────────────────┐   │
│ │ Em ghi nhận lịch xem nhà:          │   │
│ │ #30148 — Trần Bình Trọng, P4 Q5    │   │
│ │ 9h sáng Thứ 3 ngày 12/10           │   │
│ │ 📍 maps.app.goo.gl/…               │   │
│ │ Em gọi chị trước 30 phút nhé.      │   │
│ └────────────────────────────────────┘   │
```

---

## WF-08 — Mini-site rao tin `/raoban/dang-tin` → UF-09, FR-91
🟡 một phần: ô một câu rao nằm ở `/quan-ly` (cần đăng nhập) + `/api/listing/parse`; `/raoban` là landing đẩy sang Zalo. Kênh chính là rao trong Zalo (UF-10).

```
┌──────────────────────────────────────────┐
│ nhadat.cc · Rao bán      [Zalo: Cô Bảy]  │
├──────────────────────────────────────────┤
│ Anh/chị cứ rao như bình thường.          │
│ Tụi em lo phần còn lại.                  │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Bán nhà HXH xe tải quay đầu, gần ngã │ │
│ │ tư Trần Bình Trọng và An Dương Vương,│ │
│ │ giá 9 tỉ có thể bớt lộc, Phường 4    │ │
│ │ Quận 5 nhà trệt dễ xây lại|          │ │
│ └──────────────────────────────────────┘ │
│                      [ Đăng tin ngay ]   │
│                                          │
│ Ví dụ: "Cho thuê căn hộ 2PN Q7 15tr"     │
├──────────────────────────────────────────┤
│ Miễn phí đăng tin. Chỉ thu phí khi bán   │
│ được: chính chủ 1% · môi giới 0.5%       │
└──────────────────────────────────────────┘
```

Đúng **một** ô nhập, không dropdown, không chọn quận (INS-05).

---

## WF-09 — Xác nhận bản bóc tách `/raoban/xac-nhan` → FR-92, FR-94, FR-96
🟡 một phần: bóc tách (`/api/listing/parse`, trigger `boc_thong_so`) và upload ảnh (`components/UploadAnh.tsx`) có; form sửa từng trường, chọn chính chủ/môi giới, trường dự án trên web: chưa (trong Zalo bot hỏi nhỏ giọt thay thế).

```
┌──────────────────────────────────────────┐
│ Tụi em hiểu tin của anh/chị như vầy,     │
│ có gì chưa đúng anh/chị sửa giúp em nha. │
├──────────────────────────────────────────┤
│ Giao dịch   [Bán ▾]                      │
│ Loại        [Nhà phố ▾]                  │
│ Vị trí      (Ngã tư TBT và ADV, P4 Q5  ) │
│ Đường/hẻm   [HXH — xe tải quay đầu ▾]    │
│ Quy mô      (Nhà trệt, dễ xây lại      ) │
│ Giá         (9        ) [tỉ ▾] ☑ TL      │
│                                          │
│ ⓘ Còn thiếu — thêm giúp em, khách hay hỏi│  ← nhắc, không bắt buộc
│   Diện tích (      m²)  Sổ đỏ [Có/Chưa]  │
├──────────────────────────────────────────┤
│ HÌNH ẢNH  ▢ + ▢ + [＋ Thêm ảnh]          │
│ Khách hay xin: ảnh mặt tiền, ảnh hẻm,    │
│ ảnh trong nhà, ảnh sổ                    │  ← INS-06 phòng trước
├──────────────────────────────────────────┤
│ Anh/chị là:  ( ) Chính chủ  ( ) Môi giới │  ← FR-101, quyết định phí
├──────────────────────────────────────────┤
│ Thuộc dự án? (tuỳ chọn)     [Chọn... ▾]  │  ← FR-114, hàng dự án
│   Mã căn (50 / A-12.07)  Tầng (  )       │     bỏ qua = hàng lẻ
├──────────────────────────────────────────┤
│              [ Đăng tin ]                │
└──────────────────────────────────────────┘
     ↓ sau khi đăng
┌──────────────────────────────────────────┐
│ ✓ Tin của anh/chị đã lên: #35148         │
│   Khi khách Zalo hỏi, nhớ mã #35148      │
│   [ Xem tin ]  [ Đăng tin khác ]         │
└──────────────────────────────────────────┘
```

---

## WF-10 — Tin của tôi & câu hỏi chờ trả lời `/raoban/quan-ly` → FR-98
🟡 một phần: `/quan-ly` có "Tin của tôi" + đăng tin một câu; câu hỏi chờ trả lời trên web chưa — câu hỏi đi qua Zalo tới chủ/CTV (FR-173).

```
┌──────────────────────────────────────────┐
│ ❗ 2 câu hỏi của khách đang chờ anh/chị   │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ #35148 · 14:32 hôm nay               │ │
│ │ "Cho chị xem sổ đỏ cái"              │ │
│ │ ( trả lời…            ) [▢ Ảnh][Gửi] │ │
│ └──────────────────────────────────────┘ │
│ ┌ #35148 · hôm qua ────────────────────┐ │
│ │ "Chỗ này mở quán ăn được không?"     │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ TIN CỦA TÔI                              │
│ ▢ #35148  Đang rao · 12 lượt hỏi · 1 hẹn │
│ ▢ #35102  Đã bán                         │
└──────────────────────────────────────────┘
```

---

## WF-11 — Danh sách riêng `/ds/{token}` → FR-100, UF-12
✅ đã dựng: `app/ds/[token]` (`20260904g`), `noindex, nofollow`, hết hạn 30 ngày → trang "hết hạn" + Zalo, không 404.

```
┌──────────────────────────────────────────┐
│ Danh sách tụi em lọc riêng cho chị       │
│ Quận 5 · dưới 12 tỉ · hẻm xe hơi         │
│ 28 căn · 14:20 hôm nay                   │
├──────────────────────────────────────────┤
│ ┌ HỘP MỜI CHAT: hỏi tụi em về căn nào ─┐ │
├──────────────────────────────────────────┤
│ ··· cards, mỗi card có mã #ID ···        │
└──────────────────────────────────────────┘
```
Không hiển thị tên/Zalo ID của B trên trang.

---

## WF-12 — Admin: câu hỏi chờ S trả lời `/admin/cau-hoi` → FR-76, FR-80
✅ đã dựng: thẻ "Câu hỏi đang chờ" trên `/admin` (`20260904c`), quá SLA tô đỏ.

```
┌──────────────────────────────────────────┐
│ Câu hỏi của B cần S trả lời      20/trang│
├──────┬───────┬──────────┬────────────────┤
│ B ID │ BĐS ID│ Gửi S lúc│ Câu hỏi        │
├──────┼───────┼──────────┼────────────────┤
│ z_9d…│ #35148│ 14:32    │ Cho chị xem sổ │
│ ↳ S trả lời 15:07 · "Đây em, sổ cấp 2023"│
├──────┼───────┼──────────┼────────────────┤
│ z_1a…│ #35102│ 09:12    │ Còn bán không? │
│ ↳ ⏳ chưa trả lời — 6 giờ                │  ← quá SLA, tô đỏ
├──────┴───────┴──────────┴────────────────┤
│                        ‹ 1 2 3 4 5 ›     │
└──────────────────────────────────────────┘
```
`B ID` clickable → lịch sử hội thoại (FR-75).

---

## WF-13 — Admin: tìm kiếm B `/admin/hoi-thoai` → FR-74
✅ đã dựng: thẻ "Tìm khách" + "Thống kê hội thoại · 30 ngày" trên `/admin`.

```
┌──────────────────────────────────────────┐
│ Tên Zalo ( )  Lần đầu [từ][đến]          │
│ Lần cuối [từ][đến]  Có chat [từ][đến]    │
│                              [ Lọc ]     │
├──────┬────────┬───────┬────────┬─────────┤
│ B    │ Lần đầu│Lần cuối│ Số chat│ Tin B/CC│
├──────┼────────┼───────┼────────┼─────────┤
│ Hưng │ 12/08  │ 20/08 │ 7      │ 84 / 96 │
└──────┴────────┴───────┴────────┴─────────┘
```

---

## WF-14 — Admin: escalation (tiêu cực / voice / xem nhà) → FR-77, FR-78, FR-79
🟡 một phần: `/admin` có thẻ "Khách cần người thật" (gộp tiêu cực + voice), "Lịch xem nhà", "Việc chờ admin"; không tách ba tab, cảnh báo đi ntfy thay email.

```
┌──────────────────────────────────────────┐
│ [Phản ứng tiêu cực] [Voice] [Xem nhà]    │
├────────────┬───────┬─────────────────────┤
│ Timestamp  │ B ID  │ Trích nguyên văn    │
├────────────┼───────┼─────────────────────┤
│ 20/08 15:0…│ z_9d… │ "Hỏi hoài không trả │
│            │       │  lời gì hết vậy em" │
└────────────┴───────┴─────────────────────┘
        mỗi dòng đã gửi email [UPSET] <Zalo ID>
```

---

## Ma trận trạng thái cần thiết kế

| Màn hình | Loading | Rỗng | Lỗi | Đặc biệt |
|---|---|---|---|---|
| WF-02 | skeleton 3 card | nới tiêu chí + giải thích | giữ truy vấn, nút thử lại | quá nhiều KQ → gợi ý thu hẹp |
| WF-03 | skeleton | — | 404 → tag lân cận | listing đã bán → banner + căn tương tự |
| WF-04 | SSG | hộp Zalo cỡ lớn | — | không bao giờ 404 |
| WF-05..07 | "đang gõ…" | — | timeout → xin lỗi + escalate | quá 30 phút → cuộc trò chuyện mới (FR-72) |
| WF-09 | đang phân tích câu rao | bóc tách thất bại → form thủ công | — | trường thiếu = nhắc, không chặn |
| WF-12 | — | "chưa có câu hỏi nào" | — | quá SLA tô đỏ |
