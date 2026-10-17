import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ListingCard from "@/components/ListingCard";
import { coverByCode } from "@/lib/photos";
import { CARD_COLS, supabase, type ListingCard as CardRow } from "@/lib/supabase";
import { formatPrice, zaloLink } from "@/lib/format";
import { TAG_DEFS, relatedTags, tagBySlug, type TagDef } from "@/lib/tags";

// FR-12 / IA §4.4 — trang tag SEO. Slug lạ → 404 (`notFound()` trong Page: chỉ slug có trong TAG_DEFS mới render).
// 03/10/2026 (giảm egress Supabase, SRS-5.1zl): KHÔNG dựng sẵn lúc build nữa — mỗi lượt build (CI mỗi lần đẩy + Vercel preview
// + production) từng dựng 23 trang × (tin + ảnh bìa). `generateStaticParams` trả [] → trang vẫn ISR, dựng khi có người xem.
//
// SỐ 3600 DƯỚI ĐÂY KHÔNG PHẢI TTL THẬT — soát build 05/09/2026: bảng route báo
// `5m`. Next 15 hạ revalidate của cả segment xuống MIN của nó và mọi
// `unstable_cache` chạy trong lúc render, mà `coverByCode` (lib/photos.ts) đặt
// TTL 300. Nên trang này làm mới mỗi 5 phút, không phải mỗi giờ.
// Giữ 3600 thay vì sửa thành 300: đổi số là đổi ý định, còn hành vi thì không
// đổi (min vẫn là 300). Muốn thật sự nới lên 1 giờ thì phải nới TTL trong
// lib/photos.ts — và đó là quyết định về độ tươi của ẢNH, không phải của tag.
export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const MAX = 24;

async function layTinTag(t: TagDef) {
  let q = supabase
    .from("listings")
    .select(CARD_COLS, { count: "exact" })
    .eq("deal", t.filter.deal)
    .in("status", ["dang_ban", "dang_quan_tam"]) // FR-139: chỉ tin đang lên kệ
    .not("price_raw", "is", null)
    .neq("price_raw", "")
    .gt("price_vnd", 0);
  if (t.filter.types?.length) q = q.in("property_type", t.filter.types);
  if (t.filter.access?.length) q = q.in("access_type", t.filter.access);
  if (t.filter.priceMax) q = q.lt("price_vnd", t.filter.priceMax);
  if (t.filter.bedroomsMin) q = q.gte("bedrooms", t.filter.bedroomsMin);
  if (t.filter.legal?.length) q = q.in("legal_status", t.filter.legal);
  if (t.filter.ward) q = q.eq("ward", t.filter.ward);
  const { data, count } = await q.order("created_at", { ascending: false }).limit(MAX);
  return { rows: (data ?? []) as CardRow[], total: count ?? 0 };
}

// Đoạn mô tả 80–120 từ (IA §4.4) — sinh từ keyword + số liệu kho, không bịa
// giá; khi kho rỗng thì nói thẳng là chưa có và mời hỏi Zalo (IA-P1).
function moTa(t: TagDef, rows: CardRow[], total: number): string {
  const kw = t.keyword;
  const thue = t.filter.deal === "cho_thue";
  const gia = rows.map((r) => r.price_vnd).filter((v): v is number => !!v && v > 0);
  const dt = rows.map((r) => r.area_m2).filter((v): v is number => !!v && v > 0);
  const khoang = gia.length
    ? `Giá rao hiện từ ${formatPrice(Math.min(...gia), null)} tới ${formatPrice(Math.max(...gia), null)}${thue ? " mỗi tháng" : ""}`
    : "";
  const dtTxt = dt.length ? `, diện tích ${Math.round(Math.min(...dt))}–${Math.round(Math.max(...dt))} m²` : "";
  const dau = total
    ? `${kw}: đang có ${total} tin rao trên AI Ơi Nhà Đất, cập nhật từ chủ nhà và môi giới trong khu. ${khoang}${dtTxt}.`
    : `${kw}: hiện chưa có tin nào đang lên kệ đúng tiêu chí này, nhưng kho tin đổi mỗi ngày.`;
  return (
    `${dau} Mỗi tin ghi rõ đường vào (mặt tiền, hẻm xe hơi hay hẻm xe máy), kết cấu, pháp lý và số phòng theo lời chủ nhà xác nhận, không đoán. ` +
    `Muốn biết thêm căn nào, anh chị nhắn mã tin qua Zalo: trợ lý riêng của AI Ơi Nhà Đất trực 24/7, hỏi lại chủ nhà giúp và hẹn xem tận nơi, ` +
    `không cần để lại số điện thoại. Người mua hoàn toàn miễn phí; bên bán chỉ trả phí khi giao dịch thành công.`
  );
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const t = tagBySlug(tag);
  if (!t) return { title: "Không tìm thấy" };
  const title = `${t.keyword} - giá mới nhất, hỏi qua Zalo`;
  const description = `${t.keyword} trên AI Ơi Nhà Đất: tin từ chủ nhà và môi giới, ghi rõ đường vào, pháp lý, kết cấu. Hỏi chi tiết từng căn qua Zalo, không cần để lại số điện thoại.`;
  return {
    title,
    description,
    alternates: { canonical: `/${t.slug}` },
    openGraph: { title, description, url: `/${t.slug}`, type: "website" },
  };
}

export default async function Page({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const t = tagBySlug(tag);
  if (!t) notFound();

  const { rows, total } = await layTinTag(t);
  const covers = await coverByCode(rows.map((l) => l.code));
  const lienQuan = relatedTags(t, 8);
  const goc = t.filter.deal === "cho_thue" ? "/cho-thue" : "/mua-ban";
  const gocLabel = t.filter.deal === "cho_thue" ? "Cho thuê" : "Mua bán";

  return (
    <>
      <div className="bg-navy pb-16 pt-10 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="text-sm text-white/55">
            <Link href="/" className="hover:text-brand">Trang chủ</Link>
            <span className="px-2">–</span>
            <Link href={goc} className="hover:text-brand">{gocLabel}</Link>
          </nav>
          <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">{t.keyword}</h1>
          <p className="mt-2 text-white/60">{total} tin · hỏi chi tiết bất kỳ căn nào qua Zalo</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-12">
        <div className="-mt-10 rounded-king bg-white p-5 shadow-[0_18px_40px_rgba(13,37,61,0.14)]">
          <p className="leading-7 text-navy/80">{moTa(t, rows, total)}</p>
        </div>

        {rows.length > 0 ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((l) => (
              <ListingCard key={l.id} listing={l} photo={l.code ? covers[l.code] : undefined} />
            ))}
          </div>
        ) : (
          // Trang tag rỗng KHÔNG 404 (IA-P1: không bao giờ là ngõ cụt)
          <div className="mt-8 rounded-king border border-line bg-cream p-8 text-center">
            <p className="text-lg font-bold">Chưa có tin đúng tiêu chí này trên kệ</p>
            <p className="mt-2 text-mute">
              Nhắn Zalo một câu, có căn mới khớp là tụi em báo liền.
            </p>
            <a
              href={zaloLink(`tag:${t.slug}`)}
              className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 font-bold text-white transition hover:bg-brand-dark"
            >
              Hỏi Zalo về {t.keyword.toLowerCase()}
            </a>
          </div>
        )}

        {total > rows.length && (
          <p className="mt-6 text-center">
            <Link href={t.filter.ward ? `${goc}?phuong=${encodeURIComponent(t.filter.ward)}` : goc} className="font-semibold text-brand hover:underline">
              Xem cả {total} tin trong kho -
            </Link>
          </p>
        )}

        {/* IA-P4: link chéo 6–8 tag liên quan */}
        <section className="mt-12">
          <p className="eyebrow text-mute">Tìm kiếm liên quan</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {lienQuan.map((o) => (
              <Link
                key={o.slug}
                href={`/${o.slug}`}
                className="rounded-md border border-line bg-white px-3.5 py-1.5 transition hover:border-brand hover:text-brand"
              >
                {o.keyword}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
