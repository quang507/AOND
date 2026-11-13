// SRS-5.1zzzzzzz457: tin đã xoá / gỡ khỏi kệ vẫn nằm trên /mua-ban, trang tag, trang chủ tới hết hạn bộ đệm (danh sách 3 giờ),
// bấm vào ra 404 — đánh giá 13/11 gặp 3/5 thẻ đầu /mua-ban như vậy. Kho không gọi về web khi tin đổi (bot ở máy 146, admin ghi
// thẳng Supabase), nên web tự lành: ai mở trúng tin đã gỡ (trang not-found của /nha-dat) hoặc admin vừa xoá / đổi trạng thái thì
// gọi POST {code} vào đây. Route TỰ KIỂM trong DB: tin còn hiện thì không làm gì; đã gỡ thật mới xoá bộ đệm danh sách.
// Chặn lạm dụng: mỗi máy chủ làm mới tối đa một lần / 60 giây (gọi bừa mã lạ cũng chỉ tốn một truy vấn nhỏ).
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { supabase, TRANG_THAI_HIEN } from "@/lib/supabase";

const GIAN_CACH_MS = 60_000;
let lanCuoi = 0;

export async function POST(req: NextRequest) {
  let code = "";
  try {
    const b = (await req.json()) as { code?: unknown };
    code = typeof b?.code === "string" ? b.code.trim() : "";
  } catch {
    /* bỏ qua: thân không phải JSON */
  }
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) return NextResponse.json({ loi: "code" }, { status: 400 });

  const { data } = await supabase.from("listings").select("id").ilike("code", code).in("status", TRANG_THAI_HIEN).limit(1);
  if (data?.length) return NextResponse.json({ conHien: true });

  const bayGio = Date.now();
  if (bayGio - lanCuoi < GIAN_CACH_MS) return NextResponse.json({ conHien: false, lamMoi: false });
  lanCuoi = bayGio;
  revalidateTag("listings"); // /mua-ban, /cho-thue, /api/tin, trang tag (lib/duyet-tin, lib/tin-tag)
  revalidatePath("/"); // feed trang chủ (ISR 3 giờ)
  revalidatePath("/[tag]", "page");
  revalidatePath("/gan/[slug]", "page");
  revalidatePath(`/nha-dat/${code}`);
  return NextResponse.json({ conHien: false, lamMoi: true });
}
