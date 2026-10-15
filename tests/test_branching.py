from aioi.schema import Property, PropertyGroup, BuyerLead
from aioi.config import Settings
from aioi.engine import Engine, Conversation, SqliteConversationStore
from aioi.llm.mock import MockProvider
from aioi.sharepoint import LocalDirectoryMediaStore


def test_property_group_branching_fields():
    # 1. Residential (Nhà phố)
    house = Property(loai_hinh="nha_pho")
    assert house.group == PropertyGroup.RESIDENTIAL
    assert "lo_gioi_hem" in house.expected_fields()
    assert "ket_cau" in house.expected_fields()

    # 2. Condo (Chung cư / Căn hộ)
    condo = Property(loai_hinh="chung_cu")
    assert condo.group == PropertyGroup.CONDO
    assert "lo_gioi_hem" not in condo.expected_fields()
    assert "so_phong_ngu" in condo.expected_fields()
    assert "tang_toa" in condo.expected_fields()
    assert "ban_cong_view" in condo.expected_fields()

    # 3. Project (Dự án)
    proj = Property(loai_hinh="du_an")
    assert proj.group == PropertyGroup.PROJECT
    assert "chu_dau_tu_phan_khu" in proj.expected_fields()
    assert "tien_do_xay_dung" in proj.expected_fields()
    assert "chinh_sach_thanh_toan" in proj.expected_fields()

    # 4. Commercial (Mặt bằng kinh doanh)
    mb = Property(loai_hinh="mat_bang", is_rental=True)
    assert mb.group == PropertyGroup.COMMERCIAL
    assert "mat_tien" in mb.expected_fields()
    assert "loi_di" in mb.expected_fields()
    assert "vi_he_xe" in mb.expected_fields()
    assert "nganh_nghe" in mb.expected_fields()
    # Being rental, it also requires rental terms
    assert "muc_coc" in mb.expected_fields()
    assert "thoi_gian_fitout" in mb.expected_fields()

    # 5. Industrial (Kho xưởng)
    kx = Property(loai_hinh="kho_xuong")
    assert kx.group == PropertyGroup.INDUSTRIAL
    assert "chieu_cao_tran" in kx.expected_fields()
    assert "tai_trong_san" in kx.expected_fields()
    assert "tram_bien_ap" in kx.expected_fields()
    assert "tieu_chuan_container" in kx.expected_fields()


def test_dynamic_pivoting_mid_conversation():
    # Scenario: User starts saying they sell a house, then pivots to renting a commercial floor
    prop = Property(loai_hinh="nha_pho")
    prop.update({"dia_chi": "45 Lê Duẩn, Quận 1", "dien_tich_dat": "100m2"})
    assert prop.group == PropertyGroup.RESIDENTIAL
    assert "lo_gioi_hem" in prop.missing_fields()

    # Customer changes mind: "Thực ra anh chỉ cho thuê mặt bằng tầng trệt giá 50tr"
    prop.update({"loai_hinh": "mat_bang", "gia": "50 triệu/tháng"})
    prop.is_rental = True

    assert prop.group == PropertyGroup.COMMERCIAL
    # House-specific questions should NO LONGER be asked
    assert "lo_gioi_hem" not in prop.missing_fields()
    # Commercial & rental fields now targeted
    assert "mat_tien" in prop.missing_fields()
    assert "loi_di" in prop.missing_fields()
    assert "muc_coc" in prop.missing_fields()


def test_buyer_lead_questioning_sequence():
    lead = BuyerLead(user_key="buyer_1")
    # First field needed: khu_vuc
    assert lead.next_question_field() == "khu_vuc"
    lead.khu_vuc = "Quận 7"

    # Next: ngan_sach
    assert lead.next_question_field() == "ngan_sach"
    lead.ngan_sach = "3-4 tỷ"

    # Next: loai_bds
    assert lead.next_question_field() == "loai_bds"
    lead.loai_bds = "chung_cu"

    # Next: so_phong_ngu
    assert lead.next_question_field() == "so_phong_ngu"
    lead.so_phong_ngu = "2PN"

    # For Condo: next is nhan_nha_khi_nao
    assert lead.next_question_field() == "nhan_nha_khi_nao"
    lead.fields["nhan_nha_khi_nao"] = "ở ngay"

    # Then purpose and buying timeline (closing)
    assert lead.next_question_field() == "muc_dich"
    lead.muc_dich = "để ở"
    assert lead.next_question_field() == "tien_do_mua"
    lead.tien_do_mua = "mua trong tháng"
    assert lead.next_question_field() is None

    # Test House branching
    house_lead = BuyerLead(user_key="buyer_house", khu_vuc="Q1", ngan_sach="10 tỷ", loai_bds="nha_pho")
    assert house_lead.next_question_field() == "yeu_cau_xe_hoi"

    # Test Project branching
    proj_lead = BuyerLead(user_key="buyer_proj", khu_vuc="Đồng Nai", ngan_sach="3 tỷ", loai_bds="du_an")
    assert proj_lead.next_question_field() == "muc_dich"


def test_sqlite_and_sharepoint_buyer_sync(tmp_path):
    import json
    db_file = str(tmp_path / "test_aioi.db")
    store_dir = tmp_path / "sharepoint"
    conv_store = SqliteConversationStore(path=db_file)
    media_store = LocalDirectoryMediaStore(base_dir=store_dir)
    settings = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")
    provider = MockProvider(settings)

    engine = Engine(
        provider=provider,
        conversation_store=conv_store,
        media_store=media_store,
        sync_json=True,
    )

    # Simulate buyer interaction
    lead = BuyerLead(
        user_key="u_buyer_99",
        loai_giao_dich="mua",
        khu_vuc="Bình Thạnh",
        ngan_sach="5 tỷ",
        loai_bds="nha_pho",
    )
    conv = engine.conversation("u_buyer_99")
    conv.role = "buyer"
    conv.buyer_lead = lead

    res = engine.handle("u_buyer_99", "Tôi muốn tìm mua căn nhà phố ở Bình Thạnh giá tầm 5 tỷ")
    assert res.role == "buyer"
    assert res.lead is not None
    assert res.lead.khu_vuc == "Bình Thạnh"

    # Verify saved in SQLite
    reloaded_conv = conv_store.load("u_buyer_99")
    assert reloaded_conv is not None
    assert reloaded_conv.role == "buyer"
    assert reloaded_conv.buyer_lead is not None
    assert reloaded_conv.buyer_lead.khu_vuc == "Bình Thạnh"
    assert reloaded_conv.buyer_lead.ngan_sach == "5 tỷ"

    # Verify synced to SharePoint mock store
    lead_folder = f"Khách mua/{lead.lead_id}"
    json_path = store_dir / lead_folder / "nhu_cau.json"
    assert json_path.exists()
    data = json.loads(json_path.read_text(encoding="utf-8"))
    assert data["user_key"] == "u_buyer_99"
    assert data["khu_vuc"] == "Bình Thạnh"
    assert data["ngan_sach"] == "5 tỷ"
