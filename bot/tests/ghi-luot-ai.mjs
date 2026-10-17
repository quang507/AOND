// SRS-5.1zzzzzd: bộ ghi đầu ra model (`_shared/ai/ghi-luot-ai.ts`) — ghi theo NGỮ CẢNH lượt, hai lượt chạy song song không lẫn nhau (khách
// thật và ID thử chung một isolate), ngoài ngữ cảnh thì không ghi, lượt ném lỗi ghi `loi`, và tên loại lượt ổn định.
import { bocGhiAi, chayCoGhiAi, loaiLuotAi } from "../supabase/functions/_shared/ai/ghi-luot-ai.ts";

let tong = 0, hong = 0;
const ok = (n, d, x = "") => { tong++; if (!d) hong++; console.log(`${d ? "✓" : "✗"} ${n}${d ? "" : `\n    → ${x}`}`); };
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const goc = {
  messages: {
    create: async (p) => { await ngu(p.cho ?? 0); if (p.hong) throw new Error("hỏng"); return { content: [{ type: "text", text: p.tra }] }; },
    parse: async (p) => { await ngu(p.cho ?? 0); return { parsed_output: { gia: p.tra } }; },
  },
};
const ai = bocGhiAi(goc);
const sys = (t) => [{ type: "text", text: t }];

const a = [], b = [];
await Promise.all([
  chayCoGhiAi(a, async () => { await ai.messages.parse({ system: sys("BÓC TÁCH TIN NHẮN NGƯỜI BÁN …"), tra: "A1", cho: 20 }); await ai.messages.create({ system: sys('Bạn là "Thái", trợ lý'), tra: "A2", cho: 5 }); }),
  chayCoGhiAi(b, async () => { await ai.messages.parse({ system: sys("Ý NGẮN CỦA LƯỢT …"), tra: "B1", cho: 5 }); await ai.messages.create({ system: sys('Bạn là "Thu", trợ lý'), tra: "B2", cho: 20 }); }),
]);
ok("hai lượt song song: mỗi sổ chỉ có lượt của mình, đúng thứ tự", JSON.stringify(a.map((x) => x.ra.po?.gia ?? x.ra.chu)) === '["A1","A2"]' && JSON.stringify(b.map((x) => x.ra.po?.gia ?? x.ra.chu)) === '["B1","B2"]',
  JSON.stringify({ a, b }));
ok("loại lượt: boc_rao / viet / doc_y_luot", a[0].loai === "boc_rao" && a[1].loai === "viet" && b[0].loai === "doc_y_luot", JSON.stringify([a, b].flat().map((x) => x.loai)));
const r = await ai.messages.create({ system: sys("x"), tra: "C" });
ok("ngoài ngữ cảnh ghi: không lọt vào sổ nào, lượt vẫn trả kết quả", a.length === 2 && b.length === 2 && r.content[0].text === "C");
const c = [];
let nem = false;
await chayCoGhiAi(c, async () => { try { await ai.messages.create({ system: sys("SOÁT LỜI BOT GỬI CHỦ NHÀ"), hong: true }); } catch { nem = true; } });
ok("lượt ném lỗi: vẫn ném cho nơi gọi, sổ ghi {loi:true}", nem && c.length === 1 && c[0].ra.loi === true && c[0].loai === "soat_ban", JSON.stringify(c));
ok("lượt có tools → tro_ly; CHỐT TIN thắng BÓC TÁCH", loaiLuotAi("create", { tools: [{}], system: "x" }) === "tro_ly" &&
  loaiLuotAi("parse", { system: [{ text: "BÓC TÁCH TIN NHẮN NGƯỜI BÁN" }, { text: "CHẾ ĐỘ CHỐT TIN (đè…)" }] }) === "chot_tin");
const d = [];
await chayCoGhiAi(d, async () => { for (let i = 0; i < 60; i++) await ai.messages.create({ system: sys("x"), tra: String(i) }); });
ok("trần 40 lượt mỗi lượt khách", d.length === 40, String(d.length));
console.log(hong ? `\nGHI LƯỢT AI: ${hong}/${tong} CA HỎNG` : `\nGHI LƯỢT AI: ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);
