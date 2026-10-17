-- 20260916c — Thứ tự hỏi (FR-177 a): gấp lùi sau pháp lý, tiềm năng dời sang hỏi bù,
-- căn hộ hỏi nội thất trước hướng ban công.
--
-- VÌ SAO. Chủ dự án 16/09/2026 ("làm cả 4 đi") sau khi xem thứ tự hỏi thật trên
-- production: (1) "cần bán gấp hay được giá" hỏi ngay sau giá nghe như ép khách —
-- để sau pháp lý, ngay trước ảnh; (2) "tiềm năng sử dụng" hay nhận câu trả lời lạc
-- (ghi rác hoặc bị bỏ qua) — dời sang nhóm hỏi bù sau đăng (ask-seller); (3) căn hộ:
-- người thuê quan tâm nội thất hơn hướng ban công — đổi chỗ (áp cho cả bán lẫn
-- thuê vì dòng `required_facts` của chung_cu dùng chung deal). Điểm (4) "một câu
-- hỏi tối đa 2 lần trong chat" nằm ở chat-reply (né-2-lần → né-1-lần), không ở đây.
--
-- `gap` chuyển nhóm co_ban → chuyen_mon: `chonCauKe` xếp NHÓM trước priority sau,
-- gấp ở nhóm cơ bản thì đổi priority cũng không lùi được.

update public.required_facts g
   set nhom = 'chuyen_mon',
       priority = least(18, coalesce((
         select max(p.priority) from public.required_facts p
          where p.property_type = g.property_type and p.deal is null and p.nhom = 'chuyen_mon'
            and p.fact_key not in ('hinh_anh', 'tiem_nang', 'gap')), 17) + 1)
 where g.fact_key = 'gap';

update public.required_facts set nhom = 'sau_dang', priority = 39 where fact_key = 'tiem_nang';

update public.required_facts set priority = 12 where property_type = 'chung_cu' and fact_key = 'noi_that' and deal is null;
update public.required_facts set priority = 13 where property_type = 'chung_cu' and fact_key = 'huong' and deal is null;
