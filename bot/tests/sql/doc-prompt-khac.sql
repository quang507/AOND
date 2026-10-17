-- doc-prompt-khac.sql — doc_prompt_khac chỉ trả khoá được hỏi mà nội dung DB khác mã băm bản code (20261003c, SRS-5.1zl).
begin;
set local client_min_messages = warning;
delete from bot_prompts where key in ('k_trung', 'k_khac', 'k_khong_hoi');
insert into bot_prompts (key, content) values ('k_trung', 'Giọng chuẩn — có dấu'), ('k_khac', 'bản sửa tay'), ('k_khong_hoi', 'x');
do $$ declare kq text[]; begin
  select array_agg(key order by key) into kq from doc_prompt_khac(jsonb_build_object(
    'k_trung', encode(sha256(convert_to('Giọng chuẩn — có dấu', 'UTF8')), 'hex'),
    'k_khac', encode(sha256(convert_to('bản code', 'UTF8')), 'hex'),
    'k_chi_code', 'abc'));
  if kq is distinct from array['k_khac'] then raise exception 'SAI: doc_prompt_khac trả %, mong {k_khac}', kq; end if;
end $$;
rollback;
