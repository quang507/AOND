// SRS-5.1zzzzzzz26/27 (18/10/2026): lời khách và lời bot vào `messages` MỘT lần, trong lượt chính của chat-reply. Lượt đồng bộ
// `sync_turn` (bridge POST sau mỗi lượt → chat-reply insert lại) từng làm mỗi câu bot nằm hai lần trong sổ hội thoại. Bài này soi mã
// nguồn: bridge không gửi `sync_turn`, chat-reply không có nhánh xử lý nó. Đỏ khi một trong hai quay lại.
import { readFileSync } from "node:fs";

const goc = new URL("../", import.meta.url);
const doc = (p) => readFileSync(new URL(p, goc), "utf8").replace(/^\s*\/\/.*$/gm, ""); // bỏ dòng chú thích
let hong = 0;
const ok = (ten, dk) => { console.log(`${dk ? "✓" : "✗"} ${ten}`); if (!dk) hong++; };

const bridge = doc("bridge-zca/index.mjs");
const chat = doc("supabase/functions/chat-reply/index.ts");
ok("KGT-01 bridge không gửi sync_turn", !/sync_turn/.test(bridge));
ok("KGT-02 chat-reply không có nhánh body.sync_turn", !/body\.sync_turn/.test(chat));
// Tự kiểm: bộ soi phải bắt được đúng mẫu cũ.
ok("KGT-tu-kiem bắt được mẫu cũ", /body\.sync_turn/.test("  if (body.sync_turn) {") && /sync_turn/.test("      sync_turn: true,"));

console.log(hong ? `${hong} CA HỎNG` : "TẤT CẢ CA KHÔNG-GHI-TRÙNG ĐẠT");
if (hong) process.exit(1);
