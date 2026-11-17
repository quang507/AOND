"use client";
// /admin/khach-gioi-thieu — khách mua / thuê do môi giới gửi từ /quan-ly (SRS-5.1zzzzzzz524, chủ dự án 17/11/2026: "môi giới đem khách về").
// Admin tiếp nhận, liên hệ khách, đổi trạng thái; mỗi lần đổi là một dòng nhật ký (rpc `cap_nhat_khach_gioi_thieu`) và MÔI GIỚI ĐỌC ĐƯỢC
// nhật ký đó ở trang của họ — ghi chú ở đây là lời nói với môi giới, không phải ghi chú kín.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { IconRefresh } from "@/components/icons";
import { Badge, Btn } from "@/components/ui";
import { THU_TU_KHACH, TRANG_THAI_KHACH, type KhachGioiThieu, type NhatKyKhach, type TrangThaiKhach } from "@/lib/moi-gioi";

type Dong = KhachGioiThieu & { sellers: { name: string | null; ma_moi_gioi: string | null } | null };
const luc = (s: string) => new Date(s).toLocaleString("vi-VN", { hour12: false });
const TONE: Record<TrangThaiKhach, "info" | "warn" | "ok" | "neutral"> = {
  moi: "info", da_tiep_nhan: "warn", dang_cham_soc: "warn", da_xem_nha: "warn", chot: "ok", khong_thanh: "neutral",
};
// Bước kế hợp lý cho từng trạng thái.
const BUOC_KE: Record<TrangThaiKhach, TrangThaiKhach[]> = {
  moi: ["da_tiep_nhan", "khong_thanh"],
  da_tiep_nhan: ["dang_cham_soc", "khong_thanh"],
  dang_cham_soc: ["da_xem_nha", "chot", "khong_thanh"],
  da_xem_nha: ["chot", "dang_cham_soc", "khong_thanh"],
  chot: ["dang_cham_soc"],
  khong_thanh: ["moi"],
};
const NHAN_NUT: Record<TrangThaiKhach, string> = {
  moi: "Mở lại", da_tiep_nhan: "Tiếp nhận", dang_cham_soc: "Đang chăm sóc", da_xem_nha: "Đã xem nhà", chot: "Chốt", khong_thanh: "Không thành",
};

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [dong, setDong] = useState<Dong[]>([]);
  const [nhatKy, setNhatKy] = useState<NhatKyKhach[]>([]);
  const [loc, setLoc] = useState<TrangThaiKhach | "tat_ca">("moi");
  const [loi, setLoi] = useState<string | null>(null);
  const [ban, setBan] = useState<string | null>(null);
  const [ghi, setGhi] = useState<Record<string, string>>({});

  const nap = async () => {
    const { data, error } = await supabase.from("khach_gioi_thieu")
      .select("id, created_at, seller_id, ten_khach, so_dien_thoai, nhu_cau, khu_vuc, ngan_sach, ma_tin, ghi_chu, trang_thai, nguoi_phu_trach, cap_nhat_luc, sellers(name, ma_moi_gioi)")
      .order("created_at", { ascending: false }).limit(500);
    if (error) { setLoi(error.message); return; }
    setLoi(null);
    const ds = (data ?? []) as unknown as Dong[];
    setDong(ds);
    if (ds.length) {
      const { data: nk } = await supabase.from("khach_gioi_thieu_nhat_ky").select("id, khach_id, luc, vai, ai, viec, ghi_chu")
        .in("khach_id", ds.map((d) => d.id)).order("luc", { ascending: false }).limit(2000);
      setNhatKy((nk ?? []) as NhatKyKhach[]);
    } else setNhatKy([]);
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

  const dem = useMemo(() => Object.fromEntries(THU_TU_KHACH.map((t) => [t, dong.filter((d) => d.trang_thai === t).length])) as Record<TrangThaiKhach, number>, [dong]);
  const danhSach = loc === "tat_ca" ? dong : dong.filter((d) => d.trang_thai === loc);

  const capNhat = async (d: Dong, trangThai: TrangThaiKhach | null) => {
    const loiGhi = (ghi[d.id] ?? "").trim();
    if (!trangThai && !loiGhi) return;
    setBan(d.id);
    const { data, error } = await supabase.rpc("cap_nhat_khach_gioi_thieu", { p_id: d.id, p_trang_thai: trangThai, p_ghi_chu: loiGhi || null });
    setBan(null);
    const kq = data as { ok?: boolean; loi?: string } | null;
    if (error || !kq?.ok) { setLoi(`Chưa lưu được: ${error?.message ?? kq?.loi ?? "không rõ"}`); return; }
    setGhi((g) => ({ ...g, [d.id]: "" }));
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
      <h1 className="text-xl font-bold text-navy">Khách môi giới gửi</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-mute">
        Môi giới đã kích hoạt gửi khách cần mua, thuê từ trang quản lý của họ. Tiếp nhận rồi liên hệ khách qua số bên dưới. Mỗi lần đổi trạng
        thái hay ghi chú đều vào nhật ký, và <strong>môi giới đọc được nhật ký đó</strong>.
      </p>

      {loi && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loi}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Lọc theo trạng thái">
          {THU_TU_KHACH.map((t) => (
            <button key={t} type="button" aria-pressed={loc === t} className={chip(loc === t)} onClick={() => setLoc(t)}>{TRANG_THAI_KHACH[t]} {dem[t]}</button>
          ))}
          <button type="button" aria-pressed={loc === "tat_ca"} className={chip(loc === "tat_ca")} onClick={() => setLoc("tat_ca")}>Tất cả {dong.length}</button>
        </div>
        <button type="button" onClick={() => { void nap(); }} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-navy hover:bg-cream/70">
          <IconRefresh className="h-3.5 w-3.5" /> Làm mới
        </button>
      </div>

      {danhSach.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-mute">
          {dong.length === 0 ? "Chưa môi giới nào gửi khách. Khách mới sẽ hiện ở đây ngay khi môi giới gửi." : "Không có khách nào ở trạng thái này."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {danhSach.map((d) => {
            const nk = nhatKy.filter((n) => n.khach_id === d.id);
            const dangBan = ban === d.id;
            return (
              <li key={d.id} className="rounded-lg border border-line bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-base font-bold text-navy">{d.ten_khach}</span>
                  <Badge tone={TONE[d.trang_thai]}>{TRANG_THAI_KHACH[d.trang_thai]}</Badge>
                  <Badge>{d.nhu_cau === "thue" ? "Cần thuê" : "Cần mua"}</Badge>
                  <span className="ml-auto text-xs text-mute tabular-nums">Gửi lúc {luc(d.created_at)}</span>
                </div>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Số khách</dt>
                    <dd className="font-semibold text-navy tabular-nums">{d.so_dien_thoai}{" "}
                      <a href={`https://zalo.me/${d.so_dien_thoai}`} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">Mở Zalo</a></dd></div>
                  <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Môi giới</dt>
                    <dd className="text-navy">{d.sellers?.ma_moi_gioi ?? "—"}{d.sellers?.name ? ` · ${d.sellers.name}` : ""}</dd></div>
                  {d.khu_vuc && <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Khu vực</dt><dd className="text-navy">{d.khu_vuc}</dd></div>}
                  {d.ngan_sach && <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Ngân sách</dt><dd className="text-navy">{d.ngan_sach}</dd></div>}
                  {d.ma_tin && <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Tin quan tâm</dt>
                    <dd><Link href={`/nha-dat/${d.ma_tin}`} className="font-semibold text-brand hover:underline">#{d.ma_tin}</Link></dd></div>}
                  {d.nguoi_phu_trach && <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Phụ trách</dt><dd className="text-navy">{d.nguoi_phu_trach}</dd></div>}
                </dl>
                {d.ghi_chu && <p className="mt-2 break-words text-sm text-navy">“{d.ghi_chu}”</p>}

                <ol className="mt-3 space-y-1.5 border-l-2 border-line pl-3">
                  {nk.map((n) => (
                    <li key={n.id} className="text-sm">
                      <span className="font-semibold text-navy">{n.viec}</span>
                      <span className="text-mute"> · {n.ai} · {luc(n.luc)}</span>
                      {n.ghi_chu && <p className="break-words text-navy">{n.ghi_chu}</p>}
                    </li>
                  ))}
                </ol>

                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold text-mute">Ghi chú kèm (môi giới đọc được)</span>
                  <textarea rows={2} maxLength={1000} value={ghi[d.id] ?? ""} onChange={(e) => setGhi((g) => ({ ...g, [d.id]: e.target.value }))}
                            className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm text-navy outline-none focus:border-brand" />
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {BUOC_KE[d.trang_thai].map((t, i) => (
                    <Btn key={t} variant={t === "khong_thanh" ? "danger" : i === 0 ? "primary" : "secondary"} disabled={dangBan}
                         onClick={() => { void capNhat(d, t); }}>{NHAN_NUT[t]}</Btn>
                  ))}
                  {(ghi[d.id] ?? "").trim() && <Btn disabled={dangBan} onClick={() => { void capNhat(d, null); }}>Chỉ lưu ghi chú</Btn>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
