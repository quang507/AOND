"use client";
// Nút đổi nền bản đồ: Bản đồ / Tối / Vệ tinh (SRS-5.1zzzzzzz206). Đặt góc trên trái, cạnh nút phóng to / thu nhỏ: góc dưới trái bị
// nút Chat Zalo nổi của web che (thấy khi chụp 26/10), góc trên phải của BrowseWithMap có nút "Đóng bản đồ".
import { NEN_BAN_DO, type NenBanDo } from "@/lib/ban-do";

export default function NutNenBanDo({ nen, doiNen }: { nen: NenBanDo; doiNen: (n: NenBanDo) => void }) {
  return (
    <div
      role="group"
      aria-label="Nền bản đồ"
      className="absolute left-12 top-2.5 z-10 flex overflow-hidden rounded border border-line bg-white text-xs font-bold shadow-md"
    >
      {NEN_BAN_DO.map((n) => (
        <button
          key={n.id}
          type="button"
          aria-pressed={nen === n.id}
          onClick={() => doiNen(n.id)}
          className={`min-h-9 px-3 transition ${nen === n.id ? "bg-navy text-white" : "text-navy hover:bg-surface-tint"}`}
        >
          {n.ten}
        </button>
      ))}
    </div>
  );
}
