// SRS-5.1zzzzzzz19 — câu pháp lý căn hộ. Ca gốc: Zalo thật 14/10/2026 10:15, căn hộ Bình Chánh: "Căn … mình có sổ hồng riêng hay chung
// vậy chị?" (chủ dự án: "sao câu pháp lý nãy test nó cứ hỏi về sổ hồng riêng"). Gốc: dòng CẦN HỎI chỉ có "pháp lý (giấy tờ)" cho mọi loại,
// ví dụ mẫu dạy "pháp lý → sổ nhà mình riêng hay chung" → model dùng câu nhà phố cho căn hộ.
import { nhanTheoLoai, SELLER_FEWSHOT } from "../supabase/functions/_shared/prompts.ts";

const R = [];
const kiem = (ten, ok, ct = "") => R.push([ten, !!ok, ct]);
const ch = nhanTheoLoai("phap_ly", "chung_cu");
kiem("PLCH-01 (ca gốc) ý CẦN HỎI pháp lý của căn hộ nói 'đã ra sổ hồng hay còn hợp đồng mua bán' và cấm 'sổ riêng hay chung'",
  /đã ra sổ hồng hay còn hợp đồng mua bán/.test(ch) && /KHÔNG hỏi sổ riêng hay chung/.test(ch), ch);
kiem("PLCH-02 đối chứng nhà phố → nhãn chung 'pháp lý (giấy tờ)' như cũ", nhanTheoLoai("phap_ly", "nha_pho") === "pháp lý (giấy tờ)");
kiem("PLCH-03 ví dụ mẫu không còn dạy 'pháp lý → sổ … riêng hay chung'",
  !SELLER_FEWSHOT.split("\n").some((d) => /pháp lý\]/.test(d) && /riêng hay chung/.test(d)));

let hong = 0;
for (const [t, ok, ct] of R) { console.log(`${ok ? "✓" : "✗"} ${t}${ok ? "" : `\n    ${ct}`}`); if (!ok) hong++; }
console.log(`\n${hong}/${R.length} CA HỎNG`);
process.exit(hong ? 1 : 0);
