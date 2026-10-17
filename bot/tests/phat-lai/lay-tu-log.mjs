// lay-tu-log.mjs — cắt các dòng `PHAT_LAI_JSON <mã> <json>` từ log job khách mô phỏng (mo-phong.yml) thành file ca phát lại
// (SRS-5.1zzzzzd). Ca mới ra với `ky_vong: []`: người sửa lỗi thêm kỳ vọng cho đúng lỗi đã thấy (lời bot không được có / cột phải là…),
// chạy `bun bot/tests/phat-lai/phat-lai.mjs --ca <tên>` thấy ĐỎ trên code cũ rồi mới sửa.
//   bun bot/tests/phat-lai/lay-tu-log.mjs <file-log> [thư-mục-ra = bot/tests/phat-lai/ca]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [log, ra = join(dirname(fileURLToPath(import.meta.url)), "ca")] = process.argv.slice(2);
if (!log) { console.error("Cần đường dẫn file log job mo-phong"); process.exit(2); }
mkdirSync(ra, { recursive: true });
let n = 0;
for (const dong of readFileSync(log, "utf8").split("\n")) {
  const m = /PHAT_LAI_JSON (\S+) (\{.*\})\s*$/.exec(dong);
  if (!m) continue;
  const ca = JSON.parse(m[2]);
  const tep = join(ra, `${ca.ten}.json`);
  writeFileSync(tep, `${JSON.stringify(ca, null, 1)}\n`);
  console.log(`${tep} · ${ca.luot.length} lượt · ${ca.luot.reduce((a, l) => a + (l.ai?.length ?? 0), 0)} lượt model`);
  n++;
}
if (!n) { console.error("Không thấy dòng PHAT_LAI_JSON nào (job chạy trước khi có SRS-5.1zzzzzd?)"); process.exit(1); }
