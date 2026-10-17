#!/usr/bin/env bun
// khop-ten-nghia.mjs — máy xác nhận ứng viên tìm theo NGHĨA (vector) cho tên dự án / tên đường gõ sai (30/09/2026, SRS-5.1e).
import { chonUngVienNghia, tenGan, TU_CHUNG_DU_AN, TU_CHUNG_DUONG } from "../supabase/functions/_shared/extraction/khop-ten-nghia.ts";

let dat = 0, hong = 0;
const ok = (ten, dk, chiTiet = "") => { if (dk) { dat++; console.log(`✓ ${ten}`); } else { hong++; console.log(`✗ ${ten}${chiTiet ? `\n     → ${chiTiet}` : ""}`); } };

for (const [go, kho, bo, mong] of [
  ["vinhome gran park", "Vinhomes Grand Park", TU_CHUNG_DU_AN, true],
  ["vinhomes central park", "Vinhomes Grand Park", TU_CHUNG_DU_AN, false],
  ["sun rise city", "Sunrise City", TU_CHUNG_DU_AN, true],
  ["mastery thảo điền", "Masteri Thảo Điền", TU_CHUNG_DU_AN, true],
  ["everich infinity", "The Everrich Infinity", TU_CHUNG_DU_AN, true],
  ["ben cat center city 2", "Bến Cát Center City 3", TU_CHUNG_DU_AN, false], // chữ số phải y hệt
  ["abc", "ABC Tower", TU_CHUNG_DU_AN, false],                              // quá ngắn, không đoán
  ["huyn tan fat", "Huỳnh Tấn Phát", TU_CHUNG_DUONG, true],
  ["nguyen thi min khai", "Nguyễn Thị Minh Khai", TU_CHUNG_DUONG, true],
  ["duong so 5", "Đường số 6", TU_CHUNG_DUONG, false],
  ["le van sy", "Lê Văn Thọ", TU_CHUNG_DUONG, false],
  ["tran hung dao", "Trần Quốc Toản", TU_CHUNG_DUONG, false],
]) ok(`tenGan('${go}', '${kho}') = ${mong}`, tenGan(go, kho, bo) === mong);

const ds = [
  { ten: "Vinhomes Central Park", do_gan: 0.84 },
  { ten: "Vinhomes Grand Park", do_gan: 0.82 },
  { ten: "Vinhomes Golden River", do_gan: 0.8 },
];
ok("chonUngVienNghia: chọn Grand Park dù Central Park gần nghĩa hơn", chonUngVienNghia("vinhome gran park", ds, TU_CHUNG_DU_AN)?.ten === "Vinhomes Grand Park");
ok("chonUngVienNghia: không tên nào gần chữ → null", chonUngVienNghia("saigon pearl", ds, TU_CHUNG_DU_AN) === null);
ok("chonUngVienNghia: dưới ngưỡng nghĩa → null", chonUngVienNghia("vinhome gran park", [{ ten: "Vinhomes Grand Park", do_gan: 0.4 }], TU_CHUNG_DU_AN) === null);
ok("chonUngVienNghia: hai tên KHÁC nhau cùng gần chữ ('Lê Văn Sỹ', 'Lê Văn Sĩ') → null (không đoán)",
  chonUngVienNghia("le van si", [{ ten: "Lê Văn Sỹ", do_gan: 0.8 }, { ten: "Lê Văn Sĩ", do_gan: 0.79 }], TU_CHUNG_DUONG) === null);
ok("chonUngVienNghia: cùng một tên nhiều dòng (nhiều phường) → vẫn là MỘT tên",
  chonUngVienNghia("huyn tan fat", [{ ten: "Huỳnh Tấn Phát", do_gan: 0.8 }, { ten: "Huỳnh Tấn Phát", do_gan: 0.78 }], TU_CHUNG_DUONG)?.ten === "Huỳnh Tấn Phát");
ok("chonUngVienNghia: 'Sunrize City' → Sunrise City dù 'Khu Căn Hộ Sunrise' cùng lõi khi bỏ từ chung (bắn thật 30/09)",
  chonUngVienNghia("Sunrize City", [{ ten: "Sunrise City", do_gan: 0.73 }, { ten: "Khu Đô Thị Sinh Thái Sunrise River", do_gan: 0.701 },
    { ten: "Khu Căn Hộ Sunrise", do_gan: 0.697 }, { ten: "Sunrise Riverside", do_gan: 0.694 }], TU_CHUNG_DU_AN)?.ten === "Sunrise City");
ok("chonUngVienNghia: 'sunrise' trơn, hai tên cùng lõi và tên đầy đủ đều xa → null (không đoán)",
  chonUngVienNghia("sunrise", [{ ten: "Sunrise City", do_gan: 0.73 }, { ten: "Khu Căn Hộ Sunrise", do_gan: 0.72 }], TU_CHUNG_DU_AN) === null);

console.log(hong ? `\nKHỚP TÊN THEO NGHĨA: ${hong} CA HỎNG` : `\nKHỚP TÊN THEO NGHĨA: ${dat}/${dat} CA ĐẠT`);
process.exit(hong ? 1 : 0);
