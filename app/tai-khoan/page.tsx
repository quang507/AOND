"use client";
// Trang người mua (FR-126): tin đã xem gần đây + khuyến nghị theo gu +
// hồ sơ TỰ NGUYỆN (SĐT chỉ để hẹn xem nhà nhanh hơn — không bắt buộc,
// luồng Zalo vẫn không bao giờ hỏi số. Quyết định chủ dự án 25/08/2026).
import { useEffect, useState } from "react";
import Link from "next/link";
import ListingCard from "@/components/ListingCard";
import { readRecent } from "@/components/TrackView";
import { CARD_COLS, supabase, type ListingCard as CardRow } from "@/lib/supabase";

export default function Page() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);
  const [recent, setRecent] = useState<CardRow[]>([]);
  const [suggest, setSuggest] = useState<CardRow[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);

      // Tin đã xem: gộp localStorage + listing_views (nếu đăng nhập)
      const codes = readRecent();
      let ids: string[] = [];
      if (user) {
        // Hai truy vấn độc lập chạy cùng lúc (FR-171 j)
        const [{ data: v }, { data: b }] = await Promise.all([
          supabase
            .from("listing_views").select("listing_id")
            .eq("auth_user_id", user.id)
            .order("viewed_at", { ascending: false }).limit(24),
          supabase
            .from("buyers").select("name, phone").eq("auth_user_id", user.id).maybeSingle(),
        ]);
        ids = (v ?? []).map((r) => r.listing_id);
        if (b) { setName(b.name ?? ""); setPhone(b.phone ?? ""); }
      }
      const [byCode, byId] = await Promise.all([
        codes.length
          ? supabase.from("listings").select(CARD_COLS).in("code", codes)
          : Promise.resolve({ data: [] as CardRow[] }),
        ids.length
          ? supabase.from("listings").select(CARD_COLS).in("id", ids)
          : Promise.resolve({ data: [] as CardRow[] }),
      ]);
      const seen = new Map<string, CardRow>();
      for (const l of [...(byCode.data ?? []), ...(byId.data ?? [])] as CardRow[]) {
        seen.set(l.id, l);
      }
      // Giữ thứ tự theo danh sách xem gần nhất (codes trước)
      const ordered = [...seen.values()].sort(
        (a, b) => codes.indexOf(a.code ?? "") - codes.indexOf(b.code ?? ""),
      );
      setRecent(ordered.slice(0, 8));

      // Khuyến nghị: cùng phường + giá ±35% quanh tin xem gần nhất, loại đã xem
      const anchor = ordered[0];
      if (anchor?.ward) {
        let q = supabase.from("listings").select(CARD_COLS)
          .eq("deal", anchor.deal).eq("ward", anchor.ward)
          .in("status", ["dang_ban", "dang_quan_tam"]) // FR-139: chỉ tin đang lên kệ
          .not("price_raw", "is", null).neq("price_raw", "")
          .limit(12);
        if (anchor.price_vnd && anchor.price_vnd > 0) {
          q = q.gte("price_vnd", anchor.price_vnd * 0.65).lte("price_vnd", anchor.price_vnd * 1.35);
        }
        const { data: s } = await q;
        setSuggest(((s ?? []) as CardRow[]).filter((l) => !seen.has(l.id)).slice(0, 4));
      }
    })();
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaveMsg("Đang lưu…");
    const { data: existing } = await supabase
      .from("buyers").select("id").eq("auth_user_id", userId).maybeSingle();
    const row = { auth_user_id: userId, name: name || null, phone: phone || null };
    const { error } = existing
      ? await supabase.from("buyers").update(row).eq("id", existing.id)
      : await supabase.from("buyers").insert(row);
    setSaveMsg(error ? "Lưu không được: " + error.message : "Đã lưu. Cảm ơn anh chị!");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Góc của anh chị</h1>
        {email ? (
          <button onClick={() => supabase.auth.signOut().then(() => location.assign("/"))}
            className="text-sm text-mute hover:text-brand">
            Đăng xuất ({email})
          </button>
        ) : email === null ? (
          <Link href="/dang-nhap" className="text-sm font-semibold text-brand hover:underline">
            Đăng nhập để lưu qua nhiều thiết bị -
          </Link>
        ) : null}
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Tin đã xem gần đây</h2>
        {recent.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        ) : (
          <p className="mt-2 text-sm text-mute">
            Chưa có - đi <Link href="/mua-ban" className="font-semibold text-brand">xem vài căn</Link> rồi quay lại đây.
          </p>
        )}
      </section>

      {suggest.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold">Hợp gu anh chị nè</h2>
          <p className="text-sm text-mute">Cùng khu và tầm giá với căn anh chị vừa xem.</p>
          <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {suggest.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      {email && (
        <section className="mt-10 max-w-md">
          <h2 className="text-lg font-bold">Hồ sơ (không bắt buộc)</h2>
          <form onSubmit={saveProfile} className="mt-3 rounded-king border border-line bg-white p-5">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-mute">Tên để tụi em xưng hô</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="anh Hưng / chị Dương"
                className="w-full rounded-lg border border-line px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-brand" />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold text-mute">Số điện thoại (tuỳ anh chị)</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Để trống cũng được"
                className="w-full rounded-lg border border-line px-3 py-2.5 tabular-nums focus-visible:outline-2 focus-visible:outline-brand" />
              <span className="mt-1 block text-xs text-mute/80">
                Chỉ dùng để CTV gọi xác nhận khi anh chị đặt lịch xem nhà - tụi em
                không gọi chào hàng, không đưa cho môi giới nào khác. Xoá lúc nào cũng được.
              </span>
            </label>
            {saveMsg && <p className="mt-3 text-sm font-medium">{saveMsg}</p>}
            <button type="submit"
              className="mt-4 rounded-md bg-brand px-6 py-2.5 font-bold text-white transition hover:bg-brand-dark active:scale-[0.98]">
              Lưu hồ sơ
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
