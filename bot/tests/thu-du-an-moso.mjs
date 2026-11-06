// SRS-5.1zzzzzzz388 — bộ kiểm tra bóc / ghép / bổ sung dữ liệu MOSO (scripts/thu-du-an-moso.mjs).
import assert from "node:assert/strict";
import { cacKhoa, chonDong, vaGhep, dongMoi, chuyenDoiUnitTypes } from "../../scripts/thu-du-an-moso.mjs";

// 1. Kiểm tra chuyển đổi unit types
const loai = chuyenDoiUnitTypes(["apartment", "townhouse", "shophouse"]);
assert.deepEqual(loai, [
  "Căn hộ chung cư",
  "Nhà phố liền kề",
  "Nhà phố thương mại (Shophouse)",
]);

// 2. Mẫu dữ liệu MOSO
const M = {
  name: "Sunshine Sky City",
  url: "https://moso.vn/sunshine-sky-city-xyz",
  developer: "Sunshine Group",
  district: "Quận 7",
  province: "TP.HCM",
  location_raw: "Đường Phú Thuận, Phường Tân Phú, Quận 7, TP.HCM",
  unit_types: ["apartment"],
  unit_type_label: "Căn hộ chung cư",
  sale_status: "open",
  status_text: "Đang mở bán",
  price_min: 3500000000,
  price_max: 7000000000,
  average_price_m2: 65000000,
  number_of_units: 3450,
  bank_support: true,
  max_loan_ratio: 70,
};

// 3. Khóa tên
const k = cacKhoa("Dự án Sunshine Sky City", "Quận 7", "Hồ Chí Minh");
assert.ok(k.has("sunshine sky city"));

// 4. Ghép không đè
const kho = [
  {
    id: "p1",
    name: "Sunshine Sky City",
    province: "Hồ Chí Minh",
    district: "Quận 7",
    developer: "Sunshine Group",
    status_text: null,
    price_min: null,
    price_max: null,
    specs: {},
    thong_tin: {},
  },
  {
    id: "p2",
    name: "Saigon Pearl",
    province: "Hồ Chí Minh",
    district: "Bình Thạnh",
  },
];

const c = chonDong(M, kho);
assert.equal(c.row.id, "p1");

const v = vaGhep(c.row, M);
assert.equal(v.status_text, "Đang mở bán");
assert.equal(v.price_min, 3500000000);
assert.equal(v.price_max, 7000000000);
assert.equal(v.specs.moso.name, "Sunshine Sky City");
assert.equal(v.thong_tin.thuoc_tinh["Hỗ trợ vay ngân hàng"], "Tối đa 70%");
assert.equal(v.thong_tin.thuoc_tinh["Vốn tự có tối thiểu"], "30%");

// 5. Dự án mới hoàn toàn
const moi = dongMoi(M);
assert.equal(moi.name, "Sunshine Sky City");
assert.equal(moi.source, "moso");
assert.equal(moi.province, "Hồ Chí Minh");
assert.equal(moi.priority, 70);
assert.equal(moi.thong_tin.thuoc_tinh["Hỗ trợ vay ngân hàng"], "Tối đa 70%");

console.log("thu-du-an-moso: đạt");
