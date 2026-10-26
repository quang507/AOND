// Phần dùng chung của bản đồ web (SRS-5.1zzzzzzz206, chủ dự án 26/10/2026: "Đổi sang MapLibre + OpenFreeMap").
// Nền vector OpenFreeMap (dữ liệu OpenStreetMap, không khoá, không tính tiền theo lượt), ảnh vệ tinh Esri World Imagery.
// Chỉ hàm thuần + dựng phần tử DOM lúc gọi — không import maplibre-gl ở đây (component tự import động, tránh đụng `window` khi SSR).
import type { StyleSpecification } from "maplibre-gl";
import { formatPrice } from "@/lib/format";
import type { MapRow } from "@/lib/supabase";

export type NenBanDo = "sang" | "toi" | "ve_tinh";
export const NEN_BAN_DO: { id: NenBanDo; ten: string }[] = [
  { id: "sang", ten: "Bản đồ" },
  { id: "toi", ten: "Tối" },
  { id: "ve_tinh", ten: "Vệ tinh" },
];

const OFM = "https://tiles.openfreemap.org";

// Esri World Imagery: điều khoản dùng miễn phí cho web công khai CHƯA kiểm (SRS-206 mục 4) — đổi nguồn thì đổi ở đây.
const VE_TINH: StyleSpecification = {
  version: 8,
  glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    ve_tinh: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Ảnh vệ tinh © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "ve_tinh", type: "raster", source: "ve_tinh" }],
};

export function kieuNen(nen: NenBanDo): string | StyleSpecification {
  if (nen === "toi") return `${OFM}/styles/dark`;
  if (nen === "ve_tinh") return VE_TINH;
  return `${OFM}/styles/liberty`;
}

/** Tâm Sài Gòn, thứ tự MapLibre [lng, lat]. */
export const SG_TAM: [number, number] = [106.660172, 10.762622];

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export const maTin = (l: Pick<MapRow, "code" | "id">) => l.code ?? l.id.slice(0, 8);

/** Ghim giá: bán = nền đậm, thuê = nền trắng viền xanh (khớp chú thích trên trang /ban-do). */
export function ghimGia(l: MapRow): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = l.deal === "cho_thue" ? "ghim-gia ghim-gia--thue" : "ghim-gia";
  el.textContent = formatPrice(l.price_vnd, l.price_raw);
  el.setAttribute("aria-label", `${l.deal === "cho_thue" ? "Cho thuê" : "Bán"} ${el.textContent}`);
  return el;
}

export function popupCan(l: MapRow): string {
  const gia = formatPrice(l.price_vnd, l.price_raw);
  const noi = [l.street, l.ward, l.district].filter(Boolean).join(", ") || "Sài Gòn";
  return `<div class="popup-ban-do">
    <div class="popup-ban-do__nhan">${l.deal === "cho_thue" ? "Cho thuê" : "Đang bán"}</div>
    <div class="popup-ban-do__gia">${esc(gia)}</div>
    <div class="popup-ban-do__noi">${esc(noi)}</div>
    <a class="popup-ban-do__nut" href="/nha-dat/${encodeURIComponent(maTin(l))}">Xem chi tiết →</a>
  </div>`;
}

/** Nạp maplibre-gl + chỉ đúng file worker. MapLibre 6 tự tìm worker cạnh file của nó (`import.meta.url`), nhưng khi Next đóng gói thì
 *  file đó không đi theo → "Worker failed to load", bản đồ trống (bắt 26/10 khi chụp bản build). `new URL(…, import.meta.url)` để webpack
 *  phát file worker thành tài nguyên tĩnh của bản build — cùng phiên bản với gói đã cài, không chép tay vào public/. */
export async function napMapLibre() {
  const ml = await import("maplibre-gl");
  ml.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
  return ml;
}
