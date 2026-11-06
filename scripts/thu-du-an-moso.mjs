// thu-du-an-moso.mjs — LÀM GIÀU kho dự án từ dữ liệu moso.vn (TP.HCM).
//
// LUẬT (SRS-5.1zzzzzzz249, SSOT):
// - projects là kho chung SSOT. Tuyệt đối KHÔNG xoá, không đổi UUID `id` làm mồ côi foreign key của listings.
// - GHÉP, KHÔNG ĐÈ: dự án đã có trong kho (khớp tên bỏ dấu + quận/tỉnh) -> bổ sung `specs.moso`, điền ô còn trống
//   (developer, status_text, price_min, price_max, unit_types, thong_tin).
// - Dự án mới chưa có trong kho -> thêm dòng mới `source = 'moso'`, priority = 70.
//
// Chạy:
//   node scripts/thu-du-an-moso.mjs --dry              # kiểm tra ghép + in thống kê, không ghi DB
//   node scripts/thu-du-an-moso.mjs                    # ghi DB (cần scripts/.env hoặc TOKEN/PROJECT_REF)
//
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const co = (t) => args.includes(t);
const lay = (t, m) => { const i = args.indexOf(t); return i >= 0 ? args[i + 1] : m; };
const DRY = co("--dry");
const GIOI_HAN = Number(lay("--gioi-han", "0"));

const env = existsSync(join(HERE, ".env")) ? Object.fromEntries(
  readFileSync(join(HERE, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
) : {};

const URL_DB = env.SUPABASE_URL ?? (process.env.PROJECT_REF ? `https://${process.env.PROJECT_REF}.supabase.co` : "https://rqxmmqmctpklqcmbfxuj.supabase.co");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.TOKEN;

export const boDau = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();

export const khoaTen = (s) => boDau(String(s ?? "").replace(/\([^)]*\)/g, " "))
  .replace(/\b(du an|khu can ho|can ho|chung cu|khu do thi|khu dan cu|to hop|khu phuc hop)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();

const soQuan = (s) => boDau(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const boHanhChinh = (s) => soQuan(String(s ?? "").replace(/\([^)]*\)/g, " ")).replace(/^(huyen|quan|thanh pho|tp|thi xa|tinh)\s+/, "");

export function cacKhoa(ten, quan, tinh) {
  const goc = [ten, String(ten ?? "").split(/\s+[-–|]\s+/)[0]];
  const duoi = [boHanhChinh(quan), boHanhChinh(tinh), "sai gon", "thu duc", "tp hcm", "tphcm"].filter(Boolean);
  const ra = new Set();
  for (const g of goc) {
    let k = khoaTen(g);
    if (!k) continue;
    ra.add(k);
    for (let doi = true; doi;) {
      doi = false;
      for (const d of duoi) {
        if (k.endsWith(` ${d}`) && k.length > d.length + 3) {
          k = k.slice(0, -d.length - 1).trim();
          ra.add(k);
          doi = true;
        }
      }
    }
  }
  return ra;
}

export function chonDong(M, kho) {
  const k = cacKhoa(M.name, M.district, M.province);
  if (!k.size) return null;
  let ung = kho.filter((p) => {
    const pk = (p._khoa ??= cacKhoa(p.name, p.district, p.province));
    for (const x of pk) if (k.has(x)) return true;
    return false;
  });
  if (ung.length <= 1) return ung.length ? { row: ung[0] } : null;
  const q = soQuan(M.district);
  const cungQuan = q ? ung.filter((p) => ` ${soQuan(p.district)} `.includes(` ${q} `)) : [];
  if (cungQuan.length === 1) return { row: cungQuan[0] };
  return { mo_ho: ung.map((p) => `${p.name} · ${p.district ?? "?"} · ${p.id}`) };
}

const trong = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

const LOAI_HINH_VI = {
  apartment: "Căn hộ chung cư",
  townhouse: "Nhà phố liền kề",
  shophouse: "Nhà phố thương mại (Shophouse)",
  villa: "Biệt thự",
  penthouse: "Penthouse",
  duplex: "Duplex",
  land_plot: "Đất nền",
};

export function chuyenDoiUnitTypes(types) {
  if (!Array.isArray(types) || !types.length) return [];
  return types.map((t) => {
    const raw = String(t).toLowerCase().trim();
    return LOAI_HINH_VI[raw] || t;
  });
}

export function vaGhep(row, M) {
  const vao = {
    specs: { ...(row.specs ?? {}), moso: M },
  };
  if (trong(row.developer) && M.developer) vao.developer = M.developer;
  if (trong(row.status_text) && M.status_text) vao.status_text = M.status_text;
  if (trong(row.price_min) && M.price_min) vao.price_min = M.price_min;
  if (trong(row.price_max) && M.price_max) vao.price_max = M.price_max;
  if (trong(row.unit_types) && M.unit_types?.length) {
    vao.unit_types = chuyenDoiUnitTypes(M.unit_types);
  }
  const tt = row.thong_tin ? { ...row.thong_tin } : {};
  const thuocTinh = { ...(tt.thuoc_tinh ?? {}) };
  if (M.bank_support) {
    thuocTinh["Hỗ trợ vay ngân hàng"] = `Tối đa ${M.max_loan_ratio || 70}%`;
    thuocTinh["Vốn tự có tối thiểu"] = "30%";
  }
  tt.thuoc_tinh = thuocTinh;
  vao.thong_tin = tt;
  return vao;
}

const slugHoa = (s) => boDau(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export function dongMoi(M) {
  const tt = {
    thuoc_tinh: {
      "Hỗ trợ vay ngân hàng": `Tối đa ${M.max_loan_ratio || 70}%`,
      "Vốn tự có tối thiểu": "30%",
    },
    tien_ich: [],
  };
  return {
    name: M.name,
    slug: `${slugHoa(M.name)}-ms`,
    developer: M.developer || null,
    province: "Hồ Chí Minh",
    district: M.district || null,
    location_raw: M.location_raw || (M.district ? `${M.district}, TP.HCM` : "TP.HCM"),
    status_text: M.status_text || null,
    price_min: M.price_min || null,
    price_max: M.price_max || null,
    unit_types: chuyenDoiUnitTypes(M.unit_types),
    specs: { moso: M },
    thong_tin: tt,
    source: "moso",
    source_url: M.url || null,
    priority: 70,
  };
}

// ── DB Helpers ─────────────────────────────────────────────────────────────
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

async function docKho() {
  const ra = [];
  for (let tu = 0; ; tu += 1000) {
    const r = await fetch(`${URL_DB}/rest/v1/projects?select=id,name,slug,province,district,ward,developer,status_text,price_min,price_max,unit_types,specs,thong_tin&order=id&limit=1000&offset=${tu}`, { headers: H() });
    if (!r.ok) throw new Error(`đọc projects: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const t = await r.json();
    ra.push(...t);
    if (t.length < 1000) return ra;
  }
}

async function sua(id, vao) {
  const r = await fetch(`${URL_DB}/rest/v1/projects?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...H(), Prefer: "return=minimal" },
    body: JSON.stringify(vao),
  });
  if (!r.ok) throw new Error(`sửa ${id}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

async function them(rows) {
  const r = await fetch(`${URL_DB}/rest/v1/projects?on_conflict=slug`, {
    method: "POST",
    headers: { ...H(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`thêm projects: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

// ── Main ───────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const tepDuAn = join(HERE, "moso_projects_hcm.json");
  if (!existsSync(tepDuAn)) {
    console.error(`Không tìm thấy ${tepDuAn}. Vui lòng chạy crawl_moso_projects.py trước.`);
    process.exit(1);
  }
  let dsMoso = JSON.parse(readFileSync(tepDuAn, "utf8"));
  if (GIOI_HAN && GIOI_HAN > 0) dsMoso = dsMoso.slice(0, GIOI_HAN);
  console.log(`Đã đọc ${dsMoso.length} dự án từ moso_projects_hcm.json`);

  if (DRY || !KEY) {
    console.log("== CHẾ ĐỘ DRY RUN (không ghi DB) ==");
    console.log(`Kiểm tra mẫu: ${dsMoso.slice(0, 2).map((x) => x.name).join(", ")}`);
    const mauRow = { id: "test-id", name: "Arcadia At Lavila", district: "Nhà Bè", province: "Hồ Chí Minh" };
    const ghepThu = vaGhep(mauRow, dsMoso[0]);
    console.log("Mẫu vá ghép:", JSON.stringify(ghepThu, null, 2));
    const moiThu = dongMoi(dsMoso[0]);
    console.log("Mẫu dòng mới:", JSON.stringify(moiThu, null, 2));
    console.log("Hoàn thành dry-run.");
  } else {
    console.log(`Kết nối Supabase: ${URL_DB}...`);
    const kho = await docKho();
    console.log(`Kho hiện có: ${kho.length} dự án.`);

    let ghep = 0;
    const moi = [], moHo = [];
    for (const M of dsMoso) {
      const c = chonDong(M, kho);
      if (c?.row) {
        await sua(c.row.id, vaGhep(c.row, M));
        ghep++;
      } else if (c?.mo_ho) {
        moHo.push(`${M.name} (${M.district}) ↔ ${c.mo_ho.join(" | ")}`);
      } else {
        moi.push(dongMoi(M));
      }
    }

    const daCo = new Set();
    const moiSach = moi.filter((r) => !daCo.has(r.slug) && daCo.add(r.slug));
    for (let i = 0; i < moiSach.length; i += 100) {
      await them(moiSach.slice(i, i + 100));
    }

    console.log(`Ghép bổ sung dự án có sẵn: ${ghep} · Thêm mới: ${moiSach.length} · Mơ hồ bỏ qua: ${moHo.length}`);
    if (moHo.length) {
      console.log("Một số dự án mơ hồ bỏ qua (tránh gán nhầm):");
      for (const x of moHo.slice(0, 10)) console.log(`  ? ${x}`);
    }
  }
}
