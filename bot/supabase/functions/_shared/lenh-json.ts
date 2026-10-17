// lenh-json.ts — FR-217 (23/09/2026): lệnh TEST "/json" trong Zalo — in ra thứ bot ĐÃ LƯU cho chính người nhắn.
//
// Chủ dự án 23/09: "tạo lệnh /json thì phải show ra được cái gì mà bot bóc tách ra rồi nếu tao nhắn trong zalo lệnh
// này … hay vector thì phải giải vector ra mới dc". Vector (FR-216) là 768 con số, KHÔNG giải ngược ra chữ được —
// nên in VĂN BẢN đã đem nhúng (`van_ban_nhung`) + lúc nhúng; đó chính là "nghĩa" mà vector mang.
//
// Chỉ đọc, chỉ dữ liệu CỦA người nhắn (theo zalo_user_id), không gọi model. Công tắc riêng `app_config.lenh_json`
// (bat | tat, 20260923f) — KHÔNG dùng chung `test_reset_hello`, vì bật cái đó là bật luôn "hello" xoá dữ liệu.

import type { serviceClient } from "./claude.ts";

type Db = ReturnType<typeof serviceClient>;

const COT_TIN =
  "id, code, status, deal, property_type, location_raw, street, ward, district, area_m2, frontage_m, length_m, " +
  "rear_width_m, price_raw, price_vnd, floors, floors_text, bedrooms, bathrooms, access_type, alley_width_m, legal_status, " +
  "has_completion, direction, floor, car_in_house, corner_lot, has_elevator, nhan, boc_tach, nhung_luc, created_at";

/** Bỏ khoá null / rỗng cho gọn. */
function gon(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) =>
    v != null && v !== "" && !(Array.isArray(v) && v.length === 0)));
}

/** Cắt chuỗi dài thành bong bóng ≤ `tran` ký tự, ưu tiên cắt ở xuống dòng. */
export function chiaBongBong(s: string, tran = 1800, toiDa = 8): string[] {
  const ra: string[] = [];
  let con = s;
  while (con.length > tran && ra.length < toiDa - 1) {
    let cat = con.lastIndexOf("\n", tran);
    if (cat < tran / 2) cat = tran;
    ra.push(con.slice(0, cat));
    con = con.slice(cat).replace(/^\n/, "");
  }
  ra.push(con.length > tran ? con.slice(0, tran - 1) + "…" : con);
  return ra;
}

export async function soanLenhJson(client: Db, zalo: string): Promise<string[]> {
  const khoi: string[] = [];
  const [{ data: sel, error: selErr }, { data: buy, error: buyErr }] = await Promise.all([
    client.from("sellers").select("id, seller_type, xung_ho, active_listing_id").eq("zalo_user_id", zalo).maybeSingle(),
    client.from("buyers").select("id, preferences").eq("zalo_user_id", zalo).maybeSingle(),
  ]);
  if (selErr) khoi.push(`(lỗi đọc người bán: ${selErr.message})`);
  if (buyErr) khoi.push(`(lỗi đọc người mua: ${buyErr.message})`);

  if (sel) {
    khoi.push("NGƯỜI BÁN: " + JSON.stringify(gon({ loai: sel.seller_type, xung_ho: sel.xung_ho })));
    const { data: tins, error: tinErr } = await client.from("listings").select(COT_TIN)
      .eq("seller_id", sel.id).order("created_at", { ascending: false }).limit(3);
    if (tinErr) khoi.push(`(lỗi đọc tin: ${tinErr.message})`);
    for (const t of (tins ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = String(t.id);
      const [{ data: facts }, { data: vb, error: vbErr }] = await Promise.all([
        client.from("listing_facts").select("question, answer, source, created_at")
          .eq("listing_id", id).order("created_at", { ascending: false }).limit(80),
        client.rpc("van_ban_nhung", { p_id: id }),
      ]);
      // Fact: mới nhất mỗi khoá (như bot đọc).
      const fact: Record<string, string> = {};
      for (const f of (facts ?? []) as Array<{ question: string; answer: string | null; source: string | null }>) {
        if (!(f.question in fact) && f.answer) fact[f.question] = `${f.answer}${f.source ? ` [${f.source}]` : ""}`;
      }
      const { id: _id, boc_tach, nhung_luc, created_at: _c, ...cot } = t;
      const dauTin = t.id === sel.active_listing_id ? " (đang hỏi)" : "";
      khoi.push(`━━ TIN #${t.code}${dauTin}\nCỘT: ${JSON.stringify(gon(cot), null, 1)}`);
      if (Object.keys(fact).length) khoi.push(`FACT: ${JSON.stringify(fact, null, 1)}`);
      if (boc_tach && typeof boc_tach === "object" && Object.keys(boc_tach).length) {
        const s = JSON.stringify(boc_tach);
        khoi.push(`BÓC TÁCH (boc_tach): ${s.length > 700 ? s.slice(0, 700) + "…" : s}`);
      }
      khoi.push(
        `VECTOR (FR-216): ${nhung_luc ? `đã nhúng lúc ${String(nhung_luc).slice(0, 16).replace("T", " ")} UTC` : "chưa nhúng (chỉ nhúng khi tin đã lên kệ; cron 2 phút, cần tim_theo_nghia = bat)"}` +
          ` — 768 số, không giải ra chữ được; văn bản đem nhúng:\n` +
          (vbErr ? `(lỗi đọc: ${vbErr.message})` : String(vb ?? "(trống)")),
      );
    }
    if (!(tins ?? []).length) khoi.push("(chưa có tin nào)");
  }
  if (buy) khoi.push("NGƯỜI MUA — hồ sơ nhu cầu: " + JSON.stringify(gon((buy.preferences ?? {}) as Record<string, unknown>), null, 1));
  if (!sel && !buy) khoi.push("Chưa có dữ liệu nào cho Zalo này.");
  return chiaBongBong("(TEST /json) Dữ liệu bot đang lưu cho mình:\n" + khoi.join("\n"));
}
