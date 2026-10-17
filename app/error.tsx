"use client";
// FR-152 — trang lỗi tử tế thay cho màn hình trắng của Next.
// Lỗi đã được `instrumentation.ts` ghi vào `bot_errors` ở phía server; trang này
// chỉ lo phần khách nhìn thấy: đừng để họ tưởng cả web sập, và giữ đường sang
// Zalo — hỏng trang tin không có nghĩa là hỏng người trực.
import Link from "next/link";
import { zaloLink } from "@/lib/format";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-extrabold">Trang này đang trục trặc</h1>
      <p className="mt-2 leading-7 text-mute">
        Lỗi bên tụi em, không phải do anh chị. Tụi em đã nhận được báo rồi.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-brand px-6 py-3 font-bold text-white transition hover:bg-brand-dark active:scale-[0.98]"
        >
          Thử lại
        </button>
        <a
          href={zaloLink("loi-trang")}
          className="rounded-md border border-line bg-white px-6 py-3 font-bold transition hover:border-brand hover:text-brand"
        >
          Hỏi thẳng qua Zalo
        </a>
      </div>
      <Link href="/" className="mt-6 inline-block text-sm font-semibold text-mute hover:text-brand">
        Về trang chủ
      </Link>
    </div>
  );
}
