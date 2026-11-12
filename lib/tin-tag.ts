// SRS-5.1zzzzzzz447: tin của một trang tag, theo trang — trang tag (trang 1, dựng ISR) và /api/tin (trang 2 trở đi khi cuộn) dùng
// chung, để tin tải thêm đúng bộ lọc của tag. Tách khỏi app/[tag]/page.tsx vì file page không được export hàm tuỳ ý.
import { unstable_cache } from "next/cache";
import { CARD_COLS, supabase, type ListingCard as CardRow, TRANG_THAI_HIEN } from "@/lib/supabase";
import { tagBySlug } from "@/lib/tags";

export const MOI_TRANG_TAG = 24;

async function _layTinTag(slug: string, trang = 1) {
  const t = tagBySlug(slug);
  if (!t) return { rows: [] as CardRow[], total: 0 };
  let q = supabase
    .from("listings")
    .select(CARD_COLS, { count: "exact" })
    .eq("deal", t.filter.deal)
    .in("status", TRANG_THAI_HIEN) // FR-139: chỉ tin đang lên kệ
    .not("price_raw", "is", null)
    .neq("price_raw", "")
    .gt("price_vnd", 0);
  if (t.filter.types?.length) q = q.in("property_type", t.filter.types);
  if (t.filter.access?.length) q = q.in("access_type", t.filter.access);
  if (t.filter.priceMax) q = q.lt("price_vnd", t.filter.priceMax);
  if (t.filter.bedroomsMin) q = q.gte("bedrooms", t.filter.bedroomsMin);
  if (t.filter.legal?.length) q = q.in("legal_status", t.filter.legal);
  if (t.filter.districts?.length) q = q.in("district", t.filter.districts); // SRS-5.1zzzzzzz433: IN, không ilike ("Quận 1" ≠ Quận 10)
  const tu = (trang - 1) * MOI_TRANG_TAG;
  const { data, count } = await q.order("created_at", { ascending: false }).order("id", { ascending: true }).range(tu, tu + MOI_TRANG_TAG - 1);
  return { rows: (data ?? []) as CardRow[], total: count ?? 0 };
}

export const layTinTag = unstable_cache(_layTinTag, ["tin-tag-v1"], { revalidate: 3600, tags: ["listings"] });
