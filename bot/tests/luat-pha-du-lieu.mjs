#!/usr/bin/env node
// luat-pha-du-lieu.mjs — MỖI LUẬT CÓ THỂ PHÁ DỮ LIỆU PHẢI CÓ BẢNG CÂU KHÔNG
// ĐƯỢC KÍCH HOẠT (tầng bốn, 11/09/2026).
//
// Chủ dự án: "mỗi luật có thể phá dữ liệu phải có bảng câu không được kích hoạt".
//
// Vì sao phải tách riêng thành một luật: hai lỗi nặng nhất hôm 10/09 đều cùng
// một hình — một luật tìm-chuỗi khớp NHẦM rồi ghi đè dữ liệu thật:
//   · "thôi đăng đi em"   → `laNgungRao` ra `rut` → tin sang `an` (lời GIỤC đăng)
//   · "nhà mở quán 2 tầng" → `bocQuan` ra Quận 2 → cột quận bị ghi đè
// Cả hai đều ĐÃ có test — nhưng test chỉ hỏi "câu này có khớp không", không ai
// hỏi "câu nào TUYỆT ĐỐI không được khớp". Bảng `luat/khong-duoc-kich.json` là
// câu hỏi thứ hai đó, viết thành dữ liệu.
//
// Ba việc bài này làm:
//  1. Mỗi luật: mọi câu `phai_kich` phải khớp (để không vá quá tay — bản vá
//     "thôi đăng đi em" lần đầu từng giết luôn "rút tin giúp anh"), mọi câu
//     `khong_duoc_kich` phải KHÔNG khớp.
//  2. Mỗi luật phải có ÍT NHẤT `toi_thieu_khong_duoc_kich` câu phủ định. Bảng
//     ba câu là bảng cho có.
//  3. CANH CỬA: đếm chỗ ghi-đè-dữ-liệu trong `chat-reply` (đổi trạng thái tin,
//     đổi quận, đóng dấu "đủ rồi"). Số chỗ tăng mà bảng không thêm luật nào là
//     đỏ — luật phá dữ liệu MỚI không được lọt vào mà không có bảng của nó.
//
// Chạy offline, không tốn đồng nào: mọi luật ở đây thuộc tầng bóc tách tiền định.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { bocQuan } from "../supabase/functions/_shared/dia_ban.ts";
import { tachTienToPhuong } from "../supabase/functions/_shared/extraction/tra-phuong.ts";
import { tenDiaDanhTron } from "../supabase/functions/_shared/extraction/dia-danh.ts";
import { viTriLaPhuong } from "../supabase/functions/_shared/ghi-fact.ts";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const bang = JSON.parse(readFileSync(join(HERE, "luat", "khong-duoc-kich.json"), "utf8"));
const TOI_THIEU = bang.toi_thieu_khong_duoc_kich ?? 8;

const boDau = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
// Câu trong bảng có thể kèm ghi chú "(10/09 — …)": bỏ phần đó trước khi chạy.
const catGhiChu = (s) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();

// Mỗi luật → một hàm "khớp thì ra gì". Trả null/false = không kích hoạt.
const CHAY = {
  laNgungRao: (c) => E.laNgungRao(c),
  // 22/09 (kịch bản E): mở lại tin đã gỡ.
  laRaoLai: (c) => E.laRaoLai(c),
  // 05/10/2026 (SRS-5.1zzl): gom nhiều căn / chỉ giữ — chỉ mở câu xác nhận, gật lượt sau mới ẩn.
  laNgungHangLoat: (c) => E.laNgungHangLoat(c),
  bocQuan: (c) => bocQuan(boDau(c), c),
  laDuRoi: (c) => E.laDuRoi(c),
  laDongY: (c) => E.laDongY(c),
  laGap: (c) => E.laGap(c),
  // FR-209 (15/09): tên phường đọc ra → tra `wards` → ghi đè ward + district (khi còn quận mặc định).
  tachTienToPhuong: (c) => tachTienToPhuong(c),
  // 01/10/2026 (SRS-5.1p): tin là một tên trơn → dò địa danh chung → có thể ghi quận / phường.
  tenDiaDanhTron: (c) => tenDiaDanhTron(c),
  // 09/10/2026 (SRS-5.1zzzzj): cửa ghi fact `ghiFact` đổi câu vị trí chỉ-là-tên-phường sang fact phường (để tên đó qua `tenPhuongCot`).
  viTriLaPhuong: (c) => viTriLaPhuong(c),
};
const daKich = (v) => v !== null && v !== false && v !== undefined;

let dat = 0, hong = 0;
const ok = () => { dat++; };
const ko = (t) => { hong++; console.log(`  \x1b[31m✗\x1b[0m ${t}`); };

console.log("LUẬT PHÁ DỮ LIỆU — bảng câu PHẢI kích và câu KHÔNG ĐƯỢC kích\n");

for (const [ten, l] of Object.entries(bang.luat)) {
  const f = CHAY[ten];
  console.log(`▸ ${ten} — khớp nhầm thì: ${l.hau_qua}`);
  if (!f) { ko(`không có hàm chạy cho luật "${ten}" trong CHAY`); continue; }

  const soKhong = (l.khong_duoc_kich ?? []).length;
  if (soKhong < TOI_THIEU) ko(`chỉ có ${soKhong} câu không-được-kích, cần tối thiểu ${TOI_THIEU}`);
  else ok();

  for (const [cau, mong] of l.phai_kich ?? []) {
    const that = f(cau);
    if (JSON.stringify(that) === JSON.stringify(mong)) ok();
    else ko(`PHẢI kích: "${cau}" → ${JSON.stringify(that)} (mong ${JSON.stringify(mong)})`);
  }
  for (const cauGoc of l.khong_duoc_kich ?? []) {
    const cau = catGhiChu(cauGoc);
    const that = f(cau);
    if (!daKich(that)) ok();
    else ko(`KHÔNG ĐƯỢC kích: "${cau}" → ${JSON.stringify(that)}`);
  }
}

// ── Canh cửa: chỗ ghi đè dữ liệu trong chat-reply ────────────────────────────
// Mỗi mẫu là một kiểu "khớp chữ rồi ghi đè". Số đếm hiện tại là NỀN; tăng lên
// nghĩa là có chỗ ghi đè mới — phải kèm một luật mới trong bảng.
const src = readFileSync(
  join(HERE, "..", "supabase", "functions", "chat-reply", "index.ts"), "utf8");
const MAU = {
  "đổi trạng thái tin (an/da_chot)": /\.update\(\{\s*status:\s*(?:trangThai|"an"|"da_chot")/g,
  "ghi đè quận": /\.update\(\{\s*district:/g,
  "đóng dấu 'đủ rồi'": /chu_noi_du_at:\s*luc/g,
};
// "ghi đè quận" 1 → 2 (15/09, FR-209): `capNhatQuanTuPhuong` ghi quận cũ tra từ `wards` sau khi chủ
// nhà gật gợi ý hoặc tự nói tên phường mới — luật `tachTienToPhuong` có bảng ở trên.
// "đổi trạng thái tin" 2 → 3 (22/09, kịch bản E): `laRaoLai` mở lại tin đã gỡ — luật có bảng ở trên.
// "ghi đè quận" 2 → 3 (01/10, SRS-5.1p): dò địa danh chung ra QUẬN khi tin chưa có quận chắc — luật `tenDiaDanhTron` có bảng.
// "đổi trạng thái tin" 3 → 4, "đóng dấu 'đủ rồi'" 4 → 5 (05/10/2026, SRS-5.1zzl): ẩn hàng loạt SAU khi chủ nhà gật câu xác nhận — luật `laNgungHangLoat` có bảng ở trên.
const NEN = { "đổi trạng thái tin (an/da_chot)": 4, "ghi đè quận": 3, "đóng dấu 'đủ rồi'": 5 };
console.log("\n▸ canh cửa — chỗ ghi đè dữ liệu trong chat-reply");
for (const [ten, re] of Object.entries(MAU)) {
  const so = (src.match(re) ?? []).length;
  if (so > NEN[ten]) {
    ko(`"${ten}": ${so} chỗ, nền là ${NEN[ten]} — có chỗ ghi đè MỚI. Thêm luật của nó vào `
      + `bot/tests/luat/khong-duoc-kich.json kèm câu không-được-kích, rồi nâng NEN ở đây.`);
  } else {
    ok();
    if (so < NEN[ten]) console.log(`  · "${ten}": ${so} chỗ (nền ${NEN[ten]}) — bớt được một chỗ, hạ NEN xuống cho khít`);
  }
}

console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong) {
  console.log("\x1b[31mLUẬT PHÁ DỮ LIỆU HỎNG\x1b[0m — có câu khớp nhầm, hoặc luật mới chưa có bảng.");
  process.exitCode = 1;
} else {
  console.log("\x1b[32mLUẬT PHÁ DỮ LIỆU ĐẠT\x1b[0m");
}
