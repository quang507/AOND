// go-nham-dau.ts — GỠ CẶP CHỮ TRÙNG KHI BỎ DẤU, trước mọi phép so khớp tìm-chuỗi (02/10/2026, SRS-5.1u mục 5).
//
// Bắn thử v317 (lx-cx-12): "nói thật chứ chị sợ mấy bên online lừa lắm" → ô NỘI THẤT = nguyên câu. Bỏ dấu, "nói thật" và
// "nội thất" cùng ra "noi that" — mọi luật / kiểm bằng chứng viết trên chữ bỏ dấu đều nhận nhầm. Khách gõ CÓ DẤU thì nghĩa
// đã rõ ("thật" có dấu nặng không bao giờ là "thất"), nên đổi sang dạng không trùng TRƯỚC khi bỏ dấu: "nói thật" → "nói
// thựt" (cùng nghĩa, cùng độ dài — chỗ nào cắt chữ gốc theo vị trí chữ bỏ dấu vẫn đúng). Khách gõ không dấu ("noi that")
// thì vẫn trùng thật sự — chỗ đó để AI đọc theo nghĩa.
// Thêm cặp mới: chỉ cặp mà bản CÓ DẤU phân biệt được, đổi giữ nguyên độ dài, kèm ca trong `bot/tests/go-nham-dau.mjs`.

/** Đổi chữ có dấu dễ trùng khi bỏ dấu sang dạng không trùng (giữ độ dài). Gọi TRƯỚC khi bỏ dấu. */
export function goNhamDau(s: string): string {
  return s.normalize("NFC").replace(/(?<!\p{L})([nN][óÓ][iI]\s+[tT][hH])([ậẬ])([tT])(?!\p{L})/gu,
    (_m, dau: string, a: string, t: string) => `${dau}${a === "Ậ" ? "Ự" : "ự"}${t}`);
}
