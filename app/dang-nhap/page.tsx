"use client";
// Đăng nhập chung (FR-124/126): Google OAuth hoặc magic link email.
// Người mua đăng nhập là TỰ NGUYỆN (lưu tin đã xem, nhận khuyến nghị) —
// không đăng nhập vẫn dùng web + Zalo đầy đủ. CCRB rao qua Zalo (INS-05).
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function LoginForm() {
  const q = useSearchParams();
  const next = q.get("next") === "quan-ly" ? "/quan-ly" : "/tai-khoan";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}${next}` },
    });
    if (error) {
      setState("error");
      setErrMsg(
        "Google chưa bật: " + error.message +
        " (cần bật Google provider trong Supabase - Authentication - Providers)",
      );
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setState("error");
      setErrMsg("Email chưa đúng định dạng - anh chị xem lại giúp em.");
      return;
    }
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}${next}` },
    });
    if (error) {
      setState("error");
      setErrMsg("Gửi không được: " + error.message);
    } else {
      setState("sent");
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-extrabold">Đăng nhập</h1>
      <p className="mt-2 text-mute">
        Người mua: lưu tin đã xem, nhận gợi ý căn hợp gu. Nhà môi giới: quản lý
        tin đã đăng. Không đăng nhập vẫn xem và hỏi Zalo thoải mái.
      </p>

      <button
        onClick={google}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-line bg-white py-3 font-bold transition hover:border-brand active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z"/>
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.2-7-5.1l-3.9 3C3.1 21.3 7.2 24 12 24z"/>
          <path fill="#FBBC05" d="M5 14.3c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3l-3.9-3C.4 8.2 0 10 0 12s.4 3.8 1.1 5.3l3.9-3z"/>
          <path fill="#EA4335" d="M12 4.6c2.2 0 3.7 1 4.6 1.8l3.3-3.2C18 1.2 15.2 0 12 0 7.2 0 3.1 2.7 1.1 6.7l3.9 3c1-2.9 3.8-5.1 7-5.1z"/>
        </svg>
        Đăng nhập bằng Google
      </button>
      <p className="my-4 text-center text-xs text-mute">- hoặc qua email -</p>

      {state === "sent" ? (
        <div className="mt-8 rounded-king border border-line bg-white p-6">
          <p className="font-bold">Đã gửi link vào {email}.</p>
          <p className="mt-1 text-sm text-mute">
            Mở email (kiểm tra cả mục spam) và bấm link để vào trang quản lý.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 rounded-king border border-line bg-white p-6">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-mute">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@congty.vn"
              className="w-full rounded-lg border border-line px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-brand"
            />
          </label>
          {state === "error" && <p className="mt-2 text-sm font-medium text-brand">{errMsg}</p>}
          <button
            type="submit"
            disabled={state === "sending"}
            className="mt-4 w-full rounded-full bg-brand py-3 font-bold text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60"
          >
            {state === "sending" ? "Đang gửi…" : "Gửi link đăng nhập"}
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-mute">
        Anh chị là <strong>chính chủ</strong> muốn rao? Không cần tài khoản -{" "}
        <a href="/raoban" className="font-semibold text-brand hover:underline">rao qua Zalo một câu là xong</a>.
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
