#!/usr/bin/env bun
// phan-loai-duong.mjs — từ điển đường giữ cả đường số + hẻm, kèm toạ độ (30/09/2026, chạy offline).
import { gomDuong, phanLoaiDuong } from "../../scripts/lib/phan-loai-duong.mjs";

let dat = 0, hong = 0;
const ok = (ten, dk, chi = "") => { if (dk) dat++; else { hong++; console.log(`✗ ${ten}${chi ? `\n    ${chi}` : ""}`); } };
const pl = (s) => JSON.stringify(phanLoaiDuong(s));

// Tên riêng — như trước.
ok("'Đường Lý Thường Kiệt' → Lý Thường Kiệt (duong)", phanLoaiDuong("Đường Lý Thường Kiệt")?.ten === "Lý Thường Kiệt" && phanLoaiDuong("Đường Lý Thường Kiệt")?.loai === "duong", pl("Đường Lý Thường Kiệt"));
ok("'Đường tỉnh 824' giữ nguyên", phanLoaiDuong("Đường tỉnh 824")?.ten === "Đường tỉnh 824");
ok("'3 Tháng 2' là tên riêng", phanLoaiDuong("Đường 3 Tháng 2")?.ten === "3 Tháng 2" && phanLoaiDuong("Đường 3 Tháng 2")?.loai === "duong", pl("Đường 3 Tháng 2"));

// Đường số — trước đây BỎ, nay giữ (có phường + toạ độ thì không mơ hồ).
ok("'Số 59' → Đường số 59 (so)", phanLoaiDuong("Số 59")?.ten === "Đường số 59" && phanLoaiDuong("Số 59")?.loai === "so", pl("Số 59"));
ok("'Đường số 59' → Đường số 59", phanLoaiDuong("Đường số 59")?.ten === "Đường số 59");
ok("'Đường 10' → Đường số 10", phanLoaiDuong("Đường 10")?.ten === "Đường số 10");
ok("'N1' → Đường N1 (so)", phanLoaiDuong("N1")?.ten === "Đường N1" && phanLoaiDuong("N1")?.loai === "so", pl("N1"));
ok("'Đường D2' → Đường D2", phanLoaiDuong("Đường D2")?.ten === "Đường D2");

// Hẻm — nhiều cấp, có / không đường mẹ.
let h = phanLoaiDuong("Hẻm 137 Lê Văn Sỹ");
ok("'Hẻm 137 Lê Văn Sỹ' → hem, so_hem 137, mẹ Lê Văn Sỹ", h?.loai === "hem" && h?.so_hem === "137" && h?.duong_me === "Lê Văn Sỹ" && h?.ten === "Hẻm 137 Lê Văn Sỹ", pl("Hẻm 137 Lê Văn Sỹ"));
h = phanLoaiDuong("Hẻm 137/28 Lê Văn Sỹ");
ok("'Hẻm 137/28 Lê Văn Sỹ' → so_hem 137/28 (hẻm nhỏ trong hẻm)", h?.so_hem === "137/28" && h?.duong_me === "Lê Văn Sỹ", pl("Hẻm 137/28 Lê Văn Sỹ"));
h = phanLoaiDuong("Hẻm 51 Đường số 3");
ok("'Hẻm 51 Đường số 3' → mẹ Đường số 3", h?.so_hem === "51" && h?.duong_me === "Đường số 3", pl("Hẻm 51 Đường số 3"));
h = phanLoaiDuong("Hẻm 12/3/4");
ok("'Hẻm 12/3/4' không có đường mẹ vẫn giữ", h?.so_hem === "12/3/4" && h?.duong_me === null, pl("Hẻm 12/3/4"));
ok("'Ngõ 5' là hẻm", phanLoaiDuong("Ngõ 5")?.loai === "hem");
ok("'Hẻm' trơn → bỏ", phanLoaiDuong("Hẻm") === null);
ok("'Cầu Chữ Y' → bỏ", phanLoaiDuong("Cầu Chữ Y") === null);
ok("'Lối đi' → bỏ", phanLoaiDuong("Lối đi") === null);

// Gom đoạn + toạ độ.
const csv = [
  "Phường An Hội Tây\tarea\t\t",
  "Số 59\tway\t10.8420\t106.6380",
  "Đường số 59\tway\t10.8430\t106.6390",
  "Hẻm 137 Đường số 59\tway\t10.8425\t106.6385",
  "Lê Đức Thọ\tway\t10.8400\t106.6500",
  "Cầu X\tway\t10.8\t106.6",
].join("\n");
const g = gomDuong(csv);
const d59 = g.dong.find((d) => d.ten === "Đường số 59");
ok("gom: hai đoạn 'Số 59' + 'Đường số 59' → một dòng, toạ độ trung bình", d59 && d59.lat === 10.8425 && d59.lng === 106.6385, JSON.stringify(d59));
ok("gom: hẻm có mẹ + toạ độ", g.dong.some((d) => d.loai === "hem" && d.duong_me === "Đường số 59" && d.lat === 10.8425));
ok("gom: đếm 1 đa giác phường", g.soArea === 1);
ok("gom: cầu bị bỏ, còn 3 dòng", g.dong.length === 3, JSON.stringify(g.dong.map((d) => d.ten)));

console.log(`\nPHÂN LOẠI ĐƯỜNG: ${dat} đạt · ${hong} hỏng`);
if (hong) process.exit(1);
