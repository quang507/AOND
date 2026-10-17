// media-cleanup — dọn file vật lý sau khi dòng media đã biến mất (FR-165).
//
// VÌ SAO PHẢI CÓ HÀM NÀY. Postgres không xoá được object trong Storage; chỉ
// Storage API xoá được. Nên xoá một dòng `listing_media` KHÔNG đồng nghĩa file
// biến mất — nếu coi hai việc đó là một thì mỗi lần xoá/thay ảnh là bỏ lại một
// file mồ côi, âm thầm, tính tiền dung lượng mãi mãi.
//
// Cách làm: trigger trên `listing_media` ghi Ý ĐỊNH xoá vào
// `media_cleanup_queue`; hàm này mang ý định đó đi thực hiện rồi đánh dấu.
// Việc chưa `xong` thì vẫn nằm trong hàng đợi, nên hỏng lần này lượt sau làm
// lại — không có đường nào mất file mà không ai biết.
//
// Gọi bởi cron `media-cleanup-tick` (5 phút/lần) qua `net.http_post`, cùng lối
// với bot_health_tick. Trả JSON { da_xoa, loi, con_lai }.
import { ghiLoi, jsonResponse, serviceClient } from "../_shared/claude.ts";
import { congBiMat } from "../_shared/gate.ts";

type Viec = {
  id: string;
  bucket: string;
  storage_path: string;
  attempts: number;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const client = serviceClient();

  // Cùng cổng bí mật với chat-reply (`_shared/gate.ts`): hàm này xoá file
  // thật, không để ai gọi bừa.
  const chan = await congBiMat(req, client, "media-cleanup");
  if (chan) return chan;

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const { data: viecs, error: nhanErr } = await client
    .rpc("nhan_viec_don_media", { p_limit: 50 });
  if (nhanErr) {
    await ghiLoi(client, "media-cleanup nhan_viec", nhanErr.message);
    return jsonResponse({ error: nhanErr.message }, 500);
  }

  let daXoa = 0;
  let loi = 0;

  for (const v of (viecs ?? []) as Viec[]) {
    try {
      // Storage API là cửa DUY NHẤT xoá được object. Không đụng
      // `storage.objects` bằng SQL — Postgres chặn sẵn, và đúng ra là vậy.
      const r = await fetch(
        `${url}/storage/v1/object/${v.bucket}/${v.storage_path}`,
        {
          method: "DELETE",
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        },
      );

      // "File vốn đã không còn" = THÀNH CÔNG với công việc "hãy làm cho nó
      // biến mất". Coi là lỗi thì mọi lượt xoá lặp kẹt lại trong hàng đợi mãi.
      //
      // Cạm bẫy: Storage của Supabase KHÔNG trả HTTP 404 cho vật thể thiếu —
      // nó trả **HTTP 400** với thân JSON `{"statusCode":"404",
      // "code":"NoSuchKey"}`. Bản đầu chỉ soi `r.status === 404` nên không
      // bao giờ khớp, và việc dọn một file đã mất quay vòng vô tận (đo được
      // ở lượt chạy thử đầu tiên: da_xoa=0, loi=1). Phải đọc THÂN.
      const raw = await r.text();
      let xong = r.ok || r.status === 404;
      if (!xong) {
        try {
          const j = JSON.parse(raw);
          if (String(j?.statusCode) === "404" || j?.code === "NoSuchKey") xong = true;
        } catch { /* không phải JSON thì cứ coi là lỗi thật */ }
      }

      if (xong) {
        await client.from("media_cleanup_queue")
          .update({ trang_thai: "xong" }).eq("id", v.id);
        daXoa++;
      } else {
        const chiTiet = `${r.status} ${raw.slice(0, 200)}`;
        await client.from("media_cleanup_queue")
          .update({ trang_thai: "loi", last_error: chiTiet }).eq("id", v.id);
        await ghiLoi(client, "media-cleanup xoa object", chiTiet, r.status);
        loi++;
      }
    } catch (e) {
      // Mạng đứt giữa chừng: để nguyên trạng thái `dang_lam`, hết 10 phút là
      // `nhan_viec_don_media` tự nhặt lại. FR-152: mọi catch phải vào sổ.
      const chiTiet = e instanceof Error ? e.message : String(e);
      await client.from("media_cleanup_queue")
        .update({ trang_thai: "loi", last_error: chiTiet.slice(0, 200) })
        .eq("id", v.id);
      await ghiLoi(client, "media-cleanup fetch", e);
      loi++;
    }
  }

  const { count: conLai } = await client.from("media_cleanup_queue")
    .select("id", { count: "exact", head: true })
    .in("trang_thai", ["cho", "dang_lam", "loi"]);

  return jsonResponse({ da_xoa: daXoa, loi, con_lai: conLai ?? 0 });
});
