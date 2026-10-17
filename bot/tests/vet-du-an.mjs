// TS-VET — lưới vét dự án bằng model (FR-199): hai cái van và bộ dọn kết quả.
//
// Van là thứ giữ tiền: `coMuiDuAn` sai một chỗ là mỗi tin nhắn thành một lượt
// gọi model. Bộ dọn là thứ giữ hàng chờ duyệt sạch: model trả tên rác thì admin
// thôi nhìn hàng chờ, và tính năng chết theo kiểu không ai báo.
import { coMuiDuAn, donKetQua } from "../supabase/functions/_shared/extraction/vet-du-an-loc.ts";

let dat = 0, hong = 0;
const ok = (t) => { dat++; console.log(`✓ ${t}`); };
const ko = (t, chi) => { hong++; console.log(`✗ ${t}\n    ${chi}`); };
const la = (t, thuc, mong) => {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  a === b ? ok(t) : ko(t, `thật ${a}\n    mong ${b}`);
};

console.log("TS-VET — van gọi model + dọn kết quả\n");

// ── Van 1: câu nào ĐÁNG gọi model ───────────────────────────────────────────
for (const t of [
  "phí quản lý bên đó 17 nghìn/m2",
  "dự án Lam Sơn Riverside quận 4",
  "khu có hồ bơi với phòng gym nội khu",
  "toà B bàn giao quý 2 năm sau",
  "chung cu nay co thang may khong em",
  "chủ đầu tư là ai vậy em",
]) coMuiDuAn(t) ? ok(`có mùi dự án: "${t}"`) : ko(`phải thấy mùi dự án: "${t}"`, "van đóng, mất thông tin");

for (const t of [
  "giá 3 tỷ 4 nha em",
  "68m2, 2 phòng ngủ",
  "ok em",
  "nhà hẻm xe hơi, sổ hồng riêng",
  "anh bán gấp vì cần tiền",
  "",
]) !coMuiDuAn(t) ? ok(`KHÔNG gọi model: "${t || "(rỗng)"}"`) : ko(`không được gọi model: "${t}"`, "mỗi tin thường là một lượt đốt tiền");

// ── Van 2: dọn kết quả model ────────────────────────────────────────────────
la("cắt đuôi địa bàn khỏi tên dự án",
  donKetQua({ ten_du_an: "Lam Sơn Riverside quận 4", facts: [] }),
  { ten_du_an: "Lam Sơn Riverside", facts: [] });

la("tên quá dài (>6 chữ) thì bỏ — đó là câu tả, không phải tên",
  donKetQua({ ten_du_an: "khu này yên tĩnh gần công viên ven sông lắm", facts: [] }),
  { ten_du_an: null, facts: [] });

la("tên 2 ký tự thì bỏ",
  donKetQua({ ten_du_an: "An", facts: [] }),
  { ten_du_an: null, facts: [] });

la("model trả null → object rỗng, không nổ",
  donKetQua(null), { ten_du_an: null, facts: [] });

la("fact rỗng bị loại, giá trị cắt còn 120 ký tự",
  donKetQua({
    ten_du_an: "The Beverly",
    facts: [
      { khoa: "phi_quan_ly", gia_tri: "  17 nghìn/m2  " },
      { khoa: "tien_ich_gan", gia_tri: "   " },
      { khoa: "ha_tang", gia_tri: "x".repeat(200) },
    ],
  }),
  {
    ten_du_an: "The Beverly",
    facts: [
      { khoa: "phi_quan_ly", gia_tri: "17 nghìn/m2" },
      { khoa: "ha_tang", gia_tri: "x".repeat(120) },
    ],
  });

{
  const nhieu = { ten_du_an: "Sunrise City", facts: Array.from({ length: 12 }, (_, i) => ({ khoa: "ha_tang", gia_tri: `y${i}` })) };
  donKetQua(nhieu).facts.length === 6
    ? ok("tối đa 6 fact một tin — model nói lan man không làm ngập hàng chờ duyệt")
    : ko("giới hạn 6 fact", `ra ${donKetQua(nhieu).facts.length}`);
}

console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong) {
  console.log("TS-VET HỎNG — van hỏng thì hoặc đốt tiền, hoặc mất thông tin.");
  process.exitCode = 1;
} else {
  console.log("TS-VET ĐẠT");
}
