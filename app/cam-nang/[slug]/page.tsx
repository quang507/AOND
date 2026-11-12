import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { baiBySlug, CAM_NANG } from "@/lib/cam-nang";
import { SITE_URL, zaloLink } from "@/lib/format";

// SRS-5.1zzzzzzz443: một bài cẩm nang. Dựng sẵn lúc build (nội dung nằm trong code, không đọc DB).
export const dynamicParams = false;

export function generateStaticParams() {
  return CAM_NANG.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = baiBySlug(slug);
  if (!b) return { title: "Không tìm thấy" };
  return {
    title: b.tieuDe,
    description: b.moTa,
    alternates: { canonical: `/cam-nang/${b.slug}` },
    openGraph: { title: b.tieuDe, description: b.moTa, url: `/cam-nang/${b.slug}`, type: "article", publishedTime: b.ngay },
  };
}

const ngayVN = (s: string) => s.split("-").reverse().join("/");

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = baiBySlug(slug);
  if (!b) notFound();
  const khac = CAM_NANG.filter((x) => x.slug !== b.slug);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: b.tieuDe,
    description: b.moTa,
    datePublished: b.ngay,
    dateModified: b.ngay,
    inLanguage: "vi",
    mainEntityOfPage: `${SITE_URL}/cam-nang/${b.slug}`,
    author: { "@type": "Organization", name: "AI Ơi Nhà Đất" },
    publisher: { "@type": "Organization", name: "AI Ơi Nhà Đất" },
  };

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\u003c") }} />
      <nav className="text-sm text-mute">
        <Link href="/" className="hover:text-brand">Trang chủ</Link>
        <span className="px-2">–</span>
        <Link href="/cam-nang" className="hover:text-brand">Cẩm nang</Link>
      </nav>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight [text-wrap:balance] md:text-4xl">{b.tieuDe}</h1>
      <p className="mt-3 text-lg leading-8 text-navy">{b.moTa}</p>
      <p className="mt-2 text-sm text-mute">Cập nhật {ngayVN(b.ngay)}</p>

      {b.muc.map((m) => (
        <section key={m.h2} className="mt-10">
          <h2 className="text-xl font-extrabold text-navy [text-wrap:balance] md:text-2xl">{m.h2}</h2>
          {m.doan?.map((d) => (
            <p key={d.slice(0, 40)} className="mt-3 leading-8 text-navy">{d}</p>
          ))}
          {m.ds && (
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-8 text-navy marker:text-brand">
              {m.ds.map((d) => (
                <li key={d.slice(0, 40)}>{d}</li>
              ))}
            </ul>
          )}
          {m.lienKet && (
            <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {m.lienKet.map((l) => (
                <Link key={l.href} href={l.href} className="font-semibold text-brand hover:underline">
                  {l.nhan} →
                </Link>
              ))}
            </p>
          )}
        </section>
      ))}

      <div className="mt-12 rounded-king bg-navy p-6 text-white">
        <h2 className="text-xl font-extrabold">Đang nhắm một căn cụ thể?</h2>
        <p className="mt-2 leading-7 text-line-strong">
          Nhắn mã tin qua Zalo, tụi em hỏi chủ nhà giùm những điều tin chưa ghi. Không cần để lại số điện thoại.
        </p>
        <a href={zaloLink(`cam_nang:${b.slug}`)} target="_blank" rel="noopener" className="nut mt-4 bg-zalo px-6 text-white hover:opacity-90">
          Hỏi qua Zalo
        </a>
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-extrabold text-navy">Bài khác</h2>
        <ul className="mt-3 grid gap-2">
          {khac.map((x) => (
            <li key={x.slug}>
              <Link href={`/cam-nang/${x.slug}`} className="text-navy hover:text-brand hover:underline">
                {x.tieuDe}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
