// timPhuongTrongCau (01/10/2026): tên phường/xã khách gõ trong câu địa chỉ → dò theo bảng `wards` thật (168 dòng của
// migration 20260915a). Chủ dự án: "lỡ người ta nói 156 đường 59 tây thông hội thì sao … nếu gần giống thì lôi ra".
// Chạy: bun bot/tests/phuong-trong-cau.mjs
import { timPhuongTrongCau } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { napPhuongThat } from "./e2e/mock-supabase.mjs";

const ds = napPhuongThat();
let hong = 0, tong = 0;
const ca = (cau, mong) => {
  tong++;
  const r = timPhuongTrongCau(cau, ds);
  const ra = r ? r.phuong.ten_day_du : null;
  const ok = ra === mong;
  if (!ok) hong++;
  console.log(`${ok ? "✓" : "✗"} ${JSON.stringify(cau)} → ${ra}${ok ? "" : `  (mong ${mong})`}`);
};
// Có tên phường → lôi ra (đúng, đảo chữ, không dấu, sai 1 ký tự, có chữ "phường").
ca("156 đường 59 Tây Thông Hội", "Phường Thông Tây Hội");
ca("156 đường 59 thong tay hoi", "Phường Thông Tây Hội");
ca("156 duong 59 phuong thong tay hôi", "Phường Thông Tây Hội");
ca("156 đường 59 Tây Thông Hội, gò vấp", "Phường Thông Tây Hội");
ca("nhà ở Thông Tây Hội em", "Phường Thông Tây Hội");
ca("ở an hội tây gò vấp", "Phường An Hội Tây");
ca("đường Thống Nhất, An Hội Tây", "Phường An Hội Tây");
ca("phường Nhiêu Lộc", "Phường Nhiêu Lộc");
ca("nhieu loc", "Phường Nhiêu Lộc");
ca("hẻm 4m Xô Viết Nghệ Tĩnh, Thạnh Mỹ Tây", "Phường Thạnh Mỹ Tây");
ca("Phan Xích Long p Đức Nhuận", "Phường Đức Nhuận");
ca("tan dinh q1", "Phường Tân Định");
ca("nhà ở phường gò vấp", "Phường Gò Vấp");
ca("phường Bình Thạnh", "Phường Bình Thạnh");
// Không phải phường / không chắc → null (không đoán).
ca("156 Phú Thọ Hòa", null);               // tên ĐƯỜNG ngay sau số nhà; đuôi "thọ hòa" không thành Thới Hòa
ca("đường Phú Thọ Hòa", null);
ca("hẻm 12 Lê Văn Việt", null);
ca("Lê Văn Sỹ quận 3", null);
ca("Bình Thạnh", null);                     // trùng tên quận cũ, không có chữ "phường"
ca("Xô Viết Nghệ Tĩnh bình thạnh", null);
ca("Huỳnh Văn Bánh Phú Nhuận", null);
// SRS-5.1zh (bắn thử thu-kb-s02): cụm đúng bằng tên quận cũ không được khớp sai-một-chữ sang phường quận khác ("Phú Thuận", Q7).
ca("nhà ở Phú Nhuận, 50m2, giá 6 tỷ 5", null);
ca("căn này ở phú nhuận em", null);
ca("o phu nhuan", null);
ca("ở phường Phú Thuận quận 7", "Phường Phú Thuận"); // có chữ "phường" + đúng tên → vẫn nhận
ca("Hai Bà Trưng quận 1", null);
ca("xã vĩnh lộc b", null);                  // tên CŨ (Vĩnh Lộc B) — đường tra phuong_cu lo, không khớp xã mới Vĩnh Lộc
ca("bán nhà 50m2 giá 6 tỷ", null);
ca("3 phòng ngủ", null);
ca("có lửng nha em", null);
// SRS-5.1zzzzzh (test Zalo 12/10): sau "hẻm / số nhà N" là TÊN ĐƯỜNG — "Trần Hưng" sai một chữ với phường Tân Hưng (Q7 cũ) không được khớp.
ca("hẻm 120 Trần Hưng Đạo quận 5", null);
ca("hẻm 120 trần hưng đạo", null);
ca("kiệt 45 tran hung dao", null);         // cách nói mới chưa bắn
ca("ngõ 12 Tân Hưng", null);               // sau "ngõ N" vẫn là tên đường, kể cả trùng tên phường
ca("đường 59 Tây Thông Hội", "Phường Thông Tây Hội"); // "đường N" (đường đánh số) thì chữ sau vẫn là phường (AI3 giữ nguyên)

console.log(hong ? `\nPHƯỜNG TRONG CÂU: ${hong}/${tong} CA HỎNG` : `\nPHƯỜNG TRONG CÂU: ${tong}/${tong} CA ĐẠT`);
if (hong) process.exit(1);
