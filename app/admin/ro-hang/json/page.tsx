"use client";
// /admin/ro-hang/json — JSON bóc tách CHIA NHÓM, MỖI TIN MỘT FILE (FR-187,
// chủ dự án 09/09/2026: "file json dành cho từng mã BĐS chứ không phải nguyên
// một rổ dài; trang nào bot đã bóc ra thì ghi trước; trường null không hiển
// thị; chia nhóm luôn"). Đọc view `boc_tach_v` (hàm `boc_tach_nhom` gộp cột
// listings + fact chủ nhà trả lời + ảnh trong kho + điểm tin, bỏ null) qua
// RLS admin. Tải/chép là từng tin; không còn nút tải cả rổ.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { TYPE_LABEL } from "@/lib/format";
import BocTachNhom, { NHAN_NHOM, type Nhom } from "@/components/admin/BocTachNhom";

type Tin = {
  id: string;
  code: string | null;
  legacy_code: string | null;
  status: string;
  deal: "ban" | "cho_thue";
  property_type: string | null;
  location_raw: string | null;
  ward: string | null;
  district: string | null;
  price_raw: string | null;
  gap: boolean | null;
  chu_noi_du_at: string | null;
  created_at: string;
  nhom: Nhom;
};

const khongDau = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

const soNhom = (n: Nhom) => Object.keys(n).filter((k) => k !== "tin" && k !== "diem").length;

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [rows, setRows] = useState<Tin[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loai, setLoai] = useState("");
  const [nhomLoc, setNhomLoc] = useState("");
  const [mo, setMo] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setRole("anon");
      const { data: a } = await supabase
        .from("admins").select("email").eq("email", user.email ?? "").maybeSingle();
      if (!a) return setRole("user");
      setRole("admin");
      const { data, error } = await supabase
        .from("boc_tach_v")
        .select("id, code, legacy_code, status, deal, property_type, location_raw, ward, district, price_raw, gap, chu_noi_du_at, created_at, nhom")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) setLoi(error.message);
      setRows((data ?? []) as unknown as Tin[]);
    });
  }, []);

  const loc = useMemo(() => {
    const kq = khongDau(q.trim());
    let xs = rows;
    if (loai) xs = xs.filter((t) => (t.property_type ?? "chua_ro") === loai);
    if (nhomLoc) xs = xs.filter((t) => t.nhom?.[nhomLoc] !== undefined);
    if (kq) xs = xs.filter((t) => khongDau(JSON.stringify(t.nhom ?? {})).includes(kq));
    return xs;
  }, [rows, q, loai, nhomLoc]);

  const theoLoai = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of rows) { const k = t.property_type ?? "chua_ro"; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

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

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8">
      <header>
        <div className="flex items-center gap-2">
          <Link href="/admin/ro-hang" className="text-sm font-semibold text-brand hover:underline">
            Rổ hàng (Excel)
          </Link>
          <span className="text-mute text-xs">/</span>
          <span className="text-xs text-mute font-medium">JSON</span>
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">Rổ hàng BĐS (JSON từng tin)</h1>
        <p className="mt-1 text-sm text-mute tabular-nums">
          {rows.length} tin · hiển thị {loc.length} · mỗi tin một JSON chia {Object.keys(NHAN_NHOM).length} nhóm ({Object.values(NHAN_NHOM).join(" · ").toLowerCase()}) · trường trống không liệt kê · tải từng tin
        </p>
      </header>

      {loi && (
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-brand">
          Không đọc được: {loi}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm trong JSON: mã tin, đường, phường, người rao, câu chủ nhà trả lời…"
          className="min-w-[280px] flex-1 rounded-md border border-line bg-white px-4 py-2 text-sm outline-none focus:border-brand"
        />
        <select value={loai} onChange={(e) => setLoai(e.target.value)} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="">Mọi loại BĐS</option>
          {theoLoai.map(([k, n]) => (
            <option key={k} value={k}>{k === "chua_ro" ? "Chưa rõ loại" : TYPE_LABEL[k] ?? k} ({n})</option>
          ))}
        </select>
        <select value={nhomLoc} onChange={(e) => setNhomLoc(e.target.value)} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="">Mọi nhóm</option>
          {Object.entries(NHAN_NHOM).filter(([k]) => k !== "tin" && k !== "diem").map(([k, v]) => (
            <option key={k} value={k}>Có nhóm: {v}</option>
          ))}
        </select>
      </div>

      <div className="mt-5 space-y-3">
        {loc.map((t) => {
          const dangMo = mo.has(t.id);
          const diem = (t.nhom?.diem as { tong?: number } | undefined)?.tong;
          return (
            <section key={t.id} className="rounded-2xl border border-line bg-white">
              <button
                type="button"
                onClick={() => setMo((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left"
              >
                <span className="font-mono text-sm font-bold text-brand">{t.code ?? "(chưa mã)"}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-navy">
                  {t.property_type && t.property_type !== "chua_ro" ? TYPE_LABEL[t.property_type] ?? t.property_type : "chưa rõ loại"}
                </span>
                <span className="text-sm text-navy">
                  {[t.location_raw, t.ward, t.district].filter(Boolean).join(", ") || "-"}
                </span>
                <span className="text-xs text-mute">{t.deal === "ban" ? "Bán" : "Cho thuê"} · {t.price_raw ?? "-"} · {t.status}</span>
                {t.gap === true && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">gấp</span>}
                {t.chu_noi_du_at && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-mute">chủ nói đủ</span>}
                <span className="ml-auto text-xs text-mute tabular-nums">
                  {soNhom(t.nhom ?? {})} nhóm{typeof diem === "number" ? ` · ${diem} điểm` : ""} · {dangMo ? "thu gọn ▲" : "xem JSON ▼"}
                </span>
              </button>
              {dangMo && (
                <div className="border-t border-line px-4 py-3">
                  <BocTachNhom ma={t.code} nhom={t.nhom} />
                </div>
              )}
            </section>
          );
        })}
        {loc.length === 0 && !loi && (
          <p className="py-10 text-center text-sm text-mute">Chưa có tin nào khớp bộ lọc.</p>
        )}
      </div>
    </div>
  );
}
