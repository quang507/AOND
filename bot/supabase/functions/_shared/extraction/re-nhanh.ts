// FR-223 — RẼ NHÁNH câu hỏi theo CÂU TRẢ LỜI (chủ dự án 24/09/2026: "phải nhanh nhạy để rẽ nhánh nếu câu hỏi
// trước trả lời gì thì sau đó sẽ có bộ câu hỏi gì … không hẳn là pháp lý mà các câu rẽ nhánh khác nữa").
//
// `chonCauKe` chọn câu kế theo CHỦ ĐỀ vừa nói (LIEN_QUAN: nói pháp lý → hỏi ảnh). Ở đây chọn theo NỘI DUNG câu
// trả lời: "sổ hồng riêng" và "chưa có sổ" không còn dẫn tới cùng một câu. Code quyết định HỎI GÌ; model chỉ
// viết lại câu cho tự nhiên (FR-222 e).
//
// Hàm THUẦN (luật tầng bóc tách — không model, không DB): đầu vào là loại nhà + các fact đã ghi + vài cột
// của tin; đầu ra là câu phải THÊM vào danh sách còn thiếu và câu phải BỎ khỏi đó. Thêm luật = thêm một dòng
// vào RE_NHANH + ca trong bot/tests/re-nhanh.mjs.

import { loaiDuongVaoTuDiaChi } from "./dia-danh.ts";

export type NgCanhReNhanh = {
  loai: string | null;
  deal: string | null;
  facts: Array<{ question: string; answer: string | null }>;
  legal_status?: string | null;
  has_completion?: boolean | null;
  rent_income_vnd?: number | string | null;
  rear_width_m?: number | string | null;
  /** 27/09: thổ cư bằng diện tích = đủ thổ cư (không hỏi lên thổ cư). */
  area_m2?: number | string | null;
  /** Chữ chủ nhà gõ vài lượt gần đây (không phải fact) — cho luật `kichTin`. */
  lichSu?: string;
  /** SRS-5.1zzzzzl: AI đã đọc tin này (`boc_tach._thong_so_ai`) — ý "đang cho thuê" chỉ theo ô AI ghi, từ khoá trên chữ không chạy. */
  aiDoc?: boolean;
};
export type CauThem = { fact_key: string; priority: number; nhom: string; giuThuTu?: boolean };

const boDau = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

const NHA_CO_XAY = ["nha_pho", "biet_thu", "nha_cap4", "toa_nha"];
const SO_RIENG = /\b(?:so hong|so do|shr|srh|so rieng|so hong rieng|so do rieng)\b/;
const CHUA_SO = /\b(?:chua co so|chua ra so|cho so|cho ra so|dang lam so|hdmb|hop dong mua ban|vi bang|giay tay|chua so)\b/;
const SO_CHUNG = /\b(?:so chung|dong so huu|chung so|dung ten chung|so dung chung)\b/;
const DANG_CHO_THUE = /\b(?:dang cho thue|dang thue|dang kinh doanh|hop dong thue|khach thue|cho [a-z0-9 ]{1,30} thue)\b/;
// SRS-5.1zzzzzl (test Zalo 13/10: bài rao "Mặt tiền 6m, dễ dàng kinh doanh hoặc cho thuê" → bot hỏi "hợp đồng thuê còn tới khi nào", khách
// "Nhà mình đang ở không cho thuê" → bot vẫn hỏi doanh thu, bản nháp in "💵 Đang cho thuê"). Lớp lỗi: CODE ĐOÁN Ý TRƯỚC AI — từ khoá trên
// chữ BỎ DẤU của cả bài rao ("dễ dàng kinh doanh" → "dang kinh doanh") mở nhánh, và lời phủ nhận của khách không đóng được nhánh. Nay: AI
// đọc trước — ô hien_trang_su_dung (AI đọc theo nghĩa, có trích dẫn) là chủ; tin AI đã đọc (`aiDoc`) mà không có ô đó thì KHÔNG đang cho
// thuê (trừ khi có tiền thuê đọc ra số). Từ khoá chỉ là lưới đỡ khi AI không chạy, đọc trên chữ có dấu nếu khách gõ có dấu, bỏ ô tiềm năng.
const DANG_CHO_THUE_DAU = /(?:^|[^\p{L}])(?:đang cho thuê|đang thuê|đang kinh doanh|hợp đồng thuê|khách thuê)(?![\p{L}])|(?:^|[^\p{L}])cho (?:[\p{L}\d]+ ){1,5}thuê(?![\p{L}])/u;
const CO_DAU = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const O_TIEM_NANG = new Set(["tiem_nang", "muc_dich", "nganh_hang_phu_hop"]);
/** Giá trị ô hien_trang_su_dung (AI chọn cụm cho đúng ý "đang ở / đang cho thuê / để trống") có nói đang cho thuê không. */
function htNoiChoThue(ht: string): boolean {
  const kd = boDau(ht);
  if (/\b(?:khong|ko|k|chua)\s+(?:co\s+)?(?:cho\s+)?(?:thue|kinh doanh)\b|\b(?:dang o|de trong|o luon|chu o|tu o)\b/.test(kd)) return false;
  return DANG_CHO_THUE_DAU.test(ht.toLowerCase()) || /\b(?:cho thue|dang thue|kinh doanh|khach thue)\b/.test(kd);
}
/** Tin BÁN đang cho thuê / kinh doanh? Ô hien_trang_su_dung quyết; không có thì tiền thuê, rồi (chỉ khi AI không đọc) từ khoá. */
export function dangChoThue(c: NgCanhReNhanh): boolean {
  const ht = c.facts.filter((f) => f.question === "hien_trang_su_dung").map((f) => f.answer ?? "").join(" ").trim();
  if (ht) return htNoiChoThue(ht);
  return Number(c.rent_income_vnd ?? 0) > 0 || dangChoThueTheoChu(c);
}
/** Như `dangChoThue` nhưng không tính thu nhập thuê (toà CHDV có thu nhập mà không cho một bên thuê). */
export function dangChoThueTheoChu(c: NgCanhReNhanh): boolean {
  const ht = c.facts.filter((f) => f.question === "hien_trang_su_dung").map((f) => f.answer ?? "").join(" ").trim();
  if (ht) return htNoiChoThue(ht);
  if (c.aiDoc) return false;
  const chu = c.facts.filter((f) => !O_TIEM_NANG.has(f.question)).map((f) => f.answer ?? "").join(" · ");
  return CO_DAU.test(chu) ? DANG_CHO_THUE_DAU.test(chu.toLowerCase()) : DANG_CHO_THUE.test(boDau(chu));
}
const CO_HAN_HD = /\b(?:den|toi|het han|het)\s*(?:nam\s*)?(?:20\d\d|\d{1,2}\/20\d\d)\b|\b\d+\s*nam\s*nua\b/;
const NHA_NAT = /\b(?:nha nat|nha cu nat|dap di xay lai|dap xay lai|mua dat tang nha|dat trong|chua xay)\b/;
const NO_HAU = /\bno hau\b/;
const NO_HAU_SO = /\bno hau\s*(?:la\s*|hon\s*|khoang\s*|tam\s*|ra\s*|thanh\s*)?\d/;
const KHONG_NO_HAU = /\b(?:khong|ko|k|chua)\s*(?:co\s*)?no hau\b/;
// Đọc GIÁ TRỊ ô thổ cư đã ghi (cụm ngắn khách gõ, ô nguyên văn), không đoán ý cả câu. SRS-5.1zzzzy: "toàn thổ cư" (khách mô phỏng 11/10).
const THO_CU_DU = /\b(?:100|full|toan(?: bo)?|het|du|tron)\b/;
// FR-229: câu "sổ đứng tên ai" nói NHIỀU người đứng tên.
const NHIEU_NGUOI_DUNG_TEN = /\b(?:vo chong|2 vo chong|hai vo chong|anh em|chi em|ba me|bo me|cha me|ong ba|thua ke|dong so huu|chung|nhieu nguoi|ca nha|gia dinh|may anh em|\d+\s*(?:nguoi|anh em|chi em))\b/;
const MOT_NGUOI_DUNG_TEN = /\b(?:mot minh|1 minh|mot nguoi|1 nguoi|chi (?:minh )?(?:toi|anh|chi|em|minh)|rieng (?:toi|anh|chi|em|minh)|khong (?:co )?(?:dong so huu|chung))\b/;

type NgCanhLuat = { loai: string; deal: string; phap: string; tatCa: string; lichSu: string; daHoi: Set<string>; c: NgCanhReNhanh };
/** Một Ý CHÍNH của nhánh: khoá fact + dấu hiệu chủ nhà ĐÃ nói ý đó (có thì không hỏi). */
type YChinh = CauThem & { daBiet?: (x: NgCanhLuat) => boolean };

type Luat = {
  id: string;
  /** Tên nhánh — đưa cho model biết đang hỏi thêm về chuyện gì (FR-223 b: "lai", model chọn cách nói). */
  ten: string;
  /** Mô tả để người đọc bảng hiểu vì sao có dòng này. */
  vi: string;
  khi: (c: NgCanhLuat) => boolean;
  /** Câu THÊM chỉ hỏi NGAY SAU khi chủ nhà vừa trả lời một trong các câu này hoặc một ý của CHÍNH nhánh này
   *  ("rẽ nhánh" — không thành cổng chặn bản nháp ở lượt khác). Câu BỎ thì bỏ ở mọi lượt. */
  sau?: string[];
  /** Các ý chính cần thu của nhánh, theo thứ tự hỏi; ý đã biết (fact có sẵn hoặc `daBiet`) thì bỏ qua. */
  them?: YChinh[];
  bo?: string[];
  /** Câu THÊM cũng hỏi ngay khi chữ chủ nhà vài lượt gần đây khớp mẫu này (không chờ trả lời câu `sau`). */
  kichTin?: RegExp;
  /** Câu THÊM là câu THAY một câu bị BỎ: có mặt ở MỌI lượt luật còn khớp, giữ đúng priority của nó (không chen đầu). */
  thay?: boolean;
};

const co = (re: RegExp) => ({ tatCa }: NgCanhLuat) => re.test(tatCa);
// Tiền thuê ĐÃ nói: "thuê 30 triệu", "30tr/tháng". Không vượt dấu phẩy và chỉ đơn vị triệu — bắn thật 24/09 (rn-test-g):
// "đang cho ngân hàng thuê, giá 25 tỷ" từng bị đọc thành tiền thuê 25 tỷ nên bot bỏ qua câu hỏi tiền thuê.
const THUE_CO_SO = /\b(?:thue|cho thue|thu ve|thu)\b[^.·,;]{0,20}?\d+(?:[.,]\d+)?\s*(?:trieu|tr)\b|\d+(?:[.,]\d+)?\s*(?:trieu|tr)\b\s*(?:\/|mot|moi)\s*thang/;

/** Bảng rẽ nhánh. Thứ tự không quan trọng: luật nào khớp thì cộng dồn thêm/bỏ; BỎ thắng THÊM. Nguồn: chủ dự án 24/09/2026
 *  (duyệt bảng nháp + chọn kiểu "lai": code chọn nhánh và ý chính, model hỏi từng ý còn thiếu cho tự nhiên). Danh sách ý
 *  chính mỗi nhánh là [giả định BA] — sửa ở đây + ca trong bot/tests/re-nhanh.mjs. */
export const RE_NHANH: Luat[] = [
  {
    id: "so_rieng_hoi_hoan_cong",
    ten: "sổ riêng — hoàn công",
    vi: "Nhà có xây + sổ hồng/sổ đỏ riêng, chưa nhắc hoàn công, không đang cho thuê, không phải tin bán → hỏi hoàn công",
    // 27/09/2026 (chủ dự án: "hỏi hơi nhiều"): tin BÁN hỏi hoàn công trong câu pháp lý thứ hai, hỏi bù sau khi lên tin
    // (`quy_hoach@ban` / `dien_tich_khop_so`, nhóm `sau_dang`) — không thêm một lượt trước bản nháp.
    khi: ({ loai, deal, phap, tatCa, c }) =>
      NHA_CO_XAY.includes(loai) && deal !== "cho_thue" && deal !== "ban" && SO_RIENG.test(phap) && !CHUA_SO.test(phap) && !SO_CHUNG.test(phap) &&
      !/\bhoan cong\b/.test(tatCa) && c.has_completion == null && !dangChoThue(c),
    sau: ["phap_ly"],
    them: [{ fact_key: "hoan_cong", priority: 16.2, nhom: "co_ban" }],
  },
  {
    id: "chua_so",
    ten: "chưa có sổ",
    vi: "Chưa có sổ / HĐMB / vi bằng / giấy tay → thu: giấy tờ đang có, dự kiến bao giờ ra sổ; không hỏi hoàn công",
    khi: ({ phap }) => CHUA_SO.test(phap),
    sau: ["phap_ly"],
    them: [
      { fact_key: "giay_to_hien_co", priority: 16.2, nhom: "co_ban", daBiet: co(/\b(?:hdmb|hop dong mua ban|vi bang|giay tay|hop dong dat coc|hop dong gop von|so tay)\b/) },
      { fact_key: "du_kien_ra_so", priority: 16.3, nhom: "co_ban",
        daBiet: co(/\b(?:ra so|co so|lay so|nhan so)\b[^.·]{0,20}\b(?:thang|nam|cuoi|dau|quy|tuan|sap)\b|\b(?:thang|cuoi nam|dau nam|quy)\b[^.·]{0,15}\b(?:ra so|co so)\b/) },
    ],
    // FR-229: chưa có sổ thì không có "người đứng tên sổ", "sổ thế chấp", "diện tích khớp sổ".
    bo: ["hoan_cong", "nguoi_dung_ten", "the_chap", "dien_tich_khop_so"],
  },
  {
    id: "can_ho_chua_so",
    ten: "căn hộ chưa có sổ",
    vi: "Căn hộ chưa có sổ → thu thêm: đã nhận bàn giao chưa",
    khi: ({ loai, phap }) => loai === "chung_cu" && CHUA_SO.test(phap),
    sau: ["phap_ly", "giay_to_hien_co", "du_kien_ra_so"],
    them: [{ fact_key: "ban_giao", priority: 16.4, nhom: "co_ban", daBiet: co(/\b(?:da nhan nha|nhan ban giao|da ban giao|dang o|chua nhan nha)\b/) }],
  },
  {
    id: "so_chung",
    ten: "sổ chung / đồng sở hữu",
    vi: "Sổ chung / đồng sở hữu → thu: đứng tên chung với ai, các bên đồng ý bán chưa; không hỏi hoàn công",
    khi: ({ phap }) => SO_CHUNG.test(phap),
    sau: ["phap_ly"],
    them: [
      { fact_key: "dong_so_huu_voi", priority: 16.2, nhom: "co_ban", daBiet: co(/\b(?:chung|dung ten)\s+(?:voi|cua)\s+\w+/) },
      { fact_key: "dong_y_ban", priority: 16.3, nhom: "co_ban", daBiet: co(/\b(?:dong y ban|thong nhat ban|deu dong y|da dong y|ca nha dong y)\b/) },
    ],
    // FR-229: "đứng tên chung với ai" đã hỏi thay câu "sổ đứng tên ai".
    bo: ["hoan_cong", "nguoi_dung_ten"],
  },
  {
    // FR-229 (chủ dự án 25/09/2026: "Có đồng sở hữu không, ví dụ vợ chồng hay anh em thừa kế? Tất cả những người này có
    // đồng ý bán không?").
    id: "nhieu_nguoi_dung_ten",
    ten: "nhiều người đứng tên sổ",
    vi: "Sổ đứng tên nhiều người (vợ chồng, anh em, thừa kế…) → hỏi các bên đã đồng ý bán chưa",
    khi: ({ c }) => {
      const t = boDau(c.facts.filter((f) => f.question === "nguoi_dung_ten").map((f) => f.answer ?? "").join(" "));
      return NHIEU_NGUOI_DUNG_TEN.test(t) && !MOT_NGUOI_DUNG_TEN.test(t);
    },
    sau: ["nguoi_dung_ten"],
    them: [{ fact_key: "dong_y_ban", priority: 17.5, nhom: "co_ban", daBiet: co(/\b(?:dong y ban|thong nhat ban|deu dong y|da dong y|ca nha dong y)\b/) }],
  },
  {
    id: "da_noi_hoan_cong",
    ten: "đã nói hoàn công",
    vi: "Đã biết hoàn công (câu nhánh FR-223 hay chủ nhà tự nói) → không hỏi \"diện tích xây khớp sổ không, đã hoàn công chưa\"",
    khi: ({ tatCa, daHoi, c }) => daHoi.has("hoan_cong") || c.has_completion != null || /\bhoan cong\b/.test(tatCa),
    bo: ["dien_tich_khop_so"],
  },
  {
    id: "dang_cho_thue",
    ten: "nhà đang cho thuê",
    vi: "Tin BÁN đang cho thuê / kinh doanh = nhà đã hoàn thiện (chủ dự án 24/09) → không hỏi hiện trạng, nội thất, hoàn công; thu: hợp đồng thuê tới khi nào, tiền thuê mỗi tháng",
    khi: ({ deal, c }) => deal !== "cho_thue" && dangChoThue(c),
    // SRS-5.1zzzzzm: câu hiện trạng sử dụng (hỏi trước bản nháp từ 20261013a) trả lời "đang cho thuê" → hỏi tiếp hợp đồng / tiền thuê ngay.
    sau: ["phap_ly", "hien_trang", "hien_trang_su_dung", "doanh_thu", "kien_thuc", "bo_sung", "tiem_nang"],
    them: [
      // 24/09/2026 (bắn 10 tin): toà nhà CHDV / nhà trọ "đang thu 250 triệu/tháng" là cho thuê TỪNG PHÒNG — không có một
      // hợp đồng thuê chung để hỏi hạn. Chỉ hỏi khi chữ khách nói rõ đang cho (một bên) thuê.
      { fact_key: "han_hop_dong_thue", priority: 16.4, nhom: "co_ban",
        daBiet: (x) => CO_HAN_HD.test(x.tatCa) || /\b(?:tung phong|nhieu phong|khong co hop dong tong)\b/.test(x.tatCa) ||
          (["toa_nha", "phong_tro"].includes(x.loai) && !dangChoThueTheoChu(x.c)) },
      { fact_key: "doanh_thu", priority: 16.5, nhom: "co_ban", daBiet: (x) => Number(x.c.rent_income_vnd ?? 0) > 0 || THUE_CO_SO.test(x.tatCa) },
    ],
    // 24/09/2026 (chủ dự án: "đã bảo nhà cho thuê 400tr tháng rồi còn [đòi] thêm tiềm năng sử dụng"): đang cho
    // thuê / kinh doanh LÀ tiềm năng sử dụng, không hỏi lại.
    bo: ["hien_trang", "noi_that", "hoan_cong", "tiem_nang"],
  },
  // 25/09/2026 (chủ dự án: "Loại bds khác nhau sẽ có những thứ khác nhau cần làm rõ").
  {
    id: "can_ho_da_co_du_an",
    ten: "căn hộ đã nói dự án",
    vi: "Căn hộ đã có tên dự án → vị trí đã rõ (dự án + toà), không hỏi đường / số nhà",
    khi: ({ loai, daHoi }) => loai === "chung_cu" && daHoi.has("du_an_ten"),
    bo: ["vi_tri"],
  },
  {
    id: "dat_ngoai_du_an",
    ten: "đất thổ cư ngoài dự án",
    vi: "Đất không nằm trong dự án / KDC → không hỏi \"xây tự do hay theo mẫu chủ đầu tư\"",
    khi: ({ loai, tatCa, daHoi }) => loai === "dat" && !daHoi.has("du_an_ten") &&
      !/\b(?:du an|kdc|khu dan cu|khu do thi|kdt|nen du an|dat nen|chu dau tu|cdt)\b/.test(tatCa),
    bo: ["xay_dung"],
  },
  {
    id: "nha_nat",
    ten: "nhà nát / đất trống",
    vi: "Nhà nát / đất trống / đập xây lại → không hỏi phòng ngủ, toilet, nội thất, tầng phụ, hoàn công",
    khi: ({ tatCa }) => NHA_NAT.test(tatCa),
    bo: ["so_phong_ngu", "so_wc", "noi_that", "tang_phu", "hoan_cong", "hien_trang", "dien_tich_khop_so"],
  },
  {
    // 25/09/2026 (chủ dự án test Zalo: "5x12" rồi "nở hậu nhé" → bot bịa "nở hậu 4.5"; "nở hậu nhiu cộng vào diện tích nhà luôn").
    id: "no_hau_chua_so",
    ten: "nở hậu — bao nhiêu mét",
    vi: "Chủ nhà nói nở hậu mà chưa nói số mét → hỏi nở hậu bao nhiêu mét (DB cộng vào diện tích, migration 20260925d)",
    khi: ({ tatCa, lichSu, daHoi, c }) => !daHoi.has("no_hau") && (c.rear_width_m == null || c.rear_width_m === "") &&
      NO_HAU.test(`${tatCa} · ${lichSu}`) && !NO_HAU_SO.test(`${tatCa} · ${lichSu}`) && !KHONG_NO_HAU.test(`${tatCa} · ${lichSu}`),
    kichTin: NO_HAU,
    them: [{ fact_key: "no_hau", priority: 15.4, nhom: "co_ban" }],
  },
  {
    id: "tho_cu_mot_phan",
    ten: "đất thổ cư một phần",
    vi: "Đất có thổ cư một phần → hỏi có lên thổ cư được không",
    // 27/09/2026 (test Zalo, đất Cần Đước): "425m2" thổ cư trên đất 425m2 là thổ cư ĐỦ — bot vẫn hỏi "lên thổ cư được không".
    khi: ({ loai, c, daHoi }) => {
      if (!["dat", "dat_nong_nghiep"].includes(loai) || !daHoi.has("tho_cu")) return false;
      const tc = boDau(c.facts.find((f) => f.question === "tho_cu")?.answer ?? "");
      if (THO_CU_DU.test(tc)) return false;
      const so = /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|met vuong|m\b)?/.exec(tc);
      const dt = Number(c.area_m2);
      return !(so && Number.isFinite(dt) && dt > 0 && Number(so[1].replace(",", ".")) >= dt - 0.5);
    },
    sau: ["tho_cu"],
    them: [{ fact_key: "len_tho_cu", priority: 15.5, nhom: "co_ban" }],
  },
  {
    // 01/10/2026 (chủ dự án: "nếu 137/28 thì là hẻm rồi, đường số 59 hoặc đường có tên là đường lớn"). Số nhà có xẹc đã
    // có câu "Nhà mình nằm trong hẻm đúng không…" (`do_rong_hem@so_nha_hem`). Đây là chiều kia: số nhà TRƠN rồi tới tên
    // đường ("156 Nguyễn Trãi", "156 đường số 59") — không có chữ hẻm / kiệt / ngõ ở đâu — là nhà mặt tiền đường: hỏi
    // đường trước nhà rộng mấy mét (`do_rong_duong`, DB ghi access_type = mặt tiền) thay cho câu hẻm.
    id: "so_nha_mat_tien",
    ten: "số nhà trơn — mặt tiền đường",
    vi: "Nhà có xây, địa chỉ là số nhà không xẹc + tên đường, không nhắc hẻm → hỏi độ rộng đường trước nhà thay câu hẻm",
    // SRS-5.1zzz (THUTU-tt-mt, 07/10/2026): bản cũ đòi `!daHoi.has("do_rong_duong")` — trả lời câu đường xong thì nhánh tắt,
    // `bo: ["do_rong_hem"]` thôi áp, và câu hẻm bị hỏi TIẾP (hỏi trùng một ý). Đã trả lời câu đường thì nhánh vẫn giữ để bỏ câu hẻm.
    khi: ({ loai, tatCa, daHoi, c }) => NHA_CO_XAY.includes(loai) && !daHoi.has("do_rong_hem") &&
      (daHoi.has("do_rong_duong") || loaiDuongVaoTuDiaChi([...c.facts].reverse().find((f) => f.question === "vi_tri")?.answer, tatCa) === "mat_tien"),
    thay: true,
    them: [{ fact_key: "do_rong_duong", priority: 7, nhom: "co_ban" }],
    bo: ["do_rong_hem"],
  },
];

/** Nhánh chứa một khoá (để lệnh model nói rõ đang hỏi thêm chuyện gì + các ý chính của nhánh). */
export function nhanhCuaKhoa(key: string): { ten: string; cacY: string[] } | null {
  const l = RE_NHANH.find((x) => (x.them ?? []).some((t) => t.fact_key === key));
  return l ? { ten: l.ten, cacY: (l.them ?? []).map((t) => t.fact_key) } : null;
}

/** Câu phải thêm / bỏ cho một tin, theo các câu trả lời đã ghi. Câu đã có fact thì không thêm lại.
 *  `vuaNoi` = câu chủ nhà vừa trả lời lượt này; bỏ trống = chỉ tính câu BỎ (không thêm câu nhánh). */
export function reNhanh(c: NgCanhReNhanh, vuaNoi?: string[]): { them: CauThem[]; bo: Set<string>; luat: string[] } {
  const daHoi = new Set(c.facts.map((f) => f.question));
  // Pháp lý = fact pháp lý + tin vừa nhắn (khi vừa trả lời câu pháp lý, đáp án đã cắt có thể mất nửa sau).
  const phap = boDau(c.facts.filter((f) => f.question === "phap_ly" || f.question === "_tin_nay").map((f) => f.answer ?? "").join(" ") +
    " " + (c.legal_status ?? "").replace(/_/g, " "));
  const tatCa = boDau(c.facts.map((f) => f.answer ?? "").join(" · "));
  const lichSu = boDau(c.lichSu ?? "");
  const ctx: NgCanhLuat = { loai: c.loai ?? "", deal: c.deal ?? "", phap, tatCa, lichSu, daHoi, c };
  const them = new Map<string, CauThem>();
  const bo = new Set<string>();
  const luat: string[] = [];
  for (const l of RE_NHANH) {
    if (!l.khi(ctx)) continue;
    luat.push(l.id);
    // Vừa trả lời câu kích HOẶC một ý của chính nhánh này → hỏi tiếp ý còn thiếu kế tiếp (một ý mỗi lượt).
    const kich = [...(l.sau ?? []), ...(l.them ?? []).map((t) => t.fact_key)];
    const reNgay = vuaNoi === undefined || kich.some((k) => vuaNoi.includes(k)) || !!l.kichTin?.test(lichSu);
    if (reNgay || l.thay) {
      for (const t of l.them ?? []) {
        if (daHoi.has(t.fact_key) || them.has(t.fact_key) || t.daBiet?.(ctx)) continue;
        const { daBiet: _b, ...cau } = t;
        them.set(t.fact_key, l.thay ? { ...cau, giuThuTu: true } : cau);
      }
    }
    for (const b of l.bo ?? []) bo.add(b);
  }
  return { them: [...them.values()].filter((t) => !bo.has(t.fact_key)), bo, luat };
}

/** Áp rẽ nhánh lên danh sách còn thiếu (từ view `listing_missing_facts`): bỏ câu thừa; câu nhánh vừa kích
 *  (theo `vuaNoi`) đứng ĐẦU danh sách để `chonCauKe` hỏi ngay (priority −1, nhóm cơ bản). */
export function apReNhanh<T extends { fact_key: string; priority?: number | null; nhom?: string | null }>(
  thieu: T[], c: NgCanhReNhanh, vuaNoi: string[] = [],
): Array<T | CauThem> {
  const { them, bo } = reNhanh(c, vuaNoi);
  const giu: Array<T | CauThem> = thieu.filter((t) => !bo.has(t.fact_key) && !them.some((x) => x.fact_key === t.fact_key));
  return [...them.map((t) => t.giuThuTu ? t : { ...t, priority: -1, nhom: "co_ban" }), ...giu];
}

/** Có cần đọc DB để rẽ nhánh không: câu vừa trả lời kích một luật THÊM, hoặc danh sách có câu mà luật nào đó BỎ. */
export function canReNhanh(thieu: Array<{ fact_key: string }>, vuaNoi: string[] = [], lichSu = ""): boolean {
  const coBo = new Set(RE_NHANH.flatMap((l) => l.bo ?? []));
  const ls = boDau(lichSu);
  return RE_NHANH.some((l) => [...(l.sau ?? []), ...(l.them ?? []).map((t) => t.fact_key)].some((k) => vuaNoi.includes(k)) || !!(ls && l.kichTin?.test(ls))) ||
    thieu.some((t) => coBo.has(t.fact_key));
}
