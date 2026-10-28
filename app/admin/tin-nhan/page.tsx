"use client";
// /admin/tin-nhan — màn chat 3 cột của khung CRM (09/09/2026, bố cục theo
// ZaloCRM): trái = bộ lọc, giữa = hội thoại, phải = tin nhắn. Mỗi câu bot có
// 18/10/2026 (SRS-5.1zzzzzzz46): bỏ "Sửa thành câu chuẩn" (FR-180, bảng `mau_cau`) — mẫu đó chỉ bot TypeScript cũ đọc làm
// few-shot; lõi Python không đọc nên lưu mẫu không đổi được giọng bot. 20/10 (SRS-5.1zzzzzzz88): nút "Chấm / sửa câu này" đưa câu
// vào bảng `cau_chuan` mà lõi Python CÓ đọc (trang /admin/cau-chuan).
// Đọc `conversations`/`messages` qua RLS admin; không gọi RPC nào của bot.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Btn } from "@/components/ui";
import { IconChat, IconRefresh, IconTrash } from "@/components/icons";

type HoiThoai = {
  id: string; channel: string | null; seller_id: string | null; buyer_id: string | null;
  last_message_at: string | null; needs_human: boolean | null; human_touch_at: string | null; human_hold?: boolean | null;
  sellers: { name: string | null; zalo_user_id: string | null } | null;
  buyers: { name: string | null; zalo_user_id: string | null } | null;
};
type Tin = { id: string; sender: string; body: string; seq: number; created_at: string };
// SRD §VII Live Chat Monitor (05/10/2026, SRS-5.1zzg): nhãn tự động mỗi hội thoại, DB tính (view `hoi_thoai_nhan`).
type NhanHT = { conversation_id: string; nhan: "NEED_HUMAN" | "WAITING_HINT" | "AI_HANDLING"; ly_do: string | null };
const MAU_NHAN: Record<NhanHT["nhan"], string> = {
  NEED_HUMAN: "bg-red-600 text-white", WAITING_HINT: "bg-amber-400 text-navy", AI_HANDLING: "bg-emerald-50 text-emerald-800",
};

// Nhãn trạng thái hội thoại (view hoi_thoai_nhan) đọc bằng chữ Việt — trước 19/10/2026 hiện nguyên mã NEED_HUMAN / WAITING_HINT / AI_HANDLING.
const TEN_NHAN: Record<NhanHT["nhan"], string> = {
  NEED_HUMAN: "Cần người thật", WAITING_HINT: "Đang chờ trả lời", AI_HANDLING: "Bot đang lo",
};

const AI_VI: Record<string, string> = {
  bot: "Trợ lý", buyer: "Khách", seller: "Chủ nhà", human: "Người thật", system: "Hệ thống",
};
const luc = (s: string | null) => s ? new Date(s).toLocaleString("vi-VN", { hour12: false }) : "";
const gioNgan = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s); const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
};

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [hoiThoai, setHoiThoai] = useState<HoiThoai[]>([]);
  const [nhanHT, setNhanHT] = useState<Record<string, NhanHT>>({});
  const [locNhan, setLocNhan] = useState<"" | NhanHT["nhan"]>("");
  const [chon, setChon] = useState<HoiThoai | null>(null);
  const [tin, setTin] = useState<Tin[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [locPhia, setLocPhia] = useState<"" | "ban" | "mua">("");
  const [chiCanNguoi, setChiCanNguoi] = useState(false);
  const [thongBao, setThongBao] = useState<string | null>(null);
  // SRS-5.1zzzzzzz216 (chủ dự án 27/10: "trong này có 1 ô để admin gửi lại nữa"): ô gửi tin cho khách — RPC admin_gui_tin xếp nhắc
  // `admin_reply`, lõi Python gửi qua bridge trong ~1 phút rồi ghi `messages` (sender human, Realtime đẩy vào đây), bot nhường sân 30 phút.
  const [chuGui, setChuGui] = useState("");
  const [dangGui, setDangGui] = useState(false);
  // SRS-5.1zzzzzzz29: hội thoại đang mở, đọc được trong callback Realtime (closure của effect không thấy state mới).
  const chonRef = useRef<HoiThoai | null>(null);
  useEffect(() => { chonRef.current = chon; }, [chon]);

  const napHoiThoai = async () => {
    const [{ data, error }, { data: nh, error: nhErr }] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, channel, seller_id, buyer_id, last_message_at, needs_human, human_touch_at, human_hold, sellers!conversations_seller_id_fkey(name, zalo_user_id), buyers!conversations_buyer_id_fkey(name, zalo_user_id)")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase.from("hoi_thoai_nhan").select("conversation_id, nhan, ly_do").limit(400),
    ]);
    if (error) setLoi(error.message);
    // View chưa áp (migration 20261005a) thì không có nhãn — màn vẫn chạy, không báo lỗi đỏ.
    if (nhErr) console.warn("hoi_thoai_nhan:", nhErr.message);
    setHoiThoai((data ?? []) as unknown as HoiThoai[]);
    setNhanHT(Object.fromEntries(((nh ?? []) as NhanHT[]).map((x) => [x.conversation_id, x])));
  };

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setRole("anon");
      const { data: a } = await supabase.from("admins").select("email").eq("email", user.email ?? "").maybeSingle();
      if (!a) return setRole("user");
      setRole("admin");
      await napHoiThoai();
      try {
        const id = new URLSearchParams(location.search).get("hoi_thoai");
        if (id) {
          const { data } = await supabase.from("conversations")
            .select("id, channel, seller_id, buyer_id, last_message_at, needs_human, human_touch_at, human_hold, sellers!conversations_seller_id_fkey(name, zalo_user_id), buyers!conversations_buyer_id_fkey(name, zalo_user_id)")
            .eq("id", id).maybeSingle();
          if (data) moHoiThoai(data as unknown as HoiThoai);
        }
      } catch { /* không có URL */ }
    });
  }, []);

  // SRS-5.1zzzzzzz29 (chủ dự án 18/10/2026: "crm có cập nhật khi nhận tin luôn chưa"): trước đây chỉ tải lúc mở trang và khi bấm
  // "Làm mới". Nay nghe Supabase Realtime (migration 20261018a thêm `messages` + `conversations` vào publication; RLS admin vẫn chặn —
  // chỉ admin nhận sự kiện): tin mới của hội thoại đang mở hiện ngay, danh sách hội thoại tải lại sau 1,5 s (gom nhiều tin liền một
  // lượt, đỡ request REST gói Free). Mất kết nối thì nút "Làm mới" vẫn dùng như cũ.
  useEffect(() => {
    if (role !== "admin") return;
    let hen: ReturnType<typeof setTimeout> | null = null;
    const napLai = () => { if (hen) clearTimeout(hen); hen = setTimeout(() => { void napHoiThoai(); }, 1500); };
    const kenh = supabase.channel("crm-tin-nhan")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        const m = p.new as Tin & { conversation_id: string };
        if (chonRef.current?.id === m.conversation_id) {
          setTin((ds) => ds.some((x) => x.id === m.id) ? ds
            : [...ds, { id: m.id, sender: m.sender, body: m.body, seq: m.seq, created_at: m.created_at }].sort((a, b) => a.seq - b.seq));
        }
        napLai();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => napLai())
      .subscribe();
    return () => { if (hen) clearTimeout(hen); void supabase.removeChannel(kenh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const moHoiThoai = async (h: HoiThoai) => {
    setChon(h);
    const { data, error } = await supabase.from("messages")
      .select("id, sender, body, seq, created_at").eq("conversation_id", h.id).order("seq").limit(500);
    if (error) setLoi(error.message);
    setTin((data ?? []) as Tin[]);
  };

  const ten = (h: HoiThoai) => h.sellers?.name ?? h.buyers?.name ?? (h.seller_id ? "Chủ nhà" : "Khách");
  // FR-214 (20260923b): một hội thoại mỗi người — có thể mang cả vai bán lẫn vai mua.
  const nhanVai = (h: HoiThoai) => h.seller_id && h.buyer_id ? "bán + mua" : h.seller_id ? "bán" : "mua";

  const danhSach = useMemo(() => {
    const k = q.trim().toLowerCase();
    return hoiThoai.filter((h) =>
      (!locPhia || (locPhia === "ban" ? !!h.seller_id : !!h.buyer_id)) &&
      (!chiCanNguoi || !!h.needs_human) &&
      (!locNhan || nhanHT[h.id]?.nhan === locNhan) &&
      (!k || ten(h).toLowerCase().includes(k) || (h.sellers?.zalo_user_id ?? h.buyers?.zalo_user_id ?? "").includes(k)),
    );
  }, [hoiThoai, q, locPhia, chiCanNguoi, locNhan, nhanHT]);

  // Xoá khách (20260909f): xoá sạch số Zalo này — tin, fact, ảnh, chat, hồ sơ.
  // Xác nhận nói rõ hậu quả (NN/g: error prevention), báo kết quả sau khi xoá.
  const xoaKhach = async () => {
    if (!chon) return;
    const zalo = chon.sellers?.zalo_user_id ?? chon.buyers?.zalo_user_id;
    if (!zalo) { setLoi("Hội thoại này không gắn số Zalo nào, không xoá được."); return; }
    const ok = confirm(`Xoá khách "${ten(chon)}"?\n\nSẽ xoá vĩnh viễn: tin rao + ảnh + thông số của họ, toàn bộ hội thoại, hồ sơ mua/bán, lịch hẹn.\nKhông hoàn tác được.`);
    if (!ok) return;
    const { data, error } = await supabase.rpc("admin_xoa_khach", { p_zalo: zalo });
    if (error) { setLoi(error.message); return; }
    const d = (data ?? {}) as { listings?: number; messages?: number; conversations?: number };
    setThongBao(`Đã xoá khách "${ten(chon)}": ${d.listings ?? 0} tin, ${d.messages ?? 0} tin nhắn, ${d.conversations ?? 0} hội thoại.`);
    setChon(null); setTin([]);
    await napHoiThoai();
  };
  // SRS-5.1zzzzzzz88: đưa một câu bot (kèm 8 tin ngữ cảnh trước nó) vào /admin/cau-chuan để chấm điểm và sửa tay.
  const chamCau = async (t: Tin) => {
    const { error } = await supabase.rpc("cau_chuan_tu_tin", { p_message_ids: [t.id] });
    if (error) { setLoi(error.message); return; }
    setThongBao("Đã đưa câu vào trang Câu chuẩn (mục Chưa chấm).");
  };
  // Cần người thật → đã xử lý: hạ cờ để bot tiếp sức lại (FR-147).
  const daXuLy = async () => {
    if (!chon) return;
    const { error } = await supabase.from("conversations").update({ needs_human: false }).eq("id", chon.id);
    if (error) { setLoi(error.message); return; }
    setChon({ ...chon, needs_human: false });
    setThongBao(`Đã đánh dấu "${ten(chon)}" là đã xử lý.`);
    await napHoiThoai();
  };
  // FR-189: người thật GIỮ khách (bot im vô thời hạn) / TRẢ bot — RPC giu_khach (admin).
  const giuKhach = async (giu: boolean) => {
    if (!chon) return;
    const { error } = await supabase.rpc("giu_khach", { p_conversation_id: chon.id, p_giu: giu });
    if (error) { setLoi(error.message); return; }
    setChon({ ...chon, human_hold: giu, needs_human: giu ? false : chon.needs_human });
    setThongBao(giu ? `Đang giữ "${ten(chon)}": bot im tới khi bấm "Trả bot".` : `Đã trả "${ten(chon)}" cho bot.`);
    await napHoiThoai();
  };
  const guiTin = async () => {
    if (!chon || !chuGui.trim() || dangGui) return;
    setDangGui(true);
    const { error } = await supabase.rpc("admin_gui_tin", { p_conversation_id: chon.id, p_noi_dung: chuGui.trim() });
    setDangGui(false);
    if (error) { setLoi(error.message); return; }
    setChuGui("");
    setThongBao(`Đã xếp tin cho "${ten(chon)}" — lõi gửi qua Zalo trong khoảng 1 phút; bot nhường sân 30 phút.`);
  };
  const dem = {
    tong: hoiThoai.length,
    ban: hoiThoai.filter((h) => !!h.seller_id).length,
    mua: hoiThoai.filter((h) => !!h.buyer_id).length,   // một khách vừa bán vừa mua đếm ở cả hai chip, tổng vẫn là một hội thoại
    canNguoi: hoiThoai.filter((h) => !!h.needs_human).length,
    nhan: (k: NhanHT["nhan"]) => hoiThoai.filter((h) => nhanHT[h.id]?.nhan === k).length,
  };

  if (role === "loading") return <div className="mx-auto max-w-4xl px-4 py-16 text-mute font-medium">Đang kiểm tra quyền…</div>;
  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-navy">Khu vực quản trị</h1>
        <p className="mt-2 text-mute text-sm">{role === "anon" ? "Cần đăng nhập bằng tài khoản quản trị." : "Tài khoản này không có quyền quản trị."}</p>
        {role === "anon" && <Link href="/dang-nhap" className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 font-bold text-white hover:bg-brand-dark transition">Đăng nhập</Link>}
      </div>
    );
  }

  const chip = (on: boolean) => `shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition ${on ? "bg-navy text-white" : "bg-cream/70 text-navy hover:bg-line"}`;

  // 19/10/2026 (SRS-5.1zzzzzzz72): hai cột (danh sách · hội thoại) thay ba cột — bộ lọc lên đầu danh sách. Dưới 1024px chỉ
  // hiện một cột: chưa chọn thì danh sách, chọn rồi thì hội thoại kèm nút quay lại (trước đó lưới 3 cột cố định tràn ngang).
  return (
    <div className="grid h-[calc(100dvh-101px)] grid-cols-1 bg-white lg:h-[calc(100dvh-57px)] lg:grid-cols-[360px_1fr]">
      {/* Cột 1: bộ lọc + hội thoại */}
      <section className={`flex-col overflow-hidden border-r border-line ${chon ? "hidden lg:flex" : "flex"}`}>
        <div className="space-y-2 border-b border-line p-3">
          <label className="sr-only" htmlFor="tim-hoi-thoai">Tìm hội thoại</label>
          <input id="tim-hoi-thoai" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, Zalo ID" className="w-full rounded-md border border-line bg-cream/60 px-3 py-2 text-sm outline-none focus:border-brand focus:bg-white" />
          <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Lọc theo vai">
            <button type="button" className={chip(!locPhia)} onClick={() => setLocPhia("")}>Tất cả {dem.tong}</button>
            <button type="button" className={chip(locPhia === "ban")} onClick={() => setLocPhia(locPhia === "ban" ? "" : "ban")}>Người bán {dem.ban}</button>
            <button type="button" className={chip(locPhia === "mua")} onClick={() => setLocPhia(locPhia === "mua" ? "" : "mua")}>Người mua {dem.mua}</button>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="loc-trang-thai" className="text-xs font-semibold text-mute">Trạng thái</label>
            <select
              id="loc-trang-thai"
              value={chiCanNguoi ? "can_nguoi" : locNhan}
              onChange={(e) => {
                const v = e.target.value;
                setChiCanNguoi(v === "can_nguoi");
                setLocNhan(v === "WAITING_HINT" || v === "AI_HANDLING" ? v : "");
              }}
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1 text-xs text-navy outline-none focus:border-brand"
            >
              <option value="">Mọi trạng thái</option>
              <option value="can_nguoi">Cần người thật ({dem.canNguoi})</option>
              <option value="WAITING_HINT">{TEN_NHAN.WAITING_HINT} ({dem.nhan("WAITING_HINT")})</option>
              <option value="AI_HANDLING">{TEN_NHAN.AI_HANDLING} ({dem.nhan("AI_HANDLING")})</option>
            </select>
          </div>
          <div className="flex items-center justify-between text-xs text-mute tabular-nums">
            <span>{danhSach.length} hội thoại · mới nhất lên trên</span>
            <button type="button" onClick={() => { napHoiThoai(); }} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-navy hover:bg-cream/70" title="Tải lại danh sách">
              <IconRefresh className="h-3.5 w-3.5" /> Làm mới
            </button>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {danhSach.map((h) => {
            return (
              <li key={h.id}>
                <button type="button" onClick={() => moHoiThoai(h)} aria-current={chon?.id === h.id ? "true" : undefined} className={`flex w-full flex-col gap-1 border-b border-line/70 px-3 py-2.5 text-left hover:bg-cream/60 ${chon?.id === h.id ? "bg-brand/5" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${h.seller_id ? "bg-amber-500" : "bg-zalo"}`}>{ten(h).slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy">{ten(h)}</span>
                    <span className="text-[11px] text-mute tabular-nums">{gioNgan(h.last_message_at)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pl-10">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${h.seller_id ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>{nhanVai(h)}</span>
                    {nhanHT[h.id] && !(nhanHT[h.id].nhan === "NEED_HUMAN" && h.needs_human) && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${MAU_NHAN[nhanHT[h.id].nhan]}`} title={nhanHT[h.id].ly_do ?? ""}>{TEN_NHAN[nhanHT[h.id].nhan]}</span>}
                    {h.needs_human && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">cần người thật</span>}
                    {h.human_hold && <span className="rounded bg-navy px-1.5 py-0.5 text-[10px] font-bold text-white">người thật giữ</span>}
                    {h.human_touch_at && !h.human_hold && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-mute">người thật đã vào</span>}
                  </div>
                </button>
              </li>
            );
          })}
          {danhSach.length === 0 && <li className="px-4 py-10 text-center text-sm text-mute">Không có hội thoại khớp bộ lọc.</li>}
        </ul>
      </section>

      {/* Cột 2: tin nhắn */}
      <section className={`flex-col overflow-hidden bg-cream/30 ${chon ? "flex" : "hidden lg:flex"}`}>
        {!chon ? (
          <div className="grid flex-1 place-items-center text-center text-sm text-mute"><div><IconChat className="mx-auto h-10 w-10 text-mute/60" /><div className="mt-2">Chọn một hội thoại bên trái để đọc.</div></div></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <button type="button" onClick={() => { setChon(null); setTin([]); }} className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold text-navy hover:bg-cream lg:hidden">Danh sách</button>
                <span className="truncate text-sm font-bold text-navy">{ten(chon)}</span>
                <span className="hidden text-xs text-mute sm:inline">· {chon.seller_id && chon.buyer_id ? "vừa bán vừa mua" : chon.seller_id ? "người bán" : "người mua"} · {chon.channel}</span>
                {chon.needs_human && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">cần người thật</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs text-mute tabular-nums">{tin.length} lượt</span>
                {chon.needs_human && <Btn onClick={daXuLy} className="py-1.5 text-xs">Đã xử lý</Btn>}
                {chon.human_hold
                  ? <Btn onClick={() => giuKhach(false)} className="py-1.5 text-xs" title="Bot đang im, bấm để bot chăm tiếp">Trả bot</Btn>
                  : <Btn onClick={() => giuKhach(true)} className="py-1.5 text-xs" title="Bot im vô thời hạn, người thật nói chuyện">Giữ khách</Btn>}
                <Btn variant="danger" onClick={xoaKhach} className="py-1.5 text-xs" title="Xoá vĩnh viễn khách này cùng tin, ảnh, hội thoại"><IconTrash className="h-3.5 w-3.5" /> Xoá khách</Btn>
              </div>
            </div>
            <ol className="flex-1 space-y-2 overflow-y-auto p-4">
              {tin.map((t) => {
                const bot = t.sender === "bot";
                return (
                  <li key={t.id} className={`flex ${bot ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3.5 py-2 sm:max-w-[78%] ${bot ? "bg-navy text-white" : t.sender === "human" ? "bg-emerald-50 text-navy" : "bg-white text-navy"}`}>
                      <div className={`flex items-center justify-between gap-3 text-[10px] ${bot ? "text-white/60" : "text-mute"}`}>
                        <span className="font-bold">{AI_VI[t.sender] ?? t.sender}</span><span className="tabular-nums">{luc(t.created_at)}</span>
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap break-words text-sm">{t.body}</div>
                      {bot && (
                        <button type="button" onClick={() => chamCau(t)} className="mt-1 text-[11px] font-semibold text-white/70 underline-offset-2 hover:text-white hover:underline" title="Đưa câu này (kèm ngữ cảnh) vào trang Câu chuẩn để chấm điểm, sửa tay">
                          Chấm / sửa câu này
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <form
              onSubmit={(e) => { e.preventDefault(); void guiTin(); }}
              className="flex items-end gap-2 border-t border-line bg-white px-3 py-2"
            >
              <label htmlFor="admin-gui-tin" className="sr-only">Gửi tin cho khách</label>
              <textarea
                id="admin-gui-tin"
                value={chuGui}
                onChange={(e) => setChuGui(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void guiTin(); } }}
                rows={2}
                maxLength={2000}
                placeholder="Nhắn cho khách bằng tên bạn (Enter gửi, Shift+Enter xuống dòng) — bot sẽ im 30 phút"
                className="min-h-[44px] flex-1 resize-y rounded-md border border-line bg-cream/60 px-3 py-2 text-sm outline-none focus:border-brand focus:bg-white"
              />
              <Btn type="submit" disabled={dangGui || !chuGui.trim()} className="py-2 text-xs" title="Lõi gửi qua Zalo trong ~1 phút, ghi vào đây với nhãn Người thật">
                {dangGui ? "Đang xếp…" : "Gửi cho khách"}
              </Btn>
            </form>
          </>
        )}
      </section>
      {loi && (
        <div role="alert" className="fixed bottom-4 right-4 flex items-center gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          <span>Lỗi: {loi}</span>
          <button type="button" onClick={() => setLoi(null)} aria-label="Đóng" className="font-bold">×</button>
        </div>
      )}
      {thongBao && (
        <div role="status" className="fixed bottom-4 right-4 flex items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <span>{thongBao}</span>
          <button type="button" onClick={() => setThongBao(null)} aria-label="Đóng" className="font-bold">×</button>
        </div>
      )}
    </div>
  );
}
