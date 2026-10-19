// Khối "Đã xác minh với chủ nhà" trên trang tin (19/10/2026, SRS-5.1zzzzzzz65): đọc thẳng `listings.boc_tach` — ô lõi Python bóc từ lời
// chủ nhà — thay cho bảng `listing_facts` (chỉ bot TypeScript đã gỡ ghi). DANH SÁCH TRẮNG: chỉ những ô này mới in ra web; ô địa chỉ /
// giá / dự án / lý do bán không bao giờ in (số nhà, chuyện riêng). Khoá phải có trong `FIELD_LABELS` của `src/aioi/prompts.py`
// (tests/test_xac_minh_web.py đỏ khi lệch); nhãn ở đây là nhãn ngắn cho người mua đọc. Ô đã có hàng riêng trong bảng thông số (diện tích, kết cấu, phòng, đường vào, pháp lý)
// không lặp ở đây.
export const O_XAC_MINH: ReadonlyArray<readonly [string, string]> = [
  ["tinh_trang_ban_giao", "Bàn giao"],
  ["hien_trang_su_dung", "Hiện trạng"],
  ["the_chap", "Thế chấp ngân hàng"],
  ["thuong_luong", "Thương lượng"],
  ["quy_hoach", "Quy hoạch"],
  ["chi_tieu_xay_dung", "Chỉ tiêu xây dựng"],
  ["yeu_to_ha_tang", "Hạ tầng (cột điện, hố ga)"],
  ["tho_cu", "Đất thổ cư"],
  ["lo_gioi_duong", "Lộ giới đường trước đất"],
  ["thoi_han_su_dung", "Thời hạn sử dụng đất"],
  ["tang_toa", "Tầng & tòa"],
  ["ban_cong_view", "Ban công & view"],
  ["noi_that", "Nội thất"],
  ["phi_quan_ly", "Phí quản lý dịch vụ"],
  ["can_goc", "Căn góc"],
  ["phi_gui_xe", "Phí gửi xe"],
  ["chu_dau_tu_phan_khu", "Chủ đầu tư và phân khu dự án"],
  ["tien_do_xay_dung", "Tiến độ thi công xây dựng"],
  ["chinh_sach_thanh_toan", "Thanh toán & ưu đãi"],
  ["phap_ly_du_an", "Pháp lý dự án"],
  ["thoi_gian_ban_giao", "Thời gian dự kiến bàn giao"],
  ["chiet_khau", "Chiết khấu"],
  ["phi_chuyen_nhuong", "Phí chuyển nhượng hợp đồng"],
  ["chieu_cao_tran", "Chiều cao trần"],
  ["tai_trong_san", "Tải trọng sàn"],
  ["tram_bien_ap", "Trạm biến áp"],
  ["tieu_chuan_container", "Tiêu chuẩn container"],
  ["pccc", "PCCC"],
  ["mat_tien", "Bề ngang mặt tiền"],
  ["loi_di", "Lối đi"],
  ["vi_he_xe", "Vỉa hè & chỗ để xe"],
  ["nganh_nghe", "Ngành nghề kinh doanh"],
  ["dien_tich_trang_thiet_bi", "Trang thiết bị sẵn có"],
  ["dien_nuoc_kd", "Điện nước kinh doanh"],
  ["so_phong", "Số phòng / căn hộ"],
  ["thang_may", "Thang máy"],
  ["gia_dien_nuoc", "Giá điện nước, dịch vụ"],
  ["gio_giac", "Giờ giấc"],
  ["tien_ich_phong", "Tiện ích phòng"],
  ["thoi_han_hd", "Thời hạn hợp đồng"],
  ["muc_coc", "Mức cọc"],
  ["truot_gia", "Trượt giá"],
  ["thoi_gian_fitout", "Thời gian fit-out"],
];

export function dongXacMinh(boc: unknown): Array<{ nhan: string; giaTri: string }> {
  if (!boc || typeof boc !== "object") return [];
  const o = boc as Record<string, unknown>;
  const ra: Array<{ nhan: string; giaTri: string }> = [];
  for (const [k, nhan] of O_XAC_MINH) {
    const v = o[k];
    if ((typeof v === "string" && v.trim()) || typeof v === "number") ra.push({ nhan, giaTri: String(v).trim() });
  }
  return ra;
}
