// FR-161 — BẤT BIẾN: câu gõ LẪN dấu vẫn phải nhận ra là câu rao / câu hỏi mua.
//
// Bản cũ dò một cờ "câu này có dấu không" (bật khi câu chứa BẤT KỲ ký tự có dấu
// nào) rồi chọn MỘT bộ regex theo cờ đó. "ban nha q5 giá 5 ty" có đúng một chữ
// có dấu nên bị dồn vào bộ CÓ DẤU, "ban"/"nha" không khớp "bán"/"nhà", và câu
// rao rơi IM LẶNG. Bản mới thử cả hai bộ rồi lấy hợp (`khop`).
//
// Test giữ lại CẢ HAI cách tính để mỗi lần chạy còn nhìn thấy bản cũ sai ở đâu
// — mất cột đó là mất luôn lý do bất biến này tồn tại.
//
// ĐỒNG BỘ VỚI chat-reply/index.ts: mọi regex dưới đây chép từ đó (xem
// bot/tests/README.md — Node không nạp được module Deno).
const boDau = (s) =>
  s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");
const CO_DAU_RE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

const R = {
  banRao:   [/\b(bán|rao)\b|cho thu[êe]/i, /\b(ban|rao)\b|cho thue/],
  loaiNha:  [/(nhà|căn hộ|chung cư|đất|mặt bằng|phòng trọ|biệt thự|căn\b)/i,
             /(nha|can ho|chung cu|dat|mat bang|phong tro|biet thu|\bcan\b)/],
  chiTiet:  [/[\d][\d.,]*\s*(tỷ|tỉ|ty|tỏi|triệu|tr(?![a-zA-ZÀ-ỹ]))|\d+\s*m2|hẻm|mặt tiền|phường/i,
             /[\d][\d.,]*\s*(ty|ti|toi|trieu|tr(?![a-z]))|\d+\s*m2|\bhem\b|mat tien|phuong/],
  // hoiMua siết lại 01/09 (FR-170 a): động từ phải là mua/thuê/tìm/kiếm, không
  // nhận danh từ làm tân ngữ. Bộ đầy đủ (kèm vế phủ định "khách/ai xem") nằm ở
  // fr159-bon-vai.mjs; ở đây chỉ giữ hai vế đủ cho các ca FR-161.
  muaA:     [/(muốn|cần|đang|định|đi)\s*(mua|thu[êe]|tìm|kiếm)\b/i,
             /(muon|can|dang|dinh|di)\s*(mua|thue|tim|kiem)\b/],
  muaB:     [/(có|còn)\s*căn nào|tư vấn (mua|thu[êe])/i,
             /(co|con)\s*can nao|tu van (mua|thue)/],
};

function danhGia(text) {
  const tKD = boDau(text);
  const coDau = CO_DAU_RE.test(text);
  const cu = (k) => (coDau ? R[k][0].test(text) : R[k][1].test(tKD));
  const moi = (k) => R[k][0].test(text) || R[k][1].test(tKD);
  return {
    cu:  { wantsSell: cu("banRao") && cu("loaiNha") && cu("chiTiet"),
           hoiMua: cu("muaA") || cu("muaB") },
    moi: { wantsSell: moi("banRao") && moi("loaiNha") && moi("chiTiet"),
           hoiMua: moi("muaA") || moi("muaB") },
  };
}

const CA = [
  ["rao gõ lẫn dấu (ca review báo)", "ban nha q5 giá 5 ty", "wantsSell", true],
  ["rao gõ đủ dấu",                  "bán nhà quận 5 giá 5 tỷ", "wantsSell", true],
  ["rao gõ không dấu hoàn toàn",     "ban nha quan 5 gia 5 ty", "wantsSell", true],
  ["hỏi mua gõ lẫn dấu",             "toi muon mua nha q5, giá tốt ko", "hoiMua", true],
  ["hỏi mua gõ đủ dấu",              "tôi muốn mua nhà quận 5", "hoiMua", true],
  ["hỏi mua không dấu",              "toi muon mua nha quan 5", "hoiMua", true],
  ["câu hỏi tình trạng, KHÔNG phải rao", "nhà mình bán chưa em?", "wantsSell", false],
  ["chào hỏi trơ, không phải rao",   "alo em oi", "wantsSell", false],
  ["chào hỏi trơ, không phải hỏi mua", "alo em oi", "hoiMua", false],
];

let hong = 0;
for (const [nhan, cau, truong, mong] of CA) {
  const r = danhGia(cau);
  const ok = r.moi[truong] === mong;
  if (!ok) hong++;
  const doi = r.cu[truong] !== r.moi[truong] ? "  ← BẢN CŨ SAI, ĐÃ VÁ" : "";
  console.log(
    `${ok ? "✓" : "✗"} ${nhan}\n    "${cau}" · ${truong}: cũ=${r.cu[truong]} mới=${r.moi[truong]} (mong ${mong})${doi}`,
  );
}
console.log(hong ? `\n${hong}/${CA.length} CA HỎNG` : `\nTẤT CẢ ${CA.length} CA ĐẠT`);
process.exit(hong ? 1 : 0);
