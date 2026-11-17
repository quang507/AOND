"use client";
// /admin/moi-gioi — quản lý môi giới đăng ký từ form web /moi-gioi/dang-ky (SRS-5.1zzzzzzz523, chủ dự án 17/11/2026). Đọc và đổi trạng thái
// bảng `dang_ky_moi_gioi` qua RLS admin; chỉ bốn cột xử lý được sửa (trạng thái, ghi chú, lúc xử lý, người xử lý) — phần người đăng ký
// khai thì giữ nguyên. Việc của admin: nhắn Zalo qua số người ta để lại, rồi ghi lại đã tới đâu.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { IconRefresh } from "@/components/icons";
import { Badge, Btn } from "@/components/ui";
import { TRANG_THAI_MG, type DangKyMG, type TrangThaiMG } from "@/lib/moi-gioi";

const luc = (s: string) => new Date(s).toLocaleString("vi-VN", { hour12: false });
const TONE: Record<TrangThaiMG, "info" | "warn" | "ok" | "neutral"> = { moi: "info", da_lien_he: "warn", duyet: "ok", tu_choi: "neutral" };
const THU_TU: TrangThaiMG[] = ["moi", "da_lien_he", "duyet", "tu_choi"];
// Việc kế tiếp hợp lý cho từng trạng thái — không bày cả bốn nút trên mọi dòng.
const BUOC_KE: Record<TrangThaiMG, TrangThaiMG[]> = {
  moi: ["da_lien_he", "tu_choi"],
  da_lien_he: ["duyet", "tu_choi"],
  duyet: ["da_lien_he"],
  tu_choi: ["moi"],
};
const NHAN_NUT: Record<TrangThaiMG, string> = { moi: "Mở lại", da_lien_he: "Đã liên hệ", duyet: "Duyệt", tu_choi: "Từ chối" };

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [email, setEmail] = useState("");
  const [dong, setDong] = useState<DangKyMG[]>([]);
  const [loc, setLoc] = useState<TrangThaiMG | "tat_ca">("moi");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState<string | null>(null);
  const [nhap, setNhap] = useState<Record<string, string>>({});

  const nap = async () => {
    const { data, error } = await supabase.from("dang_ky_moi_gioi")
      .select("id, created_at, loai, ho_ten, so_dien_thoai, khu_vuc, loai_bds, cong_ty, kinh_nghiem, so_can, ghi_chu, trang_thai, ghi_chu_admin, xu_ly_luc, xu_ly_boi, seller_id, ma_moi_gioi, ma_kich_hoat")
      .order("created_at", { ascending: false }).limit(500);
    if (error) { setLoi(error.message); return; }
    setLoi(null);
    setDong((data ?? []) as DangKyMG[]);
  };

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setRole("anon");
      const { data: a } = await supabase.from("admins").select("email").eq("email", user.email ?? "").maybeSingle();
      if (!a) return setRole("user");
      setEmail(user.email ?? "");
      setRole("admin");
      await nap();
    });
  }, []);

  const dem = useMemo(() => Object.fromEntries(THU_TU.map((t) => [t, dong.filter((d) => d.trang_thai === t).length])) as Record<TrangThaiMG, number>, [dong]);
  const danhSach = loc === "tat_ca" ? dong : dong.filter((d) => d.trang_thai === loc);

  const luu = async (d: DangKyMG, doi: { trang_thai?: TrangThaiMG; ghi_chu_admin?: string | null }) => {
    setDangLuu(d.id);
    const moi = { ...doi, xu_ly_luc: new Date().toISOString(), xu_ly_boi: email };
    const { error } = await supabase.from("dang_ky_moi_gioi").update(moi).eq("id", d.id);
    setDangLuu(null);
    if (error) { setLoi(`Chưa lưu được: ${error.message}`); return; }
    setLoi(null);
    setDong((ds) => ds.map((x) => (x.id === d.id ? { ...x, ...moi } : x)));
    if (doi.trang_thai === "duyet") await nap();   // DB vừa cấp mã môi giới + mã kích hoạt (SRS-5.1zzzzzzz524)
    if ("ghi_chu_admin" in doi) setNhap((n) => { const m = { ...n }; delete m[d.id]; return m; });
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
      <h1 className="text-xl font-bold text-navy">Môi giới đăng ký</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-mute">
        Môi giới, sàn điền form ở <Link href="/moi-gioi/dang-ky" className="font-semibold text-brand hover:underline">trang đăng ký</Link>. Nhắn Zalo
        qua số họ để lại, rồi ghi lại đã tới đâu. Một số điện thoại chỉ đăng ký được một lần trong 24 giờ.
      </p>

      {loi && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loi}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Lọc theo trạng thái">
          {THU_TU.map((t) => (
            <button key={t} type="button" aria-pressed={loc === t} className={chip(loc === t)} onClick={() => setLoc(t)}>{TRANG_THAI_MG[t]} {dem[t]}</button>
          ))}
          <button type="button" aria-pressed={loc === "tat_ca"} className={chip(loc === "tat_ca")} onClick={() => setLoc("tat_ca")}>Tất cả {dong.length}</button>
        </div>
        <button type="button" onClick={() => { void nap(); }} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-navy hover:bg-cream/70">
          <IconRefresh className="h-3.5 w-3.5" /> Làm mới
        </button>
      </div>

      {danhSach.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-mute">
          {dong.length === 0 ? "Chưa có ai đăng ký. Đăng ký mới sẽ hiện ở đây ngay khi người ta gửi form." : "Không có đăng ký nào ở trạng thái này."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {danhSach.map((d) => {
            const ghi = nhap[d.id] ?? d.ghi_chu_admin ?? "";
            const doiGhi = ghi !== (d.ghi_chu_admin ?? "");
            const ban = dangLuu === d.id;
            return (
              <li key={d.id} className="rounded-lg border border-line bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-base font-bold text-navy">{d.ho_ten}</span>
                  <Badge tone={TONE[d.trang_thai]}>{TRANG_THAI_MG[d.trang_thai]}</Badge>
                  <Badge>{d.loai === "san" ? "Sàn, công ty" : "Cá nhân"}</Badge>
                  <span className="ml-auto text-xs text-mute tabular-nums">Gửi lúc {luc(d.created_at)}</span>
                </div>

                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Số Zalo</dt>
                    <dd className="font-semibold text-navy tabular-nums">
                      {d.so_dien_thoai}{" "}
                      <a href={`https://zalo.me/${d.so_dien_thoai}`} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">Mở Zalo</a>
                    </dd></div>
                  <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Khu vực</dt><dd className="text-navy">{d.khu_vuc.join(" · ")}</dd></div>
                  {d.loai_bds.length > 0 && <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Chuyên</dt><dd className="text-navy">{d.loai_bds.join(" · ")}</dd></div>}
                  {d.cong_ty && <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Công ty</dt><dd className="text-navy">{d.cong_ty}</dd></div>}
                  {d.kinh_nghiem && <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Kinh nghiệm</dt><dd className="text-navy">{d.kinh_nghiem}</dd></div>}
                  {d.so_can != null && <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Đang nhận</dt><dd className="text-navy tabular-nums">{d.so_can} căn</dd></div>}
                </dl>
                {d.ghi_chu && <p className="mt-2 break-words text-sm text-navy">“{d.ghi_chu}”</p>}
                {d.ma_moi_gioi && d.ma_kich_hoat && (
                  <div className="mt-3 rounded-md border border-line bg-cream/50 px-3 py-2 text-sm">
                    <p className="text-navy">
                      Mã môi giới <strong className="tabular-nums">{d.ma_moi_gioi}</strong> · Mã kích hoạt{" "}
                      <strong className="select-all tabular-nums">{d.ma_kich_hoat}</strong>{" "}
                      <Badge tone={d.seller_id ? "ok" : "warn"}>{d.seller_id ? "Đã kích hoạt" : "Chưa kích hoạt"}</Badge>
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      Gửi mã kích hoạt cho môi giới qua Zalo. Họ nhắn mã đó cho trợ lý trên Zalo, và nhập ở trang quản lý sau khi đăng nhập, để tin gửi
                      qua Zalo và tài khoản web về chung một hồ sơ. Mã chỉ gửi riêng cho đúng người.
                    </p>
                    <button type="button" className="mt-1.5 text-xs font-semibold text-brand hover:underline"
                            onClick={() => { void navigator.clipboard?.writeText(`Đăng ký môi giới của anh chị đã được duyệt. Mã môi giới: ${d.ma_moi_gioi}. Mã kích hoạt: ${d.ma_kich_hoat}. Anh chị nhắn mã kích hoạt này cho trợ lý trên Zalo, hoặc đăng nhập aond.vercel.app/quan-ly rồi nhập mã, để quản lý tin và gửi khách.`).catch(() => {}); }}>
                      Sao chép lời nhắn gửi môi giới
                    </button>
                  </div>
                )}

                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold text-mute">Ghi chú nội bộ</span>
                  <textarea rows={2} maxLength={1000} value={ghi} onChange={(e) => setNhap((n) => ({ ...n, [d.id]: e.target.value }))}
                            className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm text-navy outline-none focus:border-brand" />
                </label>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {BUOC_KE[d.trang_thai].map((t) => (
                    <Btn key={t} variant={t === "tu_choi" ? "danger" : t === "duyet" || (d.trang_thai === "moi" && t === "da_lien_he") ? "primary" : "secondary"}
                         disabled={ban} onClick={() => { void luu(d, { trang_thai: t }); }}>{NHAN_NUT[t]}</Btn>
                  ))}
                  {doiGhi && <Btn disabled={ban} onClick={() => { void luu(d, { ghi_chu_admin: ghi.trim() || null }); }}>Lưu ghi chú</Btn>}
                  {d.xu_ly_luc && <span className="ml-auto text-xs text-mute">Xử lý lần cuối {luc(d.xu_ly_luc)}{d.xu_ly_boi ? ` · ${d.xu_ly_boi}` : ""}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
