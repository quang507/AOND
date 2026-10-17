"use client";
// Dashboard nhà môi giới (FR-124 — port ý tưởng dashboard NhaDat-Radar).
// Đăng tin vẫn theo tinh thần INS-05: MỘT câu rao + phường + giá, AI bóc tách
// chi tiết sau (bot ask-seller sẽ hỏi bổ sung). Tin mới vào `cho_thong_tin`,
// đủ giá + diện tích + phường thì trigger FR-139 tự đẩy lên web.
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, type Listing } from "@/lib/supabase";
import { formatPrice, sanitizeDescription } from "@/lib/format";
import { WARDS } from "@/lib/geo"; // một danh sách phường cho cả web (FR-171 j)
import UploadAnh from "@/components/UploadAnh";

// Vòng đời tin FR-139 — đúng 5 trạng thái của CHECK trên listings.status.
// (Nhãn tiếng Anh cũ đã bỏ: migration FR-139 dịch hết dữ liệu sang tiếng Việt
// và type enum listing_status đã DROP, không dòng nào mang giá trị cũ nữa.)
const STATUS_LABEL: Record<string, string> = {
  cho_thong_tin: "Chờ đủ thông tin",
  dang_ban: "Đang rao trên web",
  dang_quan_tam: "Đang được khách quan tâm",
  da_chot: "Đã chốt",
  an: "Đã ẩn",
};

// Cột trang này hiển thị (02/10/2026: bỏ `select("*")` - vector `nhung` ~9,8 KB/dòng, `boc_tach` jsonb không dùng ở đây).
const COT_TIN_CUA_TOI = "id, code, deal, district, ward, location_raw, price_raw, price_vnd, description, status, created_at";

export default function Page() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [mine, setMine] = useState<Listing[]>([]);
  const [rao, setRao] = useState("");
  const [ward, setWard] = useState("Phường 1");
  // FR-174: địa bàn đã mở (Sài Gòn phường mới + Long An) — quận/huyện gõ tay,
  // không ghi cứng "Quận 5" nữa (nghiệm thu 04/09 bắt được chỗ sót của đợt 1).
  const [quan, setQuan] = useState("Quận 5");
  const [priceRaw, setPriceRaw] = useState("");
  const [msg, setMsg] = useState("");
  // FR-96 (04/09/2026): up ảnh cho tin của mình — policy `storage_seller_own_insert`
  // + `listing_media_own_insert` chỉ cho ghi vào thư mục UUID tin của chính mình.
  const [upCho, setUpCho] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setEmail(null);
      setEmail(user.email ?? "");
      // Seller gắn với tài khoản; chưa có thì tạo
      const { data: existing } = await supabase
        .from("sellers").select("id").eq("auth_user_id", user.id).maybeSingle();
      let sid = existing?.id as string | undefined;
      if (!sid) {
        const { data: created } = await supabase
          .from("sellers")
          .insert({ auth_user_id: user.id, name: user.email?.split("@")[0], seller_type: "nmg" })
          .select("id").single();
        sid = created?.id;
      }
      if (!sid) return;
      setSellerId(sid);
      const { data: ls } = await supabase
        .from("listings").select(COT_TIN_CUA_TOI).eq("seller_id", sid)
        .order("created_at", { ascending: false });
      setMine((ls ?? []) as Listing[]);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerId) return;
    if (rao.trim().length < 15) {
      setMsg("Câu rao ngắn quá - ghi thêm vị trí, quy mô, giá giúp em.");
      return;
    }
    setMsg("Đang đăng…");
    const code = `NMG-${Date.now().toString(36).toUpperCase()}`;
    const { data, error } = await supabase
      .from("listings")
      .insert({
        code,
        seller_id: sellerId,
        deal: "ban",
        district: quan.trim() || null,
        ward,
        description: rao.trim(),
        price_raw: priceRaw.trim() || null,
        status: "cho_thong_tin",
      })
      .select(COT_TIN_CUA_TOI).single();
    if (error) return setMsg("Đăng không được: " + error.message);
    setMine((m) => [data as Listing, ...m]);
    setRao(""); setPriceRaw(""); setQuan("Quận 5");
    setMsg(`Đã nhận tin #${code} - tụi em bóc tách chi tiết, đủ thông tin là tin tự lên web.`);
  };

  if (email === undefined) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-mute">Đang kiểm tra đăng nhập…</div>;
  }
  if (email === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Chưa đăng nhập</h1>
        <p className="mt-2 text-mute">Trang này dành cho nhà môi giới trong mạng lưới.</p>
        <Link href="/dang-nhap" className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 font-bold text-white">
          Đăng nhập bằng email
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Tin của anh chị</h1>
        <button
          onClick={() => supabase.auth.signOut().then(() => location.assign("/"))}
          className="text-sm text-mute hover:text-brand"
        >
          Đăng xuất ({email})
        </button>
      </div>

      <form onSubmit={submit} className="mt-6 rounded-king border border-line bg-white p-5">
        <h2 className="font-bold">Đăng tin mới - một câu là đủ</h2>
        <textarea
          value={rao}
          onChange={(e) => setRao(e.target.value)}
          rows={3}
          placeholder="Ví dụ: Bán nhà HXH xe tải quay đầu, gần ngã tư Trần Bình Trọng, 4x16 một trệt hai lầu, 9 tỉ bớt lộc"
          className="mt-3 w-full rounded-lg border border-line px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-brand"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-xs font-semibold text-mute">Phường (khu Quận 5 cũ - khu khác ghi trong câu rao)</span>
            <select value={ward} onChange={(e) => setWard(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2.5">
              {WARDS.map((w) => <option key={w}>{w}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-mute">Quận / huyện, tỉnh</span>
            <input value={quan} onChange={(e) => setQuan(e.target.value)}
              placeholder="VD: Quận 5 · Quận Tân Bình · Bến Lức, Long An"
              className="w-full rounded-lg border border-line px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-brand" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-mute">Giá rao (ghi tự nhiên)</span>
            <input value={priceRaw} onChange={(e) => setPriceRaw(e.target.value)}
              placeholder="9 tỉ bớt lộc"
              className="w-full rounded-lg border border-line px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-brand" />
          </label>
        </div>
        {msg && <p className="mt-3 text-sm font-medium text-navy">{msg}</p>}
        <button type="submit"
          className="mt-4 rounded-md bg-brand px-6 py-2.5 font-bold text-white transition hover:bg-brand-dark active:scale-[0.98]">
          Đăng tin
        </button>
      </form>

      <div className="mt-8 overflow-hidden rounded-king border border-line bg-white">
        {mine.map((l) => (
          <div key={l.id} className="border-b border-line px-5 py-3.5 last:border-0">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  #{l.code} · {l.description ? sanitizeDescription(l.description).slice(0, 60) : l.location_raw}
                </p>
                <p className="text-sm text-mute">
                  {l.ward} · {formatPrice(l.price_vnd, l.price_raw)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpCho((c) => (c === l.id ? null : l.id))}
                className="shrink-0 rounded-md border border-line px-3 py-1 text-xs font-semibold transition hover:border-brand hover:text-brand"
              >
                {upCho === l.id ? "Đóng" : "Thêm ảnh"}
              </button>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${
                l.status === "dang_ban" || l.status === "dang_quan_tam" ? "bg-brand/10 text-brand"
                : l.status === "da_chot" ? "bg-navy/10 text-navy"
                : "bg-cream text-mute"
              }`}>
                {STATUS_LABEL[l.status] ?? l.status}
              </span>
            </div>
            {upCho === l.id && (
              <div className="mt-3">
                <UploadAnh listingId={l.id} code={l.code} />
              </div>
            )}
          </div>
        ))}
        {mine.length === 0 && (
          <p className="p-8 text-center text-mute">Chưa có tin nào - đăng tin đầu tiên ở trên.</p>
        )}
      </div>
    </div>
  );
}
