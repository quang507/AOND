"use client";
// Máy tính lãi vay (FR-119, chốt OPEN-19 phương án b — port từ NhaDat-Radar).
// Trả góp đều (annuity). Nhận ?price=<vnd> từ trang chi tiết tin.
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { zaloLink } from "@/lib/format";

const VND = new Intl.NumberFormat("vi-VN");
const money = (v: number) => (Number.isFinite(v) ? VND.format(Math.round(v)) + " ₫" : "-");

const TIPS: [string, string][] = [
  ["Tỷ lệ vay an toàn", "Ngân hàng thường cho vay tối đa 70–80% giá trị nhà; khoản trả hàng tháng không nên vượt 40% thu nhập."],
  ["Lãi suất ưu đãi", "Nhiều ngân hàng ưu đãi 1–2 năm đầu rồi thả nổi - tính theo lãi thả nổi để không bị động."],
  ["Trả trước hạn", "Hỏi rõ phí trả nợ trước hạn, thường 1–3% số tiền trả trước trong các năm đầu."],
  ["So sánh nhiều ngân hàng", "Chênh 0.5%/năm trên khoản vay 2 tỷ trong 20 năm là hàng trăm triệu - so ít nhất 3 ngân hàng."],
];

function clampNum(v: string | null, fallback: number, min: number, max: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function Calc() {
  const q = useSearchParams();
  const [price, setPrice] = useState(() => clampNum(q.get("price"), 3_000_000_000, 100_000_000, 1e12));
  const [downPct, setDownPct] = useState(30);
  const [rate, setRate] = useState(9.5);
  const [years, setYears] = useState(20);

  const r = useMemo(() => {
    const loan = Math.max(0, price * (1 - downPct / 100));
    const n = years * 12;
    const i = rate / 100 / 12;
    const monthly = i > 0 ? (loan * i) / (1 - Math.pow(1 + i, -n)) : loan / Math.max(1, n);
    const total = monthly * n;
    const balances: number[] = [];
    let bal = loan;
    for (let m = 1; m <= n; m++) {
      bal = bal * (1 + i) - monthly;
      if (m % 12 === 0) balances.push(Math.max(0, bal));
    }
    return { loan, monthly, total, interest: total - loan, balances, down: price - loan };
  }, [price, downPct, rate, years]);

  const W = 560, H = 190, PAD = 8;
  const pts = [r.loan, ...r.balances];
  const maxY = Math.max(r.loan, 1);
  const path = pts
    .map((v, i) => {
      const x = PAD + (i / Math.max(1, pts.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - v / maxY) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const num = (fn: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    fn(Number(e.target.value) || 0);
  const inp =
    "w-full rounded-lg border border-line bg-white px-3 py-2 tabular-nums focus-visible:outline-2 focus-visible:outline-brand";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-extrabold [text-wrap:balance]">Tính lãi vay mua nhà</h1>
      <p className="mt-2 max-w-xl text-mute">
        Xem trước mỗi tháng trả bao nhiêu rồi hãy quyết. Kết quả tính theo kiểu
        trả góp đều mà ngân hàng Việt Nam hay dùng - chỉ để tham khảo.
      </p>

      <div className="mt-8 grid items-start gap-5 lg:grid-cols-[360px_1fr]">
        <div className="rounded-king border border-line bg-white p-5">
          <h2 className="font-bold">Khoản vay của anh chị</h2>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-semibold text-mute">Giá trị nhà (VND)</span>
            <input className={inp} type="number" min={0} step={100_000_000} value={price} onChange={num(setPrice)} />
            <span className="text-xs font-semibold text-brand tabular-nums">{money(price)}</span>
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-mute">
              Trả trước {downPct}% ({money(r.down)})
            </span>
            <input className="w-full accent-[#e60023]" type="range" min={10} max={90} step={5} value={downPct} onChange={num(setDownPct)} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-mute">Lãi suất (%/năm)</span>
            <input className={inp} type="number" min={0} max={30} step={0.1} value={rate} onChange={num(setRate)} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-mute">Vay trong {years} năm</span>
            <input className="w-full accent-[#e60023]" type="range" min={5} max={35} step={5} value={years} onChange={num(setYears)} />
          </label>
        </div>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-king border-2 border-brand/30 bg-white p-5">
              <p className="text-xs font-semibold text-mute">Mỗi tháng trả</p>
              <p className="text-2xl font-extrabold text-brand tabular-nums">{money(r.monthly)}</p>
            </div>
            <div className="rounded-lg border border-line bg-white p-5">
              <p className="text-xs font-semibold text-mute">Số tiền vay</p>
              <p className="text-2xl font-extrabold tabular-nums">{money(r.loan)}</p>
            </div>
            <div className="rounded-lg border border-line bg-white p-5">
              <p className="text-xs font-semibold text-mute">Tổng lãi phải trả</p>
              <p className="text-2xl font-extrabold tabular-nums">{money(r.interest)}</p>
            </div>
            <div className="rounded-lg border border-line bg-white p-5">
              <p className="text-xs font-semibold text-mute">Tổng gốc + lãi</p>
              <p className="text-2xl font-extrabold tabular-nums">{money(r.total)}</p>
            </div>
          </div>

          <div className="rounded-king border border-line bg-white p-5">
            <h3 className="font-bold">Dư nợ giảm dần theo năm</h3>
            <p className="mb-3 text-xs text-mute">
              Khoản vay {money(r.loan)} về 0 sau {years} năm.
            </p>
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
              <path d={`${path} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`} fill="#e60023" opacity={0.08} />
              <path d={path} fill="none" stroke="#e60023" strokeWidth={2.5} strokeLinejoin="round" />
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#eef0f3" />
            </svg>
            <div className="mt-1 flex justify-between text-[0.65rem] text-mute/70 tabular-nums">
              <span>Năm 0</span><span>Năm {Math.round(years / 2)}</span><span>Năm {years}</span>
            </div>
          </div>

          <a
            href={zaloLink(`laivay:${price}`)}
            className="block rounded-full bg-zalo py-3 text-center font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
          >
            Nhắn Zalo - tụi em tìm căn vừa túi tiền này
          </a>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-extrabold">Mẹo vay mua nhà</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {TIPS.map(([t, d]) => (
            <div key={t} className="rounded-lg border border-line bg-white p-5">
              <h3 className="font-bold">{t}</h3>
              <p className="mt-1 text-sm text-mute">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-mute/70">
          Kết quả chỉ mang tính tham khảo, không phải đề nghị cho vay.
        </p>
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Calc />
    </Suspense>
  );
}
