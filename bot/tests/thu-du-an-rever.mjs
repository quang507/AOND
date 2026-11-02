// SRS-5.1zzzzzzz323 — bộ bóc / ghép của scripts/thu-du-an-rever.mjs trên HTML tự dựng (không lưu trang nguồn vào repo).
// Đỏ khi: bóc sai khối thông số hai mẫu trang; giá rao giữ tin gõ sai diện tích; dữ kiện trong chú thích HTML lọt vào; ghép đè ô đã có;
// tên trùng nhiều quận mà vẫn ghép bừa; dự án ngoài vùng lọt.
import assert from "node:assert/strict";
import { bocChiTiet, chonDong, vaGhep, tinhTrongVung, khoaTen } from "../../scripts/thu-du-an-rever.mjs";

const the = (gia, dt, loai = "mua") => `<article class="card card-listing"><a class="price-cost card-listing-price" href="https://rever.vn/${loai}/x">${gia}</a>
  <ul class="card-summary"><li><span class="text-summary">${dt} m²</span></li></ul></article>`;
const HTML = `<section class="block-header"><h1 class="is-h4">La Pura</h1>
  <span class="badge is-rounded is-primary">Rever phân phối chính thức</span><span class="badge is-rounded">Đang mở bán</span>
  <a href="#location" class="block-address is-underlined">Đại lộ Bình Dương, Lái Thiêu, Thuận An, Bình Dương</a></section>
  <li class="box-summary-item"><span>Khoảng giá</span></div><div class="value">46.77 - 62.5 triệu/ m²</div></li>
  <a href="/chu-dau-tu/phat-dat" class="value">Phát Đạt</a>
  <ul class="detail-more"><li><p class="left">Số block</p><p class="right notranslate">4</p></li>
  <li><p class="left">Mật độ xây dựng (%)</p><p class="right notranslate">0</p></li>
  <li><p class="left">Loại hình</p><p class="list-utilities is-align-right right"><span class="list-utilities-item">Căn hộ</span><span class="list-utilities-item">Shophouse</span></p></li></ul>
  <!-- <p class="left">Phí quản lý</p><p class="right">15.000 đ</p> -->
  <section id="amenity"><view-more><span class="value">Hồ bơi</span><span class="value">Gym</span></view-more></section>
  ${the("3.15 tỷ", 62)}${the("2.5 tỷ", 40)}${the("3.4 tỷ", 62633)}${the("12 triệu", 60, "thue")}`;

const R = bocChiTiet(HTML, "la-pura");
assert.equal(R.ten, "La Pura");
assert.equal(R.trang_thai, "Đang mở bán");
assert.equal(R.tinh, "Bình Dương"); assert.equal(R.quan, "Thuận An"); assert.equal(R.phuong, "Lái Thiêu");
assert.equal(R.khoang_gia, "46.77 - 62.5 triệu/ m²");
assert.equal(R.chu_dau_tu, "Phát Đạt");
assert.equal(R.du_kien["số block"], "4");
assert.equal(R.du_kien["loại hình"], "Căn hộ, Shophouse");
assert.ok(!("mật độ xây dựng" in R.du_kien), "0% là ô rỗng");
assert.ok(!JSON.stringify(R).includes("Phí quản lý"), "khối trong chú thích HTML không lọt");
assert.deepEqual(R.tien_ich, ["Hồ bơi", "Gym"]);
assert.deepEqual(R.gia_rao_ban, { so_tin: 2, tr_m2_thap: 50.8, tr_m2_giua: 50.8, tr_m2_cao: 62.5 }, "bỏ tin 62633 m²");
assert.equal(R.gia_rao_thue.so_tin, 1);

assert.equal(tinhTrongVung("Bà Rịa - Vũng Tàu"), "Bà Rịa - Vũng Tàu");
assert.equal(tinhTrongVung("Khánh Hòa"), null);
assert.equal(khoaTen("Căn hộ LA PURA (Bình Dương)"), "la pura");

const kho = [
  { id: "a", name: "La Pura", province: "Bình Dương", district: "Thuận An", developer: "Phát Đạt Group", amenities: ["Công viên"], specs: { gia_dong: "Giá từ 2 tỷ" } },
  { id: "b", name: "Sunrise", province: "Hồ Chí Minh", district: "Quận 7" }, { id: "c", name: "Sunrise", province: "Hồ Chí Minh", district: "Quận 2 (TP. Thủ Đức)" },
];
assert.equal(chonDong(R, kho).row.id, "a");
const v = vaGhep(kho[0], R);
assert.ok(!("developer" in v) && !("amenities" in v), "không đè ô đã có");
assert.equal(v.specs.gia_dong, "Giá từ 2 tỷ");
assert.equal(v.specs.rever.ten, "La Pura");
assert.equal(v.ward, "Lái Thiêu");
assert.equal(chonDong({ ...R, ten: "Sunrise", tinh: "Hồ Chí Minh", quan: "Quận 2" }, kho).row.id, "c");
assert.ok(chonDong({ ...R, ten: "Sunrise", tinh: "Hồ Chí Minh", quan: "Quận 9" }, kho).mo_ho, "mơ hồ thì không ghép bừa");
assert.equal(chonDong({ ...R, ten: "Dự án Mới Tinh" }, kho), null);
// Tên viết khác giữa hai nguồn (đo 02/11/2026 trên kho thật) — không ghép được thì đẻ dòng trùng.
const kho2 = [
  { id: "e", name: "Eco Retreat Long An", province: "Long An", district: "Huyện Bến Lức" },
  { id: "g", name: "Glory Heights - Vinhomes Grand Park", province: "Hồ Chí Minh", district: "Quận 9 (TP. Thủ Đức)" },
  { id: "w", name: "Khu Đô Thị Waterpoint", province: "Long An", district: "Huyện Bến Lức" },
  { id: "f", name: "Fiato City Nhơn Trạch", province: "Đồng Nai", district: "Huyện Nhơn Trạch" },
  { id: "l", name: "D'lusso Emerald", province: "Hồ Chí Minh", district: "Quận 2 (TP. Thủ Đức)" },
];
const thu = (ten, quan, tinh) => chonDong({ ten, quan, tinh }, kho2)?.row?.id ?? null;
assert.equal(thu("Eco Retreat", "Bến Lức", "Long An"), "e");
assert.equal(thu("Glory Heights", "Quận 9", "Hồ Chí Minh"), "g");
assert.equal(thu("WATERPOINT", "Bến Lức", "Long An"), "w");
assert.equal(thu("Fiato Updown Thủ Đức", "Thủ Đức", "Hồ Chí Minh"), null, "khác dự án thì không ghép");
assert.equal(thu("LUSSO SAIGON", "Thuận An", "Bình Dương"), null);
console.log("thu-du-an-rever: đạt");
