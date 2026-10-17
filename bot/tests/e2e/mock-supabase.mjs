// Supabase giả trong bộ nhớ: đủ để chat-reply chạy trọn đường, ghi lại mọi truy vấn.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { soChuThanhSo } from "../../supabase/functions/_shared/extraction/luat-tien.ts";

// 30/09/2026: bảng `wards` giả = 168 dòng THẬT của migration 20260915a (bảng thật trên DB nạp từ đúng file đó).
// Mặc định FakeDB vẫn để `wards` rỗng (nhiều ca e2e cố ý dựng bảng riêng vài dòng); ca cần bảng thật và `bun run chat`
// gọi `napPhuongThat()` để nạp.
let phuongThat = null;
export function napPhuongThat() {
  if (phuongThat) return phuongThat;
  const sql = readFileSync(new URL("../../supabase/migrations/20260915a_wards_phuong_moi.sql", import.meta.url), "utf8");
  phuongThat = [...sql.matchAll(/^\s*\('((?:[^']|'')+)',\s*'(phuong|xa|dac_khu)',\s*'((?:[^']|'')+)',\s*'((?:[^']|'')+)',[^\n]*?'(TP\.HCM|Bình Dương|Bà Rịa – Vũng Tàu)',\s*(?:'((?:[^']|'')*)'|null)/gm)]
    .map((m) => ({
      ten: m[1].replace(/''/g, "'"), loai: m[2], ten_day_du: m[3].replace(/''/g, "'"), quan_cu: m[4].replace(/''/g, "'"),
      tinh_cu: m[5], don_vi_cu: m[6] != null ? m[6].replace(/''/g, "'") : null,
    }));
  return phuongThat;
}
// 20260930a: bảng `phuong_cu` giả = đúng dữ liệu migration sinh ra (tách wards.don_vi_cu bằng scripts/lib/don-vi-cu.mjs).
// 20261009d (OPEN-60): + phường SỐ cũ gộp trước 07/2025 (NQ 1111/2020, NQ 1278/2024), đọc thẳng khối VALUES của migration — cùng
// điều kiện "dòng trung gian có thật" như câu insert. ds-phuong.ts sinh từ hàm này (`bun scripts/sinh-ds-phuong.mjs`).
export async function napPhuongCuThat() {
  const { tachDonViCu, tachPhuongCuTruoc2025 } = await import("../../../scripts/lib/don-vi-cu.mjs");
  const goc = napPhuongThat().flatMap((w) => tachDonViCu(w.don_vi_cu).map((c) => ({ ten: c.ten, quan_cu: c.quan_cu, phuong_moi: w.ten, toan_bo: c.toan_bo })));
  const sql = readFileSync(new URL("../../supabase/migrations/20261009d_phuong_cu_truoc_2025.sql", import.meta.url), "utf8");
  const them = tachPhuongCuTruoc2025(sql, goc).map(({ ten, quan_cu, phuong_moi, toan_bo, nguon }) => ({ ten, quan_cu, phuong_moi, toan_bo, nguon }));
  return [...goc, ...them];
}

const singular = (t) => t.replace(/s$/, "");
// Bản JS của `chuan_hoa_phuong` từ 20261009b (SRS-5.1zzzzj): KHÔNG chuẩn hoá nữa — đúng một tên đầy đủ có trong bảng `wards` THẬT
// (168 dòng của migration 20260915a, bất kể ca e2e dựng `db.t.wards` riêng) thì giữ, còn lại null. Code (tenPhuongCot) là chỗ duy nhất
// chuẩn hoá; tới được đây mà chữ lạ là lỗi code — mock ghi `bot_errors` y như trigger thật, và bộ e2e coi mỗi dòng như vậy là ĐỎ.
let tenWardThat = null;
const laTenWard = (v) => { tenWardThat ??= new Set(napPhuongThat().map((w) => w.ten_day_du)); return tenWardThat.has(String(v ?? "").trim()); };
function chuanHoaPhuong(t) {
  const v = String(t ?? "").trim();
  return v && laTenWard(v) ? v : null;
}
// Mốc thời gian phải DUY NHẤT, như Postgres. `toISOString()` chỉ có mili giây,
// mà ba câu hỏi chờ mở liên tiếp rơi trọn trong một mili giây là chuyện thường —
// khi đó `order("created_at", { ascending: false })` HOÀ, `Array.sort` ổn định
// giữ nguyên thứ tự chèn, nên `ds[0]` hoá ra câu CŨ NHẤT trong nhóm hoà thay vì
// mới nhất: chat-reply bốc nhầm câu đang treo và ca G5 đỏ chừng 1/6 lượt chạy.
// Postgres lưu timestamp tới micro giây nên hoà gần như không xảy ra; mock phải
// giống chỗ đó, không thì bộ e2e đo một hành vi khác bản thật. (Bắt 08/09/2026.)
let mocNhoNhat = 0;
const now = () => {
  const t = Math.max(Date.now(), mocNhoNhat + 1);
  mocNhoNhat = t;
  return new Date(t).toISOString();
};

export class FakeDB {
  constructor() {
    this.t = {};
    for (const n of ["sellers","buyers","conversations","messages","listings","listing_facts","info_requests",
      "reminders","viewings","deals","inbound_ledger","bot_prompts","projects","listing_photos_v","bot_errors","bot_usage","ledger_log",
      "ctvs","admins","interests","ratings","inbound_events","listing_media","app_config",
      "du_an_can","du_an_tai_lieu","van_kich","ai_ghi_thu"]) this.t[n] = []; // SRS-5.1zzj: kho căn dự án + tài liệu; SRS-5.1zzn: sổ van
    this.seq = 0; this.log = [];
    // FR-185: kho file giả — chat-reply cất ảnh chủ nhà gửi vào Storage.
    this.storage = [];
  }
  rows(n) {
    if (n === "listing_missing_facts") return this.missingFacts();
    return this.t[n] ?? (this.t[n] = []);
  }
  // FR-144/FR-140: view thiếu-thông-tin — chỉ tin còn cho_thong_tin
  // FR-177 (20260907h): nhóm co_ban (1–9) → chuyen_mon (10–19) → phu (20+),
  // đúng chuỗi nhà phố của required_facts thật. "Đã có" đọc từ cột như view.
  missingFacts() {
    // FR-186 (20260909h): chuỗi theo LOẠI BĐS và loại giao dịch — chép đúng seed
    // `required_facts` thật (deal null = mọi giao dịch, "cho_thue" = chỉ tin thuê).
    // Nhóm `phu` KHÔNG có ở đây: view thật lọc (20260908a). Hướng HỎI với chung cư /
    // đất (chuyen_mon), không hỏi với nhà phố / biệt thự (phu) — mock phải y vậy.
    const CB = (k, p, deal = null) => [k, p, "co_ban", deal];
    // 20260909i: nhóm sau_dang — hỏi bù SAU khi lên kệ; chat-reply không đợi nhóm này trước bản nháp.
    const SD = (k, p, deal = null) => [k, p, "sau_dang", deal];
    // 20261013b: so_phong_ngu lên co_ban 18 (nhà phố / cấp 4 / biệt thự).
    // 20261014c: truot_gia (cho thuê, sau_dang) cho căn hộ / cấp 4 / biệt thự như nhà phố.
    // 20261013a: hien_trang_su_dung lên co_ban 17 (nhà phố / cấp 4 / căn hộ / biệt thự) — hỏi trước bản nháp.
    const SAU_NHA = [SD("so_wc", 30), SD("cach_mat_tien", 31), SD("hem_thong", 32), SD("ngap_nuoc", 33), SD("the_chap", 35, "cho_thue"), SD("tien_ich_gan", 36), SD("ly_do_ban", 37), SD("thuong_luong", 38)];
    // 20260925i (FR-229): tin BÁN hỏi pháp lý trước bản nháp — sổ 16 → đứng tên 17 → thế chấp 18 → quy hoạch 19 → tranh chấp 20
    // → diện tích khớp sổ 21; phường / gấp / ảnh dời ra 22 / 23 / 24.
    // 20260927c (FR-232, chủ dự án "hỏi hơi nhiều"): năm câu đó sang nhóm sau_dang — trước bản nháp chỉ còn câu sổ (gộp đứng tên
    // + thế chấp), còn lại hỏi bù sau khi lên tin.
    const PL = (quyHoach, khopSo) => [SD("nguoi_dung_ten", 17, "ban"), SD("the_chap", 18, "ban"), ...(quyHoach ? [SD("quy_hoach", 19, "ban")] : []),
      SD("tranh_chap", 20, "ban"), ...(khopSo ? [SD("dien_tich_khop_so", 21, "ban")] : [])];
    // 20260924c (FR-219): MỌI câu trước bản nháp chung nhóm co_ban, thứ tự "chủ nhà dễ trả lời trước": vật lý (2–11) →
    // tiền (12–15) → pháp lý 16–21 → phường 22 → gấp 23 → ảnh 24 — chép đúng bảng required_facts thật.
    // 20261007a (SRS-5.1zzz): ≤ 6 câu trước bản nháp theo cách môi giới hỏi; gấp / phòng ngủ nhà / ảnh / hướng… sang sau_dang;
    // câu sổ nhà / căn hộ chỉ tin bán.
    const REQ = {
      toa_nha: [CB("vi_tri", 2), CB("dien_tich_dat", 3), CB("ket_cau", 4), CB("doanh_thu", 5), CB("gia", 12), CB("phap_ly", 16), CB("phuong", 22), ...PL(true, true), SD("tang_phu", 30), SD("so_phong", 40), SD("thang_may", 41), SD("do_rong_hem", 42), SD("gap", 43), SD("hinh_anh", 45), SD("ty_le_lap_day", 47), SD("pccc", 48)],
      dat_nong_nghiep: [CB("vi_tri", 2), CB("dien_tich", 3), CB("gia", 4), CB("duong_vao", 5), CB("quy_hoach", 14), CB("phap_ly", 16), CB("phuong", 22), ...PL(false, false), SD("nguon_nuoc", 40), SD("ranh_gioi", 41), SD("len_tho_cu", 42), SD("gap", 43), SD("hinh_anh", 45)],
      dat_kinh_doanh: [CB("vi_tri", 2), CB("dien_tich", 3), CB("gia", 4), CB("muc_dich", 5), CB("thoi_han_su_dung", 15), CB("phap_ly", 16), CB("phuong", 22), ...PL(true, false), SD("do_rong_duong", 40), SD("hinh_thuc_thue_dat", 41), SD("gap", 43), SD("hinh_anh", 45)],
      kho_xuong: [CB("vi_tri", 2), CB("dien_tich", 3), CB("duong_container", 4), CB("gia", 12), CB("tien_coc", 13, "cho_thue"), CB("phap_ly", 16), CB("phuong", 22), ...PL(true, true), SD("chieu_cao", 40), SD("tai_trong_san", 41), SD("tram_bien_ap", 42), SD("gap", 43), SD("hinh_anh", 45), SD("thoi_han_thue", 46, "cho_thue"), SD("xu_ly_nuoc_thai", 47), SD("thoi_han_su_dung", 48)],
      chua_ro: [CB("loai_bds", 1), CB("vi_tri", 2), CB("gia", 12), CB("phuong", 22)],
      nha_pho: [CB("vi_tri", 2), CB("dien_tich_dat", 3), CB("ket_cau", 4), CB("do_rong_hem", 5), CB("so_phong_ngu", 18), CB("gia", 12), CB("tien_coc", 13, "cho_thue"), CB("phap_ly", 16, "ban"), CB("hien_trang_su_dung", 17), CB("phuong", 22), ...PL(true, true), ...SAU_NHA, SD("tang_phu", 30), SD("tiem_nang", 39), SD("noi_that", 40, "cho_thue"), SD("thoi_han_thue", 41, "cho_thue"), SD("truot_gia", 42, "cho_thue"), SD("gap", 43), SD("hinh_anh", 45)],
      nha_cap4: [CB("vi_tri", 2), CB("dien_tich_dat", 3), CB("do_rong_hem", 4), CB("hien_trang", 5), CB("so_phong_ngu", 18), CB("gia", 12), CB("tien_coc", 13, "cho_thue"), CB("phap_ly", 16, "ban"), CB("hien_trang_su_dung", 17), CB("phuong", 22), ...PL(true, true), SD("tang_phu", 30), SD("tiem_nang", 39), SD("noi_that", 40, "cho_thue"), SD("thoi_han_thue", 41, "cho_thue"), SD("truot_gia", 42, "cho_thue"), SD("gap", 43), SD("hinh_anh", 45)],
      chung_cu: [CB("du_an_ten", 2), CB("vi_tri", 2), CB("dien_tich_tim_tuong", 3), CB("so_phong_ngu", 4), CB("tang", 5), CB("gia", 12), CB("tien_coc", 13, "cho_thue"), CB("phap_ly", 16, "ban"), CB("hien_trang_su_dung", 17), CB("phuong", 22), ...PL(false, false), SD("huong", 40), SD("noi_that", 41), SD("phi_quan_ly", 42), SD("gap", 43), SD("hinh_anh", 45), SD("thoi_han_thue", 46, "cho_thue"), SD("truot_gia", 47, "cho_thue")],
      dat: [CB("vi_tri", 2), CB("dien_tich", 3), CB("gia", 4), CB("do_rong_duong", 5), CB("tho_cu", 6), CB("phap_ly", 16), CB("phuong", 22), ...PL(true, false), SD("huong", 40), SD("ha_tang", 41), SD("xay_dung", 42), SD("gap", 43), SD("hinh_anh", 45)],
      biet_thu: [CB("vi_tri", 2), CB("dien_tich_dat", 3), CB("ket_cau", 4), CB("do_rong_hem", 5), CB("so_phong_ngu", 18), CB("gia", 12), CB("tien_coc", 13, "cho_thue"), CB("phap_ly", 16, "ban"), CB("hien_trang_su_dung", 17), CB("phuong", 22), ...PL(true, true), SD("tang_phu", 30), SD("san_vuon", 40), SD("noi_that", 41, "cho_thue"), SD("khu_compound", 42), SD("gap", 43), SD("hinh_anh", 45), SD("thoi_han_thue", 46, "cho_thue"), SD("truot_gia", 47, "cho_thue")],
      phong_tro: [CB("vi_tri", 2), CB("dien_tich", 3), CB("noi_that", 4), CB("gia", 12), CB("tien_coc", 14), CB("phuong", 22), SD("gio_giac", 40), SD("gia_dien_nuoc", 41), SD("gap", 43), SD("hinh_anh", 45)],
      mat_bang: [CB("vi_tri", 2), CB("dien_tich", 3), CB("mat_tien", 4), CB("gia", 12), CB("tien_coc", 13), CB("phuong", 22), SD("nganh_hang_phu_hop", 40), SD("thoi_han_thue", 41), SD("truot_gia", 42), SD("gap", 43), SD("hinh_anh", 45)],
    };
    const out = [];
    for (const l of this.t.listings) {
      // 20260909a: view thật không lọc status — tin dang_ban vẫn có câu còn thiếu
      // để cron hỏi bù. Mock lọc là mock nói dối đúng chỗ tính năng này đo.
      const have = new Set(this.t.listing_facts.filter((f) => f.listing_id === l.id).map((f) => f.question));
      if (l.location_raw || l.street || l.project_id) have.add("vi_tri"); // 20260909m
      if (l.project_id) have.add("du_an_ten"); // 20261014b: căn hộ đã gắn dự án = có tên chung cư
      if (l.price_raw) have.add("gia"); if (l.gap != null) have.add("gap"); if (l.area_m2) { have.add("dien_tich"); have.add("dien_tich_dat"); have.add("dien_tich_tim_tuong"); } if (l.ward) have.add("phuong");
      if (l.property_type && l.property_type !== "chua_ro") have.add("loai_bds"); if (l.bedrooms) have.add("so_phong_ngu");
      // 20260925e: loại đường vào đã rõ (hẻm xe hơi / xe máy / mặt tiền) = câu hẻm đã có câu trả lời.
      if (l.alley_width_m || l.access_type) { have.add("do_rong_hem"); have.add("do_rong_duong"); } if (l.floors) have.add("ket_cau"); if (/lửng|sân thượng|hầm|áp mái/.test(l.floors_text ?? "")) have.add("tang_phu");
      if (l.legal_status) have.add("phap_ly"); if (l.direction) have.add("huong"); if (l.floor) have.add("tang");
      // 20261014e: căn hộ thuộc dự án mà dự án có pháp lý (legal_status / specs phap_ly / so_huu) → không hỏi pháp lý.
      if (l.property_type === "chung_cu" && duAnCoPhapLyMock(this.t, l.project_id)) have.add("phap_ly");
      if (l.planning_status) have.add("quy_hoach"); if (l.year_built) have.add("nam_xay"); if (l.furnishing) have.add("noi_that"); if (l.frontage_m) have.add("mat_tien");
      // Ảnh trong kho (listing_media) = đã có ảnh, như view thật (FR-185).
      if (this.t.listing_media.some((m) => m.listing_id === l.id)) have.add("hinh_anh");
      const loai = REQ[l.property_type ?? "chua_ro"] ? (l.property_type ?? "chua_ro") : "chua_ro";
      for (const [k, priority, nhom, deal] of REQ[loai]) {
        if (deal && deal !== (l.deal ?? "ban")) continue;
        if (!have.has(k)) out.push({ listing_id: l.id, fact_key: k, priority, nhom });
      }
    }
    return out;
  }
  // FR-177 d — bản JS của `diem_tin` (20260907h), cùng 7 tiêu chí, cùng điểm.
  diemTin(l) {
    const f = {};
    for (const x of this.t.listing_facts.filter((x) => x.listing_id === l.id)) f[x.question] = x.answer;
    const has = (k) => Object.prototype.hasOwnProperty.call(f, k);
    const thieu = [];
    const coHem = l.alley_width_m != null || !!l.access_type || has("do_rong_hem") || has("do_rong_duong") || ["chung_cu", "phong_tro"].includes(l.property_type);
    const viTri = (l.location_raw ? 7 : 0) + (l.ward ? 4 : 0) + (coHem ? 4 : 0);
    if (!coHem) thieu.push("hẻm rộng mấy mét, xe hơi vào được không");
    const coMt = l.frontage_m != null || has("mat_tien") || ["chung_cu", "phong_tro"].includes(l.property_type) || /\d\s*[xX×]\s*\d/.test(f.dien_tich_dat ?? f.dien_tich ?? "");
    let dt = 0;
    if (l.area_m2 != null) { dt = 12 + (coMt ? 8 : 0); if (!coMt) thieu.push("chiều ngang mặt tiền"); } else thieu.push("diện tích");
    let kc = 0;
    if (l.property_type === "dat") { kc = has("tho_cu") || l.planning_status ? 15 : 0; if (!kc) thieu.push("thổ cư bao nhiêu, quy hoạch ra sao"); }
    else if (l.property_type === "phong_tro") { kc = l.furnishing || has("noi_that") ? 15 : 0; if (!kc) thieu.push("nội thất có gì"); }
    else if (l.property_type === "mat_bang") { kc = l.floors || has("ket_cau") || has("nganh_hang_phu_hop") ? 15 : 0; if (!kc) thieu.push("mấy tầng, hợp ngành gì"); }
    else {
      const coKc = l.floors != null || l.floors_text || has("ket_cau") || l.floor != null || has("tang") || l.property_type === "nha_cap4"; // 20261013b: nhà cấp 4 là nhà trệt
      const coPn = l.bedrooms != null || has("so_phong_ngu");
      kc = (coKc ? 8 : 0) + (coPn ? 7 : 0);
      if (!coKc) thieu.push("mấy tầng"); if (!coPn) thieu.push("mấy phòng ngủ");
    }
    let pl = 0;
    // 20261013c (SRS-5.1zzzzzu): tin cho thuê (không phải đất) → điều kiện thuê thay cho sổ; tin bán → "pháp lý (loại sổ, hoàn công)".
    const laThueDiem = l.deal === "cho_thue" && !/^dat/.test(l.property_type ?? "");
    if (laThueDiem) { if (has("tien_coc") || has("thoi_han_thue") || has("phap_ly") || l.legal_status || l.property_type === "phong_tro") pl = 10; else thieu.push("điều kiện thuê (cọc, thời hạn)"); }
    else if (l.legal_status || has("phap_ly") || l.property_type === "phong_tro" || (l.property_type === "chung_cu" && duAnCoPhapLyMock(this.t, l.project_id))) pl = 10;
    // 20261014d: chữ thiếu pháp lý theo loại (căn hộ / đất không có hoàn công). 20261014e: căn hộ "đã ra sổ hồng hay còn HĐMB".
    else thieu.push(l.property_type === "chung_cu" ? "pháp lý (đã ra sổ hồng hay còn hợp đồng mua bán)" : ["dat", "dat_nong_nghiep", "dat_kinh_doanh"].includes(l.property_type) ? "pháp lý (loại sổ)" : "pháp lý (loại sổ, hoàn công)");
    const gia = l.price_vnd != null ? 10 : 0; if (!gia) thieu.push("giá");
    let tn = 0;
    const moTa = String(l.description ?? "").toLowerCase();
    // 20260909a: tiềm năng 20 → 10 (nêu rõ 10, suy được 5), nhường 10 cho ảnh.
    if (has("tiem_nang")) tn = 10;
    else {
      if ((l.floors ?? 0) >= 3 || (l.bedrooms ?? 0) >= 3 || l.access_type === "mat_tien" || (l.alley_width_m ?? 0) >= 4 || ["chung_cu", "mat_bang", "phong_tro", "biet_thu"].includes(l.property_type) || has("san_vuon") || /kinh doanh|cho thu|chdv|đầu tư|dau tu|văn phòng|van phong|buôn bán|mở shop|mở quán/.test(moTa)) tn = 5;
      thieu.push("tiềm năng sử dụng (ở, cho thuê hay kinh doanh)");
    }
    const cta = l.code ? 10 : 0;
    // Ảnh 10: đếm TẤM (fact hinh_anh + listing_media), 3 tấm = tối đa, ảnh gì cũng tính.
    const soAnh = this.t.listing_facts.filter((x) => x.listing_id === l.id && x.question === "hinh_anh").length
      + this.t.listing_media.filter((m) => m.listing_id === l.id).length;
    const anh = soAnh >= 3 ? 10 : soAnh === 2 ? 7 : soAnh === 1 ? 4 : 0;
    // 20260928b (FR-237): câu xin ảnh theo loại BĐS — như DB thật.
    if (soAnh === 0) thieu.push(["dat", "dat_nong_nghiep", "dat_kinh_doanh"].includes(l.property_type) ? "vài tấm ảnh (lô đất, sổ, đường vào — ảnh nào cũng được)"
      : l.property_type === "chung_cu" ? "vài tấm ảnh (căn hộ, sổ, view — ảnh nào cũng được)"
      : l.property_type === "phong_tro" ? "vài tấm ảnh (phòng, lối vào — ảnh nào cũng được)"
      : l.property_type === "kho_xuong" ? "vài tấm ảnh (kho, sổ, đường vào — ảnh nào cũng được)"
      : "vài tấm ảnh (nhà, sổ, hẻm — ảnh nào cũng được)");
    else if (soAnh < 3) thieu.push(`thêm ảnh cho đủ 3 tấm (đang có ${soAnh})`);
    return { diem: viTri + dt + kc + pl + gia + tn + cta + anh, chi_tiet: { vi_tri_hem: viTri, dien_tich: dt, ket_cau: kc, phap_ly: pl, gia, tiem_nang: tn, goi_hanh_dong: cta, anh }, thieu, co_anh: soAnh > 0, so_anh: soAnh };
  }
  // trg_zz_listings_dang_tin (20260828b + 20260907h): cho_thong_tin ↔ dang_ban.
  quyetDinhDangTin(l) {
    let du = !!(l.price_raw && l.area_m2 && l.ward);
    if (du && l.can_chu_duyet) du = !!l.chu_duyet_at && this.diemTin(l).diem >= 70;
    if (du && l.status === "cho_thong_tin") l.status = "dang_ban";
    else if (!du && l.status === "dang_ban") l.status = "cho_thong_tin";
  }
  insert(table, row) {
    const r = { id: randomUUID(), created_at: now(), ...row };
    if (table === "messages") {
      if (r.zalo_msg_id && this.t.messages.some((m) => m.zalo_msg_id === r.zalo_msg_id)) {
        return { error: { code: "23505", message: "duplicate key value violates unique constraint messages_zalo_msg_id_key" } };
      }
      r.seq = ++this.seq;
      // Trigger `trg_messages_bump_last_message` (20260902d): mọi tin đẩy mốc hội thoại.
      const cv = this.t.conversations.find((c) => c.id === r.conversation_id); if (cv) cv.last_message_at = r.created_at;
      if (globalThis.__afterInsertMsgSeller && r.sender === 'seller') { const h = globalThis.__afterInsertMsgSeller; globalThis.__afterInsertMsgSeller = null; this.rows('messages').push(r); h(this, r); return { data: r }; }
      if (globalThis.__afterInsertMsg && r.sender === 'buyer') { const h = globalThis.__afterInsertMsg; globalThis.__afterInsertMsg = null; this.rows('messages').push(r); h(this, r); return { data: r }; }
    }
    if (table === "reminders") r.status = r.status ?? "pending"; // DB default 'pending'
    // ── Chỉ mục duy nhất TỪNG PHẦN (20260905f/g) ─────────────────────────────
    // Ba khoá này là thứ DUY NHẤT chặn được mẫu SELECT-rồi-INSERT. Mock không
    // mô phỏng chúng thì ca kiểm cạnh tranh sẽ XANH trong khi bản thật ném
    // 23505 và code chưa biết bắt — tức bộ e2e nói dối theo hướng lạc quan,
    // đúng kiểu nguy nhất. Chép sát định nghĩa trong migration.
    const trung = (msg) => ({ error: { code: "23505", message: msg } });
    if (table === "info_requests" && (r.status ?? "pending") === "pending" &&
        this.t.info_requests.some((x) =>
          x.listing_id === r.listing_id && x.question === r.question && x.status === "pending")) {
      return trung("info_requests_mot_cau_cho_idx");
    }
    if (table === "viewings" && (r.status ?? "pending") === "pending") {
      const neo = (x) => x.listing_code ?? x.listing_id ?? null;
      if (this.t.viewings.some((x) =>
        x.status === "pending" && x.buyer_id === r.buyer_id && neo(x) === neo(r))) {
        return trung("viewings_mot_hen_cho_moi_can_idx");
      }
    }
    if (table === "reminders" && r.kind === "viewing" && r.status === "pending" && r.viewing_id &&
        this.t.reminders.some((x) =>
          x.kind === "viewing" && x.status === "pending" && x.viewing_id === r.viewing_id)) {
      return trung("reminders_mot_nhac_moi_buoi_xem_idx");
    }
    if (table === "deals" &&
        this.t.deals.some((x) => x.listing_id === r.listing_id && x.buyer_id === r.buyer_id)) {
      return trung("deals_listing_buyer_key");
    }
    // listings_project_unit_uniq (project_id, unit_code) — bắn lại 14/09: hai lượt rao cùng căn S1.02.
    if (table === "listings" && r.project_id && r.unit_code &&
        this.t.listings.some((x) => x.project_id === r.project_id && x.unit_code === r.unit_code)) {
      return trung("duplicate key value violates unique constraint \"listings_project_unit_uniq\"");
    }
    if (table === "listings") {
      r.code = r.code ?? `BDS-Q5-${String(this.t.listings.length + 1).padStart(4, "0")}`;
      r.status = r.status ?? "cho_thong_tin";
      if (r.price_raw && r.price_vnd == null) r.price_vnd = parseVnd(r.price_raw);
      this.doanLoai(r);
      // (Không chạy quyết định lên kệ lúc chèn: seed cố ý dựng tin "chưa đăng"
      //  có đủ giá/diện tích/phường để kiểm SEC — V4.1/V4.7.)
    }
    this.rows(table).push(r);
    return { data: r };
  }
  // trg_listings_fill_property_type chạy cả BEFORE UPDATE OF description / property_type (30/09: điền câu rao vào tin rỗng).
  doanLoai(r) {
    // trg_listings_fill_property_type (FR-150): đoán loại từ câu rao.
    // 20261002d: tin mang dấu `_thong_so_ai` (AI đã quyết) thì không đoán — loại trống để bot hỏi.
    if (String(r.boc_tach?._thong_so_ai ?? "") === "true") return;
    if ((r.property_type ?? "chua_ro") === "chua_ro" && r.description) {
      // 20260910b: luôn so trên chuỗi ĐÃ BỎ DẤU — người thật gõ lẫn có dấu /
      // thiếu dấu trong cùng câu ("bán căn ho ở Hà đô centrosa").
      const d = boDauMock(String(r.description));
      r.property_type = /kho bai|kho xuong|nha xuong/.test(d) ? "kho_xuong"
        : /nong nghiep|dat vuon|dat lua/.test(d) ? "dat_nong_nghiep"
        : /skc|tmd|thuong mai dich vu|san xuat kinh doanh/.test(d) ? "dat_kinh_doanh"
        : /can ho dich vu|chdv|khach san|toa nha/.test(d) ? "toa_nha"
        : /chung cu|can ho|canho|\bcc\b|\bch\b/.test(d) ? "chung_cu"
        // 05/10/2026 (SRS-5.1zy): bản thật `guess_property_type` chỉ đoán ĐẤT khi câu KHÔNG có tầng / lầu / phòng ngủ / WC —
        // "Diện tích đất: 4m x 11m" của tin nhà phố 6 tầng từng làm mock ra "dat" trong khi DB thật ra nha_pho.
        : /\bdat\b|lo dat|dat nen/.test(d) && !/(tret|\blau\b|tang|phong ngu|\bpn\b|\bwc\b)/.test(d) ? "dat"
        : /\bnha\b|nha pho|\bnp\b|tret|\blau\b|hem|mat tien/.test(d) ? "nha_pho" : "chua_ro";
    }
  }
}
// Bỏ dấu — bản mock của public.bo_dau() trong DB.
export // 20261014e (`du_an_co_phap_ly`): dự án trong kho đã có pháp lý.
const duAnCoPhapLyMock = (t, pid) => !!pid && (t.projects ?? []).some((p) => p.id === pid &&
  (String(p.legal_status ?? "").trim() || String(p.specs?.phap_ly ?? "").trim() || String(p.specs?.so_huu ?? "").trim()));
const boDauMock = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// đủ cho "5 tỷ 8", "5,5 tỷ", "800 triệu"
// `chuan_hoa_gia_raw()` (schema.sql): lấy đúng cụm "số + đơn vị (+ lẻ) (+ rưỡi)" (+ "/tháng|/năm|/m2"), bỏ đuôi rác.
export function chuanHoaGiaRaw(s) {
  const goc = String(s ?? "").trim();
  if (!goc) return null;
  const t = boDauMock(goc);
  const m = /([0-9][0-9.,]*\s*(?:ty|ti|toi|trieu|tr|cu)\b(?:\s*[0-9]+(?![0-9])(?!\s*(?:thang|nam)\b))?(?:\s*ruoi)?)(?:\s*(?:\/|mot|moi|1)\s*(thang|nam|m2)\b)?/.exec(t);
  if (!m) return goc;
  const i = t.indexOf(m[1]);
  let cum = goc.slice(i, i + m[1].length).trim();
  if (m[2]) cum += "/" + (m[2] === "thang" ? "tháng" : m[2] === "nam" ? "năm" : "m2");
  return parseVnd(cum) != null ? cum : goc;
}
export function parseVnd(s) {
  // 20260928f (FR-241): parse_vnd thật đọc số viết bằng chữ ("chín tỷ rưỡi") — cùng hàm với luat-tien.ts.
  // 30/09/2026: "tỏi" CÓ DẤU là tỷ ("15 tỏi có tl" → 15 tỷ, "2 tỏi 5" → 2,5 tỷ) — đúng như parse_vnd thật (hỏi
  // doi_chieu_tien_cong_khai 30/09). "toi" không dấu thì parse_vnd thật trả NULL, mock cũng vậy.
  const t = soChuThanhSo(String(s).toLowerCase().normalize("NFC").replace(/tỏi/g, "tỷ")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  let m = /(\d+)\s*t[yi]\s*(\d)(?!\d)/.exec(t); if (m) return +m[1] * 1e9 + +m[2] * 1e8; // 22/09: "7 ti 5" — "ti" cũng là tỷ (parse_vnd 20260922c)
  m = /(\d+(?:[.,]\d+)?)\s*(ty|ti)/.exec(t); if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 1e9 + (/ruoi/.test(t) ? 5e8 : 0)); // "rưỡi" như parse_vnd thật
  m = /(\d+(?:[.,]\d+)?)\s*(trieu|tr)/.exec(t); if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 1e6);
  // "7t" = 7 tỷ (20260908a). Sau luật `tr` để "7tr" vẫn là triệu; \b sau `t`
  // nên "7 tấm" không dính (bản thật dùng \M của Postgres, cùng ý).
  m = /(\d+(?:[.,]\d+)?)\s*t\b/.exec(t); if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 1e9);
  return null;
}

function parseSelect(sel) {
  const items = []; let depth = 0, cur = "";
  for (const ch of sel) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { items.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) items.push(cur.trim());
  return items.map((it) => {
    // 15/09/2026: nhận cả gợi ý khoá ngoại `sellers!listings_seller_id_fkey(...)` —
    // PostgREST thật ĐÒI nó khi hai bảng có hai quan hệ (PGRST201); mock chỉ bỏ qua.
    const m = /^([a-z_]+)(?:!(inner|[a-z_]+))?\((.*)\)$/.exec(it);
    return m ? { embed: m[1], inner: m[2] === "inner", cols: m[3].split(",").map((s) => s.trim()) } : { col: it };
  });
}

class Builder {
  constructor(db, table) { this.db = db; this.table = table; this.filters = []; this.op = "select"; this.sel = "*"; this.embedFilters = []; }
  select(cols = "*", opts = {}) { if (this.op === "select") { this.sel = cols; this.count = opts.count; this.head = opts.head; } else this.returning = cols; return this; }
  insert(p) { this.op = "insert"; this.payload = p; return this; }
  // SRS-5.1zzj: `.upsert(rows, { onConflict: "a,b" })` — trùng khoá thì gộp vào dòng cũ, không thì chèn.
  upsert(p, opts = {}) { this.op = "upsert"; this.payload = p; this.onConflict = String(opts.onConflict ?? "id").split(",").map((c) => c.trim()); return this; }
  update(p) { this.op = "update"; this.payload = p; return this; }
  // SRS-5.1zzzzy: chat-reply xoá dòng ghi chú khách xin bỏ (`.delete().eq("id", …)`).
  delete() { this.op = "delete"; return this; }
  _f(kind, col, val) { (col.includes(".") ? this.embedFilters : this.filters).push({ kind, col, val }); return this; }
  eq(c, v) { return this._f("eq", c, v); } neq(c, v) { return this._f("neq", c, v); } in(c, v) { return this._f("in", c, v); }
  gte(c, v) { return this._f("gte", c, v); } lte(c, v) { return this._f("lte", c, v); } gt(c, v) { return this._f("gt", c, v); } lt(c, v) { return this._f("lt", c, v); }
  not(c, op, v) { return this._f("not_" + op, c, v); } ilike(c, v) { return this._f("ilike", c, v); }
  contains(c, v) { return this._f("contains", c, v); }
  // `.is(col, null)` của PostgREST — SEC-13 dùng nó để chỉ đụng dòng CHƯA chốt
  // gửi. Thiếu ở mock thì bộ e2e đo một hành vi khác với bản chạy thật.
  is(c, v) { return this._f("is", c, v); }
  // `.or("code.ilike.X,legacy_code.ilike.X")` của PostgREST — chat-reply (03724e4,
  // chuẩn hoá mã tin) tra mã bằng CẢ `code` lẫn `legacy_code`. Cú pháp: các mệnh
  // đề `cột.toán_tử.giá_trị` cách nhau dấu phẩy, khớp MỘT mệnh đề là đủ. Thiếu
  // hàm này thì bundle ném TypeError ngay lượt đầu và 208 ca không chạy ca nào
  // (CI đỏ 6 lần liên tiếp 08/09 mà không ai nhìn). Mệnh đề lạ → ném lỗi, không
  // lặng lẽ coi là đúng.
  or(expr) {
    const items = String(expr).split(",").map((s) => {
      const m = /^([a-z_]+)\.(eq|neq|gt|gte|lt|lte|ilike|like|is)\.(.*)$/i.exec(s.trim());
      if (!m) throw new Error(`mock-supabase: .or() không hiểu mệnh đề "${s}"`);
      let val = m[3];
      if (m[2] === "is") val = val === "null" ? null : val === "true";
      return { kind: m[2] === "like" ? "ilike" : m[2], col: m[1], val };
    });
    return this._f("or", "__or__", items);
  }
  order(c, o = {}) { this.ord = { c, asc: o.ascending !== false }; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  static test(f, row) {
    const v = row[f.col];
    switch (f.kind) {
      case "eq": return v === f.val; case "neq": return v !== f.val; case "in": return f.val.includes(v);
      case "gte": return v != null && v >= f.val; case "lte": return v != null && v <= f.val; case "gt": return v > f.val; case "lt": return v < f.val;
      case "is": return f.val === null ? v == null : v === f.val;
      case "or": return f.val.some((sub) => Builder.test(sub, row));
      case "not_is": return f.val === null ? v != null : v !== f.val;
      case "contains": return Array.isArray(v) && (f.val ?? []).every((x) => v.includes(x));
      case "ilike": { const p = "^" + String(f.val).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$"; return new RegExp(p, "i").test(String(v ?? "")); }
    }
    return true;
  }
  embedOf(row, embed) {
    const fk = singular(embed) + "_id";
    if (fk in row) return { one: true, rows: this.db.rows(embed).filter((r) => r.id === row[fk]) };
    const back = singular(this.table) + "_id";
    return { one: false, rows: this.db.rows(embed).filter((r) => r[back] === row.id) };
  }
  run() {
    const db = this.db; const t = this.table;
    db.log.push({ table: t, op: this.op, filters: this.filters, embedFilters: this.embedFilters, payload: this.payload, sel: this.sel });
    // 20261009b — trigger `listings_chuan_hoa_cot`: cột phường đổi mà không phải tên chuẩn → để trống + sổ lỗi. Chỉ lượt ghi của CODE
    // (Builder / RPC); dòng ca e2e dựng sẵn bằng db.insert là dữ liệu cũ, không qua đây (như dòng cũ trên DB thật trước migration).
    if (t === "listings" && (this.op === "insert" || this.op === "update" || this.op === "upsert")) {
      for (const p of Array.isArray(this.payload) ? this.payload : [this.payload]) {
        if (!p || !("ward" in p) || p.ward == null) continue;
        if (chuanHoaPhuong(p.ward)) continue;
        db.insert("bot_errors", { source: "listings.ward khong chuan", detail: `"${p.ward}"`, at: now() });
        p.ward = null;
      }
    }
    if (this.op === "upsert") {
      const arr = Array.isArray(this.payload) ? this.payload : [this.payload]; const out = [];
      for (const p of arr) {
        const cu = db.rows(t).find((r) => this.onConflict.every((c) => r[c] === p[c]));
        if (cu) { Object.assign(cu, p); out.push(cu); continue; }
        const r = db.insert(t, p); if (r.error) return { data: null, error: r.error }; out.push(r.data);
      }
      return { data: out, error: null };
    }
    if (this.op === "insert") {
      const arr = Array.isArray(this.payload) ? this.payload : [this.payload]; const out = [];
      for (const p of arr) { const r = db.insert(t, p); if (r.error) return { data: null, error: r.error }; out.push(r.data); }
      return this.mode === "single" || this.mode === "maybe" ? { data: out[0] ?? null, error: null } : { data: out, error: null };
    }
    let rows = db.rows(t).filter((r) => this.filters.every((f) => Builder.test(f, r)));
    if (this.op === "delete") {
      const bo = new Set(rows);
      db.t[t] = (db.t[t] ?? []).filter((r) => !bo.has(r));
      return { data: rows, error: null };
    }
    if (this.op === "update") {
      rows.forEach((r) => Object.assign(r, this.payload));
      if (t === "listings") rows.forEach((r) => {
        if ("price_raw" in this.payload) r.price_vnd = r.price_raw ? parseVnd(r.price_raw) : null;
        if ("description" in this.payload || "property_type" in this.payload) db.doanLoai(r);
        db.quyetDinhDangTin(r);
      });
      if (this.mode === "single") return rows[0] ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: "0 rows" } };
      return { data: rows, error: null };
    }
    const items = parseSelect(this.sel);
    // lọc theo embed (vd listings.seller_id) + !inner
    rows = rows.filter((r) => {
      for (const it of items) if (it.embed) {
        const e = this.embedOf(r, it.embed);
        const ok = e.rows.filter((er) => this.embedFilters.filter((f) => f.col.startsWith(it.embed + ".")).every((f) => Builder.test({ ...f, col: f.col.split(".")[1] }, er)));
        if (it.inner && ok.length === 0) return false;
      }
      return true;
    });
    if (this.ord) rows.sort((a, b) => (a[this.ord.c] > b[this.ord.c] ? 1 : a[this.ord.c] < b[this.ord.c] ? -1 : 0) * (this.ord.asc ? 1 : -1));
    if (this.lim != null) rows = rows.slice(0, this.lim);
    if (this.head) return { data: null, count: rows.length, error: null };
    const proj = rows.map((r) => {
      const o = {};
      for (const it of items) {
        if (it.col === "*") Object.assign(o, r);
        else if (it.col) o[it.col] = r[it.col];
        else {
          const e = this.embedOf(r, it.embed);
          const ok = e.rows.filter((er) => this.embedFilters.filter((f) => f.col.startsWith(it.embed + ".")).every((f) => Builder.test({ ...f, col: f.col.split(".")[1] }, er)));
          const pick = (er) => Object.fromEntries(it.cols.map((c) => [c, er[c]]));
          o[it.embed] = e.one ? (ok[0] ? pick(ok[0]) : null) : ok.map(pick);
        }
      }
      return o;
    });
    if (this.mode === "maybe") return { data: proj[0] ?? null, error: null };
    if (this.mode === "single") return proj[0] ? { data: proj[0], error: null } : { data: null, error: { code: "PGRST116", message: "0 rows" } };
    return { data: proj, error: null, count: this.count ? proj.length : undefined };
  }
  // ĐỘ TRỄ GIẢ — chỗ cuộc đua thật sự sống.
  // Bản trước chạy `run()` gần như tức thời, nên hai handler gọi song song vẫn
  // nối đuôi nhau: handler A xong cả khối SELECT→INSERT rồi B mới bắt đầu, và
  // ca kiểm "đua" đo được đúng con số như khi không có đua. Đã đo: tắt hết chỉ
  // mục duy nhất trong mock mà 129/129 vẫn xanh — bộ kiểm câm.
  // Cuộc đua thật nằm ở ĐỘ TRỄ MẠNG giữa lúc đọc và lúc ghi. `__treTruyVan`
  // cho ca kiểm chèn đúng độ trễ đó: `(bang, op) => số ms`.
  then(res, rej) {
    const tre = globalThis.__treTruyVan?.(this.table, this.op ?? "select") ?? 0;
    const chay = () => { try { return Promise.resolve(this.run()); } catch (e) { return Promise.reject(e); } };
    if (!tre) return chay().then(res, rej);
    return new Promise((ok) => setTimeout(ok, tre)).then(chay).then(res, rej);
  }
}

class RpcCall {
  constructor(db, name, args) { this.db = db; this.name = name; this.args = args; }
  single() { this.mode = "single"; return this; } maybeSingle() { this.mode = "maybe"; return this; }
  // 02/10/2026: `.rpc(...).select("a, b")` như PostgREST — chỉ giữ cột đã chọn, để mock bắt được chỗ đọc cột không chọn.
  select(cols) { this.cols = String(cols).split(",").map((c) => c.trim()).filter(Boolean); return this; }
  run() {
    const db = this.db; let a = this.args ?? {}; db.log.push({ rpc: this.name, args: a });
    const R = globalThis.__rpc ?? {};
    if (R[this.name]) return R[this.name](db, a);
    switch (this.name) {
      // Vault giả. Mặc định RỖNG (không secret nào) — giữ nguyên hành vi cũ cho
      // bộ chat-reply. Ca kiểm nào cần secret thì đặt `globalThis.__vault`, một
      // hàm `(tên) => { data, error }`. Đây là cách bộ kiểm có secret riêng mà
      // KHÔNG bao giờ chạm secret production: giá trị dưới đây là chuỗi bịa,
      // sống trong tiến trình test, không đọc env thật, không gọi Vault thật.
      // `error` khác null là cảnh ĐỌC HỤT — khác hẳn cảnh "chưa đặt" (data null,
      // error null). Hai cảnh này đi hai nhánh khác nhau trong zalo-webhook, và
      // gộp chúng làm một chính là lỗi SEC-02 cũ.
      case "get_secret":
        return globalThis.__vault ? globalThis.__vault(a.secret_name) : { data: null, error: null };
      // FR-227 (20260925f/h): Nominatim gọi QUA DB. Ghi URL y như hàm SQL dựng vào `__fetches` để các ca FR-209 vẫn soi
      // được câu tra; `__nominatim` = JSON là "tra được", mặc định lỗi HTTP 404 như hàm SQL raise.
      case "tra_nominatim": {
        const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn" +
          `&limit=${Math.max(1, Math.min(a.p_limit ?? 1, 10))}` + (a.p_chi_tiet ? "&addressdetails=1" : "") +
          (a.p_viewbox ? `&viewbox=${a.p_viewbox}&bounded=1` : "") + `&q=${encodeURIComponent(a.p_q ?? "")}`;
        globalThis.__fetches = [...(globalThis.__fetches ?? []), u];
        return globalThis.__nominatim ? { data: globalThis.__nominatim, error: null } : { data: null, error: { message: "nominatim HTTP 404: " } };
      }
      // 20260909b — công tắc test: mặc định BẬT trong e2e (như DB test hiện tại).
      // FR-180: mẫu câu chuẩn cho prompt — e2e đặt globalThis.__mauCau = { ban, mua }.
      // FR-212 (20260921b): từ điển tên đường — chép ngữ nghĩa `tim_duong`: khớp đúng / gần
      // (Levenshtein ≤ p_toi_da) trên chữ bỏ dấu, gom quận/phường/tỉnh theo tên, tối đa 8 dòng.
      case "tim_duong": {
        const bd = (x) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
        const lev = (x, y) => { const m = x.length, n = y.length; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
        const k = bd(String(a.p_ten ?? "").trim().replace(/\s+/g, " ")); const toiDa = a.p_toi_da ?? 2;
        if (k.length < 4) return { data: [], error: null };
        const gom = new Map();
        for (const d of db.t.duong ?? []) {
          const kc = lev(bd(d.ten), k); if (kc > toiDa) continue;
          const g = gom.get(d.ten) ?? { ten: d.ten, khoang_cach: kc, quan_cu: new Set(), phuong: new Set(), tinh: new Set() };
          g.khoang_cach = Math.min(g.khoang_cach, kc); if (d.quan_cu) g.quan_cu.add(d.quan_cu); if (d.phuong) g.phuong.add(d.phuong); g.tinh.add(d.tinh ?? "TP.HCM");
          gom.set(d.ten, g);
        }
        const rows = [...gom.values()].map((g) => ({ ten: g.ten, khoang_cach: g.khoang_cach, quan_cu: [...g.quan_cu], phuong: [...g.phuong], tinh: [...g.tinh] }))
          .sort((x, y) => x.khoang_cach - y.khoang_cach || ((a.p_quan && y.quan_cu.includes(a.p_quan)) - (a.p_quan && x.quan_cu.includes(a.p_quan))) || x.ten.localeCompare(y.ten)).slice(0, 8);
        return { data: rows, error: null };
      }
      // 20261001e: dò một tên trong cả 4 từ điển — chép ngữ nghĩa `tim_dia_danh` (đúng chữ 0, đảo chữ 1 cho phường/quận,
      // 1 + Levenshtein khi ≥ 6 ký tự và lệch ≤ p_toi_da; đường gộp theo tên, quận chỉ khi một quận).
      case "tim_dia_danh": {
        const bd = (x) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();
        const lev = (x, y) => { const m = x.length, n = y.length; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
        const sap = (x) => x.split(" ").sort().join(" ");
        const k = bd(a.p_ten); const toiDa = Math.min(Math.max(a.p_toi_da ?? 1, 0), 2);
        if (k.length < 3 || k.length > 60 || !/[a-z]/.test(k)) return { data: [], error: null };
        const wards = db.t.wards ?? [];
        const ung = [
          ...wards.map((w) => ({ loai: "phuong_moi", ten: w.ten, ten_day_du: w.ten_day_du, phuong: w.ten_day_du, quan_cu: w.quan_cu, k: bd(w.ten), dao: true })),
          ...(db.t.phuong_cu ?? []).flatMap((p) => { const w = wards.find((x) => x.ten === p.phuong_moi); return w ? [{ loai: "phuong_cu", ten: p.ten, ten_day_du: `${p.ten}, ${p.quan_cu}`, phuong: w.ten_day_du, quan_cu: p.quan_cu, k: bd(p.ten).replace(/^(phuong|xa|thi tran)\s+/, ""), dao: true }] : []; }),
          ...(db.t.quan_cu ?? []).map((q) => ({ loai: "quan_cu", ten: q.ten, ten_day_du: q.ten, phuong: null, quan_cu: q.ten, k: bd(q.ten).replace(/^(quan|huyen|thanh pho|thi xa)\s+/, ""), dao: true })),
        ];
        const gom = new Map();
        for (const d of (db.t.duong ?? []).filter((x) => x.loai !== "hem")) {
          const g = gom.get(d.ten) ?? { loai: d.loai ?? "duong", ten: d.ten, ten_day_du: d.ten, phuong: null, q: new Set(), k: bd(d.ten), dao: false };
          if (d.quan_cu) g.q.add(d.quan_cu); gom.set(d.ten, g);
        }
        for (const g of gom.values()) ung.push({ ...g, quan_cu: g.q.size === 1 ? [...g.q][0] : null });
        const rows = ung.map((u) => {
          if (Math.abs(u.k.length - k.length) > toiDa) return null;
          const kc = u.k === k ? 0 : u.dao && k.includes(" ") && sap(u.k) === sap(k) ? 1 : k.length >= 6 && lev(u.k, k) <= toiDa ? 1 + lev(u.k, k) : null;
          return kc == null ? null : { loai: u.loai, ten: u.ten, ten_day_du: u.ten_day_du, phuong: u.phuong, quan_cu: u.quan_cu, khoang_cach: kc };
        }).filter(Boolean).sort((x, y) => x.khoang_cach - y.khoang_cach || x.loai.localeCompare(y.loai) || x.ten.localeCompare(y.ten));
        return { data: rows.slice(0, 20), error: null };
      }
      // 20260930a: hẻm theo số (các cấp, nhỏ nhất trước) + đường mẹ — chép ngữ nghĩa `tim_hem`.
      case "tim_hem": {
        const bd = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
        const me = bd(String(a.p_duong_me ?? "").replace(/^(?:đường|duong)\s+(?!(?:số|so)\s)/i, ""));
        const cap = (a.p_cap_hem ?? []).map((x) => String(x).toUpperCase());
        const rows = (db.t.duong ?? []).filter((d) => d.loai === "hem" && cap.includes(String(d.so_hem ?? "").toUpperCase()) && bd(d.duong_me) === me && (!a.p_phuong || d.phuong === a.p_phuong))
          .sort((x, y) => cap.indexOf(String(y.so_hem).toUpperCase()) - cap.indexOf(String(x.so_hem).toUpperCase()))
          .map((d) => ({ ten: d.ten, so_hem: d.so_hem, phuong: d.phuong || null, quan_cu: d.quan_cu ?? null, lat: d.lat ?? null, lng: d.lng ?? null }));
        return { data: rows.slice(0, 10), error: null };
      }
      // 20260930a: phường có cả hai con đường mà tâm cách nhau ≤ bán kính — haversine như khoang_cach_m.
      case "phuong_giao_hai_duong": {
        const bd = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();
        const km = (la1, lo1, la2, lo2) => { const r = (x) => x * Math.PI / 180; const h = Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); };
        const ds = db.t.duong ?? []; const bk = Math.max(100, Math.min(a.p_ban_kinh_m ?? 1200, 5000));
        const gom = new Map();
        for (const x of ds.filter((d) => bd(d.ten) === bd(a.p_duong1) && d.phuong && d.lat != null)) {
          for (const y of ds.filter((d) => bd(d.ten) === bd(a.p_duong2) && d.lat != null)) {
            const c = km(x.lat, x.lng, y.lat, y.lng); if (c > bk) continue;
            const g = gom.get(x.phuong); if (!g || c < g.cach_m) gom.set(x.phuong, { phuong: x.phuong, quan_cu: x.quan_cu ?? null, cach_m: c });
          }
        }
        return { data: [...gom.values()].sort((p, q) => p.cach_m - q.cach_m).slice(0, 5), error: null };
      }
      // SRS-5.1zl (20261003c): trả khoá được hỏi mà nội dung DB khác mã băm SHA-256 bản code.
      case "doc_prompt_khac": {
        const bam = a.p_bam ?? {};
        return { data: (db.t.bot_prompts ?? []).filter((r) => r.key in bam && bam[r.key] !== createHash("sha256").update(r.content ?? "", "utf8").digest("hex")).map((r) => ({ key: r.key, content: r.content })), error: null };
      }
      case "mau_cau_fewshot":
        return { data: (globalThis.__mauCau ?? {})[a.p_phia] ?? "", error: null };
      // FR-216 g (20260923h): chat-reply hỏi một RPC — mô phỏng bằng công tắc e2e (không mô phỏng tạm dừng / khoá).
      case "tim_nghia_san_sang":
        return { data: String((globalThis.__cauHinh ?? {}).tim_theo_nghia ?? "") === "bat", error: null };
      // SRS-5.1y: công tắc trợ lý `thu` hỏi `la_id_thu` — mock chỉ cần phân biệt ID thử ("thu-…") với ID thật.
      case "la_id_thu":
        return { data: /^thu-/.test(String(a.p ?? "")), error: null };
      // SRS-5.1zzzzzd: sổ đầu ra model của ID thử — như hàm thật, ID không phải ID thử thì bỏ qua im lặng.
      case "ghi_ai_thu":
        if (/^thu-/.test(String(a.p_zalo ?? "")) && Array.isArray(a.p_luot)) db.insert("ai_ghi_thu", { zalo_user_id: a.p_zalo, tin: a.p_tin ?? "", luot: a.p_luot });
        return { data: null, error: null };
      case "cau_hinh": {
        // 30/09/2026: production không có dòng `luat_loi_bot` = GỌN. Bộ e2e cũ viết cho đủ luật nên mock mặc định `du`;
        // ca GỌN tự đặt `luat_loi_bot: "gon"` trong __cauHinh.
        const ch = globalThis.__cauHinh ?? { test_reset_hello: "1" };
        return { data: ch[a.p_key] ?? (a.p_key === "luat_loi_bot" ? "du" : null), error: null };
      }
      // FR-245 (20260929a): "hello" gọi thẳng hàm xoá lõi `xoa_nguoi_theo_zalo`; `reset_nguoi_test` (công cụ thử) chỉ nhận ID thử.
      case "xoa_nguoi_theo_zalo":
      case "reset_nguoi_test": {
        const z = a.p_zalo;
        const sIds = db.t.sellers.filter((s) => s.zalo_user_id === z).map((s) => s.id);
        const bIds = db.t.buyers.filter((b) => b.zalo_user_id === z).map((b) => b.id);
        const lIds = db.t.listings.filter((l) => sIds.includes(l.seller_id)).map((l) => l.id);
        const cIds = db.t.conversations.filter((c) => sIds.includes(c.seller_id) || bIds.includes(c.buyer_id)).map((c) => c.id);
        const bo = (t, f) => { const n = db.t[t].length; db.t[t] = db.t[t].filter((r) => !f(r)); return n - db.t[t].length; };
        bo("deals", (r) => lIds.includes(r.listing_id) || bIds.includes(r.buyer_id));
        bo("viewings", (r) => lIds.includes(r.listing_id) || bIds.includes(r.buyer_id));
        bo("info_requests", (r) => lIds.includes(r.listing_id) || bIds.includes(r.buyer_id));
        const nM = bo("messages", (r) => cIds.includes(r.conversation_id));
        const nC = bo("conversations", (r) => cIds.includes(r.id));
        for (const t of ["listing_facts", "interests", "reminders", "ratings"]) bo(t, (r) => lIds.includes(r.listing_id) || bIds.includes(r.buyer_id) || sIds.includes(r.seller_id));
        const nL = bo("listings", (r) => lIds.includes(r.id));
        const nS = bo("sellers", (r) => sIds.includes(r.id));
        const nB = bo("buyers", (r) => bIds.includes(r.id));
        return { data: { ok: true, listings: nL, messages: nM, conversations: nC, sellers: nS, buyers: nB }, error: null };
      }
      // Chép ĐÚNG ngữ nghĩa hàm thật (đã đọc `pg_get_functiondef` 05/09/2026):
      //   insert … on conflict (event_id) do update
      //     set delivery_count = delivery_count + 1, last_seen_at = now()
      //   returning delivery_count
      // Tức giao trùng KHÔNG đẻ dòng thứ hai, chỉ đếm thêm — đó là cả cái cột
      // sống của chống-giao-trùng (FR-162). Mock mà chỉ push thêm dòng thì ca
      // "duplicate webhook" sẽ xanh trong khi hàm thật chưa chắc đúng.
      case "ghi_su_kien_inbound": {
        const co = db.t.inbound_events.find((x) => x.event_id === a.p_event_id);
        if (co) { co.delivery_count++; co.last_seen_at = now(); return { data: co.delivery_count, error: null }; }
        db.t.inbound_events.push({
          event_id: a.p_event_id, zalo_user_id: a.p_zalo_user_id, payload: a.p_payload,
          delivery_count: 1, first_seen_at: now(), last_seen_at: now(),
        });
        return { data: 1, error: null };
      }
      // 20260905h — chép đúng hai điều kiện lọc của hàm thật. Hàm thật xếp hàng
      // bằng `pg_advisory_xact_lock` theo từng khách; ở đây `run()` chạy ĐỒNG BỘ
      // (không `await` nào ở giữa) nên đọc-rồi-ghi không xen được — đúng cái mà
      // khoá tư vấn bảo đảm bên DB. Chính vì vậy ca ĐUA-4 mới xanh sau khi vá và
      // ĐỎ trước khi vá (lúc app còn đi hai truy vấn rời).
      case "mo_viec_can_nguoi_that": {
        const cua24h = Date.now() - 24 * 3600e3;
        const da = db.t.reminders.filter((r) =>
          r.buyer_id === a.p_buyer_id && r.kind === "escalation" &&
          (a.p_voice
            ? ["pending", "sent"].includes(r.status) &&
              /^voice:/i.test(String(r.note ?? "")) &&
              Date.parse(r.created_at) > cua24h
            : r.status === "pending")).length;
        if (da > 0) return { data: false, error: null };
        db.insert("reminders", {
          kind: "escalation", buyer_id: a.p_buyer_id, ctv_id: a.p_ctv_id ?? null,
          due_at: now(), note: a.p_note,
        });
        return { data: true, error: null };
      }
      // 20260905i — lease chiều GỬI. Hàm thật là MỘT câu `update … where
      // sent_at is null and (sending_until is null or sending_until < now())`,
      // nguyên tử ở tầng hàng. Ở đây `run()` chạy đồng bộ nên cũng nguyên tử —
      // đúng cái mà Postgres bảo đảm. Chép sát điều kiện, kể cả "đã gửi xong
      // thì không giành nữa": bỏ vế đó là mock rộng hơn hàm thật.
      case "giu_luot_gui": {
        const l = db.t.inbound_ledger.find((x) => x.zalo_msg_id === a.p_msg_id);
        // 20260905j: KHÔNG có dòng sổ ≠ có người giữ. Gộp hai cảnh đó vào cùng
        // một `false` là bỏ luôn cú gửi — khách không nhận được gì.
        if (!l) return { data: true, error: null };
        if (l.sent_at) return { data: false, error: null };
        if (l.sending_until && Date.parse(l.sending_until) > Date.now()) {
          return { data: false, error: null };
        }
        l.sending_until = new Date(Date.now() + (a.p_han_secs ?? 120) * 1000).toISOString();
        l.updated_at = now();
        return { data: true, error: null };
      }
      case "nha_luot_gui": {
        const l = db.t.inbound_ledger.find((x) => x.zalo_msg_id === a.p_msg_id);
        if (l) { l.sending_until = null; l.updated_at = now(); }
        return { data: null, error: null };
      }
      case "log_loi": db.t.bot_errors.push({ at: now(), source: a.p_source, detail: a.p_detail, status_code: a.p_code }); return { data: null, error: null };
      case "cong_token": db.t.bot_usage.push(a); return { data: null, error: null };
      case "bump_model_quota": return { data: true, error: null };
      // SRD §IV.3 (05/10/2026): trần căn theo hạng + hạng của nhóm người bán. Mặc định "được rao", "không ai Vàng" (giữ nguyên
      // hành vi cũ); ca kiểm đè bằng `globalThis.__rpc = { con_duoc_rao: () => ({ data: { duoc: false, hang: "dong", so_dang_rao: 5, tran: 5, diem: 20 }, error: null }) }`.
      case "con_duoc_rao": {
        const so = db.t.listings.filter((l) => l.seller_id === a.p_seller_id && ["cho_thong_tin", "dang_ban", "dang_quan_tam"].includes(l.status)).length;
        return { data: { duoc: true, hang: "bac", so_dang_rao: so, tran: null, diem: 60 }, error: null };
      }
      case "hang_cua_nguoi_ban": return { data: [], error: null };
      // SEC-05 — trần cá nhân. Mặc định cho qua; ca kiểm đè bằng
      // `globalThis.__rpc = { bump_user_quota: () => ({ data: false, error: null }) }`.
      case "bump_user_quota": return { data: true, error: null };
      // ══ claim_inbound — chép ĐỦ NĂM NHÁNH của hàm thật ══
      // (đọc `pg_get_functiondef` 05/09/2026; xem migration FR-166)
      // Bản mock cũ chỉ có ba nhánh: mới / completed / còn lại-thì-nhận. Thiếu
      // `in_flight` (processing còn tươi), `dead` (đủ 8 lượt) và `next_retry_at`.
      // Thiếu đúng ba nhánh mà `chat-reply` xử KHÁC HẲN nhau — nghĩa là ba
      // đường thoát quan trọng nhất của chống-trùng chưa từng được ca kiểm nào
      // chạm tới. Mock hẹp hơn hàm thật thì bộ e2e xanh mà không chứng minh gì.
      //
      // `created_at` PHẢI có: bảng thật khai `not null default now()`, và cổng
      // `mark_sent` (SEC-13) lọc `.gte("created_at", 15 phút trước)`.
      case "claim_inbound": {
        const STALE = (a.p_stale_secs ?? 150) * 1000;
        const MAX = 8;
        let l = db.t.inbound_ledger.find((x) => x.zalo_msg_id === a.p_msg_id);
        if (!l) {
          l = { zalo_msg_id: a.p_msg_id, status: "processing", attempts: 1, reply: null,
                created_at: now(), updated_at: now(), started_at: now(), next_retry_at: null };
          db.t.inbound_ledger.push(l);
          return { data: { r_state: "received", r_attempts: 1, r_sent_at: null, r_dead: false }, error: null };
        }
        if (l.status === "completed") {
          return { data: { r_state: "completed", r_reply: l.reply, r_attempts: l.attempts, r_sent_at: l.sent_at ?? null, r_dead: false }, error: null };
        }
        if (l.status === "dead") {
          return { data: { r_state: "dead", r_reply: l.reply, r_attempts: l.attempts, r_sent_at: l.sent_at ?? null, r_dead: true }, error: null };
        }
        // Đang có lượt khác cầm và còn tươi → KHÔNG cấp sổ lần hai.
        if (l.status === "processing" && Date.parse(l.updated_at ?? l.created_at) > Date.now() - STALE) {
          return { data: { r_state: "in_flight", r_attempts: l.attempts, r_sent_at: l.sent_at ?? null, r_dead: false }, error: null };
        }
        // Chưa tới giờ hẹn lùi dần → cũng không cấp.
        if (l.next_retry_at && Date.parse(l.next_retry_at) > Date.now()) {
          return { data: { r_state: "in_flight", r_attempts: l.attempts, r_sent_at: l.sent_at ?? null, r_dead: false }, error: null };
        }
        if (l.attempts >= MAX) {
          l.status = "dead"; l.finished_at = now(); l.updated_at = now();
          return { data: { r_state: "dead", r_reply: l.reply, r_attempts: l.attempts, r_sent_at: l.sent_at ?? null, r_dead: true }, error: null };
        }
        l.status = "processing"; l.attempts++; l.started_at = now();
        l.next_retry_at = null; l.updated_at = now();
        return { data: { r_state: "received", r_reply: l.reply, r_attempts: l.attempts, r_sent_at: l.sent_at ?? null, r_dead: false }, error: null };
      }
      // bao_hong_inbound — cũng chép đủ nhánh: `completed` thì KHÔNG hạ cấp
      // (guard `inbound_ledger_giu_completed`), đủ 8 lượt thì sang thư chết,
      // còn lại thì `failed` kèm giờ hẹn lùi dần.
      case "bao_hong_inbound": {
        const l = db.t.inbound_ledger.find((x) => x.zalo_msg_id === a.p_msg_id);
        if (!l) return { data: "khong_co", error: null };
        if (l.status === "completed") return { data: "da_completed", error: null };
        if (l.attempts >= 8) {
          l.status = "dead"; l.detail = a.p_detail; l.finished_at = now(); l.updated_at = now();
          return { data: "dead", error: null };
        }
        // `lan_thu_ke`: 30s × 2^(attempts-1), trần 1 giờ. Bỏ phần ngẫu nhiên
        // ±20% của hàm thật — ca kiểm cần con số đoán được.
        const cho = Math.min(30e3 * 2 ** (Math.max(l.attempts, 1) - 1), 3600e3);
        l.status = "failed"; l.detail = a.p_detail;
        l.next_retry_at = new Date(Date.now() + cho).toISOString();
        l.updated_at = now();
        return { data: "failed", error: null };
      }
      case "ensure_buyer_conversation": {
        let b = db.t.buyers.find((x) => x.zalo_user_id === a.p_zalo_user_id);
        if (!b) b = db.insert("buyers", { zalo_user_id: a.p_zalo_user_id, name: null, preferences: {} }).data;
        // 20260923b (FR-214 a): một hội thoại mỗi NGƯỜI — người đã có hội thoại bán thì gắn buyer_id vào đó.
        const sB = db.t.sellers.find((x) => x.zalo_user_id === a.p_zalo_user_id);
        let c = db.t.conversations.filter((x) => x.buyer_id === b.id).sort((x, y) => (x.started_at < y.started_at ? 1 : -1))[0];
        if (!c && sB) { c = db.t.conversations.filter((x) => x.seller_id === sB.id).sort((x, y) => (x.started_at < y.started_at ? 1 : -1))[0]; if (c) c.buyer_id = b.id; }
        if (!c) c = db.insert("conversations", { buyer_id: b.id, seller_id: sB?.id ?? null, channel: a.p_channel, started_at: now(), human_touch_at: null, ctv_id: null }).data;
        return { data: { b_id: b.id, b_name: b.name, b_prefs: b.preferences, c_id: c.id, c_ctv_id: c.ctv_id ?? null, c_human_touch_at: c.human_touch_at ?? null, c_human_hold: c.human_hold === true }, error: null };
      }
      case "tao_followup": {
        // 20260902d: một nhắc follow-up còn hiệu lực mỗi khách mỗi 24h
        const l = db.t.listings.find((x) => x.code === a.p_code); if (!l) return { data: false, error: null };
        const since = Date.now() - 24 * 3600e3;
        if (db.t.reminders.some((r) => r.buyer_id === a.p_buyer_id && r.kind === "followup" && ["pending","sent"].includes(r.status) && Date.parse(r.created_at) > since)) return { data: false, error: null };
        db.insert("reminders", { kind: "followup", buyer_id: a.p_buyer_id, listing_id: l.id, due_at: new Date(Date.now() + 150 * 60e3).toISOString(), note: `khách hỏi #${a.p_code} rồi im — chủ động gửi thêm thông tin căn này` });
        return { data: true, error: null };
      }
      case "ensure_seller_conversation": {
        // 20260923b (FR-214 a): một hội thoại mỗi NGƯỜI — người đã có hội thoại mua thì gắn seller_id vào đó.
        const sS = db.t.sellers.find((x) => x.id === a.p_seller_id);
        const bS = sS ? db.t.buyers.find((x) => x.zalo_user_id === sS.zalo_user_id) : null;
        let c = db.t.conversations.find((x) => x.seller_id === a.p_seller_id);
        if (!c && bS) { c = db.t.conversations.filter((x) => x.buyer_id === bS.id).sort((x, y) => (x.started_at < y.started_at ? 1 : -1))[0]; if (c) c.seller_id = a.p_seller_id; }
        if (!c) c = db.insert("conversations", { seller_id: a.p_seller_id, buyer_id: bS?.id ?? null, channel: a.p_channel, started_at: now(), human_touch_at: null }).data;
        return { data: { c_id: c.id, c_human_touch_at: c.human_touch_at, c_human_hold: c.human_hold === true }, error: null };
      }
      case "mo_ho_so_nguoi_ban": {
        let s = db.t.sellers.find((x) => x.zalo_user_id === a.p_zalo_user_id);
        if (!s) s = db.insert("sellers", { zalo_user_id: a.p_zalo_user_id, seller_type: a.p_seller_type ?? "ccrb", name: null, active_listing_id: null }).data;
        else if (s.seller_type === "unknown") s.seller_type = a.p_seller_type ?? "ccrb";
        const row = { id: s.id, name: s.name, active_listing_id: s.active_listing_id, seller_type: s.seller_type };
        return { data: this.mode ? row : [row], error: null };
      }
      case "merge_buyer_prefs": { const b = db.t.buyers.find((x) => x.id === a.p_buyer_id); if (b) b.preferences = { ...(b.preferences ?? {}), ...(a.p_delta ?? {}) }; return { data: null, error: null }; }
      case "ghi_fact_listing": {
        const l = db.t.listings.find((x) => x.id === a.p_listing_id); if (!l) return { data: null, error: { message: "listing khong ton tai" } };
        // 20260928f (FR-241): đáp câu vi_tri mà chỉ là "xã/phường/thị trấn …" thì ghi là phuong — như ghi_fact_listing thật.
        { const kdQ = String(a.p_answer ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
          if (a.p_question === "vi_tri" && /^(xa|phuong|thi tran)\s+\S/.test(kdQ) && !/(duong|\bhem\b|\bngo\b|\bkiet\b|\bso\s*[0-9]|[0-9]+\s*\/|,\s*[0-9])/.test(kdQ)) a = { ...a, p_question: "phuong" }; }
        db.insert("listing_facts", { listing_id: l.id, question: a.p_question, answer: a.p_answer, source: a.p_source });
        // 20260928a (FR-235): ghi fact cho khoá nào thì câu ĐANG TREO cùng khoá (hỏi người bán, không phải câu khách mua) của tin đó đóng luôn — như DB thật.
        if (!["bo_sung", "kien_thuc"].includes(a.p_question)) db.t.info_requests.forEach((q) => {
          if (q.listing_id === l.id && !q.buyer_id && q.question === a.p_question && q.status === "pending") { q.status = "answered"; q.answer = a.p_answer; }
        });
        // 20260909a: trg_zz_fact_vao_boc_tach + trg_zz_vi_tri_vao_cot
        l.boc_tach = { ...(l.boc_tach ?? {}), [a.p_question]: a.p_answer, _cap_nhat: now() };
        // trg_vi_tri_vao_cot (schema.sql): ghi đè location_raw trừ khi đã có fact vi_tri nguồn admin/ctv (bậc cao hơn).
        if (a.p_question === "vi_tri" && String(a.p_answer).trim() && !db.t.listing_facts.some((f) => f.listing_id === l.id && f.question === "vi_tri" && /^(admin|ctv)/i.test(String(f.source ?? "")) && f.answer !== a.p_answer)) l.location_raw = String(a.p_answer).trim();
        // 20261008a (SRS-5.1zzzs): tin căn hộ — fact du_an_ten (tên dự án khách nói) điền location_raw khi còn trống.
        if (a.p_question === "du_an_ten" && String(a.p_answer).trim() && l.property_type === "chung_cu" && !String(l.location_raw ?? "").trim()) l.location_raw = String(a.p_answer).trim();
        // 22/09/2026: DB gọt price_raw qua `chuan_hoa_gia_raw` ("7 tỷ 5 nha em" → "7 tỷ 5"); mock giữ đúng thế
        // để bộ đo giọng / e2e không thấy một 🤖 mà production không in.
        if (a.p_question === "gia") { l.price_raw = chuanHoaGiaRaw(a.p_answer); l.price_vnd = parseVnd(a.p_answer); }
        // 20260928d (FR-239 j): chuan_hoa_phuong — tên chữ gõ thường ("cầu kho") → "Phường Cầu Kho".
        // 20261009b: chỉ tên chuẩn mới đổ vào cột (trigger thật: v_ward null thì cột giữ nguyên); chữ lạ → sổ lỗi (trg_listing_facts_soat_phuong).
        if (a.p_question === "phuong") {
          const w = chuanHoaPhuong(a.p_answer);
          if (w) l.ward = w;
          else db.insert("bot_errors", { source: "fact phuong khong chuan", detail: `${l.id}: "${a.p_answer}" (${a.p_source ?? "?"})`, at: now() });
        }
        // Trigger loại BĐS (FR-150/164): fact loai_bds đổi cột khi tin còn "chua_ro" (bắn thật 23/09: lô 1 thành đất).
        // 20261007b (SRS-5.1zzzc): chép `guess_property_type_answer` — nhận MÃ enum AI ghi ("nha_cap4") lẫn chữ người, và đổi cột
        // cả khi tin đã có loại (trigger thật chỉ so bậc nguồn; bản mock cũ chỉ đổi khi "chua_ro" nên không thấy lỗi mã).
        if (a.p_question === "loai_bds") {
          const kdL = String(a.p_answer).replace(/đ/g, "d").replace(/Đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
          const MA = ["chung_cu", "nha_pho", "nha_cap4", "dat", "biet_thu", "phong_tro", "mat_bang", "toa_nha", "dat_nong_nghiep", "dat_kinh_doanh", "kho_xuong"];
          const w = (re) => new RegExp(`(?<![a-z0-9_])(?:${re})(?![a-z0-9_])`).test(kdL);
          const ptL = MA.includes(kdL) ? kdL
            : w("kho|xuong") || /nha kho|kho bai/.test(kdL) ? "kho_xuong"
            : /nong nghiep|dat vuon|dat lua|dat ray/.test(kdL) || w("cln") ? "dat_nong_nghiep"
            : w("skc|tmd") || /dat thuong mai|dat san xuat|dat kinh doanh/.test(kdL) ? "dat_kinh_doanh"
            : w("chdv") || /dich vu|khach san|toa nha|building|nha nghi/.test(kdL) ? "toa_nha"
            : w("tro|phong tro|nha tro|day tro") ? "phong_tro"
            : /biet thu|villa/.test(kdL) || w("bt") ? "biet_thu"
            : /mat bang/.test(kdL) || w("mb") ? "mat_bang"
            : /chung cu|can ho|canho|penthouse|duplex|officetel/.test(kdL) || w("cc|ch") ? "chung_cu"
            : /cap 4|cap bon/.test(kdL) || w("c4") ? "nha_cap4"
            : w("dat") || /dat nen|lo dat|nen dat/.test(kdL) ? "dat"
            : /nha pho/.test(kdL) || w("nha|np|pho") ? "nha_pho" : null;
          if (ptL) l.property_type = ptL;
        }
        // 20260915d listing_facts_sync_deal: đổi loại giao dịch, tính lại giá từ fact giá gần nhất.
        if (a.p_question === "loai_giao_dich" && (a.p_answer === "ban" || a.p_answer === "cho_thue")) {
          l.deal = a.p_answer;
          const g = db.t.listing_facts.filter((f) => f.listing_id === l.id && f.question === "gia").pop();
          if (g) { l.price_raw = chuanHoaGiaRaw(g.answer); l.price_vnd = parseVnd(g.answer); }
        }
        if (a.p_question === "gap") {
          const kd = String(a.p_answer).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
          l.gap = /\b(khong|ko|k|chua|chang)\s*(can\s*)?((ban|cho thue|ra hang|ra|di)\s*)?(gap|voi)\b|duoc gia thi thoi|khong voi|tu tu/.test(kd) ? false : /\bgap\b|can tien|\bvoi\b/.test(kd) ? true : l.gap;
        }
        if (a.p_question === "dien_tich" || a.p_question === "dien_tich_dat") {
          // 22/09: boc_thong_so thật đọc cả "ngang 4m dài 20m" — mock từng parseFloat cả câu → NaN.
          const m = /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/.exec(a.p_answer) || /(?:ngang|mt)\s*(\d+(?:[.,]\d+)?)\s*m?\s*(?:dài|dai|dọc|doc)\s*(\d+(?:[.,]\d+)?)/i.exec(String(a.p_answer));
          l.area_m2 = m ? parseFloat(m[1].replace(",", ".")) * parseFloat(m[2].replace(",", ".")) : parseFloat(String(a.p_answer).replace(",", "."));
          if (m) l.frontage_m = parseFloat(m[1].replace(",", "."));
        }
        if (a.p_question === "so_phong_ngu") l.bedrooms = parseInt(a.p_answer, 10);
        // 20260922c: fact so_wc → cột bathrooms (kịch bản C: "3pn 2wc" từng để bathrooms trống).
        if (a.p_question === "so_wc") { const w = parseInt(a.p_answer, 10); if (w >= 1 && w <= 20) l.bathrooms = w; }
        // 20260922d: doanh_thu → rent_income_vnd (tin bán).
        if (a.p_question === "doanh_thu" && l.deal !== "cho_thue") { const v = parseVnd(a.p_answer); if (v != null && v >= 1e6 && v <= 1e10) l.rent_income_vnd = v; }
        if (a.p_question === "no_hau") { const r = /(\d+(?:\.\d+)?)/.exec(String(a.p_answer)); if (r) l.rear_width_m = parseFloat(r[1]); }
        // 20261012a: fact chieu_dai chỉ điền length_m; có ngang thì DB (trigger listings) nhân ra diện tích.
        if (a.p_question === "chieu_dai") { const r = /(\d+(?:[.,]\d+)?)/.exec(String(a.p_answer)); const v = r ? parseFloat(r[1].replace(",", ".")) : null; if (v != null && v >= 3 && v <= 150 && l.length_m == null) { l.length_m = v; if (l.frontage_m != null && l.area_m2 == null) l.area_m2 = Math.round(l.frontage_m * v * 10) / 10; } }
        if (a.p_question === "tang" && l.property_type === "chung_cu") { const t = parseInt(a.p_answer, 10); if (t >= 0 && t <= 80) l.floor = t; }
        // 20260920a: fact `nhan` là tên nhãn, không đi qua đồng bộ cột.
        if (a.p_question === "nhan") return { data: null, error: null };
        // listing_facts_sync_cols + boc_thong_so (rút gọn): đủ để điểm FR-177 đo được.
        // 20/09/2026: đáp án mặt tiền dạng "ngang 4m dài 16m" (boc_thong_so thật đọc hai chiều) — mock từng parseFloat cả câu → NaN.
        if (a.p_question === "mat_tien") { const mt = /(?:ngang|mat tien|mặt tiền|mt)?\s*(\d+(?:[.,]\d+)?)/i.exec(String(a.p_answer)); if (mt) l.frontage_m = parseFloat(mt[1].replace(",", ".")); const dm = /(?:dài|dai|dọc|doc|x)\s*(\d+(?:[.,]\d+)?)/i.exec(String(a.p_answer)); if (dm) l.length_m = parseFloat(dm[1].replace(",", ".")); if (l.frontage_m != null && l.length_m != null && l.area_m2 == null) l.area_m2 = Math.round(l.frontage_m * l.length_m * 10) / 10; }
        // 20261012b: độ rộng chỉ nhận số đo (kèm m / mét, hoặc số trơn không có chữ đứng sau), cùng SQL listing_facts_sync_cols.
        if (a.p_question === "do_rong_hem") { const m = /(?:^|[^\d.,])(\d+(?:[.,]\d+)?)(?:\s*(?:m|mét|met)(?![\p{L}])|(?![\d.,])(?!\s*\p{L}))/u.exec(a.p_answer); if (m) l.alley_width_m = parseFloat(m[1].replace(",", ".")); if (/xe hơi|xe hoi/i.test(a.p_answer)) l.access_type = l.access_type ?? "hem_xe_hoi"; }
        // ─── SRS-5.1zzzv (08/10/2026, chủ dự án chat thử …hua2: "trên kia nói hẻm xe hơi xong xuống dưới nó hỏi hẻm xe hơi"):
        // các nhánh `listing_facts_sync_cols` (schema.sql) mà DB giả chưa chép — trang chat thử chạy trên DB giả nên ô AI đã ghi
        // không tới cột, bản nháp / điểm tin hỏi lại. Chép đúng nhánh thật; `bot/tests/mock-trigger-du.mjs` đỏ khi trigger có nhánh
        // mới mà ở đây chưa có.
        const kdF = String(a.p_answer ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
        const coKhong = /^(khong|ko|chua|chang|false)\b/.test(kdF) ? false : /^(co|true|da|roi)\b/.test(kdF) ? true : null; // doc_co_khong
        const soF = (() => { const m = /[0-9]+[.]?[0-9]*/.exec(String(a.p_answer ?? "").replace(/,/g, ".")); return m ? parseFloat(m[0]) : null; })();
        if (a.p_question === "loai_duong_vao") {
          const at = { "mat tien": "mat_tien", "hem xe tai": "hem_xe_tai", "hem xe hoi": "hem_xe_hoi", "hem xe may": "hem_xe_may", "trong hem": "hem" }[kdF];
          if (at) l.access_type = at;
        }
        if (["o_to_vao_nha", "hoan_cong", "thang_may", "can_goc"].includes(a.p_question) && coKhong !== null) {
          const cot = { o_to_vao_nha: "car_in_house", hoan_cong: "has_completion", thang_may: "has_elevator", can_goc: "corner_lot" }[a.p_question];
          if (l[cot] == null) l[cot] = coKhong;
        }
        if (a.p_question === "do_rong_duong" && soF != null && soF >= 1 && soF <= 40 && l.alley_width_m == null) { l.alley_width_m = soF; l.access_type = l.access_type ?? "mat_tien"; }
        if (a.p_question === "quy_hoach" && /(khong|ko|k co|k dinh)/.test(kdF) && l.planning_status == null) l.planning_status = "khong_quy_hoach";
        if (a.p_question === "nam_xay" && l.year_built == null) { const y = /(?:19|20)[0-9]{2}/.exec(kdF); if (y) l.year_built = parseInt(y[0], 10); }
        if (a.p_question === "noi_that" && l.furnishing == null) l.furnishing = /(full|day du|cao cap)/.test(kdF) ? "full" : /(khong|trong|ko)/.test(kdF) ? "khong" : /co ban/.test(kdF) ? "co_ban" : null;
        if (a.p_question === "cach_mat_tien" && soF != null && soF >= 1 && soF <= 2000 && l.distance_to_street_m == null) l.distance_to_street_m = soF;
        if (a.p_question === "dien_tich_tim_tuong" && l.property_type === "chung_cu" && soF != null && soF > 5 && soF < 5000) l.area_m2 = soF;
        if (a.p_question === "ket_cau") { const m = /(\d+)\s*(?:lầu|lau|tầng|tang|tấm|tam)/i.exec(a.p_answer); if (m) l.floors = parseInt(m[1], 10) + (/lầu|lau/i.test(a.p_answer) ? 1 : 0); const pn = /(\d+)\s*(?:phòng ngủ|phong ngu|pn)/i.exec(a.p_answer); if (pn) l.bedrooms = parseInt(pn[1], 10); }
        // 20260923a: câu phủ định ("chưa có sổ") đi trước mọi nhánh pháp lý — không ghi cột.
        if (a.p_question === "phap_ly") {
          const pk = String(a.p_answer ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
          if (/\b(chua|khong|ko|chang|dang cho|dang lam|chua ra)\s+(co\s+|ra\s+|lam\s+)?(so|shr|shc)\b/.test(pk)) { /* không có sổ */ }
          else if (/so hong rieng|\bshr\b|so rieng|so do rieng/.test(pk)) l.legal_status = "so_hong_rieng";
          else if (/so hong chung|\bshc\b|so chung/.test(pk)) l.legal_status = "so_hong_chung";
          else if (/so hong|so do|co so/.test(pk)) l.legal_status = "so_hong";
        }
        // 21/09/2026: trigger thật ghi `direction` từ fact `huong` (2–40 ký tự, khi cột trống) — 🤖 Đã lưu đọc cột này.
        if (a.p_question === "huong" && l.direction == null) { const h = String(a.p_answer ?? "").trim(); if (h.length >= 2 && h.length <= 40) l.direction = h; }
        db.quyetDinhDangTin(l);
        return { data: null, error: null };
      }
      case "diem_tin": {
        const l = db.t.listings.find((x) => x.id === a.p_listing_id);
        return { data: l ? db.diemTin(l) : null, error: null };
      }
      // FR-183 (20260909h): điểm người rao = TB diem_tin các tin đang rao × hệ số
      // quy mô NMG (+6%/căn ≤10, +4% 11–30, +1,5% >30), trần 100 — chép đúng hàm thật.
      case "diem_nguoi_ban": {
        const s = db.t.sellers.find((x) => x.id === a.p_seller_id);
        if (!s) return { data: null, error: null };
        const ls = db.t.listings.filter((l) => l.seller_id === s.id && ["dang_ban", "dang_quan_tam", "cho_thong_tin"].includes(l.status));
        if (!ls.length) return { data: { diem: 0, diem_tb: 0, so_tin: 0, he_so: 1 }, error: null };
        const tb = ls.reduce((t, l) => t + db.diemTin(l).diem, 0) / ls.length;
        const n = ls.length;
        const heSo = s.seller_type === "nmg" ? 1 + 0.06 * Math.min(n, 10) + 0.04 * Math.max(Math.min(n, 30) - 10, 0) + 0.015 * Math.max(n - 30, 0) : 1;
        return { data: { diem: Math.min(100, Math.round(tb * heSo)), diem_tb: Math.round(tb * 10) / 10, so_tin: n, he_so: heSo }, error: null };
      }
      case "them_nhan_tin": { // FR-211
        const l = db.t.listings.find((x) => x.id === a.p_listing_id); if (!l) return { data: 0, error: null };
        const cu = l.nhan ?? []; const moi = (a.p_nhan ?? []).filter((n) => n && !cu.includes(n));
        l.nhan = [...cu, ...moi]; return { data: moi.length, error: null };
      }
      case "ghi_boc_tach": {
        // 20260909a: gộp, bỏ null, đóng dấu _cap_nhat
        const l = db.t.listings.find((x) => x.id === a.p_listing_id); if (!l) return { data: null, error: null };
        const sach = Object.fromEntries(Object.entries(a.p ?? {}).filter(([, v]) => v !== null && v !== undefined));
        l.boc_tach = { ...(l.boc_tach ?? {}), ...sach, _cap_nhat: now() };
        return { data: null, error: null };
      }
      case "guess_property_type_answer": { const t = boDauMock(String(a.p_text)); return { data: /kho|xuong/.test(t) ? "kho_xuong" : /nong nghiep|dat vuon/.test(t) ? "dat_nong_nghiep" : /skc|tmd|thuong mai/.test(t) ? "dat_kinh_doanh" : /dich vu|khach san|toa nha/.test(t) ? "toa_nha" : /nha pho|\bnp\b/.test(t) ? "nha_pho" : /chung cu|can ho|canho|\bcc\b|\bch\b/.test(t) ? "chung_cu" : /\bnha\b/.test(t) && t.split(/\s+/).length >= 4 ? "nha_pho" : /\bdat\b/.test(t) ? "dat" : null, error: null }; }
      case "mark_listing_interest": {
        // v48 / 20260904f (FR-108): overload có p_buyer_id ghi thêm `interests`
        // (PK buyer_id+listing_id — chèn trùng thì bỏ qua).
        let n = 0;
        for (const l of db.t.listings) if (a.p_codes.includes(l.code)) {
          if (["dang_ban", "dang_quan_tam"].includes(l.status)) { l.status = "dang_quan_tam"; n++; }
          if (a.p_buyer_id && !db.t.interests.some((i) => i.buyer_id === a.p_buyer_id && i.listing_id === l.id)) db.insert("interests", { buyer_id: a.p_buyer_id, listing_id: l.id });
        }
        return { data: n, error: null };
      }
      case "ghi_danh_gia": { db.insert("ratings", { buyer_id: a.p_buyer_id, listing_id: a.p_listing_id, stars: a.p_stars, note: a.p_note }); return { data: null, error: null }; }
      // FR-195: kho thông tin dự án lượm từ chat (20260910f).
      case "ghi_fact_du_an": {
        const t = db.rows("project_facts");
        if (!a.p_project_id || !String(a.p_gia_tri ?? "").trim()) return { data: null, error: null };
        if (t.some((x) => x.project_id === a.p_project_id && x.khoa === a.p_khoa && x.gia_tri === a.p_gia_tri)) return { data: null, error: null };
        const r = { id: t.length + 1, project_id: a.p_project_id, khoa: a.p_khoa, gia_tri: String(a.p_gia_tri).trim(), nguon: a.p_nguon ?? "seller_chat", listing_id: a.p_listing_id ?? null, conversation_id: a.p_conversation_id ?? null, trang_thai: "cho_duyet", created_at: new Date().toISOString() };
        t.push(r);
        return { data: r.id, error: null };
      }
      case "can_du_an": { // SRS-5.1zzj: kho căn dự án cho khối CĂN TRONG DỰ ÁN
        const ds = (db.t.du_an_can ?? []).filter((c) => c.project_id === a.p_project_id && c.trang_thai !== "loai")
          .sort((x, y) => x.ma_can.length - y.ma_can.length || x.ma_can.localeCompare(y.ma_can)).slice(0, a.p_gioi_han ?? 60);
        return { data: ds.map((c) => ({ ma_can: c.ma_can, mau_nha: c.mau_nha ?? null, dien_tich_m2: c.dien_tich_m2 ?? null, dien_tich_dat_m2: c.dien_tich_dat_m2 ?? null, gia_raw: c.gia_raw ?? null, huong: c.huong ?? null, tang: c.tang ?? null, thuoc_tinh: c.thuoc_tinh ?? {}, trang_thai: c.trang_thai ?? "cho_duyet" })), error: null };
      }
      case "match_projects": { // 22/09: khớp tên dự án trong kho mock (bỏ dấu, chứa tên) — e2e nhiều căn có dự án.
        const t = boDauMock(String(a.p_text ?? "")); const ds = (db.t.projects ?? []).filter((p) => p.name && t.includes(boDauMock(String(p.name))));
        return { data: ds.map((p) => ({ id: p.id, name: p.name, developer: p.developer ?? null, district: p.district ?? null, location_raw: p.location_raw ?? null, amenities: p.amenities ?? null, description: p.description ?? null, status_text: p.status_text ?? null })), error: null }; }
      case "nguoi_noi_bo": {
        // 20260903a (FR-173 d): CTV đang hoạt động trước, rồi admin; người lạ → null
        const c = db.t.ctvs.find((x) => x.active !== false && x.zalo_user_id === a.p_zalo);
        if (c) return { data: { vai: "ctv", id: c.id, name: c.name }, error: null };
        const ad = db.t.admins.find((x) => x.zalo_user_id === a.p_zalo);
        if (ad) return { data: { vai: "admin", id: null, name: ad.email ?? "admin" }, error: null };
        return { data: null, error: null };
      }
    }
    return { data: null, error: { message: `rpc ${this.name} chưa giả lập` } };
  }
  chieu(r) {
    if (!this.cols || !r || !Array.isArray(r.data)) return r;
    return { ...r, data: r.data.map((d) => (d && typeof d === "object" ? Object.fromEntries(Object.entries(d).filter(([k]) => this.cols.includes(k))) : d)) };
  }
  then(res, rej) { try { return Promise.resolve(this.run()).then((r) => this.chieu(r)).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } }
}

export function createClient() {
  const db = globalThis.__db;
  // FR-185: Storage giả — `upload` cất byte vào db.storage, `remove` gỡ. Đặt
  // `globalThis.__storageHong = true` để dựng cảnh kho hỏng (chat-reply phải rơi
  // về fact URL tạm + ghi sổ lỗi, không nuốt ảnh).
  const storage = {
    from: (bucket) => ({
      upload: async (path, bytes, opts) => {
        db.log.push({ storage: "upload", bucket, path });
        if (globalThis.__storageHong) return { data: null, error: { message: "storage hỏng (giả)" } };
        db.storage.push({ bucket, path, size: bytes?.byteLength ?? 0, contentType: opts?.contentType ?? null });
        return { data: { path }, error: null };
      },
      remove: async (paths) => { db.storage = db.storage.filter((f) => !(f.bucket === bucket && paths.includes(f.path))); return { data: null, error: null }; },
    }),
  };
  return { from: (t) => new Builder(db, t), rpc: (n, a) => new RpcCall(db, n, a), storage };
}
