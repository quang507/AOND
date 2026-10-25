"""SRS-5.1zzzzzzz180 mục 2 (25/10/2026): dọn hàm / trigger DB không ai gọi. Đỏ khi migration thiếu một trong các hàm đã quyết dọn, hoặc khi
code lõi / web lại gọi tới hàm đã dọn (muốn dùng lại thì viết migration mới, đừng gọi hàm không còn)."""
import pathlib
import re

GOC = pathlib.Path(__file__).parents[1]
DA_DON = ("listings_bao_tin_moi_khop", "bao_tin_moi_khop", "tim_phuong_theo_nghia", "tim_du_an_theo_nghia", "tim_tin_theo_nghia",
          "tin_gan_moc", "moc_khop", "ensure_buyer_conversation", "ensure_seller_conversation")
GIU = ("can_cung_khu", "khu_khop", "du_an_co_phap_ly", "nhan_fact_cu", "seller_rank", "hang_theo_diem", "thu_muc_dau_uuid", "url_kho_anh",
       "tim_dia_danh_theo_nghia", "bao_can_da_chot")


def test_migration_don_dung_danh_sach():
    sql = sorted((GOC / "bot/supabase/migrations").glob("*_don_ham_mo_coi*.sql"))[-1].read_text(encoding="utf-8")
    for h in DA_DON:
        assert re.search(rf"drop function if exists public\.{h}\(", sql), h
    assert "drop trigger if exists trg_listings_bao_tin_moi_khop" in sql
    for h in GIU:
        assert f"public.{h}(" not in sql, f"{h} có người gọi, không được dọn"


def test_code_khong_goi_ham_da_don():
    chu = ""
    for d in ("src/aioi", "app", "lib", "components", "bot/supabase/functions", "bot/bridge-zca", "scripts"):
        for f in (GOC / d).rglob("*"):
            if f.is_file() and f.suffix in (".py", ".ts", ".tsx", ".mjs", ".js") and "node_modules" not in str(f):
                chu += f.read_text(encoding="utf-8", errors="ignore")
    for h in DA_DON:
        assert not re.search(rf"rpc/{h}\b|rpc\(\s*[\"']{h}[\"']", chu), f"code còn gọi {h}"
