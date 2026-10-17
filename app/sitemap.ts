import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { TAG_DEFS } from "@/lib/tags";
import { SITE_URL } from "@/lib/format";

// NFR-09 / FR-17 — sitemap: trang tĩnh + trang tag (FR-12) + mọi tin đang lên
// kệ. Dựng lúc build, làm mới mỗi giờ như trang tag.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const tinh: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/mua-ban`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/cho-thue`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/ban-do`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/thong-ke`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/tinh-lai-vay`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/moi-gioi`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/raoban`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];
  const tag: MetadataRoute.Sitemap = TAG_DEFS.map((t) => ({
    url: `${SITE_URL}/${t.slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.7,
  }));
  const [{ data }, { data: duAn }] = await Promise.all([
    supabase
      .from("listings")
      .select("code, updated_at")
      .in("status", ["dang_ban", "dang_quan_tam"])
      .not("code", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5000),
    // FR-117: trang dự án. `/ds/{token}` CỐ Ý không vào sitemap (noindex, IA-11).
    supabase.from("projects").select("slug, updated_at").not("slug", "is", null).limit(500),
  ]);
  const tin: MetadataRoute.Sitemap = (data ?? []).map((l) => ({
    url: `${SITE_URL}/nha-dat/${encodeURIComponent(l.code as string)}`,
    lastModified: l.updated_at ? new Date(l.updated_at as string) : now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  const da: MetadataRoute.Sitemap = (duAn ?? []).map((p) => ({
    url: `${SITE_URL}/du-an/${encodeURIComponent(p.slug as string)}`,
    lastModified: p.updated_at ? new Date(p.updated_at as string) : now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  return [...tinh, ...tag, ...da, ...tin];
}
