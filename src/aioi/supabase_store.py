"""Supabase-backed ConversationStore — Single Source of Truth for AOND.

Persists sellers, conversations, listings, and leads directly to Supabase Postgres
so that deleting or editing a record on the Web CRM (aioinhadat.vercel.app/admin)
immediately syncs to the Zalo Bot in real time without stale state.

Falls back gracefully to SQLite if Supabase credentials are not supplied.
"""
from __future__ import annotations

import json
import logging
import os
import copy
import queue
import re
import threading
import time
import urllib.error
import urllib.request
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Callable, Any, TYPE_CHECKING

from .kho_anh import BUCKET_CONG_KHAI, BUCKET_RIENG, la_uuid
from .mua import KhoNguoiMua
from .revenue import SALE_FEE_RATE
from .prompts import FIELD_LABELS
from .schema import TYPE_TO_GROUP, Property, _calc_area_from_dimension
from .assistants import assign_assistant
from .dia_danh import bo_dau

if TYPE_CHECKING:
    from .engine import Conversation, Listing, Turn, BuyerLead

log = logging.getLogger("aioi.supabase_store")


# 18/10/2026: cột `sellers.seller_type` trên Supabase mang mã của CRM / lõi cũ (`ccrb`, `nmg`), còn engine cần `SellerRole`
# (`chu_nha`, `moi_gioi`…). Nạp chuỗi trần vào `Conversation.user_type` làm `_build_result` sập ở `.value` (AttributeError → 500,
# bot im với khách thật). Mọi đường nạp vai từ Supabase đi qua hàm này.
_SELLER_TYPE_SANG_VAI = {"ccrb": "chu_nha", "nmg": "moi_gioi"}


def vai_tu_seller_type(raw: Any) -> "SellerRole":
    from .revenue import SellerRole

    ma = str(raw or "").strip().lower()
    ma = _SELLER_TYPE_SANG_VAI.get(ma, ma)
    try:
        return SellerRole(ma)
    except ValueError:
        return SellerRole.UNKNOWN


# 18/10/2026 (SRS-5.1zzzzzzz37): `save` từng đọc `li.prop.dien_tich` / `li.prop.gia` — `Property` không có hai thuộc tính đó
# (giá trị nằm trong `prop.fields`), nên MỌI lượt có tin văng AttributeError và tin người bán không bao giờ vào bảng `listings`.
# Giá gửi CHUỖI GỐC vào `price_raw`: trigger `listings_set_price_vnd` tính `price_vnd` bằng `parse_vnd` (luật tiền một nguồn,
# không đổi tiền ở Python). `legal_status` chỉ nhận mã (`so_hong_rieng`…): chữ khách gõ đổi qua `boc_thong_so` của DB. `status`
# chỉ đặt lúc TẠO tin (`cho_thong_tin`; trigger `listings_quyet_dinh_dang_tin` tự lên `dang_ban` khi đủ) — `dang_rao` cũ không
# có trong CHECK, và ghi đè mỗi lượt sẽ xoá trạng thái admin đặt trên CRM (`an`, `da_chot`).
MA_PHAP_LY = {"so_hong_rieng", "so_hong_chung", "so_hong", "hdmb", "giay_tay"}

# Cột thông số `listings` lấy từ `boc_thong_so` (cùng bộ cột `ap_thong_so` của DB nhận), trừ legal_status (đi `_ma_phap_ly`) và
# rent_income_vnd (chỉ tin bán, đọc tiền là việc của parse_vnd).
COT_THONG_SO = ("frontage_m", "length_m", "rear_width_m", "legal_area_m2", "built_area_m2", "alley_width_m",
                "distance_to_street_m", "floors", "floors_text", "floor", "bedrooms", "bathrooms", "year_built",
                "has_completion", "has_elevator", "car_in_house", "corner_lot", "negotiable", "access_type",
                "planning_status", "furnishing", "direction")
_O_KHONG_PHAI_THONG_SO = {"dia_chi", "duong", "phuong", "quan", "gan_nga_tu", "du_an", "ma_so_can", "unit_type", "gia",
                          "loai_hinh", "phap_ly", "hinh_anh", "ly_do_ban", "trang_thai", "phi_gui_xe", "yeu_cau_xe_hoi"}
# Nhãn ô là chữ CỦA MÌNH, không phải lời khách — mà `boc_thong_so` dò chữ khoá trên cả chuỗi "nhãn: giá trị". Soát 20/10/2026
# (SRS-5.1zzzzzzz85: gọi boc_thong_so("<nhãn>: x") cho mọi nhãn FIELD_LABELS) — 10/74 nhãn tự bật một cột dù giá trị vô nghĩa: tin đất
# "giá chỉ áp dụng trong tháng 10" lên web thành "thương lượng"; "vị trí mặt tiền hay hẻm: hẻm 3m" → mặt tiền; "căn thường hay căn
# góc: căn thường" → căn góc; "thang máy di chuyển: không có" → có thang máy; "bề ngang mặt tiền: 4m" → mặt tiền. Các ô đó gửi giá trị
# trơn (ô bề ngang kèm chữ "ngang" để còn đọc ra số đo); phí gửi xe / yêu cầu xe hơi của người mua không phải thông số căn.
NHAN_TRUNG_TINH = {"lo_gioi_hem": "", "mat_tien": "ngang", "thuong_luong": "", "can_goc": "", "thang_may": "",
                   "phap_ly_hoan_cong": "", "phap_ly_so_do": ""}

# Loại hình: mã lõi Python (schema.TYPE_TO_GROUP, 26 mã) → enum `listings.property_type` (12 mã của CRM) — SRS-5.1zzzzzzz68. Trước bản
# này save() ghi thẳng mã lõi: "nha_cap_4" (DB là "nha_cap4"), "chdv", "can_ho"… không có trong enum → PostgREST 22P02, cả dòng tin
# không ghi được. Mã không chắc thuộc loại nào (du_an, shophouse_du_an) thì không ghi cột — để DB giữ giá trị đang có.
LOAI_SANG_DB = {
    "nha_pho": "nha_pho", "nha_cap_4": "nha_cap4", "biet_thu": "biet_thu", "chung_cu": "chung_cu", "can_ho": "chung_cu",
    "officetel": "chung_cu", "penthouse": "chung_cu", "dat": "dat", "dat_tho_cu": "dat", "dat_du_an": "dat",
    "dat_nong_nghiep": "dat_nong_nghiep", "dat_kinh_doanh": "dat_kinh_doanh", "dat_skc": "dat_kinh_doanh",
    "dat_tmd": "dat_kinh_doanh", "kho_xuong": "kho_xuong", "kho_bai": "kho_xuong", "nha_xuong": "kho_xuong",
    "phong_tro": "phong_tro", "toa_nha": "toa_nha", "chdv": "toa_nha", "khach_san": "toa_nha", "mat_bang": "mat_bang",
    "shophouse": "mat_bang", "chua_ro": "chua_ro",
}
DB_SANG_LOAI = {"nha_cap4": "nha_cap_4"}


# Tiền tố chung của tên dự án — "Khu đô thị Sala" và "Sala" là một; phần còn lại phải trùng hẳn (SRS-5.1zzzzzzz86).
_TIEN_TO_DU_AN = re.compile(r"^(khu do thi|khu dan cu|khu can ho|kdc|kdt|du an|chung cu|can ho|cao oc|toa nha)\s+")


def _khoa_ten_du_an(ten: str | None) -> str:
    t = re.sub(r"[^a-z0-9]+", " ", bo_dau(str(ten or ""))).strip()
    return re.sub(r"\s+", "", _TIEN_TO_DU_AN.sub("", t))


def cung_ten_du_an(khach: str | None, kho: str | None) -> bool:
    """Tên dự án khách nói và tên trong kho là MỘT dự án: bỏ dấu, bỏ tiền tố chung, trùng hẳn. "LakeView City" ≡ "Lakeview city";
    "Vinhomes Grand Park" ≠ "Glory Heights - Vinhomes Grand Park" (toà con — không đoán)."""
    a, b = _khoa_ten_du_an(khach), _khoa_ten_du_an(kho)
    return bool(a) and a == b


def ma_loai_db(loai: str | None) -> str | None:
    """Mã lõi → mã enum DB; None = không ghi cột."""
    return LOAI_SANG_DB.get(loai or "")


def loai_tu_db(loai_db: str | None, boc_tach: dict[str, Any] | None = None) -> str | None:
    """Mã enum DB → mã lõi; ô `loai_hinh` lõi đã ghi trong boc_tach (cụ thể hơn, vd chdv) đứng trước."""
    cu = (boc_tach or {}).get("loai_hinh")
    if isinstance(cu, str) and cu in TYPE_TO_GROUP:
        return cu
    return DB_SANG_LOAI.get(loai_db or "", loai_db) if loai_db else None


# Trạng thái tin: chữ của engine (STATUS_MAP) ↔ mã cột `listings.status` (SRS-5.1zzzzzzz63). Trước bản này save() không bao giờ ghi
# status — khách nói "bán rồi / ngưng rao" chỉ đổi trong bộ nhớ, web vẫn hiện tin.
TRANG_THAI_SANG_DB = {"đã bán": "da_chot", "đã cho thuê": "da_chot", "đã cọc": "da_coc",
                      "dừng bán": "an", "không rao": "an", "thôi đăng ký": "an"}
DB_SANG_TRANG_THAI = {"da_chot": "đã bán", "da_coc": "đã cọc", "an": "không rao"}
_DB_DANG_HIEN = ("dang_ban", "dang_quan_tam", "da_coc")


def ma_trang_thai(trang_thai: str | None, db_hien_tai: str | None) -> str | None:
    """Mã `listings.status` cần ghi, hoặc None = để nguyên (trigger `listings_quyet_dinh_dang_tin` tự quyết cho_thong_tin ↔ dang_ban).
    "đã cọc" chỉ áp cho tin ĐANG HIỆN — tin chưa duyệt bản nháp không vì "cọc rồi" mà lên web. "đang bán" trên tin đang ẩn / đã chốt /
    đã cọc → về cho_thong_tin để trigger xét lại điều kiện lên web (đủ giá · diện tích · phường + khách đã duyệt)."""
    ma = TRANG_THAI_SANG_DB.get(trang_thai or "")
    if ma == "da_coc" and db_hien_tai not in _DB_DANG_HIEN:
        return None
    if ma:
        return None if ma == db_hien_tai else ma
    if db_hien_tai in ("an", "da_chot", "da_coc"):
        return "cho_thong_tin"
    return None


def trang_thai_tu_db(ma: str | None, la_thue: bool = False) -> str:
    chu = DB_SANG_TRANG_THAI.get(ma or "", "đang bán")
    return "đã cho thuê" if chu == "đã bán" and la_thue else chu
def so_m2(fields: dict[str, str], thue: bool = False) -> float | None:
    """Diện tích (m²) cột `listings.area_m2`: ĐẤT trước (`dien_tich_dat`), rồi `dien_tich`, rồi `kich_thuoc`. Ô mang dạng ngang x dài
    ("4,5x11") thì tính tích — bắn thử 19/10: `dien_tich_dat` = "4,5x11" thành 4,5 m², `dien_tich` = sàn 170 m² thành diện tích
    đất (SRS-5.1zzzzzzz73). Tin CHO THUÊ: diện tích SỬ DỤNG (sàn) trước — người thuê tìm theo chỗ ở được, và tiêu đề tin thuê ghi số
    đó (chat tester 20/10: tiêu đề 35m², web 18m² đất 4 × 4,5; SRS-5.1zzzzzzz91, [giả định BA])."""
    for k in (("dien_tich_nha", "dien_tich", "dien_tich_dat") if thue else ("dien_tich_dat", "dien_tich")):
        tinh = _calc_area_from_dimension(str(fields.get(k) or ""))
        if tinh:
            return float(tinh[:-2])
        m = re.search(r"\d+(?:[.,]\d+)?", str(fields.get(k) or ""))
        if m:
            v = float(m.group(0).replace(",", "."))
            if v > 0:
                return v
    tinh = _calc_area_from_dimension(str(fields.get("kich_thuoc") or ""))
    return float(tinh[:-2]) if tinh else None


class SupabaseConversationStore(KhoNguoiMua):
    """Persistent ConversationStore storing state in Supabase REST API (PostgreSQL).
    Implements ConversationStore protocol: save, load, reset.
    """

    def __init__(
        self,
        url: str | None = None,
        key: str | None = None,
        fallback_store: Any | None = None,
    ):
        base_url = (url or os.environ.get("SUPABASE_URL", "https://rqxmmqmctpklqcmbfxuj.supabase.co")).rstrip("/")
        if not base_url.endswith("/rest/v1"):
            self.url = f"{base_url}/rest/v1"
        else:
            self.url = base_url
        self.key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.fallback = fallback_store
        self._seller_cache: dict[str, str] = {}
        self._conv_cache: dict[str, str] = {}
        self._anh_da_ghi: set[str] = set()   # "bucket/khoá" đã có dòng listing_media — khỏi gửi lại mỗi lượt
        self._thong_so_nho: dict[tuple[str, str], dict[str, Any]] = {}   # (loại, chữ đã gửi) → cột thông số boc_thong_so trả
        self._cau_chuan_nho: tuple[float, list[dict[str, Any]]] | None = None   # (lúc đọc, dòng) — đọc lại sau 60 giây
        self._du_an_nho: dict[str, dict[str, Any] | None] = {}   # tên dự án khách nói → dòng `projects` khớp rõ (hoặc None)
        self._active_da_ghi: dict[str, str] = {}   # seller_id → id căn đang nói đã ghi lên sellers.active_listing_id

    @property
    def is_configured(self) -> bool:
        return bool(self.url and self.key)

    # --- HTTP Helpers ----------------------------------------------------

    def _request(self, method: str, endpoint: str, data: dict | list | None = None, prefer: str | None = None) -> Any:
        full_url = f"{self.url}/{endpoint}"
        body = json.dumps(data).encode("utf-8") if data is not None else None
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        req = urllib.request.Request(full_url, data=body, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=8) as resp:
            content = resp.read()
            if content:
                try:
                    return json.loads(content.decode("utf-8"))
                except Exception:
                    return None
            return None

    def _get(self, endpoint: str) -> list[dict]:
        res = self._request("GET", endpoint)
        return res if isinstance(res, list) else []

    def _post(self, endpoint: str, data: dict, prefer: str = "return=representation") -> list[dict]:
        res = self._request("POST", endpoint, data=data, prefer=prefer)
        return res if isinstance(res, list) else []

    def _dia_ban(self, fields: dict[str, str]) -> tuple[str | None, str | None, str]:
        """(phường mới = wards.ten_day_du, quận cũ) từ chữ khách gõ — nhận cả kiểu trước gộp ("P.1, Q.5") và sau gộp ("Phường Chợ
        Quán") qua `rpc/chuan_dia_ban` (20261018e, SRS-5.1zzzzzzz39). Phường cũ bị chia (mo_ho) / không nhận ra → không ghi phường;
        lỗi mạng → không ghi gì (cột cũ giữ nguyên)."""
        chu = ", ".join(str(fields[k]) for k in ("dia_chi", "phuong", "quan") if fields.get(k))
        phuong, quan = self._chuan_dia_ban(chu)
        # Nguồn phường (cột `ward_source`, SRS-5.1zzzzzzz89): tra từ chữ khách gõ = khách nói; lấy theo dự án = suy đoán.
        nguon = "chu_xac_nhan" if phuong else "suy_doan"
        # Căn hộ trong dự án: khách thường chỉ nói tên dự án — lấy phường theo địa chỉ dự án trong kho (SRS-5.1zzzzzzz41), chỉ
        # khi tên khớp rõ một dự án (`_du_an`, SRS-5.1zzzzzzz86 — bản trước lấy dòng đầu của tìm gần đúng).
        # Cột phường của dự án (đã là tên chuẩn) tra TRƯỚC, chữ địa chỉ dài chỉ là lưới đỡ (SRS-5.1zzzzzzz87): bắn thử KB5 20/10 —
        # địa chỉ Ny'ah ghi "Phường Phú Định (Phường 16, Quận 8 cũ)", đọc chung với cột phường thành hai phường → `mo_ho`, tin
        # không bao giờ có phường, bot hỏi phường mãi dù kho đã biết.
        d = self._du_an(fields)
        if not phuong and d:
            for khoa in (("ward", "district"), ("location_raw", "ward", "district")):
                chu2 = ", ".join(str(d[k]) for k in khoa if d.get(k))
                if not chu2:
                    continue
                p2, q2 = self._chuan_dia_ban(chu2)
                quan = quan or q2
                if p2:
                    phuong = p2
                    break
        return phuong, quan, nguon

    def phuong_theo_du_an(self, fields: dict[str, Any]) -> str | None:
        """Phường (tên chuẩn) của dự án khách nói, khi tên khớp rõ một dự án trong kho — cùng đường với `_dia_ban` (SRS-5.1zzzzzzz93)."""
        d = self._du_an(fields)
        if not d:
            return None
        for khoa in (("ward", "district"), ("location_raw", "ward", "district")):
            chu = ", ".join(str(d[k]) for k in khoa if d.get(k))
            if chu:
                p, _ = self._chuan_dia_ban(chu)
                if p:
                    return p
        return None

    def cau_chuan_mau(self) -> list[dict[str, Any]]:
        """Câu chuẩn người chấm đã sửa / đã chấm (bảng `cau_chuan`, SRS-5.1zzzzzzz88) — 8 dòng mới nhất, làm ví dụ trong prompt. Sửa ở
        CRM là bot đổi trong vòng 60 giây, không cần cài lại. Lỗi đọc → [] (bot vẫn trả lời, không ví dụ)."""
        if not self.is_configured:
            return []
        nho = getattr(self, "_cau_chuan_nho", None)
        if nho and time.time() - nho[0] < 60:
            return nho[1]
        try:
            rows = self._get("cau_chuan?select=ngu_canh,cau_bot,cau_chuan,diem,ghi_chu&dung_lam_mau=eq.true"
                             "&or=(cau_chuan.not.is.null,diem.not.is.null)&order=updated_at.desc&limit=8")
        except Exception as e:  # noqa: BLE001
            log.warning("cau_chuan_mau lỗi: %s", e)
            rows = nho[1] if nho else []
        self._cau_chuan_nho = (time.time(), rows)
        return rows

    def _du_an(self, fields: dict[str, Any]) -> dict[str, Any] | None:
        """Dự án trong kho `projects` mà tin thuộc về — MỘT chỗ quyết cho cả `project_id` lẫn phường theo dự án (SRS-5.1zzzzzzz86).
        Bắn thử 20/10: căn LakeView City / Masteri Thảo Điền có tên dự án trùng kho mà `project_id` không bao giờ được ghi (trang dự
        án không thấy tin), còn phường thì lấy từ dòng ĐẦU của `match_projects` (tìm gần đúng) — "Vinhomes Grand Park" có thể ra
        "Glory Heights - Vinhomes Grand Park" (một toà khác). Chỉ nhận khi tên khớp rõ (`cung_ten_du_an`); không chắc thì không gắn."""
        ten = str(fields.get("du_an") or "").strip()
        if not ten:
            return None
        # Chỉ nhớ lần TÌM RA (SRS-5.1zzzzzzz87): chat chị N. 20/10 nhắc "Nyah Phú Định" lúc dự án chưa nạp vào kho, lần hụt bị nhớ
        # tới khi lõi khởi động lại nên tin không bao giờ gắn `project_id` dù dự án vào kho 35 phút sau.
        if self._du_an_nho.get(ten) is None:
            try:
                da = self._request("POST", "rpc/match_projects?select=id,name,location_raw,ward,district", data={"p_text": ten})
            except Exception as e:  # noqa: BLE001 — không gắn dự án lượt này, lượt sau thử lại
                log.warning("match_projects lỗi: %s", e)
                return None
            if len(self._du_an_nho) > 500:
                self._du_an_nho.clear()
            self._du_an_nho[ten] = next((x for x in (da if isinstance(da, list) else []) if cung_ten_du_an(ten, x.get("name"))), None)
        return self._du_an_nho[ten]

    def _nho_tra(self, ten: str, chu: str, goi: Callable[[], Any]) -> Any:
        """Kết quả hàm tra CỐ ĐỊNH của DB (cùng chữ vào → cùng kết quả ra) nhớ trong bộ nhớ (SRS-5.1zzzzzzz92: mỗi lượt lưu 2–3 lần, mỗi
        lần gọi lại `chuan_dia_ban` + `boc_thong_so` với đúng chữ cũ — khâu ghi kho trung bình 2,8 s). Lỗi mạng không nhớ."""
        nho = self.__dict__.setdefault("_nho_ham", {})
        khoa = (ten, chu)
        if khoa not in nho:
            if len(nho) > 2000:
                nho.clear()
            nho[khoa] = goi()
        return nho[khoa]

    def _chuan_dia_ban(self, chu: str) -> tuple[str | None, str | None]:
        if not chu:
            return None, None
        try:
            kq = self._nho_tra("chuan_dia_ban", chu, lambda: self._request("POST", "rpc/chuan_dia_ban", data={"p_text": chu}))
        except Exception as e:
            log.warning("chuan_dia_ban lỗi: %s", e)
            return None, None
        dong = kq[0] if isinstance(kq, list) and kq else {}
        return dong.get("phuong"), dong.get("quan_cu")

    def _ma_phap_ly(self, chu: str | None) -> str | None:
        """Chữ pháp lý khách gõ → mã cột `legal_status` (qua `boc_thong_so` của DB); không nhận ra → None (không ghi)."""
        chu = str(chu or "").strip()
        if not chu:
            return None
        if chu in MA_PHAP_LY:
            return chu
        try:
            kq = self._nho_tra("boc_thong_so", chu, lambda: self._request("POST", "rpc/boc_thong_so", data={"p_text": chu}))
        except Exception as e:
            log.warning("boc_thong_so lỗi: %s", e)
            return None
        ma = kq.get("legal_status") if isinstance(kq, dict) else None
        return ma if ma in MA_PHAP_LY else None

    def _thong_so(self, fields: dict[str, Any], loai: str | None) -> dict[str, Any]:
        """Cột thông số (ngang · dài · tầng · phòng ngủ · WC · đường vào · hướng · nội thất …) đọc từ các ô AI đã bóc, qua cùng bộ đọc
        `boc_thong_so` của DB (SRS-5.1zzzzzzz65). Trước bản này chỉ `listing_facts` (bot TypeScript, đã gỡ) điền các cột đó → tin
        từ lõi Python lên web không có bảng thông số. Ô địa chỉ / giá / dự án không đưa vào (số nhà, "hẻm 123" không phải thông số);
        pháp lý đi đường riêng `_ma_phap_ly`. Nhớ theo chữ đã gửi để không gọi lại mỗi lượt."""
        dong = []
        for k, v in fields.items():
            if k in _O_KHONG_PHAI_THONG_SO or str(k).startswith("_") or not isinstance(v, (str, int, float)) or not str(v).strip():
                continue
            nhan = NHAN_TRUNG_TINH[k] if k in NHAN_TRUNG_TINH else FIELD_LABELS.get(k, k.replace("_", " ")).split(" (")[0]
            dong.append(f"{nhan}: {v}" if nhan else str(v))
        chu = "; ".join(dong)
        if not chu:
            return {}
        khoa = (loai or "", chu)
        if khoa not in self._thong_so_nho:
            try:
                kq = self._request("POST", "rpc/boc_thong_so", data={"p_text": chu, "p_type": loai})
            except Exception as e:  # noqa: BLE001 — thông số là phần thêm, tin vẫn lưu
                log.warning("boc_thong_so (thông số) lỗi: %s", e)
                return {}
            if len(self._thong_so_nho) > 2000:
                self._thong_so_nho.clear()
            self._thong_so_nho[khoa] = {c: kq[c] for c in COT_THONG_SO if isinstance(kq, dict) and kq.get(c) is not None}
        return dict(self._thong_so_nho[khoa])

    def _patch(self, endpoint: str, data: dict) -> None:
        self._request("PATCH", endpoint, data=data, prefer="return=minimal")

    def _delete(self, endpoint: str) -> None:
        self._request("DELETE", endpoint, prefer="return=minimal")

    # --- Seller & Conversation Resolution --------------------------------

    def _get_or_create_seller(self, user_key: str, name: str | None = None) -> str | None:
        if user_key in self._seller_cache:
            return self._seller_cache[user_key]

        sellers = self._get(f"sellers?zalo_user_id=eq.{urllib.parse.quote(user_key)}")
        if sellers:
            seller_id = sellers[0]["id"]
            if name and ("Khách Zalo" in sellers[0].get("name", "") or not sellers[0].get("name")):
                try:
                    self._patch(f"sellers?id=eq.{seller_id}", {"name": name})
                except Exception as e:
                    log.warning("Failed to patch seller name: %s", e)
            self._seller_cache[user_key] = seller_id
            return seller_id

        # Create new seller row
        short_uid = user_key[-4:] if len(user_key) >= 4 else user_key
        display_name = name or f"Khách Zalo {short_uid}"
        try:
            res = self._post(
                "sellers",
                {"zalo_user_id": user_key, "name": display_name, "seller_type": "ccrb"}
            )
            if res:
                seller_id = res[0]["id"]
                self._seller_cache[user_key] = seller_id
                return seller_id
        except Exception as e:
            log.error("Failed to create seller in Supabase: %s", e)
        return None

    def _get_or_create_conversation(self, seller_id: str) -> str | None:
        if seller_id in self._conv_cache:
            return self._conv_cache[seller_id]

        convs = self._get(f"conversations?seller_id=eq.{seller_id}&channel=eq.zalo_personal_test")
        if convs:
            conv_id = convs[0]["id"]
            self._conv_cache[seller_id] = conv_id
            return conv_id

        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            res = self._post(
                "conversations",
                {"seller_id": seller_id, "channel": "zalo_personal_test", "started_at": now_iso}
            )
            if res:
                conv_id = res[0]["id"]
                self._conv_cache[seller_id] = conv_id
                return conv_id
        except Exception as e:
            log.error("Failed to create conversation in Supabase: %s", e)
        return None

    def _ghi_so_loi(self, nguon: str, chi_tiet: str) -> None:
        """Một dòng sổ lỗi qua `log_loi` (DB che SĐT). Không bao giờ ném — ghi sổ hỏng thì chỉ còn journal."""
        try:
            self._request("POST", "rpc/log_loi", data={"p_source": nguon, "p_detail": chi_tiet[:500]})
        except Exception as e:  # noqa: BLE001
            log.warning("log_loi lỗi: %s", e)

    def _hoi_thoai_mua(self, user_key: str, ten: str | None = None) -> str | None:
        """Hội thoại MUA của khách (`conversations.buyer_id`, tạo nếu chưa có) — SRS-5.1zzzzzzz83: trước đây mọi lượt chat ghi vào
        hội thoại BÁN (tạo luôn dòng `sellers` cho người chỉ đi mua), tab Tin nhắn của người mua thiếu lịch sử."""
        bid = self.khach_mua(user_key, ten)
        if not bid:
            return None
        khoa = f"mua:{bid}"
        if khoa in self._conv_cache:
            return self._conv_cache[khoa]
        rows = self._get(f"conversations?buyer_id=eq.{bid}&select=id&limit=1")
        if rows:
            self._conv_cache[khoa] = rows[0]["id"]
            return rows[0]["id"]
        tao = self._post("conversations", {"buyer_id": bid, "channel": "zalo_personal_test",
                                           "started_at": datetime.now(timezone.utc).isoformat()})
        if tao:
            self._conv_cache[khoa] = tao[0]["id"]
            return tao[0]["id"]
        return None

    def ghi_luot_chat(self, user_key: str, incoming_text: str, bot_reply: str, zalo_msg_id: str | None = None,
                      role: str = "seller", user_name: str | None = None, nhan_luc: str | None = None) -> None:
        """Một lượt chat → hai dòng `messages` (khách, bot) + đẩy hội thoại lên đầu CRM. Dùng chung đường tìm / tạo người bán và
        hội thoại với `save` (SRS-5.1zzzzzzz56 — trước đây supabase_sync có bản riêng). Lượt MUA ghi vào hội thoại mua.
        20/10/2026 (SRS-5.1zzzzzzz84): hội thoại trong cache có thể đã bị xoá ở chỗ khác — khách gõ "hello" (reset ở bản kho của
        engine, không phải bản này), admin xoá khách, bắn thử dọn. Chèn tin vào hội thoại đã xoá → 409 (khoá ngoại) → mọi tin của
        khách đó rơi im tới lần khởi động lại (DB: hội thoại thật 0 tin trong khi last_message_at vẫn chạy). Gặp 409 thì bỏ cache,
        tìm / tạo lại hội thoại, ghi lại một lần."""
        if not (self.is_configured and user_key):
            return
        try:
            self._ghi_luot_chat_mot_lan(user_key, incoming_text, bot_reply, zalo_msg_id, role, user_name, nhan_luc)
        except urllib.error.HTTPError as e:
            if e.code != 409:
                raise
            self._seller_cache.pop(user_key, None)
            self._conv_cache.clear()
            self._ghi_luot_chat_mot_lan(user_key, incoming_text, bot_reply, zalo_msg_id, role, user_name, nhan_luc)

    def _ghi_luot_chat_mot_lan(self, user_key: str, incoming_text: str, bot_reply: str, zalo_msg_id: str | None,
                               role: str, user_name: str | None, nhan_luc: str | None) -> None:
        if role == "buyer":
            conv_id = self._hoi_thoai_mua(user_key, user_name)
        else:
            seller_id = self._get_or_create_seller(user_key, user_name)
            conv_id = self._get_or_create_conversation(seller_id) if seller_id else None
        if not conv_id:
            return
        now_iso = datetime.now(timezone.utc).isoformat()
        if incoming_text:
            # 20/10/2026 (SRS-5.1zzzzzzz82): giờ tin khách là lúc lõi NHẬN tin (`nhan_luc`), không phải lúc bot trả lời xong — hai
            # dòng cùng giờ thì CRM không đo được bot trả lời mất bao lâu.
            msg = {"conversation_id": conv_id, "sender": "seller" if role == "seller" else "buyer",
                   "body": incoming_text, "created_at": nhan_luc or now_iso}
            if zalo_msg_id:
                msg["zalo_msg_id"] = str(zalo_msg_id)
            self._post("messages", msg, prefer="return=minimal")
        if bot_reply:
            self._post("messages", {"conversation_id": conv_id, "sender": "bot", "body": bot_reply, "created_at": now_iso},
                       prefer="return=minimal")
        self._patch(f"conversations?id=eq.{conv_id}", {"last_message_at": now_iso})

    def dang_giu_hoi_thoai(self, user_key: str) -> bool:
        """Admin đang GIỮ hội thoại (`conversations.human_hold`, nút "giữ" trên /admin/tin-nhan → `giu_khach`) → bot im
        (SRS-5.1zzzzzzz82). Trước đó lõi không đọc cờ này: admin nhắn tay, bot vẫn trả lời chồng. Lỗi đọc → coi như không giữ
        (bot vẫn trả lời, không bỏ khách) và ghi log."""
        if not (self.is_configured and user_key):
            return False
        uk = urllib.parse.quote(user_key)
        try:
            for vai, fk in (("sellers", "conversations_seller_id_fkey"), ("buyers", "conversations_buyer_id_fkey")):
                if self._get(f"conversations?select=human_hold,{vai}!{fk}!inner(zalo_user_id)"
                             f"&{vai}.zalo_user_id=eq.{uk}&human_hold=is.true&limit=1"):
                    return True
        except Exception as e:  # noqa: BLE001
            log.warning("Đọc human_hold lỗi: %s", e)
        return False

    def bao_can_nguoi(self, user_key: str, trich: str, ten: str | None = None, role: str = "seller") -> bool:
        """Khách xin gặp người thật (SRS-5.1zzzzzzz82): bật `needs_human` (khung "khách cần người thật" trên /admin) và xếp một tin
        nội bộ "🙋" vào `reminders` — bridge kéo qua escalation-feed rồi nhắn Zalo cho CTV / admin (tin nội bộ không bao giờ tới
        chủ nhà, `laTinNoiBo`). ID thử (`la_id_thu`) chỉ bật cờ, không nhắn admin. Trả True khi đã xếp tin / bật cờ."""
        if not (self.is_configured and user_key):
            return False
        if role == "buyer":   # hội thoại mua (SRS-5.1zzzzzzz83) — trigger conversations_email_upset còn gửi email admin
            seller_id, conv_id = None, self._hoi_thoai_mua(user_key, ten)
        else:
            seller_id = self._get_or_create_seller(user_key, ten)
            conv_id = self._get_or_create_conversation(seller_id) if seller_id else None
        if not conv_id:
            return False
        now_iso = datetime.now(timezone.utc).isoformat()
        self._patch(f"conversations?id=eq.{conv_id}", {"needs_human": True, "needs_human_at": now_iso})
        if self._request("POST", "rpc/la_id_thu", data={"p": user_key}) is True:
            return True
        vai = "người mua" if role == "buyer" else "người bán"
        loi = re.sub(r"\d[\d .-]{7,}\d", "[số]", str(trich or ""))[:160]   # không đẩy SĐT khách vào tin nội bộ
        self._post("reminders", {
            "kind": "escalation", "status": "pending", "due_at": now_iso, "seller_id": seller_id,
            "buyer_id": self.khach_mua(user_key, ten) if role == "buyer" else None,
            "note": f"🙋 Khách cần người thật — {ten or 'khách Zalo'} ({vai}): “{loi}”. Mở /admin/tin-nhan để nhận khách.",
        }, prefer="return=minimal")
        return True

    # --- ConversationStore Protocol --------------------------------------

    def _hang_luu(self, user_key: str) -> "queue.Queue":
        """Mỗi khách MỘT hàng đợi lưu + một luồng xử lý — giữ đúng thứ tự (khoá trần không bảo đảm vào trước ra trước: bản chụp cũ có
        thể ghi SAU bản mới, đè dữ liệu mới)."""
        with self.__dict__.setdefault("_khoa_tao_luu", threading.Lock()):
            hang = self.__dict__.setdefault("_hang_luu_khach", {})
            if user_key not in hang:
                q: queue.Queue = queue.Queue()

                def chay() -> None:
                    while True:
                        chup = q.get()
                        try:
                            self._save(chup)
                        except Exception as e:  # noqa: BLE001 — _save đã tự ghi sổ lỗi; luồng không được chết
                            log.error("Lưu nền lỗi: %s", e)
                        finally:
                            q.task_done()
                threading.Thread(target=chay, daemon=True, name=f"luu-{user_key[-4:]}").start()
                hang[user_key] = q
            return hang[user_key]

    def luu_nen(self, conv: Conversation) -> None:
        """Lần lưu CUỐI mỗi lượt chạy nền (SRS-5.1zzzzzzz92): bot gửi lời ngay, không chờ 5+ lần gọi Supabase. Lưu một BẢN CHỤP của
        hội thoại (lượt sau có thể đang sửa conv), theo hàng đợi của khách."""
        try:
            chup = copy.deepcopy(conv)
        except Exception as e:  # noqa: BLE001 — không chụp được thì lưu ngay như cũ, lượt trả lời không được hỏng vì việc lưu
            log.warning("Không chụp được hội thoại để lưu nền (%s) — lưu ngay", type(e).__name__)
            self.save(conv)
            return
        self._hang_luu(conv.user_key).put(chup)

    def save(self, conv: Conversation) -> None:
        """Lưu ngay — chờ hàng lưu nền của khách xong trước, để lượt sau (`_trang_thai_web` lưu rồi đọc trạng thái) không bị bản chụp
        cũ ghi đè sau đó."""
        hang = self.__dict__.get("_hang_luu_khach", {}).get(conv.user_key)
        if hang is not None:
            hang.join()
        self._save(conv)

    def _save(self, conv: Conversation) -> None:
        """Persist conversation, listings, and leads into Supabase."""
        # Always mirror into local fallback first if configured for backup/safety
        if self.fallback:
            try:
                self.fallback.save(conv)
            except Exception as e:
                log.warning("Fallback SQLite save failed: %s", e)

        if not self.is_configured:
            return

        try:
            seller_id = self._get_or_create_seller(conv.user_key)
            if not seller_id:
                return

            conv_id = self._get_or_create_conversation(seller_id)
            now_iso = datetime.now(timezone.utc).isoformat()

            # 1. Update conversation timestamp
            if conv_id:
                self._patch(f"conversations?id=eq.{conv_id}", {"last_message_at": now_iso})

            # 2. Persist listings into Supabase `listings` table
            lid_dang_noi = None
            # Khách MUA không có tin rao: căn mồi rỗng Listing() mọi hội thoại mở ra không được thành một dòng `listings`
            # (bắn thử 19/10, SRS-5.1zzzzzzz71). Việc của khách mua ghi qua KhoNguoiMua.
            for li in ([] if getattr(conv, "role", None) == "buyer" else conv.listings):
                fields = li.prop.fields
                # 20/10/2026 (SRS-5.1zzzzzzz83): enum `listing_deal` là ban / cho_thue — bản trước ghi "thue" → 22P02, cả dòng tin
                # cho thuê không bao giờ xuống DB (không lên web, không có trên /admin), lỗi chỉ nằm ở journal.
                deal_type = "cho_thue" if li.prop.is_rental else "ban"
                listing_payload: dict[str, Any] = {
                    "seller_id": seller_id,
                    "code": li.listing_id[:8].upper(),
                    "deal": deal_type,
                    "street": fields.get("duong"),
                    # Ô khách lờ 2 lần (để sau bản nháp) đi kèm tin dưới khoá nội bộ `_hoan` — lõi khởi động lại (mỗi lần cài VPS)
                    # không quên rồi hỏi lại từ đầu (SRS-5.1zzzzzzz90). Khoá `_` không ra khách (`fields_khach`, `_thong_so`).
                    "boc_tach": {**fields, **({"_hoan": sorted(li.prop.hoan)} if getattr(li.prop, "hoan", None) else {})},
                    "updated_at": now_iso,
                }
                if fields.get("dia_chi"):
                    listing_payload["location_raw"] = fields["dia_chi"]
                phuong, quan, nguon_phuong = self._dia_ban(fields)
                if phuong:
                    listing_payload["ward"] = phuong
                    listing_payload["ward_source"] = nguon_phuong
                du_an = self._du_an(fields)
                if du_an and du_an.get("id"):
                    listing_payload["project_id"] = du_an["id"]
                if quan:
                    listing_payload["district"] = quan
                listing_payload.update(self._thong_so(fields, ma_loai_db(li.prop.loai_hinh)))
                ma_pl = self._ma_phap_ly(fields.get("phap_ly"))
                if ma_pl:
                    listing_payload["legal_status"] = ma_pl
                dt = so_m2(fields, li.prop.is_rental)
                if dt is not None:
                    listing_payload["area_m2"] = dt
                if fields.get("gia"):
                    listing_payload["price_raw"] = str(fields["gia"])
                    listing_payload["price_source"] = "chu_xac_nhan"   # ô giá chỉ ghi khi có bằng chứng trong lời khách (SRS-5.1zzzzzzz73)
                if ma_loai_db(li.prop.loai_hinh):
                    listing_payload["property_type"] = ma_loai_db(li.prop.loai_hinh)

                # Tin trên DB mang ĐÚNG id của Listing (uuid) — thư mục ảnh trên Storage là `<uuid>/…` và ràng buộc
                # listing_media_duong_dan_theo_uuid đòi khớp (SRS-5.1zzzzzzz56). Tin cũ tạo trước bản này: tìm theo code.
                lid_mong = str(uuid.UUID(li.listing_id)) if la_uuid(li.listing_id) else None
                cot_doc = "id,status,price_source,ward_source,property_type_source"
                existing = self._get(f"listings?id=eq.{lid_mong}&select={cot_doc}") if lid_mong else []
                if not existing:
                    existing = self._get(f"listings?seller_id=eq.{seller_id}&code=eq.{listing_payload['code']}&select={cot_doc}")
                # Căn ngoài vùng nhận tin (SRS-5.1zzzzzzz86): đã có dòng (tạo lượt trước, khi chưa biết tỉnh) thì ẩn; chưa có thì
                # không tạo — trigger đăng tin không đụng tới `an`.
                ngoai_vung = bool(fields.get("_ngoai_vung"))
                if existing:
                    lid = existing[0]["id"]
                    # Admin đã sửa tay ô nào trên CRM (nguồn = admin, SRS-5.1zzzzzzz89) thì lượt chat sau KHÔNG ghi đè ô đó — trước
                    # đây phường / giá admin sửa bị lượt chat kế tiếp ghi lại theo bản lõi.
                    for nguon, cots in (("price_source", ("price_raw", "price_source")), ("ward_source", ("ward", "ward_source")),
                                        ("property_type_source", ("property_type",))):
                        if existing[0].get(nguon) == "admin":
                            for c in cots:
                                listing_payload.pop(c, None)
                    ma = "an" if ngoai_vung else ma_trang_thai(getattr(li, "status", None), existing[0].get("status"))
                    if ma:
                        listing_payload["status"] = ma
                    self._patch(f"listings?id=eq.{lid}", listing_payload)
                    if ma == "da_chot":   # chốt kèo → dòng deals (SRS-5.1zzzzzzz70); báo khách quan tâm do trigger DB lo
                        self.ghi_deal(lid, SALE_FEE_RATE.get(getattr(conv, "user_type", None)))
                elif ngoai_vung:
                    continue
                else:
                    # Tin tạo từ chat chỉ lên web khi khách đồng ý bản nháp (trigger listings_quyet_dinh_dang_tin đọc
                    # can_chu_duyet + chu_duyet_at; SRS-5.1zzzzzzz47). Admin / Excel tạo tin thì cờ này false như cũ.
                    # source: cột mặc định 'import_excel' → mọi tin chat bị gắn nhãn nhập Excel (SRS-5.1zzzzzzz83).
                    moi = {**listing_payload, "status": "cho_thong_tin", "can_chu_duyet": True, "source": "chat_zalo"}
                    if lid_mong:
                        moi["id"] = lid_mong
                    tao = self._post("listings", moi)
                    lid = (tao[0].get("id") if tao else None) or lid_mong
                if lid:
                    self._ghi_anh(lid, getattr(li, "media", None) or [])
                    if li.listing_id == getattr(conv, "active_listing_id", None):
                        lid_dang_noi = lid

            # 3. Căn đang nói tới → sellers.active_listing_id, để khởi động lại (mỗi lần cài VPS) không quay về căn đầu tiên.
            if lid_dang_noi and self._active_da_ghi.get(seller_id) != lid_dang_noi:
                self._patch(f"sellers?id=eq.{seller_id}", {"active_listing_id": lid_dang_noi})
                self._active_da_ghi[seller_id] = lid_dang_noi

        except Exception as e:
            log.error("Failed to save conversation to Supabase: %s", e)
            # SRS-5.1zzzzzzz83: ghi hỏng mà chỉ có journal là im lặng (tin cho thuê mất suốt mà không ai thấy) → sổ lỗi.
            self._ghi_so_loi("supabase save", f"{type(e).__name__}: {e}")

    def _ghi_anh(self, lid: str, media: list[dict]) -> None:
        """Ảnh / giấy tờ đã lên Supabase Storage (`kho_anh.SupabaseMediaStore`) → dòng `listing_media` để web hiện ảnh (bucket
        công khai) và admin xem giấy tờ (bucket riêng). Chỉ ghi tệp nằm đúng thư mục `<uuid tin>/`; trùng (bucket, khoá) thì bỏ qua."""
        dong = []
        for i, m in enumerate(media or []):
            bucket, _, khoa = str(m.get("path") or "").partition("/")
            if bucket not in (BUCKET_CONG_KHAI, BUCKET_RIENG) or not khoa.startswith(f"{lid}/"):
                continue
            if f"{bucket}/{khoa}" in self._anh_da_ghi:
                continue
            mime = m.get("content_type") or ("image/jpeg" if re.search(r"\.jpe?g$", khoa, re.I) else
                                              "application/pdf" if khoa.lower().endswith(".pdf") else "application/octet-stream")
            dong.append({"listing_id": lid, "bucket": bucket, "storage_path": khoa, "mime_type": mime,
                         "media_type": "giay_to" if bucket == BUCKET_RIENG else "khac",
                         "sort_order": min(i, 9999), "nguon": "chat"})
        if not dong:
            return
        try:
            self._request("POST", "listing_media?on_conflict=bucket,storage_path", data=dong,
                          prefer="resolution=ignore-duplicates,return=minimal")
            self._anh_da_ghi.update(f"{d['bucket']}/{d['storage_path']}" for d in dong)
        except Exception as e:  # noqa: BLE001 — ghi ảnh hỏng thì tin vẫn lưu, lượt sau thử lại
            log.warning("ghi listing_media lỗi: %s", e)

    def ghi_duyet(self, conv: Conversation, dong_y: bool) -> None:
        """Khách ĐỒNG Ý bản nháp → `chu_duyet_at` = bây giờ (trigger cho lên web nếu đủ giá / diện tích / phường); KHÔNG đồng ý →
        xoá dấu (tin đang hiển thị thì trigger hạ về `cho_thong_tin`). Quyết định đồng ý hay không là của lượt AI, đã kiểm trích
        dẫn ở engine (SRS-5.1zzzzzzz47)."""
        if not self.is_configured:
            return
        sid = self._get_or_create_seller(conv.user_key)
        if not sid:
            return
        code = conv.active.listing_id[:8].upper()
        self._patch(f"listings?seller_id=eq.{sid}&code=eq.{code}",
                    {"chu_duyet_at": datetime.now(timezone.utc).isoformat() if dong_y else None})

    def ghi_ban_tin(self, conv: Conversation, mo_ta: str) -> None:
        """Thân bản tin khách vừa duyệt → `listings.description` (web hiện qua sanitizeDescription — lọc SĐT, FR-104). Ghi đúng chữ
        khách đã thấy, không viết lại (SRS-5.1zzzzzzz89)."""
        if not self.is_configured or not (mo_ta or "").strip():
            return
        sid = self._get_or_create_seller(conv.user_key)
        if not sid:
            return
        code = conv.active.listing_id[:8].upper()
        self._patch(f"listings?seller_id=eq.{sid}&code=eq.{code}", {"description": mo_ta.strip()})

    # Cột → ô bot hỏi: đúng ba điều kiện của `listing_du_dang_tin` (giá · diện tích · phường).
    _COT_DANG_TIN = (("phuong", "ward"), ("dien_tich", "area_m2"), ("gia", "price_vnd"))

    def trang_thai_tin(self, conv: Conversation) -> dict | None:
        """Tin đang nói có ĐANG HIỂN THỊ trên web không — đọc `status` thật (trigger `listings_quyet_dinh_dang_tin` quyết),
        không suy từ điểm đủ của lõi (SRS-5.1zzzzzzz44). {"len_web", "thieu": [ô], "cho_duyet"}; lỗi / chưa có dòng → None."""
        if not self.is_configured:
            return None
        try:
            sid = self._get_or_create_seller(conv.user_key)
            if not sid:
                return None
            code = conv.active.listing_id[:8].upper()
            rows = self._get(f"listings?seller_id=eq.{sid}&code=eq.{code}"
                             "&select=status,ward,area_m2,price_vnd,can_chu_duyet,chu_duyet_at")
        except Exception as e:  # noqa: BLE001 — không biết thì bot nói trung tính, không bịa "đã đăng"
            log.warning("trang_thai_tin lỗi: %s", e)
            return None
        if not rows:
            return None
        r = rows[0]
        thieu = [o for o, cot in self._COT_DANG_TIN if r.get(cot) in (None, "")]
        return {"len_web": r.get("status") == "dang_ban", "thieu": thieu,
                "cho_duyet": not thieu and bool(r.get("can_chu_duyet")) and not r.get("chu_duyet_at")}

    def load(self, user_key: str) -> Any:
        """Load conversation from Supabase.
        CRITICAL: If the seller or conversation was deleted on CRM (aioinhadat.vercel.app),
        this returns None so the bot immediately resets its session!
        """
        from .engine import Conversation, Listing, Turn

        if not self.is_configured:
            return self.fallback.load(user_key) if self.fallback else None

        try:
            # 1. Check if seller exists in Supabase
            sellers = self._get(f"sellers?zalo_user_id=eq.{urllib.parse.quote(user_key)}")
            if not sellers:
                # User was deleted on CRM! Drop any cache and return None (reset bot session)
                self._seller_cache.pop(user_key, None)
                if self.fallback:
                    self.fallback.reset(user_key)
                return None

            seller = sellers[0]
            seller_id = seller["id"]
            self._seller_cache[user_key] = seller_id

            # 2. Check if conversation exists
            convs = self._get(f"conversations?seller_id=eq.{seller_id}&channel=eq.zalo_personal_test")
            conv_id = None
            if not convs:
                # Hội thoại bị xoá / reset trên CRM: bỏ lịch sử. 19/10/2026 (SRS-5.1zzzzzzz77): người bán vẫn có tin trên DB (tin
                # nhập từ CRM, rổ hàng, hội thoại đã xoá) thì vẫn nạp tin — bản trước trả None, lõi coi như người mới: chủ nhà trả
                # lời câu khách mua hỏi xong bị hỏi "căn này là chung cư, nhà phố hay đất" và sinh thêm một tin rỗng.
                if self.fallback:
                    self.fallback.reset(user_key)
                if not self._get(f"listings?seller_id=eq.{seller_id}&select=id&limit=1"):
                    return None
            else:
                conv_id = convs[0]["id"]
                self._conv_cache[seller_id] = conv_id

            # Bản SQLite trên VPS giữ thứ Supabase không có cột (bảng giá riêng, mốc lịch sử, ảnh đã cất, đã trình bản nháp…) —
            # Supabase vẫn là nguồn cho tin và hội thoại, SQLite chỉ bù phần thiếu (SRS-5.1zzzzzzz63).
            cu = None
            if self.fallback:
                try:
                    cu = self.fallback.load(user_key)
                except Exception as e:  # noqa: BLE001
                    log.warning("Fallback SQLite load failed: %s", e)

            # 3. Load listings for this seller
            db_listings = self._get(f"listings?seller_id=eq.{seller_id}&order=created_at.asc")
            listings: list[Listing] = []
            for row in db_listings:
                boc_tach = dict(row.get("boc_tach") or {})
                hoan = boc_tach.pop("_hoan", None)
                prop = Property(
                    loai_hinh=loai_tu_db(row.get("property_type"), boc_tach),
                    is_rental=(row.get("deal") in ("cho_thue", "thue")),
                    fields=boc_tach,
                )
                if isinstance(hoan, list):
                    prop.hoan = {str(x) for x in hoan}
                # listing_id = uuid của dòng (bỏ gạch) khi tin tạo từ bản 19/10 (code = 8 ký tự đầu id) — để ảnh ghi đúng thư
                # mục `<uuid>/` và lượt sau cập nhật đúng dòng; tin cũ giữ code như trước (SRS-5.1zzzzzzz56).
                rid = str(row.get("id") or "").replace("-", "")
                lid_engine = rid if rid and (row.get("code") or "") == rid[:8].upper() else (row.get("code", "") or row.get("id"))
                cu_li = next((x for x in (cu.listings if cu else []) if x.listing_id == lid_engine), None)
                li = Listing(
                    listing_id=lid_engine,
                    prop=prop,
                    # Đã trình bản nháp chưa: bản SQLite trên VPS nhớ đúng; không có thì suy từ DB (khách đã duyệt, hoặc tin đã đủ ý —
                    # bản nháp đi ngay lượt đủ ý). Trước đây so với "dang_rao" (không có trên DB) nên luôn sai → trình lại bản nháp.
                    listing_proposed=cu_li.listing_proposed if cu_li else bool(row.get("chu_duyet_at") or prop.summary_ready()),
                    status=trang_thai_tu_db(row.get("status"), prop.is_rental),
                    history_start=cu_li.history_start if cu_li else 0,
                    media=cu_li.media if cu_li else [],
                )
                listings.append(li)

            # 4. Load messages for history
            history_rows = self._get(f"messages?conversation_id=eq.{conv_id}&order=created_at.asc") if conv_id else []
            history: list[Turn] = []
            for m in history_rows:
                sender = m.get("sender", "")
                role = "assistant" if sender in ("bot", "assistant") else "user"
                body = m.get("body", "")
                # Parse timestamp if available
                ts = 0.0
                if m.get("created_at"):
                    try:
                        ts = datetime.fromisoformat(m["created_at"].replace("Z", "+00:00")).timestamp()
                    except Exception:
                        pass
                history.append(Turn(role=role, content=body, at=ts))

            # 5. Reconstruct Conversation
            ids = [li.listing_id for li in listings]
            active = str(seller.get("active_listing_id") or "").replace("-", "")
            if active not in ids:
                active = cu.active_listing_id if cu and cu.active_listing_id in ids else (ids[-1] if ids else None)
            conv = Conversation(
                user_key=user_key,
                user_type=vai_tu_seller_type(seller.get("seller_type")),
                assistant=assign_assistant(user_key),
                history=history,
                listings=listings if listings else [Listing(prop=Property())],
                active_listing_id=active,
                role="seller" if listings else (cu.role if cu else "unknown"),
            )
            if cu:
                conv.price_book = cu.price_book
                conv.buyer_lead = cu.buyer_lead
                conv.last_ai_at = cu.last_ai_at
                conv.xung_ho = cu.xung_ho   # khách tự xưng gì (SRS-5.1zzzzzzz76) — Supabase không có cột này
                if conv.user_type.value == "unknown":
                    conv.user_type = cu.user_type
            return conv

        except Exception as e:
            log.error("Failed to load conversation from Supabase: %s. Using fallback.", e)
            return self.fallback.load(user_key) if self.fallback else None

    def reset(self, user_key: str) -> None:
        """Reset conversation and listings for this user directly in Supabase."""
        self._seller_cache.pop(user_key, None)
        if self.fallback:
            try:
                self.fallback.reset(user_key)
            except Exception as e:
                log.warning("Fallback SQLite reset failed: %s", e)

        if not self.is_configured:
            return

        try:
            sellers = self._get(f"sellers?zalo_user_id=eq.{urllib.parse.quote(user_key)}")
            if not sellers:
                return
            seller_id = sellers[0]["id"]

            # 1. Delete or unlist listings
            self._delete(f"listings?seller_id=eq.{seller_id}")

            # 2. Delete conversations and messages
            convs = self._get(f"conversations?seller_id=eq.{seller_id}")
            for c in convs:
                cid = c["id"]
                self._delete(f"messages?conversation_id=eq.{cid}")
                self._delete(f"conversations?id=eq.{cid}")

            # 3. Clear cache
            self._conv_cache.pop(seller_id, None)
            log.info("Successfully reset user %s in Supabase", user_key)
        except Exception as e:
            log.error("Failed to reset user %s in Supabase: %s", user_key, e)
