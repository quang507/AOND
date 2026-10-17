"use client";
// /admin/prompt — SỬA GIỌNG BOT NGAY TRONG CRM (FR-200).
//
// Chủ dự án 10/09/2026: "có chỗ để điều chỉnh prompt bot trong crm, tao chỉ cần
// sửa chỗ đó thì nó đồng bộ hết luôn chưa".
//
// Câu trả lời có hai nửa, và trang này phải nói ra CẢ HAI, vì nửa sau đã từng
// làm hỏng việc thật:
//   ĐỒNG BỘ  — bảng `bot_prompts` ĐÈ bản trong code lúc chạy, cả 5 edge function
//              đọc chung. Lưu ở đây là mọi kênh đổi trong 60 giây, không deploy.
//   KHÔNG ĐỒNG BỘ — bản trong git (`_shared/prompts.ts`) vẫn là bản cũ. Ngày
//              10/09 hai bên trôi xa nhau và bot chạy bộ câu hỏi CŨ mấy ngày mà
//              không ai biết. Nên mỗi khoá ở đây đều so với bản trong code và
//              nói thẳng "khớp" hay "lệch".
//
// Bản trong code nhập THẲNG từ `bot/supabase/functions/_shared/prompts.ts` —
// đúng file bot dùng, không phải bản chép tay. Chép tay là lại đẻ ra nguồn sự
// thật thứ ba.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BAN_TRONG_CODE, MO_TA_KHOA } from "./ban-code";

type Prompt = { key: string; content: string; updated_at: string; sua_boi: string | null };

const luc = (s: string) => new Date(s).toLocaleString("vi-VN", { hour12: false });

export default function Page() {
  const [role, setRole] = useState<"loading" | "anon" | "user" | "admin">("loading");
  const [ds, setDs] = useState<Prompt[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [mo, setMo] = useState<string | null>(null);
  const [nhap, setNhap] = useState("");
  const [dangLuu, setDangLuu] = useState(false);
  const [vuaLuu, setVuaLuu] = useState<string | null>(null);

  const nap = useCallback(async () => {
    const { data, error } = await supabase.rpc("doc_bot_prompts");
    if (error) setLoi(error.message);
    else setDs((data ?? []) as Prompt[]);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setRole("anon");
      const { data: a } = await supabase.from("admins").select("email").eq("email", user.email ?? "").maybeSingle();
      if (!a) return setRole("user");
      setRole("admin");
      await nap();
    });
  }, [nap]);

  // Khoá nào DB đang khác bản trong code. So chuỗi trần: prompt là văn bản, một
  // dấu cách thừa cũng là một lượt lệch cần biết.
  const lech = useMemo(() => {
    const m = new Set<string>();
    for (const p of ds) {
      const code = BAN_TRONG_CODE[p.key];
      if (code !== undefined && code.trim() !== (p.content ?? "").trim()) m.add(p.key);
    }
    return m;
  }, [ds]);

  // Khoá có trong code mà DB CHƯA CÓ — bot vẫn chạy (code là bản dự phòng),
  // nhưng sửa ở đây thì không thấy nó, nên phải hiện ra.
  const thieuTrongDb = useMemo(
    () => Object.keys(BAN_TRONG_CODE).filter((k) => !ds.some((p) => p.key === k)),
    [ds],
  );

  const luu = async (key: string) => {
    setDangLuu(true);
    const { error } = await supabase.rpc("sua_bot_prompt", { p_key: key, p_content: nhap });
    setDangLuu(false);
    if (error) return alert(`Không lưu được: ${error.message}`);
    setVuaLuu(key);
    setMo(null);
    await nap();
    setTimeout(() => setVuaLuu(null), 6000);
  };

  const dungBanCode = (key: string) => {
    const code = BAN_TRONG_CODE[key];
    if (code === undefined) return;
    if (!confirm(`Thay nội dung đang sửa bằng BẢN TRONG CODE của "${key}"?`)) return;
    setNhap(code);
  };

  if (role === "loading") return <p className="p-6 text-mute">Đang kiểm tra quyền…</p>;
  if (role !== "admin") {
    return (
      <div className="p-6">
        <p className="font-bold text-navy">Trang này chỉ dành cho quản trị.</p>
        <Link href="/admin" className="text-brand font-semibold">← Về bàn làm việc</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-navy">Giọng bot &amp; luật trả lời</h1>
        <p className="max-w-[80ch] text-sm text-mute">
          Sửa ở đây là <b className="text-navy">bot đổi trong vòng 60 giây</b>, mọi kênh (Zalo OA,
          Zalo cá nhân, web), <b className="text-navy">không cần deploy</b> — bảng này đè bản trong code lúc chạy.
        </p>
        <p className="max-w-[80ch] text-sm text-mute">
          Thứ <b className="text-navy">không</b> tự đồng bộ: bản trong mã nguồn (git). Khoá nào lệch sẽ có nhãn
          <span className="mx-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">lệch với code</span>
          — người làm kỹ thuật chạy <code className="rounded-md bg-navy/[0.06] px-1">bun run prompt --keo</code> rồi mở PR để kéo về. Bot vẫn chạy bản trên màn này.
        </p>
      </header>

      {loi && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{loi}</p>}

      {thieuTrongDb.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Có {thieuTrongDb.length} khoá chỉ nằm trong code, chưa có trong kho: <b>{thieuTrongDb.join(", ")}</b>.
          Bot đang dùng bản trong code. Bấm “Thêm từ code” để đưa vào đây rồi sửa được.
          <span className="ml-2 inline-flex flex-wrap gap-1">
            {thieuTrongDb.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setMo(k); setNhap(BAN_TRONG_CODE[k] ?? ""); }}
                className="rounded-md border border-amber-400 bg-white px-2 py-0.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
              >
                Thêm {k}
              </button>
            ))}
          </span>
        </p>
      )}

      <ul className="space-y-3">
        {[...ds, ...thieuTrongDb.filter((k) => mo === k).map((k) => ({
          key: k, content: "", updated_at: new Date().toISOString(), sua_boi: null,
        }))].map((p) => {
          const dangMo = mo === p.key;
          return (
            <li key={p.key} className="rounded-lg border border-line bg-white">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/70 px-4 py-3">
                <span className="font-mono text-sm font-bold text-navy">{p.key}</span>
                {lech.has(p.key) ? (
                  <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                    lệch với code
                  </span>
                ) : (
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                    khớp code
                  </span>
                )}
                {vuaLuu === p.key && (
                  <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                    đã lưu — bot đổi trong 60 giây
                  </span>
                )}
                <span className="text-xs text-mute">{MO_TA_KHOA[p.key] ?? "—"}</span>
                <span className="ml-auto text-xs text-mute tabular-nums">
                  {p.content ? `${p.content.length.toLocaleString("vi-VN")} ký tự · ` : ""}
                  sửa {luc(p.updated_at)}{p.sua_boi ? ` · ${p.sua_boi}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => { setMo(dangMo ? null : p.key); setNhap(p.content ?? ""); }}
                  className="rounded-md border border-mute/40 bg-white px-3 py-1 text-xs font-bold text-navy hover:border-brand hover:text-brand"
                >
                  {dangMo ? "Đóng" : "Sửa"}
                </button>
              </div>

              {dangMo ? (
                <div className="space-y-2 p-4">
                  <textarea
                    value={nhap}
                    onChange={(e) => setNhap(e.target.value)}
                    rows={18}
                    spellCheck={false}
                    className="w-full rounded-md border border-line p-3 font-mono text-[13px] leading-relaxed"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => luu(p.key)}
                      disabled={dangLuu || !nhap.trim()}
                      className="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      {dangLuu ? "Đang lưu…" : "Lưu — bot dùng ngay"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMo(null)}
                      className="rounded-md border border-line px-4 py-2 text-sm font-bold text-mute hover:text-navy"
                    >
                      Huỷ
                    </button>
                    {BAN_TRONG_CODE[p.key] !== undefined && (
                      <button
                        type="button"
                        onClick={() => dungBanCode(p.key)}
                        className="rounded-md border border-mute/40 px-4 py-2 text-sm font-bold text-navy hover:border-brand hover:text-brand"
                        title="Lấy lại nguyên văn bản đang nằm trong mã nguồn"
                      >
                        Lấy bản trong code
                      </button>
                    )}
                    {!nhap.trim() && (
                      <span className="text-xs font-semibold text-red-600">
                        Để trống là bot mất luật — không lưu được.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <pre className="max-h-40 overflow-hidden whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed text-navy/80">
                  {(p.content ?? "").slice(0, 600)}{(p.content ?? "").length > 600 ? "…" : ""}
                </pre>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-mute">
        Câu chào, câu hỏi mẫu và các câu tiền định cũng nằm ở đây (<code>loi_chao</code>,{" "}
        <code>cau_hoi_mau</code>, <code>cau_tien_dinh</code>) — chúng là JSON, sửa sai dấu ngoặc thì bot quay về
        bản trong code chứ không im lặng hỏng.
      </p>
    </div>
  );
}
