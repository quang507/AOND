"use client";
// Form đăng ký môi giới (SRS-5.1zzzzzzz523, chủ dự án 17/11/2026: "Form trên web như HiFriendz"). Gửi qua rpc `gui_dang_ky_moi_gioi`
// (web chỉ có khoá công khai, không ghi thẳng bảng). Không thu căn cước hay tài khoản ngân hàng — chỉ đủ để bên em liên hệ lại qua Zalo.
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { zaloLink } from "@/lib/format";
import { KHU_VUC_MG, KHU_VUC_TOI_DA, KINH_NGHIEM_MG, LOAI_BDS_MG, chuanSoDienThoai } from "@/lib/moi-gioi";

type Loi = Partial<Record<"loai" | "ho_ten" | "so_dien_thoai" | "khu_vuc" | "cong_ty" | "dong_y" | "chung", string>>;

// Mã lỗi DB trả về → ô báo lỗi + lời nói với người điền.
const LOI_DB: Record<string, [keyof Loi, string]> = {
  loai: ["loai", "Anh chị chọn giúp em là môi giới cá nhân hay sàn, công ty."],
  ho_ten: ["ho_ten", "Họ tên cần từ 2 đến 80 ký tự."],
  so_dien_thoai: ["so_dien_thoai", "Số điện thoại chưa đúng. Ví dụ: 0901 234 567."],
  khu_vuc: ["khu_vuc", `Chọn từ 1 đến ${KHU_VUC_TOI_DA} khu vực.`],
  loai_bds: ["chung", "Chọn tối đa 8 loại nhà đất."],
  cong_ty: ["cong_ty", "Anh chị ghi giúp em tên sàn, công ty."],
  dong_y: ["dong_y", "Anh chị tích ô đồng ý để em được liên hệ lại."],
  qua_dai: ["chung", "Có ô ghi dài quá. Anh chị rút gọn giúp em: công ty tối đa 120 ký tự, ghi chú 500 ký tự."],
  qua_nhieu: ["chung", "Hệ thống đang nhận nhiều đăng ký. Anh chị thử lại sau ít phút, hoặc nhắn Zalo cho em."],
};

const O = "w-full rounded-lg border border-line bg-white px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-brand";
const NHAN = "mb-1 block text-xs font-semibold text-mute";
const chip = (on: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-brand ${
    on ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-brand"}`;

export default function FormDangKyMoiGioi() {
  const [loai, setLoai] = useState<"ca_nhan" | "san" | "">("");
  const [hoTen, setHoTen] = useState("");
  const [sdt, setSdt] = useState("");
  const [khu, setKhu] = useState<string[]>([]);
  const [bds, setBds] = useState<string[]>([]);
  const [congTy, setCongTy] = useState("");
  const [kinhNghiem, setKinhNghiem] = useState("");
  const [soCan, setSoCan] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [dongY, setDongY] = useState(false);
  const [loi, setLoi] = useState<Loi>({});
  const [trangThai, setTrangThai] = useState<"dien" | "gui" | "xong" | "da_co">("dien");

  const bat = (ds: string[], x: string, toiDa: number) =>
    ds.includes(x) ? ds.filter((k) => k !== x) : ds.length < toiDa ? [...ds, x] : ds;

  const gui = async (e: FormEvent) => {
    e.preventDefault();
    const l: Loi = {};
    if (!loai) l.loai = LOI_DB.loai[1];
    if (hoTen.trim().length < 2) l.ho_ten = LOI_DB.ho_ten[1];
    if (!chuanSoDienThoai(sdt)) l.so_dien_thoai = LOI_DB.so_dien_thoai[1];
    if (khu.length < 1) l.khu_vuc = LOI_DB.khu_vuc[1];
    if (loai === "san" && !congTy.trim()) l.cong_ty = LOI_DB.cong_ty[1];
    if (!dongY) l.dong_y = LOI_DB.dong_y[1];
    setLoi(l);
    if (Object.keys(l).length) return;

    setTrangThai("gui");
    const { data, error } = await supabase.rpc("gui_dang_ky_moi_gioi", {
      p: { loai, ho_ten: hoTen, so_dien_thoai: sdt, khu_vuc: khu, loai_bds: bds, cong_ty: congTy, kinh_nghiem: kinhNghiem, so_can: soCan.trim(),
           ghi_chu: ghiChu, dong_y: true },
    });
    const kq = data as { ok?: boolean; loi?: string; da_co?: boolean } | null;
    if (error || !kq) {
      setTrangThai("dien");
      setLoi({ chung: "Chưa gửi được, có thể do mạng. Anh chị bấm gửi lại, hoặc nhắn Zalo cho em." });
      return;
    }
    if (!kq.ok) {
      const [o, loiNoi] = LOI_DB[kq.loi ?? ""] ?? ["chung", "Chưa gửi được. Anh chị xem lại các ô rồi gửi lại giúp em."];
      setTrangThai("dien");
      setLoi({ [o]: loiNoi });
      return;
    }
    setTrangThai(kq.da_co ? "da_co" : "xong");
  };

  if (trangThai === "xong" || trangThai === "da_co") {
    return (
      <div className="rounded-king border border-line bg-white p-6" role="status">
        <h2 className="text-xl font-extrabold text-navy">
          {trangThai === "xong" ? "Em đã nhận đăng ký của anh chị" : "Số này đã đăng ký trong hôm nay rồi"}
        </h2>
        <p className="mt-2 text-mute">
          Bên em sẽ nhắn Zalo qua số anh chị để lại. Muốn nhanh hơn, anh chị nhắn Zalo cho em trước, nói mình vừa đăng ký môi giới trên web.
        </p>
        <a href={zaloLink("nmg-apply")} className="mt-4 inline-block rounded-md bg-zalo px-6 py-2.5 font-bold text-white transition hover:opacity-90 active:scale-[0.98]">
          Nhắn Zalo ngay
        </a>
      </div>
    );
  }

  const bao = (k: keyof Loi) => loi[k] && <p id={`loi-${k}`} role="alert" className="mt-1 text-sm font-medium text-red-700">{loi[k]}</p>;

  return (
    <form onSubmit={gui} noValidate className="rounded-king border border-line bg-white p-5 sm:p-6">
      <fieldset>
        <legend className={NHAN}>Anh chị là <span aria-hidden>*</span></legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={loai === "ca_nhan"} className={chip(loai === "ca_nhan")} onClick={() => setLoai("ca_nhan")}>Môi giới cá nhân</button>
          <button type="button" aria-pressed={loai === "san"} className={chip(loai === "san")} onClick={() => setLoai("san")}>Sàn, công ty môi giới</button>
        </div>
        {bao("loai")}
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={NHAN}>Họ và tên <span aria-hidden>*</span></span>
          <input type="text" autoComplete="name" maxLength={80} value={hoTen} onChange={(e) => setHoTen(e.target.value)}
                 aria-invalid={!!loi.ho_ten} aria-describedby={loi.ho_ten ? "loi-ho_ten" : undefined} className={O} />
          {bao("ho_ten")}
        </label>
        <label className="block">
          <span className={NHAN}>Số điện thoại có Zalo <span aria-hidden>*</span></span>
          <input type="tel" inputMode="tel" autoComplete="tel" maxLength={16} placeholder="0901 234 567" value={sdt} onChange={(e) => setSdt(e.target.value)}
                 aria-invalid={!!loi.so_dien_thoai} aria-describedby={loi.so_dien_thoai ? "loi-so_dien_thoai" : undefined} className={O} />
          {bao("so_dien_thoai")}
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className={NHAN}>Khu vực anh chị đang làm <span aria-hidden>*</span> <span className="font-normal">(chọn tối đa {KHU_VUC_TOI_DA})</span></legend>
        <div className="flex flex-wrap gap-2">
          {KHU_VUC_MG.map((k) => (
            <button key={k} type="button" aria-pressed={khu.includes(k)} className={chip(khu.includes(k))} onClick={() => setKhu((ds) => bat(ds, k, KHU_VUC_TOI_DA))}>{k}</button>
          ))}
        </div>
        {bao("khu_vuc")}
      </fieldset>

      <fieldset className="mt-4">
        <legend className={NHAN}>Loại nhà đất anh chị chuyên</legend>
        <div className="flex flex-wrap gap-2">
          {LOAI_BDS_MG.map((k) => (
            <button key={k} type="button" aria-pressed={bds.includes(k)} className={chip(bds.includes(k))} onClick={() => setBds((ds) => bat(ds, k, LOAI_BDS_MG.length))}>{k}</button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={NHAN}>Sàn, công ty đang làm {loai === "san" ? <span aria-hidden>*</span> : <span className="font-normal">(nếu có)</span>}</span>
          <input type="text" autoComplete="organization" maxLength={120} value={congTy} onChange={(e) => setCongTy(e.target.value)}
                 aria-invalid={!!loi.cong_ty} aria-describedby={loi.cong_ty ? "loi-cong_ty" : undefined} className={O} />
          {bao("cong_ty")}
        </label>
        <label className="block">
          <span className={NHAN}>Kinh nghiệm</span>
          <select value={kinhNghiem} onChange={(e) => setKinhNghiem(e.target.value)} className={O}>
            <option value="">Chọn mức gần nhất</option>
            {KINH_NGHIEM_MG.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={NHAN}>Số căn đang nhận bán, cho thuê</span>
          <input type="text" inputMode="numeric" maxLength={6} placeholder="Ví dụ: 12" value={soCan} onChange={(e) => setSoCan(e.target.value.replace(/\D/g, ""))} className={O} />
        </label>
        <label className="block sm:col-span-2">
          <span className={NHAN}>Lời nhắn thêm</span>
          <textarea rows={3} maxLength={500} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} className={O} />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-sm text-navy">
        <input type="checkbox" checked={dongY} onChange={(e) => setDongY(e.target.checked)} aria-invalid={!!loi.dong_y}
               aria-describedby={loi.dong_y ? "loi-dong_y" : undefined} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
        <span>
          Tôi đồng ý để AI Ơi Nhà Đất dùng thông tin trên vào việc liên hệ hợp tác môi giới. Thông tin chỉ người phụ trách xem, không đăng lên web.
        </span>
      </label>
      {bao("dong_y")}
      {bao("chung")}

      <button type="submit" disabled={trangThai === "gui"}
              className="mt-5 w-full rounded-md bg-brand py-3 font-bold text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60 sm:w-auto sm:px-10">
        {trangThai === "gui" ? "Đang gửi…" : "Gửi đăng ký"}
      </button>
    </form>
  );
}
