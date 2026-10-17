// cham.mjs — CHẤM TẤT ĐỊNH một cuộc chat khách mô phỏng (TS-MO-PHONG-01, SRS-5.1zzzzw). Thuần: không mạng, không DB, không model —
// `tu-kiem.mjs` chạy được offline. Hai phần:
//   (1) ghi đúng: dòng tin cuối trong DB so với "bộ sự thật" của persona (persona.json);
//   (2) lời bot: dấu hiệu hình thức đo được bằng code (markdown, gạch dài, "anh/chị", lượt không lời, lặp nguyên văn, bản nháp).
// Phần giọng / bịa (cần đọc nghĩa) do giám khảo AI chấm, nhưng mọi lỗi AI nêu phải TRÍCH nguyên văn câu bot — `kiemTrichDanGiamKhao`
// bỏ lỗi nào không có trích dẫn thật (cùng nguyên tắc kiểm bằng chứng của bot: AI đọc, code kiểm).

export const boDau = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const laBongHeThong = (s) => /^\s*(?:🤖|💾|📝|📋|👤)/u.test(s ?? "");

/** So một trường: trả {khoa, mong, co, dat}. */
function soTruong(khoa, mong, dong) {
  const gan = (a, b, tl) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= Math.max(0.11, Math.abs(Number(b)) * tl);
  switch (khoa) {
    case "deal": return { co: dong?.deal ?? null, dat: dong?.deal === mong };
    case "loai_bds": return { co: dong?.property_type ?? null, dat: dong?.property_type === mong };
    case "gia_vnd": return { co: dong?.price_vnd ?? null, dat: gan(dong?.price_vnd, mong, 0.02) };
    case "ngang": return { co: dong?.frontage_m ?? null, dat: gan(dong?.frontage_m, mong, 0) };
    case "dai": return { co: dong?.length_m ?? null, dat: gan(dong?.length_m, mong, 0) };
    case "dien_tich": return { co: dong?.area_m2 ?? null, dat: gan(dong?.area_m2, mong, 0.03) };
    case "so_tang": return { co: dong?.floors ?? null, dat: dong?.floors != null && Number(dong.floors) === Number(mong) };
    case "phong_ngu": return { co: dong?.bedrooms ?? null, dat: dong?.bedrooms != null && Number(dong.bedrooms) === Number(mong) };
    case "quan": {
      const kd = (s) => boDau(s).replace(/^(quan|huyen|thanh pho|tp)\s+/, "").trim();
      return { co: dong?.district ?? null, dat: !!dong?.district && kd(dong.district) === kd(mong) };
    }
    case "duong": {
      // 11/10/2026 (lượt chạy đầu): một con đường nhiều cách gõ ("3/2" = "Ba Tháng Hai") — bộ sự thật được ghi MẢNG bí danh.
      const chu = boDau([dong?.street, dong?.location_raw].filter(Boolean).join(" "));
      return { co: dong?.street ?? dong?.location_raw ?? null, dat: [mong].flat().some((m) => chu.includes(boDau(m))) };
    }
    case "phap_ly": {
      // 11/10/2026 (lượt chạy đầu): cột `legal_status` là MÃ ("so_hong_rieng") — bản đầu so mã với chữ nên ca nào cũng "sai".
      const loai = (s) => {
        const k = boDau(s).replace(/_/g, " ");
        if (/\bchung\b/.test(k)) return "so_chung";
        if (/giay tay|vi bang|hdmb|hop dong/.test(k)) return "giay_tay";
        return /\bso\b|shr|sdcc/.test(k) ? "so_rieng" : null;
      };
      const co = dong?.legal_status ?? null;
      return { co, dat: !!co && loai(co) === loai(mong) };
    }
    default: return { co: null, dat: false };
  }
}

/**
 * Chấm một cuộc chat.
 * @param persona  một phần tử persona.json
 * @param luot     [{ khach: string, bot: string[] }] — mỗi lượt khách và các bong bóng bot trả lời lượt đó
 * @param tin      dòng listings cuối của người thử (hoặc null)
 */
export function chamTatDinh(persona, luot, tin) {
  const truong = Object.entries(persona.su_that ?? {}).map(([khoa, mong]) => ({ khoa, mong, ...soTruong(khoa, mong, tin) }));
  const loi = [];
  const daNoi = new Map();
  let luotNhap = null;
  luot.forEach((l, i) => {
    const bot = (l.bot ?? []).filter((b) => b && b.trim());
    const loiThuong = bot.filter((b) => !laBongHeThong(b));
    if (!loiThuong.length && !bot.some((b) => /^\s*📋/u.test(b))) loi.push({ luot: i + 1, ma: "khong_loi", cau: l.khach });
    if (luotNhap == null && bot.some((b) => /^\s*📋/u.test(b))) luotNhap = i + 1;
    for (const b of loiThuong) {
      if (/\*\*[^*\n]+\*\*|^\s*(?:[-*_]\s*){3,}$/m.test(b)) loi.push({ luot: i + 1, ma: "markdown", cau: b });
      if (/—/.test(b)) loi.push({ luot: i + 1, ma: "gach_dai", cau: b });
      if (/(?<![\p{L}])(?:anh|chị|chú|cô)\s*\/\s*(?:anh|chị|chú|cô|em)(?![\p{L}])/iu.test(b)) loi.push({ luot: i + 1, ma: "goi_gach_cheo", cau: b });
      for (const c of b.split(/(?<=[.!?…])\s+/)) {
        const k = boDau(c).replace(/[^a-z0-9 ]/g, "").trim();
        if (k.split(" ").length < 6) continue;
        if (daNoi.has(k) && daNoi.get(k) !== i) loi.push({ luot: i + 1, ma: "lap_nguyen_van", cau: c });
        if (!daNoi.has(k)) daNoi.set(k, i);
      }
    }
  });
  const dung = truong.filter((t) => t.dat).length;
  return {
    ma: persona.ma,
    ty_le_ghi_dung: truong.length ? dung / truong.length : 0,
    truong,
    so_luot: luot.length,
    luot_toi_ban_nhap: luotNhap,
    len_ke: ["dang_ban", "dang_quan_tam"].includes(tin?.status ?? ""),
    loi,
  };
}

/**
 * Giám khảo AI trả `[{tieu_chi, trich_dan, nhan_xet}]`. Giữ lỗi nào có `trich_dan` nằm NGUYÊN VĂN (so bỏ dấu, ≥ 6 ký tự) trong lời bot
 * của cuộc chat; còn lại bỏ (AI nói chung chung / bịa trích dẫn).
 */
export function kiemTrichDanGiamKhao(loiAi, luot) {
  const chuBot = boDau(luot.flatMap((l) => l.bot ?? []).filter((b) => !laBongHeThong(b)).join("\n")).replace(/\s+/g, " ");
  const giu = [], bo = [];
  for (const x of Array.isArray(loiAi) ? loiAi : []) {
    const td = boDau(x?.trich_dan ?? "").replace(/\s+/g, " ").replace(/^["'«\s]+|["'»\s.…]+$/g, "");
    (td.length >= 6 && chuBot.includes(td) ? giu : bo).push(x);
  }
  return { giu, bo };
}

/** Một dòng bảng tóm tắt cho log / step summary. */
export function dongTomTat(kq, loiAi = []) {
  const sai = kq.truong.filter((t) => !t.dat).map((t) => `${t.khoa}=${t.co ?? "∅"}≠${t.mong}`).join("; ") || "—";
  const dem = {};
  for (const l of kq.loi) dem[l.ma] = (dem[l.ma] ?? 0) + 1;
  const loiCode = Object.entries(dem).map(([m, n]) => `${m}×${n}`).join(", ") || "—";
  return `| ${kq.ma} | ${Math.round(kq.ty_le_ghi_dung * 100)}% | ${kq.luot_toi_ban_nhap ?? "chưa"} / ${kq.so_luot} | ${kq.len_ke ? "có" : "không"} | ${sai} | ${loiCode} | ${loiAi.length} |`;
}
export const DAU_BANG = "| persona | ghi đúng | lượt tới bản nháp / tổng | lên kệ | trường sai | lỗi lời bot (code) | lỗi giọng (AI, có trích) |\n|---|---|---|---|---|---|---|";
