-- Ảnh chụp schema `public` + `storage` của project nhadat-cc.
-- SINH TỰ ĐỘNG bởi public.xuat_schema() — ĐỪNG SỬA TAY.
-- Sinh lại: gọi rpc xuat_schema() rồi ghi đè file này (CLAUDE.md).
-- Đây là lưới an toàn để dựng lại từ số không, KHÔNG thay cho migration:
-- thay đổi schema vẫn phải đi qua một file trong bot/supabase/migrations/.
-- Sinh lúc: 2026-10-19 12:41 (giờ VN)

-- ══ Extension ══
create extension if not exists fuzzystrmatch with schema extensions;
create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema public;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists vector with schema extensions;

-- ══ Kiểu enum ══
do $d$ begin
  create type public.listing_deal as enum ('ban', 'cho_thue');
exception when duplicate_object then null; end $d$;
do $d$ begin
  create type public.msg_sender as enum ('buyer', 'seller', 'bot', 'ctv', 'system', 'human');
exception when duplicate_object then null; end $d$;
do $d$ begin
  create type public.property_type as enum ('nha_pho', 'nha_cap4', 'chung_cu', 'dat', 'biet_thu', 'phong_tro', 'mat_bang', 'chua_ro', 'toa_nha', 'dat_nong_nghiep', 'dat_kinh_doanh', 'kho_xuong');
exception when duplicate_object then null; end $d$;
do $d$ begin
  create type public.request_status as enum ('pending', 'answered', 'expired');
exception when duplicate_object then null; end $d$;
do $d$ begin
  create type public.seller_type as enum ('ccrb', 'nmg', 'unknown');
exception when duplicate_object then null; end $d$;
do $d$ begin
  create type public.unit_status as enum ('con_ban', 'giu_cho', 'da_coc', 'da_ban');
exception when duplicate_object then null; end $d$;

-- ══ Sequence ══
create sequence if not exists public.bot_errors_id_seq;
create sequence if not exists public.project_facts_id_seq;
create sequence if not exists public.property_events_id_seq;

-- ══ Bảng ══
create table if not exists public.admins (
  email text not null,
  zalo_user_id text,
  zalo_phone text
);

create table if not exists public.app_config (
  key text not null,
  value text not null,
  ghi_chu text
);

create table if not exists public.boc_tach_bong (
  id bigint generated always as identity,
  created_at timestamp with time zone not null default now(),
  seller_id uuid,
  listing_id uuid,
  tin text not null,
  cau_dang_hoi text,
  model text,
  ms integer,
  so_can integer,
  de_xuat jsonb not null default '[]'::jsonb,
  dat jsonb not null default '[]'::jsonb,
  bo jsonb not null default '[]'::jsonb,
  so_sanh jsonb not null default '{}'::jsonb,
  da_ghi jsonb not null default '{}'::jsonb
);

create table if not exists public.bot_errors (
  id bigint not null default nextval('bot_errors_id_seq'::regclass),
  at timestamp with time zone not null default now(),
  source text not null,
  status_code integer,
  detail text
);

create table if not exists public.bot_health (
  who text not null,
  at timestamp with time zone not null default now(),
  last_id bigint not null default 0
);

create table if not exists public.bot_usage (
  day date not null default ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date,
  model_calls integer not null default 0,
  capped_at timestamp with time zone,
  in_tokens bigint not null default 0,
  out_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0
);

create table if not exists public.bot_usage_model (
  day date not null default ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date,
  model text not null,
  in_tokens bigint not null default 0,
  out_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  calls integer not null default 0
);

create table if not exists public.bridge_dang_nhap (
  id smallint not null default 1,
  trang_thai text not null default 'chua_ro'::text,
  qr_png text,
  yeu_cau_quet_lai boolean not null default false,
  ghi_chu text,
  cap_nhat timestamp with time zone not null default now()
);

create table if not exists public.buyers (
  id uuid not null default gen_random_uuid(),
  name text,
  phone text,
  zalo_user_id text,
  created_at timestamp with time zone not null default now(),
  preferences jsonb default '{}'::jsonb,
  last_contact_at timestamp with time zone,
  notes text,
  auth_user_id uuid
);

create table if not exists public.chat_quota (
  zalo_user_id text not null,
  gio timestamp with time zone not null,
  calls integer not null default 0
);

create table if not exists public.conversations (
  id uuid not null default gen_random_uuid(),
  buyer_id uuid,
  seller_id uuid,
  ctv_id uuid,
  channel text not null default 'zalo_oa'::text,
  started_at timestamp with time zone not null default now(),
  last_message_at timestamp with time zone,
  needs_human boolean not null default false,
  needs_human_at timestamp with time zone,
  human_touch_at timestamp with time zone,
  human_escalated_at timestamp with time zone,
  human_hold boolean not null default false
);

create table if not exists public.ctvs (
  id uuid not null default gen_random_uuid(),
  name text not null,
  zalo_user_id text,
  phone text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  last_assigned_at timestamp with time zone,
  khu_vuc text[] not null default '{}'::text[]
);

create table if not exists public.curated_lists (
  id uuid not null default gen_random_uuid(),
  token text not null default encode(extensions.gen_random_bytes(12), 'hex'::text),
  buyer_id uuid,
  listing_ids uuid[] not null,
  title text,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + '30 days'::interval)
);

create table if not exists public.deals (
  id uuid not null default gen_random_uuid(),
  listing_id uuid not null,
  buyer_id uuid,
  price_vnd bigint,
  fee_pct numeric,
  closed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  ctv_id uuid
);

create table if not exists public.du_an_kien_thuc (
  khoa text not null,
  ten text not null,
  du_lieu jsonb not null default '{}'::jsonb,
  cap_nhat timestamp with time zone not null default now()
);

create table if not exists public.duong (
  id uuid not null default gen_random_uuid(),
  ten text not null,
  ten_khong_dau text generated always as (bo_dau(ten)) stored,
  tinh text not null,
  tinh_cu text,
  phuong text not null default ''::text,
  quan_cu text,
  nguon text not null,
  created_at timestamp with time zone not null default now(),
  loai text not null default 'duong'::text,
  so_hem text,
  duong_me text,
  lat double precision,
  lng double precision,
  nhung extensions.vector(768),
  nhung_md5 text,
  nhung_luc timestamp with time zone
);

create table if not exists public.giao_lo (
  id bigint generated always as identity,
  duong_a text not null,
  duong_b text not null,
  a_khong_dau text generated always as (bo_dau(duong_a)) stored,
  b_khong_dau text generated always as (bo_dau(duong_b)) stored,
  loai_a text not null,
  loai_b text not null,
  lat double precision not null,
  lng double precision not null,
  phuong text not null,
  quan_cu text,
  tinh text not null default 'TP.HCM'::text,
  osm_node bigint not null,
  so_nut integer not null default 1,
  nguon text not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.info_requests (
  id uuid not null default gen_random_uuid(),
  listing_id uuid not null,
  buyer_id uuid,
  question text not null,
  status request_status not null default 'pending'::request_status,
  answer text,
  reminded_at timestamp with time zone,
  answered_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  assignee text,
  ctv_id uuid,
  source text not null default 'seller_flow'::text,
  sla_due_at timestamp with time zone,
  sla_missed_at timestamp with time zone,
  chu_nha_qua_han_at timestamp with time zone
);

create table if not exists public.interests (
  buyer_id uuid not null,
  listing_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.listing_facts (
  id uuid not null default gen_random_uuid(),
  listing_id uuid not null,
  question text not null,
  answer text not null,
  source text not null default 'seller_zalo'::text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.listing_media (
  id uuid not null default gen_random_uuid(),
  listing_id uuid not null,
  bucket text not null,
  storage_path text not null,
  media_type text not null,
  mime_type text not null,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamp with time zone not null default now(),
  nguon text not null default 'kho'::text,
  mo_ta text,
  ocr jsonb
);

create table if not exists public.listing_views (
  auth_user_id uuid not null,
  listing_id uuid not null,
  viewed_at timestamp with time zone not null default now()
);

create table if not exists public.listings (
  id uuid not null default gen_random_uuid(),
  code text not null,
  legacy_sst integer,
  seller_id uuid,
  deal listing_deal not null default 'ban'::listing_deal,
  district text,
  ward text,
  location_raw text,
  area_m2 numeric,
  price_vnd bigint,
  price_raw text,
  description text,
  source text not null default 'import_excel'::text,
  source_url text,
  cc_link text,
  status text not null default 'cho_thong_tin'::text,
  last_confirmed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  project_id uuid,
  unit_code text,
  floor integer,
  direction text,
  unit_status unit_status,
  property_type property_type default 'chua_ro'::property_type,
  lat numeric,
  lng numeric,
  bedrooms integer,
  last_interest_at timestamp with time zone,
  property_type_source text not null default 'suy_doan'::text,
  price_source text not null default 'suy_doan'::text,
  ward_source text not null default 'suy_doan'::text,
  street text,
  access_type text,
  alley_width_m numeric,
  distance_to_street_m numeric,
  frontage_m numeric,
  length_m numeric,
  rear_width_m numeric,
  legal_area_m2 numeric,
  built_area_m2 numeric,
  floors integer,
  floors_text text,
  bathrooms integer,
  legal_status text,
  has_completion boolean,
  planning_status text,
  has_elevator boolean,
  car_in_house boolean,
  corner_lot boolean,
  furnishing text,
  year_built integer,
  negotiable boolean,
  rent_income_vnd bigint,
  specs_source text,
  price_per_m2_vnd bigint generated always as (
CASE
    WHEN ((price_vnd IS NOT NULL) AND (area_m2 > (0)::numeric)) THEN (((price_vnd)::numeric / area_m2))::bigint
    ELSE NULL::bigint
END) stored,
  can_chu_duyet boolean not null default false,
  chu_duyet_at timestamp with time zone,
  legacy_code text,
  chu_noi_du_at timestamp with time zone,
  gap boolean,
  boc_tach jsonb,
  toa_do_muc text,
  geocode_at timestamp with time zone,
  tien_ich_gan jsonb,
  tien_ich_at timestamp with time zone,
  nhan text[] not null default '{}'::text[],
  nhung extensions.vector(768),
  nhung_md5 text,
  nhung_luc timestamp with time zone
);

create table if not exists public.media (
  id uuid not null default gen_random_uuid(),
  listing_id uuid not null,
  category text not null default 'photo'::text,
  storage_provider text not null default 'onedrive'::text,
  storage_path text not null,
  approved boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.media_cleanup_queue (
  id uuid not null default gen_random_uuid(),
  bucket text not null,
  storage_path text not null,
  trang_thai text not null default 'cho'::text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  next_retry_at timestamp with time zone
);

create table if not exists public.messages (
  id uuid not null default gen_random_uuid(),
  conversation_id uuid not null,
  sender msg_sender not null,
  body text not null,
  zalo_msg_id text,
  created_at timestamp with time zone not null default now(),
  seq bigint generated always as identity
);

create table if not exists public.nhung_viec (
  listing_id uuid not null,
  request_id bigint not null,
  md5 text not null,
  gui_luc timestamp with time zone not null default now()
);

create table if not exists public.nhung_viec_dia_danh (
  bang text not null,
  khoa text not null,
  request_id bigint not null,
  md5 text not null,
  gui_luc timestamp with time zone not null default now()
);

create table if not exists public.nhung_viec_du_an (
  project_id uuid not null,
  request_id bigint not null,
  md5 text not null,
  gui_luc timestamp with time zone not null default now()
);

create table if not exists public.phuong_cu (
  id bigint generated always as identity,
  ten text not null,
  loai text not null,
  quan_cu text not null,
  phuong_moi text not null,
  toan_bo boolean not null,
  lat double precision,
  lng double precision,
  nhung extensions.vector(768),
  nhung_md5 text,
  nhung_luc timestamp with time zone,
  nguon text
);

create table if not exists public.project_facts (
  id bigint not null default nextval('project_facts_id_seq'::regclass),
  project_id uuid,
  khoa text not null,
  gia_tri text not null,
  nguon text not null default 'seller_chat'::text,
  listing_id uuid,
  conversation_id uuid,
  trang_thai text not null default 'cho_duyet'::text,
  duyet_at timestamp with time zone,
  duyet_boi text,
  created_at timestamp with time zone not null default now(),
  ten_du_an text
);

create table if not exists public.projects (
  id uuid not null default gen_random_uuid(),
  name text not null,
  slug text,
  developer text,
  district text,
  ward text,
  location_raw text,
  lat numeric,
  lng numeric,
  legal_status text,
  amenities jsonb,
  floor_plans jsonb,
  handover_date date,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  province text,
  images jsonb,
  price_min bigint,
  price_max bigint,
  priority integer not null default 100,
  is_partner boolean not null default false,
  source text,
  source_url text,
  status_text text,
  handover text,
  specs jsonb,
  unit_types jsonb,
  geocode_at timestamp with time zone,
  nhung extensions.vector(768),
  nhung_md5 text,
  nhung_luc timestamp with time zone
);

create table if not exists public.property_events (
  id bigint not null default nextval('property_events_id_seq'::regclass),
  listing_id uuid not null,
  event_type text not null,
  buyer_id uuid,
  at timestamp with time zone not null default now(),
  meta jsonb
);

create table if not exists public.quan_cu (
  ten text not null,
  lat double precision,
  lng double precision,
  so_phuong_moi integer not null default 0,
  nhung extensions.vector(768),
  nhung_md5 text,
  nhung_luc timestamp with time zone
);

create table if not exists public.ratings_log (
  buyer_id uuid not null,
  listing_id uuid not null,
  stars integer not null,
  note text,
  at timestamp with time zone not null default now()
);

create table if not exists public.reminders (
  id uuid not null default gen_random_uuid(),
  kind text not null,
  buyer_id uuid,
  seller_id uuid,
  listing_id uuid,
  due_at timestamp with time zone not null,
  note text,
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now(),
  sent_at timestamp with time zone,
  viewing_id uuid,
  ctv_id uuid,
  locked_at timestamp with time zone,
  locked_by text,
  attempts integer not null default 0,
  next_retry_at timestamp with time zone,
  last_error text,
  noi_dung_gui text
);

create table if not exists public.required_facts (
  property_type property_type not null,
  fact_key text not null,
  priority integer not null default 1,
  nhom text not null default 'chuyen_mon'::text,
  deal listing_deal,
  id bigint generated by default as identity
);

create table if not exists public.sellers (
  id uuid not null default gen_random_uuid(),
  name text,
  phone text,
  phone_proxy text,
  seller_type seller_type not null default 'unknown'::seller_type,
  zalo_user_id text,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  auth_user_id uuid,
  active_listing_id uuid,
  xung_ho text,
  ten_tro_ly text,
  gioi_tinh text,
  nhom_tuoi text,
  seller_type_source text not null default 'suy_doan'::text
);

create table if not exists public.tien_ich (
  osm_id text not null,
  loai text not null,
  ten text not null,
  ten_kd text not null,
  lat double precision not null,
  lng double precision not null,
  cap_nhat_at timestamp with time zone not null default now()
);

create table if not exists public.viewings (
  id uuid not null default gen_random_uuid(),
  listing_id uuid,
  buyer_id uuid,
  guide text,
  slot timestamp with time zone,
  status text not null default 'proposed'::text,
  buyer_rating integer,
  note text,
  created_at timestamp with time zone not null default now(),
  time_text text,
  phone text,
  listing_code text,
  source text default 'bot'::text
);

create table if not exists public.wards (
  ten text not null,
  loai text not null,
  ten_day_du text not null,
  quan_cu text not null,
  don_vi_2025 text[] not null,
  tinh_cu text not null,
  don_vi_cu text,
  lat numeric(9,6),
  lng numeric(9,6),
  ma_hanh_chinh text,
  nguon text not null,
  ghi_chu text,
  created_at timestamp with time zone not null default now(),
  nhung extensions.vector(768),
  nhung_md5 text,
  nhung_luc timestamp with time zone
);

-- ══ Ràng buộc (PK / UNIQUE / CHECK) ══
do $d$ begin
  alter table public.admins add constraint admins_pkey PRIMARY KEY (email);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.app_config add constraint app_config_pkey PRIMARY KEY (key);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.boc_tach_bong add constraint boc_tach_bong_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.bot_errors add constraint bot_errors_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.bot_health add constraint bot_health_pkey PRIMARY KEY (who);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.bot_usage add constraint bot_usage_pkey PRIMARY KEY (day);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.bot_usage_model add constraint bot_usage_model_pkey PRIMARY KEY (day, model);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.bridge_dang_nhap add constraint bridge_dang_nhap_id_check CHECK ((id = 1));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.bridge_dang_nhap add constraint bridge_dang_nhap_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.bridge_dang_nhap add constraint bridge_dang_nhap_qr_png_check CHECK (((qr_png IS NULL) OR ((qr_png ~~ 'data:image/png;base64,%'::text) AND (length(qr_png) <= 200000))));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.bridge_dang_nhap add constraint bridge_dang_nhap_trang_thai_check CHECK ((trang_thai = ANY (ARRAY['chua_ro'::text, 'dang_nhap'::text, 'cho_quet'::text, 'da_quet'::text, 'het_han'::text, 'tu_choi'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.buyers add constraint buyers_auth_user_id_key UNIQUE (auth_user_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.buyers add constraint buyers_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.buyers add constraint buyers_zalo_user_id_key UNIQUE (zalo_user_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.chat_quota add constraint chat_quota_pkey PRIMARY KEY (zalo_user_id, gio);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.conversations add constraint conversations_co_vai_check CHECK (((buyer_id IS NOT NULL) OR (seller_id IS NOT NULL)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.conversations add constraint conversations_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.ctvs add constraint ctvs_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.ctvs add constraint ctvs_zalo_user_id_key UNIQUE (zalo_user_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.curated_lists add constraint curated_lists_listing_ids_check CHECK (((cardinality(listing_ids) >= 1) AND (cardinality(listing_ids) <= 60)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.curated_lists add constraint curated_lists_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.curated_lists add constraint curated_lists_token_key UNIQUE (token);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.deals add constraint deals_listing_buyer_key UNIQUE NULLS NOT DISTINCT (listing_id, buyer_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.deals add constraint deals_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.du_an_kien_thuc add constraint du_an_kien_thuc_pkey PRIMARY KEY (khoa);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.duong add constraint duong_loai_check CHECK ((loai = ANY (ARRAY['duong'::text, 'so'::text, 'hem'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.duong add constraint duong_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.duong add constraint duong_ten_check CHECK (((length(ten) >= 2) AND (length(ten) <= 80)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.duong add constraint duong_ten_tinh_phuong_key UNIQUE (ten, tinh, phuong);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.duong add constraint duong_tinh_check CHECK ((tinh = ANY (ARRAY['TP.HCM'::text, 'Tây Ninh'::text, 'Đồng Nai'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.duong add constraint duong_tinh_cu_check CHECK ((tinh_cu = ANY (ARRAY['TP.HCM'::text, 'Bình Dương'::text, 'Bà Rịa – Vũng Tàu'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.giao_lo add constraint giao_lo_loai_a_check CHECK ((loai_a = ANY (ARRAY['duong'::text, 'so'::text, 'hem'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.giao_lo add constraint giao_lo_loai_b_check CHECK ((loai_b = ANY (ARRAY['duong'::text, 'so'::text, 'hem'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.giao_lo add constraint giao_lo_nut_cap_key UNIQUE (osm_node, duong_a, duong_b);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.giao_lo add constraint giao_lo_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.info_requests add constraint info_requests_assignee_check CHECK ((assignee = ANY (ARRAY['seller'::text, 'ctv'::text, 'admin'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.info_requests add constraint info_requests_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.interests add constraint interests_pkey PRIMARY KEY (buyer_id, listing_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_facts add constraint listing_facts_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_bia_phai_cong_khai CHECK (((NOT is_cover) OR (bucket = 'listing-public'::text)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_bucket_check CHECK ((bucket = ANY (ARRAY['listing-public'::text, 'listing-private'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_duong_dan_sach CHECK ((storage_path !~ '(^/)|(\.\.)|(//)'::text));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_duong_dan_theo_uuid CHECK ((storage_path ~~ ((listing_id)::text || '/%'::text)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_giay_to_phai_rieng CHECK (((media_type <> ALL (ARRAY['so_do'::text, 'giay_to'::text])) OR (bucket = 'listing-private'::text)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_media_type_check CHECK ((media_type = ANY (ARRAY['mat_tien'::text, 'trong_nha'::text, 'phong_ngu'::text, 'bep'::text, 'wc'::text, 'san_thuong'::text, 'view'::text, 'hem'::text, 'so_do'::text, 'giay_to'::text, 'khac'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_path_key UNIQUE (bucket, storage_path);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_sort_order_hop_le CHECK (((sort_order IS NULL) OR ((sort_order >= 0) AND (sort_order <= 9999))));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_views add constraint listing_views_pkey PRIMARY KEY (auth_user_id, listing_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_access_type_check CHECK ((access_type = ANY (ARRAY['mat_tien'::text, 'hem_xe_tai'::text, 'hem_xe_hoi'::text, 'hem_xe_may'::text, 'hem'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_bedrooms_check CHECK (((bedrooms IS NULL) OR ((bedrooms >= 1) AND (bedrooms <= 60))));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_code_key UNIQUE (code);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_furnishing_check CHECK ((furnishing = ANY (ARRAY['full'::text, 'co_ban'::text, 'khong'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_legal_status_check CHECK ((legal_status = ANY (ARRAY['so_hong_rieng'::text, 'so_hong_chung'::text, 'so_hong'::text, 'hdmb'::text, 'giay_tay'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_price_source_check CHECK ((price_source = ANY (ARRAY['suy_doan'::text, 'chu_xac_nhan'::text, 'admin'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_property_type_source_check CHECK ((property_type_source = ANY (ARRAY['suy_doan'::text, 'chu_xac_nhan'::text, 'admin'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_specs_source_check CHECK (((specs_source IS NULL) OR (specs_source = ANY (ARRAY['boc_mo_ta'::text, 'admin'::text, 'chu_xac_nhan'::text]))));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_status_check CHECK ((status = ANY (ARRAY['cho_thong_tin'::text, 'dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text, 'da_chot'::text, 'an'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_toa_do_muc_check CHECK (((toa_do_muc IS NULL) OR (toa_do_muc = ANY (ARRAY['duong'::text, 'phuong'::text, 'quan'::text, 'du_an'::text, 'tay'::text]))));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_ward_source_check CHECK ((ward_source = ANY (ARRAY['suy_doan'::text, 'chu_xac_nhan'::text, 'admin'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.media add constraint media_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.media_cleanup_queue add constraint media_cleanup_queue_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.media_cleanup_queue add constraint media_cleanup_queue_trang_thai_check CHECK ((trang_thai = ANY (ARRAY['cho'::text, 'dang_lam'::text, 'xong'::text, 'loi'::text, 'chet'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.messages add constraint messages_seq_key UNIQUE (seq);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.messages add constraint messages_zalo_msg_id_key UNIQUE (zalo_msg_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.nhung_viec add constraint nhung_viec_pkey PRIMARY KEY (listing_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.nhung_viec_dia_danh add constraint nhung_viec_dia_danh_bang_check CHECK ((bang = ANY (ARRAY['wards'::text, 'duong'::text, 'phuong_cu'::text, 'quan_cu'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.nhung_viec_dia_danh add constraint nhung_viec_dia_danh_pkey PRIMARY KEY (bang, khoa);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.nhung_viec_du_an add constraint nhung_viec_du_an_pkey PRIMARY KEY (project_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.phuong_cu add constraint phuong_cu_loai_check CHECK ((loai = ANY (ARRAY['phuong'::text, 'xa'::text, 'thi_tran'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.phuong_cu add constraint phuong_cu_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.phuong_cu add constraint phuong_cu_ten_quan_cu_phuong_moi_key UNIQUE (ten, quan_cu, phuong_moi);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.project_facts add constraint project_facts_co_dich CHECK (((project_id IS NOT NULL) OR (COALESCE(btrim(ten_du_an), ''::text) <> ''::text)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.project_facts add constraint project_facts_nguon_check CHECK ((nguon = ANY (ARRAY['seller_chat'::text, 'buyer_chat'::text, 'ctv'::text, 'admin'::text, 'crawl'::text, 'llm'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.project_facts add constraint project_facts_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.project_facts add constraint project_facts_trang_thai_check CHECK ((trang_thai = ANY (ARRAY['cho_duyet'::text, 'da_duyet'::text, 'bo'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.projects add constraint projects_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.projects add constraint projects_slug_key UNIQUE (slug);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.property_events add constraint property_events_event_type_check CHECK ((event_type = ANY (ARRAY['view'::text, 'asked'::text, 'interest'::text, 'photos'::text, 'viewing'::text, 'deal'::text, 'match_sent'::text, 'status'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.property_events add constraint property_events_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.quan_cu add constraint quan_cu_pkey PRIMARY KEY (ten);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.ratings_log add constraint ratings_log_pkey PRIMARY KEY (buyer_id, listing_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.ratings_log add constraint ratings_log_stars_check CHECK (((stars >= 1) AND (stars <= 5)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.reminders add constraint reminders_kind_check CHECK ((kind = ANY (ARRAY['promise'::text, 'reengage'::text, 'viewing'::text, 'followup'::text, 'escalation'::text, 'report'::text, 'match'::text, 'feedback'::text, 'sold'::text, 'rating'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.reminders add constraint reminders_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.reminders add constraint reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'cancelled'::text, 'dead'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.required_facts add constraint required_facts_nhom_check CHECK ((nhom = ANY (ARRAY['co_ban'::text, 'chuyen_mon'::text, 'phu'::text, 'sau_dang'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.required_facts add constraint required_facts_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_auth_user_id_key UNIQUE (auth_user_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_gioi_tinh_check CHECK (((gioi_tinh IS NULL) OR (gioi_tinh = ANY (ARRAY['nam'::text, 'nu'::text]))));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_nhom_tuoi_check CHECK (((nhom_tuoi IS NULL) OR (nhom_tuoi = ANY (ARRAY['tre'::text, 'lon_tuoi'::text]))));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_phone_key UNIQUE (phone);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_seller_type_source_check CHECK ((seller_type_source = ANY (ARRAY['suy_doan'::text, 'tu_nhan'::text, 'admin'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_xung_ho_check CHECK (((xung_ho IS NULL) OR (xung_ho = ANY (ARRAY['anh'::text, 'chị'::text, 'chú'::text, 'cô'::text, 'bác'::text, 'ông'::text, 'bà'::text, 'dì'::text, 'cậu'::text, 'mợ'::text, 'thím'::text, 'dượng'::text]))));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_zalo_user_id_key UNIQUE (zalo_user_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.tien_ich add constraint tien_ich_loai_check CHECK ((loai = ANY (ARRAY['benh_vien'::text, 'truong_hoc'::text, 'cho'::text, 'sieu_thi'::text, 'cong_vien'::text, 'dia_diem'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.tien_ich add constraint tien_ich_pkey PRIMARY KEY (osm_id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.viewings add constraint viewings_buyer_rating_check CHECK (((buyer_rating >= 1) AND (buyer_rating <= 5)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.viewings add constraint viewings_can_neo_check CHECK (((listing_id IS NOT NULL) OR (listing_code IS NOT NULL)));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.viewings add constraint viewings_pkey PRIMARY KEY (id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.viewings add constraint viewings_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'pending'::text, 'confirmed'::text, 'done'::text, 'cancelled'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.wards add constraint wards_loai_check CHECK ((loai = ANY (ARRAY['phuong'::text, 'xa'::text, 'dac_khu'::text])));
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.wards add constraint wards_pkey PRIMARY KEY (ten);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.wards add constraint wards_tinh_cu_check CHECK ((tinh_cu = ANY (ARRAY['TP.HCM'::text, 'Bình Dương'::text, 'Bà Rịa – Vũng Tàu'::text])));
exception when duplicate_object then null; end $d$;

-- ══ Khoá ngoại ══
do $d$ begin
  alter table public.boc_tach_bong add constraint boc_tach_bong_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.boc_tach_bong add constraint boc_tach_bong_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.buyers add constraint buyers_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.conversations add constraint conversations_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.conversations add constraint conversations_ctv_id_fkey FOREIGN KEY (ctv_id) REFERENCES ctvs(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.conversations add constraint conversations_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.curated_lists add constraint curated_lists_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.deals add constraint deals_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.deals add constraint deals_ctv_id_fkey FOREIGN KEY (ctv_id) REFERENCES ctvs(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.deals add constraint deals_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.info_requests add constraint info_requests_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.info_requests add constraint info_requests_ctv_id_fkey FOREIGN KEY (ctv_id) REFERENCES ctvs(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.info_requests add constraint info_requests_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.interests add constraint interests_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.interests add constraint interests_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_facts add constraint listing_facts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_media add constraint listing_media_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_views add constraint listing_views_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listing_views add constraint listing_views_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.listings add constraint listings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.media add constraint media_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.messages add constraint messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.nhung_viec add constraint nhung_viec_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.nhung_viec_du_an add constraint nhung_viec_du_an_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.phuong_cu add constraint phuong_cu_phuong_moi_fkey FOREIGN KEY (phuong_moi) REFERENCES wards(ten) ON UPDATE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.project_facts add constraint project_facts_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.project_facts add constraint project_facts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.project_facts add constraint project_facts_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.property_events add constraint property_events_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.property_events add constraint property_events_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.ratings_log add constraint ratings_log_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.ratings_log add constraint ratings_log_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.reminders add constraint reminders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.reminders add constraint reminders_ctv_id_fkey FOREIGN KEY (ctv_id) REFERENCES ctvs(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.reminders add constraint reminders_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.reminders add constraint reminders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.reminders add constraint reminders_viewing_id_fkey FOREIGN KEY (viewing_id) REFERENCES viewings(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_active_listing_id_fkey FOREIGN KEY (active_listing_id) REFERENCES listings(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.sellers add constraint sellers_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.viewings add constraint viewings_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers(id);
exception when duplicate_object then null; end $d$;
do $d$ begin
  alter table public.viewings add constraint viewings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id);
exception when duplicate_object then null; end $d$;

-- ══ Index ══
create index if not exists boc_tach_bong_created_at_idx ON public.boc_tach_bong USING btree (created_at DESC);
create index if not exists boc_tach_bong_listing_id_idx ON public.boc_tach_bong USING btree (listing_id);
create index if not exists boc_tach_bong_seller_idx ON public.boc_tach_bong USING btree (seller_id);
create index if not exists bot_errors_at_idx ON public.bot_errors USING btree (at DESC);
create index if not exists bot_errors_source_at_idx ON public.bot_errors USING btree (source, at DESC);
create index if not exists chat_quota_gio_idx ON public.chat_quota USING btree (gio);
create index if not exists conversations_buyer_id_idx ON public.conversations USING btree (buyer_id);
CREATE UNIQUE INDEX conversations_buyer_uniq ON public.conversations USING btree (buyer_id) WHERE (buyer_id IS NOT NULL);
create index if not exists conversations_ctv_id_idx ON public.conversations USING btree (ctv_id);
CREATE UNIQUE INDEX conversations_seller_uniq ON public.conversations USING btree (seller_id) WHERE (seller_id IS NOT NULL);
create index if not exists curated_lists_buyer_idx ON public.curated_lists USING btree (buyer_id);
create index if not exists deals_buyer_id_idx ON public.deals USING btree (buyer_id);
create index if not exists deals_ctv_id_idx ON public.deals USING btree (ctv_id);
create index if not exists deals_listing_id_idx ON public.deals USING btree (listing_id);
create index if not exists duong_hem ON public.duong USING btree (upper(so_hem), bo_dau(duong_me)) WHERE (loai = 'hem'::text);
create index if not exists duong_lat_lng ON public.duong USING btree (lat, lng);
create index if not exists duong_nhung_hnsw ON public.duong USING hnsw (nhung extensions.vector_cosine_ops);
create index if not exists duong_ten_khong_dau_idx ON public.duong USING btree (ten_khong_dau);
create index if not exists giao_lo_a_idx ON public.giao_lo USING btree (a_khong_dau);
create index if not exists giao_lo_b_idx ON public.giao_lo USING btree (b_khong_dau);
create index if not exists giao_lo_lat_lng_idx ON public.giao_lo USING btree (lat, lng);
create index if not exists idx_conversations_seller ON public.conversations USING btree (seller_id, started_at DESC);
create index if not exists idx_listings_price_vnd ON public.listings USING btree (deal, price_vnd);
create index if not exists info_requests_buyer_id_idx ON public.info_requests USING btree (buyer_id);
create index if not exists info_requests_ctv_id_idx ON public.info_requests USING btree (ctv_id);
create index if not exists info_requests_listing_id_idx ON public.info_requests USING btree (listing_id);
CREATE UNIQUE INDEX info_requests_mot_cau_cho_idx ON public.info_requests USING btree (listing_id, question) WHERE (status = 'pending'::request_status);
create index if not exists info_requests_sla_idx ON public.info_requests USING btree (sla_due_at) WHERE ((status = 'pending'::request_status) AND (sla_missed_at IS NULL));
create index if not exists interests_listing_id_idx ON public.interests USING btree (listing_id);
create index if not exists listing_facts_listing_id_idx ON public.listing_facts USING btree (listing_id);
CREATE UNIQUE INDEX listing_media_mot_bia_idx ON public.listing_media USING btree (listing_id) WHERE is_cover;
create index if not exists listing_media_tin_thu_tu_idx ON public.listing_media USING btree (listing_id, sort_order, created_at, id);
create index if not exists listing_views_listing_id_idx ON public.listing_views USING btree (listing_id);
create index if not exists listings_access_idx ON public.listings USING btree (deal, status, access_type);
create index if not exists listings_district_status_idx ON public.listings USING btree (district, status);
create index if not exists listings_floors_idx ON public.listings USING btree (deal, status, floors);
create index if not exists listings_nhan_gin_idx ON public.listings USING gin (nhan);
create index if not exists listings_nhung_hnsw ON public.listings USING hnsw (nhung extensions.vector_cosine_ops);
create index if not exists listings_project_idx ON public.listings USING btree (project_id) WHERE (project_id IS NOT NULL);
CREATE UNIQUE INDEX listings_project_unit_uniq ON public.listings USING btree (project_id, unit_code) WHERE ((project_id IS NOT NULL) AND (unit_code IS NOT NULL));
create index if not exists listings_seller_id_idx ON public.listings USING btree (seller_id);
create index if not exists media_cleanup_can_lam_idx ON public.media_cleanup_queue USING btree (trang_thai, created_at) WHERE (trang_thai = ANY (ARRAY['cho'::text, 'dang_lam'::text]));
create index if not exists media_listing_id_idx ON public.media USING btree (listing_id);
create index if not exists messages_conv_seq_idx ON public.messages USING btree (conversation_id, seq DESC);
create index if not exists messages_conv_time_idx ON public.messages USING btree (conversation_id, created_at);
create index if not exists phuong_cu_nhung_hnsw ON public.phuong_cu USING hnsw (nhung extensions.vector_cosine_ops);
create index if not exists project_facts_cho_duyet_idx ON public.project_facts USING btree (trang_thai, created_at DESC);
create index if not exists project_facts_conversation_id_idx ON public.project_facts USING btree (conversation_id);
CREATE UNIQUE INDEX project_facts_khong_trung_idx ON public.project_facts USING btree (COALESCE((project_id)::text, lower(btrim(ten_du_an))), khoa, gia_tri) WHERE (trang_thai <> 'bo'::text);
create index if not exists project_facts_listing_id_idx ON public.project_facts USING btree (listing_id);
create index if not exists project_facts_project_id_idx ON public.project_facts USING btree (project_id);
create index if not exists projects_nhung_hnsw ON public.projects USING hnsw (nhung extensions.vector_cosine_ops);
create index if not exists projects_priority_idx ON public.projects USING btree (priority, district);
create index if not exists property_events_at_idx ON public.property_events USING btree (at DESC);
create index if not exists property_events_buyer_idx ON public.property_events USING btree (buyer_id);
create index if not exists property_events_listing_at_idx ON public.property_events USING btree (listing_id, at DESC);
create index if not exists quan_cu_nhung_hnsw ON public.quan_cu USING hnsw (nhung extensions.vector_cosine_ops);
create index if not exists ratings_log_listing_idx ON public.ratings_log USING btree (listing_id);
create index if not exists reminders_buyer_id_idx ON public.reminders USING btree (buyer_id);
create index if not exists reminders_ctv_id_idx ON public.reminders USING btree (ctv_id);
create index if not exists reminders_den_han_idx ON public.reminders USING btree (due_at) WHERE (status = 'pending'::text);
create index if not exists reminders_due_idx ON public.reminders USING btree (status, due_at);
create index if not exists reminders_listing_id_idx ON public.reminders USING btree (listing_id);
CREATE UNIQUE INDEX reminders_mot_feedback_moi_buoi_idx ON public.reminders USING btree (viewing_id) WHERE ((kind = 'feedback'::text) AND (viewing_id IS NOT NULL));
CREATE UNIQUE INDEX reminders_mot_match_moi_tin_idx ON public.reminders USING btree (buyer_id, listing_id) WHERE (kind = 'match'::text);
CREATE UNIQUE INDEX reminders_mot_nhac_moi_buoi_xem_idx ON public.reminders USING btree (viewing_id) WHERE ((kind = 'viewing'::text) AND (status = 'pending'::text) AND (viewing_id IS NOT NULL));
CREATE UNIQUE INDEX reminders_mot_reengage_cho_idx ON public.reminders USING btree (buyer_id) WHERE ((kind = 'reengage'::text) AND (status = 'pending'::text));
CREATE UNIQUE INDEX reminders_mot_sold_moi_tin_idx ON public.reminders USING btree (buyer_id, listing_id) WHERE (kind = 'sold'::text);
create index if not exists reminders_seller_id_idx ON public.reminders USING btree (seller_id);
create index if not exists reminders_viewing_id_idx ON public.reminders USING btree (viewing_id);
CREATE UNIQUE INDEX required_facts_loai_fact_deal_idx ON public.required_facts USING btree (property_type, fact_key, deal) WHERE (deal IS NOT NULL);
CREATE UNIQUE INDEX required_facts_loai_fact_moi_deal_idx ON public.required_facts USING btree (property_type, fact_key) WHERE (deal IS NULL);
create index if not exists sellers_active_listing_idx ON public.sellers USING btree (active_listing_id) WHERE (active_listing_id IS NOT NULL);
create index if not exists tien_ich_loai_lat_lng_idx ON public.tien_ich USING btree (loai, lat, lng);
create index if not exists viewings_buyer_id_idx ON public.viewings USING btree (buyer_id);
create index if not exists viewings_listing_id_idx ON public.viewings USING btree (listing_id);
CREATE UNIQUE INDEX viewings_mot_hen_cho_moi_can_idx ON public.viewings USING btree (buyer_id, COALESCE(listing_code, (listing_id)::text)) WHERE (status = 'pending'::text);
create index if not exists viewings_status_slot_idx ON public.viewings USING btree (status, slot);
create index if not exists wards_nhung_hnsw ON public.wards USING hnsw (nhung extensions.vector_cosine_ops);

-- ══ Hàm ══
CREATE OR REPLACE FUNCTION public.admin_cap_nhat_khach(p_buyer_id uuid, p_preferences jsonb, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.admins a
    where a.email = ((select auth.jwt()) ->> 'email')
  ) into v_is_admin;

  if not v_is_admin and current_user not in ('service_role', 'postgres') then
    raise exception 'Chỉ admin mới có quyền thực hiện';
  end if;

  update public.buyers
  set preferences = p_preferences,
      notes = p_notes
  where id = p_buyer_id;

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_dang_tin(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email  text := (select auth.jwt() ->> 'email');
  v_seller uuid;
  v_zalo   text;
  v_phone  text;
  v_code   text;
  v_id     uuid;
  v_price  bigint;
begin
  if v_email is null or not exists (select 1 from admins a where a.email = v_email) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  v_seller := nullif(p->>'seller_id', '')::uuid;

  if v_seller is null and coalesce(btrim(p->>'seller_name'), '') <> '' then
    v_zalo  := nullif(btrim(p->>'seller_zalo'), '');
    v_phone := nullif(btrim(p->>'seller_phone'), '');

    if v_zalo is not null then
      select id into v_seller from sellers where zalo_user_id = v_zalo;
    end if;
    if v_seller is null and v_phone is not null then
      select id into v_seller from sellers where phone = v_phone;
    end if;

    if v_seller is null then
      insert into sellers (name, seller_type, phone, zalo_user_id)
      values (
        btrim(p->>'seller_name'),
        coalesce(nullif(p->>'seller_type', ''), 'ccrb')::seller_type,
        v_phone,
        v_zalo
      )
      returning id into v_seller;
    end if;
  end if;

  insert into listings (
    code, seller_id, deal, district, ward, ward_source, location_raw,
    area_m2, price_raw, price_source, bedrooms,
    property_type, property_type_source, description, source, status
  ) values (
    null,
    v_seller,
    coalesce(nullif(p->>'deal', ''), 'ban')::listing_deal,
    nullif(btrim(p->>'district'), ''),
    nullif(btrim(p->>'ward'), ''),
    case when nullif(btrim(p->>'ward'), '') is not null then 'admin' else 'suy_doan' end,
    nullif(btrim(p->>'location_raw'), ''),
    nullif(p->>'area_m2', '')::numeric,
    nullif(btrim(p->>'price_raw'), ''),
    case when nullif(btrim(p->>'price_raw'), '') is not null then 'admin' else 'suy_doan' end,
    nullif(p->>'bedrooms', '')::int,
    coalesce(nullif(p->>'property_type', ''), 'chua_ro')::property_type,
    case when nullif(p->>'property_type', '') is not null then 'admin' else 'suy_doan' end,
    nullif(btrim(p->>'description'), ''),
    coalesce(nullif(btrim(p->>'source'), ''), 'admin'),
    coalesce(nullif(p->>'status', ''), 'cho_thong_tin')
  )
  returning id, code, price_vnd into v_id, v_code, v_price;

  return jsonb_build_object(
    'id', v_id, 'code', v_code, 'price_vnd', v_price, 'seller_id', v_seller
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.admin_gan_bds_quan_tam(p_buyer_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_listing_id uuid;
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.admins a
    where a.email = ((select auth.jwt()) ->> 'email')
  ) into v_is_admin;

  if not v_is_admin and current_user not in ('service_role', 'postgres') then
    raise exception 'Chỉ admin mới có quyền thực hiện';
  end if;

  select id into v_listing_id
  from public.listings
  where code ilike trim(p_code) or legacy_code ilike trim(p_code)
  limit 1;

  if v_listing_id is null then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy BĐS có mã ' || p_code);
  end if;

  insert into public.interests (buyer_id, listing_id)
  values (p_buyer_id, v_listing_id)
  on conflict (buyer_id, listing_id) do nothing;

  update public.listings
  set status = 'dang_quan_tam', last_interest_at = now()
  where id = v_listing_id and status in ('dang_ban', 'dang_quan_tam');

  return jsonb_build_object('ok', true, 'listing_id', v_listing_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_khoi_phuc_lan_xoa(p_lan bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb := '{}'::jsonb;
  n int;
  t text;
  v_cot text;
  v_r text;
begin
  if not (public.la_admin()
          or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'chỉ admin được khôi phục' using errcode = '42501';
  end if;
  if not exists (select 1 from luu_tru.lan_xoa where lan = p_lan) then
    raise exception 'không có lần xoá %', p_lan using errcode = '22023';
  end if;
  -- Dòng khôi phục là dữ liệu CŨ: không cho trigger chạy lại (gửi tin, hỏi bù, cấp mã mới…) và không kiểm khoá ngoại theo
  -- thứ tự (sellers ↔ listings vòng tròn qua active_listing_id).
  set local session_replication_role = replica;
  foreach t in array array['sellers', 'buyers', 'listings', 'conversations', 'messages', 'listing_facts', 'project_facts',
                           'info_requests', 'media', 'listing_media', 'listing_views', 'property_events', 'interests',
                           'ratings_log', 'viewings', 'deals', 'curated_lists', 'boc_tach_bong', 'chat_quota', 'reminders'] loop
    -- Cột sinh (generated) không chèn được — chỉ lấy cột thường của bảng HIỆN TẠI.
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum), string_agg('r.' || quote_ident(a.attname), ', ' order by a.attnum)
      into v_cot, v_r
      from pg_attribute a
     where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    execute format(
      'insert into public.%I (%s) select %s from luu_tru.ban_ghi b, jsonb_populate_record(null::public.%I, b.du_lieu) r
        where b.lan = $1 and b.bang = %L on conflict do nothing', t, v_cot, v_r, t, t)
      using p_lan;
    get diagnostics n = row_count;
    v := v || jsonb_build_object(t, n);
  end loop;
  update luu_tru.lan_xoa set khoi_phuc_luc = now() where lan = p_lan;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_xoa_bds_quan_tam(p_buyer_id uuid, p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.admins a
    where a.email = ((select auth.jwt()) ->> 'email')
  ) into v_is_admin;

  if not v_is_admin and current_user not in ('service_role', 'postgres') then
    raise exception 'Chỉ admin mới có quyền thực hiện';
  end if;

  delete from public.interests
  where buyer_id = p_buyer_id and listing_id = p_listing_id;

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_xoa_het_khach_va_ro_hang(p_xac_nhan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb := '{}'::jsonb;
  n int;
  v_lan bigint;
  t text;
begin
  if not (public.la_admin()
          or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'chỉ admin được xoá hàng loạt' using errcode = '42501';
  end if;
  if coalesce(p_xac_nhan, '') <> 'XOA HET' then
    raise exception 'phải gõ đúng chữ XOA HET để xác nhận' using errcode = '22023';
  end if;

  -- 20260929b (FR-245, chủ dự án 29/09: "xóa data để test thì data thật cũng nên để sang 1 chỗ" → chọn "chép sang kho lưu
  -- rồi mới xóa"): CHÉP mọi dòng sắp xoá sang `luu_tru.ban_ghi` (một lần xoá = một `lan`) TRƯỚC khi xoá, cùng giao dịch —
  -- chép hỏng thì không xoá gì. Khôi phục: `admin_khoi_phuc_lan_xoa(lan)`. Kho lưu nằm CÙNG DB: đỡ được bấm nút xoá,
  -- không đỡ được mất cả DB (không có sao lưu ngoài — OPEN-25).
  insert into luu_tru.lan_xoa (ai) values (coalesce(auth.uid()::text, current_user)) returning lan into v_lan;
  foreach t in array array['sellers', 'buyers', 'listings', 'conversations', 'messages', 'listing_facts', 'project_facts',
                           'info_requests', 'media', 'listing_media', 'listing_views', 'property_events', 'interests',
                           'ratings_log', 'viewings', 'deals', 'curated_lists', 'boc_tach_bong', 'chat_quota'] loop
    execute format('insert into luu_tru.ban_ghi (lan, bang, du_lieu) select $1, %L, to_jsonb(x) from public.%I x', t, t)
      using v_lan;
  end loop;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu)
  select v_lan, 'reminders', to_jsonb(r) from reminders r
   where r.buyer_id is not null or r.seller_id is not null or r.listing_id is not null or r.viewing_id is not null
      or r.kind in ('promise', 'reengage', 'viewing', 'followup', 'match', 'feedback', 'sold', 'rating');
  v := v || jsonb_build_object('luu_tru_lan', v_lan);

  -- `where true` ở mọi câu xoá: role `authenticator` nạp `safeupdate`, câu DELETE không WHERE
  -- bị chặn khi hàm được gọi qua PostgREST (22/09/2026, nút /admin từng đổ lỗi này).
  delete from messages where true;               get diagnostics n = row_count; v := v || jsonb_build_object('messages', n);
  delete from project_facts where true;          get diagnostics n = row_count; v := v || jsonb_build_object('project_facts', n);
  delete from listing_facts where true;          get diagnostics n = row_count; v := v || jsonb_build_object('listing_facts', n);
  delete from info_requests where true;          get diagnostics n = row_count; v := v || jsonb_build_object('info_requests', n);
  delete from listing_media where true;          get diagnostics n = row_count; v := v || jsonb_build_object('listing_media', n);
  delete from media where true;                  get diagnostics n = row_count; v := v || jsonb_build_object('media', n);
  delete from listing_views where true;          get diagnostics n = row_count; v := v || jsonb_build_object('listing_views', n);
  delete from property_events where true;        get diagnostics n = row_count; v := v || jsonb_build_object('property_events', n);
  delete from interests where true;              get diagnostics n = row_count; v := v || jsonb_build_object('interests', n);
  delete from ratings_log where true;            get diagnostics n = row_count; v := v || jsonb_build_object('ratings_log', n);
  delete from reminders
   where buyer_id is not null or seller_id is not null or listing_id is not null or viewing_id is not null
      or kind in ('promise', 'reengage', 'viewing', 'followup', 'match', 'feedback', 'sold', 'rating');
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('reminders', n);
  delete from viewings where true;               get diagnostics n = row_count; v := v || jsonb_build_object('viewings', n);
  delete from deals where true;                  get diagnostics n = row_count; v := v || jsonb_build_object('deals', n);
  delete from curated_lists where true;          get diagnostics n = row_count; v := v || jsonb_build_object('curated_lists', n);
  delete from boc_tach_bong where true;          get diagnostics n = row_count; v := v || jsonb_build_object('boc_tach_bong', n);
  update sellers set active_listing_id = null where active_listing_id is not null;
  delete from listings where true;               get diagnostics n = row_count; v := v || jsonb_build_object('listings', n);
  delete from conversations where true;          get diagnostics n = row_count; v := v || jsonb_build_object('conversations', n);
  delete from chat_quota where true;             get diagnostics n = row_count; v := v || jsonb_build_object('chat_quota', n);
  delete from buyers where true;                 get diagnostics n = row_count; v := v || jsonb_build_object('buyers', n);
  delete from sellers where true;                get diagnostics n = row_count; v := v || jsonb_build_object('sellers', n);

  insert into bot_health (who, at) values ('xoa_het', now())
    on conflict (who) do update set at = excluded.at;
  insert into app_config (key, value, ghi_chu) values ('xoa_het_lan_cuoi',
          format('%s: %s', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'), v::text),
          'FR-210: lần xoá hàng loạt khách + rổ hàng gần nhất (nút ở /admin, tab CRM).')
    on conflict (key) do update set value = excluded.value, ghi_chu = excluded.ghi_chu;
  update luu_tru.lan_xoa set so_dong = v where lan = v_lan;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_xoa_khach(p_zalo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.la_admin() then
    raise exception 'chỉ admin được xoá khách' using errcode = '42501';
  end if;
  return public.xoa_nguoi_theo_zalo(p_zalo);
end $function$
;

CREATE OR REPLACE FUNCTION public.ap_fact_du_an_vao_kho(p_id bigint, p_boi text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f project_facts%rowtype;
begin
  select * into f from project_facts where id = p_id;
  if not found or f.project_id is null then return false; end if;
  if public.khoa_du_an_danh_sach(f.khoa) then
    update projects
       set amenities = (select jsonb_agg(distinct x)
                          from jsonb_array_elements_text(coalesce(amenities, '[]'::jsonb) || to_jsonb(array[f.gia_tri])) x),
           updated_at = now()
     where id = f.project_id;
  else
    update projects set specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(f.khoa, f.gia_tri), updated_at = now()
     where id = f.project_id;
  end if;
  update project_facts set trang_thai = 'da_duyet', duyet_at = now(), duyet_boi = p_boi where id = p_id;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.ap_thong_so(p_listing_id uuid, j jsonb, p_bac text, p_de boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text; typ text; n int := 0; r int; v_deal text;
begin
  if p_listing_id is null or j is null or j = '{}'::jsonb then return 0; end if;
  select deal into v_deal from listings where id = p_listing_id;
  for k in select jsonb_object_keys(j) loop
    typ := case k
      when 'frontage_m' then 'numeric' when 'length_m' then 'numeric' when 'rear_width_m' then 'numeric'
      when 'legal_area_m2' then 'numeric' when 'built_area_m2' then 'numeric'
      when 'alley_width_m' then 'numeric' when 'distance_to_street_m' then 'numeric'
      when 'floors' then 'int' when 'floor' then 'int' when 'bedrooms' then 'int'
      when 'bathrooms' then 'int' when 'year_built' then 'int'
      when 'has_completion' then 'boolean' when 'has_elevator' then 'boolean'
      when 'car_in_house' then 'boolean' when 'corner_lot' then 'boolean' when 'negotiable' then 'boolean'
      when 'access_type' then 'text' when 'legal_status' then 'text' when 'planning_status' then 'text'
      when 'furnishing' then 'text' when 'direction' then 'text'
      when 'rent_income_vnd' then 'bigint'
      else null end;
    if typ is null then continue; end if;
    if k = 'rent_income_vnd' and coalesce(v_deal, '') <> 'ban' then continue; end if;
    if k = 'floors' then
      -- 20260923g: "3 tầng" (AI gọn lại) không được xoá "trệt + lửng + 2 lầu + sân thượng" đã đọc từ câu rao —
      -- cùng số tầng mà chữ cũ có lửng / sân thượng / áp mái / hầm còn chữ mới không có thì giữ chữ cũ.
      update listings set floors = (j->>'floors')::int,
             floors_text = case
               when floors = (j->>'floors')::int and coalesce(floors_text, '') ~ '(lửng|sân thượng|áp mái|hầm)'
                    and coalesce(j->>'floors_text', '') !~ '(lửng|sân thượng|áp mái|hầm)' then floors_text
               else j->>'floors_text' end,
             specs_source = p_bac
       where id = p_listing_id and (floors is null or p_de);
    else
      execute format('update listings set %I = ($1)::%s, specs_source = $2 where id = $3 and (%I is null or $4)', k, typ, k)
        using j->>k, p_bac, p_listing_id, p_de;
    end if;
    get diagnostics r = row_count;
    n := n + r;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.assign_ctv_round_robin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare picked uuid; v_district text;
begin
  if new.ctv_id is not null then return new; end if;
  -- khu của khách mua: quận trong hồ sơ (preferences.area) nếu có; người bán: quận tin mới nhất
  if new.buyer_id is not null then
    select coalesce(b.preferences->>'district', b.preferences->>'area') into v_district from buyers b where b.id = new.buyer_id;
  elsif new.seller_id is not null then
    select l.district into v_district from listings l where l.seller_id = new.seller_id order by l.created_at desc limit 1;
  end if;
  picked := public.chon_ctv(v_district);
  if picked is not null then
    new.ctv_id := picked;
    update public.ctvs set last_assigned_at = now() where id = picked;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.bac_nguon(p_source text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_source
    when 'chu_xac_nhan' then 3
    when 'admin'        then 2
    when 'ctv'          then 2
    else 1
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.bao_can_da_chot(p_listing_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_code text; v_note text; v_thay text; n int := 0;
begin
  select code into v_code from listings where id = p_listing_id;
  for r in
    select i.buyer_id
      from interests i
      join buyers b on b.id = i.buyer_id
     where i.listing_id = p_listing_id
       and b.zalo_user_id is not null
       and not exists (select 1 from deals d where d.listing_id = p_listing_id and d.buyer_id = i.buyer_id)
       and not exists (select 1 from reminders x
                        where x.buyer_id = i.buyer_id and x.kind = 'sold'
                          and x.status in ('pending', 'sent')
                          and x.created_at > now() - interval '24 hours')
     limit 50
  loop
    select string_agg(c.tom_tat, '; ') into v_thay
      from public.can_cung_khu(r.buyer_id, p_listing_id, 2) c;
    v_note := '#' || coalesce(v_code, '?') || ' đã chốt'
           || coalesce(' · thay thế: ' || v_thay, '');
    insert into reminders (kind, buyer_id, listing_id, due_at, note)
    values ('sold', r.buyer_id, p_listing_id, now(), v_note)
    on conflict (buyer_id, listing_id) where kind = 'sold' do nothing;
    n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.bao_hong_nhac(p_id uuid, p_detail text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_attempts int; v_max constant int := 5;
begin
  select attempts into v_attempts from reminders where id = p_id;
  if v_attempts is null then return 'khong_co'; end if;
  if v_attempts >= v_max then
    update reminders set status='dead', last_error=left(p_detail,300), locked_at=null
     where id = p_id;
    return 'dead';
  end if;
  update reminders set locked_at=null, last_error=left(p_detail,300),
         next_retry_at = now() + public.lan_thu_ke(v_attempts) where id = p_id;
  return 'retry';
end $function$
;

CREATE OR REPLACE FUNCTION public.bao_tin_moi_khop(p_listing_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l          record;
  v_deal     text;
  v_ward_no  text;
  v_ward_kd  text;
  v_dist_kd  text;
  v_dist_re  text;
  v_note     text;
  v_n        integer := 0;
begin
  select id, code, deal::text as deal, district, ward, price_vnd, price_raw,
         area_m2, access_type, alley_width_m
    into l
    from listings where id = p_listing_id;
  if l.id is null or l.price_vnd is null or l.ward is null or btrim(l.ward) = '' then
    return 0;
  end if;

  v_deal    := coalesce(l.deal, 'ban');
  v_ward_kd := btrim(regexp_replace(public.bo_dau(l.ward), '^phuong\s*', ''));
  v_ward_no := (regexp_match(v_ward_kd, '^([0-9]{1,2})$'))[1];
  v_dist_kd := btrim(public.bo_dau(coalesce(l.district, '')));
  -- "quan 5" → khớp "quan 5" / "q5" / "q.5" (không dính "quan 50", "q15")
  v_dist_re := case
    when v_dist_kd ~ '^(quan|q)\s*\.?\s*[0-9]{1,2}$'
      then '(quan|q)\s*\.?\s*' || (regexp_match(v_dist_kd, '([0-9]{1,2})$'))[1] || '\M'
    when v_dist_kd <> '' then '\m' || v_dist_kd || '\M'
    else null end;

  v_note := '#' || l.code
         || ' · ' || l.ward || coalesce(', ' || l.district, '')
         || coalesce(' · ' || l.price_raw, '')
         || coalesce(' · ' || rtrim(to_char(l.area_m2, 'FM9999999990.99'), '.') || 'm2', '')
         || coalesce(' · ' || case l.access_type
              when 'mat_tien'   then 'mặt tiền'
              when 'hem_xe_tai' then 'hẻm xe tải'
              when 'hem_xe_hoi' then 'hẻm xe hơi'
              when 'hem_xe_may' then 'hẻm xe máy'
              when 'hem'        then 'trong hẻm' end
            || coalesce(' ' || rtrim(to_char(l.alley_width_m, 'FM9999990.99'), '.') || 'm', ''), '');

  insert into reminders (kind, buyer_id, listing_id, due_at, note)
  select 'match', b.id, l.id, now(), v_note
    from (
      select b.id, b.last_contact_at,
             public.bo_dau(coalesce(b.preferences->>'area', '')) as area_kd,
             coalesce(b.preferences->>'deal', 'ban')             as deal,
             public.parse_vnd(b.preferences->>'budget')          as budget
        from buyers b
       where b.zalo_user_id is not null
         and b.last_contact_at >= now() - interval '30 days'
         and b.preferences is not null
    ) b
   where -- giao dịch
         (case when b.deal in ('thue', 'cho_thue') then 'cho_thue' else 'ban' end) = v_deal
     -- ngân sách trong dải
     and b.budget is not null
     and b.budget between (l.price_vnd * 0.7)::bigint and (l.price_vnd * 1.15)::bigint
     -- khu vực
     and b.area_kd <> ''
     and (
       case
         -- khách NÊU số phường → phải đúng phường của tin
         when b.area_kd ~ '(phuong\s*\.?\s*[0-9]{1,2}|(^|[^a-z0-9])p\.?\s*[0-9]{1,2}(?![0-9]))' then
              v_ward_no is not null
              and b.area_kd ~ ('(phuong\s*\.?\s*' || v_ward_no || '(?![0-9])|(^|[^a-z0-9])p\.?\s*' || v_ward_no || '(?![0-9]))')
         -- không nêu phường: tên phường chữ, hoặc quận/huyện
         else (v_ward_no is null and v_ward_kd <> '' and b.area_kd ~ ('\m' || v_ward_kd || '\M'))
              or (v_dist_re is not null and b.area_kd ~ v_dist_re)
       end
     )
     -- van 24 giờ: một khách một tin chủ động loại này mỗi ngày
     and not exists (select 1 from reminders r
                      where r.buyer_id = b.id and r.kind = 'match'
                        and r.status in ('pending', 'sent')
                        and r.created_at > now() - interval '24 hours')
   order by b.last_contact_at desc
   limit 50
  on conflict (buyer_id, listing_id) where kind = 'match' do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.bat_het_tien_api()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lan_cuoi timestamptz;
  v_noi_dung text;
begin
  if new.source = 'HET TIEN API' then
    return null;
  end if;
  -- 20260923h: 402 của Gemini embedding (tìm theo nghĩa) không làm bot câm — nhung-tick tự giãn nhịp, không báo nhầm.
  -- 20261002c: lọc theo TIỀN TỐ nguồn 'nhung%' (bản cũ ghi đúng tên 'nhung-tick' nên 'nhung-dia-danh-tick' lọt: câu 429 của
  -- Gemini có chữ "billing" → 3 lần "BỘ NÃO ĐANG CÂM — HẾT TIỀN" báo nhầm ngày 01/10) + mọi lỗi Gemini (còi này nói về Anthropic).
  if new.source like 'nhung%'
     or lower(coalesce(new.detail, '')) like '%ai.studio%'
     or lower(coalesce(new.detail, '')) like '%generativelanguage%'
     or lower(coalesce(new.detail, '')) like '%resource_exhausted%'
     or lower(coalesce(new.detail, '')) like '%gemini%' then
    return null;
  end if;

  if not (
       lower(coalesce(new.detail,'')) like '%credit balance%'
    or lower(coalesce(new.detail,'')) like '%plans & billing%'
    or lower(coalesce(new.detail,'')) like '%plans and billing%'
    or lower(coalesce(new.detail,'')) like '%insufficient%quota%'
    or lower(coalesce(new.detail,'')) like '%billing%'
    or coalesce(new.status_code, 0) = 402
  ) then
    return null;
  end if;

  select max(at) into v_lan_cuoi
    from bot_errors where source = 'HET TIEN API';

  if v_lan_cuoi is not null and v_lan_cuoi > now() - interval '6 hours' then
    return null;
  end if;

  v_noi_dung :=
    '🔴 BỘ NÃO ĐANG CÂM — HẾT TIỀN TÀI KHOẢN AI. Mọi tin khách nhắn vào sẽ KHÔNG '
    || 'có câu trả lời cho tới khi nạp tiền. Vào console.anthropic.com → Plans & '
    || 'Billing để nạp, rồi xem mục Usage để biết khoá nào tiêu hết. '
    || 'Nguồn báo: ' || coalesce(new.source,'?')
    || ' · nguyên văn: ' || left(coalesce(new.detail,''), 200);

  insert into bot_errors (source, status_code, detail)
  values ('HET TIEN API', new.status_code, left(v_noi_dung, 500));

  return null;
exception when others then
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.beat(p_who text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into bot_health (who, at) values (p_who, now())
  on conflict (who) do update set at = now();
$function$
;

CREATE OR REPLACE FUNCTION public.bo_dau(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select translate(lower(t),
    'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')
$function$
;

CREATE OR REPLACE FUNCTION public.bo_dem_nhac_treo(p_gio integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_so int;
begin
  select count(*) into v_so
    from reminders
   where status = 'pending'
     and kind in ('escalation', 'report')
     and created_at < now() - make_interval(hours => p_gio);

  if v_so > 0 then
    perform public.log_loi(
      'nhac treo qua lau',
      format('%s lời nhắc escalation/report nằm chờ quá %s giờ — bridge (escalation-feed) '
             || 'nhiều khả năng không chạy hoặc sai BRIDGE_SECRET. Chúng KHÔNG tự vào thư '
             || 'chết: nudge nhả lại mỗi nhịp nên đếm lượt luôn về 0 và không có lỗi nào '
             || 'khác lộ ra. Xem /admin.', v_so, p_gio),
      null::int
    );
  end if;
  return v_so;
end $function$
;

CREATE OR REPLACE FUNCTION public.boc_tach_nhom(l listings)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f   jsonb;
  bt  jsonb := coalesce(l.boc_tach, '{}'::jsonb);
  anh jsonb;
  bs  jsonb;
  url_chat jsonb;
  s   record;
  d   jsonb;
begin
  if l.id is null then return null; end if;
  select coalesce(jsonb_object_agg(x.question, x.answer), '{}'::jsonb) into f
    from (select distinct on (question) question, answer
            from public.listing_facts
           where listing_id = l.id and question not in ('bo_sung', 'hinh_anh', 'duyet_tin', 'ngung_rao_can_nao')
           order by question, created_at desc) x;
  select coalesce(jsonb_agg(answer order by created_at), '[]'::jsonb) into bs
    from public.listing_facts where listing_id = l.id and question = 'bo_sung';
  select coalesce(jsonb_agg(answer order by created_at), '[]'::jsonb) into url_chat
    from public.listing_facts where listing_id = l.id and question = 'hinh_anh';
  select coalesce(jsonb_agg(jsonb_build_object(
           'loai', media_type, 'kho', bucket, 'duong_dan', storage_path,
           'nguon', nguon, 'mo_ta', mo_ta, 'ocr', ocr, 'bia', is_cover) order by sort_order), '[]'::jsonb)
    into anh from public.listing_media where listing_id = l.id;
  select name, seller_type, ten_tro_ly into s from public.sellers where id = l.seller_id;
  d := public.diem_tin(l);

  return public.jsonb_bo_rong(jsonb_build_object(
    'tin', jsonb_build_object(
      'ma', l.code, 'ma_cu', l.legacy_code, 'loai_giao_dich', l.deal,
      'loai_bds', nullif(l.property_type::text, 'chua_ro'), 'trang_thai', l.status, 'gap', l.gap,
      'nguon', l.source, 'tu_chat', l.can_chu_duyet, 'chu_duyet_luc', l.chu_duyet_at,
      'chu_noi_du_luc', l.chu_noi_du_at, 'tao_luc', l.created_at, 'sua_luc', l.updated_at, 'id', l.id),
    'nguoi_rao', jsonb_build_object('ten', s.name, 'vai', s.seller_type, 'tro_ly', s.ten_tro_ly),
    'vi_tri', jsonb_build_object(
      'dia_chi', l.location_raw, 'duong', l.street, 'phuong', l.ward, 'quan', l.district,
      'chu_noi', f->>'vi_tri', 'du_an', bt->>'du_an', 'ma_can', l.unit_code,
      'loai_duong', l.access_type, 'do_rong_hem_m', l.alley_width_m,
      'do_rong_hem', coalesce(f->>'do_rong_hem', f->>'do_rong_duong', f->>'duong_vao'),
      'cach_mat_tien_m', l.distance_to_street_m, 'cach_mat_tien', f->>'cach_mat_tien',
      'hem_thong', f->>'hem_thong', 'ngap_nuoc', f->>'ngap_nuoc', 'ha_tang', f->>'ha_tang',
      'tien_ich_gan', f->>'tien_ich_gan', 'khu_compound', f->>'khu_compound',
      'duong_container', f->>'duong_container', 'lat', l.lat, 'lng', l.lng),
    'thong_so', jsonb_build_object(
      'dien_tich_m2', l.area_m2, 'dien_tich_so_m2', l.legal_area_m2, 'dien_tich_xay_m2', l.built_area_m2,
      'chu_noi_dien_tich', coalesce(f->>'dien_tich', f->>'dien_tich_dat', f->>'dien_tich_tim_tuong'),
      'ngang_m', l.frontage_m, 'dai_m', l.length_m, 'no_hau_m', l.rear_width_m, 'no_hau', f->>'no_hau',
      'mat_tien', f->>'mat_tien', 'tho_cu', f->>'tho_cu', 'hinh_dang', f->>'hinh_dang',
      'so_tang', l.floors, 'ket_cau', coalesce(l.floors_text, f->>'ket_cau'), 'tang', l.floor, 'chu_noi_tang', f->>'tang',
      'so_phong_ngu', l.bedrooms, 'so_wc', coalesce(l.bathrooms::text, f->>'so_wc'),
      'huong', coalesce(l.direction, f->>'huong'), 'view', f->>'view',
      'can_goc', coalesce(l.corner_lot::text, f->>'can_goc'), 'thang_may', coalesce(l.has_elevator::text, f->>'thang_may'),
      'o_to_trong_nha', l.car_in_house, 'san_vuon', f->>'san_vuon', 'hien_trang', f->>'hien_trang',
      'nam_xay', coalesce(l.year_built::text, f->>'nam_xay'),
      'mat_do_xd', f->>'mat_do_xd', 'tang_cao_toi_da', f->>'tang_cao_toi_da',
      'so_phong', f->>'so_phong', 'pccc', f->>'pccc',
      'chieu_cao', f->>'chieu_cao', 'tai_trong_san', f->>'tai_trong_san', 'tram_bien_ap', f->>'tram_bien_ap',
      'xu_ly_nuoc_thai', f->>'xu_ly_nuoc_thai',
      'duong_vao', f->>'duong_vao', 'nguon_nuoc', f->>'nguon_nuoc', 'ranh_gioi', f->>'ranh_gioi'),
    'phap_ly', jsonb_build_object(
      'tinh_trang', l.legal_status, 'hoan_cong', l.has_completion,
      'quy_hoach', coalesce(l.planning_status, f->>'quy_hoach'), 'chu_noi', f->>'phap_ly',
      'the_chap', f->>'the_chap', 'xay_dung', f->>'xay_dung', 'so_huu', f->>'so_huu',
      'len_tho_cu', f->>'len_tho_cu', 'thoi_han_su_dung', f->>'thoi_han_su_dung',
      'hinh_thuc_thue_dat', f->>'hinh_thuc_thue_dat', 'muc_dich', f->>'muc_dich'),
    'gia', jsonb_build_object(
      'gia_raw', l.price_raw, 'gia_vnd', l.price_vnd, 'gia_m2_vnd', l.price_per_m2_vnd,
      'thuong_luong', coalesce(l.negotiable::text, f->>'thuong_luong'), 'gap', l.gap,
      'ly_do_ban', f->>'ly_do_ban', 'hien_trang_su_dung', f->>'hien_trang_su_dung'),
    'cho_thue', jsonb_build_object(
      'tien_coc', f->>'tien_coc', 'thoi_han_thue', f->>'thoi_han_thue', 'truot_gia', f->>'truot_gia',
      'fit_out', f->>'fit_out', 'noi_that', coalesce(l.furnishing, f->>'noi_that'),
      'phi_quan_ly', f->>'phi_quan_ly', 'phi_gui_xe', f->>'phi_gui_xe',
      'gia_dien_nuoc', f->>'gia_dien_nuoc', 'gio_giac', f->>'gio_giac',
      'doanh_thu_thang_vnd', l.rent_income_vnd, 'doanh_thu', f->>'doanh_thu', 'ty_le_lap_day', f->>'ty_le_lap_day'),
    'khai_thac', jsonb_build_object('tiem_nang', f->>'tiem_nang', 'nganh_hang_phu_hop', f->>'nganh_hang_phu_hop'),
    'anh', jsonb_build_object('so_tam', (d->>'so_anh')::int, 'kho', anh, 'url_chat', url_chat),
    'bo_sung', bs,
    'cham_soc', jsonb_build_object(
      'danh_gia', f->>'danh_gia', 'ket_thuc', bt->>'ket_thuc', 'ket_thuc_luc', bt->>'ket_thuc_luc',
      'ket_thuc_loi', bt->>'ket_thuc_loi', 'boc_tach_cap_nhat', bt->>'_cap_nhat'),
    'diem', jsonb_build_object('tong', d->'diem', 'chi_tiet', d->'chi_tiet', 'thieu', d->'thieu')
  ));
end $function$
;

CREATE OR REPLACE FUNCTION public.boc_tach_nhom(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when coalesce(auth.role(), '') = 'service_role' or public.la_admin()
              then public.boc_tach_nhom(l) end
    from public.listings l where l.id = p_listing_id;
$function$
;

CREATE OR REPLACE FUNCTION public.boc_ten_duong(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(btrim(
           -- 14/09/2026 (bắn 14 tin bán): "đường Lạc Long Quân p5", "hxh Nguyễn Kiệm Phú Nhuận" —
           -- phường/quận viết liền sau tên đường (không dấu phẩy) từng dính vào cột street.
           -- 15/09/2026 (bắn thật N1): "mặt tiền Nguyễn Chí Thanh" / "mt X" — bỏ chữ mặt tiền.
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(
             regexp_replace(
               -- 20261003b: số nhà ĐỨNG TRƯỚC chữ hẻm / đường ("88 hẻm 6m Tân Kỳ Tân Quý", "156/12/4 đường 59") bỏ TRƯỚC, để bước gọt chạy được.
               regexp_replace(regexp_replace(seg, '^(?:(?:số|so)\s*)?[0-9]+[a-z]?(?:/[0-9]+[a-z]?)*\s+(?=(?:hẻm|hem|hxh|ngõ|ngo|kiệt|kiet|đường|duong|phố|pho)(?![[:alpha:]]))', '', 'i'),
                 '^(?:hẻm|hem|hxh|ngõ|ngo|kiệt|kiet)(?:\s+|(?=\d))(?:(?:xe\s*hơi|xe\s*hoi|xe\s*tải|xe\s*tai|xe\s*máy|xe\s*may|ba\s*gác|ba\s*gac|thông|thong|cụt|cut|nhựa|nhua|bê\s*tông|be\s*tong|rộng|rong|lớn|lon|nhỏ|nho|xh)(?![[:alpha:]])\s*|[0-9]+(?:[.,][0-9]+)?\s*m(?![[:alpha:]])\s*|[0-9]+[a-z]?(?:/[0-9]+[a-z]?)*(?![[:alpha:]0-9])\s*)*',
                 '', 'i'),
               '^(?:đường|duong|phố|pho|đ\.|đ |mặt tiền|mat tien|mt(?![[:alpha:]]))\s*', '', 'i'),
             '^(?:(?:nhựa|nhua|bê\s*tông|be\s*tong|rộng|rong|lớn|lon|nhỏ|nho)(?![[:alpha:]])\s*|[0-9]+(?:[.,][0-9]+)?\s*m(?![[:alpha:]])\s*)+',
             '', 'i'),
             -- 22/09/2026 (bắn thật sau deploy #182): số nhà TRẦN đầu chuỗi ("12 Trần Hưng Đạo", "số 7 Hồng Bàng",
             -- "123/4 An Dương Vương") từng ở lại trong `street` — trước chỉ bỏ số khi đứng sau hẻm/đường.
             -- Giữ "3 Tháng 2", "30 Tháng 4" (số là một phần tên đường).
             '^(?:(?:số|so)\s*)?[0-9]+[a-z]?(?:/[0-9]+[a-z]?)*\s+(?!(?:tháng|thang)(?![[:alpha:]]))',
             '', 'i'),
             '\s+(?:(?:phường|phuong|p\.?)\s*\d{1,2}|(?:quận|quan|q\.?)\s*\d{1,2}|phú nhuận|phu nhuan|tân bình|tan binh|bình thạnh|binh thanh|gò vấp|go vap|tân phú|tan phu|bình tân|binh tan|thủ đức|thu duc|nhà bè|nha be|bình chánh|binh chanh|hóc môn|hoc mon|củ chi|cu chi)(?![[:alpha:]]).*$',
             '', 'i'),
             -- 20261014a (SRS-5.1zzzzzzm): số nhà ĐỨNG CUỐI với chữ "số" ("huỳnh tấn phát số 1235") — chỉ khi trước nó còn tên
             -- đường thật (≥ 2 chữ cái) và chữ ngay trước không phải từ loại đường (giữ "đường số 59").
             '^(.*?[[:alpha:]]{2}.*?)(?<!(?:đường|duong|phố|pho|hẻm|hem|ngõ|ngo|kiệt|kiet|số|so))\s+(?:số|so)\s*[0-9]+[a-z]?(?:/[0-9]+[a-z]?)*$',
             '\1', 'i')), '')
  from (
    select s as seg
    from unnest(string_to_array(coalesce(p, ''), ',')) with ordinality as t(s, i)
    where btrim(s) !~* '^(?:số|so)?\s*\d+[a-z]?(?:/\d+[a-z]?)*$'
      and btrim(s) !~* '^(?:hẻm|hem|hxh)\s*[\d/]+\s*$'
      and btrim(s) !~* '^(?:dự án|du an|chung cư|căn hộ|can ho|chcc|cc |toà|tòa|toa|khu|kdc|cư xá|cu xa)'
      and btrim(s) !~* '^(?:phường|phuong|p\.|p\d|quận|quan|q\.|q\d|tp|thành phố|hồ chí minh|ho chi minh|việt nam)'
      and btrim(s) <> ''
    order by i limit 1
  ) x
$function$
;

CREATE OR REPLACE FUNCTION public.boc_thong_so(p_text text, p_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  k text;
  k_ngang text;
  m text[];
  j jsonb := '{}'::jsonb;
  n_lau int; co_tret bool; co_lung bool; co_st bool; co_ham bool; co_apmai bool;
  k_phu text;
  parts text[];
  chung_cu bool := coalesce(p_type = 'chung_cu', false);
  -- 20260928f (FR-241): tin ĐẤT không có kết cấu — "còn lại cây lâu năm" từng thành "trệt + 1 lầu".
  la_dat bool := coalesce(p_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh'), false);
begin
  if p_text is null or btrim(p_text) = '' then return j; end if;
  k := public.bo_dau(p_text);
  k := regexp_replace(k, '(\d),(\d)', '\1.\2', 'g');
  k := regexp_replace(k, '\s+', ' ', 'g');
  -- 20260930d (bắn thử vector 30/09): "nhà có 1 phòng ngủ ngay tầng trệt cho người già" (fact thông tin bổ sung) từng điền
  -- số phòng ngủ = 1 vào ô trống — phòng ngủ Ở ĐÂU, không phải TỔNG số. Bỏ cụm đó trước khi đọc phòng ngủ / kết cấu (cùng
  -- luật soPhongNguTheoTang ở khop-cau-tra-loi.ts: có chữ chỉ chỗ, hoặc "trệt"; "2pn tầng 12" của căn hộ vẫn đọc).
  k := regexp_replace(k, '\m(\d{1,2}|mot|hai|ba|bon|nam)\s*(?:phong ngu|pn)\s+(?:(?:(?:o|ngay|nam|duoi|tren|tai)\s+){1,2}(?:tang\s+tret|(?:tang|lau)\s+\d{1,2}|tang|tret|lau)|(?:tang\s+)?tret)\M', ' ', 'g');
  k := replace(k, 'm²', 'm2');
  k := regexp_replace(k, '(\d)\s*m ?2\M', '\1m2', 'g');
  k := replace(k, 'm2', 'mv');
  k := regexp_replace(k, '(\d)m(\d)', '\1.\2', 'g');
  k := replace(k, 'mv', 'm2');
  k := regexp_replace(k, '(\d)\s*\*\s*(\d)', '\1 x \2', 'g');
  k := replace(k, 'hem hong', 'hemhong');
  k := regexp_replace(k, '\m2 ?mt\M', '2 mat tien', 'g');
  k_ngang := regexp_replace(k, '(cach|ra|toi|den|gan|sat|buoc ra|ke)\s*(mat tien|\mmt\M)\s*(?:chi|khoang|tam|hon|gan|duong)?[^,;.]{0,25}?\d+(?:\.\d+)?\s*m\M', ' ', 'g');

  m := regexp_match(k, '(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?');
  if m is not null and m[1]::numeric between 1.5 and 40 and m[2]::numeric between 3 and 150 then
    j := j || jsonb_build_object('frontage_m', m[1]::numeric, 'length_m', m[2]::numeric);
  end if;
  if j->>'frontage_m' is null then
    m := regexp_match(k_ngang, '(?:ngang|mat tien|chieu ngang|be ngang)\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m?\M');
    if m is not null and m[1]::numeric between 1.5 and 40 then j := j || jsonb_build_object('frontage_m', m[1]::numeric); end if;
  end if;
  if j->>'length_m' is null then
    m := regexp_match(k, '(?:dai|chieu dai|chieu sau)\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m?\M');
    if m is not null and m[1]::numeric between 3 and 150 then j := j || jsonb_build_object('length_m', m[1]::numeric); end if;
  end if;
  if j->>'frontage_m' is null and j->>'length_m' is not null then
    m := regexp_match(k, '(\d+(?:\.\d+)?)\s*m?\s*,?\s*(?:dai|chieu dai)\s*(?:hon|gan|:)?\s*\d');
    if m is not null and m[1]::numeric between 1.5 and 40 then j := j || jsonb_build_object('frontage_m', m[1]::numeric); end if;
  end if;
  m := regexp_match(k, 'no hau\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)');
  if m is not null and m[1]::numeric between 1.5 and 40 then j := j || jsonb_build_object('rear_width_m', m[1]::numeric); end if;

  m := regexp_match(k, '(?:cong nhan|dtcn|dt cn|so|so hong)\s*(?:thuc te|du)?\s*:?\s*(\d+(?:\.\d+)?)\s*m2');
  if m is not null and m[1]::numeric between 5 and 5000 then j := j || jsonb_build_object('legal_area_m2', m[1]::numeric); end if;
  m := regexp_match(k, '(?:dtxd|dt xd|dien tich xay dung|dt xay dung|dien tich san|dt san|dtsd|dt sd|dien tich su dung|dt su dung|tong dien tich san)\s*:?\s*(\d+(?:\.\d+)?)\s*m(?:2|\M)');
  if m is not null and m[1]::numeric between 5 and 20000 then j := j || jsonb_build_object('built_area_m2', m[1]::numeric); end if;

  if la_dat then
    null;
  elsif not chung_cu then
    co_tret  := k ~ '\mtret\M';
    -- 20261011a (SRS-5.1zzzzy, khách mô phỏng 11/10: "không có gác lửng ạ, 4 tầng đầy đủ" → "trệt + lửng + 3 lầu"): tầng phụ
    -- (lửng / sân thượng / hầm / áp mái) đi sau chữ PHỦ ĐỊNH là chủ nhà nói KHÔNG có — bỏ cụm đó trước khi dò có / không.
    k_phu := regexp_replace(k, '\m(?:khong|ko|kg|khg|chua|hong|hok|k)\s+(?:co\s+)?(?:gac\s+|tang\s+)?(?:lung|san thuong|ham|ap mai|mai tum)\M', ' ', 'g');
    co_lung  := k_phu ~ '\mlung\M';
    co_st    := k_phu ~ '(san thuong|\mst\M|mai tum)';
    co_ham   := k_phu ~ '\mham\M';
    co_apmai := k_phu ~ 'ap mai';
    n_lau := null;
    m := regexp_match(k, '(?:tong )?so tang\s*:?\s*(\d+)');
    if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('floors', m[1]::int); end if;
    if j->>'floors' is null
       and k !~ '(duoc xay|xay duoc|cho xay|co the xay|xay len|xay them|nang len|len duoc|len toi)\s*(?:len|toi|den|them|toi da)?\s*\d+\s*tam'
       and k !~ '(cap 4|nha c4|\mc4\M)' then
      m := regexp_match(k, '\m(\d+)\s*tam(\s*ruoi)?\M');
      if m is not null and m[1]::int between 1 and 30 then
        j := j || jsonb_build_object('floors', m[1]::int);
        if m[2] is not null then co_lung := true; end if;
      end if;
    end if;
    m := regexp_match(k, '\m(\d+)\s*lau\M');
    if m is not null and m[1]::int between 1 and 30 and j->>'floors' is null then n_lau := m[1]::int; end if;
    if n_lau is null then
      -- BỎ |t ở đây kẻo "7t" (7 tỷ) thành 7 tầng
      m := regexp_match(k, '\m(\d+)\s*tang\M');
      if m is not null and m[1]::int between 1 and 30 and j->>'floors' is null then
        j := j || jsonb_build_object('floors', m[1]::int);
      end if;
      if j->>'floors' is null and (k ~ '\mlau\M(?!\s*(nam|doi|dai|roi|qua|lam|ngay|nay))' or co_tret) then
        j := j || jsonb_build_object('floors', case when k ~ '\mlau\M(?!\s*(nam|doi|dai|roi|qua|lam|ngay|nay))' then 2 else 1 end);
      end if;
      if j->>'floors' is null and k ~ '(cap 4|nha c4|\mc4\M)' then j := j || jsonb_build_object('floors', 1); end if;
    else
      j := j || jsonb_build_object('floors', n_lau + 1);
    end if;
    -- 20261012b (SRS-5.1zzzzzg): "4 tầng tính cả lửng" — lửng nằm TRONG số tầng → trệt + lửng + 2 lầu (floors = 3, không tính lửng), cùng
    -- phép `ketCauTheoLung` (TS). Bản cũ cộng lửng ra ngoài: trệt + lửng + 3 lầu — hai tầng hiểu ngược nhau một câu.
    if co_lung and n_lau is null and (j->>'floors')::int > 1
       and k_phu ~ '(tinh ca|tinh luon|gom ca|gom luon|bao gom)\s*(?:(?:gac|tang)\s*)?lung' then
      j := j || jsonb_build_object('floors', (j->>'floors')::int - 1);
    end if;
    if j->>'floors' is not null then
      parts := array[]::text[];
      if co_ham then parts := array_append(parts, 'hầm'); end if;
      parts := array_append(parts, 'trệt');
      if co_lung then parts := array_append(parts, 'lửng'); end if;
      if n_lau is not null then parts := array_append(parts, n_lau || ' lầu');
      elsif (j->>'floors')::int > 1 then parts := array_append(parts, ((j->>'floors')::int - 1) || ' lầu'); end if;
      if co_apmai then parts := array_append(parts, 'áp mái'); end if;
      if co_st then parts := array_append(parts, 'sân thượng'); end if;
      j := j || jsonb_build_object('floors_text', array_to_string(parts, ' + '));
    end if;
  else
    m := regexp_match(k, '(?:tang|lau)\s*(\d{1,2})\M');
    if m is not null and m[1]::int between 1 and 80 then j := j || jsonb_build_object('floor', m[1]::int); end if;
  end if;

  m := regexp_match(k, '(\d+)\s*(?:pn|phong ngu|p\.ngu)\M');
  if m is null then m := regexp_match(k, 'so phong ngu\s*:?\s*(\d+)'); end if;
  if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('bedrooms', m[1]::int); end if;
  m := regexp_match(k, '(\d+)\s*(?:wc|toilet|nha ve sinh|nvs|ve sinh|phong tam)\M');
  if m is null then m := regexp_match(k, '(?:so )?(?:phong ve sinh|phong tam|wc)\s*:?\s*(\d+)\M'); end if;
  if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('bathrooms', m[1]::int); end if;

  if k ~ '(nha|ban nha|can nha|can|ban|thue|cho thue)\s*(?:pho|rieng|dep|gap|nguyen can|moi)?\s*(hem|\mhxh\M|\mhxt\M)' then
    null;
  elsif k ~ '(cach|gan|sat|ra|toi|den|buoc ra|ke|ngay|\d+\s*m) (mat tien|\mmt\M)' and k !~ '(nha|ban|ban nha|can|lo)\s*(\d\s*)?mat tien' then
    null;
  elsif k ~ '(mat tien|\mmt\M|mat pho|mat duong|co via he|via he rong|le duong)' then
    j := j || jsonb_build_object('access_type', 'mat_tien');
  end if;
  if j->>'access_type' is null then
    if k ~ '(xe hoi|o ?to|xe tai|xe 4 banh)\s*(khong|ko|k|kg|chua)\s*(vo|vao|toi|den|duoc|lot|qua)' or k ~ '(khong|ko|k|kg|chua)\s*(co\s*)?(xe hoi|o ?to|xe tai)\s*(nao\s*)?(vo|vao|toi|duoc)' then j := j || jsonb_build_object('access_type', 'hem_xe_may');
    elsif k ~ '(hem xe tai|\mhxt\M|xe tai)' then j := j || jsonb_build_object('access_type', 'hem_xe_tai');
    elsif k ~ '(hem xe hoi|\mhxh\M|hem o ?to|hem xe con|xe hoi(?! (?:vo |vao |ngu |de |dau )?trong nha)|o ?to (vo|vao|dau|toi|do)|hem 7 cho|xe 7 cho)' then j := j || jsonb_build_object('access_type', 'hem_xe_hoi');
    elsif k ~ '(\mhxm\M|hem xe may|hem nho|hem ba gac|hem 3 gac|hem xe 3 banh|xe may)' then j := j || jsonb_build_object('access_type', 'hem_xe_may');
    elsif k ~ '\mhem\M' then j := j || jsonb_build_object('access_type', 'hem');
    end if;
  end if;
  m := regexp_match(k, '(?:hem|hxh|hxt|hxm|duong truoc nha|duong)\s*(?:xe hoi|xe tai|xe may|truoc nha|rong|thong)?\s*(?:rong)?\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m\M');
  if m is not null and m[1]::numeric between 1 and 40 then
    j := j || jsonb_build_object('alley_width_m', m[1]::numeric);
    if j->>'access_type' = 'hem' then
      j := j || jsonb_build_object('access_type', case when m[1]::numeric >= 6 then 'hem_xe_tai' when m[1]::numeric >= 3.5 then 'hem_xe_hoi' when m[1]::numeric >= 3 then 'hem' else 'hem_xe_may' end);
    end if;
  end if;
  m := regexp_match(k, '(?:cach|ra)\s*(?:mat tien|\mmt\M)\s*(?:chi|khoang|tam|hon|gan|duong)?\s*(?:[a-z ]{0,25}?)\s*(\d+(?:\.\d+)?)\s*m\M');
  if m is null then m := regexp_match(k, 'cach\s*(?:chi|khoang|tam)?\s*(\d+(?:\.\d+)?)\s*m\s*(?:la )?(?:ra|toi|den)\s*(?:mat tien|\mmt\M|duong)'); end if;
  if m is not null and m[1]::numeric between 5 and 500 then j := j || jsonb_build_object('distance_to_street_m', m[1]::numeric); end if;

  -- 20260923a: "chưa có sổ" / "không có sổ" / "đang làm sổ" là KHÔNG có sổ — bản cũ khớp "co so" ở giữa câu phủ định.
  if k ~ '(chua|khong|\mko\M|chang|dang cho|dang lam|chua ra)\s+(co\s+|ra\s+|lam\s+)?(so|shr|shc)\M' then null;
  elsif k ~ '(so hong rieng|\mshr\M|so rieng|so do rieng)' then j := j || jsonb_build_object('legal_status', 'so_hong_rieng');
  elsif k ~ '(so hong chung|\mshc\M|so chung|dong so huu)' then j := j || jsonb_build_object('legal_status', 'so_hong_chung');
  elsif k ~ '(hop dong mua ban|\mhdmb\M)' then j := j || jsonb_build_object('legal_status', 'hdmb');
  elsif k ~ '(giay tay|vi bang)' then j := j || jsonb_build_object('legal_status', 'giay_tay');
  elsif k ~ '(so hong|so do|\mshcc\M|so chinh chu|so dep|so vuong|so sach|so cam tay|\mso\M (day du|ro rang|chuan)|co so)' then j := j || jsonb_build_object('legal_status', 'so_hong');
  end if;
  if k ~ 'chua hoan cong' then j := j || jsonb_build_object('has_completion', false);
  elsif k ~ 'hoan cong' then j := j || jsonb_build_object('has_completion', true); end if;
  if k ~ '(khong lo gioi|khong dinh lo gioi|khong bi lo gioi|da bo lo gioi)' then j := j || jsonb_build_object('planning_status', 'khong_lo_gioi');
  elsif k ~ '(khong quy hoach|khong dinh quy hoach|khong quy hoach treo)' then j := j || jsonb_build_object('planning_status', 'khong_quy_hoach');
  elsif k ~ '(dinh lo gioi|co lo gioi|lo gioi \d|dinh quy hoach)' then j := j || jsonb_build_object('planning_status', 'dinh_lo_gioi');
  end if;

  if k ~ 'thang may' then j := j || jsonb_build_object('has_elevator', true); end if;
  if k ~ '(xe hoi (vo|vao|ngu|de) (trong )?nha|o ?to (vo|vao|ngu|dau) (trong |tan )?nha|dau (o ?to|xe hoi|xe oto) trong nha|san dau (o ?to|xe hoi)|\mgarage\M|ga ?ra ?ge|\mgara\M|xe hoi ngu trong nha|(o ?to|xe hoi) (vo|vao|toi) tan (cua|nha)|\d+ (xe hoi|o ?to|xe oto) (vo |vao |ngu |de |dau )?trong nha)' then
    j := j || jsonb_build_object('car_in_house', true);
  end if;
  if k ~ '(can goc|lo goc|nha goc|2 mat tien|hai mat tien|2 mat hem|hai mat hem|goc 2 mat|2 mat thoang)' then j := j || jsonb_build_object('corner_lot', true); end if;
  if k ~ '(full noi that|noi that day du|day du noi that|tang (toan bo |het |full |tat ca )?noi that|noi that cao cap|full nt|tang nt|nt cao cap|nt day du|noi that sang trong)' then j := j || jsonb_build_object('furnishing', 'full');
  elsif k ~ '(noi that co ban|nt co ban)' then j := j || jsonb_build_object('furnishing', 'co_ban');
  elsif k ~ '(khong noi that|nha trong(?!\s+(hem|ngo|kiet|ngach|khu|duong|xom|day|toa|chung cu|du an|kdc|so|lo))|khong co noi that)' then j := j || jsonb_build_object('furnishing', 'khong');
  end if;
  m := regexp_match(k, '(?:xay|xay dung|xd|hoan cong)\s*(?:nam|moi|tu|vao)?\s*(?:giua|dau|cuoi)?\s*(?:nam)?\s*((?:19|20)\d\d)\M');
  if m is null then m := regexp_match(k, 'nam xay\s*(?:dung)?\s*:?\s*((?:19|20)\d\d)\M'); end if;
  if m is not null then j := j || jsonb_build_object('year_built', m[1]::int); end if;

  m := regexp_match(k, 'huong\s*(?:nha|cua|chinh|ban cong)?\s*:?\s*(dong nam|dong bac|tay nam|tay bac|dong|tay|nam|bac)\M');
  if m is not null then
    j := j || jsonb_build_object('direction',
      replace(replace(replace(initcap(m[1]), 'Dong', 'Đông'), 'Tay', 'Tây'), 'Bac', 'Bắc'));
  end if;

  if k ~ '(khong tl|khong thuong luong|gia chot|mien tl|mien thuong luong)' then j := j || jsonb_build_object('negotiable', false);
  elsif k ~ '(\mtl\M|thuong luong|thoa thuan|con tl)' then j := j || jsonb_build_object('negotiable', true); end if;
  m := regexp_match(k, '(?:dang|hien|hien dang|co hop dong)\s*(?:cho )?thue\s*(?:duoc|voi gia|gia|:)?\s*(\d+(?:\.\d+)?)\s*(?:tr|trieu)\M');
  if m is null then m := regexp_match(k, '(?:cho thue|thue)\s*(\d+(?:\.\d+)?)\s*(?:tr|trieu)\s*/?\s*(?:thang|th)\M'); end if;
  if m is not null and m[1]::numeric between 1 and 2000 then j := j || jsonb_build_object('rent_income_vnd', (m[1]::numeric * 1000000)::bigint); end if;

  return j;
end $function$
;

CREATE OR REPLACE FUNCTION public.bot_health_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_from bigint; v_to bigint; v_new integer := 0;
  v_beat timestamptz; v_co_hang boolean; v_hour integer;
  v_dead boolean := false; v_chua_bao_gio boolean := false;
  v_cnt integer; v_ntfy bigint;
  v_ntfy_truoc bigint; v_ma_truoc integer; v_co_dau_vet boolean;
  v_da_gui boolean := false;
begin
  select last_id into v_from from bot_health where who = 'pg_net';
  if v_from is null then
    select coalesce(max(id), 0) into v_from from net._http_response;
    insert into bot_health (who, last_id) values ('pg_net', v_from);
  end if;

  select coalesce(max(id), v_from) into v_to from net._http_response;

  insert into bot_errors (at, source, status_code, detail)
  select r.created, 'pg_net', r.status_code,
         left(public.che_sdt(coalesce(r.error_msg, r.content)), 500)
  from net._http_response r
  where r.id > v_from and r.id <= v_to
    and (r.status_code is null or r.status_code < 200 or r.status_code >= 300)
    -- 20261002c: Gemini 429 (RESOURCE_EXHAUSTED) của lượt nhúng nền là đường đi ĐÚNG THIẾT KẾ — nhung-tick / nhung-dia-danh-tick
    -- tự giãn nhịp và tự ghi sổ lần đầu + mỗi 12 lần. Chép thêm ở đây từng đẻ 2.951 dòng / 24h (đo 02/10, 2.951/2.952 dòng pg_net).
    and not (r.status_code = 429 and coalesce(r.content, '') ilike '%RESOURCE_EXHAUSTED%');
  get diagnostics v_new = row_count;
  update bot_health set last_id = v_to, at = now() where who = 'pg_net';

  v_hour := extract(hour from (now() at time zone 'Asia/Ho_Chi_Minh'))::int;
  select at into v_beat from bot_health where who = 'bridge-zca';
  v_co_hang := found;

  if v_hour between 7 and 22 then
    if not v_co_hang then
      v_chua_bao_gio := true;
      v_dead := true;
      insert into bot_errors (source, detail)
      select 'bridge', 'bridge-zca CHƯA TỪNG điểm danh lần nào — chưa chạy, hoặc chạy mà không ghi được bot_health.'
      where not exists (select 1 from bot_errors
                        where source = 'bridge' and at > now() - interval '1 hour');
    elsif v_beat < now() - interval '15 minutes' then
      v_dead := true;
      insert into bot_errors (source, detail)
      select 'bridge', format('bridge-zca im từ %s (VN)',
                              to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'))
      where not exists (select 1 from bot_errors
                        where source = 'bridge' and at > now() - interval '1 hour');
    end if;
  end if;

  select last_id into v_ntfy_truoc from bot_health
   where who = 'ntfy' and at > now() - interval '1 hour';
  if v_ntfy_truoc is not null then
    select status_code into v_ma_truoc from net._http_response where id = v_ntfy_truoc;
    v_co_dau_vet := found;
    if not v_co_dau_vet then
      v_da_gui := true;
    elsif v_ma_truoc between 200 and 299 then
      v_da_gui := true;
    else
      v_da_gui := false;
      insert into bot_errors (source, detail)
      select 'coi ntfy',
             format('lượt báo trước (pg_net req %s) KHÔNG tới nơi (mã %s) — bắn lại.',
                    v_ntfy_truoc, coalesce(v_ma_truoc::text, 'timeout/không có mã'))
      where not exists (select 1 from bot_errors
                        where source = 'coi ntfy' and at > now() - interval '1 hour');
    end if;
  end if;

  -- QUY TẮC: CHỈ báo động khi bot trên VPS đang tắt (v_dead = true)
  if v_dead
     and not exists (select 1 from reminders
                     where kind = 'escalation' and note like '🚨%'
                       and created_at > now() - interval '1 hour') then
    update reminders set status = 'cancelled'
     where kind = 'escalation' and status = 'pending' and note like '🚨%';
    insert into reminders (kind, due_at, note)
    values ('escalation', now(),
      format('🚨 CẢNH BÁO: Bot trên VPS (bridge-zca) đang tắt hoặc im từ %s. Cần kiểm tra VPS!',
             case when v_chua_bao_gio then 'chưa từng điểm danh'
                  else to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') end));
  end if;

  if v_dead and not v_da_gui then
    v_ntfy := public.canh_bao_ngoai(
      '🚨 [BOT VPS TẮT] Mất kết nối bridge Zalo',
      format('Bot trên VPS đang im tiếng từ %s. Vui lòng kiểm tra dịch vụ nhadat-bridge trên VPS.',
             case when v_chua_bao_gio then 'chưa từng điểm danh'
                  else to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') end),
      5, false);
    insert into bot_health (who, at, last_id) values ('ntfy', now(), coalesce(v_ntfy, 0))
    on conflict (who) do update set at = now(), last_id = excluded.last_id;
  end if;

  update reminders set status = 'cancelled'
   where kind = 'report' and status = 'pending' and created_at < now() - interval '36 hours';

  delete from bot_errors where at < now() - interval '30 days';

  return jsonb_build_object('loi_moi', v_new, 'bridge_im', v_dead,
                            'bridge_chua_bao_gio', v_chua_bao_gio,
                            'quet_toi', v_to, 'ntfy', v_ntfy,
                            'lan_truoc_da_gui', v_da_gui);
end $function$
;

CREATE OR REPLACE FUNCTION public.bump_model_quota(p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_calls integer;
begin
  insert into bot_usage (day, model_calls)
  values ((now() at time zone 'Asia/Ho_Chi_Minh')::date, 1)
  on conflict (day) do update set model_calls = bot_usage.model_calls + 1
  returning model_calls into v_calls;

  if v_calls > p_limit then
    -- Chạm trần: ghi mốc + báo admin ĐÚNG MỘT LẦN mỗi ngày, đừng spam.
    update bot_usage set capped_at = now()
      where day = (now() at time zone 'Asia/Ho_Chi_Minh')::date
        and capped_at is null;
    if found then
      insert into reminders (kind, due_at, note)
      values ('escalation', now(),
        format('🚨 Bot chạm trần %s lượt gọi model trong ngày và đã TẠM DỪNG trả lời. '
               'Nếu không phải khách thật thì có người đang đốt tiền model bằng anon key.',
               p_limit));
    end if;
    return false;
  end if;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.bump_user_quota(p_uid text, p_gio_limit integer DEFAULT 30, p_ngay_limit integer DEFAULT 120)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_gio   timestamptz := date_trunc('hour', now());
  v_quen  boolean;
  v_he    integer;
  v_trong_gio integer;
  v_trong_ngay integer;
begin
  if p_uid is null or btrim(p_uid) = '' then
    return true;
  end if;

  select exists (
    select 1 from sellers s where s.zalo_user_id = p_uid
    union all
    select 1 from ctvs c   where c.zalo_user_id = p_uid
    union all
    select 1 from admins a where a.zalo_user_id = p_uid
  ) into v_quen;
  v_he := case when v_quen then 4 else 1 end;

  insert into chat_quota (zalo_user_id, gio, calls)
  values (p_uid, v_gio, 1)
  on conflict (zalo_user_id, gio) do update set calls = chat_quota.calls + 1
  returning calls into v_trong_gio;

  select coalesce(sum(calls), 0) into v_trong_ngay
  from chat_quota
  where zalo_user_id = p_uid and gio > now() - interval '24 hours';

  delete from chat_quota where zalo_user_id = p_uid and gio < now() - interval '48 hours';
  if random() < 0.01 then
    delete from chat_quota where gio < now() - interval '48 hours';
  end if;

  if v_trong_gio > p_gio_limit * v_he or v_trong_ngay > p_ngay_limit * v_he then
    return false;
  end if;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.can_cung_khu(p_buyer_id uuid, p_listing_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 3)
 RETURNS TABLE(id uuid, code text, ward text, district text, price_raw text, area_m2 numeric, tom_tat text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ward text; v_dist text; v_price bigint; v_deal text; v_area_kd text := '';
begin
  if p_listing_id is not null then
    select l.ward, l.district, l.price_vnd, l.deal::text into v_ward, v_dist, v_price, v_deal
      from listings l where l.id = p_listing_id;
  end if;
  if v_ward is null and v_dist is null and p_buyer_id is not null then
    select public.bo_dau(coalesce(b.preferences->>'area', '')),
           public.parse_vnd(b.preferences->>'budget'),
           case when coalesce(b.preferences->>'deal', 'ban') in ('thue', 'cho_thue') then 'cho_thue' else 'ban' end
      into v_area_kd, v_price, v_deal
      from buyers b where b.id = p_buyer_id;
  end if;
  v_deal := coalesce(v_deal, 'ban');
  if v_ward is null and v_dist is null and coalesce(v_area_kd, '') = '' then
    return;  -- không có mốc khu vực thì không đoán
  end if;

  return query
  select l.id, l.code, l.ward, l.district, l.price_raw, l.area_m2,
         '#' || l.code || ' · ' || coalesce(l.ward, '') || coalesce(', ' || l.district, '')
           || coalesce(' · ' || l.price_raw, '')
           || coalesce(' · ' || rtrim(to_char(l.area_m2, 'FM9999999990.99'), '.') || 'm2', '')
    from listings l
   where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc')
     and l.id is distinct from p_listing_id
     and l.deal::text = v_deal
     and (v_price is null or l.price_vnd is null
          or l.price_vnd between (v_price * 0.7)::bigint and (v_price * 1.15)::bigint)
     and (
       case when v_ward is not null or v_dist is not null then
              (v_ward is not null and public.bo_dau(l.ward) = public.bo_dau(v_ward))
              or (v_dist is not null and public.bo_dau(l.district) = public.bo_dau(v_dist))
            else public.khu_khop(v_area_kd, l.ward, l.district) end
     )
     and (p_buyer_id is null or not exists (
           select 1 from reminders r where r.buyer_id = p_buyer_id and r.listing_id = l.id
                                       and r.kind in ('match', 'sold', 'followup')))
     and (p_buyer_id is null or not exists (select 1 from interests i where i.buyer_id = p_buyer_id and i.listing_id = l.id))
     and (p_buyer_id is null or not exists (select 1 from viewings v where v.buyer_id = p_buyer_id and v.listing_id = l.id))
   order by (v_ward is not null and public.bo_dau(l.ward) = public.bo_dau(v_ward)) desc,
            l.last_interest_at desc nulls last, l.created_at desc
   limit greatest(1, least(coalesce(p_limit, 3), 5));
end $function$
;

CREATE OR REPLACE FUNCTION public.canh_bao_ngoai(p_title text, p_text text, p_priority integer DEFAULT 4, p_email boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
declare v_topic text; v_mail text; v_token text; v_body jsonb; v_hdr jsonb; v_id bigint;
begin
  select value into v_topic from app_config where key = 'ntfy_topic';
  if v_topic is null or btrim(v_topic) = '' then return null; end if;
  v_body := jsonb_build_object('topic', v_topic, 'title', left(p_title, 120),
                               'message', left(p_text, 900), 'priority', p_priority,
                               'tags', jsonb_build_array('house'));
  v_hdr := '{"Content-Type": "application/json"}'::jsonb;
  begin
    v_token := public.get_secret('NTFY_TOKEN');
  exception when others then v_token := null;
  end;
  if v_token is not null and btrim(v_token) <> '' then
    v_hdr := v_hdr || jsonb_build_object('Authorization', 'Bearer ' || btrim(v_token));
  end if;
  if p_email then
    select value into v_mail from app_config where key = 'admin_email';
    if v_mail is not null and btrim(v_mail) <> '' then
      v_body := v_body || jsonb_build_object('email', btrim(v_mail));
    end if;
  end if;
  select net.http_post(url := 'https://ntfy.sh', body := v_body, headers := v_hdr,
                       timeout_milliseconds := 15000) into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cat_truoc_phu_dinh(p_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  t   text := public.bo_dau(coalesce(p_text, ''));
  m   text;
  p   int;
  min_p int := null;
begin
  -- bo_dau dùng lower() + translate() 1-đổi-1 nên VỊ TRÍ ký tự không đổi:
  -- tìm trên bản đã bỏ dấu, cắt trên bản gốc.
  foreach m in array array['chu khong', 'chu ko', 'khong phai', 'ko phai',
                           'chang phai', 'hong phai', 'dau phai']
  loop
    p := position(m in t);
    if p > 0 and (min_p is null or p < min_p) then min_p := p; end if;
  end loop;

  if min_p is null then return p_text; end if;
  return btrim(substring(p_text from 1 for min_p - 1));
end $function$
;

CREATE OR REPLACE FUNCTION public.cau_hinh(p_key text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select value from public.app_config where key = p_key $function$
;

CREATE OR REPLACE FUNCTION public.che_sdt(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select regexp_replace(coalesce(p, ''), '(\+84|\m84|\m0)(\d{3})\d{5,7}\M', '0\2xxxxxx', 'g')
$function$
;

CREATE OR REPLACE FUNCTION public.chon_ctv(p_district text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select c.id from public.ctvs c
   where c.active and (c.zalo_user_id is not null or c.phone is not null)
     and public.ctv_dang_ganh(c.id) < coalesce(nullif(public.cau_hinh('ctv_tran_ca'), '')::int, 15)
   order by (case
               when p_district is not null and exists (
                 select 1 from unnest(c.khu_vuc) k
                  where public.bo_dau(p_district) like '%' || public.bo_dau(k) || '%'
                     or public.bo_dau(k) like '%' || public.bo_dau(p_district) || '%') then 0
               when cardinality(c.khu_vuc) = 0 then 1
               else 2 end),
            public.ctv_dang_ganh(c.id), c.last_assigned_at nulls first, c.created_at
   limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.chon_viec_don_chet()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with x as (
    update public.media_cleanup_queue set trang_thai='chet', updated_at=now()
     where trang_thai in ('cho','loi','dang_lam') and attempts >= 6
    returning 1)
  select count(*)::int from x;
$function$
;

CREATE OR REPLACE FUNCTION public.chu_nha_han_gio()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce(nullif(public.cau_hinh('chu_nha_han_gio'), '')::int, 12) $function$
;

CREATE OR REPLACE FUNCTION public.chuan_dia_ban(p_text text)
 RETURNS TABLE(phuong text, quan_cu text, kieu text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  k text := ' ' || btrim(regexp_replace(public.bo_dau(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g')) || ' ';
  v_quan text;
  v_so text;
  v_moi text[];
  v_phuong text;
  v_kieu text := 'khong';
begin
  if length(btrim(k)) < 2 then
    return query select null::text, null::text, 'khong'::text;
    return;
  end if;

  -- 1. Quận cũ: số ("quận 5", "q5", "q.5") hoặc tên có tiền tố trong bảng quan_cu.
  v_so := substring(k from ' (?:quan|q) ?([0-9]{1,2}) ');
  if v_so is not null then
    select qc.ten into v_quan from public.quan_cu qc where qc.ten = 'Quận ' || v_so::int;
  end if;
  if v_quan is null then
    select qc.ten into v_quan
      from public.quan_cu qc
     where public.bo_dau(qc.ten) ~ '^(quan|huyen|thanh pho|thi xa) [a-z]'
       and position(' ' || regexp_replace(public.bo_dau(qc.ten), '^(quan|huyen|thanh pho|thi xa) ', '') || ' ' in k) > 0
     order by length(qc.ten) desc
     limit 1;
  end if;

  -- 2a. Phường cũ đánh số + quận cũ → phường mới.
  v_so := substring(k from ' (?:phuong|p) ?([0-9]{1,2}) ');
  if v_so is not null and v_quan is not null then
    select array_agg(distinct w.ten_day_du) into v_moi
      from public.phuong_cu p join public.wards w on w.ten = p.phuong_moi
     where p.quan_cu = v_quan and p.ten = 'Phường ' || v_so::int;
    if coalesce(array_length(v_moi, 1), 0) = 1 then
      v_phuong := v_moi[1]; v_kieu := 'cu';
    elsif coalesce(array_length(v_moi, 1), 0) > 1 then
      v_kieu := 'mo_ho';
    end if;
  end if;

  -- 2b. Phường mới gọi tên (có tiền tố) — ưu tiên phường thuộc quận cũ vừa nhận ra, tên dài trước.
  if v_phuong is null and v_kieu <> 'mo_ho' then
    select w.ten_day_du into v_phuong
      from public.wards w
     where position(' ' || (case when public.bo_dau(w.ten_day_du) like 'xa %' then 'xa'
                                 when public.bo_dau(w.ten_day_du) like 'dac khu %' then 'dac khu'
                                 else 'phuong' end) || ' ' || public.bo_dau(w.ten) || ' ' in k) > 0
        or position(' p ' || public.bo_dau(w.ten) || ' ' in k) > 0
     order by (v_quan is not null and w.quan_cu = v_quan) desc, length(w.ten) desc
     limit 1;
    if v_phuong is not null then v_kieu := 'moi'; end if;
  end if;

  -- 2c. Phường cũ gọi tên (có tiền tố) → phường mới.
  if v_phuong is null and v_kieu <> 'mo_ho' then
    select array_agg(distinct w.ten_day_du) into v_moi
      from public.phuong_cu p join public.wards w on w.ten = p.phuong_moi
     where p.ten !~ '^(Phường|Xã|Thị trấn) [0-9]+$'
       and (v_quan is null or p.quan_cu = v_quan)
       and (position(' ' || public.bo_dau(p.ten) || ' ' in k) > 0
            or position(' p ' || regexp_replace(public.bo_dau(p.ten), '^(phuong|xa|thi tran) ', '') || ' ' in k) > 0);
    if coalesce(array_length(v_moi, 1), 0) = 1 then
      v_phuong := v_moi[1]; v_kieu := 'cu';
    elsif coalesce(array_length(v_moi, 1), 0) > 1 then
      v_kieu := 'mo_ho';
    end if;
  end if;

  -- 3. Có phường mà chưa có quận → quận cũ của phường đó.
  if v_phuong is not null and v_quan is null then
    select w.quan_cu into v_quan from public.wards w where w.ten_day_du = v_phuong;
  end if;
  if v_kieu = 'khong' and v_quan is not null then v_kieu := 'chi_quan'; end if;

  return query select v_phuong, v_quan, v_kieu;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.chuan_hoa_gia_raw(p_text text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  s   text := btrim(coalesce(p_text, ''));
  goc bigint := public.parse_vnd(p_text);
  t   text;
  m   text[];
  cum text;
begin
  if s = '' then return null; end if;

  t := public.bo_dau(s);
  m := regexp_match(t, '([0-9][0-9.,]*\s*(?:ty|ti|toi|trieu|tr|cu)\y(?:\s*[0-9]+(?![0-9])(?!\s*(?:thang|nam)\y))?(?:\s*ruoi)?)(?:\s*(?:/|mot|moi|1)\s*(thang|nam|m2)\y)?');
  if m is not null then
    cum := btrim(substring(s from position(m[1] in t) for length(m[1])));
    if m[2] is not null then
      cum := cum || '/' || case m[2] when 'thang' then 'tháng' when 'nam' then 'năm' else 'm2' end;
      -- "1 tỷ 1 năm" đọc được thành 1,1 tỷ: gắn kỳ hạn làm lệch số thì bỏ, đi đường cũ.
      if public.parse_vnd(cum) is distinct from goc then cum := ''; end if;
    end if;
    if cum <> '' and public.parse_vnd(cum) is not null then
      return cum;
    end if;
  end if;

  loop
    t := public.bo_dau(s);
    m := regexp_match(
      t,
      '([[:space:],]+(nha|nhe|nhen|nhak|nho|a|ah|oi|em|anh|chi|do|day|luon|thoi|ok|nghen|he))$'
    );
    exit when m is null;
    s := btrim(substring(s from 1 for length(s) - length(m[1])));
    exit when s = '';
  end loop;

  if s = '' then return btrim(p_text); end if;
  if public.parse_vnd(s) is distinct from goc then return btrim(p_text); end if;
  return s;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.chuan_hoa_lai_gia(p_batch integer DEFAULT 200)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  with lech as (
    select id from listings
     where price_raw is not null and btrim(price_raw) <> ''
       and price_vnd is distinct from public.parse_vnd(price_raw)
     order by id
     limit greatest(1, p_batch)
  )
  update listings l set price_raw = l.price_raw
    from lech where l.id = lech.id;
  get diagnostics n = row_count;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.chuan_hoa_phuong(p_text text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select w.ten_day_du from public.wards w where w.ten_day_du = btrim(p_text) limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.chuan_nmg(p_seller_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with t as (
    select count(*) filter (where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc'))                                   as dang_rao,
           count(*) filter (where l.status = 'da_chot' and coalesce(l.chu_noi_du_at, l.updated_at) >= now() - interval '6 months') as chot_6t,
           count(*) filter (where l.created_at >= now() - interval '6 months' or l.status in ('dang_ban', 'dang_quan_tam', 'da_coc', 'cho_thong_tin')) as tong_6t
      from listings l where l.seller_id = p_seller_id
  )
  select jsonb_build_object(
           'dang_rao', dang_rao, 'chot_6_thang', chot_6t, 'tong_6_thang', tong_6t,
           'ty_le_chot', case when tong_6t > 0 then round(100.0 * chot_6t / tong_6t, 1) else 0 end,
           'dat_chuan', dang_rao >= 10 and tong_6t > 0 and chot_6t::numeric / tong_6t >= 0.05)
    from t;
$function$
;

CREATE OR REPLACE FUNCTION public.co_moc(p_loai text, p_ten_re text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.moc_khop(p_loai, p_ten_re))
$function$
;

CREATE OR REPLACE FUNCTION public.con_duoc_rao(p_seller_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_hang text; v_so int; v_diem int;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  select count(*) into v_so from listings l
   where l.seller_id = p_seller_id and l.status in ('cho_thong_tin', 'dang_ban', 'dang_quan_tam');
  v_diem := (public.diem_nguoi_ban(p_seller_id)->>'diem')::int;
  v_hang := public.hang_theo_diem(v_diem);
  return jsonb_build_object('duoc', not (v_hang = 'dong' and v_so >= 5), 'hang', v_hang, 'so_dang_rao', v_so, 'tran', case when v_hang = 'dong' then 5 end, 'diem', v_diem);
end $function$
;

CREATE OR REPLACE FUNCTION public.cong_token(p_in bigint DEFAULT 0, p_out bigint DEFAULT 0, p_cache_write bigint DEFAULT 0, p_cache_read bigint DEFAULT 0, p_model text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_model text := coalesce(nullif(left(trim(p_model), 80), ''), 'khac');
begin
  insert into bot_usage (day, model_calls, in_tokens, out_tokens, cache_write_tokens, cache_read_tokens)
  values (v_day, 0, coalesce(p_in,0), coalesce(p_out,0), coalesce(p_cache_write,0), coalesce(p_cache_read,0))
  on conflict (day) do update set
    in_tokens          = bot_usage.in_tokens          + coalesce(p_in,0),
    out_tokens         = bot_usage.out_tokens         + coalesce(p_out,0),
    cache_write_tokens = bot_usage.cache_write_tokens + coalesce(p_cache_write,0),
    cache_read_tokens  = bot_usage.cache_read_tokens  + coalesce(p_cache_read,0);
  insert into bot_usage_model (day, model, calls, in_tokens, out_tokens, cache_write_tokens, cache_read_tokens)
  values (v_day, v_model, 1, coalesce(p_in,0), coalesce(p_out,0), coalesce(p_cache_write,0), coalesce(p_cache_read,0))
  on conflict (day, model) do update set
    calls              = bot_usage_model.calls + 1,
    in_tokens          = bot_usage_model.in_tokens          + coalesce(p_in,0),
    out_tokens         = bot_usage_model.out_tokens         + coalesce(p_out,0),
    cache_write_tokens = bot_usage_model.cache_write_tokens + coalesce(p_cache_write,0),
    cache_read_tokens  = bot_usage_model.cache_read_tokens  + coalesce(p_cache_read,0);
exception when others then
  return;
end $function$
;

CREATE OR REPLACE FUNCTION public.conversations_email_upset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text; v_ten text; v_trich text;
begin
  if new.needs_human and not coalesce(old.needs_human, false) and new.buyer_id is not null then
    select b.zalo_user_id, b.name into v_uid, v_ten from buyers b where b.id = new.buyer_id;
    select string_agg('- ' || left(m.body, 200), E'\n' order by m.created_at) into v_trich
      from (select body, created_at from messages
             where conversation_id = new.id and sender = 'buyer'
             order by created_at desc limit 3) m;
    perform public.email_admin('UPSET', v_uid,
      'Khách: ' || coalesce(v_ten, '(chưa biết tên)') || E'\nHội thoại: ' || new.id::text
      || E'\nTin gần nhất:\n' || coalesce(v_trich, '-'));
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.ctv_dang_ganh(p_ctv uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select (select count(*) from public.info_requests q where q.ctv_id = p_ctv and q.status = 'pending')::int
       + (select count(*) from public.conversations c where c.ctv_id = p_ctv and c.needs_human)::int;
$function$
;

CREATE OR REPLACE FUNCTION public.ctv_sla_phut()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select 120 $function$
;

CREATE OR REPLACE FUNCTION public.day_ro_ccrb_toi_nmg(p_listing_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l record; v_hang text; v_note text; v_n int := 0;
begin
  select li.id, li.code, li.seller_id, li.deal::text as deal, li.location_raw, li.ward, li.district, li.price_raw, li.area_m2, li.property_type,
         s.seller_type
    into l
    from listings li join sellers s on s.id = li.seller_id
   where li.id = p_listing_id;
  if l.id is null or l.seller_type <> 'ccrb' then return 0; end if;
  v_hang := public.hang_theo_diem((public.diem_nguoi_ban(l.seller_id)->>'diem')::int);
  if v_hang <> 'vang' then return 0; end if;
  v_note := '💬 Căn chính chủ mới lên kệ: ' ||
            coalesce(nullif(btrim(coalesce(l.location_raw, '')), '') || ', ', '') || coalesce(l.ward, '') || coalesce(', ' || l.district, '') ||
            coalesce(' · ' || l.price_raw, '') ||
            coalesce(' · ' || rtrim(to_char(l.area_m2, 'FM9999999990.99'), '.') || 'm2', '') ||
            case when l.deal = 'cho_thue' then ' (cho thuê)' else '' end ||
            '. Anh/chị có khách phù hợp nhắn em một tiếng, em nối với chủ nhà ạ.';
  insert into reminders (kind, listing_id, seller_id, due_at, note)
  select 'escalation', l.id, n.id, now(), v_note
    from (
      select s.id, public.hang_theo_diem((public.diem_nguoi_ban(s.id)->>'diem')::int) as hang,
             (public.diem_nguoi_ban(s.id)->>'diem')::int as diem,
             coalesce(h.hoat_dong, false) as hoat_dong
        from sellers s
        left join nmg_hoat_dong h on h.id = s.id
       where s.seller_type = 'nmg' and s.zalo_user_id is not null and s.id <> l.seller_id
    ) n
   where not exists (select 1 from reminders r where r.listing_id = l.id and r.seller_id = n.id and r.note like '💬 Căn chính chủ mới lên kệ%')
     and not exists (select 1 from reminders r where r.seller_id = n.id and r.note like '💬 Căn chính chủ mới lên kệ%'
                      and r.created_at > now() - interval '24 hours')
   order by (n.hang = 'vang') desc, n.hoat_dong desc, n.diem desc nulls last
   limit 20;
  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.deals_chan_xoa_da_chot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.closed_at is not null then
    raise exception 'FR-163: deal da chot (closed_at=%) khong duoc xoa. Muon xoa that: UPDATE closed_at ve NULL truoc.', old.closed_at
      using errcode = 'P0001';
  end if;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public.dia_danh_gan(p_lat double precision, p_lng double precision, p_ban_kinh_m double precision DEFAULT 1000, p_loai text[] DEFAULT ARRAY['duong'::text, 'so'::text], p_limit integer DEFAULT 20)
 RETURNS TABLE(loai text, ten text, phuong text, quan_cu text, lat double precision, lng double precision, cach_m double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with k as (select greatest(50, least(coalesce(p_ban_kinh_m, 1000), 10000)) as r),
  ung as (
    select d.loai, d.ten, nullif(d.phuong, '') as phuong, d.quan_cu, d.lat, d.lng
      from public.duong d, k
     where d.lat between p_lat - k.r / 111000.0 and p_lat + k.r / 111000.0
       and d.lng between p_lng - k.r / 109000.0 and p_lng + k.r / 109000.0
       and (p_loai is null or d.loai = any(p_loai))
    union all
    select 'du_an', pr.name, pr.ward, pr.district, pr.lat::double precision, pr.lng::double precision
      from public.projects pr, k
     where (p_loai is null or 'du_an' = any(p_loai)) and pr.lat is not null
       and pr.lat between p_lat - k.r / 111000.0 and p_lat + k.r / 111000.0
       and pr.lng between p_lng - k.r / 109000.0 and p_lng + k.r / 109000.0
  )
  select u.loai, u.ten, u.phuong, u.quan_cu, u.lat, u.lng, public.khoang_cach_m(p_lat, p_lng, u.lat, u.lng) as cach_m
    from ung u, k
   where public.khoang_cach_m(p_lat, p_lng, u.lat, u.lng) <= k.r
   order by cach_m
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$
;

CREATE OR REPLACE FUNCTION public.diem_nguoi_ban(p_seller_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type seller_type;
  v_tb numeric;
  v_n int;
  v_he_so numeric := 1;
  v_ph jsonb;
  v_ph_diem int;
  v_goc numeric;
  v_diem int;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  select seller_type into v_type from sellers where id = p_seller_id;
  if v_type is null then return null; end if;
  select avg((public.diem_tin(l)->>'diem')::numeric), count(*)
    into v_tb, v_n
    from listings l
   where l.seller_id = p_seller_id and l.status in ('dang_ban', 'dang_quan_tam', 'da_coc', 'cho_thong_tin');
  if coalesce(v_n, 0) = 0 then
    return jsonb_build_object('diem', 0, 'diem_tb', 0, 'so_tin', 0, 'he_so', 1, 'diem_phan_hoi', null, 'so_luot_phan_hoi', 0);
  end if;
  if v_type = 'nmg' then
    v_he_so := 1 + 0.06 * least(v_n, 10)
                 + 0.04 * greatest(least(v_n, 30) - 10, 0)
                 + 0.015 * greatest(v_n - 30, 0);
  end if;
  v_ph := public.diem_phan_hoi(p_seller_id);
  -- SRS-5.1zzx: dưới 5 lượt chủ động thì chưa đủ để kết luận "kịp thời" → chưa tính (null), dùng 100% hoàn chỉnh.
  v_ph_diem := case when coalesce((v_ph->>'so_luot')::int, 0) >= 5 then (v_ph->>'diem')::int end;
  v_goc := case when v_ph_diem is null then v_tb else 0.5 * v_tb + 0.5 * v_ph_diem end;
  v_diem := least(100, round(v_goc * v_he_so))::int;
  return jsonb_build_object('diem', v_diem, 'diem_tb', round(v_tb, 1), 'so_tin', v_n, 'he_so', round(v_he_so, 3),
                            'diem_phan_hoi', v_ph_diem, 'so_luot_phan_hoi', coalesce((v_ph->>'so_luot')::int, 0));
end $function$
;

CREATE OR REPLACE FUNCTION public.diem_phan_hoi(p_seller_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with tin as (
    select m.created_at, m.sender,
           lead(m.sender)     over w as sender_ke,
           lead(m.created_at) over w as luc_ke,
           max(m.created_at) filter (where m.sender = 'seller') over (w rows between unbounded preceding and 1 preceding) as luc_chu_truoc
      from messages m
      join conversations c on c.id = m.conversation_id
     where c.seller_id = p_seller_id
       and m.created_at >= now() - interval '90 days'
    window w as (partition by m.conversation_id order by m.created_at, m.seq)
  ),
  luot as (
    select created_at,
           case when sender_ke = 'seller' then extract(epoch from luc_ke - created_at) / 3600.0 end as gio_tra_loi
      from tin
     where sender = 'bot'
       -- bong bóng cuối của một lượt bot: tin kế không phải của bot, hoặc tin bot kế đã là lượt khác (> 5 phút)
       and (sender_ke is distinct from 'bot' or luc_ke > created_at + interval '5 minutes')
       -- lượt CHỦ ĐỘNG: chủ nhà đã im > 30 phút (lượt bot đáp ngay khi chủ đang chat không đo được gì)
       and (luc_chu_truoc is null or created_at > luc_chu_truoc + interval '30 minutes')
       -- lượt bot mới nhất mà chưa quá 7 ngày và chưa ai trả lời: chưa kết luận, không tính
       and not (sender_ke is null and created_at > now() - interval '7 days')
  ),
  diem as (
    select case
             when gio_tra_loi is null then 0
             when gio_tra_loi <= 1   then 100
             when gio_tra_loi <= 12  then 80
             when gio_tra_loi <= 24  then 60
             when gio_tra_loi <= 72  then 30
             else 0 end as d,
           gio_tra_loi
      from luot
  )
  select case when count(*) = 0 then jsonb_build_object('diem', null, 'so_luot', 0, 'tb_gio', null)
              else jsonb_build_object('diem', round(avg(d))::int, 'so_luot', count(*),
                                      'tb_gio', round(avg(gio_tra_loi)::numeric, 1)) end
    from diem;
$function$
;

CREATE OR REPLACE FUNCTION public.diem_tin(l listings)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f        jsonb;
  co_anh   boolean;
  co_hem   boolean;
  co_mt    boolean;
  co_kc    boolean;
  co_pn    boolean;
  d_vi_tri int := 0;
  d_dt     int := 0;
  d_kc     int := 0;
  d_pl     int := 0;
  d_gia    int := 0;
  d_tn     int := 0;
  d_cta    int := 0;
  d_anh    int := 0;
  so_anh   int := 0;
  thieu    text[] := '{}';
  mo_ta    text := public.bo_dau(coalesce(l.description, ''));
  la_dat   boolean := l.property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh');
  la_thue  boolean := l.deal = 'cho_thue' and not (l.property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh'));
  tn_biet  boolean;
begin
  if l.id is null then return null; end if;
  select coalesce(jsonb_object_agg(x.question, x.answer), '{}'::jsonb) into f
    from (select distinct on (question) question, answer
            from public.listing_facts where listing_id = l.id
           order by question, created_at desc) x;
  select (select count(*) from public.listing_facts x
           where x.listing_id = l.id and x.question = 'hinh_anh')
       + (select count(*) from public.listing_media m where m.listing_id = l.id)
    into so_anh;
  co_anh := so_anh > 0;

  co_hem := l.alley_width_m is not null or l.access_type is not null
            or (f ? 'do_rong_hem') or (f ? 'do_rong_duong') or (f ? 'duong_vao') or (f ? 'duong_container')
            or l.property_type in ('chung_cu', 'phong_tro');
  d_vi_tri := (case when coalesce(btrim(l.location_raw), '') <> '' then 7 else 0 end)
            + (case when coalesce(btrim(l.ward), '') <> '' then 4 else 0 end)
            + (case when co_hem then 4 else 0 end);
  if not co_hem then thieu := array_append(thieu, case when la_dat or l.property_type = 'kho_xuong' then 'đường vào rộng mấy mét' else 'hẻm rộng mấy mét, xe hơi vào được không' end); end if;

  co_mt := l.frontage_m is not null or (f ? 'mat_tien')
           or l.property_type in ('chung_cu', 'phong_tro', 'toa_nha', 'kho_xuong', 'dat_nong_nghiep')
           or coalesce(f->>'dien_tich_dat', f->>'dien_tich', '') ~ '\d\s*[xX×]\s*\d';
  if l.area_m2 is not null then
    d_dt := 12 + (case when co_mt then 8 else 0 end);
    if not co_mt then thieu := array_append(thieu, 'chiều ngang mặt tiền'); end if;
  else
    thieu := array_append(thieu, 'diện tích');
  end if;

  if la_dat then
    d_kc := case when (f ? 'tho_cu') or l.planning_status is not null or (f ? 'quy_hoach') or (f ? 'thoi_han_su_dung') or (f ? 'len_tho_cu') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, case l.property_type when 'dat_nong_nghiep' then 'quy hoạch, có lên thổ cư được không' when 'dat_kinh_doanh' then 'thời hạn sử dụng đất' else 'thổ cư bao nhiêu, quy hoạch ra sao' end); end if;
  elsif l.property_type = 'phong_tro' then
    d_kc := case when l.furnishing is not null or (f ? 'noi_that') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, 'nội thất có gì'); end if;
  elsif l.property_type = 'mat_bang' then
    d_kc := case when l.floors is not null or (f ? 'ket_cau') or (f ? 'nganh_hang_phu_hop') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, 'mấy tầng, hợp ngành gì'); end if;
  elsif l.property_type = 'toa_nha' then
    d_kc := (case when (f ? 'so_phong') or l.floors is not null or (f ? 'ket_cau') then 8 else 0 end)
          + (case when (f ? 'doanh_thu') or l.rent_income_vnd is not null or (f ? 'ty_le_lap_day') then 7 else 0 end);
    if not ((f ? 'so_phong') or l.floors is not null or (f ? 'ket_cau')) then thieu := array_append(thieu, 'bao nhiêu phòng, mấy tầng'); end if;
    if not ((f ? 'doanh_thu') or l.rent_income_vnd is not null or (f ? 'ty_le_lap_day')) then thieu := array_append(thieu, 'doanh thu mỗi tháng, tỷ lệ lấp đầy'); end if;
  elsif l.property_type = 'kho_xuong' then
    d_kc := (case when (f ? 'chieu_cao') or (f ? 'ket_cau') then 8 else 0 end)
          + (case when (f ? 'tai_trong_san') or (f ? 'tram_bien_ap') then 7 else 0 end);
    if not ((f ? 'chieu_cao') or (f ? 'ket_cau')) then thieu := array_append(thieu, 'chiều cao thông thủy'); end if;
    if not ((f ? 'tai_trong_san') or (f ? 'tram_bien_ap')) then thieu := array_append(thieu, 'tải trọng sàn, trạm biến áp'); end if;
  else
    co_kc := l.floors is not null or coalesce(btrim(l.floors_text), '') <> ''
             or (f ? 'ket_cau') or l.floor is not null or (f ? 'tang')
             or l.property_type = 'nha_cap4'; -- 20261013b: nhà cấp 4 là nhà trệt
    co_pn := l.bedrooms is not null or (f ? 'so_phong_ngu');
    d_kc := (case when co_kc then 8 else 0 end) + (case when co_pn then 7 else 0 end);
    if not co_kc then thieu := array_append(thieu, 'mấy tầng'); end if;
    if not co_pn then thieu := array_append(thieu, 'mấy phòng ngủ'); end if;
  end if;

  -- 20261013c: tin cho thuê → điều kiện thuê thay cho sổ; tin bán → chữ "pháp lý (loại sổ, hoàn công)".
  if la_thue then
    if (f ? 'tien_coc') or (f ? 'thoi_han_thue') or (f ? 'phap_ly') or l.legal_status is not null or l.property_type = 'phong_tro' then d_pl := 10;
    else thieu := array_append(thieu, 'điều kiện thuê (cọc, thời hạn)'); end if;
  elsif l.legal_status is not null or (f ? 'phap_ly') or l.property_type = 'phong_tro'
        -- 20261014e: căn hộ thuộc dự án mà kho dự án đã có pháp lý → pháp lý theo dự án, không thiếu, không hỏi.
        or (l.property_type = 'chung_cu' and public.du_an_co_phap_ly(l.project_id)) then d_pl := 10;
  -- 20261014d: căn hộ không có hoàn công, đất không có hoàn công — chữ thiếu theo loại. 20261014e: căn hộ hỏi "đã ra sổ hồng hay còn HĐMB",
  -- không phải "sổ riêng hay chung" (chữ này đi thẳng vào câu lệnh model và model hỏi theo nó).
  else thieu := array_append(thieu, case when l.property_type = 'chung_cu' then 'pháp lý (đã ra sổ hồng hay còn hợp đồng mua bán)'
                                         when la_dat then 'pháp lý (loại sổ)'
                                         else 'pháp lý (loại sổ, hoàn công)' end); end if;

  if l.price_vnd is not null then d_gia := 10; else thieu := array_append(thieu, 'giá'); end if;

  -- 20260924g: nhà ĐANG cho thuê / kinh doanh thì tiềm năng sử dụng đã rõ — không đòi chủ nói thêm.
  tn_biet := l.rent_income_vnd is not null or (f ? 'doanh_thu') or (f ? 'han_hop_dong_thue')
             or exists (select 1 from public.listing_facts x
                         where x.listing_id = l.id
                           and public.bo_dau(coalesce(x.answer, '')) ~ '(dang cho thue|dang thue|dang kinh doanh|de kinh doanh|hop dong thue|khach thue|cho [a-z0-9 ]{1,30} thue)')
             or mo_ta ~ '(dang cho thue|dang thue|dang kinh doanh|hop dong thue|khach thue)';
  if f ? 'tiem_nang' or f ? 'muc_dich' or f ? 'nganh_hang_phu_hop' or tn_biet then d_tn := 10;
  elsif coalesce(l.floors, 0) >= 3 or coalesce(l.bedrooms, 0) >= 3
     or l.access_type = 'mat_tien' or coalesce(l.alley_width_m, 0) >= 4
     or l.property_type in ('chung_cu', 'mat_bang', 'phong_tro', 'biet_thu', 'toa_nha', 'kho_xuong', 'dat_kinh_doanh') or (f ? 'san_vuon')
     or mo_ta ~ '(kinh doanh|cho thue|chdv|dau tu|van phong|o ngay|buon ban|mo shop|mo quan)'
  then d_tn := 5; thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)');
  else thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)'); end if;

  if l.code is not null then d_cta := 10; end if;

  d_anh := case when so_anh >= 3 then 10 when so_anh = 2 then 7 when so_anh = 1 then 4 else 0 end;
  if so_anh = 0 then thieu := array_append(thieu, case
      when la_dat then 'vài tấm ảnh (lô đất, sổ, đường vào — ảnh nào cũng được)'
      when l.property_type = 'chung_cu' then 'vài tấm ảnh (căn hộ, sổ, view — ảnh nào cũng được)'
      when l.property_type = 'phong_tro' then 'vài tấm ảnh (phòng, lối vào — ảnh nào cũng được)'
      when l.property_type = 'kho_xuong' then 'vài tấm ảnh (kho, sổ, đường vào — ảnh nào cũng được)'
      else 'vài tấm ảnh (nhà, sổ, hẻm — ảnh nào cũng được)' end);
  elsif so_anh < 3 then thieu := array_append(thieu, format('thêm ảnh cho đủ 3 tấm (đang có %s)', so_anh)); end if;

  return jsonb_build_object(
    'diem', d_vi_tri + d_dt + d_kc + d_pl + d_gia + d_tn + d_cta + d_anh,
    'chi_tiet', jsonb_build_object(
      'vi_tri_hem', d_vi_tri, 'dien_tich', d_dt, 'ket_cau', d_kc, 'phap_ly', d_pl,
      'gia', d_gia, 'tiem_nang', d_tn, 'goi_hanh_dong', d_cta, 'anh', d_anh),
    'thieu', to_jsonb(thieu),
    'co_anh', co_anh,
    'so_anh', so_anh);
end $function$
;

CREATE OR REPLACE FUNCTION public.diem_tin(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.diem_tin(l) from public.listings l where l.id = p_listing_id;
$function$
;

CREATE OR REPLACE FUNCTION public.doc_co_khong(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when public.bo_dau(btrim(coalesce(p, ''))) ~ '^(khong|ko|chua|chang|false)\M' then false
    when public.bo_dau(btrim(coalesce(p, ''))) ~ '^(co|true|da|roi)\M' then true
  end
$function$
;

CREATE OR REPLACE FUNCTION public.doc_danh_sach(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'title',      c.title,
    'created_at', c.created_at,
    'expires_at', c.expires_at,
    'listings',   coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'code', l.code, 'deal', l.deal, 'district', l.district, 'ward', l.ward,
        'street', l.street, 'location_raw', l.location_raw, 'area_m2', l.area_m2,
        'price_vnd', l.price_vnd, 'price_raw', l.price_raw, 'property_type', l.property_type,
        'bedrooms', l.bedrooms, 'bathrooms', l.bathrooms, 'floors', l.floors,
        'access_type', l.access_type, 'status', l.status, 'created_at', l.created_at
      ) order by x.ord)
      from unnest(c.listing_ids) with ordinality as x(id, ord)
      join public.listings l on l.id = x.id
      where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc')
    ), '[]'::jsonb)
  )
  from public.curated_lists c
  where c.token = p_token
    and length(p_token) between 16 and 64
    and c.expires_at > now()
$function$
;

CREATE OR REPLACE FUNCTION public.doc_gap(p_text text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_text is null or btrim(p_text) = '' then null
    when public.bo_dau(p_text) ~ '\m(khong|ko|k|chua|chang|dau co)\s*(can\s*)?((ban|cho thue|ra hang|ra|di)\s*)?(gap|voi)\M|\mduoc gia thi thoi\M|\mkhong voi\M|\mtu tu\M|\mban duoc gia\M' then false
    when public.bo_dau(p_text) ~ '\mgap\s*(doi|ba|lan|ruoi|[0-9])' then null
    when public.bo_dau(p_text) ~ '\mgap\M|\mcan tien\M|\m(ban|di|ra)\s*nhanh\M' or lower(p_text) ~ 'vội' then true
    else null end;
$function$
;

CREATE OR REPLACE FUNCTION public.doi_chieu_tien_cong_khai(p_cau text[])
 RETURNS TABLE(cau text, vnd bigint)
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if coalesce(array_length(p_cau, 1), 0) > 200 then
    raise exception 'Toi da 200 cau moi luot' using errcode = '22023';
  end if;
  return query select c, public.parse_vnd(c) from unnest(p_cau) as c;
end $function$
;

CREATE OR REPLACE FUNCTION public.don_du_lieu_thu()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tin int := 0; v_tin_nhan int := 0; v_nguoi int := 0; v_khach int := 0; v_pf int := 0;
begin
  -- 20260922f: hàm xoá dữ liệu, mở cho authenticated — chỉ admin, service_role hoặc cron (postgres) được gọi.
  if not (public.la_admin() or coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'don_du_lieu_thu: chi admin' using errcode = '42501';
  end if;
  -- 20260929a (FR-245): ID thử đọc từ MỘT chỗ (`la_id_thu`) — trước đây hai danh sách tiền tố viết tay ở đây lệch với
  -- ID bắn thử production (lx-, do-), nên dữ liệu thử đó không bao giờ được dọn.
  create temp table if not exists _nguoi_thu on commit drop as
    select id from sellers
     where public.la_id_thu(zalo_user_id);
  create temp table if not exists _khach_thu on commit drop as
    select id from buyers
     where public.la_id_thu(zalo_user_id);
  create temp table if not exists _tin_thu on commit drop as
    select id from listings where seller_id in (select id from _nguoi_thu);
  create temp table if not exists _conv_thu on commit drop as
    select id from conversations
     where seller_id in (select id from _nguoi_thu) or buyer_id in (select id from _khach_thu);

  delete from messages       where conversation_id in (select id from _conv_thu);
  get diagnostics v_tin_nhan = row_count;
  delete from project_facts  where listing_id in (select id from _tin_thu);
  get diagnostics v_pf = row_count;
  delete from listing_facts  where listing_id in (select id from _tin_thu);
  delete from info_requests  where listing_id in (select id from _tin_thu);
  delete from listing_media  where listing_id in (select id from _tin_thu);
  delete from listing_views  where listing_id in (select id from _tin_thu);
  delete from property_events where listing_id in (select id from _tin_thu);
  delete from interests      where listing_id in (select id from _tin_thu)
                                or buyer_id in (select id from _khach_thu);
  delete from viewings       where listing_id in (select id from _tin_thu)
                                or buyer_id in (select id from _khach_thu);
  delete from reminders      where seller_id in (select id from _nguoi_thu)
                                or buyer_id in (select id from _khach_thu)
                                or listing_id in (select id from _tin_thu);
  update sellers set active_listing_id = null where id in (select id from _nguoi_thu);
  delete from listings       where id in (select id from _tin_thu);
  get diagnostics v_tin = row_count;
  delete from conversations  where id in (select id from _conv_thu);
  delete from chat_quota     where public.la_id_thu(zalo_user_id);
  delete from buyers         where id in (select id from _khach_thu);
  get diagnostics v_khach = row_count;
  delete from sellers        where id in (select id from _nguoi_thu);
  get diagnostics v_nguoi = row_count;

  --  chỉ có (who, at, last_id) — dấu thời gian ở đó, còn con số thì
  -- vào  để sáng hôm sau còn đọc được đêm qua dọn những gì.
  insert into bot_health (who, at) values ('don_thu', now())
    on conflict (who) do update set at = excluded.at;
  insert into app_config (key, value) values ('don_thu_lan_cuoi',
          format('%s: %s tin · %s tin nhắn · %s người bán · %s khách · %s fact dự án',
                 to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
                 v_tin, v_tin_nhan, v_nguoi, v_khach, v_pf))
    on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('tin', v_tin, 'tin_nhan', v_tin_nhan,
                            'nguoi_ban', v_nguoi, 'khach', v_khach, 'fact_du_an', v_pf);
end $function$
;

CREATE OR REPLACE FUNCTION public.du_an_can_geocode(p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, name text, location_raw text, ward text, district text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.id, p.name, p.location_raw, p.ward, p.district
  from projects p
  where p.lat is null
    and (p.geocode_at is null or p.geocode_at < now() - interval '7 days')
  order by exists (select 1 from listings l where l.project_id = p.id) desc,
           p.is_partner desc nulls last,
           p.geocode_at nulls first
  limit greatest(1, least(coalesce(p_limit, 30), 200))
$function$
;

CREATE OR REPLACE FUNCTION public.du_an_co_phap_ly(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_project_id is not null and exists (
    select 1 from projects p
     where p.id = p_project_id
       and (coalesce(btrim(p.legal_status), '') <> ''
            or coalesce(btrim(p.specs ->> 'phap_ly'), '') <> ''
            or coalesce(btrim(p.specs ->> 'so_huu'), '') <> ''))
$function$
;

CREATE OR REPLACE FUNCTION public.duong_gan_duong(p_ten text, p_phuong text DEFAULT NULL::text, p_ban_kinh_m double precision DEFAULT 1500, p_limit integer DEFAULT 20)
 RETURNS TABLE(goc_phuong text, ten text, loai text, phuong text, quan_cu text, cach_m double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with goc as (
    select d.phuong, d.lat, d.lng from public.duong d
     where d.ten_khong_dau = public.bo_dau(regexp_replace(btrim(coalesce(p_ten, '')), '\s+', ' ', 'g'))
       and d.lat is not null and (p_phuong is null or d.phuong = p_phuong)
     limit 20
  )
  select distinct on (g.phuong, n.ten, n.phuong) g.phuong, n.ten, n.loai, n.phuong, n.quan_cu, n.cach_m
    from goc g
    cross join lateral public.dia_danh_gan(g.lat, g.lng, p_ban_kinh_m, array['duong', 'so'], 60) n
   where public.bo_dau(n.ten) <> public.bo_dau(coalesce(p_ten, ''))
   order by g.phuong, n.ten, n.phuong, n.cach_m
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$
;

CREATE OR REPLACE FUNCTION public.duyet_fact_du_an(p_id bigint, p_ok boolean DEFAULT true, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f project_facts%rowtype; v_pid uuid;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;
  select * into f from project_facts where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'vi', 'khong thay dong'); end if;
  if f.trang_thai <> 'cho_duyet' then
    return jsonb_build_object('ok', false, 'vi', 'dong nay da xu ly roi');
  end if;

  if not p_ok then
    update project_facts set trang_thai = 'bo', duyet_at = now(),
           duyet_boi = coalesce((select auth.jwt() ->> 'email'), 'service_role')
     where id = p_id;
    return jsonb_build_object('ok', true, 'trang_thai', 'bo');
  end if;

  v_pid := coalesce(f.project_id, p_project_id);
  if v_pid is null then
    return jsonb_build_object('ok', false, 'vi',
      format('dong nay chua gan du an ("%s") — them du an vao kho roi gat lai', coalesce(f.ten_du_an, '?')));
  end if;

  if f.khoa in ('tien_ich_gan', 'tien_ich', 'ha_tang', 'khu_compound') then
    update projects
       set amenities = (
             select jsonb_agg(distinct x)
             from jsonb_array_elements_text(coalesce(amenities, '[]'::jsonb) || to_jsonb(array[f.gia_tri])) x
           ), updated_at = now()
     where id = v_pid;
  else
    update projects
       set specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(f.khoa, f.gia_tri),
           updated_at = now()
     where id = v_pid;
  end if;

  update project_facts set trang_thai = 'da_duyet', project_id = v_pid, duyet_at = now(),
         duyet_boi = coalesce((select auth.jwt() ->> 'email'), 'service_role')
   where id = p_id;
  return jsonb_build_object('ok', true, 'trang_thai', 'da_duyet', 'khoa', f.khoa);
end $function$
;

CREATE OR REPLACE FUNCTION public.email_admin(p_loai text, p_zalo_uid text, p_body text, p_listing_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_mail text; v_bds text; v_id bigint;
begin
  select value into v_mail from app_config where key = 'admin_email';
  if p_listing_id is not null then
    select '#' || code || ' · ' || coalesce(location_raw, '') || ' ' || coalesce(ward, '')
           || coalesce(', ' || district, '') || coalesce(' · ' || price_raw, '')
           || coalesce(' · ' || rtrim(to_char(area_m2, 'FM9999999990.99'), '.') || 'm2', '')
           || coalesce(E'\n' || left(description, 300), '')
      into v_bds from listings where id = p_listing_id;
  end if;
  v_id := public.canh_bao_ngoai(
    '[' || p_loai || '] ' || coalesce(p_zalo_uid, '?'),
    coalesce(p_body, '') || coalesce(E'\nBĐS: ' || v_bds, '')
      || E'\nThời điểm: ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'),
    case when p_loai in ('UPSET', 'VOICE') then 5 else 4 end,
    (v_mail is not null and btrim(v_mail) <> ''));
  return v_id;
exception when others then
  perform public.log_loi('email_admin', left(p_loai || ': ' || sqlerrm, 400), null::integer);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.ensure_buyer_conversation(p_zalo_user_id text, p_channel text DEFAULT 'zalo_oa'::text)
 RETURNS TABLE(b_id uuid, c_id uuid, b_name text, b_prefs jsonb, c_ctv_id uuid, c_human_touch_at timestamp with time zone, c_human_hold boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_buyer buyers%rowtype; v_conv conversations%rowtype; v_seller uuid;
begin
  -- 20260923b: khoá theo NGƯỜI (Zalo ID), chung với ensure_seller_conversation — một người một hội thoại.
  perform pg_advisory_xact_lock(hashtext('nguoi:' || p_zalo_user_id));
  select * into v_buyer from buyers where zalo_user_id = p_zalo_user_id;
  if not found then
    insert into buyers (zalo_user_id) values (p_zalo_user_id) returning * into v_buyer;
  end if;
  update buyers set last_contact_at = now() where id = v_buyer.id;
  select s.id into v_seller from sellers s where s.zalo_user_id = p_zalo_user_id;
  select * into v_conv from conversations
    where conversations.buyer_id = v_buyer.id
    order by started_at desc limit 1;
  if v_conv.id is null and v_seller is not null then
    update conversations set buyer_id = v_buyer.id
     where id = (select c.id from conversations c where c.seller_id = v_seller order by c.started_at desc limit 1)
    returning * into v_conv;
  end if;
  if v_conv.id is null then
    insert into conversations (buyer_id, seller_id, channel) values (v_buyer.id, v_seller, p_channel)
      returning * into v_conv;
  end if;
  return query select v_buyer.id, v_conv.id, v_buyer.name, v_buyer.preferences,
                      v_conv.ctv_id, v_conv.human_touch_at, v_conv.human_hold;
end $function$
;

CREATE OR REPLACE FUNCTION public.ensure_seller_conversation(p_seller_id uuid, p_channel text DEFAULT 'zalo_oa'::text)
 RETURNS TABLE(c_id uuid, c_human_touch_at timestamp with time zone, c_ctv_id uuid, c_human_hold boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_conv conversations%rowtype; v_zalo text; v_buyer uuid;
begin
  -- 20260923b: khoá theo NGƯỜI (Zalo ID), chung với ensure_buyer_conversation — một người một hội thoại.
  select s.zalo_user_id into v_zalo from sellers s where s.id = p_seller_id;
  perform pg_advisory_xact_lock(hashtext('nguoi:' || coalesce(v_zalo, p_seller_id::text)));
  select * into v_conv from conversations
    where conversations.seller_id = p_seller_id
    order by started_at desc limit 1;
  if v_conv.id is null and v_zalo is not null then
    select b.id into v_buyer from buyers b where b.zalo_user_id = v_zalo;
    if v_buyer is not null then
      update conversations set seller_id = p_seller_id
       where id = (select c.id from conversations c where c.buyer_id = v_buyer order by c.started_at desc limit 1)
      returning * into v_conv;
    end if;
  end if;
  if v_conv.id is null then
    insert into conversations (seller_id, buyer_id, channel) values (p_seller_id, v_buyer, p_channel)
      returning * into v_conv;
  end if;
  return query select v_conv.id, v_conv.human_touch_at, v_conv.ctv_id, v_conv.human_hold;
end $function$
;

CREATE OR REPLACE FUNCTION public.geocode_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not exists (select 1 from public.tin_can_geocode(1))
     and not exists (select 1 from public.du_an_can_geocode(1)) then
    return;
  end if;
  perform net.http_post(
    url := public.cau_hinh('functions_base_url') || '/geocode-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_f4wNO8jQcCDWn1QmNZQ7-g_BXDtYM3Y',
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
end $function$
;

CREATE OR REPLACE FUNCTION public.get_secret(secret_name text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name;
$function$
;

CREATE OR REPLACE FUNCTION public.ghi_boc_tach(p_listing_id uuid, p jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.listings
     set boc_tach = coalesce(boc_tach, '{}'::jsonb)
                 || jsonb_strip_nulls(coalesce(p, '{}'::jsonb))
                 || jsonb_build_object('_cap_nhat', now())
   where id = p_listing_id;
$function$
;

CREATE OR REPLACE FUNCTION public.ghi_danh_gia(p_buyer_id uuid, p_listing_id uuid, p_stars integer, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_seller uuid; v_viewing uuid;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'sao phải 1..5';
  end if;
  insert into ratings_log (buyer_id, listing_id, stars, note)
  values (p_buyer_id, p_listing_id, p_stars, left(p_note, 300))
  on conflict (buyer_id, listing_id) do nothing;
  if not found then return; end if;   -- đã chấm rồi: không cộng đúp

  select id into v_viewing from viewings
   where buyer_id = p_buyer_id and listing_id = p_listing_id
   order by coalesce(slot, created_at) desc limit 1;
  if v_viewing is not null then
    update viewings set buyer_rating = p_stars,
           note = case when p_note is null then note
                       else coalesce(note || ' · ', '') || left(p_note, 300) end
     where id = v_viewing;
  end if;

  select seller_id into v_seller from listings where id = p_listing_id;
  if v_seller is not null then
    update sellers set rating_sum = coalesce(rating_sum, 0) + p_stars,
                       rating_count = coalesce(rating_count, 0) + 1
     where id = v_seller;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.ghi_fact_listing(p_listing_id uuid, p_question text, p_answer text, p_source text DEFAULT 'seller_chat'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_q text := btrim(p_question);
begin
  if p_listing_id is null or coalesce(btrim(p_answer), '') = '' then
    return null;
  end if;
  -- 20260928f (FR-241, bắn thật lx-77): hỏi địa chỉ mà khách chỉ đáp "xã Vĩnh Lộc A" — đó là PHƯỜNG/XÃ, không phải
  -- đường; ghi vào vi_tri thì tên xã thành tên đường và câu địa chỉ không bao giờ được hỏi lại.
  if v_q = 'vi_tri'
     and public.bo_dau(btrim(p_answer)) ~* '^(xa|phuong|thi tran)\s+\S'
     and public.bo_dau(btrim(p_answer)) !~* '(duong|\mhem\M|\mngo\M|\mkiet\M|\mso\s*[0-9]|[0-9]+\s*/|,\s*[0-9])' then
    v_q := 'phuong';
  end if;
  insert into listing_facts (listing_id, question, answer, source)
  values (p_listing_id, v_q, btrim(p_answer),
          coalesce(nullif(btrim(p_source), ''), 'seller_chat'))
  returning id into v_id;
  if v_q not in ('bo_sung', 'kien_thuc') then
    update info_requests
       set status = 'answered', answer = btrim(p_answer), answered_at = now()
     where listing_id = p_listing_id
       and buyer_id is null
       and question = v_q
       and status = 'pending';
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.ghi_su_kien_bds(p_listing_id uuid, p_type text, p_buyer_id uuid DEFAULT NULL::uuid, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_listing_id is null then return; end if;
  insert into property_events (listing_id, event_type, buyer_id, meta)
  values (p_listing_id, p_type, p_buyer_id, p_meta);
exception when others then
  perform public.log_loi('ghi_su_kien_bds', left(p_type || ': ' || sqlerrm, 400), null::integer);
end $function$
;

CREATE OR REPLACE FUNCTION public.giao_lo_cua(p_duong1 text, p_duong2 text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(duong_a text, duong_b text, phuong text, quan_cu text, lat double precision, lng double precision, cach_m double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with k as (
    select regexp_replace(public.bo_dau(btrim(regexp_replace(coalesce(p_duong1, ''), '\s+', ' ', 'g'))), '^duong ', '') as k1,
           regexp_replace(public.bo_dau(btrim(regexp_replace(coalesce(p_duong2, ''), '\s+', ' ', 'g'))), '^duong ', '') as k2
  )
  select g.duong_a, g.duong_b, g.phuong, g.quan_cu, g.lat, g.lng,
         case when p_lat is not null and p_lng is not null then public.khoang_cach_m(p_lat, p_lng, g.lat, g.lng) end
    from public.giao_lo g, k
   where length(k.k1) >= 2 and length(k.k2) >= 2
     and ((g.a_khong_dau = k.k1 and g.b_khong_dau = k.k2) or (g.a_khong_dau = k.k2 and g.b_khong_dau = k.k1))
   order by 7 nulls last, g.phuong
   limit 5;
$function$
;

CREATE OR REPLACE FUNCTION public.giao_lo_gan(p_lat double precision, p_lng double precision, p_ban_kinh_m double precision DEFAULT 300, p_limit integer DEFAULT 5, p_bo_hem boolean DEFAULT true)
 RETURNS TABLE(duong_a text, duong_b text, loai_a text, loai_b text, phuong text, cach_m double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with r as (select greatest(20, least(coalesce(p_ban_kinh_m, 300), 3000)) as m)
  select g.duong_a, g.duong_b, g.loai_a, g.loai_b, g.phuong, public.khoang_cach_m(p_lat, p_lng, g.lat, g.lng) as cach_m
    from public.giao_lo g, r
   where p_lat is not null and p_lng is not null
     and g.lat between p_lat - r.m / 111000.0 and p_lat + r.m / 111000.0
     and g.lng between p_lng - r.m / 109000.0 and p_lng + r.m / 109000.0
     and (not coalesce(p_bo_hem, true) or (g.loai_a <> 'hem' and g.loai_b <> 'hem'))
     and public.khoang_cach_m(p_lat, p_lng, g.lat, g.lng) <= r.m
   order by cach_m
   limit greatest(1, least(coalesce(p_limit, 5), 20));
$function$
;

CREATE OR REPLACE FUNCTION public.giu_khach(p_conversation_id uuid, p_giu boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.conversations
     set human_hold = p_giu,
         needs_human = case when p_giu then false else needs_human end,
         human_touch_at = case when p_giu then now() else human_touch_at end
   where id = p_conversation_id
     and (coalesce(auth.role(), '') = 'service_role' or public.la_admin());
$function$
;

CREATE OR REPLACE FUNCTION public.guess_property_type(p_text text)
 RETURNS property_type
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with t as (select public.bo_dau(coalesce(p_text, '')) as s)
  select (case
    when (select btrim(s) from t) = '' then null
    when (select s from t) ~ '(kho bai|kho xuong|nha xuong|nha kho|\mkho\M|\mxuong\M)'                     then 'kho_xuong'
    when (select s from t) ~ '(dat nong nghiep|dat vuon|dat lua|dat trong cay|dat ruong|\mcln\M|dat ray|dat trang trai)' then 'dat_nong_nghiep'
    when (select s from t) ~ '(dat skc|dat tmd|thuong mai dich vu|san xuat kinh doanh|dat kinh doanh|dat thuong mai)' then 'dat_kinh_doanh'
    when (select s from t) ~ '(can ho dich vu|\mchdv\M|khach san|toa nha|\mbuilding\M|nha nghi|day phong cho thue|toa nha van phong)' then 'toa_nha'
    when (select s from t) ~ '(phong tro|nha tro|day tro|khu tro|phong cho thue)'   then 'phong_tro'
    when (select s from t) ~ '(biet thu|villa|\mbt\M)'                              then 'biet_thu'
    when (select s from t) ~ '(mat bang|\mmb\M)'                                    then 'mat_bang'
    when (select s from t) ~ '(chung cu|can ho|canho|penthouse|duplex|officetel|\mcc\M|\mch\M|\mcan\M ?[0-9]+ ?(pn|phong ngu))' then 'chung_cu'
    when (select s from t) ~ '(cap 4|cap bon|c4)'                                   then 'nha_cap4'
    when (select s from t) ~ '(dat nen|lo dat|nen dat|ban dat|dat tho cu|dat trong|\mdn\M)'
         and (select s from t) !~ '(tret|lau|tang|phong ngu|\mpn\M|\mwc\M)'         then 'dat'
    when (select s from t) ~ '(\mnha\M|nha pho|\mnp\M|tret|\mlau\M|tang|\mhem\M|mat tien|\mhxh\M|\mmt\M)' then 'nha_pho'
    else null
  end)::property_type
$function$
;

CREATE OR REPLACE FUNCTION public.guess_property_type_answer(p_text text)
 RETURNS property_type
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with t as (select public.bo_dau(coalesce(p_text, '')) as s)
  select (case
    when (select btrim(s) from t) = '' then null
    when (select btrim(s) from t) ~ '^(chung_cu|nha_pho|nha_cap4|dat|biet_thu|phong_tro|mat_bang|toa_nha|dat_nong_nghiep|dat_kinh_doanh|kho_xuong)$'
                                                                                          then (select btrim(s) from t)
    when (select s from t) ~ '(\mkho\M|\mxuong\M|nha kho|kho bai)'                        then 'kho_xuong'
    when (select s from t) ~ '(nong nghiep|dat vuon|dat lua|dat ray|\mcln\M)'             then 'dat_nong_nghiep'
    when (select s from t) ~ '(\mskc\M|\mtmd\M|dat thuong mai|dat san xuat|dat kinh doanh)' then 'dat_kinh_doanh'
    when (select s from t) ~ '(\mchdv\M|dich vu|khach san|toa nha|building|nha nghi)'      then 'toa_nha'
    when (select s from t) ~ '(\mtro\M|\mphong tro\M|\mnha tro\M|\mday tro\M)' then 'phong_tro'
    when (select s from t) ~ '(biet thu|villa|\mbt\M)'                                    then 'biet_thu'
    when (select s from t) ~ '(mat bang|\mmb\M)'                                          then 'mat_bang'
    when (select s from t) ~ '(chung cu|can ho|canho|penthouse|duplex|officetel|\mcc\M|\mch\M)' then 'chung_cu'
    when (select s from t) ~ '(cap 4|cap bon|\mc4\M)'                                     then 'nha_cap4'
    when (select s from t) ~ '(\mdat\M|dat nen|lo dat|nen dat)'                         then 'dat'
    when (select s from t) ~ '(nha pho|\mnha\M|\mnp\M|\mpho\M)'                           then 'nha_pho'
    else null
  end)::property_type
$function$
;

CREATE OR REPLACE FUNCTION public.ham_md5_cong_khai()
 RETURNS TABLE(ten text, md5 text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select p.proname::text, md5(replace(p.prosrc, E'\r', ''))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   order by 1, 2;
$function$
;

CREATE OR REPLACE FUNCTION public.hang_cua_nguoi_ban(p_ids uuid[])
 RETURNS TABLE(seller_id uuid, hang text, diem integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, public.hang_theo_diem((public.diem_nguoi_ban(s.id)->>'diem')::int), (public.diem_nguoi_ban(s.id)->>'diem')::int
    from sellers s where s.id = any(p_ids);
$function$
;

CREATE OR REPLACE FUNCTION public.hang_theo_diem(p_diem integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when coalesce(p_diem, 0) >= 80 then 'vang' when coalesce(p_diem, 0) >= 50 then 'bac' else 'dong' end;
$function$
;

CREATE OR REPLACE FUNCTION public.huy_nhac_khi_da_tra_loi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nhan text;
begin
  if new.status not in ('answered', 'expired') or old.status is not distinct from new.status then
    return null;
  end if;
  v_nhan := public.nhan_fact(coalesce(new.question, ''));
  -- Nhãn rơi về mặc định 'thông tin' thì KHÔNG lọc theo nhãn nữa: chuỗi đó có
  -- trong gần như mọi ghi chú, huỷ theo nó là huỷ nhầm tin của câu khác.
  if v_nhan = 'thông tin' then
    return null;
  end if;
  update reminders set status = 'cancelled'
   where kind = 'escalation' and status = 'pending'
     and listing_id = new.listing_id
     -- So CHUỖI THẬT, không phải khuôn LIKE (soát 10/09 mục E4).
     and position(v_nhan in note) > 0;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.info_request_bao_lai_khach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_code text; v_vw uuid;
begin
  if new.status = 'answered' and old.status is distinct from 'answered'
     and new.source = 'buyer_ask' and new.buyer_id is not null then
    select code into v_code from listings where id = new.listing_id;
    update reminders set status = 'cancelled'
     where buyer_id = new.buyer_id and listing_id = new.listing_id
       and kind = 'followup' and status = 'pending';
    if coalesce(new.question, '') = 'xac_nhan_lich' then                       -- 20260904f FR-52
      select id into v_vw from viewings
       where buyer_id = new.buyer_id and listing_id = new.listing_id
         and status in ('proposed', 'pending')
       order by created_at desc limit 1;
      if v_vw is not null then
        update viewings set status = 'confirmed' where id = v_vw;
      end if;
      insert into reminders (kind, buyer_id, listing_id, viewing_id, due_at, note)
      values ('followup', new.buyer_id, new.listing_id, v_vw, now(),
        'lịch xem #' || coalesce(v_code, '?') || ' đã được xác nhận: ' || left(coalesce(new.answer, ''), 200));
    else
      insert into reminders (kind, buyer_id, listing_id, due_at, note)
      values ('followup', new.buyer_id, new.listing_id, now(),
        'chủ nhà vừa trả lời câu khách hỏi về #' || coalesce(v_code, '?') || ' — "'
        || coalesce(new.question, '') || '": ' || left(coalesce(new.answer, ''), 300));
    end if;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.info_request_set_active_listing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.info_request_sla_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0; v_ctv ctvs%rowtype;
begin
  for r in
    select q.id, q.question, q.listing_id, l.code, coalesce(nullif(btrim(l.location_raw), ''), l.ward, '?') as dia_chi
    from info_requests q join listings l on l.id = q.listing_id
    where q.status = 'pending' and q.source = 'buyer_ask' and q.assignee = 'seller'
      and q.sla_due_at < now() and q.chu_nha_qua_han_at is null
    limit 50
  loop
    select * into v_ctv from ctvs
    where active and (zalo_user_id is not null or phone is not null)
    order by last_assigned_at nulls first, created_at limit 1;
    if found then
      update info_requests
         set assignee = 'ctv', ctv_id = v_ctv.id, chu_nha_qua_han_at = now(),
             sla_due_at = now() + make_interval(mins => public.ctv_sla_phut())
       where id = r.id;
      update ctvs set last_assigned_at = now() where id = v_ctv.id;
      insert into reminders (kind, listing_id, ctv_id, due_at, note)
      values ('escalation', r.listing_id, v_ctv.id, now(),
        'khách hỏi #' || coalesce(r.code, '?') || ' (' || r.dia_chi || '): "' || coalesce(r.question, '')
        || '". Chủ nhà ' || public.chu_nha_han_gio() || ' giờ chưa trả lời. Anh/chị hỏi chủ rồi nhắn lại em "#'
        || coalesce(r.code, '?') || ': câu trả lời" trong ' || public.ctv_sla_phut() || ' phút nha.');
    else
      update info_requests set assignee = 'admin', chu_nha_qua_han_at = now(), sla_due_at = null where id = r.id;
      insert into reminders (kind, listing_id, due_at, note)
      values ('escalation', r.listing_id, now(),
        '❓ Khách hỏi căn #' || coalesce(r.code, '?') || ': "' || coalesce(r.question, '')
        || '" — chủ nhà ' || public.chu_nha_han_gio() || ' giờ chưa trả lời, không có CTV. Admin hỏi chủ rồi nhắn bot "#'
        || coalesce(r.code, '?') || ': câu trả lời".');
    end if;
    n := n + 1;
  end loop;

  for r in
    select q.id, q.question, q.buyer_id, q.listing_id, l.code, coalesce(c.name, '?') as ctv_name,
           b.zalo_user_id as buyer_uid, b.name as buyer_name
    from info_requests q
    join listings l on l.id = q.listing_id
    left join ctvs c on c.id = q.ctv_id
    left join buyers b on b.id = q.buyer_id
    where q.status = 'pending' and q.source = 'buyer_ask' and q.assignee = 'ctv'
      and q.sla_due_at < now() and q.sla_missed_at is null
    limit 50
  loop
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', r.listing_id, now(),
      '⏰ CTV ' || r.ctv_name || ' chưa trả lời câu khách hỏi #' || coalesce(r.code, '?')
      || ' ("' || coalesce(r.question, '') || '") sau ' || public.ctv_sla_phut()
      || ' phút. Admin đỡ khách giúp: hỏi chủ rồi nhắn bot "#' || coalesce(r.code, '?') || ': câu trả lời".');
    update info_requests set sla_missed_at = now() where id = r.id;
    if coalesce(r.question, '') <> 'xac_nhan_lich' then
      perform public.email_admin('QUESTION', r.buyer_uid,
        'Khách: ' || coalesce(r.buyer_name, '(chưa biết tên)') || E'\nCâu hỏi: "' || coalesce(r.question, '')
        || E'"\nCTV: ' || r.ctv_name || ' quá ' || public.ctv_sla_phut() || ' phút chưa trả lời', r.listing_id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.info_request_timeout_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_thay text; n_nhac int := 0; n_het int := 0; n_khach int := 0;
begin
  update info_requests set reminded_at = now()
   where status = 'pending' and source = 'seller_flow' and reminded_at is null
     and created_at < now() - interval '24 hours';
  get diagnostics n_nhac = row_count;

  update info_requests set status = 'expired'
   where status = 'pending' and source = 'seller_flow'
     and created_at < now() - interval '48 hours';
  get diagnostics n_het = row_count;

  for r in
    select q.id, q.buyer_id, q.listing_id, l.code
      from info_requests q left join listings l on l.id = q.listing_id
     where q.status = 'pending' and q.source = 'buyer_ask'
       and q.created_at < now() - interval '48 hours'
     limit 50
  loop
    update info_requests set status = 'expired' where id = r.id;
    if r.buyer_id is not null then
      select string_agg(c.tom_tat, '; ') into v_thay
        from public.can_cung_khu(r.buyer_id, r.listing_id, 2) c;
      update reminders set status = 'cancelled'
       where buyer_id = r.buyer_id and listing_id = r.listing_id
         and kind = 'followup' and status = 'pending';
      insert into reminders (kind, buyer_id, listing_id, due_at, note)
      values ('followup', r.buyer_id, r.listing_id, now(),
        'chủ nhà chưa phản hồi #' || coalesce(r.code, '?')
        || coalesce(', gợi ý căn khác: ' || v_thay, ''));
      n_khach := n_khach + 1;
    end if;
  end loop;
  return jsonb_build_object('nhac_24h', n_nhac, 'het_han_seller', n_het, 'het_han_buyer_ask', n_khach);
end $function$
;

CREATE OR REPLACE FUNCTION public.jsonb_bo_rong(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare k text; v jsonb; e jsonb; o jsonb;
begin
  if j is null or j = 'null'::jsonb then return null; end if;
  if jsonb_typeof(j) = 'object' then
    o := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop
      e := public.jsonb_bo_rong(v);
      if e is null then continue; end if;
      if jsonb_typeof(e) in ('object', 'array') and (e = '{}'::jsonb or e = '[]'::jsonb) then continue; end if;
      if jsonb_typeof(e) = 'string' and btrim(e #>> '{}') = '' then continue; end if;
      o := o || jsonb_build_object(k, e);
    end loop;
    return o;
  elsif jsonb_typeof(j) = 'array' then
    select coalesce(jsonb_agg(public.jsonb_bo_rong(x)), '[]'::jsonb) into o
      from jsonb_array_elements(j) x where x <> 'null'::jsonb;
    return o;
  end if;
  return j;
end $function$
;

CREATE OR REPLACE FUNCTION public.kd_ten(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select btrim(regexp_replace(
    regexp_replace(lower(public.bo_dau(coalesce(p, ''))), '[^a-z0-9 ]+', '', 'g'),
    '\s+', ' ', 'g'))
$function$
;

CREATE OR REPLACE FUNCTION public.khoa_du_an_danh_sach(p_khoa text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select p_khoa in ('tien_ich_gan', 'tien_ich', 'ha_tang', 'khu_compound')
$function$
;

CREATE OR REPLACE FUNCTION public.khoa_nhung_nen()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ds text[];
  v_so int;
  v_key text;
begin
  v_ds := array_remove(string_to_array(regexp_replace(coalesce(public.cau_hinh('nhung_khoa_ds'), ''), '\s', '', 'g'), ','), '');
  if coalesce(array_length(v_ds, 1), 0) > 0 then
    v_so := ((greatest(coalesce(nullif(public.cau_hinh('nhung_khoa_so'), '')::int, 1), 1) - 1) % array_length(v_ds, 1)) + 1;
    v_key := public.get_secret(v_ds[v_so]);
  end if;
  return coalesce(nullif(v_key, ''), public.get_secret('GEMINI_API_KEY_2'), public.get_secret('GEMINI_API_KEY'));
end $function$
;

CREATE OR REPLACE FUNCTION public.khoang_cach_m(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select 6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))))
$function$
;

CREATE OR REPLACE FUNCTION public.khu_khop(p_area_kd text, p_ward text, p_district text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_ward_kd text; v_ward_no text; v_dist_kd text; v_dist_re text;
begin
  if coalesce(p_area_kd, '') = '' then return false; end if;
  v_ward_kd := btrim(regexp_replace(public.bo_dau(coalesce(p_ward, '')), '^phuong\s*', ''));
  v_ward_no := (regexp_match(v_ward_kd, '^([0-9]{1,2})$'))[1];
  v_dist_kd := btrim(public.bo_dau(coalesce(p_district, '')));
  v_dist_re := case
    when v_dist_kd ~ '^(quan|q)\s*\.?\s*[0-9]{1,2}$'
      then '(quan|q)\s*\.?\s*' || (regexp_match(v_dist_kd, '([0-9]{1,2})$'))[1] || '\M'
    when v_dist_kd <> '' then '\m' || v_dist_kd || '\M'
    else null end;
  if p_area_kd ~ '(phuong\s*\.?\s*[0-9]{1,2}|(^|[^a-z0-9])p\.?\s*[0-9]{1,2}(?![0-9]))' then
    return v_ward_no is not null
       and p_area_kd ~ ('(phuong\s*\.?\s*' || v_ward_no || '(?![0-9])|(^|[^a-z0-9])p\.?\s*' || v_ward_no || '(?![0-9]))');
  end if;
  return (v_ward_no is null and v_ward_kd <> '' and p_area_kd ~ ('\m' || v_ward_kd || '\M'))
      or (v_dist_re is not null and p_area_kd ~ v_dist_re);
end $function$
;

CREATE OR REPLACE FUNCTION public.la_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.admins a
     where a.email = ((select auth.jwt()) ->> 'email')
  )
$function$
;

CREATE OR REPLACE FUNCTION public.la_id_thu(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(p ~ '^(thu-|b15-|hoi-|z-|e2e-|b-|lx-|do-)', false)
$function$
;

CREATE OR REPLACE FUNCTION public.lan_thu_ke(p_attempts integer)
 RETURNS interval
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select least(interval '30 seconds' * power(2, greatest(p_attempts,1) - 1),
               interval '1 hour') * (0.8 + random() * 0.4);
$function$
;

CREATE OR REPLACE FUNCTION public.liet_ke_migration()
 RETURNS TABLE(version text, name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select m.version, m.name
  from supabase_migrations.schema_migrations m
  order by m.version;
$function$
;

CREATE OR REPLACE FUNCTION public.liet_ke_migration_cong_khai()
 RETURNS TABLE(version text, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'supabase_migrations', 'pg_catalog'
AS $function$
  select m.version, m.name
    from supabase_migrations.schema_migrations m
   order by m.version;
$function$
;

CREATE OR REPLACE FUNCTION public.listing_du_dang_tin(p_price_vnd bigint, p_area_m2 numeric, p_ward text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select p_price_vnd is not null
     and p_area_m2  is not null
     and p_ward     is not null and btrim(p_ward) <> '';
$function$
;

CREATE OR REPLACE FUNCTION public.listing_facts_soat_phuong()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.question = 'phuong' and public.chuan_hoa_phuong(new.answer) is null then
    perform public.log_loi('fact phuong khong chuan', left(new.listing_id::text || ': "' || coalesce(new.answer, '') || '" (' || coalesce(new.source, '?') || ')', 300), null::integer);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.listing_facts_sync_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_txt   text := coalesce(new.answer, '');
  v_num   numeric;
  v_vnd   bigint;
  v_raw   text;
  v_ward  text;
  v_pt    public.property_type;
  j       jsonb;
  -- Bậc nguồn theo FR-164/173: admin nhập tay hoặc CTV trả lời là `admin` (2);
  -- còn lại coi như lời chủ nhà `chu_xac_nhan` (3).
  bac     text := case when new.source ilike 'admin%' or new.source ilike 'ctv%'
                       then 'admin' else 'chu_xac_nhan' end;
  l       listings%rowtype;
  de      boolean;
  v_ai    boolean;
begin
  -- 20260920a (FR-211): nhãn tìm kiếm là TÊN NHÃN, không phải câu tả căn — không đọc thông số từ nó.
  if new.question = 'nhan' then return null; end if;
  select * into l from listings where id = new.listing_id;
  if not found then return null; end if;
  -- Cụm thông số (FR-172): được đè khi bậc của fact ≥ bậc cụm đang giữ.
  de := public.bac_nguon(bac) >= public.bac_nguon(coalesce(l.specs_source, 'boc_mo_ta'));
  j := public.boc_thong_so(v_txt, l.property_type::text);
  -- 20261002a (đợt 1 chuyển luật sang AI): tin do AI quyết thông số → regex chỉ được đọc CỘT CỦA ĐÚNG KHOÁ fact này (pháp lý →
  -- giấy tờ, hẻm → đường vào…). Chữ tự do (bổ sung, kiến thức, tiềm năng…) không điền cột nào; không lật loại BĐS từ chữ.
  v_ai := coalesce(l.boc_tach->>'_thong_so_ai', '') = 'true';
  if v_ai then j := public.loc_thong_so_theo_khoa(j, new.question); end if;
  -- 20260925e: "nhà cấp 4" (câu trả lời bất kỳ) mà tin đang là nhà phố / chưa rõ → nhà cấp 4.
  if not v_ai and l.property_type in ('nha_pho', 'chua_ro') and public.bo_dau(v_txt) ~ '\m(cap 4|cap bon|nha c4)\M'
     and public.bo_dau(v_txt) !~ '(khong|ko|chua)\s*(phai\s*)?(la\s*)?(nha\s*)?cap' then
    update listings set property_type = 'nha_cap4' where id = new.listing_id and property_type in ('nha_pho', 'chua_ro');
  end if;
  -- 20260927a: "căn chung cư ở Botanic", "chung cư mà em", "căn hộ tầng 6" → căn hộ (tin nhà phố chưa có số tầng / chưa rõ).
  if not v_ai and l.property_type in ('nha_pho', 'chua_ro') and l.floors is null
     and public.bo_dau(v_txt) ~ '(^\s*|\m(can|la|ban|o|dang|co|toi|minh|anh|chi|em|chu|cua)\s+)(chung cu|can ho|cc mini|chung cu mini)\M'
     and public.bo_dau(v_txt) !~ '(gan|canh|doi dien|sat|ke|ben|view|nhin ra|cach)\s+(cac\s+)?(chung cu|can ho)'
     and public.bo_dau(v_txt) !~ '(khong|ko|chua)\s*(phai\s*)?(la\s*)?(chung cu|can ho)' then
    update listings set property_type = 'chung_cu' where id = new.listing_id and property_type in ('nha_pho', 'chua_ro') and floors is null;
  end if;

  if new.question = 'so_phong_ngu' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bedrooms = v_num::int, specs_source = bac
       where id = new.listing_id and (bedrooms is null or de);
    end if;

  -- 22/09/2026 (kịch bản C, bắn thật): "3pn 2wc" → fact `so_wc` có, cột `bathrooms` trống — chưa từng có nhánh.
  elsif new.question = 'so_wc' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bathrooms = v_num::int, specs_source = bac
       where id = new.listing_id and (bathrooms is null or de);
    end if;

  -- Diện tích đất / diện tích chung. KHÔNG khớp `dien_tich_tim_tuong` (FR-163).
  elsif new.question in ('dien_tich', 'dien_tich_dat') then
    -- "6x11" là NGANG x DÀI, không phải 6 m2. Bản trước lấy SỐ ĐẦU TIÊN nên
    -- diện tích thành 6 — qua lọt vì 6 > 5 (bắt 08/09/2026, bàn giao §7).
    -- `boc_thong_so` đã tách đúng hai chiều rồi; ở đây chỉ việc nhân.
    if (j ? 'frontage_m') and (j ? 'length_m') then
      v_num := round((j->>'frontage_m')::numeric * (j->>'length_m')::numeric, 1);
    else
      v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    end if;
    if v_num is not null and v_num > 5 and (v_num < 5000 or (l.property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh', 'kho_xuong', 'toa_nha') and v_num < 1000000)) then
      update listings set area_m2 = v_num, specs_source = bac
       where id = new.listing_id and (area_m2 is null or de)
         and area_m2 is distinct from v_num;
    end if;

  -- Tim tường chỉ là diện tích CỦA chung cư; nhà đất thì đó là sàn, không phải đất.
  elsif new.question = 'dien_tich_tim_tuong' then
    if l.property_type = 'chung_cu' then
      v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
      if v_num is not null and v_num > 5 and (v_num < 5000 or (l.property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh', 'kho_xuong', 'toa_nha') and v_num < 1000000)) then
        update listings set area_m2 = v_num, specs_source = bac
         where id = new.listing_id and (area_m2 is null or de)
           and area_m2 is distinct from v_num;
      end if;
    end if;

  -- Giá: validate bằng parse_vnd, ghi NGUYÊN VĂN đã cắt tiểu từ (20260828d),
  -- bậc riêng `price_source`; trigger `trg_listings_price_vnd` tự tính lại price_vnd.
  elsif new.question = 'gia' then
    v_vnd := public.parse_vnd(v_txt);
    if v_vnd is not null and (
         (l.deal = 'cho_thue' and v_vnd between 1000000 and 10000000000)
      or (l.deal is distinct from 'cho_thue' and v_vnd between 100000000 and 1000000000000)
    ) then
      v_raw := public.chuan_hoa_gia_raw(v_txt);
      update listings set price_raw = v_raw, price_source = bac
       where id = new.listing_id
         and public.bac_nguon(bac) >= public.bac_nguon(price_source)
         and (price_raw is distinct from v_raw or price_source is distinct from bac);
    end if;

  -- 22/09/2026 (bắn lại kịch bản D): "nở hậu 4m5" → fact no_hau "4.5m" nhưng cột trống — boc_thong_so chỉ đọc khi câu có chữ "nở hậu".
  elsif new.question = 'no_hau' and not (j ? 'rear_width_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1.5 and 40 then
      update listings set rear_width_m = v_num, specs_source = bac
       where id = new.listing_id and (rear_width_m is null or de);
    end if;

  -- 20261012a (SRS-5.1zzzzzf, khách mô phỏng lần bảy: "chiều sâu thì 16 mét" khi chưa nói ngang → AI đọc dài 16, code không có ô
  -- nào để cất nên bỏ, bot hỏi lại diện tích). Fact `chieu_dai` chỉ điền cột length_m; ngang tới sau thì trigger trên listings nhân ra
  -- diện tích. Không dùng fact mat_tien / dien_tich: có fact đó là listing_missing_facts coi như đã trả lời ngang / diện tích.
  elsif new.question = 'chieu_dai' then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 3 and 150 then
      update listings set length_m = v_num, specs_source = bac
       where id = new.listing_id and (length_m is null or de);
    end if;

  -- 22/09/2026 (kịch bản D): "đang cho thuê 30 triệu/tháng" → fact doanh_thu; tin BÁN thì đó là dòng tiền đang thu.
  elsif new.question = 'doanh_thu' then
    v_vnd := public.parse_vnd(v_txt);
    if v_vnd is not null and v_vnd between 1000000 and 10000000000 and l.deal is distinct from 'cho_thue' then
      update listings set rent_income_vnd = v_vnd, specs_source = bac
       where id = new.listing_id and (rent_income_vnd is null or de);
    end if;

  elsif new.question = 'phuong' then
    v_ward := public.chuan_hoa_phuong(v_txt);
    if v_ward is not null then
      update listings set ward = v_ward, ward_source = bac
       where id = new.listing_id
         and public.bac_nguon(bac) >= public.bac_nguon(ward_source)
         and (ward is distinct from v_ward or ward_source is distinct from bac);
    end if;

  elsif new.question = 'loai_bds' then
    v_pt := public.guess_property_type_answer(v_txt);
    if v_pt is not null then
      update listings set property_type = v_pt, property_type_source = bac
       where id = new.listing_id
         and public.bac_nguon(bac) >= public.bac_nguon(property_type_source)
         and (property_type is distinct from v_pt or property_type_source is distinct from bac);
    end if;

  -- 13/09/2026: căn hộ "tầng 15" là TẦNG CĂN NẰM (cột `floor`, `boc_thong_so` +
  -- `ap_thong_so` đã ghi đúng), không phải nhà 15 tầng. Bản trước ghi luôn
  -- `floors` = 15 và bản nháp in "trệt + 14 lầu" cho một căn hộ Sunrise City.
  elsif new.question in ('tang', 'ket_cau') then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if l.property_type = 'chung_cu' then
      if new.question = 'tang' and v_num is not null and v_num between 0 and 80 and not (j ? 'floor') then
        update listings set floor = v_num::int, specs_source = bac
         where id = new.listing_id and (floor is null or de);
      end if;
    elsif v_num is not null and v_num between 0 and 80 and not (j ? 'floors') and not (j ? 'floor') then
      update listings set floors = v_num::int,
             floors_text = coalesce(floors_text,
               case when v_num::int <= 1 then 'trệt'
                    else 'trệt + ' || (v_num::int - 1) || ' lầu' end),
             specs_source = bac
       where id = new.listing_id and (floors is null or de);
    end if;
  elsif new.question = 'huong' and not (j ? 'direction') and length(btrim(v_txt)) between 2 and 40 then
    update listings set direction = btrim(v_txt), specs_source = bac
     where id = new.listing_id and (direction is null or de);
  elsif new.question in ('do_rong_hem', 'do_rong_duong') and not (j ? 'alley_width_m') then
    -- 20261012b: số đo (kèm m / mét, hoặc số trơn không có chữ đứng sau) — "đường lớn 2 chiều" không ra 2m.
    v_num := nullif((regexp_match(replace(public.bo_dau(lower(v_txt)), ',', '.'),
      '(?:^|[^0-9.])([0-9]+(?:[.][0-9]+)?)(?:\s*(?:m|met)(?![a-z])|(?![0-9.])(?!\s*[a-z]))'))[1], '')::numeric;
    if v_num is not null and v_num between 1 and 40 then
      update listings set alley_width_m = v_num,
             -- 20261001a: "đường nhựa 6m" (độ rộng ĐƯỜNG trước nhà / đất) là mặt tiền đường, không phải hẻm xe tải.
             access_type = coalesce(access_type, case when new.question = 'do_rong_duong' then 'mat_tien'
                                                      when v_num >= 6 then 'hem_xe_tai' when v_num >= 3.5 then 'hem_xe_hoi' when v_num >= 3 then 'hem' else 'hem_xe_may' end),
             specs_source = bac
       where id = new.listing_id and (alley_width_m is null or de);
    end if;
  elsif new.question = 'quy_hoach' and not (j ? 'planning_status') and public.bo_dau(v_txt) ~ '(khong|ko|k co|k dinh)' then
    update listings set planning_status = 'khong_quy_hoach', specs_source = bac
     where id = new.listing_id and (planning_status is null or de);
  elsif new.question = 'nam_xay' and not (j ? 'year_built') then
    v_num := nullif(substring(v_txt, '(?:19|20)[0-9]{2}'), '')::numeric;
    if v_num is not null then
      update listings set year_built = v_num::int, specs_source = bac
       where id = new.listing_id and (year_built is null or de);
    end if;
  elsif new.question = 'noi_that' and not (j ? 'furnishing') then
    update listings set furnishing = case when public.bo_dau(v_txt) ~ '(full|day du|cao cap)' then 'full'
                                          when public.bo_dau(v_txt) ~ '(khong|trong|ko)' then 'khong'
                                          when public.bo_dau(v_txt) ~ '(co ban)' then 'co_ban' end, specs_source = bac
     where id = new.listing_id and (furnishing is null or de)
       and public.bo_dau(v_txt) ~ '(full|day du|cao cap|khong|trong|ko|co ban)';
  -- 14/09/2026 (bắn 14 tin bán): "cách mặt tiền 50m" vào fact nhưng cột distance_to_street_m
  -- vẫn trống — boc_thong_so chỉ đọc số khi câu CÓ chữ "cách mặt tiền", đáp án đã cắt là "50m".
  elsif new.question = 'cach_mat_tien' and not (j ? 'distance_to_street_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1 and 2000 then
      update listings set distance_to_street_m = v_num, specs_source = bac
       where id = new.listing_id and (distance_to_street_m is null or de);
    end if;
  -- "đường Lạc Long Quân p5": địa chỉ kèm phường số — phường trống thì ghi luôn, khỏi hỏi lại
  -- "nhà mình phường mấy" (lượt bắn đó hỏi 3 lần).
  elsif new.question = 'vi_tri' and l.ward is null
        and public.bo_dau(v_txt) ~ '(?:phuong|\mp)\s*\.?\s*[0-9]{1,2}\M' then
    v_ward := public.chuan_hoa_phuong(substring(public.bo_dau(v_txt) from '(?:phuong|\mp)\s*\.?\s*[0-9]{1,2}'));
    if v_ward is not null then
      update listings set ward = v_ward, ward_source = bac
       where id = new.listing_id and ward is null;
    end if;
  -- 20261002a: ô cột AI quyết (chữ chuẩn do code ghi: "có" / "không", "hẻm xe hơi"…). Đọc PHỦ ĐỊNH: "không có thang máy"
  -- từng thành có thang máy vì regex chỉ tìm chữ "thang may".
  elsif new.question = 'loai_duong_vao' then
    v_raw := case public.bo_dau(btrim(v_txt))
      when 'mat tien' then 'mat_tien' when 'hem xe tai' then 'hem_xe_tai' when 'hem xe hoi' then 'hem_xe_hoi'
      when 'hem xe may' then 'hem_xe_may' when 'trong hem' then 'hem' end;
    if v_raw is not null then
      update listings set access_type = v_raw, specs_source = bac
       where id = new.listing_id and (access_type is null or de) and access_type is distinct from v_raw;
    end if;
  elsif new.question in ('o_to_vao_nha', 'hoan_cong', 'thang_may', 'can_goc') and public.doc_co_khong(v_txt) is not null then
    execute format('update listings set %I = $1, specs_source = $2 where id = $3 and (%I is null or $4)',
      case new.question when 'o_to_vao_nha' then 'car_in_house' when 'hoan_cong' then 'has_completion'
                        when 'thang_may' then 'has_elevator' else 'corner_lot' end,
      case new.question when 'o_to_vao_nha' then 'car_in_house' when 'hoan_cong' then 'has_completion'
                        when 'thang_may' then 'has_elevator' else 'corner_lot' end)
      using public.doc_co_khong(v_txt), bac, new.listing_id, de;
  elsif new.question = 'mat_tien' and not (j ? 'frontage_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1.5 and 40 then
      update listings set frontage_m = v_num, specs_source = bac
       where id = new.listing_id and (frontage_m is null or de);
    end if;
  end if;

  -- 20260923g (bắn thật 23/09): fact CHỮ TỰ DO ("bổ sung", tiềm năng, hiện trạng…) chỉ được ĐIỀN ô trống, không đè.
  -- "có 1 phòng ngủ ngay tầng trệt tiện cho ông bà" từng đè 3 phòng ngủ → 1 và "trệt + 2 lầu" → "trệt".
  -- Chỉ fact đúng ô thông số (kết cấu, số phòng, diện tích, pháp lý, hẻm, hướng…) mới được sửa giá trị đã có.
  perform public.ap_thong_so(new.listing_id, j, bac, de and new.question in (
    'ket_cau', 'so_phong_ngu', 'so_wc', 'so_phong', 'dien_tich', 'dien_tich_dat', 'dien_tich_san', 'dien_tich_tim_tuong',
    'phap_ly', 'do_rong_hem', 'do_rong_duong', 'mat_tien', 'huong', 'tang', 'no_hau', 'nam_xay', 'chieu_cao', 'tho_cu',
    'noi_that', 'cach_mat_tien'));
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.listing_facts_sync_deal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deal public.listing_deal;
  v_gia  text;
  v_vnd  bigint;
  v_raw  text;
begin
  if new.question <> 'loai_giao_dich' then return null; end if;
  v_deal := case when public.bo_dau(coalesce(new.answer, '')) ~ 'thue' then 'cho_thue' else 'ban' end;
  update public.listings set deal = v_deal
   where id = new.listing_id and deal is distinct from v_deal;
  -- Fact giá gần nhất của tin: áp lại theo sàn/trần của loại mới (cùng ngưỡng với
  -- `listing_facts_sync_cols`). Không có fact giá thì thôi.
  select answer into v_gia from public.listing_facts
   where listing_id = new.listing_id and question = 'gia' and id <> new.id
   order by created_at desc limit 1;
  if v_gia is not null then
    v_vnd := public.parse_vnd(v_gia);
    if v_vnd is not null and (
         (v_deal = 'cho_thue' and v_vnd between 1000000 and 10000000000)
      or (v_deal = 'ban' and v_vnd between 100000000 and 1000000000000)
    ) then
      v_raw := public.chuan_hoa_gia_raw(v_gia);
      update public.listings set price_raw = v_raw
       where id = new.listing_id and price_raw is distinct from v_raw;
    end if;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.listing_facts_sync_gap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v boolean;
begin
  if new.question <> 'gap' then return null; end if;
  v := public.doc_gap(new.answer);
  if v is not null then
    update public.listings set gap = v where id = new.listing_id and gap is distinct from v;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.listing_media_chon_bia(p_listing_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if exists (select 1 from listing_media where listing_id = p_listing_id and is_cover) then
    return;
  end if;
  select id into v_id from listing_media
   where listing_id = p_listing_id and bucket = 'listing-public'
   order by sort_order, created_at, id limit 1;
  if v_id is not null then
    update listing_media set is_cover = true where id = v_id;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.listing_media_giu_bia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.listing_media_chon_bia(coalesce(new.listing_id, old.listing_id));
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.listing_media_xep_hang_don()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    insert into media_cleanup_queue (bucket, storage_path)
    values (old.bucket, old.storage_path);
    return old;
  end if;
  if old.bucket is distinct from new.bucket
     or old.storage_path is distinct from new.storage_path then
    insert into media_cleanup_queue (bucket, storage_path)
    values (old.bucket, old.storage_path);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.listings_bao_can_da_chot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'da_chot' and old.status is distinct from 'da_chot' then
    begin
      perform public.bao_can_da_chot(new.id);
    exception when others then
      perform public.log_loi('bao_can_da_chot', left(sqlerrm, 400), null::integer);
    end;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.listings_bao_tin_moi_khop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'dang_ban'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and (tg_op = 'INSERT' or old.status not in ('dang_ban', 'dang_quan_tam'))
     and new.price_vnd is not null and new.ward is not null then
    begin
      perform public.bao_tin_moi_khop(new.id);
    exception when others then
      perform public.log_loi('bao_tin_moi_khop', left(sqlerrm, 400), null::integer);
    end;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.listings_boc_thong_so()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  j jsonb;
  de boolean;
  co boolean := false;
begin
  -- 20261012c (SRS-5.1zzzzzh, bắn production 12/10 thu-kb-thue): căn hộ "Sunrise City" → location_raw "Sunrise City" → street "Sunrise City".
  -- Tên DỰ ÁN không phải tên ĐƯỜNG: chữ đọc ra trùng tên dự án tin đang gắn thì cột street để trống.
  if new.street is null then
    new.street := public.boc_ten_duong(new.location_raw);
    if new.street is not null and new.project_id is not null and exists (
      select 1 from public.projects p where p.id = new.project_id and lower(btrim(p.name)) = lower(btrim(new.street))
    ) then new.street := null; end if;
  end if;
  if new.description is null then return new; end if;
  -- 20261002a (đợt 1 chuyển luật sang AI): tin do AI quyết thông số (dấu `_thong_so_ai`, chat-reply chế độ `ai`) → KHÔNG đọc
  -- câu rao bằng regex. Bắn thử lx-t5-05: "nằm trong khu công nghiệp nên không có hẻm" → `\mhem\M` → access_type = 'hem'.
  if coalesce(new.boc_tach->>'_thong_so_ai', '') = 'true' then return new; end if;
  de := tg_op = 'UPDATE' and new.description is distinct from old.description
        and coalesce(new.specs_source, 'boc_mo_ta') = 'boc_mo_ta';
  j := public.boc_thong_so(new.description, new.property_type::text);

  if j ? 'frontage_m'           and (de or new.frontage_m is null)           then new.frontage_m := (j->>'frontage_m')::numeric; co := true; end if;
  if j ? 'length_m'             and (de or new.length_m is null)             then new.length_m := (j->>'length_m')::numeric; co := true; end if;
  if j ? 'rear_width_m'         and (de or new.rear_width_m is null)         then new.rear_width_m := (j->>'rear_width_m')::numeric; co := true; end if;
  if j ? 'legal_area_m2'        and (de or new.legal_area_m2 is null)        then new.legal_area_m2 := (j->>'legal_area_m2')::numeric; co := true; end if;
  if j ? 'built_area_m2'        and (de or new.built_area_m2 is null)        then new.built_area_m2 := (j->>'built_area_m2')::numeric; co := true; end if;
  if j ? 'floors'               and (de or new.floors is null)               then new.floors := (j->>'floors')::int; new.floors_text := j->>'floors_text'; co := true; end if;
  if j ? 'floor'                and (de or new.floor is null)                then new.floor := (j->>'floor')::int; co := true; end if;
  if j ? 'bedrooms'             and (de or new.bedrooms is null)             then new.bedrooms := (j->>'bedrooms')::int; co := true; end if;
  if j ? 'bathrooms'            and (de or new.bathrooms is null)            then new.bathrooms := (j->>'bathrooms')::int; co := true; end if;
  if j ? 'access_type'          and (de or new.access_type is null)          then new.access_type := j->>'access_type'; co := true; end if;
  if j ? 'alley_width_m'        and (de or new.alley_width_m is null)        then new.alley_width_m := (j->>'alley_width_m')::numeric; co := true; end if;
  if j ? 'distance_to_street_m' and (de or new.distance_to_street_m is null) then new.distance_to_street_m := (j->>'distance_to_street_m')::numeric; co := true; end if;
  if j ? 'legal_status'         and (de or new.legal_status is null)         then new.legal_status := j->>'legal_status'; co := true; end if;
  if j ? 'has_completion'       and (de or new.has_completion is null)       then new.has_completion := (j->>'has_completion')::boolean; co := true; end if;
  if j ? 'planning_status'      and (de or new.planning_status is null)      then new.planning_status := j->>'planning_status'; co := true; end if;
  if j ? 'has_elevator'         and (de or new.has_elevator is null)         then new.has_elevator := true; co := true; end if;
  if j ? 'car_in_house'         and (de or new.car_in_house is null)         then new.car_in_house := true; co := true; end if;
  if j ? 'corner_lot'           and (de or new.corner_lot is null)           then new.corner_lot := true; co := true; end if;
  if j ? 'furnishing'           and (de or new.furnishing is null)           then new.furnishing := j->>'furnishing'; co := true; end if;
  if j ? 'year_built'           and (de or new.year_built is null)           then new.year_built := (j->>'year_built')::int; co := true; end if;
  if j ? 'direction'            and (de or new.direction is null)            then new.direction := j->>'direction'; co := true; end if;
  if j ? 'negotiable'           and (de or new.negotiable is null)           then new.negotiable := (j->>'negotiable')::boolean; co := true; end if;
  if j ? 'rent_income_vnd' and new.deal = 'ban' and (de or new.rent_income_vnd is null) then new.rent_income_vnd := (j->>'rent_income_vnd')::bigint; co := true; end if;

  if co and new.specs_source is null then new.specs_source := 'boc_mo_ta'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.listings_chuan_hoa_cot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_ward text;
begin
  new.price_raw := public.chuan_hoa_gia_raw(new.price_raw);
  -- 20261009b: chỉ xét khi phường ĐỔI (dòng cũ đã sửa ở bước dữ liệu bên dưới). Không phải tên chuẩn → để trống + sổ lỗi.
  if new.ward is not null and (tg_op = 'INSERT' or new.ward is distinct from old.ward) then
    v_ward := public.chuan_hoa_phuong(new.ward);
    if v_ward is null then
      perform public.log_loi('listings.ward khong chuan', left(coalesce(new.code, new.id::text) || ': "' || new.ward || '"', 300), null::integer);
    end if;
    new.ward := v_ward;
  end if;
  -- 20260909k: ngang × dài → diện tích (chỉ khi chưa có; 5…5000 m² như listing_facts_sync_cols)
  if new.area_m2 is null and new.frontage_m is not null and new.length_m is not null then
    if new.frontage_m * new.length_m between 5 and 5000 then
      new.area_m2 := round((new.frontage_m * new.length_m)::numeric, 1);
    end if;
  end if;
  -- 20260925d: nở hậu → diện tích hình thang, chỉ khi diện tích đang là ngang × dài do hệ thống nhân.
  if new.rear_width_m is not null and new.frontage_m is not null and new.length_m is not null
     and new.rear_width_m > new.frontage_m and new.rear_width_m <= new.frontage_m * 3
     and new.area_m2 = round((new.frontage_m * new.length_m)::numeric, 1)
     and not exists (
       select 1 from public.listing_facts f
        where f.listing_id = new.id and f.question in ('dien_tich', 'dien_tich_dat')
          and public.bo_dau(coalesce(f.answer, '')) ~ '\d\s*(m2|m²|met vuong|m vuong)'
          and public.bo_dau(coalesce(f.answer, '')) !~ '\d\s*x\s*\d+([.,]\d+)?\s*(m2|m²|m\M|met)'
     ) then
    new.area_m2 := round(((new.frontage_m + new.rear_width_m) / 2 * new.length_m)::numeric, 1);
  end if;
  if new.location_raw is not null then
    new.location_raw := btrim(regexp_replace(regexp_replace(new.location_raw, '\s*,(\s*,)+', ',', 'g'), '^[\s,]+|[\s,]+$', '', 'g'));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.listings_doi_ma_theo_quan_loai()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_moi text;
begin
  if new.status = 'cho_thong_tin' and new.chu_duyet_at is null
     and (new.district is distinct from old.district or new.property_type is distinct from old.property_type)
     and new.code ~ '^BDS-[A-Z0-9]+-[A-Z0-9]+-[0-9]+$' then
    v_moi := public.next_listing_code(new.property_type::text, new.district, null);
    if regexp_replace(v_moi, '[0-9]+$', '') <> regexp_replace(new.code, '[0-9]+$', '') then
      new.code := v_moi;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.listings_fill_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.next_listing_code(new.property_type::text, new.district, null);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.listings_fill_property_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  g public.property_type;
begin
  if coalesce(new.boc_tach->>'_thong_so_ai', '') = 'true' then return new; end if;
  if new.property_type is null or new.property_type = 'chua_ro' then
    g := public.guess_property_type(
      coalesce(new.description, '') || ' ' || coalesce(new.location_raw, '')
    );
    if g is not null then
      new.property_type := g;
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.listings_normalize_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.status := case coalesce(new.status, 'cho_thong_tin')
    when 'unverified'     then 'cho_thong_tin'
    when 'draft'          then 'cho_thong_tin'
    when 'pending_review' then 'cho_thong_tin'
    when 'active'         then 'dang_ban'
    when 'negotiating'    then 'dang_quan_tam'
    when 'sold'           then 'da_chot'
    when 'expired'        then 'an'
    when 'hidden'         then 'an'
    else new.status end;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.listings_quyet_dinh_dang_tin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_du boolean := public.listing_du_dang_tin(new.price_vnd, new.area_m2, new.ward);
begin
  if v_du and new.can_chu_duyet then
    v_du := new.chu_duyet_at is not null;
  end if;
  if v_du and new.status = 'cho_thong_tin' then
    new.status := 'dang_ban';
  elsif not v_du and new.status = 'dang_ban' then
    new.status := 'cho_thong_tin';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.listings_set_price_vnd()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.price_vnd := public.parse_vnd(new.price_raw);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.listings_try_publish(p_listing_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.listings set id = id where id = p_listing_id;
$function$
;

CREATE OR REPLACE FUNCTION public.listings_xoa_toa_do_khi_doi_dia_chi()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (new.location_raw is distinct from old.location_raw
      or new.street    is distinct from old.street
      or new.ward      is distinct from old.ward
      or new.district  is distinct from old.district
      or new.project_id is distinct from old.project_id)
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng
     and coalesce(old.toa_do_muc, '') <> 'tay' then
    new.lat          := null;
    new.lng          := null;
    new.toa_do_muc   := null;
    new.geocode_at   := null;
    new.tien_ich_gan := null;
    new.tien_ich_at  := null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.loc_thong_so_theo_khoa(j jsonb, q text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    from jsonb_each(coalesce(j, '{}'::jsonb)) as e(k, v)
   where k = any (case q
     when 'ket_cau' then array['floors', 'floors_text', 'floor']
     when 'tang' then array['floors', 'floors_text', 'floor']
     when 'so_phong_ngu' then array['bedrooms']
     when 'so_wc' then array['bathrooms']
     when 'dien_tich' then array['frontage_m', 'length_m', 'rear_width_m']
     when 'dien_tich_dat' then array['frontage_m', 'length_m', 'rear_width_m']
     when 'mat_tien' then array['frontage_m', 'length_m', 'rear_width_m']
     when 'no_hau' then array['rear_width_m']
     when 'dien_tich_san' then array['built_area_m2']
     when 'phap_ly' then array['legal_status', 'has_completion', 'legal_area_m2']
     when 'do_rong_hem' then array['alley_width_m', 'access_type']
     when 'do_rong_duong' then array['alley_width_m', 'access_type']
     when 'cach_mat_tien' then array['distance_to_street_m']
     when 'huong' then array['direction']
     when 'noi_that' then array['furnishing']
     when 'nam_xay' then array['year_built']
     when 'quy_hoach' then array['planning_status']
     when 'thuong_luong' then array['negotiable']
     when 'doanh_thu' then array['rent_income_vnd']
     else array[]::text[] end)
$function$
;

CREATE OR REPLACE FUNCTION public.log_loi(p_source text, p_detail text, p_code integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src text := left(coalesce(nullif(trim(p_source), ''), 'khong_ro'), 40);
  v_nguon int;
  v_tong int;
  v_noi_bo boolean := coalesce(auth.role(), '') = 'service_role'
                      or current_user in ('postgres', 'supabase_admin');
begin
  select count(*) filter (where source = v_src), count(*)
    into v_nguon, v_tong
    from bot_errors where at > now() - interval '1 hour';
  if v_nguon >= 20 then return; end if;
  if not v_noi_bo and v_tong >= 200 then return; end if;
  insert into bot_errors (source, status_code, detail)
  values (v_src, p_code, left(public.che_sdt(coalesce(p_detail, '')), 500));
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_listing_interest(p_codes text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n int;
begin
  update public.listings
  set status = 'dang_quan_tam', last_interest_at = now()
  where (code = any(p_codes) or legacy_code = any(p_codes))
    and status in ('dang_ban', 'dang_quan_tam');
  get diagnostics n = row_count;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_listing_interest(p_codes text[], p_buyer_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int;
begin
  n := public.mark_listing_interest(p_codes);
  if p_buyer_id is not null then
    insert into interests (buyer_id, listing_id)
    select p_buyer_id, l.id from listings l
     where (l.code = any(p_codes) or l.legacy_code = any(p_codes))
       and l.status in ('dang_ban', 'dang_quan_tam', 'da_chot')
    on conflict (buyer_id, listing_id) do nothing;
  end if;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.match_projects(p_text text)
 RETURNS SETOF projects
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with t as (
    select
      ' ' || btrim(regexp_replace(public.bo_dau(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g')) || ' ' as tu,
      regexp_replace(public.bo_dau(coalesce(p_text, '')), '[^a-z0-9]+', '', 'g')                       as lien
  ),
  chung as (
    select array['the','khu','can','ho','nha','pho','dat','nen','city','garden','residence',
                 'apartment','tower','block','phan','du','an','project','eco','new','and',
                 'chung','cu','biet','thu','villa','shophouse']::text[] as bo
  ),
  -- Từ lõi của TỪNG dự án (bỏ dấu, bỏ từ chung, ≥3 ký tự).
  tu_du_an as (
    select p.id, w
      from projects p,
           unnest(string_to_array(btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')), ' ')) w
     where length(w) >= 3 and not (w = any(select unnest(bo) from chung))
  ),
  -- Tần suất: từ này có mặt trong bao nhiêu dự án.
  tan_suat as (
    select w, count(distinct id) as so_du_an from tu_du_an group by w
  ),
  ung as (
    select p.id, p.name,
      (position(' ' || btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')) || ' ' in t.tu) > 0
       or (length(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', '', 'g')) >= 6
           and position(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', '', 'g') in t.lien) > 0)
       or (p.slug is not null and length(regexp_replace(p.slug, '[^a-z0-9]+', '', 'g')) >= 6
           and position(regexp_replace(p.slug, '[^a-z0-9]+', '', 'g') in t.lien) > 0)
      ) as tron,
      (select bool_or(position(' ' || cum || ' ' in t.tu) > 0)
         from (
           select array_to_string(w[i:i + 2], ' ') as cum
             from (select (select array_agg(x) from unnest(string_to_array(btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')), ' ')) x
                            where length(x) >= 3 and not (x = any(select unnest(bo) from chung))) as w) q,
                  generate_series(1, greatest(array_length(w, 1) - 2, 0)) i
         ) z
      ) as cum_khop,
      -- MỘT từ vừa dài (≥7) vừa hiếm (≤3 dự án dùng) là đủ.
      (select bool_or(position(' ' || d.w || ' ' in t.tu) > 0)
         from tu_du_an d join tan_suat s on s.w = d.w
        where d.id = p.id and length(d.w) >= 7 and s.so_du_an <= 3
      ) as tu_hiem,
      (select count(*) from tu_du_an d
        where d.id = p.id and position(' ' || d.w || ' ' in t.tu) > 0) as so_tu_khop
    from projects p, t
    where length(p.name) >= 4
  )
  select p2.*
  from ung join projects p2 on p2.id = ung.id
  where ung.tron or ung.cum_khop or ung.tu_hiem
  order by ung.tron desc, ung.so_tu_khop desc, length(p2.name), p2.priority nulls last, p2.name
  limit 2;
$function$
;

CREATE OR REPLACE FUNCTION public.media_cleanup_giu_trang_thai()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.trang_thai = 'xong' and new.trang_thai is distinct from 'xong' then
    raise exception 'media_cleanup_queue: da xong thi khong lui trang thai';
  end if;
  -- Chi tu dong dong dau thoi gian khi NGUOI GOI khong tu dat. Ep cung
  -- now() thi khong ai lui duoc updated_at, ma do la thu duy nhat quyet dinh
  -- bao gio mot viec 'loi' duoc nhan lai -- khong kiem thu duoc, cung khong
  -- van hanh duoc (muon thu lai ngay thi chiu).
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.media_cleanup_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not exists (
    select 1 from public.media_cleanup_queue
     where (trang_thai = 'cho'
            or (trang_thai in ('dang_lam','loi') and updated_at < now() - interval '10 minutes'))
       and attempts < 6
       and coalesce(next_retry_at, '-infinity'::timestamptz) <= now())
  then return; end if;

  perform net.http_post(
    url := public.cau_hinh('functions_base_url') || '/media-cleanup',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || public.cau_hinh('publishable_key'),
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
end $function$
;

CREATE OR REPLACE FUNCTION public.merge_buyer_prefs(p_buyer_id uuid, p_delta jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update buyers
     set preferences = coalesce(preferences, '{}'::jsonb) || coalesce(p_delta, '{}'::jsonb)
   where id = p_buyer_id;
$function$
;

CREATE OR REPLACE FUNCTION public.messages_bump_last_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update conversations
     set last_message_at = greatest(coalesce(last_message_at, '-infinity'::timestamptz), new.created_at)
   where id = new.conversation_id;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.mo_ho_so_nguoi_ban(p_zalo_user_id text, p_seller_type seller_type DEFAULT 'ccrb'::seller_type)
 RETURNS TABLE(id uuid, name text, active_listing_id uuid, seller_type seller_type)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into sellers (zalo_user_id, seller_type)
  values (p_zalo_user_id, coalesce(p_seller_type, 'ccrb'))
  on conflict (zalo_user_id) do update
    set seller_type = case
      when sellers.seller_type = 'unknown' then excluded.seller_type
      else sellers.seller_type
    end
  returning sellers.id, sellers.name, sellers.active_listing_id, sellers.seller_type;
$function$
;

CREATE OR REPLACE FUNCTION public.mo_viec_can_nguoi_that(p_buyer_id uuid, p_ctv_id uuid, p_note text, p_voice boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  da int;
begin
  if p_buyer_id is null then
    raise exception 'p_buyer_id khong duoc null' using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(hashtext('escalation_nguoi_that'), hashtext(p_buyer_id::text));

  if p_voice then
    select count(*) into da from public.reminders
     where buyer_id = p_buyer_id
       and kind = 'escalation'
       and status in ('pending', 'sent')
       and note ilike 'VOICE:%'
       and created_at > now() - interval '24 hours';
  else
    select count(*) into da from public.reminders
     where buyer_id = p_buyer_id
       and kind = 'escalation'
       and status = 'pending';
  end if;

  if da > 0 then
    return false;
  end if;

  insert into public.reminders (kind, buyer_id, ctv_id, due_at, note)
  values ('escalation', p_buyer_id, p_ctv_id, now(), p_note);
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.moc_khop(p_loai text, p_ten_re text DEFAULT NULL::text)
 RETURNS TABLE(ten text, lat double precision, lng double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with a as (
    select coalesce(p_loai, 'dia_diem') as loai,
           case when coalesce(p_ten_re, '') = '' then null
                else '(^| )(' || p_ten_re || ')( |$)' end as re
  )
  select t.ten, t.lat, t.lng
  from tien_ich t, a
  where (a.loai not in ('benh_vien', 'truong_hoc', 'cho', 'sieu_thi', 'cong_vien') or t.loai = a.loai)
    and case when a.re is null then a.loai in ('benh_vien', 'truong_hoc', 'cho', 'sieu_thi', 'cong_vien')
             else t.ten_kd ~ a.re end
  union all
  select pr.name, pr.lat::double precision, pr.lng::double precision
  from projects pr, a
  where a.re is not null and a.loai in ('du_an', 'dia_diem')
    and pr.lat is not null and pr.lng is not null
    and public.kd_ten(pr.name) ~ a.re
$function$
;

CREATE OR REPLACE FUNCTION public.next_listing_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_code text;
begin
  -- Advisory lock, KHONG `lock table`: ham nay chay trong trigger BEFORE INSERT,
  -- luc do transaction da giu ROW EXCLUSIVE tren listings. Xin them
  -- SHARE ROW EXCLUSIVE la nang cap khoa -> hai insert dong thoi deadlock.
  perform pg_advisory_xact_lock(hashtext('listing_code'));

  select 'BDS-Q5-' || lpad(
           (coalesce(max((regexp_match(code, '^BDS-Q5-([0-9]+)$'))[1]::int), 0) + 1)::text,
           4, '0')
    into v_code
    from listings
   where code ~ '^BDS-Q5-[0-9]+$';

  return v_code;
end $function$
;

CREATE OR REPLACE FUNCTION public.next_listing_code(p_property_type text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_province text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text;
  v_loc text;
  v_so text;
  v_prefix text;
  v_num int;
begin
  perform pg_advisory_xact_lock(hashtext('listing_code'));

  v_type := case lower(coalesce(p_property_type, 'nha_pho'))
    when 'chung_cu' then 'CH'
    when 'can_ho' then 'CH'
    when 'dat' then 'DAT'
    when 'dat_nen' then 'DAT'
    when 'biet_thu' then 'BT'
    when 'nha_cap4' then 'C4'
    when 'mat_bang' then 'MB'
    when 'phong_tro' then 'PT'
    else 'NP'
  end;

  -- 20260917a: chưa rõ quận → 'XX', không còn ép về Q5.
  v_loc := public.bo_dau(coalesce(p_district, p_province, ''));
  v_loc := upper(regexp_replace(v_loc, '[^a-zA-Z0-9]', '', 'g'));

  v_so := (regexp_match(v_loc, '^(?:QUAN|Q)?([0-9]{1,2})$'))[1];
  if v_so is not null then
    v_loc := 'Q' || v_so::int;
  elsif v_loc ~ 'BINHTAN' then v_loc := 'BINHTAN';
  elsif v_loc ~ 'BINHTHANH' then v_loc := 'BINHTHANH';
  elsif v_loc ~ 'TANBINH' then v_loc := 'TANBINH';
  elsif v_loc ~ 'TANPHU' then v_loc := 'TANPHU';
  elsif v_loc ~ 'GOVAP' then v_loc := 'GOVAP';
  elsif v_loc ~ 'THUDUC' then v_loc := 'THUDUC';
  elsif v_loc ~ 'BINHDUONG' then v_loc := 'BINHDUONG';
  elsif v_loc ~ 'TAYNINH' then v_loc := 'TAYNINH';
  elsif v_loc ~ 'DONGNAI' then v_loc := 'DONGNAI';
  elsif v_loc ~ 'LONGAN' then v_loc := 'LONGAN';
  end if;

  if v_loc is null or v_loc = '' then v_loc := 'XX'; end if;

  v_prefix := 'BDS-' || v_type || '-' || v_loc || '-';

  select coalesce(max((regexp_match(code, '^' || v_prefix || '([0-9]+)$'))[1]::int), 0) + 1
    into v_num
    from listings
   where code ~ ('^' || v_prefix || '[0-9]+$');

  return v_prefix || lpad(v_num::text, 4, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ngu_canh_tin(p_message_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('ai', x.sender, 'noi_dung', x.body,
           'luc', to_char(x.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')) order by x.seq), '[]'::jsonb)
    from (select m2.sender,
                 case when m2.sender = 'bot' then split_part(m2.body, E'\n💾', 1) else m2.body end as body,
                 m2.created_at, m2.seq
            from public.messages m
            join public.messages m2 on m2.conversation_id = m.conversation_id and m2.seq < m.seq
           where m.id = p_message_id
             -- 20260922f: đọc tin nhắn của người khác — chỉ admin / service_role / chính DB.
             and (public.la_admin() or coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin'))
             and not (m2.sender = 'bot' and coalesce(m2.body, '') like '💾%')
           order by m2.seq desc limit 8) x
$function$
;

CREATE OR REPLACE FUNCTION public.nguoi_noi_bo(p_zalo text)
 RETURNS TABLE(vai text, id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'ctv'::text, c.id, c.name from ctvs c
   where c.active and c.zalo_user_id = p_zalo
  union all
  select 'admin'::text, null::uuid, coalesce(a.email, 'admin') from admins a
   where a.zalo_user_id = p_zalo
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.nha_viec_nhac(p_id uuid, p_worker text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update reminders
     set locked_at = null,
         locked_by = null,
         attempts  = greatest(attempts - 1, 0)
   where id = p_id
     and status = 'pending'
     and (p_worker is null or locked_by = p_worker);
  if not found then return 'khong_co'; end if;
  return 'da_nha';
end $function$
;

CREATE OR REPLACE FUNCTION public.nhan_fact(p_key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_key
    when 'gap' then 'cần bán/cho thuê gấp hay không'
    when 'tang_phu' then 'tầng lửng, sân thượng, tầng hầm'
    else public.nhan_fact_cu(p_key) end;
$function$
;

CREATE OR REPLACE FUNCTION public.nhan_fact_cu(p_key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_key
    when 'gia' then 'giá mong muốn' when 'phuong' then 'phường'
    when 'vi_tri' then 'vị trí cụ thể (đường, số nhà, hẻm)'
    when 'loai_bds' then 'loại bất động sản' when 'phap_ly' then 'pháp lý (sổ hồng, hoàn công)'
    when 'dien_tich_dat' then 'diện tích đất' when 'dien_tich' then 'diện tích'
    when 'dien_tich_tim_tuong' then 'diện tích tim tường' when 'ket_cau' then 'kết cấu, mấy tầng'
    when 'do_rong_hem' then 'độ rộng hẻm' when 'do_rong_duong' then 'độ rộng đường'
    when 'huong' then 'hướng nhà' when 'quy_hoach' then 'tình trạng quy hoạch'
    when 'nam_xay' then 'năm xây' when 'hien_trang' then 'hiện trạng nhà' when 'tang' then 'tầng'
    when 'phi_quan_ly' then 'phí quản lý' when 'so_phong_ngu' then 'số phòng ngủ'
    when 'noi_that' then 'nội thất' when 'tho_cu' then 'diện tích thổ cư'
    when 'gia_dien_nuoc' then 'giá điện nước' when 'gio_giac' then 'giờ giấc'
    when 'mat_tien' then 'chiều ngang mặt tiền' when 'nganh_hang_phu_hop' then 'ngành hàng phù hợp'
    when 'thoi_han_thue' then 'thời hạn thuê' when 'san_vuon' then 'sân vườn'
    when 'hinh_anh' then 'hình ảnh' when 'tiem_nang' then 'tiềm năng sử dụng'
    when 'bo_sung' then 'thông tin bổ sung' when 'duyet_tin' then 'duyệt bản nháp tin'
    when 'danh_gia' then 'chấm điểm chăm sóc'
    when 'ha_tang' then 'hạ tầng lô đất (cột điện, hố ga)' when 'xay_dung' then 'xây tự do hay theo mẫu'
    when 'khu_compound' then 'khu biệt lập / an ninh' when 'tien_coc' then 'tiền cọc'
    when 'truot_gia' then 'trượt giá thuê' when 'ngung_rao_can_nao' then 'căn muốn ngưng rao'
    -- 20260909i
    when 'so_wc' then 'số WC' when 'cach_mat_tien' then 'cách mặt tiền bao xa'
    when 'hem_thong' then 'hẻm thông hay cụt, quay đầu xe' when 'ngap_nuoc' then 'có ngập nước không'
    when 'hien_trang_su_dung' then 'đang ở, cho thuê hay để trống' when 'the_chap' then 'sổ cầm tay hay đang thế chấp'
    when 'tien_ich_gan' then 'tiện ích gần (trường, công chứng, chợ)' when 'ly_do_ban' then 'lý do bán'
    when 'thuong_luong' then 'giá còn thương lượng không' when 'fit_out' then 'thời gian sửa chữa miễn phí'
    when 'view' then 'view căn hộ' when 'can_goc' then 'căn góc' when 'phi_gui_xe' then 'phí gửi xe'
    when 'so_huu' then 'sở hữu lâu dài hay 50 năm' when 'hinh_dang' then 'hình dáng đất'
    when 'mat_do_xd' then 'mật độ xây dựng' when 'tang_cao_toi_da' then 'được xây tối đa mấy tầng'
    when 'no_hau' then 'nở hậu' when 'thang_may' then 'thang máy'
    when 'so_phong' then 'số phòng cho thuê' when 'ty_le_lap_day' then 'tỷ lệ lấp đầy' when 'doanh_thu' then 'doanh thu mỗi tháng'
    when 'pccc' then 'PCCC đã nghiệm thu chưa' when 'len_tho_cu' then 'có lên thổ cư được không'
    when 'duong_vao' then 'đường vào (bê tông/đất, xe tải)' when 'nguon_nuoc' then 'nguồn nước tưới'
    when 'ranh_gioi' then 'ranh giới đã cắm cọc chưa' when 'thoi_han_su_dung' then 'thời hạn sử dụng đất'
    when 'hinh_thuc_thue_dat' then 'hình thức trả tiền thuê đất' when 'muc_dich' then 'mục đích sử dụng phù hợp'
    when 'chieu_cao' then 'chiều cao thông thủy' when 'tai_trong_san' then 'tải trọng sàn'
    when 'tram_bien_ap' then 'trạm biến áp' when 'xu_ly_nuoc_thai' then 'xử lý nước thải'
    when 'duong_container' then 'đường xe container vào được không'
    else coalesce(nullif(btrim(p_key), ''), 'thông tin')
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.nhan_viec_don_media(p_limit integer DEFAULT 50)
 RETURNS SETOF media_cleanup_queue
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.media_cleanup_queue q
     set trang_thai='dang_lam', attempts=q.attempts+1, updated_at=now()
   where q.id in (
     select id from public.media_cleanup_queue
      where (trang_thai='cho'
             or (trang_thai in ('dang_lam','loi') and updated_at < now() - interval '10 minutes'))
        and attempts < 6
        and coalesce(next_retry_at, '-infinity'::timestamptz) <= now()
      order by created_at limit p_limit for update skip locked)
  returning q.*;
$function$
;

CREATE OR REPLACE FUNCTION public.nhan_viec_nhac(p_kinds text[], p_limit integer DEFAULT 20, p_worker text DEFAULT NULL::text)
 RETURNS SETOF reminders
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.reminders r
     set locked_at = now(), locked_by = p_worker, attempts = r.attempts + 1
   where r.id in (
     select id from public.reminders
      where status='pending' and kind = any(p_kinds) and due_at <= now()
        and (locked_at is null or locked_at < now() - interval '5 minutes')
        and coalesce(next_retry_at, '-infinity'::timestamptz) <= now()
        -- Đã soạn sẵn chờ bridge Zalo clone gửi thì KHÔNG nhận lại: nhận lại
        -- là gọi model soạn cùng một tin mỗi 5 phút, mãi mãi (11/09).
        and noi_dung_gui is null
      order by due_at limit p_limit for update skip locked)
  returning r.*;
$function$
;

CREATE OR REPLACE FUNCTION public.nhung_dia_danh_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v record;
  r record;
  v_key text;
  v_txt text;
  v_md5 text;
  v_vals jsonb;
  v_gui int := 0;
  v_tran int;
  v_dung timestamptz;
  v_tu_choi boolean := false;
  v_ma int;
  v_mau text;
  v_ngay boolean := false;
  v_reset timestamp;
  v_ok boolean := false;
  v_loi int;
begin
  -- (1) Thu kết quả lượt trước. Chưa có phản hồi thì chờ; quá 10 phút thì bỏ, lượt sau gửi lại.
  -- "Đã gọi net.http_post" KHÔNG phải bằng chứng (NFR-18): chỉ ghi vector khi đọc được 200 + đúng 768 số.
  for v in
    select nv.bang, nv.khoa, nv.md5, nv.gui_luc, h.status_code, h.content, h.error_msg
      from public.nhung_viec_dia_danh nv left join net._http_response h on h.id = nv.request_id
  loop
    if v.status_code is null and v.error_msg is null then
      if v.gui_luc < now() - interval '10 minutes' then
        delete from public.nhung_viec_dia_danh where bang = v.bang and khoa = v.khoa;
      end if;
      continue;
    end if;
    if v.status_code = 200 then
      v_vals := (v.content::jsonb) -> 'embedding' -> 'values';
      if jsonb_typeof(v_vals) = 'array' and jsonb_array_length(v_vals) = 768 then
        v_ok := true;
        if v.bang = 'wards' then
          update public.wards set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where ten = v.khoa;
        elsif v.bang = 'phuong_cu' then
          update public.phuong_cu set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id::text = v.khoa;
        elsif v.bang = 'quan_cu' then
          update public.quan_cu set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where ten = v.khoa;
        else
          update public.duong set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id::text = v.khoa;
        end if;
      else
        perform public.log_loi('nhung-dia-danh-tick', 'Gemini embed trả khuôn lạ cho ' || v.bang || ' ' || v.khoa, null);
      end if;
    else
      v_tu_choi := true;
      v_ma := coalesce(v_ma, v.status_code);
      v_mau := coalesce(v_mau, left(coalesce(v.error_msg, v.content, ''), 200));
      v_ngay := v_ngay or coalesce(v.content, '') ilike '%PerDay%';
    end if;
    delete from public.nhung_viec_dia_danh where bang = v.bang and khoa = v.khoa;
  end loop;

  -- Gemini từ chối → đặt mốc tạm dừng CHUNG với nhung-tick (chung hạn mức).
  -- 20261001f: bản trước dừng CỐ ĐỊNH 4 phút và ghi sổ MỖI lần → hết 4 phút lại gửi mẻ mới vào đúng hạn mức đã cạn (50 dòng
  -- 429 / 24 giờ), và câu tìm theo nghĩa của khách cũng 429 theo. Nay giãn nhịp dùng CHUNG bộ đếm với nhung-tick
  -- (nhung_lan_loi): 2, 4, 8 … 60 phút; 402 hết tiền thì 60 phút ngay; ghi sổ lần đầu và mỗi 12 lần.
  v_loi := coalesce(nullif(public.cau_hinh('nhung_lan_loi'), '')::int, 0);
  -- 20261018d: 429 (hết hạn mức) → đổi sang khoá kế trong vòng và gửi tiếp ngay; chỉ khi cả vòng đều 429 mới giãn nhịp / dừng
  -- tới lúc Google cấp lại hạn mức như cũ.
  if v_tu_choi and v_ma = 429 and public.nhung_doi_khoa() then
    v_tu_choi := false;
  end if;
  if v_tu_choi then
    v_loi := v_loi + 1;
    v_dung := now() + make_interval(mins => case when v_ma = 402 then 60 else least(60, (2 ^ least(v_loi, 6))::int) end);
    -- 20261002c: hết hạn mức NGÀY (quotaId ...PerDay...) thì thử lại mỗi 60 phút chỉ đốt thêm 429 — dừng tới lúc Google cấp
    -- lại hạn mức (nửa đêm giờ Thái Bình Dương ≈ 07:00–08:00 UTC; lấy 08:00 cho chắc).
    if v_ngay then
      v_reset := date_trunc('day', now() at time zone 'UTC') + interval '8 hours';
      if v_reset <= (now() at time zone 'UTC') then v_reset := v_reset + interval '1 day'; end if;
      v_dung := greatest(v_dung, v_reset at time zone 'UTC');
    end if;
    update public.app_config set value = v_loi::text where key = 'nhung_lan_loi';
    update public.app_config set value = to_char(v_dung at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
     where key = 'nhung_tam_dung_den'
       and coalesce(nullif(value, '')::timestamptz, '-infinity'::timestamptz) < v_dung;
    if v_loi = 1 or v_loi % 12 = 0 then
      perform public.log_loi('nhung-dia-danh-tick',
        'Gemini embed từ chối HTTP ' || coalesce(v_ma::text, '?') || ' (lần ' || v_loi || ') — tạm dừng tới '
          || to_char(v_dung at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ' giờ VN. ' || coalesce(v_mau, ''),
        null);
    end if;
  elsif v_ok and coalesce(nullif(public.cau_hinh('nhung_khoa_vong'), '')::int, 0) > 0 then
    update public.app_config set value = '0' where key = 'nhung_khoa_vong';
    if v_loi > 0 then
      update public.app_config set value = '0' where key = 'nhung_lan_loi';
      update public.app_config set value = '' where key = 'nhung_tam_dung_den';
    end if;
  elsif v_ok and v_loi > 0 then
    update public.app_config set value = '0' where key = 'nhung_lan_loi';
    update public.app_config set value = '' where key = 'nhung_tam_dung_den';
  end if;

  -- (2) Gửi mẻ mới: quận cũ → phường mới → phường cũ → đường (không nhúng hẻm). Chỉ khi tin rao + dự án không chờ.
  if coalesce(public.cau_hinh('tim_theo_nghia'), 'tat') <> 'bat' then return; end if;
  v_dung := nullif(public.cau_hinh('nhung_tam_dung_den'), '')::timestamptz;
  if v_dung is not null and v_dung > now() then return; end if;
  if exists (select 1 from public.nhung_viec) or exists (select 1 from public.nhung_viec_du_an)
     or exists (select 1 from public.nhung_viec_dia_danh) then return; end if;
  -- 20260930e: khoá thứ hai (nếu có) gánh việc nhúng NỀN, để khoá chính còn hạn mức cho câu tìm của khách.
  -- 20261018d: xoay vòng khoá nhúng nền (app_config.nhung_khoa_ds), khoá chính GEMINI_API_KEY để dành câu tìm của khách.
  v_key := public.khoa_nhung_nen();
  if v_key is null then return; end if;
  v_tran := greatest(1, least(coalesce(nullif(public.cau_hinh('nhung_dia_danh_moi_tick'), '')::int, 20), 50));

  for r in
    (select 'quan_cu' as bang, q.ten as khoa, q.nhung_md5 from public.quan_cu q where q.nhung is null limit 50)
    union all
    (select 'wards', w.ten, w.nhung_md5 from public.wards w where w.nhung is null limit 50)
    union all
    (select 'phuong_cu', p.id::text, p.nhung_md5 from public.phuong_cu p where p.nhung is null limit 50)
    union all
    (select 'duong', d.id::text, d.nhung_md5 from public.duong d where d.nhung is null
      order by (d.loai = 'hem'), (d.tinh <> 'TP.HCM') limit 100)
  loop
    exit when v_gui >= v_tran;
    v_txt := public.van_ban_dia_danh(r.bang, r.khoa);
    if v_txt is null or length(v_txt) < 4 then continue; end if;
    v_md5 := md5(v_txt);
    if r.nhung_md5 is not distinct from v_md5 then continue; end if;
    insert into public.nhung_viec_dia_danh (bang, khoa, request_id, md5)
    values (r.bang, r.khoa, net.http_post(
      url := 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-goog-api-key', v_key),
      body := jsonb_build_object(
        'content', jsonb_build_object('parts', jsonb_build_array(jsonb_build_object('text', left(v_txt, 1500)))),
        'taskType', 'RETRIEVAL_DOCUMENT', 'outputDimensionality', 768),
      timeout_milliseconds := 20000), v_md5);
    v_gui := v_gui + 1;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.nhung_doi_khoa()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_n int;
  v_so int;
  v_vong int;
begin
  v_n := coalesce(array_length(array_remove(string_to_array(regexp_replace(coalesce(public.cau_hinh('nhung_khoa_ds'), ''), '\s', '', 'g'), ','), ''), 1), 0);
  if v_n <= 1 then return false; end if;
  v_so := (coalesce(nullif(public.cau_hinh('nhung_khoa_so'), '')::int, 1) % v_n) + 1;
  v_vong := coalesce(nullif(public.cau_hinh('nhung_khoa_vong'), '')::int, 0) + 1;
  update public.app_config set value = v_so::text where key = 'nhung_khoa_so';
  if v_vong >= v_n then
    update public.app_config set value = '0' where key = 'nhung_khoa_vong';
    return false;
  end if;
  update public.app_config set value = v_vong::text where key = 'nhung_khoa_vong';
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.nhung_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v record;
  r record;
  v_key text;
  v_txt text;
  v_md5 text;
  v_vals jsonb;
  v_gui int := 0;
  v_tran int;
  v_loi int;
  v_dung timestamptz;
  v_tu_choi boolean := false;
  v_ma int;
  v_mau text;
  v_ngay boolean := false;
  v_reset timestamp;
  v_ok boolean := false;
begin
  -- (1) Thu kết quả lượt trước (tin + dự án). Chưa có phản hồi thì chờ; quá 10 phút thì bỏ, lượt sau gửi lại.
  for v in
    select nv.listing_id as id, 'tin' as loai, nv.md5, nv.gui_luc, h.status_code, h.content, h.error_msg
      from public.nhung_viec nv left join net._http_response h on h.id = nv.request_id
    union all
    select nd.project_id, 'du_an', nd.md5, nd.gui_luc, h.status_code, h.content, h.error_msg
      from public.nhung_viec_du_an nd left join net._http_response h on h.id = nd.request_id
  loop
    if v.status_code is null and v.error_msg is null then
      if v.gui_luc < now() - interval '10 minutes' then
        if v.loai = 'tin' then delete from public.nhung_viec where listing_id = v.id;
        else delete from public.nhung_viec_du_an where project_id = v.id; end if;
      end if;
      continue;
    end if;
    if v.status_code = 200 then
      v_vals := (v.content::jsonb) -> 'embedding' -> 'values';
      if jsonb_typeof(v_vals) = 'array' and jsonb_array_length(v_vals) = 768 then
        if v.loai = 'tin' then
          update public.listings set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id = v.id;
        else
          update public.projects set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id = v.id;
        end if;
        v_ok := true;
      else
        perform public.log_loi('nhung-tick', 'Gemini embed trả khuôn lạ cho ' || v.loai || ' ' || v.id, null);
      end if;
    else
      v_tu_choi := true;
      v_ma := coalesce(v_ma, v.status_code);
      v_mau := coalesce(v_mau, left(coalesce(v.error_msg, v.content, ''), 200));
      v_ngay := v_ngay or coalesce(v.content, '') ilike '%PerDay%';
    end if;
    if v.loai = 'tin' then delete from public.nhung_viec where listing_id = v.id;
    else delete from public.nhung_viec_du_an where project_id = v.id; end if;
  end loop;

  -- Giãn nhịp: Gemini từ chối → tạm dừng 2, 4, 8 … 60 phút (402 hết tiền: 60 phút ngay); ghi sổ một lần mỗi đợt.
  v_loi := coalesce(nullif(public.cau_hinh('nhung_lan_loi'), '')::int, 0);
  -- 20261018d: 429 (hết hạn mức) → đổi sang khoá kế trong vòng và gửi tiếp ngay; chỉ khi cả vòng đều 429 mới giãn nhịp / dừng
  -- tới lúc Google cấp lại hạn mức như cũ.
  if v_tu_choi and v_ma = 429 and public.nhung_doi_khoa() then
    v_tu_choi := false;
  end if;
  if v_tu_choi then
    v_loi := v_loi + 1;
    v_dung := now() + make_interval(mins => case when v_ma = 402 then 60 else least(60, (2 ^ least(v_loi, 6))::int) end);
    -- 20261002c: hết hạn mức NGÀY (quotaId ...PerDay...) thì thử lại mỗi 60 phút chỉ đốt thêm 429 — dừng tới lúc Google cấp
    -- lại hạn mức (nửa đêm giờ Thái Bình Dương ≈ 07:00–08:00 UTC; lấy 08:00 cho chắc).
    if v_ngay then
      v_reset := date_trunc('day', now() at time zone 'UTC') + interval '8 hours';
      if v_reset <= (now() at time zone 'UTC') then v_reset := v_reset + interval '1 day'; end if;
      v_dung := greatest(v_dung, v_reset at time zone 'UTC');
    end if;
    update public.app_config set value = v_loi::text where key = 'nhung_lan_loi';
    update public.app_config set value = to_char(v_dung at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') where key = 'nhung_tam_dung_den';
    if v_loi = 1 or v_loi % 12 = 0 then
      perform public.log_loi('nhung-tick',
        'Gemini embed từ chối HTTP ' || coalesce(v_ma::text, '?') || ' (lần ' || v_loi || ') — tạm dừng tới '
          || to_char(v_dung at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ' giờ VN. ' || coalesce(v_mau, ''),
        null);
    end if;
  elsif v_ok and coalesce(nullif(public.cau_hinh('nhung_khoa_vong'), '')::int, 0) > 0 then
    update public.app_config set value = '0' where key = 'nhung_khoa_vong';
    if v_loi > 0 then
      update public.app_config set value = '0' where key = 'nhung_lan_loi';
      update public.app_config set value = '' where key = 'nhung_tam_dung_den';
    end if;
  elsif v_ok and v_loi > 0 then
    update public.app_config set value = '0' where key = 'nhung_lan_loi';
    update public.app_config set value = '' where key = 'nhung_tam_dung_den';
  end if;

  -- (2) Gửi mẻ mới: tin còn sống đổi văn bản trước, rồi dự án. Một mẻ một lúc; đang tạm dừng thì thôi.
  if coalesce(public.cau_hinh('tim_theo_nghia'), 'tat') <> 'bat' then return; end if;
  v_dung := nullif(public.cau_hinh('nhung_tam_dung_den'), '')::timestamptz;
  if v_dung is not null and v_dung > now() then return; end if;
  if exists (select 1 from public.nhung_viec) or exists (select 1 from public.nhung_viec_du_an) then return; end if;
  -- 20260930e: khoá thứ hai (nếu có) gánh việc nhúng NỀN, để khoá chính còn hạn mức cho câu tìm của khách.
  -- 20261018d: xoay vòng khoá nhúng nền (app_config.nhung_khoa_ds), khoá chính GEMINI_API_KEY để dành câu tìm của khách.
  v_key := public.khoa_nhung_nen();
  if v_key is null then return; end if;
  v_tran := greatest(1, least(coalesce(nullif(public.cau_hinh('nhung_moi_tick'), '')::int, 10), 50));

  for r in
    select l.id, l.nhung_md5 from public.listings l
     where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc')
     order by l.updated_at desc nulls last
     limit 300
  loop
    exit when v_gui >= v_tran;
    v_txt := public.van_ban_nhung(r.id);
    if v_txt is null or length(v_txt) < 10 then continue; end if;
    v_md5 := md5(v_txt);
    if r.nhung_md5 is not distinct from v_md5 then continue; end if;
    insert into public.nhung_viec (listing_id, request_id, md5)
    values (r.id, net.http_post(
      url := 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-goog-api-key', v_key),
      body := jsonb_build_object(
        'content', jsonb_build_object('parts', jsonb_build_array(jsonb_build_object('text', left(v_txt, 6000)))),
        'taskType', 'RETRIEVAL_DOCUMENT', 'outputDimensionality', 768),
      timeout_milliseconds := 20000), v_md5);
    v_gui := v_gui + 1;
  end loop;

  -- 20261009e (chủ dự án 09/10: "địa danh TP.HCM trước"): còn địa danh TP.HCM chưa nhúng (quận cũ, phường mới, phường cũ, tên
  -- đường TP.HCM không tính hẻm) thì CHỈ nhúng dự án TP.HCM; dự án tỉnh khác chờ. Hàng dự án rỗng thì nhung_dia_danh_tick mới
  -- gửi mẻ (nó đợi nhung_viec_du_an trống), nên giữ dự án tỉnh khác lại là nhường hạn mức cho địa danh TP.HCM.
  -- 20261018g (chủ dự án "vector hóa hết"): bỏ cổng "địa danh TP.HCM trước" — dự án mọi tỉnh nhúng ngay.
  for r in
    select p.id, p.nhung_md5 from public.projects p
     where (p.nhung_md5 is null or p.updated_at > coalesce(p.nhung_luc, '-infinity'::timestamptz))
     order by (p.province is distinct from 'Hồ Chí Minh'), p.is_partner desc nulls last, p.priority nulls last, p.updated_at desc nulls last
     limit 200
  loop
    exit when v_gui >= v_tran;
    v_txt := public.van_ban_du_an(r.id);
    if v_txt is null or length(v_txt) < 10 then continue; end if;
    v_md5 := md5(v_txt);
    if r.nhung_md5 is not distinct from v_md5 then continue; end if;
    insert into public.nhung_viec_du_an (project_id, request_id, md5)
    values (r.id, net.http_post(
      url := 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-goog-api-key', v_key),
      body := jsonb_build_object(
        'content', jsonb_build_object('parts', jsonb_build_array(jsonb_build_object('text', left(v_txt, 6000)))),
        'taskType', 'RETRIEVAL_DOCUMENT', 'outputDimensionality', 768),
      timeout_milliseconds := 20000), v_md5);
    v_gui := v_gui + 1;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_info_request_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code   text;
  v_seller uuid;
  v_hoi    text;
  v_dia_chi text;
  v_goi    text;
  v_gom    int;
begin
  if coalesce(new.question, '') in ('xac_nhan_lich', 'con_ban') then return new; end if;

  select l.code, l.seller_id, coalesce(nullif(btrim(l.location_raw), ''), l.ward, 'của mình')
    into v_code, v_seller, v_dia_chi from listings l where l.id = new.listing_id;
  v_hoi := coalesce(new.question, 'thông tin');

  if new.assignee = 'admin' then
    -- Gom vào việc admin còn chờ của cùng căn (nếu có).
    with g as (
      update reminders set note = note || ' · khách hỏi thêm: "' || v_hoi || '"'
       where kind = 'escalation' and status = 'pending' and listing_id = new.listing_id
         and seller_id is null and ctv_id is null
         and created_at > now() - interval '15 minutes'
      returning 1
    ) select count(*) into v_gom from g;
    if v_gom = 0 then
      insert into reminders (kind, listing_id, due_at, note)
      values ('escalation', new.listing_id, now(),
        '❓ Khách hỏi căn #' || coalesce(v_code, '?') || ': "' || v_hoi
        || '" — không có CTV nào đang hoạt động. Admin hỏi chủ rồi nhắn bot "#'
        || coalesce(v_code, '?') || ': câu trả lời".');
    end if;

  elsif new.assignee = 'ctv' then
    with g as (
      update reminders set note = note || ' · khách hỏi thêm: "' || v_hoi || '"'
       where kind = 'escalation' and status = 'pending' and listing_id = new.listing_id
         and ctv_id is not distinct from new.ctv_id
         and created_at > now() - interval '15 minutes'
      returning 1
    ) select count(*) into v_gom from g;
    if v_gom = 0 then
      if new.source = 'buyer_ask' then
        insert into reminders (kind, listing_id, ctv_id, due_at, note)
        values ('escalation', new.listing_id, new.ctv_id, now(),
          'khách hỏi #' || coalesce(v_code, '?') || ': "' || v_hoi
          || '". Anh/chị hỏi chủ rồi nhắn lại em theo mẫu "#' || coalesce(v_code, '?')
          || ': câu trả lời" trong ' || public.ctv_sla_phut() || ' phút nha, em báo khách liền.');
      else
        insert into reminders (kind, listing_id, ctv_id, due_at, note)
        values ('escalation', new.listing_id, new.ctv_id, now(),
          'khách hỏi #' || coalesce(v_code, '?') || ' · cần: ' || public.nhan_fact(v_hoi)
          || ' · tin không có chính chủ trên hệ thống → giao ctv');
      end if;
    end if;

  elsif new.assignee = 'seller' and v_seller is not null
        and coalesce(new.source, '') = 'buyer_ask' then
    select coalesce(xung_ho, 'anh/chị') into v_goi from sellers where id = v_seller;
    with g as (
      update reminders set note = note || ' Khách hỏi thêm: "' || v_hoi || '".'
       where kind = 'escalation' and status = 'pending' and listing_id = new.listing_id
         and seller_id = v_seller
         and created_at > now() - interval '15 minutes'
      returning 1
    ) select count(*) into v_gom from g;
    if v_gom = 0 then
      insert into reminders (kind, listing_id, seller_id, due_at, note)
      values ('escalation', new.listing_id, v_seller, now(),
        '💬 ' || initcap(left(v_goi, 1)) || substr(v_goi, 2) || ' ơi, có khách đang hỏi căn ' || v_dia_chi
        || ': "' || v_hoi || '". ' || initcap(left(v_goi, 1)) || substr(v_goi, 2)
        || ' trả lời giúp em ở đây để em báo khách liền nha.');
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.parse_vnd(p text)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  t    text;
  m    text[];
  v    numeric;
  ruoi boolean;
  -- 20260928f (FR-241): so viet bang CHU — cung bang, cung thu tu voi luat-tien.ts SO_CHU / soChuThanhSo.
  so_chu text[] := array['một','mốt','mot','hai','ba','bốn','bon','tư','năm','nam','lăm','sáu','sau','bảy','bẩy','bay','tám','tam','chín','chin'];
  so_so  text[] := array['1','1','1','2','3','4','4','4','5','5','5','6','6','7','7','7','8','8','9','9'];
  don_vi text := '(?=\s*(tỷ|tỏi|tỉ|ty|triệu|trieu|củ|trăm|tram)(?![[:alpha:]]))';
  i int;
begin
  if p is null or btrim(p) = '' then return null; end if;
  t := lower(p);
  -- Gia MOI m2 khong phai gia ca can (luat-tien.ts GIA_THEO_M2).
  if t ~ '(tỷ|tỉ|tỏi|triệu|trieu|tr|củ|cu|ty|ti)\s*(/|mỗi|moi|một|mot|1)\s*(m2|m²|mét|met|m\M)' then
    return null;
  end if;
  -- 20260928f (FR-241, bắn thật lx-72 "giá chín tỷ rưỡi"): chữ số → chữ số CHỈ khi đứng ngay trước đơn vị tiền,
  -- hoặc trơ cuối câu ngay sau "tỷ" ("chín tỷ hai"). "năm 2020", "bán năm căn" giữ nguyên.
  -- 20260928g: lọc trước — vòng đổi tốn ~100 lượt regex, mà parse_vnd bị gọi trong hàm quét nhiều dòng; chạy cho mọi câu
  -- làm DB Free quá giờ (bắn lại 28/09). Chỉ chạy khi có chữ số sát đơn vị tiền / sau "tỷ" / "<số> trăm" (luat-tien.ts CO_SO_CHU).
  if t ~ '(một|mốt|mot|hai|ba|bốn|bon|tư|năm|nam|lăm|sáu|sau|bảy|bẩy|bay|tám|tam|chín|chin|mười|muoi|mươi)\s*(tỷ|tỏi|tỉ|ty|triệu|trieu|củ|trăm|tram)(?![[:alpha:]])'
     or t ~ '(tỷ|tỏi|tỉ)\s+(một|mốt|mot|hai|ba|bốn|bon|tư|năm|nam|lăm|sáu|sau|bảy|bẩy|bay|tám|tam|chín|chin|mười|muoi|mươi)(?!\s*[[:alnum:]])'
     or t ~ '[0-9]\s*(trăm|tram)(?![[:alpha:]])' then
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![[:alnum:]])(mười|muoi)\s+' || so_chu[i] || don_vi, '1' || so_so[i], 'g');
    t := regexp_replace(t, '(?<![[:alnum:]])' || so_chu[i] || '\s+(mươi|muoi)(?![[:alpha:]])', so_so[i] || '0', 'g');
  end loop;
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![0-9])([1-9])0\s+' || so_chu[i] || don_vi, '\1' || so_so[i], 'g');
  end loop;
  t := regexp_replace(t, '(?<![[:alnum:]])(mười|muoi)' || don_vi, '10', 'g');
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![[:alnum:]])' || so_chu[i] || don_vi, so_so[i], 'g');
  end loop;
  t := regexp_replace(t, '([0-9])\s*(trăm|tram)(?![[:alpha:]])', '\100', 'g');
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(tỷ|tỏi|tỉ)\s+' || so_chu[i] || '(?!\s*[[:alnum:]])', '\1 ' || so_so[i], 'g');
  end loop;
  end if;
  ruoi := t ~ 'rưỡi|rươi|ruoi';

  t := regexp_replace(t, 'tỏi|tỷ|tỉ|tị|tỹ', ' _ty ', 'g');
  t := regexp_replace(t, 'triệu|trieu|củ',  ' _trieu ', 'g');

  t := regexp_replace(t, '([0-9])\s*t[yi]\s*([0-9])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*tr\s*([0-9])', '\1 _trieu \2', 'g');
  -- 13/09/2026: "1t2l" / "1t 2l" la 1 tret 2 lau, khong phai 1,2 ty (luat-tien.ts).
  t := regexp_replace(t, '([0-9])\s*t\s*([0-9]{1,3})(?![0-9[:alpha:]])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*t[yi]\M',         '\1 _ty ',   'g');
  t := regexp_replace(t, '([0-9])\s*tr\M',         '\1 _trieu ', 'g');
  t := regexp_replace(t, '([0-9])\s*t\M(?!\s*[0-9]+\s*(l|lầu|lau)\M)', '\1 _ty ', 'g');

  -- Phan le sau don vi: "5 ty 5" = 5,5 ty | "3 ty 200" = 3,2 ty.
  -- Chan hai kieu bat nham: "5 ty 50m2" (dien tich) va viec cat bot chu so
  -- ("50" bi lui ve "5" cho khop) — nen cam ca chu so lan m dung ngay sau.
  m := regexp_match(t, '([0-9]+)\s*_ty\s*([0-9]{1,3})(?![0-9.,]|\s*m)');
  if m is not null then
    return (m[1]::numeric * 1e9
            + case when length(m[2]) = 1
                   then m[2]::numeric * 1e8
                   else m[2]::numeric * 1e6 end)::bigint;
  end if;

  m := regexp_match(t, '([0-9]+[.,]?[0-9]*)\s*_ty');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric * 1e9;
    if ruoi then v := v + 5e8; end if;
    return v::bigint;
  end if;

  -- Phan le sau trieu: "3 trieu 5" = 3,5 trieu | "3 trieu 500" = 3,5 trieu.
  -- So dung sau ma la so LUONG (thang, phong, m2...) thi khong phai phan le.
  m := regexp_match(t, '([0-9]+)\s*_trieu\s*([0-9]{1,3})(?![0-9.,]|\s*(m2|m²|mét|met|m\M|phòng|phong|pn|lầu|lau|tầng|tang|tấm|tam|wc|tháng|thang|năm|nam|người|nguoi|căn|can))');
  if m is not null then
    return (m[1]::numeric * 1e6
            + case when length(m[2]) = 1
                   then m[2]::numeric * 1e5
                   else m[2]::numeric * 1e3 end)::bigint;
  end if;

  m := regexp_match(t, '([0-9]+[.,]?[0-9]*)\s*_trieu');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric * 1e6;
    if ruoi then v := v + 5e5; end if;
    return v::bigint;
  end if;

  -- 20260927b: số đồng viết đủ ("8.000.000.000", "8000000000"), không mở bằng 0, không phải số đo; 1 triệu..10 nghìn tỷ.
  m := regexp_match(t, '(?<![0-9.,])([1-9][0-9]{0,2}(?:[.,][0-9]{3}){2,}|[1-9][0-9]{6,12})(?![0-9.,]*[0-9])(?!\s*(m2|m²|mét|met|m\M))');
  if m is not null then
    v := regexp_replace(m[1], '[.,]', '', 'g')::numeric;
    if v >= 1e6 and v <= 1e13 then return v::bigint; end if;
  end if;

  return null;
exception when others then
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION public.phuong_giao_hai_duong(p_duong1 text, p_duong2 text, p_ban_kinh_m double precision DEFAULT 1200)
 RETURNS TABLE(phuong text, quan_cu text, cach_m double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select a.phuong, a.quan_cu, min(public.khoang_cach_m(a.lat, a.lng, b.lat, b.lng)) as cach_m
    from public.duong a
    join public.duong b on b.ten_khong_dau = public.bo_dau(regexp_replace(btrim(coalesce(p_duong2, '')), '\s+', ' ', 'g'))
   where a.ten_khong_dau = public.bo_dau(regexp_replace(btrim(coalesce(p_duong1, '')), '\s+', ' ', 'g'))
     and a.phuong <> '' and a.lat is not null and b.lat is not null
     and public.khoang_cach_m(a.lat, a.lng, b.lat, b.lng) <= greatest(100, least(coalesce(p_ban_kinh_m, 1200), 5000))
   group by a.phuong, a.quan_cu
   order by cach_m
   limit 5;
$function$
;

CREATE OR REPLACE FUNCTION public.quota_tieu_hao()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ngay        date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_tran_ngay   integer;
  v_hom_nay     record;
  v_gio_limit   integer := 30;
  v_ngay_limit  integer := 120;
  v_nguoi       jsonb;
  v_credit      record;
  v_tran_nguoi  integer;
  v_co_du_phong boolean := false;
  v_song           timestamptz;
  v_dang_du_phong timestamptz;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  begin
    v_tran_ngay := nullif(btrim(coalesce(public.get_secret('DAILY_MODEL_CALL_CAP'), '')), '')::integer;
  exception when others then v_tran_ngay := null; end;
  v_tran_ngay := coalesce(v_tran_ngay, 1000);

  begin
    v_co_du_phong := coalesce(btrim(coalesce(public.get_secret('GROQ_API_KEY'), '')), '') <> '';
  exception when others then v_co_du_phong := false; end;

  select coalesce(u.model_calls, 0) as luot,
         coalesce(u.in_tokens,0)+coalesce(u.out_tokens,0)+coalesce(u.cache_write_tokens,0)+coalesce(u.cache_read_tokens,0) as tokens,
         u.capped_at
    into v_hom_nay from bot_usage u where u.day = v_ngay;

  select coalesce(jsonb_agg(x order by x.trong_24h desc), '[]'::jsonb) into v_nguoi
    from (
      select q.zalo_user_id as uid, sum(q.calls) as trong_24h,
             sum(q.calls) filter (where q.gio = date_trunc('hour', now())) as trong_gio,
             exists (
               select 1 from sellers s where s.zalo_user_id = q.zalo_user_id
               union all select 1 from ctvs c where c.zalo_user_id = q.zalo_user_id
               union all select 1 from admins a where a.zalo_user_id = q.zalo_user_id
             ) as nguoi_quen
        from chat_quota q where q.gio > now() - interval '24 hours'
       group by q.zalo_user_id order by 2 desc limit 10
    ) x;

  -- Dấu SỐNG của model chính: `_shared/claude.ts` đóng khi một lượt gọi model
  -- chính TRẢ VỀ (tiết chế 2 phút/lượt). Cố ý không dùng bot_usage/cong_token:
  -- đường dự phòng Groq cũng ghi token qua đó, nên một lượt Groq thành công sẽ
  -- xoá oan cờ hết số dư của Anthropic — nói ngược lại sự thật.
  select h.at into v_song from bot_health h where h.who = 'model_chinh';

  select count(*)::int as so_loi, max(e.at) as lan_cuoi into v_credit
    from bot_errors e
   where e.at > now() - interval '24 hours'
     and e.detail ilike '%credit balance is too low%';

  select max(e.at) into v_dang_du_phong
    from bot_errors e
   where e.at > now() - interval '1 hour' and e.source ilike 'model chinh hong%';

  select count(*)::int into v_tran_nguoi from (
    select q.zalo_user_id from chat_quota q where q.gio > now() - interval '24 hours'
     group by q.zalo_user_id having sum(q.calls) >= v_ngay_limit) y;

  return jsonb_build_object(
    'ngay', v_ngay, 'luot_hom_nay', coalesce(v_hom_nay.luot, 0), 'tran_ngay', v_tran_ngay,
    'capped_at', v_hom_nay.capped_at, 'token_hom_nay', coalesce(v_hom_nay.tokens, 0),
    'tran_gio_nguoi', v_gio_limit, 'tran_ngay_nguoi', v_ngay_limit, 'he_so_nguoi_quen', 4,
    'nguoi_dot_nhieu', coalesce(v_nguoi, '[]'::jsonb),
    'so_nguoi_cham_tran', coalesce(v_tran_nguoi, 0),
    -- CÒN hết số dư chỉ khi: có lỗi trong 24h VÀ chưa có lượt gọi model chính
    -- nào thành công SAU lỗi cuối. Dòng lỗi CŨ không phải bằng chứng rằng BÂY
    -- GIỜ vẫn hỏng.
    'het_credit', coalesce(v_credit.so_loi, 0) > 0
                    and (v_song is null or v_song <= v_credit.lan_cuoi),
    'model_song_luc', v_song,
    'credit_loi_24h', coalesce(v_credit.so_loi, 0),
    'credit_lan_cuoi', v_credit.lan_cuoi,
    'co_du_phong', v_co_du_phong,
    'dang_chay_du_phong', v_dang_du_phong is not null
                            and (v_song is null or v_song <= v_dang_du_phong)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.reminders_email_voice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text; v_ten text;
begin
  if new.kind = 'escalation' and new.note like 'VOICE:%' then
    if new.buyer_id is not null then
      select b.zalo_user_id, b.name into v_uid, v_ten from buyers b where b.id = new.buyer_id;
    end if;
    perform public.email_admin('VOICE', v_uid,
      'Khách: ' || coalesce(v_ten, '(chưa biết tên)') || E'\n' || left(new.note, 500), new.listing_id);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.reminders_giu_trang_thai_ket()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.status in ('sent','cancelled','dead')
     and new.status is distinct from old.status then
    new.status  := old.status;
    new.sent_at := old.sent_at;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.reminders_hen_hoi_cam_nhan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v record;
begin
  if new.kind = 'viewing' and new.status = 'sent' and old.status is distinct from 'sent'
     and new.buyer_id is not null then
    begin
      select vw.slot, vw.listing_id, l.code
        into v
        from viewings vw left join listings l on l.id = vw.listing_id
       where vw.id = new.viewing_id;
      insert into reminders (kind, buyer_id, listing_id, viewing_id, due_at, note)
      values ('feedback', new.buyer_id, v.listing_id, new.viewing_id,
              coalesce(v.slot, new.due_at + interval '45 minutes') + interval '4 hours',
              'hỏi cảm nhận sau khi xem ' || coalesce('#' || v.code, 'nhà'))
      on conflict (viewing_id) where kind = 'feedback' and viewing_id is not null do nothing;
    exception when others then
      perform public.log_loi('reminders_hen_hoi_cam_nhan', left(sqlerrm, 400), null::integer);
    end;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.required_facts_khong_trung()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if exists (
    select 1 from required_facts r
     where r.property_type = new.property_type
       and r.fact_key = new.fact_key
       and (r.deal is null) <> (new.deal is null)
       and r.id is distinct from new.id
  ) then
    raise exception
      'required_facts: (%, %) da co ban % — them ban % nua la bot hoi hai lan',
      new.property_type, new.fact_key,
      case when new.deal is null then 'rieng theo deal' else 'chung (deal null)' end,
      case when new.deal is null then 'chung' else 'rieng' end
      using errcode = '23505';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.reset_nguoi_test(p_zalo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 20260929a (FR-245): công cụ THỬ chỉ xoá được ID thử. Trước đây hàm xoá sạch bất kỳ Zalo ID nào đưa vào — gõ nhầm một
  -- ID khách thật là mất tin, hội thoại, người bán của khách đó (không còn sao lưu, CLAUDE.md §6). Admin xoá khách thật
  -- theo yêu cầu đi đường `admin_xoa_khach` (→ `xoa_nguoi_theo_zalo`).
  if coalesce(btrim(p_zalo), '') = '' then return jsonb_build_object('ok', false, 'ly_do', 'thiếu zalo'); end if;
  if not public.la_id_thu(p_zalo) then
    return jsonb_build_object('ok', false, 'ly_do', 'không phải ID thử (la_id_thu) — chặn xoá dữ liệu thật');
  end if;
  return public.xoa_nguoi_theo_zalo(p_zalo);
end $function$
;

CREATE OR REPLACE FUNCTION public.route_info_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_seller_zalo text; v_district text; v_ctv uuid;
begin
  if new.assignee is not null then return new; end if;
  select s.zalo_user_id, l.district into v_seller_zalo, v_district
    from listings l join sellers s on s.id = l.seller_id where l.id = new.listing_id;
  if v_seller_zalo is not null then
    new.assignee := 'seller';
    if new.source = 'buyer_ask' then
      new.sla_due_at := now() + make_interval(hours => public.chu_nha_han_gio());
    end if;
    return new;
  end if;
  v_ctv := public.chon_ctv(v_district);
  if v_ctv is not null then
    new.assignee := 'ctv'; new.ctv_id := v_ctv;
    update ctvs set last_assigned_at = now() where id = v_ctv;
    if new.source = 'buyer_ask' then
      new.sla_due_at := now() + make_interval(mins => public.ctv_sla_phut());
    end if;
  else
    new.assignee := 'admin';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.seller_rank(p_type seller_type, p_active integer, p_closed integer, p_total integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_type = 'nmg' then case
      when p_active >= 10 and p_total > 0 and p_closed::numeric / p_total >= 0.05 then 'vang'
      when p_active >= 5  or  p_closed >= 1                                        then 'bac'
      else 'dong'
    end
    else case
      when p_closed >= 1 then 'vang'
      when p_active >= 1 then 'bac'
      else 'dong'
    end
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.sellers_nguon_nhan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(auth.role(), '') = 'authenticated'
     and new.seller_type <> 'unknown'
     and (tg_op = 'INSERT' or new.seller_type is distinct from old.seller_type)
     and exists (select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')) then
    new.seller_type_source := 'admin';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.so_nmg_cong_khai()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select count(*)::int from public.sellers where seller_type = 'nmg';
$function$
;

CREATE OR REPLACE FUNCTION public.soat_db_cong_khai()
 RETURNS TABLE(ma text, muc text, so integer, chi_tiet text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  -- ── 1. POLICY CÓ PHỦ HẾT KHOÁ ĐANG TỒN TẠI KHÔNG ─────────────────────────
  -- Bẫy đã nổ 10/09: policy `anon_read_listing_facts` chặn `dia_chi_chi_tiet`
  -- — một khoá KHÔNG TỒN TẠI — trong khi khoá thật mang số nhà là `vi_tri`,
  -- sinh sau policy 14 ngày. Danh sách chặn viết bằng TÊN thì mỗi khoá mới là
  -- một lần quên nữa. Phép soát này so danh sách chặn với khoá ĐANG SỐNG.
  return query
  with chan as (
    select pg_get_expr(polqual, polrelid) as q
      from pg_policy where polname = 'anon_read_listing_facts'
  ),
  -- Khoá mang địa chỉ chính xác hay liên hệ: tên chứa mấy gốc từ này.
  nhay_cam as (
    select distinct k from (
      select fact_key as k from required_facts
      union select question from listing_facts
    ) t
    -- Khớp CẢ KHOÁ, không phải chuỗi con: lượt chạy đầu của phép soát này báo
    -- `doanh_thu`, `nganh_hang_phu_hop`, `ranh_gioi` là "khoá địa chỉ" — vì cả
    -- ba đều chứa chữ "anh". Đúng cái bẫy đã cắn hôm nay ở chỗ khác (chặn chữ
    -- "anh" trần giết luôn câu rút tin thật "anh không bán nữa").
    where k ~ '^(vi_tri|dia_chi[a-z_]*|so_nha|lien_he|sdt|so_dien_thoai|hinh_anh)$'
  )
  select 'policy_phu_khoa', 'NANG', count(*)::int,
         coalesce(string_agg(n.k, ', ' order by n.k), '')
    from nhay_cam n, chan c
   where position('''' || n.k || '''' in c.q) = 0
  having count(*) > 0;

  -- ── 2. VIEW NÀO THIẾU CHẾ ĐỘ QUYỀN ───────────────────────────────────────
  -- `security_invoker` là thứ bắt view chạy bằng quyền NGƯỜI GỌI, tức RLS còn
  -- áp. Thiếu nó, view đọc xuyên RLS. Ba view từng khai `= on` (Postgres giữ
  -- nguyên văn) làm `xuat_schema()` in thiếu mệnh đề — bản phục hồi hạ cấp bảo
  -- mật đúng lúc cần nhất. Ở đây bắt CẢ HAI: thiếu hẳn, và viết khác chuẩn.
  -- Mức tuỳ CÓ CỔNG TRONG THÂN VIEW hay không: nhiều view admin tự chặn bằng
  -- `la_admin()` / `admins` ngay trong WHERE, thiếu security_invoker ở đó không
  -- phơi gì (NHE). Không có cổng nào thì đúng là đọc xuyên RLS (NANG).
  return query
  select 'view_thieu_quyen',
         case when bool_and(pg_get_viewdef(c.oid) ~ '(la_admin|admins)') then 'NHE' else 'NANG' end,
         count(*)::int,
         -- Dấu " (!)" = view KHÔNG có cổng admin trong thân, tức thiếu
         -- security_invoker là đọc xuyên RLS thật. Không có dấu = có cổng
         -- trong WHERE, thiếu thuộc tính vẫn không phơi gì.
         coalesce(string_agg(
           c.relname
             || coalesce(' (' || c.reloptions::text || ')', '')
             || case when pg_get_viewdef(c.oid) ~ '(la_admin|admins)' then '' else ' (!)' end,
           ', ' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     -- `agents_public` cố ý là definer (đã khai `security_invoker=false`).
     and not (coalesce(c.reloptions::text[], '{}') @> array['security_invoker=false'])
     and not (coalesce(c.reloptions::text[], '{}') @> array['security_invoker=true'])
     -- CHỈ tính view mà `anon`/`authenticated` ĐỌC ĐƯỢC. Lượt chạy đầu báo 13
     -- view, gần hết là view nội bộ chỉ `service_role` mở được — thiếu
     -- `security_invoker` ở đó không phơi gì cho ai. Một cổng kêu 13 dòng mỗi
     -- lần chạy là một cổng sẽ bị bỏ qua.
     and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('authenticated', c.oid, 'SELECT'))
  having count(*) > 0;

  -- ── 3. HÀM NÀO TRÙNG CHỮ KÝ ──────────────────────────────────────────────
  -- `duyet_fact_du_an` có hai overload (2 và 3 tham số) vì migration thêm bản
  -- mới mà quên `drop` bản cũ. PostgREST gọi bằng 2 tham số → PGRST203
  -- "function is not unique" → nút duyệt ở /admin chết, hàng chờ đứng im.
  -- Overload là hợp lệ trong Postgres nhưng ĐỘC với PostgREST, nên soi ở đây.
  --
  -- Overload là HỢP LỆ trong Postgres — chỉ độc khi hai chữ ký cùng tên mà bộ
  -- TÊN THAM SỐ của cái này là TẬP CON của cái kia: lúc đó một lượt gọi bằng bộ
  -- tham số nhỏ khớp cả hai, PostgREST không chọn được. Lượt chạy đầu báo 5 hàm
  -- trùng tên, trong đó `next_listing_code`, `diem_tin`… là overload lành (khác
  -- kiểu, khác bộ tên) — báo cả 5 là dạy người đọc bỏ qua cổng này.
  return query
  with ham as (
    select p.oid, p.proname,
           coalesce((select array_agg(x order by x) from unnest(p.proargnames) x), '{}') as ten_ts
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  )
  select 'ham_trung_chu_ky', 'NANG', count(*)::int,
         coalesce(string_agg(distinct a.proname, ', ' order by a.proname), '')
    from ham a join ham b on a.proname = b.proname and a.oid <> b.oid
   where a.ten_ts <@ b.ten_ts
  having count(*) > 0;

  -- ── 4. BẢNG NÀO THIẾU KHOÁ CHÍNH ─────────────────────────────────────────
  -- `required_facts` mất PK khi `20260909h` đổi constraint thành hai index
  -- partial. Bảng không khoá chính là bảng cho phép hai dòng y hệt nhau —
  -- ở bảng danh mục câu hỏi thì đó là bot hỏi hai lần cùng một thứ.
  return query
  select 'bang_thieu_khoa_chinh', 'NANG', count(*)::int,
         coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')
  having count(*) > 0;

  -- ── 5. HÀM SECURITY DEFINER THIẾU `set search_path` ──────────────────────
  -- Định nghĩa của leo thang đặc quyền cổ điển: hàm chạy bằng quyền chủ sở hữu
  -- mà để người gọi tự đặt `search_path` là người gọi chọn được hàm nào sẽ chạy.
  -- Hôm nay 0 lỗ; phép soát này giữ cho nó ở 0.
  return query
  select 'definer_thieu_search_path', 'NANG', count(*)::int,
         coalesce(string_agg(p.proname, ', ' order by p.proname), '')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search\_path=%')
  having count(*) > 0;

  -- ── 6. BẢNG BẬT RLS MÀ KHÔNG CÓ POLICY NÀO ───────────────────────────────
  -- Không policy = không ai vào (trừ service_role). Với bảng nội bộ đó là CHỦ
  -- ĐÍCH; với bảng web phải đọc thì đó là trang trắng không rõ nguyên nhân —
  -- đúng sự cố /moi-gioi 27/08 → 04/09. Mức NHẸ: liệt kê để người đọc quyết.
  return query
  select 'rls_bat_khong_policy', 'NHE', count(*)::int,
         coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
     -- Bảng nội bộ bật RLS mà không policy là CHỦ ĐÍCH (không ai vào trừ
     -- service_role) — lượt chạy đầu báo 11 bảng loại đó. Chỉ đáng kêu khi web
     -- ĐÃ ĐƯỢC CẤP quyền đọc mà RLS lại chặn sạch: đúng hình sự cố /moi-gioi
     -- trắng trang 27/08 → 04/09, và nó câm chứ không báo lỗi.
     and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('authenticated', c.oid, 'SELECT'))
  having count(*) > 0;

  -- ── 7. TRIGGER BEFORE CHẠY SAI THỨ TỰ ────────────────────────────────────
  -- Postgres bắn BEFORE-row trigger theo THỨ TỰ CHỮ CÁI của tên. `fill_code`
  -- từng chạy trước `fill_property_type` nên mã tin đọc `property_type` lúc nó
  -- còn `chua_ro` → 100% tin từ chat mang tiền tố NP. Quy ước của dự án là ép
  -- thứ tự bằng tên (`trg_y_`, `trg_z_`, `trg_zz_`); phép soát canh đúng cặp đã
  -- từng gãy, để nó không gãy lại lần nữa sau một lượt đổi tên.
  return query
  select 'trigger_sai_thu_tu', 'NANG', 1,
         'trg_listings_zz_fill_code phải chạy SAU trg_listings_fill_property_type'
   where (select t.tgname from pg_trigger t
           where t.tgrelid = 'public.listings'::regclass and not t.tgisinternal
             and t.tgname like '%fill_code%' limit 1)
         < (select t.tgname from pg_trigger t
             where t.tgrelid = 'public.listings'::regclass and not t.tgisinternal
               and t.tgname like '%fill_property_type%' limit 1);

  -- ── 8. AI NHẬN QUÁ HAI TIN CHỦ ĐỘNG MỘT NGÀY ─────────────────────────────
  -- Đây là phép soát NGHIỆP VỤ duy nhất trong tám cái, và là cái đắt nhất nếu
  -- sai: bot nhắn dồn là khách chặn OA, mất luôn đường liên lạc. Trần thiết kế
  -- là 2 tin chủ động/người/ngày (FR-130 nhịp nhắn giống người).
  --
  -- KHÔNG trả Zalo ID trần, KHÔNG trả nội dung tin — chỉ trả 4 số cuối và số
  -- đếm. Hàm này mở cho `anon` nên chính chỗ này là chỗ dễ biến một cổng kiểm
  -- thành một lỗ rò.
  return query
  with gui as (
    select coalesce(s.zalo_user_id, b.zalo_user_id) as uid, count(*) as so_tin
      from reminders r
      left join sellers s on s.id = r.seller_id
      left join buyers  b on b.id = r.buyer_id
     where r.status = 'sent' and r.sent_at > now() - interval '24 hours'
       and coalesce(s.zalo_user_id, b.zalo_user_id) is not null
     group by 1 having count(*) > 2
  )
  select 'gui_qua_hai_tin_mot_ngay', 'NANG', count(*)::int,
         coalesce(string_agg('…' || right(uid, 4) || ': ' || so_tin || ' tin', ', ' order by so_tin desc), '')
    from gui
  having count(*) > 0;
end $function$
;

CREATE OR REPLACE FUNCTION public.soat_du_lieu_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_n int; v_tom text;
begin
  select coalesce(sum(so), 0), string_agg(loi || ' ' || so, ', ' order by so desc)
    into v_n, v_tom
    from (select split_part(x.loi, ':', 1) as loi, count(*) as so from public.soat_du_lieu_tin() x group by 1) g;
  if v_n = 0 then return 0; end if;
  -- Một tin mỗi ngày: tin hôm trước chưa gửi thì thay, không chất đống.
  update reminders set status = 'cancelled'
   where kind = 'report' and status = 'pending' and note like '🔎%';
  insert into reminders (kind, due_at, note)
  values ('report', now(), format('🔎 Soát dữ liệu tin: %s chỗ nghi lỗi (%s). Xem: select * from soat_du_lieu_tin();', v_n, v_tom));
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.soat_du_lieu_tin()
 RETURNS TABLE(ma text, loi text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with tin as (
    select l.id, l.code, l.price_raw, l.price_vnd, l.location_raw, l.ward, l.area_m2, l.frontage_m, l.length_m, l.description
      from listings l join sellers s on s.id = l.seller_id
     where not public.la_id_thu(s.zalo_user_id) and l.status <> 'an'
  ), fact_moi as (
    select distinct on (f.listing_id, f.question) f.listing_id, f.question, f.answer
      from listing_facts f join tin on tin.id = f.listing_id
     order by f.listing_id, f.question, f.created_at desc
  )
  select t.code, 'gia_dinh_phi' from tin t
   where t.price_raw ~* '(^|\s)ph[ií]\s+(qu[ảa]n\s+l[ýy]|ql|d[ịi]ch\s+v[ụu]|b[ảa]o\s+tr[ìi])'
  union all
  select t.code, 'gia_khong_doc' from tin t
   where t.price_raw is not null and t.price_vnd is null
  union all
  select t.code, 'dia_chi_dinh_phuong' from tin t
   where t.location_raw ~* '(^|\s)(phường|phuong|p\.?)\s*[0-9]{1,2}\s*$'
  union all
  select t.code, 'dien_tich_lech' from tin t
   where t.area_m2 > 0 and t.frontage_m > 0 and t.length_m > 0
     and abs(t.area_m2 - t.frontage_m * t.length_m) > 0.25 * t.area_m2
  union all
  select t.code, 'fact_ca_cau:' || f.question from fact_moi f join tin t on t.id = f.listing_id
   where f.question in ('phap_ly', 'phi_quan_ly', 'ket_cau', 'vi_tri', 'huong', 'noi_that', 'tang')
     and length(f.answer) >= 40 and t.description is not null and btrim(f.answer) = btrim(t.description)
  union all
  select t.code, 'fact_tieng_dem:' || f.question from fact_moi f join tin t on t.id = f.listing_id
   where f.question in ('ket_cau', 'phap_ly', 'huong', 'vi_tri') and f.answer ~* '^(à|ừ|ờ|thôi|nhầm)[\s,]'
$function$
;

CREATE OR REPLACE FUNCTION public.stale_listing_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0; v_ir uuid; v_assignee text; v_ctv uuid;
begin
  for r in
    select l.id, l.code, l.seller_id, s.zalo_user_id as seller_zalo
      from listings l join sellers s on s.id = l.seller_id
     where l.status = 'dang_ban'
       and l.updated_at < now() - interval '30 days'
       and not exists (select 1 from property_events e
                        where e.listing_id = l.id and e.at > now() - interval '30 days')
       and not exists (select 1 from info_requests q
                        where q.listing_id = l.id and q.question = 'con_ban'
                          and q.created_at > now() - interval '30 days')
     order by l.updated_at
     limit 5
  loop
    insert into info_requests (listing_id, question, status, source)
    values (r.id, 'con_ban', 'pending', 'seller_flow')
    returning id, assignee, ctv_id into v_ir, v_assignee, v_ctv;
    if v_assignee = 'seller' then
      insert into reminders (kind, listing_id, seller_id, due_at, note)
      values ('escalation', r.id, r.seller_id, now(),
        'tin #' || coalesce(r.code, '?') || ' của mình đăng đã hơn 30 ngày. Nhà mình còn bán không ạ? Còn thì anh/chị nhắn "còn" giúp em, em giữ tin và tiếp tục tìm khách');
    else
      insert into reminders (kind, listing_id, ctv_id, due_at, note)
      values ('escalation', r.id, v_ctv, now(),
        'tin #' || coalesce(r.code, '?') || ' đăng đã 30 ngày không có khách hỏi. Anh/chị hỏi chủ nhà còn bán không rồi nhắn lại em "#' || coalesce(r.code, '?') || ': còn bán" hoặc "#' || coalesce(r.code, '?') || ': đã bán" nha');
    end if;
    n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.tao_danh_sach(p_listing_codes text[], p_title text DEFAULT NULL::text, p_buyer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_codes text[];
  v_ids   uuid[];
  v_thieu text[];
  v_row   public.curated_lists;
begin
  if auth.role() <> 'service_role' and not public.la_admin() then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  select array_agg(distinct upper(btrim(x))) into v_codes
    from unnest(coalesce(p_listing_codes, '{}')) as x
   where btrim(x) <> '';
  if v_codes is null or cardinality(v_codes) = 0 then
    raise exception 'Danh sach ma tin rong';
  end if;
  if cardinality(v_codes) > 60 then
    raise exception 'Toi da 60 tin mot danh sach';
  end if;

  select array_agg(l.id order by x.ord) into v_ids
    from unnest(v_codes) with ordinality as x(code, ord)
    join public.listings l on l.code = x.code;
  select array_agg(x.code) into v_thieu
    from unnest(v_codes) as x(code)
   where not exists (select 1 from public.listings l where l.code = x.code);
  if v_thieu is not null then
    raise exception 'Khong co tin: %', array_to_string(v_thieu, ', ');
  end if;

  insert into public.curated_lists (buyer_id, listing_ids, title)
  values (p_buyer_id, v_ids, nullif(btrim(p_title), ''))
  returning * into v_row;

  return jsonb_build_object(
    'token', v_row.token,
    'path', '/ds/' || v_row.token,
    'expires_at', v_row.expires_at,
    'n', cardinality(v_ids)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.tao_followup(p_buyer_id uuid, p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_listing uuid; v_id uuid;
begin
  select id into v_listing from listings where code = p_code;
  if v_listing is null then return false; end if;
  if exists (select 1 from reminders
              where buyer_id = p_buyer_id and kind = 'followup'
                and status in ('pending','sent')
                and created_at > now() - interval '24 hours') then
    return false;
  end if;
  insert into reminders (kind, buyer_id, listing_id, due_at, note)
  values ('followup', p_buyer_id, v_listing, now() + interval '150 minutes',
          'khách hỏi #' || p_code || ' rồi im — chủ động gửi thêm thông tin căn này')
  returning id into v_id;
  return v_id is not null;
end $function$
;

CREATE OR REPLACE FUNCTION public.ten_nhan(p_khoa text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_khoa
    when 'yen_tinh' then 'yên tĩnh'
    when 'an_ninh' then 'an ninh'
    when 'dan_tri_cao' then 'dân trí cao'
    when 'gan_cho' then 'gần chợ'
    when 'gan_truong' then 'gần trường học'
    when 'gan_benh_vien' then 'gần bệnh viện'
    when 'gan_sieu_thi' then 'gần siêu thị'
    when 'gan_cong_vien' then 'gần công viên'
    when 'gan_metro' then 'gần metro'
    when 'gan_trung_tam' then 'gần trung tâm'
    when 'moi_sua' then 'mới sửa / mới xây'
    when 'hem_thong' then 'hẻm thông'
    when 'hem_cut' then 'hẻm cụt'
    when 'khong_ngap' then 'không ngập'
    when 'xe_hoi_vao_nha' then 'xe hơi vào nhà'
    when 'xe_hoi_quay_dau' then 'xe hơi quay đầu'
    when 'thang_may' then 'có thang máy'
    when 'san_thuong' then 'sân thượng'
    when 'san_vuon' then 'sân vườn'
    when 'gac_lung' then 'có gác lửng'
    when 'noi_that_full' then 'full nội thất'
    when 'kinh_doanh' then 'kinh doanh được'
    when 'dong_tien' then 'đang cho thuê, có dòng tiền'
    when 'view_song' then 'view sông'
    when 'view_cong_vien' then 'view công viên'
    when 'can_goc' then 'căn góc / 2 mặt tiền'
    when 'ho_boi' then 'có hồ bơi'
    when 'nha_hoan_cong' then 'đã hoàn công'
    when 'tho_cu_100' then 'thổ cư 100%'
    else replace(coalesce(p_khoa, ''), '_', ' ') end;
$function$
;

CREATE OR REPLACE FUNCTION public.them_nhan_tin(p_listing_id uuid, p_nhan text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cu  text[];
  v_moi text[] := '{}'::text[];
  n     text;
begin
  if p_listing_id is null or p_nhan is null then return 0; end if;
  select nhan into v_cu from public.listings where id = p_listing_id;
  if v_cu is null then return 0; end if;
  foreach n in array p_nhan loop
    if n is not null and btrim(n) <> '' and not (n = any(v_cu)) and not (n = any(v_moi)) then
      v_moi := v_moi || n;
    end if;
  end loop;
  if array_length(v_moi, 1) is null then return 0; end if;
  update public.listings set nhan = v_cu || v_moi where id = p_listing_id;
  return array_length(v_moi, 1);
end $function$
;

CREATE OR REPLACE FUNCTION public.thu_muc_dau_uuid(p_name text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
    else null end
$function$
;

CREATE OR REPLACE FUNCTION public.tim_dia_danh(p_ten text, p_toi_da integer DEFAULT 1)
 RETURNS TABLE(loai text, ten text, ten_day_du text, phuong text, quan_cu text, khoang_cach integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with q as (
    select x.k, (select string_agg(w, ' ' order by w) from unnest(string_to_array(x.k, ' ')) w) as ks,
           least(greatest(coalesce(p_toi_da, 1), 0), 2) as toi_da
      from (select regexp_replace(public.bo_dau(btrim(coalesce(p_ten, ''))), '\s+', ' ', 'g') as k) x
  ),
  ung as (
    select 'phuong_moi'::text as loai, w.ten, w.ten_day_du, w.ten_day_du as phuong, w.quan_cu,
           public.bo_dau(w.ten) as k, true as dao
      from public.wards w
    union all
    select 'phuong_cu', p.ten, p.ten || ', ' || p.quan_cu, ww.ten_day_du, p.quan_cu,
           regexp_replace(public.bo_dau(p.ten), '^(phuong|xa|thi tran)\s+', ''), true
      from public.phuong_cu p join public.wards ww on ww.ten = p.phuong_moi
    union all
    select 'quan_cu', qc.ten, qc.ten, null, qc.ten,
           regexp_replace(public.bo_dau(qc.ten), '^(quan|huyen|thanh pho|thi xa)\s+', ''), true
      from public.quan_cu qc
    union all
    -- Một tên đường nằm ở nhiều phường: gộp một dòng; quận chỉ trả khi cả tên đường nằm trong MỘT quận cũ.
    select min(d.loai), d.ten, d.ten, null,
           case when count(distinct d.quan_cu) = 1 then min(d.quan_cu) end, min(d.ten_khong_dau), false
      from public.duong d
     where d.loai <> 'hem'
     group by d.ten
  ),
  kc as (
    select u.loai, u.ten, u.ten_day_du, u.phuong, u.quan_cu,
           case when u.k = q.k then 0
                when u.dao and position(' ' in q.k) > 0
                     and (select string_agg(w, ' ' order by w) from unnest(string_to_array(u.k, ' ')) w) = q.ks then 1
                when length(q.k) >= 6 and abs(length(u.k) - length(q.k)) <= q.toi_da
                     and levenshtein_less_equal(u.k, q.k, q.toi_da) <= q.toi_da
                  then 1 + levenshtein_less_equal(u.k, q.k, q.toi_da)
           end as khoang_cach
      from ung u, q
     where length(q.k) between 3 and 60 and q.k ~ '[a-z]'
       and abs(length(u.k) - length(q.k)) <= greatest(q.toi_da, 0)
  )
  select kc.loai, kc.ten, kc.ten_day_du, kc.phuong, kc.quan_cu, kc.khoang_cach
    from kc
   where kc.khoang_cach is not null
   order by kc.khoang_cach, kc.loai, kc.ten
   limit 20;
$function$
;

CREATE OR REPLACE FUNCTION public.tim_dia_danh_theo_nghia(p_vec double precision[], p_loai text[] DEFAULT NULL::text[], p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 5)
 RETURNS TABLE(loai text, khoa text, ten text, ten_day_du text, phuong text, quan_cu text, lat double precision, lng double precision, do_gan double precision, cach_m double precision, diem double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  with v as (select p_vec::extensions.vector(768) as q),
  ung as (
    (select 'phuong_moi'::text as loai, w.ten as khoa, w.ten, w.ten_day_du, w.ten_day_du as phuong, w.quan_cu,
            w.lat::double precision as lat, w.lng::double precision as lng, 1 - (w.nhung <=> v.q) as do_gan
       from public.wards w, v where w.nhung is not null and (p_loai is null or 'phuong_moi' = any(p_loai))
      order by w.nhung <=> v.q limit 20)
    union all
    (select 'phuong_cu', p.id::text, p.ten, p.ten || ', ' || p.quan_cu, ww.ten_day_du, p.quan_cu, p.lat, p.lng, 1 - (p.nhung <=> v.q)
       from public.phuong_cu p join public.wards ww on ww.ten = p.phuong_moi, v
      where p.nhung is not null and (p_loai is null or 'phuong_cu' = any(p_loai))
      order by p.nhung <=> v.q limit 20)
    union all
    (select 'quan_cu', q.ten, q.ten, q.ten, null, q.ten, q.lat, q.lng, 1 - (q.nhung <=> v.q)
       from public.quan_cu q, v where q.nhung is not null and (p_loai is null or 'quan_cu' = any(p_loai))
      order by q.nhung <=> v.q limit 10)
    union all
    (select d.loai, d.id::text, d.ten, d.ten || coalesce(', ' || nullif(d.phuong, ''), ''), nullif(d.phuong, ''), d.quan_cu, d.lat, d.lng,
            1 - (d.nhung <=> v.q)
       from public.duong d, v where d.nhung is not null and (p_loai is null or d.loai = any(p_loai))
      order by d.nhung <=> v.q limit 40)
    union all
    (select 'du_an', pr.id::text, pr.name, pr.name, pr.ward, pr.district, pr.lat::double precision, pr.lng::double precision,
            1 - (pr.nhung <=> v.q)
       from public.projects pr, v where pr.nhung is not null and (p_loai is null or 'du_an' = any(p_loai))
      order by pr.nhung <=> v.q limit 20)
  )
  select u.loai, u.khoa, u.ten, u.ten_day_du, u.phuong, u.quan_cu, u.lat, u.lng, u.do_gan, k.cach_m,
         u.do_gan - coalesce(least(k.cach_m / 1000.0 * 0.01, 0.2), 0) as diem
    from ung u
    -- khoang_cach_m có sẵn trả ~10.000 km (không phải NULL) khi thiếu toạ độ — chặn trước.
    cross join lateral (select case when p_lat is null or p_lng is null or u.lat is null or u.lng is null then null
                                    else public.khoang_cach_m(p_lat, p_lng, u.lat, u.lng) end as cach_m) k
   order by diem desc
   limit greatest(1, least(coalesce(p_limit, 5), 30));
$function$
;

CREATE OR REPLACE FUNCTION public.tim_du_an_theo_nghia(p_vec double precision[], p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, name text, do_gan double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select p.id, p.name, 1 - (p.nhung <=> (p_vec::extensions.vector(768)))
    from public.projects p
   where p.nhung is not null
   order by p.nhung <=> (p_vec::extensions.vector(768))
   limit greatest(1, least(coalesce(p_limit, 5), 30));
$function$
;

CREATE OR REPLACE FUNCTION public.tim_duong(p_ten text, p_quan text DEFAULT NULL::text, p_toi_da integer DEFAULT 2)
 RETURNS TABLE(ten text, khoang_cach integer, quan_cu text[], phuong text[], tinh text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with q as (
    select public.bo_dau(regexp_replace(btrim(coalesce(p_ten, '')), '\s+', ' ', 'g')) as k
  ), c as (
    select d.ten, d.quan_cu, d.phuong, d.tinh,
           levenshtein_less_equal(d.ten_khong_dau, q.k, greatest(coalesce(p_toi_da, 0), 0)) as kc
      from public.duong d, q
     where length(q.k) between 4 and 200
       and d.loai <> 'hem'
       and abs(length(d.ten_khong_dau) - length(q.k)) <= greatest(coalesce(p_toi_da, 0), 0)
  )
  select c.ten,
         min(c.kc)::integer,
         array_remove(array_agg(distinct c.quan_cu), null),
         array_remove(array_agg(distinct c.phuong), ''),
         array_agg(distinct c.tinh)
    from c
   where c.kc <= greatest(coalesce(p_toi_da, 0), 0)
   group by c.ten
   order by min(c.kc),
            (p_quan is not null and p_quan = any(array_remove(array_agg(distinct c.quan_cu), null))) desc,
            c.ten
   limit 8;
$function$
;

CREATE OR REPLACE FUNCTION public.tim_hem(p_cap_hem text[], p_duong_me text, p_phuong text DEFAULT NULL::text)
 RETURNS TABLE(ten text, so_hem text, phuong text, quan_cu text, lat double precision, lng double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select d.ten, d.so_hem, nullif(d.phuong, ''), d.quan_cu, d.lat, d.lng
    from public.duong d
    join unnest(p_cap_hem) with ordinality c(so, thu_tu) on upper(d.so_hem) = upper(c.so)
   where d.loai = 'hem'
     and public.bo_dau(coalesce(d.duong_me, '')) = public.bo_dau(regexp_replace(btrim(coalesce(p_duong_me, '')), '^(?:đường|duong)\s+(?![Ss]ố|so\s)', '', 'i'))
     and (p_phuong is null or d.phuong = p_phuong)
   order by c.thu_tu desc
   limit 10;
$function$
;

CREATE OR REPLACE FUNCTION public.tim_nghia_san_sang()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(public.cau_hinh('tim_theo_nghia'), 'tat') = 'bat'
     -- 20260930e: cron tạm dừng vì khoá NỀN chạm trần; có khoá thứ hai thì cron chạy khoá 2, câu tìm của khách vẫn còn khoá 1.
     and (coalesce(nullif(public.cau_hinh('nhung_tam_dung_den'), '')::timestamptz, '-infinity'::timestamptz) <= now()
          or public.get_secret('GEMINI_API_KEY_2') is not null)
     and public.get_secret('GEMINI_API_KEY') is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.tim_phuong_theo_nghia(p_vec double precision[], p_limit integer DEFAULT 3)
 RETURNS TABLE(ten text, ten_day_du text, quan_cu text, do_gan double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select w.ten, w.ten_day_du, w.quan_cu, 1 - (w.nhung <=> (p_vec::extensions.vector(768)))
    from public.wards w
   where w.nhung is not null
   order by w.nhung <=> (p_vec::extensions.vector(768))
   limit greatest(1, least(coalesce(p_limit, 3), 10));
$function$
;

CREATE OR REPLACE FUNCTION public.tim_tin_theo_nghia(p_vec double precision[], p_codes text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10)
 RETURNS TABLE(code text, do_gan double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select l.code, 1 - (l.nhung <=> (p_vec::extensions.vector(768)))
    from public.listings l
   where l.nhung is not null
     and l.status in ('dang_ban', 'dang_quan_tam')
     and (p_codes is null or l.code = any (p_codes))
   order by l.nhung <=> (p_vec::extensions.vector(768))
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$function$
;

CREATE OR REPLACE FUNCTION public.tin_can_geocode(p_limit integer DEFAULT 40)
 RETURNS TABLE(id uuid, location_raw text, street text, ward text, district text, quan_mac_dinh boolean, lat double precision, lng double precision, toa_do_muc text, du_an_lat double precision, du_an_lng double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select l.id, l.location_raw, l.street, l.ward, l.district,
         coalesce((l.boc_tach ->> 'quan_mac_dinh')::boolean, false),
         l.lat::double precision, l.lng::double precision, l.toa_do_muc,
         p.lat::double precision, p.lng::double precision
  from listings l
  left join projects p on p.id = l.project_id
  where (
          (l.lat is null and (coalesce(btrim(l.location_raw), '') <> ''
                              or coalesce(btrim(l.street), '') <> ''
                              or coalesce(btrim(l.ward), '') <> ''
                              or p.lat is not null
                              -- 14/09/2026: chỉ có quận/huyện THẬT (không phải mặc định)
                              or (coalesce(btrim(l.district), '') <> ''
                                  and not coalesce((l.boc_tach ->> 'quan_mac_dinh')::boolean, false))))
          or (l.lat is not null and l.tien_ich_at is null)
        )
    and (l.geocode_at is null or l.geocode_at < now() - interval '12 hours')
  order by l.geocode_at nulls first, l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 200))
$function$
;

CREATE OR REPLACE FUNCTION public.tin_cua_toi(p_listing uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from public.listings l
      join public.sellers s on s.id = l.seller_id
     where l.id = p_listing
       and s.auth_user_id = (select auth.uid())
  )
$function$
;

CREATE OR REPLACE FUNCTION public.tin_gan_moc(p_loai text, p_ten_re text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_ten text DEFAULT NULL::text, p_ban_kinh_m integer DEFAULT 1000, p_deal text DEFAULT NULL::text)
 RETURNS TABLE(listing_id uuid, code text, moc text, khoang_cach_m integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with r as (select least(3000, greatest(100, coalesce(p_ban_kinh_m, 1000)))::double precision as m),
  moc as (
    select mk.ten, mk.lat, mk.lng from public.moc_khop(p_loai, p_ten_re) mk
    union all
    select coalesce(nullif(btrim(p_ten), ''), 'địa điểm khách nói'), p_lat, p_lng
    where p_lat is not null and p_lng is not null
  ),
  l as (
    select li.id, li.code, li.lat::double precision as lat, li.lng::double precision as lng
    from listings li
    where li.lat is not null and li.lng is not null
      and li.toa_do_muc in ('duong', 'du_an', 'tay')
      and li.status in ('dang_ban', 'dang_quan_tam')
      and (p_deal is null or li.deal::text = p_deal)
  ),
  cap as (
    select l.id, l.code, moc.ten, public.khoang_cach_m(l.lat, l.lng, moc.lat, moc.lng) as d
    from l cross join r
    join moc
      on moc.lat between l.lat - r.m / 111320.0 and l.lat + r.m / 111320.0
     and moc.lng between l.lng - r.m / (111320.0 * cos(radians(l.lat)))
                     and l.lng + r.m / (111320.0 * cos(radians(l.lat)))
  )
  select distinct on (cap.id) cap.id, cap.code, cap.ten, round(cap.d)::integer
  from cap cross join r
  where cap.d <= r.m
  order by cap.id, cap.d
$function$
;

CREATE OR REPLACE FUNCTION public.tra_nominatim(p_q text, p_viewbox text DEFAULT NULL::text, p_limit integer DEFAULT 1, p_chi_tiet boolean DEFAULT false, p_cho_giay integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare res extensions.http_response; u text;
begin
  if coalesce(btrim(p_q), '') = '' or length(p_q) > 200 then return null; end if;
  if p_viewbox is not null and p_viewbox !~ '^[0-9.,-]+$' then raise exception 'viewbox không hợp lệ'; end if;
  u := 'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn'
       || '&limit=' || greatest(1, least(coalesce(p_limit, 1), 10))
       || case when p_chi_tiet then '&addressdetails=1' else '' end
       || case when p_viewbox is not null then '&viewbox=' || p_viewbox || '&bounded=1' else '' end
       || '&q=' || extensions.urlencode(p_q);
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', greatest(1, least(coalesce(p_cho_giay, 15), 20))::text);
  res := extensions.http(('GET', u, array[extensions.http_header('User-Agent', 'nhadatcc-geocoder/1.0 (admin.buyerside@nhadat.cc)')], null, null)::extensions.http_request);
  if res.status <> 200 then raise exception 'nominatim HTTP %: %', res.status, left(res.content, 120); end if;
  return res.content::jsonb;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_fact_vao_boc_tach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.listings
     set boc_tach = coalesce(boc_tach, '{}'::jsonb)
                 || jsonb_build_object(new.question, new.answer, '_cap_nhat', now())
   where id = new.listing_id;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_info_request_thong_bao_khach_hoi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_bds text;
  v_buyer text;
begin
  if new.source is distinct from 'buyer_ask' then return new; end if;

  if new.question is not null and btrim(new.question) <> '' then
    select coalesce('#' || code, '') into v_bds from listings where id = new.listing_id;
    select coalesce(name, 'Khách hàng') into v_buyer from buyers where id = new.buyer_id;

    perform public.canh_bao_ngoai(
      format('[KHÁCH HỎI BĐS] %s', coalesce(v_bds, 'Tin')),
      format('%s vừa hỏi về căn %s: "%s". Cần kiểm tra và hỗ trợ khách.',
             coalesce(v_buyer, 'Khách'),
             coalesce(v_bds, ''),
             left(new.question, 300)),
      4, false);
  end if;
  return new;
exception when others then
  perform public.log_loi('trg_info_request_thong_bao_khach_hoi', left(sqlerrm, 400), null::integer);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_listings_day_ro_ccrb()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'dang_ban' and coalesce(old.status, '') <> 'dang_ban' then
    perform public.day_ro_ccrb_toi_nmg(new.id);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_property_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_listing uuid;
begin
  if tg_table_name = 'listing_views' then
    perform public.ghi_su_kien_bds(new.listing_id, 'view', null, jsonb_build_object('auth_user_id', new.auth_user_id));
  elsif tg_table_name = 'interests' then
    perform public.ghi_su_kien_bds(new.listing_id, 'interest', new.buyer_id, null);
  elsif tg_table_name = 'info_requests' then
    if new.source = 'buyer_ask' and coalesce(new.question, '') <> 'xac_nhan_lich' then
      perform public.ghi_su_kien_bds(new.listing_id, 'asked', new.buyer_id, jsonb_build_object('question', left(new.question, 200)));
    end if;
  elsif tg_table_name = 'viewings' then
    v_listing := new.listing_id;
    if v_listing is null and new.listing_code is not null then
      select id into v_listing from listings where code = new.listing_code;
    end if;
    perform public.ghi_su_kien_bds(v_listing, 'viewing', new.buyer_id,
      jsonb_build_object('viewing_id', new.id, 'slot', new.slot, 'time_text', new.time_text));
  elsif tg_table_name = 'deals' then
    perform public.ghi_su_kien_bds(new.listing_id, 'deal', new.buyer_id, jsonb_build_object('deal_id', new.id, 'price_vnd', new.price_vnd));
  elsif tg_table_name = 'reminders' then
    if new.kind = 'match' and new.status = 'sent' and old.status is distinct from 'sent' then
      perform public.ghi_su_kien_bds(new.listing_id, 'match_sent', new.buyer_id, jsonb_build_object('reminder_id', new.id));
    end if;
  elsif tg_table_name = 'listings' then
    if tg_op = 'UPDATE' and old.status is distinct from new.status then
      perform public.ghi_su_kien_bds(new.id, 'status', null, jsonb_build_object('tu', old.status, 'den', new.status));
    end if;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_vi_tri_vao_cot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.question = 'vi_tri' and coalesce(btrim(new.answer), '') <> '' then
    update public.listings
       set location_raw = btrim(new.answer),
           street = case when street is not distinct from public.boc_ten_duong(location_raw) then null else street end
     where id = new.listing_id
       and (coalesce(btrim(location_raw), '') = ''
            or new.source ilike 'admin%' or new.source ilike 'ctv%'
            or not exists (
              select 1 from public.listing_facts f
               where f.listing_id = new.listing_id and f.question = 'vi_tri' and f.id <> new.id
                 and (f.source ilike 'admin%' or f.source ilike 'ctv%')));
  elsif new.question = 'du_an_ten' and coalesce(btrim(new.answer), '') <> '' then
    update public.listings
       set location_raw = btrim(new.answer)
     where id = new.listing_id
       and property_type is not distinct from 'chung_cu'::property_type
       and coalesce(btrim(location_raw), '') = '';
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.url_kho_anh()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select c.value from app_config c where c.key = 'storage_public_base_url';
$function$
;

CREATE OR REPLACE FUNCTION public.van_ban_dia_danh(p_bang text, p_khoa text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_bang
    when 'wards' then (
      select concat_ws('. ',
        w.ten_day_du || ', ' || w.quan_cu || ' (cũ), ' || w.tinh_cu,
        'Tên ngắn: ' || w.ten,
        (select 'Gồm ' || string_agg(p.ten || ' ' || p.quan_cu, ', ' order by p.ten) || ' (trước 07/2025)'
           from public.phuong_cu p where p.phuong_moi = w.ten))
        from public.wards w where w.ten = p_khoa)
    when 'phuong_cu' then (
      select p.ten || ', ' || p.quan_cu || ' (trước 07/2025). Nay thuộc ' || w.ten_day_du || case when p.toan_bo then '' else ' (một phần)' end
        from public.phuong_cu p join public.wards w on w.ten = p.phuong_moi where p.id::text = p_khoa)
    when 'quan_cu' then (
      select q.ten || ' (cũ, trước 07/2025), TP.HCM. Nay gồm các phường: '
             || coalesce((select string_agg(distinct w.ten_day_du, ', ') from public.wards w where w.quan_cu = q.ten), '')
        from public.quan_cu q where q.ten = p_khoa)
    when 'duong' then (
      select concat_ws(', ', case when d.loai = 'duong' then 'Đường ' || d.ten else d.ten end,
                       nullif(d.phuong, ''), case when d.quan_cu is not null then d.quan_cu || ' (cũ)' end, d.tinh)
        from public.duong d where d.id::text = p_khoa)
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.van_ban_du_an(p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.che_sdt(concat_ws('. ',
    'Dự án ' || p.name,
    case when p.developer is not null then 'Chủ đầu tư ' || p.developer end,
    nullif(concat_ws(', ', p.location_raw, p.ward, p.district, p.province), ''),
    left(p.description, 2000),
    case when p.status_text is not null then 'Tình trạng: ' || p.status_text end,
    case when p.specs ->> 'gia_dong' is not null then p.specs ->> 'gia_dong' end,
    case when p.handover is not null then 'Bàn giao ' || p.handover end,
    case when p.legal_status is not null then 'Pháp lý ' || p.legal_status end
  ))
  from public.projects p where p.id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.van_ban_nhung(p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.che_sdt(concat_ws('. ',
    (case l.deal when 'cho_thue' then 'Cho thuê ' else 'Bán ' end) ||
      case l.property_type
        when 'nha_pho' then 'nhà phố' when 'nha_cap4' then 'nhà cấp 4' when 'chung_cu' then 'căn hộ chung cư'
        when 'dat' then 'đất' when 'biet_thu' then 'biệt thự' when 'phong_tro' then 'phòng trọ'
        when 'mat_bang' then 'mặt bằng' when 'toa_nha' then 'toà nhà, căn hộ dịch vụ'
        when 'dat_nong_nghiep' then 'đất nông nghiệp' when 'dat_kinh_doanh' then 'đất kinh doanh'
        when 'kho_xuong' then 'kho xưởng' else 'bất động sản' end,
    -- 20260930c: street / ward / district đã nằm trong location_raw thì không lặp ("Trần Bình Trọng, Trần Bình Trọng").
    nullif(concat_ws(', ', l.location_raw,
      case when position(lower(l.street) in lower(coalesce(l.location_raw, ''))) = 0 then l.street end,
      case when position(lower(l.ward) in lower(coalesce(l.location_raw, ''))) = 0 then l.ward end,
      case when position(lower(l.district) in lower(coalesce(l.location_raw, ''))) = 0 then l.district end), ''),
    -- 20260923g: câu rao GỐC của người bán — chi tiết bot không lưu vào ô nào ("sau nhà có đất trống cho chó mèo
    -- chạy", "phòng nào cũng có cửa sổ") vẫn vào vector. SĐT che bởi che_sdt() bọc ngoài cả đoạn.
    case when coalesce(btrim(l.description), '') <> '' then 'Người bán tả: ' || left(l.description, 3000) end,
    (select 'Dự án ' || p.name from public.projects p where p.id = l.project_id),
    -- 20260924b: bỏ diện tích / ngang dài / giá / phòng ngủ / WC — đã LỌC CỨNG bằng cột, và lặp lại 2–3 lần (câu rao +
    -- cột + fact) làm các căn cùng khoảng giá, cùng kiểu nhà giống nhau tới 0,99; chi tiết riêng từng căn mới là nghĩa.
    l.floors_text,
    case l.access_type
      when 'mat_tien' then 'Mặt tiền đường' when 'hem_xe_tai' then 'Hẻm xe tải'
      when 'hem_xe_hoi' then 'Hẻm xe hơi' when 'hem_xe_may' then 'Hẻm xe máy' when 'hem' then 'Trong hẻm' end ||
      case when l.alley_width_m is not null then ' rộng ' || trim_scale(l.alley_width_m) || ' m' else '' end,
    case l.legal_status
      when 'so_hong_rieng' then 'Sổ hồng riêng' when 'so_hong_chung' then 'Sổ hồng chung' when 'so_hong' then 'Có sổ'
      when 'hdmb' then 'Hợp đồng mua bán' when 'giay_tay' then 'Giấy tay' end ||
      case when l.has_completion then ', đã hoàn công' else '' end,
    case when l.direction is not null then 'Hướng ' || l.direction end,
    case when l.floor is not null then 'Tầng ' || l.floor end,
    case when l.car_in_house then 'Xe hơi vào tận nhà' end,
    case when l.corner_lot then 'Căn góc' end,
    case when l.has_elevator then 'Có thang máy' end,
    -- 20260930c: nhãn ra tên tiếng Việt (ten_nhan), không còn "yen tinh, san vuon".
    case when coalesce(array_length(l.nhan, 1), 0) > 0
      then 'Đặc điểm: ' || array_to_string(array(select public.ten_nhan(x) from unnest(l.nhan) x), ', ') end,
    -- 20260924b: fact CHỮ TỰ DO — MỌI câu trả lời (bản trước lấy câu mới nhất mỗi khoá: "sân thượng" đè mất
    -- "có 1 phòng ngủ ngay tầng trệt" cùng khoá bo_sung); khoá thông số đã có cột thì bỏ (lặp).
    -- 20260930c: tên ô qua nhan_fact() ("thông tin bổ sung", "sân vườn"), không còn "bo sung", "san vuon".
    (select string_agg(public.nhan_fact(f.question) || ': ' || f.answer, '. ' order by f.question, f.dau)
       from (select question, answer, min(created_at) as dau
               from public.listing_facts
              where listing_id = l.id and coalesce(btrim(answer), '') <> ''
                and question not in ('hinh_anh', 'duyet_tin', 'danh_gia', 'xac_nhan_lich', 'con_ban', 'nhan',
                  'vi_tri', 'phuong', 'quan', 'dien_tich', 'dien_tich_dat', 'dien_tich_san', 'dien_tich_tim_tuong',
                  'gia', 'gia_raw', 'so_phong_ngu', 'so_wc', 'so_phong', 'ket_cau', 'do_rong_hem', 'do_rong_duong',
                  'phap_ly', 'mat_tien', 'huong', 'tang', 'loai_giao_dich', 'loai_bds')
              group by question, answer) f)
  ))
  from public.listings l where l.id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.viewings_bao_ctv_va_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_listing uuid; v_code text; v_ctv uuid; v_uid text; v_ten text; v_gio text; v_note text;
begin
  v_listing := new.listing_id;
  if v_listing is null and new.listing_code is not null then
    select id into v_listing from listings where code = new.listing_code;
  end if;
  select code into v_code from listings where id = v_listing;
  v_code := coalesce(v_code, new.listing_code, '?');
  select b.zalo_user_id, b.name into v_uid, v_ten from buyers b where b.id = new.buyer_id;
  select c.ctv_id into v_ctv from conversations c
   where c.buyer_id = new.buyer_id and c.ctv_id is not null
   order by c.started_at desc limit 1;
  if v_ctv is not null and not exists (select 1 from ctvs where id = v_ctv and active) then
    v_ctv := null;
  end if;
  v_gio := coalesce(to_char(new.slot at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), new.time_text, '?');

  -- (a) nhắc CTV/admin ngay
  begin
    v_note := 'Lịch xem #' || v_code || ' · ' || v_gio || ' · khách ' || coalesce(v_ten, '(chưa biết tên)')
           || ', xác nhận với chủ nhà rồi nhắn lại em "#' || v_code || ': ok ' || coalesce(to_char(new.slot at time zone 'Asia/Ho_Chi_Minh', 'HH24"h"'), 'giờ') || '" nha';
    insert into reminders (kind, buyer_id, listing_id, viewing_id, ctv_id, due_at, note)
    values ('escalation', new.buyer_id, v_listing, new.id, v_ctv, now(), v_note);
  exception when others then
    perform public.log_loi('viewings_bao_ctv', left(sqlerrm, 400), null::integer);
  end;

  -- (b) câu xác nhận lịch — assignee đặt sẵn nên `route_info_request` không
  --     đụng; sla_due_at theo CTV để `info_request_sla_tick` leo thang nếu 2h
  --     chưa ai xác nhận.
  if v_listing is not null and new.buyer_id is not null and new.status in ('proposed', 'pending') then
    begin
      insert into info_requests (listing_id, buyer_id, question, status, source, assignee, ctv_id, sla_due_at)
      values (v_listing, new.buyer_id, 'xac_nhan_lich', 'pending', 'buyer_ask',
              case when v_ctv is null then 'admin' else 'ctv' end, v_ctv,
              case when v_ctv is null then null else now() + make_interval(mins => public.ctv_sla_phut()) end);
    exception when others then
      perform public.log_loi('viewings_xac_nhan_lich', left(sqlerrm, 400), null::integer);
    end;
  end if;

  -- (c) email [VIEWING] (FR-57/81)
  perform public.email_admin('VIEWING', v_uid,
    'Khách: ' || coalesce(v_ten, '(chưa biết tên)') || E'\nGiờ hẹn: ' || v_gio
    || coalesce(E'\nSĐT khách: ' || new.phone, '') || E'\nTrạng thái: ' || new.status, v_listing);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.xoa_nguoi_theo_zalo(p_zalo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sellers uuid[]; v_buyers uuid[]; v_listings uuid[]; v_convs uuid[];
  n_listings int := 0; n_msgs int := 0; n_convs int := 0; n_sellers int := 0; n_buyers int := 0;
begin
  if coalesce(btrim(p_zalo), '') = '' then return jsonb_build_object('ok', false, 'ly_do', 'thiếu zalo'); end if;
  select coalesce(array_agg(id), '{}') into v_sellers from sellers where zalo_user_id = p_zalo;
  select coalesce(array_agg(id), '{}') into v_buyers  from buyers  where zalo_user_id = p_zalo;
  select coalesce(array_agg(id), '{}') into v_listings from listings where seller_id = any(v_sellers);
  select coalesce(array_agg(id), '{}') into v_convs from conversations where seller_id = any(v_sellers) or buyer_id = any(v_buyers);
  delete from deals where listing_id = any(v_listings) or buyer_id = any(v_buyers);
  delete from viewings where listing_id = any(v_listings) or buyer_id = any(v_buyers);
  delete from listing_views where listing_id = any(v_listings);
  delete from info_requests where listing_id = any(v_listings) or buyer_id = any(v_buyers);
  delete from messages where conversation_id = any(v_convs);
  get diagnostics n_msgs = row_count;
  delete from conversations where id = any(v_convs);
  get diagnostics n_convs = row_count;
  update sellers set active_listing_id = null where id = any(v_sellers);
  delete from listings where id = any(v_listings);
  get diagnostics n_listings = row_count;
  delete from sellers where id = any(v_sellers);
  get diagnostics n_sellers = row_count;
  delete from buyers where id = any(v_buyers);
  get diagnostics n_buyers = row_count;
  delete from chat_quota where zalo_user_id = p_zalo;
  return jsonb_build_object('ok', true, 'listings', n_listings, 'messages', n_msgs,
    'conversations', n_convs, 'sellers', n_sellers, 'buyers', n_buyers);
end $function$
;

CREATE OR REPLACE FUNCTION public.xuat_schema()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  o text;
  p text;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'Chi service_role duoc xuat schema' using errcode = '42501';
  end if;

  o := '-- Ảnh chụp schema `public` + `storage` của project nhadat-cc.' || E'\n'
    || '-- SINH TỰ ĐỘNG bởi public.xuat_schema() — ĐỪNG SỬA TAY.' || E'\n'
    || '-- Sinh lại: gọi rpc xuat_schema() rồi ghi đè file này (CLAUDE.md).' || E'\n'
    || '-- Đây là lưới an toàn để dựng lại từ số không, KHÔNG thay cho migration:' || E'\n'
    || '-- thay đổi schema vẫn phải đi qua một file trong bot/supabase/migrations/.' || E'\n'
    || '-- Sinh lúc: '
    || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI')
    || ' (giờ VN)' || E'\n';

  select coalesce(string_agg(
           format('create extension if not exists %I with schema %I;', e.extname, n.nspname),
           E'\n' order by e.extname), '')
    into p
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname <> 'plpgsql';
  o := o || E'\n-- ══ Extension ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'do $d$ begin\n  create type public.%I as enum (%s);\nexception when duplicate_object then null; end $d$;',
                  x.typname, x.vals),
           E'\n' order by x.typname), '')
    into p
  from (
    select t.typname,
           string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as vals
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
    group by t.typname
  ) x;
  o := o || E'\n-- ══ Kiểu enum ══\n' || p || E'\n';

  select coalesce(string_agg(
           format('create sequence if not exists public.%I;', c.relname),
           E'\n' order by c.relname), '')
    into p
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'S'
    -- 08/10/2026: sequence của cột IDENTITY do chính `generated … as identity` tạo — xuất riêng là đụng tên khi dựng lại.
    and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'i');
  o := o || E'\n-- ══ Sequence ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'create table if not exists public.%I (\n%s\n);', x.tbl, x.body),
           E'\n\n' order by x.tbl), '')
    into p
  from (
    select c.relname as tbl,
           string_agg(format('  %I %s%s%s',
             a.attname,
             format_type(a.atttypid, a.atttypmod),
             case when a.attnotnull and a.attidentity = '' then ' not null' else '' end,
             -- 08/10/2026 (dựng lại sau khi project cũ bị xoá): cột SINH (generated stored) từng xuất thành `default <biểu thức>`
             -- (Postgres từ chối: "cannot use column reference in DEFAULT"), cột IDENTITY thành `not null` trơn (mất tự tăng).
             case when a.attgenerated = 's'
                  then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ') stored'
                  when a.attidentity in ('a', 'd')
                  then ' generated ' || case a.attidentity when 'a' then 'always' else 'by default' end || ' as identity'
                  when ad.adbin is not null
                  then ' default ' || pg_get_expr(ad.adbin, ad.adrelid) else '' end),
             E',\n' order by a.attnum) as body
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
    where c.relkind = 'r'
    group by c.relname
  ) x;
  o := o || E'\n-- ══ Bảng ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'do $d$ begin\n  alter table public.%I add constraint %I %s;\nexception when duplicate_object then null; end $d$;',
                  c.relname, con.conname, pg_get_constraintdef(con.oid)),
           E'\n' order by c.relname, con.conname), '')
    into p
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where con.contype in ('p', 'u', 'c');
  o := o || E'\n-- ══ Ràng buộc (PK / UNIQUE / CHECK) ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'do $d$ begin\n  alter table public.%I add constraint %I %s;\nexception when duplicate_object then null; end $d$;',
                  c.relname, con.conname, pg_get_constraintdef(con.oid)),
           E'\n' order by c.relname, con.conname), '')
    into p
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where con.contype = 'f';
  o := o || E'\n-- ══ Khoá ngoại ══\n' || p || E'\n';

  select coalesce(string_agg(replace(i.indexdef, 'CREATE INDEX', 'create index if not exists')
                             || ';', E'\n' order by i.indexname), '')
    into p
  from pg_indexes i
  where i.schemaname = 'public'
    and not exists (
      select 1 from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where con.conname = i.indexname and con.contype in ('p', 'u')
    );
  o := o || E'\n-- ══ Index ══\n' || p || E'\n';

  select coalesce(string_agg(pg_get_functiondef(p2.oid) || ';', E'\n\n' order by p2.proname, p2.oid), '')
    into p
  from pg_proc p2
  join pg_namespace n on n.oid = p2.pronamespace and n.nspname = 'public'
  where p2.prokind in ('f', 'p')
    and not exists (
      select 1 from pg_depend d
      where d.objid = p2.oid and d.deptype = 'e'
    );
  o := o || E'\n-- ══ Hàm ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'create or replace view public.%I%s as\n%s',
                  c.relname,
                  -- `reloptions` giữ NGUYÊN VĂN chữ người viết: ba view khai `= on`
                  -- (public_listings, public_media, ro_hang_ban), hai view khai
                  -- `= true`. Bản cũ chỉ so đúng chuỗi `true` nên bản chụp làm RƠI
                  -- thuộc tính của ba view kia — dựng lại là chúng chạy bằng quyền
                  -- chủ sở hữu, ĐỌC XUYÊN RLS (review 10/09, mục B1). Nay nhận cả
                  -- hai cách viết, và in ra một dạng chuẩn.
                  -- 08/10/2026: in NGUYÊN VĂN mọi tuỳ chọn view. Bản cũ chỉ nhận `security_invoker=true/on` nên làm rơi
                  -- `security_invoker=false` mà agents_public cố ý khai (20260910q) — dựng lại ra view bị cổng soát kêu.
                  case when c.reloptions is not null
                       then ' with (' || array_to_string(c.reloptions, ', ') || ')' else '' end,
                  pg_get_viewdef(c.oid, true)),
           E'\n\n' order by c.oid), '')
    into p
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'v';
  o := o || E'\n-- ══ View ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'drop trigger if exists %I on public.%I;\n%s;',
                  t.tgname, c.relname, pg_get_triggerdef(t.oid)),
           E'\n' order by c.relname, t.tgname), '')
    into p
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where not t.tgisinternal;
  o := o || E'\n-- ══ Trigger ══\n' || p || E'\n';

  select coalesce(string_agg(
           format('alter table public.%I enable row level security;', c.relname),
           E'\n' order by c.relname), '')
    into p
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'r' and c.relrowsecurity;
  o := o || E'\n-- ══ Bật RLS ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'drop policy if exists %I on public.%I;\ncreate policy %I on public.%I as %s for %s to %s%s%s;',
                  pol.policyname, pol.tablename,
                  pol.policyname, pol.tablename,
                  case when pol.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                  pol.cmd,
                  array_to_string(pol.roles, ', '),
                  case when pol.qual is not null then ' using (' || pol.qual || ')' else '' end,
                  case when pol.with_check is not null then ' with check (' || pol.with_check || ')' else '' end),
           E'\n' order by pol.tablename, pol.policyname), '')
    into p
  from pg_policies pol
  where pol.schemaname = 'public';
  o := o || E'\n-- ══ Policy ══\n' || p || E'\n';

  select coalesce(string_agg(x.dong, E'\n' order by x.dong), '')
    into p
  from (
    select format('grant %s on public.%I to %I;',
                  string_agg(distinct g.privilege_type, ', '),
                  g.table_name, g.grantee) as dong
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee in ('anon', 'authenticated', 'service_role')
    group by g.table_name, g.grantee
  ) x;
  o := o || E'\n-- ══ Quyền bảng ══\n' || p || E'\n';

  select coalesce(string_agg(x.dong, E'\n' order by x.dong), '')
    into p
  from (
    select format(E'revoke all on function public.%I(%s) from public, anon, authenticated;\n%s',
                  p2.proname,
                  pg_get_function_identity_arguments(p2.oid),
                  coalesce((
                    select string_agg(format('grant execute on function public.%I(%s) to %I;',
                                             p2.proname,
                                             pg_get_function_identity_arguments(p2.oid),
                                             r.rolname), E'\n' order by r.rolname)
                    from aclexplode(p2.proacl) a
                    join pg_roles r on r.oid = a.grantee
                    where a.privilege_type = 'EXECUTE'
                      and r.rolname in ('anon', 'authenticated', 'service_role')
                  ), '-- (chỉ postgres giữ EXECUTE)')) as dong
    from pg_proc p2
    join pg_namespace n on n.oid = p2.pronamespace and n.nspname = 'public'
    where p2.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p2.oid and d.deptype = 'e')
  ) x;
  o := o || E'\n-- ══ Quyền hàm (FR-167) ══\n' || p || E'\n';

  select coalesce(string_agg(
           format('insert into storage.buckets (id, name, public) values (%L, %L, %L) on conflict (id) do nothing;',
                  b.id, b.name, b.public),
           E'\n' order by b.id), '')
    into p
  from storage.buckets b;
  o := o || E'\n-- ══ Storage bucket ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'drop policy if exists %I on storage.objects;\ncreate policy %I on storage.objects as %s for %s to %s%s%s;',
                  pol.policyname,
                  pol.policyname,
                  case when pol.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                  pol.cmd,
                  array_to_string(pol.roles, ', '),
                  case when pol.qual is not null then ' using (' || pol.qual || ')' else '' end,
                  case when pol.with_check is not null then ' with check (' || pol.with_check || ')' else '' end),
           E'\n' order by pol.policyname), '')
    into p
  from pg_policies pol
  where pol.schemaname = 'storage' and pol.tablename = 'objects';
  o := o || E'\n-- ══ Storage policy ══\n' || p || E'\n';

  select coalesce(string_agg(
           format('select cron.schedule(%L, %L, %L);', j.jobname, j.schedule, j.command),
           E'\n' order by j.jobname), '')
    into p
  from cron.job j;
  o := o || E'\n-- ══ Cron ══\n' || p || E'\n';

  return o;
end
$function$
;

CREATE OR REPLACE FUNCTION public.yeu_cau_quet_lai_zalo()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;
  update public.bridge_dang_nhap
     set yeu_cau_quet_lai = true,
         ghi_chu = 'yêu cầu đăng nhập lại từ /admin (' ||
                   coalesce((select auth.jwt()) ->> 'email', 'service_role') || ')',
         cap_nhat = now()
   where id = 1;
end $function$
;

-- ══ View ══
create or replace view public.public_media with (security_invoker=true) as
 SELECT id,
    listing_id,
    category,
    storage_path
   FROM media m
  WHERE approved;

create or replace view public.media_mo_coi_storage as
 SELECT bucket_id AS bucket,
    name AS storage_path,
    created_at
   FROM storage.objects o
  WHERE (bucket_id = ANY (ARRAY['listing-public'::text, 'listing-private'::text])) AND NOT (EXISTS ( SELECT 1
           FROM listing_media m
          WHERE m.bucket = o.bucket_id AND m.storage_path = o.name));

create or replace view public.media_mo_coi_db as
 SELECT id,
    listing_id,
    bucket,
    storage_path,
    created_at
   FROM listing_media m
  WHERE NOT (EXISTS ( SELECT 1
           FROM storage.objects o
          WHERE o.bucket_id = m.bucket AND o.name = m.storage_path));

create or replace view public.ctv_ranks as
 WITH q AS (
         SELECT q_1.ctv_id,
            count(*) AS tong,
            count(*) FILTER (WHERE q_1.status = 'answered'::request_status) AS tra_loi,
            count(*) FILTER (WHERE q_1.status = 'answered'::request_status AND q_1.answered_at <= q_1.sla_due_at) AS dung_han,
            count(*) FILTER (WHERE q_1.sla_missed_at IS NOT NULL) AS tre
           FROM info_requests q_1
          WHERE q_1.source = 'buyer_ask'::text AND q_1.assignee = 'ctv'::text AND q_1.created_at >= (now() - '30 days'::interval)
          GROUP BY q_1.ctv_id
        )
 SELECT c.id,
    c.name,
    c.active,
    COALESCE(q.tong, 0::bigint)::integer AS tong,
    COALESCE(q.tra_loi, 0::bigint)::integer AS tra_loi,
    COALESCE(q.dung_han, 0::bigint)::integer AS dung_han,
    COALESCE(q.tre, 0::bigint)::integer AS tre,
        CASE
            WHEN COALESCE(q.tong, 0::bigint) = 0 THEN NULL::numeric
            ELSE round(q.dung_han::numeric / q.tong::numeric, 2)
        END AS ty_le_dung_han,
        CASE
            WHEN COALESCE(q.tong, 0::bigint) < 3 THEN 'chua_du'::text
            WHEN (q.dung_han::numeric / q.tong::numeric) >= 0.9 THEN 'vang'::text
            WHEN (q.dung_han::numeric / q.tong::numeric) >= 0.7 THEN 'bac'::text
            ELSE 'dong'::text
        END AS rank
   FROM ctvs c
     LEFT JOIN q ON q.ctv_id = c.id
  WHERE auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = (auth.jwt() ->> 'email'::text)));

create or replace view public.hoi_thoai_thong_ke as
 WITH ngay AS (
         SELECT d.d::date AS ngay
           FROM generate_series(((now() AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date - 29)::timestamp with time zone, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date::timestamp with time zone, '1 day'::interval) d(d)
        ), ht AS (
         SELECT (c.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date AS ngay,
            count(*) FILTER (WHERE c.buyer_id IS NOT NULL) AS hoi_thoai_khach_moi,
            count(*) FILTER (WHERE c.seller_id IS NOT NULL) AS hoi_thoai_ban_moi
           FROM conversations c
          WHERE c.started_at >= (now() - '31 days'::interval)
          GROUP BY ((c.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date)
        ), co AS (
         SELECT (c.needs_human_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date AS ngay,
            count(*) AS co_nguoi_that
           FROM conversations c
          WHERE c.needs_human_at >= (now() - '31 days'::interval)
          GROUP BY ((c.needs_human_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date)
        ), tin AS (
         SELECT (m.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date AS ngay,
            count(*) FILTER (WHERE m.sender = 'buyer'::msg_sender) AS tin_khach,
            count(*) FILTER (WHERE m.sender = 'seller'::msg_sender) AS tin_nguoi_ban,
            count(*) FILTER (WHERE m.sender = 'bot'::msg_sender) AS tin_bot,
            count(*) FILTER (WHERE m.sender = ANY (ARRAY['ctv'::msg_sender, 'human'::msg_sender])) AS tin_nguoi_that
           FROM messages m
          WHERE m.created_at >= (now() - '31 days'::interval)
          GROUP BY ((m.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date)
        ), kh AS (
         SELECT (b.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date AS ngay,
            count(*) AS khach_moi
           FROM buyers b
          WHERE b.created_at >= (now() - '31 days'::interval)
          GROUP BY ((b.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date)
        )
 SELECT n.ngay,
    COALESCE(ht.hoi_thoai_khach_moi, 0::bigint)::integer AS hoi_thoai_khach_moi,
    COALESCE(ht.hoi_thoai_ban_moi, 0::bigint)::integer AS hoi_thoai_ban_moi,
    COALESCE(tin.tin_khach, 0::bigint)::integer AS tin_khach,
    COALESCE(tin.tin_nguoi_ban, 0::bigint)::integer AS tin_nguoi_ban,
    COALESCE(tin.tin_bot, 0::bigint)::integer AS tin_bot,
    COALESCE(tin.tin_nguoi_that, 0::bigint)::integer AS tin_nguoi_that,
    COALESCE(kh.khach_moi, 0::bigint)::integer AS khach_moi,
    COALESCE(co.co_nguoi_that, 0::bigint)::integer AS co_nguoi_that
   FROM ngay n
     LEFT JOIN ht ON ht.ngay = n.ngay
     LEFT JOIN tin ON tin.ngay = n.ngay
     LEFT JOIN kh ON kh.ngay = n.ngay
     LEFT JOIN co ON co.ngay = n.ngay
  WHERE auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = ((( SELECT auth.jwt() AS jwt)) ->> 'email'::text)));

create or replace view public.khach_can_nguoi_that as
 SELECT c.id AS conversation_id,
        CASE
            WHEN c.buyer_id IS NOT NULL THEN 'khach'::text
            ELSE 'nguoi_ban'::text
        END AS vai,
    c.buyer_id,
    c.seller_id,
    COALESCE(b.name, s.name) AS ten,
    COALESCE(b.zalo_user_id, s.zalo_user_id) AS zalo_user_id,
    c.needs_human_at,
    c.human_escalated_at,
    c.last_message_at,
    c.ctv_id,
    ct.name AS ctv_name,
    "left"(m.body, 120) AS tin_khach_cuoi,
    m.created_at AS tin_khach_cuoi_at
   FROM conversations c
     LEFT JOIN buyers b ON b.id = c.buyer_id
     LEFT JOIN sellers s ON s.id = c.seller_id
     LEFT JOIN ctvs ct ON ct.id = c.ctv_id
     LEFT JOIN LATERAL ( SELECT m_1.body,
            m_1.created_at
           FROM messages m_1
          WHERE m_1.conversation_id = c.id AND (m_1.sender = ANY (ARRAY['buyer'::msg_sender, 'seller'::msg_sender]))
          ORDER BY m_1.created_at DESC
         LIMIT 1) m ON true
  WHERE c.needs_human = true AND (c.human_touch_at IS NULL OR c.human_touch_at < c.needs_human_at) AND (auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = ((( SELECT auth.jwt() AS jwt)) ->> 'email'::text))));

create or replace view public.hoi_thoai_phien as
 WITH m AS (
         SELECT messages.conversation_id,
            messages.created_at,
            messages.sender,
            messages.seq,
            lag(messages.created_at) OVER (PARTITION BY messages.conversation_id ORDER BY messages.created_at, messages.seq) AS prev_at
           FROM messages
        ), g AS (
         SELECT m.conversation_id,
            m.created_at,
            m.sender,
            m.seq,
            m.prev_at,
            sum(
                CASE
                    WHEN m.prev_at IS NULL OR (m.created_at - m.prev_at) > '00:30:00'::interval THEN 1
                    ELSE 0
                END) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at, m.seq ROWS UNBOUNDED PRECEDING) AS phien
           FROM m
        )
 SELECT g.conversation_id,
    c.buyer_id,
    c.seller_id,
    g.phien::integer AS so_phien,
    min(g.created_at) AS phien_bat_dau,
    max(g.created_at) AS phien_ket_thuc,
    max(g.created_at) - min(g.created_at) AS thoi_luong,
    count(*)::integer AS so_tin,
    count(*) FILTER (WHERE g.sender = ANY (ARRAY['buyer'::msg_sender, 'seller'::msg_sender]))::integer AS so_tin_khach,
    count(*) FILTER (WHERE g.sender = 'bot'::msg_sender)::integer AS so_tin_bot,
    (array_agg(g.sender::text ORDER BY g.created_at, g.seq))[1] AS sender_dau
   FROM g
     JOIN conversations c ON c.id = g.conversation_id
  WHERE auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = ((( SELECT auth.jwt() AS jwt)) ->> 'email'::text)))
  GROUP BY g.conversation_id, c.buyer_id, c.seller_id, g.phien;

create or replace view public.hoi_thoai_nhan with (security_invoker=true) as
 SELECT c.id AS conversation_id,
        CASE
            WHEN c.human_hold OR c.needs_human AND (c.human_touch_at IS NULL OR c.human_touch_at < c.needs_human_at) THEN 'NEED_HUMAN'::text
            WHEN (EXISTS ( SELECT 1
               FROM info_requests q
              WHERE q.buyer_id = c.buyer_id AND c.buyer_id IS NOT NULL AND q.status = 'pending'::request_status)) OR (m.sender = ANY (ARRAY['buyer'::msg_sender, 'seller'::msg_sender])) AND m.created_at < (now() - '00:10:00'::interval) THEN 'WAITING_HINT'::text
            ELSE 'AI_HANDLING'::text
        END AS nhan,
        CASE
            WHEN c.human_hold THEN 'người thật đang giữ khách'::text
            WHEN c.needs_human AND (c.human_touch_at IS NULL OR c.human_touch_at < c.needs_human_at) THEN 'bot xin người thật'::text
            WHEN (EXISTS ( SELECT 1
               FROM info_requests q
              WHERE q.buyer_id = c.buyer_id AND c.buyer_id IS NOT NULL AND q.status = 'pending'::request_status)) THEN 'khách hỏi, đang chờ chủ nhà/CTV trả lời'::text
            WHEN (m.sender = ANY (ARRAY['buyer'::msg_sender, 'seller'::msg_sender])) AND m.created_at < (now() - '00:10:00'::interval) THEN 'khách nhắn > 10 phút chưa có tin bot'::text
            ELSE NULL::text
        END AS ly_do,
    m.created_at AS tin_cuoi_at,
    m.sender::text AS tin_cuoi_cua
   FROM conversations c
     LEFT JOIN LATERAL ( SELECT m1.sender,
            m1.created_at
           FROM messages m1
          WHERE m1.conversation_id = c.id
          ORDER BY m1.created_at DESC, m1.seq DESC
         LIMIT 1) m ON true
  WHERE auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = ((( SELECT auth.jwt() AS jwt)) ->> 'email'::text)));

create or replace view public.public_listings with (security_invoker=true) as
 SELECT id,
    code,
    district,
    ward,
    deal,
    area_m2,
    price_vnd,
    price_raw,
    description,
    status,
    last_confirmed_at,
    legacy_code
   FROM listings;

create or replace view public.agents_public with (security_invoker=false) as
 SELECT s.id,
    s.name,
    s.seller_type,
    s.rating_sum,
    s.rating_count,
    ( SELECT count(*) AS count
           FROM listings l
          WHERE l.seller_id = s.id AND (l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text, 'cho_thong_tin'::text]))) AS listing_count,
    seller_rank(s.seller_type, c.active::integer, c.closed::integer, c.total::integer) AS rank,
    c.closed::integer AS closed_count
   FROM sellers s
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text])) AS active,
            count(*) FILTER (WHERE l.status = 'da_chot'::text) AS closed,
            count(*) AS total
           FROM listings l
          WHERE l.seller_id = s.id) c ON true
  WHERE s.seller_type = 'nmg'::seller_type;

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
            max(q.answered_at) AS last_answer_at
           FROM info_requests q
             JOIN listings l ON l.id = q.listing_id
          WHERE l.seller_id = s.id AND (q.source = ANY (ARRAY['seller_flow'::text, 'seller_drip'::text])) AND q.answered_at >= (now() - '7 days'::interval)) d ON true
  WHERE s.seller_type = 'nmg'::seller_type AND (auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = (auth.jwt() ->> 'email'::text))));

create or replace view public.bds_hot as
 SELECT l.id AS listing_id,
    l.code,
    l.ward,
    l.district,
    l.status,
    count(e.id) FILTER (WHERE e.at > (now() - '60 days'::interval))::integer AS so_su_kien_60d,
    count(e.id) FILTER (WHERE e.at > (now() - '60 days'::interval) AND e.event_type = 'view'::text)::integer AS xem_60d,
    count(e.id) FILTER (WHERE e.at > (now() - '60 days'::interval) AND e.event_type = 'asked'::text)::integer AS hoi_60d,
    count(e.id) FILTER (WHERE e.at > (now() - '60 days'::interval) AND e.event_type = 'viewing'::text)::integer AS lich_xem_60d,
    max(e.at) AS last_event_at
   FROM listings l
     LEFT JOIN property_events e ON e.listing_id = l.id
  WHERE auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = ((( SELECT auth.jwt() AS jwt)) ->> 'email'::text)))
  GROUP BY l.id, l.code, l.ward, l.district, l.status
  ORDER BY (count(e.id) FILTER (WHERE e.at > (now() - '60 days'::interval))::integer) DESC, (max(e.at)) DESC NULLS LAST;

create or replace view public.ro_hang_ban with (security_invoker=true) as
 SELECT code AS ma,
        CASE property_type
            WHEN 'nha_pho'::property_type THEN 'nhà phố'::text
            WHEN 'nha_cap4'::property_type THEN 'nhà cấp 4'::text
            WHEN 'chung_cu'::property_type THEN 'chung cư'::text
            WHEN 'dat'::property_type THEN 'đất'::text
            WHEN 'biet_thu'::property_type THEN 'biệt thự'::text
            WHEN 'phong_tro'::property_type THEN 'phòng trọ'::text
            WHEN 'mat_bang'::property_type THEN 'mặt bằng'::text
            ELSE 'chưa rõ'::text
        END AS loai,
    ward AS phuong,
    street AS duong,
    area_m2 AS dien_tich_m2,
    round(price_vnd::numeric / 1000000000::numeric, 2) AS gia_ty,
    round(price_per_m2_vnd::numeric / 1000000::numeric, 1) AS gia_m2_trieu,
    frontage_m AS ngang,
    length_m AS dai,
    COALESCE(floors_text, floors || ' tầng'::text) AS ket_cau,
    bedrooms AS phong_ngu,
    bathrooms AS phong_tam,
        CASE legal_status
            WHEN 'so_hong_rieng'::text THEN 'sổ hồng riêng'::text
            WHEN 'so_hong_chung'::text THEN 'sổ hồng chung'::text
            WHEN 'so_hong'::text THEN 'có sổ'::text
            WHEN 'hdmb'::text THEN 'hợp đồng mua bán'::text
            WHEN 'giay_tay'::text THEN 'giấy tay'::text
            ELSE NULL::text
        END ||
        CASE
            WHEN has_completion THEN ', hoàn công'::text
            ELSE ''::text
        END AS phap_ly,
        CASE access_type
            WHEN 'mat_tien'::text THEN 'mặt tiền'::text
            WHEN 'hem_xe_tai'::text THEN 'hẻm xe tải'::text
            WHEN 'hem_xe_hoi'::text THEN 'hẻm xe hơi'::text
            WHEN 'hem_xe_may'::text THEN 'hẻm xe máy'::text
            WHEN 'hem'::text THEN 'trong hẻm'::text
            ELSE NULL::text
        END || COALESCE((' '::text || alley_width_m) || 'm'::text, ''::text) AS duong_vao,
        CASE status
            WHEN 'cho_thong_tin'::text THEN 'chờ thông tin'::text
            WHEN 'dang_ban'::text THEN 'đang bán'::text
            WHEN 'dang_quan_tam'::text THEN 'đang quan tâm'::text
            WHEN 'da_coc'::text THEN 'đã cọc'::text
            WHEN 'da_chot'::text THEN 'đã chốt'::text
            WHEN 'an'::text THEN 'ẩn'::text
            ELSE status
        END AS trang_thai,
    NULLIF(concat_ws(' · '::text,
        CASE
            WHEN property_type_source = 'suy_doan'::text THEN 'LOẠI do máy đoán'::text
            ELSE NULL::text
        END,
        CASE
            WHEN specs_source = 'boc_mo_ta'::text THEN 'THÔNG SỐ bóc từ mô tả'::text
            ELSE NULL::text
        END,
        CASE
            WHEN price_source = 'suy_doan'::text THEN 'GIÁ do máy đoán'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ward_source = 'suy_doan'::text THEN 'PHƯỜNG do máy đoán'::text
            ELSE NULL::text
        END), ''::text) AS canh_bao,
    created_at AS ngay_vao_ro,
    id
   FROM listings l
  WHERE deal = 'ban'::listing_deal;

create or replace view public.listing_missing_facts as
 SELECT l.id AS listing_id,
    rf.fact_key,
    rf.priority,
    rf.nhom
   FROM listings l
     JOIN required_facts rf ON rf.property_type = COALESCE(l.property_type, 'chua_ro'::property_type) AND (rf.deal IS NULL OR rf.deal = l.deal)
     LEFT JOIN listing_facts lf ON lf.listing_id = l.id AND lf.question = rf.fact_key
  WHERE lf.id IS NULL AND rf.nhom <> 'phu'::text AND NOT (rf.fact_key = 'ket_cau'::text AND l.floors IS NOT NULL OR (rf.fact_key = ANY (ARRAY['do_rong_hem'::text, 'do_rong_duong'::text])) AND (l.alley_width_m IS NOT NULL OR l.access_type IS NOT NULL) OR rf.fact_key = 'phap_ly'::text AND l.legal_status IS NOT NULL OR rf.fact_key = 'phap_ly'::text AND NOT l.property_type IS DISTINCT FROM 'chung_cu'::property_type AND du_an_co_phap_ly(l.project_id) OR rf.fact_key = 'huong'::text AND l.direction IS NOT NULL OR rf.fact_key = 'so_phong_ngu'::text AND l.bedrooms IS NOT NULL OR rf.fact_key = 'so_wc'::text AND l.bathrooms IS NOT NULL OR rf.fact_key = 'tang'::text AND l.floor IS NOT NULL OR (rf.fact_key = ANY (ARRAY['dien_tich'::text, 'dien_tich_dat'::text, 'dien_tich_tim_tuong'::text])) AND l.area_m2 IS NOT NULL OR rf.fact_key = 'nam_xay'::text AND l.year_built IS NOT NULL OR rf.fact_key = 'noi_that'::text AND l.furnishing IS NOT NULL OR rf.fact_key = 'mat_tien'::text AND l.frontage_m IS NOT NULL OR rf.fact_key = 'no_hau'::text AND l.rear_width_m IS NOT NULL OR rf.fact_key = 'cach_mat_tien'::text AND l.distance_to_street_m IS NOT NULL OR rf.fact_key = 'can_goc'::text AND l.corner_lot IS NOT NULL OR rf.fact_key = 'thang_may'::text AND l.has_elevator IS NOT NULL OR rf.fact_key = 'thuong_luong'::text AND l.negotiable IS NOT NULL OR rf.fact_key = 'doanh_thu'::text AND l.rent_income_vnd IS NOT NULL OR rf.fact_key = 'quy_hoach'::text AND l.planning_status IS NOT NULL OR rf.fact_key = 'gia'::text AND l.price_vnd IS NOT NULL OR rf.fact_key = 'gap'::text AND l.gap IS NOT NULL OR rf.fact_key = 'phuong'::text AND l.ward IS NOT NULL OR rf.fact_key = 'du_an_ten'::text AND l.project_id IS NOT NULL OR rf.fact_key = 'vi_tri'::text AND (COALESCE(btrim(l.location_raw), ''::text) <> ''::text OR COALESCE(btrim(l.street), ''::text) <> ''::text OR l.project_id IS NOT NULL) OR rf.fact_key = 'tang_phu'::text AND COALESCE(l.floors_text, ''::text) ~ '(lửng|sân thượng|hầm|áp mái)'::text OR rf.fact_key = 'hinh_anh'::text AND (EXISTS ( SELECT 1
           FROM listing_media m
          WHERE m.listing_id = l.id)))
  ORDER BY l.id, rf.priority, rf.fact_key;

create or replace view public.boc_tach_v with (security_invoker=true) as
 SELECT id,
    code,
    legacy_code,
    seller_id,
    status,
    deal,
    property_type,
    location_raw,
    ward,
    district,
    price_raw,
    gap,
    chu_noi_du_at,
    created_at,
    updated_at,
    boc_tach_nhom(l.*) AS nhom
   FROM listings l;

create or replace view public.project_facts_cho_duyet with (security_invoker=true) as
 SELECT f.id,
    f.project_id,
    COALESCE(p.name, f.ten_du_an) AS du_an,
    f.project_id IS NULL AS du_an_chua_co,
    p.district AS quan,
    f.khoa,
    f.gia_tri,
    f.nguon,
    f.created_at,
    l.code AS ma_tin
   FROM project_facts f
     LEFT JOIN projects p ON p.id = f.project_id
     LEFT JOIN listings l ON l.id = f.listing_id
  WHERE f.trang_thai = 'cho_duyet'::text
  ORDER BY f.created_at DESC;

create or replace view public.listing_photos_v with (security_invoker=true) as
 SELECT l.code,
    (((url_kho_anh() || '/'::text) || m.bucket) || '/'::text) || m.storage_path AS url,
    m.storage_path AS path,
    m.sort_order,
    m.is_cover,
    m.created_at,
    m.listing_id,
    m.id AS media_id,
    l.legacy_code
   FROM listing_media m
     JOIN listings l ON l.id = m.listing_id
  WHERE m.bucket = 'listing-public'::text AND (l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text, 'da_chot'::text]));

create or replace view public.seller_ranks with (security_invoker=true) as
 SELECT s.id,
    s.name,
    s.seller_type,
    COALESCE(c.active, 0::bigint)::integer AS active_count,
    COALESCE(c.closed, 0::bigint)::integer AS closed_count,
    COALESCE(c.total, 0::bigint)::integer AS total_count,
    hang_theo_diem((d.j ->> 'diem'::text)::integer) AS rank,
    (d.j ->> 'diem'::text)::integer AS diem_nguoi_rao,
    (d.j ->> 'diem_tb'::text)::numeric AS diem_hoan_chinh,
    (d.j ->> 'diem_phan_hoi'::text)::integer AS diem_phan_hoi,
    (d.j ->> 'so_luot_phan_hoi'::text)::integer AS so_luot_phan_hoi,
        CASE
            WHEN s.seller_type = 'nmg'::seller_type THEN (chuan_nmg(s.id) ->> 'dat_chuan'::text)::boolean
            ELSE NULL::boolean
        END AS dat_chuan_nmg,
    s.ten_tro_ly
   FROM sellers s
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text])) AS active,
            count(*) FILTER (WHERE l.status = 'da_chot'::text) AS closed,
            count(*) AS total
           FROM listings l
          WHERE l.seller_id = s.id) c ON true
     LEFT JOIN LATERAL ( SELECT diem_nguoi_ban(s.id) AS j) d ON true;

-- ══ Trigger ══
drop trigger if exists trg_bot_errors_het_tien on public.bot_errors;
CREATE TRIGGER trg_bot_errors_het_tien AFTER INSERT ON public.bot_errors FOR EACH ROW EXECUTE FUNCTION bat_het_tien_api();
drop trigger if exists trg_conversations_assign_ctv on public.conversations;
CREATE TRIGGER trg_conversations_assign_ctv BEFORE INSERT ON public.conversations FOR EACH ROW EXECUTE FUNCTION assign_ctv_round_robin();
drop trigger if exists trg_conversations_email_upset on public.conversations;
CREATE TRIGGER trg_conversations_email_upset AFTER UPDATE OF needs_human ON public.conversations FOR EACH ROW EXECUTE FUNCTION conversations_email_upset();
drop trigger if exists trg_deals_chan_xoa on public.deals;
CREATE TRIGGER trg_deals_chan_xoa BEFORE DELETE ON public.deals FOR EACH ROW EXECUTE FUNCTION deals_chan_xoa_da_chot();
drop trigger if exists trg_pe_deals on public.deals;
CREATE TRIGGER trg_pe_deals AFTER INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION trg_property_event();
drop trigger if exists trg_huy_nhac_khi_da_tra_loi on public.info_requests;
CREATE TRIGGER trg_huy_nhac_khi_da_tra_loi AFTER UPDATE OF status ON public.info_requests FOR EACH ROW EXECUTE FUNCTION huy_nhac_khi_da_tra_loi();
drop trigger if exists trg_info_request_bao_lai_khach on public.info_requests;
CREATE TRIGGER trg_info_request_bao_lai_khach AFTER UPDATE OF status ON public.info_requests FOR EACH ROW EXECUTE FUNCTION info_request_bao_lai_khach();
drop trigger if exists trg_info_request_set_active_listing on public.info_requests;
CREATE TRIGGER trg_info_request_set_active_listing AFTER INSERT ON public.info_requests FOR EACH ROW EXECUTE FUNCTION info_request_set_active_listing();
drop trigger if exists trg_info_request_thong_bao_khach_hoi on public.info_requests;
CREATE TRIGGER trg_info_request_thong_bao_khach_hoi AFTER INSERT ON public.info_requests FOR EACH ROW EXECUTE FUNCTION trg_info_request_thong_bao_khach_hoi();
drop trigger if exists trg_notify_info_request_escalation on public.info_requests;
CREATE TRIGGER trg_notify_info_request_escalation AFTER INSERT ON public.info_requests FOR EACH ROW EXECUTE FUNCTION notify_info_request_escalation();
drop trigger if exists trg_pe_info_requests on public.info_requests;
CREATE TRIGGER trg_pe_info_requests AFTER INSERT ON public.info_requests FOR EACH ROW EXECUTE FUNCTION trg_property_event();
drop trigger if exists trg_route_info_request on public.info_requests;
CREATE TRIGGER trg_route_info_request BEFORE INSERT ON public.info_requests FOR EACH ROW EXECUTE FUNCTION route_info_request();
drop trigger if exists trg_pe_interests on public.interests;
CREATE TRIGGER trg_pe_interests AFTER INSERT ON public.interests FOR EACH ROW EXECUTE FUNCTION trg_property_event();
drop trigger if exists trg_listing_facts_soat_phuong on public.listing_facts;
CREATE TRIGGER trg_listing_facts_soat_phuong AFTER INSERT ON public.listing_facts FOR EACH ROW WHEN ((new.question = 'phuong'::text)) EXECUTE FUNCTION listing_facts_soat_phuong();
drop trigger if exists trg_listing_facts_sync_cols on public.listing_facts;
CREATE TRIGGER trg_listing_facts_sync_cols AFTER INSERT ON public.listing_facts FOR EACH ROW EXECUTE FUNCTION listing_facts_sync_cols();
drop trigger if exists trg_listing_facts_sync_deal on public.listing_facts;
CREATE TRIGGER trg_listing_facts_sync_deal AFTER INSERT ON public.listing_facts FOR EACH ROW EXECUTE FUNCTION listing_facts_sync_deal();
drop trigger if exists trg_listing_facts_sync_gap on public.listing_facts;
CREATE TRIGGER trg_listing_facts_sync_gap AFTER INSERT ON public.listing_facts FOR EACH ROW EXECUTE FUNCTION listing_facts_sync_gap();
drop trigger if exists trg_zz_fact_vao_boc_tach on public.listing_facts;
CREATE TRIGGER trg_zz_fact_vao_boc_tach AFTER INSERT ON public.listing_facts FOR EACH ROW EXECUTE FUNCTION trg_fact_vao_boc_tach();
drop trigger if exists trg_zz_vi_tri_vao_cot on public.listing_facts;
CREATE TRIGGER trg_zz_vi_tri_vao_cot AFTER INSERT ON public.listing_facts FOR EACH ROW EXECUTE FUNCTION trg_vi_tri_vao_cot();
drop trigger if exists trg_listing_media_bia on public.listing_media;
CREATE TRIGGER trg_listing_media_bia AFTER INSERT OR DELETE OR UPDATE OF is_cover, bucket, sort_order ON public.listing_media FOR EACH ROW EXECUTE FUNCTION listing_media_giu_bia();
drop trigger if exists trg_listing_media_don_file on public.listing_media;
CREATE TRIGGER trg_listing_media_don_file AFTER DELETE OR UPDATE OF bucket, storage_path ON public.listing_media FOR EACH ROW EXECUTE FUNCTION listing_media_xep_hang_don();
drop trigger if exists trg_pe_listing_views on public.listing_views;
CREATE TRIGGER trg_pe_listing_views AFTER INSERT ON public.listing_views FOR EACH ROW EXECUTE FUNCTION trg_property_event();
drop trigger if exists trg_listings_bao_can_da_chot on public.listings;
CREATE TRIGGER trg_listings_bao_can_da_chot AFTER UPDATE OF status ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_bao_can_da_chot();
drop trigger if exists trg_listings_bao_tin_moi_khop on public.listings;
CREATE TRIGGER trg_listings_bao_tin_moi_khop AFTER INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_bao_tin_moi_khop();
drop trigger if exists trg_listings_chuan_hoa_cot on public.listings;
CREATE TRIGGER trg_listings_chuan_hoa_cot BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_chuan_hoa_cot();
drop trigger if exists trg_listings_day_ro_ccrb on public.listings;
CREATE TRIGGER trg_listings_day_ro_ccrb AFTER UPDATE OF status ON public.listings FOR EACH ROW EXECUTE FUNCTION trg_listings_day_ro_ccrb();
drop trigger if exists trg_listings_fill_property_type on public.listings;
CREATE TRIGGER trg_listings_fill_property_type BEFORE INSERT OR UPDATE OF description, location_raw, property_type ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_fill_property_type();
drop trigger if exists trg_listings_price_vnd on public.listings;
CREATE TRIGGER trg_listings_price_vnd BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_set_price_vnd();
drop trigger if exists trg_listings_zz_doi_ma on public.listings;
CREATE TRIGGER trg_listings_zz_doi_ma BEFORE UPDATE OF district, property_type ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_doi_ma_theo_quan_loai();
drop trigger if exists trg_listings_zz_fill_code on public.listings;
CREATE TRIGGER trg_listings_zz_fill_code BEFORE INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_fill_code();
drop trigger if exists trg_listings_zz_toa_do on public.listings;
CREATE TRIGGER trg_listings_zz_toa_do BEFORE UPDATE OF location_raw, street, ward, district, project_id ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_xoa_toa_do_khi_doi_dia_chi();
drop trigger if exists trg_pe_listings on public.listings;
CREATE TRIGGER trg_pe_listings AFTER UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION trg_property_event();
drop trigger if exists trg_y_listings_boc_thong_so on public.listings;
CREATE TRIGGER trg_y_listings_boc_thong_so BEFORE INSERT OR UPDATE OF description, location_raw, property_type ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_boc_thong_so();
drop trigger if exists trg_z_listings_normalize_status on public.listings;
CREATE TRIGGER trg_z_listings_normalize_status BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_normalize_status();
drop trigger if exists trg_zz_listings_dang_tin on public.listings;
CREATE TRIGGER trg_zz_listings_dang_tin BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION listings_quyet_dinh_dang_tin();
drop trigger if exists trg_media_cleanup_trang_thai on public.media_cleanup_queue;
CREATE TRIGGER trg_media_cleanup_trang_thai BEFORE UPDATE ON public.media_cleanup_queue FOR EACH ROW EXECUTE FUNCTION media_cleanup_giu_trang_thai();
drop trigger if exists trg_messages_bump_last_message on public.messages;
CREATE TRIGGER trg_messages_bump_last_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION messages_bump_last_message();
drop trigger if exists trg_pe_reminders on public.reminders;
CREATE TRIGGER trg_pe_reminders AFTER UPDATE OF status ON public.reminders FOR EACH ROW EXECUTE FUNCTION trg_property_event();
drop trigger if exists trg_reminders_email_voice on public.reminders;
CREATE TRIGGER trg_reminders_email_voice AFTER INSERT ON public.reminders FOR EACH ROW EXECUTE FUNCTION reminders_email_voice();
drop trigger if exists trg_reminders_hen_hoi_cam_nhan on public.reminders;
CREATE TRIGGER trg_reminders_hen_hoi_cam_nhan AFTER UPDATE OF status ON public.reminders FOR EACH ROW EXECUTE FUNCTION reminders_hen_hoi_cam_nhan();
drop trigger if exists trg_reminders_trang_thai on public.reminders;
CREATE TRIGGER trg_reminders_trang_thai BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION reminders_giu_trang_thai_ket();
drop trigger if exists trg_required_facts_khong_trung on public.required_facts;
CREATE TRIGGER trg_required_facts_khong_trung BEFORE INSERT OR UPDATE OF property_type, fact_key, deal ON public.required_facts FOR EACH ROW EXECUTE FUNCTION required_facts_khong_trung();
drop trigger if exists trg_sellers_nguon_nhan on public.sellers;
CREATE TRIGGER trg_sellers_nguon_nhan BEFORE INSERT OR UPDATE OF seller_type ON public.sellers FOR EACH ROW EXECUTE FUNCTION sellers_nguon_nhan();
drop trigger if exists trg_pe_viewings on public.viewings;
CREATE TRIGGER trg_pe_viewings AFTER INSERT ON public.viewings FOR EACH ROW EXECUTE FUNCTION trg_property_event();
drop trigger if exists trg_viewings_bao_ctv_va_email on public.viewings;
CREATE TRIGGER trg_viewings_bao_ctv_va_email AFTER INSERT ON public.viewings FOR EACH ROW EXECUTE FUNCTION viewings_bao_ctv_va_email();

-- ══ Bật RLS ══
alter table public.admins enable row level security;
alter table public.app_config enable row level security;
alter table public.boc_tach_bong enable row level security;
alter table public.bot_errors enable row level security;
alter table public.bot_health enable row level security;
alter table public.bot_usage enable row level security;
alter table public.bot_usage_model enable row level security;
alter table public.bridge_dang_nhap enable row level security;
alter table public.buyers enable row level security;
alter table public.chat_quota enable row level security;
alter table public.conversations enable row level security;
alter table public.ctvs enable row level security;
alter table public.curated_lists enable row level security;
alter table public.deals enable row level security;
alter table public.du_an_kien_thuc enable row level security;
alter table public.duong enable row level security;
alter table public.giao_lo enable row level security;
alter table public.info_requests enable row level security;
alter table public.interests enable row level security;
alter table public.listing_facts enable row level security;
alter table public.listing_media enable row level security;
alter table public.listing_views enable row level security;
alter table public.listings enable row level security;
alter table public.media enable row level security;
alter table public.media_cleanup_queue enable row level security;
alter table public.messages enable row level security;
alter table public.nhung_viec enable row level security;
alter table public.nhung_viec_dia_danh enable row level security;
alter table public.nhung_viec_du_an enable row level security;
alter table public.phuong_cu enable row level security;
alter table public.project_facts enable row level security;
alter table public.projects enable row level security;
alter table public.property_events enable row level security;
alter table public.quan_cu enable row level security;
alter table public.ratings_log enable row level security;
alter table public.reminders enable row level security;
alter table public.required_facts enable row level security;
alter table public.sellers enable row level security;
alter table public.tien_ich enable row level security;
alter table public.viewings enable row level security;
alter table public.wards enable row level security;

-- ══ Policy ══
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins as permissive for SELECT to authenticated using ((email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)));
drop policy if exists bot_errors_admin_read on public.bot_errors;
create policy bot_errors_admin_read on public.bot_errors as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists bot_health_admin_read on public.bot_health;
create policy bot_health_admin_read on public.bot_health as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists bot_usage_admin_read on public.bot_usage;
create policy bot_usage_admin_read on public.bot_usage as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists bot_usage_model_admin_read on public.bot_usage_model;
create policy bot_usage_model_admin_read on public.bot_usage_model as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists bridge_dang_nhap_admin_read on public.bridge_dang_nhap;
create policy bridge_dang_nhap_admin_read on public.bridge_dang_nhap as permissive for SELECT to authenticated using (la_admin());
drop policy if exists buyers_admin_read on public.buyers;
create policy buyers_admin_read on public.buyers as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists buyers_admin_update on public.buyers;
create policy buyers_admin_update on public.buyers as permissive for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text))))) with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists buyers_self_insert on public.buyers;
create policy buyers_self_insert on public.buyers as permissive for INSERT to authenticated with check ((auth_user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists buyers_self_read on public.buyers;
create policy buyers_self_read on public.buyers as permissive for SELECT to authenticated using ((auth_user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists buyers_self_update on public.buyers;
create policy buyers_self_update on public.buyers as permissive for UPDATE to authenticated using ((auth_user_id = ( SELECT auth.uid() AS uid))) with check ((auth_user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists conversations_admin_read on public.conversations;
create policy conversations_admin_read on public.conversations as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists ctvs_admin_read on public.ctvs;
create policy ctvs_admin_read on public.ctvs as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists info_requests_admin_read on public.info_requests;
create policy info_requests_admin_read on public.info_requests as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists interests_admin_delete on public.interests;
create policy interests_admin_delete on public.interests as permissive for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists interests_admin_insert on public.interests;
create policy interests_admin_insert on public.interests as permissive for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists interests_admin_select on public.interests;
create policy interests_admin_select on public.interests as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists anon_read_listing_facts on public.listing_facts;
create policy anon_read_listing_facts on public.listing_facts as permissive for SELECT to anon, authenticated using (((question <> ALL (ARRAY['hinh_anh'::text, 'dia_chi_chi_tiet'::text, 'vi_tri'::text, 'dia_chi'::text, 'so_nha'::text, 'lien_he'::text, 'so_dien_thoai'::text, 'nguoi_dung_ten'::text, 'dong_so_huu_voi'::text])) AND (EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_facts.listing_id) AND (l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text, 'da_chot'::text])))))));
drop policy if exists listing_media_admin_all on public.listing_media;
create policy listing_media_admin_all on public.listing_media as permissive for ALL to authenticated using (la_admin()) with check (la_admin());
drop policy if exists listing_media_doc_cong_khai on public.listing_media;
create policy listing_media_doc_cong_khai on public.listing_media as permissive for SELECT to anon, authenticated using (((bucket = 'listing-public'::text) AND (EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_media.listing_id) AND (l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text, 'da_chot'::text])))))));
drop policy if exists listing_media_own_delete on public.listing_media;
create policy listing_media_own_delete on public.listing_media as permissive for DELETE to authenticated using (((bucket = 'listing-public'::text) AND tin_cua_toi(listing_id)));
drop policy if exists listing_media_own_insert on public.listing_media;
create policy listing_media_own_insert on public.listing_media as permissive for INSERT to authenticated with check (((bucket = 'listing-public'::text) AND tin_cua_toi(listing_id)));
drop policy if exists listing_media_own_read on public.listing_media;
create policy listing_media_own_read on public.listing_media as permissive for SELECT to authenticated using (((bucket = 'listing-public'::text) AND tin_cua_toi(listing_id)));
drop policy if exists views_own_all on public.listing_views;
create policy views_own_all on public.listing_views as permissive for ALL to authenticated using ((auth_user_id = ( SELECT auth.uid() AS uid))) with check ((auth_user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists anon_read_listings on public.listings;
create policy anon_read_listings on public.listings as permissive for SELECT to anon, authenticated using ((status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text, 'da_chot'::text])));
drop policy if exists listings_admin_delete on public.listings;
create policy listings_admin_delete on public.listings as permissive for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists listings_admin_read on public.listings;
create policy listings_admin_read on public.listings as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists listings_admin_update on public.listings;
create policy listings_admin_update on public.listings as permissive for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text))))) with check (true);
drop policy if exists listings_own_insert on public.listings;
create policy listings_own_insert on public.listings as permissive for INSERT to authenticated with check (((status = 'cho_thong_tin'::text) AND (seller_id IN ( SELECT sellers.id
   FROM sellers
  WHERE (sellers.auth_user_id = ( SELECT auth.uid() AS uid))))));
drop policy if exists listings_own_read on public.listings;
create policy listings_own_read on public.listings as permissive for SELECT to authenticated using ((seller_id IN ( SELECT sellers.id
   FROM sellers
  WHERE (sellers.auth_user_id = ( SELECT auth.uid() AS uid)))));
drop policy if exists anon_read_media on public.media;
create policy anon_read_media on public.media as permissive for SELECT to anon, authenticated using (((approved = true) AND (category = 'photo'::text)));
drop policy if exists messages_admin_read on public.messages;
create policy messages_admin_read on public.messages as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists project_facts_admin_read on public.project_facts;
create policy project_facts_admin_read on public.project_facts as permissive for SELECT to authenticated using (la_admin());
drop policy if exists anon_read_projects on public.projects;
create policy anon_read_projects on public.projects as permissive for SELECT to anon, authenticated using (true);
drop policy if exists property_events_admin_read on public.property_events;
create policy property_events_admin_read on public.property_events as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists reminders_admin_read on public.reminders;
create policy reminders_admin_read on public.reminders as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists reminders_admin_update on public.reminders;
create policy reminders_admin_update on public.reminders as permissive for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text))))) with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists sellers_admin_read on public.sellers;
create policy sellers_admin_read on public.sellers as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists sellers_admin_update on public.sellers;
create policy sellers_admin_update on public.sellers as permissive for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text))))) with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));
drop policy if exists sellers_self_insert on public.sellers;
create policy sellers_self_insert on public.sellers as permissive for INSERT to authenticated with check ((auth_user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists sellers_self_read on public.sellers;
create policy sellers_self_read on public.sellers as permissive for SELECT to authenticated using ((auth_user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists tien_ich_admin_read on public.tien_ich;
create policy tien_ich_admin_read on public.tien_ich as permissive for SELECT to authenticated using (la_admin());
drop policy if exists viewings_admin_read on public.viewings;
create policy viewings_admin_read on public.viewings as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE (a.email = (( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));

-- ══ Quyền bảng ══
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.admins to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.agents_public to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.app_config to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bds_hot to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.boc_tach_bong to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.boc_tach_v to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bot_errors to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bot_health to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bot_usage to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bot_usage_model to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bridge_dang_nhap to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.buyers to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.chat_quota to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conversations to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ctv_ranks to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ctv_ranks to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ctvs to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.curated_lists to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.deals to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.du_an_kien_thuc to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.duong to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.giao_lo to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hoi_thoai_nhan to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hoi_thoai_phien to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hoi_thoai_thong_ke to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.info_requests to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.interests to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.khach_can_nguoi_that to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.listing_facts to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.listing_media to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.listing_missing_facts to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.listing_photos_v to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.listing_views to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.listings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.media to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.media_cleanup_queue to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.media_mo_coi_db to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.media_mo_coi_storage to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.messages to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nhung_viec to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nhung_viec_dia_danh to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nhung_viec_du_an to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nmg_hoat_dong to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nmg_hoat_dong to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.phuong_cu to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.project_facts to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.project_facts_cho_duyet to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.projects to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.property_events to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.public_listings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.public_media to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.quan_cu to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ratings_log to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reminders to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.required_facts to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ro_hang_ban to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.seller_ranks to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.sellers to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tien_ich to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.viewings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.wards to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.admins to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.buyers to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.conversations to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.ctvs to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.deals to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.info_requests to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.interests to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.listing_facts to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.listing_views to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.listings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.media to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.messages to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.projects to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.reminders to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.required_facts to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.sellers to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE on public.viewings to authenticated;
grant DELETE, INSERT, SELECT on public.listing_media to authenticated;
grant REFERENCES, SELECT, TRIGGER on public.admins to anon;
grant REFERENCES, SELECT, TRIGGER on public.agents_public to anon;
grant REFERENCES, SELECT, TRIGGER on public.agents_public to authenticated;
grant REFERENCES, SELECT, TRIGGER on public.buyers to anon;
grant REFERENCES, SELECT, TRIGGER on public.conversations to anon;
grant REFERENCES, SELECT, TRIGGER on public.ctvs to anon;
grant REFERENCES, SELECT, TRIGGER on public.deals to anon;
grant REFERENCES, SELECT, TRIGGER on public.info_requests to anon;
grant REFERENCES, SELECT, TRIGGER on public.interests to anon;
grant REFERENCES, SELECT, TRIGGER on public.listing_facts to anon;
grant REFERENCES, SELECT, TRIGGER on public.listing_views to anon;
grant REFERENCES, SELECT, TRIGGER on public.listings to anon;
grant REFERENCES, SELECT, TRIGGER on public.media to anon;
grant REFERENCES, SELECT, TRIGGER on public.messages to anon;
grant REFERENCES, SELECT, TRIGGER on public.projects to anon;
grant REFERENCES, SELECT, TRIGGER on public.property_events to authenticated;
grant REFERENCES, SELECT, TRIGGER on public.reminders to anon;
grant REFERENCES, SELECT, TRIGGER on public.required_facts to anon;
grant REFERENCES, SELECT, TRIGGER on public.sellers to anon;
grant REFERENCES, SELECT, TRIGGER on public.viewings to anon;
grant SELECT on public.bds_hot to authenticated;
grant SELECT on public.boc_tach_v to authenticated;
grant SELECT on public.bot_errors to authenticated;
grant SELECT on public.bot_health to authenticated;
grant SELECT on public.bot_usage to authenticated;
grant SELECT on public.bot_usage_model to authenticated;
grant SELECT on public.bridge_dang_nhap to authenticated;
grant SELECT on public.hoi_thoai_nhan to authenticated;
grant SELECT on public.hoi_thoai_phien to authenticated;
grant SELECT on public.hoi_thoai_thong_ke to authenticated;
grant SELECT on public.khach_can_nguoi_that to authenticated;
grant SELECT on public.listing_media to anon;
grant SELECT on public.listing_photos_v to anon;
grant SELECT on public.listing_photos_v to authenticated;
grant SELECT on public.project_facts to authenticated;
grant SELECT on public.project_facts_cho_duyet to authenticated;
grant SELECT on public.ro_hang_ban to authenticated;
grant SELECT on public.seller_ranks to authenticated;
grant SELECT on public.tien_ich to authenticated;

-- ══ Quyền hàm (FR-167) ══
revoke all on function public.admin_cap_nhat_khach(p_buyer_id uuid, p_preferences jsonb, p_notes text) from public, anon, authenticated;
grant execute on function public.admin_cap_nhat_khach(p_buyer_id uuid, p_preferences jsonb, p_notes text) to authenticated;
grant execute on function public.admin_cap_nhat_khach(p_buyer_id uuid, p_preferences jsonb, p_notes text) to service_role;
revoke all on function public.admin_dang_tin(p jsonb) from public, anon, authenticated;
grant execute on function public.admin_dang_tin(p jsonb) to authenticated;
grant execute on function public.admin_dang_tin(p jsonb) to service_role;
revoke all on function public.admin_gan_bds_quan_tam(p_buyer_id uuid, p_code text) from public, anon, authenticated;
grant execute on function public.admin_gan_bds_quan_tam(p_buyer_id uuid, p_code text) to authenticated;
grant execute on function public.admin_gan_bds_quan_tam(p_buyer_id uuid, p_code text) to service_role;
revoke all on function public.admin_khoi_phuc_lan_xoa(p_lan bigint) from public, anon, authenticated;
grant execute on function public.admin_khoi_phuc_lan_xoa(p_lan bigint) to authenticated;
grant execute on function public.admin_khoi_phuc_lan_xoa(p_lan bigint) to service_role;
revoke all on function public.admin_xoa_bds_quan_tam(p_buyer_id uuid, p_listing_id uuid) from public, anon, authenticated;
grant execute on function public.admin_xoa_bds_quan_tam(p_buyer_id uuid, p_listing_id uuid) to authenticated;
grant execute on function public.admin_xoa_bds_quan_tam(p_buyer_id uuid, p_listing_id uuid) to service_role;
revoke all on function public.admin_xoa_het_khach_va_ro_hang(p_xac_nhan text) from public, anon, authenticated;
grant execute on function public.admin_xoa_het_khach_va_ro_hang(p_xac_nhan text) to authenticated;
grant execute on function public.admin_xoa_het_khach_va_ro_hang(p_xac_nhan text) to service_role;
revoke all on function public.admin_xoa_khach(p_zalo text) from public, anon, authenticated;
grant execute on function public.admin_xoa_khach(p_zalo text) to authenticated;
grant execute on function public.admin_xoa_khach(p_zalo text) to service_role;
revoke all on function public.ap_fact_du_an_vao_kho(p_id bigint, p_boi text) from public, anon, authenticated;
grant execute on function public.ap_fact_du_an_vao_kho(p_id bigint, p_boi text) to service_role;
revoke all on function public.ap_thong_so(p_listing_id uuid, j jsonb, p_bac text, p_de boolean) from public, anon, authenticated;
grant execute on function public.ap_thong_so(p_listing_id uuid, j jsonb, p_bac text, p_de boolean) to service_role;
revoke all on function public.assign_ctv_round_robin() from public, anon, authenticated;
grant execute on function public.assign_ctv_round_robin() to service_role;
revoke all on function public.bac_nguon(p_source text) from public, anon, authenticated;
grant execute on function public.bac_nguon(p_source text) to anon;
grant execute on function public.bac_nguon(p_source text) to authenticated;
grant execute on function public.bac_nguon(p_source text) to service_role;
revoke all on function public.bao_can_da_chot(p_listing_id uuid) from public, anon, authenticated;
grant execute on function public.bao_can_da_chot(p_listing_id uuid) to service_role;
revoke all on function public.bao_hong_nhac(p_id uuid, p_detail text) from public, anon, authenticated;
grant execute on function public.bao_hong_nhac(p_id uuid, p_detail text) to service_role;
revoke all on function public.bao_tin_moi_khop(p_listing_id uuid) from public, anon, authenticated;
grant execute on function public.bao_tin_moi_khop(p_listing_id uuid) to service_role;
revoke all on function public.bat_het_tien_api() from public, anon, authenticated;
grant execute on function public.bat_het_tien_api() to service_role;
revoke all on function public.beat(p_who text) from public, anon, authenticated;
grant execute on function public.beat(p_who text) to service_role;
revoke all on function public.bo_dau(t text) from public, anon, authenticated;
grant execute on function public.bo_dau(t text) to anon;
grant execute on function public.bo_dau(t text) to authenticated;
grant execute on function public.bo_dau(t text) to service_role;
revoke all on function public.bo_dem_nhac_treo(p_gio integer) from public, anon, authenticated;
grant execute on function public.bo_dem_nhac_treo(p_gio integer) to service_role;
revoke all on function public.boc_tach_nhom(l listings) from public, anon, authenticated;
grant execute on function public.boc_tach_nhom(l listings) to authenticated;
grant execute on function public.boc_tach_nhom(l listings) to service_role;
revoke all on function public.boc_tach_nhom(p_listing_id uuid) from public, anon, authenticated;
grant execute on function public.boc_tach_nhom(p_listing_id uuid) to authenticated;
grant execute on function public.boc_tach_nhom(p_listing_id uuid) to service_role;
revoke all on function public.boc_ten_duong(p text) from public, anon, authenticated;
grant execute on function public.boc_ten_duong(p text) to anon;
grant execute on function public.boc_ten_duong(p text) to authenticated;
grant execute on function public.boc_ten_duong(p text) to service_role;
revoke all on function public.boc_thong_so(p_text text, p_type text) from public, anon, authenticated;
grant execute on function public.boc_thong_so(p_text text, p_type text) to anon;
grant execute on function public.boc_thong_so(p_text text, p_type text) to authenticated;
grant execute on function public.boc_thong_so(p_text text, p_type text) to service_role;
revoke all on function public.bot_health_tick() from public, anon, authenticated;
grant execute on function public.bot_health_tick() to service_role;
revoke all on function public.bump_model_quota(p_limit integer) from public, anon, authenticated;
grant execute on function public.bump_model_quota(p_limit integer) to service_role;
revoke all on function public.bump_user_quota(p_uid text, p_gio_limit integer, p_ngay_limit integer) from public, anon, authenticated;
grant execute on function public.bump_user_quota(p_uid text, p_gio_limit integer, p_ngay_limit integer) to service_role;
revoke all on function public.can_cung_khu(p_buyer_id uuid, p_listing_id uuid, p_limit integer) from public, anon, authenticated;
grant execute on function public.can_cung_khu(p_buyer_id uuid, p_listing_id uuid, p_limit integer) to service_role;
revoke all on function public.canh_bao_ngoai(p_title text, p_text text, p_priority integer, p_email boolean) from public, anon, authenticated;
grant execute on function public.canh_bao_ngoai(p_title text, p_text text, p_priority integer, p_email boolean) to service_role;
revoke all on function public.cat_truoc_phu_dinh(p_text text) from public, anon, authenticated;
grant execute on function public.cat_truoc_phu_dinh(p_text text) to anon;
grant execute on function public.cat_truoc_phu_dinh(p_text text) to authenticated;
grant execute on function public.cat_truoc_phu_dinh(p_text text) to service_role;
revoke all on function public.cau_hinh(p_key text) from public, anon, authenticated;
grant execute on function public.cau_hinh(p_key text) to service_role;
revoke all on function public.che_sdt(p text) from public, anon, authenticated;
grant execute on function public.che_sdt(p text) to anon;
grant execute on function public.che_sdt(p text) to authenticated;
grant execute on function public.che_sdt(p text) to service_role;
revoke all on function public.chon_ctv(p_district text) from public, anon, authenticated;
grant execute on function public.chon_ctv(p_district text) to anon;
grant execute on function public.chon_ctv(p_district text) to authenticated;
grant execute on function public.chon_ctv(p_district text) to service_role;
revoke all on function public.chon_viec_don_chet() from public, anon, authenticated;
grant execute on function public.chon_viec_don_chet() to service_role;
revoke all on function public.chu_nha_han_gio() from public, anon, authenticated;
grant execute on function public.chu_nha_han_gio() to service_role;
revoke all on function public.chuan_dia_ban(p_text text) from public, anon, authenticated;
grant execute on function public.chuan_dia_ban(p_text text) to service_role;
revoke all on function public.chuan_hoa_gia_raw(p_text text) from public, anon, authenticated;
grant execute on function public.chuan_hoa_gia_raw(p_text text) to anon;
grant execute on function public.chuan_hoa_gia_raw(p_text text) to authenticated;
grant execute on function public.chuan_hoa_gia_raw(p_text text) to service_role;
revoke all on function public.chuan_hoa_lai_gia(p_batch integer) from public, anon, authenticated;
grant execute on function public.chuan_hoa_lai_gia(p_batch integer) to service_role;
revoke all on function public.chuan_hoa_phuong(p_text text) from public, anon, authenticated;
grant execute on function public.chuan_hoa_phuong(p_text text) to anon;
grant execute on function public.chuan_hoa_phuong(p_text text) to authenticated;
grant execute on function public.chuan_hoa_phuong(p_text text) to service_role;
revoke all on function public.chuan_nmg(p_seller_id uuid) from public, anon, authenticated;
grant execute on function public.chuan_nmg(p_seller_id uuid) to service_role;
revoke all on function public.co_moc(p_loai text, p_ten_re text) from public, anon, authenticated;
grant execute on function public.co_moc(p_loai text, p_ten_re text) to service_role;
revoke all on function public.con_duoc_rao(p_seller_id uuid) from public, anon, authenticated;
grant execute on function public.con_duoc_rao(p_seller_id uuid) to service_role;
revoke all on function public.cong_token(p_in bigint, p_out bigint, p_cache_write bigint, p_cache_read bigint, p_model text) from public, anon, authenticated;
grant execute on function public.cong_token(p_in bigint, p_out bigint, p_cache_write bigint, p_cache_read bigint, p_model text) to service_role;
revoke all on function public.conversations_email_upset() from public, anon, authenticated;
grant execute on function public.conversations_email_upset() to service_role;
revoke all on function public.ctv_dang_ganh(p_ctv uuid) from public, anon, authenticated;
grant execute on function public.ctv_dang_ganh(p_ctv uuid) to anon;
grant execute on function public.ctv_dang_ganh(p_ctv uuid) to authenticated;
grant execute on function public.ctv_dang_ganh(p_ctv uuid) to service_role;
revoke all on function public.ctv_sla_phut() from public, anon, authenticated;
grant execute on function public.ctv_sla_phut() to anon;
grant execute on function public.ctv_sla_phut() to authenticated;
grant execute on function public.ctv_sla_phut() to service_role;
revoke all on function public.day_ro_ccrb_toi_nmg(p_listing_id uuid) from public, anon, authenticated;
grant execute on function public.day_ro_ccrb_toi_nmg(p_listing_id uuid) to service_role;
revoke all on function public.deals_chan_xoa_da_chot() from public, anon, authenticated;
grant execute on function public.deals_chan_xoa_da_chot() to service_role;
revoke all on function public.dia_danh_gan(p_lat double precision, p_lng double precision, p_ban_kinh_m double precision, p_loai text[], p_limit integer) from public, anon, authenticated;
grant execute on function public.dia_danh_gan(p_lat double precision, p_lng double precision, p_ban_kinh_m double precision, p_loai text[], p_limit integer) to service_role;
revoke all on function public.diem_nguoi_ban(p_seller_id uuid) from public, anon, authenticated;
grant execute on function public.diem_nguoi_ban(p_seller_id uuid) to authenticated;
grant execute on function public.diem_nguoi_ban(p_seller_id uuid) to service_role;
revoke all on function public.diem_phan_hoi(p_seller_id uuid) from public, anon, authenticated;
grant execute on function public.diem_phan_hoi(p_seller_id uuid) to service_role;
revoke all on function public.diem_tin(l listings) from public, anon, authenticated;
grant execute on function public.diem_tin(l listings) to service_role;
revoke all on function public.diem_tin(p_listing_id uuid) from public, anon, authenticated;
grant execute on function public.diem_tin(p_listing_id uuid) to service_role;
revoke all on function public.doc_co_khong(p text) from public, anon, authenticated;
grant execute on function public.doc_co_khong(p text) to anon;
grant execute on function public.doc_co_khong(p text) to authenticated;
grant execute on function public.doc_co_khong(p text) to service_role;
revoke all on function public.doc_danh_sach(p_token text) from public, anon, authenticated;
grant execute on function public.doc_danh_sach(p_token text) to anon;
grant execute on function public.doc_danh_sach(p_token text) to authenticated;
grant execute on function public.doc_danh_sach(p_token text) to service_role;
revoke all on function public.doc_gap(p_text text) from public, anon, authenticated;
grant execute on function public.doc_gap(p_text text) to anon;
grant execute on function public.doc_gap(p_text text) to authenticated;
grant execute on function public.doc_gap(p_text text) to service_role;
revoke all on function public.doi_chieu_tien_cong_khai(p_cau text[]) from public, anon, authenticated;
grant execute on function public.doi_chieu_tien_cong_khai(p_cau text[]) to anon;
grant execute on function public.doi_chieu_tien_cong_khai(p_cau text[]) to authenticated;
grant execute on function public.doi_chieu_tien_cong_khai(p_cau text[]) to service_role;
revoke all on function public.don_du_lieu_thu() from public, anon, authenticated;
grant execute on function public.don_du_lieu_thu() to authenticated;
grant execute on function public.don_du_lieu_thu() to service_role;
revoke all on function public.du_an_can_geocode(p_limit integer) from public, anon, authenticated;
grant execute on function public.du_an_can_geocode(p_limit integer) to service_role;
revoke all on function public.du_an_co_phap_ly(p_project_id uuid) from public, anon, authenticated;
grant execute on function public.du_an_co_phap_ly(p_project_id uuid) to service_role;
revoke all on function public.duong_gan_duong(p_ten text, p_phuong text, p_ban_kinh_m double precision, p_limit integer) from public, anon, authenticated;
grant execute on function public.duong_gan_duong(p_ten text, p_phuong text, p_ban_kinh_m double precision, p_limit integer) to service_role;
revoke all on function public.duyet_fact_du_an(p_id bigint, p_ok boolean, p_project_id uuid) from public, anon, authenticated;
grant execute on function public.duyet_fact_du_an(p_id bigint, p_ok boolean, p_project_id uuid) to authenticated;
grant execute on function public.duyet_fact_du_an(p_id bigint, p_ok boolean, p_project_id uuid) to service_role;
revoke all on function public.email_admin(p_loai text, p_zalo_uid text, p_body text, p_listing_id uuid) from public, anon, authenticated;
grant execute on function public.email_admin(p_loai text, p_zalo_uid text, p_body text, p_listing_id uuid) to service_role;
revoke all on function public.ensure_buyer_conversation(p_zalo_user_id text, p_channel text) from public, anon, authenticated;
grant execute on function public.ensure_buyer_conversation(p_zalo_user_id text, p_channel text) to service_role;
revoke all on function public.ensure_seller_conversation(p_seller_id uuid, p_channel text) from public, anon, authenticated;
grant execute on function public.ensure_seller_conversation(p_seller_id uuid, p_channel text) to service_role;
revoke all on function public.geocode_tick() from public, anon, authenticated;
grant execute on function public.geocode_tick() to service_role;
revoke all on function public.get_secret(secret_name text) from public, anon, authenticated;
grant execute on function public.get_secret(secret_name text) to service_role;
revoke all on function public.ghi_boc_tach(p_listing_id uuid, p jsonb) from public, anon, authenticated;
grant execute on function public.ghi_boc_tach(p_listing_id uuid, p jsonb) to service_role;
revoke all on function public.ghi_danh_gia(p_buyer_id uuid, p_listing_id uuid, p_stars integer, p_note text) from public, anon, authenticated;
grant execute on function public.ghi_danh_gia(p_buyer_id uuid, p_listing_id uuid, p_stars integer, p_note text) to service_role;
revoke all on function public.ghi_fact_listing(p_listing_id uuid, p_question text, p_answer text, p_source text) from public, anon, authenticated;
grant execute on function public.ghi_fact_listing(p_listing_id uuid, p_question text, p_answer text, p_source text) to service_role;
revoke all on function public.ghi_su_kien_bds(p_listing_id uuid, p_type text, p_buyer_id uuid, p_meta jsonb) from public, anon, authenticated;
grant execute on function public.ghi_su_kien_bds(p_listing_id uuid, p_type text, p_buyer_id uuid, p_meta jsonb) to service_role;
revoke all on function public.giao_lo_cua(p_duong1 text, p_duong2 text, p_lat double precision, p_lng double precision) from public, anon, authenticated;
grant execute on function public.giao_lo_cua(p_duong1 text, p_duong2 text, p_lat double precision, p_lng double precision) to service_role;
revoke all on function public.giao_lo_gan(p_lat double precision, p_lng double precision, p_ban_kinh_m double precision, p_limit integer, p_bo_hem boolean) from public, anon, authenticated;
grant execute on function public.giao_lo_gan(p_lat double precision, p_lng double precision, p_ban_kinh_m double precision, p_limit integer, p_bo_hem boolean) to service_role;
revoke all on function public.giu_khach(p_conversation_id uuid, p_giu boolean) from public, anon, authenticated;
grant execute on function public.giu_khach(p_conversation_id uuid, p_giu boolean) to authenticated;
grant execute on function public.giu_khach(p_conversation_id uuid, p_giu boolean) to service_role;
revoke all on function public.guess_property_type(p_text text) from public, anon, authenticated;
grant execute on function public.guess_property_type(p_text text) to authenticated;
grant execute on function public.guess_property_type(p_text text) to service_role;
revoke all on function public.guess_property_type_answer(p_text text) from public, anon, authenticated;
grant execute on function public.guess_property_type_answer(p_text text) to service_role;
revoke all on function public.ham_md5_cong_khai() from public, anon, authenticated;
grant execute on function public.ham_md5_cong_khai() to anon;
grant execute on function public.ham_md5_cong_khai() to authenticated;
grant execute on function public.ham_md5_cong_khai() to service_role;
revoke all on function public.hang_cua_nguoi_ban(p_ids uuid[]) from public, anon, authenticated;
grant execute on function public.hang_cua_nguoi_ban(p_ids uuid[]) to service_role;
revoke all on function public.hang_theo_diem(p_diem integer) from public, anon, authenticated;
grant execute on function public.hang_theo_diem(p_diem integer) to anon;
grant execute on function public.hang_theo_diem(p_diem integer) to authenticated;
grant execute on function public.hang_theo_diem(p_diem integer) to service_role;
revoke all on function public.huy_nhac_khi_da_tra_loi() from public, anon, authenticated;
grant execute on function public.huy_nhac_khi_da_tra_loi() to service_role;
revoke all on function public.info_request_bao_lai_khach() from public, anon, authenticated;
grant execute on function public.info_request_bao_lai_khach() to service_role;
revoke all on function public.info_request_set_active_listing() from public, anon, authenticated;
grant execute on function public.info_request_set_active_listing() to service_role;
revoke all on function public.info_request_sla_tick() from public, anon, authenticated;
grant execute on function public.info_request_sla_tick() to service_role;
revoke all on function public.info_request_timeout_tick() from public, anon, authenticated;
grant execute on function public.info_request_timeout_tick() to service_role;
revoke all on function public.jsonb_bo_rong(j jsonb) from public, anon, authenticated;
grant execute on function public.jsonb_bo_rong(j jsonb) to anon;
grant execute on function public.jsonb_bo_rong(j jsonb) to authenticated;
grant execute on function public.jsonb_bo_rong(j jsonb) to service_role;
revoke all on function public.kd_ten(p text) from public, anon, authenticated;
grant execute on function public.kd_ten(p text) to authenticated;
grant execute on function public.kd_ten(p text) to service_role;
revoke all on function public.khoa_du_an_danh_sach(p_khoa text) from public, anon, authenticated;
grant execute on function public.khoa_du_an_danh_sach(p_khoa text) to anon;
grant execute on function public.khoa_du_an_danh_sach(p_khoa text) to authenticated;
grant execute on function public.khoa_du_an_danh_sach(p_khoa text) to service_role;
revoke all on function public.khoa_nhung_nen() from public, anon, authenticated;
grant execute on function public.khoa_nhung_nen() to service_role;
revoke all on function public.khoang_cach_m(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) from public, anon, authenticated;
grant execute on function public.khoang_cach_m(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) to authenticated;
grant execute on function public.khoang_cach_m(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) to service_role;
revoke all on function public.khu_khop(p_area_kd text, p_ward text, p_district text) from public, anon, authenticated;
grant execute on function public.khu_khop(p_area_kd text, p_ward text, p_district text) to anon;
grant execute on function public.khu_khop(p_area_kd text, p_ward text, p_district text) to authenticated;
grant execute on function public.khu_khop(p_area_kd text, p_ward text, p_district text) to service_role;
revoke all on function public.la_admin() from public, anon, authenticated;
grant execute on function public.la_admin() to authenticated;
grant execute on function public.la_admin() to service_role;
revoke all on function public.la_id_thu(p text) from public, anon, authenticated;
grant execute on function public.la_id_thu(p text) to anon;
grant execute on function public.la_id_thu(p text) to authenticated;
grant execute on function public.la_id_thu(p text) to service_role;
revoke all on function public.lan_thu_ke(p_attempts integer) from public, anon, authenticated;
grant execute on function public.lan_thu_ke(p_attempts integer) to service_role;
revoke all on function public.liet_ke_migration() from public, anon, authenticated;
grant execute on function public.liet_ke_migration() to service_role;
revoke all on function public.liet_ke_migration_cong_khai() from public, anon, authenticated;
grant execute on function public.liet_ke_migration_cong_khai() to anon;
grant execute on function public.liet_ke_migration_cong_khai() to authenticated;
grant execute on function public.liet_ke_migration_cong_khai() to service_role;
revoke all on function public.listing_du_dang_tin(p_price_vnd bigint, p_area_m2 numeric, p_ward text) from public, anon, authenticated;
grant execute on function public.listing_du_dang_tin(p_price_vnd bigint, p_area_m2 numeric, p_ward text) to anon;
grant execute on function public.listing_du_dang_tin(p_price_vnd bigint, p_area_m2 numeric, p_ward text) to authenticated;
grant execute on function public.listing_du_dang_tin(p_price_vnd bigint, p_area_m2 numeric, p_ward text) to service_role;
revoke all on function public.listing_facts_soat_phuong() from public, anon, authenticated;
grant execute on function public.listing_facts_soat_phuong() to service_role;
revoke all on function public.listing_facts_sync_cols() from public, anon, authenticated;
grant execute on function public.listing_facts_sync_cols() to service_role;
revoke all on function public.listing_facts_sync_deal() from public, anon, authenticated;
grant execute on function public.listing_facts_sync_deal() to anon;
grant execute on function public.listing_facts_sync_deal() to authenticated;
grant execute on function public.listing_facts_sync_deal() to service_role;
revoke all on function public.listing_facts_sync_gap() from public, anon, authenticated;
grant execute on function public.listing_facts_sync_gap() to anon;
grant execute on function public.listing_facts_sync_gap() to authenticated;
grant execute on function public.listing_facts_sync_gap() to service_role;
revoke all on function public.listing_media_chon_bia(p_listing_id uuid) from public, anon, authenticated;
grant execute on function public.listing_media_chon_bia(p_listing_id uuid) to service_role;
revoke all on function public.listing_media_giu_bia() from public, anon, authenticated;
grant execute on function public.listing_media_giu_bia() to service_role;
revoke all on function public.listing_media_xep_hang_don() from public, anon, authenticated;
grant execute on function public.listing_media_xep_hang_don() to service_role;
revoke all on function public.listings_bao_can_da_chot() from public, anon, authenticated;
grant execute on function public.listings_bao_can_da_chot() to service_role;
revoke all on function public.listings_bao_tin_moi_khop() from public, anon, authenticated;
grant execute on function public.listings_bao_tin_moi_khop() to service_role;
revoke all on function public.listings_boc_thong_so() from public, anon, authenticated;
grant execute on function public.listings_boc_thong_so() to service_role;
revoke all on function public.listings_chuan_hoa_cot() from public, anon, authenticated;
grant execute on function public.listings_chuan_hoa_cot() to service_role;
revoke all on function public.listings_doi_ma_theo_quan_loai() from public, anon, authenticated;
grant execute on function public.listings_doi_ma_theo_quan_loai() to service_role;
revoke all on function public.listings_fill_code() from public, anon, authenticated;
grant execute on function public.listings_fill_code() to service_role;
revoke all on function public.listings_fill_property_type() from public, anon, authenticated;
grant execute on function public.listings_fill_property_type() to service_role;
revoke all on function public.listings_normalize_status() from public, anon, authenticated;
grant execute on function public.listings_normalize_status() to service_role;
revoke all on function public.listings_quyet_dinh_dang_tin() from public, anon, authenticated;
grant execute on function public.listings_quyet_dinh_dang_tin() to service_role;
revoke all on function public.listings_set_price_vnd() from public, anon, authenticated;
grant execute on function public.listings_set_price_vnd() to service_role;
revoke all on function public.listings_try_publish(p_listing_id uuid) from public, anon, authenticated;
grant execute on function public.listings_try_publish(p_listing_id uuid) to service_role;
revoke all on function public.listings_xoa_toa_do_khi_doi_dia_chi() from public, anon, authenticated;
grant execute on function public.listings_xoa_toa_do_khi_doi_dia_chi() to service_role;
revoke all on function public.loc_thong_so_theo_khoa(j jsonb, q text) from public, anon, authenticated;
grant execute on function public.loc_thong_so_theo_khoa(j jsonb, q text) to anon;
grant execute on function public.loc_thong_so_theo_khoa(j jsonb, q text) to authenticated;
grant execute on function public.loc_thong_so_theo_khoa(j jsonb, q text) to service_role;
revoke all on function public.log_loi(p_source text, p_detail text, p_code integer) from public, anon, authenticated;
grant execute on function public.log_loi(p_source text, p_detail text, p_code integer) to anon;
grant execute on function public.log_loi(p_source text, p_detail text, p_code integer) to authenticated;
grant execute on function public.log_loi(p_source text, p_detail text, p_code integer) to service_role;
revoke all on function public.mark_listing_interest(p_codes text[]) from public, anon, authenticated;
grant execute on function public.mark_listing_interest(p_codes text[]) to service_role;
revoke all on function public.mark_listing_interest(p_codes text[], p_buyer_id uuid) from public, anon, authenticated;
grant execute on function public.mark_listing_interest(p_codes text[], p_buyer_id uuid) to service_role;
revoke all on function public.match_projects(p_text text) from public, anon, authenticated;
grant execute on function public.match_projects(p_text text) to service_role;
revoke all on function public.media_cleanup_giu_trang_thai() from public, anon, authenticated;
grant execute on function public.media_cleanup_giu_trang_thai() to service_role;
revoke all on function public.media_cleanup_tick() from public, anon, authenticated;
grant execute on function public.media_cleanup_tick() to service_role;
revoke all on function public.merge_buyer_prefs(p_buyer_id uuid, p_delta jsonb) from public, anon, authenticated;
grant execute on function public.merge_buyer_prefs(p_buyer_id uuid, p_delta jsonb) to service_role;
revoke all on function public.messages_bump_last_message() from public, anon, authenticated;
grant execute on function public.messages_bump_last_message() to service_role;
revoke all on function public.mo_ho_so_nguoi_ban(p_zalo_user_id text, p_seller_type seller_type) from public, anon, authenticated;
grant execute on function public.mo_ho_so_nguoi_ban(p_zalo_user_id text, p_seller_type seller_type) to service_role;
revoke all on function public.mo_viec_can_nguoi_that(p_buyer_id uuid, p_ctv_id uuid, p_note text, p_voice boolean) from public, anon, authenticated;
grant execute on function public.mo_viec_can_nguoi_that(p_buyer_id uuid, p_ctv_id uuid, p_note text, p_voice boolean) to service_role;
revoke all on function public.moc_khop(p_loai text, p_ten_re text) from public, anon, authenticated;
grant execute on function public.moc_khop(p_loai text, p_ten_re text) to service_role;
revoke all on function public.next_listing_code() from public, anon, authenticated;
grant execute on function public.next_listing_code() to service_role;
revoke all on function public.next_listing_code(p_property_type text, p_district text, p_province text) from public, anon, authenticated;
grant execute on function public.next_listing_code(p_property_type text, p_district text, p_province text) to service_role;
revoke all on function public.ngu_canh_tin(p_message_id uuid) from public, anon, authenticated;
grant execute on function public.ngu_canh_tin(p_message_id uuid) to authenticated;
grant execute on function public.ngu_canh_tin(p_message_id uuid) to service_role;
revoke all on function public.nguoi_noi_bo(p_zalo text) from public, anon, authenticated;
grant execute on function public.nguoi_noi_bo(p_zalo text) to service_role;
revoke all on function public.nha_viec_nhac(p_id uuid, p_worker text) from public, anon, authenticated;
grant execute on function public.nha_viec_nhac(p_id uuid, p_worker text) to service_role;
revoke all on function public.nhan_fact(p_key text) from public, anon, authenticated;
grant execute on function public.nhan_fact(p_key text) to anon;
grant execute on function public.nhan_fact(p_key text) to authenticated;
grant execute on function public.nhan_fact(p_key text) to service_role;
revoke all on function public.nhan_fact_cu(p_key text) from public, anon, authenticated;
grant execute on function public.nhan_fact_cu(p_key text) to authenticated;
grant execute on function public.nhan_fact_cu(p_key text) to service_role;
revoke all on function public.nhan_viec_don_media(p_limit integer) from public, anon, authenticated;
grant execute on function public.nhan_viec_don_media(p_limit integer) to service_role;
revoke all on function public.nhan_viec_nhac(p_kinds text[], p_limit integer, p_worker text) from public, anon, authenticated;
grant execute on function public.nhan_viec_nhac(p_kinds text[], p_limit integer, p_worker text) to service_role;
revoke all on function public.nhung_dia_danh_tick() from public, anon, authenticated;
grant execute on function public.nhung_dia_danh_tick() to service_role;
revoke all on function public.nhung_doi_khoa() from public, anon, authenticated;
grant execute on function public.nhung_doi_khoa() to service_role;
revoke all on function public.nhung_tick() from public, anon, authenticated;
grant execute on function public.nhung_tick() to service_role;
revoke all on function public.notify_info_request_escalation() from public, anon, authenticated;
grant execute on function public.notify_info_request_escalation() to service_role;
revoke all on function public.parse_vnd(p text) from public, anon, authenticated;
grant execute on function public.parse_vnd(p text) to authenticated;
grant execute on function public.parse_vnd(p text) to service_role;
revoke all on function public.phuong_giao_hai_duong(p_duong1 text, p_duong2 text, p_ban_kinh_m double precision) from public, anon, authenticated;
grant execute on function public.phuong_giao_hai_duong(p_duong1 text, p_duong2 text, p_ban_kinh_m double precision) to service_role;
revoke all on function public.quota_tieu_hao() from public, anon, authenticated;
grant execute on function public.quota_tieu_hao() to authenticated;
grant execute on function public.quota_tieu_hao() to service_role;
revoke all on function public.reminders_email_voice() from public, anon, authenticated;
grant execute on function public.reminders_email_voice() to service_role;
revoke all on function public.reminders_giu_trang_thai_ket() from public, anon, authenticated;
grant execute on function public.reminders_giu_trang_thai_ket() to service_role;
revoke all on function public.reminders_hen_hoi_cam_nhan() from public, anon, authenticated;
grant execute on function public.reminders_hen_hoi_cam_nhan() to service_role;
revoke all on function public.required_facts_khong_trung() from public, anon, authenticated;
grant execute on function public.required_facts_khong_trung() to anon;
grant execute on function public.required_facts_khong_trung() to authenticated;
grant execute on function public.required_facts_khong_trung() to service_role;
revoke all on function public.reset_nguoi_test(p_zalo text) from public, anon, authenticated;
grant execute on function public.reset_nguoi_test(p_zalo text) to service_role;
revoke all on function public.route_info_request() from public, anon, authenticated;
grant execute on function public.route_info_request() to service_role;
revoke all on function public.seller_rank(p_type seller_type, p_active integer, p_closed integer, p_total integer) from public, anon, authenticated;
grant execute on function public.seller_rank(p_type seller_type, p_active integer, p_closed integer, p_total integer) to anon;
grant execute on function public.seller_rank(p_type seller_type, p_active integer, p_closed integer, p_total integer) to authenticated;
grant execute on function public.seller_rank(p_type seller_type, p_active integer, p_closed integer, p_total integer) to service_role;
revoke all on function public.sellers_nguon_nhan() from public, anon, authenticated;
grant execute on function public.sellers_nguon_nhan() to service_role;
revoke all on function public.so_nmg_cong_khai() from public, anon, authenticated;
grant execute on function public.so_nmg_cong_khai() to anon;
grant execute on function public.so_nmg_cong_khai() to authenticated;
grant execute on function public.so_nmg_cong_khai() to service_role;
revoke all on function public.soat_db_cong_khai() from public, anon, authenticated;
grant execute on function public.soat_db_cong_khai() to anon;
grant execute on function public.soat_db_cong_khai() to authenticated;
grant execute on function public.soat_db_cong_khai() to service_role;
revoke all on function public.soat_du_lieu_tick() from public, anon, authenticated;
grant execute on function public.soat_du_lieu_tick() to service_role;
revoke all on function public.soat_du_lieu_tin() from public, anon, authenticated;
grant execute on function public.soat_du_lieu_tin() to service_role;
revoke all on function public.stale_listing_tick() from public, anon, authenticated;
grant execute on function public.stale_listing_tick() to service_role;
revoke all on function public.tao_danh_sach(p_listing_codes text[], p_title text, p_buyer_id uuid) from public, anon, authenticated;
grant execute on function public.tao_danh_sach(p_listing_codes text[], p_title text, p_buyer_id uuid) to authenticated;
grant execute on function public.tao_danh_sach(p_listing_codes text[], p_title text, p_buyer_id uuid) to service_role;
revoke all on function public.tao_followup(p_buyer_id uuid, p_code text) from public, anon, authenticated;
grant execute on function public.tao_followup(p_buyer_id uuid, p_code text) to service_role;
revoke all on function public.ten_nhan(p_khoa text) from public, anon, authenticated;
grant execute on function public.ten_nhan(p_khoa text) to service_role;
revoke all on function public.them_nhan_tin(p_listing_id uuid, p_nhan text[]) from public, anon, authenticated;
grant execute on function public.them_nhan_tin(p_listing_id uuid, p_nhan text[]) to service_role;
revoke all on function public.thu_muc_dau_uuid(p_name text) from public, anon, authenticated;
grant execute on function public.thu_muc_dau_uuid(p_name text) to authenticated;
grant execute on function public.thu_muc_dau_uuid(p_name text) to service_role;
revoke all on function public.tim_dia_danh(p_ten text, p_toi_da integer) from public, anon, authenticated;
grant execute on function public.tim_dia_danh(p_ten text, p_toi_da integer) to service_role;
revoke all on function public.tim_dia_danh_theo_nghia(p_vec double precision[], p_loai text[], p_lat double precision, p_lng double precision, p_limit integer) from public, anon, authenticated;
grant execute on function public.tim_dia_danh_theo_nghia(p_vec double precision[], p_loai text[], p_lat double precision, p_lng double precision, p_limit integer) to service_role;
revoke all on function public.tim_du_an_theo_nghia(p_vec double precision[], p_limit integer) from public, anon, authenticated;
grant execute on function public.tim_du_an_theo_nghia(p_vec double precision[], p_limit integer) to service_role;
revoke all on function public.tim_duong(p_ten text, p_quan text, p_toi_da integer) from public, anon, authenticated;
grant execute on function public.tim_duong(p_ten text, p_quan text, p_toi_da integer) to service_role;
revoke all on function public.tim_hem(p_cap_hem text[], p_duong_me text, p_phuong text) from public, anon, authenticated;
grant execute on function public.tim_hem(p_cap_hem text[], p_duong_me text, p_phuong text) to service_role;
revoke all on function public.tim_nghia_san_sang() from public, anon, authenticated;
grant execute on function public.tim_nghia_san_sang() to service_role;
revoke all on function public.tim_phuong_theo_nghia(p_vec double precision[], p_limit integer) from public, anon, authenticated;
grant execute on function public.tim_phuong_theo_nghia(p_vec double precision[], p_limit integer) to service_role;
revoke all on function public.tim_tin_theo_nghia(p_vec double precision[], p_codes text[], p_limit integer) from public, anon, authenticated;
grant execute on function public.tim_tin_theo_nghia(p_vec double precision[], p_codes text[], p_limit integer) to service_role;
revoke all on function public.tin_can_geocode(p_limit integer) from public, anon, authenticated;
grant execute on function public.tin_can_geocode(p_limit integer) to service_role;
revoke all on function public.tin_cua_toi(p_listing uuid) from public, anon, authenticated;
grant execute on function public.tin_cua_toi(p_listing uuid) to authenticated;
grant execute on function public.tin_cua_toi(p_listing uuid) to service_role;
revoke all on function public.tin_gan_moc(p_loai text, p_ten_re text, p_lat double precision, p_lng double precision, p_ten text, p_ban_kinh_m integer, p_deal text) from public, anon, authenticated;
grant execute on function public.tin_gan_moc(p_loai text, p_ten_re text, p_lat double precision, p_lng double precision, p_ten text, p_ban_kinh_m integer, p_deal text) to service_role;
revoke all on function public.tra_nominatim(p_q text, p_viewbox text, p_limit integer, p_chi_tiet boolean, p_cho_giay integer) from public, anon, authenticated;
grant execute on function public.tra_nominatim(p_q text, p_viewbox text, p_limit integer, p_chi_tiet boolean, p_cho_giay integer) to service_role;
revoke all on function public.trg_fact_vao_boc_tach() from public, anon, authenticated;
grant execute on function public.trg_fact_vao_boc_tach() to service_role;
revoke all on function public.trg_info_request_thong_bao_khach_hoi() from public, anon, authenticated;
grant execute on function public.trg_info_request_thong_bao_khach_hoi() to service_role;
revoke all on function public.trg_listings_day_ro_ccrb() from public, anon, authenticated;
grant execute on function public.trg_listings_day_ro_ccrb() to anon;
grant execute on function public.trg_listings_day_ro_ccrb() to authenticated;
grant execute on function public.trg_listings_day_ro_ccrb() to service_role;
revoke all on function public.trg_property_event() from public, anon, authenticated;
grant execute on function public.trg_property_event() to service_role;
revoke all on function public.trg_vi_tri_vao_cot() from public, anon, authenticated;
grant execute on function public.trg_vi_tri_vao_cot() to service_role;
revoke all on function public.url_kho_anh() from public, anon, authenticated;
grant execute on function public.url_kho_anh() to anon;
grant execute on function public.url_kho_anh() to authenticated;
grant execute on function public.url_kho_anh() to service_role;
revoke all on function public.van_ban_dia_danh(p_bang text, p_khoa text) from public, anon, authenticated;
grant execute on function public.van_ban_dia_danh(p_bang text, p_khoa text) to service_role;
revoke all on function public.van_ban_du_an(p_id uuid) from public, anon, authenticated;
grant execute on function public.van_ban_du_an(p_id uuid) to service_role;
revoke all on function public.van_ban_nhung(p_id uuid) from public, anon, authenticated;
grant execute on function public.van_ban_nhung(p_id uuid) to service_role;
revoke all on function public.viewings_bao_ctv_va_email() from public, anon, authenticated;
grant execute on function public.viewings_bao_ctv_va_email() to service_role;
revoke all on function public.xoa_nguoi_theo_zalo(p_zalo text) from public, anon, authenticated;
grant execute on function public.xoa_nguoi_theo_zalo(p_zalo text) to service_role;
revoke all on function public.xuat_schema() from public, anon, authenticated;
grant execute on function public.xuat_schema() to service_role;
revoke all on function public.yeu_cau_quet_lai_zalo() from public, anon, authenticated;
grant execute on function public.yeu_cau_quet_lai_zalo() to authenticated;
grant execute on function public.yeu_cau_quet_lai_zalo() to service_role;

-- ══ Storage bucket ══
insert into storage.buckets (id, name, public) values ('listing-photos', 'listing-photos', 'f') on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('listing-private', 'listing-private', 'f') on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('listing-public', 'listing-public', 't') on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('masterdb-raw', 'masterdb-raw', 'f') on conflict (id) do nothing;

-- ══ Storage policy ══
drop policy if exists storage_admin_private_all on storage.objects;
create policy storage_admin_private_all on storage.objects as permissive for ALL to authenticated using (((bucket_id = 'listing-private'::text) AND la_admin())) with check (((bucket_id = 'listing-private'::text) AND la_admin()));
drop policy if exists storage_admin_public_all on storage.objects;
create policy storage_admin_public_all on storage.objects as permissive for ALL to authenticated using (((bucket_id = 'listing-public'::text) AND la_admin())) with check (((bucket_id = 'listing-public'::text) AND la_admin()));
drop policy if exists storage_seller_own_delete on storage.objects;
create policy storage_seller_own_delete on storage.objects as permissive for DELETE to authenticated using (((bucket_id = 'listing-public'::text) AND tin_cua_toi(thu_muc_dau_uuid(name))));
drop policy if exists storage_seller_own_insert on storage.objects;
create policy storage_seller_own_insert on storage.objects as permissive for INSERT to authenticated with check (((bucket_id = 'listing-public'::text) AND tin_cua_toi(thu_muc_dau_uuid(name))));

-- ══ Cron ══
select cron.schedule('bot-health-tick', '*/15 * * * *', 'select public.bot_health_tick()');
select cron.schedule('cron-don-so', '15 18 * * *', 'delete from cron.job_run_details where end_time < now() - interval ''7 days''');
select cron.schedule('don-du-lieu-thu', '0 14 * * *', 'select public.don_du_lieu_thu()');
select cron.schedule('geocode-tick', '*/10 * * * *', 'select public.geocode_tick()');
select cron.schedule('listing-interest-decay', '0 20 * * *', 'update public.listings set status = ''dang_ban''
   where status = ''dang_quan_tam'' and last_interest_at < now() - interval ''7 days''');
select cron.schedule('media-chet-tick', '0 * * * *', 'select public.chon_viec_don_chet()');
select cron.schedule('media-cleanup-tick', '*/5 * * * *', 'select public.media_cleanup_tick()');
select cron.schedule('nhung-dia-danh-tick', '1-59/2 * * * *', 'select public.nhung_dia_danh_tick()');
select cron.schedule('nhung-tick', '*/2 * * * *', 'select public.nhung_tick()');
select cron.schedule('soat-du-lieu-tick', '5 1 * * *', 'select public.soat_du_lieu_tick()');

