# 08 — Traceability Matrix

Cập nhật **cùng commit** với bất kỳ thay đổi nào ở `01`…`07` (quy ước 4, `CLAUDE.md`).

## 8.0 Định hướng → tầng dưới (`00-dinh-huong.md` v1.5, 28/10/2026)

| DH | Nội dung | Neo ở tầng dưới |
|---|---|---|
| DH-01 | Định vị hợp nhất: Aioinhadat, một bộ não (lõi Python `src/aioi/`), mỗi khách một trợ lý mang tên riêng (13 tên có chấm giữa); Sài Gòn (phường mới) + Long An, trọng tâm bán; mặt bán theo AOND, mặt mua + web theo nhadat.cc; vòng nối: khách hỏi → chủ nhà (hạn 12 giờ) → quá hạn / không có chủ nhà thì admin → lõi báo lại khách (CTV bỏ 28/10/2026); kênh Zalo cá nhân qua bridge, hai số | OPEN-08/39, OPEN-27 nửa đầu, FR-173, FR-174, FR-181, BR-01, INS-01/06/08/12, `06 §6.8`, SRS-5.1, SRS-5.1zzzzzzz170, SRS-5.1zzzzzzz183, SRS-5.1zzzzzzz210 |
| DH-02 | Bốn bất biến hướng nào cũng giữ | IA-P1, NFR-07 / FR-53, RSK-03 / FR-40, INS-11 / FR-104 (OPEN-36) |
| DH-03 | Mặt bán lấy AOND làm chuẩn | FR-129, FR-144, FR-153, FR-155, FR-172, `06 §6.8` kịch bản người bán; bảng §0.3 (00) liệt kê từng mục AOND §I–§VII ↔ FR |
| DH-04 | Mặt mua và web lấy nhadat.cc làm chuẩn | FR-01…FR-65, UF-01…UF-08, IA-P1…P5 |
| DH-05 | Sao Bắc Đẩu: lịch xem nhà chốt mỗi tuần (`viewings.status = 'confirmed'`, admin chốt bằng `#mã: ok giờ`); đầu vào I1–I5; I3 = câu khách hỏi được trả lời đúng hạn — chủ nhà hoặc admin | FR-57 / SRS-5.3 (viewing), SRS-5.1zzzzzzz173, FR-139 (`dang_ban`), UF-04, FR-173 / SRS-5.1zzzzzzz170 (`sla_due_at`) / FR-140 c, BR-07 / FR-63 / SRS-5.1zzzzzzz150 / SRS-5.1zzzzzzz216, FR-155 / view `nmg_hoat_dong` (`20260904e`) |
| DH-06 | Lộ trình 90 ngày: chốt hướng → đo I3 (chủ nhà trả lời trong 12 giờ, phần admin phải đỡ) → mở địa bàn (FR-174 đợt 1 xong, đợt 2 chờ) → 7 hạng mục dữ liệu → phần AOND còn thiếu → vận hành | OPEN-21/26/28/40/41, OPEN-27 nửa sau (OPEN-42 mất đối tượng khi bỏ CTV); SRS-5.1zzzzzzz170; FR-174; `01 §1.5c`; FR-135/141; NFR-16 / OPEN-25 |
| DH-07 | Cho tới khi §0.8 chốt, đi theo khuyến nghị BA và ghi `[giả định BA]` | OPEN-40, OPEN-41, OPEN-42, OPEN-27 nửa sau |
| DH-08 | Đánh giá 21/09/2026 theo khung Design Thinking: năm cột có gì / thiếu gì, khả năng thành công, ba việc kế tiếp (đo trên DB thật, không từ code) | `00 §0.9`; INS-02/03/04/06/11/12, `01 §1.2`/§1.5/§1.7, §0.5–§0.7, RSK-02/RSK-04, FR-145, FR-173, FR-208, FR-212, `10 §10.8`, TS-DUONG/TS-BLDL/TS-HOIBU |
| DH-09 | Lean Canvas 12 ô (21/09/2026): vấn đề, giải pháp hiện có, giải pháp, giá trị độc nhất, khái niệm, lợi thế khó sao chép, phân khúc, khách đầu tiên, chỉ số, kênh, chi phí, nguồn thu — cùng nội dung §0.4, lệch thì §0.4 thắng | `00 §0.10`; INS-01/02/04/05/06/09/11/13, `01 §1.2`–§1.5/§1.7, `02 §2.2`, BR-02/04/05/08/09, FR-57/103/104/144/145/155/156/171/173/174/177/208, RSK-02/06, NFR-14/16, OPEN-01/25, §0.5, §0.9 |

## 8.1 Business Requirement → Functional Requirement

| BR | Mục tiêu | FR liên quan |
|---|---|---|
| BR-01 | Phủ 90% nguồn hàng Q5 | FR-90…FR-97, FR-101 |
| BR-02 | 20 NMG | FR-101, FR-137 (FR-102 deprecated) |
| BR-03 | 10 chat/ngày, ≥30 tin | FR-13, FR-14, FR-20…FR-32, FR-71 |
| BR-04 | 1 giao dịch/2 ngày | FR-50…FR-57, FR-99 |
| BR-05 | Thu phí bên bán | FR-101, FR-137 (FR-102 deprecated) |
| BR-06 | Miễn phí, không thu số ĐT | FR-04, FR-53, NFR-07 |
| BR-07 | Giữ kết nối 3–4 năm | FR-60…FR-65, FR-64 |
| BR-08 | SEO 100 keyword | FR-12, FR-15, FR-17, NFR-09 |
| BR-09 | Web → Zalo kèm ngữ cảnh | FR-13, FR-14, FR-30 |

## 8.2 Insight → yêu cầu

| INS | Insight | Hiện thực ở |
|---|---|---|
| INS-01 | Chat là sản phẩm | FR-13, IA-P1, UI-P1, WF-01 |
| INS-02 | Chu kỳ mua 3–4 năm | FR-60…FR-65, UF-08 |
| INS-03 | Zalo xoá sau 7 ngày | FR-63, SRS-5.3 `zalo_keepalive`, AC-06 |
| INS-04 | Riêng tư là khác biệt | FR-04, FR-121, NFR-07, WF-07, AC-04 |
| INS-05 | S không điền form | FR-91, UI-C08, WF-08, AC-07 |
| INS-06 | Thiếu thông tin là tính năng | FR-40…FR-47, UF-05, SRS-3.6, AC-03 |
| INS-07 | Ngôn ngữ nói ≠ bộ lọc | FR-02, FR-09, FR-22, FR-23, SRS-4.5, AC-12 |
| INS-08 | Sâu một quận trước | BR-01, SRS-8 (thứ tự P1 trước P2) |
| INS-09 | "Rao một lần là xong", không spam S | FR-103, §6.9 (06), SRS-5.3 `stale_listing_check` |
| INS-10 | Hàng dự án: dữ liệu hai tầng, tồn kho theo căn | FR-113…FR-117 (OPEN-15 chốt phương án b, 24/08) |
| INS-11 | Trung gian toàn phần: lưu hết, khai khi khách hỏi; liên hệ mở lúc chốt lịch xem (chỉnh 02/09/2026, OPEN-36) | FR-104…FR-112, UF-10, UF-13, SRS-3.8 |
| INS-12 | Sau sáp nhập 2025, địa giới cũ vẫn là ngôn ngữ thị trường | FR-118 (`ward_mapping`), Taxonomy §4.6 (04), FR-12 (trang tag) — quyết định chủ dự án 24/08/2026 |
| INS-13 | Bộ trường tin rao "chuẩn sàn" là mẫu số chung (mogi/radanhadat) | FR-172, SRS-3.1, SRS-3.14; khoảng trống còn lại: `streets`/`ward_mapping` (FR-118), POI (FR-28, OPEN-13), snapshot giá (FR-99/120, OPEN-10) |

## 8.3 FR → UF → WF → SRS → AC

> Bảng chỉ giữ MÃ (UF / WF / SRS / AC / TS) của từng ô. Ghi chú hiện thực và lịch sử đầy đủ ở `docs/08-traceability-luu-tru.md` (30/10/2026, chủ dự án: "ba file BA lớn dọn đi").

| FR | User Flow | Wireframe | SRS | Acceptance |
|---|---|---|---|---|
| FR-01…06 | UF-01 | WF-01 | SRS-2.1 | TS-WEB2-W01 |
| FR-07, FR-08 | UF-01 | WF-02 | SRS-4.5 | AC-01, TS-WEB2-W03 |
| FR-09 | UF-01 | WF-02 | SRS-4.5 | AC-12, TS-WEB2-S01 |
| FR-10, FR-11 | UF-02 | WF-03 | SRS-3.1 | AC-01, TS-WEB2-W05 |
| FR-12 | UF-01 | WF-04 | — | TS-SEO-01 |
| FR-13, FR-14 | UF-03 | WF-01, WF-02 | SRS-4.7 | AC-01 |
| FR-15 | UF-02 | WF-03, WF-04 | — | — |
| FR-16 | UF-01 | — | SRS-3.3 | — |
| FR-17 | — | WF-04 | — | TS-SEO-01 |
| FR-20…FR-26 | UF-04 | WF-05 | SRS-5.1 | AC-02 |
| FR-27, FR-28 | UF-04 | WF-03, WF-05 | SRS-3.8, SRS-5.1 | TS-V48-27 |
| FR-29, FR-30 | UF-03, UF-04 | WF-05 | SRS-4.7 | AC-01 |
| FR-31, FR-32 | UF-04 | WF-05 | SRS-5.2 | TS-V48-31, TS-JOB |
| FR-40…FR-47 | UF-05 | WF-06, WF-10 | SRS-3.6, SRS-4.1, SRS-4.2, SRS-5.1zzzzzzz170 | AC-03, TS-V48-45 |
| FR-50…FR-57 | UF-06 | WF-07 | SRS-3.7, SRS-5.1zzzzzzz165, SRS-5.1zzzzzzz216 | AC-04, TS-GIUCHAN-01, TS-MATCH |
| FR-54 | UF-06 | WF-07 | — | TS-MATCH-08 |
| FR-56 | UF-07 | — | SRS-5.2, SRS-3.8b, SRS-3.12 | AC-05, TS-MATCH-06 |
| FR-60…FR-65 | UF-08 | — | SRS-5.1zzzzzzz150, SRS-5.1zzzzzzz104 | TS-GIUCHAN, TS-V48-65 |
| FR-64 | UF-08 | — | — | AC-06, TS-MATCH-01 |
| FR-70, FR-72, FR-73 | — | WF-12 | SRS-3.2 | AC-09, TS-WEB2-W06, TS-GIUCHAN-01 |
| FR-71 | — | WF-12 | SRS-3.11 | AC-09, TS-ADM2-07, TS-ADM2-12 |
| FR-74, FR-75 | — | WF-13 | SRS-3.11 | AC-09, TS-ADM2-03, TS-ADM2-11 |
| FR-76 | UF-05, UF-11 | WF-12 | SRS-3.6, SRS-3.11 | AC-09, TS-ADM2-01, TS-ADM2-05, TS-ADM2-11 |
| FR-77 | UF-11 | WF-14 | SRS-5.4, SRS-3.11 | AC-10, TS-ADM2-06 |
| FR-78 | UF-06, UF-11 | WF-14 | SRS-3.7, SRS-3.11 | AC-10, TS-ADM2-02, TS-ADM2-11 |
| FR-79 | UF-06, UF-11 | WF-14 | SRS-5.5 | AC-10, TS-V48-79 |
| FR-80 | — | WF-12 | — | AC-09, TS-ADM2-12 |
| FR-81 | UF-11 | — | SRS-5.5 | AC-10, TS-GIUCHAN |
| FR-90…FR-96 | UF-09 | WF-08, WF-09 | SRS-4.6 | AC-07, TS-WEB2-P01 |
| FR-98 | UF-05 | WF-10 | SRS-4.2 | AC-03 |
| FR-99 | UF-04 | WF-05 | SRS-5.1 | TS-V48-99, TS-WEB2 |
| FR-100 | UF-12 | WF-11 | SRS-4.3, SRS-3.8b | AC-11, TS-WEB2-P06 |
| FR-101, FR-102 | UF-09 | WF-09 | SRS-3.4 | — |
| FR-103 | UF-09 | — | SRS-5.3, SRS-3.12 | TS-GIUCHAN-03 |
| FR-104, FR-105 | UF-06, UF-12 | — | SRS-3.8, SRS-5.1 | TS-SEC-10, TS-V48-105 |
| FR-106, FR-107, FR-108 | UF-13 | — | — | TS-V48-108, TS-GIUCHAN-01 |
| FR-109, FR-111 | UF-10 | — | SRS-3.8 | — |
| FR-110 | UF-05 | WF-06 | — | TS-GIUCHAN-01 |
| FR-112 | UF-07 | — | SRS-3.8 | — |
| FR-113 | — | — | SRS-3.10 | AC-13 |
| FR-114 | UF-09, UF-10 | WF-09 | SRS-3.10, SRS-5.1zzzzzq | AC-13, TS-V48-114 |
| FR-115, FR-116 | UF-05 | — | SRS-3.10, SRS-5.1 | AC-13, TS-V48-116 |
| FR-117 | — | — | SRS-3.10 | TS-WEB2-W10 |
| FR-118 | — | — | SRS-3 | — |
| FR-119 | — | — | — | — |
| FR-120 | — | — | — | — |
| FR-121 | — | — | — | — |
| FR-122 | — | — | SRS-3.8, SRS-5.1zzzzzzz206 | — |
| FR-123 | UF-01 | WF-03 | — | — |
| FR-124 | UF-09 | — | — | — |
| FR-125 | — | — | — | TS-SEC-08 |
| FR-126 | UF-08 | — | — | — |
| FR-127 | UF-11 | WF-12 | — | — |
| FR-128 | UF-01 | WF-03 | — | — |
| FR-129 | UF-05, UF-09 | — | — | — |
| FR-130 | UF-04, UF-08 | WF-05 | — | TS-SIET-01 |
| FR-131 | UF-04 | — | SRS-5.1zzzzzq | — |
| FR-132 | UF-04, UF-05 | — | — | AC-13 |
| FR-133 | UF-05, UF-08 | — | — | AC-06 |
| FR-134 | UF-04 | — | — | — |
| FR-135 | UF-04 | — | — | — |
| FR-136 [deprecated 28/10/2026] | — | — | — | — |
| FR-137 [deprecated 28/10/2026] | — | — | — | — |
| FR-138 [deprecated 28/10/2026] | — | — | — | — |
| FR-139 | UF-04, UF-05 | WF-04 | — | — |
| FR-140 | UF-04, UF-09 | — | SRS-5.1zzzzzzz170, SRS-5.1zzzzzzz216 | TS-HOICHU, TS-CTV |
| FR-141 | UF-04 | — | — | — |
| FR-142 | UF-04, UF-07 | — | SRS-5.1zzzzzzz22 | — |
| FR-143 | UF-04 | — | — | — |
| FR-144 | UF-05, UF-09 | — | — | TS-NHUNG-01 |
| FR-145 | UF-01, UF-03 | WF-01 | — | — |
| FR-146 | UF-04 | — | — | — |
| FR-147 [deprecated 28/10/2026] | UF-04, UF-09 | — | — | — |
| FR-148 | UF-01, UF-03, UF-04 | WF-02, WF-03 | — | — |
| FR-149 | UF-09 | — | — | — |
| FR-150 | UF-05, UF-09, UF-10, UF-13 | — | — | TS-LIVE-09, TS-OUNG |
| FR-151 | UF-04 | — | — | TS-SEC2, TS-IDEM |
| FR-152 | UF-09 | — | — | TS-HEALTH, TS-LOG |
| FR-153 | UF-05, UF-09 | — | — | TS-SPECS-01 |
| FR-154 | UF-04, UF-05 | WF-03, WF-05 | — | TS-GIA-01 |
| FR-155 | UF-09, UF-10 | — | — | TS-HANG-01 |
| FR-156 | UF-09, UF-13 | — | — | TS-DANGTIN-01 |
| FR-157 | UF-05, UF-09, UF-10 | — | — | TS-NEO-01 |
| FR-158 | UF-05, UF-09 | — | — | TS-MA-01 |
| FR-159 | UF-04, UF-05, UF-10 | WF-05 | — | TS-VAI-01 |
| FR-160 | UF-09 | — | — | — |
| FR-161 | UF-04, UF-05, UF-09 | — | — | TS-KD-01 |
| FR-162 | UF-04, UF-05 | — | — | TS-IDEM-01, TS-IDEM2-A |
| FR-163 | UF-04, UF-05, UF-06 | — | — | TS-TOANVEN-01 |
| FR-164 | UF-05, UF-09, UF-10, UF-13 | — | — | TS-OUNG-01 |
| FR-165 | UF-01, UF-03, UF-10, UF-13 | WF-02, WF-03 | — | TS-KHO-01 |
| FR-166 | UF-04, UF-05, UF-06, UF-08 | — | — | TS-JOB-01 |
| FR-167 | UF-01, UF-03, UF-04, UF-05 | WF-02, WF-03 | — | TS-SEC2, TS-SEC3 |
| FR-168 | UF-04, UF-05 | — | — | TS-CHUONG-01 |
| FR-169 | UF-04, UF-05 | — | — | TS-TIEN-01 |
| FR-170 | UF-04, UF-05, UF-06, UF-10 | WF-05, WF-06, WF-07 | — | TS-VAI, TS-E2E |
| FR-171 | UF-04, UF-05, UF-06, UF-08 | WF-02, WF-03, WF-05 | — | TS-TOIUU-01, TS-TOC-01 |
| FR-172 | UF-01, UF-03, UF-05, UF-06 | WF-02, WF-03, WF-05 | — | TS-THONGSO-01, TS-VAN-03 |
| FR-171 (ranh giới) | UF-04, UF-05 | — | — | TS-RANHGIOI-01 |
| NFR-11 (đọc DB) | — | — | SRS-3.0 | — |
| NFR-16 (kho gốc) | — | — | — | TS-MASTERDB |
| FR-173 | UF-05, UF-11 | — | SRS-5.1zzzzzzz170 | TS-CTV-01 |
| FR-174 | UF-04, UF-09, UF-10 | — | — | TS-DIABAN-01 |
| FR-175 | — | — | — | — |
| FR-176 | UF-10 | — | — | TS-KYGUI-01, TS-VAN-01, TS-VAN-02, TS-VAN-04, TS-VAN-07, TS-VAN-06, TS-VAN-09, TS-BLDL-05, TS-BLDL-06 |
| FR-177 | UF-10 | — | — | TS-GIONG-05, TS-GIONG-06 |
| FR-177 | UF-10 | — | — | TS-GIONG-07 |
| FR-177 | UF-10 | — | — | TS-GIONG-07 |
| FR-177 | UF-10 | — | SRS-5.1zzzzzv | TS-SELLER-SCRIPT |
| FR-177 | UF-10 | — | SRS-5.1zzzzzw | TS-SELLER-SCRIPT |
| FR-177 | UF-10 | — | SRS-5.1zzzzzx | TS-SELLER-SCRIPT |
| FR-177, FR-212, FR-214 | UF-10 | — | SRS-5.1zzzzzy | TS-SELLER-SCRIPT |
| FR-177 | UF-10 | — | SRS-5.1zzzzzz | TS-BAN-NHAP-02 |
| FR-177, FR-226, FR-214 | UF-10 | — | SRS-5.1zzzzzza | TS-BAN-NHAP-02 |
| FR-177, FR-131 | UF-10 | — | SRS-5.1zzzzzzb | TS-BAN-NHAP-02 |
| FR-177, FR-164 | UF-10 | — | SRS-5.1zzzzzzc | TS-BAN-NHAP-02 |
| FR-177, FR-195, FR-199, FR-194 | UF-10 | — | SRS-5.1zzzzzzd | TS-BAN-NHAP-02, TS-GROQ-04 |
| FR-177, FR-131 | UF-10 | — | SRS-5.1zzzzzzg | TS-BAN-NHAP-02 |
| FR-208, FR-177 | UF-10 | — | SRS-5.1zzzzzzh | TS-AIBOC-07 |
| FR-177, FR-133, FR-208 | UF-10 | — | SRS-5.1zzzzzzi | TS-BAN-NHAP-02 |
| FR-177 | UF-10 | WF-10 | SRS-5.1zzzzzzj | TS-BAN-NHAP-02 |
| FR-209, FR-177, FR-208 | UF-10 | — | SRS-5.1zzzzzzk | TS-AIBOC-07 |
| FR-171, FR-177 | UF-10 | — | SRS-5.1zzzzzzl | TS-AIBOC-07 |
| FR-209, FR-212, FR-208 | UF-10 | — | SRS-5.1zzzzzzm | TS-AIBOC-07 |
| FR-122, FR-152 | UF-10 | — | SRS-5.1zzzzzzn | — |
| FR-177 | UF-10 | WF-10 | SRS-5.1zzzzzzo | TS-BAN-NHAP-02 |
| FR-171, FR-144 | UF-10 | — | SRS-5.1zzzzzzp | TS-BAN-NHAP-02 |
| FR-164, FR-177 | UF-10 | WF-10 | SRS-5.1zzzzzzq | TS-BAN-NHAP-02 |
| FR-178 | UF-04, UF-10 | — | SRS-5.1zzzzzzt | TS-GIONG-08 |
| FR-177 | UF-10 | WF-10 | SRS-5.1zzzzzzr | TS-BAN-NHAP-02 |
| FR-131, FR-177 | UF-10 | — | SRS-5.1zzzzzzu | TS-BAN-NHAP-02 |
| FR-164, FR-144 | UF-10 | — | SRS-5.1zzzzzzv | TS-BAN-NHAP-02 |
| FR-211 | UF-10 | — | SRS-5.1zzzzzzw | — |
| FR-208 | UF-10 | — | SRS-5.1zzzzzzx | — |
| FR-171, FR-144 | UF-10 | — | SRS-5.1zzzzzzy | TS-BAN-NHAP-02 |
| NFR-01 | UF-10 | — | SRS-5.1zzzzzzz | TS-BAN-NHAP-02 |
| FR-183 | UF-10 | — | SRS-5.1zzzzzzz2 | TS-BAN-NHAP-02 |
| FR-186 | UF-10 | WF-06 | SRS-5.1zzzzzzz3 | TS-BAN-NHAP-02 |
| FR-131, FR-177 | UF-10 | — | SRS-5.1zzzzzzz4 | TS-BAN-NHAP-02 |
| FR-186 | UF-10 | — | SRS-5.1zzzzzzz5 | TS-BAN-NHAP-02 |
| FR-181 | UF-10 | — | SRS-5.1zzzzzzz6 | TS-MO-PHONG-01 |
| FR-186 | UF-10 | — | SRS-5.1zzzzzzz7 | TS-BAN-NHAP-02 |
| FR-177 | UF-10 | WF-06 | SRS-5.1zzzzzzz8 | TS-BAN-NHAP-02 |
| FR-181 | UF-10 | — | SRS-5.1zzzzzzz9 | TS-BAN-NHAP-02 |
| FR-164, FR-177 | UF-10 | WF-06 | SRS-5.1zzzzzzz10 | TS-BAN-NHAP-02 |
| FR-214 | UF-10 | — | SRS-5.1zzzzzzz11 | TS-BAN-NHAP-02 |
| FR-212 | UF-10 | — | SRS-5.1zzzzzzz12 | TS-BAN-NHAP-02 |
| FR-177 | UF-10 | WF-06 | SRS-5.1zzzzzzz13 | TS-BAN-NHAP-02 |
| FR-212, FR-208 | UF-10 | — | SRS-5.1zzzzzzz14 | TS-BAN-NHAP-02 |
| FR-208, FR-114, FR-177 | UF-10 | — | SRS-5.1zzzzzzz15 | TS-BAN-NHAP-02 |
| FR-177, FR-181, FR-208 | UF-10 | — | SRS-5.1zzzzzzz16 | TS-BAN-NHAP-02 |
| FR-208, FR-214 | UF-10 | — | SRS-5.1zzzzzzz17 | TS-BAN-NHAP-02 |
| FR-159, FR-205, FR-129 | UF-10 | — | SRS-5.1zzzzzzz18 | TS-BAN-NHAP-02 |
| FR-195, FR-183 | UF-10 | — | SRS-5.1zzzzzzz19 | TS-BAN-NHAP-02 |
| — | UF-04, UF-10 | — | SRS-5.1zzzzzzz20 | — |
| FR-177, FR-214 | UF-10 | — | SRS-5.1zzzzzzz21 | TS-BAN-NHAP-02 |
| FR-177 | UF-10 | — | SRS-5.1zzzzzzz22 | TS-SELLER-SCRIPT |
| FR-183 | UF-10 | — | SRS-5.1zzzzzzz23 | — |
| FR-181, FR-177 | UF-10 | — | SRS-5.1zzzzzzz24, SRS-5.1zzzzzzz9 | — |
| NFR-17, FR-177, FR-181 | UF-10 | — | SRS-5.1zzzzzzz25 | TS-BAN-NHAP-02 |
| FR-177, FR-183, FR-162 | UF-10 | — | SRS-5.1zzzzzzz26 | TS-BAN-NHAP-02 |
| FR-162 | UF-04, UF-10 | — | SRS-5.1zzzzzzz27 | — |
| FR-177, FR-178, FR-181 | UF-10 | — | SRS-5.1zzzzzzz28 | TS-SELLER-SCRIPT |
| FR-175, FR-157 | UF-04, UF-10 | — | SRS-5.1zzzzzzz29 | — |
| FR-175, FR-157 | UF-04, UF-10 | — | SRS-5.1zzzzzzz30 | — |
| FR-175, FR-157 | UF-04, UF-10 | — | SRS-5.1zzzzzzz31 | — |
| FR-175, FR-157 | UF-04, UF-10 | — | SRS-5.1zzzzzzz32 | — |
| FR-152 | — | — | SRS-5.1zzzzzzz33 | — |
| FR-211, FR-212 | — | — | SRS-5.1zzzzzzz34 | — |
| FR-114, FR-196 | UF-09 | — | SRS-5.1zzzzzzz35 | — |
| FR-114, FR-143 | UF-09 | — | SRS-5.1zzzzzzz36 | — |
| FR-162 | UF-04 | — | SRS-5.1zzzzzzz37 | — |
| FR-177 | UF-10 | — | SRS-5.1zzzzzzz38 | — |
| FR-212, FR-177 | UF-04, UF-10 | — | SRS-5.1zzzzzzz39 | — |
| FR-212 | UF-09 | — | SRS-5.1zzzzzzz40 | — |
| FR-177, FR-212 | UF-10 | — | SRS-5.1zzzzzzz41 | — |
| FR-211, FR-212 | — | — | SRS-5.1zzzzzzz42 | — |
| FR-212, FR-177 | UF-10 | — | SRS-5.1zzzzzzz43 | — |
| FR-104, FR-177 | UF-10 | — | SRS-5.1zzzzzzz44 | — |
| FR-104, FR-117 | UF-01 | — | SRS-5.1zzzzzzz45 | — |
| FR-180 | — | — | SRS-5.1zzzzzzz46 | — |
| FR-177 | UF-10 | — | SRS-5.1zzzzzzz47 | — |
| FR-212 | — | — | SRS-5.1zzzzzzz48 | — |
| FR-192 | — | — | SRS-5.1zzzzzzz49 | — |
| FR-185 | UF-10 | — | SRS-5.1zzzzzzz50 | — |
| FR-177 | UF-10 | — | SRS-5.1zzzzzzz51 | — |
| FR-177 | UF-10 | — | SRS-5.1zzzzzzz52 | — |
| FR-192 | — | — | SRS-5.1zzzzzzz53 | — |
| FR-178, FR-142 | UF-10 | — | SRS-5.1zzzzzzz54 | — |
| FR-177, FR-114 | UF-10 | — | SRS-5.1zzzzzzz55 | — |
| FR-165, FR-111, FR-192 | UF-10 | — | SRS-5.1zzzzzzz56 | — |
| FR-165 | — | — | SRS-5.1zzzzzzz57 | — |
| FR-165 | — | — | SRS-5.1zzzzzzz58 | — |
| FR-165 | — | — | SRS-5.1zzzzzzz59 | — |
| FR-212 | — | — | SRS-5.1zzzzzzz60 | — |
| FR-212 | — | — | SRS-5.1zzzzzzz61 | — |
| FR-212 | — | — | SRS-5.1zzzzzzz62 | — |
| FR-139 | — | — | SRS-5.1zzzzzzz63 | — |
| FR-177 | — | — | SRS-5.1zzzzzzz64 | — |
| FR-172 | — | — | SRS-5.1zzzzzzz65 | — |
| FR-172 | — | — | SRS-5.1zzzzzzz66 | — |
| FR-172 | — | — | SRS-5.1zzzzzzz67 | — |
| FR-186 | — | — | SRS-5.1zzzzzzz68 | — |
| FR-172 | — | — | SRS-5.1zzzzzzz69 | — |
| FR-173 | — | — | SRS-5.1zzzzzzz70 | — |
| FR-173 | — | — | SRS-5.1zzzzzzz71 | — |
| FR-175 | — | — | SRS-5.1zzzzzzz72 | — |
| FR-177 | — | — | SRS-5.1zzzzzzz73 | — |
| FR-186 | — | — | SRS-5.1zzzzzzz74 | — |
| FR-178 | — | — | SRS-5.1zzzzzzz75 | — |
| FR-177 | — | — | SRS-5.1zzzzzzz76 | — |
| FR-173 | — | — | SRS-5.1zzzzzzz77 | — |
| FR-177 | — | — | SRS-5.1zzzzzzz78 | — |
| FR-177 | — | — | SRS-5.1zzzzzzz79 | — |
| FR-177 | — | — | SRS-5.1zzzzzzz80 | — |
| FR-177 | — | — | SRS-5.1zzzzzzz81 | — |
| FR-152 | — | — | SRS-5.1zzzzzzz82 | — |
| FR-152 | — | — | SRS-5.1zzzzzzz83, SRS-5.1zzzzzzz84, SRS-5.1zzzzzzz85, SRS-5.1zzzzzzz86, SRS-5.1zzzzzzz87, SRS-5.1zzzzzzz88, SRS-5.1zzzzzzz89, SRS-5.1zzzzzzz90, SRS-5.1zzzzzzz91, SRS-5.1zzzzzzz92, SRS-5.1zzzzzzz93, SRS-5.1zzzzzzz94, SRS-5.1zzzzzzz95, SRS-5.1zzzzzzz96, SRS-5.1zzzzzzz97, SRS-5.1zzzzzzz98, SRS-5.1zzzzzzz99, SRS-5.1zzzzzzz100, SRS-5.1zzzzzzz101, SRS-5.1zzzzzzz102, SRS-5.1zzzzzzz103, SRS-5.1zzzzzzz104, SRS-5.1zzzzzzz105, SRS-5.1zzzzzzz106, SRS-5.1zzzzzzz107, SRS-5.1zzzzzzz108, SRS-5.1zzzzzzz109, SRS-5.1zzzzzzz110, SRS-5.1zzzzzzz111, SRS-5.1zzzzzzz112, SRS-5.1zzzzzzz113, SRS-5.1zzzzzzz114, SRS-5.1zzzzzzz115, SRS-5.1zzzzzzz116, SRS-5.1zzzzzzz117, SRS-5.1zzzzzzz118, SRS-5.1zzzzzzz119, SRS-5.1zzzzzzz120, SRS-5.1zzzzzzz121, SRS-5.1zzzzzzz122, SRS-5.1zzzzzzz123, SRS-5.1zzzzzzz124, SRS-5.1zzzzzzz125, SRS-5.1zzzzzzz126, SRS-5.1zzzzzzz127, SRS-5.1zzzzzzz128, SRS-5.1zzzzzzz129, SRS-5.1zzzzzzz130, SRS-5.1zzzzzzz131, SRS-5.1zzzzzzz132, SRS-5.1zzzzzzz133, SRS-5.1zzzzzzz134, SRS-5.1zzzzzzz135, SRS-5.1zzzzzzz136, SRS-5.1zzzzzzz137, SRS-5.1zzzzzzz138, SRS-5.1zzzzzzz139, SRS-5.1zzzzzzz141, SRS-5.1zzzzzzz145, SRS-5.1zzzzzzz144, SRS-5.1zzzzzzz143, SRS-5.1zzzzzzz142, SRS-5.1zzzzzzz140, SRS-5.1zzzzzzz146, SRS-5.1zzzzzzz147, SRS-5.1zzzzzzz148, SRS-5.1zzzzzzz149, SRS-5.1zzzzzzz150, SRS-5.1zzzzzzz151, SRS-5.1zzzzzzz152, SRS-5.1zzzzzzz153, SRS-5.1zzzzzzz154, SRS-5.1zzzzzzz155, SRS-5.1zzzzzzz156, SRS-5.1zzzzzzz157, SRS-5.1zzzzzzz158, SRS-5.1zzzzzzz159, SRS-5.1zzzzzzz160, SRS-5.1zzzzzzz161, SRS-5.1zzzzzzz162, SRS-5.1zzzzzzz163, SRS-5.1zzzzzzz164, SRS-5.1zzzzzzz165, SRS-5.1zzzzzzz166, SRS-5.1zzzzzzz167, SRS-5.1zzzzzzz168, SRS-5.1zzzzzzz169, SRS-5.1zzzzzzz170, SRS-5.1zzzzzzz171, SRS-5.1zzzzzzz172, SRS-5.1zzzzzzz173, SRS-5.1zzzzzzz174, SRS-5.1zzzzzzz175, SRS-5.1zzzzzzz176, SRS-5.1zzzzzzz177, SRS-5.1zzzzzzz178, SRS-5.1zzzzzzz179, SRS-5.1zzzzzzz180 | — |
| FR-181 | UF-04, UF-10 | — | SRS-5.1zzzzzzz181 | — |
| FR-181 | UF-04, UF-10 | — | SRS-5.1zzzzzzz182 | — |
| FR-181 | UF-04, UF-10 | — | SRS-5.1zzzzzzz183 | — |
| FR-173 | UF-04, UF-10 | — | SRS-5.1zzzzzzz184, SRS-5.1zzzzzzz185, SRS-5.1zzzzzzz186, SRS-5.1zzzzzzz187, SRS-5.1zzzzzzz188, SRS-5.1zzzzzzz189, SRS-5.1zzzzzzz190, SRS-5.1zzzzzzz191, SRS-5.1zzzzzzz192, SRS-5.1zzzzzzz193, SRS-5.1zzzzzzz194, SRS-5.1zzzzzzz195, SRS-5.1zzzzzzz196, SRS-5.1zzzzzzz197, SRS-5.1zzzzzzz198, SRS-5.1zzzzzzz199, SRS-5.1zzzzzzz200, SRS-5.1zzzzzzz201, SRS-5.1zzzzzzz202, SRS-5.1zzzzzzz203, SRS-5.1zzzzzzz204, SRS-5.1zzzzzzz205, SRS-203 | — |
| FR-178 | UF-04, UF-10 | — | SRS-5.1zzzzm, SRS-5.1zzzzo, SRS-5.1zzzzp, SRS-5.1zzzzq, SRS-5.1zzzzr, SRS-5.1zzzzt, SRS-5.1zzzzu, SRS-5.1zzzzv, SRS-5.1zzzzw, SRS-5.1zzzzx, SRS-5.1zzzzy, SRS-5.1zzzzz, SRS-5.1zzzzzb, SRS-5.1zzzzzc, SRS-5.1zzzzzd, SRS-5.1zzzzze, SRS-5.1zzzzzf, SRS-5.1zzzzzg, SRS-5.1zzzzzh, SRS-5.1zzzzzi, SRS-5.1zzzzzl, SRS-5.1zzzzzm, SRS-5.1zzzzzn, SRS-5.1zzzzzo, SRS-5.1zzzzzp | TS-GIONG-08, TS-MO-PHONG-01, TS-PHAT-LAI-01, TS-BAN-NHAP-02, TS-HIEN-TRANG-01, TS-PHI-KE-01 |
| FR-179 [deprecated 28/10/2026] | UF-10 | — | — | — |
| FR-180 | UF-10, UF-04 | — | — | — |
| FR-181 | UF-04, UF-10 | — | — | — |
| FR-182 | — | — | — | — |
| FR-183 | UF-10 | — | — | — |
| FR-184 | UF-10, UF-13 | — | — | — |
| FR-185 | UF-10 | — | — | — |
| FR-186 | UF-10 | — | — | — |
| FR-188 | UF-10, UF-04 | — | — | — |
| FR-189 | UF-10, UF-04 | — | — | — |
| FR-190 [deprecated 28/10/2026] | UF-11 | — | — | — |
| FR-191 | UF-10 | — | — | — |
| FR-192 | UF-11 | WF-13 | — | TS-QUOTA-04 |
| FR-193 | UF-04 | — | — | — |
| FR-194 | UF-04 | — | SRS-5.1zzzzo | — |
| FR-177 | UF-10 | — | SRS-5.1zzzzzzz252, SRS-5.1zzzzzzz253, SRS-5.1zzzzzzz254, SRS-5.1zzzzzzz255, SRS-5.1zzzzzzz256, SRS-5.1zzzzzzz257, SRS-5.1zzzzzzz258, SRS-5.1zzzzzzz259, SRS-5.1zzzzzzz260, SRS-5.1zzzzzzz261, SRS-5.1zzzzzzz262, SRS-5.1zzzzzzz263, SRS-5.1zzzzzzz264, SRS-5.1zzzzzzz265, SRS-5.1zzzzzzz266, SRS-5.1zzzzzzz267, SRS-5.1zzzzzzz268, SRS-5.1zzzzzzz269, SRS-5.1zzzzzzz270, SRS-5.1zzzzzzz271, SRS-5.1zzzzzzz272, SRS-5.1zzzzzzz273, SRS-5.1zzzzzzz274, SRS-5.1zzzzzzz276, SRS-5.1zzzzzzz277, SRS-5.1zzzzzzz278, SRS-5.1zzzzzzz279, SRS-5.1zzzzzzz280, SRS-5.1zzzzzzz281, SRS-5.1zzzzzzz282, SRS-5.1zzzzzzz283, SRS-5.1zzzzzzz284, SRS-5.1zzzzzzz285, SRS-5.1zzzzzzz286, SRS-5.1zzzzzzz287, SRS-5.1zzzzzzz288, SRS-5.1zzzzzzz289, SRS-5.1zzzzzzz290, SRS-5.1zzzzzzz291, SRS-5.1zzzzzzz292, SRS-5.1zzzzzzz293, SRS-5.1zzzzzzz294, SRS-5.1zzzzzzz295, SRS-5.1zzzzzzz296 | — |
| FR-195 | UF-04 | — | SRS-5.1zzzzzzz250 | — |
| FR-195 | UF-04 | — | SRS-5.1zzzzzzz249 | — |
| FR-195 | UF-04 | WF-13 | — | — |
| FR-196 | UF-06 | — | — | — |
| FR-197 | UF-11 | WF-13 | — | — |
| FR-198 | UF-04 | — | — | — |
| FR-199 | UF-04 | — | — | — |
| FR-200 [deprecated 28/10/2026] | UF-11 | WF-13 | — | — |
| FR-201 | UF-11 | WF-13 | — | — |
| FR-202 | UF-06 | — | — | — |
| FR-203 | UF-11 | — | SRS-5.1zzzzs | — |
| FR-204 | UF-04 | — | — | TS-GAN-01 |
| FR-205 | UF-04, UF-05, UF-10 | WF-05 | — | — |
| FR-206 | UF-02 | WF-04 | SRS-5.1zzzzzr, SRS-5.1zzzzzu | — |
| FR-207 [deprecated 28/10/2026] | UF-02, UF-04 | — | SRS-5.1zzzzo | — |
| FR-207 [deprecated 28/10/2026] | UF-10 | — | — | TS-BLDL-01 |
| FR-207 [deprecated 28/10/2026] | UF-02, UF-04 | — | SRS-5.1zzzzn | TS-BLDL-05 |
| FR-208 | UF-02 | — | SRS-5.1zzzzzr | TS-BAN-26 |
| FR-208 | UF-02 | — | — | TS-BAN-25 |
| FR-208 | UF-02 | — | — | TS-BAN-24 |
| FR-175 | UF-12 | — | — | — |
| FR-210 | UF-11 | WF-13 | — | TS-XOAHET-01 |
| FR-211 | UF-02, UF-04, UF-05 | WF-04, WF-06 | — | TS-NHAN-01, TS-NHAN-02, TS-VAN-10 |
| FR-212 | UF-02, UF-04 | — | — | TS-DUONG-01 |
| FR-213 | UF-01, UF-03 | — | — | TS-GIONG-07 |
| FR-214 | UF-01, UF-10 | — | — | TS-MOT-NGUOI-01, TS-MOT-NGUOI-02, TS-MOT-NGUOI-03 |
| FR-215 [deprecated 28/10/2026] | UF-10 | — | — | — |
| FR-216 | UF-04, UF-05 | — | — | TS-RAG-01, TS-RAG-04, TS-RAG-05, TS-RAG-06 |
| FR-217 [deprecated 28/10/2026] | UF-02, UF-04 | — | — | TS-JSON-01 |
| FR-218 | UF-01, UF-02, UF-04 | — | — | TS-XINLOI-01, TS-DUACAN-01 |
| FR-219 | UF-02 | — | — | TS-THUTU-01 |
| FR-220 | UF-02 | — | — | TS-TANGPHU-01 |
| FR-221 | UF-02 | — | — | TS-ANHDANG-01 |
| FR-222 | UF-02 | — | — | TS-BAN-27 |
| FR-223 | UF-02 | — | — | TS-RENHANH-01 |
| FR-224 | UF-02 | — | — | TS-TRALOI-01 |
| FR-225 | UF-02 | — | — | TS-NOHAU-01 |
| FR-226 | UF-02 | — | — | TS-GOP-01 |
| FR-227 | UF-02 | — | — | TS-HEM3M-01 |
| FR-228 | UF-04 | — | — | TS-TUVAN-01 |
| FR-229 | UF-05 | — | — | TS-PHAPLY-01 |
| FR-230 [deprecated 28/10/2026] | UF-04, UF-05 | — | — | TS-CHAO-01 |
| FR-231 | UF-05 | — | — | TS-ZALO-2709 |
| FR-232 | UF-05 | — | — | TS-PHAPLY-02 |
| FR-233 | UF-05 | — | — | TS-HOILAI-01 |
| FR-234 | UF-05 | — | — | TS-HOILAI-02 |
| FR-235 | UF-05 | — | — | TS-HOILAI-03 |
| FR-236 | UF-05 | — | — | TS-HOILAI-04 |
| FR-237 | UF-05 | — | — | TS-HOILAI-05 |
| FR-238 | UF-05 | — | — | TS-HOILAI-06 |
| FR-239 | UF-05 | — | — | TS-HOILAI-07 |
| FR-240 | UF-05 | — | — | TS-HOILAI-08 |
| FR-241 | UF-05 | — | — | TS-HOILAI-09 |
| FR-242 | UF-05 | — | — | TS-HOILAI-10 |
| FR-243 | UF-05 | — | SRS-5.1zzzzzq, SRS-5.1zzzzzs | TS-HOILAI-11 |
| FR-244 | UF-05 | — | — | TS-HOILAI-12 |
| FR-245 | UF-05 | — | — | TS-DULIEU-01 |
| FR-246 | UF-04, UF-05 | — | — | TS-BANTHU-01, TS-BANTHU-02 |
| FR-247 | UF-04, UF-05 | — | — | TS-BANTHU-03 |
| FR-248 | UF-04, UF-05 | — | — | TS-BANTHU-04 |
| FR-249 | UF-04 | — | — | TS-BANTHU-05 |
| FR-250 | UF-10, UF-05 | — | SRS-5.1zzzzzt | TS-BANTHU-06 |
| FR-209 | UF-02, UF-04 | — | SRS-5.1zzzzl | TS-PHUONG-01 |
| FR-208 | UF-02, UF-05 | — | — | — |
| FR-187 | UF-10 | — | — | — |
| FR-97 | — | — | — | — |
| — | — | — | SRS-5.1zzzzzzz211 | — |
| — | — | — | SRS-5.1zzzzzzz212 | — |
| — | — | — | SRS-5.1zzzzzzz213 | — |
| — | — | — | SRS-5.1zzzzzzz214 | — |
| — | — | — | SRS-5.1zzzzzzz215 | — |
| FR-141 | — | — | SRS-5.1zzzzzzz216 | — |
| — | — | — | SRS-5.1zzzzzzz217 | — |
| — | — | — | SRS-5.1zzzzzzz218 | — |
| — | — | — | SRS-5.1zzzzzzz219 | — |
| — | — | — | SRS-5.1zzzzzzz220 | — |
| — | — | — | SRS-5.1zzzzzzz221 | — |
| — | — | — | SRS-5.1zzzzzzz222 | — |
| — | — | — | SRS-5.1zzzzzzz223 | — |
| — | — | — | SRS-5.1zzzzzzz224 | — |
| — | — | — | SRS-5.1zzzzzzz225 | — |
| — | — | — | SRS-5.1zzzzzzz226 | — |
| FR-163 | — | — | SRS-5.1zzzzzzz227, SRS-5.1zzzzzzz275 | — |
| — | — | — | SRS-5.1zzzzzzz228 | — |
| — | — | — | SRS-5.1zzzzzzz229 | — |
| — | — | — | SRS-5.1zzzzzzz230 | — |
| — | — | — | SRS-5.1zzzzzzz231 | — |
| — | — | — | SRS-5.1zzzzzzz232 | — |
| — | — | — | SRS-5.1zzzzzzz233 | — |
| — | — | — | SRS-5.1zzzzzzz234 | — |
| — | — | — | SRS-5.1zzzzzzz235 | — |
| — | — | — | SRS-5.1zzzzzzz236 | — |
| — | — | — | SRS-5.1zzzzzzz237 | — |
| FR-63, FR-140 | — | — | SRS-5.1zzzzzzz238 | — |
| — | — | — | SRS-5.1zzzzzzz239 | — |
| FR-160, FR-155, FR-63 | — | — | SRS-5.1zzzzzzz240 | — |
| FR-164, FR-165, FR-150, FR-177, FR-105 | — | — | SRS-5.1zzzzzzz241 | — |
| — | — | — | SRS-5.1zzzzzzz242 | — |
| — | — | — | SRS-5.1zzzzzzz243 | — |
| — | — | — | SRS-5.1zzzzzzz244 | — |

## 8.4 Rủi ro → biện pháp

| RSK | Biện pháp trong đặc tả |
|---|---|
| RSK-01 | FR-63, SRS-5.3 `zalo_keepalive`, UF-08, AC-06 |
| RSK-02 | NFR-12, SRS-2.1 (tầng messaging tách rời) |
| RSK-03 | FR-40, UI-C05, SRS-5.1 bất biến I3, §6.8 quy tắc 4 |
| RSK-04 | Thứ tự phát hành SRS-8 (P1 trước P2) |
| RSK-05 | UF-06 nhánh lỗi, SRS-5.2 xếp hạng |
| RSK-06 | `last_verified_at`, SRS-5.3 `stale_listing_check`, WF-03 |
| RSK-07 | NFR-06, SRS-3.9, §6.7 |

## 8.6 NFR → hiện thực → cách nghiệm thu

Chỉ liệt NFR **đã có hiện thực trong code**; NFR còn là mục tiêu nằm ở `07 §6`.

| NFR | Hiện thực ở | Nghiệm thu |
|---|---|---|
| NFR-01 (bot trả lời < 3 s p95) | Số vòng DB đo bằng e2e (FR-171); view `bot_do_tre` p50/p95 7 ngày (`20260904f`) | TS-TOIUU; thẻ `/admin` |
| NFR-04 (tin nhắn không mất khi một bên offline) | FR-166: `inbound_events` + `inbound_ledger` + `inbound-sweep` mỗi phút + `lan_thu_ke()` | TS-JOB, TS-IDEM2 |
| NFR-06 (giấy tờ không lộ) | bucket `listing-private` + CHECK giấy tờ phải bucket riêng + RLS lọc anon (FR-165/167); admin xem qua `createSignedUrl` 15' (`20260904g`) | TS-KHO-20…25, TS-WEB2 |
| NFR-16 (free-tier trước) | Supabase Free + Vercel Hobby; quyết định giữ nguyên 27/08 (OPEN-25) | **Không còn sao lưu** (chủ dự án bỏ 11/09/2026, OPEN-25). Ràng buộc cũ "chạy `sao-luu.mjs` định kỳ" đã gỡ cùng `phuc-hoi.mjs`, `soat-phuc-hoi.mjs`, `xuat-onedrive.mjs`, TS-SAOLUU, TS-PHUCHOI, CI job `saoluu`/`phuchoi` và `docs/12`. Supabase gói Free không tự sao lưu — mất dữ liệu là không lấy lại được. Còn lại `bot/supabase/schema.sql` (chỉ DDL, sinh từ `xuat_schema()`) để dựng lại một DB rỗng |
| NFR-17 (trang tin phải trong cache) | `generateStaticParams()` ở `app/nha-dat/[code]/page.tsx`; `unstable_cache` bọc truy vấn trong `components/ListingBrowse.tsx` và `lib/photos.ts`; SRS-3.13 | TS-CACHE-01…05 |
| NFR-18 (xanh phải là xanh thật) | `bot_health_tick()` quét `net._http_response` → `bot_errors`; `log_loi()` + `ghiLoi()` cho lỗi trả-200; SRS-3.12 | TS-HEALTH-01…06, TS-LOG-01…06 |
| NFR-09 (SEO) | `app/sitemap.ts`, `app/robots.ts`, `metadataBase`/canonical/OpenGraph ở `app/layout.tsx` + trang tin + `app/[tag]`, JSON-LD `RealEstateListing` ở `app/nha-dat/[code]/page.tsx`, `lib/tags.ts` (64 tag — chờ TOP-100 OPEN-06) | TS-SEO-01…06 |

---

## 8.5 FR chưa có đặc tả kỹ thuật đầy đủ

| FR | Thiếu gì | Theo dõi ở |
|---|---|---|
| FR-99 (định giá so sánh) | Thuật toán, nguồn dữ liệu giá thị trường | `OPEN-10` |
| FR-102 (chấm điểm NMG) [deprecated → FR-137] | Ngưỡng cảnh báo khi NMG dưới chuẩn (OPEN-12). Phần trùng lặp đã xử lý: `rate-ctv` + `ratings` xoá 27/08/2026 | `OPEN-12` |
| FR-28 (tiện ích quanh BĐS) | Nguồn dữ liệu POI (Google Places? tự nhập?) | `OPEN-13` |
| FR-16 (fingerprint) | Thư viện, chính sách lưu trữ, cơ chế từ chối | `OPEN-14` |
| FR-118 (`ward_mapping`) | Nguồn dữ liệu máy-đọc-được danh mục phường cũ↔mới (NQ 202/2025/QH15), schema bảng trong SRS | — |
