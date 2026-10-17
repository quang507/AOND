// tu-kiem.mjs — tự kiểm OFFLINE bộ chấm khách mô phỏng (cham.mjs) bằng một cuộc chat mẫu. Không mạng, không DB, không model.
//   bun bot/tests/mo-phong/tu-kiem.mjs
import { readFileSync } from "node:fs";
import { chamTatDinh, kiemTrichDanGiamKhao, dongTomTat } from "./cham.mjs";

let hong = 0, tong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };

const PERSONA = JSON.parse(readFileSync(new URL("./persona.json", import.meta.url), "utf8"));
ok("persona.json: 8 persona, mã không trùng, ai cũng có câu đầu + sự thật + lời kể, không số điện thoại",
  PERSONA.length === 8 && new Set(PERSONA.map((p) => p.ma)).size === 8 &&
    PERSONA.every((p) => p.cau_dau && p.loi_ke && Object.keys(p.su_that ?? {}).length >= 4 && `thu-mp-${p.ma}`.length <= 40) &&
    !/(?<!\d)(?:0|\+84)\d{8,10}(?!\d)/.test(JSON.stringify(PERSONA)));

const p = PERSONA.find((x) => x.ma === "cut-khong-dau");
const luot = [
  { khach: "a can ban nha", bot: ["🤖 Đã trích xuất:\n• loại: làm chuẩn \"bán\"", "Dạ nhà anh ở đâu vậy, ở Hồ Chí Minh đúng không ạ?"] },
  { khach: "hxh 3/2 q10", bot: ["Dạ em ghi rồi ạ. Nhà anh ngang dài bao nhiêu vậy anh?"] },
  { khach: "4x15", bot: [] },
  { khach: "1 tret 2 lau shr 9ty5", bot: ["**Đã ghi:** 3 tầng — sổ hồng riêng", "Dạ anh/chị cho em xin thêm ảnh nha."] },
  { khach: "ok", bot: ["📋 Em sẽ rao như vầy nhé anh:\nNhà hẻm xe hơi 3/2 Q10…", "Dạ em ghi rồi ạ. Nhà anh ngang dài bao nhiêu vậy anh?"] },
];
const tin = { deal: "ban", property_type: "nha_pho", district: "Quận 10", street: "Ba Tháng Hai", price_vnd: 9_500_000_000, frontage_m: 4, length_m: 15, floors: 3, legal_status: "sổ hồng riêng", status: "cho_thong_tin" };
const kq = chamTatDinh(p, luot, tin);
ok("ghi đúng 100% khi DB khớp bộ sự thật (giá ±2%, quận bỏ chữ 'Quận', pháp lý theo loại sổ)", kq.ty_le_ghi_dung === 1, JSON.stringify(kq.truong));
const ma = (m) => kq.loi.filter((l) => l.ma === m).map((l) => l.luot);
ok("lượt 3 bot không trả lời → khong_loi", ma("khong_loi").join() === "3", JSON.stringify(kq.loi));
ok("lượt 4: in đậm markdown, gạch dài, 'anh/chị' đều bắt", ma("markdown").join() === "4" && ma("gach_dai").join() === "4" && ma("goi_gach_cheo").join() === "4", JSON.stringify(kq.loi));
ok("lượt 5 lặp nguyên văn câu hỏi lượt 2 → lap_nguyen_van", ma("lap_nguyen_van").join() === "5", JSON.stringify(kq.loi));
ok("lượt tới bản nháp = 5 (bong bóng 📋), chưa lên kệ", kq.luot_toi_ban_nhap === 5 && kq.len_ke === false);

const sai = chamTatDinh(p, luot, { ...tin, price_vnd: 9_000_000_000, property_type: "dat", legal_status: "sổ chung" });
ok("DB lệch: giá 9 tỷ (≠ 9,5), loại đất, sổ chung → ba trường sai", sai.truong.filter((t) => !t.dat).map((t) => t.khoa).sort().join() === "gia_vnd,loai_bds,phap_ly", JSON.stringify(sai.truong));
// 11/10/2026 (lượt chạy đầu): DB lưu MÃ pháp lý và tên đường như khách gõ ("3/2") — bộ chấm từng tính sai cả hai.
const ma2 = chamTatDinh(p, luot, { ...tin, legal_status: "so_hong_rieng", street: "đường 3/2", location_raw: "đường 3/2" });
ok("pháp lý mã 'so_hong_rieng' = 'sổ hồng riêng'; đường 'đường 3/2' khớp bí danh của 'Ba Tháng Hai'", ma2.ty_le_ghi_dung === 1, JSON.stringify(ma2.truong.filter((t) => !t.dat)));
ok("pháp lý mã 'so_hong_chung' ≠ 'sổ hồng riêng'", chamTatDinh(p, luot, { ...tin, legal_status: "so_hong_chung" }).truong.find((t) => t.khoa === "phap_ly")?.dat === false);
ok("không có tin trong DB → ghi đúng 0%", chamTatDinh(p, luot, null).ty_le_ghi_dung === 0);

const { giu, bo } = kiemTrichDanGiamKhao([
  { tieu_chi: "mot_y", trich_dan: "Nhà anh ngang dài bao nhiêu", nhan_xet: "đúng trích" },
  { tieu_chi: "khong_bia", trich_dan: "tin đã được kiểm duyệt", nhan_xet: "trích dẫn không có trong lời bot" },
  { tieu_chi: "tu_nhien", trich_dan: "Đã trích xuất", nhan_xet: "chỉ có trong bong bóng 🤖, không tính" },
], luot);
ok("giám khảo AI: giữ lỗi có trích dẫn thật trong lời bot, bỏ trích dẫn bịa và trích từ bong bóng hệ thống", giu.length === 1 && bo.length === 2, JSON.stringify({ giu, bo }));
ok("dòng tóm tắt có tỷ lệ, lượt bản nháp, trường sai", /^\| cut-khong-dau \| 67% \| 5 \/ 5 \| không \| /.test(dongTomTat(sai)) && /gia_vnd=9000000000≠9500000000/.test(dongTomTat(sai)), dongTomTat(sai));

console.log(hong ? `\nKHÁCH MÔ PHỎNG (tự kiểm): ${hong}/${tong} CA HỎNG` : `\nKHÁCH MÔ PHỎNG (tự kiểm): ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);
