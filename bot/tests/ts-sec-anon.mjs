#!/usr/bin/env node
// TS-SEC tự động — bắn anon key thật vào DB thật, kiểm RLS còn đứng không.
//
// ====================== VÌ SAO PHẢI CÓ CÁI NÀY ======================
// Tới 04/09/2026 TS-SEC là bộ chạy TAY trong SQL Editor (docs/10 §10.7), nghĩa
// là nó chỉ chạy khi có người nhớ chạy. Hai lần hỏng gần nhất đều lọt qua:
//
//   · 27/08 — `agents_public` bị đặt security_invoker=true, anon đọc ra 0 dòng,
//     trang /moi-gioi trắng SUỐT 8 NGÀY. Không ai biết vì không có gì kiểm.
//   · 02/09 — `20260902e` viết lại `listing_facts_sync_cols` từ bản nền sai,
//     rụng 4 nhánh, FR-164 chết ở tầng DB.
//
// KHOÁ Ở ĐÂY LÀ KHOÁ CÔNG KHAI. `sb_publishable_...` nằm sẵn trong
// lib/supabase.ts và trong mọi bundle web đã phát hành — nó KHÔNG phải bí mật,
// nó chính là thứ mà RLS phải chịu được. Đừng thay bằng service_role: làm thế
// là bỏ qua RLS và bộ test này mất sạch ý nghĩa.
//
// ================= BÀI HỌC: IM LẶNG KHÔNG PHẢI LÀ ĐẠT =================
// Bản đầu của chính file này coi "HTTP ≥ 400 = bị chặn = đạt". Chạy thử trong
// sandbox thì 24/24 bài "đạt" — trong khi KHÔNG một request nào tới được
// Supabase: proxy egress trả 403 "Host not in allowlist". Nghĩa là mất mạng,
// sai URL, hay project bị pause đều cho ra một bộ test XANH RỜN.
//
// Nên bây giờ, một bài chỉ tính "bị chặn" khi PostgREST TỰ NÓ từ chối: thân
// trả về phải là JSON đúng hình lỗi PostgREST (`{code, message}`). Một cái 403
// chữ trần từ proxy không tính. Và có bài dò đường ĐI TRƯỚC: không đọc nổi tin
// công khai thì thoát ngay với mã riêng, không chấm điểm bảo mật nữa.
//
// PHẠM VI: chỉ các bài KHÔNG PHÁ HUỶ. Bài xoá dữ liệu (TS-SEC-02 `delete from
// reminders`) vẫn ở bộ chạy tay — nếu RLS hỏng thật thì bài đó XOÁ DỮ LIỆU
// THẬT, không đáng chạy tự động mỗi PR.
//
//     node bot/tests/ts-sec-anon.mjs
//   Tự kiểm chính nó (không cần mạng): node bot/tests/ts-sec-anon.tu-kiem.mjs

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_f4wNO8jQcCDWn1QmNZQ7-g_BXDtYM3Y";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

let dat = 0, hong = 0;
const ok = (t) => { dat++; console.log(`✓ ${t}`); };
const ko = (t, vi) => { hong++; console.log(`✗ ${t}\n    ${vi}`); };

async function goi(duong, tuyChon = {}) {
  const { method = "GET", than, ...them } = tuyChon;
  const r = await fetch(`${URL}/rest/v1/${duong}`, {
    method,
    headers: { ...H, ...(than ? { "Content-Type": "application/json" } : {}), ...them },
    ...(than ? { body: JSON.stringify(than) } : {}),
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body, tho: text, dem: r.headers.get("content-range") };
}

// Chỉ PostgREST mới trả JSON có `message` — proxy, CDN, load balancer thì không.
// Đây là ranh giới giữa "DB từ chối" và "không tới được DB".
const laPostgrestTuChoi = (r) =>
  r.status >= 400 && r.body && typeof r.body === "object" && typeof r.body.message === "string";

function khongToiDuoc(what, r) {
  console.log(`\n✗✗ KHÔNG TỚI ĐƯỢC DB — không chấm điểm bảo mật được.`);
  console.log(`   ${what}: HTTP ${r.status} · ${String(r.tho).slice(0, 300)}`);
  console.log("   Có thể là: mất mạng / proxy chặn host / sai NEXT_PUBLIC_SUPABASE_URL /");
  console.log("   project bị pause. ĐỪNG coi đây là 'bảo mật ổn' — nó là 'chưa kiểm được'.");
  process.exit(2);
}

// ── Bài dò đường: phải đọc được tin công khai trước đã ──────────────────────
let khoTrong = false;
const dau = await goi("listings?select=code&limit=1");
if (dau.status !== 200 || !Array.isArray(dau.body)) khongToiDuoc("đọc listings", dau);
if (dau.body.length === 0) {
  // "listings rỗng" trước đây gộp hai chuyện khác hẳn nhau: KHO TRỐNG (đúng
  // trạng thái sau khi dọn dữ liệu kiểm thử 10/09) và RLS SIẾT QUÁ TAY (sự cố
  // thật, đúng hình lỗi làm /moi-gioi trắng 27/08). Cần một tín hiệu ĐỘC LẬP để
  // tách hai thứ: `projects` cũng là bảng anon được đọc và đang có hơn ngàn
  // dòng. Ra dòng ở đó nghĩa là đường anon còn thông, chỉ là chưa có tin lên kệ.
  khoTrong = true;
  const p = await goi("projects?select=id&limit=1");
  if (p.status === 200 && Array.isArray(p.body) && p.body.length > 0) {
    console.log("• kho tin đang TRỐNG (chưa có tin lên kệ) nhưng anon vẫn đọc được projects → đường anon thông, đi tiếp.");
  } else {
    console.log("✗✗ listings RỖNG và projects cũng không ra dòng nào — RLS nhiều khả năng");
    console.log("   siết quá tay. Đây là 'chưa kiểm được', đừng coi là đạt.");
    process.exit(2);
  }
} else {
  ok(`dò đường: anon đọc được tin công khai (${dau.body.length} dòng mẫu)`);
}

// ── Nhóm 1: bảng nội bộ — anon phải KHÔNG thấy dòng nào ─────────────────────
for (const bang of [
  "reminders", "sellers", "ctvs", "messages", "conversations",
  "viewings", "deals", "buyers", "info_requests", "bot_errors",
  "inbound_ledger", "curated_lists", "ratings_log", "property_events",
]) {
  const r = await goi(`${bang}?select=*&limit=1`);
  if (laPostgrestTuChoi(r)) ok(`${bang}: DB từ chối anon (${r.body.code ?? r.status})`);
  else if (r.status === 200 && Array.isArray(r.body) && r.body.length === 0) ok(`${bang}: anon đọc ra 0 dòng`);
  else if (r.status === 200) ko(`${bang}: ANON ĐỌC ĐƯỢC DỮ LIỆU NỘI BỘ`, JSON.stringify(r.body).slice(0, 200));
  else khongToiDuoc(bang, r);
}

// ── Nhóm 2: view/RPC nội bộ — anon phải bị từ chối ──────────────────────────
{
  const r = await goi("public_listings?select=*&limit=1");
  if (laPostgrestTuChoi(r)) ok(`public_listings: DB từ chối anon (${r.body.code ?? r.status})`);
  else if (r.status === 200) ko("public_listings: anon đọc được", "view này KHÔNG lọc trạng thái — hở là lộ tin nháp");
  else khongToiDuoc("public_listings", r);
}
for (const ten of [
  "get_secret", "seller_drip_tick", "ctv_report_tick",
  "xuat_schema", "liet_ke_migration", // liet_ke_bang: xoá ở 20260911h cùng sao lưu
  "quota_tieu_hao", // FR-192: cửa đọc quota chỉ cho admin
]) {
  const r = await goi(`rpc/${ten}`, {
    method: "POST",
    than: ten === "get_secret" ? { p_name: "ANTHROPIC_API_KEY" } : {},
  });
  if (laPostgrestTuChoi(r)) ok(`rpc/${ten}: DB từ chối anon (${r.body.code ?? r.status})`);
  else if (r.status < 400) ko(`rpc/${ten}: ANON GỌI ĐƯỢC`, `HTTP ${r.status} · ${String(r.tho).slice(0, 200)}`);
  else khongToiDuoc(`rpc/${ten}`, r);
}

// ── Nhóm 3: ghi — anon phải không tạo/sửa được gì ───────────────────────────
// Có ghi thật vào DB thật, nên chỉ giữ hai bài rẻ nhất và tự dọn nếu lọt. Một
// bài LỌT là sự cố P0; một dòng rác lúc đó là chuyện nhỏ nhất trong ngày.
{
  const ma = `ZZTEST-CI-${Date.now()}`;
  const r = await goi("listings", {
    method: "POST",
    than: { code: ma, ward: "Phường 1", description: "probe CI, xoá được" },
    Prefer: "return=representation",
  });
  if (laPostgrestTuChoi(r)) ok(`insert listings: DB từ chối anon (${r.body.code ?? r.status})`);
  else if (r.status < 400) {
    ko("insert listings: ANON TẠO ĐƯỢC TIN", `HTTP ${r.status} — mã rác ${ma}, thử dọn…`);
    await goi(`listings?code=eq.${ma}`, { method: "DELETE" });
  } else khongToiDuoc("insert listings", r);
}
{
  const r = await goi("bot_prompts?key=eq.tone_rules", { method: "PATCH", than: { content: "probe CI" } });
  if (laPostgrestTuChoi(r)) ok(`update bot_prompts: DB từ chối anon (${r.body.code ?? r.status})`);
  else if (r.status < 400) {
    // PostgREST trả 204 kèm 0 dòng bị đụng khi RLS lọc sạch — đó cũng là đạt.
    const con = await goi("bot_prompts?select=content&key=eq.tone_rules");
    if (laPostgrestTuChoi(con) || (Array.isArray(con.body) && con.body.length === 0)) {
      ok("update bot_prompts: anon không đụng được dòng nào");
    } else {
      ko("update bot_prompts: ANON SỬA ĐƯỢC NÃO BOT", "khôi phục bot_prompts NGAY");
    }
  } else khongToiDuoc("update bot_prompts", r);
}

// ── Nhóm 4: mặt công khai — phải CÒN đọc được ───────────────────────────────
// Nhóm này bắt lỗi SIẾT QUÁ TAY, đúng loại đã làm /moi-gioi trắng 8 ngày. Một
// bộ kiểm bảo mật chỉ kiểm chiều "chặn" sẽ báo xanh rờn khi web chết sạch.
{
  const r = await goi("agents_public?select=*");
  // 15/09/2026: tín hiệu ĐỘC LẬP — `so_nmg_cong_khai()` (20260915c) trả SỐ nhà môi giới,
  // mở cho anon. Sau lệnh xoá hàng loạt (FR-210) DB không còn NMG nào, view rỗng là
  // đúng cảnh dù kho có tin của tài khoản thử (CCRB); bản trước coi đó là siết quá tay
  // và CI đỏ 6 lượt liền. Rỗng mà số NMG > 0 mới là lỗi 27/08.
  const nmg = await goi("rpc/so_nmg_cong_khai", { method: "POST", than: {} });
  const soNmg = nmg.status === 200 && typeof nmg.body === "number" ? nmg.body : null;
  if (r.status === 200 && Array.isArray(r.body) && r.body.length > 0) ok(`agents_public: anon đọc được ${r.body.length} NMG`);
  else if (r.status === 200 && soNmg === 0) console.log("• agents_public rỗng và DB có 0 NMG (so_nmg_cong_khai) → đúng cảnh, không phải siết quá tay.");
  // Rỗng khi KHO CŨNG TRỐNG là đúng cảnh: không có tin thì cũng chưa có nhà môi
  // giới nào để khoe. Lỗi 27/08 là cảnh khác hẳn — kho đầy tin mà view vẫn rỗng.
  else if (r.status === 200 && khoTrong) console.log("• agents_public rỗng, nhưng kho tin cũng trống → đúng cảnh DB mới dọn, không phải siết quá tay.");
  else if (r.status === 200) ko("agents_public: anon đọc ra RỖNG", `đây ĐÚNG lỗi làm /moi-gioi trắng 27/08→04/09 (DB có ${soNmg ?? "?"} NMG)`);
  else ko("agents_public: anon bị chặn", `siết quá tay — HTTP ${r.status} · ${String(r.tho).slice(0, 150)}`);
}
for (const bang of ["projects", "listing_facts", "listing_photos_v"]) {
  const r = await goi(`${bang}?select=*&limit=1`);
  if (r.status === 200) ok(`${bang}: anon đọc được`);
  else ko(`${bang}: anon bị chặn`, `siết quá tay — HTTP ${r.status} · ${String(r.tho).slice(0, 150)}`);
}

// ── Nhóm 5: tin nháp không được lọt ra ngoài ────────────────────────────────
{
  const r = await goi("listings?select=code&status=eq.cho_thong_tin&limit=1", { Prefer: "count=exact" });
  if (laPostgrestTuChoi(r)) ok(`tin cho_thong_tin: DB từ chối anon (${r.body.code ?? r.status})`);
  else if (r.status === 200 && Array.isArray(r.body) && r.body.length === 0) ok(`tin cho_thong_tin: anon thấy 0 (đếm ${r.dem ?? "?"})`);
  else if (r.status === 200) ko("tin cho_thong_tin: ANON THẤY TIN NHÁP", JSON.stringify(r.body).slice(0, 200));
  else khongToiDuoc("listings cho_thong_tin", r);
}

console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong) {
  console.log("TS-SEC HỎNG — coi là sự cố bảo mật, đừng merge.");
  // `process.exitCode` chứ KHÔNG `process.exit()`: trên Windows, cắt tiến trình
  // khi còn socket keep-alive của mấy chục lượt dò làm libuv nổ assertion, bun
  // trả 0xC0000409 thay vì 1 — bài tự kiểm đọc mã thoát liền báo "TỰ KIỂM
  // HỎNG" trong lúc bộ probe vẫn chấm đúng. Để script tự hết là hết.
  process.exitCode = 1;
} else {
  console.log("TẤT CẢ CA TS-SEC ĐẠT");
}
