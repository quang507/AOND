// SRS-5.1zzzzzzz29 (18/10/2026): code gộp về repo AOND 17/10, nhưng script cài VPS (bridge Zalo, trang chat thử) và workflow
// `apply-migration` vẫn clone / tải script từ repo cũ Nhadat.cc — VPS chạy code cũ, xoá repo cũ là lần cập nhật sau hỏng. Bài này
// đọc thẳng các file chạy trên máy (workflow, script .sh, hướng dẫn VPS) và đỏ khi còn URL repo cũ. Kèm: CRM /admin/tin-nhan nghe
// Realtime (bản cũ chỉ tải khi bấm "Làm mới").
import { readFileSync, readdirSync } from "node:fs";

const goc = new URL("../../", import.meta.url);
const doc = (p) => readFileSync(new URL(p, goc), "utf8");
let hong = 0;
const ok = (ten, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk ? "" : `\n    ${ct}`}`); if (!dk) hong++; };

const REPO_CU = /(?:github\.com|raw\.githubusercontent\.com)\/quang507\/Nhadat\.cc/i;
const tep = [
  ...readdirSync(new URL(".github/workflows/", goc)).filter((f) => f.endsWith(".yml")).map((f) => `.github/workflows/${f}`),
  "bot/bridge-zca/cai-vps.sh", "bot/bridge-zca/VPS.md",
];
for (const f of tep) {
  const dong = doc(f).split("\n").map((d, i) => [i + 1, d]).filter(([, d]) => REPO_CU.test(d));
  ok(`AMN-01 ${f} không trỏ repo cũ Nhadat.cc`, dong.length === 0, dong.map(([n, d]) => `${n}: ${d.trim().slice(0, 120)}`).join("\n    "));
}
ok("AMN-02 cai-vps.sh bridge đổi origin sang AOND trên máy cài từ repo cũ", /remote set-url origin "\$REPO"/.test(doc("bot/bridge-zca/cai-vps.sh")));
const lenhSh = (f) => doc(f).split("\n").filter((d) => !/^\s*#/.test(d)).join("\n"); // bỏ dòng chú thích
ok("AMN-03 cai-vps.sh bridge không dùng pull --ff-only (lịch sử hai repo không nối nhau)", !/pull --ff-only/.test(lenhSh("bot/bridge-zca/cai-vps.sh")));
const crm = doc("app/admin/tin-nhan/page.tsx");
// 18/10/2026: lượt cài thật dừng ở checkout (untracked .gitattributes) mà vẫn báo xanh vì `a && b` không kích set -e.
const gitDong = lenhSh("bot/bridge-zca/cai-vps.sh").split("\n").filter((d) => /\bgit -C\b/.test(d) && !/rev-parse/.test(d));
ok("AMN-06 cai-vps.sh bridge: mỗi lệnh git một dòng (không nối &&), checkout có -f", gitDong.length >= 3 && gitDong.every((d) => !/&&/.test(d)) && gitDong.some((d) => /checkout -q -f /.test(d)));
ok("AMN-07 cai-vps.sh bridge trả cây /opt/nhadat về user nhadat trước khi git chạy", /chown -R nhadat:nhadat "\$DIR"[\s\S]{0,200}remote set-url/.test(lenhSh("bot/bridge-zca/cai-vps.sh")));
ok("AMN-08 workflow cai-vps thoát theo mã của cai-vps.sh, không theo lệnh đọc log", /cai-vps\.sh <\/dev\/null; rc_cai=\\\$\?[\s\S]*exit \\\$rc_cai"/.test(doc(".github/workflows/apply-migration.yml")));
// 18/10/2026: chủ dự án chốt bộ não là lõi Python trên VPS (aond-core, cổng 8000) — bridge mặc định phải gọi nó.
ok("AMN-09 bridge mặc định gọi lõi Python aond-core (127.0.0.1:8000)", /CHAT_REPLY_URL \|\| "http:\/\/127\.0\.0\.1:8000\/chat-reply"/.test(doc("bot/bridge-zca/index.mjs")));
// 18/10/2026: bản vá lõi Python nằm trong repo mà VPS chạy bản cũ — không có đường nào chép src/aioi sang /opt/aond_core.
// 19/10 (SRS-5.1zzzzzzz57): chép GƯƠNG — chép sang thư mục mới rồi thay hẳn thư mục cũ, để tệp repo đã xoá cũng gỡ trên VPS.
ok("AMN-10 cai-vps.sh chép gương src/aioi sang /opt/aond_core, khởi động lại aond-core và đòi /health", /cp -r [^\n]*src\/aioi"? [^\n]*\/opt\/aond_core\/src\/aioi\.moi/.test(lenhSh("bot/bridge-zca/cai-vps.sh")) && /rm -rf \/opt\/aond_core\/src\/aioi && mv \/opt\/aond_core\/src\/aioi\.moi \/opt\/aond_core\/src\/aioi/.test(lenhSh("bot/bridge-zca/cai-vps.sh")) && /systemctl restart aond-core/.test(lenhSh("bot/bridge-zca/cai-vps.sh")) && /8000\/health/.test(lenhSh("bot/bridge-zca/cai-vps.sh")));
// 19/10 (SRS-5.1zzzzzzz58): CDN raw.githubusercontent giữ bản cũ theo TÊN nhánh vài phút sau merge — tải theo commit.
ok("AMN-11 workflow tải cai-vps.sh theo commit ($GITHUB_SHA), không theo tên nhánh", /raw\.githubusercontent\.com\/quang507\/AOND\/\$GITHUB_SHA\/bot\/bridge-zca\/cai-vps\.sh/.test(doc(".github/workflows/apply-migration.yml")) && !/raw\.githubusercontent\.com\/quang507\/AOND\/\$NHANH_VPS\//.test(doc(".github/workflows/apply-migration.yml")));
// 19/10 (SRS-5.1zzzzzzz60): /opt/aond_core còn kho SharePoint giả, backup.py, .env.bak-gemini — cai-vps dọn (cất /root trước).
ok("AMN-12 cai-vps.sh dọn tàn dư /opt/aond_core (cất trước khi xoá)", /DON=\(sharepoint_store[^)]*backup\.py[^)]*\.env\.bak-gemini/.test(lenhSh("bot/bridge-zca/cai-vps.sh")) && /tar -czf "\$CAT"[\s\S]{0,80}rm -rf -- "\$\{CO\[@\]\}"/.test(lenhSh("bot/bridge-zca/cai-vps.sh")));
ok("AMN-04 CRM tin-nhan nghe Realtime INSERT messages", /postgres_changes[\s\S]{0,80}event: "INSERT"[\s\S]{0,60}table: "messages"/.test(crm));
ok("AMN-05 migration bật Realtime cho messages + conversations", /add table public\.messages/.test(doc("bot/supabase/migrations/20261018a_crm_realtime.sql")) && /add table public\.conversations/.test(doc("bot/supabase/migrations/20261018a_crm_realtime.sql")));
ok("AMN-tu-kiem bắt được URL repo cũ", REPO_CU.test("REPO=https://github.com/quang507/Nhadat.cc.git") && REPO_CU.test("https://raw.githubusercontent.com/quang507/Nhadat.cc/main/x.sh"));

console.log(hong ? `${hong} CA HỎNG` : "TẤT CẢ CA AOND-MỘT-NGUỒN ĐẠT");
if (hong) process.exit(1);
