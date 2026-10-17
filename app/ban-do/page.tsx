import type { Metadata } from "next";
import MapView from "@/components/MapView";
import ListingCard from "@/components/ListingCard";
import { MAP_COLS, supabase, type MapRow } from "@/lib/supabase";

export const revalidate = 10800; // SRS-5.1zl (03/10/2026): 5 phút → 3 giờ, giảm egress Supabase
export const metadata: Metadata = {
  title: "Bản đồ nhà đất",
  description:
    "Xem nhà đất đang bán và cho thuê trên bản đồ, vị trí hiển thị theo phường (kho hiện tập trung khu Quận 5 cũ).",
};

export default async function Page() {
  // FR-171 j: 300 dòng này đi thẳng vào HTML (MapView là client component),
  // kéo "*" là nhét 300 mô tả vào trang; MAP_COLS chỉ lấy cột thẻ + toạ độ.
  const { data } = await supabase
    .from("listings")
    .select(MAP_COLS)
    .in("status", ["dang_ban", "dang_quan_tam"]) // FR-139: chỉ tin đang lên kệ
    .not("price_raw", "is", null)
    .neq("price_raw", "")
    .not("ward", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  const listings = (data ?? []) as MapRow[];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Bản đồ nhà đất</h1>
        <p className="text-sm text-mute">
          {listings.length} tin · chấm đậm = bán, chấm nhạt = cho thuê
        </p>
      </div>
      <p className="mt-1 text-xs text-mute/70">
        Chấm theo địa chỉ trên tin (đường/hẻm, chưa tới số nhà) - địa chỉ chính
        xác tụi em chia sẻ khi hẹn xem nhà.
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="h-[62vh] min-h-96 overflow-hidden rounded-king border border-line lg:h-[74vh]">
          <MapView listings={listings} />
        </div>
        <aside className="hidden max-h-[74vh] space-y-4 overflow-y-auto pr-1 lg:block">
          {listings.slice(0, 12).map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </aside>
      </div>
    </div>
  );
}
