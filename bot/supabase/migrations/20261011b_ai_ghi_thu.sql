-- 20261011b — Sổ ĐẦU RA MODEL của ID thử, để PHÁT LẠI offline (SRS-5.1zzzzzd, 11/10/2026).
--
-- Chủ dự án 11/10/2026: "sao sửa lỗi này vẫn lòi ra lỗi kia". Một nguyên nhân: bộ e2e dùng model GIẢ trả đúng điều người viết ca
-- đặt sẵn, nên nó kiểm giả định của người sửa chứ không kiểm model thật. Bảng này giữ đầu ra model THẬT của từng lượt chat-reply,
-- CHỈ cho ID thử (`la_id_thu`), để khách mô phỏng in ra thành ca phát lại (`bot/tests/phat-lai/`) chạy lại trên code mới mà không tốn
-- tiền. Không bao giờ có khách thật: hàm ghi tự bỏ qua ID không phải ID thử, bảng chỉ service_role ghi.
-- Dữ liệu là của người giả (persona) — vẫn che liên hệ phía edge function và gọt dãy giống SĐT ở đây (§5, repo public). Giữ 2 ngày.

create table if not exists public.ai_ghi_thu (
  id bigint generated always as identity primary key,
  zalo_user_id text not null,
  tin text not null default '',
  luot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.ai_ghi_thu is
  '[BOT & HÀNG ĐỢI] Đầu ra model THẬT của từng lượt chat-reply, CHỈ ID thử (la_id_thu) — khách mô phỏng in ra thành ca phát lại offline (bot/tests/phat-lai). Giữ 2 ngày, không phải dữ liệu nghiệp vụ. SRS-5.1zzzzzd.';
comment on column public.ai_ghi_thu.zalo_user_id is 'ID thử (la_id_thu) — hàm ghi_ai_thu từ chối mọi ID khác.';
comment on column public.ai_ghi_thu.tin is 'Tin khách của lượt (đã che liên hệ ở edge function, dãy giống SĐT gọt ở trigger).';
comment on column public.ai_ghi_thu.luot is 'Mảng lượt gọi model theo thứ tự: {kind create|parse, loai (loaiLuotAi), ra {po|chu|content|loi}} — xem _shared/ai/ghi-luot-ai.ts.';
create index if not exists ai_ghi_thu_zalo_idx on public.ai_ghi_thu (zalo_user_id, created_at);

create or replace function public.ai_ghi_thu_che_so()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Dãy giống SĐT (0 + 8–10 số). Không gọt mọi dãy ≥ 9 số như van_kich: trong JSON đó có thể là số giá (5200000000) — gọt là hỏng
  -- JSON lẫn hỏng phát lại; số JSON không bao giờ mở đầu bằng 0 nên mẫu này không chạm số JSON.
  new.tin := regexp_replace(coalesce(new.tin, ''), '\m0\d{8,10}\M', '#', 'g');
  new.luot := regexp_replace(coalesce(new.luot, '[]'::jsonb)::text, '\m0\d{8,10}\M', '#', 'g')::jsonb;
  return new;
end;
$$;
drop trigger if exists trg_ai_ghi_thu_che_so on public.ai_ghi_thu;
create trigger trg_ai_ghi_thu_che_so
  before insert or update on public.ai_ghi_thu
  for each row execute function public.ai_ghi_thu_che_so();

-- RLS: chỉ admin đọc; ghi qua hàm dưới (service_role). Bảng mới mặc định LỘ ở project này → revoke trước rồi mới grant.
alter table public.ai_ghi_thu enable row level security;
revoke all on public.ai_ghi_thu from anon, authenticated;
grant select on public.ai_ghi_thu to authenticated;
drop policy if exists ai_ghi_thu_admin_doc on public.ai_ghi_thu;
create policy ai_ghi_thu_admin_doc on public.ai_ghi_thu for select to authenticated using (public.la_admin());

create or replace function public.ghi_ai_thu(p_zalo text, p_tin text, p_luot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.la_id_thu(p_zalo) then return; end if;
  if jsonb_typeof(p_luot) is distinct from 'array' then return; end if;
  delete from public.ai_ghi_thu where created_at < now() - interval '2 days';
  insert into public.ai_ghi_thu (zalo_user_id, tin, luot) values (p_zalo, left(coalesce(p_tin, ''), 4000), p_luot);
end;
$$;
revoke all on function public.ghi_ai_thu(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ghi_ai_thu(text, text, jsonb) to service_role;
comment on function public.ghi_ai_thu(text, text, jsonb) is
  'Ghi đầu ra model một lượt của ID THỬ (la_id_thu; ID khác bỏ qua im lặng). Dọn dòng quá 2 ngày. Chỉ service_role. SRS-5.1zzzzzd.';
