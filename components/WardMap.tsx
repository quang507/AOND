"use client";
// FR-10 — bản đồ MỨC PHƯỜNG trên trang tin. Bọc MapView bằng `next/dynamic`
// ssr:false (Leaflet đụng `window`) — Next 15 chỉ cho ssr:false trong client
// component, nên phải có lớp vỏ này chứ trang tin (server) không import thẳng.
//
// Cố ý KHÔNG truyền lat/lng thật: chấm rơi về `wardPoint` (tâm phường + jitter
// theo mã tin) — buyer chỉ thấy khu vực cho tới khi hẹn xem nhà (FR-104).
import dynamic from "next/dynamic";
import type { MapRow } from "@/lib/supabase";
import { WARD_CENTROIDS } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-navy/5" />,
});

export default function WardMap({ listing }: { listing: MapRow }) {
  const c = listing.ward ? WARD_CENTROIDS[listing.ward] : null;
  if (!c) return null;
  const row: MapRow = { ...listing, lat: null, lng: null };
  return (
    <div className="h-64 w-full overflow-hidden rounded-shot border border-line">
      <MapView listings={[row]} center={c} zoom={15} />
    </div>
  );
}
