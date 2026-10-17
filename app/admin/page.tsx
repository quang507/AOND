"use client";
// Admin (FR-127): duyệt tin cho_thong_tin → dang_ban / ẩn (an) theo vòng đời
// FR-139 (cho_thong_tin → dang_ban → dang_quan_tam → da_chot). Quyền cấp theo
// bảng `admins` (email) — RLS phía DB mới là hàng rào thật, trang này chỉ là UI.
//
// 04/09/2026 — "admin buyer side" (FR-71/74/75/76/77/78/80, migration
// 20260904c): câu khách hỏi, lịch xem nhà, khách cần người thật, thống kê hội
// thoại 30 ngày + CSV, ô tìm khách. Mọi danh sách dài lật 20 mục/trang (FR-80).
// 08/09/2026 — Phân hệ CRM Khách Hàng Hai Vai (vừa mua vừa bán · gắn BĐS quan tâm · nhu cầu)
// và Tái cấu trúc Phân Cấp Giao Diện (Hierarchical Tabs & KPI Overview Cards).
import { canhBaoCache, giaCua, tongTien, tyLeDocCache, type DongToken } from "@/lib/gia-model";
import { Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase, type Listing } from "@/lib/supabase";
import { formatArea, formatPrice, sanitizeDescription, TYPE_LABEL } from "@/lib/format";
import UploadAnh from "@/components/UploadAnh";
import { Btn } from "@/components/ui";

// Tin chờ duyệt: chỉ các cột thẻ duyệt cần, không kéo "*".
type TinCho = Pick<
  Listing,
  "id" | "code" | "ward" | "price_vnd" | "price_raw" | "area_m2" | "description" | "location_raw" | "created_at"
>;

type Ng = {
  id: string;
  name: string | null;
  seller_type: string;
  active_count: number;
  closed_count: number;
  rank: string;
  // SRD §IV (05/10/2026, SRS-5.1zzd/zze/zzf): điểm người rao (50 % hoàn chỉnh + 50 % phản hồi), điểm phản hồi, đạt chuẩn NMG.
  diem_nguoi_rao?: number | null;
  diem_phan_hoi?: number | null;
  dat_chuan_nmg?: boolean | null;
};

type Tien = {
  day: string;
  model_calls: number;
  in_tokens: number;
  out_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
};

// 04/10/2026 (SRS-5.1zv): tiền tính theo TỪNG model từ `bot_usage_model` (ngày × model), bảng giá ở `lib/gia-model.ts`.
// Bản trước dùng một cặp hằng số giá Opus cho mọi token → cao hơn thật 1,7× (Sonnet) / 5× (Haiku), và tính tiền cả Groq/Gemini.
type TienModel = DongToken & { day: string };

// FR-192: quota tiêu hao — RPC `quota_tieu_hao()` gom bốn cái trần về một chỗ.
type Quota = {
  ngay: string;
  luot_hom_nay: number;
  tran_ngay: number;
  capped_at: string | null;
  token_hom_nay: number;
  tran_gio_nguoi: number;
  tran_ngay_nguoi: number;
  he_so_nguoi_quen: number;
  nguoi_dot_nhieu: { uid: string; trong_24h: number; trong_gio: number | null; nguoi_quen: boolean }[];
  so_nguoi_cham_tran: number;
  het_credit: boolean;
  credit_loi_24h: number;
  credit_lan_cuoi: string | null;
  // Lúc model CHÍNH trả lời được lần gần nhất (bot_health 'model_chinh').
  model_song_luc: string | null;
  co_du_phong: boolean;
  dang_chay_du_phong: boolean;
};

// FR-195: thông tin DỰ ÁN lượm được trong lúc chat, đang chờ người gật.
type FactDuAn = {
  id: number; project_id: string; du_an: string; quan: string | null;
  khoa: string; gia_tri: string; nguon: string; created_at: string; ma_tin: string | null;
};

type Viec = { id: string; kind: string; note: string | null; due_at: string; created_at: string };
type NguoiBan = {
  id: string; name: string | null; seller_type: string; created_at: string; zalo_user_id: string | null;
};
const NHAN: Record<string, string> = { ccrb: "Chính chủ · 1%", nmg: "Môi giới · 0,5%", unknown: "Chưa nhãn" };

const HANG: Record<string, { ten: string; lop: string }> = {
  vang: { ten: "Vàng", lop: "bg-[#f6c453] text-navy" },
  bac:  { ten: "Bạc",  lop: "bg-line text-navy" },
  dong: { ten: "Đồng", lop: "bg-[#e2c9b0] text-navy" },
  chua_du: { ten: "Chưa đủ dữ liệu", lop: "bg-line text-mute" },
};

// FR-173 e: hạng CTV theo tỷ lệ trả lời câu khách hỏi đúng hạn (view `ctv_ranks`).
type HangCtv = {
  id: string; name: string | null; active: boolean;
  tong: number; tra_loi: number; dung_han: number; tre: number;
  ty_le_dung_han: number | null; rank: string;
};

// ── Admin buyer side (04/09/2026) ────────────────────────────────────────────
type CauHoi = {
  id: string; question: string; status: string; answer: string | null; source: string | null;
  assignee: string | null; sla_due_at: string | null; answered_at: string | null; created_at: string;
  listings: { code: string | null } | null;
  ctvs: { name: string | null } | null;
  buyers: { name: string | null } | null;
};
type LichXem = {
  id: string; listing_code: string | null; time_text: string | null; slot: string | null;
  status: string; guide: string | null; source: string | null; created_at: string;
  listings: { code: string | null } | null;
  buyers: { name: string | null } | null;
};
type KhachCan = {
  conversation_id: string; vai: string; ten: string | null; zalo_user_id: string | null;
  needs_human_at: string; last_message_at: string | null; ctv_name: string | null;
  tin_khach_cuoi: string | null; tin_khach_cuoi_at: string | null;
};
type ThongKe = {
  ngay: string; hoi_thoai_khach_moi: number; hoi_thoai_ban_moi: number;
  tin_khach: number; tin_nguoi_ban: number; tin_bot: number; tin_nguoi_that: number;
  khach_moi: number; co_nguoi_that: number;
};
const COT_THONG_KE: (keyof ThongKe)[] = [
  "ngay", "hoi_thoai_khach_moi", "hoi_thoai_ban_moi", "tin_khach", "tin_nguoi_ban",
  "tin_bot", "tin_nguoi_that", "khach_moi", "co_nguoi_that",
];
// FR-74 & CRM: Hồ sơ khách hàng hai vai (Vừa mua vừa bán · Gắn BĐS quan tâm)
type TinCrm = {
  id: string;
  code: string | null;
  legacy_code: string | null;
  location_raw: string | null;
  price_raw: string | null;
  status: string | null;
  property_type: string | null;
  area_m2: number | null;
  district: string | null;
  ward: string | null;
};
type KhachCrm = {
  id: string;
  // 14/09/2026: `id` là id NGƯỜI MUA nếu có dòng buyers, không thì là id NGƯỜI BÁN. Trước
  // đó thẻ chỉ-người-bán vẫn hiện "Sửa nhu cầu" / "Gắn BĐS quan tâm" và gọi RPC người mua
  // bằng id người bán — bấm là hỏng. Cờ này quyết nút nào được hiện.
  la_nguoi_mua: boolean;
  name: string | null;
  zalo_user_id: string | null;
  phone: string | null;
  preferences: Record<string, unknown> | null;
  notes: string | null;
  last_contact_at: string | null;
  created_at: string;
  seller?: {
    id: string;
    seller_type: string;
    active_listing?: TinCrm | null;
  } | null;
  interests?: {
    listing_id: string;
    code: string | null;
    legacy_code: string | null;
    price_raw: string | null;
    location_raw: string | null;
  }[];
};
const TRANG_THAI_TIN: Record<string, string> = {
  cho_thong_tin: "chờ thông tin", dang_ban: "đang bán", dang_quan_tam: "đang quan tâm", da_chot: "đã chốt", an: "ẩn",
};
const TRANG_THAI_HOI: Record<string, string> = { pending: "đang chờ", answered: "đã trả lời" };
const TRANG_THAI_XEM: Record<string, string> = {
  proposed: "đề xuất", pending: "đã hẹn", done: "đã xem", cancelled: "đã huỷ",
};
const NGUOI_GIAO: Record<string, string> = { ctv: "CTV", seller: "chủ nhà", admin: "admin" };

type BdsHot = { listing_id: string; code: string | null; ward: string | null; so_su_kien_60d: number; last_event_at: string | null };
type DoTre = { so_luot: number | null; p50_giay: number | null; p95_giay: number | null; max_giay: number | null };
type GiayTo = { id: string; listing_id: string; storage_path: string; media_type: string; mime_type: string; created_at: string; listings: { code: string | null } | null };

const MOI_TRANG = 20;
function usePhanTrang<T>(xs: T[]) {
  const [trang, setTrang] = useState(1);
  const soTrang = Math.max(1, Math.ceil(xs.length / MOI_TRANG));
  const t = Math.min(trang, soTrang);
  return { trang: t, soTrang, tong: xs.length, setTrang, mot: xs.slice((t - 1) * MOI_TRANG, t * MOI_TRANG) };
}

// "Mở Zalo" từng trỏ `https://zalo.me/<zalo_user_id>` — bấm vào ra trang trắng
// "Tài khoản này không tồn tại hoặc không cho phép tìm kiếm" (chủ dự án bắt
// 10/09). `zalo_user_id` là ID NỘI BỘ của luồng chat (19 chữ số), không phải ID
// công khai; zalo.me chỉ mở được theo SỐ ĐIỆN THOẠI hoặc ID người dùng tự đặt.
// `chat.zalo.me/?uid=...` cũng không mở đúng cuộc trò chuyện — đã thử, nó bỏ
// qua tham số. Nên: có SĐT thì mở đúng người; không có thì mở Zalo Web để người
// trực tự tìm, và nói thẳng trên nút là nó chỉ mở Zalo chứ không mở đúng khách.
const soDienThoaiZalo = (phone: string | null) => {
  const so = (phone ?? "").replace(/\D/g, "");
  if (/^84\d{9}$/.test(so)) return `0${so.slice(2)}`;
  return /^0\d{9}$/.test(so) ? so : null;
};
const linkZalo = (uid: string | null, phone: string | null = null) => {
  const so = soDienThoaiZalo(phone);
  if (so) return `https://zalo.me/${so}`;
  return uid ? "https://chat.zalo.me/" : null;
};

// Khung CRM (09/09/2026): tab đi theo URL ?tab=todo|crm|stats|ops để thanh
// trên (AdminShell) và các link chia sẻ được. useSearchParams cần Suspense.
export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-16 text-mute font-medium">Đang mở bàn làm việc…</div>}>
      <BanLamViec />
    </Suspense>
  );
}

function BanLamViec() {
  const sp = useSearchParams();
  const tabUrl = sp.get("tab");
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [pending, setPending] = useState<TinCho[]>([]);
  const [counts, setCounts] = useState<{ tong: number; active: number; cho: number }>();
  const [health, setHealth] = useState<{
    beat: string | null;
    errs: { id: number; at: string; source: string; status_code: number | null; detail: string | null }[];
  }>();
  const [hang, setHang] = useState<Ng[]>([]);
  const [tien, setTien] = useState<Tien[]>([]);
  const [tienModel, setTienModel] = useState<TienModel[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [factDuAn, setFactDuAn] = useState<FactDuAn[]>([]);
  const [zaloDn, setZaloDn] = useState<DangNhapZalo | null>(null);
  const [viec, setViec] = useState<Viec[]>([]);
  const [nguoiBan, setNguoiBan] = useState<NguoiBan[]>([]);
  const [hangCtv, setHangCtv] = useState<HangCtv[]>([]);
  const [cauHoi, setCauHoi] = useState<CauHoi[]>([]);
  const [lichXem, setLichXem] = useState<LichXem[]>([]);
  const [khachCan, setKhachCan] = useState<KhachCan[]>([]);
  const [thongKe, setThongKe] = useState<ThongKe[]>([]);
  const [loi, setLoi] = useState<string[]>([]);

  // CRM Khách hàng & Hai vai
  const [danhSachCrm, setDanhSachCrm] = useState<KhachCrm[]>([]);
  const [qCrm, setQCrm] = useState("");
  const [crmFilterRole, setCrmFilterRole] = useState<"all" | "dual" | "buyer" | "seller">("all");
  const [dangGanBds, setDangGanBds] = useState<string | null>(null);
  const [maBdsGan, setMaBdsGan] = useState("");
  const [dangLuuBds, setDangLuuBds] = useState(false);
  const [suaNhuCauId, setSuaNhuCauId] = useState<string | null>(null);
  const [formNhuCau, setFormNhuCau] = useState({
    name: "",
    seller_type: "ccrb",
    area: "",
    property_type: "",
    deal: "ban",
    bedrooms: "",
    budget: "",
    notes: "",
  });

  // Điều hướng phân hệ giao diện (Tabs Hierarchy)
  const [activeTab, setActiveTab] = useState<"crm" | "todo" | "stats" | "ops">(
    tabUrl === "crm" || tabUrl === "stats" || tabUrl === "ops" ? tabUrl : "todo",
  );
  useEffect(() => {
    if (tabUrl === "crm" || tabUrl === "stats" || tabUrl === "ops" || tabUrl === "todo") setActiveTab(tabUrl);
  }, [tabUrl]);

  const [bdsHot, setBdsHot] = useState<BdsHot[] | null>(null);
  const [doTre, setDoTre] = useState<DoTre | null | undefined>(undefined);
  const [giayTo, setGiayTo] = useState<GiayTo[]>([]);
  const [loiPhu, setLoiPhu] = useState<Record<string, string>>({});
  const [dsMa, setDsMa] = useState("");
  const [dsTieuDe, setDsTieuDe] = useState("");
  const [dsKq, setDsKq] = useState<{ ok: boolean; text: string; path?: string } | null>(null);
  const [dangTaoDs, setDangTaoDs] = useState(false);
  const [daChep, setDaChep] = useState(false);
  const [upCho, setUpCho] = useState<string | null>(null);

  // Lọc CRM phía client theo cả vai trò lẫn từ khoá tìm kiếm
  const filteredCrm = useMemo(() => {
    let list = danhSachCrm;
    if (crmFilterRole === "dual") {
      list = list.filter((k) => !!k.seller && !!k.preferences);
    } else if (crmFilterRole === "buyer") {
      list = list.filter((k) => !k.seller && !!k.preferences);
    } else if (crmFilterRole === "seller") {
      list = list.filter((k) => !!k.seller && !k.preferences);
    }

    if (!qCrm.trim()) return list;
    const q = qCrm.toLowerCase().trim();
    return list.filter((k) => {
      const name = (k.name ?? "").toLowerCase();
      const zalo = (k.zalo_user_id ?? "").toLowerCase();
      const notes = (k.notes ?? "").toLowerCase();
      const p = k.preferences ?? {};
      const area = String(p.area ?? "").toLowerCase();
      const ptype = String(p.property_type ?? "").toLowerCase();
      const sellCode = (k.seller?.active_listing?.code ?? "").toLowerCase();
      const sellLeg = (k.seller?.active_listing?.legacy_code ?? "").toLowerCase();
      const intCodes = (k.interests ?? []).map((i) => `${i.code ?? ""} ${i.legacy_code ?? ""}`).join(" ").toLowerCase();
      return (
        name.includes(q) ||
        zalo.includes(q) ||
        notes.includes(q) ||
        area.includes(q) ||
        ptype.includes(q) ||
        sellCode.includes(q) ||
        sellLeg.includes(q) ||
        intCodes.includes(q)
      );
    });
  }, [danhSachCrm, qCrm, crmFilterRole]);

  const ptTin = usePhanTrang(pending);
  const ptNguoiBan = usePhanTrang(nguoiBan);
  const ptCauHoi = usePhanTrang(cauHoi);
  const ptLichXem = usePhanTrang(lichXem);
  const ptKhachCan = usePhanTrang(khachCan);
  const ptThongKe = usePhanTrang(thongKe);
  const ptCrm = usePhanTrang(filteredCrm);

  // FR-203: trạng thái đăng nhập acc Zalo clone + ảnh QR (bridge đẩy lên).
  // Tách khỏi `load()` để lúc chờ quét chỉ đọc lại đúng một dòng này.
  const taiDangNhap = async () => {
    const { data } = await supabase.from("bridge_dang_nhap")
      .select("trang_thai, qr_png, yeu_cau_quet_lai, ghi_chu, cap_nhat").eq("id", 1).maybeSingle();
    setZaloDn((data as DangNhapZalo | null) ?? null);
  };
  // Đang chờ quét thì đọc lại mỗi 4 giây: mã QR đổi mỗi ~100 giây, và quét
  // xong phải thấy "đã đăng nhập" ngay chứ không phải tự bấm tải lại trang.
  const theoDoiDn = role === "admin" && !!zaloDn &&
    (zaloDn.trang_thai !== "dang_nhap" || zaloDn.yeu_cau_quet_lai);
  useEffect(() => {
    if (!theoDoiDn) return;
    const t = setInterval(() => void taiDangNhap(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theoDoiDn]);
  // FR-210 (15/09/2026): xoá HÀNG LOẠT khách + rổ hàng để test lại từ đầu. Hai lớp chặn
  // bấm nhầm: hộp xác nhận nói rõ hậu quả, rồi phải GÕ đúng "XOA HET" — RPC cũng đòi
  // đúng chữ đó, nên gọi nhầm từ code cũng không xoá được. Không hoàn tác được (OPEN-25).
  const xoaHetKhachVaRoHang = async () => {
    const go = prompt(
      "XOÁ HÀNG LOẠT: mọi khách mua, người bán, tin rao, ảnh, hội thoại, câu hỏi, lịch hẹn, giao dịch.\n" +
      "GIỮ: kho dự án, phường, CTV, admin, cấu hình, prompt, mẫu câu chuẩn, sổ lỗi.\n" +
      "Trước khi xoá, mọi dòng được CHÉP vào kho lưu (luu_tru) — khôi phục được bằng nút \"Khôi phục lần xoá\".\n\nGõ đúng chữ XOA HET để xoá:",
    );
    if (go === null) return;
    if (go.trim() !== "XOA HET") { alert("Chưa xoá: phải gõ đúng chữ XOA HET."); return; }
    const { data, error } = await supabase.rpc("admin_xoa_het_khach_va_ro_hang", { p_xac_nhan: "XOA HET" });
    if (error) { alert(`Không xoá được: ${error.message}`); return; }
    const d = (data ?? {}) as Record<string, number>;
    alert(
      `Đã xoá: ${d.sellers ?? 0} người bán · ${d.buyers ?? 0} khách mua · ${d.listings ?? 0} tin · ` +
      `${d.messages ?? 0} tin nhắn · ${d.conversations ?? 0} hội thoại · ${d.reminders ?? 0} việc nhắc.\n` +
      `Đã chép vào kho lưu: lần số ${d.luu_tru_lan ?? "?"} (khôi phục được).`,
    );
    await load();
  };
  // FR-245 (29/09/2026, chủ dự án: "xóa data để test thì data thật cũng nên để sang 1 chỗ"): khôi phục một lần "Xoá hết"
  // từ kho lưu `luu_tru`. Dòng đã có thì bỏ qua, bấm hai lần không nhân đôi.
  const khoiPhucLanXoa = async () => {
    const lan = prompt("Khôi phục lần xoá số mấy? (số hiện trong thông báo lúc xoá)");
    if (lan === null) return;
    if (!/^\d+$/.test(lan.trim())) { alert("Chưa khôi phục: phải nhập một số."); return; }
    const { data, error } = await supabase.rpc("admin_khoi_phuc_lan_xoa", { p_lan: Number(lan.trim()) });
    if (error) { alert(`Không khôi phục được: ${error.message}`); return; }
    const d = (data ?? {}) as Record<string, number>;
    alert(`Đã khôi phục: ${d.sellers ?? 0} người bán · ${d.buyers ?? 0} khách mua · ${d.listings ?? 0} tin · ${d.messages ?? 0} tin nhắn.`);
    await load();
  };
  const dangNhapLaiZalo = async () => {
    if (!confirm(
      "Đăng nhập lại acc Zalo clone?\n\nBridge sẽ bỏ phiên hiện tại (trong ≤ 5 phút) rồi hiện mã QR mới ở đây để quét. " +
      "Trong lúc chờ quét, bot KHÔNG nhận và gửi được tin Zalo.",
    )) return;
    const { error } = await supabase.rpc("yeu_cau_quet_lai_zalo");
    if (error) { alert(`Không gửi được yêu cầu: ${error.message}`); return; }
    await taiDangNhap();
  };

  const load = async () => {
    void taiDangNhap();
    const d7 = new Date(Date.now() - 7 * 86400e3).toISOString();
    const [pend, st, beatRes, errRes, tn, vc, nb, hg, hc, ch, lx, kc, tk, hot, tre, gt, buyRes, intRes, qtRes, pfRes, tmRes] = await Promise.all([
      supabase
        .from("listings")
        .select("id, code, ward, price_vnd, price_raw, area_m2, description, location_raw, created_at")
        .eq("status", "cho_thong_tin")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("listings").select("status"),
      supabase.from("bot_health").select("at").eq("who", "bridge-zca").maybeSingle(),
      supabase.from("bot_errors").select("id, at, source, status_code, detail")
        .order("at", { ascending: false }).limit(10),
      supabase
        .from("bot_usage")
        .select("day, model_calls, in_tokens, out_tokens, cache_write_tokens, cache_read_tokens")
        .order("day", { ascending: false }).limit(7),
      supabase.from("reminders")
        .select("id, kind, note, due_at, created_at")
        .eq("status", "pending").in("kind", ["escalation", "report"])
        .order("created_at", { ascending: false }).limit(30),
      supabase.from("sellers")
        .select("id, name, seller_type, created_at, zalo_user_id, phone, active_listing_id, listings:active_listing_id(id, code, legacy_code, location_raw, price_raw, status, property_type, area_m2, district, ward)")
        .order("created_at", { ascending: false }).limit(100),
      supabase
        .from("seller_ranks")
        .select("id, name, seller_type, active_count, closed_count, rank, diem_nguoi_rao, diem_phan_hoi, dat_chuan_nmg")
        .order("active_count", { ascending: false }).limit(50),
      supabase
        .from("ctv_ranks")
        .select("id, name, active, tong, tra_loi, dung_han, tre, ty_le_dung_han, rank")
        .order("name").limit(20),
      supabase
        .from("info_requests")
        .select("id, question, status, answer, source, assignee, sla_due_at, answered_at, created_at, listings(code), ctvs(name), buyers(name)")
        .in("status", ["pending", "answered"])
        .order("created_at", { ascending: false }).limit(100),
      supabase
        .from("viewings")
        .select("id, listing_code, time_text, slot, status, guide, source, created_at, listings(code), buyers(name)")
        .or(`slot.gte.${d7},and(slot.is.null,created_at.gte.${d7})`)
        .order("created_at", { ascending: false, nullsFirst: false }).limit(100),
      supabase
        .from("khach_can_nguoi_that")
        .select("conversation_id, vai, ten, zalo_user_id, needs_human_at, last_message_at, ctv_name, tin_khach_cuoi, tin_khach_cuoi_at")
        .order("needs_human_at", { ascending: false }).limit(100),
      supabase
        .from("hoi_thoai_thong_ke")
        .select("ngay, hoi_thoai_khach_moi, hoi_thoai_ban_moi, tin_khach, tin_nguoi_ban, tin_bot, tin_nguoi_that, khach_moi, co_nguoi_that")
        .order("ngay", { ascending: false }),
      supabase.from("bds_hot").select("listing_id, code, ward, so_su_kien_60d, last_event_at")
        .order("so_su_kien_60d", { ascending: false }).limit(20),
      supabase.from("bot_do_tre").select("so_luot, p50_giay, p95_giay, max_giay").maybeSingle(),
      supabase.from("listing_media")
        .select("id, listing_id, storage_path, media_type, mime_type, created_at, listings(code)")
        .eq("bucket", "listing-private").order("created_at", { ascending: false }).limit(100),
      supabase
        .from("buyers")
        // NFR-07 / FR-74 / SRS-3.11: KHÔNG chọn `buyers.phone`. Số của người mua
        // chỉ có khi B tự đưa ở bước chốt lịch xem, và cam kết với B là web
        // không đọc nó — nút "Mở Zalo" bên dưới chỉ dùng SĐT phía NGƯỜI BÁN
        // (FR-175, quyết định chủ dự án 07/09), khách B thì mở Zalo Web.
        .select("id, name, zalo_user_id, preferences, notes, last_contact_at, created_at")
        .order("created_at", { ascending: false }).limit(100),
      supabase
        .from("interests")
        .select("buyer_id, listing_id, listings(id, code, legacy_code, location_raw, price_raw, status)"),
      // FR-192: chỉ admin gọi được (hàm tự kiểm la_admin); lỗi thì để null, không làm vỡ trang.
      supabase.rpc("quota_tieu_hao"),
      // FR-195: hàng chờ duyệt thông tin dự án.
      supabase.from("project_facts_cho_duyet").select("*").limit(50),
      // SRS-5.1zv: chữ-máy theo ngày × model (7 ngày), để quy ra đô đúng giá từng model.
      supabase
        .from("bot_usage_model")
        .select("day, model, calls, in_tokens, out_tokens, cache_write_tokens, cache_read_tokens")
        .gte("day", d7.slice(0, 10)).order("day", { ascending: false }),
    ]);
    setTienModel(tmRes.error ? [] : ((tmRes.data ?? []) as TienModel[]));
    setFactDuAn(pfRes.error ? [] : ((pfRes.data ?? []) as FactDuAn[]));
    setQuota(qtRes.error ? null : ((qtRes.data as Quota | null) ?? null));
    setBdsHot(hot.error ? null : ((hot.data ?? []) as BdsHot[]));
    setDoTre(tre.error ? null : ((tre.data as DoTre | null) ?? null));
    setGiayTo((gt.data ?? []) as unknown as GiayTo[]);
    setLoiPhu({
      ...(hot.error ? { bds_hot: hot.error.message } : {}),
      ...(tre.error ? { bot_do_tre: tre.error.message } : {}),
      ...(gt.error ? { giay_to: gt.error.message } : {}),
      ...(qtRes.error ? { quota: qtRes.error.message } : {}),
    });

    setPending((pend.data ?? []) as TinCho[]);
    setHealth({
      beat: beatRes.data?.at ?? null,
      errs: (errRes.data ?? []) as { id: number; at: string; source: string; status_code: number | null; detail: string | null }[],
    });
    setTien((tn.data ?? []) as Tien[]);
    setViec((vc.data ?? []) as Viec[]);
    setNguoiBan((nb.data ?? []) as unknown as NguoiBan[]);
    setHang((hg.data ?? []) as Ng[]);
    setHangCtv((hc.data ?? []) as HangCtv[]);
    setCauHoi((ch.data ?? []) as unknown as CauHoi[]);
    setLichXem((lx.data ?? []) as unknown as LichXem[]);
    setKhachCan((kc.data ?? []) as KhachCan[]);
    setThongKe((tk.data ?? []) as ThongKe[]);

    const rows = st.data ?? [];
    setCounts({
      tong: rows.length,
      active: rows.filter((r) => r.status === "dang_ban").length,
      cho: rows.filter((r) => r.status === "cho_thong_tin").length,
    });

    // Xử lý dữ liệu CRM
    type RawSeller = {
      id: string;
      name: string | null;
      seller_type: string;
      zalo_user_id: string | null;
      phone: string | null;
      created_at: string;
      listings?: TinCrm | null;
    };
    type RawBuyer = {
      id: string;
      name: string | null;
      zalo_user_id: string | null;
      preferences: Record<string, unknown> | null;
      notes: string | null;
      last_contact_at: string | null;
      created_at: string;
    };
    type RawInterest = {
      buyer_id: string;
      listing_id: string;
      listings?: {
        id: string;
        code: string | null;
        legacy_code: string | null;
        location_raw: string | null;
        price_raw: string | null;
        status: string | null;
      } | null;
    };

    const rawBuyers = (buyRes.data ?? []) as RawBuyer[];
    const rawSellers = (nb.data ?? []) as unknown as RawSeller[];
    const rawInterests = (intRes.data ?? []) as unknown as RawInterest[];

    const crmItems: KhachCrm[] = [];
    const seenZalo = new Set<string>();

    for (const b of rawBuyers) {
      if (b.zalo_user_id) seenZalo.add(b.zalo_user_id);
      const s = b.zalo_user_id ? rawSellers.find((x) => x.zalo_user_id === b.zalo_user_id) : null;
      const bInts = rawInterests
        .filter((i) => i.buyer_id === b.id)
        .map((i) => ({
          listing_id: i.listing_id,
          code: i.listings?.code ?? null,
          legacy_code: i.listings?.legacy_code ?? null,
          price_raw: i.listings?.price_raw ?? null,
          location_raw: i.listings?.location_raw ?? null,
        }));

      crmItems.push({
        id: b.id,
        la_nguoi_mua: true,
        name: b.name || s?.name || null,
        zalo_user_id: b.zalo_user_id,
        phone: s?.phone ?? null,
        preferences: b.preferences,
        notes: b.notes,
        last_contact_at: b.last_contact_at,
        created_at: b.created_at,
        seller: s
          ? {
              id: s.id,
              seller_type: s.seller_type,
              active_listing: s.listings ?? null,
            }
          : null,
        interests: bInts,
      });
    }

    for (const s of rawSellers) {
      if (s.zalo_user_id && seenZalo.has(s.zalo_user_id)) continue;
      crmItems.push({
        id: s.id,
        la_nguoi_mua: false,
        name: s.name,
        zalo_user_id: s.zalo_user_id,
        phone: s.phone ?? null,
        preferences: null,
        notes: null,
        last_contact_at: null,
        created_at: s.created_at,
        seller: {
          id: s.id,
          seller_type: s.seller_type,
          active_listing: s.listings ?? null,
        },
        interests: [],
      });
    }

    // Sắp xếp CRM theo thời gian từ mới đến cũ
    crmItems.sort((a, b) => {
      const tA = new Date(a.created_at).getTime() || 0;
      const tB = new Date(b.created_at).getTime() || 0;
      return tB - tA;
    });

    setDanhSachCrm(crmItems);

    setLoi(
      [["câu hỏi", ch.error], ["lịch xem", lx.error], ["khách cần người thật", kc.error], ["thống kê", tk.error], ["người mua", buyRes.error]]
        .filter(([, e]) => e)
        .map(([ten, e]) => `${ten as string}: ${(e as { message: string }).message}`),
    );
  };

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setRole("anon");
      const { data: a } = await supabase
        .from("admins").select("email").eq("email", user.email ?? "").maybeSingle();
      if (!a) return setRole("user");
      setRole("admin");
      load();
    });
  }, []);

  const dongViec = async (id: string) => {
    const { error } = await supabase.from("reminders")
      .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    if (!error) setViec((v) => v.filter((x) => x.id !== id));
  };
  const doiNhan = async (id: string, seller_type: "ccrb" | "nmg") => {
    const { error } = await supabase.from("sellers").update({ seller_type }).eq("id", id);
    if (!error) setNguoiBan((l) => l.map((s) => (s.id === id ? { ...s, seller_type } : s)));
  };

  // 14/09/2026 (chủ dự án: "luồng xoá và sửa tin vẫn chưa logic"; soát ISO 9241-110): hàng chờ
  // duyệt từng có "Duyệt - cho rao" đưa tin lên web MỘT cú bấm và "Xoá tin" xoá cứng. Nay rao chỉ
  // qua màn Sửa của rổ hàng (nhìn đủ tin rồi mới rao), xoá vĩnh viễn cũng ở đó; ở đây còn "Ẩn".
  const anTin = async (id: string, code: string | null) => {
    if (!confirm(`Ẩn tin #${code ?? ""}? Tin rời hàng chờ duyệt, vẫn còn trong rổ hàng.`)) return;
    const { error } = await supabase.from("listings").update({ status: "an" }).eq("id", id);
    if (error) alert(`Chưa ẩn được #${code ?? ""}: ${error.message}`);
    else setPending((p) => p.filter((l) => l.id !== id));
  };

  // CRM: Gắn BĐS quan tâm cho khách
  const ganBdsQuanTam = async (buyerId: string) => {
    if (!maBdsGan.trim()) return;
    setDangLuuBds(true);
    const { data, error } = await supabase.rpc("admin_gan_bds_quan_tam", {
      p_buyer_id: buyerId,
      p_code: maBdsGan.trim(),
    });
    setDangLuuBds(false);
    if (error || (data && !data.ok)) {
      alert(error?.message || data?.error || "Lỗi gắn BĐS quan tâm");
    } else {
      setMaBdsGan("");
      setDangGanBds(null);
      load();
    }
  };

  // CRM: Gỡ BĐS quan tâm
  const xoaBdsQuanTam = async (buyerId: string, listingId: string) => {
    if (!confirm("Gỡ BĐS quan tâm này khỏi khách?")) return;
    const { error } = await supabase.rpc("admin_xoa_bds_quan_tam", {
      p_buyer_id: buyerId,
      p_listing_id: listingId,
    });
    if (error) alert(error.message);
    else load();
  };

  // CRM: Mở form sửa nhu cầu
  const moSuaNhuCau = (k: KhachCrm) => {
    const p = k.preferences ?? {};
    setSuaNhuCauId(k.id);
    setFormNhuCau({
      name: k.name ?? "",
      seller_type: k.seller?.seller_type === "nmg" ? "nmg" : "ccrb",
      area: String(p.area ?? ""),
      property_type: String(p.property_type ?? ""),
      deal: String(p.deal ?? "ban"),
      bedrooms: p.bedrooms != null ? String(p.bedrooms) : "",
      budget: String(p.budget ?? ""),
      notes: k.notes ?? String(p.notes ?? ""),
    });
  };

  // CRM: Lưu cập nhật nhu cầu khách
  const luuSuaNhuCau = async (k: KhachCrm) => {
    const ten = formNhuCau.name.trim() || null;
    // Người bán (tên + vai) — bảng sellers, admin sửa thẳng được qua RLS (như doiNhan).
    if (k.seller) {
      const { error } = await supabase.from("sellers")
        .update({ name: ten, seller_type: formNhuCau.seller_type }).eq("id", k.seller.id);
      if (error) return alert(`Lỗi lưu người bán: ${error.message}`);
    }
    if (k.la_nguoi_mua) {
      // 14/09/2026: RPC GHI ĐÈ cả cục preferences. Bản cũ gửi mỗi 6 ô trong form, nên một
      // lần bấm "Lưu" xoá sạch thứ bot đã lưu mà form không hiện: tên trợ lý (FR-181), cách
      // gọi khách, điều kiện gần tiện ích, cờ gấp, mục đích, thời hạn. Nay trộn lên hồ sơ cũ;
      // ô để trống thì GỠ đúng trường đó.
      const o = (v: string) => v.trim() || null;
      const prefs: Record<string, unknown> = {
        ...(k.preferences ?? {}),
        area: o(formNhuCau.area),
        property_type: o(formNhuCau.property_type),
        deal: o(formNhuCau.deal),
        bedrooms: formNhuCau.bedrooms.trim() ? Number(formNhuCau.bedrooms.trim()) || null : null,
        budget: o(formNhuCau.budget),
        notes: o(formNhuCau.notes),
      };
      for (const [x, v] of Object.entries(prefs)) if (v === null) delete prefs[x];
      const { data, error } = await supabase.rpc("admin_cap_nhat_khach", {
        p_buyer_id: k.id,
        p_preferences: prefs,
        p_notes: o(formNhuCau.notes),
      });
      if (error || (data && !data.ok)) return alert(error?.message || "Lỗi lưu nhu cầu khách");
      if (ten !== (k.name ?? null)) {
        const { error: e2 } = await supabase.from("buyers").update({ name: ten }).eq("id", k.id);
        if (e2) return alert(`Lỗi lưu tên khách: ${e2.message}`);
      }
    }
    setSuaNhuCauId(null);
    load();
  };

  const taoDs = async (e: FormEvent) => {
    e.preventDefault();
    const ma = dsMa.split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean);
    if (!ma.length) return setDsKq({ ok: false, text: "Chưa có mã tin nào." });
    setDangTaoDs(true); setDsKq(null); setDaChep(false);
    const { data, error } = await supabase.rpc("tao_danh_sach", { p_listing_codes: ma, p_title: dsTieuDe || null });
    setDangTaoDs(false);
    if (error) return setDsKq({ ok: false, text: error.message });
    const r = data as { path: string; n: number; expires_at: string };
    setDsKq({ ok: true, path: r.path, text: `${r.n} tin · sống tới ${new Date(r.expires_at).toLocaleDateString("vi-VN")}` });
  };
  const chepLink = async (path: string) => {
    try { await navigator.clipboard.writeText(`${location.origin}${path}`); setDaChep(true); }
    catch { setDsKq((k) => (k ? { ...k, text: `${k.text} - không chép được, bôi đen link mà copy` } : k)); }
  };

  const xemGiayTo = async (g: GiayTo) => {
    const { data, error } = await supabase.storage.from("listing-private").createSignedUrl(g.storage_path, 900);
    if (error || !data?.signedUrl) {
      setLoi((l) => [...l, `giấy tờ #${g.listings?.code ?? "?"}: ${error?.message ?? "không ký được URL"}`]);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const taiCsv = () => {
    const dong = [
      COT_THONG_KE.join(","),
      ...thongKe.map((r) => COT_THONG_KE.map((c) => String(r[c])).join(",")),
    ];
    const blob = new Blob(["\uFEFF" + dong.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hoi-thoai-30-ngay-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (role === "loading") return <div className="mx-auto max-w-4xl px-4 py-16 text-mute font-medium">Đang kiểm tra quyền quản trị…</div>;
  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-navy">Khu vực quản trị</h1>
        <p className="mt-2 text-mute text-sm">
          {role === "anon" ? "Cần đăng nhập bằng tài khoản quản trị." : "Tài khoản này không có quyền quản trị."}
        </p>
        {role === "anon" && (
          <Link href="/dang-nhap" className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 font-bold text-white hover:bg-brand-dark transition">
            Đăng nhập
          </Link>
        )}
      </div>
    );
  }

  const now = Date.now();
  const tongTK = thongKe.reduce(
    (s, r) => ({
      hoi_thoai: s.hoi_thoai + r.hoi_thoai_khach_moi,
      tin_khach: s.tin_khach + r.tin_khach,
      tin_bot: s.tin_bot + r.tin_bot,
      tin_nguoi_that: s.tin_nguoi_that + r.tin_nguoi_that,
      khach_moi: s.khach_moi + r.khach_moi,
      co: s.co + r.co_nguoi_that,
    }),
    { hoi_thoai: 0, tin_khach: 0, tin_bot: 0, tin_nguoi_that: 0, khach_moi: 0, co: 0 },
  );

  const cauHoiCho = cauHoi.filter((c) => c.status === "pending").length;
  const lichSapToi = lichXem.filter(
    (v) => v.slot && new Date(v.slot).getTime() >= now && v.status !== "cancelled",
  ).length;
  const canXuLy = pending.length + khachCan.length + cauHoiCho + viec.length;
  const cauHoiQuaHan = cauHoi.filter(
    (c) => c.status === "pending" && !!c.sla_due_at && new Date(c.sla_due_at).getTime() < now,
  ).length;

  const dualCount = danhSachCrm.filter((k) => !!k.seller && !!k.preferences).length;
  const buyerCount = danhSachCrm.filter((k) => !k.seller && !!k.preferences).length;
  const sellerCount = danhSachCrm.filter((k) => !!k.seller && !k.preferences).length;
  const bridgeSong = health?.beat ? Math.round((now - new Date(health.beat).getTime()) / 60000) <= 15 : false;
  // FR-203 f: "Đang trực" nghĩa là bot NHẬN VÀ GỬI được tin — không chỉ là bridge
  // còn gõ cửa. Bridge đang chờ quét QR vẫn gõ cửa đều (mỗi lần đẩy mã QR lên là
  // một nhịp tim), nên thẻ nhìn nhịp tim một mình đã báo "Đang trực" xanh đúng
  // lúc Zalo clone chết (11/09 — chủ dự án chụp màn hình hỏi lại).
  const zaloChet = !!zaloDn && (zaloDn.trang_thai !== "dang_nhap" || zaloDn.yeu_cau_quet_lai);
  const botLoi = !health
    ? null
    : !bridgeSong
    ? health.beat ? "Bridge im quá 15 phút" : "Bridge chưa từng gõ cửa"
    : zaloChet && zaloDn
    // Giữ nguyên hoa/thường của nhãn: hạ hết thành chữ thường là ra "mã qr".
    ? `Zalo clone: ${NHAN_DANG_NHAP[zaloDn.trang_thai] ?? zaloDn.trang_thai}`
    : quota?.het_credit && !quota.co_du_phong
    ? "Model không gọi được (hết số dư)"
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8">
      {/* ═══ ĐẦU TRANG & LỐI TẮT ═══ */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-brand/10 text-brand px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">
              Quản trị
            </span>
            <span className="text-xs text-mute font-medium">AI Ơi Nhà Đất</span>
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">Bàn làm việc Quản trị</h1>
          <p className="mt-1 text-sm text-mute tabular-nums">
            {counts
              ? `${counts.tong} tin trong rổ · ${counts.active} đang rao · ${counts.cho} chờ duyệt`
              : "đang đọc rổ hàng…"}
          </p>
        </div>
        <p className="text-xs text-mute">Chuyển phân hệ bằng thanh trên; thẻ dưới đây cũng bấm được.</p>
      </header>

      {loi.length > 0 && (
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-brand">
          Không đọc được: {loi.join(" · ")}
        </div>
      )}

      {/* FR-192: model chết vì hết số dư / chạm trần thì bot VẪN trả lời bằng câu
          mẫu tiền định — nhìn hội thoại không thấy khác, nên phải kêu ở đây. */}
      {quota && (quota.het_credit || quota.capped_at) && (
        <div className="mt-4 rounded-xl border-2 border-brand bg-brand/10 px-4 py-3 text-sm">
          <p className="font-bold text-brand">
            {quota.het_credit
              ? quota.co_du_phong
                // 10/09: băng cũ viết "KHÔNG gọi được" trong khi bot vẫn trả lời
                // bằng model dự phòng — chủ dự án nhìn màn hình hỏi ngay "có cả
                // groq rồi mà nhỉ". Băng nói sai trạng thái thì lần sau không ai
                // tin nó nữa.
                ? "Model chính hết số dư — bot đang chạy bằng model dự phòng."
                : "Model đang KHÔNG gọi được: tài khoản Anthropic hết số dư, chưa có đường dự phòng."
              : "Bot đã chạm trần lượt gọi model trong ngày và tạm dừng gọi model."}
          </p>
          <p className="mt-1 text-navy">
            {quota.het_credit
              ? `${quota.credit_loi_24h} lượt bị từ chối trong 24 giờ qua, gần nhất ${new Date(quota.credit_lan_cuoi ?? Date.now()).toLocaleString("vi-VN")}. `
              : `Dấu chạm trần lúc ${new Date(quota.capped_at ?? Date.now()).toLocaleString("vi-VN")}. `}
            {quota.co_du_phong
              ? "Bot vẫn nói chuyện bình thường bằng model dự phòng; chất lượng có thể nhỉnh kém hơn một chút. Nạp tiền cho tài khoản chính là về như cũ."
              : "Bot vẫn trả lời khách bằng câu mẫu tiền định nên hội thoại trông như thường — đừng đọc giọng bot để chấm chất lượng lúc này."}
          </p>
        </div>
      )}

      {/* FR-203 f: Zalo clone chết thì ô mã QR lên NGAY ĐẦU TRANG, ở mọi tab — lúc
          này bot không nhận, không gửi được tin Zalo nào, không được để nó nằm
          khuất dưới đáy tab Vận hành. */}
      {zaloChet && (
        <div className="mt-4 rounded-2xl border-2 border-brand bg-white p-6">
          <TheZaloClone dn={zaloDn} onDangNhapLai={dangNhapLaiZalo} />
        </div>
      )}

      {/* ═══ TỔNG QUAN HỆ THỐNG (KPI OVERVIEW CARDS) ═══ */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Khách CRM */}
        <button
          type="button"
          onClick={() => { setActiveTab("crm"); history.replaceState(null, "", "/admin?tab=crm"); }}
          className={`text-left rounded-2xl p-4 border transition-all ${
            activeTab === "crm"
              ? "border-brand bg-brand/5 shadow ring-2 ring-brand/20"
              : "border-line bg-white hover:border-brand/40 hover:"
          }`}
        >
          <div className="text-xs font-semibold text-mute flex items-center justify-between">
            <span>Khách hàng CRM</span>
            <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
              {dualCount} hai vai
            </span>
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-navy">{danhSachCrm.length}</div>
          <div className="mt-1 text-xs text-mute truncate">
            {dualCount > 0 ? `${dualCount} vừa mua vừa bán · ` : ""}{buyerCount} mua/thuê
          </div>
        </button>

        {/* Card 2: Việc cần xử lý */}
        <button
          type="button"
          onClick={() => { setActiveTab("todo"); history.replaceState(null, "", "/admin?tab=todo"); }}
          className={`text-left rounded-2xl p-4 border transition-all ${
            activeTab === "todo"
              ? "border-brand bg-brand/5 shadow ring-2 ring-brand/20"
              : "border-line bg-white hover:border-brand/40 hover:"
          }`}
        >
          <div className="text-xs font-semibold text-mute flex items-center justify-between">
            <span>Cần xử lý</span>
            {canXuLy > 0 ? (
              <span className="rounded bg-brand text-white text-[10px] font-bold px-2 py-0.5">
                {canXuLy} việc
              </span>
            ) : (
              <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                sạch
              </span>
            )}
          </div>
          <div className={`mt-2 text-3xl font-bold tracking-tight ${canXuLy > 0 ? "text-brand" : "text-navy"}`}>
            {canXuLy}
          </div>
          <div className="mt-1 text-xs text-mute truncate">
            {pending.length} tin chờ · {khachCan.length} cần người thật
          </div>
        </button>

        {/* Card 3: Rổ hàng */}
        <Link
          href="/admin/ro-hang"
          className="text-left rounded-2xl p-4 border border-line bg-white hover:border-brand/40 hover: transition-all block group"
        >
          <div className="text-xs font-semibold text-mute flex items-center justify-between">
            <span>Rổ hàng BĐS</span>
            <span className="text-[10px] text-brand font-semibold group-hover:underline">Xem bảng</span>
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-navy">
            {counts?.active ?? "-"}
          </div>
          <div className="mt-1 text-xs text-mute truncate">
            đang rao · {counts?.cho ?? 0} chờ duyệt · {counts?.tong ?? "-"} tổng
          </div>
        </Link>

        {/* Card 4: Trạng thái Bot */}
        <button
          type="button"
          onClick={() => { setActiveTab("ops"); history.replaceState(null, "", "/admin?tab=ops"); }}
          className={`text-left rounded-2xl p-4 transition-all ${
            botLoi
              ? "border-2 border-brand bg-brand/5"
              : activeTab === "ops"
              ? "border border-brand bg-brand/5 shadow ring-2 ring-brand/20"
              : "border border-line bg-white hover:border-brand/40 hover:"
          }`}
        >
          <div className="text-xs font-semibold text-mute flex items-center justify-between">
            <span>Trợ lý AI Bot</span>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${botLoi || !health ? "bg-brand" : "bg-emerald-500"}`} />
          </div>
          <div className={`mt-2 text-xl font-bold tracking-tight ${botLoi ? "text-brand" : "text-navy"}`}>
            {!health ? "Đang đọc…" : botLoi ? "Đang lỗi" : "Đang trực"}
          </div>
          <div className={`mt-1 text-xs truncate ${botLoi ? "font-bold text-brand" : "text-mute"}`}>
            {botLoi ?? `p50: ${Math.round((doTre?.p50_giay ?? 0) * 1000)}ms · ${health?.errs.length ?? 0} lỗi`}
          </div>
        </button>
      </div>

      {/* Thanh chuyển phân hệ nằm trên khung CRM (AdminShell) - 09/09/2026 */}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 1: CRM KHÁCH HÀNG & HAI VAI
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "crm" && (
        <section className="mt-6 space-y-6">
          <div className="rounded-2xl border border-line bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-navy">
                  Hồ sơ Khách hàng & Phân hệ Hai Vai
                </h2>
                <p className="text-xs text-mute mt-0.5">
                  Quản lý hồ sơ khách mua/thuê, người bán, khách hai vai (vừa mua vừa bán), nhu cầu tìm kiếm và BĐS quan tâm
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-mute">
                  Hiển thị {filteredCrm.length} / {danhSachCrm.length} hồ sơ
                </span>
                {/* FR-210: xoá hàng loạt để test lại — chỉ admin, phải gõ XOA HET */}
                <button
                  type="button"
                  onClick={() => void xoaHetKhachVaRoHang()}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                  title="Xoá mọi khách, người bán và tin rao để test lại từ đầu. Dữ liệu được chép vào kho lưu trước khi xoá."
                >
                  Xoá hàng loạt
                </button>
                {/* FR-245: khôi phục một lần xoá hàng loạt từ kho lưu luu_tru */}
                <button
                  type="button"
                  onClick={() => void khoiPhucLanXoa()}
                  className="rounded-md border border-line bg-white px-3 py-1 text-xs font-bold text-ink hover:bg-line/30"
                  title="Chép lại dữ liệu của một lần Xoá hàng loạt từ kho lưu."
                >
                  Khôi phục lần xoá
                </button>
              </div>
            </div>

            {/* Role Filter Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
              <span className="text-xs font-bold text-mute mr-1">Bộ lọc:</span>
              <button
                type="button"
                onClick={() => setCrmFilterRole("all")}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                  crmFilterRole === "all" ? "bg-navy text-white" : "bg-line/60 text-navy hover:bg-line"
                }`}
              >
                Tất cả ({danhSachCrm.length})
              </button>
              <button
                type="button"
                onClick={() => setCrmFilterRole("dual")}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                  crmFilterRole === "dual"
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                Vừa mua vừa bán ({dualCount})
              </button>
              <button
                type="button"
                onClick={() => setCrmFilterRole("buyer")}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                  crmFilterRole === "buyer"
                    ? "bg-blue-700 text-white"
                    : "bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                }`}
              >
                Khách mua / thuê ({buyerCount})
              </button>
              <button
                type="button"
                onClick={() => setCrmFilterRole("seller")}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                  crmFilterRole === "seller"
                    ? "bg-amber-700 text-white"
                    : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                }`}
              >
                Chính chủ bán ({sellerCount})
              </button>
            </div>

            {/* Search Input */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <input
                  value={qCrm}
                  onChange={(e) => setQCrm(e.target.value)}
                  placeholder="Lọc theo tên (vd: Thu Ngô), Zalo UID, khu vực, mã BĐS rao hoặc quan tâm…"
                  className="w-full rounded-md border border-line px-4 py-2 text-sm outline-none focus:border-brand pl-9 bg-slate-50/50"
                />
                </div>
              {qCrm && (
                <button
                  type="button"
                  onClick={() => setQCrm("")}
                  className="rounded-md border border-line px-3.5 py-1.5 text-xs text-mute transition hover:border-brand hover:text-brand"
                >
                  Xoá lọc
                </button>
              )}
            </div>
          </div>

          {/* Customer Cards List */}
          {filteredCrm.length === 0 ? (
            <div className="rounded-2xl border border-line bg-white p-8 text-center">
              <p className="text-base font-bold text-navy">Không tìm thấy khách hàng nào khớp.</p>
              <p className="text-xs text-mute mt-1">Thử đổi từ khoá hoặc xoá lọc vai trò.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ptCrm.mot.map((k) => {
                const p = k.preferences ?? {};
                const isDual = !!k.seller && !!k.preferences;
                const isSellerOnly = !!k.seller && !k.preferences;
                const isEditing = suaNhuCauId === k.id;
                const isAssigning = dangGanBds === k.id;
                const soZalo = soDienThoaiZalo(k.phone);
                const hrefZalo = linkZalo(k.zalo_user_id, k.phone);

                return (
                  <article
                    key={k.id}
                    className={`rounded-2xl border bg-white p-5 transition-all ${
                      isDual
                        ? "border-emerald-300 ring-1 ring-emerald-200/80"
                        : "border-line hover:border-slate-300"
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-lg font-bold text-navy">
                          {k.name ?? "Khách chưa rõ tên"}
                        </span>
                        {k.zalo_user_id && (
                          <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 font-mono text-xs text-mute tabular-nums">
                            Zalo: {k.zalo_user_id}
                          </span>
                        )}
                        {/* Role Badge */}
                        {isDual ? (
                          <span className="rounded bg-emerald-100 text-emerald-900 border border-emerald-300 px-3 py-0.5 text-xs font-bold">
                            Vừa mua vừa bán
                          </span>
                        ) : isSellerOnly ? (
                          <span className="rounded bg-amber-100 text-amber-900 border border-amber-300 px-3 py-0.5 text-xs font-bold">
                            {k.seller?.seller_type === "ccrb" ? "Chính chủ bán" : "Môi giới bán"}
                          </span>
                        ) : (
                          <span className="rounded bg-blue-100 text-blue-900 border border-blue-300 px-3 py-0.5 text-xs font-bold">
                            Khách mua / thuê
                          </span>
                        )}
                      </div>

                      {/* Top Right Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {hrefZalo && (
                          <a
                            href={hrefZalo}
                            target="_blank"
                            rel="noreferrer"
                            title={soZalo
                              ? `Mở Zalo của ${soZalo}`
                              : "Chưa có SĐT nên chỉ mở được Zalo Web — tìm khách trong danh sách chat bên đó."}
                            className="rounded-md border border-blue-300 bg-blue-50/60 px-3 py-1 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                          >
                            {soZalo ? "Mở Zalo" : "Mở Zalo Web"}
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => (isEditing ? setSuaNhuCauId(null) : moSuaNhuCau(k))}
                          className="rounded-md border border-line px-3.5 py-1 text-xs font-bold text-navy transition hover:border-brand hover:text-brand bg-white"
                        >
                          {isEditing ? "Đóng sửa" : k.la_nguoi_mua ? "Sửa hồ sơ" : "Sửa người bán"}
                        </button>
                      </div>
                    </div>

                    {/* Card Content Grid */}
                    <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                      {/* Box 1: Căn đang rao bán */}
                      {k.seller?.active_listing ? (() => {
                        const tin = k.seller.active_listing;
                        // 14/09/2026: mã tin từng trỏ ra /nha-dat/<mã> — tin chưa lên kệ thì trang
                        // công khai 404, bấm vào "không làm gì". Cả khung nay mở màn Sửa của rổ hàng.
                        const thongSo = [
                          tin.property_type ? TYPE_LABEL[tin.property_type] ?? tin.property_type : null,
                          tin.area_m2 ? formatArea(tin.area_m2) : null,
                          [tin.ward ? `P.${tin.ward}` : null, tin.district].filter(Boolean).join(", ") || null,
                        ].filter(Boolean).join(" · ");
                        return (
                          <Link
                            href={`/admin/ro-hang?sua=${encodeURIComponent(tin.code ?? "")}`}
                            title="Mở màn sửa tin này"
                            className="group block rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs space-y-1.5 transition hover:border-brand hover:bg-amber-50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-amber-900">Căn đang rao bán:</span>
                              <span className="rounded bg-white/90 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                {TRANG_THAI_TIN[tin.status ?? ""] ?? tin.status}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-bold text-brand text-sm group-hover:underline">#{tin.code}</span>
                              {tin.legacy_code && <span className="text-mute">({tin.legacy_code})</span>}
                            </div>
                            {thongSo && <div className="text-navy font-medium">{thongSo}</div>}
                            {tin.location_raw && <div className="text-mute">{tin.location_raw}</div>}
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-navy">{tin.price_raw ? `Giá: ${tin.price_raw}` : "Chưa có giá"}</span>
                              <span className="font-bold text-brand">Sửa tin →</span>
                            </div>
                          </Link>
                        );
                      })() : (
                        <div className="rounded-xl border border-dashed border-line p-3 text-xs text-mute flex items-center justify-center italic">
                          Chưa có BĐS rao bán
                        </div>
                      )}

                      {/* Box 2: Nhu cầu tìm kiếm */}
                      {k.preferences ? (
                        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sky-900 flex items-center gap-1">
                              Nhu cầu tìm kiếm:
                            </span>
                            <span className="rounded bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-bold">
                              {p.deal === "thue" ? "Cần thuê" : "Cần mua"}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-navy">
                            <div>
                              <span className="text-mute">Khu vực: </span>
                              <b>{String(p.area || "Chưa rõ")}</b>
                            </div>
                            <div>
                              <span className="text-mute">Loại BĐS: </span>
                              <b>{String(p.property_type || "Chưa rõ")}</b>
                            </div>
                            <div>
                              <span className="text-mute">Số PN: </span>
                              <b>{p.bedrooms ? `${p.bedrooms} phòng ngủ` : "Chưa rõ"}</b>
                            </div>
                            <div>
                              <span className="text-mute">Ngân sách: </span>
                              <b className="text-brand">{String(p.budget || "Chưa rõ")}</b>
                            </div>
                          </div>
                          {(p.notes || k.notes) && (
                            <div className="border-t border-sky-100 pt-1 text-mute">
                              <span className="text-navy font-medium">{String(k.notes || p.notes)}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-line p-3 text-xs text-mute flex items-center justify-center italic">
                          Chưa ghi nhận nhu cầu tìm mua / thuê
                        </div>
                      )}
                    </div>

                    {/* Inline Form Edit Preferences */}
                    {isEditing && (
                      <div className="mt-3.5 rounded-xl border border-brand/40 bg-brand/[0.02] p-4 text-xs space-y-3">
                        <div className="font-bold text-sm text-navy flex items-center justify-between">
                          <span>{k.la_nguoi_mua ? "Sửa hồ sơ khách" : "Sửa người bán"}</span>
                          <span className="text-mute font-normal">
                            {k.la_nguoi_mua ? "Ô để trống là gỡ trường đó; tên trợ lý, cách xưng hô bot đã lưu giữ nguyên" : "Muốn sửa căn thì bấm khung tin ở trên"}
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <label htmlFor={`ten-${k.id}`} className="block font-semibold mb-1 text-mute">Tên khách</label>
                            <input
                              id={`ten-${k.id}`}
                              value={formNhuCau.name}
                              onChange={(e) => setFormNhuCau({ ...formNhuCau, name: e.target.value })}
                              placeholder="Vd: chị Ngọc"
                              className="w-full rounded border border-line p-1.5"
                            />
                          </div>
                          {k.seller && (
                            <div>
                              <label htmlFor={`vai-${k.id}`} className="block font-semibold mb-1 text-mute">Vai người bán</label>
                              <select
                                id={`vai-${k.id}`}
                                value={formNhuCau.seller_type}
                                onChange={(e) => setFormNhuCau({ ...formNhuCau, seller_type: e.target.value })}
                                className="w-full rounded border border-line p-1.5 bg-white font-semibold"
                              >
                                <option value="ccrb">Chính chủ</option>
                                <option value="nmg">Môi giới</option>
                              </select>
                            </div>
                          )}
                        </div>
                        {k.la_nguoi_mua && (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <label className="block font-semibold mb-1 text-mute">Nhu cầu giao dịch</label>
                            <select
                              value={formNhuCau.deal}
                              onChange={(e) => setFormNhuCau({ ...formNhuCau, deal: e.target.value })}
                              className="w-full rounded border border-line p-1.5 bg-white font-semibold"
                            >
                              <option value="ban">Tìm MUA</option>
                              <option value="thue">Tìm THUÊ</option>
                            </select>
                          </div>
                          <div>
                            <label className="block font-semibold mb-1 text-mute">Khu vực</label>
                            <input
                              value={formNhuCau.area}
                              onChange={(e) => setFormNhuCau({ ...formNhuCau, area: e.target.value })}
                              placeholder="Vd: Bình Tân, Quận 5..."
                              className="w-full rounded border border-line p-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold mb-1 text-mute">Loại BĐS</label>
                            <input
                              value={formNhuCau.property_type}
                              onChange={(e) => setFormNhuCau({ ...formNhuCau, property_type: e.target.value })}
                              placeholder="Vd: căn hộ, nhà phố..."
                              className="w-full rounded border border-line p-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold mb-1 text-mute">Số phòng ngủ</label>
                            <input
                              type="number"
                              value={formNhuCau.bedrooms}
                              onChange={(e) => setFormNhuCau({ ...formNhuCau, bedrooms: e.target.value })}
                              placeholder="Vd: 3"
                              className="w-full rounded border border-line p-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold mb-1 text-mute">Khoảng giá / Ngân sách</label>
                            <input
                              value={formNhuCau.budget}
                              onChange={(e) => setFormNhuCau({ ...formNhuCau, budget: e.target.value })}
                              placeholder="Vd: 8-10 triệu/tháng, 5 tỷ..."
                              className="w-full rounded border border-line p-1.5"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold mb-1 text-mute">Ghi chú CSKH</label>
                            <input
                              value={formNhuCau.notes}
                              onChange={(e) => setFormNhuCau({ ...formNhuCau, notes: e.target.value })}
                              placeholder="Vd: diện tích 50m2, dọn vào ngay..."
                              className="w-full rounded border border-line p-1.5"
                            />
                          </div>
                        </div>
                        )}
                        <div className="flex justify-end gap-2 pt-1 border-t border-line/60">
                          <button
                            type="button"
                            onClick={() => setSuaNhuCauId(null)}
                            className="rounded px-4 py-1.5 text-xs font-semibold text-mute hover:text-navy"
                          >
                            Huỷ
                          </button>
                          <button
                            type="button"
                            onClick={() => luuSuaNhuCau(k)}
                            className="rounded bg-brand px-5 py-1.5 text-xs font-bold text-white hover:bg-brand-dark transition"
                          >
                            Lưu
                          </button>
                        </div>
                      </div>
                    )}

                    {/* BĐS quan tâm — chỉ khách có dòng buyers mới gắn được (RPC nhận buyer_id) */}
                    {k.la_nguoi_mua && (
                    <div className="mt-3.5 pt-3 border-t border-line/60 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-navy">BĐS đang quan tâm:</span>
                      {k.interests && k.interests.length > 0 ? (
                        k.interests.map((it) => (
                          <span
                            key={it.listing_id}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-300 px-3 py-1 text-xs text-navy font-semibold"
                          >
                            <Link
                              href={`/admin/ro-hang?sua=${encodeURIComponent(it.code ?? "")}`}
                              className="font-bold text-[#b3461a] hover:underline"
                            >
                              #{it.code}
                            </Link>
                            {it.price_raw && <span className="text-mute font-normal">({it.price_raw})</span>}
                            <button
                              type="button"
                              onClick={() => xoaBdsQuanTam(k.id, it.listing_id)}
                              title="Gỡ BĐS quan tâm này"
                              aria-label={`Gỡ #${it.code ?? ""} khỏi danh sách quan tâm`}
                              className="ml-1 grid h-6 min-w-6 place-items-center rounded text-mute hover:bg-red-50 hover:text-red-700 font-bold transition"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-mute italic">Chưa gắn BĐS nào</span>
                      )}

                      {/* Attach Property Input */}
                      {isAssigning ? (
                        <div className="inline-flex items-center gap-1 ml-auto sm:ml-2">
                          <input
                            value={maBdsGan}
                            onChange={(e) => setMaBdsGan(e.target.value)}
                            placeholder="Nhập mã (vd: BDS-CH-Q5-0001)"
                            className="rounded-md border border-brand px-3 py-1 text-xs outline-none w-52"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => ganBdsQuanTam(k.id)}
                            disabled={dangLuuBds}
                            className="rounded-md bg-brand px-3 py-1 text-xs font-bold text-white hover:bg-brand-dark"
                          >
                            {dangLuuBds ? "Đang gắn…" : "Gắn"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDangGanBds(null);
                              setMaBdsGan("");
                            }}
                            className="text-xs text-mute hover:text-navy px-1.5"
                          >
                            Huỷ
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDangGanBds(k.id);
                            setMaBdsGan("");
                          }}
                          className="rounded-md border border-dashed border-line px-3 py-1 text-xs font-bold text-brand transition hover:border-brand hover:bg-brand/5 ml-auto sm:ml-2"
                        >
                          + Gắn BĐS quan tâm
                        </button>
                      )}
                    </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <PhanTrang {...ptCrm} />
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 2: VIỆC CẦN XỬ LÝ (TIN CHỜ DUYỆT · KHÁCH CẦN NGƯỜI THẬT...)
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "todo" && (
        <section className="mt-6 space-y-8">
          {/* Tin chờ duyệt */}
          <div className="rounded-2xl border border-line bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold tracking-tight text-navy">Tin chờ duyệt</h2>
                <span className={`rounded-md px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                  pending.length > 0 ? "bg-brand text-white" : "bg-line text-mute"
                }`}>
                  {pending.length}
                </span>
              </div>
              <span className="text-xs text-mute">bot bóc từ câu rao - duyệt thì mới lên kệ công khai</span>
            </div>

            {pending.length === 0 ? (
              <Rong>Không còn tin nào chờ duyệt - rổ sạch.</Rong>
            ) : (
              <>
                <div className="mt-4 space-y-3">
                  {ptTin.mot.map((l) => (
                    <article key={l.id} className="rounded-xl border border-line bg-slate-50/50 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-bold text-navy text-base">
                          #{l.code}
                          {l.ward ? ` · ${l.ward}` : ""}
                          {l.price_raw || l.price_vnd ? ` · ${formatPrice(l.price_vnd, l.price_raw)}` : " · Giá chưa có"}
                          {l.area_m2 ? ` · ${formatArea(l.area_m2)}` : ""}
                        </p>
                        <span className="text-xs text-mute tabular-nums">
                          {new Date(l.created_at).toLocaleString("vi-VN")}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-3 max-w-[70ch] text-sm text-navy/80">
                        {sanitizeDescription(l.description) || l.location_raw || (
                          <span className="italic text-mute">Tin chưa có nội dung mô tả</span>
                        )}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/ro-hang?sua=${encodeURIComponent(l.code ?? "")}`}
                          className="rounded-md bg-[#b3461a] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#9a3c16]"
                        >
                          Xem &amp; duyệt →
                        </Link>
                        <button
                          type="button"
                          onClick={() => anTin(l.id, l.code)}
                          className="rounded-md border border-slate-400 px-5 py-2 text-sm font-semibold text-navy transition hover:border-navy bg-white"
                        >
                          Ẩn tin
                        </button>
                        <button
                          onClick={() => setUpCho((c) => (c === l.id ? null : l.id))}
                          className="rounded-md border border-line px-4 py-2 text-sm font-semibold transition hover:border-brand hover:text-brand bg-white"
                        >
                          {upCho === l.id ? "Đóng ảnh" : "Up ảnh"}
                        </button>
                        <span className="ml-auto text-xs text-mute">
                          (Mở màn sửa để xem đủ tin rồi mới rao)
                        </span>
                      </div>
                      {upCho === l.id && (
                        <div className="mt-4">
                          <UploadAnh listingId={l.id} code={l.code} />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                <PhanTrang {...ptTin} />
              </>
            )}
          </div>

          {/* Khách cần người thật */}
          <div className="rounded-2xl border border-line bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold tracking-tight text-navy">Khách cần người thật</h2>
                <span className={`rounded-md px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                  khachCan.length > 0 ? "bg-brand text-white" : "bg-line text-mute"
                }`}>
                  {khachCan.length}
                </span>
              </div>
              <span className="text-xs text-mute">bot đã giơ cờ needs_human, chưa ai vào hỗ trợ</span>
            </div>

            {khachCan.length === 0 ? (
              <Rong>Không có hội thoại nào cần người thật - bot đang tự lo tốt.</Rong>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-line text-sm">
                  {ptKhachCan.mot.map((k) => (
                    <li key={k.conversation_id} className="py-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-bold text-navy">{k.ten ?? "Khách chưa tên"}</span>
                        <span className="rounded bg-line px-2 py-0.5 text-[11px] font-bold text-navy uppercase">
                          {k.vai}
                        </span>
                        {k.zalo_user_id && (
                          <a
                            href="https://chat.zalo.me/"
                            target="_blank"
                            rel="noreferrer"
                            title="Hàng chờ chỉ có ID luồng chat, chưa có SĐT — nút này mở Zalo Web, tìm khách theo tin nhắn cuối bên đó."
                            className="rounded border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            Mở Zalo Web
                          </a>
                        )}
                        <span className="ml-auto text-xs text-mute tabular-nums">
                          chờ từ {new Date(k.needs_human_at).toLocaleString("vi-VN")}
                        </span>
                      </div>
                      {k.tin_khach_cuoi && (
                        <p className="mt-1 line-clamp-2 max-w-[70ch] text-sm text-navy/80 italic">
                          “{k.tin_khach_cuoi}”
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                <PhanTrang {...ptKhachCan} />
              </>
            )}
          </div>

          {/* Câu khách hỏi & Lịch xem nhà & Việc chờ admin */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Câu khách hỏi */}
            <div className="rounded-2xl border border-line bg-white p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-navy">Câu khách hỏi</h3>
                  <span className="rounded bg-line px-2 py-0.5 text-xs font-bold text-navy tabular-nums">
                    {cauHoiCho}
                  </span>
                </div>
                {cauHoiQuaHan > 0 && (
                  <span className="rounded bg-brand text-white text-[10px] font-bold px-2 py-0.5">
                    {cauHoiQuaHan} quá hạn
                  </span>
                )}
              </div>
              {cauHoi.length === 0 ? (
                <Rong>Chưa có câu hỏi nào.</Rong>
              ) : (
                <ul className="divide-y divide-line text-xs max-h-96 overflow-y-auto pr-1">
                  {cauHoi.slice(0, 10).map((c) => (
                    <li key={c.id} className="py-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="font-bold text-brand">#{c.listings?.code ?? "-"}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-mute"
                        }`}>
                          {TRANG_THAI_HOI[c.status] ?? c.status}
                        </span>
                      </div>
                      <p className="text-navy font-medium">{c.question}</p>
                      {c.answer && <p className="text-mute italic">↳ {c.answer}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Lịch xem nhà */}
            <div className="rounded-2xl border border-line bg-white p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-navy">Lịch xem nhà</h3>
                  <span className="rounded bg-line px-2 py-0.5 text-xs font-bold text-navy tabular-nums">
                    {lichSapToi}
                  </span>
                </div>
                <span className="text-xs text-mute">sắp tới</span>
              </div>
              {lichXem.length === 0 ? (
                <Rong>Chưa có lịch xem nào.</Rong>
              ) : (
                <ul className="divide-y divide-line text-xs max-h-96 overflow-y-auto pr-1">
                  {lichXem.slice(0, 10).map((v) => (
                    <li key={v.id} className="py-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="font-bold text-brand">#{v.listings?.code ?? v.listing_code ?? "-"}</span>
                        <span className="font-semibold text-navy">{v.buyers?.name ?? "Khách chưa tên"}</span>
                      </div>
                      <div className="text-mute flex items-center justify-between">
                        <span>{v.slot ? new Date(v.slot).toLocaleString("vi-VN") : v.time_text}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold">
                          {TRANG_THAI_XEM[v.status] ?? v.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Việc chờ admin */}
          <div className="rounded-2xl border border-line bg-white p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-navy">Việc chờ admin</h3>
                <span className="rounded bg-line px-2 py-0.5 text-xs font-bold text-navy tabular-nums">
                  {viec.length}
                </span>
              </div>
              <span className="text-xs text-mute">bot đẩy lên, xong thì bấm đóng</span>
            </div>
            {viec.length === 0 ? (
              <Rong>Không có việc nào chờ.</Rong>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {viec.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <span className="text-xs text-mute tabular-nums block">
                        {new Date(v.created_at).toLocaleString("vi-VN")}
                      </span>
                      <p className="text-navy text-sm">{v.note}</p>
                    </div>
                    <button
                      onClick={() => dongViec(v.id)}
                      className="rounded-md border border-line px-3.5 py-1 text-xs font-bold text-navy hover:border-brand hover:text-brand bg-white shrink-0"
                    >
                      Đã xử lý
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 3: BÁO CÁO & THỐNG KÊ
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "stats" && (
        <section className="mt-6 space-y-6">
          {/* Thống kê hội thoại 30 ngày */}
          <div className="rounded-2xl border border-line bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-navy">Thống kê hội thoại · 30 ngày</h2>
                <p className="text-xs text-mute mt-0.5">
                  {tongTK.hoi_thoai} hội thoại khách mới · {tongTK.khach_moi} khách mới · {tongTK.co} lần cần người thật
                </p>
              </div>
              <button
                onClick={taiCsv}
                disabled={!thongKe.length}
                className="rounded-md border border-line px-4 py-1.5 text-xs font-bold text-navy transition hover:border-brand hover:text-brand disabled:opacity-40 bg-white"
              >
                Tải CSV
              </button>
            </div>

            {thongKe.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left text-xs text-mute border-b border-line">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Ngày</th>
                      <th className="py-2 pr-3 font-semibold">HT khách</th>
                      <th className="py-2 pr-3 font-semibold">HT bán</th>
                      <th className="py-2 pr-3 font-semibold">Tin khách</th>
                      <th className="py-2 pr-3 font-semibold">Tin bot</th>
                      <th className="py-2 pr-3 font-semibold">Người thật</th>
                      <th className="py-2 pr-3 font-semibold">Khách mới</th>
                      <th className="py-2 font-semibold">Cờ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ptThongKe.mot.map((r) => (
                      <tr key={r.ngay} className="hover:bg-slate-50/50">
                        <td className="py-2 pr-3 text-mute font-medium">
                          {new Date(r.ngay).toLocaleDateString("vi-VN")}
                        </td>
                        <td className="py-2 pr-3">{r.hoi_thoai_khach_moi}</td>
                        <td className="py-2 pr-3">{r.hoi_thoai_ban_moi}</td>
                        <td className="py-2 pr-3">{r.tin_khach}</td>
                        <td className="py-2 pr-3">{r.tin_bot}</td>
                        <td className="py-2 pr-3">{r.tin_nguoi_that}</td>
                        <td className="py-2 pr-3">{r.khach_moi}</td>
                        <td className="py-2">{r.co_nguoi_that}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PhanTrang {...ptThongKe} />
          </div>

          {/* BĐS Hot & Người bán mới */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* BĐS hot 60 ngày */}
            <div className="rounded-2xl border border-line bg-white p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h3 className="font-bold text-navy">BĐS hot · 60 ngày</h3>
                <span className="text-xs text-mute">xem, hỏi, hẹn nhiều nhất</span>
              </div>
              {bdsHot === null ? (
                <Rong>chưa có dữ liệu</Rong>
              ) : bdsHot.length === 0 ? (
                <Rong>Chưa có sự kiện nào trong 60 ngày.</Rong>
              ) : (
                <ul className="divide-y divide-line text-xs max-h-80 overflow-y-auto pr-1">
                  {bdsHot.map((h) => (
                    <li key={h.listing_id} className="py-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-brand tabular-nums">{h.so_su_kien_60d} sk</span>
                        <Link
                          href={`/nha-dat/${encodeURIComponent(h.code ?? "")}`}
                          target="_blank"
                          className="font-bold text-navy hover:underline"
                        >
                          #{h.code ?? h.listing_id.slice(0, 8)}
                        </Link>
                        <span className="text-mute">{h.ward ?? ""}</span>
                      </div>
                      <span className="text-[10px] text-mute tabular-nums">
                        {h.last_event_at ? new Date(h.last_event_at).toLocaleDateString("vi-VN") : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Người bán 14 ngày */}
            <div className="rounded-2xl border border-line bg-white p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h3 className="font-bold text-navy">Người bán mới · 14 ngày</h3>
                <span className="text-xs text-mute">nhãn tính phí</span>
              </div>
              {nguoiBan.length === 0 ? (
                <Rong>Chưa có người bán mới.</Rong>
              ) : (
                <ul className="divide-y divide-line text-xs max-h-80 overflow-y-auto pr-1">
                  {ptNguoiBan.mot.map((s) => (
                    <li key={s.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-navy">{s.name ?? "Chưa tên"}</span>
                        <span className="text-mute ml-1">({s.zalo_user_id ? "chat" : "tay"})</span>
                        {/* Hạng theo điểm (SRD §IV.3) + điểm phản hồi + chuẩn NMG — chỉ ghi, không nhắn (SRS-5.1zzd/zze/zzf). */}
                        {(() => {
                          const h = hang.find((x) => x.id === s.id);
                          if (!h) return null;
                          const hb = HANG[h.rank] ?? HANG.chua_du;
                          return (
                            <span className="ml-1 inline-flex items-center gap-1">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${hb.lop}`} title={`điểm ${h.diem_nguoi_rao ?? "-"}/100 · phản hồi ${h.diem_phan_hoi ?? "chưa đo"}`}>
                                {hb.ten} {h.diem_nguoi_rao ?? "-"}
                              </span>
                              {h.dat_chuan_nmg === false && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700" title="NMG dưới chuẩn: < 10 BĐS đang rao hoặc chốt < 5 %/6 tháng (SRD §V)">dưới chuẩn</span>}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          s.seller_type === "unknown" ? "bg-navy text-white" : "bg-brand/10 text-brand"
                        }`}>
                          {NHAN[s.seller_type] ?? s.seller_type}
                        </span>
                        {(["ccrb", "nmg"] as const)
                          .filter((t) => t !== s.seller_type)
                          .map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => doiNhan(s.id, t)}
                              className="text-[10px] text-mute hover:text-navy underline"
                            >
                              đổi {t === "ccrb" ? "CC" : "MG"}
                            </button>
                          ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Chi phí Model (Tiền bộ não 7 ngày) */}
          <div className="rounded-2xl border border-line bg-white p-5">
            <TheTien rows={tien} rowsModel={tienModel} />
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 4: VẬN HÀNH & TIỆN ÍCH
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "ops" && (
        <section className="mt-6 space-y-6">
          {/* FR-195: thông tin dự án chờ duyệt */}
          {factDuAn.length > 0 && (
            <div className="rounded-2xl border border-line bg-white p-6">
              <TheFactDuAn rows={factDuAn} onXong={load} />
            </div>
          )}

          {/* FR-192: Quota tiêu hao */}
          <div className="rounded-2xl border border-line bg-white p-6">
            <TheQuota q={quota} tokenTien={quota ? tongTien(tienModel.filter((r) => r.day === quota.ngay)).tien : null} />
          </div>

          {/* FR-203: đăng nhập Zalo clone — quét QR ngay trên CRM. Đang lỗi thì ô
              này đã nằm ở đầu trang (mọi tab), đừng hiện hai lần. */}
          {!zaloChet && (
            <div className="rounded-2xl border border-line bg-white p-6">
              <TheZaloClone dn={zaloDn} onDangNhapLai={dangNhapLaiZalo} />
            </div>
          )}

          {/* Tình trạng Bot AI */}
          <div className="rounded-2xl border border-line bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-navy">Tình trạng Trợ lý Bot & Hạ tầng</h2>
                <p className="text-xs text-mute mt-0.5">Nhịp tim bridge Zalo, độ trễ và nhật ký lỗi gần nhất</p>
              </div>
              {health && <BridgeBadge at={health.beat} />}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div className="rounded-xl border border-line p-4 bg-slate-50/50 space-y-1">
                <span className="text-xs font-bold text-mute uppercase tracking-wider block">Độ trễ phản hồi (7 ngày)</span>
                {doTre && doTre.so_luot != null ? (
                  <div className="space-y-1">
                    <div className="text-lg font-bold text-navy">
                      p50: {Math.round((doTre.p50_giay ?? 0) * 1000).toLocaleString("vi-VN")} ms
                      {" · "}p95:{" "}
                      <span className={(doTre.p95_giay ?? 0) > 3 ? "text-brand" : "text-navy"}>
                        {Math.round((doTre.p95_giay ?? 0) * 1000).toLocaleString("vi-VN")} ms
                      </span>
                    </div>
                    <div className="text-xs text-mute">
                      Tổng {doTre.so_luot} lượt · Tiêu chuẩn NFR-01: p95 &lt; 3.000 ms
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-mute">Chưa có dữ liệu đo trễ</span>
                )}
              </div>

              <div className="rounded-xl border border-line p-4 bg-slate-50/50 space-y-1">
                <span className="text-xs font-bold text-mute uppercase tracking-wider block">Nhật ký lỗi hệ thống</span>
                <div className="text-lg font-bold text-navy">
                  {health?.errs.length ? `${health.errs.length} lỗi gần nhất` : "Sổ lỗi sạch (0 lỗi)"}
                </div>
                <div className="text-xs text-mute">
                  {health?.errs.length ? "Bấm bên dưới để xem chi tiết" : "Hệ thống hoạt động ổn định"}
                </div>
              </div>
            </div>

            {health && health.errs.length > 0 && (
              <details className="mt-2 rounded-xl border border-line p-4 bg-slate-50/30">
                <summary className="cursor-pointer text-sm font-bold text-navy hover:text-brand">
                  Xem chi tiết {health.errs.length} lỗi gần nhất
                </summary>
                <ul className="mt-3 divide-y divide-line text-xs font-mono">
                  {health.errs.map((e) => (
                    <li key={e.id} className="py-2 space-y-1">
                      <div className="flex items-center justify-between text-mute">
                        <span>{new Date(e.at).toLocaleString("vi-VN")}</span>
                        <span className="font-bold text-brand">{e.source} {e.status_code ? `(${e.status_code})` : ""}</span>
                      </div>
                      <p className="text-navy break-all">{e.detail}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* Tạo danh sách riêng cho khách */}
          <div className="rounded-2xl border border-line bg-white p-6 space-y-4">
            <div className="border-b border-line pb-3">
              <h2 className="text-lg font-bold tracking-tight text-navy">Tạo danh sách riêng cho khách</h2>
              <p className="text-xs text-mute mt-0.5">Tạo link /ds/… sống 30 ngày để gửi qua Zalo cho từng khách</p>
            </div>
            <form onSubmit={taoDs} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  value={dsMa}
                  onChange={(e) => setDsMa(e.target.value)}
                  placeholder="Nhập mã tin cách nhau bởi dấu phẩy (vd: BDS-NP-BINHTAN-0001, BDS-CH-Q5-0001)"
                  className="min-w-0 rounded-md border border-line px-4 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  value={dsTieuDe}
                  onChange={(e) => setDsTieuDe(e.target.value)}
                  placeholder="Tiêu đề: Căn hộ Bình Tân · dưới 10 tr"
                  className="min-w-0 rounded-md border border-line px-4 py-2 text-sm outline-none focus:border-brand sm:w-72"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={dangTaoDs}
                  className="rounded-md bg-brand px-6 py-2 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
                >
                  {dangTaoDs ? "Đang tạo…" : "Tạo link danh sách"}
                </button>
                {dsKq && (
                  <span className={`text-sm ${dsKq.ok ? "text-navy" : "text-brand"}`}>
                    {dsKq.ok && dsKq.path ? (
                      <>
                        <a href={dsKq.path} target="_blank" rel="noreferrer" className="font-bold underline text-brand">
                          {dsKq.path}
                        </a>
                        {" · "}{dsKq.text}{" "}
                        <button
                          type="button"
                          onClick={() => chepLink(dsKq.path!)}
                          className="rounded border border-line px-3 py-0.5 text-xs font-semibold hover:border-brand hover:text-brand ml-1"
                        >
                          {daChep ? "Đã chép" : "Chép link"}
                        </button>
                      </>
                    ) : (
                      dsKq.text
                    )}
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Giấy tờ bảo mật (bucket riêng) */}
          <div className="rounded-2xl border border-line bg-white p-6 space-y-4">
            <div className="border-b border-line pb-3">
              <h2 className="text-lg font-bold tracking-tight text-navy">Giấy tờ & Sổ đỏ (Bucket bảo mật)</h2>
              <p className="text-xs text-mute mt-0.5">Link ký tạm thời 15 phút, không bao giờ công khai</p>
            </div>
            {giayTo.length === 0 ? (
              <Rong>Chưa có file giấy tờ bảo mật nào.</Rong>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {giayTo.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-navy">#{g.listings?.code ?? "-"}</span>
                      <span className="text-mute text-xs">
                        {g.media_type === "so_do" ? "sổ đỏ / sổ hồng" : g.media_type} · {g.mime_type}
                      </span>
                    </div>
                    <button
                      onClick={() => xemGiayTo(g)}
                      className="rounded-md border border-line px-4 py-1 text-xs font-bold text-navy hover:border-brand hover:text-brand bg-white"
                    >
                      Xem giấy tờ
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ── NGUYÊN LIỆU PHỤ TRỢ BỐ CỤC ────────────────────────────────────────────────
function Muc({ ten, phu, dem, children }: {
  ten: string; phu?: string; dem?: number; children: ReactNode;
}) {
  const co = (dem ?? 0) > 0;
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h3 className="text-base font-bold tracking-tight text-navy">{ten}</h3>
        {dem !== undefined && (
          <span
            className={`rounded-md px-2.5 py-0.5 text-xs font-bold tabular-nums ${
              co ? "bg-brand text-white" : "bg-line text-mute"
            }`}
          >
            {dem}
          </span>
        )}
        {phu && <span className="text-sm text-mute">{phu}</span>}
      </div>
      {children}
    </section>
  );
}

function TraCuu({ ten, phu, dem, children }: {
  ten: string; phu?: string; dem?: number; children: ReactNode;
}) {
  return (
    <details className="group mt-3 border-b border-line pb-3">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2.5 rounded-shot py-1.5 transition hover:text-brand">
        <span className="text-base font-bold tracking-tight text-navy">{ten}</span>
        {dem !== undefined && dem > 0 && (
          <span className="rounded bg-line px-2 py-0.5 text-xs font-bold tabular-nums text-navy">
            {dem}
          </span>
        )}
        {phu && <span className="text-sm font-normal text-mute">{phu}</span>}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Rong({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-mute italic">{children}</p>;
}

function PhanTrang({ trang, soTrang, tong, setTrang }: {
  trang: number; soTrang: number; tong: number; setTrang: (n: number) => void;
}) {
  if (soTrang <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-xs text-mute">
      <button onClick={() => setTrang(trang - 1)} disabled={trang <= 1}
        className="rounded-md border border-line px-3.5 py-1 font-semibold transition hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-line disabled:hover:text-mute bg-white">
        Trước
      </button>
      <span className="tabular-nums font-medium">trang {trang}/{soTrang} · {tong} mục</span>
      <button onClick={() => setTrang(trang + 1)} disabled={trang >= soTrang}
        className="rounded-md border border-line px-3.5 py-1 font-semibold transition hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-line disabled:hover:text-mute bg-white">
        Sau -
      </button>
    </div>
  );
}

// FR-195: hàng chờ duyệt thông tin DỰ ÁN nghe được trong lúc chat. Gật thì nhập
// vào `projects`, bỏ thì đóng dấu bỏ — không có đường nào tự nhập, vì một người
// nhớ nhầm là cả kho sai theo.
function TheFactDuAn({ rows, onXong }: { rows: FactDuAn[]; onXong: () => void }) {
  const [dangChay, setDangChay] = useState<number | null>(null);
  const bam = async (id: number, ok: boolean) => {
    setDangChay(id);
    const { error } = await supabase.rpc("duyet_fact_du_an", { p_id: id, p_ok: ok });
    setDangChay(null);
    if (error) alert(`Không xong: ${error.message}`);
    else onXong();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <div>
          <h3 className="font-bold text-navy">Thông tin dự án nghe được trong lúc chat</h3>
          <p className="mt-0.5 text-xs text-mute">
            Gật thì nhập vào hồ sơ dự án (tiện ích nối thêm, còn lại vào thông số). Bỏ thì đóng dấu bỏ.
          </p>
        </div>
        <span className="text-xs font-bold text-brand tabular-nums">{rows.length} dòng chờ</span>
      </div>
      <ul className="divide-y divide-line text-sm">
        {rows.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
            <span className="font-semibold text-navy">{f.du_an}</span>
            {f.quan && <span className="text-xs text-mute">{f.quan}</span>}
            <span className="rounded bg-cream px-1.5 py-0.5 text-[11px] font-bold text-mute">{f.khoa}</span>
            <span className="min-w-0 flex-1 truncate text-navy">{f.gia_tri}</span>
            <span className="text-[11px] text-mute">
              {f.ma_tin ? `từ tin ${f.ma_tin}` : f.nguon}
            </span>
            <span className="flex gap-1.5">
              <Btn variant="primary" className="nut-nho" disabled={dangChay === f.id} onClick={() => bam(f.id, true)}>
                Nhập vào dự án
              </Btn>
              <Btn variant="ghost" className="nut-nho" disabled={dangChay === f.id} onClick={() => bam(f.id, false)}>
                Bỏ
              </Btn>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// FR-192: bốn cái trần trong một thẻ. Chưa đọc được thì nói thẳng, đừng hiện 0 —
// "0" và "không biết" là hai chuyện khác nhau lúc đang chữa cháy.
function TheQuota({ q, tokenTien }: { q: Quota | null; tokenTien: number | null }) {
  if (!q) {
    return (
      <div className="space-y-2">
        <h3 className="font-bold text-navy">Quota tiêu hao</h3>
        <p className="text-xs text-mute">
          Chưa đọc được. Hàm <code>quota_tieu_hao()</code> chỉ trả lời cho email có trong bảng <code>admins</code>.
        </p>
      </div>
    );
  }
  const pt = q.tran_ngay > 0 ? Math.min(100, Math.round((q.luot_hom_nay / q.tran_ngay) * 100)) : 0;
  const mauThanh = pt >= 90 ? "bg-brand" : pt >= 60 ? "bg-amber-500" : "bg-emerald-500";
  const tranNguoiQuen = q.tran_ngay_nguoi * q.he_so_nguoi_quen;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <div>
          <h3 className="font-bold text-navy">Quota tiêu hao</h3>
          <p className="text-xs text-mute mt-0.5">
            Ngày {new Date(q.ngay).toLocaleDateString("vi-VN")} (giờ VN) · bốn cái trần của hệ thống
          </p>
        </div>
        <span className="text-xs text-mute tabular-nums">
          {q.token_hom_nay.toLocaleString("vi-VN")} chữ-máy hôm nay
          {tokenTien !== null ? ` · ~${tokenTien.toFixed(2)}` : ""}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold text-navy">Lượt gọi model hôm nay</span>
          <span className="tabular-nums font-bold text-navy">
            {q.luot_hom_nay.toLocaleString("vi-VN")} / {q.tran_ngay.toLocaleString("vi-VN")} ({pt}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-line">
          <div className={`h-full ${mauThanh}`} style={{ width: `${Math.max(pt, 1)}%` }} />
        </div>
        <p className="text-[11px] text-mute">
          Chạm trần là bot NGỪNG gọi model tới hết ngày (chỉ còn câu mẫu). Sửa trần bằng secret{" "}
          <code>DAILY_MODEL_CALL_CAP</code> trong Vault.
          {q.capped_at ? ` Đã chạm trần lúc ${new Date(q.capped_at).toLocaleString("vi-VN")}.` : ""}
        </p>
      </div>

      <div className="rounded-xl border border-line p-3 bg-slate-50/50">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold text-navy">Số dư tài khoản model</span>
          {/* Ba trạng thái, không phải hai: đang hết; đã hết RỒI GỌI LẠI ĐƯỢC
              (nạp tiền xong — chủ dự án 10/09: "vẫn còn 15 đô chứ hết đâu");
              và chưa hề bị từ chối lần nào. Gộp hai cái sau thành "chưa thấy
              lượt nào bị từ chối" là nói dối theo chiều ngược lại. */}
          <span className={`text-xs font-bold ${q.het_credit ? "text-brand" : "text-emerald-700"}`}>
            {q.het_credit
              ? `HẾT SỐ DƯ — ${q.credit_loi_24h} lượt bị từ chối / 24h`
              : q.credit_loi_24h > 0
              ? `gọi lại được${q.model_song_luc ? ` lúc ${new Date(q.model_song_luc).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""} — ${q.credit_loi_24h} lượt bị từ chối trước đó / 24h`
              : "chưa thấy lượt nào bị từ chối"}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-mute">
          {q.co_du_phong
            ? `Có đường dự phòng: hết số dư thì bot tự chuyển sang model khác${q.dang_chay_du_phong ? " (đang chạy bằng nó)" : ""}. `
            : "Chưa có đường dự phòng — hết số dư là bot rơi về câu mẫu. "}
          Anthropic không cho hỏi số dư bằng API, nên đây đọc dấu vết trong sổ lỗi: lượt gọi model bị
          trả 400 vì hết số dư.
          {q.credit_lan_cuoi ? ` Lần cuối ${new Date(q.credit_lan_cuoi).toLocaleString("vi-VN")}.` : ""}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold text-navy">Người nhắn nhiều nhất (24 giờ)</span>
          <span className="text-xs text-mute tabular-nums">
            trần {q.tran_gio_nguoi}/giờ · {q.tran_ngay_nguoi}/ngày · người quen ×{q.he_so_nguoi_quen} ({tranNguoiQuen}/ngày)
          </span>
        </div>
        {q.nguoi_dot_nhieu.length === 0 ? (
          <p className="text-xs text-mute">Chưa có ai nhắn trong 24 giờ qua.</p>
        ) : (
          <ul className="divide-y divide-line text-xs">
            {q.nguoi_dot_nhieu.map((n) => {
              const tran = n.nguoi_quen ? tranNguoiQuen : q.tran_ngay_nguoi;
              const sat = n.trong_24h >= tran * 0.8;
              return (
                <li key={n.uid} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="font-mono text-[11px] text-navy truncate max-w-[45%]">{n.uid}</span>
                  <span className="text-[11px] text-mute">{n.nguoi_quen ? "người quen" : "người lạ"}</span>
                  <span className={`tabular-nums font-bold ${sat ? "text-brand" : "text-navy"}`}>
                    {n.trong_24h}/{tran} ngày
                  </span>
                  <span className="tabular-nums text-mute text-[11px] w-24 text-right">
                    {n.trong_gio ?? 0}/{n.nguoi_quen ? q.tran_gio_nguoi * q.he_so_nguoi_quen : q.tran_gio_nguoi} giờ này
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {q.so_nguoi_cham_tran > 0 && (
          <p className="text-[11px] font-bold text-brand">
            {q.so_nguoi_cham_tran} người đã vượt trần ngày — bot im với họ tới khi cửa sổ 24 giờ trượt qua.
          </p>
        )}
      </div>
    </div>
  );
}

function TheTien({ rows, rowsModel }: { rows: Tien[]; rowsModel: TienModel[] }) {
  // Tiền theo model (SRS-5.1zv); `rows` (bot_usage) chỉ còn cho số LƯỢT và tổng chữ theo ngày.
  const theoNgay = new Map<string, TienModel[]>();
  for (const r of rowsModel) theoNgay.set(r.day, [...(theoNgay.get(r.day) ?? []), r]);
  const tongAll = tongTien(rowsModel);
  const tongLuot = rows.reduce((s, t) => s + t.model_calls, 0);
  const tongNap = rows.reduce((s, t) => s + t.cache_write_tokens, 0);
  const tongDoc = rows.reduce((s, t) => s + t.cache_read_tokens, 0);
  const daDo = rows.some((t) => t.in_tokens + t.out_tokens + tongNap + tongDoc > 0);
  const tyLeDoc = tongNap + tongDoc > 0 ? tongDoc / (tongNap + tongDoc) : null;
  const chu = (t: Pick<DongToken, "in_tokens" | "out_tokens" | "cache_write_tokens" | "cache_read_tokens">) => t.in_tokens + t.out_tokens + t.cache_write_tokens + t.cache_read_tokens;
  const soChu = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <h3 className="font-bold text-navy">Chi phí Model & Tiền bộ não (7 ngày)</h3>
        <span className="text-xs text-mute tabular-nums">
          {daDo ? `$${tongAll.tien.toFixed(2)} · ${tongLuot} lượt · trung bình $${tongLuot ? (tongAll.tien / tongLuot).toFixed(3) : "-"}/lượt` : "chưa đo"}
          {tongAll.chuaRo > 0 ? ` · ${tongAll.chuaRo} dòng chưa rõ model (không tính)` : ""}
        </span>
      </div>
      <p className="text-[11px] text-mute">
        Giá theo từng model (Anthropic niêm yết), Groq/Gemini = 0 đô (bậc miễn phí). Dòng ghi trước 04/10 không có model → không quy ra đô.
      </p>
      {/* SRS-5.1zw (#4): cache không chạy = trả giá đầy đủ mỗi lượt. Haiku 4.5 chỉ cache prompt ≥ 4.096 token. */}
      {rowsModel.map((r) => canhBaoCache(r)).filter((x): x is string => !!x).slice(0, 3).map((cb, i) => (
        <p key={i} className="text-xs font-bold text-brand">⚠ {cb}</p>
      ))}
      {daDo && tyLeDoc !== null && (
        <p className={`text-xs font-bold ${tyLeDoc >= 0.5 ? "text-emerald-700" : "text-brand"}`}>
          Tỷ lệ đọc lại cache: {Math.round(tyLeDoc * 100)}% {tyLeDoc >= 0.5 ? "- bộ nhớ tạm đang hoạt động tốt" : "- cần theo dõi"}
        </p>
      )}
      <ul className="divide-y divide-line text-xs">
        {rows.map((t) => {
          const ds = theoNgay.get(t.day) ?? [];
          const tn = tongTien(ds);
          return (
            <li key={t.day} className="py-2 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="tabular-nums text-mute w-24">
                  {new Date(t.day).toLocaleDateString("vi-VN")}
                </span>
                <span className="tabular-nums w-16">{t.model_calls} lượt</span>
                <span className="tabular-nums font-bold text-navy w-20">
                  {ds.length ? `$${tn.tien.toFixed(3)}` : chu(t) > 0 ? "chưa rõ" : "-"}
                </span>
                <span className="text-mute tabular-nums text-[11px] min-w-0 flex-1 truncate">
                  vào {t.in_tokens.toLocaleString("vi-VN")} · ra {t.out_tokens.toLocaleString("vi-VN")} · nạp {t.cache_write_tokens.toLocaleString("vi-VN")} · đọc {t.cache_read_tokens.toLocaleString("vi-VN")}
                </span>
              </div>
              {ds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-24">
                  {ds.map((r) => {
                    const g = giaCua(r.model);
                    const d = tongTien([r]);
                    return (
                      <span key={r.model} className="rounded border border-line px-1.5 py-0.5 text-[11px] tabular-nums text-mute" title={r.model}>
                        {g?.nhan ?? `${r.model} (chưa có giá)`} · {r.calls ? `${r.calls} lượt · ` : ""}{soChu(chu(r))} chữ
                        {g ? ` · $${d.tien.toFixed(3)}${r.calls ? ` ($${(d.tien / r.calls).toFixed(4)}/lượt)` : ""}` : ""}
                        {(() => { const tl = tyLeDocCache(r); return tl === null ? "" : ` · đọc cache ${Math.round(tl * 100)}%`; })()}
                      </span>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type DangNhapZalo = {
  trang_thai: string;
  qr_png: string | null;
  yeu_cau_quet_lai: boolean;
  ghi_chu: string | null;
  cap_nhat: string;
};

const NHAN_DANG_NHAP: Record<string, string> = {
  dang_nhap: "Đã đăng nhập",
  cho_quet: "Chờ quét mã QR",
  da_quet: "Đã quét, chờ xác nhận",
  het_han: "Phiên hết hạn",
  tu_choi: "Điện thoại từ chối",
  chua_ro: "Chưa có tín hiệu",
};

// FR-203: ô đăng nhập acc Zalo clone. Ảnh QR là thứ nhạy (quét bằng acc nào
// thì acc đó thành acc bot) — bảng chỉ admin đọc được, và trang này chỉ hiện
// mã còn hạn.
function TheZaloClone({ dn, onDangNhapLai }: { dn: DangNhapZalo | null; onDangNhapLai: () => void }) {
  const giay = dn ? Math.round((Date.now() - new Date(dn.cap_nhat).getTime()) / 1000) : null;
  // zca-js cho mỗi mã sống 100 giây rồi sinh mã mới. Ảnh cũ hơn thế nghĩa là
  // bridge đã thôi đẩy (chết giữa chừng) — đừng cho quét một mã đã chết.
  const qrConHan = dn?.trang_thai === "cho_quet" && !!dn.qr_png && giay != null && giay < 110;
  const tot = dn?.trang_thai === "dang_nhap" && !dn.yeu_cau_quet_lai;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-navy">Zalo clone</h2>
          <p className="text-xs text-mute mt-0.5">
            Acc Zalo cá nhân bot dùng để nhắn khách và chủ nhà khi chưa có OA. Phiên hết hạn thì quét lại mã QR ngay ở đây.
          </p>
        </div>
        <span
          className={`rounded-md px-3 py-1 text-xs font-bold ${
            tot ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-brand text-white"
          }`}
        >
          {dn ? (NHAN_DANG_NHAP[dn.trang_thai] ?? dn.trang_thai) : "Không đọc được"}
        </span>
      </div>

      {qrConHan ? (
        <div className="flex flex-wrap items-start gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dn!.qr_png!}
            alt="Mã QR đăng nhập Zalo clone"
            className="h-56 w-56 border border-line bg-white p-2"
          />
          <ol className="list-decimal space-y-1 pl-5 text-sm text-navy">
            <li>Mở Zalo trên điện thoại đang đăng nhập <b>acc clone</b> (đừng dùng acc chính).</li>
            <li>Bấm biểu tượng QR ở thanh tìm kiếm, quét mã bên cạnh.</li>
            <li>Bấm xác nhận đăng nhập trên điện thoại.</li>
            <li className="text-mute">Mã tự đổi mỗi ~100 giây, trang này tự cập nhật.</li>
          </ol>
        </div>
      ) : dn?.trang_thai === "cho_quet" ? (
        <p className="text-sm text-brand">
          Mã QR gần nhất đã quá hạn ({giay} giây trước) mà bridge chưa đẩy mã mới — bridge trên VPS có thể đã dừng.
        </p>
      ) : dn?.trang_thai === "het_han" || dn?.yeu_cau_quet_lai ? (
        <p className="text-sm text-mute">Bridge đang khởi động lại để sinh mã QR mới, chờ chút là mã hiện ở đây.</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-mute">
        <span>
          {dn
            ? `Cập nhật ${new Date(dn.cap_nhat).toLocaleString("vi-VN")}${dn.ghi_chu ? ` · ${dn.ghi_chu}` : ""}`
            : "Chưa đọc được trạng thái đăng nhập"}
        </span>
        <button
          type="button"
          onClick={onDangNhapLai}
          disabled={!dn || dn.yeu_cau_quet_lai || dn.trang_thai === "cho_quet"}
          className="rounded-md border border-line px-3 py-1.5 font-bold text-navy hover:border-brand disabled:opacity-50"
        >
          {dn?.yeu_cau_quet_lai ? "Đã yêu cầu, chờ bridge…" : "Đăng nhập lại"}
        </button>
      </div>
    </div>
  );
}

function BridgeBadge({ at }: { at: string | null }) {
  if (!at) {
    return (
      <span className="rounded-md bg-line px-3 py-1 text-xs font-bold text-mute">
        bridge: chưa từng gõ cửa
      </span>
    );
  }
  const phut = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  const song = phut <= 15;
  return (
    <span
      className={`rounded-md px-3 py-1 text-xs font-bold ${
        song ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-brand text-white"
      }`}
    >
      bridge: {song ? "đang sống" : `im ${phut} phút`}
    </span>
  );
}
