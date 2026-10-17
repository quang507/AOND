// boc-tach-42-ca.mjs — tầng bóc tách tiền định trên các câu của lượt bắn 42 ca
// (11/09/2026). Không mạng, không DB, không model. Chạy bằng bun (import .ts):
//   bun bot/tests/boc-tach-42-ca.mjs
//
// Lượt bắn đọc lại DB bằng bong bóng 💾 và lòi ra: giá "9t5"/"4t2"/"3tr5" rơi,
// "4 tỷ rưỡi" thành 4 tỷ, "75 triệu/m2" thành giá cả căn, số đọc bằng chữ không
// bóc được gì, "anh bận" thành tên phường, "sai rồi em, phường 9 chứ không phải
// phường 4" ghi Phường 4, "căn q5" thành mã căn, nhà Hà Nội vào Quận 5. Mỗi ca
// dưới đây là một câu THẬT của lượt đó (hoặc biến thể sát nó).
// Phía SQL (parse_vnd, chuan_hoa_gia_raw, guess_property_type, boc_thong_so) sửa
// ở migration 20260911e; bảng ca tiền chung ở luat/tien.json (doi-chieu-tien.mjs).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { docTien, giaTheoM2, vndThanhChu } from "../supabase/functions/_shared/extraction/luat-tien.ts";
import { soChuThanhSo } from "../supabase/functions/_shared/extraction/so-chu.ts";
import {
  bocViTriRao, catDapAn, cheoPhuDinh, gonLoiSua, laHoanLai, nhanDienFact, nhanDienNhieuCan, nhanDienNhieuFact, phanLoaiCauTraLoi, tachCauHoiNguoc, tachTheoCan, laCauHoiTron, tuXungTuCau, vungPhuDinh, batXungHo, laChaoChau, suyTuXungHo, tuXungBot, CHAO_SUONG_RE, laRaoLai, chonCanTheoCau,
} from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { vungNgoai } from "../supabase/functions/_shared/dia_ban.ts";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
let hong = 0, tong = 0;
const ok = (ten, dat, chi = "") => {
  tong++;
  if (!dat) hong++;
  console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`);
};

// ── Luật tiền (bản TS) trên cả bảng ca chung ────────────────────────────────
const { ca } = JSON.parse(readFileSync(join(HERE, "luat", "tien.json"), "utf8"));
for (const c of ca) if ("mong" in c) ok(`docTien "${c.cau}"`, docTien(c.cau) === c.mong, String(docTien(c.cau)));
ok("giaTheoM2('75 triệu/m2') = 75 triệu", giaTheoM2("75 triệu/m2") === 75_000_000, String(giaTheoM2("75 triệu/m2")));
ok("giaTheoM2('5 tỷ') = null (không phải giá mỗi m²)", giaTheoM2("5 tỷ") === null, String(giaTheoM2("5 tỷ")));
for (const v of [3_750_000_000, 3_050_000_000, 850_000_000, 12_000_000_000]) {
  ok(`vndThanhChu(${v}) đọc lại đúng số`, docTien(vndThanhChu(v)) === v, vndThanhChu(v));
}

// ── Số đọc bằng chữ ─────────────────────────────────────────────────────────
for (const [vao, mong] of [
  ["bán nhà quận năm phường hai diện tích năm mươi mét vuông giá bốn tỷ rưỡi", "bán nhà quận 5 phường 2 diện tích 50m2 giá 4 tỷ rưỡi"],
  ["nhà ba lầu, bốn phòng", "nhà 3 lầu, 4 phòng"],
  ["giá một trăm linh năm triệu", "giá 105 triệu"],
  ["bốn tỷ hai", "4 tỷ 2"],
  ["mới xây năm ngoái, hướng nam", "mới xây năm ngoái, hướng nam"],
  ["giá hai ba tỷ", "giá hai ba tỷ"],
  ["ba mẹ anh ở cùng", "ba mẹ anh ở cùng"],
  ["bán nhà q5 60m2 6 tỷ", "bán nhà q5 60m2 6 tỷ"],
]) ok(`soChuThanhSo "${vao}"`, soChuThanhSo(vao) === mong, soChuThanhSo(vao));

// ── Khách tự xưng ───────────────────────────────────────────────────────────
for (const [vao, mong] of [
  ["e oi a can ban nha o q8 nha 3 lau 4x12 gia 4t2 nhe", "anh"],
  ["chị Lan đây em, chị bán nhà q6 phường 10, 55m2, 4 tỷ", "chị"],
  ["để anh hỏi vợ đã em", "anh"],
  ["hỏi gì hỏi lắm vậy em, anh bận", "anh"],
  ["nhà anh đẹp lắm em, mới xây năm ngoái", "anh"],
  ["sổ hồng riêng", null],
  ["bán nhà q5 60m2 8 tỷ", null],
]) ok(`tuXungTuCau "${vao}"`, tuXungTuCau(vao) === mong, String(tuXungTuCau(vao)));

// ── Bận / hoãn ──────────────────────────────────────────────────────────────
for (const [vao, mong] of [
  ["hỏi gì hỏi lắm vậy em, anh bận", true],
  ["để anh hỏi vợ đã em", true],
  ["để anh bàn với vợ", true],
  ["anh chưa biết nữa em ơi hỏi lại sau", true],
  ["để coi", false],
  ["phường 5 nha, anh bận", false],
  ["Bàn Cờ", false],
  ["sổ hồng riêng", false],
  // 30/09/2026 (bắn thật lx-ban-f): lời hẹn "để mai" không dấu từng vào "bổ sung" và bot hỏi tiếp.
  ["thoi de mai e noi tiep", true],
  ["thôi để mai em nói tiếp nha.", true],
  ["để tối anh gửi", true],
  ["mai anh nhắn tiếp", true],
  ["để mai bán luôn", false],
  ["mái tôn", false],
  ["đường Mai Chí Thọ", false],
]) ok(`laHoanLai "${vao}"`, laHoanLai(vao) === mong, String(laHoanLai(vao)));

// ── Vế phủ định ─────────────────────────────────────────────────────────────
{
  const s = "sai rồi em, phường 9 chứ không phải phường 4";
  const c = cheoPhuDinh(s);
  ok("cheoPhuDinh giữ nguyên độ dài (chỉ số khớp trên câu gốc vẫn đúng)", c.length === s.length, `${c.length}/${s.length}`);
  ok("cheoPhuDinh che 'phường 4', giữ 'phường 9'", /phường 9/.test(c) && !/phường 4/.test(c), JSON.stringify(c));
  ok("vungPhuDinh tìm đúng một vùng", vungPhuDinh(s).length === 1, JSON.stringify(vungPhuDinh(s)));
  const c2 = cheoPhuDinh("không phải phường 4 mà là phường 9");
  ok("cheoPhuDinh 'không phải X mà là Y' giữ Y", /phường 9/.test(c2) && !/phường 4/.test(c2), JSON.stringify(c2));
  ok("câu không có phủ định giữ nguyên", cheoPhuDinh("phường 9 nha em") === "phường 9 nha em");
}

// ── Phân loại câu trả lời ───────────────────────────────────────────────────
for (const [q, vao, mong] of [
  ["phuong", "hỏi gì hỏi lắm vậy em, anh bận", "hoan"],
  ["vi_tri", "để anh hỏi vợ đã em", "hoan"],
  ["gap", "để anh bàn với vợ", "hoan"],
  ["phuong", "Nguyễn Cư Trinh", "khop"],
  ["phuong", "Bàn Cờ", "khop"],
  ["phuong", "p5", "khop"],
  ["phuong", "anh không biết phường nào nữa em", "lech"],
  ["phuong", "phường Tân Hưng", "khop"],
  ["phuong", "xã Phong Phú", "khop"],
  ["vi_tri", "4m", "lech"],
]) {
  const k = phanLoaiCauTraLoi(q, vao);
  ok(`phanLoaiCauTraLoi [${q}] "${vao}" → ${mong}`, k.loai === mong, k.loai);
}

// ── Fact trong câu rao: mảnh trước cả câu ───────────────────────────────────
{
  const f = nhanDienNhieuFact("bán nhà hxh Nguyễn Trãi p3 q5, 4x16, 1 trệt 2 lầu, shr, 9t5");
  const pl = f.find((x) => x.question === "phap_ly")?.answer;
  ok("fact pháp lý là mảnh 'shr', không phải NGUYÊN câu rao", pl === "shr", JSON.stringify(f));
}

// ── 15/09/2026 — VỪA TRẢ LỜI VỪA HỎI NGƯỢC; số nhà không phải diện tích (Zalo thật, Ny'ah Phú Định:
// "Căn số 14 ở ny'ah phú định" thành 14m², hai câu hỏi của chủ nhà bị nuốt, ô gấp/kết cấu ghi cả câu) ──
{
  const t1 = "Nhà 5 tầng, có thang máy thì phải, bạn có biết xung quanh khu này có tiện ích gì không";
  const k1 = phanLoaiCauTraLoi("ket_cau", t1);
  ok("hỏi kết cấu + hỏi ngược → khớp, dapAn = phần trả lời, hoiNguoc = câu hỏi",
    k1.loai === "khop" && k1.dapAn === "Nhà 5 tầng, có thang máy thì phải" && k1.hoiNguoc === "bạn có biết xung quanh khu này có tiện ích gì không", JSON.stringify(k1));
  ok("catDapAn kết cấu → 'Nhà 5 tầng' (không cả câu)", catDapAn("ket_cau", t1) === "Nhà 5 tầng", catDapAn("ket_cau", t1));
  const t2 = "Được giá, căn tôi sở hữu nhưng chưa vào xem bạn có thông tin thêm về căn này không";
  const k2 = phanLoaiCauTraLoi("gap", t2);
  ok("hỏi gấp + hỏi ngược không dấu '?' → khớp + hoiNguoc", k2.loai === "khop" && k2.hoiNguoc === "bạn có thông tin thêm về căn này không", JSON.stringify(k2));
  ok("catDapAn gấp → 'Được giá'", catDapAn("gap", t2) === "Được giá", catDapAn("gap", t2));
  const k2b = phanLoaiCauTraLoi("dien_tich_dat", t2);
  ok("cùng câu đó khi đang hỏi DIỆN TÍCH → lệch sang gấp (không rơi bo_sung), vẫn tách hỏi ngược",
    k2b.loai === "lech" && k2b.chuyenSang?.question === "gap" && !!k2b.hoiNguoc, JSON.stringify(k2b));
  const k3 = phanLoaiCauTraLoi("dien_tich_dat", "Căn số 14 ở ny’ah phú định");
  ok("'Căn số 14 ở …' trả lời diện tích → LỆCH sang vi_tri, không thành 14m²", k3.loai === "lech" && k3.chuyenSang?.question === "vi_tri", JSON.stringify(k3));
  const k4 = phanLoaiCauTraLoi("so_phong_ngu", "4 phòng ngủ, mà khu này có trường học gần không em");
  ok("'4 phòng ngủ, mà khu này có trường học gần không em' → khớp 4 PN + hỏi ngược", k4.loai === "khop" && k4.dapAn === "4 phòng ngủ" && /trường học/.test(k4.hoiNguoc ?? ""), JSON.stringify(k4));
  const k5 = phanLoaiCauTraLoi("phap_ly", "sổ hồng riêng rồi, bên em lấy phí sao");
  ok("'sổ hồng riêng rồi, bên em lấy phí sao' → khớp pháp lý + hỏi phí", k5.loai === "khop" && k5.dapAn === "sổ hồng riêng rồi" && k5.hoiNguoc === "bên em lấy phí sao", JSON.stringify(k5));
  // KHÔNG được tách nhầm:
  for (const [q, t] of [
    ["gap", "không gấp, bán được giá thì thôi"],
    ["hem_thong", "hẻm 4m, không có gì vướng"],
    ["nam_xay", "không biết nữa"],
    ["phap_ly", "chưa có sổ, đang làm"],
    ["gia", "5 tỷ được không?"],
    ["dien_tich_dat", "5x16"],
    ["dien_tich", "80m2 nha em"],
    ["ket_cau", "1 trệt 2 lầu, 3 phòng ngủ"],
  ]) {
    const k = phanLoaiCauTraLoi(q, t);
    ok(`không tách hỏi ngược: [${q}] "${t}"`, !k.hoiNguoc, JSON.stringify(k));
  }
  ok("tachCauHoiNguoc: câu thuần hỏi 'phí bên em sao?' → không tách (để luật cũ)", tachCauHoiNguoc("phí bên em sao?").hoi === null);
  ok("tachCauHoiNguoc: 'ok, bên em có nhận ký gửi không' → trả lời 'ok' + hỏi", tachCauHoiNguoc("ok, bên em có nhận ký gửi không").hoi === "bên em có nhận ký gửi không");
}

// ── Nhiều căn ───────────────────────────────────────────────────────────────
{
  const nc = nhanDienNhieuCan("anh có 2 căn: 1 căn q5 50m2 6 tỷ, 1 căn q11 40m2 4 tỷ");
  ok("'1 căn q5 …, 1 căn q11 …' → 2 căn, 'q5' là QUẬN không phải mã căn",
    nc.length === 2 && nc[0].quan === "Quận 5" && nc[1].quan === "Quận 11" && !nc[0].ma && !nc[1].ma &&
      nc[0].dt === "50" && nc[0].gia === "6 tỷ" && nc[1].gia === "4 tỷ",
    JSON.stringify(nc));
  const lo = nhanDienNhieuCan("căn A5 8x20 giá 18 tỷ, căn A7 8x20 giá 18 tỷ 5");
  ok("mã căn thật (A5, A7) vẫn là mã căn", lo.length === 2 && lo[0].ma === "A5" && lo[1].ma === "A7" && !lo[0].quan, JSON.stringify(lo));
  // 15/09/2026 (bắn thử): "căn 1 … căn 2 …" là số thứ tự — hai căn, không unit_code.
  const tt = nhanDienNhieuCan("em có 2 căn: căn 1 hẻm 3m nguyễn trãi q5 4x12 giá 5 tỷ, căn 2 mặt tiền trần phú q5 4x20 giá 18 tỷ");
  ok("'căn 1 …, căn 2 …' → 2 căn theo thứ tự, không mã, giữ quận/kích thước/giá",
    tt.length === 2 && tt[0].thu === 1 && tt[1].thu === 2 && !tt[0].ma && !tt[1].ma &&
      tt[0].quan === "Quận 5" && tt[0].ngang === "4" && tt[0].dai === "12" && tt[0].gia === "5 tỷ" && tt[1].dai === "20" && tt[1].gia === "18 tỷ",
    JSON.stringify(tt));
  // 22/09/2026 (bắn thật căn hộ): số nhà trần trước phường HAI chữ số ("p12") từng trượt.
  ok("bocViTriRao 'co can ho Hung Vuong Plaza 126 Hung Vuong p12, tang 15' → '126 Hung Vuong'", bocViTriRao("em la moi gioi ben q5, co can ho Hung Vuong Plaza 126 Hung Vuong p12, tang 15, 2pn 78m2, gia 4 ty 3") === "126 Hung Vuong", JSON.stringify(bocViTriRao("em la moi gioi ben q5, co can ho Hung Vuong Plaza 126 Hung Vuong p12, tang 15, 2pn 78m2, gia 4 ty 3")));
  ok("bocViTriRao '7 Hồng Bàng phường 12' vẫn nhận; '5 tỷ q5' không thành địa chỉ", bocViTriRao("bán nhà 7 Hồng Bàng phường 12 quận 5") === "7 Hồng Bàng" && bocViTriRao("bán nhà 5 tỷ q5") === null);
  // 23/09/2026 (bắn thật 10 câu): bỏ dấu thì tên người trùng chữ dừng — "Phương"/"phường", "Phong"/"phòng", "Lương"/"lượng",
  // "Huyền"/"huyện"; "căn 2 căn hộ Hà Đô quận 10" thì số thứ tự căn thành số nhà.
  for (const [vao, mong] of [
    ["cô có 2 căn: căn 1 nhà hẻm Nguyễn Tri Phương quận 10 giá 8 tỷ", "hẻm Nguyễn Tri Phương"],
    ["nhà hẻm Lê Hồng Phong phường 2 quận 10", "hẻm Lê Hồng Phong"],
    ["hẻm 3m Lương Nhữ Học quận 5", "hẻm 3m Lương Nhữ Học"],
    ["đường Huyền Trân Công Chúa quận 1", "đường Huyền Trân Công Chúa"],
    ["ban nha hem nguyen tri phuong quan 10", "hem nguyen tri phuong"],
    ["hem le hong phong phuong 2 quan 10", "hem le hong phong"],
    ["hem 5m Nguyen Trai phuong 3 quan 5", "hem 5m Nguyen Trai"],      // không dấu + số phường → vẫn dừng
    ["hẻm 4m Trần Hưng Đạo hướng đông nam", "hẻm 4m Trần Hưng Đạo"],  // "hướng" có dấu → dừng
    ["hem tran phu 3 phong ngu", "hem tran phu"],
    ["hẻm 5m Nguyễn Trãi giá 7 tỷ", "hẻm 5m Nguyễn Trãi"],
    ["căn 2 căn hộ Hà Đô quận 10 75m2 giá 5 tỷ", null],               // "2 căn hộ" không phải số nhà
    ["12 Nguyễn Tri Phương phường 5 quận 10", "12 Nguyễn Tri Phương"],
  ]) ok(`bocViTriRao tên trùng chữ dừng ${JSON.stringify(vao)}`, bocViTriRao(vao) === mong, JSON.stringify(bocViTriRao(vao)));
  // Câu hỏi đứng TRƯỚC, ngăn bằng "?" (bắn thật: câu hỏi phí bị nuốt).
  ok("tachCauHoiNguoc: 'bên em lấy phí bao nhiêu vậy? anh có nhà … muốn gửi bán' → tách câu hỏi phí",
    tachCauHoiNguoc("bên em lấy phí bao nhiêu vậy? anh có nhà Lê Hồng Phong muốn gửi bán").hoi === "bên em lấy phí bao nhiêu vậy?" &&
      tachCauHoiNguoc("bên em lấy phí bao nhiêu vậy? anh có nhà Lê Hồng Phong muốn gửi bán").traLoi === "anh có nhà Lê Hồng Phong muốn gửi bán",
    JSON.stringify(tachCauHoiNguoc("bên em lấy phí bao nhiêu vậy? anh có nhà Lê Hồng Phong muốn gửi bán")));
  // 22/09/2026 (bộ đo giọng B11): "5 tỷ 60m2" — 60 là diện tích, không phải phần lẻ của giá.
  const b11 = nhanDienNhieuCan("bên anh có 2 căn: căn 1 hẻm 4m Nguyễn Trãi p3 q5 5 tỷ 60m2, căn 2 mặt tiền Hồng Bàng p12 q5 12 tỷ 80m2");
  ok("'căn 1 … 5 tỷ 60m2, căn 2 … 12 tỷ 80m2' → giá '5 tỷ' / '12 tỷ', dt 60 / 80", b11.length === 2 && b11[0].gia === "5 tỷ" && b11[1].gia === "12 tỷ" && b11[0].dt === "60" && b11[1].dt === "80", JSON.stringify(b11));
  const b11b = nhanDienNhieuCan("căn 1 5 tỷ 6 60m2, căn 2 7 tỷ rưỡi 80m2");
  ok("'5 tỷ 6 60m2' vẫn giữ phần lẻ '5 tỷ 6'; '7 tỷ rưỡi' giữ rưỡi", b11b[0]?.gia === "5 tỷ 6" && b11b[1]?.gia === "7 tỷ rưỡi", JSON.stringify(b11b));
  ok("nhanDienNhieuFact 'cần bán gấp 5 tỷ 60m2' → gia '5 tỷ'", nhanDienNhieuFact("cần bán gấp 5 tỷ 60m2").find((f) => f.question === "gia")?.answer === "5 tỷ");
  ok("'căn 2 phòng ngủ 65m2 quận 7 giá 3 tỷ 1' KHÔNG phải nhiều căn", nhanDienNhieuCan("bán căn hộ 2 phòng ngủ 65m2 quận 7, căn 2pn view sông, giá 3 tỷ 1").length === 0);
  ok("'còn căn 2 mặt tiền …' một mình → chưa đủ 2 căn (đường 'còn căn <số>' lo)", nhanDienNhieuCan("còn căn 2 mặt tiền trần phú 4x20 giá 18 tỷ thì sao em").length === 0);
}

// ── Vùng ngoài địa bàn ──────────────────────────────────────────────────────
for (const [vao, mong] of [
  ["ban nha o ha noi quan cau giay 50m2 9 ty", "Hà Nội|true"],
  ["ban nha da nang gan bien", "Đà Nẵng|true"],
  ["ban nha thu dau mot binh duong", "Bình Dương|false"],
  ["ban dat bien hoa dong nai", "Đồng Nai|false"],
  ["ban nha q5 phuong 2", "null"],
  ["ban dat ben luc long an", "null"],
]) {
  const v = vungNgoai(vao);
  ok(`vungNgoai "${vao}"`, (v ? `${v.ten}|${v.xa}` : "null") === mong, JSON.stringify(v));
}

// ── Câu trả lời kèm lời dặn (Zalo thật 11/09, dự án ehome 3) ────────────────
{
  const { catDapAn } = await import("../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts");
  for (const [q, vao, mong] of [
    ["vi_tri", "Bạn phải ghi dự án chung cư ehome 3 chứ ở hồ ngọc lãm", "hồ ngọc lãm"],
    ["vi_tri", "hẻm 102 Trần Bình Trọng", "hẻm 102 Trần Bình Trọng"],
    ["vi_tri", "sửa lại giúp em, nhà ở hẻm 45 Trần Phú", "hẻm 45 Trần Phú"],
    ["phuong", "Đường hồ ngọc lãm quận 8 phường 6", "Phường 6"],
    ["phuong", "p5 em", "Phường 5"],
    ["phuong", "Nguyễn Cư Trinh", "Nguyễn Cư Trinh"],
    ["gia", "5 tỷ 2", "5 tỷ 2"],
  ]) ok(`catDapAn [${q}] "${vao}"`, catDapAn(q, vao) === mong, catDapAn(q, vao));
}

// ── 12/09/2026 — VỊ TRÍ TRONG CÂU RAO (lượt bắn 20 tin thật: 7/7 tin mất địa chỉ,
// bot hỏi đường vòng vòng, bản nháp không bao giờ bung vì thiếu vị trí) ─────────
for (const [vao, mong] of [
  ["anh cần bán căn nhà hẻm xe hơi 5m Nguyễn Trãi phường 3 quận 5, 60m2, giá 7 tỷ 2", "hẻm xe hơi 5m Nguyễn Trãi"],
  ["gia đình cần tiền nên để lại căn nhà 4x16 hẻm xe hơi Trần Hưng Đạo quận 5, sổ hồng riêng", "hẻm xe hơi Trần Hưng Đạo"],
  ["em ơi nhà anh ở hẻm 102 Trần Bình Trọng phường 1 quận 5, bán 5 tỷ 3", "hẻm 102 Trần Bình Trọng"],
  ["bán nhà hxh Nguyễn Trãi p3 q5, 4x16, 1 trệt 2 lầu, shr, 9t5", "hxh Nguyễn Trãi"],
  ["Đường hồ ngọc lãm quận 8 phường 6", "Đường hồ ngọc lãm"],
  ["nhà mặt tiền đường An Dương Vương quận 5, 5x20", "đường An Dương Vương"],
  ["còn căn nữa: 7 Hồng Bàng phường 12, 80m2", "7 Hồng Bàng"],
  ["hẻm xe hơi 4m, 1 trệt 3 lầu, sổ hồng riêng, 4 phòng ngủ", null],
  ["bán đất nền Bến Lức Long An 5x20 đường nhựa 7m sổ riêng 850tr", null],
  ["nhà hẻm thông không ngập, 50m2", null],
  ["bán nhà q6 phường 2 40m2 3 tỷ 9", null],
  // 15/09/2026 (bắn thử kho xưởng): "đường xe container" là tả đường, không phải tên đường.
  ["bán kho xưởng 1000m2 xã Tân Kiên bình chánh, đường xe container, giá 45 tỷ, sổ hồng", null],
  ["kho xưởng đường xe container Nguyễn Văn Linh, 2000m2", "đường xe container Nguyễn Văn Linh"],
  // 15/09/2026 (bắn thử): "Thọ" bị "tho" (thổ cư) cắt cụt.
  ["bán nhà 4x15 hẻm 5m Lê Đức Thọ gò vấp giá 6 tỷ", "hẻm 5m Lê Đức Thọ"],
  ["bán đất hẻm 6m Lê Đức Thọ thổ cư 100%, 5x20, giá 5 tỷ", "hẻm 6m Lê Đức Thọ"],
  ["đường Nguyễn Văn Thọ thổ cư full, 100m2", "đường Nguyễn Văn Thọ"],
  // 15/09/2026 (bắn thật C3): tên đường kết thúc bằng số sau chữ "tháng" — bản trước cắt mất số.
  ["hẻm 5m Cách Mạng Tháng 8, 4x14 nở hậu 5m", "hẻm 5m Cách Mạng Tháng 8"],
  ["nhà hẻm 12 đường 3 Tháng 2 quận 10, 4x14", "hẻm 12 đường 3 Tháng 2"],
  ["đường Cách Mạng Tháng Tám quận 3, 5x20", "đường Cách Mạng Tháng Tám"],
  // 15/09/2026 (bắn thật N1): "mặt tiền X" là địa chỉ.
  ["căn 2 mặt tiền Nguyễn Chí Thanh 5x20 giá 25 tỷ", "mặt tiền Nguyễn Chí Thanh"],
  ["mt Nguyễn Chí Thanh 5x20", "mt Nguyễn Chí Thanh"],
  ["nhà mặt tiền 4m hẻm 5m Trần Bình Trọng", "hẻm 5m Trần Bình Trọng"],
]) ok("bocViTriRao " + JSON.stringify(vao.slice(0, 44)), bocViTriRao(vao) === mong, JSON.stringify(bocViTriRao(vao)));

// ── 13/09/2026 — LƯỢT BẮN 20 TIN THỨ HAI: luật trả NGUYÊN câu làm đáp án ─────
// Soi DB sau lượt bắn: độ rộng hẻm = cả câu rao, nội thất = "gia đình cần tiền nên
// để lại căn nhà…", tiềm năng = "cho thuê căn hộ Sunrise City quận 7", pháp lý =
// "ngang 5 dài 20, đường nhựa 7m, sổ riêng", lý do bán "can tien" mất dấu.
{
  const F = (t) => Object.fromEntries(nhanDienNhieuFact(t).map((f) => [f.question, f.answer]));
  const a = F("anh cần bán căn nhà hẻm xe hơi 5m Nguyễn Trãi phường 3 quận 5, 60m2, ngang 4 dài 15, 1 trệt 2 lầu, 3 phòng ngủ 2 wc, sổ hồng riêng hoàn công, giá 7 tỷ 2 thương lượng");
  ok("câu rao đủ: độ rộng hẻm là 'hẻm xe hơi 5m', không phải cả câu", a.do_rong_hem === "hẻm xe hơi 5m", JSON.stringify(a));
  ok("câu rao đủ: pháp lý là mảnh 'sổ hồng riêng hoàn công'", a.phap_ly === "sổ hồng riêng hoàn công", a.phap_ly);
  const b = F("nhà hướng đông nam, để ở hoặc cho thuê đều được em");
  ok("hướng cắt 'hướng đông nam' (không kèm 'nhà')", b.huong === "hướng đông nam", JSON.stringify(b));
  const c = F("cho thuê căn hộ Sunrise City quận 7, 76m2, 2 phòng ngủ, tầng 15 view sông, full nội thất, 18 triệu một tháng");
  ok("căn hộ thuê: KHÔNG có tiềm năng = 'cho thuê căn hộ Sunrise City…'", !("tiem_nang" in c), JSON.stringify(c));
  ok("căn hộ thuê: tầng 15, nội thất 'full nội thất', view 'view sông'", c.tang === "15" && c.noi_that === "full nội thất" && c.view === "view sông", JSON.stringify(c));
  const d = F("gia đình cần tiền nên để lại căn nhà 4x16 hẻm xe hơi Trần Hưng Đạo quận 5, sổ hồng riêng");
  ok("'để lại căn nhà' là BÁN — không thành nội thất", !("noi_that" in d), JSON.stringify(d));
  ok("lý do bán giữ dấu 'cần tiền'", d.ly_do_ban === "cần tiền", d.ly_do_ban);
  const e = F("ngang 5 dài 20, đường nhựa 7m, sổ riêng");
  ok("đất: pháp lý 'sổ riêng', đường vào 'đường nhựa 7m' (không phải cả câu)", e.phap_ly === "sổ riêng" && e.duong_vao === "đường nhựa 7m", JSON.stringify(e));
  ok("đất: 'ngang 5 dài 20' giữ CẢ hai chiều (trước chỉ '5m', mất dài 20)", e.mat_tien === "ngang 5m dài 20m", JSON.stringify(e));
  const g = phanLoaiCauTraLoi("phuong", "ngang 5 dài 20, đường nhựa 7m, sổ riêng");
  ok("đang hỏi xã mà trả lời thông số → lệch, chuyển sang pháp lý 'sổ riêng' (không cả câu)", g.loai === "lech" && g.chuyenSang?.answer === "sổ riêng", JSON.stringify(g));
  // KHÔNG được làm hỏng
  const h = F("để lại máy lạnh, tủ lạnh");
  ok("'để lại máy lạnh, tủ lạnh' vẫn là nội thất", h.noi_that != null, JSON.stringify(h));
  const i = F("nhà hợp để ở hoặc cho thuê");
  ok("'nhà hợp để ở hoặc cho thuê' vẫn là tiềm năng", i.tiem_nang != null, JSON.stringify(i));
  const j = F("sổ hồng riêng");
  ok("câu một mảnh 'sổ hồng riêng' → pháp lý nguyên câu", j.phap_ly === "sổ hồng riêng", JSON.stringify(j));
}

// 15/09/2026 (bắn thật C4, A5): đổi loại giao dịch là fact `loai_giao_dich` (không phải
// tiềm năng); cả tin là câu hỏi thì không phải dữ liệu.
for (const [vao, mong] of [
  ["à mà nhà này cho thuê chứ ko bán, 25 triệu", "cho_thue"],
  ["cho thuê chứ không bán em ơi", "cho_thue"],
  ["không bán nữa, chuyển sang cho thuê", "cho_thue"],
  ["bán chứ không cho thuê nữa em", "ban"],
  ["đổi qua bán luôn em", "ban"],
]) ok("loai_giao_dich " + JSON.stringify(vao), nhanDienNhieuFact(vao).find((f) => f.question === "loai_giao_dich")?.answer === mong && !nhanDienNhieuFact(vao).some((f) => f.question === "tiem_nang"), JSON.stringify(nhanDienNhieuFact(vao)));
for (const vao of ["đang cho thuê 20 triệu, bán 32 tỷ", "hợp để ở hoặc cho thuê", "cho thuê căn hộ Sunrise City quận 7"])
  ok("KHÔNG đổi loại " + JSON.stringify(vao), !nhanDienNhieuFact(vao).some((f) => f.question === "loai_giao_dich"), JSON.stringify(nhanDienNhieuFact(vao)));
// 15/09/2026 (bắn thật A2/A3): đáp án giá / m² cắt gọn, không ghi nguyên mệnh đề.
for (const [q, vao, mong] of [
  ["gia", "giá thì mình muốn tầm 4 tỷ 2", "tầm 4 tỷ 2"],
  ["gia", "ok vợ mình chốt 4 tỷ nha, sổ hồng có rồi", "4 tỷ"],
  ["gia", "à giá 7tr thôi em, bớt cho người ở lâu dài", "7tr"],
  ["gia", "4 tỷ 2", "4 tỷ 2"],
  ["gia", "bán 5 tỷ thương lượng", "5 tỷ thương lượng"],
  ["gia", "khoảng 9t5", "khoảng 9t5"],
  ["dien_tich_tim_tuong", "70m2 2pn", "70m2"],
  ["dien_tich", "tầm 62,5m2 anh ơi", "62,5m2"],
  ["dien_tich", "4x14 nở hậu 5m", "4x14 nở hậu 5m"],
]) ok(`catDapAn(${q}) ${JSON.stringify(vao)} → ${mong}`, catDapAn(q, vao) === mong, JSON.stringify(catDapAn(q, vao)));
for (const [vao, mong] of [
  ["giá thì mình muốn tầm 4 tỷ 2, để mình hỏi vợ đã nhé", "anh"],
  ["ok vợ mình chốt 4 tỷ nha", "anh"],
  ["để tôi hỏi ý bà xã", "anh"],
  ["chồng mình đi công tác, để chị hỏi lại", "chị"],
  ["ông xã tôi nói bán 5 tỷ", "chị"],
  ["vợ chồng mình đang tính bán", null],
]) ok("tuXungTuCau vợ/chồng " + JSON.stringify(vao), tuXungTuCau(vao) === mong, String(tuXungTuCau(vao)));
// 15/09 (bắn thật E4): câu hỏi trọn khi câu treo là loại CÓ/KHÔNG (gấp) → lệch, không khớp.
for (const q of ["gap", "thang_may", "tang", "gia", "phap_ly"])
  ok(`phanLoai(${q}) câu hỏi trọn → không khớp`, phanLoaiCauTraLoi(q, "bên bạn có cần mình gửi hình không hay sao").loai !== "khop", JSON.stringify(phanLoaiCauTraLoi(q, "bên bạn có cần mình gửi hình không hay sao")));
ok("laCauHoiTron 'không dính gì' → false", laCauHoiTron("không dính gì") === false);
ok("laCauHoiTron 'phí bên em sao?' → true", laCauHoiTron("phí bên em sao?") === true);
// 20/09/2026 (bắn thật mau-y-A, môi giới gõ không dấu): câu hỏi phí không dấu từng vào ô bổ sung.
ok("laCauHoiTron 'phi ben minh sao, co bat ky doc quyen ko' → true", laCauHoiTron("phi ben minh sao, co bat ky doc quyen ko") === true);
ok("laCauHoiTron 'ben em co bat ky doc quyen ko' → true", laCauHoiTron("ben em co bat ky doc quyen ko") === true);
ok("laCauHoiTron 'so hong rieng hoan cong du' → false", laCauHoiTron("so hong rieng hoan cong du") === false);
// 20/09/2026 (bắn thật mau-y-B): "phường 17 nhé, đường Phan Văn Trị" — sau khi bóc lời sửa phường, đáp án
// vị trí còn "nhé, đường Phan Văn Trị" → street = "nhé".
ok("catDapAn vi_tri bỏ tiểu từ đầu: 'nhé, đường Phan Văn Trị' → 'đường Phan Văn Trị'", catDapAn("vi_tri", "nhé, đường Phan Văn Trị") === "đường Phan Văn Trị", catDapAn("vi_tri", "nhé, đường Phan Văn Trị"));
ok("catDapAn vi_tri giữ nguyên câu sạch", catDapAn("vi_tri", "hẻm 4m Nguyễn Trãi") === "hẻm 4m Nguyễn Trãi");
// 20/09/2026 (bắn thật mau-y-D): lời sửa kích thước.
{
  const s1 = gonLoiSua("à sửa lại, dài 16 chứ không phải 15");
  ok("gonLoiSua: là lời sửa, dài 16, không ngang", s1.laSua && s1.dai === "16" && s1.ngang === null, JSON.stringify(s1));
  const s2 = gonLoiSua("sửa lại ngang 5 dài 20 nhé");
  ok("gonLoiSua: ngang 5 dài 20", s2.laSua && s2.ngang === "5" && s2.dai === "20", JSON.stringify(s2));
  const s3 = gonLoiSua("nhà nở hậu chút");
  ok("gonLoiSua: câu thường không phải lời sửa", !s3.laSua && s3.con === "nhà nở hậu chút", JSON.stringify(s3));
  const s4 = gonLoiSua("sai rồi em, hướng Tây Nam chứ không phải Đông Nam");
  ok("gonLoiSua: bỏ vỏ, còn 'hướng Tây Nam'", s4.laSua && /^hướng Tây Nam$/i.test(s4.con), JSON.stringify(s4));
}
ok("phanLoai(gap) 'không gấp' vẫn khớp", phanLoaiCauTraLoi("gap", "không gấp, được giá thì bán").loai === "khop", JSON.stringify(phanLoaiCauTraLoi("gap", "không gấp, được giá thì bán")));
ok("phanLoai(thang_may) 'có' vẫn khớp", phanLoaiCauTraLoi("thang_may", "có").loai === "khop", JSON.stringify(phanLoaiCauTraLoi("thang_may", "có")));
for (const [vao, mong] of [
  ["bên bạn có cần mình gửi hình không hay sao", true],
  ["phí bên bạn tính sao?", true],
  ["hẻm 5m xe hơi vô thoải mái", false],
  ["có sổ hồng riêng, không nợ ngân hàng", false],
  ["nhà không ngập", false],
  ["4 tỷ 2", false],
]) ok("laCauHoiTron " + JSON.stringify(vao), laCauHoiTron(vao) === mong, String(laCauHoiTron(vao)));

// 15/09/2026 (bắn thật N2/H2): fact theo số thứ tự căn; căn thứ tự không giá/kích thước không phải rao thêm;
// "bớt cho người ở lâu dài" là thương lượng, không phải thời hạn sử dụng.
ok("tachTheoCan 2 nhóm", JSON.stringify(tachTheoCan("căn 2 sổ hồng riêng, có thương lượng. căn 1 đúc 3 tấm")) === JSON.stringify([{ thu: 2, manh: "sổ hồng riêng, có thương lượng" }, { thu: 1, manh: "đúc 3 tấm" }]), JSON.stringify(tachTheoCan("căn 2 sổ hồng riêng, có thương lượng. căn 1 đúc 3 tấm")));
ok("tachTheoCan '2 căn' / 'căn 2 pn' không phải thứ tự", tachTheoCan("có 2 căn, căn 2 pn giá 3 tỷ").length === 0, JSON.stringify(tachTheoCan("có 2 căn, căn 2 pn giá 3 tỷ")));
ok("nhanDienNhieuCan: căn thứ tự chỉ mang fact → không rao thêm", nhanDienNhieuCan("căn 2 sổ hồng riêng, có thương lượng. căn 1 đúc 3 tấm").length === 0, JSON.stringify(nhanDienNhieuCan("căn 2 sổ hồng riêng, có thương lượng. căn 1 đúc 3 tấm")));
ok("nhanDienNhieuCan: căn thứ tự có giá vẫn là rao nhiều căn", nhanDienNhieuCan("căn 1 hẻm 7m Hồng Bàng 4x18 giá 12 tỷ, căn 2 mặt tiền Nguyễn Chí Thanh 5x20 giá 25 tỷ").length === 2);
ok("'bớt cho người ở lâu dài' → thuong_luong", nhanDienNhieuFact("à giá 7tr thôi em, bớt cho người ở lâu dài").some((f) => f.question === "thuong_luong") && !nhanDienNhieuFact("à giá 7tr thôi em, bớt cho người ở lâu dài").some((f) => /thoi_han|so_huu/.test(f.question)), JSON.stringify(nhanDienNhieuFact("à giá 7tr thôi em, bớt cho người ở lâu dài")));
ok("'căn hộ sở hữu lâu dài' vẫn là so_huu", nhanDienFact("căn hộ sở hữu lâu dài")?.question === "so_huu", JSON.stringify(nhanDienFact("căn hộ sở hữu lâu dài")));

// 15/09/2026 (bắn thật A2/C2): thu nhập thuê của tin BÁN không phải giá mong muốn.
for (const vao of ["à quên, nhà đang cho thuê 25 triệu/tháng, khách thuê tới cuối năm", "căn 2 đang cho thuê 80 triệu/tháng"]) {
  const ds = nhanDienNhieuFact(vao);
  // 22/09/2026 (kịch bản D): "đang cho thuê 30 triệu/tháng" nay là doanh_thu (dòng tiền → rent_income_vnd), vẫn không phải giá.
  ok("thu nhập thuê không thành giá " + JSON.stringify(vao.slice(0, 40)), !ds.some((f) => f.question === "gia") && ds.some((f) => f.question === "doanh_thu" || f.question === "hien_trang_su_dung"), JSON.stringify(ds));
}
ok("giá thuê của tin THUÊ vẫn là giá", nhanDienNhieuFact("cho thuê 18 triệu/tháng cọc 2 tháng").some((f) => f.question === "gia"), JSON.stringify(nhanDienNhieuFact("cho thuê 18 triệu/tháng cọc 2 tháng")));
ok("tachCauHoiNguoc tách sau dấu chấm", tachCauHoiNguoc("nhà đang cho thuê 25 triệu/tháng, khách thuê tới cuối năm. mà giá khu này giờ bao nhiêu 1m2 em?").hoi === "mà giá khu này giờ bao nhiêu 1m2 em?", JSON.stringify(tachCauHoiNguoc("nhà đang cho thuê 25 triệu/tháng, khách thuê tới cuối năm. mà giá khu này giờ bao nhiêu 1m2 em?")));

// 15/09/2026 (bắn thật A3): câu nhiều ý có ý đang hỏi + tiền của ý khác → KHỚP, không "bổ sung".
ok("phanLoai(so_phong_ngu) '3 phòng ngủ em. nhà đang cho thuê 25 triệu/tháng' → khop", phanLoaiCauTraLoi("so_phong_ngu", "3 phòng ngủ em. nhà đang cho thuê 25 triệu/tháng tới cuối năm nha").loai === "khop", JSON.stringify(phanLoaiCauTraLoi("so_phong_ngu", "3 phòng ngủ em. nhà đang cho thuê 25 triệu/tháng tới cuối năm nha")));
ok("catDapAn(so_phong_ngu) lấy đúng số phòng, không dính tiền thuê", catDapAn("so_phong_ngu", "3 phòng ngủ em. nhà đang cho thuê 25 triệu/tháng tới cuối năm nha") === "3", catDapAn("so_phong_ngu", "3 phòng ngủ em. nhà đang cho thuê 25 triệu/tháng tới cuối năm nha"));
ok("phanLoai(dien_tich) '5 tỷ' vẫn lệch", phanLoaiCauTraLoi("dien_tich", "5 tỷ").loai !== "khop", JSON.stringify(phanLoaiCauTraLoi("dien_tich", "5 tỷ")));

// 16/09/2026 (Zalo thật, ảnh chụp chủ dự án): khách xưng chú/cô/bác; "nhà trong hẻm" không phải
// "nhà trống"; "diện tích tổng 240m2" của nhà 4 tấm là SÀN; "Căn số 14 ở Ny'ah" là vị trí.
for (const [vao, mong] of [
  ["Chào cháu chú có căn nhà này cần giao bán", "chú"],
  ["cô cần bán căn nhà ở quận 8 nha con", "cô"],
  ["nhà của bác ở hẻm 5m, để bác hỏi con bác đã", "bác"],
  ["dạ cháu, chú đang có căn ở phú định", "chú"],
  ["chủ cần bán gấp, 5 tỷ", null],          // "chủ" là chủ nhà (môi giới nói), không phải "chú"
  ["có căn nhà cần bán ở q5", null],         // "có" không phải "cô"
  ["cô giáo của con bán nhà", null],         // người thứ ba
  ["chu can ban nha o q8", null],            // không dấu: "chu" mập mờ (chủ/chú) → không đoán
]) ok(`tuXungTuCau lớn tuổi "${vao}"`, tuXungTuCau(vao) === mong, String(tuXungTuCau(vao)));
// 22/09/2026 (chủ dự án: "người ta chào là cô chào cháu nó vẫn đáp anh chị"): lời CHÀO cũng là tự xưng.
for (const [vao, mong] of [
  ["cô chào cháu", "cô"],
  ["Cô chào cháu", "cô"],
  ["chú chào cháu nha", "chú"],
  ["bác chào con", "bác"],
  ["chào cháu, cô đây", "cô"],
  ["chào cháu", null],               // chưa biết chú hay cô → laChaoChau lo
  ["cô giáo chào cháu", null],       // người thứ ba
  ["co chao chau", null],            // không dấu: "co" mập mờ
  ["chào em, anh cần bán nhà", "anh"],
]) ok(`tuXungTuCau lời chào "${vao}"`, tuXungTuCau(vao) === mong, String(tuXungTuCau(vao)));
for (const [vao, mong] of [["cô", "cô"], ["Cô", "cô"], ["chú nha", "chú"], ["dạ bác", "bác"], ["có", null], ["co", null], ["cô có căn nhà", null], ["chị", "chị"]])
  ok(`batXungHo trơ "${vao}"`, batXungHo(vao) === mong, String(batXungHo(vao)));
for (const [vao, mong] of [["chào cháu", true], ["Chào con!", true], ["chào cháu, cô đây", true], ["chào em", false], ["cháu chào cô", false], ["chao chau", false]])
  ok(`laChaoChau "${vao}"`, laChaoChau(vao) === mong);
// 22/09/2026 kịch bản D/E: nở hậu "4m5", dòng tiền "đang cho thuê 30 triệu/tháng", rao lại, chọn căn theo loại.
for (const [vao, q, a] of [["nở hậu 4m5", "no_hau", "4.5m"], ["nở hậu 4.5m", "no_hau", "4.5m"], ["nở hậu hơn 5m", "no_hau", "5m"],
  ["nhà cô đang cho thuê 30 triệu/tháng", "doanh_thu", "30 triệu/tháng"], ["đang cho thuê 15 triệu 1 tháng", "doanh_thu", "15 triệu/tháng"], ["đang cho thuê 12tr5/th", "doanh_thu", "12 triệu 5/tháng"]])
  ok(`nhanDienFact ${JSON.stringify(vao)} → ${q}=${a}`, nhanDienFact(vao)?.question === q && nhanDienFact(vao)?.answer === a, JSON.stringify(nhanDienFact(vao)));
ok("nhanDienFact 'đang thế chấp ngân hàng' → the_chap (không phải phap_ly)", nhanDienFact("đang thế chấp ngân hàng")?.question === "the_chap", JSON.stringify(nhanDienFact("đang thế chấp ngân hàng")));
ok("nhanDienFact 'sổ hồng chung, đang thế chấp' nhiều fact → phap_ly + the_chap", nhanDienNhieuFact("sổ hồng chung với em gái, đang thế chấp ngân hàng").map((f) => f.question).join(",") === "phap_ly,the_chap", JSON.stringify(nhanDienNhieuFact("sổ hồng chung với em gái, đang thế chấp ngân hàng")));
ok("nhanDienFact 'ngang 4 dài 20, nở hậu 4m5' nhiều fact có no_hau 4.5m", nhanDienNhieuFact("ngang 4 dài 20, nở hậu 4m5").some((f) => f.question === "no_hau" && f.answer === "4.5m"), JSON.stringify(nhanDienNhieuFact("ngang 4 dài 20, nở hậu 4m5")));
ok("nhanDienFact 'cho thuê 12 triệu/tháng' (câu rao thuê, không 'đang') KHÔNG phải doanh_thu", nhanDienFact("cho thuê 12 triệu/tháng")?.question !== "doanh_thu", JSON.stringify(nhanDienFact("cho thuê 12 triệu/tháng")));
for (const [vao, mong] of [["mở lại căn 2 chung cư đi, nó chưa bán, đăng căn 2 lên giúp tui", true], ["rao lại căn chung cư Hùng Vương Plaza đi em, căn đó chưa bán", true], ["đăng lại tin đi", true],
  ["căn đó chưa bán, mở lên lại giúp anh", true], ["bán rồi hả em?", false], ["bán lại giá tốt cho khách", false], ["căn 1 bán rồi nha, còn căn 2 thôi", false], ["3 phòng ngủ", false]])
  ok(`laRaoLai ${JSON.stringify(vao)} → ${mong}`, laRaoLai(vao) === mong);
{
  const cans = [{ id: "a", location_raw: "hẻm 3m Trần Hưng Đạo", property_type: "nha_pho" }, { id: "b", location_raw: null, property_type: "chung_cu" }];
  ok("chonCanTheoCau 'căn 1 bán rồi nha, còn căn 2 thôi' → căn 1 (số thứ tự đầu)", chonCanTheoCau("căn 1 bán rồi nha, còn căn 2 thôi", cans)?.id === "a");
  ok("chonCanTheoCau 'rao lại căn chung cư đi' → căn chung cư duy nhất", chonCanTheoCau("rao lại căn chung cư đi", cans)?.id === "b");
  ok("chonCanTheoCau 'bán rồi' (không chỉ căn) → null", chonCanTheoCau("bán rồi", cans) === null);
}
// 23/09/2026 (Zalo thật): "chào cháu, ông bán nhà Trần Bình Trọg Q5 7 tỷ" → bot đáp "Dạ cháu chào mình ạ!".
for (const [vao, mong] of [
  ["chào cháu, ông bán nhà Trần Bình Trọg Q5 7 tỷ", "ông"],
  ["chào cháu, bà có căn nhà hẻm ở quận 10", "bà"],
  ["bà chào cháu", "bà"],
  ["ông chào con nha", "ông"],
  ["chào cháu, ông đây", "ông"],
  ["để ông hỏi con ông đã", "ông"],
  ["bà bận, mai nói tiếp", "bà"],
  ["ông bà để lại căn nhà này, cần bán", null],   // người thứ ba
  ["nhà bà ngoại ở quận 5 cần bán", null],        // sở hữu: không nhận ông/bà
  ["ông chủ cần bán gấp", null],
  ["bà con ai cần mua nhà không", null],
  ["ong ban nha q5", null],                        // không dấu: "ong" mập mờ
]) ok(`tuXungTuCau ông/bà "${vao}"`, tuXungTuCau(vao) === mong, String(tuXungTuCau(vao)));
for (const [vao, mong] of [["ông", "ông"], ["dạ bà", "bà"], ["kêu bà nha", "bà"], ["gọi là ông", "ông"], ["gọi ông chủ ra đây", null], ["ba", null], ["3 phòng ngủ, ba toilet", null]])
  ok(`batXungHo ông/bà "${vao}"`, batXungHo(vao) === mong, String(batXungHo(vao)));
// Chủ dự án 23/09: "thím dượng chú, cậu…" — họ hàng hay gặp, bot xưng cháu.
for (const [vao, mong] of [
  ["dì chào cháu", "dì"],
  ["chào cháu, cậu có miếng đất ở Củ Chi", "cậu"],
  ["mợ cần bán căn hộ quận 7", "mợ"],
  ["dạ cháu, thím đang có căn nhà hẻm", "thím"],
  ["dượng muốn bán nhà 5 tỷ", "dượng"],
  ["nhà dì tôi ở quận 5 cần bán", null],   // sở hữu: người thứ ba
  ["cậu ấy muốn bán nhà", null],
  ["di ban nha q5", null],                 // không dấu: "di" là "đi"
]) ok(`tuXungTuCau họ hàng "${vao}"`, tuXungTuCau(vao) === mong, String(tuXungTuCau(vao)));
for (const [vao, mong] of [["dì", "dì"], ["dạ thím", "thím"], ["kêu dượng nha", "dượng"], ["gọi cậu nha", "cậu"]])
  ok(`batXungHo họ hàng "${vao}"`, batXungHo(vao) === mong, String(batXungHo(vao)));
ok("suyTuXungHo cậu/dượng → nam, dì/mợ/thím → nữ, đều lớn tuổi",
  ["cậu", "dượng"].every((x) => suyTuXungHo(x).gioi_tinh === "nam" && suyTuXungHo(x).nhom_tuoi === "lon_tuoi") &&
  ["dì", "mợ", "thím"].every((x) => suyTuXungHo(x).gioi_tinh === "nu" && suyTuXungHo(x).nhom_tuoi === "lon_tuoi"));
ok("suyTuXungHo ông → nam lớn tuổi, bà → nữ lớn tuổi",
  JSON.stringify(suyTuXungHo("ông")) === JSON.stringify({ gioi_tinh: "nam", nhom_tuoi: "lon_tuoi" }) &&
  JSON.stringify(suyTuXungHo("bà")) === JSON.stringify({ gioi_tinh: "nu", nhom_tuoi: "lon_tuoi" }));
ok("tuXungBot ông/bà → cháu", tuXungBot("ông") === "cháu" && tuXungBot("bà") === "cháu");
ok("CHAO_SUONG_RE: 'co chao chau' (bỏ dấu) là chào suông → ack, không ghi", CHAO_SUONG_RE.test("co chao chau") && CHAO_SUONG_RE.test("chu chao chau nha") && !CHAO_SUONG_RE.test("co chao chau, co co can nha"));
{
  const c = "Nhà trong hẻm 2 xẹc nhưng hẻm rộng 5m nhà 4 tấm diện tích tổng 240m2";
  const ds = nhanDienNhieuFact(c);
  ok("'nhà trong hẻm…' KHÔNG phải nội thất", !ds.some((f) => f.question === "noi_that") && nhanDienFact(c)?.question === "do_rong_hem", JSON.stringify(ds));
  ok("'nhà 4 tấm diện tích tổng 240m2' → sàn 240m2 + kết cấu 4 tấm, không diện tích đất",
    ds.some((f) => f.question === "dien_tich_san" && f.answer === "240m2") && ds.some((f) => f.question === "ket_cau" && /4 t[aấ]m/.test(f.answer)) && !ds.some((f) => /^dien_tich$|dien_tich_dat/.test(f.question)), JSON.stringify(ds));
  ok("phanLoai(dien_tich_dat) câu đó → lệch (không đóng câu đất)", phanLoaiCauTraLoi("dien_tich_dat", c).loai === "lech", JSON.stringify(phanLoaiCauTraLoi("dien_tich_dat", c)));
  ok("kết cấu fact kèm giữ dấu: '4 tấm'", ds.find((f) => f.question === "ket_cau")?.answer === "4 tấm", JSON.stringify(ds));
  ok("bocViTriRao 'Căn số 14 ở Ny'ah Phú Định, 80m2, giá 7 tỷ' → 'Căn số 14 ở Ny'ah Phú Định'", bocViTriRao("Căn số 14 ở Ny'ah Phú Định, 80m2, giá 7 tỷ") === "Căn số 14 ở Ny'ah Phú Định", String(bocViTriRao("Căn số 14 ở Ny'ah Phú Định, 80m2, giá 7 tỷ")));
  for (const t of ["Hello", "chào em", "alo em ơi", "hi"]) ok(`lời chào suông "${t}" → ack`, phanLoaiCauTraLoi("hinh_anh", t).loai === "ack", JSON.stringify(phanLoaiCauTraLoi("hinh_anh", t)));
  ok("'Hello, nhà 3 tầng' không phải ack", phanLoaiCauTraLoi("hinh_anh", "Hello, nhà 3 tầng").loai !== "ack");
  ok("'nhà trống' vẫn là nội thất", nhanDienFact("nhà trống")?.question === "noi_that", JSON.stringify(nhanDienFact("nhà trống")));
  ok("'dtsd 120m2' → sàn", nhanDienFact("dtsd 120m2")?.question === "dien_tich_san", JSON.stringify(nhanDienFact("dtsd 120m2")));
  ok("'tổng diện tích đất 500m2' → diện tích (đất), không phải sàn", nhanDienFact("lô 2 tấm, tổng diện tích đất 500m2")?.question === "dien_tich", JSON.stringify(nhanDienFact("lô 2 tấm, tổng diện tích đất 500m2")));
  ok("'tổng diện tích 500m2' không có tầng → diện tích", nhanDienFact("tổng diện tích 500m2")?.question === "dien_tich", JSON.stringify(nhanDienFact("tổng diện tích 500m2")));
}
{
  const c = "Căn số 14 ở ny’ah phú định";
  ok("nhanDienFact 'Căn số 14 ở ny’ah phú định' → vi_tri", nhanDienFact(c)?.question === "vi_tri", JSON.stringify(nhanDienFact(c)));
  ok("phanLoai(vi_tri) câu đó → khớp", phanLoaiCauTraLoi("vi_tri", c).loai === "khop", JSON.stringify(phanLoaiCauTraLoi("vi_tri", c)));
  for (const q of ["gia", "ket_cau", "so_phong_ngu"]) ok(`phanLoai(${q}) 'Căn số 14…' → lệch sang vi_tri`, phanLoaiCauTraLoi(q, c).loai === "lech" && phanLoaiCauTraLoi(q, c).chuyenSang?.question === "vi_tri", JSON.stringify(phanLoaiCauTraLoi(q, c)));
  ok("phanLoai(gia) '5 tỷ' vẫn khớp", phanLoaiCauTraLoi("gia", "5 tỷ").loai === "khop");
  // 16/09 (bắn thật mau-chu-q8): "quận 8" còn lại sau khi lời sửa bóc "phường 16" → không phải giá.
  for (const t of ["quận 8", "q8", "phường 16 quận 8", "p16"]) ok(`phanLoai(gia) "${t}" → không khớp giá`, phanLoaiCauTraLoi("gia", t).loai !== "khop", JSON.stringify(phanLoaiCauTraLoi("gia", t)));
  ok("phanLoai(so_phong_ngu) 'quận 8' → ack", phanLoaiCauTraLoi("so_phong_ngu", "quận 8").loai === "ack");
  // 16/09 (bắn thật mau-co-thue): câu rao "muốn cho thuê" không phải tiềm năng; "cháu là bot hay
  // người" là câu hỏi; thời hạn thuê chỉ lấy mảnh.
  ok("'cô có căn chung cư ở q7 muốn cho thuê' KHÔNG phải tiềm năng", nhanDienFact("cô có căn chung cư ở q7 muốn cho thuê")?.question !== "tiem_nang", JSON.stringify(nhanDienFact("cô có căn chung cư ở q7 muốn cho thuê")));
  ok("'hợp để ở hoặc cho thuê' vẫn là tiềm năng", nhanDienFact("hợp để ở hoặc cho thuê")?.question === "tiem_nang", JSON.stringify(nhanDienFact("hợp để ở hoặc cho thuê")));
  ok("laCauHoiTron 'à mà cháu là bot hay người vậy'", laCauHoiTron("à mà cháu là bot hay người vậy") && phanLoaiCauTraLoi("phuong", "à mà cháu là bot hay người vậy").loai === "hoi", JSON.stringify(phanLoaiCauTraLoi("phuong", "à mà cháu là bot hay người vậy")));
  // 17/09 (Zalo thật, chủ dự án): số đo không phải phường; ngang+dọc là diện tích; "hẻm 2 xẹc" không phải địa chỉ;
  // "…bot hay người vậy Tr" vẫn là câu hỏi; "srh" là shr.
  ok("phanLoai(phuong) 'ngang 5m còn dọc 18m' → lệch sang diện tích", phanLoaiCauTraLoi("phuong", "ngang 5m còn dọc 18m").chuyenSang?.question === "dien_tich", JSON.stringify(phanLoaiCauTraLoi("phuong", "ngang 5m còn dọc 18m")));
  for (const [t, mong] of [["5", "khop"], ["phường 5", "khop"], ["p5 q8", "khop"], ["Phường 16 quận 8", "khop"], ["phường 5 nha, anh bận", "khop"], ["Tân Hưng", "khop"], ["5m", "lech"], ["50m2", "lech"]]) ok(`phanLoai(phuong) "${t}" → ${mong}`, phanLoaiCauTraLoi("phuong", t).loai === mong, JSON.stringify(phanLoaiCauTraLoi("phuong", t)));
  ok("nhanDienFact 'ngang 5m còn dọc 18m' → dien_tich 'ngang 5m dài 18m'", nhanDienFact("ngang 5m còn dọc 18m")?.answer === "ngang 5m dài 18m" && nhanDienFact("ngang 5m còn dọc 18m")?.question === "dien_tich", JSON.stringify(nhanDienFact("ngang 5m còn dọc 18m")));
  ok("bocViTriRao 'Nhà trong hẻm 2 xẹc nhưng hẻm rộng 5m…' → null", bocViTriRao("Nhà trong hẻm 2 xẹc nhưng hẻm rộng 5m nhà 4 tấm") === null, String(bocViTriRao("Nhà trong hẻm 2 xẹc nhưng hẻm rộng 5m nhà 4 tấm")));
  ok("laCauHoiTron 'à mà cháu là bot hay người vậy\\tTr' (đuôi rác)", laCauHoiTron("à mà cháu là bot hay người vậy\tTr"));
  ok("'srh' → pháp lý", nhanDienFact("srh")?.question === "phap_ly");
  ok("'cọc 2 tháng, ở tối thiểu 1 năm' → thời hạn chỉ mảnh", nhanDienNhieuFact("cọc 2 tháng, ở tối thiểu 1 năm").find((f) => f.question === "thoi_han_thue")?.answer === "ở tối thiểu 1 năm", JSON.stringify(nhanDienNhieuFact("cọc 2 tháng, ở tối thiểu 1 năm")));
  ok("phanLoai(gia) '8' vẫn khớp (số trần)", phanLoaiCauTraLoi("gia", "8").loai === "khop");
  ok("phanLoai(ket_cau) '3 tấm' vẫn khớp", phanLoaiCauTraLoi("ket_cau", "3 tấm").loai === "khop");
}

console.log(hong ? `\nBÓC TÁCH 42 CA: ${hong}/${tong} CA HỎNG` : `\nBÓC TÁCH 42 CA: ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);
