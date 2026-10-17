import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ListingCard from "@/components/ListingCard";
import { coverByCode } from "@/lib/photos";
import { CARD_COLS, supabase, type ListingCard as CardRow } from "@/lib/supabase";
import { formatPrice, placeholderImg, sanitizeDescription, SITE_URL, zaloLink } from "@/lib/format";

// FR-117 (dựng 04/09/2026) — trang dự án `/du-an/{slug}`, SSG từ bảng
// `projects` (SRS-3.10; anon đọc được qua `anon_read_projects`). Có
// generateStaticParams (rỗng, xem dưới) nên build ra ● (NFR-17); mọi slug
// render on-demand rồi nằm cache — dự án mới không cần build lại.
// Phần "quản lý giỏ hàng cho admin/NMG" của FR-117 CHƯA dựng: `unit_status`
// hiện chỉ đọc; đổi qua bảng `deals`/sửa tin (SRS-3.10).
//
// TTL THẬT LÀ 5 PHÚT, không phải 1 giờ (soát build 05/09/2026 — bảng route báo
// `5m`). Cùng nguyên nhân với /[tag]: `coverByCode` đặt `unstable_cache` TTL
// 300, và Next 15 lấy MIN của revalidate segment với mọi cache lồng trong.
// Câu cũ ở đây khai "ISR 1 giờ" — sai, đã sửa.
export const revalidate = 3600;

type DuAn = {
  id: string; name: string; slug: string; developer: string | null;
  district: string | null; ward: string | null; province: string | null; location_raw: string | null;
  legal_status: string | null; status_text: string | null; handover: string | null; handover_date: string | null;
  description: string | null; price_min: number | null; price_max: number | null; is_partner: boolean | null;
  unit_types: unknown; amenities: unknown; images: unknown; specs: unknown;
};

// Tin trong dự án: thẻ + mã căn / tình trạng căn (FR-113).
type TinDuAn = CardRow & { unit_code: string | null; unit_status: string | null };
const TT_CAN: Record<string, string> = { con_ban: "còn bán", giu_cho: "giữ chỗ", da_coc: "đã cọc", da_ban: "đã bán" };

// 02/10/2026 (đo Supabase, workflow do-supabase.yml): bản cũ trả slug của CẢ 1.639 dự án nên MỖI lượt build (CI mỗi PR,
// Vercel preview, Vercel production) dựng sẵn 1.639 trang × 2 truy vấn. pg_stat_statements từ 22/08: hai truy vấn của trang
// này là 3,25/3,89 triệu request REST của cả project (83%) - kéo theo egress và log ingestion vượt gói Free. Trả mảng RỖNG
// thì route vẫn là ● (Next 15: mảng rỗng = dựng lần đầu có người xem rồi nằm cache, vẫn ISR theo `revalidate`) - chỉ trang
// có người/bot tìm kiếm xem mới tốn truy vấn. Đừng trả lại danh sách đầy đủ.
export async function generateStaticParams() {
  return [];
}

const getProject = cache(async (slug: string): Promise<DuAn | null> => {
  const { data } = await supabase
    .from("projects")
    .select("id, name, slug, developer, district, ward, province, location_raw, legal_status, status_text, handover, handover_date, description, price_min, price_max, is_partner, unit_types, amenities, images, specs")
    .eq("slug", slug)
    .maybeSingle();
  return (data as DuAn | null) ?? null;
});

function viTri(p: DuAn): string {
  return [p.ward, p.district, p.province].filter(Boolean).join(", ");
}

// `images` là jsonb tự do (mảng URL hoặc mảng {url}) — chỉ nhận chuỗi http(s).
function anhDuAn(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { url?: unknown }).url === "string" ? (x as { url: string }).url : ""))
    .filter((u) => /^https?:\/\//.test(u))
    .slice(0, 12);
}
function chuoi(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
type LoaiCan = { name?: string; specs?: Record<string, unknown>; units?: unknown };
function loaiCan(v: unknown): LoaiCan[] {
  return Array.isArray(v) ? v.filter((x): x is LoaiCan => !!x && typeof x === "object") : [];
}
const NHAN_SPEC: Record<string, string> = {
  so_tang: "Số tầng", mat_tien: "Mặt tiền", so_phong_ngu: "Phòng ngủ", bo_tri: "Bố trí",
  ban_giao: "Bàn giao", thang_may: "Thang máy", ghi_chu: "Ghi chú", cong: "Cổng",
  vi_tri: "Vị trí", ket_cau: "Kết cấu", tong_so_can: "Tổng số căn",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProject(decodeURIComponent(slug));
  if (!p) return { title: "Không tìm thấy dự án" };
  const title = `Dự án ${p.name}${p.district ? ` - ${p.district}` : ""}`;
  const description = (p.description ? sanitizeDescription(p.description) : `${p.name}${p.developer ? ` của ${p.developer}` : ""}, ${viTri(p)}.`).slice(0, 155);
  const url = `/du-an/${encodeURIComponent(p.slug)}`;
  const img = anhDuAn(p.images)[0] ?? placeholderImg(p.slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: [{ url: img, alt: p.name }] },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const p = await getProject(decodeURIComponent(raw));
  if (!p) notFound();

  const { data } = await supabase
    .from("listings")
    .select(`${CARD_COLS}, unit_code, unit_status`)
    .eq("project_id", p.id)
    .in("status", ["dang_ban", "dang_quan_tam"]) // FR-139: chỉ tin đang lên kệ
    .order("unit_code", { ascending: true, nullsFirst: false })
    .limit(60);
  const tin = (data ?? []) as unknown as TinDuAn[];
  const covers = await coverByCode(tin.map((l) => l.code));
  const anh = anhDuAn(p.images);
  const tienIch = chuoi(p.amenities);
  const loai = loaiCan(p.unit_types);
  const specs = p.specs && typeof p.specs === "object" ? Object.entries(p.specs as Record<string, unknown>) : [];
  // Giá min–max: cột dự án nếu có, không thì suy từ tin đang lên kệ.
  const giaTin = tin.map((l) => l.price_vnd).filter((v): v is number => !!v && v > 0);
  const giaMin = p.price_min ?? (giaTin.length ? Math.min(...giaTin) : null);
  const giaMax = p.price_max ?? (giaTin.length ? Math.max(...giaTin) : null);
  const url = `${SITE_URL}/du-an/${encodeURIComponent(p.slug)}`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": url,
    url,
    name: p.name,
    description: sanitizeDescription(p.description).slice(0, 500),
    image: anh.length ? anh : undefined,
    address: { "@type": "PostalAddress", addressLocality: p.ward ?? undefined, addressRegion: p.district ?? undefined, addressCountry: "VN" },
  }).replace(/</g, "\\u003c");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="bg-navy py-10 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="text-sm text-white/55">
            <Link href="/" className="hover:text-brand">Trang chủ</Link>
            <span className="px-2">–</span>
            <Link href="/mua-ban" className="hover:text-brand">Mua bán</Link>
            <span className="px-2">–</span>
            <span>Dự án</span>
          </nav>
          <p className="eyebrow mt-3 text-brand">
            Dự án{p.is_partner ? " · AI Ơi Nhà Đất phân phối" : ""}{p.status_text ? ` · ${p.status_text}` : ""}
          </p>
          <h1 className="mt-1.5 text-3xl font-extrabold [text-wrap:balance] md:text-4xl">{p.name}</h1>
          <p className="mt-2 text-white/70">
            {p.developer ? `Chủ đầu tư ${p.developer} · ` : ""}{viTri(p)}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-14 pt-8">
        {anh.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {anh.slice(0, 8).map((u, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={u} src={u} alt={`${p.name} ${i + 1}`} loading={i ? "lazy" : "eager"} decoding="async"
                className={`w-full rounded-shot object-cover ${i === 0 ? "col-span-2 row-span-2 aspect-[4/3]" : "aspect-[4/3]"}`} />
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-king bg-navy/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={placeholderImg(p.slug)} alt={p.name} className="aspect-[21/9] w-full object-cover" />
            <span className="absolute bottom-3 right-4 rounded-md bg-navy/80 px-3 py-1.5 text-xs font-semibold text-white">
              Ảnh minh hoạ - hình dự án gửi qua Zalo
            </span>
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <div className="rounded-king bg-white p-6 shadow-[0_2px_14px_rgba(13,37,61,0.06)]">
              <p className="eyebrow text-brand">Giá</p>
              <p className="mt-1.5 text-3xl font-extrabold text-brand tabular-nums">
                {giaMin && giaMax
                  ? giaMin === giaMax ? formatPrice(giaMin, null) : `${formatPrice(giaMin, null)} – ${formatPrice(giaMax, null)}`
                  : "Hỏi giá qua Zalo"}
              </p>
              {!p.price_min && giaTin.length > 0 && (
                <p className="mt-1 text-xs text-mute">Suy từ {giaTin.length} tin đang rao trong dự án.</p>
              )}
              <dl className="mt-5 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                {[
                  ["Vị trí", p.location_raw ?? viTri(p)],
                  ["Pháp lý", p.legal_status],
                  ["Bàn giao", p.handover ?? (p.handover_date ? new Date(p.handover_date).toLocaleDateString("vi-VN") : null)],
                  ...specs.map(([k, v]) => [NHAN_SPEC[k] ?? k, typeof v === "object" ? JSON.stringify(v) : String(v)] as [string, string]),
                ]
                  .filter((x): x is [string, string] => !!x[1])
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-line py-2.5 text-sm">
                      <dt className="shrink-0 text-mute">{k}</dt>
                      <dd className="text-right font-semibold">{v}</dd>
                    </div>
                  ))}
              </dl>
              {p.description && (
                <>
                  <h2 className="mt-8 text-lg font-extrabold">Giới thiệu</h2>
                  <p className="mt-2.5 whitespace-pre-line leading-7 text-navy/80">{sanitizeDescription(p.description)}</p>
                </>
              )}
            </div>

            {loai.length > 0 && (
              <div className="rounded-king bg-white p-6 shadow-[0_2px_14px_rgba(13,37,61,0.06)]">
                <h2 className="text-lg font-extrabold">Loại căn</h2>
                <ul className="mt-3 divide-y divide-line">
                  {loai.map((lc, i) => (
                    <li key={i} className="py-3 text-sm">
                      <p className="font-bold">{lc.name ?? `Loại ${i + 1}`}</p>
                      {lc.specs && (
                        <p className="mt-1 text-navy/75">
                          {Object.entries(lc.specs).map(([k, v]) => `${NHAN_SPEC[k] ?? k}: ${String(v)}`).join(" · ")}
                        </p>
                      )}
                      {chuoi(lc.units).length > 0 && (
                        <p className="mt-1 text-xs text-mute">Căn: {chuoi(lc.units).join(", ")}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tienIch.length > 0 && (
              <div className="rounded-king bg-white p-6 shadow-[0_2px_14px_rgba(13,37,61,0.06)]">
                <h2 className="text-lg font-extrabold">Tiện ích</h2>
                <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                  {tienIch.map((t) => (
                    <li key={t} className="rounded-md border border-line px-3.5 py-1.5">{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <aside className="h-fit rounded-king bg-white p-6 shadow-[0_2px_14px_rgba(13,37,61,0.06)] lg:sticky lg:top-20">
            <p className="text-lg font-extrabold">Hỏi về {p.name}</p>
            <p className="mt-2 text-sm leading-6 text-mute">
              Còn căn nào? Pháp lý từng lô? Tiến độ? - tầng dự án tụi em trả lời ngay, tầng căn thì hỏi chủ đầu tư giùm.
            </p>
            <a href={zaloLink(`du-an:${p.slug}`)}
              className="mt-5 block rounded-full bg-brand py-3.5 text-center font-bold text-white transition hover:bg-brand-dark active:scale-[0.98]">
              Chat Zalo về dự án này
            </a>
            <p className="mt-3 text-center text-xs text-mute/80">Miễn phí · không cần để lại số điện thoại</p>
          </aside>
        </div>

        <section className="mt-12">
          <p className="eyebrow text-brand">Giỏ hàng</p>
          <h2 className="mb-6 mt-1.5 text-2xl font-extrabold">
            {tin.length ? `${tin.length} căn đang rao trong dự án` : "Chưa có căn nào lên kệ"}
          </h2>
          {tin.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {tin.map((l) => (
                <div key={l.id} className="flex flex-col gap-2">
                  <ListingCard listing={l} photo={l.code ? covers[l.code] : null} />
                  <p className="px-2 text-xs text-mute">
                    {l.unit_code ? `Căn ${l.unit_code}` : "Chưa ghi mã căn"}
                    {l.unit_status ? ` · ${TT_CAN[l.unit_status] ?? l.unit_status}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-king border border-line bg-cream p-8 text-center">
              <p className="font-bold">Giỏ hàng cập nhật qua Zalo - nhắn tụi em gửi bảng căn còn bán.</p>
              <a href={zaloLink(`du-an:${p.slug}:gio`)} className="mt-4 inline-block rounded-md bg-brand px-6 py-2.5 font-bold text-white">
                Xin bảng giỏ hàng
              </a>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
