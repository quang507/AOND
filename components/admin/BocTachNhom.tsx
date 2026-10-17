"use client";
// FR-187 (09/09/2026): JSON bóc tách CHIA NHÓM của MỘT tin — đọc từ view
// `boc_tach_v` (hàm `boc_tach_nhom` trong DB gộp cột listings + fact + ảnh +
// điểm, bỏ mọi trường null). Dùng ở /admin/ro-hang (mở từng dòng) và
// /admin/ro-hang/json. Tải/chép là TỪNG TIN, không phải cả rổ.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Nhom = Record<string, unknown>;

export const NHAN_NHOM: Record<string, string> = {
  tin: "Tin",
  nguoi_rao: "Người rao",
  vi_tri: "Vị trí",
  thong_so: "Thông số",
  phap_ly: "Pháp lý",
  gia: "Giá",
  cho_thue: "Cho thuê",
  khai_thac: "Khai thác",
  anh: "Ảnh",
  bo_sung: "Bổ sung chủ nhà nói thêm",
  cham_soc: "Chăm sóc",
  diem: "Điểm",
};
const THU_TU = Object.keys(NHAN_NHOM);

export const sapNhom = (nhom: Nhom): Nhom => {
  const o: Nhom = {};
  for (const k of THU_TU) if (nhom[k] !== undefined) o[k] = nhom[k];
  for (const k of Object.keys(nhom)) if (!(k in o)) o[k] = nhom[k];
  return o;
};

const demTruong = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  if (Array.isArray(v)) return v.length;
  if (typeof v === "object") return Object.values(v as Nhom).reduce<number>((s, x) => s + (typeof x === "object" && x !== null ? demTruong(x) : 1), 0);
  return 1;
};

export function taiJsonTin(ma: string | null, nhom: Nhom) {
  const blob = new Blob([JSON.stringify(sapNhom(nhom), null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ma ?? "tin"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Đọc JSON nhóm của một tin từ `boc_tach_v`. */
export function useBocTach(listingId: string | null) {
  const [nhom, setNhom] = useState<Nhom | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  useEffect(() => {
    if (!listingId) return;
    let song = true;
    supabase.from("boc_tach_v").select("nhom").eq("id", listingId).maybeSingle().then(({ data, error }) => {
      if (!song) return;
      if (error) setLoi(error.message);
      else setNhom((data?.nhom as Nhom) ?? {});
    });
    return () => { song = false; };
  }, [listingId]);
  return { nhom, loi };
}

export default function BocTachNhom({ ma, nhom, loi }: { ma: string | null; nhom: Nhom | null; loi?: string | null }) {
  const [chep, setChep] = useState(false);
  if (loi) return <p className="text-sm text-brand">Không đọc được JSON: {loi}</p>;
  if (!nhom) return <p className="text-sm text-mute">Đang đọc JSON…</p>;
  const sap = sapNhom(nhom);
  const chepJson = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(sap, null, 2)); setChep(true); setTimeout(() => setChep(false), 1500); } catch { /* trình duyệt chặn thì thôi */ }
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-xs text-mute">
          {Object.keys(sap).length} nhóm · {demTruong(sap)} trường có dữ liệu · trường trống không liệt kê
        </span>
        <span className="ml-auto flex gap-3">
          <button type="button" onClick={chepJson} className="text-xs font-semibold text-brand hover:underline">
            {chep ? "Đã chép" : "Chép JSON"}
          </button>
          <button type="button" onClick={() => taiJsonTin(ma, sap)} className="text-xs font-semibold text-brand hover:underline">
            Tải {ma ?? "tin"}.json
          </button>
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {Object.entries(sap).map(([k, v]) => (
          <section key={k} className="rounded-xl border border-line bg-slate-50/60">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-navy">{NHAN_NHOM[k] ?? k}</span>
              <span className="text-[11px] text-mute tabular-nums">{demTruong(v)}</span>
            </div>
            <pre className="overflow-x-auto border-t border-line px-3 py-2 text-[11px] leading-relaxed text-navy/90">
              {JSON.stringify(v, null, 2)}
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}
