import Link from "next/link";
import FavButton from "@/components/FavButton";
import type { ListingCard as CardRow } from "@/lib/supabase";
import { formatArea, formatPrice, ngayDang, placeholderImg, TYPE_LABEL } from "@/lib/format";
import { IconPin } from "@/components/icons";

export default function ListingCard({
  listing,
  featured,
  photo,
  moi,
}: {
  listing: CardRow;
  featured?: boolean;
  photo?: string | null;
  /** SRS-5.1zzzzzzz447: thẻ vừa nối thêm khi cuộn — hiện lên nhẹ thay vì bật ra. */
  moi?: boolean;
}) {
  const code = listing.code ?? listing.id.slice(0, 8);
  // SRS-5.1zzzzzzz451: tiêu đề có loại nhà ("Nhà phố Quang Trung") — trước chỉ tên đường, người lướt không biết nhà, đất hay căn hộ.
  const noi = listing.street?.trim() || `${listing.ward ?? ""} ${listing.district ?? ""}`.trim();
  const loai = listing.property_type ? TYPE_LABEL[listing.property_type]?.split(" / ")[0] : undefined;
  const title = (loai && noi ? `${loai} ${noi}` : noi || loai) || "Bất động sản Sài Gòn & Long An";
  const loc = [listing.ward, listing.district].filter(Boolean).join(", ") || "TP. Hồ Chí Minh";
  const priceStr = formatPrice(listing.price_vnd, listing.price_raw);
  const areaStr = formatArea(listing.area_m2);

  return (
    // SRS-5.1zzzzzzz447: rê chuột thì thẻ nhấc lên 2px (hover: của Tailwind 4 chỉ chạy trên máy có chuột, motion-safe: bỏ khi máy
    // bật giảm chuyển động) — giống thẻ bài của theme King, nhưng nhẹ hơn: thẻ tin nằm dày 4 cột, nhấc mạnh thì cả lưới nhảy.
    <div className={`group flex flex-col rounded-king bg-white border border-line overflow-hidden shadow-xs hover:shadow-md hover:border-line-strong transition-all duration-200 motion-safe:hover:-translate-y-0.5${moi ? " the-vao" : ""}`}>
      {/* Thumbnail */}
      <Link href={`/nha-dat/${encodeURIComponent(code)}`} className="relative aspect-[16/10] overflow-hidden bg-line block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo ?? placeholderImg(code)}
          alt={title}
          loading="lazy"
          decoding="async"
          suppressHydrationWarning
          className="anh-dan w-full h-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
        />
        {/* Deal Tag */}
        {listing.deal && (
          <span className="absolute top-2 left-2 rounded bg-navy/80 text-white text-[11px] font-semibold px-2 py-0.5 backdrop-blur-xs">
            {listing.deal === "cho_thue" ? "Cho thuê" : "Bán"}
          </span>
        )}
      </Link>

      {/* Body */}
      <div className="p-3 sm:p-3.5 flex flex-col flex-1">
        {/* Title */}
        <Link
          href={`/nha-dat/${encodeURIComponent(code)}`}
          className="font-bold text-navy text-sm leading-snug line-clamp-2 group-hover:text-brand transition-colors"
          title={title}
        >
          {title}
        </Link>
        {listing.can_kiem_chung && (   /* SRS-5.1zzzzzzz466 */
          <span className="mt-1 self-start rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
            Thông tin cần kiểm chứng thêm
          </span>
        )}

        {/* Price & Area */}
        <div className="mt-2 flex items-baseline gap-2 text-sm">
          <span className="text-brand font-extrabold text-base">{priceStr}</span>
          {listing.area_m2 ? (
            <>
              <span className="text-line-strong font-normal">|</span>
              <span className="text-navy/75 font-semibold text-xs">{areaStr}</span>
            </>
          ) : null}
        </div>

        {/* Location */}
        <div className="mt-1 flex items-center gap-1 text-xs text-mute truncate">
          <IconPin className="w-3.5 h-3.5 text-mute shrink-0" />
          <span className="truncate">{loc}</span>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-2.5 border-t border-line flex items-center justify-between text-xs text-mute">
          {/* SRS-5.1zzzzzzz448: trước đây mọi thẻ ghi cứng "Đăng hôm nay" và gắn nhãn "✓ Xác thực" lên ảnh — cả hai sai với khách
              (kho không có cột xác minh nào ở mức tin). Giờ ghi ngày đăng thật, bỏ nhãn xác thực. */}
          <span>{ngayDang(listing.created_at) ? `Đăng ${ngayDang(listing.created_at)}` : ""}</span>
          <FavButton code={code} variant="square" />
        </div>
      </div>
    </div>
  );
}
