import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ListingCard from "@/components/ListingCard";
import { formatPrice, zaloLink } from "@/lib/format";
import { BAN_KINH_KM, MOC, mocBySlug, TEN_LOAI, tinGanMoc, TOI_THIEU_MOC, type TinGan } from "@/lib/moc";
import { coverByCode } from "@/lib/photos";

// SRS-5.1zzzzzzz443: "Nhà bán gần <địa danh>" — tin trong bán kính 2 km, gần trước. Mọi câu chữ sinh từ số tin thật (lib/moc.ts).
export const revalidate = 3600;
// Không dựng sẵn lúc build (giữ egress Supabase thấp như trang tag, SRS-5.1zl): dựng khi có người xem rồi giữ 1 giờ. Slug lạ → 404.
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const MAX = 24;
const km = (v: number) => `${v < 0.1 ? "dưới 0,1" : v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`;

function nhieuNhat(rows: TinGan[], lay: (r: TinGan) => string | null | undefined, n = 3) {
  const dem = new Map<string, number>();
  for (const r of rows) {
    const k = lay(r)?.trim();
    if (k) dem.set(k, (dem.get(k) ?? 0) + 1);
  }
  return [...dem].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function loiDan(ten: string, rows: TinGan[]): string {
  if (rows.length === 0)
    return `Hiện chưa có căn nào đang rao bán trong bán kính ${BAN_KINH_KM} km quanh ${ten} trên AI Ơi Nhà Đất. Kho tin đổi mỗi ngày, nhắn Zalo để được báo khi có căn mới.`;
  const gia = rows.map((r) => r.price_vnd).filter((v): v is number => !!v && v > 0);
  const phuong = nhieuNhat(rows, (r) => (r.ward && r.district ? `${r.ward} (${r.district})` : r.ward ?? r.district));
  const cau = [
    `Có ${rows.length} căn đang rao bán trong bán kính ${BAN_KINH_KM} km quanh ${ten}, căn gần nhất cách khoảng ${km(rows[0].km)}.`,
  ];
  if (phuong.length) cau.push(`Nhiều tin nhất ở ${phuong.map(([p, n]) => `${p}: ${n} căn`).join(", ")}.`);
  if (gia.length >= 2) cau.push(`Giá rao từ ${formatPrice(Math.min(...gia), null)} tới ${formatPrice(Math.max(...gia), null)}.`);
  cau.push("Khoảng cách tính theo vị trí con đường của căn nhà, chưa tới số nhà, nên chỉ để ước lượng.");
  return cau.join(" ");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = mocBySlug(slug);
  if (!m) return { title: "Không tìm thấy" };
  const rows = await tinGanMoc(slug);
  const title = `Nhà bán gần ${m.ten}`;
  const description = rows.length
    ? `${rows.length} căn đang rao bán trong bán kính ${BAN_KINH_KM} km quanh ${m.ten}, xếp từ gần tới xa. Hỏi từng căn qua Zalo, không cần để lại số điện thoại.`
    : `Tìm nhà bán quanh ${m.ten} trên AI Ơi Nhà Đất. Hỏi qua Zalo, không cần để lại số điện thoại.`;
  return {
    title,
    description,
    alternates: { canonical: `/gan/${m.slug}` },
    openGraph: { title, description, url: `/gan/${m.slug}`, type: "website" },
    ...(rows.length < TOI_THIEU_MOC ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = mocBySlug(slug);
  if (!m) notFound();
  const rows = await tinGanMoc(slug);
  const hien = rows.slice(0, MAX);
  const covers = await coverByCode(hien.map((l) => l.code));
  const cungLoai = MOC.filter((x) => x.loai === m.loai && x.slug !== m.slug);

  return (
    <>
      <div className="bg-navy pb-16 pt-10 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="text-sm text-white/55">
            <Link href="/" className="hover:text-brand">Trang chủ</Link>
            <span className="px-2">–</span>
            <Link href="/gan" className="hover:text-brand">Nhà gần địa danh</Link>
          </nav>
          <h1 className="mt-2 text-3xl font-extrabold [text-wrap:balance] md:text-4xl">Nhà bán gần {m.ten}</h1>
          <p className="mt-2 text-white/60">
            {rows.length} căn trong bán kính {BAN_KINH_KM} km · hỏi chi tiết bất kỳ căn nào qua Zalo
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-12">
        <div className="-mt-10 rounded-king bg-white p-5 shadow-[0_18px_40px_rgba(13,37,61,0.14)]">
          <p className="max-w-3xl leading-7 text-navy">{loiDan(m.ten, rows)}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={`/ban-do?moc=${encodeURIComponent(m.ten)}`} className="nut nut-phu nut-nho">
              Xem trên bản đồ
            </Link>
            <a href={zaloLink(`gan:${m.slug}`)} target="_blank" rel="noopener" className="nut nut-nho bg-zalo text-white hover:opacity-90">
              Hỏi nhà quanh {m.ten}
            </a>
          </div>
        </div>

        {hien.length > 0 ? (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {hien.map((l) => (
              <li key={l.id}>
                <p className="mb-2 text-sm font-semibold text-mute">Cách khoảng {km(l.km)}</p>
                <ListingCard listing={l} photo={l.code ? covers[l.code] : undefined} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 rounded-king border border-line bg-cream p-8 text-center">
            <p className="text-lg font-bold">Chưa có căn nào quanh {m.ten}</p>
            <p className="mt-2 text-mute">Nhắn Zalo khu và tầm giá, có căn mới khớp là tụi em báo.</p>
          </div>
        )}
        {rows.length > hien.length && (
          <p className="mt-6 text-center">
            <Link href={`/ban-do?moc=${encodeURIComponent(m.ten)}`} className="font-semibold text-brand hover:underline">
              Xem cả {rows.length} căn trên bản đồ →
            </Link>
          </p>
        )}

        {cungLoai.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-extrabold text-navy">Gần {TEN_LOAI[m.loai].toLowerCase()} khác</h2>
            <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {cungLoai.map((x) => (
                <li key={x.slug}>
                  <Link href={`/gan/${x.slug}`} className="text-navy hover:text-brand hover:underline">
                    Nhà bán gần {x.ten}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
