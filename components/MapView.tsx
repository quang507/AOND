"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { MapRow } from "@/lib/supabase";
import { formatPrice } from "@/lib/format";
import { wardPoint } from "@/lib/geo";

const SG_CENTER: [number, number] = [10.762622, 106.660172]; // Sài Gòn trung tâm

export default function MapView({
  listings,
  center,
  zoom = 13,
}: {
  listings: MapRow[];
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

      map = L.map(ref.current).setView(center ?? SG_CENTER, zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const esc = (s: string) =>
        s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

      const bounds: [number, number][] = [];

      for (const l of listings) {
        const code = l.code ?? l.id.slice(0, 8);
        const p: [number, number] | null =
          l.lat && l.lng ? [Number(l.lat), Number(l.lng)] : wardPoint(l.ward, code);
        if (!p) continue;

        bounds.push(p);

        const priceText = formatPrice(l.price_vnd, l.price_raw);

        // Price badge marker matching Batdongsan.com.vn in Image 2
        const priceIcon = L.divIcon({
          className: "custom-price-badge",
          html: `<div style="background:#0b192c;color:#ffffff;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;border:1.5px solid #0068ff;box-shadow:0 3px 8px rgba(0,0,0,0.3);white-space:nowrap;display:inline-flex;align-items:center;gap:3px;cursor:pointer;transform:translate(-50%,-50%);transition:all .15s ease;">
            <span>${esc(priceText)}</span>
          </div>`,
          iconSize: [0, 0],
        });

        const marker = L.marker(p, { icon: priceIcon }).addTo(map);

        marker.bindPopup(
          `<div style="font-family:inherit;min-width:190px;padding:4px 0;">
            <div style="font-size:11px;font-weight:700;color:#0068ff;text-transform:uppercase;margin-bottom:2px;">
              ${l.deal === "cho_thue" ? "Cho thuê" : "Đang bán"}
            </div>
            <div style="font-weight:800;font-size:14px;color:#0b192c;margin-bottom:3px;">
              ${esc(priceText)}
            </div>
            <div style="font-size:12px;color:#64748b;margin-bottom:6px;">
              ${esc(l.ward ? `${l.ward}, ` : "")}${esc(l.district ?? "Sài Gòn")}
            </div>
            <a href="/nha-dat/${encodeURIComponent(code)}" style="display:inline-block;background:#0068ff;color:#fff;padding:4px 10px;border-radius:4px;font-size:11px;font-weight:700;text-decoration:none;">
              Xem chi tiết →
            </a>
          </div>`,
        );
      }

      if (bounds.length > 0 && !center && map) {
        try {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        } catch {
          /* ignore fitBounds edge cases */
        }
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [listings, center, zoom]);

  return <div ref={ref} className="h-full w-full" />;
}
