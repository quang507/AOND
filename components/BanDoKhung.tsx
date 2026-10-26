"use client";
// /ban-do — tìm THEO KHUNG đang xem + lớp dự án + lớp đường (SRS-5.1zzzzzzz206, chủ dự án 26/10/2026: "giữ OpenStreetMap, làm tìm theo
// khung + lớp dự án đường đi", chọn "Đổi sang MapLibre + OpenFreeMap"). Mỗi lần kéo / phóng xong (nghỉ 500 ms) gọi MỘT rpc `ban_do_khung`
// cho mọi lớp đang bật; mỗi lớp ≤ 300 điểm (giới hạn nằm trong hàm DB). Lớp đường chỉ xin khi khung ≤ 0,08° mỗi chiều — đúng ngưỡng hàm DB
// chặn (đo theo khung chứ không theo zoom: cùng zoom, màn rộng thấy khung rộng hơn).
// Khung đang xem ghi vào URL (`?khung=tây,nam,đông,bắc`) để gửi link; đọc ở trình duyệt nên trang vẫn tĩnh.
import { useCallback, useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as BanDo, MapLayerMouseEvent } from "maplibre-gl";
import ListingCard from "@/components/ListingCard";
import NutNenBanDo from "@/components/NutNenBanDo";
import { esc, ghimGia, kieuNen, napMapLibre, popupCan, SG_TAM, type NenBanDo } from "@/lib/ban-do";
import { supabase, type MapRow } from "@/lib/supabase";

type ThuVien = typeof import("maplibre-gl");
type DuAn = { slug: string | null; name: string; developer: string | null; district: string | null; status_text: string | null; lat: number; lng: number };
type Duong = { ten: string; loai: string; phuong: string | null; quan_cu: string | null; lat: number; lng: number };
type KetQua = { can: MapRow[]; du_an: DuAn[]; duong: Duong[] };
type Lop = keyof KetQua;

const TOI_DA = 300; // khớp `limit 300` trong ban_do_khung
const KHUNG_DUONG = 0.08; // khớp ngưỡng lớp đường trong ban_do_khung
const RONG: KetQua = { can: [], du_an: [], duong: [] };
const LOP: { id: Lop; ten: string; mau: string }[] = [
  { id: "can", ten: "Căn đang rao", mau: "#0b192c" },
  { id: "du_an", ten: "Dự án", mau: "#0f766e" },
  { id: "duong", ten: "Tên đường", mau: "#d97706" },
];

function diem(rows: { lat: number; lng: number }[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((r, i) => ({
      type: "Feature",
      id: i,
      properties: { i },
      geometry: { type: "Point", coordinates: [Number(r.lng), Number(r.lat)] },
    })),
  };
}

function khungTuUrl(): [[number, number], [number, number]] | null {
  const k = new URLSearchParams(window.location.search).get("khung")?.split(",").map(Number);
  if (!k || k.length !== 4 || k.some((x) => !Number.isFinite(x))) return null;
  return [[k[0], k[1]], [k[2], k[3]]];
}

export default function BanDoKhung() {
  const ref = useRef<HTMLDivElement>(null);
  const [tv, setTv] = useState<{ ml: ThuVien; map: BanDo } | null>(null);
  const [nen, setNen] = useState<NenBanDo>("sang");
  const nenDung = useRef<NenBanDo>("sang");
  const [lop, setLop] = useState<Record<Lop, boolean>>({ can: true, du_an: true, duong: true });
  const [timKhiKeo, setTimKhiKeo] = useState(true);
  const [daKeo, setDaKeo] = useState(false);
  const [kq, setKq] = useState<KetQua>(RONG);
  const kqRef = useRef<KetQua>(RONG);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState(false);
  const [zoomGan, setZoomGan] = useState(false);
  const luot = useRef(0);

  const tai = useCallback(async () => {
    if (!tv) return;
    const { map } = tv;
    const b = map.getBounds();
    const gan = b.getNorth() - b.getSouth() <= KHUNG_DUONG && b.getEast() - b.getWest() <= KHUNG_DUONG;
    setZoomGan(gan);
    const xin = (Object.keys(lop) as Lop[]).filter((k) => lop[k] && (k !== "duong" || gan));
    const so = ++luot.current;
    setDaKeo(false);
    if (xin.length === 0) {
      setKq(RONG);
      return;
    }
    setDangTai(true);
    const khung = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => Number(x.toFixed(5)));
    const { data, error } = await supabase.rpc("ban_do_khung", {
      p_tay: khung[0],
      p_nam: khung[1],
      p_dong: khung[2],
      p_bac: khung[3],
      p_lop: xin,
    });
    if (so !== luot.current) return; // đã có lượt mới hơn
    setDangTai(false);
    if (error) {
      setLoi(true);
      return;
    }
    setLoi(false);
    setKq({ ...RONG, ...(data as Partial<KetQua>) });
    window.history.replaceState(null, "", `?khung=${khung.join(",")}`);
  }, [tv, lop]);

  // Dựng bản đồ một lần.
  useEffect(() => {
    let huy = false;
    let map: BanDo | null = null;
    (async () => {
      const ml = await napMapLibre();
      if (huy || !ref.current) return;
      const khung = khungTuUrl();
      map = new ml.Map({
        container: ref.current,
        style: kieuNen("sang"),
        center: SG_TAM,
        zoom: 12,
        attributionControl: { compact: true },
        ...(khung ? { bounds: khung } : {}),
      });
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-left");

      // Lớp dự án + đường: GeoJSON vẽ bằng WebGL. setStyle (đổi nền) xoá nguồn → dựng lại mỗi lần style nạp xong.
      const m = map;
      m.on("style.load", () => {
        for (const id of ["du_an", "duong"] as const) {
          if (m.getSource(id)) continue;
          m.addSource(id, { type: "geojson", data: diem(kqRef.current[id]) });
          m.addLayer({
            id,
            type: "circle",
            source: id,
            paint:
              id === "du_an"
                ? { "circle-radius": 6, "circle-color": "#0f766e", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" }
                : { "circle-radius": 4, "circle-color": "#d97706", "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff" },
          });
        }
      });
      const moPopup = (id: "du_an" | "duong") => (e: MapLayerMouseEvent) => {
        const i = Number(e.features?.[0]?.properties?.i);
        const html =
          id === "du_an"
            ? (() => {
                const d = kqRef.current.du_an[i];
                if (!d) return null;
                const phu = [d.developer, d.district, d.status_text].filter(Boolean).join(" · ");
                return `<div class="popup-ban-do"><div class="popup-ban-do__nhan" style="color:#0f766e">Dự án</div>
                  <div class="popup-ban-do__gia">${esc(d.name)}</div>${phu ? `<div class="popup-ban-do__noi">${esc(phu)}</div>` : ""}
                  ${d.slug ? `<a class="popup-ban-do__nut" style="background:#0f766e" href="/du-an/${encodeURIComponent(d.slug)}">Xem dự án →</a>` : ""}</div>`;
              })()
            : (() => {
                const d = kqRef.current.duong[i];
                if (!d) return null;
                const noi = [d.phuong, d.quan_cu].filter(Boolean).join(", ");
                return `<div class="popup-ban-do"><div class="popup-ban-do__nhan" style="color:#d97706">Tên đường</div>
                  <div class="popup-ban-do__gia">${esc(d.ten)}</div>${noi ? `<div class="popup-ban-do__noi">${esc(noi)}</div>` : ""}
                  <div class="popup-ban-do__noi">Một điểm đại diện của con đường, không phải số nhà.</div></div>`;
              })();
        if (html) new ml.Popup({ offset: 10, maxWidth: "260px" }).setLngLat(e.lngLat).setHTML(html).addTo(m);
      };
      for (const id of ["du_an", "duong"] as const) {
        m.on("click", id, moPopup(id));
        m.on("mouseenter", id, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", id, () => (m.getCanvas().style.cursor = ""));
      }
      m.once("load", () => setTv({ ml, map: m }));
    })();
    return () => {
      huy = true;
      map?.remove();
    };
  }, []);

  // Tải lần đầu + mỗi khi bật / tắt lớp.
  useEffect(() => {
    tai();
  }, [tai]);

  // Kéo / phóng xong: tự tìm (nghỉ 500 ms) hoặc hiện nút "Tìm trong khung này".
  useEffect(() => {
    if (!tv) return;
    let hen: ReturnType<typeof setTimeout> | undefined;
    const khiDung = () => {
      clearTimeout(hen);
      if (timKhiKeo) hen = setTimeout(tai, 500);
      else setDaKeo(true);
    };
    tv.map.on("moveend", khiDung);
    return () => {
      clearTimeout(hen);
      tv.map.off("moveend", khiDung);
    };
  }, [tv, tai, timKhiKeo]);

  useEffect(() => {
    if (!tv || nenDung.current === nen) return;
    nenDung.current = nen;
    tv.map.setStyle(kieuNen(nen));
  }, [tv, nen]);

  // Vẽ kết quả: căn = ghim giá HTML, dự án / đường = cập nhật nguồn GeoJSON.
  useEffect(() => {
    kqRef.current = kq;
    if (!tv) return;
    const { ml, map } = tv;
    for (const id of ["du_an", "duong"] as const) {
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(diem(kq[id]));
    }
    const ghim = kq.can
      .filter((l) => l.lat && l.lng)
      .map((l) =>
        new ml.Marker({ element: ghimGia(l) })
          .setLngLat([Number(l.lng), Number(l.lat)])
          .setPopup(new ml.Popup({ offset: 14, maxWidth: "260px" }).setHTML(popupCan(l)))
          .addTo(map),
      );
    return () => ghim.forEach((g) => g.remove());
  }, [tv, kq]);

  const dem: Record<Lop, number> = { can: kq.can.length, du_an: kq.du_an.length, duong: kq.duong.length };

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {LOP.map((l) => (
            <label key={l.id} className="inline-flex min-h-9 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={lop[l.id]}
                onChange={(e) => setLop((cu) => ({ ...cu, [l.id]: e.target.checked }))}
                className="h-4 w-4 accent-brand"
              />
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.mau }} aria-hidden />
              <span className="font-semibold">{l.ten}</span>
              {lop[l.id] && (l.id !== "duong" || zoomGan) && <span className="text-mute">({dem[l.id]})</span>}
            </label>
          ))}
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 sm:ml-auto">
            <input type="checkbox" checked={timKhiKeo} onChange={(e) => setTimKhiKeo(e.target.checked)} className="h-4 w-4 accent-brand" />
            <span>Tìm khi di chuyển bản đồ</span>
          </label>
        </div>

        <div className="relative h-[62vh] min-h-96 overflow-hidden rounded-king border border-line lg:h-[74vh]">
          <div ref={ref} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center px-14 sm:top-3">
            {daKeo && !timKhiKeo ? (
              <button
                type="button"
                onClick={tai}
                className="pointer-events-auto min-h-9 rounded bg-brand px-4 text-sm font-bold text-white shadow-md hover:bg-brand-dark"
              >
                Tìm trong khung này
              </button>
            ) : loi ? (
              <button
                type="button"
                onClick={tai}
                className="pointer-events-auto min-h-9 rounded border border-line bg-white px-4 text-sm font-semibold text-navy shadow-md"
              >
                Chưa tải được khung này · Tải lại
              </button>
            ) : dangTai ? (
              <span className="rounded bg-white/90 px-3 py-1 text-xs font-semibold text-mute shadow">Đang tải…</span>
            ) : lop.duong && !zoomGan ? (
              <span className="rounded bg-white/90 px-3 py-1 text-xs font-semibold text-mute shadow">
                Phóng gần hơn để thấy tên đường
              </span>
            ) : null}
          </div>
          <NutNenBanDo nen={nen} doiNen={setNen} />
        </div>
        {(dem.can >= TOI_DA || dem.du_an >= TOI_DA || dem.duong >= TOI_DA) && (
          <p className="mt-2 text-xs text-mute">
            Khung này có hơn {TOI_DA} điểm ở một lớp, bản đồ chỉ hiện {TOI_DA} — phóng gần hơn để xem đủ.
          </p>
        )}
      </div>

      <aside className="hidden max-h-[calc(74vh+48px)] space-y-4 overflow-y-auto pr-1 lg:block">
        {kq.can.length === 0 ? (
          <p className="text-sm text-mute">
            {lop.can ? "Khung này chưa có căn nào đang rao. Kéo hoặc thu nhỏ bản đồ để xem vùng khác." : "Đang tắt lớp căn."}
          </p>
        ) : (
          <>
            <p className="text-xs font-medium text-mute">
              {kq.can.length > 30 ? `30 / ${kq.can.length}` : kq.can.length} căn mới nhất trong khung
            </p>
            {kq.can.slice(0, 30).map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
