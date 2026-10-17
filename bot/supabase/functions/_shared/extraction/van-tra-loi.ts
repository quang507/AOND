// van-tra-loi.ts — van TIỀN ĐỊNH đặt SAU lời model, trước khi gửi (13/09/2026).
//
// Lượt bắn 20 tin thật 12/09 cho thấy ba chỗ model nói sai dù câu lệnh đã dặn:
//
//   1. Kho TRỐNG (khối "KHO HIỆN CÓ: (trống)") mà model vẫn đáp "Dạ có em" /
//      "Em đang có vài căn 3 phòng, hẻm xe hơi tầm 7 tỷ". Người mua tin là có
//      hàng, rồi không bao giờ thấy căn nào — lời hứa suông đầu tiên là lời hứa
//      làm mất khách. Câu lệnh đã có "Chỉ dùng listing trong KHO, không bịa";
//      model vẫn bịa, nên chặn bằng code.
//   2. Ghi chú hoàn cảnh người mua bị LẶP: model trả lại cả ghi chú cũ lẫn mới
//      ("mẹ già ở cùng; muốn gần bệnh viện"), hàm gộp chỉ so NGUYÊN chuỗi nên
//      nối thêm cả đoạn → "mẹ già ở cùng; mẹ già ở cùng; muốn gần bệnh viện".
//   3. Code đã gửi bong bóng "Dạ em sửa lại Phường 9 rồi ạ." rồi model mở tin
//      của nó bằng "Dạ em sửa lại 6 tỷ 5 và Phường 9 rồi ạ." — hai lần ghi nhận.
//
// Tầng bóc tách (bot/tests/ranh-gioi.mjs): không model, không RPC.

import { trungY, XUNG_HO_LON_TUOI as LON_TUOI } from "./khop-cau-tra-loi.ts";
import { docTien } from "./luat-tien.ts";
import { goNhamDau } from "./go-nham-dau.ts";

const boDau = (s: string): string =>
  goNhamDau(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// Câu KHẲNG ĐỊNH đang có hàng. Chỉ sai khi không có căn nào trong tay model —
// tầng trên quyết định lúc nào gọi.
const HUA_CO_HANG: RegExp[] = [
  // "Dạ có em." / "Có ạ!" / "Dạ có chị nha" — cả câu chỉ là chữ "có".
  // 13/09: "Dạ có anh/chị!" lọt vì dấu "/" — cho phép.
  /^(?:da|vang|u|ok|oke)?[\s,]*co(?:\s+(?:em|a|chi|anh|anh\/chi|nha|nhe|luon|lien|san|nhieu|lam))*\s*[.!…]*$/,
  // 13/09: "Dạ em tìm vài căn hẻm xe hơi… cho chị xem nha" — hứa gửi căn chưa có.
  // "em tìm cho (chị) mấy căn 3PN…" — 14/09 bắn lại: chữ "cho" chen giữa làm lọt.
  /\b(?:tim|gui|loc|chon|lua|kiem)\s+(?:(?:ra|duoc|san)\s+)?(?:cho\s+(?:(?:anh\/chi|anh|chi|minh)\s+)?)?(?:vai|mot vai|mot so|may|\d+)\s+can\b/,
  // 14/09 (bắn 16 hội thoại mua): "căn hộ có ban công chúng mình có nhiều",
  // "Em tìm căn khớp 4 người ở quanh trường … rồi".
  /\b(?:ben em|chung minh|chung em|em|minh)\s+(?:dang\s+|van\s+)?co\s+(?:rat\s+)?nhieu\b(?!\s+(?:khach|nguoi))/,
  /\bem\s+(?:da\s+)?(?:tim|kiem|loc)\s+(?:duoc\s+|ra\s+)?(?:can|nha)\b[^.?!]*\broi\b/,
  // 14/09 (bắn lại sau siết): "để em gửi căn cho mình xem luôn ạ" khi kho trống.
  /\b(?:de\s+)?em\s+gui\s+(?:ngay\s+|luon\s+|lien\s+)?(?:can|nha|vai can|may can)\b/,
  // "Dạ được, em ghi nhận lịch chiều thứ 7 cho mình ạ" — nhận hẹn xem khi chưa có căn nào.
  /\b(?:ghi nhan|chot|sap xep|len|dat)\s+(?:lich|gio)\s+(?:xem|chieu|sang|toi|trua|mai|thu|cuoi tuan|\d)/,
  // 14/09: "Chị xem những căn này có hợp không ạ?" khi chưa gửi căn nào.
  /\b(?:nhung|may|cac|mot so)\s+can\s+(?:nay|do|tren|ben duoi|sau day|em vua gui)\b/,
  // "em đang có vài căn…", "bên em hiện có 3 căn", "em có nhà mặt tiền…"
  /\b(?:em|ben em|minh|kho)\s+(?:(?:dang|hien|van|cung|con|da|san)\s+)*co\s+(?:san\s+)?(?:(?:vai|mot vai|mot so|nhieu|may|mot|hai|ba|bon|nam|\d+)\s+)?(?:can|lo|nen|mau|nha|lua chon|san pham)\b/,
  // 14/09 lần 4: "Hiện kho em còn vài căn ở khu đó" — chữ "còn" thay "có". "còn căn nào" (hỏi) không bắt.
  /\b(?:kho|ben em|em)(?:\s+em)?\s+(?:(?:dang|hien|van|cung)\s+)*con\s+(?:(?:vai|mot vai|mot so|nhieu|may|it|\d+)\s+(?:can|lo|nen|nha)|can\s+(?:ho|mat tien|hem|pho|\d))\b(?!\s+nao)/,
  // "có vài căn đúng ý chị", "có 2 lựa chọn"
  /\bco\s+(?:(?:vai|mot vai|mot so|nhieu|may|hai|ba|\d+)\s+)(?:can|lo|nen|lua chon)\b/,
  // "để em xem căn nào phù hợp nhất" — nói như đang cầm sẵn danh sách.
  /\b(?:xem|chon|loc)\s+(?:xem\s+)?(?:trong\s+)?(?:may\s+)?can\s+nao\s+(?:phu hop|hop|ok|dep|ung)/,
  // 20/09/2026 (bắn thật mau-y-C): "để em kiểm tra hẻm 4m Nguyễn Trãi rồi báo liền", "Em kiểm tra kho
  // rồi báo mình liền", "Đang kiểm tra … sắp báo mình liền" — hai lượt né thay vì nói thẳng chưa có.
  // 23/09/2026 (bắn thật): bot xưng "cháu" với khách lớn tuổi — "để cháu tìm … cháu sẽ báo chú liền".
  // 30/09/2026 (bắn lại v275, lx-mua-e3): "Em để lọc lại và báo mình nhé" — "em ĐỂ lọc" (chữ "để" chen giữa) lọt mẫu này.
  /\b(?:de\s+)?(?:em|chau)\s+(?:de\s+(?:em\s+|chau\s+)?)?(?:kiem tra|check|xem|tim|loc|ra soat|doi chieu)\b[^.?!]*\b(?:roi|se|sap)?\s*bao\s+(?:lai\s+)?(?:anh\/chi|anh|chi|minh|em|chau|chu|co|bac|lien|ngay|sau|som)\b/,
  // 30/09/2026 (bắn lại v275, lx-mua-e3): "em gợi 2 căn khớp nhu cầu mình nhé:" rồi hết — báo có danh sách mà không kèm căn nào.
  /\b(?:em|chau)\s+(?:xin\s+)?(?:goi y|goi|gioi thieu|gui)\s+(?:(?:vai|may|mot so|mot|hai|ba|\d+)\s+)?(?:can|lua chon|mau)\b(?!\s+(?:nay|do|kia|tren|vua|ho\b))/,
  // 23/09/2026: "Dạ em tìm kiếm liền ạ", "để em tìm từ từ ạ", "em lọc kho … liền", "để cháu tìm kiếm trong kho".
  /\b(?:de\s+)?(?:em|chau)\s+(?:tim kiem|tim|loc|kiem)\s+(?:(?:lien|ngay|luon|tu tu|trong kho|kho|them)\b|can\s+(?:khop|hop|phu hop))/,
  /\b(?:dang|sap|se)\s+(?:kiem tra|tim|loc|ra soat)\b[^.?!]*\b(?:sap|se|roi)\s+bao\b/,
  // 23/09/2026 (bắn thật, người thuê Q7, kho trống): "Dạ em lọc căn 2PN Quận 7 quanh 15 triệu cho anh nhé :)" — hứa lọc
  // mà không gửi căn nào. Câu HỎI ("em lọc căn cho anh theo khu vực nào ạ?") không bắt.
  /^(?![^?]*\?)[^?]*\b(?:de\s+)?(?:em|chau)\s+(?:se\s+)?(?:tim kiem|tim|loc|kiem|chon)\s+(?:(?:vai|may|mot so)\s+)?(?:can|nha|phong)\b[^.?!]*\bcho\s+(?:anh\/chi|anh|chi|minh|chu|co|bac|ong|ba|di|cau|ban)\b/,
  /\bkiem tra kho\b/,
];

// Khách đang HỎI có hàng không ("có căn nào quận 10 không em", "còn nhà nào
// tầm 5 tỷ không"). Chỉ khi đó một câu "Dạ có em." trơ trọi mới là lời hứa có
// hàng — "có hỗ trợ vay không em" → "Dạ có ạ." là câu trả lời khác hẳn.
export function laHoiCoHang(text: string): boolean {
  const kd = boDau(text);
  return /\b(?:co|con)\s+(?:(?:can|nha|lo|nen|mau|cai|dat)(?:\s+(?:nao|gi))?|(?:vai|may)\s+can)\b.*?(?:\b(?:khong|ko|k|hong|hem|chua)\b|\?|\bnao\b)/.test(kd);
}

export function laHuaCoHang(cau: string, hoiHang = true): boolean {
  const kd = boDau(cau.trim());
  return HUA_CO_HANG.some((re, i) => (i > 0 || hoiHang) && re.test(kd));
}

// 25/09/2026 (bắn thật lx-25): "Hẻm 3m ô tô vào được thì khách chuộng lắm =) Em tra thấy … đúng không anh chị?" — mặt
// cười cũng là hết câu; không tách thì cả cụm mang "?" của câu sau và lời khen sai lọt lưới `laKhenSai`.
const tachCau = (s: string): string[] => s.split(/(?<=[.!?…]|[=:;]\)+|:D|\^\^)\s+/).filter((c) => c.trim());

/** SRS-5.1zzzzzq: câu `c` (đã tách) có phải một câu được giữ (AI chép nguyên văn, có thể là cả câu hoặc một vế) — so bỏ dấu, bỏ dấu câu cuối. */
const laCauGiu = (giuCau: string[]) => {
  const g = giuCau.map((x) => boDau(x.trim().replace(/[.,!…;:\s]+$/u, ""))).filter((x) => x.length >= 8);
  return (c: string): boolean => {
    const kd = boDau(c.trim().replace(/[.,!…;:\s]+$/u, ""));
    return kd.length >= 8 && g.some((x) => kd.includes(x) || x.includes(kd));
  };
};

/**
 * Bỏ các câu hứa có hàng; chèn `loiThat` đúng chỗ câu đầu tiên bị bỏ (để "Dạ được
 * chị." đứng trước vẫn tự nhiên). Không có câu nào vi phạm → trả nguyên mảng.
 */
export function chanHuaCoHang(replies: string[], loiThat: string, hoiHang = true, aiHua: string[] = [], giuCau: string[] = []): { replies: string[]; daChan: boolean } {
  let daChan = false;
  // SRS-5.1zzzzzq: câu KIẾN THỨC DỰ ÁN đã qua kiểm căn cứ (`cauDuAnCoNguon`) không phải lời hứa có hàng, cũng không bị cuốn theo
  // "sau câu sai chỉ giữ câu hỏi" — nó có nguồn riêng, không dựng trên tiền đề kho.
  const laGiu = laCauGiu(giuCau);
  // SRS-5.1zzzzb: câu AI (lượt soát, đọc theo nghĩa) chỉ ra là "nói có hàng" — chép nguyên văn từ lời bot; code chỉ nhận khi câu đó
  // nằm trong lời bot (so bỏ dấu). Mẫu từ khoá `laHuaCoHang` vẫn chạy làm lưới đỡ.
  const aiKd = aiHua.map((a) => boDau(a.trim().replace(/[.,!…;:\s]+$/u, ""))).filter((a) => a.length >= 4);
  const laHua = (c: string) => laHuaCoHang(c, hoiHang) || aiKd.some((a) => boDau(c).includes(a));
  // 30/09/2026 (bắn thật lx-mua-e2): model đã tự nói thật "Hiện em chưa có căn nào sẵn…" mà câu hứa bên cạnh vẫn bị thay
  // bằng lời thật → khách đọc "chưa có căn" hai lần liền. Đã có câu nói thật thì chỉ bỏ câu hứa, không chèn thêm.
  const laNoiThat = (c: string) => !laHua(c) && /\bchua co (?:can|tin|nha|lo)\b/.test(boDau(c));
  let daChen = replies.some((r) => tachCau(r).some(laNoiThat));
  const ra: string[] = [];
  for (const r of replies) {
    const giu: string[] = [];
    for (const c of tachCau(r)) {
      // SRS-5.1zzzzb (bắn production 09/10/2026): "Dạ có anh. Em đang lọc căn 2 lầu hẻm xe hơi tầm 7 tỷ … cho anh. Còn anh muốn ở
      // khu nào …?" — câu đầu khớp mẫu, bị thay bằng lời thật; câu thứ hai nói CÙNG điều sai bằng chữ mẫu chưa có, nên còn nguyên
      // cạnh lời thật: "chưa có căn nào khớp … Em đang lọc căn 2 lầu …". Một lời đã sai về KHO thì cả phần kể sau nó dựng trên
      // tiền đề sai: sau câu sai đầu tiên chỉ giữ CÂU HỎI (khách vẫn được hỏi tiếp), bỏ mọi câu kể — không đoán câu nào là hứa.
      // SRS-5.1zzzzu (bắn production 10/10, thu-cmp46-4): "Dạ em lọc trong kho rồi ạ. Hiện bên em chưa có căn nào khớp…" — câu đầu khớp
      // mẫu, câu nói thật ĐỨNG SAU nó bị luật "bỏ mọi câu kể" cuốn đi, mà vì đã có câu nói thật nên lời thật không chèn → khách không
      // nhận được chữ nào. Câu nói thật (chưa có căn) chính là lời thay thế: luôn giữ.
      if (laGiu(c)) { giu.push(c); continue; }
      if (daChan && !/\?/.test(c) && !laNoiThat(c)) continue;
      if (!laHua(c)) { giu.push(c); continue; }
      daChan = true;
      if (!daChen) {
        const loi = giu.length || ra.length ? loiThat.charAt(0).toLocaleUpperCase("vi") + loiThat.slice(1) : `Dạ ${loiThat}`;
        giu.push(loi);
        daChen = true;
      }
    }
    const moi = giu.join(" ").trim();
    if (moi) ra.push(moi);
  }
  if (daChan && !ra.length) ra.push(`Dạ ${loiThat}`);
  return daChan ? { replies: ra, daChan } : { replies, daChan };
}

// ── Hiểu nhầm ý khách thì xin lỗi (23/09/2026, FR-218 b) ──────────────────────
// Chủ dự án 23/09: "Nếu mà hiểu nhầm ý khách thì phải xin lỗi". Câu lệnh đã dặn; đây là lưới khi model quên:
// khách nói rõ là bot hiểu / ghi sai mà không bong bóng nào có "xin lỗi" → chèn một câu xin lỗi ngắn trước
// bong bóng lời đầu tiên (sau các dòng máy 🤖 💾 📝). "sai rồi" trần KHÔNG tính — chủ nhà hay tự sửa số của mình.
export const HIEU_NHAM_RE =
  /\b(?:hieu (?:nham|sai|lam|lon|khong dung)|nham y|sai y|(?:khong|ko|k) phai y|(?:khong|ko|k) phai (?:vay|the|nhu vay)(?: dau)?\b|dau co (?:noi|hoi|bao|nhan)|(?:ghi|luu|nghe|doc) (?:nham|sai|lon)|tra loi (?:sai|lac|khong dung|ko dung)|lac de|noi gi vay|y (?:toi|tui|anh|chi|minh|em|chu|co|bac|con) la)\b/;
export function laKhachBaoHieuNham(cau: string): boolean {
  return HIEU_NHAM_RE.test(boDau(cau));
}
export function themXinLoiKhiHieuNham(khach: string, replies: string[], ac?: string | null): string[] {
  if (!laKhachBaoHieuNham(khach)) return replies;
  if (replies.some((r) => /\bxin loi\b/.test(boDau(r)))) return replies;
  const cau = ac ? `Dạ em xin lỗi ${ac}, em hiểu nhầm ạ.` : "Dạ em xin lỗi, em hiểu nhầm ạ.";
  const i = replies.findIndex((r) => !/^\s*(?:🤖|💾|📝|👤)/u.test(r));
  if (i < 0) return [...replies, cau];
  // Câu mở "Dạ …" của bong bóng đó thành phần sau lời xin lỗi — bỏ "Dạ" lặp.
  const sau = replies[i].replace(/^\s*Dạ[,!.]?(?:\s+|$)/, "").trim();
  const ghep = sau ? `${cau} ${sau.charAt(0).toUpperCase()}${sau.slice(1)}` : cau;
  return [...replies.slice(0, i), ghep, ...replies.slice(i + 1)];
}

// ── Không nhận là người thật (13/09/2026) ──────────────────────────────────
// Lượt bắn 13/09: khách "em là người hay máy vậy" → model "Em là người thật,
// không phải máy đâu anh/chị." Câu lệnh dặn "không thuyết minh về AI" và model
// hiểu thành "chối là AI". Nói dối về bản chất trợ lý là không được, dù khách
// thích giọng người thật tới đâu. Câu nào nhận là người / chối là máy thì thay
// bằng câu thật; phần còn lại (câu hỏi quay lại việc) giữ nguyên.
const NHAN_LA_NGUOI: RegExp[] = [
  // 17/09/2026 (Zalo thật): "cháu là người hỗ trợ" — bot xưng cháu và nhận là người "hỗ trợ / tư vấn".
  /\b(?:em|minh|toi|tui|chau)\s+(?:la\s+|dung la\s+)?(?:mot\s+)?(?:nguoi\s+(?:that|ho tro|tu van|phu trach|ban hang)|con nguoi|nguoi\s+binh thuong|nhan vien)\b/,
  /\b(?:khong|ko|chang|dau)\s+(?:phai\s+)?(?:la\s+)?(?:may|bot|robot|chatbot|ai|tri tue nhan tao)\b(?!\s*(?:lanh|giat|bom|nuoc|phat|in|tinh|cung|ca\b|nay|kia|khac|biet|lam))/,
];
export function laNhanLaNguoi(cau: string): boolean {
  const kd = boDau(cau);
  return NHAN_LA_NGUOI.some((re) => re.test(kd));
}
export function chanNhanLaNguoi(replies: string[], ac: string): string[] {
  let daThay = false;
  const ra: string[] = [];
  for (const r of replies) {
    const giu: string[] = [];
    for (const c of tachCau(r)) {
      if (!laNhanLaNguoi(c)) { giu.push(c); continue; }
      if (!daThay) {
        giu.push(`Em là trợ lý AI bên AI Ơi Nhà Đất, việc gì cần người thật thì có anh/chị phụ trách khu vực theo sát ${ac} ạ.`);
        daThay = true;
      }
    }
    const moi = giu.join(" ").trim();
    if (moi) ra.push(moi);
  }
  return daThay ? ra : replies;
}

// ── Hồ sơ người mua: model hay ĐIỀN BỊA (14/09/2026, bắn 16 hội thoại) ──────
// "cần mua gấp trong tháng này, quận bình thạnh tầm 8 tỷ, nhà mặt tiền" → lưu mục
// đích "để ở" (khách không nói); "cuối tuần anh đi xem nhà, rảnh chiều thứ 7" → lưu
// "khi nào cần dọn: chiều thứ 7" (đó là giờ XEM NHÀ); "hỏi hoài vậy, có căn nào thì
// gửi đi" → hoàn cảnh "Khách muốn xem danh sách căn ngay" (thái độ, không phải hoàn
// cảnh); "anh có 2 tỷ, vay thêm được không…" → hoàn cảnh = chép nguyên câu. Câu
// dặn đã ghi "CHỈ ghi điều khách NÓI RÕ. Không suy diễn." mà vẫn lọt, nên chặn bằng
// code ở ba trường hay bịa nhất. Chỉ xét câu khách VỪA nhắn — đó là nguồn duy nhất
// của thứ lưu trong lượt này.
const MUC_DICH_RE = /\b(de o|o gia dinh|cho gia dinh o|dau tu|kinh doanh|buon ban|cho thue lai|cho thue|lam van phong|mo shop|mo quan|dong tien|luot song|an cu)\b/;
const THOI_HAN_RE = /\b(gap|som|don vao|don ve|chuyen vao|chuyen ve|chot|trong thang|thang nay|thang sau|thang toi|tuan nay|tuan sau|cuoi nam|dau nam|nam nay|nam sau|truoc tet|sau tet|khong voi|tu tu|thang \d{1,2})\b/;
const XEM_NHA_RE = /\b(xem nha|coi nha|di xem|qua xem|toi xem|hen xem|ranh)\b/;
const THAI_DO_RE = /\b(khach|nguoi dung)\b|\b(muon xem|hoi hoai|buc|kho chiu|sot ruot|quan tam den|muon hieu|quan trong)\b/;

export function locHoSoMua(profile: Record<string, unknown>, text: string): { profile: Record<string, unknown>; bo: string[] } {
  const kd = boDau(text);
  const ra = { ...profile };
  const bo: string[] = [];
  const xoa = (k: string) => { if (ra[k] != null && ra[k] !== "") { bo.push(k); ra[k] = null; } };
  if (ra.purpose && !MUC_DICH_RE.test(kd)) xoa("purpose");
  if (ra.timeline && (!THOI_HAN_RE.test(kd) || (XEM_NHA_RE.test(kd) && !/\b(don|chuyen|chot|gap)\b/.test(kd)))) xoa("timeline");
  if (typeof ra.notes === "string" && ra.notes) {
    const kn = boDau(ra.notes).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 2);
    const chuKhach = new Set(kd.replace(/[^a-z0-9 ]+/g, " ").split(/\s+/));
    const trung = kn.length ? kn.filter((w) => chuKhach.has(w)).length / kn.length : 0;
    // Chép gần nguyên câu khách (≥ 85% chữ nằm sẵn trong câu, và dài) hoặc là lời tả thái độ.
    if ((kn.length >= 6 && trung >= 0.85) || THAI_DO_RE.test(boDau(ra.notes))) xoa("notes");
  }
  // 24/09/2026 (bắn thật sau #266): "tìm nhà quận 5 tầm 6 tới 7 tỷ, có phòng ngủ dưới trệt…" → model ghi
  // alley "hẻm xe hơi" dù khách không nói chữ nào về đường vào — và từ FR-216 b alley LỌC CỨNG kho (bỏ căn hẻm
  // xe máy). Chỉ giữ khi câu khách có nói tới đường vào.
  if (ra.alley && !/\b(?:hem|hxh|hxm|kiet|ngo|xe hoi|o to|oto|xe tai|xe may|mat tien|mt|mat duong|mat pho|duong truoc|7 cho|4 cho)\b/.test(kd)) xoa("alley");
  return { profile: ra, bo };
}

// ── Bot tự xưng "chúng mình" (14/09) — luật giọng: em xưng "em", bên công ty là "bên em";
// "mình" chỉ để GỌI khách. "căn hộ có ban công chúng mình có nhiều" đọc như khách với bot
// là một phe.
// Kèm: model gõ dính "Emghi nhận…" (lượt bắn 14/09 lần 3) — tách lại khi "em" dính đúng
// một động từ bot hay dùng; không có từ tiếng Việt nào mở bằng "emghi"/"emtìm".
export function suaTuXungMua(s: string): string {
  return s
    .replace(/(^|[\s,.!?])(C|c)húng (mình|tôi|tớ)(?![\p{L}])/gu, (_m, dau, c) => `${dau}${c === "C" ? "Bên" : "bên"} em`)
    .replace(/(^|[^\p{L}])([Ee]m)(ghi|tìm|lọc|gửi|báo|xem|hiểu|cập|kiểm|sẽ|đã|đang)(?![\p{L}])/gu, "$1$2 $3")
    // Lần 4: "…thì bạn cũng bị ảnh hưởng" — bot gọi khách "mình"/anh/chị, không "bạn". Chỉ
    // thay khi "bạn" làm chủ ngữ (sau là động từ / hết câu); "bạn bè", "người bạn" giữ.
    .replace(
      /(^|[\s,.!?])(?<!(?:người|các|những|một|với|cho|của|hai|ba) )([Bb])ạn(?=\s+(?:cũng|sẽ|nên|có|cần|muốn|đang|phải|được|chỉ|không|là|hãy|thấy|đã|vẫn|tìm|mua|thuê|xem|hỏi)(?![\p{L}])|\s*[,.!?]|$)/gu,
      (_m, dau, b) => `${dau}${b === "B" ? "Anh chị" : "anh chị"}`,
    );
}

// ── Dò mục đích khi không cần (14/09/2026, bắn 16 hội thoại lần 3) ─────────
// Câu dặn đã ghi "đủ khu vực + giá thì ngừng dò" và "không hỏi người THUÊ về mục đích",
// lượt bắn vẫn còn: thuê căn hộ Q7 15 triệu → "mình cần căn hộ để ở hay để cho thuê lại
// vậy ạ?"; "anh có 2 tỷ… mua nhà 4 tỷ quận 6" → "hẻm hay mặt tiền, để ở hay đầu tư ạ?".
// Chỉ bỏ CÂU HỎI kiểu "để ở hay đầu tư"; câu khác giữ nguyên. Người gọi quyết khi nào áp.
// Lần 4: model đổi chữ — "Mình ở hoặc đầu tư ạ?", "Mình đang tìm mua hay để ở nhà Quận 5 vậy?".
const HOI_MUC_DICH_RE =
  /\b(?:de o|o that|o gia dinh|tu o|o)\b.{0,40}\b(?:hay|hoac)\b.{0,40}\b(?:dau tu|kinh doanh|cho thue lai|cho thue|buon ban)\b|\b(?:dau tu|kinh doanh|cho thue lai|mua|thue)\b.{0,40}\b(?:hay|hoac)\b.{0,20}\b(?:de o|tu o)\b|\bmuc dich\b/;
export function laHoiMucDich(cau: string): boolean {
  return cau.includes("?") && HOI_MUC_DICH_RE.test(boDau(cau));
}
export function boHoiMucDich(replies: string[]): { replies: string[]; daBo: boolean } {
  let daBo = false;
  const ra: string[] = [];
  for (const r of replies) {
    if (/^(📋|💾|🤖|📝)/u.test(r)) { ra.push(r); continue; }
    const cau = tachCau(r);
    const giu = cau.filter((c) => !laHoiMucDich(c));
    if (giu.length !== cau.length) daBo = true;
    const moi = giu.join(" ").trim();
    if (moi) ra.push(moi);
  }
  // Bỏ hết thì thà giữ nguyên còn hơn gửi khách một lượt im lặng.
  if (!daBo || !ra.length) return { replies, daBo: false };
  return { replies: ra, daBo };
}

/**
 * Gộp ghi chú hoàn cảnh theo TỪNG Ý (tách ở ";" và xuống dòng). Ý mới đã nằm
 * trong ý cũ thì bỏ; ý mới bao trùm ý cũ thì thay. Trả null khi không có gì mới.
 */
export function gopGhiChu(cu: string | null | undefined, moi: string | null | undefined, tran = 500): string | null {
  const tach = (s: string | null | undefined, re: RegExp) =>
    String(s ?? "").split(re).map((x) => x.trim().replace(/[.。]+$/, "")).filter(Boolean);
  // Lần 4: "cần gần bệnh viện" ≡ "muốn gần bệnh viện" — bỏ động từ mong muốn khi so.
  const khoa = (s: string) =>
    boDau(s).replace(/[^a-z0-9]+/g, " ").replace(/\b(?:can|muon|thich|uu tien|mong)\b/g, " ").replace(/\s+/g, " ").trim();
  const y = tach(cu, /[;\n]+/);
  let doi = false;
  const timY = (m: string) => {
    const km = khoa(m);
    return y.findIndex((x) => {
      const kx = khoa(x);
      // Ý quá ngắn ("gần chợ") mà so "nằm trong" thì nuốt nhầm ý khác — so bằng.
      if (kx.length < 8 || km.length < 8) return kx === km;
      return kx.includes(km) || km.includes(kx);
    });
  };
  for (const ca of tach(moi, /[;\n]+/)) {
    // Cả cụm không dính ý cũ nào thì mới tách tiếp ở dấu phẩy (14/09 lần 3): cũ "cần gần
    // trường tiểu học Quận 3", mới "4 người ở cùng, cần gần trường tiểu học" — so nguyên
    // cụm thì lưu thành "…Quận 3; 4 người ở cùng, cần gần trường tiểu học".
    const manh = timY(ca) < 0 && /,\s+/.test(ca) ? tach(ca, /,\s+/) : [ca];
    for (const m of manh) {
      if (!khoa(m)) continue;
      const i = timY(m);
      if (i < 0) { y.push(m); doi = true; }
      else if (khoa(m).length > khoa(y[i]).length) { y[i] = m; doi = true; }
    }
  }
  if (!doi) return null;
  return y.join("; ").slice(-tran);
}

/**
 * Câu mở đầu là lời GHI NHẬN CÓ NỘI DUNG ("Dạ em sửa lại 6 tỷ 5…", "Em ghi lại:
 * hẻm xe hơi 4m…"). "Dạ em ghi nhận rồi ạ." trơ trọi KHÔNG tính — bong bóng code
 * nói rõ ghi gì thì phải giữ bong bóng đó.
 */
export function laCauGhiNhan(tin: string): boolean {
  return laCauGhiNhanMot(tin);
}

/**
 * Bỏ các câu ghi nhận CÓ nội dung ("Dạ em ghi 9 tỷ 5, 4 phòng ngủ rồi ạ.") khỏi các
 * bong bóng — dùng khi bong bóng 💾 đã báo đúng thứ đã lưu (FR-207). Không đụng bản
 * nháp (📋), 💾, 📝. Câu đầu bị bỏ mà câu đầu cũ mở bằng "Dạ" thì câu còn lại mở
 * bằng "Dạ" để khỏi cụt lủn. Bong bóng rỗng thì bỏ.
 */
export function boCauGhiNhan(replies: string[]): string[] {
  const ra: string[] = [];
  for (const r of replies) {
    if (/^(📋|💾|🤖|📝)/u.test(r)) { ra.push(r); continue; }
    const cau = tachCau(r);
    // 22/09/2026 (bộ đo giọng B04, chủ dự án chốt): "Dạ em sửa lại giá 7 tỷ 5 rồi ạ" là lời XÁC NHẬN
    // sau câu "à nhầm" của chủ nhà — giữ, dù 🤖 đã in giá mới. Chỉ bỏ lời "ghi/cập nhật" thường.
    // 25/09/2026 (e2e GOP-01 khi bỏ câu cố định số nhà): "Dạ em ghi địa chỉ rồi ạ, nhà mình thuộc phường nào vậy?" là MỘT
    // câu — bỏ nguyên câu là mất luôn câu hỏi, khách chỉ còn thấy 🤖. Câu ghi nhận có "?" thì giữ vế cuối (sau dấu phẩy).
    const giu = cau.flatMap((c) => {
      if (!laCauGhiNhanMot(c) || laCauSuaLai(c)) return [c];
      const vi = c.lastIndexOf(", ");
      if (!/\?\s*$/.test(c) || vi < 0) return [];
      const hoi = c.slice(vi + 2).trim();
      return hoi.length >= 4 ? [hoi.charAt(0).toLocaleUpperCase("vi") + hoi.slice(1)] : [];
    });
    if (giu.length === cau.length && giu.every((c, i) => c === cau[i])) { ra.push(r); continue; }
    if (!giu.length) continue;
    let dau = giu[0];
    if (giu[0] !== cau[0] && /^dạ\s/iu.test(cau[0]) && !/^dạ\s/iu.test(dau)) {
      dau = `Dạ ${dau.charAt(0).toLocaleLowerCase("vi")}${dau.slice(1)}`;
    }
    ra.push([dau, ...giu.slice(1)].join(" "));
  }
  return ra;
}

/**
 * FR-239 g (phát lại test 27/09): "Anh muốn bán" → 🤖 "Không bóc tách được gì" rồi model "Dạ, em ghi lại rồi anh." — ghi
 * nhận suông khi lượt này KHÔNG lưu được gì. Bỏ câu ghi nhận trơ ("Dạ em ghi lại rồi anh", "Em ghi nhận rồi ạ"); câu khác giữ.
 */
export function boGhiNhanSuong(replies: string[]): string[] {
  const TRO = /^(?:da|vang)?[\s,]*(?:(?:anh|chi|minh|chu|co)[\s,]+)?(?:em\s+)?(?:da\s+)?(?:ghi|luu|cap nhat)(?:\s+(?:lai|nhan|vao))?(?:\s+(?:roi|xong|het))?(?:\s+(?:anh|chi|minh|chu|co|a|nha|nhe|ạ))*\s*[.!]*$/;
  return locCauTrongBongBong(replies, (c) => !/^(📋|💾|🤖|📝)/u.test(c) && TRO.test(boDau(c.trim())));
}

/**
 * FR-239 h (phát lại test 27/09): "Dạo này khách chuộng khuôn đất ngang 3m dài tới 14m lắm anh", "khách tìm loại này nhiều
 * lắm" — nói về NHU CẦU THỊ TRƯỜNG mà bot không có số liệu nào. Câu khẳng định (không "?") nói khách / người mua chuộng, săn,
 * tìm, hỏi, quan tâm … nhiều / lắm → bỏ. Khen đặc điểm của chính căn ("sổ riêng là tốt") không đụng.
 */
export function boKhenThiTruong(replies: string[]): string[] {
  const RE = /\b(?:khach|nguoi mua|nguoi thue|thi truong)\b[^.!?]*\b(?:chuong|san|tim|thich|hoi|quan tam|ua)\b[^.!?]*\b(?:lam|nhieu|ghe)\b/;
  // FR-240 a (phát lại test 28/09 trên production): "5 tầng thì dễ bán lắm anh", "mảnh đất vuông vắn, dễ bán lắm anh",
  // "kinh doanh cho thuê ổn định thế là khách sẽ mua nhanh lắm anh" — ĐOÁN THANH KHOẢN, bot không có số liệu nào. Bỏ.
  // "anh cần bán nhanh", "chốt nhanh" (ý CHỦ NHÀ) và "khách mua hay hỏi pháp lý" (giải thích) không phải đoán thị trường — giữ.
  const THANH_KHOAN = /\b(?:de ban|ban chay|hut khach)\b|\b(?:ban|mua|chot|coc|ra hang) nhanh lam\b|\bkhach(?:\s+\S+){0,2}?\s+(?:se|de) (?:mua|chot|coc|xuong tien|quan tam|thich|chuong|san|ung)\b|\bkhach (?:mua|chot|coc) (?:nhanh|lien|ngay)\b|\bthanh khoan (?:tot|cao|manh)\b/;
  // FR-240 d (phát lại test 28/09 trên production): "khách tìm đất nền thường thích thế này", "khách mua hay tìm diện tích vừa
  // phải như vậy" — nói người mua HAY / THƯỜNG thích gì mà không có số liệu, không cần chữ "lắm". Câu giải thích lý do hỏi
  // ("khách mua hay hỏi pháp lý nên em hỏi kỹ") giữ.
  const NHU_CAU = /\b(?:khach|nguoi mua|nguoi thue)\b(?:\s+\S+){0,3}?\s+(?:hay|thuong|deu|luon)\s+(?:chuong|san|tim|thich|ua|hoi|quan tam)\b|\b(?:khach|nguoi mua|nguoi thue)\b[^.!?]*\bthuong thich\b/;
  // Lời HỨA báo lại ("Có khách quan tâm là em báo anh liền ạ") không phải khen thị trường.
  const HUA = /\b(?:la|thi)\s+em\b|\bem\s+(?:se\s+)?bao\b|\bnen em\b/;
  return locCauTrongBongBong(replies, (c) => {
    const kd = boDau(c);
    return !/^(📋|💾|🤖|📝)/u.test(c) && !/\?/.test(c) && (RE.test(kd) || THANH_KHOAN.test(kd) || NHU_CAU.test(kd)) && !HUA.test(kd);
  });
}

/**
 * FR-241 f (10 ca test làm khó 28/09): người bán nói "chưa có sổ, đang chờ ra sổ" → bot "Dạ, để em kiểm tra tiến độ sổ với chủ nhà
 * rồi báo anh chị liền" — người đang nhắn CHÍNH LÀ bên bán; câu "để em hỏi lại chủ nhà" (TONE_RULES, dành cho khách mua) sang nhánh
 * bán là hứa suông với một người thứ ba không có. Bỏ câu EM hỏi / kiểm tra / xác nhận / báo với chủ nhà. "Anh hỏi giúp chủ nhà…"
 * (nhờ môi giới hỏi) giữ.
 */
export function boHuaHoiChuNha(replies: string[]): string[] {
  const RE = /\bem\b[^.!?]{0,40}\b(?:hoi|kiem tra|xac nhan|bao|lien he|trao doi)\b[^.!?]{0,30}\bchu nha\b/;
  return locCauTrongBongBong(replies, (c) => !/^(📋|💾|🤖|📝)/u.test(c) && RE.test(boDau(c)));
}

/** "Dạ em sửa lại …", "Em đổi lại …" — lời xác nhận SỬA (khác lời ghi thường). */
function laCauSuaLai(tin: string): boolean {
  return /^(?:da|vang)?[\s,]*(?:(?:anh\/chi|anh|chi|minh)[\s,]+)?(?:em\s+)?(?:da\s+)?(?:sua|doi)\s+lai\b/.test(boDau(tin.trim()));
}

function laCauGhiNhanMot(tin: string): boolean {
  const dau = boDau(tachCau(tin.trim())[0] ?? "");
  // 14/09: "Dạ chị, em ghi lại: …" — cho phép đại từ gọi khách chen giữa "Dạ" và "em".
  // 22/09/2026 (bắn thật sau deploy #182, nhánh mua): "Dạ em đã lưu nhu cầu: mua nhà Quận 5…" lặp sau 🤖
  // "Đã lưu nhu cầu" — thêm động từ "lưu" ("lưu ý" không tính: phần còn lại quá ngắn).
  const m = /^(?:da|vang)?[\s,]*(?:(?:anh\/chi|anh|chi|minh)[\s,]+)?(?:em\s+)?(?:da\s+)?(?:ghi|sua|cap nhat|chinh|luu)(?:\s+(?:lai|nhan|ro|chuan))?\b/.exec(dau);
  if (!m) return false;
  const conLai = dau.slice(m[0].length)
    .replace(/\b(?:roi|xong|duoc|het|luon|vao|tin|cho|lai|a|nha|nhe|anh|chi|em|minh|ha|nghe)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return conLai.length >= 3;
}

/**
 * FR-177 (kịch bản sếp: "hỏi đúng MỘT thông tin"). 15/09/2026 (bắn thật): model vẫn
 * thỉnh thoảng hỏi hai câu một lượt ("…tầng mấy ạ? Có sổ hồng chưa ạ?"). Giữ tới hết
 * CÂU HỎI ĐẦU TIÊN, bỏ mọi câu đứng sau nó; bong bóng 📋/💾/📝 không đụng. Chỉ dùng
 * cho phía BÁN — phía mua được phép gộp 2–3 ý (HUMAN_CHAT_RULES).
 */
export function motCauHoi(replies: string[]): string[] {
  return replies.map((r) => {
    if (/^(📋|💾|🤖|📝)/u.test(r)) return r;
    const cau = tachCau(r);
    const i = cau.findIndex((c) => /\?\s*$/.test(c));
    if (i < 0 || i === cau.length - 1) return r;
    return cau.slice(0, i + 1).join(" ");
  });
}

/**
 * 03/10/2026 (chủ dự án: "tiêu chí là 1 câu, ngoại lệ thì có thể hỏi tầm 2 3 vấn đề gần nhau 1 lần cũng được"; SRS-5.1zm):
 * `motCauHoi` chỉ canh TỪNG bong bóng, nên bong bóng trả lời có câu hỏi + bong bóng câu kế = hai câu hỏi một lượt. Cả lượt chỉ
 * một bong bóng được hỏi: giữ câu hỏi ở bong bóng hỏi CUỐI (thường là câu hệ thống chọn); bong bóng hỏi phía trước bỏ các câu
 * hỏi, còn rỗng thì bỏ luôn. Bong bóng giữ lại có thể gộp 2–3 ý gần nhau (mẫu đánh giá) — không cắt bên trong nó.
 */
export function motCauHoiLuot(replies: string[]): string[] {
  const laHoi = (r: string) => !/^(📋|💾|🤖|📝)/u.test(r) && tachCau(r).some((c) => /\?\s*$/.test(c));
  let cuoi = -1;
  replies.forEach((r, i) => { if (laHoi(r)) cuoi = i; });
  if (cuoi < 0) return replies;
  return replies.map((r, i) => {
    if (i >= cuoi || !laHoi(r)) return r;
    let con = r;
    for (const c of tachCau(r)) if (/\?\s*$/.test(c)) con = con.replace(c, "");
    return con.split("\n").map((d) => d.replace(/\s{2,}/g, " ").trim()).filter(Boolean).join("\n");
  }).filter((r) => r.trim().length > 0);
}

/**
 * Câu hỏi ngược có ĐÁP ÁN CỦA HỆ THỐNG (15/09/2026, bắn thật F2): "bên bạn có cần mình
 * gửi hình không hay sao" — model được dặn trả lời trước mà vẫn bỏ qua, chỉ hỏi phường.
 * Chuyện gửi ảnh là luật của mình (FR-185: gửi vào chat là vào kho), nên trả lời tiền
 * định, không trông vào model. Không nhận ra thì null → model tự trả lời như cũ.
 */
export function dapHoiNguocTienDinh(hoi: string, ac: string, phi?: string | null, chuDe?: string | null,
  /** SRS-5.1zzzzzc: lời bot gần đây (nguyên văn) — câu soạn sẵn đã nói y hệt thì không nói lại nguyên câu. */
  botDaNoi = "",
  /** SRS-5.1zzzzzv: ví dụ con số phí do code tính từ giá tin (`viDuPhi`) — khách "đưa xem thử cách tính phí" nhận cả câu phí và ví dụ. */
  viDu: string | null = null): string | null {
  const kd = boDau(hoi);
  const ra: string[] = [];
  // 01/10/2026: AI đã nói câu hỏi thuộc CHỦ ĐỀ nào (`hoi_lai.chu_de`) → câu tiền định chỉ dùng khi đúng chủ đề; từ khoá
  // trùng mà chủ đề khác ("giá khu này") thì để model trả lời. Không có chủ đề (AI không chạy) → như cũ.
  const dung = (...cd: string[]) => !chuDe || cd.includes(chuDe);
  // "bên em là bot hả?" / "người thật hay máy?" — nói thật, một câu (TONE).
  if (dung("ve_bot") && /\b(bot|may|robot|ai|tu dong|nguoi that|nguoi hay may)\b/.test(kd) && /\b(la|phai|hay|ha|khong|ko|a|dung)\b/.test(kd) && !/\b(may lanh|may giat|may nuoc|may bom)\b/.test(kd)) {
    ra.push("Dạ em là trợ lý AI bên AI Ơi Nhà Đất, việc cần người thật thì có anh chị phụ trách theo sát mình ạ.");
  }
  // "phí sao?" — theo luật phí, hệ thống biết nhãn chính chủ / môi giới.
  // SRS-5.1zzzzx: AI nói chủ đề `phi` ("app này có lấy tiền trước không") → câu phí, không cần từ khoá; từ khoá chỉ còn là lưới đỡ khi
  // AI không chạy (chuDe trống) hay cho chủ đề cũ dich_vu.
  // SRS-5.1zzzzzc (khách mô phỏng lần năm, persona hỏi phí: cùng câu phí lặp nguyên văn ba lượt, không trả lời "ngoài 1% còn mất gì"). Câu
  // soạn sẵn chỉ nói NGUYÊN câu một lần: đã nói y hệt (cùng vai, cùng mức) thì nói ý "chỉ có khoản đó"; hỏi thuế / chi phí ngoài phí bên em
  // (chủ đề `thue_phi`, AI đọc) thì nói đúng điều có nguồn — phí bên em là khoản duy nhất, thuế là quy định nhà nước, em không tư vấn.
  if (phi && chuDe === "thue_phi") {
    ra.push(/quy định nhà nước/.test(botDaNoi)
      ? `Dạ bên em chỉ thu đúng khoản phí khi bán được thôi ạ, còn thuế phí sang tên ${ac} hỏi bên công chứng là chính xác nhất.`
      : `Dạ ngoài ${phi} thì bên em không thu thêm khoản nào ạ. Thuế, phí sang tên là theo quy định nhà nước, em không tư vấn con số được, ${ac} hỏi bên công chứng giúp em nha.`);
  } else if (phi && (chuDe === "phi" || (dung("dich_vu") && /\b(phi|hoa hong|hoa hong|phan tram|bao nhieu %|mat tien gi|ton gi|tinh sao)\b/.test(kd) && !/\bphi quan ly\b/.test(kd)))) {
    // Câu phí CHƯA có con số (vai chưa rõ) thì vẫn nói lại để nơi gọi nối câu hỏi vai — hỏi vai mới là cách trả lời đúng lần hai.
    // SRS-5.1zzzzze (khách mô phỏng lần bảy: "phí 1% kia lấy từ bên bán hay bên mua?" → "Dạ bên em chỉ có đúng khoản phí đó thôi ạ"):
    // câu soạn sẵn chọn theo CHỦ ĐỀ nên trả lời một câu khác câu khách hỏi. Con số đã nói rồi thì khách đang hỏi điều KHÁC về phí (ai
    // trả, khi nào thu, còn gì nữa) — để model trả lời theo luật phí (lượt soát nhận luật phí làm nguồn), không ghép câu soạn sẵn.
    // SRS-5.1zzzzzo: câu chưa rõ vai nay nêu CẢ HAI mức (có số) — vẫn coi là "chưa theo vai": nói lại để nơi gọi nối câu hỏi vai.
    const haiMuc = /chính chủ/.test(phi) && /môi giới/.test(phi);
    // SRS-5.1zzzzzv: có ví dụ con số (giá tin đã ghi, vai đã rõ) thì nói kèm; ví dụ chưa nói bao giờ thì nói cả khi câu phí đã nói rồi
    // (khách hỏi "cách tính" sau khi đã nghe mức) — ví dụ đã nói y hệt thì không lặp.
    const viDuMoi = viDu && !botDaNoi.includes(viDu) ? viDu : null;
    if (!(botDaNoi.includes(phi) && /\d/.test(phi) && !haiMuc)) ra.push(viDuMoi ? `Dạ ${phi} ạ. ${viDuMoi}` : `Dạ ${phi} ạ.`);
    else if (viDuMoi) ra.push(`Dạ ${phi} ạ. ${viDuMoi}`);
  }
  if (dung("dich_vu", "khac") && /\b(anh|hinh|video|clip)\b/.test(kd) && /\b(gui|can|co|chup|up|dang|them)\b/.test(kd) && !/\b(tien|phi|gia|ty|trieu)\b/.test(kd)) {
    ra.push(`Dạ ${ac} gửi ảnh thẳng vào đây là em cất vào tin luôn ạ.`);
  }
  return ra.length ? ra.join(" ") : null;
}

/**
 * Model TRẢ LỜI CÂU LỆNH thay vì trả lời khách (15/09/2026, bắn thật P2 — Groq): "Em hiểu
 * rồi ạ. Em là Kh•ai… Khi chủ nhà hỏi ngược, em trả lời câu đó TRƯỚC… Sẵn sàng nhận hội
 * thoại." Tin gửi chủ nhà không bao giờ nói về "chủ nhà" ở ngôi thứ ba hay nhắc số từ.
 */
export function laLoiMeta(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  const kd = boDau(t);
  // SRS-5.1zzzzp (bắn production 09/10): "Tôi hiểu rõ:\n\n- **Không ghi nhận lại** … Tôi sẵn sàng viết tin" — dấu hiệu HÌNH THỨC,
  // không phải từ khoá nội dung: bot không bao giờ xưng "tôi" mở câu, không bao giờ in đậm markdown trong tin Zalo.
  if (/\*\*[^*\n]+\*\*/.test(t) || /(?:^|[.!?:\n]\s*)toi\s/.test(kd)) return true;
  if (/\b(san sang nhan|em hieu roi a|cau hoi cuoi (?:tin )?(?:la|bat buoc)|\d+\s*[–-]\s*\d+ tu\b|khuon cau|theo luat phi|huong dan he thong|cau lenh|hoi thoai\b.*\bcho chu nha|ngoi thu|system prompt)\b/.test(kd)) return true;
  // Nói về "chủ nhà"/"khách" ở ngôi thứ ba kèm động từ chỉ đạo → đang đọc lại lời dặn.
  return /\b(chu nha|khach)\b/.test(kd) && /\b(hoi nguoc|tra loi truoc|mot tin duy nhat|viet mot tin|khong lap)\b/.test(kd);
}


// ── Tự xưng theo khách (16/09/2026, Zalo thật) ───────────────────────────────
// Khách xưng "chú" ("Chào cháu chú có căn nhà này cần giao bán") mà bot đáp "Dạ em…".
// Mọi câu tiền định lẫn câu model đều viết "em"; đổi ở MỘT chỗ trên đường ra thay
// vì sửa hơn 60 chuỗi. Chỉ đổi chữ "em" đứng riêng (không đụng "em gái", "kem",
// "xem"); "tụi em / bên em" → "tụi cháu / bên cháu" là đúng ý. Khách anh/chị → giữ nguyên.
const EM_RIENG = /(?<![\p{L}])(em|Em|EM)(?![\p{L}])/gu;
export function doiTuXung(replies: string[], xungHo: string | null | undefined, nhomTuoi?: string | null): string[] {
  // 22/09/2026: "chào cháu" chưa rõ chú hay cô (`nhom_tuoi = lon_tuoi`, chưa có `xung_ho`) → vẫn xưng cháu.
  if (!(xungHo && LON_TUOI.has(xungHo)) && nhomTuoi !== "lon_tuoi") return replies;
  return replies.map((r) =>
    r.replace(EM_RIENG, (_m, w: string) => w === "EM" ? "CHÁU" : w === "Em" ? "Cháu" : "cháu")
      // "em gái / em trai" là người thứ ba — trả lại.
      .replace(/cháu (gái|trai|bé|út)\b/g, "em $1")
  );
}

// ── 18/09/2026 (chủ dự án: "tắt cái mỗi câu trả lời đều khen đi, lâu lâu thì khen thôi") ──
/** Câu có dáng lời KHEN / nhận xét căn nhà (tiền định, so trên chữ có dấu lẫn không dấu). */
export const KHEN_RE =
  /\b(?:rất|lắm|tiện(?! ích)|ổn định|sáng sủa|đẹp|thích|chốt nhanh|hợp lý|thuận tiện|hút khách|dễ bán|chuộng|được giá|tốt|mạnh|ngon|lý tưởng|đáng giá|khách (?:hỏi|tìm|ưa)|rat|lam|sang sua|dep|chot nhanh|hop ly|thuan tien|hut khach|de ban|chuong|ly tuong)\b/iu;

/** Ba tin gần nhất của bot có câu khen chưa — có thì lượt này KHÔNG khen nữa ("lâu lâu"). */
export function vuaKhen(botGanDay: Array<string | null | undefined>): boolean {
  return botGanDay.slice(-3).some((b) => KHEN_RE.test(b ?? ""));
}

/**
 * Bỏ câu KHEN khỏi tin bot, giữ câu hỏi và câu ghi nhận. Tách theo dấu chấm / xuống dòng;
 * câu có "?" hoặc không có dáng khen thì giữ. Bỏ hết mà không còn gì thì trả nguyên văn.
 */
export function boCauKhen(reply: string): string {
  const cau = reply.split(/(?<=[.!])\s+|\n+/).map((c) => c.trim()).filter(Boolean);
  const giu = cau.filter((c) => c.includes("?") || !KHEN_RE.test(c));
  if (!giu.length || giu.length === cau.length) return reply;
  return giu.join(" ").replace(/^\s*[,;]\s*/, "").trim();
}

// ── Lời nói VỚI BOT, không phải dữ liệu căn nhà (21/09/2026, chủ dự án "làm cả 4") ──
// Bắn thật: "xóa sạch data của anh đi để anh test lại" lúc duyệt → nguyên câu vào `bo_sung` rồi gửi
// lại nháp; "ok em đăng đi, mà cái dòng phù hợp đọc kỳ quá" (vế sau) cũng vậy. Câu nói về hệ thống /
// dữ liệu / bản nháp / cách bot hỏi là lời nói với bot: không ghi vào tin, không gửi lại nháp.
export function laNoiVoiBot(text: string): boolean {
  const kd = boDau((text ?? "").trim());
  if (!kd) return false;
  if (/\b(data|du lieu|reset|test|he thong|con bot|bot|may (?:hoi|tra loi)|system)\b/.test(kd)) return true;
  // Nhận xét về câu/dòng/bản nháp/tin nhắn của bot: "cái dòng phù hợp đọc kỳ quá", "bản nháp dài quá".
  return /\b(dong|cau hoi|cau nay|ban nhap|tin nhan|noi dung|chu nay)\b/.test(kd) &&
    /\b(ky qua|ky vay|doc ky|kho hieu|dai qua|ngan qua|lap lai|sai chinh ta|xau|khong hay|thua)\b/.test(kd);
}

/** Khách xin XOÁ/RESET dữ liệu — bot không tự làm được, phải nói thật. */
export function laXinXoaDuLieu(text: string): boolean {
  const kd = boDau((text ?? "").trim());
  // 22/09/2026 (kịch bản E): "xoá căn 1 khỏi hệ thống của tui" cũng là xin xoá dữ liệu.
  return /\b(xoa|reset|don|go)\b/.test(kd) && /\b(data|du lieu|tin|ho so|thong tin|sach|he thong|tai khoan|can \d|can nay|can do|can kia)\b/.test(kd);
}

/**
 * 22/09/2026 (kịch bản E): môi giới "khách nào hỏi thì cho tui số của họ nha" — bot từng gật "Dạ em hiểu anh chị
 * tự liên hệ khách rồi". Người mua bên này KHÔNG để lại số (bất biến DH); mọi liên hệ qua bot và CTV.
 */
export function laXinSoKhach(text: string): boolean {
  const kd = boDau((text ?? "").trim());
  return /\b(?:cho|gui|xin|lay|dua|bao|chuyen)\b[^.?!]{0,25}\b(?:so|sdt|so dien thoai|zalo|lien he|contact|thong tin)\b[^.?!]{0,20}\b(?:khach|ho|nguoi mua|nguoi hoi|nguoi ta|khach hang|ben mua)\b/.test(kd) ||
    /\b(?:so|sdt|zalo|so dien thoai)\s+(?:cua\s+)?(?:khach|ho|nguoi mua|khach hang|ben mua)\b/.test(kd) && /\b(?:cho|gui|xin|lay|dua|bao|chuyen|de)\b/.test(kd);
}

/**
 * SRS-5.1zzzzy (khách mô phỏng 11/10: "chị muốn xoá mấy dòng về con chị ở Úc với sẽ tăng giá đi" → bot "chỗ nào ghi nhầm chị nhắn lại
 * giúp em" hai lần, tin không lên kệ). Ô "Thêm" (fact `bo_sung`) không có trong danh sách ô xin bỏ, nên yêu cầu bỏ một ý ở đó không có
 * đường đi. AI chỉ ra cụm chủ nhà xin bỏ (`bo_y`); code chỉ bỏ MẢNH có thật trong ghi chú đang lưu (so bỏ dấu, chứa nhau) — không có
 * mảnh nào khớp thì không bỏ gì. Ghi chú lưu nhiều mảnh nối " · " trong một dòng: bỏ từng mảnh, dòng rỗng thì xoá.
 */
export function boYGhiChu(dong: Array<{ id: string; answer: string | null }>, boY: string[]): { doi: Array<{ id: string; answer: string | null }>; daBo: string[] } {
  const can = boY.filter((x) => (x ?? "").trim().length >= 3);
  const doi: Array<{ id: string; answer: string | null }> = [];
  const daBo: string[] = [];
  for (const d of dong) {
    const manh = (d.answer ?? "").split(/\s*·\s*/).map((m) => m.trim()).filter(Boolean);
    const giu = manh.filter((m) => {
      const bo = can.some((c) => trungY(m, c));
      if (bo) daBo.push(m);
      return !bo;
    });
    if (giu.length !== manh.length) doi.push({ id: d.id, answer: giu.length ? giu.join(" · ") : null });
  }
  return { doi, daBo };
}

/** Ô của tin mà câu "xoá/bỏ … nhầm" đang nhắc tới; nhãn để đọc lên. */
export const O_XIN_BO: Array<[string, RegExp, string]> = [
  ["do_rong_hem", /\b(?:hem|hxh|ngo|duong vao)\b/, "hẻm"],
  ["gia", /\bgia\b/, "giá"],
  ["phuong", /\bphuong\b|\bp\s*\d{1,2}\b/, "phường"],
  ["quan", /\b(?:quan|huyen)\b|\bq\s*\d{1,2}\b/, "quận"],
  ["dien_tich", /\bdien tich\b|\bm2\b|\bngang\b|\bdai\b/, "diện tích"],
  ["so_phong_ngu", /\bphong ngu\b|\bpn\b/, "số phòng ngủ"],
  ["ket_cau", /\b(?:tang|lau|tret|tam)\b/, "số tầng"],
  ["phap_ly", /\b(?:so hong|so do|phap ly|hoan cong)\b/, "pháp lý"],
  ["huong", /\bhuong\b/, "hướng"],
  ["vi_tri", /\b(?:dia chi|so nha|duong|vi tri)\b/, "địa chỉ"],
];

/**
 * 22/09/2026 (kịch bản C, bắn thật): "em xoá cái hẻm 4m ghi nhầm đi" — chủ nhà xin BỎ một thứ đã ghi,
 * không phải dữ liệu mới. Bản trước đọc thành địa chỉ (street = nguyên câu, tin lên web như thế) và
 * "hẻm 4m" trong câu đè lại hẻm 3.5m vừa sửa. Nhận: động từ xoá/bỏ/gỡ + (nhầm/sai/lộn/dư) hoặc "xoá … đi",
 * KHÔNG phải xin xoá cả dữ liệu (`laXinXoaDuLieu`). Trả ô đang nhắc (null = không đoán ra ô).
 */
export function laXinBoTruong(text: string): { truong: string | null; nhan: string | null } | null {
  const kd = boDau((text ?? "").trim());
  if (!kd || laXinXoaDuLieu(text)) return null;
  // "bỏ qua câu này đi" là xin BỎ QUA câu hỏi (đường hoãn/FR-177 g), không phải bỏ dữ liệu.
  if (/\bbo qua\b/.test(kd)) return null;
  // 30/09/2026 (bắn thử vector): "…cho người già, sau nhà có sân phơi rộng, đi bộ ra chợ 5 phút" — bỏ dấu thì "đi bộ" thành
  // "di bo" (= "đi bỏ"), "già" thành "gia" (= giá) → bot đáp "tin mình đang ghi giá 8 tỷ ạ…". Tin CÓ DẤU thì chỉ nhận chữ
  // xoá / bỏ / gỡ / huỷ viết đúng dấu (bộ, bố, gò không phải bỏ); tin không dấu thì bỏ cụm "đi bộ" trước khi dò.
  const coDau = /[à-ỹđ]/iu.test(text ?? "");
  const coXoa = coDau
    ? /(?<![\p{L}])(?:xoá|xóa|xoa|bỏ|gỡ|huỷ|hủy|huy)(?![\p{L}])/iu.test((text ?? "").normalize("NFC"))
    : /\b(?:xoa|bo|go|huy|xoa bo)\b/.test(kd.replace(/\bdi bo\b/g, " "));
  if (!coXoa) return null;
  // 22/09/2026 (kịch bản E): "xoá căn 1 khỏi hệ thống đi" từng bị bắt thành "xin bỏ ô" — luật "xoá … đi" quá rộng.
  // Nay: có chữ nhầm/sai, HOẶC nêu rõ một ô kèm lời giục (đi/giúp/dùm). Xoá tin/căn/dữ liệu đi đường `laXinXoaDuLieu`.
  const o0 = O_XIN_BO.find(([, re]) => re.test(kd));
  const coNham = /\b(?:nham|sai|lon|du|thua|ghi lon|ghi nham)\b/.test(kd);
  const coGiuc = /\b(?:di|gium|dum|giup|ho)\b/.test(kd);
  if (!coNham && !(o0 && coGiuc)) return null;
  // "bỏ hẻm 4m, hẻm đúng là 3m5" — có SỐ MỚI kèm thì là lời sửa, đi đường sửa (không phải xin bỏ suông).
  const soMoi = kd.replace(/\b(?:xoa|bo|go|huy)\b[^,;.]*?\b(?:nham|sai|lon|du|thua|di)\b/, "");
  if (/\d/.test(soMoi) && /\b(?:dung la|thuc ra|chu khong|chu ko|thanh|la)\b/.test(soMoi)) return null;
  const o = O_XIN_BO.find(([, re]) => re.test(kd));
  return { truong: o?.[0] ?? null, nhan: o?.[2] ?? null };
}

/**
 * 22/09/2026 (kịch bản C): bong bóng code "Dạ em sửa lại Phường 2 rồi ạ." rồi model "Phường 2 em sửa lại
 * rồi ạ." — câu ngắn dưới ngưỡng `boCauTrung`. Đã có lời sửa tiền định thì bỏ MỌI câu "sửa lại/đổi lại/cập
 * nhật … rồi" của model, dù nó không mở đầu bằng "Dạ em". Không đụng 📋/💾/🤖/📝.
 */
export function boCauSuaLaiModel(replies: string[]): string[] {
  return locCauTrongBongBong(replies, (c) => {
    const kd = boDau(c);
    return /\b(?:sua|doi|cap nhat|chinh)\s+lai\b/.test(kd) && /\b(?:roi|xong)\b/.test(kd) && !/\?/.test(c);
  });
}

/**
 * "anh/chị" có gạch chéo là chữ máy (TONE_RULES cấm model, nhưng câu tiền định vẫn dùng khi chưa biết
 * cách gọi — bắn thật 21/09: "Nhà mình phường mấy anh/chị nhỉ?"). Người bán hàng thật nói "anh chị"
 * (không gạch) khi chưa biết nam hay nữ. Áp ở đường ra, chỉ khi CHƯA biết cách gọi.
 */
export function boGachCheo(s: string): string {
  return (s ?? "").replace(/anh\/chị/g, "anh chị").replace(/Anh\/chị/g, "Anh chị").replace(/ANH\/CHỊ/g, "ANH CHỊ");
}

/**
 * FR-238 (bắn thật lx-46, 28/09/2026): tin hỏi bù (`ask-seller`) do model viết gọn câu đứng tên thành "Ai đứng tên sổ hiện
 * tại nhỉ?" — khách dễ đáp bằng HỌ TÊN (bot không bao giờ được xin tên thật). Mọi câu model tự viết về đứng tên bị bỏ, thay
 * bằng câu mẫu; chèn trước câu cảm ơn cuối tin nếu có. Chủ dự án chốt "giữ nguyên câu mẫu": bắn lại sau deploy, model viết
 * "Sổ nhà hiện đứng tên ai (chính anh hay người nhà khác) ạ?" — có vế người nhà mà vẫn hỏi "ai", nên không miễn câu nào.
 */
export function giuCauDungTen(msg: string, cauMau: string): string {
  if ((msg ?? "").includes(cauMau)) return msg;
  const dong: string[] = [];
  for (const d of (msg ?? "").split("\n")) {
    const giu = tachCau(d).filter((c) => !/\bdung ten\b/.test(boDau(c)));
    dong.push(giu.length === tachCau(d).length ? d : giu.join(" ").trim());
  }
  const sach = dong.filter((d, i) => d.trim() || (i > 0 && dong[i - 1].trim()));
  const iCamOn = sach.map((d) => /\bcam on\b/.test(boDau(d))).lastIndexOf(true);
  if (iCamOn >= 0) {
    // "…vậy ạ? Em cảm ơn mình ạ :)" chung một dòng → câu mẫu chen ngay trước câu cảm ơn, cùng dòng.
    const cau = tachCau(sach[iCamOn]);
    const j = cau.findIndex((c) => /\bcam on\b/.test(boDau(c)));
    if (j > 0) sach[iCamOn] = [...cau.slice(0, j), cauMau, ...cau.slice(j)].join(" ");
    else sach.splice(iCamOn, 0, cauMau);
  } else sach.push(cauMau);
  return sach.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Lọc CÂU trong từng bong bóng theo một luật, GIỮ NGUYÊN xuống dòng: bong bóng 📝/📋 nhiều dòng
 * ("📝 Em ghi nhận: …\nSai chỗ nào … nhắn lại") được tách theo dòng rồi theo câu; dòng nào không
 * mất câu nào thì giữ nguyên chữ gốc. Không bỏ gì thì trả đúng mảng cũ (so `===` được).
 */
/**
 * SRS-5.1zzzzu (bắn production 10/10, thu-cmp45-4): van bỏ câu "Dạ em lọc rồi, hiện bên em chưa có căn nào khớp…" thì câu sau nó
 * "Nhưng em sẽ theo sát…" thành bong bóng mở bằng từ nối trỏ về câu đã mất. Mọi chỗ BỎ CÂU đi qua đây: câu giữ lại mà câu ngay trước nó
 * vừa bị bỏ thì gọt từ nối đối lập ở đầu (nhưng / tuy nhiên / thế nhưng / song / mà). Không đổi chữ nào khác.
 */
const TU_NOI_DAU = /^(?:nhưng mà|nhưng|tuy nhiên|thế nhưng|song|mà)\s*,?\s+/iu;
export function goTuNoiDau(c: string): string {
  const m = c.match(TU_NOI_DAU);
  if (!m) return c;
  const r = c.slice(m[0].length);
  return r ? r.charAt(0).toLocaleUpperCase("vi") + r.slice(1) : c;
}
/** Lọc câu theo `bo`; câu giữ mà câu liền trước bị bỏ thì gọt từ nối đầu (`goTuNoiDau`). */
export function locCauGotNoi(cac: string[], bo: (cau: string) => boolean): string[] {
  const giu: string[] = [];
  let truocBo = false;
  for (const c of cac) {
    if (bo(c)) { truocBo = true; continue; }
    giu.push(truocBo ? goTuNoiDau(c) : c);
    truocBo = false;
  }
  return giu;
}
function locCauTrongBongBong(replies: string[], bo: (cau: string) => boolean): string[] {
  let daBo = false;
  const ra: string[] = [];
  for (const r of replies) {
    const dongMoi: string[] = [];
    for (const dong of r.split("\n")) {
      const cac = tachCau(dong);
      const giu = locCauGotNoi(cac, bo);
      if (giu.length === cac.length) { dongMoi.push(dong); continue; }
      daBo = true;
      const gop = giu.join(" ").trim();
      if (gop) dongMoi.push(gop);
    }
    const moi = dongMoi.join("\n").trim();
    if (moi) ra.push(moi);
  }
  return daBo ? ra : replies;
}

/**
 * Bỏ câu LẶP giữa các bong bóng (22/09/2026, bộ đo giọng B08): câu tiền định "Dạ em là trợ
 * lý AI…" đứng trước, model đọc lịch sử rồi chép lại gần nguyên văn ở bong bóng sau → chủ
 * nhà đọc hai lần. Câu ≥ 6 từ (bỏ từ đệm) mà ≥ 80% từ đã nằm trong một câu trước đó thì bỏ;
 * câu ngắn ("Dạ.", "Anh ơi?") giữ nguyên vì trùng là chuyện thường.
 */
/**
 * Chưa biết khách là anh hay chị mà câu MỞ bằng "Anh …" / "Chị …" (24/09/2026, bắn 10 tin: "Anh cần bán gấp hay chờ được
 * giá thôi?") → "Anh chị …". Chữ "anh" / "chị" cuối câu đã có luật riêng ở chat-reply; "Anh chị" đủ cặp không đụng.
 */
export function boDoanGioiDauCau(s: string): string {
  return s.replace(/(^|[.!?…]\s+|\n)(Anh|Chị)(?=\s+(?!(?:chị|anh|em)(?![\p{L}]))\p{Ll})/gu, "$1Anh chị");
}

/**
 * Chưa biết khách là anh hay chị: "anh" / "chị" GỌI khách thì bỏ / đổi (02/10/2026 gom từ nhánh bán sang dùng chung — bắn thật
 * thu-trl-04, khách mua xưng "mình" mà bot "Dạ được chị ơi"). Ba dạng:
 *   · đứng cuối câu (trước ? ! . hoặc hết câu) → "ạ" ("…vậy anh?" → "…vậy ạ?"); "anh chị" đủ cặp và "anh Thu" không đụng;
 *   · gọi "anh ơi" / "chị ơi" → "anh chị ơi" (05/10/2026: không còn "mình", SRS-5.1zza);
 *   · mở câu "Anh …" / "Chị …" → "Anh chị …" (`boDoanGioiDauCau`).
 */
export function boGoiDoanGioi(s: string): string {
  return boDoanGioiDauCau(boGoiCuoiVaOi(s));
}
/** Hai dạng đầu của `boGoiDoanGioi` (nhánh bán dùng riêng: khách lớn tuổi thì không đổi đầu câu thành "Anh chị"). */
export function boGoiCuoiVaOi(s: string): string {
  return s.replace(/(?<!\banh\s)(?<![\p{L}\/])(anh|chị)(\s+)ơi(?![\p{L}])/giu, (_m, ai: string, cach: string) => (/^[AC]/.test(ai) ? "Anh chị" : "anh chị") + cach + "ơi")
    // 02/10 (thu-trl-06): "Dạ được anh, để em lọc…" — gọi đứng trước dấu phẩy; "anh, chị" (cặp tách phẩy) giữ.
    .replace(/(?<!\banh\s)(?<![\p{L}\/])(anh|chị)(?=\s*,(?!\s*(?:anh|chị)(?![\p{L}])))/giu, (m: string) => (/^[AC]/.test(m) ? "Anh chị" : "anh chị"))
    .replace(/(?<!\banh\s)(?<![\p{L}\/])(?:anh|chị)(?=\s*[?!.]|\s*$)/gu, "ạ").replace(/\bạ ạ\b/g, "ạ");
}

export function boCauTrung(replies: string[]): string[] {
  // Trùng là trùng Ý, không cần trùng chữ: "Dạ em là trợ lý AI bên AI Ơi Nhà Đất, việc cần người
  // thật thì có anh chị phụ trách theo sát mình ạ" và "Em là trợ lý AI bên AI Ơi Nhà Đất, việc gì
  // cần người thật thì có anh chị phụ trách khu vực theo sát anh ạ" là một câu nói hai lần.
  const DEM = new Set(["da", "a", "nha", "nhe", "em", "anh", "chi", "chu", "co", "bac", "minh", "oi", "la", "thi", "gi", "cung", "voi", "va"]);
  const tuCua = (c: string) => new Set(boDau(c).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !DEM.has(t)));
  const daThay: Set<string>[] = [];
  return locCauTrongBongBong(replies, (c) => {
    // 24/09/2026 (tin thật 152 Trần Đình Xu): dòng "📍 địa chỉ" của bản nháp trùng ≥ 80% chữ với dòng TIÊU ĐỀ ngay
    // trên nên bị bỏ — bản nháp mất địa chỉ. Dòng mở bằng biểu tượng (📍💰📐… bản nháp, 🤖 bóc tách) là dữ liệu
    // tiền định, không phải câu nói lặp: không bỏ, không dùng để so.
    if (/^\s*\p{Extended_Pictographic}/u.test(c)) return false;
    const tu = tuCua(c);
    if (tu.size < 6) return false;
    const trung = daThay.some((cu) => {
      let chung = 0;
      for (const t of tu) if (cu.has(t)) chung++;
      return chung / Math.min(tu.size, cu.size) >= 0.8;
    });
    if (!trung) daThay.push(tu);
    return trung;
  });
}

/**
 * Bỏ câu KHEN KHÔNG CÓ CĂN CỨ (22/09/2026, bộ đo giọng B01/B15/B16): chủ nhà nói "hẻm 5m"
 * mà bot khẳng định "ô tô vào được", "xuyên thoáng", "nở hậu" khi chủ chưa nói. TONE_RULES
 * cấm khen điều khách không nói nhưng model vẫn lọt → chặn bằng code. Chỉ áp cho câu MODEL
 * viết (bản nháp / bảng tiền định đọc từ DB không qua đây). Chỉ bỏ câu KHẲNG ĐỊNH (không có
 * dấu hỏi) mang từ khoá mà `bangChung` (chữ chủ nhà đã gõ, đã bỏ dấu) không có. Câu hỏi
 * ("ô tô vào được không anh?") giữ — hỏi là đúng việc.
 */
const KHEN_CAN_BANG_CHUNG: Array<[RegExp, RegExp]> = [
  [/\b(?:o to|oto|xe hoi|xe oto)\b/, /\b(?:o to|oto|xe hoi|xe oto|xe 4 banh|4 banh|hxh)\b/],
  [/\bxuyen thoang\b/, /\bxuyen thoang\b|\bthoang\b/],
  [/\bno hau\b/, /\bno hau\b/],
  [/\bhoan cong\b/, /\bhoan cong\b/],
  [/\b(?:so hong rieng|so rieng|shr)\b/, /\b(?:so hong rieng|so rieng|shr|so hong)\b/],
  // 25/09/2026 (bắn thật lx-07): "Bán nhà 105 Trần Bình Trọng quận 10…" → bot "Nhà mặt tiền Trần Bình Trọng…".
  // Số nhà trần không nói nhà mặt tiền hay trong hẻm (người rao hay bỏ số hẻm) — chủ chưa nói thì model không được
  // khẳng định. "mặt tiền 4m" / "ngang mặt tiền" là CHIỀU NGANG, không phải vị trí — để yên.
  [/(?<!ngang\s)\bmat tien\b(?!\s*(?:rong\s*|ngang\s*|la\s*|khoang\s*|tam\s*)?\d)|\bmat (?:pho|duong)\b/, /\b(?:mat tien|mat pho|mat duong|mt|mtkd|2mt)\b/],
  [/\b(?:hem|hxh|hxt|hxm)\b/, /\b(?:hem|hxh|hxt|hxm|kiet|ngo|ngach)\b|\d\s*\/\s*\d/],
  // 01/10/2026 (bắn thử bán lx-ban-293d): chủ nói "hẻm 3m", 🤖 ghi "hẻm xe hơi 3m" (từ 3m là xe hơi, FR-227 b) mà model
  // viết "hẻm 3 m thuận tiện cho xe máy" — tự hạ loại hẻm. "Xe máy" chủ chưa nói thì không khẳng định.
  [/\bxe may\b/, /\b(?:xe may|hxm|ba gac)\b/],
  // 30/09/2026 (bắn thử bán lx-ban-292b): "Sunrise City có hồ bơi chân mây rộng" — dữ liệu dự án không có, chủ nhà không nói.
  // Tiện ích khu / dự án model khẳng định phải có trong chữ chủ nhà.
  [/\b(?:ho boi|be boi|phong gym|gym|san tennis|san bong|san choi|khu vui choi|cong vien noi khu|cong vien|bbq|sieu thi|trung tam thuong mai|tttm|truong hoc|truong quoc te|benh vien|an ninh 24|bao ve 24)\b/,
    /\b(?:ho boi|be boi|phong gym|gym|san tennis|san bong|san choi|khu vui choi|cong vien|bbq|sieu thi|trung tam thuong mai|tttm|truong|benh vien|an ninh|bao ve|tien ich)\b/],
];
/**
 * Model nói một SỐ ĐO mà chủ nhà chưa từng gõ (25/09/2026, chủ dự án test Zalo: khách "nở hậu nhé" → bot "Anh nói nở hậu
 * 4.5 nhỉ, em ghi rồi" — số 4.5 lấy từ câu ví dụ trong prompt). Số theo sau "nở hậu / hẻm / ngang / dài / rộng" phải có
 * trong chữ chủ nhà ("4.5" khớp "4.5", "4,5", "4m5"). Câu HỎI cũng tính — "nở hậu 4.5 đúng không anh?" vẫn là bịa.
 */
export function laSoDoBia(menhDe: string, bangChung: string): boolean {
  const kd = boDau(menhDe).replace(/(\d),(\d)/g, "$1.$2");
  const bc = boDau(bangChung ?? "").replace(/(\d),(\d)/g, "$1.$2").replace(/(\d)\s*m\s*(\d)(?!\d)/g, "$1.$2");
  const re = /\b(?:no hau|hem(?: rong)?|ngang|dai|rong)\s*(?:la\s*|khoang\s*|tam\s*|chung\s*)?(\d+(?:\.\d+)?)(?:\s*m\s*(\d)(?!\d))?/g;
  for (const m of kd.matchAll(re)) {
    const so = m[2] ? `${m[1]}.${m[2]}` : m[1];
    if (!new RegExp(`(?<![\\d.])${so.replace(".", "\\.")}(?![\\d]|\\.\\d)`).test(bc)) return true;
  }
  // FR-241 h (10 ca test làm khó 28/09): "Trệt lửng 2 lầu sân thượng là 3 phòng ngủ rồi anh chị ơi" — model tự suy số phòng từ
  // số tầng. Số phòng ngủ / WC model nói ra phải có trong chữ chủ nhà.
  // Bắn thử 01/10 (lx-ai-06): chủ gõ "hẻm 3m", bot "Trệt lửng 2 lầu 3 phòng ngủ thì khách gia đình chuộng lắm" — chữ số 3
  // có trong tin (của "hẻm 3m") nên lọt. Số phòng phải đi CÙNG đơn vị phòng trong chữ chủ nhà.
  for (const m of kd.matchAll(/\b(\d{1,2})\s*(phong ngu|pn|wc|toilet|phong tam)\b/g)) {
    const donVi = /wc|toilet|tam/.test(m[2]) ? "(?:wc|toilet|phong tam|ve sinh|nha ve sinh)" : "(?:phong ngu|pn|phong|p ngu)";
    if (!new RegExp(`(?<![\\d.])${m[1]}\\s*${donVi}\\b`).test(bc)) return true;
  }
  return false;
}
/**
 * Bot KHẲNG ĐỊNH kết cấu chủ nhà chưa nói (bắn thử 01/10, lx-ai-06: "Trệt lửng 2 lầu …" khi chủ chưa nói tầng nào). Số lầu /
 * tầng / tấm phải có cùng đơn vị trong chữ chủ nhà; "lửng" phải có chữ lửng / gác. Chỉ soát câu khẳng định (câu hỏi "có lửng
 * không anh?" là đúng việc).
 */
export function laKetCauBia(menhDe: string, bangChung: string): boolean {
  const kd = boDau(menhDe);
  const bc = boDau(bangChung ?? "");
  for (const m of kd.matchAll(/\b(\d{1,2})\s*(?:lau|tang|tam)\b/g)) {
    if (!new RegExp(`(?<![\\d.])${m[1]}\\s*(?:lau|tang|tam|l)\\b`).test(bc)) return true;
  }
  return /\blung\b/.test(kd) && !/\b(?:lung|gac)\b/.test(bc);
}
/**
 * `chiSoDo` (SRS-5.1zzzzp): lượt AI soát nhận xét (`kiem-khen.ts`) đã chạy xong cho lời này — AI là chủ phần "khen có căn cứ
 * không", danh sách từ khoá bên dưới chỉ là lưới đỡ khi AI hỏng. Chạy cả hai thì từ khoá cắt nhầm lời AI đã cho qua (bắn
 * production 09/10: "Anh chụp giúp em vài tấm mặt tiền, sổ và hẻm được không ạ?" → "Sổ và hẻm được không ạ?" — "mặt tiền" ở
 * đây là chỗ chụp ảnh, không phải lời khen). Số đo / kết cấu bịa là so SỐ tất định, vẫn soát.
 */
export function boKhenKhongCanCu(replies: string[], bangChung: string, chiSoDo = false): string[] {
  const bc = boDau(bangChung ?? "");
  return locCauTrongBongBong(replies, (c) => {
    if (laSoDoBia(c, bangChung) && !/\?\s*$/.test(c)) return true;
    if (/\?/.test(c)) return false;
    if (laKetCauBia(c, bangChung)) return true;
    if (chiSoDo) return false;
    const kd = boDau(c);
    return KHEN_CAN_BANG_CHUNG.some(([khen, chung]) => khen.test(kd) && !chung.test(bc));
  });
}

// ── 23/09/2026 (bắn thật 5 tin bán + 2 mua, chủ dự án "sửa hết 5 lỗi đi") ─────────────────────────────
// Lỗi 4: "Hẻm 2m5 ngang 4m thì nhà mình chốn rất được khách tìm" — khen hẻm XE MÁY (TONE: hẻm 3m là hẻm xe máy,
// đừng khen). Lỗi 5: chủ nói "ô tô đậu ngay trước cửa" → bot "Hẻm 5m ô tô vào tận nhà là khách sẵn sàng cọc nhanh,
// … bán gấp hay …?" — câu có "?" nên lưới cũ (bỏ nguyên câu, chừa câu hỏi) không đụng. Ở đây soi theo MỆNH ĐỀ
// (tách dấu phẩy): mệnh đề không có "?" mà khen sai thì bỏ, phần hỏi giữ.
const KHEN_KD = /\b(?:rat|lam|chuong|duoc khach|khach (?:tim|chuong|thich|hoi|ua|san sang)|hut khach|de ban|chot nhanh|coc nhanh|ly tuong|tuyet|dep)\b/;
function hemNhoTrong(kd: string): boolean {
  if (/\b(?:hem xe may|hxm)\b/.test(kd)) return true;
  const m = /\bhem\s*(?:rong\s*)?(\d+(?:[.,]\d+)?)\s*m(?:et)?\s*(\d)?(?!\d)/.exec(kd);
  if (!m) return false;
  const rong = Number(m[1].replace(",", ".")) + (m[2] ? Number(m[2]) / 10 : 0);
  // Chủ dự án 25/09/2026 (FR-227 b): từ 3m là hẻm xe hơi, khớp ngưỡng `boc_thong_so` / `listing_facts_sync_cols`.
  return rong > 0 && rong < 3;
}
const VAO_NHA_KD = /\b(?:vao tan nha|vao toi nha|vao nha|vao tan cua|vao trong nha|dau trong nha|de xe (?:hoi )?trong nha)\b/;
const VAO_NHA_CHUNG = /\b(?:vao (?:tan |toi |duoc |trong )?nha|trong nha|gara|ga ra|garage|dau trong nha)\b/;
/** Mệnh đề khen không có căn cứ (lời MODEL, không phải bảng đọc từ DB). */
export function laKhenSai(menhDe: string, bangChung: string, chiSoDo = false): boolean {
  if (laSoDoBia(menhDe, bangChung)) return true;
  if (/\?/.test(menhDe)) return false;
  if (laKetCauBia(menhDe, bangChung)) return true;
  if (chiSoDo) return false;
  const kd = boDau(menhDe);
  const bc = boDau(bangChung ?? "");
  if (VAO_NHA_KD.test(kd) && !VAO_NHA_CHUNG.test(bc)) return true;
  if (KHEN_KD.test(kd) && (hemNhoTrong(kd) || (/\bhem\b/.test(kd) && hemNhoTrong(bc) && !/\b(?:mat tien|xe hoi|o to|oto)\b/.test(bc)))) return true;
  return KHEN_CAN_BANG_CHUNG.some(([khen, chung]) => khen.test(kd) && !chung.test(bc));
}
/** `chiSoDo`: xem `boKhenKhongCanCu` (SRS-5.1zzzzp). */
export function boMenhDeKhenSai(replies: string[], bangChung: string, chiSoDo = false): string[] {
  const ra: string[] = [];
  for (const r of replies) {
    const dong = r.split("\n").map((d) => tachCau(d).map((c) => {
      const cacMd = c.split(/,\s+/);
      if (cacMd.length === 1) return laKhenSai(c, bangChung, chiSoDo) ? "" : c;
      const giu = cacMd.filter((md) => !laKhenSai(md, bangChung, chiSoDo));
      if (giu.length === cacMd.length) return c;
      const gop = giu.join(", ").trim();
      // Bắn thật lx-24: vế chính bị cắt, còn trơ "Khách chuộng lắm." — mẩu khen không chủ ngữ thì bỏ luôn.
      if (/^(?:khach|nguoi mua)(?:\s+\S+){0,4}$/.test(boDau(gop).replace(/[\s.!…=:;()^]+$/, "").trim()) && KHEN_KD.test(boDau(gop))) return "";
      if (!gop) return "";
      // 30/09/2026 (bắn thử bán lx-ban-292a): "Cảm ơn mình đã chia sẻ, hẻm 5m … khách thích lắm." cắt vế sau còn "Cảm ơn mình đã
      // chia sẻ" không dấu, dính vào câu kế ("… chia sẻ Mình muốn bán gấp…"). Giữ dấu kết của câu gốc.
      const ketGoc = /[.!?…]+[\s)=:;^D]*$/u.exec(c)?.[0]?.trim().replace(/[^.!?…]/gu, "") || ".";
      const coKet = /[.!?…]\s*$/u.test(gop) ? gop : gop.replace(/[\s,;:]+$/u, "") + ketGoc;
      return coKet.charAt(0).toUpperCase() + coKet.slice(1);
    }).filter(Boolean).join(" ").trim()).filter(Boolean).join("\n").trim();
    if (dong) ra.push(dong);
  }
  // 25/09/2026 (bắn lại lx-26 sau #305): lượt đầu model chỉ viết MỘT câu khen ("Hẻm 3m ô tô vào được là khách chuộng
  // lắm ạ." khi khách nói hxm) — lọc sạch mà trả lại bản gốc là để lọt đúng câu sai. Nơi gọi đã có câu dự phòng khi rỗng.
  return ra;
}

// Lỗi 3: bot viết "#BDS-NP-Q5-0004 · Hùng Vương …" cho khách MUA — FR-178 (a) cấm đọc mã tin cho khách, mua lẫn
// bán. Mã theo sau là dấu "·"/":"/"-" (liệt kê) thì bỏ mã + dấu; mã đứng trong câu thì thay bằng tên đường của
// căn (kho), không có thì bỏ. Mã vẫn được đọc TRƯỚC khi lọc để ghi quan tâm / hẹn / gửi ảnh (FR-32).
const MA_TIN_KHACH_RE = /(?:#\s?)?\bBDS-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3,5}\b(\s*[·:\-–]\s*)?/gi;
export function boMaTinKhach(replies: string[], nhanCan: Record<string, string>): string[] {
  return replies.map((r) => {
    if (/^\s*(?:🤖|💾|📝|📋)/u.test(r)) return r;
    return r.replace(MA_TIN_KHACH_RE, (m: string, sep: string | undefined) => {
      if (sep) return "";
      const ma = m.replace(/^#\s?/, "").replace(/[\s·:\-–]+$/, "").trim().toUpperCase();
      return nhanCan[ma] ?? "";
    })
      .replace(/\bcăn\s+căn\b/gi, "căn").replace(/[ \t]{2,}/g, " ").replace(/\s+([,.?!])/g, "$1").trim();
  }).filter(Boolean);
}

/**
 * Bỏ câu MÂU THUẪN với căn đang nói (22/09/2026, bộ đo giọng M06): kho ghi "hẻm 6m" mà bot
 * nói với khách mua "mặt tiền kinh doanh". Chỉ soi hai cặp đối nhau rõ ràng: mặt tiền ↔ hẻm,
 * sổ riêng ↔ sổ chung. Câu hỏi giữ nguyên. Không có dữ liệu bên nào thì không đụng.
 */
export type CanDoiChieu = { access_type?: string | null; alley_width_m?: number | null; legal_status?: string | null; location_raw?: string | null; description?: string | null };
export function boMauThuanCan(replies: string[], can: CanDoiChieu | null | undefined): string[] {
  if (!can) return replies;
  const mo = boDau(`${can.location_raw ?? ""} ${can.description ?? ""}`);
  const laHem = can.access_type != null ? /^hem/.test(can.access_type) : (can.alley_width_m != null || /\bhem\b/.test(mo)) && !/\bmat tien\b/.test(mo);
  const laMatTien = can.access_type != null ? can.access_type === "mat_tien" : /\bmat tien\b/.test(mo) && !/\bhem\b/.test(mo);
  const soRieng = can.legal_status === "so_hong_rieng";
  const soChung = can.legal_status === "so_hong_chung";
  return locCauTrongBongBong(replies, (c) => {
    if (/\?/.test(c)) return false;
    const kd = boDau(c);
    return (laHem && /\bmat tien\b/.test(kd) && !/\bhem\b/.test(kd)) ||
      (laMatTien && /\bhem\b/.test(kd) && !/\bmat tien\b/.test(kd)) ||
      (soRieng && /\bso (?:hong )?chung\b/.test(kd)) ||
      (soChung && /\bso (?:hong )?rieng\b|\bshr\b/.test(kd));
  });
}

/**
 * Gọt TÊN RIÊNG BỊA sau loại tiện ích (22/09/2026, bắn thật sau deploy #181): kho nói "gần chợ Hoà Bình",
 * khách hỏi "gần chợ không", model đáp "gần chợ Hàng Thịt" — tên do model điền vào chỗ trống. Tên viết hoa
 * đứng sau chợ / trường / bệnh viện / công viên / siêu thị / chùa / nhà thờ / bến xe mà không nằm trong
 * `nguCanh` (kho + căn khách nhắc + dự án + lịch sử, đã bỏ dấu) thì bỏ tên, giữ loại: "gần chợ lắm".
 * Tên có trong ngữ cảnh giữ nguyên. Không bỏ gì thì trả đúng mảng cũ.
 */
// 22/09/2026 (FR-114 e): thêm dự án / chung cư / cao ốc — bot kể dự án theo quận từ kho, tên ngoài kho là bịa.
const LOAI_TIEN_ICH = "chợ|trường|bệnh viện|công viên|siêu thị|chùa|nhà thờ|bến xe|trung tâm thương mại|dự án|chung cư|cao ốc|khu dân cư";
export function boTenRiengBia(replies: string[], nguCanh: string): string[] {
  const nc = boDau(nguCanh ?? "").replace(/\s+/g, " ");
  // \p{Lu} chứ không phải [A-ZÀ-Ỹ]: dải À-Ỹ lẫn cả chữ THƯỜNG có dấu (đ, ú…), làm "chợ An Đông đúng" nuốt "đúng".
  // Tên = chữ hoa mở đầu, tới 3 từ nối tiếp (chữ hoa hoặc SỐ: "Sunrise Quận 5", "Tháng 2"); không nuốt dấu cách cuối.
  // 01/10/2026 (bắn thử mua lx-mua-293e): "quanh khu Chợ Lớn Quận 10" — model viết hoa chữ "Chợ", luật cũ chỉ bắt "chợ" thường.
  const loaiHoa = LOAI_TIEN_ICH.split("|").map((a) => `[${a[0]}${a[0].toLocaleUpperCase("vi")}]${a.slice(1)}`).join("|");
  const re = new RegExp(`(?<![\\p{L}])(${loaiHoa})\\s+(\\p{Lu}[\\p{L}\\d]*(?:[\\s.-](?:\\p{Lu}[\\p{L}\\d]*|\\d+)){0,3})`, "gu");
  let daBo = false;
  const ra = replies.map((r) => r.replace(re, (m, loai: string, ten: string) => {
    const t = ten.trim().replace(/[.\-]+$/, "");
    if (!t) return m;
    if (nc.includes(boDau(t).replace(/\s+/g, " "))) return m;
    daBo = true;
    return loai;
  }).replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?])/g, "$1")
    // "từ chợ, chợ và quanh khu chợ" sau khi gọt — cụm loại lặp liền nhau còn một.
    .replace(new RegExp(`(?<![\\p{L}])(${loaiHoa})(?:,?\\s+(?:và\\s+)?(?:quanh\\s+)?(?:khu\\s+)?(?:${loaiHoa})(?![\\p{L}]))+`, "giu"), "$1"));
  return daBo ? ra : replies;
}

// ── 23/09/2026 (bắn 26 tin kịch bản bán/mua, căn Trần Bình Trọng) ──────────────────────────────
/**
 * Dữ kiện BỊA về căn: khách hỏi "nhà hướng gì, có dính quy hoạch không" → model "Dạ căn này hướng Đông, thoáng
 * và sáng lắm ạ. Chưa có quy hoạch gì…" trong khi kho KHÔNG có hai dữ kiện đó. Câu KHẲNG ĐỊNH hướng / quy hoạch /
 * lộ giới / năm xây mà `nguCanh` (kho + căn khách nhắc + dự án — dữ liệu, KHÔNG gồm câu bot cũ) không chứa thì
 * bỏ. Trả nhãn các mục đã bỏ để tầng trên nói thật và mở việc hỏi chủ. Câu hỏi ("?") giữ nguyên.
 */
export function chanBiaDuKien(replies: string[], nguCanh: string): { replies: string[]; bo: string[] } {
  const nc = boDau(nguCanh ?? "").replace(/\s+/g, " ");
  const bo = new Set<string>();
  const coQuyHoach = /\b(?:quy hoach|lo gioi)\b/.test(nc);
  const ra = locCauTrongBongBong(replies, (c) => {
    if (/\?/.test(c)) return false;
    const kd = boDau(c);
    const h = /\bhuong\s+(dong|tay|nam|bac)\b/.exec(kd);
    if (h && !new RegExp(`\\bhuong\\W{0,3}(?:\\w+\\W{0,3})?${h[1]}\\b`).test(nc)) { bo.add("hướng nhà"); return true; }
    if (!coQuyHoach && (
      /\b(?:khong|chua|ko|chang)\s+(?:co\s+|bi\s+|dinh\s+|vuong\s+|nam trong\s+)*(?:quy hoach|lo gioi)\b/.test(kd) ||
      /\b(?:dinh|bi|vuong|nam trong)\s+(?:quy hoach|lo gioi)\b/.test(kd) ||
      /\bquy hoach\s+(?:sach|ro rang|on|chuan|khong)\b/.test(kd)
    )) { bo.add("quy hoạch"); return true; }
    const nx = /\bxay\s+(?:tu\s+)?(?:nam\s+)?(\d{4})\b/.exec(kd);
    if (nx && !nc.includes(nx[1])) { bo.add("năm xây"); return true; }
    return false;
  });
  return { replies: bo.size ? ra : replies, bo: [...bo] };
}

/** Câu hứa gửi hình ngay ("Em gửi hình liền đây", "gửi ảnh anh xem nè"). */
// Kèm lời MỜI xem hình ("Anh xem hình trước nhé?") — căn 0 ảnh thì mời cũng là hứa suông (bắn lại sau #193).
const HUA_GUI_HINH_RE = /\b(?:(?:em|chau|de em|de chau)\s+(?:se\s+)?gui\s+(?:ngay\s+|lien\s+|luon\s+)?(?:hinh|anh)|gui\s+(?:hinh|anh)\s+(?:lien|ngay|luon|ne|nha|lien day|ngay day)|(?:xem|coi)\s+(?:hinh|anh)\s+(?:truoc|khong|ko|nhe|nha|ne|luon|thu)\b[^.!]*\?|(?:muon|co muon)\s+(?:xem|coi)\s+(?:hinh|anh)\b[^.!]*\?)/;
export function laHuaGuiHinh(cau: string): boolean {
  return HUA_GUI_HINH_RE.test(boDau(cau));
}
/**
 * Căn chưa có tấm hình nào mà bot hứa "em gửi hình liền đây" (bắn thật 23/09: tin 0 ảnh, hai khách nghe hứa).
 * Câu hứa thay bằng `loiThat` (một lần); không câu nào hứa thì trả đúng mảng cũ.
 */
export function chanHuaGuiHinh(replies: string[], loiThat: string | null): string[] {
  const ra = locCauTrongBongBong(replies, (c) => laHuaGuiHinh(c));
  if (ra === replies) return replies;
  // 30/09/2026 (bắn thử mua lx-mua-d291): khách KHÔNG xin hình ("căn nào rẻ nhất") mà model tự hứa gửi → chỉ bỏ câu hứa;
  // chèn "chủ nhà chưa gửi hình" vào đó là trả lời một câu khách không hỏi.
  if (loiThat == null) return ra;
  // Lời thật đứng ở chỗ bong bóng đầu tiên có câu hứa.
  const i = replies.findIndex((r) => tachCau(r).some((c) => laHuaGuiHinh(c)));
  const out = [...ra];
  out.splice(Math.min(Math.max(i, 0), out.length), 0, loiThat);
  return out;
}

/**
 * 30/09/2026 (bắn thử mua lx-mua-d291): "vậy 7 tỷ cũng được em" → model "Dạ vậy em sẽ lọc thêm mấy căn nữa cho mình ạ,
 * chờ em một tí." ngay trước bong bóng danh sách căn code vừa chèn — hứa một việc đã làm xong. Chỉ gọi khi lượt này
 * CÓ đưa căn; câu chỉ hỏi ("mình muốn em lọc thêm không?") giữ.
 */
const HUA_LOC_RE = /\b(?:(?:de\s+)?em\s+(?:se\s+|dang\s+)?(?:loc|tim|kiem|ra soat|check)\s+(?:them|lai|ngay|lien|thu)\b|(?:cho|doi)\s+em\s+(?:mot\s+)?(?:ti|chut|xiu|lat|giay)\b)/;
export function boCauHuaLoc(replies: string[]): string[] {
  return locCauTrongBongBong(replies, (c) => !/\?\s*$/.test(c.trim()) && HUA_LOC_RE.test(boDau(c)));
}

/**
 * 01/10/2026 (bắn thử bán lx-ban-293c): hỏi "có vướng cột điện hay hố ga không", chủ nói chuyện khác → model "Để em kiểm tra xem
 * cột điện hay hố ga có chạy qua lô không nha?" — bot không có cách nào kiểm; người nói chuyện là chủ nhà. Câu bot tự hứa kiểm /
 * xác minh bị bỏ; câu bị bỏ là câu hỏi duy nhất thì hỏi lại bằng `thay` (câu mẫu của ô kế).
 */
// SRS-5.1zzzzr: thêm "tra (giúp / cứu)", "gọi điện", "đi / qua / ghé xem" — việc bot không tự làm được (prompt TONE_RULES nói cùng
// một danh sách). "em trả lời" (tra loi) và "em gọi anh là" không phải lời hứa.
const HUA_TU_KIEM_RE = /\b(?:de\s+)?em\s+(?:se\s+|di\s+)?(?:kiem tra|check|xac minh|kiem chung|tim hieu|ra soat|coi lai|xem lai giup|tra(?!\s+loi)(?:\s+(?:giup|cuu|thu))?|goi dien|di xem|qua xem|ghe xem)\b/;
export function boHuaTuKiemTra(reply: string, thay: string | null): string {
  const cac = tachCau(reply);
  const giu = cac.filter((c) => !HUA_TU_KIEM_RE.test(boDau(c)));
  if (giu.length === cac.length) return reply;
  const ra = giu.join(" ").trim();
  return thay && !/\?/.test(ra) ? `${ra} ${thay}`.trim() : ra;
}

/** Câu hứa đi HỎI CHỦ NHÀ/** Câu hứa đi HỎI CHỦ NHÀ ("để em hỏi lại chủ nhà rồi báo", "em xác nhận lại với chủ"). */
export function laHuaHoiChu(replies: string[]): boolean {
  return /\b(?:hoi|xac nhan|check|kiem tra)\s+(?:lai\s+)?(?:voi\s+|ben\s+|y\s+)?chu(?:\s+nha)?\b/.test(boDau(replies.join(" ")));
}

/**
 * Bot tự xưng bằng từ gọi KHÁCH (bắn thật 23/09): khách là chú, model đáp "Dạ, chú ghi nhớ rồi ạ" — đúng ra
 * "cháu ghi nhớ". Chỉ sửa khi chú/cô/bác đứng ngay trước động từ tự thuật của bot (ghi nhớ, ghi nhận, lưu, tìm,
 * báo, gửi…) ở đầu câu hoặc sau "Dạ,"/"để". "chú xem nhà" (khách làm) không đụng: "xem" không nằm trong danh sách.
 */
export function suaBotXungNhamKhach(replies: string[], goi: string | null | undefined): string[] {
  if (!goi || !LON_TUOI.has(goi)) return replies;
  const re = new RegExp(
    `(^|[.!?]\\s+|Dạ,?\\s+|[Đđ]ể\\s+)(${goi}|${goi.charAt(0).toUpperCase()}${goi.slice(1)})\\s+(ghi nhớ|ghi nhận|ghi lại|lưu lại|đã lưu|sẽ tìm|tìm kiếm|tìm|lọc|báo lại|báo|gửi|kiểm tra)(?![\\p{L}])`,
    "gu",
  );
  let doi = false;
  const ra = replies.map((r) => r.replace(re, (_m, dau: string, _x: string, dong: string) => {
    doi = true;
    return `${dau}${dau === "" || /[.!?]\s+$/.test(dau) ? "Cháu" : "cháu"} ${dong}`;
  }));
  return doi ? ra : replies;
}

/**
 * Lời khen NGƯỢC NGHĨA (bắn thật 23/09, nhánh bán): "Căn góc view thoáng khó bán lắm cô" — ý là hiếm, dễ bán.
 * "khó bán lắm" đứng sau một ưu điểm trong cùng câu (không phải câu hỏi) → "khó kiếm lắm".
 */
export function suaKhenNguocNghia(replies: string[]): string[] {
  const re = /((?:góc|view|thoáng|đẹp|rộng|mới|sáng|yên tĩnh|hẻm xe hơi|mặt tiền)[^.!?]{0,40}?)khó bán lắm/giu;
  let doi = false;
  const ra = replies.map((r) => r.replace(re, (_m, truoc: string) => { doi = true; return `${truoc}khó kiếm lắm`; }));
  return doi ? ra : replies;
}

/**
 * Bot đoán PHƯỜNG của một địa danh (bắn thật 23/09): "Dạ chú, chợ An Đông là khu P12 Quận 5 phải không ạ?" —
 * không ai nói P12, dữ liệu không có. Câu gắn địa danh với một số phường mà ngữ cảnh không chứa số phường đó
 * thì bỏ. Trả nhãn địa danh đã bỏ (để tầng trên nói câu ghi nhận thay).
 */
export function boDoanPhuongDiaDanh(replies: string[], nguCanh: string): { replies: string[]; bo: string | null } {
  const nc = boDau(nguCanh ?? "");
  let bo: string | null = null;
  const ra = locCauTrongBongBong(replies, (c) => {
    const kd = boDau(c);
    const m = /\b(cho|truong|benh vien|cong vien|sieu thi|chua|nha tho|ben xe)\s+([a-z]+(?:\s+[a-z]+){0,3}?)\s+(?:la|o|thuoc|nam o|nam)\s+(?:khu\s+|khu vuc\s+)?(?:p\.?\s*|phuong\s+)(\d{1,2})\b/.exec(kd);
    if (!m) return false;
    if (new RegExp(`\\b(?:p\\.?\\s*|phuong\\s+)0?${Number(m[3])}\\b`).test(nc)) return false;
    bo = `${m[1]} ${m[2]}`;
    return true;
  });
  return bo ? { replies: ra, bo } : { replies, bo: null };
}

/**
 * Câu hỏi VỌNG LẠI câu khách (bắn thật 23/09): khách "mai 9h sáng em qua xem được không" → bot hỏi ngược "Mai 9h
 * sáng có được không?". Câu hỏi ≥ 4 từ mà ≥ 80% từ đã có trong câu khách thì bỏ — chỉ khi còn câu khác để gửi.
 */
export function boCauVongLai(replies: string[], text: string): string[] {
  const tuKhach = new Set(boDau(text).split(/[^a-z0-9]+/).filter(Boolean));
  const ra = locCauTrongBongBong(replies, (c) => {
    if (!/\?\s*$/.test(c.trim())) return false;
    const tu = boDau(c).split(/[^a-z0-9]+/).filter(Boolean).filter((w) => !["da", "a", "nha", "nhe", "vay"].includes(w));
    if (tu.length < 4) return false;
    return tu.filter((w) => tuKhach.has(w)).length / tu.length >= 0.8;
  });
  return ra.length ? ra : replies;
}

/**
 * Căn BỊA khi kho trống (bắn lại 23/09 sau deploy #193): kho lọc theo "gần chợ An Đông" ra rỗng, model vẫn tả
 * "căn này hẻm xe hơi 4m P12, 50m2, 7,9 tỷ — gần chợ chỉ khoảng 600m". Tầng trên chỉ gọi khi KHÔNG có căn nào
 * trong tay model. Câu tả một căn cụ thể = có số tiền cụ thể (7,9 tỷ / 8 tỷ 2) hoặc diện tích (50m2) + chữ căn/nhà/
 * hẻm/phường, và KHÔNG phải câu nhắc tiêu chí khách ("tầm/khoảng/dưới/lọc/tìm"). Bỏ CẢ BONG BÓNG chứa câu đó
 * (câu hỏi "Chú có quan tâm không ạ?" đi kèm cũng thành vô nghĩa).
 */
export function boCanBia(replies: string[], giuCau: string[] = []): string[] {
  const laGiu = laCauGiu(giuCau);
  const laCanBia = (c: string): boolean => {
    // SRS-5.1zzzzzq: diện tích / giá của một loại căn trong DỰ ÁN có căn cứ ở khối dự án — không phải căn bịa.
    if (laGiu(c)) return false;
    // Câu nêu MÃ TIN thật ("#BDS-Q5-0006") là căn lấy từ lượt trước (căn tương tự, căn đã gợi) — không phải bịa.
    if (/#?\b[A-Z]{2,5}(?:-[A-Z0-9]{1,15}){1,4}\b/.test(c)) return false;
    const kd = boDau(c);
    // Câu nhắc TIÊU CHÍ khách: "tầm/khoảng/dưới/trên" đứng NGAY trước số tiền, hoặc lời lọc/tìm/chưa có.
    if (/\b(?:tam|khoang|duoi|tren|tu)\s+\d+(?:[.,]\d+)?\s*(?:ty|ti|trieu)\b|\b(?:do lai|loc|tim|nhu cau|tieu chi|chua co)\b/.test(kd)) return false;
    const coGia = /\b\d+(?:[.,]\d+)?\s*(?:ty|ti)(?:\s*\d{1,3})?\b/.test(kd);
    const coDt = /\b\d{2,4}(?:[.,]\d+)?\s*m2\b/.test(kd);
    return (coGia || coDt) && /\b(?:can|nha|hem|p\s*\d{1,2}|phuong)\b/.test(kd);
  };
  const ra = replies.filter((r) => !tachCau(r).some(laCanBia));
  return ra.length === replies.length ? replies : ra;
}

/**
 * FR-214 (e), 23/09/2026 (Zalo chủ dự án): "15 tỉ nhé cháu còn nhà ở quận 11 cũ muốn 7 tỉ" → model đáp "Dạ cháu
 * ghi 15 tỷ căn Long An, 7 tỷ căn Quận 11 rồi cô" trong khi con số 7 tỷ không được ghi vào đâu. Câu NÓI ĐÃ GHI
 * (ghi / lưu / cập nhật / sửa) kèm số tiền mà số đó không khớp (±1%) giá nào trong `tienCo` (giá các tin của
 * người này, đọc lại DB sau khi ghi) thì bỏ. Dòng 🤖/📝/📋 (tiền định) không đụng. Không bỏ gì → mảng cũ.
 */
export function boCauGhiTienKhongCo(replies: string[], tienCo: number[], docTienFn: (s: string) => number | null): string[] {
  const TIEN_RE = /\d+(?:[.,]\d+)?\s*(?:tỷ|tỉ|ty|ti|tỏi|triệu|trieu|tr)(?![\p{L}])(?:\s*\d{1,3}(?![\d.,]|\s*m))?/giu;
  const ra = locCauTrongBongBong(replies, (c) => {
    if (/^[🤖📝📋💾]/u.test(c.trim())) return false;
    if (!/\b(?:ghi|luu|cap nhat|sua)\b/.test(boDau(c))) return false;
    const so = [...c.matchAll(TIEN_RE)].map((m) => docTienFn(m[0])).filter((v): v is number => v != null && v > 0);
    return so.length > 0 && so.some((v) => !tienCo.some((t) => Math.abs(t - v) <= t * 0.01));
  });
  return ra;
}

/**
 * 24/09/2026 (chủ dự án: "cái dấu này — sửa thành cái dấu khác cho giống người"): gạch dài "—" / "–" là chữ máy, người
 * nhắn Zalo không gõ. Giữa hai số ("5–6 tỷ") → "-"; đầu dòng → "- "; giữa câu → ", ". Áp cho MỌI bong bóng gửi đi.
 */
export function boGachDai(s: string): string {
  return s.replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/^[ \t]*[—–][ \t]*/gm, "- ")
    .replace(/[ \t]*[—–][ \t]*/g, ", ")
    .replace(/,[ \t]*,/g, ",").replace(/,[ \t]*([.!?])/g, "$1");
}

/** Có số m² trong câu ("137m2", "80 m²", "60 mét vuông"). */
export const M2_TRONG_CAU = /\d+(?:[.,]\d+)?\s*(?:m2|m²|mét vuông|met vuong)(?![\p{L}\d])/iu;
/**
 * 24/09/2026 (bắn lại người bán Gò Vấp): model viết "137m2 trên sổ, khuôn đất này dễ xây lắm" khi khách chỉ nhắn số
 * nhà "137/28" — DB không có 137 m². Bỏ CÂU (không phải cả bong bóng) nói số m² không khớp diện tích tin nào của người
 * này (±1%, tối thiểu 0,5) và cũng không có trong chữ khách vừa gõ ("sàn 200m2" khách tự nói thì giữ).
 */
export function boCauM2KhongCo(replies: string[], dienTichCo: number[], khachGo: string): string[] {
  const re = /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|mét vuông|met vuong)(?![\p{L}\d])/giu;
  const soCua = (s: string) => [...s.matchAll(re)].map((m) => Number(m[1].replace(",", ".")));
  const khach = soCua(khachGo ?? "");
  const co = [...dienTichCo.filter((x) => Number.isFinite(x) && x > 0), ...khach];
  return locCauTrongBongBong(replies, (c) => {
    if (/^[🤖📝📋💾]/u.test(c.trim())) return false;
    return soCua(c).some((v) => !co.some((t) => Math.abs(t - v) <= Math.max(0.5, t * 0.01)));
  });
}

/**
 * FR-218 b (24/09/2026, chủ dự án test vai mua): khách nói đủ quận + giá ngay tin đầu, kho đã lọc ra căn, mà model
 * vẫn hỏi dò ("ba mẹ ở cùng hay phòng riêng?", "ưu tiên hẻm xe hơi hay mặt tiền?") thay vì đưa căn — lời dặn
 * trong prompt lọt ngẫu nhiên (bắn lại đúng câu đó thì lần sau nó đưa căn). Chặn bằng code: `coNhacCan` soi xem
 * chữ có nhắc căn nào trong kho (mã hoặc tên đường) chưa; chưa thì nơi gọi thay câu hỏi dò bằng `bongBongGoiYCan`.
 */
export type CanGoiY = { code: string; ten: string; dong: string };
export function coNhacCan(chu: string[], cans: CanGoiY[]): boolean {
  const kd = boDau(chu.filter((r) => !/^\s*(?:🤖|💾|📝|📋)/u.test(r)).join("\n"));
  return cans.some((c) => kd.includes(c.code.toLowerCase()) || (c.ten.length >= 4 && kd.includes(boDau(c.ten))));
}
/** Bóng bóng đưa tối đa `n` căn, KHÔNG mã tin (FR-178 a), chỉ thông số có thật trong dòng. */
export function bongBongGoiYCan(cans: CanGoiY[], ac: string, n = 2): string {
  const ds = cans.slice(0, n).map((c) => `- ${c.dong}`).join("\n");
  return `Dạ bên em đang có ${cans.length >= 2 && n >= 2 ? "mấy căn" : "căn"} hợp với ${ac} nè:\n${ds}\n${ac[0].toUpperCase()}${ac.slice(1)} thấy căn nào hợp để em gửi thêm hình và chi tiết ạ?`;
}
/** Bỏ bong bóng CHỈ là câu hỏi dò ngắn (kết thúc "?", ≤ 25 từ); bong bóng báo lưu và câu có nội dung giữ nguyên. */
export function boCauHoiDo(replies: string[]): string[] {
  return replies.filter((r) => /^\s*(?:🤖|💾|📝|📋)/u.test(r) || !(/\?\s*$/.test(r.trim()) && r.trim().split(/\s+/).length <= 25));
}

/**
 * FR-218 c (24/09/2026, bắn thật sau #266): dòng kho đã kèm lời chủ tả + lời dặn "không ghi thì hỏi lại chủ", model
 * vẫn viết "Cả 2 căn đều có phòng ngủ ở tầng trệt cho ba mẹ" cho hai căn không hề ghi điều đó — khách hỏi đúng
 * thứ đó nên model chiều theo. Lưới bằng code cho các ĐẶC ĐIỂM khách hay đòi: câu khẳng định một đặc điểm và
 * gắn với căn (tên đường trong câu, hoặc trong cùng bong bóng) mà dữ liệu căn đó không có → thay câu bằng
 * "…em hỏi lại chủ rồi báo". Câu hỏi và câu phủ định ("không có thang máy") giữ nguyên.
 */
export type CanDuLieu = { ten: string; du_lieu: string };
const DAC_DIEM: Array<{ ten: string; re: RegExp }> = [
  { ten: "phòng ngủ ở tầng trệt", re: /\bphong ngu (?:o |tai |duoi |ngay )?(?:tang )?tret\b|\btret (?:co |la |lam )?(?:\d |mot )?phong ngu\b|\bphong (?:ngu )?(?:cho |de )?(?:ba me|ong ba|nguoi gia)[^.?!]{0,20}\btret\b/ },
  { ten: "thang máy", re: /\bthang may\b/ },
  { ten: "sân thượng", re: /\bsan thuong\b/ },
  { ten: "sân vườn / sân sau", re: /\bsan (?:vuon|sau|truoc|rong)\b|\bdat trong\b/ },
  { ten: "chỗ đậu ô tô trong nhà", re: /\b(?:gara|garage|ga ra)\b|\b(?:de|dau|cat) (?:xe hoi|o to|oto) (?:trong|vao) nha\b|\b(?:xe hoi|o to|oto) vao (?:tan |trong )?nha\b/ },
  { ten: "tầng hầm", re: /\btang ham\b|\bham de xe\b/ },
];
const PHU_DINH_DD = /\b(?:khong|ko|chua|chang|khong he)\s+(?:co\s+)?/;
export function boDacDiemKhongCo(replies: string[], cans: CanDuLieu[]): { replies: string[]; bo: string[] } {
  const bo: string[] = [];
  if (!cans.length) return { replies, bo };
  const duLieu = cans.map((c) => ({ ten: boDau(c.ten), dl: boDau(c.du_lieu) })).filter((c) => c.ten.length >= 4);
  const ra = replies.map((r) => {
    if (/^\s*(?:🤖|💾|📝|📋)/u.test(r)) return r;
    const canBong = duLieu.filter((c) => boDau(r).includes(c.ten));
    const cau = r.split(/(?<=[.!?\n])/);
    let doi = false;
    const moi = cau.map((c) => {
      const kd = boDau(c);
      if (/\?\s*$/.test(c.trim())) return c;
      const dd = DAC_DIEM.find((d) => d.re.test(kd));
      if (!dd) return c;
      const truoc = kd.slice(0, kd.search(dd.re));
      if (PHU_DINH_DD.test(truoc.slice(-25))) return c;
      const canCau = duLieu.filter((x) => kd.includes(x.ten));
      const ds = canCau.length ? canCau : canBong;
      if (!ds.length || ds.every((x) => dd.re.test(x.dl))) return c;
      doi = true;
      bo.push(dd.ten);
      return (c.match(/^\s*/)?.[0] ?? "") + `Còn ${dd.ten} thì em hỏi lại chủ từng căn rồi báo mình nha.` + (c.match(/\s*$/)?.[0] ?? "");
    });
    return doi ? moi.join("").replace(/(Còn [^.]+ thì em hỏi lại chủ từng căn rồi báo mình nha\.\s*){2,}/g, "$1").replace(/[ \t]{2,}/g, " ").trim() : r;
  });
  return { replies: ra, bo };
}

/**
 * 24/09/2026 (chủ dự án: "hoàn công xong chưa cứ hỏi lung tung vậy ko dc"): model KHÔNG tự hỏi chuyện hoàn công;
 * chỉ hỏi khi bảng rẽ nhánh (FR-223, extraction/re-nhanh.ts) chọn câu `hoan_cong` — lúc đó truyền `choPhep`.
 * Chủ nhà tự nói thì ghi nhận (bóc tách vẫn đọc), nhưng câu HỎI về hoàn công trong lời bot thì bỏ: cắt mệnh đề
 * có "hoàn công" khỏi câu hỏi ("Sổ riêng hay sổ chung, đã hoàn công chưa anh?" → "Sổ riêng hay sổ chung anh?"),
 * câu hỏi chỉ có một ý hoàn công thì bỏ cả câu. Câu khẳng định (không "?") và bong bóng code (🤖 💾 📝 📋) không đụng.
 */
const HOAN_CONG_KD = /\bhoan cong\b/;
const DUOI_GOI = /(\s+(?:(?:anh|chị|chú|cô|bác|ông|bà|em|mình|ạ|nha|nhé|nhỉ|vậy|ha)\s*)+)?([?!.…]*)\s*$/iu;
function catHoanCongTrongCau(cau: string): string | null {
  if (!/\?/.test(cau) || !HOAN_CONG_KD.test(boDau(cau))) return cau;
  const doan = cau.split(/(,\s*|\s+(?:và|với|lẫn|hay là|hoặc)\s+)/u);
  const giu: string[] = [];
  let duoi = "";
  for (let i = 0; i < doan.length; i += 2) {
    const d = doan[i];
    if (HOAN_CONG_KD.test(boDau(d))) {
      if (i === doan.length - 1) duoi = (DUOI_GOI.exec(d)?.[1] ?? "").trimEnd();
      continue;
    }
    if (giu.length) giu.push(doan[i - 1]);
    giu.push(d);
  }
  if (!giu.length) return null;
  let ra = giu.join("").replace(/[,\s]+$/u, "");
  if (!duoi && !/\?\s*$/.test(ra)) ra = ra.replace(/[.!…]+$/u, "");
  if (duoi && !new RegExp(`${duoi.trim()}\\s*$`, "iu").test(ra)) ra += duoi;
  if (!/\?\s*$/.test(ra)) ra += "?";
  // Chỉ còn mẩu từ đệm ("Dạ?") thì không còn câu hỏi nào.
  return boDau(ra).replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).length < 3 ? null : ra;
}
export function boHoiHoanCong(replies: string[], choPhep = false): string[] {
  // FR-223: hệ thống vừa chọn câu nhánh `hoan_cong` (sổ riêng, chưa nhắc hoàn công) → câu đó ĐƯỢC hỏi.
  if (choPhep) return replies;
  let doi = false;
  const ra: string[] = [];
  for (const r of replies) {
    if (/^\s*(?:🤖|💾|📝|📋)/u.test(r) || !HOAN_CONG_KD.test(boDau(r))) { ra.push(r); continue; }
    const dong = r.split("\n").map((l) => {
      const cac = tachCau(l);
      const moi = cac.map(catHoanCongTrongCau).filter((c): c is string => !!c);
      if (moi.length !== cac.length || moi.some((c, i) => c !== cac[i])) doi = true;
      return moi.join(" ").trim();
    }).filter((l) => l);
    const moi = dong.join("\n").trim();
    if (moi) ra.push(moi);
  }
  return doi ? ra : replies;
}

// ── 25/09/2026 (bắn thật lx-09, chủ dự án "xét lại các tin mày bắn xem còn lỗi gì ko") ────────────────────────
// Code chọn câu kế "gấp" và mở ô chờ `gap`, model lại hỏi "hẻm nhà mình rộng mấy mét" — câu trả lời kế rơi sai ô.
// Code chọn HỎI GÌ, model chỉ chọn CÁCH NÓI: câu hỏi của model mang chủ đề KHÁC khoá code chọn (và không mang chủ
// đề của khoá đó) thì thay câu hỏi ấy bằng câu mẫu. Khoá không có trong bảng thì không soi (không đoán).
const HEM_RE = /\b(?:hem|hxh|o to|oto|xe hoi|duong vao)\b/;
const CHU_DE_KHOA: Record<string, RegExp> = {
  do_rong_hem: HEM_RE,
  do_rong_duong: /\b(?:duong|hem|o to|oto|xe hoi|container)\b/,
  gap: /\b(?:gap|duoc gia|ra hang|can tien)\b/,
  phap_ly: /\b(?:so hong|so do|so rieng|so chung|phap ly|giay to|co so|ra so|so chua)\b/,
  ket_cau: /\b(?:tang|lau|tret|ket cau|xay)\b/,
  so_phong_ngu: /\b(?:phong ngu|pn|phong)\b/,
  huong: /\bhuong\b/,
  gia: /\b(?:gia|thu ve|bao nhieu tien|ty|trieu)\b/,
  dien_tich: /\b(?:dien tich|m2|ngang|dai|rong)\b/,
  dien_tich_dat: /\b(?:dien tich|m2|ngang|dai|rong|tho cu)\b/,
  phuong: /\b(?:phuong|xa|thi tran|quan)\b/,
  hoan_cong: /\bhoan cong\b/,
  noi_that: /\bnoi that\b/,
};
/** Câu hỏi CUỐI của `reply` (câu kết bằng "?"), hoặc null. */
/**
 * FR-241 i (10 ca test làm khó 28/09): khách đã nói "3 lầu" hai lần mà bot vẫn hỏi "Nhà mình trệt lửng mấy lầu, lầu nào mấy phòng
 * ngủ?"; khách nói "Âu Cơ" ở câu rao mà bot hỏi "nhà mình ở đường nào". Câu hỏi cuối của model hỏi một ô ĐÃ CÓ dữ liệu (khác khoá
 * code chọn) → thay bằng câu mẫu của khoá kế; không có câu kế thì bỏ câu hỏi đó.
 */
const HOI_KHOA_DA_CO: Record<string, RegExp> = {
  ket_cau: /\b(?:may|bao nhieu)\s*(?:tang|lau)\b|\btret\s*(?:lung\s*)?may\b|\bxay may\b/,
  so_phong_ngu: /\b(?:may|bao nhieu)\s*phong ngu\b/,
  vi_tri: /\b(?:duong nao|so may|so nha may|dia chi)\b/,
  gia: /\b(?:gia (?:bao nhieu|nao|mong muon)|thu ve|rao gia|ban (?:bao nhieu|gia nao|voi gia))\b/,
  dien_tich: /\b(?:dien tich|ngang dai|ngang may|dai may)\b/,
  phap_ly: /\bso (?:hong )?(?:rieng|chung) hay\b|\bso rieng hay\b/,
};
export function boHoiLaiDaCo(reply: string, daCo: ReadonlySet<string>, nextKey?: string | null, cauKe?: string | null): string {
  const q = cauHoiCuoi(reply);
  if (!q) return reply;
  const kd = boDau(q);
  if (![...daCo].some((k) => k !== nextKey && HOI_KHOA_DA_CO[k]?.test(kd))) return reply;
  const truoc = reply.slice(0, reply.lastIndexOf(q)).trim();
  if (cauKe) return `${truoc} ${cauKe}`.trim();
  return truoc || reply;
}

function cauHoiCuoi(reply: string): string | null {
  const ds = reply.match(/[^.!?\n]*\?/gu);
  return ds?.length ? ds[ds.length - 1] : null;
}
/** Câu hỏi của model lệch khoá code chọn? true chỉ khi câu hỏi KHÔNG mang chủ đề của khoá mà mang chủ đề khoá khác. */
export function laHoiLechKhoa(reply: string, khoa: string | null | undefined): boolean {
  const cua = khoa ? CHU_DE_KHOA[khoa] : undefined;
  const cau = cauHoiCuoi(reply ?? "");
  if (!cua || !cau) return false;
  const kd = boDau(cau);
  if (cua.test(kd)) return false;
  return Object.entries(CHU_DE_KHOA).some(([k, re]) => k !== khoa && re.test(kd));
}
/** Thay câu hỏi cuối (lệch khoá) bằng `cauMau`, giữ phần ghi nhận phía trước. */
export function thayCauHoiLech(reply: string, khoa: string | null | undefined, cauMau: string): string {
  if (!cauMau || !laHoiLechKhoa(reply, khoa)) return reply;
  const cau = cauHoiCuoi(reply)!;
  const i = reply.lastIndexOf(cau);
  return `${reply.slice(0, i).trim()} ${cauMau}`.trim();
}

// Cùng lượt bắn (lx-08): tin mới tạo, CHƯA lên kệ (chờ đủ thông tin + chủ duyệt bản nháp) mà model viết "đã đăng lên
// web AI Ơi Nhà Đất rồi". Tin chưa đăng thì bỏ mệnh đề khẳng định đã đăng; câu hỏi và câu phủ định ("chưa đăng") giữ.
// FR-239 a (phát lại test 27/09): "Em đã lên tin rồi ạ" / "em đang rao tích cực" khi tin còn chờ thông tin.
// FR-240 d (phát lại test 28/09 trên production): "Em đang rao tin cho anh rồi ạ" — "đang rao" nào cũng sai khi tin chưa lên.
// Lời hứa ("em sẽ rao tích cực") giữ.
// FR-240 e (phát lại lần ba, v264): "Em cảm ơn anh, đã ghi đủ thông tin rồi ạ." khi tin mới có tên đường — tin chưa lên là
// còn thiếu, "đủ thông tin" là nói sai. "Dạ em ghi đủ rồi ạ" (đủ những gì khách vừa nói — ví dụ mẫu FR-178) giữ.
// 30/09/2026 (chủ dự án chat thử): lượt đầu "em cần bán nhà" → "mình đã tạo tin rồi" khi chưa có gì — cùng loại hứa.
const DA_DANG_RE = /\b(?:da|vua)\s+tao\s+(?:tin|bai)\b|\btao\s+tin\s+(?:roi|xong)\b|\b(?:ghi|co|nhan|lay)\s+(?:du|day du)\s+thong\s+tin\b|\b(?:da|vua|em da|em vua)\s+(?:dang|up|dua)\b|\b(?:da|vua)\s+len\s+(?:web|trang|ke|tin)\b|\blen\s+(?:web|trang|ke|tin)\s+(?:roi|luon|ngay)\b|\bdang\s+rao\b|\btin\s+(?:minh\s+|nha\s+minh\s+|cua\s+\w+\s+)?(?:da|vua)\s+(?:len|dang|duoc dang)\b|\btin\s+(?:minh\s+)?len\s+roi\b|\b(?:da|vua)\s+(?:duoc\s+)?(?:kiem\s+)?duyet\b|\b(?:da|vua)\s+len\s+san\b|\blen\s+san\s+(?:roi|luon|ngay)\b|\btin\s+(?:\w+\s+){0,2}len\s+san\b|(?<!\b(?:la|thi|xong|de|roi|khi|sau do)\s)\bem\s+(?:se\s+)?(?:dang|up|dua len|len tin|len ke)\s+(?:tin\s+)?(?:lien|ngay|luon)\b/;
// 03/10/2026 (bắn thử thu-mc-06, SRS-5.1zn): "…khách hỏi nhiều lắm, em đăng liền nha :)" khi tin còn thiếu thông tin — HỨA đăng
// ngay cũng sai như nói "đã đăng". Câu có điều kiện ("nhắn em mấy thông tin đó LÀ em đăng liền") vẫn giữ.
// 03/10/2026 (bắn thử thu-dc-09, SRS-5.1zj): "Chào mình! Tin đã lên rồi nha." khi tin còn chờ thông tin — chủ ngữ "tin" ĐỨNG
// TRƯỚC ("tin đã lên", "tin vừa đăng") lọt luật cũ (chỉ bắt "đã lên web / kệ / tin").
// SRS-5.1zzzzu (bắn production 10/10, thu-cmp45-3): chủ nhà hỏi "sao chị biết em không lừa" → model "tin chị lên sàn em đã được kiểm
// duyệt kỹ lắm" khi tin chưa lên kệ — "lên sàn", "đã (được) duyệt" là cùng một khẳng định trạng thái, chủ cũ không có chữ đó.
/**
 * Một vế có KHẲNG ĐỊNH trạng thái tin không: khớp mẫu, không phải câu hỏi, không phủ định, và không phải lời hứa CÓ ĐIỀU KIỆN ("đủ thông
 * tin LÀ EM SẼ đăng lên web ngay" — SRS-5.1zzzzk: trước đây vế này khớp "lên web ngay" và chỉ thoát nhờ `boHuaDaDang` trả lại lời gốc).
 */
const laMenhDeDaDang = (md: string): boolean => {
  const kd = boDau(md);
  return !/\?/.test(md) && DA_DANG_RE.test(kd) && !/\b(?:chua|khong)\b/.test(kd) &&
    !/\b(?:la|thi|xong|khi|neu|de|sau do)\s+(?:em|minh|ben em)\s+(?:se\s+)?(?:dang|up|dua|len)\b/.test(kd) &&
    // "giá mình đang rao là 15 tỷ" — "giá rao" là GIÁ CHÀO, không phải trạng thái tin.
    !/\bgia\b[^.!?]{0,20}\bdang rao\b/.test(kd);
};
/** Các vế của một bong bóng — ngắt câu như `tachCau`, thêm mặt cười / emoji (Zalo) và dấu phẩy. Dùng chung cho dò và bỏ. */
const veDaDang = (dong: string): string[] => tachCau(dong).flatMap((c) => c.split(/(?<=:\)|:D|=\)|\p{Extended_Pictographic})\s+/u)).flatMap((c) => c.split(/,\s+/));
/** Lời có mệnh đề KHẲNG ĐỊNH trạng thái tin (đã đăng / đang rao / lên kệ…) — để nơi gọi quyết có cần đối chiếu DB không. */
export function coMenhDeDaDang(replies: string[]): boolean {
  return replies.some((r) => !/^\s*(?:🤖|💾|📝|📋)/u.test(r) && r.split("\n").some((d) => veDaDang(d).some(laMenhDeDaDang)));
}
export function boHuaDaDang(replies: string[]): string[] {
  const ra: string[] = [];
  for (const r of replies) {
    if (/^\s*(?:🤖|💾|📝|📋)/u.test(r)) { ra.push(r); continue; }
    // ":)" / emoji cũng là chỗ ngắt câu trong tin Zalo ("… rồi :) Em tra thấy …").
    const dong = r.split("\n").map((d) => tachCau(d).flatMap((c) => c.split(/(?<=:\)|:D|=\)|\p{Extended_Pictographic})\s+/u)).map((c) => {
      // 06/10/2026 (SRS-5.1zzo): vế phủ định ("không thấy tin nào đang rao") là lời thật, giữ như vế "chưa".
      const laSai = laMenhDeDaDang;
      const cacMd = c.split(/,\s+/);
      const giu = cacMd.filter((md) => !laSai(md));
      if (giu.length === cacMd.length) return c;
      // Vế cuối (mang dấu chấm) bị bỏ thì vế còn lại tự đóng câu — "Em cảm ơn anh, đã ghi đủ…" → "Em cảm ơn anh."
      const gop = giu.join(", ").trim().replace(/(?<![.!?…)])$/u, giu.length && !laSai(cacMd[cacMd.length - 1]) ? "" : ".");
      return gop && gop !== "." ? gop.charAt(0).toUpperCase() + gop.slice(1) : "";
    }).filter(Boolean).join(" ").trim()).filter(Boolean).join("\n").trim();
    if (dong) ra.push(dong);
  }
  // SRS-5.1zzzzk (bắn production 09/10: r1 "Em vừa đăng tin rồi ạ." với tin còn cho_thong_tin): bản cũ trả LẠI lời gốc khi bỏ hết
  // chữ (để không gửi bong bóng rỗng) — tức là trả lại đúng câu sai. Bỏ hết thì trả mảng rỗng; nơi gọi tự có câu thay.
  return ra;
}

// 27/09/2026 (chủ dự án test Zalo): "Chào em" → bot chào + hỏi vai → "Anh bán" → model "Dạ em chào anh! Anh muốn rao bán
// hay cho thuê ạ? …" — chào LẦN HAI và hỏi lại điều khách vừa nói. Lệnh model đã dặn; đây là lưới tiền định khi model lờ đi:
// bỏ lời chào đầu tin (giữ "Dạ") và câu hỏi "bán hay cho thuê".
const CHAO_DAU = /^\s*(?:dạ\s*,?\s*)?(?:em\s+)?(?:xin\s+)?chào\s+(?:anh|chị|chú|cô|bác|mình|anh chị|ông|bà)(?:\s+ạ)?\s*[!,.]*\s*/i;
const HOI_BAN_HAY_THUE = /[^.!?]*\b(?:rao\s+)?bán\s+hay\s+(?:là\s+)?cho\s+thuê[^.!?]*\?\s*/gi;
export function boChaoLai(reply: string): string {
  let s = reply.replace(CHAO_DAU, "").replace(HOI_BAN_HAY_THUE, "").trim();
  if (!s) return reply;
  if (!/^dạ(?=[\s,.!]|$)/i.test(s)) s = `Dạ, ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  return s;
}

// 27/09/2026 (chủ dự án test Zalo): "Em biết Botanic không" → model "Em biết Botanic ở Quận 1, dự án Phú Mỹ Hưng…" — kho dự án
// không có Botanic, chủ nhà chưa nói quận nào; Botanic ở Phú Nhuận. Câu KHẲNG ĐỊNH (không có "?") nêu một quận / khu mà
// `nguCanh` (chữ chủ nhà + dữ liệu tin, KHÔNG gồm câu bot cũ) không có thì bỏ. Trả tên đã bỏ để tầng trên biết.
const KHU_HCM = [
  "phu nhuan", "binh thanh", "tan binh", "tan phu", "go vap", "thu duc", "binh tan", "nha be", "cu chi", "hoc mon", "can gio",
  "binh chanh", "phu my hung", "thu thiem", "thao dien", "van phuc", "cityland",
  // FR-239 d (phát lại test 28/09): khách "Cần đước, long an á e" → bot "Đất ở Cần Thơ, Long An là vị trí tốt…". Tỉnh / thành
  // (và thành phố lớn) khách chưa nói, tin không có → bịa.
  "can tho", "da nang", "ha noi", "hai phong", "hue", "long an", "binh duong", "dong nai", "tay ninh", "vung tau", "ba ria",
  "tien giang", "ben tre", "vinh long", "an giang", "kien giang", "ca mau", "bac lieu", "soc trang", "tra vinh", "dong thap",
  "hau giang", "binh phuoc", "lam dong", "da lat", "khanh hoa", "nha trang", "phu quoc", "binh thuan", "phan thiet",
  "ninh thuan", "quang nam", "quang ngai", "binh dinh", "phu yen", "dak lak", "gia lai", "kon tum", "nghe an", "thanh hoa",
];
export function boViTriBia(replies: string[], nguCanh: string): { replies: string[]; bo: string[] } {
  const nc = boDau(nguCanh ?? "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
  const bo = new Set<string>();
  const coQuanSo = (n: string) => new RegExp(`\\b(?:quan|q)\\s*0?${Number(n)}\\b`).test(nc);
  const ra = locCauTrongBongBong(replies, (c) => {
    if (/\?/.test(c)) return false;
    const kd = boDau(c).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
    let biaCau = false;
    for (const m of kd.matchAll(/\b(?:quan|q)\s*(\d{1,2})\b/g)) if (!coQuanSo(m[1])) { bo.add(`quận ${m[1]}`); biaCau = true; }
    for (const k of KHU_HCM) if (new RegExp(`\\b${k}\\b`).test(kd) && !nc.includes(k)) { bo.add(k); biaCau = true; }
    return biaCau;
  });
  return { replies: bo.size ? ra : replies, bo: [...bo] };
}

// FR-239 e (phát lại test 27/09): tin BÁN nhà đang cho thuê, câu mẫu "cần ra hàng gấp hay được giá" → model viết "Anh cần cho
// thuê gấp hay được giá thì thôi?". Tin bán thì "cho thuê gấp" là "bán gấp" (và ngược lại với tin cho thuê).
export function suaGapTheoDeal(reply: string, deal: string | null | undefined): string {
  if (deal === "ban") return reply.replace(/cho thuê gấp/g, "bán gấp").replace(/Cho thuê gấp/g, "Bán gấp");
  if (deal === "cho_thue") return reply.replace(/\bbán gấp/g, "cho thuê gấp").replace(/\bBán gấp/g, "Cho thuê gấp");
  return reply;
}

// 25/09/2026 (bắn thật lx-34, FR-229): câu mẫu hai vế "Sổ nhà mình đang đứng tên ai, có đồng sở hữu như vợ chồng hay anh em
// thừa kế không?" — model rút còn "Sổ nhà mình đứng tên ai anh?", mất vế đồng sở hữu (khách đáp "anh" là không biết có đồng
// sở hữu không). Câu hỏi của model thiếu VẾ BẮT BUỘC của khoá → thay câu hỏi bằng câu mẫu, giữ phần ghi nhận.
const VE_BAT_BUOC: Record<string, RegExp> = {
  nguoi_dung_ten: /\b(dong so huu|dung ten chung|so chung|vo chong|anh em|thua ke)\b/,
  dien_tich_khop_so: /\bhoan cong\b/,
  // 27/09/2026 (chủ dự án: "hỏi hơi nhiều"): tin bán hỏi pháp lý MỘT câu gộp (sổ + ai đứng tên + cầm tay / thế chấp); model
  // rút còn "sổ riêng hay chung" là mất hai ô. Chỉ áp khi câu mẫu chính nó có đủ vế (tin cho thuê vẫn câu sổ một vế).
  phap_ly: /^(?=.*\bdung ten\b)(?=.*\b(?:the chap|cam tay)\b)/,
  quy_hoach: /^(?=.*\bquy hoach\b)(?=.*\btranh chap\b)/,
};
// 27/09/2026 (test Zalo): "Anh cho em xin tên người đứng tên trên sổ hồng ạ?" — không bao giờ xin HỌ TÊN (tên người thật,
// CLAUDE.md §5); câu hỏi như vậy thay bằng câu mẫu (hỏi quan hệ).
const CAM_HOI_TEN = /\b(?:xin|cho em|cho biet)\s+(?:ho\s+)?ten\b|\bho (?:va )?ten\b|\bten (?:cua )?(?:nguoi|chu|day du|tren so)\b/;
export function giuVeCauMau(reply: string, khoa: string | null | undefined, cauMau: string): string {
  const re = khoa ? VE_BAT_BUOC[khoa] : undefined;
  const cau = cauHoiCuoi(reply);
  if (!re || !cauMau || !cau || !re.test(boDau(cauMau))) return reply;
  const kdCau = boDau(cau);
  if (re.test(kdCau) && !(khoa === "nguoi_dung_ten" && CAM_HOI_TEN.test(kdCau))) return reply;
  const i = reply.lastIndexOf(cau);
  return `${reply.slice(0, i).trim()} ${cauMau}`.trim();
}

// 25–26/09/2026 (bắn thật lx-34, test Zalo căn Botanic): "Sổ riêng thì bán nhanh hơn." / "Căn 113m2 là diện tích tốt lắm anh."
// lặp y nguyên ở hai lượt liền nhau. Câu KHÔNG phải câu hỏi mà trùng ≥ 80% chữ (bỏ tiểu từ) với một câu trong mấy tin
// gần nhất của bot thì bỏ — còn ít nhất một câu thì mới bỏ.
export function boCauLapLai(reply: string, botGanDay: Array<string | null | undefined>): string {
  const DEM = new Set(["da", "a", "nha", "nhe", "em", "anh", "chi", "chu", "co", "bac", "minh", "oi", "la", "thi", "gi", "cung", "voi", "va", "lam", "roi"]);
  const tuCua = (c: string) => new Set(boDau(c).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !DEM.has(t)));
  const cu = botGanDay.flatMap((m) => tachCau(m ?? "")).map(tuCua).filter((t) => t.size >= 3);
  const ra = locCauTrongBongBong([reply], (c) => {
    if (/\?/.test(c)) return false;
    const tu = tuCua(c);
    if (tu.size < 3) return false;
    return cu.some((x) => {
      let chung = 0;
      for (const t of tu) if (x.has(t)) chung++;
      return chung / Math.min(tu.size, x.size) >= 0.8;
    });
  })[0]?.trim();
  return ra ? ra : reply;
}

// 27/09/2026 (test Zalo): khách "Là bao nhiêu vậy em nhớ không" (đã nói "Giá 8.000.000.000") → model "Em nhớ anh muốn 5 tỷ 2 ạ."
// Câu KHẲNG ĐỊNH (không "?") mang một số tiền ≥ 100 triệu mà chữ chủ nhà / giá đã ghi không có số đó thì bỏ.
export function boTienBia(replies: string[], nguCanh: string, giaDaGhi: Array<number | string | null | undefined> = []): { replies: string[]; bo: number[] } {
  const co = new Set<number>(giaDaGhi.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0));
  for (const v of cacSoTien(nguCanh ?? "")) co.add(v);
  const bo: number[] = [];
  const ra = locCauTrongBongBong(replies, (c) => {
    if (/\?/.test(c)) return false;
    const la = cacSoTien(c).filter((v) => v >= 1e8 && !co.has(v));
    if (!la.length) return false;
    bo.push(...la);
    return true;
  });
  return { replies: bo.length ? ra : replies, bo };
}
/** Mọi cụm tiền trong chuỗi ("400 triệu 1 tháng bán 65 tỉ" → 400 triệu, 65 tỷ), mỗi cụm đọc bằng `docTien`. */
const CUM_TIEN = /\d+(?:[.,]\d+)?\s*(?:tỷ|tỉ|tỏi|tị|ty|ti|triệu|trieu|tr|củ)(?:\s*\d{1,3}(?![\d.,]|\s*(?:m|tháng|thang|năm|nam|phòng|phong|người|nguoi)))?(?:\s+rưỡi|\s+ruoi)?(?![\p{L}])|(?<![\d.,])[1-9]\d{0,2}(?:[.,]\d{3}){2,}(?![\d])/giu;
function cacSoTien(s: string): number[] {
  const ra: number[] = [];
  for (const m of s.matchAll(CUM_TIEN)) { const v = docTien(m[0]); if (v) ra.push(v); }
  return ra;
}

/**
 * FR-240 c (phát lại test 28/09 trên production): tin ĐẤT mà model hỏi "Nhà mình ở đường nào cụ thể, hay hẻm mấy anh?".
 * "nhà / căn nhà + đại từ" → "lô đất + đại từ" cho tin đất (cùng cách `goiCanHo` làm cho căn hộ).
 */
export const LOAI_DAT: ReadonlySet<string> = new Set(["dat", "dat_nong_nghiep", "dat_kinh_doanh"]);
export function goiDat(reply: string): string {
  return reply.replace(/(?<![\p{L}])(?:([Cc])ăn\s+)?([Nn])hà (anh|chị|mình|chú|cô|bác|em)(?![\p{L}])/gu,
    (_m, c: string | undefined, n: string, x: string) => `${/[CN]/.test(c ?? n) ? "Lô" : "lô"} đất ${x}`);
}
// 27/09/2026 (test Zalo, căn Botanic): tin đã là CĂN HỘ mà bot vẫn "nhà anh ở phường nào" — gọi đúng "căn hộ".
export function goiCanHo(reply: string): string {
  return reply.replace(/(?<![\p{L}])([Nn])hà (anh|chị|mình|chú|cô|bác|em)(?![\p{L}])/gu, (_m, n: string, x: string) => `${n === "N" ? "Căn" : "căn"} hộ ${x}`);
}

// ── 30/09/2026 (chủ dự án chat thử, bot v277) ──
// "Mình cho mình xin địa chỉ" — bot tự xưng "mình". "mình" chỉ dùng để GỌI khách chưa rõ anh / chị; bot luôn là "em"
// (người lớn tuổi thì `doiTuXung` đổi tiếp sang "cháu"). Chỉ sửa những cụm chắc chắn là bot nói về mình: xin / hỏi
// cho mình, mình ghi nhận / ghi lại / lưu lại / tạo tin.
// 05/10/2026 (SRS-5.1zz, chủ dự án: "đợt trước cứ vá theo từng cái cụ thể quá mà không vá chung"): thay danh sách mẫu câu bằng MỘT
// luật mệnh đề — "mình" mở mệnh đề (đầu câu, sau dấu, sau Dạ/Để/Rồi/Nên/Vậy/Thôi/Giờ) + động từ VIỆC CỦA BOT, mà mệnh đề đó không
// có chữ "em" → bot đang nói về mình → "em". "Mình gửi em thêm hình nha" (có "em") và "Nhà mình" (sau danh từ) giữ nguyên.
const VIEC_BOT = "ghi nhận|ghi lại|ghi|lưu lại|lưu|tạo tin|tạo|đăng tin|đăng|lên tin|kiểm tra|xem lại|soát|báo lại|báo|sửa lại|sửa|cập nhật|tìm|lọc|chuyển|kết nối|hẹn|soạn|chốt|nhắn|hỏi lại|gửi (?:anh|chị|chú|cô|bác|mình|khách)";
const MINH_MO_MENH_DE = new RegExp(`(^|[.,;:!?\\n]\\s*|(?<![\\p{L}])(?:[Dd]ạ|[Đđ]ể|[Rr]ồi|[Nn]ên|[Vv]ậy|[Tt]hôi|[Gg]iờ)\\s+)([Mm])ình(\\s+(?:(?:đã|vừa|sẽ|đang|cứ|xin|mới)\\s+)?(?:${VIEC_BOT})(?![\\p{L}]))`, "gu");
function menhDeKhongCoEm(r: string, tu: number): boolean {
  const het = r.slice(tu).search(/[.,;:!?\n]/);
  const menhDe = r.slice(tu, het < 0 ? undefined : tu + het);
  return !/(?<![\p{L}])em(?![\p{L}])/u.test(menhDe);
}
export function botXungEm(r: string): string {
  if (/^\s*(?:🤖|💾|📝|📋)/u.test(r)) return r;
  r = r.replace(MINH_MO_MENH_DE, (m, dau: string, M: string, sau: string, tu: number) =>
    menhDeKhongCoEm(r, tu + dau.length) ? `${dau}${M === "M" ? "Em" : "em"}${sau}` : m);
  return r
    // 30/09/2026 (bắn thật v285): "Cảm ơn em đã ghi nhận bán căn hộ Sunrise City…" — model cảm ơn KHÁCH vì việc BOT làm.
    // Ghi nhận / ghi lại / lưu lại là việc của bot → "Dạ em ghi nhận…".
    .replace(/(?<![\p{L}])([Cc])(?:ảm|ám) ơn\s+(?:(?:em|mình|bạn|anh\/chị|anh chị|anh|chị)\s+)?(?:đã\s+|vừa\s+)?(ghi nhận|ghi lại|lưu lại)(?![\p{L}])/gu,
      (_m, c: string, v: string) => `${c === "C" ? "Dạ" : "dạ"} em ${v}`)
    .replace(/(?<![\p{L}])([Cc])ho mình (xin|hỏi)(?![\p{L}])/gu, "$1ho em $2")
    .replace(/(?<![\p{L}])([Mm])ình (đã |vừa |sẽ )?(ghi nhận|ghi lại|lưu lại|tạo tin)(?![\p{L}])/gu,
      (_m, m: string, t: string | undefined, v: string) => `${m === "M" ? "Em" : "em"} ${t ?? ""}${v}`);
}

// Khen VỊ TRÍ suông ("Địa chỉ nằm khu vực An Hội Tây, vị trí khá thuận tiện") — bot không có dữ liệu gì về khu đó. Bỏ
// mệnh đề khen, giữ phần còn lại của câu; câu hỏi giữ nguyên.
const KHEN_VI_TRI = /\b(?:vi tri|khu vuc|khu nay|khu do|cho nay|cho do|dia chi|dia the|vung nay)\b[^.!?]{0,40}?\b(?:(?:kha|rat|cung|qua|that|lam|thi)\s+)?(?:thuan tien|thuan loi|dac dia|dep|ly tuong|sam uat|dang song|tiem nang|dong duc|dac biet|tot|ok|on)\b/;
export function boKhenViTri(replies: string[]): string[] {
  const ra = boKhenViTriTho(replies);
  return ra.length ? ra : replies;
}
function boKhenViTriTho(replies: string[]): string[] {
  const laKhen = (md: string) => !/\?/.test(md) && KHEN_VI_TRI.test(boDau(md));
  return replies.map((r) => {
    if (/^\s*(?:🤖|💾|📝|📋)/u.test(r)) return r;
    const ra = r.split("\n").map((d) => tachCau(d).map((c) => {
      const md = c.split(/,\s+/);
      const giu = md.filter((x) => !laKhen(x));
      if (giu.length === md.length) return c;
      const gop = giu.join(", ").trim().replace(/(?<![.!?…)])$/u, giu.length ? "." : "");
      return gop && gop !== "." ? gop.charAt(0).toUpperCase() + gop.slice(1) : "";
    }).filter(Boolean).join(" ").trim()).filter(Boolean).join("\n").trim();
    return ra;
  }).filter(Boolean);
}

// ─── 30/09/2026 (bắn thử người mua lx-mua-a1..d1, SRS-5.1h) ────────────────────────────────────────────────────────

/**
 * Loại nhà khách mua nói → các `listings.property_type` được lọc. Chỉ tín hiệu CHẮC: căn hộ / chung cư, đất, phòng trọ,
 * biệt thự, nhà phố / nhà hẻm / mặt tiền / nhà cấp 4. "mua nhà" trơn KHÔNG lọc (người Việt gọi căn hộ cũng là "nhà").
 */
export function loaiKhoTuHoSo(v: unknown): string[] | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const k = boDau(v);
  if (/\b(?:can ho|chung cu|cc|officetel|penthouse|duplex|studio)\b/.test(k)) return ["chung_cu"];
  if (/\b(?:phong tro|nha tro|phong cho thue)\b/.test(k)) return ["phong_tro"];
  if (/\bbiet thu\b/.test(k)) return ["biet_thu"];
  if (/\b(?:dat nen|lo dat|manh dat|dat tho cu|dat)\b/.test(k) && !/\bnha\b/.test(k)) return ["dat", "dat_nong_nghiep", "dat_kinh_doanh"];
  if (/\b(?:nha pho|nha hem|nha mat tien|mat tien|nha cap 4|nha cap bon|nha rieng|nha trong hem)\b/.test(k)) return ["nha_pho", "nha_cap4", "biet_thu", "toa_nha"];
  return null;
}

/** Loại nhà nói CHẮC trong câu khách (cho hồ sơ tạm lọc kho lượt này), null khi không chắc. */
export function loaiNhaTrongCau(tKD: string): string | null {
  if (/\b(?:can ho|chung cu|officetel|penthouse|duplex)\b/.test(tKD)) return "căn hộ";
  if (/\b(?:phong tro|nha tro)\b/.test(tKD)) return "phòng trọ";
  if (/\bbiet thu\b/.test(tKD)) return "biệt thự";
  if (/\b(?:dat nen|lo dat|manh dat|dat tho cu)\b/.test(tKD)) return "đất";
  return null;
}

/** "q5" / "quan 5" / "Q.10" → "Quận 5"; "p2" → "Phường 2" (hồ sơ mua lưu từ câu không dấu). Chữ khác giữ nguyên. */
export function chuanKhuVucMua(s: string): string {
  return s
    .replace(/(?<![\p{L}\d])(?:q|quan|quận)\s*\.?\s*(\d{1,2})(?!\d)/giu, (_m, n: string) => `Quận ${Number(n)}`)
    .replace(/(?<![\p{L}\d])(?:p|phuong|phường)\s*\.?\s*(\d{1,2})(?!\d)/giu, (_m, n: string) => `Phường ${Number(n)}`);
}

/**
 * Cụm 2–5 chữ lặp liền nhau do model viết ("căn rẻ nhất là Nguyễn Trãi Nguyễn Trãi P2") → một lần. Chữ đơn lặp
 * ("từ từ", "dạ dạ") không đụng. Không đụng bong bóng 🤖 / 💾 / 📝 / 📋.
 */
export function boLapCum(replies: string[]): string[] {
  return replies.map((r) => /^\s*(?:🤖|💾|📝|📋)/u.test(r) ? r
    : r.replace(/(?<![\p{L}])((?:\p{L}+\s+){1,4}\p{L}+)\s+\1(?![\p{L}])/gu, "$1"));
}

const tuCauHoi = (s: string): Set<string> => new Set(boDau(s).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
  .filter((w) => w.length >= 2 && !["da", "a", "vay", "nhe", "nha", "minh", "anh", "chi", "em", "hon", "thich", "muon", "can"].includes(w)));
/** Hai câu hỏi cùng ý (≥ 70% chữ chính trùng) — "Mình thích hẻm xe hơi hay mặt tiền hơn ạ?" ≈ "Mình muốn hẻm xe hơi hay mặt tiền hơn vậy ạ?". */
export function giongCauHoi(a: string, b: string): boolean {
  const x = tuCauHoi(a), y = tuCauHoi(b);
  if (x.size < 2 || y.size < 2) return false;
  let chung = 0;
  for (const w of x) if (y.has(w)) chung++;
  return chung / Math.min(x.size, y.size) >= 0.7;
}
/** Bỏ câu hỏi trong `replies` trùng ý câu hỏi bot vừa hỏi ở tin trước (`botTruoc`); bong bóng rỗng thì bỏ luôn. */
export function boCauHoiLap(replies: string[], botTruoc: string | null | undefined): string[] {
  const cuHoi = tachCau(botTruoc ?? "").filter((c) => c.trim().endsWith("?"));
  if (!cuHoi.length) return replies;
  return replies.map((r) => /^\s*(?:🤖|💾|📝|📋)/u.test(r) ? r
    : tachCau(r).filter((c) => !(c.trim().endsWith("?") && cuHoi.some((h) => giongCauHoi(c, h)))).join(" ").trim())
    .filter(Boolean);
}

// ── 01/10/2026: lời nhận xét của bot phải có căn cứ trong lời chủ nhà — AI soát, code kiểm (kiem-khen.ts) ───────────────
// Lớp lỗi: `KHEN_CAN_BANG_CHUNG` là danh sách cặp cụm khen ↔ cụm bằng chứng viết tay; cụm khen mới ("hẻm sâu") lọt. Nay AI
// liệt kê câu nhận xét kèm căn cứ; ở đây chỉ KIỂM căn cứ đó có thật trong chữ chủ nhà / thông tin đã ghi.
const gonKhen = (s: string): string => boDau(s ?? "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
/** Câu nhận xét (nguyên văn trong lời bot) KHÔNG có căn cứ thật → cần bỏ. */
export function nhanXetKhongCanCu(
  ds: Array<{ cau?: string | null; can_cu?: string | null; danh_gia_thi_truong?: boolean | null; noi_trang_thai_tin?: boolean | null; noi_chua_len_ke?: boolean | null; kieu?: string | null; hua_khong_lam?: boolean | null; ghi_nhan?: boolean | null }> | null | undefined,
  bangChung: string,
  /** SRS-5.1zzzzzf: sổ ghi của lượt — câu "em ghi X rồi" (`ghi_nhan`) chỉ đứng được khi X có trong đây. Không truyền = không soát loại câu này. */
  vuaGhi?: string,
): string[] {
  const bc = ` ${gonKhen(bangChung)} `;
  const bo: string[] = [];
  for (const x of ds ?? []) {
    const cau = (x?.cau ?? "").trim();
    // SRS-5.1zzzzzf: câu nói đã ghi một giá trị — căn cứ chỉ ở sổ ghi LƯỢT NÀY (lời chủ nhà có nói cũng không phải bằng chứng là đã ghi).
    if (cau && x?.ghi_nhan === true && vuaGhi !== undefined) {
      const ccG = gonKhen(x?.can_cu ?? "");
      if (!(ccG.length >= 2 && ` ${gonKhen(vuaGhi)} `.includes(` ${ccG} `))) bo.push(cau);
      continue;
    }
    // SRS-5.1zzzzzc: lời hứa việc bot không tự làm được ("tối em gọi lại nha") — không có nguồn nào làm nó đúng.
    if (cau && x?.hua_khong_lam === true) { bo.push(cau); continue; }
    // SRS-5.1zzzzzb: câu hỏi GỢI Ý giá trị chủ nhà chưa nói cũng cần nguồn (`cauHoiGoiYKhongNguon` bỏ cả câu hỏi đó); câu hỏi mở thì giữ.
    if (!cau || /\?/.test(cau)) continue;
    // SRS-5.1zzzzk: câu trạng thái tin có chủ riêng (lưới trạng thái ở đường ra, đối chiếu DB) — đúng thì giữ, sai thì lưới đó bỏ.
    if (x?.noi_trang_thai_tin === true || x?.noi_chua_len_ke === true) continue; // chủ là lưới trạng thái (đối chiếu DB)
    // SRS-5.1zzy (chat thử 07/10: "Khu Hà Huy Giáp đất vàng quận 12 anh"): AI trích "khu hà huy giáp" làm căn cứ — tên khu có thật
    // nhưng lời ĐÁNH GIÁ khu thì không. Bot không có số liệu thị trường: câu AI đánh dấu đánh giá thị trường luôn bỏ, căn cứ gì cũng vậy.
    if (x?.danh_gia_thi_truong === true) { bo.push(cau); continue; }
    // SRS-5.1zzzzx (khách mô phỏng 11/10: "hem 4m" → "hẻm 4m ô tô vào tới nhà tiện lắm"; "4x16 là diện tích vừa phải"; "hẻm hẹp thì đi
    // lại cần cẩn thận"): căn cứ có thật ("hem 4m", "4x16") chỉ chứng minh CON SỐ, không chứng minh tính chất bot gắn thêm. AI phân loại
    // câu suy ra / chấm điểm → bỏ dù căn cứ có thật.
    // SRS-5.1zzzzzc (khách mô phỏng lần năm: "Dạ sổ riêng, giấy tờ gọn lắm anh chị" — giám khảo: bot không biết giấy tờ "gọn"): lợi ích bot
    // GẮN THÊM cho đặc điểm thật cũng là điều chủ nhà không nói — bỏ như suy ra / chấm điểm. Chỉ câu NHẮC LẠI đúng lời chủ nhà có căn cứ.
    // SRS-5.1zzzzzr: `khen_nhac_lai` (khen ngắn nhắc đúng chữ chủ nhà) đi tiếp xuống kiểm căn cứ như `nhac_lai`.
    if (x?.kieu === "suy_ra" || x?.kieu === "danh_gia" || x?.kieu === "loi_ich") { bo.push(cau); continue; }
    const cc = gonKhen(x?.can_cu ?? "");
    if (cc.length >= 2 && bc.includes(` ${cc} `)) continue;
    bo.push(cau);
  }
  return bo;
}
/**
 * SRS-5.1zzzzzb (khách mô phỏng 11/10: "Hẻm Quang Trung ở phường Thạnh Lộc bác ơi. Vậy nhà bác ở phường Thạnh Lộc đúng không bác?" —
 * phường bịa, rồi hỏi gật): câu HỎI đưa sẵn một giá trị (AI soát đánh dấu `goi_y`) mà giá trị đó không có nguồn (lời chủ nhà / đã ghi
 * / dữ liệu tra) → trả về để bỏ CẢ câu. Câu hỏi mở không bao giờ bị bỏ.
 */
export function cauHoiGoiYKhongNguon(
  ds: Array<{ cau?: string | null; can_cu?: string | null; goi_y?: boolean | null }> | null | undefined,
  bangChung: string,
): string[] {
  const bc = ` ${gonKhen(bangChung)} `;
  return (ds ?? []).filter((x) => x?.goi_y === true && (x.cau ?? "").trim().length >= 4).filter((x) => {
    const cc = gonKhen(x?.can_cu ?? "");
    return !(cc.length >= 2 && bc.includes(` ${cc} `));
  }).map((x) => (x.cau ?? "").trim());
}
/** Bỏ khỏi lời bot các CÂU (theo `tachCau`) chứa một câu hỏi gợi ý không nguồn. Hết chữ → null (nơi gọi dùng câu mẫu / lưới câu hỏi). */
export function boCauHoiGoiY(loi: string | null | undefined, cauBo: string[]): string | null {
  let s = (loi ?? "").trim();
  if (!s || !cauBo.length) return s || null;
  const kd = cauBo.map((c) => boDau(c.replace(/[?.!…\s]+$/u, "")).trim()).filter((c) => c.length >= 4);
  const trung = (x: string) => {
    const kx = boDau(x).replace(/[?.!…\s]+$/u, "").trim();
    return kd.some((c) => kx.includes(c) || (kx.length >= 12 && c.includes(kx)));
  };
  s = s.split("\n").map((d) => tachCau(d).filter((x) => !trung(x)).join(" ").trim())
    .filter((d) => d).join("\n").trim();
  return s || null;
}
/**
 * Bỏ khỏi lời bot các câu / vế trong `cauBo` (AI chép nguyên văn; so cả bản bỏ dấu). KHÔNG bao giờ bỏ phần có dấu "?" — câu
 * hỏi giữ nguyên. Hết chữ → null (nơi gọi dùng câu mẫu).
 */
/**
 * 02/10/2026 (bắn thử thu-kb2-s01, SRS-5.1zi): "Phí thì hệ thống đã gửi cho mình rồi nha." — lời dặn model nói "hệ thống ĐÃ trả
 * lời ở bong bóng trước", model chép nguyên chữ "hệ thống" ra cho khách. Khách không cần nghe về máy: bỏ câu KHẲNG ĐỊNH có
 * "hệ thống" làm một việc (gửi / trả lời / báo / ghi / lưu / nhắn / cập nhật). Câu hỏi giữ nguyên ("Xưởng có hệ thống xử lý
 * nước thải chưa?" là câu hỏi mẫu thật). Không bỏ gì thì trả đúng mảng cũ.
 */
const HE_THONG_LAM_RE = /\bhe thong\s+(?:(?:da|vua|se|tu|dang|cung|co)\s+)*(?:gui|tra loi|bao|ghi|luu|nhan|cap nhat|ghi nhan)\b/;
/**
 * SRS-5.1zzzzj (bắn production 09/10/2026: "phí sao em" → "1% giá chốt" với người rao chưa nói mình là chủ hay môi giới). Con số
 * phí thuộc về MỘT chủ: `cauPhi(vaiPhi(…))` (prompts.ts). Câu KHẲNG ĐỊNH trong lời gửi người rao có "phí" kèm con số phần trăm mà
 * số đó không phải số của vai ĐÃ XÁC NHẬN (`phanTram`: "1" / "0,5" / null = không được nói số) → thay bằng `cauThay` (chính câu
 * `cauPhi` sinh) ở câu đầu, bỏ các câu sau. Lưới chống bịa (luôn bật), không sửa văn. Không đụng câu hỏi (có "?") — câu hỏi là
 * của `damBaoCauHoi`; không đụng bong bóng 🤖 / 📝 / 📋 / 💾 (chữ code từ DB).
 */
export function chanPhiChuaXacNhan(replies: string[], phanTram: string | null, cauThay: string, haiMuc = false): string[] {
  const so = (x: string) => x.replace(".", ",").replace(/^0+(?=\d)/, "");
  const sai = (c: string): boolean => {
    // Câu nói về phí: có chữ phí / hoa hồng, hoặc con số % đi với giá chốt / giao dịch / vai ("chính chủ thì 1% giá chốt").
    if (/\?/.test(c) || !/\b(?:phi|hoa hong|gia chot|giao dich|chinh chu|moi gioi)\b/.test(boDau(c))) return false;
    const cac = [...c.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => so(m[1]));
    // SRS-5.1zzzzzo (chủ dự án 13/10): vai chưa rõ (tin bán) thì câu nêu CẢ HAI mức "chính chủ 1%, môi giới 0,5%" là đúng.
    const kd = boDau(c);
    if (haiMuc && cac.includes("1") && cac.includes("0,5") && cac.every((n) => n === "1" || n === "0,5") && /\bchinh chu\b/.test(kd) && /\bmoi gioi\b/.test(kd)) return false;
    return cac.length > 0 && cac.some((n) => n !== phanTram);
  };
  let daThay = false;
  const ra: string[] = [];
  for (const r of replies) {
    if (/^\s*(?:🤖|💾|📝|📋)/u.test(r)) { ra.push(r); continue; }
    const dong = r.split("\n").map((d) => tachCau(d).map((c) => {
      if (!sai(c)) return c;
      if (daThay) return "";
      daThay = true;
      const t = cauThay.trim();
      return `Dạ ${t.charAt(0).toLowerCase()}${t.slice(1)}${/[.!]$/.test(t) ? "" : " ạ."}`;
    }).filter(Boolean).join(" ").trim()).filter(Boolean).join("\n").trim();
    if (dong) ra.push(dong);
  }
  return daThay ? ra : replies;
}

export function boCauNoiHeThong(replies: string[]): string[] {
  return locCauTrongBongBong(replies, (c) => !/\?/.test(c) && HE_THONG_LAM_RE.test(boDau(c)));
}

/**
 * Câu khẳng định MỞ ĐẦU bong bóng mà trỏ ngược ("Khách hay chú ý điểm này lắm :)") — phía trước không còn gì để "điểm này" trỏ
 * tới (câu trước đã bị lọc, hoặc model viết cụt). Bắn thử thu-kb2-s08, SRS-5.1zi. Câu ngắn (≤ 12 chữ), không có "?".
 */
const TRO_NGUOC_RE = /\b(?:diem nay|cai nay|cho nay|dieu nay|vu nay|khoan nay)\b/;
export function boCauTroNguocDauBong(replies: string[]): string[] {
  let doi = false;
  const ra = replies.map((r) => {
    const dong = r.split("\n");
    const cac = tachCau(dong[0] ?? "");
    const dau = cac[0] ?? "";
    if (!dau || /\?/.test(dau) || !TRO_NGUOC_RE.test(boDau(dau)) || dau.split(/\s+/).length > 12) return r;
    doi = true;
    dong[0] = cac.slice(1).join(" ").trim();
    return dong.filter((d, i) => i > 0 || d.trim()).join("\n").trim();
  }).filter(Boolean);
  return doi ? ra.map((r) => r.charAt(0).toUpperCase() + r.slice(1)) : replies;
}

/** Mặt cười ngay đầu phần còn lại sau khi cắt một vế (":)", ":D", "^^") — đi theo vế đã cắt, không được trơ lại ")". */
const MAT_CUOI_DAU = /^\s*(?:[:;=]-?[)(D]+|\^\^)/u;
export function boCauNhanXet(loi: string | null | undefined, cauBo: string[]): string | null {
  let s = (loi ?? "").trim();
  if (!s) return null;
  for (const c0 of cauBo) {
    const c = c0.trim().replace(/[.,!…;:\s]+$/u, "");
    if (c.length < 4 || /\?/.test(c)) continue;
    // 02/10/2026 (bắn thử thu-kb-s05, lx "Lê Văn Sỹ", SRS-5.1zh): AI trích "khách tìm nhiều lắm, dễ ra hàng" (không kèm ":)") →
    // cắt đúng cụm rồi gọt ":" đầu phần sau, còn trơ ")" — bong bóng "Hẻm 5m Lê Văn Sỹ thì ) Em tra thấy…", "Theo em biết, )".
    // Câu KHẲNG ĐỊNH (không có "?") chứa nhận xét → bỏ CẢ câu (mặt cười đi theo câu, `tachCau`); câu có hỏi mới cắt vế.
    const kdC = boDau(c);
    let boCa = false;
    const dongMoi = s.split("\n").map((d) => {
      const cac = tachCau(d);
      const giu = locCauGotNoi(cac, (x) => {
        const bo = !/\?/.test(x) && boDau(x).includes(kdC);
        if (bo) boCa = true;
        return bo;
      });
      return giu.length === cac.length ? d : giu.join(" ").trim();
    });
    if (boCa) {
      s = dongMoi.filter((d) => d.trim()).join("\n").trim();
      continue;
    }
    let i = s.indexOf(c);
    if (i < 0) {
      // So bỏ dấu từng ký tự (độ dài giữ nguyên) để cắt đúng vị trí trên câu gốc.
      const kd = [...s].map((ch) => boDau(ch) || ch).join("");
      i = kd.indexOf(boDau(c));
      if (i < 0 || [...kd].length !== [...s].length) continue;
      const arr = [...s];
      const truoc = arr.slice(0, i).join(""), giua = arr.slice(i, i + [...boDau(c)].length).join(""), sau = arr.slice(i + [...boDau(c)].length).join("");
      if (/\?/.test(giua)) continue;
      s = `${truoc}${sau.replace(MAT_CUOI_DAU, "").replace(/^[\s.,!…;:]+/u, " ")}`;
    } else {
      // Vế khen dính liền câu hỏi ("Hẻm sâu thì dễ bán, mình cần gấp không?") — bỏ vế, phần hỏi giữ.
      s = `${s.slice(0, i)}${s.slice(i + c.length).replace(MAT_CUOI_DAU, "").replace(/^[\s.,!…;:]+/u, " ")}`;
    }
    s = s.replace(/\s+([.,!?…])/g, "$1").replace(/[ \t]{2,}/g, " ").replace(/^[\s.,!…;:]+/u, "").trim();
  }
  if (!s || !/[\p{L}\d]/u.test(s)) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── 06/10/2026 (bắn thử thu-srd-a1, SRS-5.1zzo) ─────────────────────────────────────────────────────────────────────────
// Lớp lỗi "MỞ Ô CHỜ MÀ KHÔNG HỎI": code chọn ý cần hỏi kế (nextKey / thiếu điểm), mở `info_requests` cho ô đó, nhưng câu hỏi
// giao cho model viết — model trả "Dạ em cảm ơn anh." (không hỏi) thì ô chờ vẫn mở, khách im, lượt sau câu trả lời rơi vào ô
// không ai hỏi. Các van cũ chỉ bắt câu hỏi LỆCH khoá (`laHoiLechKhoa`) hay rút vế (`giuVeCauMau`), không bắt "không có câu hỏi".
// Đây là lưới GHI ĐÚNG Ô (luôn bật, không treo `luat_loi_bot`): lời model không có câu hỏi → nối câu hỏi của ô đã mở.
// Câu hỏi không dấu "?" kiểu Zalo: từ để hỏi nằm trong ~20 chữ cuối ("nhà mình mấy tầng rồi anh", "sổ riêng hay chung ạ").
const DUOI_HOI_RE = /\b(?:khong|chua|nao|gi|sao|bao nhieu|may|ha|hong|ko|dc|duoc|hay)\b[^.!?…]{0,20}[.!…]?\s*$/;
export function coCauHoi(reply: string | null | undefined): boolean {
  const s = (reply ?? "").trim();
  if (!s) return false;
  if (/\?/.test(s)) return true;
  return DUOI_HOI_RE.test(boDau(s.split("\n").at(-1) ?? ""));
}
/** Lời model không hỏi gì mà ô chờ `cauHoi` đã/đang mở → nối câu hỏi đó vào cuối. Không có ô chờ (`cauHoi` rỗng) thì giữ nguyên. */
export function damBaoCauHoi(reply: string | null | undefined, cauHoi: string | null | undefined): string | null {
  const s = (reply ?? "").trim();
  const q = (cauHoi ?? "").trim();
  if (!q) return s || null;
  if (!s) return q;
  if (coCauHoi(s)) return s;
  return `${s.replace(/(?<![.!?…])$/u, ".")} ${q}`.replace(/\s+/g, " ").trim();
}

/**
 * SRS-5.1zzzq (08/10/2026, thay lưới `boCauTrungBongTruoc` của SRS-5.1zzzn): khách hỏi phí / ảnh / bot → bong bóng TIỀN ĐỊNH trả
 * lời, rồi model viết lại y câu đó ở bong bóng sau. Gốc: hai đường (code, model) cùng được ĐƯA câu hỏi trong một lượt, nên cả hai
 * cùng trả lời — lời dặn "đừng trả lời lại" hay lưới cắt câu trùng chỉ chữa ngọn. Nay câu hỏi đã có bong bóng trả lời bị CẮT KHỎI
 * tin đưa model: model không thấy câu hỏi thì không có gì để trả lời lại.
 * `cau` là cụm AI trích từ tin (đã qua `docHoiLai`: nằm trong tin sau khi bỏ dấu) hoặc mảnh luật `tachCauHoiNguoc` tách ra. Khớp
 * theo chữ cái / chữ số đã bỏ dấu, rồi cắt đúng đoạn đó trên chữ GỐC (giữ dấu, giữ phần còn lại). Không khớp → trả nguyên tin.
 */
export function anCauDaDap(tin: string, cau: string | null | undefined): string {
  const t = tin ?? "";
  const c = (cau ?? "").trim();
  if (!t.trim() || !c) return t;
  const kyTu = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]/g, "");
  const so: string[] = [];
  const viTri: number[] = [];
  for (let i = 0; i < t.length; i++) for (const ch of kyTu(t[i])) { so.push(ch); viTri.push(i); }
  const kc = kyTu(c);
  const p = kc ? so.join("").indexOf(kc) : -1;
  if (p < 0) return t;
  let dau = viTri[p];
  let cuoi = viTri[p + kc.length - 1] + 1;
  // Mẩu ≤ 2 chữ còn dính trong cùng vế ("ủa" phí sao, phí sao "cháu") là đuôi / đầu của chính câu hỏi — cắt luôn.
  const NGAT = /[,.;:?!…\n]/;
  let e = cuoi; while (e < t.length && !NGAT.test(t[e])) e++;
  if (t.slice(cuoi, e).trim().split(/\s+/).filter(Boolean).length <= 2) cuoi = e;
  let b = dau; while (b > 0 && !NGAT.test(t[b - 1])) b--;
  if (t.slice(b, dau).trim().split(/\s+/).filter(Boolean).length <= 2) dau = b;
  while (cuoi < t.length && /[?!.…]/.test(t[cuoi])) cuoi++;
  return `${t.slice(0, dau)} ${t.slice(cuoi)}`.replace(/\s+/g, " ").replace(/^[\s,;:.\-–]+|[\s,;:.\-–]+$/g, "").trim();
}

/**
 * SRS-5.1zzzzzy (Zalo thật 13/10/2026 16:12: khách "Tại đường Trương Đình Hội", bot "Căn Trương Đình Hối này…" — model gõ sai DẤU tên
 * đường khách vừa nói, trong khi tên đúng đang nằm trong cột tin). Tên riêng của căn (đường, phường, địa chỉ đã ghi) là chữ của KHÁCH / từ
 * điển, không phải của model: cụm trong lời bot cùng số chữ, cùng chữ bỏ dấu với một tên đã biết nhưng khác dấu → thay đúng tên đã biết.
 * Chỉ khác hoa / thường thì giữ nguyên lời model. Lưới an toàn (nói sai tên đường của khách là nói sai dữ liệu), không phải van sửa văn —
 * luôn bật; bong bóng 📋 💾 🤖 📝 là chữ code ghép từ DB, không đụng.
 */
export function suaTenRiengLechDau(replies: string[], tenBiet: Array<string | null | undefined>): string[] {
  const ten = [...new Set(tenBiet.map((t) => (t ?? "").normalize("NFC").replace(/\s+/g, " ").trim()).filter((t) => t.split(" ").length >= 2 && t.length >= 6 && !/\d/.test(t)))];
  if (!ten.length) return replies;
  const chuan = (s: string) => boDau(s).toLowerCase();
  const loi = (w: string) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  return replies.map((r) => {
    if (/^(?:📋|💾|🤖|📝)/u.test(r)) return r;
    const parts = r.normalize("NFC").split(/(\s+)/); // chữ và khoảng trắng xen kẽ: chỉ số chẵn là chữ
    let doi = false;
    for (const t of ten) {
      const tu = t.split(" ");
      for (let i = 0; i + (tu.length - 1) * 2 < parts.length; i += 2) {
        const cum = tu.map((_, j) => parts[i + j * 2]);
        if (cum.some((w) => !w || !loi(w))) continue;
        const goc = cum.map(loi).join(" ");
        if (chuan(goc) !== chuan(t) || goc.toLowerCase() === t.toLowerCase()) continue;
        // Chỉ thay chữ lệch dấu; chữ chỉ khác hoa / thường ("phường" ↔ "Phường") giữ của model.
        for (let j = 0; j < tu.length; j++) {
          const w = loi(parts[i + j * 2]);
          if (w.toLowerCase() !== tu[j].toLowerCase()) parts[i + j * 2] = parts[i + j * 2].replace(w, tu[j]);
        }
        doi = true;
      }
    }
    return doi ? parts.join("") : r;
  });
}

/**
 * SRS-5.1zzzzzzz (chủ dự án 14/10 "giảm độ trễ đi"): lượt AI soát khẳng định (`soatNhanXet`, ~1,5 s) chỉ cần khi lời bot CÓ điều để soát.
 * Lời chỉ gồm câu dạ / vâng / ghi nhận ngắn (không số, không tên riêng) + MỘT câu hỏi mở (không số, không chữ viết hoa sau chữ đầu — tức
 * không gợi ý phường / đường / dự án nào) thì không có khẳng định nào để bịa: bỏ lượt soát. Có số, có tên riêng, có câu khẳng định khác,
 * hay hai câu hỏi → vẫn soát. Lưới kiểm bằng code (boKhenKhongCanCu…) vẫn chạy khi bỏ lượt AI soát.
 */
const CAU_DA_NGAN = /^(?:dạ|vâng|dạ vâng|dạ được|dạ rồi|ok)(?:\s+(?:ạ|anh|chị|anh chị|cô|chú|bác|em|nha|nhé))*(?:[,.!…]\s*)?$|^(?:dạ\s+)?(?:vâng\s+)?em\s+(?:ghi|ghi nhận|ghi lại|lưu|hiểu)(?:\s+(?:rồi|lại|luôn))?(?:\s+(?:ạ|nha|nhé|anh|chị|anh chị|cô|chú|bác))*[.!…]?$/iu;
export function loiKhongCanSoat(loi: string | null | undefined): boolean {
  const s = (loi ?? "").trim();
  if (!s || /\d/.test(s)) return false;
  const cau = s.split("\n").flatMap((d) => tachCau(d.trim())).map((c) => c.trim()).filter(Boolean);
  const hoi = cau.filter((c) => /\?\s*$/.test(c));
  if (hoi.length !== 1) return false;
  for (const c of cau) {
    if (c === hoi[0]) {
      // Chữ viết hoa sau chữ đầu câu = tên riêng (phường, đường, dự án) → câu hỏi có gợi ý giá trị, phải soát.
      const tu = c.replace(/^[^\p{L}]+/u, "").split(/\s+/).slice(1);
      if (tu.some((w) => /^\p{Lu}/u.test(w))) return false;
      continue;
    }
    if (!CAU_DA_NGAN.test(c)) return false;
  }
  return true;
}

