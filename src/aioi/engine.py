"""Conversation engine — orchestrates the chat brain.

Per turn it: (1) silently extracts property data from the user's message into the
dynamic schema, (2) recomputes gamification scores, (3) picks the next single field to
ask about, and (4) generates a <=30-word persona reply. State is kept in-memory per
conversation (persisted to Supabase via SupabaseConversationStore).
"""
from __future__ import annotations

import difflib
import hashlib
import html as _html
import json
import logging
import re
import sqlite3
import threading
import time
import unicodedata
from urllib.parse import urlparse
from abc import ABC, abstractmethod
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from uuid import uuid4

from . import gamification as g
from . import phap_ly
from .prompts import KHOI_MOT_UU_TIEN, YEU_CAU_VIET_TOI_DA
from . import cau_mau
from . import so_token
from . import che_do_test
from .delivery import _is_formatted_post
from .prompts import _MO_DAU_RE   # dòng mở bản nháp "(📋) Em/Mình sẽ rao như vầy nhé…:" (SRS-5.1zzzzzzz132)
from .danh_gia import KHOI_SAP_XIN_SAO, cau_xin_sao, doc_sao, khoi_cam_on_sao, vua_xin_sao
from . import du_an_mua
from .anh_can import da_gui_het
from .assistants import Assistant, assign_assistant
from .drive import extract_drive_id
from .fetch import (
    DEFAULT_BATCH_BUDGET,
    FetchedMedia,
    FetchError,
    fetch_media,
    fetch_raw,
    is_drive_folder,
    sniff_media_type,
)
from .llm import LLMProvider, Message
from .llm.base import CHI_GEMINI, MODEL_CHAT_LUOT, NGUON_LUOT, RANH_GIOI_CACHE, model_chat_thu
from .web import SITE_HOST, link_tin
from . import bulk
from . import inventory as inv
from .projects import (
    InMemoryProjectStore,
    Project,
    ProjectStore,
    UnitType,
    la_ma_phieu,
    ma_phieu,
    merge_facts,
    normalize_project_name,
)
from .prompts import (
    MO_DAU_GHI_NHAN_RE,
    EXTRACTION_SYSTEM,
    OPERATIONS_SYSTEM,
    PROJECT_EXTRACTION_SYSTEM,
    UNIT_TYPE_EXTRACTION_SYSTEM,
    build_buyer_chat_system,
    khoi_tin_tra_loi,
    build_chat_system,
    build_column_map_system,
    build_project_docs_block,
    build_transcribe_instruction,
    build_fee_followup_system,
    _fee_hint,
    PT_CHU,
    PT_MG,
    PHI_THUE,
    khoi_bao_phi,
    muc_phi,
    khoi_hoi_sau_dang,
    khoi_tinh_hinh_ban,
    KHOI_DINH_GIA,
    khoi_hoi_ve_mua,
    khoi_trang_thai_web,
    TAI_LIEU_CHUNG_SYSTEM,
    tai_lieu_chung_schema,
    build_greeting,
    khoi_chao_lan_dau,
    khoi_chao_tu_van,
    build_listing_proposal_system,
    build_ngoai_vung_system,
    khoi_hoi_mat_tien,
    trong_vung_nhan_tin,
    khoi_xin_dang,
    khoi_diem_tin,
    khoi_cau_chuan,
    cat_truoc_mo_dau,
    build_inventory_instruction,
    build_media_group_instruction,
    build_media_read_instruction,
    build_project_block,
    DEED_VISION_INSTRUCTION,
    FIELD_LABELS,
    NATURAL_QUESTIONS,
    deed_extraction_schema,
    column_map_schema,
    extraction_schema,
    inventory_schema,
    inventory_scope_schema,
    media_group_schema,
    operations_schema,
    INVENTORY_SCOPE_SYSTEM,
    project_extraction_schema,
    unit_type_extraction_schema,
)
from .imaging import downscale_image
from .revenue import SellerRole
from .schema import KHOA_PHAP_LY, O_NOI_BO, O_SAU_DANG, O_TU_VAN_MUA, Property, BuyerLead, PropertyGroup, _so_nguyen
from .dia_danh import TraDiaDanh, goi_y_duong, bo_dau, khoi_dia_danh, phuong_kho_hem, ten_tran
from .xung_ho import goi_khach_la_minh, goi_toi as goi_toi_khach, tre as _xung_tre
from .mua import (co_tieu_chi, giong_sdt_sai, khoi_can_cho_khach, khoi_cau_hoi_cho, khoi_lich_dang_cho, khoi_viec_vua_ghi, lenh_tra_loi,
                  tim_sdt)
from .tai_chinh import khoi_tai_chinh
from .kho_anh import la_uuid
from .kho_tep import MediaStore, KhoTepError, extension_for, listing_folder, sanitize_filename

# Headroom so the token cap never truncates a reply. The model controls actual length
# via the prompt (brief while chatting, full ad when asked / complete).
REPLY_MAX_TOKENS = 4096
# SRS-5.1zzzzzzz240 (OPEN-28 b, FR-160): từ tin BÁN thứ mấy trong rổ thì phí tính như môi giới.
TIN_BAN_LA_MOI_GIOI = 3
# SRS-5.1zzzzzzz241 (OPEN-59 a): ô thuộc RIÊNG loại giao dịch (giá, điều kiện bán / thuê) — không chép sang tin cặp bán ↔ cho thuê.
O_GIA_RIENG_LOAI_GD = frozenset({"gia", "thuong_luong", "thue_phi", "thanh_toan", "hd_thue_con", "co_hdt", "thu_nhap_thue",
                                  "chinh_sach_thanh_toan", "phi_chuyen_nhuong", "dong_tien_thue", "muc_coc", "truot_gia"})
# SRS-5.1zzzzzzz210: giá trị `Conversation.so_nhan` của số Zalo tư vấn người mua (bridge gửi `so_nhan`); "" = số ký gửi.
SO_TU_VAN = "tu_van"

# Extracted trạng-thái intent → the stored Listing.status value.
STATUS_MAP = {"da_ban": "đã bán", "dung_ban": "dừng bán", "da_cho_thue": "đã cho thuê",
              "da_coc": "đã cọc", "khong_rao": "không rao", "thoi_dang_ky": "thôi đăng ký",
              "rao": "đang bán"}

# AOND NEVER deletes a seller's data. A seller can only RAO (advertise), stop advertising
# (KHÔNG RAO — hidden but kept), or withdraw (THÔI ĐĂNG KÝ — kept). The old "remove/clear" ops
# flip to this status instead of dropping the row, so nothing is ever lost and everything is
# reversible by rao-ing again.
KHONG_RAO = "không rao"
THOI_DANG_KY = "thôi đăng ký"

# Max PHOTOS stored per listing (documents/PDFs aren't capped). The bot still SEES every
# photo the seller sends (vision reads them all); this only bounds what's KEPT in the kho
# gốc, so a seller dumping 100 photos of one căn can't balloon storage.
MAX_PHOTOS_PER_LISTING = 20

# Hard cap on the TOTAL bytes of one send (all files/links/folders together). Over this we
# don't try to process it (a big vision/transcription job on Zalo would time out / cost a lot)
# — we escalate to a human admin who can open the chat and handle it. Keep in step with the
# fetcher's per-file guard in fetch.py.
MAX_SEND_BYTES = 20 * 1024 * 1024  # 20 MB

log = logging.getLogger(__name__)


def _image_count(media: list[dict[str, str]]) -> int:
    """How many of a listing's stored media are photos (not PDFs/docs)."""
    return sum(1 for r in media if not (r.get("filename") or "").lower().endswith(".pdf"))

# 19/10/2026 (SRS-5.1zzzzzzz55): các bộ dò từ khoá _looks_descriptive / _wants_project_facts / _wants_media /
# _looks_like_reference_doc / _affirms / _denies đã gỡ — lượt AI lập thao tác đọc theo nghĩa (xin_xem_ban_ve, cau_hoi_du_an,
# mo_ta_du_an, xac_nhan_xoa, kèm trích dẫn) và _la_tai_lieu_chung đọc bản đọc ảnh.

# Chuỗi bridge gán cho MỌI sticker Zalo (bot/bridge-zca/index.mjs, SRS-5.1zzzzzzz22): zca-js không cho biết sắc thái.
def _ten_tep_that(ten: str | None) -> bool:
    """Tên tệp có nghĩa. Máy chủ ảnh Zalo trả tên "undefined" (22/10/2026: "Em đã nhận: undefined") — tên rác coi như không có tên."""
    return bool(ten) and str(ten).strip().lower() not in ("undefined", "null", "none", "nan", "unknown", "file", "image")


from .sticker import STICKER_TRUNG_TINH, la_sticker  # noqa: E402,F401  (một nguồn ở sticker.py, SRS-5.1zzzzzzz122)
from .sticker import Y_NGHIA as STICKER_Y_NGHIA, ra_van_ban as ra_van_ban_sticker  # noqa: E402  (SRS-5.1zzzzzzz255)

# Max tool-calling steps in one agent turn (a safety cap so the loop can't run away).
MAX_AGENT_STEPS = 6

# The TOOL-usage rules appended to the seller-chat system prompt when the seller is in a project
# with an inventory: the model reasons over the sales-mode prompt AND has these tools — it decides
# per turn whether to query the catalog / add a căn / learn a fact / ask for a link, WITHOUT a
# keyword gate (that's the point of "Mảnh B": no code catching each case).
_AGENT_TOOL_GUIDE = (
    "\n\n=== CÔNG CỤ TRA RỔ HÀNG DỰ ÁN (kiến thức CHUNG) ===\n"
    "Em có công cụ tra dự án. Tự quyết khi nào cần dùng:\n"
    "- Khách nhắc một căn theo ĐẶC ĐIỂM ('căn góc', 'lớn nhất', 'view hồ', 'rẻ nhất') → dùng "
    "tim_can/tra_can để xác định ĐÓ LÀ MÃ SỐ CĂN NÀO. ĐỪNG đoán, ĐỪNG tạo căn rỗng/tin rác.\n"
    "- Khách hỏi về MẪU NHÀ ('mẫu Cosmo Gen 2', 'căn này mấy tầng/mấy phòng', 'bố trí sao') → "
    "tra_mau_nha để lấy thông số CHUNG của mẫu (đã lưu sẵn). Đây KHÔNG phải 'tra internet' — là "
    "kiến thức chung ĐÃ CÓ. TUYỆT ĐỐI đừng nói 'em không tra cứu được' khi tra_mau_nha có dữ liệu.\n"
    "- Thiếu thông tin CÔNG CỘNG (số căn/quy hoạch/chủ đầu tư...) → du_lieu_du_an để biết thiếu "
    "gì; nói thật là chưa có và XIN khách LINK trang tin cậy (em đọc & lưu lại). ĐỪNG bịa.\n"
    "- Khách cho dữ kiện CÔNG CỘNG mới về căn (diện tích, góc, quy cách bàn giao...) → ghi_nho_can/"
    "ghi_nho_du_an (kèm `nguon`) để lưu vào kiến thức chung, seller sau cũng hưởng.\n"
    "- Thêm căn vào rổ: them_can_vao_ro khi đã RÕ mã căn hoặc khách đã xác nhận (tự lấy mẫu/diện "
    "tích/quy cách từ kho chung).\n"
    "- NGƯỜI ĐANG CHAT CHÍNH LÀ NGƯỜI RAO (chủ nhà / môi giới) đang gửi bán căn của họ. GIÁ họ "
    "chào là thông tin CỦA HỌ: khi họ báo/hỏi giá, hãy TIẾP NHẬN và ghi vào RỔ của họ, hoặc nói "
    "lại giá em đang có. TUYỆT ĐỐI KHÔNG coi họ như bên thứ ba, KHÔNG nói 'để em kết nối với bên "
    "rao', KHÔNG xin số điện thoại 'để chuyển cho bên bán' — HỌ chính là bên bán.\n"
    "- 'Giá là của riêng người rao' CHỈ có nghĩa: đừng đưa giá này thành kiến thức CHUNG của dự "
    "án, và đừng lấy giá của người rao KHÁC áp lên. KHÔNG có nghĩa là né người rao đang chat.\n"
    "- Căn/mẫu/diện tích/quy cách bàn giao/quy hoạch là kiến thức CHUNG (dùng lại). Chỉ khẳng "
    "định thông tin công cộng khi CÓ NGUỒN.\n"
    # SRS-5.1zzzzzzz105 (bắn thử KB5 21/10: khách nói dtsd 245 m², mẫu Fusion trong kho 195 m² → bot đòi số lô, khách "rao tin này
    # giúp mình", "ok", "ok" mà ba lượt vẫn không đăng). Kho dự án là để GỢI Ý, lời người rao về căn CỦA HỌ là nguồn của ô tin.
    "- Số khách nói về căn của họ KHÁC thông số chung của mẫu / dự án (diện tích sàn, số tầng…): được hỏi lại MỘT lần cho chắc. "
    "Khách giữ số đó, lờ đi hay bảo đăng thì THEO LỜI KHÁCH và đi tiếp — KHÔNG đòi số lô / mã căn mới chịu đăng, KHÔNG từ chối "
    "soạn bản tin vì lệch kho (mã căn có thì tốt, không có vẫn nhận — chủ dự án 20/10/2026).\n"
)


# A sổ đỏ / legal cert in a PROJECT is treated as SHARED knowledge for its LAND facts, but the
# owner's IDENTITY must be stripped before it is stored/relayed (user decision 2026-07). These
# power a deterministic backstop under the LLM redaction in build_transcribe_instruction.
_PII_PHONE_RE = re.compile(r"(?<!\d)(?:\+?84|0)\d{9}(?!\d)")          # VN phone number
_PII_ID_RE = re.compile(r"(?<!\d)\d{9}(?:\d{3})?(?!\d)")              # CMND (9) / CCCD (12) digits
_PII_KEYWORD_RE = re.compile(r"(?i)\b(cccd|cmnd|căn cước công dân|chứng minh nhân dân)\b")
_PII_OWNER_RE = re.compile(                                          # a "Chủ sở hữu: <tên>" field
    # Personal-identity FIELD labels — the ":" requirement keeps "Ông:/Bà:" from catching a place
    # name like "Bà Rịa" (no colon). The property's own address ("Địa chỉ:" in the thửa section) is
    # a LAND fact and is left alone; only the owner's residence ("... thường trú") is stripped.
    r"(?im)^(\s*[-*>#]*\s*(?:họ và tên|họ tên|chủ sở hữu|chủ hộ|người sử dụng đất|"
    r"người mua|người bán|bên mua|bên bán|đại diện|ông|bà|năm sinh|ngày sinh|"
    r"địa chỉ thường trú|nơi thường trú)\s*[:：]).*$")
# TITLE markers of a legal cert (with diacritics — DON'T use ambiguous "so do", which collides
# with "sơ đồ"/site-map). A phân-lô/quy-hoạch title has none of these, so it's never retitled.
_LEGAL_TITLE_HINTS = ("sổ đỏ", "sổ hồng", "gcn", "gcnqsdđ", "giấy chứng nhận")


def _looks_personal_doc(markdown: str) -> bool:
    """A doc carries PERSONAL data only when there's an actual identity SIGNAL — an owner/party
    field, or a CCCD/CMND number/keyword. A mere mention of 'GCN'/'quyền sử dụng đất' (which shows
    up in phân-lô and quy-hoạch legends) is NOT enough, else a site map gets mis-flagged."""
    m = markdown or ""
    return bool(_PII_OWNER_RE.search(m) or _PII_ID_RE.search(m) or _PII_KEYWORD_RE.search(m))


def _redact_personal_data(text: str) -> str:
    """Strip personal IDENTITY from a doc kept as SHARED project knowledge: blank the value of an
    owner/party field, and any CMND/CCCD or phone number. LAND facts (diện tích, thửa, tờ, quy
    hoạch) are untouched. Deterministic backstop under the LLM redaction — belt and braces so a
    sổ đỏ AOND relays never carries someone's name/ID even if the model slips."""
    if not text:
        return text
    text = _PII_OWNER_RE.sub(r"\1 [đã ẩn]", text)
    text = _PII_PHONE_RE.sub("[đã ẩn]", text)
    text = _PII_ID_RE.sub("[đã ẩn]", text)
    return text


def _redact_doc_title(title: str) -> str:
    """A legal-cert filename often embeds the owner's name + certificate serial (e.g. 'NPD_50 …
    GCNQSDĐ 933551 … Vũ Ngọc Nga'). Replace it with a neutral, personal-data-free label. Gated on
    a LEGAL-CERT title marker so a phân-lô/sơ-đồ title is never renamed."""
    low = (title or "").lower()
    if not any(h in low for h in _LEGAL_TITLE_HINTS):
        return title
    m = re.search(r"(?:căn|can|npd|lô|lo|c)[\s_#]*(\d+)", low)
    return f"Sổ đỏ / GCN QSDĐ căn {m.group(1)}" if m else "Sổ đỏ / GCN QSDĐ (đã ẩn thông tin cá nhân)"


# DESTRUCTIVE basket ops never apply on the first read — they wait for the seller to CONFIRM, so a
# misread/garbled message can't wipe the rổ. (See Conversation.pending_destructive.)
_DESTRUCTIVE_OPS = {"clear", "keep_only", "remove"}


# Ô PHÂN LOẠI (mã slug AI đọc theo nghĩa) — không qua cổng bằng chứng lời khách (SRS-5.1zzzzzzz73; bắn thử lần 5: model không trích
# cho loai_hinh, "nha_pho" không phải chữ khách gõ, tin thành chua_ro).
_O_PHAN_LOAI = frozenset({"loai_hinh", "co_hdt"})   # `co_hdt` (SRS-5.1zzzzzzz197): "co" / "khong" AI đọc từ hiện trạng, quyết có hỏi tiền thuê không
# Ô mang SỐ ĐO (diện tích, giá, kích thước, số tầng / phòng…) — chỉ những ô này được nhận theo số (`_so_khop`). Ô chữ (thương lượng,
# pháp lý, hiện trạng…) phải khớp nguyên văn: bắn thử 19/10, khách "giá 8,5 tỷ" → AI ghi thuong_luong "thu về 8,5 tỷ", số 8,5 có
# trong lời khách nên lọt (SRS-5.1zzzzzzz76). Danh sách theo schema ô của chính hệ thống, không đọc lời khách.
_O_SO_DO = frozenset({"gia", "dien_tich", "dien_tich_dat", "dien_tich_nha", "kich_thuoc", "mat_tien", "so_tang", "so_phong_ngu",
                      "so_phong", "lo_gioi_duong", "tho_cu", "chieu_cao_tran", "tai_trong_san", "phi_quan_ly", "phi_gui_xe",
                      "muc_coc", "dong_tien_thue", "thu_nhap_thue", "gia_dien_nuoc", "ket_cau", "tang_toa"})

# Dấu đầu lượt "lời AI tả ảnh chụp thật" trong lịch sử — không phải lời khách, không làm bằng chứng ô tin (SRS-5.1zzzzzzz73).
DAU_TA_ANH_CHUP = "[Khách gửi ảnh chụp:"


def _hai_chieu_lo(fields: dict) -> str | None:
    """Ô mang hai chiều lô dạng "4 x 11m" — kích thước trước, diện tích đất sau (SRS-5.1zzzzzzz93 / 96)."""
    return next((str(x) for x in (fields.get("kich_thuoc"), fields.get("dien_tich_dat"))
                 if x and re.search(r"\d\s*[x×*]\s*\d", str(x))), None)


_VAI_RE = re.compile(r"(?i)(chính chủ|chinh chu|chủ nhà|chu nha|chủ sở hữu|chu so huu|đứng tên|dung ten|môi giới|moi gioi|\bmg\b|sàn|san giao dich|"
                     r"rổ hàng|ro hang|giỏ hàng|gio hang|chủ đầu tư|chu dau tu|\bcđt\b|\bcdt\b|lướt sóng|luot song|sang nhượng|sang nhuong|hđmb|hdmb|"
                     r"đầu tư|dau tu|bán chênh|ban chenh)")


def _vai_co_bang_chung(trich: str | None, loi_khach: list[str]) -> bool:
    """Vai người rao chỉ nhận khi cụm AI trích GỌI TÊN vai (chính chủ / môi giới / sàn / chủ đầu tư / lướt sóng…) và nằm nguyên trong một tin
    khách gần đây (SRS-5.1zzzzzzz213; luật cũ của bản TS `vaiTuCau`: "bán lô đất", "chú có căn nhà" không phải vai)."""
    t = str(trich or "").strip()
    return bool(t) and bool(_VAI_RE.search(t)) and any(_trich_dan_khop(t, c) for c in loi_khach)


def _trich_dan_khop(trich: str | None, cau: str | None) -> bool:
    """Cụm AI trích có nằm NGUYÊN trong câu khách không (bỏ dấu, bỏ dấu câu, gộp khoảng trắng) — AI đọc nghĩa, code chỉ kiểm bằng
    chứng. Dấu câu bỏ từ SRS-5.1zzzzzzz107 (bắn thử 207: khách "quận Đống Đa, Hà Nội", AI trích bỏ dấu phẩy → trượt, tin Hà Nội lọt
    vùng); chữ và số vẫn phải khớp nguyên."""
    gon = lambda s: re.sub(r"\s+", " ", _strip_accents(str(s or "")).lower()).strip()
    t = gon(trich)
    if t and t in gon(cau):
        return True
    # Cụm chỉ có ký hiệu (tim "❤️" khi khách thả cảm xúc) bỏ dấu câu là rỗng — chỉ so kiểu trên.
    tron = lambda s: re.sub(r"\s+", " ", re.sub(r"[^\w\s/]", " ", s)).strip()
    t2 = tron(t)
    return bool(t2) and t2 in tron(gon(cau))


_TIEN_TO_ID_THU = ("thu-", "b15-", "hoi-", "z-", "e2e-", "b-", "lx-", "do-")   # cùng danh sách với hàm DB la_id_thu (FR-245)


def _dap_ok_qua_dai(reply: str) -> bool:
    """Lời đáp một cái "ok" của khách mà dài hơn MỘT câu ngắn: quá 15 từ hoặc từ hai câu trở lên (SRS-5.1zzzzzzz232)."""
    cau = [c for c in re.split(r"[.!?…]+\s*|\n+", reply or "") if c.strip()]
    return len((reply or "").split()) > 15 or len(cau) > 1


def _tin_khach_sau_ban_nhap(conv: "Conversation") -> tuple[str | None, list[str]]:
    """(mốc của bản nháp 📋 gần nhất bot gửi, các tin khách gửi SAU bản nháp đó) — SRS-5.1zzzzzzz247. Không có bản nháp → (None, [])."""
    sau: list[str] = []
    for t in reversed(conv.history):
        if t.role == "assistant" and "📋" in (t.content or ""):
            return repr(t.at), sau
        if t.role == "user" and t.content:
            sau.append(t.content)
    return None, []


_XUNG_HO_CAU_RE = re.compile(r"(?<![\wÀ-ỹ/])(Anh/chị|anh/chị|Em|em)(?![\wÀ-ỹ/])")


def _xung_ho_cau(cau: str, goi: str, toi: str) -> str:
    """Câu CODE ghép (không qua model) viết sẵn "anh/chị" + "em" → đúng cách khách xưng (SRS-5.1zzzzzzz250, luật CLAUDE.md "câu code ghép gọi khách
    bằng {goi}"). Đổi một lượt (khách xưng em: "anh/chị" → "em" và "em" → "anh" không giẫm nhau). Chỉ dùng cho mảnh chữ do code viết — lời model
    đã theo khối xưng hô, đổi nữa là sai ("em" trong lời model có thể là cách gọi khách)."""
    if goi == "anh/chị" and toi == "em":
        return cau
    hoa = lambda s: s[:1].upper() + s[1:]
    bang = {"anh/chị": goi, "Anh/chị": hoa(goi), "em": toi, "Em": hoa(toi)}
    return _XUNG_HO_CAU_RE.sub(lambda m: bang[m.group(1)], cau)


def _nhieu_cau_hoi(loi: str) -> bool:
    """Lời bot hỏi khách quá MỘT câu (SRS-5.1zzzzzzz252, chủ dự án 28/10: "dặn hỏi 1 câu rồi mà nó lại hỏi nhiều thế"). Đếm dấu "?" kết câu
    trong lời CHAT — bỏ phần bản tin (từ dòng mở 📋: câu hỏi trong tin rao là của bản tin) và dấu "?" trong đường dẫn. Luật hình thức, không đoán ý."""
    chat = (loi or "").split("📋", 1)[0]
    chat = re.sub(r"https?://\S+", " ", chat)
    return len(re.findall(r"\?+", chat)) > 1


def _la_id_thu(user_key: str | None) -> bool:
    """ID thử của các ô bắn thử — chỉ để log thêm chi tiết (lời khách thật không vào log)."""
    return str(user_key or "").startswith(_TIEN_TO_ID_THU)


def _loc_viec_mua(mua: dict, cuoi: str, gan: list[str]) -> dict:
    """Việc của khách mua mà lời khách CHỐNG ĐỠ được, kiểm TỪNG việc (SRS-5.1zzzzzzz232). Cụm nguyên văn của chính việc đó là căn cứ của nó:
    `hen_xem` (nằm trong tin vừa nhắn hoặc mọi chữ có trong vài tin gần nhất), `hoi_chu_nha` (tin vừa nhắn hoặc tin gần), `hoi_du_an` /
    `ly_do` / `tim_du_an` / `du_an_khu_vuc` (tin vừa nhắn; tên chuẩn `du_an_khu_vuc_chuan` đi kèm khu đã nhận). Việc dạng cờ (`xin_anh`, `khong_hop`, `ngung_bao`, `quan_tam`) nhận khi cụm trích RIÊNG (`<việc>_trich`) có trong
    tin vừa nhắn, hoặc `trich_dan` chung có căn cứ; `khong_hop` còn nhận khi `ly_do` có căn cứ. `ma_can` / `trich_dan` đi kèm khi có việc nào
    được nhận (mã căn còn được kiểm với kho ở `_viec_mua`)."""
    chung = bool(mua.get("trich_dan")) and (_trich_dan_khop(mua.get("trich_dan"), cuoi) or _chu_co_trong_loi_khach(mua.get("trich_dan"), gan))
    rieng = lambda k: _trich_dan_khop(mua.get(f"{k}_trich"), cuoi) if mua.get(f"{k}_trich") else False
    ra: dict = {}
    hen = str(mua.get("hen_xem") or "").strip()
    if hen and (_trich_dan_khop(hen, cuoi) or _chu_co_trong_loi_khach(hen, gan)):
        ra["hen_xem"] = hen
    hoi = str(mua.get("hoi_chu_nha") or "").strip()
    if hoi and (_trich_dan_khop(hoi, cuoi) or any(_trich_dan_khop(hoi, t) for t in gan)):
        ra["hoi_chu_nha"] = hoi
    for k in ("hoi_du_an", "ly_do", "tim_du_an", "du_an_khu_vuc", "can_cu_the"):   # tim_du_an / du_an_khu_vuc: SRS-250; can_cu_the: SRS-262
        v = str(mua.get(k) or "").strip()
        if v and _trich_dan_khop(v, cuoi):
            ra[k] = v
    if "du_an_khu_vuc" in ra and str(mua.get("du_an_khu_vuc_chuan") or "").strip():
        ra["du_an_khu_vuc_chuan"] = str(mua["du_an_khu_vuc_chuan"]).strip()[:60]
    if mua.get("xin_anh") is True and (rieng("xin_anh") or chung):
        ra["xin_anh"] = True
    if mua.get("khong_hop") is True and (rieng("khong_hop") or chung or "ly_do" in ra):
        ra["khong_hop"] = True
    if mua.get("ngung_bao") in ("tat", "bat") and (rieng("ngung_bao") or chung):
        ra["ngung_bao"] = mua["ngung_bao"]
    if mua.get("quan_tam") is True and (rieng("quan_tam") or chung or "hen_xem" in ra or "hoi_chu_nha" in ra):
        ra["quan_tam"] = True
    if ra:
        for k in ("ma_can", "trich_dan"):
            if mua.get(k):
                ra[k] = mua[k]
    return ra


def _chu_co_trong_loi_khach(cum: str | None, loi_khach: list[str]) -> bool:
    """Cụm AI GHÉP từ nhiều tin ngắn của khách ("9h sáng thứ 7" từ "thứ 7" / "sáng nhé" / "9h", SRS-5.1zzzzzzz153) có bằng chứng không:
    MỌI chữ / số của cụm đều nằm trong lời KHÁCH (vài lượt gần nhất, không tính lời bot). Cụm có chữ khách chưa từng nói thì không nhận."""
    tach = lambda s: set(re.findall(r"[0-9a-z]+", re.sub(r"\s+", " ", _strip_accents(str(s or "")).lower())))
    can = tach(cum)
    return bool(can) and can <= set().union(*(tach(x) for x in loi_khach)) if loi_khach else False


def _so_khop(trich: str | None, gia_tri: str | None, loi_khach: str) -> bool:
    """Ô có SỐ: model hay viết lại đơn vị trong cụm trích ("170m²" khi khách gõ "170m vuông", "8.5 tỷ" khi khách gõ "8,5 tỷ").
    Nhận khi cụm trích có số và mọi số của cụm trích đều có trong lời khách (SRS-5.1zzzzzzz73) — giá trị ô có thể là số TÍNH ra
    (4,5x11 → 49,5m²) nên không đòi. Ô không có số (thương lượng, mới xây…) vẫn phải khớp nguyên văn."""
    def so(x: str | None) -> set[str]:
        x = re.sub(r"(?i)m\s*[2²]", "m", str(x or ""))          # "m2" / "m²" là đơn vị, không phải số
        return {n.replace(",", ".") for n in re.findall(r"\d+(?:[.,]\d+)?", x)}
    o_trich = so(trich)
    # Diện tích tính từ kích thước khách gõ ("4,5x11" → 49,5): tích là số có trong lời khách theo nghĩa, code tính, không đoán.
    tich = {(str(int(a)) if a.is_integer() else str(a)) for a in (
        round(float(x.replace(",", ".")) * float(y.replace(",", ".")), 2)
        for x, y in re.findall(r"(\d+(?:[.,]\d+)?)\s*m?\s*[x*X×]\s*(\d+(?:[.,]\d+)?)", loi_khach or ""))}
    return bool(o_trich) and o_trich <= so(loi_khach) | tich


# Ô GHÉP / ĐỐI CHIẾU KHO — giá trị không đòi nằm trong lời khách (SRS-5.1zzzzzzz86): địa chỉ là bản GHÉP nhiều lượt và có cổng chuẩn
# hoá một cửa phía DB (chuan_dia_ban, tim_duong); tên dự án đối chiếu kho `projects` (`cung_ten_du_an`) — kho là bằng chứng.
_O_GHEP = frozenset({"dia_chi", "phuong", "quan", "duong", "du_an"})
# Đơn vị của ô số đo — model hay viết lại ("tỉ" → "tỷ", "3 lầu" → "4 tầng", "4,5x11" → "49,5m²"); chữ khác trong giá trị số đo vẫn
# phải có trong lời khách. Bảng theo schema ô số đo của hệ thống, không đọc ý khách.
_DON_VI = frozenset({"m", "met", "ty", "ti", "trieu", "tr", "k", "ngan", "nghin", "usd", "thang", "nam", "ha", "tang", "lau", "x"})


def _tu(s: str | None) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", _strip_accents(re.sub(r"(?i)m\s*[2²]", "m", str(s or ""))).lower()))


GIA_TRI_NGUYEN_CAU_TU = 10   # giá trị ô dài từng này từ mà bằng ĐÚNG cả tin khách = AI chép nguyên câu, không trích cụm


def _gia_tri_la_cau(k: str, v: str, tin_khach: str) -> str | None:
    """Giá trị ô là CÂU chứ không phải dữ liệu (SRS-5.1zzzzzzz218, chat anh Luận 26/10): câu hỏi ("?") hay nguyên cả tin khách dài (câu nhờ
    bot làm việc, câu kể lan man) bị chép vào ô. Chỉ so HÌNH THỨC — không đọc ý; ô ghép địa chỉ (`_O_GHEP`) được dài. Trả lý do, hoặc None."""
    v = (v or "").strip()
    if v.endswith("?"):
        return "giá trị ô là câu hỏi, không phải dữ liệu căn"
    gon = lambda x: re.sub(r"\s+", " ", re.sub(r"[^\w\s/]", " ", _strip_accents(x or "").lower())).strip()
    if k not in _O_GHEP and len(v.split()) >= GIA_TRI_NGUYEN_CAU_TU and gon(v) == gon(tin_khach):
        return "giá trị ô là nguyên cả câu khách nhắn — AI phải trích cụm dữ liệu, câu nhờ / dặn không phải ô tin"
    return None


def _gia_tri_chong_do(k: str, v: str, loi_khach: str) -> bool:
    """Giá trị ô có được lời khách CHỐNG ĐỠ không (SRS-5.1zzzzzzz86): mọi từ của giá trị phải có trong lời khách (ô số đo: trừ số —
    `_so_khop` lo — và đơn vị). Bắn thử KB1 20/10: khách "ngõ trước nhà rộng 3m", AI trích đúng cụm đó nhưng GHI ô `vi_he_xe` =
    "Ngõ rộng 3m, xe máy hoặc ô tô con vào được" rồi tin rao in "ô tô con vào thuận tiện" — cổng cũ chỉ kiểm cụm trích, không kiểm
    giá trị. Không đọc ý: chỉ so từ của giá trị với từ khách gõ."""
    du = _tu(loi_khach)
    if k in _O_SO_DO:
        return {w for w in _tu(v) if not w[0].isdigit()} <= du | _DON_VI
    return _tu(v) <= du


def _strip_accents(s: str) -> str:
    s = (s or "").replace("đ", "d").replace("Đ", "D")  # NFD won't decompose đ — map it first
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


@dataclass
class Turn:
    role: str
    content: str
    at: float


@dataclass
class Listing:
    """One property in a seller's basket (rổ hàng). `listing_id` is the stable surrogate
    identity — never changes even if type/address is reclassified (see [[aioi-data-model]])."""

    listing_id: str = field(default_factory=lambda: uuid4().hex)
    prop: Property = field(default_factory=Property)
    listing_proposed: bool = False  # shown the draft ad & asked "hấp dẫn chưa"?
    history_start: int = 0  # index into the seller's history where THIS listing's turns begin
    status: str = "đang bán"  # đang bán / đã bán / dừng bán / đã cho thuê
    media: list[dict[str, str]] = field(default_factory=list)  # MediaRef.to_dict()s (kho Supabase Storage)

    @property
    def ma_tin(self) -> str:
        """Mã tin trên DB / web. Tin tạo từ chat: 8 ký tự đầu id. Tin tạo ngoài chat (CRM `admin_dang_tin` đặt mã `next_listing_code`, rổ mẫu
        SEED…) mang mã riêng ở khoá nội bộ `_ma_tin` do lúc nạp từ DB ghi (SRS-5.1zzzzzzz268) — id căn vẫn là uuid của dòng để ảnh vào đúng
        thư mục `<uuid>/` của tin."""
        return str(self.prop.fields.get("_ma_tin") or self.listing_id[:8]).upper()

    @property
    def display_status(self) -> str:
        """The lifecycle status as shown to the user. `status` defaults to the sale-oriented
        'đang bán' for every listing; for a RENTAL that reads wrong, so the default active state
        is displayed as 'đang cho thuê'. Terminal states (đã bán / đã cho thuê / dừng bán) are
        explicit and shown as-is."""
        if self.prop.is_rental and self.status == "đang bán":
            return "đang cho thuê"
        return self.status

    def label(self) -> str:
        """Short human label for disambiguation ("căn nào?"). Prefers the street address;
        falls back to a pre-sale project position (dự án + mã số căn) when there's no
        address yet, then the type, then a placeholder."""
        f = self.prop.fields
        loc = f.get("dia_chi")
        if not loc and f.get("ma_so_can"):
            loc = f"{f['du_an']} - {f['ma_so_can']}" if f.get("du_an") else f["ma_so_can"]
        loc = loc or self.prop.loai_hinh or "căn chưa rõ địa chỉ"
        model = f" · mẫu {f['unit_type']}" if f.get("unit_type") else ""
        gia = f" · {f['gia']}" if f.get("gia") else ""
        return f"{loc}{model}{gia} [{self.display_status}]"


@dataclass
class Conversation:
    """One seller (Zalo user). Holds the chat thread + a BASKET of listings (rổ hàng),
    with one active listing the chat is currently about. Seller-level state (role, score,
    assistant) is shared across all their listings (SRD §IV: user score = avg of listings)."""

    user_key: str
    assistant: Assistant
    history: list[Turn] = field(default_factory=list)
    last_ai_at: float | None = None  # for timeliness scoring
    user_type: SellerRole = SellerRole.UNKNOWN  # seller role, once the bot can tell (§V)
    listings: list[Listing] = field(default_factory=list)
    active_listing_id: str = ""
    role: str = "unknown"  # "seller", "buyer", "unknown"
    buyer_lead: BuyerLead | None = None
    # Transient (not persisted): the structural basket ops applied on the latest turn, so the
    # reply layer can confirm exactly what happened. Reset each turn by _plan_and_apply.
    last_receipts: list[tuple] = field(default_factory=list)
    # Things handed off to a human admin (e.g. an oversize media send we won't process) — a
    # Live-Chat-Monitor / Takeover (SRD §VI) reads these to know a chat needs attention.
    admin_escalations: list[dict] = field(default_factory=list)
    # The SELLER'S OWN price reference (from a price list they sent) — keyed by normalized mã lô.
    # PRIVATE to this seller; NOT shared, NOT auto-listed. Used to attach their price when they
    # explicitly rao a căn. (Sending a price list ≠ rao bán — the rổ is populated only on intent.)
    price_book: dict[str, dict] = field(default_factory=dict)
    # Transient (not persisted): a clarifying question AOND should append to its next reply when a
    # project name read from a doc looked AMBIGUOUS (a model name, or a near-miss to an existing
    # project) — the "nghi ngờ thì hỏi" rule. Set by import_price_list, consumed by the reply.
    pending_name_note: str = ""
    # Transient (not persisted): a DESTRUCTIVE basket op (clear / bỏ căn / chỉ giữ) the planner
    # proposed but has NOT applied — held until the seller CONFIRMS. Prevents a misread message
    # (e.g. garbled voice-to-text) from silently wiping the basket. Applied on confirm, dropped
    # on deny or when the seller moves on.
    pending_destructive: list[dict] = field(default_factory=list)
    # Transient (not persisted): khách vừa ĐỒNG Ý / KHÔNG ĐỒNG Ý bản tin nháp ở lượt này ("dong_y" / "khong_dong_y"), do lượt AI
    # lập thao tác đọc theo nghĩa và code kiểm trích dẫn (SRS-5.1zzzzzzz47). None = không phải câu duyệt.
    duyet_luot: str | None = None
    # Transient: khách HỎI VỀ gì ở lượt này ("phi" / "uy_tin" / "link_web") và khách TỰ XƯNG gì ("em" / "anh" / "chi" /
    # "chu_co_bac", giữ qua các lượt) — lượt AI lập thao tác đọc theo nghĩa, code kiểm trích dẫn (SRS-5.1zzzzzzz54).
    hoi_ve_luot: str | None = None
    xung_ho: str | None = None
    # Transient (SRS-5.1zzzzzzz163): gợi ý xưng hô từ giới tính trên hồ sơ Zalo ("anh" nam / "chi" nữ), bridge gửi kèm mỗi tin. Chỉ dùng
    # khi khách CHƯA tự xưng (`xung_ho` trống) — lời khách tự nói luôn thắng; không lưu DB.
    xung_ho_goi_y: str | None = None
    # Cột cũ của chế độ test (SRS-5.1zzzzzzz130) — từ SRS-5.1zzzzzzz195 (26/10/2026) KHÔNG còn đường nào bật; để nguyên cột / trường để khỏi đổi lược đồ.
    che_do_test: bool = False
    # Persisted (SRS-5.1zzzzzzz131 bản 2): số lượt khách đã CHO THÔNG TIN (lượt ghi được ô) — 3 lượt đầu bắt buộc mở bằng lời khen; "$$$$$" về 0.
    so_luot_thong_tin: int = 0
    # Persisted (SRS-5.1zzzzzzz210, chủ dự án 26/10/2026: "1 số điện thoại nhận đầu vào kí gửi 1 số điện thoại nhận đầu ra tư vấn người mua"):
    # khách nhắn tới số Zalo NÀO — "" = số ký gửi (số cũ), SO_TU_VAN = số tư vấn người mua. Chỉ quyết vai MẶC ĐỊNH của lượt mơ hồ và số gửi tin
    # chủ động cho khách; khách nhắn nhầm số vẫn được trả lời đúng việc (`user_intent` của lượt thắng).
    so_nhan: str = ""
    tin_tra_loi: str = ""   # nội dung tin khách bấm "Trả lời" trên Zalo, chỉ của lượt đang chạy (SRS-5.1zzzzzzz270); không lưu
    # Persisted (SRS-5.1zzzzzzz216, 27/10/2026): NGƯỜI THẬT đang nói chuyện với khách tới mốc này (epoch giây) — admin gõ tay trên acc
    # clone (bridge `human_note`, trước đây lõi bỏ qua trường này và coi lời admin là lời khách) hoặc gửi từ /admin/tin-nhan. Chưa tới mốc
    # thì bot im (chỉ ghi lời khách vào CRM), như nút "giữ" nhưng tự hết sau NHUONG_SAN_GIAY.
    nhuong_san_den: float = 0.0
    # Transient (SRS-5.1zzzzzzz177): số lượt khách hỏi việc NGOÀI nhà đất khi chưa tỏ ý bán / mua — lần 2 đề nghị nối người.
    so_luot_ngoai_viec: int = 0
    # Transient (SRS-5.1zzzzzzz130): ô tin của căn đang nói TRƯỚC khi áp thao tác lượt này, và cụm khách nói làm bằng chứng cho ô vừa ghi —
    # chỉ để tin phụ chế độ test nói "mới" hay "đổi từ …", kèm câu khách trích.
    truoc_luot: dict = field(default_factory=dict)
    truoc_id: str = ""
    bc_luot: dict = field(default_factory=dict)
    de_xuat_luot: list = field(default_factory=list)   # thao tác lượt AI lập thao tác đề xuất ("update(gia)") — tin phụ chế độ test
    bo_luot: list = field(default_factory=list)        # (ô, lý do) ô AI đề xuất mà code bỏ — tin phụ chế độ test nói "vì sao không nhớ"
    # Transient: điều lượt AI đọc được ở tin vừa nhắn, đã kiểm trích dẫn (SRS-5.1zzzzzzz55): "xin_xem_ban_ve", "cau_hoi_du_an",
    # "mo_ta_du_an" (True khi có), "xac_nhan_xoa" ("dong_y" / "tu_choi").
    y_luot: dict = field(default_factory=dict)
    # Transient (SRS-5.1zzzzzzz70): căn đang hiện khớp nhu cầu khách mua, và câu khách mua đang chờ người rao này trả lời —
    # nạp ở lượt lập thao tác để AI chỉ đúng mã căn / id câu.
    can_mua: list = field(default_factory=list)
    cau_hoi_cho: list = field(default_factory=list)
    # Transient (SRS-5.1zzzzzzz73): lời KHÁCH trong khung lượt lập thao tác vừa đọc — ô tin mới / đổi giá trị chỉ được ghi khi
    # cụm bằng chứng AI đưa nằm trong đây (không tính lời bot).
    loi_khach_luot: str = ""
    # Transient (SRS-5.1zzzzzzz86): ms từng khâu của lượt đang chạy (lập thao tác / trả lời / ghi kho) — server trả kèm để đo chỗ chậm.
    do_luot: dict = field(default_factory=dict)
    # Transient (SRS-5.1zzzzzzz74): ô bot hỏi ở lượt trả lời gần nhất — khách chưa trả lời thì lượt sau hỏi ý khác trước.
    o_vua_hoi: str | None = None
    # Transient (SRS-5.1zzzzzzz80): số lần khách lờ từng ô (bot hỏi, lượt sau ô vẫn trống) — đủ 2 thì để sau bản nháp.
    lo: dict = field(default_factory=dict)
    cum_vua_hoi: list = field(default_factory=list)   # các ô bot hỏi gộp ở lượt trả lời gần nhất

    def __post_init__(self) -> None:
        if not self.listings:
            self.listings.append(Listing())
        if not self.active_listing_id or all(li.listing_id != self.active_listing_id for li in self.listings):
            self.active_listing_id = self.listings[0].listing_id

    @property
    def active(self) -> Listing:
        for li in self.listings:
            if li.listing_id == self.active_listing_id:
                return li
        if self.listings:
            self.active_listing_id = self.listings[-1].listing_id
            return self.listings[-1]
        li = Listing()
        self.listings.append(li)
        self.active_listing_id = li.listing_id
        return li

    @property
    def vai_phi(self) -> SellerRole:
        """Vai TÍNH PHÍ (SRS-5.1zzzzzzz240, chủ dự án 28/10 — OPEN-28 b, FR-160): từ tin BÁN thứ `TIN_BAN_LA_MOI_GIOI` trong rổ, người rao chính
        chủ / lướt sóng / chưa rõ vai tính phí như môi giới (0,5 %); tin cho thuê không đếm (phí thuê theo tháng tiền thuê, không theo vai).
        `user_type` (vai khách tự gọi tên) giữ nguyên — chỉ con số phí trôi theo số tin."""
        if self.user_type in (SellerRole.CHU_NHA, SellerRole.LUOT_SONG, SellerRole.UNKNOWN):
            ban = [li for li in self.listings
                   if not li.prop.is_rental and any(li.prop.fields.get(k) for k in ("ma_so_can", "dia_chi", "gia"))]
            if len(ban) >= TIN_BAN_LA_MOI_GIOI:
                return SellerRole.MOI_GIOI
        return self.user_type

    def new_listing(self) -> Listing:
        """Start a fresh listing and make it active (seller is listing another property)."""
        li = Listing(history_start=len(self.history))
        self.listings.append(li)
        self.active_listing_id = li.listing_id
        return li

    # --- backward-compat proxies to the active listing (engine/tests use these) ---
    @property
    def prop(self) -> Property:
        return self.active.prop

    @property
    def listing_id(self) -> str:
        return self.active.listing_id

    @property
    def listing_proposed(self) -> bool:
        return self.active.listing_proposed

    @listing_proposed.setter
    def listing_proposed(self, value: bool) -> None:
        self.active.listing_proposed = value

    def messages(self, limit: int = 30) -> list[Message]:
        # Only the ACTIVE listing's turns — so a new listing doesn't inherit the prior
        # one's address/details (the Zalo thread is shared, but each căn reads clean).
        # 20/10/2026 (SRS-5.1zzzzzzz81; chủ dự án "Bot nhớ 30, theo anh Luận"): 16 → 30 tin như MAX_HISTORY_TURNS bản anh Luận.
        turns = self.history[self.active.history_start:]
        if limit and len(turns) > limit:
            turns = turns[-limit:]
        return [Message(t.role, t.content) for t in turns]


# Luật giọng chung mọi cách xưng hô (SRS-5.1zzzzzzz86; quyết định chủ dự án: cấm mở đầu "Dạ"). Bắn thử 20/10: KB3 khách chưa tự
# xưng → khối "chưa biết" không có luật "Dạ", bot mở "Dạ, phí quản lý…"; KB2 khách xưng em → chính sách chung cho phép gọi "bạn".
_GIONG_CHUNG = ("KHÔNG mở đầu câu bằng \"Dạ\" / \"Dạ vâng\" — câu đầu vào thẳng nội dung. KHÔNG gọi khách là \"bạn\".\n")


# SRS-5.1zzzzzzz171 (chủ dự án 24/10/2026: "sao nó xưng mình z"): bot gọi khách là "mình" ("em xin lỗi mình nhé. Mình đang cần gửi…") dù khách
# chưa xưng "em" — khối "chưa biết" bảo gọi "anh/chị" nhưng không cấm "mình". Chỉ khi khách xưng "em" bot mới xưng "mình" (xem `_khoi_xung_ho_rieng`).
_CAM_GOI_MINH = ("KHÔNG gọi khách là \"mình\" (đại từ ngôi hai: \"em xin lỗi mình\", \"Mình đang cần…\") — gọi đúng cách khách xưng, chưa rõ thì "
                 "\"anh/chị\". Chỉ được \"nhà mình / căn mình / đất mình\" khi nói về căn của khách, và \"mình\" nghĩa CHÚNG TA khi bên em "
                 "với khách cùng làm (\"hay mình đăng luôn\").\n")


def khoi_xung_ho(p: str, ten: str | None = None, doan: bool = False) -> str:
    """Khối luật xưng hô của lượt theo cách khách tự xưng (`_detect_customer_pronoun`) và tên trợ lý (`xung_ho.goi_toi`). Một nguồn cho
    lượt chat và lượt ảnh sổ (SRS-5.1zzzzzzz82 — trước đó câu sau ảnh sổ viết cứng, luôn "anh/chị", có nhánh "vậy anh?").
    `doan`: "anh" / "chị" chỉ đoán từ giới tính Zalo — khối nói rõ là đoán, lời khách tự xưng ở các tin trên thắng (SRS-5.1zzzzzzz245)."""
    if doan and p in ("anh", "chi"):
        return _khoi_xung_ho_doan(p, ten) + _GIONG_CHUNG + _CAM_GOI_MINH
    return _khoi_xung_ho_rieng(p, ten) + _GIONG_CHUNG + _CAM_GOI_MINH


def _khoi_xung_ho_doan(p: str, ten: str | None = None) -> str:
    # SRS-5.1zzzzzzz245 (chat thử 28/10: khách "chú bán nhà…", lượt lập thao tác không đọc ra chữ xưng, khối cũ ghi "Khách xưng 'anh'" theo giới
    # tính Zalo nên model đang gọi "chú" chuyển sang "Anh cho em hỏi"): đoán thì nói là đoán, model đọc lời khách quyết.
    goi = "anh" if p == "anh" else "chị"
    em_toi = goi_toi_khach("em", ten)[1]
    return (
        "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
        f"Khách CHƯA được ghi nhận tự xưng; hồ sơ Zalo cho ĐOÁN là '{goi}' — tạm gọi '{goi}', xưng 'em'. ĐỌC LẠI các tin của khách ở trên: "
        "khách đã TỰ XƯNG thì gọi đúng chữ khách xưng, bỏ chữ đoán — xưng chú / cô / bác / dì (\"chú bán nhà…\") thì gọi đúng chữ đó, "
        f"bot xưng 'cháu'; xưng cháu / con thì gọi 'cháu'; xưng em thì gọi 'em', bot xưng '{em_toi}'. Câu mẫu ở trên viết 'anh/chị' thì "
        "đổi theo cách gọi đó. CẤM lặp từ 'DẠ' ở đầu câu.\n"
    )


def _khoi_xung_ho_rieng(p: str, ten: str | None = None) -> str:
    # SRS-5.1zzzzzzz214 (chủ dự án 27/10/2026: "người ta xưng em thì mình xưng anh hoặc chị tùy tên, xưng cháu thì cô hoặc chú"): bot
    # không còn xưng "mình" (khách ảo 26/10 ra "Em ơi, em…"); cách xưng lấy từ `xung_ho.goi_toi` theo tên trợ lý.
    if p == "em":
        toi = goi_toi_khach("em", ten)[1]
        return (
            "\n\n=== QUY TẮC XƯNG HÔ BẮT BUỘC LƯỢT NÀY (KHÁCH TỰ XƯNG LÀ 'EM'): ===\n"
            "Khách tự xưng là 'em' (vd: 'nhà em...', 'em gửi...', 'em có...', 'em bán...').\n"
            "1. TUYỆT ĐỐI CẤM DÙNG TỪ 'DẠ' HOẶC 'DẠ VÂNG' Ở BẤT KỲ ĐÂU! Không dạ thưa với người xưng em.\n"
            "2. TUYỆT ĐỐI CẤM gọi khách là 'anh' hay 'chị'. Hãy gọi khách là 'em'.\n"
            f"3. Bản thân xưng là '{toi}', gọi khách là 'em'. "
            f"KHÔNG xưng 'mình', KHÔNG xưng 'em'. Cả lượt KHÔNG có chữ 'anh/chị' gọi khách — kể cả khi câu mẫu / gợi ý câu hỏi ở trên viết "
            "'anh/chị', đổi thành 'em'.\n"
        )
    elif p == "chau":
        toi = goi_toi_khach("chau", ten)[1]
        return (
            "\n\n=== QUY TẮC XƯNG HÔ BẮT BUỘC LƯỢT NÀY (KHÁCH TỰ XƯNG LÀ 'CHÁU' / 'CON'): ===\n"
            f"Khách tự xưng là 'cháu' / 'con' (vd: 'cháu muốn bán nhà', 'con có căn…'). Gọi khách là 'cháu', bản thân xưng '{toi}'. KHÔNG xưng "
            "'em' / 'mình', KHÔNG 'Dạ'. Cả lượt KHÔNG có chữ 'anh/chị' gọi khách — câu mẫu / gợi ý ở trên viết 'anh/chị' thì đổi thành 'cháu'.\n"
        )
    elif p == "chi":
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            "Khách xưng 'chị'. Gọi khách là 'chị', bản thân xưng 'em'. CẤM lặp từ 'DẠ' ở đầu câu. Cả lượt KHÔNG có chữ 'anh/chị' — kể cả "
            "khi câu mẫu ở trên viết 'anh/chị', đổi thành 'chị' (vd lời chào: \"Em chào chị ạ\").\n"
        )
    elif p == "anh":
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            "Khách xưng 'anh'. Gọi khách là 'anh', bản thân xưng 'em'. CẤM lặp từ 'DẠ' ở đầu câu. Cả lượt KHÔNG có chữ 'anh/chị' — kể cả "
            "khi câu mẫu ở trên viết 'anh/chị', đổi thành 'anh' (vd lời chào: \"Em chào anh ạ\").\n"
        )
    elif p.startswith("elder:"):
        lon = p.partition(":")[2]
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            f"Khách tự xưng '{lon}'. Gọi khách là '{lon}', bản thân lễ phép xưng 'cháu'. KHÔNG 'anh' / 'chị' / 'anh/chị' — câu mẫu ở trên viết "
            f"'anh/chị' thì đổi thành '{lon}'. KHÔNG 'Dạ'.\n"
        )
    elif p == "elder":
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            "Khách là người lớn tuổi (chú/cô/bác/dì). Lễ phép xưng 'cháu', gọi đúng 'chú/cô/bác/dì'.\n"
        )
    else:
        # 19/10/2026 (SRS-5.1zzzzzzz73): chưa biết khách anh hay chị thì không có luật nào — model chép chữ "anh" trong ví dụ
        # mẫu, gọi khách "anh" suốt 10 lượt rồi đổi "chị" khi khách tự xưng.
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            "CHƯA BIẾT khách là anh hay chị. Gọi khách 'anh/chị', bản thân xưng 'em'. KHÔNG tự đoán 'anh' hoặc "
            "'chị' từ tên, giọng văn hay ví dụ mẫu.\n"
        )


class LoiTraLoi(RuntimeError):
    """Lượt trả lời không ra được lời gửi khách (model trả rỗng sau lượt gọi lại). Server bắt, gửi câu giữ chỗ và tự thử lại
    (SRS-5.1zzzzzzz82) — trước đó khách nhận "kết nối mạng vừa gián đoạn, nhắn lại giúp em"."""


def khoi_can_nguoi(conv: "Conversation") -> str:
    """Khối lệnh khi lượt AI lập thao tác đọc được khách XIN gặp người thật (SRS-5.1zzzzzzz82). Server bật `needs_human` và xếp tin
    báo admin ở cùng lượt, nên lời "đã báo" là thật; không hứa giờ cụ thể. Câu pháp lý nhạy cảm đi cùng đường báo nhưng lời dặn ở
    `khoi_phap_ly` (SRS-5.1zzzzzzz176)."""
    if not conv.y_luot.get("can_nguoi_that") or conv.y_luot.get("phap_ly_nhay_cam") or conv.y_luot.get("bao_admin_he_thong"):
        return ""   # SRS-5.1zzzzzzz253: hệ thống tự nhờ admin (phường, câu dự án) — khách không xin gặp người, không hứa "sẽ nhắn khách"
    if conv.y_luot.get("cdt_bao_admin"):   # SRS-5.1zzzzzzz240: người rao là chủ đầu tư (OPEN-21 a)
        return (
            "\n\n=== ƯU TIÊN LƯỢT NÀY — NGƯỜI RAO LÀ CHỦ ĐẦU TƯ (hệ thống ĐÃ BÁO bộ phận hợp tác dự án): ===\n"
            "Phí với chủ đầu tư là thoả thuận riêng — KHÔNG nêu con số % nào. Nói ngắn: em đã báo bộ phận hợp tác dự án, anh/chị phụ trách "
            "sẽ liên hệ sớm. KHÔNG hứa giờ cụ thể, KHÔNG xin số điện thoại. Sau đó tiếp chuyện dự án / căn như thường.\n"
        )
    return (
        "\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH XIN GẶP NGƯỜI THẬT (hệ thống đã đọc, ĐÃ BÁO người phụ trách): ===\n"
        "Nói ngắn, ấm: em đã báo anh/chị phụ trách, anh/chị ấy sẽ nhắn khách sớm. KHÔNG hứa giờ cụ thể, KHÔNG xin số điện thoại. "
        "Trong lúc chờ, nếu khách muốn em vẫn hỗ trợ tiếp. Không hỏi thêm thông tin căn ở lượt này.\n"
    )


# SRS-5.1zzzzzzz256 (bắn thử ban-thu-mua 28/10 16:21: khách mua "Căn #… anh thấy được đó em. Chiều thứ 7 này 3h anh qua xem nhà được không, mà
# nhà này sổ hồng riêng không em?" → lượt lập thao tác trả `update phap_ly_hoan_cong` của phía BÁN, khối "mua" trống — không ghi quan tâm, hẹn
# xem, câu hỏi chủ nhà): prompt lập thao tác không nói người nhắn đang là khách mua. Đây là DỮ KIỆN hệ thống (vai các lượt trước), không đoán ý.
KHOI_VAI_MUA_LAP_VIEC = (
    "\nVAI NGƯỜI NHẮN (hệ thống, từ các lượt trước): KHÁCH TÌM MUA / THUÊ. Câu khách hỏi về một căn đang rao (pháp lý, sổ, hướng, hẻm…), "
    "khách chọn căn, hẹn đi xem → khối \"mua\" (ma_can, quan_tam, hen_xem, hoi_chu_nha…), KHÔNG phải ô tin rao. Chỉ tạo thao tác "
    "add / update căn rao khi khách NÓI RÕ muốn bán / cho thuê căn của chính mình.\n")


def khoi_ngoai_viec(conv: "Conversation") -> str:
    """Khách hỏi việc ngoài nhà đất khi chưa tỏ ý bán / mua (SRS-5.1zzzzzzz177): lần 1 nói thật không nắm + hỏi có cần bán / mua không;
    từ lần 2 thôi hỏi về nhà đất, đề nghị nối người phụ trách (hỏi khách có muốn không — không tự báo)."""
    n = conv.y_luot.get("ngoai_viec")
    if not n:
        return ""
    if n == 1:
        return ("\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI VIỆC NGOÀI NHÀ ĐẤT (chưa tỏ ý bán / mua): ===\n"
                "Nói thật NGẮN là việc đó em không nắm (không đoán, không hứa hỏi giúp). KHÔNG hỏi địa chỉ / loại / giá / bất kỳ thông tin căn "
                "nào, KHÔNG nói khách đang rao hay đang bán, KHÔNG khen. Hỏi MỘT câu ngắn: khách có cần gửi bán"
                + (", cho thuê hay tìm mua" if conv.so_nhan == SO_TU_VAN else " hay cho thuê") + " nhà đất không.\n")
    return (f"\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI LẠI VIỆC NGOÀI NHÀ ĐẤT (lần thứ {n}): ===\n"
            "KHÔNG hỏi gì về nhà đất nữa, KHÔNG khen. Nói ngắn: bên em chỉ hỗ trợ gửi bán / cho thuê / tìm mua nhà đất, việc này em chưa nắm; nếu "
            "khách muốn, em nối anh/chị phụ trách để hỏi giúp — hỏi MỘT câu khách có muốn không. KHÔNG nói đã báo ai.\n")


def khoi_phap_ly(conv: "Conversation", can: dict | None = None) -> str:
    """Khối pháp lý của lượt (SRS-5.1zzzzzzz176). `can` (SRS-5.1zzzzzzz179 mục 3): căn khách đang nói tới ở vai mua — có giá thì kho pháp lý
    nối dòng số thuế phí tính sẵn theo giá căn."""
    gia = can.get("price_vnd") if isinstance(can, dict) else None
    k = phap_ly.khoi_luot(conv.y_luot.get("hoi_phap_ly"), bool(conv.y_luot.get("phap_ly_nhay_cam")),
                          gia_can=float(gia) if isinstance(gia, (int, float)) and gia > 0 else None,
                          ma_can=str(can.get("code")) if isinstance(can, dict) and can.get("code") else None,
                          dieu=conv.y_luot.get("dieu_luat"), ten_can=can.get("_ten") if isinstance(can, dict) else None)
    # SRS-5.1zzzzzzz213 (khách ảo 26/10: đang "cháu / cô" bỗng "em chưa có thông tin chắc chắn" khi trả lời pháp lý — tư liệu kho viết "em").
    return k + ("\nXưng hô trong câu trả lời theo khối xưng hô của lượt; tư liệu viết \"em\" thì đổi cho khớp (đang xưng \"cháu\" thì \"cháu\").\n" if k else "")


@dataclass
class TurnResult:
    reply: str
    assistant_name: str
    captured: list[str]        # field slugs newly captured this turn
    next_field: str | None     # what the AI chose to ask about
    user_type: str             # seller role: chu_nha/luot_song/moi_gioi/san/chu_dau_tu/unknown
    is_listing_post: bool      # True when the reply is a full listing ad, not a chat turn
    completeness: float        # 0..1
    property_score: float      # 0..100
    user_score: float          # 0..100
    tier: str
    escalated: bool = False    # True when this turn was handed to a human admin (oversize media)
    can_nguoi_that: str | None = None   # cụm khách xin gặp người thật (đã kiểm trích dẫn) → server báo admin (SRS-5.1zzzzzzz82)
    # Thả tim lên tin khách vừa nhắn (SRS-5.1zzzzzzz163): lời chào, đồng ý duyệt tin, "ok", hoặc tin vừa cho địa chỉ → bridge gọi addReaction.
    tha_tim: bool = False
    # Chấm sao cho AI (SRS-5.1zzzzzzz104): lượt này vừa gửi câu xin chấm sao / khách vừa chấm (sao, cụm trích) → server ghi kho.
    xin_danh_gia: bool = False
    danh_gia: tuple[int, str] | None = None
    role: str = "seller"       # "seller" hoặc "buyer"
    lead: BuyerLead | None = None
    # Khách mua xin ảnh (SRS-5.1zzzzzzz169): mã căn cần gửi ảnh ngay cả khi lời bot không dán link / ảnh đã gửi trong 24 giờ.
    xin_anh: list[str] = field(default_factory=list)
    # Ảnh bản vẽ / mặt bằng mẫu nhà (link công khai) khách vừa xin — bridge gửi kèm sau chữ (SRS-5.1zzzzzzz249).
    ban_ve: list[str] = field(default_factory=list)
    # Tin phụ "$$$$$ Đã trích xuất…" (công tắc `AIOI_DONG_TRICH_XUAT`, SRS-5.1zzzzzzz252) — server gửi TRƯỚC lời bot, KHÔNG vào lịch sử / CRM.
    chu_thich: str = ""


class ConversationStore(ABC):
    """Persist a seller's listing/conversation so it survives restarts and is reused
    later (same role as the project store; the listing tier of the Store layer)."""

    @abstractmethod
    def load(self, user_key: str) -> Conversation | None: ...

    @abstractmethod
    def save(self, conv: Conversation) -> None: ...

    def reset(self, user_key: str) -> None: ...


class SqliteConversationStore(ConversationStore):
    """Persist a seller and their BASKET of listings. Two tables: `conversations`
    (seller-level: role, history, active listing) and `listings` (one row per property,
    keyed by `listing_id`, with `user_key` linking back). A seller has 1..n listings."""

    def __init__(self, path: str = "aioi.db"):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS conversations ("
            "user_key TEXT PRIMARY KEY, user_type TEXT, last_ai_at REAL, "
            "active_listing_id TEXT, history_json TEXT, "
            "price_book_json TEXT NOT NULL DEFAULT '{}', "
            "role TEXT NOT NULL DEFAULT 'unknown', "
            "active_lead_id TEXT NOT NULL DEFAULT '', "
            "xung_ho TEXT NOT NULL DEFAULT '', "
            "che_do_test TEXT NOT NULL DEFAULT '', "
            "so_luot_thong_tin TEXT NOT NULL DEFAULT '0', "
            "so_nhan TEXT NOT NULL DEFAULT '', "
            "nhuong_san_den TEXT NOT NULL DEFAULT '')"
        )
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS listings ("
            "listing_id TEXT PRIMARY KEY, user_key TEXT NOT NULL, loai_hinh TEXT, "
            "is_rental INTEGER, du_an TEXT, listing_proposed INTEGER, "
            "history_start INTEGER, status TEXT, fields_json TEXT, "
            "media_json TEXT NOT NULL DEFAULT '[]')"
        )
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS buyer_leads ("
            "lead_id TEXT PRIMARY KEY, user_key TEXT NOT NULL, loai_giao_dich TEXT, "
            "loai_bds TEXT, ngan_sach TEXT, khu_vuc TEXT, so_phong_ngu TEXT, "
            "yeu_cau_xe_hoi TEXT, huong TEXT, muc_dich TEXT, tien_do_mua TEXT, "
            "vay_ngan_hang TEXT, stage TEXT, notes TEXT, fields_json TEXT, "
            "updated_at REAL)"
        )
        for table, col, default in (
            ("listings", "media_json", "'[]'"),
            ("conversations", "price_book_json", "'{}'"),
            ("conversations", "role", "'unknown'"),
            ("conversations", "active_lead_id", "''"),
            ("conversations", "xung_ho", "''"),   # SRS-5.1zzzzzzz76: khách tự xưng gì, giữ qua khởi động lại
            ("conversations", "che_do_test", "''"),   # cột cũ chế độ test (SRS-195: không còn bật)
            ("conversations", "so_luot_thong_tin", "'0'"),   # SRS-5.1zzzzzzz131 bản 2: lượt thông tin thứ mấy (3 lượt đầu khen 100%)
            ("conversations", "so_nhan", "''"),   # SRS-5.1zzzzzzz210: khách nhắn số ký gửi ("") hay số tư vấn
            ("conversations", "nhuong_san_den", "''"),   # SRS-5.1zzzzzzz216: người thật đang nói tới lúc nào (epoch giây)
        ):
            try:  # migrate older tables that predate this column
                self._conn.execute(
                    f"ALTER TABLE {table} ADD COLUMN {col} TEXT NOT NULL DEFAULT {default}")
            except sqlite3.OperationalError:
                pass  # column already exists
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_listings_user ON listings(user_key)")
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_buyer_leads_user ON buyer_leads(user_key)")
        self._conn.commit()

    def save(self, conv: Conversation) -> None:
        active_lead_id = conv.buyer_lead.lead_id if conv.buyer_lead else ""
        self._conn.execute(
            "INSERT INTO conversations(user_key, user_type, last_ai_at, active_listing_id, "
            "history_json, price_book_json, role, active_lead_id, xung_ho, che_do_test, so_luot_thong_tin, so_nhan, nhuong_san_den) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(user_key) DO UPDATE SET "
            "user_type=excluded.user_type, last_ai_at=excluded.last_ai_at, "
            "active_listing_id=excluded.active_listing_id, history_json=excluded.history_json, "
            "price_book_json=excluded.price_book_json, role=excluded.role, "
            "active_lead_id=excluded.active_lead_id, xung_ho=excluded.xung_ho, che_do_test=excluded.che_do_test, "
            "so_luot_thong_tin=excluded.so_luot_thong_tin, so_nhan=excluded.so_nhan, nhuong_san_den=excluded.nhuong_san_den",
            (
                conv.user_key,
                conv.user_type.value,
                conv.last_ai_at,
                conv.active_listing_id,
                json.dumps([t.__dict__ for t in conv.history], ensure_ascii=False),
                json.dumps(conv.price_book, ensure_ascii=False),
                conv.role,
                active_lead_id,
                conv.xung_ho or "",
                "1" if conv.che_do_test else "",
                str(int(conv.so_luot_thong_tin or 0)),
                conv.so_nhan or "",
                str(conv.nhuong_san_den or 0) if conv.nhuong_san_den else "",
            ),
        )
        if conv.buyer_lead is not None:
            bl = conv.buyer_lead
            self._conn.execute(
                "INSERT INTO buyer_leads(lead_id, user_key, loai_giao_dich, loai_bds, ngan_sach, "
                "khu_vuc, so_phong_ngu, yeu_cau_xe_hoi, huong, muc_dich, tien_do_mua, vay_ngan_hang, "
                "stage, notes, fields_json, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(lead_id) DO UPDATE SET loai_giao_dich=excluded.loai_giao_dich, "
                "loai_bds=excluded.loai_bds, ngan_sach=excluded.ngan_sach, khu_vuc=excluded.khu_vuc, "
                "so_phong_ngu=excluded.so_phong_ngu, yeu_cau_xe_hoi=excluded.yeu_cau_xe_hoi, "
                "huong=excluded.huong, muc_dich=excluded.muc_dich, tien_do_mua=excluded.tien_do_mua, "
                "vay_ngan_hang=excluded.vay_ngan_hang, stage=excluded.stage, notes=excluded.notes, "
                "fields_json=excluded.fields_json, updated_at=excluded.updated_at",
                (
                    bl.lead_id,
                    conv.user_key,
                    bl.loai_giao_dich,
                    bl.loai_bds,
                    bl.ngan_sach,
                    bl.khu_vuc,
                    bl.so_phong_ngu,
                    bl.yeu_cau_xe_hoi,
                    bl.huong,
                    bl.muc_dich,
                    bl.tien_do_mua,
                    bl.vay_ngan_hang,
                    bl.stage,
                    bl.notes,
                    json.dumps(bl.fields, ensure_ascii=False),
                    bl.updated_at,
                ),
            )
        for li in conv.listings:
            self._conn.execute(
                "INSERT INTO listings(listing_id, user_key, loai_hinh, is_rental, du_an, "
                "listing_proposed, history_start, status, fields_json, media_json) "
                "VALUES (?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(listing_id) DO UPDATE SET user_key=excluded.user_key, loai_hinh=excluded.loai_hinh, "
                "is_rental=excluded.is_rental, du_an=excluded.du_an, "
                "listing_proposed=excluded.listing_proposed, history_start=excluded.history_start, "
                "status=excluded.status, fields_json=excluded.fields_json, "
                "media_json=excluded.media_json",
                (
                    li.listing_id,
                    conv.user_key,
                    li.prop.loai_hinh,
                    int(li.prop.is_rental),
                    li.prop.fields.get("du_an"),  # denormalized for query/inheritance
                    int(li.listing_proposed),
                    li.history_start,
                    li.status,
                    json.dumps(li.prop.fields, ensure_ascii=False),
                    json.dumps(li.media, ensure_ascii=False),
                ),
            )
        # Reconcile: drop rows for listings the seller REMOVED from the basket (e.g. "chỉ
        # giữ căn 23, 24") — otherwise a pruned căn would linger in the DB after restart.
        keep_ids = [li.listing_id for li in conv.listings]
        placeholders = ",".join("?" * len(keep_ids)) or "''"
        self._conn.execute(
            f"DELETE FROM listings WHERE user_key=? AND listing_id NOT IN ({placeholders})",
            (conv.user_key, *keep_ids),
        )
        self._conn.commit()

    def load(self, user_key: str) -> Conversation | None:
        row = self._conn.execute(
            "SELECT user_type, last_ai_at, active_listing_id, history_json, price_book_json, "
            "role, active_lead_id, xung_ho, che_do_test, so_luot_thong_tin, so_nhan, nhuong_san_den FROM conversations WHERE user_key=?",
            (user_key,),
        ).fetchone()
        if row is None:
            return None
        lrows = self._conn.execute(
            "SELECT listing_id, loai_hinh, is_rental, listing_proposed, history_start, "
            "status, fields_json, media_json FROM listings WHERE user_key=?",
            (user_key,),
        ).fetchall()
        listings = [
            Listing(
                listing_id=r[0],
                prop=Property(loai_hinh=r[1], is_rental=bool(r[2]), fields=json.loads(r[6])),
                listing_proposed=bool(r[3]),
                history_start=r[4] or 0,
                status=r[5] or "đang bán",
                media=json.loads(r[7]) if r[7] else [],
            )
            for r in lrows
        ]
        history = [Turn(**d) for d in json.loads(row[3])]
        lead = None
        if len(row) > 6 and row[6]:
            lrow = self._conn.execute(
                "SELECT lead_id, loai_giao_dich, loai_bds, ngan_sach, khu_vuc, so_phong_ngu, "
                "yeu_cau_xe_hoi, huong, muc_dich, tien_do_mua, vay_ngan_hang, stage, notes, "
                "fields_json, updated_at FROM buyer_leads WHERE lead_id=?",
                (row[6],),
            ).fetchone()
            if lrow:
                lead = BuyerLead(
                    lead_id=lrow[0],
                    user_key=user_key,
                    loai_giao_dich=lrow[1] or "mua",
                    loai_bds=lrow[2],
                    ngan_sach=lrow[3],
                    khu_vuc=lrow[4],
                    so_phong_ngu=lrow[5],
                    yeu_cau_xe_hoi=lrow[6],
                    huong=lrow[7],
                    muc_dich=lrow[8],
                    tien_do_mua=lrow[9],
                    vay_ngan_hang=lrow[10],
                    stage=lrow[11] or "discovery",
                    notes=lrow[12] or "",
                    fields=json.loads(lrow[13]) if lrow[13] else {},
                    updated_at=lrow[14] or 0.0,
                )

        return Conversation(
            user_key=user_key,
            assistant=assign_assistant(user_key),  # deterministic — recompute, don't store
            history=history,
            last_ai_at=row[1],
            user_type=SellerRole(row[0]),
            listings=listings,
            active_listing_id=row[2],
            price_book=json.loads(row[4]) if row[4] else {},  # the seller's uploaded prices survive restart
            role=row[5] if len(row) > 5 and row[5] else "unknown",
            buyer_lead=lead,
            xung_ho=row[7] or None,
            che_do_test=bool(row[8]),
            so_luot_thong_tin=int(row[9] or 0) if len(row) > 9 else 0,
            so_nhan=(row[10] or "") if len(row) > 10 else "",
            nhuong_san_den=float(row[11]) if len(row) > 11 and row[11] else 0.0,
        )

    def reset(self, user_key: str) -> None:
        self._conn.execute("DELETE FROM listings WHERE user_key=?", (user_key,))
        self._conn.execute("DELETE FROM buyer_leads WHERE user_key=?", (user_key,))
        self._conn.execute("DELETE FROM conversations WHERE user_key=?", (user_key,))
        self._conn.commit()


# Ô địa chỉ: lượt khách vừa cho một trong các ô này thì bot thả tim lên tin đó (SRS-5.1zzzzzzz163).
CAC_O_DIA_CHI = frozenset({"dia_chi", "duong"})


def _detect_customer_pronoun(conv: Conversation, current_text: str = "") -> str:
    """Khách tự xưng gì: "em" / "anh" / "chi" / "elder" / "unknown". Do lượt AI lập thao tác đọc theo nghĩa (`xung_ho`, code kiểm
    trích dẫn trong lời khách) — không dò từ khoá (SRS-5.1zzzzzzz54; bản trước regex "em gửi|nhà em…" nhầm cả chữ "em" khách
    dùng để GỌI bot). `current_text` giữ cho chỗ gọi cũ, không dùng."""
    goc, _, chu = (conv.xung_ho or conv.xung_ho_goi_y or "").partition(":")
    if goc == "chu_co_bac" and chu:   # SRS-5.1zzzzzzz233: khách tự xưng đúng chữ nào (chú / cô / bác…) — câu mẫu gọi đúng chữ đó
        return f"elder:{chu}"
    return {"em": "em", "anh": "anh", "chi": "chi", "chau": "chau", "chu_co_bac": "elder"}.get(goc, "unknown")


# SRS-5.1zzzzzzz245: mã xưng hô từ giá trị AI trả (đã bỏ dấu) — mã đúng giữ nguyên, chữ thường quy về mã. Chỉ đọc đầu ra AI.
_MA_XUNG_HO = {"em": "em", "e": "em", "anh": "anh", "a": "anh", "chi": "chi", "c": "chi", "chau": "chau", "con": "chau",
               **{c: "chu_co_bac" for c in ("chu_co_bac", "chu", "co", "bac", "di", "cau", "mo", "thim", "ong", "ba")}}


def _xung_ho_doan(conv: Conversation) -> bool:
    """Cách gọi khách lượt này chỉ là ĐOÁN từ giới tính hồ sơ Zalo (khách chưa tự xưng) — SRS-5.1zzzzzzz245."""
    return not conv.xung_ho and bool(conv.xung_ho_goi_y)


# Chữ người lớn tuổi TỰ XƯNG (có dấu — "co" / "ba" bỏ dấu trùng "có" / số ba). Khách GỌI bot là con / cháu thì không có chữ nào ở đây.
_CHU_LON_TUOI = ("chú", "cô", "bác", "dì", "cậu", "mợ", "thím", "ông", "bà")


def _chu_lon_tuoi(trich: str | None) -> str | None:
    tu = re.findall(r"\w+", str(trich or "").lower())
    return next((t for t in tu if t in _CHU_LON_TUOI), None)


@contextmanager
def _do(conv: "Conversation", khau: str):
    """Cộng thời gian (ms) của một khâu vào `conv.do_luot` — chỉ con số, không dữ liệu khách (SRS-5.1zzzzzzz86)."""
    t = time.perf_counter()
    try:
        yield
    finally:
        conv.do_luot[khau] = conv.do_luot.get(khau, 0) + int((time.perf_counter() - t) * 1000)


def _so_trong(x: str | None) -> set[str]:
    return {n.replace(",", ".") for n in re.findall(r"\d+(?:[.,]\d+)?", re.sub(r"(?i)m\s*[2²]", "m", str(x or "")))}


def _lo_thong_tin_rieng(reply: str, prop: Property) -> list[str]:
    """Ô riêng của chủ (schema.O_NOI_BO — lý do bán, người đứng tên, giờ xem, chìa khoá) mà giá trị khách nói nằm NGUYÊN VĂN trong bản
    tin 📋 (SRS-5.1zzzzzzz116). So chuỗi giá trị đã ghi, không đoán ý; giá trị quá ngắn (< 6 ký tự) bỏ qua cho khỏi trùng tình cờ."""
    if "📋" not in reply:
        return []
    thap = reply.lower()
    return [k for k in sorted(O_NOI_BO) if len((prop.fields.get(k) or "").strip()) >= 6
            and prop.fields[k].strip().lower() in thap]


_HEM_MT_RE = re.compile(r"(?<![\wÀ-ỹ])(hẻm|hxh|ngõ|mặt tiền|mt)(?![\wÀ-ỹ])", re.I)


def _hem_mt_khong_co_du_lieu(reply: str, conv: "Conversation") -> list[str]:
    """Bản tin 📋 nói HẺM / HXH / NGÕ / MẶT TIỀN / MT mà căn chưa có loại đường vào và khách chưa hề nói chữ đó (SRS-5.1zzzzzzz155; chat thử
    23/10: khách chỉ nói "Lê Lai", "39m2, 1 trệt 3 lầu", "7 tỷ 3" — tiêu đề bản nháp ghi "Bán nhà hẻm Lê Lai"). Chỉ so chữ của bản tin với ô đã ghi
    (`lo_gioi_hem`, `mat_tien`) và lời KHÁCH của căn đang nói; câu hỏi cuối bản tin không tính. Không có 📋 → []."""
    if "📋" not in (reply or ""):
        return []
    if conv.prop.fields.get("lo_gioi_hem") or conv.prop.fields.get("mat_tien"):
        return []
    tin = _than_ban_tin(reply)
    phan = f"{tin[0]}\n{tin[1]}" if tin else _dong_tieu_de(reply)
    bat = {m.lower() for m in _HEM_MT_RE.findall(phan)}
    if not bat:
        return []
    bd = max(0, getattr(getattr(conv, "active", None), "history_start", 0) or 0)
    khach = bo_dau(" ".join(t.content for t in conv.history[bd:] if t.role == "user" and t.content)).lower()
    # Địa chỉ có dấu "/" ("12/3 Lê Lai") là nhà trong hẻm — cùng dấu hiệu `Property.update` dùng để gán `lo_gioi_hem` (chủ dự án 23/10: "hẻm thì là có /").
    co_gach = re.search(r"\b\d+[a-z]*/[\da-z/]+", khach) is not None
    ra = []
    for tu in sorted(bat):
        goc = bo_dau(tu).lower()
        co = {"mt": "mat tien" in khach or re.search(r"(?<![a-z0-9])mt(?![a-z0-9])", khach) is not None,
              "hxh": "hxh" in khach or "hem xe hoi" in khach}.get(goc, goc in khach or (goc in ("hem", "ngo") and co_gach))
        if not co:
            ra.append(tu)
    return ra


# SRS-5.1zzzzzzz208 (bắn thử 26/10 trên giọng anh Luận, chủ dự án: "Bịa chi tiết khách không nói" là lỗi): tin rao viết "ra vô chợ búa, trường học
# gần gần đó" khi khách không nhắc, "nhà được giữ gìn kỹ, sạch sẽ" khi khách chỉ nói "ở lâu rồi". Cụm TIỆN ÍCH quanh nhà / TÌNH TRẠNG nhà có
# trong bản tin mà không có trong lời khách của căn đang nói → gọi lại model. So chữ của chính bản tin, không đoán ý khách.
# SRS-5.1zzzzzzz213 (khách ảo 26/10, tin rao căn Era Town: "khu dân cư sầm uất phía Nam Sài Gòn", "được nhiều người hỏi thăm lắm" — tả khu vực
# và sự kiện không có): thêm cụm tả khu / sự kiện giả vào lưới bịa chi tiết.
_CHI_TIET_BIA_RE = re.compile(r"(?i)(gần chợ|chợ búa|trường học|bệnh viện|siêu thị|công viên|trung tâm thương mại|giữ gìn|sạch sẽ|mới xây|nhà mới"
                              r"|sầm uất|nhiều người hỏi|nhiều người quan tâm|khách hỏi nhiều|nhiều khách hỏi|đông dân cư)")


def _chi_tiet_khong_co_du_lieu(reply: str, conv: "Conversation") -> list[str]:
    """Cụm tiện ích quanh nhà / tình trạng nhà trong bản tin 📋 (tiêu đề + mô tả + gạch) mà lời KHÁCH của căn đang nói không có (bỏ dấu).
    Không có 📋 → []."""
    if "📋" not in (reply or ""):
        return []
    tin = _than_ban_tin(reply)
    phan = f"{tin[0]}\n{tin[1]}" if tin else reply
    bat = {m.lower() for m in _CHI_TIET_BIA_RE.findall(phan)}
    if not bat:
        return []
    bd = max(0, getattr(getattr(conv, "active", None), "history_start", 0) or 0)
    khach = bo_dau(" ".join(t.content for t in conv.history[bd:] if t.role == "user" and t.content)).lower()
    khach += " " + bo_dau(" ".join(str(v) for v in conv.prop.fields.values() if isinstance(v, str))).lower()
    goc = {"gần chợ": "cho", "chợ búa": "cho", "trường học": "truong", "bệnh viện": "benh vien", "siêu thị": "sieu thi",
           "công viên": "cong vien", "trung tâm thương mại": "trung tam thuong mai", "giữ gìn": "giu gin", "sạch sẽ": "sach se",
           "mới xây": "moi xay", "nhà mới": "moi"}
    return [t for t in sorted(bat) if not re.search(rf"(?<![a-z]){goc.get(t, bo_dau(t))}(?![a-z])", khach)]


# SRS-5.1zzzzzzz233 (chat chị Ngân 28/10: chị chỉ nói địa chỉ, 70m² sàn, 3 tỷ — bản nháp viết "Chính chủ bán…", "Nhà có sổ hồng rõ ràng"). Khuôn tin
# rao bảo "kể đủ … pháp lý" nên model tự điền pháp lý / vai khi căn chưa có. Pháp lý và vai người bán là sự thật pháp lý của tin công khai.
_PHAP_LY_VAI_RE = re.compile(r"(?i)(sổ hồng|sổ đỏ|pháp lý|hoàn công|chính chủ)")
_KHACH_NOI_PHAP_LY_RE = re.compile(r"so hong|so do|phap ly|hoan cong|giay to|so rieng|so chung|vi bang|hop dong mua ban|hdmb")


def _phap_ly_vai_khong_co_du_lieu(reply: str, conv: "Conversation") -> list[str]:
    """Cụm pháp lý (sổ hồng / sổ đỏ / pháp lý / hoàn công) hay "chính chủ" trong bản tin 📋 mà căn chưa có ô pháp lý, khách chưa nói giấy tờ,
    và (với "chính chủ") vai người rao chưa được khách gọi tên là chủ nhà. So chữ bản tin với ô đã ghi / lời khách; không có 📋 → []."""
    if "📋" not in (reply or ""):
        return []
    tin = _than_ban_tin(reply)
    phan = f"{tin[0]}\n{tin[1]}" if tin else reply
    bat = {m.lower() for m in _PHAP_LY_VAI_RE.findall(phan)}
    if not bat:
        return []
    f = conv.prop.fields
    bd = max(0, getattr(getattr(conv, "active", None), "history_start", 0) or 0)
    khach = bo_dau(" ".join(t.content for t in conv.history[bd:] if t.role == "user" and t.content)).lower()
    co_phap_ly = any(str(f.get(k) or "").strip() for k in KHOA_PHAP_LY) or _KHACH_NOI_PHAP_LY_RE.search(khach) is not None
    chu_nha = getattr(conv, "user_type", None) == SellerRole.CHU_NHA or re.search(r"chinh chu|chu nha", khach) is not None
    return sorted(t for t in bat if (t == "chính chủ" and not chu_nha) or (t != "chính chủ" and not co_phap_ly))


# Bản tin in nguyên tên khối của khuôn ("Gạch đầu dòng:", "Mô tả:" — bắn thử 26/10 tin rao đất). Chỉ soát đầu dòng của bản tin 📋.
_NHAN_KHOI_RE = re.compile(r"(?im)^\s*(?:\d\)\s*)?(tiêu đề|mô tả|gạch đầu dòng|câu mời chốt|cta)\s*:")


def _nhan_khoi_trong_tin(reply: str) -> list[str]:
    if "📋" not in (reply or ""):
        return []
    return sorted({m.group(1).lower() for m in _NHAN_KHOI_RE.finditer(reply.split("📋", 1)[1])})


def _dong_tieu_de(reply: str) -> str:
    """Dòng tiêu đề của bản tin 📋 — một chỗ cho mọi bước kiểm (SRS-5.1zzzzzzz109). Bản nháp đầu: dòng mở "📋 Em sẽ rao như vầy…:" rồi
    tiêu đề ở dòng chữ kế; bản cập nhật ghi tiêu đề NGAY trên dòng 📋 ("📋 Bản tin cập nhật: <tiêu đề>"). Bản trước luôn lấy dòng kế,
    nên với bản cập nhật các bước kiểm soi nhầm đoạn mô tả. Không có 📋 → ""."""
    if "📋" not in (reply or ""):
        return ""
    dong = reply.split("📋", 1)[1].splitlines()
    tren = dong[0].split(":", 1)[1].strip() if dong and ":" in dong[0] else ""
    return tren or next((d for d in dong[1:] if d.strip()), "")


# SRS-5.1zzzzzzz132 (bắn thử 22/10: "Mức giá 9,2 tỷ cho căn nhà 6 tầng trung tâm này quá hợp lý rồi anh/chị nhỉ!"): lời bot nhận xét giá /
# thị trường dù prompt cấm — kiểm HÌNH THỨC lời của chính bot (không đoán ý khách), cùng lớp lưới chống bịa đang có. Nhắc lại con số khách
# đưa ("Em đã để sẵn giá 9,2 tỷ trong bản tin") không khớp — chỉ bắt cụm ĐÁNH GIÁ.
_BINH_LUAN_GIA = re.compile(
    r"(thanh khoản|đắt khách|dễ bán|đắc địa|người mua tìm nhiều|nhiều người (?:hỏi|tìm|quan tâm)|"
    r"(?:mức giá|giá)(?:(?!,\s)[^.!?;\n]){0,50}?(?:hợp lý|vừa tầm|cạnh tranh|mềm|quá tốt|rất tốt|tốt lắm|tốt rồi|quá rẻ|rẻ lắm)|"
    r"(?:hợp lý|vừa tầm)(?:(?!,\s)[^.!?;\n]){0,25}?(?:mức giá|giá))", re.I)   # cửa sổ dừng ở ", " (vế khác), "9,2 tỷ" vẫn qua


_SO_DON_VI_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(m²|m2|mét vuông|triệu\s*/\s*m[²2]|tỷ|tỉ|triệu|phòng ngủ|pn\b|tầng|lầu|mét\b|m\b)", re.I)
_SO_RE = re.compile(r"\d+(?:[.,]\d+)?")


def _so_la_so_voi_nguon(reply: str, nguon: str) -> list[str]:
    """Con số kèm đơn vị trong `reply` mà KHÔNG có (sai số 5 %) trong chuỗi nguồn — lõi chung của lưới số phía mua
    (`_so_khong_co_trong_can`) và phía bán (`_so_khong_co_trong_tin`, SRS-5.1zzzzzzz218)."""
    def so(v: str) -> float | None:
        try:
            return float(v.replace(".", "").replace(",", ".")) if v.count(",") == 1 and v.count(".") >= 1 else float(v.replace(",", "."))
        except ValueError:
            return None

    cho_phep: set[float] = set()
    for m in _SO_RE.findall(nguon):
        x = so(m)
        if x is None:
            continue
        cho_phep.add(x)
        if x >= 1e6:   # giá ghi bằng số nguyên đồng ("12500000000") → cho phép cả 12,5 (tỷ) / 12500 (triệu)
            cho_phep |= {x / 1e9, x / 1e6}
    la: list[str] = []
    for m in _SO_DON_VI_RE.finditer(reply):
        v = so(m.group(1))
        if v is None or any(abs(v - x) <= 0.05 * max(1.0, x) for x in cho_phep):
            continue
        la.append(m.group(0).strip())
    return la


def _so_khong_co_trong_tin(reply: str, conv: "Conversation") -> list[str]:
    """Phía BÁN (SRS-5.1zzzzzzz218, chat anh Luận 26/10: bản tin in "diện tích đất 41,6m²" — model nhân 5,2 × 8 trong khi chủ nhà nói đất
    34,5m²; khách phải hỏi "Ai nói 41.6m2?"): con số kèm đơn vị trong BẢN TIN rao mà không có ở ô tin của mọi căn trong rổ lẫn lời khách từ
    đầu cuộc chat. Số TÍNH ra (ngang × dài) không phải dữ liệu khách nói — đúng lớp lỗi cần bắt, nên không cộng thêm."""
    nguon = " ".join(str(v) for li in conv.listings for v in li.prop.fields.values() if isinstance(v, str))
    nguon += " " + " ".join(t.content for t in conv.history if t.role == "user" and t.content)
    return _so_la_so_voi_nguon(reply, nguon)


def _so_khong_co_trong_can(reply: str, can: list[dict] | None, conv: "Conversation", system: str = "") -> list[str]:
    """Con số kèm đơn vị (m², tỷ, triệu, triệu/m², phòng ngủ, tầng) trong lời bot phía mua mà KHÔNG có ở dòng căn đưa cho model, khối số
    tính sẵn (thuế phí / tài chính tham khảo) hay lời khách (SRS-5.1zzzzzzz179 mục 5 — lớp lỗi MOSO AI mắc 25/10: tóm tắt "36–57 m²" trong khi
    thẻ hiện 21–29 m²). So số với sai số 5 % để chấp nhận làm tròn (207,9 → 208); mã tin / link / giờ không có đơn vị nên không bị soi."""
    from .mua import dong_can
    if not can and du_an_mua.TIEU_DE not in system:
        return []
    nguon = " ".join(dong_can(c) for c in can)
    for c in can:
        gia = c.get("price_vnd")
        if isinstance(gia, (int, float)) and gia > 0:
            nguon += f" {gia / 1e9:g} {gia / 1e6:g}"
    for t in conv.history[-8:]:
        if t.role == "user" and t.content:
            nguon += " " + t.content
    for dau, rong in (("SỐ TÍNH THEO CĂN", 1200), ("SỐ LIỆU TÀI CHÍNH THAM KHẢO", 1200), (du_an_mua.TIEU_DE, du_an_mua.CAT_KIEN_THUC + 2500),
                      (phap_ly.TIEU_DE_DIEU_LUAT, phap_ly.CAT_DIEU * 3 + 1500)):
        k = system.find(dau)
        if k >= 0:
            nguon += " " + system[k:k + rong]
    return _so_la_so_voi_nguon(reply, nguon)


def _binh_luan_gia(reply: str) -> str | None:
    """Cụm nhận xét giá / thị trường trong lời bot, hoặc None."""
    m = _BINH_LUAN_GIA.search(reply or "")
    return m.group(0).strip() if m else None


# Giá trị DẠNG KÍCH THƯỚC chỉ thuộc ô kích thước / diện tích (SRS-5.1zzzzzzz132; bắn thử 22/10: khách gõ "5x10", AI nhét cả vào
# `dien_tich_trang_thiet_bi` và cổng bằng chứng nhận vì cụm có thật). "4m" / "5m" KHÔNG tính (hẻm 4m, ngang 5m là hợp lệ ở ô riêng).
_O_KICH_THUOC = frozenset({"kich_thuoc", "dien_tich", "dien_tich_dat", "dien_tich_nha", "dien_tich_mong_muon", "tho_cu", "mat_tien",
                           "lo_gioi_hem", "lo_gioi_duong", "chieu_cao_tran"})
_DANG_KICH_THUOC = re.compile(r"^\s*\d+(?:[.,]\d+)?\s*(?:x|×|\*)\s*\d+(?:[.,]\d+)?\s*(?:m2|m²|m)?\s*$|^\s*\d+(?:[.,]\d+)?\s*(?:m2|m²|mét vuông|m vuông|met vuong)\s*$", re.I)


def _la_kich_thuoc(v: object) -> bool:
    return isinstance(v, str) and _DANG_KICH_THUOC.match(v) is not None


def _tieu_de_sai_don_vi(reply: str) -> bool:
    """Tiêu đề bản tin ghi kích thước kèm m² ("5x20m²") — sai đơn vị: 5x20 là kích thước lô, diện tích là 100m² (bắn thử KB2 20/10,
    SRS-5.1zzzzzzz91). Chỉ so bố cục chữ của dòng tiêu đề."""
    tieu_de = _dong_tieu_de(reply)
    return re.search(r"\d\s*[x×*]\s*\d+(?:[.,]\d+)?\s*m\s*[²2]", tieu_de) is not None


def _tieu_de_thieu(reply: str, prop: "Property") -> list[str]:
    """Ý bắt buộc mà dòng tiêu đề bản tin (dòng có chữ đầu tiên sau dòng 📋) không có — hiện kiểm GIÁ: con số của ô giá phải có trong
    tiêu đề (SRS-5.1zzzzzzz86). Không có 📋 hay căn chưa có giá → []. Không đọc ý: chỉ so số."""
    if "📋" not in (reply or "") or not prop.fields.get("gia"):
        return []
    tieu_de = _dong_tieu_de(reply)
    gia = prop.fields["gia"]
    so_gia = _so_trong(gia)
    thieu = [f"giá ({gia})"] if so_gia and not (so_gia & _so_trong(tieu_de)) else []
    # SRS-5.1zzzzzzz218 (bắn thử 27/10: tiêu đề Nguyễn Trãi 28 từ dù AD_FORMAT "15–25 từ" — chưa lưới nào đếm): đếm chữ, bỏ icon.
    so_tu = len([w for w in re.sub(r"[^\w\s]", " ", tieu_de).split() if w])
    if so_tu > TIEU_DE_TOI_DA_TU:
        thieu.append(f"độ dài: {so_tu} từ, quá {TIEU_DE_TOI_DA_TU} — rút gọn")
    return thieu


TIEU_DE_TOI_DA_TU = 25   # AD_FORMAT: tiêu đề 15–25 từ (đổi thì đổi cả AD_FORMAT và ban-thu-ban.sh / ban-thu-kb.sh đếm wc -w)


def _tieu_de_can_ho_co_mt(reply: str, prop: "Property") -> bool:
    """Tiêu đề căn hộ / chung cư có chữ "MT" đứng riêng (bắn thử 211 KB3: "Bán căn hộ Masteri MT Q.2…") — người mua đọc "MT" là mặt
    tiền, căn hộ không có mặt tiền (SRS-5.1zzzzzzz109). Chỉ so chữ của dòng tiêu đề."""
    return prop.group is PropertyGroup.CONDO and re.search(r"(?<![\wÀ-ỹ])MT(?![\wÀ-ỹ])", _dong_tieu_de(reply)) is not None


def _than_ban_tin(reply: str) -> tuple[str, str] | None:
    """(tiêu đề, thân) của một bản tin 📋: bỏ dòng đầu ("📋 Em sẽ rao như vầy…"), đoạn đầu là tiêu đề, đoạn cuối có dấu hỏi là câu hỏi
    khách (không phải tin rao). Chỉ cắt theo bố cục AD_FORMAT, không đọc ý. Không đủ tiêu đề + thân → None."""
    if "📋" not in (reply or ""):
        return None
    sau = reply.split("📋", 1)[1].split("\n", 1)
    doan = [d.strip() for d in re.split(r"\n\s*\n", sau[1] if len(sau) > 1 else "") if d.strip()]
    if doan and "?" in doan[-1]:
        doan = doan[:-1]
    return (doan[0], "\n\n".join(doan[1:])) if len(doan) >= 2 else None


_DONG_CAP_NHAT_RE = re.compile(r"(?i)📋?[ \t]*bản tin (?:đã )?(?:cập nhật|sửa)(?: lại)?[ \t]*:")


def _gan_dau_ban_tin(reply: str) -> str:
    """Bản tin cập nhật mà model viết dòng mở THIẾU dấu 📋 (ban-thu-ban 27/10 sau SRS-219: "Đúng rồi anh, … nha anh. Bản tin cập nhật:" nối
    cuối câu dẫn, 3/4 lượt) → tách câu dẫn và gắn lại đúng dòng "📋 Bản tin cập nhật:". Không có dấu thì cả hệ thống coi lượt đó là chat
    thường: lưới bản tin không chạy, bản khách duyệt lấy nhầm bản cũ (`_ban_tin_da_trinh`). Cùng lớp với dòng mở bản nháp đầu thiếu 📋
    (`prompts.cat_truoc_mo_dau`, SRS-5.1zzzzzzz80). Chỉ chạm lời có bố cục tin rao (gạch đầu dòng) — SRS-5.1zzzzzzz222."""
    if not reply or "📋" in reply or not _is_formatted_post(reply):
        return reply
    m = _DONG_CAP_NHAT_RE.search(reply)
    if not m:
        return reply
    truoc, sau = reply[:m.start()].rstrip(), reply[m.end():]
    sau = sau if sau.startswith(("\n", "\r")) else " " + sau.lstrip()
    return ((truoc + "\n\n") if truoc else "") + "📋 Bản tin cập nhật:" + sau


def _phan_chat_quanh_ban_tin(reply: str) -> str:
    """Phần CHAT của một lượt có bản tin 📋: câu dẫn trước dấu 📋 (bỏ dòng mở "📋 Bản tin cập nhật:") + đoạn cuối sau bản tin nếu là câu hỏi
    chốt. Lượt không có 📋 → cả lời. Chỉ cắt theo bố cục, không đọc ý (SRS-5.1zzzzzzz219)."""
    if "📋" not in (reply or ""):
        return (reply or "").strip()
    truoc, sau = reply.split("📋", 1)
    doan = [d.strip() for d in re.split(r"\n\s*\n", sau) if d.strip()]
    # Câu chốt = đoạn cuối đứng SAU câu mời nhắn Zalo (khối 4 của AD_FORMAT). Không dựa vào dấu "?" — câu chốt thật của bot hay kết bằng "!"
    # ("…còn chỗ nào cần chỉnh thì anh cứ nhắn em nhé!", chat anh Luận 27/10 lặp 6 lượt).
    zalo = [i for i, d in enumerate(doan) if "zalo" in d.lower()]
    cuoi = doan[-1] if doan else ""
    la_chot = len(doan) >= 2 and not cuoi.lstrip().startswith("-") and (
        "?" in cuoi or (zalo and zalo[-1] < len(doan) - 1))
    return (truoc.strip() + "\n" + (cuoi if la_chot else "")).strip()


def _ban_tin_truoc(conv: "Conversation") -> str:
    """Thân bản tin 📋 gần nhất bot đã gửi (chữ sau dấu 📋) — rỗng nếu chưa có."""
    for t in reversed(conv.history):
        if t.role == "assistant" and t.content and "📋" in t.content:
            return t.content.split("📋", 1)[1]
    return ""


def _do_giong_ban_tin(a: str, b: str) -> float:
    """Độ giống hai bản tin (0–1) trên chữ bỏ dấu, bỏ khoảng trắng thừa — chỉ so hình thức."""
    gon = lambda x: re.sub(r"\s+", " ", _strip_accents(x or "").lower()).strip()
    if not gon(a) or not gon(b):
        return 0.0
    return difflib.SequenceMatcher(None, gon(a), gon(b)).ratio()


BAN_TIN_GIONG_TOI_DA = 0.92   # bản tin cập nhật giống bản trước hơn mức này sau khi khách dặn sửa = chưa sửa


def _la_ban_nhap(reply: str) -> bool:
    """Lời bot là BẢN TIN rao (có dấu 📋, dòng mở bản nháp, hoặc bố cục tin có gạch đầu dòng) — không phải lời chat thường (SRS-5.1zzzzzzz204)."""
    return bool(reply) and ("📋" in reply or _MO_DAU_RE.search(reply) is not None or _is_formatted_post(reply))


def _ban_tin_da_trinh(conv: "Conversation") -> tuple[str, str] | None:
    """Bản tin 📋 cuối cùng bot gửi cho căn đang nói (từ lượt căn này bắt đầu) — chính bản khách vừa duyệt."""
    for t in reversed(conv.history[conv.active.history_start:]):
        if t.role == "assistant" and "📋" in t.content:
            return _than_ban_tin(t.content)
    return None


_TU_RE = re.compile(r"\w+")


def _viet_hoa_ca_cum(reply: str) -> bool:
    """Lời bot có cụm ≥ 3 từ liền nhau viết HOA toàn bộ (vd "NHÀ MẶT TIỀN CAO LỖ") — chủ dự án 28/10 (SRS-5.1zzzzzzz241): tiêu đề tin rao
    viết thường như câu nói, không viết hoa. Kiểm hình thức chữ (không đoán ý); chữ viết tắt lẻ (MT, HXH, WC) không tính."""
    for dong in reply.splitlines():
        chuoi = 0
        for t in _TU_RE.findall(dong):   # từ có chữ số (4m, 5WC) cắt chuỗi — "HXH MT 4m" là viết tắt, không phải cụm viết hoa
            chuoi = chuoi + 1 if len(t) >= 2 and t.isalpha() and t.isupper() else 0
            if chuoi >= 3:
                return True
    return False


def _mo_dau_da(reply: str) -> bool:
    """Lời bot mở đầu bằng "Dạ" — luật chủ dự án (cấm mở đầu "Dạ", CLAUDE.md §6) mà model có lượt không theo (chat chị N. 20/10: hai
    lượt sau khi đăng tin mở đầu bằng Dạ). Chỉ kiểm chữ đầu; không sửa lời — lệch thì gọi lại model (SRS-5.1zzzzzzz87)."""
    return re.match(r"(?i)\s*dạ(?![a-zà-ỹđ])", reply or "") is not None


def _goi_khach_la_minh(reply: str, pronoun: str) -> bool:
    """Lời bot gọi khách là "mình" như đại từ — SRS-5.1zzzzzzz171 / 214. Luật một nguồn ở `xung_ho.goi_khach_la_minh` (câu mẫu cố định
    cũng qua đó, SRS-5.1zzzzzzz226). Kiểm HÌNH THỨC lời của chính bot, không đoán ý khách."""
    return goi_khach_la_minh(reply)


def _mo_dau_ghi_nhan(reply: str) -> bool:
    """Câu đầu của lời bot là câu ghi nhận ("Em ghi nhận…", "Em đã ghi rồi…", "Em lưu vào tin rồi…", "Em nắm rồi…") — kiểm HÌNH THỨC lời
    của chính bot, không đoán ý khách (SRS-5.1zzzzzzz118). Từ 22/10 (SRS-5.1zzzzzzz131, chủ dự án bỏ hẳn kiểu ghi nhận) MỌI lượt mở như vậy
    đều gọi lại model; "Em sửa giá còn…" (nói con số vừa sửa) không phải ghi nhận."""
    # SRS-5.1zzzzzzz208 (bắn thử 26/10: "Em ghi nhận rồi ạ…", "Em ghi thêm diện tích sàn…", "Em lưu phường 9…", "Em lên thông tin địa chỉ…"):
    # thêm "ghi thêm", "lưu …", "lên thông tin" cùng lớp câu ghi nhận.
    # SRS-5.1zzzzzzz214 (chat 27/10: "Em đã ghi giá 6,2 tỷ cho anh rồi ạ" lọt vì luật chỉ liệt kê "ghi nhận / ghi rồi / ghi lại…"): mọi câu mở
    # "<bot> (đã) ghi …" là ghi nhận, chủ ngữ theo mọi cách bot xưng (em / anh / chị / cô / chú / cháu / mình); "Em cập nhật thêm cọc…" / "Em sửa
    # giá còn…" (nói ý vừa sửa) vẫn không tính (SRS-208).
    return MO_DAU_GHI_NHAN_RE.match(reply or "") is not None   # một nguồn với bộ lọc ví dụ câu chuẩn (SRS-5.1zzzzzzz215)


_NOI_DAU_CAU_RE = re.compile(r"(?i)^\s*(?:(?:vậy|vâng|ok|oke|okela|rồi|thế|thì|được|dạ)\s*[,!.]?\s*)+")


def _co_cau_ghi_nhan(loi: str) -> bool:
    """Lời bot có MỘT câu ghi nhận ở bất kỳ đâu ("Em ghi nhận…", "Vậy em ghi nhận là…", "… Em lưu giá rồi") — SRS-5.1zzzzzzz228 mục 3
    (ban-thu-srd 27/10: "Vậy em ghi nhận là căn nhà vẫn đang rao" lọt vì lưới chỉ soi đầu lời). Lượt có 📋 chỉ soi phần chat quanh bản tin."""
    phan = _phan_chat_quanh_ban_tin(loi) if "📋" in (loi or "") else (loi or "")
    return any(MO_DAU_GHI_NHAN_RE.match(_NOI_DAU_CAU_RE.sub("", c)) for c in re.split(r"(?<=[.!?…])\s+|\n+", phan) if c.strip())


_BOT_GUI_ANH_RE = re.compile(r"(?i)(?<![\wà-ỹđ])em\s+(?:sẽ\s+)?(?:gửi|chụp)\s+(?:thêm\s+)?(?:(?:vài|mấy|một|ít)\s+)?(?:tấm\s+)?(?:ảnh|hình)")


def _bot_hua_gui_anh(loi: str) -> bool:
    """Lời bot PHÍA BÁN nói "em gửi (thêm) ảnh" — ngược vai: ảnh căn là chủ nhà chụp gửi, bot không có ảnh nào để gửi chủ nhà
    (SRS-5.1zzzzzzz228 mục 4, ban-thu-srd 27/10: "Anh có muốn em gửi thêm ảnh thực tế để tin nổi bật hơn không ạ?")."""
    return bool(loi) and _BOT_GUI_ANH_RE.search(loi) is not None


_DA_DAU_RE = re.compile(r"(?i)^\s*dạ(?![a-zà-ỹđ])[\s,.!…]*")


def _bo_da_dau(loi: str) -> str:
    """Bỏ chữ "Dạ" mở đầu lời — chỉ dùng khi model đã viết lại HAI lần vẫn mở "Dạ" (SRS-5.1zzzzzzz230, chủ dự án 27/10: "sửa 2 đi"; ban-thu-ban:
    khách "Xin lỗi em…" → «Dạ không sao anh…» qua hai lần gọi lại). Không bỏ khi phần còn lại mở bằng "không" mà không phải "không sao / không
    có gì / không vấn đề" («Dạ không, em hiểu rồi» → «Không, em hiểu rồi» là đổi nghĩa) — khi ấy giữ nguyên lời."""
    m = _DA_DAU_RE.match(loi or "")
    if not m:
        return loi
    con = loi[m.end():]
    if not con.strip() or re.match(r"(?i)không(?![a-zà-ỹđ])(?!\s+(?:sao|có\s+gì|vấn\s+đề))", con):
        return loi
    return con[0].upper() + con[1:]


def _ba_chu_dau(reply: str) -> tuple[str, ...]:
    return tuple(re.findall(r"\w+", (reply or "").lower())[:3])


def _cung_mo_dau(reply: str, truoc: str) -> bool:
    """Hai lượt bot liền nhau cùng mở bằng ba chữ đầu ("Em xin lỗi anh…" ×6 với anh K., "Cô yên tâm…" ×5 với cô S. — khách ảo 26/10,
    SRS-5.1zzzzzzz213). Lưới này có từ SRS-118, bị gỡ cùng luật giọng ở SRS-207; khách ảo cho thấy gỡ nó làm bot lặp mở đầu."""
    a = _ba_chu_dau(reply)
    return len(a) == 3 and a == _ba_chu_dau(truoc)


def _cau_lap_luot_truoc(reply: str, truoc: str) -> str | None:
    """Một CÂU (≥ 6 chữ) của lời vừa viết trùng gần nguyên văn một câu lời bot lượt trước ("Em cứ thong thả bàn với bạn nha" ×2, "Hiện bên
    em chưa có căn nào ở Gò Vấp hay Phú Nhuận…" ×3 — khách ảo 26/10). So chữ bỏ dấu, bỏ dấu câu; không đụng bản tin 📋 và link."""
    if not reply or not truoc:
        return None
    gon = lambda c: re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", _strip_accents(c).lower())).strip()
    cu = {gon(c) for c in re.split(r"[.!?\n]+", truoc) if len(c.split()) >= 6}
    for c in re.split(r"[.!?\n]+", reply):
        if len(c.split()) >= 6 and "http" not in c and "📋" not in c and gon(c) in cu:
            return c.strip()
    return None


_GOI_A_RE = re.compile(r"(?<![\wÀ-ỹ])(anh chị|anh|chị|cô chú|cô|chú|bác|em|cháu)\s+(?:ạ|ơi)(?![\wÀ-ỹ])", re.I)


def _goi_a(loi: str) -> bool:
    """Lời bot có tiếng gọi khách kèm "ạ" / "ơi" ("chị ạ", "anh ơi") — tiếng gọi lặp mỗi lượt làm bot đọc như máy (SRS-5.1zzzzzzz220;
    "ơi" từ SRS-5.1zzzzzzz228: ban-thu-srd 27/10 sáu trên bảy lượt đầu kết "… quá anh ơi!")."""
    return bool(loi) and _GOI_A_RE.search(loi) is not None


_PHI_PHAN_TRAM_RE = re.compile(r"(?<![\d.,])(1|0[.,]5)\s?%")


def _phi_lech_vai(loi: str, role: SellerRole, thue: bool) -> str | None:
    """Con số phí (%) trong lời bot phía bán phải khớp `muc_phi` theo vai (SRS-5.1zzzzzzz227, ban-thu-srd 27/10: vai CHƯA rõ mà bot viết
    "Phí bên em với chủ nhà là 1% giá chốt" — model gộp câu mẫu "1% nếu là chủ nhà, 0.5% nếu là môi giới" thành một mức đoán vai).
    Trả mức đúng để dặn model, None khi khớp / không nói phí bằng %. Tin thuê bỏ qua (mức thuê không theo %)."""
    if thue or "phí" not in (loi or "").lower():
        return None
    noi = {m.group(1).replace(",", ".") for m in _PHI_PHAN_TRAM_RE.finditer(loi)}
    if not noi:
        return None
    dung = muc_phi(role, thue)
    if dung is None:
        return "chủ đầu tư: phí theo thoả thuận riêng, KHÔNG báo con số %"
    return None if noi == {m.group(1).replace(",", ".") for m in _PHI_PHAN_TRAM_RE.finditer(dung)} else dung


def _bo_markdown(reply: str) -> str:
    """Bỏ in đậm markdown (Zalo không hiển thị). Không sửa lời bot theo từ khoá ("Dạ", "anh/chị") — SRS-5.1zzzzzzz55. Ghi chú nội bộ
    của model không còn lọt vào lời bot: lượt trả lời đi qua công cụ hai ô (`ClaudeProvider.reply`, SRS-5.1zzzzzzz76)."""
    return re.sub(r"\*\*([^*]+)\*\*", r"\1", reply.strip())


class Engine:
    def __init__(
        self,
        provider: LLMProvider,
        fetcher: Callable[[str], FetchedMedia] = fetch_media,
        resolver: Callable[[str], list[tuple[str, str | None]]] | None = None,
        folder_namer: Callable[[str], str | None] | None = None,
        project_store: ProjectStore | None = None,
        conversation_store: ConversationStore | None = None,
        media_store: MediaStore | None = None,
        max_photos_per_listing: int = MAX_PHOTOS_PER_LISTING,
        nga_tu_resolver: Callable[[str | None], dict[str, str] | None] | None = None,
        dia_danh: TraDiaDanh | None = None,
    ):
        self._provider = provider
        self._fetcher = fetcher  # injectable so tests/offline don't hit the network
        self._da_xin_sao: set[str] = set()   # khách đã được xin chấm sao trong tiến trình này (kho ghi nền, SRS-5.1zzzzzzz104)
        self._max_photos = max_photos_per_listing  # cap photos KEPT per listing (storage cost)
        # url -> [(download_url, name|None)]; expands Google Drive folders/files when a
        # GOOGLE_API_KEY is configured. Default is a pass-through (one url, no name).
        self._resolve = resolver or (lambda url: [(url, None)])
        # "A | B" (ô AI gan_nga_tu) → {"phuong", "quan"} qua bảng giao_lo (giao_lo.dia_ban_tu_nga_tu). Mặc định tắt (test offline).
        self._nga_tu = nga_tu_resolver
        # Tra phường / quận / đường theo chữ rồi theo nghĩa (dia_danh.TraDiaDanh, SRS-5.1zzzzzzz60). Mặc định tắt (test offline).
        self._dia_danh = dia_danh
        # url -> the ENCLOSING folder's own name (a hint for grouping a multi-file batch).
        self._folder_name = folder_namer or (lambda url: None)
        # Kho tệp (Supabase Storage ở bản chạy thật, thư mục trên máy khi thử) — None = không giữ tệp
        # (only their vision read-out is), the behavior before this store existed.
        self._media_store = media_store
        self._projects = project_store or InMemoryProjectStore()
        # Optional durable store for listings; the in-memory dict is always the cache.
        self._convstore = conversation_store
        self._conversations: dict[str, Conversation] = {}
        # Transient: when a NEW project is created from a name that looks like a near-miss
        # (mishearing) of an existing one, register_project stashes the clarifying question here;
        # the ingest reply drains it into conv.pending_name_note so AOND ASKS ("nghi ngờ thì hỏi")
        # instead of silently forking a duplicate project/folder.
        self._pending_name_concern: tuple[str, str] | None = None
        # 20/10/2026 (SRS-5.1zzzzzzz84): một khách — một lượt một lúc. Bridge gom tin 2,5 s rồi gửi, KHÔNG xếp hàng theo khách: chủ
        # nhà nhắn tiếp lúc bot còn soạn (lượt 10–18 s) là hai lượt chạy song song trên cùng lịch sử — lượt sau gọi model khi lượt
        # trước vừa ghi lời bot → lịch sử kết thúc bằng tin bot → API 400 "assistant prefill". Lượt chat, luồng thử lại, tin nhắc
        # đều giữ khoá này khi đọc / ghi lịch sử. RLock: đường ảnh có thể gọi lại handle trong cùng luồng.
        self._khoa_luot: dict[str, threading.RLock] = {}
        self._khoa_tao = threading.Lock()

    def khoa_luot(self, user_key: str) -> threading.RLock:
        with self._khoa_tao:
            return self._khoa_luot.setdefault(user_key, threading.RLock())

    def _chuan_dia_danh(self, prop: Property, captured: list[str]) -> list[str]:
        """Ô quan / phuong / duong vừa bắt → tên chuẩn trong kho; trả các ô đổi. Đường chỉ đổi khi chỉ khác dấu / hoa thường
        (sai chữ thì để prompt hỏi khách xác nhận — khoi_dia_danh)."""
        f, moi = prop.fields, {}
        if "quan" in captured and f.get("quan"):
            q = self._dia_danh.quan(f["quan"])
            if q and q != f["quan"]:
                moi["quan"] = q
        quan = moi.get("quan") or f.get("quan")
        if "phuong" in captured and f.get("phuong"):
            p = self._dia_danh.phuong(f["phuong"], quan)
            if p is None and hasattr(self._dia_danh, "xa"):   # không phải phường TP.HCM → xã / phường Tây Ninh (hợp nhất Long An, SRS-5.1zzzzzzz128)
                x = self._dia_danh.xa(f["phuong"])
                p = x["ten_day_du"] if x else None
                if x and x.get("ngoai_vung") and not f.get("quan"):   # Bình Phước cũ (nay thuộc Đồng Nai): ngoài vùng nhận tin, SRS-5.1zzzzzzz129
                    f["_ngoai_vung"] = x["tinh_cu"]
            if p and p != f["phuong"]:
                moi["phuong"] = p
        if "duong" in captured and f.get("duong"):
            d = self._dia_danh.duong(f["duong"], quan)
            if d and d["chac"] and d["ten"] != f["duong"]:
                moi["duong"] = d["ten"]
                # Cùng tên trong dia_chi ("12 le van sy" → "12 Lê Văn Sỹ"): chỉ khác dấu / hoa thường nên thay tại chỗ, giữ phần còn lại.
                if f.get("dia_chi"):
                    moi_dc = re.sub(re.escape(f["duong"]), d["ten"], f["dia_chi"], count=1, flags=re.IGNORECASE)
                    if moi_dc != f["dia_chi"]:
                        f["dia_chi"] = moi_dc
        return prop.update(moi) if moi else []

    # --- projects (condos/developments) ---------------------------------

    def _ma_phieu(self, user_key: str) -> str:
        """Mã phiếu của người vừa nói về dự án (SRS-5.1zzzzzzz249, chủ dự án 28/10/2026: "ai nhắn zalo thì dựa theo hạng đồng bạc vàng để
        vote cho kiến thức dự án, còn admin nhắn thì ghi thẳng"). Admin (bảng `admins`) → phiếu chắc chắn, vào kho chung ngay; người khác →
        hạng theo điểm uy tín (cùng công thức `gamification` của khối ĐIỂM TIN), chưa có căn nào thì Đồng. Engine tự tính — không nhận mã
        phiếu do model đưa (ô `nguon` của công cụ ghi nhớ chỉ là chữ ghi nguồn)."""
        if not user_key or user_key == "?" or la_ma_phieu(user_key):
            return user_key
        la_admin = getattr(self._convstore, "la_nhan_vien", None)
        if la_admin is not None and la_admin(user_key):
            return ma_phieu(user_key, admin=True)
        conv = self._conversations.get(user_key)
        can = [li for li in conv.listings if li.prop.fields] if conv is not None else []
        if not can:
            return ma_phieu(user_key, "dong")
        t = self._timeliness(conv, time.time())
        diem = g.user_score([g.property_score(li.prop.completeness(), t) for li in can], num_listings=len(can))
        return ma_phieu(user_key, {g.Tier.VANG: "vang", g.Tier.BAC: "bac"}.get(g.tier_for(diem), "dong"))

    def register_project(
        self,
        name: str,
        amenities: list[str] | None = None,
        attributes: dict[str, str] | None = None,
        voter: str = "?",
    ) -> Project:
        """Register/ENRICH a project's shared facts. The project registry is GLOBAL — shared across ALL sellers. Mỗi điều người bán nói
        là một PHIẾU theo hạng (`_ma_phieu`); chỉ khi đủ phiếu (hoặc admin nói) mới vào kho chung — tiện ích cũng vậy (SRS-249)."""
        name = self._canonical_du_an(name)  # a variant/model name enriches the real project
        project = self._projects.get(name)
        if project is None:  # about to CREATE a new project — is it a near-miss of an existing one?
            concern = self.project_name_concern(name)
            if concern is not None and concern[0] == "near":
                self._pending_name_concern = (concern[1], concern[2])  # surfaced by the ingest reply → AOND asks
            project = Project(name=name)
        voter = self._ma_phieu(voter)
        for a in amenities or []:
            a = (a or "").strip()
            if a and a not in project.amenities:
                chot: dict[str, str] = {}
                merge_facts(chot, project.votes, {f"tiện ích: {a}": "có"}, voter)
                if chot:
                    project.amenities.append(a)
        merge_facts(project.attributes, project.votes, attributes or {}, voter)
        self._projects.save(project)
        return project

    def register_project_from_text(
        self, text: str, project_name: str | None = None, voter: str = "?"
    ) -> Project | None:
        """Extract a project's shared facts from free text (e.g. a lister's description).
        Pass `project_name` to attach the facts to a KNOWN project even when the text itself
        doesn't re-name it — used to record a seller's answer to a verify question as a vote.
        `voter` = the seller's id, so each seller counts once."""
        data = self._provider.extract(
            PROJECT_EXTRACTION_SYSTEM, [Message("user", text)], project_extraction_schema()
        )
        name = project_name or (data.get("ten_du_an") or "").strip()
        if not name:
            return None
        attrs: dict[str, str] = {}
        for key, label in (("dia_chi", "vị trí"), ("cong", "cổng"), ("an_ninh", "an ninh")):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                attrs[label] = val.strip()
        amenities = [a for a in (data.get("tien_ich") or []) if isinstance(a, str)]
        return self.register_project(name, amenities=amenities, attributes=attrs, voter=voter)

    def project_for(self, prop: Property, conv: "Conversation | None" = None) -> Project | None:
        """The registered project a listing belongs to (by its captured `du_an`), if any. `conv` → cộng thời gian khâu "du_an"."""
        if conv is None:
            return self._projects.get(prop.fields.get("du_an"))
        with _do(conv, "du_an"):
            return self._projects.get(prop.fields.get("du_an"))

    def project_name_concern(self, name: str) -> tuple[str, str, str] | None:
        """The "nghi ngờ thì hỏi" guard. When a project name read from a doc/seller is AMBIGUOUS,
        return (kind, canonical_project_name, question) so the caller can ASK instead of silently
        spawning a duplicate/mis-modelled project. Returns None when `name` confidently matches an
        existing project (the improved matcher already collapsed the variant) or is clearly new.

          kind="model" → `name` looks like a MẪU NHÀ (unit_type) of an existing project; a model
                         name is never a project. canonical = that project's name.
          kind="near"  → `name` shares its distinctive tail with an existing project (maybe the
                         same place under a different lead — a developer name, a mishearing…).
                         canonical = the suspected existing project's name.
        Sub-names can clash across projects, so this only SUSPECTS — the seller confirms."""
        name = (name or "").strip()
        if not name or self._projects.get(name) is not None:
            return None  # empty, or a confident match → not ambiguous
        # (a) does it look like a MODEL of an existing project? (Cosmo, Fusion Gen 5…)
        for p in self._projects.all():
            if p.find_unit_type(name) is not None:
                return ("model", p.name, cau_mau.cau("du_an_hoi_mau_nha", ten=name, du_an=p.name))
        # (b) near-miss to an existing project — a likely mishearing/typo. Two shapes, both worth
        #     a confirm: the difference is at the FRONT (same distinctive tail tokens, e.g. "Nhã
        #     Đạt Phú Định" vs "…Phú Định") OR at the TAIL (long shared prefix, e.g. "Nyah Phú
        #     BÌNH" vs "Nyah Phú ĐỊNH"). Character-exact after cleaning — not blind fuzzy.
        q_tokens = normalize_project_name(name).split()
        qs = "".join(q_tokens)
        for p in self._projects.all():
            p_tokens = normalize_project_name(p.name).split()
            ps = "".join(p_tokens)
            if not qs or not ps or qs == ps or q_tokens == p_tokens:
                continue
            shared_tail = q_tokens[-2:] == p_tokens[-2:]
            prefix = 0
            for a, b in zip(qs, ps):
                if a != b:
                    break
                prefix += 1
            shared_prefix = prefix >= 0.6 * min(len(qs), len(ps))
            if shared_tail or shared_prefix:
                return ("near", p.name, cau_mau.cau("du_an_hoi_trung_ten", ten=name, du_an=p.name))
        return None

    def _canonical_du_an(self, name: str | None) -> str:
        """Map a raw project name (as heard/read) to the CANONICAL registered project name BEFORE
        it is used to build any SharePoint path — so every spelling/apostrophe/prefix variant, and
        a MẪU NHÀ name used as a project ("Cosmo"), all land in ONE folder + one project record
        instead of spawning duplicates. This is the SOURCE fix that stops the folder mess. Falls
        back to the raw name for a genuinely new project (nothing registered matches)."""
        if not name:
            return name or ""
        p = self._projects.get(name)          # collapses apostrophe/spacing/prefix variants
        if p is not None:
            return p.name
        concern = self.project_name_concern(name)
        if concern is not None and concern[0] == "model":  # a model name → its project's folder
            return concern[1]
        return name

    def _drain_name_concern(self, conv: "Conversation") -> str:
        """Return and clear the pending near-miss clarifying question (set by register_project when
        a new project name looked like a mishearing of an existing one). Empty when there's none.
        SRS-5.1zzzzzzz254 (chủ dự án 28/10: "cùng vị trí mới cần hỏi"): chỉ hỏi khi dự án trong kho CÙNG vị trí với căn đang nói."""
        nghi, self._pending_name_concern = self._pending_name_concern, None
        if not nghi or not self._cung_vi_tri_du_an(conv, nghi[0]):
            return ""
        return nghi[1]

    def _cung_vi_tri_du_an(self, conv: "Conversation", ten: str) -> bool:
        """Căn đang nói (phường / quận / đường khách đã nói) nằm trong "vị trí" của dự án `ten` trong kho. So chữ bỏ dấu, không đoán: một bên
        chưa có vị trí thì KHÔNG coi là cùng."""
        p = self._projects.get(ten)
        vi_tri = bo_dau(str((p.attributes.get("vị trí") if p is not None else "") or ""))
        f = conv.active.prop.fields if conv.listings else {}
        if not vi_tri:
            return False
        for k in ("phuong", "quan", "duong"):
            v = re.sub(r"^(phuong|quan|xa|thi tran|duong)\s+", "", bo_dau(str(f.get(k) or "")).strip())
            if not v:
                continue
            mau = rf"\b(quan|q\.?)\s*{re.escape(v)}\b" if v.isdigit() else rf"\b{re.escape(v)}\b"
            if re.search(mau, vi_tri):
                return True
        return False

    def _hoi_trung_ten(self, conv: "Conversation", reply: str) -> str:
        """Câu "🤔 có phải dự án X" là câu hỏi DUY NHẤT của lượt (SRS-5.1zzzzzzz252 / 254): lời đã có câu hỏi thì để sang lượt chat sau
        (`_khoi_hoi_trung_ten`, thay câu hỏi kế); không thì nối vào lời."""
        q = conv.pending_name_note or self._drain_name_concern(conv)
        conv.pending_name_note = ""
        if not q:
            return reply
        if "?" in reply.split("📋", 1)[0]:
            conv.pending_name_note = q
            return reply
        return reply + "\n\n🤔 " + _xung_ho_cau(q, *self._goi_toi(conv))

    def _khoi_hoi_trung_ten(self, conv: "Conversation") -> str:
        q, conv.pending_name_note = conv.pending_name_note, ""
        if not q:
            return ""
        return ("\n\n=== ƯU TIÊN LƯỢT NÀY — HỎI TÊN DỰ ÁN (hệ thống nghi trùng một dự án CÙNG vị trí trong kho): ===\n"
                f"Hỏi đúng ý này, là câu hỏi DUY NHẤT của lượt (THAY câu hỏi thông tin kế): {q}\n")

    def register_unit_type(
        self, project_name: str, name: str, specs: dict[str, str], voter: str = "?"
    ) -> UnitType | None:
        """Attach a house model / unit type to its project (creating the project if new)."""
        if not project_name or not name:
            return None
        project_name = self._canonical_du_an(project_name)  # attach to the real project, not a variant
        project = self._projects.get(project_name) or Project(name=project_name)
        unit_type = project.find_unit_type(name)
        if unit_type is None:
            unit_type = UnitType(name=name)
            project.unit_types.append(unit_type)
        merge_facts(unit_type.specs, unit_type.votes, {k: v for k, v in specs.items() if v}, self._ma_phieu(voter))
        self._projects.save(project)
        return unit_type

    def register_unit_type_from_text(
        self, text: str, project_name: str | None = None, name: str | None = None, voter: str = "?"
    ) -> UnitType | None:
        """Extract a house model's specs from free text (a brochure read-out OR a seller's
        chat answer). Pass `project_name`/`name` to attach the specs to a KNOWN model even when
        the text doesn't re-name it — how the bot LEARNS a model from a chat answer, not just
        a file. (An empty model is harmless — acquisition still asks and learning still retries
        while it has no facts.)"""
        data = self._provider.extract(
            UNIT_TYPE_EXTRACTION_SYSTEM, [Message("user", text)], unit_type_extraction_schema()
        )
        name = name or (data.get("ten_mau_nha") or "").strip()
        project_name = project_name or (data.get("ten_du_an") or "").strip()
        if not name or not project_name:
            return None
        labels = {"dien_tich": "diện tích", "so_phong_ngu": "số phòng ngủ", "so_tang": "số tầng",
                  "mat_tien": "mặt tiền", "huong": "hướng", "layout": "bố trí"}
        specs = {label: data[key].strip() for key, label in labels.items()
                 if isinstance(data.get(key), str) and data[key].strip()}
        return self.register_unit_type(project_name, name, specs, voter=voter)

    def _ingest_doc_bytes(
        self, data: bytes, media_type: str, project_name: str, kind: str = "tài liệu",
        title: str | None = None, assistant_name: str = "Đ•ai", nguoi_gui: str = "",
    ) -> dict[str, str]:
        """A brochure / phân lô the seller sends (already fetched bytes) → transcribed once to a faithful .md and stored on the project,
        ready for cheap grounded Q&A. See [[aioi-data-model]]. `nguoi_gui` = Zalo ID người gửi (tài liệu chờ duyệt, SRS-249)."""
        markdown = self._provider.describe_media(
            [(data, media_type)], build_transcribe_instruction(assistant_name, kind),
            max_tokens=8192,  # full multi-page transcription needs headroom (don't truncate)
        ).strip()
        return self._save_project_doc(project_name, kind, title or kind, markdown, nguoi_gui=nguoi_gui)

    def _save_project_doc(self, project_name: str, kind: str, title: str, markdown: str, nguoi_gui: str = "") -> dict[str, str]:
        """Store a grounded Markdown doc on a project: upload the .md to the kho tệp `<dự án>/_Chung` (bucket riêng, best-effort) and append it to `Project.docs` (persisted), so the bot can re-read it
        later for grounded answers. Re-saving the same title REPLACES the old copy."""
        project_name = self._canonical_du_an(project_name)  # one folder per project, not per spelling
        # SHARED knowledge must never carry personal identity — strip it (and neutralise a legal-cert
        # title that embeds the owner's name) before storing anywhere AOND can relay it.
        title = _redact_doc_title(title)
        markdown = _redact_personal_data(markdown)
        web_url = item_id = ""
        if self._media_store is not None:
            try:
                ref = self._media_store.upload(
                    f"{project_name}/_Chung", f"{sanitize_filename(title)}.md",
                    markdown.encode("utf-8"), "text/markdown")
                web_url, item_id = ref.web_url, ref.item_id
            except KhoTepError:
                pass  # DB copy still kept; kho tệp is best-effort
        doc = {"kind": kind, "title": title, "markdown": markdown,
               "web_url": web_url, "item_id": item_id, "fetched_at": str(int(time.time()))}
        if nguoi_gui:   # SRS-249: tài liệu một người bán gửi chờ duyệt — người khác chưa thấy (`Project.docs_cho`); admin gửi → vào kho chung
            doc["nguoi_gui"] = self._ma_phieu(nguoi_gui)
        project = self._projects.get(project_name) or Project(name=project_name)
        project.docs = [d for d in project.docs if d.get("title") != title]  # re-ingest replaces
        project.docs.append(doc)
        self._projects.save(project)
        return doc

    def unit_type_for(self, prop: Property) -> UnitType | None:
        """The registered house model a listing is (by `unit_type` within its project)."""
        project = self.project_for(prop)
        if project is None:
            return None
        return project.find_unit_type(prop.fields.get("unit_type"))

    @staticmethod
    def _o_hoi_ke(conv: Conversation, missing: list[str]) -> str | None:
        """Ô hỏi lượt này: ô thiếu đầu tiên, TRỪ khi đó là ô vừa hỏi ở lượt trước mà khách chưa trả lời — khi ấy hỏi ý khác trước, ô
        đó lùi xuống cuối, quay lại sau (SRS-5.1zzzzzzz74; bắn thử 19/10 hỏi "ngang x dài trên sổ" 5 lượt liền khi khách lờ đi)."""
        # SRS-5.1zzzzzzz80 (chủ dự án: "khách lờ 2 lần thì để sau"): mỗi ô trong CỤM vừa hỏi mà lượt sau vẫn trống là một lần lờ — đếm
        # từng ô, không chỉ ô đầu cụm (bắn thử 20/10: câu sàn nằm giữa cụm, khách thấy 3 lần). Lờ lần 2 thì ô đó để sau bản nháp.
        for x in conv.cum_vua_hoi:
            if x in missing:
                conv.lo[x] = conv.lo.get(x, 0) + 1
        hoan = {x for x in missing if conv.lo.get(x, 0) >= 2 and conv.prop.hoan_duoc(x)}
        if hoan:
            conv.prop.hoan |= hoan
            missing = [x for x in missing if x not in hoan]
        # SRS-5.1zzzzzzz208 (bắn thử Cao Lỗ 26/10: hỏi giá 3 lần trong 6 lượt vì giá là sàn tối thiểu, khách trả lời ý khác thì lượt sau quay lại
        # giá): ô sàn (không để sau được) khách đã lờ một lần thì lùi xuống CUỐI — hỏi hết ý khác rồi mới hỏi lại.
        lui = [x for x in missing if not conv.prop.hoan_duoc(x) and conv.lo.get(x, 0) >= 1]
        if lui and len(lui) < len(missing):
            missing = [x for x in missing if x not in lui] + lui
        if len(missing) > 1 and missing[0] == conv.o_vua_hoi:
            # SRS-5.1zzzzzzz79: hỏi theo cụm — khách lờ cả cụm thì lùi CẢ CỤM xuống cuối, không hỏi tiếp ô cùng cụm.
            cum = set(conv.prop.cum_hoi(missing[0], missing))
            khac = [x for x in missing if x not in cum]
            missing = khac + [x for x in missing if x in cum] if khac else missing[1:] + missing[:1]
        conv.o_vua_hoi = missing[0] if missing else None
        conv.cum_vua_hoi = conv.prop.cum_hoi(conv.o_vua_hoi, missing)
        # Chỉ TÊN ô (không giá trị khách) — để truy được "bot hỏi lặp" từ journal (SRS-5.1zzzzzzz90: chat tester 20/10 hỏi một câu 3
        # lần mà không có gì cho biết lượt nào hệ thống chọn ô nào).
        log.warning("ô hỏi: %s · cụm: %s · lờ: %s · để sau: %s", conv.o_vua_hoi, conv.cum_vua_hoi,
                 {k: v for k, v in conv.lo.items() if v}, sorted(conv.prop.hoan))
        return conv.o_vua_hoi

    def conversation(self, user_key: str) -> Conversation:
        conv = self._conversations.get(user_key)
        if conv is None and self._convstore is not None:
            conv = self._convstore.load(user_key)  # restore a prior listing after restart
            if conv is not None:
                self._conversations[user_key] = conv
                self._dedup_basket(conv)  # SELF-HEAL: collapse duplicate mã căn from an old DB
        if conv is None:
            conv = Conversation(user_key=user_key, assistant=assign_assistant(user_key))
            self._conversations[user_key] = conv
        return conv

    def greeting(self, user_key: str) -> str:
        """Opening message for a brand-new seller: introduces the assistant and states this
        channel serves SELLERS only (buyers → 'AI Ơi Nhà Đất - Buyers'). Uses the same stable
        persona the conversation will use. The channel (CLI / Zalo webhook) decides WHEN to send
        it — typically on first contact, when the seller has no history yet."""
        return build_greeting(self.conversation(user_key).assistant.name)

    def is_new_conversation(self, user_key: str) -> bool:
        """True if this user has never exchanged a turn — the channel uses it to know whether to
        lead with `greeting()` (so a returning seller isn't greeted from scratch every restart)."""
        return not self.conversation(user_key).history

    def reset(self, user_key: str) -> None:
        """Reset all in-memory and database records for a specific user_key."""
        self._conversations.pop(user_key, None)
        if self._convstore is not None:
            self._convstore.reset(user_key)

    def reset_all(self) -> None:
        """Reset all conversations, listings, and leads across all users."""
        self._conversations.clear()
        if self._convstore is not None:
            self._convstore._conn.execute("DELETE FROM listings")
            self._convstore._conn.execute("DELETE FROM buyer_leads")
            self._convstore._conn.execute("DELETE FROM conversations")
            self._convstore._conn.commit()

    def _dedup_basket(self, conv: Conversation) -> None:
        """Collapse listings that share a (dự án, mã số căn) — a seller can't list the same
        căn twice. Keeps the FIRST of each and merges the others' non-empty fields + media into
        it. Heals baskets persisted BEFORE the unique-code invariant existed. Re-saves if it
        changed anything."""
        seen: dict[str, Listing] = {}
        survivors: list[Listing] = []
        changed = False
        for li in conv.listings:
            key = normalize_project_name(li.prop.fields.get("ma_so_can") or "") or None
            if key is not None:   # SRS-5.1zzzzzzz241 (OPEN-59): cùng căn mà một tin bán, một tin thuê là HAI tin, không gộp
                key += "|thue" if li.prop.is_rental else "|ban"
            if key is not None and key in seen:  # same mã số căn → duplicate căn → merge
                keep = seen[key]
                for k, v in li.prop.fields.items():
                    if not v:
                        continue
                    if not keep.prop.fields.get(k):
                        keep.prop.fields[k] = v
                    elif k == "du_an" and keep.prop.fields[k] != v:
                        # conflicting du_an (a mẫu-nhà name may have leaked in) → keep the one
                        # that is a REGISTERED project; a model name isn't a project.
                        if self._projects.get(v) is not None and self._projects.get(keep.prop.fields[k]) is None:
                            keep.prop.fields[k] = v
                have = {m.get("item_id") for m in keep.media}
                keep.media += [m for m in li.media if m.get("item_id") not in have]
                changed = True
                continue
            if key is not None:
                seen[key] = li
            survivors.append(li)
        if not changed:
            return
        conv.listings = survivors or [Listing()]
        if all(li.listing_id != conv.active_listing_id for li in conv.listings):
            conv.active_listing_id = conv.listings[-1].listing_id
        if self._convstore is not None:
            self._convstore.save(conv)  # reconciles the DB (deletes the dropped duplicate rows)

    def start_new_listing(self, user_key: str) -> Listing:
        """Seller starts another property — add a fresh active listing to their basket."""
        conv = self.conversation(user_key)
        listing = conv.new_listing()
        if self._convstore is not None:
            self._convstore.save(conv)
        return listing

    @staticmethod
    def _listing_by_code(conv: Conversation, code: str | None, du_an: str | None = None) -> Listing | None:
        """An existing basket listing with this mã số căn (normalized-equal). Within ONE
        seller's basket the mã số căn is the unique key — a seller can't list the same căn
        twice — so we match by CODE ALONE (a drifting/mistyped du_an, e.g. a mẫu nhà name
        landing in the du_an field, must not spawn a duplicate)."""
        key = normalize_project_name(code or "")
        if not key:
            return None
        for li in conv.listings:
            lc = li.prop.fields.get("ma_so_can")
            if lc and normalize_project_name(lc) == key:
                return li
        return None

    def import_listings(self, user_key: str, rows: list[dict[str, str]]) -> int:
        """Bulk-create listings from parsed spreadsheet rows (each row = one property). A row
        whose mã số căn already exists in the basket UPDATES that căn instead of duplicating.
        Returns how many NEW listings were added. The fastest way to grow the rổ hàng."""
        conv = self.conversation(user_key)
        added = 0
        for row in rows:
            if not row:
                continue
            existing = self._listing_by_code(conv, row.get("ma_so_can"), row.get("du_an"))
            if existing is not None:
                existing.prop.update(row)  # idempotent — re-sending the same list won't dupe
                continue
            # Fill the empty starter listing first; a fresh one for each subsequent row.
            target = conv.active if self._listing_empty(conv.active) else conv.new_listing()
            target.prop.update(row)
            added += 1
        if self._convstore is not None and rows:
            self._convstore.save(conv)
        return added

    @staticmethod
    def _listing_empty(li: Listing) -> bool:
        return li.prop.loai_hinh is None and not li.prop.fields

    def import_price_list(
        self, user_key: str, media: list[FetchedMedia], caption: str | None = None,
    ) -> tuple[int, int, str, int, bool] | None:
        """Read a PRICE-LIST / inventory PDF (or image). The WHOLE list is kept as a grounded
        reference .md on the project; but only the căn the SELLER actually rao go into their
        basket — `caption` (their message sent with the file, e.g. "tôi bán 2 căn Cosmo Gen 2
        trong này") scopes the import. Registers the project + models. Returns
        (n_new, n_imported, du_an, n_in_list) if it WAS a price list, else None. Re-sending the
        same list UPDATES existing căn (n_new < n_imported), never duplicates."""
        data = self._provider.extract_media(
            [(m.data, m.media_type) for m in media],
            build_inventory_instruction(self.conversation(user_key).assistant.name),
            inventory_schema(),
        )
        if not data.get("la_bang_gia"):
            return None
        du_an = (data.get("ten_du_an") or "").strip()
        rows: list[dict[str, str]] = []
        for r in data.get("cac_can") or []:
            code = (r.get("ma_so_can") or "").strip() if isinstance(r, dict) else ""
            if not code:
                continue
            row = {"ma_so_can": code}
            if du_an:
                row["du_an"] = du_an
            if (mn := (r.get("mau_nha") or "").strip()):
                row["unit_type"] = mn
            if (dt := (r.get("dien_tich") or "").strip()):
                row["dien_tich"] = dt
            if (qc := (r.get("quy_cach_ban_giao") or "").strip()):  # SHARED handover spec (public)
                row["quy_cach_ban_giao"] = qc
            # Keep EVERY price the căn has — a căn may carry several package prices (Air / Max /
            # chưa NT). `gia` = primary for labels, `gia_goi` = full breakdown, plus one key per
            # package (gia_air, gia_max...) so nothing is dropped and each is queryable.
            primary, breakdown, per_package = self._unit_prices(r)
            if primary:
                row["gia"] = primary
            if breakdown and breakdown != primary:
                row["gia_goi"] = breakdown
            for k, v in per_package.items():
                if k != "gia":
                    row[k] = v
            rows.append(row)
        if not rows:
            return None
        n_in_list = len(rows)
        # "Nghi ngờ thì hỏi": canonicalize the project name FIRST so a variant/MẪU-NHÀ name lands
        # on the real project (one folder), then register — register_project stashes a clarifying
        # question in self._pending_name_concern when the name is a near-miss (mishearing) of an
        # existing project, which we drain into the reply below so AOND asks instead of forking.
        conv = self.conversation(user_key)
        conv.pending_name_note = ""
        if du_an:
            du_an = self._canonical_du_an(du_an)
            for r in rows:
                if r.get("du_an"):
                    r["du_an"] = du_an
        # Share the project + models (from the FULL list) so other sellers inherit them, and keep
        # a FAITHFUL grounded .md of the WHOLE price list (mã lô ↔ mẫu nhà ↔ giá) so the bot can
        # re-read it later ("2 căn Cosmo Gen 2 là căn nào?"). Built from the rows — no extra call.
        if du_an:
            self.register_project(du_an, voter=user_key)
            for ut_name in {r["unit_type"] for r in rows if r.get("unit_type")}:
                self.register_unit_type(du_an, ut_name, {}, voter=user_key)
            self._save_project_doc(du_an, kind="danh mục", title=f"danh mục {du_an}",
                                   markdown=self._catalog_markdown(du_an, rows), nguoi_gui=user_key)
            self._seed_inventory(du_an, rows, voter=user_key)
        conv.pending_name_note = self._drain_name_concern(conv)  # near-miss cùng vị trí → ask (empty if none)
        # The prices are the SELLER'S OWN reference — keep them (keyed by mã lô) so we can attach
        # a price when they later rao a căn. Sending a price list ≠ rao bán.
        for r in rows:
            conv.price_book[normalize_project_name(r["ma_so_can"])] = r
        # Attach the seller's price to any căn ALREADY in their rổ (they rao'd it before sending
        # the price list) — so those listings now carry the seller's own price.
        for li in conv.listings:
            pb = conv.price_book.get(normalize_project_name(li.prop.fields.get("ma_so_can") or ""))
            if pb:
                li.prop.update({k: v for k, v in pb.items() if k.startswith("gia") and v})
        # Populate the BASKET only with căn the seller EXPLICITLY says to rao (never auto-rao the
        # whole list just because a file was sent). No rao intent → nothing enters the rổ.
        selling, uncertain = self._inventory_scope(user_key, caption, rows)
        return self.import_listings(user_key, selling), len(selling), du_an, n_in_list, uncertain

    def _inventory_scope(
        self, user_key: str, caption: str | None, rows: list[dict[str, str]]
    ) -> tuple[list[dict[str, str]], bool]:
        """Which căn from the price list is the seller actually rao? A bảng giá is the WHOLE
        project's inventory. Returns (rows_to_rao, uncertain). GỬI FILE ≠ RAO: the basket is
        populated ONLY when the caption expresses an explicit RAO/BÁN intent for specific căn —
        no caption, or a lookup/question ("xem diện tích các căn trong đó"), imports NOTHING (the
        price list is still kept as reference). `uncertain` True when a rao intent is ambiguous."""
        if not caption or not caption.strip():
            return [], False   # a file with no words → not a rao intent → nothing into the rổ
        summary = "\n".join(
            f"- lô {r['ma_so_can']}: mẫu {r.get('unit_type', '?')}, giá {r.get('gia', '?')}"
            for r in rows)
        data = self._provider.extract(
            INVENTORY_SCOPE_SYSTEM,
            [Message("user", f'Người bán nhắn: "{caption.strip()}"\n\nBảng giá gồm:\n{summary}')],
            inventory_scope_schema(),
        )
        uncertain = bool(data.get("khong_chac"))
        if not data.get("co_y_rao"):   # sent as reference / a question, not to rao
            return [], uncertain
        if data.get("ban_tat_ca"):
            return rows, uncertain
        wanted = {normalize_project_name(str(c)) for c in (data.get("cac_ma_lo") or []) if c}
        keep = [r for r in rows if normalize_project_name(r["ma_so_can"]) in wanted]
        return keep, uncertain   # rao intent but no căn resolved → empty (ask, don't guess-all)

    @staticmethod
    def _unit_prices(can: dict) -> tuple[str, str, dict[str, str]]:
        """From an extracted price-list căn that may carry MULTIPLE package prices
        (`gia_goi`=[{ten_goi, gia}]) plus/or a single `gia`, return
        (primary, breakdown_display, per_package_keys) — nothing dropped. per_package keys are
        `gia_<slug>` (gia_air, gia_max, gia_chua_nt...) so each price is stored and queryable."""
        goi = [((str(g.get("ten_goi") or "").strip()), (str(g.get("gia") or "").strip()))
               for g in (can.get("gia_goi") or [])
               if isinstance(g, dict) and str(g.get("gia") or "").strip()]
        single = str(can.get("gia") or "").strip()
        per: dict[str, str] = {}
        for name, price in goi:
            slug = re.sub(r"\s+", "_", normalize_project_name(name)) if name else ""
            per["gia_" + slug if slug else "gia"] = price
        if single and "gia" not in per:
            per["gia"] = single
        breakdown = " · ".join(f"{name or 'giá'}: {price}" for name, price in goi) if goi else single
        primary = single or (goi[0][1] if goi else "")
        return primary, breakdown, per

    def _seed_inventory(self, du_an: str, rows: list[dict[str, str]], voter: str) -> None:
        """Populate the PROJECT's inventory (`Project.units`) from a price list — one unit per
        mã lô with its known attributes (mẫu nhà, giá, diện tích). This is the queryable
        substrate `aioi.inventory` reads; it GROWS later as sellers tell us more (vi_tri, huong,
        view...). Distinct from the seller's basket (what THEY rao)."""
        project = self._projects.get(du_an)
        if project is None:
            return
        voter = self._ma_phieu(voter)
        for r in rows:
            code = r.get("ma_so_can")
            if not code:
                continue
            # SHARED knowledge is the PHYSICAL/public reality — the catalog: which căn exist,
            # their mẫu nhà, diện tích. GIÁ is the SELLER'S OWN offer (each seller quotes their
            # own) → it does NOT belong in the shared inventory; it lives on the seller's basket.
            attrs: dict[str, str] = {}
            if r.get("unit_type"):
                attrs["mau_nha"] = r["unit_type"]
            if r.get("dien_tich"):
                attrs["dien_tich"] = r["dien_tich"]
            if r.get("quy_cach_ban_giao"):   # handover spec (thô/mặt tiền/nội thất Air-Max) — SHARED
                attrs["quy_cach_ban_giao"] = r["quy_cach_ban_giao"]
            project.upsert_unit(code, attrs, voter=voter)
        self._projects.save(project)

    @staticmethod
    def _catalog_markdown(du_an: str, rows: list[dict[str, str]]) -> str:
        """A faithful Markdown CATALOG (shared knowledge) — which mã lô exists, its mẫu nhà,
        diện tích, and its QUY CÁCH BÀN GIAO (xây thô + hoàn thiện mặt tiền; và có hoàn thiện nội
        thất / chọn gói Air-Max hay không). NO price: giá (kể cả giá từng gói) is each seller's
        OWN offer (kept on their basket), not shared."""
        lines = [f"# Danh mục căn — {du_an}", "",
                 "*(Kiến thức chung: mã lô ↔ mẫu nhà ↔ diện tích ↔ quy cách bàn giao. GIÁ (kể cả "
                 "giá từng gói) là của riêng từng người rao, không lưu ở đây.)*", "",
                 "| Mã lô/căn | Mẫu nhà | Diện tích | Quy cách bàn giao |", "|---|---|---|---|"]
        for r in rows:
            lines.append(f"| {r.get('ma_so_can','')} | {r.get('unit_type','')} | "
                         f"{r.get('dien_tich','')} | {r.get('quy_cach_ban_giao','')} |")
        return "\n".join(lines)

    def _map_columns(self, headers: list[str]) -> dict[str, str]:
        """{header → field slug}: deterministic aliases first, LLM for the rest (arbitrary sheets)."""
        mapping = bulk.auto_header_map(headers)
        unmapped = [h for h in headers if h not in mapping]
        if unmapped:
            data = self._provider.extract(
                build_column_map_system(unmapped),
                [Message("user", ", ".join(unmapped))],
                column_map_schema(),
            )
            used = set(mapping.values())
            for slug, header in data.items():
                if isinstance(header, str) and header.strip() in unmapped and slug not in used:
                    mapping[header.strip()] = slug
                    used.add(slug)
        return mapping

    def import_csv(self, user_key: str, text: str) -> int:
        """Bulk-import a CSV (deterministic + LLM-assisted column mapping for odd headers)."""
        rows = bulk.rows_from_mapping(text, self._map_columns(bulk.csv_headers(text)))
        return self.import_listings(user_key, rows)

    def import_from_url(self, user_key: str, url: str) -> int:
        """Import listings from a Google Sheets link, or a Drive/other link to a CSV/Excel file."""
        return self.import_csv(user_key, self._spreadsheet_text(url))

    def _spreadsheet_text(self, url: str) -> str:
        """Resolve a link to CSV text: Google Sheets → CSV export; Drive/other → fetch the
        file and decode (Excel via openpyxl, detected by the .xlsx zip magic 'PK')."""
        sheet = bulk.sheets_export_url(url)
        if sheet is not None:
            data, _ = fetch_raw(sheet)
            return data.decode("utf-8", "replace")
        data, _ = fetch_raw(url)
        if data[:2] == b"PK":  # .xlsx is a zip
            return bulk.xlsx_to_csv(data)
        return data.decode("utf-8-sig", "replace")  # CSV / text

    def switch_listing(self, user_key: str, index: int) -> Listing | None:
        """Make listing #index (1-based) active — the seller picked which căn they mean."""
        conv = self.conversation(user_key)
        if not (1 <= index <= len(conv.listings)):
            return None
        conv.active_listing_id = conv.listings[index - 1].listing_id
        if self._convstore is not None:
            self._convstore.save(conv)
        return conv.active

    def set_status(self, user_key: str, status: str) -> Listing:
        """Update the ACTIVE listing's status (đã bán / dừng bán / đã cho thuê...)."""
        conv = self.conversation(user_key)
        conv.active.status = status
        if self._convstore is not None:
            self._convstore.save(conv)
        return conv.active

    def _basket_block(self, conv: Conversation) -> str:
        """Make the bot aware of the WHOLE basket so it can disambiguate ("căn nào?")
        when the seller acts on 'a' listing. Empty for a single-listing seller."""
        if len(conv.listings) <= 1:
            return ""
        lines = []
        for i, li in enumerate(conv.listings, 1):
            mark = " (đang nói tới)" if li.listing_id == conv.active_listing_id else ""
            lines.append(f"{i}. {li.label()}{mark}")
        return (
            f"\nRỔ HÀNG CỦA KHÁCH — khách đang có {len(conv.listings)} căn:\n"
            + "\n".join(lines)
            + "\nKhi khách báo một hành động lên 'một căn' (đã bán, dừng bán, đổi giá, có khách...) "
            "mà CHƯA RÕ là căn nào trong danh sách trên, hãy HỎI LẠI 'căn nào ạ?' (nhắc địa chỉ "
            "để khách chọn) TRƯỚC khi xử lý. Nếu khách báo đã bán/cho thuê xong thì chúc mừng "
            "và xác nhận cập nhật.\n"
        )

    @staticmethod
    def _structured_shared_block(project: Project | None) -> str:
        """The STRUCTURED shared knowledge that lives on the Project object (NOT in the .md docs):
        project-wide facts (chủ đầu tư, vị trí, tiện ích...) + every MẪU NHÀ's specs (số tầng, số
        phòng, bố trí). Without this, both the reply memory AND the grounded-Q&A path miss the model
        details and AOND wrongly says 'em không tra cứu được mẫu Cosmo Gen 2'. Shared → reused by
        the next seller. Returns markdown sections (no wrapper), or '' if there's nothing."""
        if project is None:
            return ""
        sections: list[str] = []
        shared = project.facts()  # amenities + project-level attributes (chủ đầu tư, vị trí, cổng...)
        if shared:
            sections.append("### Thông tin CHUNG dự án\n" + "\n".join(f"- {l}" for l in shared))
        models = [ut for ut in project.unit_types if ut.specs]
        if models:
            lines = []
            for ut in models:
                facts = "; ".join(ut.facts())
                lines.append(f"- **{ut.name}**: {facts}" if facts else f"- **{ut.name}**")
            sections.append(
                "### MẪU NHÀ (áp dụng cho MỌI căn cùng mẫu — kiến thức chung, dùng lại được)\n"
                + "\n".join(lines))
        return "\n\n".join(sections)

    def _project_memory_block(self, project: Project | None, conv: "Conversation | None" = None) -> str:
        """The project knowledge the bot ALREADY HAS (price list the seller just shared + the
        pre-loaded phân lô / mẫu nhà docs) — injected every seller turn so AOND never 'forgets'
        the căn it just read and can RESOLVE a reference ('căn Cosmo', 'căn góc', 'căn lớn nhất')
        against real data instead of asking dumb questions or creating a junk listing."""
        if project is None:
            return ""
        sections: list[str] = []
        if (structured := self._structured_shared_block(project)):
            sections.append(structured)
        for d in project.docs_cho(conv.user_key if conv is not None else None):   # tài liệu chưa duyệt của người khác: không đọc (SRS-249)
            sections.append(f'### {d.get("title", "tài liệu")}\n{d.get("markdown", "")}')
        if not sections:
            return ""
        docs = "\n\n".join(sections)
        return (
            f"\n\n=== BỘ NHỚ DỰ ÁN '{project.name}' (em ĐÃ CÓ SẴN — KHÔNG hỏi lại thứ có ở đây) ===\n"
            + docs
            + "\n=== HẾT BỘ NHỚ ===\n"
            "- Khi khách hỏi về MỘT MẪU NHÀ ('mẫu Cosmo Gen 2', 'căn này mẫu gì') — hãy TRẢ LỜI "
            "NGAY từ mục MẪU NHÀ ở trên (số tầng, số phòng, bố trí...). Đây là kiến thức CHUNG em "
            "ĐÃ CÓ, KHÔNG phải 'tra cứu internet' — TUYỆT ĐỐI đừng nói 'em không tra cứu được'.\n"
            "CÁCH DÙNG BỘ NHỚ (bắt buộc):\n"
            "- Khi khách nhắc tới MỘT CĂN — kể cả mơ hồ ('căn Cosmo', 'căn góc', 'căn diện tích "
            "lớn nhất', 'căn view sông') — hãy TRA bảng giá + phân lô ở trên để biết ĐÓ LÀ MÃ LÔ "
            "NÀO, diện tích, địa chỉ, giá bao nhiêu. TUYỆT ĐỐI đừng hỏi lại thông tin đã có ở "
            "trên, đừng tạo căn rỗng/tin rác.\n"
            "- Đặc điểm dự án ('lớn nhất', 'góc', 'mặt tiền đường lớn', 'view'...) phải xét TRÊN "
            "TOÀN BỘ dự án trong phân lô — KHÔNG chỉ vài căn đang có trong rổ. Căn khớp CÓ THỂ là "
            "một căn CHƯA có trong rổ; đó là bình thường (khách đang rao thêm căn mới).\n"
            "- Nếu suy ra được nhưng CHƯA chắc 100% (vd không rõ có phải lô góc), hãy NÊU căn em "
            "nghĩ tới kèm dữ kiện (mã lô, diện tích, mặt tiền) rồi HỎI XÁC NHẬN ('...phải căn đó "
            "không ạ?'). Khi khách XÁC NHẬN, hãy THÊM đúng căn đó vào rổ (nếu chưa có) với mã lô + "
            "diện tích + mẫu + giá từ bộ nhớ, rồi đề xuất rao với mức giá đó.\n"
            "- Nếu bộ nhớ KHÔNG có đủ dữ kiện để xác định (vd phân lô không ghi diện tích/giá của "
            "căn đó), hãy nói THẲNG em chưa có dữ liệu đó và hỏi khách, TUYỆT ĐỐI không bịa số.\n"
        )

    @staticmethod
    def _seller_price_block(conv: Conversation) -> str:
        """The prices the SELLER already gave — injected into the reply so AOND KNOWS it has them
        and answers "giá căn X?" instead of lying "em chưa có giá / không đọc được file". Two
        sources, both the seller's OWN private prices: the uploaded price list (`price_book`) AND
        the căn already in their basket (a listing carries gia/gia_air/gia_max). The basket matters
        because `price_book` for a căn already rao'd may be gone after a restart while the listing's
        prices persist — without this AOND wrongly says it can't read the price file."""
        rows: dict[str, dict] = {}
        for row in conv.price_book.values():
            code = normalize_project_name(row.get("ma_so_can", ""))
            if code:
                rows[code] = dict(row)
        for li in conv.listings:  # basket listings carry the seller's own price too (persisted)
            f = li.prop.fields
            code = normalize_project_name(f.get("ma_so_can", ""))
            if not code or not any(f.get(k) for k in ("gia", "gia_goi", "gia_air", "gia_max")):
                continue
            rows.setdefault(code, {}).update({k: v for k, v in f.items()
                                              if (k.startswith("gia") or k in ("ma_so_can", "unit_type")) and v})
        if not rows:
            return ""
        lines = []
        for row in rows.values():
            code = row.get("ma_so_can", "")
            mau = f" ({row['unit_type']})" if row.get("unit_type") else ""
            gia = row.get("gia_goi") or row.get("gia") or "?"
            lines.append(f"- căn {code}{mau}: {gia}")
        return (
            "\n\n=== GIÁ ANH/CHỊ (người rao) ĐÃ GỬI (từ bảng giá) — em ĐÃ CÓ sẵn ===\n"
            + "\n".join(lines)
            + "\nĐây là GIÁ của CHÍNH người rao đang chat. Khi họ hỏi giá / hỏi 'giá 3 căn', hãy "
            "TRẢ LỜI NGAY bằng các giá trên. TUYỆT ĐỐI KHÔNG nói 'em chưa có giá', 'anh chưa báo "
            "giá', hay 'em không đọc được file' — em CÓ các giá này rồi.\n"
        )

    def handle(self, user_key: str, text: str, now: float | None = None) -> TurnResult:
        """Một lượt khách. ID thử chat bằng model thử (`llm.base.model_chat_thu`, SRS-5.1zzzzzzz234) — khách thật giữ model mặc định."""
        m = model_chat_thu() if _la_id_thu(user_key) else None
        # SRS-5.1zzzzzzz239: `gemini` không phải tên model Claude — cả lượt của ID thử đi thẳng Gemini (`llm.base.NGUON_LUOT`).
        dau = MODEL_CHAT_LUOT.set(m) if m and m != CHI_GEMINI else None
        dau_nguon = NGUON_LUOT.set(CHI_GEMINI) if m == CHI_GEMINI else None
        try:
            return self._handle(user_key, text, now)
        finally:
            if dau is not None:
                MODEL_CHAT_LUOT.reset(dau)
            if dau_nguon is not None:
                NGUON_LUOT.reset(dau_nguon)

    def _handle(self, user_key: str, text: str, now: float | None = None) -> TurnResult:
        now = now if now is not None else time.time()
        conv = self.conversation(user_key)
        conv.do_luot = {}
        so_token.bat_dau_luot()   # đếm token của lượt này cho tin phụ chế độ test (SRS-5.1zzzzzzz130)

        clean_text = text.strip()
        cmd = clean_text.lower()

        # Check if text contains a media/document URL (e.g. from Zalo or pasted link)
        url_match = re.search(r"https?://\S+", clean_text)
        if url_match:
            cand_url = url_match.group(0).rstrip(".,)>\"'")
            cand_lower = cand_url.lower()
            # 18/10/2026 (SRS-5.1zzzzzzz47): link Google Sheets / file .xlsx .csv dán vào chat cũng vào handle_link (nhập rổ hàng)
            # — trước đây chỉ link Drive mới tới được nhánh bảng tính.
            media_exts = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".xlsx", ".csv")
            is_media = (any(cand_lower.endswith(ext) for ext in media_exts) or "zadn.vn" in cand_lower
                        or "drive.google.com" in cand_lower or "docs.google.com/spreadsheets" in cand_lower)
            if is_media:
                caption = clean_text.replace(cand_url, "").strip() or None
                return self.handle_link(user_key, cand_url, now=now, caption=caption)

        # Admin trả lời câu khách mua hỏi bằng lệnh "#mã: câu trả lời" (SRS-5.1zzzzzzz70) — cú pháp hệ thống tự đặt
        # trong tin nhắc (`notify_info_request_escalation`), không phải đoán ý khách; chỉ nhận từ Zalo ID của admin (CTV bỏ 28/10/2026).
        lenh = lenh_tra_loi(clean_text)
        la_nhan_vien = getattr(self._convstore, "la_nhan_vien", None)
        if lenh and la_nhan_vien is not None and la_nhan_vien(user_key):
            conv.history.append(Turn("user", text, now))
            cau = self._convstore.tra_loi_theo_ma(*lenh)
            reply = (f"Em đã chuyển câu trả lời về #{lenh[0]} cho khách rồi ạ." if cau is not None
                     else f"Tin #{lenh[0]} hiện không có câu khách hỏi nào đang chờ ạ.")
            conv.history.append(Turn("assistant", reply, now))
            conv.last_ai_at = now
            return self._build_result(conv, reply, captured=[], now=now)

        conv.history.append(Turn("user", text, now))

        # Lượt AI đọc tin khách MỘT lần, trước mọi nhánh (SRS-5.1zzzzzzz55): xác nhận xoá, câu hỏi dự án, xin bản vẽ đều đọc từ
        # đây thay cho bộ dò từ khoá. Thao tác rổ hàng chỉ áp ở bước 1, sau khi đã chắc tin này là sửa rổ hàng.
        ke_hoach = self._lap_ke_hoach(conv)
        tl = conv.y_luot.get("tra_loi_khach_hoi")
        if tl and getattr(self._convstore, "tra_loi_cau_hoi", None) is not None:
            conv.y_luot["da_tra_loi_khach"] = self._convstore.tra_loi_cau_hoi(tl["id"], tl["tra_loi"])

        # 0−. PENDING DESTRUCTIVE CONFIRMATION: a clear/bỏ/chỉ-giữ proposed last turn waits here.
        #     Apply it ONLY on an explicit yes; a "thôi/không" cancels; anything else (the seller
        #     moved on) also cancels safely and falls through to normal handling — never delete
        #     without a clear confirm.
        if conv.pending_destructive:
            if conv.y_luot.get("xac_nhan_xoa") == "dong_y":
                _changed, receipts = self._apply_pending_destructive(conv)
                reply = self._receipt_reply(conv, receipts) or self._cau_khach(conv, "da_cap_nhat_ro")
                conv.history.append(Turn("assistant", reply, now))
                conv.last_ai_at = now
                return self._build_result(conv, reply, captured=[], now=now)
            conv.pending_destructive = []  # not a clear yes → keep the basket intact
            if conv.y_luot.get("xac_nhan_xoa") == "tu_choi":
                reply = self._cau_khach(conv, "giu_nguyen_ro")
                conv.history.append(Turn("assistant", reply, now))
                conv.last_ai_at = now
                return self._build_result(conv, reply, captured=[], now=now)
            # else: fall through and process this message normally (basket left untouched)

        # 0. FACTUAL QUESTION about the project ("diện tích lô 42?", "gói Max gồm gì?") → answer
        #    GROUNDED from the stored source .md, BEFORE any extraction — a question is NOT an
        #    edit to the basket, so it must not run listing extraction (else "lô 42 và 50" would
        #    be misread as adding 2 căn).
        q_project = self.project_for(conv.prop, conv)
        factual_q = bool(conv.y_luot.get("cau_hoi_du_an"))
        # A seller whose project has an INVENTORY is handled by the agent loop (section 2). For a
        # factual question we do NOT divert to `_answer_from_docs` — that's a historyless, focused
        # call, so a pronoun question ("mẫu nhà NÀY thế nào?", "bạn không tra ra sao?") loses its
        # referent and AOND wrongly says "em không tra cứu được". The agent loop answers it with
        # the conversation history + the structured memory (model specs) + the catalog tools.
        agent_project = q_project is not None and bool(q_project.units)
        if (q_project is not None and not agent_project
                and (q_project.docs_cho(conv.user_key) or conv.price_book) and factual_q):
            reply = self._answer_from_docs(conv, q_project, text)
            conv.history.append(Turn("assistant", reply, now))
            conv.last_ai_at = now
            return self._build_result(conv, reply, captured=[], now=now)

        # 0b. A request to SEE a drawing / floor plan / render ("bản vẽ căn 24") is a MEDIA
        #     request, not a basket edit — answer with the model's stored drawing if we have it,
        #     else offer to get it. Handled BEFORE extraction so it can never mutate the basket
        #     (a mis-parse once pruned the rổ hàng from "bản vẽ căn 24").
        if conv.y_luot.get("xin_xem_ban_ve"):
            reply = self._media_request_reply(conv, q_project, text)
            conv.history.append(Turn("assistant", reply, now))
            conv.last_ai_at = now
            return self._build_result(conv, reply, captured=[], now=now)

        # 1. Silent planning: turn the seller's message into an ordered list of basket
        #    operations and execute them (returns the changed field names; structural receipts
        #    land on conv.last_receipts). SKIPPED when an agent-loop seller is asking a factual
        #    question — a question is NOT a basket edit, and running operations could misread it
        #    (e.g. "lô 42 và 50?") as adding căn. The agent loop answers it below.
        if agent_project and factual_q:
            captured = []
        else:
            conv.truoc_luot, conv.truoc_id, conv.bc_luot, conv.bo_luot = dict(conv.prop.fields_khach()), conv.active_listing_id, {}, []
            captured, conv.last_receipts = self._ap_dung_ke_hoach(conv, ke_hoach)
            if captured:   # lượt khách CHO THÔNG TIN (SRS-5.1zzzzzzz131 bản 2): 3 lượt đầu bắt buộc mở bằng lời khen
                conv.so_luot_thong_tin = int(conv.so_luot_thong_tin or 0) + 1
            if conv.y_luot.get("yeu_cau_viet"):   # SRS-5.1zzzzzzz218: lời dặn cách viết theo căn (khoá `_`, không vào ô tin / bản tin)
                self._nho_yeu_cau_viet(conv.prop, conv.y_luot["yeu_cau_viet"])
            if conv.y_luot.get("ngoai_vung"):   # khoá nội bộ `_` — theo căn qua lưu / nạp lại, không vào ô tin (fields_khach)
                conv.prop.fields["_ngoai_vung"] = conv.y_luot["ngoai_vung"]
                # Cùng một căn bị mở hai lần (bắn thử 209 KB1: lượt làm rõ "quận Đống Đa, Hà Nội" thành "add") — căn chưa trình bản
                # nháp trùng ĐÚNG tên đường và giá với căn vừa biết ngoài vùng là chính căn đó: ẩn theo (SRS-5.1zzzzzzz108).
                f0 = conv.prop.fields
                for li in conv.listings:
                    f = li.prop.fields
                    if (li is not conv.active and not li.listing_proposed and f.get("duong") and f.get("gia")
                            and f.get("duong") == f0.get("duong") and f.get("gia") == f0.get("gia")):
                        f["_ngoai_vung"] = conv.y_luot["ngoai_vung"]

            # 1a-destructive. A DESTRUCTIVE basket op (xóa hết / bỏ căn / chỉ giữ) is confirmed
            #    with a reply built from the REAL post-action state, so the words match the deed —
            #    never "đã xóa hết" while căn remain. Return immediately (no persona reply needed).
            receipt_reply = self._receipt_reply(conv, conv.last_receipts)
            if receipt_reply is not None:
                conv.history.append(Turn("assistant", receipt_reply, now))
                conv.last_ai_at = now
                return self._build_result(conv, receipt_reply, captured, now)

            # 1a-duyệt (SRS-5.1zzzzzzz47): tin từ chat chỉ lên web khi khách ĐỒNG Ý bản nháp — ghi / xoá dấu duyệt trên DB
            #     trước khi soạn lời, để câu "đã đăng" đọc đúng trạng thái mới.
            ghi_duyet = getattr(self._convstore, "ghi_duyet", None)
            if conv.duyet_luot and ghi_duyet is not None:
                try:
                    self._convstore.save(conv)
                    ghi_duyet(conv, conv.duyet_luot == "dong_y")
                    # Mô tả trên web = ĐÚNG bản tin khách vừa duyệt (SRS-5.1zzzzzzz89): trước đây lõi không ghi `description` ở đâu
                    # cả — tin lên web không có mô tả, CRM báo "thiếu mô tả" dù khách đã duyệt cả bài.
                    ban = _ban_tin_da_trinh(conv)
                    ghi_ban_tin = getattr(self._convstore, "ghi_ban_tin", None)
                    if conv.duyet_luot == "dong_y" and ban and ghi_ban_tin is not None:
                        ghi_ban_tin(conv, ban[1])
                except Exception as e:  # noqa: BLE001 — ghi duyệt hỏng thì lời bot vẫn đọc trạng thái thật
                    log.warning("ghi_duyet lỗi: %s", e)

            # 1a-ngã tư (18/10/2026, SRS-5.1zzzzzzz43): khách tả vị trí bằng ngã tư mà chưa nói phường → tra bảng giao lộ;
            #     ngã tư nằm trong đúng một phường thì điền phường, khỏi hỏi lại.
            if self._nga_tu and conv.prop.fields.get("gan_nga_tu") and not conv.prop.fields.get("phuong"):
                dia_ban = self._nga_tu(conv.prop.fields.get("gan_nga_tu"))
                if dia_ban:
                    if conv.prop.fields.get("quan"):
                        dia_ban.pop("quan", None)
                    captured = list(dict.fromkeys(list(captured) + conv.prop.update(dia_ban)))

            # 1a-phường dự án (21/10/2026, SRS-5.1zzzzzzz93): căn trong dự án mà khách chưa nói phường → phường của dự án trong kho vào
            #     CHÍNH ô tin. Trước đây chỉ kho ghi cột `ward` lúc lưu; ô `phuong` của bot vẫn trống nên bot tưởng thiếu phường, hỏi mãi
            #     và không ra bản nháp (bắn thử KB5 / KB2 21/10).
            tra_phuong = getattr(self._convstore, "phuong_theo_du_an", None)
            if tra_phuong is not None and conv.prop.fields.get("du_an") and not conv.prop.fields.get("phuong"):
                try:
                    with _do(conv, "du_an"):
                        p_du_an = tra_phuong(conv.prop.fields)
                except Exception as e:  # noqa: BLE001 — tra hỏng thì bot hỏi phường như cũ
                    log.warning("phuong_theo_du_an lỗi: %s", e)
                    p_du_an = None
                if p_du_an:
                    captured = list(dict.fromkeys(list(captured) + conv.prop.update({"phuong": p_du_an})))

            # 1a-địa danh (19/10/2026, SRS-5.1zzzzzzz60): ô phường / quận / đường AI vừa đọc → tên chuẩn trong kho (chữ trước, nghĩa
            #     sau; máy kiểm tên còn gần chữ khách). Không chắc thì giữ chữ khách.
            if self._dia_danh and captured:
                with _do(conv, "dia_danh"):
                    captured = list(dict.fromkeys(list(captured) + self._chuan_dia_danh(conv.prop, captured)))

            # 1a-số nhà (28/10/2026, SRS-5.1zzzzzzz236): khách cho số nhà / hẻm cụ thể mà chưa nói phường → tra phường TRƯỚC, không ra mới hỏi.
            if self._dia_danh:
                with _do(conv, "dia_danh"):
                    captured = list(dict.fromkeys(list(captured) + self._phuong_tu_dia_chi(conv, captured)))

            # 1a. A newly-captured address/project makes a listing's folder name readable — if it
            #     already has files stored under the old (id-only) folder, rename it to match.
            if captured:
                self._sync_media_folder(conv.active)

        # 1b/1c. LEARN project / model knowledge from a seller's CHAT ANSWER (not just from a file): mỗi điều khách tả về dự án / mẫu nhà
        #     là một PHIẾU theo hạng (SRS-5.1zzzzzzz249) — đủ phiếu mới vào kho chung, cũng là cách câu "hỏi xác minh" chốt được. Chỉ chạy
        #     ở lượt AI đọc là khách đang tả dự án (`mo_ta_du_an`), không thêm một lần gọi mỗi lượt. Trước bản này chỉ học khi dự án CHƯA có
        #     dữ kiện nào — nay dự án nguồn mogi luôn có sẵn dữ kiện nên điều kiện cũ làm bot không bao giờ học thêm.
        project = self.project_for(conv.prop, conv)
        du_an = conv.prop.fields.get("du_an")
        ut_name = conv.prop.fields.get("unit_type")
        if du_an and conv.y_luot.get("mo_ta_du_an"):
            self.register_project_from_text(text, project_name=project.name if project is not None else du_an, voter=user_key)
            if ut_name:
                self.register_unit_type_from_text(text, project_name=du_an, name=ut_name, voter=user_key)
            project = self.project_for(conv.prop, conv)  # reload for the block below

        # 1d. Buyer branch routing
        # 1d. Buyer branch routing
        if conv.role == "buyer" and conv.buyer_lead is not None:
            customer_pronoun = _detect_customer_pronoun(conv, text)
            next_field = conv.buyer_lead.next_question_field()
            if next_field:   # SRS-5.1zzzzzzz154: đếm câu hỏi nhu cầu — đủ MAX_CAU_HOI_MUA thì thôi hỏi (xem next_question_field)
                conv.buyer_lead.fields["_so_cau_hoi"] = str(_so_nguyen(conv.buyer_lead.fields.get("_so_cau_hoi")) + 1)
            if next_field in O_TU_VAN_MUA:   # SRS-5.1zzzzzzz116: câu tư vấn hỏi một lần — khách lờ thì lượt sau qua câu kế
                da = [x for x in (conv.buyer_lead.fields.get("_da_hoi") or "").split(",") if x]
                conv.buyer_lead.fields["_da_hoi"] = ",".join(sorted(set(da) | {next_field}))
            system = build_buyer_chat_system(conv.assistant.name, conv.buyer_lead, next_field)
            viec, can = self._viec_mua(conv, text)
            if getattr(self._convstore, "can_phu_hop", None) is not None:
                system += (khoi_can_cho_khach(can, not co_tieu_chi(conv.buyer_lead)) + khoi_viec_vua_ghi(viec)
                           + khoi_lich_dang_cho(conv.y_luot.get("lich_cho"), customer_pronoun, conv.assistant.name))
            system += du_an_mua.khoi_du_an(conv.y_luot.get("du_an_mua"))   # SRS-5.1zzzzzzz184: dữ kiện dự án trong kho cho câu khách hỏi
            system += du_an_mua.khoi_du_an_khu(conv.y_luot.get("du_an_khu"))   # SRS-5.1zzzzzzz250: "quận X có dự án gì"
            system += du_an_mua.khoi_can_du_an(conv.y_luot.get("can_du_an"))   # SRS-5.1zzzzzzz250: căn còn bán trong một dự án
            if conv.so_nhan == SO_TU_VAN and not any(t.role == "assistant" for t in conv.history):
                # SRS-5.1zzzzzzz210: lượt đầu ở số tư vấn — chào theo câu mẫu chỉ hỏi chuyện tìm mua / thuê (số ký gửi giữ lời chào hai lựa chọn).
                system += khoi_chao_tu_van(conv.assistant.name, cau_mau.cau("chao_tu_van", goi_toi_khach(customer_pronoun)[0], ten=conv.assistant.name))
            uu_tien = (khoi_can_nguoi(conv) or khoi_phap_ly(conv, self._can_dang_noi(conv, can))   # SRS-5.1zzzzzzz178: một khối ưu tiên
                       or khoi_hoi_ve_mua(conv.hoi_ve_luot))   # SRS-5.1zzzzzzz212: phí / uy tín / định giá cũng có khối ở phía mua
            system += ((uu_tien + KHOI_MOT_UU_TIEN) if uu_tien else "") + khoi_xung_ho(customer_pronoun, conv.assistant.name, _xung_ho_doan(conv))   # một nguồn xưng hô cả hai phía (SRS-5.1zzzzzzz86)
            system += khoi_tai_chinh()   # số tham khảo tượng trưng, chỉ nói khi khách tự hỏi (SRS-5.1zzzzzzz148)
            system += khoi_tin_tra_loi(conv.tin_tra_loi)   # SRS-5.1zzzzzzz270
            system = self._ghep_cau_chuan(system, conv) + self._khoi_danh_gia(conv)
            # Khách mua báo đã đủ thông tin căn đang xem (SRS-5.1zzzzzzz104) → xin chấm sao một lần.
            xin_sao = bool(conv.y_luot.get("xong_viec_mua") and can) and self._nen_xin_sao(conv)
            if xin_sao:
                system += KHOI_SAP_XIN_SAO
            reply = self._provider.reply(system, conv.messages(), max_tokens=REPLY_MAX_TOKENS).strip()
            if not reply:
                raise LoiTraLoi("lời gửi khách rỗng")
            reply = self._soat_hinh_thuc(conv, system, _bo_markdown(reply), can_mua=can)
            if xin_sao:
                reply = self._gan_xin_sao(conv, reply)
            conv.history.append(Turn("assistant", reply, now))
            conv.last_ai_at = now
            return self._build_result(conv, reply, captured, now)

        # 2. Choose the reply mode (no word cap on the listing stages):
        #    - essentials still missing       -> <=30-word praise + 1 question (collecting)
        #    - "khá đầy đủ", not yet proposed -> draft the ad, ask "hấp dẫn chưa" (no fee)
        #    - draft already shown            -> react to approval & pivot to the fee (§V)
        customer_pronoun = _detect_customer_pronoun(conv, text)
        customer_is_em = _xung_tre(customer_pronoun)   # em / cháu: câu mẫu biến thể `_em` (SRS-5.1zzzzzzz214)

        # Căn ngoài vùng nhận tin (SRS-5.1zzzzzzz86, chủ dự án 20/10: chỉ TP.HCM, Bình Dương, Vũng Tàu, Long An, Tây Ninh, Đồng Nai):
        # nói khéo chưa nhận khu vực đó — không hỏi tiếp ô thiếu, không soạn tin, không đăng (kho ẩn tin, tin nhắc bỏ qua).
        if conv.prop.fields.get("_ngoai_vung"):
            system = (build_ngoai_vung_system(conv.assistant.name, conv.prop.fields["_ngoai_vung"])
                      + khoi_xung_ho(customer_pronoun, conv.assistant.name, _xung_ho_doan(conv)) + khoi_can_nguoi(conv) + khoi_phap_ly(conv))
            reply = self._provider.reply(system, conv.messages(), max_tokens=REPLY_MAX_TOKENS).strip()
            if not reply:
                raise LoiTraLoi("lời gửi khách rỗng")
            # Cùng luật hình thức như mọi nhánh (SRS-5.1zzzzzzz108 — bắn thử 209: "Dạ, em rất tiếc…" ở nhánh này lọt vì bỏ qua bước kiểm).
            reply = self._soat_hinh_thuc(conv, system, _bo_markdown(reply))
            conv.history.append(Turn("assistant", reply, now))
            conv.last_ai_at = now
            return self._build_result(conv, reply, captured, now)

        o_truoc = conv.o_vua_hoi   # ô lượt trước hỏi — khách chưa trả lời mà hệ thống đổi ô thì dặn model đừng hỏi lại (SRS-5.1zzzzzzz208)
        next_field = self._o_hoi_ke(conv, conv.prop.missing_fields())
        thieu = conv.prop.missing_fields()   # sau _o_hoi_ke: ô khách lờ 2 lần đã để sau (SRS-5.1zzzzzzz80)
        cum_hoi = conv.prop.cum_hoi(next_field, thieu)   # SRS-5.1zzzzzzz79: các ô hỏi gộp một câu lượt này
        # Khách bảo đăng (SRS-5.1zzzzzzz86): đủ ô tối thiểu thì ra bản nháp 📋 thật ngay, ô còn lại hỏi sau khi duyệt; còn thiếu thì
        # hỏi đúng ô tối thiểu — bản trước prompt hỏi chuyện tự soạn "bài đăng" không 📋, hệ thống không ghi là bản nháp.
        xin_dang = bool(conv.y_luot.get("xin_dang")) and not conv.listing_proposed
        toi_thieu = conv.prop.thieu_toi_thieu() if xin_dang else []
        if xin_dang:   # SRS-5.1zzzzzzz105: một dòng mỗi lượt khách bảo đăng khi chưa có bản nháp — chỉ tên ô, không lời khách
            log.warning("Xin đăng: thiếu tối thiểu=%s", toi_thieu or "-")
        if xin_dang and not toi_thieu:
            conv.prop.hoan |= {x for x in thieu if conv.prop.hoan_duoc(x)}
        elif toi_thieu and next_field not in toi_thieu:
            next_field = toi_thieu[0]
            cum_hoi = [o for o in conv.prop.cum_hoi(next_field, thieu) if o in toi_thieu] or [next_field]
            conv.o_vua_hoi, conv.cum_vua_hoi = next_field, cum_hoi
        # SRS-5.1zzzzzzz215 (soát prompt 27/10): khách nói phường cũ bị chia ("phường 6" Bình Thạnh) → khối địa danh bảo hỏi phường, trong khi dòng
        # "Thông tin cần hỏi tiếp theo" bảo CHỈ hỏi ô khác — hai lệnh kéo hai hướng. Nay ô hỏi lượt đó LÀ phường (một lần, cờ ở ô tin).
        if next_field and next_field != "phuong" and not xin_dang and not conv.prop.fields.get("_phuong_chia_da_hoi") and self._phuong_cu_bi_chia(conv):
            conv.prop.fields["_phuong_chia_da_hoi"] = "1"
            next_field, cum_hoi = "phuong", ["phuong"]
            conv.o_vua_hoi, conv.cum_vua_hoi = next_field, cum_hoi
        # Project awareness: if the listing's project is registered, inherit its verified
        # facts (and lightly confirm); if it's named but unknown, prompt the bot to acquire
        # knowledge (ask the seller / request a link); if no project, nothing.
        project_block = build_project_block(
            project,
            conv.prop.fields.get("du_an"),
            self.unit_type_for(conv.prop),
            conv.prop.fields.get("unit_type"),
        )
        if conv.hoi_ve_luot == "phi":   # SRS-5.1zzzzzzz212: lượt này bot báo phí (khối ưu tiên phí) — lượt duyệt sau không hỏi "biết phí chưa"
            conv.prop.fields["_phi_da_bao"] = "1"
        is_listing_post = conv.prop.summary_ready() or conv.listing_proposed or (xin_dang and not toi_thieu)
        trinh_nhap = False
        xin_sao = False
        if not is_listing_post:
            system = build_chat_system(
                conv.assistant.name, conv.prop, next_field, conv.vai_phi, project_block, cum=cum_hoi,
                hoi_lai=bool(next_field and conv.lo.get(next_field, 0) >= 1),   # SRS-5.1zzzzzzz200: đừng nhắn trùng câu cũ
                o_bo_qua=o_truoc if o_truoc in thieu else None,
            ) + khoi_xin_dang(toi_thieu, conv.prop) + self._khoi_diem_tin(conv, now)
        elif not conv.listing_proposed:
            conv.listing_proposed = True
            trinh_nhap = True
            # SRS-5.1zzzzzzz200: ra bản nháp theo cổng tối thiểu thì ô còn thiếu để SAU khi khách duyệt, mỗi lượt một ô (không dồn
            # hỏi trước bản nháp, và không hỏi lại cùng một ô hai nơi).
            conv.prop.hoan |= {x for x in thieu if conv.prop.hoan_duoc(x)}
            system = build_listing_proposal_system(
                conv.assistant.name, conv.prop, project_block, customer_is_em=customer_is_em, xung_ho=customer_pronoun,
                toi=goi_toi_khach(customer_pronoun, conv.assistant.name)[1], yeu_cau_moi=conv.y_luot.get("yeu_cau_viet"),
            )
        else:
            web_tin = self._trang_thai_web(conv)
            if web_tin is not None and conv.prop.fields.get("_da_bao_dang"):
                web_tin["da_bao_dang"] = True   # SRS-5.1zzzzzzz220: đã báo đăng tin ở lượt trước — không "xin phép đăng tin" lại mỗi lần "ok"
            # SRS-5.1zzzzzzz254: khách đã duyệt mà tin chưa hiển thị (hệ thống / admin đang hoàn tất — không phải thiếu ô khách bổ sung được)
            # → hẹn nhắc `len_web`; có hẹn thật thì bot mới được nói "tin hiển thị em nhắn".
            if (web_tin is not None and web_tin.get("len_web") is False and not web_tin.get("cho_duyet")
                    and (not web_tin.get("thieu") or web_tin.get("phuong_bao_admin"))):
                hen = getattr(self._convstore, "hen_bao_len_web", None)
                web_tin["hen_bao_len_web"] = bool(hen is not None and hen(conv))
            system = build_fee_followup_system(
                conv.assistant.name, conv.prop, conv.vai_phi, project_block, web=web_tin,
                duyet=conv.duyet_luot, phi_da_bao=bool(conv.prop.fields.get("_phi_da_bao")), yeu_cau_moi=conv.y_luot.get("yeu_cau_viet"),
            )
            len_web = bool(web_tin and web_tin.get("len_web"))
            if conv.duyet_luot == "dong_y" and len_web:
                conv.prop.fields["_phi_da_hoi"] = "1"   # lượt duyệt hỏi phí (hoi_phi) — lượt sau là lúc xin chấm sao
            if len_web and (conv.duyet_luot == "dong_y" or web_tin.get("da_bao_dang")):
                conv.prop.fields["_da_bao_dang"] = "1"
            # Hết việc của tin (tin đã lên web, đã hỏi phí ở lượt duyệt, lượt này khách không hỏi gì mới, không sửa tin — chỉ trả lời cụm
            # vừa hỏi, không còn ô để sau bản nháp).
            da_hoi = {x for x in (conv.prop.fields.get("_sau_da_hoi") or "").split(",") if x}
            o_hoan = conv.prop.cau_hoi_sau_ra_tin()   # ô khách lờ 2 lần trước bản nháp: prompt (hoi_sau) hỏi lại lượt này, một lần
            if o_hoan and len_web and conv.prop.fields.get("_phi_da_hoi") == "1" and conv.duyet_luot is None:
                da_hoi.add(f"hoan:{o_hoan}")
                conv.prop.fields["_sau_da_hoi"] = ",".join(sorted(da_hoi))
            sau_dang = (len_web and conv.prop.fields.get("_phi_da_hoi") == "1" and conv.duyet_luot is None
                        and conv.hoi_ve_luot is None and set(captured) <= O_SAU_DANG and not o_hoan)
            # Xin chấm sao (SRS-5.1zzzzzzz104, chủ dự án 21/10): lượt đầu hết việc; mỗi khách một lần (kho quyết).
            xin_sao = sau_dang and self._nen_xin_sao(conv)
            # Hỏi thêm sau khi tin lên web (SRS-5.1zzzzzzz116): từ lượt SAU lượt xin sao (giữ đúng lúc xin sao chủ dự án chốt), lượt khách
            # chấm sao thì chỉ cảm ơn; mỗi lượt MỘT cụm, mỗi cụm MỘT lần (`_sau_da_hoi`, lưu cùng tin).
            if sau_dang and not xin_sao and not conv.y_luot.get("danh_gia"):
                cum_sau = conv.prop.cum_sau_dang(da_hoi)
                if cum_sau:
                    # SRS-5.1zzzzzzz178: mỗi lượt MỘT ô (không hỏi gộp cụm) — ghi "sau:<ô>" để lượt sau tới ô kế của cùng cụm.
                    conv.prop.fields["_sau_da_hoi"] = ",".join(sorted(da_hoi | {f"sau:{cum_sau[1][0]}"}))
                    system += khoi_hoi_sau_dang(cum_sau[1][:1], conv.prop)
                    log.warning("Hỏi sau đăng: cụm %s", cum_sau[0])

        # Tra địa danh (SRS-5.1zzzzzzz60/61): hỏi xác nhận tên đường kho gợi ý ở MỌI nhánh (cả lượt soạn bản nháp), kể phường khi hỏi phường.
        with _do(conv, "dia_danh"):
            system += khoi_dia_danh(self._dia_danh, conv.prop.fields, None if is_listing_post else next_field)
            if conv.y_luot.get("_phuong_vua_tra"):   # SRS-5.1zzzzzzz236: phường hệ thống vừa tra theo số nhà / hẻm — báo một lần, không hỏi
                system += (f'\n\nPHƯỜNG HỆ THỐNG VỪA TRA (khách CHƯA nói): theo số nhà / hẻm trong địa chỉ, nhà thuộc {conv.y_luot["_phuong_vua_tra"]}. '
                           "KHÔNG hỏi phường. Nhắc khách MỘT câu ngắn nhà thuộc phường này, sai thì khách báo lại.\n")
            # SRS-5.1zzzzzzz115: lượt này hỏi phường mà kho hẻm thu được 1–4 phường → lời bot phải nhắc (dạng hỏi) — bắn thử 21/10
            # Haiku có khối "Kho hẻm" trong prompt vẫn hỏi trống "nhà mình thuộc phường nào". Kiểm ở _soat_hinh_thuc.
            hem_phai_nhac = ([] if is_listing_post or "phuong" not in (cum_hoi or [next_field])
                             else phuong_kho_hem(self._dia_danh, conv.prop.fields))
            if not is_listing_post:
                system += self._khoi_hoi_du_an(conv)   # SRS-5.1zzzzzzz181: kho có đúng một dự án cùng đường → hỏi xác nhận MỘT lần
        if conv.y_luot.get("tach_ban_thue"):   # SRS-5.1zzzzzzz241 (OPEN-59 a)
            loai = "CHO THUÊ" if conv.y_luot["tach_ban_thue"] == "thue" else "BÁN"
            system += (f"\nHỆ THỐNG VỪA MỞ THÊM MỘT TIN {loai} cho CÙNG căn này (khách muốn vừa bán vừa cho thuê): hai tin, hai giá riêng, chung "
                       "căn. Báo khách MỘT câu ngắn là em lên cả hai tin; tin nào chưa có giá thì hỏi giá đó, THAY cho câu hỏi kế (một câu hỏi cả lượt) "
                       f"({'giá thuê theo tháng' if loai == 'CHO THUÊ' else 'giá bán'}).\n")
        if conv.y_luot.get("da_tra_loi_khach"):
            system += ("\nEM VỪA CHUYỂN câu trả lời của anh/chị cho khách mua đang hỏi (hệ thống báo khách ngay). Cảm ơn ngắn gọn, "
                       "nói em đã báo khách rồi, rồi mới tiếp chuyện tin rao.\n")

        # Bề ngang căn hay độ rộng đường (SRS-5.1zzzzzzz96, chủ dự án 21/10: "có cho hỏi"): lượt này vừa ghi ô bề ngang mà chưa có
        # hai chiều lô để đối chiếu (`_mot_cum_mot_o` không kiểm được) → hỏi lại MỘT lần cho chắc. Khách nói rõ "ngang" thì model không hỏi.
        if "mat_tien" in captured and not _hai_chieu_lo(conv.prop.fields) and not conv.prop.fields.get("_mt_da_hoi"):
            conv.prop.fields["_mt_da_hoi"] = "1"
            system += khoi_hoi_mat_tien(conv.prop.fields.get("mat_tien", ""))

        if not is_listing_post and not any(t.role == "assistant" for t in conv.history):
            system += khoi_chao_lan_dau(conv.assistant.name, cau_mau.cau("chao_lan_dau", goi_toi_khach(customer_pronoun)[0], ten=conv.assistant.name))
        system = self._ghep_cau_chuan(system + khoi_xung_ho(customer_pronoun, conv.assistant.name, _xung_ho_doan(conv)), conv) + self._khoi_danh_gia(conv)
        if xin_sao:
            system += KHOI_SAP_XIN_SAO

        # Khối ưu tiên theo điều khách HỎI — lượt AI lập thao tác đọc theo nghĩa (conv.hoi_ve_luot, SRS-5.1zzzzzzz54); bản trước
        # dò từ khoá ("chi phí" nào cũng thành hỏi phí). Con số phí theo vai từ _fee_hint, không viết tay.
        hoi_ve_khoi = ""
        if conv.hoi_ve_luot == "phi":
            hoi_ve_khoi = (
                "\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI VỀ PHÍ: ===\n"
                "Trả lời RÕ RÀNG trước: đăng tin MIỄN PHÍ; CHỈ thu phí khi giao dịch thành công, không thành thì không tốn đồng nào. "
                f"Con số phí đúng theo VAI NGƯỜI RAO / BỐI CẢNH ở trên (bán: {PT_CHU} chính chủ, {PT_MG} môi giới; cho thuê: {PHI_THUE} "
                "= 3/4 của MỘT tháng tiền thuê; chưa rõ vai thì nêu cả hai hoặc hỏi khéo khách là chủ nhà hay môi giới). Sau đó nối lại nội dung căn đang trao đổi.\n"
                + ((_fee_hint(conv.vai_phi) + "\n") if _fee_hint(conv.vai_phi) else "")
                + ((khoi_bao_phi(conv.vai_phi, conv.prop.is_rental) + "\n") if khoi_bao_phi(conv.vai_phi, conv.prop.is_rental) else "")
            )
        elif conv.hoi_ve_luot == "uy_tin":
            hoi_ve_khoi = (
                "\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI VỀ UY TÍN / CÔNG TY: ===\n"
                "Khách vừa hỏi về danh tính công ty hoặc lo ngại an toàn/lừa đảo. Trả lời để khách yên tâm:\n"
                f"- Giới thiệu AI Ơi Nhà Đất ({SITE_HOST}) là nền tảng công nghệ kết nối người bán / cho thuê với người mua / thuê thực tế.\n"
                "- Không chia sẻ thông tin cá nhân và số điện thoại của khách cho bên thứ ba.\n"
                "- Chỉ thu phí khi giao dịch thành công.\n"
                "Sau đó lịch sự mời khách an tâm chia sẻ tiếp thông tin căn nhà.\n"
            )
        elif conv.hoi_ve_luot == "link_web":
            # Câu "tin đã lên web" do trạng thái THẬT quyết (khoi_trang_thai_web, SRS-5.1zzzzzzz44) — tin chưa ra bản nháp thì
            # chắc chắn chưa hiển thị.
            web = self._trang_thai_web(conv) if is_listing_post else {"len_web": False, "chua_ban_nhap": True}
            hoi_ve_khoi = (
                "\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI VỀ LINK HOẶC CÁCH ĐĂNG TRÊN WEB: ===\n"
                "Khách vừa hỏi xem link bài đăng, xem tin ở đâu hoặc tin trên web đang hiển thị như thế nào. Hãy TRẢ LỜI RÕ RÀNG, CHUYÊN NGHIỆP:\n"
                + khoi_trang_thai_web(web, conv.prop.is_rental)[1] + "\n"
            )
        elif conv.hoi_ve_luot == "tinh_hinh_ban":
            web = self._trang_thai_web(conv) if is_listing_post else {"len_web": False}
            hoi_ve_khoi = khoi_tinh_hinh_ban(self._tinh_hinh_tin(conv), bool(web and web.get("len_web")))
        elif conv.hoi_ve_luot == "dinh_gia":
            hoi_ve_khoi = KHOI_DINH_GIA
        # SRS-5.1zzzzzzz178: MỘT khối ưu tiên mỗi lượt, theo thứ tự cần người > pháp lý > ngoài việc > hỏi về (phí / uy tín / link / tình hình /
        # định giá); có khối ưu tiên thì không ép khen theo lượt, không hỏi ô kế. Không có thì mới tới khối khen theo lượt.
        uu_tien = (khoi_can_nguoi(conv) or khoi_phap_ly(conv, self._can_cua_chu(conv)) or khoi_ngoai_viec(conv) or hoi_ve_khoi
                   or self._khoi_hoi_trung_ten(conv))
        # SRS-5.1zzzzzzz207: bỏ khối khen theo lượt — giọng theo bản anh Luận ("khen ngợi điểm mạnh trước" nằm sẵn trong prompt).
        system += (uu_tien + KHOI_MOT_UU_TIEN) if uu_tien else ""
        system += self._basket_block(conv)  # basket awareness → disambiguate "căn nào?"
        system += self._project_memory_block(project, conv)  # remember the price list + phân lô; reason over it
        system += self._seller_price_block(conv)  # the seller's OWN prices → answer, don't lie "chưa có"
        system += khoi_tin_tra_loi(conv.tin_tra_loi)   # SRS-5.1zzzzzzz270
        # A seller in a project WITH an inventory → the reply runs through the agent LOOP (same
        # sales-mode prompt + tools). The model decides per turn whether to query the catalog,
        # add a resolved căn, learn a fact, or ask for a link — NO keyword gate (Mảnh B). A plain
        # listing (no project inventory) uses the single chat call, unchanged.
        # Length is model-decided from the prompt (short while chatting, full ad when complete) —
        # NOT clamped by a token cap (Vietnamese is token-dense; a tight cap hard-cuts mid-word).
        with _do(conv, "tra_loi"):
            if project is not None and project.units:
                reply = self._agent_reply(conv, project, system, now)
            else:
                reply = self._provider.reply(system, conv.messages(), max_tokens=REPLY_MAX_TOKENS).strip()

        if not reply:   # SRS-5.1zzzzzzz82: không gửi "kết nối mạng gián đoạn, nhắn lại giúp em" — server giữ chỗ rồi tự thử lại
            raise LoiTraLoi("lời gửi khách rỗng")

        reply = self._soat_hinh_thuc(conv, system, _bo_markdown(reply), hem_phai_nhac if len(hem_phai_nhac) <= 4 else [])
        la_nhap = _la_ban_nhap(reply)
        if trinh_nhap and (not la_nhap or "zalo" not in reply.lower()):
            # SRS-5.1zzzzzzz204: lượt trình bản nháp mà model đáp như chat thường (ban-thu-ban 26/10 Âu Cơ: đủ loại · vị trí · giá · 4 facet mà
            # tám lượt không có bản tin, vì `listing_proposed` đã bật nên lượt sau không thử lại), hoặc bản tin thiếu câu mời nhắn Zalo (khối 4
            # của AD_FORMAT; 2/8 bản nháp bắn thử bỏ nó). Gọi lại model MỘT lần; bản tin vẫn không ra thì tắt `listing_proposed` để lượt sau
            # trình lại, thay vì nói phí khi khách chưa hề thấy bản tin; bản tin ra mà thiếu câu mời thì giữ bản cũ.
            log.warning("Lượt trình bản nháp: %s — gọi lại model một lần", "không ra bản tin" if not la_nhap else "thiếu câu mời nhắn Zalo")
            nhac = (system + "\n\nLƯỢT TRƯỚC CỦA EM CHƯA ĐẠT: " + ("chưa phải bản tin rao." if not la_nhap else "bản tin thiếu CÂU MỜI CHỐT nhắn Zalo (khối 4).")
                    + " Lượt này BẮT BUỘC gửi đúng bản tin rao theo CẤU TRÚC BẮT BUỘC ở trên (dòng mở, tiêu đề, mô tả, gạch đầu dòng, câu mời "
                    "chốt nhắn Zalo, câu hỏi khách duyệt) — không đáp bằng lời chat.")
            with _do(conv, "tra_loi_lai"):
                lai = self._provider.reply(nhac, conv.messages(), max_tokens=REPLY_MAX_TOKENS).strip()
            lai = self._soat_hinh_thuc(conv, nhac, _bo_markdown(lai), []) if lai else lai
            if lai and _la_ban_nhap(lai) and "zalo" in lai.lower():
                reply = lai
            elif not la_nhap:
                conv.listing_proposed = False
        if trinh_nhap:
            reply = cat_truoc_mo_dau(reply, customer_pronoun, goi_toi_khach(customer_pronoun, conv.assistant.name)[1])
        if xin_sao:
            reply = self._gan_xin_sao(conv, reply)

        if "📋" in reply:
            conv.prop.fields.pop("_da_bao_dang", None)   # bản tin mới → lần duyệt kế được báo đăng / cập nhật lại (SRS-5.1zzzzzzz220)
        conv.history.append(Turn("assistant", reply, now))
        conv.last_ai_at = now
        return self._build_result(conv, reply, captured, now)

    def _tinh_hinh_tin(self, conv: Conversation) -> dict | None:
        """Số khách quan tâm / câu hỏi / lịch xem THẬT của tin đang nói (SRS-5.1zzzzzzz116). Kho không có / đọc lỗi → None (bot nói
        kiểm lại rồi báo, không đoán)."""
        doc = getattr(self._convstore, "tinh_hinh_tin", None)
        if doc is None:
            return None
        try:
            return doc(conv)
        except Exception as e:  # noqa: BLE001
            log.warning("tinh_hinh_tin lỗi: %s", e)
            return None

    def _khoi_cau_chuan(self, conv: "Conversation | None" = None) -> str:
        """Câu chuẩn người chấm sửa ở CRM làm ví dụ (SRS-5.1zzzzzzz88). Kho không có bảng / đọc lỗi → "" (prompt như cũ)."""
        doc = getattr(self._convstore, "cau_chuan_mau", None)
        if doc is None:
            return ""
        try:
            if conv is not None:
                with _do(conv, "cau_chuan"):
                    return khoi_cau_chuan(doc())
            return khoi_cau_chuan(doc())
        except Exception as e:  # noqa: BLE001 — thiếu ví dụ không được làm hỏng lượt trả lời
            log.warning("khoi_cau_chuan lỗi: %s", e)
            return ""

    def _khoi_diem_tin(self, conv: Conversation, now: float) -> str:
        """Khối ĐIỂM TIN cho model (SRS-5.1zzzzzzz216): cùng số `gamification` mà `TurnResult` trả bridge — một nguồn, không tính lại
        kiểu khác. Ô còn thiếu theo `missing_fields()`, ảnh theo `Listing.media` (ảnh khách đã gửi qua chat)."""
        timeliness = self._timeliness(conv, now)
        diem = g.property_score(conv.prop.completeness(), timeliness)
        tat_ca = [g.property_score(li.prop.completeness(), timeliness) for li in conv.listings] or [diem]
        diem_nguoi = g.user_score(tat_ca, num_listings=len(conv.listings))
        try:
            so_anh = len(conv.active.media or [])
        except Exception:  # noqa: BLE001 — chưa có căn nào
            so_anh = 0
        return khoi_diem_tin(diem, g.tier_for(diem_nguoi).value, diem_nguoi, conv.prop.missing_fields(), so_anh, conv.prop)

    def _ghep_cau_chuan(self, system: str, conv: "Conversation | None" = None) -> str:
        """Ghép khối câu chuẩn vào system TRƯỚC `RANH_GIOI_CACHE` (SRS-5.1zzzzzzz180): khối giống nhau cho mọi khách và chỉ đổi khi người
        chấm sửa (nhớ 60 giây), nên nằm trong phần được cache — lấy 16 dòng thay vì 8 mà lượt sau đọc lại gần như miễn phí. Prompt không
        có dấu (nhánh cũ) thì nối cuối như trước."""
        k = self._khoi_cau_chuan(conv)
        if not k:
            return system
        if RANH_GIOI_CACHE in system:
            return system.replace(RANH_GIOI_CACHE, k + RANH_GIOI_CACHE, 1)
        return system + k

    def _khoi_danh_gia(self, conv: Conversation) -> str:
        """Khách vừa chấm sao (đã kiểm trích dẫn) → dặn model cảm ơn / xin lỗi. Kho ghi ở server (có tên khách, chạy nền)."""
        dg = conv.y_luot.get("danh_gia")
        return khoi_cam_on_sao(dg[0]) if dg else ""

    def _nen_xin_sao(self, conv: Conversation) -> bool:
        """Mỗi khách xin chấm sao MỘT lần (SRS-5.1zzzzzzz104): kho có bảng `danh_gia_ai` mới quyết; kho khác (SQLite / thử) không xin.
        Lượt khách vừa chấm / xin gặp người thật thì không xin."""
        da_xin = getattr(self._convstore, "da_xin_danh_gia", None)
        if da_xin is None or conv.y_luot.get("danh_gia") or conv.y_luot.get("can_nguoi_that") or conv.user_key in self._da_xin_sao:
            return False
        try:
            return not da_xin(conv.user_key)
        except Exception as e:  # noqa: BLE001 — đọc kho lỗi thì thôi không xin, không làm hỏng lượt
            log.warning("da_xin_danh_gia lỗi: %s", e)
            return False

    def _gan_xin_sao(self, conv: Conversation, reply: str) -> str:
        """Nối câu xin chấm sao (code sinh, đúng câu chủ dự án duyệt) thành đoạn riêng — bộ chia gửi thành tin nhắn riêng."""
        self._da_xin_sao.add(conv.user_key)
        conv.y_luot["xin_danh_gia"] = True
        p = _detect_customer_pronoun(conv)
        goi, toi = goi_toi_khach(p, conv.assistant.name)
        cau = cau_xin_sao(goi, tre=_xung_tre(p), toi=toi)
        return f"{reply.rstrip()}\n\n{cau}"

    def _soat_hinh_thuc(self, conv: Conversation, system: str, reply: str, phuong_phai_nhac: list[str] | None = None,
                        can_mua: list[dict] | None = None) -> str:
        """Luật HÌNH THỨC code kiểm được mà không đọc ý — lệch thì gọi lại model MỘT lần kèm lý do, không tự sửa chữ.
        Bản tin (📋) phải có giá trong tiêu đề (SRS-5.1zzzzzzz86: bắn thử 20/10, bản tin CẬP NHẬT của KB3 bỏ giá dù AD_FORMAT bắt
        buộc); không mở đầu "Dạ" (SRS-5.1zzzzzzz87). Cả nhánh bán lẫn nhánh mua. `phuong_phai_nhac` (SRS-5.1zzzzzzz115): phường kho
        hẻm của lượt hỏi phường — lời không nhắc phường nào trong đó thì viết lại."""
        reply = _gan_dau_ban_tin(reply)
        thieu_td = _tieu_de_thieu(reply, conv.prop)
        ly_do = []
        if phuong_phai_nhac and not any(ten_tran(p) in bo_dau(reply) for p in phuong_phai_nhac):
            ds = ", ".join(phuong_phai_nhac)
            ly_do.append(f"Lời vừa viết hỏi phường mà không nhắc phường kho hẻm ({ds}) — câu hỏi phường phải nêu "
                         + (f"{ds} ở dạng hỏi xác nhận (\"nhà mình ở {ds} đúng không …?\")" if len(phuong_phai_nhac) == 1
                            else "các phường này cho khách chọn") + ", không hỏi trống \"thuộc phường nào\".")
        if thieu_td:
            ly_do.append("Bản tin vừa viết có TIÊU ĐỀ thiếu " + ", ".join(thieu_td)
                         + "; tiêu đề 20–25 từ khi dữ liệu đủ (không quá 25), đủ vị trí · diện tích · giá.")
        lo_rieng = _lo_thong_tin_rieng(reply, conv.prop)
        if lo_rieng:
            ly_do.append("Bản tin rao vừa viết có thông tin RIÊNG của chủ (" + ", ".join(lo_rieng) + ") — bản tin lên web cho người mua "
                         "đọc, bỏ hẳn các ý đó khỏi bản tin.")
        bia_hem = _hem_mt_khong_co_du_lieu(reply, conv)
        if bia_hem:
            ly_do.append("Bản tin rao vừa viết có chữ " + ", ".join(f"\"{x}\"" for x in bia_hem) + " nhưng chủ nhà CHƯA nói nhà ở hẻm / mặt tiền "
                         "(dữ liệu căn chưa có) — bỏ hẳn các chữ đó khỏi tiêu đề và mô tả, KHÔNG đoán loại đường vào; ví dụ trong luật chỉ để "
                         "minh hoạ cách viết gọn.")
        bia_ct = _chi_tiet_khong_co_du_lieu(reply, conv)
        if bia_ct:
            ly_do.append("Bản tin rao vừa viết có " + ", ".join(f"\"{x}\"" for x in bia_ct) + " nhưng chủ nhà KHÔNG hề nói — bỏ hẳn các ý đó; "
                         "mọi ý trong tin chỉ lấy từ dữ liệu căn / lời chủ nhà, không thêm tiện ích quanh nhà hay tình trạng nhà.")
        bia_pl = _phap_ly_vai_khong_co_du_lieu(reply, conv)
        if bia_pl:
            ly_do.append("Bản tin rao vừa viết có " + ", ".join(f"\"{x}\"" for x in bia_pl) + " nhưng chủ nhà CHƯA nói pháp lý / giấy tờ (hoặc chưa "
                         "nói mình là chủ nhà) — bỏ hẳn các ý đó khỏi tiêu đề, mô tả và gạch đầu dòng, KHÔNG viết \"pháp lý rõ ràng\" hay đoán loại sổ.")
        nhan = _nhan_khoi_trong_tin(reply)
        if nhan:
            ly_do.append("Bản tin rao vừa viết in tên khối (" + ", ".join(f"\"{x}:\"" for x in nhan) + ") — tên khối trong BỐ CỤC chỉ để em biết "
                         "thứ tự, KHÔNG in ra; viết thẳng nội dung.")
        if _mo_dau_da(reply):
            ly_do.append("Lời vừa viết mở đầu bằng \"Dạ\" — câu đầu phải vào thẳng nội dung, không \"Dạ\".")
        if _viet_hoa_ca_cum(reply):   # SRS-5.1zzzzzzz241
            ly_do.append("Lời vừa viết có cụm chữ viết HOA toàn bộ — viết thường như câu nói (chỉ hoa chữ đầu câu và tên riêng), kể cả tiêu đề tin rao.")
        if _goi_khach_la_minh(reply, _detect_customer_pronoun(conv)):
            ly_do.append("Lời vừa viết gọi khách là \"mình\" (\"em xin lỗi mình\", \"Mình đang cần…\") — KHÔNG dùng \"mình\" gọi khách hay tự xưng: "
                         "gọi đúng cách khách xưng (em / cháu / anh / chị), chưa rõ thì \"anh/chị\"; tự xưng đúng QUY TẮC XƯNG HÔ ở trên. "
                         "Chỉ \"nhà mình / căn mình\" khi nói về căn của khách.")
        phi_dung = _phi_lech_vai(reply, conv.vai_phi, conv.prop.is_rental) if conv.role != "buyer" else None
        if phi_dung:
            ly_do.append(f"Lời vừa viết báo phí % không đúng vai người rao đã biết — mức đúng: \"{phi_dung}\". Vai CHƯA rõ thì nêu đủ cả hai "
                         "mức như vậy hoặc hỏi khéo khách là chủ nhà hay môi giới, KHÔNG tự đoán một vai.")
        if _nhieu_cau_hoi(reply):   # SRS-5.1zzzzzzz252 (chủ dự án 28/10: "dặn hỏi 1 câu rồi mà nó lại hỏi nhiều thế")
            ly_do.append("Lời vừa viết hỏi khách NHIỀU HƠN MỘT câu — mỗi lượt chỉ hỏi MỘT ý (một dấu \"?\"), hỏi xong thì dừng chờ khách trả lời; "
                         "ý còn lại để lượt sau.")
        # SRS-5.1zzzzzzz228 mục 3 (chủ dự án 27/10: "câu nào cũng dc, đừng trùng 3 4 câu em ghi nhận, 1 lần là dc" — thay "bỏ hẳn" của SRS-131):
        # câu ghi nhận được nói MỘT lần trong cuộc chat; lượt trước đã có một câu như vậy thì lượt này gọi lại.
        if _co_cau_ghi_nhan(reply) and any(_co_cau_ghi_nhan(t.content) for t in conv.history if t.role == "assistant" and t.content):
            ly_do.append("Lời vừa viết có câu ghi nhận (\"Em ghi nhận / Em đã ghi… / Em lưu…\") mà em ĐÃ nói một câu kiểu này ở lượt trước — "
                         "chỉ được một lần trong cuộc chat: lượt này đáp thẳng vào điều khách vừa nói (một lợi ích cụ thể, hoặc vào thẳng việc; "
                         "bản tin cập nhật thì mở thẳng bằng 📋).")
        if conv.role != "buyer" and _bot_hua_gui_anh(reply):
            ly_do.append("Lời vừa viết nói \"em gửi ảnh\" cho chủ nhà — ngược vai: ảnh căn là CHỦ NHÀ chụp gửi cho em; muốn xin ảnh thì mời "
                         "chủ nhà chụp gửi.")
        # SRS-5.1zzzzzzz213 (khách ảo 26/10, giám khảo chấm "không lặp" 1,4/5): lặp mở đầu / lặp nguyên câu của lượt trước — lưới cũ SRS-118
        # bị gỡ ở SRS-207; nay đặt lại, kiểm HÌNH THỨC lời của chính bot, không đọc ý.
        truoc = next((t.content for t in reversed(conv.history) if t.role == "assistant" and t.content), "")
        # SRS-5.1zzzzzzz277 (chat mua 28/10: "Em nêu rõ … nên anh dễ lọc" mở 5 lượt, xen giữa là lượt gợi căn — so một lượt trước thì lọt):
        # so với BA lời bot gần nhất (bỏ lời có bản tin 📋).
        gan = [t.content for t in reversed(conv.history) if t.role == "assistant" and t.content and "📋" not in t.content][:3]
        if "📋" not in reply:
            if any(_cung_mo_dau(reply, t) for t in gan):
                ly_do.append("Mấy lượt gần đây em đã mở đầu bằng cùng mấy chữ này — lượt này đổi cách mở (vào thẳng ý, hoặc đáp điều khách vừa "
                             "nói), không lặp lời khen / xin lỗi / trấn an đã nói.")
            lap = _cau_lap_luot_truoc(reply, "\n".join(gan))
            if lap:
                ly_do.append(f"Câu \"{lap[:60]}\" lặp gần nguyên văn lời em ở lượt trước — khách đã đọc rồi: bỏ câu đó, hoặc nói ngắn hơn bằng "
                             "chữ khác; mỗi ý (chưa có căn, cứ nhắn lại, em sẽ báo) chỉ nói MỘT lần trong cuộc chat.")
        else:
            # SRS-5.1zzzzzzz219 (chat anh Luận 27/10: câu chốt "Anh xem bản tin này ưng chưa… cứ nhắn em nhé!" lặp 6 lượt liền): phần CHAT
            # quanh bản tin (câu dẫn trước 📋 + câu hỏi chốt sau bản tin) cũng không được lặp lời lượt trước; thân bản tin không soi ở đây.
            chat_nay, chat_truoc = _phan_chat_quanh_ban_tin(reply), _phan_chat_quanh_ban_tin(truoc)
            if chat_nay and chat_truoc:
                if _cung_mo_dau(chat_nay, chat_truoc):
                    ly_do.append("Câu dẫn trước bản tin mở bằng cùng mấy chữ với lượt trước — lượt này MỘT câu ngắn đáp đúng điều khách vừa nói "
                                 "(theo khối GIỌNG), không mở bằng câu báo cáo.")
                lap = _cau_lap_luot_truoc(chat_nay, chat_truoc)
                if lap:
                    ly_do.append(f"Câu \"{lap[:60]}\" quanh bản tin lặp gần nguyên văn lượt trước — câu dẫn và câu hỏi chốt mỗi lượt một cách "
                                 "nói khác (hỏi đã ưng chưa / còn chỗ nào chỉnh / đăng luôn nhé), ngắn thôi.")
        if "📋" not in reply and _goi_a(reply) and _goi_a(_phan_chat_quanh_ban_tin(truoc) if "📋" in truoc else truoc):
            # SRS-5.1zzzzzzz220 (chat 27/10: "…thuận tiện cho việc đi lại ạ. Chị cho em…", "…dễ xoay xe, chị ạ!", "…thuận lợi cho chị ạ!" — bốn
            # lượt liền, khách: "sao lại chị ạ liên tục"): kiểm HÌNH THỨC lời của chính bot, không đọc ý khách.
            ly_do.append("Lượt trước em đã gọi khách kèm \"ạ\" / \"ơi\" (\"chị ạ\", \"anh ơi\") — lượt này đừng lặp: bỏ hẳn tiếng gọi, nói tự "
                         "nhiên như nhắn Zalo cho người quen, và đổi khuôn câu (đừng \"… quá anh ơi!\" lượt nào cũng vậy).")
        moi = self._phuong_moi_cua_cu(conv)
        if moi and ("📋" in reply or _is_formatted_post(reply)) and ten_tran(moi) not in bo_dau(reply):
            ly_do.append(f"Bản tin vừa viết ghi phường theo tên CŨ — từ 01/07/2025 phường đó nay là {moi}: ghi \"{moi}\" trong tiêu đề / mô tả "
                         f"(được kèm tên cũ trong ngoặc), người mua tìm theo tên phường mới.")
        if _tieu_de_can_ho_co_mt(reply, conv.prop):
            ly_do.append("Tiêu đề căn hộ có chữ \"MT\" — người mua đọc là mặt tiền; căn hộ không có mặt tiền, viết đủ tên dự án, không "
                         "viết tắt \"MT\".")
        if _tieu_de_sai_don_vi(reply):
            ly_do.append("Tiêu đề ghi kích thước kèm m² (vd \"5x20m²\") — sai: viết diện tích bằng m² (vd \"100m²\") hoặc kích thước "
                         "không kèm m² (vd \"5x20m\").")
        # Bản tin rao có ý chung ("đắc địa", "sầm uất") — chủ dự án: "kệ"; chỉ soát lời CHAT. Lúc này dấu 📋 có thể chưa được chèn (code thêm
        # sau), nên nhận bản tin theo bố cục (gạch đầu dòng / ---) hoặc dòng mở "sẽ rao như vầy".
        la_ban_tin = "📋" in reply or _is_formatted_post(reply) or _MO_DAU_RE.search(reply) is not None
        bl = None if la_ban_tin else _binh_luan_gia(reply)
        if bl:
            ly_do.append(f"Lời vừa viết nhận xét giá / thị trường (\"{bl}\") — em không có dữ liệu thị trường, CẤM bình luận giá hợp lý / "
                         "đắt khách / dễ bán. Nhắc lại con số khách đưa thì được, không đánh giá; khen điểm khác của căn.")
        so_la = _so_khong_co_trong_can(reply, can_mua, conv, system) if (can_mua or du_an_mua.TIEU_DE in system) else []
        if so_la:
            ly_do.append("Lời vừa viết có con số không có trong dữ liệu căn (" + ", ".join(f"\"{x}\"" for x in so_la) + ") — diện tích, giá, "
                         "giá mỗi m², số phòng, số tầng CHỈ được lấy đúng số ở dòng của căn (hoặc số khách đã nói), không ước lượng, không "
                         "làm tròn khác, không cộng gộp.")
        # SRS-5.1zzzzzzz232 (ban-thu-ai 28/10: "ok em" sau khi lịch hẹn đã ghi → hai câu 26 từ nhắc lại xác nhận lịch dù khối lịch dặn MỘT câu
        # rất ngắn): lượt AI đã đọc khách chỉ đáp ngắn đồng ý (`tha_tim` = dong_y, có cụm trích), lịch hẹn đã ghi, không việc mua nào khác.
        if (conv.role == "buyer" and conv.y_luot.get("lich_cho") and conv.y_luot.get("tha_tim") == "dong_y" and not conv.y_luot.get("mua")
                and _dap_ok_qua_dai(reply)):
            ly_do.append("Khách chỉ đáp ngắn đồng ý và lịch hẹn ĐÃ ghi — đáp đúng MỘT câu rất ngắn (tối đa khoảng 12 từ"
                         "), KHÔNG nhắc lại lịch / căn / người phụ trách, KHÔNG hỏi thêm.")
        # SRS-5.1zzzzzzz218: bản tin rao phía bán — số kèm đơn vị phải là số chủ nhà đã nói ("41,6m²" là 5,2 × 8 model tự nhân).
        so_tin = _so_khong_co_trong_tin(reply, conv) if (la_ban_tin and conv.role != "buyer") else []
        if so_tin:
            ly_do.append("Bản tin vừa viết có con số chủ nhà KHÔNG hề nói (" + ", ".join(f"\"{x}\"" for x in so_tin) + ") — mọi số trong tin "
                         "chỉ lấy đúng số ở DỮ LIỆU BĐS / lời chủ nhà; KHÔNG tự nhân ngang × dài ra diện tích, không ước lượng, không làm tròn khác.")
        # SRS-5.1zzzzzzz218: khách vừa dặn cách viết (lượt lập thao tác đọc, có cụm trích) → lượt này phải có bản tin cập nhật và bản đó
        # phải KHÁC bản trước (chat anh Luận 26/10: "em sẽ đưa lên nổi bật trong tin" rồi không gửi bản nào; tiêu đề giữ y nguyên).
        yc = conv.y_luot.get("yeu_cau_viet") if conv.listing_proposed and conv.role != "buyer" else None
        if yc:
            dan = " / ".join(f"\"{x}\"" for x in yc)
            if "📋" not in reply:
                ly_do.append(f"Khách vừa dặn cách viết bản tin ({dan}) mà lượt này KHÔNG gửi bản tin cập nhật — phải RAO LẠI ngay bản tin "
                             "(mở \"📋 Bản tin cập nhật:\") thể hiện đúng ý dặn, không chỉ hứa sẽ sửa, không hỏi lại điều khách vừa nói rõ.")
            elif _do_giong_ban_tin(reply.split("📋", 1)[1], _ban_tin_truoc(conv)) >= BAN_TIN_GIONG_TOI_DA:
                ly_do.append(f"Khách vừa dặn cách viết bản tin ({dan}) mà bản tin cập nhật gần như Y NGUYÊN bản trước — sửa ĐÚNG chỗ khách "
                             "dặn cho thấy rõ khác biệt (tiêu đề / mô tả / gạch đầu dòng), chỗ khách không nhắc giữ nguyên.")
        if ly_do:
            # Đầu mỗi lý do (không lời khách) để truy lưới nào kích — bắn thử 368 chỉ thấy "1 lý do", không biết lý do gì.
            log.warning("Lời bot lệch luật hình thức (%d lý do: %s) — gọi lại model", len(ly_do), " | ".join(x[:40] for x in ly_do))
            with _do(conv, "tra_loi_lai"):
                lai = self._provider.reply(
                    system + "\n\n=== VIẾT LẠI LƯỢT NÀY ===\n" + " ".join(ly_do) + " Viết lại TOÀN BỘ lượt trả lời.\n",
                    conv.messages(), max_tokens=REPLY_MAX_TOKENS).strip()
            if lai:
                reply = _gan_dau_ban_tin(_bo_markdown(lai))
                # SRS-5.1zzzzzzz228 (ban-thu-srd 27/10: bản gọi lại vẫn mở bằng Dạ, "… em hiểu rồi anh…"): luật CỨNG (Dạ, gọi khách "mình",
                # phí sai vai) soát lại bản gọi lại; còn lệch thì gọi thêm MỘT lần. Luật mềm (lặp, khen) không gọi lần hai — tốn tiền mỗi lượt.
                con = self._ly_do_cung(conv, reply)
                if con:
                    log.warning("Bản gọi lại vẫn lệch luật cứng (%s) — gọi lại lần hai", " | ".join(x[:40] for x in con))
                    with _do(conv, "tra_loi_lai"):
                        lai2 = self._provider.reply(
                            system + "\n\n=== VIẾT LẠI LƯỢT NÀY ===\n" + " ".join(con) + " Viết lại TOÀN BỘ lượt trả lời.\n",
                            conv.messages(), max_tokens=REPLY_MAX_TOKENS).strip()
                    if lai2:
                        reply = _gan_dau_ban_tin(_bo_markdown(lai2))
                    if _mo_dau_da(reply):   # hai lần viết lại vẫn mở "Dạ" — code bỏ chữ đó khi bỏ không đổi nghĩa (SRS-5.1zzzzzzz230)
                        bo = _bo_da_dau(reply)
                        if bo != reply:
                            log.warning("Bỏ chữ Dạ mở đầu sau hai lần viết lại")
                            reply = bo
        return reply

    @staticmethod
    def _ly_do_cung(conv: Conversation, reply: str) -> list[str]:
        """Luật hình thức CỨNG của lời bot (quyết định chủ dự án, không có ngoại lệ theo ngữ cảnh) — dùng lại ở lần soát bản gọi lại."""
        ly_do = []
        if _mo_dau_da(reply):
            ly_do.append("Lời vừa viết mở đầu bằng \"Dạ\" — câu đầu phải vào thẳng nội dung, không \"Dạ\".")
        if _viet_hoa_ca_cum(reply):   # SRS-5.1zzzzzzz241
            ly_do.append("Lời vừa viết có cụm chữ viết HOA toàn bộ — viết thường như câu nói (chỉ hoa chữ đầu câu và tên riêng), kể cả tiêu đề tin rao.")
        if _goi_khach_la_minh(reply, _detect_customer_pronoun(conv)):
            ly_do.append("Lời vừa viết gọi khách là \"mình\" — gọi đúng cách khách xưng (anh / chị / cô / chú), chỉ \"nhà mình / căn mình\" "
                         "khi nói về căn của khách.")
        phi_dung = _phi_lech_vai(reply, conv.vai_phi, conv.prop.is_rental) if conv.role != "buyer" else None
        if phi_dung:
            ly_do.append(f"Lời vừa viết báo phí % không đúng vai người rao — mức đúng: \"{phi_dung}\", KHÔNG tự đoán một vai.")
        if _nhieu_cau_hoi(reply):   # SRS-5.1zzzzzzz252
            ly_do.append("Lời vừa viết hỏi khách NHIỀU HƠN MỘT câu — mỗi lượt chỉ hỏi MỘT ý (một dấu \"?\"), hỏi xong thì dừng chờ khách trả lời; "
                         "ý còn lại để lượt sau.")
        return ly_do

    @staticmethod
    def _inventory_tools() -> list[dict]:
        """The tools the agent loop can call — read/query/learn the project inventory, and add
        a resolved căn to the seller's basket. Attribute keys are FREE-FORM (works for houses
        and condos alike). The model reasons over these; the engine executes + verifies each."""
        return [
            {"name": "tra_can",
             "description": "Tra những gì ĐÃ BIẾT về MỘT căn theo mã số căn (mẫu nhà, giá, diện "
                            "tích, vị trí...). Trả 'chưa có' nếu dự án không có mã căn đó.",
             "input_schema": {"type": "object",
                              "properties": {"ma_so_can": {"type": "string"}},
                              "required": ["ma_so_can"]}},
            {"name": "tim_can",
             "description": "Tìm (các) căn theo tiêu chí. `where` = lọc theo thuộc tính bất kỳ "
                            "(vd {\"mau_nha\":\"Cosmo Gen 2\"} hoặc {\"loai_can\":\"2PN\",\"view\":\"hồ\"}). "
                            "`lon_nhat`/`nho_nhat` = tên thuộc tính SỐ để lấy căn lớn/nhỏ nhất "
                            "(vd dien_tich_dat, dien_tich, tang, gia). Trả rỗng nếu chưa đủ dữ liệu "
                            "— KHÔNG đoán.",
             "input_schema": {"type": "object", "properties": {
                 "where": {"type": "object", "additionalProperties": {"type": "string"}},
                 "lon_nhat": {"type": "string"}, "nho_nhat": {"type": "string"}}, "required": []}},
            {"name": "tra_mau_nha",
             "description": "Tra thông số CHUNG của một MẪU NHÀ / loại căn (vd 'Cosmo Gen 2', "
                            "'Office 1'): số tầng, số phòng ngủ, mặt tiền, bố trí... — áp dụng cho "
                            "MỌI căn cùng mẫu. Đây là KIẾN THỨC CHUNG đã lưu (KHÔNG phải tra "
                            "internet). Trả 'chưa có' nếu dự án chưa có mẫu đó.",
             "input_schema": {"type": "object",
                              "properties": {"ten_mau": {"type": "string"}},
                              "required": ["ten_mau"]}},
            {"name": "du_lieu_du_an",
             "description": "Xem em ĐÃ BIẾT gì / CHƯA BIẾT gì về rổ hàng dự án (số căn đã có, "
                            "tổng số căn khách khai, thuộc tính nào đã có). Dùng để biết cần hỏi "
                            "khách bổ sung gì.",
             "input_schema": {"type": "object", "properties": {}, "required": []}},
            {"name": "ghi_nho_can",
             "description": "GHI NHỚ dữ kiện CÔNG CỘNG về một căn (vd căn 26 là lô góc, diện tích "
                            "92m2 — KHÔNG phải giá). Lưu vào KIẾN THỨC CHUNG của dự án, dùng lại cho "
                            "seller sau. `nguon` = nguồn ('khách', 'tài liệu', hoặc link web).",
             "input_schema": {"type": "object", "properties": {
                 "ma_so_can": {"type": "string"},
                 "thuoc_tinh": {"type": "object", "additionalProperties": {"type": "string"}},
                 "nguon": {"type": "string"}},
                 "required": ["ma_so_can", "thuoc_tinh"]}},
            {"name": "ghi_nho_du_an",
             "description": "GHI NHỚ dữ kiện CÔNG CỘNG cấp DỰ ÁN (vd 'dự án có 50 lô', quy hoạch, "
                            "tiện ích) vào kiến thức chung. Dùng cho thông tin công cộng, có NGUỒN "
                            "(khách khai / tài liệu / web). `tong_so_can` nếu biết tổng số căn.",
             "input_schema": {"type": "object", "properties": {
                 "thuoc_tinh": {"type": "object", "additionalProperties": {"type": "string"}},
                 "nguon": {"type": "string"}},
                 "required": ["thuoc_tinh"]}},
            {"name": "them_can_vao_ro",
             "description": "Thêm một căn (đã xác định RÕ mã số căn) vào RỔ HÀNG của khách đang "
                            "chat — tự lấy mẫu nhà/giá/diện tích từ bộ nhớ dự án. Chỉ gọi khi đã "
                            "chắc chắn hoặc khách đã xác nhận đúng căn.",
             "input_schema": {"type": "object",
                              "properties": {"ma_so_can": {"type": "string"}},
                              "required": ["ma_so_can"]}},
        ]

    @staticmethod
    def _goi_toi(conv: Conversation) -> tuple[str, str]:
        """(cách gọi khách, bot tự xưng) cho câu mẫu code gửi thẳng — cùng nguồn `xung_ho.goi_toi` với lượt model (SRS-5.1zzzzzzz250)."""
        return goi_toi_khach(_detect_customer_pronoun(conv), conv.assistant.name)

    def _ket_qua_phieu(self, conv: Conversation, nguon: str) -> str:
        """Lời công cụ ghi nhớ trả model: admin → đã vào kho chung; người khác → mới là một phiếu, chưa nói như sự thật (SRS-249)."""
        if self._ma_phieu(conv.user_key).startswith("chac_chan:"):
            return f"Đã lưu thẳng vào kiến thức chung dự án (admin, nguồn: {nguon})."
        return (f"Đã ghi nhận một phiếu (nguồn: {nguon}) — chờ đủ người xác nhận mới vào kiến thức chung; đừng nói với khách là "
                "đã cập nhật dữ liệu dự án.")

    def _exec_tool(self, conv: Conversation, project: Project, call) -> str:
        """Run ONE tool the model asked for, against the REAL store/basket, and return a short
        result string. The engine is the source of truth — tools return only true data (never
        a guess), so the model's reply can't fabricate."""
        name, inp = call.name, (call.input or {})
        if name == "tra_can":
            r = inv.lookup(project, str(inp.get("ma_so_can", "")))
            if not r:
                return "Dự án chưa có mã căn này."
            # Enrich with the MẪU NHÀ's shared specs (số tầng, số phòng...) so a căn lookup already
            # carries its model's details — the model can describe the căn without a second call.
            ut = project.find_unit_type(r.get("mau_nha") or r.get("unit_type"))
            if ut is not None and ut.specs:
                r = {**r, "mau_nha_chi_tiet": ut.specs}
            return json.dumps(r, ensure_ascii=False)
        if name == "tra_mau_nha":
            ut = project.find_unit_type(str(inp.get("ten_mau", "")))
            if ut is None or not ut.specs:
                return "Dự án chưa có thông số cho mẫu nhà này."
            return json.dumps({"mau_nha": ut.name, **ut.specs}, ensure_ascii=False)
        if name == "tim_can":
            where = inp.get("where") if isinstance(inp.get("where"), dict) else None
            units = inv.find(project, where=where or None,
                             largest=inp.get("lon_nhat") or None, smallest=inp.get("nho_nhat") or None)
            if not units:
                return "Không có căn nào khớp / chưa đủ dữ liệu cho tiêu chí này."
            return "; ".join(json.dumps(u.known(), ensure_ascii=False) for u in units[:12])
        if name == "du_lieu_du_an":
            return json.dumps(inv.coverage(project), ensure_ascii=False)
        if name == "ghi_nho_can":
            attrs = inp.get("thuoc_tinh") if isinstance(inp.get("thuoc_tinh"), dict) else {}
            nguon = str(inp.get("nguon") or "").strip() or conv.user_key   # chữ ghi nguồn; phiếu theo người nói (SRS-249)
            inv.remember(project, str(inp.get("ma_so_can", "")),
                         {k: str(v) for k, v in attrs.items()}, voter=self._ma_phieu(conv.user_key))
            self._projects.save(project)
            return self._ket_qua_phieu(conv, nguon)
        if name == "ghi_nho_du_an":
            attrs = inp.get("thuoc_tinh") if isinstance(inp.get("thuoc_tinh"), dict) else {}
            nguon = str(inp.get("nguon") or "").strip() or conv.user_key
            merge_facts(project.attributes, project.votes,
                        {k: str(v) for k, v in attrs.items() if str(v).strip()}, voter=self._ma_phieu(conv.user_key))
            self._projects.save(project)
            return self._ket_qua_phieu(conv, nguon)
        if name == "them_can_vao_ro":
            code = str(inp.get("ma_so_can", "")).strip()
            if not code:
                return "Thiếu mã số căn."
            u = project.find_unit(code)
            row = {"ma_so_can": code, "du_an": project.name}
            if u is not None:  # pull PUBLIC facts from the shared catalog
                for src, dst in (("mau_nha", "unit_type"), ("dien_tich", "dien_tich"),
                                 ("quy_cach_ban_giao", "quy_cach_ban_giao")):
                    if u.attrs.get(src):
                        row[dst] = u.attrs[src]
            pb = conv.price_book.get(normalize_project_name(code))  # the SELLER's own price, if any
            if pb:
                for k, v in pb.items():
                    if k.startswith("gia") and v:
                        row[k] = v
            self.import_listings(conv.user_key, [row])
            n = sum(1 for li in conv.listings if li.prop.fields.get("ma_so_can"))
            return f"Đã thêm căn {code} vào rổ. Rổ giờ có {n} căn."
        return "Không rõ công cụ."

    def _agent_reply(self, conv: Conversation, project: Project, base_system: str, now: float) -> str:
        """The DEFAULT reply for a project-inventory seller (Mảnh B): run the SAME sales-mode
        prompt (`base_system` = collect / draft-ad / fee, + basket + memory) but as a tool-using
        AGENT LOOP. The model decides per turn — reply, query the catalog, resolve 'căn góc lớn
        nhất' → a real mã số căn, ask for a link when data is missing, learn a fact, add to the
        basket — with NO keyword gate. A manual loop so the engine executes/verifies every tool."""
        system = base_system + _AGENT_TOOL_GUIDE
        messages: list[dict] = [
            {"role": m.role, "content": m.content} for m in conv.messages()
        ] or [{"role": "user", "content": conv.history[-1].content}]
        tools = self._inventory_tools()
        final = ""
        for _ in range(MAX_AGENT_STEPS):
            turn = self._provider.converse(system, messages, tools, max_tokens=REPLY_MAX_TOKENS)
            if turn.text:
                final = turn.text
            if turn.tool_calls:  # our custom tools → execute + feed results back
                messages.append({"role": "assistant", "content": turn.assistant_content})
                messages.append({"role": "user", "content": [
                    {"type": "tool_result", "tool_use_id": c.id, "content": self._exec_tool(conv, project, c)}
                    for c in turn.tool_calls
                ]})
                continue
            if turn.stop_reason == "pause_turn":  # a server tool (web_search) needs another round-trip
                messages.append({"role": "assistant", "content": turn.assistant_content})
                continue
            break
        goi, toi = self._goi_toi(conv)
        return final or cau_mau.cau("hoi_ro_can", goi, toi=toi)

    @staticmethod
    def _project_map_doc(project: Project | None, voter: str | None = None) -> dict[str, str] | None:
        """The project's stored phân-lô / sơ-đồ / quy-hoạch map doc, if any (most recent) — chỉ tài liệu đã duyệt / của chính người hỏi."""
        if project is None:
            return None
        needles = ("phan lo", "so do", "ban do", "quy hoach")
        for d in reversed(project.docs_cho(voter)):
            hay = normalize_project_name((d.get("title") or "") + " " + (d.get("kind") or ""))
            if any(n in hay for n in needles):
                return d
        return None

    def _media_request_reply(self, conv: Conversation, project: Project | None, text: str) -> str:
        """Answer a 'cho xem bản vẽ/mặt bằng căn X' request WITHOUT touching the basket. Resolve
        the căn → its mẫu nhà, and point to the model's stored brochure/floor-plan if we have it
        (units of a model share it); else be honest and offer to get it."""
        # The seller is asking about the PROJECT'S phân-lô/bản-đồ and we DO hold it as a grounded
        # doc → READ it to answer (they want us to consult the map), and offer the stored file. This
        # fixes AOND wrongly insisting "em CHƯA có bản vẽ" when the phân lô .md is right there.
        if conv.y_luot.get("ban_do_du_an"):   # AI đọc: khách xin bản đồ / phân lô của cả dự án (SRS-5.1zzzzzzz55)
            doc = self._project_map_doc(project, conv.user_key)
            if doc is not None:
                answer = self._answer_from_docs(conv, project, text)
                link = doc.get("web_url")
                if link:
                    answer += f"\n\n📐 File phân lô / bản đồ: {link}"
                return answer
        codes = re.findall(r"\d+[\w\-/]*", text)
        mau = None
        if project is not None:
            for c in codes:
                u = project.find_unit(c)
                if u is not None and u.attrs.get("mau_nha"):
                    mau = u.attrs["mau_nha"]
                    break
            if mau is None:  # maybe they named the model directly ("bản vẽ mẫu Cosmo")
                for ut in project.unit_types:
                    if normalize_project_name(ut.name) in normalize_project_name(text):
                        mau = ut.name
                        break
        ut = project.find_unit_type(mau) if (project is not None and mau) else None
        who = (f"căn {codes[0]}" if codes else "căn mình")
        if mau:
            who += f" (mẫu {mau})"
        if ut is not None and ut.media:
            # SRS-5.1zzzzzzz249: ảnh bản vẽ có link công khai → bridge GỬI ẢNH (TurnResult.ban_ve); PDF thì dán link. Tệp cũ ở kho riêng
            # (không link) thì nói thật là chưa gửi được, không hứa "để em gửi lại" khi không có đường gửi.
            anh = [m["web_url"] for m in ut.media if m.get("web_url") and str(m.get("content_type", "")).startswith("image/")][:3]
            pdf = next((m["web_url"] for m in ut.media if m.get("web_url") and m.get("content_type") == "application/pdf"), "")
            goi, toi = self._goi_toi(conv)
            if anh:
                conv.y_luot["ban_ve"] = anh
                return cau_mau.cau("ban_ve_gui_kem", goi, toi=toi, mau_nha=ut.name) + (f"\nPDF: {pdf}" if pdf else "")
            if pdf:
                return cau_mau.cau("ban_ve_pdf", goi, toi=toi, mau_nha=ut.name, link=pdf)
        return self._cau_khach(conv, "chua_co_ban_ve", can=who)

    def _answer_from_docs(self, conv: Conversation, project: Project, text: str) -> str:
        """Answer a factual question STRICTLY from the project's stored source docs — a focused
        call (docs + the question only) so the model reads the document instead of following the
        collection script or recalling/fabricating. The seller's OWN price book (private, from any
        price list they sent) is injected too, so a price question is answered from it instead of
        the price-free shared catalog — otherwise AOND wrongly says 'em chưa có giá'."""
        structured = self._structured_shared_block(project)  # mẫu nhà specs + project facts
        system = (
            f'Bạn là "{conv.assistant.name}", trợ lý BĐS của AI Ơi Nhà Đất. '
            + build_project_docs_block(project.name, project.docs_cho(conv.user_key))
            + (f"\n\n=== KIẾN THỨC CHUNG DỰ ÁN (em ĐÃ CÓ SẴN) ===\n{structured}\n" if structured else "")
            + self._seller_price_block(conv)
            + "\nTrả lời câu hỏi của khách NGẮN GỌN, ĐÚNG theo tài liệu / mẫu nhà / bảng giá trên. Khi "
            "khách hỏi chi tiết MẪU NHÀ (số tầng, số phòng, bố trí), TRẢ LỜI NGAY từ mục MẪU NHÀ — đó "
            "là kiến thức chung em ĐÃ CÓ, KHÔNG nói 'em không tra cứu được'. Thân thiện. TUYỆT ĐỐI không bịa; "
            "nếu KHÔNG có trong tài liệu lẫn bảng giá thì mới nói \"em chưa có thông tin về ý này ạ\" rồi mời khách bổ sung."
            + khoi_xung_ho(_detect_customer_pronoun(conv), conv.assistant.name, _xung_ho_doan(conv))
        )
        return self._provider.reply(system, [Message("user", text)], max_tokens=REPLY_MAX_TOKENS).strip()

    def handle_link(self, user_key: str, url: str, now: float | None = None,
                    caption: str | None = None) -> TurnResult:
        """Seller pasted ONE link — auto-detect what it is (no command needed): a Google
        Sheets / CSV / Excel → import listings; a photo/PDF → read it; a folder → the media
        path. `caption` = any words the seller sent WITH the link (e.g. "tôi bán 2 căn Cosmo
        Gen 2 trong này") — used to scope a price-list import. Entry point for a pasted link."""
        now = now if now is not None else time.time()
        text: str | None = None
        data: bytes | None = None
        media_type: str | None = None
        # Link Google Drive (file HAY thư mục) là TỆP khách gửi (ảnh / PDF), không phải trang web — phải đi đường media để
        # bộ giải link đổi ra link tải thật. Tải thô link Drive chỉ nhận trang đăng nhập Drive, bị đọc nhầm thành "trang web
        # dự án" ("đang rao dự án nào?"). Sheets là ngoại lệ (đã tách ở trên). Theo bản anh Luận 4ebeb18 (SRS-5.1zzzzzzz50).
        is_drive = extract_drive_id(url) is not None
        if bulk.sheets_export_url(url) is not None:  # Google Sheets
            try:
                text = self._spreadsheet_text(url)
            except FetchError:
                text = None
        elif not is_drive:
            try:
                data, media_type = fetch_raw(url)
            except FetchError:
                data = None
            if data is not None:
                kind = bulk.sniff_kind(data, media_type, url)
                if kind == "xlsx":
                    text = bulk.xlsx_to_csv(data)
                elif kind == "csv":
                    text = data.decode("utf-8-sig", "replace")

        if text is not None:  # it's a spreadsheet → bulk import
            conv = self.conversation(user_key)
            n = self.import_csv(user_key, text)
            reply = self._cau_khach(conv, "nhap_bang_tinh", n=n) if n else self._cau_khach(conv, "bang_tinh_trong")
            conv.history.append(Turn("user", f"[Khách gửi bảng tính qua link: {url}]", now))
            conv.history.append(Turn("assistant", reply, now))
            conv.last_ai_at = now
            return self._build_result(conv, reply, captured=[], now=now)

        # A WEB PAGE (project website / info page) → read + summarize to a grounded .md in the
        # project's SHARED knowledge (source = the link), so it's re-readable fast later.
        if data is not None and self._looks_like_html(data, media_type):
            return self._ingest_web_link(user_key, url, data, now)

        # Not a spreadsheet / web page → photo/PDF/folder: the vision-read path.
        return self.handle_media_batch(user_key, [url], now, caption)

    def handle_media(self, user_key: str, url: str, now: float | None = None,
                     caption: str | None = None) -> TurnResult:
        """Seller sent a link to a photo or PDF — read it and confirm. See handle_media_batch."""
        return self.handle_media_batch(user_key, [url], now, caption)

    @staticmethod
    def _looks_like_html(data: bytes, media_type: str | None) -> bool:
        if (media_type or "").lower().startswith(("text/html", "application/xhtml")):
            return True
        head = data[:512].lstrip().lower()
        return (head.startswith((b"<!doctype html", b"<html"))
                or b"<head" in head or b"<body" in head)

    @staticmethod
    def _html_to_text(data: bytes) -> str:
        """Crude HTML → visible text (drop scripts/styles/tags, unescape entities). Good enough
        for the model to summarize — no parser dependency."""
        s = data.decode("utf-8", "replace")
        s = re.sub(r"(?is)<(script|style|noscript|template)[^>]*>.*?</\1>", " ", s)
        s = re.sub(r"(?s)<!--.*?-->", " ", s)
        s = re.sub(r"(?s)<[^>]+>", " ", s)
        return re.sub(r"\s+", " ", _html.unescape(s)).strip()

    def _ingest_web_link(self, user_key: str, url: str, data: bytes, now: float) -> TurnResult:
        """Seller gave a LINK to a project web page → read it, summarize FAITHFULLY to a grounded
        .md, and (if we know the project) store it in the SHARED project knowledge tagged with the
        source URL — so this seller and the next can ask about it. Public info, sourced — no
        fabrication. This completes the "ask for a trusted link" loop."""
        conv = self.conversation(user_key)
        du_an = conv.prop.fields.get("du_an")
        host = urlparse(url).netloc or "trang web"
        page = self._html_to_text(data)[:20000]
        conv.history.append(Turn("user", f"[Khách gửi link trang web: {url}]", now))
        if not page:
            reply = self._cau_khach(conv, "link_web_trong")
        else:
            system = (
                "Bạn là trợ lý BĐS của AI Ơi Nhà Đất. Đọc NỘI DUNG TRANG WEB dưới đây và tóm tắt "
                "TRUNG THỰC thành Markdown các thông tin CÔNG CỘNG của dự án BĐS có trong trang: "
                "chủ đầu tư, quy hoạch/tổng số căn-lô, vị trí, tiện ích, pháp lý, tiến độ, mẫu nhà... "
                "CHỈ ghi thông tin CÓ THẬT trong trang — TUYỆT ĐỐI không bịa, không thêm giá bán của "
                "người rao. Ngắn gọn, gạch đầu dòng. Nếu trang KHÔNG phải về dự án BĐS thì nói rõ."
            )
            summary = self._provider.chat(system, [Message("user", page)],
                                          max_tokens=REPLY_MAX_TOKENS).strip()
            if du_an:
                markdown = f"# Tham khảo web — {du_an}\n\n*(Nguồn: {url})*\n\n{summary}"
                self._save_project_doc(du_an, kind="tham khảo web",
                                       title=f"tham khảo web — {host}", markdown=markdown, nguoi_gui=user_key)
                goi, toi = self._goi_toi(conv)
                reply = cau_mau.cau("web_da_luu", goi, toi=toi, host=host, tom_tat=summary, url=url)
            else:
                goi, toi = self._goi_toi(conv)
                reply = cau_mau.cau("web_hoi_du_an", goi, toi=toi, host=host, tom_tat=summary)
        conv.history.append(Turn("assistant", reply, now))
        conv.last_ai_at = now
        return self._build_result(conv, reply, captured=[], now=now)

    def _escalate_oversize(self, conv: Conversation, urls: list[str], now: float) -> TurnResult:
        """The send exceeded MAX_SEND_BYTES — don't process it, hand it to a human admin. We
        record the escalation (a Live-Chat-Monitor picks it up) and tell the seller not to
        worry: an admin will open this chat and handle their file/link."""
        conv.admin_escalations.append(
            {"reason": "media_over_size", "limit_bytes": MAX_SEND_BYTES,
             "urls": list(urls), "at": now})
        log.warning("Oversize media send (>%d bytes) escalated to admin for %s: %s",
                    MAX_SEND_BYTES, conv.user_key, urls)
        reply = self._cau_khach(conv, "file_qua_lon")
        conv.history.append(Turn("user", f"[Khách gửi file/link >20MB: {', '.join(urls)}]", now))
        conv.history.append(Turn("assistant", reply, now))
        conv.last_ai_at = now
        # SRS-5.1zzzzzzz216 (chủ dự án 27/10: "5 làm đi"): câu mẫu `file_qua_lon` nói "Em đã báo admin rồi" nhưng `admin_escalations`
        # chỉ nằm trong bộ nhớ, không ai đọc. Nay đi cùng đường "khách cần người thật" (server → `bao_can_nguoi` → tin 🙋 cho admin qua
        # escalation-feed) — một chủ cho mọi tin "nhờ admin vào chat".
        conv.y_luot = {"can_nguoi_that": f"gửi file quá {MAX_SEND_BYTES // (1024 * 1024)} MB, nhờ admin vào chat đọc giúp: "
                                         + ", ".join(urls)[:160]}
        return replace(self._build_result(conv, reply, captured=[], now=now), escalated=True)

    def handle_media_batch(
        self, user_key: str, urls: list[str], now: float | None = None,
        caption: str | None = None,
    ) -> TurnResult:
        """Seller sent one or more photo/PDF links: fetch (whole send capped at MAX_SEND_BYTES),
        have the vision model read them in one call, capture any data, and reply by stating what
        we saw and asking to confirm. `caption` = words sent WITH the files (scopes a price
        list — e.g. only the 2 căn the seller rao, not the whole project inventory)."""
        now = now if now is not None else time.time()
        conv = self.conversation(user_key)

        # Expand each link first: a Drive folder becomes its many child files (with the
        # API's clean names); a plain file or non-Drive link stays as one source.
        sources: list[tuple[str, str | None]] = []
        for url in urls:
            try:
                sources.extend(self._resolve(url))
            except Exception:
                sources.append((url, None))

        fetched: list[FetchedMedia] = []
        total = 0
        for src_url, name in sources:
            try:
                media = self._fetcher(src_url)
            except FetchError:
                continue
            if name:  # prefer the resolver's clean name over the download header's
                media = replace(media, filename=name)
            total += len(media.data)
            # The WHOLE send (all files/links/folders together) is capped at MAX_SEND_BYTES.
            # Over it, we don't process anything — we hand the chat to a human admin.
            if total > MAX_SEND_BYTES:
                return self._escalate_oversize(conv, urls, now)
            fetched.append(media)

        if not fetched:
            # Folder links get a specific nudge; everything else gets the friendly fallback.
            if any(is_drive_folder(u) for u in urls):
                reply = self._cau_khach(conv, "link_thu_muc_drive")
            else:
                reply = self._cau_khach(conv, "link_khong_mo_duoc")
            conv.history.append(Turn("user", f"[Khách gửi link không đọc được: {', '.join(urls)}]", now))
            conv.history.append(Turn("assistant", reply, now))
            conv.last_ai_at = now
            return self._build_result(conv, reply, captured=[], now=now)

        # Show real filenames individually; collapse unnamed files into "N ảnh / N tài liệu"
        # (Drive often stores mojibake names we drop) so the list stays readable.
        named = [m.filename for m in fetched if _ten_tep_that(m.filename)]
        n_img = sum(1 for m in fetched if not _ten_tep_that(m.filename) and m.kind == "image")
        n_pdf = sum(1 for m in fetched if not _ten_tep_that(m.filename) and m.kind == "pdf")
        parts = list(named)
        if n_img:
            parts.append(f"{n_img} ảnh")
        if n_pdf:
            parts.append(f"{n_pdf} tài liệu")
        names = ", ".join(parts)

        # A PRICE LIST / rổ hàng (many căn × giá) usually comes as a PDF, or a SINGLE image
        # screenshot of a table — try importing it as structured inventory first; if it isn't
        # one, fall through to the normal read. (A single house photo costs one extra cheap
        # extract_media call that returns la_bang_gia=false; a multi-photo batch is skipped so
        # normal photo sends aren't taxed.)
        try_inventory = any(m.kind == "pdf" for m in fetched) or (
            len(fetched) == 1 and fetched[0].kind == "image"
        )
        if try_inventory:
            result = self.import_price_list(user_key, fetched, caption=caption)
            if result is not None:
                n_new, n_imported, du_an, n_in_list, uncertain = result
                where = f" — dự án {du_an}" if du_an else ""
                # GỬI FILE ≠ RAO: nothing entered the rổ (no explicit rao intent) → keep the price
                # list as reference and ASK which căn they want to rao. Don't auto-list.
                if n_imported == 0:
                    cap_line = f"“{caption.strip()}” — " if caption and caption.strip() else ""
                    reply = f"📊 {cap_line}" + _xung_ho_cau(
                        f"Em đọc được bảng giá ({names}) rồi ạ — **{n_in_list} căn**{where}, em đã LƯU LẠI GIÁ của từng căn. Em chưa "
                        "cho căn nào vào rổ rao vì anh/chị chưa nói rao căn nào — anh/chị muốn RAO căn nào ạ (hoặc hỏi em giá căn nào "
                        "cũng được)? 😊", *self._goi_toi(conv))
                    reply = self._hoi_trung_ten(conv, reply)
                    conv.history.append(Turn("user",
                        f"[Khách gửi bảng giá tham chiếu: {names}]" if not caption else
                        f"[Khách nhắn: “{caption.strip()}” kèm bảng giá: {names}]", now))
                    conv.history.append(Turn("assistant", reply, now))
                    conv.last_ai_at = now
                    return self._build_result(conv, reply, captured=[], now=now)
                # If the seller scoped it ("chỉ 2 căn Cosmo Gen 2"), say we took only those.
                scope = (f" (bảng có {n_in_list} căn, em chỉ lấy đúng {n_imported} căn anh/chị rao)"
                         if n_imported < n_in_list else "")
                if n_new == n_imported:
                    body = f"đã nhập **{n_imported} căn** vào rổ hàng{where}{scope} ạ! Mỗi căn em ghi theo mã lô + mẫu nhà + giá."
                elif n_new == 0:
                    body = f"rổ hàng đã có đủ **{n_imported} căn** này rồi{where}{scope} — em CẬP NHẬT lại giá/thông tin, KHÔNG thêm trùng nha."
                else:
                    body = f"em thêm **{n_new} căn mới** và cập nhật {n_imported - n_new} căn đã có{where}{scope} (không trùng lặp)."
                cap_line = f"“{caption.strip()}” — " if caption and caption.strip() else ""
                # Ambiguous scope → import the best guess but ASK to confirm (don't guess silently).
                if uncertain:
                    picked = ", ".join(f"lô {li.prop.fields['ma_so_can']}"
                                       for li in conv.listings if li.prop.fields.get("ma_so_can"))
                    tail = (f"\n⚠️ Em CHƯA chắc ý anh/chị nên tạm lấy: **{picked}**. Đúng những căn "
                            "này không ạ, hay anh/chị muốn căn nào khác? Em chỉnh lại ngay.")
                else:
                    tail = "\nAnh/chị xem giúp em có đúng không — cần sửa căn nào báo em ạ."
                reply = f"📊 {cap_line}" + _xung_ho_cau(f"Em đọc bảng giá ({names}) và {body}{tail}", *self._goi_toi(conv))
                reply = self._hoi_trung_ten(conv, reply)
                seller_said = f"[Khách nhắn: “{caption.strip()}” kèm bảng giá: {names}]" if caption and caption.strip() else f"[Khách gửi bảng giá: {names}]"
                conv.history.append(Turn("user", seller_said, now))
                conv.history.append(Turn("assistant", reply, now))
                conv.last_ai_at = now
                return self._build_result(conv, reply, captured=["ma_so_can", "gia"], now=now)

        if len(fetched) > 1:
            # A batch (folder / several links) may hold MULTIPLE different căn, or ảnh
            # shared by the whole project — figure out which before extracting anything.
            reply, captured = self._group_media_batch(conv, fetched, urls, user_key, now)
        else:
            # Inspect with Vision if this is a Real Estate Deed (Sổ đỏ / Sổ hồng / GCN QSDĐ)
            deed_data = self._provider.extract_media(
                [(m.data, m.media_type) for m in fetched],
                f"{DEED_VISION_INSTRUCTION}\n\nTệp: {names}",
                deed_extraction_schema(),
            )
            # SRS-5.1zzzzzzz255: sticker Zalo tới dưới dạng ảnh (.png) → đi đường CHỮ như sticker thường (sticker chào = "hello"), không đọc
            # như ảnh nhà, không lưu vào tin. AI quyết theo nghĩa (ô `sticker`), code chỉ nối chữ qua `sticker.ra_van_ban`.
            y_sticker = str(deed_data.get("sticker") or "").strip()
            if fetched[0].kind == "image" and y_sticker in STICKER_Y_NGHIA and not deed_data.get("la_giay_to_bds"):
                chu = ra_van_ban_sticker({"y_nghia": y_sticker, "mo_ta": str(deed_data.get("sticker_mo_ta") or y_sticker)})
                log.warning("Ảnh là sticker (%s) — đi đường chữ", y_sticker)
                return self.handle(user_key, f"{caption.strip()}\n{chu}" if caption and caption.strip() else chu, now)
            if deed_data.get("la_giay_to_bds"):
                update_fields: dict[str, str] = {}
                if deed_data.get("loai_hinh") and deed_data["loai_hinh"] != "chua_ro":
                    update_fields["loai_hinh"] = deed_data["loai_hinh"]
                for f_name in (
                    "dia_chi", "dien_tich_dat", "dien_tich_nha", "dien_tich",
                    "tho_cu", "kich_thuoc", "so_thua", "so_to", "phap_ly",
                    "ten_du_an", "ma_can"
                ):
                    val = deed_data.get(f_name)
                    if val and str(val).strip():
                        update_fields[f_name] = str(val).strip()
                if "ten_du_an" in update_fields and not conv.active.prop.fields.get("du_an"):
                    update_fields["du_an"] = update_fields["ten_du_an"]
                if "ma_can" in update_fields and not conv.active.prop.fields.get("ma_so_can"):
                    update_fields["ma_so_can"] = update_fields["ma_can"]

                captured = conv.active.prop.update(update_fields)
                refs, capped = self._upload_media(   # sổ đỏ / giấy tờ: kho RIÊNG, không bao giờ lên web (§5)
                    self._folder_for(conv.active), fetched,
                    image_slots=self._max_photos - _image_count(conv.active.media), rieng=True,
                )
                conv.active.media += refs
                self._sync_media_folder(conv.active)
                if self._convstore is not None:
                    self._convstore.save(conv)

                next_field = self._o_hoi_ke(conv, conv.active.prop.missing_fields())

                details = []
                f_map = conv.active.prop.fields
                if f_map.get("dia_chi"):
                    details.append(f"• Địa chỉ: {f_map['dia_chi']}")
                dt = f_map.get("dien_tich_dat") or f_map.get("dien_tich")
                kt = f_map.get("kich_thuoc")
                kt_str = f" ({kt})" if kt else ""
                if dt:
                    details.append(f"• Diện tích: {dt}{kt_str}")
                if f_map.get("tho_cu"):
                    details.append(f"• Thổ cư công nhận: {f_map['tho_cu']}")
                st, sb = f_map.get("so_thua"), f_map.get("so_to")
                if st and sb:
                    details.append(f"• Số thửa / Tờ bản đồ: Thửa {st}, Tờ {sb}")
                if f_map.get("phap_ly"):
                    details.append(f"• Pháp lý: {f_map['phap_ly']}")

                detail_lines = "\n".join(details)
                seller_turn = f"[Khách gửi ảnh giấy tờ BĐS: {names}]" + (f" kèm tin nhắn: “{caption.strip()}”" if caption and caption.strip() else "")
                # SRS-5.1zzzzzzz82: câu sau danh sách đọc từ sổ do model viết (cùng khung hỏi theo cụm + xưng hô), không viết cứng —
                # bản cũ ghép NATURAL_QUESTIONS (lời dặn cho model) vào lời gửi khách, luôn khen "pháp lý sổ chuẩn chỉnh", gọi "anh".
                cum = conv.active.prop.cum_hoi(next_field, conv.active.prop.missing_fields())
                he = (build_chat_system(conv.assistant.name, conv.active.prop, next_field, conv.vai_phi, "", cum=cum)
                      + khoi_xung_ho(_detect_customer_pronoun(conv, caption or ""), conv.assistant.name, _xung_ho_doan(conv))
                      + "\n\n=== LƯỢT NÀY: KHÁCH VỪA GỬI ẢNH SỔ / GIẤY TỜ ===\nHệ thống đã đọc ảnh và GỬI KHÁCH các dòng sau, ngay "
                        f"trước lời em:\n{detail_lines or '(chưa đọc được dòng nào)'}\nViết 1–2 câu tiếp theo với MỘT câu hỏi cả lượt: có ý ở "
                        "\"Thông tin cần hỏi tiếp theo\" thì hỏi ý đó (khách thấy dòng nào sai sẽ tự nói), không có thì hỏi các dòng trên đã đúng chưa. KHÔNG khen sổ / pháp lý, "
                        "KHÔNG nói sổ \"chuẩn\", \"đầy đủ\" — em mới đọc ảnh, chưa kiểm sổ. Không lặp lại các dòng trên.\n")
                ask_tail = self._provider.reply(he, conv.messages() + [Message("user", seller_turn)],
                                                max_tokens=REPLY_MAX_TOKENS).strip()
                if not ask_tail:
                    raise LoiTraLoi("lời sau ảnh sổ rỗng")

                reply = f"📄 Thông tin đọc từ giấy tờ:\n{detail_lines}\n\n{_bo_markdown(ask_tail)}" + self._cap_note(capped, conv)
                conv.history.append(Turn("user", seller_turn, now))
                conv.history.append(Turn("assistant", reply, now))
                conv.last_ai_at = now
                return self._build_result(conv, reply, captured=captured, now=now)

            active_prop = conv.active.prop if conv.active else None
            missing = active_prop.missing_fields() if active_prop else []
            next_f = missing[0] if missing else None
            instruction = build_media_read_instruction(
                conv.assistant.name,
                pending_question=self._pending_seller_question(conv),
                prop=active_prop,
                next_field=next_f,
            ) + khoi_xung_ho(_detect_customer_pronoun(conv), conv.assistant.name, _xung_ho_doan(conv))   # SRS-5.1zzzzzzz253
            description = self._provider.describe_media(
                [(m.data, m.media_type) for m in fetched], instruction
            ).strip()
            conv.history.append(Turn(
                "user",
                f"[Khách gửi {len(fetched)} tệp ({names}). Nội dung em đọc được từ tài liệu của khách:]\n{description}",
                now,
            ))
            # OPEN-53 (SRS-5.1zzzzzzz241): AI chấm ảnh không phải ảnh thật của căn → không lưu vào tin (không tính điểm, không lên web).
            khong_phai_can = deed_data.get("khong_phai_anh_can") is True and fetched[0].kind == "image"
            if khong_phai_can:
                log.warning("Ảnh không phải ảnh căn: không lưu (%s)", names)
            # Register the project + model, then store the files where they belong: a MẪU NHÀ
            # brochure → the UnitType's shared media (units inherit), else the active căn.
            captured, capped = self._route_readout_media(conv, description, fetched, user_key, store=not khong_phai_can)
            reply = description + self._cap_note(capped, conv)   # SRS-5.1zzzzzzz254: bỏ dòng "📎 Em đã nhận…" (xưng cứng)
            if khong_phai_can:
                reply += _xung_ho_cau("\n\n(Ảnh này em chưa đưa vào tin vì trông không phải ảnh chụp thật của căn — anh/chị gửi giúp em ảnh "
                                      "tự chụp căn nhà nhé, tin có ảnh thật khách xem tin tưởng hơn.)", *self._goi_toi(conv))
            reply = self._hoi_trung_ten(conv, reply)  # read doc named a near-miss project → ASK

        if len(fetched) < len(sources):
            reply += _xung_ho_cau(f"\n\n(Có {len(sources) - len(fetched)} tệp em chưa mở được — anh/chị gửi lại giúp em nhé ạ.)",
                                  *self._goi_toi(conv))
        conv.history.append(Turn("assistant", reply, now))
        conv.last_ai_at = now
        return self._build_result(conv, reply, captured, now)

    def _cau_khach(self, conv: Conversation, khoa: str, **bien) -> str:
        """Câu mẫu gửi THẲNG khách, đổi "anh/chị" + "em" theo cách khách xưng (SRS-5.1zzzzzzz254, chủ dự án 28/10: câu viết cứng "anh/chị",
        "Em" sai khi khách xưng em). Chỉ cho câu mà "anh/chị" là cách gọi KHÁCH (không dùng cho câu nói về "anh/chị phụ trách")."""
        return _xung_ho_cau(cau_mau.cau(khoa, **bien), *self._goi_toi(conv))

    @staticmethod
    def _pending_seller_question(conv: Conversation) -> str:
        """The seller's most recent REAL message (not a bracketed media/system marker) — passed
        into a media read so that a file re-sent right after a question gets ANSWERED from the file
        instead of a generic prompt (the seller who re-sends the phân lô wants the đường-nội-bộ
        number they just asked for). Empty if the last seller turn was itself a file/marker."""
        for t in reversed(conv.history):
            if t.role != "user":
                continue
            c = (t.content or "").strip()
            # SRS-5.1zzzzzzz218 (chat anh Luận 26/10: khách gõ "Icon" rồi gửi ảnh nhà → bot "Em chưa thấy thông tin "Icon" trong ảnh"):
            # một chữ rời không có dấu hỏi không phải câu hỏi để trả lời từ ảnh.
            if "?" not in c and len(c.split()) < 3:
                return ""
            return "" if c.startswith("[") else c
        return ""

    def _folder_for(self, listing: Listing) -> str:
        # Kho Supabase: thư mục ảnh căn = UUID tin (ràng buộc listing_media trên DB), không đổi theo địa chỉ (SRS-5.1zzzzzzz56).
        thu_muc_can = getattr(self._media_store, "thu_muc_can", None)
        if thu_muc_can is not None and la_uuid(listing.listing_id):
            return thu_muc_can(listing.listing_id)
        return listing_folder(self._canonical_du_an(listing.prop.fields.get("du_an")),
                               listing.prop.fields.get("dia_chi"),
                               listing.listing_id, listing.prop.fields.get("ma_so_can"))

    @staticmethod
    def _unittype_folder(project_name: str, ut_name: str) -> str:
        """Shared media folder for a house model: `du-an/<Dự án>/<Mẫu nhà>` — every unit of the model inherits these (brochure /
        floor-plan / renders). Tiền tố `du-an/` = kho tệp để CÔNG KHAI (ảnh, PDF) để bot gửi được cho khách (SRS-5.1zzzzzzz249)."""
        return f"du-an/{project_name}/{ut_name}"

    def _store_unittype_media(self, project_name: str, ut_name: str, items: list[FetchedMedia]) -> list[dict[str, str]]:
        """Upload model brochure/render files to the UnitType's shared folder and attach the
        refs to the UnitType (NOT to any one căn) so every unit of the model shares them."""
        project = self._projects.get(project_name)
        if project is None:
            return []
        ut = project.find_unit_type(ut_name)
        if ut is None:
            return []
        refs, _ = self._upload_media(self._unittype_folder(project.name, ut.name), items)
        ut.media += refs
        self._projects.save(project)
        return refs

    def _ingest_group_docs(
        self, project_name: str | None, items: list[FetchedMedia], kind: str,
        default_title: str | None = None, nguoi_gui: str = "",
    ) -> list[str]:
        """A seller-sent DOCUMENT (PDF brochure / phân lô / gói nội thất) → transcribe ONCE to
        a faithful grounded .md on the project, so the bot can answer factual questions about it
        later (Phase 2 grounding). Only PDFs become docs (photos are stored as media); returns
        the titles ingested (for the receipt). Best-effort — a failed transcription is skipped."""
        if not project_name:
            return []
        titles: list[str] = []
        for m in items:
            if m.kind != "pdf":
                continue
            title = default_title or (m.filename.rsplit(".", 1)[0] if m.filename else kind)
            try:
                self._ingest_doc_bytes(m.data, m.media_type, project_name, kind=kind, title=title, nguoi_gui=nguoi_gui)
                titles.append(title)
            except (FetchError, KhoTepError, ValueError):
                continue
        return titles

    def _la_tai_lieu_chung(self, description: str) -> bool:
        """Bản đọc ảnh là tài liệu CHUNG của dự án (phân lô, sơ đồ, quy cách…) hay ảnh một căn — AI đọc theo nghĩa, thay bộ dò
        từ khoá (SRS-5.1zzzzzzz55). Chỉ gọi khi có ảnh + đã biết dự án. Lỗi → coi là ảnh của căn (giữ ở căn, không mất)."""
        if not (description or "").strip():
            return False
        try:
            r = self._provider.extract(TAI_LIEU_CHUNG_SYSTEM, [Message("user", description[:6000])], tai_lieu_chung_schema())
        except Exception:  # noqa: BLE001
            return False
        return r.get("tai_lieu_chung") is True

    def _route_readout_media(
        self, conv: Conversation, description: str, fetched: list[FetchedMedia],
        user_key: str, store: bool = True,
    ) -> tuple[list[str], int]:
        """After a vision read-out, register the project + model, then store the files where
        they BELONG: a MẪU NHÀ brochure (house model) → the UnitType's shared media (every
        unit of the model inherits them), otherwise the active căn's own folder. `store=False`
        for a pure DATA page (infometric — bảng giá/thông số): the DATA is still extracted, the
        image is abandoned. Returns `(captured, n_capped)`."""
        proj = self.register_project_from_text(description, voter=user_key)
        ut = self.register_unit_type_from_text(description, voter=user_key)
        if ut is not None and proj is not None:
            if store:
                self._store_unittype_media(proj.name, ut.name, fetched)
                # A lone brochure PDF for a model → also transcribe to a grounded .md.
                self._ingest_group_docs(proj.name, fetched, kind="mẫu nhà", default_title=ut.name, nguoi_gui=user_key)
            return [], 0
        # A project DOCUMENT that isn't a model brochure — phân lô, sơ đồ, quy cách bàn giao,
        # phụ lục, tiện ích... — is SHARED project knowledge: transcribe it to a grounded .md so
        # it's re-readable, not read-once-and-forgotten. PDFs always; IMAGES only when they read
        # as a REFERENCE doc (a phân-lô map, not a photo of one căn — that stays on the căn).
        du_an = (proj.name if proj is not None else None) or conv.prop.fields.get("du_an")
        co_anh = any(m.kind == "image" for m in fetched)
        is_ref = bool(store and du_an and co_anh) and self._la_tai_lieu_chung(description)
        to_ingest = [m for m in fetched if m.kind == "pdf" or (is_ref and m.kind == "image")]
        if store and du_an and to_ingest:
            for m in to_ingest:
                title = self._doc_title(m.filename, description)
                try:
                    self._ingest_doc_bytes(m.data, m.media_type, du_an,
                                           kind="tài liệu dự án", title=title, nguoi_gui=user_key)
                except (FetchError, KhoTepError, ValueError):
                    pass
            return [], 0
        if store:
            self._chon_can_nhan_anh(conv)
        captured = self._extract(conv)
        if store:
            refs, capped = self._upload_media(
                self._folder_for(conv.active), fetched,
                image_slots=self._max_photos - _image_count(conv.active.media),
            )
            conv.active.media += refs
            so_anh = _image_count(refs)
            tra = getattr(self._convstore, "tra_loi_xin_anh", None)
            if so_anh and tra is not None:   # SRS-5.1zzzzzzz254: khách mua đang chờ thêm ảnh căn này → báo lại khách
                tra(conv.user_key, conv.active.ma_tin, so_anh)
            return captured, capped
        return captured, 0

    def _chon_can_nhan_anh(self, conv: Conversation) -> None:
        """Chủ nhà nhiều căn gửi ảnh lúc lõi đang nói căn khác (SRS-5.1zzzzzzz258, chủ dự án 28/10: "xét trong cả ngữ cảnh mấy câu đó"): ảnh vào
        căn mà NGỮ CẢNH chỉ tới — (1) tin chủ nhà vừa nhắn (≤ 10 phút) gọi tên căn (mã tin / địa chỉ, `_match_listing`); không có thì (2) căn
        khách mua vừa xin thêm ảnh (tin hệ thống mới nhất vừa nhắn chủ nhà). Không có gì chỉ tới thì giữ căn đang nói như cũ."""
        if len(conv.listings) < 2:
            return
        moc = time.time() - 600
        for t in reversed(conv.history[-6:]):
            if t.role == "user" and t.at >= moc and (li := self._match_listing(conv, t.content or "")) is not None:
                conv.active_listing_id = li.listing_id
                return
        lay = getattr(self._convstore, "can_cho_anh", None)
        ma = lay(conv.user_key) if lay is not None else []
        if not ma or conv.active.ma_tin in ma:
            return
        li = next((x for x in conv.listings if x.ma_tin == ma[0]), None)
        if li is not None:
            log.warning("Ảnh chủ nhà: chuyển sang căn khách mua đang xin ảnh")
            conv.active_listing_id = li.listing_id

    @staticmethod
    def _doc_title(filename: str | None, description: str) -> str:
        """A short doc title — from a 'Phụ lục ...' heading the model read, else the filename."""
        m = re.search(r"(Ph[ụu] l[ụu]c[^\n.:*]{0,60})", description or "")
        if m:
            return re.sub(r"\s+", " ", m.group(1)).strip()
        base = (filename or "tài liệu dự án").rsplit(".", 1)[0]
        return re.sub(r"\s+", " ", base).strip() or "tài liệu dự án"

    def _sync_media_folder(self, listing: Listing) -> None:
        """If a listing already has files stored and its computed folder changed (address or
        project captured/corrected AFTER the upload), rename/move the SharePoint folder to
        match — the stable listing_id keeps the folder identity, only the human label moves.
        Best-effort; the stored item_ids stay valid regardless (a move doesn't change them)."""
        if self._media_store is None or not listing.media:
            return
        # Kho Supabase cất theo `<uuid tin>/` — thư mục không bao giờ đổi, và đường dẫn ref mang tên bucket ở đầu. Không bỏ qua thì
        # move_folder (no-op) xong vẫn ghi đè path mất bucket → `_ghi_anh` bỏ tệp, ảnh / sổ đỏ không vào listing_media (SRS-5.1zzzzzzz63).
        if getattr(self._media_store, "thu_muc_can", None) is not None:
            return
        new_folder = self._folder_for(listing)
        old_folder = listing.media[0]["path"].rsplit("/", 1)[0]
        if old_folder == new_folder:
            return
        try:
            self._media_store.move_folder(old_folder, new_folder)
        except KhoTepError:
            return  # leave refs on the old path (item_ids still resolve); retry a later turn
        for ref in listing.media:  # keep refs' folder in sync so the next move computes correctly
            ref["path"] = f"{new_folder}/{ref['filename']}"

    def _upload_media(
        self, folder: str, items: list[FetchedMedia], image_slots: int | None = None, rieng: bool = False
    ) -> tuple[list[dict[str, str]], int]:
        """Upload each fetched file to the kho tệp under `folder`. Returns
        `(refs, n_capped)` — the stored references (the DB keeps ONLY these, never the bytes)
        and how many PHOTOS were skipped because the per-listing cap was reached (so the bot
        can tell the seller). To keep storage cheap (see [[aioi-data-model]]): PHOTOS are
        DOWNSCALED (~10× smaller, 1600px — plenty for a listing display) before upload, and
        `image_slots` caps how many MORE photos this folder may take (None = unlimited);
        PDFs/docs (sổ hồng, brochure) are kept ORIGINAL. Best-effort: a failed upload skipped."""
        if self._media_store is None or not items:
            return [], 0
        refs: list[dict[str, str]] = []
        n_capped = 0
        for m in items:
            if m.kind == "image":
                if image_slots is not None:
                    if image_slots <= 0:
                        n_capped += 1  # per-listing photo cap reached — skip + count the extras
                        continue
                    image_slots -= 1
                data, media_type = downscale_image(m.data, m.media_type)  # shrink to save storage
            else:
                data, media_type = m.data, m.media_type  # keep documents original
            # Name the file, with an extension matching the (possibly RE-ENCODED) bytes: a
            # downscaled PNG becomes JPEG, so a "mat_tien.png" must be stored as "mat_tien.jpg"
            # or Windows mis-opens it. An unnamed file (Drive mojibake / bare link) gets a
            # content-hash name so many unnamed files don't collide to one and re-sends are
            # idempotent (hash of the STORED bytes).
            ext = extension_for(media_type)
            if m.filename:
                base = m.filename.rsplit(".", 1)[0] if "." in m.filename else m.filename
                filename = base + ext if ext else m.filename
            else:
                filename = f"{m.display_name}_{hashlib.sha1(data).hexdigest()[:8]}{ext}"
            try:
                ref = self._media_store.upload(folder, filename, data, media_type, rieng=rieng)
            except KhoTepError:
                continue
            refs.append(ref.to_dict())
        return refs, n_capped

    def _cap_note(self, n_capped: int, conv: Conversation | None = None) -> str:
        """A friendly line telling the seller the photo limit and how many weren't kept.
        Honest about the behavior: we keep the FIRST `max_photos` and skip the rest (no
        swap mechanism yet), so it suggests sending the best shots first."""
        if n_capped <= 0:
            return ""
        cau = (f"\n\n(Mỗi căn em chỉ lưu tối đa {self._max_photos} ảnh cho tin gọn, tải nhanh nha — nên {n_capped} tấm sau em CHƯA lưu ạ. "
               f"Lần sau anh/chị gửi trước {self._max_photos} tấm ĐẸP NHẤT là đủ đó!)")
        return _xung_ho_cau(cau, *self._goi_toi(conv)) if conv is not None else cau

    def _apply_text_to_listing(self, listing: Listing, text: str) -> list[str]:
        """Extract structured fields straight into ONE listing's Property from arbitrary
        text (a media-group's description) — used when the target isn't necessarily the
        seller's currently-active listing (see `_group_media_batch`)."""
        if not text.strip():
            return []
        data = self._provider.extract(EXTRACTION_SYSTEM, [Message("user", text)], extraction_schema())
        data.pop("is_new_listing", None)  # listing boundaries are already decided by the grouping
        if data.pop("is_rental", False):
            listing.prop.is_rental = True
        data.pop("seller_role", None)  # a media group doesn't speak for who the seller is
        return listing.prop.update({k: v for k, v in data.items() if isinstance(v, str)})

    def _group_media_batch(
        self,
        conv: Conversation,
        fetched: list[FetchedMedia],
        urls: list[str],
        user_key: str,
        now: float,
    ) -> tuple[str, list[str]]:
        """A batch of >1 files may be several different căn, ảnh chung of the project, or
        ảnh for a căn already in the basket — read filenames+folder name+image content
        TOGETHER and route each group to the right place (never guess silently; ask to
        verify when unsure) instead of blending everything into one listing."""
        labels = [(m.filename if _ten_tep_that(m.filename) else None) or f"{'ảnh' if m.kind == 'image' else 'tài liệu'} {i}"
                  for i, m in enumerate(fetched, 1)]
        folder_name = next((n for u in urls if (n := self._folder_name(u))), None)
        basket_labels = [li.label() for li in conv.listings]
        instruction = build_media_group_instruction(conv.assistant.name, folder_name, basket_labels)
        result = self._provider.group_media(
            [(m.data, m.media_type) for m in fetched], labels, instruction, media_group_schema()
        )
        groups = [g for g in (result.get("nhom") or []) if g.get("tep")]

        if len(groups) <= 1:  # not actually multiple căn — treat as the old single-blob read
            active_prop = conv.active.prop if conv.active else None
            missing = active_prop.missing_fields() if active_prop else []
            next_f = missing[0] if missing else None
            instruction = build_media_read_instruction(
                conv.assistant.name,
                pending_question=self._pending_seller_question(conv),
                prop=active_prop,
                next_field=next_f,
            ) + khoi_xung_ho(_detect_customer_pronoun(conv), conv.assistant.name, _xung_ho_doan(conv))   # SRS-5.1zzzzzzz253
            description = self._provider.describe_media(
                [(m.data, m.media_type) for m in fetched], instruction
            ).strip()
            names = ", ".join(labels)
            # A pure DATA page (bảng giá/thông số): extract the data, abandon the image.
            data_only = bool(groups and groups[0].get("chi_luu_du_lieu"))
            # Ảnh chụp THẬT (không giấy tờ, không trang dữ liệu): lời AI tả ảnh vào lịch sử với dấu riêng — lượt lập thao tác
            # không lấy nó làm bằng chứng ô tin (SRS-5.1zzzzzzz73; 19/10 "nhà mới xây" suy từ ảnh thành ô tin rồi lên bài).
            anh_chup = bool(groups) and groups[0].get("giay_to") is False and not data_only
            dau = DAU_TA_ANH_CHUP if anh_chup else "[Khách gửi"
            conv.history.append(Turn(
                "user",
                f"{dau} {len(fetched)} tệp ({names}). Nội dung em đọc được từ tài liệu của khách:]\n{description}",
                now,
            ))
            captured, capped = self._route_readout_media(
                conv, description, fetched, user_key, store=not data_only)
            tail = _xung_ho_cau("\n\n(Em đã lấy thông tin từ tài liệu, không cần lưu ảnh bảng dữ liệu nha.)", *self._goi_toi(conv)) if data_only else ""
            return (self._hoi_trung_ten(conv, f"{description}{tail}") + self._cap_note(capped, conv), captured)

        # Multiple groups: route each — "chung" enriches the shared project, "can_da_co"
        # updates an EXISTING basket listing, "can_moi" fills the empty starter listing
        # first then creates a fresh one per additional group (same pattern as CSV import).
        by_label = dict(zip(labels, fetched))  # group's "tep" filenames -> the fetched bytes
        captured: list[str] = []
        used_active = False
        summary: list[str] = []
        total_capped = 0
        known_project = conv.active.prop.fields.get("du_an")
        for g in groups:
            scope = g.get("pham_vi")
            files = ", ".join(g.get("tep") or [])
            mo_ta = (g.get("mo_ta") or "").strip()
            items = [by_label[f] for f in (g.get("tep") or []) if f in by_label]
            # A pure DATA page (bảng giá/thông số): keep the extracted data, abandon the image.
            data_only = bool(g.get("chi_luu_du_lieu"))
            giay_to = g.get("giay_to") is not False   # thiếu cờ → coi như giấy tờ, cất RIÊNG (an toàn hơn lộ ảnh sổ, §5)
            # OPEN-53 (SRS-5.1zzzzzzz241): ảnh AI chấm không phải ảnh thật của căn → không lưu (không tính điểm, không lên web).
            khong_phai_can = g.get("khong_phai_anh_can") is True and not giay_to and not data_only
            store_items = [] if (data_only or khong_phai_can) else items
            tag = (" (chỉ lấy dữ liệu, không lưu ảnh)" if data_only
                   else " (ảnh không giống ảnh chụp thật của căn — em chưa đưa vào tin)" if khong_phai_can else "")
            if scope == "chung":
                project = self.register_project_from_text(mo_ta, project_name=known_project, voter=user_key)
                self.register_unit_type_from_text(mo_ta, voter=user_key)
                folder = f"{project.name}/_Chung" if project else "_Chung/Chua_ro_du_an"
                self._upload_media(folder, store_items)  # no listing — project-level
                # A project-level DOCUMENT (phân lô, quy hoạch...) → grounded .md for Q&A later.
                docs = [] if data_only else self._ingest_group_docs(
                    project.name if project else None, items, kind="tài liệu chung", nguoi_gui=user_key)
                doc_note = f" — đã lưu tài liệu để tra cứu: {', '.join(docs)}" if docs else ""
                summary.append(f"📁 Thông tin CHUNG dự án ({files}){tag}{doc_note}:\n{mo_ta}")
            elif scope == "mau_nha":
                # A house-model brochure (mẫu nhà) — belongs to the UnitType, shared by every
                # unit of the model, NOT to any one căn.
                project = self.register_project_from_text(mo_ta, project_name=known_project, voter=user_key)
                ut = self.register_unit_type_from_text(mo_ta, voter=user_key)
                docs: list[str] = []
                if ut is not None and project is not None:
                    self._store_unittype_media(project.name, ut.name, store_items)
                    # The brochure PDF → a grounded .md titled by the model, so "mẫu này mấy
                    # tầng, mặt tiền bao nhiêu?" can be answered from the document later.
                    if not data_only:
                        docs = self._ingest_group_docs(
                            project.name, items, kind="mẫu nhà", default_title=ut.name, nguoi_gui=user_key)
                doc_note = f" — đã lưu tài liệu để tra cứu: {', '.join(docs)}" if docs else ""
                summary.append(f"🏗️ Mẫu nhà{' ' + ut.name if ut else ''} ({files}){tag}{doc_note}:\n{mo_ta}")
            elif scope == "can_da_co":
                idx = g.get("chi_so_can_da_co")
                target = (conv.listings[idx - 1] if isinstance(idx, int) and 1 <= idx <= len(conv.listings)
                          else conv.active)
                if giay_to or data_only:   # ảnh chụp thật: lời AI TẢ ảnh không phải lời khách → không sinh ô tin (SRS-5.1zzzzzzz73)
                    captured += self._apply_text_to_listing(target, mo_ta)
                refs, capped = self._upload_media(
                    self._folder_for(target), store_items,
                    image_slots=self._max_photos - _image_count(target.media), rieng=giay_to)
                target.media += refs
                total_capped += capped
                summary.append(f"🏠 Cập nhật căn: {target.label()} ({files}){tag}:\n{mo_ta}")
            else:  # "can_moi"
                target = conv.active if not used_active and self._listing_empty(conv.active) else conv.new_listing()
                used_active = True
                if giay_to or data_only:   # ảnh chụp thật: lời AI TẢ ảnh không phải lời khách → không sinh ô tin (SRS-5.1zzzzzzz73)
                    captured += self._apply_text_to_listing(target, mo_ta)
                refs, capped = self._upload_media(
                    self._folder_for(target), store_items,
                    image_slots=self._max_photos - _image_count(target.media), rieng=giay_to)
                target.media += refs
                total_capped += capped
                summary.append(f"🆕 Căn mới: {target.label()} ({files}){tag}:\n{mo_ta}")
        if self._convstore is not None:
            self._convstore.save(conv)

        reply = (
            f"{len(fetched)} tệp chia thành {len(groups)} nhóm:\n\n"
            + "\n\n".join(summary)
            + _xung_ho_cau("\n\nAnh/chị xem giúp em tách vậy có đúng không, có căn nào bị gộp/lẫn không ạ?", *self._goi_toi(conv))
            + self._cap_note(total_capped, conv)
        )
        reply = self._hoi_trung_ten(conv, reply)  # a group named a near-miss project → ASK
        return reply, captured

    # --- internals -------------------------------------------------------

    @staticmethod
    def _tach_tin_ban_thue(conv: Conversation) -> str | None:
        """Mở tin thứ hai cho CÙNG căn ở loại giao dịch kia (OPEN-59 a, SRS-5.1zzzzzzz241): chép ô của căn (trừ giá / ô riêng của loại giao
        dịch), hai tin trỏ nhau qua `_cung_can` (DB: `listings.cung_can_id`). Căn đã có giá thì chuyển sang tin mới để hỏi giá loại kia.
        Trả "thue" / "ban" = loại tin vừa mở; None khi căn đã có tin cặp."""
        goc = conv.active
        if goc.prop.fields.get("_cung_can") or not any(not k.startswith("_") and v for k, v in goc.prop.fields.items()):
            return None
        o = {k: v for k, v in goc.prop.fields.items() if not k.startswith("_") and k not in O_GIA_RIENG_LOAI_GD}
        cap = Listing(prop=Property(loai_hinh=goc.prop.loai_hinh, is_rental=not goc.prop.is_rental, fields=o),
                      history_start=len(conv.history))
        cap.prop.fields["_cung_can"] = goc.listing_id
        goc.prop.fields["_cung_can"] = cap.listing_id
        conv.listings.append(cap)
        if goc.prop.fields.get("gia"):
            conv.active_listing_id = cap.listing_id
        return "thue" if cap.prop.is_rental else "ban"

    @staticmethod
    def _is_stub_listing(li: Listing) -> bool:
        """A listing with nothing that identifies a real property — no mã số căn, no address, no
        price. (Loại hình / dự án alone don't make it a real căn.)"""
        f = li.prop.fields
        return not (f.get("ma_so_can") or f.get("dia_chi") or f.get("gia"))

    def _drop_stub_listings(self, conv: Conversation) -> None:
        """Remove the leftover empty STARTER listing (a blank Listing() every conversation opens
        with, that once lingered as junk 'căn 1 · nha_pho' in the rổ) once REAL căn exist — but
        never drop the one the seller is actively building (bản anh Luận, SRS-5.1zzzzzzz51: bản 16/10 bỏ cả căn đang khai
        khi nó chưa có địa chỉ / giá, nên căn thứ hai vừa nói loại hình + diện tích mất ở lượt kế)."""
        if not any(not self._is_stub_listing(li) for li in conv.listings):
            if not conv.listings:
                conv.listings = [Listing()]
                conv.active_listing_id = conv.listings[0].listing_id
            return  # nothing real yet — the seller is still starting their first căn
        kept = [li for li in conv.listings
                if not self._is_stub_listing(li) or li.listing_id == conv.active_listing_id]
        if len(kept) != len(conv.listings):
            conv.listings = kept or [Listing()]
        if all(li.listing_id != conv.active_listing_id for li in conv.listings):
            conv.active_listing_id = conv.listings[-1].listing_id

    def _trang_thai_web(self, conv: Conversation) -> dict | None:
        """Trạng thái THẬT của tin đang nói trên web (kho Supabase). Kho không có khái niệm web → None (giữ lời cũ); có nhưng đọc
        lỗi → {"len_web": None}: bot nói trung tính, không bịa "đã đăng". Ghi lượt này xuống trước để trigger DB tính trên dữ liệu
        mới nhất (khách vừa bổ sung phường → tin lên ngay, bot báo đúng)."""
        doc = getattr(self._convstore, "trang_thai_tin", None)
        if doc is None:
            return None
        try:
            with _do(conv, "ghi_kho"):
                self._convstore.save(conv)
                web = doc(conv) or {"len_web": None}
        except Exception as e:  # noqa: BLE001
            log.warning("trang_thai_web lỗi: %s", e)
            return {"len_web": None}
        if "phuong" in (web.get("thieu") or []):   # SRS-5.1zzzzzzz212: tin chờ phường — hỏi khác, chỉ kể phường hệ thống tra được
            n = conv.lo.get("phuong", 0)
            web["phuong_da_hoi"] = n >= 1 or "phuong" in conv.prop.hoan
            web["goi_y_phuong"] = self._goi_y_phuong(conv)
            f0 = conv.prop.fields
            if not web["goi_y_phuong"] and self._dia_danh is not None and f0.get("duong"):
                # SRS-5.1zzzzzzz271: tên đường khớp nhiều đường (Mã Lò / Mã Lộ) — hỏi đường nào trước, không hỏi trống "gần chợ, ngã tư".
                web["duong_nhap_nhang"] = self._dia_danh.ung_vien_duong(f0.get("duong"), f0.get("quan"))
            web["co_so_nha"] = bool(re.match(r"\s*(?:số\s*)?\d+[a-zA-Z]?(?:/\d+[a-zA-Z]?)*\b", str(conv.prop.fields.get("dia_chi") or ""), re.I))
            # SRS-5.1zzzzzzz213 (khách ảo 26/10: anh K. bị hỏi phường 6 lượt sau bản nháp vì sổ lờ chỉ đếm ở lượt thu thập, không đếm ở cổng
            # web): mỗi lượt cổng này hỏi phường cũng tính một lần lờ (một lần mỗi lượt). Hỏi tới lần thứ 3 mà chưa ra → báo người phụ trách tra
            # phường (cùng đường `can_nguoi_that`, có nhắc admin thật), bot thôi hỏi.
            if conv.prop.fields.get("_phuong_bao_admin"):
                web["phuong_bao_admin"] = True   # admin đã được báo: không hỏi phường nữa, không đếm lờ nữa (nhật ký 27/10: lờ lên tới 16)
            elif not conv.y_luot.get("_cong_web_phuong"):
                conv.y_luot["_cong_web_phuong"] = True
                conv.lo["phuong"] = n + 1
                # SRS-5.1zzzzzzz214 mục 8 (chủ dự án 27/10: "khách không chọn thì lưu cả 2 luôn"): đã hỏi một lần mà khách không chọn, kho tra được
                # 2–4 phường ứng viên (đường / hẻm, hoặc phường cũ bị chia) → ghi tạm CẢ các phường đó vào ô, tin lên web, thôi hỏi, không báo admin.
                # Đây là ô do HỆ THỐNG ghi theo quyết định chủ dự án (ngoại lệ "ô tin chỉ ghi điều khách nói", SRS-73) — đánh dấu `_phuong_he_thong`.
                ung_vien = self._ung_vien_phuong(conv, web)
                if n >= 1 and 2 <= len(ung_vien) <= 4:
                    conv.prop.fields["phuong"] = " / ".join(ung_vien)
                    conv.prop.fields["_phuong_he_thong"] = "1"
                    web["thieu"] = [o for o in (web.get("thieu") or []) if o != "phuong"]
                    web["phuong_he_thong"] = ung_vien
                    return web
                # SRS-5.1zzzzzzz214 mục 7 (chat anh Luận 27/10 06:34–06:44 VN: 15 tin 🙋 tới admin trong 10 phút): `y_luot` làm mới mỗi lượt nên
                # "chưa có can_nguoi_that" luôn đúng → từ lượt 3 trở đi lượt nào cũng báo. Cờ nhớ qua lượt nằm ở ô tin: báo admin MỘT lần mỗi căn.
                f = conv.prop.fields
                if n >= 2 and not conv.y_luot.get("can_nguoi_that") and not f.get("_phuong_bao_admin"):
                    f["_phuong_bao_admin"] = "1"
                    web["phuong_bao_admin"] = True   # SRS-5.1zzzzzzz228: lượt báo admin cũng thôi hỏi — phường hỏi tối đa 2 lần
                    conv.y_luot["bao_admin_he_thong"] = True
                    conv.y_luot["can_nguoi_that"] = ("Bot hỏi phường 3 lượt chưa ra — nhờ admin tra và điền phường ở Sửa tin: "
                                                     + ", ".join(str(f[k]) for k in ("du_an", "duong", "dia_chi", "quan") if f.get(k)))
        return web

    def _phuong_moi_cua_cu(self, conv: Conversation) -> str | None:
        """Phường MỚI duy nhất của phường cũ đánh số khách nói ("phường 2" Quận 8 → Phường Chánh Hưng), hoặc None (SRS-5.1zzzzzzz220)."""
        tra = getattr(self._dia_danh, "phuong_cu_moi", None)
        if tra is None:
            return None
        try:
            return tra(conv.prop.fields.get("phuong"), conv.prop.fields.get("quan"))
        except Exception as e:  # noqa: BLE001 — tra địa danh là phần thêm
            log.warning("phường mới của phường cũ: lỗi %s", e)
            return None

    def _phuong_cu_bi_chia(self, conv: Conversation) -> bool:
        """Khách nói phường cũ đánh số mà phường đó chia về ≥ 2 phường mới (`TraDiaDanh.phuong_cu_chia`, cần quận). Kho hỏng → False."""
        chia = getattr(self._dia_danh, "phuong_cu_chia", None)
        if not chia:
            return False
        f = conv.prop.fields
        try:
            return len(chia(f.get("phuong"), f.get("quan")) or []) >= 2
        except Exception as e:  # noqa: BLE001
            log.warning("phuong_cu_chia lỗi: %s", e)
            return False

    def _ung_vien_phuong(self, conv: Conversation, web: dict) -> list[str]:
        """Phường ứng viên (tên đầy đủ) để ghi tạm cả hai khi khách không chọn (SRS-5.1zzzzzzz214 mục 8): kho đường / hẻm trước, không có thì các
        phường mới mà phường cũ đánh số khách nói bị chia về (`TraDiaDanh.phuong_cu_chia`). Kho hỏng → []."""
        ph = list(web.get("goi_y_phuong") or [])
        if ph:
            return ph
        chia = getattr(self._dia_danh, "phuong_cu_chia", None)
        if not chia:
            return []
        f = conv.prop.fields
        try:
            return list(chia(f.get("phuong"), f.get("quan")) or [])
        except Exception as e:  # noqa: BLE001
            log.warning("phuong_cu_chia lỗi: %s", e)
            return []

    def _phuong_tu_dia_chi(self, conv: Conversation, captured: list[str]) -> list[str]:
        """SRS-5.1zzzzzzz236 (chủ dự án 28/10: "đưa địa chỉ cụ thể hoặc hẻm cụ thể thì nó search phường trước bằng nominatim, nếu search không
        được mới hỏi"): chưa có phường mà ô dia_chi có số nhà / số hẻm → (1) bản đồ ra ĐÚNG số nhà (`TraDiaDanh.phuong_theo_so_nha`), không thì
        (2) kho hẻm chỉ có MỘT phường → ghi phường vào ô, đánh dấu do hệ thống (`_phuong_he_thong`, kho ghi `ward_source = suy_doan`). Mỗi địa
        chỉ tra một lần (`_phuong_tra_dc`); khách đổi địa chỉ thì phường hệ thống ghi theo địa chỉ cũ bị gỡ để tra lại. Ngoại lệ có chủ đích
        của "ô tin chỉ ghi điều khách nói" (SRS-73), như ghi tạm hai phường ở SRS-214 mục 8."""
        f = conv.prop.fields
        dc = str(f.get("dia_chi") or "").strip()
        if "phuong" in captured and f.get("_phuong_he_thong") in ("so_nha", "hem"):
            f.pop("_phuong_he_thong", None)   # khách tự nói phường lượt này: phường là của khách, không gỡ theo địa chỉ nữa
        if f.get("_phuong_he_thong") in ("so_nha", "hem") and f.get("_phuong_tra_dc") != dc:
            f.pop("phuong", None)
            f.pop("_phuong_he_thong", None)
        if f.get("phuong") or not dc or not f.get("duong") or f.get("_phuong_tra_dc") == dc:
            return []
        if not re.match(r"\s*(?:số\s*)?\d", dc, re.I) and not re.search(r"\b(?:hẻm|hxh|kiệt|ngõ)\s*\d", dc, re.I):
            return []
        f["_phuong_tra_dc"] = dc
        nguon, p = "so_nha", None
        tra = getattr(self._dia_danh, "phuong_theo_so_nha", None)
        try:
            p = tra(dc, f.get("duong"), f.get("quan")) if tra else None
            if not p:
                hem = phuong_kho_hem(self._dia_danh, f)
                nguon, p = "hem", (hem[0] if len(hem) == 1 else None)
        except Exception as e:  # noqa: BLE001 — tra hỏng thì bot hỏi phường như cũ
            log.warning("phường từ địa chỉ: lỗi %s", e)
            return []
        if not p:
            return []
        log.warning("Phường từ địa chỉ: %s (%s)", p, nguon)
        f["_phuong_he_thong"] = nguon
        conv.y_luot["_phuong_vua_tra"] = p
        return conv.prop.update({"phuong": p})

    def _goi_y_phuong(self, conv: Conversation) -> list[str]:
        """Phường kho đường / kho hẻm tra được cho địa chỉ khách nói (1–4 phường) — để bot kể cho khách chọn, không tự bịa tên."""
        f = conv.prop.fields
        if self._dia_danh is None or not f.get("duong"):
            return []
        try:
            ph = phuong_kho_hem(self._dia_danh, f)
            if not ph:
                d = self._dia_danh.duong(f.get("duong"), f.get("quan"))
                ph = list(d["phuong"]) if d else []
        except Exception as e:  # noqa: BLE001 — tra kho hỏng thì không gợi ý, không làm hỏng lượt
            log.warning("goi_y_phuong lỗi: %s", e)
            return []
        if not ph:
            # SRS-5.1zzzzzzz233 (chat chị Ngân 28/10: "Bình Hưng Hòa A" cũ chia về Bình Hưng Hòa / Bình Trị Đông, kho đường không có Bình Long —
            # bot hỏi trống "tên phường mới" rồi xin lại số nhà đã có): kể các phường mới mà phường cũ khách nói bị chia về.
            ph = self._ung_vien_phuong(conv, {})
        return ph if 1 <= len(ph) <= 4 else []

    def _build_result(
        self, conv: Conversation, reply: str, captured: list[str], now: float
    ) -> TurnResult:
        self._drop_stub_listings(conv)   # clean up the blank starter once real căn exist
        if self._convstore is not None:  # persist the listing after every turn
            # Kho có lưu nền (Supabase) → lần lưu cuối của lượt không chặn lời gửi khách (SRS-5.1zzzzzzz92); kho khác lưu ngay.
            luu_nen = getattr(self._convstore, "luu_nen", None)
            with _do(conv, "ghi_kho"):
                (luu_nen or self._convstore.save)(conv)
        timeliness = self._timeliness(conv, now)
        completeness = conv.prop.completeness()  # the active listing
        prop_score = g.property_score(completeness, timeliness)
        # User score aggregates across the WHOLE basket (SRD §IV: avg of property scores ×
        # scale bonus) — more listings → scale bonus, the point of growing the rổ hàng.
        all_scores = [g.property_score(li.prop.completeness(), timeliness) for li in conv.listings]
        u_score = g.user_score(all_scores, num_listings=len(conv.listings))
        missing = conv.prop.missing_fields()
        next_f = (
            conv.buyer_lead.next_question_field()
            if conv.role == "buyer" and conv.buyer_lead
            else (missing[0] if missing else None)
        )
        return TurnResult(
            reply=reply,
            assistant_name=conv.assistant.name,
            captured=captured,
            next_field=next_f,
            user_type=conv.user_type.value,
            is_listing_post=conv.prop.summary_ready(),
            completeness=completeness,
            property_score=prop_score,
            user_score=u_score,
            tier=g.tier_for(u_score).value,
            role=conv.role,
            lead=conv.buyer_lead,
            can_nguoi_that=conv.y_luot.get("can_nguoi_that") if isinstance(conv.y_luot.get("can_nguoi_that"), str) else None,
            tha_tim=bool(conv.y_luot.get("tha_tim")) or bool(set(captured) & CAC_O_DIA_CHI),
            xin_danh_gia=bool(conv.y_luot.get("xin_danh_gia")),
            danh_gia=conv.y_luot.get("danh_gia"),
            xin_anh=list(conv.y_luot.get("xin_anh") or []),
            ban_ve=list(conv.y_luot.get("ban_ve") or []),
            chu_thich=che_do_test.chu_thich(conv, captured, next_f, so_token.tong_luot()) if che_do_test.bat() else "",
        )

    def _match_listing(self, conv: Conversation, ref: str) -> Listing | None:
        """Resolve a seller's textual reference to an EXISTING basket listing — by unit code
        number (e.g. "42" ↔ ma_so_can "căn số 42") first, then by address token overlap (a
        partial "căn ở Trương Đình Hội" matches "198A/22 Trương Đình Hội"). None if no match."""
        ma = ref.strip().lstrip("#").upper()
        for li in conv.listings:   # SRS-5.1zzzzzzz257: mã tin trên web (#7B9DED51 = 8 ký tự đầu id) — khối câu khách hỏi chủ nhà nêu mã này
            if ma and li.ma_tin == ma:
                return li
        ref_nums = set(re.findall(r"\d+", ref))
        if ref_nums:
            for li in conv.listings:
                if set(re.findall(r"\d+", li.prop.fields.get("ma_so_can") or "")) & ref_nums:
                    return li
        ref_tokens = set(normalize_project_name(ref).split())
        for li in conv.listings:
            addr = li.prop.fields.get("dia_chi")
            if addr and len(ref_tokens & set(normalize_project_name(addr).split())) >= 2:
                return li
        return None

    def _unlist_listings(self, conv: Conversation, keep: list[str], drop: list[str],
                         clear: bool = False, status: str = KHONG_RAO) -> int:
        """AOND NEVER deletes data. 'bỏ/xóa/chỉ giữ' only flips a listing's STATUS (default
        'không rao' — hidden but kept, rao-able again anytime); the row and its media stay.
        `clear` = unlist the WHOLE basket, `keep` = unlist every OTHER coded listing, `drop` =
        unlist the named căn. Returns how many listings were affected."""
        keep_ids = {li.listing_id for c in keep if (li := self._match_listing(conv, c))}
        drop_ids = {li.listing_id for c in drop if (li := self._match_listing(conv, c))}

        def targeted(li: Listing) -> bool:
            if self._listing_empty(li):
                return False                       # a blank starter has nothing to unlist
            if clear:
                return True
            if li.listing_id in drop_ids:
                return True
            if keep:  # keep-only: unlist other CODED listings; leave code-less ones alone
                return li.listing_id not in keep_ids and bool(li.prop.fields.get("ma_so_can"))
            return False

        n = 0
        for li in conv.listings:
            if targeted(li):
                li.status = status                 # data + media kept; just hidden from active rao
                n += 1
        if self._convstore is not None:
            self._convstore.save(conv)             # persists the status change — deletes nothing
        return n

    def _extract(self, conv: Conversation) -> list[str]:
        """Plan-then-execute: ask the model for an ordered LIST OF OPERATIONS on the basket,
        then run each deterministically. Returns the changed field names (for media-sync). The
        structural receipts (what was cleared/removed/added) are stashed on the conv so the
        reply layer can confirm the true result."""
        captured, conv.last_receipts = self._plan_and_apply(conv)
        return captured

    def _plan_and_apply(self, conv: Conversation) -> tuple[list[str], list[tuple]]:
        return self._ap_dung_ke_hoach(conv, self._lap_ke_hoach(conv))

    def _lap_ke_hoach(self, conv: Conversation) -> dict:
        """Lượt AI lập thao tác: đọc tin khách theo nghĩa, ghi các thuộc tính hội thoại (vai, ý mua / bán, duyệt, hỏi về,
        xưng hô, y_luot) và TRẢ kế hoạch — chưa đụng rổ hàng (`_ap_dung_ke_hoach`)."""
        # With a BASKET (>1 căn) the seller acts on ONE căn per message, but a reference may span
        # turns ("...phải nó không?" → "nó đó em") — so read from just AFTER the PREVIOUS user
        # turn: the latest user line plus the bot's question(s) right before it (confirm context),
        # WITHOUT re-including earlier user ACTIONS (which would re-trigger old ops). A single
        # listing still reads its full slice so data accumulates across turns.
        multi = len(conv.listings) > 1
        src = self._plan_window(conv) if multi and conv.history else conv.messages()
        # Give the planner the SAME memory the reply gets: the project's price list + phân lô +
        # the basket — so it resolves "căn Cosmo"/"căn góc lớn nhất" to a real mã lô (with its
        # data) instead of fabricating a blank căn. When the reference needs a guess it isn't
        # sure of, it leaves operations empty so the reply can confirm first.
        project = self.project_for(conv.prop, conv)
        system = OPERATIONS_SYSTEM + RANH_GIOI_CACHE + self._project_memory_block(project, conv)   # SRS-5.1zzzzzzz166: 16 nghìn chữ cố định chung mọi khách
        if project is not None and project.docs_cho(conv.user_key):
            system += (
                "KHI LẬP THAO TÁC từ bộ nhớ: khi khách rõ ràng THÊM/nhắc một căn CÓ trong bảng "
                "giá, tạo op 'add' và điền LUÔN mã lô + mẫu nhà + giá + diện tích lấy từ bộ nhớ. "
                "NHƯNG nếu phải SUY LUẬN mà chưa chắc (căn 'góc', 'lớn nhất', 'view'...), để "
                "operations RỖNG — phần trả lời sẽ hỏi xác nhận; chỉ 'add' sau khi khách xác nhận.\n"
            )
        system += self._basket_block(conv)
        if conv.listing_proposed:
            # Duyệt bản nháp đọc theo TRẠNG THÁI, không theo vị trí tin (SRS-5.1zzzzzzz87): chat chị N. 20/10 — bot tự hỏi "xác nhận
            # giúp em bản tin đã ổn" thì tin ngay trước không còn là bản nháp, "ổn" / "ok" bị bỏ trống, bot hỏi lại mãi.
            system += ("\nTRẠNG THÁI: bot ĐÃ gửi bản tin nháp của căn đang nói. Các tin bot gửi sau đó (nhắc xem bản tin, hỏi xác "
                       "nhận đã ổn chưa, hỏi phí) vẫn là đang chờ khách duyệt CHÍNH bản nháp này.\n")
        if conv.prop.fields.get("dia_chi"):
            system += f"\nĐỊA CHỈ ĐANG GHI của căn đang nói tới: {conv.prop.fields['dia_chi']}\n"
        with _do(conv, "dia_danh"):
            system += goi_y_duong(self._dia_danh, conv.prop.fields)   # SRS-5.1zzzzzzz61: khách xác nhận tên đường kho gợi ý → AI ghi
        system += self._khoi_du_an_da_hoi(conv)   # SRS-5.1zzzzzzz181: khách xác nhận dự án kho gợi ý → AI ghi du_an
        system += khoi_tin_tra_loi(conv.tin_tra_loi)   # SRS-5.1zzzzzzz270: khách bấm "Trả lời" một tin
        # Phía mua (SRS-5.1zzzzzzz70): khách mua thấy căn đang có (AI chỉ đúng mã); người rao thấy câu khách đang hỏi họ.
        kho = self._convstore
        conv.can_mua, conv.cau_hoi_cho = [], []
        if conv.role == "buyer" and getattr(kho, "can_phu_hop", None) is not None:
            with _do(conv, "kho_doc"):
                conv.can_mua = self._can_goi_y(conv)
            system += khoi_can_cho_khach(conv.can_mua, not co_tieu_chi(conv.buyer_lead)) + KHOI_VAI_MUA_LAP_VIEC
        elif conv.role != "buyer" and getattr(kho, "cau_hoi_cho_nguoi_ban", None) is not None:
            with _do(conv, "kho_doc"):
                conv.cau_hoi_cho = kho.cau_hoi_cho_nguoi_ban(conv.user_key)
            system += khoi_cau_hoi_cho(conv.cau_hoi_cho)
        conv.loi_khach_luot = " ".join(m.content for m in src if m.role == "user" and not m.content.startswith(DAU_TA_ANH_CHUP))
        with _do(conv, "lap_thao_tac"):
            plan = self._provider.extract(system, src, operations_schema())
        if isinstance(plan.get("operations"), str):
            # SRS-5.1zzzzzzz78: Haiku có lượt trả `operations` thành chuỗi mà giải dễ dãi cũng hỏng — gọi lại một lần thay vì mất
            # mọi ô của lượt (lượt cuối hội thoại thì mất hẳn).
            log.warning("Kế hoạch: operations là chuỗi không giải được — gọi lại lượt lập thao tác một lần")
            with _do(conv, "lap_thao_tac"):
                plan = self._provider.extract(system, src, operations_schema())
        # SRS-5.1zzzzzzz78: Haiku hay đặt `bang_chung` LỌT VÀO TRONG `fields` (log bắn thử) — kéo ra cấp thao tác, không thì cụm trích
        # không được dùng và "bang_chung" thành một ô lạ.
        # SRS-5.1zzzzzzz86: cùng hình lỗi với MỌI khoá cấp kế hoạch — bắn thử KB1 lần 2, Haiku đặt `ngoai_vung` vào `fields` của thao tác,
        # cờ vùng không bật và "ngoai_vung" thành một ô tin. Kéo hết khoá cấp kế hoạch (theo schema, không liệt kê tay) ra ngoài.
        cap_ke_hoach = set((operations_schema().get("properties") or {})) - {"operations"}
        for o in plan.get("operations") or []:
            f = o.get("fields") if isinstance(o, dict) else None
            if isinstance(f, dict):
                for k in cap_ke_hoach & set(f):
                    v = f.pop(k)
                    if v not in (None, "", [], {}) and plan.get(k) in (None, "", [], {}):
                        plan[k] = v
            if isinstance(f, dict) and "bang_chung" in f:
                bc = f.pop("bang_chung")
                if isinstance(bc, str):
                    try:
                        bc = json.loads(bc)
                    except ValueError:
                        bc = None
                if isinstance(bc, dict):
                    o["bang_chung"] = {**bc, **(o.get("bang_chung") if isinstance(o.get("bang_chung"), dict) else {})}
        # SRS-5.1zzzzzzz77: bắn thử thấy ô khách vừa nói (vd "diện tích sàn tầm 170m vuông") có lượt không vào kế hoạch mà không dòng
        # "Bỏ ô" nào — ghi TÊN ô lượt AI trả (không giá trị: log có thể chứa dữ liệu khách) để biết hụt ở AI hay ở code.
        # Model có lúc trả thao tác không phải object (chuỗi) — chỗ áp dụng bỏ qua chúng (`isinstance(op, dict)`), log cũng vậy; bản đầu
        # của dòng log này gọi .get trên chuỗi → 500 cả lượt chat (bắn thử 19/10 10:49).
        # warning chứ không info: lõi chạy dưới uvicorn chỉ in từ mức warning (bắn thử 19/10: dòng info không hiện trong journal).
        # Tin phụ chế độ test (SRS-5.1zzzzzzz130): kể ô AI đề xuất CÓ giá trị; khoá AI trả rỗng / null tách riêng — chúng không qua cổng bằng
        # chứng nên không có dòng "Bỏ ô" nào (bắn thử 22/10: Gemini trả gan_nga_tu / unit_type = null, tin phụ cũ kể như AI đề xuất thật).
        def _mo_ta(o: dict) -> str:
            f = o.get("fields") if isinstance(o.get("fields"), dict) else {}
            co = sorted(k for k, v in f.items() if isinstance(v, str) and v.strip())
            rong = sorted(k for k in f if k not in co)
            return f"{o.get('op')}({', '.join(co) or '-'})" + (f" · rỗng: {', '.join(rong)}" if rong else "")
        conv.de_xuat_luot = [_mo_ta(o) for o in (plan.get("operations") or []) if isinstance(o, dict)]
        log.warning("Kế hoạch: %s", [(o.get("op"), sorted(o["fields"].keys()) if isinstance(o.get("fields"), dict) else type(o.get("fields")).__name__)
                                   if isinstance(o, dict) else type(o).__name__ for o in plan.get("operations") or []])

        # Sticky conversation attributes (never downgrade role to unknown).
        raw_role = plan.get("seller_role")
        # SRS-5.1zzzzzzz213 (khách ảo 26/10: anh K. môi giới 8 năm bị báo phí 1 % — model đoán vai "chủ nhà" từ "a cần đăng tin"): vai chỉ nhận khi
        # cụm trích GỌI TÊN vai và nằm trong lời khách gần đây (bất biến phí, CLAUDE.md "chỉ thành tu_nhan khi cụm trích GỌI TÊN vai"); chưa
        # có bằng chứng thì giữ UNKNOWN → câu phí nêu cả hai mức.
        vua_thanh_cdt = False
        if raw_role in {r.value for r in SellerRole if r is not SellerRole.UNKNOWN} and _vai_co_bang_chung(
                plan.get("seller_role_trich_dan"), [t.content for t in conv.history if t.role == "user" and t.content][-6:]):
            vua_thanh_cdt = raw_role == SellerRole.CHU_DAU_TU.value and conv.user_type is not SellerRole.CHU_DAU_TU
            conv.user_type = SellerRole(raw_role)
        if plan.get("is_rental"):
            conv.prop.is_rental = True

        intent = plan.get("user_intent")
        has_seller_context = (
            conv.role == "seller"
            or len(conv.prop.fields) >= 1
            or bool(conv.prop.loai_hinh)
            or any(not self._is_stub_listing(li) for li in conv.listings)
        )

        # Định tuyến theo ngữ nghĩa thực tế (Semantic Intent do Gemini hiểu toàn câu).
        # SRS-5.1zzzzzzz153 (chủ dự án 23/10/2026: khách vừa mua vừa bán vài căn): MỘT Zalo là một khách, vai theo Ý ĐỊNH CỦA LƯỢT NÀY chứ
        # không bị dính vào phía bán mãi. Bản trước chỉ cho sang vai mua khi khách HOÀN TOÀN không có dấu vết bán — chị N. (tester) từng thử vai
        # bán nên mọi lượt sau, kể cả lúc hẹn xem nhà, đều chạy nhánh bán: lịch hẹn / số điện thoại không được ghi, bot vẫn nói "em chuyển
        # chủ nhà rồi", và tin nhắc xin ảnh của người bán gửi nhầm cho người đang đi xem nhà. Nay: ý định "buy" sang vai mua (trừ lúc đang
        # chờ khách duyệt bản nháp / xác nhận ẩn tin — câu nói đó thuộc việc bán), "sell" sang vai bán, lượt mơ hồ ở lại vai mua nếu đang
        # ở đó. Tin / rổ hàng của phía bán và hồ sơ nhu cầu phía mua đều giữ nguyên, chỉ vai của lượt đổi.
        dang_giua_viec_ban = bool(conv.listing_proposed or conv.pending_destructive)
        if intent not in ("buy", "sell") and not has_seller_context and conv.role != "buyer" and self._go_ma_can_dang_hien(conv):
            # SRS-5.1zzzzzzz273 (bắn thử ban-thu-kiem H 29/10): khách mới nhắn số ký gửi "căn #SEED0040 trần cao bao nhiêu" — model lúc ra
            # "buy", lúc không; không ra thì lượt đi nhánh bán ("nhà phố hay chung cư?"), câu hỏi không tới ai. Lưới đỡ bằng DỮ LIỆU: mã tin
            # khách gõ là một căn đang hiện trên hệ thống (khách chưa có việc bán nào) → khách đang hỏi căn để mua / thuê.
            intent = "buy"
        if intent == "buy" and not (has_seller_context and dang_giua_viec_ban):
            conv.role = "buyer"
            if conv.buyer_lead is None:
                conv.buyer_lead = BuyerLead(user_key=conv.user_key)
            if plan.get("buyer_lead"):
                conv.buyer_lead.update(plan["buyer_lead"])
        elif intent == "sell":
            conv.role = "seller"
        elif conv.role == "buyer" and conv.buyer_lead is not None:
            pass   # lượt mơ hồ ("ok", "xem được không") của người đang nói chuyện mua: ở lại nhánh mua
        elif has_seller_context:
            conv.role = "seller"
        elif conv.so_nhan == SO_TU_VAN:
            # SRS-5.1zzzzzzz210: số tư vấn — lượt mơ hồ (lời chào, "alo") chưa có việc bán nào thì vào vai MUA; khách nói bán thì nhánh "sell"
            # ở trên đã đưa sang vai bán (nhắn nhầm số vẫn được trả lời).
            conv.role = "buyer"
            if conv.buyer_lead is None:
                conv.buyer_lead = BuyerLead(user_key=conv.user_key)

        # Duyệt bản nháp (SRS-5.1zzzzzzz47): chỉ tính khi bản nháp ĐÃ gửi ở lượt trước và cụm trích có thật trong tin khách.
        conv.duyet_luot = None
        y = plan.get("duyet_ban_nhap")
        cuoi = next((t.content for t in reversed(conv.history) if t.role == "user"), "")
        # SRS-5.1zzzzzzz177 (chat thử 24/10: cư dân hỏi "đồng hồ nước… cắt ngày nào" bị ép vào luồng rao bán, có cả dòng `listings`): khách hỏi việc
        # ngoài nhà đất khi CHƯA tỏ ý bán / mua → không ghi ô (operations rỗng), không tạo tin, đếm lượt để lần hai đề nghị nối người.
        nv = plan.get("hoi_ngoai_viec")
        la_ngoai_viec = False
        if (isinstance(nv, str) and nv.strip() and intent not in ("buy", "sell") and not has_seller_context
                and (_trich_dan_khop(nv, cuoi) or _chu_co_trong_loi_khach(nv, self._loi_khach_gan(conv)))):
            conv.so_luot_ngoai_viec += 1
            la_ngoai_viec = True   # ghi vào y_luot SAU chỗ làm mới y_luot bên dưới
            plan["operations"] = []
            plan.pop("buyer_lead", None)
        # Sticker trung tính của bridge ("[khách gửi sticker]", không rõ vui hay bực) KHÔNG bao giờ là đồng ý — dấu của kênh,
        # không phải lời khách (bản TS: laStickerTrungTinh). Tim / like thật đến qua "[khách thả cảm xúc …]".
        if conv.listing_proposed and y in ("dong_y", "khong_dong_y") and not la_sticker(cuoi):
            if _trich_dan_khop(plan.get("duyet_trich_dan"), cuoi):
                conv.duyet_luot = y
            elif y == "dong_y":
                # SRS-5.1zzzzzzz247 (bắn thử môi giới 28/10: "ok em đăng đi" → AI=dong_y trích_khớp=False hai lượt, tin lên trễ 3 lượt): AI đọc ra
                # đồng ý trễ một lượt thì trích tin cũ. Nhận khi cụm nằm trong một tin khách gửi SAU bản nháp 📋 đang chờ, và bản nháp đó CHƯA
                # được duyệt (`_duyet_ban`) — duyệt rồi thì trích cũ không duyệt lại.
                moc, sau_nhap = _tin_khach_sau_ban_nhap(conv)
                if moc is not None and conv.prop.fields.get("_duyet_ban") != moc and any(
                        _trich_dan_khop(plan.get("duyet_trich_dan"), c) for c in sau_nhap):
                    conv.duyet_luot = "dong_y"

        # Hỏi về gì / tự xưng gì (SRS-5.1zzzzzzz54): nhận khi cụm trích có thật trong lời khách — tin vừa nhắn (hỏi về), hoặc
        # một trong sáu lượt khách gần nhất (xưng hô giữ qua các lượt).
        conv.hoi_ve_luot = None
        h = plan.get("hoi_ve")
        if h in ("phi", "uy_tin", "link_web", "tinh_hinh_ban", "dinh_gia") and _trich_dan_khop(plan.get("hoi_ve_trich_dan"), cuoi):
            conv.hoi_ve_luot = h
        # SRS-5.1zzzzzzz245 (chat thử 28/10 "chú bán nhà ở 125 Bình Long…": log không có dòng "Xưng hô" nào, bot gọi "Anh" theo giới tính Zalo):
        # công cụ không ép enum nên AI có thể trả chữ ("chú", "cháu") thay mã — trước đây rơi im lặng. Chuẩn hoá ĐẦU RA AI (không đọc lời khách).
        x_tho = plan.get("xung_ho")
        x = _MA_XUNG_HO.get(_strip_accents(str(x_tho or "")).strip().lower().replace(" ", "_"))
        if x_tho and not x:
            log.warning("Xưng hô: AI trả giá trị ngoài danh sách %r", str(x_tho)[:20])
        if x in ("em", "anh", "chi", "chau", "chu_co_bac"):
            gan = [t.content for t in conv.history[-12:] if t.role == "user" and t.content][-6:]
            trich = plan.get("xung_ho_trich_dan")
            # SRS-5.1zzzzzzz91 (bắn thử KB2 20/10: "mình… em" rồi lượt sau "anh/chị"): cụm trích phải CHỨA chữ xưng đó (không chỉ có
            # thật trong lời khách), và ĐỔI cách xưng đã chốt thì cụm phải ở tin vừa nhắn — cụm cũ không lật được cách xưng.
            # SRS-5.1zzzzzzz212 (bắn thử 5 khách: "e tìm thuê", "a là MG", "sao hoi nhieu vay con" đều bị gọi "anh/chị"): khách Zalo gõ tắt e / a / c,
            # và người lớn tuổi không tự xưng mà GỌI bot là con / cháu — bản trước chỉ nhận chữ tự xưng đủ.
            # SRS-5.1zzzzzzz214: khách TỰ XƯNG "cháu" / "con" ("cháu muốn bán nhà") → bot xưng cô / chú theo tên trợ lý.
            chu = {"em": ("em", "e"), "anh": ("anh", "a"), "chi": ("chi", "c"), "chau": ("chau", "con"),
                   "chu_co_bac": ("chu", "co", "bac", "di", "cau", "thim", "ong", "ba", "con", "chau")}[x]
            # Chữ tắt một ký tự so trên chữ CÒN dấu: "ạ" bỏ dấu thành "a", "ê" thành "e" — so trên chữ bỏ dấu thì "dạ em gửi ạ" cũng thành "anh".
            hop = bool({c for c in chu if len(c) > 1} & set(re.findall(r"[a-z]+", _strip_accents(str(trich or "")).lower()))
                       or {c for c in chu if len(c) == 1} & set(re.findall(r"\w+", str(trich or "").lower())))
            cu = (conv.xung_ho or "").partition(":")[0]
            nguon = [cuoi] if (cu and cu != x) else gan
            if hop and any(_trich_dan_khop(trich, c) for c in nguon):
                # SRS-5.1zzzzzzz233 (chat chị Ngân 28/10: khách "chú bán nhà…", tin nhắc 5 phút mở "Anh ơi…"): nhóm "chu_co_bac" mất chữ khách
                # xưng nên câu mẫu không gọi đúng được — giữ kèm chữ đó ("chu_co_bac:chú"); chữ cũ còn nếu lần này không thấy chữ nào.
                lon = _chu_lon_tuoi(trich) if x == "chu_co_bac" else None
                giu = (conv.xung_ho or "").partition(":")[2] if cu == x else ""
                conv.xung_ho = f"{x}:{lon or giu}" if x == "chu_co_bac" and (lon or giu) else x
            log.warning("Xưng hô: AI=%s · nhận=%s · đang=%s", x, hop and any(_trich_dan_khop(trich, c) for c in nguon), conv.xung_ho)

        # SRS-5.1zzzzzzz212 (bắn thử 5 khách, cô T.: hệ thống chọn hỏi giá, model hỏi phường; sổ "lờ" chỉ ghi ô hệ thống chọn nên phường
        # bị hỏi lần 2, lần 3 như mới): ô mà lời bot lượt trước THẬT SỰ hỏi (AI đọc theo nghĩa) cũng tính vào cụm vừa hỏi để đếm lờ.
        bvh = plan.get("bot_vua_hoi")
        if isinstance(bvh, list):
            them = [o for o in bvh if isinstance(o, str) and o in FIELD_LABELS and o not in conv.cum_vua_hoi]
            if them:
                conv.cum_vua_hoi = list(conv.cum_vua_hoi) + them

        # Xin xem bản vẽ / hỏi dự án / tả dự án / xác nhận xoá (SRS-5.1zzzzzzz55): nhận khi cụm trích có trong tin vừa nhắn.
        conv.y_luot = {}
        if la_ngoai_viec:
            conv.y_luot["ngoai_viec"] = conv.so_luot_ngoai_viec   # SRS-5.1zzzzzzz177
        for k in ("xin_xem_ban_ve", "cau_hoi_du_an", "mo_ta_du_an"):
            if _trich_dan_khop(plan.get(k), cuoi):
                conv.y_luot[k] = True
        if conv.y_luot.get("xin_xem_ban_ve") and plan.get("ban_do_du_an") is True:
            conv.y_luot["ban_do_du_an"] = True
        # SRS-5.1zzzzzzz241 (chủ dự án 28/10, OPEN-59 a): khách muốn CÙNG căn vừa bán vừa cho thuê → mở thêm tin loại kia (hai tin, hai giá).
        if plan.get("ca_ban_ca_thue") is True and _trich_dan_khop(plan.get("ca_ban_ca_thue_trich_dan"), cuoi):
            loai = self._tach_tin_ban_thue(conv)
            if loai:
                conv.y_luot["tach_ban_thue"] = loai
        # Xin gặp người thật (SRS-5.1zzzzzzz82): giữ nguyên cụm trích để báo admin kèm lời khách.
        if _trich_dan_khop(plan.get("can_nguoi_that"), cuoi):
            conv.y_luot["can_nguoi_that"] = str(plan["can_nguoi_that"]).strip()
        # SRS-5.1zzzzzzz240 (chủ dự án 28/10, OPEN-21 a): người rao vừa tự nhận là chủ đầu tư → không báo con số phí, báo admin MỘT lần (lượt vai
        # đổi sang CĐT) để bộ phận hợp tác dự án liên hệ — lời "em đã báo" nhờ vậy là thật.
        if vua_thanh_cdt:
            conv.y_luot["cdt_bao_admin"] = True
            conv.y_luot.setdefault("can_nguoi_that", "Người rao tự nhận là CHỦ ĐẦU TƯ — phí theo thoả thuận riêng, nhờ admin / bộ phận hợp tác dự án liên hệ")
        # Hỏi pháp lý / thủ tục (SRS-5.1zzzzzzz176): khoá phải có trong kho (hoặc "khac"), câu hỏi phải nằm nguyên trong tin khách. Nhạy cảm
        # → báo admin cùng đường khách xin gặp người thật (server đọc `can_nguoi_that`).
        hp = plan.get("hoi_phap_ly")
        if isinstance(hp, str) and (hp in phap_ly.KHOA or hp == phap_ly.KHAC) and _trich_dan_khop(plan.get("phap_ly_trich_dan"), cuoi):
            conv.y_luot["hoi_phap_ly"] = hp
            if plan.get("phap_ly_nhay_cam") is True:
                conv.y_luot["phap_ly_nhay_cam"] = True
                conv.y_luot["can_nguoi_that"] = str(plan.get("phap_ly_trich_dan")).strip()
            elif self._dia_danh is not None:
                # SRS-5.1zzzzzzz231: nguyên văn điều luật gần nghĩa câu khách (kho dieu_luat) — kèm câu soạn sẵn, hoặc thay "chưa có" khi ngoài kho.
                conv.y_luot["dieu_luat"] = self._dia_danh.dieu_luat(cuoi)
        if h or hp:   # SRS-5.1zzzzzzz233: bắn thử 176 trượt mà log không cho biết AI đọc "phí" hay "pháp lý" — in khoá + kết quả kiểm trích
            log.warning("Hỏi về: hoi_ve=%s nhận=%s · hoi_phap_ly=%s nhận=%s%s", h, conv.hoi_ve_luot is not None, hp, "hoi_phap_ly" in conv.y_luot,
                     f" (trích pháp lý: {str(plan.get('phap_ly_trich_dan') or '')[:80]!r})" if _la_id_thu(conv.user_key) else "")
        # Thả tim (SRS-5.1zzzzzzz163): lời chào / lời đáp ngắn đồng ý do AI đọc theo nghĩa (cụm trích có trong tin vừa nhắn), hoặc khách vừa
        # duyệt bản nháp. Không dò từ khoá ở code.
        if plan.get("loi_xa_giao") in ("chao", "dong_y") and _trich_dan_khop(plan.get("loi_xa_giao_trich_dan"), cuoi):
            conv.y_luot["tha_tim"] = str(plan["loi_xa_giao"])
        if conv.duyet_luot == "dong_y":
            conv.y_luot["tha_tim"] = "duyet"
        # Khách chấm sao cho AI (SRS-5.1zzzzzzz104): AI đọc số sao theo nghĩa; nhận khi lời bot NGAY TRƯỚC là câu xin chấm sao (code
        # sinh, so chuỗi tất định) và cụm trích có trong tin vừa nhắn. Khách mua báo đã đủ thông tin căn: cụm trích trong tin vừa nhắn.
        bot_truoc = next((t.content for t in reversed(conv.history) if t.role == "assistant"), "")
        sao = doc_sao(plan.get("danh_gia_sao"))
        if sao and vua_xin_sao(bot_truoc) and _trich_dan_khop(plan.get("danh_gia_trich_dan"), cuoi):
            conv.y_luot["danh_gia"] = (sao, str(plan["danh_gia_trich_dan"]).strip())
        if _trich_dan_khop(plan.get("xong_viec_mua"), cuoi):
            conv.y_luot["xong_viec_mua"] = True
        # Căn nằm ngoài vùng nhận tin (SRS-5.1zzzzzzz86): AI đọc tỉnh / thành, code kiểm cụm địa danh có trong một trong sáu lượt
        # khách gần nhất (tỉnh có thể đã nói ở lượt trước). Cờ gắn lên căn SAU khi áp thao tác (căn mới có thể vừa được tạo).
        # Khách bảo đăng tin (SRS-5.1zzzzzzz86): AI đọc theo nghĩa, code kiểm cụm trích có trong tin vừa nhắn.
        if _trich_dan_khop(plan.get("xin_dang"), cuoi):
            conv.y_luot["xin_dang"] = str(plan["xin_dang"]).strip()
            # Bản nháp đã gửi mà khách bảo "rao tin này giúp mình" = đồng ý bản nháp (SRS-5.1zzzzzzz87) — trước đây xin_dang bị bỏ
            # khi đã trình bản nháp, duyet_ban_nhap thì trống, nên lời bảo đăng thành một vòng hỏi xác nhận nữa.
            if conv.listing_proposed and conv.duyet_luot is None and not la_sticker(cuoi):
                conv.duyet_luot = "dong_y"
        # SRS-5.1zzzzzzz218: khách dặn CÁCH VIẾT bản tin — AI đọc theo nghĩa, code giữ cụm nằm nguyên trong tin vừa nhắn.
        yc = plan.get("yeu_cau_viet")
        if isinstance(yc, list):
            # Cụm nằm nguyên trong tin, HOẶC mọi chữ của cụm đều có trong tin (AI hay rút gọn / đảo chữ: "đem lên tiêu đề nhấn mạnh"
            # từ "em lại đem lên trên tiêu đề nhấn mạnh") — bắn thử 27/10 (run 40447321762) sổ chỉ giữ 2/4 lời dặn.
            # và so không khoảng trắng: khách gõ "5 m", AI trích "5m" (run 40449155997 bỏ mất "mặt tiền 5 m xứng đáng để nói").
            lien = lambda t: re.sub(r"[^0-9a-z]", "", _strip_accents(str(t or "")).lower())
            giu = [str(x).strip() for x in yc if isinstance(x, str) and x.strip()
                   and (_trich_dan_khop(x, cuoi) or _chu_co_trong_loi_khach(x, [cuoi]) or (lien(x) and lien(x) in lien(cuoi)))]
            if len(giu) != len([x for x in yc if isinstance(x, str) and x.strip()]) or giu:
                log.warning("Yêu cầu viết: AI=%d giữ=%d", len([x for x in yc if isinstance(x, str) and x.strip()]), len(giu))   # chỉ số đếm
            if giu:
                conv.y_luot["yeu_cau_viet"] = list(dict.fromkeys(giu))
                if conv.duyet_luot == "dong_y":   # vừa dặn sửa thì chưa phải duyệt — lượt này rao lại bản sửa
                    conv.duyet_luot = "khong_dong_y"
        if conv.listing_proposed:
            # Một dòng mỗi lượt chờ duyệt (SRS-5.1zzzzzzz94): bắn thử 21/10 có hai lượt khách bảo đăng mà không thành duyệt, journal không
            # cho biết hụt ở AI (bỏ trống) hay ở code (cụm trích không khớp). Chỉ ghi tên / cờ, không ghi lời khách.
            log.warning("Duyệt: AI=%s trích_khớp=%s xin_đăng=%s → %s%s", y or "-", _trich_dan_khop(plan.get("duyet_trich_dan"), cuoi),
                        bool(conv.y_luot.get("xin_dang")), conv.duyet_luot or "-",
                        # SRS-5.1zzzzzzz247: cụm trích chỉ in với ID thử (CLAUDE.md §5) — để biết AI trích gì khi không khớp
                        f" (trích: {str(plan.get('duyet_trich_dan') or '')[:80]!r})" if _la_id_thu(conv.user_key) else "")
        if conv.duyet_luot == "dong_y":
            moc = _tin_khach_sau_ban_nhap(conv)[0]
            if moc is not None:
                conv.prop.fields["_duyet_ban"] = moc   # SRS-5.1zzzzzzz247: bản nháp này đã duyệt
        nv = str(plan.get("ngoai_vung") or "").strip()
        if conv.role != "buyer":
            # Một dòng mỗi lượt người bán (SRS-5.1zzzzzzz96, đo nhận vùng): chỉ cờ — không ghi tên tỉnh / lời khách.
            gan_nv = [t.content for t in conv.history[-12:] if t.role == "user" and t.content][-6:]
            log.warning("Vùng: AI=%s trích_khớp=%s trong_danh_sách=%s", bool(nv),
                        any(_trich_dan_khop(plan.get("ngoai_vung_trich_dan"), c) or _trich_dan_khop(nv, c) for c in gan_nv)
                        if nv else "-",
                        trong_vung_nhan_tin(nv) if nv else "-")
        if nv and trong_vung_nhan_tin(nv):   # SRS-5.1zzzzzzz96: AI báo "ngoài vùng" một tỉnh nằm TRONG danh sách → bỏ
            log.warning("Bỏ cờ ngoài vùng: tỉnh AI đọc nằm trong vùng nhận tin")
            nv = ""
        if nv and conv.role != "buyer":
            gan = [t.content for t in conv.history[-12:] if t.role == "user" and t.content][-6:]
            # Bằng chứng: cụm AI trích, HOẶC chính tên tỉnh AI đọc ra nằm trong lời khách (SRS-5.1zzzzzzz107) — tỉnh suy từ tên thành
            # phố ("Nha Trang" → Khánh Hòa) thì vẫn cần cụm trích.
            if any(_trich_dan_khop(plan.get("ngoai_vung_trich_dan"), c) or _trich_dan_khop(nv, c) for c in gan):
                conv.y_luot["ngoai_vung"] = nv
        if plan.get("xac_nhan_xoa") in ("dong_y", "tu_choi") and _trich_dan_khop(plan.get("xac_nhan_trich_dan"), cuoi):
            conv.y_luot["xac_nhan_xoa"] = plan["xac_nhan_xoa"]
        # Việc khách mua / người rao trả lời câu khách hỏi (SRS-5.1zzzzzzz70): nhận khi cụm trích có trong tin vừa nhắn.
        mua = plan.get("mua")
        if conv.role == "buyer" and isinstance(mua, dict) and mua:
            # SRS-5.1zzzzzzz232: mỗi việc kiểm căn cứ RIÊNG (`_loc_viec_mua`). Bản trước nhận / bỏ CẢ khối theo một `trich_dan` chung — bắn thử
            # ban-thu-ai 28/10: AI chép lại giờ hẹn của lượt trước vào trich_dan nên lượt chê căn / xin thôi báo / xin ảnh mất sạch.
            nhan = _loc_viec_mua(mua, cuoi, self._loi_khach_gan(conv))
            if nhan:
                conv.y_luot["mua"] = nhan
            bo = sorted(k for k, v in mua.items() if v not in (None, "", False, [], {}) and k not in nhan and not k.endswith("trich")
                        and k != "trich_dan")
            if bo:
                log.warning("Mua: bỏ việc %s — không có căn cứ trong lời khách%s", bo,
                            f" (trích: {str(mua.get('trich_dan') or '')[:80]!r})" if _la_id_thu(conv.user_key) else "")
        elif isinstance(mua, dict) and mua:
            log.warning("Mua: AI có đọc việc (hẹn=%s) nhưng bị bỏ — vai=%s trích_dẫn_khớp=%s", bool(mua.get("hen_xem")), conv.role,
                        _trich_dan_khop(mua.get("trich_dan"), cuoi))
        tl = plan.get("tra_loi_khach_hoi")
        if (isinstance(tl, dict) and tl.get("id") in {c.get("id") for c in conv.cau_hoi_cho}
                and _trich_dan_khop(tl.get("tra_loi"), cuoi)):
            conv.y_luot["tra_loi_khach_hoi"] = {"id": tl["id"], "tra_loi": str(tl["tra_loi"])}
        return plan

    @staticmethod
    def _loi_khach_gan(conv: Conversation, so_luot: int = 3) -> list[str]:
        """Lời KHÁCH ở `so_luot` lượt gần nhất (kể cả lượt vừa nhắn) — bằng chứng cho cụm ghép từ nhiều tin ngắn. Không tính lời bot."""
        return [t.content for t in conv.history if t.role == "user" and t.content][-so_luot:]

    @staticmethod
    def _ma_can_bot_vua_nhac(conv: Conversation) -> list[str]:
        """Mã căn trong link bot dán ở vài lượt gần nhất (mới nhất trước) — căn khách đang đáp lại."""
        from .anh_can import ma_can_trong_loi
        for t in reversed(conv.history[-6:]):
            if t.role == "assistant" and t.content:
                ma = ma_can_trong_loi(t.content)
                if ma:
                    return ma[:1]
        return []

    def _can_cua_chu(self, conv: Conversation) -> dict | None:
        """Giá rao của căn chủ nhà đang nói (SRS-5.1zzzzzzz233, đề xuất 28/10: chủ nhà hỏi thuế phí thì tính theo giá căn của mình như phía mua).
        Chỉ khi lượt này khách hỏi pháp lý; giá chữ đổi ra đồng bằng `parse_vnd` của DB (luật tiền một nguồn). Không giá / lỗi → None."""
        gia = str(conv.prop.fields.get("gia") or "").strip()
        doi = getattr(self._convstore, "_ngan_sach_vnd", None)
        if not conv.y_luot.get("hoi_phap_ly") or not gia or doi is None:
            return None
        try:
            v = doi(gia)
        except Exception as e:  # noqa: BLE001 — số tính sẵn là phần thêm
            log.warning("gia chu nha: %s", e)
            return None
        return {"price_vnd": v, "_ten": "căn của khách đang rao"} if v else None

    def _can_dang_noi(self, conv: Conversation, can: list[dict] | None = None) -> dict | None:
        """Căn khách mua đang nói tới (SRS-5.1zzzzzzz179 mục 3): mã trong link bot vừa dán → tìm trong `can` lượt này, không có thì tra kho; không mã → None."""
        ma = self._ma_can_bot_vua_nhac(conv)
        if not ma:
            return None
        for c in can or []:
            if str(c.get("code") or "").upper() == ma[0].upper():
                return c
        tra = getattr(self._convstore, "can_theo_ma", None)
        try:
            ds = tra(ma) if tra is not None else []
        except Exception as e:  # noqa: BLE001
            log.warning("can_dang_noi: %s", e)
            ds = []
        return ds[0] if ds else None

    def _khoi_hoi_du_an(self, conv: "Conversation") -> str:
        """Kho có ĐÚNG MỘT dự án cùng đường với căn mà khách chưa nói dự án khớp → bảo model hỏi xác nhận MỘT lần (SRS-5.1zzzzzzz181,
        chủ dự án 25/10: "nối project_id… có cần hỏi lại ko" → hỏi khi chưa chắc, gắn khi khách gật). Cờ `_goi_y_du_an` ghi tên đã hỏi
        (lưu cùng tin) nên không hỏi lại; chưa hết hỏi đường (`goi_y_duong`) thì để lượt sau — mỗi lượt một câu."""
        f = conv.prop.fields
        tra = getattr(self._convstore, "du_an_goi_y", None)
        if tra is None or conv.role == "buyer" or f.get("_goi_y_du_an") or not f.get("duong") or goi_y_duong(self._dia_danh, f):
            return ""
        try:
            with _do(conv, "du_an"):
                d = tra(f)
        except Exception as e:  # noqa: BLE001 — không hỏi lượt này, tin vẫn đi
            log.warning("du_an_goi_y lỗi: %s", e)
            return ""
        if not d or not d.get("name"):
            return ""
        f["_goi_y_du_an"] = str(d["name"])
        return (f'\n\nDỰ ÁN GỢI Ý (hệ thống tra kho dự án theo tên đường, KHÔNG phải khách nói): kho có dự án "{d["name"]}" ở cùng đường với căn '
                "này. Lượt này hỏi khéo xác nhận MỘT lần, thay cho câu hỏi kế (theo đúng cách xưng hô lượt này), dạng HỎI "
                f'("căn này thuộc dự án {d["name"]} đúng không ạ?"), KHÔNG khẳng định. Khách nói không hoặc lờ đi thì thôi, không hỏi lại.')

    @staticmethod
    def _khoi_du_an_da_hoi(conv: "Conversation") -> str:
        """Lượt SAU khi bot hỏi dự án gợi ý: dặn lượt AI lập thao tác ghi `du_an` khi khách xác nhận (đúng một lượt, rồi đóng cờ)."""
        f = conv.prop.fields
        cu = str(f.get("_goi_y_du_an") or "")
        if not cu or cu.endswith("|xong"):
            return ""
        f["_goi_y_du_an"] = cu + "|xong"
        return (f'BOT VỪA HỎI căn này có thuộc dự án "{cu}" không (kho gợi ý theo tên đường). Khách xác nhận đúng (vd "đúng rồi", "ừ", "phải") → ghi '
                f'du_an = "{cu}", cụm trích = lời xác nhận của khách; khách nói không hoặc nêu tên khác → ghi theo lời khách hoặc để trống; '
                "không nhắc tới → không ghi.\n")

    def _can_goi_y(self, conv: Conversation) -> list[dict]:
        """Căn gợi ý cho khách mua, bỏ căn khách đã chê (SRS-5.1zzzzzzz175) — MỘT cửa cho cả lượt lập thao tác lẫn lượt trả lời."""
        kho = self._convstore
        lay = getattr(kho, "can_khong_hop", None)
        return kho.can_phu_hop(conv.buyer_lead, loai_tru=lay(conv.user_key) if lay is not None else None)

    def _viec_mua(self, conv: Conversation, text: str) -> tuple[list[str], list[dict]]:
        """Ghi việc khách mua vừa nói (quan tâm / hẹn xem / hỏi chủ nhà) lên DB — chỉ khi mã căn có thật và đang hiện, cụm thời gian
        / câu hỏi có nguyên trong tin khách. Trả (câu tả việc đã ghi cho model, danh sách căn đưa vào lời đáp)."""
        kho = self._convstore
        # SRS-5.1zzzzzzz184: khách mua hỏi thông tin dự án → tra kho `projects` + kiến thức chủ dự án; tên dự án phải nằm nguyên trong tin khách.
        ten_da = str((conv.y_luot.get("mua") or {}).get("hoi_du_an") or "").strip()
        if ten_da and _trich_dan_khop(ten_da, text) and getattr(kho, "tra_du_an", None) is not None:
            try:
                with _do(conv, "du_an"):
                    nghia = getattr(self._dia_danh, "du_an_theo_nghia", None)
                    conv.y_luot["du_an_mua"] = kho.tra_du_an(ten_da, theo_nghia=nghia) if nghia else kho.tra_du_an(ten_da)
            except Exception as e:  # noqa: BLE001 — không có khối dự án thì bot không có dữ kiện, nhưng lượt vẫn đi
                log.warning("tra_du_an lỗi: %s", e)
        mua0 = conv.y_luot.get("mua") or {}
        # SRS-5.1zzzzzzz250 (chủ dự án 28/10: mục 3 "có địa chỉ hết rồi mà"): "quận X có dự án gì" → dự án trong kho chung theo khu.
        khu = str(mua0.get("du_an_khu_vuc") or "").strip()
        if khu and _trich_dan_khop(khu, text) and getattr(kho, "du_an_theo_khu", None) is not None:
            chuan = str(mua0.get("du_an_khu_vuc_chuan") or "").strip() or khu
            conv.y_luot["du_an_khu"] = {"khu": chuan, "ds": kho.du_an_theo_khu(chuan)}
        # SRS-5.1zzzzzzz250 (mục 4 + 7): khách tìm căn / xin bảng căn còn bán TRONG một dự án → căn đang rao nối project_id của dự án đó.
        ten_tim = str(mua0.get("tim_du_an") or "").strip()
        can_da: list[dict] = []
        if ten_tim and _trich_dan_khop(ten_tim, text) and getattr(kho, "tra_du_an", None) is not None:
            kq = kho.tra_du_an(ten_tim)
            if kq.get("khop") in ("ro", "gan") and isinstance(kq.get("du_an"), dict) and getattr(kho, "can_trong_du_an", None) is not None:
                thue = getattr(conv.buyer_lead, "loai_giao_dich", "mua") == "thue"
                can_da = kho.can_trong_du_an(str(kq["du_an"].get("id") or ""), thue=thue)
                if conv.buyer_lead is not None:   # nhớ qua lượt: câu hỏi sau về "dự án đó" đi tới chủ nhà trong dự án (mục 7)
                    conv.buyer_lead.fields["_du_an_id"] = str(kq["du_an"].get("id") or "")
                    conv.buyer_lead.fields["_du_an_ten"] = str(kq["du_an"].get("name") or "")
            conv.y_luot["can_du_an"] = {**kq, "can": can_da}
        if getattr(kho, "khach_mua", None) is None:
            return [], []
        lead = conv.buyer_lead
        nhu_cau = {k: v for k, v in vars(lead).items()
                   if k in ("loai_giao_dich", "loai_bds", "ngan_sach", "khu_vuc", "so_phong_ngu", "yeu_cau_xe_hoi", "huong",
                            "muc_dich", "tien_do_mua", "vay_ngan_hang") and v} if lead else {}
        if lead:   # 7 câu tư vấn (SRS-5.1zzzzzzz116) nằm ở lead.fields — không phải thuộc tính riêng
            nhu_cau.update({k: lead.fields[k] for k in O_TU_VAN_MUA if lead.fields.get(k) and k not in nhu_cau})
        bid = kho.khach_mua(conv.user_key, None, nhu_cau or None)
        mua = conv.y_luot.get("mua") or {}
        ma = [m for m in (mua.get("ma_can") or []) if isinstance(m, str) and m.strip()]
        if not ma and (mua.get("hen_xem") or mua.get("quan_tam") is True or mua.get("hoi_chu_nha") or mua.get("xin_anh") is True
                       or mua.get("khong_hop") is True):
            # SRS-5.1zzzzzzz153: khách đáp lại căn bot VỪA giới thiệu (tin báo căn mới / lời gợi ý có link) mà không gõ mã — lấy mã từ link trong
            # lời bot gần nhất. Bản trước chỉ nhận mã AI đọc ra, nên "xem thử thứ 7 được không" sau tin báo căn mới không ghi được lịch.
            ma = self._ma_can_bot_vua_nhac(conv)
        nhac = kho.can_theo_ma(ma) if ma else []
        co_san = can_da + [c for c in (conv.can_mua or self._can_goi_y(conv)) if c.get("id") not in {d.get("id") for d in can_da}]
        can = nhac + [c for c in co_san if c.get("id") not in {n.get("id") for n in nhac}]
        viec: list[str] = []
        # SRS-5.1zzzzzzz262 (bắn thử SRD 28/10: khách hỏi "nhà hẻm xe hơi đường Trần Bình Trọng quận 5 giá 10 tỷ còn không" — căn đó chưa lên web,
        # bot đáp "em có căn này hợp với anh" rồi kể một căn KHÁC): khách tả đúng MỘT căn đã thấy mà không có mã → lời đáp phải đối chiếu; không
        # khớp thì nói thẳng trước rồi mới gợi căn khác. Ý "căn cụ thể" do AI đọc, code chỉ kiểm cụm trích có trong lời khách.
        # Cùng lớp (SRS-5.1zzzzzzz264): khách GÕ một mã căn không có căn nào đang hiện (đã bán / ẩn / gõ nhầm) → nói thẳng, không lờ đi rồi gợi căn khác.
        co_ma = {str(c.get(k) or "").upper() for c in nhac for k in ("code", "legacy_code")}
        ma_go = [m.strip().lstrip("#").upper() for m in (mua.get("ma_can") or []) if isinstance(m, str) and m.strip()]
        ma_khong_co = [m for m in ma_go if m and m in text.upper() and m not in co_ma]
        if ma_khong_co:
            viec.append(f"khách gõ mã căn {', '.join('#' + m for m in ma_khong_co)} nhưng hệ thống KHÔNG có căn đang rao nào mang mã đó (có thể đã "
                        "bán, tạm ẩn hoặc gõ nhầm): câu ĐẦU nói thẳng em chưa thấy căn mã đó, nhờ khách kiểm lại mã hoặc gửi link tin; có căn khác hợp "
                        "nhu cầu thì giới thiệu SAU và nói rõ đó là căn KHÁC")
        cu_the = str(mua.get("can_cu_the") or "").strip()
        if cu_the and not nhac and not ma_khong_co and _trich_dan_khop(cu_the, text):
            viec.append(f"khách hỏi đúng MỘT căn cụ thể đã thấy ở đâu đó (\"{cu_the}\") mà không có mã: đối chiếu với các căn em đang có — KHÔNG "
                        "căn nào khớp đúng căn khách tả (cùng đường VÀ cùng giá / diện tích) thì câu ĐẦU nói thẳng em chưa thấy đúng căn đó trên hệ "
                        "thống (có thể đã bán hoặc chưa đăng), rồi mới giới thiệu căn gần nhất và nói rõ đó là căn KHÁC; KHÔNG nói \"em có căn này\" "
                        "như thể đúng căn khách hỏi")
        # SRS-5.1zzzzzzz175: khách bảo đừng báo căn mới nữa / xin báo lại — cờ `buyers.bao_can_moi`, vòng `bao_can_moi` đọc.
        if bid and mua.get("ngung_bao") in ("tat", "bat") and kho.ngung_bao_can(bid, mua["ngung_bao"] == "tat"):
            viec.append("khách KHÔNG muốn nhận tin tự động báo căn mới: hệ thống ĐÃ TẮT — nói ngắn là em không gửi tin báo căn nữa, khách cần "
                        "thì nhắn em bất cứ lúc nào; KHÔNG hỏi lý do, KHÔNG nài" if mua["ngung_bao"] == "tat" else
                        "khách xin được báo khi có căn mới: hệ thống ĐÃ BẬT — nói ngắn có căn hợp nhu cầu em nhắn liền (trong giờ 8–20h)")
        # SRS-5.1zzzzzzz175: khách chê căn → ghi `interests` khong_hop + lý do nguyên văn; không gợi / không báo lại căn đó.
        khong_hop = mua.get("khong_hop") is True
        if khong_hop:
            if not nhac:
                viec.append("khách chê một căn nhưng chưa rõ căn nào: hỏi lại MỘT câu ngắn xem căn nào không hợp (câu hỏi DUY NHẤT của lượt), KHÔNG giới thiệu căn mới")
            elif bid:
                ly_do = str(mua.get("ly_do") or "").strip()
                ly_do = ly_do if _trich_dan_khop(ly_do, text) else ""
                if kho.ghi_khong_hop(bid, nhac, ly_do, conv.user_key):
                    bo = {c.get("id") for c in nhac}
                    can = [c for c in can if c.get("id") not in bo]
                    viec.append("ghi căn " + ", ".join(f"#{c.get('code')}" for c in nhac) + " KHÔNG HỢP với khách"
                                + (f" (lý do khách nói: \"{ly_do}\")" if ly_do else "")
                                + ": hệ thống sẽ không gợi / không báo lại căn đó. Nói ngắn đã ghi nhận, KHÔNG thuyết phục lại; có căn khác trong "
                                "CĂN ĐANG RAO thì giới thiệu căn kế, không thì hỏi MỘT câu khách muốn khác đi điểm nào (câu hỏi DUY NHẤT của lượt)")
        # SRS-5.1zzzzzzz148 (chủ dự án 23/10: lúc hẹn xem thì lấy được số điện thoại khách): số CHỈ được ghi vào lịch hẹn đang chờ chưa có số,
        # lấy từ lời khách (số là dữ liệu có khuôn, không phải đoán ý); không có lịch chờ thì số khách gõ không được lưu.
        sdt = tim_sdt(text)
        if bid and sdt and kho.ghi_sdt_hen_xem(bid, sdt):
            viec.append("ghi số điện thoại khách vào lịch hẹn để người phụ trách gọi xác nhận (cảm ơn ngắn, KHÔNG đọc lại số; nhắc khách "
                        "\"chú ý điện thoại\", KHÔNG dùng chữ \"máy\")")
        elif bid and lead is not None and lead.fields.get("_da_xin_sdt") and giong_sdt_sai(text):
            # SRS-5.1zzzzzzz161: bot đã xin số mà khách gõ dãy giống số điện thoại nhưng sai độ dài / đầu số — không ghi, không cảm ơn như đã nhận.
            viec.append("số điện thoại khách vừa gõ KHÔNG đúng (số điện thoại di động VN gồm đúng 10 chữ số và bắt đầu bằng số 0, số khách gõ đang thiếu hoặc thừa chữ số) nên em CHƯA ghi được: "
                        "KHÔNG cảm ơn, KHÔNG nói đã nhận / đã ghi số, KHÔNG hứa người phụ trách sẽ gọi; nói nhẹ số chưa đủ và xin khách gõ lại "
                        "lại cho đúng (một câu ngắn, nhắc nhẹ cấu trúc: 10 số, bắt đầu bằng 0)")
        # Một dòng mỗi lượt khách mua có ý hẹn / quan tâm (SRS-5.1zzzzzzz153, bắn thử 23/10 `ban-thu-vm` hụt lịch mà journal không nói hụt ở
        # AI đọc ra, ở mã căn hay ở ghi DB): chỉ cờ — không ghi lời khách.
        if mua:
            log.warning("Mua: AI hẹn=%s quan_tâm=%s mã_AI=%d mã_link=%s căn_khớp=%d khách_id=%s", bool(mua.get("hen_xem")),
                        mua.get("quan_tam") is True, len([m for m in (mua.get("ma_can") or []) if isinstance(m, str)]),
                        bool(self._ma_can_bot_vua_nhac(conv)), len(nhac), bool(bid))
        # SRS-5.1zzzzzzz169: khách xin ảnh (kể cả xin lại trong 24 giờ) → server gửi ảnh qua `xin_anh`; bản trước chỉ gửi khi lời bot có link và
        # chặn 24 giờ, nên khách xin lại thì bot chỉ nhắc "ảnh em gửi ở trên".
        if mua.get("xin_anh") is True:
            if not nhac:
                viec.append("khách xin xem ảnh nhưng chưa rõ căn nào: hỏi lại MỘT câu ngắn xem khách muốn xem ảnh căn nào (câu hỏi DUY NHẤT của lượt), KHÔNG hứa gửi ảnh")
            else:
                co_anh = [c for c in nhac if c.get("code") and c.get("_so_anh") != 0]
                # SRS-5.1zzzzzzz232 (chủ dự án 28/10: "nói thật, không gửi lại", "có thể xin thêm ảnh"): căn đã gửi đủ mọi ảnh thì không gửi lại —
                # bot nói thật căn có N ảnh, em đã gửi đủ, và hỏi khách có muốn em xin chủ nhà thêm ảnh không.
                het = [c for c in co_anh if da_gui_het(conv.user_key, str(c["code"]), c.get("_so_anh"))]
                con = [c for c in co_anh if c not in het]
                if con:
                    conv.y_luot["xin_anh"] = [str(c["code"]) for c in con]
                    viec.append("hệ thống gửi ảnh " + ", ".join(f"#{c['code']}" for c in con) + " NGAY SAU tin này: nói ngắn là em gửi ảnh "
                                "(KHÔNG dán lại link, KHÔNG nói \"đã gửi ở trên\" hay \"ảnh ở trên\")")
                # SRS-5.1zzzzzzz254 (chủ dự án 28/10: "em xin chủ nhà ảnh … cái này cần thiết"): hết ảnh / chưa có ảnh → nhờ chủ nhà gửi thêm
                # NGAY (đường `info_requests`, chủ nhà gửi ảnh thì lõi báo lại khách) — không hỏi khách "có muốn em xin không".
                for c in het:
                    xin = bool(bid and kho.xin_them_anh(bid, c))
                    viec.append(f"căn #{c['code']} chỉ có {c['_so_anh']} ảnh và em ĐÃ gửi đủ cả {c['_so_anh']} ảnh ở trên — lượt này KHÔNG có ảnh nào "
                                "gửi kèm: nói thật như vậy, KHÔNG nói đang gửi / gửi lại / \"kéo lên xem ảnh em vừa gửi\"; "
                                + ("em ĐÃ nhắn chủ nhà xin thêm ảnh — nói ngắn có ảnh mới em báo khách ngay, KHÔNG hỏi thêm về ảnh" if xin
                                   else "KHÔNG hứa xin thêm ảnh"))
                if not co_anh:
                    xin = any([bid and c.get("id") and kho.xin_them_anh(bid, c) for c in nhac if c.get("_so_anh") == 0])
                    viec.append("căn khách xin ảnh CHƯA có ảnh nào trên hệ thống: nói thật là chưa có, KHÔNG hứa gửi ảnh ngay; "
                                + ("em ĐÃ nhắn chủ nhà xin ảnh — nói ngắn có ảnh em báo khách ngay (khách muốn thì vẫn hẹn xem trực tiếp được)" if xin
                                   else "khách muốn thì hẹn xem trực tiếp, KHÔNG nói em đã xin chủ nhà"))
        hoi_da = str(mua.get("hoi_chu_nha") or "").strip()
        if bid and not nhac and hoi_da and (_trich_dan_khop(hoi_da, text) or any(_trich_dan_khop(hoi_da, t) for t in self._loi_khach_gan(conv))):
            # SRS-5.1zzzzzzz250 (chủ dự án 28/10 mục 7: "hỏi chủ nhà có căn hoặc nhà đang rao bán gắn với địa chỉ này trước, nếu ko có nữa thì
            # hỏi admin"): câu về một DỰ ÁN (tầng, căn còn lại…) mà khách không chỉ căn nào → hỏi chủ nhà của một căn đang rao trong dự án đó
            # (đường `info_requests` sẵn có: chủ nhà 12 giờ, quá hạn sang admin); dự án chưa có căn nào → báo admin một lần (hạn 5 giờ).
            pid = str((conv.buyer_lead.fields if conv.buyer_lead else {}).get("_du_an_id") or "")
            ten = str((conv.buyer_lead.fields if conv.buyer_lead else {}).get("_du_an_ten") or "")
            if pid:
                trong = can_da or (kho.can_trong_du_an(pid) if getattr(kho, "can_trong_du_an", None) is not None else [])
                if trong and kho.ghi_hoi_chu_nha(bid, trong[0], hoi_da):
                    viec.append(f"chuyển câu \"{hoi_da}\" về dự án {ten} cho chủ nhà có căn #{trong[0].get('code')} trong dự án — có trả lời em "
                                "báo lại khách ngay")
                elif not trong and conv.buyer_lead is not None and conv.buyer_lead.fields.get("_da_bao_admin_du_an") != hoi_da:
                    conv.buyer_lead.fields["_da_bao_admin_du_an"] = hoi_da
                    conv.y_luot["can_nguoi_that"] = f"Khách mua hỏi về dự án {ten}: \"{hoi_da[:200]}\" — kho chưa có căn đang rao trong dự án để hỏi chủ nhà, nhờ admin trả lời"
                    conv.y_luot["bao_admin_he_thong"] = True
                    viec.append(f"dự án {ten} chưa có căn đang rao để hỏi chủ nhà: em ĐÃ chuyển câu \"{hoi_da}\" cho bộ phận phụ trách — nói ngắn "
                                "em hỏi lại rồi báo khách, KHÔNG đoán câu trả lời")
        if not (bid and nhac):
            conv.y_luot["lich_cho"] = self._lich_cho(kho, bid)
            return viec, can[:4]
        dau = nhac[0]
        hen = str(mua.get("hen_xem") or "").strip()
        hoi = str(mua.get("hoi_chu_nha") or "").strip()
        # Giờ hẹn khách hay nhắn rời từng tin ("thứ 7" / "sáng nhé" / "9h"): nhận khi nằm nguyên trong tin này HOẶC mọi chữ của cụm có trong
        # vài tin khách gần nhất (SRS-5.1zzzzzzz153).
        hen = hen if (_trich_dan_khop(hen, text) or _chu_co_trong_loi_khach(hen, self._loi_khach_gan(conv))) else ""
        # SRS-5.1zzzzzzz212: khách gật "ừ hỏi giúp" sau khi bot hỏi có muốn hỏi chủ không — câu hỏi nằm ở tin khách trước đó.
        hoi = hoi if (_trich_dan_khop(hoi, text) or any(_trich_dan_khop(hoi, t) for t in self._loi_khach_gan(conv))) else ""
        if not khong_hop and (mua.get("quan_tam") is True or hen or hoi) and kho.ghi_quan_tam(bid, [c["code"] for c in nhac if c.get("code")]):
            viec.append("ghi khách quan tâm căn " + ", ".join(f"#{c.get('code')}" for c in nhac))
        if hen and kho.ghi_hen_xem(bid, dau, hen):
            viec.append(f"ghi lịch hẹn xem #{dau.get('code')} ({hen}) — chờ xác nhận với chủ nhà rồi báo lại khách")
            if lead is not None and not lead.fields.get("_da_xin_sdt") and not sdt:
                # Xin số MỘT lần (cờ ở hồ sơ nhu cầu, qua khởi động lại vẫn nhớ); khách không muốn thì thôi, không ép, không hứa gì thêm.
                lead.fields["_da_xin_sdt"] = "1"
                viec.append("xin khách MỘT số điện thoại để người phụ trách gọi xác nhận lịch (một câu ngắn — câu hỏi DUY NHẤT của lượt, lượt này chưa hỏi xác nhận lịch; khách không muốn để thì thôi, đừng nài)")
        if hoi and kho.ghi_hoi_chu_nha(bid, dau, hoi):
            viec.append(f"chuyển câu \"{hoi}\" về #{dau.get('code')} cho chủ nhà — có trả lời em báo lại khách ngay")
        conv.y_luot["lich_cho"] = self._lich_cho(kho, bid)
        return viec, can[:4]

    @staticmethod
    def _lich_cho(kho, bid) -> list[dict]:
        """Lịch hẹn xem khách đang chờ xác nhận (đã ghi DB) — đưa vào lời đáp để bot không hỏi lại / tự thêm ngày (SRS-5.1zzzzzzz157)."""
        lay = getattr(kho, "lich_dang_cho", None)
        return lay(bid) if lay is not None and bid else []

    def _go_ma_can_dang_hien(self, conv: Conversation) -> bool:
        """Tin khách vừa nhắn có mã tin dạng "#XXXXXXXX" của một căn ĐANG HIỆN trên hệ thống (`KhoNguoiMua.can_theo_ma`) — SRS-5.1zzzzzzz273.
        Kho không có / lỗi → False."""
        tra = getattr(self._convstore, "can_theo_ma", None)
        cuoi = next((t.content for t in reversed(conv.history) if t.role == "user"), "")
        ma = [m.upper() for m in re.findall(r"#([0-9A-Za-z][0-9A-Za-z-]{3,19})", cuoi or "")]
        if tra is None or not ma:
            return False
        try:
            return bool(tra(ma))
        except Exception as e:  # noqa: BLE001
            log.warning("can_theo_ma lỗi: %s", e)
            return False

    def _ap_dung_ke_hoach(self, conv: Conversation, plan: dict) -> tuple[list[str], list[tuple]]:
        changed: set[str] = set()
        receipts: list[tuple] = []
        ops = [op for op in (plan.get("operations") or []) if isinstance(op, dict)]
        safe = [op for op in ops if op.get("op") not in _DESTRUCTIVE_OPS]
        destructive = [op for op in ops if op.get("op") in _DESTRUCTIVE_OPS]
        for op in safe:  # updates/adds/status apply immediately — they don't lose data
            self._apply_operation(conv, op, changed, receipts)
        # DESTRUCTIVE ops (clear / bỏ / chỉ giữ) do NOT apply on first read — a misread or garbled
        # message must never silently wipe the rổ. Hold them for an explicit CONFIRM (handled at
        # the top of handle()). Skip the gate only when there's nothing real to lose.
        if destructive and self._basket_size(conv) > 0:
            conv.pending_destructive = destructive
            receipts.append(("confirm_destructive", self._describe_destructive(conv, destructive)))
        else:
            for op in destructive:
                self._apply_operation(conv, op, changed, receipts)
        return sorted(changed), receipts

    def _describe_destructive(self, conv: Conversation, ops: list[dict]) -> str:
        """A short description of what the pending unlist op(s) WOULD do, for the confirmation
        question — so a misread ('ẩn hết 5 căn?') is obvious. NB: this NEVER deletes data; it
        moves listings to 'không rao' (hidden but kept), reversible by rao-ing again."""
        n = self._basket_size(conv)
        for op in ops:
            if op.get("op") == "clear":
                return f"NGƯNG RAO (ẩn) toàn bộ {n} căn — dữ liệu vẫn giữ, rao lại được bất cứ lúc nào"
            if op.get("op") == "keep_only":
                keep = ", ".join(self._op_targets(op)) or "(không rõ)"
                return f"chỉ GIỮ RAO căn {keep}, NGƯNG RAO (ẩn) các căn còn lại (dữ liệu vẫn giữ)"
            if op.get("op") == "remove":
                drop = ", ".join(self._op_targets(op)) or "(không rõ)"
                return f"NGƯNG RAO (ẩn) căn {drop} — dữ liệu vẫn giữ, rao lại được"
        return "đổi trạng thái rao của rổ hàng"

    def _apply_pending_destructive(self, conv: Conversation) -> tuple[list[str], list[tuple]]:
        """Apply the destructive op(s) the seller just CONFIRMED, then clear the pending state."""
        changed: set[str] = set()
        receipts: list[tuple] = []
        for op in conv.pending_destructive:
            self._apply_operation(conv, op, changed, receipts)
        conv.pending_destructive = []
        return sorted(changed), receipts

    @staticmethod
    def _plan_window(conv: Conversation) -> list[Message]:
        """The turns to plan from: everything AFTER the previous user turn — i.e. the latest
        user message plus the bot's turn(s) right before it (so a confirmation like 'nó đó em'
        resolves against the căn the bot just proposed), but NOT earlier user actions."""
        user_idxs = [i for i, t in enumerate(conv.history) if t.role == "user"]
        start = (user_idxs[-2] + 1) if len(user_idxs) >= 2 else 0
        return [Message(t.role, t.content) for t in conv.history[start:]]

    @staticmethod
    def _nho_yeu_cau_viet(prop: "Property", moi: list[str]) -> None:
        """Cộng dồn lời dặn cách viết vào ô hệ thống `_yeu_cau_viet` (" | ", mới nhất cuối, giữ `YEU_CAU_VIET_TOI_DA` dòng) — SRS-5.1zzzzzzz218."""
        ds = [x for x in (prop.fields.get("_yeu_cau_viet") or "").split(" | ") if x.strip()]
        for x in moi:
            if x and x not in ds:
                ds.append(x)
        prop.fields["_yeu_cau_viet"] = " | ".join(ds[-YEU_CAU_VIET_TOI_DA:])

    @staticmethod
    def _gia_tri_ghi(conv: "Conversation", k: str, v: str, bang_chung: dict) -> str | None:
        """Giá trị được ghi vào ô, hoặc None = bỏ. Ô tin chỉ ghi điều KHÁCH nói (SRS-5.1zzzzzzz73): giá trị đã có sẵn ở rổ thì
        giữ; mới / đổi thì cụm bằng chứng AI đưa phải nằm nguyên trong lời khách. Bắt lớp lỗi "AI ghi ô từ câu bot tự hỏi / tự
        suy" (19/10: bot hỏi "có để thương lượng nhẹ không", khách trả lời chuyện khác, ô thuong_luong vẫn thành "thương lượng
        nhẹ" rồi lên tin). SRS-5.1zzzzzzz86: cụm trích đúng mà GIÁ TRỊ thêm điều khách không nói (`_gia_tri_chong_do`) → ghi
        chính cụm khách nói, không ghi lời AI suy."""
        if k in _O_PHAN_LOAI:
            # Phân loại AI đọc theo nghĩa ("nhà phố" → nha_pho), không phải lời trích — lần ĐẦU ghi thẳng. ĐỔI loại đã chốt thì cụm
            # bằng chứng phải nằm trong tin khách VỪA nhắn (SRS-5.1zzzzzzz92): chat tester 20/10 loại lật phòng trọ ↔ nhà phố giữa các
            # lượt (khách chỉ kể "1 trệt 1 lầu 2pn"), bộ ô hỏi đổi theo, bộ đếm "lờ 2 lần" đếm sai, một câu bị hỏi 3 lần.
            cu = conv.prop.loai_hinh if k == "loai_hinh" else conv.prop.fields.get(k)
            if cu and cu != v:
                cuoi = next((t.content for t in reversed(conv.history) if t.role == "user"), "")
                bc = bang_chung.get(k) if isinstance(bang_chung.get(k), str) else None
                if not _trich_dan_khop(bc, cuoi):
                    log.warning("Giữ loại BĐS đã chốt: đổi loại cần cụm khách nói ở tin vừa nhắn")
                    conv.bo_luot.append((k, v, bc, "đã chốt loại khác; đổi loại cần cụm khách nói ở tin vừa nhắn"))
                    return None
            return v
        if any(li.prop.fields.get(k) == v for li in conv.listings):
            return v
        loi = conv.loi_khach_luot
        hinh_thuc = _gia_tri_la_cau(k, v, next((t.content for t in reversed(conv.history) if t.role == "user"), ""))
        if hinh_thuc:   # SRS-5.1zzzzzzz218: "Em cho dùm anh 2-3 cái hình tượng trong bản tin đi" từng thành ô hinh_anh
            log.warning("Bỏ ô %s: %s", k, hinh_thuc)
            conv.bo_luot.append((k, v, bang_chung.get(k) if isinstance(bang_chung.get(k), str) else None, hinh_thuc))
            return None
        bc = bang_chung.get(k) if isinstance(bang_chung.get(k), str) else None
        # Bằng chứng = cụm AI trích; model không phải lượt nào cũng trích (bắn thử 19/10: bỏ mất "diện tích sàn 170m²") nên
        # thiếu cụm thì kiểm chính giá trị ô — vẫn phải nằm trong lời KHÁCH, nên câu bot tự hỏi không lọt.
        co_bc = any(_trich_dan_khop(x, loi) or (k in _O_SO_DO and _so_khop(x, v, loi)) for x in (bc, v))
        if co_bc and (k in _O_GHEP or _trich_dan_khop(v, loi) or _gia_tri_chong_do(k, v, loi)):
            return v
        if co_bc and bc and _trich_dan_khop(bc, loi) and (k not in _O_SO_DO or _so_khop(bc, bc, loi)):
            log.warning("Ô %s: giá trị AI có ý khách không nói — ghi nguyên cụm khách", k)   # không in giá trị (dữ liệu khách)
            return bc.strip()
        log.warning("Bỏ ô %s: không có bằng chứng trong lời khách", k)
        conv.bo_luot.append((k, v, bc, "không có bằng chứng — cụm AI trích và giá trị đều không nằm trong lời khách"))
        return None

    @staticmethod
    def _co_cum_can_khac(conv: "Conversation", trich) -> bool:
        """Cụm AI trích cho thấy khách nói một căn KHÁC căn đang khai có nằm nguyên trong lời khách lượt này không (SRS-5.1zzzzzzz268)."""
        if not (isinstance(trich, str) and trich.strip()):
            return False
        cuoi = next((t.content for t in reversed(conv.history) if t.role == "user"), "")
        return _trich_dan_khop(trich, cuoi) or _trich_dan_khop(trich, conv.loi_khach_luot)

    def _duong_chu_khach(self, conv: "Conversation", v: str) -> str:
        """SRS-5.1zzzzzzz273 (bắn thử ban-thu-kiem J 29/10): khách gõ "ma lo", AI ghi ô duong "Mã Lò" — tự thêm dấu nên luật "khách gõ đúng dấu
        thì nhận" (SRS-270) bắt nhầm, bot không hỏi Mã Lò hay Mã Lộ. Chữ khách gõ khớp NHIỀU đường trong kho thì ô giữ đúng chữ khách gõ; khách
        chọn rồi (gõ đúng dấu / nói quận) mới thành tên kho. Không nhập nhằng → giữ giá trị AI (bước chuẩn hoá theo kho lo dấu)."""
        if self._dia_danh is None or not hasattr(self._dia_danh, "ung_vien_duong"):
            return v
        loi = unicodedata.normalize("NFC", conv.loi_khach_luot or "")
        kd, vk = bo_dau(loi), bo_dau(v).strip()
        i = kd.find(vk) if vk and len(kd) == len(loi) else -1
        if i < 0:
            return v
        goc = loi[i:i + len(vk)]
        if goc.lower() == v.lower():
            return v
        try:
            nhap_nhang = bool(self._dia_danh.ung_vien_duong(goc, conv.prop.fields.get("quan")))
        except Exception as e:  # noqa: BLE001
            log.warning("ung_vien_duong lỗi: %s", e)
            return v
        if nhap_nhang:
            log.warning("Ô duong: giữ chữ khách gõ (tên khớp nhiều đường), không nhận dấu AI tự thêm")
        return goc if nhap_nhang else v

    def _loc_o_tin(self, conv: "Conversation", fields: dict, bang_chung: dict | None = None) -> dict[str, str]:
        """MỘT cổng cho mọi đường AI ghi ô tin từ lời chat (lượt lập thao tác, đọc lại căn mới tách ra) — SRS-5.1zzzzzzz73/86."""
        bc = bang_chung if isinstance(bang_chung, dict) else {}
        out: dict[str, str] = {}
        uu_the = self._loc_uu_the(conv, (fields or {}).get("uu_the"))
        for k, v in (fields or {}).items():
            if k != "uu_the" and isinstance(v, str) and v.strip():
                g = self._gia_tri_ghi(conv, k, v, bc)
                if g and k == "duong":
                    g = self._duong_chu_khach(conv, g)
                if g:
                    out[k] = g
                    if isinstance(bc.get(k), str) and bc[k].strip():
                        conv.bc_luot[k] = bc[k].strip()   # cụm khách nói làm căn cứ — tin phụ chế độ test trích lại
        out = self._mot_cum_mot_o(conv, out)
        if uu_the:
            out["uu_the"] = uu_the
        return out

    @staticmethod
    def _loc_uu_the(conv: "Conversation", raw) -> str:
        """Ô `uu_the` (SRS-5.1zzzzzzz205): AI trả MẢNG cụm ngắn khách tự nói; chỉ giữ cụm nằm NGUYÊN trong lời khách lượt này (cùng cổng bằng
        chứng của mọi ô, `_trich_dan_khop`), nối bằng " · ". Cụm AI tự suy bị bỏ và ghi sổ `bo_luot`."""
        ds = raw if isinstance(raw, list) else ([raw] if isinstance(raw, str) else [])
        giu: list[str] = []
        for x in ds:
            if not (isinstance(x, str) and x.strip()):
                continue
            if _trich_dan_khop(x, conv.loi_khach_luot):
                giu.append(x.strip())
            else:
                log.warning("Bỏ cụm ưu thế: không nằm trong lời khách")
                conv.bo_luot.append(("uu_the", x, None, "cụm ưu thế không nằm nguyên trong lời khách"))
        return " · ".join(dict.fromkeys(giu))

    @staticmethod
    def _mot_cum_mot_o(conv: "Conversation", out: dict[str, str]) -> dict[str, str]:
        """Ô tin không tự mâu thuẫn (SRS-5.1zzzzzzz87, chat chị N. 20/10). Không đọc ý — chỉ so chữ / số đã ghi:
        (1) cùng một giá trị (≥ 2 từ) vào hai ô → giữ ô đứng trước trong bộ ô của loại BĐS (schema), bỏ ô kia: "Garege trong nhà" vào
        cả `tien_ich_phong` lẫn `dien_tich_trang_thiet_bi`, "SHR Hoàn Công Đầy Đủ" vào cả `phap_ly` lẫn `phap_ly_hoan_cong`;
        (2) bề ngang mặt tiền lớn hơn cả hai chiều của kích thước lô là không thể → bỏ `mat_tien` ("Trương Đình Hội • MT 20 mét" là
        đường rộng 20m, lô 4x11)."""
        thu_tu = conv.prop.expected_fields()
        hang = lambda o: thu_tu.index(o) if o in thu_tu else len(thu_tu)
        gon = lambda x: " ".join(_strip_accents(x).lower().split())
        da_co = {gon(v): k for k, v in conv.prop.fields.items() if isinstance(v, str) and not k.startswith("_")}
        nhom: dict[str, list[str]] = {}
        for k, v in out.items():
            if k not in _O_PHAN_LOAI and k not in _O_GHEP and len(_tu(v)) >= 2:
                nhom.setdefault(gon(v), []).append(k)
        for g, ks in nhom.items():
            giu = da_co.get(g) if da_co.get(g) not in (None, *ks) else min(ks, key=hang)
            for k in ks:
                if k != giu:
                    log.warning("Bỏ ô %s: cùng cụm khách đã vào ô %s", k, giu)
                    conv.bo_luot.append((k, out.get(k), None, f"cùng cụm đã vào ô {giu}"))
                    out.pop(k, None)
        # Kích thước lô có thể nằm ở ô kích thước hoặc ở ô diện tích đất dạng "4 x 11m" (bắn thử KB5 21/10, SRS-5.1zzzzzzz93).
        kt = _hai_chieu_lo(out) or _hai_chieu_lo(conv.prop.fields)
        mt = out.get("mat_tien")
        so_mt, so_kt = [float(x) for x in _so_trong(mt)], [float(x) for x in _so_trong(kt)]
        if so_mt and so_kt and min(so_mt) > max(so_kt):
            log.warning("Bỏ ô mat_tien: lớn hơn cả hai chiều kích thước lô")
            conv.bo_luot.append(("mat_tien", out.get("mat_tien"), None, "bề ngang lớn hơn cả hai chiều kích thước lô"))
            out.pop("mat_tien", None)
        # (3) Giá trị dạng kích thước ("5x10", "50m²") ở ô KHÔNG phải kích thước / diện tích → bỏ (SRS-5.1zzzzzzz132): lưới (1) chỉ bắt
        # cụm ≥ 2 từ nên "5x10" vào cả `kich_thuoc` lẫn `dien_tich_trang_thiet_bi` lọt (bắn thử 22/10).
        for k in [k for k in out if k not in _O_KICH_THUOC and k not in _O_PHAN_LOAI and _la_kich_thuoc(out[k])]:
            log.warning("Bỏ ô %s: giá trị dạng kích thước, không phải ô kích thước / diện tích", k)
            conv.bo_luot.append((k, out.get(k), None, "giá trị dạng kích thước (AxB / NNm²) chỉ thuộc ô kích thước / diện tích"))
            out.pop(k, None)
        return out

    def _extract_fields(self, conv: Conversation) -> dict[str, str]:
        """Fields-only extraction of the ACTIVE listing's clean history slice (used when a new
        căn is split off, so its data is read fresh from just its own messages)."""
        data = self._provider.extract(EXTRACTION_SYSTEM, conv.messages(), extraction_schema())
        return {k: v for k, v in data.items() if isinstance(v, str)}

    @staticmethod
    def _op_targets(op: dict) -> list[str]:
        raw = list(op.get("targets") or [])
        single = op.get("target")
        if single:
            raw = [single] + [t for t in raw if t != single]
        return list(dict.fromkeys(
            str(t).strip() for t in raw if isinstance(t, (str, int)) and str(t).strip()
        ))

    def _resolve_targets(self, conv: Conversation, targets: list[str]) -> list[Listing]:
        out: list[Listing] = []
        seen: set[str] = set()
        for t in targets:
            li = self._match_listing(conv, t)
            if li is not None and li.listing_id not in seen:
                seen.add(li.listing_id)
                out.append(li)
        return out

    def _apply_operation(self, conv: Conversation, op: dict, changed: set[str],
                         receipts: list[tuple]) -> None:
        kind = op.get("op")
        targets = self._op_targets(op)
        fields = op.get("fields") if isinstance(op.get("fields"), dict) else {}

        bang_chung = op.get("bang_chung") if isinstance(op.get("bang_chung"), dict) else {}

        def _data(exclude_code: bool = False) -> dict[str, str]:
            return self._loc_o_tin(conv, {k: v for k, v in fields.items() if not (exclude_code and k == "ma_so_can")}, bang_chung)

        # "xóa/bỏ/chỉ giữ" NEVER delete — they move listings to 'không rao' (hidden, kept).
        if kind == "clear":
            n = self._unlist_listings(conv, keep=[], drop=[], clear=True)
            receipts.append(("clear", n))
            return
        if kind == "keep_only":
            self._unlist_listings(conv, keep=targets, drop=[])
            receipts.append(("keep_only", targets, self._rao_count(conv)))
            return
        if kind == "remove":
            self._unlist_listings(conv, keep=[], drop=targets)
            receipts.append(("remove", targets, self._rao_count(conv)))
            return
        if kind == "add":
            # Theo bản anh Luận (SRS-5.1zzzzzzz51): tin "add" của lượt AI lập thao tác LÀ quyết định mở căn mới — không đoán
            # lại bằng từ khoá trên lời khách. Bản 16/10 đọc lại tin khách bằng regex ("ok|chuẩn|duyệt…" = duyệt tin, chỉ
            # "căn nữa|thêm căn…" mới là căn mới): "ok, còn nhà ở Q3 nữa" khớp "ok" nên nhà Q3 ĐÈ lên căn cũ. Duyệt bản nháp
            # đã có đường riêng (duyet_ban_nhap, kiểm trích dẫn) và OPERATIONS_SYSTEM cấm "add" khi khách chỉ duyệt tin.
            # Multiple units of the SAME model ("2 căn 42 và 41") → one listing per mã số căn
            # (an existing code UPDATES, never duplicates). A single add starts a fresh listing
            # (filling the empty starter first) so its fields don't bleed onto the previous căn.
            if len(targets) >= 2:
                changed.update(self._fan_out_units(conv, _data(exclude_code=True), targets))
            elif self._listing_empty(conv.active):
                # First căn / empty starter — no previous căn to bleed from; use the plan fields.
                data = _data()
                if targets:
                    data["ma_so_can"] = targets[0]
                changed.update(conv.active.prop.update(data))
            elif not self._co_cum_can_khac(conv, op.get("can_khac_trich")):
                # SRS-5.1zzzzzzz268 (bắn thử ban-thu-kiem E): khách kho xưởng chỉ nói thêm "Sổ đỏ riêng, đất SKC 50 năm", AI lập thao
                # tác trả "add" → căn mới rỗng, bản nháp không ra, bot hỏi lại vị trí. "add" mở căn mới phải kèm cụm khách nói căn KHÁC
                # (AI đọc nghĩa, code chỉ kiểm cụm nằm trong lời khách); không có thì đó là thông tin của căn đang khai.
                log.warning("Thao tác add không kèm cụm khách nói căn khác — ghi vào căn đang khai")
                changed.update(conv.active.prop.update(_data()))
                return
            else:
                # A genuinely NEW căn alongside existing ones: open a fresh listing pointed at
                # the describing message and RE-READ its fields from that clean slice, so nothing
                # bleeds from the previous căn.
                li = conv.new_listing()
                li.history_start = max(0, len(conv.history) - 1)
                data = self._loc_o_tin(conv, self._extract_fields(conv))   # cùng cổng bằng chứng (SRS-5.1zzzzzzz86)
                if targets:
                    data["ma_so_can"] = targets[0]
                changed.update(li.prop.update(data))
            receipts.append(("add", targets))
            return
        if kind == "set_status":
            status = STATUS_MAP.get(op.get("status") or "")
            listings = self._resolve_targets(conv, targets) if targets else []
            if listings:  # the referenced căn(s) exist → mark each and switch context to them
                for li in listings:
                    if status:
                        li.status = status
                    changed.update(li.prop.update(_data(exclude_code=True)))
                conv.active_listing_id = listings[-1].listing_id
            else:  # no/unknown target → the active (only) căn; adopt the code if one was named
                if status:
                    conv.active.status = status
                data = _data()
                if targets:
                    data.setdefault("ma_so_can", targets[0])
                changed.update(conv.active.prop.update(data))
            receipts.append(("set_status", status, listings or [conv.active]))
            return
        # kind == "update" (or unknown → treat as a plain data update). A resolvable target
        # edits that existing căn; an UNresolved target names THIS căn (adopt the code); no
        # target = the seller is building the active căn.
        if targets:
            listings = self._resolve_targets(conv, targets)
            if listings:
                for li in listings:
                    changed.update(li.prop.update(_data(exclude_code=True)))
                conv.active_listing_id = listings[-1].listing_id
            else:
                data = _data()
                data.setdefault("ma_so_can", targets[0])
                changed.update(conv.active.prop.update(data))
        else:
            changed.update(conv.active.prop.update(_data()))

    @staticmethod
    def _basket_size(conv: Conversation) -> int:
        """How many REAL (non-empty) căn are in the basket right now (any status)."""
        return sum(1 for li in conv.listings if (li.prop.fields.get("ma_so_can")
                                                 or li.prop.fields.get("dia_chi")
                                                 or li.prop.completeness() > 0))

    @staticmethod
    def _rao_count(conv: Conversation) -> int:
        """How many căn are CURRENTLY being advertised (status not 'không rao'/'thôi đăng ký'/
        'đã bán'/'đã cho thuê'). The unlisted ones are kept, just hidden from the active rao."""
        hidden = {KHONG_RAO, THOI_DANG_KY, "đã bán", "đã cho thuê"}
        return sum(1 for li in conv.listings
                   if li.status not in hidden and not Engine._listing_empty(li))

    def _receipt_reply(self, conv: Conversation, receipts: list[tuple]) -> str | None:
        """Build the reply for an unlist op DIRECTLY from the real post-action state — so the
        words can never disagree with the deed. These ops NEVER delete: they move listings to
        'không rao' (hidden, kept). Non-destructive ops return None → normal persona reply."""
        kinds = {r[0] for r in receipts}
        if "confirm_destructive" in kinds:  # ask BEFORE changing anything
            what = next((r[1] for r in receipts if r[0] == "confirm_destructive"), "đổi trạng thái rao")
            return self._cau_khach(conv, "xac_nhan_an", viec=what)   # câu mẫu sửa ở CRM (SRS-5.1zzzzzzz110)
        if "clear" in kinds:
            return self._cau_khach(conv, "da_an_het")
        if kinds & {"remove", "keep_only"}:
            return self._cau_khach(conv, "da_an_bot", n=self._rao_count(conv))
        return None

    def _fan_out_units(self, conv: Conversation, shared: dict[str, str], codes: list[str]) -> list[str]:
        """One listing per unit code, all sharing `shared` (du_an, unit_type, giá...). A code
        that ALREADY exists in the basket UPDATES that căn (one seller can't list the same căn
        twice); a new code fills the empty starter first, then a fresh listing. New units point
        their history slice at the describing message so the reply has context."""
        names: set[str] = set()
        start = max(0, len(conv.history) - 1)  # the message that named all the codes
        du_an = shared.get("du_an")
        for code in codes:
            existing = self._listing_by_code(conv, code, du_an)
            if existing is not None:
                names.update(existing.prop.update({**shared, "ma_so_can": code}))
                continue
            target = conv.active if self._listing_empty(conv.active) else conv.new_listing()
            target.history_start = start
            names.update(target.prop.update({**shared, "ma_so_can": code}))
        return sorted(names)

    def _timeliness(self, conv: Conversation, now: float) -> float:
        """Map seller response latency to [0, 1]. Fresh conversations start at 1.0."""
        if conv.last_ai_at is None:
            return 1.0
        elapsed_hours = (now - conv.last_ai_at) / 3600.0
        if elapsed_hours <= 1:
            return 1.0
        if elapsed_hours >= 120:  # 5 days = Keep-Alive threshold (SRD §VI)
            return 0.0
        return max(0.0, 1.0 - elapsed_hours / 120.0)
