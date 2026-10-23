// Tự kiểm OFFLINE của ảnh mẫu (SRS-5.1zzzzzzz168): bốn tệp có thật, đúng JPEG, nhỏ; dòng media đúng ràng buộc DB (đường dẫn theo uuid, sạch, ảnh bìa ở bucket công khai).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANH_MAU, dongMedia } from "./nap-anh-mau-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
for (const a of ANH_MAU) {
  const b = readFileSync(join(HERE, "anh-mau", a.tep));
  assert.ok(b[0] === 0xff && b[1] === 0xd8, `${a.tep} không phải JPEG`);
  assert.ok(b.length > 5_000 && b.length < 200_000, `${a.tep} cỡ lạ: ${b.length}`);
}
const id = "123e4567-e89b-42d3-a456-426614174000", d = dongMedia(id);
assert.equal(d.length, 4);
assert.equal(d.filter((x) => x.is_cover).length, 1);
assert.deepEqual(d.map((x) => x.sort_order), [0, 1, 2, 3]);
const MEDIA = new Set(["mat_tien", "trong_nha", "phong_ngu", "bep", "view", "hem", "san_thuong", "wc", "khac"]);
for (const x of d) {
  assert.ok(x.storage_path.startsWith(`${id}/`), "đường dẫn phải bắt đầu bằng uuid tin");
  assert.ok(!/(^\/)|(\.\.)|(\/\/)/.test(x.storage_path), "đường dẫn không sạch");
  assert.equal(x.bucket, "listing-public");
  assert.ok(MEDIA.has(x.media_type), `media_type lạ: ${x.media_type}`);
}
assert.equal(new Set(d.map((x) => x.storage_path)).size, 4, "đường dẫn trùng (UNIQUE bucket, storage_path)");
console.log("OK nap-anh-mau tự kiểm: 4 ảnh JPEG, 4 dòng media đúng ràng buộc");
