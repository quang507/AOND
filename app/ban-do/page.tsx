import type { Metadata } from "next";
import BanDoKhung from "@/components/BanDoKhung";

// SRS-5.1zzzzzzz206 (26/10/2026): trang tĩnh, không truy vấn lúc dựng — dữ liệu theo KHUNG đang xem do trình duyệt xin qua rpc
// `ban_do_khung` (một request cho mọi lớp, mỗi lớp ≤ 300 điểm). Trước đó trang kéo cố định 300 tin vào HTML, revalidate 3 giờ.
export const metadata: Metadata = {
  title: "Bản đồ nhà đất",
  description:
    "Xem nhà đất đang bán và cho thuê, dự án và tên đường trên bản đồ — kéo bản đồ tới đâu, danh sách đổi theo tới đó.",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Bản đồ nhà đất</h1>
        <p className="text-sm text-mute">ghim đậm = bán, ghim trắng = cho thuê</p>
      </div>
      <p className="mt-1 text-xs text-mute/70">
        Ghim theo địa chỉ trên tin (đường/hẻm, chưa tới số nhà) - địa chỉ chính xác tụi em chia sẻ khi hẹn xem nhà.
      </p>
      <BanDoKhung />
    </div>
  );
}
