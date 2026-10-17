import type { Metadata } from "next";
import { cache } from "react";
import { tenNhan } from "@/bot/supabase/functions/_shared/extraction/nhan";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import ListingCard from "@/components/ListingCard";
import TrackView from "@/components/TrackView";
import WardMap from "@/components/WardMap";
import { CARD_COLS, supabase, type Listing, type ListingCard as CardRow, type MapRow } from "@/lib/supabase";
import { coverByCode, photosOfCode } from "@/lib/photos";
import { IconArea, IconBed, IconHouse, IconPin } from "@/components/icons";
import { ACCESS_LABEL, formatArea, formatDims, formatPrice, formatPricePerM2, FURNISH_LABEL, LEGAL_LABEL, placeholderImg, PLANNING_LABEL, sanitizeDescription, SITE_URL, TYPE_LABEL, zaloLink, oTheoLoai } from "@/lib/format";

export const revalidate = 3600; // SRS-5.1zl (03/10/2026): 5 phút → 1 giờ, giảm egress Supabase

// KHÔNG có generateStaticParams thì `revalidate` ở trên là CHỮ CHẾT. Next 15
// xếp route động chưa khai báo param vào nhóm "dựng lại từng request":
// prerender-manifest.dynamicRoutes rỗng → không có ISR → mỗi lượt xem một tin
// là 3 query Supabase + 1 query ảnh, và Vercel chạy hẳn một lambda.
// Đo tại chỗ 26/08 (next start, production build):
//   /                 → x-nextjs-cache: HIT, Cache-Control: s-maxage=300
//   route [param] bất kỳ → Cache-Control: private, no-cache, no-store
// Đây lại đúng là trang SEO — thứ Google cào nhiều nhất. Có generateStaticParams
// (dù rỗng) thì mọi mã render on-demand vì dynamicParams mặc định = true, và
// render xong được nằm trong cache 5 phút như các trang kia.
// 02/10/2026 (đo Supabase): danh sách mã tin ở đây làm MỖI lượt build (CI mỗi PR + Vercel preview + production, ~24
// lượt/ngày lúc làm việc) dựng sẵn mọi tin × ~6 truy vấn - cùng cơ chế đã đốt 83% request REST ở /du-an/[slug]. Trả mảng
// RỖNG: route vẫn là ● (Next 15 dựng lần đầu có người xem rồi giữ cache 5 phút như trên), chỉ không dựng trước lúc build.
export async function generateStaticParams() {
  return [];
}

// `cache` của React gộp hai lượt gọi cùng tham số trong MỘT lần render —
// `generateMetadata` và `Page` cùng hỏi đúng tin này. supabase-js không đi qua
// fetch-cache của Next nên không tự gộp: trước bản này mỗi trang tin là HAI
// truy vấn y hệt, lúc build nhân với ~164 tin (FR-171 j).
// Cột trang tin thật sự dùng (khớp type Listing + nhãn). 02/10/2026: trước đây `select("*")` kéo cả `nhung`
// vector(768) (~9 KB dạng chữ), `boc_tach`, `tien_ich_gan` - mỗi trang tin dựng ra là vài chục KB egress Supabase
// chỉ để vứt đi. Thêm cột mới cho trang này thì thêm vào đây.
const DETAIL_COLS =
  "id, code, deal, district, ward, location_raw, area_m2, price_vnd, price_raw, description, status, property_type, unit_status, " +
  "last_confirmed_at, created_at, lat, lng, bedrooms, street, access_type, alley_width_m, distance_to_street_m, frontage_m, length_m, " +
  "rear_width_m, legal_area_m2, built_area_m2, floors, floors_text, floor, bathrooms, direction, legal_status, has_completion, " +
  "planning_status, has_elevator, car_in_house, corner_lot, furnishing, year_built, negotiable, rent_income_vnd, specs_source, " +
  "price_per_m2_vnd, project_id, unit_code, nhan";

const getListing = cache(async (code: string): Promise<Listing | null> => {
  // Đoạn đường dẫn đi THẲNG vào chuỗi `.or()` của PostgREST, nơi `,` `(` `)` là
  // ngữ pháp và `%` `_` là wildcard: `/nha-dat/%25` là "mọi tin", `/nha-dat/x,status.eq.an`
  // là ghép thêm điều kiện. Mã tin chỉ có [A-Za-z0-9-]; thứ khác trả 404 ngay.
  if (!/^[A-Za-z0-9-]{1,40}$/.test(code)) return null;
  const { data } = await supabase
    .from("listings")
    .select(DETAIL_COLS)
    .or(`code.ilike.${code},legacy_code.ilike.${code}`)
    .limit(1)
    .maybeSingle();
  return data as Listing | null;
});

// FR-99 (dựng 04/09/2026): giá/m² của mọi tin ĐANG LÊN KỆ cùng phường, cùng
// loại giao dịch — một truy vấn nhẹ (2 cột), Data Cache 1 giờ, khoá theo
// (phường, giao dịch). Trang tin tự loại chính nó ra khỏi mẫu và chỉ hiện khi
// còn ≥ 3 tin khác — ít hơn thì "trung bình" là con số bịa.
const giaPhuong = unstable_cache(
  async (ward: string, deal: string) => {
    const { data } = await supabase
      .from("listings")
      .select("id, price_per_m2_vnd")
      .eq("ward", ward)
      .eq("deal", deal)
      .in("status", ["dang_ban", "dang_quan_tam"])
      .gt("price_per_m2_vnd", 0)
      .limit(500);
    return (data ?? []) as { id: string; price_per_m2_vnd: number }[];
  },
  ["gia-phuong"],
  { revalidate: 3600, tags: ["listings"] },
);

function soSanhGia(listing: Listing, mau: { id: string; price_per_m2_vnd: number }[]) {
  if (!listing.price_per_m2_vnd || listing.price_per_m2_vnd <= 0) return null;
  const khac = mau.filter((r) => r.id !== listing.id).map((r) => Number(r.price_per_m2_vnd));
  if (khac.length < 3) return null;
  const tb = khac.reduce((a, b) => a + b, 0) / khac.length;
  const pct = Math.round(((Number(listing.price_per_m2_vnd) - tb) / tb) * 100);
  return { pct, n: khac.length, tb };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const listing = await getListing(decodeURIComponent(code));
  if (!listing) return { title: "Không tìm thấy tin" };
  const loc = [listing.ward, listing.district].filter(Boolean).join(", ");
  const title = `${listing.deal === "cho_thue" ? "Cho thuê" : "Bán"} nhà đất ${loc} - ${formatPrice(listing.price_vnd, listing.price_raw)} · #${listing.code}`;
  const description = sanitizeDescription(listing.description).slice(0, 155);
  // Canonical theo MÃ THẬT của tin, không theo tham số URL: tin mở được bằng
  // cả legacy_code (20260908c), mà hai URL cùng tự nhận canonical là Google thấy
  // hai trang cho một tin — JSON-LD bên dưới đã dùng listing.code từ trước.
  const maThat = listing.code ?? code;
  const photos = await photosOfCode(maThat, 1);
  const url = `/nha-dat/${encodeURIComponent(maThat)}`;
  // NFR-09: canonical + OpenGraph (ảnh thật nếu có, không thì ảnh minh hoạ)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      images: [{ url: photos[0] ?? placeholderImg(code), alt: loc }],
    },
  };
}

// NFR-09 / IA §4.4: schema.org/RealEstateListing — name, description, price,
// floorSize, numberOfRooms, address, image, identifier = mã tin. Địa chỉ chỉ
// tới mức phường (FR-104: số nhà không lên web).
function jsonLd(listing: Listing, photos: string[], desc: string) {
  const url = `${SITE_URL}/nha-dat/${encodeURIComponent(listing.code ?? listing.id)}`;
  const o: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": url,
    url,
    name: `${listing.deal === "cho_thue" ? "Cho thuê" : "Bán"} ${TYPE_LABEL[listing.property_type ?? ""] ?? "nhà đất"} ${[listing.ward, listing.district].filter(Boolean).join(", ")}`,
    description: desc.slice(0, 500),
    identifier: listing.code,
    datePosted: listing.created_at,
    image: photos.length ? photos : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: listing.street ?? undefined,
      addressLocality: listing.ward ?? undefined,
      addressRegion: listing.district ?? undefined,
      addressCountry: "VN",
    },
  };
  if (listing.price_vnd) {
    o.offers = {
      "@type": "Offer",
      price: listing.price_vnd,
      priceCurrency: "VND",
      availability: "https://schema.org/InStock",
      ...(listing.deal === "cho_thue" ? { priceSpecification: { "@type": "UnitPriceSpecification", price: listing.price_vnd, priceCurrency: "VND", unitText: "tháng" } } : {}),
    };
  }
  if (listing.area_m2) o.floorSize = { "@type": "QuantitativeValue", value: listing.area_m2, unitCode: "MTK" };
  if (listing.bedrooms) o.numberOfRooms = listing.bedrooms;
  return JSON.stringify(o);
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);
  const listing = await getListing(code);
  if (!listing) notFound();

  const [factsRes, relatedRes, photos, mauGia, duAnRes] = await Promise.all([
    supabase
      .from("listing_facts")
      .select("question, answer")
      .eq("listing_id", listing.id)
      .limit(20),
    supabase
      .from("listings")
      .select(CARD_COLS)
      .eq("deal", listing.deal)
      .neq("id", listing.id)
      .in("status", ["dang_ban", "dang_quan_tam"])
      .not("price_raw", "is", null)
      .neq("price_raw", "")
      .eq("ward", listing.ward ?? "")
      .limit(4),
    photosOfCode(code), // FR-148
    listing.ward ? giaPhuong(listing.ward, listing.deal) : Promise.resolve([]), // FR-99
    // FR-117: tin thuộc dự án → link sang trang dự án (1 truy vấn nhỏ, chỉ khi có project_id)
    listing.project_id
      ? supabase.from("projects").select("slug, name").eq("id", listing.project_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const facts = factsRes.data ?? [];
  const soSanh = soSanhGia(listing, mauGia);
  const duAn = (duAnRes.data ?? null) as { slug: string; name: string } | null;
  const related = (relatedRes.data ?? []) as CardRow[];
  const relCovers = await coverByCode(related.map((l) => l.code));

  const loc = [listing.ward, listing.district].filter(Boolean).join(", ");
  const desc = sanitizeDescription(listing.description);
  // FR-104: H1 lấy TÊN ĐƯỜNG đã bóc số nhà (`street`, boc_ten_duong), không lấy
  // đoạn đầu `location_raw` — 11/164 tin có đoạn đầu là "Số 1xx" / "Hẻm xx/".
  const title = listing.street
    ? `${TYPE_LABEL[listing.property_type ?? ""] ?? "Nhà đất"} ${listing.street}${listing.ward ? `, ${listing.ward}` : ""}`
    : `Nhà đất ${loc}`;

  // Khối thông số nổi (Veedoo) — chỉ đưa vào ô nào tin này THẬT SỰ có
  const stats = [
    listing.property_type && TYPE_LABEL[listing.property_type]
      ? { Icon: IconHouse, label: "Loại hình", value: TYPE_LABEL[listing.property_type] }
      : null,
    listing.area_m2
      ? { Icon: IconArea, label: "Diện tích", value: formatArea(listing.area_m2) }
      : null,
    // Ô theo loại BĐS (`O_THEO_LOAI`): đất / kho / mặt bằng không có phòng ngủ dù cột lỡ có số.
    listing.bedrooms && oTheoLoai(listing.property_type).phongNgu
      ? { Icon: IconBed, label: "Phòng ngủ", value: `${listing.bedrooms} PN` }
      : null,
  ].filter(Boolean) as Array<{ Icon: (p: { className?: string }) => React.ReactElement; label: string; value: string }>;

  // FR-172: bảng thông số chuẩn sàn (mogi/radanhadat đều có bộ này) — CHỈ hiện
  // dòng nào tin thật sự có; null = chưa xác minh thì không hiện, không đoán.
  // Nguồn của cụm số này (bóc từ mô tả / chủ nhà xác nhận) nói ở chân bảng.
  const dims = formatDims(listing.frontage_m, listing.length_m, listing.rear_width_m);
  const n = (v: number) => Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  const specs: Array<[string, string]> = [];
  const push = (k: string, v: string | null | undefined) => { if (v) specs.push([k, v]); };
  push("Giá / m²", formatPricePerM2(listing.price_per_m2_vnd, listing.deal));
  push("Kích thước", dims);
  push("DT công nhận", listing.legal_area_m2 ? `${n(listing.legal_area_m2)} m²` : null);
  push("DT xây dựng", listing.built_area_m2 ? `${n(listing.built_area_m2)} m²` : null);
  push("Kết cấu", listing.floors_text ?? (listing.floors ? `${listing.floors} tầng` : null));
  push("Tầng (chung cư)", listing.floor != null && listing.property_type === "chung_cu" ? `Tầng ${listing.floor}` : null);
  push("Phòng", [listing.bedrooms && oTheoLoai(listing.property_type).phongNgu ? `${listing.bedrooms} PN` : null, listing.bathrooms ? `${listing.bathrooms} WC` : null].filter(Boolean).join(" · ") || null);
  push("Đường vào", listing.access_type
    ? `${ACCESS_LABEL[listing.access_type] ?? listing.access_type}${listing.alley_width_m ? ` · rộng ${n(listing.alley_width_m)} m` : ""}${listing.distance_to_street_m ? ` · cách mặt tiền ${n(listing.distance_to_street_m)} m` : ""}`
    : null);
  push("Pháp lý", listing.legal_status
    ? `${LEGAL_LABEL[listing.legal_status] ?? listing.legal_status}${listing.has_completion === true ? " · đã hoàn công" : listing.has_completion === false ? " · chưa hoàn công" : ""}`
    : listing.has_completion === true ? "Đã hoàn công" : null);
  push("Quy hoạch", listing.planning_status ? PLANNING_LABEL[listing.planning_status] ?? listing.planning_status : null);
  push("Hướng", listing.direction);
  push("Nội thất", listing.furnishing ? FURNISH_LABEL[listing.furnishing] : null);
  push("Năm xây", listing.year_built ? String(listing.year_built) : null);
  push("Tiện ích", [
    listing.has_elevator ? "thang máy" : null,
    listing.car_in_house ? "xe hơi vô nhà" : null,
    listing.corner_lot ? "căn góc / 2 mặt tiền" : null,
  ].filter(Boolean).join(" · ") || null);
  push("Đang cho thuê", listing.deal === "ban" && listing.rent_income_vnd ? `${n(listing.rent_income_vnd / 1_000_000)} tr/tháng` : null);
  push("Thương lượng", listing.negotiable === true ? "Còn thương lượng" : listing.negotiable === false ? "Giá chốt" : null);

  return (
    <>
      <TrackView code={code} listingId={listing.id} />
      <script
        type="application/ld+json"
        // Chuỗi do JSON.stringify sinh từ dữ liệu đã qua sanitizeDescription; "<"
        // thoát để không đóng thẻ script sớm.
        dangerouslySetInnerHTML={{ __html: jsonLd(listing, photos, desc).replace(/</g, "\\u003c") }}
      />

      {/* Dải tiêu đề navy - bản Veedoo, nhưng bỏ ảnh nền (ảnh kho quá nhỏ để trải ngang) */}
      <div className="bg-navy py-10 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="text-sm text-white/55">
            <Link href="/" className="hover:text-brand">Trang chủ</Link>
            <span className="px-2">–</span>
            <Link href={listing.deal === "cho_thue" ? "/cho-thue" : "/mua-ban"} className="hover:text-brand">
              {listing.deal === "cho_thue" ? "Cho thuê" : "Mua bán"}
            </Link>
          </nav>
          <h1 className="mt-2.5 text-3xl font-extrabold [text-wrap:balance] md:text-4xl">{title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-white/70">
            <IconPin className="h-4 w-4 text-brand" />
            {loc} <span className="text-white/40">· #{listing.code}</span>
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-14 pt-8">
        {/* FR-148: ảnh thật up theo mã tin (bucket listing-photos/<mã>/…) */}
        <div className="relative">
          <div className="relative overflow-hidden rounded-king bg-navy/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[0] ?? placeholderImg(code)}
              alt={loc}
              fetchPriority="high"
              decoding="async"
              className="aspect-[16/9] w-full object-cover"
            />
            {/* Dòng chữ dưới gallery đã nói "ảnh thật gửi qua Zalo", nhưng nó
                nằm dưới tấm ảnh to này - người lướt nhanh chỉ thấy ảnh. Dán
                nhãn ngay TRÊN ảnh mới thật sự là nói. */}
            {photos.length === 0 && (
              <span className="absolute bottom-3 right-4 rounded-md bg-navy/80 px-3 py-1.5 text-xs font-semibold text-white">
                Ảnh minh hoạ - chưa có ảnh thật của căn này
              </span>
            )}
          </div>

          {/* Khối thông số NỔI đè chân ảnh - chữ ký của Veedoo (docs/01) */}
          {stats.length > 0 && (
            <div className="mx-auto -mt-10 w-[92%] rounded-king bg-navy px-6 py-6 text-white shadow-[0_18px_40px_rgba(13,37,61,0.28)] md:-mt-14 md:w-[86%] md:px-10 md:py-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {stats.map(({ Icon, label, value }) => (
                  <div key={label} className="text-center">
                    <Icon className="mx-auto h-6 w-6 text-white" />
                    <p className="eyebrow mt-2.5 text-brand">{label}</p>
                    <p className="mt-1 text-2xl font-extrabold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {photos.length > 1 && (
          <div className="mt-5 grid grid-cols-4 gap-3">
            {photos.slice(1, 9).map((url) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={url}
                src={url}
                alt={loc}
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full rounded-shot object-cover"
              />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-mute/80">
          {photos.length
            ? `${photos.length} ảnh thật của căn này. Cần thêm góc nào, nhắn Zalo tụi em gửi liền.`
            : `Ảnh thật của căn này gửi qua Zalo - nhắn “cho em xem hình #${listing.code}”.`}
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* FR-139: căn đã chốt vẫn mở được link cũ nhưng nói thật với khách */}
            {listing.status === "da_chot" && (
              <div className="mb-6 rounded-king border border-navy/15 bg-white px-5 py-4 font-semibold text-navy">
                Căn này đã giao dịch xong. Nhắn Zalo để tụi em gửi các căn tương tự đang bán nha.
              </div>
            )}
            {listing.status === "dang_quan_tam" && (
              <div className="mb-6 inline-block rounded-md bg-brand/10 px-4 py-1.5 text-sm font-bold text-brand">
                Đang được nhiều khách quan tâm
              </div>
            )}

            <div className="rounded-king bg-white p-6 shadow-[0_2px_14px_rgba(13,37,61,0.06)]">
              <p className="eyebrow text-brand">Giá</p>
              <p className="mt-1.5 text-4xl font-extrabold text-brand tabular-nums">
                {formatPrice(listing.price_vnd, listing.price_raw)}
              </p>
              {/* FR-99: so với giá rao trung bình mỗi m² của phường (chỉ hiện khi ≥3 tin khác) */}
              {soSanh && (
                <p className="mt-2 text-sm text-mute tabular-nums">
                  So với giá trung bình phường:{" "}
                  <span className={`font-bold ${soSanh.pct > 0 ? "text-brand" : "text-navy"}`}>
                    {soSanh.pct > 0 ? "+" : ""}{soSanh.pct}%
                  </span>{" "}
                  ({soSanh.n} tin cùng phường, cùng loại giao dịch; giá rao, không phải giá chốt)
                </p>
              )}
              {duAn && (
                <p className="mt-2 text-sm">
                  Thuộc dự án{" "}
                  <Link href={`/du-an/${encodeURIComponent(duAn.slug)}`} className="font-bold text-brand hover:underline">
                    {duAn.name}
                  </Link>
                  {listing.unit_code ? <span className="text-mute"> · căn {listing.unit_code}</span> : null}
                </p>
              )}
              {specs.length > 0 && (
                <>
                  <h2 className="mt-8 text-lg font-extrabold">Thông số</h2>
                  <dl className="mt-3 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                    {specs.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 border-b border-line py-2.5 text-sm">
                        <dt className="shrink-0 text-mute">{k}</dt>
                        <dd className="text-right font-semibold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-mute/80">
                    {listing.specs_source === "chu_xac_nhan"
                      ? "Thông số do chủ nhà xác nhận qua Zalo."
                      : "Thông số đọc từ tin rao, chưa xác minh với chủ nhà - hỏi qua Zalo là tụi em đi hỏi giùm."}
                  </p>
                </>
              )}
              {desc && (
                <>
                  <h2 className="mt-8 text-lg font-extrabold">Mô tả</h2>
                  <p className="mt-2.5 whitespace-pre-line leading-7 text-navy/80">{desc}</p>
                </>
              )}
            </div>

            {/* FR-10 (dựng 04/09/2026): bản đồ MỨC PHƯỜNG - chấm là tâm phường
                + lệch định trước theo mã tin, KHÔNG phải vị trí căn (FR-104). */}
            {listing.ward && (
              <div className="mt-5 rounded-king bg-white p-6 shadow-[0_2px_14px_rgba(13,37,61,0.06)]">
                <h2 className="text-lg font-extrabold">Khu vực</h2>
                <p className="mb-3 mt-1 text-sm text-mute">
                  Vị trí hiển thị ở mức phường ({listing.ward}) - chấm trên bản đồ không phải địa chỉ căn.
                  Địa chỉ chính xác tụi em chia sẻ khi hẹn xem nhà.
                </p>
                {/* DỰNG object MỚI, không spread `listing`. `listing` đến từ
                    `select("*")` — 56 cột, trong đó có `description` NGUYÊN BẢN
                    (chưa qua sanitizeDescription, còn SĐT chủ nhà), `location_raw`
                    (có tin bắt đầu bằng "Số 1xx") và `seller_id`. `as CardRow`
                    chỉ ép KIỂU lúc biên dịch; spread vẫn chép đủ 56 cột, mà
                    WardMap là client component nên cả object đi vào payload
                    NHÚNG TRONG HTML — xem view-source là đọc được (review 10/09,
                    mục A1). Chính đầu file /ban-do đã có chú thích cảnh báo đúng
                    cái bẫy này; trang tin chi tiết vẫn dính vì spread trông vô
                    hại. Bản đồ chỉ cần phường: liệt kê tay đúng thứ nó dùng. */}
                <WardMap
                  listing={{
                    id: listing.id, code: listing.code, deal: listing.deal,
                    district: listing.district, ward: listing.ward, street: null,
                    location_raw: null, area_m2: listing.area_m2,
                    price_vnd: listing.price_vnd, price_raw: listing.price_raw,
                    property_type: listing.property_type, bedrooms: listing.bedrooms,
                    bathrooms: listing.bathrooms, floors: listing.floors,
                    access_type: listing.access_type, status: listing.status,
                    created_at: listing.created_at, lat: null, lng: null,
                  } as MapRow}
                />
              </div>
            )}

            {/* FR-211: nhãn tìm kiếm — khoá từ điển đóng, tên đọc được qua tenNhan. */}
            {((listing as { nhan?: string[] | null }).nhan?.length ?? 0) > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {((listing as { nhan?: string[] | null }).nhan ?? []).map((k) => (
                  <span key={k} className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-mute shadow-[0_2px_14px_rgba(13,37,61,0.06)]">🏷 {tenNhan([k])}</span>
                ))}
              </div>
            )}
            {facts.length > 0 && (
              <div className="mt-5 rounded-king bg-white p-6 shadow-[0_2px_14px_rgba(13,37,61,0.06)]">
                <h2 className="text-lg font-extrabold">Đã xác minh với chủ nhà</h2>
                <ul className="mt-3 divide-y divide-line">
                  {/* FR-104: answer là chữ chính chủ gõ trong Zalo, hay kèm SĐT -
                      phải lọc y như description, đừng in thẳng ra web. */}
                  {facts.map((f, i) => (
                    <li key={i} className="flex gap-4 py-3 text-sm">
                      <span className="min-w-36 font-semibold text-mute">{f.question}</span>
                      <span>{sanitizeDescription(f.answer)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Khối CTA Zalo mang ngữ cảnh (FR-13/14) */}
          <aside className="h-fit rounded-king bg-white p-6 shadow-[0_2px_14px_rgba(13,37,61,0.06)] lg:sticky lg:top-20">
            <p className="text-lg font-extrabold">Hỏi về căn #{listing.code}</p>
            <p className="mt-2 text-sm leading-6 text-mute">
              Còn không? Hẻm rộng bao nhiêu? Sổ sách sao? - nhắn Zalo, tụi em trả
              lời ngay, chưa rõ thì đi hỏi chủ nhà giùm anh chị.
            </p>
            <a
              href={zaloLink(`#${listing.code}`)}
              className="mt-5 block rounded-full bg-brand py-3.5 text-center font-bold text-white transition hover:bg-brand-dark active:scale-[0.98]"
            >
              Chat Zalo về căn này
            </a>
            <p className="mt-3 text-center text-xs text-mute/80">
              Miễn phí · không cần để lại số điện thoại
            </p>
            {listing.price_vnd && listing.price_vnd > 0 && (
              <Link
                href={`/tinh-lai-vay?price=${listing.price_vnd}`}
                className="mt-3 block rounded-full border border-line py-3 text-center text-sm font-bold transition hover:border-brand hover:text-brand"
              >
                Tính lãi vay với giá căn này
              </Link>
            )}
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-14">
            <p className="eyebrow text-brand">Gợi ý</p>
            <h2 className="mb-6 mt-1.5 text-2xl font-extrabold">Cùng khu {listing.ward}</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((l) => (
                <ListingCard key={l.id} listing={l} photo={l.code ? relCovers[l.code] : null} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
