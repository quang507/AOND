"""Offline mock provider — deterministic, no API key, no network.

Lets the CLI demo and the test-suite run end-to-end. It does *naive* keyword-based
extraction and templated replies, enough to exercise the engine, gamification, and
schema logic. Swap in ClaudeProvider for real language understanding.
"""
from __future__ import annotations

import re
from typing import Any

from ..config import Settings
from .base import LLMProvider, Message

# Very small keyword map mirroring the SRD transcripts. Real extraction is the LLM's job.
_TYPE_KEYWORDS = {
    "nha_pho": ["nhà phố", "nha pho", "1 trệt", "nhà hẻm", "mặt tiền"],
    "chung_cu": ["chung cư", "chung cu", "căn hộ", "can ho", "2pn", "1pn", "3pn", "officetel", "penthouse", "block"],
    "biet_thu": ["biệt thự", "villa"],
    "nha_xuong": ["nhà xưởng", "nha xuong"],
    "kho_bai": ["kho bãi", "kho bai", "kho xưởng"],
    "dat_tho_cu": ["đất thổ cư", "dat tho cu", "đất nền", "dat nen", "lô đất", "thửa đất"],
}


class MockProvider(LLMProvider):
    def __init__(self, settings: Settings):
        self._settings = settings

    def chat(self, system: str, messages: list[Message], max_tokens: int = 256) -> str:
        if "KHÁCH HỎI VỀ PHÍ" in system:
            return (
                "Dạ bên em đăng tin hoàn toàn MIỄN PHÍ nha anh/chị! Tụi em chỉ thu phí 1% "
                "khi giao dịch thành công thôi ạ, không bán được thì không tốn đồng nào. (offline)"
            )
        if "KHÁCH HỎI VỀ UY TÍN" in system or "KHÁCH HỎI VỀ ĐỘ TIN CẬY" in system:
            return (
                "Dạ bên em là nền tảng AI Ơi Nhà Đất thuộc Công ty Nhà Đất, hỗ trợ kết nối mua bán "
                "bất động sản minh bạch và an toàn ạ! (offline)"
            )
        if "KHÁCH HỎI VỀ LINK" in system:
            return (
                "Dạ tin đăng của anh/chị đã được đưa lên hệ thống website https://aioinhadat.com với đầy đủ hình ảnh, "
                "thông số và giá bán rồi ạ! Anh/chị có thể truy cập https://aioinhadat.com để xem trực tiếp nhé ạ. (offline)"
            )
        if "DỰ THẢO TIN RAO" in system:
            # Step 1: show the draft ad and ask for approval — NO fee yet.
            return (
                "Em sẽ rao như vầy nhé:\n\n"
                "Bán gấp nhà phố mặt tiền đường Cao Lỗ Phường 4 Quận 8 gần Parc Mall kinh doanh sầm uất giá 10 tỷ còn thương lượng\n\n"
                "Căn nhà toạ lạc tại vị trí vô cùng đắc địa trên mặt tiền đường lớn, khu dân cư sầm uất, liền kề trung tâm thương mại Parc Mall. Không gian thiết kế hiện đại, thông thoáng, ánh sáng tự nhiên ngập tràn các phòng. Vừa thích hợp để gia đình an cư lâu dài, vừa lý tưởng mở văn phòng công ty, spa hoặc cho thuê mặt bằng sinh dòng tiền ổn định hàng tháng. Chủ nhà thiện chí bán nhanh để chuyển đổi mục đích kinh doanh.\n\n"
                "- Mặt tiền kinh doanh sầm uất Cao Lỗ, Phường 4, Quận 8, lề đường 3m\n"
                "- 132m² đất, 120m² sàn xây dựng, 3 lầu, 4 phòng ngủ\n"
                "- Sổ hồng riêng chính chủ, hoàn công đầy đủ, công chứng ngay\n"
                "- 10 tỷ (thương lượng trực tiếp với khách thiện chí)\n\n"
                "Anh/chị thấy bản tin này hấp dẫn chưa ạ?"
            )
        if "XỬ LÝ SAU KHI XEM BẢN TIN RAO" in system or "DẪN DẮT PHÍ" in system:
            # Step 2: customer approved -> confirm published to website & network immediately (skip fee gate)
            return (
                "Tuyệt vời! Bản tin của anh/chị đã được duyệt và chính thức đăng lên hệ thống website "
                "https://aioinhadat.com cũng như chuyển tới mạng lưới khách mua ngay ạ! Anh/chị có thể xem và "
                "theo dõi tin tại https://aioinhadat.com nhé ạ. (offline)"
            )
        # A friendly, complete, <30-word templated reply that praises then asks one thing.
        return (
            "Em ghi nhận rồi ạ! Anh/chị cho em xin thêm 1 thông tin "
            "để hoàn thiện hồ sơ nhé? (offline)"
        )

    def describe_media(self, items: list[tuple[bytes, str]], instruction: str,
                       max_tokens: int = 1024) -> str:
        # Offline stand-in for vision/OCR: a complete, honest-sounding, confirm-ending reply.
        n = len(items)
        what = "tài liệu/ảnh" if n == 1 else f"{n} ảnh/tài liệu"
        return (
            f"Dạ em xem {what} của mình rồi ạ. Hình như là giấy tờ/hình ảnh BĐS. "
            f"Anh/chị xác nhận giúp em thông tin có đúng không ạ? (offline)"
        )

    def group_media(
        self,
        items: list[tuple[bytes, str]],
        labels: list[str],
        instruction: str,
        json_schema: dict[str, Any],
    ) -> dict[str, Any]:
        # Offline stand-in: no pixels to look at, so group purely by FILENAME hints —
        # "can1_..."/"nha2_..." → separate căn; a chung-ish name → shared project info;
        # anything else falls into one leftover "chưa rõ" group.
        chung_kw = ("chung", "tienich", "amenit", "hoboi", "duan", "cong", "sanh")
        by_index: dict[str, list[str]] = {}
        chung: list[str] = []
        other: list[str] = []
        for label in labels:
            norm = re.sub(r"[^a-z0-9]", "", label.lower())
            m = re.search(r"(?:can|nha|unit)(\d+)", norm)
            if m:
                by_index.setdefault(m.group(1), []).append(label)
            elif any(k in norm for k in chung_kw):
                chung.append(label)
            else:
                other.append(label)
        nhom: list[dict[str, Any]] = [
            {"pham_vi": "can_moi", "tep": files,
             "mo_ta": f"Căn #{idx} (offline — chưa đọc chi tiết ảnh, theo tên tệp {files[0]})."}
            for idx, files in by_index.items()
        ]
        if chung:
            nhom.append({"pham_vi": "chung", "tep": chung, "mo_ta": "Ảnh chung của dự án (offline)."})
        if other:
            nhom.append({"pham_vi": "can_moi", "tep": other, "mo_ta": "Ảnh chưa rõ nhóm (offline)."})
        return {"nhom": nhom}

    def extract_media(
        self, items: list[tuple[bytes, str]], instruction: str, json_schema: dict[str, Any]
    ) -> dict[str, Any]:
        props = json_schema.get("properties", {})
        if "la_giay_to_bds" in props:
            # Check if any filename or hint in instruction matches deed keywords
            # (engine passes "\nTệp: <names>")
            instr_lower = instruction.lower()
            file_part = instr_lower.split("tệp:")[-1] if "tệp:" in instr_lower else ""
            deed_kws = ("so_do", "so_hong", "so-do", "so-hong", "sổ", "gcn", "giay_to", "deed")
            if any(k in file_part for k in deed_kws) and not any(k in file_part for k in ("phan-lo", "bang_gia", "mat_tien")):
                return {
                    "la_giay_to_bds": True,
                    "loai_giay_to": "so_hong",
                    "loai_hinh": "nha_pho",
                    "dia_chi": "123 Nguyễn Thị Thập, P. Tân Phú, Quận 7",
                    "so_thua": "125",
                    "so_to": "45",
                    "dien_tich_dat": "75m2",
                    "dien_tich_nha": "150m2",
                    "tho_cu": "75m2",
                    "kich_thuoc": "5x15m",
                    "phap_ly": "Sổ hồng riêng chính chủ",
                }
            return {"la_giay_to_bds": False}
        # Offline: no pixels to read → not a price list. Tests use a fixed provider double.
        return {}

    def extract(
        self, system: str, messages: list[Message], json_schema: dict[str, Any]
    ) -> dict[str, Any]:
        raw = " ".join(m.content for m in messages if m.role == "user")
        text = raw.lower()
        props = json_schema.get("properties", {})

        # Operation-plan schema: run the same keyword extraction, then reshape the flat flags
        # into an ordered list of operations (the engine's new contract). Keeps all the offline
        # keyword logic; only the OUTPUT shape changes.
        if "operations" in props:
            flat = self.extract(system, messages, {"properties": {}})  # reuse the flat brain
            plan = _flat_to_operations(flat)
            # Như model thật: ô của thao tác "add" căn mới là ô của RIÊNG tin vừa nhắn, không gộp cả lịch sử (SRS-5.1zzzzzzz308).
            for op in plan["operations"]:
                if op.get("op") == "add" and op.get("can_khac_trich") and len([m for m in messages if m.role == "user"]) > 1:
                    cuoi_tin = [m for m in messages if m.role == "user"][-1:]
                    rieng = _flat_to_operations(self.extract(system, cuoi_tin, {"properties": {}}))["operations"]
                    op["fields"] = next((o["fields"] for o in rieng if o.get("fields")), op.get("fields") or {})
            # Đồ giả bóc bằng từ khoá trên chính lời khách → bằng chứng là lời khách (SRS-5.1zzzzzzz73).
            for op in plan["operations"]:
                if isinstance(op.get("fields"), dict) and op["fields"]:
                    op["bang_chung"] = {k: raw for k in op["fields"]}
            _gia_lap_y_luot(plan, messages)
            # Giả lập lượt AI đọc "khách hỏi về gì" (hoi_ve, SRS-5.1zzzzzzz54) — bản thật đọc theo nghĩa; ở đây chỉ là đồ giả
            # cho test offline, trả kèm cụm trích có thật để qua kiểm trích dẫn của engine.
            cuoi = next((m.content for m in reversed(messages) if m.role == "user"), "")
            low = cuoi.lower()
            for hoi_ve, cum in (("phi", ("phí bên em", "hoa hồng", "mất phí")), ("uy_tin", ("công ty gì", "lừa đảo")),
                                ("link_web", ("link bài đăng", "link web", "xem tin ở đâu"))):
                k = next((c for c in cum if c in low), None)
                if k:
                    i = low.index(k)
                    plan["hoi_ve"], plan["hoi_ve_trich_dan"] = hoi_ve, cuoi[i:i + len(k)]
                    break
            return plan

        # Tài liệu chung của dự án hay ảnh một căn (SRS-5.1zzzzzzz55) — đồ giả theo từ khoá.
        if "tai_lieu_chung" in props:
            return {"tai_lieu_chung": any(h in text for h in _MOCK_REFERENCE_DOC)}

        # Column mapping (LLM-assisted spreadsheet import): map odd headers → field slugs.
        if "ánh xạ cột" in system:
            headers = [h.strip() for h in raw.split(",") if h.strip()]
            keymap = {
                "dia_chi": ["địa", "address", "khu vực", "vị trí"], "gia": ["giá", "price"],
                "dien_tich": ["diện", "dt", "area"], "loai_hinh": ["loại", "type"],
                "du_an": ["dự án", "project"], "ket_cau": ["phòng", "kết cấu", "tầng"],
                "unit_type": ["mẫu", "loại căn"], "phap_ly_hoan_cong": ["pháp lý", "sổ"],
                "huong": ["hướng"], "lo_gioi_hem": ["lộ giới", "hẻm"],
            }
            mapping: dict[str, Any] = {}
            for slug, kws in keymap.items():
                for h in headers:
                    if any(k in h.lower() for k in kws):
                        mapping[slug] = h
                        break
            return mapping

        # Unit-type (house model) extraction from a brochure read-out.
        if "ten_mau_nha" in props:
            out: dict[str, Any] = {}
            m = re.search(r"mẫu nhà\s+([^\n,.:;]+)", raw, re.IGNORECASE)
            if m:
                out["ten_mau_nha"] = m.group(1).strip()
            m = re.search(r"(?:dự án|chung cư)\s+([^\n,.:;]+)", raw, re.IGNORECASE)
            if m:
                out["ten_du_an"] = m.group(1).strip()
            m = re.search(r"(\d+(?:[.,]\d+)?)\s*m2", text)
            if m:
                out["dien_tich"] = f"{m.group(1)}m2"
            m = re.search(r"(\d+)\s*phòng ngủ", text)
            if m:
                out["so_phong_ngu"] = m.group(1)
            return out

        # Project extraction (shared attributes of a condo/development).
        if "tien_ich" in props:
            out: dict[str, Any] = {}
            m = re.search(r"(?:dự án|chung cư|tòa|toà)\s+([^\n,.:;]+)", raw, re.IGNORECASE)
            if m:
                out["ten_du_an"] = m.group(1).strip()
            amenities = [a for a in ("hồ bơi", "gym", "công viên", "sauna", "bảo vệ", "thang máy")
                         if a in text]
            if amenities:
                out["tien_ich"] = amenities
            return out

        out = {}

        for slug, kws in _TYPE_KEYWORDS.items():
            if any(kw in text for kw in kws):
                out["loai_hinh"] = slug
                break

        # Address: capture "đường <name>" or "hẻm <...>".
        m = re.search(r"(hẻm[^.,\n]{0,40}|đường\s+[^.,\n]{0,30})", text)
        if m:
            out["dia_chi"] = m.group(1).strip()

        # Area: a standalone house (đất riêng) has 2 areas — fill dien_tich_dat/dien_tich_nha
        # only when the text explicitly ties a number to "đất"/"nhà"; a lone ambiguous m2
        # figure is parked in dien_tich (captured, not dropped) so the bot can ask to resolve
        # it once it has an opening. Other types: always the single dien_tich.
        is_house = out.get("loai_hinh") in ("nha_pho", "biet_thu", "nha_cap_4")
        m_dat = re.search(r"đất\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2", text) if is_house else None
        m_nha = re.search(r"nhà\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*m2", text) if is_house else None
        if m_dat:
            out["dien_tich_dat"] = f"{m_dat.group(1)}m2"
        if m_nha:
            out["dien_tich_nha"] = f"{m_nha.group(1)}m2"
        if not m_dat and not m_nha:
            m = re.search(r"(\d+(?:[.,]\d+)?)\s*m2", text)
            if m:
                out["dien_tich"] = f"{m.group(1)}m2"

        m_dim = re.search(r"(\d+(?:[.,]\d+)?)\s*[x*X]\s*(\d+(?:[.,]\d+)?)", text)
        if m_dim:
            out["kich_thuoc"] = f"{m_dim.group(1)}x{m_dim.group(2)}m"

        m_pn = re.search(r"(\d+)\s*(?:pn|phòng ngủ)", text)
        if m_pn:
            out["so_phong_ngu"] = f"{m_pn.group(1)}PN"

        # Nhiều căn trong 1 tin: "căn 42 và 41", "42 với 41", "các căn 40, 41 và 42". Require an
        # explicit "và"/"với"/"&" conjunction so a trailing area like "căn 42, 70m2" isn't
        # misread as a 2-code list (the real LLM disambiguates by context; the offline mock can't).
        mm = re.search(r"căn(?:\s*số)?[:\s]+(\d+(?:\s*(?:,|và|với|&)\s*\d+)+)", raw, re.IGNORECASE)
        if mm and any(c in mm.group(1).lower() for c in ("và", "với", "&")):
            out["cac_can"] = re.findall(r"\d+", mm.group(1))
        # Mã số căn (pre-sale project unit code): explicit "căn số 42" / "mã (số) căn A-15".
        # (Only the explicit forms — the bare word "căn" is too common to key off safely.)
        m = re.search(r"(?:mã\s*(?:số\s*)?căn|căn\s*số)\s*[:\-]?\s*([A-Za-z0-9][\w\-/.]*)",
                      raw, re.IGNORECASE)
        if m:
            out["ma_so_can"] = m.group(1).strip()

        # Price: "<num> tỷ".
        m = re.search(r"(\d+(?:[.,]\d+)?)\s*tỷ", text)
        if m:
            out["gia"] = f"{m.group(1)} tỷ"

        # Structure: "<n> lầu" / "<n> phòng ngủ".
        if re.search(r"\d+\s*lầu|trệt|lửng", text) or re.search(r"\d+\s*phòng ngủ", text):
            out["ket_cau"] = "đã ghi nhận kết cấu"

        # Trạng thái giao dịch của một căn đã có ("căn 42 bán rồi").
        status_kw = {
            "da_ban": ("bán rồi", "bán được rồi", "đã bán", "bán xong", "bán hết", "chốt rồi"),
            "dung_ban": ("dừng bán", "ngừng bán", "không bán nữa", "tạm dừng"),
            "da_cho_thue": ("cho thuê rồi", "đã cho thuê", "thuê xong"),
        }
        for slug, kws in status_kw.items():
            if any(k in text for k in kws):
                out["trang_thai"] = slug
                break
        # Reference to an existing căn (a "căn <số>" mentioned alongside a status/price change).
        mref = re.search(r"căn\s*(?:số\s*)?(\d+)", raw, re.IGNORECASE)
        if mref and (out.get("trang_thai") or "gia" in out):
            out["can_dang_noi"] = mref.group(1)

        # BỎ BỚT căn khỏi rổ: "chỉ có/giữ căn 23, 24" (keep-only) or "bỏ căn 50, 3" (remove).
        mkeep = re.search(r"chỉ\s+(?:có|giữ|lấy|bán).*?căn\s+([\d\s,vàớiv&]+)", raw, re.IGNORECASE)
        if mkeep:
            out["giu_lai_cac_can"] = re.findall(r"\d+", mkeep.group(1))
        mdrop = re.search(r"(?:bỏ|xóa|loại|hủy)\b.*?căn\s+([\d\s,vàớiv&]+)", raw, re.IGNORECASE)
        if mdrop:
            out["bo_cac_can"] = re.findall(r"\d+", mdrop.group(1))
        # XÓA TOÀN BỘ rổ: "xóa hết", "bỏ hết", "xóa tất cả/toàn bộ/sạch", "làm lại từ đầu".
        if re.search(r"(?:xóa|bỏ|dọn)\s+(?:hết|sạch|tất cả|toàn bộ)|làm lại (?:từ đầu|rổ)", text):
            out["xoa_toan_bo"] = True

        # "A different property" hint → start a new listing.
        # Giá trị = cụm khách nói căn khác — engine kiểm cụm này nằm trong lời khách (SRS-5.1zzzzzzz268).
        cum_moi = next((k for k in ("căn khác", "căn nữa", "còn căn", "thêm căn", "qua căn", "căn tiếp") if k in text), None)
        if cum_moi:
            out["is_new_listing"] = cum_moi

        # Rental hint.
        if "cho thuê" in text or "thuê" in text:
            out["is_rental"] = True

        # Seller-role hint (chủ nhà / lướt sóng / môi giới / sàn / chủ đầu tư). SRS-5.1zzzzzzz213: kèm cụm trích GỌI TÊN vai như schema
        # thật (`seller_role_trich_dan`) — engine chỉ nhận vai khi cụm có trong lời khách.
        vai_tu = next((w for w in ("chủ đầu tư", "chu dau tu", "sàn", "môi giới", "rổ hàng", "giỏ hàng", "lướt sóng", "sang nhượng",
                                   "bán chênh", "chính chủ", "chủ nhà") if w in text), None)
        if vai_tu:
            out["seller_role_trich_dan"] = vai_tu
        if "chủ đầu tư" in text or "chu dau tu" in text:
            out["seller_role"] = "chu_dau_tu"
        elif "sàn" in text:
            out["seller_role"] = "san"
        elif "môi giới" in text or "rổ hàng" in text or "giỏ hàng" in text:
            out["seller_role"] = "moi_gioi"
        elif "lướt sóng" in text or "sang nhượng" in text or "bán chênh" in text:
            out["seller_role"] = "luot_song"
        elif "chính chủ" in text or "chủ nhà" in text:
            out["seller_role"] = "chu_nha"

        # Unit-type / mẫu nhà mentioned on a listing.
        m = re.search(r"(?:mẫu nhà|loại căn|mẫu)\s+([^\n,.:;]+)", raw, re.IGNORECASE)
        if m:
            out["unit_type"] = m.group(1).strip()

        # Mock intent extraction (for offline tests without real LLM)
        if any(k in text for k in ("tìm mua", "cần mua", "muốn mua", "tìm nhà", "tìm căn", "cần thuê", "tìm thuê", "muốn thuê", "hỏi mua")):
            out["user_intent"] = "buy"
            lead_data: dict[str, str] = {}
            if "bình thạnh" in text:
                lead_data["khu_vuc"] = "Bình Thạnh"
            m_g = re.search(r"(\d+(?:[.,]\d+)?\s*tỷ)", text)
            if m_g:
                lead_data["ngan_sach"] = m_g.group(1)
            if "nhà phố" in text:
                lead_data["loai_bds"] = "nha_pho"
            elif "chung cư" in text or "căn hộ" in text:
                lead_data["loai_bds"] = "chung_cu"
            out["buyer_lead"] = lead_data
        elif any(k in text for k in ("bán", "cần bán", "muốn bán", "gửi bán", "cho thuê", "rao bán", "ký gửi")):
            out["user_intent"] = "sell"

        return out


def _flat_to_operations(flat: dict[str, Any]) -> dict[str, Any]:
    """Reshape the mock's flat flag dict into the operation-plan the engine now expects.
    Precedence mirrors the old engine: keep_only/remove > clear > act-on-existing (status /
    reference) > fan-out add > new-listing add > update. Basket-state-dependent decisions
    (does a referenced code already exist?) are left to the engine, which resolves targets."""
    out = dict(flat)
    result: dict[str, Any] = {"operations": []}
    role = out.pop("seller_role", None)
    trich_vai = out.pop("seller_role_trich_dan", None)
    if role:
        result["seller_role"] = role
        if trich_vai:
            result["seller_role_trich_dan"] = trich_vai
    if out.pop("is_rental", None):
        result["is_rental"] = True
    intent = out.pop("user_intent", None)
    if intent:
        result["user_intent"] = intent
    blead = out.pop("buyer_lead", None)
    if blead:
        result["buyer_lead"] = blead
    ops = result["operations"]

    keep = list(out.pop("giu_lai_cac_can", None) or [])
    drop = list(out.pop("bo_cac_can", None) or [])
    clear = bool(out.pop("xoa_toan_bo", False))
    status = out.pop("trang_thai", None)
    ref = out.pop("can_dang_noi", None)
    codes = list(out.pop("cac_can", None) or [])
    is_new = out.pop("is_new_listing", False)
    fields = {k: v for k, v in out.items() if isinstance(v, str)}
    data = {k: v for k, v in fields.items() if k != "ma_so_can"}

    if keep:  # an explicit keep/drop wins over "bỏ hết" wording
        ops.append({"op": "keep_only", "targets": keep})
    elif drop:
        ops.append({"op": "remove", "targets": drop})
    elif clear:
        ops.append({"op": "clear"})
    elif status and (codes or ref):  # trạng thái báo cho (những) căn đã nhắc
        ops.append({"op": "set_status", "status": status, "targets": codes or [ref], "fields": data})
    elif len(codes) >= 2:  # several units of the same model in one message
        ops.append({"op": "add", "targets": codes, "fields": data})
    elif is_new:  # "thêm căn"/"còn căn nữa" → a NEW căn (beats a spurious ref sub-match)
        ops.append({"op": "add", "fields": fields, "can_khac_trich": is_new})
    elif ref:  # a price/field edit that names one existing căn
        ops.append({"op": "update", "target": ref, "fields": data})
    elif status:  # bare status report on the active căn
        ops.append({"op": "set_status", "status": status, "fields": fields})
    elif fields:  # ordinary data on the active căn
        ops.append({"op": "update", "fields": fields})
    return result


# ── Đồ giả cho các ô lượt AI đọc theo nghĩa (SRS-5.1zzzzzzz55) ──────────────────────────────────────────────────────────
# Bản thật (Claude) đọc theo NGHĨA; đây chỉ là đồ giả theo từ khoá để test offline chạy được — các danh sách này chính là bộ
# dò từ khoá engine từng dùng ở production, nay chỉ còn ở đồ giả. Trả cụm trích CÓ THẬT trong tin để qua kiểm trích dẫn.
_MOCK_MEDIA_REQUEST = ("bản vẽ", "bản vẻ", "bản thiết kế", "mặt cắt", "sơ đồ", "phối cảnh", "layout", "brochure", "mẫu thiết kế",
                       "bản đồ", "xem mặt bằng", "xin mặt bằng", "gửi mặt bằng", "mặt bằng tầng", "mặt bằng căn",
                       "mặt bằng tổng thể", "mặt bằng chi tiết")
_MOCK_DOC_TOPIC = ("diện tích", "lô ", "lô số", "mẫu nhà", "mẫu ", "gói ", "air", "max", "tiện ích", "hướng", "vị trí",
                   "kích thước", "mặt tiền", "pháp lý", "nội thất", "phân lô", "sơ đồ", "cosmo", "fusion", "opus", "office",
                   "cashmere", "signature")
_MOCK_QUESTION = ("?", "bao nhiêu", "là gì", "thế nào", "gồm gì", "gồm những", "khác nhau", "có gì", "cho hỏi", "cho em hỏi",
                  "cho anh hỏi", "cho chị hỏi", "ra sao", "mấy ", "như thế nào")
_MOCK_LEARN = ("phòng", "tầng", "lầu", "m2", "diện tích", "layout", "bố trí", "hướng", "mặt tiền", "hồ bơi", "gym", "cổng",
               "tiện ích", "an ninh", "công viên", "sổ", "pháp lý", "thang máy")
_MOCK_REFERENCE_DOC = ("phân lô", "phan lo", "sơ đồ", "so do", "bản đồ", "ban do", "mặt bằng", "mat bang", "quy hoạch",
                       "quy cách", "phụ lục", "tiện ích", "layout", "tổng thể", "phối cảnh", "bàn giao", "quy cach", "phu luc")
_MOCK_AFFIRM = {"dung", "ung", "u", "uh", "um", "ok", "oke", "okay", "okie", "co", "phai", "chuan", "dong y", "xac nhan", "yes",
                "y", "duoc", "xoa", "xoa het", "xoa di", "bo", "dong ri"}
_MOCK_DENY = {"khong", "ko", "k", "thoi", "dung lai", "khoan", "dung co", "huy", "no", "giu", "giu lai", "dung xoa",
              "khong xoa", "sai"}


def _mock_bo_dau(s: str) -> str:
    import unicodedata
    s = s.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _gia_lap_y_luot(plan: dict[str, Any], messages: list[Message]) -> None:
    cuoi = next((m.content for m in reversed(messages) if m.role == "user"), "")
    low = cuoi.lower()
    commercial = any(p in low for p in ("cho thuê mặt bằng", "thuê mặt bằng", "mặt bằng kinh doanh", "bán mặt bằng",
                                        "mặt bằng cho thuê", "mặt bằng mặt tiền", "tìm mặt bằng"))
    if not commercial or any(k in low for k in ("xem bản vẽ", "cho xem", "gửi bản vẽ", "xin bản vẽ")):
        if any(h in low for h in _MOCK_MEDIA_REQUEST + ("phân lô", "quy hoạch")):
            plan["xin_xem_ban_ve"] = cuoi
            plan["operations"] = []
            if any(h in low for h in ("phân lô", "phan lo", "bản đồ", "ban do", "quy hoạch", "quy hoach", "tổng thể")):
                plan["ban_do_du_an"] = True
    if any(k in low for k in _MOCK_DOC_TOPIC) and any(q in low for q in _MOCK_QUESTION):
        plan["cau_hoi_du_an"] = cuoi
    if any(h in low for h in _MOCK_LEARN):
        plan["mo_ta_du_an"] = cuoi
    t = re.sub(r"[^\w\s]", " ", _mock_bo_dau(low)).strip()
    if t and len(t) <= 40:
        w = set(t.split())
        if t in _MOCK_DENY or w & _MOCK_DENY:
            plan["xac_nhan_xoa"], plan["xac_nhan_trich_dan"] = "tu_choi", cuoi
        elif t in _MOCK_AFFIRM or w & _MOCK_AFFIRM:
            plan["xac_nhan_xoa"], plan["xac_nhan_trich_dan"] = "dong_y", cuoi

