// SRS-5.1zzzzzd (11/10/2026, chủ dự án hỏi "sao sửa lỗi này vẫn lòi ra lỗi kia"): bộ e2e dùng model GIẢ trả đúng điều người viết
// ca đặt sẵn, nên nó chỉ kiểm giả định của người sửa, không kiểm model thật đọc ra sao. Lượt khách mô phỏng thì dùng model thật nhưng
// mỗi lần một mẫu khác. File này GHI LẠI đầu ra model thật của một lượt (chỉ ID thử, xem `voiGhiAiThu` ở chat-reply) để bộ PHÁT LẠI
// (`bot/tests/phat-lai/`) chạy lại đúng lượt đó trên code mới mà không tốn tiền: lỗi đã thấy một lần không quay lại mà không ai biết.
//
// Ghi theo NGỮ CẢNH của lượt (AsyncLocalStorage), không theo biến toàn cục: một isolate phục vụ nhiều lượt cùng lúc, biến toàn cục là
// lẫn đầu ra của khách thật vào bản ghi của ID thử. Ngoài `chayCoGhiAi` thì `ghiLuotAi` không làm gì.
import { AsyncLocalStorage } from "node:async_hooks";

/** Một lượt gọi model: loại (để phát lại đúng chỗ), đầu ra thô. `ra.loi` = lượt đó ném lỗi (phát lại cũng ném). */
export type DongGhiAi = {
  kind: "create" | "parse";
  loai: string;
  ra: { po?: unknown; chu?: string; content?: unknown; stop_reason?: unknown; loi?: true };
};

const kho = new AsyncLocalStorage<DongGhiAi[]>();
/** Trần mỗi lượt: phát lại cần đủ, nhưng một vòng lặp hỏng không được đẩy cả MB vào DB. */
const TRAN_DONG = 40;

export function chayCoGhiAi<T>(so: DongGhiAi[], f: () => Promise<T>): Promise<T> {
  return kho.run(so, f);
}

// 13/10/2026 (chủ dự án: "phản hồi đúng rồi nhưng tốc độ hơi chậm, xem quy trình lại xem"): đồng hồ TỪNG LƯỢT GỌI MODEL — mốc bắt đầu
// (ms từ đầu lượt khách) + thời gian chạy, theo loại (`loaiLuotAi`). Đi vào `_ms.ai` của payload (sổ inbound, `ban-thu` in ra) để biết
// lượt chậm vì lượt AI nào, chạy nối tiếp hay song song. Mọi lượt (không chỉ ID thử), chỉ ghi số, không ghi nội dung.
type GioAi = { t0: number; luot: string[] };
const khoGio = new AsyncLocalStorage<GioAi>();
export function chayCoDoGio<T>(f: () => Promise<T>): Promise<T> {
  return khoGio.run({ t0: Date.now(), luot: [] }, f);
}
/** Các lượt model của lượt khách đang chạy: "loại bắt_đầu+thời_gian" (ms). Ngoài `chayCoDoGio` → []. */
export function gioAiHienTai(): string[] {
  return [...(khoGio.getStore()?.luot ?? [])];
}
function ghiGio(loai: string, bat: number, loi = false) {
  const g = khoGio.getStore();
  if (g && g.luot.length < TRAN_DONG) g.luot.push(`${loai} ${bat - g.t0}+${Date.now() - bat}${loi ? " lỗi" : ""}`);
}

type ThamSo = { system?: unknown; tools?: unknown };
// Dấu hiệu đầu system prompt của từng lượt AI. Bản ghi và bộ phát lại dùng CÙNG hàm này, nên đổi chữ đầu một prompt chỉ làm lượt cũ
// rơi về khoá dự phòng (chữ đầu system) — bộ phát lại báo "thiếu đầu ra", không âm thầm trả nhầm đầu ra của lượt khác.
const DAU_HIEU: Array<[string, RegExp]> = [
  ["chot_tin", /CHẾ ĐỘ CHỐT TIN/],
  ["boc_rao", /^BÓC TÁCH TIN NHẮN NGƯỜI BÁN/],
  ["doc_y_luot", /^Ý NGẮN CỦA LƯỢT/],
  ["soat_ban", /^SOÁT LỜI BOT GỬI CHỦ NHÀ/],
  ["soat_mua", /^SOÁT LỜI BOT GỬI NGƯỜI MUA/],
  ["gan_manh", /^GÁN MẢNH TIN NHẮN VÀO ĐÚNG CĂN/],
  ["phan_vai", /^PHÂN VAI TIN NHẮN ĐẦU TIÊN/],
  ["phan_loai_anh", /PHÂN LOẠI ẢNH CHỦ NHÀ GỬI/],
  ["boc_gan", /có muốn nhà ở GẦN/],
  ["boc_du_an", /^Bạn bóc thông tin về DỰ ÁN/],
  ["doc_tai_lieu", /^ĐỌC TÀI LIỆU DỰ ÁN/],
  ["khen_nhap", /^VIẾT CÂU KHEN BẢN NHÁP/],
];

export function loaiLuotAi(kind: "create" | "parse", p: ThamSo): string {
  if (p?.tools) return "tro_ly";
  const sys = Array.isArray(p?.system)
    ? (p.system as Array<{ text?: string }>).map((s) => s?.text ?? "").join("\n")
    : String(p?.system ?? "");
  const dau = sys.trimStart();
  for (const [ten, re] of DAU_HIEU) if (re.test(dau)) return ten;
  // Lượt VIẾT lời gửi khách (r1 / r2 / r2b / r3 / gọi lại cho đúng ô) — cùng một prompt hệ thống "Bạn là "<tên>", trợ lý…".
  if (kind === "create" && /^Bạn là\s/.test(dau)) return "viet";
  return `${kind}:${dau.replace(/\s+/g, " ").slice(0, 40)}`;
}

function raCua(kind: "create" | "parse", p: ThamSo, r: unknown): DongGhiAi["ra"] {
  const o = (r ?? {}) as { parsed_output?: unknown; content?: Array<{ type?: string; text?: string }>; stop_reason?: unknown };
  const chu = (o.content ?? []).filter((b) => b?.type === "text").map((b) => b.text ?? "").join("");
  if (kind === "parse") return o.parsed_output != null ? { po: o.parsed_output } : { chu };
  if (p?.tools) return { content: o.content ?? [], stop_reason: o.stop_reason ?? null };
  return { chu };
}

function ghi(dong: DongGhiAi) {
  const so = kho.getStore();
  if (so && so.length < TRAN_DONG) so.push(dong);
}

/** Bọc client model: mọi lượt create / parse đi qua đều được ghi (khi đang trong `chayCoGhiAi`). */
export function bocGhiAi<C>(c: C): C {
  if (!c) return c;
  const m = (c as unknown as { messages: { create: (p: unknown, o?: unknown) => Promise<unknown>; parse: (p: unknown, o?: unknown) => Promise<unknown> } }).messages;
  const boc = (kind: "create" | "parse") => async (p: ThamSo, o?: unknown) => {
    const bat = Date.now();
    try {
      const r = await m[kind](p, o);
      ghiGio(loaiLuotAi(kind, p), bat);
      ghi({ kind, loai: loaiLuotAi(kind, p), ra: raCua(kind, p, r) });
      return r;
    } catch (e) {
      ghiGio(loaiLuotAi(kind, p), bat, true);
      ghi({ kind, loai: loaiLuotAi(kind, p), ra: { loi: true } });
      throw e;
    }
  };
  return { ...(c as object), messages: { ...m, create: boc("create"), parse: boc("parse") } } as unknown as C;
}
