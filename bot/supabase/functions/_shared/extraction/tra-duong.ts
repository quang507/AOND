// tra-duong.ts — FR-212 (21/09/2026): TỪ ĐIỂN TÊN ĐƯỜNG — chọn kết quả tra `tim_duong()`.
//
// Chủ dự án 21/09: "giờ khách viết tên đường ko dấu hoặc sai 1 vài kí tự nhận ra dc
// ko" → "ok làm bảng duong đi, hẻm bỏ". Bảng `duong` (OSM, theo phường mới) nằm trong
// DB; RPC `tim_duong(p_ten, p_quan)` trả các tên khớp đúng / khớp gần (Levenshtein ≤ 2
// trên chữ bỏ dấu). File này THUẦN (không RPC, không fetch — bot/tests/ranh-gioi.mjs
// canh): quyết định từ danh sách ứng viên, thay tên trong địa chỉ, soạn câu hỏi.
//
// Ba kết quả, theo mức chắc:
//   sua  — khớp ĐÚNG sau bỏ dấu, một tên duy nhất (hoặc duy nhất trong quận đã biết):
//          viết lại theo từ điển, không hỏi — cùng chữ cái, chỉ thêm dấu / sửa hoa thường
//          ("pham the hien" → "Phạm Thế Hiển"). Đúng luật FR-208 h: không đổi chữ cái.
//   hoi  — khớp GẦN (1–2 phép sửa), MỘT ứng viên gần nhất, tên khách gõ đủ dài (≥ 6 chữ
//          cái): HỎI XÁC NHẬN rồi mới ghi (RSK-03) — "Đường mình là Phạm Thế Hiển phải
//          không anh?". Hai ứng viên cùng khoảng cách → không đoán.
//   giu  — không khớp / mơ hồ / tên quá ngắn: giữ nguyên chữ khách gõ. Từ điển Bình
//          Dương – Đồng Nai – Long An còn mỏng trên OSM, đường không có trong từ điển
//          KHÔNG có nghĩa là khách gõ sai.

export type UngVienDuong = { ten: string; khoang_cach: number; quan_cu: string[] | null; phuong: string[] | null; tinh: string[] | null };
/**
 * `khop` (SRS-5.1zzzzzy): tên khách gõ KHỚP ĐÚNG ít nhất một tên trong từ điển (khoảng cách 0) — không sửa gì (đã đúng, hoặc hai tên cùng chữ
 * bỏ dấu mà chưa biết quận), nhưng nơi gọi KHÔNG được đi tìm theo nghĩa nữa: 13/10/2026 "Trương Đình Hội" khớp cả "Trương Đình Hợi" (Q4)
 * lẫn "Trương Đình Hội" (Q8), kết quả `giu` trơn rơi xuống tìm theo nghĩa, ra gợi ý "Trương Định", khách gật → đường sai.
 */
export type KetQuaDuong = { loai: "giu"; khop?: boolean } | { loai: "sua"; ten: string } | { loai: "hoi"; ten: string };
export type GoiYDuong = { goc: string; ten: string; vi_tri: string };

const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
const khoa = (s: string): string => boDau(s).toLowerCase().replace(/\s+/g, " ").trim();
const soChuCai = (s: string): number => (boDau(s).match(/[a-z]/gi) ?? []).length;

/** Chọn kết quả từ danh sách `tim_duong` trả về cho tên khách gõ (`goc`, đã qua chuanTenDuong). */
export function chonDuong(goc: string, ungVien: UngVienDuong[] | null | undefined, quan?: string | null, phuong?: string | null): KetQuaDuong {
  const k = khoa(goc);
  const ds = (ungVien ?? []).filter((u) => u && typeof u.ten === "string" && Number.isFinite(u.khoang_cach));
  if (!ds.length || k.length < 4) return { loai: "giu" };
  const trongQuan = (u: UngVienDuong) => !!quan && (u.quan_cu ?? []).includes(quan);
  const trongPhuong = (u: UngVienDuong) => !!phuong && (u.phuong ?? []).includes(phuong);
  // Khớp ĐÚNG (khoảng cách 0): chỉ khác dấu / hoa thường.
  const dung = ds.filter((u) => u.khoang_cach === 0 && khoa(u.ten) === k);
  if (dung.length) {
    // Khách gõ ĐÚNG Y một tên trong từ điển (có dấu) → tên đó là tên đúng, kể cả khi có tên khác cùng chữ bỏ dấu (Hội / Hợi).
    if (dung.some((u) => u.ten === goc.trim())) return { loai: "giu", khop: true };
    const chon = dung.length === 1 ? dung[0] : (dung.filter(trongQuan).length === 1 ? dung.find(trongQuan)! : null);
    if (!chon) return { loai: "giu", khop: true };
    return { loai: "sua", ten: chon.ten };
  }
  // Khớp GẦN: tên đủ dài, ứng viên gần nhất là duy nhất (hoặc duy nhất trong quận đã biết).
  if (soChuCai(goc) < 6) return { loai: "giu" };
  const gan = ds.filter((u) => u.khoang_cach >= 1 && u.khoang_cach <= 2).sort((a, b) => a.khoang_cach - b.khoang_cach);
  if (!gan.length) return { loai: "giu" };
  const tot = gan.filter((u) => u.khoang_cach === gan[0].khoang_cach);
  // Lệch quá 1 phép sửa mà chuỗi ngắn (6–7 chữ cái) thì thôi — "Le Lai" ↔ "Le Loi" là hai đường khác.
  if (gan[0].khoang_cach === 2 && soChuCai(goc) < 9) return { loai: "giu" };
  const chon = tot.length === 1 ? tot[0] : (tot.filter(trongQuan).length === 1 ? tot.find(trongQuan)! : null);
  if (!chon) return { loai: "giu" };
  // 30/09/2026 (chủ dự án: "sau khi người ta nhắc tới gần đúng sẽ biết cái nào đúng và sửa vào, kết hợp với vị trí"):
  // gõ gần đúng MÀ con đường đó có thật trong phường / quận đã biết của căn nhà → vị trí xác nhận, sửa luôn. Không có
  // vị trí nào để đối chiếu → vẫn hỏi như FR-212.
  return trongPhuong(chon) || trongQuan(chon) ? { loai: "sua", ten: chon.ten } : { loai: "hoi", ten: chon.ten };
}

/**
 * Con đường THỨ HAI khách nhắc kèm để chỉ chỗ (30/09/2026, chủ dự án: "kết hợp với vị trí nữa, để biết đường nào gần
 * đường nào"): "hẻm Lê Văn Sỹ gần Trần Huy Liệu", "góc Nguyễn Trãi – Trần Hưng Đạo", "ngã tư An Dương Vương giao Trần
 * Bình Trọng", "đầu hẻm ra Phan Huy Ích". Trả tên đường trần (tối đa 5 chữ, dừng trước phường / quận / dấu câu / số),
 * hoặc null. `duongChinh` (nếu biết) không được trả lại chính nó.
 */
export function duongNhacKem(text: string | null | undefined, duongChinh?: string | null): string | null {
  const s = (text ?? "").normalize("NFC").replace(/\s+/g, " ");
  const re = /(?:^|[\s,(])(?:gần|gan|góc|goc|giao(?:\s+với)?|ngã\s*(?:tư|ba|4|3)|nga\s*(?:tu|ba)|cạnh|canh|sát|sat|thông\s+ra|ra\s+mặt\s+tiền|đầu\s+hẻm\s+ra|cách)\s+(?:đường\s+|duong\s+|đ\.\s*)?([\p{L}][\p{L}\d]*(?:\s+[\p{L}\d][\p{L}\d]*){0,4})/giu;
  const chinh = khoa(duongChinh ?? "");
  for (const m of s.matchAll(re)) {
    let ten = m[1]
      .split(/\s+(?=(?:phường|phuong|quận|quan|p\.?|q\.?|huyện|huyen|tp|thành phố|nhà|nha|hẻm|hem|giá|gia|diện|dien|khoảng|khoang|chừng|chung|tầm|tam|tầng|tang|mét|met|nha|nhé|nhe|ạ|em|anh|chị|chi|cô|chú|bác)(?![\p{L}]))/iu)[0]
      .replace(/\s+(?:\d+\s*m|\d+)$/u, "").trim()
      // "gần ngã tư An Dương Vương": bỏ chữ chỉ chỗ còn dính đầu.
      .replace(/^(?:(?:ngã\s*(?:tư|ba|4|3)|nga\s*(?:tu|ba)|góc|goc|giao(?:\s+với)?|đường|duong)\s+)+/iu, "");
    // "cách chợ 200m", "gần chợ" — chỉ nhận khi giống TÊN ĐƯỜNG: ≥ 2 chữ, không phải từ chỉ nơi chốn chung.
    if (ten.split(" ").length < 2 && !/^\d/.test(ten)) continue;
    if (/^(?:chợ|cho|trường|truong|bệnh|benh|công viên|cong vien|siêu thị|sieu thi|nhà thờ|nha tho|chùa|chua|ủy ban|uy ban|trung tâm|trung tam|mặt tiền|mat tien|khu|sân bay|san bay)(?![\p{L}])/iu.test(ten)) continue;
    if (chinh && khoa(ten) === chinh) continue;
    return ten;
  }
  return null;
}

/**
 * Chọn phường từ kết quả `phuong_giao_hai_duong` (đã xếp gần trước): một phường → nó; nhiều phường → chỉ nhận phường
 * GẦN NHẤT RÕ RỆT (hai đường cách nhau ≤ 400 m ở đó, và phường kế xa gấp đôi + 200 m trở lên). "Trần Bình Trọng gần
 * An Dương Vương": Chợ Quán ~150 m, Vườn Lài ~1 km → Chợ Quán. Sát nhau → null (hỏi).
 */
export function chonPhuongGanNhat<T extends { cach_m: number }>(ds: T[] | null | undefined): T | null {
  const d = [...(ds ?? [])].filter((x) => Number.isFinite(x?.cach_m)).sort((a, b) => a.cach_m - b.cach_m);
  if (d.length === 1) return d[0];
  if (d.length >= 2 && d[0].cach_m <= 400 && d[1].cach_m >= d[0].cach_m * 2 + 200) return d[0];
  return null;
}

/** Đường số ("đường số 59", "đường 59", "Số 59") → khoá tra bảng `duong` ("duong so 59"); không phải → null. */
export function khoaDuongSo(ten: string | null | undefined): string | null {
  const m = /^\s*(?:đường|duong|đ\.)?\s*(?:số|so)?\s*(\d{1,4}[a-z]?)\s*$/iu.exec(ten ?? "");
  return m ? `duong so ${m[1].toLowerCase()}` : null;
}

/**
 * Cắt TÊN ĐƯỜNG trần từ cụm địa chỉ đã qua tenDuong()/chuanTenDuong(): bỏ "ở/tại (đường)" đứng đầu, dừng
 * trước phường/quận/hẻm/xã/dấu phẩy. "ở đường trần đình trọng quận 5" → "trần đình trọng". Bắn thật 21/09
 * (mau-tdt): câu trả lời địa chỉ dài đi nguyên cụm vào tim_duong nên không khớp gì.
 */
export function catTenDuong(cum: string): string {
  let s = (cum ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:nằm ở|nam o|ở|o|tại|tai)\s+/iu, "").replace(/^(?:đường|duong|đ\.)\s+(?!(?:số|so)?\s*\d)/iu, "");
  const m = /[,;.(]|(?<![\p{L}])(?:phường|phuong|quận|quan|hẻm|hem|hxh|xã|xa(?!\s+l[oộ])|gần|gan|khu|p\.?\s*\d|q\.?\s*\d)(?![\p{L}])/iu.exec(s);
  if (m) s = s.slice(0, m.index);
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Thay tên đường trong địa chỉ khách gõ: "hem 4m pham the hien p4" + ("pham the hien" →
 * "Phạm Thế Hiển") = "hem 4m Phạm Thế Hiển p4". So bỏ dấu, không phân biệt hoa thường;
 * không thấy thì trả nguyên địa chỉ.
 */
export function theTenDuong(viTri: string, goc: string, moi: string): string {
  const vt = (viTri ?? "").normalize("NFC");
  const g = (goc ?? "").normalize("NFC").trim();
  if (!g) return vt;
  const i = boDau(vt).toLowerCase().indexOf(boDau(g).toLowerCase());
  if (i < 0) return vt;
  return vt.slice(0, i) + moi + vt.slice(i + g.length);
}

/** Câu hỏi xác nhận trước khi ghi (mẫu `duong@goi_y` trong cau_hoi_mau, sửa được ở Dashboard). */
export function cauXacNhanDuong(mau: string, cachGoi: string, goc: string, ten: string): string {
  const Ac = cachGoi.charAt(0).toUpperCase() + cachGoi.slice(1);
  return mau.replace(/\{ac\}/g, cachGoi).replace(/\{Ac\}/g, Ac).replace(/\{goc\}/g, goc.trim()).replace(/\{ten\}/g, ten.trim());
}
