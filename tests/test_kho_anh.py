"""SRS-5.1zzzzzzz56: ảnh khách gửi lên Supabase Storage + listing_media để web hiện ảnh; giấy tờ / tài liệu cất RIÊNG.
Bản trước: VPS không cấu hình SharePoint → ảnh nằm trong thư mục trên đĩa VPS, listing_media 0 dòng, web không có ảnh nào."""
import uuid
from types import SimpleNamespace

from aioi.config import Settings
from aioi.engine import Engine, Listing
from aioi.fetch import FetchedMedia
from aioi.kho_anh import SupabaseMediaStore
from aioi.llm.mock import MockProvider
from aioi.schema import Property
from tests.test_supabase_store_luu_tin import StoreGia

U = uuid.uuid4().hex


def _kho():
    goi = []
    return SupabaseMediaStore("https://x.invalid", "khoa-gia", gui=lambda *a: goi.append(a)), goi


def test_anh_can_vao_bucket_cong_khai_theo_uuid():
    kho, goi = _kho()
    ref = kho.upload(kho.thu_muc_can(U), "mặt tiền.jpg", b"x", "image/jpeg")
    lid = str(uuid.UUID(U))
    assert ref.path == f"listing-public/{lid}/mat-tien.jpg" and ref.web_url.endswith(f"/public/listing-public/{lid}/mat-tien.jpg")
    assert goi[0][0] == "POST" and goi[0][3]["x-upsert"] == "true"


def test_giay_to_pdf_va_tep_du_an_vao_bucket_rieng():
    kho, _ = _kho()
    f = kho.thu_muc_can(U)
    assert kho.upload(f, "so.jpg", b"x", "image/jpeg", rieng=True).path.startswith("listing-private/")
    assert kho.upload(f, "hop-dong.pdf", b"x", "application/pdf").path.startswith("listing-private/")
    r = kho.upload("Vinhomes Grand Park/_Chung", "phân lô.jpg", b"x", "image/jpeg")
    assert r.path.startswith("listing-private/") and r.web_url == ""      # ảnh cấp dự án không có link công khai


def test_engine_dung_uuid_tin_lam_thu_muc():
    kho, goi = _kho()
    eng = Engine(MockProvider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")),
                 fetcher=lambda u: FetchedMedia(b"\xff\xd8\xff", "image/jpeg", u, filename="nha.jpg"), media_store=kho)
    eng.handle_media("k1", "https://example.com/nha.jpg")
    li = eng.conversation("k1").active
    assert li.media and li.media[0]["path"].startswith(f"listing-public/{uuid.UUID(li.listing_id)}/")


def test_save_tao_tin_dung_id_va_ghi_listing_media():
    st = StoreGia(co_san=False)
    lid = str(uuid.UUID(U))
    li = SimpleNamespace(prop=Property(loai_hinh="nha_pho", fields={"gia": "5 tỷ"}), listing_id=U, listing_proposed=True,
                         media=[{"path": f"listing-public/{lid}/a.jpg", "content_type": "image/jpeg"},
                                {"path": f"listing-private/{lid}/so.jpg", "content_type": "image/jpeg"},
                                {"path": "listing-private/khac/b.jpg"}])          # sai thư mục → bỏ
    st.save(SimpleNamespace(user_key="zalo-thu-2", listings=[li]))
    tao = [d for m, e, d in st.goi if m == "POST" and e == "listings"]
    assert tao and tao[0]["id"] == lid
    [dong] = [d for m, e, d in st.goi if m == "POST" and e.startswith("listing_media")]
    assert [(r["bucket"], r["media_type"]) for r in dong] == [("listing-public", "khac"), ("listing-private", "giay_to")]
    st.save(SimpleNamespace(user_key="zalo-thu-2", listings=[li]))       # lượt sau không gửi lại
    assert len([1 for m, e, d in st.goi if e.startswith("listing_media")]) == 1
