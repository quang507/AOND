// FR-164 — BẤT BIẾN: câu VỪA sửa một trường VỪA trả lời câu hỏi đang treo thì
// phải ghi CẢ HAI.
//
// Khối bắt-lời-sửa từng `return` ngay sau khi ghi fact, nên "sổ hồng rồi em, à
// giá 6.8 tỷ nha" (đang treo câu hỏi pháp lý) chỉ ghi được GIÁ: câu trả lời
// pháp lý bay mất, `info_requests` kẹt `pending`, nhịp drip sau lại hỏi đúng
// cái chủ nhà vừa trả lời.
//
// Hai chiều đều phải giữ, và chiều NGƯỢC mới là chiều dễ vá hỏng:
//   * câu vừa sửa vừa trả lời → đi tiếp xuống khối câu hỏi treo;
//   * câu CHỈ có lời sửa ("à giá 6.8 tỷ nha em") → KHÔNG được đi tiếp, vì đi
//     tiếp là nhét nguyên câu vào fact pháp lý — bằng chứng sai chỗ còn tệ hơn
//     thiếu bằng chứng, nó trông như chủ nhà đã xác nhận.
//
// ĐỒNG BỘ VỚI chat-reply/index.ts: regex + phép lọc chép từ đó (xem
// bot/tests/README.md — Node không nạp được module Deno).
const boDau = (s) =>
  s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");

function tach(text, pendingReq) {
  const suaFacts = [];
  const nhipSua = [];
  const batSua = (m, key, lay) => {
    if (!m) return;
    suaFacts.push([key, lay(m)]);
    nhipSua.push([m.index, m.index + m[0].length]);
  };
  const mGia =
    /gi[áa]\s*[^0-9]{0,12}?([\d][\d.,]*\s*(?:tỷ|tỉ|tỏi|triệu|ty|ti|toi|trieu|tr)(?![a-zA-ZÀ-ỹ])[^,.;\n]*)/i
      .exec(text);
  batSua(mGia, "gia", (m) => m[1].trim());
  batSua(/(?:phường|phuong)\s*\.?\s*(\d{1,2})\b/i.exec(text), "phuong", (m) => `Phường ${m[1]}`);
  batSua(/(\d{1,2})\s*(?:phòng ngủ|phong ngu|\bpn\b)/i.exec(text), "so_phong_ngu", (m) => m[1]);
  batSua(
    /(?:diện tích|dien tich|\bdt\b)\s*[^0-9]{0,8}?(\d{1,4}(?:[.,]\d+)?)\s*m2?/i.exec(text),
    "dien_tich", (m) => `${m[1]}m2`);

  const suaThat = suaFacts.filter(([k]) =>
    !(pendingReq &&
      (k === pendingReq.question ||
        (k === "dien_tich" && /^dien_tich/.test(pendingReq.question)))));

  const conLai = nhipSua.length
    ? nhipSua.slice().sort((a, b) => b[0] - a[0])
      .reduce((s, [i, j]) => `${s.slice(0, i)} ${s.slice(j)}`, text)
      .replace(/\s+/g, " ").replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, "").trim()
    : text;
  const conChu = boDau(conLai)
    .replace(
      /\b(a|u|o|da|vang|em|anh|chi|nha|nhe|nhen|ha|hen|ok|oke|roi|thi|ma|voi|va|do|luon)\b/gi,
      "",
    )
    .replace(/[^a-z0-9]+/gi, "");
  const vuaTraLoiVuaSua = !!pendingReq && conChu.length >= 2;
  return { suaThat, conLai, conChu, vuaTraLoiVuaSua };
}

const CA = [
  // [nhãn, câu, câu hỏi đang treo, mong đợi vuaTraLoiVuaSua, mong đợi có sửa]
  ["vừa trả lời pháp lý vừa sửa giá", "sổ hồng rồi em, à giá 6.8 tỷ nha", "phap_ly", true, true],
  ["chỉ sửa giá, có câu hỏi treo", "à giá 6.8 tỷ nha em", "phap_ly", false, true],
  ["chỉ sửa giá, không câu hỏi treo", "à giá 6.8 tỷ nha em", null, false, true],
  ["trả lời đúng trường đang hỏi", "giá 6.8 tỷ", "gia", false, false],
  ["vừa trả lời hướng vừa sửa phường", "nhà hướng nam, phường 12 nha em", "huong", true, true],
  ["chỉ trả lời, không sửa gì", "sổ hồng riêng ạ", "phap_ly", true, false],
  ["sửa hai trường cùng lúc", "à giá 6.8 tỷ, phường 12 nha", "phap_ly", false, true],
  ["vừa trả lời vừa sửa hai trường", "sổ hồng em nhé, giá 6.8 tỷ, phường 12", "phap_ly", true, true],
];

let hong = 0;
for (const [nhan, cau, q, mongVua, mongSua] of CA) {
  const r = tach(cau, q ? { question: q } : null);
  const coSua = r.suaThat.length > 0;
  const ok = r.vuaTraLoiVuaSua === mongVua && coSua === mongSua;
  if (!ok) hong++;
  console.log(
    `${ok ? "✓" : "✗"} ${nhan}\n    câu="${cau}" treo=${q}\n` +
    `    còn lại="${r.conLai}" chữ="${r.conChu}"\n` +
    `    vừa-cả-hai=${r.vuaTraLoiVuaSua} (mong ${mongVua})  sửa=${JSON.stringify(r.suaThat)} (mong có sửa=${mongSua})`,
  );
}
console.log(hong ? `\n${hong}/${CA.length} CA HỎNG` : `\nTẤT CẢ ${CA.length} CA ĐẠT`);
process.exit(hong ? 1 : 0);
