"use client";
// Bản đồ ghim giá dùng chung (WardMap, BrowseWithMap). SRS-5.1zzzzzzz206: MapLibre + nền OpenFreeMap thay Leaflet + ảnh ô OSM.
// maplibre-gl import ĐỘNG trong effect (thư viện đụng `window`, component này còn được SSR qua BrowseWithMap).
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as BanDo } from "maplibre-gl";
import NutNenBanDo from "@/components/NutNenBanDo";
import { ghimGia, kieuNen, maTin, napMapLibre, popupCan, SG_TAM, type NenBanDo } from "@/lib/ban-do";
import type { MapRow } from "@/lib/supabase";
import { wardPoint } from "@/lib/geo";

type ThuVien = typeof import("maplibre-gl");

export default function MapView({
  listings,
  center,
  zoom = 13,
}: {
  listings: MapRow[];
  /** [lat, lng] như lib/geo; có tâm thì không tự canh khung theo ghim. */
  center?: [number, number];
  zoom?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tv, setTv] = useState<{ ml: ThuVien; map: BanDo } | null>(null);
  const [nen, setNen] = useState<NenBanDo>("sang");
  const nenDung = useRef<NenBanDo>("sang");

  useEffect(() => {
    let huy = false;
    let map: BanDo | null = null;
    (async () => {
      const ml = await napMapLibre();
      if (huy || !ref.current) return;
      map = new ml.Map({
        container: ref.current,
        style: kieuNen("sang"),
        center: center ? [center[1], center[0]] : SG_TAM,
        zoom,
        attributionControl: { compact: true },
      });
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-left");
      setTv({ ml, map });
    })();
    return () => {
      huy = true;
      map?.remove();
    };
    // Tạo bản đồ MỘT lần; tâm / zoom ban đầu không đổi theo prop.
  }, []);

  useEffect(() => {
    if (!tv || nenDung.current === nen) return;
    nenDung.current = nen;
    tv.map.setStyle(kieuNen(nen));
  }, [tv, nen]);

  useEffect(() => {
    if (!tv) return;
    const { ml, map } = tv;
    const ghim: InstanceType<ThuVien["Marker"]>[] = [];
    const khung = new ml.LngLatBounds();
    for (const l of listings) {
      const p = l.lat && l.lng ? [Number(l.lat), Number(l.lng)] : wardPoint(l.ward, maTin(l));
      if (!p) continue;
      const ll: [number, number] = [p[1], p[0]];
      ghim.push(
        new ml.Marker({ element: ghimGia(l) })
          .setLngLat(ll)
          .setPopup(new ml.Popup({ offset: 14, maxWidth: "260px" }).setHTML(popupCan(l)))
          .addTo(map),
      );
      khung.extend(ll);
    }
    if (ghim.length > 0 && !center) map.fitBounds(khung, { padding: 40, maxZoom: 15, duration: 0 });
    return () => ghim.forEach((g) => g.remove());
  }, [tv, listings, center]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />
      <NutNenBanDo nen={nen} doiNen={setNen} />
    </div>
  );
}
