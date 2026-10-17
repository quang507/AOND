// FR-159 + FR-170 — BẤT BIẾN theo BỐN VAI người nhắn (soát 01/09/2026):
//   (1) người LẠ tự nhận có BĐS → mở hồ sơ bán; câu chào / câu mập mờ → hỏi vai
//   (2) người ĐÃ có hồ sơ bán hỏi về căn của họ → KHÔNG bị rẽ sang nhánh mua
//   (3) người hỏi tìm nhà nói giá kiểu Việt ("5 tỷ 8", "từ 5 đến 6 tỷ") → khoảng
//       giá lọc kho phải ÔM ĐƯỢC căn khách đang muốn
//   (4) (mã căn viết thường — kiểm ở tầng DB, không có ở đây)
//
// ĐỒNG BỘ VỚI chat-reply/index.ts: mọi regex dưới đây chép từ đó (xem
// bot/tests/README.md — Node không nạp được module Deno). Sửa bên kia mà quên
// bên này là test vẫn xanh trong khi hàm thật đã đổi.
const boDau = (s) =>
  s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");
const khopVoi = (text) => (coDau, khongDau) => coDau.test(text) || khongDau.test(boDau(text));

// ── hoiMua (chat-reply, cổng "người bán đang hỏi mua?") ──
const hoiMua = (text) => {
  const khop = khopVoi(text);
  return (khop(
    /(muốn|cần|đang|định|đi)\s*(mua|thu[êe]|tìm|kiếm)\b/i,
    /(muon|can|dang|dinh|di)\s*(mua|thue|tim|kiem)\b/,
  ) ||
    khop(
      /\b(tìm|kiếm|mua)\s*(nhà|căn|đất|phòng|mặt bằng|chung cư|q\s*\d|quận|phường|khu|chỗ|gần)|(?<!cho\s)thu[êe]\s*(nhà|căn|phòng|mặt bằng)/i,
      /\b(tim|kiem|mua)\s*(nha|can|dat|phong|mat bang|chung cu|q\s*\d|quan|phuong|khu|cho|gan)|(?<!cho\s)thue\s*(nha|can|phong|mat bang)/,
    ) ||
    khop(
      /(có|còn)\s*căn nào|tư vấn (mua|thu[êe])/i,
      /(co|con)\s*can nao|tu van (mua|thue)/,
    ) ||
    khop(
      /(?:^|[\s,.])mua\s+(để|qua|bên|về ở|trả góp)\b|\bkhi\s+mua\b|\bmua\s+nhà\s+bên\s+em\b/i,
      /(?:^|[\s,.])mua\s+(de|qua|ben|ve o|tra gop)\b|\bkhi\s+mua\b|\bmua\s+nha\s+ben\s+em\b/,
    ) ||
    khop(
      /(cho|xin|muốn|được|đi|qua|tới|hẹn|đặt lịch)\s*(em|anh|chị|tôi|mình)?\s*(xem|coi)\s*(nhà|căn)/i,
      /(cho|xin|muon|duoc|di|qua|toi|hen|dat lich)\s*(em|anh|chi|toi|minh)?\s*(xem|coi)\s*(nha|can)/,
    )) &&
    !khop(
      /(khách|ai|người)\s*(nào)?\s*(đã|có|tới|đến)?\s*(xem|coi|mua|thu[êe]|hỏi)/i,
      /(khach|ai|nguoi)\s*(nao)?\s*(da|co|toi|den)?\s*(xem|coi|mua|thue|hoi)/,
    );
};

// ── wantsSell + tuNhanCoBDS (chat-reply, FR-159 nửa 1/2) ──
const wantsSell = (text) => {
  const khop = khopVoi(text);
  const coChiTiet = khop(
    /[\d][\d.,]*\s*(tỷ|tỉ|ty|tỏi|triệu|tr(?![a-zA-ZÀ-ỹ]))|\d+\s*m2|hẻm|mặt tiền|phường/i,
    /[\d][\d.,]*\s*(ty|ti|toi|trieu|tr(?![a-z]))|\d+\s*m2|\bhem\b|mat tien|phuong/,
  );
  const coYDinhRao =
    khop(/(muốn|cần|đang|nhờ|ký gửi)\s+(bán|cho thu[êe])/i, /(muon|can|dang|nho|ky gui)\s+(ban|cho thue)\b/) ||
    khop(
      /(bán|rao|cho thu[êe])\s+(nhà|căn hộ|chung cư|đất|mặt bằng|phòng trọ|biệt thự|căn)/i,
      /(ban|rao|cho thue)\s+(nha|can ho|chung cu|dat|mat bang|phong tro|biet thu|can)\b/,
    );
  const laCauHoiTinhTrang = khop(
    /(chưa|sao r[oồ]i|th[eế] n[aà]o|ra sao|đư[ơợ]c không|đc ko|xong ch[uư]a)/i,
    /(chua|sao roi|the nao|ra sao|duoc khong|dc ko|xong chua)/,
  );
  return khop(/\b(bán|rao)\b|cho thu[êe]/i, /\b(ban|rao)\b|cho thue/) &&
    khop(
      /(nhà|căn hộ|chung cư|đất|mặt bằng|phòng trọ|biệt thự|căn\b)/i,
      /(nha|can ho|chung cu|dat|mat bang|phong tro|biet thu|\bcan\b)/,
    ) &&
    (coChiTiet || (coYDinhRao && !laCauHoiTinhTrang));
};
const tuNhanCoBDS = (text, dangTraLoiHoiVai = false) => {
  const khop = khopVoi(text);
  return wantsSell(text) ||
    khop(/chính chủ|ký gửi|cần rao|muốn rao|đăng tin bán|đăng bán/i, /chinh chu|ky gui|can rao|muon rao|dang tin ban|dang ban/) ||
    (!!dangTraLoiHoiVai && (
      khop(
        /(?:^|(?:tôi|em|mình|anh|chị|tui|bên mình|nhà mình|gia đình)\s*)(đang\s*)?có\s*(một\s*|1\s*)?(căn|nhà|đất|bất động sản|bđs|mặt bằng|chung cư|phòng trọ|biệt thự|lô)(?!\s*nào)/i,
        /(?:^|(?:toi|em|minh|anh|chi|tui|ben minh|nha minh|gia dinh)\s*)(dang\s*)?co\s*(mot\s*|1\s*)?(can|nha|dat|bat dong san|bds|mat bang|chung cu|phong tro|biet thu|lo)(?!\s*nao)/,
      ) ||
      khop(
        /^\s*(tôi|em|mình|anh|chị)?\s*(muốn|cần|bên|là bên)?\s*(bán|cho thu[êe]|rao)\b/i,
        /^\s*(toi|em|minh|anh|chi)?\s*(muon|can|ben|la ben)?\s*(ban|cho thue|rao)\b/,
      )
    ));
};
// ── nhãn chính chủ / môi giới gán lúc bóc tách (chat-reply, 02/09/2026) ──
const tinHieuMoiGioi = (text) => khopVoi(text)(
  /môi giới|\bsale\b|sàn (giao dịch|bđs|bất động sản)|nhân viên kinh doanh|chuyên viên (bđs|bất động sản|kinh doanh)|bán (giúp|hộ|giùm|dùm)|chủ nhà (gửi|nhờ)|khách gửi bán|hàng ký gửi/i,
  /moi gioi|\bsale\b|san (giao dich|bds|bat dong san)|nhan vien kinh doanh|chuyen vien (bds|bat dong san|kinh doanh)|ban (giup|ho|gium|dum)|chu nha (gui|nho)|khach gui ban|hang ky gui/,
);
const nhanNguoiBan = (text) => (tinHieuMoiGioi(text) ? "nmg" : "ccrb");

// Cái quyết định thật ở chat-reply là tổ hợp: mở hồ sơ bán khi tự nhận CÓ BĐS
// và KHÔNG đang hỏi mua.
const moHoSoBan = (text, dangTraLoiHoiVai = false) => tuNhanCoBDS(text, dangTraLoiHoiVai) && !hoiMua(text);

// ── budgetRangeVnd (chat-reply, SRS-3.3/5.2) ──
function budgetRangeVnd(budget) {
  if (typeof budget !== "string") return null;
  const bd = boDau(budget);
  const num = (s) => parseFloat(s.replace(",", "."));
  const TIEN =
    /(\d+(?:[.,]\d+)?)\s*(ty|ti|toi(?!\s*\d)|trieu|tr(?![a-z])|cu)(?![a-z])(?:\s*(ruoi)|\s*(\d{1,3})(?![\d.,]|\s*m))?/g;
  const doc = (m) => {
    const laTy = /^(ty|ti|toi)$/.test(m[2]);
    let v = num(m[1]) * (laTy ? 1e9 : 1e6);
    if (laTy && Number.isInteger(num(m[1]))) {
      if (m[3]) v += 0.5e9;
      else if (m[4]) v += m[4].length === 1 ? Number(m[4]) * 1e8 : Number(m[4]) * 1e6;
    }
    return v;
  };
  const cac = [];
  for (const m of bd.matchAll(TIEN)) { const v = doc(m); if (Number.isFinite(v) && v > 0) cac.push(v); }
  const chung =
    /(\d+(?:[.,]\d+)?)\s*(?:-|–|~|den|toi|hoac|hay|\s)\s*(\d+(?:[.,]\d+)?)\s*(ty|ti|toi|trieu|tr(?![a-z])|cu)(?![a-z])/.exec(bd);
  if (chung) {
    const u = /^(ty|ti|toi)$/.test(chung[3]) ? 1e9 : 1e6;
    const a = num(chung[1]) * u, b = num(chung[2]) * u;
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b >= a) return { min: Math.round(a * 0.95), max: Math.round(b * 1.1) };
  }
  if (cac.length >= 2) { const a = Math.min(cac[0], cac[1]), b = Math.max(cac[0], cac[1]); return { min: Math.round(a * 0.95), max: Math.round(b * 1.1) }; }
  if (!cac.length) return null;
  const base = cac[0];
  if (/tren|hon|\btu\b|toi thieu|it nhat/.test(bd)) return { min: Math.round(base * 0.95) };
  return { max: Math.round(base * 1.15) };
}
// "khoảng giá có ÔM được căn giá X không" — đó mới là điều khách cảm nhận.
const om = (budget, giaCan) => {
  const r = budgetRangeVnd(budget);
  if (!r) return false;
  return (r.min == null || giaCan >= r.min) && (r.max == null || giaCan <= r.max);
};

// ── regexProfileFallback: phần tiền (chat-reply) ──
const fallbackBudget = (text) => {
  const t = boDau(text);
  const money =
    /([\d][\d.,]*)\s*(ty|ti|toi(?!\s*\d)|tr(?![a-z])|trieu|cu)(?![a-z])(\s*(?:ruoi|\d{1,3}(?![\d.,]|\s*m)))?/.exec(t);
  if (!money) return null;
  const unit = /^(tr|trieu|cu)$/.test(money[2]) ? "triệu" : "tỷ";
  return `${money[1]} ${unit}${money[3] ? ` ${money[3].trim()}` : ""}`;
};

const TY = 1e9;
const CA = [
  // (2) NGƯỜI BÁN nói về căn của họ — phải Ở LẠI nhánh bán (hoiMua=false)
  ["bán: hỏi khách coi nhà",        () => hoiMua("có khách nào coi nhà chưa em?"), false],
  ["bán: hỏi ai xem nhà tôi",       () => hoiMua("hôm qua có ai xem nhà tôi không"), false],
  ["bán: muốn nhà mình lên web",    () => hoiMua("tôi muốn nhà mình lên web sớm"), false],
  ["bán: cần căn này bán nhanh",    () => hoiMua("tôi cần căn này bán nhanh"), false],
  ["bán: em đang xem nhà tôi",      () => hoiMua("em đang xem nhà tôi tới đâu rồi"), false],
  ["bán: câu rao cho thuê",         () => hoiMua("cho thuê nhà q5 giá 10tr"), false],
  ["bán: muốn cho thuê",            () => hoiMua("tôi muốn cho thuê căn này"), false],
  // (2→3) NGƯỜI BÁN thật sự hỏi mua — phải rẽ sang nhánh mua (hoiMua=true)
  ["mua: muốn mua nhà q5",          () => hoiMua("tôi muốn mua nhà q5"), true],
  ["mua: can tim nha (không dấu)",  () => hoiMua("toi can tim nha"), true],
  ["mua: còn căn nào",              () => hoiMua("còn căn nào tầm 5 tỷ ko"), true],
  ["mua: cho xem nhà",              () => hoiMua("cho xem nhà được ko"), true],
  ["mua: cho anh xem nhà",          () => hoiMua("em ơi cho anh xem nhà"), true],
  ["mua: muốn thuê nhà",            () => hoiMua("muốn thuê nhà 2pn"), true],
  ["mua: tìm nhà trần",             () => hoiMua("tìm nhà q5 tầm 5 tỷ"), true],
  ["mua: kiếm căn hộ",              () => hoiMua("kiếm căn hộ gần chợ rẫy"), true],
  // 14/09/2026 (bắn thật: hai câu này bị hỏi "mua hay bán")
  ["mua: mua để cho thuê lại",      () => hoiMua("mua để cho thuê lại, khu nào quận 5 dòng tiền tốt em"), true],
  ["mua: mua qua bên em mất phí",   () => hoiMua("mua qua bên em có mất phí gì không"), true],
  ["mua: khi mua có cần cọc",       () => hoiMua("khi mua thì cọc bao nhiêu em"), true],
  ["mua: mua de o (không dấu)",     () => hoiMua("mua de o thoi em"), true],
  ["bán: mua lại 3 năm trước",      () => hoiMua("anh mua lại căn này 3 năm trước, giờ muốn bán"), false],
  ["bán: người mua hỏi chưa",       () => hoiMua("có người mua hỏi căn của tôi chưa em"), false],
  // (1) NGƯỜI LẠ — tự nhận có BĐS → mở hồ sơ bán
  ["lạ: câu rao đầy đủ",            () => moHoSoBan("tôi muốn bán nhà q5 giá 5 tỷ"), true],
  ["lạ: câu rao không dấu",         () => moHoSoBan("ban nha quan 5 gia 5 ty"), true],
  ["lạ: 'tôi có căn nhà' KHI đang trả lời câu hỏi vai", () => moHoSoBan("tôi có căn nhà ở phường 4", true), true],
  ["lạ: 'tôi có căn nhà' KHÔNG hỏi vai → mập mờ, không mở", () => moHoSoBan("tôi có căn nhà ở Q10, giờ tìm Q5", false), false],
  ["lạ: kể hoàn cảnh có nhà + tìm nhà, dù đang hỏi vai", () => moHoSoBan("tôi có căn nhà ở Q10, giờ tìm Q5", true), false],
  ["lạ: chính chủ cần rao",         () => moHoSoBan("chính chủ cần rao căn hẻm xe hơi"), true],
  ["lạ: nhà mình ở P5 muốn bán",    () => moHoSoBan("nhà mình ở P5 muốn bán"), true],
  // (1) NGƯỜI LẠ — KHÔNG được mở hồ sơ bán (đi hỏi vai hoặc vào hàng mua)
  ["lạ: chào trơ",                  () => moHoSoBan("chào em"), false],
  ["lạ: alo em oi",                 () => moHoSoBan("alo em oi"), false],
  ["lạ: khách hỏi kho 'có nhà nào'",() => moHoSoBan("anh có nhà nào 2pn không em"), false],
  ["lạ: em có căn nào",             () => moHoSoBan("em có căn nào tầm 5 tỷ ko"), false],
  ["lạ: có nhà rồi, muốn mua thêm", () => moHoSoBan("tôi có nhà rồi, giờ muốn mua thêm căn nữa"), false],
  ["lạ: hỏi tình trạng",            () => moHoSoBan("nhà mình bán chưa em?"), false],
  ["lạ: muốn mua chính chủ",        () => moHoSoBan("muốn mua nhà chính chủ"), false],
  ["lạ trả lời vai: 'bán' trơ → mở",         () => moHoSoBan("bán", true), true],
  ["lạ trả lời vai: 'muốn bán' → mở",        () => moHoSoBan("muốn bán", true), true],
  ["lạ trả lời vai: 'có nhà' → mở",          () => moHoSoBan("có nhà", true), true],
  ["lạ trả lời vai: 'cho thuê' → mở",        () => moHoSoBan("cho thuê", true), true],
  ["lạ trả lời vai: 'mua' → không mở",       () => moHoSoBan("mua", true), false],
  ["lạ KHÔNG hỏi vai: 'bán' trơ → không mở", () => moHoSoBan("bán", false), false],
  // (1) NHÃN gán lúc bóc tách: có BĐS = chính chủ, trừ khi tự xưng môi giới
  ["nhãn: câu rao trần → chính chủ",           () => nhanNguoiBan("bán nhà q5 giá 5 tỷ"), "ccrb"],
  ["nhãn: nhà tôi muốn bán → chính chủ",       () => nhanNguoiBan("nhà tôi ở P4 muốn bán"), "ccrb"],
  ["nhãn: 'em là sale' → môi giới",            () => nhanNguoiBan("em là sale, có căn q5 cần bán"), "nmg"],
  ["nhãn: 'môi giới' không dấu → môi giới",    () => nhanNguoiBan("em lam moi gioi, ban nha q5"), "nmg"],
  ["nhãn: 'bán giúp chủ' → môi giới",          () => nhanNguoiBan("em bán giúp chủ căn hẻm xe hơi"), "nmg"],
  ["nhãn: 'hàng ký gửi' → môi giới",           () => nhanNguoiBan("hàng ký gửi của khách, bán 5 tỷ"), "nmg"],
  ["nhãn: 'bên em có khách chưa' KHÔNG phải môi giới", () => nhanNguoiBan("bên em có khách nào hỏi chưa"), "ccrb"],
  ["nhãn: 'sân thượng' không dính 'sàn'",      () => nhanNguoiBan("nhà có sân thượng, bán 6 tỷ"), "ccrb"],
  ["nhãn: 'chuyên viên tư vấn' (bot) không dính", () => nhanNguoiBan("em là chuyên viên tư vấn hả"), "ccrb"],
  // (3) NGƯỜI MUA nói giá — khoảng lọc phải ÔM căn khách muốn
  ["giá: '5 tỷ 8' ôm căn 5,8 tỷ",   () => om("5 tỷ 8", 5.8 * TY), true],
  ["giá: '5tỷ8' ôm 5,8 tỷ",         () => om("tầm 5tỷ8", 5.8 * TY), true],
  ["giá: '5 tỷ rưỡi' ôm 5,5 tỷ",    () => om("5 tỷ rưỡi", 5.5 * TY), true],
  ["giá: '5 tỷ 200' ôm 5,2 tỷ",     () => om("5 tỷ 200", 5.2 * TY), true],
  ["giá: 'từ 5 đến 6 tỷ' ôm 5,2",   () => om("từ 5 đến 6 tỷ", 5.2 * TY), true],
  ["giá: 'từ 5 đến 6 tỷ' ôm 6,0",   () => om("từ 5 đến 6 tỷ", 6.0 * TY), true],
  ["giá: '5 tới 6 tỷ' ôm 5,5",      () => om("5 tới 6 tỷ", 5.5 * TY), true],
  ["giá: '5 tới 6 tỷ' KHÔNG ôm 8",  () => om("5 tới 6 tỷ", 8 * TY), false],
  ["giá: '5-6 tỷ' ôm 6",            () => om("5-6 tỷ", 6 * TY), true],
  ["giá: 'khoảng 5 6 tỷ' ôm 5,5",   () => om("khoảng 5 6 tỷ", 5.5 * TY), true],
  ["giá: '5 tỷ đến 6 tỷ' ôm 5,9",   () => om("5 tỷ đến 6 tỷ", 5.9 * TY), true],
  ["giá: 'tầm 5 tỷ' ôm 5",          () => om("tầm 5 tỷ", 5 * TY), true],
  ["giá: 'trên 4 tỷ' ôm 9",         () => om("trên 4 tỷ", 9 * TY), true],
  ["giá: 'trên 4 tỷ' KHÔNG ôm 3",   () => om("trên 4 tỷ", 3 * TY), false],
  ["giá: '800 triệu' ôm 800tr",     () => om("800 triệu", 800e6), true],
  ["giá: '5,5 tỷ' ôm 5,5",          () => om("5,5 tỷ", 5.5 * TY), true],
  ["giá: '5 tỏi' (lóng) ôm 5",      () => om("5 tỏi", 5 * TY), true],
  ["giá: '50m2 5 tỷ' không nhầm m2",() => om("nhà 50m2 tầm 5 tỷ", 5 * TY), true],
  // (3) fallback khi model hỏng: giữ phần lẻ
  ["fallback: '5 ty 8' giữ '8'",    () => fallbackBudget("tam 5 ty 8"), "5 tỷ 8"],
  ["fallback: '5 toi 6 ty' ≠ 5 tỏi",() => fallbackBudget("5 toi 6 ty"), "6 tỷ"],
  ["fallback: 'ruoi'",              () => fallbackBudget("5 ty ruoi"), "5 tỷ ruoi"],
];

let hong = 0;
for (const [nhan, chay, mong] of CA) {
  let ket;
  try { ket = chay(); } catch (e) { ket = `LỖI: ${e.message}`; }
  const ok = ket === mong;
  if (!ok) hong++;
  console.log(`${ok ? "✓" : "✗"} ${nhan}${ok ? "" : `  → ra ${JSON.stringify(ket)}, mong ${JSON.stringify(mong)}`}`);
}
console.log(hong ? `\n${hong}/${CA.length} CA HỎNG` : `\nTẤT CẢ ${CA.length} CA ĐẠT`);
process.exit(hong ? 1 : 0);
