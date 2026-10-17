"use client";
// FR-96 — up nhiều ảnh cho một tin, từ trình duyệt, bằng chính phiên đăng nhập
// (admin hoặc người bán chủ tin). Hàng rào thật là RLS ở `storage.objects` và
// `listing_media` (migration 20260904g): admin ghi bucket `listing-public`
// mọi đường dẫn; người bán chỉ ghi được `<uuid tin của mình>/…`.
//
// Đường đi giống `scripts/up-anh.mjs` (FR-165): UP FILE TRƯỚC, GHI DÒNG SAU;
// ghi dòng hỏng thì xoá file vừa up để không để lại mồ côi. Tên file trên kho
// là UUID của chính dòng media, sinh trước khi up. Ảnh bìa để DB tự chọn
// (trigger `trg_listing_media_bia`) — không gửi `is_cover`.
//
// Nén cơ bản bằng canvas (cạnh dài ≤1600px, JPEG 0,82) để ảnh điện thoại 4–8MB
// còn ~200–400KB: bucket Free có trần 10MB/ảnh và 1GB tổng, mà trang tin thì
// phải tải nhanh (NFR-02).
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const MAX_CANH = 1600;
const CHAT_LUONG = 0.82;

async function nenAnh(file: File): Promise<{ blob: Blob; mime: string; ext: string }> {
  // Không phải ảnh nén được (HEIC không decode được trên nhiều trình duyệt) →
  // để nguyên, bucket sẽ từ chối nếu MIME không nằm trong danh sách cho phép.
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    return { blob: file, mime: file.type, ext: file.name.split(".").pop()?.toLowerCase() || "jpg" };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, loi) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => loi(new Error("không đọc được ảnh"));
      i.src = url;
    });
    const ratio = Math.min(1, MAX_CANH / Math.max(img.width, img.height));
    if (ratio === 1 && file.size < 900_000) return { blob: file, mime: file.type, ext: file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg" };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("trình duyệt không hỗ trợ canvas");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", CHAT_LUONG));
    if (!blob) throw new Error("nén ảnh thất bại");
    return { blob, mime: "image/jpeg", ext: "jpg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type TrangThai = { ten: string; tt: "cho" | "dang" | "xong" | "loi"; loi?: string };

export default function UploadAnh({
  listingId,
  code,
  onDone,
  gon,
}: {
  listingId: string;
  code?: string | null;
  /** Gọi sau khi cả đợt xong, kèm số ảnh lên được. */
  onDone?: (n: number) => void;
  /** Bản gọn cho danh sách tin ở /quan-ly. */
  gon?: boolean;
}) {
  const [hang, setHang] = useState<TrangThai[]>([]);
  const [dangUp, setDangUp] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const chon = async (files: FileList | null) => {
    if (!files?.length || dangUp) return;
    const ds = Array.from(files).slice(0, 20);
    setDangUp(true);
    setHang(ds.map((f) => ({ ten: f.name, tt: "cho" })));
    let ok = 0;
    for (let i = 0; i < ds.length; i++) {
      const f = ds[i];
      setHang((h) => h.map((x, j) => (j === i ? { ...x, tt: "dang" } : x)));
      try {
        const { blob, mime, ext } = await nenAnh(f);
        const mediaId = crypto.randomUUID();
        const dest = `${listingId}/${mediaId}.${ext}`;
        const { error: e1 } = await supabase.storage
          .from("listing-public")
          .upload(dest, blob, { contentType: mime, upsert: false });
        if (e1) throw new Error(e1.message);
        const { error: e2 } = await supabase.from("listing_media").insert({
          id: mediaId, listing_id: listingId, bucket: "listing-public",
          storage_path: dest, media_type: "khac", mime_type: mime, sort_order: i + 1,
        });
        if (e2) {
          // Ghi dòng hỏng → dọn file vừa up, đừng để rác mồ côi (FR-165 bất biến 5).
          await supabase.storage.from("listing-public").remove([dest]);
          throw new Error(e2.message);
        }
        ok++;
        setHang((h) => h.map((x, j) => (j === i ? { ...x, tt: "xong" } : x)));
      } catch (e) {
        // Lỗi client hiện thẳng ra UI — người up phải thấy tấm nào hỏng, vì sao.
        const msg = e instanceof Error ? e.message : String(e);
        setHang((h) => h.map((x, j) => (j === i ? { ...x, tt: "loi", loi: msg } : x)));
      }
    }
    setDangUp(false);
    if (input.current) input.current.value = "";
    onDone?.(ok);
  };

  const soXong = hang.filter((x) => x.tt === "xong").length;
  const soLoi = hang.filter((x) => x.tt === "loi").length;

  return (
    <div className={gon ? "" : "rounded-king border border-line bg-white p-5"}>
      {!gon && (
        <p className="eyebrow text-mute">Ảnh của tin{code ? ` #${code}` : ""}</p>
      )}
      <label className={`${gon ? "" : "mt-3 "}inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-400 px-4 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand focus-within:outline focus-within:outline-2 focus-within:outline-brand ${dangUp ? "opacity-50" : ""}`}>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*"
          disabled={dangUp}
          onChange={(e) => chon(e.target.files)}
          // 14/09/2026 (WCAG 2.1.1): `hidden` bỏ ô khỏi thứ tự Tab — bàn phím không up ảnh được.
          className="sr-only"
        />
        {dangUp ? `Đang up ${soXong + soLoi + 1}/${hang.length}…` : gon ? "+ Thêm ảnh" : "Chọn ảnh (nhiều tấm được)"}
      </label>
      {!gon && (
        <p className="mt-2 text-xs text-mute">
          Tự nén còn ≤1600px trước khi gửi. Tối đa 20 tấm mỗi đợt. Ảnh bìa là tấm đầu - DB tự chọn.
          Sổ đỏ / giấy tờ KHÔNG up ở đây (bucket công khai) - gửi qua Zalo cho admin.
        </p>
      )}
      {hang.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {hang.map((x, i) => (
            <li key={i} className={x.tt === "loi" ? "text-brand" : x.tt === "xong" ? "text-mute" : "text-navy"}>
              {x.tt === "xong" ? "✓" : x.tt === "loi" ? "✗" : x.tt === "dang" ? "…" : "·"} {x.ten}
              {x.loi ? ` - ${x.loi}` : ""}
            </li>
          ))}
          {!dangUp && (
            <li className="pt-1 font-semibold">
              {soXong} ảnh đã lên{soLoi ? `, ${soLoi} lỗi` : ""}. Web hiện ảnh sau ≤5 phút (cache).
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
