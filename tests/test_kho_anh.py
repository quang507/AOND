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


def test_ban_ve_mau_nha_vao_bucket_cong_khai_de_bot_gui_duoc():
    """SRS-5.1zzzzzzz249 (chủ dự án 28/10: "vì sao không gửi dc bản vẽ"): tệp mẫu nhà (`du-an/…`) có link công khai, ảnh lẫn PDF; tắt
    nhánh `THU_MUC_DU_AN` trong `upload` thì đỏ. Sổ đỏ (`rieng=True`) vẫn riêng dù nằm thư mục nào."""
    kho, _ = _kho()
    anh = kho.upload("du-an/Ny'ah Phú Định/Cosmo", "mặt bằng.jpg", b"x", "image/jpeg")
    pdf = kho.upload("du-an/Ny'ah Phú Định/Cosmo", "brochure.pdf", b"x", "application/pdf")
    assert anh.path.startswith("listing-public/du-an/") and anh.web_url.startswith("https://x.invalid/storage/v1/object/public/")
    assert pdf.path.startswith("listing-public/du-an/") and pdf.web_url and pdf.ban_nho == ""
    assert kho.upload("du-an/X/Y", "so.jpg", b"x", "image/jpeg", rieng=True).web_url == ""


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


def _jpeg(w, h):
    import io
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGB", (w, h), (200, 100, 50)).save(b, "JPEG")
    return b.getvalue()


def test_anh_cong_khai_co_ban_nho_480():
    """OPEN-38 (SRS-5.1zzzzzzz241): ảnh căn công khai tải thêm bản nhỏ cạnh dài 480px cạnh ảnh gốc; dòng listing_media ghi variants."""
    import io
    from PIL import Image
    kho, goi = _kho()
    lid = str(uuid.UUID(U))
    ref = kho.upload(kho.thu_muc_can(U), "mat tien.jpg", _jpeg(2000, 1000), "image/jpeg")
    assert ref.ban_nho == f"listing-public/{lid}/480/mat-tien.jpg"
    [nho] = [g for g in goi if "/480/" in g[1]]
    with Image.open(io.BytesIO(nho[2])) as im:
        assert max(im.size) == 480
    assert kho.upload(kho.thu_muc_can(U), "hong.jpg", b"x", "image/jpeg").ban_nho == ""          # ảnh hỏng: không có bản nhỏ
    assert kho.upload(kho.thu_muc_can(U), "so.jpg", _jpeg(900, 900), "image/jpeg", rieng=True).ban_nho == ""   # giấy tờ riêng: không
    st = StoreGia(co_san=False)
    li = SimpleNamespace(prop=Property(loai_hinh="nha_pho", fields={"gia": "5 tỷ"}), listing_id=U, listing_proposed=True,
                         media=[ref.to_dict()])
    st.save(SimpleNamespace(user_key="zalo-thu-480", listings=[li]))
    [dong] = [d for m, e, d in st.goi if m == "POST" and e.startswith("listing_media")]
    assert dong[0]["variants"] == {"480": f"{lid}/480/mat-tien.jpg"}


def test_anh_khong_phai_anh_can_thi_khong_luu():
    """OPEN-53 (SRS-5.1zzzzzzz241): ảnh AI chấm KHÔNG phải ảnh thật của căn (ảnh mạng / phối cảnh) → không lưu vào tin (không tính điểm,
    không lên web), lời bot nói rõ; ảnh thật vẫn lưu như cũ. Cờ đi chung lượt đọc ảnh nhận sổ — không thêm lần gọi model."""
    def eng_voi(khong_phai):
        class P(MockProvider):
            def extract_media(self, items, instruction, json_schema):
                if "la_giay_to_bds" in json_schema.get("properties", {}):
                    return {"la_giay_to_bds": False, "khong_phai_anh_can": khong_phai}
                return {"la_bang_gia": False}
        kho, goi = _kho()
        e = Engine(P(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")),
                   fetcher=lambda u: FetchedMedia(_jpeg(800, 600), "image/jpeg", u, filename="nha.jpg"), media_store=kho)
        return e, goi
    e, goi = eng_voi(True)
    r = e.handle_media("k-mang", "https://example.com/anh-mang.jpg")
    assert e.conversation("k-mang").active.media == [] and goi == [] and "chưa đưa vào tin" in r.reply
    e2, goi2 = eng_voi(False)
    e2.handle_media("k-that", "https://example.com/nha.jpg")
    assert e2.conversation("k-that").active.media and goi2


def test_gom_nhom_co_co_khong_phai_anh_can():
    from aioi.prompts import deed_extraction_schema, media_group_schema
    assert "khong_phai_anh_can" in deed_extraction_schema()["properties"]
    assert "khong_phai_anh_can" in media_group_schema()["properties"]["nhom"]["items"]["properties"]
