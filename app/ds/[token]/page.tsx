import type { Metadata } from "next";
import ListingCard from "@/components/ListingCard";
import { coverByCode } from "@/lib/photos";
import { supabase, type ListingCard as CardRow } from "@/lib/supabase";
import { zaloLink } from "@/lib/format";

// FR-100 / UF-12 / WF-11 (dựng 04/09/2026) — danh sách riêng `/ds/{token}`.
// Không generateStaticParams (token là bí mật, không liệt kê được) → route ƒ,
// dựng theo từng request; một RPC `doc_danh_sach` (security definer) là toàn
// bộ truy vấn. `noindex, nofollow` (AC-11, IA-11). Không hiện tên/Zalo của B.
// Hết hạn / token sai → trang "hết hạn" + Zalo, KHÔNG 404 trắng (IA-P1).
export const dynamic = "force-dynamic";

type Ds = { title: string | null; created_at: string; expires_at: string; listings: CardRow[] };

async function docDanhSach(token: string): Promise<Ds | null> {
  if (!/^[0-9a-f]{16,64}$/.test(token)) return null;
  const { data, error } = await supabase.rpc("doc_danh_sach", { p_token: token });
  if (error) throw error; // instrumentation.ts ghi vào bot_errors (FR-152 d)
  return (data as Ds | null) ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Danh sách tụi em lọc riêng cho anh chị",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ds = await docDanhSach(token);

  if (!ds) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Danh sách này đã hết hạn</h1>
        <p className="mt-2 leading-7 text-mute">
          Link danh sách chỉ sống 30 ngày. Nhắn Zalo một câu, tụi em lọc lại danh sách mới đúng nhu cầu hiện tại của anh chị.
        </p>
        <a href={zaloLink("ds:het-han")}
          className="mt-6 inline-block rounded-md bg-brand px-6 py-3 font-bold text-white transition hover:bg-brand-dark active:scale-[0.98]">
          Xin danh sách mới qua Zalo
        </a>
      </div>
    );
  }

  const covers = await coverByCode(ds.listings.map((l) => l.code));
  const tao = new Date(ds.created_at);

  return (
    <>
      <div className="bg-navy pb-16 pt-10 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <p className="eyebrow text-brand">Danh sách tụi em lọc riêng cho anh chị</p>
          <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">{ds.title ?? "Các căn hợp nhu cầu"}</h1>
          <p className="mt-2 text-white/60">
            {ds.listings.length} căn · lọc lúc {tao.toLocaleString("vi-VN")} · link sống tới{" "}
            {new Date(ds.expires_at).toLocaleDateString("vi-VN")}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-12">
        {/* WF-11: hộp mời chat ĐẦU trang - mỗi thẻ có mã #ID để hỏi lại (IA-P3) */}
        <div className="-mt-10 flex flex-col gap-3 rounded-king bg-white p-5 shadow-[0_18px_40px_rgba(13,37,61,0.14)] sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-extrabold">Ưng căn nào, nhắn mã căn đó qua Zalo là tụi em gửi thêm hình và hẹn xem.</p>
            <p className="mt-1 text-sm text-mute">Không ưng căn nào cũng nói giùm tụi em một câu - để lọc đợt sau sát hơn.</p>
          </div>
          <a href={zaloLink(`ds:${token.slice(0, 8)}`)}
            className="shrink-0 rounded-md bg-brand px-6 py-3 text-center font-bold text-white transition hover:bg-brand-dark active:scale-[0.98]">
            Chat Zalo
          </a>
        </div>

        {ds.listings.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ds.listings.map((l) => (
              <ListingCard key={l.id} listing={l} photo={l.code ? covers[l.code] : null} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-king border border-line bg-cream p-8 text-center">
            <p className="font-bold">Các căn trong danh sách này đã giao dịch xong hoặc tạm ẩn.</p>
            <p className="mt-1 text-sm text-mute">Nhắn Zalo, tụi em gửi các căn tương tự đang bán.</p>
          </div>
        )}
      </div>
    </>
  );
}
