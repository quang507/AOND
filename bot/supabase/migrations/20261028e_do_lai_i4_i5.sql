-- 20261028e_do_lai_i4_i5 — SRS-5.1zzzzzzz240 (chủ dự án 28/10/2026, OPEN-67 phương án a: "đếm lại từ bảng tin nhắn").
-- I4 / I5 luôn ra 0 từ khi lõi Python thay bot TypeScript: `buyers.last_contact_at` không ai ghi, `nmg_hoat_dong` đếm câu `info_requests`
-- nguồn `seller_flow` / `seller_drip` mà lõi không tạo. Nay đo từ `messages` — dữ liệu lõi ghi mỗi lượt, không thêm đường ghi mới.

-- I5 · NMG hoạt động: có tin đang rao VÀ có nhắn bot trong 7 ngày (tin `sender = 'seller'` ở hội thoại của chính họ). Giữ tên cột cũ
-- (`drip_answered_7d`, `last_answer_at`) vì `bao_nmg_can_moi` và `/admin` đọc theo tên; nghĩa nay là "tin người bán 7 ngày".
create or replace view public.nmg_hoat_dong as
 SELECT s.id,
    s.name,
    COALESCE(t.active, 0::bigint)::integer AS active_count,
    COALESCE(d.tra_loi_7d, 0::bigint)::integer AS drip_answered_7d,
    d.last_answer_at,
    COALESCE(t.active, 0::bigint) > 0 AND COALESCE(d.tra_loi_7d, 0::bigint) > 0 AS hoat_dong
   FROM sellers s
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text])) AS active
           FROM listings l
          WHERE l.seller_id = s.id) t ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS tra_loi_7d,
            max(m.created_at) AS last_answer_at
           FROM conversations c
             JOIN messages m ON m.conversation_id = c.id
          WHERE c.seller_id = s.id AND m.sender = 'seller'::msg_sender AND m.created_at >= (now() - '7 days'::interval)) d ON true
  WHERE s.seller_type = 'nmg'::seller_type AND (auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = (auth.jwt() ->> 'email'::text))));
comment on view public.nmg_hoat_dong is
  'I5 (SRS-5.1zzzzzzz240): NMG hoạt động = có tin đang rao và có tin nhắn của chính họ trong 7 ngày (đếm từ messages). drip_answered_7d = số tin người bán 7 ngày.';

-- I4 · Kết nối Zalo sống sau 30 ngày: mỗi khách mua (không phải ID thử) có tin đầu tiên từ ≥ 30 ngày trước; `song_sau_30_ngay` = khách
-- còn nhắn ít nhất một tin từ ngày thứ 30 trở đi. Tỉ lệ I4 = count(*) filter (where song_sau_30_ngay) / count(*).
-- security_invoker: bảng nguồn bật RLS không policy nên chỉ service_role đọc ra dòng — không thêm một view definer nữa vào danh sách
-- advisor (scripts/soat-db-da-biet.json).
create view public.ket_noi_zalo_song with (security_invoker = true) as
 SELECT b.id AS buyer_id,
    f.tin_dau_at,
    f.tin_cuoi_at,
    f.tin_cuoi_at >= (f.tin_dau_at + '30 days'::interval) AS song_sau_30_ngay
   FROM buyers b
     JOIN LATERAL ( SELECT min(m.created_at) AS tin_dau_at,
            max(m.created_at) AS tin_cuoi_at
           FROM conversations c
             JOIN messages m ON m.conversation_id = c.id
          WHERE c.buyer_id = b.id AND m.sender = 'buyer'::msg_sender) f ON f.tin_dau_at IS NOT NULL
  WHERE f.tin_dau_at <= (now() - '30 days'::interval) AND NOT COALESCE(public.la_id_thu(b.zalo_user_id), false);
revoke all on public.ket_noi_zalo_song from anon, authenticated;
grant all on public.ket_noi_zalo_song to service_role;
comment on view public.ket_noi_zalo_song is
  'I4 (SRS-5.1zzzzzzz240): khách mua có tin đầu ≥ 30 ngày trước; song_sau_30_ngay = còn nhắn từ ngày thứ 30. security_invoker — chỉ service_role đọc ra dòng.';
