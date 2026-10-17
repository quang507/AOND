from aioi.schema import Property
from aioi.engine import Engine, FetchedMedia
from aioi.config import Settings
from aioi.llm.mock import MockProvider
from fastapi.testclient import TestClient
from aioi.server import app

client = TestClient(app)


def test_property_auto_inference():
    # 1. 2PN / chung cư inference
    p1 = Property()
    p1.update({"so_phong_ngu": "2", "du_an": "Vinhomes Grand Park"})
    assert p1.loai_hinh == "chung_cu"

    # 2. Kho xưởng inference
    p2 = Property()
    p2.update({"dia_chi": "Kho xưởng 500m2 KCN Tân Bình"})
    assert p2.loai_hinh == "kho_xuong"

    # 3. Kích thước 4x15 calculation -> diện tích 60m2
    p3 = Property()
    p3.update({"kich_thuoc": "4x15m"})
    assert p3.fields.get("dien_tich") == "60m2"

    p4 = Property(loai_hinh="nha_pho")
    p4.update({"kich_thuoc": "4x15m"})
    assert p4.fields.get("dien_tich_dat") == "60m2"


def test_counter_question_consultation_fee():
    settings = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")
    eng = Engine(MockProvider(settings))
    
    # User asks about broker / listing fee
    r = eng.handle("u_fee", "Phí bên em thu thế nào vậy? Bán được mới trả tiền hay sao?")
    assert r.reply
    # Fee policy states 1% for homeowners, 0.5% for brokers, success-based only
    assert "1%" in r.reply or "phí" in r.reply.lower()


def test_counter_question_consultation_trust():
    settings = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")
    eng = Engine(MockProvider(settings))

    # User asks about company trust / scam concern
    r = eng.handle("u_trust", "Bên em là công ty gì, có lừa đảo không?")
    assert r.reply
    assert "công ty" in r.reply.lower() or "ai oi" in r.reply.lower() or "nhà đất" in r.reply.lower()


def test_counter_question_consultation_link():
    settings = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")
    eng = Engine(MockProvider(settings))

    # User asks if there is a listing link -> bot provides website link aioinhadat.com
    r = eng.handle("u_link", "Xong có link bài đăng không đưa anh xem nhé?")
    assert r.reply
    assert "aioinhadat.com" in r.reply.lower() or "website" in r.reply.lower()


def test_seller_asking_about_buyers_not_flipping_role():
    settings = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")
    eng = Engine(MockProvider(settings))

    # User starts as a seller with a house
    eng.handle("u_seller_q", "Anh cần bán nhà 50m2 ở Cao Thắng Quận 10")
    conv = eng.conversation("u_seller_q")
    assert conv.role == "seller"

    # User asks: "Giá này có khách mua không em?"
    # Should NOT flip to buyer role!
    r = eng.handle("u_seller_q", "Giá này có khách mua không em?")
    assert conv.role == "seller"
    assert r.role == "seller"


def test_deed_vision_handling_via_engine():
    def deed_fetcher(url):
        return FetchedMedia(b"\xff\xd8\xff", "image/jpeg", url, filename="so_hong_quan_7.jpg")

    settings = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")
    eng = Engine(MockProvider(settings), fetcher=deed_fetcher)

    # User sends deed photo
    r = eng.handle_media("u_deed", "https://example.com/so_hong_quan_7.jpg")
    assert r.reply
    # Should acknowledge receipt of deed file and extracted data
    assert "so_hong_quan_7.jpg" in r.reply
    assert "123 Nguyễn Thị Thập" in r.reply
    assert "75m2" in r.reply
    assert "xác nhận" in r.reply.lower()
    # Active property fields should be populated from deed
    active_prop = eng.conversation("u_deed").active.prop
    assert active_prop.fields.get("dia_chi") == "123 Nguyễn Thị Thập, P. Tân Phú, Quận 7"
    assert active_prop.fields.get("so_thua") == "125"
    assert active_prop.fields.get("so_to") == "45"


def test_zalo_bridge_deed_image_chat_reply(monkeypatch):
    def deed_fetcher(url):
        return FetchedMedia(b"\xff\xd8\xff", "image/jpeg", url, filename="so_do_chinh_chu.png")

    from aioi import server
    server._engine._fetcher = deed_fetcher
    orig_provider = server._engine._provider
    server._engine._provider = MockProvider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))

    try:
        payload = {
            "external_user_id": "zalo_seller_deed",
            "text": "Em xem sổ này giúp anh nhé",
            "image_url": "https://example.com/so_do_chinh_chu.png",
            "channel": "zalo_personal",
        }
        resp = client.post("/chat-reply", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "so_do_chinh_chu.png" in data["reply"]
        assert "123 Nguyễn Thị Thập" in data["reply"]
        assert len(data["replies"]) >= 1
        assert len(data["nhip_go"]) == len(data["replies"])
    finally:
        server._engine._provider = orig_provider


def test_condo_and_project_core_fields_no_deed():
    from aioi.schema import CORE_FIELDS, PropertyGroup
    condo_fields = CORE_FIELDS[PropertyGroup.CONDO]
    assert "phap_ly_so_hong" not in condo_fields
    assert "lo_gioi_hem" not in condo_fields

    project_fields = CORE_FIELDS[PropertyGroup.PROJECT]
    assert "phap_ly_du_an" not in project_fields


def test_build_media_read_instruction_injects_known_fields_and_forbids_reask():
    from aioi.prompts import build_media_read_instruction
    p = Property(loai_hinh="nha_pho")
    p.fields.update({
        "dia_chi": "Cao Thắng, Quận 10",
        "kich_thuoc": "4x15.5m",
        "ket_cau": "1 trệt 4 lầu",
    })
    inst = build_media_read_instruction("T•ai", prop=p, next_field="lo_gioi_hem")
    assert "Cao Thắng, Quận 10" in inst
    assert "4x15.5m" in inst
    assert "1 trệt 4 lầu" in inst
    assert "TUYỆT ĐỐI KHÔNG ĐƯỢC HỎI LẠI" in inst
    assert "vị trí mặt tiền hay hẻm" in inst


def test_friendly_media_receipt_hash_cleaning():
    # Long CDN hash string -> friendly text
    r = Engine._friendly_media_receipt("2aOboR5fFnl9STXbuUhDNvitS8AjwWcOUN1PvA1o.jpg", 1)
    assert "2aOboR5fFnl9STXbuUhDNvitS8AjwWcOUN1PvA1o" not in r
    assert "Em đã nhận 1 ảnh của nhà mình rồi nhé! 📸✨" in r

    # Meaningful name -> preserved
    r2 = Engine._friendly_media_receipt("so_hong_quan_7.jpg", 1)
    assert "so_hong_quan_7.jpg" in r2


def test_lo_gioi_hem_does_not_assume_alley():
    from aioi.prompts import FIELD_LABELS, NATURAL_QUESTIONS
    assert "mặt tiền" in FIELD_LABELS["lo_gioi_hem"]
    assert "mặt tiền" in NATURAL_QUESTIONS["lo_gioi_hem"]
