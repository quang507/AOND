#!/usr/bin/env bun
// kiem-giong.mjs — LUẬT MÁY chấm giọng bot (tầng 1 của bộ đo giọng, FR-180 f / OPEN-54).
//
// Thuần hàm, không gọi model, không đọc DB: chạy được offline và có bài tự kiểm
// (`--tu-kiem`) với câu ĐÚNG mẫu (phải đạt hết) và câu SAI mẫu (phải rớt đúng luật).
// Mỗi luật chép từ TONE_RULES trong `_shared/prompts.ts` — sửa luật giọng ở đó thì
// sửa ở đây, không thì bộ đo đo một giọng khác với giọng bot đang được dặn.
//
// Bong bóng hệ thống (🤖 Đã lưu, 📋 bản nháp, 👤 hồ sơ, 📝 ghi nhận) KHÔNG chấm giọng:
// chúng là bảng số liệu, không phải lời bot nói.

export const LA_BANG = /^(🤖|📋|👤|📝|💾|📦)/u;

// Câu sáo TONE_RULES cấm (chép nguyên chữ, so không phân biệt hoa thường).
const CAU_SAO = ["quý khách", "vui lòng", "hệ thống ghi nhận", "hệ thống đã", "theo dữ liệu", "tuyệt vời", "chắc chắn rồi", "rất vui được hỗ trợ", "rất vui được", "em xin phép"];
// Chữ máy: gạch dài, markdown, đọc tên trường kiểu "(số tầng, phòng)".
const MARKDOWN = /(\*\*|^#{1,3}\s|^\s*[-*]\s|`)/mu;
const GACH_DAI = /—/u;
const TEN_TRUONG = /\((số tầng|số phòng|sổ hồng riêng\/chung|m2|m²)[^)]*\)/iu;
const MA_TIN = /(?<![\p{L}\d])BDS-[A-Z]{2,3}(-[A-Z0-9]+)+/u;
const SDT = /(?<!\d)(0|\+?84)\d{8,10}(?!\d)/u;
// `\b` của JS chỉ biết chữ ASCII — "chị" kết thúc bằng "ị" nên phải dùng lookaround \p{L}.
const GACH_CHEO = /(?<![\p{L}])(anh\s*\/\s*chị|a\s*\/\s*c|chị\s*\/\s*anh)(?![\p{L}])/iu;
const EM_RIENG = /(?<![\p{L}])em(?![\p{L}])/iu;
const CHAU_RIENG = /(?<![\p{L}])cháu(?![\p{L}])/iu;

export function demTu(s) {
  return s.trim().split(/\s+/u).filter(Boolean).length;
}

/** Bong bóng lời nói (bỏ bảng số liệu). */
export function loiBot(replies) {
  return (replies ?? []).filter((r) => typeof r === "string" && r.trim() && !LA_BANG.test(r.trim()));
}

/**
 * Chấm một lượt trả lời. `ca` mang `xung_ho` (anh/chị/chú/cô/bác/null), `phai` và `khong`
 * (regex riêng của ca, chuỗi). Trả về {dat, luat: {ten: boolean}, loi: [chuỗi]} —
 * mỗi luật một cờ riêng (chấm tách, không gộp điểm), `dat` = mọi luật CỨNG đạt.
 */
export function chamGiong(replies, ca = {}) {
  const loi = loiBot(replies);
  const luat = {};
  const ghi = [];
  const ok = (ten, dieuKien, chiTiet) => { luat[ten] = !!dieuKien; if (!dieuKien) ghi.push(`${ten}: ${chiTiet}`); };
  const ca1 = loi.join("\n");

  ok("co_loi", loi.length > 0, "không có bong bóng lời nào (chỉ bảng hoặc rỗng)");
  // 23/09/2026 (chủ dự án: bỏ luật cứng "dưới 30 từ"): tin ngắn như nhắn Zalo, 1–3 câu → trần 60 từ mỗi bong bóng.
  ok("ngan_gon", loi.every((r) => demTu(r) <= 60), `bong bóng dài nhất ${Math.max(0, ...loi.map(demTu))} từ`);
  ok("khong_gach_cheo", !GACH_CHEO.test(ca1), `có "anh/chị" gạch chéo`);
  ok("khong_cau_sao", !CAU_SAO.some((c) => ca1.toLowerCase().includes(c)), `câu sáo: ${CAU_SAO.filter((c) => ca1.toLowerCase().includes(c)).join(", ")}`);
  ok("khong_markdown", !MARKDOWN.test(ca1) && !GACH_DAI.test(ca1), "có markdown hoặc gạch dài");
  ok("khong_ten_truong", !TEN_TRUONG.test(ca1), "đọc tên trường như máy");
  ok("khong_ma_tin", !MA_TIN.test(ca1), "đọc mã tin cho khách");
  ok("khong_sdt", !SDT.test(ca1), "lộ số điện thoại");
  // Hỏi dồn: tối đa 1 dấu hỏi mỗi bong bóng, 2 cả lượt.
  const hoiMoiBong = loi.map((r) => (r.match(/\?/g) ?? []).length);
  ok("khong_hoi_don", hoiMoiBong.every((n) => n <= 1) && hoiMoiBong.reduce((a, b) => a + b, 0) <= 2, `dấu hỏi từng bong bóng: ${hoiMoiBong.join("/")}`);
  // Xưng hô: khách chú/cô/bác → bot xưng cháu, không còn "em" đứng riêng.
  const lonTuoi = ["chú", "cô", "bác", "ông", "bà", "dì", "cậu", "mợ", "thím", "dượng"].includes(ca.xung_ho ?? "");
  ok("xung_ho", lonTuoi ? (CHAU_RIENG.test(ca1) && !EM_RIENG.test(ca1)) : true, "khách lớn tuổi mà bot vẫn xưng em");
  ok("khong_khang_dinh_phap_ly", !/(chắc chắn|đảm bảo|cam kết)\s+(sổ|pháp lý|quy hoạch|hoàn công)/iu.test(ca1), "khẳng định pháp lý chưa xác minh");
  // Luật riêng từng ca.
  for (const p of ca.phai ?? []) ok(`phai:${p}`, new RegExp(p, "iu").test(ca1), `thiếu "${p}"`);
  for (const k of ca.khong ?? []) ok(`khong:${k}`, !new RegExp(k, "iu").test(ca1), `có "${k}"`);

  return { dat: Object.values(luat).every(Boolean), luat, loi: ghi, loi_bot: loi };
}

// ── Bài tự kiểm: câu đúng phải đạt, câu sai phải rớt ĐÚNG luật ─────────────
if (import.meta.main && process.argv.includes("--tu-kiem")) {
  let dat = 0, hong = 0;
  const kiem = (ten, dk, chiTiet = "") => { if (dk) dat++; else { hong++; console.log(`  \x1b[31m✗\x1b[0m ${ten} ${chiTiet}`); } };

  const dung = chamGiong(["🤖 Đã lưu: Nhà phố bán · Trần Bình Trọng, Phường 1, Quận 5 · 60m² · giá 7 tỷ 2", "Hẻm 5m ô tô vào tới cửa là khách chuộng lắm anh. Nhà mình xây mấy tầng rồi anh?"], { xung_ho: "anh", phai: ["mấy tầng"] });
  kiem("câu đúng mẫu đạt mọi luật", dung.dat, JSON.stringify(dung.loi));
  kiem("bảng 🤖 không bị đếm là lời", dung.loi_bot.length === 1);

  const chau = chamGiong(["Căn tầng 15 view sông là đắt hàng lắm chú. Bàn giao nhà trống hay để lại nội thất gì chú?"], { xung_ho: "chú" });
  kiem("khách chú: không có 'em' nhưng cũng chưa có 'cháu' → rớt xung_ho (luật đòi xưng cháu)", !chau.luat.xung_ho);
  const chau2 = chamGiong(["Dạ cháu ghi rồi ạ. Sổ hồng nhà mình riêng chưa chú?"], { xung_ho: "chú" });
  kiem("khách chú: xưng cháu → đạt", chau2.luat.xung_ho);

  const sai = chamGiong(["Tuyệt vời! Hệ thống đã ghi nhận thông tin của anh/chị. Anh/chị cho em xin kết cấu (số tầng, phòng), pháp lý và giá nha? Mã tin BDS-NP-Q5-0001. Gọi 0903123456 nhé — cảm ơn."], { xung_ho: null });
  kiem("câu sai mẫu rớt", !sai.dat);
  for (const l of ["khong_gach_cheo", "khong_cau_sao", "khong_markdown", "khong_ten_truong", "khong_ma_tin", "khong_sdt"]) kiem(`câu sai rớt đúng luật ${l}`, sai.luat[l] === false);
  kiem("câu sai: hai dấu hỏi trong một bong bóng → rớt khong_hoi_don", chamGiong(["Nhà mấy lầu? Sổ riêng chưa? Giá bao nhiêu?"]).luat.khong_hoi_don === false);
  kiem("rỗng / chỉ bảng → rớt co_loi", !chamGiong(["🤖 Đã lưu: x"]).luat.co_loi && !chamGiong([]).luat.co_loi);
  kiem("luật riêng `khong` bắt được", chamGiong(["Dạ em sửa lại rồi ạ."], { khong: ["sửa lại rồi"] }).dat === false);
  kiem("khẳng định pháp lý chưa xác minh → rớt", chamGiong(["Em đảm bảo sổ hồng riêng rồi anh."]).luat.khong_khang_dinh_phap_ly === false);
  kiem("bong bóng hơn 60 từ → rớt ngan_gon", chamGiong([Array(61).fill("chữ").join(" ") + "."]).luat.ngan_gon === false && chamGiong([Array(45).fill("chữ").join(" ") + "."]).luat.ngan_gon === true);
  kiem("đếm từ", demTu("  Dạ em   ghi rồi ạ. ") === 5);

  console.log(`\nKIỂM GIỌNG (luật máy): ${dat} đạt · ${hong} hỏng`);
  if (hong) { console.log("\x1b[31mBÀI TỰ KIỂM HỎNG\x1b[0m"); process.exit(1); }
  console.log("\x1b[32mBÀI TỰ KIỂM ĐẠT\x1b[0m");
}
