import Link from "next/link";
import { coverByCode } from "@/lib/photos";
import { DT, docThamSo, GIA, layTin, PAGE_SIZE, PL, PN, sachIlike, TANG, VAO, XEP } from "@/lib/duyet-tin";
import BrowseWithMap from "@/components/BrowseWithMap";
import { timMoc } from "@/lib/moc";
import { zaloLink } from "@/lib/format";

export default async function ListingBrowse({
  deal,
  title,
  basePath,
  searchParams,
}: {
  deal: "ban" | "cho_thue";
  title: string;
  basePath: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sp, q, dienGiai, coLocPN, xep, page, truy } = docThamSo(deal, await searchParams);

  const { data: listings, total } = await layTin(truy);
  const covers = await coverByCode(listings.map((l) => l.code).filter(Boolean) as string[]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const withParam = (updates: Record<string, string | undefined>) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string" && v !== "") next[k] = v;
    }
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    const qs = new URLSearchParams(next).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "border-brand bg-brand text-white shadow-xs"
        : "border-line bg-white text-slate-700 hover:border-brand/50 hover:text-brand"
    }`;

  const filterSection = (
    <div className="space-y-2.5 rounded-lg bg-white p-4 shadow-sm border border-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 eyebrow text-mute">Giá</span>
        {GIA[deal].map((g) => (
          <Link key={g.key} rel="nofollow" prefetch={false} href={withParam({ gia: sp.gia === g.key ? undefined : g.key })} className={chip(sp.gia === g.key)}>
            {g.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 eyebrow text-mute">Diện tích</span>
        {DT.map((d) => (
          <Link key={d.key} rel="nofollow" prefetch={false} href={withParam({ dt: sp.dt === d.key ? undefined : d.key })} className={chip(sp.dt === d.key)}>
            {d.label}
          </Link>
        ))}
      </div>
      {coLocPN && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 eyebrow text-mute">Phòng ngủ</span>
          {PN.map((n) => (
            <Link key={n} rel="nofollow" prefetch={false} href={withParam({ pn: sp.pn === String(n) ? undefined : String(n) })} className={chip(sp.pn === String(n))}>
              {n}+ PN
            </Link>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 eyebrow text-mute">Đường vào</span>
        {VAO.map((v) => (
          <Link key={v.key} rel="nofollow" prefetch={false} href={withParam({ vao: sp.vao === v.key ? undefined : v.key })} className={chip(sp.vao === v.key)}>
            {v.label}
          </Link>
        ))}
      </div>
      {deal === "ban" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 eyebrow text-mute">Tầng · Sổ</span>
          {TANG.map((n) => (
            <Link key={n} rel="nofollow" prefetch={false} href={withParam({ tang: sp.tang === String(n) ? undefined : String(n) })} className={chip(sp.tang === String(n))}>
              {n}+ tầng
            </Link>
          ))}
          {PL.map((p) => (
            <Link key={p.key} rel="nofollow" prefetch={false} href={withParam({ pl: sp.pl === p.key ? undefined : p.key })} className={chip(sp.pl === p.key)}>
              {p.label}
            </Link>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 eyebrow text-mute">Xếp theo</span>
        {XEP.map((x) => (
          <Link key={x.key} rel="nofollow" prefetch={false} href={withParam({ xep: x.key === "moi" ? undefined : x.key })} className={chip(xep.key === x.key)}>
            {x.label}
          </Link>
        ))}
      </div>
    </div>
  );

  const paginationSection = totalPages > 1 ? (
    <div className="flex items-center justify-center gap-2 text-xs">
      {page > 1 && (
        <Link rel="nofollow" prefetch={false} href={withParam({ trang: String(page - 1) })} className="rounded-md border border-line bg-white px-4 py-2 font-semibold transition hover:border-brand hover:text-brand">
          ← Trước
        </Link>
      )}
      <span className="px-3 text-mute tabular-nums">Trang {page}/{totalPages}</span>
      {page < totalPages && (
        <Link rel="nofollow" prefetch={false} href={withParam({ trang: String(page + 1) })} className="rounded-md border border-line bg-white px-4 py-2 font-semibold transition hover:border-brand hover:text-brand">
          Sau →
        </Link>
      )}
    </div>
  ) : null;

  // SRS-5.1zzzzzzz457: câu có "gần <địa danh>" → mời sang trang bán kính 2 km (đếm theo khoảng cách thật, không theo chữ trong tin).
  const moc = deal === "ban" ? timMoc(q) : undefined;
  const coLoc = Object.keys(sp).some((k) => k !== "trang" && k !== "xep");
  const goiY = moc ? (
    <Link href={`/gan/${moc.slug}`} className="mb-4 flex items-center justify-between gap-3 rounded-king border border-brand/30 bg-brand-light px-4 py-3 text-sm font-semibold text-navy hover:border-brand">
      <span>Xem mọi căn đang bán trong bán kính 2 km quanh {moc.ten}</span>
      <span aria-hidden className="text-brand">→</span>
    </Link>
  ) : null;
  // Trang 0 kết quả từng trống trơn (đánh giá 13/11: tiêu chí "giúp thoát lỗi" 1/4) — giờ nói rõ và cho ba lối ra.
  const rong = (
    <div className="rounded-king border border-line bg-white px-6 py-10 text-center">
      <h2 className="text-lg font-extrabold [text-wrap:balance]">Chưa có căn nào khớp đủ các điều kiện này</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-mute">
        Thử bỏ bớt một điều kiện. Hoặc nhắn Zalo câu anh chị cần, có căn mới khớp là tụi em báo, không cần để lại số điện thoại.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {moc && (
          <Link href={`/gan/${moc.slug}`} className="nut nut-chinh">
            Xem nhà gần {moc.ten}
          </Link>
        )}
        {q && (
          <Link href={withParam({ q: undefined, trang: undefined })} className="nut nut-phu">
            Bỏ câu tìm “{q.length > 30 ? `${q.slice(0, 30)}…` : q}”
          </Link>
        )}
        {coLoc && (
          <Link href={basePath} className="nut nut-phu">
            Bỏ hết bộ lọc
          </Link>
        )}
        <a href={zaloLink(`rong:${basePath}`)} target="_blank" rel="noopener" className="nut bg-zalo text-white hover:opacity-90">
          Nhờ tìm qua Zalo
        </a>
      </div>
    </div>
  );

  return (
    <>
      {/* Hero Header */}
      <div className="bg-navy pb-16 pt-10 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">
            {title} {sp.phuong ? `- ${sp.phuong}` : sp.quan ? `- ${sachIlike(sp.quan)}` : "Sài Gòn & Long An"}
          </h1>
          {dienGiai && !dienGiai.empty ? (
            <p className="mt-2 text-white/80 text-sm">
              Tìm thấy <strong className="text-white">{total}</strong> tin theo yêu cầu:{" "}
              <span className="font-semibold text-white">{dienGiai.title}</span>
              <span className="text-white/50"> · anh chị hỏi “{q}”</span>{" "}
              {/* SRS-5.1zzzzzzz457: quận / loại nhà do câu tìm tự gán không có chip để gỡ — gỡ cả câu ở đây. */}
              <Link href={withParam({ q: undefined, trang: undefined })} className="whitespace-nowrap font-semibold text-white underline underline-offset-2 hover:text-brand-soft">
                Bỏ câu tìm
              </Link>
            </p>
          ) : (
            <p className="mt-2 text-white/70 text-sm">
              {total} bất động sản · Giá rao, hỏi kỹ từng căn qua Zalo
            </p>
          )}
        </div>
      </div>

      {/* Main Browse with Split Map toggle */}
      <BrowseWithMap
        listings={listings}
        covers={covers}
        total={total}
        basePath={basePath}
        filterSection={filterSection}
        paginationSection={paginationSection}
        q={q}
        goiY={goiY}
        rong={rong}
        api={`/api/tin?${new URLSearchParams({ deal, ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "trang" && typeof v === "string" && v !== "")) }).toString()}`}
        trang={page}
        tongTrang={totalPages}
        truoc={(page - 1) * PAGE_SIZE}
        dauUrl={page > 1 ? withParam({ trang: undefined }) : undefined}
      />
    </>
  );
}
