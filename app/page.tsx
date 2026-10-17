import Link from "next/link";
import { IconAsk, IconChart, IconCalc, IconClock, IconSearch, IconShield } from "@/components/icons";
import { placeholderImg, zaloLink } from "@/lib/format";
import { WARDS } from "@/lib/geo";
import { FEATURED_TAGS } from "@/lib/tags";
import CuratedShowcase from "@/components/CuratedShowcase";
import RadarMarketBlock from "@/components/RadarMarketBlock";

export const revalidate = 10800; // 3 giờ

type Bong = { ai: "khach" | "em"; noi: string };

const LOI_HUA: Array<{ Icon: (p: { className?: string }) => React.ReactElement; t: string; d: string; chat: Bong[] }> = [
  {
    Icon: IconShield,
    t: "Không thu số điện thoại",
    d: "Để lại số trên trang nhà đất là ăn 40 cuộc gọi trong 3 ngày. Chỉ khi hẹn xem nhà mới cần liên hệ, và luôn có đường từ chối.",
    chat: [
      { ai: "khach", noi: "Em cần số của chị không?" },
      { ai: "em", noi: "Dạ không chị. Mình nhắn Zalo là đủ, lúc hẹn xem nhà mới tính." },
      { ai: "khach", noi: "Vậy đỡ bị gọi làm phiền." },
    ],
  },
  {
    Icon: IconClock,
    t: "Trực 24/7, nhớ nhu cầu",
    d: "Chat hôm nay, ba tháng sau quay lại vẫn tiếp đúng chỗ cũ, không hỏi lại từ đầu.",
    chat: [
      { ai: "khach", noi: "Hồi tháng 5 anh có hỏi nhà Phường 5 dưới 8 tỉ đó em." },
      { ai: "em", noi: "Dạ em nhớ, hẻm xe hơi 3 phòng ngủ. Tháng này có 2 căn mới, em gửi anh liền." },
      { ai: "khach", noi: "Ok gửi anh xem." },
    ],
  },
  {
    Icon: IconAsk,
    t: "Thiếu gì thì đi hỏi giùm",
    d: "Chưa rõ pháp lý, hẻm rộng bao nhiêu - tụi em hỏi chủ nhà rồi báo lại anh chị.",
    chat: [
      { ai: "khach", noi: "Căn #35148 hẻm mấy mét, xe hơi vô được không?" },
      { ai: "em", noi: "Tin chưa ghi, em hỏi chủ nhà rồi báo chị trong hôm nay nha." },
      { ai: "em", noi: "Chủ nhà xác nhận hẻm 5m, xe 7 chỗ quay đầu được chị." },
    ],
  },
];

const VONG_HOI = [
  { ai: "Anh chị hỏi tụi em", noi: "“Sổ riêng chưa? Có lộ giới không?”", chu: "Hỏi bằng Zalo, câu nào cũng được." },
  { ai: "Tụi em hỏi người bán", noi: "Chuyển đúng câu đó tới chủ nhà / môi giới, có hạn trả lời.", chu: "Chủ nhà không thấy Zalo của anh chị." },
  { ai: "Báo lại anh chị", noi: "Có câu trả lời là báo ngay, ghi vào tin để người sau khỏi hỏi lại.", chu: "Chưa có thì nói thẳng là chưa có." },
];

function HoiThoai({ chat, toi }: { chat: Bong[]; toi?: boolean }) {
  return (
    <div className={`mt-4 flex flex-col gap-1.5 rounded-xl p-3 text-sm leading-5 ${toi ? "bg-white/10" : "bg-cream/70"}`} aria-label="Minh hoạ hội thoại">
      {chat.map((b, i) => (
        <p
          key={i}
          className={`max-w-[88%] rounded-2xl px-3 py-1.5 ${
            b.ai === "khach"
              ? `self-start rounded-bl-sm ${toi ? "bg-white/15 text-white" : "bg-white text-navy shadow-sm"}`
              : `self-end rounded-br-sm ${toi ? "bg-brand text-white font-medium shadow-sm" : "bg-brand/10 text-navy font-medium"}`
          }`}
        >
          {b.noi}
        </p>
      ))}
    </div>
  );
}

export default async function Home() {
  return (
    <>
      {/* 1. HERO DARK NAVY (#0B192C) */}
      <section className="relative bg-navy text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-28 pt-14 md:grid-cols-[1.15fr_.85fr] md:pt-16">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-brand text-xs font-bold tracking-wide uppercase mb-3">
              <span>📍</span>
              <span>Môi giới thường trực · Sài Gòn & Long An</span>
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.08] [text-wrap:balance] md:text-5xl text-white">
              Tìm nhà Sài Gòn, Long An?
              <br />
              <span className="text-amber-400">Nhắn một câu là xong.</span>
            </h1>
            <p className="mt-5 max-w-md leading-7 text-white/75 text-base">
              Tụi em không hỏi số điện thoại, không spam. Trợ lý trực 24/7 trên
              Zalo, hỏi kiểu gì cũng hiểu: “nhà gần hồ bơi Lam Sơn”, “hẻm xe hơi
              dưới 10 tỉ”.
            </p>
            <div className="mt-7 flex flex-wrap gap-2 text-xs">
              {FEATURED_TAGS.slice(0, 5).map((t) => (
                <Link
                  key={t.slug}
                  href={`/${t.slug}`}
                  className="rounded-lg border border-white/20 bg-white/5 px-3.5 py-1.5 text-white/85 transition hover:border-brand hover:bg-brand hover:text-white"
                >
                  {t.keyword}
                </Link>
              ))}
            </div>
          </div>

          {/* Ảnh minh hoạ Hero */}
          <div className="relative hidden md:block">
            <div className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={placeholderImg("hero-q5")}
                alt="Nhà phố Sài Gòn & Long An"
                fetchPriority="high"
                decoding="async"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Thanh tìm kiếm DẠNG CHAT nổi đè chân hero */}
        <div className="relative mx-auto -mb-12 max-w-6xl px-4">
          <form
            action="/api/search"
            method="get"
            role="search"
            className="flex flex-col gap-3 rounded-2xl bg-white p-4 text-navy shadow-[0_18px_40px_rgba(13,37,61,0.18)] border border-slate-100 sm:flex-row sm:items-center sm:gap-4 sm:p-3 sm:pl-6"
          >
            <input type="hidden" name="go" value="1" />
            <IconSearch className="hidden h-5 w-5 shrink-0 text-brand sm:block" />
            <input
              name="q"
              type="search"
              maxLength={300}
              autoComplete="off"
              placeholder="tìm mua nhà phố HXH 8 tỉ ở Q5, căn hộ Nhà Bè, đất Bến Lức..."
              aria-label="Nhắn một câu mô tả căn anh chị đang tìm"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 leading-6 text-navy outline-none placeholder:text-mute font-medium text-sm sm:text-base"
            />
            <button
              type="submit"
              className="nut nut-chinh px-6 py-2.5 rounded-xl font-bold shadow-sm"
            >
              Tìm ngay
            </button>
            <a
              href={zaloLink("hero")}
              className="nut nut-phu px-5 py-2.5 rounded-xl font-bold"
            >
              Hỏi qua Zalo
            </a>
          </form>
        </div>
      </section>

      {/* 2. KHỐI 3 LỜI HỨA CỐT LÕI (NỀN SÁNG) */}
      <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-4 pt-24 md:grid-cols-3">
        {LOI_HUA.map(({ Icon, t, d, chat }) => (
          <div key={t} className="flex flex-col rounded-2xl bg-white p-6 border border-line shadow-[0_2px_14px_rgba(13,37,61,0.06)] hover:shadow-md transition">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand">
              <Icon className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-extrabold text-navy">{t}</h2>
            <p className="mt-1.5 text-xs sm:text-sm leading-6 text-mute">{d}</p>
            <HoiThoai chat={chat} />
          </div>
        ))}
      </section>

      {/* 3. KHỐI 7 CĂN BĐS TUYỂN CHỌN ĐA DẠNG LOẠI HÌNH (XEN KẼ) */}
      <CuratedShowcase />

      {/* 4. VÒNG HỎI 3 BƯỚC ĐI HỎI GIÙM CHỦ NHÀ */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl bg-white p-6 border border-line shadow-[0_2px_14px_rgba(13,37,61,0.06)] md:p-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-bold tracking-wide uppercase mb-2">
            <span>🤝</span>
            <span>Hỏi bất kỳ, có tức thì</span>
          </div>
          <h2 className="text-2xl font-extrabold text-navy [text-wrap:balance] md:text-3xl">
            Câu nào tụi em chưa biết, tụi em đi hỏi chủ nhà rồi báo lại
          </h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
            {VONG_HOI.map((b, i) => (
              <li key={b.ai} className="contents">
                <div className="rounded-xl border border-line bg-cream/60 p-5">
                  <p className="eyebrow text-mute">{i + 1}. {b.ai}</p>
                  <p className="mt-2 font-bold leading-6 text-navy text-sm md:text-base">{b.noi}</p>
                  <p className="mt-1 text-xs text-mute">{b.chu}</p>
                </div>
                {i < VONG_HOI.length - 1 && (
                  <span aria-hidden className="hidden self-center text-2xl text-brand md:block font-bold">→</span>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-mute italic">
            * Điều chưa xác minh tụi em nói là chưa xác minh - tuyệt đối không đoán thay chủ nhà.
          </p>
        </div>
      </section>

      {/* 5. KHỐI RADAR ĐỘ PHỦ THỊ TRƯỜNG BĐS (NỀN DARK NAVY TƯƠNG PHẢN) */}
      <RadarMarketBlock />

      {/* 6. CAM KẾT RIÊNG TƯ ZALO */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-6 rounded-2xl bg-navy p-6 text-white md:grid-cols-[1.1fr_.9fr] md:p-10 shadow-xl border border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-brand text-xs font-bold tracking-wide uppercase mb-2">
              <span>🔒</span>
              <span>Bảo vệ quyền riêng tư</span>
            </div>
            <h2 className="mt-1.5 text-2xl font-extrabold [text-wrap:balance] md:text-3xl text-white">
              Kết nối bằng Zalo là đủ. Muốn dừng thì dừng.
            </h2>
            <ul className="mt-6 space-y-3 text-white/85 text-sm">
              {[
                "Không cần tiết lộ số điện thoại - chỉ khi hẹn xem nhà mới cần, và có đường từ chối.",
                "Chỉ liên hệ bằng Zalo, đúng kênh anh chị đã chọn. Không gọi làm phiền, không spam SMS.",
                "Ngắt kết nối bất cứ lúc nào: chặn OA hoặc nhắn “dừng” là tụi em im ngay - không hỏi lý do.",
              ].map((x) => (
                <li key={x} className="flex gap-3 leading-6">
                  <span className="mt-0.5 shrink-0 text-amber-400 font-bold">✓</span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="self-center">
            <HoiThoai
              toi
              chat={[
                { ai: "khach", noi: "Cho anh số của em để anh gọi cho tiện?" },
                { ai: "em", noi: "Dạ mình nhắn ở đây là đủ anh - tụi em không xin số, cũng không gọi làm phiền." },
                { ai: "khach", noi: "Vậy lúc nào không cần nữa thì sao?" },
                { ai: "em", noi: "Anh nhắn “dừng” là em im liền, khỏi giải thích ạ." },
              ]}
            />
          </div>
        </div>
      </section>

      {/* 7. CÔNG CỤ TÀI CHÍNH & CHỌN THEO PHƯỜNG */}
      <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-12 lg:grid-cols-2">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { href: "/tinh-lai-vay", Icon: IconCalc, t: "Tính lãi vay mua nhà", d: "Mỗi tháng trả bao nhiêu, xem trước dòng tiền rồi hãy quyết." },
            { href: "/thong-ke", Icon: IconChart, t: "Giá theo phường", d: "Phường nào đang rao đắt nhất, tính từ tin thật trong kho." },
          ].map(({ href, Icon, t, d }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl bg-white p-5 border border-line shadow-[0_2px_14px_rgba(13,37,61,0.06)] transition hover:-translate-y-1 hover:shadow-md hover:border-brand/40"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
                <Icon className="h-6 w-6" />
              </span>
              <p className="mt-4 font-extrabold text-navy group-hover:text-brand transition-colors">{t}</p>
              <p className="mt-1 text-xs leading-5 text-mute">{d}</p>
            </Link>
          ))}
        </div>
        <div className="rounded-2xl bg-white p-6 border border-line shadow-[0_2px_14px_rgba(13,37,61,0.06)]">
          <p className="eyebrow text-brand">Theo phường & khu vực</p>
          <h2 className="mt-1.5 text-lg font-extrabold text-navy">Chọn khu vực anh chị đang nhắm</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {WARDS.map((w) => (
              <Link
                key={w}
                href={`/mua-ban?phuong=${encodeURIComponent(w)}`}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-slate-700 transition hover:border-brand hover:text-brand bg-slate-50"
              >
                {w}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 8. CTA DÀNH CHO NGƯỜI BÁN */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="relative overflow-hidden rounded-2xl bg-navy px-6 py-12 text-white md:px-12 border border-white/10 shadow-xl">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand/25 blur-3xl" />
          <div className="relative max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-brand text-xs font-bold tracking-wide uppercase mb-3">
              <span>🏠</span>
              <span>Dành cho người bán</span>
            </div>
            <h2 className="mt-2 text-2xl font-extrabold [text-wrap:balance] md:text-3xl text-white">
              Rao bán? Một câu là xong.
            </h2>
            <p className="mt-3 leading-7 text-white/75 text-sm md:text-base">
              “Bán nhà HXH xe tải quay đầu, gần ngã tư Trần Bình Trọng, 9 tỉ bớt
              lộc” - nhắn vậy là đủ. Tụi em viết lại tin, trả lời khách, chỉ liên
              hệ anh chị khi thật sự cần.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link
                href="/raoban"
                className="nut nut-chinh px-6 py-3 rounded-xl font-bold shadow-md"
              >
                Rao bán ngay - Miễn phí
              </Link>
              <a
                href={zaloLink("seller_cta")}
                className="px-6 py-3 rounded-xl border border-white/20 bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition"
              >
                Gửi tin qua Zalo
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
