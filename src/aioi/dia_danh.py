"""Tra địa danh (phường / quận / đường) cho người bán — chữ trước, NGHĨA sau (19/10/2026, docs/07 SRS-5.1zzzzzzz60).

Chủ dự án: "tôi muốn tra địa chỉ, tra tên đường phường bằng schematic". AI bóc tách đã đọc ra ô `duong` / `phuong` / `quan` theo
nghĩa (prompts.EXTRACTION_SYSTEM); ở đây chỉ TRA kho:
  1. theo chữ — `tim_dia_danh` / `tim_duong` (bỏ dấu, đảo chữ, sai 1–2 ký tự);
  2. chữ không ra → theo NGHĨA: Gemini nhúng câu tìm (RETRIEVAL_QUERY, 768 chiều — cùng model lịch `nhung-tick` dùng nhúng kho)
     rồi `tim_dia_danh_theo_nghia` trả ứng viên gần nghĩa nhất.
"Gần nghĩa" chưa phải "đúng tên" (Tân Định ≠ Tân Bình), nên máy chỉ nhận ứng viên mà TÊN còn gần chữ khách gõ (`ten_gan`) và
ra đúng MỘT giá trị — vector tìm, máy xác nhận (luật của bản TypeScript khop-ten-nghia.ts, 30/09/2026). Không chắc thì trả None:
bot giữ chữ khách và hỏi như thường. Lỗi mạng / hết hạn mức Gemini → None, không làm hỏng lượt trả lời.
"""
from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable

log = logging.getLogger("aioi.dia_danh")

URL_NHUNG = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"
SO_CHIEU = 768
NGUONG_NGHIA = 0.55
BIEN_NGHIA_DU_AN = 0.04   # dự án thứ hai trở đi chỉ tính khi sát dự án đầu trong chừng này (độ gần cosine)
NGUONG_LUAT = 0.69   # điều luật dưới ngưỡng này coi như không khớp câu khách hỏi (SRS-5.1zzzzzzz231; đo 28/10 trên 12 câu thử: điều đúng ≥ 0,70, điều sai 0,639–0,676 — SRS-5.1zzzzzzz242)

LOAI_PHUONG = ("phuong_moi", "phuong_cu")
LOAI_KHONG_PHAI_DUONG = ("phuong_moi", "phuong_cu", "quan_cu", "du_an")
TU_CHUNG_PHUONG = frozenset({"phuong", "xa", "thi", "tran", "p", "tt"})
TU_CHUNG_DUONG = frozenset({"duong", "pho", "hem", "hxh", "ngo", "kiet"})


def bo_dau(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def ten_tran(ten: str | None) -> str:
    """Tên phường / xã bỏ dấu, bỏ chữ loại đứng đầu: "Phường An Hội Tây" → "an hoi tay" — để soát lời bot có nhắc phường đó không."""
    return re.sub(r"^(phuong|xa|thi tran|dac khu)\s+", "", bo_dau(ten or "").strip())


def _loi(s: str, bo: frozenset[str]) -> str:
    return "".join(w for w in re.sub(r"[^a-z0-9]+", " ", bo_dau(s)).split() if w not in bo)


def _lev(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i]
        for j in range(1, len(b) + 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1])))
        prev = cur
    return prev[len(b)]


def ten_gan(go: str | None, kho: str | None, bo: frozenset[str]) -> bool:
    """Tên khách gõ có phải tên trong kho gõ sai / thiếu dấu không: so chuỗi liền (bỏ dấu, bỏ từ chung), lệch ≤ ¼ độ dài
    (1…4 ký tự), chữ số y hệt ("Phường 1" ≠ "Phường 11"). Lõi < 4 ký tự thì không đoán."""
    a, b = _loi(go or "", bo), _loi(kho or "", bo)
    if len(a) < 4 or len(b) < 4 or re.sub(r"\D", "", a) != re.sub(r"\D", "", b):
        return False
    if a == b:
        return True
    tran = min(4, max(1, max(len(a), len(b)) // 4))
    return abs(len(a) - len(b)) <= tran and _lev(a, b) <= tran


def _cung_quan(a: str | None, b: str | None) -> bool:
    return not a or not b or _loi(a, frozenset()) == _loi(b, frozenset())


def _mot(gia_tri: list[str | None]) -> str | None:
    ds = {g for g in gia_tri if g}
    return ds.pop() if len(ds) == 1 else None


_SO_PHUONG_CU = re.compile(r"(?<![a-z0-9])(?:phuong|p)\.?\s*(\d{1,2})(?![a-z0-9])")


def so_phuong_cu(chu: str | None) -> int | None:
    """Số của phường CŨ đánh số khách gõ ("phường 6", "P.6", "p6", hoặc chỉ "6") — đọc hình thức chữ, không đoán ý."""
    k = bo_dau(chu or "").strip()
    m = _SO_PHUONG_CU.search(k) or re.fullmatch(r"(\d{1,2})", k)
    return int(m.group(1)) if m else None


def _khoa_quan(s: str | None) -> str:
    """"Quận Bình Thạnh" / "Bình Thạnh" → "binhthanh"; "Quận 5" / "Q.5" / "q5" → "5" — so quận cũ không phụ thuộc chữ "Quận"."""
    k = re.sub(r"^(?:quan|huyen|thanh pho|thi xa|q)\.?\s*", "", bo_dau(s or "").strip())
    return re.sub(r"[^a-z0-9]", "", k)


def phuong_moi_tu_cu(doc: Callable[[str, dict], list] | None, so: int | None, quan: str | None, ten: str | None = None) -> list[str]:
    """MỌI phường mới (wards.ten_day_du, xếp theo tên) mà phường cũ đánh số `so` của `quan` về — một hay nhiều. Không có số thì `ten` là tên
    phường CŨ có chữ ("Bình Hưng Hòa A" — SRS-5.1zzzzzzz233, chat chị Ngân 28/10: bản trước chỉ tra phường đánh số nên bot hỏi trống "tên phường
    mới"); tên trùng một phường MỚI đang có thì coi là khách nói tên mới → []. Thiếu số / tên / quận, bảng lỗi → []."""
    qk = _khoa_quan(quan)
    khoa_ten = _loi(ten or "", TU_CHUNG_PHUONG) if so is None else ""
    if doc is None or not qk or (so is None and len(khoa_ten) < 4):
        return []
    try:
        if so is not None:
            cu = doc("phuong_cu", {"select": "quan_cu,phuong_moi", "ten": f"eq.Phường {so}", "limit": "200"})
        else:
            if any(_loi(x.get("ten") or "", TU_CHUNG_PHUONG) == khoa_ten
                   for x in doc("wards", {"select": "ten", "limit": "1000"})):
                return []
            cu = [d for d in doc("phuong_cu", {"select": "ten,quan_cu,phuong_moi", "limit": "2000"})
                  if _loi(d.get("ten") or "", TU_CHUNG_PHUONG) == khoa_ten]
        moi = sorted({d["phuong_moi"] for d in cu if d.get("phuong_moi") and _khoa_quan(d.get("quan_cu")) == qk})
        if not moi:
            return []
        w = doc("wards", {"select": "ten,ten_day_du", "ten": "in.(" + ",".join(f'"{m}"' for m in moi) + ")"})
    except Exception as e:  # noqa: BLE001 — tra địa danh là phần thêm
        log.warning("phường cũ → mới: đọc lỗi: %s", e)
        return []
    day_du = {x["ten"]: x["ten_day_du"] for x in w if x.get("ten") and x.get("ten_day_du")}
    return sorted(day_du.get(m, f"Phường {m}") for m in moi)


def phuong_cu_chia(doc: Callable[[str, dict], list] | None, so: int | None, quan: str | None, ten: str | None = None) -> list[str]:
    """Các phường MỚI (wards.ten_day_du, xếp theo tên) mà phường cũ đánh số bị CHIA về, khi chia về từ 2 phường trở lên — SRS-5.1zzzzzzz191
    (chat anh Luận 26/10: "phường 6" của Bình Thạnh về cả Bình Lợi Trung lẫn Gia Định nên máy không tự chọn được). Cần số phường và quận cũ
    (cùng số "phường 6" có ở nhiều quận). Chia về một phường, không biết quận, bảng lỗi → []. `doc(bảng, tham số)` đọc PostgREST."""
    moi = phuong_moi_tu_cu(doc, so, quan, ten)   # SRS-5.1zzzzzzz233: một đường tra cho phường đánh số lẫn phường có tên
    return moi if len(moi) >= 2 else []


def chon_phuong_da_goi_ten(ung_vien: list[str], *chu: str | None) -> str | None:
    """Trong các phường mới mà phường cũ bị chia về, đúng MỘT phường được nêu tên trong chữ khách ("Gia Định", "phường Gia Định") → phường đó;
    không phường nào / nhiều hơn một → None. Chỉ so tên (bỏ dấu, bỏ chữ loại), không đoán."""
    k = " " + re.sub(r"[^a-z0-9]+", " ", bo_dau(" ".join(c for c in chu if c))).strip() + " "
    thay = [u for u in ung_vien if len(ten_tran(u)) >= 3 and f" {ten_tran(u)} " in k]
    return thay[0] if len(thay) == 1 else None


LOAI_XA_GO = {"xa": "xa", "phuong": "phuong", "p": "phuong", "thi tran": "thi tran", "tt": "thi tran"}
# Tỉnh CŨ (cột `xa_tinh_khac.tinh_cu`) nằm NGOÀI vùng nhận tin dù nay thuộc tỉnh trong vùng (chủ dự án 20/10: "Bình Phước cũ — bỏ"; prompts.VUNG_NHAN_TIN).
TINH_CU_NGOAI_VUNG = frozenset({"Bình Phước"})


def _loai_khach_go(ten: str) -> str | None:
    """Chữ loại ở ĐẦU tên khách gõ ("xã phước lý" → "xa"); không có chữ loại → None. Đọc hình thức chữ, không đoán ý."""
    m = re.match(r"\s*(xa|phuong|thi\s+tran|tt|p)\b\.?\s", bo_dau(ten or "") + " ")
    return LOAI_XA_GO.get(re.sub(r"\s+", " ", m.group(1))) if m else None


def _loi_xa(s: str) -> str:
    return _loi(re.sub(r"\(.*?\)", " ", s or ""), TU_CHUNG_PHUONG)


def tra_xa(kho: list[dict], ten: str | None) -> dict | None:
    """Xã / phường MỚI của tỉnh Tây Ninh (hợp nhất Long An, NQ 1682/NQ-UBTVQH15) hoặc Đồng Nai (hợp nhất Bình Phước, NQ 1662/NQ-UBTVQH15; bảng
    `xa_tinh_khac`, 01/07/2025) của chữ khách gõ.
    {"ten_day_du", "loai", "tinh", "tinh_cu", "ngoai_vung": bool, "tu_ten_cu": bool, "don_vi_cu": [tên cũ]} hoặc None. `ngoai_vung` = đơn vị thuộc
    tỉnh CŨ ngoài vùng nhận tin (Bình Phước). Chỉ nhận khi ra ĐÚNG MỘT đơn vị mới (cùng tên ở hai tỉnh — vd "xã Tân Hưng" — thì không đoán):
      · khách PHẢI gõ kèm chữ loại (xã / phường / thị trấn) — "Long An" trần là tên tỉnh, còn "Phường Long An" là một phường mới;
      · tên khớp tên một đơn vị MỚI (bỏ dấu, bỏ chữ loại) VÀ cùng loại khách gõ;
      · không khớp tên mới thì khớp tên một đơn vị CŨ gộp vào, cùng chữ loại của đơn vị cũ.
    Không đoán gần đúng: sai chính tả thì để prompt hỏi khách."""
    go = _loi_xa(ten or "")
    loai_go = _loai_khach_go(ten or "")
    if len(go) < 3 or loai_go is None:     # phải có chữ loại: "Long An" trần là tên tỉnh, trong khi "Phường Long An" là một phường mới
        return None

    def ra(x: dict, cu: bool) -> dict:
        return {"ten_day_du": x["ten_day_du"], "loai": x["loai"], "tinh": x.get("tinh") or "Tây Ninh", "tinh_cu": x.get("tinh_cu"),
                "ngoai_vung": x.get("tinh_cu") in TINH_CU_NGOAI_VUNG, "tu_ten_cu": cu,
                "don_vi_cu": [c.get("ten", "") for c in (x.get("don_vi_cu") or []) if isinstance(c, dict)]}

    moi = [x for x in kho if _loi_xa(x.get("ten", "")) == go]
    if loai_go in ("xa", "phuong"):
        moi = [x for x in moi if x.get("loai") == loai_go]      # "xã Long An" không phải "Phường Long An"
    if len(moi) == 1:
        return ra(moi[0], False)
    if moi:
        return None
    cu = {x["ten_day_du"]: x for x in kho for c in (x.get("don_vi_cu") or [])
          if isinstance(c, dict) and _loi_xa(c.get("ten", "")) == go and _loai_khach_go(c.get("ten", "")) == loai_go}
    return ra(next(iter(cu.values())), True) if len(cu) == 1 else None


class TraDiaDanh:
    """`rpc(tên, payload) -> list`, `doc(bảng, tham số) -> list` (PostgREST), `nhung(text) -> list[float]` (Gemini; None = chỉ
    tra theo chữ). Mọi lỗi → None."""

    def __init__(self, rpc: Callable[[str, dict], list], doc: Callable[[str, dict], list] | None = None,
                 nhung: Callable[[str], list[float]] | None = None):
        self._rpc = rpc
        self._doc = doc
        self._nhung = nhung
        self._nho: dict[tuple, dict | None] = {}   # (tên, quận) → kết quả duong(): prompt hỏi lại mỗi lượt, khỏi tra / nhúng lại
        self._nho_hem: dict[tuple, list[str]] = {}   # (đường, số hẻm, quận) → phường của hẻm
        self._nho_chia: dict[tuple, list[str]] = {}   # (số phường cũ, quận) → các phường mới nó bị chia về (≥ 2) hoặc []
        self._nho_so_nha: dict[tuple, str | None] = {}   # (số nhà, đường, quận) → phường bản đồ ra đúng số nhà, hoặc None
        self._kho_xa: tuple[float, list[dict]] | None = None   # (lúc đọc, các dòng xa_tinh_khac)

    @classmethod
    def tu_cau_hinh(cls, url: str, key: str | None, khoa_gemini: list[str] | tuple[str, ...] = ()) -> "TraDiaDanh | None":
        if not key:
            return None
        goc = url.rstrip("/").removesuffix("/rest/v1")
        hdr = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

        def rpc(ten: str, payload: dict) -> list:
            req = urllib.request.Request(f"{goc}/rest/v1/rpc/{ten}", data=json.dumps(payload).encode("utf-8"), headers=hdr)
            with urllib.request.urlopen(req, timeout=5) as r:
                kq = json.loads(r.read().decode("utf-8"))
            return kq if isinstance(kq, list) else []

        def doc(bang: str, thamso: dict) -> list:
            req = urllib.request.Request(f"{goc}/rest/v1/{bang}?{urllib.parse.urlencode(thamso)}", headers=hdr)
            with urllib.request.urlopen(req, timeout=5) as r:
                kq = json.loads(r.read().decode("utf-8"))
            return kq if isinstance(kq, list) else []

        khoa = [k for k in khoa_gemini if k]
        return cls(rpc, doc, nhung_gemini(khoa) if khoa else None)

    # --- tra --------------------------------------------------------------------------------------

    def _thu(self, ten: str, payload: dict) -> list:
        try:
            return self._rpc(ten, payload)
        except Exception as e:  # noqa: BLE001 — tra địa danh là phần thêm
            log.warning("%s lỗi: %s", ten, e)
            return []

    def _theo_nghia(self, ten: str, loai: tuple[str, ...] | None) -> list[dict]:
        if self._nhung is None:
            return []
        try:
            vec = self._nhung(ten)
        except Exception as e:  # noqa: BLE001 — Gemini hết hạn mức / mạng: đi đường chữ
            log.warning("nhúng câu tìm lỗi: %s", e)
            return []
        return self._thu("tim_dia_danh_theo_nghia", {"p_vec": vec, "p_loai": list(loai) if loai else None, "p_limit": 10})

    def du_an_theo_nghia(self, ten: str | None) -> list[dict]:
        """Dự án trong kho `projects` gần NGHĨA chữ khách gõ (SRS-5.1zzzzzzz185) — dùng khi tra theo chữ không ra dòng nào. Trả các dòng
        {khoa (id dự án), ten, do_gan} đạt `NGUONG_NGHIA`, gần nhất trước, tối đa 3 và cách dòng đầu không quá `BIEN_NGHIA_DU_AN`;
        không nhúng được / không dòng nào đạt → []."""
        ten = (ten or "").strip()
        if not ten:
            return []
        ds = [u for u in self._theo_nghia(ten, ("du_an",)) if u.get("loai") == "du_an" and (u.get("do_gan") or 0) >= NGUONG_NGHIA]
        ds.sort(key=lambda u: -(u.get("do_gan") or 0))
        if not ds:
            return []
        dau = ds[0].get("do_gan") or 0
        kq = [{"khoa": u.get("khoa"), "ten": u.get("ten"), "do_gan": u.get("do_gan")} for u in ds[:3]
              if dau - (u.get("do_gan") or 0) <= BIEN_NGHIA_DU_AN and u.get("khoa")]
        if kq:
            log.warning("dự án theo nghĩa: %r → %s", ten, [k["ten"] for k in kq])
        return kq

    def dieu_luat(self, cau: str | None, k: int = 3) -> list[dict]:
        """Điều luật nguyên văn gần NGHĨA câu khách hỏi pháp lý (bảng `dieu_luat`, rpc `tim_dieu_luat` — SRS-5.1zzzzzzz231). Trả tối đa `k`
        dòng {so_hieu, ten_van_ban, nguon_url, dieu, phan, tieu_de, noi_dung, do_gan} đạt `NGUONG_LUAT`, gần nhất trước. Không nhúng được /
        kho trống / không dòng nào đạt → [] (bot đi đường cũ: chỉ 24 câu soạn sẵn)."""
        cau = (cau or "").strip()
        if not cau or self._nhung is None:
            return []
        try:
            vec = self._nhung(cau)
        except Exception as e:  # noqa: BLE001 — Gemini hết hạn mức / mạng: bỏ phần trích điều
            log.warning("nhúng câu hỏi pháp lý lỗi: %s", e)
            return []
        ds = [d for d in self._thu("tim_dieu_luat", {"p_vec": vec, "p_limit": 6})
              if isinstance(d, dict) and (d.get("do_gan") or 0) >= NGUONG_LUAT and d.get("noi_dung")]
        if ds:
            log.warning("điều luật theo nghĩa: %s", [(d.get("so_hieu"), d.get("dieu"), round(d.get("do_gan") or 0, 3)) for d in ds[:k]])
        return ds[:k]

    def quan(self, ten: str | None) -> str | None:
        """Tên quận / huyện cũ chuẩn ("q5" → "Quận 5"); không chắc → None."""
        ds = [u for u in self._thu("tim_dia_danh", {"p_ten": ten or "", "p_toi_da": 1}) if u.get("loai") == "quan_cu"]
        if not ds:
            return None
        gan = min(u.get("khoang_cach", 9) for u in ds)
        return _mot([u.get("ten") for u in ds if u.get("khoang_cach", 9) == gan])

    def phuong(self, ten: str | None, quan: str | None = None) -> str | None:
        """Phường MỚI (wards.ten_day_du) của chữ khách gõ — phường cũ cũng được nếu nó về đúng một phường mới."""
        ten = (ten or "").strip()
        if not ten:
            return None
        ds = [u for u in self._thu("tim_dia_danh", {"p_ten": ten, "p_toi_da": 1})
              if u.get("loai") in LOAI_PHUONG and _cung_quan(u.get("quan_cu"), quan)]
        if ds:
            gan = min(u.get("khoang_cach", 9) for u in ds)
            return _mot([u.get("phuong") for u in ds if u.get("khoang_cach", 9) == gan])
        ds = [u for u in self._theo_nghia(ten, LOAI_PHUONG)
              if (u.get("do_gan") or 0) >= NGUONG_NGHIA and _cung_quan(u.get("quan_cu"), quan)
              and ten_gan(ten, u.get("ten"), TU_CHUNG_PHUONG)]
        kq = _mot([u.get("phuong") for u in ds])
        if kq:
            log.info("phường theo nghĩa: %r → %s", ten, kq)
        return kq

    def phuong_cu_chia(self, chu: str | None, quan: str | None) -> list[str]:
        """Phường mới mà "phường 6" (cũ, đánh số) của `quan` bị chia về, khi từ 2 phường trở lên — xem hàm cùng tên ở mức module. Nhớ theo (số, quận)."""
        moi = self._phuong_moi(chu, quan)
        return moi if len(moi) >= 2 else []

    def phuong_cu_moi(self, chu: str | None, quan: str | None) -> str | None:
        """Phường mới DUY NHẤT của phường cũ đánh số ("phường 2" Quận 8 → "Phường Chánh Hưng") — SRS-5.1zzzzzzz220; bị chia / không tra ra → None."""
        moi = self._phuong_moi(chu, quan)
        return moi[0] if len(moi) == 1 else None

    def _phuong_moi(self, chu: str | None, quan: str | None) -> list[str]:
        so = so_phuong_cu(chu)
        khoa = (so if so is not None else _loi(chu or "", TU_CHUNG_PHUONG), _khoa_quan(quan))
        if not khoa[0] or not khoa[1]:
            return []
        if khoa not in self._nho_chia:
            if len(self._nho_chia) > 200:
                self._nho_chia.clear()
            self._nho_chia[khoa] = phuong_moi_tu_cu(self._doc, so, quan, None if so is not None else chu)
        return self._nho_chia[khoa]

    def xa(self, ten: str | None) -> dict | None:
        """Xã / phường mới của tỉnh Tây Ninh (hợp nhất Long An) hoặc Đồng Nai (hợp nhất Bình Phước) theo chữ khách gõ — xem `tra_xa`. Bảng 191 dòng,
        nhớ 10 phút; lỗi → None."""
        if self._doc is None or not (ten or "").strip():
            return None
        hom_nay = time.time()
        if self._kho_xa is None or hom_nay - self._kho_xa[0] > 600:
            try:
                dong = self._doc("xa_tinh_khac", {"select": "ten_day_du,ten,loai,tinh,tinh_cu,don_vi_cu", "limit": "500"})
            except Exception as e:  # noqa: BLE001 — tra địa danh là phần thêm
                log.warning("đọc xa_tinh_khac lỗi: %s", e)
                dong = self._kho_xa[1] if self._kho_xa else []
            self._kho_xa = (hom_nay, dong)
        return tra_xa(self._kho_xa[1], ten)

    def duong(self, ten: str | None, quan: str | None = None) -> dict | None:
        """{"ten": tên đường trong kho, "chac": True khi chỉ khác dấu / hoa thường, "phuong": [phường mới]} — `phuong` theo quận
        khi biết quận. Không ra một tên duy nhất → None."""
        khoa = ((ten or "").strip().lower(), quan)
        if khoa not in self._nho:
            if len(self._nho) > 500:
                self._nho.clear()
            self._nho[khoa] = self._duong(ten, quan)
        return self._nho[khoa]

    def _duong(self, ten: str | None, quan: str | None) -> dict | None:
        ten = (ten or "").strip()
        if not ten:
            return None
        ds = self._thu("tim_duong", {"p_ten": ten, "p_quan": quan, "p_toi_da": 2})
        if ds:
            gan = min(u.get("khoang_cach", 9) for u in ds)
            cung = [u.get("ten") for u in ds if u.get("khoang_cach", 9) == gan]
            # SRS-5.1zzzzzzz270 (chat 29/10, đường Mã Lò): so bỏ dấu thì "Mã Lò" (Bình Tân) và "Mã Lộ" (Quận 1) trùng nhau → không ra tên nào,
            # bot không kể được phường, hỏi trống "gần chợ, trường, ngã tư". Khách gõ ĐÚNG DẤU một tên trong số đó thì nhận tên đó.
            ten_kho = _mot(cung) or _mot([t for t in cung if t and t.strip().lower() == ten.lower()])
            if not ten_kho:
                return None
            u = next(u for u in ds if u.get("ten") == ten_kho)
            return {"ten": ten_kho, "chac": gan == 0, "phuong": self._phuong_cua_duong(ten_kho, quan, u.get("phuong") or [])}
        ds = [u for u in self._theo_nghia(ten, None)
              if u.get("loai") not in LOAI_KHONG_PHAI_DUONG and (u.get("do_gan") or 0) >= NGUONG_NGHIA
              and _cung_quan(u.get("quan_cu"), quan) and ten_gan(ten, u.get("ten"), TU_CHUNG_DUONG)]
        ten_kho = _mot([u.get("ten") for u in ds])
        if not ten_kho:
            return None
        log.info("đường theo nghĩa: %r → %s", ten, ten_kho)
        return {"ten": ten_kho, "chac": False,
                "phuong": self._phuong_cua_duong(ten_kho, quan, [u.get("phuong") for u in ds if u.get("phuong")])}

    def phuong_theo_hem(self, dia_chi: str | None, ten_duong: str | None, quan: str | None = None, la_hem: bool = False) -> list[str]:
        """Phường mới của HẺM trong địa chỉ (SRS-5.1zzzzzzz115): "137/28 Đường số 59" → hẻm 137 của Đường số 59 — kho hẻm (bảng
        duong, loai = hem, OSM) chỉ có ở An Hội Tây dù đường đi qua 7 phường. Không có số hẻm / kho không có hẻm đó → []."""
        so = so_hem_cua(dia_chi, ten_duong, la_hem)
        if not so or not ten_duong or self._doc is None:
            return []
        khoa = (ten_duong, tuple(so), quan)
        if khoa not in self._nho_hem:
            if len(self._nho_hem) > 500:
                self._nho_hem.clear()
            try:
                dong = self._doc("duong", {"select": "phuong,quan_cu", "loai": "eq.hem", "duong_me": f"eq.{ten_duong}",
                                           "so_hem": "in.(" + ",".join(f'"{x}"' for x in so) + ")"})
            except Exception as e:  # noqa: BLE001 — tra kho hẻm là phần thêm
                log.warning("đọc kho hẻm lỗi: %s", e)
                dong = []
            self._nho_hem[khoa] = sorted({d.get("phuong") for d in dong if d.get("phuong") and _cung_quan(d.get("quan_cu"), quan)})
            # warning, không phải info: lõi production chỉ in từ warning (bắn thử 21/10 không thấy dòng này dù đã tra). Chỉ con số.
            log.warning("phường theo hẻm: %d phường", len(self._nho_hem[khoa]))
        return self._nho_hem[khoa]

    def phuong_theo_so_nha(self, dia_chi: str | None, ten_duong: str | None, quan: str | None = None) -> str | None:
        """Phường mới của nhà khi bản đồ OSM có ĐÚNG số nhà đó (SRS-5.1zzzzzzz236, chủ dự án 28/10: "đưa địa chỉ cụ thể hoặc hẻm cụ thể thì nó
        search phường trước bằng nominatim, nếu search không được mới hỏi"). Đo 28/10 trên 20 địa chỉ: toà nhà / dự án ra đúng số 4/10, nhà
        thường 0/10; kết quả chỉ ở mức ĐƯỜNG có lúc sai phường (125 Bình Long, Bình Tân → Phú Thọ Hòa) — nên chỉ nhận khi Nominatim trả đúng
        số nhà + đúng tên đường, phường ra phải là MỘT phường trong kho, nằm trong các phường con đường đi qua (và của hẻm, nếu kho hẻm có).
        Không chắc / lỗi mạng → None (bot hỏi như cũ). Nhớ theo (số, đường, quận); lỗi mạng không nhớ."""
        m = _SO_NHA_DAU.match(dia_chi or "")
        if not m or not ten_duong:
            return None
        so = m.group(1).upper()
        khoa = (so, bo_dau(ten_duong), _khoa_quan(quan))
        nho = self._nho_so_nha
        if khoa in nho:
            return nho[khoa]
        q = f"{so} {ten_duong}, {quan + ', ' if quan else ''}Thành phố Hồ Chí Minh"
        try:
            ds = self._rpc("tra_nominatim", {"p_q": q, "p_limit": 3, "p_chi_tiet": True, "p_cho_giay": 4})
        except Exception as e:  # noqa: BLE001 — tra bản đồ là phần thêm
            log.warning("phường theo số nhà: lỗi %s", e)
            return None
        duong_khoa = _loi(ten_duong, TU_CHUNG_DUONG)
        kq = None
        for r in ds if isinstance(ds, list) else []:
            a = r.get("address") or {}
            so_osm = {re.sub(r"\s", "", x).upper() for x in re.split(r"[;,]", str(a.get("house_number") or "")) if x.strip()}
            if so not in so_osm or _loi(str(a.get("road") or ""), TU_CHUNG_DUONG) != duong_khoa:
                continue
            ten = a.get("suburb") or a.get("quarter")
            kq = self.phuong(ten) if ten else None
            break
        if kq:
            d = self.duong(ten_duong, quan)
            hop_le = list(d["phuong"]) if d else []
            hem = self.phuong_theo_hem(dia_chi, d["ten"] if d else ten_duong, quan)
            if (hop_le and kq not in hop_le) or (hem and kq not in hem):
                log.warning("phường theo số nhà: bản đồ ra phường ngoài kho đường / hẻm — bỏ")
                kq = None
        log.warning("phường theo số nhà: %s", "trúng" if kq else "không ra")
        if len(nho) > 500:
            nho.clear()
        nho[khoa] = kq
        return kq

    def _phuong_cua_duong(self, ten: str, quan: str | None, mac_dinh: list) -> list[str]:
        """Phường mới con đường đi qua — trong quận đã biết (bảng duong theo quận cũ); không biết quận thì danh sách chung."""
        if quan and self._doc is not None:
            try:
                dong = self._doc("duong", {"select": "phuong", "ten": f"eq.{ten}", "quan_cu": f"eq.{quan}"})
                ds = sorted({d.get("phuong") for d in dong if d.get("phuong")})
                if ds:
                    return ds
            except Exception as e:  # noqa: BLE001
                log.warning("đọc bảng duong lỗi: %s", e)
        return sorted({p for p in mac_dinh if p})


# Số nhà / số hẻm trong địa chỉ: "137/28", "387/12A", "hẻm 965", "hxh 12/3". Đây là đọc KHUÔN SỐ của địa chỉ (không đoán ý khách):
# ô dia_chi đã do AI ghi và qua cổng bằng chứng. So trên chữ bỏ dấu, đã gỡ tên đường ("Đường số 59" không cho số 59).
_SO_NHA_DAU = re.compile(r"\s*(?:số\s*)?(\d+[a-zA-Z]?(?:/\d+[a-zA-Z]?)*)\b", re.I)   # số nhà đứng đầu ô dia_chi ("125", "12/3", "156B")
_SO_DIA_CHI = re.compile(r"(?:\b(hem|hxh|kiet|ngo)\s*)?\b(\d+[a-z]?(?:/\d+[a-z]?)*)\b")


def so_hem_cua(dia_chi: str | None, ten_duong: str | None = None, la_hem: bool = False) -> list[str]:
    """Số hẻm trong địa chỉ, từ hẻm ngoài vào trong. "137/28 Đường số 59" (nhà 28 trong hẻm 137) → ["137"]; "137/28/5" →
    ["137", "137/28"]; "hẻm 965 Quang Trung" → ["965"]; "285 Cách Mạng Tháng Tám" (số nhà mặt tiền) → []. `la_hem` = ô hẻm / mặt
    tiền nói căn trong hẻm: khi đó số trần ("965 Quang Trung" — AI bỏ chữ "hẻm" khách gõ) là số hẻm."""
    chu = bo_dau(dia_chi or "")
    if ten_duong:
        chu = chu.replace(bo_dau(ten_duong), " ")
    ds = list(_SO_DIA_CHI.finditer(chu))
    # Số đi sau chữ "hẻm" thắng; không có thì số có "/" đầu tiên; căn trong hẻm thì số trần đầu tiên.
    m = next((x for x in ds if x.group(1)), None) or next((x for x in ds if "/" in x.group(2)), None)
    if m is None and la_hem and ds:
        return [ds[0].group(2).upper()]
    if not m:
        return []
    phan = m.group(2).upper().split("/")
    sau = len(phan) if m.group(1) else len(phan) - 1      # có chữ hẻm: cả số là hẻm; không: phần cuối là số nhà
    return ["/".join(phan[:i]) for i in range(1, sau + 1)]


def nhung_gemini(khoa: list[str], han_giay: float = 2.5) -> Callable[[str], list[float]]:
    """Vector 768 chiều của câu tìm. Nhiều khoá: khoá trước hết hạn mức (429) thì thử khoá sau; lỗi khác ném luôn."""
    def nhung(text: str) -> list[float]:
        loi: Exception | None = None
        for k in khoa:
            body = json.dumps({"content": {"parts": [{"text": text[:2000]}]}, "taskType": "RETRIEVAL_QUERY",
                               "outputDimensionality": SO_CHIEU}).encode("utf-8")
            req = urllib.request.Request(URL_NHUNG, data=body,
                                         headers={"Content-Type": "application/json", "x-goog-api-key": k})
            try:
                with urllib.request.urlopen(req, timeout=han_giay) as r:
                    v = (json.loads(r.read().decode("utf-8")).get("embedding") or {}).get("values")
            except urllib.error.HTTPError as e:
                loi = e
                if e.code == 429:
                    continue
                raise
            if not isinstance(v, list) or len(v) != SO_CHIEU:
                raise ValueError("Gemini embed trả khuôn lạ")
            return v
        raise loi or ValueError("Gemini embed: không có khoá")
    return nhung


def _goi_y(tra: TraDiaDanh | None, fields: dict[str, str]) -> dict | None:
    """Tên đường khách gõ chưa khớp đúng kho mà gần MỘT tên trong kho ("trần ninh trọng" → Trần Bình Trọng)."""
    if tra is None or not fields.get("duong"):
        return None
    d = tra.duong(fields.get("duong"), fields.get("quan"))
    return d if d and not d["chac"] and d["ten"] != fields.get("duong") else None


def goi_y_duong(tra: TraDiaDanh | None, fields: dict[str, str]) -> str:
    """Dòng cho lượt AI lập thao tác: khách xác nhận tên kho gợi ý (hay tự sửa) thì AI ghi lại ô duong / dia_chi theo lời khách."""
    d = _goi_y(tra, fields)
    if not d:
        return ""
    return (f'TÊN ĐƯỜNG CHƯA KHỚP KHO: ô duong đang ghi "{fields["duong"]}", kho đường có "{d["ten"]}" (bot đã / sẽ hỏi xác nhận). '
            f'Khách xác nhận đúng là {d["ten"]} (vd "đúng rồi", "ừ", "phải") → ghi duong = "{d["ten"]}" và sửa tên đường trong '
            "dia_chi cho khớp; khách nói tên khác → ghi theo lời khách; khách không nhắc tới → không đổi.\n")


def phuong_kho_hem(tra: TraDiaDanh | None, fields: dict[str, str]) -> list[str]:
    """SRS-5.1zzzzzzz115: số hẻm trong địa chỉ thu hẹp phường — chủ dự án 21/10 "họ nói 137/28 đường số 59 con bot có hiểu ko"
    (Đường số 59 qua 7 phường, hẻm 137 của nó chỉ ở An Hội Tây). Chưa có phường thì gợi ý ở MỌI lượt (cả lượt tin rao đầu) và
    thay cho gợi ý theo đường; luôn ở dạng HỎI — kho hẻm từ OSM có thể thiếu / lệch. Engine dùng cùng danh sách để kiểm lời bot."""
    if tra is None or not fields.get("duong") or fields.get("phuong") or _goi_y(tra, fields):
        return []
    d = tra.duong(fields.get("duong"), fields.get("quan"))
    return tra.phuong_theo_hem(fields.get("dia_chi"), d["ten"] if d else fields.get("duong"), fields.get("quan"),
                               "hem" in bo_dau(fields.get("lo_gioi_hem") or ""))


def khoi_dia_danh(tra: TraDiaDanh | None, fields: dict[str, str], next_field: str | None) -> str:
    """Khối cho prompt trả lời: tên đường khách gõ gần với đường nào trong kho (hỏi xác nhận, lượt nào cũng được — không chỉ lúc
    hỏi địa chỉ), và khi sắp hỏi phường thì đường đó đi qua những phường nào. Hệ thống tra, không phải khách nói."""
    if tra is None:
        return ""
    dong: list[str] = []
    x = tra.xa(fields.get("phuong"))
    if x:   # SRS-5.1zzzzzzz128: xã đã tra ra tỉnh mới — bot không hỏi huyện / quận / tỉnh nữa
        cu = [t for t in x["don_vi_cu"] if _loi_xa(t) != _loi_xa(x["ten_day_du"])]
        gop = {"Tây Ninh": "Long An cũ", "Đồng Nai": "Bình Phước cũ"}.get(x["tinh"], "tỉnh cũ")
        if x.get("ngoai_vung"):   # SRS-5.1zzzzzzz129: đơn vị này thuộc Bình Phước cũ — ngoài vùng nhận tin dù nay nằm trong tỉnh Đồng Nai
            dong.append(f'Xã / phường khách nói là {x["ten_day_du"]}, trước 01/07/2025 thuộc tỉnh {x["tinh_cu"]}, nay gộp vào tỉnh {x["tinh"]}: '
                        f'căn này vẫn tính là {x["tinh_cu"]} CŨ nên NẰM NGOÀI khu vực nhận tin của bên mình.')
        else:
            dong.append(f'Xã / phường khách nói là {x["ten_day_du"]}, tỉnh {x["tinh"]} (từ 01/07/2025 tỉnh {x["tinh"]} gồm cả {gop}; '
                        f'hợp nhất từ: {", ".join(x["don_vi_cu"]) or "giữ nguyên, không sáp nhập"}). Địa chỉ cấp xã + tỉnh là ĐỦ: KHÔNG hỏi quận / huyện / tỉnh, '
                        f'ghi đúng tên {x["ten_day_du"]}.' + (" Khách gọi bằng tên đơn vị cũ thì nhận, không bắt sửa." if x["tu_ten_cu"] or cu else ""))
    chia = getattr(tra, "phuong_cu_chia", None)
    chia = chia(fields.get("phuong"), fields.get("quan")) if chia else []
    if len(chia) >= 2:
        # SRS-5.1zzzzzzz191 (chat anh Luận 26/10): khách nói "phường 6" — phường CŨ đánh số bị chia về hai phường mới nên hệ thống không tự ghi
        # được phường; bản trước bot cứ hỏi tiếp việc khác rồi tới lúc duyệt tin mới hỏi trống "phường mới nào". Hỏi NGAY, kèm các lựa chọn.
        dong.append(f'Khách nói phường "{fields.get("phuong")}" — đó là phường CŨ (trước sáp nhập); từ 01/07/2025 nó chia về nhiều phường mới ({", ".join(chia)}) '
                    f'nên CHƯA biết nhà thuộc phường nào. Khi "Thông tin cần hỏi tiếp theo" là phường: kể hai phường mới cho khách '
                    f'chọn (vd "{fields.get("phuong")} cũ giờ chia về {" hoặc ".join(chia)}, nhà mình ở phường nào ạ?"), KHÔNG hỏi trống "phường nào". '
                    "Khách đã chọn hay nói phường khác thì ghi theo khách, không hỏi lại. Danh sách phường do hệ thống tra, KHÔNG phải khách nói.")
    mot = getattr(tra, "phuong_cu_moi", None)
    mot = mot(fields.get("phuong"), fields.get("quan")) if mot and len(chia) < 2 else None
    if mot:
        # SRS-5.1zzzzzzz220 (chat 27/10: khách "phường 2 quận 8", bản tin in "Phường 2, Quận 8"; khách: "phường 2 hiện tại là phường chánh hưng à
        # em"): cột `ward` ghi đúng Phường Chánh Hưng nhưng model chỉ thấy ô "Phường 2" nên nói / rao theo tên cũ.
        dong.append(f'Khách nói phường "{fields.get("phuong")}" — tên TRƯỚC sáp nhập; từ 01/07/2025 nay là {mot} (hệ thống tra, chỉ về MỘT phường '
                    f'nên chắc chắn). Khi nói với khách và trong bản tin dùng tên MỚI "{mot}" (được kèm "{fields.get("phuong")} cũ" trong ngoặc); báo khách '
                    "đúng MỘT lần, câu ngắn, ở lượt đầu nhắc tới phường — lượt sau không nhắc lại; KHÔNG hỏi lại phường.")
    if not fields.get("duong"):
        return ("\n\nTRA CỨU ĐỊA DANH (hệ thống tra kho đường / phường, KHÔNG phải khách nói; không tự chọn thay khách):\n- " + "\n- ".join(dong)) if dong else ""
    goi_y = _goi_y(tra, fields)
    if goi_y:
        dong.append(f'Tên đường khách gõ "{fields["duong"]}" gần với đường "{goi_y["ten"]}" trong kho, kho không có tên khách gõ. '
                    f'Lượt này hỏi khéo xác nhận có phải đường "{goi_y["ten"]}" không TRƯỚC, thay cho câu hỏi kế (theo đúng cách xưng '
                    "hô lượt này), không nhắc chữ khách gõ sai. Trong hội thoại khách đã trả lời giữ tên của mình thì thôi, không hỏi lại.")
    d = tra.duong(fields.get("duong"), fields.get("quan"))
    ph = d["phuong"] if d else []
    # SRS-5.1zzzzzzz228 (ban-thu-srd 27/10: bot hỏi "có phải Phường Chợ Quán không" 5 lượt liền, cả sau khi đã báo admin tra phường): dòng
    # kho hẻm kèm sẵn câu hỏi nên model hỏi phường ở MỌI lượt có khối này — chỉ đưa ở lượt hệ thống chọn hỏi phường.
    ph_hem = phuong_kho_hem(tra, fields) if next_field == "phuong" else []
    if len(ph_hem) == 1:
        dong.append(f"Kho hẻm: hẻm trong địa chỉ khách chỉ có ở {ph_hem[0]} — khi hỏi phường, hỏi xác nhận dạng HỎI (\"nhà mình ở "
                    f"{ph_hem[0]} đúng không anh/chị?\"), KHÔNG khẳng định; khách nói phường khác thì ghi theo khách, không hỏi lại.")
    elif 2 <= len(ph_hem) <= 4:
        dong.append(f"Kho hẻm: hẻm trong địa chỉ khách nằm ở {', '.join(ph_hem)} — khi hỏi phường, kể các phường này cho khách chọn.")
    elif next_field == "phuong" and not goi_y and 1 <= len(ph) <= 4:
        if len(ph) == 1:
            # SRS-5.1zzzzzzz79: bắn thử 20/10 bot nói "đường Âu Cơ thuộc khu vực Phường Hòa Bình" rồi lại hỏi phường — gợi ý kho được
            # nói như sự thật. Chỉ được nhắc ở dạng câu hỏi.
            dong.append(f"Kho đường: đường {d['ten']} nằm ở {ph[0]} — hỏi khách nhà thuộc phường nào; muốn gợi ý thì chỉ ở dạng HỎI "
                        f"(\"có phải {ph[0]} không anh/chị?\"), KHÔNG khẳng định đường / nhà thuộc {ph[0]}; khách nói phường khác thì "
                        "ghi theo khách, không hỏi lại (kho có thể thiếu đoạn).")
        else:
            dong.append(f"Kho đường: đường {d['ten']} đi qua {', '.join(ph)} — khi hỏi phường, kể các phường này cho khách chọn.")
    if not dong:
        return ""
    return ("\n\nTRA CỨU ĐỊA DANH (hệ thống tra kho đường / phường, KHÔNG phải khách nói; không tự chọn thay khách):\n- "
            + "\n- ".join(dong))
