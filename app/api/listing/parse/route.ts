// SRS-4.6 / FR-92 — bóc tách câu rao của người bán, KHÔNG ghi DB.
//
//   POST /api/listing/parse  {"text": "…"}   (nhận cả "raw_pitch" theo đặc tả gốc)
//   GET  /api/listing/parse?text=…            (tiện curl / kiểm tay)
//
// Trả `fields` + `confidence` từng trường + `needs_review` (trường < 0,7 để S
// kiểm lại — UI-C09). Bản này bằng luật (`lib/parse-query.ts`); phía DB
// `boc_thong_so()` (FR-172) vẫn chạy lúc INSERT — đây là bản xem trước.
import { NextResponse, type NextRequest } from "next/server";
import { parseListing } from "@/lib/parse-query";

export const dynamic = "force-dynamic";

const JSON_HDR = { "content-type": "application/json; charset=utf-8" };

export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get("text") ?? "").trim();
  return NextResponse.json({ text, ...parseListing(text) }, { headers: JSON_HDR });
}

export async function POST(req: NextRequest) {
  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown; raw_pitch?: unknown };
    const v = typeof body?.text === "string" ? body.text : typeof body?.raw_pitch === "string" ? body.raw_pitch : "";
    text = v.trim();
  } catch {
    return NextResponse.json({ error: "Body phải là JSON {\"text\": \"…\"}" }, { status: 400, headers: JSON_HDR });
  }
  if (!text) return NextResponse.json({ error: "Thiếu text" }, { status: 400, headers: JSON_HDR });
  return NextResponse.json({ text, ...parseListing(text) }, { headers: JSON_HDR });
}
