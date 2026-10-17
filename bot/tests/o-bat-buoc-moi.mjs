// o-bat-buoc-moi.mjs — ô bắt buộc mới 14/10/2026 (required_facts ↔ view ↔ DB giả).
// (1) SRS-5.1zzzzzzz3 (Zalo thật 14/10/2026, người test …4980): "Chung cư đường Phạm Thế Hiển quận 8",
// "địa chỉ 2225 Phạm Thế Hiển" → bot ghi vị trí rồi hỏi phường, diện tích, giá… nhưng KHÔNG BAO GIỜ hỏi tên chung cư.
// Lớp lỗi: một ô (`vi_tri`) gánh hai thứ khác nhau với căn hộ — địa chỉ đường làm đầy ô, tên chung cư không còn chỗ bắt buộc.
// Bài này đỏ khi: view thật (schema.sql) / migration / DB giả không coi `du_an_ten` là ô bắt buộc riêng của căn hộ.
// (2) SRS-5.1zzzzzzz5: tin cho thuê căn hộ / cấp 4 / biệt thự hỏi bù trượt giá như nhà phố (migration 20261014c).
//   bun bot/tests/o-bat-buoc-moi.mjs
import { readFileSync } from "node:fs";
import { FakeDB } from "./e2e/mock-supabase.mjs";
import { CAU_HOI_MAU, FACT_LABELS } from "../supabase/functions/_shared/prompts.ts";

let hong = 0;
const ok = (ten, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk ? "" : `  → ${ct}`}`); if (!dk) hong++; };

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const view = schema.slice(schema.indexOf("create or replace view public.listing_missing_facts"), schema.indexOf("ORDER BY l.id, rf.priority", schema.indexOf("create or replace view public.listing_missing_facts")));
ok("schema.sql: view coi du_an_ten là CÓ chỉ khi có fact du_an_ten hoặc project_id (địa chỉ đường không lấp)",
  /rf\.fact_key = 'du_an_ten'::text AND l\.project_id IS NOT NULL OR /.test(view) &&
    !/location_raw|street/.test((view.match(/rf\.fact_key = 'du_an_ten'::text AND (.*?) OR rf\.fact_key/) ?? ["", ""])[1]), view.slice(0, 200));
const mig = readFileSync(new URL("../supabase/migrations/20261014b_can_ho_hoi_ten_chung_cu.sql", import.meta.url), "utf8");
ok("migration 20261014b: required_facts chung_cu có du_an_ten nhóm co_ban", /'chung_cu'::public\.property_type, 'du_an_ten', \d+, 'co_ban'/.test(mig));

const db = new FakeDB();
const tin = (id, o) => db.t.listings.push({ id, property_type: "chung_cu", deal: "ban", ...o });
tin("a", { location_raw: "2225 Phạm Thế Hiển", street: "Phạm Thế Hiển" });
tin("b", { location_raw: "2225 Phạm Thế Hiển", project_id: "p1" });
tin("c", { location_raw: "Chung cư Sky Garden" });
db.t.listing_facts.push({ id: "f1", listing_id: "c", question: "du_an_ten", answer: "Chung cư Sky Garden" });
const thieu = (id) => db.missingFacts().filter((r) => r.listing_id === id).map((r) => r.fact_key);
ok("DB giả: căn hộ có địa chỉ đường, chưa tên chung cư → còn thiếu du_an_ten, không thiếu vi_tri",
  thieu("a").includes("du_an_ten") && !thieu("a").includes("vi_tri"), thieu("a").join(","));
ok("DB giả: căn hộ đã gắn dự án → không thiếu du_an_ten", !thieu("b").includes("du_an_ten"), thieu("b").join(","));
ok("DB giả: khách đã nói tên chung cư → không thiếu du_an_ten, không thiếu vi_tri", !thieu("c").includes("du_an_ten") && !thieu("c").includes("vi_tri"), thieu("c").join(","));
ok("câu hỏi + nhãn du_an_ten có, nói 'chung cư'", /chung cư/.test(CAU_HOI_MAU.du_an_ten ?? "") && /chung cư/.test(FACT_LABELS.du_an_ten ?? ""));
ok("câu vị trí căn hộ không hỏi lại tên dự án (tránh hỏi một ý hai lần)", !/dự án/.test(CAU_HOI_MAU["vi_tri@chung_cu"] ?? ""), CAU_HOI_MAU["vi_tri@chung_cu"]);

const mig2 = readFileSync(new URL("../supabase/migrations/20261014c_cho_thue_truot_gia.sql", import.meta.url), "utf8");
for (const loai of ["chung_cu", "nha_cap4", "biet_thu"]) {
  ok(`migration 20261014c: ${loai} cho thuê có truot_gia (sau_dang)`, new RegExp(`\\('${loai}', \\d+\\)`).test(mig2) && /'truot_gia', v\.p, 'sau_dang', 'cho_thue'/.test(mig2));
  const id = `t-${loai}`;
  db.t.listings.push({ id, property_type: loai, deal: "cho_thue", location_raw: "x" });
  const k = db.missingFacts().filter((r) => r.listing_id === id);
  ok(`DB giả: ${loai} cho thuê thiếu truot_gia nhóm sau_dang`, k.some((r) => r.fact_key === "truot_gia" && r.nhom === "sau_dang"), k.map((r) => r.fact_key).join(","));
  db.t.listings.push({ id: `b-${loai}`, property_type: loai, deal: "ban", location_raw: "x" });
  ok(`DB giả: ${loai} BÁN không hỏi truot_gia`, !db.missingFacts().some((r) => r.listing_id === `b-${loai}` && r.fact_key === "truot_gia"));
}

console.log(hong ? `\nÔ BẮT BUỘC MỚI: ${hong} CA HỎNG` : "\nÔ BẮT BUỘC MỚI: ĐẠT");
process.exit(hong ? 1 : 0);
