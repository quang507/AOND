-- 20261021b — Câu mẫu cố định bot nói nguyên văn, chủ dự án sửa ở CRM (SRS-5.1zzzzzzz106). Chủ dự án 21/10/2026: "trên chỗ mẫu câu
-- đưa thêm 1 bảng nhỏ ở 1 bên là các câu đã sửa thành mẫu từ lúc lấy lại các yêu cầu của anh Luận đến bây giờ… có gì vào sửa tiếp".
-- Lõi Python (src/aioi/cau_mau.py) đọc cột `cau` đè câu mặc định trong code, nhớ 60 giây; câu sửa hỏng thì dùng mặc định.
-- Dòng sinh từ cau_mau.MAC_DINH — thêm câu mới thì thêm vào đó và một migration mới.

create table if not exists public.cau_mau (
  khoa text primary key,
  cau text not null check (length(btrim(cau)) > 0),
  mac_dinh text not null,
  dung_o text not null,
  nguon text,
  thu_tu smallint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.cau_mau is '[BOT & HÀNG ĐỢI] Câu mẫu cố định bot nói nguyên văn (duyệt tin, hỏi phí, nhắc bản nháp, xin chấm sao, giữ chỗ khi lỗi). Chủ dự án sửa cột cau ở /admin/cau-chuan; lõi đọc đè câu mặc định trong code, nhớ 60 giây. Chỉ admin.';
comment on column public.cau_mau.khoa is 'Khoá câu trong lõi (cau_mau.MAC_DINH).';
comment on column public.cau_mau.cau is 'Câu đang dùng. {goi} = cách gọi khách (anh / chị / anh/chị), {Goi} = viết hoa chữ đầu.';
comment on column public.cau_mau.mac_dinh is 'Câu gốc trong code — để so / khôi phục.';
comment on column public.cau_mau.dung_o is 'Bot nói câu này ở đâu.';
comment on column public.cau_mau.nguon is 'Mục SRS / quyết định đã chốt câu.';

create or replace function public.cau_mau_cap_nhat_luc() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists cau_mau_cap_nhat_luc on public.cau_mau;
create trigger cau_mau_cap_nhat_luc before update on public.cau_mau for each row execute function public.cau_mau_cap_nhat_luc();

alter table public.cau_mau enable row level security;
revoke all on public.cau_mau from anon, authenticated;
grant select, update on public.cau_mau to authenticated;
drop policy if exists cau_mau_admin_doc on public.cau_mau;
create policy cau_mau_admin_doc on public.cau_mau for select to authenticated using (public.la_admin());
drop policy if exists cau_mau_admin_sua on public.cau_mau;
create policy cau_mau_admin_sua on public.cau_mau for update to authenticated using (public.la_admin()) with check (public.la_admin());

insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('duyet_tin', 'Em xin phép đăng tin ạ!', 'Em xin phép đăng tin ạ!', 'Khách duyệt bản nháp — đoạn đầu lời đáp (tin đã lên web)', 'SRS-5.1zzzzzzz103 · tester, chủ dự án 21/10', 1),
  ('hoi_phi', '{Goi} có thể vào aioinhadat.com để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?', '{Goi} có thể vào aioinhadat.com để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?', 'Ngay sau câu duyệt tin — tin nhắn thứ hai, câu hỏi phí (bot nói theo tinh thần câu này)', 'SRS-5.1zzzzzzz81 / 98 · bản anh Luận + câu tester 21/10', 2),
  ('nhac_ban_nhap', 'Em gửi {goi} bản nháp tin đăng, mình cần chỉnh sửa thêm nhắn em hỗ trợ ạ!', 'Em gửi {goi} bản nháp tin đăng, mình cần chỉnh sửa thêm nhắn em hỗ trợ ạ!', 'Tin nhắc sau 5 phút khách chưa trả lời bản nháp', 'SRS-5.1zzzzzzz99 / 101 · câu tester 21/10', 3),
  ('nhac_ban_nhap_em', 'Mình gửi em bản nháp tin đăng, em cần chỉnh sửa thêm nhắn mình hỗ trợ nhé!', 'Mình gửi em bản nháp tin đăng, em cần chỉnh sửa thêm nhắn mình hỗ trợ nhé!', 'Như trên, khi khách xưng "em" (bot xưng "mình")', 'SRS-5.1zzzzzzz101', 4),
  ('xin_cham_sao', '{Goi} chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.', '{Goi} chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.', 'Xin khách chấm sao — một lần, sau khi tin lên web và nói xong phí / khách mua đủ thông tin căn', 'SRS-5.1zzzzzzz104 · chủ dự án chốt 21/10', 5),
  ('xin_cham_sao_em', 'Em chấm giúp mình 1–5 sao cho lần hỗ trợ này nha, để mình làm tốt hơn nhé.', 'Em chấm giúp mình 1–5 sao cho lần hỗ trợ này nha, để mình làm tốt hơn nhé.', 'Như trên, khi khách xưng "em"', 'SRS-5.1zzzzzzz104', 6),
  ('giu_cho', 'Em đang xem kỹ thông tin anh/chị gửi, anh/chị chờ em một chút nhé, em trả lời ngay ạ.', 'Em đang xem kỹ thông tin anh/chị gửi, anh/chị chờ em một chút nhé, em trả lời ngay ạ.', 'Lượt trả lời bị lỗi — giữ chỗ, bot tự làm lại sau 20 giây', 'SRS-5.1zzzzzzz82 · đánh giá UX 20/10', 7),
  ('thu_lai_hong', 'Em xin lỗi anh/chị, hệ thống bên em đang chậm. Em đã báo anh/chị phụ trách xem tin của mình, anh/chị ấy sẽ nhắn lại sớm ạ.', 'Em xin lỗi anh/chị, hệ thống bên em đang chậm. Em đã báo anh/chị phụ trách xem tin của mình, anh/chị ấy sẽ nhắn lại sớm ạ.', 'Làm lại vẫn lỗi — xin lỗi và báo người phụ trách', 'SRS-5.1zzzzzzz82', 8)
on conflict (khoa) do update set mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
