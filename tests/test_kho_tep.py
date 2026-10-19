"""Hàm thuần của kho tệp (`kho_tep`): tên tệp an toàn, đuôi theo kiểu, thư mục căn. Bản anh Luận kiểm các hàm này trong
test_sharepoint.py; SharePoint đã bỏ (SRS-5.1zzzzzzz56) nhưng các hàm vẫn dùng cho kho Supabase / kho thử trên máy (SRS-5.1zzzzzzz64)."""
from aioi.kho_tep import (
    MediaRef,
    extension_for,
    listing_folder,
    sanitize_filename,
    sanitize_path,
)


def test_extension_for_known_media_types():
    assert extension_for("image/jpeg") == ".jpg"
    assert extension_for("image/png") == ".png"
    assert extension_for("application/pdf") == ".pdf"


def test_extension_for_unknown_media_type_is_empty():
    assert extension_for("application/octet-stream") == ""


def test_sanitize_filename_strips_forbidden_chars():
    assert sanitize_filename('so_hong "2024".jpg') == "so_hong _2024_.jpg"
    assert sanitize_filename("a#b%c*d:e<f>g?h/i\\j{k|l}m") == "a_b_c_d_e_f_g_h_i_j_k_l_m"


def test_sanitize_filename_empty_falls_back():
    assert sanitize_filename("") == "tep"
    assert sanitize_filename("   ") == "tep"


def test_sanitize_path_drops_empty_segments():
    assert sanitize_path("Botanic Towers//căn 9/") == "Botanic Towers/căn 9"


def test_listing_folder_uses_project_or_nha_le():
    f = listing_folder("Botanic Towers", "123 Nguyễn Văn A", "abcd1234efgh5678")
    assert f == "Botanic Towers/123 Nguyễn Văn A_abcd1234"
    f2 = listing_folder(None, None, "abcd1234efgh5678")
    assert f2 == "Nhà lẻ/abcd1234"


def test_listing_folder_uses_ma_so_can_when_no_address():
    # Pre-sale project unit: no address yet → folder labelled by the mã số căn.
    assert listing_folder("Nyah Phú Định", None, "abcd1234ef", "căn 42") == "Nyah Phú Định/căn 42_abcd1234"
    # Address wins over the code once both are present (the unit has graduated).
    assert listing_folder("Nyah Phú Định", "198A", "abcd1234ef", "căn 42") == "Nyah Phú Định/198A_abcd1234"


def test_listing_folder_keeps_hem_address_as_one_segment():
    # "198A/22" (hẻm notation) must NOT split into a nested folder — the label is one segment.
    f = listing_folder("Nyah Phú Định", "198A/22 Trương Đình Hội", "abcd1234ef")
    assert f == "Nyah Phú Định/198A-22 Trương Đình Hội_abcd1234"
    assert f.count("/") == 1  # exactly the top/label separator, nothing from the address
