// Gom ghim thành bong bóng đếm số khi nhiều căn dồn một chỗ (SRS-5.1zzzzzzz217, chủ dự án 27/10/2026: "làm cho cái bản đồ nó nhảy
// như vầy nè" — ảnh tham khảo hifriendz.com: bong bóng "50 phòng", bấm thì bản đồ trượt tới và bong bóng tách ra).
// Dùng `supercluster` (cùng thuật toán MapLibre dùng bên trong) trên ghim HTML của mình, nên ghim lẻ vẫn là ghim giá + popup như cũ.
// Chỉ hàm thuần dựng phần tử lúc gọi — không import maplibre-gl ở đây (component tự nạp qua `napMapLibre`).
import Supercluster from "supercluster";
import type { Map as BanDo, Marker } from "maplibre-gl";
import { ghimGia, popupCan, popupNhieuCan } from "@/lib/ban-do";
import type { MapRow } from "@/lib/supabase";

type ThuVien = typeof import("maplibre-gl");
type Diem = { i: number };

export const BAN_KINH_CUM = 60; // px — hai ghim gần hơn khoảng này (ở zoom đang xem) thì gom
// SRS-5.1zzzzzzz221 (chủ dự án 27/10: "sao 1 căn mà nó ghi 9 căn… zoom vào có 1 căn à"): 9 tin có CÙNG toạ độ (cấp đường, chưa có số nhà) nên
// bản cũ (hết gom từ zoom 17) để chín ghim chồng khít thành một. Nay gom tới zoom tối đa của bản đồ: căn trùng chỗ luôn là bong bóng, bấm thì
// mở danh sách thay vì phóng to mãi không tách.
export const ZOOM_HET_CUM = 22;

/** Phần tử bong bóng cụm: "N căn", to dần theo số căn. */
export function bongBongCum(n: number): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `cum-ghim${n >= 100 ? " cum-ghim--lon" : n >= 20 ? " cum-ghim--vua" : ""}`;
  el.textContent = `${n} căn`;
  el.setAttribute("aria-label", `${n} căn ở gần nhau, bấm để phóng to hoặc xem danh sách`);
  return el;
}

/**
 * Vẽ `rows` lên bản đồ theo cụm: mỗi lần kéo / phóng xong tính lại cụm cho khung đang xem ở zoom hiện tại; bấm bong bóng → bản đồ trượt
 * tới tâm cụm với zoom vừa đủ để cụm tách ra (`getClusterExpansionZoom`). Trả hàm gỡ (gỡ ghim + bỏ nghe sự kiện).
 * `toaDo(l)` → [lng, lat] hoặc null (bỏ căn không có toạ độ).
 */
export function cumGhim(
  ml: ThuVien,
  map: BanDo,
  rows: MapRow[],
  toaDo: (l: MapRow) => [number, number] | null,
): () => void {
  const index = new Supercluster<Diem, Diem>({ radius: BAN_KINH_CUM, maxZoom: ZOOM_HET_CUM });
  const diem: Supercluster.PointFeature<Diem>[] = [];
  rows.forEach((l, i) => {
    const p = toaDo(l);
    if (p) diem.push({ type: "Feature", properties: { i }, geometry: { type: "Point", coordinates: p } });
  });
  index.load(diem);
  let ghim: Marker[] = [];
  const ve = () => {
    ghim.forEach((g) => g.remove());
    ghim = [];
    const b = map.getBounds();
    const cum = index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], Math.floor(map.getZoom()));
    for (const c of cum) {
      const [lng, lat] = c.geometry.coordinates as [number, number];
      if ("cluster" in c.properties && c.properties.cluster) {
        const el = bongBongCum(c.properties.point_count);
        const id = c.properties.cluster_id;
        const mk = new ml.Marker({ element: el }).setLngLat([lng, lat]);
        el.addEventListener("click", () => {
          const zoom = index.getClusterExpansionZoom(id);
          const la = index.getLeaves(id, Infinity);
          const trungCho = la.every((f) => {
            const [x, y] = f.geometry.coordinates;
            const [x0, y0] = la[0].geometry.coordinates;
            return Math.abs(x - x0) < 1e-6 && Math.abs(y - y0) < 1e-6;
          });
          if (trungCho || zoom > map.getMaxZoom()) {
            // Phóng to không tách được → danh sách các căn ngay tại chỗ.
            const ds = la.map((f) => rows[(f.properties as Diem).i]).filter(Boolean);
            new ml.Popup({ offset: 16, maxWidth: "300px" }).setLngLat([lng, lat]).setHTML(popupNhieuCan(ds)).addTo(map);
            return;
          }
          map.easeTo({ center: [lng, lat], zoom, duration: 500 });
        });
        ghim.push(mk.addTo(map));
      } else {
        const l = rows[(c.properties as Diem).i];
        if (!l) continue;
        ghim.push(
          new ml.Marker({ element: ghimGia(l) })
            .setLngLat([lng, lat])
            .setPopup(new ml.Popup({ offset: 14, maxWidth: "260px" }).setHTML(popupCan(l)))
            .addTo(map),
        );
      }
    }
  };
  ve();
  map.on("moveend", ve);
  return () => {
    map.off("moveend", ve);
    ghim.forEach((g) => g.remove());
    ghim = [];
  };
}

export type Moc = { ten: string; loai: string; lat: number; lng: number };

export const TEN_LOAI_MOC: Record<string, string> = {
  truong_hoc: "Trường", benh_vien: "Bệnh viện", cho: "Chợ", sieu_thi: "Siêu thị", cong_vien: "Công viên", du_an: "Dự án",
  duong: "Đường", hem: "Hẻm",
};

/** Ghim địa danh (trường / bệnh viện / chợ / dự án…): chấm tròn + nhãn tên, không bấm được, đặt trên ghim giá. */
export function ghimMoc(m: Moc): HTMLElement {
  const el = document.createElement("div");
  el.className = "moc-ghim";
  const cham = document.createElement("span");
  cham.className = "moc-ghim__cham";
  cham.textContent = "📍";
  const ten = document.createElement("span");
  ten.className = "moc-ghim__ten";
  ten.textContent = m.ten;
  el.append(cham, ten);
  el.setAttribute("aria-label", `${TEN_LOAI_MOC[m.loai] ?? "Địa danh"} ${m.ten}`);
  return el;
}
