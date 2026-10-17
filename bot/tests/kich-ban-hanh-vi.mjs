#!/usr/bin/env node
// kich-ban-hanh-vi.mjs — TẦNG BA: mười kịch bản HÀNH VI trên hệ thống THẬT.
//
// Chủ dự án 10/09/2026: "Tầng ba là mười kịch bản hành vi. Gõ 'thôi đăng đi em'
// thì tin phải còn nguyên, gõ 'nhà mở quán 2 tầng' thì quận không được đổi,
// trả lời số tầng bằng '3' thì cột phải có giá trị."
//
// VÌ SAO KHÔNG NẰM TRONG BỘ e2e 256 CA. Bộ đó chạy `chat-reply` thật nhưng cắm
// vào một PostgREST GIẢ — không có trigger, không có constraint, không có RLS.
// Mà bốn lỗi nặng nhất hôm nay đều nằm đúng ở tầng đó:
//   · trigger BEFORE chạy sai thứ tự  → mọi mã tin mang tiền tố sai loại
//   · CHECK bedrooms lệch bộ bóc tách → tin toà nhà không tạo được
//   · hàm đồng bộ cột thiếu nhánh     → cột rỗng mà câu hỏi tính là đã trả lời
//   · policy chặn một khoá không có   → số nhà đọc được bằng khoá công khai
// Mock không thể bắt cái nào trong bốn cái đó, dù thêm bao nhiêu ca.
//
// Nên tầng này bắn tin THẬT vào `chat-reply` đang chạy, rồi đọc DB THẬT xem
// trạng thái có đúng không. Nó KIỂM TRẠNG THÁI, không kiểm câu chữ — lời bot
// đổi theo model, còn "tin phải còn nguyên" thì không đổi.
//
//     bun bot/tests/kich-ban-hanh-vi.mjs          # chạy cả 10
//     bun bot/tests/kich-ban-hanh-vi.mjs 3 7      # chỉ ca 3 và 7
//
// KHÔNG nằm trong CI: mỗi lượt chạy là tiền model thật và cần Internet tới
// Supabase. Chạy tay trước khi deploy, hoặc sau mỗi lần đổi tầng bóc tách.
//
// DỌN: mọi người thử ở đây mang tiền tố Zalo `thu-hv-`, đúng khuôn mà
// `don_du_lieu_thu()` (cron 21:00 giờ VN) xoá sạch — không để lại rác trong rổ.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, "..", "..", "scripts", ".env");
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && m[2].trim() && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}
const URL_DB = process.env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KHOA = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KHOA) {
  console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong scripts/.env — tầng này đọc DB thật.");
  process.exit(2);
}
const H = { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" };

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
async function rest(path, opt = {}) {
  const r = await fetch(`${URL_DB}/rest/v1/${path}`, { headers: H, ...opt });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const rpc = (ten, body = {}) =>
  rest(`rpc/${ten}`, { method: "POST", body: JSON.stringify(body) });

// Bí mật cổng: đọc từ Vault bằng service_role, KHÔNG viết vào file nào.
const GATE = await rpc("get_secret", { secret_name: "BRIDGE_SECRET" });

let dem = 0;
async function nhan(uid, text) {
  // Nhắn và ĐỢI xong: `in_flight` nghĩa là lượt trước chưa trả lời xong.
  for (let lan = 0; lan < 5; lan++) {
    const body = JSON.stringify({
      external_user_id: uid, text,
      msg_id: `hv-${uid}-${Date.now()}-${++dem}`, channel: "zalo_personal_test",
    });
    const r = await fetch(`${URL_DB}/functions/v1/chat-reply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KHOA}`, "x-bridge-secret": GATE, "Content-Type": "application/json" },
      body,
    });
    let j;
    try { j = await r.json(); } catch { j = { loi: await r.text() }; }
    if (j.in_flight || j.deduped) { await nghi(2500); continue; }
    await nghi(700);
    return j;
  }
  throw new Error("chat-reply kẹt in_flight sau 5 lượt");
}

/** Tin mới nhất của người thử này. */
async function tinCua(uid) {
  const s = await rest(`sellers?select=id,active_listing_id&zalo_user_id=eq.${uid}`);
  if (!s.length) return null;
  const l = await rest(
    `listings?select=id,code,property_type,status,district,ward,floors,floors_text,bedrooms,price_vnd,price_raw,area_m2,project_id`
    + `&seller_id=eq.${s[0].id}&order=created_at.desc&limit=1`,
  );
  return l[0] ?? null;
}

const ket = [];
const dat = (ten, ok, chi = "") => {
  ket.push({ ten, ok });
  console.log(`${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${ten}${ok || !chi ? "" : `\n    ${chi}`}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// MƯỜI KỊCH BẢN. Mỗi cái gắn với một lỗi ĐÃ XẢY RA THẬT, ghi ngay trong tên ca.
// ─────────────────────────────────────────────────────────────────────────────
const KICH_BAN = [
  {
    so: 1,
    ten: '"thôi đăng đi em" là lời GIỤC — tin phải còn nguyên (C2, 10/09)',
    async chay() {
      const uid = "thu-hv-1";
      await nhan(uid, "em cần bán nhà hẻm Trần Bình Trọng 60m2, 5 tỷ, phường 4");
      const truoc = await tinCua(uid);
      await nhan(uid, "thôi đăng đi em");
      const sau = await tinCua(uid);
      return [
        sau?.status === truoc?.status && sau?.status !== "an",
        `trạng thái ${truoc?.status} → ${sau?.status}`,
      ];
    },
  },
  {
    so: 2,
    ten: '"nhà mở quán 2 tầng" — quận KHÔNG được đổi thành Quận 2 (C4)',
    async chay() {
      const uid = "thu-hv-2";
      await nhan(uid, "bán nhà quận 10, 4x15, 6 tỷ");
      const truoc = await tinCua(uid);
      await nhan(uid, "nhà mở quán 2 tầng được nha em");
      const sau = await tinCua(uid);
      return [sau?.district === truoc?.district, `quận ${truoc?.district} → ${sau?.district}`];
    },
  },
  {
    so: 3,
    ten: 'Trả lời kết cấu bằng "3" — cột floors phải có giá trị (D3)',
    async chay() {
      const uid = "thu-hv-3";
      await nhan(uid, "bán nhà phố quận 5 phường 2, 50m2, 4 tỷ 5, sổ hồng riêng");
      // Đẩy tới câu hỏi kết cấu rồi trả lời trần một con số.
      for (const c of ["hẻm xe hơi 6m", "3"]) await nhan(uid, c);
      const t = await tinCua(uid);
      return [t?.floors === 3, `floors=${t?.floors} floors_text=${t?.floors_text}`];
    },
  },
  {
    so: 4,
    ten: "Dự án kho CHƯA CÓ — hàng chờ duyệt phải mang ĐÚNG tên (FR-195)",
    async chay() {
      const uid = "thu-hv-4";
      await nhan(uid, "bán căn hộ dự án Lam Sơn Riverside quận 4, 68m2, 4 tỷ 2");
      await nhan(uid, "phí quản lý 14 nghìn/m2, khu có công viên ven sông");
      const q = await rest(
        "project_facts?select=ten_du_an,khoa,gia_tri&nguon=in.(seller_chat,llm)"
        + "&order=created_at.desc&limit=5",
      );
      const co = q.some((x) => (x.ten_du_an ?? "").toLowerCase().includes("lam sơn"));
      const rac = q.some((x) => (x.ten_du_an ?? "").toLowerCase().includes("công viên"));
      return [co && !rac, JSON.stringify(q.slice(0, 3))];
    },
  },
  {
    so: 5,
    ten: "Rao CĂN HỘ — mã tin phải mang đúng loại, không phải NP (C5)",
    async chay() {
      const uid = "thu-hv-5";
      await nhan(uid, "em bán căn hộ chung cư quận 7, 70m2, 2 phòng ngủ, 3 tỷ");
      const t = await tinCua(uid);
      return [
        t?.property_type === "chung_cu" && !/^BDS-NP-/.test(t?.code ?? ""),
        `loại=${t?.property_type} mã=${t?.code}`,
      ];
    },
  },
  {
    so: 6,
    ten: 'Giá "3 tỷ 4" — price_vnd phải đúng 3,4 tỷ, giữ nguyên câu chữ',
    async chay() {
      const uid = "thu-hv-6";
      await nhan(uid, "bán nhà quận 8 phường 5, 45m2, giá 3 tỷ 4");
      const t = await tinCua(uid);
      return [t?.price_vnd === 3400000000, `price_vnd=${t?.price_vnd} raw="${t?.price_raw}"`];
    },
  },
  {
    so: 7,
    ten: 'Giá KHOẢNG "5 tới 6 tỷ" — không được bịa ra một con số (D1)',
    async chay() {
      const uid = "thu-hv-7";
      await nhan(uid, "bán đất quận 9, 100m2, giá khoảng 5 tới 6 tỷ");
      const t = await tinCua(uid);
      // Cấm biến khoảng thành 5,6 tỷ (đọc nhầm "tới" thành "tỏi").
      return [t?.price_vnd !== 5600000000, `price_vnd=${t?.price_vnd} raw="${t?.price_raw}"`];
    },
  },
  {
    so: 8,
    ten: "Toà nhà 24 phòng — tin phải TẠO ĐƯỢC (C6, trần CHECK cũ là 20)",
    async chay() {
      const uid = "thu-hv-8";
      await nhan(uid, "bán toà nhà cho thuê quận 3, 24 phòng ngủ, 200m2, 30 tỷ");
      const t = await tinCua(uid);
      return [!!t && t.bedrooms === 24, `tin=${t?.code} bedrooms=${t?.bedrooms}`];
    },
  },
  {
    so: 9,
    ten: '"không đăng ảnh nữa" là chuyện ẢNH — tin phải còn nguyên (C2)',
    async chay() {
      const uid = "thu-hv-9";
      await nhan(uid, "bán nhà quận 6 phường 10, 55m2, 3 tỷ 9");
      const truoc = await tinCua(uid);
      await nhan(uid, "thôi không đăng ảnh nữa nha em");
      const sau = await tinCua(uid);
      return [sau?.status === truoc?.status && sau?.status !== "an", `${truoc?.status} → ${sau?.status}`];
    },
  },
  {
    so: 10,
    ten: "Rút tin THẬT vẫn phải rút được — đừng vá quá tay (C2 chiều ngược)",
    async chay() {
      const uid = "thu-hv-10";
      await nhan(uid, "bán nhà quận 11 phường 3, 40m2, 2 tỷ 8");
      await nhan(uid, "anh không bán nữa em ơi, rút tin giúp anh");
      const t = await tinCua(uid);
      return [t?.status === "an", `trạng thái=${t?.status}`];
    },
  },
  // ── 11/09/2026: LƯỢT BẮN 42 CA — mỗi ca một lỗi bong bóng 💾 lòi ra trên DB thật.
  // Sửa ở PR "bóc tách 42 ca" (TS) + migration 20260911e (SQL).
  {
    so: 11,
    ten: 'Giá lóng "9t5" — price_vnd phải 9,5 tỷ (bản trước: trống)',
    async chay() {
      const uid = "thu-hv-11";
      await nhan(uid, "bán nhà hxh Nguyễn Trãi p3 q5, 4x16, 1 trệt 2 lầu, shr, 9t5");
      const t = await tinCua(uid);
      return [t?.price_vnd === 9500000000, `price_vnd=${t?.price_vnd} raw="${t?.price_raw}"`];
    },
  },
  {
    so: 12,
    ten: '"4 tỷ rưỡi" — price_vnd 4,5 tỷ (bản trước: chuan_hoa_gia_raw gọt còn 4 tỷ)',
    async chay() {
      const uid = "thu-hv-12";
      await nhan(uid, "bán nhà q11 phường 6 40m2 4 tỷ rưỡi");
      const t = await tinCua(uid);
      return [t?.price_vnd === 4500000000, `price_vnd=${t?.price_vnd} raw="${t?.price_raw}"`];
    },
  },
  {
    so: 13,
    ten: '"75 triệu/m2, 50m2" — giá CẢ CĂN 3,75 tỷ, không phải 75 triệu',
    async chay() {
      const uid = "thu-hv-13";
      await nhan(uid, "bán nhà quận 5 giá 75 triệu/m2, diện tích 50m2");
      const t = await tinCua(uid);
      return [t?.price_vnd === 3750000000, `price_vnd=${t?.price_vnd} raw="${t?.price_raw}"`];
    },
  },
  {
    so: 14,
    ten: 'Cho thuê "3tr5 một tháng" — price_vnd 3,5 triệu (bản trước: trống)',
    async chay() {
      const uid = "thu-hv-14";
      await nhan(uid, "cho thuê phòng trọ q10 có gác, 20m2, 3tr5 một tháng");
      const t = await tinCua(uid);
      return [t?.price_vnd === 3500000, `price_vnd=${t?.price_vnd} raw="${t?.price_raw}"`];
    },
  },
  {
    so: 15,
    ten: '"sang nhượng căn hộ" không có chữ "bán" — vẫn phải MỞ tin, loại chung cư',
    async chay() {
      const uid = "thu-hv-15";
      await nhan(uid, "Cần sang nhượng căn hộ The Sun Avenue quận 2 3pn 96m2, HĐMB, giá 5 tỷ");
      const t = await tinCua(uid);
      return [t?.property_type === "chung_cu", `tin=${t?.code} loại=${t?.property_type}`];
    },
  },
  {
    so: 16,
    ten: '"bán căn 2PN Sunrise City Q7 tầng 15" — chung cư, KHÔNG có số tầng nhà',
    async chay() {
      const uid = "thu-hv-16";
      await nhan(uid, "bán căn 2PN Sunrise City Q7 tầng 15 view sông 76m2 4ty3, sổ hồng");
      const t = await tinCua(uid);
      return [t?.property_type === "chung_cu" && t?.floors == null, `loại=${t?.property_type} floors=${t?.floors}`];
    },
  },
  {
    so: 17,
    ten: 'Người MUA "có căn nào q5 tầm 5 tỷ không em" — KHÔNG được mở tin rao',
    async chay() {
      const uid = "thu-hv-17";
      await nhan(uid, "có căn nào q5 tầm 5 tỷ không em");
      const t = await tinCua(uid);
      return [!t, `tin=${t?.code} floors=${t?.floors}`];
    },
  },
  {
    so: 18,
    ten: 'Nhà Hà Nội — KHÔNG mở tin (bản trước: tin Quận 5)',
    async chay() {
      const uid = "thu-hv-18";
      await nhan(uid, "bán nhà ở Hà Nội quận Cầu Giấy 50m2 9 tỷ");
      const t = await tinCua(uid);
      return [!t, `tin=${t?.code} quận=${t?.district}`];
    },
  },
  {
    so: 19,
    ten: '"phường 9 chứ không phải phường 4" — ward phải là Phường 9',
    async chay() {
      const uid = "thu-hv-19";
      await nhan(uid, "bán nhà p4 q5 60m2 7 tỷ");
      await nhan(uid, "sai rồi em, phường 9 chứ không phải phường 4");
      const t = await tinCua(uid);
      return [t?.ward === "Phường 9", `ward=${t?.ward}`];
    },
  },
  {
    so: 20,
    ten: '"hỏi gì hỏi lắm vậy em, anh bận" — KHÔNG thành tên phường',
    async chay() {
      const uid = "thu-hv-20";
      await nhan(uid, "bán nhà q3 70m2 12 tỷ");
      await nhan(uid, "hỏi gì hỏi lắm vậy em, anh bận");
      const t = await tinCua(uid);
      return [t?.ward == null, `ward=${t?.ward}`];
    },
  },
  {
    so: 21,
    ten: 'Câu nói bằng giọng "quận năm phường hai … năm mươi mét vuông … bốn tỷ rưỡi"',
    async chay() {
      const uid = "thu-hv-21";
      await nhan(uid, "bán nhà quận năm phường hai diện tích năm mươi mét vuông giá bốn tỷ rưỡi");
      const t = await tinCua(uid);
      return [
        t?.ward === "Phường 2" && Number(t?.area_m2) === 50 && t?.price_vnd === 4500000000,
        `ward=${t?.ward} dt=${t?.area_m2} price_vnd=${t?.price_vnd}`,
      ];
    },
  },
  {
    so: 22,
    ten: '"anh có 2 căn: 1 căn q5 …, 1 căn q11 …" — HAI tin, đúng hai quận',
    async chay() {
      const uid = "thu-hv-22";
      await nhan(uid, "anh có 2 căn: 1 căn q5 50m2 6 tỷ, 1 căn q11 40m2 4 tỷ");
      const s = await rest(`sellers?select=id&zalo_user_id=eq.${uid}`);
      const ls = s.length ? await rest(`listings?select=district,unit_code&seller_id=eq.${s[0].id}&order=district`) : [];
      const q = ls.map((l) => l.district).sort().join(",");
      return [q === "Quận 11,Quận 5" && ls.every((l) => !l.unit_code), JSON.stringify(ls)];
    },
  },
  {
    so: 23,
    ten: 'Rao không nói quận, lượt sau "quận 8 phường 6" — MÃ tin đổi theo Quận 8 (migration 20260911f)',
    async chay() {
      const uid = "thu-hv-23";
      await nhan(uid, "bán nhà hẻm 12 Hồ Ngọc Lãm 50m2 3 tỷ");
      const truoc = await tinCua(uid);
      await nhan(uid, "quận 8 phường 6 em");
      const sau = await tinCua(uid);
      return [
        sau?.district === "Quận 8" && /^BDS-NP-Q8-\d+$/.test(sau?.code ?? ""),
        `mã ${truoc?.code} → ${sau?.code} · quận ${truoc?.district} → ${sau?.district}`,
      ];
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
const chon = process.argv.slice(2).filter((x) => /^\d+$/.test(x)).map(Number);
const chay = chon.length ? KICH_BAN.filter((k) => chon.includes(k.so)) : KICH_BAN;

console.log(`TẦNG BA — ${chay.length} kịch bản hành vi trên hệ thống THẬT`);
console.log("Người thử mang tiền tố `thu-hv-`, cron 21:00 dọn sạch.\n");

for (const k of chay) {
  try {
    const [ok, chi] = await k.chay();
    dat(`${k.so}. ${k.ten}`, ok, chi);
  } catch (e) {
    dat(`${k.so}. ${k.ten}`, false, `NỔ: ${e.message}`);
  }
}

const hong = ket.filter((x) => !x.ok);
console.log(`\n${ket.length - hong.length}/${ket.length} kịch bản ĐẠT`);
if (hong.length) {
  console.log("\x1b[31mTẦNG BA HỎNG\x1b[0m — hành vi thật lệch với thiết kế:");
  for (const x of hong) console.log(`  · ${x.ten}`);
  process.exitCode = 1;
} else {
  console.log("\x1b[32mTẦNG BA ĐẠT\x1b[0m");
}
