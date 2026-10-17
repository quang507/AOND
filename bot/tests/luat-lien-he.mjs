#!/usr/bin/env node
// luat-lien-he.mjs — LUẬT CHE LIÊN HỆ, MỘT NGUỒN CHO WEB VÀ BOT (tầng bốn, 11/09).
//
// Hai chỗ dùng (`lib/format.ts sanitizeDescription` và `chat-reply locLienHe`)
// nay cùng gọi `thayLienHe`. Bài này kiểm chính cái hàm đó, trên đúng hai nhãn
// mà hai chỗ dùng — vì lỗi đầu tiên nó bắt được nằm ở TƯƠNG TÁC giữa nhãn và
// luật: nhãn có chữ "Zalo", luật mạng xã hội khớp chữ "Zalo", nên bản cũ hai
// lượt `replace` chèn nhãn vào giữa nhãn ("[liên hệ qua [liên hệ qua Zalo…").
import { thayLienHe, thayLienHeCoId, coSdt } from "../supabase/functions/_shared/extraction/luat-lien-he.ts";

const NHAN_WEB = " [liên hệ qua Zalo AI Ơi Nhà Đất] ";
const NHAN_BOT = " [liên hệ qua Zalo] ";
let dat = 0, hong = 0;
const la = (ten, thuc, mong) => {
  if (thuc === mong) { dat++; console.log(`\x1b[32m✓\x1b[0m ${ten}`); }
  else { hong++; console.log(`\x1b[31m✗\x1b[0m ${ten}\n    thật ${JSON.stringify(thuc)}\n    mong ${JSON.stringify(mong)}`); }
};
const gon = (s) => s.replace(/\s+/g, " ").trim();

console.log("LUẬT CHE LIÊN HỆ — web và bot cùng một hàm\n");

for (const [ai, nhan] of [["web", NHAN_WEB], ["bot", NHAN_BOT]]) {
  const n = gon(nhan);
  la(`${ai}: SĐT + zalo trong cùng câu → hai nhãn, KHÔNG lồng nhau (11/09)`,
    gon(thayLienHe("gọi 0903 123 456 hoặc zalo: abc", nhan)), `gọi ${n} hoặc ${n}`);
  la(`${ai}: gọi lần hai trên KẾT QUẢ lần một thì không đổi gì thêm (không lồng khi lọc lại)`,
    gon(thayLienHe(thayLienHe("gọi 0903123456", nhan), nhan)).split(n).length - 1, 1);
}

la("SĐT có chấm: 0903.123.456", gon(thayLienHe("lh 0903.123.456", NHAN_BOT)), `lh ${gon(NHAN_BOT)}`);
la("SĐT đầu +84", gon(thayLienHe("lh +84 903 123 456", NHAN_BOT)), `lh ${gon(NHAN_BOT)}`);
la("facebook kèm tên", gon(thayLienHe("fb: nha.dat.q5", NHAN_BOT)), gon(NHAN_BOT));
la("KHÔNG đụng giá tiền: '5 tỷ 2'", thayLienHe("giá 5 tỷ 2", NHAN_BOT), "giá 5 tỷ 2");
la("KHÔNG đụng diện tích: '4x15, 60m2'", thayLienHe("4x15, 60m2", NHAN_BOT), "4x15, 60m2");
la("KHÔNG đụng số nhà ngắn: 'hẻm 572/12'", thayLienHe("hẻm 572/12", NHAN_BOT), "hẻm 572/12");
// ── 13/09/2026 (review code): chữ sau "Zalo" bị nuốt, số tiền dài bị che ──────
const L = gon(NHAN_BOT);
for (const [cau, mong] of [
  ["Chat Zalo trao đổi thêm", `Chat ${L} trao đổi thêm`],
  ["Liên hệ Zalo nhé anh", `Liên hệ ${L} nhé anh`],
  ["Đã gửi qua Zalo rồi ạ", `Đã gửi qua ${L} rồi ạ`],
  ["Em nhắn Zalo cho mình nha", `Em nhắn ${L} cho mình nha`],
  ["nhắn zalo cho minh nha", `nhắn ${L} cho minh nha`],
  ["Diện tích 100m2, giá 10.000.000.000", "Diện tích 100m2, giá 10.000.000.000"],
  ["giá 1000000000 đ", "giá 1000000000 đ"],
  ["giá 84.000.000.000", "giá 84.000.000.000"],
  ["doanh thu 1.200.000.000/năm", "doanh thu 1.200.000.000/năm"],
  ["mã số thuế 0312345678901", "mã số thuế 0312345678901"],
]) la(`KHÔNG làm hỏng: ${JSON.stringify(cau)}`, gon(thayLienHe(cau, NHAN_BOT)), mong);
// VẪN phải che — vá ranh giới mà để lọt SĐT là tệ hơn lỗi cũ.
for (const [cau, mong] of [
  ["zalo 0903123456", L],
  ["Zalo: nhadat.q5", L],
  ["zalo:0903.123.456 anh Tuấn", `${L} anh Tuấn`],
  ["fb nha.dat.q5 nha", `${L} nha`],
  ["facebook.com/nhadatq5", L],
  ["lh:0903123456", `lh: ${L}`],
  ["gọi 090.312.3456 nhé", `gọi ${L} nhé`],
  ["sdt 84903123456", `sdt ${L}`],
  ["bàn 028 3855 1234", `bàn ${L}`],
  ["giá 5 tỷ, lh 0903123456", `giá 5 tỷ, lh ${L}`],
]) la(`VẪN che: ${JSON.stringify(cau)}`, gon(thayLienHe(cau, NHAN_BOT)), mong);

la("coSdt gọi hai lần liền trên cùng câu vẫn true (không kẹt lastIndex)",
  [coSdt("0903123456"), coSdt("0903123456")].join(","), "true,true");

// 22/09/2026 (bộ đo giọng M03): câu BOT tự nói — "Zalo" trần giữ, kênh có ID / SĐT vẫn che.
la("bot nói 'liên hệ qua Zalo' → giữ nguyên chữ", gon(thayLienHeCoId("anh chị phụ trách sẽ liên hệ qua Zalo với mình ạ", NHAN_BOT)), "anh chị phụ trách sẽ liên hệ qua Zalo với mình ạ");
la("bot lỡ chép 'zalo: abc' → che", gon(thayLienHeCoId("nhắn zalo: abc nha", NHAN_BOT)), `nhắn ${gon(NHAN_BOT)} nha`);
la("bot lỡ chép SĐT → che", gon(thayLienHeCoId("gọi 0903 123 456 nha", NHAN_BOT)), `gọi ${gon(NHAN_BOT)} nha`);
la("'fb nha.dat.q5' (ID có dấu chấm) → che", gon(thayLienHeCoId("xem fb nha.dat.q5", NHAN_BOT)), `xem ${gon(NHAN_BOT)}`);

console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong) { console.log("\x1b[31mLUẬT CHE LIÊN HỆ HỎNG\x1b[0m"); process.exitCode = 1; }
else console.log("\x1b[32mLUẬT CHE LIÊN HỆ ĐẠT\x1b[0m");
