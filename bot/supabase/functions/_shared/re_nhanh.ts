// FR-223 — đọc tin + fact rồi áp bảng rẽ nhánh (`extraction/re-nhanh.ts`, hàm thuần) lên danh sách câu còn
// thiếu của view `listing_missing_facts`. Mọi chỗ chọn câu hỏi kế (chat-reply, ask-seller) đi qua đây để câu
// nhánh ("sổ hồng riêng" → hỏi hoàn công, "chưa có sổ" → hỏi bao giờ ra sổ…) giống nhau ở mọi đường.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ghiLoi } from "./claude.ts";
import { apReNhanh, canReNhanh, type CauThem, type NgCanhReNhanh } from "./extraction/re-nhanh.ts";

type Thieu = { fact_key: string; priority?: number | null; nhom?: string | null };

export async function thieuCoReNhanh<T extends Thieu>(
  client: SupabaseClient, listingId: string | null | undefined, thieu: T[] | null | undefined, vuaNoi: string[] = [], tinNay = "",
  /** Chữ chủ nhà vài lượt gần đây (kể cả tin này) — cho luật kích theo chữ (nở hậu chưa có số mét). */
  lichSu = "",
): Promise<Array<T | CauThem>> {
  const ds = (thieu ?? []) as T[];
  // Không luật nào có thể đụng tới lượt này → khỏi đọc DB (giữ trần số truy vấn mỗi lượt, TOIUU-07).
  if (!listingId || !canReNhanh(ds, vuaNoi, lichSu)) return ds;
  // MỘT truy vấn: tin + fact nhúng (listing_facts chỉ có một khoá ngoại tới listings).
  const { data: l, error: lErr } = await client.from("listings")
    .select("property_type, deal, legal_status, has_completion, rent_income_vnd, rear_width_m, area_m2, description, boc_tach, listing_facts(question, answer)")
    .eq("id", listingId).maybeSingle();
  if (lErr) {
    await ghiLoi(client, "re-nhanh doc tin", lErr.message);
    return ds;
  }
  if (!l) return ds;
  return apReNhanh(ds, ngCanhTin(l as DongTin, lichSu, tinNay), vuaNoi);
}

type DongTin = { property_type: string | null; deal: string | null; legal_status: string | null; has_completion: boolean | null; rent_income_vnd: number | null; rear_width_m: number | null; area_m2: number | null; description: string | null; boc_tach?: { _thong_so_ai?: unknown } | null; listing_facts: Array<{ question: string; answer: string | null }> | null };

function ngCanhTin(r: DongTin, lichSu = "", tinNay = ""): NgCanhReNhanh {
  return {
    // SRS-5.1zzzzzl: AI đã đọc tin (cột thông số do AI quyết) → ý "đang cho thuê" chỉ theo ô AI ghi, từ khoá trên chữ không chạy.
    aiDoc: r.boc_tach?._thong_so_ai === true,
    loai: r.property_type, deal: r.deal, legal_status: r.legal_status, has_completion: r.has_completion,
    // Tin chủ nhà vừa nhắn cũng là bằng chứng: "sổ hồng riêng, hoàn công đủ" — đáp án pháp lý cắt còn "sổ hồng riêng",
    // chữ "hoàn công đủ" chỉ còn trong câu gốc.
    // Câu RAO gốc (`description`) cũng là bằng chứng: "…, đang cho ngân hàng thuê, giá 25 tỷ" không tách thành fact nào,
    // bảng rẽ nhánh chỉ đọc fact nên không biết nhà đang cho thuê và hỏi hoàn công (bắn thật production 24/09, rn-test-f).
    rent_income_vnd: r.rent_income_vnd, rear_width_m: r.rear_width_m, area_m2: r.area_m2, lichSu, facts: [...(r.listing_facts ?? []), ...(r.description ? [{ question: "_mo_ta", answer: r.description }] : []),
      ...(tinNay ? [{ question: "_tin_nay", answer: tinNay }] : [])],
  };
}
