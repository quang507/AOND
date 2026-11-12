import Link from "next/link";
import { IconAsk, IconChart, IconCalc, IconClock, IconSearch, IconShield } from "@/components/icons";
import { zaloLink } from "@/lib/format";
import { FEATURED_TAGS, KHU_LE, tagChinhCuaKhu } from "@/lib/tags";
import KhuTrangChu from "@/components/KhuTrangChu";
import FeedDoc from "@/components/FeedDoc";
import { CARD_COLS, supabase, type ListingCard as CardRow, TRANG_THAI_HIEN } from "@/lib/supabase";
import { coverFullByCode } from "@/lib/photos";

export const revalidate = 10800; // 3 giờ

// SRS-5.1zzzzzzz437 (chủ dự án 12/11/2026 "Sửa luôn" — gỡ dấu hiệu "AI slop" theo danh sách 20 dấu hiệu):
// bỏ nhãn chữ in hoa trên mỗi tiêu đề, dấu chấm cuối tiêu đề, đánh số "1. 2. 3.", khung chat giả trong từng thẻ, thẻ lồng thẻ có
// viền, quầng sáng mờ / vệt đỏ loang, chữ nghiêng, chip viên thuốc. Gộp khối "Bảo vệ quyền riêng tư" vào lời hứa đầu tiên (hai khối
// nói cùng một ý). Lưới "Phường 1…15" (phường CŨ Quận 5, trước sáp nhập 2025) thay bằng danh sách 22 khu dẫn tới trang tag.

const LOI_HUA: Array<{ Icon: (p: { className?: string }) => React.ReactElement; t: string; d: string }> = [
  {
    Icon: IconShield,
    t: "Không thu số điện thoại",
    d: "Để lại số trên trang nhà đất là ăn 40 cuộc gọi trong 3 ngày. Ở đây chỉ nhắn Zalo, khi hẹn xem nhà mới cần liên hệ. Nhắn “dừng” là tụi em im, không hỏi lý do.",
  },
  {
    Icon: IconClock,
    t: "Trực 24/7, nhớ nhu cầu",
    d: "Chat hôm nay, ba tháng sau quay lại vẫn tiếp đúng chỗ cũ: khu nào, tầm giá nào, cần hẻm xe hơi hay không. Không hỏi lại từ đầu.",
  },
  {
    Icon: IconAsk,
    t: "Thiếu gì thì đi hỏi giùm",
    d: "Tin chưa ghi pháp lý, hẻm rộng bao nhiêu? Tụi em hỏi chủ nhà rồi báo lại. Điều chưa xác minh thì nói là chưa xác minh, không đoán thay chủ nhà.",
  },
];

const VONG_HOI = [
  { ai: "Anh chị hỏi tụi em", noi: "“Sổ riêng chưa? Có lộ giới không?”", chu: "Hỏi bằng Zalo, câu nào cũng được." },
  { ai: "Tụi em hỏi người bán", noi: "Chuyển đúng câu đó tới chủ nhà hoặc môi giới, có hạn trả lời.", chu: "Chủ nhà không thấy Zalo của anh chị." },
  { ai: "Báo lại anh chị", noi: "Có câu trả lời là báo ngay, ghi vào tin để người sau khỏi hỏi lại.", chu: "Chưa có thì nói thẳng là chưa có." },
];

// SRS-5.1zzzzzzz430: feed điện thoại lấy 60 tin mới nhất đang lên kệ, căn có ảnh lên trước, giữ 30.
const SO_TIN_FEED = 30;

async function tinFeed(): Promise<{ tin: CardRow[]; anh: Record<string, string> }> {
  const { data } = await supabase
    .from("listings")
    .select(CARD_COLS)
    .in("status", TRANG_THAI_HIEN)
    .order("created_at", { ascending: false })
    .limit(60);
  const rows = (data ?? []) as CardRow[];
  const anh = await coverFullByCode(rows.map((r) => r.code));
  const coAnh = rows.filter((r) => r.code && anh[r.code]);
  const khongAnh = rows.filter((r) => !(r.code && anh[r.code]));
  return { tin: [...coAnh, ...khongAnh].slice(0, SO_TIN_FEED), anh };
}

export default async function Home() {
  const { tin, anh } = await tinFeed();
  const khuLink = KHU_LE.map((k) => ({ k, tag: tagChinhCuaKhu(k) })).filter((x) => x.tag);
  return (
    <>
      {/* ĐIỆN THOẠI: feed vuốt dọc kiểu TikTok (chủ dự án 12/11/2026 "Thay trang chủ trên điện thoại") */}
      <FeedDoc tin={tin} anh={anh} />

      {/* MÁY TÍNH */}
      <div className="hidden md:block">
        {/* 1. Hero */}
        <section className="bg-navy pb-12 pt-4 text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pt-14 md:grid-cols-[1.15fr_.85fr]">
            <div>
              <h1 className="text-5xl font-extrabold leading-[1.12] [text-wrap:balance]">
                Tìm nhà Sài Gòn, Long An?
                <br />
                <span className="text-brand-soft">Nhắn một câu là xong</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-line-strong">
                Tụi em không hỏi số điện thoại, không spam. Trợ lý trực 24/7 trên Zalo, hỏi kiểu gì cũng hiểu: “nhà gần Lotte Mart
                Quận 7”, “hẻm xe hơi dưới 10 tỉ”.
              </p>
              <p className="mt-6 max-w-lg text-sm leading-7 text-line-strong">
                Tìm nhanh:{" "}
                {FEATURED_TAGS.slice(0, 5).map((t, i) => (
                  <span key={t.slug}>
                    {i > 0 && <span aria-hidden> · </span>}
                    <Link href={`/${t.slug}`} className="font-semibold text-white underline-offset-4 hover:text-brand-soft hover:underline">
                      {t.keyword}
                    </Link>
                  </span>
                ))}
              </p>
            </div>

            <div className="overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/house1.jpg"
                alt="Nhà phố Sài Gòn & Long An"
                fetchPriority="high"
                decoding="async"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          </div>

          {/* Ô tìm bằng câu nói */}
          <div className="mx-auto mt-8 max-w-6xl px-4">
            <form action="/api/search" method="get" role="search" className="flex items-center gap-3 rounded-lg bg-white p-2 pl-4 text-navy">
              <input type="hidden" name="go" value="1" />
              <IconSearch className="h-5 w-5 shrink-0 text-brand" />
              <input
                name="q"
                type="search"
                maxLength={300}
                autoComplete="off"
                placeholder="tìm mua nhà phố HXH Quận 8, căn hộ Nhà Bè, biệt thự Bình Chánh, đất Bến Lức..."
                aria-label="Nhắn một câu mô tả căn anh chị đang tìm"
                className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base font-medium leading-6 text-navy outline-none placeholder:text-mute"
              />
              <button type="submit" className="nut nut-chinh min-h-[44px] px-6 text-sm">
                Tìm ngay
              </button>
              <a href={zaloLink("hero")} className="nut nut-phu min-h-[44px] px-5 text-sm">
                Hỏi qua Zalo
              </a>
            </form>
          </div>
        </section>

        {/* 2. Ba lời hứa — chữ thường, không thẻ, không khung chat giả */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-3">
          {LOI_HUA.map(({ Icon, t, d }) => (
            <div key={t}>
              <Icon className="h-6 w-6 text-brand" />
              <h2 className="mt-3 text-lg font-extrabold text-navy">{t}</h2>
              <p className="mt-2 text-sm leading-6 text-mute">{d}</p>
            </div>
          ))}
        </section>

        {/* 3. Đi hỏi giùm chủ nhà */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="rounded-lg bg-white p-8">
            <h2 className="text-3xl font-extrabold text-navy [text-wrap:balance]">
              Câu nào tụi em chưa biết, tụi em đi hỏi chủ nhà rồi báo lại
            </h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
              {VONG_HOI.map((b, i) => (
                <li key={b.ai} className="contents">
                  <div>
                    <p className="text-sm font-bold text-brand">{b.ai}</p>
                    <p className="mt-2 font-bold leading-6 text-navy">{b.noi}</p>
                    <p className="mt-1 text-sm text-mute">{b.chu}</p>
                  </div>
                  {i < VONG_HOI.length - 1 && (
                    <span aria-hidden className="self-center text-2xl font-bold text-line-strong">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 4. Khu nhiều tin — số đếm thật từ kho (SRS-5.1zzzzzzz436) */}
        <KhuTrangChu />

        {/* 5. Công cụ + chọn khu */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1fr_1.4fr]">
          <div className="grid content-start gap-8">
            {[
              { href: "/tinh-lai-vay", Icon: IconCalc, t: "Tính lãi vay mua nhà", d: "Mỗi tháng trả bao nhiêu, xem trước dòng tiền rồi hãy quyết." },
              { href: "/thong-ke", Icon: IconChart, t: "Giá theo phường", d: "Phường nào đang rao đắt nhất, tính từ tin thật trong kho." },
            ].map(({ href, Icon, t, d }) => (
              <Link key={href} href={href} className="group flex gap-4">
                <Icon className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
                <span>
                  <span className="block font-extrabold text-navy group-hover:text-brand">{t}</span>
                  <span className="mt-1 block text-sm leading-6 text-mute">{d}</span>
                </span>
              </Link>
            ))}
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-navy">Chọn khu anh chị đang nhắm</h2>
            <ul className="mt-4 grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
              {khuLink.map(({ k, tag }) => (
                <li key={k.slug}>
                  <Link href={`/${tag!.slug}`} className="text-navy hover:text-brand hover:underline">
                    {k.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 6. Người bán */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="rounded-lg bg-navy px-10 py-10 text-white">
            <div className="max-w-xl">
              <h2 className="text-3xl font-extrabold [text-wrap:balance]">Rao bán? Một câu là xong</h2>
              <p className="mt-3 leading-7 text-line-strong">
                “Bán nhà HXH xe tải quay đầu, gần Cao Lỗ Quận 8, 9 tỉ bớt lộc”, nhắn vậy là đủ. Tụi em viết lại tin, trả lời khách, chỉ
                liên hệ anh chị khi thật sự cần.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link href="/raoban" className="nut nut-chinh px-6">
                  Rao bán miễn phí
                </Link>
                <a href={zaloLink("seller_cta")} target="_blank" rel="noopener" className="nut bg-zalo px-6 text-white hover:opacity-90">
                  Gửi tin qua Zalo
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
