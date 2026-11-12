"use client";

// SRS-5.1zzzzzzz447: trang tag tự tải thêm khi cuộn. 24 tin đầu vẫn do server dựng (Google đọc được); tin sau nối vào cùng lưới.
import ListingCard from "@/components/ListingCard";
import { NutTaiThem, useTaiThem } from "@/components/TaiThem";
import type { ListingCard as CardRow } from "@/lib/supabase";

export default function TagTaiThem({
  slug,
  dau,
  tongTrang,
  tongTin,
  luoi,
  hetJs,
}: {
  slug: string;
  dau: CardRow[];
  tongTrang: number;
  tongTin: number;
  luoi: string;
  /** Link "Xem cả N tin" cũ — chỉ hiện khi chưa chạy JS. */
  hetJs: React.ReactNode;
}) {
  const t = useTaiThem(`/api/tin?tag=${encodeURIComponent(slug)}`, 1, tongTrang, dau);
  return (
    <>
      {t.them.length > 0 && (
        <div className={`mt-5 ${luoi}`}>
          {t.them.map((l) => (
            <ListingCard key={l.id} listing={l} photo={l.code ? t.anh[l.code] : undefined} moi />
          ))}
        </div>
      )}
      {tongTrang > 1 && <div className="mt-8">{t.coJs ? <NutTaiThem t={t} dangXem={dau.length + t.them.length} tongTin={tongTin} /> : hetJs}</div>}
    </>
  );
}
