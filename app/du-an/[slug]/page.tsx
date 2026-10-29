import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ListingCard from "@/components/ListingCard";
import { coverByCode } from "@/lib/photos";
import { CARD_COLS, supabase, type ListingCard as CardRow, TRANG_THAI_HIEN } from "@/lib/supabase";
import { formatPrice, placeholderImg, sanitizeDescription, SITE_URL, zaloLink } from "@/lib/format";

// FR-117 (dựng 04/09/2026) — trang dự án `/du-an/{slug}`, SSG từ bảng
// `projects` (SRS-3.10; anon đọc được qua `anon_read_projects`). Có
// generateStaticParams (rỗng, xem dưới) nên build ra ● (NFR-17); mọi slug
// render on-demand rồi nằm cache — dự án mới không cần build lại.
// Phần "quản lý giỏ hàng cho admin/NMG" của FR-117 CHƯA dựng; cột `unit_status` đã gỡ
// (SRS-5.1zzzzzzz140), trạng thái căn đổi qua bảng `deals`/sửa tin (SRS-3.10).
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
  unit_types: unknown; amenities: unknown; images: unknown; specs: unknown; thong_tin: unknown;
};

// Tin trong dự án: thẻ + mã căn / tình trạng căn (FR-113).
type TinDuAn = CardRow & { unit_code: string | null };

// 02/10/2026 (đo Supabase, workflow do-supabase.yml): bản cũ trả slug của CẢ 1.639 dự án nên MỖI lượt build (CI mỗi PR,
// Vercel preview, Vercel production) dựng sẵn 1.639 trang × 2 truy vấn. pg_stat_statements từ 22/08: hai truy vấn của trang
// này là 3,25/3,89 triệu request REST của cả project (83%) - kéo theo egress và log ingestion vượt gói Free. Trả mảng RỖNG
// thì route vẫn là ● (Next 15: mảng rỗng = dựng lần đầu có người xem rồi nằm cache, vẫn ISR theo `revalidate`) - chỉ trang
// có người/bot tìm kiếm xem mới tốn truy vấn. Đừng trả lại danh sách đầy đủ.
// 18/10/2026 (SRS-5.1zzzzzzz45): bỏ nhánh dự phòng đọc `data/mogi_projects.json` — nó tự điền tiện ích, pháp lý "Sổ hồng sở
// hữu lâu dài" và ảnh nhà mẫu cho dự án không có trong DB (dữ liệu bịa). Kho `projects` nay đủ 5 tỉnh; slug không có → 404.

export async function generateStaticParams() {
  return [];
}

const getProject = cache(async (slug: string): Promise<DuAn | null> => {
  const { data } = await supabase
    .from("projects")
    .select("id, name, slug, developer, district, ward, province, location_raw, legal_status, status_text, handover, handover_date, description, price_min, price_max, is_partner, unit_types, amenities, images, specs, thong_tin")
    .eq("slug", slug)
    .maybeSingle();
  return (data as DuAn) ?? null;
});

// SRS-5.1zzzzzzz283: `projects.thong_tin` = dữ kiện ĐÃ CHỐT (phiếu đủ / admin ghi thẳng, SRS-249) — lõi bot đọc nó đè cột mogi cùng nghĩa;
// trang dự án đọc y như vậy để web và bot nói cùng một điều. Bỏ link ngoài (web không dẫn khách ra trang khác).
function thongTin(v: unknown): { thuocTinh: [string, string][]; tienIch: string[] } {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const tt = o.thuoc_tinh && typeof o.thuoc_tinh === "object" && !Array.isArray(o.thuoc_tinh) ? (o.thuoc_tinh as Record<string, unknown>) : {};
  const thuocTinh = Object.entries(tt)
    .filter(([k, x]) => typeof x === "string" && x.trim() && !/https?:\/\//i.test(x) && !["website", "link"].includes(k.trim().toLowerCase()))
    .map(([k, x]): [string, string] => [k.charAt(0).toUpperCase() + k.slice(1), (x as string).trim()]);
  return { thuocTinh, tienIch: chuoi(o.tien_ich).filter((t) => !/https?:\/\//i.test(t)) };
}

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
// Hai dạng `projects.unit_types`: mogi `{name, specs, units}` và dạng phẳng chủ dự án nhập tay `{ten, ket_cau, kich_thuoc, …}` (Ny'ah,
// SRS-5.1zzzzzzz249) — dạng phẳng trước đây hiện "Loại 1…5" trống (SRS-5.1zzzzzzz283). Mẫu không tên lẫn thông số thì bỏ.
function loaiCan(v: unknown): LoaiCan[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    .map((x): LoaiCan => {
      if (typeof x.name === "string" || x.specs) return x as LoaiCan;
      const { ten, units, ...con } = x;
      return { name: typeof ten === "string" ? ten : undefined, specs: con, units };
    })
    .filter((lc) => !!lc.name || Object.values(lc.specs ?? {}).some(coGiaTri));
}
const NHAN_SPEC: Record<string, string> = {
  so_tang: "Số tầng", mat_tien: "Mặt tiền", so_phong_ngu: "Phòng ngủ", bo_tri: "Bố trí",
  ban_giao: "Bàn giao", thang_may: "Thang máy", ghi_chu: "Ghi chú", cong: "Cổng",
  vi_tri: "Vị trí", ket_cau: "Kết cấu", tong_so_can: "Tổng số căn", dien_tich: "Diện tích",
  gia_dong: "Giá tham khảo", kich_thuoc: "Kích thước", dien_tich_su_dung: "Diện tích sử dụng", phong_ngu: "Phòng ngủ", nam_khoi_cong: "Khởi công", nam_hoan_thanh: "Hoàn thành", tong_dien_tich: "Tổng diện tích",
};
// Ô trống của kho dự án mogi ra JSON null — `String(null)` là chữ "null", trước đây lọt lên trang cùng tên khoá trần ("gia_dong null",
// chủ dự án 27/10). Trống = null / "" / "null".
function coGiaTri(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== "" && String(v).trim().toLowerCase() !== "null";
}
function nhanSpec(k: string): string {
  return NHAN_SPEC[k] ?? k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
function khoang(a: unknown, b: unknown, donVi: string): string | null {
  const x = coGiaTri(a) ? String(a) : null;
  const y = coGiaTri(b) ? String(b) : null;
  return x && y && x !== y ? `${x} – ${y} ${donVi}` : x || y ? `${x ?? y} ${donVi}` : null;
}
/** Dòng thông số dự án cho người đọc: bỏ ô trống, gộp cặp từ–đến, giá/m² chỉ khi không có câu giá. */
function dongSpec(specs: Record<string, unknown>): [string, string][] {
  const ra: [string, string][] = [];
  const bo = new Set(["gia_m2_min", "gia_m2_max", "dien_tich_tu_m2", "dien_tich_den_m2"]);
  for (const [k, v] of Object.entries(specs)) {
    if (bo.has(k) || !coGiaTri(v)) continue;
    ra.push([nhanSpec(k), typeof v === "object" ? JSON.stringify(v) : String(v)]);
  }
  const trieu = (v: unknown) => (coGiaTri(v) && Number(v) > 0 ? String(Math.round(Number(v) / 1e6)) : null);
  if (!coGiaTri(specs.gia_dong)) {
    const g = khoang(trieu(specs.gia_m2_min), trieu(specs.gia_m2_max), "triệu/m²");
    if (g) ra.push(["Giá / m²", g]);
  }
  const dt = khoang(specs.dien_tich_tu_m2, specs.dien_tich_den_m2, "m²");
  if (dt) ra.push(["Diện tích căn", dt]);
  return ra;
}

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
    .select(`${CARD_COLS}, unit_code`)
    .eq("project_id", p.id)
    .in("status", TRANG_THAI_HIEN) // FR-139: chỉ tin đang lên kệ
    .order("unit_code", { ascending: true, nullsFirst: false })
    .limit(60);
  const tin = (data ?? []) as unknown as TinDuAn[];
  const covers = await coverByCode(tin.map((l) => l.code));
  const anh = anhDuAn(p.images);
  const tt = thongTin(p.thong_tin);
  const tienIch = [...new Set([...chuoi(p.amenities), ...tt.tienIch])];
  const daChot = new Map(tt.thuocTinh.map(([k, v]) => [k.toLowerCase(), v]));
  const loai = loaiCan(p.unit_types);
  const specs = p.specs && typeof p.specs === "object" && !Array.isArray(p.specs) ? dongSpec(p.specs as Record<string, unknown>) : [];
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
            {(daChot.get("chủ đầu tư") ?? p.developer) ? `Chủ đầu tư ${daChot.get("chủ đầu tư") ?? p.developer} · ` : ""}{viTri(p)}
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
          <div className="grid place-items-center rounded-king bg-navy/5 px-4 py-10 text-center text-sm text-mute">
            Chưa có ảnh dự án — nhắn Zalo để nhận hình thực tế.
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
                  ["Vị trí", daChot.get("vị trí") ?? p.location_raw ?? viTri(p)],
                  ["Pháp lý", daChot.get("pháp lý") ?? p.legal_status],
                  ["Bàn giao", daChot.get("bàn giao") ?? p.handover ?? (p.handover_date ? new Date(p.handover_date).toLocaleDateString("vi-VN") : null)],
                  ...specs,
                  ...tt.thuocTinh.filter(([k]) => !["vị trí", "pháp lý", "bàn giao", "chủ đầu tư"].includes(k.toLowerCase())),
                ]
                  .filter((x, i, a): x is [string, string] => coGiaTri(x[1]) && a.findIndex((y) => y[0] === x[0]) === i)
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
                          {Object.entries(lc.specs).filter(([, v]) => coGiaTri(v)).map(([k, v]) => `${nhanSpec(k)}: ${String(v)}`).join(" · ")}
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
              className="mt-5 block rounded-md bg-brand py-3.5 text-center font-bold text-white transition hover:bg-brand-dark active:scale-[0.98]">
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
