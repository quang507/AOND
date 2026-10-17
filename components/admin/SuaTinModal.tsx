"use client";
// Màn SỬA một tin trong rổ hàng (FR-175). Tách khỏi app/admin/ro-hang/page.tsx 14/09/2026 —
// chủ dự án: "cái luồng xoá và sửa tin vẫn chưa logic lắm". Ba nguyên tắc:
//   1. RAO lên web chỉ bằng nút "Lưu & rao lên web" (ô trạng thái không chọn được "đang bán").
//      Đang rao thì có nút "Gỡ khỏi web" — hoàn tác được, là cách bỏ tin thông thường.
//   2. XOÁ VĨNH VIỄN khó bấm nhầm: vùng riêng, nói rõ mất gì, gõ lại mã tin mới bấm được;
//      tin đã có lịch xem / giao dịch thì DB chặn (khoá ngoại) — nói trước, gợi ý gỡ khỏi web.
//   3. Không âm thầm làm hỏng dữ liệu: ô số gõ sai thì báo ngay tại ô, không lưu thành trống;
//      giá chỉ có MỘT ô (giá số do trigger `trg_listings_price_vnd` tự tính từ giá chữ) kèm
//      dòng "web sẽ hiện…"; đóng khi còn thay đổi chưa lưu thì hỏi.
// Tiếp cận (WCAG): <dialog> (Esc, giữ focus, trả focus), nhãn gắn ô, thông báo có role.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatPrice, oTheoLoai, TYPE_LABEL } from "@/lib/format";
import { docTien } from "@/bot/supabase/functions/_shared/extraction/luat-tien";

export type TinSua = {
  id: string;
  code: string | null;
  deal: "ban" | "cho_thue";
  status: string;
  property_type: string | null;
  price_raw: string | null;
  price_vnd: number | null;
  area_m2: number | null;
  frontage_m?: string | number | null;
  length_m?: string | number | null;
  floors?: number | null;
  floors_text?: string | null;
  bedrooms?: number | null;
  location_raw: string | null;
  district: string | null;
  ward: string | null;
  street: string | null;
  description: string | null;
};

export const TRANG_THAI_TIN: Record<string, string> = {
  cho_thong_tin: "chờ thông tin",
  dang_ban: "đang rao trên web",
  dang_quan_tam: "đang có khách quan tâm",
  da_chot: "đã chốt (bán / thuê xong)",
  an: "đã gỡ khỏi web",
};

type Form = {
  deal: "ban" | "cho_thue"; status: string; property_type: string; price_raw: string; area_m2: string;
  frontage_m: string; length_m: string; floors_text: string; bedrooms: string; location_raw: string;
  district: string; ward: string; street: string; description: string;
};
const sang = (v: unknown) => (v == null ? "" : String(v));
const tuTin = (d: TinSua): Form => ({
  deal: d.deal || "ban", status: d.status || "cho_thong_tin", property_type: d.property_type || "chua_ro",
  price_raw: sang(d.price_raw), area_m2: sang(d.area_m2), frontage_m: sang(d.frontage_m), length_m: sang(d.length_m),
  floors_text: sang(d.floors_text ?? (d.floors ? `${d.floors} tầng` : "")), bedrooms: sang(d.bedrooms), location_raw: sang(d.location_raw), district: sang(d.district),
  ward: sang(d.ward), street: sang(d.street), description: sang(d.description),
});

// 24/09/2026 (chủ dự án: "trong này ko ghi là số tầng nữa sếp tao ko thích ghi thế"): ô "Số tầng" thành ô chữ
// KẾT CẤU ("trệt + lửng + 2 lầu + sân thượng") — lửng, sân thượng, hầm không có chỗ trong một con số. Cột `floors`
// (số tầng = trệt + lầu, web lọc theo nó) suy ra từ chữ; đọc không ra thì giữ số cũ, không xoá.
export function soTangTuKetCau(chu: string): number | null {
  const k = chu.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
  const lau = /(\d{1,2})\s*lau\b/.exec(k);
  if (lau) return Number(lau[1]) + 1;
  const tang = /(\d{1,2})\s*tang\b/.exec(k);
  if (tang) return Number(tang[1]);
  if (/\blau\b/.test(k)) return 2;
  if (/\btret\b|cap 4|\bc4\b/.test(k)) return 1;
  return null;
}

// Ô số: trống = không có; có chữ thì phải đọc được, không thì báo (không lặng lẽ lưu thành trống).
const docSo = (v: string, nguyen: boolean): { gt: number | null; loi: string | null } => {
  const s = v.trim().replace(",", ".").replace(/\s*(m2|m²|m|tầng|tấm|pn|phòng)$/i, "");
  if (!s) return { gt: null, loi: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { gt: null, loi: "Chỉ nhập số, ví dụ 4,5" };
  if (nguyen && !Number.isInteger(n)) return { gt: null, loi: "Nhập số nguyên" };
  return { gt: n, loi: null };
};

export default function SuaTinModal({
  tin, onDong, onDaLuu, onDaXoa, baoTin,
}: {
  tin: TinSua;
  onDong: () => void;
  onDaLuu: (id: string, updates: Partial<TinSua>) => void;
  onDaXoa: (id: string) => void;
  baoTin: (s: string, loi?: boolean) => void;
}) {
  const hop = useRef<HTMLDialogElement>(null);
  const idGoc = useId();
  const id = (t: string) => `${idGoc}-${t}`;
  const goc = useMemo(() => tuTin(tin), [tin]);
  const [f, setF] = useState<Form>(goc);
  const [dangLuu, setDangLuu] = useState(false);
  const [moXoa, setMoXoa] = useState(false);
  const [goMa, setGoMa] = useState("");
  const [chanXoa, setChanXoa] = useState<string | null>(null);
  // Lỗi hiện TRONG modal: <dialog> showModal() nằm ở top layer, thông báo nổi của trang bị che.
  const [loiTrong, setLoiTrong] = useState<string | null>(null);
  const dangRao = tin.status === "dang_ban";
  const doi = JSON.stringify(f) !== JSON.stringify(goc);

  useEffect(() => {
    const d = hop.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);

  const dong = () => {
    if (doi && !confirm("Tin có thay đổi chưa lưu. Đóng và bỏ các thay đổi này?")) return;
    onDong();
  };

  const so = {
    area_m2: docSo(f.area_m2, false), frontage_m: docSo(f.frontage_m, false), length_m: docSo(f.length_m, false),
    bedrooms: docSo(f.bedrooms, true),
  };
  const coLoiSo = Object.values(so).some((x) => x.loi);
  const giaDoc = f.price_raw.trim() ? docTien(f.price_raw) : null;
  const giaHien = f.price_raw.trim()
    ? giaDoc != null ? formatPrice(giaDoc, f.price_raw) : null
    : null;

  const luu = async (hanhDong: "luu" | "rao" | "go") => {
    if (coLoiSo) { setLoiTrong("Còn ô số nhập sai (tô đỏ) — sửa rồi lưu lại."); return; }
    setLoiTrong(null);
    if (hanhDong === "rao") {
      const thieu = [!f.price_raw.trim() && "giá", !so.area_m2.gt && "diện tích", !f.district.trim() && "quận/huyện", !f.description.trim() && "mô tả"]
        .filter(Boolean) as string[];
      const hoi = thieu.length
        ? `Tin còn THIẾU: ${thieu.join(", ")}.\n\nVẫn rao #${tin.code} lên web?`
        : `Rao #${tin.code} lên web AI Ơi Nhà Đất? Ai cũng xem được tin này.`;
      if (!confirm(hoi)) return;
    }
    if (hanhDong === "go" && !confirm(`Gỡ #${tin.code} khỏi web? Tin vẫn còn trong rổ, rao lại được bất cứ lúc nào.`)) return;
    setDangLuu(true);
    const status = hanhDong === "rao" ? "dang_ban" : hanhDong === "go" ? "an" : f.status;
    const updates = {
      deal: f.deal, status, property_type: f.property_type || null,
      price_raw: f.price_raw.trim() || null,
      area_m2: so.area_m2.gt, frontage_m: so.frontage_m.gt, length_m: so.length_m.gt,
      floors_text: f.floors_text.trim() || null,
      floors: f.floors_text.trim() ? soTangTuKetCau(f.floors_text) ?? tin.floors ?? null : null,
      bedrooms: so.bedrooms.gt,
      location_raw: f.location_raw.trim() || null, district: f.district.trim() || null,
      ward: f.ward.trim() || null, street: f.street.trim() || null, description: f.description.trim() || null,
      can_chu_duyet: false, updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("listings").update(updates).eq("id", tin.id).select("price_vnd").maybeSingle();
    setDangLuu(false);
    if (error) { setLoiTrong(`Chưa lưu được #${tin.code}: ${error.message}`); return; }
    onDaLuu(tin.id, { ...updates, price_vnd: (data as { price_vnd?: number | null } | null)?.price_vnd ?? null } as Partial<TinSua>);
    baoTin(hanhDong === "rao" ? `Đã lưu và rao #${tin.code} lên web.` : hanhDong === "go" ? `Đã gỡ #${tin.code} khỏi web.` : `Đã lưu #${tin.code}.`);
    onDong();
  };

  const moVungXoa = async () => {
    setMoXoa(true);
    setGoMa("");
    // Khoá ngoại KHÔNG xoá theo: lịch xem, giao dịch, lượt xem trang → DB sẽ chặn. Nói trước.
    const dem = async (bang: "viewings" | "deals") => {
      const { count } = await supabase.from(bang).select("id", { count: "exact", head: true }).eq("listing_id", tin.id);
      return count ?? 0;
    };
    const [xem, gd] = await Promise.all([dem("viewings"), dem("deals")]);
    setChanXoa(xem || gd ? `Tin này có ${[xem && `${xem} lịch xem`, gd && `${gd} giao dịch`].filter(Boolean).join(" và ")} — không xoá được. Hãy gỡ khỏi web.` : null);
  };

  const xoa = async () => {
    setDangLuu(true);
    const { error } = await supabase.from("listings").delete().eq("id", tin.id);
    setDangLuu(false);
    if (error) {
      setLoiTrong(/foreign key|violates/i.test(error.message)
        ? `Không xoá được #${tin.code}: tin còn gắn lịch xem / giao dịch / lượt xem. Hãy gỡ khỏi web thay vì xoá.`
        : `Không xoá được #${tin.code}: ${error.message}`);
      return;
    }
    onDaXoa(tin.id);
    baoTin(`Đã xoá vĩnh viễn #${tin.code}.`);
    onDong();
  };

  const o = "w-full rounded-md border border-slate-400 bg-white p-2 text-sm text-navy focus-visible:outline-2 focus-visible:outline-brand";
  const nhan = "mb-1 block text-xs font-bold text-navy";
  const oLoai = oTheoLoai(f.property_type);
  const oSo = (k: keyof typeof so, ten: string, goiY: string) => (
    <div>
      <label htmlFor={id(k)} className={nhan}>{ten}</label>
      <input
        id={id(k)} inputMode="decimal" value={f[k]} placeholder={goiY}
        aria-invalid={!!so[k].loi} aria-describedby={so[k].loi ? id(`${k}-loi`) : undefined}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        className={`${o} ${so[k].loi ? "border-red-600" : ""}`}
      />
      {so[k].loi && <p id={id(`${k}-loi`)} className="mt-1 text-xs font-semibold text-red-700">{so[k].loi}</p>}
    </div>
  );

  return (
    <dialog
      ref={hop}
      aria-labelledby={id("tieu-de")}
      onCancel={(e) => { e.preventDefault(); dong(); }}
      className="m-auto w-[min(42rem,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-white p-0 text-navy shadow-2xl backdrop:bg-black/50"
    >
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
          <div>
            <h2 id={id("tieu-de")} className="text-lg font-bold">Sửa tin <span className="font-mono">#{tin.code}</span></h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Đang: <b>{TRANG_THAI_TIN[tin.status] ?? tin.status}</b>
            </p>
          </div>
          <button type="button" onClick={dong} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-md text-xl font-bold text-slate-600 hover:bg-slate-100 hover:text-navy">×</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={id("deal")} className={nhan}>Giao dịch</label>
            <select id={id("deal")} value={f.deal} onChange={(e) => setF({ ...f, deal: e.target.value as Form["deal"] })} className={o}>
              <option value="ban">Bán</option>
              <option value="cho_thue">Cho thuê</option>
            </select>
          </div>
          <div>
            <label htmlFor={id("status")} className={nhan}>Trạng thái</label>
            <select id={id("status")} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={o}
              aria-describedby={id("status-ghi")}>
              {Object.entries(TRANG_THAI_TIN).map(([k, v]) => (
                <option key={k} value={k} disabled={k === "dang_ban" && !dangRao}>{v}</option>
              ))}
            </select>
            {!dangRao && <p id={id("status-ghi")} className="mt-1 text-xs text-slate-600">Rao lên web bằng nút dưới cùng.</p>}
          </div>
          <div>
            <label htmlFor={id("loai")} className={nhan}>Loại BĐS</label>
            <select id={id("loai")} value={f.property_type} onChange={(e) => setF({ ...f, property_type: e.target.value })} className={o}>
              <option value="chua_ro">Chưa rõ</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-4 border-t border-line/60 pt-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor={id("gia")} className={nhan}>Giá</label>
            <input id={id("gia")} value={f.price_raw} onChange={(e) => setF({ ...f, price_raw: e.target.value })}
              placeholder="Ví dụ: 7 tỷ 2, 850 triệu, 15 triệu/tháng" aria-describedby={id("gia-hien")} className={o} />
            <p id={id("gia-hien")} className={`mt-1 text-xs ${f.price_raw.trim() && giaDoc == null ? "font-semibold text-red-700" : "text-slate-600"}`}>
              {!f.price_raw.trim() ? "Chưa có giá — web sẽ hiện \"Giá thương lượng\"."
                : giaDoc == null ? "Không đọc được số tiền — web sẽ không lọc / sắp theo giá được. Viết kiểu \"7 tỷ 2\"."
                : `Web sẽ hiện: ${giaHien}`}
            </p>
          </div>
          {oSo("area_m2", "Diện tích (m²)", "Ví dụ: 62,5")}
        </div>

        {/* Ô theo LOẠI BĐS (`O_THEO_LOAI`): đất không có phòng ngủ / kết cấu, căn hộ không có ngang × dài, nhà không có ô phòng
            ngủ trống (chủ dự án 01/10). Ô đang có giá trị thì vẫn hiện để admin thấy, sửa và xoá được. */}
        {(oLoai.ngangDai || f.frontage_m || f.length_m || oLoai.oPhongNguTrong || f.bedrooms || oLoai.ketCau || f.floors_text) && (
        <div className="grid gap-4 border-t border-line/60 pt-3 sm:grid-cols-3">
          {(oLoai.ngangDai || f.frontage_m) && oSo("frontage_m", "Ngang (m)", "4,2")}
          {(oLoai.ngangDai || f.length_m) && oSo("length_m", "Dài (m)", "18")}
          {(oLoai.oPhongNguTrong || f.bedrooms) && oSo("bedrooms", "Phòng ngủ", "3")}
          {(oLoai.ketCau || f.floors_text) && (
          <div className="sm:col-span-3">
            <label htmlFor={id("ketcau")} className={nhan}>Kết cấu</label>
            <input id={id("ketcau")} value={f.floors_text} onChange={(e) => setF({ ...f, floors_text: e.target.value })}
              placeholder="Ví dụ: trệt + lửng + 2 lầu + sân thượng" className={o} />
          </div>
          )}
        </div>
        )}

        <div className="space-y-3 border-t border-line/60 pt-3">
          <div>
            <label htmlFor={id("vitri")} className={nhan}>Địa chỉ hiển thị</label>
            <input id={id("vitri")} value={f.location_raw} onChange={(e) => setF({ ...f, location_raw: e.target.value })}
              placeholder="Ví dụ: hẻm 102 Nguyễn Trãi" className={o} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={id("duong")} className={nhan}>Đường</label>
              <input id={id("duong")} value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} placeholder="Nguyễn Trãi" className={o} />
            </div>
            <div>
              <label htmlFor={id("phuong")} className={nhan}>Phường / xã</label>
              <input id={id("phuong")} value={f.ward} onChange={(e) => setF({ ...f, ward: e.target.value })} placeholder="Phường 3" className={o} />
            </div>
            <div>
              <label htmlFor={id("quan")} className={nhan}>Quận / huyện</label>
              <input id={id("quan")} value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} placeholder="Quận 5" className={o} />
            </div>
          </div>
        </div>

        <div className="border-t border-line/60 pt-3">
          <label htmlFor={id("mota")} className={nhan}>Mô tả</label>
          <textarea id={id("mota")} rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={o} />
        </div>

        {loiTrong && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{loiTrong}</p>}

        {/* Hành động chính */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={dong} className="min-h-9 rounded-md px-4 text-sm font-bold text-slate-700 hover:bg-slate-100">Huỷ</button>
          <button type="button" onClick={() => luu("luu")} disabled={dangLuu || !doi}
            className="min-h-9 rounded-md border border-slate-500 bg-white px-5 text-sm font-bold text-navy hover:border-navy disabled:opacity-50"
            title={dangRao ? "Lưu, tin vẫn đang rao" : "Lưu, CHƯA rao lên web"}>
            {dangLuu ? "Đang lưu…" : "Lưu"}
          </button>
          {dangRao ? (
            <button type="button" onClick={() => luu("go")} disabled={dangLuu}
              className="min-h-9 rounded-md border border-navy bg-navy px-5 text-sm font-bold text-white hover:bg-navy-soft disabled:opacity-50">
              Lưu &amp; gỡ khỏi web
            </button>
          ) : (
            <button type="button" onClick={() => luu("rao")} disabled={dangLuu}
              className="min-h-9 rounded-md bg-[#b3461a] px-5 text-sm font-bold text-white hover:bg-[#9a3c16] disabled:opacity-50">
              Lưu &amp; rao lên web
            </button>
          )}
        </div>

        {/* Vùng nguy hiểm: xoá vĩnh viễn */}
        <div className="rounded-md border border-red-200 bg-red-50/60 p-3">
          {!moXoa ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-700">Muốn bỏ tin? {dangRao ? "Gỡ khỏi web" : "Đổi trạng thái sang \"đã gỡ khỏi web\""} là đủ và hoàn tác được.</p>
              <button type="button" onClick={moVungXoa} className="min-h-8 rounded-md px-3 text-xs font-bold text-red-700 underline-offset-2 hover:underline">
                Xoá vĩnh viễn…
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-bold text-red-800">Xoá vĩnh viễn #{tin.code}</p>
              <p className="text-xs text-slate-700">
                Mất hẳn tin, ảnh, câu trả lời của chủ nhà, câu hỏi đang chờ và lịch nhắc của tin. Không hoàn tác được.
              </p>
              {chanXoa ? (
                <p role="alert" className="text-xs font-semibold text-red-800">{chanXoa}</p>
              ) : (
                <>
                  <label htmlFor={id("go-ma")} className="block text-xs font-bold text-navy">Gõ lại mã tin để xác nhận</label>
                  <div className="flex flex-wrap gap-2">
                    <input id={id("go-ma")} value={goMa} onChange={(e) => setGoMa(e.target.value)} placeholder={tin.code ?? ""}
                      autoComplete="off" className="min-w-0 flex-1 rounded-md border border-red-300 bg-white p-2 font-mono text-sm" />
                    <button type="button" onClick={xoa} disabled={dangLuu || goMa.trim().toUpperCase() !== (tin.code ?? "").toUpperCase()}
                      className="min-h-9 rounded-md bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-40">
                      Xoá vĩnh viễn
                    </button>
                  </div>
                </>
              )}
              <button type="button" onClick={() => setMoXoa(false)} className="text-xs font-semibold text-slate-700 hover:underline">Thôi, không xoá</button>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
