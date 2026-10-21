"""SRS-5.1zzzzzzz56: kiến thức dự án lõi Python lên Supabase (du_an_kien_thuc), lần đầu chép từ SQLite cũ — không mất gì."""
from aioi.projects import InMemoryProjectStore, Project, SupabaseProjectStore, UnitType


class _Db:
    TRAN = 1000   # như PostgREST production: tối đa 1.000 dòng mỗi lần đọc

    def __init__(self):
        self.rows = {}
        self.goi: list[str] = []

    def __call__(self, method, endpoint, body=None):
        self.goi.append(endpoint)
        if method == "POST":
            self.rows[body["khoa"]] = body
            return None
        if "khoa=eq." in endpoint:
            from urllib.parse import unquote
            k = unquote(endpoint.split("khoa=eq.", 1)[1])
            return [{"du_lieu": self.rows[k]["du_lieu"]}] if k in self.rows else []
        import re
        tu = int((re.search(r"offset=(\d+)", endpoint) or [0, 0])[1])
        lim = min(int((re.search(r"limit=(\d+)", endpoint) or [0, self.TRAN])[1]), self.TRAN)
        khoa = sorted(self.rows)[tu:tu + lim]
        if "select=khoa" in endpoint:
            return [{"khoa": k} for k in khoa]
        return [{"ten": self.rows[k]["ten"], "unit_types": self.rows[k]["du_lieu"].get("unit_types")} for k in khoa]


def test_luu_doc_lai_va_tim_gan_dung():
    db = _Db()
    kho = SupabaseProjectStore("https://x.invalid", "k", rpc=db)
    p = Project("Vinhomes Grand Park", amenities=["hồ bơi"], unit_types=[UnitType("Cosmo", {"so_tang": "4"})])
    p.docs.append({"kind": "phân lô", "title": "PL", "markdown": "# x"})
    kho.save(p)
    q = kho.get("vinhomes grand park")
    assert q is not None and q.amenities == ["hồ bơi"] and q.unit_types[0].specs == {"so_tang": "4"} and q.docs[0]["title"] == "PL"


def test_chep_mot_lan_tu_kho_cu():
    cu = InMemoryProjectStore()
    cu.save(Project("Dự Án A"))
    cu.save(Project("Dự Án B"))
    db = _Db()
    kho = SupabaseProjectStore("https://x.invalid", "k", rpc=db)
    assert kho.chep_tu(cu) == 2 and kho.get("Dự Án B") is not None
    assert kho.chep_tu(cu) == 0          # đã có dữ liệu thì không chép lại / không đè


def test_chep_bi_cat_giua_chung_thi_lan_sau_chep_tiep():
    # 19/10: lượt chép đầu bị cắt giữa chừng (khởi động lại khi đang chép) — bản cũ thấy kho đã có dòng là thôi, mất phần còn lại.
    cu = InMemoryProjectStore()
    for t in ("Dự Án A", "Dự Án B", "Dự Án C"):
        cu.save(Project(t))
    db = _Db()
    kho = SupabaseProjectStore("https://x.invalid", "k", rpc=db)
    kho.save(Project("Dự Án A", amenities=["bản trên Supabase"]))   # đã chép được một dự án thì bị cắt
    assert kho.chep_tu(cu) == 2
    assert kho.get("Dự Án A").amenities == ["bản trên Supabase"]     # không đè bản đã có


def test_du_an_sau_dong_1000_van_tra_duoc():
    """SRS-5.1zzzzzzz96: PostgREST trả tối đa 1.000 dòng — Ny'ah Phú Định ở dòng 1.645 thì bản cũ không bao giờ tra được."""
    db = _Db()
    for i in range(1500):
        db.rows[f"du an {i:04d}"] = {"khoa": f"du an {i:04d}", "ten": f"Dự án {i:04d}", "du_lieu": {"name": f"Dự án {i:04d}"}}
    db.rows["ny ah phú định"] = {"khoa": "ny ah phú định", "ten": "Ny'ah Phú Định", "du_lieu": {"name": "Ny'ah Phú Định"}}
    kho = SupabaseProjectStore("https://x.invalid", "k", rpc=db)
    assert kho.get("Nyah Phú Định").name == "Ny'ah Phú Định"       # không dấu nháy: tra gần đúng qua đủ 1.501 khoá
    assert kho.get("Ny'ah Phú Định").name == "Ny'ah Phú Định"      # đúng khoá: một lần gọi, không tải danh sách
    assert len(kho.all()) == 1501
    db.goi.clear()
    kho.get("Nyah Phú Định")
    assert not any("select=khoa" in g for g in db.goi)               # danh sách khoá nhớ 60 giây
