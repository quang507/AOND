"use client";
// Bản đồ Leaflet + OpenStreetMap (FR-122, port ý tưởng từ NhaDat-Radar).
// Leaflet đụng window lúc import nên phải import động trong useEffect.
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { MapRow } from "@/lib/supabase";
import { formatPrice } from "@/lib/format";
import { Q5_CENTER, wardPoint } from "@/lib/geo";

export default function MapView({
  listings,
  center,
  zoom = 15,
}: {
  listings: MapRow[];
  /** FR-10: trang tin đặt tâm ở phường của tin; mặc định tâm Quận 5 (/ban-do). */
  center?: [number, number];
  zoom?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current).setView(center ?? Q5_CENTER, zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      for (const l of listings) {
        const code = l.code ?? l.id.slice(0, 8);
        // Toạ độ geocode từ địa chỉ tương đối (FR-122); thiếu thì rơi về tâm phường
        const p: [number, number] | null =
          l.lat && l.lng ? [Number(l.lat), Number(l.lng)] : wardPoint(l.ward, code);
        if (!p) continue;
        const marker = L.circleMarker(p, {
          radius: 9,
          color: "#e60023",
          weight: 2,
          fillColor: "#e60023",
          fillOpacity: l.deal === "cho_thue" ? 0.25 : 0.65,
        }).addTo(map);
        // Popup là CHUỖI HTML, không phải JSX: price_raw và ward là chữ người bán
        // gõ, phải escape trước khi nhét vào.
        const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
        marker.bindPopup(
          `<div style="font-family:inherit;min-width:170px">
            <strong>${esc(formatPrice(l.price_vnd, l.price_raw))}</strong> · ${esc(l.ward ?? "")}<br/>
            <span style="color:#687686">#${esc(code)} · ${l.deal === "cho_thue" ? "cho thuê" : "bán"}</span><br/>
            <a href="/nha-dat/${encodeURIComponent(code)}" style="color:#e60023;font-weight:700">Xem tin -</a>
          </div>`,
        );
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [listings, center, zoom]);

  return <div ref={ref} className="h-full w-full" />;
}
