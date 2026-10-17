import Link from "next/link";
import { zaloLink } from "@/lib/format";

const KEY_REGIONS = [
  { name: "Quận 7", desc: "Khu đô thị Phú Mỹ Hưng, biệt thự & căn hộ cao cấp", count: "340+ căn", tag: "q7" },
  { name: "Quận 8", desc: "Mặt tiền Cao Lỗ, Phạm Thế Hiển, kết nối nhanh Quận 1", count: "280+ căn", tag: "q8" },
  { name: "Quận 10", desc: "Toà nhà dòng tiền, CHDV, gần Vạn Hạnh Mall", count: "190+ căn", tag: "q10" },
  { name: "Nhà Bè", desc: "Căn hộ Sunrise Riverside, biệt thự ven sông", count: "210+ căn", tag: "nha-be" },
  { name: "Bình Chánh", desc: "Mizuki Park, KDC Trung Sơn, nhà vườn sinh thái", count: "175+ căn", tag: "binh-chanh" },
  { name: "Bến Lức (Long An)", desc: "Đất thổ cư ODT, đón sóng cao tốc & KCN", count: "140+ lô", tag: "long-an" },
];

export default function RadarMarketBlock() {
  return (
    <section className="relative overflow-hidden bg-navy text-white py-16">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute -left-20 top-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-brand/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -top-20 w-80 h-80 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-brand text-xs font-bold tracking-wide uppercase mb-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand"></span>
              </span>
              <span>Bản đồ Radar thị trường</span>
            </div>
            <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight [text-wrap:balance]">
              Độ phủ sóng thị trường Sài Gòn & Long An
            </h2>
            <p className="mt-3 text-white/75 text-sm max-w-xl leading-relaxed">
              Theo dõi sát biến động giá và nguồn cung từng tuyến đường, từng phân khúc. Báo cáo minh bạch, không bơm thổi giá.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/ban-do"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-navy font-bold text-sm shadow-md hover:bg-slate-100 transition"
            >
              <span>🗺️</span>
              <span>Mở bản đồ quy hoạch</span>
            </Link>
            <a
              href={zaloLink("radar_market")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white font-bold text-sm shadow-md hover:bg-brand-dark transition"
            >
              <span>💬</span>
              <span>Hỏi giá khu vực</span>
            </a>
          </div>
        </div>

        {/* Region Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {KEY_REGIONS.map((region) => (
            <Link
              key={region.name}
              href={`/mua-ban?q=${encodeURIComponent(region.name)}`}
              className="group p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-brand/50 hover:bg-white/10 transition-all duration-200"
            >
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-extrabold text-lg text-white group-hover:text-brand transition-colors">
                  {region.name}
                </h3>
                <span className="text-xs font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-white/10">
                  {region.count}
                </span>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                {region.desc}
              </p>
            </Link>
          ))}
        </div>

        {/* 3 Metrics Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-white/10 text-center sm:text-left">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl">
              🛡️
            </span>
            <div>
              <p className="text-lg font-black text-white">100% Không Spam</p>
              <p className="text-xs text-white/70">Không thu số điện thoại, không gọi làm phiền</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl">
              ⚡
            </span>
            <div>
              <p className="text-lg font-black text-white">Trực 24/7 Zalo</p>
              <p className="text-xs text-white/70">Hỏi bất kỳ lúc nào, nhớ lịch sử nhu cầu</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl">
              🔍
            </span>
            <div>
              <p className="text-lg font-black text-white">Xác Minh Tận Nơi</p>
              <p className="text-xs text-white/70">Hỏi giùm chủ nhà từng chi tiết ngõ ngách</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
