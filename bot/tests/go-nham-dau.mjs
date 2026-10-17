// go-nham-dau.mjs — "nói thật" không được thành "nội thất" sau khi bỏ dấu (SRS-5.1u mục 5).
import { goNhamDau } from "../supabase/functions/_shared/extraction/go-nham-dau.ts";
import { phanLoaiCauTraLoi } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { kiemDeXuat } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";

let hong = 0;
const check = (ten, ok, chiTiet = "") => { console.log(`${ok ? "✓" : "✗"} ${ten}`); if (!ok) { hong++; if (chiTiet) console.log(`     → ${chiTiet}`); } };

check("GND-01 'nói thật' → 'nói thựt' (cùng độ dài)", goNhamDau("nói thật chứ") === "nói thựt chứ" && goNhamDau("nói thật chứ").length === "nói thật chứ".length);
check("GND-02 'Nói Thật' / 'NÓI THẬT' giữ hoa thường", goNhamDau("Nói Thật nha") === "Nói Thựt nha" && goNhamDau("NÓI THẬT") === "NÓI THỰT");
check("GND-03 'nội thất', 'thật ra', 'người thật', 'noi that' (không dấu) KHÔNG đổi",
  ["full nội thất", "thật ra thì", "em là người thật", "noi that day du", "nói thậtt"].every((x) => goNhamDau(x) === x.normalize("NFC")));
for (const [i, cau] of [
  "nói thật chứ chị sợ mấy bên online lừa lắm",
  "Nói thật là anh chưa muốn bán gấp",
  "em nói thật nha, nhà này giá vậy là rẻ",
].entries()) {
  for (const q of ["phuong", "vi_tri", "dien_tich_dat"]) {
    const kq = phanLoaiCauTraLoi(q, cau);
    check(`GND-1${i}-${q} '${cau}' khi hỏi ${q} → KHÔNG thành nội thất`, kq.chuyenSang?.question !== "noi_that", JSON.stringify(kq));
  }
}
check("GND-20 vẫn nhận 'full nội thất' / 'nội thất cơ bản' là nội thất",
  phanLoaiCauTraLoi("phuong", "full nội thất em").chuyenSang?.question === "noi_that" && phanLoaiCauTraLoi("vi_tri", "nội thất cơ bản").chuyenSang?.question === "noi_that");
const dx = kiemDeXuat([{ khoa: "noi_that", gia_tri: "nói thật chứ chị sợ", trich_dan: "nói thật chứ chị sợ", can: null }], "nói thật chứ chị sợ mấy bên online lừa lắm");
check("GND-30 AI đưa ô nội thất trích 'nói thật …' → kiểm bằng chứng KHÔNG nhận", !dx.dat.some((d) => d.question === "noi_that" || d.khoa === "noi_that"), JSON.stringify(dx));
const dx2 = kiemDeXuat([{ khoa: "noi_that", gia_tri: "full nội thất", trich_dan: "full nội thất", can: null }], "nhà full nội thất em");
check("GND-31 AI đưa ô nội thất trích 'full nội thất' → vẫn nhận", dx2.dat.length > 0, JSON.stringify(dx2));

console.log(hong ? `\nGỠ NHẦM DẤU: ${hong} CA HỎNG` : "\nGỠ NHẦM DẤU: TẤT CẢ CA ĐẠT");
process.exit(hong ? 1 : 0);
