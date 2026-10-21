"""21/10/2026 (SRS-5.1zzzzzzz116). Chủ dự án gửi 7 câu môi giới hỏi khách mua (khu muốn sống, nhà gồm những ai, đi làm ở đâu, mấy phòng
/ diện tích, thang máy khi có ông bà, ai cùng quyết định, vay ngân hàng). Bot cũ hỏi khu vực, ngân sách, loại, mục đích rồi tới chốt.
Mỗi câu mới hỏi MỘT lần (khách lờ thì qua câu kế, không kẹt). Đỏ khi bỏ câu, hỏi lặp, hoặc nhu cầu mới không xuống `buyers`."""
from aioi.prompts import build_buyer_chat_system, property_field_props
from aioi.schema import O_TU_VAN_MUA, BuyerLead
from tests.test_viec_mua import KHACH_MUA, KhoGia, _engine


def _lead(**f) -> BuyerLead:
    b = BuyerLead(khu_vuc="Quận 5", ngan_sach="5 tỷ", loai_bds="nha_pho", yeu_cau_xe_hoi="hẻm xe hơi", so_phong_ngu="3PN",
                  muc_dich="để ở")
    b.fields.update(f)
    return b


def _hoi_het(b: BuyerLead) -> list[str]:
    ra = []
    for _ in range(12):
        o = b.next_question_field()
        if o is None or o not in O_TU_VAN_MUA:
            ra.append(o)
            break
        ra.append(o)
        b.fields["_da_hoi"] = ",".join(sorted(set((b.fields.get("_da_hoi") or "").split(",")) - {""} | {o}))
    return ra


def test_thu_tu_bay_cau_moi_cau_mot_lan_roi_toi_chot():
    assert _hoi_het(_lead()) == ["moi_truong_song", "thanh_vien", "noi_lam_viec", "dien_tich_mong_muon", "thang_may",
                                 "nguoi_quyet_dinh", "vay_ngan_hang", "tien_do_mua"]


def test_can_ho_khong_hoi_thang_may_va_bo_cau_da_biet():
    b = BuyerLead(khu_vuc="Quận 7", ngan_sach="3 tỷ", loai_bds="chung_cu", so_phong_ngu="2PN", muc_dich="để ở")
    b.fields.update(nhan_nha_khi_nao="ở liền", thanh_vien="vợ chồng + 1 bé")
    hoi = _hoi_het(b)
    assert "thang_may" not in hoi and "thanh_vien" not in hoi and hoi[-1] == "tien_do_mua"


def test_prompt_mua_goi_y_cau_va_khong_xin_so_dien_thoai():
    b = _lead()
    p = build_buyer_chat_system("Hằng", b, "thang_may")
    assert "ông bà" in p and "thang máy" in p
    xong = build_buyer_chat_system("Hằng", b, None)
    assert "KHÔNG xin số điện thoại" in xong and "hoặc xin số điện thoại" not in xong


def test_ai_ghi_duoc_o_moi():
    from aioi.prompts import operations_schema
    bl = operations_schema()["properties"]["buyer_lead"]["properties"]
    assert set(O_TU_VAN_MUA) <= set(bl)
    assert "thanh_vien" not in property_field_props()          # ô của khách mua, không phải ô tin rao


def test_engine_danh_dau_da_hoi_va_ghi_nhu_cau_xuong_buyers():
    kho = KhoGia()
    ke = {**KHACH_MUA, "buyer_lead": {**KHACH_MUA["buyer_lead"], "muc_dich": "để ở", "yeu_cau_xe_hoi": "hẻm xe hơi",
                                     "so_phong_ngu": "3PN"}}
    eng, ai = _engine(kho, ke)
    eng.handle("mua-7", "Em tìm nhà phố quận 5 tầm 5 tỷ để ở, hẻm xe hơi, 3 phòng ngủ")
    lead = eng.conversation("mua-7").buyer_lead
    assert "moi_truong_song" in (lead.fields.get("_da_hoi") or "")
    ke["buyer_lead"] = {**ke["buyer_lead"], "thanh_vien": "vợ chồng với ông bà"}
    eng.handle("mua-7", "nhà có vợ chồng em với ông bà")
    ghi = [d for d in kho.ghi("PATCH", "buyers") if isinstance(d, dict) and d.get("preferences")]
    assert ghi and ghi[-1]["preferences"].get("thanh_vien") == "vợ chồng với ông bà"
