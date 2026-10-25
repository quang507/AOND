// Đọc kích thước ảnh (JPEG / PNG / GIF / WebP) từ byte đầu, không thư viện (SRS-5.1zzzzzzz177, 25/10/2026).
// Vì sao: zca-js từ 2.0.0 bắt buộc `imageMetadataGetter` khi gửi ảnh theo đường dẫn file; bridge không có nên MỌI tấm ảnh hỏng
// ("Missing imageMetadataGetter", sổ lỗi 23–24/10 ×9) trong khi lõi vẫn nói "ảnh em gửi ngay sau tin này". `sharp` cần biên dịch
// trên VPS nên đọc tay. Không đọc được → null (bridge vẫn gửi với 0×0, zca-js chỉ cần số).
export function kichThuocAnh(buf) {
  if (!buf || buf.length < 12) return null;
  // PNG: 8 byte chữ ký rồi IHDR (width/height big-endian ở 16 / 20)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf.length >= 24)
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  // GIF: "GIF8" rồi width / height little-endian ở 6 / 8
  if (buf.toString("latin1", 0, 4) === "GIF8") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  // WebP: RIFF….WEBP + chunk VP8 / VP8L / VP8X
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP" && buf.length >= 30) {
    const loai = buf.toString("latin1", 12, 16);
    if (loai === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (loai === "VP8L") {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (loai === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    return null;
  }
  // JPEG: duyệt marker tới SOFn (C0–CF trừ C4 / C8 / CC): height ở +5, width ở +7
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m === 0xff) { o++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
      if (m === 0xd9 || m === 0xda) return null;
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  return null;
}
