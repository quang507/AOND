// Đối chiếu LUẬT VIẾT CHO AI (prompt `_shared/ai/boc-rao.ts`) ↔ CODE kiểm / ghi kết quả AI (`kiem-bang-chung.ts`, chat-reply).
// 02/10/2026 (chủ dự án: "cần đối chiếu sửa gì về luật bóc tách giữa ai và code tay"; SRS-5.1zb). Hai bên lệch nhau thì lỗi IM:
// AI đọc đúng mà code vứt (nở hậu — `khoa_khong_co_cho_ghi`), hoặc prompt dạy một giá trị code không nhận. Không gọi model.
//  DC-01 mọi khoá AI được nói (MOI_KHOA) đều có đường ghi — KHOA_GHI hoặc ghép riêng trong `docAiChinh` (thử thật từng khoá).
//  DC-02 mọi khoá AI được nói đều có tên trong câu lệnh (AI không biết khoá thì không bao giờ nói).
//  DC-03 danh sách loại BĐS trong câu lệnh = bảng loại code nhận.
//  DC-04 mọi ý định AI nói được (Y_DINH, trừ binh_thuong) đều qua `docYDinh`.
//  DC-05 chat-reply: chỗ ghi đè còn đọc nghĩa bằng regex phải hỏi AI trước (capNhatQuan, bắt câu sửa, sửa bản nháp, đủ rồi, mở tin).
import { readFileSync } from "node:fs";
import { MOI_KHOA, KHOA_GHI, LOAI_BDS, docAiChinh, docYDinh } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";

const goc = new URL("../supabase/functions/", import.meta.url).pathname;
const bocRao = readFileSync(goc + "_shared/ai/boc-rao.ts", "utf8");
const chat = readFileSync(goc + "chat-reply/index.ts", "utf8");
let dat = 0, hong = 0;
const kiem = (ten, ok, ct = "") => { ok ? dat++ : hong++; console.log(`${ok ? "✓" : "✗"} ${ten}${ok ? "" : ` — ${ct}`}`); };

// DC-01: khoá ngoài KHOA_GHI phải ra được một ô / cột khi đưa qua docAiChinh với giá trị mẫu.
const MAU = { ngang: ["4", "ngang 4m"], dai: ["15", "dài 15m"], no_hau: ["5", "nở hậu 5m"], duong: ["Trần Hưng Đạo", "Trần Hưng Đạo"],
  du_an: ["Sunrise City", "Sunrise City"], loai_giao_dich: ["ban", "bán"], loai_bds: ["nha_pho", "nhà phố"], quan: ["Quận 5", "quận 5"],
  ma_can: ["A12-05", "A12-05"], gia_m2: ["95 triệu/m2", "95 triệu/m2"], ten_duong: ["Trần Hưng Đạo", "Trần Hưng Đạo"] };
// Ngoại lệ CÓ LÝ DO (thêm dòng ở đây là một quyết định, không phải cách làm cổng xanh):
const NGOAI_LE = { dai: "dài một mình không có ô riêng — đường câu treo ghép với ngang đã có (`ghepMotChieu`); có ngang thì thành AxB" };
const ngoai = MOI_KHOA.filter((k) => !(k in KHOA_GHI) && !(k in NGOAI_LE));
const roi = ngoai.filter((k) => {
  const m = MAU[k];
  if (!m) return true;
  const d = [{ khoa: k, gia_tri: m[0], trich_dan: m[1], can: null }, ...(k === "ngang" ? [{ khoa: "dai", gia_tri: "15", trich_dan: "dài 15m", can: null }] : [])];
  const r = docAiChinh(d, null);
  // ten_duong → `tenDuong`: chat-reply ghi cột street (SRS-5.1zk).
  return !(r.ghi.length || r.quan || r.maCan || r.giaM2Raw || r.loaiBds || r.loaiGiaoDich || r.tenDuong);
});
kiem("DC-01 mọi khoá AI nói được đều có đường ghi", roi.length === 0, roi.join(", "));
// Ca tự kiểm: khoá bịa phải bị bắt (không thì DC-01 xanh vì soi sai).
kiem("DC-01b khoá không có chỗ ghi bị bắt", !docAiChinh([{ khoa: "khoa_bia", gia_tri: "x", trich_dan: "x", can: null }], null).ghi.length);

// DC-02
const LUAT = bocRao.slice(bocRao.indexOf("const LUAT = `"), bocRao.indexOf("` + viDuThanhChu()"));
const thieuTen = MOI_KHOA.filter((k) => !new RegExp(`\\b${k}\\b`).test(LUAT));
kiem("DC-02 mọi khoá AI nói được đều có tên trong câu lệnh", thieuTen.length === 0, thieuTen.join(", "));

// DC-03
const dongLoai = /- loai_bds: ([a-z0-9_ |]+)/.exec(LUAT)?.[1] ?? "";
const loaiPrompt = dongLoai.split("|").map((x) => x.trim()).filter(Boolean).sort();
const loaiCode = Object.keys(LOAI_BDS).sort();
kiem("DC-03 loại BĐS trong câu lệnh = bảng loại code nhận", JSON.stringify(loaiPrompt) === JSON.stringify(loaiCode),
  `prompt ${loaiPrompt.join(",")} | code ${loaiCode.join(",")}`);

// DC-04
const yDinh = (/export const Y_DINH = \[([^\]]+)\]/.exec(bocRao)?.[1] ?? "").match(/"([a-z_]+)"/g)?.map((x) => x.slice(1, -1)) ?? [];
const roiYD = yDinh.filter((l) => l !== "binh_thuong" && docYDinh({ loai: l, trich_dan: "đủ rồi" }, "đủ rồi em") === null);
kiem("DC-04 mọi ý định AI nói được đều qua docYDinh", yDinh.length > 0 && roiYD.length === 0, roiYD.join(", ") || "không đọc được Y_DINH");

// DC-05 — soi mã nguồn: các chỗ từng để regex quyết khi AI đã đọc nay hỏi AI trước.
const than = (ten, dai = 1500) => { const i = chat.indexOf(ten); return i < 0 ? "" : chat.slice(i, i + dai); };
kiem("DC-05a capNhatQuan hỏi AI trước khi dò quận cả câu", /const ai = await aiLuot\(\);[\s\S]{0,200}ai !== undefined \? ai\.quan/.test(than("const capNhatQuan = async")));
kiem("DC-05b bắt câu sửa (FR-164) lọc theo AI", /const aiSua = suaFacts\.length \? await aiLuot\(\)/.test(chat));
kiem("DC-05c sửa bản nháp ghi ô AI trước", /const aiN = await aiLuot\(\);/.test(chat));
kiem("DC-05d 'đủ rồi' giữa vòng hỏi theo ý định AI", /noiDuRoi = ydDu !== undefined \? ydDu\?\.loai === "du_roi" : laDuRoi\(dapAn\)/.test(chat));
kiem("DC-05e mở tin mới theo can_khac của AI", /const canKhacAi = await canKhacLuot\(\);/.test(chat));
kiem("DC-05f câu rao: AI đã đọc thì ô AI không nói không do luật điền", /const chiAi = laCheDoAi && !!aiRao;/.test(chat));

// DC-06 (test tay 02/10/2026: "16 tỉ em ạ rao khi nào dc giá thì thôi" → chỉ ra giá): câu lệnh dạy ô gấp theo NGHĨA và dặn tin có
// giá + ý gấp thì đưa cả hai — trước chỉ có '"co" | "khong"', model chỉ trả trường của câu đang hỏi.
kiem("DC-06 câu lệnh dạy 'được giá thì bán/thôi' = không gấp, và tin có giá + ý gấp thì đưa cả hai",
  /gap đọc theo NGHĨA/.test(LUAT) && /được giá thì\s*\n?\s*bán \/ thì thôi/.test(LUAT) && /đưa CẢ HAI trường/.test(LUAT));

// DC-07 (bắn thật 02/10 thu-gap-01…12, SRS-5.1zd): 10/12 tin "ban nha hem …" không có loại (từ #408 trigger thôi đoán) → câu lệnh dặn
// tin rao có chữ "nhà" LUÔN đưa loai_bds; ô gấp chỉ trả co/khong (AI chép cụm vào gia_tri thì code bỏ, luật lại đọc mẩu câu).
kiem("DC-07 câu lệnh: tin rao có chữ 'nhà' (cả không dấu) luôn đưa loai_bds; gấp chỉ trả co/khong; 'ngộp ngân hàng' không phải bực",
  /LUÔN đưa loai_bds/.test(LUAT) && /ban nha hem/.test(LUAT) && /gia_tri CHỈ là "co" hoặc "khong"/.test(LUAT) && /ngộp ngân hàng/.test(bocRao));

// DC-08 (test tay 02/10, SRS-5.1ze): bot hỏi "cần ra hàng gấp hay được giá thì thôi" ngay sau khi chủ nhà vừa nói "rao khi nào được
// giá thì bán" — `khong_can_hoi` chỉ dạy "không áp dụng". Nay dạy cả "đã trả lời / nói vòng".
kiem("DC-08 khong_can_hoi dạy cả câu chủ nhà ĐÃ trả lời (nói vòng về gấp)",
  /HOẶC chủ nhà ĐÃ trả lời/.test(bocRao) && /đã trả lời câu gấp/.test(bocRao));
// DC-09 (cùng lượt): khách tự xưng do AI đọc, code kiểm trích dẫn; chat-reply ghi hồ sơ và gọi đúng ngay lượt đó.
kiem("DC-09 AI đọc khách tự xưng (tu_xung) và chat-reply dùng docTuXung",
  // 05/10/2026 (SRS-5.1zx): trích dẫn được nằm trong tin cũ → gọi kèm `tinChuNhaGoc()`, và không còn cổng `laCheDoAi`.
  /tu_xung: TuXung/.test(bocRao) && /docTuXung\(kqX\.tuXung, text, tinChuNhaGoc\(\)\)/.test(chat) && !/!goiLuot && laCheDoAi && bongAi/.test(chat));
// DC-10 (cùng lượt): khối DỰ ÁN ở nhánh người bán không mang thông số dự án (bot từng hỏi "nhà phố 4-6 tầng có thang máy" như căn chủ nhà).
kiem("DC-10 khối DỰ ÁN nhánh bán: không đưa `specs`, dặn không dùng để nói / hỏi căn của chủ nhà",
  !/thông số: \$\{JSON\.stringify\(ts\)\}/.test(chat) && /KHÔNG phải căn của chủ nhà/.test(chat));
// DC-11 (chủ dự án 02/10: "nếu thông tin chung chung, thông tin dự án sẽ ghi là theo em biết là …"): khối dự án và lệnh nguồn dặn mở bằng "Theo em biết".
kiem("DC-11 thông tin chung / dự án nói bằng 'Theo em biết, …' (khối DỰ ÁN + lệnh câu hỏi nguồn)",
  (chat.match(/Theo em biết, dự án <tên>/g) ?? []).length >= 2);

// DC-12 (đợt 1 bỏ luật từ khoá, SRS-5.1zf): GẬT / BẢO ĐĂNG do AI quyết — mọi lời gọi `laDongY` / `laBaoDang` trong chat-reply chỉ
// còn là lưới đỡ (trong hàm truyền cho gatLuot / baoDangLuot, hoặc nhánh `: …` sau kết quả AI). Gọi trần mới thêm vào là đỏ.
{
  const tran = [...chat.matchAll(/(?<!=>\s)\b(laDongY|laBaoDang)\(/g)].map((m) => {
    const dong = chat.slice(0, m.index).split("\n").length;
    const ca = chat.split("\n")[dong - 1];
    return /lưới đỡ|gatLuot|baoDangLuot|: laDongY|: \(laDongY|: !gatCa|tgH !== undefined|laDongY\(text\) && text\.trim/.test(ca) ? null : `${dong}: ${ca.trim().slice(0, 90)}`;
  }).filter(Boolean);
  kiem("DC-12 gật / bảo đăng: không còn lời gọi laDongY / laBaoDang trần (chỉ lưới đỡ sau AI)", /docDongY\(k\.dongY, textTreo/.test(chat) && /docYLuotBangModel/.test(chat) && tran.length === 0, tran.join(" | "));
}

// DC-14 (đợt 3 bỏ luật từ khoá, SRS-5.1zg): YÊU CẦU của chủ nhà (hỏi về tin, bao lâu bán, xin số khách, xin xoá dữ liệu, xin bỏ ô)
// do AI quyết (`yeuCauAi`) — `hoiVeTin` / `laXinSoKhach` / `laXinXoaDuLieu` / `laXinBoTruong` trong chat-reply chỉ còn là lưới đỡ
// (dòng ghi "lưới đỡ", nhánh `ycLuot !== undefined ? … : luật`). Ngoại lệ có lý do: `boDiem` chạy TRƯỚC lượt AI (bỏ câu chấm
// điểm treo khi tin không phải điểm). Gọi trần mới thêm vào là đỏ.
{
  const tran = [...chat.matchAll(/\b(hoiVeTin|laXinSoKhach|laXinXoaDuLieu|laXinBoTruong)\(/g)].map((m) => {
    const dong = chat.slice(0, m.index).split("\n").length;
    const ca = chat.split("\n")[dong - 1];
    return /lưới đỡ|ycLuot !== undefined|const boDiem/.test(ca) ? null : `${dong}: ${ca.trim().slice(0, 90)}`;
  }).filter(Boolean);
  kiem("DC-14 yêu cầu chủ nhà: không còn lời gọi hoiVeTin / laXin… trần (chỉ lưới đỡ sau AI)", /docYeuCau\(k\.yeuCau, textTreo/.test(chat) && tran.length === 0, tran.join(" | "));
}
// DC-15 (SRS-5.1zg): "bao lâu bán được" bot tự trả lời — không đi đường chuyển người phụ trách, không hứa số ngày.
{
  const hvt = readFileSync(goc + "_shared/extraction/hoi-ve-tin.ts", "utf8");
  const than = hvt.slice(hvt.indexOf("export function dapBaoLauBan"));
  kiem("DC-15 'bao lâu bán được' có câu trả lời tiền định, không hứa số ngày", /case "bao_lau_ban"/.test(hvt) && /hoi_bao_lau_ban/.test(readFileSync(goc + "_shared/ai/doc-y-luot.ts", "utf8")) && /không dám hứa số ngày/.test(than) && !/\d+\s*(?:ngày|tuần|tháng)/.test(than.split("\n").slice(0, 4).join(" ")));
}

// DC-13 (02/10/2026, #414 → revert #415): khuôn structured output của lượt bóc tách SÁT giới hạn grammar Anthropic — thêm MỘT ô
// (`dong_y`) là mọi lượt 400 "The compiled grammar is too large", AI không chạy. Mock e2e không biên dịch grammar nên không thấy.
// Chốt số trường cấp một của `DeXuatRao`: ý về HỘI THOẠI đi lượt nhỏ `doc-y-luot.ts`. Tăng số này là phải bắn thử production trước.
{
  const dau = bocRao.indexOf("const DeXuatRao = z.object({");
  const than = bocRao.slice(dau, bocRao.indexOf("\n});", dau));
  const khoa = [...than.matchAll(/^  ([a-z_]+):/gm)].map((m) => m[1]);
  kiem("DC-13 khuôn bóc tách không thêm trường (giới hạn grammar Anthropic: 15 là vượt, #414)", khoa.length > 0 && khoa.length <= 14, `${khoa.length}: ${khoa.join(",")}`);
}

// DC-16 (SRS-5.1zzzu, bắn thử …ke1tatt "dang di"): model sinh ô theo thứ tự khuôn — ô đọc lại tin không dấu phải ĐỨNG ĐẦU lượt "ý của
// lượt", để gật / bảo đăng quyết theo bản đọc lại (ô đứng sau: model chọn "dong_y" rồi mới đọc ra "đăng đi").
{
  const yl = readFileSync(goc + "_shared/ai/doc-y-luot.ts", "utf8");
  const dau = yl.indexOf("const YLuot = z.object({");
  const than = yl.slice(dau, yl.indexOf("\n});", dau));
  const khoa = [...than.matchAll(/^  ([a-z_]+):/gm)].map((m) => m[1]);
  kiem("DC-16 lượt ý của lượt: doc_lai là ô ĐẦU (đọc lại trước, quyết gật / bảo đăng sau)", khoa[0] === "doc_lai", khoa.join(","));
}

console.log(`\n${dat}/${dat + hong} đạt`);
if (hong) process.exit(1);
