// SRS-5.1zzzzzl: kiểm tất định câu khen dưới bản nháp (`khenHopLe`, _shared/extraction/khen-hop-le.ts). AI viết câu khen; code chỉ nhận câu mà
// mọi cụm dựa vào nằm nguyên văn trong bản tin và không có con số ngoài bản tin. Lượt soát nhận xét (kiem-khen.ts) chạy sau ở chat-reply.
import { khenHopLe } from "../supabase/functions/_shared/extraction/khen-hop-le.ts";

const BAN_TIN = `📋 Em sẽ rao như vầy nhé anh:
Chỉ 7,6 tỷ ô tô tận cửa tại Bình Hưng Hòa, Bình Tân
📍 Hương Lộ 3, Phường Bình Hưng Hòa, Quận Bình Tân
💰 7,6 tỷ
📐 Diện tích: 60m² · dài 10m
🏫 Tiện ích: mặt tiền 6m · gần trường mầm non · chợ · Bách Hóa Xanh · công viên`;

let dat = 0, hong = 0;
const la = (ten, ok, ct = "") => { if (ok) { dat++; console.log(`\x1b[32m✓\x1b[0m ${ten}`); } else { hong++; console.log(`\x1b[31m✗\x1b[0m ${ten}${ct ? `\n    ${ct}` : ""}`); } };

const tot = "Căn mình ô tô tận cửa, mặt tiền 6m lại gần trường mầm non, chợ, anh giới thiệu chi tiết quá ạ.";
la("KHEN-K1 (ca gốc) câu nhắc lại đúng chữ bản tin, cụm dựa vào có thật → nhận", khenHopLe(tot, ["ô tô tận cửa", "mặt tiền 6m", "gần trường mầm non"], BAN_TIN) === tot);
la("KHEN-K2 cụm dựa vào KHÔNG có trong bản tin ('hẻm sâu') → bỏ cả câu", khenHopLe("Căn mình hẻm sâu yên tĩnh, anh giới thiệu kỹ quá ạ.", ["hẻm sâu"], BAN_TIN) === null);
la("KHEN-K3 con số ngoài bản tin ('8m') → bỏ", khenHopLe("Căn mình mặt tiền 8m, ô tô tận cửa, anh giới thiệu rõ quá ạ.", ["ô tô tận cửa"], BAN_TIN) === null);
la("KHEN-K4 câu hỏi → bỏ", khenHopLe("Căn mình ô tô tận cửa, anh có muốn thêm ảnh không ạ?", ["ô tô tận cửa"], BAN_TIN) === null);
la("KHEN-K5 không khai cụm dựa vào → bỏ", khenHopLe(tot, [], BAN_TIN) === null);
la("KHEN-K6 model trả null → không có câu khen", khenHopLe(null, ["ô tô tận cửa"], BAN_TIN) === null);
la("KHEN-K7 (cách nói khác) 'gần chợ, công viên' + số có trong tin '60m²' → nhận", !!khenHopLe("Nhà 60m² gần chợ, công viên, anh kể rõ ràng quá ạ.", ["chợ", "công viên"], BAN_TIN));

console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong) process.exitCode = 1;

// SRS-5.1zzzzzn: lời nhận ảnh giấy tờ do AI viết — code kiểm số / câu hỏi.
import { loiNhanGiayToHopLe } from "../supabase/functions/_shared/extraction/khen-hop-le.ts";
{
  const ok2 = (ten, dk) => { console.log(`${dk ? "✓" : "✗"} ${ten}`); if (!dk) process.exitCode = 1; };
  ok2("GIAYTO-1 (ca gốc) «…sổ ghi 132m2, khớp với số em đã ghi» + sổ 132, đang ghi 132 → nhận",
    loiNhanGiayToHopLe("Dạ em nhận được ảnh sổ rồi anh chị, em cất riêng không đưa lên web. Sổ ghi 132m2, khớp với số em đã ghi ạ.", 132, 132) !== null);
  ok2("GIAYTO-2 (cách nói mới) chưa ghi diện tích, «trên sổ 85,5 m2 em lấy làm diện tích luôn nha» → nhận",
    loiNhanGiayToHopLe("Dạ sổ đỏ em nhận rồi chú, em giữ riêng không đăng lên web. Trên sổ 85,5 m2 em lấy làm diện tích luôn nha.", 85.5, null) !== null);
  ok2("GIAYTO-3 lộ số thửa «thửa 245» → bỏ (dùng câu soạn sẵn)", loiNhanGiayToHopLe("Dạ em nhận ảnh sổ rồi ạ, thửa 245, em cất riêng.", 132, 132) === null);
  ok2("GIAYTO-4 lời có câu hỏi → bỏ", loiNhanGiayToHopLe("Dạ em nhận ảnh sổ rồi ạ, anh còn bản nào nữa không?", 132, 132) === null);
  ok2("GIAYTO-5 số diện tích bịa (120 khi sổ 132) → bỏ", loiNhanGiayToHopLe("Dạ sổ ghi 120m2, em cất riêng rồi ạ.", 132, 132) === null);
}

// SRS-5.1zzzzzr: tiêu đề AI viết ("hoa văn tí") — code kiểm số + chữ cấm.
import { tieuDeHopLe } from "../supabase/functions/_shared/extraction/khen-hop-le.ts";
{
  const ok3 = (ten, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk ? "" : `\n    ${ct}`}`); if (!dk) process.exitCode = 1; };
  const TIN = "📋 Em sẽ rao như vầy nhé chú:\nChỉ 3,9 tỷ hẻm xe hơi tại Đông Thạnh, Hóc Môn\n📍 Bùi Công Trừng, Xã Đông Thạnh, Huyện Hóc Môn\n📐 Diện tích: 132m² · dài 22m\n🏗 Quy mô: trệt + lửng · 2 phòng ngủ\n🛣 Đường vào: hẻm xe hơi 5m\n💰 GIÁ 3,9 TỶ (còn thương lượng)";
  const td = "Chỉ 3,9 tỷ sở hữu ngay nhà trệt lửng hẻm xe hơi, sân rộng tại Đông Thạnh, Hóc Môn";
  ok3("TD-1 tiêu đề hoa văn đúng số, đúng khu → nhận", tieuDeHopLe(td, TIN) === td, String(tieuDeHopLe(td, TIN)));
  ok3("TD-1b 'nhà cấp 4' khi bản tin KHÔNG nói cấp 4 (nhà trệt lửng) → bỏ", tieuDeHopLe("Chỉ 3,9 tỷ sở hữu ngay nhà cấp 4 hẻm xe hơi tại Đông Thạnh, Hóc Môn", TIN) === null);
  ok3("TD-1c 'nhà cấp 4' khi bản tin có 'cấp 4' → nhận (4 là loại nhà, không phải số đo)",
    tieuDeHopLe("Chỉ 3,9 tỷ nhà cấp 4 hẻm xe hơi tại Đông Thạnh, Hóc Môn", TIN.replace("Quy mô: trệt + lửng", "Quy mô: nhà cấp 4")) !== null);
  ok3("TD-2 con số ngoài bản tin ('150m²') → bỏ", tieuDeHopLe("Chỉ 3,9 tỷ nhà cấp 4 150m² tại Hóc Môn", TIN) === null);
  ok3("TD-3 nói thị trường ('dễ bán', 'đầu tư') → bỏ", tieuDeHopLe("Chỉ 3,9 tỷ nhà cấp 4 dễ bán tại Hóc Môn", TIN) === null && tieuDeHopLe("Chỉ 3,9 tỷ nhà đầu tư sinh lời tại Hóc Môn", TIN) === null);
  ok3("TD-4 không mở bằng 'Chỉ' / có '!' / quá dài → bỏ", tieuDeHopLe("Nhà cấp 4 hẻm xe hơi 3,9 tỷ tại Hóc Môn", TIN) === null && tieuDeHopLe("Chỉ 3,9 tỷ nhà đẹp lắm!", TIN) === null && tieuDeHopLe("Chỉ 3,9 tỷ " + "nhà xinh ".repeat(15), TIN) === null);
  // SRS-5.1zzzzzu: tiêu đề "cachy" không bắt mở bằng "Chỉ"; tin thuê cũng có; vẫn phải có con số và mọi số nằm trong bản tin.
  const TIN_THUE = "📋 Em sẽ rao như vầy nhé anh:\nCho thuê nhà hẻm xe hơi 5m Dương Bá Trạc Phường Chánh Hưng Q.8, 21.5m², trệt + 2 lầu, 2PN, giá 6 triệu/tháng\n📍 Dương Bá Trạc, Phường Chánh Hưng, Quận 8\n💰 GIÁ 6 TRIỆU/THÁNG";
  ok3("TD-6 tiêu đề thuê 'Cho thuê nguyên căn hẻm 5m Dương Bá Trạc, 2PN, dọn vào ngay, 6 triệu/tháng' → nhận",
    tieuDeHopLe("Cho thuê nguyên căn hẻm 5m Dương Bá Trạc, 2PN, dọn vào ngay, 6 triệu/tháng", TIN_THUE) !== null);
  ok3("TD-6b tiêu đề bán giá đứng cuối 'Nhà hẻm xe hơi Đông Thạnh 132m², sân rộng, chỉ 3,9 tỷ' → nhận", tieuDeHopLe("Nhà hẻm xe hơi Đông Thạnh 132m², sân rộng, chỉ 3,9 tỷ", TIN) !== null);
  ok3("TD-7 tiêu đề không có con số nào → bỏ", tieuDeHopLe("Nhà xinh hẻm xe hơi Đông Thạnh, về ở liền", TIN) === null);
  ok3("TD-5 null / rỗng → null", tieuDeHopLe(null, TIN) === null && tieuDeHopLe("", TIN) === null);
}


// SRS-5.1zzzzzz (chủ dự án 13/10/2026: "Chọn lọc các tiện ích trong tin dự án để đưa ra ý ngon nghẻ"): AI chọn ≤ 4 tiện ích + viết gọn; code kiểm.
import { tienIchNoiBatHopLe } from "../supabase/functions/_shared/extraction/khen-hop-le.ts";
{
  const ok3 = (ten, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk || !ct ? "" : `\n    ${ct}`}`); if (!dk) process.exitCode = 1; };
  const Y = ["sân trước và giếng trời sân sau", "Thông ra ĐT 835D chỉ 200 mét", "Chợ Rạch Kiến hoặc Chợ Phước Vân ~ 3 - 5 phút", "UBND xã và trạm y tế ~ 2 - 3 phút",
    "Hệ thống trường học các cấp ~ 10 phút", "Khu công nghiệp Cầu Tràm ~ 10 phút", "Chợ Bình Chánh ~ 20 phút", "Vinhomes Hưng Long Bình Chánh ~ 20 phút", "cao tốc Bến Lức - Long Thành"];
  const r = tienIchNoiBatHopLe([
    { goc: "Thông ra ĐT 835D chỉ 200 mét", gon: "ra ĐT 835D 200m" },
    { goc: "Chợ Rạch Kiến hoặc Chợ Phước Vân ~ 3 - 5 phút", gon: "chợ Rạch Kiến, Phước Vân 3–5 phút" },
    { goc: "Khu công nghiệp Cầu Tràm ~ 10 phút", gon: "KCN Cầu Tràm 10 phút" },
    { goc: "cao tốc Bến Lức - Long Thành", gon: "cao tốc Bến Lức - Long Thành" },
    { goc: "Hệ thống trường học các cấp ~ 10 phút", gon: "trường học các cấp 10 phút" },
  ], Y);
  ok3("TICH-1 (ca gốc KDC Cầu Tràm) 5 ý AI chọn → nhận 4 đầu, chữ gọn giữ tên riêng + số; 'KCN' nhận vì gốc có 'Khu công nghiệp'",
    r.length === 4 && r.map((x) => x.in).join(" · ") === "ra ĐT 835D 200m · chợ Rạch Kiến, Phước Vân 3–5 phút · KCN Cầu Tràm 10 phút · cao tốc Bến Lức - Long Thành", JSON.stringify(r));
  const r2 = tienIchNoiBatHopLe([{ goc: "Chợ Bình Chánh ~ 20 phút", gon: "chợ Bình Chánh 5 phút" }, { goc: "Vinhomes Hưng Long Bình Chánh ~ 20 phút", gon: "Vinhomes Hưng Long sầm uất" },
    { goc: "Siêu thị Co.opmart", gon: "Co.opmart" }], Y);
  ok3("TICH-2 gon đổi số (20 → 5) → in ý gốc; gon thêm nhận định 'sầm uất' → in ý gốc; goc không có trong danh sách (bịa) → bỏ",
    r2.length === 2 && r2[0].in === "Chợ Bình Chánh ~ 20 phút" && r2[1].in === "Vinhomes Hưng Long Bình Chánh ~ 20 phút", JSON.stringify(r2));
  const r3 = tienIchNoiBatHopLe([{ goc: "chợ rạch kiến hoặc chợ phước vân ~ 3 - 5 phút", gon: "chợ Rạch Kiến 3–5 phút" }, { goc: "Chợ Rạch Kiến hoặc Chợ Phước Vân ~ 3 - 5 phút", gon: "chợ Phước Vân" }], Y);
  ok3("TICH-3 goc chép lệch hoa thường / dấu vẫn khớp (so bỏ dấu); ý trùng chọn hai lần chỉ nhận một", r3.length === 1 && r3[0].in === "chợ Rạch Kiến 3–5 phút", JSON.stringify(r3));
  ok3("TICH-4 gon có tên riêng KHÔNG có trong gốc ('Aeon Mall') → in ý gốc", tienIchNoiBatHopLe([{ goc: "Chợ Bình Chánh ~ 20 phút", gon: "chợ Bình Chánh, Aeon Mall 20 phút" }], Y)[0]?.in === "Chợ Bình Chánh ~ 20 phút");
  ok3("TICH-5 không có / rỗng → []", tienIchNoiBatHopLe(null, Y).length === 0 && tienIchNoiBatHopLe([], Y).length === 0);
}

// SRS-5.1zzzzzzo (14/10/2026): trần token đầu ra của lượt khen phải đủ cho KHUÔN ĐẦY — khuôn đã thêm tieu_de / tien_ich / quy_mo /
// tien_ich_noi_bat (4 × goc + gon) mà trần giữ 300 từ lúc chỉ có `khen` → JSON cắt giữa chuỗi ("Unterminated string … position 503", sổ lỗi
// 13/10 09:03 và 14/10 04:47), cả lượt ném, bản nháp mất tiêu đề AI + gom tiện ích. Khuôn đầy ước ~1.400 ký tự tiếng Việt ≈ 700 token.
// Đỏ khi: ai hạ trần xuống dưới 900, hay thêm trường vào khuôn mà quên trần (soi độ dài mô tả khuôn làm số đo thô).
{
  const ok4 = (ten, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk || !ct ? "" : `\n    ${ct}`}`); if (!dk) process.exitCode = 1; };
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../supabase/functions/_shared/ai/khen-nhap.ts", import.meta.url), "utf8");
  const tran = Number(/max_tokens:\s*(\d+)/.exec(src)?.[1] ?? 0);
  ok4("TRAN-1 lượt khen bản nháp: max_tokens ≥ 900 (khuôn đầy ~700 token; 300 từng cắt JSON hai lần trên tin thật)", tran >= 900, `max_tokens = ${tran}`);
  // Mỗi trường trong khuôn là một chuỗi tiếng Việt khách đọc được; đếm trường z.string/z.array → trần phải ≥ 120 token mỗi trường
  // (ước thô: trường dài nhất là tien_ich_noi_bat 4 × ~120 ký tự). Thêm trường mà không nâng trần là đỏ.
  const soTruong = (src.match(/^\s+[a-z_]+:\s*z\./gm) ?? []).length;
  ok4(`TRAN-2 khuôn có ${soTruong} trường → trần ≥ ${soTruong * 120} token`, tran >= soTruong * 120, `max_tokens = ${tran}`);
}
