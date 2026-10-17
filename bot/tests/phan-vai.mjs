// phan-vai.mjs — FR-205 (11/09/2026): van gọi model phân vai + dọn kết quả model.
// Tiền định: không mạng, không DB, không model. Chạy: bun bot/tests/phan-vai.mjs
//
// Hai lời hứa được đo ở đây: (1) câu không dính gì tới nhà đất ("chào em",
// "ok em", "để anh hỏi vợ đã em") KHÔNG tốn lượt model; (2) model nói "bán" mà
// cụm làm bằng không có trong câu khách gõ thì KHÔNG được tin.
import { coMuiBDS, nenHoiModelVai, donVai } from "../supabase/functions/_shared/extraction/phan-vai-loc.ts";

let dat = 0, hong = 0;
const la = (ten, thuc, mong) => {
  if (thuc === mong) { dat++; console.log(`\x1b[32m✓\x1b[0m ${ten}`); }
  else { hong++; console.log(`\x1b[31m✗\x1b[0m ${ten}\n    thật ${JSON.stringify(thuc)}\n    mong ${JSON.stringify(mong)}`); }
};

const CAU_BAN = "Gia đình cần tiền nên để lại căn nhà 4x16 hẻm xe hơi Trần Hưng Đạo q5, sổ hồng riêng";
const CAU_MUA = "nhà 4x16 hẻm xe hơi quận 5 tầm 6 tỷ, mẹ già nên cần gần bệnh viện";
const TRONG = { coHoSoBan: false, raoTheoLuat: false, muaTheoLuat: false, daCoHoSoMua: false, coAnh: false, nhacMaCan: false, doiGoi: false };

console.log("FR-205 — VAN PHÂN VAI BẰNG MODEL\n");

for (const c of [CAU_BAN, CAU_MUA, "ban nha q10 hem 3m", "căn hộ 2pn view sông 4ty3", "đất thổ cư 100m2 Củ Chi", "chủ đi nước ngoài cần ra gấp miếng đất 5x20"]) {
  la(`có mùi nhà đất: "${c}"`, coMuiBDS(c), true);
}
for (const c of ["chào em", "alo em", "em là người hay máy vậy", "ok em cảm ơn", "cần hỏi chút", "để anh hỏi vợ đã em", "👍", "dạ"]) {
  la(`KHÔNG mùi nhà đất → không tốn lượt model: "${c}"`, coMuiBDS(c), false);
}

la("đủ điều kiện → hỏi model", nenHoiModelVai({ ...TRONG, text: CAU_BAN }), true);
for (const k of Object.keys(TRONG)) {
  la(`${k} → KHÔNG hỏi model (vai đã rõ hoặc có đường riêng)`, nenHoiModelVai({ ...TRONG, [k]: true, text: CAU_BAN }), false);
}
la("câu quá ngắn → không hỏi", nenHoiModelVai({ ...TRONG, text: "nhà" }), false);
la("câu chào → không hỏi", nenHoiModelVai({ ...TRONG, text: "chào em, em khỏe không" }), false);

la("model trả khuôn sai → null (đi đường cũ)", donVai({ vai: "khong_biet" }, CAU_BAN), null);
la("model hỏng (null) → null", donVai(null, CAU_BAN), null);
la("chua_ro giữ nguyên", donVai({ vai: "chua_ro", bang_chung: "" }, CAU_BAN), "chua_ro");
la("ban + cụm làm bằng có trong câu → ban", donVai({ vai: "ban", bang_chung: "để lại căn nhà 4x16" }, CAU_BAN), "ban");
la("ban + cụm làm bằng khác dấu / hoa thường → vẫn nhận", donVai({ vai: "ban", bang_chung: "De lai can nha" }, CAU_BAN), "ban");
la("ban + cụm làm bằng KHÔNG có trong câu (model bịa cớ) → chua_ro", donVai({ vai: "ban", bang_chung: "chủ cần bán gấp" }, CAU_BAN), "chua_ro");
la("mua + cụm làm bằng quá ngắn → chua_ro", donVai({ vai: "mua", bang_chung: "a" }, CAU_MUA), "chua_ro");
la("mua + cụm làm bằng có trong câu → mua", donVai({ vai: "mua", bang_chung: "cần gần bệnh viện" }, CAU_MUA), "mua");

// 07/10/2026 (SRS-5.1zzze, test os6o): "đúng rồi e" trả lời câu hỏi vai — luật gật không có chữ "e" nên hỏi lại câu chào.
// Câu trả lời câu hỏi vai mà luật không ra thì tốn MỘT lượt model (đọc kèm câu bot vừa hỏi), kể cả câu ngắn không mùi nhà đất.
for (const c of ["đúng rồi e", "chính xác e", "ừa đúng r", "hay quá"]) {
  la(`trả lời câu hỏi vai, luật không ra → hỏi model: "${c}"`, nenHoiModelVai({ ...TRONG, text: c, traLoiCauVai: true, dapVaiTheoLuat: false }), true);
}
la("trả lời câu hỏi vai mà luật đã ra (gật trơn) → KHÔNG tốn model", nenHoiModelVai({ ...TRONG, text: "đúng rồi", traLoiCauVai: true, dapVaiTheoLuat: true }), false);
la("câu ngắn KHÔNG phải trả lời câu hỏi vai → không hỏi (như cũ)", nenHoiModelVai({ ...TRONG, text: "đúng rồi e" }), false);
la("trả lời câu hỏi vai nhưng luật đã thấy ý MUA → không hỏi", nenHoiModelVai({ ...TRONG, muaTheoLuat: true, text: "không, anh tìm mua", traLoiCauVai: true }), false);
la("gật ngắn, cụm = 'đúng rồi' (≥ 2 ký tự) → ban", donVai({ vai: "ban", bang_chung: "đúng rồi" }, "đúng rồi e", 2), "ban");
la("gật một chữ 'ừ' — cụm là CẢ câu → ban", donVai({ vai: "ban", bang_chung: "ừ" }, "ừ", 2), "ban");
la("cụm 1 ký tự không phải cả câu → chua_ro", donVai({ vai: "ban", bang_chung: "a" }, "hay quá", 2), "chua_ro");
la("cụm không có trong câu → chua_ro (dù ngưỡng thấp)", donVai({ vai: "ban", bang_chung: "đúng vậy" }, "hay quá", 2), "chua_ro");

console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong) { console.log("\x1b[31mVAN PHÂN VAI HỎNG\x1b[0m"); process.exitCode = 1; }
else console.log("\x1b[32mVAN PHÂN VAI ĐẠT\x1b[0m");
