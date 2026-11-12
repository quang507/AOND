"""SRS-5.1zzzzzzz445 — một người báo vẫn dùng (kèm nhãn chưa chắc chắn); bản vẽ phân lô → rổ lô dự án."""
from aioi.projects import CHAC_CHAN, Project, merge_facts


def test_mot_nguoi_bao_van_hien_kem_nhan():
    p = Project("Ny'ah Phú Định")
    merge_facts(p.attributes, p.votes, {"an ninh": "camera từng nhà"}, voter="dong:z1")
    assert "an ninh" not in p.attributes                       # chưa vào kho chung
    assert any("camera từng nhà" in x and "chưa chắc chắn" in x for x in p.facts())


def test_admin_ghi_la_chac_chan_khong_nhan():
    p = Project("Ny'ah Phú Định")
    merge_facts(p.attributes, p.votes, {"an ninh": "camera từng nhà"}, voter=CHAC_CHAN + "admin:a")
    assert p.attributes["an ninh"] == "camera từng nhà" and "chưa chắc chắn" not in " ".join(p.facts())


def test_lo_mot_nguoi_bao_kem_nhan():
    p = Project("Ny'ah Phú Định")
    p.upsert_unit("25", {"mau_nha": "Cosmo"}, voter="dong:z1")
    assert "chưa chắc chắn" in p.find_unit("25").known()["mau_nha"]
    p.upsert_unit("26", {"mau_nha": "Fusion"}, voter=CHAC_CHAN + "admin:a")
    assert p.find_unit("26").known()["mau_nha"] == "Fusion"
