// SRS-5.1zzzzzzz447: trang kế của danh sách, cho nút "Xem thêm" / tự tải khi cuộn tới cuối (lấy từ theme King: cuộn vô tận).
//   GET /api/tin?deal=ban&<bộ lọc như /mua-ban>&trang=2  → tin /mua-ban, /cho-thue
//   GET /api/tin?tag=<slug>&trang=2                      → tin một trang tag
// Trả {tin, anh, tongTrang}. Cùng hàm truy vấn + cùng khoá cache với trang (lib/duyet-tin, lib/tin-tag) nên không thêm lượt
// gọi DB nào mà bấm "Trang sau" không gọi; CDN giữ thêm 10 phút.
import { NextResponse, type NextRequest } from "next/server";
import { docThamSo, layTin, PAGE_SIZE } from "@/lib/duyet-tin";
import { coverByCode } from "@/lib/photos";
import { layTinTag, MOI_TRANG_TAG } from "@/lib/tin-tag";
import { tagBySlug } from "@/lib/tags";

const TRANG_TOI_DA = 100;
const HDR = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" };

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams;
  const trang = Math.floor(Number(u.get("trang")));
  if (!Number.isFinite(trang) || trang < 1 || trang > TRANG_TOI_DA) return NextResponse.json({ loi: "trang" }, { status: 400 });

  let tin, tongTrang: number;
  const tag = u.get("tag");
  if (tag) {
    if (!tagBySlug(tag)) return NextResponse.json({ loi: "tag" }, { status: 404 });
    const r = await layTinTag(tag, trang);
    tin = r.rows;
    tongTrang = Math.ceil(r.total / MOI_TRANG_TAG);
  } else {
    const deal = u.get("deal");
    if (deal !== "ban" && deal !== "cho_thue") return NextResponse.json({ loi: "deal" }, { status: 400 });
    const { truy } = docThamSo(deal, Object.fromEntries(u.entries()));
    const r = await layTin(truy);
    tin = r.data;
    tongTrang = Math.ceil(r.total / PAGE_SIZE);
  }
  const anh = await coverByCode(tin.map((l) => l.code).filter(Boolean) as string[]);
  return NextResponse.json({ tin, anh, tongTrang }, { headers: HDR });
}
