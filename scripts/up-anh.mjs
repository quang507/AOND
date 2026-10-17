#!/usr/bin/env node
// Đẩy ảnh thật từ máy local lên bucket `listing-photos` của Supabase (FR-148).
//
// CHẠY TRÊN MÁY MÀY, không deploy. Ảnh gốc (masterDB/) nằm ngoài git — script
// này chỉ đọc, không bao giờ copy nội dung ảnh vào repo.
//
//   cd <repo>
//   set SUPABASE_SERVICE_ROLE_KEY=<service_role key>     (Windows cmd)
//   export SUPABASE_SERVICE_ROLE_KEY=<service_role key>  (macOS/Linux)
//   node scripts/up-anh.mjs "D:\masterDB\photos" --dry     ← xem trước, KHÔNG đẩy
//   node scripts/up-anh.mjs "D:\masterDB\photos"           ← đẩy thật
//
// Cấu trúc thư mục nguồn: mỗi TIN một thư mục con, tên là STT trong masterDB
// (1, 2, 007…) hoặc thẳng mã tin (BDS-Q5-0007). Script tự quy đổi STT → mã:
// `listings.legacy_sst` = STT, `code` = 'BDS-Q5-' + STT đệm 4 số.
//
// Đích (FR-165): listing-public/<LISTING UUID>/<MEDIA UUID>.<đuôi>, kèm MỘT
// dòng `listing_media` cho mỗi file. Đường dẫn neo vào ID BẤT BIẾN của tin chứ
// không vào mã tin: mã đổi được, mà đổi mã theo lối cũ là toàn bộ ảnh rơi khỏi
// tin, âm thầm. Thư mục nguồn vẫn đặt tên theo STT/mã như cũ — script tự tra ra
// UUID, mày không phải đổi thói quen.
//
// Thứ tự ảnh KHÔNG còn theo tên file (xếp tên thì "1, 10, 2"): số trong tên file
// được đọc thành `sort_order`, hết số thì rơi về thứ tự đọc thư mục. Ảnh bìa do
// DB tự chọn (tấm sort_order nhỏ nhất) — không cần đặt tên file cho khéo.
//
// Có `sharp` thì tự nén còn ngang ≤2500px / JPEG q80 (masterDB ~179MB, đẩy
// nguyên bản là trang chi tiết tải nặng và ăn hết dung lượng free tier).
// Không có sharp cũng chạy, chỉ cảnh báo file nặng:  bun add -d sharp
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SRC = process.argv[2];
const DRY = process.argv.includes("--dry");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SRC) {
  console.error("Thiếu thư mục nguồn.\n  node scripts/up-anh.mjs <thư-mục-ảnh> [--dry]");
  process.exit(1);
}
if (!KEY && !DRY) {
  console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong env (Dashboard → Settings → API).");
  process.exit(1);
}

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { /* không có thì thôi */ }

const db = KEY ? createClient(URL, KEY) : null;
const OK_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/**
 * FR-152 — mọi lỗi ở đây phải VÀO SỔ `bot_errors`, không chỉ ra màn hình.
 *
 * Đây chính là bài học của vụ 07/09/2026. Hai ảnh chết vì `sort_order` tràn
 * int4; script in đúng một dòng `✗ … out of range for type integer` rồi chạy
 * tiếp và kết thúc bằng "Xong: 1003 ảnh, 2 lỗi" — thoát 0, xanh. Dòng ✗ đó
 * nằm lọt giữa 1005 dòng ✓ trong một terminal rồi đóng cửa sổ là mất. Không
 * ai biết hai tin đang rao thiếu ảnh, và không có chỗ nào để tra lại.
 *
 * `console.error` một mình là mất (CLAUDE.md §6). Script này cầm service_role
 * nên gọi thẳng RPC `log_loi` được, khỏi vòng qua escalation-feed như bridge.
 *
 * KHÔNG BAO GIỜ NÉM: mọi nơi gọi hàm này đều đang xử lý một lỗi khác.
 */
let nLoiVaoSo = 0;
async function ghiLoi(source, detail) {
  const text = detail instanceof Error ? (detail.message || String(detail)) : String(detail ?? "");
  console.error(`${source}:`, text);
  if (!db || DRY) return; // chạy thử thì đừng làm bẩn sổ thật
  try {
    await db.rpc("log_loi", { p_source: `up-anh ${source}`.slice(0, 60), p_detail: text, p_code: null });
    nLoiVaoSo++;
  } catch { /* sổ hỏng thì thôi, đừng kéo theo cả lượt đẩy đang chạy */ }
}

// Tên thư mục → mã tin. Nhận cả 'BDS-Q5-0007', '7', '007'.
// Số trong tên file → sort_order ("03.jpg" → 3, "anh-2.png" → 2). Không có số
// thì trả null, để thứ tự đọc thư mục quyết định.
const THU_TU_TOI_DA = 9999; // xem chú thích dưới; khớp CHECK phía DB
const thuTuTuTen = (file) => {
  // CHỈ nhận số NGẮN. `sort_order` là số THỨ TỰ ("tấm thứ mấy"), không phải một
  // con số bất kỳ nhặt được trong tên file.
  //
  // Chuyện đã xảy ra 07/09/2026: ảnh chụp bằng điện thoại mang tên dấu thời
  // gian — "20240912152429-2dc0_wm.jpg". Mẫu cũ `/(\d+)/` nuốt trọn 14 chữ số
  // làm thứ tự, vượt trần int4 (2.147.483.647), và insert nổ `value out of
  // range for type integer` ĐÚNG SAU khi file đã lên kho. Nhánh dọn dẹp xoá
  // file vừa up → tấm ảnh biến mất hẳn, chỉ để lại một dòng ✗ trôi giữa 1005
  // dòng ✓. Mất 1 ảnh của #BDS-Q5-0020 và 1 của #BDS-Q5-0129.
  //
  // CỐ Ý KHÔNG nới cột sang `bigint`. Nới là hết nổ, nhưng `20240912152429`
  // được ghi vào như một thứ tự hợp lệ: tấm đó xếp cuối vĩnh viễn và KHÔNG AI
  // BIẾT — đổi một lỗi ồn ào lấy một lỗi câm. Cắt ở đây, chặn thêm bằng CHECK
  // phía DB (migration 20260907a), và nối catch vào sổ để lần sau lỗi không
  // trôi trong log nữa.
  //
  // Số phải là MỘT TỪ RIÊNG, không phải một khúc digit nằm lọt trong một token
  // dài hơn. Ranh giới hai đầu là đầu/cuối tên hoặc một ký tự KHÔNG phải chữ-số.
  //
  // Bản vá đầu chỉ chặn "không có digit liền kề" (`(?<!\d)…(?!\d)`) — chưa đủ:
  // với "20240607103328-c49f_wm.jpg" nó nhả ra `49`, moi từ giữa chuỗi băm
  // `c49f`. Hết nổ, nhưng tấm ảnh lặng lẽ nằm ở vị trí 49. Đúng cái lỗi câm mà
  // cả migration 20260907a viết ra để tránh, chỉ đổi số.
  //
  // Nhận:   "2.jpg" → 2 · "03.jpg" → 3 · "anh-2.png" → 2 · "IMG 12.jpg" → 12
  // Từ chối: "20240607103328-c49f_wm.jpg" (dấu thời gian + băm) → null
  const m = /(?:^|[^A-Za-z0-9])(\d{1,4})(?:$|[^A-Za-z0-9])/.exec(path.parse(file).name);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isSafeInteger(n) && n > 0 && n <= THU_TU_TOI_DA ? n : null;
};
const toCode = (dir) => {
  const s = dir.trim();
  if (/^BDS-Q5-\d{4}$/i.test(s)) return s.toUpperCase();
  const n = /^0*(\d{1,4})$/.exec(s);
  return n ? `BDS-Q5-${n[1].padStart(4, "0")}` : null;
};

// Đối chiếu với DB: mã nào không có tin thật thì bỏ, đừng đẩy rác lên bucket.
let known = null;
if (db) {
  const { data, error } = await db.from("listings").select("id, code");
  if (error) {
    await ghiLoi("doc bang listings", error.message);
    process.exit(1);
  }
  // mã → UUID: đường dẫn kho ảnh neo vào UUID, mã chỉ là thứ mày gõ ở tên thư mục.
  known = new Map(data.map((r) => [r.code, r.id]));
}

const dirs = fs.readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();
if (!dirs.length) {
  console.error(`Không thấy thư mục con nào trong ${SRC}. Mỗi tin phải một thư mục.`);
  process.exit(1);
}

let nUp = 0, nSkip = 0, nBad = 0, bytes = 0;
for (const dir of dirs) {
  const code = toCode(dir);
  if (!code) {
    await ghiLoi("ma tin", `bỏ qua thư mục "${dir}" — không đọc ra mã tin`);
    nBad++; continue;
  }
  if (known && !known.has(code)) {
    await ghiLoi("ma tin", `bỏ qua "${dir}" → ${code} — không có tin này trong DB`);
    nBad++; continue;
  }
  const listingId = known ? known.get(code) : null;

  const files = fs.readdirSync(path.join(SRC, dir))
    .filter((f) => OK_EXT.has(path.extname(f).toLowerCase())).sort();
  if (!files.length) continue;

  for (const [idx, f] of files.entries()) {
    const src = path.join(SRC, dir, f);
    const ext = path.extname(f).toLowerCase();
    let buf = fs.readFileSync(src);
    // Có sharp thì mọi thứ ra JPEG. Không có sharp thì GIỮ NGUYÊN đuôi + kiểu
    // gốc — đổi tên .png thành .jpg mà nội dung vẫn là PNG là trình duyệt cãi.
    let outExt = ext === ".jpeg" ? ".jpg" : ext;
    let mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[ext];
    if (sharp) {
      buf = await sharp(buf).rotate()
        .resize({ width: 2500, withoutEnlargement: true })
        .jpeg({ quality: 80 }).toBuffer();
      outExt = ".jpg"; mime = "image/jpeg";
    } else if (buf.length > 600_000) {
      // Nhắc theo ĐƯỜNG DẪN NGUỒN: tên trên kho là UUID sinh ở dưới, lúc này
      // chưa có, mà người đọc cảnh báo cần biết phải đi nén file nào.
      console.warn(`⚠ ${dir}/${f} nặng ${(buf.length / 1e6).toFixed(1)}MB — nên cài sharp để nén`);
    }
    // Tên file trên kho là UUID của chính dòng media — sinh TRƯỚC khi up để
    // file và dòng DB mang cùng một danh tính, khỏi phải đoán ngược.
    const mediaId = randomUUID();
    const dest = `${listingId}/${mediaId}${outExt}`;
    const sortOrder = thuTuTuTen(f) ?? (idx + 1);
    bytes += buf.length;
    if (DRY) { console.log(`(thử) ${src}  →  ${dest}  sort=${sortOrder}  ${(buf.length / 1024).toFixed(0)}KB`); nUp++; continue; }

    // UP FILE TRƯỚC, GHI DÒNG SAU. Ngược lại thì dòng DB trỏ vào file chưa tồn
    // tại; hỏng giữa chừng là có ảnh vỡ trên web. Theo thứ tự này, hỏng giữa
    // chừng chỉ để lại một file mồ côi — `media_mo_coi_storage` soi ra được, và
    // nó không hiện lên web vì web đọc từ `listing_media`.
    const { error } = await db.storage.from("listing-public")
      .upload(dest, buf, { contentType: mime, upsert: false });
    if (error) {
      await ghiLoi("up file", `${dir}/${f} → ${dest}: ${error.message}`);
      nSkip++; continue;
    }

    const { error: mErr } = await db.from("listing_media").insert({
      id: mediaId, listing_id: listingId, bucket: "listing-public",
      storage_path: dest, media_type: "khac", mime_type: mime,
      sort_order: sortOrder,
    });
    if (mErr) {
      // Ghi dòng hỏng → dọn luôn file vừa up, đừng để lại rác mồ côi.
      await db.storage.from("listing-public").remove([dest]);
      await ghiLoi(
        "ghi listing_media",
        `${dir}/${f} → ${dest}: ${mErr.message} — FILE VỪA UP ĐÃ BỊ XOÁ, tin #${code} thiếu tấm này`,
      );
      nSkip++; continue;
    }
    console.log(`✓ ${dest}  sort=${sortOrder}`); nUp++;
  }
}

console.log(
  `\n${DRY ? "THỬ — chưa đẩy gì cả" : "Xong"}: ${nUp} ảnh, ` +
  `${(bytes / 1e6).toFixed(1)}MB${nSkip ? `, ${nSkip} lỗi` : ""}${nBad ? `, ${nBad} thư mục bỏ qua` : ""}.` +
  // Nói rõ lỗi đã đi đâu. Dòng "2 lỗi" trần trụi là thứ đã trôi qua mắt hôm
  // 07/09 — người đọc không biết có chỗ nào tra lại hay không, nên bỏ luôn.
  (nLoiVaoSo ? `\n${nLoiVaoSo} lỗi đã vào sổ bot_errors — xem ở /admin.` : "") +
  (sharp ? "" : "\n(không có sharp → đẩy nguyên bản, ảnh nặng thì web tải chậm)") +
  (DRY ? "\nƯng thì bỏ --dry chạy lại." : "\nWeb tự hiện ảnh sau ≤5 phút (ISR revalidate 300s).")
);
