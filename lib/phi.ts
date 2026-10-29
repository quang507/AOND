// Mức phí MỘT NGUỒN phía web (SRS-5.1zzzzzzz275). Số gốc ở lõi Python `src/aioi/revenue.py` (SALE_FEE_RATE, RENTAL_FEE_MONTHS) — lõi
// dựng mọi câu phí trong prompt từ đó. Web không đọc được Python nên giữ bản sao này; `tests/test_phi_mot_nguon_275.py` đối chiếu hai bên,
// lệch là đỏ. Đổi phí: sửa revenue.py VÀ file này cùng commit (quyết định tiền / phí là của chủ dự án).
export const PT_CHU = "1%";
export const PT_MG = "0.5%";
export const PHI_THUE = "0.75 tháng tiền thuê";
