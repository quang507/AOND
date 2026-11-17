"use client";
// Khu môi giới trong /quan-ly (SRS-5.1zzzzzzz524, chủ dự án 17/11/2026: "nối ba thứ thành một … môi giới đem khách về").
// - Chưa kích hoạt: ô nhập mã kích hoạt (admin gửi sau khi duyệt đăng ký) → rpc `noi_moi_gioi` nối tài khoản web này với hồ sơ môi giới
//   (và với Zalo, nếu môi giới đã nhắn mã cho trợ lý) — tin gửi qua Zalo và tin đăng ở đây về chung một chỗ.
// - Đã kích hoạt: mã môi giới, chuẩn của chính mình (`toi_la_moi_gioi`), gửi khách cần mua / thuê (`gui_khach_gioi_thieu`) và theo dõi
//   từng khách kèm nhật ký. Chưa có mức chi cho khách giới thiệu — trang không hứa con số nào.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { zaloLink } from "@/lib/format";
import { COT_KHACH, MUC_CHI_MAC_DINH, TRANG_THAI_KHACH, chuanSoDienThoai, phanTram, tienDong, type HoSoMoiGioi, type KhachGioiThieu, type MucChiMG, type NhatKyKhach } from "@/lib/moi-gioi";

const O = "w-full rounded-lg border border-line bg-white px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-brand";
const NHAN = "mb-1 block text-xs font-semibold text-mute";
const luc = (s: string) => new Date(s).toLocaleString("vi-VN", { hour12: false });

const LOI_NOI: Record<string, string> = {
  ma: "Mã chưa đúng, hoặc đăng ký chưa được duyệt. Anh chị kiểm lại mã bên em đã gửi.",
  da_noi_web: "Mã này đã được kích hoạt bằng một tài khoản web khác.",
  tai_khoan_da_noi: "Tài khoản này đã nối với một mã môi giới khác.",
  dang_nhap: "Anh chị đăng nhập lại rồi thử lần nữa.",
};
const LOI_KHACH: Record<string, string> = {
  chua_kich_hoat: "Tài khoản chưa kích hoạt môi giới.",
  ten_khach: "Tên khách cần từ 2 đến 80 ký tự.",
  so_dien_thoai: "Số điện thoại khách chưa đúng. Ví dụ: 0901 234 567.",
  nhu_cau: "Chọn khách cần mua hay cần thuê.",
  dong_y: "Anh chị xác nhận khách đã đồng ý cho chuyển thông tin.",
  qua_dai: "Có ô ghi dài quá, anh chị rút gọn giúp em.",
  trung: "Khách này đã có trong hệ thống và đang được chăm sóc.",
  qua_nhieu: "Hôm nay anh chị đã gửi 30 khách. Mai gửi tiếp giúp em.",
};

export default function KhuMoiGioi() {
  const [hoSo, setHoSo] = useState<HoSoMoiGioi | null | undefined>(undefined);
  const [ma, setMa] = useState("");
  const [loiMa, setLoiMa] = useState("");
  const [ban, setBan] = useState(false);
  const [khach, setKhach] = useState<KhachGioiThieu[]>([]);
  const [nhatKy, setNhatKy] = useState<NhatKyKhach[]>([]);
  const [mo, setMo] = useState<string | null>(null);
  const [moForm, setMoForm] = useState(false);
  const [f, setF] = useState({ ten: "", sdt: "", nhuCau: "mua" as "mua" | "thue", khu: "", ngan: "", tin: "", ghi: "", dongY: false });
  const [loiKhach, setLoiKhach] = useState("");
  const [baoKhach, setBaoKhach] = useState("");
  const [loiNhan, setLoiNhan] = useState<Record<string, string>>({});
  const [mucChi, setMucChi] = useState<MucChiMG>(MUC_CHI_MAC_DINH);

  const napKhach = useCallback(async () => {
    const { data: ks } = await supabase.from("khach_gioi_thieu").select(COT_KHACH).order("created_at", { ascending: false }).limit(200);
    const ds = (ks ?? []) as unknown as KhachGioiThieu[];   // cột chọn bằng chuỗi ghép (COT_KHACH) nên kiểu suy ra không dùng được
    setKhach(ds);
    if (ds.length) {
      const { data: nk } = await supabase.from("khach_gioi_thieu_nhat_ky").select("id, khach_id, luc, vai, ai, viec, ghi_chu")
        .in("khach_id", ds.map((k) => k.id)).order("luc", { ascending: false }).limit(1000);
      setNhatKy((nk ?? []) as NhatKyKhach[]);
    }
  }, []);

  const nap = useCallback(async () => {
    const { data } = await supabase.rpc("toi_la_moi_gioi");
    const h = (data ?? null) as HoSoMoiGioi | null;
    setHoSo(h);
    if (h?.ma_moi_gioi) {
      const { data: mc } = await supabase.from("cau_hinh_moi_gioi").select("ty_le_ban, ty_le_thue").eq("id", 1).maybeSingle();
      if (mc) setMucChi({ ty_le_ban: Number(mc.ty_le_ban), ty_le_thue: Number(mc.ty_le_thue) });
      await napKhach();
    }
  }, [napKhach]);

  useEffect(() => { void nap(); }, [nap]);

  const kichHoat = async (e: FormEvent) => {
    e.preventDefault();
    if (!ma.trim()) return setLoiMa("Anh chị nhập mã kích hoạt bên em đã gửi.");
    setBan(true);
    const { data, error } = await supabase.rpc("noi_moi_gioi", { p_ma: ma.trim() });
    setBan(false);
    const kq = data as { ok?: boolean; loi?: string } | null;
    if (error || !kq) return setLoiMa("Chưa kích hoạt được, có thể do mạng. Anh chị thử lại.");
    if (!kq.ok) return setLoiMa(LOI_NOI[kq.loi ?? ""] ?? "Chưa kích hoạt được. Anh chị nhắn Zalo cho em để kiểm.");
    location.reload(); // tin gửi qua Zalo vừa gộp về tài khoản này — nạp lại cả trang
  };

  const guiKhach = async (e: FormEvent) => {
    e.preventDefault();
    setBaoKhach("");
    if (f.ten.trim().length < 2) return setLoiKhach(LOI_KHACH.ten_khach);
    if (!chuanSoDienThoai(f.sdt)) return setLoiKhach(LOI_KHACH.so_dien_thoai);
    if (!f.dongY) return setLoiKhach(LOI_KHACH.dong_y);
    setBan(true);
    const { data, error } = await supabase.rpc("gui_khach_gioi_thieu", {
      p: { ten_khach: f.ten, so_dien_thoai: f.sdt, nhu_cau: f.nhuCau, khu_vuc: f.khu, ngan_sach: f.ngan, ma_tin: f.tin, ghi_chu: f.ghi, dong_y: true },
    });
    setBan(false);
    const kq = data as { ok?: boolean; loi?: string } | null;
    if (error || !kq) return setLoiKhach("Chưa gửi được, có thể do mạng. Anh chị bấm gửi lại.");
    if (!kq.ok) return setLoiKhach(LOI_KHACH[kq.loi ?? ""] ?? "Chưa gửi được. Anh chị xem lại các ô.");
    setLoiKhach("");
    setBaoKhach(`Em đã nhận khách ${f.ten.trim()}. Người phụ trách sẽ liên hệ khách, anh chị theo dõi ở danh sách bên dưới.`);
    setF({ ten: "", sdt: "", nhuCau: "mua", khu: "", ngan: "", tin: "", ghi: "", dongY: false });
    setMoForm(false);
    await napKhach();
  };

  const ghiThem = async (id: string) => {
    const loi = (loiNhan[id] ?? "").trim();
    if (!loi) return;
    setBan(true);
    const { data } = await supabase.rpc("cap_nhat_khach_gioi_thieu", { p_id: id, p_trang_thai: null, p_ghi_chu: loi });
    setBan(false);
    if ((data as { ok?: boolean } | null)?.ok) {
      setLoiNhan((n) => ({ ...n, [id]: "" }));
      await napKhach();
    }
  };

  if (hoSo === undefined) return null;

  if (!hoSo?.ma_moi_gioi) {
    return (
      <section className="mt-6 rounded-king border border-line bg-white p-5">
        <h2 className="font-bold">Kích hoạt tài khoản môi giới</h2>
        <p className="mt-1 text-sm text-mute">
          Sau khi đăng ký được duyệt, bên em gửi anh chị một mã kích hoạt qua Zalo. Nhập mã ở đây để tin anh chị gửi qua Zalo hiện chung
          trong trang này và để gửi khách cần mua, thuê. Chưa đăng ký thì <Link href="/moi-gioi/dang-ky" className="font-semibold text-brand hover:underline">đăng ký ở đây</Link>.
        </p>
        <form onSubmit={kichHoat} className="mt-3 flex flex-wrap items-start gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Mã kích hoạt</span>
            <input value={ma} onChange={(e) => { setMa(e.target.value); setLoiMa(""); }} placeholder="AOND-XXXXXXXXXX" autoComplete="off" spellCheck={false}
                   aria-invalid={!!loiMa} aria-describedby={loiMa ? "loi-ma-kich-hoat" : undefined} className={`${O} uppercase`} />
          </label>
          <button type="submit" disabled={ban} className="rounded-md bg-brand px-6 py-2.5 font-bold text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60">
            {ban ? "Đang kiểm…" : "Kích hoạt"}
          </button>
        </form>
        {loiMa && <p id="loi-ma-kich-hoat" role="alert" className="mt-2 text-sm font-medium text-red-700">{loiMa}</p>}
      </section>
    );
  }

  const c = hoSo.chuan;
  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-king border border-line bg-white p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-bold">Môi giới {hoSo.ten ?? ""}</h2>
          <span className="rounded-md bg-navy px-2 py-0.5 text-xs font-bold text-white tabular-nums">{hoSo.ma_moi_gioi}</span>
          {c && <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${c.dat_chuan ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {c.dat_chuan ? "Đạt chuẩn mạng lưới" : "Chưa đạt chuẩn mạng lưới"}</span>}
        </div>
        {c && (
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-mute">Tin đang rao</dt><dd className="text-xl font-bold text-navy tabular-nums">{c.dang_rao}<span className="text-xs font-semibold text-mute"> / 10</span></dd></div>
            <div><dt className="text-xs text-mute">Chốt trong 6 tháng</dt><dd className="text-xl font-bold text-navy tabular-nums">{c.chot_6_thang}</dd></div>
            <div><dt className="text-xs text-mute">Tỷ lệ chốt</dt><dd className="text-xl font-bold text-navy tabular-nums">{c.ty_le_chot}%<span className="text-xs font-semibold text-mute"> / 5%</span></dd></div>
          </dl>
        )}
        {!hoSo.co_zalo && (
          <p className="mt-3 text-sm text-mute">
            Zalo chưa nối: anh chị nhắn mã kích hoạt cho trợ lý trên{" "}
            <a href={zaloLink("nmg-apply")} className="font-semibold text-brand hover:underline">Zalo</a> để căn gửi qua Zalo hiện ở đây.
          </p>
        )}
      </div>

      <div className="rounded-king border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Khách anh chị giới thiệu <span className="font-normal text-mute tabular-nums">({khach.length})</span></h2>
          <button type="button" onClick={() => { setMoForm((v) => !v); setBaoKhach(""); }}
                  className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand">
            {moForm ? "Đóng" : "Gửi khách mới"}
          </button>
        </div>
        {/* SRS-5.1zzzzzzz525: mức chi công bố — tỷ lệ đọc từ DB, admin chỉnh được. */}
        <p className="mt-2 text-sm text-mute">
          Khách anh chị giới thiệu chốt thành công: anh chị nhận <strong className="text-navy">{phanTram(mucChi.ty_le_ban)}</strong> phí công ty thu được
          với giao dịch mua bán{mucChi.ty_le_thue === mucChi.ty_le_ban ? " và cho thuê" : <>, <strong className="text-navy">{phanTram(mucChi.ty_le_thue)}</strong> với giao dịch cho thuê</>}.
          Chi sau khi công ty thu đủ phí; số tiền là trước thuế thu nhập cá nhân.
        </p>
        {baoKhach && <p role="status" className="mt-2 text-sm font-medium text-navy">{baoKhach}</p>}

        {moForm && (
          <form onSubmit={guiKhach} noValidate className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <label><span className={NHAN}>Tên khách <span aria-hidden>*</span></span>
              <input value={f.ten} maxLength={80} onChange={(e) => setF({ ...f, ten: e.target.value })} className={O} /></label>
            <label><span className={NHAN}>Số điện thoại khách <span aria-hidden>*</span></span>
              <input type="tel" inputMode="tel" value={f.sdt} maxLength={16} placeholder="0901 234 567" onChange={(e) => setF({ ...f, sdt: e.target.value })} className={O} /></label>
            <label><span className={NHAN}>Khách cần <span aria-hidden>*</span></span>
              <select value={f.nhuCau} onChange={(e) => setF({ ...f, nhuCau: e.target.value as "mua" | "thue" })} className={O}>
                <option value="mua">Mua</option><option value="thue">Thuê</option>
              </select></label>
            <label><span className={NHAN}>Khu vực khách tìm</span>
              <input value={f.khu} maxLength={120} placeholder="Ví dụ: Quận 5, gần chợ An Đông" onChange={(e) => setF({ ...f, khu: e.target.value })} className={O} /></label>
            <label><span className={NHAN}>Ngân sách</span>
              <input value={f.ngan} maxLength={60} placeholder="Ví dụ: 5 đến 6 tỷ" onChange={(e) => setF({ ...f, ngan: e.target.value })} className={O} /></label>
            <label><span className={NHAN}>Mã tin khách quan tâm (nếu có)</span>
              <input value={f.tin} maxLength={40} onChange={(e) => setF({ ...f, tin: e.target.value })} className={`${O} uppercase`} /></label>
            <label className="sm:col-span-2"><span className={NHAN}>Dặn thêm</span>
              <textarea rows={2} maxLength={500} value={f.ghi} onChange={(e) => setF({ ...f, ghi: e.target.value })} className={O} /></label>
            <label className="flex items-start gap-2.5 text-sm text-navy sm:col-span-2">
              <input type="checkbox" checked={f.dongY} onChange={(e) => setF({ ...f, dongY: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
              <span>Khách đã đồng ý để tôi chuyển tên và số điện thoại cho AI Ơi Nhà Đất liên hệ tư vấn.</span>
            </label>
            {loiKhach && <p role="alert" className="text-sm font-medium text-red-700 sm:col-span-2">{loiKhach}</p>}
            <div className="sm:col-span-2">
              <button type="submit" disabled={ban} className="rounded-md bg-brand px-6 py-2.5 font-bold text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60">
                {ban ? "Đang gửi…" : "Gửi khách"}
              </button>
            </div>
          </form>
        )}

        {khach.length === 0 ? (
          <p className="mt-3 text-sm text-mute">Chưa có khách nào. Có khách cần mua hay thuê, anh chị bấm “Gửi khách mới”; người phụ trách bên em sẽ liên hệ và anh chị thấy từng bước ở đây.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {khach.map((k) => {
              const nk = nhatKy.filter((n) => n.khach_id === k.id);
              return (
                <li key={k.id} className="py-3">
                  <button type="button" onClick={() => setMo((m) => (m === k.id ? null : k.id))} aria-expanded={mo === k.id}
                          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left">
                    <span className="font-semibold text-navy">{k.ten_khach}</span>
                    <span className="text-sm text-mute tabular-nums">{k.so_dien_thoai}</span>
                    <span className="text-sm text-mute">{k.nhu_cau === "thue" ? "Cần thuê" : "Cần mua"}{k.khu_vuc ? ` · ${k.khu_vuc}` : ""}</span>
                    <span className={`ml-auto rounded-md px-2 py-0.5 text-xs font-semibold ${
                      k.trang_thai === "chot" ? "bg-emerald-50 text-emerald-800" : k.trang_thai === "khong_thanh" ? "bg-cream text-mute" : "bg-brand/10 text-brand"}`}>
                      {TRANG_THAI_KHACH[k.trang_thai]}
                    </span>
                  </button>
                  {k.hoa_hong_vnd != null && (
                    <p className="mt-1 text-sm text-navy">
                      Phần của anh chị: <strong className="tabular-nums">{tienDong(k.hoa_hong_vnd)}</strong>{" "}
                      <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${k.hoa_hong_trang_thai === "da_chi" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                        {k.hoa_hong_trang_thai === "da_chi" ? `Đã chi ${k.hoa_hong_chi_luc ? luc(k.hoa_hong_chi_luc) : ""}` : "Chờ công ty thu đủ phí"}
                      </span>
                    </p>
                  )}
                  {mo === k.id && (
                    <div className="mt-2 rounded-lg bg-cream/50 p-3">
                      <ol className="space-y-2">
                        {nk.map((n) => (
                          <li key={n.id} className="text-sm">
                            <span className="font-semibold text-navy">{n.viec}</span>
                            <span className="text-mute"> · {n.vai === "admin" ? "AI Ơi Nhà Đất" : n.ai} · {luc(n.luc)}</span>
                            {n.ghi_chu && <p className="break-words text-navy">{n.ghi_chu}</p>}
                          </li>
                        ))}
                      </ol>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <label className="min-w-0 flex-1"><span className="sr-only">Nhắn thêm cho người phụ trách</span>
                          <input value={loiNhan[k.id] ?? ""} maxLength={500} placeholder="Nhắn thêm cho người phụ trách" onChange={(e) => setLoiNhan((n) => ({ ...n, [k.id]: e.target.value }))}
                                 className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm" /></label>
                        <button type="button" disabled={ban || !(loiNhan[k.id] ?? "").trim()} onClick={() => { void ghiThem(k.id); }}
                                className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand disabled:opacity-50">Gửi</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
