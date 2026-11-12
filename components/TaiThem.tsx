"use client";

// SRS-5.1zzzzzzz447: cuộn vô tận kiểu theme King (jquery-ias) — tới gần cuối danh sách thì tự lấy trang kế từ /api/tin.
// Chỉ TỰ tải 3 lần (thêm 72 tin), sau đó phải bấm "Xem thêm": cuộn vô tận không điểm dừng thì không ai chạm được chân trang.
// Không JS thì trang vẫn có link "Trang sau" như cũ (server render) — hook này chỉ thay nó sau khi trang đã chạy JS.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ListingCard as CardRow } from "@/lib/supabase";

const TU_DONG = 3;

export function useTaiThem(api: string, trangDau: number, tongTrang: number, daCo: CardRow[]) {
  const [them, setThem] = useState<CardRow[]>([]);
  const [anh, setAnh] = useState<Record<string, string>>({});
  const [trang, setTrang] = useState(trangDau);
  const [tong, setTong] = useState(tongTrang);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState(false);
  const [coJs, setCoJs] = useState(false);
  const bay = useRef(false);
  const tuDong = useRef(0);
  const moc = useRef<HTMLDivElement>(null);
  const het = trang >= tong;

  useEffect(() => setCoJs(true), []);

  // Bộ lọc đổi (link chip lọc là điều hướng mềm, component giữ nguyên) → bỏ tin đã nối thêm của bộ lọc cũ.
  useEffect(() => {
    setThem([]);
    setAnh({});
    setTrang(trangDau);
    setTong(tongTrang);
    setLoi(false);
    tuDong.current = 0;
  }, [api, trangDau, tongTrang]);

  const taiTiep = useCallback(async () => {
    if (bay.current || trang >= tong) return;
    bay.current = true;
    setDangTai(true);
    setLoi(false);
    try {
      const r = await fetch(`${api}${api.includes("?") ? "&" : "?"}trang=${trang + 1}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { tin: CardRow[]; anh: Record<string, string>; tongTrang: number };
      setThem((cu) => {
        // Tin mới lên kệ giữa chừng đẩy lệch phân trang theo offset → bỏ tin đã hiện, khỏi trùng thẻ.
        const co = new Set([...daCo, ...cu].map((l) => l.id));
        return [...cu, ...j.tin.filter((l) => !co.has(l.id))];
      });
      setAnh((a) => ({ ...a, ...j.anh }));
      setTrang(trang + 1);
      setTong(j.tongTrang);
    } catch {
      setLoi(true);
    } finally {
      bay.current = false;
      setDangTai(false);
    }
  }, [api, trang, tong, daCo]);

  // Dựng lại observer sau mỗi trang: nếu mốc vẫn trong tầm nhìn (màn hình cao, ít tin) thì nó báo ngay và tải tiếp.
  useEffect(() => {
    const el = moc.current;
    if (!el || het || loi || tuDong.current >= TU_DONG || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting && tuDong.current < TU_DONG) {
          tuDong.current += 1;
          io.disconnect();
          void taiTiep();
        }
      },
      { rootMargin: "0px 0px 600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [het, loi, taiTiep, coJs]);

  return { them, anh, trang, het, dangTai, loi, coJs, taiTiep, moc };
}

export function NutTaiThem({
  t,
  dangXem,
  tongTin,
  dauUrl,
}: {
  t: ReturnType<typeof useTaiThem>;
  dangXem: number;
  tongTin: number;
  dauUrl?: string;
}) {
  return (
    <div ref={t.moc} className="flex flex-col items-center gap-3 text-sm">
      <p className="tabular-nums text-mute" aria-live="polite">
        {t.dangTai ? "Đang tải thêm tin…" : `Đang xem ${dangXem} / ${tongTin} tin`}
      </p>
      {t.loi ? (
        <button type="button" onClick={() => void t.taiTiep()} className="nut nut-phu">
          Chưa tải được, thử lại
        </button>
      ) : !t.het ? (
        <button type="button" onClick={() => void t.taiTiep()} disabled={t.dangTai} className="nut nut-phu min-w-48">
          {t.dangTai ? <span className="vong-cho" aria-hidden /> : null}
          {t.dangTai ? "Đang tải" : "Xem thêm tin"}
        </button>
      ) : dangXem > 0 ? (
        <p className="text-mute">Đã hết tin theo bộ lọc này</p>
      ) : null}
      {dauUrl && (
        <a href={dauUrl} className="text-xs font-semibold text-brand hover:underline">
          Xem lại từ trang đầu
        </a>
      )}
    </div>
  );
}
