"use client";

// SRS-5.1zzzzzzz457: link zalo.me không điền sẵn tin nhắn được, nên sang Zalo là mất mã căn — khách phải tự nhớ "#AD2C9809".
// Bấm nút: chép sẵn "Hỏi căn #<mã>" vào bộ nhớ tạm rồi mở Zalo (tab mới, trang căn vẫn còn), báo một dòng "đã chép, dán vào Zalo".
import { useEffect, useState } from "react";
import FavButton from "@/components/FavButton";
import { zaloLink } from "@/lib/format";

function useChepMa(code: string) {
  const [daChep, setDaChep] = useState(false);
  useEffect(() => {
    if (!daChep) return;
    const t = setTimeout(() => setDaChep(false), 5000);
    return () => clearTimeout(t);
  }, [daChep]);
  const chep = () => {
    try {
      void navigator.clipboard?.writeText(`Hỏi căn #${code}`).then(() => setDaChep(true), () => {});
    } catch {
      /* trình duyệt không cho chép thì vẫn mở Zalo bình thường */
    }
  };
  return { daChep, chep };
}

const BieuTuong = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current" aria-hidden>
    <path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.7 1.4 5.1 3.6 6.7-.1 1-.5 2.1-1.3 3 1.6-.2 3-.8 4-1.5 1.1.3 2.4.5 3.7.5 5.5 0 10-3.9 10-8.7S17.5 3 12 3Z" />
  </svg>
);

/** Nút trong khối "Hỏi về căn" (máy tính). */
export function NutHoiCan({ code }: { code: string }) {
  const { daChep, chep } = useChepMa(code);
  return (
    <>
      <a
        href={zaloLink(`#${code}`)}
        target="_blank"
        rel="noopener"
        onClick={chep}
        className="nut mt-5 w-full bg-zalo py-3.5 text-white hover:opacity-90 active:scale-[0.98]"
      >
        <BieuTuong /> Chat Zalo về căn này
      </a>
      <p aria-live="polite" className="mt-3 text-center text-xs text-mute">
        {daChep ? `Đã chép "Hỏi căn #${code}", dán vào Zalo là tụi em biết căn nào` : "Miễn phí · không cần để lại số điện thoại"}
      </p>
    </>
  );
}

/** Thanh dính đáy màn hình trên điện thoại: Lưu + Chat Zalo, luôn trong tầm ngón cái. Đặt cuối nội dung trang để dừng trước footer. */
export function ThanhHoiCan({ code, gia }: { code: string; gia: string }) {
  const { daChep, chep } = useChepMa(code);
  return (
    <div className="sticky bottom-0 z-30 border-t border-line bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
      <p aria-live="polite" className={daChep ? "mb-2 text-center text-xs font-semibold text-navy" : "sr-only"}>
        {daChep ? `Đã chép "Hỏi căn #${code}", dán vào Zalo` : ""}
      </p>
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold leading-tight text-brand tabular-nums">{gia}</p>
          <p className="text-xs text-mute">#{code}</p>
        </div>
        <FavButton code={code} className="border border-line shadow-none" />
        <a
          href={zaloLink(`#${code}`)}
          target="_blank"
          rel="noopener"
          onClick={chep}
          className="nut min-h-11 shrink-0 bg-zalo text-white hover:opacity-90 active:scale-[0.98]"
        >
          <BieuTuong /> Hỏi qua Zalo
        </a>
      </div>
    </div>
  );
}
