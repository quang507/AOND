#!/usr/bin/env node
// xuat-ro-hang.mjs — xuất rổ hàng ra thứ NGƯỜI đọc được: mỗi tin một thư mục
// (`tin.md` + ảnh), kèm `ro-hang.csv` mở thẳng bằng Excel.
//
// ====================== VÌ SAO CÓ CÁI NÀY, VÀ NÓ KHÔNG PHẢI CÁI GÌ ======================
// Muốn xem "rổ hàng đang có gì" mà mở bảng `listings` 56 cột là việc không ai làm.
//
// Script này lấp đúng chỗ đó. Nhưng nói rõ ngay để không ai nhầm:
//
//   ĐÂY KHÔNG PHẢI BẢN SAO LƯU.
//
// Nó chỉ xuất `listings` + `media` + `listing_facts` (3/31 bảng). KHÔNG có
// `conversations`, `messages`, `inbound_ledger`, `deals`, `buyers`, `sellers`.
// Mất hội thoại là mất chính luận điểm sản phẩm; mất `inbound_ledger` là bot
// phát lại toàn bộ tin cũ cho khách. Và markdown không giữ UUID, khoá ngoại,
// `status`, `*_source` — đọc lại được, DỰNG LẠI KHÔNG ĐƯỢC.
//
// Dự án KHÔNG còn sao lưu DB (chủ dự án bỏ 11/09/2026) — thư mục này không thay
// được bản sao.
//
// ============================== CÁCH DÙNG ==============================
//   Khoá đặt MỘT LẦN vào scripts/.env (đã gitignore):
//       SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
//   rồi:
//       node scripts/xuat-ro-hang.mjs                      → ../nhadat-ro-hang/<ngày>/
//       node scripts/xuat-ro-hang.mjs /duong/dan/khac
//       node scripts/xuat-ro-hang.mjs --anh "D:\masterDB"  → CHÉP luôn ảnh vào từng thư mục tin
//       node scripts/xuat-ro-hang.mjs --ban                → chỉ tin BÁN (bỏ tin cho thuê)
//   PHẢI có chữ `node` ở đầu. Gõ mỗi tên file thì Windows mở Notepad.
//
// VỀ ẢNH: `media.storage_path` hiện là đường dẫn TƯƠNG ĐỐI kiểu
// `masterDB/photos/1/1.jpg`, `storage_provider='onedrive'` — byte ảnh KHÔNG
// nằm trong Supabase (`storage.objects` = 0 dòng, kiểm 06/09/2026). Không đưa
// `--anh` thì `tin.md` chỉ LIỆT KÊ đường dẫn; đưa thì script chép file thật.
//
// THƯ MỤC ĐÍCH NẰM NGOÀI REPO, và script TỪ CHỐI ghi vào trong repo: `tin.md`
// mang mô tả nguyên văn (có SĐT thật) và `location_raw` (địa chỉ nhà dân),
// còn repo này đang PUBLIC.
//
// ĐỂ LÊN Ổ CHUNG CÔNG TY (OneDrive/Google Drive) THÌ NHỚ: thư mục này có SĐT
// và địa chỉ khách. Đặt ở thư mục HẠN CHẾ QUYỀN, không phải "Shared with
// everyone" — CLAUDE.md §5.

import { mkdir, writeFile, copyFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

// Nạp scripts/.env: `set KEY=...` trong cmd chỉ sống đúng
// cửa sổ đó, bắt gõ lại mỗi lần thì sớm muộn cũng quên.
const ENV_FILE = join(HERE, ".env");
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const val = m[2].trim().replace(/^(['"])(.*)\1$/, "$2").replace(/^<(.*)>$/, "$1");
    if (val && !(m[1] in process.env)) process.env[m[1]] = val;
  }
}

const URL_DU_AN = process.env.SUPABASE_URL
  ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KHOA = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Tham số ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const layCo = (ten) => {
  const i = argv.indexOf(ten);
  return i >= 0 ? (argv[i + 1] ?? "") : null;
};
const goc_anh = layCo("--anh");
const chi_ban = argv.includes("--ban");
const duong_dich = argv.find((a, i) =>
  !a.startsWith("--") && argv[i - 1] !== "--anh"
);

// `process.exit()` ở đây làm node trên Windows nổ
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`: socket keep-alive của
// lượt fetch vừa xong còn trong tay libuv, cắt tiến trình là chết kiểu 0xC0000409
// (mã thoát 3221226505) thay vì 1. Script vẫn in đúng lý do hỏng, nhưng ai đọc MÃ
// THOÁT — bài tự kiểm, CI, cron — thì thấy một kiểu hỏng khác hẳn. Nay ném lỗi
// riêng, bẫy ở `uncaughtException`, để tiến trình tự hết với exitCode = 1.
class LoiDung extends Error {
  constructor(msg) { super(msg); this.name = "LoiDung"; }
}
process.on("uncaughtException", (e) => {
  if (e?.name !== "LoiDung") console.error(e);
  process.exitCode = 1;
});

function chet(msg) {
  console.error(`\n\x1b[31m${msg}\x1b[0m`);
  throw new LoiDung(msg);
}

if (!KHOA) {
  chet(
    "Thiếu SUPABASE_SERVICE_ROLE_KEY.\n" +
      `  Đặt vào ${ENV_FILE} (file đó đã gitignore) rồi chạy lại:\n` +
      "      SUPABASE_SERVICE_ROLE_KEY=eyJhbG...\n" +
      "  Lấy khoá ở Dashboard → Project Settings → API → service_role.\n" +
      "  ĐỪNG dán khoá đó vào file trong repo, đừng commit, đừng gõ vào chat.",
  );
}

const ngay = new Date().toISOString().slice(0, 10);
const dich = resolve(duong_dich ?? join(HERE, "..", "..", "nhadat-ro-hang", ngay));

// Chặn ghi vào repo. Mặc định đã trỏ ra ngoài, nhưng mặc định chỉ bảo vệ người
// KHÔNG gõ tham số. `tin.md` mang SĐT thật; repo này public.
const GOC_REPO = resolve(HERE, "..");
if (dich === GOC_REPO || dich.startsWith(GOC_REPO + sep)) {
  chet(
    `TỪ CHỐI: thư mục đích nằm TRONG repo (${dich}).\n` +
      "  Bản xuất mang SĐT thật và địa chỉ nhà dân; repo này đang public.\n" +
      "  Chọn đường dẫn ngoài repo, hoặc bỏ tham số để dùng mặc định ../nhadat-ro-hang/.",
  );
}

// ── Đọc dữ liệu ─────────────────────────────────────────────────────────────
const TRANG = 1000;

// Luật: hỏi DB số dòng THẬT bằng `count=exact` rồi đối
// chiếu. Một trang rỗng sớm (proxy cắt, db_max_rows, timeout) mà không đối
// chiếu thì cho ra thư mục THIẾU TIN nhìn y hệt thư mục đủ.
async function keo(ten, chon = "*", loc = "") {
  const rows = [];
  let tong = null;
  for (let tu = 0; ; tu += TRANG) {
    const r = await fetch(
      `${URL_DU_AN}/rest/v1/${ten}?select=${encodeURIComponent(chon)}${loc}`,
      {
        headers: {
          apikey: KHOA,
          Authorization: `Bearer ${KHOA}`,
          Range: `${tu}-${tu + TRANG - 1}`,
          "Range-Unit": "items",
          ...(tu === 0 ? { Prefer: "count=exact" } : {}),
        },
      },
    );
    if (!r.ok) throw new Error(`${ten}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    if (tu === 0) {
      const m = /\/(\d+)\s*$/.exec(r.headers.get("content-range") ?? "");
      tong = m ? Number(m[1]) : null;
    }
    const phan = await r.json();
    rows.push(...phan);
    if (phan.length < TRANG) break;
  }
  if (tong !== null && rows.length !== tong) {
    throw new Error(
      `${ten}: kéo về ${rows.length} dòng nhưng DB báo ${tong}. ` +
        "Lệch số = bản xuất THIẾU, không xuất tiếp.",
    );
  }
  return rows;
}

// ── Nhãn tiếng Việt (giữ khớp lib/format.ts — sửa một bên phải sửa bên kia) ──
const LOAI = {
  nha_pho: "Nhà phố", nha_cap4: "Nhà cấp 4", chung_cu: "Chung cư", dat: "Đất",
  biet_thu: "Biệt thự", phong_tro: "Phòng trọ", mat_bang: "Mặt bằng",
  chua_ro: "Chưa rõ",
};
const VAO = {
  mat_tien: "Mặt tiền", hem_xe_tai: "Hẻm xe tải", hem_xe_hoi: "Hẻm xe hơi",
  hem_xe_may: "Hẻm xe máy", hem: "Trong hẻm",
};
const PHAP_LY = {
  so_hong_rieng: "Sổ hồng riêng", so_hong_chung: "Sổ hồng chung",
  so_hong: "Có sổ", hdmb: "Hợp đồng mua bán", giay_tay: "Giấy tay",
};
const TRANG_THAI = {
  cho_thong_tin: "Chờ bổ sung thông tin (CHƯA lên web)", dang_ban: "Đang bán",
  dang_quan_tam: "Đang có khách quan tâm", da_chot: "Đã chốt", an: "Đã gỡ",
};
const NOI_THAT = { full: "Đầy đủ", co_ban: "Cơ bản", khong: "Không" };
const NGUON = {
  suy_doan: "máy đoán — CHƯA ai xác nhận", chu_xac_nhan: "chủ nhà xác nhận",
  admin: "admin nhập", boc_mo_ta: "máy bóc từ mô tả — CHƯA ai xác nhận",
};

const so = (v) => (v == null || v === "" ? null : String(v).replace(/\.0+$/, ""));
const ty = (v) => (v ? `${(Number(v) / 1e9).toFixed(2).replace(/\.?0+$/, "")} tỷ` : null);
const trM2 = (v) => (v ? `${Math.round(Number(v) / 1e6)} tr/m²` : null);
// Tên thư mục an toàn cho cả Windows lẫn OneDrive: bỏ ký tự cấm < > : " / \ | ? *
const anToan = (s) => String(s ?? "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim() || "khong-ma";

// ── Dựng tin.md cho một tin ─────────────────────────────────────────────────
function vietTinMd(l, anh, facts) {
  const d = [];
  const p = (k, v) => { if (v != null && v !== "") d.push(`| ${k} | ${v} |`); };

  const tieuDe = [
    LOAI[l.property_type] ?? l.property_type ?? "Nhà đất",
    l.ward, l.district,
  ].filter(Boolean).join(" · ");

  const out = [];
  out.push(`# ${l.code ?? "(chưa có mã)"} — ${tieuDe}`);
  out.push("");
  out.push(`**${l.price_raw ?? "chưa có giá"}**${l.area_m2 ? ` · ${so(l.area_m2)} m²` : ""}${
    l.price_per_m2_vnd ? ` · ${trM2(l.price_per_m2_vnd)}` : ""
  }`);
  out.push("");

  // Cảnh báo TRƯỚC bảng, không giấu ở cuối: đây là thứ người đọc cần biết ngay.
  const ngo = [];
  if (l.property_type_source === "suy_doan") {
    ngo.push(`Loại BĐS (**${LOAI[l.property_type] ?? l.property_type}**) là **máy đoán**, chưa ai xác nhận.`);
  }
  if (l.specs_source === "boc_mo_ta") {
    ngo.push("Thông số bên dưới do **máy bóc từ mô tả**, chưa ai xác nhận.");
  }
  if (l.status === "cho_thong_tin") ngo.push("Tin **chưa lên web** (thiếu giá / diện tích / phường).");
  if (ngo.length) {
    out.push("> ⚠️ " + ngo.join(" "));
    out.push("");
  }

  out.push("| Trường | Giá trị |");
  out.push("|---|---|");
  p("Hình thức", l.deal === "cho_thue" ? "Cho thuê" : "Bán");
  p("Loại", LOAI[l.property_type] ?? l.property_type);
  p("Trạng thái", TRANG_THAI[l.status] ?? l.status);
  p("Địa chỉ", l.location_raw);
  p("Đường", l.street);
  p("Phường", l.ward);
  p("Quận/huyện", l.district);
  p("Giá rao", l.price_raw);
  p("Giá (số)", ty(l.price_vnd));
  p("Giá / m²", trM2(l.price_per_m2_vnd));
  p("Diện tích", l.area_m2 ? `${so(l.area_m2)} m²` : null);
  p("DT công nhận", l.legal_area_m2 ? `${so(l.legal_area_m2)} m²` : null);
  p("DT xây dựng", l.built_area_m2 ? `${so(l.built_area_m2)} m²` : null);
  p("Ngang × dài", l.frontage_m && l.length_m ? `${so(l.frontage_m)} × ${so(l.length_m)} m` : null);
  p("Nở hậu", l.rear_width_m ? `${so(l.rear_width_m)} m` : null);
  p("Kết cấu", l.floors_text ?? (l.floors ? `${l.floors} tầng` : null));
  p("Tầng (chung cư)", l.property_type === "chung_cu" && l.floor != null ? `Tầng ${l.floor}` : null);
  p("Phòng ngủ", l.bedrooms ? `${l.bedrooms} PN` : null);
  p("Phòng tắm", l.bathrooms ? `${l.bathrooms} WC` : null);
  p("Đường vào", l.access_type
    ? `${VAO[l.access_type] ?? l.access_type}${l.alley_width_m ? ` ${so(l.alley_width_m)} m` : ""}`
    : null);
  p("Cách mặt tiền", l.distance_to_street_m ? `${so(l.distance_to_street_m)} m` : null);
  p("Pháp lý", l.legal_status
    ? `${PHAP_LY[l.legal_status] ?? l.legal_status}${l.has_completion ? ", đã hoàn công" : ""}`
    : null);
  p("Quy hoạch", l.planning_status);
  p("Hướng", l.direction);
  p("Nội thất", l.furnishing ? NOI_THAT[l.furnishing] ?? l.furnishing : null);
  p("Năm xây", l.year_built);
  p("Tiện ích", [
    l.has_elevator ? "thang máy" : null,
    l.car_in_house ? "xe hơi vô nhà" : null,
    l.corner_lot ? "căn góc" : null,
  ].filter(Boolean).join(" · ") || null);
  p("Đang cho thuê", l.deal === "ban" && l.rent_income_vnd
    ? `${Math.round(Number(l.rent_income_vnd) / 1e6)} tr/tháng` : null);
  p("Thương lượng", l.negotiable === true ? "Còn thương lượng"
    : l.negotiable === false ? "Giá chốt" : null);
  p("Số ảnh", anh.length || null);
  p("Ngày vào kho", l.created_at ? String(l.created_at).slice(0, 10) : null);
  out.push("");

  out.push("### Ai chốt số nào");
  out.push("");
  out.push("| Nhóm | Nguồn |");
  out.push("|---|---|");
  for (const [k, v] of [
    ["Loại BĐS", l.property_type_source], ["Giá", l.price_source],
    ["Phường", l.ward_source], ["Thông số", l.specs_source],
  ]) if (v) out.push(`| ${k} | ${NGUON[v] ?? v} |`);
  out.push("");

  if (facts.length) {
    out.push("### Chủ nhà / CTV đã trả lời");
    out.push("");
    for (const f of facts) out.push(`- **${f.question}**: ${f.answer}`);
    out.push("");
  }

  out.push("### Mô tả gốc");
  out.push("");
  // Nguyên văn câu rao, KHÔNG sửa (FR-91/153). Bọc blockquote để markdown
  // không nuốt dấu gạch đầu dòng của người rao.
  out.push((l.description ?? "_(chưa có mô tả)_").split(/\r?\n/).map((x) => `> ${x}`).join("\n"));
  out.push("");

  if (anh.length) {
    out.push("### Ảnh");
    out.push("");
    for (const a of anh) {
      out.push(a.chep ? `![${a.ten}](anh/${a.ten})` : `- \`${a.storage_path}\` _(chưa chép — chạy lại với \`--anh\`)_`);
    }
    out.push("");
  }

  out.push("---");
  out.push(`_Xuất ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC từ Supabase. ` +
    `Bản ĐỌC, không phải bản sao lưu._`);
  return out.join("\n");
}

// ── CSV ─────────────────────────────────────────────────────────────────────
const CSV_COT = [
  ["Mã tin", (l) => l.code], ["Hình thức", (l) => l.deal === "cho_thue" ? "Cho thuê" : "Bán"],
  ["Loại", (l) => LOAI[l.property_type] ?? l.property_type],
  ["Nguồn loại", (l) => NGUON[l.property_type_source] ?? l.property_type_source],
  ["Trạng thái", (l) => TRANG_THAI[l.status] ?? l.status],
  ["Phường", (l) => l.ward], ["Quận", (l) => l.district], ["Đường", (l) => l.street],
  ["Địa chỉ", (l) => l.location_raw],
  ["Giá rao", (l) => l.price_raw], ["Tỷ", (l) => l.price_vnd ? Number(l.price_vnd) / 1e9 : ""],
  ["DT m2", (l) => so(l.area_m2)], ["Tr/m2", (l) => l.price_per_m2_vnd ? Math.round(Number(l.price_per_m2_vnd) / 1e6) : ""],
  ["Ngang", (l) => so(l.frontage_m)], ["Dài", (l) => so(l.length_m)],
  ["Tầng", (l) => l.floors], ["Kết cấu", (l) => l.floors_text],
  ["PN", (l) => l.bedrooms], ["WC", (l) => l.bathrooms],
  ["Đường vào", (l) => VAO[l.access_type] ?? l.access_type], ["Hẻm m", (l) => so(l.alley_width_m)],
  ["Pháp lý", (l) => PHAP_LY[l.legal_status] ?? l.legal_status],
  ["Hoàn công", (l) => l.has_completion === true ? "x" : ""],
  ["Hướng", (l) => l.direction], ["Năm xây", (l) => l.year_built],
  ["Nguồn thông số", (l) => NGUON[l.specs_source] ?? l.specs_source],
  ["Số ảnh", (l) => l._so_anh], ["Ngày vào kho", (l) => String(l.created_at ?? "").slice(0, 10)],
  ["Thư mục", (l) => `tin/${anToan(l.code)}`],
];

function vietCsv(ds) {
  const o = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const dong = [CSV_COT.map(([t]) => o(t)).join(",")];
  for (const l of ds) dong.push(CSV_COT.map(([, f]) => o(f(l))).join(","));
  // BOM để Excel nhận UTF-8 — cùng lý do với nút xuất CSV ở /admin.
  return "\uFEFF" + dong.join("\r\n");
}

// ── Chạy ────────────────────────────────────────────────────────────────────
const soTay = {
  xuat_luc: new Date().toISOString(),
  nguon: URL_DU_AN,
  KHONG_PHAI_BAN_SAO_LUU: "Chỉ 3/31 bảng (listings, media, listing_facts). " +
    "Không dựng lại được DB từ thư mục này. Dự án không còn sao lưu DB (bỏ 11/09/2026).",
  chi_ban, co_chep_anh: !!goc_anh, so_tin: 0, so_anh_chep: 0, so_anh_thieu: 0,
  trang_thai: "chua_xong",
};
const ghiSoTay = async () => {
  try {
    await mkdir(dich, { recursive: true });
    await writeFile(join(dich, "manifest.json"), JSON.stringify(soTay, null, 2));
  } catch { /* hết đĩa / không quyền — đừng nuốt lỗi gốc bằng lỗi này */ }
};

try {
  console.log(`Xuất rổ hàng → ${dich}\n`);
  const loc = chi_ban ? "&deal=eq.ban" : "";
  const [listings, media, facts] = await Promise.all([
    keo("listings", "*", `${loc}&order=ward.asc,price_vnd.desc`),
    keo("media", "listing_id,storage_path,category,approved"),
    keo("listing_facts", "listing_id,question,answer,source"),
  ]);

  const anhTheoTin = new Map();
  for (const m of media) {
    if (!anhTheoTin.has(m.listing_id)) anhTheoTin.set(m.listing_id, []);
    anhTheoTin.get(m.listing_id).push(m);
  }
  const factTheoTin = new Map();
  for (const f of facts) {
    if (!factTheoTin.has(f.listing_id)) factTheoTin.set(f.listing_id, []);
    factTheoTin.get(f.listing_id).push(f);
  }

  await mkdir(join(dich, "tin"), { recursive: true });

  for (const l of listings) {
    const thuMuc = join(dich, "tin", anToan(l.code));
    await mkdir(thuMuc, { recursive: true });
    const anh = (anhTheoTin.get(l.id) ?? []).slice().sort((a, b) =>
      String(a.storage_path).localeCompare(String(b.storage_path), "vi", { numeric: true })
    );

    if (goc_anh && anh.length) {
      await mkdir(join(thuMuc, "anh"), { recursive: true });
      let i = 0;
      for (const a of anh) {
        i++;
        // `storage_path` là đường dẫn tương đối kiểu `masterDB/photos/1/1.jpg`.
        // `--anh` trỏ tới thư mục CHỨA masterDB, hoặc chính masterDB — thử cả hai.
        const ung = [
          resolve(goc_anh, a.storage_path),
          resolve(goc_anh, "..", a.storage_path),
          resolve(goc_anh, String(a.storage_path).replace(/^masterDB[\/\\]/, "")),
        ];
        const nguon = ung.find((p) => existsSync(p));
        const ten = `${String(i).padStart(2, "0")}${extname(a.storage_path) || ".jpg"}`;
        if (nguon) {
          await copyFile(nguon, join(thuMuc, "anh", ten));
          a.chep = true; a.ten = ten; soTay.so_anh_chep++;
        } else {
          a.chep = false; soTay.so_anh_thieu++;
        }
      }
    }

    await writeFile(
      join(thuMuc, "tin.md"),
      vietTinMd(l, anh, factTheoTin.get(l.id) ?? []),
    );
    l._so_anh = anh.length;
  }

  await writeFile(join(dich, "ro-hang.csv"), vietCsv(listings));

  // README ở gốc — thứ người mở thư mục nhìn thấy đầu tiên.
  const dem = (f) => listings.filter(f).length;
  await writeFile(join(dich, "README.md"), [
    `# Rổ hàng nhadat.cc — ${ngay}`,
    "",
    `**${listings.length} tin**${chi_ban ? " (chỉ tin BÁN)" : ""} · ` +
      `${media.length} ảnh${goc_anh ? ` (chép được ${soTay.so_anh_chep}, thiếu ${soTay.so_anh_thieu})` : " (chưa chép — chạy lại với `--anh`)"}`,
    "",
    "## Mở cái gì",
    "",
    "| File | Dùng để |",
    "|---|---|",
    "| `ro-hang.csv` | **Mở bằng Excel.** Lọc, sắp xếp, pivot cả rổ hàng |",
    "| `tin/<mã tin>/tin.md` | Xem một căn: thông số + mô tả gốc + ảnh |",
    "| `manifest.json` | Máy đọc — số tin, số ảnh, trạng thái lần xuất |",
    "",
    "## Xem nhanh",
    "",
    "| | Số tin |",
    "|---|---|",
    `| Đang bán / có khách quan tâm | ${dem((l) => ["dang_ban", "dang_quan_tam"].includes(l.status))} |`,
    `| Chưa lên web (thiếu thông tin) | ${dem((l) => l.status === "cho_thong_tin")} |`,
    `| Đã chốt | ${dem((l) => l.status === "da_chot")} |`,
    `| **Loại BĐS do máy đoán, chưa ai xác nhận** | **${dem((l) => l.property_type_source === "suy_doan")}** |`,
    `| Chưa có số phòng ngủ | ${dem((l) => l.bedrooms == null)} |`,
    `| Chưa có pháp lý | ${dem((l) => !l.legal_status)} |`,
    "",
    "Mở `ro-hang.csv`, sắp theo cột **Nguồn loại** rồi soi những dòng ghi",
    '"máy đoán" — đó là chỗ số liệu đáng ngờ nhất.',
    "",
    "## ĐÂY KHÔNG PHẢI BẢN SAO LƯU",
    "",
    "Thư mục này chỉ có **3/31 bảng**. Không có hội thoại, tin nhắn, sổ",
    "idempotency, giao dịch, hồ sơ khách. Markdown không giữ UUID/khoá ngoại,",
    "nên **đọc lại được nhưng dựng lại DB thì không**.",
    "",
    "Dự án không còn sao lưu DB (bỏ 11/09/2026) — thư mục này không thay được bản sao.",
    "",
    "## Riêng tư",
    "",
    "`tin.md` chứa **mô tả nguyên văn (có thể có số điện thoại)** và **địa chỉ",
    "nhà dân**. Để lên OneDrive/Google Drive công ty thì đặt ở thư mục **hạn chế",
    'quyền**, không phải "Shared with everyone".',
  ].join("\n"));

  soTay.so_tin = listings.length;
  soTay.trang_thai = "day_du";
  await ghiSoTay();

  console.log(`  ${listings.length} tin → tin/<mã>/tin.md`);
  console.log(`  ${listings.length} dòng → ro-hang.csv`);
  if (goc_anh) console.log(`  ảnh: chép ${soTay.so_anh_chep}, không tìm thấy ${soTay.so_anh_thieu}`);
  else console.log(`  ảnh: ${media.length} đường dẫn được liệt kê, CHƯA chép (thêm --anh "<đường dẫn masterDB>")`);
  console.log(`\n\x1b[32mXONG\x1b[0m — mở ${join(dich, "README.md")}`);
  console.log("Nhắc: đây KHÔNG phải bản sao lưu.");
} catch (e) {
  soTay.trang_thai = "hong";
  soTay.loi = String(e?.message ?? e);
  await ghiSoTay();
  chet(`Xuất HỎNG: ${e?.message ?? e}\n  manifest.json đã ghi trạng thái "hong" để lần sau biết.`);
}
