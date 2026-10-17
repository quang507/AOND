#!/usr/bin/env bun
// tra-phuong.mjs — FR-209: tra phường mới từ tên đường (phần THUẦN, chạy offline).
// JSON mẫu là câu trả lời THẬT của Nominatim ngày 15/09/2026 cho "Lê Văn Việt,
// Thành phố Hồ Chí Minh" — sau 07/2025 OSM chỉ còn phường mới, không có quận.
import { cauNhieuNoiPhuong, cauXacNhanPhuong, chuanTenDuong, docCacPhuongNominatim, docPhuongNominatim, duongTraDuoc, tachTienToPhuong, urlTraPhuong } from "../supabase/functions/_shared/extraction/tra-phuong.ts";

let dat = 0, hong = 0;
const ok = (ten, dk, chi = "") => { if (dk) dat++; else { hong++; console.log(`✗ ${ten}${chi ? `\n    ${chi}` : ""}`); } };

const LVV = [{
  place_id: 259482917, osm_type: "way", osm_id: 724079954, lat: "10.8454680", lon: "106.7941680",
  category: "highway", type: "secondary", place_rank: 26, addresstype: "road", name: "Lê Văn Việt",
  display_name: "Lê Văn Việt, Khu phố 44, Phường Tăng Nhơn Phú, Thành phố Hồ Chí Minh, 71320, Việt Nam",
  address: { road: "Lê Văn Việt", neighbourhood: "Khu phố 44", suburb: "Phường Tăng Nhơn Phú", city: "Thành phố Hồ Chí Minh", "ISO3166-2-lvl4": "VN-SG", postcode: "71320", country: "Việt Nam", country_code: "vn" },
}];

// ── đọc JSON Nominatim ──
let p = docPhuongNominatim(LVV);
ok("Lê Văn Việt → Phường Tăng Nhơn Phú (suburb)", p?.ten === "Tăng Nhơn Phú" && p?.loai === "phuong" && p?.ten_day_du === "Phường Tăng Nhơn Phú", JSON.stringify(p));
ok("rỗng → null", docPhuongNominatim([]) === null);
ok("không phải mảng → null", docPhuongNominatim({ address: { suburb: "Phường X" } }) === null);
ok("kết quả ở Hà Nội → null (không phải địa bàn)", docPhuongNominatim([{ addresstype: "road", address: { suburb: "Phường Dịch Vọng", city: "Hà Nội" } }]) === null);
ok("kết quả là CẢ THÀNH PHỐ → null", docPhuongNominatim([{ addresstype: "city", address: { city: "Thành phố Hồ Chí Minh", suburb: "Phường Sài Gòn" } }]) === null);
ok("xã ở quarter → loai xa", (p = docPhuongNominatim([{ addresstype: "road", address: { quarter: "Xã Củ Chi", state: "Thành phố Hồ Chí Minh" } }]))?.loai === "xa" && p?.ten_day_du === "Xã Củ Chi", JSON.stringify(p));
ok("suburb không tiền tố ('Khu phố 3') → null", docPhuongNominatim([{ addresstype: "road", address: { suburb: "Khu phố 3", city: "Thành phố Hồ Chí Minh" } }]) === null);
ok("đặc khu", tachTienToPhuong("Đặc khu Côn Đảo")?.loai === "dac_khu");

// ── tách tiền tố ──
ok("'phường tăng nhơn phú' (thường, có dấu) → ten giữ chữ gốc", tachTienToPhuong("phường tăng nhơn phú")?.ten === "tăng nhơn phú");
ok("'Phuong Tan Dinh' không dấu → phuong", tachTienToPhuong("Phuong Tan Dinh")?.loai === "phuong");
ok("'Tăng Nhơn Phú' không tiền tố → null", tachTienToPhuong("Tăng Nhơn Phú") === null);
ok("câu CÓ DẤU: 'nhà xa trung tâm lắm' → null ('xa' không phải xã)", tachTienToPhuong("nhà xa trung tâm lắm") === null);
ok("câu CÓ DẤU: 'phương án là bán nhanh' → null", tachTienToPhuong("phương án là bán nhanh") === null);
ok("câu KHÔNG DẤU: 'xa cu chi' → xa Cu Chi", tachTienToPhuong("xa cu chi")?.loai === "xa");
ok("câu sửa 'không, phường long trường' → ten 'long trường'", tachTienToPhuong("không, phường long trường")?.ten === "long trường");
ok("'phường nào vậy' → null (không phải tên)", tachTienToPhuong("phường nào vậy") === null);
ok("'phường 8, quận 5' → null (tên phải là chữ)", tachTienToPhuong("phường 8, quận 5") === null);
ok("'xã Tân Kiên đó em' → 'Xã Tân Kiên' (cắt chữ đệm, tiền tố viết hoa)", tachTienToPhuong("xã Tân Kiên đó em")?.ten_day_du === "Xã Tân Kiên", JSON.stringify(tachTienToPhuong("xã Tân Kiên đó em")));
ok("'xã Long Thượng cháu' → 'Xã Long Thượng' (lời xưng với người lớn tuổi — bắn thật 23/09)", tachTienToPhuong("xã Long Thượng cháu")?.ten_day_du === "Xã Long Thượng", JSON.stringify(tachTienToPhuong("xã Long Thượng cháu")));
ok("'phường Cô Giang' → giữ nguyên (chữ 'Cô' đứng giữa tên, không phải đệm cuối)", tachTienToPhuong("phường Cô Giang")?.ten_day_du === "Phường Cô Giang");
ok("'phường Tân Phú nha em ạ' → 'Tân Phú'", tachTienToPhuong("phường Tân Phú nha em ạ")?.ten === "Tân Phú");
ok("'phường An Phú Đông' giữ nguyên chữ Đông", tachTienToPhuong("phường An Phú Đông")?.ten === "An Phú Đông");
ok("chuanTenDuong: 'đường Lê Văn Việt' → 'Lê Văn Việt'; 'Đường số 7' giữ nguyên", chuanTenDuong("đường Lê Văn Việt") === "Lê Văn Việt" && chuanTenDuong("Đường số 7") === "Đường số 7");

// ── đường tra được không ──
ok("'Lê Văn Việt' tra được", duongTraDuoc("Lê Văn Việt"));
ok("'Đường số 7' KHÔNG tra (trùng khắp thành phố)", !duongTraDuoc("Đường số 7"));
ok("'duong 10' KHÔNG tra", !duongTraDuoc("duong 10"));
ok("rỗng / null KHÔNG tra", !duongTraDuoc("") && !duongTraDuoc(null));

// ── URL ──
const u = urlTraPhuong(" đường Lê Văn Việt ");
ok("URL ghim countrycodes=vn, addressdetails=1, limit=10 (biết đường có ở nhiều nơi), q có 'Thành phố Hồ Chí Minh'",
  /countrycodes=vn/.test(u) && /addressdetails=1/.test(u) && /limit=10(?!\d)/.test(u) && decodeURIComponent(u).endsWith("q=Lê Văn Việt, Thành phố Hồ Chí Minh"), u);

// ── câu hỏi xác nhận ──
const cau = cauXacNhanPhuong("Em tra thấy đường {duong} thuộc {phuong} ({quan} cũ), đúng không {ac}?", "anh", "Lê Văn Việt", "Phường Tăng Nhơn Phú", "Quận 9");
ok("câu xác nhận điền đủ đường/phường/quận/xưng hô", cau === "Em tra thấy đường Lê Văn Việt thuộc Phường Tăng Nhơn Phú (Quận 9 cũ), đúng không anh?", cau);
ok("câu xác nhận dưới 30 từ", cau.split(/\s+/).length < 30);

// 23/09/2026 (Zalo chủ dự án): "Trần Bình Trọng" — hình rút gọn từ câu trả lời THẬT của Nominatim (limit=8).
const TBT = ["Phường Bình Lợi Trung", "Phường Chợ Quán", "Phường Vườn Lài", "Phường Chợ Quán", "Phường Hạnh Thông"]
  .map((p) => ({ addresstype: "road", address: { road: "Trần Bình Trọng", suburb: p, city: "Thành phố Hồ Chí Minh" } }))
  .concat([{ addresstype: "road", address: { road: "Trần Bình Trọng", city: "Thành phố Hồ Chí Minh" } }]);
const cacTBT = docCacPhuongNominatim(TBT);
ok("docCacPhuongNominatim: Trần Bình Trọng → 4 phường KHÁC nhau (bỏ trùng Chợ Quán, bỏ kết quả không phường)",
  cacTBT.length === 4 && cacTBT.map((p) => p.ten_day_du).join("|") === "Phường Bình Lợi Trung|Phường Chợ Quán|Phường Vườn Lài|Phường Hạnh Thông", JSON.stringify(cacTBT));
ok("docCacPhuongNominatim: Lê Văn Việt một kết quả → một phường", docCacPhuongNominatim([{ addresstype: "road", address: { suburb: "Phường Tăng Nhơn Phú", city: "Thành phố Hồ Chí Minh" } }]).length === 1);
ok("docCacPhuongNominatim: rỗng / không phải mảng → []", docCacPhuongNominatim([]).length === 0 && docCacPhuongNominatim(null).length === 0);
const cauNhieu = cauNhieuNoiPhuong("anh", "Trần Bình Trọng", ["Quận 5", "Quận 10", "Bình Thạnh", "Gò Vấp", "Thủ Dầu Một"]);
ok("câu nhiều nơi: kể tối đa 4 quận + '…', hỏi phường + quận, không khẳng định phường nào",
  cauNhieu === "Đường Trần Bình Trọng có ở nhiều nơi (Quận 5, Quận 10, Bình Thạnh, Gò Vấp…), nhà mình thuộc phường nào, quận nào vậy anh?", cauNhieu);

// ── SRS-5.1zzzzzzm (14/10/2026): phường theo đường từ bảng `duong`, CHƯA CẦN biết quận; câu chọn kể kèm quận khi nhiều quận ──
{
  const { phuongQuanCuaDuong, cauChonPhuongQuan } = await import("../supabase/functions/_shared/extraction/tra-phuong.ts");
  const HCM = new Set(["Quận 7", "Huyện Nhà Bè", "Quận 5"]);
  const dong = [
    { phuong: "Phường Phú Thuận", quan_cu: "Quận 7" }, { phuong: "Phường Tân Mỹ", quan_cu: "Quận 7" }, { phuong: "Phường Tân Thuận", quan_cu: "Quận 7" },
    { phuong: "Phường Tân Thuận", quan_cu: "Quận 7" }, { phuong: "Xã Nhà Bè", quan_cu: "Huyện Nhà Bè" }, { phuong: "Phường Biên Hòa", quan_cu: "Đồng Nai" }, { phuong: "", quan_cu: null },
  ];
  const hopLe = (_p, q) => HCM.has(q);
  const cac = phuongQuanCuaDuong(dong, null, hopLe);
  ok("phuongQuanCuaDuong chưa biết quận → 4 cặp khác nhau, bỏ trùng, bỏ ngoài TP.HCM, bỏ dòng trống", cac.length === 4 && cac.every((x) => HCM.has(x.quan)), JSON.stringify(cac));
  const q7 = phuongQuanCuaDuong(dong, "Quận 7", hopLe);
  ok("phuongQuanCuaDuong biết Quận 7 → 3 phường Quận 7", q7.length === 3 && q7.every((x) => x.quan === "Quận 7"), JSON.stringify(q7));
  const cau = cauChonPhuongQuan("cô", "Huỳnh Tấn Phát", cac);
  ok("cauChonPhuongQuan nhiều quận → kể từng cụm kèm quận cũ",
    cau === "Đường Huỳnh Tấn Phát đoạn nhà mình thuộc Phường Phú Thuận, Phường Tân Mỹ hay Phường Tân Thuận (Quận 7 cũ), hay Xã Nhà Bè (Huyện Nhà Bè cũ) vậy cô?", cau);
  const cau1 = cauChonPhuongQuan("anh", "Trần Hưng Đạo", q7.slice(0, 2));
  ok("cauChonPhuongQuan một quận → câu chọn như cũ (không kèm quận)", cau1 === "Đường Trần Hưng Đạo đoạn nhà mình thuộc Phường Phú Thuận hay Phường Tân Mỹ vậy anh?", cau1);
}

console.log(`TRA PHƯỜNG (FR-209): ${dat}/${dat + hong} CA ĐẠT`);
if (hong) process.exit(1);
