// Bộ sinh tin mẫu `seed_thu`: 100 tin SEED0031..SEED0130 (mở rộng rổ đo tìm nhà, SRS-5.1zzzzzzz144) + 30 tin SEED0001..SEED0030 sinh lại
// (SRS-5.1zzzzzzz167 — 30 tin đầu hồi sáng 23/10 nạp tay bằng SQL, mất khỏi DB, không còn bản gốc) + 98 tin SEED0131..SEED0228 phủ đều từng quận
// (SRS-5.1zzzzzzz168 — chat thử 24/10: "nhà phố Quận 5 hẻm xe hơi", "căn hộ 2PN Quận 10 thuê 15 triệu", "nhà phố Gò Vấp ≥ 4 phòng ngủ" không ra căn). Hàm thuần, TẤT ĐỊNH (cùng hạt giống → cùng dữ liệu) nên
// chạy lại không đẻ dữ liệu khác. Mục tiêu khác 30 tin đầu: mỗi nhóm có NHIỀU tin gần giống nhau (cùng quận / loại / khoảng giá) để phép đo có đối thủ thật,
// và các chi tiết riêng (thang máy, gara, sân thượng, view sông…) lặp ở vài tin chứ không duy nhất một tin.
import { esc } from "./do-tim-nha-lib.mjs";

// quận cũ → phường mới hợp lệ (wards.ten_day_du), triệu đồng / m² nhà phố, vài tên đường (dữ liệu mẫu, không phải địa chỉ thật)
export const QUAN = {
  "Quận 1": { ppm: 250, phuong: ["Phường Bến Thành", "Phường Cầu Ông Lãnh", "Phường Sài Gòn"], duong: ["Pasteur", "Lê Lợi", "Cô Bắc", "Cống Quỳnh"] },
  "Quận 3": { ppm: 160, phuong: ["Phường Bàn Cờ", "Phường Nhiêu Lộc", "Phường Xuân Hòa"], duong: ["Cao Thắng", "Võ Văn Tần", "Trần Quang Diệu"] },
  "Quận 5": { ppm: 130, phuong: ["Phường An Đông", "Phường Chợ Lớn", "Phường Chợ Quán"], duong: ["Nguyễn Trãi", "Trần Phú", "Hồng Bàng", "An Dương Vương"] },
  "Quận 6": { ppm: 90, phuong: ["Phường Bình Phú", "Phường Bình Tây", "Phường Bình Tiên"], duong: ["Hậu Giang", "Minh Phụng", "Phạm Đình Hổ"] },
  "Quận 7": { ppm: 110, phuong: ["Phường Phú Thuận", "Phường Tân Hưng", "Phường Tân Mỹ"], duong: ["Huỳnh Tấn Phát", "Lê Văn Lương", "Nguyễn Thị Thập"] },
  "Quận 8": { ppm: 75, phuong: ["Phường Bình Đông", "Phường Chánh Hưng", "Phường Phú Định"], duong: ["Phạm Thế Hiển", "Dương Bá Trạc", "Tạ Quang Bửu"] },
  "Quận 10": { ppm: 130, phuong: ["Phường Diên Hồng", "Phường Hòa Hưng", "Phường Vườn Lài"], duong: ["Sư Vạn Hạnh", "Ba Tháng Hai", "Thành Thái"] },
  "Quận 11": { ppm: 100, phuong: ["Phường Bình Thới", "Phường Hòa Bình", "Phường Minh Phụng"], duong: ["Lạc Long Quân", "Lãnh Binh Thăng", "Hòa Bình"] },
  "Quận Bình Thạnh": { ppm: 110, phuong: ["Phường Bình Lợi Trung", "Phường Bình Quới", "Phường Bình Thạnh"], duong: ["Điện Biên Phủ", "Nguyễn Xí", "Bạch Đằng"] },
  "Quận Gò Vấp": { ppm: 80, phuong: ["Phường An Hội Đông", "Phường An Hội Tây", "Phường An Nhơn"], duong: ["Quang Trung", "Phan Văn Trị", "Nguyễn Oanh"] },
  "Quận Phú Nhuận": { ppm: 150, phuong: ["Phường Cầu Kiệu", "Phường Đức Nhuận", "Phường Phú Nhuận"], duong: ["Phan Xích Long", "Nguyễn Kiệm", "Hoàng Văn Thụ"] },
  "Quận Tân Bình": { ppm: 100, phuong: ["Phường Bảy Hiền", "Phường Tân Bình", "Phường Tân Hòa"], duong: ["Cộng Hòa", "Hoàng Hoa Thám", "Lạc Long Quân"] },
  "Quận Tân Phú": { ppm: 85, phuong: ["Phường Phú Thạnh", "Phường Phú Thọ Hòa", "Phường Tân Phú"], duong: ["Lũy Bán Bích", "Tân Kỳ Tân Quý", "Thoại Ngọc Hầu"] },
  "Quận Bình Tân": { ppm: 70, phuong: ["Phường An Lạc", "Phường Bình Hưng Hòa", "Phường Bình Tân"], duong: ["Kinh Dương Vương", "Tỉnh Lộ 10", "Lê Văn Quới"] },
  "Huyện Bình Chánh": { ppm: 25, phuong: ["Xã Bình Chánh", "Xã Bình Hưng", "Xã Bình Lợi"], duong: ["Quốc lộ 1A", "Trần Đại Nghĩa", "Phạm Hùng"] },
  "Huyện Hóc Môn": { ppm: 30, phuong: ["Xã Bà Điểm", "Xã Đông Thạnh", "Xã Hóc Môn"], duong: ["Quốc lộ 22", "Nguyễn Văn Bứa", "Lê Văn Khương"] },
};
const DO_THI = Object.keys(QUAN).filter((q) => !q.startsWith("Huyện"));
const NGOAI = ["Huyện Bình Chánh", "Huyện Hóc Môn"];
const QUAN_THEO_LOAI = {
  nha_cap4: [...DO_THI, ...NGOAI], dat: NGOAI, dat_nong_nghiep: NGOAI, dat_kinh_doanh: NGOAI,
  biet_thu: ["Quận 7", "Quận Bình Thạnh", "Quận Tân Bình", "Quận Gò Vấp"], kho_xuong: ["Quận Bình Tân", "Quận 8", "Huyện Bình Chánh"],
  toa_nha: ["Quận 1", "Quận 3", "Quận 10", "Quận Phú Nhuận"], phong_tro: ["Quận Gò Vấp", "Quận Bình Thạnh", "Quận Tân Bình", "Quận 10", "Quận Bình Tân"],
  mat_bang: ["Quận 1", "Quận 3", "Quận 5", "Quận 10", "Quận Tân Bình"],
};
// [deal, loại, đường vào, số tin]
export const KE_HOACH = [
  ["ban", "nha_pho", "hem_xe_hoi", 14], ["ban", "nha_pho", "hem_xe_may", 10], ["ban", "nha_pho", "mat_tien", 10], ["ban", "nha_pho", "hem", 6],
  ["ban", "chung_cu", null, 15], ["ban", "nha_cap4", "hem_xe_may", 6], ["ban", "dat", "hem_xe_hoi", 6], ["ban", "dat_nong_nghiep", null, 3],
  ["ban", "dat_kinh_doanh", "mat_tien", 3], ["ban", "biet_thu", null, 4], ["ban", "kho_xuong", "hem_xe_tai", 4], ["ban", "toa_nha", "mat_tien", 3],
  ["cho_thue", "nha_pho", "mat_tien", 5], ["cho_thue", "chung_cu", null, 5], ["cho_thue", "phong_tro", null, 4], ["cho_thue", "mat_bang", "mat_tien", 2],
];
// 30 tin SEED0001..0030 SINH LẠI (SRS-5.1zzzzzzz167). Hạt giống riêng nên không trùng tin SEED0031..0130; KHÔNG phải bản gốc hồi sáng 23/10.
export const KE_HOACH_DAU_30 = [
  ["ban", "nha_pho", "hem_xe_hoi", 5], ["ban", "nha_pho", "mat_tien", 3], ["ban", "nha_pho", "hem_xe_may", 3], ["ban", "chung_cu", null, 6],
  ["ban", "nha_cap4", "hem_xe_may", 2], ["ban", "dat", "hem_xe_hoi", 2], ["ban", "biet_thu", null, 1], ["ban", "kho_xuong", "hem_xe_tai", 1],
  ["cho_thue", "nha_pho", "mat_tien", 2], ["cho_thue", "chung_cu", null, 3], ["cho_thue", "phong_tro", null, 1], ["cho_thue", "mat_bang", "mat_tien", 1],
];
// 98 tin SEED0131..0228: MỖI quận đô thị có đủ bảy kiểu hay bị hỏi — nhà phố hẻm xe hơi (một tin ép ≥ 4 phòng ngủ), căn hộ bán (một tin ép 2PN),
// căn hộ thuê (một tin ép 2PN, 12–17 triệu), nhà phố thuê mặt tiền. Phần tử thứ 5 = quận cố định, thứ 6 = ép phòng ngủ (`pn`).
export const KE_HOACH_BO_SUNG = Object.keys(QUAN).filter((q) => !q.startsWith("Huyện")).flatMap((q) => [
  ["ban", "nha_pho", "hem_xe_hoi", 1, q, { pn: 4 }], ["ban", "nha_pho", "hem_xe_hoi", 1, q],
  ["ban", "chung_cu", null, 1, q, { pn: 2 }], ["ban", "chung_cu", null, 1, q],
  ["cho_thue", "chung_cu", null, 1, q, { pn: 2 }], ["cho_thue", "chung_cu", null, 1, q],
  ["cho_thue", "nha_pho", "mat_tien", 1, q],
]);
// 14 tin SEED0229..0242 (SRS-5.1zzzzzzz168, chat thử 24/10: "nhà phố Quận 5 dưới 7 tỷ hẻm xe hơi" không ra căn — nhà 55–72 m² ở Quận 5 đã trên 8 tỷ):
// MỖI quận đô thị một nhà phố hẻm xe hơi lô NHỎ (32–44 m², 3–4 tầng) cho khách ngân sách vừa; riêng Quận 1 giá vẫn cao.
export const KE_HOACH_NHO = Object.keys(QUAN).filter((q) => !q.startsWith("Huyện")).map((q) => ["ban", "nha_pho", "hem_xe_hoi", 1, q, { nho: true }]);
const CHI_TIET = {
  nha_pho: ["gần chợ", "gần trường tiểu học", "sân thượng trồng rau được", "có gara ô tô", "nhà mới sơn sửa", "giếng trời thoáng mát", "bếp rộng nấu ăn thoải mái",
    "gần bệnh viện", "khu yên tĩnh dân trí cao", "sân trước để được 2 xe", "nhà góc 2 mặt hẻm",
    "tầng trệt kinh doanh được", "hướng đông nam", "có thang máy", "gần trạm metro", "khu an ninh có camera"],
  chung_cu: ["tầng cao view thoáng", "full nội thất", "có ban công", "gần siêu thị", "gần trường quốc tế",
    "hồ bơi gym nội khu", "bảo vệ 24/24", "chủ đầu tư uy tín", "hướng mát không nắng chiều"],
  dat: ["đường xe tải vào tận nơi", "gần chợ", "đất vuông vức", "sổ riêng thổ cư", "gần khu công nghiệp", "có sẵn điện nước", "khu dân cư hiện hữu"],
  khac: ["gần chợ", "đường rộng xe lớn vào được", "sổ riêng", "chủ bán gấp", "vị trí đẹp dễ cho thuê", "gần trường học", "khu dân cư đông"],
};
const PHAP_LY = ["sổ hồng riêng", "sổ hồng hoàn công đủ", "sổ hồng chính chủ", "đã có sổ"];
const CHOT = ["thương lượng chút", "chủ bán gấp", "giá chốt", "có thương lượng", "bớt chút thiện chí"];

function hatGiong(seed) {  // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lam = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const giaChu = (vnd, thang) => {
  if (thang) { const tr = vnd / 1e6; return `${lam(tr, tr < 10 ? 1 : 0)} triệu/tháng`.replace(".", ","); }
  return vnd >= 1e9 ? `${lam(vnd / 1e9, 1)} tỷ`.replace(".", ",") : `${Math.round(vnd / 1e6)} triệu`;
};

/** `soLuong` tin bắt đầu từ SEED(batDau) theo kế hoạch `ke`. Tổng KE_HOACH = 100; soLuong < tổng kế hoạch thì cắt bớt từ cuối.
 *  Mục kế hoạch có quận cố định / `pn` chỉ dùng cho KE_HOACH_BO_SUNG — mục không có hai phần tử đó sinh y hệt bản đã nạp. */
export function sinhTin(soLuong = 100, batDau = 31, ke = KE_HOACH, hat = 23102026) {
  const rnd = hatGiong(hat), chon = (a) => a[Math.floor(rnd() * a.length)], hon = (a, b) => a + rnd() * (b - a);
  const ra = [];
  for (const [deal, loai, access, n, quanCo, opt] of ke) {
    for (let i = 0; i < n; i++) {
      const quan = quanCo || chon(QUAN_THEO_LOAI[loai] || DO_THI), q = QUAN[quan], phuong = chon(q.phuong), duong = chon(q.duong);
      const thue = deal === "cho_thue";
      let area, vnd, beds = null, floors = null, alley = null, ngang = null, dai = null;
      if (loai === "nha_pho") {
        area = Math.round(hon(35, 110)); ngang = lam(hon(3.2, 5.5)); dai = lam(area / ngang, 0); floors = 2 + Math.floor(rnd() * 3); beds = floors + Math.floor(rnd() * 2);
        vnd = area * q.ppm * 1e6 * (access === "mat_tien" ? 1.6 : access === "hem" ? 0.8 : 1) * hon(0.85, 1.15);
        if (thue) vnd = area * hon(0.45, 0.65) * 1e6 * (access === "mat_tien" ? 1.3 : 1);
      } else if (loai === "chung_cu") {
        area = Math.round(hon(40, 110)); beds = area < 55 ? 1 : area < 85 ? 2 : 3; vnd = area * q.ppm * 1e6 * 0.55 * hon(0.85, 1.15);
        if (thue) vnd = (6 + area * 0.18) * 1e6 * hon(0.9, 1.2);
      } else if (loai === "nha_cap4") { area = Math.round(hon(30, 150)); beds = 1 + Math.floor(rnd() * 3); floors = 1; vnd = area * q.ppm * 1e6 * 0.55 * hon(0.85, 1.15); }
      else if (loai === "dat") { area = Math.round(hon(80, 500)); vnd = area * q.ppm * 1e6 * hon(0.8, 1.2); }
      else if (loai === "dat_nong_nghiep") { area = Math.round(hon(500, 3000)); vnd = area * 3e6 * hon(0.8, 1.3); }
      else if (loai === "dat_kinh_doanh") { area = Math.round(hon(200, 600)); vnd = area * 15e6 * hon(0.8, 1.3); }
      else if (loai === "biet_thu") { area = Math.round(hon(200, 500)); beds = 4 + Math.floor(rnd() * 3); floors = 2 + Math.floor(rnd() * 2); vnd = area * q.ppm * 1e6 * hon(0.8, 1.1); }
      else if (loai === "kho_xuong") { area = Math.round(hon(500, 2000)); floors = 1; vnd = area * 8e6 * hon(0.8, 1.3); }
      else if (loai === "toa_nha") { area = Math.round(hon(150, 300)); floors = 5 + Math.floor(rnd() * 4); vnd = area * q.ppm * 1e6 * 2.2 * hon(0.85, 1.15); }
      else if (loai === "phong_tro") { area = Math.round(hon(15, 30)); beds = 1; vnd = hon(2, 5) * 1e6; }
      else { area = Math.round(hon(40, 150)); floors = 1 + Math.floor(rnd() * 3); vnd = hon(30, 150) * 1e6; }   // mat_bang thuê
      if (opt?.pn && loai === "nha_pho" && !thue) {   // ép đủ phòng ngủ cho câu "nhà phố ≥ N phòng ngủ": lô vừa phải để giá không vọt
        area = Math.round(hon(55, 72)); ngang = lam(hon(3.8, 5)); dai = lam(area / ngang, 0); floors = Math.max(floors, opt.pn >= 4 ? 4 : floors);
        beds = opt.pn + Math.floor(rnd() * 2); vnd = area * q.ppm * 1e6 * hon(0.85, 1.15);
      }
      if (opt?.nho && loai === "nha_pho" && !thue) {
        area = Math.round(hon(32, 44)); ngang = lam(hon(3.2, 4.2)); dai = lam(area / ngang, 0); floors = 3 + Math.floor(rnd() * 2);
        beds = floors - 1; vnd = area * q.ppm * 1e6 * hon(0.85, 1.15);
      }
      if (opt?.pn && loai === "chung_cu") {
        area = Math.round(hon(58, 80)); beds = opt.pn; vnd = thue ? hon(12, 17) * 1e6 : area * q.ppm * 1e6 * 0.55 * hon(0.85, 1.15);
      }
      vnd = thue ? Math.round(vnd / 5e5) * 5e5 : Math.round(vnd / 1e8) * 1e8;
      if (access === "hem_xe_hoi" || access === "hem_xe_may" || access === "hem_xe_tai" || access === "hem") alley = access === "hem_xe_hoi" ? lam(hon(3.5, 6)) : access === "hem" ? 3 : lam(hon(1.5, 2.5));
      const cd = CHI_TIET[loai] || (loai.startsWith("dat") || loai === "kho_xuong" ? CHI_TIET.dat : CHI_TIET.khac);
      const c1 = chon(cd); let c2 = chon(cd); if (c2 === c1) c2 = chon(cd);
      const dauNha = { hem_xe_hoi: "nhà hxh", hem_xe_may: "nhà hẻm xe máy", mat_tien: "nhà mặt tiền", hem: "nhà hẻm nhỏ" }[access] || "";
      const ten = { nha_pho: dauNha, chung_cu: "căn hộ", nha_cap4: "nhà cấp 4 hẻm xe máy", dat: "đất thổ cư", dat_nong_nghiep: "đất vườn", dat_kinh_doanh: "đất mặt tiền",
        biet_thu: "biệt thự", kho_xuong: "kho xưởng", toa_nha: "tòa nhà", phong_tro: "phòng trọ", mat_bang: "mặt bằng" }[loai];
      const quy = ngang && dai ? `${ngang}x${dai}` : `${area}m2`;
      const gia = giaChu(vnd, thue);
      const sttt = String(batDau + ra.length).padStart(4, "0");
      const tin_goc = `${thue ? "cho thuê " : ""}${ten} ${duong} ${quan.replace(/^Quận (\d+)$/, "Q$1").replace(/^(Quận|Huyện) /, "")} ${quy}${floors ? ` ${floors} tầng` : ""}${beds ? ` ${beds}pn` : ""}, ${c1}, ${c2}, ` +
        `${thue ? "giá" : chon(PHAP_LY) + ", bán"} ${gia} ${thue ? "cọc 2 tháng" : chon(CHOT)}`.replace(/\s+/g, " ").trim();
      ra.push({
        code: `SEED${sttt}`, deal, ptype: loai, district: quan, ward: phuong, street: duong, area, price_raw: gia, beds, floors, access, alley,
        descr: `${thue ? "Cho thuê" : "Bán"} ${ten} ${duong}, ${phuong}, ${quan}, ${area}m2${beds ? `, ${beds} phòng ngủ` : ""}, giá ${gia}.`.replace(/\s+/g, " "),
        tin_goc: `23/10: ${tin_goc}`.replace(/\s+,/g, ","),
      });
    }
  }
  return ra.slice(0, soLuong);
}

/** Đủ 242 tin: SEED0001..0030 (sinh lại) + SEED0031..0130 + SEED0131..0228 (phủ từng quận) + SEED0229..0242 (nhà phố lô nhỏ mỗi quận). */
export function sinhTatCa() {
  return [...sinhTin(30, 1, KE_HOACH_DAU_30, 23102001), ...sinhTin(100, 31), ...sinhTin(98, 131, KE_HOACH_BO_SUNG, 23102002),
    ...sinhTin(14, 229, KE_HOACH_NHO, 23102003)];
}

const sv = (v) => (v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : esc(v));
/** Câu INSERT (tin + tin gốc) cho một mẻ; người bán thử `thu-seed-001` phải có sẵn. */
export function sqlNapTin(rows) {
  const v = rows.map((r) => `(${[r.code, r.deal, r.district, r.ward, r.street, r.area, r.price_raw, r.descr, r.ptype, r.beds, r.floors, r.access, r.alley, r.tin_goc].map(sv).join(", ")})`).join(",\n ");
  return `with v(code, deal, district, ward, street, area, price_raw, descr, ptype, beds, floors, access, alley, tin_goc) as (values\n ${v}\n), l as (
  insert into listings (code, seller_id, deal, district, ward, street, location_raw, area_m2, price_raw, description, source, status, property_type, property_type_source,
                        price_source, ward_source, bedrooms, floors, access_type, alley_width_m, legal_status, boc_tach)
  select v.code, (select id from sellers where zalo_user_id = 'thu-seed-001'), v.deal::listing_deal, v.district, v.ward, v.street, v.street || ', ' || v.ward || ', ' || v.district,
         v.area::numeric, v.price_raw, v.descr, 'seed_thu', 'cho_thong_tin', v.ptype::property_type, 'chu_xac_nhan', 'chu_xac_nhan', 'chu_xac_nhan',
         v.beds::int, v.floors::int, v.access::text, v.alley::numeric, 'so_hong',
         jsonb_build_object('duong', v.street, 'phuong', v.ward, 'quan', v.district, 'gia', v.price_raw, '_thong_so_ai', true)
  from v returning id, code
)
insert into listing_noi_bo (listing_id, du_lieu) select l.id, jsonb_build_object('tin_goc', v.tin_goc) from l join v using (code) returning listing_id`;
}
