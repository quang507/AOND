// /moi-gioi/dang-ky — môi giới, sàn đăng ký vào mạng lưới (SRS-5.1zzzzzzz523, chủ dự án 17/11/2026: "Form trên web như HiFriendz và có
// trang trong admin quản lý"). Trang tĩnh; form gửi qua rpc `gui_dang_ky_moi_gioi`, admin xem ở /admin/moi-gioi.
import type { Metadata } from "next";
import Link from "next/link";
import FormDangKyMoiGioi from "@/components/FormDangKyMoiGioi";
import { PT_MG } from "@/lib/phi";

export const metadata: Metadata = {
  title: "Đăng ký làm môi giới cùng AI Ơi Nhà Đất",
  description:
    "Môi giới, sàn ở Sài Gòn và các tỉnh lân cận đăng ký vào mạng lưới AI Ơi Nhà Đất: điền form 2 phút, bên em nhắn Zalo lại, gửi hàng qua Zalo.",
};

const BUOC = [
  ["Điền form", "Khoảng 2 phút. Chỉ cần họ tên, số Zalo và khu vực anh chị đang làm, chưa cần giấy tờ gì."],
  ["Bên em nhắn Zalo", "Người phụ trách nhắn qua số anh chị để lại để trao đổi cách phối hợp."],
  ["Gửi hàng qua Zalo", "Anh chị nhắn căn đang nhận bán, cho thuê; trợ lý soạn tin và đăng lên web."],
];

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav aria-label="Đường dẫn" className="text-sm text-mute">
        <Link href="/moi-gioi" className="font-semibold text-brand hover:underline">Môi giới</Link> <span aria-hidden>/</span> Đăng ký
      </nav>
      <h1 className="mt-2 text-3xl font-extrabold [text-wrap:balance]">Đăng ký làm môi giới cùng AI Ơi Nhà Đất</h1>
      <p className="mt-2 max-w-xl text-mute">
        Phí {PT_MG} mỗi giao dịch thành công, đăng tin không mất phí. Mạng lưới giữ chuẩn tối thiểu 10 tin đang rao và tỷ lệ chốt từ 5%
        trong 6 tháng.
      </p>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        {BUOC.map(([ten, ta], i) => (
          <li key={ten} className="rounded-lg border border-line bg-white p-4">
            <p className="text-xs font-bold text-brand tabular-nums">Bước {i + 1}</p>
            <p className="mt-1 font-bold text-navy">{ten}</p>
            <p className="mt-1 text-sm text-mute">{ta}</p>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <FormDangKyMoiGioi />
      </div>

      <p className="mt-6 text-sm text-mute">
        Anh chị là <strong>chính chủ</strong> muốn rao nhà? Không cần đăng ký -{" "}
        <Link href="/raoban" className="font-semibold text-brand hover:underline">rao qua Zalo một câu là xong</Link>.
      </p>
    </div>
  );
}
