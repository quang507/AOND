// SRS-4.5 / FR-02 / FR-08 / FR-09 — cửa tìm kiếm ngôn ngữ tự nhiên.
//
//   GET  /api/search?q=…          → JSON {q, filters, confidence, title, url, empty}
//   GET  /api/search?q=…&go=1     → 302 tới `url` (form GET của trang chủ, không cần JS)
//   POST /api/search  {"q": "…"}  → JSON như trên
//
// Không đụng DB: bóc bằng luật (`lib/parse-query.ts`), kết quả thật do trang
// đích (/mua-ban, /cho-thue hay trang tag) truy vấn — một nơi lọc, không hai.
// Khác đặc tả gốc SRS-4.5 (trả `results` + nới `relaxed`): đã nới ở bước sau
// bằng chip lọc trên trang kết quả + hộp Zalo; ghi ở docs/07.
import { NextResponse, type NextRequest } from "next/server";
import { parseQuery } from "@/lib/parse-query";

export const dynamic = "force-dynamic";

const JSON_HDR = { "content-type": "application/json; charset=utf-8" };

function traLoi(q: string) {
  const r = parseQuery(q);
  return NextResponse.json(r, { headers: JSON_HDR });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (sp.get("go")) {
    // Câu rỗng thì về kho tin; câu không bóc được vẫn sang /mua-ban?q= để trang
    // kết quả mời Zalo (FR-13) — không bao giờ là ngõ cụt (IA-P1).
    const r = parseQuery(q);
    const url = new URL(q ? r.url : "/mua-ban", req.nextUrl.origin);
    return NextResponse.redirect(url, 302);
  }
  return traLoi(q);
}

export async function POST(req: NextRequest) {
  let q = "";
  try {
    const body = (await req.json()) as { q?: unknown };
    q = typeof body?.q === "string" ? body.q : "";
  } catch {
    return NextResponse.json({ error: "Body phải là JSON {\"q\": \"…\"}" }, { status: 400, headers: JSON_HDR });
  }
  return traLoi(q);
}
