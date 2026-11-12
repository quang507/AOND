// SRS-5.1zzzzzzz455 — LQC 4.6 (đặc tả anh Luận): "Em có báo cáo giá bán nhà khu vực anh, em làm miễn phí cho anh".
// Chủ dự án 13/11/2026: "dựa trên giá rao cũng dc, tạm để test vậy đi". Một trang cho MỘT căn: căn cùng loại đang rao trong bán kính 3 km,
// dải đơn giá rao, theo lối vào, vị trí giá của căn (chỉ so cùng lối vào), căn gần nhất, căn gần đó đã cọc / chốt (giá rao lúc đó).
// Nguồn duy nhất: RPC `bao_cao_gia_quanh` (migration 20261113a). Bot gửi link trang này kèm tin so sánh (so_sanh.py).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ACCESS_LABEL, formatArea, formatPrice, TYPE_LABEL, zaloLink } from "@/lib/format";

export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Can = {
  code: string;
  street: string | null;
  ward: string | null;
  area_m2: number | null;
  price_vnd: number | null;
  price_per_m2_vnd: number | null;
  access_type: string | null;
  floors: number | null;
  m: number;
  status?: string;
};
type Nhom = { access_type: string | null; n: number; p50: number; min: number; max: number };
type BaoCao = {
  can: {
    code: string;
    deal: "ban" | "cho_thue";
    property_type: string | null;
    access_type: string | null;
    price_vnd: number | null;
    price_per_m2_vnd: number | null;
    area_m2: number | null;
    street: string | null;
    ward: string | null;
    district: string | null;
  };
  ban_kinh_m: number;
  cap_nhat: string;
  tong: { n: number; min: number | null; max: number | null; p25: number | null; p50: number | null; p75: number | null };
  theo_loi_vao: Nhom[];
  vi_tri: number | null;
  n_cung_loi_vao: number;
  dang_rao: Can[];
  da_giao_dich: Can[];
};

const TOI_THIEU = 3;

async function layBaoCao(code: string): Promise<BaoCao | null> {
  if (!/^[0-9A-Za-z]{6,12}$/.test(code)) return null;
  const { data, error } = await supabase.rpc("bao_cao_gia_quanh", { p_code: code.toUpperCase() });
  if (error || !data) return null;
  return data as BaoCao;
}

const trieu = (v: number | null | undefined) => (v ? `${Math.round(v / 1_000_000).toLocaleString("vi-VN")} triệu/m²` : "-");
const loiVao = (a: string | null | undefined) => (a ? ACCESS_LABEL[a] ?? a : "Chưa rõ lối vào");
const kc = (m: number) => (m < 1000 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Báo cáo giá rao quanh căn #${code.toUpperCase()}`,
    description: "Giá rao các căn cùng loại quanh căn này trên AI Ơi Nhà Đất: dải giá mỗi m², theo lối vào, căn gần nhất.",
    robots: { index: false, follow: true },
  };
}

// Dải đơn giá: vạch xám min–max, khối giữa p25–p75, vạch trung vị, chấm là căn của chủ (chỉ khi so được cùng lối vào).
function DaiGia({ bc }: { bc: BaoCao }) {
  const { min, max, p25, p50, p75 } = bc.tong;
  const chu = bc.can.price_per_m2_vnd;
  if (!min || !max || !p25 || !p50 || !p75) return null;
  const lo = Math.min(min, chu ?? min);
  const hi = Math.max(max, chu ?? max);
  const vi = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  return (
    <div className="mt-6">
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" style={{ left: `${vi(min)}%`, right: `${100 - vi(max)}%` }} />
        <div className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm bg-brand/25" style={{ left: `${vi(p25)}%`, width: `${Math.max(1, vi(p75) - vi(p25))}%` }} />
        <div className="absolute top-1/2 h-6 w-0.5 -translate-y-1/2 bg-brand" style={{ left: `${vi(p50)}%` }} />
        {chu ? (
          <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-navy shadow" style={{ left: `${vi(chu)}%` }} />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-xs text-mute tabular-nums">
        <span>{trieu(lo)}</span>
        <span>{trieu(hi)}</span>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-mute">
        <span><span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-brand/25 align-middle" />Nửa giữa các căn: {trieu(p25)} – {trieu(p75)}</span>
        <span><span className="mr-1.5 inline-block h-3 w-0.5 bg-brand align-middle" />Mức ở giữa: {trieu(p50)}</span>
        {chu ? <span><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-navy align-middle" />Căn #{bc.can.code}: {trieu(chu)}</span> : null}
      </p>
    </div>
  );
}

function DongCan({ c, giaoDich }: { c: Can; giaoDich?: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-0">
      <Link href={`/nha-dat/${c.code}`} className="font-semibold text-brand hover:underline">#{c.code}</Link>
      <span className="min-w-0 flex-1 text-navy">{[c.street, c.ward].filter(Boolean).join(", ") || "-"}</span>
      <span className="text-sm text-mute">{loiVao(c.access_type)}{c.floors ? ` · ${c.floors} tầng` : ""} · {formatArea(c.area_m2)}</span>
      <span className="font-bold tabular-nums">{giaoDich ? "Rao lúc đó " : ""}{formatPrice(c.price_vnd, null)}</span>
      <span className="w-28 text-right text-sm text-mute tabular-nums">{trieu(c.price_per_m2_vnd)}</span>
      <span className="w-16 text-right text-xs text-mute tabular-nums">{giaoDich ? (c.status === "da_coc" ? "đã cọc" : "đã chốt") : kc(c.m)}</span>
    </li>
  );
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const bc = await layBaoCao(code);
  if (!bc) notFound();
  const can = bc.can;
  const loai = (can.property_type && TYPE_LABEL[can.property_type]) || "căn";
  const banKinh = `${(bc.ban_kinh_m / 1000).toLocaleString("vi-VN")} km`;
  const du = bc.tong.n >= TOI_THIEU;
  const ngay = new Date(bc.cap_nhat).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
  const viTriCau =
    bc.vi_tri === null
      ? bc.n_cung_loi_vao < TOI_THIEU
        ? `Quanh đây mới có ${bc.n_cung_loi_vao} căn cùng kiểu ${loiVao(can.access_type).toLowerCase()} đang rao, chưa đủ để đặt giá căn này lên cùng thang. Căn khác lối vào thì không so thẳng giá mỗi m².`
        : null
      : `So với ${bc.n_cung_loi_vao} căn cùng kiểu ${loiVao(can.access_type).toLowerCase()} đang rao quanh đây, giá mỗi m² của căn này cao hơn ${bc.vi_tri}% số căn.`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <nav className="text-sm text-mute">
        <Link href={`/nha-dat/${can.code}`} className="hover:text-brand">Căn #{can.code}</Link>
        <span className="px-2">–</span>
        <span>Báo cáo giá rao</span>
      </nav>
      <h1 className="mt-2 text-3xl font-extrabold [text-wrap:balance]">Giá rao quanh căn #{can.code}</h1>
      <p className="mt-2 max-w-2xl text-mute">
        {loai[0].toUpperCase() + loai.slice(1)} {loiVao(can.access_type).toLowerCase()}
        {can.street ? `, ${can.street}` : ""}
        {can.ward ? `, ${can.ward}` : ""}. Tính từ các căn cùng loại đang rao trong bán kính {banKinh} trên AI Ơi Nhà Đất, cập nhật {ngay}.
      </p>

      <section className="mt-8 rounded-king border border-line bg-white p-5">
        {du ? (
          <>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              <div>
                <dt className="text-sm text-mute">Căn cùng loại đang rao</dt>
                <dd className="text-2xl font-extrabold text-navy tabular-nums">{bc.tong.n}</dd>
              </div>
              <div>
                <dt className="text-sm text-mute">Giá mỗi m² ở giữa</dt>
                <dd className="text-2xl font-extrabold text-navy tabular-nums">{trieu(bc.tong.p50)}</dd>
              </div>
              <div>
                <dt className="text-sm text-mute">Căn này</dt>
                <dd className="text-2xl font-extrabold text-navy tabular-nums">{trieu(can.price_per_m2_vnd)}</dd>
              </div>
              <div>
                <dt className="text-sm text-mute">Giá rao căn này</dt>
                <dd className="text-2xl font-extrabold text-navy tabular-nums">{formatPrice(can.price_vnd, null)}</dd>
              </div>
            </dl>
            <DaiGia bc={bc} />
            {viTriCau && <p className="mt-4 leading-7 text-navy">{viTriCau}</p>}
          </>
        ) : (
          <p className="leading-7 text-navy">
            Quanh căn này mới có {bc.tong.n} căn cùng loại đang rao trong bán kính {banKinh}, chưa đủ để làm báo cáo giá. Kho tin đổi mỗi
            ngày, tụi em sẽ cập nhật khi có thêm căn.
          </p>
        )}
      </section>

      {du && bc.theo_loi_vao.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold">Theo lối vào</h2>
          <div className="mt-3 overflow-x-auto rounded-king border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-mute">
                  <th className="px-4 py-2.5 font-semibold">Lối vào</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Số căn</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Ở giữa</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Thấp nhất – cao nhất</th>
                </tr>
              </thead>
              <tbody>
                {bc.theo_loi_vao.map((g) => (
                  <tr key={g.access_type ?? "khac"} className={`border-b border-line last:border-0 ${g.access_type === can.access_type ? "bg-cream" : ""}`}>
                    <td className="px-4 py-2.5 font-semibold">{loiVao(g.access_type)}{g.access_type === can.access_type ? " (cùng kiểu căn này)" : ""}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{g.n}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums">{trieu(g.p50)}</td>
                    <td className="px-4 py-2.5 text-right text-mute tabular-nums">{trieu(g.min)} – {trieu(g.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {bc.dang_rao.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold">Căn cùng loại đang rao gần nhất</h2>
          <ul className="mt-3 overflow-hidden rounded-king border border-line bg-white">
            {bc.dang_rao.map((c) => <DongCan key={c.code} c={c} />)}
          </ul>
        </section>
      )}

      {bc.da_giao_dich.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold">Căn gần đó đã cọc hoặc đã chốt (6 tháng qua)</h2>
          <ul className="mt-3 overflow-hidden rounded-king border border-line bg-white">
            {bc.da_giao_dich.map((c) => <DongCan key={c.code} c={c} giaoDich />)}
          </ul>
        </section>
      )}

      <p className="mt-6 max-w-2xl text-sm text-mute">
        Đây là giá rao, chưa phải giá giao dịch. Căn khác lối vào, khác diện tích hay khác số tầng thì giá mỗi m² chênh nhau là thường; giá bán vẫn
        do chủ nhà quyết.
      </p>
      <a
        href={zaloLink(`baocao:${can.code}`)}
        className="mt-6 inline-block rounded-md bg-zalo px-6 py-3 font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
      >
        Hỏi thêm về giá khu này qua Zalo
      </a>
    </div>
  );
}
