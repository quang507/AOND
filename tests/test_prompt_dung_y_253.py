"""SRS-5.1zzzzzzz253 — soát prompt theo ý chủ dự án (28/10/2026: "Kiểm tra các đoạn prompt nào sai ý tôi nữa ko"). Mỗi bài đỏ khi trả lại
đoạn prompt cũ: một câu hỏi mỗi lượt (khối xác nhận THAY câu hỏi kế), hai số Zalo, xưng hô một nguồn, không hứa việc không có đường làm,
không câu ví dụ chép được, không còn vết mạng lưới CTV."""
from types import SimpleNamespace

from aioi.engine import SO_TU_VAN, khoi_can_nguoi, khoi_ngoai_viec, khoi_xung_ho
from aioi.mua import khoi_viec_vua_ghi
from aioi.projects import Project, merge_facts
from aioi.prompts import BUSINESS_CONTEXT, FEE_VALUE_POINTS, build_media_read_instruction, build_project_block, khoi_tinh_hinh_ban


def test_chua_ro_vai_neu_hai_muc_phi():
    assert "nêu cả hai mức" in BUSINESS_CONTEXT and "đừng báo phí" not in BUSINESS_CONTEXT


def test_xac_minh_du_an_chi_khi_luot_khong_co_cau_hoi_khac():
    p = Project("Khu Mẫu")
    merge_facts(p.attributes, p.votes, {"cổng": "đường A"}, voter="dong:z1")      # một phiếu Đồng: còn chờ
    khoi = build_project_block(p, "Khu Mẫu")
    assert "CƠ HỘI XÁC MINH" in khoi and "CHỈ ở lượt KHÔNG có câu hỏi thông tin nào khác" in khoi


def test_bao_admin_vi_viec_he_thong_khong_hua_nhan_khach():
    """Hỏi phường 3 lượt chưa ra → nhờ admin điền phường; bản cũ dặn model nói "anh/chị phụ trách sẽ nhắn khách sớm"."""
    conv = SimpleNamespace(y_luot={"can_nguoi_that": "Bot hỏi phường 3 lượt chưa ra", "bao_admin_he_thong": True})
    assert khoi_can_nguoi(conv) == ""
    conv.y_luot.pop("bao_admin_he_thong")
    assert "XIN GẶP NGƯỜI THẬT" in khoi_can_nguoi(conv)


def test_so_ky_gui_khong_hoi_tim_mua():
    ky_gui = khoi_ngoai_viec(SimpleNamespace(y_luot={"ngoai_viec": 1}, so_nhan=""))
    tu_van = khoi_ngoai_viec(SimpleNamespace(y_luot={"ngoai_viec": 1}, so_nhan=SO_TU_VAN))
    assert "tìm mua" not in ky_gui and "gửi bán hay cho thuê" in ky_gui
    assert "tìm mua" in tu_van


def test_doc_anh_khong_xung_ho_cung_khong_vi_du_mat_tien():
    s = build_media_read_instruction("T•ai", next_field="gia")
    assert 'Xưng "em", gọi khách "anh/chị"' not in s and "QUY TẮC XƯNG HÔ" in s
    assert "mặt tiền nhà phố 4 tầng" not in s and "anh/chị chụp lại" not in s


def test_gia_tri_phi_khong_con_mang_luoi_ctv():
    assert "người dẫn khách" not in FEE_VALUE_POINTS and "20 nhà môi giới" not in FEE_VALUE_POINTS


def test_khong_hua_bao_lai_khi_khong_co_duong():
    assert "báo chủ sau" not in khoi_tinh_hinh_ban(None, True)


def test_viec_mua_hoi_thi_thay_cau_hoi_nhu_cau():
    assert "THAY câu hỏi nhu cầu" in khoi_viec_vua_ghi(["xin khách MỘT số điện thoại"])


def test_xung_em_khong_vi_du_hoi_o_cu_the():
    k = khoi_xung_ho("em", "Minh•Anh")
    assert "đường nào vậy" not in k and "mặt tiền hay trong hẻm" not in k
