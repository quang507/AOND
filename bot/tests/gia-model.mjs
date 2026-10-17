// gia-model.mjs — SRS-5.1zv: /admin quy chữ-máy ra đô theo ĐÚNG model, không một bảng giá Opus cho tất cả.
// Không mạng, không DB.   bun bot/tests/gia-model.mjs
import { giaCua, tienDong, tongTien, HE_SO_NAP, HE_SO_DOC, nguongCache, tyLeDocCache, canhBaoCache } from "../../lib/gia-model.ts";

let hong = 0, tong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };
const gan = (a, b) => Math.abs(a - b) < 1e-9;

ok("Haiku 4.5 (ID thật có đuôi ngày) = 1/5", JSON.stringify(giaCua("claude-haiku-4-5-20251001")) === JSON.stringify({ vao: 1, ra: 5, nhan: "Haiku 4.5" }));
ok("Sonnet 4.6 = 3/15", giaCua("claude-sonnet-4-6")?.vao === 3 && giaCua("claude-sonnet-4-6")?.ra === 15);
ok("Opus 5.5 = 4/20; Opus 4.6 = 5/25", giaCua("claude-opus-5-5")?.vao === 4 && giaCua("claude-opus-4-6")?.ra === 25);
ok("Groq/Gemini (dự phòng) = 0 đô, có nhãn", giaCua("Groq:qwen/qwen3.8-27b")?.vao === 0 && /dự phòng/.test(giaCua("Gemini:gemini-3.8-flash")?.nhan ?? ""));
ok("'khac' (dòng cũ) / rỗng / model lạ → null, không đoán", giaCua("khac") === null && giaCua("") === null && giaCua(null) === null && giaCua("claude-moi-la-9") === null);

const dong = (model, i, o, w, r) => ({ model, in_tokens: i, out_tokens: o, cache_write_tokens: w, cache_read_tokens: r });
// 1 triệu chữ mỗi ô → tiền = vao + ra + vao·2 + vao·0,1
const haiku = tienDong(dong("claude-haiku-4-5-20251001", 1e6, 1e6, 1e6, 1e6));
ok("Haiku: 1M mỗi ô → 1 + 5 + 2 + 0,1 = 8,1 đô", gan(haiku, 1 + 5 + 1 * HE_SO_NAP + 1 * HE_SO_DOC), String(haiku));
const sonnet = tienDong(dong("claude-sonnet-4-6", 1e6, 1e6, 1e6, 1e6));
ok("Sonnet 4.6 cùng số chữ = 3 + 15 + 6 + 0,3 = 24,3 đô (gấp 3 Haiku)", gan(sonnet, 24.3) && gan(sonnet / haiku, 3), String(sonnet));
// Lớp lỗi cũ: giá Opus 5/25 cho mọi token — với Haiku cao hơn thật 5 lần.
const opusCu = (1e6 * 5 + 1e6 * 25 + 1e6 * 5 * 2 + 1e6 * 5 * 0.1) / 1e6;
ok("bảng giá cũ (Opus cho tất cả) cao hơn Haiku thật đúng 5 lần", gan(opusCu / haiku, 5), String(opusCu / haiku));
ok("Groq: có chữ nhưng 0 đô", tienDong(dong("Groq:qwen/qwen3.8-27b", 5e5, 1e5, 0, 0)) === 0);
ok("'khac' → null (không cộng vào tổng)", tienDong(dong("khac", 1e6, 0, 0, 0)) === null);
const t = tongTien([dong("claude-haiku-4-5-20251001", 1e6, 0, 0, 0), dong("khac", 1e6, 0, 0, 0), dong("Groq:x", 1e6, 0, 0, 0)]);
ok("tổng: chỉ cộng dòng có giá (1 đô), đếm 1 dòng chưa rõ", gan(t.tien, 1) && t.chuaRo === 1, JSON.stringify(t));

// SRS-5.1zw (#4): ngưỡng cache theo model + cảnh báo "không đọc cache".
ok("ngưỡng cache: Haiku 4.5 = 4096, Sonnet 4.6 = 1024, Opus 5.5 = 512, Groq → null", nguongCache("claude-haiku-4-5-20251001") === 4096 && nguongCache("claude-sonnet-4-6") === 1024 && nguongCache("claude-opus-5-5") === 512 && nguongCache("Groq:x") === null);
ok("tỷ lệ đọc cache: 80k đọc / (10k vào + 10k nạp + 80k đọc) = 0,8", gan(tyLeDocCache(dong("claude-haiku-4-5-20251001", 1e4, 5e3, 1e4, 8e4)), 0.8));
const cb = canhBaoCache(dong("claude-haiku-4-5-20251001", 50_000, 5_000, 0, 0));
ok("Haiku 50k chữ vào, 0 đọc cache → cảnh báo nêu ngưỡng 4.096", !!cb && /4\.096/.test(cb) && /Haiku/.test(cb), String(cb));
ok("có đọc cache → không cảnh báo; ít chữ (< 20k) → không cảnh báo; Groq → không cảnh báo",
  canhBaoCache(dong("claude-haiku-4-5-20251001", 50_000, 5_000, 0, 1_000)) === null && canhBaoCache(dong("claude-haiku-4-5-20251001", 5_000, 500, 0, 0)) === null && canhBaoCache(dong("Groq:x", 90_000, 0, 0, 0)) === null);

console.log(hong ? `\nGIÁ MODEL: ${hong}/${tong} CA HỎNG` : `\nGIÁ MODEL: ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);
