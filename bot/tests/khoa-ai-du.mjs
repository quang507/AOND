#!/usr/bin/env bun
// khoa-ai-du.mjs — SRS-5.1zzzo (08/10/2026, chủ dự án: "ai đọc bóc tách mới có mấy cái schema"). Mọi Ý bot có thể HỎI người bán
// (`CAU_HOI_MAU`, bỏ hậu tố "@loại") phải có KHOÁ để AI bóc tách ghi câu trả lời — không thì AI hiểu đúng mà không có ô, luật
// tìm-chuỗi ghi nguyên chữ khách ("anh dung ten"). Ô điều khiển (duyệt, chấm điểm, ảnh, chọn căn…) không phải dữ kiện, khai ở dưới.
import { CAU_HOI_MAU } from "../supabase/functions/_shared/prompts.ts";
import { MOI_KHOA, KHOA_FACT_AI_BIET } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";

const KHONG_PHAI_DU_KIEN = new Set([
  "hinh_anh", "bo_sung", "nhan", "duyet_tin", "danh_gia", "ngung_rao_can_nao", "xac_nhan_ngung_hang_loat", "tai_lieu_du_an_nao",
  "loai_bds", "vai", "con_ban", "dang_tin",
]);
// Ô AI ghi qua khoá KHÁC tên (KHOA_GHI / docAiChinh): vị trí ← duong, diện tích đất ← dien_tich, mặt tiền ← ngang, doanh thu ← thu_nhap_thue.
const QUA_KHOA_KHAC = new Set(["vi_tri", "dien_tich_dat", "dien_tich_tim_tuong", "mat_tien", "doanh_thu"]);
const ai = new Set([...MOI_KHOA, ...KHOA_FACT_AI_BIET]);
const hoi = [...new Set(Object.keys(CAU_HOI_MAU).map((k) => k.split("@")[0]))];
const thieu = hoi.filter((k) => !ai.has(k) && !KHONG_PHAI_DU_KIEN.has(k) && !QUA_KHOA_KHAC.has(k));
if (thieu.length) {
  console.log(`✗ KHOÁ AI: ${thieu.length} ý bot hỏi mà AI bóc tách không có khoá ghi: ${thieu.join(", ")}`);
  console.log("  → thêm khoá vào KHOA_O (kiem-bang-chung.ts) + mô tả trong LUAT (boc-rao.ts), hoặc khai vào danh sách trên kèm lý do.");
  process.exit(1);
}
console.log(`✓ KHOÁ AI: ${hoi.length} ý bot hỏi đều có khoá AI ghi`);
