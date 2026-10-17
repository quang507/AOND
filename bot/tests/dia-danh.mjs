// dia-danh.mjs — dò địa danh chung (01/10/2026, chủ dự án: "làm hàm dò địa danh chung đi … nếu 137/28 thì là hẻm rồi,
// đường số 59 hoặc đường có tên là đường lớn"). Ứng viên lấy từ mock `tim_dia_danh` (cùng ngữ nghĩa SQL 20261001e) trên
// bảng wards / phuong_cu THẬT + vài dòng quận cũ, tên đường. Chạy: bun bot/tests/dia-danh.mjs
import { chonDiaDanh, coChuPhuong, cungQuan, loaiDuongVaoTuDiaChi, nhacTenQuan, phuongTrungTenQuan, tenDiaDanhTron } from "../supabase/functions/_shared/extraction/dia-danh.ts";
import { FakeDB, napPhuongThat, napPhuongCuThat, createClient } from "./e2e/mock-supabase.mjs";

let tong = 0, hong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };

// ── tenDiaDanhTron: tin chỉ là một tên trơn ──
const tron = (t) => JSON.stringify(tenDiaDanhTron(t));
ok("'tân định' → tên trơn", tenDiaDanhTron("tân định")?.ten === "tân định", tron("tân định"));
ok("'phường tây thạnh nha' → tiền tố phường", tenDiaDanhTron("phường tây thạnh nha")?.tienTo === "phuong" && tenDiaDanhTron("phường tây thạnh nha")?.ten === "tây thạnh", tron("phường tây thạnh nha"));
ok("'ở gò vấp á' → 'gò vấp'", tenDiaDanhTron("ở gò vấp á")?.ten === "gò vấp", tron("ở gò vấp á"));
ok("'Dạ thông tây hội em' → 'thông tây hội'", tenDiaDanhTron("Dạ thông tây hội em")?.ten === "thông tây hội", tron("Dạ thông tây hội em"));
ok("'quận bình thạnh' → tiền tố quận", tenDiaDanhTron("quận bình thạnh")?.tienTo === "quan");
for (const t of ["156 Nguyễn Trãi", "sổ hồng riêng", "không gấp em", "còn ở tốt", "3 phòng", "bình", "ok em", "hẻm xe hơi", "bao nhiêu vậy?", "trệt 2 lầu"]) {
  ok(`${JSON.stringify(t)} → không phải tên trơn`, tenDiaDanhTron(t) === null, tron(t));
}

// ── chonDiaDanh trên dữ liệu thật ──
const wards = napPhuongThat();
const phuongCu = await napPhuongCuThat();
const quanCu = [...new Set(wards.map((w) => w.quan_cu))].map((ten) => ({ ten }));
const duong = [
  { ten: "Tây Thạnh", ten_khong_dau: "tay thanh", loai: "duong", quan_cu: "Quận Tân Phú", phuong: "Phường Tây Thạnh", tinh: "TP.HCM" },
  { ten: "Nguyễn Trãi", ten_khong_dau: "nguyen trai", loai: "duong", quan_cu: "Quận 5", phuong: "Phường Chợ Quán", tinh: "TP.HCM" },
  { ten: "Nguyễn Trãi", ten_khong_dau: "nguyen trai", loai: "duong", quan_cu: "Quận 1", phuong: "Phường Bến Thành", tinh: "TP.HCM" },
];
globalThis.__db = new FakeDB();
Object.assign(globalThis.__db.t, { wards, phuong_cu: phuongCu, quan_cu: quanCu, duong });
const db = createClient();
const tim = async (ten) => (await db.rpc("tim_dia_danh", { p_ten: ten })).data;
const chon = async (ten, o = {}) => chonDiaDanh(await tim(ten), o);
const s = (x) => JSON.stringify(x);

let r = await chon("thong tay hoi");
ok("'thong tay hoi' (không dấu) → Phường Thông Tây Hội", r?.nhom === "phuong" && r.ten === "Phường Thông Tây Hội", s(r));
r = await chon("tây thông hội");
ok("'tây thông hội' (đảo chữ) → Phường Thông Tây Hội", r?.ten === "Phường Thông Tây Hội", s(r));
r = await chon("thong tay hoj");
ok("'thong tay hoj' (sai 1 ký tự) → Phường Thông Tây Hội", r?.ten === "Phường Thông Tây Hội", s(r));
r = await chon("go vap");
ok("'go vap' (phường mới trùng quận cũ), không gõ 'phường', đang hỏi phường → không đoán", r === null, s(r));
r = await chon("go vap", { tienTo: "phuong" });
ok("'phường gò vấp' → Phường Gò Vấp", r?.nhom === "phuong" && r.ten === "Phường Gò Vấp", s(r));
r = await chon("binh thanh", { tienTo: "quan" });
ok("'quận bình thạnh' → Quận Bình Thạnh", r?.nhom === "quan" && r.ten === "Quận Bình Thạnh", s(r));
r = await chon("tay thanh");
ok("'tây thạnh' (vừa đường vừa phường), không ngữ cảnh → không đoán", r === null, s(r));
r = await chon("tay thanh", { cauHoi: "phuong" });
ok("'tây thạnh' khi đang hỏi phường → Phường Tây Thạnh", r?.nhom === "phuong" && r.ten === "Phường Tây Thạnh", s(r));
r = await chon("tay thanh", { cauHoi: "duong" });
ok("'tây thạnh' khi đang hỏi địa chỉ → đường Tây Thạnh", r?.nhom === "duong" && r.ten === "Tây Thạnh", s(r));
r = await chon("nguyen trai");
ok("'nguyễn trãi' → đường (hai quận nên quận để trống)", r?.nhom === "duong" && r.quan_cu === null, s(r));
r = await chon("nguyen trai", { quanBiet: "Quận 5" });
ok("'nguyễn trãi' + quận 5 đã biết → đường", r?.nhom === "duong" && r.ten === "Nguyễn Trãi", s(r));
const cuTach = phuongCu.find((p) => !p.toan_bo && phuongCu.filter((x) => x.ten === p.ten && x.quan_cu === p.quan_cu).length > 1 && !/\d/.test(p.ten));
if (cuTach) {
  r = await chon(cuTach.ten.replace(/^(Phường|Xã|Thị trấn)\s+/, ""), { tienTo: "phuong", quanBiet: cuTach.quan_cu });
  ok(`phường cũ tách về nhiều phường mới (${cuTach.ten}) → không đoán`, r === null || r.nhom !== "phuong", s(r));
}
ok("ứng viên rỗng → null", chonDiaDanh([], {}) === null);

// ── loaiDuongVaoTuDiaChi ──
const L = (d, k = "") => loaiDuongVaoTuDiaChi(d, k);
ok("'137/28 Đường số 59' → hẻm", L("137/28 Đường số 59") === "hem");
ok("'137/28/5 Lê Văn Thọ' → hẻm", L("137/28/5 Lê Văn Thọ") === "hem");
ok("'156 Nguyễn Trãi' → mặt tiền", L("156 Nguyễn Trãi") === "mat_tien");
ok("'156 đường số 59' → mặt tiền", L("156 đường số 59") === "mat_tien");
ok("'156 đường 3/2' → mặt tiền (3/2 là tên đường)", L("156 đường 3/2") === "mat_tien");
ok("'12 hẻm 4m Trần Bình Trọng' → không suy", L("12 hẻm 4m Trần Bình Trọng") === null);
ok("'156 Nguyễn Trãi' mà câu nói hẻm xe hơi → không suy", L("156 Nguyễn Trãi", "bán nhà hẻm xe hơi 156 nguyễn trãi") === null);
ok("'Trần Bình Trọng' (không số nhà) → không suy", L("Trần Bình Trọng") === null);
ok("'lô 12 KDC Phú Mỹ' → không suy", L("lô 12 KDC Phú Mỹ") === null);
ok("'4m Nguyễn Trãi' → không suy", L("4m Nguyễn Trãi") === null);

// ── cungQuan / nhacTenQuan (hỏi lại phường lệch quận) ──
ok("cungQuan 'Quận 5' = 'quận 5'", cungQuan("Quận 5", "quận 5"));
ok("cungQuan 'Quận Tân Phú' ≠ 'Quận 5'", !cungQuan("Quận Tân Phú", "Quận 5"));
ok("nhacTenQuan 'tân phú em' → Quận Tân Phú", nhacTenQuan("tân phú em", "Quận Tân Phú"));
ok("nhacTenQuan 'quận 5 mà em' → Quận 5", nhacTenQuan("quận 5 mà em", "Quận 5"));
ok("nhacTenQuan 'q5' → Quận 5", nhacTenQuan("q5 nha", "Quận 5"));
ok("nhacTenQuan '5 người đứng tên' KHÔNG phải Quận 5", !nhacTenQuan("5 người đứng tên", "Quận 5"));
ok("nhacTenQuan 'quận 15' KHÔNG phải Quận 5", !nhacTenQuan("quận 15", "Quận 5"));
ok("nhacTenQuan 'đúng rồi' → không", !nhacTenQuan("đúng rồi", "Quận Tân Phú"));

ok("phuongTrungTenQuan Bình Thạnh / Quận Bình Thạnh", phuongTrungTenQuan("Bình Thạnh", "Quận Bình Thạnh"));
ok("phuongTrungTenQuan Tây Thạnh / Quận Tân Phú → không", !phuongTrungTenQuan("Tây Thạnh", "Quận Tân Phú"));
ok("coChuPhuong 'phường bình thạnh'", coChuPhuong("phường bình thạnh"));
ok("coChuPhuong 'bình thạnh mà em' → không", !coChuPhuong("bình thạnh mà em"));

console.log(`\n${tong - hong}/${tong} đạt`);
if (hong) process.exit(1);
