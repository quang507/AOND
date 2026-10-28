"""Projects (condos / developments) and their shared attributes.

A project carries facts that belong to EVERY property in it — pool, gym, entrance
gate, security, access road, location. Register a project once; when a lister then
lists a property whose `du_an` (project) matches, the property INHERITS these facts,
so AOND can advise about the pool/gate without asking and without inventing (project
data is operator-verified ground truth).

In-memory for now, behind a `ProjectStore` interface so SharePoint / a DB can back it
later ("Cắm Rút"), same as the LLM provider. See [[aioi-data-model]] (Project→UnitType→Unit).
"""
from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from abc import ABC, abstractmethod
from collections.abc import Iterable
from dataclasses import dataclass, field


# Phiếu có TRỌNG SỐ theo hạng người nói (SRS-5.1zzzzzzz249, chủ dự án 28/10/2026: "ai nhắn zalo thì dựa theo hạng đồng bạc vàng để vote
# cho kiến thức dự án, còn admin nhắn thì ghi thẳng"). Một giá trị CHỐT khi tổng điểm phiếu ủng hộ ≥ SETTLE_N VÀ tổng điểm các giá trị khác
# ≤ SETTLE_N/3. Đồng 1 · Bạc 2 · Vàng 3 điểm (phiếu cũ không ghi hạng tính 1) → 6 khách Đồng, 3 Bạc hoặc 2 Vàng là chốt. CHƯA chốt thì dữ
# kiện CHƯA vào kho chung (`current[key]` giữ giá trị cũ — nguồn mogi hoặc lần chốt trước); chỉ nằm trong phiếu chờ.
SETTLE_N = 6
HANG_DIEM = {"vang": 3, "bac": 2, "dong": 1}

# `votes[key][value]` is the LIST OF DISTINCT VOTER CODES that asserted this value — never a raw counter — so one seller repeating
# themselves can't inflate the tally ("no phantom votes"). Mã phiếu = "<hạng>:<zalo id>" (`ma_phieu`), hoặc "chac_chan:…".
Tally = dict[str, list[str]]  # value -> voter codes


def _count(tally: Tally, value: str) -> int:
    return len(tally.get(value, []))


# Phiếu CHẮC CHẮN (21/10/2026, SRS-5.1zzzzzzz96): nguồn chủ dự án nhập tay (bảng giá, rổ hàng chính thức) — chủ dự án: "cái này tôi
# nhập tay nên là chắc chắn". Giá trị có phiếu này thắng ngay và coi như đã chốt; phiếu khách vẫn bầu như cũ, nhiều phiếu khách KHÔNG
# lật được nó. Hai nguồn chắc chắn khác nhau thì giá trị được ghi SAU (đứng sau trong tally) thắng. Admin nhắn Zalo = phiếu này (SRS-249).
CHAC_CHAN = "chac_chan:"


def ma_phieu(user_key: str, hang: str | None = None, admin: bool = False) -> str:
    """Mã phiếu của một người: admin → `chac_chan:admin:<id>` (ghi thẳng); khách → `<hạng>:<id>` (hạng vang / bac / dong)."""
    if admin:
        return f"{CHAC_CHAN}admin:{user_key}"
    return f"{hang}:{user_key}" if hang in HANG_DIEM else user_key


def la_ma_phieu(voter: str) -> bool:
    """Đã là mã phiếu (có tiền tố hạng / chắc chắn) — engine không mã hoá lần hai."""
    v = str(voter)
    return v.startswith(CHAC_CHAN) or v.split(":", 1)[0] in HANG_DIEM


def _nguoi(voter: str) -> str:
    """Người đứng sau mã phiếu (bỏ tiền tố hạng) — mỗi người MỘT phiếu mỗi ô dù hạng đổi giữa hai lần nói."""
    v = str(voter)
    dau, _, sau = v.partition(":")
    return sau if sau and dau in HANG_DIEM else v


def _chac_chan(voters: list[str]) -> bool:
    return any(str(v).startswith(CHAC_CHAN) for v in voters)


def _diem(voters: list[str]) -> float:
    if _chac_chan(voters):
        return float("inf")
    return float(sum(HANG_DIEM.get(str(v).split(":", 1)[0], 1) for v in voters))


def _leading(tally: Tally) -> str:
    """Value with the most vote POINTS; ties keep the earliest-seen value. A value backed by a CHẮC CHẮN voter wins."""
    chac = [v for v, vs in tally.items() if _chac_chan(vs)]
    if chac:
        return chac[-1]
    return max(tally, key=lambda v: _diem(tally[v]))


def _is_settled(tally: Tally) -> bool:
    """True once one value wins decisively (see SETTLE_N) — chốt lên kho chung, bot thôi hỏi."""
    if not tally:
        return False
    lead = _leading(tally)
    if _chac_chan(tally[lead]):
        return True
    opposing = sum(_diem(vs) for v, vs in tally.items() if v != lead)
    return _diem(tally[lead]) >= SETTLE_N and opposing <= SETTLE_N / 3


def merge_facts(
    current: dict[str, str],
    votes: dict[str, Tally],
    new: dict[str, str],
    voter: str = "?",
) -> None:
    """Record each person's assertions as VOTES. One person gets ONE vote per key: re-asserting the same value refreshes their code
    (hạng mới), asserting a different value MOVES their vote. `current[key]` (kho chung) only takes the leading value once it SETTLES
    (`_is_settled`) — before that the old value stays (mogi seed / earlier settled value) and the claim waits in `votes`
    (SRS-5.1zzzzzzz249). Pass `voter` = mã phiếu (`ma_phieu`)."""
    ai = _nguoi(voter)
    for key, value in new.items():
        value = (value or "").strip()
        if not value:
            continue
        tally = votes.setdefault(key, {})
        for vs in tally.values():  # one vote per person: drop their prior pick (any value, any tier code)
            for x in [x for x in vs if _nguoi(x) == ai]:
                vs.remove(x)
        tally.setdefault(value, []).append(voter)
        for v in [v for v, vs in tally.items() if not vs]:  # prune emptied values
            del tally[v]
        if _is_settled(tally):
            current[key] = _leading(tally)


def pending_lines(votes: dict[str, Tally], current: dict[str, str]) -> list[str]:
    """Dữ kiện đang CHỜ đủ phiếu (chưa vào kho chung): chưa được nói như sự thật — chỉ để bot có dịp hỏi người khác xác minh."""
    ra = []
    for key, tally in votes.items():
        if not tally or _is_settled(tally):
            continue
        lead = _leading(tally)
        if current.get(key) == lead:
            continue
        ra.append(f"{key}: {lead} (đang chờ xác nhận {_diem(tally[lead]):g}/{SETTLE_N} điểm)")
    return ra


def _contested(votes: dict[str, Tally]) -> list[str]:
    """Keys with a claim still WAITING for votes (not settled) — worth verifying with the next seller of the project (SRS-249: một người
    nói cũng là chờ, không chỉ khi hai người nói khác nhau)."""
    return [k for k, tally in votes.items() if tally and not _is_settled(tally)]


def _fact_lines(values: dict[str, str], votes: dict[str, Tally]) -> list[str]:
    """Dòng dữ kiện ĐÃ VÀO kho chung (nguồn mogi / đã chốt / chắc chắn). Lời đang chờ phiếu ở `pending_lines`, không trộn vào đây
    (SRS-249: trước bản này một người nói là thành "dữ liệu dự án đã xác thực" cho người sau)."""
    return [f"{key}: {value}" for key, value in values.items() if value]


@dataclass
class UnitType:
    """A house model / unit type within a project (e.g. "Fusion Gen 5", "Type B 3PN").
    Units of this type share ~99% of these facts (layout, areas, số phòng...)."""

    name: str
    specs: dict[str, str] = field(default_factory=dict)  # diện tích, số phòng, số tầng, layout...
    votes: dict[str, Tally] = field(default_factory=dict)  # per-spec voters {value: [seller ids]}
    media: list[dict[str, str]] = field(default_factory=list)  # model brochure/floor-plan/renders
    # (SharePoint MediaRef dicts) — shared by EVERY unit of this model; see [[aioi-data-model]].
    goc: bool = False  # mẫu đọc từ cột `projects.unit_types` (nguồn mogi) — chỉ ghi lại kho kiến thức khi đã học thêm (SRS-249)

    def facts(self) -> list[str]:
        return _fact_lines(self.specs, self.votes)

    def pending(self) -> list[str]:
        return pending_lines(self.votes, self.specs)

    def contested_keys(self) -> list[str]:
        return _contested(self.votes)


@dataclass
class Unit:
    """A PHYSICAL unit in a project's inventory — a lô in a phân-lô development, or a căn in a
    condo. Identity = `ma_so_can` within the project. `attrs` is a FREE-FORM attribute bag
    (key→value) so ONE structure fits ANY property type: a phân-lô unit carries
    dien_tich_dat/mat_tien/vi_tri, a condo unit carries dien_tich/huong/view/tang — same shape,
    different keys, nothing hard-coded to houses. Each attribute tracks votes so a fact learned
    from one seller is shared with the next and conflicts settle (see [[aioi-data-model]]). This
    is the PROJECT's inventory (all units), distinct from a seller's basket (the units they rao)."""

    ma_so_can: str
    attrs: dict[str, str] = field(default_factory=dict)
    votes: dict[str, Tally] = field(default_factory=dict)  # per-attribute voters {value: [seller ids]}
    loai_hinh: str = ""  # nha_pho / chung_cu / ... — which attribute set is meaningful

    def learn(self, new: dict[str, str], voter: str = "?") -> None:
        """Record what a seller told us about this unit as VOTES (shared knowledge that grows)."""
        merge_facts(self.attrs, self.votes, {k: v for k, v in new.items() if k != "ma_so_can"}, voter)

    def known(self) -> dict[str, str]:
        return {"ma_so_can": self.ma_so_can, **{k: v for k, v in self.attrs.items() if v}}


@dataclass
class Project:
    name: str
    amenities: list[str] = field(default_factory=list)       # hồ bơi, gym, công viên...
    attributes: dict[str, str] = field(default_factory=dict)  # cổng, an ninh, đường vào, vị trí...
    unit_types: list[UnitType] = field(default_factory=list)  # mẫu nhà / loại căn của dự án
    votes: dict[str, Tally] = field(default_factory=dict)  # per-attribute voters {value: [seller ids]}
    docs: list[dict[str, str]] = field(default_factory=list)  # source docs read ONCE, kept as
    # faithful MARKDOWN for the model to re-read cheaply (grounding): {kind, title, markdown,
    # web_url, item_id, fetched_at}. See [[aioi-data-model]] — phân lô, brochure mẫu nhà,
    # bảng mô tả gói nội thất... loaded once, reused forever.
    units: list[Unit] = field(default_factory=list)  # the project's INVENTORY (each mã số căn +
    # its free-form attribute bag). Seeded from a price list / phân lô; grows as sellers tell us
    # more. Queried by the 4 plain functions in aioi.inventory (the substrate for the agent loop).
    # Một nguồn (SRS-5.1zzzzzzz249): `id` = projects.id (rỗng = dự án mới chỉ biết qua chat, chưa có dòng `projects`); `goc` / `goc_tien_ich`
    # = dữ kiện nguồn mogi đọc từ cột `projects` (KHÔNG ghi lại vào kho kiến thức — chỉ phần học thêm mới ghi); `rieng` = dữ liệu riêng
    # không bao giờ vào prompt (giá bảng giá chủ đầu tư chờ nhập thành tin rao).
    id: str = ""
    goc: dict[str, str] = field(default_factory=dict)
    goc_tien_ich: list[str] = field(default_factory=list)
    rieng: dict = field(default_factory=dict)

    def docs_cho(self, voter: str | None = None) -> list[dict[str, str]]:
        """Tài liệu ĐÃ VÀO kho chung (admin / chủ dự án gửi, hoặc tài liệu cũ không ghi người gửi) + tài liệu của chính `voter`. Tài liệu một
        người bán gửi chưa ai duyệt thì người khác không thấy (SRS-249: học từ chat phải chờ duyệt mới lên kho chung)."""
        ai = _nguoi(voter) if voter else None
        return [d for d in self.docs
                if not d.get("nguoi_gui") or str(d["nguoi_gui"]).startswith(CHAC_CHAN) or (ai and _nguoi(d["nguoi_gui"]) == ai)]

    def find_unit(self, ma_so_can: str | None) -> Unit | None:
        key = normalize_project_name(ma_so_can or "")
        if not key:
            return None
        return next((u for u in self.units if normalize_project_name(u.ma_so_can) == key), None)

    def upsert_unit(self, ma_so_can: str, attrs: dict[str, str], voter: str = "?",
                    loai_hinh: str = "") -> Unit:
        """Add the unit if new (mã số căn is the key), else MERGE the attrs into the existing
        one via votes — a project can't hold the same physical căn twice."""
        u = self.find_unit(ma_so_can)
        if u is None:
            u = Unit(ma_so_can=ma_so_can, loai_hinh=loai_hinh)
            self.units.append(u)
        if loai_hinh and not u.loai_hinh:
            u.loai_hinh = loai_hinh
        u.learn(attrs, voter)
        return u

    def doc(self, kind: str | None = None, title: str | None = None) -> dict[str, str] | None:
        """The most recent stored source doc matching `kind`/`title` (for grounded re-reads)."""
        for d in reversed(self.docs):
            if (kind is None or d.get("kind") == kind) and (title is None or d.get("title") == title):
                return d
        return None

    def facts(self) -> list[str]:
        """Human-readable lines of the project's shared facts, for prompts/inheritance."""
        lines: list[str] = []
        if self.amenities:
            lines.append("Tiện ích: " + ", ".join(self.amenities))
        return lines + _fact_lines(self.attributes, self.votes)

    def pending(self) -> list[str]:
        """Lời người bán nói về dự án còn CHỜ đủ phiếu — chỉ phía bán thấy, để hỏi xác minh; không nói như sự thật."""
        return pending_lines(self.votes, self.attributes)

    def contested_keys(self) -> list[str]:
        """Attributes still waiting for votes — the bot should find a chance to verify these."""
        return _contested(self.votes)

    def find_unit_type(self, name: str | None) -> UnitType | None:
        if not name:
            return None
        key = find_matching_key(
            normalize_project_name(name), [normalize_project_name(u.name) for u in self.unit_types]
        )
        if key is None:
            return None
        return next(u for u in self.unit_types if normalize_project_name(u.name) == key)

    def upsert_unit_type(self, unit_type: UnitType) -> None:
        for i, existing in enumerate(self.unit_types):
            if normalize_project_name(existing.name) == normalize_project_name(unit_type.name):
                self.unit_types[i] = unit_type  # update in place
                return
        self.unit_types.append(unit_type)


def normalize_project_name(name: str) -> str:
    """Case/space/punctuation-insensitive key for matching project & unit-type names.
    Drops punctuation so "Fusion (Gen 5)" matches "Fusion Gen 5"."""
    s = unicodedata.normalize("NFKC", name or "").casefold()
    s = re.sub(r"[^\w\s]", " ", s)  # punctuation (parens, dashes, ...) → space
    return re.sub(r"\s+", " ", s).strip()


# Generic development-type words that sellers add/drop in front of the REAL project name —
# "Khu Nhà Biệt Lập Ny'ah Phú Định" and "Ny'ah Phú Định" are the same place. Stripped only as a
# LEADING run so a name that is *only* these words isn't erased, and interior words are untouched.
_GENERIC_PREFIX = (
    "khu nhà biệt lập", "khu biệt lập", "khu nhà ở", "khu dân cư", "khu đô thị",
    "khu căn hộ", "khu chung cư", "khu nhà", "dự án", "khu",
)


def _bo_dau(s: str) -> str:
    s = s.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


_GENERIC_PREFIX_BO_DAU = tuple(_bo_dau(p) for p in _GENERIC_PREFIX)


def _strip_generic_prefix(name: str) -> str:
    changed = True
    while changed:
        changed = False
        for pre in _GENERIC_PREFIX_BO_DAU if name.isascii() else _GENERIC_PREFIX:
            if name == pre:
                return name  # the name is ONLY generic words — don't erase it
            if name.startswith(pre + " "):
                name = name[len(pre) + 1:]
                changed = True
                break
    return name


def find_matching_key(query: str, stored_keys: Iterable[str]) -> str | None:
    """Match a normalized query name to a stored normalized key: exact first, then a
    lenient prefix match with a small length diff ("Botanic Tower" ↔ "Botanic Towers"),
    while a generic partial ("Masteri") won't grab "Masteri Thảo Điền".

    Also collapses the two ways sellers unintentionally spawn a DUPLICATE project for the same
    place: (1) apostrophe/space noise — "Ny'ah Phú Định" normalizes to "ny ah phú định" while
    "Nyah Phú Định" → "nyah phú định"; comparing SPACELESS makes them equal. (2) a leading
    development-type phrase — "Khu Nhà Biệt Lập Ny'ah Phú Định" vs "Ny'ah Phú Định". Both checks
    are exact-after-cleaning (not fuzzy), so genuinely different projects don't get merged."""
    keys = list(stored_keys)
    if query in keys:
        return query
    for k in keys:
        if (k.startswith(query) or query.startswith(k)) and abs(len(k) - len(query)) <= 3:
            return k
    # spaceless + generic-prefix-stripped exact match (catches the duplicate-project variants)
    def canon(s: str) -> str:
        # (3) bỏ dấu (SRS-5.1zzzzzzz87): khách gõ không dấu "nyah phu dinh" vẫn là "Ny'ah Phú Định".
        s = _strip_generic_prefix(_bo_dau(s))
        return s.replace(" ", "")
    q = canon(query)
    if q:
        for k in keys:
            if canon(k) == q:
                return k
    return None


class ProjectStore(ABC):
    @abstractmethod
    def save(self, project: Project) -> None: ...

    @abstractmethod
    def get(self, name: str | None) -> Project | None: ...

    @abstractmethod
    def all(self) -> list[Project]: ...


class InMemoryProjectStore(ProjectStore):
    def __init__(self) -> None:
        self._by_name: dict[str, Project] = {}

    def save(self, project: Project) -> None:
        self._by_name[normalize_project_name(project.name)] = project

    def get(self, name: str | None) -> Project | None:
        if not name:
            return None
        key = find_matching_key(normalize_project_name(name), self._by_name)
        return self._by_name.get(key) if key else None

    def all(self) -> list[Project]:
        return list(self._by_name.values())


class SqliteProjectStore(ProjectStore):
    """Persistent ProjectStore — projects survive restarts and are reused for later
    listings (same interface as InMemoryProjectStore; the first piece of the Store layer).
    Chỉ còn cho chạy thử trên máy và làm nguồn chép một lần sang SupabaseProjectStore (SRS-5.1zzzzzzz56)."""

    def __init__(self, path: str = "aioi.db"):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS projects ("
            "key TEXT PRIMARY KEY, name TEXT NOT NULL, amenities TEXT NOT NULL, "
            "attributes TEXT NOT NULL, unit_types TEXT NOT NULL DEFAULT '[]', "
            "votes TEXT NOT NULL DEFAULT '{}', docs TEXT NOT NULL DEFAULT '[]', "
            "units TEXT NOT NULL DEFAULT '[]')"
        )
        for col, default in (("unit_types", "'[]'"), ("votes", "'{}'"), ("docs", "'[]'"),
                             ("units", "'[]'")):
            try:  # migrate older tables that predate a column
                self._conn.execute(f"ALTER TABLE projects ADD COLUMN {col} TEXT NOT NULL DEFAULT {default}")
            except sqlite3.OperationalError:
                pass  # column already exists
        self._conn.commit()

    @staticmethod
    def _row_to_project(row) -> Project:
        units_types = [
            UnitType(u["name"], u.get("specs", {}), u.get("votes", {}), u.get("media", []))
            for u in json.loads(row[3])
        ]
        docs = json.loads(row[5]) if len(row) > 5 and row[5] else []
        units = [
            Unit(u["ma_so_can"], u.get("attrs", {}), u.get("votes", {}), u.get("loai_hinh", ""))
            for u in (json.loads(row[6]) if len(row) > 6 and row[6] else [])
        ]
        return Project(row[0], json.loads(row[1]), json.loads(row[2]), units_types,
                       json.loads(row[4]), docs, units)

    def save(self, project: Project) -> None:
        self._conn.execute(
            "INSERT INTO projects(key, name, amenities, attributes, unit_types, votes, docs, units) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET name=excluded.name, "
            "amenities=excluded.amenities, attributes=excluded.attributes, "
            "unit_types=excluded.unit_types, votes=excluded.votes, docs=excluded.docs, "
            "units=excluded.units",
            (
                normalize_project_name(project.name),
                project.name,
                json.dumps(project.amenities, ensure_ascii=False),
                json.dumps(project.attributes, ensure_ascii=False),
                json.dumps(
                    [{"name": u.name, "specs": u.specs, "votes": u.votes, "media": u.media}
                     for u in project.unit_types],
                    ensure_ascii=False,
                ),
                json.dumps(project.votes, ensure_ascii=False),
                json.dumps(project.docs, ensure_ascii=False),
                json.dumps(
                    [{"ma_so_can": u.ma_so_can, "attrs": u.attrs, "votes": u.votes,
                      "loai_hinh": u.loai_hinh} for u in project.units],
                    ensure_ascii=False,
                ),
            ),
        )
        self._conn.commit()

    _COLS = "name, amenities, attributes, unit_types, votes, docs, units"

    def get(self, name: str | None) -> Project | None:
        if not name:
            return None
        keys = [r[0] for r in self._conn.execute("SELECT key FROM projects")]
        key = find_matching_key(normalize_project_name(name), keys)
        if key is None:
            return None
        row = self._conn.execute(
            f"SELECT {self._COLS} FROM projects WHERE key=?", (key,)
        ).fetchone()
        return self._row_to_project(row)

    def all(self) -> list[Project]:
        rows = self._conn.execute(f"SELECT {self._COLS} FROM projects")
        return [self._row_to_project(r) for r in rows]


def project_to_dict(project: Project, chi_phan_hoc: bool = False) -> dict:
    """Project → JSON (cùng khuôn với cột SQLite cũ) — dùng chung cho kho Supabase và SQLite. `chi_phan_hoc` (SRS-249): bỏ phần đọc từ
    cột `projects` (nguồn mogi) — kho kiến thức chỉ giữ phần học thêm, không chép lại dữ kiện mogi thành bản thứ hai."""
    ut = [u for u in project.unit_types if not (chi_phan_hoc and u.goc and not u.votes and not u.media)]
    d = {
        "name": project.name, "amenities": project.amenities, "attributes": project.attributes,
        "unit_types": [{"name": u.name, "specs": u.specs, "votes": u.votes, "media": u.media} for u in ut],
        "votes": project.votes, "docs": project.docs,
        "units": [{"ma_so_can": u.ma_so_can, "attrs": u.attrs, "votes": u.votes, "loai_hinh": u.loai_hinh}
                  for u in project.units],
    }
    if project.rieng:
        d["rieng"] = project.rieng
    if chi_phan_hoc:
        d["attributes"] = {k: v for k, v in project.attributes.items() if v and project.goc.get(k) != v}
        d["amenities"] = [a for a in project.amenities if a not in project.goc_tien_ich]
    return d


def project_from_dict(d: dict) -> Project:
    return Project(
        d.get("name", ""), d.get("amenities") or [], d.get("attributes") or {},
        [UnitType(u["name"], u.get("specs", {}), u.get("votes", {}), u.get("media", [])) for u in d.get("unit_types") or []],
        d.get("votes") or {}, d.get("docs") or [],
        [Unit(u["ma_so_can"], u.get("attrs", {}), u.get("votes", {}), u.get("loai_hinh", "")) for u in d.get("units") or []],
        rieng=d.get("rieng") or {},
    )


# Cột `projects` (nguồn mogi) → nhãn dữ kiện chung mà bot đọc (SRS-249). Trước bản này phía bán chỉ thấy chủ đầu tư / quận / phường chép
# sang `du_an_kien_thuc` lúc nạp — tiện ích (1.351 dự án), pháp lý, bàn giao, mẫu căn (191 dự án) có trong kho mà bot không bao giờ thấy.
_COT_DU_AN = ("id,name,developer,province,district,ward,location_raw,legal_status,handover_date,handover,status_text,"
              "amenities,unit_types,specs,thong_tin")
_NHAN_MAU = {"dien_tich": "diện tích", "so_phong_ngu": "số phòng ngủ", "so_wc": "số WC", "so_tang": "số tầng"}


def _chu(v) -> str:
    return str(v).strip() if isinstance(v, (str, int, float)) and str(v).strip() else ""


def project_from_row(row: dict, kien_thuc: dict | None = None) -> Project:
    """Một dự án = dòng `projects` (kho chung: nguồn mogi + `thong_tin` đã duyệt) + phần học thêm trong `du_an_kien_thuc` (phiếu chờ, mẫu
    nhà học được, rổ căn chủ đầu tư, tài liệu) nối bằng `project_id` (SRS-5.1zzzzzzz249)."""
    p = project_from_dict({**(kien_thuc or {}), "name": row.get("name") or (kien_thuc or {}).get("name") or ""})
    p.id = str(row.get("id") or "")
    goc: dict[str, str] = {}
    if _chu(row.get("developer")):
        goc["chủ đầu tư"] = _chu(row["developer"])
    vi_tri = _chu(row.get("location_raw")) or ", ".join(x for x in (_chu(row.get("ward")), _chu(row.get("district")),
                                                                   _chu(row.get("province"))) if x)
    if vi_tri:
        goc["vị trí"] = vi_tri
    if _chu(row.get("legal_status")):
        goc["pháp lý"] = _chu(row["legal_status"])
    if _chu(row.get("handover_date")) or _chu(row.get("handover")):
        goc["bàn giao"] = _chu(row.get("handover_date")) or _chu(row.get("handover"))
    if _chu(row.get("status_text")):
        goc["tình trạng"] = _chu(row["status_text"])
    sp = row.get("specs") if isinstance(row.get("specs"), dict) else {}
    if _chu(sp.get("tong_dien_tich")):
        goc["tổng diện tích"] = _chu(sp["tong_dien_tich"])
    tt = row.get("thong_tin") if isinstance(row.get("thong_tin"), dict) else {}
    da_duyet = {k: _chu(v) for k, v in (tt.get("thuoc_tinh") or {}).items() if _chu(v)}
    p.goc = goc
    p.attributes = {**goc, **{k: v for k, v in p.attributes.items() if v}, **da_duyet}
    p.goc_tien_ich = [_chu(a) for a in (row.get("amenities") or []) if _chu(a)] if isinstance(row.get("amenities"), list) else []
    for a in p.goc_tien_ich + [_chu(a) for a in (tt.get("tien_ich") or []) if _chu(a)]:
        if a not in p.amenities:
            p.amenities.append(a)
    for m in row.get("unit_types") or [] if isinstance(row.get("unit_types"), list) else []:
        if not isinstance(m, dict) or not _chu(m.get("name")):
            continue
        specs = {_NHAN_MAU.get(k, k): _chu(v) for k, v in (m.get("specs") or {}).items() if _chu(v)}
        hoc = p.find_unit_type(m["name"])
        if hoc is None:
            p.unit_types.append(UnitType(_chu(m["name"]), specs, goc=True))
        else:
            hoc.specs = {**specs, **hoc.specs}
            hoc.goc = True
    return p


class SupabaseProjectStore(ProjectStore):
    """Kho dự án MỘT NGUỒN (SRS-5.1zzzzzzz249): bảng `projects` là kho chung (2.362 dự án nguồn mogi + `thong_tin` đã duyệt, web và hai phía
    bot cùng đọc); `du_an_kien_thuc` chỉ giữ phần học thêm (phiếu chờ, mẫu nhà, rổ căn, tài liệu), nối `project_id`. Dự án chỉ nghe qua chat,
    chưa có dòng `projects`, nằm riêng trong `du_an_kien_thuc` (project_id rỗng) — không đẻ dòng web từ lời một người.
    Trước bản này `du_an_kien_thuc` chép lại chủ đầu tư / quận / phường của từng dự án (hai bản cùng một dữ kiện) mà thiếu tiện ích, pháp lý.
    `rpc(method, endpoint, body)` để test thay lời gọi mạng."""

    def __init__(self, supabase_url: str, service_key: str, rpc=None):
        self._goc = supabase_url.rstrip("/") + "/rest/v1/"
        self._key = service_key
        self._rpc = rpc or self._goi_that
        self._muc_luc_nho: tuple[float, dict[str, tuple[str, str]]] | None = None

    def _goi_that(self, method: str, endpoint: str, body=None):
        import urllib.request
        req = urllib.request.Request(
            self._goc + endpoint, method=method,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None,
            headers={"apikey": self._key, "Authorization": f"Bearer {self._key}", "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
        return json.loads(raw.decode("utf-8")) if raw else None

    # PostgREST của project trả TỐI ĐA 1.000 dòng mỗi lần đọc (đo 21/10/2026, SRS-5.1zzzzzzz96) — đọc theo trang.
    _TRANG = 1000

    def _doc_het(self, endpoint: str, thu_tu: str) -> list[dict]:
        ra: list[dict] = []
        tu = 0
        while True:
            trang = self._rpc("GET", f"{endpoint}&order={thu_tu}&limit={self._TRANG}&offset={tu}") or []
            ra += trang
            if len(trang) < self._TRANG:
                return ra
            tu += self._TRANG

    def _muc_luc(self) -> dict[str, tuple[str, str]]:
        """{khoá tên → (projects.id hoặc "", tên)}: mọi dòng `projects` + dự án chỉ biết qua chat. Nhớ 5 phút."""
        import time
        if self._muc_luc_nho and time.time() - self._muc_luc_nho[0] < 300:
            return self._muc_luc_nho[1]
        ml: dict[str, tuple[str, str]] = {}
        for r in self._doc_het("du_an_kien_thuc?select=khoa,ten&project_id=is.null", "khoa"):
            ml[r["khoa"]] = ("", r.get("ten") or r["khoa"])
        for r in self._doc_het("projects?select=id,name", "id"):
            if r.get("name"):
                ml[normalize_project_name(r["name"])] = (str(r["id"]), r["name"])
        self._muc_luc_nho = (time.time(), ml)
        return ml

    def _mot(self, khoa: str, pid: str) -> Project | None:
        if pid:
            dong = self._rpc("GET", f"projects?id=eq.{_q(pid)}&select={_COT_DU_AN}") or []
            if not dong:
                return None
            kt = self._rpc("GET", f"du_an_kien_thuc?project_id=eq.{_q(pid)}&select=du_lieu") or []
            return project_from_row(dong[0], kt[0]["du_lieu"] if kt else None)
        rows = self._rpc("GET", f"du_an_kien_thuc?select=du_lieu&khoa=eq.{_q(khoa)}") or []
        return project_from_dict(rows[0]["du_lieu"]) if rows else None

    def get(self, name: str | None) -> Project | None:
        if not name:
            return None
        ml = self._muc_luc()
        key = find_matching_key(normalize_project_name(name), ml)
        return self._mot(key, ml[key][0]) if key else None

    def save(self, project: Project) -> None:
        from datetime import datetime, timezone
        bay_gio = datetime.now(timezone.utc).isoformat()
        hoc = project_to_dict(project, chi_phan_hoc=bool(project.id))
        if project.id:
            # Dữ kiện ĐÃ CHỐT (phiếu đủ / admin) lên kho chung `projects.thong_tin` — web và phía mua đọc ngay; phần chờ ở lại kho kiến thức.
            self._rpc("PATCH", f"projects?id=eq.{_q(project.id)}", {"thong_tin": {
                "thuoc_tinh": hoc.pop("attributes"), "tien_ich": hoc.pop("amenities")}})
        self._rpc("POST", "du_an_kien_thuc?on_conflict=khoa", {
            "khoa": normalize_project_name(project.name), "ten": project.name, "project_id": project.id or None,
            "du_lieu": hoc, "cap_nhat": bay_gio})
        if not project.id:
            self._muc_luc_nho = None

    def all(self) -> list[Project]:
        """Mọi dự án NHƯNG chỉ tên + mẫu nhà (soi tên mơ hồ `project_name_concern`) — không kéo tài liệu / rổ căn."""
        ra: dict[str, Project] = {}
        for r in self._doc_het("projects?select=name,unit_types", "id"):
            if r.get("name"):
                ra[normalize_project_name(r["name"])] = project_from_row({"name": r["name"], "unit_types": r.get("unit_types")})
        for r in self._doc_het("du_an_kien_thuc?select=ten,unit_types:du_lieu->unit_types", "khoa"):
            k = normalize_project_name(r.get("ten") or "")
            if not k:
                continue
            p = ra.setdefault(k, Project(r.get("ten") or ""))
            for u in r.get("unit_types") or []:
                if isinstance(u, dict) and u.get("name") and p.find_unit_type(u["name"]) is None:
                    p.unit_types.append(UnitType(u["name"], u.get("specs", {})))
        return list(ra.values())


def _q(s: str) -> str:
    import urllib.parse
    return urllib.parse.quote(s, safe="")
