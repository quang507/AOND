// phan-loai-duong.mjs — một tên đường OSM → dòng từ điển `duong` (loại + hẻm + đường mẹ). THUẦN, không mạng.
//
// Trước 30/09/2026 `nap-duong.mjs` BỎ hẳn đường số ("Số 7", "N1") và mọi hẻm: đường số trùng khắp thành phố, hẻm
// "tên đường mẹ đã có". Chủ dự án 30/09 (khách gõ "137/28 đường số 59 phường an hội tây"): "còn mấy hẻm khác còn
// nhiều / nhỏ và nhỏ hơn nữa … vector đường lớn … kết hợp với vị trí nữa, để biết đường nào gần đường nào". Có TOẠ ĐỘ
// và PHƯỜNG đi kèm thì đường số không còn mơ hồ ("Đường số 59" ở An Hội Tây là một con đường), và hẻm có tên trên
// OSM ("Hẻm 137 Lê Văn Sỹ") là thứ khách nói thật. Nay giữ cả ba loại:
//   · duong — tên riêng ("Lê Văn Sỹ", "3 Tháng 2", "Đường tỉnh 824");
//   · so    — đường số / mã ("Đường số 59", "Đường N1");
//   · hem   — hẻm / ngõ / kiệt ("Hẻm 137 Lê Văn Sỹ" → so_hem "137", duong_me "Lê Văn Sỹ"; "Hẻm 137/28" → so_hem "137/28").
// Vẫn bỏ: cầu, lối, nhánh, tên < 3 hoặc > 60 ký tự, tên không có chữ.

/** @returns {{ ten: string, loai: "duong" | "so" | "hem", duong_me: string | null, so_hem: string | null } | null} */
export function phanLoaiDuong(tho) {
  let t = String(tho ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!t || t.length > 80) return null;
  if (/^(?:Cầu|Lối|Nhánh)(?![\p{L}])/iu.test(t)) return null;

  // Hẻm / ngõ / kiệt / ngách: "Hẻm 137 Lê Văn Sỹ", "Hẻm 137/28", "Hẻm số 12 Đường số 3", "Ngõ 5".
  const hem = /^(?:Hẻm|Hem|Hẽm|Ngõ|Ngách|Kiệt|HXH|HXM)(?![\p{L}])\s*(?:số\s*)?(\d{1,4}[A-Za-z]?(?:\s*\/\s*\d{1,4}[A-Za-z]?)*)?\s*(.*)$/iu.exec(t);
  if (hem) {
    const soHem = hem[1] ? hem[1].replace(/\s+/g, "").toUpperCase() : null;
    const me = (hem[2] ?? "").replace(/^[,\-–\s]+/, "").replace(/^(?:Đường|Phố)\s+(?=[A-ZÀ-Ỹ])/u, "").trim();
    const duongMe = me && /[\p{L}\d]/u.test(me) ? chuanSo(me) ?? me : null;
    if (!soHem && !duongMe) return null;
    const ten = ["Hẻm", soHem, duongMe].filter(Boolean).join(" ");
    return ten.length >= 3 && ten.length <= 80 ? { ten, loai: "hem", duong_me: duongMe, so_hem: soHem } : null;
  }

  // Đường số / mã: "Số 7", "Đường số 7", "Đường 10", "N1", "Đường D2", "TL10".
  const so = chuanSo(t);
  if (so) return { ten: so, loai: "so", duong_me: null, so_hem: null };

  // Tên riêng: "Đường Lý Thường Kiệt" → "Lý Thường Kiệt"; giữ "Đường tỉnh 824" (chữ thường sau tiền tố là loại đường).
  t = t.replace(/^(?:Đường|Phố)\s+(?=[A-ZÀ-Ỹ0-9])/u, "");
  if (/(?:^|\s)Hẻm(?![\p{L}])/iu.test(t)) return null;
  if (!/[\p{L}]{2}/u.test(t)) return null;
  if (t.length < 3 || t.length > 60) return null;
  return { ten: t, loai: "duong", duong_me: null, so_hem: null };
}

/** "Số 7" / "Đường số 7" / "Đường 10" → "Đường số 7"; "N1" / "Đường D2" / "TL10" → "Đường N1". Không phải → null. */
function chuanSo(t) {
  const s = String(t).trim();
  let m = /^(?:Đường\s+)?(?:số|so)?\s*(\d{1,4}[A-Za-z]?)$/iu.exec(s);
  if (m) return `Đường số ${m[1].toUpperCase()}`;
  m = /^(?:Đường\s+)?([A-Z]{1,2}\d{1,3}[A-Z]?)$/u.exec(s);
  if (m) return `Đường ${m[1]}`;
  return null;
}

/**
 * Gom các đoạn (way) cùng tên trong một phường → một dòng, toạ độ = trung bình tâm các đoạn. Dòng CSV Overpass
 * `name \t type \t lat \t lon \t id` (out center). Dòng type=area đếm số đa giác phường theo ID.
 * SRS-5.1zzzzzzz187: trước đây đếm theo TÊN (`Set` của name) nên hai đa giác CÙNG TÊN ở hai tỉnh ("Phường Tân Phú" TP.HCM và Đồng Nai,
 * "Phường Long Bình" Thủ Đức và Biên Hòa) gộp thành một, phép chặn `soArea !== 1` không bao giờ kêu. Thiếu cột id (CSV cũ) thì đếm theo tên.
 */
export function gomDuong(csv) {
  const gom = new Map(); const area = new Set();
  for (const dong of String(csv ?? "").split("\n")) {
    const [name, type, lat, lon, id] = dong.split("\t");
    if (type === "area") { area.add(id ? `#${id}` : name); continue; }
    const d = phanLoaiDuong(name); if (!d) continue;
    const g = gom.get(d.ten) ?? { ...d, lat: 0, lng: 0, n: 0 };
    const la = Number(lat), lo = Number(lon);
    if (Number.isFinite(la) && Number.isFinite(lo) && la && lo) { g.lat += la; g.lng += lo; g.n++; }
    gom.set(d.ten, g);
  }
  const dong = [...gom.values()].map(({ n, lat, lng, ...d }) => ({
    ...d, lat: n ? Math.round((lat / n) * 1e6) / 1e6 : null, lng: n ? Math.round((lng / n) * 1e6) / 1e6 : null,
  }));
  return { dong, soArea: area.size };
}

/**
 * Hai đa giác cùng tên: chọn relation có tâm gần tâm phường trong `wards` (cùng nguồn OSM nên lệch < vài trăm m).
 * `csv` = dòng `id \t lat \t lon` của các relation cùng tên (`out center`). Đúng MỘT relation trong `toiDaKm` → id; còn lại → null (soi tay).
 */
export function chonRelationGanTam(csv, lat, lng, toiDaKm = 3) {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const gan = [];
  for (const dong of String(csv ?? "").split("\n")) {
    const [id, la, lo] = dong.split("\t");
    if (!id || !Number.isFinite(Number(la)) || !Number.isFinite(Number(lo))) continue;
    if (khoangCachKm(Number(la), Number(lo), Number(lat), Number(lng)) <= toiDaKm) gan.push(id);
  }
  return gan.length === 1 ? gan[0] : null;
}

// SRS-5.1zzzzzzz186: khoảng cách (km) hai điểm trên mặt cầu.
export function khoangCachKm(la1, lo1, la2, lo2) {
  const r = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * Bỏ dòng có toạ độ cách tâm phường quá `toiDaKm` — đa giác trùng tên ở tỉnh khác kéo theo đường của nơi đó (lượt 08/10: 19 dòng
 * đường Tân Phú, Đồng Nai nằm dưới "Phường Tân Phú" TP.HCM, cách tâm ~100 km). Không có tâm phường hoặc dòng không có toạ độ thì giữ.
 * Trả {giu, bo}.
 */
export function locTheoTamPhuong(dong, tam, toiDaKm = 50) {
  if (!tam || tam.lat == null || tam.lng == null || !Number.isFinite(Number(tam.lat)) || !Number.isFinite(Number(tam.lng))) return { giu: dong, bo: [] };
  const giu = [], bo = [];
  for (const d of dong) {
    const xa = d.lat != null && d.lng != null && khoangCachKm(d.lat, d.lng, Number(tam.lat), Number(tam.lng)) > toiDaKm;
    (xa ? bo : giu).push(d);
  }
  return { giu, bo };
}
