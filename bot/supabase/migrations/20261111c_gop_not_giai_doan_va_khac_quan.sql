-- SRS-5.1zzzzzzz412 vòng 3 (11/11/2026, chủ dự án: "gộp luôn … gộp hết") — gộp nốt các nhóm vòng 1 cố ý để riêng:
-- giai đoạn (Garden Court I/II, Hưng Vượng 1/2/3, Osaka Garden 1/2/3/5, Lavila Đông Sài Gòn 2, Hưng Phúc Premier),
-- chung cư + khu dân cư cùng tên (An Sương, Tam Bình), cùng dự án khác quận (Saigon Eco Lake, Saigon West Garden),
-- tên kèm chủ đầu tư (Sari Town / Sarimi Sala "Đại Quang Minh", Lavila "Kiến Á", "Ba Son – Đông Tăng Long Hưng Phúc", An Sương I-Park).
-- Sari Town (biệt thự) và Sarimi Sala (căn hộ) vẫn là hai dự án. ĐÃ ÁP: 2.839 → 2.819. Dòng thu=1 là dòng giữ, đặt lại tên.
begin;
create temp table _n (ma text, thu int, id uuid, ten text) on commit drop;
insert into _n values
 ('gc',1,'6275bea5-5f35-445a-aa2a-ea94842435e4','Garden Court'),('gc',2,'010f8a1c-419b-438d-9189-ab735fb36b31',null),
 ('hv',1,'2439301b-1adc-4567-8b81-18627e4c8068','Hưng Vượng'),('hv',2,'3597d27b-47f4-4d97-a37f-9eb7f75a6f05',null),('hv',3,'b6ca784f-6c00-4c47-ab5f-26f10f8be0ab',null),
 ('os',1,'7242cc26-1a20-4ea0-9900-caeedc3b7ba3','Osaka Garden'),('os',2,'ddd09bc9-49ee-4eb7-9470-b087702c3740',null),('os',3,'b3bee229-5a1a-4445-be60-ee73cc100278',null),('os',4,'7d012d65-8ecd-47c8-ae06-e499993a1076',null),
 ('lds',1,'c379a01c-37ac-402d-ae99-50b2ddd41b17','Lavila Đông Sài Gòn'),('lds',2,'16035d0e-a67c-41e5-ac88-6c10adaed6c1',null),
 ('lv',1,'37a4054c-a6a1-4a44-ad18-160909db6d81','Lavila Kiến Á'),('lv',2,'b60f10a8-de7f-422a-81b2-fd65e1dd4f42',null),
 ('hp',1,'8f4b51e0-12c2-44b1-80a8-7cfc767ca9d1','Hưng Phúc (Happy Residence)'),('hp',2,'888687f8-03bc-45a5-83f3-97548b5bbe7f',null),('hp',3,'dd01559b-99c8-4504-833f-0599beb5d991',null),
 ('dtl',1,'fedb2b28-b7f5-4e05-9be4-a5d7743413d3','Đông Tăng Long Hưng Phúc'),('dtl',2,'a7e1ccef-326d-4e47-ad3a-6f9ad7ffd117',null),
 ('st',1,'cbf61e31-81e1-4b33-a5f7-4760b30ae960','Sari Town'),('st',2,'c9eabd0c-8c4f-4c88-a138-702d588d1af8',null),
 ('sm',1,'aff00c92-f1d5-40e3-b7c4-b90a52cf1134','Sarimi Sala'),('sm',2,'d3e8c14c-66eb-4345-a97f-943181b5940b',null),
 ('as',1,'f5067a4b-f4b6-4472-9b20-18c9f1b37c2d','An Sương'),('as',2,'bf3f4a43-dde5-4bdd-a6c8-058bc379bfcf',null),('as',3,'2a9d02e9-77c6-469c-9fbc-e2fd885d3282',null),
 ('ip',1,'705b2161-a439-46c7-9b54-86947d6c672a','Raemian Đông Thuận (An Sương I-Park)'),('ip',2,'500d0514-2339-4d9c-a28d-a361e975d76b',null),
 ('tb',1,'133115e2-4953-4c8d-8951-657e9185d006','Tam Bình'),('tb',2,'6711a5d4-1a8b-4cbf-bf2b-f22ac74ca4b5',null),('tb',3,'1cb302da-1171-41ba-99b1-2306ec7d8972',null),
 ('el',1,'3cfc1f28-3bb7-40a2-8505-f61dffdf7a68','Saigon Eco Lake'),('el',2,'5cf63cca-6911-4b8c-9013-7709b3a4ebf3',null),
 ('wg',1,'11cb8a55-7583-4f7a-9c02-904e29e3f3b6','Saigon West Garden'),('wg',2,'0669fa96-4204-4a86-868c-b2becf913896',null);
create temp table _g on commit drop as
select b.id bo, g.id giu from _n b join _n g on g.ma = b.ma and g.thu = 1 where b.thu > 1;
update public.projects g set
  developer = coalesce(nullif(g.developer, ''), b.developer), ward = coalesce(nullif(g.ward, ''), b.ward),
  location_raw = coalesce(nullif(g.location_raw, ''), b.location_raw), lat = coalesce(g.lat, b.lat), lng = coalesce(g.lng, b.lng),
  legal_status = coalesce(nullif(g.legal_status, ''), b.legal_status), handover_date = coalesce(g.handover_date, b.handover_date),
  handover = coalesce(nullif(g.handover, ''), b.handover), province = coalesce(nullif(g.province, ''), b.province),
  price_min = coalesce(g.price_min, b.price_min), price_max = coalesce(g.price_max, b.price_max),
  images = case when coalesce(jsonb_array_length(case when jsonb_typeof(g.images) = 'array' then g.images end), 0) = 0 then b.images else g.images end,
  description = coalesce(nullif(g.description, ''), b.description), updated_at = now()
  from (select distinct on (x.giu) x.giu, p.* from _g x join public.projects p on p.id = x.bo order by x.giu, length(coalesce(p.description, '')) desc) b
 where g.id = b.giu;
update public.listings l set project_id = x.giu from _g x where l.project_id = x.bo;
update public.du_an_kien_thuc k set project_id = x.giu from _g x where k.project_id = x.bo;
delete from public.projects p using _g x where p.id = x.bo;
update public.projects p set name = n.ten, updated_at = now() from _n n where n.thu = 1 and p.id = n.id;
commit;
