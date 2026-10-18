// TS-GIAO-LO — nút OSM chung → giao lộ (scripts/lib/giao-lo.mjs, docs/07 SRS-5.1zzzzzzz40). Dữ liệu Overpass dựng tay.
import { timGiaoLo, khoangCachM, vungPhuong } from "../../scripts/lib/giao-lo.mjs";

let dat = 0, hong = 0;
const la = (t, thuc, mong) => {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a === b) { dat++; console.log(`✓ ${t}`); } else { hong++; console.log(`✗ ${t}\n    thật ${a}\n    mong ${b}`); }
};
const nut = (id, lat, lon) => ({ type: "node", id, lat, lon });
const way = (id, name, nodes) => ({ type: "way", id, nodes, tags: { highway: "residential", name } });
const cap = (r) => r.map((g) => `${g.duong_a} × ${g.duong_b} @${g.osm_node} (${g.so_nut})`);

console.log("TS-GIAO-LO — giao lộ từ nút OSM chung\n");

// Ngã tư thường: hai đường chung nút 2.
la("ngã tư hai đường khác tên",
  cap(timGiaoLo([nut(1, 10.78, 106.68), nut(2, 10.781, 106.681), nut(3, 10.782, 106.682),
    way(10, "Lê Văn Sỹ", [1, 2, 3]), way(11, "Trần Huy Liệu", [5, 2, 6])])),
  ["Lê Văn Sỹ × Trần Huy Liệu @2 (1)"]);

// Đại lộ hai chiều: hai nút sát nhau (~20 m) cùng một cặp → một ngã tư, toạ độ trung bình.
const daiLo = timGiaoLo([nut(1, 10.7800, 106.6800), nut(2, 10.78018, 106.6800),
  way(10, "Võ Văn Kiệt", [1, 9]), way(11, "Võ Văn Kiệt", [2, 8]), way(12, "Đường Nguyễn Tri Phương", [1, 2])]);
la("đại lộ hai chiều gom một ngã tư; tên bỏ tiền tố 'Đường'", cap(daiLo), ["Nguyễn Tri Phương × Võ Văn Kiệt @1 (2)"]);
la("toạ độ ngã tư gom là trung bình", [daiLo[0].lat, daiLo[0].lng], [10.78009, 106.68]);

// Cắt nhau hai lần ở xa (~1,1 km) → hai dòng.
la("hai đường cắt nhau hai lần ở xa → hai ngã tư",
  cap(timGiaoLo([nut(1, 10.78, 106.68), nut(2, 10.79, 106.68),
    way(10, "Hẻm 137 Lê Văn Sỹ", [1, 5, 2]), way(11, "Lê Văn Sỹ", [1, 7, 2])])),
  ["Hẻm 137 Lê Văn Sỹ × Lê Văn Sỹ @1 (1)", "Hẻm 137 Lê Văn Sỹ × Lê Văn Sỹ @2 (1)"]);

// Nút ba đường → ba cặp cùng nút (khoá DB gồm cả cặp tên).
la("nút ba đường → ba cặp",
  cap(timGiaoLo([nut(1, 10.78, 106.68), way(10, "A Đường", [1]), way(11, "Bùi Viện", [1]), way(12, "Cống Quỳnh", [1])])),
  ["A Đường × Bùi Viện @1 (1)", "A Đường × Cống Quỳnh @1 (1)", "Bùi Viện × Cống Quỳnh @1 (1)"]);

// Không được kích:
la("cùng một tên đường chạm nhau (đoạn nối) không phải giao lộ",
  timGiaoLo([nut(1, 10.78, 106.68), way(10, "Lê Văn Sỹ", [1, 2]), way(11, "Lê Văn Sỹ", [1, 3])]), []);
la("nút không có toạ độ (nằm ngoài phường đang tra) bỏ",
  timGiaoLo([way(10, "Lê Văn Sỹ", [1]), way(11, "Trần Huy Liệu", [1])]), []);
la("tên rác (cầu, lối) bị phanLoaiDuong bỏ",
  timGiaoLo([nut(1, 10.78, 106.68), way(10, "Cầu Kênh Tẻ", [1]), way(11, "Lối đi bộ", [1]), way(12, "Lê Văn Sỹ", [1])]), []);
la("đường không tên bỏ", timGiaoLo([nut(1, 10.78, 106.68), { type: "way", id: 9, nodes: [1], tags: {} }, way(12, "Lê Văn Sỹ", [1])]), []);
la("khoangCachM ~111 m cho 0,001 độ vĩ", Math.round(khoangCachM({ lat: 10.78, lng: 106.68 }, { lat: 10.781, lng: 106.68 })), 111);

// Tên phường trùng nhiều đa giác (SRS-5.1zzzzzzz48): có toạ độ thì chọn đa giác CHỨA điểm; không toạ độ thì vẫn theo tên.
la("vùng theo tên", vungPhuong({ ten_day_du: "Phường Phú Thọ" }), 'area["admin_level"="6"]["name"="Phường Phú Thọ"]->.a;');
la("vùng theo toạ độ khi có lat/lng", vungPhuong({ ten_day_du: "Phường Phú Thọ", lat: 10.7655, lng: 106.6573 }, true),
  'is_in(10.7655,106.6573)->.c;area.c["admin_level"="6"]["name"="Phường Phú Thọ"]->.a;');
la("theoDiem mà thiếu toạ độ → theo tên (không đoán)", vungPhuong({ ten_day_du: "Xã Hưng Long", lat: null }, true),
  'area["admin_level"="6"]["name"="Xã Hưng Long"]->.a;');
la("tên có dấu nháy kép không phá câu truy vấn", vungPhuong({ ten_day_du: 'A"B' }), 'area["admin_level"="6"]["name"="A\\"B"]->.a;');

console.log(`\n${dat}/${dat + hong} đạt`);
if (hong) process.exit(1);
