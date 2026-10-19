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
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable

log = logging.getLogger("aioi.dia_danh")

URL_NHUNG = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"
SO_CHIEU = 768
NGUONG_NGHIA = 0.55

LOAI_PHUONG = ("phuong_moi", "phuong_cu")
LOAI_KHONG_PHAI_DUONG = ("phuong_moi", "phuong_cu", "quan_cu", "du_an")
TU_CHUNG_PHUONG = frozenset({"phuong", "xa", "thi", "tran", "p", "tt"})
TU_CHUNG_DUONG = frozenset({"duong", "pho", "hem", "hxh", "ngo", "kiet"})


def bo_dau(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


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


class TraDiaDanh:
    """`rpc(tên, payload) -> list`, `doc(bảng, tham số) -> list` (PostgREST), `nhung(text) -> list[float]` (Gemini; None = chỉ
    tra theo chữ). Mọi lỗi → None."""

    def __init__(self, rpc: Callable[[str, dict], list], doc: Callable[[str, dict], list] | None = None,
                 nhung: Callable[[str], list[float]] | None = None):
        self._rpc = rpc
        self._doc = doc
        self._nhung = nhung
        self._nho: dict[tuple, dict | None] = {}   # (tên, quận) → kết quả duong(): prompt hỏi lại mỗi lượt, khỏi tra / nhúng lại

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
            ten_kho = _mot([u.get("ten") for u in ds if u.get("khoang_cach", 9) == gan])
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


def khoi_dia_danh(tra: TraDiaDanh | None, fields: dict[str, str], next_field: str | None) -> str:
    """Khối cho prompt trả lời: tên đường khách gõ gần với đường nào trong kho (hỏi xác nhận, lượt nào cũng được — không chỉ lúc
    hỏi địa chỉ), và khi sắp hỏi phường thì đường đó đi qua những phường nào. Hệ thống tra, không phải khách nói."""
    if tra is None or not fields.get("duong"):
        return ""
    dong: list[str] = []
    goi_y = _goi_y(tra, fields)
    if goi_y:
        dong.append(f'Tên đường khách gõ "{fields["duong"]}" gần với đường "{goi_y["ten"]}" trong kho, kho không có tên khách gõ. '
                    f'Lượt này hỏi khéo xác nhận có phải đường "{goi_y["ten"]}" không TRƯỚC, thay cho câu hỏi kế (theo đúng cách xưng '
                    "hô lượt này), không nhắc chữ khách gõ sai. Trong hội thoại khách đã trả lời giữ tên của mình thì thôi, không hỏi lại.")
    d = tra.duong(fields.get("duong"), fields.get("quan"))
    ph = d["phuong"] if d else []
    if next_field == "phuong" and not goi_y and 1 <= len(ph) <= 4:
        if len(ph) == 1:
            dong.append(f"Kho đường: đường {d['ten']} nằm ở {ph[0]} — hỏi khách xác nhận nhà thuộc {ph[0]} đúng không.")
        else:
            dong.append(f"Kho đường: đường {d['ten']} đi qua {', '.join(ph)} — khi hỏi phường, kể các phường này cho khách chọn.")
    if not dong:
        return ""
    return ("\n\nTRA CỨU ĐỊA DANH (hệ thống tra kho đường / phường, KHÔNG phải khách nói; không tự chọn thay khách):\n- "
            + "\n- ".join(dong))
