"""Xuất ĐÚNG CHỮ các prompt bot đang dùng ra một tệp Markdown để người đọc / sửa (SRS-5.1zzzzzzz503, chủ dự án 16/11/2026: "xuất 1 cái tương tự"
— tương tự tệp `prompts.md` của bản anh Luận). Không gọi model, không đọc DB: chỉ nạp `src/aioi` rồi in các hằng và dựng các prompt với MỘT
căn mẫu. Câu mẫu cố định in theo mặc định trong code (`cau_mau.MAC_DINH`) — bản sửa ở CRM nằm trong DB, tệp này không thấy.

Chạy:  python scripts/xuat-prompts.py [tệp_ra.md]        (mặc định: ket-qua/prompts.md — thư mục đã .gitignore)
"""
from __future__ import annotations

import io
import os
import sys
import time

GOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(GOC, "src"))

from aioi import agent_ban, agent_gop, agent_mua, cau_mau  # noqa: E402
from aioi import prompts as P  # noqa: E402
from aioi.schema import Property  # noqa: E402

TEN = "[tên trợ lý]"


def so(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def khoi(chu: str) -> str:
    return "```\n" + str(chu).strip("\n").replace("```", "'''") + "\n```\n"


def thu(ham) -> str:
    try:
        return khoi(ham())
    except Exception as e:  # noqa: BLE001 — một mục hỏng không làm mất cả tệp
        return f"_(không dựng được mục này: {type(e).__name__}: {e})_\n"


def can_mau() -> Property:
    p = Property()
    p.update({"loai_hinh": "nha_pho", "dia_chi": "Hoàng Hoa Thám, Bình Thạnh", "duong": "Hoàng Hoa Thám", "dien_tich_dat": "35.4m²",
              "gia": "12.5 tỷ", "ket_cau": "3 tầng kiên cố", "tinh_trang_ban_giao": "đang cho thuê 35 triệu/tháng",
              "phap_ly_hoan_cong": "sổ hồng, hoàn công"})
    return p


def cong_cu(ds: list[dict]) -> str:
    return "\n".join(f"- `{c['name']}` — {c['description']}" for c in ds) + "\n"


def main() -> None:
    ra = sys.argv[1] if len(sys.argv) > 1 else os.path.join(GOC, "ket-qua", "prompts.md")
    os.makedirs(os.path.dirname(os.path.abspath(ra)), exist_ok=True)
    p = can_mau()
    trong = Property()
    trong.update({"loai_hinh": "nha_pho"})
    d: list[str] = []
    them = d.append
    them("# Tính cách & prompt bot — AI Ơi Nhà Đất (AOND)\n")
    them(f"> **Xuất tự động từ `src/aioi/prompts.py`** ngày {time.strftime('%d/%m/%Y')} bằng `scripts/xuat-prompts.py` — đây là *đúng chữ* bot "
         "đang dùng, không phải diễn giải.\n"
         f"> `em` = bot tự xưng · `{TEN}` = tên gán cho từng khách (T•ài, M•ai…) · khối hệ thống = dữ liệu engine chèn vào lúc chạy.\n>\n"
         "> **Engine chọn prompt nào:** chưa đủ ngưỡng rao (loại hình + vị trí + giá) → **A. Lượt hỏi thông tin**; lần đầu đủ ngưỡng → "
         "**B. Trình bản tin**; các lượt sau → **C. Sau bản tin (duyệt, sửa, phí)**. Mỗi lượt là một vòng hai bước dùng chung công cụ: bước 1 "
         "đọc ý + ghi dữ liệu (**D. Đọc ý & thao tác**), bước 2 viết lời. Khách tìm mua / thuê đi prompt riêng (**mục 12**).\n")
    them("---\n\n## 1. Câu chào mở đầu (cố định, KHÔNG qua model)\n`cau_mau: chao_lan_dau` (số ký gửi) · `chao_tu_van` (số tư vấn mua / thuê) · "
         "`build_greeting` (lệnh làm mới). Sửa được ở CRM `/admin/mau-cau`.\n")
    them(thu(lambda: "[số ký gửi]\n" + cau_mau.MAC_DINH["chao_lan_dau"][0] + "\n\n[số tư vấn]\n" + cau_mau.MAC_DINH["chao_tu_van"][0]
             + "\n\n[build_greeting]\n" + P.build_greeting(TEN)))
    them("---\n\n## 2. BUSINESS_CONTEXT — bối cảnh nghiệp vụ (chèn vào prompt B / C)\n`BUSINESS_CONTEXT` · mức phí lấy từ `revenue.py` (một nguồn).\n")
    them(khoi(P.BUSINESS_CONTEXT))
    them("---\n\n## 3. NHÂN VẬT + GIỌNG — tính cách và cách nói (đứng đầu mọi prompt bot nói với khách)\n`khoi_nhan_vat` + `GIONG`. Đổi giọng thì "
         f"sửa ở `GIONG`, không thêm luật rời chỗ khác. Trần: `GIONG` ≤ 4.000 chữ (hiện {so(len(P.GIONG))}).\n")
    them("### 3a. Nhân vật — nói với người gửi bán / cho thuê\n" + thu(lambda: P.khoi_nhan_vat(TEN, "người gửi bán / cho thuê nhà", kem_giong=False)))
    them("### 3b. Nhân vật — nói với khách tìm mua / thuê\n" + thu(lambda: P.khoi_nhan_vat(TEN, "khách tìm mua / thuê nhà", kem_giong=False)))
    them("### 3c. GIỌNG (chung hai phía)\n" + khoi(P.GIONG))
    them("---\n\n## 4. A — LƯỢT HỎI THÔNG TIN người bán (prompt gọn, đang bật)\n`LEAN_SYSTEM_PROMPT` qua `lean_system_prompt_cho_luot` · trần ≤ 8.000 "
         f"chữ (hiện {so(len(P.LEAN_SYSTEM_PROMPT))}). Khối GIỌNG (mục 3c) nằm nguyên trong prompt này. Mỗi lượt hỏi MỘT ý (chủ dự án 11/11).\n")
    them("### 4a. Khuôn\n" + khoi(P.LEAN_SYSTEM_PROMPT.replace(P.GIONG, "_↑ chèn khối GIỌNG (mục 3c)_")))
    them("### 4b. Ví dụ đã dựng — căn nhà phố mới biết loại, đang hỏi địa chỉ\n" + thu(
        lambda: P.lean_system_prompt_cho_luot(TEN, trong, "dia_chi").replace(P.GIONG, "_↑ chèn khối GIỌNG (mục 3c)_")))
    them("### 4c. Câu hỏi tự nhiên theo từng ô (`NATURAL_QUESTIONS`)\n" + "\n".join(f"- `{k}` → {v}" for k, v in P.NATURAL_QUESTIONS.items()) + "\n")
    them("---\n\n## 5. AD_FORMAT — bố cục + giọng của BÀI RAO\n`AD_FORMAT` · dùng ở B và ở lượt rao lại bản tin đã sửa.\n")
    them(khoi(P.AD_FORMAT))
    them("---\n\n## 6. B — TRÌNH BẢN TIN (lần đầu đủ ngưỡng rao)\n`build_listing_proposal_system` · ví dụ dựng với căn mẫu.\n")
    them(thu(lambda: P.build_listing_proposal_system(TEN, p).replace(P.AD_FORMAT, "_↑ chèn khối AD_FORMAT (mục 5)_")
             .replace(P.BUSINESS_CONTEXT, "_↑ chèn khối BUSINESS_CONTEXT (mục 2)_").replace(P.GIONG, "_↑ chèn khối GIỌNG (mục 3c)_")))
    them("---\n\n## 7. C — SAU BẢN TIN: duyệt, sửa, phí, câu hỏi sau đăng\n`build_fee_followup_system` · ví dụ dựng với căn mẫu, vai chưa rõ.\n")
    them("### 7a. Prompt\n" + thu(lambda: P.build_fee_followup_system(TEN, p).replace(P.AD_FORMAT, "_↑ chèn khối AD_FORMAT (mục 5)_")
                                  .replace(P.BUSINESS_CONTEXT, "_↑ chèn khối BUSINESS_CONTEXT (mục 2)_")
                                  .replace(P.GIONG, "_↑ chèn khối GIỌNG (mục 3c)_").replace(P.FEE_VALUE_POINTS, "_↑ chèn khối FEE_VALUE_POINTS (mục 7b)_")))
    them("### 7b. FEE_VALUE_POINTS — lý lẽ khi khách hỏi / chê phí\n" + khoi(P.FEE_VALUE_POINTS))
    them("### 7c. CHINH_SACH_PHI — bốn ý chính sách gửi bán\n" + khoi(P.CHINH_SACH_PHI))
    them("---\n\n## 8. D — ĐỌC Ý & THAO TÁC (bước 1 của mỗi lượt phía bán)\n`OPERATIONS_SYSTEM_BAN` · AI đọc theo NGHĨA; mỗi giá trị ghi vào tin phải kèm "
         "cụm trích nằm nguyên trong lời khách — code kiểm, thiếu thì bỏ. Từ điển + kiến thức nghề (mục 9) nằm trong khối này.\n")
    them(khoi(P.OPERATIONS_SYSTEM_BAN.replace(P.SLANG_NOTES, "_↑ chèn khối TỪ ĐIỂN & KIẾN THỨC NGHỀ (mục 9)_")))
    them("---\n\n## 9. TỪ ĐIỂN TIẾNG LÓNG + KIẾN THỨC NGHỀ\n`SLANG_NOTES` · có trong system của cả bước đọc ý lẫn bước viết lời.\n")
    them(khoi(P.SLANG_NOTES))
    them("---\n\n## 10. CÔNG CỤ bot tự gọi\n### 10a. Phía bán — hướng dẫn (`agent_ban.HUONG_DAN`)\n" + khoi(agent_ban.HUONG_DAN))
    them("Danh sách công cụ phía bán:\n" + cong_cu(agent_ban.CONG_CU))
    them("### 10b. Phía mua — hướng dẫn (`agent_mua.HUONG_DAN_DOC`)\n" + khoi(agent_mua.HUONG_DAN_DOC))
    them("Danh sách công cụ phía mua (chỉ đọc):\n" + cong_cu(agent_mua.CONG_CU_DOC))
    them("### 10c. Lời dặn bước viết (`agent_gop.HUONG_DAN_VIET`)\n" + khoi(agent_gop.HUONG_DAN_VIET))
    them("---\n\n## 11. FIELD_LABELS — nhãn tiếng Việt của từng ô\n`FIELD_LABELS`\n\n" + "\n".join(f"- `{k}` → {v}" for k, v in P.FIELD_LABELS.items()) + "\n")
    them("---\n\n## 12. PHÍA MUA — đọc ý khách tìm mua / thuê\n`OPERATIONS_SYSTEM_MUA` (bước đọc ý). Lời đáp phía mua dùng NHÂN VẬT 3b + GIỌNG 3c + công cụ 10b.\n")
    them(khoi(P.OPERATIONS_SYSTEM_MUA))
    them("---\n\n## 13. CÂU MẪU CỐ ĐỊNH (mặc định trong code — bản sửa ở CRM `/admin/mau-cau` ghi đè)\n`cau_mau.MAC_DINH` · "
         "`{goi}` = cách gọi khách, `{ten}` = tên trợ lý, `{toi}` = bot tự xưng.\n\n"
         + "\n".join(f"- `{k}` → {str(v[0] if isinstance(v, (tuple, list)) else v).replace(chr(10), ' ⏎ ')}" for k, v in cau_mau.MAC_DINH.items()) + "\n")
    chu = "\n".join(d)
    io.open(ra, "w", encoding="utf-8", newline="\n").write(chu)
    print(f"da xuat {ra}: {len(chu)} ky tu, {chu.count(chr(10)) + 1} dong")


if __name__ == "__main__":
    main()
