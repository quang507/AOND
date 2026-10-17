// kho-tep.mjs — tự kiểm `kho_tep.ts` + `nhap-ro-hang.ts` + `nhip-gui.ts` + luật `laNgungHangLoat` (SRS-5.1zzj…zzm, 05/10/2026).
// Chạy: bun bot/tests/kho-tep.mjs — offline, không model, không mạng (fetch giả).
import { ipRieng, hostAnToan, loaiTep, docCsv, docLinkDrive, timLinkTrongChu, taiTep, base64, m2TuChu, tangTuChu } from "../supabase/functions/_shared/kho_tep.ts";
import { bangThanhTin, anhXaCot, docLoaiBds, docPhapLy, docM2, cauRaoTuDong } from "../supabase/functions/_shared/nhap-ro-hang.ts";
import { thoiGianGo, nhipGui } from "../supabase/functions/_shared/nhip-gui.ts";
import { laNgungHangLoat } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { docNgungHangLoat } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";

let dat = 0, hong = 0;
const ok = (ten, dk, chiTiet = "") => { if (dk) { dat++; console.log(`✓ ${ten}`); } else { hong++; console.log(`✗ ${ten}${chiTiet ? ` → ${chiTiet}` : ""}`); } };

// ── SSRF
ok("ipRieng: 127.0.0.1, 10.x, 192.168.x, 169.254.x, 172.16.x, ::1, fe80::, ::ffff:10.0.0.1 là riêng",
  ["127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "172.20.0.1", "::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"].every(ipRieng));
ok("ipRieng: 8.8.8.8, 103.1.2.3, 2001:db8::1 là công cộng", ["8.8.8.8", "103.1.2.3", "2001:db8::1"].every((ip) => !ipRieng(ip)));
ok("hostAnToan: localhost / .local / IP riêng bị chặn", await Promise.all(["localhost", "x.local", "10.0.0.5", "[::1]"].map(hostAnToan)).then((r) => r.every((x) => !x)));
ok("hostAnToan: tên miền thường (ngoài Deno không có DNS) → cho qua", await hostAnToan("drive.google.com"));

// ── nhận diện loại bằng byte đầu
const enc = (s) => new TextEncoder().encode(s);
ok("loaiTep: %PDF → pdf dù tên .jpg", loaiTep(enc("%PDF-1.4 abc"), "image/jpeg", "x.jpg") === "pdf");
ok("loaiTep: JPEG magic → anh", loaiTep(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "application/octet-stream", "a.bin") === "anh");
ok("loaiTep: PK + xl/ → xlsx", loaiTep(enc("PK\x03\x04....xl/workbook.xml"), "application/octet-stream", "ro.xlsx") === "xlsx");
ok("loaiTep: PK không có xl/ (docx) → khac", loaiTep(enc("PK\x03\x04....word/document.xml"), "application/octet-stream", "a.docx") === "khac");
ok("loaiTep: text/plain có dấu phẩy nhiều dòng → csv", loaiTep(enc("dia chi,gia\n12 THD,5 ty\n99 NT,6 ty\n"), "text/plain", null) === "csv");
ok("loaiTep: html → khac", loaiTep(enc("<!doctype html><html>"), "text/html", null) === "khac");

// ── CSV
const bang = docCsv('﻿Địa chỉ,Giá,"Diện tích",SĐT\r\n"12 Trần Hưng Đạo, P4",5 tỷ,60m2,0903123456\r\n99 Nguyễn Trãi;x,"6,5 tỷ",4x15,\r\n');
ok("docCsv: BOM bỏ, ô trong ngoặc có dấu phẩy giữ nguyên, CRLF", bang.length === 3 && bang[1][0] === "12 Trần Hưng Đạo, P4" && bang[2][1] === "6,5 tỷ", JSON.stringify(bang));
ok("docCsv: dấu chấm phẩy làm phân cách khi nhiều hơn", docCsv("a;b;c\n1;2;3\n")[1].length === 3);
ok("docCsv: tab", docCsv("a\tb\n1\t2\n")[1][1] === "2");

// ── ánh xạ cột rổ hàng
const { cot, laCot } = anhXaCot(["Địa chỉ", "Giá bán", "DT", "Phòng ngủ", "Pháp lý", "SĐT chủ", "Ghi chú", "Cột lạ"]);
ok("anhXaCot: tiếng Việt có dấu → khoá; SĐT → bo_qua; cột lạ báo lại",
  cot[0] === "location_raw" && cot[1] === "price_raw" && cot[2] === "area_m2" && cot[3] === "bedrooms" && cot[4] === "legal_status" && cot[5] === "bo_qua" && cot[6] === "mo_ta" && laCot.length === 1 && laCot[0] === "Cột lạ", JSON.stringify({ cot, laCot }));
const kq = bangThanhTin(bang);
ok("bangThanhTin: 2 tin, SĐT KHÔNG vào bất kỳ ô nào (§5), 4x15 → 60m2", kq.dong.length === 2 && !JSON.stringify(kq.dong).includes("0903") && kq.dong[1].area_m2 === 60, JSON.stringify(kq.dong));
ok("bangThanhTin: dòng thiếu diện tích báo 'thiếu'", bangThanhTin([["dia chi", "gia"], ["12 THD", "5 tỷ"]]).dong[0].thieu.includes("diện tích"));
ok("bangThanhTin: không nhận cột nào → lỗi rõ", bangThanhTin([["x", "y"], ["1", "2"]]).loi !== null);
ok("bangThanhTin: cột 'Giao dịch' = thuê → cho_thue; 'Loại' căn hộ → chung_cu", (() => { const d = bangThanhTin([["loại", "giao dịch", "địa chỉ", "giá"], ["căn hộ", "cho thuê", "Sunrise", "15tr"]]).dong[0]; return d.deal === "cho_thue" && d.property_type === "chung_cu"; })());
ok("docLoaiBds: 'nhà phố' / 'đất nền' / 'biệt thự' / 'kho xưởng'", docLoaiBds("Nhà phố") === "nha_pho" && docLoaiBds("đất nền") === "dat" && docLoaiBds("Biệt thự") === "biet_thu" && docLoaiBds("kho xưởng") === "kho_xuong");
ok("docPhapLy: SHR / sổ chung / HĐMB / vi bằng", docPhapLy("SHR") === "so_hong_rieng" && docPhapLy("sổ chung") === "so_hong_chung" && docPhapLy("HĐMB") === "hdmb" && docPhapLy("vi bằng") === "giay_tay");
ok("docM2: '60,5 m²' → 60.5; '4x15' → 60; 'abc' → null", docM2("60,5 m²") === 60.5 && docM2("4x15") === 60 && docM2("abc") === null);
ok("cauRaoTuDong: câu rao có đủ ô, không có SĐT", (() => { const c = cauRaoTuDong(kq.dong[0]); return /^Bán/.test(c) && /5 tỷ/.test(c) && /60m2/.test(c) && !/0903/.test(c); })());

// ── link
ok("docLinkDrive: file / thư mục / open?id / không phải Drive",
  docLinkDrive("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view")?.loai === "file" &&
  docLinkDrive("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQ?usp=sharing")?.loai === "thu_muc" &&
  docLinkDrive("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")?.id === "1AbCdEfGhIjKlMnOp" &&
  docLinkDrive("https://example.com/a.pdf") === null);
ok("timLinkTrongChu: bắt 2 link, bỏ dấu câu cuối, không trùng", (() => { const l = timLinkTrongChu("xem https://a.vn/x.pdf, và https://b.vn/y. https://a.vn/x.pdf"); return l.length === 2 && l[0] === "https://a.vn/x.pdf" && l[1] === "https://b.vn/y"; })());

// ── taiTep với fetch giả: chuyển hướng về IP riêng bị chặn; trần dung lượng; nội dung đúng
const goc = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u === "https://ok.example/a.pdf") return new Response(enc("%PDF-1.7 x"), { status: 200, headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="bang gia.pdf"' } });
  if (u === "https://ok.example/di") return new Response("", { status: 302, headers: { location: "http://127.0.0.1/secret" } });
  if (u === "https://ok.example/to") return new Response(new Uint8Array(30), { status: 200, headers: { "content-type": "application/octet-stream" } });
  return new Response("", { status: 404 });
};
const t1 = await taiTep("https://ok.example/a.pdf");
ok("taiTep: tải được, tên từ content-disposition, mime", t1 && t1.ten === "bang gia.pdf" && t1.mime === "application/pdf" && loaiTep(t1.bytes, t1.mime, t1.ten) === "pdf", JSON.stringify(t1 && { ten: t1.ten, mime: t1.mime }));
ok("taiTep: chuyển hướng về 127.0.0.1 → null (SSRF)", (await taiTep("https://ok.example/di")) === null);
ok("taiTep: quá trần → null", (await taiTep("https://ok.example/to", { tran: 10 })) === null);
ok("taiTep: ftp:// → null", (await taiTep("ftp://ok.example/a")) === null);
globalThis.fetch = goc;
ok("base64: đúng với chuỗi ngắn", base64(enc("abc")) === "YWJj");

// ── nhịp gửi
ok("thoiGianGo: tin ngắn ≥ 600 ms, tin dài ≤ 2500 ms, tin 50 chữ ≈ 2000 ms", thoiGianGo("Dạ") === 600 && thoiGianGo("x".repeat(500)) === 2500 && thoiGianGo("x".repeat(50)) === 2000);
ok("nhipGui: bật → [0, theo tin trước…]; tắt → [0, 300, 300]", JSON.stringify(nhipGui(["a", "b".repeat(50), "c"], true)) === "[0,600,2000]" && JSON.stringify(nhipGui(["a", "b", "c"], false)) === "[0,300,300]");

// ── luật ngưng hàng loạt (đỡ khi AI không chạy) + AI có trích dẫn
const nhl = (t) => laNgungHangLoat(t);
ok("laNgungHangLoat: 'chỉ giữ căn Trần Hưng Đạo, ẩn hết còn lại' → chi_giu + giu", nhl("chỉ giữ căn Trần Hưng Đạo, ẩn hết còn lại")?.kieu === "chi_giu" && nhl("chỉ giữ căn Trần Hưng Đạo, ẩn hết còn lại")?.giu[0] === "can tran hung dao");
ok("laNgungHangLoat: 'ngưng rao hết trừ căn 2' → chi_giu giu 'can 2'", nhl("ngưng rao hết trừ căn 2")?.kieu === "chi_giu" && nhl("ngưng rao hết trừ căn 2")?.giu[0] === "can 2");
ok("laNgungHangLoat: 'gỡ hết đi em' / 'rút tất cả tin' → an_het", nhl("gỡ hết đi em")?.kieu === "an_het" && nhl("rút tất cả tin")?.kieu === "an_het");
ok("laNgungHangLoat: không kích — 'ngưng căn Nguyễn Trãi', 'bán hết rồi em', 'gỡ tin kiểu gì?', 'thôi hết hỏi đi', 'còn lại 2 căn', 'hết hàng rồi', 'ẩn cái ảnh đi', 'ngưng rao căn này'",
  ["ngưng căn Nguyễn Trãi", "bán hết rồi em", "gỡ tin kiểu gì?", "thôi hết hỏi đi", "còn lại 2 căn", "hết hàng rồi", "ẩn cái ảnh đi", "ngưng rao căn này"].every((t) => nhl(t) === null),
  JSON.stringify(["ngưng căn Nguyễn Trãi", "bán hết rồi em", "gỡ tin kiểu gì?", "thôi hết hỏi đi", "còn lại 2 căn", "hết hàng rồi", "ẩn cái ảnh đi", "ngưng rao căn này"].map((t) => [t, nhl(t)])));
ok("docNgungHangLoat: nhận khi trích có trong tin, từ chối khi trích bịa",
  docNgungHangLoat({ kieu: "an_het", giu: [], trich_dan: "gỡ hết" }, "em gỡ hết tin giúp anh")?.kieu === "an_het" &&
  docNgungHangLoat({ kieu: "an_het", giu: [], trich_dan: "xoá sạch" }, "em gỡ hết tin giúp anh") === null &&
  docNgungHangLoat({ kieu: "khac", giu: [], trich_dan: "gỡ hết" }, "em gỡ hết tin giúp anh") === null);

// ── đọc số từ chữ tài liệu
ok("m2TuChu / tangTuChu", m2TuChu("75,5m²") === 75.5 && m2TuChu("4x15 = 60m2") === 60 && m2TuChu("mơ hồ") === null && tangTuChu("tầng 12A") === 12 && tangTuChu(null) === null);

console.log(`\n${hong ? `${hong} HỎNG · ` : ""}${dat} đạt`);
process.exit(hong ? 1 : 0);
