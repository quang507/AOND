-- FR-157: neo hội thoại người bán theo CĂN — bản chép tham chiếu của hai
-- migration đã chạy (`seller_active_listing_anchor`, `info_request_sets_active_listing`).
--
-- Bệnh: `chat-reply` lấy câu hỏi đang chờ bằng `limit 1` theo `created_at`,
-- không nhìn căn nào. Người bán rao căn A và căn B, bot vừa hỏi B, chủ nhớ ra
-- chuyện A và nhắn "căn A hoàn công 2020 nha em" → fact của A ghi thẳng vào B.
--
-- Sai kiểu này KHÔNG BAO GIỜ tự lộ: fact vẫn có, tin vẫn lên web, không có lỗi
-- nào được ném, chỉ là dữ liệu thuộc về sai căn nhà. Tới lúc khách đi xem mới
-- vỡ, mà lúc đó không ai truy được vì sao.
--
-- Neo đặt ở TRIGGER chứ không ở chat-reply, vì câu hỏi drip sinh ra từ BỐN
-- đường: chat-reply, ask-seller, nudge, và cron seller_drip_tick. Nhét vào một
-- đường là ba đường kia vẫn để neo cũ — đúng kiểu vá một chỗ hở ba chỗ.

alter table public.sellers
  add column if not exists active_listing_id uuid references public.listings(id) on delete set null;

comment on column public.sellers.active_listing_id is
  'FR-157: can ma bot vua hoi nguoi ban. Cau tra loi khong neu ma tin thi ap vao can nay, khong ap vao cau hoi moi nhat.';

create index if not exists sellers_active_listing_idx
  on public.sellers(active_listing_id) where active_listing_id is not null;

create or replace function public.info_request_set_active_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status = 'pending' then
    update sellers s
       set active_listing_id = new.listing_id
      from listings l
     where l.id = new.listing_id
       and s.id = l.seller_id
       and s.active_listing_id is distinct from new.listing_id;
  end if;
  return null;
end
$fn$;

drop trigger if exists trg_info_request_set_active_listing on public.info_requests;
create trigger trg_info_request_set_active_listing
  after insert on public.info_requests
  for each row execute function public.info_request_set_active_listing();

comment on function public.info_request_set_active_listing() is
  'FR-157: moi cau hoi pending moi se neo sellers.active_listing_id sang dung can do.';

-- Phía chat-reply (v33) đọc neo này theo thứ tự tin cậy:
--   mã tin chủ tự nhắc trong tin  >  sellers.active_listing_id  >  câu mới nhất
-- và BẮT BUỘC nhắc mã căn + tên đường ngay trong câu hỏi drip. Neo phía DB
-- xong mà câu chữ hỏi trống không thì vẫn lệch, chỉ là lệch ở đầu bên kia.
