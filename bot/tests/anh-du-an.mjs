// TS-ANH-DU-AN — ảnh thư viện dự án từ trang mogi (scripts/anh-du-an.mjs, docs/07 SRS-5.1zzzzzzz36). HTML dựng tay theo khuôn trang.
import { bocAnhDuAn } from "../../scripts/anh-du-an.mjs";

let dat = 0, hong = 0;
const la = (t, thuc, mong) => {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a === b) { dat++; console.log(`✓ ${t}`); } else { hong++; console.log(`✗ ${t}\n    thật ${a}\n    mong ${b}`); }
};
const u = (i) => `https://cloud.mogi.vn/project/2024/12/19/${i}/a${i}.jpg`;
const o = (src, luoi = false) => `<div class="media-item"><img ${luoi ? 'class="lozad" data-src' : "src"}="${src}" alt="X" /></div>`;

console.log("TS-ANH-DU-AN — ảnh thư viện dự án\n");
la("src và data-src (ảnh lười), giữ thứ tự, bỏ trùng",
  bocAnhDuAn(o(u(1)) + o(u(2), true) + o(u(1)) + o(u(3), true)), [u(1), u(2), u(3)]);
la("tối đa 5 ảnh", bocAnhDuAn([1, 2, 3, 4, 5, 6, 7].map((i) => o(u(i))).join("")), [1, 2, 3, 4, 5].map(u));
la("KHÔNG lấy og:image, logo, ảnh ngoài khối thư viện, ảnh không phải CDN dự án",
  bocAnhDuAn(`<meta property="og:image" content="${u(9)}" /><img src="https://images.dmca.com/b.png">` +
    `<div class="related"><img src="${u(8)}"></div>` + o("https://cloud.mogi.vn/avatar/x.jpg")), []);
la("rỗng / null không vỡ", [bocAnhDuAn(""), bocAnhDuAn(null)], [[], []]);

console.log(`\n${dat}/${dat + hong} đạt`);
if (hong) process.exit(1);
