// tim-moc.ts — tìm tin gần MỐC khách muốn ở gần (11/09/2026).
//
// Ba nguồn mốc, rẻ trước đắt sau:
//   1. `tin_gan_moc` (SQL): tien_ich OSM (nạp 3 km quanh mỗi tin) + projects đã
//      có toạ độ, khớp loại và/hoặc tên;
//   2. có TÊN mà kho mình không có mốc nào khớp (`co_moc` = false) → tra
//      Nominatim đúng tên đó, nhớ vào tien_ich cho lần sau, rồi đo lại.
// Khoảng cách luôn do SQL tính — model không bao giờ tự nói số mét.
import { type GanTienIch, kdTen, TEN_LOAI } from "./extraction/tien-ich.ts";
import { trongVung } from "./geocode.ts";

const LOAI_OSM = new Set(["benh_vien", "truong_hoc", "cho", "sieu_thi", "cong_vien"]);

export type TinGan = { code: string; moc: string; khoang_cach_m: number };
type KqRpc = { data: unknown; error: { message: string } | null };
type Db = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<KqRpc>;
  // deno-lint-ignore no-explicit-any
  from: (t: string) => any;
};

const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

/** Tra một địa danh trong TP.HCM. Chặn kết quả mức thành phố/tỉnh (câu quá rộng). */
// 25/09/2026 (FR-227): gọi thẳng từ edge thì Nominatim trả "Access denied" — nhờ DB gọi qua RPC `tra_nominatim`.
export async function traDiaDanh(db: Db, cum: string): Promise<{ osm_id: string; ten: string; lat: number; lng: number } | null> {
  for (const q of [`${cum}, Thành phố Hồ Chí Minh`, `${boDau(cum)}, Ho Chi Minh City`]) {
    try {
      const { data, error } = await db.rpc("tra_nominatim", { p_q: q, p_cho_giay: 4 });
      if (error) continue;
      const r = Array.isArray(data) ? data[0] : null;
      if (!r || /^(city|state|province|country|municipality|region)$/.test(String(r.addresstype ?? r.type ?? ""))) continue;
      const lat = Number(r.lat), lng = Number(r.lon);
      if (!trongVung(lat, lng)) continue;
      return { osm_id: `${r.osm_type ?? "place"}/${r.osm_id ?? r.place_id}`, ten: String(r.name || cum), lat, lng };
    } catch {
      // mạng chậm / bị chặn: thử câu sau, hết thì coi như không tìm được mốc
    }
  }
  return null;
}

/**
 * Tin đang lên kệ gần mốc `gan`. `loi` = RPC hỏng (nơi gọi ghi sổ, bỏ lọc);
 * `khongThayMoc` = có tên nhưng không định vị được nơi đó (bot hỏi lại khách).
 */
export async function timTinGanMoc(
  db: Db,
  gan: GanTienIch,
  deal: string | null,
): Promise<{ tin: TinGan[]; loi?: string; khongThayMoc?: boolean }> {
  const goi = (lat: number | null = null, lng: number | null = null, ten: string | null = null) =>
    db.rpc("tin_gan_moc", {
      p_loai: gan.loai, p_ten_re: gan.ten_re, p_lat: lat, p_lng: lng, p_ten: ten,
      p_ban_kinh_m: gan.m, p_deal: deal,
    });
  const { data, error } = await goi();
  if (error) return { tin: [], loi: error.message };
  const tin = (data ?? []) as TinGan[];
  if (tin.length || !gan.ten) return { tin };

  // Có tên mà không ra căn nào: hoặc mốc có nhưng không căn nào gần (xong),
  // hoặc kho mình chưa biết nơi đó → tra đúng tên. `co_moc` hỏng thì thôi,
  // đừng đốt Nominatim trên một câu trả lời không chắc.
  const { data: co, error: coErr } = await db.rpc("co_moc", { p_loai: gan.loai, p_ten_re: gan.ten_re });
  if (coErr || co !== false) return { tin };
  const diem = (LOAI_OSM.has(gan.loai) ? await traDiaDanh(db, `${TEN_LOAI[gan.loai]} ${gan.ten}`) : null) ??
    await traDiaDanh(db, gan.ten);
  if (!diem) return { tin, khongThayMoc: true };
  // Nhớ cho lần sau: ten_kd gồm cả tên OSM lẫn chữ khách gõ, để `co_moc` lần
  // sau khớp ngay. Đã có điểm OSM đó (osm_id trùng) thì giữ nguyên dòng cũ.
  await db.from("tien_ich").upsert({
    osm_id: diem.osm_id,
    loai: LOAI_OSM.has(gan.loai) ? gan.loai : "dia_diem",
    ten: diem.ten,
    ten_kd: kdTen(`${diem.ten} ${gan.ten}`),
    lat: diem.lat,
    lng: diem.lng,
  }, { onConflict: "osm_id", ignoreDuplicates: true });
  const lai = await goi(diem.lat, diem.lng, diem.ten);
  if (lai.error) return { tin: [], loi: lai.error.message };
  return { tin: (lai.data ?? []) as TinGan[] };
}

const LOAI_HOI = ["benh_vien", "truong_hoc", "cho", "sieu_thi", "cong_vien"] as const;
const lamTron = (m: number) =>
  m >= 1000 ? `${String(Math.round(m / 100) / 10).replace(".", ",")} km` : `${Math.max(50, Math.round(m / 50) * 50)} m`;
function khoangCachM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cấp trường đọc từ TÊN (OSM chỉ có loại "trường học" chung). */
export const TEN_CAP: Record<string, string> = {
  mam_non: "mầm non", tieu_hoc: "tiểu học", thcs: "THCS", thpt: "THPT", lien_cap: "liên cấp / phổ thông", dai_hoc: "đại học / cao đẳng",
};
/**
 * Cấp của một trường theo tên (02/10/2026, bắn thật thu-trl-07: khách hỏi trường TIỂU HỌC, bot nói "Trường tiểu học gần nhất là
 * Trường Trung học Cơ sở Lý Phong" — công cụ chỉ trả "trường học" chung, model tự gán cấp). null = không đọc được cấp.
 */
export function capTruong(ten: string): string | null {
  const k = kdTen(ten);
  if (/\b(mam non|mau giao|nha tre)\b/.test(k)) return "mam_non";
  if (/\b(tieu hoc|th)\b/.test(k) && !/\b(trung hoc|thcs|thpt)\b/.test(k)) return "tieu_hoc";
  if (/\b(trung hoc co so|thcs)\b/.test(k)) return "thcs";
  if (/\b(trung hoc pho thong|thpt)\b/.test(k)) return "thpt";
  if (/\b(dai hoc|cao dang|hoc vien|du bi dai hoc)\b/.test(k)) return "dai_hoc";
  if (/\b(pho thong|lien cap|nhieu cap)\b/.test(k)) return "lien_cap";
  return null;
}

/**
 * Các cách gọi một khu vực để thử định vị, đầy đủ trước (SRS-5.1y, bắn thật 02/10): model gửi "chợ An Đông, Quận 5" —
 * cả chuỗi không khớp mốc nào trong `tien_ich` (tên lưu "cho an dong") và Nominatim cũng hụt (sau 07/2025 không còn
 * "Quận 5"). Thêm bản bỏ ĐUÔI hành chính (", quận 5", " p12", " tp hcm"…). Đuôi chỉ cắt khi đứng SAU tên: "Phường An Đông"
 * một mình thì giữ nguyên.
 */
export function ungVienKhuVuc(kv: string): string[] {
  const goc = kv.trim().replace(/\s+/g, " ");
  const ra = [goc];
  const kd = boDau(goc).toLowerCase();
  // Sau dấu phẩy: mọi chữ hành chính. Không có phẩy: "phường" CHỈ khi kèm số — tên đường "Nguyễn Tri Phương" không phải đuôi.
  const m = /\s*,\s*(?:quan|q\b|phuong|p\b|huyen|xa|thi xa|tp|thanh pho|tphcm|hcm|sai gon|saigon)/.exec(kd) ??
    /\s+(?:(?:quan|q|phuong|p)\.?\s*\d+\b|(?:quan|q|huyen|tp|thanh pho)\.?\s+[a-z]|tphcm\b|hcm\b|sai gon\b|saigon\b)/.exec(kd);
  if (m && m.index > 0) {
    const cat = goc.slice(0, m.index).replace(/[,\s]+$/, "").trim();
    if (cat.length >= 3 && cat !== goc) ra.push(cat);
  }
  return ra;
}

/**
 * Khu vực chỉ là CẢ một quận / huyện / thành phố ("Quận 5", "q5", "huyện Bình Chánh", "TP Thủ Đức") — quá rộng để đo
 * khoảng cách. 02/10/2026 (bắn D4 "mua nhà q5…|gần đó có công viên không"): trợ lý truyền "Quận 5", bước so tên `tien_ich`
 * lấy "Trung tâm Giáo dục thường xuyên Quận 5" (tên chứa chữ "Quận 5") làm tâm rồi kể công viên quanh trường đó như thể
 * quanh nhà khách. Phường thì nhỏ (≈1–2 km) nên vẫn định vị như cũ.
 */
export function laKhuVucQuaRong(kv: string): boolean {
  const kd = boDau(kv).toLowerCase().replace(/[.,]/g, " ")
    .replace(/\s+(?:tp\s*)?(?:hcm|ho chi minh|sai gon|saigon)\s*$/, "").replace(/\s+/g, " ").trim();
  // Chữ tắt (q, h, tp, tx) phải kèm SỐ hoặc dấu cách — không thì "Quang Trung", "Hùng Vương" thành "quận/huyện".
  return /^(?:(?:quan|huyen|thanh pho|thi xa) (?:\d{1,2}|[a-z]+(?: [a-z]+){0,2})|(?:q|h|tp|tx) ?\d{1,2}|(?:tp|tx) [a-z]+(?: [a-z]+){0,2})$/.test(kd);
}

/**
 * Công cụ ĐỌC của trợ lý (SRS-5.1y, 02/10/2026): tiện ích quanh một khu vực khách nói. Định vị khu vực theo thứ tự rẻ
 * trước: mã căn trong kho (toạ độ đã geocode) → mốc đã có trong `tien_ich` trùng tên → Nominatim (qua RPC, như
 * `timTinGanMoc`). Rồi đọc `tien_ich` trong hộp quanh điểm đó, đo khoảng cách bằng code — model không bao giờ tự nói số mét.
 * Trả CHỮ cho model đọc; không định vị được / không có dữ liệu thì nói rõ để model nói thật, không kể tên bịa.
 */
export async function timTienIchQuanh(
  db: Db,
  khuVuc: string,
  loai: string,
  banKinhM = 1000,
  cap: string | null = null,
): Promise<string> {
  const kv = khuVuc.trim().slice(0, 120);
  if (!kv) return "Thiếu khu vực — hỏi khách khu vực cụ thể (đường, phường, quận).";
  if (laKhuVucQuaRong(kv)) {
    return `"${kv}" là cả một quận/huyện — quá rộng để nói gần hay xa. Hỏi khách khu cụ thể (đường, phường, chợ, trường, ` +
      "hoặc mã căn) rồi tra lại; KHÔNG chọn đại một điểm trong quận, KHÔNG kể tên tiện ích nào.";
  }
  const bk = Math.min(3000, Math.max(300, Math.round(Number(banKinhM) || 1000)));
  let diem: { ten: string; lat: number; lng: number } | null = null;
  const ma = /\b([A-Z]{2,5}(?:-[A-Z0-9]{1,12}){1,4})\b/i.exec(kv)?.[1]?.toUpperCase();
  if (ma) {
    const { data } = await db.from("listings").select("code, location_raw, ward, lat, lng").ilike("code", ma).limit(1).maybeSingle();
    const l = data as { code: string; location_raw?: string | null; ward?: string | null; lat?: number | null; lng?: number | null } | null;
    if (l?.lat != null && l?.lng != null) diem = { ten: `căn #${l.code}`, lat: Number(l.lat), lng: Number(l.lng) };
  }
  const ungVien = ungVienKhuVuc(kv);
  for (const uv of ungVien) {
    if (diem) break;
    const kd = kdTen(uv);
    if (kd.length < 4) continue;
    // Nhiều mốc cùng chứa chuỗi ("cho an dong", "cho an dong 2"…) → lấy tên NGẮN nhất, gần chữ khách nhất.
    const { data } = await db.from("tien_ich").select("ten, ten_kd, lat, lng").ilike("ten_kd", `%${kd}%`).limit(10);
    const t = ((data ?? []) as Array<{ ten: string; ten_kd: string; lat: number; lng: number }>)
      .sort((a, b) => a.ten_kd.length - b.ten_kd.length)[0];
    if (t) diem = { ten: t.ten, lat: Number(t.lat), lng: Number(t.lng) };
  }
  for (const uv of ungVien) {
    if (diem) break;
    diem = await traDiaDanh(db, uv);
  }
  if (!diem) return `Không định vị được "${kv}" — hỏi lại khách khu đó ở đường nào / quận nào, KHÔNG đoán.`;
  const dLat = bk / 111320, dLng = bk / (111320 * Math.cos(diem.lat * Math.PI / 180));
  const loaiHoi = (LOAI_HOI as readonly string[]).includes(loai) ? [loai] : [...LOAI_HOI];
  const { data, error } = await db.from("tien_ich").select("loai, ten, lat, lng")
    .in("loai", loaiHoi)
    .gte("lat", diem.lat - dLat).lte("lat", diem.lat + dLat)
    .gte("lng", diem.lng - dLng).lte("lng", diem.lng + dLng)
    .limit(400);
  if (error) throw new Error(error.message);
  const tatCa = ((data ?? []) as Array<{ loai: string; ten: string; lat: number; lng: number }>)
    .map((t) => ({ ...t, m: khoangCachM(diem!, { lat: Number(t.lat), lng: Number(t.lng) }), cap: t.loai === "truong_hoc" ? capTruong(t.ten) : null }))
    .filter((t) => t.m <= bk)
    .sort((a, b) => a.m - b.m);
  const capHoi = cap && TEN_CAP[cap] && loaiHoi.length === 1 && loaiHoi[0] === "truong_hoc" ? cap : null;
  const ds = capHoi ? tatCa.filter((t) => t.cap === capHoi) : tatCa;
  // Mỗi dòng trường ghi CẤP đọc từ tên — model không phải (và không được) tự gán cấp.
  const tenLoai = (l: string, c?: string | null) =>
    l === "truong_hoc" ? `trường học (${c ? TEN_CAP[c] : "không rõ cấp"})` : TEN_LOAI[l as keyof typeof TEN_LOAI] ?? l;
  const dau = `Quanh ${diem.ten} (bán kính ~${lamTron(bk)}, đường chim bay, ước tính - nói "khoảng"):`;
  const dong = (arr: typeof tatCa) => arr.map((t) => `- ${tenLoai(t.loai, t.cap)}: ${t.ten} ~${lamTron(t.m)}`).join("\n");
  if (!ds.length && capHoi && tatCa.length) {
    // Có trường nhưng không trường nào đúng cấp khách hỏi → nói thật, kèm các trường gần nhất CÓ GHI CẤP để model không
    // gọi trường THCS là "trường tiểu học".
    return `${dau} KHÔNG có trường ${TEN_CAP[capHoi]} nào trong dữ liệu quanh đây - nói thật là em chưa thấy trường ` +
      `${TEN_CAP[capHoi]} nào trong bán kính này, KHÔNG gọi trường cấp khác là ${TEN_CAP[capHoi]}. Các trường gần nhất (đúng cấp ghi trong ngoặc):\n` +
      dong(tatCa.slice(0, 5));
  }
  if (!ds.length) {
    return `${dau} kho dữ liệu bên em CHƯA có ${loaiHoi.length === 1 ? TEN_LOAI[loaiHoi[0] as keyof typeof TEN_LOAI] ?? loaiHoi[0] : "tiện ích"} nào ở đây ` +
      "(kho chỉ nạp quanh các căn đang rao) - nói thật là em chưa có dữ liệu, KHÔNG kể tên nào.";
  }
  const chon = loaiHoi.length === 1
    ? ds.slice(0, 8)
    : loaiHoi.flatMap((l) => ds.filter((t) => t.loai === l).slice(0, 3));
  return `${dau}${loaiHoi.includes("truong_hoc") ? " (cấp trường ghi trong ngoặc, nói đúng cấp đó)" : ""}\n` + dong(chon);
}
