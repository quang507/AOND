// don-vi-hien-thi.mjs — SRS-5.1zzzzzg: bộ in giá (`donViGiaDep`) biết MỌI đơn vị mà luật đọc tiền (`TIEN_CD`) biết.
// Test Zalo 12/10/2026: "16 tỏi" đọc đúng 16 tỷ nhưng bản nháp + tiêu đề in "giá 16 tỏi" — bảng đơn vị hiển thị chép tay riêng,
// thiếu "tỏi" có dấu và "củ". Bài này sinh ca từ chính `TIEN_CD`: thêm đơn vị vào luật đọc mà quên bộ in là đỏ.
// Không mạng, không DB.   bun bot/tests/don-vi-hien-thi.mjs
import { TIEN_CD, donViGiaDep, docTien, laDonViTy } from "../supabase/functions/_shared/extraction/luat-tien.ts";

let hong = 0, tong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };

const donVi = TIEN_CD.split("|").map((u) => u.replace(/\(\?[!=][^)]*\)/g, "").replace(/[()]/g, "")).filter(Boolean);
ok("đọc được danh sách đơn vị từ TIEN_CD", donVi.length >= 8, JSON.stringify(donVi));
for (const u of new Set(donVi)) {
  const chuan = laDonViTy(u) ? "tỷ" : "triệu";
  for (const vao of [`16 ${u}`, `16${u}`]) {
    const ra = donViGiaDep(vao);
    const conThoi = !["tỷ", "triệu"].includes(u) && new RegExp(`\\d\\s*${u}(?![\\p{L}])`, "u").test(ra);
    ok(`"${vao}" → "${ra}" (in "${chuan}", không còn chữ "${u}")`, ra.includes(chuan) && !conThoi, ra);
    // Cùng một số tiền: chữ in ra đọc lại phải ra đúng số luật đọc từ chữ khách (khi luật đọc được chữ khách — "toi" / "cu" không
    // dấu `docTien` chưa đọc, ghi ở SRS-5.1zzzzzg mục "chỗ khác cùng lớp").
    const a = docTien(vao), b = docTien(ra);
    if (a != null) ok(`"${vao}": đọc lại chữ in ra cùng số tiền`, a === b, `${a} ≠ ${b}`);
  }
}
// Ca gốc + cách nói mới chưa từng bắn.
ok("ca gốc: '16 tỏi' → '16 tỷ'", donViGiaDep("16 tỏi") === "16 tỷ", donViGiaDep("16 tỏi"));
ok("cách nói mới: '7 tỏi 5' → '7 tỷ 5'", donViGiaDep("7 tỏi 5") === "7 tỷ 5", donViGiaDep("7 tỏi 5"));
ok("cách nói mới: '850 củ' → '850 triệu'", donViGiaDep("850 củ") === "850 triệu", donViGiaDep("850 củ"));
ok("không đụng chữ khác: 'thương lượng' giữ nguyên", donViGiaDep("16 tỏi thương lượng") === "16 tỷ thương lượng", donViGiaDep("16 tỏi thương lượng"));

console.log(`\n${tong - hong}/${tong} đạt`);
if (hong) process.exit(1);
