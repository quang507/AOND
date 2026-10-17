// boc-cau-rao.ts — đọc CÂU RAO lúc tạo tin (tầng tiền định: không model, không RPC).
//
// 14/09/2026 (bắn 14 tin rao bán): các luật dưới đây từng nằm rải trong chat-reply dưới
// dạng một dòng regex "chữ đầu tiên khớp là xong", và mỗi chỗ ghi SAI DB theo một kiểu:
//   · "bán nhà mặt tiền …, đang cho thuê 45 triệu/tháng, giá 32 tỷ" → tin CHO THUÊ giá
//     45 triệu (chữ "cho thuê" ở đâu cũng lật deal; con số tiền ĐẦU TIÊN là giá);
//   · "sang nhượng mặt bằng … thuê 60 triệu/tháng" → tin BÁN giá 60 triệu/tháng;
//   · "diện tích 62,5m²" → không có diện tích (chỉ biết "m2");
//   · "5x20, giá 95 triệu/m2" → không ra giá (chỉ nhân khi câu có "…m2");
//   · "phường Hiệp Bình Chánh" → không có phường (chỉ biết phường SỐ);
//   · "nhà phố quận 7 đường Huỳnh Tấn Phát" → gắn dự án "Căn Hộ Cao Cấp Huỳnh Tấn Phát".
import { TIEN_CD, TIEN_T_KEP } from "./luat-tien.ts";
import { bocQuan } from "../dia_ban.ts";

const boDau = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// "sang nhượng MẶT BẰNG / quán" là thuê lại chỗ kinh doanh; "sang nhượng CĂN HỘ … HĐMB, giá 5
// tỷ" là BÁN (e2e T42-02) — nên "sang nhượng" chỉ tính thuê khi đi với chỗ kinh doanh.
const VIEC_THUE = /\b(?:cho thue|cho muon)\b|\b(?:sang nhuong|sang lai|nhuong lai|sang)\s+(?:lai\s+)?(?:mat bang|mb|quan|shop|kiot|ki ot|cua hang|tiem|spa)\b/;
const VIEC_BAN = /\b(?:ban|can ban|de lai|nhuong lai nha|thanh ly)\b/;
// "đang cho thuê 45 triệu", "hiện đang cho thuê", "có hợp đồng thuê" — THU NHẬP của căn bán.
const THU_NHAP_THUE = /\b(?:dang|hien|hien dang|co hop dong|hop dong|dang co khach)\s+(?:cho\s+)?thue\b/;

/** Câu rao là BÁN hay CHO THUÊ. Chuỗi vào đã bỏ dấu. */
export function dealCauRao(kd: string): "ban" | "cho_thue" {
  const thue = VIEC_THUE.exec(kd);
  if (!thue) return "ban";
  const ban = VIEC_BAN.exec(kd);
  if (!ban) return "cho_thue";
  // Có cả hai: căn đang cho thuê mà chủ BÁN, hoặc chữ "bán" đứng trước chữ "cho thuê".
  if (THU_NHAP_THUE.test(kd) || ban.index < thue.index) return "ban";
  return "cho_thue";
}

// Tiền KHÔNG phải giá rao: cọc, phí sang, hoa hồng, lương, doanh thu. 14/09 (đo bóng): có ranh giới
// từ — bản trước khớp "no" trong "nói" và "luong" trong "thương lượng", bỏ mất giá thật.
export const TRUOC_KHONG_PHAI_GIA = /\b(?:coc|dat coc|phi sang|tien sang|hoa hong|phi moi gioi|(?<!thuong )luong|doanh thu|thu nhap|tra truoc|vay)\b(?:\s+\d{1,2}\s*(?:thang|th))?\s*[^\d,;]{0,12}$/;
// SRS-5.1zzzzzy (Zalo thật 13/10/2026 16:15, bài rao Trương Đình Hội: "chỉ 6.950 TỶ … Bên trong hoàn thiện theo ý gia chủ tầm 1,2 tỷ" → giá
// 1,2 tỷ đè 6.950 tỷ). Tiền đứng sau chữ LÀM THÊM (hoàn thiện, nội thất, sửa chữa, đầu tư thêm) là CHI PHÍ của chủ nhà, không phải giá rao —
// cùng lớp TRUOC_KHONG_PHAI_GIA nhưng vế chủ ngữ dài hơn ("theo ý gia chủ tầm"), nên lùi tới 30 ký tự không số và đòi một chữ ước lượng
// ngay trước số (tầm / khoảng / chừng / hết / tốn / mất / thêm) hoặc chữ "chi phí" / "tiền <việc>" đứng đầu. Có chữ giá / bán / chốt
// chen giữa ("nội thất đẹp, giá 5 tỷ") thì vẫn là giá. Một nguồn cho luật regex (`chonGiaRao`) và kiểm bằng chứng AI (`kiem-bang-chung.ts`).
const TU_LAM_THEM = "hoan thien|noi that|sua chua|sua lai|sua sang|cai tao|xay them|lam them|trang tri|dau tu|ton them|lam lai|xay dung them|thiet ke";
// "gia" bỏ dấu vừa là "giá" vừa là "gia (chủ / đình)" — chỉ chặn khi không phải "gia chủ / gia đình".
const KHONG_CHEN_GIA = "(?:(?!\\b(?:gia(?!\\s+(?:chu|dinh))|ban|chot)\\b)[^\\d,;.])";
export const TRUOC_LA_CHI_PHI = new RegExp(
  `\\b(?:chi phi|tien (?:${TU_LAM_THEM}))\\b${KHONG_CHEN_GIA}{0,30}$` +
  `|\\b(?:${TU_LAM_THEM})\\b${KHONG_CHEN_GIA}{0,30}\\b(?:tam|khoang|chung|het|ton|mat|them)\\s*$`,
);
const TRUOC_LA_GIA = /(?:gia|tong|chot|ban|con|chi|muon ban)\s*(?:ban|chot|chao|mong muon|tong|thue|cho thue)?\s*:?\s*$/;
// 29/09/2026 (kịch bản K6): "cho thuê ĐƯỢC 12 triệu một tháng" (không có "đang") cũng là thu nhập thuê — bản cũ chỉ biết
// "đang/hiện/hợp đồng cho thuê", nên 12 triệu lọt vào ô GIÁ và có thể đè giá bán 6,8 tỷ.
export const TRUOC_LA_THUE = /(?:(?:dang|hien|hien dang|hop dong)\s+(?:cho\s+)?thue\s*(?:duoc|voi gia|gia|:)?|(?:co\s+)?cho\s+thue\s+(?:duoc|lai))\s*$/;

/**
 * Chọn đoạn GIÁ trong câu rao (còn dấu, số bằng chữ đã đổi ra chữ số). Trả đúng đoạn
 * chữ người gõ để `price_raw` giữ nguyên văn. Luật: bỏ tiền cọc / phí / hoa hồng; tin
 * BÁN thì bỏ tiền thuê đang thu ("đang cho thuê 45 triệu"); còn lại ưu tiên số đứng sau
 * chữ "giá / tổng / chốt", không có thì số đầu tiên.
 */
/**
 * Đuôi của cụm giá trong câu rao: giữ phần lẻ ("5 tỷ 8", "5 tỷ thương lượng") nhưng
 * dừng TRƯỚC một cụm số+m2 và trước chữ của thứ KHÁC (pháp lý, hẻm, thanh khoản…).
 * 15/09/2026 (bắn thật B1): "gia 6ty2 shr thanh khoan nhanh ko ban" → price_raw mang
 * nguyên đuôi rác lên web. Một nguồn cho chat-reply và bài kiểm.
 */
export const DUOI_GIA =
  "(?:(?!\\s*\\d+(?:[.,]\\d+)?\\s*m2)(?!\\s+(?:shr|shc|sổ|so\\b|thổ|tho\\b|hẻm|hem\\b|hxh|mặt tiền|mat tien|thanh khoản|thanh khoan|pháp lý|phap ly|dt\\b|diện tích|dien tich|ngang|dài|dai\\b|hướng|huong\\b|full|nội thất|noi that|phí quản lý|phi quan ly|phí ql|phi ql|phí dịch vụ|phi dich vu|phí bảo trì|phi bao tri|\\d+\\s*x\\s*\\d+)(?![\\p{L}]))[^,.;\\n])*";

export function chonGiaRao(text: string, deal: "ban" | "cho_thue", duoi: string = DUOI_GIA): string | null {
  const re = new RegExp(`((?:[\\d][\\d.,]*\\s*(?:${TIEN_CD})|${TIEN_T_KEP})${duoi})`, "giu");
  const kd = boDau(text);
  const ung: Array<{ s: string; uuTien: boolean }> = [];
  for (const m of text.matchAll(re)) {
    const truoc = kd.slice(Math.max(0, m.index! - 30), m.index!);
    const sau = kd.slice(m.index! + m[0].length, m.index! + m[0].length + 12);
    if (TRUOC_KHONG_PHAI_GIA.test(truoc) || TRUOC_LA_CHI_PHI.test(truoc)) continue;
    const moiThang = /^\s*(?:\/|mot|1|moi)?\s*(?:thang|th)\b/.test(sau) || /\/\s*(?:thang|th)\b/.test(boDau(m[0]));
    if (deal === "ban" && (TRUOC_LA_THUE.test(truoc) || moiThang)) continue;
    ung.push({ s: m[1], uuTien: TRUOC_LA_GIA.test(truoc) });
  }
  return (ung.find((u) => u.uuTien) ?? ung[0])?.s ?? null;
}

/** Diện tích trong câu rao (đã bỏ dấu): "62,5m²", "70m2" → số; không có thì null. */
/**
 * Chữ đứng TRƯỚC một số m² cho biết đó là SÀN / sử dụng / xây dựng, không phải đất
 * (16/09/2026, Zalo thật: "nhà 4 tấm diện tích tổng 240m2" từng thành area_m2 = 240).
 * Dùng chung với `nhanDienFact` (fact `dien_tich_san`).
 */
export const TRUOC_LA_SAN =
  /\b(?:(?:dien tich|dt)\s*(?:san|su dung|sd|xay dung|xd)|dtsd|dtxd|san\s*(?:xay dung|su dung)?|tong\s*(?:dien tich|dt)\s*(?:san|su dung|sd|xay dung|xd))\b/;

// Chữ sàn phải đứng NGAY trước số ("diện tích sàn 240m2, đất 60m2": 60 vẫn là đất).
// 05/10/2026 (SRS-5.1zy): "Tổng diện tích sàn: 245m²" — dấu hai chấm sau nhãn từng làm 245 thành diện tích ĐẤT.
const SAN_NGAY_TRUOC = new RegExp(`(?:${TRUOC_LA_SAN.source})\\s*:?\\s*(?:la\\s*|khoang\\s*|tam\\s*)?$`);
export function dienTichCauRao(kd: string): number | null {
  const re = /(\d{1,5}(?:[.,]\d+)?)\s*m(?:2|²)(?![\d])/g;
  const coTang = /\b(?:tam|tang|lau|tret)\b/.test(kd);
  let m: RegExpExecArray | null;
  while ((m = re.exec(kd))) {
    const truoc = kd.slice(Math.max(0, m.index - 30), m.index);
    // "diện tích sàn 240m2" / "dtsd 120m2" — không phải diện tích đất (bỏ qua, xét số m² kế).
    if (SAN_NGAY_TRUOC.test(truoc)) continue;
    // "nhà 4 tấm diện tích tổng 240m2" — tổng của nhà nhiều tầng là sàn; "tổng dt đất" thì không.
    if (coTang && /\b(?:tong\s+(?:dien tich|dt)|(?:dien tich|dt)\s+tong)\s*(?:la\s*|khoang\s*|tam\s*)?$/.test(truoc) && !/\bdat\s*$/.test(truoc)) continue;
    // 29/09/2026 (kịch bản L5): "lô đất 5x25 Hóc Môn thổ cư 100m2" — số m² đứng ngay sau "thổ cư" là phần THỔ CƯ, không phải
    // diện tích đất, khi câu còn cách khác nói diện tích (ngang × dài, hoặc một số m² khác). Không có thì vẫn là diện tích
    // ("đất thổ cư 100m2" — cả lô là thổ cư).
    if (/\btho cu\s*(?:la\s*|khoang\s*|tam\s*|co\s*)?$/.test(truoc) &&
      (ngangDaiCauRao(kd) || /\d\s*m(?:2|²)/.test(kd.slice(m.index + m[0].length)))) continue;
    return Number(m[1].replace(",", "."));
  }
  return null;
}

/** "5x20", "4.2m x 18m" → ngang × dài (m²); null nếu không có. Chỉ để NHÂN giá/m². */
export function ngangNhanDai(kd: string): number | null {
  const nd = ngangDaiCauRao(kd);
  return nd ? Math.round(nd[0] * nd[1] * 10) / 10 : null;
}

/**
 * "5x20", "ngang 4 dài 15" → [ngang, dài]; null nếu không có. 29/09/2026 (kịch bản K3/K8/K9/K10): câu rao đầu "4x12" khi AI
 * im không ghi diện tích — chat-reply chỉ đọc "m2" (`dienTichCauRao`), còn ngang × dài chỉ dùng để nhân giá/m², nên bot hỏi
 * lại diện tích khách vừa nói.
 */
export function ngangDaiCauRao(kd: string): [number, number] | null {
  // 20/09/2026 (bắn thật mau-y-D): "ngang 4 dài 15, giá 250 triệu/m2" — không có "x" nên không
  // nhân được, tin mang giá "250 triệu/m2" mà price_vnd trống. Nhận cả dạng chữ ngang/dài.
  const m = /(\d{1,2}(?:[.,]\d+)?)\s*m?\s*x\s*(\d{1,3}(?:[.,]\d+)?)\s*m?(?![\d²])/.exec(kd) ??
    /\b(?:ngang|rong|mat tien|mt)\s*(?:la\s*)?(\d{1,2}(?:[.,]\d+)?)\s*(?:m|met)?\s*,?\s*(?:con\s+|va\s+)?(?:dai|sau|doc)\s*(?:la\s*)?(\d{1,3}(?:[.,]\d+)?)\s*(?:m|met)?(?![\d²])/.exec(kd);
  if (!m) return null;
  const a = Number(m[1].replace(",", ".")), b = Number(m[2].replace(",", "."));
  return a >= 1.5 && a <= 40 && b >= 3 && b <= 150 ? [a, b] : null;
}

/**
 * Phường TÊN CHỮ trong câu rao còn dấu: "phường Hiệp Bình Chánh TP Thủ Đức" → "Phường
 * Hiệp Bình Chánh". Chỉ nhận chữ VIẾT HOA đầu (tên riêng), tối đa 4 tiếng, dừng ở
 * TP / quận / dấu câu. Phường số thì chat-reply đã có `soPhuong`.
 */
/**
 * Phường tên chữ trong câu rao KHÔNG DẤU (15/09/2026, bắn thật B1: "thu duc phuong hiep
 * binh chanh gia 6ty2"): trả tên bỏ dấu ("hiep binh chanh") để chat-reply tra bảng `wards`
 * (so bỏ dấu với tên phường 2025 và các phường cũ gộp vào). Không tra được thì KHÔNG ghi —
 * chữ không dấu vào cột phường là rác. Chỉ chạy khi câu không có dấu.
 */
export function phuongTenKhongDau(kd: string): string | null {
  const m = /(?:^|[\s,(])(?:phuong|p\.)\s+([a-z]+(?:\s+[a-z]+){0,3})/.exec(kd);
  if (!m) return null;
  const tu = m[1].split(/\s+/);
  let dung = tu.findIndex((w) => /^(?:tp|thanh|quan|q|huyen|thi|tinh|gia|dt|shr|shc|so|tho|hem|hxh|duong|mat|dien|ngang|dai|ban|cho|can|nha|dat|lo|nao|may|gi)$/.test(w));
  // Tên quận/huyện hai chữ đứng ngay sau tên phường ("p. an lac binh tan").
  const QUAN_KD = /^(?:binh tan|tan binh|go vap|thu duc|phu nhuan|binh thanh|tan phu|nha be|binh chanh|hoc mon|cu chi|can gio)$/;
  // Tên phường ít nhất hai chữ nên chỉ xét từ chữ thứ ba ("hiep binh chanh" giữ nguyên).
  for (let i = 2; i < tu.length - 1; i++) if (QUAN_KD.test(`${tu[i]} ${tu[i + 1]}`) && (dung < 0 || i < dung)) { dung = i; break; }
  const ten = (dung >= 0 ? tu.slice(0, dung) : tu).join(" ");
  return ten.length >= 3 ? ten : null;
}

export function phuongTenCauRao(text: string): string | null {
  // 24/09/2026 (bắn 10 tin): "xã Phước Vĩnh An huyện Củ Chi", "thị trấn Nhà Bè" — câu rao ngoại thành nói XÃ / THỊ TRẤN,
  // bản trước chỉ nhận "phường" nên bot hỏi lại "ở xã nào" dù khách đã nói.
  const m = /(?:^|[\s,(])([Pp]hường|PHƯỜNG|[Pp]\.|[Xx]ã|XÃ|[Tt]hị\s+trấn|THỊ\s+TRẤN)\s+(\p{Lu}\p{Ll}*(?![\p{L}])(?:\s+\p{Lu}\p{Ll}*(?![\p{L}])){0,4})/u.exec(text);
  if (!m) return null;
  const tu = m[2].split(/\s+/);
  // "Thành" chỉ là chữ dừng khi là "Thành phố" — "phường Bến Thành" là tên phường.
  let dung = tu.findIndex((w, i) => /^(TP|Tp|Quận|Q|Huyện|Thị|Tỉnh)$/u.test(w) || (w === "Thành" && /^[Pp]hố$/u.test(tu[i + 1] ?? "")));
  // Tên quận / huyện dính liền không có chữ "huyện" ("xã Tân Kiên Bình Chánh") → cắt phần đuôi là tên quận / huyện.
  if (dung < 0) {
    for (let k = 2; k < tu.length; k++) {
      const duoi = boDau(tu.slice(k).join(" "));
      const q = bocQuan(`quan ${duoi}`, `quận ${tu.slice(k).join(" ")}`);
      if (q && boDau(q).replace(/^(?:quan|huyen|tp|thanh pho|thi xa)\s+/, "") === duoi) { dung = k; break; }
    }
  }
  const ten = (dung >= 0 ? tu.slice(0, dung) : tu).join(" ");
  const cap = /^x/i.test(m[1]) ? "Xã" : /^t/i.test(m[1]) ? "Thị trấn" : "Phường";
  return ten.length >= 3 ? `${cap} ${ten}` : null;
}

const CHU_CHUNG_DU_AN = /^(?:(?:khu\s+)?can ho|chung cu|cao cap|khu dan cu|kdc|du an|toa nha|khu do thi|kdt|the|so|nha pho|biet thu|shophouse)\s+/;

/**
 * Tên dự án khớp được CHỈ vì trùng TÊN ĐƯỜNG trong câu: "nhà phố quận 7 đường Huỳnh
 * Tấn Phát" khớp "Căn Hộ Cao Cấp Huỳnh Tấn Phát" → không phải dự án. Câu có chữ dự
 * án / chung cư / căn hộ thì để nguyên kết quả khớp.
 */
export function duAnLaTenDuong(tenDuAn: string | null | undefined, text: string): boolean {
  if (!tenDuAn) return false;
  const kd = boDau(text);
  if (/\b(?:du an|chung cu|can ho|toa|block|kdc|khu dan cu|khu do thi)\b/.test(kd)) return false;
  let loi = boDau(tenDuAn).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 4 && CHU_CHUNG_DU_AN.test(loi); i++) loi = loi.replace(CHU_CHUNG_DU_AN, "");
  if (loi.length < 5) return false;
  // 01/10/2026 (bắn thử bán lx-ban-293c): "đất … xã Tân Thạnh Đông Củ Chi" → gắn dự án "Khu dân cư Tân Thạnh Đông". Tên
  // dự án chỉ trùng tên XÃ / PHƯỜNG / thị trấn trong câu cũng không phải là khách nói dự án.
  return new RegExp(`\\b(?:duong|hem|hxh|mat tien|mt|pho|xa|phuong|p|thi tran|tt)\\s+(?:\\d+[a-z]?(?:\\/\\d+)*\\s+)?${loi.replace(/ /g, "\\s+")}\\b`).test(kd);
}

/**
 * Số nhà có dấu xuyệt ("105/12 Trần Bình Trọng", "hẻm 12/3A") gần như chắc là nhà trong hẻm — bot hỏi XÁC NHẬN
 * hẻm thay vì hỏi trống (25/09/2026, chủ dự án: "giờ nó biết nhà nào ở mặt tiền cái nào ở hẻm"). Chỉ số ("105 Trần
 * Bình Trọng") thì KHÔNG suy ra gì: người rao hay bỏ số hẻm, nên không bao giờ được coi đó là mặt tiền.
 */
export function laSoNhaHem(diaChi: string | null | undefined): boolean {
  const kd = boDau(diaChi ?? "");
  for (const m of kd.matchAll(/(^|[^\d/])(\d{1,4}[a-z]?)\s*\/\s*(\d{1,4}[a-z]?)(?![\d/])/g)) {
    const truoc = kd.slice(0, m.index! + m[1].length);
    // "đường 3/2", "30/4", "2/9" là TÊN ĐƯỜNG theo ngày lễ, không phải số nhà hẻm.
    if (/\b(?:duong|pho)\s*$/.test(truoc) || DUONG_NGAY_LE.has(`${m[2]}/${m[3]}`)) continue;
    // "1/2 tỷ", "12/9/2026" không phải địa chỉ.
    if (/^\s*(?:m2|m²|tr\b|trieu|ty\b|nam\b|\/)/.test(kd.slice(m.index! + m[0].length))) continue;
    return true;
  }
  return false;
}
const DUONG_NGAY_LE = new Set(["3/2", "30/4", "2/9", "19/5", "1/5", "26/3", "23/9", "3/10", "19/8", "8/3"]);

/**
 * Quy ước số nhà TP.HCM (chủ dự án 30/09/2026): "137/28 đường số 59" là HẺM 137 của đường số 59, NHÀ SỐ 28 trong
 * hẻm — số SAU dấu "/" cuối là số nhà, phần trước là hẻm. Hẻm trong hẻm ("còn nhiều hẻm nhỏ và nhỏ hơn nữa"):
 * "137/28/5" = nhà 5 trong hẻm 137/28 (hẻm nhánh 28 của hẻm 137); "12/3/4/5A" = nhà 5A, hẻm 12 → 12/3 → 12/3/4.
 * `capHem` liệt kê từ hẻm lớn (đầu đường) tới hẻm nhỏ nhất (sát nhà). Cùng bộ lọc với `laSoNhaHem` (bỏ "đường 3/2",
 * "1/2 tỷ", ngày tháng). Không phải số nhà hẻm → null.
 */
export function tachSoNhaHem(diaChi: string | null | undefined): { hem: string; soNha: string; capHem: string[] } | null {
  const kd = boDau(diaChi ?? "");
  for (const m of kd.matchAll(/(^|[^\d/])(\d{1,4}[a-z]?(?:\s*\/\s*\d{1,4}[a-z]?)+)(?![\d/])/g)) {
    const truoc = kd.slice(0, m.index! + m[1].length);
    const phan = m[2].split("/").map((x) => x.trim());
    if (/\b(?:duong|pho)\s*$/.test(truoc) || (phan.length === 2 && DUONG_NGAY_LE.has(phan.join("/")))) continue;
    if (/^\s*(?:m2|m²|tr\b|trieu|ty\b|nam\b|\/)/.test(kd.slice(m.index! + m[0].length))) continue;
    const hemPhan = phan.slice(0, -1).map((x) => x.toUpperCase());
    return {
      hem: hemPhan.join("/"),
      soNha: phan[phan.length - 1].toUpperCase(),
      capHem: hemPhan.map((_, i) => hemPhan.slice(0, i + 1).join("/")),
    };
  }
  return null;
}

/**
 * Gọt câu trả lời ĐỊA CHỈ còn đúng phần địa chỉ (30/09/2026, chat thử): "nhà ở 137/28 đường số 59 phường an hội tây gò
 * vấp" từng vào nguyên câu làm vị trí; "hẻm xe hơi nguyen van cu gần" (luật cắt dở "gần trần hưng đạo") dính chữ "gần".
 * Bỏ lời dẫn đầu ("nhà (mình/chú…) ở / tại"), cắt từ phường / quận / huyện / xã / TP trở đi (có ô riêng), bỏ chữ nối
 * cuối ("gần / góc / cạnh…") và chữ đệm ("nhé / ạ"). Còn quá ngắn thì trả nguyên.
 */
export function gotDiaChi(s: string | null | undefined): string {
  const goc = (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  let t = goc
    .replace(/^(?:(?:nhà|nha|căn|can|lô|lo|đất|dat)\s+)?(?:(?:mình|minh|chú|chu|anh|em|cô|co|bác|bac|tôi|toi|tui|cháu|chau)\s+)?(?:(?:nằm\s+)?ở|o|tại|tai)\s+/iu, "");
  const cat = /[,;(]|\s(?:phường|phuong|p\.|quận|quan|q\.|huyện|huyen|xã|thị xã|thành phố|tp\.?)(?![\p{L}])|\s[pq]\s*\d{1,2}(?!\d)/iu.exec(t);
  if (cat && cat.index >= 3) t = t.slice(0, cat.index);
  t = t.replace(/(?:\s+(?:gần|gan|góc|goc|cạnh|canh|sát|sat|giao|ngã tư|ngã ba|đối diện|doi dien|nhé|nhe|nha|ạ|á|em|anh|chị|chi))+\s*$/iu, "").trim();
  return t.length >= 3 ? t : goc;
}

/**
 * Luật bóc vị trí đọc "137/28 đường số 59" ra trơn "đường số 59" (rơi số nhà hẻm). Câu khách có số nhà hẻm đứng NGAY
 * trước vị trí đã bóc → ghép lại "137/28 đường số 59". Vị trí đã có số đó, hoặc số nằm chỗ khác → giữ nguyên.
 */
export function ghepSoNhaHem(viTri: string | null | undefined, text: string | null | undefined): string | null {
  const vt = (viTri ?? "").trim();
  if (!vt) return null;
  if (/\d\s*\/\s*\d/.test(vt)) return vt;
  const m = new RegExp(`(\\d{1,4}[a-zA-Z]?(?:\\s*\\/\\s*\\d{1,4}[a-zA-Z]?)+)[\\s,]+(?:(?:ở|o|tại|tai)\\s+)?${vt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu").exec(text ?? "");
  if (!m || !tachSoNhaHem(m[1])) return vt;
  return `${m[1].replace(/\s+/g, "")} ${vt}`;
}
