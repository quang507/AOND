// ghi-fact.ts — CỬA DUY NHẤT ghi fact tin rao từ edge function (SRS-5.1zzzzj, 09/10/2026).
//
// Bắn production 09/10: "MTKD đường Võ Văn Tần phường 6 quận 3 cũ" → fact `phuong` "Phường 6" → trigger DB đổ vào cột phường →
// bản nháp gửi khách "Phường 6, Quận 3" (không có phường mới nào tên đó). chat-reply có hơn 40 chỗ gọi `ghi_fact_listing`, khoá
// fact tính lúc chạy (`g.question`, `k`, `f.question`): soát từng chỗ thì chỗ thứ 41 lọt. Nay mọi lượt ghi fact đi qua hàm này, và
// MỘT luật ở đây: fact `phuong` (kể cả câu `vi_tri` chỉ là tên phường mà DB đổi sang `phuong`) mang tên phường MỚI có thật
// (`tenPhuongCot`, khop-phuong.ts) hay KHÔNG được ghi — câu phường còn treo, bot hỏi lại. `bot/tests/ghi-phuong-mot-cua.mjs` đỏ
// khi có chỗ gọi `rpc("ghi_fact_listing"` ngoài file này; DB (`20261009b`) chặn lần cuối và ghi sổ lỗi.
//
// SRS-5.1zzzzzzm (14/10/2026, người test thật): fact `vi_tri` cũng chuẩn hoá Ở ĐÂY — số nhà đứng trước, tên đường theo từ điển `duong`
// (chỉ khi khớp ĐÚNG sau bỏ dấu: `chonDuong` → `sua` / `khop`; khớp gần là việc của gợi ý hỏi xác nhận ở chat-reply, không phải của cửa).
// Trước đó ba đường ghi vi_tri (luật đã qua `suaTenDuong`, AI ghi cụm nguyên văn, lượt chốt tin ghi cụm nối lại) mỗi đường một kiểu chữ,
// và lượt chốt đã đè "1235 Huỳnh Tấn Phát" bằng "đường huỳnh tấn phát số 1235". Từ điển hỏng (RPC lỗi) thì vẫn ghi — chỉ mất phần
// sửa dấu, không chặn đường ghi (cùng luật FR-212).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { laTenPhuongHopLe, tenPhuongCot } from "./extraction/khop-phuong.ts";
import { chuanHoaViTri, mergeDiaChi, tenDuongDeTra } from "./extraction/dia-chi.ts";
import { chonDuong, type UngVienDuong } from "./extraction/tra-duong.ts";
import { duongTraDuoc } from "./extraction/tra-phuong.ts";

export type ThamSoFact = { p_listing_id: string | null | undefined; p_question: string; p_answer: string; p_source?: string | null };
/** `ghi`: câu trả lời ĐÃ ghi (fact phường: tên chuẩn; fact vi_tri: địa chỉ đã chuẩn hoá) — lời xác nhận cho khách đọc chữ này, không đọc chữ khách gõ. */
export type KetQuaFact = { data: unknown; error: { message: string; code?: string } | null; boQua?: "phuong_khong_chuan" | "o_da_bo"; ghi?: string };

const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/**
 * SRS-5.1zzzzzzq (Zalo thật 14/10 10:05, tin Trần Bình Trọng): "bỏ cái hướng Đông Nam ra" lúc chờ duyệt → bot "tin mình đang ghi hướng
 * Đông Nam ạ, anh chị nhắn hướng đúng là em sửa lại liền" (luật 22/09: bot không tự xoá ô) — khách "sửa lại giúp anh", bot hỏi "đăng hay
 * chưa", khách bỏ cuộc "ok đăng đi", tin lên kệ VẪN có hướng khách đã xin bỏ. Ô không bắt buộc để đăng thì xin bỏ là BỎ: xoá fact + cột,
 * nhớ giá trị đã bỏ ở `boc_tach.o_da_bo` để lượt AI sau (đọc lại tin cũ của khách trong "bộ nhớ") không ghi lại đúng giá trị đó. Ô lõi
 * (giá, diện tích, địa chỉ, phường, số tầng) vẫn đi đường cũ: hỏi giá trị đúng — tin không có chúng thì không đăng được.
 */
export const O_XOA_DUOC: Readonly<Record<string, readonly string[]>> = {
  huong: ["direction"],
  do_rong_hem: ["alley_width_m"],
  so_phong_ngu: ["bedrooms"],
  phap_ly: ["legal_status"],
};
/** So hai giá trị một ô cho việc "đã bỏ": bỏ dấu, bỏ chữ nhãn ô ("hướng Đông Nam" = "Đông Nam", "4 phòng ngủ" = "4", "hẻm 5m" = "5m"). */
export const cungGiaTriO = (a: string, b: string): boolean => {
  const g = (s: string) => boDau(s).replace(/\b(?:huong|hem|phong ngu|pn|phap ly)\b/g, " ").replace(/\s+/g, " ").trim();
  return !!g(a) && g(a) === g(b);
};

/**
 * Bỏ một ô khỏi tin theo lời khách (SRS-5.1zzzzzzq). Trả giá trị vừa bỏ (null = ô không nằm trong `O_XOA_DUOC` hay tin chưa ghi gì).
 * Không đụng ô lõi. `boc_tach` ghi trực tiếp (không qua `ghi_boc_tach` — RPC đó chỉ GỘP, không xoá được khoá).
 */
export async function boOTin(client: SupabaseClient, listingId: string, truong: string, giaTriHienTai: string | null): Promise<{ daBo: string | null; error: { message: string } | null }> {
  const cot = O_XOA_DUOC[truong];
  if (!cot || !giaTriHienTai) return { daBo: null, error: null };
  const { data: l, error: lErr } = await client.from("listings").select("boc_tach").eq("id", listingId).maybeSingle();
  if (lErr) return { daBo: null, error: lErr };
  const bt = { ...((l?.boc_tach ?? {}) as Record<string, unknown>) };
  delete bt[truong];
  bt.o_da_bo = { ...((bt.o_da_bo ?? {}) as Record<string, string>), [truong]: giaTriHienTai };
  // Không xoá dòng nào (nguyên tắc AOND "không bao giờ xoá dữ liệu, chỉ đổi trạng thái"): fact đổi tên câu thành `<ô>_da_bo` — còn nguyên
  // trong DB để truy, bản nháp / cột / điểm không đọc nữa. Trigger fact chỉ chạy khi INSERT nên UPDATE không đổ ngược vào cột.
  const { error: fErr } = await client.from("listing_facts").update({ question: `${truong}_da_bo` }).eq("listing_id", listingId).eq("question", truong);
  if (fErr) return { daBo: null, error: fErr };
  const { error: uErr } = await client.from("listings").update({ ...Object.fromEntries(cot.map((c) => [c, null])), boc_tach: bt }).eq("id", listingId);
  if (uErr) return { daBo: null, error: uErr };
  // Lượt này (chốt tin trong `guiBanNhap`) phải thấy ngay dấu vừa ghi — cập nhật bản nhớ của client.
  const m = nhoODaBo.get(client) ?? new Map<string, Promise<Record<string, string>>>();
  nhoODaBo.set(client, m);
  m.set(listingId, Promise.resolve({ ...(bt.o_da_bo as Record<string, string>) }));
  return { daBo: giaTriHienTai, error: null };
}

const HUONG_KD = ["dong nam", "dong bac", "tay nam", "tay bac", "dong", "tay", "nam", "bac"];
/**
 * Khách gọi KÈM một giá trị khác giá trị tin đang ghi ("xoá cái hẻm 4m ghi nhầm đi" trong khi tin đã sửa thành hẻm 3.5m — GVC-02, 22/09)
 * → thứ khách muốn bỏ không còn trong tin: KHÔNG bỏ giá trị đang có (đó là giá trị đúng), đi đường cũ đọc lại ô + xin giá trị đúng.
 * Không gọi giá trị nào ("xoá giùm số phòng ngủ đi") hay gọi đúng giá trị đang có ("bỏ cái hướng Đông Nam ra") → bỏ được.
 */
export function nhacGiaTriKhac(truong: string, loiKhach: string, giaTriHienTai: string): boolean {
  const kd = boDau(loiKhach), ht = boDau(giaTriHienTai);
  if (truong === "huong") {
    const nhac = HUONG_KD.find((h) => new RegExp(`\\b${h}\\b`).test(kd));
    const dang = HUONG_KD.find((h) => new RegExp(`\\b${h}\\b`).test(ht));
    return !!nhac && nhac !== dang;
  }
  const so = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));
  const soKhach = so(kd);
  return soKhach.length > 0 && !soKhach.some((x) => so(ht).includes(x));
}

/** `boc_tach.o_da_bo` đọc MỘT lần mỗi tin mỗi lượt (client sống đúng một lượt) — cửa ghi không thêm truy vấn cho từng fact. */
const nhoODaBo = new WeakMap<object, Map<string, Promise<Record<string, string>>>>();
const docODaBo = (client: SupabaseClient, listingId: string): Promise<Record<string, string>> => {
  let m = nhoODaBo.get(client);
  if (!m) { m = new Map(); nhoODaBo.set(client, m); }
  let p = m.get(listingId);
  if (!p) {
    p = (async () => {
      const { data: l, error } = await client.from("listings").select("boc_tach").eq("id", listingId).maybeSingle();
      if (error) { console.log(`ghi-fact: đọc o_da_bo hỏng: ${error.message}`); return {}; }
      return { ...(((l?.boc_tach ?? {}) as Record<string, unknown>).o_da_bo ?? {}) as Record<string, string> };
    })();
    m.set(listingId, p);
  }
  return p;
};

/**
 * Chốt chặn ở cửa ghi: ô khách đã xin bỏ mà lượt AI (bóc tách / chốt tin, đọc lại tin cũ) đưa ĐÚNG giá trị đã bỏ → không ghi. Giá trị KHÁC
 * thì ghi (khách nói hướng mới). Khách tự nhắn (`seller_chat`, đường lời sửa / câu trả lời) luôn ghi — đó là ý khách mới nhất; không đọc DB.
 */
async function chanODaBo(client: SupabaseClient, a: ThamSoFact): Promise<boolean> {
  if (!O_XOA_DUOC[a.p_question] || !a.p_listing_id || a.p_source === "seller_chat") return false;
  const daBo = (await docODaBo(client, a.p_listing_id))[a.p_question];
  if (!daBo || !cungGiaTriO(String(a.p_answer ?? ""), daBo)) return false;
  console.log(`ghi-fact: ô "${a.p_question}" khách đã xin bỏ ("${daBo}") — không ghi lại từ lượt AI`);
  return true;
}
/**
 * Bản TS của nhánh đầu `ghi_fact_listing` (20260928f, FR-241): câu `vi_tri` chỉ là "xã / phường / thị trấn …", không có dấu hiệu
 * đường / hẻm / số nhà → DB ghi nó thành fact `phuong`. Cửa này phải biết trước để tên phường đó cũng qua `tenPhuongCot`.
 */
export function viTriLaPhuong(answer: string): boolean {
  const kd = boDau(answer.trim());
  return /^(xa|phuong|thi tran)\s+\S/.test(kd) && !/(duong|\bhem\b|\bngo\b|\bkiet\b|\bso\s*[0-9]|[0-9]+\s*\/|,\s*[0-9])/.test(kd);
}

/** Quận cũ đang ghi của căn (null khi trống hay còn mặc định) — dùng cho cả hai phép chuẩn hoá. */
async function quanCua(client: SupabaseClient, listingId: string | null | undefined): Promise<{ quan: string | null; error: { message: string } | null }> {
  if (!listingId) return { quan: null, error: null };
  const { data: l, error } = await client.from("listings").select("district, boc_tach").eq("id", listingId).maybeSingle();
  if (error) return { quan: null, error };
  const macDinh = (l?.boc_tach as { quan_mac_dinh?: unknown } | null | undefined)?.quan_mac_dinh === true;
  return { quan: l?.district && !macDinh ? String(l.district) : null, error: null };
}

/**
 * Tên đường TỪ ĐIỂN khớp đúng tên khách gõ trong `viTri` (bỏ dấu, hoa thường), hay null. Khớp gần / không có / RPC hỏng → null.
 * RPC hỏng là sự cố nhưng không chặn đường ghi — nơi gọi vẫn ghi địa chỉ chữ khách; sổ lỗi do `ghiLoi` ở chat-reply (cùng lượt
 * `suaTenDuong` đã ghi) — ở đây chỉ `console.log` để không đẻ hai dòng cho một lần RPC hỏng.
 */
async function tenDuongTuDien(client: SupabaseClient, viTri: string, quan: string | null): Promise<string | null> {
  const goc = tenDuongDeTra(viTri);
  if (!goc || !duongTraDuoc(goc)) return null;
  const { data, error } = await client.rpc("tim_duong", { p_ten: goc, p_quan: quan });
  if (error) { console.log(`ghi-fact: tim_duong hỏng cho "${goc}": ${error.message}`); return null; }
  const ds = (data ?? null) as UngVienDuong[] | null;
  const kq = chonDuong(goc, ds, quan);
  if (kq.loai === "sua") return kq.ten;
  // Khớp đúng mà không cần sửa: khách gõ đúng y một tên (giữ chữ khách — đã là tên từ điển) hoặc nhiều tên cùng chữ bỏ dấu (không đoán).
  if (kq.loai === "giu" && kq.khop) {
    const dung = (ds ?? []).filter((u) => u.khoang_cach === 0 && boDau(u.ten) === boDau(goc));
    return dung.length === 1 ? dung[0].ten : null;
  }
  return null;
}

/** Ghi một fact tin rao. Fact phường không chuẩn được → không ghi (`boQua`), không lỗi: bot hỏi lại phường như chưa biết. */
export async function ghiFact(client: SupabaseClient, a: ThamSoFact): Promise<KetQuaFact> {
  if (await chanODaBo(client, a)) return { data: null, error: null, boQua: "o_da_bo" };
  let answer = String(a.p_answer ?? "");
  const laPhuong = a.p_question === "phuong" || (a.p_question === "vi_tri" && viTriLaPhuong(answer));
  if (a.p_question === "vi_tri" && !laPhuong && answer.trim()) {
    if (a.p_listing_id) {
      const { data: lf } = await client.from("listing_facts")
        .select("answer")
        .eq("listing_id", a.p_listing_id)
        .eq("question", "vi_tri")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lf?.answer) {
        answer = mergeDiaChi(lf.answer, answer);
      }
    }
    const { quan, error: qErr } = await quanCua(client, a.p_listing_id);
    if (qErr) return { data: null, error: qErr };
    answer = chuanHoaViTri(answer, await tenDuongTuDien(client, answer, quan));
    const { data, error } = await client.rpc("ghi_fact_listing", { ...a, p_answer: answer });
    return { data, error, ghi: answer };
  }
  if (!laPhuong || laTenPhuongHopLe(answer.trim())) {
    const { data, error } = await client.rpc("ghi_fact_listing", a);
    return { data, error, ghi: answer };
  }
  // Phường số cũ cần quận cũ của căn ("phường 13" + Phú Nhuận) — đọc cột quận khi chuỗi chưa phải tên chuẩn.
  const { quan, error: qErr } = await quanCua(client, a.p_listing_id);
  if (qErr) return { data: null, error: qErr };
  const ten = tenPhuongCot(answer, quan);
  if (!ten) {
    // Đường đi đúng thiết kế (khách nói tên không tra được) → console.log, KHÔNG vào sổ lỗi.
    console.log(`ghi-fact: phường "${answer.slice(0, 60)}" (quận ${quan ?? "?"}) không ra phường mới — không ghi, bot hỏi lại`);
    return { data: null, error: null, boQua: "phuong_khong_chuan" };
  }
  const { data, error } = await client.rpc("ghi_fact_listing", { ...a, p_question: "phuong", p_answer: ten });
  return { data, error, ghi: ten };
}
