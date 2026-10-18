// giao-lo.mjs — phần tử Overpass (way có tên + node) → GIAO LỘ (20261018f, SRS-5.1zzzzzzz40). THUẦN, không mạng.
//
// Giao lộ = một NÚT mà ít nhất hai đường KHÁC TÊN (sau `phanLoaiDuong`) cùng đi qua. Một cặp tên có thể chạm nhau ở nhiều nút
// sát nhau (đại lộ hai chiều, vòng xoay, đảo giao thông) → gom các nút cách nhau ≤ GOM_M thành một ngã tư (toạ độ = trung bình,
// osm_node = id nhỏ nhất). Hai đường cắt nhau hai lần ở xa nhau → hai dòng.
import { phanLoaiDuong } from "./phan-loai-duong.mjs";

export const GOM_M = 60;

const R = 6371000;
export function khoangCachM(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** @param {Array<{type:string,id:number,lat?:number,lon?:number,nodes?:number[],tags?:Record<string,string>}>} elements */
export function timGiaoLo(elements) {
  const toaDo = new Map();
  for (const e of elements) if (e.type === "node" && Number.isFinite(e.lat) && Number.isFinite(e.lon)) toaDo.set(e.id, { lat: e.lat, lng: e.lon });

  // nút → các đường (tên chuẩn) đi qua; chỉ nút có toạ độ (nút nằm trong phường đang tra).
  const quaNut = new Map();
  for (const e of elements) {
    if (e.type !== "way" || !Array.isArray(e.nodes)) continue;
    const d = phanLoaiDuong(e.tags?.name);
    if (!d) continue;
    for (const n of e.nodes) {
      if (!toaDo.has(n)) continue;
      if (!quaNut.has(n)) quaNut.set(n, new Map());
      quaNut.get(n).set(d.ten, d.loai);
    }
  }

  // cặp tên → các nút chạm nhau
  const theoCap = new Map();
  for (const [nut, ds] of quaNut) {
    if (ds.size < 2) continue;
    const ten = [...ds.keys()].sort();
    for (let i = 0; i < ten.length; i++) {
      for (let j = i + 1; j < ten.length; j++) {
        const k = `${ten[i]}\u0000${ten[j]}`;
        if (!theoCap.has(k)) theoCap.set(k, { a: ten[i], b: ten[j], la: ds.get(ten[i]), lb: ds.get(ten[j]), nut: [] });
        theoCap.get(k).nut.push(nut);
      }
    }
  }

  const ra = [];
  for (const c of theoCap.values()) {
    const cum = [];
    for (const n of c.nut.sort((x, y) => x - y)) {
      const p = toaDo.get(n);
      const vao = cum.find((g) => khoangCachM(g.goc, p) <= GOM_M);
      if (vao) vao.nut.push(n); else cum.push({ goc: p, nut: [n] });
    }
    for (const g of cum) {
      const lat = g.nut.reduce((s, n) => s + toaDo.get(n).lat, 0) / g.nut.length;
      const lng = g.nut.reduce((s, n) => s + toaDo.get(n).lng, 0) / g.nut.length;
      ra.push({
        duong_a: c.a, duong_b: c.b, loai_a: c.la, loai_b: c.lb,
        lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7,
        osm_node: Math.min(...g.nut), so_nut: g.nut.length,
      });
    }
  }
  return ra.sort((x, y) => x.osm_node - y.osm_node);
}
