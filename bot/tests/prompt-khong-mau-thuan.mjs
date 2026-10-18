// SRS-5.1zzzzzzz28 (18/10/2026): prompt người bán / người mua từng TỰ CÃI NHAU — luật bắt hỏi một ý mà một dòng khác cho gộp hai ý
// và ví dụ ĐÚNG mang hai câu hỏi; cấm "mình" / "anh/chị" mà câu mẫu dùng chính chữ đó; cấm mở đầu bằng cảm ơn mà câu soạn sẵn mở
// bằng "Dạ em cảm ơn". Model nhận hai lệnh ngược nhau thì lượt này theo lệnh này, lượt sau theo lệnh kia. Bài này đọc thẳng
// prompts.ts (bản code; bản DB `bot_prompts` đè lên phải đẩy bằng `bun run prompt -- --day`) và đỏ khi một cặp ngược nhau quay lại.
const P = await import("../supabase/functions/_shared/prompts.ts");
let hong = 0;
const ok = (ten, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk ? "" : `\n    ${ct}`}`); if (!dk) hong++; };

// (a) Một ý mỗi tin: không dòng nào cho gộp hai ý; ví dụ ĐÚNG của người bán mỗi câu đáp tối đa một dấu "?".
ok("PKM-01 SELLER_SCRIPT_RULES không cho 'gộp tối đa 2 ý'", !/gộp tối đa 2 ý/i.test(P.SELLER_SCRIPT_RULES));
const dung = P.SELLER_FEWSHOT.split(/Ví dụ giọng SAI/)[0];
const haiHoi = dung.split("\n").filter((d) => /→\s*"/.test(d)).filter((d) => (d.split(/→\s*"/).pop().match(/\?/g) ?? []).length > 1);
ok("PKM-02 ví dụ ĐÚNG người bán: mỗi câu đáp hỏi tối đa MỘT ý", haiHoi.length === 0, haiHoi.join("\n    "));
// (d) "anh/chị" gạch chéo và "mình" chỉ khách: chỉ còn trong câu CẤM và ví dụ SAI.
const coGach = (t) => t.split("\n").filter((d) => /anh\/chị/i.test(d) && !/không viết "anh\/chị"/.test(d));
for (const [ten, t] of [["TONE_RULES", P.TONE_RULES], ["HUMAN_CHAT_RULES", P.HUMAN_CHAT_RULES], ["BUYER_FEWSHOT", P.BUYER_FEWSHOT], ["LOI_CHAO", P.LOI_CHAO], ["FEE_RULES", P.FEE_RULES]]) {
  ok(`PKM-03 ${ten} không viết "anh/chị" gạch chéo`, coGach(t).length === 0, coGach(t).join("\n    "));
}
const minhKhach = /(?:cho|báo|gọi lại cho)\s+mình\s+(?:liền|nha|ạ)|"mình cứ/;
for (const [ten, t] of [["TONE_RULES", P.TONE_RULES], ["HUMAN_CHAT_RULES", P.HUMAN_CHAT_RULES], ["BUYER_FEWSHOT", P.BUYER_FEWSHOT], ["FEE_RULES", P.FEE_RULES]]) {
  ok(`PKM-04 ${ten} không gọi khách là "mình"`, !minhKhach.test(t), (t.match(new RegExp(`.{0,40}${minhKhach.source}.{0,20}`)) ?? [""])[0]);
}
// (e) Cấm mở đầu bằng cảm ơn → không câu soạn sẵn nào mở bằng cảm ơn.
const camOn = Object.entries(P.CAU_TIEN_DINH).filter(([, v]) => /^\s*(?:Dạ\s+)?(?:em\s+)?cảm ơn/i.test(v)).map(([k]) => k);
ok("PKM-05 CAU_TIEN_DINH không câu nào mở bằng 'cảm ơn'", camOn.length === 0, camOn.join(", "));
// (f) Tối đa 1 emoji mỗi tin: mỗi câu soạn sẵn tối đa một emoji; AD_FORMAT không cho 1–2.
const EMO = /\p{Extended_Pictographic}/gu;
const nhieuEmo = Object.entries(P.CAU_TIEN_DINH).filter(([, v]) => (v.match(EMO) ?? []).length > 1).map(([k]) => k);
ok("PKM-06 CAU_TIEN_DINH mỗi câu tối đa 1 emoji", nhieuEmo.length === 0, nhieuEmo.join(", "));
ok("PKM-07 AD_FORMAT tiêu đề tối đa 1 emoji (không '1–2 emoji')", !/1–2 emoji/.test(P.AD_FORMAT));
// (b) Phí: lời giá trị không hứa đứng đầu / bán nhanh (trái FEE_RULES).
ok("PKM-08 FEE_VALUE_POINTS không hứa Top / bán nhanh", !/\bTop\b|bán nhanh/i.test(P.FEE_VALUE_POINTS));

console.log(hong ? `${hong} CA HỎNG` : "TẤT CẢ CA PROMPT-KHÔNG-MÂU-THUẪN ĐẠT");
if (hong) process.exit(1);
