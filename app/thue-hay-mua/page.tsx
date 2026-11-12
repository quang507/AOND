"use client";
// SRS-5.1zzzzzzz443 (chủ dự án 12/11/2026 "lấy mấy cái này thì lấy lun" — ý tưởng từ /thue-hay-mua của NhaDat-Radar, viết lại).
// So hai đường trong N năm với CÙNG một số tiền mỗi tháng:
//   - Mua: trả trước D, trả góp đều M mỗi tháng (cùng công thức /tinh-lai-vay). Cuối kỳ có căn nhà (giá tăng g%/năm) trừ dư nợ còn lại.
//   - Thuê: giữ D đem gửi (lãi s%/năm), trả tiền thuê R (tăng r%/năm). Tháng nào trả góp M cao hơn tiền thuê thì phần chênh gửi thêm;
//     tháng nào tiền thuê cao hơn M thì người MUA là bên dư tiền, phần đó cộng vào quỹ của người mua.
// Không tính phí công chứng, thuế, sửa nhà, bảo hiểm — ghi rõ dưới kết quả. Mọi con số mặc định là GIẢ ĐỊNH, anh chị sửa được.
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zaloLink } from "@/lib/format";

const VND = new Intl.NumberFormat("vi-VN");
const ty = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỉ` : `${Math.round(a / 1e6).toLocaleString("vi-VN")} triệu`;
  return v < 0 ? `âm ${s}` : s;
};

function soTuUrl(v: string | null, macDinh: number, min: number, max: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : macDinh;
}

type KetQua = { nam: number; mua: number; thue: number }[];

function tinh(o: {
  gia: number;
  thue: number;
  tra: number;
  lai: number;
  hanVay: number;
  soNam: number;
  tangThue: number;
  tangGia: number;
  laiGui: number;
}) {
  const D = o.gia * (o.tra / 100);
  const vay = o.gia - D;
  const n = o.hanVay * 12;
  const i = o.lai / 100 / 12;
  const M = vay <= 0 ? 0 : i > 0 ? (vay * i) / (1 - Math.pow(1 + i, -n)) : vay / n;
  const s = Math.pow(1 + o.laiGui / 100, 1 / 12) - 1;

  let du = vay; // dư nợ
  let quyThue = D; // người thuê: tiền trả trước đem gửi
  let quyMua = 0; // người mua: phần dư khi tiền thuê cao hơn trả góp
  let thueThang = o.thue;
  let traGopDaTra = 0;
  let thueDaTra = 0;
  const theoNam: KetQua = [{ nam: 0, mua: o.gia - vay, thue: D }];
  for (let m = 1; m <= o.soNam * 12; m++) {
    const gop = m <= n ? M : 0;
    if (m <= n) du = Math.max(0, du * (1 + i) - M);
    quyThue *= 1 + s;
    quyMua *= 1 + s;
    const chenh = gop - thueThang;
    if (chenh >= 0) quyThue += chenh;
    else quyMua += -chenh;
    traGopDaTra += gop;
    thueDaTra += thueThang;
    if (m % 12 === 0) {
      const nam = m / 12;
      const giaNha = o.gia * Math.pow(1 + o.tangGia / 100, nam);
      theoNam.push({ nam, mua: giaNha - du + quyMua, thue: quyThue });
      thueThang *= 1 + o.tangThue / 100;
    }
  }
  const cuoi = theoNam[theoNam.length - 1];
  const hoaVon = theoNam.find((x) => x.nam > 0 && x.mua >= x.thue)?.nam ?? null;
  return { D, vay, M, theoNam, cuoi, hoaVon, traGopDaTra, thueDaTra, duCuoi: du };
}

// Khai báo NGOÀI component máy tính: khai trong thân hàm thì mỗi lần gõ là một component mới, ô nhập bị gỡ ra lắp lại, mất con trỏ.
function Truong({ nhan, phu, children }: { nhan: string; phu?: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-semibold text-mute">{nhan}</span>
      {children}
      {phu && <span className="text-xs font-semibold text-brand tabular-nums">{phu}</span>}
    </label>
  );
}

function May() {
  const q = useSearchParams();
  const [gia, setGia] = useState(() => soTuUrl(q.get("price"), 4_000_000_000, 100_000_000, 1e12));
  const [thue, setThue] = useState(12_000_000);
  const [tra, setTra] = useState(30);
  const [lai, setLai] = useState(9.5);
  const [hanVay, setHanVay] = useState(20);
  const [soNam, setSoNam] = useState(10);
  const [tangThue, setTangThue] = useState(5);
  const [tangGia, setTangGia] = useState(4);
  const [laiGui, setLaiGui] = useState(5);

  const r = useMemo(
    () => tinh({ gia, thue, tra, lai, hanVay, soNam, tangThue, tangGia, laiGui }),
    [gia, thue, tra, lai, hanVay, soNam, tangThue, tangGia, laiGui],
  );
  const muaHon = r.cuoi.mua >= r.cuoi.thue;

  // Biểu đồ hai đường: tài sản ròng theo năm
  const W = 560, H = 200, P = 10;
  const tatCa = r.theoNam.flatMap((x) => [x.mua, x.thue]);
  const lo = Math.min(0, ...tatCa), hi = Math.max(1, ...tatCa);
  const duong = (k: "mua" | "thue") =>
    r.theoNam
      .map((x, j) => {
        const X = P + (j / Math.max(1, r.theoNam.length - 1)) * (W - 2 * P);
        const Y = P + (1 - (x[k] - lo) / (hi - lo)) * (H - 2 * P);
        return `${j ? "L" : "M"}${X.toFixed(1)},${Y.toFixed(1)}`;
      })
      .join(" ");

  const o = "w-full rounded-lg border border-line bg-white px-3 py-2 tabular-nums focus-visible:outline-2 focus-visible:outline-brand";
  const so = (f: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => f(Number(e.target.value) || 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-extrabold [text-wrap:balance]">Thuê hay mua nhà, đường nào lợi hơn</h1>
      <p className="mt-2 max-w-2xl text-mute">
        Đặt hai đường cạnh nhau với cùng số tiền bỏ ra mỗi tháng: mua bằng vốn tự có cộng tiền vay, hay thuê căn tương đương rồi đem phần
        tiền chưa dùng đi gửi. Các con số điền sẵn chỉ là giả định để bắt đầu, anh chị sửa theo căn mình đang nhắm.
      </p>

      <div className="mt-8 grid items-start gap-5 lg:grid-cols-[360px_1fr]">
        <div className="rounded-king border border-line bg-white p-5">
          <h2 className="font-bold">Căn nhà và khoản vay</h2>
          <Truong nhan="Giá căn nhà (VND)" phu={ty(gia)}>
            <input className={o} type="number" min={0} step={100_000_000} value={gia} onChange={so(setGia)} />
          </Truong>
          <Truong nhan={`Trả trước ${tra}% (${ty(r.D)})`}>
            <input className="w-full accent-brand" type="range" min={10} max={100} step={5} value={tra} onChange={so(setTra)} />
          </Truong>
          <div className="grid grid-cols-2 gap-3">
            <Truong nhan="Lãi vay %/năm">
              <input className={o} type="number" min={0} max={30} step={0.1} value={lai} onChange={so(setLai)} />
            </Truong>
            <Truong nhan="Vay bao nhiêu năm">
              <input className={o} type="number" min={1} max={35} value={hanVay} onChange={so(setHanVay)} />
            </Truong>
          </div>

          <h2 className="mt-6 font-bold">Nếu đi thuê</h2>
          <Truong nhan="Tiền thuê căn tương đương / tháng" phu={ty(thue)}>
            <input className={o} type="number" min={0} step={500_000} value={thue} onChange={so(setThue)} />
          </Truong>
          <div className="grid grid-cols-2 gap-3">
            <Truong nhan="Tiền thuê tăng %/năm">
              <input className={o} type="number" min={0} max={30} step={0.5} value={tangThue} onChange={so(setTangThue)} />
            </Truong>
            <Truong nhan="Lãi gửi tiết kiệm %/năm">
              <input className={o} type="number" min={0} max={20} step={0.1} value={laiGui} onChange={so(setLaiGui)} />
            </Truong>
          </div>

          <h2 className="mt-6 font-bold">So trong bao lâu</h2>
          <div className="grid grid-cols-2 gap-3">
            <Truong nhan="Số năm định ở">
              <input className={o} type="number" min={1} max={35} value={soNam} onChange={so(setSoNam)} />
            </Truong>
            <Truong nhan="Giá nhà tăng %/năm">
              <input className={o} type="number" min={-10} max={30} step={0.5} value={tangGia} onChange={so(setTangGia)} />
            </Truong>
          </div>
          <p className="mt-3 text-xs leading-5 text-mute">
            Giá nhà tăng bao nhiêu mỗi năm là con số không ai biết trước. Thử vài mức (0%, 3%, 6%) để xem kết luận có đổi không.
          </p>
        </div>

        <div className="grid gap-5">
          <div className="rounded-king border border-line bg-white p-5">
            <h2 className="text-xl font-extrabold [text-wrap:balance]">
              Sau {soNam} năm, {muaHon ? "mua" : "thuê"} dư hơn khoảng {ty(Math.abs(r.cuoi.mua - r.cuoi.thue))}
            </h2>
            <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-mute">Mua: nhà trừ nợ còn lại</dt>
                <dd className="text-2xl font-extrabold text-navy tabular-nums">{ty(r.cuoi.mua)}</dd>
              </div>
              <div>
                <dt className="text-sm text-mute">Thuê: tiền đã gửi tích lại</dt>
                <dd className="text-2xl font-extrabold text-navy tabular-nums">{ty(r.cuoi.thue)}</dd>
              </div>
              <div>
                <dt className="text-sm text-mute">Trả góp mỗi tháng</dt>
                <dd className="font-bold text-navy tabular-nums">{ty(r.M)}</dd>
              </div>
              <div>
                <dt className="text-sm text-mute">Mốc mua bắt đầu lợi hơn</dt>
                <dd className="font-bold text-navy">{r.hoaVon ? `năm thứ ${r.hoaVon}` : `chưa tới trong ${soNam} năm`}</dd>
              </div>
            </dl>

            <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 h-auto w-full" role="img" aria-label="Tài sản ròng theo năm của hai đường mua và thuê">
              {lo < 0 && (
                <line x1={P} x2={W - P} y1={P + (1 - (0 - lo) / (hi - lo)) * (H - 2 * P)} y2={P + (1 - (0 - lo) / (hi - lo)) * (H - 2 * P)} stroke="var(--color-line)" />
              )}
              <path d={duong("mua")} fill="none" stroke="var(--color-brand)" strokeWidth={2.5} />
              <path d={duong("thue")} fill="none" stroke="var(--color-navy)" strokeWidth={2.5} strokeDasharray="6 4" />
            </svg>
            <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-mute">
              <span><span className="mr-2 inline-block h-0.5 w-5 bg-brand align-middle" />Mua</span>
              <span><span className="mr-2 inline-block h-0.5 w-5 border-t-2 border-dashed border-navy align-middle" />Thuê</span>
              <span>Trục ngang: năm 0 tới năm {soNam}</span>
            </p>
          </div>

          <div className="rounded-king border border-line bg-white p-5 text-sm leading-6 text-mute">
            <h2 className="text-base font-bold text-navy">Cách tính</h2>
            <p className="mt-2">
              Hai bên bỏ ra cùng số tiền: người mua trả {ty(r.D)} trả trước rồi {ty(r.M)} mỗi tháng; người thuê giữ {ty(r.D)} đem gửi,
              tháng nào tiền thuê thấp hơn tiền trả góp thì gửi thêm phần chênh. Trong {soNam} năm người mua trả góp tổng cộng{" "}
              {ty(r.traGopDaTra)}, người thuê trả tiền nhà tổng cộng {ty(r.thueDaTra)}.
            </p>
            <p className="mt-2">
              Chưa tính: phí công chứng, thuế trước bạ, sửa chữa, phí quản lý, phí trả nợ trước hạn. Mua thì còn được tự sửa, cho thuê lại;
              thuê thì dễ đổi chỗ khi đổi việc. Những thứ này không quy ra tiền được nên công cụ không tính hộ.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={`/tinh-lai-vay?price=${gia}`} className="nut nut-phu px-5">
              Xem chi tiết khoản vay
            </Link>
            <a href={zaloLink("thue_hay_mua")} target="_blank" rel="noopener" className="nut bg-zalo px-5 text-white hover:opacity-90">
              Hỏi căn tầm giá này qua Zalo
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <May />
    </Suspense>
  );
}
