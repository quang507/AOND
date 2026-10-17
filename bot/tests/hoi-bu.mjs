// SRS-5.1zzzzzzz18 — hỏi bù (ask-seller drip): không hỏi vỏ tin rỗng khi người rao còn tin khác; câu mở đầu không cảm ơn "đã gửi tin".
// Ca gốc: Zalo thật 14/10/2026 11:22 "Dạ em cảm ơn chị đã gửi tin nha. Chung cư mình nằm đường nào, khu nào chị ạ?" về vỏ tin rỗng,
// trong khi căn hộ thật của chị đã lên kệ ở tin khác.
import { readFileSync } from "node:fs";
import { laVoTinRong, moDauHoiBu } from "../supabase/functions/_shared/extraction/hoi-bu.ts";

const R = [];
const kiem = (ten, ok, chiTiet = "") => R.push([ten, !!ok, chiTiet]);

// Ca gốc: vỏ BDS-CH-XX-0001 (chỉ có loại chung_cu) — rỗng.
kiem("HB-01 (ca gốc) vỏ chỉ có loại BĐS → rỗng", laVoTinRong({ price_raw: null, area_m2: null, location_raw: null, ward: null, district: null, project_id: null }));
kiem("HB-02 tin có giá → không rỗng", !laVoTinRong({ price_raw: "1,3 tỷ" }));
kiem("HB-03 (cách nói mới) tin chỉ có dự án gắn từ kho → không rỗng", !laVoTinRong({ project_id: "x" }));
kiem("HB-04 tin chỉ có quận → không rỗng", !laVoTinRong({ district: "Quận 5" }));
kiem("HB-05 địa chỉ toàn khoảng trắng vẫn là rỗng", laVoTinRong({ location_raw: "   " }));

const m1 = moDauHoiBu("căn hộ", "Ấp 18 Khu dân cư 584");
kiem("HB-06 câu mở nói rõ hỏi về căn nào, không 'cảm ơn … gửi tin'", m1 === "Dạ, em hỏi thêm một ý về căn hộ ở Ấp 18 Khu dân cư 584 nha. " && !/cảm ơn/.test(m1), m1);
const m2 = moDauHoiBu("đất", null);
kiem("HB-07 tin chưa có nơi chốn → chỉ nói loại", m2 === "Dạ, em hỏi thêm một ý về đất nha. ", m2);

// Nguồn ask-seller: cổng vỏ rỗng có mặt, câu mở cũ không còn (đỏ khi gỡ bản sửa).
const src = readFileSync(new URL("../supabase/functions/ask-seller/index.ts", import.meta.url), "utf8");
kiem("HB-08 ask-seller chặn vỏ tin rỗng khi người rao có tin khác đang mở", /laVoTinRong\(listing\)/.test(src) && /neq\("id", listing_id\)/.test(src));
kiem("HB-09 ask-seller không còn câu mở 'cảm ơn … đã gửi tin'", !/đã gửi tin nha/.test(src) && /moDauHoiBu\(/.test(src));

let hong = 0;
for (const [ten, ok, ct] of R) {
  console.log(`${ok ? "✓" : "✗"} ${ten}${ok ? "" : `\n    ${ct}`}`);
  if (!ok) hong++;
}
console.log(`\n${hong}/${R.length} CA HỎNG`);
process.exit(hong ? 1 : 0);
