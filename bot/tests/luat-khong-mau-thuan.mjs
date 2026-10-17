#!/usr/bin/env bun
// luat-khong-mau-thuan.mjs — SRS-5.1zzzzj (09/10/2026). Chủ dự án: "luật nhỏ chỗ này chỗ kia thì được, nhưng CẢ BỘ luật không được
// mâu thuẫn nhau". Mỗi trường / mỗi đầu ra có MỘT chủ; luật khác chạm cùng chỗ phải nhường. Bài tĩnh + thuần (không mạng, không DB)
// đỏ khi hai luật kéo một chỗ về hai phía:
//   (1) Câu lệnh giọng dạy model điều lượt soát nhận xét (kiem-khen.ts) sẽ bỏ — ví dụ ĐÚNG có "khách chuộng / dễ bán / bán nhanh…".
//   (2) Ví dụ ĐÚNG trong câu lệnh nói CON SỐ phí — con số phí chỉ do `cauPhi(vaiPhi(…))` nói (prompts.ts).
//   (3) Lưới chặn phí và lưới bỏ nhận xét KHÔNG BAO GIỜ bỏ câu hỏi — câu hỏi là của `damBaoCauHoi` (không lưới nào được tháo nó).
//   (4) Chữ in (gạch dài / gạch chéo): TONE_RULES cấm, đường ra luôn chuẩn — không được gài lại theo `luat_loi_bot` (cấm mà không
//       chặn = hai chủ: prompt nói một đằng, đầu ra đi một nẻo).
//   (5) Cột phường: cửa chuẩn hoá (tenPhuongCot) và chặn lần cuối của DB (chuan_hoa_phuong, 20261009b) cùng một tập tên — chặn DB
//       không bao giờ xoá một giá trị cửa đã nhận (đo ở ghi-phuong-mot-cua.mjs: mọi đầu ra của cửa thuộc bảng wards).
//   (6) Hiển thị địa chỉ: ô nguyên văn (O_NGUYEN_VAN, kiem-bang-chung.ts) là chủ của chữ LƯU; `duongHienThi` là chủ của chữ IN — bản in
//       không bao giờ mang đuôi phường / quận chữ khách (phần đó chỉ từ cột chuẩn).
//   (9) Lời ghi nhận ("em ghi …"): chủ là sổ ghi của lượt (`ghiLuot`) → dòng EM VỪA GHI của câu lệnh; ví dụ giọng không dạy ngược lại.
//  (10) Bong bóng 🤖 "Đã trích xuất "<nguyên mẫu>" → làm chuẩn "<chuẩn>"" (SRS-5.1zzzzn): chủ chữ in là bao_lai.ts (`dongTrichXuat`);
//       phần làm chuẩn đi qua đúng bộ in một nguồn của ô (donViGiaDep, duongHienThi, phường + quận cũ); chat-reply không tự ghép;
//       nguyên mẫu (chữ khách gõ) chỉ đứng trước "→ làm chuẩn" — đó là chỗ duy nhất bất biến ĐỊA CHỈ (6) cho phép chữ thô.
//  (11) SRS-5.1zzzzo — câu hỏi kế có MỘT chủ: dòng CẦN HỎI một ý (ô đã mở); không câu lệnh nào đưa model HAI mục thiếu (chỉ địa chỉ được gộp
//       đường + phường, do câu lệnh nói). "Giá trị có đổi không" có MỘT chủ (`giaTriKhongDoi`): lượt chốt tin và sổ ghi của lượt cùng
//       hỏi nó. Con số phí khi khách tự nói vai vẫn chỉ do `cauPhi(vaiPhi(…))`.
import { readFileSync } from "node:fs";
import { SELLER_FEWSHOT, BUYER_FEWSHOT, SELLER_SCRIPT_RULES, TONE_RULES, cauPhi, phanTramPhi, vaiPhi } from "../supabase/functions/_shared/prompts.ts";
import { boCauNhanXet, chanPhiChuaXacNhan } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { duongHienThi } from "../supabase/functions/_shared/extraction/hien-thi-dia-chi.ts";
import { giaTriKhongDoi, vaiTuCau } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";
import { donViGiaDep } from "../supabase/functions/_shared/extraction/luat-tien.ts";
import { dongTrichXuat, lamChuanFact, phuongKemQuanCu, vuaLuuBan } from "../supabase/functions/_shared/bao_lai.ts";

let hong = 0;
const ok = (n, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${n}${dk ? "" : `\n    → ${ct}`}`); if (!dk) hong++; };

// (1) + (2): chỉ đọc câu ĐÁP trong phần ví dụ ĐÚNG (sau "→", trước "Ví dụ giọng SAI").
const viDuDung = (s) => s.split(/Ví dụ giọng SAI|Ví dụ SAI/)[0].split("\n").filter((d) => /→/.test(d)).map((d) => d.slice(d.indexOf("→") + 1));
const DOAN_NGUOI_MUA = /khách[^.?!]{0,20}chuộng|dễ bán|bán nhanh|đắt khách|thanh khoản\s+(?:rất\s+)?cao|nhiều người tìm/iu;
const sai1 = viDuDung(SELLER_FEWSHOT).filter((d) => DOAN_NGUOI_MUA.test(d));
ok("(1) ví dụ ĐÚNG của người bán không dạy lời đoán người mua / khả năng bán (kiem-khen bỏ câu đó)", sai1.length === 0, sai1.join(" | "));
// SRS-5.1zzzzzc: kiem-khen bỏ cả lời GẮN THÊM lợi ích (kieu loi_ich) — câu lệnh giọng phải dạy cùng một điều: TONE_RULES cấm gắn lợi ích,
// ví dụ ĐÚNG không có câu gắn lợi ích ("đi lại tiện", "giấy tờ gọn", "ở tiện") — trước đây chính ví dụ dạy hai câu đó.
const khen = TONE_RULES.match(/Không gắn thêm lợi ích[^\n]*/u)?.[0] ?? "";
ok("(1) TONE_RULES cấm gắn thêm lợi ích / tính chất cho căn (cùng luật với kiem-khen bỏ loi_ich)", !!khen && /đi lại tiện/.test(khen), khen.slice(0, 200));
const loiIch = viDuDung(SELLER_FEWSHOT).filter((d) => /đi lại tiện|giấy tờ gọn|ở tiện|kết cấu chắc/iu.test(d));
ok("(1) ví dụ ĐÚNG của người bán không dạy câu gắn lợi ích", loiIch.length === 0, loiIch.join(" | "));
const sai2 = [...viDuDung(SELLER_FEWSHOT), ...viDuDung(BUYER_FEWSHOT)].filter((d) => /\d\s*%/.test(d) && /phí/iu.test(d));
ok("(2) ví dụ ĐÚNG không nói con số phí (chủ của con số phí là cauPhi(vaiPhi(…)))", sai2.length === 0, sai2.join(" | "));

// (3) không lưới nào tháo câu hỏi.
const loi = ["Dạ phí bên em 1% giá chốt ạ. Phí 1% vậy được không anh? Nhà mình mấy tầng ạ?"];
const ra = chanPhiChuaXacNhan(loi, null, cauPhi("unknown", "ban"));
ok("(3) chanPhiChuaXacNhan: thay câu khẳng định có % bằng câu cauPhi, GIỮ nguyên mọi câu hỏi",
  /mấy tầng ạ\?/.test(ra.join(" ")) && /Phí 1% vậy được không anh\?/.test(ra.join(" ")) && /chính chủ đăng bán là 1% giá chốt, môi giới là 0,5% giá chốt/.test(ra.join(" ")) /* SRS-5.1zzzzzp: câu chưa rõ vai nêu cả hai mức */ && !/em 1% giá chốt ạ\./.test(ra.join(" ")),
  JSON.stringify(ra));
const nx = boCauNhanXet("Dạ hẻm xe hơi là khách chuộng lắm anh. Nhà mình mấy tầng ạ?", ["hẻm xe hơi là khách chuộng lắm anh"]);
ok("(3) boCauNhanXet bỏ lời đoán người mua, GIỮ câu hỏi", nx === "Nhà mình mấy tầng ạ?" || /^Nhà mình mấy tầng ạ\?$/.test(nx ?? ""), String(nx));
// (2') vai đã xác nhận, số đúng → lưới không đụng; số sai → thay.
ok("(2') vai ccrb đã xác nhận nói 1% → giữ; nói 0,5% → thay bằng câu cauPhi(ccrb)",
  chanPhiChuaXacNhan(["Dạ phí 1% giá chốt ạ."], phanTramPhi(vaiPhi({ seller_type: "ccrb", seller_type_source: "tu_nhan" }), "ban"), "x")[0] === "Dạ phí 1% giá chốt ạ."
    && /1% giá chốt/.test(chanPhiChuaXacNhan(["Dạ phí 0,5% giá chốt ạ."], "1", cauPhi("ccrb", "ban"))[0]));
ok("(2') nhãn ĐOÁN (suy_doan) không được nói số; admin / tu_nhan được",
  vaiPhi({ seller_type: "ccrb" }) === "unknown" && vaiPhi({ seller_type: "nmg", seller_type_source: "suy_doan" }) === "unknown"
    && vaiPhi({ seller_type: "nmg", seller_type_source: "admin" }) === "nmg" && phanTramPhi("ccrb", "cho_thue") === null);

// (4) chữ in luôn chuẩn ở đường ra (không gài theo luat_loi_bot).
const cr = readFileSync(new URL("../supabase/functions/chat-reply/index.ts", import.meta.url), "utf8");
const gai = cr.split("\n").filter((d) => /\b(?:boGachDai|boGachCheo)\b/.test(d) && /\b(?:luatDu|luatDuMua|luatDuR2)\b/.test(d));
ok("(4) boGachDai / boGachCheo không gài theo luat_loi_bot (TONE_RULES cấm hai thứ đó — đường ra phải giữ đúng điều đó)", gai.length === 0, gai.join("\n      "));
ok("(4) TONE_RULES vẫn cấm gạch dài và 'anh/chị' (lưới chỉ giữ điều prompt nói)", /không gạch dài/.test(TONE_RULES) && /không viết "anh\/chị"/.test(TONE_RULES));

// (6) bản in địa chỉ không mang đuôi hành chính chữ khách.
const dc = ["Võ Văn Tần phường 6 quận 3 cũ", "duong pham van chieu p14 go vap", "hxh Nguyễn Trãi p3 q5", "12 Lê Lợi, P.Bến Thành, Q1", "o q10"]
  .map((x) => [x, duongHienThi(x)]).filter(([, y]) => /\b(?:phường|phuong|quận|quan|p\.?\s*\d|q\.?\s*\d|go vap)\b/iu.test(y));
ok("(6) duongHienThi không in lại phường / quận chữ khách (chủ của phần đó là cột chuẩn)", dc.length === 0, JSON.stringify(dc));

// (7) SRS-5.1zzzzk — vai TỰ NÓI: câu lệnh AI (boc-rao.ts, mục VAI) và bộ kiểm trích dẫn `vaiTuCau` nói cùng một điều. Cụm câu lệnh nêu
//     là "gọi tên vai" thì bộ kiểm nhận; cụm câu lệnh nêu là "KHÔNG nói vai" thì bộ kiểm không nhận (production 09/10: «bán lô đất»).
const bocRao = readFileSync(new URL("../supabase/functions/_shared/ai/boc-rao.ts", import.meta.url), "utf8");
const doanVai = bocRao.slice(bocRao.indexOf('VAI ("vai")'), bocRao.indexOf("KHÁCH HỎI LẠI"));
const goiTen = [...doanVai.split("Có nhà")[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((x) => x !== "vai");
const khongGoi = [...(doanVai.split("Có nhà")[1] ?? "").split("KHÔNG nói vai")[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
ok("(7) mục VAI của câu lệnh AI có cả cụm gọi tên vai và cụm KHÔNG nói vai", goiTen.length >= 4 && khongGoi.length >= 2, JSON.stringify({ goiTen, khongGoi }));
ok("(7) mọi cụm câu lệnh nêu là GỌI TÊN vai → vaiTuCau nhận", goiTen.every((x) => vaiTuCau(x) !== null), JSON.stringify(goiTen.map((x) => [x, vaiTuCau(x)])));
ok("(7) mọi cụm câu lệnh nêu là KHÔNG nói vai (và 'sổ hồng chính chủ') → vaiTuCau không nhận", [...khongGoi, "sổ hồng chính chủ"].every((x) => vaiTuCau(x) === null),
  JSON.stringify(khongGoi.map((x) => [x, vaiTuCau(x)])));
// (8) SRS-5.1zzzzk — trạng thái tin: chủ là lưới ở đường ra (đối chiếu DB). Câu lệnh r1 không được nói "đã tạo tin" như thể đã đăng.
ok("(8) câu lệnh r1 (câu rao đầu) nói rõ tin là NHÁP, CHƯA đăng", /Em đã ghi tin NHÁP — CHƯA đăng/.test(cr) && !/Em đã tạo tin\. \$\{hoiRaoPrompt\}/.test(cr));
ok("(8) không còn lưới trạng thái riêng ở r1 / r2 (một chủ: traLoiSeller)", (cr.match(/= boHuaDaDang\(/g) ?? []).length === 1, String((cr.match(/= boHuaDaDang\(/g) ?? []).length));

// (9) SRS-5.1zzzzm — lời GHI NHẬN có MỘT chủ: sổ ghi của lượt (`ghiLuot` trong chat-reply) → dòng EM VỪA GHI / KHÔNG ghi thêm của câu
//     lệnh. Câu lệnh giọng không được dạy ngược lại: ví dụ ĐÚNG nói "em ghi" phải là ví dụ có [vừa ghi: …]; ví dụ [không ghi gì mới]
//     không được có "em ghi"; TONE_RULES không giữ khuôn "Dạ em ghi rồi ạ" làm câu ĐÚNG; câu lệnh r2 không còn lời dặn ghi nhận vô điều kiện;
//     câu mẫu khi model chết chỉ mở "Dạ em ghi rồi ạ" khi sổ ghi của lượt có gì.
const dongDung = SELLER_FEWSHOT.split(/Ví dụ giọng SAI/)[0].split("\n").filter((d) => /→/.test(d));
const ghiSai = dongDung.filter((d) => /em ghi|em lưu/iu.test(d.slice(d.indexOf("→"))) && !/\[vừa ghi:/u.test(d));
ok("(9) ví dụ ĐÚNG có 'em ghi' chỉ khi lượt đó có [vừa ghi: …]", ghiSai.length === 0, ghiSai.join(" | "));
const khongGhi = dongDung.filter((d) => /\[không ghi gì mới/u.test(d) && /em ghi|em lưu|ghi nhận/iu.test(d.slice(d.indexOf("→"))));
ok("(9) ví dụ [không ghi gì mới] không ghi nhận", khongGhi.length === 0, khongGhi.join(" | "));
ok("(9) có ít nhất một ví dụ ĐÚNG [không ghi gì mới] và một ví dụ SAI ghi nhận lại điều lượt trước",
  dongDung.some((d) => /\[không ghi gì mới/u.test(d)) && /Ví dụ giọng SAI[\s\S]*\[không ghi gì mới\][^\n]*em ghi/u.test(SELLER_FEWSHOT));
ok("(9) TONE_RULES không giữ khuôn 'Dạ em ghi rồi ạ' làm câu ĐÚNG, và nói 'em ghi' chỉ cho điều lượt NÀY vừa ghi",
  !/ĐÚNG: "Dạ em ghi rồi ạ/u.test(TONE_RULES) && /lượt NÀY vừa ghi/u.test(TONE_RULES));
const r2 = cr.slice(cr.indexOf("const prompt = nextKey"), cr.indexOf("// OPEN-30: model hỏng thì hỏi bằng câu mẫu tất định"));
ok("(9) câu lệnh r2 mang dòng sổ ghi (`vuaGhiR2`) ở cả ba nhánh hỏi, không còn 'ghi nhận vài chữ' vô điều kiện",
  (r2.match(/vuaGhiR2/g) ?? []).length >= 3 && !/ghi nhận vài chữ rồi hỏi/.test(r2), r2.slice(0, 300));
const moDauGhi = cr.split("\n").filter((d) => d.includes('"Dạ em ghi rồi ạ. "'));
ok("(9) câu mẫu 'Dạ em ghi rồi ạ.' (model chết) chỉ khi sổ ghi của lượt có gì (`coGhiLuot`)", moDauGhi.length > 0 && moDauGhi.every((d) => /coGhiLuot/.test(d)), moDauGhi.join("\n"));
ok("(9) mọi chỗ ghi fact trong chat-reply đi qua hàm bọc ghi sổ (không gọi thẳng ghiFactMotCua ngoài hàm bọc)",
  (cr.match(/ghiFactMotCua\(/g) ?? []).length === 1, String((cr.match(/ghiFactMotCua\(/g) ?? []).length));

// (10) SRS-5.1zzzzn — 🤖 một chủ chữ in.
const lamChuanSai = [["gia", "9 ty 5", donViGiaDep("9 ty 5")], ["gia", "7ty2", donViGiaDep("7ty2")], ["vi_tri", "duong pham van chieu p14 go vap", duongHienThi("duong pham van chieu p14 go vap")],
  ["phuong", "Phường Phú Định", phuongKemQuanCu("Phường Phú Định")]].filter(([q, v, mong]) => lamChuanFact(q, v) !== mong);
ok("(10) phần LÀM CHUẨN của 🤖 = đúng bộ in một nguồn của ô (donViGiaDep / duongHienThi / phuongKemQuanCu)", lamChuanSai.length === 0, JSON.stringify(lamChuanSai));
const tuGhep = cr.split("\n").filter((d) => !/^\s*\/\//.test(d) && /làm chuẩn|Đã trích xuất|Bóc tách (?:được|ảnh)|\(\$\{[^}]*quan_cu\} cũ\)/.test(d));
ok("(10) chat-reply không tự ghép chữ 🤖 ('làm chuẩn', 'Đã trích xuất', '(… cũ)') — mọi dòng do bao_lai.ts dựng", tuGhep.length === 0, tuGhep.join("\n      "));
const dTho = dongTrichXuat("địa chỉ", "duong pham van chieu p14 go vap", "Đường Phạm Văn Chiêu, Phường An Hội Tây, Quận Gò Vấp");
ok("(10) nguyên mẫu (chữ thô) chỉ đứng ngay trước '→ làm chuẩn' — đúng chỗ bất biến ĐỊA CHỈ của e2e cho qua",
  /^• địa chỉ: "duong pham van chieu p14 go vap" → làm chuẩn "Đường Phạm Văn Chiêu, Phường An Hội Tây, Quận Gò Vấp"$/.test(dTho), dTho);
const vSdt = vuaLuuBan([{ question: "bo_sung", answer: "gọi 0903123456" }], {}, { tin: "gọi 0903123456 nha" }) ?? "";
ok("(10) nguyên mẫu đi qua luật che liên hệ một nguồn (thayLienHe) — không SĐT nào lọt ra 🤖", !/\d{6}/.test(vSdt), vSdt);

// (11) SRS-5.1zzzzo — một câu hỏi một ý; "không đổi" một chủ.
ok("(11) không câu lệnh người bán nào đưa model nhiều mục thiếu để hỏi ('còn thiếu (theo thứ tự ưu tiên)', `thieuDiem.slice(0, 2)`)",
  !/còn thiếu \(theo thứ tự ưu tiên\)/.test(cr) && !/thieuDiem\.slice\(0,\s*[2-9]\)/.test(cr));
ok("(11) nhánh hết câu trước bản nháp (r2) hỏi đúng ô vừa mở — `nextKey = het.khoaMo` như nhánh câu rao (`firstKey = het.khoaMo`)",
  /nextKey = het\.khoaMo/.test(cr) && /firstKey = het\.khoaMo/.test(cr));
ok("(11) câu lệnh người bán: chỉ ĐỊA CHỈ được gộp hai ý; còn lại không gắn thêm ý vào câu hỏi",
  /riêng địa chỉ được gộp hai ý/u.test(SELLER_SCRIPT_RULES) && /không gắn thêm ý vào câu hỏi/u.test(SELLER_SCRIPT_RULES));
// SRS-5.1zzzzz: thêm chỗ thứ ba — lời sửa (`batSua`) kể lại đúng giá trị đang có thì không ghi, không báo "đã sửa".
ok("(11) lượt chốt tin, sổ ghi của lượt và lời sửa cùng hỏi MỘT chủ `giaTriKhongDoi` (không tự so riêng)",
  (cr.match(/giaTriKhongDoi\(/g) ?? []).length === 3 && /doi: !truoc \|\| !giaTriKhongDoi\(/.test(cr) && /if \(truoc && giaTriKhongDoi\(k, v,/.test(cr));
ok("(11) giá trị câu rao nằm ở CỘT (không fact) là 'không đổi' — phường / giá / '4x15' / '3 lầu' ≡ '4 tầng'",
  ["phuong|Phường Phú Nhuận", "gia|9 tỷ 5", "dien_tich|4x15", "ket_cau|3 lầu", "ket_cau|4 tầng"].every((x) => {
    const [q, v] = x.split("|");
    return giaTriKhongDoi(q, v, { ward: "Phường Phú Nhuận", district: "Quận Phú Nhuận", price_vnd: 9.5e9, area_m2: 60, frontage_m: 4, length_m: 15, floors: 4 }, {});
  }) && !giaTriKhongDoi("gia", "9 tỷ 8", { price_vnd: 9.5e9 }, {}));
const phiVai = cr.split("\n").filter((d) => /const dapPhiRoVai|\? `Dạ vậy \$\{cauPhi\(/.test(d));
ok("(11) bong bóng phí sau khi khách tự nói vai đi qua `cauPhi(vaiPhi…)` — không chuỗi % viết tay",
  phiVai.some((d) => /cauPhi\(vaiPhiLuot/.test(d)) && !phiVai.some((d) => /\d\s*%/.test(d)), phiVai.join("\n"));

// (12) SRS-5.1zzzzr — lời hứa tự kiểm: lưới `boHuaTuKiemTra` (luôn bật, r2 + r3) bỏ câu "để em kiểm tra … rồi báo lại". Câu lệnh giọng và
//      kịch bản người bán KHÔNG được dạy model chính câu đó (bản trước TONE_RULES dạy "kiểm tra rồi báo lại ạ", SELLER_SCRIPT_RULES dạy
//      "em kiểm tra giá giao dịch gần đây rồi báo lại" — prompt dạy, lưới cắt, thu-thuong11 lọt ở r3 nơi lưới chưa chạy).
{
  const { boHuaTuKiemTra } = await import("../supabase/functions/_shared/extraction/van-tra-loi.ts");
  const cacCau = [...`${TONE_RULES}\n${SELLER_SCRIPT_RULES}`.matchAll(/"([^"]{6,160})"/g)].map((m) => m[1]);
  const day = cacCau.filter((c) => boHuaTuKiemTra(c, null) !== c);
  ok("(12) câu lệnh không dạy câu hứa tự kiểm mà lưới boHuaTuKiemTra sẽ bỏ", day.length === 0, JSON.stringify(day));
  ok("(12) lưới bỏ ca gốc thu-thuong11", boHuaTuKiemTra("Vâng ạ. Để em kiểm tra giá giao dịch khu Phú Hòa Đông gần đây rồi báo lại chị nhé.", null) === "Vâng ạ.");
}

// (13) SRS-5.1zzzzt — câu hỏi diện tích theo loại: ví dụ mẫu chỉ có nhà ("diện tích → ngang dài") dạy model hỏi căn hộ "ngang dài
//      bao nhiêu" (thu-thuong16). Ý CẦN HỎI của căn hộ nói rõ m², và few-shot có một ca căn hộ hỏi m² không có "ngang dài".
{
  const { FACT_LABELS, nhanTheoLoai } = await import("../supabase/functions/_shared/prompts.ts");
  ok("(13) nhãn ý diện tích tim tường (tới model ở dòng CẦN HỎI) nói căn hộ không hỏi ngang dài",
    /không hỏi ngang dài/.test(nhanTheoLoai("dien_tich_tim_tuong", "chung_cu")), FACT_LABELS.dien_tich_tim_tuong);
  const caCanHo = SELLER_FEWSHOT.split("\n").filter((d) => /diện tích tim tường/.test(d));
  ok("(13) few-shot có ca căn hộ hỏi diện tích bằng m², lời mẫu không có 'ngang dài'",
    caCanHo.length > 0 && caCanHo.every((d) => /m²/.test(d.split("→")[1] ?? "") && !/ngang dài/.test(d.split("→")[1]?.split("(")[0] ?? "")), caCanHo.join("\n"));
}
// (14) SRS-5.1zzzzt — "đủ rồi em" (không kèm "đăng") ngay sau câu bot hỏi là ý THÔI HỎI (du_roi): câu lệnh bóc tách gọi tên nó, không
//      chỉ có mẫu "đủ rồi em, đăng đi" (thu-thuong16: AI đọc binh_thuong, bot hỏi tiếp phường).
{
  const br = readFileSync(new URL("../supabase/functions/_shared/ai/boc-rao.ts", import.meta.url), "utf8");
  ok("(14) câu lệnh bóc tách coi 'đủ rồi em' đứng một mình là du_roi", /THÔI HỎI[^\n]*"đủ rồi em"[\s\S]{0,200}du_roi/.test(br));
}

// (15) SRS-5.1zzzzu — chủ nhà hỏi vặn "sao chị biết em không lừa" (thu-cmp45-3: AI đọc binh_thuong, model trấn an bằng "tin đã được kiểm
//      duyệt"): câu lệnh bóc tách gọi tên kiểu hỏi vặn là nghi_ngo; luật giọng dặn đáp bằng điều có thật, không nói "kiểm duyệt" / "lên sàn".
{
  const br = readFileSync(new URL("../supabase/functions/_shared/ai/boc-rao.ts", import.meta.url), "utf8");
  const pr = readFileSync(new URL("../supabase/functions/_shared/prompts.ts", import.meta.url), "utf8");
  ok("(15a) cam_xuc: 'sao chị biết em không lừa' là nghi_ngo", /nghi_ngo = [^"\n]*sao chị biết em không lừa/.test(br));
  ok("(15b) TONE_RULES: khách nghi ngờ → điều có thật, cấm 'đã được kiểm duyệt' / 'lên sàn'", /Khách nghi ngờ bên em[^\n]*kiểm duyệt[^\n]*lên sàn/.test(pr));
}

// (16) SRS-5.1zzzzzb — lời model gửi người bán có MỘT cửa soát nguồn (`soatNhanXet`): mỗi chỗ gọi model viết lời (`anthropicS.messages.create`)
// phải có một chỗ soát tương ứng. Thêm đường viết lời mới mà quên soát là đỏ.
{
  const soCreate = (cr.match(/anthropicS\.messages\.create\(/g) ?? []).length;
  const soSoat = (cr.match(/await soatNhanXet\(/g) ?? []).length;
  ok(`(16) mọi đường model viết lời người bán đi qua soát nguồn (${soCreate} chỗ viết, ${soSoat} chỗ soát)`, soCreate > 0 && soSoat >= soCreate, `${soCreate} / ${soSoat}`);
}

console.log(hong ? `\nLUẬT KHÔNG MÂU THUẪN: ${hong} CA HỎNG` : "\nLUẬT KHÔNG MÂU THUẪN: ĐẠT");
process.exit(hong ? 1 : 0);
