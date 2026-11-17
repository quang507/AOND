"use client";
// /admin/khach-gioi-thieu — khách mua / thuê do môi giới gửi từ /quan-ly (SRS-5.1zzzzzzz524 / 525, chủ dự án 17/11/2026: "môi giới đem khách về",
// "đưa số hợp lý trước chỉnh sau"). Admin tiếp nhận, liên hệ khách, đổi trạng thái; mỗi lần đổi là một dòng nhật ký và MÔI GIỚI ĐỌC ĐƯỢC nhật ký
// đó. Chốt thì nhập phí công ty thu → hệ thống tính phần môi giới theo tỷ lệ ở đầu trang (`cau_hinh_moi_gioi`); thu đủ phí rồi bấm "Đã chi".

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { IconRefresh } from "@/components/icons";
import { Badge, Btn } from "@/components/ui";
import {
  COT_KHACH, MUC_CHI_MAC_DINH, THU_TU_KHACH, TRANG_THAI_KHACH, phanTram, tienDong,
  type KhachGioiThieu, type MucChiMG, type NhatKyKhach, type TrangThaiKhach,
} from "@/lib/moi-gioi";

type Dong = KhachGioiThieu & { sellers: { name: string | null; ma_moi_gioi: string | null } | null };
type FormChot = { loai: "ban" | "thue"; phi: string; gia: string };
const luc = (s: string) => new Date(s).toLocaleString("vi-VN", { hour12: false });
const TONE: Record<TrangThaiKhach, "info" | "warn" | "ok" | "neutral"> = {
  moi: "info", da_tiep_nhan: "warn", dang_cham_soc: "warn", da_xem_nha: "warn", chot: "ok", khong_thanh: "neutral",
};
// Bước kế hợp lý cho từng trạng thái ("chot" mở form chốt, không đổi thẳng).
const BUOC_KE: Record<TrangThaiKhach, TrangThaiKhach[]> = {
  moi: ["da_tiep_nhan", "khong_thanh"],
  da_tiep_nhan: ["dang_cham_soc", "khong_thanh"],
  dang_cham_soc: ["da_xem_nha", "chot", "khong_thanh"],
  da_xem_nha: ["chot", "dang_cham_soc", "khong_thanh"],
  chot: ["dang_cham_soc"],
  khong_thanh: ["moi"],
};
const NHAN_NUT: Record<TrangThaiKhach, string> = {
  moi: "Mở lại", da_tiep_nhan: "Tiếp nhận", dang_cham_soc: "Đang chăm sóc", da_xem_nha: "Đã xem nhà", chot: "Chốt…", khong_thanh: "Không thành",
};
const LOI: Record<string, string> = {
  phi: "Phí công ty thu phải lớn hơn 0.",
  gia: "Giá chốt phải lớn hơn phí công ty thu.",
  da_chi: "Khách này đã chi cho môi giới, không đổi trạng thái được nữa.",
  chua_chot: "Khách chưa ở trạng thái chốt chờ thu phí.",
  dung_form_chot: "Chốt phải nhập phí công ty thu.",
};
/** "50" / "7,5" (triệu đồng) → đồng; không đọc được → null. */
const trieu = (s: string): number | null => {
  const x = Number(s.trim().replace(/\./g, "").replace(",", "."));
  return s.trim() && Number.isFinite(x) && x > 0 ? Math.round(x * 1_000_000) : null;
};
const O = "w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none focus:border-brand";

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [email, setEmail] = useState("");
  const [dong, setDong] = useState<Dong[]>([]);
  const [nhatKy, setNhatKy] = useState<NhatKyKhach[]>([]);
  const [loc, setLoc] = useState<TrangThaiKhach | "tat_ca">("moi");
  const [loi, setLoi] = useState<string | null>(null);
  const [ban, setBan] = useState<string | null>(null);
  const [ghi, setGhi] = useState<Record<string, string>>({});
  const [mucChi, setMucChi] = useState<MucChiMG>(MUC_CHI_MAC_DINH);
  const [suaMuc, setSuaMuc] = useState<{ ban: string; thue: string } | null>(null);
  const [chot, setChot] = useState<Record<string, FormChot>>({});
  const [xacNhanChi, setXacNhanChi] = useState<string | null>(null);

  const nap = async () => {
    const [{ data, error }, { data: mc }] = await Promise.all([
      supabase.from("khach_gioi_thieu").select(`${COT_KHACH}, sellers(name, ma_moi_gioi)`).order("created_at", { ascending: false }).limit(500),
      supabase.from("cau_hinh_moi_gioi").select("ty_le_ban, ty_le_thue").eq("id", 1).maybeSingle(),
    ]);
    if (error) { setLoi(error.message); return; }
    setLoi(null);
    if (mc) setMucChi({ ty_le_ban: Number(mc.ty_le_ban), ty_le_thue: Number(mc.ty_le_thue) });
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
      setEmail(user.email ?? "");
      setRole("admin");
      await nap();
    });
  }, []);

  const dem = useMemo(() => Object.fromEntries(THU_TU_KHACH.map((t) => [t, dong.filter((d) => d.trang_thai === t).length])) as Record<TrangThaiKhach, number>, [dong]);
  const danhSach = loc === "tat_ca" ? dong : dong.filter((d) => d.trang_thai === loc);
  const choChi = dong.filter((d) => d.hoa_hong_trang_thai === "cho_thu_phi").reduce((s, d) => s + (d.hoa_hong_vnd ?? 0), 0);

  const xong = async (id: string, kq: { ok?: boolean; loi?: string } | null, error: { message: string } | null) => {
    setBan(null);
    if (error || !kq?.ok) { setLoi(`Chưa lưu được: ${LOI[kq?.loi ?? ""] ?? error?.message ?? kq?.loi ?? "không rõ"}`); return false; }
    setGhi((g) => ({ ...g, [id]: "" }));
    await nap();
    return true;
  };

  const capNhat = async (d: Dong, trangThai: TrangThaiKhach | null) => {
    const loiGhi = (ghi[d.id] ?? "").trim();
    if (!trangThai && !loiGhi) return;
    setBan(d.id);
    const { data, error } = await supabase.rpc("cap_nhat_khach_gioi_thieu", { p_id: d.id, p_trang_thai: trangThai, p_ghi_chu: loiGhi || null });
    await xong(d.id, data as { ok?: boolean; loi?: string } | null, error);
  };

  const guiChot = async (d: Dong) => {
    const f = chot[d.id];
    const phi = f ? trieu(f.phi) : null;
    const gia = f && f.gia.trim() ? trieu(f.gia) : null;
    if (!f || !phi) { setLoi(`Chưa lưu được: ${LOI.phi}`); return; }
    if (f.gia.trim() && (!gia || gia < phi)) { setLoi(`Chưa lưu được: ${LOI.gia}`); return; }
    setBan(d.id);
    const { data, error } = await supabase.rpc("chot_khach_gioi_thieu", {
      p_id: d.id, p_loai: f.loai, p_phi_cong_ty: phi, p_gia_chot: gia, p_ghi_chu: (ghi[d.id] ?? "").trim() || null,
    });
    if (await xong(d.id, data as { ok?: boolean; loi?: string } | null, error)) setChot((c) => { const m = { ...c }; delete m[d.id]; return m; });
  };

  const daChi = async (d: Dong) => {
    setBan(d.id);
    const { data, error } = await supabase.rpc("chi_hoa_hong_khach_gioi_thieu", { p_id: d.id, p_ghi_chu: (ghi[d.id] ?? "").trim() || null });
    setXacNhanChi(null);
    await xong(d.id, data as { ok?: boolean; loi?: string } | null, error);
  };

  const luuMuc = async () => {
    if (!suaMuc) return;
    const b = Number(suaMuc.ban.replace(",", ".")), t = Number(suaMuc.thue.replace(",", "."));
    if (![b, t].every((x) => Number.isFinite(x) && x >= 0 && x <= 100)) { setLoi("Tỷ lệ phải là số từ 0 đến 100."); return; }
    const { error } = await supabase.from("cau_hinh_moi_gioi")
      .update({ ty_le_ban: b / 100, ty_le_thue: t / 100, cap_nhat_luc: new Date().toISOString(), cap_nhat_boi: email }).eq("id", 1);
    if (error) { setLoi(`Chưa lưu được mức chi: ${error.message}`); return; }
    setLoi(null);
    setMucChi({ ty_le_ban: b / 100, ty_le_thue: t / 100 });
    setSuaMuc(null);
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

      <div className="mt-3 rounded-lg border border-line bg-white px-4 py-3 text-sm">
        {suaMuc ? (
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="mb-1 block text-xs font-semibold text-mute">Mua bán (% phí công ty thu)</span>
              <input inputMode="decimal" value={suaMuc.ban} onChange={(e) => setSuaMuc({ ...suaMuc, ban: e.target.value })} className={`${O} w-28`} /></label>
            <label><span className="mb-1 block text-xs font-semibold text-mute">Cho thuê (% phí công ty thu)</span>
              <input inputMode="decimal" value={suaMuc.thue} onChange={(e) => setSuaMuc({ ...suaMuc, thue: e.target.value })} className={`${O} w-28`} /></label>
            <Btn variant="primary" onClick={() => { void luuMuc(); }}>Lưu mức chi</Btn>
            <Btn onClick={() => setSuaMuc(null)}>Thôi</Btn>
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-navy">
            <span>Mức chi cho môi giới: <strong>{phanTram(mucChi.ty_le_ban)}</strong> phí công ty thu (mua bán) · <strong>{phanTram(mucChi.ty_le_thue)}</strong> (cho thuê).</span>
            <button type="button" className="text-xs font-semibold text-brand hover:underline"
                    onClick={() => setSuaMuc({ ban: String(Math.round(mucChi.ty_le_ban * 1000) / 10), thue: String(Math.round(mucChi.ty_le_thue * 1000) / 10) })}>Chỉnh</button>
            {choChi > 0 && <span className="ml-auto text-mute">Đang chờ chi: <strong className="text-navy tabular-nums">{tienDong(choChi)}</strong></span>}
          </p>
        )}
        <p className="mt-1 text-xs text-mute">Đổi mức chỉ áp cho khách chốt từ lúc đổi; khách đã chốt giữ mức lúc chốt. Môi giới thấy mức này ở trang của họ và ở trang đăng ký.</p>
      </div>

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
            const f = chot[d.id];
            const phiXem = f ? trieu(f.phi) : null;
            const tl = f?.loai === "thue" ? mucChi.ty_le_thue : mucChi.ty_le_ban;
            const daChiRoi = d.hoa_hong_trang_thai === "da_chi";
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

                {d.hoa_hong_vnd != null && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-cream/50 px-3 py-2 text-sm text-navy">
                    <span>Phí công ty thu <strong className="tabular-nums">{tienDong(d.phi_cong_ty_vnd)}</strong></span>
                    <span>Phần môi giới <strong className="tabular-nums">{tienDong(d.hoa_hong_vnd)}</strong> ({phanTram(d.hoa_hong_ty_le ?? 0)})</span>
                    <Badge tone={daChiRoi ? "ok" : "warn"}>{daChiRoi ? `Đã chi ${d.hoa_hong_chi_luc ? luc(d.hoa_hong_chi_luc) : ""}` : "Chờ thu đủ phí"}</Badge>
                    {!daChiRoi && (xacNhanChi === d.id
                      ? <span className="ml-auto flex flex-wrap items-center gap-2">
                          <span className="text-xs text-mute">Đánh dấu này không hoàn lại được.</span>
                          <Btn variant="primary" disabled={dangBan} onClick={() => { void daChi(d); }}>Xác nhận đã chuyển {tienDong(d.hoa_hong_vnd)}</Btn>
                          <Btn disabled={dangBan} onClick={() => setXacNhanChi(null)}>Thôi</Btn>
                        </span>
                      : <Btn className="ml-auto" disabled={dangBan} onClick={() => setXacNhanChi(d.id)}>Đã chi cho môi giới</Btn>)}
                  </div>
                )}

                <ol className="mt-3 space-y-1.5 border-l-2 border-line pl-3">
                  {nk.map((n) => (
                    <li key={n.id} className="text-sm">
                      <span className="font-semibold text-navy">{n.viec}</span>
                      <span className="text-mute"> · {n.ai} · {luc(n.luc)}</span>
                      {n.ghi_chu && <p className="break-words text-navy">{n.ghi_chu}</p>}
                    </li>
                  ))}
                </ol>

                {f && (
                  <div className="mt-3 rounded-md border border-brand/40 bg-white px-3 py-3">
                    <p className="text-sm font-bold text-navy">Chốt giao dịch</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      <label><span className="mb-1 block text-xs font-semibold text-mute">Loại giao dịch</span>
                        <select value={f.loai} onChange={(e) => setChot((c) => ({ ...c, [d.id]: { ...f, loai: e.target.value as "ban" | "thue" } }))} className={O}>
                          <option value="ban">Mua bán</option><option value="thue">Cho thuê</option>
                        </select></label>
                      <label><span className="mb-1 block text-xs font-semibold text-mute">Phí công ty thu (triệu đồng) *</span>
                        <input inputMode="decimal" placeholder="Ví dụ: 50" value={f.phi} onChange={(e) => setChot((c) => ({ ...c, [d.id]: { ...f, phi: e.target.value } }))} className={O} /></label>
                      <label><span className="mb-1 block text-xs font-semibold text-mute">{f.loai === "thue" ? "Tiền thuê một tháng" : "Giá chốt"} (triệu đồng)</span>
                        <input inputMode="decimal" placeholder={f.loai === "thue" ? "Ví dụ: 10" : "Ví dụ: 5000"} value={f.gia} onChange={(e) => setChot((c) => ({ ...c, [d.id]: { ...f, gia: e.target.value } }))} className={O} /></label>
                    </div>
                    <p className="mt-2 text-sm text-navy">
                      {phiXem
                        ? <>Phí {tienDong(phiXem)} → phần môi giới <strong className="tabular-nums">{tienDong(Math.round((phiXem * tl) / 1000) * 1000)}</strong> ({phanTram(tl)}), chi sau khi thu đủ phí.</>
                        : <span className="text-mute">Nhập phí công ty thu để xem phần môi giới.</span>}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Btn variant="primary" disabled={dangBan || !phiXem} onClick={() => { void guiChot(d); }}>Xác nhận chốt</Btn>
                      <Btn disabled={dangBan} onClick={() => setChot((c) => { const m = { ...c }; delete m[d.id]; return m; })}>Thôi</Btn>
                    </div>
                  </div>
                )}

                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold text-mute">Ghi chú kèm (môi giới đọc được)</span>
                  <textarea rows={2} maxLength={1000} value={ghi[d.id] ?? ""} onChange={(e) => setGhi((g) => ({ ...g, [d.id]: e.target.value }))} className={O} />
                </label>
                {!daChiRoi && !f && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {BUOC_KE[d.trang_thai].map((t, i) => (
                      <Btn key={t} variant={t === "khong_thanh" ? "danger" : i === 0 ? "primary" : "secondary"} disabled={dangBan}
                           onClick={() => (t === "chot" ? setChot((c) => ({ ...c, [d.id]: { loai: d.nhu_cau === "thue" ? "thue" : "ban", phi: "", gia: "" } })) : void capNhat(d, t))}>
                        {NHAN_NUT[t]}</Btn>
                    ))}
                    {(ghi[d.id] ?? "").trim() && <Btn disabled={dangBan} onClick={() => { void capNhat(d, null); }}>Chỉ lưu ghi chú</Btn>}
                  </div>
                )}
                {daChiRoi && (ghi[d.id] ?? "").trim() && <div className="mt-2"><Btn disabled={dangBan} onClick={() => { void capNhat(d, null); }}>Chỉ lưu ghi chú</Btn></div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
