import { createClient } from "@supabase/supabase-js";

// Anon/publishable key là key công khai (chỉ đọc được thứ RLS cho phép) —
// env override được, mặc định trỏ project nhadat-cc.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_f4wNO8jQcCDWn1QmNZQ7-g_BXDtYM3Y";

export const supabase = createClient(url, key);

// FR-171 j — CỘT CHỌN LỌC thay cho select("*"). Thẻ tin (ListingCard) không
// đọc `description` (cột text nặng nhất), `lat/lng`, `unit_status`,
// `last_confirmed_at`; kéo "*" cho lưới 24 thẻ là kéo 24 mô tả rồi vứt — và
// với /ban-do là 300 mô tả bị serialize vào HTML. Trang chi tiết mới cần "*".
// FR-172: thẻ tin thêm ba cột thông số nhẹ (đường vào, số tầng, WC) — đúng thứ
// khách Quận 5 nhìn đầu tiên ("HXH hay MT? mấy tầng?"), không kéo mô tả.
export const CARD_COLS =
  "id, code, deal, district, ward, street, location_raw, area_m2, price_vnd, price_raw, property_type, bedrooms, bathrooms, floors, access_type, status, created_at";
/** Bản đồ: thẻ + toạ độ, vẫn không kéo mô tả. */
export const MAP_COLS = `${CARD_COLS}, lat, lng`;
export type MapRow = ListingCard & Pick<Listing, "lat" | "lng">;
/** Kiểu dữ liệu của một dòng đọc bằng CARD_COLS — đủ cho ListingCard. */
export type ListingCard = Pick<
  Listing,
  | "id" | "code" | "deal" | "district" | "ward" | "street" | "location_raw" | "area_m2"
  | "price_vnd" | "price_raw" | "property_type" | "bedrooms" | "bathrooms" | "floors"
  | "access_type" | "status" | "created_at"
>;

/** FR-172: đường vào — giá trị trong DB (CHECK ở migration 20260902e). */
export type AccessType = "mat_tien" | "hem_xe_tai" | "hem_xe_hoi" | "hem_xe_may" | "hem";

export type Listing = {
  id: string;
  code: string | null;
  deal: "ban" | "cho_thue";
  district: string | null;
  ward: string | null;
  location_raw: string | null;
  area_m2: number | null;
  price_vnd: number | null;
  price_raw: string | null;
  description: string | null;
  status: string;
  property_type: string | null;
  unit_status: string | null;
  last_confirmed_at: string | null;
  created_at: string;
  lat: number | null;
  lng: number | null;
  bedrooms: number | null;
  // FR-172 — thông số có cấu trúc (migration 20260902e). Bậc nguồn ở specs_source.
  street: string | null;
  access_type: AccessType | null;
  alley_width_m: number | null;
  distance_to_street_m: number | null;
  frontage_m: number | null;
  length_m: number | null;
  rear_width_m: number | null;
  legal_area_m2: number | null;
  built_area_m2: number | null;
  floors: number | null;
  floors_text: string | null;
  floor: number | null;
  bathrooms: number | null;
  direction: string | null;
  legal_status: "so_hong_rieng" | "so_hong_chung" | "so_hong" | "hdmb" | "giay_tay" | null;
  has_completion: boolean | null;
  planning_status: string | null;
  has_elevator: boolean | null;
  car_in_house: boolean | null;
  corner_lot: boolean | null;
  furnishing: "full" | "co_ban" | "khong" | null;
  year_built: number | null;
  negotiable: boolean | null;
  rent_income_vnd: number | null;
  specs_source: string | null;
  price_per_m2_vnd: number | null;
  // FR-113/FR-117 — tin thuộc dự án (SRS-3.10): null với hàng lẻ.
  project_id: string | null;
  unit_code: string | null;
};
