"use client";
// /admin/ro-hang (FR-175): rổ hàng đọc như Excel — một bảng, cột xếp đúng thứ
// tự sheet Excel gốc (STT · bán/thuê · vị trí · diện tích · giá · mô tả · người
// bán), lọc, sắp xếp, tìm, tải CSV mở thẳng bằng Excel. Cùng dữ liệu với view
// `so.ro_hang` phía DB (20260907c) nhưng không cần vào Supabase.
// 08/09/2026: Bổ sung tính năng SỬA TRỰC TIẾP tại chỗ (Inline Quick Status + Modal Sửa Chi Tiết).
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatArea, formatPrice, sanitizeDescription, TYPE_LABEL } from "@/lib/format";
import BocTachNhom, { useBocTach } from "@/components/admin/BocTachNhom";
import SuaTinModal, { TRANG_THAI_TIN } from "@/components/admin/SuaTinModal";

// FR-187: dòng JSON chia nhóm mở dưới một tin (đọc `boc_tach_v` khi bấm, không tải cả rổ).
function DongJson({ id, ma, cot }: { id: string; ma: string | null; cot: number }) {
  const { nhom, loi } = useBocTach(id);
  return (
    <tr className="bg-slate-50/70">
      <td colSpan={cot} className="px-4 py-3">
        <BocTachNhom ma={ma} nhom={nhom} loi={loi} />
      </td>
    </tr>
  );
}

type Dong = {
  id: string;
  code: string | null;
  legacy_code?: string | null;
  legacy_sst: number | null;
  deal: "ban" | "cho_thue";
  district: string | null;
  ward: string | null;
  street: string | null;
  location_raw: string | null;
  area_m2: number | null;
  frontage_m?: string | number | null;
  length_m?: string | number | null;
  floors?: number | null;
  floors_text?: string | null;
  bedrooms?: number | null;
  price_vnd: number | null;
  price_raw: string | null;
  description: string | null;
  property_type: string | null;
  status: string;
  created_at: string;
  sellers: { name: string | null; phone: string | null; seller_type: string } | null;
  media: { count: number }[] | null;
  listing_media: { count: number }[] | null;
};

const COT_CHON =
  "id, code, legacy_code, legacy_sst, deal, district, ward, street, location_raw, area_m2, frontage_m, length_m, floors, floors_text, bedrooms, price_vnd, price_raw, description, property_type, status, created_at, sellers!listings_seller_id_fkey(name, phone, seller_type), media(count), listing_media(count)";

const TRANG_THAI: Record<string, string> = {
  cho_thong_tin: "chờ thông tin",
  dang_ban: "đang bán",
  dang_quan_tam: "đang quan tâm",
  da_chot: "đã chốt",
  an: "ẩn",
};

const MAU_TRANG_THAI: Record<string, string> = {
  dang_ban: "bg-emerald-50 text-emerald-800 border-emerald-300",
  cho_thong_tin: "bg-amber-50 text-amber-800 border-amber-300",
  dang_quan_tam: "bg-blue-50 text-blue-800 border-blue-300",
  da_chot: "bg-purple-50 text-purple-800 border-purple-300",
  an: "bg-slate-100 text-mute border-slate-300",
};

const MOI_TRANG = 20;

type Cot = { key: string; ten: string; lay: (d: Dong) => string; sap?: (d: Dong) => number | string };

const DUOI_THANH_PHO = /(,\s*Quận 5)?,\s*(tp\.?|thành phố)?\s*Hồ Chí Minh\.?\s*$/i;
const viTri = (d: Dong) =>
  (d.location_raw ?? [d.street, d.ward, d.district].filter(Boolean).join(", "))
    .trim()
    .replace(/\r?\n/g, " - ")
    .replace(DUOI_THANH_PHO, "");
const moTa = (d: Dong) =>
  sanitizeDescription(d.description)
    .replace(/\s*\r?\n\s*[-•+*]?\s*/g, " · ")
    .replace(/^[-•+*]\s*/, "");
const soAnh = (d: Dong) => (d.media?.[0]?.count ?? 0) + (d.listing_media?.[0]?.count ?? 0);

const COT: Cot[] = [
  { key: "stt", ten: "STT", lay: (d) => (d.legacy_sst != null ? String(d.legacy_sst) : ""), sap: (d) => d.legacy_sst ?? 1e9 },
  // 09/09 tối: ngày vào đứng ĐẦU (mặc định sắp mới nhất trước) — trước đây nằm cuối, tràn khỏi màn hình.
  { key: "ngay", ten: "Ngày vào", lay: (d) => d.created_at.slice(0, 10), sap: (d) => d.created_at },
  { key: "deal", ten: "Bán / thuê", lay: (d) => (d.deal === "ban" ? "Bán" : "Cho thuê"), sap: (d) => d.deal },
  { key: "vi_tri", ten: "Vị trí", lay: viTri, sap: viTri },
  { key: "dien_tich", ten: "Diện tích", lay: (d) => formatArea(d.area_m2), sap: (d) => d.area_m2 ?? -1 },
  { key: "gia", ten: "Giá", lay: (d) => formatPrice(d.price_vnd, d.price_raw), sap: (d) => d.price_vnd ?? -1 },
  { key: "mo_ta", ten: "Mô tả", lay: moTa },
  { key: "nguoi_ban", ten: "Người bán", lay: (d) => d.sellers?.name ?? "", sap: (d) => d.sellers?.name ?? "" },
  { key: "sdt", ten: "SĐT người bán", lay: (d) => d.sellers?.phone ?? "", sap: (d) => d.sellers?.phone ?? "" },
  { key: "ma", ten: "Mã tin", lay: (d) => d.code ?? "", sap: (d) => d.code ?? "" },
  { key: "loai", ten: "Loại", lay: (d) => TYPE_LABEL[d.property_type ?? ""] ?? "chưa rõ", sap: (d) => d.property_type ?? "" },
  { key: "trang_thai", ten: "Trạng thái", lay: (d) => TRANG_THAI[d.status] ?? d.status, sap: (d) => d.status },
  { key: "anh", ten: "Ảnh", lay: (d) => String(soAnh(d)), sap: soAnh },
];

// 14/09/2026 — chủ dự án: "cột loại bị cắt rồi". Bảng rộng hơn màn hình, cột "Thao tác" dính
// bên phải đè lên các cột CUỐI — mà Loại / Trạng thái lại nằm cuối. Thứ nhận ra tin và việc cần
// làm đứng đầu; STT / ngày / SĐT / ảnh xuống cuối. CSV vẫn theo thứ tự COT (sheet Excel gốc).
const THU_TU_HIEN = ["ma", "loai", "trang_thai", "deal", "gia", "dien_tich", "vi_tri", "nguoi_ban", "mo_ta", "sdt", "anh", "ngay", "stt"];
const COT_HIEN = THU_TU_HIEN.map((k) => COT.find((c) => c.key === k)!).filter(Boolean);

const khongDau = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [rows, setRows] = useState<Dong[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [deal, setDeal] = useState<"" | "ban" | "cho_thue">("");
  const [trangThai, setTrangThai] = useState("");
  const [sap, setSap] = useState<{ key: string; tang: boolean }>({ key: "ngay", tang: false });
  const [trang, setTrang] = useState(1);
  const [mo, setMo] = useState<Set<string>>(new Set());
  // FR-187: tin đang mở JSON chia nhóm.
  const [moJson, setMoJson] = useState<Set<string>>(new Set());

  // Màn sửa (components/admin/SuaTinModal.tsx) + thông báo sau mỗi thao tác (WCAG 4.1.3).
  const [dangSua, setDangSua] = useState<Dong | null>(null);
  const [thongBao, setThongBao] = useState<{ chu: string; loi: boolean } | null>(null);
  const baoTin = (chu: string, loi = false) => {
    setThongBao({ chu, loi });
    window.setTimeout(() => setThongBao((x) => (x?.chu === chu ? null : x)), loi ? 9000 : 4000);
  };

  useEffect(() => {
    // Ô tìm trên thanh CRM (AdminShell) đưa ?q= sang đây.
    try { const k = new URLSearchParams(location.search).get("q"); if (k) setQ(k); } catch { /* SSR */ }
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setRole("anon");
      const { data: a } = await supabase
        .from("admins").select("email").eq("email", user.email ?? "").maybeSingle();
      if (!a) return setRole("user");
      setRole("admin");
      const { data, error } = await supabase
        .from("listings")
        .select(COT_CHON)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) setLoi(error.message);
      setRows((data ?? []) as unknown as Dong[]);
    });
  }, []);

  const loc = useMemo(() => {
    const kq = khongDau(q.trim());
    let xs = rows.filter((d) => (!deal || d.deal === deal) && (!trangThai || d.status === trangThai));
    if (kq) {
      xs = xs.filter((d) =>
        khongDau([d.code ?? "", viTri(d), d.description ?? "", d.sellers?.name ?? "", String(d.legacy_sst ?? "")].join(" ")).includes(kq),
      );
    }
    const cot = COT.find((c) => c.key === sap.key);
    if (cot?.sap) {
      const f = cot.sap;
      xs = [...xs].sort((a, b) => {
        const x = f(a), y = f(b);
        const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "vi");
        return sap.tang ? r : -r;
      });
    }
    return xs;
  }, [rows, q, deal, trangThai, sap]);

  const soTrang = Math.max(1, Math.ceil(loc.length / MOI_TRANG));
  const t = Math.min(trang, soTrang);
  const mot = loc.slice((t - 1) * MOI_TRANG, t * MOI_TRANG);

  const bamCot = (key: string) => {
    setSap((s) => ({ key, tang: s.key === key ? !s.tang : false }));
  };

  const moSua = (d: Dong) => setDangSua(d);
  const dongSua = () => {
    setDangSua(null);
    // Mở từ ?sua=<mã>: đóng thì bỏ tham số và ô tìm, kẻo tải lại trang lại bật modal / chỉ thấy một dòng.
    try {
      const u = new URL(location.href);
      if (u.searchParams.has("sua")) { u.searchParams.delete("sua"); history.replaceState(null, "", u.toString()); setQ(""); }
    } catch { /* SSR */ }
  };

  // 14/09/2026: thẻ CRM trên /admin mở thẳng màn sửa bằng ?sua=<mã tin> (trước đó mã tin
  // trỏ ra trang công khai — tin chưa lên kệ thì 404). Chạy một lần khi rổ tải xong.
  const [daMoTuLink, setDaMoTuLink] = useState(false);
  useEffect(() => {
    if (daMoTuLink || !rows.length) return;
    setDaMoTuLink(true);
    let ma: string | null = null;
    try { ma = new URLSearchParams(location.search).get("sua"); } catch { /* SSR */ }
    const d = ma ? rows.find((r) => r.code === ma) : undefined;
    if (d) { setQ(ma ?? ""); moSua(d); }
    else if (ma) baoTin(`Không tìm thấy tin ${ma} trong rổ hàng (có thể đã xoá).`, true);
  }, [rows, daMoTuLink]);

  // Đổi trạng thái nhanh từ bảng. Rao lên web KHÔNG đi đường này (option bị khoá, phải qua màn
  // Sửa). Gỡ một tin đang rao khỏi web thì hỏi trước — tin biến khỏi web ngay.
  const doiTrangThaiNhanh = async (d: Dong, newStatus: string) => {
    if (d.status === "dang_ban" && newStatus !== "dang_ban" &&
        !confirm(`Gỡ #${d.code} khỏi web (chuyển sang "${TRANG_THAI_TIN[newStatus] ?? newStatus}")?`)) return;
    const { error } = await supabase.from("listings").update({
      status: newStatus,
      can_chu_duyet: false,
      updated_at: new Date().toISOString(),
    }).eq("id", d.id);
    if (error) {
      baoTin(`Chưa đổi được trạng thái #${d.code}: ${error.message}`, true);
    } else {
      setRows((prev) => prev.map((r) => (r.id === d.id ? { ...r, status: newStatus } : r)));
      baoTin(`#${d.code} → ${TRANG_THAI_TIN[newStatus] ?? newStatus}.`);
    }
  };

  const bao = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const taiCsv = () => {
    const dong = [COT.map((c) => bao(c.ten)).join(",")].concat(
      loc.map((d) => COT.map((c) => bao(c.lay(d))).join(",")),
    );
    const blob = new Blob(["\uFEFF" + dong.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ro-hang-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (role === "loading") return <div className="mx-auto max-w-4xl px-4 py-16 text-mute font-medium">Đang kiểm tra quyền…</div>;
  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-navy">Khu vực quản trị</h1>
        <p className="mt-2 text-mute text-sm">
          {role === "anon" ? "Cần đăng nhập bằng tài khoản quản trị." : "Tài khoản này không có quyền quản trị."}
        </p>
        {role === "anon" && (
          <Link href="/dang-nhap" className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 font-bold text-white hover:bg-brand-dark transition">
            Đăng nhập
          </Link>
        )}
      </div>
    );
  }

  const o = "rounded-md border border-line px-3.5 py-1.5 text-sm outline-none focus:border-brand bg-white";

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="text-sm font-semibold text-brand hover:underline">
              Quay lại Bàn quản trị
            </Link>
            <span className="text-mute text-xs">/</span>
            <span className="text-xs text-mute font-medium">Quản lý rổ hàng</span>
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">Rổ hàng BĐS (Dạng Excel)</h1>
          <p className="mt-1 text-sm text-mute tabular-nums">
            {rows.length} tin trong rổ · đang lọc hiển thị {loc.length} · bấm mã tin để sửa · rao lên web chỉ qua màn sửa
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/dang-tin"
            className="rounded-md border border-line px-4 py-2 text-sm font-bold text-navy hover:border-brand hover:text-brand bg-white transition"
          >
            + Đăng tin mới
          </Link>
          <Link
            href="/admin/ro-hang/json"
            className="rounded-md border border-line px-4 py-2 text-sm font-bold text-navy hover:border-brand hover:text-brand bg-white transition"
            title="Rổ hàng dạng JSON kèm bóc tách (FR-177 h)"
          >
            {"{ }"} JSON
          </Link>
          <button
            type="button"
            onClick={taiCsv}
            disabled={loc.length === 0}
            className="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            Tải CSV ({loc.length} dòng)
          </button>
        </div>
      </header>

      {loi && (
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-brand">
          Không đọc được: {loi}
        </div>
      )}

      {/* Thanh lọc & tìm kiếm */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setTrang(1); }}
          placeholder="Tìm nhanh: mã tin, đường, phường, giá, mô tả, người bán…"
          aria-label="Tìm trong rổ hàng"
          className={`${o} min-w-0 flex-1 px-4`}
        />
        <select aria-label="Lọc bán hay cho thuê" value={deal} onChange={(e) => { setDeal(e.target.value as typeof deal); setTrang(1); }} className={o}>
          <option value="">Tất cả (Bán + Thuê)</option>
          <option value="ban">Chỉ Bán</option>
          <option value="cho_thue">Chỉ Cho thuê</option>
        </select>
        <select aria-label="Lọc theo trạng thái" value={trangThai} onChange={(e) => { setTrangThai(e.target.value); setTrang(1); }} className={o}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(TRANG_THAI).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Bảng dữ liệu Rổ Hàng có Sửa trực tiếp */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[1360px] text-left text-sm">
          <caption className="sr-only">Rổ hàng — mỗi dòng một tin, cột Mã tin mở màn sửa</caption>
          <thead className="sticky top-0 bg-slate-50 border-b border-line">
            <tr className="text-xs uppercase tracking-wide text-mute">
              {COT_HIEN.map((c) => (
                <th key={c.key} scope="col" aria-sort={sap.key === c.key ? (sap.tang ? "ascending" : "descending") : undefined} className="px-3 py-3 font-semibold">
                  {c.sap ? (
                    <button type="button" onClick={() => bamCot(c.key)} className="hover:text-brand flex items-center gap-1">
                      <span>{c.ten}</span>
                      <span className="text-brand font-bold">{sap.key === c.key ? (sap.tang ? "↑" : "↓") : ""}</span>
                    </button>
                  ) : (
                    c.ten
                  )}
                </th>
              ))}
              <th scope="col" className="px-3 py-3 font-semibold text-center sticky right-0 z-10 bg-slate-50 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {mot.map((d) => {
              const moTaFull = COT.find((c) => c.key === "mo_ta")!.lay(d);
              const daMo = mo.has(d.id);
              const daMoJson = moJson.has(d.id);

              return (
                <Fragment key={d.id}>
                <tr className="align-top hover:bg-slate-50/80 transition">
                  {COT_HIEN.map((c) => {
                    // Cột mô tả
                    if (c.key === "mo_ta") {
                      return (
                        <td key={c.key} className="max-w-[26rem] px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setMo((s) => { const n = new Set(s); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })}
                            className="text-left text-navy/85 hover:text-navy"
                            title={daMo ? "thu gọn" : "bấm để xem đủ"}
                          >
                            {daMo || moTaFull.length <= 130 ? moTaFull : moTaFull.slice(0, 130) + "…"}
                          </button>
                        </td>
                      );
                    }

                    // Cột mã tin → mở màn sửa. Trang công khai chỉ có khi tin đang rao (nút "Xem").
                    if (c.key === "ma" && d.code) {
                      return (
                        <td key={c.key} className="whitespace-nowrap px-3 py-3 tabular-nums font-bold">
                          <button type="button" onClick={() => moSua(d)} className="text-[#b3461a] hover:underline" title="Mở màn sửa tin này">
                            #{d.code}
                          </button>
                          {d.legacy_code && d.legacy_code !== d.code && (
                            <span className="block text-[11px] font-normal text-slate-600">({d.legacy_code})</span>
                          )}
                        </td>
                      );
                    }

                    // Cột trạng thái: Dropdown đổi trạng thái nhanh tại chỗ
                    if (c.key === "trang_thai") {
                      return (
                        <td key={c.key} className="whitespace-nowrap px-3 py-3">
                          <select
                            value={d.status}
                            onChange={(e) => doiTrangThaiNhanh(d, e.target.value)}
                            aria-label={`Trạng thái #${d.code}`}
                            className={`rounded-md px-2.5 py-1 text-xs font-bold border outline-none cursor-pointer transition ${
                              MAU_TRANG_THAI[d.status] ?? "bg-slate-100 text-mute border-slate-300"
                            }`}
                            title={d.status === "dang_ban"
                              ? "Đổi nhanh trạng thái"
                              : 'Đổi nhanh trạng thái. Muốn RAO tin thì bấm "Sửa" rồi "Duyệt & rao tin" — rao là đưa ra web, phải nhìn đủ tin trước.'}
                          >
                            {Object.entries(TRANG_THAI).map(([val, label]) => (
                              <option
                                key={val}
                                value={val}
                                className="bg-white text-navy font-medium"
                                // Rao tin chỉ đi qua màn Sửa (10/09). Ở đây một cú
                                // trượt chuột là tin ra web mà chưa ai đọc lại nó.
                                disabled={val === "dang_ban" && d.status !== "dang_ban"}
                              >
                                {label}{val === "dang_ban" && d.status !== "dang_ban" ? " — qua nút Sửa" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }

                    // Cột giá
                    if (c.key === "gia") {
                      return (
                        <td key={c.key} className="whitespace-nowrap px-3 py-3 tabular-nums font-bold text-navy">
                          {c.lay(d)}
                        </td>
                      );
                    }

                    // Cột vị trí
                    if (c.key === "vi_tri") {
                      return (
                        <td key={c.key} className="max-w-[18rem] px-3 py-3 text-navy font-medium">
                          {c.lay(d)}
                        </td>
                      );
                    }

                    return (
                      <td key={c.key} className="whitespace-nowrap px-3 py-3 tabular-nums text-navy/80">
                        {c.lay(d)}
                      </td>
                    );
                  })}

                  {/* Cột nút thao tác */}
                  <td className="whitespace-nowrap px-3 py-3 text-center sticky right-0 z-10 bg-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => moSua(d)}
                        className="min-h-7 rounded-md border border-[#b3461a]/40 bg-white px-3 py-1 text-xs font-bold text-[#b3461a] transition hover:bg-[#b3461a] hover:text-white"
                        title="Chỉnh sửa thông tin tin này"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => setMoJson((s) => { const n = new Set(s); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })}
                        aria-expanded={daMoJson}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${daMoJson ? "border-navy bg-navy text-white" : "border-line text-mute hover:text-navy hover:border-slate-400"}`}
                        title="JSON bóc tách chia nhóm của tin này (FR-187)"
                      >
                        JSON
                      </button>
                      {d.code && d.status === "dang_ban" && (
                        <Link
                          href={`/nha-dat/${encodeURIComponent(d.code)}`}
                          target="_blank"
                          className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-mute hover:text-navy hover:border-slate-400 transition"
                          title="Xem trang tin trên web (chỉ có khi tin đang rao)"
                        >
                          Xem
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
                {daMoJson && <DongJson id={d.id} ma={d.code} cot={COT_HIEN.length + 1} />}
                </Fragment>
              );
            })}
            {mot.length === 0 && (
              <tr>
                <td colSpan={COT_HIEN.length + 1} className="px-3 py-12 text-center text-mute font-medium">
                  Không có tin nào khớp với bộ lọc tìm kiếm.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      {soTrang > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={t <= 1}
            onClick={() => setTrang(t - 1)}
            className="rounded-md border border-line px-4 py-1.5 font-semibold text-navy hover:border-brand hover:text-brand disabled:opacity-40 bg-white"
          >
            Trước
          </button>
          <span className="text-mute tabular-nums font-medium">trang {t}/{soTrang} · {MOI_TRANG} tin mỗi trang</span>
          <button
            type="button"
            disabled={t >= soTrang}
            onClick={() => setTrang(t + 1)}
            className="rounded-md border border-line px-4 py-1.5 font-semibold text-navy hover:border-brand hover:text-brand disabled:opacity-40 bg-white"
          >
            Sau →
          </button>
        </div>
      )}

      {dangSua && (
        <SuaTinModal
          tin={dangSua}
          onDong={dongSua}
          onDaLuu={(id, updates) => setRows((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...updates } as Dong) : r)))}
          onDaXoa={(id) => setRows((prev) => prev.filter((r) => r.id !== id))}
          baoTin={baoTin}
        />
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
        {thongBao && (
          <p role={thongBao.loi ? "alert" : "status"}
            className={`pointer-events-auto max-w-xl rounded-md px-4 py-2.5 text-sm font-semibold shadow-lg ${thongBao.loi ? "bg-red-700 text-white" : "bg-navy text-white"}`}>
            {thongBao.chu}
          </p>
        )}
      </div>
    </div>
  );
}
