import type { Metadata } from "next";
import Link from "next/link";
import { CAM_NANG } from "@/lib/cam-nang";

// SRS-5.1zzzzzzz443: mục lục cẩm nang mua bán nhà.
export const metadata: Metadata = {
  title: "Cẩm nang mua bán nhà Sài Gòn",
  description:
    "Kiểm tra pháp lý trước khi cọc, mua nhà hẻm, sổ chung và vi bằng, các bước công chứng sang tên, thuế phí, nhận ra tin rao ảo. Viết cho người mua nhà ở Sài Gòn.",
  alternates: { canonical: "/cam-nang" },
};

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-extrabold [text-wrap:balance] md:text-4xl">Cẩm nang mua bán nhà</h1>
      <p className="mt-2 leading-7 text-mute">
        Những chuyện nên biết trước khi đặt cọc một căn nhà ở Sài Gòn. Con số nào lấy từ văn bản luật thì có ghi tên văn bản; luật hay đổi,
        nên trước khi ký vẫn hỏi lại công chứng viên hoặc nơi nộp hồ sơ.
      </p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {CAM_NANG.map((b) => (
          <li key={b.slug} className="py-5">
            <Link href={`/cam-nang/${b.slug}`} className="group block">
              <h2 className="text-lg font-extrabold text-navy group-hover:text-brand">{b.tieuDe}</h2>
              <p className="mt-1 text-sm leading-6 text-mute">{b.moTa}</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-mute">
        Công cụ: <Link href="/tinh-lai-vay" className="font-semibold text-brand hover:underline">tính lãi vay</Link> ·{" "}
        <Link href="/thue-hay-mua" className="font-semibold text-brand hover:underline">thuê hay mua</Link> ·{" "}
        <Link href="/gan" className="font-semibold text-brand hover:underline">nhà gần địa danh</Link>
      </p>
    </div>
  );
}
