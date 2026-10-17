// BẢN PROMPT ĐANG NẰM TRONG MÃ NGUỒN — nhập THẲNG từ file bot dùng.
//
// Không chép tay sang đây: chép tay là đẻ ra nguồn sự thật thứ ba, và thứ ba
// thì không ai bảo trì. Bảng khoá dưới đây trùng đúng bảng của
// `scripts/dong-bo-prompt.mjs`; thêm khoá prompt mới thì thêm ở CẢ HAI.
import * as P from "@/bot/supabase/functions/_shared/prompts";

export const BAN_TRONG_CODE: Record<string, string> = {
  tone_rules: P.TONE_RULES,
  seller_script_rules: P.SELLER_SCRIPT_RULES,
  seller_fewshot: P.SELLER_FEWSHOT,
  buyer_fewshot: P.BUYER_FEWSHOT,
  slang_notes: P.SLANG_NOTES,
  agree_rules: P.AGREE_RULES,
  fee_rules: P.FEE_RULES,
  human_chat_rules: P.HUMAN_CHAT_RULES,
  rate_ctv_rubric: P.RATE_CTV_RUBRIC,
  loi_chao: P.LOI_CHAO,
  cau_hoi_mau: P.CAU_HOI_MAU_TEXT,
  cau_tien_dinh: P.CAU_TIEN_DINH_TEXT,
};

/** Một dòng nói khoá đó điều khiển cái gì — người sửa phải biết mình đang cầm gì. */
export const MO_TA_KHOA: Record<string, string> = {
  tone_rules: "Giọng nói, xưng hô, những dấu hiệu máy bị cấm",
  seller_script_rules: "Luật trả lời CHỦ NHÀ: hỏi một thứ một lần, bản nháp tin, điểm",
  seller_fewshot: "Ví dụ mẫu phía chủ nhà — model bắt chước nhịp này",
  buyer_fewshot: "Ví dụ mẫu phía người mua",
  slang_notes: "Tiếng lóng, viết tắt, chữ thiếu dấu của dân nhà đất",
  agree_rules: "Thế nào là khách GẬT (chốt lịch, đồng ý)",
  fee_rules: "Luật phí — chỉ nói khi được hỏi",
  human_chat_rules: "Nhịp nhắn giống người, không hỏi lại thứ đã biết",
  rate_ctv_rubric: "Thang chấm báo cáo cộng tác viên",
  loi_chao: "Câu chào lần đầu",
  cau_hoi_mau: "Câu hỏi mẫu cho từng thông tin còn thiếu (JSON)",
  cau_tien_dinh: "Câu cố định: ghi nhận, bản nháp, chúc mừng điểm (JSON)",
};
