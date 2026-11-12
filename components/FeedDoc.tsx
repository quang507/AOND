// SRS-5.1zzzzzzz430 (chủ dự án 12/11/2026: "muốn lướt trang web kiểu cuộn cuộn như tiktok", "Thay trang chủ trên điện thoại"):
// trang chủ dưới `md` là feed vuốt dọc, mỗi màn một căn. Máy tính không thấy khối này (md:hidden). Kiểu dáng ở app/king.css.
// Server component — chỉ nút Lưu (FavButton) và Chia sẻ (NutChiaSe) chạy phía trình duyệt; vuốt / dính màn là CSS scroll-snap thuần.
import Link from "next/link";
import FavButton from "@/components/FavButton";
import NutChiaSe from "@/components/NutChiaSe";
import { IconSearch } from "@/components/icons";
import { ACCESS_LABEL, formatArea, formatPrice, placeholderImg, SITE_URL, zaloLink } from "@/lib/format";
import type { ListingCard as CardRow } from "@/lib/supabase";
import { FEATURED_TAGS } from "@/lib/tags";

function IconZalo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`fill-current ${className ?? ""}`} aria-hidden>
      <path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.7 1.4 5.1 3.6 6.7-.1 1-.5 2.1-1.3 3 1.6-.2 3-.8 4-1.5 1.1.3 2.4.5 3.7.5 5.5 0 10-3.9 10-8.7S17.5 3 12 3Z" />
    </svg>
  );
}

function IconMo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

function ManCan({ l, anh, thu, tong }: { l: CardRow; anh?: string; thu: number; tong: number }) {
  const code = l.code ?? l.id.slice(0, 8);
  const href = `/nha-dat/${encodeURIComponent(code)}`;
  const ten = l.street?.trim() || [l.ward, l.district].filter(Boolean).join(", ") || "Nhà đất Sài Gòn & Long An";
  const noi = [l.ward, l.district].filter(Boolean).join(", ");
  const thongSo = [
    l.area_m2 ? formatArea(l.area_m2) : null,
    l.floors ? `${l.floors} tầng` : null,
    l.bedrooms ? `${l.bedrooms} PN` : null,
    l.access_type ? ACCESS_LABEL[l.access_type] : null,
  ].filter(Boolean);

  return (
    <article className="feed-o" aria-label={`${ten} — ${formatPrice(l.price_vnd, l.price_raw)}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={anh ?? placeholderImg(code)}
        alt={ten}
        loading={thu <= 2 ? "eager" : "lazy"}
        decoding="async"
        suppressHydrationWarning
        className={thu <= 2 ? "feed-anh" : "feed-anh anh-dan"}
      />
      <div className="feed-phu" />

      <div className="feed-tren">
        <span className="feed-nhan">{l.deal === "cho_thue" ? "Cho thuê" : "Bán"} · #{code}</span>
        <span className="feed-dem">{thu}/{tong}</span>
      </div>

      <Link href={href} className="feed-duoi block">
        <p className="feed-gia">{formatPrice(l.price_vnd, l.price_raw)}</p>
        {thongSo.length > 0 && <p className="feed-chu mt-1.5 text-sm font-bold text-white/95">{thongSo.join(" · ")}</p>}
        <p className="feed-chu mt-2 line-clamp-2 text-base font-extrabold leading-snug">{ten}</p>
        {noi && noi !== ten && <p className="feed-chu mt-0.5 text-sm text-white/80">{noi}</p>}
        <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-white/90 underline underline-offset-4">
          Xem chi tiết căn này
        </span>
      </Link>

      <div className="feed-ray">
        <div className="feed-nut">
          <FavButton code={code} className="h-12! w-12! bg-white! shadow-lg" />
          Lưu
        </div>
        <a href={zaloLink(`#${code}`)} target="_blank" rel="noopener" className="feed-nut" aria-label={`Hỏi căn #${code} qua Zalo`}>
          <span className="feed-tron feed-tron--zalo">
            <IconZalo className="h-6 w-6" />
          </span>
          Hỏi
        </a>
        <NutChiaSe url={`${SITE_URL}${href}`} title={`${ten} — ${formatPrice(l.price_vnd, l.price_raw)}`} />
        <Link href={href} className="feed-nut" aria-label="Xem chi tiết">
          <span className="feed-tron">
            <IconMo className="h-5 w-5" />
          </span>
          Chi tiết
        </Link>
      </div>
    </article>
  );
}

export default function FeedDoc({ tin, anh }: { tin: CardRow[]; anh: Record<string, string> }) {
  return (
    <section className="md:hidden" aria-label="Lướt nhà đang rao">
      <div className="feed">
        {/* Màn đầu: tìm bằng một câu nói */}
        <div className="feed-o">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/house1.jpg" alt="" fetchPriority="high" decoding="async" className="feed-anh opacity-40" />
          <div className="feed-phu" />
          <div className="relative z-[2] flex h-full flex-col justify-center px-5 pb-16">
            {/* SRS-5.1zzzzzzz437: bỏ nhãn đỏ trên tiêu đề, dấu chấm cuối tiêu đề, chip viên thuốc (dấu hiệu "AI slop") */}
            <p className="feed-chu text-[32px] font-black leading-[1.12] [text-wrap:balance]">
              Tìm nhà Sài Gòn, Long An?
              <br />
              <span className="text-brand-soft">Nhắn một câu là xong</span>
            </p>
            <form action="/api/search" method="get" role="search" className="mt-6 flex items-center gap-2 rounded-md bg-white p-1.5 pl-3 text-navy shadow-lg">
              <input type="hidden" name="go" value="1" />
              <IconSearch className="h-5 w-5 shrink-0 text-brand" />
              <input
                name="q"
                type="search"
                maxLength={300}
                autoComplete="off"
                placeholder="nhà HXH Quận 8 dưới 8 tỉ..."
                aria-label="Nhắn một câu mô tả căn anh chị đang tìm"
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-semibold outline-none placeholder:text-mute"
              />
              <button type="submit" className="nut nut-chinh nut-nho">Tìm</button>
            </form>
            <ul className="mt-5 space-y-2.5">
              {FEATURED_TAGS.slice(0, 4).map((t) => (
                <li key={t.slug}>
                  <Link href={`/${t.slug}`} className="feed-chu text-[15px] font-bold text-white">
                    {t.keyword} <span aria-hidden className="text-brand-soft">→</span>
                  </Link>
                </li>
              ))}
            </ul>
            <a href={zaloLink("feed_dau")} target="_blank" rel="noopener" className="nut mt-5 self-start bg-zalo text-white">
              <IconZalo className="h-5 w-5" /> Hỏi qua Zalo
            </a>
          </div>
          {tin.length > 0 && (
            <p className="feed-goi-y absolute inset-x-0 bottom-6 z-[2] text-center text-sm font-bold text-white/90">
              ↑ Vuốt lên xem {tin.length} căn mới
            </p>
          )}
        </div>

        {tin.map((l, i) => (
          <ManCan key={l.id} l={l} anh={l.code ? anh[l.code] : undefined} thu={i + 1} tong={tin.length} />
        ))}

        {/* Màn cuối */}
        <div className="feed-o flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-2xl font-black">Hết {tin.length} căn mới nhất</p>
          <p className="text-sm text-white/75">Xem cả kho, lọc theo phường, giá, hẻm xe hơi…</p>
          <div className="mt-2 flex w-full max-w-xs flex-col gap-3">
            <Link href="/mua-ban" className="nut nut-chinh w-full">Nhà đang bán</Link>
            <Link href="/cho-thue" className="nut w-full border border-white/30 bg-white/10 text-white">Nhà cho thuê</Link>
            <a href={zaloLink("feed_cuoi")} target="_blank" rel="noopener" className="nut w-full bg-zalo text-white">
              <IconZalo className="h-5 w-5" /> Nhờ tìm qua Zalo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
