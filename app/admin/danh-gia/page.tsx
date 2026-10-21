"use client";
// /admin/danh-gia — khách chấm sao cho AI (21/10/2026, SRS-5.1zzzzzzz104). Chủ dự án chốt: hỏi MỘT lần mỗi khách (bên bán: sau khi
// tin lên web và nói xong phí; bên mua: khi khách báo đã nhận đủ thông tin căn); ≤ 2 sao thì bot đã nhắn admin qua Zalo. Trang này
// chỉ đọc bảng `danh_gia_ai` qua RLS admin — điểm do lõi Python ghi, không sửa tay ở đây.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { IconRefresh } from "@/components/icons";

type Dong = {
  id: string; zalo_user_id: string; vai: "ban" | "mua"; ten_khach: string | null; hoi_luc: string; sao: number | null;
  loi_khach: string | null; tra_loi_luc: string | null; da_bao_admin: boolean; la_thu: boolean;
};

const luc = (s: string) => new Date(s).toLocaleString("vi-VN", { hour12: false });

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [dong, setDong] = useState<Dong[]>([]);
  const [loc, setLoc] = useState<"tat_ca" | "da_cham" | "thap" | "chua">("tat_ca");
  const [nguon, setNguon] = useState<"that" | "thu" | "">("that");
  const [loi, setLoi] = useState<string | null>(null);

  const nap = async () => {
    const { data, error } = await supabase.from("danh_gia_ai")
      .select("id, zalo_user_id, vai, ten_khach, hoi_luc, sao, loi_khach, tra_loi_luc, da_bao_admin, la_thu")
      .order("hoi_luc", { ascending: false }).limit(500);
    if (error) { setLoi(error.message); return; }
    setLoi(null);
    setDong((data ?? []) as Dong[]);
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

  const theoNguon = useMemo(() => dong.filter((d) => !nguon || (nguon === "thu" ? d.la_thu : !d.la_thu)), [dong, nguon]);
  const daCham = theoNguon.filter((d) => d.sao != null);
  const thap = daCham.filter((d) => (d.sao ?? 5) <= 2);
  const tb = daCham.length ? daCham.reduce((s, d) => s + (d.sao ?? 0), 0) / daCham.length : null;
  const phan = [5, 4, 3, 2, 1].map((n) => ({ n, so: daCham.filter((d) => d.sao === n).length }));
  const danhSach = theoNguon.filter((d) =>
    loc === "tat_ca" || (loc === "da_cham" ? d.sao != null : loc === "thap" ? d.sao != null && d.sao <= 2 : d.sao == null));

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
  const maxPhan = Math.max(1, ...phan.map((p) => p.so));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold text-navy">Đánh giá AI</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-mute">
        Khách chấm 1–5 sao cho trợ lý, mỗi khách được hỏi một lần: người rao sau khi tin lên web và nói xong phí, khách mua khi báo đã
        đủ thông tin căn. Khách chấm từ 2 sao trở xuống thì bot đã nhắn admin qua Zalo — mở <Link href="/admin/tin-nhan" className="font-semibold text-brand hover:underline">Tin nhắn</Link> để hỗ trợ.
      </p>

      {loi && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Không đọc được dữ liệu: {loi}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-line bg-white px-4 py-3"><dt className="text-xs text-mute">Đã hỏi</dt><dd className="text-2xl font-bold text-navy tabular-nums">{theoNguon.length}</dd></div>
        <div className="rounded-lg border border-line bg-white px-4 py-3"><dt className="text-xs text-mute">Đã chấm</dt><dd className="text-2xl font-bold text-navy tabular-nums">{daCham.length}</dd></div>
        <div className="rounded-lg border border-line bg-white px-4 py-3"><dt className="text-xs text-mute">Điểm trung bình</dt><dd className="text-2xl font-bold text-navy tabular-nums">{tb == null ? "—" : tb.toFixed(1)}</dd></div>
        <div className="rounded-lg border border-line bg-white px-4 py-3"><dt className="text-xs text-mute">Từ 2 sao trở xuống</dt><dd className={`text-2xl font-bold tabular-nums ${thap.length ? "text-red-700" : "text-navy"}`}>{thap.length}</dd></div>
      </dl>

      {daCham.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-white px-4 py-3">
          <div className="text-xs font-semibold text-mute">Phân bố điểm</div>
          <ul className="mt-2 space-y-1">
            {phan.map((p) => (
              <li key={p.n} className="flex items-center gap-2 text-xs text-navy">
                <span className="w-10 shrink-0 tabular-nums">{p.n} sao</span>
                <span className="h-2 flex-1 rounded bg-cream"><span className={`block h-2 rounded ${p.n <= 2 ? "bg-red-600" : "bg-brand"}`} style={{ width: `${(p.so / maxPhan) * 100}%` }} /></span>
                <span className="w-6 shrink-0 text-right tabular-nums">{p.so}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Lọc theo điểm">
          <button type="button" className={chip(loc === "tat_ca")} onClick={() => setLoc("tat_ca")}>Tất cả {theoNguon.length}</button>
          <button type="button" className={chip(loc === "da_cham")} onClick={() => setLoc("da_cham")}>Đã chấm {daCham.length}</button>
          <button type="button" className={chip(loc === "thap")} onClick={() => setLoc("thap")}>Từ 2 sao trở xuống {thap.length}</button>
          <button type="button" className={chip(loc === "chua")} onClick={() => setLoc("chua")}>Chưa chấm {theoNguon.length - daCham.length}</button>
        </div>
        <label htmlFor="loc-nguon" className="ml-2 text-xs font-semibold text-mute">Nguồn</label>
        <select id="loc-nguon" value={nguon} onChange={(e) => setNguon(e.target.value as typeof nguon)} className="rounded-md border border-line bg-white px-2 py-1 text-xs text-navy outline-none focus:border-brand">
          <option value="that">Khách thật</option>
          <option value="thu">Bắn thử</option>
          <option value="">Mọi nguồn</option>
        </select>
        <button type="button" onClick={() => { void nap(); }} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-navy hover:bg-cream/70">
          <IconRefresh className="h-3.5 w-3.5" /> Làm mới
        </button>
      </div>

      {danhSach.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-mute">
          {theoNguon.length === 0 ? "Chưa khách nào được hỏi chấm sao. Câu hỏi đi ra sau khi người rao xong tin hoặc khách mua đủ thông tin căn." : "Không có dòng nào khớp bộ lọc này."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-white">
          {danhSach.map((d) => (
            <li key={d.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
              <div className="w-16 shrink-0">
                {d.sao == null
                  ? <span className="text-xs text-mute">Chưa chấm</span>
                  : <span className={`text-lg font-bold tabular-nums ${d.sao <= 2 ? "text-red-700" : "text-navy"}`}>{d.sao}<span className="text-xs font-semibold text-mute"> / 5</span></span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-navy">
                  {d.ten_khach ?? "Khách Zalo"}
                  <span className="rounded bg-cream px-1.5 py-0.5 text-[11px] font-bold text-navy">{d.vai === "mua" ? "Khách mua" : "Người rao"}</span>
                  {d.la_thu && <span className="rounded bg-cream px-1.5 py-0.5 text-[11px] font-bold text-mute">Bắn thử</span>}
                  {d.da_bao_admin && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-700">Đã báo admin</span>}
                </div>
                {d.loi_khach && <p className="mt-0.5 break-words text-sm text-navy">“{d.loi_khach}”</p>}
                <p className="mt-0.5 text-xs text-mute">Hỏi lúc {luc(d.hoi_luc)}{d.tra_loi_luc ? ` · chấm lúc ${luc(d.tra_loi_luc)}` : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
