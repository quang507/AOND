import type { Metadata } from "next";
import Link from "next/link";
import { BAN_KINH_KM, MOC, TEN_LOAI, tinGanMoc, type LoaiMoc } from "@/lib/moc";

// SRS-5.1zzzzzzz443: mục lục trang "Nhà bán gần <địa danh>", gom theo loại, kèm số căn đang rao trong bán kính.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Nhà bán gần bệnh viện, chợ, trường, trung tâm thương mại",
  description: `Chọn một địa danh ở Sài Gòn để xem nhà đang rao bán trong bán kính ${BAN_KINH_KM} km, xếp từ gần tới xa. Hỏi từng căn qua Zalo.`,
  alternates: { canonical: "/gan" },
};

const THU_TU: LoaiMoc[] = ["benh_vien", "truong_hoc", "cho", "sieu_thi", "cong_vien"];

export default async function Page() {
  const dem = Object.fromEntries(await Promise.all(MOC.map(async (m) => [m.slug, (await tinGanMoc(m.slug)).length] as const)));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-extrabold [text-wrap:balance] md:text-4xl">Nhà bán gần địa danh</h1>
      <p className="mt-2 max-w-2xl leading-7 text-mute">
        Đi làm ở bệnh viện, con học gần trường, hay muốn ở sát chợ? Chọn một nơi, trang sẽ liệt kê nhà đang rao bán trong bán kính{" "}
        {BAN_KINH_KM} km quanh đó. Số bên cạnh là số căn đang có.
      </p>
      <div className="mt-8 grid gap-10 md:grid-cols-2">
        {THU_TU.map((loai) => (
          <section key={loai}>
            <h2 className="text-lg font-extrabold text-navy">{TEN_LOAI[loai]}</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {MOC.filter((m) => m.loai === loai).map((m) => (
                <li key={m.slug} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
                  <Link href={`/gan/${m.slug}`} className="text-navy hover:text-brand hover:underline">
                    {m.ten}
                  </Link>
                  <span className="shrink-0 tabular-nums text-mute">{dem[m.slug]} căn</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
