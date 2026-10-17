"use client";
// /admin/mau-cau — KHO MẪU CÂU CHUẨN (FR-180). Sửa câu bot thì làm ở màn chat
// (/admin/tin-nhan, nút "Sửa thành câu chuẩn"); trang này là kho: bảng mẫu đã
// có, sửa lại câu chuẩn / cách dùng / ghi chú, xoá, tiến độ /300, tải JSONL
// ShareGPT. Bản đầy đủ để train: `node scripts/xuat-mau-cau.mjs`.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const MUC_TIEU = 300;
type Mau = {
  id: string; message_id: string | null; conversation_id: string | null; phia: "ban" | "mua";
  ngu_canh: Array<{ ai: string; noi_dung: string; luc?: string }>;
  cau_bot: string; cau_chuan: string; dung_lam: "vi_du" | "fine_tune" | "ca_hai" | "bo";
  ghi_chu: string | null; nguoi_sua: string | null; updated_at: string;
};
const DUNG_LAM_VI: Record<Mau["dung_lam"], string> = {
  ca_hai: "ví dụ + fine-tune", vi_du: "chỉ ví dụ trong prompt", fine_tune: "chỉ fine-tune", bo: "bỏ",
};
const khachNoi = (m: Mau) => [...(m.ngu_canh ?? [])].reverse().find((x) => x.ai !== "bot")?.noi_dung ?? "";
const luc = (s: string) => new Date(s).toLocaleString("vi-VN", { hour12: false });

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [mau, setMau] = useState<Mau[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [locPhia, setLocPhia] = useState<"" | "ban" | "mua">("");
  const [locDung, setLocDung] = useState<"" | Mau["dung_lam"]>("");
  const [sua, setSua] = useState<Mau | null>(null);
  const [form, setForm] = useState({ cau_chuan: "", dung_lam: "ca_hai" as Mau["dung_lam"], ghi_chu: "" });
  const [dangLuu, setDangLuu] = useState(false);

  const nap = async () => {
    const { data, error } = await supabase.from("mau_cau").select("*").order("updated_at", { ascending: false }).limit(3000);
    if (error) setLoi(error.message);
    setMau((data ?? []) as Mau[]);
  };
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setRole("anon");
      const { data: a } = await supabase.from("admins").select("email").eq("email", user.email ?? "").maybeSingle();
      if (!a) return setRole("user");
      setRole("admin"); await nap();
    });
  }, []);

  const loc = useMemo(() => {
    const k = q.trim().toLowerCase();
    return mau.filter((m) =>
      (!locPhia || m.phia === locPhia) && (!locDung || m.dung_lam === locDung) &&
      (!k || [m.cau_bot, m.cau_chuan, khachNoi(m), m.ghi_chu ?? "", m.nguoi_sua ?? ""].join(" ").toLowerCase().includes(k)));
  }, [mau, q, locPhia, locDung]);
  const soDung = mau.filter((m) => m.dung_lam !== "bo").length;
  const pct = Math.min(100, Math.round((soDung / MUC_TIEU) * 100));

  const luu = async () => {
    if (!sua) return;
    setDangLuu(true);
    const { error } = await supabase.from("mau_cau").update({
      cau_chuan: form.cau_chuan.trim(), dung_lam: form.dung_lam, ghi_chu: form.ghi_chu.trim() || null,
    }).eq("id", sua.id);
    setDangLuu(false);
    if (error) { setLoi(error.message); return; }
    setSua(null); await nap();
  };
  const xoa = async (m: Mau) => {
    if (!confirm("Xoá mẫu này?")) return;
    const { error } = await supabase.from("mau_cau").delete().eq("id", m.id);
    if (error) setLoi(error.message); else await nap();
  };
  const taiJsonl = () => {
    const dong = loc.filter((m) => m.dung_lam !== "bo" && m.dung_lam !== "vi_du").map((m) => {
      const conv: Array<{ from: "human" | "gpt"; value: string }> = [];
      for (const x of m.ngu_canh ?? []) {
        const from = x.ai === "bot" ? "gpt" : "human";
        const last = conv[conv.length - 1];
        if (last && last.from === from) last.value += "\n" + x.noi_dung; else conv.push({ from, value: x.noi_dung });
      }
      if (!conv.length || conv[conv.length - 1].from === "gpt") conv.push({ from: "human", value: "(khách im)" });
      conv.push({ from: "gpt", value: m.cau_chuan });
      return JSON.stringify({ phia: m.phia, conversations: conv });
    });
    const blob = new Blob([dong.join("\n") + "\n"], { type: "application/jsonl;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mau-cau-${new Date().toISOString().slice(0, 10)}.sharegpt.jsonl`; a.click();
    URL.revokeObjectURL(url);
  };

  if (role === "loading") return <div className="mx-auto max-w-4xl px-4 py-16 text-mute font-medium">Đang kiểm tra quyền…</div>;
  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-navy">Khu vực quản trị</h1>
        <p className="mt-2 text-mute text-sm">{role === "anon" ? "Cần đăng nhập bằng tài khoản quản trị." : "Tài khoản này không có quyền quản trị."}</p>
        {role === "anon" && <Link href="/dang-nhap" className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 font-bold text-white hover:bg-brand-dark transition">Đăng nhập</Link>}
      </div>
    );
  }

  const o = "rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-brand";
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy">Kho mẫu câu chuẩn</h1>
          <p className="mt-1 text-sm text-mute">
            Sửa câu bot ở <Link href="/admin/tin-nhan" className="font-semibold text-brand hover:underline">Tin nhắn</Link>; ở đây xem lại, chỉnh, xoá và xuất. Bot bắt chước 12 mẫu mới nhất mỗi phía trong vòng 1 phút.
          </p>
        </div>
        <div className="min-w-[280px]">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-bold text-navy tabular-nums">{soDung}/{MUC_TIEU} mẫu</span>
            <span className="text-xs text-mute">{mau.filter((m) => m.phia === "ban" && m.dung_lam !== "bo").length} bán · {mau.filter((m) => m.phia === "mua" && m.dung_lam !== "bo").length} mua</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
        </div>
      </header>

      {loi && <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-brand">{loi}</div>}

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong câu khách, câu bot, câu chuẩn, ghi chú…" className={`${o} min-w-[260px] flex-1`} />
        <select value={locPhia} onChange={(e) => setLocPhia(e.target.value as "" | "ban" | "mua")} className={o}><option value="">Cả hai phía</option><option value="ban">Bán</option><option value="mua">Mua</option></select>
        <select value={locDung} onChange={(e) => setLocDung(e.target.value as "" | Mau["dung_lam"])} className={o}><option value="">Mọi cách dùng</option>{(Object.keys(DUNG_LAM_VI) as Mau["dung_lam"][]).map((k) => <option key={k} value={k}>{DUNG_LAM_VI[k]}</option>)}</select>
        <button type="button" onClick={taiJsonl} disabled={loc.length === 0} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60">Tải JSONL ({loc.filter((m) => m.dung_lam !== "bo" && m.dung_lam !== "vi_du").length})</button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream/60 text-[11px] uppercase tracking-wider text-mute">
            <tr><th className="px-3 py-2 text-left">Lúc</th><th className="px-3 py-2 text-left">Phía</th><th className="px-3 py-2 text-left">Khách nói</th><th className="px-3 py-2 text-left">Bot đã nói</th><th className="px-3 py-2 text-left">Câu chuẩn</th><th className="px-3 py-2 text-left">Dùng</th><th className="px-3 py-2 text-left">Người sửa</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {loc.map((m) => (
              <tr key={m.id} className="border-t border-line/70 align-top hover:bg-cream/30">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-mute tabular-nums">{luc(m.updated_at)}</td>
                <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${m.phia === "ban" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>{m.phia}</span></td>
                <td className="max-w-[220px] px-3 py-2 text-xs text-navy">{khachNoi(m).slice(0, 140)}</td>
                <td className="max-w-[260px] px-3 py-2 text-xs text-mute line-through decoration-mute/40">{m.cau_bot.slice(0, 160)}</td>
                <td className="max-w-[320px] px-3 py-2 text-sm font-medium text-navy">{m.cau_chuan}{m.ghi_chu && <div className="mt-1 text-[11px] font-normal text-mute">{m.ghi_chu}</div>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-mute">{DUNG_LAM_VI[m.dung_lam]}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-mute">{m.nguoi_sua?.split("@")[0] ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  <button type="button" onClick={() => { setSua(m); setForm({ cau_chuan: m.cau_chuan, dung_lam: m.dung_lam, ghi_chu: m.ghi_chu ?? "" }); }} className="font-bold text-brand hover:underline">Sửa</button>
                  <span className="mx-1 text-mute">·</span>
                  {m.conversation_id && <Link href={`/admin/tin-nhan?hoi_thoai=${m.conversation_id}`} className="font-semibold text-navy hover:underline">Mở chat</Link>}
                  <span className="mx-1 text-mute">·</span>
                  <button type="button" onClick={() => xoa(m)} className="text-mute hover:text-red-600">Xoá</button>
                </td>
              </tr>
            ))}
            {loc.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-mute">Chưa có mẫu nào{mau.length ? " khớp bộ lọc" : ""}. Vào <Link href="/admin/tin-nhan" className="font-semibold text-brand hover:underline">Tin nhắn</Link>, bấm "Sửa thành câu chuẩn" ở câu bot chưa ưng.</td></tr>}
          </tbody>
        </table>
      </div>

      {sua && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" onClick={() => setSua(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy">Sửa mẫu</h2>
            <div className="mt-2 rounded-xl bg-cream/60 p-3 text-xs text-navy"><b>Khách:</b> {khachNoi(sua) || "(không có)"}<br /><b>Bot đã nói:</b> {sua.cau_bot}</div>
            <textarea value={form.cau_chuan} onChange={(e) => setForm({ ...form, cau_chuan: e.target.value })} rows={4} className="mt-3 w-full rounded-xl border border-brand/40 px-3 py-2 text-sm outline-none focus:border-brand" />
            <div className="mt-2 flex flex-wrap gap-2">
              <select value={form.dung_lam} onChange={(e) => setForm({ ...form, dung_lam: e.target.value as Mau["dung_lam"] })} className={o}>{(Object.keys(DUNG_LAM_VI) as Mau["dung_lam"][]).map((k) => <option key={k} value={k}>{DUNG_LAM_VI[k]}</option>)}</select>
              <input value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} placeholder="ghi chú (vì sao sửa)…" className={`${o} flex-1`} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSua(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-mute hover:bg-slate-100">Huỷ</button>
              <button type="button" disabled={dangLuu || !form.cau_chuan.trim()} onClick={luu} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60">{dangLuu ? "Đang lưu…" : "Lưu"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
