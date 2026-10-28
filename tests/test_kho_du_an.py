"""Kho dự án MỘT NGUỒN (SRS-5.1zzzzzzz249): `projects` là kho chung (nguồn mogi + `thong_tin` đã duyệt), `du_an_kien_thuc` chỉ giữ phần học
thêm nối `project_id`. Trước bản này `du_an_kien_thuc` chép lại chủ đầu tư / quận / phường của 2.350 dự án mà thiếu tiện ích, pháp lý, mẫu căn
— phía bán không bao giờ thấy tiện ích dù kho có (1.351 dự án)."""
import re
from urllib.parse import unquote

from aioi.projects import CHAC_CHAN, Project, SupabaseProjectStore, UnitType, merge_facts


class _Db:
    TRAN = 1000   # như PostgREST production: tối đa 1.000 dòng mỗi lần đọc

    def __init__(self):
        self.du_an: dict[str, dict] = {}       # projects: id → dòng
        self.kt: dict[str, dict] = {}          # du_an_kien_thuc: khoa → dòng
        self.goi: list[tuple[str, str]] = []

    def __call__(self, method, endpoint, body=None):
        self.goi.append((method, endpoint))
        tu = int((re.search(r"offset=(\d+)", endpoint) or [0, 0])[1])
        lim = min(int((re.search(r"limit=(\d+)", endpoint) or [0, self.TRAN])[1]), self.TRAN)
        if method == "POST":
            self.kt[body["khoa"]] = body
            return None
        if method == "PATCH":
            pid = unquote(endpoint.split("id=eq.", 1)[1])
            self.du_an[pid].update(body)
            return None
        if endpoint.startswith("projects?id=eq."):
            pid = unquote(endpoint.split("id=eq.", 1)[1].split("&", 1)[0])
            return [self.du_an[pid]] if pid in self.du_an else []
        if endpoint.startswith("projects?select="):
            ds = sorted(self.du_an.values(), key=lambda r: r["id"])[tu:tu + lim]
            return [{"id": r["id"], "name": r["name"], "unit_types": r.get("unit_types")} for r in ds]
        if "project_id=eq." in endpoint:
            pid = unquote(endpoint.split("project_id=eq.", 1)[1].split("&", 1)[0])
            return [{"du_lieu": r["du_lieu"]} for r in self.kt.values() if r.get("project_id") == pid]
        if "khoa=eq." in endpoint:
            k = unquote(endpoint.split("khoa=eq.", 1)[1])
            return [{"du_lieu": self.kt[k]["du_lieu"]}] if k in self.kt else []
        ds = sorted(self.kt)[tu:tu + lim]
        if "project_id=is.null" in endpoint:
            return [{"khoa": k, "ten": self.kt[k]["ten"]} for k in ds if not self.kt[k].get("project_id")][:lim]
        return [{"ten": self.kt[k]["ten"], "unit_types": self.kt[k]["du_lieu"].get("unit_types")} for k in ds]


def _mogi(db: _Db, pid="p-1", ten="Vinhomes Grand Park", **them) -> None:
    db.du_an[pid] = {"id": pid, "name": ten, "developer": "Vinhomes", "district": "Thủ Đức", "province": "TP.HCM",
                     "legal_status": "Sổ hồng lâu dài", "amenities": ["hồ bơi", "gym"],
                     "unit_types": [{"name": "2 phòng ngủ", "specs": {"dien_tich": "60 - 72 m2", "so_phong_ngu": "2"}}],
                     "thong_tin": {}, **them}


def test_phia_ban_doc_du_tien_ich_phap_ly_mau_can_tu_kho_chung():
    """Mục 6 (chủ dự án 28/10: "docs ghi có mà không lôi ra được"): tắt `project_from_row` (đọc lại `du_an_kien_thuc` cũ) là đỏ."""
    db = _Db()
    _mogi(db)
    p = SupabaseProjectStore("https://x.invalid", "k", rpc=db).get("vinhomes grand park")
    assert p is not None and p.id == "p-1"
    assert p.amenities == ["hồ bơi", "gym"]
    assert "pháp lý: Sổ hồng lâu dài" in p.facts() and "chủ đầu tư: Vinhomes" in p.facts()
    ut = p.find_unit_type("2 phòng ngủ")
    assert ut is not None and ut.specs["diện tích"] == "60 - 72 m2"


def test_luu_chi_ghi_phan_hoc_them_khong_chep_lai_du_lieu_mogi():
    db = _Db()
    _mogi(db)
    kho = SupabaseProjectStore("https://x.invalid", "k", rpc=db)
    p = kho.get("Vinhomes Grand Park")
    merge_facts(p.attributes, p.votes, {"an ninh": "bảo vệ 24/7"}, voter="dong:z1")        # một phiếu Đồng: chờ
    merge_facts(p.attributes, p.votes, {"cổng": "Nguyễn Xiển"}, voter=CHAC_CHAN + "admin:a")  # admin: vào kho chung
    p.docs.append({"kind": "phân lô", "title": "PL", "markdown": "# x"})
    kho.save(p)
    hoc = db.kt["vinhomes grand park"]
    assert hoc["project_id"] == "p-1"
    assert "attributes" not in hoc["du_lieu"]                                         # chủ đầu tư… không có bản thứ hai
    assert "amenities" not in hoc["du_lieu"] and hoc["du_lieu"]["unit_types"] == []                  # tiện ích, mẫu mogi ở `projects`
    assert db.du_an["p-1"]["thong_tin"] == {"thuoc_tinh": {"cổng": "Nguyễn Xiển"}, "tien_ich": []}    # chỉ dữ kiện đã chốt
    q = kho.get("vinhomes grand park")
    assert q.attributes["cổng"] == "Nguyễn Xiển" and "an ninh" not in q.attributes
    assert any("an ninh" in x for x in q.pending()) and q.docs[0]["title"] == "PL"
    assert q.find_unit_type("2 phòng ngủ") is not None and q.amenities == ["hồ bơi", "gym"]


def test_du_an_chi_nghe_qua_chat_khong_de_dong_projects():
    db = _Db()
    kho = SupabaseProjectStore("https://x.invalid", "k", rpc=db)
    p = Project("Khu Nhà Mới Lạ", unit_types=[UnitType("Cosmo", {"so_tang": "4"})])
    kho.save(p)
    assert db.du_an == {} and db.kt["khu nhà mới lạ"]["project_id"] is None
    q = kho.get("khu nhà mới lạ")
    assert q is not None and q.unit_types[0].specs == {"so_tang": "4"}


def test_du_an_sau_dong_1000_van_tra_duoc():
    """SRS-5.1zzzzzzz96: PostgREST trả tối đa 1.000 dòng — dự án ở dòng 1.645 thì bản đọc một lần không bao giờ tra được."""
    db = _Db()
    for i in range(1500):
        _mogi(db, pid=f"p-{i:04d}", ten=f"Dự án {i:04d}")
    _mogi(db, pid="p-9999", ten="Ny'ah Phú Định")
    kho = SupabaseProjectStore("https://x.invalid", "k", rpc=db)
    assert kho.get("Nyah Phú Định").name == "Ny'ah Phú Định"       # không dấu nháy: tra gần đúng qua đủ 1.501 khoá
    assert len(kho.all()) == 1501
    db.goi.clear()
    kho.get("Nyah Phú Định")
    assert not any(e.startswith("projects?select=id,name") for _, e in db.goi)   # mục lục nhớ, không tải lại mỗi lượt
