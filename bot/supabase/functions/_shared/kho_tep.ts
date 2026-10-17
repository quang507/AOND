// kho_tep.ts — nhận FILE và LINK người bán gửi (05/10/2026, SRS-5.1zzj — theo demo AOND fetch.py / bulk.py).
//
// Trước bản này bot chỉ nhận ẢNH qua một URL CDN Zalo (`image_url`); PDF, CSV, XLSX và link
// bị webhook bỏ ngay cửa. Nay: tải về có RÀO (chỉ http/https, chặn IP nội bộ kể cả sau
// chuyển hướng, trần dung lượng, hạn chờ), nhận diện loại bằng byte đầu chứ không tin
// đuôi tên, và đọc CSV tại chỗ. XLSX đọc qua `npm:xlsx` nạp TRỄ — chỉ tốn khi có file.
//
// Luật §5: file người bán gửi có thể là sổ đỏ, CCCD — mọi thứ tải về đi bucket RIÊNG TƯ,
// không bao giờ phát ra ngoài; nội dung không ghi vào sổ lỗi (chỉ ghi tên file và kích thước).

export const TRAN_TEP = 20 * 1024 * 1024; // 20 MB — brochure PDF thường 2–10 MB
export const HAN_TAI_MS = 20_000;

export type LoaiTep = "pdf" | "xlsx" | "csv" | "anh" | "khac";
export type TepTai = { bytes: Uint8Array; mime: string; ten: string | null; url: string };

/** IP nội bộ / loopback / link-local / reserved — không bao giờ được fetch tới (SSRF). */
export function ipRieng(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::" ) return true;
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return true; // fc00::/7, fe80::/10
  const m4 = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m4) return ipRieng(m4[1]);
  return false;
}

/** Tên máy chủ có phân giải ra địa chỉ công cộng không. Ngoài Deno (bộ e2e) không có DNS → coi là an toàn, fetch giả không ra mạng. */
export async function hostAnToan(host: string): Promise<boolean> {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return !ipRieng(h);
  const D = (globalThis as { Deno?: { resolveDns?: (h: string, t: "A" | "AAAA") => Promise<string[]> } }).Deno;
  if (!D?.resolveDns) return true;
  try {
    const [a, aaaa] = await Promise.all([
      D.resolveDns(h, "A").catch(() => [] as string[]),
      D.resolveDns(h, "AAAA").catch(() => [] as string[]),
    ]);
    const ips = [...a, ...aaaa];
    return ips.length > 0 && ips.every((ip) => !ipRieng(ip));
  } catch {
    return false;
  }
}

function tenTuHeader(cd: string | null): string | null {
  if (!cd) return null;
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) ?? cd.match(/filename="?([^";]+)"?/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]).trim() || null; } catch { return m[1].trim() || null; }
}
function tenTuUrl(u: URL): string | null {
  const cuoi = u.pathname.split("/").filter(Boolean).at(-1) ?? "";
  try { return decodeURIComponent(cuoi) || null; } catch { return cuoi || null; }
}

/**
 * Tải một file về bộ nhớ. Theo chuyển hướng tối đa 4 bước, MỖI bước kiểm lại máy chủ (demo
 * AOND fetch.py: "redirects ARE followed, but every hop is re-validated"). Lỗi → null, không ném.
 */
export async function taiTep(url: string, o: { tran?: number; hanMs?: number } = {}): Promise<TepTai | null> {
  const tran = o.tran ?? TRAN_TEP;
  let cur: URL;
  try { cur = new URL(url); } catch { return null; }
  for (let buoc = 0; buoc < 4; buoc++) {
    if (cur.protocol !== "https:" && cur.protocol !== "http:") return null;
    if (!(await hostAnToan(cur.hostname))) return null;
    let r: Response | null;
    try {
      r = await fetch(cur.toString(), { redirect: "manual", signal: AbortSignal.timeout(o.hanMs ?? HAN_TAI_MS) });
    } catch { return null; }
    if (!r) return null;
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      await r.body?.cancel().catch(() => {});
      if (!loc) return null;
      try { cur = new URL(loc, cur); } catch { return null; }
      continue;
    }
    if (!r.ok) return null;
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > tran) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > tran) return null;
    const mime = (r.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    return { bytes, mime, ten: tenTuHeader(r.headers.get("content-disposition")) ?? tenTuUrl(cur), url: cur.toString() };
  }
  return null;
}

const latin1 = (b: Uint8Array, n: number) => new TextDecoder("latin1").decode(b.subarray(0, n));

/** Nhận diện loại file bằng BYTE ĐẦU trước, tên và mime chỉ đỡ. */
export function loaiTep(bytes: Uint8Array, mime: string | null, ten: string | null): LoaiTep {
  const dau = latin1(bytes, 8);
  if (dau.startsWith("%PDF")) return "pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "anh"; // JPEG
  if (dau.startsWith("\x89PNG")) return "anh";
  if (dau.startsWith("RIFF") && latin1(bytes, 12).endsWith("WEBP")) return "anh";
  if (dau.startsWith("GIF8")) return "anh";
  if (dau.startsWith("PK\x03\x04")) {
    // xlsx là zip có mục `xl/` — docx/pptx cũng là zip nhưng không có.
    return latin1(bytes, Math.min(bytes.byteLength, 4096)).includes("xl/") || /\.xlsx$/i.test(ten ?? "") ? "xlsx" : "khac";
  }
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "anh";
  if (m === "application/pdf") return "pdf";
  if (/spreadsheet|excel/.test(m) || /\.xlsx?$/i.test(ten ?? "")) return "xlsx";
  if (m === "text/csv" || /\.(csv|tsv)$/i.test(ten ?? "")) return "csv";
  // Văn bản có dòng và dấu phân cách → CSV (nhiều máy chủ trả text/plain).
  if (m.startsWith("text/") || m === "application/octet-stream") {
    const mau = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 2048));
    const dong = mau.split(/\r?\n/).filter((d) => d.trim());
    if (dong.length >= 2 && dong.slice(0, 3).every((d) => /[,;\t]/.test(d))) return "csv";
  }
  return "khac";
}

/** Đọc CSV (RFC 4180: ô trong ngoặc kép, ngoặc kép lặp đôi, xuống dòng trong ô). Tự đoán dấu phân cách `,` `;` tab. */
export function docCsv(vanBan: string): string[][] {
  const text = vanBan.replace(/^﻿/, "");
  const dongDau = text.split(/\r?\n/).find((d) => d.trim()) ?? "";
  const dem = (c: string) => dongDau.split(c).length - 1;
  const sep = dem("\t") > dem(",") && dem("\t") > dem(";") ? "\t" : dem(";") > dem(",") ? ";" : ",";
  const ra: string[][] = [];
  let hang: string[] = [];
  let o = "";
  let trongNgoac = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (trongNgoac) {
      if (c === '"') {
        if (text[i + 1] === '"') { o += '"'; i++; } else trongNgoac = false;
      } else o += c;
      continue;
    }
    if (c === '"') { trongNgoac = true; continue; }
    if (c === sep) { hang.push(o); o = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      hang.push(o); o = "";
      if (hang.some((x) => x.trim())) ra.push(hang.map((x) => x.trim()));
      hang = [];
      continue;
    }
    o += c;
  }
  hang.push(o);
  if (hang.some((x) => x.trim())) ra.push(hang.map((x) => x.trim()));
  return ra;
}

/** Đọc sheet đầu của XLSX thành bảng chữ. Thư viện nạp TRỄ; bộ e2e đặt `globalThis.__docXlsx` để giả lập. */
export async function docXlsx(bytes: Uint8Array): Promise<string[][]> {
  const gia = (globalThis as { __docXlsx?: (b: Uint8Array) => string[][] }).__docXlsx;
  if (gia) return gia(bytes);
  const XLSX = await import("npm:xlsx@0.18.5");
  const wb = XLSX.read(bytes, { type: "array" });
  const ten = wb.SheetNames[0];
  if (!ten) return [];
  const bang = XLSX.utils.sheet_to_json(wb.Sheets[ten], { header: 1, raw: false, defval: "" }) as unknown[][];
  return bang.map((h) => h.map((x) => String(x ?? "").trim())).filter((h) => h.some(Boolean));
}

/** Base64 theo khúc (btoa trên chuỗi lớn một lần là tràn stack). */
export function base64(bytes: Uint8Array): string {
  let s = "";
  const KHUC = 0x8000;
  for (let i = 0; i < bytes.length; i += KHUC) s += String.fromCharCode(...bytes.subarray(i, i + KHUC));
  return btoa(s);
}

/** Link Google Drive → mã file / thư mục. Trả null khi không phải link Drive. */
export function docLinkDrive(url: string): { loai: "file" | "thu_muc"; id: string } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!/(^|\.)(drive|docs)\.google\.com$/.test(u.hostname)) return null;
  const tm = u.pathname.match(/\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})/);
  if (tm) return { loai: "thu_muc", id: tm[1] };
  const f = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) ?? u.pathname.match(/\/(?:document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{10,})/);
  if (f) return { loai: "file", id: f[1] };
  const q = u.searchParams.get("id");
  if (q && /^[A-Za-z0-9_-]{10,}$/.test(q)) return { loai: "file", id: q };
  return null;
}

/** Mọi URL http(s) trong một đoạn chữ (người bán dán link kèm lời). */
export function timLinkTrongChu(text: string): string[] {
  const ra = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  return [...new Set(ra.map((u) => u.replace(/[.,;:!?]+$/, "")))];
}

// Hai hàm đọc số từ chữ tài liệu — để ở đây (không zod) cho bài tự kiểm offline nhập được.
/** Đọc số m² từ chữ chép ("75.5m2", "75,5 m²", "4x15 = 60m2" → 60). null nếu không ra số hợp lý. */
export function m2TuChu(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.replace(/,/g, ".").replace(/\s+/g, " ");
  const m = t.match(/(\d+(?:\.\d+)?)\s*m\s*(?:2|²)/i) ?? t.match(/=\s*(\d+(?:\.\d+)?)/) ?? t.match(/^(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 5 && n < 100_000 ? n : null;
}

/** Tầng từ chữ ("12", "tầng 12", "12A" → 12). */
export function tangTuChu(s: string | null | undefined): number | null {
  const m = (s ?? "").match(/\d{1,3}/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 0 && n <= 150 ? n : null;
}
