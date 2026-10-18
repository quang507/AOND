// TS-LOAI-CAN — bóc loại căn từ bài giới thiệu dự án mogi (scripts/loai-can-du-an.mjs, docs/07 SRS-5.1zzzzzzz35).
// HTML dựng tay theo khuôn trang mogi (khối id="project-intro" → khối kế tiếp), câu chữ tự viết — không chép trang nguồn.
import { bocLoaiCan } from "../../scripts/loai-can-du-an.mjs";

let dat = 0, hong = 0;
const la = (t, thuc, mong) => {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a === b) { dat++; console.log(`✓ ${t}`); } else { hong++; console.log(`✗ ${t}\n    thật ${a}\n    mong ${b}`); }
};
const trang = (gioiThieu, ngoai = "") =>
  `<div id="menu">${ngoai}</div><div id="project-intro">${gioiThieu}</div><div id="hinh-anh-thuc-te"><li>Căn hộ 2 phòng ngủ: 999 m²</li></div><footer>${ngoai}</footer>`;
const ten = (r) => r.map((c) => c.name + (c.specs.dien_tich ? ` ${c.specs.dien_tich}` : ""));

console.log("TS-LOAI-CAN — loại căn từ bài giới thiệu\n");

// ── Phải kích ───────────────────────────────────────────────────────────────
la("dòng liệt kê có dải diện tích (dấu phẩy thập phân, ² viết bằng sup)",
  ten(bocLoaiCan(trang("<li>Căn hộ 1 phòng ngủ: diện tích từ 34m<sup>2</sup> đến 41,65m<sup>2</sup></li><li>Căn hộ 2 phòng ngủ: khoảng 53,55m²</li>"))),
  ["1 phòng ngủ 34 - 41,65 m2", "2 phòng ngủ 53,55 m2"]);
la("nhiều dòng cùng loại thì gộp min–max",
  ten(bocLoaiCan(trang("<p>2 phòng ngủ, 1 WC: 62,59 m²</p><p>2 phòng ngủ, 2 WC: 87,12 m²</p>"))),
  ["2 phòng ngủ 62,59 - 87,12 m2"]);
la("viết tắt PN + WC, không diện tích",
  bocLoaiCan(trang("<li>2PN + 2WC thường</li><li>2PN + 2WC góc</li>")),
  [{ name: "2 phòng ngủ", specs: { so_phong_ngu: "2" } }]);
la("studio / duplex / shophouse, xếp theo thứ tự cố định",
  ten(bocLoaiCan(trang("<li>Shophouse: 156 m²</li><li>Duplex - 120 m2</li><li>Studio: 30 m2</li><li>Căn hộ 3PN: 90 m2</li>"))),
  ["Studio 30 m2", "3 phòng ngủ 90 m2", "Duplex 120 m2", "Shophouse 156 m2"]);
la("chấm thập phân và dải ba số",
  ten(bocLoaiCan(trang("<li>Căn hộ 2 Phòng Ngủ: 87.7 m2 – 89.2 m2 – 94.2 m2.</li>"))),
  ["2 phòng ngủ 87,7 - 94,2 m2"]);
la("gạch đầu dòng trước loại căn",
  ten(bocLoaiCan(trang("<li>- Loại 1PN: 48 m2</li><li>• 3 phòng ngủ: 101 m2</li>"))),
  ["1 phòng ngủ 48 m2", "3 phòng ngủ 101 m2"]);

// ── Không được kích ─────────────────────────────────────────────────────────
const khong = [
  ["không có khối giới thiệu", "<div id='x'><li>Căn hộ 2 phòng ngủ: 60 m2</li></div>"],
  ["menu / chân trang ngoài khối giới thiệu", trang("<p>Dự án nằm cạnh công viên.</p>", "<li>Cho thuê căn hộ 2 phòng ngủ</li><li>2PN: 70 m2</li>")],
  ["câu văn kể chuyện có chữ phòng ngủ ở giữa", trang("<p>Mỗi căn hộ đều có phòng ngủ rộng và 2 hướng view, từ 1 – 4 phòng ngủ.</p>")],
  ["câu văn dài mở đầu bằng shophouse", trang("<p>Shophouse tại khu đô thị được thiết kế bởi các kiến trúc sư hàng đầu, tạo nên sự hài hoà giữa khối và chiều cao.</p>")],
  ["tổng diện tích dự án, không có loại căn", trang("<li>Tổng diện tích: 44.000 m²</li><li>Quy mô: 5 tháp, 1.000 căn</li>")],
  ["số căn đứng trước loại căn", trang("<li>4 căn 1 phòng ngủ</li><li>11 căn shophouse (diện tích 156 m²)</li>")],
];
for (const [t, h] of khong) la(`KHÔNG kích: ${t}`, bocLoaiCan(h), []);

la("một dòng nêu nhiều loại: ghi tên, KHÔNG gán diện tích",
  ten(bocLoaiCan(trang("<li>1PN, 2PN và 3PN: 50 - 90 m2</li>"))),
  ["1 phòng ngủ", "2 phòng ngủ", "3 phòng ngủ"]);
la("dải lệch khoảng hợp lý thì bỏ cả dòng, không in nửa dải",
  ten(bocLoaiCan(trang("<li>Căn hộ 4 Phòng Ngủ: 233 – 1.670 m2</li>"))),
  ["4 phòng ngủ"]);
la("rỗng / null không vỡ", [bocLoaiCan(""), bocLoaiCan(null)], [[], []]);

console.log(`\n${dat}/${dat + hong} đạt`);
if (hong) process.exit(1);
