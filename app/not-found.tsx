import Link from "next/link";
import { zaloLink } from "@/lib/format";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-7xl font-extrabold text-brand tabular-nums">404</p>
      <h1 className="mt-3 text-2xl font-extrabold">Trang này không có, nhưng nhà thì có</h1>
      <p className="mt-2 text-mute">
        Có thể tin đã bán xong hoặc đường dẫn gõ nhầm. Căn anh chị đang tìm chưa
        chắc đã mất - nhắn tụi em kiểm tra giùm cho.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/mua-ban"
          className="rounded-md border border-line bg-white px-5 py-2.5 font-semibold transition hover:border-brand hover:text-brand active:scale-[0.98]"
        >
          Xem nhà đang bán
        </Link>
        <a
          href={zaloLink("404")}
          className="rounded-md bg-zalo px-5 py-2.5 font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
        >
          Hỏi qua Zalo
        </a>
      </div>
    </div>
  );
}
