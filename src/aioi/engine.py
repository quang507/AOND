"""Conversation engine — orchestrates the chat brain.

Per turn it: (1) silently extracts property data from the user's message into the
dynamic schema, (2) recomputes gamification scores, (3) picks the next single field to
ask about, and (4) generates a <=30-word persona reply. State is kept in-memory per
conversation (persisted to Supabase via SupabaseConversationStore).
"""
from __future__ import annotations

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
from .prompts import KHOI_MOT_UU_TIEN
from . import cau_mau
from . import so_token
from .delivery import _is_formatted_post
from .prompts import _MO_DAU_RE   # dòng mở bản nháp "(📋) Em/Mình sẽ rao như vầy nhé…:" (SRS-5.1zzzzzzz132)
from .danh_gia import KHOI_SAP_XIN_SAO, cau_xin_sao, doc_sao, khoi_cam_on_sao, vua_xin_sao
from . import du_an_mua
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
from .llm.base import RANH_GIOI_CACHE
from . import bulk
from . import inventory as inv
from .projects import (
    InMemoryProjectStore,
    Project,
    ProjectStore,
    UnitType,
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
    build_chat_system,
    build_column_map_system,
    build_project_docs_block,
    build_transcribe_instruction,
    build_fee_followup_system,
    _fee_hint,
    khoi_bao_phi,
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
from .schema import O_NOI_BO, O_SAU_DANG, O_TU_VAN_MUA, Property, BuyerLead, PropertyGroup, _so_nguyen
from .dia_danh import TraDiaDanh, goi_y_duong, bo_dau, khoi_dia_danh, phuong_kho_hem, ten_tran
from .xung_ho import goi_toi as goi_toi_khach, tre as _xung_tre
from .mua import (co_tieu_chi, giong_sdt_sai, khoi_can_cho_khach, khoi_cau_hoi_cho, khoi_lich_dang_cho, khoi_viec_vua_ghi, lenh_tra_loi,
                  tim_sdt)
from .tai_chinh import khoi_tai_chinh
from .kho_anh import la_uuid
from .kho_tep import MediaStore, KhoTepError, extension_for, listing_folder, sanitize_filename

# Headroom so the token cap never truncates a reply. The model controls actual length
# via the prompt (brief while chatting, full ad when asked / complete).
REPLY_MAX_TOKENS = 4096
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
    return sum(1 for r in media if not r.get("filename", "").lower().endswith(".pdf"))

# 19/10/2026 (SRS-5.1zzzzzzz55): các bộ dò từ khoá _looks_descriptive / _wants_project_facts / _wants_media /
# _looks_like_reference_doc / _affirms / _denies đã gỡ — lượt AI lập thao tác đọc theo nghĩa (xin_xem_ban_ve, cau_hoi_du_an,
# mo_ta_du_an, xac_nhan_xoa, kèm trích dẫn) và _la_tai_lieu_chung đọc bản đọc ảnh.

# Chuỗi bridge gán cho MỌI sticker Zalo (bot/bridge-zca/index.mjs, SRS-5.1zzzzzzz22): zca-js không cho biết sắc thái.
def _ten_tep_that(ten: str | None) -> bool:
    """Tên tệp có nghĩa. Máy chủ ảnh Zalo trả tên "undefined" (22/10/2026: "Em đã nhận: undefined") — tên rác coi như không có tên."""
    return bool(ten) and str(ten).strip().lower() not in ("undefined", "null", "none", "nan", "unknown", "file", "image")


from .sticker import STICKER_TRUNG_TINH, la_sticker  # noqa: E402,F401  (một nguồn ở sticker.py, SRS-5.1zzzzzzz122)

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
                 "\"anh/chị\". Chỉ được \"nhà mình / căn mình / đất mình\" khi nói về căn của khách.\n")


def khoi_xung_ho(p: str, ten: str | None = None) -> str:
    """Khối luật xưng hô của lượt theo cách khách tự xưng (`_detect_customer_pronoun`) và tên trợ lý (`xung_ho.goi_toi`). Một nguồn cho
    lượt chat và lượt ảnh sổ (SRS-5.1zzzzzzz82 — trước đó câu sau ảnh sổ viết cứng, luôn "anh/chị", có nhánh "vậy anh?")."""
    return _khoi_xung_ho_rieng(p, ten) + _GIONG_CHUNG + _CAM_GOI_MINH


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
            f"3. Bản thân xưng là '{toi}' (Ví dụ: '{toi.capitalize()} hỏi chút, căn của em ở đường nào vậy?', 'Nhà em nằm ở mặt tiền hay trong hẻm em ha?'). "
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
    if not conv.y_luot.get("can_nguoi_that") or conv.y_luot.get("phap_ly_nhay_cam"):
        return ""
    return (
        "\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH XIN GẶP NGƯỜI THẬT (hệ thống đã đọc, ĐÃ BÁO người phụ trách): ===\n"
        "Nói ngắn, ấm: em đã báo anh/chị phụ trách, anh/chị ấy sẽ nhắn khách sớm. KHÔNG hứa giờ cụ thể, KHÔNG xin số điện thoại. "
        "Trong lúc chờ, nếu khách muốn em vẫn hỗ trợ tiếp. Không hỏi thêm thông tin căn ở lượt này.\n"
    )


def khoi_ngoai_viec(conv: "Conversation") -> str:
    """Khách hỏi việc ngoài nhà đất khi chưa tỏ ý bán / mua (SRS-5.1zzzzzzz177): lần 1 nói thật không nắm + hỏi có cần bán / mua không;
    từ lần 2 thôi hỏi về nhà đất, đề nghị nối người phụ trách (hỏi khách có muốn không — không tự báo)."""
    n = conv.y_luot.get("ngoai_viec")
    if not n:
        return ""
    if n == 1:
        return ("\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI VIỆC NGOÀI NHÀ ĐẤT (chưa tỏ ý bán / mua): ===\n"
                "Nói thật NGẮN là việc đó em không nắm (không đoán, không hứa hỏi giúp). KHÔNG hỏi địa chỉ / loại / giá / bất kỳ thông tin căn "
                "nào, KHÔNG nói khách đang rao hay đang bán, KHÔNG khen. Hỏi MỘT câu ngắn: khách có cần gửi bán, cho thuê hay tìm mua nhà đất "
                "không.\n")
    return (f"\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI LẠI VIỆC NGOÀI NHÀ ĐẤT (lần thứ {n}): ===\n"
            "KHÔNG hỏi gì về nhà đất nữa, KHÔNG khen. Nói ngắn: bên em chỉ hỗ trợ gửi bán / cho thuê / tìm mua nhà đất, việc này em chưa nắm; nếu "
            "khách muốn, em nối anh/chị phụ trách để hỏi giúp — hỏi MỘT câu khách có muốn không. KHÔNG nói đã báo ai.\n")


def khoi_phap_ly(conv: "Conversation", can: dict | None = None) -> str:
    """Khối pháp lý của lượt (SRS-5.1zzzzzzz176). `can` (SRS-5.1zzzzzzz179 mục 3): căn khách đang nói tới ở vai mua — có giá thì kho pháp lý
    nối dòng số thuế phí tính sẵn theo giá căn."""
    gia = can.get("price_vnd") if isinstance(can, dict) else None
    k = phap_ly.khoi_luot(conv.y_luot.get("hoi_phap_ly"), bool(conv.y_luot.get("phap_ly_nhay_cam")),
                          gia_can=float(gia) if isinstance(gia, (int, float)) and gia > 0 else None,
                          ma_can=str(can.get("code")) if isinstance(can, dict) and can.get("code") else None)
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
    return {"em": "em", "anh": "anh", "chi": "chi", "chau": "chau", "chu_co_bac": "elder"}.get(conv.xung_ho or conv.xung_ho_goi_y or "", "unknown")


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


_SO_DON_VI_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(m²|m2|mét vuông|triệu\s*/\s*m[²2]|tỷ|tỉ|triệu|phòng ngủ|pn\b|tầng|lầu)", re.I)
_SO_RE = re.compile(r"\d+(?:[.,]\d+)?")


def _so_khong_co_trong_can(reply: str, can: list[dict] | None, conv: "Conversation", system: str = "") -> list[str]:
    """Con số kèm đơn vị (m², tỷ, triệu, triệu/m², phòng ngủ, tầng) trong lời bot phía mua mà KHÔNG có ở dòng căn đưa cho model, khối số
    tính sẵn (thuế phí / tài chính tham khảo) hay lời khách (SRS-5.1zzzzzzz179 mục 5 — lớp lỗi MOSO AI mắc 25/10: tóm tắt "36–57 m²" trong khi
    thẻ hiện 21–29 m²). So số với sai số 5 % để chấp nhận làm tròn (207,9 → 208); mã tin / link / giờ không có đơn vị nên không bị soi."""
    from .mua import dong_can
    if not can and du_an_mua.TIEU_DE not in system:
        return []

    def so(v: str) -> float | None:
        try:
            return float(v.replace(".", "").replace(",", ".")) if v.count(",") == 1 and v.count(".") >= 1 else float(v.replace(",", "."))
        except ValueError:
            return None

    nguon = " ".join(dong_can(c) for c in can)
    for c in can:
        gia = c.get("price_vnd")
        if isinstance(gia, (int, float)) and gia > 0:
            nguon += f" {gia / 1e9:g} {gia / 1e6:g}"
    for t in conv.history[-8:]:
        if t.role == "user" and t.content:
            nguon += " " + t.content
    for dau, rong in (("SỐ TÍNH THEO CĂN", 1200), ("SỐ LIỆU TÀI CHÍNH THAM KHẢO", 1200), (du_an_mua.TIEU_DE, du_an_mua.CAT_KIEN_THUC + 2500)):
        k = system.find(dau)
        if k >= 0:
            nguon += " " + system[k:k + rong]
    cho_phep = {x for x in (so(m) for m in _SO_RE.findall(nguon)) if x is not None}
    la: list[str] = []
    for m in _SO_DON_VI_RE.finditer(reply):
        v = so(m.group(1))
        if v is None or any(abs(v - x) <= 0.05 * max(1.0, x) for x in cho_phep):
            continue
        la.append(m.group(0).strip())
    return la


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
    return [f"giá ({gia})"] if so_gia and not (so_gia & _so_trong(tieu_de)) else []


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


def _la_ban_nhap(reply: str) -> bool:
    """Lời bot là BẢN TIN rao (có dấu 📋, dòng mở bản nháp, hoặc bố cục tin có gạch đầu dòng) — không phải lời chat thường (SRS-5.1zzzzzzz204)."""
    return bool(reply) and ("📋" in reply or _MO_DAU_RE.search(reply) is not None or _is_formatted_post(reply))


def _ban_tin_da_trinh(conv: "Conversation") -> tuple[str, str] | None:
    """Bản tin 📋 cuối cùng bot gửi cho căn đang nói (từ lượt căn này bắt đầu) — chính bản khách vừa duyệt."""
    for t in reversed(conv.history[conv.active.history_start:]):
        if t.role == "assistant" and "📋" in t.content:
            return _than_ban_tin(t.content)
    return None


def _mo_dau_da(reply: str) -> bool:
    """Lời bot mở đầu bằng "Dạ" — luật chủ dự án (cấm mở đầu "Dạ", CLAUDE.md §6) mà model có lượt không theo (chat chị N. 20/10: hai
    lượt sau khi đăng tin mở đầu bằng Dạ). Chỉ kiểm chữ đầu; không sửa lời — lệch thì gọi lại model (SRS-5.1zzzzzzz87)."""
    return re.match(r"(?i)\s*dạ(?![a-zà-ỹđ])", reply or "") is not None


# "mình" đứng sau các danh từ này là "căn của mình" (gọi căn của khách) — được phép; còn lại là đại từ gọi khách.
_MINH_SAU_DANH_TU = re.compile(r"(?i)\b(?:nhà|căn|đất|lô|phố|phòng|tin|bên|dự\s+án|hàng|cư|khu|của|kho)\s+mình\b")


def _goi_khach_la_minh(reply: str, pronoun: str) -> bool:
    """Lời bot gọi khách là "mình" như đại từ ("em xin lỗi mình nhé", "Mình đang cần…") — SRS-5.1zzzzzzz171. Từ SRS-5.1zzzzzzz214 (chủ dự
    án 27/10: khách xưng "em" thì bot xưng anh / chị theo tên) bot KHÔNG còn xưng "mình" với ai, nên mọi cách xưng đều kiểm.
    "nhà mình / căn mình…" không tính. Kiểm HÌNH THỨC lời của chính bot, không đoán ý khách."""
    return re.search(r"(?i)(?<![\wà-ỹđ])mình(?![\wà-ỹđ])", _MINH_SAU_DANH_TU.sub(" ", reply or "")) is not None


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
        self._pending_name_concern = ""
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

    def register_project(
        self,
        name: str,
        amenities: list[str] | None = None,
        attributes: dict[str, str] | None = None,
        voter: str = "?",
    ) -> Project:
        """Register/ENRICH a project's shared facts. The project registry is GLOBAL —
        shared across ALL sellers — so info one seller gives about a project is reused when
        another seller lists a different unit in it. MERGES into any existing project
        (unions amenities, fills/updates attributes, keeps unit_types) so nothing a prior
        seller provided is lost."""
        name = self._canonical_du_an(name)  # a variant/model name enriches the real project
        project = self._projects.get(name)
        if project is None:  # about to CREATE a new project — is it a near-miss of an existing one?
            concern = self.project_name_concern(name)
            if concern is not None and concern[0] == "near":
                self._pending_name_concern = concern[2]  # surfaced by the ingest reply → AOND asks
            project = Project(name=name)
        for a in amenities or []:
            if a not in project.amenities:
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
                return ("model", p.name,
                        f"‘{name}’ nghe giống MẪU NHÀ trong dự án “{p.name}” — đây là mẫu nhà "
                        f"của “{p.name}”, hay là một dự án riêng ạ? Em hỏi cho chắc kẻo nhầm.")
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
                return ("near", p.name,
                        f"Dự án “{name}” có phải cũng là “{p.name}” mình đang có không, hay là "
                        "một dự án khác ạ? Em hỏi cho chắc để khỏi tách nhầm thành 2 dự án.")
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

    def _drain_name_concern(self) -> str:
        """Return and clear the pending near-miss clarifying question (set by register_project when
        a new project name looked like a mishearing of an existing one). Empty when there's none."""
        q, self._pending_name_concern = self._pending_name_concern, ""
        return q

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
        merge_facts(unit_type.specs, unit_type.votes, {k: v for k, v in specs.items() if v}, voter)
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

    def ingest_source_doc(
        self, url: str, project_name: str, kind: str = "tài liệu", title: str | None = None,
        assistant_name: str = "Đ•ai",
    ) -> dict[str, str]:
        """Read a source (phân lô, brochure mẫu nhà, bảng mô tả gói nội thất...) ONCE, transcribe
        it FAITHFULLY to Markdown, store the .md on the PROJECT (persisted + uploaded to
        SharePoint `<Dự án>/_Chung/`), and return the doc record. The bot re-reads this cheap
        text later to advise with grounding — no re-OCR, no fuzzy recall. See [[aioi-data-model]]."""
        # A brochure/phân lô can be hi-res and large; allow a bigger fetch (an image is
        # downscaled in describe_media before it hits the vision API anyway).
        data, mt = fetch_raw(url, max_bytes=30 * 1024 * 1024)
        media_type = sniff_media_type(data) or (mt if mt in ("application/pdf",) else "application/pdf")
        return self._ingest_doc_bytes(data, media_type, project_name, kind, title, assistant_name)

    def _ingest_doc_bytes(
        self, data: bytes, media_type: str, project_name: str, kind: str = "tài liệu",
        title: str | None = None, assistant_name: str = "Đ•ai",
    ) -> dict[str, str]:
        """Core of ingest_source_doc, but from ALREADY-FETCHED bytes — so a brochure the seller
        sends inline (not just an admin-pasted link) is ALSO transcribed once to a faithful .md
        and stored on the project, ready for cheap grounded Q&A. See [[aioi-data-model]]."""
        markdown = self._provider.describe_media(
            [(data, media_type)], build_transcribe_instruction(assistant_name, kind),
            max_tokens=8192,  # full multi-page transcription needs headroom (don't truncate)
        ).strip()
        return self._save_project_doc(project_name, kind, title or kind, markdown)

    def _save_project_doc(self, project_name: str, kind: str, title: str, markdown: str) -> dict[str, str]:
        """Store a grounded Markdown doc on a project: upload the .md to SharePoint `_Chung`
        (best-effort) and append it to `Project.docs` (persisted), so the bot can re-read it
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
                                   markdown=self._catalog_markdown(du_an, rows))
            self._seed_inventory(du_an, rows, voter=user_key)
        conv.pending_name_note = self._drain_name_concern()  # near-miss → ask (empty if none)
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

    def _project_memory_block(self, project: Project | None) -> str:
        """The project knowledge the bot ALREADY HAS (price list the seller just shared + the
        pre-loaded phân lô / mẫu nhà docs) — injected every seller turn so AOND never 'forgets'
        the căn it just read and can RESOLVE a reference ('căn Cosmo', 'căn góc', 'căn lớn nhất')
        against real data instead of asking dumb questions or creating a junk listing."""
        if project is None:
            return ""
        sections: list[str] = []
        if (structured := self._structured_shared_block(project)):
            sections.append(structured)
        for d in project.docs:
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
            "nghĩ tới kèm dữ kiện (mã lô, diện tích, mặt tiền) rồi HỎI XÁC NHẬN ('...phải nó không "
            "anh?'). Khi khách XÁC NHẬN, hãy THÊM đúng căn đó vào rổ (nếu chưa có) với mã lô + "
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

        # Nhân viên (CTV / admin) trả lời câu khách mua hỏi bằng lệnh "#mã: câu trả lời" (SRS-5.1zzzzzzz70) — cú pháp hệ thống tự đặt
        # trong tin nhắc (`notify_info_request_escalation`), không phải đoán ý khách; chỉ nhận từ Zalo ID của CTV / admin.
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
                reply = self._receipt_reply(conv, receipts) or cau_mau.cau("da_cap_nhat_ro")
                conv.history.append(Turn("assistant", reply, now))
                conv.last_ai_at = now
                return self._build_result(conv, reply, captured=[], now=now)
            conv.pending_destructive = []  # not a clear yes → keep the basket intact
            if conv.y_luot.get("xac_nhan_xoa") == "tu_choi":
                reply = cau_mau.cau("giu_nguyen_ro")
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
                and (q_project.docs or conv.price_book) and factual_q):
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

            # 1a. A newly-captured address/project makes a listing's folder name readable — if it
            #     already has files stored under the old (id-only) folder, rename it to match.
            if captured:
                self._sync_media_folder(conv.active)

        # 1b. If this seller's listing is in a project we have UNSETTLED facts about, treat
        #     their message as a possible answer to the open question and cast a vote — this
        #     is how the bot's "let me verify" ask actually resolves the conflict (majority
        #     wins). Gated on contested keys so we don't run an extra extract every turn.
        project = self.project_for(conv.prop, conv)
        if project is not None and project.contested_keys():
            self.register_project_from_text(text, project_name=project.name, voter=user_key)
            project = self.project_for(conv.prop, conv)  # reload: the vote may have shifted/settled

        # 1c. LEARN project / model knowledge from a seller's CHAT ANSWER (not just from a
        #     file) — so info one seller types is reused for the next seller of the same
        #     project/model (the shared registry). Gated: only for a project unit, only on a
        #     descriptive message, and only while the project/model is still missing facts —
        #     so it's not an extra LLM call every turn.
        du_an = conv.prop.fields.get("du_an")
        ut_name = conv.prop.fields.get("unit_type")
        if du_an and conv.y_luot.get("mo_ta_du_an"):
            if project is None or not project.facts():
                self.register_project_from_text(text, project_name=du_an, voter=user_key)
            ut = self.unit_type_for(conv.prop)
            if ut_name and (ut is None or not ut.specs):
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
            if conv.so_nhan == SO_TU_VAN and not any(t.role == "assistant" for t in conv.history):
                # SRS-5.1zzzzzzz210: lượt đầu ở số tư vấn — chào theo câu mẫu chỉ hỏi chuyện tìm mua / thuê (số ký gửi giữ lời chào hai lựa chọn).
                system += khoi_chao_tu_van(conv.assistant.name, cau_mau.cau("chao_tu_van", goi_toi_khach(customer_pronoun)[0], ten=conv.assistant.name))
            uu_tien = (khoi_can_nguoi(conv) or khoi_phap_ly(conv, self._can_dang_noi(conv, can))   # SRS-5.1zzzzzzz178: một khối ưu tiên
                       or khoi_hoi_ve_mua(conv.hoi_ve_luot))   # SRS-5.1zzzzzzz212: phí / uy tín / định giá cũng có khối ở phía mua
            system += ((uu_tien + KHOI_MOT_UU_TIEN) if uu_tien else "") + khoi_xung_ho(customer_pronoun, conv.assistant.name)   # một nguồn xưng hô cả hai phía (SRS-5.1zzzzzzz86)
            system += khoi_tai_chinh()   # số tham khảo tượng trưng, chỉ nói khi khách tự hỏi (SRS-5.1zzzzzzz148)
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
                      + khoi_xung_ho(customer_pronoun, conv.assistant.name) + khoi_can_nguoi(conv) + khoi_phap_ly(conv))
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
                conv.assistant.name, conv.prop, next_field, conv.user_type, project_block, cum=cum_hoi,
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
                toi=goi_toi_khach(customer_pronoun, conv.assistant.name)[1],
            )
        else:
            web_tin = self._trang_thai_web(conv)
            system = build_fee_followup_system(
                conv.assistant.name, conv.prop, conv.user_type, project_block, web=web_tin,
                duyet=conv.duyet_luot, phi_da_bao=bool(conv.prop.fields.get("_phi_da_bao")),
            )
            len_web = bool(web_tin and web_tin.get("len_web"))
            if conv.duyet_luot == "dong_y" and len_web:
                conv.prop.fields["_phi_da_hoi"] = "1"   # lượt duyệt hỏi phí (hoi_phi) — lượt sau là lúc xin chấm sao
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
            # SRS-5.1zzzzzzz115: lượt này hỏi phường mà kho hẻm thu được 1–4 phường → lời bot phải nhắc (dạng hỏi) — bắn thử 21/10
            # Haiku có khối "Kho hẻm" trong prompt vẫn hỏi trống "nhà mình thuộc phường nào". Kiểm ở _soat_hinh_thuc.
            hem_phai_nhac = ([] if is_listing_post or "phuong" not in (cum_hoi or [next_field])
                             else phuong_kho_hem(self._dia_danh, conv.prop.fields))
            if not is_listing_post:
                system += self._khoi_hoi_du_an(conv)   # SRS-5.1zzzzzzz181: kho có đúng một dự án cùng đường → hỏi xác nhận MỘT lần
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
        system = self._ghep_cau_chuan(system + khoi_xung_ho(customer_pronoun, conv.assistant.name), conv) + self._khoi_danh_gia(conv)
        if xin_sao:
            system += KHOI_SAP_XIN_SAO

        # Khối ưu tiên theo điều khách HỎI — lượt AI lập thao tác đọc theo nghĩa (conv.hoi_ve_luot, SRS-5.1zzzzzzz54); bản trước
        # dò từ khoá ("chi phí" nào cũng thành hỏi phí). Con số phí theo vai từ _fee_hint, không viết tay.
        hoi_ve_khoi = ""
        if conv.hoi_ve_luot == "phi":
            hoi_ve_khoi = (
                "\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI VỀ PHÍ: ===\n"
                "Trả lời RÕ RÀNG trước: đăng tin MIỄN PHÍ; CHỈ thu phí khi giao dịch thành công, không thành thì không tốn đồng nào. "
                "Con số phí đúng theo VAI NGƯỜI RAO / BỐI CẢNH ở trên (bán: 1% chính chủ, 0.5% môi giới; cho thuê: 0.75 tháng tiền thuê "
                "= 3/4 của MỘT tháng tiền thuê; chưa rõ vai thì nêu cả hai hoặc hỏi khéo khách là chủ nhà hay môi giới). Sau đó nối lại nội dung căn đang trao đổi.\n"
                + ((_fee_hint(conv.user_type) + "\n") if _fee_hint(conv.user_type) else "")
                + ((khoi_bao_phi(conv.user_type, conv.prop.is_rental) + "\n") if khoi_bao_phi(conv.user_type, conv.prop.is_rental) else "")
            )
        elif conv.hoi_ve_luot == "uy_tin":
            hoi_ve_khoi = (
                "\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI VỀ UY TÍN / CÔNG TY: ===\n"
                "Khách vừa hỏi về danh tính công ty hoặc lo ngại an toàn/lừa đảo. Hãy TRẢ LỜI ẤM ÁP, TẠO NIỀM TIN:\n"
                "- Giới thiệu AI Ơi Nhà Đất (aioinhadat.com) là nền tảng công nghệ kết nối mạng lưới môi giới và người mua thực tế.\n"
                "- Cam kết bảo mật thông tin cá nhân và số điện thoại của khách, không làm phiền.\n"
                "- Mọi giao dịch chỉ thu phí khi bán thành công.\n"
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
        uu_tien = khoi_can_nguoi(conv) or khoi_phap_ly(conv) or khoi_ngoai_viec(conv) or hoi_ve_khoi
        # SRS-5.1zzzzzzz207: bỏ khối khen theo lượt — giọng theo bản anh Luận ("khen ngợi điểm mạnh trước" nằm sẵn trong prompt).
        system += (uu_tien + KHOI_MOT_UU_TIEN) if uu_tien else ""
        system += self._basket_block(conv)  # basket awareness → disambiguate "căn nào?"
        system += self._project_memory_block(project)  # remember the price list + phân lô; reason over it
        system += self._seller_price_block(conv)  # the seller's OWN prices → answer, don't lie "chưa có"
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
        nhan = _nhan_khoi_trong_tin(reply)
        if nhan:
            ly_do.append("Bản tin rao vừa viết in tên khối (" + ", ".join(f"\"{x}:\"" for x in nhan) + ") — tên khối trong BỐ CỤC chỉ để em biết "
                         "thứ tự, KHÔNG in ra; viết thẳng nội dung.")
        if _mo_dau_da(reply):
            ly_do.append("Lời vừa viết mở đầu bằng \"Dạ\" — câu đầu phải vào thẳng nội dung, không \"Dạ\".")
        if _goi_khach_la_minh(reply, _detect_customer_pronoun(conv)):
            ly_do.append("Lời vừa viết gọi khách là \"mình\" (\"em xin lỗi mình\", \"Mình đang cần…\") — KHÔNG dùng \"mình\" gọi khách hay tự xưng: "
                         "gọi đúng cách khách xưng (em / cháu / anh / chị), chưa rõ thì \"anh/chị\"; tự xưng đúng QUY TẮC XƯNG HÔ ở trên. "
                         "Chỉ \"nhà mình / căn mình\" khi nói về căn của khách.")
        if _mo_dau_ghi_nhan(reply):   # SRS-5.1zzzzzzz208: cả câu dẫn trước bản tin cập nhật ("Em ghi nhận thêm sổ hồng… 📋 Bản tin cập nhật")
            ly_do.append("Lời vừa viết mở đầu bằng câu ghi nhận (\"Em ghi nhận / Em đã ghi giá… / Em lưu…\") — chủ dự án đã bỏ hẳn kiểu này: "
                         "mở bằng MỘT lời khen ngắn gắn với điều khách vừa nói (khách vừa nêu giá thì nói mức đó hợp lý / dễ bán cho vị trí khách "
                         "đã kể, KHÔNG kèm số liệu thị trường), hoặc vào thẳng nội dung (bản tin cập nhật thì mở thẳng bằng 📋).")
        # SRS-5.1zzzzzzz213 (khách ảo 26/10, giám khảo chấm "không lặp" 1,4/5): lặp mở đầu / lặp nguyên câu của lượt trước — lưới cũ SRS-118
        # bị gỡ ở SRS-207; nay đặt lại, kiểm HÌNH THỨC lời của chính bot, không đọc ý.
        truoc = next((t.content for t in reversed(conv.history) if t.role == "assistant" and t.content), "")
        if "📋" not in reply:
            if _cung_mo_dau(reply, truoc):
                ly_do.append("Lượt trước em đã mở đầu bằng cùng mấy chữ này — lượt này đổi cách mở (vào thẳng ý, hoặc đáp điều khách vừa nói), "
                             "không lặp lời xin lỗi / trấn an đã nói.")
            lap = _cau_lap_luot_truoc(reply, truoc)
            if lap:
                ly_do.append(f"Câu \"{lap[:60]}\" lặp gần nguyên văn lời em ở lượt trước — khách đã đọc rồi: bỏ câu đó, hoặc nói ngắn hơn bằng "
                             "chữ khác; mỗi ý (chưa có căn, cứ nhắn lại, em sẽ báo) chỉ nói MỘT lần trong cuộc chat.")
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
        if ly_do:
            # Đầu mỗi lý do (không lời khách) để truy lưới nào kích — bắn thử 368 chỉ thấy "1 lý do", không biết lý do gì.
            log.warning("Lời bot lệch luật hình thức (%d lý do: %s) — gọi lại model", len(ly_do), " | ".join(x[:40] for x in ly_do))
            with _do(conv, "tra_loi_lai"):
                lai = self._provider.reply(
                    system + "\n\n=== VIẾT LẠI LƯỢT NÀY ===\n" + " ".join(ly_do) + " Viết lại TOÀN BỘ lượt trả lời.\n",
                    conv.messages(), max_tokens=REPLY_MAX_TOKENS).strip()
            if lai:
                reply = _bo_markdown(lai)
        return reply

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
            nguon = str(inp.get("nguon") or "").strip() or conv.user_key   # provenance = voter id
            inv.remember(project, str(inp.get("ma_so_can", "")),
                         {k: str(v) for k, v in attrs.items()}, voter=nguon)
            self._projects.save(project)
            return f"Đã ghi nhớ vào kiến thức chung dự án (nguồn: {nguon})."
        if name == "ghi_nho_du_an":
            attrs = inp.get("thuoc_tinh") if isinstance(inp.get("thuoc_tinh"), dict) else {}
            nguon = str(inp.get("nguon") or "").strip() or conv.user_key
            merge_facts(project.attributes, project.votes,
                        {k: str(v) for k, v in attrs.items() if str(v).strip()}, voter=nguon)
            self._projects.save(project)
            return f"Đã lưu kiến thức chung dự án (nguồn: {nguon})."
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
        return final or "Anh/chị nói rõ thêm giúp em căn nào ạ?"

    @staticmethod
    def _project_map_doc(project: Project | None) -> dict[str, str] | None:
        """The project's stored phân-lô / sơ-đồ / quy-hoạch map doc, if any (most recent)."""
        if project is None:
            return None
        needles = ("phan lo", "so do", "ban do", "quy hoach")
        for d in reversed(project.docs):
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
            doc = self._project_map_doc(project)
            if doc is not None:
                answer = self._answer_from_docs(conv, project, text)
                link = doc.get("web_url")
                if link:
                    answer += f"\n\n📐 Em có sẵn file phân lô/bản đồ đây ạ: {link}"
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
            link = next((m.get("web_url") for m in ut.media if m.get("web_url")), "")
            tail = f" đây ạ: {link}" if link else " em có lưu, để em gửi lại nha."
            return f"Bản vẽ/mặt bằng mẫu {ut.name}{tail} 📐"
        return cau_mau.cau("chua_co_ban_ve", can=who)

    def _answer_from_docs(self, conv: Conversation, project: Project, text: str) -> str:
        """Answer a factual question STRICTLY from the project's stored source docs — a focused
        call (docs + the question only) so the model reads the document instead of following the
        collection script or recalling/fabricating. The seller's OWN price book (private, from any
        price list they sent) is injected too, so a price question is answered from it instead of
        the price-free shared catalog — otherwise AOND wrongly says 'em chưa có giá'."""
        structured = self._structured_shared_block(project)  # mẫu nhà specs + project facts
        system = (
            f'Bạn là "{conv.assistant.name}", trợ lý BĐS của AI Ơi Nhà Đất. '
            + build_project_docs_block(project.name, project.docs)
            + (f"\n\n=== KIẾN THỨC CHUNG DỰ ÁN (em ĐÃ CÓ SẴN) ===\n{structured}\n" if structured else "")
            + self._seller_price_block(conv)
            + "\nTrả lời câu hỏi của khách NGẮN GỌN, ĐÚNG theo tài liệu / mẫu nhà / bảng giá trên. Khi "
            "khách hỏi chi tiết MẪU NHÀ (số tầng, số phòng, bố trí), TRẢ LỜI NGAY từ mục MẪU NHÀ — đó "
            "là kiến thức chung em ĐÃ CÓ, KHÔNG nói 'em không tra cứu được'. Thân thiện. TUYỆT ĐỐI không bịa; "
            "nếu KHÔNG có trong tài liệu lẫn bảng giá thì mới nói \"em chưa có thông tin về ý này ạ\" rồi mời khách bổ sung."
            + khoi_xung_ho(_detect_customer_pronoun(conv), conv.assistant.name)
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
            reply = cau_mau.cau("nhap_bang_tinh", n=n) if n else cau_mau.cau("bang_tinh_trong")
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
            reply = cau_mau.cau("link_web_trong")
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
                                       title=f"tham khảo web — {host}", markdown=markdown)
                reply = (f"Em đọc trang **{host}** rồi ạ:\n\n{summary}\n\n"
                         f"Em đã lưu vào kiến thức dự án (nguồn: {url}) — lần sau anh/chị hỏi là "
                         "có ngay ạ 😊")
            else:
                reply = (f"Em đọc trang **{host}** rồi ạ:\n\n{summary}\n\n"
                         "Anh/chị đang rao dự án nào để em gắn thông tin này vào cho đúng ạ?")
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
        reply = cau_mau.cau("file_qua_lon")
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
                reply = cau_mau.cau("link_thu_muc_drive")
            else:
                reply = cau_mau.cau("link_khong_mo_duoc")
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
                    reply = (f"📊 {cap_line}Em đọc được bảng giá ({names}) rồi ạ — **{n_in_list} căn**"
                             f"{where}, em đã LƯU LẠI GIÁ của từng căn. Em chưa cho căn nào vào rổ "
                             "rao vì mình chưa nói rao căn nào — anh/chị muốn RAO căn nào ạ (hoặc "
                             "hỏi em giá căn nào cũng được)? 😊")
                    if conv.pending_name_note:
                        reply += "\n\n🤔 " + conv.pending_name_note
                        conv.pending_name_note = ""
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
                reply = f"📊 {cap_line}Em đọc bảng giá ({names}) và {body}{tail}"
                if conv.pending_name_note:
                    reply += "\n\n🤔 " + conv.pending_name_note
                    conv.pending_name_note = ""
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
                he = (build_chat_system(conv.assistant.name, conv.active.prop, next_field, conv.user_type, "", cum=cum)
                      + khoi_xung_ho(_detect_customer_pronoun(conv, caption or ""), conv.assistant.name)
                      + "\n\n=== LƯỢT NÀY: KHÁCH VỪA GỬI ẢNH SỔ / GIẤY TỜ ===\nHệ thống đã đọc ảnh và GỬI KHÁCH các dòng sau, ngay "
                        f"trước lời em:\n{detail_lines or '(chưa đọc được dòng nào)'}\nViết 1–2 câu tiếp theo: mời khách xem các dòng "
                        "trên đã đúng chưa, rồi hỏi tiếp đúng ý ở \"Thông tin cần hỏi tiếp theo\" (nếu có). KHÔNG khen sổ / pháp lý, "
                        "KHÔNG nói sổ \"chuẩn\", \"đầy đủ\" — em mới đọc ảnh, chưa kiểm sổ. Không lặp lại các dòng trên.\n")
                ask_tail = self._provider.reply(he, conv.messages() + [Message("user", seller_turn)],
                                                max_tokens=REPLY_MAX_TOKENS).strip()
                if not ask_tail:
                    raise LoiTraLoi("lời sau ảnh sổ rỗng")

                reply = f"📎 Em đã nhận ({names}) — em xem ảnh sổ của mình rồi ạ 📄✨\n{detail_lines}\n\n{_bo_markdown(ask_tail)}" + self._cap_note(capped)
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
            )
            description = self._provider.describe_media(
                [(m.data, m.media_type) for m in fetched], instruction
            ).strip()
            conv.history.append(Turn(
                "user",
                f"[Khách gửi {len(fetched)} tệp ({names}). Nội dung em đọc được từ tài liệu của khách:]\n{description}",
                now,
            ))
            # Register the project + model, then store the files where they belong: a MẪU NHÀ
            # brochure → the UnitType's shared media (units inherit), else the active căn.
            captured, capped = self._route_readout_media(conv, description, fetched, user_key)
            header = self._friendly_media_receipt(names, len(fetched))
            reply = f"{header}\n\n{description}" + self._cap_note(capped)
            if (q := self._drain_name_concern()):  # read doc named a near-miss project → ASK
                reply += "\n\n🤔 " + q

        if len(fetched) < len(sources):
            reply += (
                f"\n\n(Có {len(sources) - len(fetched)} tệp em chưa mở được — anh/chị "
                f"gửi lại giúp em nhé ạ.)"
            )
        conv.history.append(Turn("assistant", reply, now))
        conv.last_ai_at = now
        return self._build_result(conv, reply, captured, now)

    @staticmethod
    def _friendly_media_receipt(names: str, count: int) -> str:
        parts = [p.strip() for p in names.split(",") if p.strip()]
        is_hash = all(
            len(p.rsplit(".", 1)[0]) >= 20 and not any(c in p for c in (" ", "_", "-"))
            for p in parts
        ) if parts else False
        if is_hash:
            return cau_mau.cau("nhan_anh", n=count)
        return f"📎 Em đã nhận: {names}"

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
        """Shared media folder for a house model: `<Dự án>/<Mẫu nhà>/_Chung` — every unit
        of the model inherits these (brochure/floor-plan/renders), per [[aioi-data-model]]."""
        return f"{project_name}/{ut_name}/_Chung"

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
        default_title: str | None = None,
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
                self._ingest_doc_bytes(m.data, m.media_type, project_name, kind=kind, title=title)
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
                self._ingest_group_docs(proj.name, fetched, kind="mẫu nhà", default_title=ut.name)
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
                                           kind="tài liệu dự án", title=title)
                except (FetchError, KhoTepError, ValueError):
                    pass
            return [], 0
        captured = self._extract(conv)
        if store:
            refs, capped = self._upload_media(
                self._folder_for(conv.active), fetched,
                image_slots=self._max_photos - _image_count(conv.active.media),
            )
            conv.active.media += refs
            return captured, capped
        return captured, 0

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

    def _cap_note(self, n_capped: int) -> str:
        """A friendly line telling the seller the photo limit and how many weren't kept.
        Honest about the behavior: we keep the FIRST `max_photos` and skip the rest (no
        swap mechanism yet), so it suggests sending the best shots first."""
        if n_capped <= 0:
            return ""
        return (
            f"\n\n(Mỗi căn em chỉ lưu tối đa {self._max_photos} ảnh cho tin gọn, tải nhanh nha — "
            f"nên {n_capped} tấm sau em CHƯA lưu ạ. Lần sau anh/chị gửi trước {self._max_photos} "
            "tấm ĐẸP NHẤT là đủ đó!)"
        )

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
            )
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
            tail = "\n\n(Em đã lấy thông tin từ tài liệu, không cần lưu ảnh bảng dữ liệu nha.)" if data_only else ""
            if (q := self._drain_name_concern()):  # read doc named a near-miss project → ASK
                tail += "\n\n🤔 " + q
            header = self._friendly_media_receipt(names, len(fetched))
            return (f"{header}\n\n{description}{tail}" + self._cap_note(capped), captured)

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
            store_items = [] if data_only else items
            tag = " (chỉ lấy dữ liệu, không lưu ảnh)" if data_only else ""
            if scope == "chung":
                project = self.register_project_from_text(mo_ta, project_name=known_project, voter=user_key)
                self.register_unit_type_from_text(mo_ta, voter=user_key)
                folder = f"{project.name}/_Chung" if project else "_Chung/Chua_ro_du_an"
                self._upload_media(folder, store_items)  # no listing — project-level
                # A project-level DOCUMENT (phân lô, quy hoạch...) → grounded .md for Q&A later.
                docs = [] if data_only else self._ingest_group_docs(
                    project.name if project else None, items, kind="tài liệu chung")
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
                            project.name, items, kind="mẫu nhà", default_title=ut.name)
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
            f"📎 Em đã nhận {len(fetched)} tệp, phân tích thấy có {len(groups)} nhóm:\n\n"
            + "\n\n".join(summary)
            + "\n\nAnh/chị xem giúp em tách vậy có đúng không, có căn nào bị gộp/lẫn không ạ?"
            + self._cap_note(total_capped)
        )
        if (q := self._drain_name_concern()):  # a group named a near-miss project → ASK
            reply += "\n\n🤔 " + q
        return reply, captured

    # --- internals -------------------------------------------------------

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
                    conv.y_luot["can_nguoi_that"] = ("Bot hỏi phường 3 lượt chưa ra — nhờ admin tra và điền phường ở Sửa tin: "
                                                     + ", ".join(str(f[k]) for k in ("du_an", "duong", "dia_chi", "quan") if f.get(k)))
        return web

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
        )

    def _match_listing(self, conv: Conversation, ref: str) -> Listing | None:
        """Resolve a seller's textual reference to an EXISTING basket listing — by unit code
        number (e.g. "42" ↔ ma_so_can "căn số 42") first, then by address token overlap (a
        partial "căn ở Trương Đình Hội" matches "198A/22 Trương Đình Hội"). None if no match."""
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
        system = OPERATIONS_SYSTEM + RANH_GIOI_CACHE + self._project_memory_block(project)   # SRS-5.1zzzzzzz166: 16 nghìn chữ cố định chung mọi khách
        if project is not None and project.docs:
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
        # Phía mua (SRS-5.1zzzzzzz70): khách mua thấy căn đang có (AI chỉ đúng mã); người rao thấy câu khách đang hỏi họ.
        kho = self._convstore
        conv.can_mua, conv.cau_hoi_cho = [], []
        if conv.role == "buyer" and getattr(kho, "can_phu_hop", None) is not None:
            with _do(conv, "kho_doc"):
                conv.can_mua = self._can_goi_y(conv)
            system += khoi_can_cho_khach(conv.can_mua, not co_tieu_chi(conv.buyer_lead))
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
        if raw_role in {r.value for r in SellerRole if r is not SellerRole.UNKNOWN} and _vai_co_bang_chung(
                plan.get("seller_role_trich_dan"), [t.content for t in conv.history if t.role == "user" and t.content][-6:]):
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

        # Hỏi về gì / tự xưng gì (SRS-5.1zzzzzzz54): nhận khi cụm trích có thật trong lời khách — tin vừa nhắn (hỏi về), hoặc
        # một trong sáu lượt khách gần nhất (xưng hô giữ qua các lượt).
        conv.hoi_ve_luot = None
        h = plan.get("hoi_ve")
        if h in ("phi", "uy_tin", "link_web", "tinh_hinh_ban", "dinh_gia") and _trich_dan_khop(plan.get("hoi_ve_trich_dan"), cuoi):
            conv.hoi_ve_luot = h
        x = plan.get("xung_ho")
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
            nguon = [cuoi] if (conv.xung_ho and conv.xung_ho != x) else gan
            if hop and any(_trich_dan_khop(trich, c) for c in nguon):
                conv.xung_ho = x

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
        # Xin gặp người thật (SRS-5.1zzzzzzz82): giữ nguyên cụm trích để báo admin kèm lời khách.
        if _trich_dan_khop(plan.get("can_nguoi_that"), cuoi):
            conv.y_luot["can_nguoi_that"] = str(plan["can_nguoi_that"]).strip()
        # Hỏi pháp lý / thủ tục (SRS-5.1zzzzzzz176): khoá phải có trong kho (hoặc "khac"), câu hỏi phải nằm nguyên trong tin khách. Nhạy cảm
        # → báo admin cùng đường khách xin gặp người thật (server đọc `can_nguoi_that`).
        hp = plan.get("hoi_phap_ly")
        if isinstance(hp, str) and (hp in phap_ly.KHOA or hp == phap_ly.KHAC) and _trich_dan_khop(plan.get("phap_ly_trich_dan"), cuoi):
            conv.y_luot["hoi_phap_ly"] = hp
            if plan.get("phap_ly_nhay_cam") is True:
                conv.y_luot["phap_ly_nhay_cam"] = True
                conv.y_luot["can_nguoi_that"] = str(plan.get("phap_ly_trich_dan")).strip()
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
        if conv.listing_proposed:
            # Một dòng mỗi lượt chờ duyệt (SRS-5.1zzzzzzz94): bắn thử 21/10 có hai lượt khách bảo đăng mà không thành duyệt, journal không
            # cho biết hụt ở AI (bỏ trống) hay ở code (cụm trích không khớp). Chỉ ghi tên / cờ, không ghi lời khách.
            log.warning("Duyệt: AI=%s trích_khớp=%s xin_đăng=%s → %s", y or "-", _trich_dan_khop(plan.get("duyet_trich_dan"), cuoi),
                        bool(conv.y_luot.get("xin_dang")), conv.duyet_luot or "-")
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
        if conv.role == "buyer" and isinstance(mua, dict) and (
                _trich_dan_khop(mua.get("trich_dan"), cuoi) or _chu_co_trong_loi_khach(mua.get("trich_dan"), self._loi_khach_gan(conv))):
            conv.y_luot["mua"] = mua
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
        co_san = conv.can_mua or self._can_goi_y(conv)
        can = nhac + [c for c in co_san if c.get("id") not in {n.get("id") for n in nhac}]
        viec: list[str] = []
        # SRS-5.1zzzzzzz175: khách bảo đừng báo căn mới nữa / xin báo lại — cờ `buyers.bao_can_moi`, vòng `bao_can_moi` đọc.
        if bid and mua.get("ngung_bao") in ("tat", "bat") and kho.ngung_bao_can(bid, mua["ngung_bao"] == "tat"):
            viec.append("khách KHÔNG muốn nhận tin tự động báo căn mới: hệ thống ĐÃ TẮT — nói ngắn là em không gửi tin báo căn nữa, khách cần "
                        "thì nhắn em bất cứ lúc nào; KHÔNG hỏi lý do, KHÔNG nài" if mua["ngung_bao"] == "tat" else
                        "khách xin được báo khi có căn mới: hệ thống ĐÃ BẬT — nói ngắn có căn hợp nhu cầu em nhắn liền (trong giờ 8–20h)")
        # SRS-5.1zzzzzzz175: khách chê căn → ghi `interests` khong_hop + lý do nguyên văn; không gợi / không báo lại căn đó.
        khong_hop = mua.get("khong_hop") is True
        if khong_hop:
            if not nhac:
                viec.append("khách chê một căn nhưng chưa rõ căn nào: hỏi lại MỘT câu ngắn xem căn nào không hợp, KHÔNG giới thiệu căn mới")
            elif bid:
                ly_do = str(mua.get("ly_do") or "").strip()
                ly_do = ly_do if _trich_dan_khop(ly_do, text) else ""
                if kho.ghi_khong_hop(bid, nhac, ly_do, conv.user_key):
                    bo = {c.get("id") for c in nhac}
                    can = [c for c in can if c.get("id") not in bo]
                    viec.append("ghi căn " + ", ".join(f"#{c.get('code')}" for c in nhac) + " KHÔNG HỢP với khách"
                                + (f" (lý do khách nói: \"{ly_do}\")" if ly_do else "")
                                + ": hệ thống sẽ không gợi / không báo lại căn đó. Nói ngắn đã ghi nhận, KHÔNG thuyết phục lại; có căn khác trong "
                                "CĂN ĐANG RAO thì giới thiệu căn kế, không thì hỏi MỘT câu khách muốn khác đi điểm nào")
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
                viec.append("khách xin xem ảnh nhưng chưa rõ căn nào: hỏi lại MỘT câu ngắn xem khách muốn xem ảnh căn nào, KHÔNG hứa gửi ảnh")
            else:
                co_anh = [c for c in nhac if c.get("code") and c.get("_so_anh") != 0]
                if co_anh:
                    conv.y_luot["xin_anh"] = [str(c["code"]) for c in co_anh]
                    viec.append("hệ thống gửi ảnh " + ", ".join(f"#{c['code']}" for c in co_anh) + " NGAY SAU tin này: nói ngắn là em gửi ảnh "
                                "(KHÔNG dán lại link, KHÔNG nói \"đã gửi ở trên\" hay \"ảnh ở trên\")")
                else:
                    viec.append("căn khách xin ảnh CHƯA có ảnh nào trên hệ thống: nói thật là chưa có, em xin chủ nhà bổ sung hoặc hẹn khách xem "
                                "trực tiếp, KHÔNG hứa gửi ảnh")
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
                viec.append("xin khách MỘT số điện thoại để người phụ trách gọi xác nhận lịch (một câu ngắn; khách không muốn để thì thôi, đừng nài)")
        if hoi and kho.ghi_hoi_chu_nha(bid, dau, hoi):
            viec.append(f"chuyển câu \"{hoi}\" về #{dau.get('code')} cho chủ nhà — có trả lời em báo lại khách ngay")
        conv.y_luot["lich_cho"] = self._lich_cho(kho, bid)
        return viec, can[:4]

    @staticmethod
    def _lich_cho(kho, bid) -> list[dict]:
        """Lịch hẹn xem khách đang chờ xác nhận (đã ghi DB) — đưa vào lời đáp để bot không hỏi lại / tự thêm ngày (SRS-5.1zzzzzzz157)."""
        lay = getattr(kho, "lich_dang_cho", None)
        return lay(bid) if lay is not None and bid else []

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

    def _loc_o_tin(self, conv: "Conversation", fields: dict, bang_chung: dict | None = None) -> dict[str, str]:
        """MỘT cổng cho mọi đường AI ghi ô tin từ lời chat (lượt lập thao tác, đọc lại căn mới tách ra) — SRS-5.1zzzzzzz73/86."""
        bc = bang_chung if isinstance(bang_chung, dict) else {}
        out: dict[str, str] = {}
        uu_the = self._loc_uu_the(conv, (fields or {}).get("uu_the"))
        for k, v in (fields or {}).items():
            if k != "uu_the" and isinstance(v, str) and v.strip():
                g = self._gia_tri_ghi(conv, k, v, bc)
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
            return cau_mau.cau("xac_nhan_an", viec=what)   # câu mẫu sửa ở CRM (SRS-5.1zzzzzzz110)
        if "clear" in kinds:
            return cau_mau.cau("da_an_het")
        if kinds & {"remove", "keep_only"}:
            return cau_mau.cau("da_an_bot", n=self._rao_count(conv))
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
