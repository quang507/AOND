"""Vòng agent phía BÁN — B2 bước 2 (chủ dự án 30/10/2026: "làm nốt b2 nhưng vẫn lưu các hàm để dễ gọi").

Lượt viết lời cho người rao không nhét sẵn các khối DỮ LIỆU vào prompt mọi lượt (rổ hàng, bộ nhớ dự án, giá khách đã gửi) — prompt chỉ còn MỘT
dòng báo có dữ liệu gì, model tự gọi công cụ tra khi cần. Thân công cụ là CHÍNH các hàm khối cũ của engine (`_basket_block`,
`_project_memory_block`, `_seller_price_block`) — không viết lại. Dự án có bảng căn thì kèm luôn bộ
công cụ kho dự án cũ (`_inventory_tools` / `_exec_tool`). Bóc tách ô vẫn là Haiku + cổng bằng chứng như cũ (không đổi tiền mỗi lượt).

Bổ sung bộ công cụ Function Calling cho luồng Ký gửi / Bán (SRS-5.1zzzzzzz390):
- dinh_gia_tham_khao: tra cứu khoảng giá thị trường/định giá sơ bộ (AVM) theo khu vực, đường, dự án và loại hình.
- kiem_tra_phap_ly_so: tra cứu điều kiện pháp lý, sổ đỏ/sổ hồng, thế chấp ngân hàng, chưa hoàn công, vi bằng theo Luật Đất đai 2024.
- tinh_phi_moi_gioi: tính phí môi giới minh bạch (bán 1%, thuê 0.75 tháng), khẳng định chính sách "Chỉ thu khi giao dịch thành công — 0 đồng trước".

Có trần như phía mua: tối đa `MAX_VONG` lần gọi model, ngừng tra sau `HAN_GIAY` giây; hết trần mà chưa có lời thì viết lời thường kèm kết quả đã
tra. Chạy cho mọi người bán (công tắc AGENT_BAN gỡ ở Đợt 8)."""
from __future__ import annotations

import logging
import time
from typing import Any

log = logging.getLogger(__name__)

MAX_VONG = 3        # lần gọi model tối đa trong một lượt (2 lượt tra + lời cuối) — cùng trần phía mua
HAN_GIAY = 25.0     # trần lõi 40 s, bridge chờ 90 s
TRAN_KET_QUA = 6000

HUONG_DAN = (
    "\n\n=== CÔNG CỤ TRA DỮ LIỆU CỦA KHÁCH (chỉ ĐỌC) ===\n"
    "Dữ liệu dưới đây KHÔNG nằm sẵn trong lời nhắc — dòng \"DỮ LIỆU CÓ THỂ TRA\" ở cuối cho biết lượt này có gì. Tự quyết có cần tra không: "
    "lượt chỉ hỏi / khen một ô tin thì KHÔNG tra.\n"
    "- ro_hang: khách đang có nhiều căn và báo một việc lên 'một căn' (đã bán, đổi giá, có khách…) hoặc nói chưa rõ căn nào. Lời khách "
    "không chỉ ra được căn nào → HỎI LẠI căn nào (nêu địa chỉ các căn để khách chọn), KHÔNG tự nhận là căn nào, KHÔNG nói đã đổi trạng thái.\n"
    "- bo_nho_du_an: khách hỏi / nhắc về dự án, mẫu nhà, phân lô, bảng giá dự án.\n"
    "- gia_da_gui: khách hỏi lại giá căn của họ đã gửi (bảng giá, các căn khách đã gửi). Nói với khách KHÔNG dùng chữ \"rổ\".\n"
    "- dinh_gia_tham_khao: khách hỏi giá thị trường khu này bao nhiêu, giá họ đưa ra cao hay thấp, hoặc nhờ định giá căn nhà/căn hộ/đất nền gửi bán.\n"
    "- kiem_tra_phap_ly_so: khách hỏi về sổ đỏ/sổ hồng, nhà chưa hoàn công, nhà đang thế chấp ngân hàng, mua bán vi bằng, giấy tờ công chứng cần chuẩn bị.\n"
    "- tinh_phi_moi_gioi: khách hỏi phí dịch vụ, hoa hồng môi giới, ký gửi có mất tiền không, hoặc chính sách thu phí.\n"
    "Chỉ nói điều kết quả tra ghi; tra không ra thì nói thật là chưa có, không đoán. Lời gửi khách viết ở lượt cuối, sau khi tra xong; không "
    "viết 'để em tra / em kiểm tra'.\n"
)

CONG_CU: list[dict[str, Any]] = [
    {"name": "ro_hang", "description": "Danh sách các căn khách (người rao) đã gửi (căn nào đang nói tới).",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "bo_nho_du_an", "description": "Bộ nhớ dự án của căn đang nói: thông tin chung, mẫu nhà, tài liệu phân lô / bảng giá đã có.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "gia_da_gui", "description": "Giá các căn khách (người rao) đã gửi — từ bảng giá và các căn khách đã gửi.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "dinh_gia_tham_khao",
     "description": "Định giá sơ bộ / tra cứu giá thị trường tham khảo (AVM) theo khu vực (quận/huyện/tỉnh, phường, đường hoặc dự án), loại hình BĐS và diện tích. Trả về đơn giá m² đất/nhà tham khảo và dải giá gợi ý ±10% để chủ nhà cân đối khi ký gửi bán/cho thuê. Gọi khi khách hỏi giá thị trường khu này bao nhiêu, giá họ đưa cao hay thấp, hoặc nhờ định giá.",
     "input_schema": {
         "type": "object",
         "properties": {
             "khu_vuc": {"type": "string", "description": "Quận/huyện/tỉnh (VD: 'Quận 7', 'Bình Thạnh', 'Thủ Đức', 'Nhà Bè')"},
             "phuong": {"type": "string", "description": "Phường/xã (VD: 'Tân Phong', 'Phường 25')"},
             "duong": {"type": "string", "description": "Tên đường (VD: 'Nguyễn Thị Thập')"},
             "du_an": {"type": "string", "description": "Tên chung cư / dự án nếu có"},
             "loai_hinh": {"type": "string", "description": "Loại hình: nha_pho, can_ho, dat_nen, biet_thu, kho_xuong, mat_bang..."},
             "dien_tich": {"type": "number", "description": "Diện tích m² (đất hoặc sàn)"},
             "gia_chu_dinh_ban": {"type": "number", "description": "Mức giá khách đang định rao bán/cho thuê (VND) để đối chiếu nếu có"},
             "deal": {"type": "string", "enum": ["ban", "thue"], "description": "ban (bán) hoặc thue (cho thuê)"}
         }
     }},
    {"name": "kiem_tra_phap_ly_so",
     "description": "Tra cứu quy định pháp lý, điều kiện giao dịch và thủ tục sang tên sổ đỏ/sổ hồng cho người gửi bán (sổ riêng, sổ chung, chưa hoàn công, nhà mua bằng vi bằng, đang thế chấp ngân hàng, nhà thừa kế/đồng sở hữu, quy hoạch lộ giới, hồ sơ cần chuẩn bị). Trả về căn cứ pháp lý theo Luật Đất đai 2024 và Luật Công chứng 2024.",
     "input_schema": {
         "type": "object",
         "properties": {
             "chu_de": {"type": "string", "description": "Chủ đề pháp lý cần tra (VD: 'chua_hoan_cong', 'nha_the_chap', 'so_do_so_hong', 'vi_bang', 'ho_so_ban_nha', 'thue_phi_sang_ten', 'quy_hoach_lo_gioi', 'tai_san_chung_vo_chong')"},
             "chi_tiet": {"type": "string", "description": "Câu hỏi cụ thể hoặc mô tả giấy tờ của khách"}
         },
         "required": ["chu_de"]
     }},
    {"name": "tinh_phi_moi_gioi",
     "description": "Tính phí môi giới và hoa hồng ký gửi minh bạch khi khách hỏi về chi phí dịch vụ, hoa hồng bên em tính sao, hoặc bán/thuê thành công thì mất bao nhiêu phí. Khẳng định chính sách 'Chỉ thu khi giao dịch thành công — 0 đồng trước' và quyền lợi bảo mật ẩn số nhà, che SĐT.",
     "input_schema": {
         "type": "object",
         "properties": {
             "gia_vnd": {"type": "number", "description": "Giá bán mong muốn (VND) hoặc tiền thuê mỗi tháng (VND)"},
             "vai_nguoi_gui": {"type": "string", "enum": ["chu_nha", "moi_gioi"], "description": "chu_nha (chủ nhà: 1% bán, 0.75 tháng thuê) hoặc moi_gioi (môi giới/sàn: 0.5% bán, 0.75 tháng thuê)"},
             "loai_giao_dich": {"type": "string", "enum": ["ban", "thue"], "description": "ban (bán) hoặc thue (cho thuê)"}
         }
     }}
]
_TEN = {c["name"] for c in CONG_CU}


def _khoi(engine: Any, conv: Any, project: Any, ten: str, vao: dict[str, Any] | None = None) -> str:
    """Thân công cụ = hàm khối cũ của engine + các công cụ định giá, pháp lý và phí môi giới."""
    vao = vao or {}
    if ten == "ro_hang":
        return engine._basket_block(conv)
    if ten == "bo_nho_du_an":
        return engine._project_memory_block(project, conv)
    if ten == "gia_da_gui":
        return engine._seller_price_block(conv)
    if ten == "dinh_gia_tham_khao":
        from .dinh_gia import dinh_gia_tham_khao_tool
        return dinh_gia_tham_khao_tool(engine, conv, project, vao)
    if ten == "kiem_tra_phap_ly_so":
        from .dinh_gia import kiem_tra_phap_ly_so_tool
        return kiem_tra_phap_ly_so_tool(vao)
    if ten == "tinh_phi_moi_gioi":
        from .dinh_gia import tinh_phi_moi_gioi_tool
        return tinh_phi_moi_gioi_tool(conv, vao)
    return ""


def goi_y(engine: Any, conv: Any, project: Any) -> str:
    """MỘT dòng cho model biết lượt này có dữ liệu gì để tra (không có gì thì rỗng — model khỏi gọi công cụ thừa)."""
    co = [ten for ten in ("ro_hang", "bo_nho_du_an", "gia_da_gui") if _khoi(engine, conv, project, ten).strip()]
    return ("\nDỮ LIỆU CÓ THỂ TRA lượt này: " + ", ".join(co) + " (gọi công cụ cùng tên khi cần).\n") if co else ""


def chay(engine: Any, conv: Any, project: Any, system: str, max_tokens: int) -> tuple[str, str]:
    """Một lượt trả lời có công cụ. Trả (lời gửi khách, khối kết quả đã tra để các lần soát / gọi lại của lượt dùng tiếp)."""
    from .engine import _AGENT_TOOL_GUIDE
    from .llm.base import RANH_GIOI_CACHE
    kho_du_an = project is not None and bool(getattr(project, "units", None))
    huong_dan = HUONG_DAN + (_AGENT_TOOL_GUIDE if kho_du_an else "")
    he = system.replace(RANH_GIOI_CACHE, huong_dan + RANH_GIOI_CACHE, 1) if RANH_GIOI_CACHE in system else system + huong_dan
    cong_cu = CONG_CU + (engine._inventory_tools() if kho_du_an else [])
    tin: list[dict] = [{"role": m.role, "content": m.content} for m in conv.messages()]
    ket: list[str] = []
    da_goi: list[str] = []
    loi = ""
    bat_dau = time.monotonic()
    for vong in range(MAX_VONG):
        turn = engine._provider.converse(he, tin, cong_cu, max_tokens=max_tokens)
        if turn.stop_reason == "du_phong":
            # Claude lỗi → model dự phòng (Gemini / Groq) không gọi được công cụ và prompt đã bỏ các khối dữ liệu: bỏ lời đó, viết lại như
            # đường cũ với ĐỦ khối (cùng hàm khối) — không để lượt dự phòng mù rổ hàng / bảng giá.
            them = "".join(_khoi(engine, conv, project, t) for t in ("ro_hang", "bo_nho_du_an", "gia_da_gui"))
            log.warning("Agent bán: dự phòng không gọi công cụ — viết lại với đủ khối dữ liệu")
            return engine._provider.reply(system + them, conv.messages(), max_tokens=max_tokens).strip(), them
        if not turn.tool_calls:
            loi = (turn.text or "").strip()   # lời cuối — chữ ở lượt có gọi công cụ KHÔNG gửi khách
            break
        if vong == MAX_VONG - 1 or time.monotonic() - bat_dau > HAN_GIAY:
            break
        tin.append({"role": "assistant", "content": turn.assistant_content})
        kq = []
        for c in turn.tool_calls:
            da_goi.append(c.name)
            try:
                r = (_khoi(engine, conv, project, c.name, c.input or {}).strip() or "Không có dữ liệu này.") if c.name in _TEN else \
                    engine._exec_tool(conv, project, c) if kho_du_an else "Không rõ công cụ."
            except Exception as e:  # noqa: BLE001 — tra lỗi thì nói thật, lượt vẫn trả lời
                log.warning("Agent bán: công cụ %s lỗi: %s", c.name, type(e).__name__)
                r = "Tra lỗi — nói thật là em chưa tra được, không đoán."
            r = r[:TRAN_KET_QUA]
            ket.append(f"[{c.name}] {r}")
            kq.append({"type": "tool_result", "tool_use_id": c.id, "content": r})
        tin.append({"role": "user", "content": kq})
    them = ("\n\n=== KẾT QUẢ EM VỪA TRA (hệ thống tra, không phải khách nói) ===\n" + "\n".join(ket) + "\n") if ket else ""
    if not loi:
        loi = engine._provider.reply(system + them, conv.messages(), max_tokens=max_tokens).strip()
    # Một dòng mỗi lượt để đo vòng / độ trễ (không in lời khách, không in kết quả tra).
    log.warning("Agent bán: công_cụ=%s giây=%.1f", ",".join(da_goi) or "-", time.monotonic() - bat_dau)
    return loi, them
