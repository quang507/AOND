import mogiProjects from "../data/mogi_projects.json";

export type CrawledProject = {
  name: string;
  slug: string;
  mogi_url: string;
  investor: string;
  address: string;
  district: string;
  province: string;
  handover: string;
  price_range: string;
  price_per_m2: string;
  cover_image: string;
  status_tags: string[];
};

export const CRAWLED_PROJECTS: CrawledProject[] = mogiProjects as CrawledProject[];

export function getProvinceCounts(): Record<string, number> {
  const counts: Record<string, number> = {
    "Tất cả": CRAWLED_PROJECTS.length,
    "Hồ Chí Minh": 0,
    "Bình Dương": 0,
    "Đồng Nai": 0,
    "Long An": 0,
    "Tây Ninh": 0,
  };

  for (const p of CRAWLED_PROJECTS) {
    if (counts[p.province] !== undefined) {
      counts[p.province]++;
    } else {
      counts[p.province] = 1;
    }
  }

  return counts;
}

export function searchCrawledProjects(options: {
  query?: string;
  province?: string;
  district?: string;
  page?: number;
  pageSize?: number;
}) {
  const { query = "", province = "all", district = "all", page = 1, pageSize = 24 } = options;
  const q = query.trim().toLowerCase();

  let filtered = CRAWLED_PROJECTS;

  if (province !== "all") {
    filtered = filtered.filter((p) =>
      p.province.toLowerCase().includes(province.toLowerCase())
    );
  }

  if (district !== "all") {
    filtered = filtered.filter((p) =>
      p.district.toLowerCase().includes(district.toLowerCase())
    );
  }

  if (q) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.investor.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.district.toLowerCase().includes(q)
    );
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    total,
    totalPages,
    page,
    pageSize,
  };
}

export function getCrawledProjectBySlug(slug: string): CrawledProject | null {
  const norm = slug.trim().toLowerCase();
  return (
    CRAWLED_PROJECTS.find(
      (p) => p.slug.toLowerCase() === norm || p.slug.toLowerCase().includes(norm)
    ) ?? null
  );
}
