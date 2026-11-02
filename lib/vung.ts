// Vùng nhận tin MỘT NGUỒN phía web (SRS-5.1zzzzzzz334). Gốc ở lõi Python `src/aioi/prompts.py` `VUNG_NHAN_TIN`; web không đọc được Python
// nên giữ bản sao này — `tests/test_vung_mot_nguon_334.py` đối chiếu hai bên (lệch là đỏ). `tinh` = giá trị cột `projects.province` trong DB
// (chữ do bộ nạp dự án ghi, "Bà Rịa - Vũng Tàu" gạch nối thường), `nhan` = chữ hiện ra người xem. Đổi vùng: sửa prompts.py VÀ file này.
export const VUNG_NHAN_TIN: readonly { tinh: string; nhan: string }[] = [
  { tinh: "Hồ Chí Minh", nhan: "TP. Hồ Chí Minh" },
  { tinh: "Bình Dương", nhan: "Bình Dương" },
  { tinh: "Bà Rịa - Vũng Tàu", nhan: "Bà Rịa – Vũng Tàu" },
  { tinh: "Long An", nhan: "Long An" },
  { tinh: "Tây Ninh", nhan: "Tây Ninh" },
  { tinh: "Đồng Nai", nhan: "Đồng Nai" },
];

export const TEN_VUNG = VUNG_NHAN_TIN.map((v) => v.nhan).join(", ");
