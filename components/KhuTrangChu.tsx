// SRS-5.1zzzzzzz436: khối khu trên trang chủ (máy tính), thay "Bản đồ Radar thị trường" (RadarMarketBlock).
// Khối cũ ghi số căn viết cứng không có thật ("340+ căn" Quận 7, "140+ lô" Bến Lức khi cả kho ~240 tin, Bến Lức 0 tin) và
// hứa "theo dõi sát biến động giá từng tuyến đường". Giờ: 6 khu nhiều tin bán nhất, số đếm thẳng từ kho, bấm vào là trang tag
// của khu (có khối giới thiệu khu). Bỏ chấm nhấp nháy, quầng sáng mờ, nhãn chữ in hoa, dải "100% Không Spam" lặp ba thẻ đầu trang.
import Link from "next/link";
import { zaloLink } from "@/lib/format";
import { demTinTheoKhu, GIOI_THIEU } from "@/lib/khu";
import { KHU_LE, tagChinhCuaKhu } from "@/lib/tags";

const SO_KHU = 6;

export default async function KhuTrangChu() {
  const dem = await demTinTheoKhu();
  const khu = KHU_LE.map((k) => ({ k, n: dem[k.slug] ?? 0, tag: tagChinhCuaKhu(k) }))
    .filter((x) => x.n > 0 && x.tag)
    .sort((a, b) => b.n - a.n)
    .slice(0, SO_KHU);
  if (khu.length === 0) return null;

  return (
    <section className="bg-navy py-16 text-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-extrabold [text-wrap:balance] md:text-4xl">Nhà đang bán theo khu</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-line-strong">
              Số tin đếm thẳng từ kho, cập nhật mỗi giờ. Bấm vào một khu để xem giá rao ở giữa, phường nhiều tin và từng căn.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/ban-do" className="nut nut-nho bg-white text-navy hover:bg-cream">
              Mở bản đồ
            </Link>
            <a href={zaloLink("khu_trang_chu")} target="_blank" rel="noopener" className="nut nut-nho bg-zalo text-white hover:opacity-90">
              Hỏi giá khu vực
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {khu.map(({ k, n, tag }) => (
            <Link key={k.slug} href={`/${tag!.slug}`} className="group rounded-lg bg-navy-soft p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-extrabold group-hover:text-brand-soft">{k.label.replace(/, Long An$/, "")}</h3>
                <span className="shrink-0 text-sm font-bold text-line-strong">{n} tin</span>
              </div>
              {GIOI_THIEU[k.slug] && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-line-strong">{GIOI_THIEU[k.slug]}</p>}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
