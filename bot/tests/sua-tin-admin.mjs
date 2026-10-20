// SRS-5.1zzzzzzz89 (20/10/2026): màn Sửa tin + rổ hàng. Đỏ khi (a) nhãn "chờ khách duyệt" lệch điều kiện DB `listing_du_dang_tin`,
// (b) nút "Lưu" / đổi trạng thái nhanh lại xoá dấu chờ khách duyệt (`can_chu_duyet: false`) — tức tự đưa tin lên web không qua "rao".
import { readFileSync } from "node:fs";
import { choKhachDuyet, thieuDeDang } from "../../lib/trang-thai-tin.ts";

let loi = 0;
const kiem = (ten, dk) => { console.log(`${dk ? "✓" : "✗"} ${ten}`); if (!dk) loi = 1; };

const du = { status: "cho_thong_tin", price_vnd: 16e9, area_m2: 80, ward: "Phường Bình Thới", can_chu_duyet: true, chu_duyet_at: null };
kiem("đủ ý, chưa duyệt → chờ khách duyệt", choKhachDuyet(du));
kiem("đã duyệt → không còn chờ", !choKhachDuyet({ ...du, chu_duyet_at: "2026-10-20T00:00:00Z" }));
kiem("tin admin tạo (không cần duyệt) → không chờ", !choKhachDuyet({ ...du, can_chu_duyet: false }));
kiem("thiếu phường → chờ thông tin, không phải chờ duyệt", !choKhachDuyet({ ...du, ward: " " }));
kiem("thiếu đúng ba ô của DB", JSON.stringify(thieuDeDang({ price_vnd: null, area_m2: null, ward: null })) === '["giá","diện tích","phường"]');

const modal = readFileSync(new URL("../../components/admin/SuaTinModal.tsx", import.meta.url), "utf8");
const rohang = readFileSync(new URL("../../app/admin/ro-hang/page.tsx", import.meta.url), "utf8");
const xoaDau = (s) => [...s.matchAll(/can_chu_duyet:\s*false/g)].map((m) => s.slice(Math.max(0, m.index - 40), m.index));
kiem("màn Sửa chỉ bỏ dấu duyệt ở nhánh rao", xoaDau(modal).length === 1 && xoaDau(modal)[0].includes('hanhDong === "rao"'));
kiem("đổi trạng thái nhanh không bỏ dấu duyệt", xoaDau(rohang).length === 0);
kiem("rao thiếu giá / diện tích / phường thì chặn, không hỏi vẫn rao", modal.includes("Chưa rao được: thiếu"));
process.exit(loi);
