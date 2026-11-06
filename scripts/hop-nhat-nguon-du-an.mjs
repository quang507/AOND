// hop-nhat-nguon-du-an.mjs — HỢP NHẤT DỮ LIỆU TỪ CÁC NGUỒN (Mogi, Rever, MOSO) THÀNH 1 CHUẨN AOND DUY NHẤT.
//
// LUẬT (SRS-5.1zzzzzzz396, SSOT):
// - Gộp toàn bộ thuộc tính từ `specs.moso`, `specs.rever`, `specs.gia_dong` vào các cột chuẩn và `thong_tin.thuoc_tinh`.
// - Làm sạch `specs`: xoá các object con `moso`, `rever`, chỉ giữ lại các trường kỹ thuật phẳng (tong_so_can, don_gia_tb_m2, tong_dien_tich...).
// - Tiện ích: khử trùng, gộp `amenities` + `rever.tien_ich` + `moso.amenities`.
// - Xoá nhãn nguồn phân biệt: đặt `source = 'aond'`, xoá link ngoài `source_url = null`.
//
// Chạy:
//   node scripts/hop-nhat-nguon-du-an.mjs --dry              # xem trước, không ghi DB
//   node scripts/hop-nhat-nguon-du-an.mjs                    # ghi DB Supabase
//
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DRY = args.includes("--dry");

const envPath = existsSync(join(HERE, ".env"))
  ? join(HERE, ".env")
  : existsSync(join(HERE, "..", "aond_core", ".env"))
  ? join(HERE, "..", "aond_core", ".env")
  : existsSync("C:/aond/aond_core/.env")
  ? "C:/aond/aond_core/.env"
  : null;

const env = envPath ? Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
) : {};

const URL_DB = env.SUPABASE_URL ?? (process.env.PROJECT_REF ? `https://${process.env.PROJECT_REF}.supabase.co` : "https://rqxmmqmctpklqcmbfxuj.supabase.co");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.TOKEN;

const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

const trong = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

const lamTronGia = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

export function hopNhatRow(p) {
  const specs = (p.specs && typeof p.specs === "object") ? { ...p.specs } : {};
  const moso = (specs.moso && typeof specs.moso === "object") ? specs.moso : {};
  const rever = (specs.rever && typeof specs.rever === "object") ? specs.rever : {};
  const duKien = (rever.du_kien && typeof rever.du_kien === "object") ? rever.du_kien : {};

  // 1. Điền ô trống cấp cột
  const vao = {};

  if (trong(p.developer)) {
    const dev = moso.developer || rever.chu_dau_tu || null;
    if (dev) vao.developer = dev;
  }
  if (trong(p.status_text)) {
    const st = moso.status_text || rever.trang_thai || null;
    if (st) vao.status_text = st;
  }
  const pMin = lamTronGia(p.price_min ?? moso.price_min);
  const pMax = lamTronGia(p.price_max ?? moso.price_max);
  if (pMin !== null && p.price_min !== pMin) vao.price_min = pMin;
  if (pMax !== null && p.price_max !== pMax) vao.price_max = pMax;

  // 2. Tiện ích gộp khử trùng
  const amSet = new Set(Array.isArray(p.amenities) ? p.amenities : []);
  if (Array.isArray(rever.tien_ich)) rever.tien_ich.forEach((x) => x && amSet.add(String(x).trim()));
  if (Array.isArray(moso.amenities)) moso.amenities.forEach((x) => x && amSet.add(String(x).trim()));
  const amenitiesMoi = Array.from(amSet).filter(Boolean);
  if (amenitiesMoi.length !== (p.amenities?.length || 0)) {
    vao.amenities = amenitiesMoi;
  }

  // 3. Thông tin (thuoc_tinh & tien_ich)
  const tt = (p.thong_tin && typeof p.thong_tin === "object") ? { ...p.thong_tin } : {};
  const thuocTinh = { ...(tt.thuoc_tinh ?? {}) };

  if (moso.bank_support || thuocTinh["Hỗ trợ vay ngân hàng"]) {
    thuocTinh["Hỗ trợ vay ngân hàng"] = `Tối đa ${moso.max_loan_ratio || 70}%`;
    thuocTinh["Vốn tự có tối thiểu"] = "30%";
  }
  const soCan = moso.number_of_units || duKien["số căn"];
  if (soCan && !thuocTinh["Tổng số căn"]) thuocTinh["Tổng số căn"] = String(soCan);
  if (duKien["số block"] && !thuocTinh["Số block"]) thuocTinh["Số block"] = String(duKien["số block"]);
  if (duKien["số tầng"] && !thuocTinh["Số tầng"]) thuocTinh["Số tầng"] = String(duKien["số tầng"]);
  if (duKien["mật độ xây dựng"] && !thuocTinh["Mật độ xây dựng"]) thuocTinh["Mật độ xây dựng"] = `${duKien["mật độ xây dựng"]}%`;
  if (duKien["diện tích căn"] && !thuocTinh["Diện tích căn"]) thuocTinh["Diện tích căn"] = String(duKien["diện tích căn"]);
  if (duKien["giao nhà"] && !thuocTinh["Thời gian bàn giao"]) thuocTinh["Thời gian bàn giao"] = String(duKien["giao nhà"]);

  const avgM2 = moso.average_price_m2;
  if (avgM2 && !thuocTinh["Đơn giá trung bình"]) {
    thuocTinh["Đơn giá trung bình"] = `${Math.round(avgM2 / 1e6)} triệu/m²`;
  } else if (rever.khoang_gia && !thuocTinh["Đơn giá tham khảo"]) {
    thuocTinh["Đơn giá tham khảo"] = String(rever.khoang_gia);
  }

  const grb = rever.gia_rao_ban;
  if (grb?.tr_m2_thap && grb?.tr_m2_cao && !thuocTinh["Giá rao bán thị trường"]) {
    thuocTinh["Giá rao bán thị trường"] = `${grb.tr_m2_thap}–${grb.tr_m2_cao} triệu/m²`;
  }
  const grt = rever.gia_rao_thue;
  if (grt?.tr_thang_thap && grt?.tr_thang_cao && !thuocTinh["Giá rao thuê thị trường"]) {
    thuocTinh["Giá rao thuê thị trường"] = `${grt.tr_thang_thap}–${grt.tr_thang_cao} triệu/tháng`;
  }

  tt.thuoc_tinh = thuocTinh;
  tt.tien_ich = amenitiesMoi;
  vao.thong_tin = tt;

  // 4. Specs phẳng (loại bỏ moso & rever, giữ thông số kỹ thuật thuần)
  const newSpecs = {};
  for (const [k, v] of Object.entries(specs)) {
    if (k !== "moso" && k !== "rever") {
      newSpecs[k] = v;
    }
  }
  if (avgM2) newSpecs.don_gia_tb_m2 = avgM2;
  if (soCan) newSpecs.tong_so_can = soCan;
  if (duKien["tổng diện tích"] && !newSpecs.tong_dien_tich) newSpecs.tong_dien_tich = duKien["tổng diện tích"];
  vao.specs = newSpecs;

  // 5. Thống nhất một nguồn chung AOND & Xoá link ngoài
  vao.source = "aond";
  vao.source_url = null;

  return vao;
}

async function docProjects(offset = 0) {
  const r = await fetch(
    `${URL_DB}/rest/v1/projects?select=id,name,developer,district,ward,province,status_text,price_min,price_max,amenities,specs,thong_tin,source,source_url&order=id&limit=500&offset=${offset}`,
    { headers: H() }
  );
  if (!r.ok) throw new Error(`Đọc projects offset ${offset}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function capNhatProject(id, vao) {
  const r = await fetch(`${URL_DB}/rest/v1/projects?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...H(), Prefer: "return=minimal" },
    body: JSON.stringify(vao),
  });
  if (!r.ok) throw new Error(`Cập nhật project ${id}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

async function main() {
  console.log(`=== HỢP NHẤT DỮ LIỆU DỰ ÁN THÀNH 1 CHUẨN AOND DUY NHẤT ===`);
  console.log(`Kết nối Supabase: ${URL_DB}`);
  if (DRY) console.log(`[CHẾ ĐỘ DRY-RUN] Không ghi DB.`);

  let offset = 0;
  let tong = 0;
  let daGop = 0;

  while (true) {
    const rows = await docProjects(offset);
    if (!rows || !rows.length) break;
    tong += rows.length;

    const batchSize = 25;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      await Promise.all(slice.map(async (r) => {
        const vao = hopNhatRow(r);
        if (!DRY) {
          await capNhatProject(r.id, vao);
        }
      }));
      daGop += slice.length;
      if (daGop % 100 === 0 || daGop === tong) {
        console.log(`Đã xử lý ${daGop} dự án...`);
      }
    }

    if (rows.length < 500) break;
    offset += 500;
  }

  console.log(`\nHOÀN THÀNH: Đã hợp nhất ${daGop} dự án về chuẩn dữ liệu AOND duy nhất.`);
  console.log(`- Mọi nhánh specs.moso và specs.rever đã được gộp phẳng vào thong_tin và specs.`);
  console.log(`- Cột source được thống nhất thành 'aond', source_url đã xóa về null.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error("LỖI:", e.message);
    process.exit(1);
  });
}
