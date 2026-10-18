"use client";
// /admin/tin-nhan — màn chat 3 cột của khung CRM (09/09/2026, bố cục theo
// ZaloCRM): trái = bộ lọc, giữa = hội thoại, phải = tin nhắn. Mỗi câu bot có
// 18/10/2026 (SRS-5.1zzzzzzz46): bỏ "Sửa thành câu chuẩn" (FR-180, bảng `mau_cau`) — mẫu đó chỉ bot TypeScript cũ đọc làm
// few-shot; lõi Python không đọc nên lưu mẫu không đổi được giọng bot.
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

const AI_VI: Record<string, string> = {
  bot: "Trợ lý", buyer: "Khách", seller: "Chủ nhà", human: "Người thật", ctv: "CTV", system: "Hệ thống",
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
  const dem = {
    tong: hoiThoai.length,
    ban: hoiThoai.filter((h) => !!h.seller_id).length,
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

  const chip = (on: boolean) => `rounded-lg px-3 py-1.5 text-left text-sm font-semibold transition ${on ? "bg-navy text-white" : "bg-white text-navy hover:bg-slate-100"}`;

  return (
    <div className="mx-auto grid h-[calc(100vh-56px)] max-w-[1600px] grid-cols-[220px_340px_1fr] gap-0 border-x border-line bg-white">
      {/* Cột 1: bộ lọc */}
      <aside className="flex flex-col gap-1 overflow-y-auto border-r border-line bg-cream/40 p-3">
        <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wider text-mute">Phạm vi</div>
        <button type="button" className={chip(!locPhia && !chiCanNguoi)} onClick={() => { setLocPhia(""); setChiCanNguoi(false); }}>Tất cả <span className="float-right text-xs opacity-70">{dem.tong}</span></button>
        <button type="button" className={chip(locPhia === "ban")} onClick={() => setLocPhia(locPhia === "ban" ? "" : "ban")}>Người bán <span className="float-right text-xs opacity-70">{dem.ban}</span></button>
        <button type="button" className={chip(locPhia === "mua")} onClick={() => setLocPhia(locPhia === "mua" ? "" : "mua")}>Người mua <span className="float-right text-xs opacity-70">{dem.tong - dem.ban}</span></button>
        <div className="mb-1 mt-3 px-1 text-[11px] font-bold uppercase tracking-wider text-mute">Cần làm</div>
        <button type="button" className={chip(chiCanNguoi)} onClick={() => setChiCanNguoi(!chiCanNguoi)}>Cần người thật <span className="float-right text-xs opacity-70">{dem.canNguoi}</span></button>
        <div className="mb-1 mt-3 px-1 text-[11px] font-bold uppercase tracking-wider text-mute">Monitor</div>
        {(["NEED_HUMAN", "WAITING_HINT", "AI_HANDLING"] as const).map((k) => (
          <button key={k} type="button" className={chip(locNhan === k)} onClick={() => setLocNhan(locNhan === k ? "" : k)}>{k} <span className="float-right text-xs opacity-70">{dem.nhan(k)}</span></button>
        ))}
      </aside>

      {/* Cột 2: hội thoại */}
      <section className="flex flex-col overflow-hidden border-r border-line">
        <div className="border-b border-line p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, Zalo ID…" className="w-full rounded-lg border border-line bg-cream/60 px-3 py-2 text-sm outline-none focus:border-brand" />
          <div className="mt-2 flex items-center justify-between text-xs text-mute tabular-nums">
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
                <button type="button" onClick={() => moHoiThoai(h)} className={`flex w-full flex-col gap-1 border-b border-line/70 px-3 py-2.5 text-left hover:bg-cream/60 ${chon?.id === h.id ? "bg-brand/5" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${h.seller_id ? "bg-amber-500" : "bg-zalo"}`}>{ten(h).slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy">{ten(h)}</span>
                    <span className="text-[11px] text-mute tabular-nums">{gioNgan(h.last_message_at)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pl-10">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${h.seller_id ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>{nhanVai(h)}</span>
                    {nhanHT[h.id] && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${MAU_NHAN[nhanHT[h.id].nhan]}`} title={nhanHT[h.id].ly_do ?? ""}>{nhanHT[h.id].nhan}</span>}
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

      {/* Cột 3: tin nhắn */}
      <section className="flex flex-col overflow-hidden bg-cream/30">
        {!chon ? (
          <div className="grid flex-1 place-items-center text-center text-sm text-mute"><div><IconChat className="mx-auto h-10 w-10 text-mute/60" /><div className="mt-2">Chọn một hội thoại ở cột giữa để đọc.</div></div></div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line bg-white px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-navy">{ten(chon)}</span>
                <span className="text-xs text-mute">· {chon.seller_id && chon.buyer_id ? "vừa bán vừa mua" : chon.seller_id ? "người bán" : "người mua"} · {chon.channel}</span>
                {chon.needs_human && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">cần người thật</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="mr-1 text-xs text-mute tabular-nums">{tin.length} lượt</span>
                {chon.needs_human && <Btn onClick={daXuLy} className="py-1.5 text-xs">Đã xử lý</Btn>}
                {chon.human_hold
                  ? <Btn onClick={() => giuKhach(false)} className="py-1.5 text-xs" title="Bot đang im — bấm để bot chăm tiếp">Trả bot</Btn>
                  : <Btn onClick={() => giuKhach(true)} className="py-1.5 text-xs" title="Bot im vô thời hạn, người thật nói chuyện">Giữ khách</Btn>}
                <Btn variant="danger" onClick={xoaKhach} className="py-1.5 text-xs" title="Xoá vĩnh viễn khách này cùng tin, ảnh, hội thoại"><IconTrash className="h-3.5 w-3.5" /> Xoá khách</Btn>
              </div>
            </div>
            <ol className="flex-1 space-y-2 overflow-y-auto p-4">
              {tin.map((t) => {
                const bot = t.sender === "bot";
                return (
                  <li key={t.id} className={`flex ${bot ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${bot ? "bg-navy text-white" : t.sender === "human" ? "bg-emerald-50 text-navy" : "bg-white text-navy"}`}>
                      <div className={`flex items-center justify-between gap-3 text-[10px] ${bot ? "text-white/60" : "text-mute"}`}>
                        <span className="font-bold">{AI_VI[t.sender] ?? t.sender}</span><span className="tabular-nums">{luc(t.created_at)}</span>
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap text-sm">{t.body}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
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
