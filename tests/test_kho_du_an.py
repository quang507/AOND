"""SRS-5.1zzzzzzz56: kiến thức dự án lõi Python lên Supabase (du_an_kien_thuc), lần đầu chép từ SQLite cũ — không mất gì."""
from aioi.projects import InMemoryProjectStore, Project, SupabaseProjectStore, UnitType


class _Db:
    def __init__(self):
        self.rows = {}

    def __call__(self, method, endpoint, body=None):
        if method == "POST":
            self.rows[body["khoa"]] = body
            return None
        if "select=khoa" in endpoint:
            return [{"khoa": k} for k in self.rows]
        if "khoa=eq." in endpoint:
            from urllib.parse import unquote
            k = unquote(endpoint.split("khoa=eq.", 1)[1])
            return [{"du_lieu": self.rows[k]["du_lieu"]}] if k in self.rows else []
        return [{"du_lieu": r["du_lieu"]} for r in self.rows.values()]


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
