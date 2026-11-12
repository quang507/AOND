// Phần dùng chung của bản đồ web (SRS-5.1zzzzzzz206, chủ dự án 26/10/2026: "Đổi sang MapLibre + OpenFreeMap").
// Nền vector OpenFreeMap (dữ liệu OpenStreetMap, không khoá, không tính tiền theo lượt), ảnh vệ tinh Esri World Imagery.
// Chỉ hàm thuần + dựng phần tử DOM lúc gọi — không import maplibre-gl ở đây (component tự import động, tránh đụng `window` khi SSR).
import type { Map as BanDo, StyleSpecification } from "maplibre-gl";
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
const NGUON_VE_TINH = {
  type: "raster" as const,
  tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
  tileSize: 256,
  maxzoom: 19,
  attribution: "Ảnh vệ tinh © Esri, Maxar, Earthstar Geographics",
};

// SRS-5.1zzzzzzz442 (chủ dự án 12/11/2026 "Lấy 4 cái" từ bản đồ NhaDat-Radar): vệ tinh KHÔNG còn là ảnh trần. Radar ghi nhận người
// dùng nhìn ảnh vệ tinh không có tên đường thì không biết mình đang ở đâu → nạp kiểu "liberty" rồi chèn ảnh ngay DƯỚI lớp chữ đầu
// tiên: ảnh che nền + nét đường, tên đường / tên khu vẫn nằm trên.
function chenVeTinh(_cu: StyleSpecification | undefined, moi: StyleSpecification): StyleSpecification {
  const layers = [...moi.layers];
  const i = layers.findIndex((l) => l.type === "symbol");
  layers.splice(i < 0 ? layers.length : i, 0, { id: "ve_tinh", type: "raster", source: "ve_tinh" });
  return { ...moi, sources: { ...moi.sources, ve_tinh: NGUON_VE_TINH }, layers };
}

/** Kiểu nền lúc DỰNG bản đồ (luôn bắt đầu bằng "Bản đồ"). Đổi nền sau đó dùng `datNen`. */
export function kieuNen(nen: NenBanDo): string {
  return nen === "toi" ? `${OFM}/styles/dark` : `${OFM}/styles/liberty`;
}

/** Đổi nền. Vệ tinh = liberty + ảnh Esri chèn dưới lớp chữ. Lớp riêng của trang (dự án, đường) vẫn dựng lại ở "style.load". */
export function datNen(map: BanDo, nen: NenBanDo) {
  map.setStyle(kieuNen(nen), nen === "ve_tinh" ? { transformStyle: chenVeTinh, diff: false } : { diff: false });
}

// Chữ trên nút / hướng dẫn mặc định của MapLibre đang là tiếng Anh ("Zoom in") → tiếng Việt (SRS-5.1zzzzzzz442).
const TIENG_VIET: Record<string, string> = {
  "NavigationControl.ZoomIn": "Phóng to",
  "NavigationControl.ZoomOut": "Thu nhỏ",
  "NavigationControl.ResetBearing": "Xoay về hướng bắc",
  "FullscreenControl.Enter": "Xem toàn màn hình",
  "FullscreenControl.Exit": "Thoát toàn màn hình",
  "AttributionControl.ToggleAttribution": "Nguồn bản đồ",
  "AttributionControl.MapFeedback": "Góp ý bản đồ",
  "GeolocateControl.FindMyLocation": "Tìm vị trí của tôi",
  "GeolocateControl.LocationNotAvailable": "Không lấy được vị trí",
  "Popup.Close": "Đóng",
  "Marker.Title": "Ghim",
  "CooperativeGesturesHandler.WindowsHelpText": "Giữ Ctrl và cuộn chuột để phóng to bản đồ",
  "CooperativeGesturesHandler.MacHelpText": "Giữ ⌘ và cuộn chuột để phóng to bản đồ",
  "CooperativeGesturesHandler.MobileHelpText": "Dùng hai ngón tay để kéo bản đồ",
};

/** Tuỳ chọn chung khi `new Map`. `nhung`: bản đồ NHÚNG giữa trang (trang tag, trang căn) — trên màn cảm ứng vuốt một ngón phải cuộn
 *  được trang, hai ngón mới kéo bản đồ. Máy tính để nguyên (đưa chuột vào cuộn là phóng to, không bắt giữ Ctrl). Trang /ban-do chiếm
 *  cả màn hình nên không bật. */
export function tuyChonChung(nhung: boolean) {
  return {
    locale: TIENG_VIET,
    attributionControl: { compact: true },
    cooperativeGestures: nhung && typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  };
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

/** Popup danh sách khi nhiều căn nằm CÙNG một chỗ (toạ độ cấp đường — chưa có số nhà) nên phóng to không tách được (SRS-5.1zzzzzzz221). */
export const DS_CUM_TOI_DA = 30;
export function popupNhieuCan(rows: MapRow[]): string {
  const dong = rows.slice(0, DS_CUM_TOI_DA).map((l) => {
    const noi = [l.street, l.ward].filter(Boolean).join(", ");
    return `<a class="popup-ban-do__dong" href="/nha-dat/${encodeURIComponent(maTin(l))}">
      <span class="popup-ban-do__gia">${esc(formatPrice(l.price_vnd, l.price_raw))}</span>
      <span class="popup-ban-do__noi">${l.deal === "cho_thue" ? "Cho thuê" : "Bán"}${noi ? " · " + esc(noi) : ""}</span></a>`;
  });
  const con = rows.length - DS_CUM_TOI_DA;
  return `<div class="popup-ban-do popup-ban-do--ds">
    <div class="popup-ban-do__nhan">${rows.length} căn cùng vị trí trên bản đồ</div>
    <div class="popup-ban-do__ds">${dong.join("")}${con > 0 ? `<div class="popup-ban-do__noi">…và ${con} căn nữa</div>` : ""}</div>
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
