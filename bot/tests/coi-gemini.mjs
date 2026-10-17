// Còi Gemini (20261002c, docs/07 SRS-5.1z đợt 2). Soi schema.sql (bản sinh từ DB) — đỏ khi thân hàm trên DB thiếu bản sửa.
//  CG-01 bat_het_tien_api bỏ qua MỌI nguồn nhúng ('nhung%') và lỗi Gemini — bản cũ chỉ ghi 'nhung-tick', 'nhung-dia-danh-tick'
//        lọt và câu 429 của Gemini (có chữ "billing") thành 3 lần "BỘ NÃO ĐANG CÂM — HẾT TIỀN" báo nhầm ngày 01/10.
//  CG-02 bot_health_tick không chép Gemini 429 RESOURCE_EXHAUSTED vào bot_errors (đường đi đúng thiết kế, 2.951 dòng/24h).
//  CG-03 nhung_tick + nhung_dia_danh_tick: hết hạn mức NGÀY (PerDay) thì dừng tới lúc cấp lại, không thử mỗi 60 phút.
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const than = (ten) => {
  const i = s.indexOf(`CREATE OR REPLACE FUNCTION public.${ten}(`);
  if (i < 0) return "";
  return s.slice(i, s.indexOf("end $function$", i));
};
let dat = 0, hong = 0;
const kiem = (ten, ok) => { ok ? dat++ : hong++; console.log(`${ok ? "✓" : "✗"} ${ten}`); };

const het = than("bat_het_tien_api");
kiem("CG-01 bat_het_tien_api lọc theo tiền tố nguồn 'nhung%'", /new\.source like 'nhung%'/.test(het));
kiem("CG-01 bat_het_tien_api bỏ qua lỗi Gemini (resource_exhausted / gemini)", /resource_exhausted/.test(het) && /%gemini%/.test(het));
kiem("CG-02 bot_health_tick không chép Gemini 429 RESOURCE_EXHAUSTED", /not \(r\.status_code = 429 and coalesce\(r\.content, ''\) ilike '%RESOURCE_EXHAUSTED%'\)/.test(than("bot_health_tick")));
for (const t of ["nhung_tick", "nhung_dia_danh_tick"]) {
  const b = than(t);
  kiem(`CG-03 ${t}: hết hạn mức ngày (PerDay) thì dừng tới lúc cấp lại`, /ilike '%PerDay%'/.test(b) && /v_dung := greatest\(v_dung, v_reset at time zone 'UTC'\)/.test(b));
}
console.log(`\n${dat}/${dat + hong} đạt`);
if (hong) process.exit(1);
