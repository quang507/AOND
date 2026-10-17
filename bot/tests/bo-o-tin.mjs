// SRS-5.1zzzzzzq (Zalo thật 14/10/2026 10:05, tin Trần Bình Trọng: "bỏ cái hướng Đông Nam ra" → bot từ chối, tin lên kệ vẫn có hướng).
// Kiểm phần thuần + cửa ghi `ghiFact` (_shared/ghi-fact.ts) với client giả: ô không bắt buộc bỏ được, nhớ giá trị đã bỏ, lượt AI đọc lại
// tin cũ không ghi lại đúng giá trị đó; khách tự nhắn lại thì ghi; ô lõi không nằm trong danh sách bỏ được.
import { boOTin, cungGiaTriO, ghiFact, nhacGiaTriKhac, O_XOA_DUOC } from "../supabase/functions/_shared/ghi-fact.ts";

let dat = 0, hong = 0;
const la = (ten, ok, ct = "") => { if (ok) { dat++; console.log(`\x1b[32m✓\x1b[0m ${ten}`); } else { hong++; console.log(`\x1b[31m✗\x1b[0m ${ten}${ct ? `\n    ${ct}` : ""}`); } };

// ── Phần thuần ──
la("BO-01 ô bỏ được: hướng, hẻm, phòng ngủ, pháp lý; ô lõi (giá, diện tích, địa chỉ, phường, số tầng) không",
  ["huong", "do_rong_hem", "so_phong_ngu", "phap_ly"].every((k) => O_XOA_DUOC[k]) && ["gia", "dien_tich", "vi_tri", "phuong", "ket_cau"].every((k) => !O_XOA_DUOC[k]));
la("BO-02 cùng giá trị bỏ qua nhãn ô: 'hướng Đông Nam' = 'Đông Nam' = 'dong nam'", cungGiaTriO("hướng Đông Nam", "Đông Nam") && cungGiaTriO("dong nam", "hướng Đông Nam"));
la("BO-03 '4 phòng ngủ' = '4'; 'hẻm 5m' = '5m'; 'Đông Nam' ≠ 'Tây Bắc'", cungGiaTriO("4 phòng ngủ", "4") && cungGiaTriO("hẻm 5m", "5m") && !cungGiaTriO("Đông Nam", "Tây Bắc"));
la("BO-04 (GVC-02, 22/09) 'xoá cái hẻm 4m ghi nhầm đi' khi tin đang ghi hẻm 3.5m → khách gọi giá trị KHÁC, không bỏ", nhacGiaTriKhac("do_rong_hem", "xoá cái hẻm 4m ghi nhầm đi", "hẻm 3.5m"));
la("BO-05 'bỏ cái hướng Đông Nam ra' khi đang ghi hướng Đông Nam → bỏ được; 'bỏ hướng Tây đi' khi đang ghi Đông Nam → không",
  !nhacGiaTriKhac("huong", "bỏ cái hướng Đông Nam ra", "hướng Đông Nam") && nhacGiaTriKhac("huong", "bỏ hướng Tây đi", "hướng Đông Nam"));
la("BO-06 (cách nói mới) 'xoá giùm số phòng ngủ đi em' không gọi số nào → bỏ được", !nhacGiaTriKhac("so_phong_ngu", "xoá giùm số phòng ngủ đi em", "4 phòng ngủ"));

// ── Client giả: listings (boc_tach + cột), listing_facts, rpc ghi_fact_listing ──
const taoDb = () => {
  const d = { listings: [{ id: "L1", direction: "Đông Nam", boc_tach: { huong: "Đông Nam", gia: "7 tỷ 5" } }], listing_facts: [{ listing_id: "L1", question: "huong", answer: "Đông Nam" }], rpc: [] };
  const chon = (t, loc) => d[t].filter((r) => loc.every(([k, v]) => r[k] === v));
  const from = (t) => {
    const loc = [];
    let doi = null, xoa = false;
    const q = {
      select: () => q, eq: (k, v) => { loc.push([k, v]); return q; },
      maybeSingle: async () => ({ data: chon(t, loc)[0] ?? null, error: null }),
      update: (o) => { doi = o; return q; }, delete: () => { xoa = true; return q; },
      then: (ok) => {
        if (doi) for (const r of chon(t, loc)) Object.assign(r, doi);
        if (xoa) d[t] = d[t].filter((r) => !loc.every(([k, v]) => r[k] === v));
        return Promise.resolve({ data: null, error: null }).then(ok);
      },
    };
    return q;
  };
  const rpc = async (ten, a) => { d.rpc.push([ten, a]); if (ten === "ghi_fact_listing") d.listing_facts.push({ listing_id: a.p_listing_id, question: a.p_question, answer: a.p_answer }); return { data: null, error: null }; };
  return { d, client: { from, rpc } };
};

{
  const { d, client } = taoDb();
  const kq = await boOTin(client, "L1", "huong", "hướng Đông Nam");
  la("BO-07 boOTin: fact hướng KHÔNG xoá mà đổi thành 'huong_da_bo' (còn trong DB), cột hướng trống, bỏ khoá boc_tach.huong, nhớ o_da_bo.huong",
    kq.daBo === "hướng Đông Nam" && d.listings[0].direction === null && !d.listing_facts.some((f) => f.question === "huong") &&
      d.listing_facts.some((f) => f.question === "huong_da_bo" && f.answer === "Đông Nam") &&
      !("huong" in d.listings[0].boc_tach) && d.listings[0].boc_tach.o_da_bo?.huong === "hướng Đông Nam" && d.listings[0].boc_tach.gia === "7 tỷ 5",
    JSON.stringify(d.listings[0]));
  // Cùng client (một lượt): lượt chốt tin đọc lại "hướng Đông Nam" trong lịch sử → không ghi lại.
  const ai = await ghiFact(client, { p_listing_id: "L1", p_question: "huong", p_answer: "Đông Nam", p_source: "ai_kiem" });
  la("BO-08 lượt AI (ai_kiem) đưa ĐÚNG giá trị đã bỏ → boQua o_da_bo, không gọi ghi_fact_listing", ai.boQua === "o_da_bo" && !d.rpc.length, JSON.stringify({ ai, rpc: d.rpc }));
  const moi = await ghiFact(client, { p_listing_id: "L1", p_question: "huong", p_answer: "Tây Bắc", p_source: "ai_kiem" });
  la("BO-09 lượt AI đưa giá trị KHÁC (khách nói hướng mới) → ghi", !moi.boQua && d.rpc.length === 1, JSON.stringify(d.rpc));
  const khach = await ghiFact(client, { p_listing_id: "L1", p_question: "huong", p_answer: "Đông Nam", p_source: "seller_chat" });
  la("BO-10 khách tự nhắn lại giá trị đã bỏ (seller_chat) → ghi (ý khách mới nhất thắng)", !khach.boQua && d.rpc.length === 2, JSON.stringify(d.rpc));
}
{
  const { d, client } = taoDb();
  // Lượt sau (client mới): dấu đã bỏ đọc từ DB.
  d.listings[0].boc_tach.o_da_bo = { so_phong_ngu: "4 phòng ngủ" };
  const ai = await ghiFact(client, { p_listing_id: "L1", p_question: "so_phong_ngu", p_answer: "4", p_source: "ai_chot" });
  const gia = await ghiFact(client, { p_listing_id: "L1", p_question: "gia", p_answer: "7 tỷ 5", p_source: "ai_kiem" });
  la("BO-11 lượt sau: AI ghi '4' phòng ngủ đã bỏ → chặn; ô ngoài danh sách (giá) không bị đụng",
    ai.boQua === "o_da_bo" && !gia.boQua && d.rpc.length === 1 && d.rpc[0][1].p_question === "gia", JSON.stringify(d.rpc));
}

console.log(hong ? `\n${hong}/${dat + hong} CA HỎNG` : `\nTẤT CẢ ${dat} CA ĐẠT`);
process.exit(hong ? 1 : 0);
