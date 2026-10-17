// nhan.ts — NHÃN TÌM KIẾM của một tin (FR-211, 18/09/2026).
//
// Chủ dự án 18/09: "làm cái gắn nhãn để tìm được luôn đi". Ý khách nói mà không có ô
// ("khu này yên tĩnh lắm", "gần chợ Bình Tây", "xe hơi vào tận nhà") từ 18/09 sáng chỉ nằm
// trong ô bổ sung — hiện được, không lọc được. Nay mỗi ý đó thành MỘT NHÃN trong từ điển
// đóng dưới đây, ghi vào `listings.nhan text[]`, lọc bằng `contains` ở web lẫn bot mua.
//
// Luật: từ điển ĐÓNG (thêm nhãn = sửa file này, có test), mỗi nhãn có bộ chữ khớp trên bản
// BỎ DẤU; câu phủ định ("không ngập", "không yên tĩnh") xử ở từng nhãn. Tầng bóc tách: không
// model, không RPC (`bot/tests/ranh-gioi.mjs`). Web (`lib/parse-query.ts`) nhập cùng file này
// qua đường `@/bot/...` — MỘT NGUỒN (CLAUDE.md §6 luật một nguồn).

const boDau = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export type Nhan = {
  /** Tên hiện cho người đọc. */
  ten: string;
  /** Khớp trên bản bỏ dấu, chữ thường. */
  khop: RegExp;
  /** Cụm phủ định đứng trước (≤ 12 ký tự) làm nhãn KHÔNG kích: "không yên tĩnh". */
  phuDinh?: boolean;
  /** Nhãn đối nghịch được kích khi phủ định (vd "không ngập" → khong_ngap, "ngập" → ngap). */
};

/** Từ điển nhãn — khoá là giá trị ghi vào `listings.nhan`. */
export const TU_DIEN_NHAN: Record<string, Nhan> = {
  yen_tinh: { ten: "yên tĩnh", khop: /\b(?:yen tinh|khong on|it xe|vang xe|khu yen|tinh lang)\b/, phuDinh: true },
  an_ninh: { ten: "an ninh", khop: /\b(?:an ninh|bao ve 24|co bao ve|camera|khu biet lap|compound|khu dan cu khep kin)\b/, phuDinh: true },
  dan_tri_cao: { ten: "dân trí cao", khop: /\b(?:dan tri cao|dan tri|khu tri thuc|hang xom hien)\b/ },
  // "chỗ" bỏ dấu cũng là "cho" ("gần chỗ làm"), và "Chợ Rẫy" là tên bệnh viện — loại hai kiểu đó.
  gan_cho: { ten: "gần chợ", khop: /\b(?:gan|sat|canh|ke|ke ben|doi dien) cho(?! (?:lam|o|toi|nay|do|kia|nao|ngoi|dau|de|xe(?! hoi vao)|ban|ray|quan))\b/ },
  gan_truong: { ten: "gần trường học", khop: /\b(?:gan truong|sat truong|canh truong|ke truong|gan dai hoc|gan mam non)\b/ },
  gan_benh_vien: { ten: "gần bệnh viện", khop: /\b(?:gan benh vien|sat benh vien|canh benh vien|gan bv\b|gan phong kham)\b/ },
  gan_sieu_thi: { ten: "gần siêu thị", khop: /\b(?:gan sieu thi|sat sieu thi|gan coop|gan coopmart|gan bach hoa xanh|gan winmart|gan vinmart|gan tttm|gan trung tam thuong mai)\b/ },
  gan_cong_vien: { ten: "gần công viên", khop: /\b(?:gan cong vien|sat cong vien|canh cong vien|doi dien cong vien)\b/ },
  gan_metro: { ten: "gần metro", khop: /\b(?:gan metro|gan ga metro|gan ga tau|canh metro)\b/ },
  gan_trung_tam: { ten: "gần trung tâm", khop: /\b(?:gan trung tam|sat trung tam|ngay trung tam|trung tam quan|gan quan 1|gan q1\b)\b/ },
  // "nhà cũ TIỆN xây mới" / "để xây mới" là lời mời xây lại, không phải nhà mới (bắn thật 18/09).
  moi_sua: { ten: "mới sửa / mới xây", khop: /(?<!\b(?:tien|de|phu hop|thich hop|co the|can|nen|muon)\s)\b(?:moi son|moi sua|moi xay|nha moi|vua sua|vua xay|sua lai moi|xay moi)\b/ },
  // 20/09 (bắn 4 kịch bản mới): miền Bắc nói "ngõ" — "ngõ thông không ngập".
  hem_thong: { ten: "hẻm thông", khop: /\b(?:hem thong|ngo thong|thong ra|hai dau hem|2 dau hem|hai dau ngo)\b/ },
  hem_cut: { ten: "hẻm cụt", khop: /\b(?:hem cut|cuoi hem)\b/ },
  khong_ngap: { ten: "không ngập", khop: /\b(?:khong ngap|ko ngap|chua bao gio ngap|khong bi ngap|khong dong nuoc|cao rao)\b/ },
  // 20/09: khách mua nói "xe hơi vào ĐƯỢC nhà" — cho phép "duoc/toi/tan/trong" giữa "vao" và "nha".
  xe_hoi_vao_nha: { ten: "xe hơi vào nhà", khop: /\b(?:(?:xe hoi|o to|oto) (?:vao|vo) (?:duoc |toi |tan |trong |tan trong )?nha|dau xe trong nha|gara|ga ra|garage|de xe hoi trong nha)\b/ },
  // 23/09/2026 (FR-216): "hẻm xe hơi quay đầu" trước chỉ nằm trong fact, không lọc được. Chỉ xe HƠI/ô tô/xe tải —
  // "xe máy quay đầu được" không kích; "xe hơi không quay đầu được" không khớp vì chữ "không" chen giữa.
  xe_hoi_quay_dau: { ten: "xe hơi quay đầu", khop: /\b(?:(?:xe hoi|o to|oto|xe tai|xe \d{1,2} cho|hxh) (?:quay dau|quay xe|de quay dau|vao quay dau|vao va quay dau|vao tan nha quay dau)|quay dau (?:xe hoi|o to|oto|xe tai)|hem quay dau (?:thoai mai|duoc|de dang))\b/, phuDinh: true },
  thang_may: { ten: "có thang máy", khop: /\b(?:co thang may|thang may rieng|lap thang may|thang may)\b/, phuDinh: true },
  san_thuong: { ten: "sân thượng", khop: /\b(?:san thuong)\b/ },
  // 25/09/2026 (bắn thật lx-21): "có sân thượng" / "có sẵn" bỏ dấu cũng là "co san" — không phải sân vườn.
  san_vuon: { ten: "sân vườn", khop: /\b(?:san vuon|co san (?:rong|de xe|choi|truoc|sau)|vuon rong|dat vuon rong|san truoc|san sau)\b/ },
  gac_lung: { ten: "có gác lửng", khop: /\b(?:gac lung|co gac|lung)\b/ },
  noi_that_full: { ten: "full nội thất", khop: /\b(?:full noi that|full nt|day du noi that|noi that day du|de lai het noi that|noi that cao cap)\b/ },
  kinh_doanh: { ten: "kinh doanh được", khop: /\b(?:kinh doanh|buon ban|mo shop|mo quan|mo tiem|lam van phong|van phong duoc|cho thue kinh doanh|tien buon ban|quan an|phu hop (?:mo )?quan)\b/ },
  dong_tien: { ten: "đang cho thuê, có dòng tiền", khop: /\b(?:dang cho thue|dong tien|thu nhap thue|co khach thue|dang khai thac)\b/ },
  view_song: { ten: "view sông", khop: /\b(?:view song|nhin ra song|huong song|ven song|bo song|view kenh)\b/ },
  view_cong_vien: { ten: "view công viên", khop: /\b(?:view cong vien|nhin ra cong vien|view ho\b(?!\s*boi)|view cay xanh)\b/ }, // 29/09 (L1): "view hồ bơi" không phải view hồ
  can_goc: { ten: "căn góc / 2 mặt tiền", khop: /\b(?:can goc|lo goc|2 mat tien|hai mat tien|goc 2 mat|nha goc)\b/ },
  ho_boi: { ten: "có hồ bơi", khop: /\b(?:ho boi|be boi)\b/ },
  nha_hoan_cong: { ten: "đã hoàn công", khop: /\b(?:da hoan cong|hoan cong day du|hoan cong du)\b/ },
  tho_cu_100: { ten: "thổ cư 100%", khop: /\b(?:tho cu 100|full tho cu|100% tho cu|tho cu het|tho cu toan bo)\b/ },
};

export const NHAN_HOP_LE: ReadonlySet<string> = new Set(Object.keys(TU_DIEN_NHAN));

/** Cụm phủ định đứng ngay trước chỗ khớp: "không yên tĩnh", "chưa có thang máy", "ko an ninh". */
// "không có chỗ quay đầu xe hơi" (23/09): "chỗ" chen giữa vẫn là phủ định.
const PHU_DINH = /(?:^|[\s,.;:(])(?:khong|ko|k|chua|chang|hoi|thieu|it)\s+(?:co\s+|duoc\s+)?(?:cho\s+)?$/;

// 24/09/2026 (chủ dự án test Zalo): "không có tầng lửng" → nhãn "có gác lửng" — PHU_DINH chỉ bật cho vài nhãn và không cho
// chữ chen giữa ("không có TẦNG lửng", "chưa có SÂN thượng"). Phủ định chắc (không / ko / chưa / chẳng) đứng trước, cách tối
// đa 2 chữ, không qua dấu phẩy → không gắn, cho MỌI nhãn.
const PHU_DINH_CHUNG = /(?:^|\s)(?:khong|ko|k|chua|chang)\s+(?:co\s+|duoc\s+|phai\s+|lam\s+)?(?:[a-z0-9%]+\s+){0,2}$/;

/** Nhãn nhận ra trong một câu (thứ tự theo từ điển, không trùng). */
const NHA_KHAC = /\b(?:hang xom|nha ben|ben canh|ke ben|doi dien|nha ke)\b/;
export function ganNhan(text: string | null | undefined): string[] {
  // 18/09 (bắn 10 tin thật): dấu phẩy phải CÒN là ranh giới — "gần chợ, xe hơi vào" từng thành
  // "gan cho xe hoi" và lookahead "chợ xe" của gan_cho chặn mất nhãn. Dấu câu → " , ".
  // SRS-5.1zzzzzzw (Zalo thật 14/10/2026: "Cho chị đăng cho thuê nhà" → nhãn "đang cho thuê, có dòng tiền"): bỏ dấu thì "đăng" (đăng
  // tin) = "đang" (đang cho thuê). Câu gõ CÓ dấu giữ chữ "đăng" khác đi trước khi bỏ dấu; câu không dấu vẫn đọc như cũ (cùng cách
  // `khop-cau-tra-loi.ts` hiện trạng và `re-nhanh.ts` DANG_CHO_THUE_DAU).
  const kd = boDau((text ?? "").replace(/(?<![\p{L}])đăng(?![\p{L}])/giu, "dawng"))
    .replace(/[,.;:!?()\/]+/g, " , ").replace(/[^a-z0-9%,\s]+/g, " ").replace(/\s+/g, " ").trim();
  if (!kd) return [];
  const ra: string[] = [];
  for (const [khoa, n] of Object.entries(TU_DIEN_NHAN)) {
    const m = n.khop.exec(kd);
    if (!m) continue;
    if (n.phuDinh && PHU_DINH.test(kd.slice(Math.max(0, m.index - 14), m.index))) continue;
    if (PHU_DINH_CHUNG.test(kd.slice(Math.max(0, m.index - 30), m.index))) continue;
    // 25/09/2026 (bắn thật lx-19): "hàng xóm mới xây năm 2019" là nhà KHÁC — không gắn "mới xây" cho căn đang rao.
    if (khoa === "moi_sua" && NHA_KHAC.test(kd.slice(Math.max(0, m.index - 20), m.index))) continue;
    ra.push(khoa);
  }
  return ra;
}

/**
 * Mảnh chữ chỉ nói đúng (các) nhãn — "khu yên tĩnh", "gần chợ lắm" — bỏ phần khớp nhãn + chữ đệm mà không còn gì.
 * Mảnh như vậy đã vào `listings.nhan`; ghi thêm vào "bổ sung" là trùng (25/09/2026, bắn thật lx-14: nhãn "yên tĩnh" và
 * "Kèm: thông tin bổ sung: khu yên tĩnh" trong cùng một khung 🤖).
 */
export function laThuanNhan(text: string | null | undefined, nhanCuaTin?: readonly string[] | null): boolean {
  const khoa = ganNhan(text);
  if (!khoa.length) return false;
  // Chỉ trùng khi tin THẬT SỰ mang (các) nhãn đó — "khu an ninh" ở tin chưa có nhãn an ninh là thông tin, giữ.
  if (nhanCuaTin && !khoa.every((k) => nhanCuaTin.includes(k))) return false;
  const DEM = /\b(?:khu nay|khu vuc|xung quanh|khu|nha|can|rat|lam|luon|qua|co|la|va|voi|o|day|nay|do|em|anh|chi|a|nhe|ben)\b/g;
  // Chữ đệm bỏ TRƯỚC ("khu yên tĩnh" → "yên tĩnh"), rồi bỏ phần khớp nhãn, rồi chữ đệm lần nữa.
  let kd = boDau(text ?? "").replace(/[^a-z0-9%\s]+/g, " ").replace(DEM, " ").replace(/\s+/g, " ").trim();
  for (const k of khoa) kd = kd.replace(new RegExp(TU_DIEN_NHAN[k].khop.source, "g"), " ");
  kd = kd.replace(DEM, " ").replace(/\s+/g, " ").trim();
  return kd === "";
}

/**
 * Như `tenNhan` nhưng BỎ nhãn mà chữ đã in ở phần trên của cùng bong bóng / bản nháp khớp rồi (25/09/2026, bắn thật
 * lx-13: thông số "trệt + lửng + 2 lầu + sân thượng" rồi dòng nhãn lại "sân thượng · có gác lửng"). Nhãn vẫn nằm
 * nguyên trong `listings.nhan` để lọc — chỉ không in lặp.
 */
export function tenNhanKhongTrung(nhan: readonly string[] | null | undefined, daIn: string): string {
  const kd = boDau(daIn ?? "");
  return tenNhan((nhan ?? []).filter((k) => !TU_DIEN_NHAN[k]?.khop.test(kd)));
}

/** Tên đọc được của một danh sách nhãn: ["yen_tinh","gan_cho"] → "yên tĩnh · gần chợ". */
export function tenNhan(nhan: readonly string[] | null | undefined): string {
  return (nhan ?? []).map((k) => TU_DIEN_NHAN[k]?.ten ?? k.replace(/_/g, " ")).join(" · ");
}
