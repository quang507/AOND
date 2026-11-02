// ghep-vanh.mjs — ghép các đoạn `way` của một relation ranh giới OSM (Overpass `out geom`) thành GeoJSON Polygon / MultiPolygon
// (SRS-5.1zzzzzzz360). Relation hành chính chia biên thành nhiều way nối đầu-đuôi, không theo thứ tự, có đoạn ngược chiều; vành ngoài
// (`role=outer`) và lỗ (`role=inner`). Toạ độ GeoJSON là [lng, lat]. Không ghép được vành kín → trả null (bộ nạp bỏ phường đó, báo soi tay).

const khoa = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

/** Ghép các đoạn (mảng [lng, lat]) thành các vành kín. Trả null khi còn đoạn hở. */
export function ghepVanh(doan) {
  const con = doan.filter((d) => d.length >= 2).map((d) => d.slice());
  const vanh = [];
  while (con.length) {
    let v = con.shift();
    let vong = 0;
    while (khoa(v[0]) !== khoa(v[v.length - 1])) {
      const cuoi = khoa(v[v.length - 1]);
      const i = con.findIndex((d) => khoa(d[0]) === cuoi || khoa(d[d.length - 1]) === cuoi);
      if (i < 0 || ++vong > 100000) return null;
      const d = con.splice(i, 1)[0];
      v = v.concat((khoa(d[0]) === cuoi ? d : d.slice().reverse()).slice(1));
    }
    if (v.length >= 4) vanh.push(v);
  }
  return vanh;
}

/** Điểm (lng, lat) trong vành — ray casting, cùng phép với SQL `diem_trong_vanh`. */
export function trongVanh(lng, lat, v) {
  let trong = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [xi, yi] = v[i], [xj, yj] = v[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) trong = !trong;
  }
  return trong;
}

/** Relation Overpass (`out geom`) → { vong: GeoJSON geometry, khung } hoặc null. */
export function relationThanhVong(rel) {
  const doan = (vai) => (rel.members ?? [])
    .filter((m) => m.type === "way" && (m.role || "outer") === vai && Array.isArray(m.geometry))
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const ngoai = ghepVanh(doan("outer"));
  const trongLo = ghepVanh(doan("inner"));
  if (!ngoai || !ngoai.length || trongLo == null) return null;
  // Mỗi lỗ gắn vào vành ngoài chứa đỉnh đầu của nó.
  const da = ngoai.map((v) => [v]);
  for (const lo of trongLo) {
    const cha = da.find((p) => trongVanh(lo[0][0], lo[0][1], p[0]));
    if (cha) cha.push(lo);
  }
  const tat = ngoai.flat();
  const khung = {
    min_lat: Math.min(...tat.map((p) => p[1])), max_lat: Math.max(...tat.map((p) => p[1])),
    min_lng: Math.min(...tat.map((p) => p[0])), max_lng: Math.max(...tat.map((p) => p[0])),
  };
  const vong = da.length === 1 ? { type: "Polygon", coordinates: da[0] } : { type: "MultiPolygon", coordinates: da };
  return { vong, khung };
}
