import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import ListingCard from "@/components/ListingCard";
import { coverByCode } from "@/lib/photos";
import { CARD_COLS, supabase, type ListingCard as CardRow, TRANG_THAI_HIEN } from "@/lib/supabase";
import { formatPrice, zaloLink } from "@/lib/format";
import { GIOI_THIEU, soLieuKhu, trieu, type SoLieuKhu } from "@/lib/khu";
import { khuBySlug, relatedTags, tagBySlug, tagCuChuyen, type KhuInfo, type TagDef } from "@/lib/tags";

// FR-12 / IA §4.4 — trang tag SEO. Slug lạ → 404 (`notFound()` trong Page: chỉ slug có trong TAG_DEFS mới render).
// 03/10/2026 (giảm egress Supabase, SRS-5.1zl): KHÔNG dựng sẵn lúc build nữa — mỗi lượt build (CI mỗi lần đẩy + Vercel preview
// + production) từng dựng 64 trang × (tin + ảnh bìa). `generateStaticParams` trả [] → trang vẫn ISR, dựng khi có người xem.
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
  // SRS-5.1zzzzzzz436: bỏ ba câu văn mẫu lặp y hệt trên cả 100 trang (Google coi là trùng nội dung); phần riêng của từng
  // trang giờ là khối giới thiệu khu bên dưới.
  return `${dau} Hỏi căn nào thì nhắn mã tin qua Zalo, không cần để lại số điện thoại.`;
}

// SRS-5.1zzzzzzz436: khối giới thiệu khu — lời viết tay (lib/khu.ts) + số liệu tính từ kho. Không viền, không nhãn chữ in hoa.
function GioiThieuKhu({ khu, so, thue }: { khu: KhuInfo; so: SoLieuKhu; thue: boolean }) {
  const gop = khu.slug === "sai-gon" || khu.slug === "long-an";
  const ten = khu.label.replace(/, Long An$/, "");
  const muc: { nhan: string; gt: string }[] = [{ nhan: thue ? "Tin cho thuê cả khu" : "Tin bán cả khu", gt: String(so.tong) }];
  if (so.gia) muc.push({ nhan: thue ? "Tiền thuê / tháng" : "Giá mỗi m²", gt: trieu(so.gia) });
  if (so.xeHoi !== null) muc.push({ nhan: "Mặt tiền, hẻm xe hơi", gt: `${so.xeHoi}%` });
  return (
    <section>
      <h2 className="text-xl font-extrabold md:text-2xl">{gop ? ten : `Khu ${ten}`}</h2>
      {GIOI_THIEU[khu.slug] && <p className="mt-2 max-w-3xl leading-7 text-navy">{GIOI_THIEU[khu.slug]}</p>}
      {so.tong > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap">
          {muc.map((m) => (
            <div key={m.nhan}>
              <dt className="text-sm text-mute">{m.nhan}</dt>
              <dd className="text-2xl font-extrabold text-navy">{m.gt}</dd>
            </div>
          ))}
          {so.nhieuTin.length > 0 && (
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-sm text-mute">{gop ? "Quận huyện nhiều tin" : "Phường nhiều tin"}</dt>
              <dd className="mt-1 font-bold text-navy">{so.nhieuTin.map((x) => `${x.ten} (${x.n})`).join(", ")}</dd>
            </div>
          )}
        </dl>
      )}
      <p className="mt-4 text-sm text-mute">
        {so.tong === 0
          ? "Khu này chưa có tin đang rao trên AI Ơi Nhà Đất."
          : so.gia
            ? `Tính từ ${so.tong} tin đang rao trên AI Ơi Nhà Đất. ${thue ? "Tiền thuê" : `Giá mỗi m²`} là mức ở giữa của ${so.soMauGia} ${thue ? "tin" : "căn nhà phố, cấp 4, biệt thự"}: nửa số căn rao cao hơn, nửa thấp hơn. Đây là giá rao, không phải giá đã giao dịch.`
            : `Mới có ${so.tong} tin đang rao, chưa đủ để tính giá.`}
      </p>
    </section>
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
  if (!t) {
    // SRS-5.1zzzzzzz433: 64 tag Quận 5 cũ (phường cũ, 2–3 phòng ngủ…) đã thay bằng 100 tag theo quận — URL cũ chuyển hẳn, không 404.
    const dich = tagCuChuyen(tag);
    if (dich) permanentRedirect(`/${dich}`);
    notFound();
  }

  const { rows, total } = await layTinTag(t);
  const khu = khuBySlug(t.parts.area);
  const so = khu ? await soLieuKhu(khu, t.filter.deal) : null;
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
          {khu && so && <GioiThieuKhu khu={khu} so={so} thue={t.filter.deal === "cho_thue"} />}
          <p className={`leading-7 text-navy ${khu && so ? "mt-5 border-t border-line pt-5" : ""}`}>{moTa(t, rows, total)}</p>
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
            <Link href={t.quan ? `${goc}?quan=${encodeURIComponent(t.quan)}` : goc} className="font-semibold text-brand hover:underline">
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
