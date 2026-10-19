#!/usr/bin/env bun
// tien-ich.mjs — "TÌM NHÀ GẦN BỆNH VIỆN 1 KM" (11/09/2026).
//
// Hàm thuần (19/10/2026: nửa đọc câu khách mua `docGanTienIch` gỡ cùng bot TypeScript):
//   `_shared/geocode.ts`: địa chỉ tin → câu tra Nominatim (BỎ số nhà, có nấc
//      không quận / không dấu), JSON Overpass → điểm tiện ích, khoảng cách.
// SQL `tin_gan_tien_ich` / `khoang_cach_m` dùng cùng công thức khoảng cách.
import {
  cauOverpass, docDiemOsm, ganNhatMoiLoai, khoangCachM, queriesDuAn, queriesFor, tenDuong, trongVung,
  trongVungQuan, viewboxQuan, vungQuan,
} from "../supabase/functions/_shared/geocode.ts";

let dat = 0, hong = 0;
const la = (ten, thuc, mong) => {
  const ok = JSON.stringify(thuc) === JSON.stringify(mong);
  if (ok) { dat++; console.log(`\x1b[32m✓\x1b[0m ${ten}`); }
  else { hong++; console.log(`\x1b[31m✗\x1b[0m ${ten}\n    thật ${JSON.stringify(thuc)}\n    mong ${JSON.stringify(mong)}`); }
};
const dung = (ten, ok, chiTiet = "") => la(ten + (ok ? "" : ` — ${chiTiet}`), !!ok, true);

console.log("2. ĐỊA CHỈ → CÂU TRA (không số nhà)\n");
la("tenDuong: hẻm + số", tenDuong("hẻm 12 Hồ Ngọc Lãm"), "Hồ Ngọc Lãm");
la("tenDuong: số/số + phường sau phẩy", tenDuong("123/45 Nguyễn Trãi, P.3"), "Nguyễn Trãi");
la("tenDuong: số nhà + hẻm", tenDuong("số 5 hẻm 12 Trần Hưng Đạo"), "Trần Hưng Đạo");
la("tenDuong: 'Đường 3/2' giữ nguyên", tenDuong("Đường 3/2"), "Đường 3/2");
la("tenDuong: mặt tiền", tenDuong("mặt tiền Trần Hưng Đạo"), "Trần Hưng Đạo");
la("tenDuong: 12A", tenDuong("12A Hùng Vương"), "Hùng Vương");
la("tenDuong: chỉ có số → rỗng", tenDuong("123"), "");

const ehome = queriesFor({ location_raw: "hẻm 12 Hồ Ngọc Lãm", street: null, ward: null, district: "Quận 8", quan_mac_dinh: false });
dung("ehome 3 (11/09): có nấc không quận, không dấu — câu duy nhất Nominatim trả điểm",
  ehome.some((c) => c.q === "Ho Ngoc Lam, Ho Chi Minh City" && c.muc === "duong"), JSON.stringify(ehome));
dung("KHÔNG câu tra nào mang số nhà/số hẻm", ehome.every((c) => !/\b12\b/.test(c.q)), JSON.stringify(ehome));
la("câu đầu hẹp nhất: đường + quận + thành phố", ehome[0], { q: "Hồ Ngọc Lãm, Quận 8, Thành phố Hồ Chí Minh", muc: "duong" });

const q5 = queriesFor({ location_raw: "12 Nguyễn Trãi", street: null, ward: "Phường 3", district: "Quận 5", quan_mac_dinh: true });
dung("quận mặc định (chưa rõ) → không dán 'Quận 5' vào câu tra", q5.every((c) => !/Quận 5|Quan 5/.test(c.q)), JSON.stringify(q5));
const ngoai = queriesFor({ location_raw: "đường ĐT830", street: null, ward: null, district: "Bến Lức, Long An", quan_mac_dinh: false });
dung("tỉnh lân cận → đuôi 'Việt Nam', không phải TP.HCM", ngoai.every((c) => !/Hồ Chí Minh|Ho Chi Minh/.test(c.q)), JSON.stringify(ngoai));
const soChung = queriesFor({ location_raw: "Đường số 7", street: null, ward: "Phường An Lạc", district: null, quan_mac_dinh: false });
dung("'Đường số 7' trùng khắp nơi → luôn kèm phường", soChung.filter((c) => c.muc === "duong").every((c) => /An Lac|An Lạc/.test(c.q)), JSON.stringify(soChung));
const chiPhuong = queriesFor({ location_raw: null, street: null, ward: "Phường 4", district: "Quận 5", quan_mac_dinh: false });
dung("chỉ có phường → mức 'phuong' (không dùng đo 1 km)", chiPhuong.length > 0 && chiPhuong.every((c) => c.muc === "phuong"), JSON.stringify(chiPhuong));
// 14/09/2026 (bắn thật): "bán đất Củ Chi" chỉ có huyện — trước không có câu tra nào.
const chiHuyen = queriesFor({ location_raw: null, street: null, ward: null, district: "Huyện Củ Chi", quan_mac_dinh: false });
dung("chỉ có huyện → câu tra tâm huyện, mức 'quan'", chiHuyen.length > 0 && chiHuyen.every((c) => c.muc === "quan") && chiHuyen[0].q === "Huyện Củ Chi, Thành phố Hồ Chí Minh", JSON.stringify(chiHuyen));
dung("chỉ có quận MẶC ĐỊNH (chưa ai nói) → không tra gì", queriesFor({ location_raw: null, street: null, ward: null, district: "Quận 5", quan_mac_dinh: true }).length === 0);
dung("có phường thì KHÔNG lùi về tâm quận", chiPhuong.every((c) => c.muc !== "quan"), JSON.stringify(chiPhuong));
dung("có đường thì KHÔNG lùi về tâm quận", ehome.every((c) => c.muc !== "quan"), JSON.stringify(ehome));
dung("street (cột đã bóc) thắng location_raw", queriesFor({ location_raw: "nhà đẹp gần chợ", street: "Hồ Ngọc Lãm", ward: null, district: null, quan_mac_dinh: false })[0]?.q === "Hồ Ngọc Lãm, Thành phố Hồ Chí Minh");

const da = queriesDuAn({
  name: "Glory Heights - Vinhomes Grand Park", location_raw: "Vành Đai 3, Phường Long Bình, Quận 9 (TP. Thủ Đức), TPHCM",
  ward: "Phường Long Bình", district: "Quận 9 (TP. Thủ Đức)",
});
la("dự án: TÊN trước (bỏ phần sau ' - '), có dấu rồi không dấu", da.slice(0, 2).map((c) => c.q),
  ["Glory Heights, Thành phố Hồ Chí Minh", "Glory Heights, Ho Chi Minh City"]);
dung("dự án: sau tên là địa chỉ", da.some((c) => c.q === "Vành Đai 3, Thành phố Hồ Chí Minh"), JSON.stringify(da));
dung("dự án: giữ số nhà (địa chỉ dự án công khai)",
  queriesDuAn({ name: "Landmark 81", location_raw: "208 Nguyễn Hữu Cảnh, Phường 22, Quận Bình Thạnh, TPHCM", ward: null, district: "Quận Bình Thạnh" })
    .some((c) => c.q === "208 Nguyễn Hữu Cảnh, Thành phố Hồ Chí Minh"));

// Khoá vùng quanh quận cũ — bắt từ lượt chạy thật 11/09: "Trần Bình Trọng, Q5"
// ra một đường cùng tên cách ~7 km.
const v5 = vungQuan("Quận 5");
dung("vungQuan: Quận 5 → tâm + bán kính 4 km", v5 && Math.abs(v5.lat - 10.754) < 0.01 && v5.r_km === 4, JSON.stringify(v5));
dung("vungQuan: 'Q.5', 'Quận 9 (TP. Thủ Đức)', 'Huyện Bình Chánh', 'Quận Bình Thạnh' đều nhận",
  vungQuan("Q.5")?.r_km === 4 && vungQuan("Quận 9 (TP. Thủ Đức)")?.r_km === 10 && !!vungQuan("Huyện Bình Chánh") && !!vungQuan("Quận Bình Thạnh"));
dung("vungQuan: tỉnh ngoài / chưa rõ → null (không khoá vùng)", vungQuan("Bến Lức, Long An") === null && vungQuan(null) === null);
dung("11/09 thật: điểm 'Trần Bình Trọng' 10.8125,106.6882 (đường khác, ~7 km) → LOẠI cho Quận 5", !trongVungQuan(10.8125, 106.6882, v5));
dung("… điểm Trần Bình Trọng thật ở Quận 5 → nhận", trongVungQuan(10.7585, 106.6806, v5));
dung("11/09 thật: Hồ Ngọc Lãm 10.7229,106.6107 vẫn nhận cho Quận 8", trongVungQuan(10.7229, 106.6107, vungQuan("Quận 8")));
const hop = viewboxQuan(v5).split(",").map(Number);
dung("viewboxQuan: hộp trái,trên,phải,dưới bao tâm quận",
  hop[0] < v5.lng && hop[2] > v5.lng && hop[1] > v5.lat && hop[3] < v5.lat, viewboxQuan(v5));

dung("trongVung: Hồ Ngọc Lãm", trongVung(10.7229, 106.6107));
dung("trongVung: Hà Nội bị chặn (trùng tên đường)", !trongVung(21.03, 105.85));
dung("trongVung: tỉnh ngoài dùng khung Nam Bộ", trongVung(10.64, 106.48, true) && !trongVung(21.03, 105.85, true));

console.log("\n3. OVERPASS → ĐIỂM TIỆN ÍCH\n");
dung("cauOverpass: quanh đúng điểm, 3 km", cauOverpass(10.7229033, 106.6106773).includes("around:3000,10.722903,106.610677"));
const js = { elements: [
  { type: "node", id: 1, lat: 10.72, lon: 106.61, tags: { amenity: "hospital", name: "Nhà Thuốc Tây Quàng Hòa" } },
  { type: "way", id: 2, center: { lat: 10.731, lon: 106.612 }, tags: { amenity: "hospital", name: "Bệnh viện Triều An" } },
  { type: "way", id: 3, center: { lat: 10.725, lon: 106.611 }, tags: { amenity: "school", name: "Trường THCS Lê Lợi" } },
  { type: "node", id: 4, lat: 10.723, lon: 106.61, tags: { amenity: "school" } },
  { type: "node", id: 5, lat: 10.724, lon: 106.612, tags: { shop: "supermarket", name: "Co.opmart Bình Tân" } },
  { type: "way", id: 2, center: { lat: 10.731, lon: 106.612 }, tags: { amenity: "hospital", name: "Bệnh viện Triều An" } },
  { type: "relation", id: 6, center: { lat: 10.76, lon: 106.63 }, tags: { leisure: "park", name: "Công viên Đầm Sen" } },
  { type: "node", id: 7, lat: 10.72, lon: 106.6, tags: { amenity: "hospital", name: "Bệnh viện Thú y Sài Gòn" } },
] };
const diem = docDiemOsm(js);
la("docDiemOsm: bỏ nhà thuốc, thú y, điểm không tên, điểm trùng",
  diem.map((d) => `${d.osm_id}:${d.loai}`), ["way/2:benh_vien", "way/3:truong_hoc", "node/5:sieu_thi", "relation/6:cong_vien"]);
la("docDiemOsm: ten_kd để khớp 'coopmart'", diem.find((d) => d.loai === "sieu_thi")?.ten_kd, "coopmart binh tan");
dung("docDiemOsm: JSON lỗi → []", docDiemOsm("<html>too busy</html>").length === 0 && docDiemOsm(null).length === 0);

const motDo = khoangCachM(10, 106, 11, 106);
dung("khoangCachM: 1 độ vĩ ≈ 111,2 km", Math.abs(motDo - 111195) < 5, String(motDo));
const gan = ganNhatMoiLoai(10.7229033, 106.6106773, diem);
la("ganNhatMoiLoai: gần nhất mỗi loại, xếp theo mét, bỏ ngoài 3 km",
  gan.map((g) => `${g.loai}:${g.m}`), ["sieu_thi:190", "truong_hoc:240", "benh_vien:910"]);


// SRS-5.1zzzzzzn (14/10/2026): danh sách máy Overpass của geocode-listings. Từ 09/10 cả ba máy cũ hỏng mọi tick (overpass-api.de 406 từ edge,
// private.coffee quá giờ / 500, mail.ru 504) → project mới chưa tin nào nạp được tiện ích, sổ lỗi 9 dòng / 24 giờ. Đo pg_net từ chính DB 14/10:
// openstreetmap.fr trả 200 kèm 10 điểm quanh Cao Lỗ; osm.ch 200 nhưng chỉ dữ liệu Thuỵ Sĩ (0 điểm VN). Đỏ khi: bỏ máy .fr, để máy đã biết
// hỏng (overpass-api.de) đứng trước nó (mỗi máy hỏng tốn tới 35 s ngân sách), hay thêm osm.ch.
console.log("\n4. MÁY OVERPASS (geocode-listings)\n");
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../supabase/functions/geocode-listings/index.ts", import.meta.url), "utf8");
  const ds = [...(/const OVERPASS = \[([\s\S]*?)\];/.exec(src)?.[1] ?? "").matchAll(/"(https:[^"]+)"/g)].map((m) => new URL(m[1]).host);
  dung("OVERPASS: có máy openstreetmap.fr (máy duy nhất trả dữ liệu TP.HCM từ hạ tầng Supabase 14/10)", ds.includes("overpass.openstreetmap.fr"), ds.join(", "));
  dung("OVERPASS: openstreetmap.fr đứng trước overpass-api.de (máy chính chặn dải IP edge → 406, đừng tốn lượt đầu)",
    ds.indexOf("overpass.openstreetmap.fr") < ds.indexOf("overpass-api.de"), ds.join(", "));
  dung("OVERPASS: không có osm.ch (chỉ dữ liệu Thuỵ Sĩ, trả 200 rỗng → tin lên 'không có tiện ích' oan)", !ds.includes("overpass.osm.ch"), ds.join(", "));
  dung("OVERPASS: ≥ 3 máy để một máy bận không làm trễ cả lượt", ds.length >= 3, String(ds.length));
}

console.log(hong ? `\n${hong}/${dat + hong} CA HỎNG` : `\nTẤT CẢ ${dat} CA ĐẠT`);
process.exit(hong ? 1 : 0);
