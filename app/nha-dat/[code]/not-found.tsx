import Link from "next/link";
import BaoTinDaGo from "@/components/BaoTinDaGo";
import { zaloLink } from "@/lib/format";

// SRS-5.1zzzzzzz457: mã tin không còn trên kệ (đã bán, đã gỡ, hoặc gõ nhầm). Nói thẳng chuyện đó thay cho trang 404 chung,
// và báo về /api/tin-da-go để danh sách thôi hiện thẻ của tin này.
export default function TinKhongCon() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <BaoTinDaGo />
      <h1 className="text-2xl font-extrabold [text-wrap:balance] md:text-3xl">Căn này đã bán hoặc đã gỡ khỏi kệ</h1>
      <p className="mt-3 leading-7 text-mute">
        Tin có thể vừa giao dịch xong hoặc chủ nhà rút lại. Danh sách đang được cập nhật lại. Muốn tìm căn tương tự cùng khu, cùng tầm
        giá thì nhắn Zalo, tụi em gửi liền.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/mua-ban" className="nut nut-phu">
          Xem nhà đang bán
        </Link>
        <Link href="/cho-thue" className="nut nut-phu">
          Nhà cho thuê
        </Link>
        <a href={zaloLink("tin-da-go")} target="_blank" rel="noopener" className="nut bg-zalo text-white hover:opacity-90">
          Nhờ tìm căn tương tự
        </a>
      </div>
    </div>
  );
}
