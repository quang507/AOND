// van-tra-loi.mjs — lỗi còn chờ sau lượt bắn 20 tin thật 12/09/2026, phần TS.
// Tiền định: không mạng, không DB, không model.
//   bun bot/tests/van-tra-loi.mjs
//
// Phần SQL (tầng căn hộ, giá "/tháng", tên đường "m Nguyễn Trãi") ở migration
// 20260913a — đã chạy thử trên DB bằng khối DO rollback, không nằm ở đây.
import { boCauHoiLap, boCauHuaLoc, boHuaTuKiemTra, boLapCum, chuanKhuVucMua, giongCauHoi, loaiKhoTuHoSo, boCauTrung, boDoanGioiDauCau, boGoiDoanGioi, boGoiCuoiVaOi, boKhenKhongCanCu, boMauThuanCan, boTenRiengBia, boCauGhiNhan, boGachCheo, boHoiMucDich, chanHuaCoHang, dapHoiNguocTienDinh, laLoiMeta, laNoiVoiBot, laXinBoTruong, laXinSoKhach, laXinXoaDuLieu, boCauSuaLaiModel, motCauHoi, motCauHoiLuot, chanNhanLaNguoi, gopGhiChu, laCauGhiNhan, laHoiCoHang, laHoiMucDich, laHuaCoHang, laNhanLaNguoi, locHoSoMua, suaTuXungMua, doiTuXung, vuaKhen, boCauKhen } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { boCauNoiHeThong, boCauTroNguocDauBong, goTuNoiDau, coMenhDeDaDang, boCauNhanXet as boCauNhanXetU } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { thanhBongBong } from "../supabase/functions/_shared/ai/tro-ly.ts";
import { boHuaDaDang, boKhenViTri, botXungEm, laHoiLechKhoa, laSoDoBia, thayCauHoiLech } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { boCanBia, boCauVongLai, boDoanPhuongDiaDanh, chanBiaDuKien, chanHuaGuiHinh, laHuaGuiHinh, laHuaHoiChu, suaBotXungNhamKhach, suaKhenNguocNghia } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { boCauGhiTienKhongCo, boCauM2KhongCo, boGachDai, boHoiHoanCong, laKhachBaoHieuNham, themXinLoiKhiHieuNham, laKhenSai, boMenhDeKhenSai, boMaTinKhach, coNhacCan, bongBongGoiYCan, boCauHoiDo, boDacDiemKhongCo } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { FEE_RULES, LOI_CHAO } from "../supabase/functions/_shared/prompts.ts";
import { duAnLaTenDuong } from "../supabase/functions/_shared/extraction/boc-cau-rao.ts";
import { boChaoLai, boViTriBia, giuVeCauMau, boCauLapLai, boTienBia, goiCanHo, giuCauDungTen, suaGapTheoDeal, boGhiNhanSuong, boKhenThiTruong, goiDat } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { laGatHoiVai, laCauChungChung } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { canGanManh, donManh } from "../supabase/functions/_shared/extraction/gan-manh-loc.ts";
import { chonCauKe, nhanDienNhieuCan, tachTheoCan, themTangPhu, phanLoaiCauTraLoi, ghepMotChieu, soNhaDau, bocViTriRao, catDapAn, laNoiDaTraLoi, laNgungRao, laRaoLai, laRutLoiBan } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { docTien, donViGiaDep, gonGiaKyHan } from "../supabase/functions/_shared/extraction/luat-tien.ts";
import { nhanDienFact } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { tuXungTuCau, hocXungHoTuLichSu, docTraLoiLung } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { soanTinNhap } from "../supabase/functions/_shared/tin-nhap.ts";
import { CAU_TIEN_DINH, dienCau } from "../supabase/functions/_shared/prompts.ts";
import { boHoiLaiDaCo, boHuaHoiChuNha } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { gonLoiSua, nhanDienNhieuFact, laTraLoiTronKhoa } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { chuanHienTrang, diaChiGon } from "../supabase/functions/_shared/tin-nhap.ts";
import { gonGiaTriFact, laChiDonViHanhChinh, tachDapCoKhongDau } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { boHoaHong } from "../supabase/functions/_shared/extraction/luat-lien-he.ts";
import { bocTachTaoTin, kemLuotTao, tomTatDaLuu, tomTatTrongCau, traLoiCauBot, vuaLuuBan, vuaLuuMua } from "../supabase/functions/_shared/bao_lai.ts";

let hong = 0, tong = 0;
const ok = (ten, dat, chi = "") => {
  tong++;
  if (!dat) hong++;
  console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`);
};

// ── Câu hứa có hàng (chỉ bị chặn khi model không có căn nào trong tay) ───────
for (const [cau, mong] of [
  ["Dạ có em.", true],
  ["Có ạ!", true],
  ["Em đang có vài căn 3 phòng, hẻm xe hơi tầm 7 tỷ gần các bệnh viện khu Quận 5.", true],
  ["Bên em hiện có 3 căn đúng tầm giá này.", true],
  ["Để em xem xem căn nào phù hợp nhất với chị nhé.", true],
  ["Em có nhà mặt tiền Quận 10 nè anh.", true],
  // KHÔNG được chặn
  ["Anh tìm để ở hay đầu tư kinh doanh ạ?", false],
  ["Chị có muốn nhà hẻm xe hơi không ạ?", false],
  ["Bên em có anh Thu phụ trách khu vực Sài Gòn.", false],
  ["Có căn mới hợp là em báo anh/chị liền nha.", false],
  ["Anh có cần gần trường không ạ?", false],
  ["Dạ được chị.", false],
  ["Chị cần mấy phòng ngủ vậy ạ?", false],
  ["Nếu có căn nào hợp em gửi chị liền.", false],
]) ok(`laHuaCoHang "${cau}"`, laHuaCoHang(cau) === mong, String(laHuaCoHang(cau)));

ok("'Dạ có ạ.' trả lời câu KHÔNG hỏi hàng → không chặn", !laHuaCoHang("Dạ có ạ.", false));
// 23/09/2026 (bắn thật, người thuê Q7, kho trống): hứa lọc căn rồi không gửi gì. Câu HỎI tiêu chí không bắt.
for (const [cau, mong] of [["Dạ em lọc căn 2PN Quận 7 quanh 15 triệu cho anh nhé :)", true], ["Để em tìm căn hộ 2 phòng ngủ cho chị nha", true],
  ["Dạ cháu tìm nhà cho chú liền ạ", true], ["Em lọc căn cho anh theo khu vực nào ạ?", false], ["Anh cần căn mấy phòng ngủ ạ?", false]])
  ok(`laHuaCoHang hứa lọc ${JSON.stringify(cau)} → ${mong}`, laHuaCoHang(cau) === mong, String(laHuaCoHang(cau)));
ok("'em đang có vài căn' vẫn chặn dù khách không hỏi hàng", laHuaCoHang("Em đang có vài căn 3 phòng.", false));
// 20/09/2026 (bắn thật mau-y-C): hai lượt né "để em kiểm tra … rồi báo" khi kho trống.
for (const cau of [
  "Dạ mình để em kiểm tra hẻm 4m Nguyễn Trãi rồi báo liền ạ.",
  "Em kiểm tra kho rồi báo mình liền ạ.",
  "Đang kiểm tra hẻm 4m Nguyễn Trãi và mở rộng khu vực gần đó, sắp báo mình liền.",
]) ok(`né kho trống: "${cau}" bị chặn`, laHuaCoHang(cau, false));
ok("câu trả lời thật không bị chặn: 'Dạ hiện bên em chưa có căn nào khớp…'", !laHuaCoHang("Dạ hiện bên em chưa có căn nào khớp đúng nhu cầu này ạ.", false));
ok("câu hỏi nhu cầu không bị chặn", !laHuaCoHang("Anh muốn ở khu nào để em lọc cho gần?", false));
// 20/09/2026 (bắn thật mau-y-A): hỏi phí KHÔNG DẤU vẫn có đáp án tiền định.
ok("dapHoiNguocTienDinh phí không dấu", /1%/.test(dapHoiNguocTienDinh("phi ben minh sao, co bat ky doc quyen ko", "anh", "phí chỉ thu khi giao dịch thành công là 1% giá chốt") ?? ""));
for (const [cau, mong] of [
  ["có căn nào quận 10 tầm 5 tỷ không em", true],
  ["còn nhà nào tầm 7 tỷ hông em", true],
  ["bên em có căn nào gần bệnh viện ko", true],
  ["có hỗ trợ vay không em", false],
  ["3 phòng ngủ em, hẻm xe hơi là được", false],
  ["bên em có thu phí không", false],
]) ok(`laHoiCoHang "${cau}"`, laHoiCoHang(cau) === mong, String(laHoiCoHang(cau)));

{
  const loi = "hiện bên em chưa có căn nào khớp đúng nhu cầu này ạ. Em ghi lại rồi, có căn mới hợp là em báo chị liền nha.";
  const a = chanHuaCoHang(
    ["Dạ được chị. Em đang có vài căn 3 phòng, hẻm xe hơi tầm 7 tỷ gần các bệnh viện khu Quận 5. Để em xem xem căn nào phù hợp nhất với chị nhé."],
    loi,
  );
  ok("chặn: giữ 'Dạ được chị.', lời thật đứng thay đúng chỗ, không lặp",
    a.daChan && a.replies.length === 1 && a.replies[0] === `Dạ được chị. Hiện bên em chưa có căn nào khớp đúng nhu cầu này ạ. Em ghi lại rồi, có căn mới hợp là em báo chị liền nha.`,
    JSON.stringify(a.replies));
  const b = chanHuaCoHang(["Dạ có em. Anh tìm để ở hay đầu tư kinh doanh ạ?"], "em lọc kho theo đúng nhu cầu của anh/chị rồi báo lại liền nha.");
  ok("chặn: câu đầu bị bỏ thì lời thật mở bằng 'Dạ', câu hỏi còn nguyên",
    b.replies[0] === "Dạ em lọc kho theo đúng nhu cầu của anh/chị rồi báo lại liền nha. Anh tìm để ở hay đầu tư kinh doanh ạ?",
    JSON.stringify(b.replies));
  const c = chanHuaCoHang(["Dạ chị cần mấy phòng ngủ ạ?"], loi);
  ok("không vi phạm → trả nguyên mảng", !c.daChan && c.replies[0] === "Dạ chị cần mấy phòng ngủ ạ?", JSON.stringify(c));
}

// ── 13/09 lượt bắn thứ hai: hai kẽ van kho + nhận là người thật ─────────────
ok("kho: 'Dạ có anh/chị!' (dấu gạch chéo) vẫn là hứa", laHuaCoHang("Dạ có anh/chị!"));
ok("kho: 'Dạ em tìm vài căn hẻm xe hơi… cho chị xem nha' là hứa", laHuaCoHang("Dạ em tìm vài căn hẻm xe hơi 3 phòng gần bệnh viện quanh tầm 7 tỷ cho chị xem nha."));
ok("kho: 'Em gửi 2 căn này chị xem nha' — CÓ căn thì tầng trên không gọi van; câu vẫn nhận là hứa", laHuaCoHang("Em gửi 2 căn này chị xem nha."));
for (const [cau, mong] of [
  ["Em là người thật, không phải máy đâu anh/chị.", true],
  ["Dạ em là người thật ạ.", true],
  ["Em không phải bot đâu chị.", true],
  ["Mình là con người bình thường thôi anh.", true],
  // KHÔNG được chặn
  ["Dạ em là M•ai bên AI Ơi Nhà Đất ạ.", false],
  ["Bên em có anh Thu là người thật phụ trách khu vực.", false],
  ["Không phải ai cũng mua được giá này đâu chị.", false],
  ["Nhà không phải máy lạnh âm trần đâu anh.", false],
  ["Em là trợ lý AI bên AI Ơi Nhà Đất ạ.", false],
]) ok(`laNhanLaNguoi "${cau}"`, laNhanLaNguoi(cau) === mong, String(laNhanLaNguoi(cau)));
{
  const ra = chanNhanLaNguoi(["Dạ em là M•ai bên AI Ơi Nhà Đất ạ. Em là người thật, không phải máy đâu anh/chị. Bây giờ mình đang tìm mua hay thuê nhà ạ?"], "mình");
  ok("thay câu nhận là người bằng câu thật, giữ lời chào và câu hỏi quay lại việc",
    ra.length === 1 && /^Dạ em là M•ai bên AI Ơi Nhà Đất ạ\. Em là trợ lý AI bên AI Ơi Nhà Đất.*theo sát mình ạ\. Bây giờ mình đang tìm mua/.test(ra[0]) && !/người thật, không phải máy/.test(ra[0]),
    JSON.stringify(ra));
  const y = ["Dạ chị cần mấy phòng ngủ ạ?"];
  ok("không vi phạm → trả nguyên mảng", chanNhanLaNguoi(y, "chị") === y);
}

// ── Ghi chú người mua không lặp ─────────────────────────────────────────────
ok("gộp: model trả lại cả ý cũ lẫn ý mới → chỉ thêm ý mới",
  gopGhiChu("mẹ già ở cùng", "mẹ già ở cùng; muốn gần bệnh viện") === "mẹ già ở cùng; muốn gần bệnh viện",
  String(gopGhiChu("mẹ già ở cùng", "mẹ già ở cùng; muốn gần bệnh viện")));
ok("gộp: y hệt ý cũ (khác dấu chấm) → null", gopGhiChu("mẹ già ở cùng; muốn gần bệnh viện", "Mẹ già ở cùng.") === null,
  String(gopGhiChu("mẹ già ở cùng; muốn gần bệnh viện", "Mẹ già ở cùng.")));
ok("gộp: ý mới đầy đủ hơn → thay ý cũ",
  gopGhiChu("mẹ già ở cùng", "mẹ già ở cùng, đi lại khó") === "mẹ già ở cùng, đi lại khó",
  String(gopGhiChu("mẹ già ở cùng", "mẹ già ở cùng, đi lại khó")));
ok("gộp: ý ngắn không nuốt ý khác ('gần chợ' ≠ 'gần chợ Bến Thành đi bộ')",
  gopGhiChu("gần chợ Bến Thành đi bộ", "gần chợ") === "gần chợ Bến Thành đi bộ; gần chợ",
  String(gopGhiChu("gần chợ Bến Thành đi bộ", "gần chợ")));

// ── Không ghi nhận hai lần ──────────────────────────────────────────────────
for (const [cau, mong] of [
  ["Dạ em sửa lại 6 tỷ 5 và Phường 9 rồi ạ. Nhà mình ở đường nào vậy anh/chị?", true],
  ["Em ghi lại: hẻm xe hơi 4m, 1 trệt 3 lầu rồi anh/chị. Nhà mình ở đường nào?", true],
  ["Em ghi 9 tỷ 5 rồi anh. Nhà mình ở phường mấy vậy ạ?", true],
  ["Nhà mình ở đường nào vậy anh/chị?", false],
  ["Sổ riêng thì khách chốt cọc nhanh lắm anh.", false],
  ["Em gửi anh bản nháp nha.", false],
  ["Dạ em ghi nhận rồi ạ.", false],
  ["Em cập nhật rồi nha anh.", false],
]) ok(`laCauGhiNhan "${cau.slice(0, 40)}"`, laCauGhiNhan(cau) === mong, String(laCauGhiNhan(cau)));

// ── Giá thuê kèm kỳ hạn ─────────────────────────────────────────────────────
for (const [vao, mong] of [
  ["18 triệu 1 tháng", "18 triệu/tháng"],
  ["18 triệu một tháng", "18 triệu/tháng"],
  ["12 triệu 5 mỗi tháng", "12 triệu 5/tháng"],
  ["15tr / tháng", "15tr/tháng"],
  ["7 tỷ 2", "7 tỷ 2"],
  ["1 tỷ 1 năm", "1 tỷ 1 năm"],
  ["3 tỷ 9 thương lượng", "3 tỷ 9 thương lượng"],
]) {
  const ra = gonGiaKyHan(vao);
  ok(`gonGiaKyHan "${vao}"`, ra === mong, ra);
}
ok("gonGiaKyHan giữ đúng số: '12 triệu 5 mỗi tháng' đọc lại 12,5 triệu", docTien(gonGiaKyHan("12 triệu 5 mỗi tháng")) === 12_500_000,
  String(docTien(gonGiaKyHan("12 triệu 5 mỗi tháng"))));

// ── Tự xưng giữa câu (bàn giao 11/09 lỗi a) ─────────────────────────────────
for (const [vao, mong] of [
  ["chào em, anh cần bán căn nhà quận 5", "anh"],
  ["dạ em, chị gửi ảnh sổ nha", "chị"],
  ["ok em, anh đang ở ngoài, tối anh gửi", "anh"],
  ["alo em ơi chị muốn bán nhà", "chị"],
  ["bán nhà quận 10 phường 12, 48m2, giá 5 tỷ 2", null],
  ["có căn nào quận 10 tầm 5 tỷ không em", null],
  ["nhà hàng xóm, anh ấy bán rồi", null],
  // 05/10/2026 (SRS-5.1zx): hai câu thật của hội thoại test 02/10 mà luật bỏ sót → hỏi bù 04/10 gọi "mình".
  ["Anh nói đó được giá thì thôi", "anh"],
  ["Nhà a 4 tầng tính cả lửng", "anh"],
  ["nhà c 50m2 giá 3 tỷ", "chị"],
  // cách nói MỚI chưa bắn: nhắc lại lời mình, định / chốt
  ["Chị bảo rồi mà, 4 tỷ 2 là chốt", "chị"],
  ["a định bán tầm 6 tỷ", "anh"],
  ["anh ấy nói giá 5 tỷ", null],
  ["nhà A3 khu Him Lam", null],
]) ok(`tuXungTuCau "${vao}"`, tuXungTuCau(vao) === mong, String(tuXungTuCau(vao)));
// 05/10/2026 (SRS-5.1zx): học cách gọi từ TIN CŨ — câu tự xưng mới nhất thắng; không có thì null.
ok("hocXungHoTuLichSu: 'Shr' hiện tại, tin cũ 'Anh nói đó được giá thì thôi' → anh", hocXungHoTuLichSu(["bán nhà q5 50m2", "Anh nói đó được giá thì thôi", "Shr"]) === "anh");
ok("hocXungHoTuLichSu: mới nhất thắng (anh rồi chị) → chị", hocXungHoTuLichSu(["anh cần bán nhà", "dạ em, chị gửi ảnh nha"]) === "chị");
ok("hocXungHoTuLichSu: không câu nào tự xưng → null", hocXungHoTuLichSu(["bán nhà q10", "5 tỷ", ""]) === null);
ok("hocXungHoTuLichSu: lời dặn 'kêu chị nha' thắng tự xưng cũ", hocXungHoTuLichSu(["anh cần bán nhà", "kêu chị nha"]) === "chị");

// ── Bản nháp: tiểu từ chat không lọt vào tin rao ─────────────────────────────
{
  const cauTD = (khoa, o = {}) => dienCau(CAU_TIEN_DINH[khoa] ?? "", { ...o, ac: "anh", Ac: "Anh", web: "AI Ơi Nhà Đất" });
  const tin = soanTinNhap({
    l: { code: "BDS-NP-Q5-0001", property_type: "nha_pho", deal: "ban", location_raw: "hẻm xe hơi 5m Nguyễn Trãi",
      ward: "Phường 3", district: "Quận 5", area_m2: 60, price_raw: "7 tỷ 2", direction: "Đông Nam" },
    facts: [{ question: "tiem_nang", answer: "để ở hoặc cho thuê đều được em" }, { question: "hien_trang", answer: "nhà mới sửa luôn nha anh" }],
    diem: 90, thieu: [], soAnh: 2, lai: null, cauTD,
  });
  ok("💡 không còn đuôi 'em'", /💡 Phù hợp: để ở hoặc cho thuê đều được\n/.test(tin), tin.split("\n").find((d) => d.startsWith("💡")) ?? "(không có dòng 💡)");
  ok("hiện trạng không còn 'luôn nha anh'", !/luôn nha anh/.test(tin), tin);
}

// ── 14/09 FR-207: 🤖 đã báo thì bỏ ghi nhận lần hai; tóm tắt nói đủ dự án/tầng/nội thất ─
{
  const ra = boCauGhiNhan([
    "Dạ em ghi số phòng ngủ 4 rồi ạ.",
    "Hẻm xe hơi thì thanh khoản cao quá. Dạ em ghi 1 trệt 3 lầu, 4 phòng, sổ hồng riêng rồi. Nhà mình ở đường nào vậy ạ?",
  ]);
  ok("bỏ bong bóng chỉ có câu ghi nhận; bỏ câu ghi nhận giữa bong bóng, giữ khen + câu hỏi",
    ra.length === 1 && ra[0] === "Hẻm xe hơi thì thanh khoản cao quá. Nhà mình ở đường nào vậy ạ?", JSON.stringify(ra));
  const ra2 = boCauGhiNhan(["Dạ em ghi 9 tỷ 5, 1 trệt 2 lầu, 4 phòng ngủ rồi ạ. Nhà mình ở phường nào vậy?"]);
  ok("câu đầu 'Dạ em ghi …' bị bỏ → câu còn lại mở bằng 'Dạ'", ra2[0] === "Dạ nhà mình ở phường nào vậy?", JSON.stringify(ra2));
  const giu = ["📋 Em đăng tin như vầy nha anh:\nBán nhà…", "🤖 Đã lưu: giá: \"6 tỷ 5\"", "Dạ em ghi nhận rồi ạ.", "Sổ riêng thì khách chốt nhanh lắm anh."];
  ok("không đụng bản nháp, 🤖, ghi nhận trơ trọi, câu khen", JSON.stringify(boCauGhiNhan(giu)) === JSON.stringify(giu), JSON.stringify(boCauGhiNhan(giu)));
  // 25/09/2026: câu ghi nhận dính câu hỏi bằng dấu phẩy → giữ vế hỏi, không mất câu hỏi.
  const ra3 = boCauGhiNhan(["Dạ em ghi địa chỉ 45 Ngô Y Linh rồi ạ, nhà mình thuộc phường nào vậy?"]);
  ok("ghi nhận + ', <câu hỏi>?' → còn 'Dạ nhà mình thuộc phường nào vậy?'", ra3.length === 1 && ra3[0] === "Dạ nhà mình thuộc phường nào vậy?", JSON.stringify(ra3));
  const ra4 = boCauGhiNhan(["Dạ em ghi 9 tỷ 5, 4 phòng ngủ rồi ạ."]);
  ok("ghi nhận có phẩy mà không hỏi → vẫn bỏ cả câu", ra4.length === 0, JSON.stringify(ra4));
}
{
  const nhan = { tang: "tầng", view: "view", ly_do_ban: "lý do bán", dien_tich: "diện tích", tho_cu: "diện tích thổ cư" };
  const kem = kemLuotTao([
    { question: "view", answer: "view sông" }, { question: "tang", answer: "15" }, { question: "dien_tich", answer: "76m2" },
  ], nhan);
  // SRS-5.1zzzzn: dòng fact nối thẳng dưới các cột của bocTachTaoTin (cùng kiểu "• nhãn: …"), không còn chữ "Kèm:".
  ok("lượt tạo tin: fact kèm chỉ fact tóm tắt cột chưa nói (view), không lặp tầng/diện tích", kem === '• view: làm chuẩn "view sông"', String(kem));
  ok("lượt tạo tin: không còn fact nào ngoài tóm tắt → không có dòng Kèm", kemLuotTao([{ question: "dien_tich", answer: "60m2" }], nhan) === null);
  const tt = tomTatDaLuu({ property_type: "chung_cu", deal: "cho_thue", ward: "Phường Tân Hưng", district: "Quận 7", area_m2: 76,
    bedrooms: 2, price_raw: "18 triệu/tháng", price_vnd: 18e6, floor: 15, furnishing: "full", projects: { name: "Sunrise City" } }, [], {}, "thay_doi");
  ok("tóm tắt căn hộ nói dự án ĐÃ GẮN, tầng căn, nội thất (bắn thật 14/09: thiếu cả ba)",
    /dự án Sunrise City/.test(tt) && /tầng 15/.test(tt) && /nội thất đầy đủ/.test(tt) && !/trệt/.test(tt), tt);
  ok("tomTatTrongCau đọc lại tóm tắt từ 🤖 lượt tạo lẫn 📦 lượt sau",
    tomTatTrongCau("🤖 Đã lưu: Nhà phố bán · 60m²\nSai chỗ nào…") === "Nhà phố bán · 60m²" &&
    tomTatTrongCau('🤖 Đã lưu: hướng: "đông nam"\n📦 Tin giờ: Nhà phố bán · hướng Đông Nam') === "Nhà phố bán · hướng Đông Nam");
  const mua = vuaLuuMua({ area: "Quận 5" }, { area: "Quận 5", budget: "7 tỷ", deal: "ban", ten_tro_ly: "H•ai", xung_ho: "chị", gan_tien_ich_loc: { m: 1000 } },
    [["deal", "mua hay thuê"], ["area", "khu vực muốn tìm (phường nào)"], ["budget", "khoảng giá"]]);
  ok("người mua: chỉ khoá ĐỔI, không khoá nội bộ, deal 'ban' đọc là 'mua'", mua === '🤖 Đã trích xuất:\n• mua hay thuê: làm chuẩn "mua"\n• khoảng giá: làm chuẩn "7 tỷ"', String(mua));
  // SRS-5.1zzzzn: có tin khách → nguyên mẫu là cụm khách gõ ("7 ty") → làm chuẩn ("7 tỷ").
  const mua2 = vuaLuuMua({}, { budget: "7 tỷ", deal: "ban" }, [["deal", "mua hay thuê"], ["budget", "khoảng giá"]], "chị cần mua nhà tầm 7 ty");
  ok("TRX-MUA người mua: '• khoảng giá: \"7 ty\" → làm chuẩn \"7 tỷ\"', '• mua hay thuê: \"mua\"'",
    mua2 === '🤖 Đã trích xuất:\n• mua hay thuê: "mua"\n• khoảng giá: "7 ty" → làm chuẩn "7 tỷ"', String(mua2));
}

// ── 14/09 bắn lại kịch bản 7 (người mua) ──────────────────────────────────────
ok("kho: 'Chị xem những căn này có hợp không ạ?' là nói như đã gửi căn", laHuaCoHang("Chị xem những căn này có hợp không ạ?"));
ok("kho: 'Chị thấy căn này thế nào ạ?' (một căn khách đang hỏi) không dính mẫu 'những căn này'", !laHuaCoHang("Chị thấy căn này thế nào ạ?"));
ok("kho: 'Dạ chị, em tìm cho mấy căn 3PN hẻm xe hơi…' (chữ 'cho' chen giữa) là hứa có căn", laHuaCoHang("Dạ chị, em tìm cho mấy căn 3PN hẻm xe hơi quanh bệnh viện Chợ Rẫy trong tầm 7 tỷ."));
ok("kho: 'em tìm cho chị vài căn' vẫn bắt; 'em tìm cho chị nha' không có căn nào thì không", laHuaCoHang("Em tìm cho chị vài căn nha.") && !laHuaCoHang("Em tìm cho chị nha."));
ok("ghi nhận: 'Dạ chị, em ghi lại: mua nhà Quận 5…' là ghi nhận có nội dung", laCauGhiNhan("Dạ chị, em ghi lại: mua nhà Quận 5 tầm 7 tỷ, gần bệnh viện cho mẹ. Chị cần mấy phòng ngủ ạ?"));
{
  const ra = boCauGhiNhan(["Dạ chị, em ghi lại: mua nhà Quận 5 tầm 7 tỷ, gần bệnh viện cho mẹ. Chị cần mấy phòng ngủ và nhà hẻm hay mặt tiền thì tìm dễ hơn ạ?"]);
  ok("người mua: bỏ câu ghi nhận lần hai, câu hỏi còn lại mở bằng 'Dạ'", ra[0] === "Dạ chị cần mấy phòng ngủ và nhà hẻm hay mặt tiền thì tìm dễ hơn ạ?", JSON.stringify(ra));
}

// ── 14/09 bắn 16 hội thoại người mua: hồ sơ bịa, "chúng mình", hứa có nhiều ────
{
  const P0 = { name: null, deal: null, area: null, budget: null, purpose: null, property_type: null, bedrooms: null, alley: null, timeline: null, notes: null };
  const a = locHoSoMua({ ...P0, area: "Bình Thạnh", purpose: "để ở", timeline: "trong tháng này" }, "cần mua gấp trong tháng này, quận bình thạnh tầm 8 tỷ, nhà mặt tiền");
  ok("hồ sơ: 'gấp, mặt tiền' không nói mục đích → gỡ 'để ở'; giữ timeline 'trong tháng này'", a.profile.purpose === null && a.profile.timeline === "trong tháng này" && a.bo.join() === "purpose", JSON.stringify(a));
  const b = locHoSoMua({ ...P0, timeline: "chiều thứ 7" }, "cuối tuần anh đi xem nhà được không, anh rảnh chiều thứ 7");
  ok("hồ sơ: giờ đi XEM NHÀ không phải timeline → gỡ", b.profile.timeline === null, JSON.stringify(b));
  const c = locHoSoMua({ ...P0, notes: "Khách muốn xem danh sách căn ngay, chưa hỏi chi tiết" }, "hỏi hoài vậy, có căn nào thì gửi đi");
  ok("hồ sơ: ghi chú là thái độ của khách → gỡ", c.profile.notes === null, JSON.stringify(c));
  const d = locHoSoMua({ ...P0, notes: "anh có 2 tỷ, vay thêm được không để mua nhà 4 tỷ" }, "anh có 2 tỷ, vay thêm được không để mua nhà 4 tỷ quận 6");
  ok("hồ sơ: ghi chú chép gần nguyên câu khách → gỡ", d.profile.notes === null, JSON.stringify(d));
  // KHÔNG được gỡ
  const e = locHoSoMua({ ...P0, purpose: "để ở", notes: "có mẹ già ở cùng, cần gần bệnh viện" }, "chị tìm mua nhà quận 5 để ở, nhà có mẹ già nên muốn gần bệnh viện");
  ok("hồ sơ: khách NÓI 'để ở' + hoàn cảnh thật → giữ cả hai", e.profile.purpose === "để ở" && e.profile.notes === "có mẹ già ở cùng, cần gần bệnh viện", JSON.stringify(e));
  const f = locHoSoMua({ ...P0, purpose: "cho thuê lại" }, "mua để cho thuê lại, khu nào quận 5 dòng tiền tốt em");
  ok("hồ sơ: 'mua để cho thuê lại' → giữ mục đích", f.profile.purpose === "cho thuê lại", JSON.stringify(f));
  const g = locHoSoMua({ ...P0, timeline: "trước Tết", notes: "4 người ở" }, "dọn vào trước tết em, nhà 4 người");
  ok("hồ sơ: 'dọn vào trước tết' giữ timeline; '4 người ở' (ngắn) giữ ghi chú", g.profile.timeline === "trước Tết" && g.profile.notes === "4 người ở", JSON.stringify(g));
}
ok("xưng hô: 'căn hộ có ban công chúng mình có nhiều' → 'bên em'", suaTuXungMua("Dạ căn hộ có ban công chúng mình có nhiều.") === "Dạ căn hộ có ban công bên em có nhiều.", suaTuXungMua("Dạ căn hộ có ban công chúng mình có nhiều."));
ok("xưng hô: đầu câu 'Chúng mình…' → 'Bên em…'; 'nhà mình' (gọi khách) giữ nguyên", suaTuXungMua("Chúng mình báo lại liền. Nhà mình ở đâu ạ?") === "Bên em báo lại liền. Nhà mình ở đâu ạ?", suaTuXungMua("Chúng mình báo lại liền. Nhà mình ở đâu ạ?"));
ok("kho: 'căn hộ có ban công chúng mình có nhiều' là hứa", laHuaCoHang("Dạ căn hộ có ban công chúng mình có nhiều."));
ok("kho: 'Em tìm căn khớp 4 người ở quanh trường … rồi' là hứa", laHuaCoHang("Em tìm căn khớp 4 người ở quanh trường tiểu học Quận 3 tầm 6 tỷ rồi."));
ok("kho: 'bên em có nhiều khách hỏi khu này' không phải hứa có hàng", !laHuaCoHang("Bên em có nhiều khách hỏi khu này lắm."));
// bắn lại sau siết
ok("kho: 'để em gửi căn cho mình xem luôn ạ' là hứa", laHuaCoHang("Dạ em hiểu, để em gửi căn cho mình xem luôn ạ."));
ok("kho: 'em ghi nhận lịch chiều thứ 7 cho mình' là nhận hẹn khi chưa có căn", laHuaCoHang("Dạ được, em ghi nhận lịch chiều thứ 7 cho mình ạ."));
ok("kho: 'có căn mới em gửi mình liền' không phải hứa", !laHuaCoHang("Có căn mới hợp là em gửi mình liền nha."));
ok("kho: 'mình rảnh lịch nào để em sắp xếp khi có căn' không bắt (không có giờ cụ thể)", !laHuaCoHang("Khi có căn khớp em sắp xếp lịch cho mình nha."));

// bắn lần 3 (14/09)
ok("dò mục đích: thuê căn hộ → 'để ở hay để cho thuê lại vậy ạ?' là câu dò", laHoiMucDich("Trong khi chờ, mình cần căn hộ để ở hay để cho thuê lại vậy ạ?"));
ok("dò mục đích: 'hẻm hay mặt tiền, để ở hay đầu tư ạ?' là câu dò", laHoiMucDich("Anh tìm nhà hẻm hay mặt tiền, để ở hay đầu tư ạ?"));
ok("dò mục đích: câu kể 'mua để ở hay đầu tư đều được' (không hỏi) không bắt", !laHoiMucDich("Mua để ở hay đầu tư thì khu này đều hợp ạ."));
ok("dò mục đích: 'hẻm xe hơi hay mặt tiền ạ?' không bắt", !laHoiMucDich("Chị thích hẻm xe hơi hay mặt tiền ạ?"));
{
  const b = boHoiMucDich(["🤖 Đã lưu nhu cầu: mua", "Dạ em lọc Quận 6 tầm 4 tỷ cho anh nhé. Anh tìm nhà hẻm hay mặt tiền, để ở hay đầu tư ạ?"]);
  ok("dò mục đích: bỏ đúng câu hỏi, giữ 🤖 và câu trước", b.daBo && b.replies.length === 2 && b.replies[1] === "Dạ em lọc Quận 6 tầm 4 tỷ cho anh nhé.", JSON.stringify(b));
  const c = boHoiMucDich(["Mình tìm để ở hay đầu tư ạ?"]);
  ok("dò mục đích: bỏ hết thì giữ nguyên (không gửi lượt im)", !c.daBo && c.replies.length === 1, JSON.stringify(c));
}
ok("gõ dính: 'Emghi nhận…' → 'Em ghi nhận…'", suaTuXungMua("Emghi nhận nhu cầu của mình ạ.") === "Em ghi nhận nhu cầu của mình ạ.", suaTuXungMua("Emghi nhận nhu cầu của mình ạ."));
ok("gõ dính: 'Emmy', 'em gái' giữ nguyên", suaTuXungMua("Emmy và em gái") === "Emmy và em gái", suaTuXungMua("Emmy và em gái"));
ok("gõ dính + 🤖: câu 'Emghi nhận nhu cầu…, sắp lọc…' bị bỏ", boCauGhiNhan(["Dạ được.", suaTuXungMua("Emghi nhận nhu cầu của mình, sắp lọc được căn phù hợp liền ạ.")]).length === 1);
ok("gộp: '4 người ở cùng, cần gần trường tiểu học' vào 'cần gần trường tiểu học Quận 3' không lặp",
  gopGhiChu("cần gần trường tiểu học Quận 3", "4 người ở cùng, cần gần trường tiểu học") === "cần gần trường tiểu học Quận 3; 4 người ở cùng",
  String(gopGhiChu("cần gần trường tiểu học Quận 3", "4 người ở cùng, cần gần trường tiểu học")));

// bắn lần 4 (14/09)
ok("dò mục đích: 'Mình ở hoặc đầu tư ạ?' là câu dò", laHoiMucDich("Mình ở hoặc đầu tư ạ?"));
ok("dò mục đích: 'Mình đang tìm mua hay để ở nhà Quận 5 vậy?' là câu dò", laHoiMucDich("Mình đang tìm mua hay để ở nhà Quận 5 vậy?"));
ok("dò mục đích: 'Mình muốn ở khu nào, tầm giá bao nhiêu ạ?' không bắt", !laHoiMucDich("Mình muốn ở khu nào, tầm giá bao nhiêu ạ?"));
ok("dò mục đích: 'Mình tìm mua hay thuê ạ?' không bắt", !laHoiMucDich("Mình tìm mua hay thuê ạ?"));
ok("kho: 'Hiện kho em còn vài căn ở khu đó' là hứa", laHuaCoHang("Hiện kho em còn vài căn ở khu đó, em lọc rồi báo lại mình ngay nha."));
ok("kho: 'bên em còn căn nào khác không' không bắt", !laHuaCoHang("Mình hỏi giúp em bên em còn căn nào khác không ạ?"));
ok("kho: 'em còn cần biết thêm khu vực' không bắt", !laHuaCoHang("Em còn cần biết thêm khu vực mình muốn ạ."));
ok("xưng hô: 'thì bạn cũng bị ảnh hưởng' → 'anh chị' (05/10: không còn 'mình')", suaTuXungMua("Nếu người khác bán phần của họ thì bạn cũng bị ảnh hưởng.") === "Nếu người khác bán phần của họ thì anh chị cũng bị ảnh hưởng.", suaTuXungMua("Nếu người khác bán phần của họ thì bạn cũng bị ảnh hưởng."));
ok("xưng hô: 'bạn bè', 'người bạn có nhà' giữ nguyên", suaTuXungMua("Nhà gần bạn bè, người bạn có nhà ở đó.") === "Nhà gần bạn bè, người bạn có nhà ở đó.", suaTuXungMua("Nhà gần bạn bè, người bạn có nhà ở đó."));
ok("gộp: 'muốn gần bệnh viện' vào 'có mẹ già ở cùng, cần gần bệnh viện' → null",
  gopGhiChu("có mẹ già ở cùng, cần gần bệnh viện", "muốn gần bệnh viện") === null,
  String(gopGhiChu("có mẹ già ở cùng, cần gần bệnh viện", "muốn gần bệnh viện")));

// 15/09/2026 FR-177: một lượt một câu hỏi (phía bán) — cắt câu hỏi thứ hai của model.
for (const [vao, mong] of [
  ["Hẻm 5m ô tô tới cửa thì khách chuộng lắm anh. Nhà mình mấy lầu ạ? Có sổ hồng riêng chưa ạ?", "Hẻm 5m ô tô tới cửa thì khách chuộng lắm anh. Nhà mình mấy lầu ạ?"],
  ["Nhà mình mấy lầu ạ?", "Nhà mình mấy lầu ạ?"],
  ["Nhà mình mấy lầu ạ? Để em ghi vào tin.", "Nhà mình mấy lầu ạ?"],
  ["Anh/chị cần ra hàng gấp hay ưu tiên đạt giá mong muốn?", "Anh/chị cần ra hàng gấp hay ưu tiên đạt giá mong muốn?"],
  ["Dạ em ghi nhận rồi ạ.", "Dạ em ghi nhận rồi ạ."],
  ["🤖 Đã lưu: giá: \"4 tỷ\"", "🤖 Đã lưu: giá: \"4 tỷ\""],
]) ok("motCauHoi " + JSON.stringify(vao.slice(0, 40)), motCauHoi([vao])[0] === mong, JSON.stringify(motCauHoi([vao])));

// 15/09/2026 (bắn thật F2): câu hỏi về ảnh có đáp án hệ thống.
for (const [vao, mong] of [
  ["bên bạn có cần mình gửi hình không hay sao", true],
  ["có cần chụp ảnh sổ không em", true],
  ["phí bên bạn tính sao", false],
  ["giá ảnh hưởng gì không", false],
  ["bạn có biết xung quanh khu này có tiện ích gì không", false],
]) ok("dapHoiNguocTienDinh " + JSON.stringify(vao), (dapHoiNguocTienDinh(vao, "anh") !== null) === mong, String(dapHoiNguocTienDinh(vao, "anh")));
ok("dapHoiNguocTienDinh gọi đúng cách xưng hô", dapHoiNguocTienDinh("có cần gửi hình không", "chị") === "Dạ chị gửi ảnh thẳng vào đây là em cất vào tin luôn ạ.");

// 15/09/2026 (bắn thật P1/P2): đáp án hệ thống cho "bot hả" / "phí sao"; lời model trả lời CÂU LỆNH bị bỏ.
ok("dapHoiNguocTienDinh 'bên em là bot hả' → nói thật là AI", /trợ lý AI/.test(dapHoiNguocTienDinh("mà bên em là bot hả?", "anh") ?? ""), String(dapHoiNguocTienDinh("mà bên em là bot hả?", "anh")));
ok("dapHoiNguocTienDinh 'phí sao' + phí → câu phí", dapHoiNguocTienDinh("phí sao, với bên em có gọi điện phiền tôi không", "anh", "phí bên em chỉ thu khi giao dịch thành công là 1% giá chốt") === "Dạ phí bên em chỉ thu khi giao dịch thành công là 1% giá chốt ạ.", String(dapHoiNguocTienDinh("phí sao", "anh", "x")));
ok("dapHoiNguocTienDinh 'phí quản lý bao nhiêu' → không phải phí môi giới", dapHoiNguocTienDinh("phí quản lý bao nhiêu 1 tháng", "anh", "x") === null);
ok("dapHoiNguocTienDinh 'máy lạnh còn không' → không phải hỏi bot", dapHoiNguocTienDinh("máy lạnh còn không em", "anh") === null);
for (const [vao, mong] of [
  ["Em hiểu rồi ạ. Em là Kh•ai, trợ lý AI Ơi Nhà Đất. Khi chủ nhà hỏi ngược, em trả lời câu đó TRƯỚC bằng 1–2 câu ngắn, rồi mới hỏi tiếp. Sẵn sàng nhận hội thoại.", true],
  ["Một tin duy nhất, 25–50 từ, câu hỏi cuối là \"vị trí cụ thể\" — không chuyển sang thứ khác.", true],
  ["Dạ phí bên em chỉ thu khi bán xong, 1% anh nha. Nhà mình ở đường nào vậy anh?", false],
  ["Hẻm 5m xe hơi tới cửa là khách chuộng lắm anh. Mình cần ra hàng gấp hay được giá thì thôi?", false],
  ["Dạ em ghi nhận rồi ạ.", false],
]) ok("laLoiMeta " + JSON.stringify(vao.slice(0, 50)), laLoiMeta(vao) === mong, String(laLoiMeta(vao)));

// 17/09/2026 (Zalo thật): "cháu là người hỗ trợ" là nhận mình là người → thay bằng câu thật.
ok("chanNhanLaNguoi 'cháu là người hỗ trợ'", /trợ lý AI/.test(chanNhanLaNguoi(["Cháu ghi nhận chú hỏi, cháu là người hỗ trợ. Chú gửi ảnh nha?"], "chú")[0]) && !/người hỗ trợ/.test(chanNhanLaNguoi(["cháu là người hỗ trợ."], "chú")[0]), JSON.stringify(chanNhanLaNguoi(["Cháu ghi nhận chú hỏi, cháu là người hỗ trợ. Chú gửi ảnh nha?"], "chú")));
// 16/09/2026: khách chú/cô/bác → bot tự xưng "cháu"; anh/chị giữ "em"; không đụng "em gái", "xem".
for (const [xh, vao, mong] of [
  ["chú", "Dạ em ghi nhận rồi ạ. Em hỏi thêm chú một chút nha.", "Dạ cháu ghi nhận rồi ạ. Cháu hỏi thêm chú một chút nha."],
  ["cô", "Bên em có anh Thu phụ trách, tụi em sẽ xem kỹ.", "Bên cháu có anh Thu phụ trách, tụi cháu sẽ xem kỹ."],
  ["bác", "em gái em cũng ở đó, EM NHA", "em gái cháu cũng ở đó, CHÁU NHA"],
  // 23/09/2026: khách xưng ông/bà.
  ["ông", "Dạ em ghi nhận rồi ạ. Ông gửi ảnh cho em nha.", "Dạ cháu ghi nhận rồi ạ. Ông gửi ảnh cho cháu nha."],
  ["bà", "Em hỏi thêm bà một chút nha.", "Cháu hỏi thêm bà một chút nha."],
  ["thím", "Dạ em ghi nhận rồi ạ.", "Dạ cháu ghi nhận rồi ạ."],
  ["anh", "Dạ em ghi nhận rồi ạ.", "Dạ em ghi nhận rồi ạ."],
  [null, "Dạ em ghi nhận rồi ạ.", "Dạ em ghi nhận rồi ạ."],
]) ok(`doiTuXung(${xh}) ${JSON.stringify(vao.slice(0, 30))}`, doiTuXung([vao], xh)[0] === mong, JSON.stringify(doiTuXung([vao], xh)));

// ── 18/09/2026: "lâu lâu thì khen thôi" — vuaKhen đọc 3 tin bot gần nhất, boCauKhen bỏ câu khen giữ câu hỏi ──
ok("vuaKhen: 3 tin gần nhất có 'rất sáng sủa' → true", vuaKhen(["Dạ em ghi nhận.", "Nhà mới sơn sửa lại trông rất sáng sủa. Phường mấy cô?", "Dạ cô."]) === true);
ok("vuaKhen: chỉ tin thứ 4 trở về trước khen → false", vuaKhen(["Hẻm xe hơi là khách chuộng lắm.", "Dạ.", "Phường mấy?", "Sổ riêng chưa?"]) === false);
ok("vuaKhen: 'tiện ích gần' không phải khen", vuaKhen(["🤖 Đã lưu: tiện ích gần: \"gần chợ\""]) === false);
ok("boCauKhen: bỏ câu khen, giữ câu hỏi", boCauKhen("Dạ nhà 2 lầu, sổ hồng riêng là khách chốt nhanh lắm cô. Tổng cộng bao nhiêu phòng ngủ cô?") === "Tổng cộng bao nhiêu phòng ngủ cô?", boCauKhen("Dạ nhà 2 lầu, sổ hồng riêng là khách chốt nhanh lắm cô. Tổng cộng bao nhiêu phòng ngủ cô?"));
ok("boCauKhen: hai dòng, dòng khen bỏ, dòng hỏi giữ", boCauKhen("3 phòng ngủ, toilet riêng từng tầng là rất tiện cho gia đình cô.\nMình cần ra hàng gấp hay được giá thì thôi cô?") === "Mình cần ra hàng gấp hay được giá thì thôi cô?");
ok("boCauKhen: không có câu khen → giữ nguyên", boCauKhen("Dạ cháu sửa lại giá 6 tỷ rồi ạ. Mình cần ra hàng gấp hay được giá thì thôi cô?") === "Dạ cháu sửa lại giá 6 tỷ rồi ạ. Mình cần ra hàng gấp hay được giá thì thôi cô?");
ok("boCauKhen: cả tin là một câu khen kèm dấu hỏi → giữ (không để trống)", boCauKhen("Nhà đẹp vậy chắc hút khách lắm, sổ riêng chưa cô?") === "Nhà đẹp vậy chắc hút khách lắm, sổ riêng chưa cô?");

// ── 21/09/2026 ("làm cả 4"): lời nói với bot, xin xoá dữ liệu, bỏ gạch chéo ──
for (const t of ["xóa sạch data của anh đi để anh test lại", "cái dòng phù hợp đọc kỳ quá", "bản nháp dài quá em", "reset lại giúp anh", "em là bot hả, hệ thống gì kỳ vậy"])
  ok(`laNoiVoiBot: "${t}"`, laNoiVoiBot(t) === true);
for (const t of ["hẻm 4m xe hơi vào", "sổ hồng riêng hoàn công", "5 tỷ 2", "phường 2 quận 5", "để anh hỏi vợ rồi báo", "nhà ở đường trần đình trọng"])
  ok(`không phải lời nói với bot: "${t}"`, laNoiVoiBot(t) === false);
ok("laXinXoaDuLieu: 'xóa sạch data của anh đi'", laXinXoaDuLieu("xóa sạch data của anh đi") === true);
ok("laXinXoaDuLieu: 'xóa hết dữ liệu của anh đi'", laXinXoaDuLieu("xóa hết dữ liệu của anh đi") === true);
ok("không phải xin xoá: 'xóa cái hẻm 4m đi, hẻm 5m'", laXinXoaDuLieu("xóa cái hẻm 4m đi, hẻm 5m") === false);
ok("boGachCheo: 'Sai chỗ nào anh/chị nhắn lại' → 'anh chị'", boGachCheo("Sai chỗ nào anh/chị nhắn lại giúp em nha.") === "Sai chỗ nào anh chị nhắn lại giúp em nha.");
ok("boGachCheo: đầu câu 'Anh/chị cho em' → 'Anh chị cho em'", boGachCheo("Anh/chị cho em xin địa chỉ") === "Anh chị cho em xin địa chỉ");
ok("boGachCheo: không đụng 'anh chị phụ trách'", boGachCheo("có anh chị phụ trách theo sát") === "có anh chị phụ trách theo sát");


// ── 22/09/2026: ba lưới mới theo bộ đo giọng (TS-GIONG-02) ─────────────────────
{
  const td = "Dạ em là trợ lý AI bên AI Ơi Nhà Đất, việc cần người thật thì có anh chị phụ trách theo sát mình ạ.";
  const md = "Em là trợ lý AI bên AI Ơi Nhà Đất, việc gì cần người thật thì có anh chị phụ trách khu vực theo sát anh ạ. Sổ hồng nhà mình riêng chưa anh?";
  ok("boCauTrung: câu tiền định + model chép lại gần nguyên văn → giữ MỘT, câu hỏi giữ",
    JSON.stringify(boCauTrung([td, md])) === JSON.stringify([td, "Sổ hồng nhà mình riêng chưa anh?"]), JSON.stringify(boCauTrung([td, md])));
  {
    // 24/09/2026 (tin thật 152 Trần Đình Xu): dòng 📍 địa chỉ trùng chữ với tiêu đề bản nháp — trước bị bỏ.
    const nhap = "📋 Em đăng tin như vầy nha anh:\nBán nhà 152 Trần Đình Xu Phường Cầu Ông Lãnh Q.1, 120m², trệt + 4 lầu, 4PN, SHR, giá 65 tỉ\n📍 152 Trần Đình Xu, Phường Cầu Ông Lãnh, Quận 1\n💰 65 tỉ";
    ok("boCauTrung: dòng 📍 địa chỉ của bản nháp KHÔNG bị bỏ dù trùng chữ với tiêu đề", /📍 152 Trần Đình Xu/.test(boCauTrung([nhap]).join("\n")), JSON.stringify(boCauTrung([nhap])));
  }
  // 24/09/2026 (bắn 10 tin): chưa biết anh hay chị mà câu mở bằng "Anh cần bán gấp…".
  ok("boDoanGioiDauCau: 'Anh cần bán gấp…' → 'Anh chị cần bán gấp…'", boDoanGioiDauCau("Hẻm xe hơi tới cửa. Anh cần bán gấp hay chờ được giá thôi?") === "Hẻm xe hơi tới cửa. Anh chị cần bán gấp hay chờ được giá thôi?", boDoanGioiDauCau("Hẻm xe hơi tới cửa. Anh cần bán gấp hay chờ được giá thôi?"));
  ok("boDoanGioiDauCau: 'Anh chị xem…', 'Anh Thu…' giữ nguyên", boDoanGioiDauCau("Anh chị xem ổn chưa ạ? Anh Thu phụ trách.") === "Anh chị xem ổn chưa ạ? Anh Thu phụ trách.");
  ok("boCauTrung: câu ngắn trùng ('Dạ em ghi 3 lầu rồi ạ.') KHÔNG bị bỏ", boCauTrung(["Dạ em ghi 3 lầu rồi ạ.", "Dạ em ghi 3 lầu rồi ạ. Sổ riêng chưa anh?"]).length === 2);
  const bb = ["📝 Em ghi nhận: Nhà phố bán · Phường 5 · 60m² · giá 6 tỷ.\nSai chỗ nào anh chị nhắn lại giúp em nha."];
  ok("boCauTrung: không bỏ gì thì trả nguyên mảng (giữ xuống dòng, `===`)", boCauTrung(bb) === bb);
  ok("boCauTrung: bỏ câu ở dòng 2 vẫn giữ dòng 1 và dấu xuống dòng",
    boCauTrung([td, `Dạ anh.\n${td}\nSổ riêng chưa anh?`])[1] === "Dạ anh.\nSổ riêng chưa anh?", JSON.stringify(boCauTrung([td, `Dạ anh.\n${td}\nSổ riêng chưa anh?`])));
  const khen = ["Hẻm 5m ô tô vào tới cửa là khách chuộng lắm anh. Nhà mình xây mấy tầng rồi anh?"];
  ok("boKhenKhongCanCu: chủ chỉ nói 'hẻm 5m' → bỏ câu 'ô tô vào tới cửa', giữ câu hỏi",
    JSON.stringify(boKhenKhongCanCu(khen, "anh bán nhà hẻm 5m Trần Bình Trọng p1 q5, 4x15, 7 tỷ 2")) === JSON.stringify(["Nhà mình xây mấy tầng rồi anh?"]));
  ok("boKhenKhongCanCu: chủ đã nói 'xe hơi vào tận nhà' → giữ nguyên (`===`)", boKhenKhongCanCu(khen, "hẻm 5m xe hơi vào tận nhà") === khen);
  ok("boKhenKhongCanCu: câu HỎI 'ô tô vào được không anh?' giữ", boKhenKhongCanCu(["Hẻm 5m ô tô vào được không anh?"], "hẻm 5m").length === 1);
  ok("boKhenKhongCanCu: 'xuyên thoáng' / 'nở hậu' chủ chưa nói → bỏ", boKhenKhongCanCu(["Nhà xuyên thoáng lại nở hậu là hiếm anh."], "nhà 4x15 3 lầu").length === 0);
  const canHem = { access_type: "hem_xe_hoi", alley_width_m: 6, legal_status: "so_hong_rieng", location_raw: "12 Trần Hưng Đạo" };
  ok("boMauThuanCan: căn hẻm 6m mà nói 'mặt tiền kinh doanh' → bỏ câu đó, giữ câu hỏi",
    JSON.stringify(boMauThuanCan(["Dạ căn 12 Trần Hưng Đạo mặt tiền kinh doanh được anh. Anh muốn xem hôm nào?"], canHem)) === JSON.stringify(["Anh muốn xem hôm nào?"]));
  ok("boMauThuanCan: nói đúng 'hẻm 6m' → giữ nguyên", boMauThuanCan(["Dạ căn 12 Trần Hưng Đạo hẻm 6m, mở quán ăn thì em hỏi lại chủ nhà cho anh nha."], canHem).length === 1);
  ok("boMauThuanCan: sổ riêng mà nói 'sổ chung' → bỏ; không có căn → không đụng",
    boMauThuanCan(["Căn này sổ chung anh nhé."], canHem).length === 0 && boMauThuanCan(["Căn này sổ chung anh nhé."], null).length === 1);
  ok("boCauGhiNhan: giữ lời SỬA THẬT 'Dạ em sửa lại giá 7 tỷ 5 rồi ạ', vẫn bỏ 'Dạ em ghi 3 lầu rồi ạ'",
    JSON.stringify(boCauGhiNhan(["Dạ em sửa lại giá 7 tỷ 5 rồi ạ.", "Dạ em ghi 3 lầu rồi ạ. Sổ riêng chưa anh?"])) === JSON.stringify(["Dạ em sửa lại giá 7 tỷ 5 rồi ạ.", "Dạ sổ riêng chưa anh?"]),
    JSON.stringify(boCauGhiNhan(["Dạ em sửa lại giá 7 tỷ 5 rồi ạ.", "Dạ em ghi 3 lầu rồi ạ. Sổ riêng chưa anh?"])));
}

{
  const nc = "#BDS-Q5-0001 · 12 Trần Hưng Đạo Phường 4 · 5,8 tỷ · 50m2 · gần chợ Hoà Bình · gần chợ";
  const bia = ["Dạ em có căn 12 Trần Hưng Đạo hẻm 6m, gần chợ Hàng Thịt lắm. Anh muốn xem hôm nào?"];
  ok("boTenRiengBia: 'chợ Hàng Thịt' không có trong kho → còn 'gần chợ lắm'",
    boTenRiengBia(bia, nc)[0] === "Dạ em có căn 12 Trần Hưng Đạo hẻm 6m, gần chợ lắm. Anh muốn xem hôm nào?", JSON.stringify(boTenRiengBia(bia, nc)));
  const that = ["Căn này gần chợ Hoà Bình, đi bộ 3 phút anh."];
  ok("boTenRiengBia: 'chợ Hoà Bình' có trong kho → giữ nguyên (`===`)", boTenRiengBia(that, nc) === that);
  ok("boTenRiengBia: 'trường Trần Đại Nghĩa' bịa → 'gần trường'; 'gần chợ' trần không đụng",
    boTenRiengBia(["Gần trường Trần Đại Nghĩa và gần chợ."], nc)[0] === "Gần trường và gần chợ.", JSON.stringify(boTenRiengBia(["Gần trường Trần Đại Nghĩa và gần chợ."], nc)));
  ok("boTenRiengBia: 'dự án Sunrise Quận 5' không có trong kho → 'dự án'; 'Chung cư Lakai' có → giữ (FR-114 e)",
    boTenRiengBia(["Có Chung cư Lakai và dự án Sunrise Quận 5 nữa ạ."], "• Chung cư Lakai - CĐT Lakai · Số 5 Nguyễn Tri Phương")[0] === "Có Chung cư Lakai và dự án nữa ạ.",
    JSON.stringify(boTenRiengBia(["Có Chung cư Lakai và dự án Sunrise Quận 5 nữa ạ."], "• Chung cư Lakai - CĐT Lakai · Số 5 Nguyễn Tri Phương")));
  ok("boTenRiengBia: tên có trong LỊCH SỬ (khách nói) → giữ", boTenRiengBia(["gần chợ An Đông đúng ý anh nè."], "khách: tìm nhà gần chợ An Đông").length === 1 && /An Đông/.test(boTenRiengBia(["gần chợ An Đông đúng ý anh nè."], "khách: tìm nhà gần chợ An Đông")[0]));
}

ok("laCauGhiNhan: 'Dạ em đã lưu nhu cầu: mua nhà Quận 5, tầm 6 tỷ để ở ạ' là câu ghi nhận có nội dung (22/09)", laCauGhiNhan("Dạ em đã lưu nhu cầu: mua nhà Quận 5, tầm 6 tỷ để ở ạ") === true);
ok("laCauGhiNhan: 'Dạ em lưu ý rồi ạ' KHÔNG tính", laCauGhiNhan("Dạ em lưu ý rồi ạ.") === false);
ok("boCauGhiNhan: bỏ 'Dạ em đã lưu nhu cầu…', giữ câu hỏi, mở lại bằng 'Dạ'",
  JSON.stringify(boCauGhiNhan(["Dạ em đã lưu nhu cầu: mua nhà Quận 5, tầm 6 tỷ để ở ạ. Mình thích hẻm xe hơi hay mặt tiền ạ?"])) === JSON.stringify(["Dạ mình thích hẻm xe hơi hay mặt tiền ạ?"]),
  JSON.stringify(boCauGhiNhan(["Dạ em đã lưu nhu cầu: mua nhà Quận 5, tầm 6 tỷ để ở ạ. Mình thích hẻm xe hơi hay mặt tiền ạ?"])));

// ── 22/09/2026 kịch bản C (nhà Trần Bình Trọng, nhiều kiểu sai) ──────────────────────────────
for (const [t, mong] of [
  ["em xoá cái hẻm 4m ghi nhầm đi", "do_rong_hem"],
  ["bỏ cái giá 7 tỷ đi em, ghi nhầm", "gia"],
  ["xoá giúp anh cái hướng đông đi", "huong"],
  ["xoá cái phường 4 đi", "phuong"],
  ["bỏ bớt 1 phòng ngủ đi, ghi dư", "so_phong_ngu"],
  ["cái đó sai rồi, bỏ đi em", null],
  ["xoa cai huong dong di, ghi nham", "huong"],
  ["bo gia ghi nham di em", "gia"],
]) ok(`laXinBoTruong: ${JSON.stringify(t)} → ô ${mong}`, laXinBoTruong(t)?.truong === mong && laXinBoTruong(t) !== null, JSON.stringify(laXinBoTruong(t)));
for (const t of ["bỏ hẻm 4m, hẻm đúng là 3m5", "xóa sạch data của anh đi", "hẻm 4m", "gỡ tin đi em", "3 phòng ngủ", "bỏ qua câu này đi",
  "8 điểm. mà xoá căn 1 khỏi hệ thống của tui đi", "xoá căn này đi", "bỏ đi em",
  // 30/09/2026 (bắn thử vector): "đi bộ" / "người già" bỏ dấu thành "đi bỏ" / "giá" — không phải xin bỏ ô giá.
  "nhà có 1 phòng ngủ ngay tầng trệt cho người già, sau nhà có sân phơi rộng, đi bộ ra chợ 5 phút",
  "di bo ra cho 5 phut, gan truong hoc", "bố mẹ già ở tầng trệt nên cần phòng ngủ dưới"])
  ok(`laXinBoTruong KHÔNG kích: ${JSON.stringify(t)}`, laXinBoTruong(t) === null, JSON.stringify(laXinBoTruong(t)));
for (const [t, mong] of [["xoá căn 1 khỏi hệ thống của tui đi", true], ["gỡ căn này đi", true], ["xóa sạch data của anh", true], ["xoá cái hẻm 4m ghi nhầm đi", false], ["bỏ qua câu này", false]])
  ok(`laXinXoaDuLieu ${JSON.stringify(t)} → ${mong}`, laXinXoaDuLieu(t) === mong);
for (const [t, mong] of [["khách nào hỏi thì cho tui số của họ nha, tui tự liên hệ chốt", true], ["gửi em số zalo của khách đi", true], ["xin số khách hàng", true], ["anh cho em xin số nhà", false], ["số của chủ là 0903", false], ["khách hỏi gì em báo anh nha", false]])
  ok(`laXinSoKhach ${JSON.stringify(t)} → ${mong}`, laXinSoKhach(t) === mong);
ok("nhanDienFact: 'em xoá cái hẻm 4m ghi nhầm đi' KHÔNG phải vi_tri ('4m' không là số hẻm + hậu tố)", nhanDienFact("em xoá cái hẻm 4m ghi nhầm đi")?.question !== "vi_tri", JSON.stringify(nhanDienFact("em xoá cái hẻm 4m ghi nhầm đi")));
ok("nhanDienFact: 'hẻm 123 Trần Bình Trọng' vẫn là vi_tri", nhanDienFact("hẻm 123 Trần Bình Trọng")?.question === "vi_tri");
ok("nhanDienFact: 'hẻm 12a Nguyễn Trãi' vẫn là vi_tri (hậu tố chữ khác m)", nhanDienFact("hẻm 12a Nguyễn Trãi")?.question === "vi_tri");
ok("boCauSuaLaiModel: bỏ 'Phường 2 em sửa lại rồi ạ.' giữ câu hỏi, không đụng 📋",
  JSON.stringify(boCauSuaLaiModel(["Phường 2 em sửa lại rồi ạ. Nhà mình mấy tầng ạ?", "📋 Em đăng tin"])) === JSON.stringify(["Nhà mình mấy tầng ạ?", "📋 Em đăng tin"]),
  JSON.stringify(boCauSuaLaiModel(["Phường 2 em sửa lại rồi ạ. Nhà mình mấy tầng ạ?", "📋 Em đăng tin"])));
ok("boCauSuaLaiModel: câu không có 'sửa lại … rồi' giữ nguyên", boCauSuaLaiModel(["Nhà mình mấy tầng ạ?"])[0] === "Nhà mình mấy tầng ạ?");
for (const [t, mong] of [["7ty2", "7 tỷ 2"], ["7ti5", "7 tỷ 5"], ["4 ty 3", "4 tỷ 3"], ["3tr5", "3 triệu 5"], ["18tr/thang", "18 triệu/thang"], ["5 toi 6 ty", "5 toi 6 tỷ"], ["7 tỉ 5", "7 tỷ 5"], ["1 tỷ 1 năm", "1 tỷ 1 năm"]])
  ok(`donViGiaDep: ${JSON.stringify(t)} → ${JSON.stringify(mong)}`, donViGiaDep(t) === mong, JSON.stringify(donViGiaDep(t)));
for (const [t, mong] of [["7 ti 5", 7500000000], ["7ti5", 7500000000], ["2 ti rưỡi", 2500000000]])
  ok(`docTien 'ti' không dấu: ${t}`, docTien(t) === mong, String(docTien(t)));

// ── 23/09/2026 (bắn 26 tin kịch bản bán/mua, căn Trần Bình Trọng) ──
{
  const KHO = "#BDS-NP-Q5-0001 · Trần Bình Trọng Phường 2 · 8 tỷ 2 · 70m2 · 3PN · 4x17.5m · hẻm xe hơi 4m · sổ hồng riêng";
  const b = chanBiaDuKien(["Dạ căn này hướng Đông, thoáng và sáng lắm ạ. Chưa có quy hoạch gì, để em xác nhận lại chủ nhà nhé"], KHO);
  ok("chanBiaDuKien: 'hướng Đông' + 'chưa có quy hoạch' khi kho không có → bỏ, nhãn hướng nhà + quy hoạch",
    b.bo.includes("hướng nhà") && b.bo.includes("quy hoạch") && !/Đông|quy hoạch/.test(b.replies.join(" ")), JSON.stringify(b));
  const c = chanBiaDuKien(["Căn này hướng Đông Nam ạ."], KHO + " · hướng Đông Nam");
  ok("chanBiaDuKien: kho CÓ hướng Đông Nam → giữ nguyên", c.bo.length === 0 && c.replies[0] === "Căn này hướng Đông Nam ạ.", JSON.stringify(c));
  const d = chanBiaDuKien(["Mình muốn nhà hướng Đông hay hướng Nam ạ?", "Để em hỏi chủ về quy hoạch rồi báo mình nha."], KHO);
  ok("chanBiaDuKien: câu HỎI hướng và lời hứa hỏi quy hoạch → KHÔNG bỏ", d.bo.length === 0, JSON.stringify(d));
  const e = chanBiaDuKien(["Nhà xây năm 2018 ạ."], KHO);
  ok("chanBiaDuKien: 'xây năm 2018' không có trong kho → bỏ (năm xây)", e.bo.includes("năm xây"), JSON.stringify(e));
  const g = chanBiaDuKien(["Căn này không dính quy hoạch ạ."], KHO + " · quy_hoach: không quy hoạch");
  ok("chanBiaDuKien: kho có chữ quy hoạch → giữ", g.bo.length === 0, JSON.stringify(g));
}
ok("laHuaGuiHinh: 'Em gửi hình liền đây :)'", laHuaGuiHinh("Em gửi hình liền đây :)"));
ok("laHuaGuiHinh: 'gửi ảnh anh xem nè' KHÔNG ('gửi ảnh anh' không kèm liền/ngay)", !laHuaGuiHinh("Anh gửi ảnh sổ cho em nha"));
ok("chanHuaGuiHinh: thay đúng bong bóng hứa bằng lời thật",
  JSON.stringify(chanHuaGuiHinh(["Dạ em có căn Trần Bình Trọng ạ", "Em gửi hình liền đây :)"], "Căn này chủ nhà chưa gửi hình ạ.")) === JSON.stringify(["Dạ em có căn Trần Bình Trọng ạ", "Căn này chủ nhà chưa gửi hình ạ."]),
  JSON.stringify(chanHuaGuiHinh(["Dạ em có căn Trần Bình Trọng ạ", "Em gửi hình liền đây :)"], "Căn này chủ nhà chưa gửi hình ạ.")));
ok("laHuaHoiChu: 'Về giá, để em hỏi lại chủ nhà rồi báo anh liền.'", laHuaHoiChu(["Về giá, để em hỏi lại chủ nhà rồi báo anh liền."]));
ok("laHuaHoiChu: 'chủ nhà đang ở Q5' KHÔNG", !laHuaHoiChu(["Chủ nhà đang ở Q5 nên xem nhà dễ ạ."]));
ok("suaBotXungNhamKhach: khách ông, 'Dạ, ông ghi nhận rồi ạ.' → 'Dạ, cháu ghi nhận rồi ạ.'",
  suaBotXungNhamKhach(["Dạ, ông ghi nhận rồi ạ."], "ông")[0] === "Dạ, cháu ghi nhận rồi ạ.", suaBotXungNhamKhach(["Dạ, ông ghi nhận rồi ạ."], "ông")[0]);
ok("suaBotXungNhamKhach: khách chú, 'Dạ, chú ghi nhớ rồi ạ.' → 'Dạ, cháu ghi nhớ rồi ạ.'",
  suaBotXungNhamKhach(["Dạ, chú ghi nhớ rồi ạ."], "chú")[0] === "Dạ, cháu ghi nhớ rồi ạ.", suaBotXungNhamKhach(["Dạ, chú ghi nhớ rồi ạ."], "chú")[0]);
ok("suaBotXungNhamKhach: 'chú xem nhà lúc mấy giờ ạ?' (khách làm) giữ nguyên",
  suaBotXungNhamKhach(["Chú xem nhà lúc mấy giờ ạ?"], "chú")[0] === "Chú xem nhà lúc mấy giờ ạ?");
ok("suaBotXungNhamKhach: khách không phải chú/cô/bác → không đụng", suaBotXungNhamKhach(["Dạ, chú ghi nhớ rồi ạ."], "anh")[0] === "Dạ, chú ghi nhớ rồi ạ.");
ok("suaKhenNguocNghia: 'Căn góc view thoáng khó bán lắm cô' → 'khó kiếm lắm'",
  suaKhenNguocNghia(["Căn góc view thoáng khó bán lắm cô."])[0] === "Căn góc view thoáng khó kiếm lắm cô.", suaKhenNguocNghia(["Căn góc view thoáng khó bán lắm cô."])[0]);
ok("suaKhenNguocNghia: 'giá cao quá thì khó bán lắm' (không phải ưu điểm) giữ",
  suaKhenNguocNghia(["Giá cao quá thì khó bán lắm cô."])[0] === "Giá cao quá thì khó bán lắm cô.");
{
  const p = boDoanPhuongDiaDanh(["Dạ chú, chợ An Đông là khu P12 Quận 5 phải không ạ?"], "chú muốn mua nhà gần chợ An Đông");
  ok("boDoanPhuongDiaDanh: 'chợ An Đông là khu P12' không ai nói P12 → bỏ", !!p.bo && p.replies.length === 0, JSON.stringify(p));
  const q = boDoanPhuongDiaDanh(["Chợ An Đông ở phường 9 cũ đúng không chú?"], "chợ An Đông ở phường 9 cũ, đường An Dương Vương");
  ok("boDoanPhuongDiaDanh: khách đã nói phường 9 → giữ", !q.bo, JSON.stringify(q));
}
ok("boCauVongLai: 'Mai 9h sáng có được không?' vọng lại câu khách → bỏ, giữ câu kia",
  JSON.stringify(boCauVongLai(["Dạ được ạ.", "Mai 9h sáng có được không?"], "cho em xin số chủ nhà với, mai 9h sáng em qua xem được không")) === JSON.stringify(["Dạ được ạ."]));
ok("boCauVongLai: câu hỏi mới 'Mình cần mấy phòng ngủ ạ?' giữ",
  boCauVongLai(["Mình cần mấy phòng ngủ ạ?"], "anh cần nhà quận 5 tầm 8 tỷ").length === 1);
{
  const n = nhanDienNhieuCan("Sale bên em đang giữ 2 căn hộ The Everrich Infinity q5: căn A 1pn 52m2 giá 4.8 tỷ, căn B 2pn 80m2 giá 7 tỷ 1, full nội thất");
  ok("nhanDienNhieuCan: 'căn A …, căn B …' → 2 căn, thứ tự 1 và 2", n.length === 2 && n[0].thu === 1 && n[1].thu === 2 && n[1].gia === "7 tỷ 1", JSON.stringify(n));
  ok("nhanDienNhieuCan: 'căn A12-05' là mã căn, không phải thứ tự", nhanDienNhieuCan("căn A12-05 giá 3 tỷ, căn B7-01 giá 4 tỷ").every((c) => !c.thu));
  ok("tachTheoCan: 'căn B sổ hồng riêng' → thứ tự 2", JSON.stringify(tachTheoCan("căn B sổ hồng riêng, căn A đúc 3 tấm")) === JSON.stringify([{ thu: 2, manh: "sổ hồng riêng", nhan: "B" }, { thu: 1, manh: "đúc 3 tấm", nhan: "A" }]), JSON.stringify(tachTheoCan("căn B sổ hồng riêng, căn A đúc 3 tấm")));
}

ok("boCanBia: 'căn này hẻm xe hơi 4m P12, 50m2, 7,9 tỷ' → bỏ cả bong bóng",
  JSON.stringify(boCanBia(["Dạ chưa có căn khớp ạ.", "Chú ơi, căn này hẻm xe hơi 4m P12, 50m2, 7,9 tỷ. Chú có quan tâm không ạ?"])) === JSON.stringify(["Dạ chưa có căn khớp ạ."]));
ok("boCanBia: nhắc lại tiêu chí 'căn hẻm xe hơi 3 phòng tầm 8 tỷ' → giữ", boCanBia(["Dạ em lọc căn hẻm xe hơi 3 phòng tầm 8 tỷ ở Quận 5."]).length === 1);
ok("boCanBia: câu không có số tiền/diện tích → giữ", boCanBia(["Chú cần hẻm xe hơi không ạ?"]).length === 1);
ok("boCanBia: câu bịa có 'khoảng 600m' (không đứng trước tiền) → vẫn bỏ", boCanBia(["Dạ.", "Căn này hẻm xe hơi 4m P12, 50m2, 7,9 tỷ — gần chợ chỉ khoảng 600m."]).length === 1);
ok("boCanBia: câu nêu mã tin thật '#BDS-Q5-0006 … 8 tỷ' → giữ", boCanBia(["Dạ có căn #BDS-Q5-0006 nè anh, hẻm xe hơi 8 tỷ"]).length === 1);

// ── FR-214 b/d/e (23/09/2026): gán mảnh theo tin + câu "đã ghi" phải khớp DB ──
{
  const ds = [
    { code: "BDS-Q5-0001", property_type: "nha_pho", district: "Quận 11", street: "Kênh Tân Hoá", location_raw: "đường kênh Tân Hoá" },
    { code: "BDS-Q5-0002", property_type: "dat", district: "Long An", street: "Tỉnh lộ 830", location_raw: "tỉnh lộ 830" },
  ];
  ok("canGanManh: một tin, câu thường (không 'còn/thêm <loại>') → không hỏi model", !canGanManh("15 tỉ nhé cháu, 2 tầng", [ds[0]], "BDS-Q5-0001"));
  ok("canGanManh: một tin, trả lời câu treo RỒI 'À anh còn miếng đất …' → hỏi model (bắn thật 23/09)", canGanManh("phường 9 em. À anh còn miếng đất ở Nhơn Trạch 2 tỷ 3 nữa", [ds[0]], "BDS-Q5-0001"));
  ok("canGanManh: một tin, câu MỞ ĐẦU bằng 'còn nhà …' (không có phần trả lời trước) → không hỏi model", !canGanManh("còn nhà thì 4 phòng ngủ", [ds[0]], "BDS-Q5-0001"));
  ok("canGanManh: một tin, không có câu treo → không hỏi model", !canGanManh("phường 9 em. À anh còn miếng đất ở Nhơn Trạch", [ds[0]], null));
  ok("canGanManh: hai số tiền trong một câu → hỏi", canGanManh("15 tỉ nhé cháu còn nhà ở quận 11 cũ muốn 7 tỉ", ds, "BDS-Q5-0002"));
  ok("canGanManh: 'còn nhà …' → hỏi", canGanManh("còn nhà thì 4 phòng ngủ", ds, "BDS-Q5-0002"));
  ok("canGanManh: nói loại NHÀ khi đang hỏi lô đất, người đó có tin nhà → hỏi", canGanManh("Nhà phố mà thổ cư full nhà 3 phòng ngủ shr", ds, "BDS-Q5-0002"));
  ok("canGanManh: nhắc quận của tin KHÁC → hỏi", canGanManh("bên quận 11 thì 60m2", ds, "BDS-Q5-0002"));
  ok("canGanManh: trả lời thường cho câu đang treo → không hỏi", !canGanManh("15 tỉ nhé cháu", ds, "BDS-Q5-0002"));
  ok("canGanManh: nhắc quận của CHÍNH tin đang treo → không hỏi", !canGanManh("quận 11 cháu", ds, "BDS-Q5-0001"));
  const text = "15 tỉ nhé cháu còn nhà ở quận 11 cũ muốn 7 tỉ";
  const m = donManh({ manh: [{ trich: "15 tỉ nhé cháu", ma_tin: "bds-q5-0002" }, { trich: "còn nhà ở quận 11 cũ muốn 7 tỉ", ma_tin: "BDS-Q5-0001" }] }, text, ds.map((t) => t.code));
  ok("donManh: giữ mảnh nguyên văn + mã hợp lệ (mã viết thường vẫn nhận)", m.length === 2 && m[0].ma === "BDS-Q5-0002" && m[1].ma === "BDS-Q5-0001", JSON.stringify(m));
  ok("donManh: mảnh không có trong tin (model chép sai/bịa) → bỏ", donManh({ manh: [{ trich: "nhà 9 tỉ", ma_tin: "BDS-Q5-0001" }] }, text, ds.map((t) => t.code)).length === 0);
  ok("donManh: mã không thuộc người này → bỏ; MOI/KHONG → giữ", JSON.stringify(donManh({ manh: [{ trich: "15 tỉ", ma_tin: "BDS-Q5-0099" }, { trich: "còn nhà", ma_tin: "MOI" }, { trich: "nhé cháu", ma_tin: "KHONG" }] }, text, ds.map((t) => t.code)).map((x) => x.ma)) === JSON.stringify(["MOI", "KHONG"]));
  ok("donManh: đầu ra rỗng/null → []", donManh(null, text, []).length === 0 && donManh({ manh: [] }, text, []).length === 0);
  ok("boCauGhiTienKhongCo: 'cháu ghi 9 tỷ' khi DB chỉ có 15 tỷ và 7 tỷ → bỏ câu đó, giữ câu hỏi",
    JSON.stringify(boCauGhiTienKhongCo(["Dạ cháu ghi 9 tỷ cho căn Quận 11 rồi cô. Lô đất mình hướng nào cô?"], [15e9, 7e9], docTien)) === JSON.stringify(["Lô đất mình hướng nào cô?"]),
    JSON.stringify(boCauGhiTienKhongCo(["Dạ cháu ghi 9 tỷ cho căn Quận 11 rồi cô. Lô đất mình hướng nào cô?"], [15e9, 7e9], docTien)));
  ok("boCauGhiTienKhongCo: số khớp DB → giữ nguyên", boCauGhiTienKhongCo(["Dạ cháu ghi 15 tỷ căn Long An, 7 tỷ căn Quận 11 rồi cô."], [15e9, 7e9], docTien).length === 1);
  ok("boCauGhiTienKhongCo: bong bóng 💾/📝 (đọc từ DB) không đụng", boCauGhiTienKhongCo(["📝 Cháu ghi vào tin BDS-Q5-0001: giá 9 tỷ."], [], docTien).length === 1);
  ok("boCauGhiTienKhongCo: câu không nói 'ghi/lưu' → không đụng", boCauGhiTienKhongCo(["Khu này giá tầm 9 tỷ cô ạ."], [7e9], docTien).length === 1);
}

// ── FR-218 (23/09/2026): lời chào không kèm "anh Thu phụ trách"; hiểu nhầm ý khách thì xin lỗi ──
ok("LOI_CHAO không còn câu 'phụ trách khu vực' / 'anh Thu'; 27/09 chỉ nhắc bán: 'cần rao bán bất động sản đúng không ạ'; 06/10 chủ dự án giữ NGẮN hai câu — không vế mời gửi ảnh / không form",
  !/phụ trách|anh Thu/.test(LOI_CHAO) && /cần rao bán bất động sản đúng không ạ\?$/.test(LOI_CHAO) && /\{ten\}/.test(LOI_CHAO)
    && !/gửi ảnh|điền form|nhắn như nhắn bạn/.test(LOI_CHAO) && LOI_CHAO.split(/[.?]\s*/).filter(Boolean).length === 2, LOI_CHAO);
// SRS-5.1zzx (06/10): bắn thử production, bot nói "Anh đang hạng Vàng nên khách tìm kiếm sẽ thấy tin anh trước" — hệ thống chỉ
// xếp tin người Vàng lên trước trong CHAT khi khách mua đã nói đủ khu vực + tầm giá. FEE_RULES phải nói đúng phạm vi đó và cấm lời
// hứa rộng hơn (web, đứng đầu trang, bán nhanh hơn).
ok("FEE_RULES: quyền lợi hạng Vàng nói đúng phạm vi (khách nói rõ khu vực + tầm giá) và cấm hứa 'khách tìm kiếm / lên web thấy trước'",
  /hạng Vàng[^.]*khu vực và tầm giá/.test(FEE_RULES) && /KHÔNG nói "khách tìm kiếm/.test(FEE_RULES) && !/hạng Vàng được ưu tiên khách nét/.test(FEE_RULES), FEE_RULES);
for (const [cau, mong] of [
  ["không phải vậy em, ý anh là mua để ở", true],
  ["em hiểu nhầm rồi, anh cần thuê chứ không mua", true],
  ["hieu sai r e oi", true],
  ["anh đâu có nói quận 7", true],
  ["em ghi nhầm rồi, 7 tỷ 5 chứ", true],
  ["ko phai the, can ho chu k phai nha pho", true],
  ["trả lời lạc đề quá", true],
  ["ý chị là căn góc", true],
  // KHÔNG được kích
  ["không phải chính chủ, anh là môi giới", false],
  ["sai rồi, giá 7 tỷ 5 nha", false],
  ["nhà không phải hẻm cụt", false],
  ["quy hoạch không có gì", false],
  ["tuy anh là môi giới nhưng", false],
  ["không phải trả phí à em", false],
  ["cần mua nhà quận 5 tầm 6 tỷ", false],
  ["nhầm số nhà rồi, số 12 mới đúng", false],
]) ok(`laKhachBaoHieuNham ${JSON.stringify(cau)} → ${mong}`, laKhachBaoHieuNham(cau) === mong);
{
  const r = themXinLoiKhiHieuNham("không phải vậy, ý anh là thuê", ["🤖 Đã lưu nhu cầu: thuê", "Dạ anh cần thuê khu nào ạ?"], "anh");
  ok("themXinLoi: chèn sau dòng máy 🤖, gộp 'Dạ' đầu bong bóng", r.length === 2 && r[1] === "Dạ em xin lỗi anh, em hiểu nhầm ạ. Anh cần thuê khu nào ạ?", JSON.stringify(r));
  const r2 = themXinLoiKhiHieuNham("hiểu sai rồi", ["Dạ em xin lỗi, em sửa lại liền ạ."], null);
  ok("themXinLoi: model đã xin lỗi → giữ nguyên", r2.length === 1 && r2[0] === "Dạ em xin lỗi, em sửa lại liền ạ.", JSON.stringify(r2));
  const r3 = themXinLoiKhiHieuNham("cần mua nhà quận 5", ["Dạ anh cần tầm giá bao nhiêu ạ?"], "anh");
  ok("themXinLoi: khách không báo nhầm → không chèn", r3[0] === "Dạ anh cần tầm giá bao nhiêu ạ?", JSON.stringify(r3));
  const r4 = doiTuXung(themXinLoiKhiHieuNham("ý chú là bán chứ không phải cho thuê", ["Dạ chú bán giá bao nhiêu ạ?"], "chú"), "chú");
  ok("themXinLoi + doiTuXung: khách là chú → 'Dạ cháu xin lỗi chú, cháu hiểu nhầm ạ.'", /^Dạ cháu xin lỗi chú, cháu hiểu nhầm ạ\. Chú bán/.test(r4[0]), JSON.stringify(r4));
  const r5 = themXinLoiKhiHieuNham("hiểu nhầm rồi", ["Dạ.", "Mình cần gì ạ?"], null);
  ok("themXinLoi: chưa biết cách gọi → không 'xin lỗi mình'; bong bóng 'Dạ.' trần thành lời xin lỗi", r5[0] === "Dạ em xin lỗi, em hiểu nhầm ạ." && r5[1] === "Mình cần gì ạ?", JSON.stringify(r5));
}

// ── 23/09/2026 bắn thật 5 bán + 2 mua: khen sai theo MỆNH ĐỀ, mã tin gửi khách mua ──
{
  const r4 = boMenhDeKhenSai(["Hẻm 2m5 ngang 4m thì nhà mình chốn rất được khách tìm. Mình cần bán gấp hay có thể chờ giá thích hợp ạ?"], "Bán nhà hẻm xe máy 2m5 đường Nguyễn Trãi");
  ok("khen hẻm xe máy 2m5 'rất được khách tìm' → bỏ câu khen, giữ câu hỏi", r4.length === 1 && r4[0] === "Mình cần bán gấp hay có thể chờ giá thích hợp ạ?", JSON.stringify(r4));
  const r5 = boMenhDeKhenSai(["Hẻm 5m ô tô vào tận nhà là khách sẵn sàng cọc nhanh, anh chị cần bán gấp hay được giá đẹp thì thôi ạ?"], "hẻm 5m, ô tô đậu ngay trước cửa");
  ok("'ô tô đậu trước cửa' mà bot nói 'ô tô vào tận nhà' → bỏ mệnh đề đó, câu hỏi còn nguyên", r5.length === 1 && r5[0] === "Anh chị cần bán gấp hay được giá đẹp thì thôi ạ?", JSON.stringify(r5));
  const r5b = boMenhDeKhenSai(["Xe hơi vào tận nhà thì khách chuộng lắm. Mình cần bán gấp không ạ?"], "xe hơi vào tận nhà, có gara");
  ok("chủ CÓ nói 'xe hơi vào tận nhà' → giữ lời khen", r5b[0].startsWith("Xe hơi vào tận nhà"), JSON.stringify(r5b));
  const r5c = boMenhDeKhenSai(["Hẻm xe hơi 6m quay đầu thoải mái thì khách chuộng lắm."], "hẻm xe hơi 6m quay đầu thoải mái");
  ok("hẻm 6m xe hơi có căn cứ → giữ lời khen", r5c.length === 1 && /chuộng/.test(r5c[0]), JSON.stringify(r5c));
  ok("laKhenSai: 'hẻm 2m' + 'khách chuộng' → sai", laKhenSai("Hẻm 2m khách chuộng lắm", "hẻm 2m"));
  ok("laKhenSai: 'Mặt tiền kinh doanh khách hay chốt nhanh' khi chủ nói mặt tiền → không sai", !laKhenSai("Mặt tiền An Dương Vương khách hay chốt nhanh lắm", "nhà mặt tiền An Dương Vương"));
  ok("laKhenSai: câu hỏi 'ô tô vào tận nhà được không?' → không đụng", !laKhenSai("Ô tô vào tận nhà được không ạ?", ""));
  // FR-227 b (25/09/2026): từ 3m là hẻm xe hơi; "hxm" khách nói rõ thì vẫn là hẻm xe máy.
  ok("laKhenSai: 'hẻm 3m' + 'khách chuộng' → không còn là hẻm nhỏ", !laKhenSai("Hẻm 3m khách chuộng lắm", "hẻm 3m"));
  ok("laKhenSai: 'hẻm 2m9' + 'khách chuộng' → sai", laKhenSai("Hẻm 2m9 khách chuộng lắm", "hẻm 2m9"));
  ok("laKhenSai: 'hxm' + 'khách chuộng' → sai", laKhenSai("Hxm này khách chuộng lắm", "hxm 3m"));
  const r6 = boMenhDeKhenSai(["Hẻm 3m ô tô vào được thì khách chuộng lắm =) Em tra thấy đường Ngô Y Linh thuộc Phường An Lạc, đúng không anh chị?"], "cần bán nhà hxm 3m đường Ngô Y Linh");
  ok("lx-25: khen 'ô tô vào' dính câu hỏi sau '=)' khi khách nói hxm → bỏ khen, giữ câu hỏi", r6.length === 1 && r6[0] === "Em tra thấy đường Ngô Y Linh thuộc Phường An Lạc, đúng không anh chị?", JSON.stringify(r6));
  const r8 = boMenhDeKhenSai(["Hẻm 3m ô tô vào được là khách chuộng lắm ạ."], "cần bán nhà hxm 3m đường Ngô Y Linh Bình Tân 4x15");
  ok("lx-26: cả tin chỉ là lời khen sai → trả rỗng (nơi gọi dùng câu dự phòng), không trả lại bản gốc", r8.length === 0, JSON.stringify(r8));
  const r7 = boMenhDeKhenSai(["Hẻm xe hơi 5m, khách chuộng lắm. Mình cần bán gấp không ạ?"], "bán nhà hẻm 3m đường Lê Văn Việt");
  ok("lx-24: vế chính bị cắt, còn 'khách chuộng lắm' → bỏ luôn mẩu cụt", r7.length === 1 && r7[0] === "Mình cần bán gấp không ạ?", JSON.stringify(r7));
  const m1 = boMaTinKhach(["Dạ em lưu lại rồi. Em có căn #BDS-NP-Q5-0004 · Hùng Vương Phường 4 · 6 tỷ 9 · 56m2 · 3PN, mình xem thử nha?"], {});
  ok("mã tin + '·' → bỏ mã và dấu, giữ địa chỉ", m1[0] === "Dạ em lưu lại rồi. Em có căn Hùng Vương Phường 4 · 6 tỷ 9 · 56m2 · 3PN, mình xem thử nha?", JSON.stringify(m1));
  const m2 = boMaTinKhach(["Dạ có căn #BDS-Q5-0001 hợp anh nè"], { "BDS-Q5-0001": "Trần Hưng Đạo" });
  ok("mã tin trong câu → thay bằng tên đường của căn", m2[0] === "Dạ có căn Trần Hưng Đạo hợp anh nè", JSON.stringify(m2));
  const m3 = boMaTinKhach(["📝 Em ghi vào tin BDS-Q5-0001: giá 9 tỷ."], {});
  ok("dòng máy 📝 (đọc từ DB) → không đụng", m3[0] === "📝 Em ghi vào tin BDS-Q5-0001: giá 9 tỷ.", JSON.stringify(m3));
  const m4 = boMaTinKhach(["Căn BDS-Q5-0001 và căn BDS-Q5-0002 đều hợp anh"], { "BDS-Q5-0001": "Trần Hưng Đạo" });
  ok("mã không có trong kho → bỏ, không để 'căn căn'", m4[0] === "Căn Trần Hưng Đạo và căn đều hợp anh", JSON.stringify(m4));
}

// ── 24/09/2026 FR-218 b: đủ quận + giá mà model chỉ hỏi dò → đưa căn ──
{
  const cans = [
    { code: "BDS-NP-Q5-0005", ten: "Trần Bình Trọng", dong: "Trần Bình Trọng Phường 1 · 6 tỷ 5 · 60m² · trệt + lửng + 2 lầu · 3 phòng ngủ" },
    { code: "BDS-NP-Q5-0003", ten: "Nguyễn Trãi", dong: "Nguyễn Trãi Phường 2 · 6 tỷ 3 · 56m²" },
    { code: "BDS-NP-Q5-0001", ten: "Hùng Vương", dong: "Hùng Vương Phường 4 · 6 tỷ 7" },
  ];
  ok("coNhacCan: nhắc tên đường KHÔNG dấu vẫn tính", coNhacCan(["Dạ căn tran binh trong hợp mình nè"], cans));
  ok("coNhacCan: nhắc mã tin", coNhacCan(["căn #BDS-NP-Q5-0003 nè"], cans));
  ok("coNhacCan: chỉ câu hỏi dò → chưa nhắc căn", !coNhacCan(["Dạ mình có ba mẹ ở cùng hay phòng riêng vậy?"], cans));
  ok("coNhacCan: bong bóng 🤖 báo lưu có tên đường → không tính", !coNhacCan(["🤖 Đã lưu nhu cầu: khu vực muốn tìm: Nguyễn Trãi"], cans));
  const bb = bongBongGoiYCan(cans, "chị");
  ok("bongBongGoiYCan: 2 căn đầu, không mã, kết bằng MỘT câu hỏi, viết hoa đầu câu hỏi",
    /Trần Bình Trọng/.test(bb) && /Nguyễn Trãi/.test(bb) && !/Hùng Vương/.test(bb) && !/BDS-/.test(bb) && (bb.match(/\?/g) ?? []).length === 1 && /\nChị thấy căn nào/.test(bb), bb);
  const hd = boCauHoiDo(["🤖 Đã lưu nhu cầu: mua", "Dạ mình có ba mẹ ở cùng hay phòng riêng vậy?", "Quận 5 bên em có Lakai và Dragon Riverside ạ."]);
  ok("boCauHoiDo: bỏ câu hỏi dò ngắn, giữ báo lưu + câu có nội dung", hd.length === 2 && hd[0].startsWith("🤖") && /Lakai/.test(hd[1]), JSON.stringify(hd));
}

// ── 24/09/2026 FR-218 c: câu khẳng định đặc điểm căn không ghi; alley bịa trong hồ sơ mua ──
{
  const cans = [
    { ten: "Châu Văn Liêm", du_lieu: "Châu Văn Liêm P10 · trệt + 2 lầu · 3PN · chủ tả: phòng nào cũng có cửa sổ đón gió" },
    { ten: "Hùng Vương", du_lieu: "Hùng Vương P4 · trệt + 2 lầu · chủ tả: phía sau có khoảng đất trống rộng cho chó mèo" },
    { ten: "Trần Bình Trọng", du_lieu: "Trần Bình Trọng P1 · chủ tả: có 1 phòng ngủ ngay tầng trệt tiện cho ông bà" },
  ];
  const d1 = boDacDiemKhongCo(["• Châu Văn Liêm P10 · 6 tỷ 8\n• Hùng Vương P4 · 6 tỷ 7\n\nCả 2 căn đều có phòng ngủ ở tầng trệt cho ba mẹ. Mình xem căn nào trước ạ?"], cans);
  ok("'Cả 2 căn đều có phòng ngủ ở tầng trệt' cho 2 căn không ghi → thay bằng 'em hỏi lại chủ', giữ danh sách + câu hỏi",
    d1.bo.length === 1 && !/đều có phòng ngủ/.test(d1.replies[0]) && /hỏi lại chủ/.test(d1.replies[0]) && /Châu Văn Liêm/.test(d1.replies[0]) && /xem căn nào trước ạ\?$/.test(d1.replies[0]), JSON.stringify(d1));
  const giu = [
    ["căn CÓ ghi phòng ngủ trệt", "Căn Trần Bình Trọng có 1 phòng ngủ ngay tầng trệt cho ba mẹ nha."],
    ["'sân sau' khớp 'đất trống phía sau'", "Căn Hùng Vương có sân sau rộng cho cún chạy."],
    ["câu phủ định", "Căn Châu Văn Liêm không có thang máy ạ."],
    ["câu hỏi", "Căn Châu Văn Liêm có thang máy không ạ?"],
    ["dòng máy 🤖", "🤖 Đã lưu nhu cầu: cần phòng ngủ ở tầng trệt"],
    ["không gắn với căn nào", "Nhà có phòng ngủ ở tầng trệt thì ba mẹ đỡ leo cầu thang lắm."],
  ];
  for (const [ten, cau] of giu) {
    const r = boDacDiemKhongCo([cau], cans);
    ok(`giữ nguyên: ${ten}`, r.bo.length === 0 && r.replies[0] === cau, JSON.stringify(r));
  }
  const d2 = boDacDiemKhongCo(["Căn Châu Văn Liêm có thang máy, sân thượng rộng."], cans);
  ok("thang máy căn không ghi → thay", d2.bo.includes("thang máy") && !/có thang máy/.test(d2.replies[0]), JSON.stringify(d2));
  const h1 = locHoSoMua({ alley: "hẻm xe hơi" }, "tìm nhà quận 5 tầm 6 tới 7 tỷ, có phòng ngủ dưới trệt cho ba mẹ già");
  ok("hồ sơ mua: alley 'hẻm xe hơi' khi khách không nói gì về đường vào → gỡ", h1.profile.alley === null && h1.bo.includes("alley"), JSON.stringify(h1));
  const h2 = locHoSoMua({ alley: "hẻm xe hơi" }, "cần hẻm ô tô vào được");
  ok("hồ sơ mua: khách nói 'hẻm ô tô' → giữ alley", h2.profile.alley === "hẻm xe hơi", JSON.stringify(h2));
}

// ── 24/09/2026: 🤖 chỉ thứ bóc từ tin vừa nhắn, giá trị trong ngoặc kép. SRS-5.1zzzzn: "🤖 Đã trích xuất:" + một dòng mỗi mục,
//    `"<nguyên mẫu>" → làm chuẩn "<chữ chuẩn>"`; không có tin khách để tìm nguyên mẫu → chỉ phần làm chuẩn. ──
{
  const t1 = bocTachTaoTin({ property_type: "nha_pho", deal: "ban", location_raw: "hẻm 4m Nguyễn Trãi", ward: "Phường Chợ Quán", district: "Quận 5", area_m2: 56, price_raw: "5 tới 6", price_vnd: null, bedrooms: 2 });
  ok("bocTachTaoTin: lượt tạo tin in từng cột trong ngoặc kép, giá không ra số nói rõ",
    t1 === '🤖 Đã trích xuất:\n• loại: làm chuẩn "Nhà phố bán"\n• địa chỉ: làm chuẩn "Hẻm 4m Nguyễn Trãi, Phường Chợ Quán, Quận 5"\n• diện tích: làm chuẩn "56m²"\n• phòng ngủ: làm chuẩn "2"\n• giá: làm chuẩn "5 tới 6 (chưa đọc ra số)"', String(t1));
  const t2 = bocTachTaoTin({ property_type: "nha_pho", deal: "ban", location_raw: "hẻm 12 Hồ Ngọc Lãm", district: null, area_m2: 50, price_raw: "3 tỷ", price_vnd: 3e9 });
  ok("bocTachTaoTin: chưa rõ quận → nói '(chưa rõ quận)', không bịa Quận 5", /địa chỉ: làm chuẩn "Hẻm 12 Hồ Ngọc Lãm \(chưa rõ quận\)"/.test(t2 ?? "") && !/Quận 5/.test(t2 ?? ""), String(t2));
  // SRS-5.1zzzzj (bắn production 09/10: 🤖 "địa chỉ: duong Phạm Văn Chiêu…"): cột lưu nguyên văn, bản IN qua `diaChiHienThi` — từ loại chuẩn,
  // tên đường từ điển (cột street), phường chỉ từ cột chuẩn; đuôi "p14 go vap" khách gõ không in lại.
  const tDc = bocTachTaoTin({ property_type: "nha_pho", deal: "ban", location_raw: "duong pham van chieu p14 go vap", street: "Phạm Văn Chiêu", ward: "Phường An Hội Tây", district: "Quận Gò Vấp" });
  ok("bocTachTaoTin: 'duong pham van chieu p14 go vap' → in 'Đường Phạm Văn Chiêu, Phường An Hội Tây, Quận Gò Vấp'",
    /địa chỉ: làm chuẩn "Đường Phạm Văn Chiêu, Phường An Hội Tây, Quận Gò Vấp"/.test(tDc ?? "") && !/duong|p14/.test(tDc ?? ""), String(tDc));
  // SRS-5.1zzzzn: cùng tin, CÓ câu rao → nguyên mẫu là cụm khách gõ (không dấu, kèm đuôi phường khách gõ), làm chuẩn từ cột chuẩn.
  const tDc2 = bocTachTaoTin({ property_type: "nha_pho", deal: "ban", location_raw: "duong pham van chieu p14 go vap", street: "Phạm Văn Chiêu", ward: "Phường An Hội Tây", district: "Quận Gò Vấp" },
    { tin: "a can ban gap nha hem xe hoi duong pham van chieu p14 go vap" });
  ok("TRX-DUONG đường không dấu: '• địa chỉ: \"duong pham van chieu p14 go vap\" → làm chuẩn \"Đường Phạm Văn Chiêu, Phường An Hội Tây, Quận Gò Vấp\"'",
    /\n• địa chỉ: "duong pham van chieu p14 go vap" → làm chuẩn "Đường Phạm Văn Chiêu, Phường An Hội Tây, Quận Gò Vấp"/.test(tDc2 ?? ""), String(tDc2));
  const t0 = bocTachTaoTin({ property_type: "nha_pho", deal: "ban", location_raw: null, ward: null, district: null });
  // FR-226 a (25/09/2026, chủ dự án: "Nhà người ta chưa có gì mà nó tự nhận là nhà phố"): tin nhà chưa có dấu hiệu nhà phố → "Nhà".
  ok("bocTachTaoTin: chưa có địa chỉ → KHÔNG in 'địa chỉ: \"(chưa rõ)…\"'; chưa có dấu hiệu nhà phố → 'Nhà bán'", t0 === '🤖 Đã trích xuất:\n• loại: làm chuẩn "Nhà bán"', String(t0));
  ok("bocTachTaoTin: câu rao 'bán nhà 4 tấm' / cột số tầng 3 → 'Nhà phố bán'",
    /"Nhà phố bán"/.test(bocTachTaoTin({ property_type: "nha_pho", deal: "ban", description: "bán nhà 4 tấm" }) ?? "") && /"Nhà phố bán"/.test(bocTachTaoTin({ property_type: "nha_pho", deal: "ban", floors: 3 }) ?? ""));
  const t3 = vuaLuuBan([{ question: "so_phong_ngu", answer: "3" }, { question: "ket_cau", answer: "4 tầng" }], { ket_cau: "kết cấu", so_phong_ngu: "số phòng ngủ" });
  ok("vuaLuuBan: lượt sau → 'Đã trích xuất' + đúng các fact lượt đó", t3 === '🤖 Đã trích xuất:\n• kết cấu: làm chuẩn "4 tầng"\n• số phòng ngủ: làm chuẩn "3"', String(t3));
  // SRS-5.1zzzc (chat thử 07/10): AI ghi loại BĐS bằng mã — 🤖 in chữ người đọc, không in "nha_cap4".
  for (const [ma, chu] of [["nha_cap4", "nhà cấp 4"], ["chung_cu", "căn hộ chung cư"], ["dat_nong_nghiep", "đất nông nghiệp"]]) {
    const tL = vuaLuuBan([{ question: "loai_bds", answer: ma }], { loai_bds: "loại bất động sản" });
    ok(`SRS-5.1zzzc 🤖 loại BĐS '${ma}' → '${chu}'`, tL === `🤖 Đã trích xuất:\n• loại bất động sản: làm chuẩn "${chu}"`, String(tL));
  }
  const t4 = vuaLuuBan([{ question: "dien_tich", answer: "5x12" }, { question: "dien_tich_dat", answer: "5x12" }], { dien_tich: "diện tích", dien_tich_dat: "diện tích đất" }, { tin: "5x12 em" });
  ok("vuaLuuBan: '5x12' ghi vào hai khoá diện tích → in MỘT lần", (t4?.match(/5x12/g) ?? []).length === 1, String(t4));
  const t5 = vuaLuuBan([{ question: "dien_tich", answer: "60m2" }, { question: "dien_tich_dat", answer: "80m2" }], { dien_tich: "diện tích", dien_tich_dat: "diện tích đất" });
  ok("vuaLuuBan: hai khoá diện tích KHÁC giá trị → in đủ cả hai", /60m²/.test(t5 ?? "") && /80m²/.test(t5 ?? ""), String(t5));
  // ── SRS-5.1zzzzn: nguyên mẫu → làm chuẩn, mỗi ca một bộ in một nguồn ──
  const N = { phuong: "phường", gia: "giá mong muốn", dien_tich: "diện tích", vi_tri: "vị trí cụ thể", bo_sung: "ghi thêm", phap_ly: "pháp lý", mat_tien: "chiều ngang mặt tiền" };
  const v1 = vuaLuuBan([{ question: "phuong", answer: "Phường Phú Định", goc: ["phường phú định"] }], N, { tin: "phường phú định em" });
  ok("TRX-PHUONG phường mới: '\"phường phú định\" → làm chuẩn \"Phường Phú Định (Quận 8 cũ)\"'", v1 === '🤖 Đã trích xuất:\n• phường: "phường phú định" → làm chuẩn "Phường Phú Định (Quận 8 cũ)"', String(v1));
  // Phường SỐ cũ: cửa ghi đổi "phường 13" (+ Quận 8) → Phường Phú Định; chữ vào cửa (`vao`) là ứng viên nguyên mẫu.
  const v1b = vuaLuuBan([{ question: "phuong", answer: "Phường Phú Định", goc: [null, "phường 13"] }], N, { tin: "phường 13 quận 8 nha em" });
  ok("TRX-PHUONG-CU phường số cũ: '\"phường 13\" → làm chuẩn \"Phường Phú Định (Quận 8 cũ)\"'", /• phường: "phường 13" → làm chuẩn "Phường Phú Định \(Quận 8 cũ\)"/.test(v1b ?? ""), String(v1b));
  const v2 = vuaLuuBan([{ question: "gia", answer: "9 ty 5" }], N, { tin: "gia 9 ty 5 co thuong luong" });
  ok("TRX-TIEN tiền '9 ty 5' → làm chuẩn '9 tỷ 5' (donViGiaDep)", v2 === '🤖 Đã trích xuất:\n• giá mong muốn: "9 ty 5" → làm chuẩn "9 tỷ 5"', String(v2));
  const v3 = vuaLuuBan([{ question: "dien_tich", answer: "4x15" }], N, { tin: "nhà 4x15, 3 lầu" });
  ok("TRX-KICH-THUOC '4x15' → làm chuẩn 'ngang 4m × dài 15m (60m²)'", v3 === '🤖 Đã trích xuất:\n• diện tích: "4x15" → làm chuẩn "ngang 4m × dài 15m (60m²)"', String(v3));
  const v3b = vuaLuuBan([{ question: "mat_tien", answer: "ngang 4,5m dài 16m" }], N, { tin: "ngang 4,5m dài 16m nha" });
  ok("TRX-KICH-THUOC-2 'ngang 4,5m dài 16m' → 'ngang 4,5m × dài 16m (72m²)'", /"ngang 4,5m dài 16m" → làm chuẩn "ngang 4,5m × dài 16m \(72m²\)"/.test(v3b ?? ""), String(v3b));
  const v4 = vuaLuuBan([{ question: "vi_tri", answer: "hem 45 pham the hien" }], N, { tin: "hem 45 pham the hien p5 q8", dong: { street: "Phạm Thế Hiển" } });
  ok("TRX-DUONG-FACT đường không dấu (fact vị trí) → làm chuẩn 'Hẻm 45 Phạm Thế Hiển' (duongHienThi + tên từ điển)",
    v4 === '🤖 Đã trích xuất:\n• vị trí cụ thể: "hem 45 pham the hien" → làm chuẩn "Hẻm 45 Phạm Thế Hiển"', String(v4));
  // SĐT trong cụm khách gõ: che bằng luật liên hệ MỘT nguồn (thayLienHe) ở CẢ hai phần.
  const v5 = vuaLuuBan([{ question: "bo_sung", answer: "chủ gọi 0903 123 456 xem nhà" }], N, { tin: "chủ gọi 0903 123 456 xem nhà nha" });
  ok("TRX-SDT SĐT trong nguyên mẫu bị che '[đã che liên hệ]', không còn số", !!v5 && !/0903|123 456/.test(v5) && /\[đã che liên hệ\]/.test(v5), String(v5));
  // Nguyên mẫu chỉ là chữ CÓ trong tin khách: ứng viên không có trong tin → chỉ in phần làm chuẩn (không bao giờ bịa chữ "khách gõ").
  const v6 = vuaLuuBan([{ question: "phap_ly", answer: "sổ hồng riêng", goc: ["sổ hồng riêng"] }], N, { tin: "đúng rồi em" });
  ok("TRX-KHONG-BIA khách chỉ gật → '• pháp lý: làm chuẩn \"sổ hồng riêng\"' (không có nguyên mẫu)", v6 === '🤖 Đã trích xuất:\n• pháp lý: làm chuẩn "sổ hồng riêng"', String(v6));
  // Nguyên mẫu và làm chuẩn chỉ khác hoa thường → in MỘT lần, chữ chuẩn.
  const v7 = vuaLuuBan([{ question: "phap_ly", answer: "Sổ hồng riêng" }], N, { tin: "sổ hồng riêng em" });
  ok("TRX-MOT-LAN như nhau (bỏ qua hoa thường) → in một lần", v7 === '🤖 Đã trích xuất:\n• pháp lý: "Sổ hồng riêng"', String(v7));
  ok("TRX-CAU-BOT traLoiCauBot kèm nguyên mẫu → làm chuẩn",
    traLoiCauBot("Anh cần rao bán đúng không ạ?", "cần rao bán", "đúng rồi em") === '🤖 Trả lời câu em vừa hỏi ("Anh cần rao bán đúng không ạ?"): đã trích xuất "đúng rồi em" → làm chuẩn "cần rao bán".');
  // Lượt tạo tin: diện tích nhân từ ngang × dài — nguyên mẫu là "4x15" khách gõ; giá; cột suy ra (loại, thông số) chỉ làm chuẩn.
  const tt2 = bocTachTaoTin({ property_type: "nha_pho", deal: "ban", location_raw: "hẻm 6m Phạm Văn Chiêu", ward: "Phường An Hội Tây", district: "Quận Gò Vấp",
    area_m2: 60, frontage_m: 4, length_m: 15, price_raw: "9 ty 5", price_vnd: 9.5e9 }, { tin: "ban nha hem 6m Phạm Văn Chiêu p14 go vap 4x15 9 ty 5" });
  ok("TRX-TAO-TIN lượt tạo tin: diện tích '\"4x15\" → làm chuẩn \"60m²\"', giá '\"9 ty 5\" → làm chuẩn \"9 tỷ 5\"', thông số chỉ làm chuẩn",
    /\n• diện tích: "4x15" → làm chuẩn "60m²"/.test(tt2 ?? "") && /\n• giá: "9 ty 5" → làm chuẩn "9 tỷ 5"/.test(tt2 ?? "") && /\n• thông số: làm chuẩn "4x15m"/.test(tt2 ?? "") &&
      /\n• địa chỉ: "hem 6m Phạm Văn Chiêu" → làm chuẩn "Hẻm 6m Phạm Văn Chiêu, Phường An Hội Tây, Quận Gò Vấp"/.test(tt2 ?? ""), String(tt2));
}

// ── 24/09/2026: "ở Nguyễn Trãi quận 5" là ĐỊA CHỈ, không phải tiềm năng "để ở" ──
for (const [cau, laTiemNang] of [
  ["ở Nguyễn Trãi quận 5", false], ["ở nguyễn trãi q5", false], ["nhà ở Trần Hưng Đạo", false], ["ở phường 2", false],
  ["để ở", true], ["ở", true], ["ở gia đình", true], ["hợp để ở hoặc cho thuê", true], ["kinh doanh", true],
]) {
  const r = nhanDienFact(cau);
  ok(`tiềm năng: ${JSON.stringify(cau)} → ${laTiemNang ? "tiem_nang" : "không phải tiem_nang"}`, (r?.question === "tiem_nang") === laTiemNang, JSON.stringify(r));
}

// ── 24/09/2026 FR-219: thứ tự "chủ nhà dễ trả lời trước"; câu liên quan không vượt dải (vật lý → tiền → pháp lý → phường) ──
{
  const CB = (k, p) => ({ fact_key: k, priority: p, nhom: "co_ban" });
  // FR-229 (20260925i): phường / gấp / ảnh dời ra 22 / 23 / 24, dải pháp lý 16–21.
  const nhaPho = [CB("ket_cau", 4), CB("so_phong_ngu", 5), CB("do_rong_hem", 7), CB("gia", 12), CB("phap_ly", 16), CB("phuong", 22), CB("gap", 23), CB("hinh_anh", 24)];
  ok("vừa nói diện tích → hỏi KẾT CẤU (không kéo giá lên dù giá 'liên quan' diện tích)", chonCauKe(["dien_tich_dat"], nhaPho) === "ket_cau", String(chonCauKe(["dien_tich_dat"], nhaPho)));
  ok("vừa nói kết cấu → hỏi phòng ngủ (liên quan, cùng dải)", chonCauKe(["ket_cau"], nhaPho.slice(1)) === "so_phong_ngu");
  ok("vừa nói giá → hỏi PHÁP LÝ, không nhảy sang phường", chonCauKe(["gia"], [CB("phap_ly", 16), CB("phuong", 22), CB("gap", 23)]) === "phap_ly");
  ok("vừa nói vị trí → hỏi diện tích, không nhảy sang phường", chonCauKe(["vi_tri"], [CB("dien_tich_dat", 3), CB("ket_cau", 4), CB("phuong", 22)]) === "dien_tich_dat");
  ok("vừa nói hẻm → kết cấu còn thiếu thì hỏi kết cấu (liên quan, cùng dải vật lý)", chonCauKe(["do_rong_hem"], [CB("so_phong_ngu", 5), CB("ket_cau", 4), CB("gia", 12)]) === "ket_cau");
}

// ── 24/09/2026 FR-220: trả lời "có tầng lửng, sân thượng hay tầng hầm không" → chen vào kết cấu chữ ──
{
  const ca = [
    ["trệt + 2 lầu", 3, "có lửng với sân thượng", "trệt + lửng + 2 lầu + sân thượng"],
    ["trệt + 2 lầu", 3, "không có lửng, có sân thượng", "trệt + 2 lầu + sân thượng"],
    ["trệt + 2 lầu", 3, "lửng thì có, hầm không", "trệt + lửng + 2 lầu"],
    ["trệt + 2 lầu", 3, "không có lửng mà có sân thượng", "trệt + 2 lầu + sân thượng"],
    ["1 trệt 2 lầu", 3, "có gác lửng", "1 trệt + lửng + 2 lầu"],
    [null, 4, "có tầng hầm và sân thượng", "hầm + trệt + 3 lầu + sân thượng"],
    ["4 tầng", 4, "có lửng", "4 tầng + lửng"],
    ["trệt", 1, "có áp mái", "trệt + áp mái"],
    ["trệt + 2 lầu", 3, "không có", null],
    ["trệt + 2 lầu", 3, "có", null],
    ["trệt + 2 lầu", 3, "có sân thượng không em?", null],
    [null, null, "có lửng", null],
    ["trệt + lửng + 2 lầu", 3, "có lửng", null],
  ];
  for (const [kc, t, dap, mong] of ca) ok(`tầng phụ "${dap}" trên "${kc ?? t + " tầng"}" → ${mong}`, themTangPhu(kc, t, dap) === mong, String(themTangPhu(kc, t, dap)));
  for (const dap of ["có sân thượng", "không có", "sân thượng thì có", "ko"]) ok(`"${dap}" là câu trả lời KHỚP cho tang_phu`, phanLoaiCauTraLoi("tang_phu", dap).loai === "khop", phanLoaiCauTraLoi("tang_phu", dap).loai);
}

// ── 24/09/2026 (chủ dự án test Zalo, người bán Gò Vấp) ──
{
  ok("'đường số 59 Gò vấp' → vị trí 'đường số 59'", bocViTriRao("Anh cần bán nhà ở đường số 59 Gò vấp,") === "đường số 59", String(bocViTriRao("Anh cần bán nhà ở đường số 59 Gò vấp,")));
  ok("'đường Số 7 phường An Lạc' → 'đường Số 7'", bocViTriRao("bán nhà đường Số 7 phường An Lạc") === "đường Số 7", String(bocViTriRao("bán nhà đường Số 7 phường An Lạc")));
  ok("'hẻm 5m Lê Đức Thọ' không đổi", bocViTriRao("hẻm 5m Lê Đức Thọ gò vấp") === "hẻm 5m Lê Đức Thọ", String(bocViTriRao("hẻm 5m Lê Đức Thọ gò vấp")));
  const T = "137/28 nhé em, cần bán gấp giá 5 tỏi 9 thương lượng 5 tỏi 5 là bán được";
  ok("câu vị trí '137/28 nhé em, cần bán gấp…' → '137/28'", catDapAn("vi_tri", T) === "137/28", catDapAn("vi_tri", T));
  ok("câu vị trí '137/28 Nguyễn Trãi, phường 3' giữ nguyên", catDapAn("vi_tri", "137/28 Nguyễn Trãi, phường 3") === "137/28 Nguyễn Trãi, phường 3", catDapAn("vi_tri", "137/28 Nguyễn Trãi, phường 3"));
  const sn = soNhaDau(T);
  ok("số nhà đầu câu: '137/28' + phần còn lại", sn?.soNha === "137/28" && /^cần bán gấp/.test(sn?.conLai ?? ""), JSON.stringify(sn));
  ok("'số nhà 12/3A' → '12/3A'", soNhaDau("số nhà 12/3A nha")?.soNha === "12/3A");
  ok("'5 tỷ 9, thương lượng' không phải số nhà", soNhaDau("5 tỷ 9, thương lượng") === null);
  ok("'4m, hẻm xe hơi' không phải số nhà", soNhaDau("4m, hẻm xe hơi") === null);
  ok("'dài 16m' + ngang 5 đã có → 'ngang 5m dài 16m'", ghepMotChieu("dien_tich_dat", "dài 16m", "5", null) === "ngang 5m dài 16m", String(ghepMotChieu("dien_tich_dat", "dài 16m", "5", null)));
  ok("'Ngang 5' trần → null (đi đường cũ: ghi mặt tiền, câu diện tích treo)", ghepMotChieu("dien_tich", "Ngang 5", null, 18) === null);
  ok("'dài 16m' mà chưa có ngang → null", ghepMotChieu("dien_tich_dat", "dài 16m", null, null) === null);
  ok("'5x16' đủ hai chiều → null (đường cũ)", ghepMotChieu("dien_tich_dat", "5x16", "5", null) === null);
  ok("đang hỏi giá thì không ghép", ghepMotChieu("gia", "dài 16m", "5", null) === null);
  // 24/09/2026 (chủ dự án test Zalo, nhà mặt tiền Trần Đình Xu)
  const tdx = "Quận 1 8x15m 3 tầng · Góc 2 mặt tiền\nHợp đồng thuê Sacombank đến năm 2031 · 150 triệu/tháng\nGóc hai mặt tiền ngay nút giao Trần Đình Xu – Nguyễn Cư Trinh";
  ok("địa chỉ KHÔNG đi xuyên dấu xuống dòng ('mặt tiền⏎Hợp đồng' không phải địa chỉ)", !/Hợp đồng/.test(bocViTriRao(tdx) ?? ""), String(bocViTriRao(tdx)));
  ok("'mặt tiền ngay nút giao Trần Đình Xu' → giữ trọn tên đường", /Trần Đình Xu$/.test(bocViTriRao("Góc hai mặt tiền ngay nút giao Trần Đình Xu – Nguyễn Cư Trinh") ?? ""), String(bocViTriRao("Góc hai mặt tiền ngay nút giao Trần Đình Xu – Nguyễn Cư Trinh")));
  ok("'đã cho thuê là nhà đã hoàn thiện hết rồi em, đăng rao bán đi' KHÔNG phải báo bán rồi", laNgungRao("đã cho thuê là nhà đã hoàn thiện hết rồi em, đăng rao bán đi") === null, String(laNgungRao("đã cho thuê là nhà đã hoàn thiện hết rồi em, đăng rao bán đi")));
  ok("'nhà đang cho ngân hàng thuê, hợp đồng tới 2031' KHÔNG phải báo bán rồi", laNgungRao("nhà đã cho ngân hàng thuê, hợp đồng tới 2031") === null, String(laNgungRao("nhà đã cho ngân hàng thuê, hợp đồng tới 2031")));
  ok("'bán rồi em' vẫn là bán rồi", laNgungRao("bán rồi em") === "ban_roi");
  ok("'cho thuê được rồi em' vẫn là bán rồi (tin cho thuê)", laNgungRao("cho thuê được rồi em") === "ban_roi");
  ok("'đã có người cọc rồi' vẫn là bán rồi", laNgungRao("đã có người cọc rồi") === "ban_roi", String(laNgungRao("đã có người cọc rồi")));
  for (const t of ["đã trả lời rồi này", "anh nói rồi mà", "trả lời ở trên rồi em", "gửi rồi đó", "nhắn lúc nãy rồi", "Cái giá hồi nãy đó", "như hồi nãy", "giá lúc nãy em"]) ok(`'${t}' là câu 'đã trả lời'`, laNoiDaTraLoi(t));
  for (const t of ["4 tầng, 4 phòng ngủ nhé", "nhà trả lời điện thoại suốt", "anh nói chung là nhà đẹp lắm, 4 tầng, hẻm xe hơi, sổ hồng riêng đầy đủ", "giá 8 tỷ", "nhà ở từ năm 2019"]) ok(`'${t}' KHÔNG phải câu 'đã trả lời'`, !laNoiDaTraLoi(t));
  const bia = ["137m2 trên sổ, giá 5 tỷ 9 thương lượng 5 tỷ 5, khuôn đất này dễ xây lắm anh. Nhà mình xây mấy tầng rồi ạ?"];
  const ra = boCauM2KhongCo(bia, [], "137/28 nhé em, cần bán gấp giá 5 tỏi 9");
  ok("model nói '137m2' mà DB không có, khách không gõ → bỏ câu đó, giữ câu hỏi", ra.length === 1 && !/137m2/.test(ra[0]) && /xây mấy tầng/.test(ra[0]), JSON.stringify(ra));
  ok("model nói '80m2' khớp DB → giữ", boCauM2KhongCo(["80m2 vuông vức, dễ bán lắm anh."], [80], "")[0] === "80m2 vuông vức, dễ bán lắm anh.");
  ok("khách tự gõ 'sàn 200m2' → giữ câu model nhắc 200m2", boCauM2KhongCo(["Sàn 200m2 rộng rãi anh."], [80], "sàn 200m2 nha")[0] === "Sàn 200m2 rộng rãi anh.");
  ok("gạch dài giữa câu → dấu phẩy", boGachDai("Độ đầy đủ 85/100 — thêm tiềm năng là đủ ạ.") === "Độ đầy đủ 85/100, thêm tiềm năng là đủ ạ.", boGachDai("Độ đầy đủ 85/100 — thêm tiềm năng là đủ ạ."));
  ok("gạch giữa hai số → '-'", boGachDai("tầm 5–6 tỷ") === "tầm 5-6 tỷ", boGachDai("tầm 5–6 tỷ"));
  ok("gạch đầu dòng → '- '", boGachDai("— căn 1\n— căn 2") === "- căn 1\n- căn 2", JSON.stringify(boGachDai("— căn 1\n— căn 2")));
  ok("gạch cuối câu không để lại ', .'", boGachDai("Dạ em ghi rồi —.") === "Dạ em ghi rồi.", boGachDai("Dạ em ghi rồi —."));
  ok("bong bóng 🤖 không đụng", boCauM2KhongCo(["🤖 Bóc tách được: diện tích: \"137m2\""], [], "")[0].startsWith("🤖"));
  // 24/09/2026 (chủ dự án: "hoàn công xong chưa cứ hỏi lung tung vậy ko dc"): bot không tự hỏi hoàn công.
  const hc = (x) => boHoiHoanCong([x]);
  ok("'sổ riêng hay chung, đã hoàn công chưa anh?' → bỏ vế hoàn công, giữ 'anh?'", hc("Sổ hồng nhà mình là sổ riêng hay sổ chung, đã hoàn công chưa anh?")[0] === "Sổ hồng nhà mình là sổ riêng hay sổ chung anh?", JSON.stringify(hc("Sổ hồng nhà mình là sổ riêng hay sổ chung, đã hoàn công chưa anh?")));
  ok("câu hỏi chỉ một ý hoàn công → bỏ cả câu, giữ câu ghi nhận", JSON.stringify(hc("Dạ em ghi 4 phòng ngủ rồi.\nNhà mình đã hoàn công xong chưa anh?")) === JSON.stringify(["Dạ em ghi 4 phòng ngủ rồi."]), JSON.stringify(hc("Dạ em ghi 4 phòng ngủ rồi.\nNhà mình đã hoàn công xong chưa anh?")));
  ok("hai câu hỏi: bỏ câu hoàn công, giữ câu kia", JSON.stringify(hc("Nhà đã hoàn công chưa ạ? Anh muốn bán gấp không?")) === JSON.stringify(["Anh muốn bán gấp không?"]));
  ok("'Hoàn công năm nào anh?' → bỏ hết", hc("Hoàn công năm nào anh?").length === 0);
  ok("câu KHẲNG ĐỊNH nhắc hoàn công (chủ đã nói) → giữ", hc("Sổ hồng riêng, hoàn công đủ thì khách yên tâm lắm. Anh muốn rao giá bao nhiêu ạ?")[0] === "Sổ hồng riêng, hoàn công đủ thì khách yên tâm lắm. Anh muốn rao giá bao nhiêu ạ?");
  ok("bong bóng 💾 đọc DB có 'hoàn công' → không đụng", hc("💾 Đã lưu: sổ hồng riêng, hoàn công?")[0] === "💾 Đã lưu: sổ hồng riêng, hoàn công?");
  ok("không nhắc hoàn công → trả nguyên mảng", (() => { const a = ["Sổ riêng hay sổ chung anh?"]; return boHoiHoanCong(a) === a; })());
}

// 25/09/2026 (bắn thật lx-07): số nhà trần → model tự nói "Nhà mặt tiền …". Chủ chưa nói mặt tiền / hẻm thì bỏ mệnh đề đó.
{
  const rao = "Bán nhà 105 Trần Bình Trọng quận 10, 4x15, 1 trệt 2 lầu, 3 phòng ngủ, sổ hồng riêng, giá 12 tỷ";
  const r = boMenhDeKhenSai(["Nhà mặt tiền Trần Bình Trọng, ngang sâu vừa vặn, dễ bán lắm. Em đang rao, có khách hỏi là báo mình liền nha :)"], rao)[0];
  ok("MT-01 số nhà trần, bot nói 'Nhà mặt tiền …' → bỏ mệnh đề đó, giữ phần còn lại", !/mặt tiền/i.test(r) && /Ngang sâu vừa vặn/.test(r) && /có khách hỏi/.test(r), r);
  ok("MT-02 chủ ĐÃ nói 'mặt tiền' → giữ", boMenhDeKhenSai(["Nhà mặt tiền Trần Bình Trọng dễ cho thuê lắm ạ."], "bán nhà mặt tiền 105 Trần Bình Trọng")[0] === "Nhà mặt tiền Trần Bình Trọng dễ cho thuê lắm ạ.");
  ok("MT-03 chủ nói 'MT' viết tắt → giữ", boMenhDeKhenSai(["Nhà mặt tiền kinh doanh tốt ạ."], "ban nha MT Tran Binh Trong 12 ty")[0] === "Nhà mặt tiền kinh doanh tốt ạ.");
  ok("MT-04 'mặt tiền 4m' là chiều ngang, không phải vị trí → giữ", boMenhDeKhenSai(["Mặt tiền 4m nở hậu nhẹ là đẹp rồi ạ."], "4x15 no hau")[0] === "Mặt tiền 4m nở hậu nhẹ là đẹp rồi ạ.");
  ok("MT-05 câu HỎI mặt tiền hay hẻm → giữ", boMenhDeKhenSai(["Nhà mình mặt tiền hay trong hẻm vậy anh?"], rao)[0] === "Nhà mình mặt tiền hay trong hẻm vậy anh?");
  const h = boMenhDeKhenSai(["Nhà trong hẻm yên tĩnh, ở sướng lắm. Anh cần bán gấp không ạ?"], rao)[0];
  ok("MT-06 số nhà trần, bot nói 'nhà trong hẻm' → bỏ, giữ câu hỏi", !/hẻm/.test(h) && /bán gấp/.test(h), h);
  ok("MT-07 số nhà có xuyệt '105/12' → 'trong hẻm' có căn cứ, giữ", boMenhDeKhenSai(["Nhà trong hẻm yên tĩnh lắm ạ."], "bán nhà 105/12 Trần Bình Trọng")[0] === "Nhà trong hẻm yên tĩnh lắm ạ.");
  ok("MT-08 chủ nói 'HXH' → 'hẻm' có căn cứ, giữ", boMenhDeKhenSai(["Hẻm rộng thoáng ạ."], "nha HXH 6m")[0] === "Hẻm rộng thoáng ạ.");
}

// 25/09/2026 (bắn thật lx-09 / lx-08): câu hỏi model lệch khoá code chọn; "đã đăng lên web" khi tin chưa đăng.
{
  const gapMau = "Mình cần ra hàng gấp hay được giá thì thôi anh chị?";
  ok("LK-01 khoá gap, model hỏi hẻm → lệch", laHoiLechKhoa("Dạ, hẻm nhà mình rộng mấy mét, ô tô vào được không anh chị?", "gap"));
  ok("LK-02 thay câu hỏi lệch bằng câu mẫu, giữ phần ghi nhận", thayCauHoiLech("Dạ em ghi rồi ạ. Hẻm nhà mình rộng mấy mét anh chị?", "gap", gapMau) === `Dạ em ghi rồi ạ. ${gapMau}`);
  ok("LK-03 khoá gap, model hỏi 'có cần bán gấp không' → KHÔNG lệch", !laHoiLechKhoa("Dạ vâng. Nhà mình có cần bán gấp không anh?", "gap"));
  ok("LK-04 khoá ket_cau, model hỏi 'mấy lầu' → KHÔNG lệch", !laHoiLechKhoa("Nhà mình xây mấy lầu rồi chị?", "ket_cau"));
  ok("LK-05 khoá phuong, câu hỏi không mang chủ đề nào → KHÔNG lệch (không đoán)", !laHoiLechKhoa("Nhà mình thuộc khu nào vậy anh?", "phuong"));
  ok("LK-06 khoá không có trong bảng → KHÔNG soi", !laHoiLechKhoa("Hẻm rộng mấy mét anh?", "tien_ich"));
  ok("LK-07 không có câu hỏi → KHÔNG lệch", !laHoiLechKhoa("Dạ em ghi nhận rồi ạ.", "gap"));
  ok("LK-08 khoá so_phong_ngu, model hỏi sổ → lệch", laHoiLechKhoa("Sổ hồng riêng hay sổ chung vậy anh?", "so_phong_ngu"));
  const dd = boHuaDaDang(["Em cảm ơn mình tin nhé, đã đăng lên web AI Ơi Nhà Đất rồi :) Em tra thấy đường Trần Bình Trọng thuộc Phường Vườn Lài (Quận 10 cũ), đúng không anh chị?"])[0];
  ok("DD-01 'đã đăng lên web … rồi' → bỏ mệnh đề, giữ lời cảm ơn và câu hỏi", !/đăng/.test(dd) && /Em cảm ơn mình tin nhé/.test(dd) && /Phường Vườn Lài/.test(dd), dd);
  ok("DD-02 'tin đã lên web luôn rồi ạ' → bỏ", boHuaDaDang(["Dạ tin đã lên web luôn rồi ạ. Nhà mình mấy tầng anh?"])[0] === "Nhà mình mấy tầng anh?");
  ok("DD-03 'chưa đăng' (phủ định) → giữ", boHuaDaDang(["Tin chưa đăng đâu ạ, còn thiếu giá."])[0] === "Tin chưa đăng đâu ạ, còn thiếu giá.");
  ok("DD-04 'em sẽ đăng' (tương lai) → giữ", boHuaDaDang(["Đủ thông tin là em sẽ đăng lên web ngay ạ."])[0] === "Đủ thông tin là em sẽ đăng lên web ngay ạ.");
  ok("DD-05 bong bóng 📝 → không đụng", boHuaDaDang(["📝 Đã đăng: 105 Trần Bình Trọng"])[0] === "📝 Đã đăng: 105 Trần Bình Trọng");
}

// 25/09/2026 (bắn thật lx-13): 🤖 "thông số: … lửng … sân thượng" rồi "nhãn: sân thượng · có gác lửng" — không in lặp.
{
  const b = bocTachTaoTin({ property_type: "nha_pho", deal: "ban", location_raw: "105/12 Trần Bình Trọng", ward: "Phường Chợ Quán", district: "Quận 5", floors_text: "trệt + lửng + 2 lầu + sân thượng", frontage_m: 4, length_m: 15, nhan: ["san_thuong", "gac_lung", "yen_tinh"] });
  ok("NL-01 bocTachTaoTin: nhãn bỏ 'sân thượng' / 'có gác lửng' (thông số đã có), giữ 'yên tĩnh'", /nhãn: làm chuẩn "yên tĩnh"/.test(b) && !/nhãn: [^\n]*(?:sân thượng|lửng)/.test(b), b);
}

// FR-225 a (25/09/2026, chủ dự án test Zalo): khách "nở hậu nhé" → bot "Anh nói nở hậu 4.5 nhỉ, em ghi rồi" (số lấy từ ví dụ prompt).
{
  const bc = "5x12 · nở hậu nhé · a bán 4t";
  ok("SOBIA-01 'nở hậu 4.5' khi khách không nói số → bịa", laSoDoBia("Anh nói nở hậu 4.5 nhỉ", bc));
  ok("SOBIA-02 'nở hậu 4m5' ↔ khách '4m5' / '4,5' ↔ '4.5' → không bịa", !laSoDoBia("nở hậu 4m5 nha", "nở hậu 4m5") && !laSoDoBia("nở hậu 4,5m", "no hau 4.5"));
  ok("SOBIA-03 'ngang 5 dài 12' từ '5x12' → không bịa", !laSoDoBia("ngang 5 dài 12", bc));
  ok("SOBIA-04 'hẻm 3m' khi khách nói 'hẻm 3m5' → bịa", laSoDoBia("hẻm 3m", "hẻm 3m5"));
  const r = boMenhDeKhenSai(boKhenKhongCanCu(["Anh nói nở hậu 4.5 nhỉ, em ghi rồi. Còn giá bán anh định rao là bao nhiêu?"], bc), bc);
  ok("SOBIA-05 câu bịa bị bỏ, câu hỏi giá giữ", r.length === 1 && !/4\.5/.test(r[0]) && /giá bán/.test(r[0]), JSON.stringify(r));
}

// ── 27/09/2026: câu chào mới "anh chị cần rao bán bất động sản đúng không ạ?" — gật trơn là người bán ──
{
  for (const t of ["đúng rồi", "Dạ", "ừ em", "vâng đúng rồi anh bán", "có ạ", "ok em", "phải", "đúng rồi cô"]) ok(`CHAO-GAT '${t}' là gật`, laGatHoiVai(t));
  for (const t of ["đúng rồi anh muốn mua", "không, anh muốn mua", "chào em", "dạ em chào anh", "không phải", "cô", "chú nha", "dạ cô", "ở quận 5"]) ok(`CHAO-GAT '${t}' KHÔNG là gật`, !laGatHoiVai(t));
  const c = boChaoLai("Dạ em chào anh! Anh muốn rao bán hay cho thuê ạ? Anh cho em xin địa chỉ (đường/phường), diện tích và giá mong muốn nha.");
  ok("CHAO-LAI bỏ lời chào lần hai + câu 'bán hay cho thuê', giữ câu xin địa chỉ, mở bằng 'Dạ'", /^Dạ, anh cho em xin địa chỉ/.test(c) && !/chào|bán hay cho thuê/.test(c), c);
  for (const t of ["Hay quá", "ok", "😀", "tuyệt vời"]) ok(`CHUNG-CHUNG '${t}' là câu chung chung`, laCauChungChung(t));
  for (const t of ["anh muốn mua nhà", "không", "có căn ở quận 5", "bán đất", "giá bao nhiêu?"]) ok(`CHUNG-CHUNG '${t}' KHÔNG chung chung`, !laCauChungChung(t));
  ok("CHAO-LAI tin không chào giữ nguyên", boChaoLai("Dạ anh nhắn giúp em địa chỉ nha.") === "Dạ anh nhắn giúp em địa chỉ nha.");
}

// ── 27/09/2026: "Em biết Botanic không" → model bịa "Botanic ở Quận 1, dự án Phú Mỹ Hưng" ──
{
  const ctx = "Anh bán nhà. Căn chung cư ở Botanic. Em biết Botanic không";
  const r = boViTriBia(["Em biết Botanic ở Quận 1, dự án Phú Mỹ Hưng, khách gia đình rất ưa nhà ở đó. Căn anh ở phường mấy vậy?"], ctx);
  ok("VITRI-BIA-01 bỏ câu nêu quận / khu chủ nhà chưa nói, giữ câu hỏi", r.replies[0] === "Căn anh ở phường mấy vậy?" && r.bo.includes("quận 1") && r.bo.includes("phu my hung"), JSON.stringify(r));
  const r2 = boViTriBia(["Dạ Botanic ở Phú Nhuận thì khách đi làm trung tâm tiện lắm. Căn anh phường mấy ạ?"], `${ctx} À không. Botanic ở Phú Nhuận`);
  ok("VITRI-BIA-02 quận chủ nhà đã nói → giữ nguyên", !r2.bo.length && /Phú Nhuận/.test(r2.replies[0]), JSON.stringify(r2));
  const r3 = boViTriBia(["Nhà Quận 5 khách tìm nhiều lắm anh. Hẻm rộng mấy mét anh?"], "bán nhà hẻm Trần Hưng Đạo quận 5");
  ok("VITRI-BIA-03 'Quận 5' có trong câu rao → giữ", !r3.bo.length, JSON.stringify(r3));
  ok("VITRI-BIA-04 câu HỎI nêu quận giữ nguyên", !boViTriBia(["Có phải ở Quận 1 không anh?"], ctx).bo.length);
}

// ── 25–26/09/2026: câu mẫu hai vế bị rút; câu nhận xét lặp y nguyên lượt trước ──
{
  const mau = "Sổ nhà mình đang đứng tên ai anh, có đồng sở hữu như vợ chồng hay anh em thừa kế không?";
  ok("VEMAU-01 'Sổ nhà mình đứng tên ai anh?' mất vế đồng sở hữu → câu mẫu, giữ phần ghi nhận",
    giuVeCauMau("Dạ em ghi rồi. Sổ nhà mình đứng tên ai anh?", "nguoi_dung_ten", mau) === `Dạ em ghi rồi. ${mau}`);
  ok("VEMAU-02 câu model còn vế đồng sở hữu → giữ", giuVeCauMau("Sổ đứng tên ai, có đồng sở hữu không anh?", "nguoi_dung_ten", mau) === "Sổ đứng tên ai, có đồng sở hữu không anh?");
  ok("VEMAU-03 khoá không có vế bắt buộc → giữ", giuVeCauMau("Nhà có tranh chấp gì không anh?", "tranh_chap", "x") === "Nhà có tranh chấp gì không anh?");
  ok("VEMAU-04 bot xin HỌ TÊN người đứng sổ → câu mẫu (hỏi quan hệ)",
    giuVeCauMau("Em hiểu anh là chủ nhân chính của sổ nhé. Anh cho em xin tên người đứng tên trên sổ hồng ạ?", "nguoi_dung_ten", mau) === `Em hiểu anh là chủ nhân chính của sổ nhé. ${mau}`);
  // 27/09 (FR-232): tin bán hỏi pháp lý một câu gộp — model rút còn "sổ riêng hay chung" là mất hai ô.
  const mauPL = "Sổ hồng nhà mình là sổ riêng hay sổ chung, anh đứng tên hay người nhà đứng tên, sổ đang cầm tay hay thế chấp ạ?";
  ok("VEMAU-05 câu sổ gộp bị rút còn một vế → câu mẫu gộp",
    giuVeCauMau("Dạ em ghi rồi. Sổ nhà mình riêng hay chung anh?", "phap_ly", mauPL) === `Dạ em ghi rồi. ${mauPL}`);
  ok("VEMAU-06 câu model còn đủ vế đứng tên + thế chấp → giữ",
    giuVeCauMau("Sổ riêng hay chung, ai đứng tên, đang thế chấp không anh?", "phap_ly", mauPL) === "Sổ riêng hay chung, ai đứng tên, đang thế chấp không anh?");
  ok("VEMAU-07 câu mẫu MỘT vế (tin cho thuê) → không ép thêm vế",
    giuVeCauMau("Sổ nhà mình riêng hay chung anh?", "phap_ly", "Sổ hồng nhà mình là sổ riêng hay sổ chung anh?") === "Sổ nhà mình riêng hay chung anh?");
  ok("LAPLAI-01 'Sổ riêng thì bán nhanh hơn.' lặp lượt trước → bỏ, giữ câu hỏi",
    boCauLapLai("Sổ riêng thì bán nhanh hơn. Sổ nhà mình đứng tên ai anh?", ["Dạ, sổ riêng thì bán nhanh hơn. Nhà mình đã hoàn công chưa anh?"]) === "Sổ nhà mình đứng tên ai anh?");
  ok("LAPLAI-02 câu duy nhất thì giữ", boCauLapLai("Sổ riêng thì bán nhanh hơn.", ["Sổ riêng thì bán nhanh hơn."]) === "Sổ riêng thì bán nhanh hơn.");
  ok("LAPLAI-03 ghi nhận ngắn ('Dạ em ghi nhận.') không bị coi là lặp", boCauLapLai("Dạ em ghi nhận. Sổ cầm tay hay thế chấp?", ["Dạ em ghi nhận. Hoàn công chưa?"]) === "Dạ em ghi nhận. Sổ cầm tay hay thế chấp?");
}

// ── 27/09/2026 (test Zalo): khách đã nói "Giá 8.000.000.000", bot "Em nhớ anh muốn 5 tỷ 2 ạ" ──
{
  const ctx = "Anh muốn bán căn nhà ở đặng Văn ngữ\nGiá 8.000.000.000\nNgang có 3 m";
  const r = boTienBia(["Em nhớ anh muốn 5 tỷ 2 ạ. Anh còn có thể giảm được hay mức này là giá cứng anh?"], ctx);
  ok("TIENBIA-01 bỏ câu nêu số tiền khách chưa nói, giữ câu hỏi", r.replies[0] === "Anh còn có thể giảm được hay mức này là giá cứng anh?" && r.bo[0] === 5.2e9, JSON.stringify(r));
  ok("TIENBIA-02 số khách đã nói (8 tỷ = 8.000.000.000) → giữ", !boTienBia(["Dạ anh muốn 8 tỷ ạ. Anh còn giảm được không?"], ctx).bo.length);
  ok("TIENBIA-03 giá đã ghi trong tin → giữ", !boTienBia(["Dạ giá 9 tỷ em ghi rồi."], "", [9e9]).bo.length);
  ok("TIENBIA-04 hai số trong một câu khách ('thuê 400 triệu 1 tháng bán 65 tỉ') đều là bằng chứng",
    !boTienBia(["Cho thuê 400 triệu/tháng mà giá 65 tỷ thì hợp lý."], "đang cho thuê 400 triệu 1 tháng bán 65 tỉ").bo.length);
}

ok("CANHO-01 tin căn hộ: 'Dạ nhà anh ở phường nào' → 'căn hộ anh'", goiCanHo("Dạ nhà anh ở phường nào vậy anh?") === "Dạ căn hộ anh ở phường nào vậy anh?");
ok("CANHO-02 'Nhà mình' đầu câu → 'Căn hộ mình'; 'nhà phố' không đổi", goiCanHo("Nhà mình tầng mấy ạ? Khu này nhà phố nhiều.") === "Căn hộ mình tầng mấy ạ? Khu này nhà phố nhiều.");

// FR-238 (bắn thật lx-46, 28/09): tin hỏi bù model viết "Ai đứng tên sổ hiện tại nhỉ?" — khách dễ đáp họ tên.
{
  const MAU = "Sổ đất mình do chính mình đứng tên hay người nhà đứng tên, có đồng sở hữu như vợ chồng hay anh em thừa kế không?";
  const tin = "Dạ em chào mình :) Lô đất Nguyễn Văn Tạo này có khách đang hỏi ạ. Mình có vài tấm ảnh sổ, lô đất và đường vào được không? Lô này có tranh chấp gì không ạ? Ai đứng tên sổ hiện tại nhỉ? Em cảm ơn mình nhiều ạ :)";
  const ra = giuCauDungTen(tin, MAU);
  ok("DUNGTEN-01 'Ai đứng tên sổ hiện tại nhỉ?' → câu mẫu (chính mình hay người nhà), câu khác giữ, cảm ơn vẫn đứng cuối",
    !/Ai đứng tên/.test(ra) && ra.includes(MAU) && /tranh chấp/.test(ra) && /ảnh sổ, lô đất/.test(ra) && /cảm ơn mình nhiều ạ :\)$/.test(ra), ra);
  // Bắn lại sau deploy (lx-47): model viết có vế "người nhà" mà vẫn hỏi "đứng tên ai" → vẫn thay bằng câu mẫu.
  const tin2 = "Dạ em chào anh ạ\n\nSổ nhà hiện đứng tên ai (chính anh hay người nhà khác) ạ?\nNhà có tranh chấp gì không ạ?\n\nCảm ơn anh nhé :)";
  const ra2 = giuCauDungTen(tin2, MAU);
  ok("DUNGTEN-02 'đứng tên ai (chính anh hay người nhà khác)' vẫn thay bằng câu mẫu", !/đứng tên ai/.test(ra2) && ra2.includes(MAU) && /tranh chấp/.test(ra2), ra2);
  ok("DUNGTEN-05 tin đã có đúng câu mẫu → để nguyên", giuCauDungTen(`Dạ em chào anh ạ\n${MAU}\nCảm ơn anh nhé :)`, MAU) === `Dạ em chào anh ạ\n${MAU}\nCảm ơn anh nhé :)`);
  const tin3 = "Dạ em chào anh ạ\n\nCó thể gửi vài tấm ảnh sổ được không ạ?\nSổ đứng tên ai vậy anh?\n\nCảm ơn anh nhé :)";
  const ra3 = giuCauDungTen(tin3, MAU);
  ok("DUNGTEN-03 tin nhiều dòng: dòng đứng tên thay bằng câu mẫu, đặt trước dòng cảm ơn", !/đứng tên ai/.test(ra3) && ra3.split("\n").at(-2) === MAU && /^Cảm ơn anh/.test(ra3.split("\n").at(-1)), ra3);
  ok("DUNGTEN-04 không có câu cảm ơn → câu mẫu nối cuối", giuCauDungTen("Ai đứng tên sổ vậy ạ?", MAU) === MAU);
}

// FR-239 (phát lại 3 hội thoại test 27–28/09).
ok("FR239-a 'Em đã lên tin rồi ạ' (tin còn chờ) → bỏ", !/lên tin rồi/.test(boHuaDaDang(["Cho thuê ổn định lắm anh. Em đã lên tin rồi ạ. Phường nào anh?"]).join(" ")));
ok("FR239-a 'em đang rao tích cực' (tin còn chờ) → bỏ", !/rao tích cực/.test(boHuaDaDang(["Tin anh sẽ hot lắm, em đang rao tích cực. Phường nào anh?"]).join(" ")));
ok("FR239-a 'lúc nào lên tin em báo' không bị bỏ", /lên tin/.test(boHuaDaDang(["Đủ thông tin là em lên tin cho anh liền. Phường nào anh?"]).join(" ")));
{
  const vt = boViTriBia(["Đất ở Cần Thơ, Long An là vị trí tốt cho buôn bán anh. Diện tích trên sổ bao nhiêu, ngang dài thế nào anh?"], "Cần đước, long an á e Cần Đước, Long An");
  ok("FR239-d 'Cần Thơ' khách không nói → bỏ câu, giữ câu hỏi", vt.bo.includes("can tho") && !/Cần Thơ/.test(vt.replies.join(" ")) && /Diện tích/.test(vt.replies.join(" ")), JSON.stringify(vt));
  const vt2 = boViTriBia(["Long An đang lên giá lắm anh. Diện tích bao nhiêu anh?"], "Cần đước, long an á e");
  ok("FR239-d tỉnh khách ĐÃ nói (Long An) → giữ", vt2.bo.length === 0, JSON.stringify(vt2));
}
ok("FR239-e tin bán: 'cho thuê gấp' → 'bán gấp'", suaGapTheoDeal("Anh cần cho thuê gấp hay được giá thì thôi?", "ban") === "Anh cần bán gấp hay được giá thì thôi?");
ok("FR239-e tin cho thuê: 'bán gấp' → 'cho thuê gấp'", suaGapTheoDeal("Chị cần bán gấp không ạ?", "cho_thue") === "Chị cần cho thuê gấp không ạ?");
ok("FR239-e tin bán 'đang cho thuê 20 triệu' không đụng", suaGapTheoDeal("Nhà đang cho thuê 20 triệu, anh cần bán gấp không?", "ban") === "Nhà đang cho thuê 20 triệu, anh cần bán gấp không?");
ok("FR239-g 'Dạ, em ghi lại rồi anh.' (không lưu được gì) → bỏ, giữ câu hỏi", JSON.stringify(boGhiNhanSuong(["Dạ, em ghi lại rồi anh. Anh cho em xin địa chỉ để em lên tin nha?"])) === JSON.stringify(["Anh cho em xin địa chỉ để em lên tin nha?"]));
ok("FR239-g ghi nhận CÓ nội dung ('em ghi 5 tầng rồi') không đụng", boGhiNhanSuong(["Dạ em ghi 5 tầng rồi ạ. Mấy phòng ngủ ạ?"])[0] === "Dạ em ghi 5 tầng rồi ạ. Mấy phòng ngủ ạ?");
ok("FR239-h 'Dạo này khách chuộng khuôn đất … lắm' → bỏ", JSON.stringify(boKhenThiTruong(["Dạo này khách chuộng khuôn đất ngang 3m dài tới 14m lắm anh. Mình có mấy phòng ngủ ạ?"])) === JSON.stringify(["Mình có mấy phòng ngủ ạ?"]));
ok("FR239-h 'khách tìm loại này nhiều lắm' → bỏ", !/khách tìm/.test(boKhenThiTruong(["5 tầng là nhà cao tốt, khách tìm loại này nhiều lắm. Anh có mấy phòng ngủ ạ?"]).join(" ")));
ok("FR239-h lời hứa 'Có khách quan tâm là em báo anh liền ạ' giữ", boKhenThiTruong(["Có khách quan tâm là em báo anh liền ạ."])[0] === "Có khách quan tâm là em báo anh liền ạ.");
ok("FR239-h khen căn ('sổ riêng là tốt lắm') giữ", boKhenThiTruong(["Sổ riêng là tốt lắm anh. Hướng nào ạ?"])[0] === "Sổ riêng là tốt lắm anh. Hướng nào ạ?");
// FR-240 a (phát lại test 28/09 trên production): đoán thanh khoản không số liệu → bỏ; câu hỏi / ý chủ nhà / lời hứa giữ.
for (const [cau, con] of [
  ["5 tầng thì dễ bán lắm anh. Tổng cộng bao nhiêu phòng ngủ anh?", "Tổng cộng bao nhiêu phòng ngủ anh?"],
  ["Dạy kinh doanh cho thuê ổn định thế là khách sẽ mua nhanh lắm anh =)) Đường Trần Hưng Đạo đoạn nhà mình thuộc phường nào vậy anh?", "Đường Trần Hưng Đạo đoạn nhà mình thuộc phường nào vậy anh?"],
  ["Đất 425m2 thổ cư, dài 22m ngang 19m là mảnh đất vuông vắn, dễ bán lắm anh. Anh muốn thu về tầm bao nhiêu ạ?", "Anh muốn thu về tầm bao nhiêu ạ?"],
  ["Nhà mặt tiền thế này bán chạy lắm anh. Sổ riêng hay sổ chung ạ?", "Sổ riêng hay sổ chung ạ?"],
]) ok(`FR240-a '${cau.slice(0, 40)}…' → bỏ câu đoán thanh khoản`, boKhenThiTruong([cau])[0] === con, JSON.stringify(boKhenThiTruong([cau])));
for (const cau of [
  "Anh cần bán nhanh hay đợi được giá ạ?",
  "Dạ anh cần bán nhanh thì em ưu tiên đẩy tin cho mình ạ.",
  "Khách mua hay hỏi pháp lý nên em hỏi kỹ chút nha anh.",
  "Có khách mua là em báo anh liền ạ.",
  "Anh muốn chốt nhanh thì mình để giá mềm chút ạ.",
  "Nhà đang cho khách thuê, hợp đồng còn 4 năm.",
  "Dạ sổ riêng tốt rồi anh.",
  "Giá này khó bán không em?",
]) ok(`FR240-a '${cau.slice(0, 40)}…' giữ`, boKhenThiTruong([cau])[0] === cau, JSON.stringify(boKhenThiTruong([cau])));
// FR-240 d (phát lại test 28/09 trên production): nói người mua hay / thường thích gì → bỏ; "đang rao" khi tin chưa lên → bỏ.
ok("FR240-d 'Khuôn đất ngang dài chuẩn, khách tìm đất nền thường thích thế này.' → bỏ", boKhenThiTruong(["Khuôn đất ngang dài chuẩn, khách tìm đất nền thường thích thế này. Anh muốn thu về tầm bao nhiêu ạ?"])[0] === "Anh muốn thu về tầm bao nhiêu ạ?", JSON.stringify(boKhenThiTruong(["Khuôn đất ngang dài chuẩn, khách tìm đất nền thường thích thế này. Anh muốn thu về tầm bao nhiêu ạ?"])));
ok("FR240-d 'khách mua hay tìm diện tích vừa phải như vậy' → bỏ", boKhenThiTruong(["Ngang 6 dài 17 là kích thước tốt, khách mua hay tìm diện tích vừa phải như vậy. Nhà mình xây mấy tầng rồi anh?"])[0] === "Nhà mình xây mấy tầng rồi anh?");
ok("FR240-d 'Khách mua hay hỏi pháp lý nên em hỏi kỹ…' giữ", boKhenThiTruong(["Khách mua hay hỏi pháp lý nên em hỏi kỹ chút nha anh."])[0] === "Khách mua hay hỏi pháp lý nên em hỏi kỹ chút nha anh.");
ok("FR240-d 'Em đang rao tin cho anh rồi ạ.' (tin chưa lên) → bỏ", boHuaDaDang(["Em đang rao tin cho anh rồi ạ. Đường Trần Hưng Đạo đoạn nhà mình thuộc phường nào vậy anh?"])[0] === "Đường Trần Hưng Đạo đoạn nhà mình thuộc phường nào vậy anh?");
ok("FR240-d lời hứa 'Em sẽ rao tích cực cho anh nha' giữ", boHuaDaDang(["Em sẽ rao tích cực cho anh nha. Phường nào anh?"])[0] === "Em sẽ rao tích cực cho anh nha. Phường nào anh?");
// FR-240 e (phát lại lần ba, v264).
ok("FR240-e 'dòng tiền đẹp lắm, khách đầu tư sẽ quan tâm' → bỏ", boKhenThiTruong(["Dạ anh, cho thuê ngân hàng 400 triệu/tháng là dòng tiền đẹp lắm, khách đầu tư sẽ quan tâm. Phường nào vậy anh?"])[0] === "Phường nào vậy anh?", JSON.stringify(boKhenThiTruong(["Dạ anh, cho thuê ngân hàng 400 triệu/tháng là dòng tiền đẹp lắm, khách đầu tư sẽ quan tâm. Phường nào vậy anh?"])));
ok("FR240-e 'Nếu khách quan tâm em sẽ báo anh liền' giữ", boKhenThiTruong(["Nếu khách quan tâm em sẽ báo anh liền ạ."])[0] === "Nếu khách quan tâm em sẽ báo anh liền ạ.");
ok("FR240-e 'Em cảm ơn anh, đã ghi đủ thông tin rồi ạ.' (tin chưa lên) → giữ lời cảm ơn", boHuaDaDang(["Em cảm ơn anh, đã ghi đủ thông tin rồi ạ. Nhà mình thuộc phường nào vậy anh?"])[0] === "Em cảm ơn anh. Nhà mình thuộc phường nào vậy anh?", JSON.stringify(boHuaDaDang(["Em cảm ơn anh, đã ghi đủ thông tin rồi ạ. Nhà mình thuộc phường nào vậy anh?"])));
ok("FR240-e 'Dạ em ghi đủ rồi ạ.' (ví dụ mẫu) giữ", boHuaDaDang(["Dạ em ghi đủ rồi ạ. Anh chụp giúp em vài tấm mặt tiền nha?"])[0] === "Dạ em ghi đủ rồi ạ. Anh chụp giúp em vài tấm mặt tiền nha?");
// FR-240 c: tin đất — "nhà / căn nhà + đại từ" → "lô đất + đại từ"; "nhà phố", chữ dính liền không đụng.
ok("FR240-c 'Nhà mình ở đường nào cụ thể…' → 'Lô đất mình…'", goiDat("Nhà mình ở đường nào cụ thể, hay hẻm mấy anh?") === "Lô đất mình ở đường nào cụ thể, hay hẻm mấy anh?");
ok("FR240-c 'Dạ căn nhà anh có sổ chưa?' → 'Dạ lô đất anh…'", goiDat("Dạ căn nhà anh có sổ chưa?") === "Dạ lô đất anh có sổ chưa?");
ok("FR240-c 'Nhà phố mình' không đụng", goiDat("Nhà phố mình") === "Nhà phố mình");

// FR-241 (28/09/2026, bắn 10 ca làm khó lx-70..79 trên production).
ok("FR241-N1 'không cho thuê, đang ở' KHÔNG phải rút tin", laNgungRao("không cho thuê, đang ở") === null);
ok("FR241-N1 'thôi không cho thuê nữa' vẫn là rút tin", laNgungRao("thôi không cho thuê nữa") !== null);
ok("FR241-N1 'không bán nữa em' vẫn là rút tin", laNgungRao("không bán nữa em") !== null);
{ const f = nhanDienNhieuFact("không cho thuê, đang ở").map((x) => x.question);
  ok("FR241-N7 'không cho thuê, đang ở' không thành tiềm năng cho thuê", !f.includes("tiem_nang"), JSON.stringify(f)); }
{ const f = nhanDienNhieuFact("ờ giá 15 tỷ").map((x) => x.question);
  ok("FR241-N7 'ờ giá 15 tỷ' → chỉ giá, không tiềm năng 'ở'", f.includes("gia") && !f.includes("tiem_nang"), JSON.stringify(f)); }
ok("FR241-N2 khách tự nhắn 'giá chín tỷ rưỡi' → ô giá (không rơi vào bổ sung)", nhanDienFact("giá chín tỷ rưỡi")?.question === "gia" && docTien(nhanDienFact("giá chín tỷ rưỡi").answer) === 9_500_000_000);
ok("FR241-N2 'chín tỷ hai nha em' → giá 9,2 tỷ", docTien(nhanDienFact("chín tỷ hai nha em")?.answer) === 9_200_000_000, JSON.stringify(nhanDienFact("chín tỷ hai nha em")));
ok("FR241-N2 'bán năm căn' không phải giá", nhanDienFact("bán năm căn")?.question !== "gia");
ok("FR241-N2 docTien 'giá chín tỷ rưỡi' = 9,5 tỷ", docTien("giá chín tỷ rưỡi") === 9_500_000_000);
{ const s4 = gonLoiSua("à nhầm ngang 4m2 chứ không phải 4");
  ok("FR241-N4 'ngang 4m2 chứ không phải 4' → ngang 4.2", s4.laSua && s4.ngang === "4.2", JSON.stringify(s4)); }
{ const f = nhanDienNhieuFact("chưa có sổ, đang chờ ra sổ");
  ok("FR241-N6 'chưa có sổ, đang chờ ra sổ' → ô pháp lý", f.some((x) => x.question === "phap_ly"), JSON.stringify(f)); }
ok("FR241-N6 'Em sẽ hỏi lại chủ nhà' (khách LÀ chủ nhà) → bỏ", boHuaHoiChuNha(["Dạ em ghi nhận. Em sẽ hỏi lại chủ nhà rồi báo anh nha. Giá mình bao nhiêu anh?"])[0] === "Dạ em ghi nhận. Giá mình bao nhiêu anh?", JSON.stringify(boHuaHoiChuNha(["Dạ em ghi nhận. Em sẽ hỏi lại chủ nhà rồi báo anh nha. Giá mình bao nhiêu anh?"])));
ok("FR241-N8 '4 phòng ngủ' khi bằng chứng không có số 4 → bịa", laSoDoBia("nhà 4 phòng ngủ", "3 lầu, hẻm 6m") === true);
ok("FR241-N8 '4 phòng ngủ' khi khách nói '4 phòng' → không bịa", laSoDoBia("nhà 4 phòng ngủ", "3 lầu 4 phòng") === false);
ok("FR241-N9 kết cấu đã có mà hỏi lại 'mấy lầu' → thay bằng câu kế", boHoiLaiDaCo("Dạ em ghi nhận. Nhà mình mấy lầu vậy anh?", new Set(["ket_cau"]), "do_rong_hem", "Hẻm trước nhà rộng khoảng mấy mét anh?") === "Dạ em ghi nhận. Hẻm trước nhà rộng khoảng mấy mét anh?");
ok("FR241-N9 câu hỏi KHÁC khoá đã có → giữ nguyên", boHoiLaiDaCo("Dạ. Hẻm trước nhà rộng mấy mét anh?", new Set(["ket_cau"]), "do_rong_hem", "x") === "Dạ. Hẻm trước nhà rộng mấy mét anh?");
ok("FR241-N10b hiện trạng 'dang o' → 'đang ở'", chuanHienTrang("dang o") === "đang ở");
ok("FR241-l nhà phố: vừa trả lời kết cấu, còn pháp lý (16) + phòng ngủ (21) → hỏi PHÁP LÝ trước, không kéo phòng ngủ lên", chonCauKe(["ket_cau"], [{ fact_key: "phap_ly", priority: 16, nhom: "co_ban" }, { fact_key: "so_phong_ngu", priority: 21, nhom: "co_ban" }, { fact_key: "phuong", priority: 22, nhom: "co_ban" }]) === "phap_ly");
ok("FR241-l căn hộ: vừa nói tầng → vẫn hỏi phòng ngủ (tang → so_phong_ngu giữ)", chonCauKe(["tang"], [{ fact_key: "so_phong_ngu", priority: 4, nhom: "co_ban" }, { fact_key: "huong", priority: 6, nhom: "co_ban" }]) === "so_phong_ngu");
for (const [q, c, m] of [["phap_ly", "sổ chung", true], ["phap_ly", "sổ hồng rồi em", true], ["phap_ly", "sổ đỏ nha em", true], ["phap_ly", "shr", true],
  ["phap_ly", "chưa có sổ", false], ["phap_ly", "sổ chung với anh trai", false], ["phap_ly", "sổ hồng riêng giá 8 tỷ", false], ["phap_ly", "số 5", false],
  ["phuong", "xã Vĩnh Lộc A", true], ["phuong", "phường Tân Thành nha em", true], ["phuong", "phường 8 quận 3", false], ["phuong", "xã Vĩnh Lộc A, đường số 5", false],
  // 30/09/2026 (bắn thật lx-ban-f): "60m2" khi đang hỏi hẻm — AI im, luật bị gạt, bot báo "Không bóc tách được gì".
  ["dien_tich", "60m2", true], ["dien_tich", "60 m2 nha em", true], ["dien_tich", "dt 72,5m2", true], ["dien_tich", "60 mét vuông", true],
  ["dien_tich", "60m2 3 tầng", false], ["dien_tich", "nhà 60m2 giá 5 tỷ", false], ["dien_tich", "60", false]]) {
  ok(`FR241-o câu trọn ${q} '${c}' → ${m}`, laTraLoiTronKhoa(q, c) === m);
}
// FR-242 (29/09/2026, 10 kịch bản mới K1–K10 chạy qua tầng luật). Mỗi ca ghi NGUYÊN NHÂN lỗi cũ.
{ const q = (c) => nhanDienNhieuFact(c).map((f) => f.question);
  const a = (c, k) => nhanDienNhieuFact(c).find((f) => f.question === k)?.answer;
  // K6 — nguyên nhân: luật tiềm năng bắt câu mở bằng "cho thuê" trước luật doanh thu; TRUOC_LA_THUE không biết "cho thuê được".
  ok("FR242-1 'cho thuê được 12 triệu một tháng' → doanh thu, KHÔNG vào giá (không đè giá bán)", q("cho thuê được 12 triệu một tháng").includes("doanh_thu") && !q("cho thuê được 12 triệu một tháng").includes("gia"), JSON.stringify(nhanDienNhieuFact("cho thuê được 12 triệu một tháng")));
  ok("FR242-1 không kích: 'nhà đang cho thuê 25 triệu/tháng' vẫn doanh thu", q("nhà đang cho thuê 25 triệu/tháng").includes("doanh_thu") && !q("nhà đang cho thuê 25 triệu/tháng").includes("gia"));
  ok("FR242-1 không kích: 'cho thuê 15 triệu' (tin thuê báo giá) vẫn là giá", q("cho thuê 15 triệu").includes("gia"));
  ok("FR242-1 không kích: 'để ở hoặc cho thuê đều được' vẫn tiềm năng", q("để ở hoặc cho thuê đều được").includes("tiem_nang"));
  // K6 — nguyên nhân: luật giá chữ chỉ ở nhanDienFact (trả 1 kết quả, diện tích khớp trước) + đuôi "tám trăm" chưa nhận.
  ok("FR242-2 'bán nhà cấp 4 Bình Tân 5x18 giá sáu tỷ tám trăm' → giá 6,8 tỷ", docTien(a("bán nhà cấp 4 Bình Tân 5x18 giá sáu tỷ tám trăm", "gia") ?? "") === 6_800_000_000, JSON.stringify(nhanDienNhieuFact("bán nhà cấp 4 Bình Tân 5x18 giá sáu tỷ tám trăm")));
  ok("FR242-2 không kích: 'bán năm căn, 4x15' không có giá", !q("bán năm căn, 4x15").includes("gia"));
  // K1 — nguyên nhân: "hợp đồng" đứng một mình khớp PHAP_LY_RE (vì HĐMB), xét trước luật thời hạn thuê.
  ok("FR242-3 'hợp đồng tối thiểu 2 năm' → thời hạn thuê, không phải pháp lý", q("hợp đồng tối thiểu 2 năm")[0] === "thoi_han_thue", JSON.stringify(nhanDienNhieuFact("hợp đồng tối thiểu 2 năm")));
  ok("FR242-3 không kích: 'hợp đồng mua bán' vẫn pháp lý", q("hợp đồng mua bán").includes("phap_ly"));
  // K9 — nguyên nhân: so khớp trên chữ bỏ dấu, "đăng ở" = "dang o" = "đang ở".
  ok("FR242-4 'đăng ở đâu vậy em?' không thành hiện trạng", !q("đăng ở đâu vậy em?").includes("hien_trang_su_dung"));
  ok("FR242-4 không kích: 'nhà đang ở' vẫn hiện trạng", q("nhà đang ở").includes("hien_trang_su_dung"));
  ok("FR242-4 không kích: 'dang o' (gõ không dấu) vẫn hiện trạng", q("dang o").includes("hien_trang_su_dung"));
  // K5 — nguyên nhân: luật thổ cư bắt buộc đơn vị m2/%.
  ok("FR242-5 'có 100 thổ cư' → thổ cư 100m2", a("có 100 thổ cư", "tho_cu") === "100m2", JSON.stringify(nhanDienNhieuFact("có 100 thổ cư")));
  ok("FR242-5 không kích: 'thổ cư 60m2' giữ nguyên", a("thổ cư 60m2", "tho_cu") === "60m2");

  // FR-243 (29/09/2026, 10 kịch bản K1–K10 chạy qua bot giả lập): mỗi ca ghi NGUYÊN NHÂN.
  // (a) "2pn2wc" gõ dính → không có phòng ngủ/WC. Nguyên nhân: luật đòi biên từ `\b` sau "pn" và trước số WC; "n2", "n2w" liền chữ.
  ok("FR243-a '2pn2wc' → 2 PN, 2 WC", a("ban can ho 2pn2wc the sun avenue q2", "so_phong_ngu") === "2" && a("ban can ho 2pn2wc the sun avenue q2", "so_wc") === "2", JSON.stringify(nhanDienNhieuFact("ban can ho 2pn2wc the sun avenue q2")));
  ok("FR243-a không kích: '3 phòng ngủ 2 wc' giữ nguyên", a("3 phòng ngủ 2 wc", "so_phong_ngu") === "3" && a("3 phòng ngủ 2 wc", "so_wc") === "2");
  ok("FR243-a không kích: 'toà nhà CHDV 20 phòng' không thành phòng ngủ", !q("toà nhà CHDV 20 phòng").includes("so_phong_ngu"));
  // (b) "à không, chưa bán, vẫn bán nha" sau khi báo bán rồi → tin nằm ở đã chốt. Nguyên nhân: `laRaoLai` đòi chữ rao/đăng/mở.
  ok("FR243-b 'à không, chưa bán, vẫn bán nha' → rút lời báo bán", laRutLoiBan("à không, chưa bán, vẫn bán nha") && !laNgungRao("à không, chưa bán, vẫn bán nha"));
  ok("FR243-b không kích: 'chưa bán em' (không khẳng định vẫn bán) không phải rút lời", !laRutLoiBan("chưa bán em"));
  ok("FR243-b không kích: 'chưa bán hả em?' là câu hỏi", !laRutLoiBan("chưa bán hả em?"));
  ok("FR243-b không kích: 'nhà bán rồi' vẫn là báo bán", laNgungRao("thôi em ơi nhà bán rồi") === "ban_roi" && !laRutLoiBan("thôi em ơi nhà bán rồi"));
  // (c) đất vườn "đang trồng cây ăn trái" → không có hiện trạng. Nguyên nhân: luật hiện trạng chỉ biết nhà (ở / cho thuê / trống).
  ok("FR243-c 'đang trồng cây ăn trái' → hiện trạng", a("đang trồng cây ăn trái", "hien_trang_su_dung") === "đang trồng cây ăn trái", JSON.stringify(nhanDienNhieuFact("đang trồng cây ăn trái")));
  ok("FR243-c không kích: 'đất trong hẻm 4m' không phải hiện trạng", !q("đất trong hẻm 4m").includes("hien_trang_su_dung"));
  ok("FR243-c không kích: 'nhà trong hẻm' vẫn không phải hiện trạng", !q("nhà trong hẻm").includes("hien_trang_su_dung"));
  // (d) thương lượng ra "con thuong luong". Nguyên nhân: luật FACT_PHU trả đoạn khớp trên chữ BỎ DẤU.
  ok("FR243-d 'giá 11 tỷ 5 còn thương lượng' → thương lượng giữ dấu", a("giá 11 tỷ 5 còn thương lượng", "thuong_luong") === "còn thương lượng", JSON.stringify(nhanDienNhieuFact("giá 11 tỷ 5 còn thương lượng")));
  // (e) "đường xe tải vào tận nơi" trả lời câu phường → ghi thành ĐỊA CHỈ. Nguyên nhân: `bocViTriRao` coi chữ sau "đường" (bỏ qua
  // chữ tả đường xe/tải/vào) là tên đường, "tận nơi" lọt vào làm tên.
  ok("FR243-e 'đường xe tải vào tận nơi' không phải địa chỉ", bocViTriRao("đường xe tải vào tận nơi") === null, String(bocViTriRao("đường xe tải vào tận nơi")));
  ok("FR243-e không kích: 'đường Tân Kỳ Tân Quý' giữ nguyên", bocViTriRao("đường Tân Kỳ Tân Quý") === "đường Tân Kỳ Tân Quý", String(bocViTriRao("đường Tân Kỳ Tân Quý")));
  ok("FR243-e không kích: 'duong tan ky tan quy' (không dấu) giữ nguyên", bocViTriRao("duong tan ky tan quy") === "duong tan ky tan quy", String(bocViTriRao("duong tan ky tan quy")));
  ok("FR243-e không kích: 'hẻm xe hơi Tân Hương' giữ nguyên", bocViTriRao("hẻm xe hơi Tân Hương q tân phú") === "hẻm xe hơi Tân Hương", String(bocViTriRao("hẻm xe hơi Tân Hương q tân phú")));

  // FR-244 (29/09/2026, 10 kịch bản L1–L10 qua bot giả lập): mỗi ca ghi NGUYÊN NHÂN.
  // (a) câu rao một mảnh → fact bằng NGUYÊN CÂU (phí quản lý L1, pháp lý L6/L9). Nguyên nhân: không có dấu phẩy thì luật cả câu
  // (`nhanDienFact`, trả `goc`) được nhận nguyên văn.
  ok("FR244-a L1 phí quản lý cắt đúng cụm", a("bán căn hộ Sunrise City q7 block V3 tầng 12 76m2 2pn 2wc giá 4ty6 phí quản lý 15k/m2", "phi_quan_ly") === "15k/m2", JSON.stringify(nhanDienNhieuFact("bán căn hộ Sunrise City q7 block V3 tầng 12 76m2 2pn 2wc giá 4ty6 phí quản lý 15k/m2"))); // FR-248 a: giá trị gọn còn con số
  ok("FR244-a L6 pháp lý 'shr hc', không cả câu", a("can ban nha hxh 4m nguyen trai p2 q5 dt 4x14 2 lau st gia 7t8 shr hc", "phap_ly") === "shr hc");
  ok("FR244-a L9 pháp lý 'giấy tay', không cả câu", a("bán nhà giấy tay Bình Chánh 5x20 giá 1 tỷ 5", "phap_ly") === "giấy tay");
  ok("FR244-a không kích: câu ngắn 'sổ hồng riêng hoàn công' giữ nguyên", a("sổ hồng riêng hoàn công", "phap_ly") === "sổ hồng riêng hoàn công");
  // (b) căn hộ "tầng 12" mất khi AI im. Nguyên nhân: câu một mảnh, luật cả câu trả phí quản lý (MỘT kết quả); vòng quét không có tầng.
  ok("FR244-b L1 căn hộ 'tầng 12' → tang 12", a("bán căn hộ Sunrise City q7 block V3 tầng 12 76m2 2pn 2wc giá 4ty6 phí quản lý 15k/m2", "tang") === "12");
  ok("FR244-b không kích: căn hộ 'tầng 3 lầu' (kết cấu) không thành tầng căn nằm qua luật mới", a("bán căn hộ duplex 2 tầng 3 lầu giá 9 tỷ phí quản lý 20k/m2", "tang") !== "3");
  // (c) "đường Phan Văn Trị phường 10" → địa chỉ dính "phường 10". Nguyên nhân: câu ngắn thì luật vị trí lấy nguyên câu.
  ok("FR244-c địa chỉ cắt trước phường, phường thành ô riêng", a("đường Phan Văn Trị phường 10", "vi_tri") === "đường Phan Văn Trị" && a("đường Phan Văn Trị phường 10", "phuong") === "Phường 10", JSON.stringify(nhanDienNhieuFact("đường Phan Văn Trị phường 10")));
  ok("FR244-c không kích: 'đường Nguyễn Trãi' giữ nguyên, không đẻ phường", a("đường Nguyễn Trãi", "vi_tri") === "đường Nguyễn Trãi" && !q("đường Nguyễn Trãi").includes("phuong"));
  // (d) "à nhà 2 lầu thôi" (sửa lại) → kết cấu ghi nguyên câu. Nguyên nhân: luật kết cấu trả `goc`, không bỏ tiếng đệm.
  ok("FR244-d 'à nhà 2 lầu thôi' → 'nhà 2 lầu'", a("à nhà 2 lầu thôi", "ket_cau") === "nhà 2 lầu", String(a("à nhà 2 lầu thôi", "ket_cau")));
  ok("FR244-d không kích: 'trệt 2 lầu sân thượng' giữ nguyên", a("trệt 2 lầu sân thượng", "ket_cau") === "trệt 2 lầu sân thượng");
  // (e) NMG "căn B sổ hồng riêng" → bong bóng "căn 2". Nguyên nhân: `tachTheoCan` chỉ trả số thứ tự, bỏ chữ khách gọi.
  ok("FR244-e tachTheoCan giữ chữ 'B'", tachTheoCan("căn B sổ hồng riêng")[0]?.nhan === "B");
  ok("FR244-e không kích: 'căn 2 sổ chung' không có chữ", tachTheoCan("căn 2 sổ chung")[0]?.nhan === undefined);
}
ok("FR241-N10b hiện trạng có dấu giữ nguyên", chuanHienTrang("đang cho thuê 20 triệu") === "đang cho thuê 20 triệu");

// ── FR-248 (30/09/2026, bắn lại 6 kịch bản trên v274). Mỗi ca ghi NGUYÊN NHÂN lỗi cũ. ──
// (a) giá trị dính chữ đệm: luật ghi nguyên câu khách vào ô (không ai gọn) → bản nháp in "sổ hồng rồi em", "phí quản lý 15k/m2".
for (const [q, vao, ra] of [["phap_ly", "sổ hồng rồi em", "sổ hồng"], ["phap_ly", "sổ đỏ nha em", "sổ đỏ"], ["phap_ly", "sổ hồng riêng", "sổ hồng riêng"],
  ["phap_ly", "chưa có sổ", "chưa có sổ"], ["phi_quan_ly", "phí quản lý 15k/m2", "15k/m2"], ["phi_quan_ly", "phí ql 1tr/tháng", "1tr/tháng"],
  ["phi_quan_ly", "phí quản lý 20 nghìn/m2 nha", "20 nghìn/m2"], ["gia", "giá 7 tỷ nha em", "giá 7 tỷ"],
  // 02/10/2026 (SRS-5.1v): mọi ô chữ bỏ tiểu từ cuối ("xe container vào tận nơi em"), TRỪ câu đứng tên ("ba anh" là người).
  ["duong_container", "xe container vào tận nơi em", "xe container vào tận nơi"], ["nguoi_dung_ten", "ba anh", "ba anh"],
  // 07/10/2026 (chat thử: bản nháp in "An Dương Vương nha e"): xưng hô gõ tắt một chữ SAU tiểu từ thì bỏ; một chữ đứng trơn giữ.
  ["vi_tri", "An Dương Vương nha e", "An Dương Vương"], ["vi_tri", "137 nguyễn trãi nhé a", "137 nguyễn trãi"], ["vi_tri", "hẻm 5 lê lợi đó c", "hẻm 5 lê lợi"],
  ["vi_tri", "lô C chung cư Hà Đô", "lô C chung cư Hà Đô"], ["vi_tri", "toà E", "toà E"], ["vi_tri", "12 Nguyễn Văn Cừ a", "12 Nguyễn Văn Cừ a"]]) {
  ok(`FR248-a gọn ${q} '${vao}' → '${ra}'`, gonGiaTriFact(q, vao) === ra, gonGiaTriFact(q, vao));
}
ok("FR248-a nhanDienFact('sổ hồng rồi em') → phap_ly 'sổ hồng'", nhanDienFact("sổ hồng rồi em")?.answer === "sổ hồng", JSON.stringify(nhanDienFact("sổ hồng rồi em")));
// (b) "phí quản lý 15k/m2" khi đang hỏi nội thất — AI im, luật bị gạt (khoá AI biết) → mất hẳn.
for (const [c, m] of [["phí quản lý 15k/m2", true], ["phí ql 1tr/tháng nha em", true], ["phí quản lý 15k/m2, nội thất đầy đủ", false], ["phí quản lý bao nhiêu", false]]) {
  ok(`FR248-b câu trọn phi_quan_ly '${c}' → ${m}`, laTraLoiTronKhoa("phi_quan_ly", c) === m);
}
// (c) "o q10" khi hỏi địa chỉ — chỉ có quận: không phải địa chỉ, bản nháp in "📍 O q10, Quận 10".
for (const [c, m] of [["o q10", true], ["ở quận 10 nha em", true], ["p5 q10", true], ["ở Ô Môn", false], ["hẻm 45 q10", false], ["12 Lê Lợi q1", false], ["q10 gần chợ", false]]) {
  ok(`FR248-c chỉ đơn vị hành chính '${c}' → ${m}`, laChiDonViHanhChinh(c) === m);
}
// SRS-5.1zzza (07/10/2026, chat thử): câu hỏi kèm đoán "ở Hồ Chí Minh đúng không?" — lời gật phần đoán không phải địa chỉ.
// Cách nói MỚI chưa từng bắn: "chuẩn rồi a, tại q.8", "vâng sài gòn. nhà chú thuộc quận 3".
for (const [c, m] of [["đúng rồi e. nhà a ở quận 5", true], ["đúng rồi em, nhà anh ở quận 5", true], ["dạ đúng, ở q5", true], ["ừ hcm, quận 5", true],
  ["chuẩn rồi a, tại q8", true], ["vâng sài gòn. nhà chú thuộc quận 3", true],
  ["đúng rồi e. nhà a ở 45 Trần Hưng Đạo quận 5", false], ["không, ở Bình Dương", false], ["đúng rồi", false]]) {
  ok(`SRS-5.1zzza chỉ đơn vị hành chính sau lời gật '${c}' → ${m}`, laChiDonViHanhChinh(c) === m);
}
// SRS-5.1zzzb: hỏi có / không — mảnh đầu là câu trả lời, mảnh sau là ô KHÁC (chỉ tách theo dấu ngắt, câu không dấu để AI đọc).
for (const [q, vao, dau] of [["ha_tang", "ko có, đường 8m", "ko có"], ["quy_hoach", "ko dính, đường 6m", "ko dính"],
  ["ha_tang", "không vướng gì, đất vuông vức", "không vướng gì"], ["ngap_nuoc", "chưa bao giờ, hẻm xe hơi", null],
  ["ha_tang", "không có mặt tiền đẹp em", null], ["thang_may", "dạ có, mới lắp", null], ["phap_ly", "không, sổ chung", null],
  // cách nói MỚI: "hong có gì hết á, sổ hồng riêng"
  ["ha_tang", "hong có gì hết á, sổ hồng riêng", "hong có gì hết á"]]) {
  const t = tachDapCoKhongDau(q, vao);
  ok(`SRS-5.1zzzb tách có/không ${q} '${vao}' → ${dau ?? "không tách"}`, (t?.dau ?? null) === dau, JSON.stringify(t));
}
for (const [q, vao, ra] of [["vi_tri", "đúng rồi e. nhà a ở 45 Trần Hưng Đạo", "45 Trần Hưng Đạo"], ["vi_tri", "ok, 12 Nguyễn Trãi", "12 Nguyễn Trãi"],
  ["do_rong_hem", "dạ đúng, 3m", "3m"], ["vi_tri", "đúng rồi", "đúng rồi"], ["thang_may", "dạ có, mới lắp", "dạ có, mới lắp"]]) {
  ok(`SRS-5.1zzza cắt lời gật ${q} '${vao}' → '${ra}'`, catDapAn(q, vao) === ra, catDapAn(q, vao));
}
for (const [vao, ra] of [[["o q10", null, "Quận 10"], "Quận 10"], [["p5 q10", "Phường 5", "Quận 10"], "Phường 5, Quận 10"],
  [["hẻm 45 Nguyễn Trãi", "Phường 2", "Quận 5"], "Hẻm 45 Nguyễn Trãi, Phường 2, Quận 5"], [["Ô Môn", null, "Cần Thơ"], "Ô Môn, Cần Thơ"]]) {
  ok(`FR248-c diaChiGon ${JSON.stringify(vao)} → '${ra}'`, diaChiGon(...vao) === ra, diaChiGon(...vao));
}
// (d) model đã nói thật "chưa có căn" mà câu hứa cạnh đó vẫn bị thay bằng lời thật → khách đọc "chưa có căn" hai lần.
{
  const r = chanHuaCoHang(["Dạ em lọc lại với 3 phòng ngủ ạ. Hiện em chưa có căn nào sẵn, để em báo ngay khi có căn khớp nhé."], "hiện bên em chưa có căn nào khớp đúng nhu cầu này ạ.");
  const n = (r.replies.join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase().match(/chua co can/g) ?? []).length;
  ok("FR248-d model đã nói 'chưa có căn' → không chèn câu 'chưa có căn' thứ hai", n === 1, JSON.stringify(r));
}
// (e) môi giới rao "…, hh 1%" — câu rao gốc thành mô tả, web in hoa hồng lên trang tin công khai.
for (const [vao, ra] of [["giá 9.2 tỷ TL, hh 1%", "giá 9.2 tỷ TL"], ["giá 5 tỷ, hoa hồng 2% cho sale, sổ hồng", "giá 5 tỷ, sổ hồng"], ["nhà hh1% giá 3 tỷ", "nhà giá 3 tỷ"],
  ["100% thổ cư", "100% thổ cư"], ["thưởng hoa hồng hấp dẫn", "thưởng hoa hồng hấp dẫn"]]) {
  ok(`FR248-e bỏ hoa hồng '${vao}' → '${ra}'`, boHoaHong(vao) === ra, boHoaHong(vao));
}

// (f) bắn lại v275 (lx-mua-e3): hai câu hứa suông lọt — "em ĐỂ lọc … báo" (chữ "để" chen giữa) và "em gợi 2 căn … nhé:" rồi hết.
for (const [c, m] of [["Em để lọc lại và báo mình nhé", true], ["em gợi 2 căn khớp nhu cầu mình nhé:", true], ["Em gợi ý vài căn cho anh nha", true],
  ["Mình muốn em gợi ý khu nào ạ?", false], ["Em hỏi thêm chút nha", false]]) {
  ok(`FR248-f câu hứa '${c}' → ${m}`, laHuaCoHang(c, false) === m);
}

// FR-250 (chủ dự án chat thử 30/09, v277): lượt đầu "em cần bán nhà" → "Cảm ơn đã tin tưởng, mình đã tạo tin rồi. Mình cho mình
// xin địa chỉ…" (bot hứa đã tạo tin + tự xưng "mình"); "Địa chỉ nằm khu vực An Hội Tây, vị trí khá thuận tiện" (khen suông).
{
  const r = botXungEm(boHuaDaDang(["Cảm ơn đã tin tưởng, mình đã tạo tin rồi. Mình cho mình xin địa chỉ nhà nha?"])[0]);
  ok("FR250 bỏ 'mình đã tạo tin rồi', bot xưng em", r === "Cảm ơn đã tin tưởng. Mình cho em xin địa chỉ nhà nha?", r);
  ok("FR250 'Mình ghi nhận rồi' → 'Em ghi nhận rồi'", botXungEm("Mình ghi nhận rồi nha.") === "Em ghi nhận rồi nha.");
  ok("FR250 'mình cho em hỏi' (gọi khách) giữ", botXungEm("Dạ mình cho em hỏi giá nha?") === "Dạ mình cho em hỏi giá nha?");
  // 30/09/2026 (bắn thử người mua, SRS-5.1h)
  ok("loaiKho 'căn hộ' → chung_cu", JSON.stringify(loaiKhoTuHoSo("căn hộ")) === '["chung_cu"]');
  ok("loaiKho 'nhà' trơn → không lọc", loaiKhoTuHoSo("nhà") === null && loaiKhoTuHoSo("mua nhà để ở") === null);
  ok("loaiKho 'đất nền' → đất", (loaiKhoTuHoSo("đất nền") ?? []).includes("dat"));
  ok("loaiKho 'nhà hẻm' → nhà phố…", (loaiKhoTuHoSo("nhà hẻm") ?? []).includes("nha_pho"));
  for (const [v, r] of [["q5", "Quận 5"], ["Q.10, p2", "Quận 10, Phường 2"], ["quan 7", "Quận 7"], ["Bình Thạnh", "Bình Thạnh"], ["Quận 5", "Quận 5"]])
    ok(`chuanKhuVucMua '${v}' → '${r}'`, chuanKhuVucMua(v) === r, chuanKhuVucMua(v));
  ok("boLapCum 'Nguyễn Trãi Nguyễn Trãi P2' → một lần", boLapCum(["là Nguyễn Trãi Nguyễn Trãi P2, 6 tỷ 3"])[0] === "là Nguyễn Trãi P2, 6 tỷ 3");
  ok("boLapCum chữ đơn lặp 'từ từ' giữ", boLapCum(["từ từ ạ"])[0] === "từ từ ạ");
  ok("giongCauHoi hai cách hỏi hẻm/mặt tiền", giongCauHoi("Mình thích hẻm xe hơi hay mặt tiền hơn ạ?", "Mình muốn hẻm xe hơi hay mặt tiền hơn vậy ạ?"));
  ok("giongCauHoi khác ý", !giongCauHoi("Mình thích hẻm xe hơi hay mặt tiền hơn ạ?", "Mình cần mấy phòng ngủ ạ?"));
  ok("bocViTriRao: 'tầng 15 dự án Sunrise City quận 7' không phải số nhà", bocViTriRao("cần bán căn hộ 2pn 68m2 tầng 15 dự án Sunrise City quận 7, full nội thất, giá 4 tỷ 3") === null);
  ok("bocViTriRao: '7 Hồng Bàng phường 12' vẫn là số nhà", bocViTriRao("bán nhà 7 Hồng Bàng phường 12 q5 giá 5 tỷ") === "7 Hồng Bàng");
  ok("boMenhDeKhenSai: 'có hồ bơi' chủ nhà không nói → bỏ vế, giữ phần còn lại",
    JSON.stringify(boMenhDeKhenSai(["Sunrise City có hồ bơi chân mây rộng, căn full nội thất thì khách xem nhà sẽ rất ưng ạ. Ban công căn mình quay hướng nào vậy?"], "căn hộ Sunrise City quận 7, full nội thất"))
      === JSON.stringify(["Căn full nội thất thì khách xem nhà sẽ rất ưng ạ. Ban công căn mình quay hướng nào vậy?"]));
  ok("boMenhDeKhenSai: chủ nói 'có hồ bơi' → giữ", boMenhDeKhenSai(["Dự án có hồ bơi thì khách thích lắm."], "căn hộ có hồ bơi, gym")[0] === "Dự án có hồ bơi thì khách thích lắm.");
  ok("boMenhDeKhenSai: cắt vế khen sai vẫn giữ dấu chấm, không dính câu sau",
    JSON.stringify(boMenhDeKhenSai(["Cảm ơn mình đã chia sẻ, hẻm 5m ô tô vào tận nhà là khách thích lắm. Mình muốn bán gấp hay chờ giá ổn hơn ạ?"], "bán nhà hẻm 5m Lê Hồng Phong"))
      === JSON.stringify(["Cảm ơn mình đã chia sẻ. Mình muốn bán gấp hay chờ giá ổn hơn ạ?"]));
  ok("bocViTriRao: 'hẻm 3m Bình Thạnh 4x12' — tên quận không phải tên đường", bocViTriRao("nhà cấp 4 hẻm 3m Bình Thạnh 4x12 giá 3 tỷ 8 thương lượng") === null);
  ok("bocViTriRao: 'hẻm 3m Lê Văn Sỹ phú nhuận' vẫn nhận đường", bocViTriRao("bán nhà hẻm 3m Lê Văn Sỹ phú nhuận") === "hẻm 3m Lê Văn Sỹ");
  ok("duAnLaTenDuong: dự án 'Khu dân cư Tân Thạnh Đông' chỉ trùng tên xã trong câu → coi là tên địa danh",
    duAnLaTenDuong("Khu dân cư Tân Thạnh Đông", "bán đất thổ cư 5x20 đường nhựa 6m xã Tân Thạnh Đông Củ Chi, sổ riêng, giá 2 tỷ 1") === true);
  ok("duAnLaTenDuong: câu nói rõ 'khu dân cư Tân Thạnh Đông' → là dự án", duAnLaTenDuong("Khu dân cư Tân Thạnh Đông", "bán đất trong khu dân cư Tân Thạnh Đông") === false);
  ok("boHuaTuKiemTra: 'Để em kiểm tra xem cột điện…?' → bỏ, hỏi lại câu mẫu",
    boHuaTuKiemTra('Lô đất "chưa xây gì" là tốt rồi ạ. Để em kiểm tra xem cột điện hay hố ga có chạy qua lô không nha?', "Lô đất có vướng cột điện, hố ga gì không ạ?")
      === 'Lô đất "chưa xây gì" là tốt rồi ạ. Lô đất có vướng cột điện, hố ga gì không ạ?');
  ok("boHuaTuKiemTra: câu thường giữ nguyên", boHuaTuKiemTra("Dạ em ghi rồi ạ. Lô đất hướng nào ạ?", "x") === "Dạ em ghi rồi ạ. Lô đất hướng nào ạ?");
  // SRS-5.1zzzzr: hứa tra giá / gọi điện / đi xem cũng là việc bot không tự làm; "em trả lời", "em gọi anh là" thì không phải hứa.
  for (const [cau, conLai] of [
    ["Dạ vâng anh. Để em tra giúp giá giao dịch quanh khu đó rồi nhắn lại anh nhé.", "Dạ vâng anh."],
    ["Dạ. Em sẽ gọi điện cho chủ nhà rồi báo anh ạ.", "Dạ."],
    ["Dạ được ạ. Mai em qua xem nhà rồi báo lại chú nha.", "Dạ được ạ."],
    ["Dạ. Để em tra cứu quy hoạch khu đó nha chị.", "Dạ."],
  ]) ok(`boHuaTuKiemTra: '${cau}' → bỏ mệnh đề hứa`, boHuaTuKiemTra(cau, null) === conLai, boHuaTuKiemTra(cau, null));
  for (const cau of ["Dạ em trả lời anh liền nha. Nhà mình mấy tầng ạ?", "Dạ em gọi anh là anh Tâm được không ạ?", "Dạ em ghi giá 5 tỷ rồi ạ, phường nào anh?",
    "Dạ tin mình đang chờ duyệt, anh xem bản nháp giúp em nhé.", "Dạ em trao đổi thêm với anh về pháp lý nha. Sổ riêng hay chung ạ?"])
    ok(`boHuaTuKiemTra: '${cau}' → giữ nguyên (không phải lời hứa)`, boHuaTuKiemTra(cau, null) === cau, boHuaTuKiemTra(cau, null));
  ok("boMenhDeKhenSai: 'hẻm 3 m thuận tiện cho xe máy' chủ không nói xe máy → bỏ vế",
    JSON.stringify(boMenhDeKhenSai(["Cảm ơn đã cung cấp thông tin, hẻm 3 m thuận tiện cho xe máy 😊\nBình Thạnh đó thuộc phường nào ạ?"], "nhà cấp 4 hẻm 3m Bình Thạnh 4x12"))
      === JSON.stringify(["Cảm ơn đã cung cấp thông tin.\nBình Thạnh đó thuộc phường nào ạ?"]));
  ok("boTenRiengBia: 'Chợ Lớn Quận 10' viết hoa, khách không nói → gọt, gộp 'chợ, chợ'",
    JSON.stringify(boTenRiengBia(["Dạ em lọc khoảng 1 km từ chợ, chợ và quanh khu Chợ Lớn Quận 10 rồi ạ."], "tìm nhà quận 10 tầm 7 tỷ có căn nào gần chợ không em")) === JSON.stringify(["Dạ em lọc khoảng 1 km từ chợ rồi ạ."]));
  ok("boTenRiengBia: 'chợ An Đông' có trong kho → giữ", boTenRiengBia(["Căn gần chợ An Đông ạ."], "gần chợ An Đông")[0] === "Căn gần chợ An Đông ạ.");
  ok("boCauHuaLoc bỏ 'em sẽ lọc thêm… chờ em một tí'", JSON.stringify(boCauHuaLoc(["Dạ vậy em sẽ lọc thêm mấy căn nữa cho mình ạ, chờ em một tí."])) === "[]");
  ok("boCauHuaLoc giữ câu hỏi 'mình muốn em lọc thêm không ạ?'", JSON.stringify(boCauHuaLoc(["Dạ ok. Mình muốn em lọc thêm căn hẻm xe hơi không ạ?"])) === JSON.stringify(["Dạ ok. Mình muốn em lọc thêm căn hẻm xe hơi không ạ?"]));
  ok("boCauHuaLoc giữ câu có căn thật", JSON.stringify(boCauHuaLoc(["Dạ căn Trần Hưng Đạo 5,8 tỷ hợp mình nè."])) === JSON.stringify(["Dạ căn Trần Hưng Đạo 5,8 tỷ hợp mình nè."]));
  ok("boCauHuaLoc 'đợi em xíu' không dấu", JSON.stringify(boCauHuaLoc(["Da doi em xiu nha.", "Can Tran Hung Dao 5,8 ty."])) === JSON.stringify(["Can Tran Hung Dao 5,8 ty."]));
  ok("chanHuaGuiHinh(null) chỉ bỏ câu hứa, không chèn", JSON.stringify(chanHuaGuiHinh(["Dạ căn Hải Thượng Lãn Ông 6 tỷ 4 ạ. Em gửi hình liền cho mình nha."], null)) === JSON.stringify(["Dạ căn Hải Thượng Lãn Ông 6 tỷ 4 ạ."]));
  ok("boCauHoiLap bỏ câu hỏi lặp, giữ phần khác", JSON.stringify(boCauHoiLap(["Dạ em ghi nhận. Mình muốn hẻm xe hơi hay mặt tiền hơn vậy ạ?"], "Mình thích hẻm xe hơi hay mặt tiền hơn ạ?")) === JSON.stringify(["Dạ em ghi nhận."]));
  ok("FR250 'Sổ nhà mình' giữ", botXungEm("Sổ nhà mình riêng hay chung ạ?") === "Sổ nhà mình riêng hay chung ạ?");
  // 05/10/2026 (SRS-5.1zz): MỘT luật mệnh đề thay danh sách mẫu — cách nói MỚI chưa bắn, và các câu phải GIỮ.
  for (const [vao, ra] of [
    ["Để mình kiểm tra lại rồi báo anh nha.", "Để em kiểm tra lại rồi báo anh nha."],
    ["mình gửi anh bản nháp nha", "em gửi anh bản nháp nha"],
    ["Dạ, mình cập nhật lại giá 7 tỷ 2 rồi ạ.", "Dạ, em cập nhật lại giá 7 tỷ 2 rồi ạ."],
    ["Rồi mình báo anh sau nha.", "Rồi em báo anh sau nha."],
    ["Mình đã lưu lại rồi. Nhà mình mấy toilet ạ?", "Em đã lưu lại rồi. Nhà mình mấy toilet ạ?"],
    ["Mình gửi em thêm hình nha", "Mình gửi em thêm hình nha"],
    ["Mình chụp thêm hình nha?", "Mình chụp thêm hình nha?"],
    ["Mình chốt lịch với em nha", "Mình chốt lịch với em nha"],
    ["Nhà mình mấy toilet ạ?", "Nhà mình mấy toilet ạ?"],
    ["Dạ mình cho em hỏi giá nha?", "Dạ mình cho em hỏi giá nha?"],
    ["🤖 Bóc tách được: mình ghi nhận", "🤖 Bóc tách được: mình ghi nhận"],
  ]) ok(`XM '${vao}' → '${ra}'`, botXungEm(vao) === ra, botXungEm(vao));
  for (const [vao, ra] of [
    ["Cảm ơn em đã ghi nhận bán căn hộ Sunrise City 2PN 70 m² giá 3 tỷ. Căn hộ mình ở tầng mấy ạ?",
      "Dạ em ghi nhận bán căn hộ Sunrise City 2PN 70 m² giá 3 tỷ. Căn hộ mình ở tầng mấy ạ?"],
    ["Cảm ơn anh chị đã ghi nhận ạ.", "Dạ em ghi nhận ạ."],
    ["Cám ơn mình, đã lưu lại.", "Cám ơn mình, đã lưu lại."],
    ["Cảm ơn anh đã chia sẻ thông tin.", "Cảm ơn anh đã chia sẻ thông tin."],
  ]) ok(`bot xưng: '${vao.slice(0, 40)}'`, botXungEm(vao) === ra, botXungEm(vao));
  const k = boKhenViTri(["Dạ em ghi nhận. Địa chỉ nằm khu vực An Hội Tây, vị trí khá thuận tiện. Cho em xin diện tích nha?"]);
  ok("FR250 bỏ 'vị trí khá thuận tiện'", k[0] === "Dạ em ghi nhận. Địa chỉ nằm khu vực An Hội Tây. Cho em xin diện tích nha?", k[0]);
  ok("FR250 câu hỏi về khu vực giữ", boKhenViTri(["Khu vực này đẹp không anh?"])[0] === "Khu vực này đẹp không anh?");
  ok("FR250 bong bóng chỉ có khen vị trí → bỏ", JSON.stringify(boKhenViTri(["Vị trí rất đẹp ạ.", "Cho em xin giá nha?"])) === JSON.stringify(["Cho em xin giá nha?"]));
}

// 01/10/2026 (bắn thử chế độ `ai`, lx-ai-06): chủ gõ "hẻm 3m", "50m2" — bot "Trệt lửng 2 lầu 3 phòng ngủ thì khách gia đình chuộng lắm".
{
  const bc = "a muốn bán căn nhà ở bình thạnh đường Xô Viết Nghệ Tĩnh hẻm 3m 50m2";
  const r = boKhenKhongCanCu(["Trệt lửng 2 lầu 3 phòng ngủ thì khách gia đình chuộng lắm anh. Anh muốn thu về tầm bao nhiêu ạ?"], bc);
  ok("KC-01 'Trệt lửng 2 lầu 3 phòng ngủ' khi chủ chỉ nói 'hẻm 3m' → bỏ câu bịa, giữ câu hỏi giá",
    r.length === 1 && !/lửng|phòng ngủ/.test(r[0]) && /bao nhiêu/.test(r[0]), JSON.stringify(r));
  ok("KC-02 '3 phòng ngủ' khi chủ nói '3 phòng ngủ' → giữ", laSoDoBia("3 phòng ngủ thì gia đình ở thoải mái", "nhà 3 phòng ngủ 2wc") === false);
  ok("KC-03 '3 phòng ngủ' khi chủ chỉ nói 'hẻm 3m' → bịa", laSoDoBia("3 phòng ngủ thì gia đình ở thoải mái", "hẻm 3m") === true);
  const r2 = boKhenKhongCanCu(["Trệt 2 lầu thì vừa đẹp ạ."], "nhà 1 trệt 2 lầu hẻm 4m");
  ok("KC-04 'Trệt 2 lầu' khi chủ nói '1 trệt 2 lầu' → giữ", r2.length === 1 && /2 lầu/.test(r2[0]), JSON.stringify(r2));
  const r3 = boKhenKhongCanCu(["Nhà mình có lửng không anh?"], "hẻm 3m");
  ok("KC-05 câu HỎI 'có lửng không' → giữ", r3.length === 1, JSON.stringify(r3));
}

// GOI-01…05 (02/10/2026, bắn thật thu-trl-04: khách mua xưng "mình", bot "Dạ được chị ơi"): chưa biết anh hay chị thì
// không gọi theo giới — dạng "anh ơi / chị ơi" (mới), cuối câu, đầu câu; "anh chị" đủ cặp và "anh Thu" giữ.
ok("GOI-01 'Dạ được chị ơi :)' → 'anh chị ơi' (05/10: không còn 'mình')", boGoiDoanGioi("Dạ được chị ơi :) Hiện bên em chưa có căn nào.") === "Dạ được anh chị ơi :) Hiện bên em chưa có căn nào.", boGoiDoanGioi("Dạ được chị ơi :) Hiện bên em chưa có căn nào."));
ok("GOI-02 'Anh ơi em gửi' (cách nói mới, đầu câu) → 'Anh chị ơi'", boGoiDoanGioi("Anh ơi em gửi căn này nha") === "Anh chị ơi em gửi căn này nha", boGoiDoanGioi("Anh ơi em gửi căn này nha"));
ok("GOI-03 cuối câu '…vậy anh?' → '…vậy ạ?'", boGoiCuoiVaOi("Mình cần mấy phòng vậy anh?") === "Mình cần mấy phòng vậy ạ?", boGoiCuoiVaOi("Mình cần mấy phòng vậy anh?"));
ok("GOI-04 'anh chị ơi' / 'anh chị phụ trách' / 'anh Thu' giữ nguyên",
  boGoiDoanGioi("Anh chị ơi, em gửi nha.") === "Anh chị ơi, em gửi nha." && boGoiDoanGioi("Có anh chị phụ trách bên em gọi lại ạ.") === "Có anh chị phụ trách bên em gọi lại ạ." && boGoiDoanGioi("Dạ anh Thu sẽ gọi lại.") === "Dạ anh Thu sẽ gọi lại.");
ok("GOI-05 đầu câu 'Anh cần…' → 'Anh chị cần…'", boGoiDoanGioi("Anh cần mấy phòng ngủ ạ?") === "Anh chị cần mấy phòng ngủ ạ?", boGoiDoanGioi("Anh cần mấy phòng ngủ ạ?"));

ok("GOI-06 'Dạ được anh, để em lọc' → 'anh chị,'; 'anh, chị cần gì' (cặp) giữ",
  boGoiCuoiVaOi("Dạ được anh, để em lọc căn khớp nha.") === "Dạ được anh chị, để em lọc căn khớp nha." && boGoiCuoiVaOi("Dạ anh, chị cần gì thêm ạ") === "Dạ anh, chị cần gì thêm ạ",
  boGoiCuoiVaOi("Dạ được anh, để em lọc căn khớp nha.") + " | " + boGoiCuoiVaOi("Dạ anh, chị cần gì thêm ạ"));

// SRS-5.1zi (bắn thử câu đơn giản 02/10): lời bot nói về "hệ thống"; câu khen mở đầu trỏ ngược không có gì để trỏ.
{
  const a = boCauNoiHeThong(["Dạ phí bên em chỉ thu khi giao dịch thành công là 1% giá chốt ạ.", "Phí thì hệ thống đã gửi cho mình rồi nha.\nMình cần ra hàng sớm hay được giá thì bán vậy anh chị?"]);
  ok("HT-01 'Phí thì hệ thống đã gửi cho mình rồi nha' → bỏ, câu hỏi kế giữ", a.length === 2 && a[1] === "Mình cần ra hàng sớm hay được giá thì bán vậy anh chị?", JSON.stringify(a));
  const b = ["Xưởng có hệ thống xử lý nước thải chưa anh?"];
  ok("HT-02 câu HỎI có 'hệ thống xử lý nước thải' → giữ nguyên", boCauNoiHeThong(b) === b);
  const c = boCauNoiHeThong(["Dạ cái này he thong tu ghi nhan roi a. Nhà mình mấy tầng anh?"]);
  ok("HT-03 không dấu 'he thong tu ghi nhan' (cách nói mới) → bỏ", c[0] === "Nhà mình mấy tầng anh?", JSON.stringify(c));
  const d = boCauTroNguocDauBong(["Khách hay chú ý điểm này lắm :).\nNhà mình ở phường mấy vậy ạ?"]);
  ok("TN-01 'Khách hay chú ý điểm này lắm :)' mở đầu bong bóng → bỏ, câu hỏi giữ", d[0] === "Nhà mình ở phường mấy vậy ạ?", JSON.stringify(d));
  const e = ["Hẻm 6m xe tải vào được, khách hay chú ý điểm này lắm. Nhà mình phường mấy ạ?"];
  ok("TN-02 'điểm này' có chỗ trỏ trong CÙNG câu → giữ", boCauTroNguocDauBong(e) === e);
  const f = boCauTroNguocDauBong(["Cái này nhiều người hỏi lắm á. Anh cho em xin số tầng nha?"]);
  ok("TN-03 cách nói mới 'Cái này nhiều người hỏi lắm á' mở đầu → bỏ", f[0] === "Anh cho em xin số tầng nha?", JSON.stringify(f));
}

// SRS-5.1zj: "Tin đã lên rồi nha" khi tin chưa lên kệ (chủ ngữ "tin" đứng trước).
{
  const a = boHuaDaDang(["Chào mình! Tin đã lên rồi nha. Em tra thấy đường Lê Văn Sỹ thuộc Phường Nhiêu Lộc, đúng không anh chị?"]);
  ok("DD-01 'Tin đã lên rồi nha' → bỏ, câu hỏi giữ", !/Tin đã lên/.test(a[0]) && /Nhiêu Lộc/.test(a[0]), JSON.stringify(a));
  const b = boHuaDaDang(["Dạ tin nhà mình vừa đăng rồi đó anh. Nhà mình mấy tầng ạ?"]);
  ok("DD-02 cách nói mới 'tin nhà mình vừa đăng rồi' → bỏ", !/vừa đăng/.test(b[0]), JSON.stringify(b));
  const c = ["Tin mình chưa lên kệ vì còn thiếu giá ạ."];
  ok("DD-03 'tin … chưa lên kệ' (nói thật) → giữ", boHuaDaDang(c)[0] === c[0]);
}

// SRS-5.1zm (03/10, chủ dự án: "tiêu chí là 1 câu, ngoại lệ … 2 3 vấn đề gần nhau 1 lần"): cả lượt chỉ một bong bóng hỏi.
{
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const r1 = motCauHoiLuot(["🤖 Bóc tách được: giá 8 tỷ", "Dạ phí bên em 1% giá chốt ạ. Anh còn thắc mắc gì không ạ?", "Nhà mình mấy tầng ạ?"]);
  ok("MCL-01 bong bóng trả lời có câu hỏi + bong bóng câu kế → bỏ câu hỏi ở bong bóng trước", eq(r1, ["🤖 Bóc tách được: giá 8 tỷ", "Dạ phí bên em 1% giá chốt ạ.", "Nhà mình mấy tầng ạ?"]), JSON.stringify(r1));
  const r2 = motCauHoiLuot(["Anh còn cần gì thêm không ạ?", "Nhà mình mấy tầng, mấy phòng vậy ạ?"]);
  ok("MCL-02 bong bóng chỉ có câu hỏi phía trước → bỏ cả bong bóng; câu gộp 2 ý gần nhau giữ", eq(r2, ["Nhà mình mấy tầng, mấy phòng vậy ạ?"]), JSON.stringify(r2));
  const dg = "Anh thấy em nói chuyện có giống người thật không, có làm mất thời gian anh không ạ?\nNếu chấm cách em chăm sóc thì anh cho em mấy điểm trên 10 ạ?";
  ok("MCL-03 một bong bóng mẫu đánh giá (2 ý gần nhau) → giữ nguyên", eq(motCauHoiLuot(["Dạ em ghi nhận nhà đã bán rồi ạ.", dg]), ["Dạ em ghi nhận nhà đã bán rồi ạ.", dg]));
  const r4 = motCauHoiLuot(["Dạ em ghi rồi ạ, anh muốn em đăng luôn không?\nCó gì anh nhắn em nha.", "Phường mấy vậy anh?"]);
  ok("MCL-04 (cách nói mới) câu hỏi lẫn trong bong bóng nhiều dòng → chỉ bỏ câu hỏi, giữ dòng còn lại", eq(r4, ["Có gì anh nhắn em nha.", "Phường mấy vậy anh?"]), JSON.stringify(r4));
  ok("MCL-05 không có câu hỏi → giữ nguyên", eq(motCauHoiLuot(["Dạ em ghi rồi ạ.", "📝 Em ghi nhận: giá 8 tỷ"]), ["Dạ em ghi rồi ạ.", "📝 Em ghi nhận: giá 8 tỷ"]));
  const cr = (await import("node:fs")).readFileSync(new URL("../supabase/functions/chat-reply/index.ts", import.meta.url), "utf8");
  const than = cr.slice(cr.indexOf("const traLoiSeller = async"), cr.indexOf("const traLoiSeller = async") + 20000);
  ok("MCL-06 traLoiSeller (đường ra duy nhất phía bán) áp motCauHoiLuot", /sach = motCauHoiLuot\(sach\)/.test(than));
}

// SRS-5.1zn (bắn thử thu-mc-06): hứa "em đăng liền" khi tin chưa lên kệ → bỏ; câu có điều kiện giữ.
{
  const a = boHuaDaDang(["Mặt tiền Hùng Vương quận 5 thì khách hỏi nhiều lắm, em đăng liền nha :) Nhà mình phường mấy vậy anh chị?"])[0];
  ok("DD-07 '…em đăng liền nha :)' → bỏ lời hứa, giữ phần còn lại + câu hỏi", !/đăng liền/.test(a) && /khách hỏi nhiều lắm/.test(a) && /phường mấy/.test(a), a);
  const b = "Anh chị nhắn em mấy thông tin đó là em đăng liền ạ.";
  ok("DD-08 câu có điều kiện '…là em đăng liền ạ' → giữ", boHuaDaDang([b])[0] === b, boHuaDaDang([b])[0]);
  const c = boHuaDaDang(["Dạ em ghi rồi ạ. Em up tin ngay cho anh nhé."])[0];
  ok("DD-09 (cách nói mới) 'Em up tin ngay cho anh nhé' → bỏ", !/up tin/.test(c) && /em ghi rồi/i.test(c), c);
}

// 05/10/2026 (SRS-5.1zy, tin rao dán nguyên 02/10 & 04/10, AI chết → luật đỡ): tin dạng DANH SÁCH "Nhãn: giá trị".
{
  const RAO = "BÁN NHÀ PHỐ 6 TẦNG CÓ THANG MÁY – TRƯƠNG ĐÌNH HỘI, P. PHÚ ĐỊNH\nGiá: 6,95 tỷ (giảm nhẹ cho khách thiện chí)\nNhà phố biệt lập trong khu dân cư an ninh, yên tĩnh.\nThông tin nhà:\n•\tDiện tích đất: 4m x 11m\n•\tTổng diện tích sàn: 245m²\n•\tKết cấu: 6 tầng, có thang máy\n•\t3 phòng ngủ, 4 WC\n•\tHướng Tây\n•\tĐường trước nhà rộng 7m\nPháp lý: Sổ hồng, hoàn công đầy đủ.";
  const f = nhanDienNhieuFact(RAO);
  const lay = (q) => f.find((x) => x.question === q)?.answer ?? null;
  ok("DS-01 'Giá: 6,95 tỷ' → giá 6,95 tỷ, KHÔNG '95 tỷ' (dấu phẩy thập phân không phải ranh mảnh)", lay("gia") === "6,95 tỷ", lay("gia"));
  ok("DS-02 'Tổng diện tích sàn: 245m²' → dien_tich_san 245m2", lay("dien_tich_san") === "245m2", lay("dien_tich_san"));
  ok("DS-03 'Diện tích đất: 4m x 11m' → dien_tich 4x11", lay("dien_tich") === "4x11", lay("dien_tich"));
  ok("DS-04 mảnh '4 WC' không thành vị trí", lay("vi_tri") === null && lay("so_wc") === "4", JSON.stringify([lay("vi_tri"), lay("so_wc")]));
  ok("DS-05 'Kết cấu: 6 tầng' → kết cấu không mang nhãn", !/^kết cấu/i.test(lay("ket_cau") ?? "") && /6 tầng/.test(lay("ket_cau") ?? ""), lay("ket_cau"));
  // cách nói MỚI chưa bắn
  const g = (t, q) => nhanDienNhieuFact(t).find((x) => x.question === q)?.answer ?? null;
  ok("DS-06 (mới) 'DTSD: 180m2' → sàn 180m2", g("Nhà 3 lầu.\nDTSD: 180m2\nGiá: 5,5 tỷ", "dien_tich_san") === "180m2");
  ok("DS-07 (mới) 'Diện tích sử dụng: 300 m2' → sàn, không thành diện tích đất", g("Diện tích sử dụng: 300 m2, sổ riêng", "dien_tich_san") === "300m2" && g("Diện tích sử dụng: 300 m2, sổ riêng", "dien_tich") === null);
  ok("DS-08 (mới) 'Đất: 5 x 20m' → dien_tich 5x20", g("Đất: 5 x 20m\nGiá: 3,2 tỷ, có bớt lộc", "dien_tich") === "5x20");
  ok("DS-09 (mới) 'Giá: 3,2 tỷ, có bớt lộc' → giá 3,2 tỷ", g("Đất: 5 x 20m\nGiá: 3,2 tỷ, có bớt lộc", "gia") === "3,2 tỷ");
  ok("DS-10 '4x15, 7 tỷ 2' vẫn tách mảnh ở dấu phẩy có khoảng trắng", g("bán nhà hẻm 5m Trần Bình Trọng, 4x15, 7 tỷ 2", "gia") === "7 tỷ 2");
  ok("DS-11 '3PN,2WC' tách mảnh ở dấu phẩy giữa chữ", g("3PN,2WC, sổ riêng", "phap_ly") !== null);
}

// 05/10/2026 (SRS-5.1zzb, test Zalo 17:30): đáp câu lửng kèm tiểu từ / cách gọi — "có em ơi" từng = không trả lời.
for (const [vao, mong] of [["có em ơi", "co"], ["có nha em", "co"], ["dạ có anh ơi", "co"], ["có á", "co"], ["ko có đâu em", "khong"], ["không có lửng nha", "khong"],
  ["ừ", "co"], ["có sân thượng nữa em", null], ["có lửng riêng nữa em", "them"]])
  ok(`LUNG-TU '${vao}' → ${mong}`, docTraLoiLung(vao) === mong, String(docTraLoiLung(vao)));

// SRS-5.1zzzzq (bắn production 09/10): lời chào đầu tin cắt khỏi chữ gửi AI bóc tách ("chào em, chị muốn bán lô đất" → AI rỗng 4/4 lần).
{
  const { boLoiChaoDau } = await import("../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts");
  for (const [vao, mong] of [
    ["chào em, chị muốn bán lô đất", "chị muốn bán lô đất"], // ca gốc
    ["Chào anh ơi, em có căn nhà cần bán", "em có căn nhà cần bán"], // cách nói MỚI
    ["Chao em ban nha hem 5m", "ban nha hem 5m"], // không dấu
    ["hello, bán nhà q5", "bán nhà q5"],
    ["chào em", "chào em"], // chỉ có lời chào → giữ
    ["chào giá 5 tỷ nha em", "chào giá 5 tỷ nha em"], // "chào giá" = báo giá, không phải lời chào
    ["chị muốn bán lô đất", "chị muốn bán lô đất"],
  ]) ok(`CHAO-${vao}`, boLoiChaoDau(vao) === mong, boLoiChaoDau(vao));
}

// SRS-5.1zzzzp (bắn production 09/10): AI soát nhận xét đã chạy xong → danh sách từ khoá không cắt lời nữa, chỉ còn so số đo / kết cấu.
{
  const anh = "Vâng ạ. Anh chụp giúp em vài tấm mặt tiền, sổ và hẻm được không ạ?";
  ok("NX-01 ca gốc: AI đã soát → giữ nguyên câu xin ảnh", boMenhDeKhenSai([anh], "ban nha hem 5m duong le van sy", true)[0] === anh, boMenhDeKhenSai([anh], "ban nha hem 5m duong le van sy", true)[0]);
  ok("NX-02 AI hỏng → lưới từ khoá vẫn chạy như cũ", boMenhDeKhenSai(["Hẻm xe hơi 5m, khách chuộng lắm. Mình cần bán gấp không ạ?"], "bán nhà hẻm 3m đường Lê Văn Việt")[0] !== "Hẻm xe hơi 5m, khách chuộng lắm. Mình cần bán gấp không ạ?");
  ok("NX-03 (mới) AI đã soát: 'gửi em ảnh mặt tiền với ảnh sổ nha' giữ", boKhenKhongCanCu(["Dạ anh gửi em ảnh mặt tiền với ảnh sổ nha."], "bán nhà hẻm 4m", true)[0] === "Dạ anh gửi em ảnh mặt tiền với ảnh sổ nha.");
  const r4 = boMenhDeKhenSai(["Anh nói nở hậu 4.5 nhỉ, em ghi rồi. Giá anh định rao bao nhiêu ạ?"], "no hau nhe", true)[0] ?? "";
  ok("NX-04 AI đã soát vẫn bỏ số đo bịa 'nở hậu 4.5'", !/4\.5/.test(r4) && /Giá anh định rao/.test(r4), r4);
  ok("NX-05 AI đã soát vẫn bỏ kết cấu bịa 'trệt lửng 2 lầu'", !/lửng/.test(boKhenKhongCanCu(["Trệt lửng 2 lầu thì ở rộng rãi."], "hẻm 3m", true)[0] ?? ""));
  // laLoiMeta: dấu hiệu hình thức (xưng "tôi", in đậm markdown)
  ok("NX-06 ca gốc 'Tôi hiểu rõ: - **Không ghi nhận lại** …' là lời đọc câu lệnh", laLoiMeta("Tôi hiểu rõ:\n\n- **Không ghi nhận lại** điều chủ nhà chỉ hỏi\n\nTôi sẵn sàng viết tin theo cách này."));
  ok("NX-07 (mới) 'Tôi sẽ viết một tin ngắn…' là lời đọc câu lệnh", laLoiMeta("Được rồi. Tôi sẽ viết một tin ngắn gọn theo yêu cầu."));
  ok("NX-08 lời thường có 'tối nay' không bị coi là meta", !laLoiMeta("Dạ tối nay anh rảnh thì gửi em ảnh sổ nha."));
  ok("NX-09 lời thường có '•' / gạch đầu dòng không in đậm vẫn không meta", !laLoiMeta("Dạ em ghi rồi ạ. Nhà mình hẻm rộng mấy mét vậy anh?"));
}

// SRS-5.1zzzzu (bắn production 10/10): câu mảnh sau khi bỏ câu trước; "lên sàn / đã được kiểm duyệt" là khẳng định trạng thái; markdown
// và dòng dẫn công cụ trong lời trợ lý.
{
  const loi = "Dạ em lọc rồi, hiện bên em chưa có căn nào khớp hẻm xe hơi ạ. Nhưng em sẽ theo sát, khi có căn khớp em báo anh ngay nhé.";
  const sau = boCauNhanXetU(loi, ["Dạ em lọc rồi, hiện bên em chưa có căn nào khớp hẻm xe hơi ạ"]);
  ok("ZZZZU-V1 bỏ câu đầu → câu sau không mở bằng 'Nhưng' trơ trọi", sau === "Em sẽ theo sát, khi có căn khớp em báo anh ngay nhé.", String(sau));
  ok("ZZZZU-V2 goTuNoiDau: 'Tuy nhiên, …' / 'Mà …' gọt; câu không mở bằng từ nối giữ nguyên",
    goTuNoiDau("Tuy nhiên, em vẫn ghi lại ạ.") === "Em vẫn ghi lại ạ." && goTuNoiDau("Mà anh cần mấy phòng ạ?") === "Anh cần mấy phòng ạ?" &&
      goTuNoiDau("Nhưng") === "Nhưng" && goTuNoiDau("Nhà mình ở đâu ạ?") === "Nhà mình ở đâu ạ?");
  ok("ZZZZU-V3 câu KHÔNG bị bỏ phía trước → giữ nguyên 'Nhưng …'",
    boCauNhanXetU("Dạ chưa có căn ạ. Nhưng em sẽ báo anh.", ["không có trong lời"]) === "Dạ chưa có căn ạ. Nhưng em sẽ báo anh.");
  ok("ZZZZU-V4 'tin chị lên sàn em đã được kiểm duyệt kỹ lắm' là khẳng định trạng thái (lưới trạng thái thật bắt được)",
    coMenhDeDaDang(["Vâng ạ, có sổ đầy đủ và tin chị lên sàn em đã được kiểm duyệt kỹ lắm."]));
  ok("ZZZZU-V5 (cách nói MỚI) 'tin anh vừa duyệt xong' bắt; 'tin sẽ được duyệt trước khi lên sàn' (hứa có điều kiện) và câu hỏi KHÔNG bắt",
    coMenhDeDaDang(["Dạ tin anh vừa duyệt xong rồi ạ."]) && !coMenhDeDaDang(["Dạ tin sẽ được kiểm duyệt trước khi lên ạ."]) && !coMenhDeDaDang(["Tin mình lên sàn chưa anh?"]));
  const bb = thanhBongBong("Dạ em ghi rồi ạ, có căn khớp em báo anh liền nhé.\n\n---\n**CẬP NHẬT HỒ SƠ:**");
  ok("ZZZZU-V6 thanhBongBong: '---' + '**CẬP NHẬT HỒ SƠ:**' (dòng dẫn công cụ) bỏ, lời thật giữ", bb.length === 1 && /em ghi rồi/.test(bb[0]), JSON.stringify(bb));
  const bb2 = thanhBongBong("Dạ có **2 căn** khớp ạ:\n1. Căn A\n2. Căn B");
  {
    const loiT = "hiện bên em chưa có căn nào khớp đúng nhu cầu này ạ. Có căn mới hợp là em báo anh liền nha.";
    const c8 = chanHuaCoHang(["Dạ em lọc trong kho rồi ạ. Hiện bên em chưa có căn nào khớp tiêu chí 3 phòng ngủ ở Quận 5, nhưng em sẽ để ý báo anh nha."], loiT, true, []);
    ok("ZZZZU-V8 (thu-cmp46-4) câu 'em lọc rồi' bị chặn → câu nói thật 'chưa có căn nào khớp' sau nó GIỮ, không trả rỗng",
      c8.replies.length === 1 && /chưa có căn nào khớp tiêu chí/.test(c8.replies[0]), JSON.stringify(c8));
    const c9 = chanHuaCoHang(["Dạ em đang lọc căn 2 lầu cho anh. Còn mấy căn khác nữa."], loiT, true, ["Dạ em đang lọc căn 2 lầu cho anh"]);
    ok("ZZZZU-V9 (cách nói MỚI, AI chỉ ra câu hứa) không có câu nói thật → chèn lời thật, không bao giờ rỗng", c9.replies.length >= 1 && /chưa có căn nào khớp/.test(c9.replies.join(" ")), JSON.stringify(c9));
  }
  ok("ZZZZU-V7 thanhBongBong: đậm bỏ dấu sao; đoạn có ':' mà CÓ nội dung sau nó giữ", bb2.length === 1 && /có 2 căn khớp ạ:\n1\. Căn A/.test(bb2[0]), JSON.stringify(bb2));
}

// SRS-5.1zzzzy: xin bỏ ý ở dòng "Thêm" — chỉ bỏ MẢNH có thật trong ghi chú đang lưu (các ý nối " · ").
{
  const { boYGhiChu } = await import("../supabase/functions/_shared/extraction/van-tra-loi.ts");
  const dong = [
    { id: "a", answer: "con chị đi nước ngoài · ở không hết" },
    { id: "b", answer: "con chị bây giờ ở Úc" },
    { id: "c", answer: "sẽ tăng giá lắm" },
    { id: "d", answer: "cần tiền để đầu tư thêm" },
  ];
  const r1 = boYGhiChu(dong, ["con chị ở Úc", "sẽ tăng giá"]);
  ok("ZZZZY-V1 (ca gốc) 'con chị ở Úc' + 'sẽ tăng giá' → xoá dòng b, c; dòng a, d không đụng",
    r1.daBo.length === 2 && r1.doi.length === 2 && r1.doi.every((d) => d.answer === null) && r1.doi.map((d) => d.id).sort().join() === "b,c", JSON.stringify(r1));
  const r2 = boYGhiChu(dong, ["ở không hết"]);
  ok("ZZZZY-V2 (cách nói mới) bỏ một mảnh trong dòng gộp → dòng a còn 'con chị đi nước ngoài'",
    r2.doi.length === 1 && r2.doi[0].id === "a" && r2.doi[0].answer === "con chị đi nước ngoài", JSON.stringify(r2));
  const r3 = boYGhiChu(dong, ["view sông"]);
  ok("ZZZZY-V3 đối chứng: ý không có trong ghi chú → không đổi gì (rơi về câu hỏi lại)", r3.doi.length === 0 && r3.daBo.length === 0, JSON.stringify(r3));
}
// SRS-5.1zzzzy (MQ1): câu đáp lửng dài — phần nói lửng / số tầng đã trả lời câu lửng; chỉ phần khác đi tiếp luồng thường.
{
  const { phanNgoaiCauLung } = await import("../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts");
  ok("ZZZZY-V5 (ca gốc) 'không có gác lửng ạ, 4 tầng đầy đủ thôi' → không còn phần nào", phanNgoaiCauLung("không có gác lửng ạ, 4 tầng đầy đủ thôi") === "", phanNgoaiCauLung("không có gác lửng ạ, 4 tầng đầy đủ thôi"));
  const v6 = phanNgoaiCauLung("ko có lửng đâu em, mà nhà ở phường 5 nha");
  ok("ZZZZY-V6 (cách nói mới) 'ko có lửng đâu em, mà nhà ở phường 5 nha' → còn đúng vế phường", /phường 5/.test(v6) && !/lửng/.test(v6), v6);
}
// SRS-5.1zzzzy: câu duyệt có câu mẫu riêng — không còn khuôn "cho em xin thêm chủ nhà duyệt bản nháp tin".
{
  const { cauHoiMau } = await import("../supabase/functions/_shared/prompts.ts");
  const c = cauHoiMau("duyet_tin", "anh chị");
  ok("ZZZZY-V4 (ca gốc) cauHoiMau('duyet_tin') → nhắc 'ok', không 'cho em xin thêm'", /nhắn "ok"/.test(c) && !/cho em xin thêm/.test(c), c);
}
// SRS-5.1zzzzzb: câu hỏi gợi ý giá trị không nguồn bị bỏ cả câu; câu hỏi mở và câu hỏi gợi ý có nguồn giữ.
{
  const { cauHoiGoiYKhongNguon, boCauHoiGoiY } = await import("../supabase/functions/_shared/extraction/van-tra-loi.ts");
  const loi = "Vâng ạ. Hẻm Quang Trung bác nhớ gần chỗ nào không bác? Vậy nhà bác ở phường Thạnh Lộc đúng không bác?";
  const bo = cauHoiGoiYKhongNguon([{ cau: "Vậy nhà bác ở phường Thạnh Lộc đúng không bác?", can_cu: null, goi_y: true }, { cau: "Hẻm Quang Trung bác nhớ gần chỗ nào không bác?", can_cu: null, goi_y: false }], "hẻm quang trung");
  const r = boCauHoiGoiY(loi, bo);
  ok("ZZZZZB-V1 (ca gốc) câu hỏi gợi ý 'ở phường Thạnh Lộc đúng không' không nguồn → bỏ cả câu; câu hỏi mở giữ", bo.length === 1 && !/Thạnh Lộc/.test(r ?? "") && /gần chỗ nào/.test(r ?? ""), JSON.stringify({ bo, r }));
  const bo2 = cauHoiGoiYKhongNguon([{ cau: "Nhà anh ở Phường Gò Vấp đúng không anh?", can_cu: "Phường Gò Vấp", goi_y: true }], "bảng tên đường: đường Quang Trung ở Quận Gò Vấp thuộc Phường Gò Vấp.");
  ok("ZZZZZB-V2 đối chứng câu hỏi gợi ý có căn cứ trong DỮ LIỆU TRA → giữ", bo2.length === 0, JSON.stringify(bo2));
  const bo3 = cauHoiGoiYKhongNguon([{ cau: "Giá mình 5 tỷ phải không chị?", can_cu: "5 tỷ", goi_y: true }], "chị bán nhà hẻm 4m");
  ok("ZZZZZB-V3 (cách nói mới) 'giá mình 5 tỷ phải không' — căn cứ AI đưa không có trong nguồn → bỏ", bo3.length === 1, JSON.stringify(bo3));
}
// SRS-5.1zzzzzc: câu phí soạn sẵn không nói lại nguyên câu; hỏi thuế / chi phí ngoài là chủ đề riêng; soát bỏ lời gắn lợi ích và lời hứa bot không làm được.
{
  const { nhanXetKhongCanCu } = await import("../supabase/functions/_shared/extraction/van-tra-loi.ts");
  const phi1 = "phí bên em chỉ thu khi giao dịch thành công là 1% giá chốt";
  const a = dapHoiNguocTienDinh("ngoài 1% đó còn mất thuế hay phí gì không", "chị", phi1, "thue_phi");
  ok("ZZZZZC-V1 (ca gốc) hỏi thuế / chi phí ngoài phí bên em → nói phí bên em là khoản duy nhất + thuế theo quy định nhà nước, không nói ai chịu",
    /không thu thêm/.test(a ?? "") && /quy định nhà nước/.test(a ?? "") && !/người (?:mua|bán) chịu|chịu thuế/.test(a ?? ""), String(a));
  const a2 = dapHoiNguocTienDinh("vậy phí sang tên ai trả em", "chị", phi1, "thue_phi", `Dạ ngoài ${phi1} thì bên em không thu thêm khoản nào ạ. Thuế, phí sang tên là theo quy định nhà nước…`);
  ok("ZZZZZC-V2 (cách nói mới) hỏi lại thuế lần hai → không lặp nguyên câu cũ", !!a2 && !/không tư vấn con số/.test(a2), String(a2));
  const b = dapHoiNguocTienDinh("vậy em lấy bao nhiêu phí", "chị", phi1, "phi", `Dạ ${phi1} ạ.`);
  // SRS-5.1zzzzze: con số đã nói → khách đang hỏi điều KHÁC về phí (ai trả, khi nào, còn gì) → không ghép câu soạn sẵn, model trả lời.
  ok("ZZZZZE-V3 (ca gốc lần bảy) câu phí có số đã nói → không câu soạn sẵn (model trả lời theo luật phí)", b === null, String(b));
  const b3 = dapHoiNguocTienDinh("phí 1% kia thì lấy từ bên bán hay bên mua vậy em", "chị", phi1, "phi", `Dạ ${phi1} ạ.`);
  ok("ZZZZZE-V3b (ca gốc lần bảy) 'lấy từ bên bán hay bên mua' → không trả 'chỉ có đúng khoản phí đó'", b3 === null, String(b3));
  const phi0 = "phí bên em chỉ thu khi giao dịch thành công, mức tuỳ chính chủ hay môi giới";
  const b2 = dapHoiNguocTienDinh("phí sao em", "chị", phi0, "phi", `Dạ ${phi0} ạ.`);
  ok("ZZZZZC-V4 đối chứng: câu phí CHƯA có số (vai chưa rõ) → vẫn nói để nơi gọi nối câu hỏi vai", b2 === `Dạ ${phi0} ạ.`, String(b2));
  const bo = nhanXetKhongCanCu([
    { cau: "Dạ sổ riêng, giấy tờ gọn lắm anh chị.", can_cu: "sổ riêng", kieu: "loi_ich", danh_gia_thi_truong: false },
    { cau: "Dạ vâng, anh cứ bận, tối em gọi lại nha.", can_cu: null, kieu: "nhac_lai", hua_khong_lam: true, danh_gia_thi_truong: false },
    { cau: "Dạ sổ riêng ạ.", can_cu: "sổ riêng", kieu: "nhac_lai", danh_gia_thi_truong: false },
  ], "shr bạn, mình có sổ riêng");
  ok("ZZZZZC-V5 (ca gốc) soát: 'giấy tờ gọn lắm' (gắn lợi ích) và 'tối em gọi lại' (hứa việc không làm được) bị bỏ; câu nhắc lại giữ",
    bo.length === 2 && !bo.includes("Dạ sổ riêng ạ."), JSON.stringify(bo));
}
// SRS-5.1zzzzzf: câu "em ghi X rồi" (ghi_nhan) chỉ đứng khi X có trong sổ ghi LƯỢT NÀY — lời chủ nhà có X không đủ.
{
  const { nhanXetKhongCanCu: nx } = await import("../supabase/functions/_shared/extraction/van-tra-loi.ts");
  const ds = [{ cau: "Vâng ạ, 4x16 cháu ghi rồi bác ơi.", can_cu: "16 mét", ghi_nhan: true }, { cau: "Dạ hẻm 4m cháu ghi rồi.", can_cu: "4m", ghi_nhan: true }];
  const bo = nx(ds, "hẻm bác chừng 4 mét rộng, chiều sâu thì 16 mét", "độ rộng hẻm trước nhà: 4m\nkết cấu: trệt lầu");
  ok("ZZZZZF-V1 (ca gốc lần bảy) «4x16 cháu ghi rồi», căn cứ chỉ ở lời chủ nhà → bỏ; «hẻm 4m cháu ghi rồi», 4m trong sổ ghi lượt → giữ",
    bo.length === 1 && bo[0].startsWith("Vâng ạ, 4x16"), JSON.stringify(bo));
  const bo2 = nx(ds, "hẻm bác chừng 4 mét rộng, chiều sâu thì 16 mét");
  ok("ZZZZZF-V2 không truyền sổ ghi lượt (lượt soát người mua) → đi đường căn cứ thường: '16 mét' có trong lời → giữ, '4m' không → bỏ",
    bo2.length === 1 && bo2[0].startsWith("Dạ hẻm 4m"), JSON.stringify(bo2));
}
// SRS-5.1zzzzzy (Zalo thật 13/10/2026 16:12: bot "Căn Trương Đình Hối này…"): tên riêng lệch DẤU so với tên đã biết → thay đúng tên.
{
  const { suaTenRiengLechDau: sua } = await import("../supabase/functions/_shared/extraction/van-tra-loi.ts");
  const biet = ["Trương Đình Hội", "Phường Phú Định", null, "Lê Lợi"];
  const a = sua(["Căn Trương Đình Hối này chị muốn bán giá bao nhiêu ạ?"], biet);
  ok("ZZZZZY-V1 (ca gốc) 'Trương Đình Hối' → 'Trương Đình Hội'", a[0] === "Căn Trương Đình Hội này chị muốn bán giá bao nhiêu ạ?", a[0]);
  const b = sua(["Dạ nhà ở phường Phú Dinh, đường Truơng Đinh Hội đúng không anh?"], biet);
  ok("ZZZZZY-V1b (cách nói mới) hai tên lệch dấu trong một câu, có dấu phẩy sau tên → sửa cả hai, giữ dấu phẩy",
    b[0] === "Dạ nhà ở phường Phú Định, đường Trương Đình Hội đúng không anh?", b[0]);
  const c = sua(["Dạ nhà ở phường Phú Định, đường Trương Đình Hội ạ.", "🤖 Hiểu: Trương Đình Hối", "Dạ đường lê lợi ạ."], biet);
  ok("ZZZZZY-V1c (đối chứng) đúng tên → giữ; bong bóng 🤖 không đụng; chỉ khác hoa / thường → giữ",
    c[0] === "Dạ nhà ở phường Phú Định, đường Trương Đình Hội ạ." && c[1] === "🤖 Hiểu: Trương Đình Hối" && c[2] === "Dạ đường lê lợi ạ.", JSON.stringify(c));
  ok("ZZZZZY-V1d không có tên đã biết → trả nguyên mảng", sua(["Căn Trương Đình Hối"], [null, "Lê"]).length === 1 && sua(["Căn Trương Đình Hối"], [])[0] === "Căn Trương Đình Hối");
  ok("ZZZZZY-V1e tên khác chữ (không chỉ lệch dấu: 'Trương Định') → không đụng", sua(["Căn Trương Định này"], biet)[0] === "Căn Trương Định này");
}
// SRS-5.1zzzzzzz (giảm độ trễ): lời không có gì để soát → bỏ lượt AI soát; có số / tên riêng / khẳng định / gợi ý → vẫn soát.
{
  const { loiKhongCanSoat: k } = await import("../supabase/functions/_shared/extraction/van-tra-loi.ts");
  ok("SOAT-01 (ca gốc 07:58) 'Dạ vâng anh chị. Căn mình anh chị mong muốn bán giá bao nhiêu vậy ạ?' → không cần soát", k("Dạ vâng anh chị. Căn mình anh chị mong muốn bán giá bao nhiêu vậy ạ?"));
  ok("SOAT-02 'Dạ em ghi rồi ạ.\nCăn hộ mình ở tầng mấy anh chị ạ?' → không cần soát", k("Dạ em ghi rồi ạ.\nCăn hộ mình ở tầng mấy anh chị ạ?"));
  ok("SOAT-03 câu hỏi gợi ý phường (tên riêng) → PHẢI soát", !k("Dạ em ghi rồi ạ. Đường Phạm Thế Hiển đoạn căn hộ mình thuộc Phường Bình Đông hay Phường Chánh Hưng vậy anh chị?"));
  ok("SOAT-04 có số ('2,85 tỷ') → PHẢI soát", !k("Dạ giá 2,85 tỷ em ghi rồi. Giấy tờ thế nào ạ?"));
  ok("SOAT-05 có câu nhận xét → PHẢI soát", !k("Dạ vâng, căn góc thoáng lắm ạ. Giấy tờ thế nào ạ?"));
  ok("SOAT-06 hai câu hỏi → PHẢI soát", !k("Nhà mình mấy tầng ạ? Có sổ chưa ạ?"));
  ok("SOAT-07 (cách nói mới) 'Vâng ạ. Căn mình giấy tờ thế nào vậy ạ?' → không cần soát", k("Vâng ạ. Căn mình giấy tờ thế nào vậy ạ?"));
  ok("SOAT-08 không có câu hỏi → PHẢI soát (khẳng định trơn)", !k("Dạ em ghi rồi ạ."));
}
// SRS-5.1zzzzzzz16 (Zalo thật 14/10 10:30: tin ĐÃ lên kệ, bot "Tin sẽ lên kệ trong hôm nay"): câu nói tin CHƯA / SẼ lên kệ thuộc lưới trạng
// thái (đối chiếu DB) — lượt soát nguồn KHÔNG được bỏ nó vì "không căn cứ" (bỏ thì câu đúng lúc tin chưa lên kệ cũng mất).
{
  const { nhanXetKhongCanCu: nx } = await import("../supabase/functions/_shared/extraction/van-tra-loi.ts");
  const bo = nx([{ cau: "Tin sẽ lên kệ trong hôm nay", can_cu: null, noi_chua_len_ke: true, danh_gia_thi_truong: false }], "chị muốn bán căn hộ", "");
  ok("CLK-01 (ca gốc 14/10) câu 'Tin sẽ lên kệ trong hôm nay' (noi_chua_len_ke) → lượt soát nguồn không bỏ, lưới trạng thái quyết", !bo.includes("Tin sẽ lên kệ trong hôm nay"));
  const bo2 = nx([{ cau: "Em chờ duyệt xong mới đăng ạ", can_cu: null, noi_chua_len_ke: true, danh_gia_thi_truong: false }], "đăng giúp chị", "");
  ok("CLK-02 (cách nói mới) 'Em chờ duyệt xong mới đăng ạ' → không bỏ ở lượt soát nguồn", !bo2.includes("Em chờ duyệt xong mới đăng ạ"));
}
console.log(hong ? `\nVAN TRẢ LỜI: ${hong}/${tong} CA HỎNG` : `\nVAN TRẢ LỜI: ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);
