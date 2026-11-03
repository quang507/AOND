"use client";
// /admin/chi-phi — chi phí model theo NGÀY và theo MODEL, cộng chi phí trung bình mỗi cuộc chat (03/11/2026, SRS-5.1zzzzzzz378).
// Chủ dự án 03/11: "Bảng chi phí theo ngày và theo cuộc chat, đọc từ bot_usage_model — biết vòng gộp tốn thật bao nhiêu trên
// khách thật". Tiền quy đổi chỉ qua `lib/gia-model.ts` (một nguồn với /admin); model chưa có giá thì hiện token, không đoán.
// Mẫu số "cuộc chat" đọc view `chi_phi_cuoc_chat_ngay` (chỉ số đếm, không tên / SĐT / lời chat). Cả hai nguồn chỉ admin đọc (RLS).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { giaCua, tienDong, tyLeDocCache, type DongToken } from "@/lib/gia-model";
import { IconRefresh } from "@/components/icons";

type DongModel = DongToken & { day: string; calls: number };
type DongChat = { ngay: string; cuoc_chat: number; cuoc_chat_thu: number; tin_khach: number };
type Gop = { calls: number; in_tokens: number; out_tokens: number; cache_write_tokens: number; cache_read_tokens: number; tien: number; chuaGia: number };

const RONG: Gop = { calls: 0, in_tokens: 0, out_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, tien: 0, chuaGia: 0 };

function cong(a: Gop, r: DongModel): Gop {
  const t = tienDong(r);
  return {
    calls: a.calls + (r.calls ?? 0),
    in_tokens: a.in_tokens + r.in_tokens,
    out_tokens: a.out_tokens + r.out_tokens,
    cache_write_tokens: a.cache_write_tokens + r.cache_write_tokens,
    cache_read_tokens: a.cache_read_tokens + r.cache_read_tokens,
    tien: a.tien + (t ?? 0),
    chuaGia: a.chuaGia + (t === null ? 1 : 0),
  };
}

/** Ngày giờ VN (UTC+7, không đổi giờ mùa hè) dạng YYYY-MM-DD, lùi `lui` ngày. */
const ngayVN = (lui = 0) => new Date(Date.now() + 7 * 3600e3 - lui * 86400e3).toISOString().slice(0, 10);
const so = (n: number) => n.toLocaleString("vi-VN");
const gon = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr` : n >= 1e3 ? `${(n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} k` : so(n));
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n < 1 ? 3 : 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`;
const phanTram = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const nhanNgay = (d: string) => { const [, m, n] = d.split("-"); return `${n}/${m}`; };
const thu = (d: string) => ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][new Date(`${d}T00:00:00Z`).getUTCDay()];

function TienO({ g }: { g: Gop }) {
  if (g.calls === 0 && g.in_tokens === 0) return <span className="text-mute">—</span>;
  return (
    <span title={g.chuaGia ? `${g.chuaGia} dòng model chưa có bảng giá, không cộng vào tiền` : undefined}>
      {usd(g.tien)}{g.chuaGia > 0 && <span className="text-mute">*</span>}
    </span>
  );
}

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [soNgay, setSoNgay] = useState<14 | 30>(14);
  const [dong, setDong] = useState<DongModel[]>([]);
  const [chat, setChat] = useState<DongChat[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [loiChat, setLoiChat] = useState<string | null>(null);
  const [mo, setMo] = useState<string | null>(null);

  const nap = async () => {
    const [u, c] = await Promise.all([
      supabase.from("bot_usage_model")
        .select("day, model, calls, in_tokens, out_tokens, cache_write_tokens, cache_read_tokens")
        .gte("day", ngayVN(29)).order("day", { ascending: false }).limit(1000),
      supabase.from("chi_phi_cuoc_chat_ngay").select("ngay, cuoc_chat, cuoc_chat_thu, tin_khach").order("ngay", { ascending: false }),
    ]);
    setLoi(u.error ? u.error.message : null);
    setDong(u.error ? [] : ((u.data ?? []) as DongModel[]));
    setLoiChat(c.error ? c.error.message : null);
    setChat(c.error ? null : ((c.data ?? []) as DongChat[]));
  };

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setRole("anon");
      const { data: a } = await supabase.from("admins").select("email").eq("email", user.email ?? "").maybeSingle();
      if (!a) return setRole("user");
      setRole("admin");
      await nap();
    });
  }, []);

  const ngays = useMemo(() => Array.from({ length: soNgay }, (_, i) => ngayVN(i)), [soNgay]);
  const tu = ngays[ngays.length - 1];
  const trongKhoang = useMemo(() => dong.filter((r) => r.day >= tu), [dong, tu]);
  const chatTheoNgay = useMemo(() => new Map((chat ?? []).map((c) => [c.ngay, c])), [chat]);

  const theoNgay = useMemo(() => ngays.map((d) => {
    const rows = trongKhoang.filter((r) => r.day === d);
    return { day: d, rows, g: rows.reduce(cong, RONG), c: chatTheoNgay.get(d) ?? null };
  }), [ngays, trongKhoang, chatTheoNgay]);

  const theoModel = useMemo(() => {
    const m = new Map<string, Gop>();
    for (const r of trongKhoang) m.set(r.model, cong(m.get(r.model) ?? RONG, r));
    return [...m.entries()].sort((a, b) => b[1].tien - a[1].tien || b[1].calls - a[1].calls);
  }, [trongKhoang]);

  const tong = useMemo(() => trongKhoang.reduce(cong, RONG), [trongKhoang]);
  // Trung bình mỗi cuộc chat: chỉ cộng những ngày CÓ đếm được cuộc chat — ngày có tiền mà không có cuộc chat nào (hội thoại đã
  // xoá, vd bắn thử tự dọn) không chia được, đếm riêng để nói ra.
  const coChia = theoNgay.filter((x) => x.c && x.c.cuoc_chat > 0);
  const tienCoChia = coChia.reduce((s, x) => s + x.g.tien, 0);
  const cuocCoChia = coChia.reduce((s, x) => s + (x.c?.cuoc_chat ?? 0), 0);
  const thuCoChia = coChia.reduce((s, x) => s + (x.c?.cuoc_chat_thu ?? 0), 0);
  const ngayKhongChia = theoNgay.filter((x) => x.g.calls > 0 && !(x.c && x.c.cuoc_chat > 0)).length;

  if (role === "loading") return <div className="mx-auto max-w-5xl px-4 py-16 text-mute font-medium">Đang kiểm tra quyền…</div>;
  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-navy">Khu vực quản trị</h1>
        <p className="mt-2 text-mute text-sm">{role === "anon" ? "Cần đăng nhập bằng tài khoản quản trị." : "Tài khoản này không có quyền quản trị."}</p>
        {role === "anon" && <Link href="/dang-nhap" className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 font-bold text-white hover:bg-brand-dark transition">Đăng nhập</Link>}
      </div>
    );
  }

  const chip = (on: boolean) => `shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition ${on ? "bg-navy text-white" : "bg-cream/70 text-navy hover:bg-line"}`;
  const th = "px-3 py-2 text-right text-xs font-semibold text-mute whitespace-nowrap";
  const td = "px-3 py-2 text-right tabular-nums whitespace-nowrap";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-bold text-navy">Chi phí model</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-mute">
        Token và tiền thật theo ngày (giờ Việt Nam) và theo model, đọc từ sổ <code className="text-navy">bot_usage_model</code> do lõi
        ghi sau mỗi lần gọi model. Tiền quy đổi theo bảng giá niêm yết trong <code className="text-navy">lib/gia-model.ts</code>;
        lượt dự phòng Groq / Gemini tính 0 đô. Sổ gộp cả lượt bắn thử.
      </p>

      {loi && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Không đọc được sổ token: {loi}. Bấm Làm mới để thử lại.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Khoảng ngày">
          <button type="button" className={chip(soNgay === 14)} onClick={() => setSoNgay(14)}>14 ngày</button>
          <button type="button" className={chip(soNgay === 30)} onClick={() => setSoNgay(30)}>30 ngày</button>
        </div>
        <span className="text-xs text-mute">{nhanNgay(tu)} – {nhanNgay(ngays[0])}</span>
        <button type="button" onClick={() => { void nap(); }} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-navy hover:bg-cream/70">
          <IconRefresh className="h-3.5 w-3.5" /> Làm mới
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-line bg-white px-4 py-3">
          <dt className="text-xs text-mute">Tiền {soNgay} ngày</dt>
          <dd className="text-2xl font-bold text-navy tabular-nums"><TienO g={tong} /></dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-4 py-3">
          <dt className="text-xs text-mute">Lần gọi model</dt>
          <dd className="text-2xl font-bold text-navy tabular-nums">{so(tong.calls)}</dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-4 py-3">
          <dt className="text-xs text-mute">Tỷ lệ đọc cache</dt>
          <dd className="text-2xl font-bold text-navy tabular-nums">{phanTram(tyLeDocCache({ model: "", ...tong }))}</dd>
        </div>
        <div className="rounded-lg border border-line bg-white px-4 py-3">
          <dt className="text-xs text-mute">Trung bình mỗi cuộc chat</dt>
          <dd className="text-2xl font-bold text-navy tabular-nums">{cuocCoChia > 0 ? usd(tienCoChia / cuocCoChia) : "—"}</dd>
        </div>
      </dl>

      <div className="mt-3 rounded-lg border border-line bg-white px-4 py-3 text-xs text-mute">
        <p className="max-w-[80ch]">
          <span className="font-semibold text-navy">Trung bình mỗi cuộc chat là ước tính chia đều</span>: tiền của ngày chia cho số
          cuộc chat có tin khách trong ngày đó, không phải tiền đo riêng từng cuộc. Cuộc dài và cuộc một câu gánh như nhau.
          {cuocCoChia > 0 && <> Khoảng này chia được {so(cuocCoChia)} cuộc{thuCoChia > 0 ? `, trong đó ${so(thuCoChia)} cuộc bắn thử` : ""}.</>}
        </p>
        {ngayKhongChia > 0 && (
          <p className="mt-1 max-w-[80ch]">
            {ngayKhongChia} ngày có tiền mà không còn cuộc chat nào trong kho (hội thoại đã xoá, vd bắn thử tự dọn hoặc xoá dữ liệu
            thử), nên không vào phép chia.
          </p>
        )}
        {loiChat && (
          <p className="mt-1 text-red-700">
            Chưa đếm được cuộc chat ({loiChat}). View <code>chi_phi_cuoc_chat_ngay</code> có thể chưa được áp lên DB; bảng tiền vẫn đúng.
          </p>
        )}
        {tong.chuaGia > 0 && <p className="mt-1">* Có dòng model chưa có bảng giá: hiện token, không cộng vào tiền.</p>}
      </div>

      <h2 className="mt-6 text-sm font-bold text-navy">Theo ngày</h2>
      <p className="text-xs text-mute">Bấm một ngày để xem từng model.</p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-sm text-navy">
          <thead className="border-b border-line bg-cream/60">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-mute">Ngày</th>
              <th className={th}>Tiền</th>
              <th className={th}>Cuộc chat</th>
              <th className={th}>TB / cuộc</th>
              <th className={th}>Lần gọi</th>
              <th className={th}>Vào</th>
              <th className={th}>Ra</th>
              <th className={th}>Cache đọc</th>
              <th className={th}>Cache ghi</th>
              <th className={th}>Tỷ lệ cache</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {theoNgay.map(({ day, rows, g, c }) => {
              const dangMo = mo === day;
              const coRow = rows.length > 0;
              return [
                <tr key={day} className={coRow ? "cursor-pointer hover:bg-cream/50" : ""} onClick={coRow ? () => setMo(dangMo ? null : day) : undefined}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {coRow ? (
                      <button type="button" aria-expanded={dangMo} className="font-semibold text-navy hover:text-brand" onClick={(e) => { e.stopPropagation(); setMo(dangMo ? null : day); }}>
                        {thu(day)} {nhanNgay(day)}
                      </button>
                    ) : <span className="text-mute">{thu(day)} {nhanNgay(day)}</span>}
                  </td>
                  <td className={`${td} font-semibold`}><TienO g={g} /></td>
                  <td className={td}>
                    {c ? (c.cuoc_chat > 0 ? <>{so(c.cuoc_chat)}{c.cuoc_chat_thu > 0 && <span className="text-mute" title="số cuộc bắn thử"> ({c.cuoc_chat_thu} thử)</span>}</> : <span className="text-mute">0</span>) : <span className="text-mute">—</span>}
                  </td>
                  <td className={td}>{c && c.cuoc_chat > 0 && g.calls > 0 ? usd(g.tien / c.cuoc_chat) : <span className="text-mute">—</span>}</td>
                  <td className={td}>{g.calls ? so(g.calls) : <span className="text-mute">0</span>}</td>
                  <td className={td}>{gon(g.in_tokens)}</td>
                  <td className={td}>{gon(g.out_tokens)}</td>
                  <td className={td}>{gon(g.cache_read_tokens)}</td>
                  <td className={td}>{gon(g.cache_write_tokens)}</td>
                  <td className={td}>{phanTram(tyLeDocCache({ model: "", ...g }))}</td>
                </tr>,
                dangMo && rows.map((r) => {
                  const t = tienDong(r);
                  return (
                    <tr key={`${day}-${r.model}`} className="bg-cream/40 text-xs">
                      <td className="py-1.5 pl-6 pr-3 whitespace-nowrap text-mute" title={r.model}>{giaCua(r.model)?.nhan ?? r.model}</td>
                      <td className={td}>{t === null ? <span className="text-mute">chưa có giá</span> : usd(t)}</td>
                      <td className={td} />
                      <td className={td} />
                      <td className={td}>{so(r.calls ?? 0)}</td>
                      <td className={td}>{so(r.in_tokens)}</td>
                      <td className={td}>{so(r.out_tokens)}</td>
                      <td className={td}>{so(r.cache_read_tokens)}</td>
                      <td className={td}>{so(r.cache_write_tokens)}</td>
                      <td className={td}>{phanTram(tyLeDocCache(r))}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6 text-sm font-bold text-navy">Theo model · {soNgay} ngày</h2>
      {theoModel.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-mute">Chưa có lần gọi model nào trong khoảng này.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm text-navy">
            <thead className="border-b border-line bg-cream/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-mute">Model</th>
                <th className={th}>Tiền</th>
                <th className={th}>Phần tiền</th>
                <th className={th}>Lần gọi</th>
                <th className={th}>Tiền / lần</th>
                <th className={th}>Vào</th>
                <th className={th}>Ra</th>
                <th className={th}>Cache đọc</th>
                <th className={th}>Cache ghi</th>
                <th className={th}>Tỷ lệ cache</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {theoModel.map(([m, g]) => {
                const coGia = g.chuaGia === 0;
                return (
                  <tr key={m}>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold" title={m}>{giaCua(m)?.nhan ?? m}</td>
                    <td className={td}>{coGia ? usd(g.tien) : <span className="text-mute">chưa có giá</span>}</td>
                    <td className={td}>{coGia && tong.tien > 0 ? phanTram(g.tien / tong.tien) : <span className="text-mute">—</span>}</td>
                    <td className={td}>{so(g.calls)}</td>
                    <td className={td}>{coGia && g.calls > 0 ? usd(g.tien / g.calls) : <span className="text-mute">—</span>}</td>
                    <td className={td}>{gon(g.in_tokens)}</td>
                    <td className={td}>{gon(g.out_tokens)}</td>
                    <td className={td}>{gon(g.cache_read_tokens)}</td>
                    <td className={td}>{gon(g.cache_write_tokens)}</td>
                    <td className={td}>{phanTram(tyLeDocCache({ model: m, ...g }))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
