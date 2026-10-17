"use client";
// Admin tự đăng tin (FR-156) — cho nguồn KHÔNG đi qua Zalo OA: tin nhặt trên
// Facebook, Chợ Tốt, sổ tay CTV, khách quen gọi điện.
//
// Mọi thứ đi qua RPC `admin_dang_tin`: hàm đó tự kiểm quyền theo bảng `admins`
// và tự sinh mã nối tiếp dãy BDS-Q5-####. Trang này KHÔNG được cấp quyền đọc
// bảng `sellers` (bảng chứa số điện thoại thật) — danh sách người bán ở ô xổ
// xuống lấy từ view `seller_ranks`, view đó chỉ lộ tên + số đếm + hạng.
//
// Số điện thoại và Zalo ID chỉ được ghi khi admin CHỦ ĐỘNG tích ô. Mặc định
// không tích: người bán nhặt trên Facebook thì mình chưa có quyền giữ số của
// họ, và một cột NULL bao giờ cũng an toàn hơn một cột lỡ tay.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { TYPE_LABEL } from "@/lib/format";
import { PHUONG_MOI } from "@/bot/supabase/functions/_shared/extraction/ds-phuong";
import UploadAnh from "@/components/UploadAnh";

const NGUON = [
  ["admin", "Tự nhập (admin)"],
  ["facebook", "Facebook / hội nhóm"],
  ["chotot", "Chợ Tốt"],
  ["batdongsan", "Batdongsan.com.vn"],
  ["ctv", "Cộng tác viên"],
  ["khach_quen", "Khách quen giới thiệu"],
  ["di_duong", "Đi đường thấy bảng"],
  ["khac", "Nguồn khác"],
] as const;

// Nhãn loại BĐS lấy từ bảng dùng chung (lib/format TYPE_LABEL — FR-171 j),
// thêm lựa chọn "chưa rõ" riêng của form.
const LOAI: readonly (readonly [string, string])[] = [
  ["chua_ro", "Chưa rõ - để bot tự đoán"],
  ...Object.entries(TYPE_LABEL),
];

const TRANG_THAI = [
  ["cho_thong_tin", "Chờ duyệt - chưa lên web"],
  ["dang_ban", "Đăng luôn - lên web ngay"],
] as const;

// Kho đang có tin ở Phường 1–16 (Quận 5 cũ + rìa Quận 10/1 sáp nhập). Địa bàn
// đã mở ra Sài Gòn (phường mới) + Long An (FR-174): quận/huyện gõ tay ở ô riêng,
// danh sách phường theo địa giới mới chờ bảng `wards` (OPEN-27 nửa sau).
// Trước đây tự đếm 1..16 — "Phường 16" không có trong WARD_CENTROIDS nên trang
// tin không vẽ được bản đồ và không vào trang tag phường nào (FR-171 j gọi đích
// danh bản 16 này là một trong bốn bản lệch).
// SRS-5.1zzzzj (09/10/2026): cột `listings.ward` chỉ nhận tên phường MỚI (`wards.ten_day_du`) — DB để trống + ghi sổ lỗi mọi chữ
// khác (20261009b). Danh sách cũ "Phường 1–15" (Quận 5 cũ) sẽ bị DB xoá ngay khi lưu, nên chọn trong 168 phường / xã mới, kèm quận cũ.
const PHUONG: Array<[string, string]> = [...PHUONG_MOI]
  .sort((a, b) => a[2].localeCompare(b[2], "vi") || a[0].localeCompare(b[0], "vi"))
  .map(([, tenDu, quanCu]) => [tenDu, `${tenDu} (${quanCu} cũ)`]);

type Ng = { id: string; name: string | null; seller_type: string; active_count: number; rank: string };

const HANG: Record<string, string> = { dong: "Đồng", bac: "Bạc", vang: "Vàng" };

export default function Page() {
  const [role, setRole] = useState<"loading" | "chan" | "admin">("loading");
  const [nguoiBan, setNguoiBan] = useState<Ng[]>([]);
  const [dangGui, setDangGui] = useState(false);
  const [ketQua, setKetQua] = useState<{ ok: boolean; text: string; code?: string; id?: string } | null>(null);

  // Form
  const [deal, setDeal] = useState("ban");
  const [loai, setLoai] = useState("chua_ro");
  const [ward, setWard] = useState("");
  const [quan, setQuan] = useState("Quận 5");
  const [diaChi, setDiaChi] = useState("");
  const [giaRaw, setGiaRaw] = useState("");
  const [dienTich, setDienTich] = useState("");
  const [pn, setPn] = useState("");
  const [moTa, setMoTa] = useState("");
  const [nguon, setNguon] = useState<string>("admin");
  const [trangThai, setTrangThai] = useState("cho_thong_tin");

  const [banAi, setBanAi] = useState("");           // "" = không gắn, "moi" = tạo mới, else uuid
  const [tenBan, setTenBan] = useState("");
  const [loaiBan, setLoaiBan] = useState("ccrb");
  const [luuSdt, setLuuSdt] = useState(false);
  const [sdt, setSdt] = useState("");
  const [luuZalo, setLuuZalo] = useState(false);
  const [zalo, setZalo] = useState("");

  // Xem trước số tiền: gọi THẲNG parse_vnd dưới DB thay vì chép luật sang JS.
  // Chép sang là có hai bộ luật, và bộ JS sẽ sai trước — `\b` của JavaScript
  // không hiểu dấu tiếng Việt, đúng cái bẫy đã ăn ba lần ở chat-reply.
  const [giaSo, setGiaSo] = useState<number | null>(null);
  useEffect(() => {
    const raw = giaRaw.trim();
    if (!raw) { setGiaSo(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("parse_vnd", { p: raw });
      setGiaSo(typeof data === "number" ? data : null);
    }, 350);
    return () => clearTimeout(t);
  }, [giaRaw]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setRole("chan");
      const { data: a } = await supabase
        .from("admins").select("email").eq("email", user.email ?? "").maybeSingle();
      if (!a) return setRole("chan");
      setRole("admin");
      const { data: ds } = await supabase
        .from("seller_ranks").select("id, name, seller_type, active_count, rank")
        .order("active_count", { ascending: false });
      setNguoiBan((ds ?? []) as Ng[]);
    });
  }, []);

  const thieu = useMemo(() => {
    const t: string[] = [];
    if (!giaRaw.trim()) t.push("giá");
    if (!diaChi.trim() && !moTa.trim()) t.push("địa chỉ hoặc mô tả");
    if (banAi === "moi" && !tenBan.trim()) t.push("tên người bán");
    if (banAi === "moi" && luuSdt && !sdt.trim()) t.push("số điện thoại (đã tích ô lưu)");
    if (banAi === "moi" && luuZalo && !zalo.trim()) t.push("Zalo ID (đã tích ô lưu)");
    return t;
  }, [giaRaw, diaChi, moTa, banAi, tenBan, luuSdt, sdt, luuZalo, zalo]);

  const guiDi = async () => {
    if (thieu.length) return;
    setDangGui(true);
    setKetQua(null);
    const { data, error } = await supabase.rpc("admin_dang_tin", {
      p: {
        deal,
        property_type: loai,
        ward: ward || null,
        district: quan.trim() || null,
        location_raw: diaChi || null,
        price_raw: giaRaw,
        area_m2: dienTich || null,
        bedrooms: pn || null,
        description: moTa || null,
        source: nguon,
        status: trangThai,
        seller_id: banAi && banAi !== "moi" ? banAi : null,
        seller_name: banAi === "moi" ? tenBan : null,
        seller_type: banAi === "moi" ? loaiBan : null,
        // Không tích ô = không gửi lên, không phải gửi chuỗi rỗng.
        seller_phone: banAi === "moi" && luuSdt ? sdt : null,
        seller_zalo: banAi === "moi" && luuZalo ? zalo : null,
      },
    });
    setDangGui(false);
    if (error) {
      setKetQua({ ok: false, text: error.message });
      return;
    }
    const r = data as { id: string; code: string; price_vnd: number | null };
    setKetQua({
      ok: true,
      code: r.code,
      id: r.id,
      text: `Đã tạo tin #${r.code}${
        r.price_vnd ? ` · giá đọc ra ${r.price_vnd.toLocaleString("vi-VN")} đ` : " · CHƯA đọc được giá ra số"
      }`,
    });
    setDiaChi(""); setGiaRaw(""); setDienTich(""); setPn(""); setMoTa("");
    setTenBan(""); setSdt(""); setZalo(""); setLuuSdt(false); setLuuZalo(false); setBanAi("");
  };

  if (role === "loading") {
    return <div className="mx-auto max-w-4xl px-4 py-16 text-mute">Đang kiểm tra quyền…</div>;
  }
  if (role === "chan") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Khu vực quản trị</h1>
        <p className="mt-2 text-mute">Cần đăng nhập bằng tài khoản quản trị.</p>
        <Link href="/dang-nhap" className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 font-bold text-white">
          Đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Đăng tin thủ công</h1>
        <Link href="/admin" className="text-sm font-semibold text-mute hover:text-brand">
          Về trang duyệt tin
        </Link>
      </div>
      <p className="mt-1 text-sm text-mute">
        Dành cho tin không đi qua Zalo OA. Mã tin sinh tự động nối tiếp dãy BDS-Q5.
      </p>

      <div className="mt-7 space-y-6">
        <Khoi tieuDe="Bất động sản">
          <div className="grid gap-4 sm:grid-cols-2">
            <Chon nhan="Hình thức" giaTri={deal} doi={setDeal}
              chon={[["ban", "Bán"], ["cho_thue", "Cho thuê"]]} />
            <Chon nhan="Loại bất động sản" giaTri={loai} doi={setLoai} chon={LOAI} />
            <Chon nhan="Phường / xã (tên mới)" giaTri={ward} doi={setWard}
              chon={[["", "- chưa rõ -"], ...PHUONG]} />
            <O nhan="Quận / huyện, tỉnh" giaTri={quan} doi={setQuan}
              goiY="VD: Quận 5 · Quận Tân Bình · Bến Lức, Long An" />
            <O nhan="Địa chỉ / tên đường" giaTri={diaChi} doi={setDiaChi}
              goiY="VD: 123/45 Trần Bình Trọng" />
          </div>
        </Khoi>

        <Khoi tieuDe="Giá và thông số">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <O nhan="Giá (gõ y như người rao nói)" giaTri={giaRaw} doi={setGiaRaw}
                goiY='VD: "5 tỏi rưỡi", "12 củ/tháng", "6ty2 TL"' />
              {/* Bằng chứng ngay tại chỗ rằng máy đọc ra số, trước khi bấm lưu.
                  Đọc không ra thì tin vẫn đăng được nhưng nằm ngoài bộ lọc giá. */}
              <p className={`mt-1.5 text-sm tabular-nums ${giaSo ? "text-brand" : "text-mute"}`}>
                {giaRaw.trim() === ""
                  ? "Máy sẽ tự đổi ra số để lọc theo khoảng giá."
                  : giaSo
                    ? `Máy đọc ra: ${giaSo.toLocaleString("vi-VN")} đ`
                    : "Máy CHƯA đọc ra số - tin vẫn đăng được nhưng sẽ không hiện ở bộ lọc theo giá."}
              </p>
            </div>
            <O nhan="Diện tích (m²)" giaTri={dienTich} doi={setDienTich} goiY="60" kieu="number" />
            <O nhan="Số phòng ngủ" giaTri={pn} doi={setPn} goiY="3" kieu="number" />
            <Chon nhan="Trạng thái" giaTri={trangThai} doi={setTrangThai} chon={TRANG_THAI} />
          </div>
          <div className="mt-4">
            <label className="eyebrow text-mute">Mô tả - giữ nguyên văn người rao</label>
            <textarea
              value={moTa} onChange={(e) => setMoTa(e.target.value)} rows={5}
              placeholder="Dán nguyên câu rao vào đây. Đừng viết lại cho hay - văn phong người rao là thứ khách tin."
              className="mt-1.5 w-full rounded-shot border border-line bg-white px-3.5 py-2.5 outline-none focus:border-brand"
            />
            <p className="mt-1 text-xs text-mute">
              Web tự lọc số điện thoại khỏi mô tả trước khi hiện (FR-104).
            </p>
          </div>
        </Khoi>

        <Khoi tieuDe="Nguồn tin">
          <Chon nhan="Lấy tin từ đâu" giaTri={nguon} doi={setNguon} chon={NGUON} />
        </Khoi>

        <Khoi tieuDe="Người bán">
          <Chon
            nhan="Gắn tin cho ai" giaTri={banAi} doi={setBanAi}
            chon={[
              ["", "- không gắn ai (điền sau) -"],
              ["moi", "+ Thêm người bán mới"],
              ...nguoiBan.map((n) => [
                n.id,
                `${n.name ?? "Không tên"} · ${n.seller_type.toUpperCase()} · ${n.active_count} tin · hạng ${HANG[n.rank] ?? n.rank}`,
              ] as [string, string]),
            ]}
          />

          {banAi === "moi" && (
            <div className="mt-4 space-y-4 rounded-shot border border-line bg-cream/60 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <O nhan="Tên người bán" giaTri={tenBan} doi={setTenBan} goiY="VD: chị Dương" />
                <Chon nhan="Vai" giaTri={loaiBan} doi={setLoaiBan}
                  chon={[["ccrb", "CCRB - chính chủ"], ["nmg", "NMG - nhà môi giới"]]} />
              </div>

              {/* Hai ô tích này là ranh giới dữ liệu cá nhân, không phải tiện ích
                  UI. Không tích thì cột trong DB là NULL - mình không giữ số của
                  người chưa đồng ý cho giữ. */}
              <TichVaO
                tich={luuSdt} doiTich={setLuuSdt} giaTri={sdt} doi={setSdt}
                nhan="Lưu số điện thoại" goiY="0903xxxxxx"
                ghiChu="Chỉ tích khi người ta đồng ý cho mình giữ số."
              />
              <TichVaO
                tich={luuZalo} doiTich={setLuuZalo} giaTri={zalo} doi={setZalo}
                nhan="Lưu Zalo ID" goiY="ID người dùng Zalo"
                ghiChu="Có Zalo ID thì bot nhận ra người này khi họ nhắn vào OA."
              />
            </div>
          )}
        </Khoi>

        {thieu.length > 0 && (
          <p className="text-sm text-mute">Còn thiếu: {thieu.join(", ")}.</p>
        )}

        {/* FR-96 (04/09/2026): vừa lưu xong là có UUID tin - up ảnh ngay tại đây,
            khỏi phải chạy scripts/up-anh.mjs trên máy local. */}
        {ketQua?.ok && ketQua.id && (
          <UploadAnh listingId={ketQua.id} code={ketQua.code} />
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={guiDi} disabled={dangGui || thieu.length > 0}
            className="rounded-md bg-brand px-7 py-2.5 font-bold text-white transition hover:bg-brand-dark disabled:opacity-40"
          >
            {dangGui ? "Đang lưu…" : "Lưu tin"}
          </button>
          {/* 14/09/2026 (soát Shneiderman #1): thành công từng màu cam, lỗi màu navy — lỗi trông như
              chữ thường. Tin vừa đăng thường CHƯA lên kệ nên link trang công khai là 404 → mở màn sửa. */}
          {ketQua && (
            <span role={ketQua.ok ? "status" : "alert"} className={`text-sm font-semibold ${ketQua.ok ? "text-emerald-800" : "text-red-700"}`}>
              {ketQua.text}
              {ketQua.ok && ketQua.code && (
                <Link href={`/admin/ro-hang?sua=${encodeURIComponent(ketQua.code)}`}
                  className="ml-2 underline">
                  mở tin để xem &amp; rao →
                </Link>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Khoi({ tieuDe, children }: { tieuDe: string; children: React.ReactNode }) {
  return (
    <section className="rounded-king border border-line bg-white p-5">
      <h2 className="eyebrow text-mute">{tieuDe}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function O({
  nhan, giaTri, doi, goiY, kieu = "text",
}: {
  nhan: string; giaTri: string; doi: (v: string) => void; goiY?: string; kieu?: string;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-mute">{nhan}</span>
      <input
        type={kieu} value={giaTri} onChange={(e) => doi(e.target.value)} placeholder={goiY}
        className="mt-1.5 w-full rounded-shot border border-line bg-white px-3.5 py-2.5 outline-none focus:border-brand"
      />
    </label>
  );
}

function Chon({
  nhan, giaTri, doi, chon,
}: {
  nhan: string; giaTri: string; doi: (v: string) => void;
  chon: readonly (readonly [string, string])[];
}) {
  return (
    <label className="block">
      <span className="eyebrow text-mute">{nhan}</span>
      <select
        value={giaTri} onChange={(e) => doi(e.target.value)}
        className="mt-1.5 w-full rounded-shot border border-line bg-white px-3.5 py-2.5 outline-none focus:border-brand"
      >
        {chon.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
    </label>
  );
}

function TichVaO({
  tich, doiTich, giaTri, doi, nhan, goiY, ghiChu,
}: {
  tich: boolean; doiTich: (v: boolean) => void;
  giaTri: string; doi: (v: string) => void;
  nhan: string; goiY: string; ghiChu: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-2.5 font-semibold">
        <input type="checkbox" checked={tich} onChange={(e) => doiTich(e.target.checked)}
          className="h-4 w-4 accent-brand" />
        {nhan}
      </label>
      {tich ? (
        <input
          value={giaTri} onChange={(e) => doi(e.target.value)} placeholder={goiY}
          className="mt-2 w-full rounded-shot border border-line bg-white px-3.5 py-2.5 outline-none focus:border-brand"
        />
      ) : (
        <p className="mt-1 text-xs text-mute">{ghiChu}</p>
      )}
    </div>
  );
}
