#!/usr/bin/env bun
// dia-chi.mjs — SRS-5.1zzzzzzm: ĐỊA CHỈ MỘT CỬA, phần THUẦN (tách số nhà / tên đường, chuẩn hoá vế đường). Không mạng, không DB.
//   bun bot/tests/dia-chi.mjs
// Ca gốc: người test thật 14/10/2026 — lượt chốt tin ghi "đường huỳnh tấn phát số 1235" đè lên "1235 Huỳnh Tấn Phát".
import { chuanHoaViTri, tachManhDiaChi, tenDuongDeTra } from "../supabase/functions/_shared/extraction/dia-chi.ts";

let dat = 0, hong = 0;
const ok = (ten, dk, chi = "") => { if (dk) dat++; else { hong++; console.log(`✗ ${ten}${chi ? `\n    ${chi}` : ""}`); } };
const bang = (ten, co, mong) => ok(`${ten} → ${JSON.stringify(mong)}`, co === mong, `có ${JSON.stringify(co)}`);

// ── tách mảnh ──
let m = tachManhDiaChi("đường huỳnh tấn phát số 1235");
ok("'đường huỳnh tấn phát số 1235' → số 1235, đường 'đường huỳnh tấn phát'", m.soNha === "1235" && m.tenDuong === "đường huỳnh tấn phát" && m.tienTo === "", JSON.stringify(m));
m = tachManhDiaChi("1235 Huỳnh Tấn Phát");
ok("'1235 Huỳnh Tấn Phát' → số 1235, đường 'Huỳnh Tấn Phát'", m.soNha === "1235" && m.tenDuong === "Huỳnh Tấn Phát", JSON.stringify(m));
m = tachManhDiaChi("số 12/3 Lê Văn Sỹ, phường 13");
ok("'số 12/3 Lê Văn Sỹ, phường 13' → số 12/3, đuôi 'phường 13'", m.soNha === "12/3" && m.tenDuong === "Lê Văn Sỹ" && m.duoi === "phường 13", JSON.stringify(m));
m = tachManhDiaChi("hẻm 120 Trần Hưng Đạo");
ok("'hẻm 120 Trần Hưng Đạo' → tiền tố 'hẻm 120', không số nhà", m.tienTo === "hẻm 120" && m.soNha === null && m.tenDuong === "Trần Hưng Đạo", JSON.stringify(m));
m = tachManhDiaChi("137/28 đường số 59");
ok("'137/28 đường số 59' → số 137/28, đường 'đường số 59' (số 59 là TÊN đường)", m.soNha === "137/28" && m.tenDuong === "đường số 59", JSON.stringify(m));
m = tachManhDiaChi("đường số 59");
ok("'đường số 59' → không số nhà (tên đường là số)", m.soNha === null && m.tenDuong === "đường số 59", JSON.stringify(m));
m = tachManhDiaChi("hẻm 4m Phạm Thế Hiển");
ok("'hẻm 4m Phạm Thế Hiển' → không số nhà (4m là bề rộng)", m.soNha === null, JSON.stringify(m));
m = tachManhDiaChi("4m Phạm Thế Hiển");
ok("'4m Phạm Thế Hiển' → không số nhà", m.soNha === null, JSON.stringify(m));
m = tachManhDiaChi("Hung Vuong Plaza 126 Hung Vuong");
ok("'Hung Vuong Plaza 126 Hung Vuong' → không đụng (số giữa câu không có chữ 'số')", m.soNha === null && m.tenDuong === "Hung Vuong Plaza 126 Hung Vuong", JSON.stringify(m));
m = tachManhDiaChi("huỳnh tấn phát số 1235");
ok("'huỳnh tấn phát số 1235' (không chữ đường) → số 1235", m.soNha === "1235" && m.tenDuong === "huỳnh tấn phát", JSON.stringify(m));
m = tachManhDiaChi("đường 3/2");
ok("'đường 3/2' → không số nhà", m.soNha === null, JSON.stringify(m));

// ── chuẩn hoá ──
bang("ca gốc: 'đường huỳnh tấn phát số 1235' + từ điển", chuanHoaViTri("đường huỳnh tấn phát số 1235", "Huỳnh Tấn Phát"), "1235 Huỳnh Tấn Phát");
bang("không từ điển vẫn đảo số nhà lên trước", chuanHoaViTri("đường huỳnh tấn phát số 1235"), "1235 huỳnh tấn phát");
bang("đã chuẩn → giữ nguyên", chuanHoaViTri("1235 Huỳnh Tấn Phát", "Huỳnh Tấn Phát"), "1235 Huỳnh Tấn Phát");
bang("'số 1235 huỳnh tấn phát' → bỏ chữ số, tên từ điển", chuanHoaViTri("số 1235 huỳnh tấn phát", "Huỳnh Tấn Phát"), "1235 Huỳnh Tấn Phát");
bang("'1235 đường huỳnh tấn phát' → bỏ chữ đường thừa", chuanHoaViTri("1235 đường huỳnh tấn phát", "Huỳnh Tấn Phát"), "1235 Huỳnh Tấn Phát");
bang("hẻm giữ chỗ, tên theo từ điển", chuanHoaViTri("hẻm 120 tran hung dao", "Trần Hưng Đạo"), "hẻm 120 Trần Hưng Đạo");
bang("đuôi sau dấu phẩy giữ nguyên", chuanHoaViTri("đường lê văn sỹ số 12/3, phường 13", "Lê Văn Sỹ"), "12/3 Lê Văn Sỹ, phường 13");
bang("từ điển KHÔNG khớp tên khách gõ → không thay tên", chuanHoaViTri("12 Lê Lai", "Lê Lợi"), "12 Lê Lai");
bang("không số nhà, không từ điển → chỉ gọt khoảng trắng", chuanHoaViTri("  đường   Nguyễn Trãi "), "đường Nguyễn Trãi");
bang("'hẻm 4m Phạm Thế Hiển' + từ điển → tên có dấu, 4m giữ", chuanHoaViTri("hem 4m pham the hien", "Phạm Thế Hiển"), "hem 4m Phạm Thế Hiển");
bang("tên đường là ngày: 'đường 3/2' không đổi", chuanHoaViTri("đường 3/2"), "đường 3/2");
bang("'137/28 đường số 59' → giữ (đường số là tên)", chuanHoaViTri("137/28 đường số 59"), "137/28 đường số 59");
// Cách nói mới chưa từng bắn.
bang("'nhà số 45 đường Nguyễn Trãi' → '45 Nguyễn Trãi'? (chữ 'nhà' đứng đầu là tên đường thô — không đoán, giữ)", chuanHoaViTri("nhà số 45 đường Nguyễn Trãi", "Nguyễn Trãi"), "nhà số 45 đường Nguyễn Trãi");
bang("'Lê Văn Việt số 449' → '449 Lê Văn Việt'", chuanHoaViTri("Lê Văn Việt số 449", "Lê Văn Việt"), "449 Lê Văn Việt");

// ── tên đường để tra ──
bang("tenDuongDeTra('đường huỳnh tấn phát số 1235')", tenDuongDeTra("đường huỳnh tấn phát số 1235"), "huỳnh tấn phát");
bang("tenDuongDeTra('hẻm 120 Trần Hưng Đạo')", tenDuongDeTra("hẻm 120 Trần Hưng Đạo"), "Trần Hưng Đạo");
bang("tenDuongDeTra('12/3 Lê Văn Sỹ, phường 13')", tenDuongDeTra("12/3 Lê Văn Sỹ, phường 13"), "Lê Văn Sỹ");

console.log(`\ndia-chi: ${dat} đạt, ${hong} hỏng`);
process.exit(hong ? 1 : 0);
