import Link from "next/link";
import FavButton from "@/components/FavButton";
import type { ListingCard as CardRow } from "@/lib/supabase";
import { ACCESS_SHORT, formatArea, formatPrice, oTheoLoai, placeholderImg, TYPE_LABEL } from "@/lib/format";
import { IconArea, IconBed, IconHouse, IconPin } from "@/components/icons";

export default function ListingCard({
  listing,
  featured,
  photo,
}: {
  /** Chỉ cần các cột CARD_COLS (lib/supabase) — không cần mô tả. */
  listing: CardRow;
  featured?: boolean;
  /** FR-148: ảnh bìa thật (bucket listing-photos theo mã); không có thì ảnh minh hoạ */
  photo?: string | null;
}) {
  const code = listing.code ?? listing.id.slice(0, 8);
  // FR-104: tiêu đề = tên đường đã bóc số nhà (`street`), không phải đoạn đầu
  // `location_raw` (có thể là "Số 1xx"). Không có tên đường thì phường + quận.
  const title =
    listing.street?.trim() ||
    `${listing.ward ?? ""} ${listing.district ?? "Quận 5"}`.trim();
  const loc = [listing.ward, listing.district ?? "Quận 5"].filter(Boolean).join(", ");

  return (
    <Link
      href={`/nha-dat/${encodeURIComponent(code)}`}
      className="group flex h-full flex-col rounded-king bg-white p-2.5 shadow-[0_2px_14px_rgba(13,37,61,0.06)] transition hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(13,37,61,0.13)]"
    >
      {/* Ảnh nằm TRONG khung, bo nhỏ hơn khung một nấc (cách của Veedoo) */}
      <div
        className={`relative overflow-hidden rounded-shot bg-navy/5 ${
          featured ? "aspect-[4/3] sm:aspect-auto sm:min-h-72 sm:flex-1" : "aspect-[4/3]"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* Ảnh thẻ là ảnh gốc từ điện thoại (vài MB/tấm) trong lưới 24 thẻ:
            lazy + decoding async để ảnh ngoài màn hình không chặn tải trang
            (FR-171 j). Ảnh bìa trang chi tiết mới ưu tiên cao. */}
        <img
          src={photo ?? placeholderImg(code)}
          alt={title}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
        />
        {/* Giá ĐÈ THẲNG lên ảnh, không chip - chữ trắng trên vệt tối chân ảnh */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/85 via-navy/35 to-transparent pt-12">
          <p
            className={`px-4 pb-3.5 font-extrabold text-white tabular-nums drop-shadow ${
              featured ? "text-3xl" : "text-xl"
            }`}
          >
            {formatPrice(listing.price_vnd, listing.price_raw)}
          </p>
        </div>
        <span className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="rounded-md bg-white/95 px-3 py-1 text-xs font-bold text-navy">
            {listing.deal === "cho_thue" ? "Cho thuê" : "Bán"}
          </span>
          {/* FR-172: đường vào là thứ khách Quận 5 hỏi đầu tiên - nói ngay trên thẻ */}
          {listing.access_type && ACCESS_SHORT[listing.access_type] && (
            <span className="rounded-md bg-navy/80 px-2.5 py-1 text-[11px] font-bold text-white">
              {ACCESS_SHORT[listing.access_type]}
            </span>
          )}
        </span>
        {/* Chưa có ảnh thật của căn này - NÓI RA. Ảnh đang hiện là ảnh minh hoạ
            dùng chung, không phải căn ở địa chỉ này. Không ghi thì khách đi xem
            nhà dựa trên một tấm hình của căn khác - đúng thứ FR-104 và cả tinh
            thần "trung thực với ảnh" trong kịch bản bot sinh ra để tránh. */}
        {!photo && (
          <span className="absolute bottom-2.5 right-3 rounded-md bg-navy/75 px-2.5 py-1 text-[11px] font-semibold text-white/95">
            Ảnh minh hoạ
          </span>
        )}
        <span className="absolute right-3 top-3">
          <FavButton code={code} small={!featured} />
        </span>
      </div>

      <div className="flex flex-1 flex-col px-2 pb-1.5 pt-3.5">
        <p
          className={`line-clamp-1 font-extrabold transition group-hover:text-brand ${
            featured ? "text-xl" : "text-[17px]"
          }`}
        >
          {title}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-mute">
          <IconPin className="h-4 w-4 shrink-0 text-brand" />
          <span className="line-clamp-1">
            {loc} <span className="text-mute/60">· #{code}</span>
          </span>
        </p>

        {/* Hàng thông số icon mảnh - chỉ hiện thứ tin này THẬT SỰ có.
            Veedoo còn cột toilet/chỗ đậu xe, kho mình không có nên bỏ. */}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-sm text-mute">
          {listing.property_type && TYPE_LABEL[listing.property_type] && (
            <span className="flex items-center gap-1.5">
              <IconHouse className="h-4 w-4 text-mute/70" />
              {TYPE_LABEL[listing.property_type]}
            </span>
          )}
          {listing.area_m2 ? (
            <span className="flex items-center gap-1.5 tabular-nums">
              <IconArea className="h-4 w-4 text-mute/70" />
              {formatArea(listing.area_m2)}
            </span>
          ) : null}
          {listing.bedrooms && oTheoLoai(listing.property_type).phongNgu ? (
            <span className="flex items-center gap-1.5 tabular-nums">
              <IconBed className="h-4 w-4 text-mute/70" />
              {listing.bedrooms} PN
            </span>
          ) : null}
          {/* FR-172: WC + số tầng - hai cột Veedoo có mà kho trước đây không có */}
          {listing.bathrooms ? (
            <span className="tabular-nums">{listing.bathrooms} WC</span>
          ) : null}
          {listing.floors ? (
            <span className="tabular-nums">{listing.floors} tầng</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
