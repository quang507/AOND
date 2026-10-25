// SRS-5.1zzzzzzz177 — bộ đọc kích thước ảnh của bridge (imageMetadataGetter cho zca-js ≥ 2). Đỏ khi một định dạng ảnh web đọc sai
// hoặc buffer rác làm hàm ném (bridge phải gửi được ảnh kể cả khi không đọc ra kích thước).
import { kichThuocAnh } from "../bridge-zca/kich-thuoc-anh.mjs";
let hong = 0;
const ok = (ten, dk, chiTiet = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk ? "" : `\n     → ${chiTiet}`}`); if (!dk) hong++; };
const png = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png); png.writeUInt32BE(13, 8); png.write("IHDR", 12);
png.writeUInt32BE(1200, 16); png.writeUInt32BE(800, 20);
ok("PNG 1200×800", JSON.stringify(kichThuocAnh(png)) === JSON.stringify({ width: 1200, height: 800 }), JSON.stringify(kichThuocAnh(png)));
const gif = Buffer.alloc(13); gif.write("GIF89a", 0, "latin1"); gif.writeUInt16LE(320, 6); gif.writeUInt16LE(240, 8);
ok("GIF 320×240", JSON.stringify(kichThuocAnh(gif)) === JSON.stringify({ width: 320, height: 240 }), JSON.stringify(kichThuocAnh(gif)));
// JPEG: SOI, APP0 (16 byte), rồi SOF0 cao 1600 rộng 2400
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14), Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]),
  Buffer.from([0x06, 0x40, 0x09, 0x60]), Buffer.alloc(10)]);
ok("JPEG 2400×1600 (SOF0 sau APP0)", JSON.stringify(kichThuocAnh(jpg)) === JSON.stringify({ height: 1600, width: 2400 }), JSON.stringify(kichThuocAnh(jpg)));
const webp = Buffer.alloc(30); webp.write("RIFF", 0, "latin1"); webp.write("WEBP", 8, "latin1"); webp.write("VP8 ", 12, "latin1");
webp.writeUInt16LE(640, 26); webp.writeUInt16LE(480, 28);
ok("WebP VP8 640×480", JSON.stringify(kichThuocAnh(webp)) === JSON.stringify({ width: 640, height: 480 }), JSON.stringify(kichThuocAnh(webp)));
ok("buffer rác → null, không ném", kichThuocAnh(Buffer.from("khong phai anh gi het nha")) === null && kichThuocAnh(Buffer.alloc(0)) === null);
ok("JPEG cụt (không tới SOF) → null, không ném", kichThuocAnh(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0, 0, 0, 0, 0, 0])) === null);
console.log(hong ? `\nKÍCH THƯỚC ẢNH: ${hong} CA HỎNG` : "\nKÍCH THƯỚC ẢNH: ĐẠT");
process.exit(hong ? 1 : 0);
