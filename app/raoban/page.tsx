import type { Metadata } from "next";
import { zaloLink } from "@/lib/format";

export const metadata: Metadata = {
  title: "Rao bán nhà - một câu là xong",
  description:
    "Rao bán nhà đất Sài Gòn, Long An không cần điền form: nhắn một câu qua Zalo, AI bóc tách và viết tin giùm. Phí chỉ khi bán được: chính chủ 1%, môi giới 0.5%.",
};

const STEPS = [
  ["1", "Nhắn một câu", "“Bán nhà HXH xe tải quay đầu, gần ngã tư Trần Bình Trọng, 9 tỉ bớt lộc, Phường 4 Quận 5” - vậy là đủ."],
  ["2", "Tụi em viết tin giùm", "AI bóc tách vị trí, giá, quy mô và viết lại nhiều phiên bản; anh chị duyệt một cái là đăng."],
  ["3", "Rao tới khi gặp đúng người mua", "Khách hỏi gì tụi em trả lời; chỉ nhắn anh chị khi thật sự cần xác minh hoặc chốt lịch xem. Không spam."],
];

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold md:text-4xl">
        Rao bán? <span className="text-brand">Một câu là xong.</span>
      </h1>
      <p className="mt-3 text-navy/70">
        Không form, không tài khoản, không phí đăng tin. Phí chỉ phát sinh khi
        bán được: chính chủ 1% - môi giới 0.5% giá trị giao dịch.
      </p>

      <div className="mt-8 space-y-4">
        {STEPS.map(([n, title, desc]) => (
          <div key={n} className="flex gap-4 rounded-king border border-line p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">
              {n}
            </span>
            <div>
              <p className="font-bold">{title}</p>
              <p className="mt-1 text-sm text-mute">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <a
        href={zaloLink("raoban")}
        className="mt-8 block rounded-full bg-zalo py-4 text-center text-lg font-bold text-white hover:opacity-90"
      >
        Nhắn câu rao qua Zalo ngay
      </a>
      <p className="mt-3 text-center text-sm text-mute">
        Chủ nhà ngại gõ? Gọi tụi em đọc miệng cũng được - CTV ghi giùm.
      </p>
    </div>
  );
}
