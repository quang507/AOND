#!/usr/bin/env node
// soat-db.mjs — TÁM PHÉP SOÁT TRẠNG THÁI DB, chỉ đọc, dưới một giây.
//
// Chủ dự án 10/09/2026: "Tầng hai là tám câu truy vấn chỉ đọc, gói thành một
// script chạy mỗi lần gửi thay đổi, dưới một phút, không rủi ro."
//
// Tầng một (`soat-migration.mjs`) hỏi: repo và DB có cùng DANH SÁCH migration?
// Tầng này hỏi: DB đang ở TRẠNG THÁI nào? Cả năm lỗi nặng hôm nay đều không
// nhìn thấy được từ danh sách migration — chúng nằm trong catalog:
//
//   1  policy_phu_khoa            policy chặn theo TÊN có phủ hết khoá đang sống
//   2  view_thieu_quyen           view nào đọc xuyên RLS (thiếu security_invoker)
//   3  ham_trung_chu_ky           overload mà PostgREST gọi ra "not unique"
//   4  bang_thieu_khoa_chinh      bảng cho phép hai dòng y hệt nhau
//   5  definer_thieu_search_path  leo thang đặc quyền cổ điển
//   6  rls_bat_khong_policy       web được cấp quyền mà RLS chặn sạch → trang trắng
//   7  trigger_sai_thu_tu         BEFORE trigger chạy theo thứ tự chữ cái
//   8  gui_qua_hai_tin_mot_ngay   bot nhắn dồn → khách chặn OA
//
// Toàn bộ tám phép nằm TRONG hàm `soat_db_cong_khai()` (`20260910p`): chạy tại
// chỗ trong DB nên tính bằng mili giây, và chỉ trả KẾT LUẬN — không trả dữ liệu
// thô, Zalo ID che còn 4 số cuối. Không cần secret: hàm mở cho khoá công khai,
// vì nhét service_role vào CI của một repo PUBLIC là đổi cả kho dữ liệu khách
// lấy một cổng kiểm.
//
//     node scripts/soat-db.mjs          # thoát 1 nếu có phát hiện mức NẶNG
//     node scripts/soat-db.mjs --het    # thoát 1 với cả mức NHẸ
//
// KHÔNG RỦI RO theo đúng nghĩa: hàm `stable`, chỉ `select`, không ghi gì.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, ".env");
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const val = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (val && !(m[1] in process.env)) process.env[m[1]] = val;
  }
}

const URL_DB = process.env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
/** Khoá công khai nằm sẵn trong `lib/supabase.ts` — đúng cái mọi bundle web đã phát hành. */
const khoaTrongRepo = () => {
  try {
    const t = readFileSync(join(HERE, "..", "lib", "supabase.ts"), "utf8");
    return /(?:sb_publishable_|eyJ)[A-Za-z0-9._-]{20,}/.exec(t)?.[0] ?? null;
  } catch {
    return null;
  }
};
const KHOA = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || khoaTrongRepo();
if (!KHOA) {
  console.error("Không có khoá nào để gọi soat_db_cong_khai().");
  process.exitCode = 1;
}

const HET = process.argv.includes("--het");
const NHAN = {
  policy_phu_khoa: "Policy anon chưa chặn khoá đang tồn tại",
  view_thieu_quyen: "View đọc xuyên RLS (thiếu security_invoker; (!) = không có cổng admin)",
  ham_trung_chu_ky: "Hàm trùng chữ ký — PostgREST sẽ trả 'function is not unique'",
  bang_thieu_khoa_chinh: "Bảng thiếu khoá chính",
  definer_thieu_search_path: "SECURITY DEFINER thiếu set search_path",
  rls_bat_khong_policy: "Web được cấp quyền đọc nhưng RLS không có policy nào",
  trigger_sai_thu_tu: "Trigger BEFORE chạy sai thứ tự",
  gui_qua_hai_tin_mot_ngay: "Người nhận quá 2 tin chủ động trong 24 giờ",
};

const bd = Date.now();
const r = await fetch(`${URL_DB}/rest/v1/rpc/soat_db_cong_khai`, {
  method: "POST",
  headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
  body: "{}",
});
if (!r.ok) {
  // Không đọc được KHÔNG PHẢI là "sạch" — cùng bài học với TS-SEC: thoát 2 =
  // "chưa kiểm được", để cổng không báo xanh khi mất mạng hay hàm chưa áp.
  console.error(`rpc/soat_db_cong_khai: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  console.error("→ CHƯA KIỂM ĐƯỢC (không phải 'đạt'). Hàm ở migration 20260910p.");
  process.exit(2);
}
const ds = await r.json();
const giay = ((Date.now() - bd) / 1000).toFixed(1);

// NỀN ĐÃ BIẾT. Cổng đỏ ngay từ ngày đầu là cổng sẽ bị bỏ qua — đúng bài học của
// chính hôm nay: 52 dòng cảnh báo kêu mãi thành tiếng ồn, rồi cái thứ 53 (trôi
// THẬT) chìm lẫn vào đó. Nên: phát hiện trùng khít bản nền thì IN RA nhưng
// không làm đỏ; khác một chữ là đỏ. Xoá dòng khỏi file nền = tuyên bố đã sửa.
const NEN_FILE = join(HERE, "soat-db-da-biet.json");
const nen = existsSync(NEN_FILE) ? (JSON.parse(readFileSync(NEN_FILE, "utf8")).da_biet ?? {}) : {};
const daBiet = (x) => (nen[x.ma]?.chi_tiet ?? null) === (x.chi_tiet ?? "");

console.log(`SOÁT DB — 8 phép, chỉ đọc · ${giay}s\n`);
const nang = ds.filter((x) => x.muc === "NANG");
const nhe = ds.filter((x) => x.muc !== "NANG");

for (const x of [...nang, ...nhe]) {
  const cu = daBiet(x);
  const dau = cu
    ? "\x1b[90m·\x1b[0m đã biết"
    : x.muc === "NANG"
    ? "\x1b[31m✗\x1b[0m MỚI  "
    : "\x1b[33m•\x1b[0m nhẹ  ";
  console.log(`${dau}  ${NHAN[x.ma] ?? x.ma} — ${x.so}`);
  if (x.chi_tiet) console.log(`          ${x.chi_tiet}`);
  if (cu && nen[x.ma]?.ghi_chu) console.log(`          ↳ ${nen[x.ma].ghi_chu}`);
}
const moiNang = nang.filter((x) => !daBiet(x));
const moiNhe = nhe.filter((x) => !daBiet(x));
const sach = 8 - ds.length;
console.log(
  `\n${sach}/8 phép soát sạch · ${ds.length - moiNang.length - moiNhe.length} phát hiện đã biết · `
  + `${moiNang.length} MỚI mức nặng · ${moiNhe.length} mới mức nhẹ`,
);

if (moiNang.length || (HET && moiNhe.length)) {
  console.log("\n\x1b[31mSOÁT DB: CÓ PHÁT HIỆN MỚI\x1b[0m — đọc từng dòng trước khi merge.");
  console.log("Nếu đó là chủ đích thì ghi vào scripts/soat-db-da-biet.json kèm LÝ DO, đừng sửa cổng.");
  process.exitCode = 1;
} else {
  console.log("\n\x1b[32mSOÁT DB: KHÔNG CÓ GÌ MỚI\x1b[0m");
}
