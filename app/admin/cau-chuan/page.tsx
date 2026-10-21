"use client";
// /admin/cau-chuan — chấm điểm và sửa tay câu bot (20/10/2026, SRS-5.1zzzzzzz88). Chủ dự án: "bắn lên chỗ câu chuẩn cách bot đã ghi
// để tôi sửa tay từ từ, và chấm điểm nữa phải có trong ngữ cảnh". Mỗi thẻ: ngữ cảnh (8 tin trước câu bot, chép lúc đưa vào), câu bot
// cũ, ô câu chuẩn (điền sẵn câu bot để sửa dần), điểm 1–5, ghi chú. Lõi Python đọc dòng đã sửa / đã chấm làm ví dụ trong vòng 60 giây.
// Đưa câu vào: nút "Chấm / sửa" ở /admin/tin-nhan, hoặc script bắn thử (`cau_chuan_tu_zalo`). Đọc / ghi bảng `cau_chuan` qua RLS admin.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Btn } from "@/components/ui";
import { IconRefresh, IconTrash } from "@/components/icons";

type Luot = { ai: string; noi_dung: string };
type Dong = {
  id: string; conversation_id: string | null; ngu_canh: Luot[]; cau_bot: string; cau_chuan: string | null;
  diem: number | null; ghi_chu: string | null; nguon: "that" | "ban_thu"; dung_lam_mau: boolean; created_at: string; updated_at: string;
};
type Nhap = { cau_chuan: string; diem: number | null; ghi_chu: string; dung_lam_mau: boolean };

const AI_VI: Record<string, string> = { bot: "Trợ lý", buyer: "Khách", seller: "Chủ nhà", human: "Người thật", ctv: "CTV", system: "Hệ thống" };
const luc = (s: string) => new Date(s).toLocaleString("vi-VN", { hour12: false });
const nhapTu = (d: Dong): Nhap => ({ cau_chuan: d.cau_chuan ?? d.cau_bot, diem: d.diem, ghi_chu: d.ghi_chu ?? "", dung_lam_mau: d.dung_lam_mau });

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [dong, setDong] = useState<Dong[]>([]);
  const [nhap, setNhap] = useState<Record<string, Nhap>>({});
  const [loc, setLoc] = useState<"chua" | "da" | "da_sua" | "tat_ca">("chua");
  const [nguon, setNguon] = useState<"" | "that" | "ban_thu">("");
  const [dangLuu, setDangLuu] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [thongBao, setThongBao] = useState<string | null>(null);

  const nap = async () => {
    const { data, error } = await supabase.from("cau_chuan")
      .select("id, conversation_id, ngu_canh, cau_bot, cau_chuan, diem, ghi_chu, nguon, dung_lam_mau, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(300);
    if (error) { setLoi(error.message); return; }
    const ds = (data ?? []) as Dong[];
    setDong(ds);
    setNhap(Object.fromEntries(ds.map((d) => [d.id, nhapTu(d)])));
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

  const daCham = (d: Dong) => d.cau_chuan != null || d.diem != null;
  // "Câu mẫu đã sửa" (chủ dự án 21/10): câu chuẩn đã lưu KHÁC câu bot — người chấm đã viết lại câu, không chỉ chấm điểm.
  const daSua = (d: Dong) => d.cau_chuan != null && d.cau_chuan.trim() !== d.cau_bot.trim();
  const danhSach = useMemo(() => dong.filter((d) =>
    (loc === "tat_ca" || (loc === "da_sua" ? daSua(d) : loc === "da" ? daCham(d) : !daCham(d))) && (!nguon || d.nguon === nguon)),
  [dong, loc, nguon]);
  const dem = { chua: dong.filter((d) => !daCham(d)).length, da: dong.filter(daCham).length, da_sua: dong.filter(daSua).length };

  const sua = (id: string, p: Partial<Nhap>) => setNhap((n) => ({ ...n, [id]: { ...n[id], ...p } }));
  const luu = async (d: Dong) => {
    const n = nhap[d.id];
    const cau = n.cau_chuan.trim();
    if (!cau) { setLoi("Câu chuẩn đang trống — viết câu bot nên nói, hoặc bấm Huỷ sửa."); return; }
    setDangLuu(d.id);
    const { error } = await supabase.from("cau_chuan")
      .update({ cau_chuan: cau, diem: n.diem, ghi_chu: n.ghi_chu.trim() || null, dung_lam_mau: n.dung_lam_mau }).eq("id", d.id);
    setDangLuu(null);
    if (error) { setLoi(error.message); return; }
    setThongBao("Đã lưu. Bot dùng câu này làm ví dụ trong vòng 1 phút.");
    await nap();
  };
  const xoa = async (d: Dong) => {
    if (!confirm("Xoá câu này khỏi danh sách câu chuẩn?\n\nBot thôi dùng nó làm ví dụ. Tin nhắn gốc trong hội thoại vẫn còn.")) return;
    const { error } = await supabase.from("cau_chuan").delete().eq("id", d.id);
    if (error) { setLoi(error.message); return; }
    await nap();
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

  const chip = (on: boolean) => `shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition ${on ? "bg-navy text-white" : "bg-cream/70 text-navy hover:bg-line"}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold text-navy">Câu chuẩn</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-mute">
        Mỗi thẻ là một câu bot đã trả lời, kèm các tin ngay trước nó. Chấm điểm, sửa câu cho đúng cách bot nên nói rồi bấm Lưu —
        bot đọc các câu đã lưu làm ví dụ (trong vòng 1 phút). Đưa thêm câu vào từ trang <Link href="/admin/tin-nhan" className="font-semibold text-brand hover:underline">Tin nhắn</Link> (nút &quot;Chấm / sửa&quot; dưới câu bot).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Lọc theo trạng thái chấm">
          <button type="button" className={chip(loc === "chua")} onClick={() => setLoc("chua")}>Chưa chấm {dem.chua}</button>
          <button type="button" className={chip(loc === "da")} onClick={() => setLoc("da")}>Đã chấm {dem.da}</button>
          <button type="button" className={chip(loc === "da_sua")} onClick={() => setLoc("da_sua")}>Câu mẫu đã sửa {dem.da_sua}</button>
          <button type="button" className={chip(loc === "tat_ca")} onClick={() => setLoc("tat_ca")}>Tất cả {dong.length}</button>
        </div>
        <label htmlFor="loc-nguon" className="ml-2 text-xs font-semibold text-mute">Nguồn</label>
        <select id="loc-nguon" value={nguon} onChange={(e) => setNguon(e.target.value as typeof nguon)} className="rounded-md border border-line bg-white px-2 py-1 text-xs text-navy outline-none focus:border-brand">
          <option value="">Mọi nguồn</option>
          <option value="that">Khách thật</option>
          <option value="ban_thu">Bắn thử</option>
        </select>
        <button type="button" onClick={() => { void nap(); }} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-navy hover:bg-cream/70">
          <IconRefresh className="h-3.5 w-3.5" /> Làm mới
        </button>
      </div>

      <ol className="mt-4 space-y-4">
        {danhSach.map((d) => {
          const n = nhap[d.id] ?? nhapTu(d);
          const doi = n.cau_chuan.trim() !== d.cau_bot.trim();
          return (
            <li key={d.id} className="rounded-lg border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-mute">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span>{d.nguon === "ban_thu" ? "Bắn thử" : "Khách thật"} · {luc(d.created_at)}</span>
                  {daSua(d) && <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold text-brand">Câu mẫu đã sửa</span>}
                  {d.dung_lam_mau && (d.cau_chuan != null || d.diem != null) && <span className="rounded bg-navy/10 px-1.5 py-0.5 text-[11px] font-bold text-navy">Bot dùng làm ví dụ</span>}
                  {d.diem != null && <span className="rounded bg-cream px-1.5 py-0.5 text-[11px] font-bold text-navy tabular-nums">{d.diem} điểm</span>}
                </span>
                {d.conversation_id && <Link href={`/admin/tin-nhan?hoi_thoai=${d.conversation_id}`} className="font-semibold text-brand hover:underline">Mở hội thoại</Link>}
              </div>
              <div className="space-y-1.5 bg-cream/30 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-mute">Ngữ cảnh</div>
                {d.ngu_canh.length === 0 && <div className="text-sm text-mute">Câu đầu hội thoại.</div>}
                {d.ngu_canh.map((t, i) => (
                  <div key={i} className={`flex ${t.ai === "bot" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${t.ai === "bot" ? "bg-navy/90 text-white" : "bg-white text-navy"}`}>
                      <div className={`text-[10px] font-bold ${t.ai === "bot" ? "text-white/60" : "text-mute"}`}>{AI_VI[t.ai] ?? t.ai}</div>
                      <div className="whitespace-pre-wrap break-words">{t.noi_dung}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3 px-4 py-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-mute">Bot đã trả lời</div>
                  <div className="mt-1 whitespace-pre-wrap break-words rounded-md border border-line bg-cream/40 px-3 py-2 text-sm text-navy">{d.cau_bot}</div>
                </div>
                <fieldset>
                  <legend className="text-[11px] font-bold uppercase tracking-wide text-mute">Điểm câu bot</legend>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} type="button" aria-pressed={n.diem === s} onClick={() => sua(d.id, { diem: n.diem === s ? null : s })}
                        className={`h-9 w-9 rounded-md border text-sm font-bold tabular-nums transition ${n.diem === s ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-brand"}`}>{s}</button>
                    ))}
                    <span className="ml-2 self-center text-xs text-mute">1 = sai / hại · 5 = chuẩn</span>
                  </div>
                </fieldset>
                <div>
                  <label htmlFor={`cc-${d.id}`} className="text-[11px] font-bold uppercase tracking-wide text-mute">Câu chuẩn {doi && <span className="font-semibold normal-case text-brand">(đã sửa)</span>}</label>
                  <textarea id={`cc-${d.id}`} value={n.cau_chuan} onChange={(e) => sua(d.id, { cau_chuan: e.target.value })} rows={Math.min(12, Math.max(3, n.cau_chuan.split("\n").length + 1))}
                    className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-navy outline-none focus:border-brand" />
                </div>
                <div>
                  <label htmlFor={`gc-${d.id}`} className="text-[11px] font-bold uppercase tracking-wide text-mute">Ghi chú cho bot (vì sao sửa)</label>
                  <input id={`gc-${d.id}`} value={n.ghi_chu} onChange={(e) => sua(d.id, { ghi_chu: e.target.value })} placeholder="vd: khách đã ok thì đăng luôn, đừng hỏi lại"
                    className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-navy outline-none focus:border-brand" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="mr-auto inline-flex items-center gap-2 text-sm text-navy">
                    <input type="checkbox" checked={n.dung_lam_mau} onChange={(e) => sua(d.id, { dung_lam_mau: e.target.checked })} /> Bot dùng làm ví dụ
                  </label>
                  {doi && <Btn variant="ghost" onClick={() => sua(d.id, { cau_chuan: d.cau_chuan ?? d.cau_bot })}>Huỷ sửa</Btn>}
                  <Btn variant="danger" onClick={() => xoa(d)} title="Bỏ câu này khỏi danh sách"><IconTrash className="h-3.5 w-3.5" /> Xoá</Btn>
                  <Btn variant="primary" onClick={() => luu(d)} disabled={dangLuu === d.id}>{dangLuu === d.id ? "Đang lưu…" : "Lưu câu chuẩn"}</Btn>
                </div>
              </div>
            </li>
          );
        })}
        {danhSach.length === 0 && <li className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-mute">
          {loc === "chua" ? "Không còn câu nào chưa chấm." : "Chưa có câu nào."} Mở <Link href="/admin/tin-nhan" className="font-semibold text-brand hover:underline">Tin nhắn</Link> và bấm &quot;Chấm / sửa&quot; dưới một câu bot để đưa vào đây.
        </li>}
      </ol>

      {loi && (
        <div role="alert" className="fixed bottom-4 right-4 flex items-center gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          <span>Lỗi: {loi}</span>
          <button type="button" onClick={() => setLoi(null)} aria-label="Đóng" className="font-bold">×</button>
        </div>
      )}
      {thongBao && (
        <div role="status" className="fixed bottom-4 right-4 flex items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <span>{thongBao}</span>
          <button type="button" onClick={() => setThongBao(null)} aria-label="Đóng" className="font-bold">×</button>
        </div>
      )}
    </div>
  );
}
