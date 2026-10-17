// Thống kê giá theo phường (FR-120 — port ý tưởng từ NhaDat-Radar /thong-ke,
// tính từ chính kho tin Quận 5 của mình). SSR + ISR 1h.
import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { zaloLink } from "@/lib/format";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Giá nhà đất Quận 5 theo phường",
  description:
    "Giá rao trung bình mỗi m² nhà đất Quận 5 theo từng phường, tính từ tin rao đang có trên AI Ơi Nhà Đất.",
};

const VND = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

type Row = { ward: string; count: number; avgPerM2: number; min: number; max: number };

export default async function Page() {
  const { data } = await supabase
    .from("listings")
    .select("ward, price_vnd, area_m2")
    .eq("deal", "ban")
    .in("status", ["dang_ban", "dang_quan_tam"]) // FR-139: thống kê trên tin đang bán
    .gt("price_vnd", 0)
    .gt("area_m2", 0);

  const byWard = new Map<string, { perM2: number[]; prices: number[] }>();
  for (const l of data ?? []) {
    if (!l.ward) continue;
    const g = byWard.get(l.ward) ?? { perM2: [], prices: [] };
    g.perM2.push(Number(l.price_vnd) / Number(l.area_m2));
    g.prices.push(Number(l.price_vnd));
    byWard.set(l.ward, g);
  }
  const rows: Row[] = [...byWard.entries()]
    .map(([ward, g]) => ({
      ward,
      count: g.perM2.length,
      avgPerM2: g.perM2.reduce((a, b) => a + b, 0) / g.perM2.length,
      min: Math.min(...g.prices),
      max: Math.max(...g.prices),
    }))
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.avgPerM2 - a.avgPerM2);

  const maxAvg = Math.max(...rows.map((r) => r.avgPerM2), 1);
  const total = (data ?? []).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-extrabold [text-wrap:balance]">
        Giá nhà đất Quận 5 - nhìn theo phường
      </h1>
      <p className="mt-2 max-w-xl text-mute">
        Tính từ {total} tin đang rao bán có đủ giá và diện tích trên AI Ơi Nhà Đất.
        Đây là giá rao, không phải giá chốt - muốn biết giá chốt thật của khu nào,
        nhắn tụi em.
      </p>

      <div className="mt-8 overflow-hidden rounded-king border border-line bg-white">
        {rows.map((r, i) => (
          <Link
            key={r.ward}
            href={`/mua-ban?phuong=${encodeURIComponent(r.ward)}`}
            className="flex items-center gap-4 border-b border-line px-5 py-3.5 transition last:border-0 hover:bg-cream"
          >
            <span className="w-6 text-sm font-bold text-mute/70 tabular-nums">{i + 1}</span>
            <span className="w-24 shrink-0 font-semibold">{r.ward}</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-cream">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-brand/70"
                style={{ width: `${(r.avgPerM2 / maxAvg) * 100}%` }}
              />
            </span>
            <span className="w-28 text-right font-bold text-brand tabular-nums">
              {VND.format(Math.round(r.avgPerM2 / 1_000_000))} tr/m²
            </span>
            <span className="hidden w-14 text-right text-xs text-mute tabular-nums sm:block">
              {r.count} tin
            </span>
          </Link>
        ))}
        {rows.length === 0 && (
          <p className="p-8 text-center text-mute">
            Chưa đủ dữ liệu để thống kê - quay lại sau vài ngày nữa.
          </p>
        )}
      </div>

      <p className="mt-3 text-xs text-mute/70">
        Phường có dưới 2 tin không được tính để tránh lệch. Giá tr/m² làm tròn.
      </p>

      <a
        href={zaloLink("thongke")}
        className="mt-8 inline-block rounded-md bg-zalo px-6 py-3 font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
      >
        Hỏi giá thật khu anh chị đang nhắm
      </a>
    </div>
  );
}
