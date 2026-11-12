"""Vòng agent phía MUA (SRS-5.1zzzzzzz290 / 292, chủ dự án 29/10/2026: "Ok thử … sang kiểu Suy nghĩ -> Chọn công cụ -> Thực thi -> Đánh giá thôi
còn bóc tách vẫn dùng haiku … tại mấy cái code từ khóa bạn làm chạy không ổn định").

Lượt viết lời cho khách mua (Sonnet) được bộ công cụ: model tự quyết có cần tra kho không (khách đổi tiêu chí, hỏi chi tiết một căn, hỏi dự án /
khu) thay vì code dựng sẵn một lần tra cố định; và (SRS-292) ghi hẹn xem / câu hỏi chủ nhà khi bóc tách Haiku bỏ sót — cùng hàm ghi, cùng chống
trùng của đường cũ. Bóc tách ô (Haiku) và các việc ghi khác giữ nguyên đường cũ có cổng kiểm. Có trần: tối đa `MAX_VONG` lần gọi model, ngừng tra sau `HAN_GIAY` giây; hết trần mà
chưa có lời thì viết lời thường kèm kết quả đã tra. Chạy cho mọi khách mua (công tắc AGENT_MUA gỡ ở Đợt 8, SRS-5.1zzzzzzz319)."""
from __future__ import annotations

import copy
import logging
import time
from typing import Any

from . import du_an_mua
from .mua import co_tieu_chi, dong_can, phap_ly_can, tim_sdt

log = logging.getLogger(__name__)

MAX_VONG = 3        # lần gọi model tối đa trong một lượt (2 lượt tra + lời cuối)
HAN_GIAY = 25.0     # quá chừng này giây thì không tra thêm (trần lõi 40 s, bridge chờ 90 s)
TRAN_KET_QUA = 3000

HUONG_DAN_DOC = (
    "\n\n=== CÔNG CỤ TRA KHO & TÍNH TOÁN (chỉ ĐỌC / TÍNH TOÁN) ===\n"
    "Em có bộ công cụ tra kho và tính toán thật của hệ thống (Function Calling tự nhiên theo phong cách PropTech MOSO). Tự quyết có cần tra / tính không:\n"
    "- tim_can: khách đổi / thêm tiêu chí (khu, giá, loại, phòng ngủ, diện tích) mà khối CĂN ĐANG RAO chưa theo kịp, hoặc khách muốn xem lựa chọn khác.\n"
    "- xem_can: khách hỏi chi tiết một căn (theo mã trong link đã gửi) mà dòng căn ở dưới chưa có.\n"
    "- so_sanh_can: khách muốn so sánh 2 hay nhiều căn với nhau về giá, đơn giá m² đất, diện tích, đường vào.\n"
    "- tra_du_an / du_an_trong_khu: khách hỏi về một dự án, hoặc khu nào có dự án gì, mà khối dự án ở dưới chưa có.\n"
    "- tinh_thue_phi: khách hỏi thuế phí chuyển nhượng, sang tên, bên nào chịu khoản nào, phí công chứng bao nhiêu.\n"
    "- tinh_vay_tra_gop: khách hỏi lãi suất, sinh lời cho thuê, vay được bao nhiêu, vốn tự có, mỗi tháng trả góp bao nhiêu.\n"
    "Tra tối đa 2 lần. Chỉ nói điều kết quả tra ghi; tra không ra thì nói thật là chưa có. Số căn giới thiệu mỗi lượt theo luật ở trên (rổ có ≥ 2 căn hợp thì 2–3 căn).\n"
)
# Các công cụ GHI của đường dự phòng (SRS-5.1zzzzzzz292, SRS-5.1zzzzzzz389) — vòng agent gộp (SRS-5.1zzzzzzz380) ghi ở bước 1, bước 2 chỉ còn HUONG_DAN_DOC + DONG_CUOI.
HUONG_DAN_GHI_VIEC = (
    "- hen_xem / hoi_chu_nha / luu_so_dien_thoai (GHI thật) khi khối EM VỪA GHI LƯỢT NÀY CHƯA có việc đó: khách đề nghị giờ / ngày đi xem một căn đã rõ → hen_xem "
    "NGAY; khách hỏi điều về căn mà dòng của căn KHÔNG có câu trả lời (sổ, nội thất, bớt giá, vào ở khi nào…) → hoi_chu_nha NGAY với câu viết "
    "rõ theo ý khách, CHỈ phần dòng căn chưa có (phần đã có — vd sổ hồng — thì trả lời luôn, không chuyển chủ nhà) — khách hỏi tức là muốn biết, KHÔNG hỏi lại khách \"có muốn em hỏi chủ nhà không\" (bắn thử 29/10; bản 06/11 lỡ xoá câu này); khách để lại số điện thoại "
    "để nhờ tư vấn / gọi lại → luu_so_dien_thoai NGAY. Căn chưa rõ là căn nào hoặc khách chưa "
    "nói giờ thì KHÔNG gọi — hỏi lại khách.\n"
    "Chỉ nói đã ghi / đã chuyển chủ nhà khi khối EM VỪA GHI LƯỢT NÀY có việc đó HOẶC kết quả hen_xem / hoi_chu_nha / luu_so_dien_thoai báo ĐÃ GHI (kết quả công cụ "
    "thắng câu 'lượt này em chưa ghi việc gì'). "
)
DONG_CUOI = "Lời gửi khách viết ở lượt cuối, sau khi tra / ghi xong; không viết 'để em tra / em kiểm tra'.\n"
HUONG_DAN = HUONG_DAN_DOC + HUONG_DAN_GHI_VIEC + DONG_CUOI   # đường dự phòng `chay` (form Haiku đọc ý), chữ như trước SRS-5.1zzzzzzz380

CONG_CU: list[dict[str, Any]] = [
    {
        "name": "tim_can",
        "description": "Tìm căn ĐANG RAO hợp tiêu chí (bỏ căn khách đã chê, mỗi nhà một tin). Ô nào không đưa thì dùng nhu cầu đã ghi của khách. "
                       "Cần có khu vực và ngân sách.",
        "input_schema": {
            "type": "object",
            "properties": {
                "khu_vuc": {"type": "string", "description": "Quận / phường / đường / dự án"},
                "loai_bds": {"type": "string", "description": "nha_pho, chung_cu, dat_tho_cu, biet_thu…"},
                "ngan_sach": {"type": "string", "description": "Ngân sách theo lời khách (vd \"dưới 6 tỷ\")"},
                "ngan_sach_tu": {"type": "string", "description": "Mức thấp nhất, một số kèm đơn vị (\"8 tỷ\")"},
                "ngan_sach_den": {"type": "string", "description": "Mức cao nhất, một số kèm đơn vị (\"6 tỷ\")"},
                "so_phong_ngu": {"type": "string"},
                "dien_tich_tu": {"type": "string", "description": "Chỉ con số m²"},
                "dien_tich_den": {"type": "string", "description": "Chỉ con số m²"},
                "loai_giao_dich": {"type": "string", "enum": ["mua", "thue"]},
            },
        },
    },
    {
        "name": "xem_can",
        "description": "Dòng thông tin đầy đủ của căn đang hiện theo mã (giá, diện tích, pháp lý, kết cấu, phần chung dự án / mẫu nhà).",
        "input_schema": {
            "type": "object",
            "properties": {"ma": {"type": "array", "items": {"type": "string"}, "maxItems": 3, "description": "Mã căn, vd ABCD1234"}},
            "required": ["ma"],
        },
    },
    {
        "name": "so_sanh_can",
        "description": "So sánh 2 đến 5 căn đang rao theo giá, đơn giá m² đất, diện tích, vị trí và pháp lý để khách cân nhắc lựa chọn (tương đương compare_listings).",
        "input_schema": {
            "type": "object",
            "properties": {
                "ma": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Danh sách 2 đến 5 mã căn cần so sánh (vd [\"ABCD1234\", \"XYZW5678\"])",
                }
            },
            "required": ["ma"],
        },
    },
    {
        "name": "tinh_thue_phi",
        "description": "Tính toán chi tiết các khoản thuế & lệ phí chuyển nhượng nhà đất (Thuế TNCN 2%, Lệ phí trước bạ 0.5%, Phí công chứng TT 257/2016, lệ phí đăng bộ) cho người mua và người bán.",
        "input_schema": {
            "type": "object",
            "properties": {
                "gia_vnd": {"type": "integer", "description": "Giá trị giao dịch căn nhà bằng VNĐ (vd 5000000000)"},
                "ma": {"type": "string", "description": "Mã căn đang xem nếu muốn tính theo giá căn đó"},
                "can_duy_nhat": {"type": "boolean", "description": "True nếu là căn nhà duy nhất của người bán (được miễn thuế TNCN)"},
            },
        },
    },
    {
        "name": "tinh_vay_tra_gop",
        "description": "Số tài chính tham khảo (lãi suất vay, sinh lời cho thuê, tỷ lệ vay, vốn tự có) và — khi có giá hoặc mã căn — phương án vay, "
                       "trả góp hàng tháng theo dư nợ giảm dần. Không có giá vẫn gọi được (chỉ trả số tham khảo).",
        "input_schema": {
            "type": "object",
            "properties": {
                "gia_vnd": {"type": "integer", "description": "Giá trị căn nhà bằng VNĐ (vd 5000000000)"},
                "ma": {"type": "string", "description": "Mã căn đang xem nếu muốn tính theo giá căn đó"},
                "ty_le_vay": {"type": "number", "description": "Tỷ lệ vay (mặc định 0.7 = 70%)"},
                "so_nam": {"type": "integer", "description": "Thời hạn vay (năm, mặc định 20)"},
                "lai_suat_nam": {"type": "number", "description": "Lãi suất ưu đãi năm đầu (%/năm, mặc định 7.5)"},
            },
        },
    },
    {
        "name": "luu_so_dien_thoai",
        "description": "GHI số điện thoại của khách vào hệ thống để người phụ trách gọi hỗ trợ tư vấn / xác nhận khi khách chủ động để lại số.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sdt": {"type": "string", "description": "Số điện thoại di động 10 số của khách"},
                "ghi_chu": {"type": "string", "description": "Ghi chú thêm về nhu cầu của khách"},
            },
            "required": ["sdt"],
        },
    },
    {
        "name": "hen_xem",
        "description": "GHI lịch hẹn khách đi xem MỘT căn đang hiện (chờ chủ nhà xác nhận rồi báo khách). Chỉ khi khách đã nói muốn xem và giờ / ngày.",
        "input_schema": {
            "type": "object",
            "properties": {"ma": {"type": "string", "description": "Mã căn, vd ABCD1234"},
                           "gio": {"type": "string", "description": "Giờ / ngày khách hẹn, viết rõ (vd \"3h chiều thứ 7\")"}},
            "required": ["ma", "gio"],
        },
    },
    {
        "name": "hoi_chu_nha",
        "description": "GHI câu khách mua muốn hỏi chủ nhà về MỘT căn đang hiện (chủ nhà trả lời thì hệ thống báo lại khách).",
        "input_schema": {
            "type": "object",
            "properties": {"ma": {"type": "string", "description": "Mã căn, vd ABCD1234"},
                           "cau_hoi": {"type": "string", "description": "Câu hỏi gửi chủ nhà, viết rõ theo ý khách"}},
            "required": ["ma", "cau_hoi"],
        },
    },
    {
        "name": "tra_du_an",
        "description": "Thông tin một dự án trong kho (chủ đầu tư, pháp lý, tiện ích, mẫu nhà) và các căn đang rao trong dự án đó.",
        "input_schema": {"type": "object", "properties": {"ten": {"type": "string"}}, "required": ["ten"]},
    },
    {
        "name": "du_an_trong_khu",
        "description": "Các dự án trong kho ở một quận / phường, kèm số căn đang rao.",
        "input_schema": {"type": "object", "properties": {"khu": {"type": "string"}}, "required": ["khu"]},
    },
    {
        "name": "so_sanh_du_an",
        "description": "So sánh 2 dự án BĐS đối đầu (chủ đầu tư, phân khúc giá m², quy mô block/tầng, tiện ích nội khu, pháp lý bàn giao) từ kho 1.388 dự án hoặc kiến thức chuyên gia để tư vấn khách mua.",
        "input_schema": {
            "type": "object",
            "properties": {
                "du_an_1": {"type": "string", "description": "Tên dự án thứ nhất (VD: 'Akari City', 'Vinhomes Grand Park')"},
                "du_an_2": {"type": "string", "description": "Tên dự án thứ hai (VD: 'Moonlight Boulevard', 'Masteri Centre Point')"},
            },
            "required": ["du_an_1", "du_an_2"],
        },
    },
    {
        "name": "tra_cuu_phong_thuy",
        "description": "Tra cứu phong thủy Bát Trạch: Cung phi, Can chi, nhóm Đông Tứ Mệnh vs Tây Tứ Mệnh, 4 hướng tốt đón tài lộc (Sinh Khí, Thiên Y, Diên Niên, Phục Vị), 4 hướng xấu và đánh giá hướng nhà đang xem theo năm sinh gia chủ.",
        "input_schema": {
            "type": "object",
            "properties": {
                "nam_sinh": {"type": "integer", "description": "Năm sinh dương lịch của gia chủ (VD: 1988, 1990)"},
                "gioi_tinh": {"type": "string", "description": "'nam' hoặc 'nu' (mặc định 'nam')"},
                "huong_nha": {"type": "string", "description": "Hướng nhà hoặc hướng ban công đang xem xét (VD: 'Đông Nam', 'Tây Nam', 'Chính Nam')"},
            },
            "required": ["nam_sinh"],
        },
    },
    {
        "name": "tham_dinh_quy_hoach",
        "description": "Thẩm định quy hoạch chi tiết và lộ giới đường/hẻm: Lộ giới mở rộng, chỉ giới xây dựng, khoảng lùi (QĐ 56/2021/QĐ-UBND TP.HCM), phân biệt đất ở hiện hữu ổn định vs đất nhóm nhà ở xây mới/hỗn hợp vs đất cây xanh/giao thông dự phóng.",
        "input_schema": {
            "type": "object",
            "properties": {
                "dia_chi": {"type": "string", "description": "Địa chỉ hoặc tên đường cần tra cứu quy hoạch"},
                "quan_huyen": {"type": "string", "description": "Quận/huyện (VD: 'Quận 7', 'Bình Thạnh', 'Thủ Đức')"},
            },
            "required": ["dia_chi"],
        },
    },
    {
        "name": "goi_y_dam_phan",
        "description": "Gợi ý khoảng giá đàm phán thương lượng thực chiến theo loại hình BĐS tại TP.HCM (3 mức: Bid mở màn ép giá, Mức mục tiêu dễ chốt cọc, Mức bớt lộc) và các đòn bẩy thương lượng cọc nhanh.",
        "input_schema": {
            "type": "object",
            "properties": {
                "gia_vnd": {"type": "integer", "description": "Giá chủ nhà đang rao bằng VNĐ"},
                "ma": {"type": "string", "description": "Mã căn đang xem nếu muốn lấy giá từ căn đó"},
                "loai_hinh": {"type": "string", "description": "Loại hình: 'can_ho', 'nha_pho', 'mat_tien', 'dat_nen'"},
                "khu_vuc": {"type": "string", "description": "Quận/huyện khảo sát"},
            },
        },
    },
    {
        "name": "bo_loc_gia_dinh",
        "description": "Tư vấn bộ tiêu chuẩn lựa chọn nhà ở cho gia đình đa thế hệ (ông bà, trẻ nhỏ): Tầng trung lý tưởng 8-18, căn góc 2 mặt thoáng, ban công Đông Nam mát mẻ, an toàn nội khu, tránh cửa phòng rác / buồng thang máy.",
        "input_schema": {
            "type": "object",
            "properties": {
                "khu_vuc": {"type": "string", "description": "Khu vực tìm kiếm"},
                "ngan_sach": {"type": "string", "description": "Ngân sách dự kiến"},
                "so_phong_ngu": {"type": "string", "description": "Số phòng ngủ (mặc định 2)"},
                "uu_tien": {"type": "string", "description": "Ưu tiên đặc biệt của gia đình (VD: 'gần trường học', 'ban công mát')"},
            },
        },
    },
]
GHI_DU_PHONG = ("hen_xem", "hoi_chu_nha", "luu_so_dien_thoai")
CONG_CU_DOC = [c for c in CONG_CU if c["name"] not in GHI_DU_PHONG]   # bước 2 vòng gộp: chỉ đọc (bước ghi đã đóng)


# ---------------------------------------------------------------------------------------------------------------------------------------------
# Bước 1 của vòng agent gộp phía mua (SRS-5.1zzzzzzz380, chủ dự án 03/11: "Phía mua đi cùng kiểu vòng gộp như phía bán"): công cụ GHI cắt từ
# schema form mua gọn (không viết lại định nghĩa ô) — kết quả gom vào kế hoạch cùng dạng form, engine áp qua đúng đường cũ
# (`_chon_nhu_cau` + `BuyerLead.update`, `_loc_viec_mua` + `_viec_mua`: ghi_hen_xem / ghi_hoi_chu_nha / chống trùng / xin số một lần).
# ---------------------------------------------------------------------------------------------------------------------------------------------
GHI = ("ghi_nhu_cau", "viec_can", "ghi_y_khach")

HUONG_DAN_GHI = (
    "\n\n=== BƯỚC 1 — ĐỌC Ý KHÁCH VÀ GHI VÀO HỆ THỐNG (gọi công cụ; CHƯA viết lời gửi khách) ===\n"
    "Lượt này em làm HAI việc cùng lúc: ghi điều khách nói vào hệ thống và trả lời khách. Bước 1: đọc tin khách mới nhất (các tin trước chỉ là "
    "ngữ cảnh), GỌI CÔNG CỤ cho từng việc ghi — gọi hết trong MỘT lượt; luôn gọi ghi_y_khach (ít nhất user_intent). Hệ thống áp từng lần ghi "
    "qua cổng kiểm rồi trả kết quả: đã ghi gì, bỏ ô nào vì sao, ý còn thiếu và VIỆC LƯỢT NÀY — bước 2 em mới viết lời gửi khách (bước 2 có công "
    "cụ tra kho). Ở bước 1 KHÔNG viết lời gửi khách.\n"
    "Kết quả có dòng \"Sẽ BỎ\" (cụm trích không nằm nguyên trong lời khách) thì sửa cụm trích đúng nguyên văn rồi gọi lại, hoặc thôi.\n\n"
    "LUẬT ĐỌC Ý (mọi lượt; khoá trong luật là khoá của công cụ: buyer_lead → ghi_nhu_cau, khối \"mua\" → viec_can, còn lại → ghi_y_khach):\n"
)


def cong_cu_ghi() -> list[dict[str, Any]]:
    from .prompts import operations_schema_mua
    p = operations_schema_mua()["properties"]
    return [
        {"name": "ghi_nhu_cau",
         "description": "Ghi ô nhu cầu tìm mua / thuê khách nói ở bộ nhu cầu đang nói (" + str(p["buyer_lead"].get("description") or "")
                        + ") Mỗi ô có giá trị chữ kèm bang_chung = NGUYÊN VĂN cụm trong lời khách làm căn cứ (nhãn nhu_cau / nhu_cau_moi / "
                        "nhu_cau_thoi không cần).",
         "input_schema": {"type": "object", "properties": {
             "fields": {"type": "object", "properties": copy.deepcopy(p["buyer_lead"]["properties"])},
             "bang_chung": {"type": "object", "description": "ô → nguyên văn cụm trong lời khách", "additionalProperties": {"type": "string"}}},
             "required": ["fields", "bang_chung"]}},
        {"name": "viec_can",
         "description": "Việc khách muốn làm với căn đang rao (khối \"mua\" trong luật): quan tâm, hẹn xem, hỏi chủ nhà, xin ảnh, chê căn, "
                        "ngưng / bật báo căn, hỏi / tìm dự án, căn cụ thể. Hệ thống LÀM NGAY sau bước này (mã căn đối chiếu kho).",
         "input_schema": {"type": "object", "properties": copy.deepcopy(p["mua"]["properties"])}},
        {"name": "ghi_y_khach",
         "description": "Ý khách lượt này ngoài nhu cầu / việc căn: ý định (user_intent), hỏi về, pháp lý, xưng hô, xin người thật, lời xã "
                        "giao, đã đủ thông tin căn, chấm sao…",
         "input_schema": {"type": "object", "properties": {k: copy.deepcopy(v) for k, v in p.items() if k not in ("buyer_lead", "mua")}}},
    ]


def chay_ghi(engine: Any, conv: Any, ten: str, vao: dict[str, Any], plan: dict[str, Any], st: dict[str, Any]) -> tuple[str, bool]:
    """Thân công cụ ghi bước 1: kiểm rồi gom vào kế hoạch (chưa áp). Trả (lời cho model, có cần mở thêm vòng để model sửa cụm trích)."""
    from .agent_gop import SUA
    if ten == "ghi_nhu_cau":
        fields = vao.get("fields") if isinstance(vao.get("fields"), dict) else {}
        bc = vao.get("bang_chung") if isinstance(vao.get("bang_chung"), dict) else {}
        giu, bo = engine._loc_nhu_cau(conv, fields, bc)   # cổng trích: ô nhu cầu chỉ ghi điều khách nói
        plan.setdefault("buyer_lead", {}).update(giu)
        for k in giu:
            st["bo"].pop(k, None)
        st["bo"].update({k: (v, ly) for k, v, ly in bo})
        st["nhan"] = list(dict.fromkeys(st["nhan"] + [k for k in giu if not k.startswith("nhu_cau")]))
        return ("Ghi: " + (", ".join(giu) or "-") + (
            f". {SUA} vì cụm trích không nằm nguyên trong lời khách: {', '.join(k for k, _v, _l in bo)} — sửa cụm trích đúng nguyên văn rồi gọi "
            "lại, hoặc thôi." if bo else ".")), bool(bo)
    if ten == "viec_can":
        mua = plan.setdefault("mua", {})
        for k, v in vao.items():
            if k == "ma_can" and isinstance(v, list):
                mua["ma_can"] = list(dict.fromkeys([*(mua.get("ma_can") or []), *v]))
            elif v not in (None, "", [], {}):
                mua[k] = v
        return "Đã nhận — hệ thống làm sau bước này (mã căn đối chiếu kho; kết quả ở bước 2).", False
    if ten == "ghi_y_khach":
        for k, v in vao.items():
            if v not in (None, "", [], {}):
                plan[k] = v
        return "Đã ghi.", False
    return "Không rõ công cụ.", False


def bao_cao(conv: Any, system: str, next_field: str | None, viec: list[str], can: list[dict], st: dict[str, Any]) -> str:
    """Kết quả thật sau khi engine áp kế hoạch — trả cho model ở kết quả công cụ ghi (bước "Đánh giá"), cùng khuôn `agent_gop.bao_cao`. Việc
    lượt do engine chọn (`next_field` của `BuyerLead.next_question_field`) — chỉ TRỎ về dòng dặn hỏi đã có trong lời nhắc, không chép lại."""
    from .prompts import FIELD_LABELS, NHAN_VIEC_LUOT, Y_MO_MUA
    from .schema import CAU_MO_MUA
    lead = conv.buyer_lead
    nhan = lambda k: Y_MO_MUA.get(k) or FIELD_LABELS.get(k) or k
    if "ƯU TIÊN LƯỢT NÀY" in system:
        viec_luot = "theo khối ƯU TIÊN LƯỢT NÀY trong lời nhắc"
    elif next_field == CAU_MO_MUA:
        viec_luot = "gợi căn (nếu có), rồi MỘT câu hỏi mở tuỳ chọn theo dòng dặn hỏi trong lời nhắc"
    elif next_field:
        viec_luot = f'hỏi ý "{nhan(next_field)}" theo dòng dặn hỏi trong lời nhắc (có căn thì gợi căn trước)'
    else:
        viec_luot = "gợi căn hợp (nếu có), KHÔNG hỏi thêm nhu cầu"
    dong = ["KẾT QUẢ GHI LƯỢT NÀY (hệ thống đã áp qua cổng kiểm):",
            f"- {NHAN_VIEC_LUOT}: {viec_luot} (lượt này CHỈ làm đúng việc này — câu hỏi duy nhất nếu có là câu việc này hoặc việc với căn bên "
            "dưới giao)"]
    if conv.role != "buyer" or lead is None:
        dong.append("- Người nhắn không ở vai mua lượt này — không ghi nhu cầu.")
    else:
        da = [f'{nhan(k)} = "{getattr(lead, k, None) or lead.fields.get(k)}"' for k in st["nhan"]
              if isinstance(getattr(lead, k, None) or lead.fields.get(k), str) and (getattr(lead, k, None) or lead.fields.get(k))]
        dong.append("- ĐÃ GHI nhu cầu: " + ("; ".join(da) if da else "không ô nào") + (" (hệ thống tự lưu — không báo khách đã lưu)" if da else ""))
    if st["bo"]:
        dong.append("- KHÔNG GHI (bị bỏ): " + "; ".join(f'{nhan(k)} = "{v}" — {ly}' for k, (v, ly) in st["bo"].items()))
    if "EM VỪA GHI LƯỢT NÀY" in system or "LƯỢT NÀY EM CHƯA GHI VIỆC GÌ" in system:
        dong.append("- VIỆC VỚI CĂN: theo khối " + ("EM VỪA GHI LƯỢT NÀY" if viec else "LƯỢT NÀY EM CHƯA GHI VIỆC GÌ") + " trong lời nhắc")
    else:
        dong.append("- VIỆC VỚI CĂN: " + ("; ".join(viec) if viec else "lượt này chưa ghi việc nào — không nói đã chuyển / đã báo / đã giữ lịch"))
    if lead is not None and conv.role == "buyer":
        if can:
            dong.append(f"- Căn đang rao hợp nhu cầu: {len(can)} căn (dòng căn ở khối CĂN ĐANG RAO)")
        thieu = [nhan(o) for o in ("khu_vuc", "ngan_sach") if not (getattr(lead, o, None) or lead.fields.get(o))]
        if thieu:
            dong.append("- Ý cốt lõi còn thiếu (chưa đủ thì chưa gợi căn; câu hỏi nếu có theo việc trên): " + "; ".join(thieu))
    return "\n".join(dong)



def _chu(x: Any, n: int = 80) -> str:
    return str(x or "").strip()[:n]


def _dong(engine: Any, can: list[dict]) -> str:
    engine._gan_ke_thua(can)
    return "\n".join("- " + dong_can(c) for c in can)


def chay_cong_cu(engine: Any, conv: Any, ten: str, inp: dict, gom: list[dict]) -> str:
    """Chạy MỘT công cụ chỉ đọc; căn tra được gom vào `gom` (để các lưới soát số / ảnh của lượt biết căn đó). Lỗi → câu nói thật, không ném."""
    kho = engine._convstore
    try:
        if ten == "tim_can":
            if conv.buyer_lead is None or getattr(kho, "can_phu_hop", None) is None:
                return "Không tra được căn lúc này."
            lead = copy.deepcopy(conv.buyer_lead)
            if _chu(inp.get("ngan_sach")) and not (_chu(inp.get("ngan_sach_tu")) or _chu(inp.get("ngan_sach_den"))):
                lead.fields.pop("ngan_sach_tu", None)   # ngân sách mới nói bằng một câu → sàn / trần cũ không còn đúng
                lead.fields.pop("ngan_sach_den", None)
            lead.update({k: _chu(v) for k, v in inp.items() if k in CONG_CU[0]["input_schema"]["properties"] and _chu(v)})

            kv = _chu(lead.fields.get("khu_vuc") or getattr(lead, "khu_vuc", ""))
            ns = _chu(lead.fields.get("ngan_sach") or getattr(lead, "ngan_sach", ""))

            if not co_tieu_chi(lead):
                if kv and not ns:
                    from . import dinh_gia
                    vung = dinh_gia._phan_vung(kv)
                    bg = dinh_gia._BANG_GIA_BENCHMARK.get(vung, dinh_gia._BANG_GIA_BENCHMARK["noi_thanh"])
                    ch_min, ch_max = bg.get("can_ho", (40, 75))
                    np_min, np_max = bg.get("nha_pho", (80, 150))
                    du_an_ds = []
                    if getattr(kho, "du_an_theo_khu", None) is not None:
                        try:
                            da_list = kho.du_an_theo_khu(kv)
                            if da_list:
                                du_an_ds = [d.get("name") for d in da_list[:3] if d.get("name")]
                        except Exception:
                            pass
                    da_str = f" Dự án tiêu biểu: {', '.join(du_an_ds)}." if du_an_ds else ""
                    return (
                        f"Khách đã nêu khu vực '{kv}' nhưng CHƯA CÓ NGÂN SÁCH. Hướng dẫn tư vấn MOSO: "
                        f"(1) Khẳng định bên em có rổ hàng tốt tại {kv}; "
                        f"(2) Nêu dải giá thị trường tham khảo (căn hộ ~{ch_min}-{ch_max} triệu/m², nhà phố ~{np_min}-{np_max} triệu/m² đất.{da_str}); "
                        f"(3) Hỏi khách đang nhắm tầm tài chính khoảng bao nhiêu (hoặc nhu cầu mấy phòng ngủ) để em lọc đúng căn phù hợp nhất."
                    )
                if ns and not kv:
                    return (
                        f"Khách đã nêu ngân sách '{ns}' nhưng CHƯA CHỌN KHU VỰC. Hướng dẫn tư vấn MOSO: "
                        f"(1) Khẳng định tầm tài chính {ns} có nhiều lựa chọn tốt; "
                        f"(2) Gợi ý một số khu vực sôi động tại TP.HCM phù hợp tầm giá này; "
                        f"(3) Hỏi khách muốn ưu tiên gần nơi làm việc hoặc trường học nào để em khoanh vùng chính xác nhất."
                    )
                return "Chưa đủ khu vực và ngân sách để tìm — hỏi khách khu vực mong muốn và tầm tài chính dự kiến."

            lay = getattr(kho, "can_khong_hop", None)
            can = kho.can_phu_hop(lead, loai_tru=lay(conv.user_key) if lay is not None else None)
            gom.extend(can)
            if can:
                return "CĂN ĐANG RAO hợp tiêu chí vừa tra:\n" + _dong(engine, can)
            return (
                f"Kho chưa có căn nào khớp đủ tiêu chí (khu vực '{kv}', ngân sách '{ns}'). Nói thật điều đó, rồi: "
                "(1) gợi ý một hướng nới cụ thể theo tiêu chí khách đã nêu (khu lân cận, diện tích / loại hình gần, ngân sách) và hỏi khách có "
                "muốn em tìm theo hướng đó không; (2) có căn mới hợp thì hệ thống tự báo khách. Không nêu mặt bằng giá khu vực — kết quả tra "
                "không có số đó (sửa 08/11: bản 06/11 dặn 'nêu mặt bằng giá' khi không có dữ liệu → model bịa giá).\n"
            )
        if ten == "xem_can":
            ma = [_chu(m, 20).lstrip("#") for m in (inp.get("ma") or []) if _chu(m)][:3]
            can = kho.can_theo_ma(ma) if ma and getattr(kho, "can_theo_ma", None) is not None else []
            gom.extend(can)
            return _dong(engine, can) if can else "Không có căn nào đang hiện với mã đó (có thể đã bán / ẩn)."
        if ten == "so_sanh_can":
            ma = [_chu(m, 20).lstrip("#").upper() for m in (inp.get("ma") or []) if _chu(m)][:5]
            if len(ma) < 2:
                return "Cần ít nhất 2 mã căn để so sánh."
            can = kho.can_theo_ma(ma) if getattr(kho, "can_theo_ma", None) is not None else []
            gom.extend(can)
            if not can:
                return "Không tìm thấy các căn này trong kho để so sánh."
            dong = ["SO SÁNH CÁC CĂN TRONG KHO:"]
            for c in can:
                gia = c.get("price_vnd") or 0
                gia_text = c.get("price_text") or (f"{gia / 1_000_000_000:.2f} tỷ" if gia else "Đang cập nhật")
                dt = c.get("legal_area_m2") or c.get("usable_area_m2") or 0
                don_gia = round(gia / dt / 1_000_000, 1) if gia and dt else 0
                phap_ly = phap_ly_can(c) or "Đang cập nhật"
                dong.append(f"- Căn #{c.get('code')}: Giá {gia_text} | Đơn giá đất ~{don_gia} tr/m² | Diện tích {dt}m² | {c.get('street') or ''}, {c.get('ward') or ''} | Pháp lý: {phap_ly}")
            return "\n".join(dong)
        if ten == "tinh_thue_phi":
            from . import thue_phi
            gia_vnd = int(inp.get("gia_vnd") or 0)
            if not gia_vnd and inp.get("ma"):
                ma = _chu(inp.get("ma"), 20).lstrip("#").upper()
                can = kho.can_theo_ma([ma]) if getattr(kho, "can_theo_ma", None) is not None else []
                if can and can[0].get("price_vnd"):
                    gia_vnd = int(can[0]["price_vnd"])
            if not gia_vnd:
                return "Cần cung cấp giá trị căn nhà (gia_vnd) hoặc mã căn để tính thuế phí."
            can_duy_nhat = bool(inp.get("can_duy_nhat", False))
            return thue_phi.dinh_dang_thue_phi_chat(gia_vnd, can_duy_nhat=can_duy_nhat)
        if ten == "tinh_vay_tra_gop":
            from . import tai_chinh
            gia_vnd = int(inp.get("gia_vnd") or 0)
            if not gia_vnd and inp.get("ma"):
                ma = _chu(inp.get("ma"), 20).lstrip("#").upper()
                can = kho.can_theo_ma([ma]) if getattr(kho, "can_theo_ma", None) is not None else []
                if can and can[0].get("price_vnd"):
                    gia_vnd = int(can[0]["price_vnd"])
            tham_khao = tai_chinh.khoi_tai_chinh().strip()
            if not gia_vnd:
                return tham_khao + "\n(Chưa có giá căn nên chưa tính trả góp — khách cho biết tầm giá hoặc căn cụ thể thì tính được.)"
            ty_le = float(inp.get("ty_le_vay") or 0.7)
            so_nam = int(inp.get("so_nam") or 20)
            lai_suat = float(inp.get("lai_suat_nam") or 7.5)
            return tham_khao + "\n\n" + tai_chinh.dinh_dang_vay_chat(gia_vnd, ty_le_vay=ty_le, so_nam=so_nam, lai_suat_nam=lai_suat)
        if ten in ("hen_xem", "hoi_chu_nha", "luu_so_dien_thoai"):
            return _ghi_viec(engine, conv, ten, inp, gom)
        if ten == "tra_du_an":
            t = _chu(inp.get("ten"))
            if not t or getattr(kho, "tra_du_an", None) is None:
                return "Thiếu tên dự án."
            nghia = getattr(engine._dia_danh, "du_an_theo_nghia", None)
            kq = kho.tra_du_an(t, theo_nghia=nghia) if nghia else kho.tra_du_an(t)
            ra = du_an_mua.khoi_du_an(kq)
            if kq.get("khop") in ("ro", "gan") and isinstance(kq.get("du_an"), dict) and getattr(kho, "can_trong_du_an", None) is not None:
                thue = getattr(conv.buyer_lead, "loai_giao_dich", "mua") == "thue"
                can = kho.can_trong_du_an(str(kq["du_an"].get("id") or ""), thue=thue)
                gom.extend(can)
                engine._gan_ke_thua(can)
                ra += du_an_mua.khoi_can_du_an({**kq, "can": can})
            return ra.strip() or "Kho chưa có dự án tên này."
        if ten == "du_an_trong_khu":
            khu = _chu(inp.get("khu"))
            if not khu or getattr(kho, "du_an_theo_khu", None) is None:
                return "Thiếu tên khu."
            return du_an_mua.khoi_du_an_khu({"khu": khu, "ds": kho.du_an_theo_khu(khu)}).strip() or "Kho chưa có dự án ở khu này."
        if ten == "so_sanh_du_an":
            from . import du_an_so_sanh
            d1 = _chu(inp.get("du_an_1"))
            d2 = _chu(inp.get("du_an_2"))
            if not d1 or not d2:
                return "Cần cung cấp đủ tên 2 dự án (du_an_1 và du_an_2) để so sánh."
            return du_an_so_sanh.so_sanh_hai_du_an(engine, conv, d1, d2)
        if ten == "tra_cuu_phong_thuy":
            from . import phong_thuy
            nam = int(inp.get("nam_sinh") or 0)
            if not nam:
                return "Cần cung cấp năm sinh của gia chủ để tra cứu phong thủy."
            gt = _chu(inp.get("gioi_tinh")) or "nam"
            huong = _chu(inp.get("huong_nha"))
            return phong_thuy.dinh_dang_phong_thuy_chat(nam, gioi_tinh=gt, huong_nha=huong or None)
        if ten == "tham_dinh_quy_hoach":
            from . import quy_hoach
            dc = _chu(inp.get("dia_chi"))
            if not dc:
                return "Cần cung cấp địa chỉ hoặc tên đường để thẩm định quy hoạch."
            qh = _chu(inp.get("quan_huyen"))
            return quy_hoach.tra_cuu_quy_hoach_lo_gioi(dc, quan_huyen=qh)
        if ten == "goi_y_dam_phan":
            from . import dam_phan
            gia_vnd = int(inp.get("gia_vnd") or 0)
            if not gia_vnd and inp.get("ma"):
                ma = _chu(inp.get("ma"), 20).lstrip("#").upper()
                can = kho.can_theo_ma([ma]) if getattr(kho, "can_theo_ma", None) is not None else []
                if can and can[0].get("price_vnd"):
                    gia_vnd = int(can[0]["price_vnd"])
            if not gia_vnd:
                return "Cần cung cấp giá rao (gia_vnd) hoặc mã căn để gợi ý khoảng giá đàm phán."
            lh = _chu(inp.get("loai_hinh")) or "nha_pho"
            kv = _chu(inp.get("khu_vuc"))
            return dam_phan.goi_y_khoang_gia_dam_phan(gia_vnd, loai_hinh=lh, khu_vuc=kv)
        if ten == "bo_loc_gia_dinh":
            from . import tieu_chi_gia_dinh
            kv = _chu(inp.get("khu_vuc"))
            ns = _chu(inp.get("ngan_sach"))
            spn = _chu(inp.get("so_phong_ngu")) or "2"
            ut = _chu(inp.get("uu_tien"))
            return tieu_chi_gia_dinh.tu_van_tieu_chi_gia_dinh(khu_vuc=kv, ngan_sach=ns, so_phong_ngu=spn, uu_tien=ut)
    except Exception as e:  # noqa: BLE001 — tra lỗi thì nói thật, lượt vẫn trả lời
        log.warning("Agent mua: công cụ %s lỗi: %s", ten, type(e).__name__)
        return "Tra kho lỗi — nói thật là em chưa tra được, không đoán."
    return "Không rõ công cụ."


def _ghi_viec(engine: Any, conv: Any, ten: str, inp: dict, gom: list[dict]) -> str:
    """Việc GHI của vòng agent (SRS-5.1zzzzzzz292, SRS-5.1zzzzzzz389): bóc tách bỏ sót hẹn xem / câu hỏi chủ nhà / SĐT thì Sonnet ghi được qua công cụ."""
    kho = engine._convstore
    if ten == "luu_so_dien_thoai":
        # Sửa 08/11: số phải là SĐT di động VN hợp lệ (`tim_sdt`, cùng bộ nhận với bóc tách) và — khi có lịch sử — nằm trong lời khách
        # gần đây; bản 06/11 lưu bất cứ chuỗi nào model truyền (model chép sai một số là lưu số sai, báo admin gọi nhầm người).
        sdt = tim_sdt(_chu(inp.get("sdt")))
        if not sdt:
            return "Chưa lưu: số không phải SĐT di động Việt Nam hợp lệ (10 số, đầu 03/05/07/08/09) — nhờ khách gõ lại, KHÔNG nói đã lưu."
        lich_su = [t.content for t in (getattr(conv, "history", None) or []) if getattr(t, "role", "") == "user" and t.content][-6:]
        if lich_su and sdt not in {tim_sdt(x) for x in lich_su}:
            return "Chưa lưu: số này không có trong tin khách vừa gửi — KHÔNG nói đã lưu; chỉ lưu đúng số khách gõ."
        bid = kho.khach_mua(conv.user_key) if getattr(kho, "khach_mua", None) is not None else None
        if not bid:
            return "Chưa lưu được số điện thoại (chưa có hồ sơ khách) — KHÔNG nói đã lưu."
        ok = kho.ghi_sdt_hen_xem(bid, sdt)
        if ok:
            # SRS-5.1zzzzzzz417 (kịch bản production 11/11: khách chưa chọn căn, để số → bot nói "người phụ trách sẽ gọi xác nhận lịch xem cuối
            # tuần"): kết quả cũ không nói gì về lịch nên model tự suy ra có lịch. Nay nói đúng lịch đang chờ trong kho.
            lay = getattr(kho, "lich_dang_cho", None)
            return ket_qua_luu_sdt(lay(bid) if lay is not None else [])
        return "Chưa lưu được số điện thoại (lỗi kho)."
    hen = ten == "hen_xem"
    ma = _chu(inp.get("ma"), 20).lstrip("#").upper()
    noi = _chu(inp.get("gio") if hen else inp.get("cau_hoi"), 300)
    if not ma or not noi:
        return "Chưa ghi: thiếu mã căn hoặc " + ("giờ hẹn" if hen else "câu hỏi") + " — hỏi lại khách, KHÔNG nói đã ghi."
    can = kho.can_theo_ma([ma]) if getattr(kho, "can_theo_ma", None) is not None else []
    if not can:
        return "Chưa ghi: không có căn đang hiện với mã đó — KHÔNG nói đã ghi."
    c = can[0]
    gom.append(c)
    da = conv.y_luot.setdefault(f"_da_ghi_{ten}", set())
    if c.get("id") in da:
        return "Việc này đã ghi ở lượt này rồi (xem khối EM VỪA GHI) — không ghi lại."
    bid = kho.khach_mua(conv.user_key) if getattr(kho, "khach_mua", None) is not None else None
    ok = bool(bid) and (kho.ghi_hen_xem(bid, c, noi) if hen else kho.ghi_hoi_chu_nha(bid, c, noi))
    if not ok:
        return "Chưa ghi được (lỗi kho) — nói thật là em chưa ghi được, KHÔNG nói đã ghi."
    da.add(c.get("id"))
    kho.ghi_quan_tam(bid, [str(c.get("code"))])
    log.warning("Agent mua: ghi %s qua công cụ (bóc tách không đọc ra)", ten)
    if not hen:
        return (f"ĐÃ GHI câu hỏi gửi chủ nhà căn #{c.get('code')}: \"{noi}\". Chủ nhà trả lời thì hệ thống tự nhắn khách (không có mốc giờ) — "
                "báo khách MỘT lần là đã chuyển, không hứa giờ.")
    ra = f"ĐÃ GHI: lịch hẹn xem căn #{c.get('code')} ({noi}) — chờ xác nhận với chủ nhà rồi báo lại khách."
    lead = conv.buyer_lead
    if lead is not None and not lead.fields.get("_da_xin_sdt"):   # xin số MỘT lần khi chốt lịch (SRS-148), cùng cờ với đường cũ
        lead.fields["_da_xin_sdt"] = "1"
        ra += (" Xin khách MỘT số điện thoại để người phụ trách gọi xác nhận lịch (câu hỏi DUY NHẤT của lượt; khách không muốn thì thôi).")
    return ra


def ket_qua_luu_sdt(lich: list[dict]) -> str:
    """SRS-5.1zzzzzzz417: sự thật sau khi lưu số điện thoại khách mua — MỘT nguồn cho đường bóc tách (`Engine._viec_mua`) và công cụ
    `luu_so_dien_thoai`. Nói đúng lịch đang chờ trong kho; chưa có lịch thì nói chưa có (kịch bản production 11/11: khách chưa chọn căn, để số
    → bot hứa "gọi xác nhận lịch xem cuối tuần" vì câu cũ ghi cứng "gọi xác nhận lịch / tư vấn")."""
    if lich:
        ds = "; ".join(f"căn #{x.get('listing_code')} ({x.get('time_text')})" for x in lich)
        return f"ĐÃ LƯU số điện thoại khách. Lịch xem đang chờ xác nhận: {ds} — người phụ trách gọi xác nhận lịch này."
    return "ĐÃ LƯU số điện thoại khách; người phụ trách sẽ gọi tư vấn. Chưa có lịch xem nào được ghi (chưa chốt căn và giờ xem)."


def chay(engine: Any, conv: Any, system: str, max_tokens: int) -> tuple[str, list[dict]]:
    """Một lượt trả lời có công cụ. Trả (lời gửi khách, các căn công cụ đã tra). Hết trần mà model chưa viết lời → `reply` thường kèm kết quả tra."""
    from .llm.base import RANH_GIOI_CACHE
    he = system.replace(RANH_GIOI_CACHE, HUONG_DAN + RANH_GIOI_CACHE, 1) if RANH_GIOI_CACHE in system else system + HUONG_DAN
    tin: list[dict] = [{"role": m.role, "content": m.content} for m in conv.messages()]
    gom: list[dict] = []
    ket: list[str] = []
    da_goi: list[str] = []
    loi = ""
    bat_dau = time.monotonic()
    for vong in range(MAX_VONG):
        turn = engine._provider.converse(he, tin, CONG_CU, max_tokens=max_tokens)
        if not turn.tool_calls:
            loi = (turn.text or "").strip()   # lời cuối — chữ ở lượt có gọi công cụ ("để em xem") KHÔNG gửi khách
            break
        if vong == MAX_VONG - 1 or time.monotonic() - bat_dau > HAN_GIAY:
            break
        tin.append({"role": "assistant", "content": turn.assistant_content})
        kq = []
        for c in turn.tool_calls:
            da_goi.append(c.name)
            r = chay_cong_cu(engine, conv, c.name, dict(c.input or {}), gom)[:TRAN_KET_QUA]
            ket.append(f"[{c.name}] {r}")
            kq.append({"type": "tool_result", "tool_use_id": c.id, "content": r})
        tin.append({"role": "user", "content": kq})
    if not loi:
        them = ("\n\n=== KẾT QUẢ EM VỪA TRA KHO (hệ thống tra, không phải khách nói) ===\n" + "\n".join(ket) + "\n") if ket else ""
        loi = engine._provider.reply(system + them, conv.messages(), max_tokens=max_tokens).strip()
    # Một dòng mỗi lượt để đo vòng / độ trễ (không in lời khách, không in kết quả tra).
    log.warning("Agent mua: công_cụ=%s căn_tra=%d giây=%.1f", ",".join(da_goi) or "-", len(gom), time.monotonic() - bat_dau)
    return loi, gom
