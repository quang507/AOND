"""System prompts and the extraction JSON schema.

Encodes the SRD rules: 30-word cap, praise-first, max 1 question/turn, honesty about
images, friendly local tone, and the assistant's assigned persona.
"""
from __future__ import annotations

import functools
import re
from typing import Any

from .projects import Project, UnitType
from .revenue import RENTAL_FEE_MONTHS, SALE_FEE_RATE, SellerRole
from . import cau_mau
from . import phap_ly
from .llm.base import RANH_GIOI_CACHE
from .web import SITE_HOST, SITE_URL, link_tin
from .schema import (
    CORE_FIELDS,
    CORE_THEO_LOAI,
    HOUSE_AREA_FIELDS,
    IDENTITY_FIELDS,
    RENTAL_FIELDS,
    SECONDARY_FIELDS,
    O_NOI_BO,
    O_SAU_DANG,
    Property,
    PropertyGroup,
    BuyerLead,
)

# Human-readable Vietnamese labels for each field slug — used when asking questions.
FIELD_LABELS: dict[str, str] = {
    "uu_the": "ưu thế khác (điểm riêng khách tự nói: gần trường / chợ, tặng nội thất, khu an ninh…)",
    "loai_hinh": "loại hình BĐS",
    "dia_chi": "địa chỉ",
    "phuong": "phường / xã (cũ hay mới đều được, vd phường 1 quận 5 / phường Chợ Quán / xã Phước Lý)",
    "gan_nga_tu": "gần ngã tư nào",
    "ma_so_can": "mã số căn (vd căn số 42, block/tầng)",
    "du_an": "tên dự án / chung cư",
    "dien_tich": "diện tích",
    "dien_tich_dat": "diện tích đất",
    "dien_tich_nha": "diện tích nhà",
    "gia": "giá",
    "ket_cau": "kết cấu (số lầu, phòng ngủ)",
    # 21/10 (SRS-5.1zzzzzzz95): ba ô hay lẫn — bề ngang CĂN (mat_tien), độ rộng con ĐƯỜNG (lo_gioi_duong), mặt tiền hay HẺM
    # (lo_gioi_hem). Nhãn nói rõ cái nào là của căn, cái nào là của đường; nhãn tới cả mô tả ô cho lượt AI bóc.
    "lo_gioi_hem": "vị trí: mặt tiền đường hay trong hẻm, kèm độ rộng hẻm nếu là hẻm (đường trước nhà)",
    "tinh_trang_ban_giao": "hiện trạng nhà: chủ đang ở, để trống giao ngay hay đang có người thuê (chỉ ý này — tiền thuê ghi ô thu_nhap_thue, thời hạn hợp đồng ghi ô hd_thue_con)",
    "phap_ly_hoan_cong": "pháp lý, hoàn công (sổ hồng)",
    # Nhà đất & Đất
    "kich_thuoc": "kích thước (ngang x dài)",
    "chi_tieu_xay_dung": "chỉ tiêu xây dựng",
    "quy_hoach": "quy hoạch, lộ giới, tranh chấp",
    "yeu_to_ha_tang": "yếu tố hạ tầng (cột điện, hố ga)",
    "tho_cu": "diện tích đất thổ cư",
    "lo_gioi_duong": "độ rộng / lộ giới của CON ĐƯỜNG trước nhà, đất (m — không phải bề ngang căn)",
    "phap_ly_so_do": "sổ đỏ riêng chính chủ",
    "the_chap": "tình trạng thế chấp ngân hàng",
    "thuong_luong": "khả năng thương lượng, bớt lộc",
    "ly_do_ban": "lý do cần bán / bán gấp hay thong thả (riêng của chủ)",
    # SRS-5.1zzzzzzz116: hỏi sau khi tin lên web (schema.CUM_SAU_DANG). Ô riêng (schema.O_NOI_BO) không lên web / bản tin.
    "dung_ten_so": "người đứng tên sổ (chính chủ / vợ chồng / đồng sở hữu) và mọi người đứng tên đồng ý bán chưa (riêng của chủ)",
    "thue_phi": "thuế phí sang tên bên nào chịu, giá đã gồm thuế phí chưa",
    "thanh_toan": "cách nhận tiền (một lần / chia đợt) và có cho người mua vay ngân hàng không",
    "gio_xem": "khung giờ tiện dẫn khách xem nhà (riêng của chủ)",
    "chia_khoa": "khi dẫn khách xem thì liên hệ ai, ai giữ chìa khoá (riêng của chủ)",
    "huong": "hướng nhà",
    "nam_xay": "năm xây / năm sửa lại",
    "hd_thue_con": "hợp đồng thuê hiện tại còn bao lâu (chỉ khi tin BÁN và nhà đang có người thuê)",
    "co_hdt": ("nhà (tin BÁN) đang có hợp đồng thuê hay không — AI đọc theo nghĩa, chỉ ghi \"co\" khi khách nói nhà đang cho thuê / có người thuê, "
               "\"khong\" khi khách nói đang ở hoặc để trống; chưa rõ thì BỎ TRỐNG"),
    "thu_nhap_thue": "tiền thuê nhà đang thu mỗi tháng (CHỈ khi tin BÁN và nhà đang có hợp đồng thuê; ghi cả số tiền khách nói, vd 35 triệu/tháng)",
    "hinh_anh": "hình ảnh thực tế / sổ đỏ (chủ nhà chụp gửi cho em)",
    # Chung cư / Căn hộ
    "so_phong_ngu": "số phòng ngủ và WC (chỉ số PHÒNG — số tầng / lầu thuộc ô kết cấu)",
    "tang_toa": "tầng và tòa/block căn hộ",
    "ban_cong_view": "hướng ban công và tầm nhìn (view thoáng hay nội khu)",
    "noi_that": "tình trạng nội thất (bàn giao cơ bản hay đầy đủ)",
    "phap_ly_so_hong": "pháp lý (sổ hồng riêng hay HĐMB)",
    "phi_quan_ly": "phí quản lý dịch vụ",
    "can_goc": "căn thường hay căn góc",
    "phi_gui_xe": "phí gửi ô tô / xe máy",
    "hien_trang_su_dung": "hiện trạng căn hộ: chủ đang ở, để trống hay có khách thuê (nhà phố / biệt thự / nhà cấp 4 ghi ô tinh_trang_ban_giao)",
    # Dự án
    "chu_dau_tu_phan_khu": "chủ đầu tư và phân khu dự án",
    "tien_do_xay_dung": "tiến độ thi công xây dựng",
    "chinh_sach_thanh_toan": "tiến độ thanh toán và chính sách ưu đãi",
    "phap_ly_du_an": "pháp lý dự án (quy hoạch 1/500, GPXD)",
    "thoi_gian_ban_giao": "thời gian dự kiến bàn giao",
    "chiet_khau": "chính sách chiết khấu thanh toán sớm / quà tặng CĐT",
    "phi_chuyen_nhuong": "phí chuyển nhượng hợp đồng",
    # Công nghiệp & Kho xưởng
    "thoi_han_su_dung": "thời hạn sử dụng đất",
    "chieu_cao_tran": "chiều cao trần",
    "tai_trong_san": "tải trọng sàn",
    "tram_bien_ap": "trạm biến áp",
    "tieu_chuan_container": "tiêu chuẩn container",
    "pccc": "hệ thống PCCC nghiệm thu",
    # Mặt bằng & Thương mại
    "mat_tien": "bề ngang của CĂN (chiều ngang lô phía giáp đường, m — không phải độ rộng con đường)",
    "loi_di": "lối đi (chung chủ hay riêng biệt độc lập)",
    "vi_he_xe": "vỉa hè và chỗ để xe (máy/ô tô)",
    "nganh_nghe": "ngành nghề kinh doanh phù hợp hoặc hạn chế",
    "dien_tich_trang_thiet_bi": "hiện trạng bàn giao và trang thiết bị sẵn có",
    "dien_nuoc_kd": "nguồn điện (3 pha) và nước kinh doanh",
    # Toà nhà / CHDV / Phòng trọ
    "dong_tien_thue": "dòng tiền doanh thu khai thác mỗi tháng",
    "so_phong": "số lượng phòng / căn hộ",
    "thang_may": "thang máy di chuyển",
    "gia_dien_nuoc": "giá điện nước (người thuê trả; phí quản lý là ô phí quản lý)",
    "gio_giac": "giờ giấc tự do hay giới nghiêm",
    "tien_ich_phong": "tiện ích phòng (gác lửng, máy lạnh, bếp)",
    # Đất nông nghiệp / đất kinh doanh (SRS-5.1zzzzzzz68)
    "len_tho_cu": "lên thổ cư được không",
    "nguon_nuoc": "nguồn nước (tưới, sinh hoạt)",
    "muc_dich_su_dung_dat": "mục đích sử dụng đất trên sổ (SKC, TMD, đất ở…)",
    # Cho thuê chung
    "thoi_han_hd": "thời hạn hợp đồng",
    "muc_coc": "mức cọc",
    "truot_gia": "trượt giá",
    "thoi_gian_fitout": "thời gian fit-out",
    # Người mua / Thuê
    "khu_vuc": "khu vực / quận mong muốn",
    "ngan_sach": "ngân sách / tầm tài chính dự kiến",
    "loai_bds": "loại hình BĐS tìm kiếm",
    "yeu_cau_xe_hoi": "yêu cầu hẻm xe hơi / chỗ đậu ô tô",
    "muc_dich": "mục đích mua (để ở hay đầu tư, kinh doanh)",
    "tien_do_mua": "thời gian dự kiến chốt mua / xem nhà",
    "vay_ngan_hang": "nhu cầu vay vốn ngân hàng",
    "nhan_nha_khi_nao": "thời gian muốn nhận nhà vào ở",
    # SRS-5.1zzzzzzz116: 7 câu tư vấn khách mua (schema.O_TU_VAN_MUA)
    "moi_truong_song": "muốn sống ở khu như thế nào (yên tĩnh, gần chợ / trường / công viên…)",
    "thanh_vien": "nhà gồm những ai sẽ ở (vợ chồng, con nhỏ, ông bà…)",
    "noi_lam_viec": "đi làm / con đi học ở khu vực nào",
    "dien_tich_mong_muon": "cần mấy phòng, diện tích tầm bao nhiêu thì thoải mái",
    "tien_ich_mong_muon": "muốn gần tiện ích nào (trường học, bệnh viện, chợ, siêu thị, công viên)",
    "thang_may": "có cần nhà có thang máy không",
    "nguoi_quyet_dinh": "ngoài anh/chị còn ai cùng quyết định mua",
}

# Lời hỏi tự nhiên như môi giới thực tế (tránh đọc tên slug khô cứng)
NATURAL_QUESTIONS: dict[str, str] = {
    # Identity & chung
    "loai_hinh": "Xác nhận nhẹ căn này là chung cư, nhà phố hay đất",
    "dia_chi": "Hỏi phần địa chỉ CÒN THIẾU (tên đường, phường / xã, tỉnh nếu chưa rõ; KHÔNG hỏi quận / huyện — đã bỏ từ 1/7/2025). Đất ở xã chưa có tên đường: hỏi đất gần chỗ nào hoặc đường nào — phần đã có trong dữ liệu đã biết thì KHÔNG hỏi lại",
    "ma_so_can": "Hỏi mã căn hộ hoặc số nhà, tầng và tòa",
    "du_an": "Hỏi tên chung cư hoặc khu đô thị/dự án",
    "dien_tich": "Hỏi diện tích sử dụng của căn mình khoảng bao nhiêu mét vuông",
    "dien_tich_dat": "Hỏi diện tích đất công nhận trên sổ (ngang x dài khoảng bao nhiêu mét)",
    # SRS-5.1zzzzzzz76: bản cũ "…hoặc số tầng/lầu" — khách đã nói số tầng thì model coi ô này xong, tự hỏi chuyện khác (thương lượng).
    "dien_tich_nha": "Hỏi tổng diện tích sàn xây dựng khoảng bao nhiêu m² (số tầng đã biết vẫn phải hỏi m² sàn)",
    "gia": "Hỏi mức giá bán mong muốn thu về",
    "ket_cau": "Hỏi nhà mình xây mấy lầu / mấy tầng, có mấy phòng ngủ, mấy WC",
    "lo_gioi_hem": ("Hỏi nhà mình ở mặt tiền đường hay trong hẻm, và đường (hoặc hẻm) trước nhà rộng khoảng mấy mét; hẻm thì "
                    "xe hơi vào tận cửa được không"),
    "tinh_trang_ban_giao": "Hỏi nhà hiện đang ở, đang trống giao ngay hay đang cho thuê (chỉ hỏi ý này; tiền thuê, hợp đồng còn bao lâu hỏi sau nếu nhà có người thuê)",
    "phap_ly_hoan_cong": "Hỏi sổ hồng riêng đã hoàn công đầy đủ chưa",
    # Nhà đất & Đất
    "kich_thuoc": "Hỏi bề ngang và chiều dài nhà/đất khoảng bao nhiêu mét",
    "chi_tieu_xay_dung": "Hỏi chỉ tiêu quy hoạch được phép xây mấy tầng",
    "quy_hoach": "Hỏi nhà / đất có dính quy hoạch, lộ giới hay tranh chấp gì không",
    "yeu_to_ha_tang": "Hỏi trước nhà có vướng cột điện hay hố ga không",
    "tho_cu": "Hỏi diện tích đất thổ cư công nhận trên sổ là bao nhiêu mét vuông",
    "lo_gioi_duong": "Hỏi con đường trước nhà / đất rộng mấy mét (độ rộng con đường, không phải bề ngang lô), ô tô / xe tải vào tận nơi không",
    "phap_ly_so_do": "Hỏi sổ đỏ riêng chính chủ sẵn sàng công chứng chưa",
    "the_chap": "Hỏi sổ đang cất ở nhà hay đang thế chấp ngân hàng",
    "thuong_luong": "Hỏi giá này chủ muốn giữ cứng hay còn thương lượng (không gài sẵn chữ \"bớt lộc\", \"khách thiện chí\")",
    "ly_do_ban": "Hỏi thăm lý do bán hoặc tiến độ cần bán nhanh hay thong thả",
    "dung_ten_so": "Hỏi NGẮN đúng một câu, không giải thích, không liệt kê lựa chọn: \"Sổ đứng tên ai vậy ạ?\" (chỉ hỏi quan hệ, KHÔNG xin họ tên)",
    "thue_phi": "Hỏi thuế phí sang tên bên nào chịu (bên bán, bên mua hay chia đôi) — giá đã gồm thuế phí chưa",
    "thanh_toan": "Hỏi muốn nhận tiền một lần hay chia đợt, có đồng ý để người mua vay ngân hàng không",
    "gio_xem": "Hỏi khung giờ nào tiện để bên em dẫn khách tới xem nhà",
    "chia_khoa": "Hỏi lúc dẫn khách xem thì bên em liên hệ ai (chủ nhà hay người nhà) và ai giữ chìa khoá — KHÔNG xin số điện thoại",
    "huong": "Hỏi nhà hướng gì",
    "nam_xay": "Hỏi nhà xây năm nào, đã sửa lại lần nào chưa",
    "hd_thue_con": "Hỏi hợp đồng thuê hiện tại còn bao lâu",
    "thu_nhap_thue": "Hỏi tiền thuê nhà đang thu mỗi tháng khoảng bao nhiêu (chỉ khi nhà đang có người thuê)",
    "hinh_anh": "Mời gửi hình ảnh thực tế hoặc hình sổ để hồ sơ được chấm điểm cao",
    # Chung cư / Căn hộ
    "so_phong_ngu": "Hỏi căn mình thiết kế mấy phòng ngủ và mấy WC",
    "tang_toa": "Hỏi căn mình ở tầng mấy, thuộc tòa/block nào",
    "ban_cong_view": "Hỏi hướng ban công và tầm nhìn (view thoáng mát hay nội khu)",
    "noi_that": "Hỏi nội thất để lại đầy đủ hay bàn giao cơ bản",
    "phap_ly_so_hong": "Hỏi căn hộ đã có sổ hồng riêng hay còn hợp đồng mua bán (HĐMB)",
    "phi_quan_ly": "Hỏi phí quản lý dịch vụ mỗi tháng khoảng bao nhiêu",
    "can_goc": "Hỏi căn mình là căn góc hay căn thường",
    "phi_gui_xe": "Hỏi phí gửi xe máy, ô tô ở tòa nhà",
    "hien_trang_su_dung": "Hỏi hiện trạng đang ở, để trống hay đang có hợp đồng thuê",
    # Dự án
    "chu_dau_tu_phan_khu": "Hỏi chủ đầu tư và tên phân khu dự án",
    "tien_do_xay_dung": "Hỏi tiến độ xây dựng hiện tại đến đâu (đang móng, cất nóc hay bàn giao)",
    "chinh_sach_thanh_toan": "Hỏi tiến độ thanh toán và chính sách vay ngân hàng",
    "phap_ly_du_an": "Hỏi pháp lý dự án (quy hoạch 1/500, giấy phép xây dựng)",
    "thoi_gian_ban_giao": "Hỏi dự kiến thời gian nào bàn giao nhà",
    # Kho xưởng
    "thoi_han_su_dung": "Hỏi thời hạn sử dụng đất đến năm nào",
    "chieu_cao_tran": "Hỏi chiều cao trần kho xưởng (m)",
    "tai_trong_san": "Hỏi tải trọng sàn (tấn/m2)",
    "tram_bien_ap": "Hỏi trạm biến áp công suất bao nhiêu kVA và nguồn điện 3 pha",
    "tieu_chuan_container": "Hỏi xe container 20ft/40ft vào tận cửa xưởng được không",
    "pccc": "Hỏi hệ thống PCCC đã nghiệm thu chưa",
    # Mặt bằng & Thương mại
    "mat_tien": "Hỏi bề ngang của căn (chiều ngang phía giáp đường) mấy mét — nói rõ là ngang của căn, không phải đường rộng bao nhiêu",
    "loi_di": "Hỏi lối đi chung chủ hay hoàn toàn riêng biệt",
    "vi_he_xe": "Hỏi vỉa hè rộng mấy mét và chỗ để xe cho khách",
    "nganh_nghe": "Hỏi ngành nghề kinh doanh phù hợp hoặc ngành bị hạn chế",
    "thoi_han_hd": "Hỏi thời hạn hợp đồng thuê tối thiểu mấy năm",
    "muc_coc": "Hỏi mức cọc mấy tháng tiền thuê",
    # Toà nhà / CHDV / Phòng trọ (SRS-5.1zzzzzzz68)
    "so_phong": "Hỏi toà nhà có tổng cộng bao nhiêu phòng / căn cho thuê",
    "dong_tien_thue": "Hỏi doanh thu cho thuê mỗi tháng hiện được bao nhiêu, đang lấp đầy mấy phòng",
    "tien_ich_phong": "Hỏi phòng có gác lửng, máy lạnh, bếp, WC riêng không",
    "gia_dien_nuoc": "Hỏi giá điện nước tính sao, phí dịch vụ bao nhiêu",
    "gio_giac": "Hỏi giờ giấc tự do hay có giờ đóng cổng",
    "len_tho_cu": "Hỏi đất có chuyển lên thổ cư được không",
    "nguon_nuoc": "Hỏi nguồn nước tưới / sinh hoạt ở đó lấy từ đâu",
    "muc_dich_su_dung_dat": "Hỏi trên sổ ghi mục đích sử dụng đất là gì (SKC, TMD hay đất khác)",
    # Khách mua (SRS-5.1zzzzzzz116)
    "moi_truong_song": "Hỏi khách muốn sống ở một khu như thế nào (yên tĩnh, gần chợ, trường, công viên…)",
    "thanh_vien": "Hỏi nhà mình gồm những ai sẽ ở",
    "noi_lam_viec": "Hỏi khách đi làm (con đi học) ở khu vực nào để chọn chỗ tiện đi lại",
    "dien_tich_mong_muon": "Hỏi cần khoảng mấy phòng, diện tích tầm bao nhiêu thì thoải mái (số phòng khách đã nói thì chỉ hỏi diện tích)",
    "thang_may": ("Hỏi việc lên xuống các tầng với nhà khách thế nào (ví dụ nhà có người lớn tuổi đi cầu thang được không) — câu MỞ, "
                  "KHÔNG gợi sẵn \"thang máy sẽ tiện hơn\" rồi hỏi khách thấy sao. Không nói bên em có mẫu nào nếu danh sách căn không có"),
    "nguoi_quyet_dinh": "Hỏi ngoài anh/chị còn ai cùng quyết định mua không (để em gửi thông tin cho đủ người xem)",
    "vay_ngan_hang": "Hỏi khách dự định thanh toán thế nào (tiền sẵn hay vay một phần) — câu mở, không hỏi \"có cần em tư vấn vay không\"",
}

# Từ điển tiếng lóng BĐS thực chiến (thừa kế từ nhadat.cc) — giúp AI hiểu đúng từ lóng của người rao
SLANG_NOTES = """TỪ ĐIỂN TIẾNG LÓNG BĐS (hiểu đúng, không hỏi lại nghĩa):
- TIỀN & GIÁ:
  • "tỏi" = tỷ ("5 tỏi" = 5 tỷ); "củ" = triệu ("50 củ" = 50 triệu); "xị" = trăm nghìn; "chục" = 10; "5t5" / "5 tỷ rưỡi" = 5,5 tỷ; "4 tỷ 8" = 4,8 tỷ; "800tr" = 800 triệu.
  • "TL" / "thương lượng" / "bớt lộc" = giá còn thương lượng nhẹ; "giá net" / "giá bao" = giá cứng bên bán thu về; "ngộp" / "kẹt tiền" / "cắt lỗ" = cần bán gấp.
  • "cây" / "lượng" = vàng SJC (ghi nguyên văn, không tự đổi ra tiền).
- VỊ TRÍ, ĐỊA CHỈ & ĐƯỜNG SÁ:
  • "đc:" / "đ/c:" / "dc:" = ĐỊA CHỈ (viết tắt).
  • DẤU GẠCH CHÉO "/" (XUYỆC/XUYỆT) LÀ SỐ NHÀ TRONG HẺM (vd: "100/9", "391/34", "12/5A..."):
    ĐÂY LÀ SỐ NHÀ TRONG HẺM (vd: "100/9" = nhà số 100 xuyệc 9)!
    ⚠️ CẤM TUYỆT ĐỐI HIỂU NHẦM DẤU "/" THÀNH DIỆN TÍCH HAY KÍCH THƯỚC (vd: "100/9" KHÔNG PHẢI là "100m2 ngang 9m"!). Khi khách cho tên đường rồi nhắn "đc: 100/9", địa chỉ đầy đủ là 100/9 của đường đó (nhà trong hẻm), tuyệt đối không suy diễn thành 100m2 đất ngang 9m.
  • "MT" = mặt tiền; "MTKD" = mặt tiền kinh doanh; "HXH" = hẻm xe hơi (ô tô vào được); "hẻm ba gác" = chỉ xe ba gác vào được; "hẻm thông" = không cụt.
  • "1 xuyệt / 2 xuyệt" = quẹo 1-2 lần hẻm; "lô góc / căn góc" = 2 mặt thoáng; "nở hậu" = phía sau rộng hơn (điểm cộng); "tóp hậu" = phía sau hẹp hơn; "vuông vức" = đất vuông đẹp.
  • "khu người Hoa / Chợ Lớn" = khu vực Quận 5 cũ (Nguyễn Trãi, Trần Hưng Đạo, Hải Thượng Lãn Ông, Châu Văn Liêm, Hồng Bàng...).
- PHÁP LÝ & LOẠI ĐẤT:
  • "SHR" = sổ hồng riêng; "SHC" = sổ hồng chung; "HĐMB" = hợp đồng mua bán; "hoàn công" = đã cập nhật tài sản gắn liền với đất trên sổ; "vi bằng / giấy tay" = chưa có sổ riêng.
  • "thổ cư" / "ONT / ODT" = đất ở nông thôn / đô thị; "SKC / TMD" = đất thương mại dịch vụ, cơ sở sản xuất; "CLN / HNK" = đất trồng cây lâu năm / hoa màu."""

# Một nguồn cho ô is_rental ở lượt bóc tách lẫn lượt lập thao tác (SRS-5.1zzzzzzz107, bắn thử 207 KB2: "giá 27 tỷ… đang cho thuê 50
# triệu/tháng" thành tin CHO THUÊ — mô tả cũ chỉ "Có phải tin cho thuê không"). Hiện trạng có người thuê không phải ý muốn cho thuê.
MO_TA_CHO_THUE = ("true CHỈ KHI khách muốn CHO THUÊ căn này (rao cho thuê, giá thuê theo tháng). Khách rao BÁN (giá bán, vd \"27 tỷ\") "
                  "mà nói \"đang cho thuê 50 triệu/tháng\" là HIỆN TRẠNG (nhà đang có người thuê) → false.")


# Stable business context used when discussing fees / drafting listings
# Mức phí MỘT NGUỒN (SRS-5.1zzzzzzz275): số ở `revenue.SALE_FEE_RATE` / `RENTAL_FEE_MONTHS` (cũng là số tính tiền giao dịch); mọi câu chữ
# phí trong prompt / câu mẫu dựng từ đây — trước đây "1% / 0.5% / 0.75 tháng" viết tay ở 4 chỗ (BUSINESS_CONTEXT, _fee_hint, engine, muc_phi).
def _pt(x: float) -> str:
    return f"{x * 100:g}%"


PT_CHU = _pt(SALE_FEE_RATE[SellerRole.CHU_NHA])     # "1%"
PT_MG = _pt(SALE_FEE_RATE[SellerRole.MOI_GIOI])     # "0.5%"
PHI_THUE = f"{RENTAL_FEE_MONTHS:g} tháng tiền thuê"  # "0.75 tháng tiền thuê"

BUSINESS_CONTEXT = f"""BỐI CẢNH AI ƠI NHÀ ĐẤT (nền tảng nội bộ — chỉ nói ra khi khách hỏi, đừng thuyết giảng):
- Người rao bán/cho thuê BĐS bằng cách chat Zalo tự nhiên (KHÔNG form). Nhiệm vụ của bạn: lặng lẽ gom đủ dữ liệu listing, giữ khách quay lại, và dùng gamification để khích lệ.
- HAI loại khách — hãy nhận biết qua hội thoại rồi tư vấn cho đúng:
  • Bên SỞ HỮU (chủ nhà; hoặc nhà đầu tư lướt sóng giữ HĐMB): phí {PT_CHU} giá chốt khi bán, hoặc {PHI_THUE} (ba phần tư của MỘT tháng tiền thuê, tuyệt đối không nói nhầm thành 3 hay 4 tháng).
  • Bên MÔI GIỚI (nhân viên môi giới; hoặc sàn giao dịch): phí {PT_MG} giá chốt khi bán, hoặc {PHI_THUE}. Khích lệ đăng thêm hàng (≥10 căn) để lên Top.
  • CHỦ ĐẦU TƯ: phí KHÔNG theo {PT_CHU}/{PT_MG} — thoả thuận riêng với dự án; đừng tự báo con số.
- CHÍNH SÁCH khi khách hỏi (chủ dự án chốt 28/10/2026, SRS-5.1zzzzzzz241): (1) KHÔNG bớt / giảm phí — khách xin bớt thì nói khéo mức phí cố định, bù lại chỉ thu khi giao dịch thành công; (2) CÓ ký hợp đồng môi giới bằng văn bản (thống nhất phí) — khách hỏi thì nói có; khách muốn ký thì nói em nối người phụ trách, KHÔNG hẹn giờ, KHÔNG tự gửi mẫu; (3) KHÔNG độc quyền — chủ nhà gửi bán nhiều nơi vẫn được; (4) môi giới gửi hàng: phí {PT_MG} giá chốt như trên, không có mức chia hoa hồng nào khác.
- PHÍ CHỈ thu khi giao dịch THÀNH CÔNG. TUYỆT ĐỐI không bịa con số phí/ưu đãi/cam kết nào ngoài các mức trên. Chưa rõ vai người rao thì nêu cả hai mức (chủ nhà {PT_CHU}, môi giới {PT_MG}) hoặc hỏi khách là chủ nhà hay môi giới.
- Gamification: có Điểm uy tín và hạng Đồng/Bạc/Vàng — số THẬT nằm ở khối "ĐIỂM TIN" cuối prompt (hệ thống tính); chỉ nói số trong khối đó, gợi ý cách tăng điểm theo ô còn thiếu ghi ở đó (ảnh, sổ hồng, thông tin còn thiếu)."""


def muc_phi(role: SellerRole, thue: bool) -> str | None:
    """Mức phí điền vào câu mẫu `bao_phi` (SRS-5.1zzzzzzz111) — theo vai + bán hay thuê, cùng chính sách với `_fee_hint`.
    Chủ đầu tư: None (phí theo thoả thuận riêng, không báo con số)."""
    if role == SellerRole.CHU_DAU_TU:
        return None
    if thue:
        return PHI_THUE
    if role in (SellerRole.CHU_NHA, SellerRole.LUOT_SONG):
        return f"{PT_CHU} giá chốt"
    if role in (SellerRole.MOI_GIOI, SellerRole.SAN):
        return f"{PT_MG} giá chốt"
    return f"{PT_CHU} giá chốt nếu là chủ nhà, {PT_MG} nếu là môi giới"


def khoi_bao_phi(role: SellerRole, thue: bool) -> str:
    """Dặn model báo phí bằng NGUYÊN VĂN câu mẫu `bao_phi` (câu tester sửa, chủ dự án sửa tiếp ở CRM). Rỗng khi không có con số."""
    phi = muc_phi(role, thue)
    if not phi:
        return ""
    return f'Báo phí bằng NGUYÊN VĂN câu mẫu: "{cau_mau.cau("bao_phi", phi=phi)}"'


def _fee_hint(role: SellerRole) -> str:
    """A targeted fee line once the seller's role is known, so the bot quotes correctly."""
    if role in (SellerRole.CHU_NHA, SellerRole.LUOT_SONG):
        who = "CHÍNH CHỦ" if role == SellerRole.CHU_NHA else "NHÀ ĐẦU TƯ (chủ HĐMB)"
        return (
            f"VAI NGƯỜI RAO: {who} (bên sở hữu). Nếu được hỏi phí, báo {PT_CHU} giá chốt khi bán, "
            f"hoặc {PHI_THUE} (ba phần tư của MỘT tháng tiền thuê; TUYỆT ĐỐI KHÔNG giải thích là 3 hoặc 4 tháng), chỉ thu khi giao dịch thành công."
        )
    if role in (SellerRole.MOI_GIOI, SellerRole.SAN):
        who = "MÔI GIỚI" if role == SellerRole.MOI_GIOI else "SÀN GIAO DỊCH"
        return (
            f"VAI NGƯỜI RAO: {who} (bên môi giới). Nếu được hỏi phí, báo {PT_MG} giá chốt khi bán, "
            f"hoặc {PHI_THUE} (ba phần tư của MỘT tháng tiền thuê; TUYỆT ĐỐI KHÔNG giải thích là 3 hoặc 4 tháng), chỉ thu khi thành công; khích lệ đăng thêm hàng (≥10 căn) để lên Top hiển thị."
        )
    if role == SellerRole.CHU_DAU_TU:
        return (
            f"VAI NGƯỜI RAO: CHỦ ĐẦU TƯ. Phí KHÔNG theo {PT_CHU}/{PT_MG} — đây là thoả thuận riêng "
            "với dự án. Nếu được hỏi phí, nói sẽ kết nối bộ phận hợp tác dự án, ĐỪNG báo con số."
        )
    return ""  # unknown -> rely on the general BUSINESS_CONTEXT guidance


def build_project_block(
    project: Project | None,
    du_an_name: str | None = None,
    unit_type: UnitType | None = None,
    unit_type_name: str | None = None,
) -> str:
    """Project + unit-type awareness block for a listing's prompt:
    - known project   → inject verified facts + ask the seller to lightly confirm them;
    - named but unknown project → tell the bot to acquire knowledge (ask / request a link);
    - known unit-type (mẫu nhà) → inject its layout/specs too (units inherit them);
    - named but unknown unit-type → acquire it (ask for specs / a brochure link), don't invent;
    - no project (nhà lẻ) → nothing.
    """
    parts: list[str] = []
    if project is not None and project.facts():
        facts = "\n".join(f"- {f}" for f in project.facts())
        parts.append(
            f'\nDỮ LIỆU DỰ ÁN "{project.name}" (đã xác thực — căn này THUỘC dự án này). '
            "Hãy DÙNG các thông tin chung này để tư vấn/giới thiệu; ĐỪNG hỏi lại để xác nhận (khách nói khác dữ liệu thì theo lời khách):\n"
            f"{facts}\n"
        )
    elif du_an_name:
        parts.append(
            f'\nKhách nhắc dự án "{du_an_name}" (hệ thống CHƯA có dữ liệu dự án này). '
            "Ưu tiên hỗ trợ khách rao căn của họ trước (diện tích, giá, tầng/tòa). "
            "Nếu tiện hoặc khách có sẵn LINK brochure/mặt bằng thì mới xin một LINK, "
            "không làm phiền khách, tập trung vào căn đang bán.\n"
        )

    if unit_type is not None and unit_type.facts():
        facts = "\n".join(f"- {f}" for f in unit_type.facts())
        parts.append(
            f'\nMẪU NHÀ "{unit_type.name}" (đã xác thực — căn này thuộc mẫu này; các căn cùng '
            "mẫu dùng chung thông số này). Hãy dùng để tư vấn, không hỏi lại để xác nhận:\n"
            f"{facts}\n"
        )
    elif unit_type_name and (unit_type is None or not unit_type.facts()):
        # Model NAMED but AOND has no facts on it — acquire it, and DON'T fabricate its specs.
        parts.append(
            f'\nƯU TIÊN — BỔ SUNG KIẾN THỨC MẪU NHÀ: khách nhắc mẫu nhà "{unit_type_name}" '
            "nhưng em CHƯA có dữ liệu về mẫu này. TUYỆT ĐỐI đừng bịa/suy diễn thông số của mẫu "
            "(diện tích, số phòng, số tầng, bố trí, vật liệu...). Hãy nói thật là em chưa có thông "
            "tin mẫu này và hỏi khách 1 ý về mẫu (diện tích, số phòng ngủ, số tầng, bố trí) HOẶC "
            "XIN LINK brochure / mặt bằng của mẫu. Tiếp nhận ngắn gọn, rồi hỏi đúng 1 ý — câu này THAY câu hỏi thông tin kế (một câu hỏi cả lượt).\n"
        )

    # Verify-conflicts opening: this seller ALSO lists in the project, so they're a good
    # person to break a tie between values other sellers gave. Ask ONE, lightly.
    # SRS-5.1zzzzzzz249: điều người bán khác nói về dự án CHỜ đủ phiếu (theo hạng Đồng / Bạc / Vàng) mới vào kho chung — ở đây chỉ là
    # lời chờ xác minh, model không được nói như sự thật.
    cho = project.pending() if project is not None else []
    if unit_type is not None:
        cho += [f"mẫu {unit_type.name} — {x}" for x in unit_type.pending()]
    if cho:
        dong = "\n".join(f"- {x}" for x in cho[:6])
        parts.append(
            f'\nCƠ HỘI XÁC MINH: dự án "{project.name}" có điều người bán khác đã nói nhưng CHƯA đủ người xác nhận '
            f"(chưa phải dữ liệu dự án, đừng nói như sự thật):\n{dong}\nKhách này cũng bán trong "
            "dự án nên có thể biết. CHỈ ở lượt KHÔNG có câu hỏi thông tin nào khác thì hỏi NHẸ đúng 1 điểm (đừng nhắc người khác đã nói) "
            "— lượt đã có câu hỏi thì bỏ qua, một câu hỏi cả lượt. Nếu khách trả lời rõ thì cảm ơn.\n"
        )
    return "".join(parts)


def build_project_docs_block(project_name: str, docs: list[dict[str, str]]) -> str:
    """Inject the project's stored source .md (phân lô, brochure mẫu nhà, gói nội thất...) so
    the bot answers a FACTUAL question with grounding — from the real document, not recall."""
    if not docs:
        return ""
    parts = [
        f'\n=== TÀI LIỆU DỰ ÁN "{project_name}" (đã lưu). Khách VỪA HỎI một câu dữ kiện. NHIỆM '
        "VỤ ƯU TIÊN LƯỢT NÀY: TÌM câu trả lời trong tài liệu dưới và TRẢ LỜI NGAY, chính xác "
        "(diện tích/vị trí lô, thông số mẫu nhà, gói nội thất, tiện ích...). Nếu tài liệu CÓ "
        "đáp án thì ĐỪNG hỏi ngược khách thông tin đã có, ĐỪNG theo kịch bản thu thập — trả lời "
        'thẳng câu họ hỏi. CHỈ dùng thông tin CÓ trong đây, TUYỆT ĐỐI không bịa; chỉ khi tài '
        'liệu KHÔNG có mới nói "em chưa có tài liệu về ý này ạ". ==='
    ]
    for d in docs:
        md = (d.get("markdown") or "").strip()
        if md:
            parts.append(f'\n[{d.get("title", "tài liệu")}]\n{md}')
    return "\n".join(parts) + "\n"


# SRS-5.1zzzzzzz219 (chủ dự án 27/10/2026: "sửa cho nó thành vui vẻ, tự nhiên, nhanh nhạy, thêm cảm thán, chưa có nét riêng; đọc như một nhân
# viên lễ phép hơn là một môi giới đang hào hứng… dãn câu mẫu ra thành prompt cụ thể"): MỘT khối giọng cho cả lượt chat lẫn lượt sửa bản
# tin, viết THUẬN (nói điều muốn, không liệt kê cấm). Minh hoạ lấy từ hội thoại mẫu SRD của anh Luận (`req + chat examples.docx`, Phần II) —
# chỉ là lời ĐÁP / cảm thán, không kèm câu hỏi của một ô cụ thể (SRS-196). Đổi giọng thì sửa ở đây, đừng thêm luật rời ở từng prompt.
GIONG_VUI = """GIỌNG (bắt buộc): em là một môi giới trẻ đang HÀO HỨNG với căn nhà của khách — nhắn Zalo như với người quen, không phải nhân viên đọc kịch bản.
- Lượt đang hỏi thông tin thì NGẮN, khoảng 30 từ như bản anh Luận: khen vài chữ rồi làm việc / hỏi đúng một ý. Không giảng giải.
- Khen thoải mái, thật lòng: khách vừa đưa một điểm mạnh (vị trí, mặt tiền, hẻm rộng, sổ hồng, nhiều phòng, giá tốt…) thì mở bằng một tiếng cảm thán — "Wow", "Tuyệt vời", "Ồ hay quá", "Ngon lành", "Đẹp luôn"… mỗi lần một tiếng khác. Điều bình thường thì đáp thẳng vào ý, không khen gượng.
- Đổi KIỂU khen giữa các lượt, hai lượt liền nhau không cùng kiểu: (1) cảm thán + vài chữ; (2) khen kèm MỘT lợi ích nói gọn trong nửa câu; (3) vào thẳng việc. Khuôn "<điều khách nói> thì <lợi ích>" dễ thành văn mẫu — nhiều nhất một lần mỗi ba lượt.
- Minh hoạ giọng (CHỈ minh hoạ các kiểu, KHÔNG phải câu để chép): một tiếng cảm thán rồi vào việc · khen đúng chữ khách vừa nói · một lợi ích gọn nửa câu · không khen, hỏi luôn.
- Có nét riêng: nhắc ĐÚNG một chi tiết khách vừa kể để khách thấy mình đang nghe; gọi căn bằng tên đường ("căn Hoàng Hoa Thám này") thỉnh thoảng thôi, không lượt nào cũng gọi.
- Từ đời thường miền Nam ("ghê", "luôn", "nha", "nghen") — mỗi câu nhiều nhất MỘT từ như vậy.
- Mỗi lượt một vẻ: không cùng kiểu mở, không cùng khuôn câu, không cùng câu hỏi chốt với lượt trước. Việc đã làm (sửa tin, thêm icon, đổi tiêu đề) nói bằng lời tự nhiên trong câu đáp, hoặc vào thẳng bản tin; câu báo cáo kiểu "Em ghi nhận / Em đã cập nhật" nói nhiều nhất MỘT lần cả cuộc chat.
- Gọi khách (anh / chị / cô / chú) NHIỀU NHẤT một lần mỗi lượt, và đừng lượt nào cũng có "<gọi> ơi" hay kết câu bằng "<gọi> ạ" — người thật nhắn Zalo không gọi tên mỗi câu; câu đáp ngắn thì bỏ hẳn tiếng gọi.
- Hào hứng nhưng vẫn thật: cảm thán không thêm chi tiết khách chưa nói, không nêu số / so giá thị trường, không hứa bán được."""


def build_chat_system(
    assistant_name: str,
    prop: Property,
    next_field: str | None,
    user_type: SellerRole = SellerRole.UNKNOWN,
    project_block: str = "",
    cum: list[str] | None = None,
    hoi_lai: bool = False,
    o_bo_qua: str | None = None,
) -> str:
    """Lượt chat người bán — GIỌNG theo bản anh Luận (`luan8560/AOND` 207a145, `build_chat_system`), SRS-5.1zzzzzzz207 (chủ dự án 26/10:
    "lấy 100% của bên aond… cái nào cần gỡ bớt cho tự do thì gỡ, nhưng phần bóc tách… thì ko lấy"). Thêm vào khuôn anh Luận chỉ phần
    NGHIỆP VỤ không phải giọng (tiếng lóng, địa chỉ / phường, tin hệ thống trong ngoặc, trạng thái tin) và lời hỏi lại khi khách chưa
    trả lời ô vừa hỏi (`hoi_lai`, SRS-200). `cum` giữ cho chữ ký cũ (hỏi gộp cụm đã bỏ, SRS-136): chỉ hỏi ô đầu."""
    ambiguous_area = prop.fields.get("dien_tich")
    # Con số đó khách đã nói là đất (hoặc nhà) rồi thì hết mơ hồ — hỏi ô còn lại, đừng hỏi lại "80m2 là đất hay nhà" (SRS-5.1zzzzzzz52).
    def _so(v: str | None) -> str | None:
        m = re.search(r"\d+(?:[.,]\d+)?", v or "")
        return m.group(0).replace(",", ".") if m else None
    if ambiguous_area and _so(ambiguous_area) in (_so(prop.fields.get("dien_tich_dat")), _so(prop.fields.get("dien_tich_nha"))):
        ambiguous_area = None
    if next_field in ("dien_tich_dat", "dien_tich_nha") and ambiguous_area:
        ask_line = (
            f'Khách đã cho biết diện tích {ambiguous_area} nhưng CHƯA RÕ là diện tích ĐẤT hay '
            f'diện tích NHÀ (nhà phố/biệt thự/nhà cấp 4 có 2 diện tích khác nhau). Khen ngợi '
            f'điểm mạnh trước, rồi hỏi lại đúng 1 câu để xác nhận {ambiguous_area} đó là đất '
            "hay nhà."
        )
    elif next_field:
        ask_line = (
            f'Thông tin cần hỏi tiếp theo: "{nhan_o(next_field, prop)}"'
            + (f" ({cau_hoi_o(next_field, prop)})" if cau_hoi_o(next_field, prop) not in (nhan_o(next_field, prop), f"hỏi thêm {nhan_o(next_field, prop)}") else "")
            + ". Hãy khen ngợi điểm mạnh của BĐS trước, rồi hỏi đúng 1 thông tin này một cách tự nhiên. CHỈ hỏi ý này — KHÔNG tự hỏi ý khác "
            "ngoài danh sách (thương lượng, lý do bán, thế chấp…); khách tự nói thì lưu vào tin, không hỏi lại."
            + (" Ô này em ĐÃ hỏi ở lượt trước mà khách chưa trả lời: ĐỔI cách hỏi (ngắn hơn, hoặc gợi sẵn vài đáp án để khách chọn nhanh — "
               "riêng giá / diện tích / con số thì KHÔNG đưa số gợi ý), KHÔNG lặp lại nguyên câu cũ, và đừng nhắc là mình đã hỏi." if hoi_lai else "")
            # SRS-5.1zzzzzzz208 (bắn thử 368 Cao Lỗ: hệ thống đã chuyển sang hỏi pháp lý, model vẫn hỏi lại diện tích sàn vừa hỏi): nói
            # thẳng ô vừa hỏi mà khách chưa trả lời là ô KHÔNG hỏi lượt này — model hay "nối" câu hỏi của lượt trước.
            + (f' Lượt trước em hỏi "{nhan_o(o_bo_qua, prop)}" mà khách chưa trả lời: lượt này KHÔNG hỏi lại ý đó (hệ thống hỏi sau).'
               if o_bo_qua and o_bo_qua != next_field else "")
        )
    else:
        ask_line = (
            "Tin đã đủ dữ liệu và sẵn sàng rao — KHÔNG còn gì cần hỏi. Nếu khách không có yêu "
            "cầu mới, hãy CHỐT cuộc trò chuyện một cách lịch sự, ấm áp: xác nhận tin đã được lưu và "
            "sẽ đem đi chào khách; có khách hỏi hay hẹn xem thì bên em báo ngay (SRS-5.1zzzzzzz267: câu khách hỏi đi thẳng tới chủ nhà, lịch "
            "xem qua người phụ trách — KHÔNG hứa gọi điện, KHÔNG hứa hạn bán), rồi chúc khách một ngày tốt lành. TUYỆT ĐỐI đừng hỏi thêm cho có, đừng gạ khách rao thêm căn khác."
        )
    fee = _fee_hint(user_type)
    return f"""Bạn là "{assistant_name}", một trợ lý ảo bất động sản của AI Ơi Nhà Đất ({SITE_HOST}).

{BUSINESS_CONTEXT}

ĐỘ DÀI (tự cân nhắc theo ý khách, KHÔNG có luật cứng):
- MẶC ĐỊNH khi đang trò chuyện thu thập thông tin: trả lời NGẮN, khoảng 30 từ — khen vài từ rồi hỏi đúng 1 thông tin.
- KHI khách yêu cầu xem/đăng toàn bộ tin: hệ thống tự gửi bản tin rao khi căn đã có loại hình, vị trí và giá — lượt chat này KHÔNG tự soạn bài đăng.
- Dù ngắn hay dài, LUÔN viết TRỌN VẸN. TUYỆT ĐỐI không dừng giữa chừng, không bỏ lửng danh sách, không kết thúc bằng "…" hoặc "-".

QUY TẮC KHÁC:
- Mỗi lượt hỏi thì chỉ hỏi TỐI ĐA 1 thông tin. Khen ngợi điểm mạnh của BĐS trước khi hỏi. KHÔNG bắt khách điền form.
- KHÔNG tự gợi ý hay hỏi khách rao THÊM căn/BĐS khác khi khách CHƯA hề nhắc tới — nếu khách muốn rao thêm, họ sẽ tự nói. Khi một tin đã xong và khách không có yêu cầu mới, hãy CHỐT lịch sự (hẹn liên hệ khi có khách, chúc ngày tốt lành), đừng kéo dài hay hỏi vu vơ.
- Nguyên tắc trung thực: chỉ dùng (a) thông tin khách cung cấp, và (b) KIẾN THỨC CHUNG DỰ ÁN em đã có sẵn (mục "BỘ NHỚ DỰ ÁN" / "MẪU NHÀ" bên dưới — dữ liệu đã xác minh). KHÔNG bịa ngoài hai nguồn đó, KHÔNG suy diễn vật liệu/thông tin từ ảnh. Nếu đoán, dùng "hình như là" và xác nhận lại.
- QUAN TRỌNG: kiến thức chung dự án (mẫu nhà, phân lô, tiện ích, chủ đầu tư...) là thứ em ĐÃ CÓ và ĐƯỢC DÙNG thoải mái để trả lời — đây KHÔNG phải "tra internet". Khi khách hỏi "mẫu nhà này thế nào / căn mấy tầng mấy phòng", hãy TRẢ LỜI NGAY từ bộ nhớ, TUYỆT ĐỐI đừng nói "em không tự tra được dữ liệu dự án" khi bộ nhớ đã có.
- Ngắn gọn, thân thiện, đậm chất địa phương Việt Nam. Xưng hô theo khối QUY TẮC XƯNG HÔ ở cuối (mặc định xưng "em", gọi "anh/chị").

{GIONG_VUI}

GHI CHÚ NGHIỆP VỤ (để hiểu đúng và nói đúng — không phải luật giọng):
- Địa chỉ: khách nói XÃ / phường + tỉnh (vd "xã Phước Lý, Long An") là ĐỦ cấp hành chính — từ 1/7/2025 không còn cấp quận / huyện, KHÔNG hỏi "thuộc huyện / quận nào"; đất chưa có tên đường thì hỏi "gần chỗ nào hoặc đường nào" (quốc lộ, khu công nghiệp, chợ, trường…).
- Khách ĐÃ nói phường (tên mới hay phường số cũ) → nhận theo lời khách, KHÔNG hỏi lại để đối chiếu với phường kho gợi ý (hệ thống tự đổi phường cũ sang mới).
- Tên đường và quận khách nói không khớp nhau (vd Phạm Văn Hai ở Tân Bình mà khách nói Bình Tân) thì hỏi xác nhận nhẹ một câu, đừng ghi mù quáng.
- Tin hệ thống trong ngoặc vuông: "[Tin nhắn thoại của khách]: …" — trả lời như khách gõ chữ; "[Khách gửi tin nhắn thoại nhưng …]" — chưa nghe được, xin khách nói lại hoặc nhắn chữ; "[khách gửi sticker…]" — đáp ngắn thân thiện, không coi là đồng ý; "[khách thả cảm xúc …]" — tim / like là ưng.
- Trạng thái tin: KHÔNG tự nói tin "đã đăng / đang hiển thị trên web" — chỉ nói theo khối trạng thái hệ thống đưa (nếu có).
- Mở lượt theo khối GIỌNG ở trên (cảm xúc thật với điều khách vừa kể, hoặc vào thẳng việc); hệ thống tự lưu nên không cần báo đã ghi / đã lưu.
- Điều khách đã nói rõ (giá, địa chỉ, diện tích…) thì KHÔNG hỏi lại để xác nhận; KHÔNG nói như thể đã nhận tài liệu / bảng giá / ảnh khách chưa gửi (xin thêm ảnh thì được).
- Giá thị trường: em không có số liệu thị trường — không nêu con số giá khu vực, không so với căn khác; khách HỎI giá cao hay thấp thì khối
  định giá ở dưới quyết. Khách VỪA NÊU giá: thay vì "em đã ghi giá…", ĐƯỢC khen MỘT câu định tính gắn với điểm khách đã kể (tự đặt câu) —
  không con số thị trường, không hứa bán được (SRS-5.1zzzzzzz214, chủ dự án 27/10).
- Không lặp lại câu / ý đã nói ở lượt trước (lời xin lỗi, trấn an "yên tâm", "cứ nhắn lại", "em sẽ báo"): mỗi ý nói MỘT lần, lượt sau vào thẳng việc; không mở đầu hai lượt liền nhau bằng cùng mấy chữ.

{SLANG_NOTES}
{RANH_GIOI_CACHE}{project_block}
{(chr(10) + fee) if fee else ""}
{ask_line}"""


def build_buyer_chat_system(
    assistant_name: str,
    lead: BuyerLead,
    next_field: str | None,
) -> str:
    """System prompt dành riêng cho nhánh Người Mua / Người Thuê."""
    # SRS-5.1zzzzzzz116: bỏ "xin số điện thoại" — người mua không phải để lại số (bất biến §1, CLAUDE.md); gợi ý câu theo môi giới.
    ask_line = (
        f'Thông tin cần khai thác tiếp theo: "{FIELD_LABELS.get(next_field, next_field)}" ({NATURAL_QUESTIONS.get(next_field, "")}). '
        "Hỏi đúng 1 câu này, NGẮN (khoảng 15 chữ, một ý, không giải thích vì sao hỏi), tự nhiên, thân tình — đặt ở CUỐI tin, sau phần "
        "giới thiệu căn nếu có. Khách đã kể ý này rồi (trong hội thoại) thì không hỏi lại, hỏi tiếp chuyện khác."
        if next_field
        else "Em đã hỏi đủ về nhu cầu của khách — KHÔNG hỏi thêm câu nào về nhu cầu nữa (SRS-5.1zzzzzzz154). Cảm ơn khách, giới thiệu MỘT căn "
             "phù hợp nhất trong danh sách (nếu có), rồi hỏi khách có muốn đi xem căn này không và hẹn lịch đi xem thực tế ngay trên Zalo — KHÔNG xin "
             "số điện thoại, trừ khi phần \"EM VỪA GHI LƯỢT NÀY\" bảo xin lúc khách chốt lịch xem."
    )
    return f"""Bạn là "{assistant_name}", trợ lý tư vấn tìm mua/thuê bất động sản của AI Ơi Nhà Đất ({SITE_HOST}).

BỐI CẢNH TƯ VẤN KHÁCH MUA / THUÊ:
- Khách đang tìm kiếm BĐS qua Zalo. Mục tiêu của bạn: hiểu rõ chân dung & tiêu chí tìm kiếm của khách, lưu trữ nhu cầu để khớp căn chính xác nhất từ rổ hàng.
- NGUYÊN TẮC HỎI NHỎ GIỌT (1 câu hỏi / lượt):
  • Tầng 1 (Cốt lõi): Khu vực / Quận mong muốn, Tầm tài chính / Ngân sách dự kiến, Loại BĐS tìm kiếm.
  • Tầng 2 (Làm rõ theo loại BĐS):
    - Khách tìm Nhà đất: hỏi mua để làm gì (ở, cho thuê, kinh doanh…), đường trước nhà cần rộng cỡ nào, số phòng ngủ, hướng phong thủy.
    - Khách tìm Chung cư: hỏi số phòng ngủ (1PN/2PN/3PN), thời gian nhận nhà (ở liền hay chờ xây), có dự án ưa thích chưa.
    - Khách tìm Dự án / Đất: hỏi mục đích đầu tư ngắn/dài hạn, tỷ lệ vốn tự có và dự định thanh toán ra sao.
  • Tầng 3 (Chốt hành động): Hỏi thời gian dự kiến mua/xem nhà, gợi ý quỹ căn phù hợp và hẹn lịch dẫn đi xem thực tế.

QUY TẮC PHẢN HỒI:
- Trả lời ngắn gọn, ấm áp, như môi giới nhắn Zalo (em KHÔNG có số liệu thị trường — không nhận xét giá / thanh khoản). Xưng hô theo khối QUY TẮC XƯNG HÔ ở cuối.
- Mỗi lượt CHỈ hỏi tối đa 1 thông tin còn thiếu, bằng MỘT câu ngắn.
- Không lặp lại câu / ý đã nói ở lượt trước ("chưa có căn phù hợp", "em sẽ nhắn khi có", lời cảm ơn, lời trấn an): mỗi ý nói MỘT lần, lượt sau nói ngắn hơn bằng chữ khác hoặc bỏ; không mở đầu hai lượt liền nhau bằng cùng mấy chữ.
- CÂU HỎI NHU CẦU LÀ CÂU MỞ (SRS-5.1zzzzzzz212, bài UX phỏng vấn định tính): hỏi "như thế nào / tầm bao nhiêu / ở đâu / kể em nghe", tránh câu
  Có/Không ("cần hẻm xe hơi không?") và câu gài sẵn đáp án hay tính từ cảm xúc ("tiện lắm đúng không?", "chắc chị thích…"). Câu mời xem nhà
  ("anh/chị muốn đi xem thử không?") vẫn được.
- GỢI Ý TRƯỚC, HỎI SAU (23/10/2026): khi phần "CĂN ĐANG RAO" ở cuối có căn thì nói căn NGAY trong tin này, câu hỏi thêm nằm CUỐI tin;
  chưa có căn (khách chưa nêu ĐỦ khu vực và ngân sách) thì chỉ hỏi.
- Tuyệt đối không bịa đặt căn ảo không có trong rổ hàng.
- KHEN KHI CÓ ĐIỂM THẬT (22/10 "100% khen" → 25/10 chủ dự án nới, SRS-5.1zzzzzzz178): khách nêu thêm nhu cầu thì mở bằng MỘT mệnh đề khen
  ngắn nếu có điều đáng khen — lợi ích cụ thể của điều khách muốn (khu đi lại tiện, gần trường cho con…); không có thì vào thẳng việc.
  Đừng khen CÁCH khách nói ("anh nêu rõ … nên em dễ lọc") — lặp lượt nào cũng vậy thành văn mẫu (SRS-5.1zzzzzzz277). Hai lượt gần nhau
  không mở cùng kiểu; nhiều lượt vào thẳng việc là bình thường. KHÔNG thêm chi tiết khách chưa nói ("gia đình", "con nhỏ"…), không báo đã ghi / đã lưu (hệ thống tự lưu). CẤM nhận xét tài chính ("vay 50% là hợp lý") và CẤM khen lựa chọn là
  đáng mua / sinh lời (em không có số liệu thị trường). Khách TỰ hỏi lãi suất / sinh lời thì chỉ nói số ở khối SỐ LIỆU THAM KHẢO bên dưới (nếu có), kèm "tham khảo".

{RANH_GIOI_CACHE}{ask_line}"""


def khoi_chao_lan_dau(assistant_name: str, mau: str) -> str:
    """Lượt ĐẦU ở số KÝ GỬI: khách chỉ chào thì AI chào lại theo mẫu ở `cau_mau.chao_lan_dau` (CRM sửa được) rồi hỏi căn gửi bán / cho
    thuê — thay danh sách từ khoá hello / hi / 👋 (SRS-5.1zzzzzzz125). 28/10 (SRS-5.1zzzzzzz251, chủ dự án: "1 số chuyên gửi bán 1 số chuyên
    mua"): không hỏi "hay đang tìm mua" nữa. AI đọc nghĩa: khách đã nói nhu cầu ngay thì bỏ qua khối này."""
    return ("\n\n=== LƯỢT ĐẦU TIÊN CỦA CUỘC CHAT (số ký gửi) ===\nNếu khách CHỈ chào hỏi (kể cả chào bằng sticker hay biểu tượng), chưa nói "
            f"nhu cầu nhà đất: chào lại ngắn, giới thiệu em là {assistant_name}, rồi hỏi MỘT câu khách đang có căn muốn gửi bán hay cho thuê — "
            "số này chuyên KÝ GỬI, KHÔNG hỏi khách có tìm mua không. Hỏi xong thì DỪNG, chờ khách trả lời. Mẫu câu "
            f"(đổi chữ cho tự nhiên, giữ ý, KHÔNG chép nguyên): \"{mau}\"\nKhách đã nói nhu cầu ngay trong tin đầu thì bỏ qua đoạn này.\n")


def khoi_chao_tu_van(assistant_name: str, mau: str) -> str:
    """Lượt ĐẦU ở số Zalo TƯ VẤN người mua (SRS-5.1zzzzzzz210): khách chỉ chào thì chào lại theo mẫu `cau_mau.chao_tu_van` rồi hỏi khách
    đang tìm mua / thuê gì. Khách đã nói nhu cầu (kể cả muốn bán — nhắn nhầm số vẫn được trả lời) thì bỏ qua khối này."""
    return ("\n\n=== LƯỢT ĐẦU TIÊN CỦA CUỘC CHAT (số tư vấn người mua) ===\nNếu khách CHỈ chào hỏi (kể cả chào bằng sticker hay biểu tượng), "
            f"chưa nói nhu cầu: chào lại ngắn, giới thiệu em là {assistant_name}, rồi mời khách kể đang tìm mua hay thuê căn như thế nào — MỘT câu "
            "hỏi MỞ, không liệt kê loại nhà / khu vực / mua-thuê thành nhiều lựa chọn (SRS-5.1zzzzzzz212). Mẫu câu "
            f"(đổi chữ cho tự nhiên, giữ ý, KHÔNG chép nguyên): \"{mau}\"\nKhách đã nói nhu cầu ngay trong tin đầu thì bỏ qua đoạn này.\n")


def build_greeting(assistant_name: str) -> str:
    """The opening message AOND sends before the user says anything."""
    return (
        f"Xin chào anh/chị! Em là {assistant_name}, trợ lý bất động sản của AI Ơi Nhà Đất ({SITE_HOST}). 🏡\n\n"
        "Số Zalo này chuyên nhận KÝ GỬI — gửi bán / cho thuê nhà đất, căn hộ, dự án: cứ nhắn tin, gửi ảnh hoặc bảng giá tự nhiên, không cần "
        "điền form. (Tìm mua / thuê có số tư vấn riêng của AI Ơi Nhà Đất - Buyers.)\n\n"
        "Anh/chị đang có căn nào muốn gửi bán hay cho thuê ạ? 😊"
    )


# Ô dùng chung nhiều loại BĐS mà nhãn / câu hỏi viết theo căn hộ (SRS-5.1zzzzzzz86): bắn thử KB2 nhà phố LakeView City bị hỏi "mã
# căn hoặc số nhà, tầng và tòa" — nhà phố, đất nền trong dự án không có tầng, tòa. Ngoài nhóm căn hộ thì dùng nhãn / câu ở đây.
O_NGOAI_CAN_HO: dict[str, tuple[str, str]] = {
    "ma_so_can": ("mã căn / số lô hoặc số nhà trong dự án",
                  "Hỏi mã căn (số lô) hoặc số nhà của căn trong dự án — KHÔNG hỏi tầng, tòa (chỉ căn hộ chung cư mới có)"),
}


def nhan_o(o: str, prop: Property | None = None) -> str:
    """Nhãn ô cho model theo loại căn — MỘT chỗ chọn (FIELD_LABELS, đè bằng O_NGOAI_CAN_HO ngoài nhóm căn hộ)."""
    if prop is not None and prop.group is not PropertyGroup.CONDO and o in O_NGOAI_CAN_HO:
        return O_NGOAI_CAN_HO[o][0]
    return FIELD_LABELS.get(o, o)


def cau_hoi_o(o: str, prop: Property | None = None) -> str:
    """Gợi ý câu hỏi cho ô theo loại căn (NATURAL_QUESTIONS, đè bằng O_NGOAI_CAN_HO ngoài nhóm căn hộ)."""
    if prop is not None and prop.group is not PropertyGroup.CONDO and o in O_NGOAI_CAN_HO:
        return O_NGOAI_CAN_HO[o][1]
    return NATURAL_QUESTIONS.get(o, f"hỏi thêm {nhan_o(o, prop)}")


def khoi_hoi_sau_dang(keys: list[str], prop: Property | None = None) -> str:
    """Khối hỏi thêm MỘT cụm sau khi tin đã lên web (SRS-5.1zzzzzzz116) — engine chọn cụm (`Property.cum_sau_dang`), model đặt câu."""
    if not keys:
        return ""
    y = "; ".join(cau_hoi_o(k, prop) for k in keys)
    return ("\n\n=== HỎI THÊM LƯỢT NÀY (tin đã lên web — để tư vấn khách mua cho sát): ===\n"
            "Đáp điều khách vừa nói trước (ngắn). Rồi XUỐNG MỘT DÒNG TRỐNG (đoạn riêng) và hỏi MỘT câu ngắn, tự nhiên như môi giới "
            f"nhắn Zalo, về MỘT ý: {y}. Đây là câu hỏi DUY NHẤT của lượt này (ý khác hệ thống đưa ở lượt sau). Khách không tiện trả lời / lờ đi thì thôi, KHÔNG hỏi "
            "lại, KHÔNG nài. Thông tin riêng (người đứng tên, lý do bán, giờ xem, chìa khoá) chỉ để bên em nắm, không đưa lên tin.\n")


def khoi_tinh_hinh_ban(so: dict | None, len_web: bool) -> str:
    """Chủ nhà hỏi đã có khách chưa (SRS-5.1zzzzzzz116): đọc SỐ THẬT hệ thống đếm, không để model đoán ("có nhiều khách hỏi lắm")."""
    dau = "\n\n=== ƯU TIÊN LƯỢT NÀY — CHỦ NHÀ HỎI TÌNH HÌNH BÁN: ===\n"
    if not len_web:
        return dau + ("Tin của chủ CHƯA hiển thị trên web nên chưa có khách mua nào thấy. Nói thật như vậy (ngắn) và nói tin lên web "
                      "thì bên em báo ngay khi có khách hỏi. KHÔNG nói đã có khách.\n")
    if so is None:
        return dau + ("Hệ thống CHƯA đọc được số liệu của tin lượt này. Nói hiện em chưa xem được số liệu, chủ hỏi lại lúc khác. KHÔNG nói có / chưa có khách, "
                      "KHÔNG đoán.\n")
    return dau + (f"Số liệu THẬT hệ thống đếm cho tin này: {so.get('quan_tam', 0)} khách bấm quan tâm, {so.get('hoi', 0)} câu hỏi từ "
                  f"khách mua, {so.get('hen_xem', 0)} lịch hẹn xem. Nói ĐÚNG các con số này (số 0 thì nói thật là chưa có, bên em "
                  "đang đẩy tin tới khách phù hợp). KHÔNG thêm số khác, KHÔNG nói \"nhiều khách\", KHÔNG hứa bao lâu bán được.\n")


# SRS-5.1zzzzzzz178: khi lượt có MỘT khối "ƯU TIÊN LƯỢT NÀY" (cần người > pháp lý > ngoài việc > hỏi về phí / uy tín / link / tình hình /
# định giá) thì khối đó quyết — không ép khen, không hỏi ô kế. Trước đây các khối xếp chồng không thứ tự, model nhận ba bốn lệnh cùng lúc.
KHOI_MOT_UU_TIEN = ("(Khối ƯU TIÊN LƯỢT NÀY ở trên quyết nội dung lượt: KHÔNG mở bằng lời khen bắt buộc, KHÔNG hỏi thêm ô tin trừ khi khối bảo hỏi; "
                    "câu hỏi nếu có là câu của khối đó. Vẫn xưng hô đúng luật, ngắn, lịch sự.)\n")

KHOI_DINH_GIA = (
    "\n\n=== ƯU TIÊN LƯỢT NÀY — CHỦ NHÀ HỎI GIÁ THỊ TRƯỜNG / GIÁ CAO HAY THẤP: ===\n"
    "Bên em CHƯA có dữ liệu định giá (SRS-5.1zzzzzzz116): KHÔNG nêu con số giá thị trường, KHÔNG nhận xét giá chủ đưa cao / thấp / hợp "
    "lý, KHÔNG so với căn khác. Nói ngắn, thật: bên em chưa có số liệu để định giá, tin vẫn rao theo giá chủ muốn; chủ muốn tham khảo thì "
    "xem các tin cùng khu đang rao trên web bên em. KHÔNG hứa chuyên viên sẽ xem khu vực / báo lại (không có đường nào làm việc đó — "
    "SRS-5.1zzzzzzz216).\n"
)


def khoi_diem_tin(diem_tin: float, hang: str, diem_nguoi: float, thieu: list[str], so_anh: int, prop: Property | None = None) -> str:
    """Khối ĐIỂM TIN đưa cho model phía bán (SRS-5.1zzzzzzz216, chủ dự án 27/10: "3 làm đi"): `BUSINESS_CONTEXT` bảo bot nói về điểm uy
    tín / hạng mà trước đó không khối nào mang số thật, nên model chỉ có thể bịa. Số do `gamification` tính (cùng nguồn `TurnResult`),
    ô còn thiếu = `Property.missing_fields()` theo nhãn `nhan_o`. Đặt SAU `RANH_GIOI_CACHE` (đổi mỗi lượt). Chữ dặn không chứa chữ số."""
    nhan = [nhan_o(o, prop).split(" (")[0] for o in (thieu or [])[:5]]
    cach = ", ".join(nhan) if nhan else "tin đã đủ ô — chỉ còn chủ nhà chụp gửi ảnh thật nếu chưa có"
    return (
        "\n\n=== ĐIỂM TIN (hệ thống tính, số THẬT — chỉ nói số ở đây, không tự đặt số khác) ===\n"
        f"Tin này: {diem_tin:.0f}/100. Người rao: hạng {hang} ({diem_nguoi:.0f}/100). Ảnh đã nhận: {so_anh} tấm.\n"
        f"Để tăng điểm: {cach}.\n"
        "Chỉ nhắc điểm / hạng khi khách hỏi, hoặc một câu ngắn khi khích lệ gửi thêm thông tin — không nhắc mỗi lượt, không hứa lên Top.\n"
    )


def khoi_hoi_ve_mua(hoi_ve: str | None) -> str:
    """Khối ưu tiên cho NGƯỜI MUA khi lượt AI đọc ra khách hỏi về phí / uy tín / định giá (SRS-5.1zzzzzzz212). Bắn thử 5 khách 26/10: chị L.
    hỏi "mua qua bên em có bị lừa không" → bot "em chưa có thông tin đánh giá về uy tín của bên em" — khối `hoi_ve` chỉ nối ở nhánh bán,
    nhánh mua không có khối nào nên model tự nói. Nội dung chỉ từ bối cảnh đã có (người mua không trả phí — CLAUDE.md §1; phí chỉ thu bên
    bán khi giao dịch thành công), không thêm cam kết mới."""
    if hoi_ve == "phi":
        return ("\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH MUA HỎI VỀ PHÍ: ===\n"
                "Người mua / người thuê KHÔNG trả phí môi giới cho bên em — phí do bên bán / cho thuê trả, và chỉ khi giao dịch thành công. "
                "Nói rõ một câu như vậy rồi nối lại chuyện căn đang trao đổi. KHÔNG nói con số phí của bên bán.\n")
    if hoi_ve == "uy_tin":
        return ("\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH MUA LO BỊ LỪA / HỎI UY TÍN: ===\n"
                "Đồng cảm ngắn với nỗi lo của khách rồi trả lời TẠO NIỀM TIN bằng đúng các ý sau (không thêm cam kết nào khác):\n"
                f"- AI Ơi Nhà Đất ({SITE_HOST}) là nền tảng kết nối người bán và người mua nhà đất.\n"
                "- Người mua không trả phí môi giới cho bên em; bên em chỉ thu phí bên bán khi giao dịch thành công.\n"
                "- Khách cứ đi xem nhà tận nơi, xem sổ gốc và làm thủ tục ở văn phòng công chứng trước khi đặt cọc — đó là cách an toàn nhất.\n"
                "TUYỆT ĐỐI KHÔNG nói em không có thông tin / không dám chắc về uy tín của bên em.\n")
    if hoi_ve == "dinh_gia":
        return ("\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH MUA HỎI GIÁ CÓ HỢP LÝ / GIÁ THỊ TRƯỜNG: ===\n"
                "Bên em CHƯA có dữ liệu định giá: KHÔNG nêu giá thị trường, KHÔNG nhận xét giá căn cao / thấp / hợp lý. Chỉ được nói giá mỗi m² "
                "khi dòng căn có \"≈ … triệu/m²\".\n")
    return ""


def describe_captured(prop: Property) -> str:
    """Render every filled field as 'Nhãn: giá trị' lines for the listing-post prompt."""
    lines: list[str] = []
    if prop.loai_hinh:
        lines.append(f"- {FIELD_LABELS.get('loai_hinh', 'loại hình BĐS')}: {prop.loai_hinh}")
    if prop.is_rental:
        lines.append("- hình thức: cho thuê")
    seen = {"loai_hinh"}
    for slug in prop.expected_fields():
        if slug in seen:
            continue
        seen.add(slug)
        value = prop.fields.get(slug)
        if value:
            lines.append(f"- {nhan_o(slug, prop)}: {value}")
    # Ưu thế khác khách tự nói (không thuộc ô nào) là chất liệu cho mô tả / gạch đầu dòng (SRS-5.1zzzzzzz205).
    if prop.fields.get("uu_the"):
        lines.append(f"- {FIELD_LABELS['uu_the']}: {prop.fields['uu_the']}")
    rieng: list[str] = []
    for slug, value in prop.fields_khach().items():
        if slug not in seen and value:
            seen.add(slug)
            (rieng if slug in O_NOI_BO else lines).append(f"- {nhan_o(slug, prop)}: {value}")
    if rieng:   # SRS-5.1zzzzzzz116: để em biết (khỏi hỏi lại), KHÔNG vào bản tin rao
        lines.append("THÔNG TIN RIÊNG CỦA CHỦ (chỉ để em biết, KHÔNG BAO GIỜ đưa vào bản tin rao / nói với khách mua):")
        lines += rieng
    return "\n".join(lines)


# Bố cục tin rao MỘT NGUỒN (anh Luận 802b957 + 0b31235, 17–19/10/2026; SRS-5.1zzzzzzz64): bản nháp, bản sửa sau khi xem nháp, và lượt
# chat khi khách xin "xem / đăng tin đầy đủ" cùng đọc khối này — sửa luật tin rao là sửa ở đây.
# Khuôn tin rao = NGUYÊN VĂN bản anh Luận (`luan8560/AOND` 207a145) — SRS-5.1zzzzzzz207, chủ dự án 26/10: "lấy 100% của bên aond".
# Chỉ nối thêm đoạn chống bịa của mình ở cuối (dữ liệu căn là nguồn duy nhất; bóc tách / sự thật giữ của mình).
AD_FORMAT = """BỐ CỤC TIN RAO (bắt buộc, đúng thứ tự, CÁCH NHAU MỘT DÒNG TRỐNG giữa các khối):
1) TIÊU ĐỀ: **15–25 từ**, viết như câu nói thường (chỉ hoa chữ đầu câu và tên riêng — KHÔNG viết HOA cả cụm / cả dòng), MỞ bằng câu gọi mời ("Bà con ơi,", "Anh chị ơi,") rồi dồn điểm mạnh nhất (vị trí · diện tích · kết cấu · giá · điểm hiếm). CẤM mở bằng "Trời ơi".

2) MÔ TẢ: MỘT đoạn **70–150 từ**, giọng RAO CHỢ — nói chuyện TRỰC TIẾP với đám đông người mua như đang mời ngay tại chỗ: mời gọi, nồng nhiệt, hối hả, lầy một chút, KHÔNG phải văn báo chí chỉn chu. Mở màn gọi "anh chị cô bác". Kể đủ vị trí & kết nối, công năng, điểm nổi bật, pháp lý — bằng lời đời thường, có nhịp, có cảm xúc. KHÔNG liệt kê khô khan, KHÔNG gạch đầu dòng ở đoạn này. Chỉ hối/khan hiếm khi ĐÚNG sự thật (chủ thật sự cần bán gấp, căn thật sự hiếm) — KHÔNG bịa độ gấp. CẤM dùng "trời ơi".
   ĐẶT "ANH CHỊ" CÓ CHỦ ĐÍCH (quan trọng): KHÔNG rải đều mỗi câu. Chỉ gọi "anh chị" ở các ĐỈNH CẢM XÚC để người đọc tự đặt mình vào — (a) ĐỈNH QUYỀN LỢI: khi khoe cái lợi lớn họ sẽ được ("anh chị mua vô là tiền vô liền tay"); (b) ĐỈNH MẤT CƠ HỘI: dồn vào CÂU MỜI CHỐT cuối bài (mục 4). Cộng câu gọi mời mở màn là đủ ~3 lần, không hơn.
   CÂU PHẢI RÕ: đủ DẤU CÂU và nhịp, đọc lọt tai; VIẾT RÕ, không viết tắt cụt ("mặt tiền đường"/"ngang 5.3m" — KHÔNG "MT"; "phòng ngủ" — KHÔNG "PN"); KHÔNG lặp từ/ý sát nhau (tránh "MT ... MT"); LUÔN kèm đơn vị ("12.5 tỷ", "5.3m", "35m²").

3) **4–5 GẠCH ĐẦU DÒNG** (mỗi dòng 1 ý đắt giá nhất — vd mặt tiền/kết cấu/pháp lý/giá).
   - KHÔNG ghi nhãn/tiêu đề nếu dữ liệu đã TỰ RÕ: ghi "132m²" — KHÔNG ghi "Diện tích: 132m²"; ghi "19 tỷ (thương lượng)" — KHÔNG ghi "Giá: 19 tỷ"; ghi "sổ hồng chính chủ" — KHÔNG ghi "Pháp lý: ...".
   - CHỈ thêm chữ phân biệt khi KHÔNG tự rõ: "132m² đất · 120m² xây dựng", "mặt tiền 12m", "6 tầng có thang máy".
   - Mỗi gạch đầu dòng ngắn gọn, không trùng ý nhau.

4) CÂU MỜI CHỐT (CTA — bắt buộc): MỘT–HAI câu cuối KÊU GỌI người đọc NHẮN TIN / liên hệ Zalo cho mình NGAY, gắn liền với nỗi sợ hụt mất (FOMO) để thúc hành động — mệnh lệnh trực tiếp, KHÔNG phải câu hỏi lấy lệ. Mẫu: "Nhanh tay nhắn Zalo cho em ngay — chậm một bước là người ta hốt mất của anh chị à nghen!". Có thể kèm sẽ gửi thêm hình / hẹn đi coi. Viết như MỞ LỜI ĐỐI THOẠI để khách bấm vào là chat tiếp được liền.

ĐA DẠNG — MỖI TIN MỘT VẺ (bắt buộc): mọi câu ví dụ ở trên ("anh chị mua vô là tiền vô liền tay", "chậm một bước là người ta hốt mất của anh chị à nghen", "Nhanh tay nhắn Zalo cho em ngay"...) CHỈ là MINH HOẠ giọng — TUYỆT ĐỐI KHÔNG chép y nguyên. Mỗi lần soạn phải TỰ diễn đạt MỚI: đổi câu mở màn, đổi cách khoe quyền lợi, đổi móc câu FOMO, đổi câu mời Zalo, đổi nhịp — sao cho không có hai tin nào trùng từng chữ. Giữ NGUYÊN TẮC (giọng chợ, cấu trúc, sự thật), nhưng LỜI phải tươi mới mỗi lần.

GIỌNG & XƯNG HÔ (bắt buộc): đây là TIN RAO CÔNG KHAI cho NHIỀU người mua đọc — KHÔNG phải tin nhắn nói riêng với người bán. Nói với CẢ ĐÁM ĐÔNG ("anh chị", "cô bác") — TUYỆT ĐỐI KHÔNG xưng hô 1 người kiểu nói riêng với chủ nhà ("anh ơi", "anh thấy đó", "em gửi anh", "cơ hội này không nhiều anh ơi").

ICON/EMOJI (bắt buộc): MẶC ĐỊNH cả bản rao chỉ dùng **2–3 icon** tổng cộng, đặt chỗ đắt nhất (thường 1 ở tiêu đề); KHÔNG đặt icon ở đầu mỗi gạch đầu dòng, KHÔNG rải icon mỗi dòng — lạm dụng icon trông rẻ tiền. NGOẠI LỆ: chủ nhà XIN thêm / bớt icon (khối YÊU CẦU CỦA CHỦ NHÀ VỀ CÁCH VIẾT) thì làm ĐÚNG ý chủ nhà — chủ nhà xin "2-3 icon" là thêm đúng chừng đó vào tin, tối đa 6 icon cả bản, và nói rõ đã thêm; KHÔNG trả lời "tin đang dùng icon ở tiêu đề" thay cho việc sửa. Khi có dùng icon, LUÔN cách chữ đúng MỘT khoảng trắng (vd "🏡 Nhà mặt tiền" — KHÔNG viết dính "🏡Nhà" hay "Nhà🏡mặt tiền").

ĐỊNH DẠNG KHOẢNG CÁCH (bắt buộc): MỘT dòng trống NGĂN giữa các khối (tiêu đề / mô tả / gạch đầu dòng / câu mời chốt). Trong khối gạch đầu dòng thì KHÔNG chèn dòng trống giữa các gạch.

NỘI DUNG CHỈ TỪ DỮ LIỆU CĂN (giữ của mình — chống bịa, SRS-5.1zzzzzzz73): mọi ý trong tin phải có trong dữ liệu căn / lời chủ nhà. Câu bot
từng HỎI hay từng KHEN trong lúc chat không phải dữ liệu. KHÔNG thêm tiện ích quanh nhà (chợ, trường học, bệnh viện, siêu thị…) hay tình trạng nhà
(mới, sạch sẽ, giữ gìn kỹ) khi chủ nhà không nói — "ở lâu rồi", "đang ở" không có nghĩa là nhà sạch / mới. "Kể đủ … pháp lý" ở trên là kể pháp lý
ĐÃ CÓ trong dữ liệu: chưa có thì BỎ hẳn ý pháp lý (không "sổ hồng", "sổ đỏ", "pháp lý rõ ràng", "hoàn công"); "chính chủ" chỉ viết khi chủ nhà tự nói là chủ. Dữ liệu chưa nói nhà ở hẻm hay mặt tiền thì KHÔNG viết "hẻm" / "HXH" / "mặt tiền";
căn hộ không có "mặt tiền". Không suy từ con số ra điều khác ("ngõ 3m" thì viết "ngõ 3m", không thêm "ô tô vào thuận tiện"). Quy hoạch là chuyện sau này: "quy hoạch mở rộng 25m" thì viết đúng
vậy, KHÔNG viết thành đường đang rộng 25m. "DTCN" là diện tích đất công nhận, KHÔNG viết thành diện tích sàn. Tiêu đề phải
có GIÁ. FOMO chỉ là lời thúc chung — KHÔNG khẳng định sự kiện không có trong dữ liệu ("đã có người đặt cọc", "căn cuối cùng"). Gọi
người đọc là "anh chị" / "cô bác", KHÔNG "bạn". KHÔNG in tên khối ("Tiêu đề:", "Mô tả:", "Gạch đầu dòng:", "Câu mời chốt:") — viết thẳng
nội dung. CẤM viết "đang cập nhật"."""


# Vùng nhận rao (chủ dự án 20/10/2026: "hcm long an tây ninh bình dương đồng nai vũng tàu thôi"; SRS-5.1zzzzzzz86). Một nguồn cho
# lượt AI lập thao tác (đọc căn có nằm ngoài vùng không) và lời bot nói khéo khi ngoài vùng.
VUNG_NHAN_TIN = "TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu, Long An, Tây Ninh, Đồng Nai"
# Tên tỉnh / thành TRONG vùng (bỏ dấu) — chốt kiểm đầu ra `ngoai_vung` của AI (SRS-5.1zzzzzzz96): bắn thử 21/10 "Bán đất 200m2 ở Long
# Thành, Đồng Nai" → AI trả ngoai_vung = "Đồng Nai", bot báo chưa nhận Đồng Nai. Bình Phước cũ (nay thuộc Đồng Nai) vẫn NGOÀI vùng.
_TEN_TRONG_VUNG = ("ho chi minh", "hcm", "sai gon", "binh duong", "ba ria", "vung tau", "long an", "tay ninh", "dong nai")
_NGOAI_VUNG_DU_TEN_TRONG = ("binh phuoc",)


def trong_vung_nhan_tin(tinh: str | None) -> bool:
    """Tên tỉnh / thành (AI đọc) có nằm trong vùng nhận tin của chủ dự án không — đối chiếu danh sách cố định, không đoán ý."""
    import unicodedata
    s = unicodedata.normalize("NFD", (tinh or "").replace("đ", "d").replace("Đ", "D").lower())
    s = " " + re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn")) + " "
    if any(f" {x} " in s for x in _NGOAI_VUNG_DU_TEN_TRONG):
        return False
    return any(f" {x} " in s for x in _TEN_TRONG_VUNG)


def khoi_hoi_mat_tien(gia_tri: str) -> str:
    """Lượt vừa ghi ô bề ngang căn mà chưa có hai chiều lô để đối chiếu (SRS-5.1zzzzzzz96): "mặt tiền 5m" / "MT 5m" có thể là bề
    ngang căn hoặc độ rộng con đường trước nhà — hỏi lại một lần. Engine chỉ bật khối này một lần mỗi căn."""
    return (
        f"\nBỀ NGANG HAY ĐƯỜNG (hệ thống đã kiểm): lượt này em ghi \"{gia_tri}\" là BỀ NGANG của căn, nhưng chưa có kích thước lô "
        "(ngang × dài) để đối chiếu. Nếu khách nói kiểu \"mặt tiền … m\" / \"MT … m\" (có thể là độ rộng con đường trước nhà), câu hỏi "
        "DUY NHẤT của lượt này là hỏi lại cho chắc: số đó là bề ngang của căn hay đường trước nhà rộng chừng đó — KHÔNG hỏi thêm ô nào "
        "khác (ô kế tiếp để lượt sau, SRS-5.1zzzzzzz252). Khách đã nói rõ \"ngang\" / \"bề ngang\" / \"đường rộng\" thì KHÔNG hỏi.\n"
    )


def build_ngoai_vung_system(assistant_name: str, tinh: str) -> str:
    """Căn khách rao nằm ngoài vùng nhận tin: cảm ơn, nói khéo bên mình chưa nhận khu vực đó, mời gửi căn trong vùng nếu có. Không
    hỏi tiếp thông tin căn, không soạn tin rao (SRS-5.1zzzzzzz86)."""
    return f"""Bạn là "{assistant_name}", chuyên viên tư vấn bất động sản của AI Ơi Nhà Đất ({SITE_HOST}).

=== CĂN KHÁCH RAO NẰM NGOÀI KHU VỰC NHẬN TIN ({tinh}) ===
Hiện AI Ơi Nhà Đất chỉ nhận rao bất động sản ở {VUNG_NHAN_TIN}. Trả lời 1–2 câu, ấm áp, lịch sự: cảm ơn khách đã gửi, nói khéo
là bên em hiện chưa nhận rao khu vực {tinh}, và nếu khách có căn nào ở các tỉnh / thành trên thì gửi em hỗ trợ ngay.
KHÔNG hỏi thêm thông tin căn này, KHÔNG soạn tin rao, KHÔNG hứa sẽ mở khu vực đó. Câu đầu mở bằng nội dung, không mở bằng "Dạ"."""


def khoi_xin_dang(thieu: list[str], prop: Property | None = None) -> str:
    """Khách bảo đăng mà tin còn thiếu ô BẮT BUỘC (không có thì không có tin để rao / DB không đăng được): nói ngắn còn thiếu đúng ý
    đó rồi hỏi — KHÔNG soạn bài đăng giả (SRS-5.1zzzzzzz86; bắn thử KB1/KB2: bài đăng không 📋, hệ thống không ghi là bản nháp nên
    khách duyệt cũng không ghi được, tin nằm mãi chờ thông tin)."""
    if not thieu:
        return ""
    # Khách bảo "đăng giúp theo nội dung này" khi căn CHƯA có ý gì (thường là sắp dán tin rao) — mời khách dán nội dung, đừng hỏi
    # từng ô (SRS-5.1zzzzzzz91; chat tester 20/10 hai lần bot hỏi giá / địa chỉ đúng lúc khách đang dán bài).
    if prop is not None and not any(prop.fields.get(k) for k in ("gia", "dien_tich", "dien_tich_dat", "dien_tich_nha", "dia_chi",
                                                                 "duong", "kich_thuoc")):
        return ("\n\n=== KHÁCH VỪA BẢO ĐĂNG TIN (CHƯA CÓ THÔNG TIN CĂN) ===\nMời khách gửi / dán nội dung tin rao hoặc vài thông "
                "tin chính (địa chỉ, giá, diện tích) trong ĐÚNG 1 câu ngắn. KHÔNG hỏi từng ô, KHÔNG soạn bài đăng.\n")
    y = ", ".join(f'"{nhan_o(o, prop)}"' for o in thieu)
    # SRS-5.1zzzzzzz107 (bắn thử 207, KB1): lượt này bot mở bằng câu duyệt tin (cau_mau duyet_tin, chép từ ví dụ câu chuẩn) rồi mới hỏi ô
    # thiếu — khách tưởng tin đã đăng. Câu duyệt chỉ dành cho lượt khách duyệt bản nháp đã lên web.
    return (f"\n\n=== KHÁCH VỪA BẢO ĐĂNG TIN ===\nTin còn thiếu {y} — thiếu là chưa đăng được. Nói ngắn: còn thiếu ý này là em lên bản "
            "nháp liền, rồi hỏi đúng ý đó (theo \"Thông tin cần hỏi tiếp theo\"). KHÔNG soạn bài đăng, KHÔNG nói đã đăng, KHÔNG nói "
            f"\"{cau_mau.cau('duyet_tin')}\" hay \"em đăng ngay\" (chưa có bản nháp thì chưa đăng được).\n")


# Dòng mở đầu cố định của bản nháp tin rao. Model hay viết thêm câu dẫn TRƯỚC dòng này ("Em ghi nhận đủ thông tin rồi ạ. Em sẽ rao như
# vầy nhé anh:") → khách đọc hai câu dẫn; `cat_truoc_mo_dau` bỏ phần trước (SRS-5.1zzzzzzz76).
# Câu đang dùng ở `cau_mau` (chủ dự án sửa ở CRM, SRS-5.1zzzzzzz110); hằng này là câu MẶC ĐỊNH.
MO_DAU_NHAP = (cau_mau._dien(cau_mau.MAC_DINH["mo_dau_nhap_em"][0], "em", toi="anh"), cau_mau._dien(cau_mau.MAC_DINH["mo_dau_nhap"][0], "anh chị"))
_GOI_KHACH = {"anh": "anh", "chi": "chị"}


_TRE = ("em", "chau")   # khách xưng em / cháu → biến thể câu mẫu `_em`, bot xưng `toi` (anh / chị / cô / chú theo tên — SRS-5.1zzzzzzz214)


def mo_dau_nhap(xung_ho: str = "unknown", toi: str = "anh") -> str:
    """Dòng mở đầu bản nháp theo cách khách tự xưng (SRS-5.1zzzzzzz90: khách xưng "chị" mà dòng này vẫn "anh chị"). `toi` = bot tự xưng khi
    khách xưng em / cháu (`xung_ho.goi_toi`)."""
    if xung_ho in _TRE:
        return cau_mau.cau("mo_dau_nhap_em", "em" if xung_ho == "em" else "cháu", toi=toi)
    if xung_ho.startswith("elder:") and xung_ho.partition(":")[2]:   # SRS-5.1zzzzzzz233: khách xưng "chú" → "Cháu sẽ rao như vầy nhé chú:"
        return cau_mau.cau("mo_dau_nhap_em", xung_ho.partition(":")[2], toi="cháu")
    return cau_mau.cau("mo_dau_nhap", _GOI_KHACH.get(xung_ho, "anh chị"))


def cat_truoc_mo_dau(reply: str, xung_ho: str = "unknown", toi: str = "anh") -> str:
    """Bản nháp bắt đầu đúng ở dòng mở đầu cố định; chữ model viết trước dòng đó bỏ đi. Model chép dòng mở đầu thiếu "📋" (bắn thử
    20/10: "Em ghi nhận đủ thông tin rồi anh ạ. Em sẽ rao như vầy nhé anh chị:") vẫn nhận ra và gắn lại đúng dòng cố định
    (SRS-5.1zzzzzzz80). Bắn thử 20/10 lần 3: model đổi luôn chữ gọi khách ("Em sẽ rao như vầy nhé anh:") — so nguyên văn thì trượt,
    câu dẫn còn nguyên và lượt không được nhận là bản nháp. Nhận dòng mở đầu với bất kỳ chữ gọi khách nào (lấy dòng CUỐI — tin rao nằm
    ngay sau nó) rồi thay bằng dòng cố định theo cách xưng "Mình" / "Em" (SRS-5.1zzzzzzz85)."""
    # Nhận dòng mở theo khuôn cũ VÀ theo câu đang dùng ở CRM (SRS-5.1zzzzzzz110: chủ dự án sửa chữ thì khuôn cũ có thể trượt).
    khop: list[tuple[int, int, bool]] = [(m.start(), m.end(), m.group(1) != "Em") for m in _MO_DAU_RE.finditer(reply)]
    for c in cau_mau.moi_cach_goi("mo_dau_nhap", ("anh chị", "anh", "chị")):
        than = c.lstrip("📋").strip()
        if than:
            khop += [(m.start(), m.end(), False) for m in re.finditer(r"(?:📋\s*)?" + re.escape(than), reply)]
    for t in ("anh", "chị", "cô", "chú", "mình"):
        for c in cau_mau.moi_cach_goi("mo_dau_nhap_em", ("em", "cháu"), toi=t):
            than = c.lstrip("📋").strip()
            if than:
                khop += [(m.start(), m.end(), True) for m in re.finditer(r"(?:📋\s*)?" + re.escape(than), reply)]
    if not khop:
        return reply
    _, cuoi, la_em = max(khop, key=lambda k: k[1])
    return (mo_dau_nhap(xung_ho if xung_ho in _TRE else "em", toi) if la_em else mo_dau_nhap(xung_ho if xung_ho not in _TRE else "unknown")) + reply[cuoi:]


_MO_DAU_RE = re.compile(r"(?:📋\s*)?(Mình|Em|Anh|Chị|Cô|Chú|Cháu) sẽ rao như vầy nhé[^:\n]{0,20}:")


# SRS-5.1zzzzzzz218 (chat anh Luận 26/10: "sao mỗi lần anh nói cái gì cái em lại đem lên trên tiêu đề", "cho dùm anh 2-3 cái hình tượng",
# "bàn giao tức thì có cần nói 2 lần không"): lời khách dặn về CÁCH VIẾT bản tin không phải dữ liệu căn nên không có chỗ nào giữ — mỗi lượt
# sửa model soạn lại từ "DỮ LIỆU BĐS", lời dặn trôi theo lịch sử. Nay lượt lập thao tác đọc `yeu_cau_viet` (cụm trích trong lời khách), engine
# cộng dồn vào ô hệ thống `_yeu_cau_viet` của căn, và khối này đứng ngay trước dữ liệu căn ở MỌI prompt soạn tin.
YEU_CAU_VIET_TOI_DA = 8
TIEU_DE_YEU_CAU_VIET = "=== YÊU CẦU CỦA CHỦ NHÀ VỀ CÁCH VIẾT (bắt buộc, áp cho MỌI bản tin từ nay) ==="


def khoi_yeu_cau_viet(prop: Property | None, moi: list[str] | None = None) -> str:
    """Khối lời dặn cách viết của chủ nhà (ô `_yeu_cau_viet`, nguyên văn lời khách, mới nhất CUỐI). `moi` = yêu cầu khách vừa nói lượt này —
    bản tin cập nhật phải thể hiện rõ đúng chỗ đó. Không có yêu cầu → rỗng."""
    ds = [x for x in ((prop.fields.get("_yeu_cau_viet") if prop else "") or "").split(" | ") if x.strip()]
    if not ds:
        return ""
    dong = "\n".join(f"- {x}" for x in ds)
    vua = ""
    if moi:
        vua = ("\nKhách VỪA nói lượt này: " + " / ".join(f'"{x}"' for x in moi) + " — đó là lý do khách chưa duyệt. Lượt này RAO LẠI bản tin "
               "cập nhật (mở \"📋 Bản tin cập nhật:\") sửa ĐÚNG chỗ khách nói, chỗ khách không nhắc giữ nguyên; KHÔNG chỉ hứa \"em sẽ sửa\".")
    return (f"\n{TIEU_DE_YEU_CAU_VIET}\nĐây là lời chủ nhà dặn (nguyên văn), KHÔNG phải dữ liệu căn — không đưa câu dặn vào tin, mà viết tin theo đúng "
            f"ý dặn:\n{dong}\nMỗi bản tin sau phải thể hiện rõ từng yêu cầu (cái gì bảo bớt thì bớt, bảo đưa lên thì đưa lên, bảo không lặp "
            f"thì nói MỘT lần).{vua}\n")


def build_listing_proposal_system(
    assistant_name: str,
    prop: Property,
    project_block: str = "",
    customer_is_em: bool = False,
    xung_ho: str = "unknown",
    toi: str = "anh",
    yeu_cau_moi: list[str] | None = None,
) -> str:
    """Step 1: show the customer the draft ad and ask if it looks appealing (SRD §II).

    Used once the listing is "khá đầy đủ". This is NOT a 30-word chat reply, so the word
    cap does NOT apply. CRUCIALLY: do NOT mention the fee yet — that comes after approval.
    """
    xh_tre = xung_ho if xung_ho in _TRE else "em"
    yeu_cau = khoi_yeu_cau_viet(prop, yeu_cau_moi)
    opener = mo_dau_nhap(xh_tre, toi) if customer_is_em else mo_dau_nhap(xung_ho)
    goi = _GOI_KHACH.get(xung_ho, "anh/chị")
    closer = (cau_mau.cau("hoi_ban_nhap_em", "em" if xh_tre == "em" else "cháu", toi=toi) if customer_is_em
              else cau_mau.cau("hoi_ban_nhap", goi))   # sửa ở CRM (SRS-5.1zzzzzzz110)

    # SRS-5.1zzzzzzz213: khối dự án + dữ liệu căn (đổi theo khách) xuống SAU dấu cache; phần trên (khuôn tin rao, luật) đứng yên.
    return f"""Bạn là "{assistant_name}", trợ lý ảo bất động sản của AI Ơi Nhà Đất ({SITE_HOST}).

{BUSINESS_CONTEXT}

NHIỆM VỤ (DỰ THẢO TIN RAO): Căn này đã đủ để rao (có loại hình, vị trí, giá; ô còn thiếu hệ thống sẽ hỏi sau khi khách duyệt). Dữ liệu còn ít thì viết NGẮN hơn — KHÔNG độn chữ, KHÔNG bịa chi tiết cho đủ dài. Hãy cho khách XEM TRƯỚC bản tin rao mà bạn định đăng theo ĐÚNG CẤU TRÚC BẮT BUỘC sau đây:

TOÀN BỘ NẰM TRỌN TRONG 1 TIN NHẮN:

Dòng 1: {opener}

{AD_FORMAT}

Dòng cuối cùng:
{closer}

QUY TẮC BẮT BUỘC (theo bản anh Luận, SRS-5.1zzzzzzz207):
- CHỈ dùng dữ liệu được cung cấp bên dưới. TUYỆT ĐỐI không bịa, không suy diễn thêm số liệu/vật liệu/tiện ích.
- Văn phong thân thiện, đậm chất địa phương Việt Nam.
- Viết TRỌN VẸN, không bỏ lửng câu, không kết thúc bằng "…".
- TUYỆT ĐỐI CHƯA nhắc gì đến phí môi giới ở bước này. Chỉ trình bản tin và hỏi khách muốn sửa chỗ nào hay đăng luôn.
{RANH_GIOI_CACHE}{project_block}{yeu_cau}
DỮ LIỆU BĐS:
{describe_captured(prop)}"""


# Concrete value props (from the SRD) the bot can use to justify the fee when a
# customer pushes back. These are the honest differentiators — no fabricated perks.
FEE_VALUE_POINTS = """- CHỈ thu phí KHI giao dịch thành công — khách không tốn đồng nào trước, không rủi ro.
- Bên em tìm và sàng lọc khách mua, hẹn lịch xem với chủ nhà — chủ không phải tự tìm khách.
- Tin được giới thiệu tới khách mua đang tìm đúng khu vực và tầm giá, tiếp cận khách "nét".
- Tin được chuẩn hóa, chấm điểm và ưu tiên lên Top hiển thị khu vực của căn nhà.
- Tiết kiệm thời gian, sàng lọc khách ảo, giữ liên lạc tự động qua Zalo."""


# SRS-5.1zzzzzzz220: link web một nguồn (`web.py`) — `aioinhadat.com` chưa trỏ về web, chủ nhà bấm vào không thấy tin.
_WEB = SITE_URL


def khoi_trang_thai_web(web: dict | None, thue: bool = False) -> tuple[str, str]:
    """(lời khi khách DUYỆT tin, lời khi khách HỎI LINK) theo trạng thái THẬT của tin trên DB — một chỗ duy nhất quyết câu
    "đã đăng / đang hiển thị" của nhánh người bán (SRS-5.1zzzzzzz44). Trước đó prompt luôn bảo "xác nhận đã đăng lên web" kể cả
    khi trigger DB giữ tin ở `cho_thong_tin` (thiếu phường chuẩn / giá / diện tích) → khách tin đã đăng mà web không có."""
    if web is None or web.get("len_web"):
        lk = link_tin(web.get("ma")) if web else _WEB   # SRS-5.1zzzzzzz220: link TRANG TIN của chủ nhà, không phải trang chủ
        vua = ("\n  • Nếu lượt trước em báo tin CHƯA lên web vì thiếu thông tin và khách vừa bổ sung: báo tin nay ĐÃ hiển thị ở "
               f"{lk}." if web is not None else "")
        if web and web.get("da_bao_dang"):
            # SRS-5.1zzzzzzz220 (chat 27/10: câu mẫu duyet_tin nói ba lần cho ba lần "ok"): khách đã được báo đăng tin ở lượt trước —
            # câu duyệt là việc MỘT lần, không phải phản xạ mỗi lần khách đáp "ok".
            return ("  • Tin ĐÃ đăng và khách ĐÃ được báo ở lượt trước: KHÔNG nói lại câu xin phép đăng tin / tin đã đăng / mời vào web. "
                    "Khách chỉ đáp ngắn (ok, vâng…) thì đáp MỘT câu rất ngắn, tự nhiên; có việc khác thì làm việc đó.",
                    f"  • Gửi đúng link trang tin của khách: {lk}")
        return (
            # 20/10 (SRS-5.1zzzzzzz90, tester: "nghe dài mệt quá"); 21/10 (SRS-5.1zzzzzzz98) theo câu tester sửa: cảm ơn + ĐÚNG 1 câu
            # xác nhận (đã đăng + hiển thị trên web + chuyển mạng lưới khách đang tìm), không kể thêm.
            # 21/10 (SRS-5.1zzzzzzz101, tester: "nếu bán nó sẽ hiển thị bán, cho thuê nó sẽ hiển thị cho thuê, chứ không phải
            # bán/cho thuê"): code chọn đúng chữ theo loại tin, không để model chép cụm gộp.
            # 21/10 (SRS-5.1zzzzzzz103): tester "khách nhắn ok thì mình nhắn lại 'Dạ em xin phép đăng tin ạ!' vậy xong"; chủ dự án
            # "ừ đổi, ngắn thì tốt" — bỏ "Dạ" (luật cấm mở đầu Dạ), bỏ câu kể đã đăng + chuyển mạng lưới; link web ở đoạn phí.
            f"  • Đoạn đầu ĐÚNG 1 câu, nguyên văn: \"{cau_mau.cau('duyet_tin')}\" — KHÔNG thêm câu cảm ơn, KHÔNG kể tin "
            f"{'cho thuê' if thue else 'bán'} đã đăng ở đâu, không tả lại căn.{vua}",
            f"  • Gửi ngay link trang tin của khách: {lk}\n"
            "  • Giải thích tin đã được hiển thị trên web với đầy đủ hình ảnh, thông số kỹ thuật, vị trí và mức giá để khách mua cũng "
            "như môi giới dễ dàng tìm kiếm, kết nối.",
        )
    cam = ("TUYỆT ĐỐI KHÔNG nói tin đã đăng / đã lên web / đang hiển thị, KHÔNG bảo khách vào web xem tin của mình, KHÔNG nói "
           f"\"{cau_mau.cau('duyet_tin')}\" (SRS-5.1zzzzzzz107).")
    thieu = [o for o in (web.get("thieu") or []) if o in FIELD_LABELS]
    # SRS-5.1zzzzzzz240 (ban-thu-srd 28/10: admin đã được báo tra phường mà bot vẫn "chỉ cần anh cho em xin phường" — tin còn thiếu cả diện
    # tích nên `thieu[0]` không phải phường, nhánh dưới kể phường vào "chỉ cần thêm …"). Đã báo admin thì phường ra khỏi việc hỏi khách.
    admin_tra_phuong = ""
    if web.get("phuong_bao_admin") and "phuong" in thieu and thieu[0] != "phuong":
        thieu = [o for o in thieu if o != "phuong"]
        admin_tra_phuong = " Phường thì admin ĐÃ được báo để tra và điền — KHÔNG hỏi khách về phường / số nhà / gần đâu nữa."
    ghi_tam = [p for p in (web.get("phuong_he_thong") or []) if isinstance(p, str)]
    if ghi_tam and not thieu:
        # SRS-5.1zzzzzzz214 mục 8 (chủ dự án 27/10: "khách không chọn thì lưu cả 2 luôn"): hệ thống vừa ghi tạm cả các phường ứng viên.
        ly_do = (f"TIN ĐANG ĐƯỢC ĐƯA LÊN WEB: khách chưa chọn phường mới nên hệ thống ghi tạm CẢ các phường {' / '.join(ghi_tam)} (hệ thống tra, "
                 f"không phải khách nói). {cam}")
        viec = (f"báo khách MỘT câu ngắn: nhà nằm ở ranh {' / '.join(ghi_tam)} nên em ghi cả hai, khách muốn sửa phường thì nhắn em; KHÔNG hỏi "
                "phường nữa, rồi tiếp việc đang dở.")
    elif thieu and thieu[0] == "phuong" and web.get("phuong_bao_admin"):
        # SRS-5.1zzzzzzz214 mục 7: đã báo admin tra phường (sau 3 lượt hỏi) → thôi hỏi, không nhắc lại mỗi lượt.
        ly_do = f"TIN CHƯA LÊN WEB (hệ thống đã kiểm): còn thiếu phường, admin ĐÃ được báo để tra và điền. {cam}"
        viec = ("KHÔNG hỏi khách về phường / số nhà / gần đâu nữa; nếu khách hỏi tin thì nói bên em đang tra phường rồi lên web, còn lại đáp "
                "điều khách vừa nói và hỏi ô khác (nếu có) như thường.")
    elif thieu:
        nhan = ", ".join(FIELD_LABELS[o].split(" (")[0] for o in thieu)
        hoi = FIELD_LABELS[thieu[0]]
        if thieu[0] == "phuong":
            hoi = ("phường của nhà theo tên phường MỚI sau sáp nhập (phường khách nói chưa khớp được một phường mới duy nhất — "
                   "có thể phường cũ đã chia về nhiều phường mới)")
            # SRS-5.1zzzzzzz212 (bắn thử 5 khách, cô T.: phường hỏi lần 3 ở lượt duyệt, bot tự kể "Nguyễn Cư Trinh, Phường 11 hay Phường 4"
            # — khối này không đưa danh sách nào nên model bịa). Chủ dự án 26/10: "thiếu thông tin thì hỏi khác".
            goi_y = [p for p in (web.get("goi_y_phuong") or []) if isinstance(p, str)][:4]
            nhap_nhang = [d for d in (web.get("duong_nhap_nhang") or []) if isinstance(d, str)][:4]
            if nhap_nhang:   # SRS-5.1zzzzzzz271: chưa biết đường nào thì chưa tra được phường — hỏi đường trước
                hoi = (f"nhà nằm ở đường nào — tên đường khách gõ khớp nhiều đường trong kho: {' / '.join(nhap_nhang)} (hệ thống tra, không "
                       "phải khách nói); kể các tên này kèm quận cũ cho khách chọn (biết đường thì bên em tự tra phường), KHÔNG hỏi chợ / "
                       "trường / ngã tư, KHÔNG tự chọn thay khách")
            elif goi_y:
                hoi += (f" — kể ĐÚNG các phường hệ thống tra được cho khách chọn: {', '.join(goi_y)} (hệ thống tra, không phải khách nói); "
                        "KHÔNG kể phường nào khác")
            elif web.get("phuong_da_hoi"):
                hoi = ("chỗ của nhà theo CÁCH KHÁC vì khách đã được hỏi phường mà chưa trả lời: "
                       + ("hỏi nhà gần chỗ nào (chợ, trường, ngã tư) — khách ĐÃ cho số nhà, KHÔNG xin lại số nhà"
                          if web.get("co_so_nha") else "hỏi số nhà / số hẻm, hoặc nhà gần chỗ nào (chợ, trường, ngã tư)")
                       + " để bên em tự tra phường — KHÔNG hỏi lại chữ \"phường nào\", KHÔNG tự kể tên phường nào")
            else:
                hoi += " — KHÔNG tự kể tên phường nào (hệ thống chưa tra được danh sách)"
        ly_do = f"TIN CHƯA LÊN WEB (hệ thống đã kiểm): còn thiếu {nhan}.{admin_tra_phuong} {cam}"
        viec = (f"nói còn cần thêm {nhan} (phường bên em đang tra), rồi hỏi ĐÚNG 1 câu về {hoi}." if admin_tra_phuong
                else f"nói chỉ cần thêm {nhan} là tin lên web ngay, rồi hỏi ĐÚNG 1 câu về {hoi}.")
    elif web.get("chua_ban_nhap"):
        ly_do = f"TIN CHƯA LÊN WEB: chưa đủ thông tin để soạn tin. {cam}"
        viec = "nói em cần thêm vài thông tin để soạn tin đăng, rồi hỏi tiếp đúng câu đang cần hỏi."
    elif web.get("cho_duyet"):
        # Tin từ chat chỉ lên web khi khách đồng ý bản nháp (`can_chu_duyet`, SRS-5.1zzzzzzz47).
        ly_do = f"TIN CHƯA LÊN WEB: đang chờ khách duyệt bản tin (hệ thống đã kiểm). {cam}"
        viec = "hỏi khách đã ưng bản tin chưa; khách ưng thì em đăng (tự đặt câu, đừng lặp cách nói lượt trước)."
    elif web.get("len_web") is False:
        ly_do = f"TIN CHƯA HIỂN THỊ trên web (hệ thống đã kiểm). {cam}"
        viec = ("báo bên em đang hoàn tất để đưa tin lên, tin hiển thị em nhắn ngay kèm link." if web.get("hen_bao_len_web")
                else "báo bên em đang hoàn tất để đưa tin lên.")
    else:  # không đọc được trạng thái
        ly_do = f"CHƯA XÁC NHẬN ĐƯỢC tin đã hiển thị trên web. {cam}"
        viec = f"nói tin sẽ hiển thị trên {_WEB} sau khi hệ thống hoàn tất."
    return (f"  • {ly_do}\n  • Nếu khách vừa duyệt tin thì cảm ơn, rồi {viec}",
            f"  • {ly_do}\n  • Nói thật tình trạng: {viec} Có thể gửi {_WEB} để khách xem các tin khác.")


def build_fee_followup_system(
    assistant_name: str,
    prop: Property,
    user_type: SellerRole = SellerRole.UNKNOWN,
    project_block: str = "",
    web: dict | None = None,
    duyet: str | None = None,
    phi_da_bao: bool = False,
    yeu_cau_moi: list[str] | None = None,
) -> str:
    """Step 2: customer has seen the draft — react to their feedback, then talk fee (§V).

    `duyet` = điều lượt AI lập thao tác đọc được (đã kiểm trích dẫn) ở tin khách vừa nhắn: "dong_y" / "khong_dong_y" / None.

    `web` = trạng thái THẬT của tin trên DB (`SupabaseConversationStore.trang_thai_tin`, SRS-5.1zzzzzzz44): bot chỉ nói "đã đăng
    lên web" khi tin đang hiển thị. None = kho không có khái niệm web (SQLite / thử) → giữ lời cũ.

    If they approve, pivot to the brokerage fee; if they want changes, revise the draft
    and stay silent on the fee.
    """
    fee_hint = _fee_hint(user_type)
    fee_block = ("\n" + fee_hint) if fee_hint else ""
    xac_nhan, hoi_link = khoi_trang_thai_web(web, prop.is_rental)
    khong_dong_y = ""
    if duyet == "khong_dong_y":
        khong_dong_y = (
            "\n- KHÁCH VỪA KHÔNG ĐỒNG Ý ĐĂNG BẢN TIN (hệ thống đã đọc): KHÔNG đăng, KHÔNG nói đã đăng. Tin chỉ lên web khi khách "
            "đồng ý. Nếu khách đã nói cần sửa gì thì sửa và rao lại bản tin cập nhật rồi hỏi lại đã được chưa; nếu chưa nói thì "
            "hỏi ĐÚNG 1 câu nhẹ nhàng khách muốn chỉnh chỗ nào (tiêu đề, giá, mô tả, thông tin nhà) hay tạm thời chưa muốn đăng."
        )
    # SRS-5.1zzzzzzz81 (chủ dự án: "theo anh Luận"): khách duyệt → hỏi khách biết phí chưa. Tin chưa lên web thì lượt đó đã phải hỏi
    # ô còn thiếu (`khoi_trang_thai_web`) — không thêm câu phí cho khỏi thành hai câu hỏi.
    hoi_phi = (
        "\n  • RỒI XUỐNG MỘT DÒNG TRỐNG (đoạn riêng — hệ thống gửi thành tin nhắn riêng cho đỡ rối mắt; SRS-5.1zzzzzzz98) và HỎI "
        "PHÍ NHẸ NHÀNG như bản anh Luận (tinh thần \"anh/chị có biết phí môi giới của tụi em chưa ạ?\"): mời khách vào web theo dõi "
        f"tin rồi hỏi khách đã biết phí môi giới bên em chưa (câu mẫu: \"{cau_mau.cau('hoi_phi', **({'web': link_tin(web['ma'])} if (web or {}).get('ma') else {}))}\") — đây là câu hỏi DUY NHẤT "
        "của lượt này. Chỉ khi khách hỏi cụ thể mới báo con số phí, đúng theo loại khách. Đoạn này tối đa 2 câu ngắn."
        if (web is None or web.get("len_web")) and not phi_da_bao else ""
    )
    if phi_da_bao and (web is None or web.get("len_web")):
        # SRS-5.1zzzzzzz212 (bắn thử 5 khách: anh Hùng hỏi phí, bot báo 0.5%, lượt "ok đăng đi" lại hỏi "biết phí môi giới bên em chưa"):
        # câu hỏi phí là bước kịch bản, không biết phí ĐÃ được báo trong cuộc chat.
        hoi_phi = ("\n  • Khách ĐÃ được báo phí trong cuộc chat này: KHÔNG hỏi lại khách biết phí chưa, không nhắc lại con số phí. "
                   f"Được mời khách vào {link_tin((web or {}).get('ma'))} theo dõi tin, một câu ngắn.")
    bao_phi = khoi_bao_phi(user_type, prop.is_rental)
    bao_phi = f"\n  {bao_phi}" if bao_phi else ""
    yeu_cau = khoi_yeu_cau_viet(prop, yeu_cau_moi)
    hoi_sau = ""
    o_sau = prop.cau_hoi_sau_ra_tin() if (web is None or web.get("len_web")) else None
    if o_sau:   # SRS-5.1zzzzzzz80: ô khách lờ 2 lần trước bản nháp — hỏi lại một lần, SAU lượt nói chuyện phí (lượt duyệt chỉ hỏi phí)
        hoi_sau = (
            f"\n- TỪ LƯỢT SAU LƯỢT DUYỆT (khách đã trả lời chuyện phí): tin còn thiếu \"{nhan_o(o_sau, prop)}\" — hỏi thêm ĐÚNG "
            f"1 câu ngắn ({cau_hoi_o(o_sau, prop)}) để tin đầy đủ hơn. Khách chưa tiện thì thôi, không hỏi lại."
        )
    return f"""Bạn là "{assistant_name}", trợ lý ảo bất động sản của AI Ơi Nhà Đất ({SITE_HOST}).

{BUSINESS_CONTEXT}

{GIONG_VUI}
{RANH_GIOI_CACHE}{project_block}
NHIỆM VỤ (XỬ LÝ SAU KHI XEM BẢN TIN RAO): Bạn vừa cho khách xem bản tin rao và hỏi họ muốn sửa chỗ nào hay đăng luôn. Hãy đọc phản hồi MỚI NHẤT của khách:{khong_dong_y}
- NẾU khách ĐỒNG Ý / DUYỆT / BẢO ĐĂNG TIN (vd: "đăng đi", "lên bài đi", "lên tin đi", "đăng tin đi", "ok em", "được rồi", "chuẩn rồi em", "không cần sửa gì", hoặc thả tim/like):
{xac_nhan}{hoi_phi}{hoi_sau}
- NẾU khách HỎI LINK BÀI ĐĂNG HOẶC HỎI TRÊN WEB ĐĂNG NHƯ THẾ NÀO (vd: "đang đăng web như thế nào", "xem tin ở đâu", "cho xin link web", "link đâu"):
{hoi_link}
- NẾU khách muốn CHỈNH SỬA THẬT SỰ (vd "tiêu đề nhiều thông tin quá", "đổi tiêu đề...", "giá sửa lại...", "nhà có 3 lầu...", "bớt lặp", "thêm icon"):
  • TRƯỚC dấu 📋: MỘT câu ngắn đáp đúng điều khách vừa nói, theo khối GIỌNG (đồng tình, cảm thán nếu điều đó hay, hoặc nói thẳng sẽ sửa
    gì) — KHÔNG mở bằng câu báo cáo "Em sửa rồi ạ / Em cập nhật lại bản tin", KHÔNG nhắc phí.
  • RAO LẠI BẢN TIN ĐÃ SỬA (xuống dòng, dòng RIÊNG "📋 Bản tin cập nhật:" — giữ dấu 📋) theo ĐÚNG bố cục tin rao dưới đây — sửa ĐÚNG chỗ khách nói trên bản tin trước;
    chỗ khách không nhắc giữ nguyên DỮ LIỆU và Ý nhưng câu chữ được làm tươi (đổi vài cách nói, sửa lỗi chính tả), KHÔNG chép lại y nguyên
    cả đoạn; KHÔNG soạn lại từ đầu theo ý mình, KHÔNG đem điều khách vừa đính chính lên tiêu đề nếu khách không bảo.
  • SAU bản tin: MỘT câu hỏi chốt ngắn, mỗi lần một cách nói khác lượt trước (hỏi đã ưng chưa / còn chỗ nào chỉnh / đăng luôn nhé) —
    không lặp lại nguyên câu chốt của bản trước.
  • Khách góp ý về CÁCH VIẾT (nhấn gì, bớt gì, icon, lặp) mà bản tin vẫn không thể hiện được thì phải nói thật vì sao; KHÔNG trả lời "em sẽ
    sửa" rồi không gửi bản tin.
- NẾU khách trả lời CHƯA BIẾT PHÍ (sau câu hỏi phí): báo NGẮN trong 1–2 câu — con số phí đúng vai + chỉ thu khi giao dịch thành công.
  Không thêm câu giải thích, không chào kết dài.{bao_phi}
- NẾU khách CHỦ ĐỘNG HỎI PHÍ HOẶC CHÊ PHÍ CAO / DO DỰ / TỪ CHỐI trả phí: hãy THUYẾT PHỤC một cách khéo léo, ấm áp:
  • Đồng cảm trước, KHÔNG tranh cãi, KHÔNG chê khách.
  • Mỗi lượt nhấn 1–2 lợi ích mạnh nhất phù hợp với mối lo của khách (xem DANH SÁCH GIÁ TRỊ), rồi nhẹ nhàng chốt lại.
  • Nhấn mạnh "chỉ thu phí KHI giao dịch thành công" để gỡ tâm lý rủi ro.
  • TUYỆT ĐỐI giữ đúng mức phí chính sách — KHÔNG tự ý giảm giá, KHÔNG hứa ưu đãi/cam kết ngoài chính sách, KHÔNG bịa.
  • Chỉ thuyết phục tối đa 1–2 lần; nếu khách vẫn dứt khoát từ chối thì lịch sự, tôn trọng, để ngỏ cửa, KHÔNG nài ép gây khó chịu.

DANH SÁCH GIÁ TRỊ (dùng để thuyết phục, chỉ nêu thứ có thật):
{FEE_VALUE_POINTS}{fee_block}

KHI RAO LẠI BẢN TIN ĐÃ SỬA:
{AD_FORMAT}
{yeu_cau}
DỮ LIỆU BĐS:
{describe_captured(prop)}"""


def build_media_read_instruction(
    assistant_name: str,
    pending_question: str | None = None,
    prop: Property | None = None,
    next_field: str | None = None,
) -> str:
    """Instruction for the vision/OCR read of a seller-sent photo or PDF (§II honesty). The chat
    reply must be SHORT (a one-line gist) — the FULL faithful content is stored separately to a
    .md; and it must be context-aware (the seller is here to LIST/SELL). When `pending_question`
    is the seller's most recent message, the read must ANSWER that from the file first — a seller
    who re-sends the phân-lô right after asking about the đường nội bộ wants that number, not a
    generic "đang rao căn nào" prompt."""
    ctx = ""
    if pending_question and pending_question.strip():
        ctx = f"""
NGAY TRƯỚC ĐÓ khách đang hỏi: "{pending_question.strip()}"
=> Nếu tài liệu này TRẢ LỜI ĐƯỢC câu đó (họ gửi file chính là để em xem và trả lời), hãy TRẢ LỜI THẲNG câu đó TỪ tài liệu — ưu tiên số 1, đừng hỏi lạc đề. Nếu tài liệu KHÔNG có dữ kiện đó thì nói thật là chưa thấy trong tài liệu. Chỉ khi câu hỏi KHÔNG liên quan tài liệu mới quay lại hỏi định hướng.
"""

    known_block = ""
    if prop:
        captured = describe_captured(prop)
        if captured:
            known_block = f"""
DỮ LIỆU ĐÃ BIẾT VỀ CĂN NÀY (ĐÃ THU THẬP TỪ TRƯỚC - TUYỆT ĐỐI KHÔNG ĐƯỢC HỎI LẠI CÁC THÔNG TIN NÀY!):
{captured}
"""

    next_guide = ""
    if next_field:
        label = nhan_o(next_field, prop)
        natural = cau_hoi_o(next_field, prop)
        next_guide = f"""
MỤC TIÊU HỎI TIẾP THEO: Sau MỘT câu ngắn khen / nhận xét điều thấy trong ảnh, hãy hỏi tiếp thông tin: "{label}".
Gợi ý câu hỏi: {natural}.
(Lưu ý: Nếu trong ảnh đã thể hiện rõ thông tin này thì coi như đã có, không hỏi lại; nếu chưa có thì hỏi đúng 1 câu này.)
"""
    elif prop:
        next_guide = """
Thông tin căn này đã rất đầy đủ. Sau MỘT câu ngắn về ảnh thì cảm ơn ngắn, không cần hỏi thêm.
"""

    return f"""Bạn là "{assistant_name}", trợ lý ảo BĐS của AI Ơi Nhà Đất. Khách vừa gửi một ẢNH hoặc TÀI LIỆU BĐS.
Chỉ nói NGẮN MỘT câu điều NHÌN THẤY RÕ trong ảnh/tài liệu. TUYỆT ĐỐI KHÔNG liệt kê, KHÔNG thêm chi tiết khách chưa nói, KHÔNG khen vật liệu / thiết bị (ban công kính, đèn downlight, cổng sắt…), KHÔNG nhắc lại thông tin đã có.
{ctx}{known_block}{next_guide}
QUY TẮC BẮT BUỘC:
- Xưng hô theo khối QUY TẮC XƯNG HÔ ở cuối. Không mở đầu bằng "Dạ", không khen nịnh giả tạo.
- TUYỆT ĐỐI KHÔNG HỎI LẠI: Nếu trong mục "DỮ LIỆU ĐÃ BIẾT" đã có diện tích, kết cấu, địa chỉ hay giá, CẤM KHÔNG ĐƯỢC xin lại diện tích, giá bán hay mã căn!
- VỚI CHUNG CƯ & DỰ ÁN: TUYỆT ĐỐI KHÔNG hỏi sổ đỏ / sổ hồng!
- VỚI NHÀ PHỐ / ĐẤT: KHÔNG khẳng định nhà mặt tiền hay trong hẻm từ ảnh, KHÔNG tự ghi ô.
- CHỈ MỘT câu hỏi cả lượt (câu hỏi ở mục "MỤC TIÊU HỎI TIẾP THEO" nếu có), hỏi xong thì dừng.
- TRUNG THỰC: chỉ nói điều CHẮC CHẮN thấy được. Nếu suy đoán, dùng "hình như". KHÔNG bịa.
- ĐỐI VỚI ẢNH SỔ ĐỎ / SỔ HỒNG / GIẤY CHỨNG NHẬN:
  • PHÂN VÙNG THỊ GIÁC: CHỈ trích xuất dữ liệu BĐS/thửa đất (Thửa đất số, Tờ bản đồ số, Diện tích, Hình thức & mục đích sử dụng, Thời hạn, Sơ đồ hình thể thửa đất ở trang 2 & trang 3).
  • BẢO MẬT NHÂN THÂN (PII): TUYỆT ĐỐI KHÔNG đọc, KHÔNG trích xuất, KHÔNG đưa tên chủ sở hữu, số CMND/CCCD, năm sinh, địa chỉ thường trú vào bài đăng tóm tắt công khai.
  • BÁO LỖI ẢNH THÔNG MINH: Nếu ảnh bị mờ, chụp nghiêng, lóa đèn flash không đọc rõ số thửa/diện tích/sơ đồ, hãy nói ngắn phần nào chưa đọc được và xin chụp lại gần hơn trang sơ đồ thửa đất (tự đặt câu).
- NGƯỜI GỬI ĐANG MUỐN RAO BÁN:
  • Nếu tài liệu là THÔNG TIN CHUNG của dự án (quy cách bàn giao, phụ lục, brochure mẫu nhà... KHÔNG phải một căn cụ thể có giá) VÀ khách KHÔNG đang hỏi điều gì cụ thể, hãy nhắc nhẹ đây là thông tin chung và hỏi MỘT câu khách đang rao căn nào — câu này THAY câu ở "MỤC TIÊU HỎI TIẾP THEO".
  • Nếu là ảnh thực tế của căn đang rao: Tóm tắt 1 câu về góc ảnh rồi hỏi câu ở "MỤC TIÊU HỎI TIẾP THEO" (nếu có).
- Tối đa MỘT câu hỏi cả lượt (đã trả lời câu hỏi đang chờ ở trên thì chỉ cần chốt lại ngắn gọn)."""


def build_media_group_instruction(
    assistant_name: str, folder_name: str | None, basket_labels: list[str]
) -> str:
    """Instruction for grouping a MULTI-FILE batch (a folder, several links) — figure out
    whether each file is about ONE specific căn, MANY (shared project facts), or a căn
    not yet in the basket, using BOTH the image content and filenames/folder name."""
    basket_txt = ""
    if basket_labels:
        lines = "\n".join(f"{i}. {label}" for i, label in enumerate(basket_labels, 1))
        basket_txt = (
            "\n\nRỔ HÀNG HIỆN CÓ của khách (nếu một nhóm tệp khớp với 1 căn TRONG danh sách "
            f"này, dùng pham_vi=can_da_co và chi_so_can_da_co đúng số thứ tự):\n{lines}"
        )
    folder_txt = f'\nTên thư mục khách gửi: "{folder_name}".' if folder_name else ""
    return f"""Bạn là {assistant_name}, trợ lý ảo BĐS của AI Ơi Nhà Đất. Khách vừa gửi NHIỀU tệp ảnh/tài liệu cùng lúc — có thể là NHIỀU căn khác nhau, hoặc ảnh dùng CHUNG cho cả dự án.{folder_txt}

NHIỆM VỤ: dựa vào CẢ NỘI DUNG ảnh (nội thất, mặt tiền, view, sổ hồng, số nhà...) LẪN TÊN TỆP (vd "can1_...", "nha2_...", ảnh liền kề cùng 1 căn thường trùng bối cảnh), hãy NHÓM các tệp lại, mỗi nhóm gồm:
- pham_vi = "chung": tệp áp dụng cho TẤT CẢ các căn (toàn cảnh dự án, tiện ích, cổng, hồ bơi, sảnh...) — KHÔNG phải của riêng 1 căn.
- pham_vi = "mau_nha": tệp của một MẪU NHÀ / LOẠI CĂN (brochure, mặt bằng layout, phối cảnh mẫu nhà, bảng thông số 1 mẫu — vd "Fusion Gen 5") áp dụng cho MỌI căn cùng mẫu, KHÔNG phải 1 căn thực tế cụ thể. Kèm ten_mau_nha (tên mẫu nhà) nếu đọc được.
- pham_vi = "can_da_co": tệp khớp với 1 căn ĐÃ có trong rổ hàng bên dưới — kèm chi_so_can_da_co đúng số thứ tự.
- pham_vi = "can_moi": tệp của 1 căn THỰC TẾ cụ thể (có địa chỉ/số nhà/ảnh thật của căn đó) CHƯA có trong rổ hàng.

QUY TẮC:
- PHÂN BIỆT rõ: brochure/mặt bằng/phối cảnh của một MẪU NHÀ (mau_nha) KHÁC với ảnh thật của một CĂN cụ thể (can_moi/can_da_co). Tài liệu thiết kế/tiếp thị của mẫu nhà thì để "mau_nha", đừng gán vào 1 căn.
- chi_luu_du_lieu=true khi nhóm là TRANG DỮ LIỆU THUẦN: bảng giá, bảng thông số, tin rao dạng CHỮ, ảnh chụp màn hình số liệu, infographic — thứ mà GIÁ TRỊ nằm ở DỮ LIỆU chứ không phải hình. Khi đó hệ thống chỉ LẤY DỮ LIỆU (trong mo_ta), KHÔNG lưu ảnh. ĐỂ FALSE cho: ảnh THẬT của căn/dự án, GIẤY TỜ PHÁP LÝ (sổ hồng, hợp đồng), và MẶT BẰNG/PHỐI CẢNH VẼ (người mua vẫn cần xem) — những thứ này phải GIỮ ảnh.
- Nếu KHÔNG chắc chắn, ĐỪNG đoán bừa — gom các tệp không rõ vào 1 nhóm "can_moi" và trong mo_ta nói rõ là "chưa chắc" để hỏi lại khách, thay vì bịa ra nhiều căn không có cơ sở. Khi phân vân giữ/bỏ ảnh, hãy GIỮ (chi_luu_du_lieu=false).
- Với mỗi nhóm, viết "mo_ta" NGẮN GỌN, TRUNG THỰC, và CÀNG NHIỀU CHI TIẾT BĐS đọc được càng tốt (địa chỉ, diện tích, giá, kết cấu, pháp lý, tiện ích) — mo_ta này sẽ dùng để điền hồ sơ, không chỉ là "ảnh nhà".
- "tep" phải là tên tệp ĐÚNG như đã cho, không đổi.{basket_txt}"""


def build_transcribe_instruction(assistant_name: str, kind: str) -> str:
    """Instruction to transcribe a source document (phân lô, brochure mẫu nhà, bảng mô tả gói
    nội thất...) FAITHFULLY into Markdown, kept once and re-read by the bot for grounding."""
    return f"""Bạn là {assistant_name}, trợ lý BĐS của AI Ơi Nhà Đất. Đây là một tài liệu nguồn
loại "{kind}". Hãy CHÉP LẠI TRUNG THỰC toàn bộ nội dung thành MARKDOWN sạch, đầy đủ, để sau này
đọc lại mà không cần mở lại file gốc.

QUY TẮC:
- GIỮ NGUYÊN mọi số liệu, mã lô/mã căn, kích thước, diện tích, giá, tên DỰ ÁN/MẪU NHÀ — KHÔNG làm tròn, KHÔNG lược bỏ.
- 🔒 BẢO MẬT CÁ NHÂN (bắt buộc): nếu là GIẤY TỜ PHÁP LÝ (sổ đỏ/sổ hồng/GCN QSDĐ, hợp đồng, CMND/CCCD...),
  hãy CHÉP các DỮ KIỆN ĐẤT (địa chỉ thửa, số thửa, số tờ bản đồ, diện tích, mục đích & thời hạn sử dụng,
  nguồn gốc, quy hoạch) — vì đây là kiến thức CHUNG của dự án — NHƯNG XÓA MỌI THÔNG TIN CÁ NHÂN: thay
  tên chủ sở hữu / người sử dụng đất / các bên bằng "[đã ẩn]"; TUYỆT ĐỐI KHÔNG chép số CMND/CCCD, số
  phát hành / số vào sổ của giấy chứng nhận, số điện thoại, chữ ký. Không để lộ danh tính ai cả.
- Bảng biểu → chép thành bảng Markdown. Sơ đồ/mặt bằng → mô tả bằng lời rõ ràng (vị trí, hướng,
  kích thước lô, giáp ranh nếu đọc được).
- TUYỆT ĐỐI không bịa/suy diễn thông tin không có trong tài liệu. Chỗ nào mờ/không chắc, ghi rõ
  "(không đọc rõ)".
- Mở đầu bằng một dòng tiêu đề "# {kind}" và các mục con hợp lý. Chỉ trả về Markdown, không lời dẫn."""


# Hệ thống Vision chuyên sâu đọc và thẩm định Giấy chứng nhận QSDĐ / Sổ đỏ / Sổ hồng
DEED_VISION_INSTRUCTION = """Bạn là chuyên gia thẩm định pháp lý BĐS của AI Ơi Nhà Đất.
Nhiệm vụ: Phân tích kỹ hình ảnh hoặc tài liệu được gửi (Sổ đỏ, Sổ hồng, Giấy chứng nhận QSDĐ, Hợp đồng mua bán, Bản vẽ sơ đồ thửa đất).
Trích xuất chính xác các thông số kỹ thuật và pháp lý của BĐS:
1. Địa chỉ thửa đất / căn nhà ghi trên giấy tờ (số nhà, đường, phường/xã, quận/huyện, tỉnh/thành).
2. Số thửa đất và số tờ bản đồ.
3. Diện tích đất (m2), diện tích sàn xây dựng nhà ở (m2), diện tích đất ở / thổ cư (m2).
4. Kích thước (ngang x dài) nếu nhìn thấy trên bản vẽ sơ đồ thửa đất (ví dụ: '5x15m', '4.2x18m').
5. Loại hình BĐS: nhà ở riêng lẻ -> 'nha_pho', căn hộ chung cư -> 'chung_cu', đất ở -> 'dat'.
6. Tình trạng pháp lý: ví dụ 'Sổ hồng riêng', 'Sổ đỏ riêng', 'Đã hoàn công', 'Hợp đồng mua bán'.
7. Tên dự án, số tầng, mã căn (nếu là căn hộ chung cư).
🔒 BẢO MẬT NHÂN THÂN (PII): TUYỆT ĐỐI KHÔNG trích xuất tên chủ sở hữu, số CMND/CCCD, năm sinh, địa chỉ thường trú của chủ nhà. Chỉ trích xuất thông số kỹ thuật của BĐS.
Nếu ảnh bị mờ hoặc KHÔNG PHẢI giấy tờ pháp lý BĐS (vd ảnh chụp phòng khách, mặt tiền, phong cảnh...), đặt la_giay_to_bds = false."""


# OPEN-53 (chủ dự án 28/10/2026, phương án 3): AI chấm ảnh có phải ảnh thật của căn TRƯỚC khi lưu (tính điểm) và hiện web — đi chung lượt đọc
# ảnh sẵn có (nhận sổ / gom nhóm), không thêm lần gọi model.
MO_TA_KHONG_PHAI_ANH_CAN = ("true nếu là ẢNH nhưng KHÔNG phải ảnh chụp thật của căn đang rao: ảnh mạng / ảnh quảng cáo có chữ, logo, watermark của bên khác, "
                "phối cảnh 3D / ảnh minh hoạ, ảnh không liên quan nhà đất. Ảnh nhà, phòng, hẻm, đường trước nhà, view chụp thật → false; giấy tờ, "
                "bảng dữ liệu → false. Phân vân thì false (OPEN-53, SRS-5.1zzzzzzz241).")


def deed_extraction_schema() -> dict[str, Any]:
    """JSON schema để trích xuất dữ liệu từ Sổ hồng, Sổ đỏ, Giấy chứng nhận QSDĐ."""
    return {
        "type": "object",
        "properties": {
            "khong_phai_anh_can": {"type": "boolean", "description": MO_TA_KHONG_PHAI_ANH_CAN},
            # SRS-5.1zzzzzzz255 (chủ dự án 28/10: "gửi chào bằng sticker nên zalo gửi bằng cái png gì đó, ko đọc dc"): Zalo có loại sticker
            # tới bridge dưới dạng ẢNH (link .png), không qua nhánh sticker — AI đọc nghĩa ngay trong lượt đọc ảnh này, không thêm lần gọi.
            "sticker": {"type": "string", "description": "CHỈ khi ảnh là STICKER / nhãn dán / biểu tượng cảm xúc / icon hoạt hình khách gửi trong "
                        "chat (không phải ảnh chụp, không phải tài liệu, không phải ảnh quảng cáo): ghi ý nghĩa — một trong chao (vẫy tay / chữ hi, "
                        "hello, chào), cam_on, tam_biet, dong_y (ok, like, tim, gật), vui, buon_gian (khóc, giận), khac. Ảnh khác để TRỐNG."},
            "sticker_mo_ta": {"type": "string", "description": "Chỉ khi là sticker: tối đa 12 từ tiếng Việt — hình gì + chữ in trên sticker."},
            "la_giay_to_bds": {
                "type": "boolean",
                "description": "true nếu ảnh là giấy chứng nhận QSDĐ, sổ hồng, sổ đỏ, HĐMB, bản vẽ sơ đồ thửa đất. false nếu là ảnh nhà thông thường hoặc tài liệu khác.",
            },
            "loai_giay_to": {
                "type": "string",
                "enum": ["so_hong", "so_do", "hdmb", "so_do_thua_dat", "ban_ve", "khac"],
                "description": "Phân loại giấy tờ.",
            },
            "loai_hinh": {
                "type": "string",
                "enum": ["nha_pho", "chung_cu", "dat", "kho_xuong", "mat_bang", "biet_thu", "chua_ro"],
                "description": "Loại BĐS xác định từ giấy tờ (nhà ở riêng lẻ -> nha_pho, chung cư -> chung_cu, đất ở -> dat).",
            },
            "dia_chi": {
                "type": "string",
                "description": "Địa chỉ thửa đất / căn nhà ghi trên sổ.",
            },
            "so_thua": {"type": "string", "description": "Số thửa đất ghi trên giấy chứng nhận."},
            "so_to": {"type": "string", "description": "Số tờ bản đồ ghi trên giấy chứng nhận."},
            "dien_tich_dat": {"type": "string", "description": "Diện tích thửa đất (m2)."},
            "dien_tich_nha": {"type": "string", "description": "Diện tích sàn xây dựng nhà ở (m2)."},
            "dien_tich": {"type": "string", "description": "Diện tích căn hộ hoặc diện tích tổng (m2)."},
            "tho_cu": {"type": "string", "description": "Diện tích đất ở / thổ cư (m2) ghi trên sổ."},
            "kich_thuoc": {"type": "string", "description": "Kích thước ngang x dài (vd: '5x15m', '4.2x18m')."},
            "phap_ly": {"type": "string", "description": "Tình trạng pháp lý đọc được trên giấy (vd: Sổ hồng riêng, Đã hoàn công) — KHÔNG ghi 'chính chủ'."},
            "ten_du_an": {"type": "string", "description": "Tên dự án chung cư nếu có."},
            "ma_can": {"type": "string", "description": "Mã căn hộ / số tầng nếu có."},
        },
        "required": ["la_giay_to_bds"],
        "additionalProperties": False,
    }


def build_inventory_instruction(assistant_name: str) -> str:
    """Instruction to pull a whole PRICE LIST / inventory table (nhiều căn × giá) out of a
    brochure/price-list PDF or image, as structured rows."""
    return f"""Bạn là {assistant_name}, trợ lý BĐS của AI Ơi Nhà Đất. Tài liệu này CÓ THỂ là
một BẢNG GIÁ / RỔ HÀNG của một dự án — liệt kê NHIỀU căn kèm giá (theo mã lô/mã căn và mẫu nhà).

Nếu đúng là bảng giá nhiều căn: đặt la_bang_gia=true, điền ten_du_an (nếu đọc được), và liệt kê
TỪNG CĂN vào mảng cac_can — mỗi căn gồm: ma_so_can (mã lô/mã căn), mau_nha (tên mẫu nhà nếu có),
dien_tich (nếu có), và GIÁ.

QUAN TRỌNG — GIÁ NHIỀU GÓI: một căn có thể có NHIỀU cột giá (vd 'chưa gồm nội thất', 'gói Air',
'gói Max'; hoặc giá theo diện tích khác nhau). PHẢI GIỮ ĐẦY ĐỦ MỌI mức giá — TUYỆT ĐỐI KHÔNG
gộp/bỏ bớt. Liệt kê mỗi mức vào mảng `gia_goi` = [{{ten_goi, gia}}] với ten_goi = tên gói NGẮN GỌN
(vd 'Air', 'Max', 'chưa NT', 'cơ bản') và gia GIỮ NGUYÊN cách viết trong tài liệu (vd
'11.470.000.000' hoặc '8,98 tỷ'). Nếu căn CHỈ có 1 giá, có thể để trong `gia` (hoặc gia_goi 1 phần
tử) — cả hai đều được. Cột để trống ('—') thì bỏ qua, đừng bịa 0.

QUAN TRỌNG — QUY CÁCH BÀN GIAO: cấu trúc cột giá thường cho biết quy cách bàn giao (vd 'giá chưa
gồm nội thất' = xây thô + hoàn thiện mặt tiền; 'giá gồm gói Air/Max' = có thêm hoàn thiện nội thất,
được chọn gói). Với MỖI căn, ghi quy_cach_ban_giao mô tả đúng: mọi căn đều có phần nền (xây thô +
hoàn thiện mặt tiền); căn nào có thêm hoàn thiện nội thất/được chọn gói (Air/Max) thì ghi rõ. Đây
là thông tin CHUNG, KHÁC với giá.

QUY TẮC: chỉ trích thông tin CÓ THẬT trong tài liệu — TUYỆT ĐỐI không bịa mã căn/giá.
la_bang_gia=true CHỈ KHI tài liệu là BẢNG GIÁ BÁN thật (liệt kê các căn KÈM GIÁ BÁN bằng tiền).
la_bang_gia=FALSE cho: BẢN ĐỒ / SƠ ĐỒ PHÂN LÔ (chỉ có mã lô + diện tích + vị trí, KHÔNG có giá
bán), mặt bằng, quy hoạch, quy cách bàn giao, brochure, ảnh 1 căn, sổ hồng, tin rao 1 BĐS —
những thứ này KHÔNG phải bảng giá; khi đó để cac_can rỗng."""


def inventory_schema() -> dict[str, Any]:
    """Schema for extracting a price-list / inventory table into per-unit rows."""
    return {
        "type": "object",
        "properties": {
            "la_bang_gia": {
                "type": "boolean",
                "description": "true CHỈ KHI là BẢNG GIÁ BÁN (các căn kèm GIÁ BÁN bằng tiền). "
                "false cho bản đồ/sơ đồ phân lô, mặt bằng, quy cách, brochure (không có giá bán).",
            },
            "ten_du_an": {"type": "string", "description": "Tên dự án của bảng giá (nếu đọc được)."},
            "cac_can": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ma_so_can": {"type": "string", "description": "Mã lô / mã số căn."},
                        "mau_nha": {"type": "string", "description": "Tên mẫu nhà (nếu có)."},
                        "gia": {"type": "string", "description": "Giá khi CHỈ có 1 mức, giữ nguyên cách viết."},
                        "gia_goi": {
                            "type": "array",
                            "description": "MỌI mức giá của căn khi có NHIỀU gói (Air/Max/chưa NT...). "
                            "Giữ đầy đủ, không gộp.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "ten_goi": {"type": "string", "description": "Tên gói ngắn (Air/Max/chưa NT/cơ bản)."},
                                    "gia": {"type": "string", "description": "Giá của gói này, giữ nguyên cách viết."},
                                },
                                "required": ["gia"],
                            },
                        },
                        "dien_tich": {"type": "string", "description": "Diện tích (nếu có)."},
                        "quy_cach_ban_giao": {
                            "type": "string",
                            "description": "QUY CÁCH BÀN GIAO của căn theo tài liệu — xây dựng tới "
                            "đâu (vd 'xây thô + hoàn thiện mặt tiền'), CÓ hoàn thiện nội thất không, "
                            "và nếu có gói nội thất (Air/Max...) thì ghi rõ được chọn gói nào. Đây "
                            "là thông tin CHUNG của dự án, KHÁC với giá.",
                        },
                        "ghi_chu": {"type": "string", "description": "Ghi chú khác."},
                    },
                    "required": ["ma_so_can"],
                },
            },
        },
        "required": ["la_bang_gia"],
        "additionalProperties": False,
    }


def media_group_schema() -> dict[str, Any]:
    """Schema for grouping a multi-file batch by which listing/project it belongs to."""
    return {
        "type": "object",
        "properties": {
            "nhom": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "pham_vi": {
                            "type": "string",
                            "enum": ["chung", "mau_nha", "can_da_co", "can_moi"],
                            "description": "chung=áp dụng mọi căn (dự án); mau_nha=brochure/mặt "
                            "bằng của 1 MẪU NHÀ (áp dụng mọi căn cùng mẫu); can_da_co=khớp 1 "
                            "căn đã có trong rổ hàng; can_moi=1 căn thực tế mới chưa có.",
                        },
                        "ten_mau_nha": {
                            "type": "string",
                            "description": "Nếu pham_vi=mau_nha: tên mẫu nhà (vd 'Fusion Gen 5').",
                        },
                        "chi_so_can_da_co": {
                            "type": "integer",
                            "description": "Nếu pham_vi=can_da_co: số thứ tự (1-based) của căn "
                            "trong RỔ HÀNG khớp với nhóm này.",
                        },
                        "tep": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Tên các tệp thuộc nhóm này, đúng như đã cho.",
                        },
                        "mo_ta": {
                            "type": "string",
                            "description": "Mô tả ngắn, trung thực, gồm mọi chi tiết BĐS đọc "
                            "được (địa chỉ, diện tích, giá, kết cấu, pháp lý, tiện ích...).",
                        },
                        "giay_to": {
                            "type": "boolean",
                            "description": "true nếu nhóm là SỔ ĐỎ / SỔ HỒNG / GIẤY TỜ pháp lý / hợp đồng / CCCD — "
                            "có thông tin chủ nhà, cất RIÊNG, không bao giờ đăng web. false cho ảnh nhà thật.",
                        },
                        "khong_phai_anh_can": {"type": "boolean", "description": MO_TA_KHONG_PHAI_ANH_CAN},
                        "chi_luu_du_lieu": {
                            "type": "boolean",
                            "description": "true nếu nhóm là TRANG DỮ LIỆU THUẦN (bảng giá/thông "
                            "số, tin rao chữ, ảnh chụp màn hình số liệu, infographic) — chỉ lấy "
                            "dữ liệu, KHÔNG lưu ảnh. false cho ảnh thật/giấy tờ pháp lý/mặt bằng "
                            "vẽ (giữ ảnh). Phân vân thì false.",
                        },
                    },
                    "required": ["pham_vi", "tep", "mo_ta", "giay_to"],
                },
            }
        },
        "required": ["nhom"],
        "additionalProperties": False,
    }


PROJECT_EXTRACTION_SYSTEM = """Bạn là bộ trích xuất THÔNG TIN DỰ ÁN BĐS cho AI Ơi Nhà Đất.
Đọc mô tả và trích xuất các thông tin CHUNG của dự án/chung cư (áp dụng cho MỌI căn trong dự án):
tên dự án, địa chỉ, tiện ích (hồ bơi, gym...), cổng/lối vào, an ninh.
Chỉ trích xuất thông tin xuất hiện rõ ràng — KHÔNG suy diễn, KHÔNG bịa."""


def project_extraction_schema() -> dict[str, Any]:
    """Schema for registering a project's shared attributes from free text."""
    return {
        "type": "object",
        "properties": {
            "ten_du_an": {"type": "string", "description": "Tên dự án/chung cư"},
            "dia_chi": {"type": "string", "description": "Địa chỉ/vị trí dự án"},
            "tien_ich": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Tiện ích chung: hồ bơi, gym, công viên, sauna, bảo vệ 24/7...",
            },
            "cong": {"type": "string", "description": "Cổng/lối vào chính của dự án"},
            "an_ninh": {"type": "string", "description": "An ninh / bảo vệ"},
        },
        "required": [],
        "additionalProperties": False,
    }


UNIT_TYPE_EXTRACTION_SYSTEM = """Bạn là bộ trích xuất THÔNG TIN MẪU NHÀ / LOẠI CĂN cho AI Ơi Nhà Đất.
Đọc mô tả/brochure và trích xuất thông tin của MỘT MẪU NHÀ (house model / unit type) — áp dụng cho MỌI căn cùng mẫu:
tên mẫu nhà, dự án, diện tích, số phòng ngủ, số tầng, mặt tiền, hướng, tóm tắt bố trí (layout).
Chỉ trích xuất thông tin xuất hiện rõ ràng — KHÔNG suy diễn, KHÔNG bịa."""


# Fields a spreadsheet column can map to (LLM-assisted import of arbitrary sheets).
IMPORTABLE_FIELDS = [
    "loai_hinh", "dia_chi", "ma_so_can", "dien_tich", "dien_tich_dat", "dien_tich_nha",
    "gia", "ket_cau", "du_an", "unit_type", "lo_gioi_hem", "phap_ly_hoan_cong", "huong",
]


def build_column_map_system(headers: list[str]) -> str:
    """System prompt to map a spreadsheet's columns to our field slugs."""
    cols = " | ".join(headers)
    return (
        "Bạn ánh xạ cột của một bảng tính BĐS sang các trường chuẩn. "
        f"Các cột có trong file: [{cols}]. "
        "Với mỗi trường BĐS bên dưới, cho biết TÊN CỘT (chép CHÍNH XÁC từ danh sách trên) "
        "chứa dữ liệu của trường đó; bỏ trống nếu không có cột phù hợp."
    )


def column_map_schema() -> dict[str, Any]:
    """Schema: for each importable field, which source column maps to it."""
    return {
        "type": "object",
        "properties": {
            f: {"type": "string", "description": f"Cột tương ứng với '{FIELD_LABELS.get(f, f)}'"}
            for f in IMPORTABLE_FIELDS
        },
        "required": [],
        "additionalProperties": False,
    }


def unit_type_extraction_schema() -> dict[str, Any]:
    """Schema for registering a house model / unit type from a brochure's read-out."""
    return {
        "type": "object",
        "properties": {
            "ten_mau_nha": {"type": "string", "description": "Tên/mã mẫu nhà hoặc loại căn"},
            "ten_du_an": {"type": "string", "description": "Dự án mà mẫu này thuộc về"},
            "dien_tich": {"type": "string", "description": "Diện tích (sàn/đất)"},
            "so_phong_ngu": {"type": "string", "description": "Số phòng ngủ"},
            "so_tang": {"type": "string", "description": "Số tầng"},
            "mat_tien": {"type": "string", "description": "Bề ngang × chiều sâu lô của mẫu nhà (m) — không phải độ rộng con đường"},
            "huong": {"type": "string", "description": "Hướng"},
            "layout": {"type": "string", "description": "Tóm tắt bố trí công năng các tầng"},
        },
        "required": [],
        "additionalProperties": False,
    }


EXTRACTION_SYSTEM = """Bạn là bộ trích xuất dữ liệu BĐS cho AI Ơi Nhà Đất.
Đọc hội thoại và trích xuất các thông tin BĐS mà NGƯỜI RAO đã cung cấp.
Chỉ trích xuất thông tin xuất hiện rõ ràng — KHÔNG suy diễn, KHÔNG bịa.
Tập trung vào BĐS đang nói ở các tin nhắn MỚI NHẤT.
QUAN TRỌNG — diện tích: nhà phố/biệt thự/nhà cấp 4 (đất riêng) có 2 diện tích KHÁC NHAU.
Nếu khách nói RÕ đâu là đất, đâu là nhà, dùng dien_tich_dat (diện tích đất) và dien_tich_nha
(diện tích nhà/sử dụng/xây dựng, không cần phân biệt sâu hơn) tương ứng. Nếu khách CHỈ cho
MỘT con số m2 mà KHÔNG có dấu hiệu nào (xem ĐỌC DẤU HIỆU dưới) thì lưu tạm vào dien_tich (đừng bỏ trống, đừng bịa
thêm số) để hệ thống hỏi lại xác nhận sau. Chung cư/CHDV/khách sạn/đất/kho xưởng chỉ có 1 diện tích — luôn dùng dien_tich
cho các loại này.
ĐỌC DẤU HIỆU NHƯ MÔI GIỚI LÂU NĂM (19/10/2026, SRS-5.1zzzzzzz74 — chủ dự án: "bot thông minh phải hiểu dấu hiệu căn này thuộc về gì"):
- Loại hình (loai_hinh) suy theo dấu hiệu, không chờ khách gọi tên: "căn nhà" / "nhà" kèm số tầng / lầu, mặt tiền, hẻm, hoặc nằm ở
  các quận nội thành cũ của TP.HCM (Quận 1–12, Phú Nhuận, Bình Thạnh, Tân Bình, Tân Phú, Gò Vấp, Bình Tân, Thủ Đức…) → nha_pho.
  "căn hộ", "chung cư", "block / tầng X căn Y", tên toà chung cư → chung_cu. "lô đất", "đất nền", "đất thổ cư", "đất trống" → dat.
  Cho thuê NGUYÊN CĂN ("nhà nguyên căn", "nhà trọ nguyên căn", "thuê nguyên căn" — cả căn nhà có trệt / lầu / phòng ngủ) → nha_pho;
  phong_tro chỉ khi cho thuê TỪNG PHÒNG trong dãy / nhà trọ (20/10: khách "cho thuê nhà trọ nguyên căn, 1 trệt 1 lầu 2PN" bị xếp
  phòng trọ, bot hỏi gác lửng / WC riêng).
  "Nhà" / "căn nhà" trong khu dự án / khu dân cư (vd "bán nhà trong khu dự án Nyah Phú Định") → nha_pho; chung_cu chỉ khi khách nói
  căn hộ / chung cư / tòa / block / tầng X (20/10: bot hỏi "tòa nào, tầng mấy" cho nhà phố trong dự án).
  Vùng ven / tỉnh (Bình Chánh, Củ Chi, Hóc Môn, Nhà Bè, Cần Giờ, Long An, Bình Dương, Đồng Nai, Tây Ninh…) mà khách chỉ nói "nhà",
  không có số tầng / lầu → có thể là nhà cấp 4, nhà vườn hay nhà phố → để trống loai_hinh, hệ thống sẽ hỏi.
- Diện tích nhà phố: một con số m² nói KÈM số tầng / lầu hoặc kích thước ("80m 5 tầng", "nhà 60m2 3 lầu", "4x20") là diện tích ĐẤT
  (cách nói chuẩn của giới mua bán: diện tích công nhận trên sổ) → dien_tich_dat. Chỉ là diện tích nhà (dien_tich_nha) khi khách
  nói "sàn", "sử dụng", "xây dựng", "tổng diện tích sàn". Không có dấu hiệu nào mới để tạm dien_tich.
  Viết tắt (20/10): "dtsd" / "DTSD" / "dt sử dụng" = diện tích SỬ DỤNG → dien_tich_nha; "dtđ" / "dt đất" = đất → dien_tich_dat.
  "DTCN" / "dt công nhận" / "diện tích công nhận" = diện tích ĐẤT công nhận trên sổ → dien_tich_dat, KHÔNG BAO GIỜ là sàn (26/10: "DT 4x18m
  – DTCN 71m²" bị ghi thành 71m² sàn).
  "dts" có thể là diện tích sổ hoặc sàn: con số bằng ngang × dài khách đã nói (4x11 → 44) là ĐẤT; còn lại để tạm dien_tich. Số
  bằng ngang × dài luôn là diện tích ĐẤT, không bao giờ là diện tích sàn của nhà nhiều tầng.
  "MT 20m" / "mặt tiền đường 20m" nói cạnh TÊN ĐƯỜNG là độ rộng con ĐƯỜNG → lo_gioi_duong; mat_tien là bề ngang của chính căn
  nhà (lô 4x11 → ngang 4m), không bao giờ lớn hơn chiều của lô.
  Độ rộng theo QUY HOẠCH ("quy hoạch mở rộng 25m", "lộ giới quy hoạch 20m", "sắp mở rộng đường") là chuyện SAU NÀY → quy_hoach, KHÔNG
  ghi vào lo_gioi_duong (lo_gioi_duong = đường rộng bao nhiêu BÂY GIỜ). 26/10: "mặt tiền quy hoạch mở rộng 25m" bị ghi lo_gioi_duong = 25 rồi
  tin rao viết "đường rộng 25m".
QUAN TRỌNG — mã số căn: BĐS dự án lúc MỞ BÁN (chưa hoàn thành) thường được định danh bằng
MÃ SỐ CĂN (vd "căn số 42", "A-15-03", "block B tầng 5 căn 3") và CHƯA có địa chỉ đường. Nếu
người rao cho mã số căn thì trích vào ma_so_can. ĐỪNG nhầm mã số căn với số phòng ngủ hay số
tầng. Nếu căn đã có địa chỉ đường thật thì trích dia_chi như bình thường (căn có thể có cả hai).
QUAN TRỌNG — cac_can (NHIỀU căn cùng lúc): nếu trong CÙNG một tin người rao khai TỪ 2 CĂN TRỞ
LÊN cùng một mẫu nhà/dự án, chỉ khác mã số căn (vd "tôi có 2 căn 42 và 41 đều thuộc mẫu Fusion
Gen 5", "còn các căn 40, 41, 42"), hãy liệt kê TẤT CẢ mã số căn vào mảng cac_can (["42","41"]),
và các thông tin CHUNG (dự án, mẫu nhà, giá, diện tích nếu nói chung cho mọi căn) trích như bình
thường. KHÔNG đặt is_new_listing khi dùng cac_can. Nếu chỉ 1 căn thì dùng ma_so_can, KHÔNG dùng cac_can.
QUAN TRỌNG — giu_lai_cac_can / bo_cac_can / xoa_toan_bo (BỎ BỚT / XÓA căn khỏi rổ hàng):
- CHỈ giữ một số căn ("trong 9 căn tôi chỉ có căn 23, 24 thôi", "các căn khác không phải của tôi")
  → liệt kê mã căn CẦN GIỮ vào giu_lai_cac_can (ĐỪNG để rỗng nếu ý là xóa hết).
- BỎ/XÓA vài căn CỤ THỂ ("bỏ căn 50, 3") → liệt kê vào bo_cac_can.
- XÓA HẾT / bỏ hết / xóa tất cả / làm lại cả rổ ("xóa hết rổ hàng", "bỏ hết đi", "xóa tất cả các
  căn") → đặt xoa_toan_bo=true (KHÔNG dùng giu_lai_cac_can rỗng).
Đây là thao tác XÓA — KHÁC với can_dang_noi (báo trạng thái 1 căn).
QUAN TRỌNG — can_dang_noi + trang_thai: nếu người rao nói về MỘT CĂN ĐÃ KHAI TRƯỚC ĐÓ (báo đã
bán, dừng bán, cho thuê, đổi giá...) và nhắc mã số căn/địa chỉ để chỉ căn nào (vd "căn 42 bán
rồi", "căn 41 giảm còn 2.8 tỷ"), hãy ghi can_dang_noi = mã số căn/địa chỉ đó, và nếu là báo
trạng thái thì đặt trang_thai (da_ban/dung_ban/da_cho_thue). Đây KHÔNG phải căn mới — ĐỪNG đặt
is_new_listing.
QUAN TRỌNG — is_new_listing: nếu người rao rõ ràng CHUYỂN SANG một BĐS KHÁC so với căn đang nói
(vd "còn một căn nữa", "qua căn khác", "thêm căn", địa chỉ HOÀN TOÀN khác trong khi căn cũ đã có dữ liệu),
hãy đặt is_new_listing=true và CHỈ trích thông tin của CĂN MỚI. Nếu chỉ sửa/bổ sung căn hiện tại thì để trống.
QUAN TRỌNG — lý do bán và chuyện riêng tư: nếu người rao chia sẻ lý do cần bán, hoàn cảnh gia đình
(con cái định cư/đi xa, vợ chồng không ở, nợ nần, bệnh tật, về quê...), hãy trích vào ly_do_ban
để lưu trữ nội bộ cho admin hỗ trợ. TUYỆT ĐỐI KHÔNG xếp các câu chuyện riêng tư này vào tiện ích
hay mô tả công khai của căn nhà.
QUAN TRỌNG — địa chỉ tách phần (18/10/2026): ngoài dia_chi (nguyên cụm địa chỉ khách nói), tách RIÊNG:
- duong: TÊN ĐƯỜNG khách nêu (vd "Trần Hưng Đạo", "Đường số 5", "Hẻm 137 Lê Văn Sỹ" → "Lê Văn Sỹ"). Chỉ tên đường thật —
  KHÔNG điền "hẻm", "mặt tiền", tên quận/phường, kích thước. Khách chưa nêu tên đường thì BỎ TRỐNG.
- phuong: PHƯỜNG / XÃ khách nêu, chép đúng cách khách gọi, kiểu cũ hay kiểu mới đều được ("Phường 1", "P.13", "Phường Chợ
  Quán", "xã Bình Mỹ"). Chưa nêu thì BỎ TRỐNG — KHÔNG tự suy phường từ tên đường.
- quan: QUẬN / HUYỆN / THÀNH PHỐ (cũ) khách nêu ("Quận 5", "Q7", "Bình Thạnh", "Thủ Đức").
- gan_nga_tu: khách tả vị trí bằng NGÃ TƯ / GÓC hai đường ("gần ngã tư Lê Văn Sỹ – Trần Huy Liệu", "góc Nguyễn Trãi với Trần Phú")
  → hai tên đường cách nhau bằng " | " ("Lê Văn Sỹ | Trần Huy Liệu"). Chỉ khi khách nói rõ hai đường; không suy.
Trả về JSON theo schema. Bỏ trống (không thêm key) cho thông tin chưa có."""


def property_field_props() -> dict[str, Any]:
    """Just the DATA fields of a property (no basket-action flags) — the shared payload used
    both by the flat extraction_schema and by each operation's `fields` object in
    operations_schema. Includes loai_hinh, ma_so_can, du_an, unit_type."""
    all_fields = (
        list(IDENTITY_FIELDS)
        + list(HOUSE_AREA_FIELDS)
        + sum((CORE_FIELDS[g] for g in CORE_FIELDS), [])
        + sum(CORE_THEO_LOAI.values(), [])
        + sum((SECONDARY_FIELDS[g] for g in SECONDARY_FIELDS), [])
        + list(RENTAL_FIELDS)
        + sorted(O_SAU_DANG)
    )
    all_fields = list(dict.fromkeys(all_fields))
    properties: dict[str, Any] = {
        f: {"type": "string", "description": FIELD_LABELS.get(f, f)}
        for f in all_fields
        if f != "loai_hinh"
    }
    # SRS-5.1zzzzzzz205 (theo anh Luận ce11491, "bóc tách không thiếu"): điều khách TỰ NÓI mà không có ô riêng vẫn được ghi, để nó thành điểm
    # bán trong tin. Mỗi ý một cụm ngắn NGUYÊN VĂN lời khách — code giữ cụm nào nằm trong lời khách, bỏ cụm AI tự suy.
    properties["uu_the"] = {
        "type": "array",
        "items": {"type": "string"},
        "description": "Các ƯU THẾ / điểm đặc biệt KHÁC do người rao TỰ NÓI mà KHÔNG khớp ô nào ở trên — vd 'gần trường quốc tế', 'chợ ngay đầu hẻm', "
        "'nhà mới sơn', 'tặng toàn bộ nội thất', 'khu an ninh có bảo vệ', 'hẻm thông', 'nhà 2 mặt tiền'. Mỗi ưu thế MỘT chuỗi ngắn, CHÉP NGUYÊN "
        "VĂN cụm trong lời khách. TUYỆT ĐỐI KHÔNG bịa, KHÔNG suy diễn, KHÔNG lặp thông tin đã nằm ở ô khác (giá, diện tích, pháp lý…). "
        "Không có thì bỏ trống.",
    }
    properties["loai_hinh"] = {
        "type": "string",
        "description": "Loại hình BĐS (slug khớp CRM): nha_pho, nha_cap_4, chung_cu, dat, biet_thu, "
        "phong_tro, mat_bang, toa_nha, chdv, dat_nong_nghiep, dat_kinh_doanh, kho_xuong, khach_san, du_an",
    }
    properties["ma_so_can"] = {
        "type": "string",
        "description": "Mã số căn của một BĐS dự án lúc mở bán (vd 'căn số 42', 'A-15-03', "
        "'block B tầng 5 căn 3') — dùng khi CHƯA có địa chỉ đường. KHÔNG phải số phòng ngủ/số tầng.",
    }
    properties["du_an"] = {
        "type": "string",
        "description": "Tên dự án/chung cư nếu BĐS thuộc một dự án (vd: 'Botanic Tower'). "
        "Bỏ trống nếu là nhà lẻ/không thuộc dự án.",
    }
    # 18/10/2026 (SRS-5.1zzzzzzz41): địa chỉ tách phần do AI đọc — điều kiện ra bản nháp (schema.blocking_fields) và cột
    # listings.street / ward / district đọc các ô này, không dò từ khoá trên chữ dia_chi.
    properties["duong"] = {
        "type": "string",
        "description": "Tên đường khách nêu (không số nhà, không 'hẻm'/'mặt tiền', không phường/quận). Khách gõ KHÔNG DẤU ('duong ma lo', "
        "'nha mat tien le van sy') vẫn là tên đường — ghi đúng chữ khách gõ, không tự thêm dấu (hệ thống tra kho đường, tên khớp nhiều đường "
        "thì hỏi lại khách, SRS-5.1zzzzzzz274). Chưa nêu thì bỏ trống.",
    }
    properties["phuong"] = {
        "type": "string",
        "description": "Phường/xã khách nêu, chép đúng cách gọi (cũ 'Phường 1' hay mới 'Phường Chợ Quán'). Chưa nêu thì bỏ trống, KHÔNG suy từ tên đường.",
    }
    properties["quan"] = {
        "type": "string",
        "description": "Quận/huyện/thành phố (cũ) khách nêu ('Quận 5', 'Bình Thạnh', 'Thủ Đức').",
    }
    properties["gan_nga_tu"] = {
        "type": "string",
        "description": "Ngã tư khách nói nhà nằm gần: hai tên đường cách nhau ' | ' ('Lê Văn Sỹ | Trần Huy Liệu'). Chỉ khi khách nêu rõ hai đường.",
    }
    properties["unit_type"] = {
        "type": "string",
        "description": "Tên mẫu nhà / loại căn nếu có (vd: 'Fusion Gen 5', 'Type B', 'căn góc 3PN'). "
        "Bỏ trống nếu không rõ.",
    }
    return properties


def extraction_schema() -> dict[str, Any]:
    """JSON schema covering every capturable field across all groups + rental terms."""
    properties = property_field_props()
    # SRS-5.1zzzzzzz107 (bắn thử 207, KB2): "giá 27 tỷ… đang cho thuê 50 triệu/tháng" thành tin CHO THUÊ — mô tả cũ chỉ "Có phải tin cho
    # thuê không". Hiện trạng có người thuê không phải ý khách muốn cho thuê.
    properties["is_rental"] = {"type": "boolean", "description": MO_TA_CHO_THUE}
    properties["is_new_listing"] = {
        "type": "boolean",
        "description": "Đặt true CHỈ KHI khách rõ ràng bắt đầu nói về MỘT BĐS KHÁC (vd 'còn một "
        "căn nữa', 'qua căn khác', địa chỉ HOÀN TOÀN khác trong khi căn đang nói đã có dữ liệu). "
        "TUYỆT ĐỐI KHÔNG đặt true khi khách chỉ sửa/bổ sung thông tin cho căn hiện tại.",
    }
    properties["ma_so_can"] = {
        "type": "string",
        "description": "Mã số căn của một BĐS dự án lúc mở bán (vd 'căn số 42', 'A-15-03', "
        "'block B tầng 5 căn 3') — dùng khi CHƯA có địa chỉ đường. KHÔNG phải số phòng ngủ/số tầng.",
    }
    properties["cac_can"] = {
        "type": "array",
        "items": {"type": "string"},
        "description": "Danh sách MÃ SỐ CĂN khi người rao khai TỪ 2 CĂN trở lên cùng mẫu/dự án "
        "trong CÙNG một tin (vd 'căn 42 và 41' → ['42','41']). 1 căn thì dùng ma_so_can, KHÔNG dùng cac_can.",
    }
    properties["giu_lai_cac_can"] = {
        "type": "array",
        "items": {"type": "string"},
        "description": "Khi người rao nói CHỈ GIỮ (chỉ có/chỉ bán) một SỐ căn trong rổ hàng, "
        "còn các căn khác KHÔNG phải của họ — liệt kê mã số căn CẦN GIỮ ở đây (vd 'tôi chỉ có "
        "căn 23, 24' → ['23','24']); hệ thống sẽ BỎ các căn còn lại khỏi rổ.",
    }
    properties["bo_cac_can"] = {
        "type": "array",
        "items": {"type": "string"},
        "description": "Khi người rao muốn BỎ/XÓA một số căn CỤ THỂ khỏi rổ hàng — liệt kê mã số "
        "căn CẦN BỎ ở đây (vd 'bỏ căn 50 và 3' → ['50','3']). Nếu muốn xóa HẾT thì dùng xoa_toan_bo.",
    }
    properties["xoa_toan_bo"] = {
        "type": "boolean",
        "description": "Đặt true khi người rao muốn XÓA TOÀN BỘ / xóa hết / bỏ hết / làm sạch cả "
        "rổ hàng (vd 'xóa hết rổ hàng', 'bỏ hết các căn', 'xóa tất cả', 'làm lại từ đầu'). "
        "KHÔNG dùng giu_lai_cac_can rỗng cho việc này.",
    }
    properties["can_dang_noi"] = {
        "type": "string",
        "description": "Khi người rao nói về MỘT CĂN CỤ THỂ đã khai TRƯỚC ĐÓ (báo trạng thái, "
        "đổi giá... và nhắc mã số căn HOẶC địa chỉ để chỉ rõ căn nào, vd 'căn 42 bán rồi', 'căn "
        "ở Trương Đình Hội giảm giá'), ghi mã số căn HOẶC địa chỉ của căn đó vào đây. Bỏ trống "
        "nếu đang khai căn MỚI hoặc không chỉ một căn cụ thể.",
    }
    properties["trang_thai"] = {
        "type": "string",
        "enum": ["da_ban", "dung_ban", "da_cho_thue"],
        "description": "Nếu người rao báo TRẠNG THÁI giao dịch của căn: 'da_ban' (đã bán xong), "
        "'dung_ban' (tạm dừng/không bán nữa), 'da_cho_thue' (đã cho thuê xong). Bỏ trống nếu không đổi.",
    }
    properties["du_an"] = {
        "type": "string",
        "description": "Tên dự án/chung cư nếu BĐS thuộc một dự án (vd: 'Botanic Tower'). "
        "Bỏ trống nếu là nhà lẻ/không thuộc dự án.",
    }
    properties["unit_type"] = {
        "type": "string",
        "description": "Tên mẫu nhà / loại căn nếu có (vd: 'Fusion Gen 5', 'Type B', 'căn góc 3PN'). "
        "Bỏ trống nếu không rõ.",
    }
    properties["seller_role"] = {
        "type": "string",
        "enum": ["chu_nha", "luot_song", "moi_gioi", "san", "chu_dau_tu"],
        "description": "Vai trò người rao KHI ĐÃ RÕ: 'chu_nha' (chính chủ/chủ nhà tự bán); "
        "'luot_song' (nhà đầu tư lướt sóng, giữ HĐMB bán chênh/sang nhượng); 'moi_gioi' "
        "(nhân viên môi giới, nói 'rổ hàng', 'khách của em'); 'san' (sàn giao dịch/phân phối "
        "dự án); 'chu_dau_tu' (chủ đầu tư mở bán dự án). Bỏ trống nếu chưa chắc chắn.",
    }
    return {
        "type": "object",
        "properties": properties,
        "required": [],
        "additionalProperties": False,
    }


# ── Operation-based basket editing ───────────────────────────────────────────────────
# Instead of a flat pile of flags (cac_can / giu_lai / bo / xoa_toan_bo / can_dang_noi …)
# that Python then branches through in a fixed order, the model emits an explicit, ordered
# LIST OF OPERATIONS. Each op names WHAT to do and to WHICH căn, carrying its own data
# payload. The engine executes them in order and reports back exactly what happened, so the
# reply always matches the action — no more "đã xóa hết" while the basket is untouched.
OPERATIONS_SYSTEM = """Bạn là bộ ĐIỀU PHỐI THAO TÁC rổ hàng BĐS cho AI Ơi Nhà Đất.
Diễn dịch ý định trong TIN NHẮN MỚI NHẤT của người rao thành một DANH SÁCH THAO TÁC
(operations) theo thứ tự. Các tin nhắn trước đó (nếu có) CHỈ là NGỮ CẢNH để hiểu tham chiếu
(vd khách trả lời "nó đó em" cho căn em vừa nêu) — ĐỪNG lặp lại thao tác của các lượt cũ.
Mỗi thao tác có "op" và dữ liệu kèm theo.

Các loại "op":
- "update": bổ sung/sửa thông tin cho MỘT căn. Nếu người rao đang khai căn HIỆN TẠI (chưa
  chuyển căn), bỏ trống "target". Nếu họ sửa một căn ĐÃ CÓ trong rổ và có nhắc mã số căn/địa
  chỉ (vd "căn 41 giảm còn 2.8 tỷ"), đặt "target" = mã/địa chỉ đó. Dữ liệu để trong "fields".
- "add": THÊM (những) căn MỚI vào rổ. 1 căn: "fields" chứa thông tin, "target" = mã số căn nếu
  có. NHIỀU căn cùng mẫu/dự án trong 1 tin (vd "2 căn 42 và 41 cùng mẫu Fusion"): đặt "targets"
  = ["42","41"] và thông tin CHUNG trong "fields". CHỈ dùng "add" khi rõ ràng là căn KHÁC căn
  đang khai (vd "còn một căn nữa", "qua căn khác", địa chỉ hoàn toàn khác). Khách BỔ SUNG / LÀM RÕ địa chỉ của căn đang
  khai (thêm quận, tỉnh / thành, phường, số nhà cho cùng con đường — vd vừa nói "đường Nguyễn Chí Thanh" rồi "nhà ở quận Đống
  Đa, Hà Nội") là "update" căn đó, KHÔNG "add", dù địa danh khác điều em đoán (SRS-5.1zzzzzzz108).
  "add" 1 căn PHẢI kèm "can_khac_trich" = nguyên văn cụm khách nói căn khác; khách nói thêm loại đất / pháp lý / diện tích
  của căn đang khai (vd kho xưởng rồi "sổ đỏ riêng, đất SKC 50 năm") là "update" (SRS-5.1zzzzzzz268).
- "set_status": người rao đổi TRẠNG THÁI một căn — HỄ TIN NHẮN THỂ HIỆN là tạo op này (mọi trạng
  thái của hệ thống đều đến từ lời nhắn, không có nút bấm). "status":
    • da_ban = "bán rồi / đã bán / bán xong / chốt rồi"; da_cho_thue = "cho thuê rồi / đã cho thuê".
    • da_coc = khách ĐÃ ĐẶT CỌC, chưa sang tên — "cọc rồi / nhận cọc rồi / có khách cọc / đặt cọc rồi".
    • dung_ban = "tạm dừng bán / chưa bán nữa".
    • khong_rao = NGƯNG RAO (ẩn tin, vẫn giữ dữ liệu) — "bỏ/ẩn/ngưng rao căn X".
    • thoi_dang_ky = RÚT TIN khỏi hệ thống (vẫn giữ dữ liệu) — "thôi đăng ký căn X".
    • rao = ĐĂNG / RAO LẠI một căn đang ẩn — "rao lại căn X", "đăng lại căn X", "bán lại".
  Đặt "target"/"targets" = căn nào (mã/địa chỉ); bỏ trống nếu đang nói về căn hiện tại.
- "remove": người rao muốn BỎ/NGƯNG RAO vài căn cụ thể ("bỏ căn 50 và 3") → "targets" = ["50","3"].
- "keep_only": người rao nói CHỈ GIỮ RAO một số căn ("tôi chỉ có căn 23, 24") → "targets" =
  ["23","24"] (các căn còn lại chuyển sang không rao).
- "clear": người rao muốn NGƯNG RAO toàn bộ rổ ("ẩn hết", "ngưng rao hết") → không cần target.

⚠️ QUAN TRỌNG — AOND KHÔNG BAO GIỜ XÓA DỮ LIỆU. remove/keep_only/clear chỉ chuyển sang "không rao"
(ẩn, vẫn giữ, rao lại được). Dù vậy, CHỈ tạo các op này khi người rao nói RÕ RÀNG, DỨT KHOÁT. Tin
MƠ HỒ / VÔ NGHĨA / MÉO TIẾNG (lỗi voice-to-text, vd "tránh nhau vi vu nhé") → TUYỆT ĐỐI KHÔNG tạo
op hủy; để operations RỖNG. Thà bỏ sót còn hơn ẩn nhầm.

BÓC TÁCH KHÔNG THIẾU (SRS-5.1zzzzzzz205): điều khách TỰ NÓI mà không khớp ô nào (gần trường / chợ, nhà mới sơn, tặng nội thất, khu an ninh, hẻm thông,
2 mặt tiền…) → đưa vào mảng "uu_the" trong fields, mỗi ý một cụm ngắn CHÉP NGUYÊN VĂN lời khách; vẫn tuyệt đối KHÔNG bịa.
CHỈ GHI ĐIỀU KHÁCH NÓI: mỗi ô trong "fields" phải kèm "bang_chung" = nguyên văn cụm trong lời KHÁCH. Câu BOT hỏi hay gợi ý
("có để giá thương lượng nhẹ không ạ?") KHÔNG phải lời khách: khách chưa trả lời đúng ý đó thì không ghi ô đó. Không tự suy
(nhà "mới xây", "nội thất đẹp"…) khi khách không nói. Ô thiếu bằng chứng bị hệ thống bỏ.
MỖI CỤM KHÁCH NÓI VÀO ĐÚNG MỘT Ô theo nghĩa (SRS-5.1zzzzzzz86; bắn thử: "7 tầng" vào cả ô số phòng ngủ, "phí quản lý" vào cả ô
giá điện nước) — không chép một cụm sang ô khác nghĩa.
GIÁ TRỊ Ô CŨNG CHỈ LÀ ĐIỀU KHÁCH NÓI (SRS-5.1zzzzzzz86): không suy thêm từ một con số hay một chữ — "ngõ rộng 3m" KHÔNG thành "ô tô
vào được", "hẻm 4m" KHÔNG thành "mặt tiền", "3 lầu" KHÔNG thành "có thang máy". Giá trị có từ khách không gõ thì hệ thống ghi
nguyên cụm bang_chung thay cho giá trị.

Ngoài "operations", nếu khách TỰ NÓI RA vai thì đặt "seller_role"
(chu_nha/luot_song/moi_gioi/san/chu_dau_tu) kèm "seller_role_trich_dan" = nguyên văn cụm khách gọi tên vai ("a là môi giới", "nhà chính chủ",
"bên sàn em"); cách nói việc ("a cần đăng tin", "nhà em", "chú có căn nhà") KHÔNG phải vai — bỏ trống (phí báo theo vai, đoán sai là báo sai tiền); nếu là tin cho thuê đặt "is_rental"=true ("đang cho thuê X/tháng" khi rao BÁN là hiện trạng, không phải tin cho thuê).

PHÂN BIỆT Ý ĐỊNH KHÁCH ("user_intent") BẰNG TOÀN BỘ NGỮ CẢNH (Semantic Understanding):
- "sell": Người bán / cho thuê gửi thông tin BĐS của họ, HOẶC người bán hỏi thăm tình hình bán/thị trường (vd: "giá này có khách mua không em?", "có ai hỏi mua chưa?", "bên mua có trả giá không?"). Việc nhắc tới chữ "mua" trong câu hỏi VẪN LÀ "sell"!
- "buy": Khách thể hiện rõ nhu cầu cá nhân ĐANG TÌM MUA hoặc TÌM THUÊ BĐS (vd: "tôi cần tìm mua căn nhà phố", "tìm thuê chung cư 2PN", "anh muốn mua đầu tư tầm 5 tỷ"). Nếu có thông tin nhu cầu thì trích xuất vào "buyer_lead".
  Khách hỏi về MỘT CĂN ĐANG RAO bằng mã tin (#ABCD1234) hay link tin trên web — hỏi giá, kích thước, pháp lý, xin ảnh, hẹn xem — mà căn đó
  không phải của họ cũng là "buy" (SRS-5.1zzzzzzz273), dù họ nhắn số ký gửi.
  KHÁCH VỪA MUA VỪA BÁN: một người có thể rao bán vài căn và cũng đang tìm mua. Mỗi tin xét THEO NGHĨA CỦA TIN ĐÓ trong cuộc trò chuyện, không theo việc họ từng
  rao bán: khách hỏi / hẹn xem / hỏi giá / hỏi chủ nhà về căn bot VỪA giới thiệu hoặc báo cho họ xem (vd "mình xem thử thứ 7 được không", "căn đó còn
  không em", "9h nhé" đáp lại lời hẹn xem) là "buy" dù trước đó họ từng gửi bán.
- "unknown": Chào hỏi chung, hỏi phí, hỏi công ty mà chưa rõ họ muốn bán hay mua.
- "hoi_ngoai_viec" (25/10/2026, SRS-5.1zzzzzzz177): khách hỏi / kể việc KHÔNG thuộc mua bán / thuê nhà đất (đồng hồ nước, điện, phí quản lý
  khu dân cư, hành chính, chuyện riêng, hỏi nhầm công ty khác…) và CHƯA tỏ ý gửi bán hay tìm mua → hoi_ngoai_viec = NGUYÊN VĂN câu đó,
  user_intent = "unknown", operations RỖNG — KHÔNG ghi ô nào từ câu đó, kể cả địa chỉ / tên khu khách nêu để hỏi việc khác (chat thử 24/10:
  cư dân hỏi "đồng hồ nước trước cổng ngày nào cắt" bị hỏi địa chỉ rồi thành tin rao). Câu hỏi pháp lý / thủ tục nhà đất → hoi_phap_ly,
  không phải mục này. Khách đã nói rõ bán / mua rồi mới hỏi việc khác → bỏ trống.

VIỆC CỦA KHÁCH MUA ("mua", chỉ khi người nhắn là khách tìm mua / thuê — 19/10/2026): đọc theo NGHĨA tin khách VỪA nhắn.
- "ma_can": mã căn khách đang nói tới — chỉ lấy mã khách gõ (#ABCD1234, BDS-Q5-0012) hoặc mã trong danh sách CĂN ĐANG CÓ bot vừa
  gửi khi khách chỉ rõ căn đó ("căn đầu", "căn 5 tỷ ở Q5"). Không chắc căn nào thì để trống.
- "quan_tam": true khi khách tỏ ý thích / muốn tìm hiểu / muốn xem căn đó.
- "hen_xem": nguyên văn cụm thời gian khách HẸN đi xem ("chiều mai 3h", "thứ 7 này"). Chỉ hỏi "xem được không" mà chưa nói giờ thì
  để trống.
- "hoi_chu_nha": nguyên văn câu khách hỏi về căn mà dòng của căn KHÔNG có câu trả lời (vd "sổ riêng hay chung", "chủ có bớt không").
  Khách vừa ĐỒNG Ý để em hỏi chủ nhà câu khách hỏi ở lượt trước ("ừ hỏi giúp anh") → chép nguyên văn câu hỏi đó từ lượt trước — kể cả khi
  em đã gửi hết ảnh của căn và khách đồng ý để em xin chủ nhà thêm ảnh (chép nguyên văn câu khách xin ảnh ở lượt trước).
  Hỏi thứ dòng của căn đã có (giá, diện tích) thì để trống. Khách hỏi về DỰ ÁN đang nói (còn căn tầng cao không, tầng mấy, căn góc…) mà khối
  dự án / căn trong dự án không có câu trả lời thì cũng chép nguyên văn câu đó vào đây (hệ thống hỏi chủ nhà có căn trong dự án, không có thì
  hỏi admin — SRS-5.1zzzzzzz250).
- "xin_anh": true khi khách xin XEM ẢNH / HÌNH của căn (vd "cho xem ảnh", "gửi hình đi em", "có hình thật không", "gửi lại ảnh giúp anh"),
  kể cả khi bot đã gửi ảnh ở trên rồi. Khách chỉ hỏi chung "căn này đẹp không" thì để trống.
- "khong_hop" (25/10/2026, SRS-5.1zzzzzzz175): true khi khách CHÊ / TỪ CHỐI căn đang nói tới — không hợp, không thích, bỏ qua căn này,
  xa quá, đắt quá, hẻm nhỏ quá… ("căn đó không hợp", "thôi bỏ căn này", "xa trường con quá", "giá đó cao quá anh không với tới"). Kèm
  "ly_do" = NGUYÊN VĂN cụm khách nêu lý do (bỏ trống nếu khách không nói vì sao). Khách chỉ hỏi thêm hay so sánh chưa quyết thì để trống.
- "ngung_bao" (25/10/2026, SRS-5.1zzzzzzz175): "tat" khi khách bảo ĐỪNG gửi / đừng nhắn / đừng báo căn nữa, ngưng tin tự động ("đừng gửi
  nữa em", "thôi khỏi báo căn", "ngưng nhắn anh nha"); "bat" khi khách XIN được báo lại khi có căn mới ("có căn mới thì nhắn anh"). Khách
  chỉ từ chối MỘT căn (khong_hop) không phải ngưng báo → bỏ trống.
- "hoi_du_an" (25/10/2026, SRS-5.1zzzzzzz184): NGUYÊN VĂN tên dự án khi khách hỏi THÔNG TIN về một dự án (chủ đầu tư là ai, tiện ích, pháp lý,
  giá, bàn giao, "dự án X có gì / tốt không / của ai"). Chỉ lấy tên khách gõ, không tự suy tên đầy đủ. Khách chỉ nhắc tên dự án như vị trí tìm
  nhà (không hỏi về dự án) thì để trống.
- "du_an_khu_vuc" (28/10/2026, SRS-5.1zzzzzzz250): NGUYÊN VĂN khu vực khi khách hỏi khu đó CÓ NHỮNG DỰ ÁN NÀO ("quận 7 có dự án gì",
  "bên Thủ Đức có chung cư nào"); kèm "du_an_khu_vuc_chuan" = tên hành chính đầy đủ của khu đó ("Quận 7", "Thủ Đức", "Phường Phú Định").
  Khách tìm CĂN ở khu đó (không hỏi danh sách dự án) thì để trống.
- "tim_du_an" (28/10/2026, SRS-5.1zzzzzzz250): NGUYÊN VĂN tên dự án khi khách muốn TÌM / XEM CĂN đang bán hoặc cho thuê TRONG dự án đó, hay xin
  danh sách / bảng căn còn bán của dự án ("Masteri còn căn nào không", "gửi anh bảng căn còn bán ở Ny'ah"). Chỉ hỏi thông tin dự án thì dùng
  "hoi_du_an", không dùng ô này.
- "can_cu_the" (29/10/2026, SRS-5.1zzzzzzz262): NGUYÊN VĂN cụm khách tả MỘT căn CỤ THỂ họ đã thấy / nghe ở đâu đó mà KHÔNG gõ mã, và hỏi còn
  không / hỏi về chính căn đó (vd "nhà hẻm xe hơi Trần Bình Trọng giá 10 tỷ còn không", "căn 2PN Sunrise City 3 tỷ đăng hôm qua"). Khách tả
  NHU CẦU tìm nhà ("tìm nhà quận 5 tầm 10 tỷ", "cần nhà 4 tầng gần trường") hay nói căn bot VỪA giới thiệu thì để trống.
- "xin_anh_trich" / "khong_hop_trich" / "ngung_bao_trich": NGUYÊN VĂN cụm trong TIN KHÁCH VỪA NHẮN làm căn cứ cho đúng việc đó (vd "cho anh xem
  thêm ảnh", "nhỏ quá, không hợp", "đừng báo căn mới cho anh nữa") — mỗi việc một cụm, code kiểm từng việc riêng.
- "trich_dan": nguyên văn cụm trong TIN KHÁCH VỪA NHẮN làm căn cứ cho các ô trên. Mọi ô chỉ đọc theo tin VỪA nhắn: giờ hẹn / câu hỏi khách đã nói
  ở lượt TRƯỚC thì KHÔNG chép lại (để trống "hen_xem"), trừ khi khách nhắc lại hoặc ghép giờ hẹn từ vài tin ngắn liền nhau.

TRẢ LỜI CÂU KHÁCH HỎI ("tra_loi_khach_hoi", chỉ khi có khối CÂU KHÁCH MUA ĐANG HỎI CHỦ NHÀ và người rao vừa trả lời đúng câu đó):
"id" của câu, "tra_loi" là nguyên văn câu trả lời của người rao. Người rao nói chuyện khác thì để trống.
Câu trả lời đó là thông tin về CHÍNH căn được hỏi (pháp lý, hướng, hẻm, số phòng…) → NGOÀI "tra_loi_khach_hoi", ghi luôn vào ô tin bằng MỘT op
"update" target = mã căn được hỏi, kèm "bang_chung" là cụm người rao vừa nói (SRS-5.1zzzzzzz257) — không thì tin vẫn thiếu ô đó và em hỏi lại.

QUY TẮC:
- Người rao chỉ khai thông tin bình thường (chưa có gì đặc biệt) → MỘT op "update" target trống.
- DUYỆT BẢN TIN / ĐỒNG Ý ĐĂNG TIN ("ừ em lên tin đi", "lên bài đi", "đăng đi em", "ok em đăng đi", "duyệt", "chuẩn rồi em", "được rồi em"):
  ĐÂY LÀ ĐỒNG Ý BẢN DỰ THẢO TIN RAO CỦA CĂN HIỆN TẠI ĐỂ CHÀO KHÁCH.
  ⚠️ TUYỆT ĐỐI CẤM TẠO THAO TÁC "add" (thêm căn mới) khi khách duyệt tin hoặc hỏi phí! Phải để operations RỖNG.
  CHỈ tạo thao tác "add" khi khách nói RÕ RÀNG muốn rao MỘT CĂN KHÁC (vd: "tôi còn căn nữa ở...", "thêm căn số 2...", "qua căn khác...").
- CÂU HỎI hoặc YÊU CẦU XEM ("bản vẽ căn 24", "cho xem mặt bằng", "căn 42 giá bao nhiêu", "có
  hình không", "phí bao nhiêu") KHÔNG phải thao tác rổ hàng → operations RỖNG. TUYỆT ĐỐI đừng suy ra add/update
  chỉ vì tin nhắn có nhắc một mã căn.
- remove / keep_only / clear CHỈ khi khách nói RÕ ý muốn bỏ/xóa/chỉ giữ (bỏ, xóa, không bán nữa,
  chỉ giữ, xóa hết...). Nhắc một mã căn trong câu hỏi KHÔNG BAO GIỜ là remove/keep_only/clear.
- Diện tích: nhà phố/biệt thự/nhà cấp 4 có 2 diện tích. Rõ đất/nhà → dien_tich_dat/dien_tich_nha (xem ĐỌC DẤU HIỆU bên dưới);
  không có dấu hiệu nào → để tạm dien_tich. Loại khác chỉ có 1 dien_tich.
ĐỌC DẤU HIỆU NHƯ MÔI GIỚI LÂU NĂM (19/10/2026, SRS-5.1zzzzzzz74 — chủ dự án: "bot thông minh phải hiểu dấu hiệu căn này thuộc về gì"):
- Loại hình (loai_hinh) suy theo dấu hiệu, không chờ khách gọi tên: "căn nhà" / "nhà" kèm số tầng / lầu, mặt tiền, hẻm, hoặc nằm ở
  các quận nội thành cũ của TP.HCM (Quận 1–12, Phú Nhuận, Bình Thạnh, Tân Bình, Tân Phú, Gò Vấp, Bình Tân, Thủ Đức…) → nha_pho.
  "căn hộ", "chung cư", "block / tầng X căn Y", tên toà chung cư → chung_cu. "lô đất", "đất nền", "đất thổ cư", "đất trống" → dat.
  Cho thuê NGUYÊN CĂN ("nhà nguyên căn", "nhà trọ nguyên căn", "thuê nguyên căn" — cả căn nhà có trệt / lầu / phòng ngủ) → nha_pho;
  phong_tro chỉ khi cho thuê TỪNG PHÒNG trong dãy / nhà trọ (20/10: khách "cho thuê nhà trọ nguyên căn, 1 trệt 1 lầu 2PN" bị xếp
  phòng trọ, bot hỏi gác lửng / WC riêng).
  "Nhà" / "căn nhà" trong khu dự án / khu dân cư (vd "bán nhà trong khu dự án Nyah Phú Định") → nha_pho; chung_cu chỉ khi khách nói
  căn hộ / chung cư / tòa / block / tầng X (20/10: bot hỏi "tòa nào, tầng mấy" cho nhà phố trong dự án).
  Vùng ven / tỉnh (Bình Chánh, Củ Chi, Hóc Môn, Nhà Bè, Cần Giờ, Long An, Bình Dương, Đồng Nai, Tây Ninh…) mà khách chỉ nói "nhà",
  không có số tầng / lầu → có thể là nhà cấp 4, nhà vườn hay nhà phố → để trống loai_hinh, hệ thống sẽ hỏi.
- Diện tích nhà phố: một con số m² nói KÈM số tầng / lầu hoặc kích thước ("80m 5 tầng", "nhà 60m2 3 lầu", "4x20") là diện tích ĐẤT
  (cách nói chuẩn của giới mua bán: diện tích công nhận trên sổ) → dien_tich_dat. Chỉ là diện tích nhà (dien_tich_nha) khi khách
  nói "sàn", "sử dụng", "xây dựng", "tổng diện tích sàn". Không có dấu hiệu nào mới để tạm dien_tich.
  Viết tắt (20/10): "dtsd" / "DTSD" / "dt sử dụng" = diện tích SỬ DỤNG → dien_tich_nha; "dtđ" / "dt đất" = đất → dien_tich_dat.
  "DTCN" / "dt công nhận" / "diện tích công nhận" = diện tích ĐẤT công nhận trên sổ → dien_tich_dat, KHÔNG BAO GIỜ là sàn (26/10: "DT 4x18m
  – DTCN 71m²" bị ghi thành 71m² sàn).
  "dts" có thể là diện tích sổ hoặc sàn: con số bằng ngang × dài khách đã nói (4x11 → 44) là ĐẤT; còn lại để tạm dien_tich. Số
  bằng ngang × dài luôn là diện tích ĐẤT, không bao giờ là diện tích sàn của nhà nhiều tầng.
  "MT 20m" / "mặt tiền đường 20m" nói cạnh TÊN ĐƯỜNG là độ rộng con ĐƯỜNG → lo_gioi_duong; mat_tien là bề ngang của chính căn
  nhà (lô 4x11 → ngang 4m), không bao giờ lớn hơn chiều của lô.
  Độ rộng theo QUY HOẠCH ("quy hoạch mở rộng 25m", "lộ giới quy hoạch 20m", "sắp mở rộng đường") là chuyện SAU NÀY → quy_hoach, KHÔNG
  ghi vào lo_gioi_duong (lo_gioi_duong = đường rộng bao nhiêu BÂY GIỜ). 26/10: "mặt tiền quy hoạch mở rộng 25m" bị ghi lo_gioi_duong = 25 rồi
  tin rao viết "đường rộng 25m".
- Đừng nhầm mã số căn với số phòng ngủ/số tầng.
- DUYỆT BẢN NHÁP (18/10/2026; 20/10 theo trạng thái): chỉ khi có dòng "TRẠNG THÁI: bot ĐÃ gửi bản tin nháp" bên dưới (bot đã gửi
  bản nháp — kể cả khi sau đó bot nhắc hay hỏi xác nhận "đã ổn chưa"), đọc theo NGHĨA tin khách vừa nhắn: đồng ý cho đăng (ok, được rồi, đăng đi, chuẩn rồi, thả tim / like…) →
  duyet_ban_nhap = "dong_y"; KHÔNG đồng ý / chưa muốn đăng / muốn sửa trước rồi mới đăng → "khong_dong_y". Hỏi lại, hỏi phí,
  nói chuyện khác hay chưa rõ → bỏ trống. Có điền thì duyet_trich_dan = NGUYÊN VĂN cụm trong tin khách cho thấy điều đó.
  "[khách gửi sticker]" / "[khách gửi sticker: …]" là nhãn dán → KHÔNG phải đồng ý, bỏ trống. "[khách thả cảm xúc ❤️]" / 👍 / 👌 (thả
  lên tin bot hoặc gõ trong tin) là đồng ý.
- LỜI XÃ GIAO (23/10/2026, đọc theo NGHĨA tin khách vừa nhắn, không theo từ khoá): loi_xa_giao = "chao" khi tin CHỈ là lời chào hỏi
  (hello, hi, chào em, xin chào…) chưa nói nhu cầu nhà đất; "dong_y" khi tin CHỈ là lời đáp ngắn đồng ý / cảm ơn (ok, vâng, ừ, được rồi,
  cảm ơn…) KHÔNG kèm thông tin hay câu hỏi mới. Còn lại bỏ trống. Có điền thì loi_xa_giao_trich_dan = NGUYÊN VĂN cụm đó trong tin khách.
- KHÁCH HỎI VỀ GÌ (19/10/2026, đọc theo NGHĨA tin khách vừa nhắn, không theo từ khoá): hoi_ve = "phi" khi khách hỏi phí / hoa
  hồng / có mất tiền không của BÊN MÌNH (KHÔNG phải phí quản lý, thuế, phí sang tên của căn nhà); "uy_tin" khi khách hỏi công
  ty là ai, có uy tín / lừa đảo không, trụ sở ở đâu; "link_web" khi khách hỏi link tin, xem tin ở đâu, tin trên web thế nào;
  "tinh_hinh_ban" (21/10) khi CHỦ NHÀ hỏi căn của mình đã có ai hỏi / quan tâm / hẹn xem chưa, bán tới đâu rồi; "dinh_gia" khi
  chủ nhà hỏi giá mình đưa cao hay thấp, giá thị trường khu đó bao nhiêu, nên bán giá nào.
  Không hỏi những điều đó → bỏ trống. Có điền thì hoi_ve_trich_dan = NGUYÊN VĂN cụm câu hỏi trong tin khách.
- HỎI PHÁP LÝ / THỦ TỤC / THUẾ PHÍ (25/10/2026, SRS-5.1zzzzzzz176, đọc theo NGHĨA): khách (mua hay bán) hỏi một điều về thủ tục, giấy tờ,
  thuế phí, quy định mua bán / thuê nhà đất nói chung — KHÔNG phải hỏi về một căn cụ thể đang rao, KHÔNG phải phí môi giới bên mình (đó là
  hoi_ve = "phi") → hoi_phap_ly = khoá hợp nhất trong DANH MỤC PHÁP LÝ bên dưới; không mục nào hợp → "khac". Kèm phap_ly_trich_dan =
  NGUYÊN VĂN câu hỏi của khách. Câu thuộc nhóm TRANH CHẤP / KIỆN TỤNG / THỪA KẾ, CHIA DI SẢN / LY HÔN CHIA TÀI SẢN / NGHI GIẤY TỜ GIẢ, LỪA
  ĐẢO / CÁCH GIẢM, TRÁNH THUẾ / hồ sơ cụ thể cần người đọc giấy tờ → phap_ly_nhay_cam = true (vẫn điền hoi_phap_ly nếu có khoá hợp).
  Khách chỉ kể tình trạng pháp lý căn của mình ("sổ hồng riêng", "chưa hoàn công") KHÔNG phải câu hỏi → bỏ trống.
  Câu có chữ "phí" mà hỏi khoản PHẢI NỘP khi mua / bán / sang tên nhà (thuế, lệ phí, phí công chứng — "bán nhà phải nộp những thuế
  phí gì", "sang tên tốn phí gì") là câu PHÁP LÝ, kể cả khi người hỏi là CHỦ NHÀ đang rao tin → hoi_phap_ly, KHÔNG hoi_ve = "phi".
  Khách hỏi lẫn cả hai (thuế phí nhà nước và phí bên mình) → chỉ điền hoi_phap_ly.
  DANH MỤC PHÁP LÝ (khoá: nội dung):
{DANH_MUC_PHAP_LY}
- KHÁCH TỰ XƯNG (đọc cả các lượt trước): xung_ho = "em" khi khách tự xưng em ("nhà em", "em gửi"); "anh" / "chi" khi khách
  tự xưng anh / chị; "chau" khi khách TỰ XƯNG cháu / con ("cháu muốn bán nhà", "con có căn…"); "chu_co_bac" khi khách tự xưng chú / cô / bác / dì
  — chữ đó đứng làm CHỦ NGỮ câu khách kể việc của mình ("chú bán nhà ở…", "cô có căn…", "bác cần bán gấp") là TỰ XƯNG (SRS-5.1zzzzzzz245).
  Chỉ điền ĐÚNG MÃ trong danh sách (em / anh / chi / chau / chu_co_bac), không điền chữ khách gõ. Chữ "em" khách dùng để GỌI bot ("đăng đi em") không
  phải tự xưng. Khách gõ tắt cũng tính: "e" = em, "a" = anh, "c" = chị ("e tìm thuê", "a là MG"). Khách GỌI bot là "con" /
  "cháu" ("sao hỏi nhiều vậy con") = khách lớn tuổi → "chu_co_bac". Chưa thấy → bỏ trống. Có điền thì xung_ho_trich_dan =
  NGUYÊN VĂN cụm chứa chữ xưng / chữ gọi đó.
- BOT VỪA HỎI GÌ (SRS-5.1zzzzzzz212): bot_vua_hoi = danh sách KHOÁ ô (đúng tên khoá ở fields: phuong, dia_chi, gia, dien_tich_dat,
  phap_ly_hoan_cong…) mà TIN GẦN NHẤT CỦA BOT thật sự hỏi khách — đọc theo nghĩa câu hỏi của bot, không theo việc khách trả lời
  ("cho em xin phường nhà mình" → ["phuong"]; "nhà ở đường nào, phường nào" → ["dia_chi", "phuong"]). Bot không hỏi ô nào → [].
- XIN XEM BẢN VẼ (19/10/2026): xin_xem_ban_ve = NGUYÊN VĂN cụm khách XIN XEM / XIN GỬI bản vẽ, mặt bằng (bản vẽ tầng / căn /
  tổng thể), sơ đồ, phối cảnh, layout, brochure. "cho thuê mặt bằng kinh doanh", "bán mặt bằng" là LOẠI BĐS, không phải xin bản
  vẽ → bỏ trống. Có điền thì operations RỖNG (xin xem không phải sửa rổ hàng). Khách xin bản đồ / phân lô / quy hoạch / mặt
  bằng tổng thể của cả DỰ ÁN (không phải bản vẽ một căn / một mẫu nhà) thì thêm ban_do_du_an = true.
- HỎI THÔNG TIN DỰ ÁN: cau_hoi_du_an = NGUYÊN VĂN câu khách HỎI thông tin dự án / mẫu nhà / lô / gói nội thất ("lô 42 diện tích
  bao nhiêu", "gói Max gồm gì", "mẫu này mấy phòng"). Khách KỂ thông tin căn của mình ("căn này 50m2") không phải câu hỏi → bỏ trống.
- TẢ DỰ ÁN: mo_ta_du_an = NGUYÊN VĂN cụm khách TẢ kiến thức CHUNG của dự án / mẫu nhà (tiện ích, cổng, pháp lý dự án, bố trí mẫu
  nhà, số tầng của mẫu…) để hệ thống học lại. Chỉ nói giá / căn riêng của mình → bỏ trống.
- XIN GẶP NGƯỜI THẬT (20/10/2026, SRS-5.1zzzzzzz82): can_nguoi_that = NGUYÊN VĂN cụm khách XIN nói chuyện / gặp / gọi điện với
  NGƯỜI (nhân viên, quản lý, môi giới, "người thật", "không muốn chat với máy"). Hỏi bot là người hay máy, hay chỉ than chậm, KHÔNG
  phải xin gặp người → bỏ trống. Có điền thì vẫn ghi các ô tin khác như thường.
- NGOÀI VÙNG NHẬN TIN (20/10/2026, SRS-5.1zzzzzzz86): bên mình chỉ nhận rao ở TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu, Long An, Tây Ninh, Đồng Nai — tính theo địa giới cũ lẫn mới (TP.HCM
  mới gồm Bình Dương và Bà Rịa – Vũng Tàu cũ; Tây Ninh mới gồm Long An cũ; Đồng Nai cũ — Biên Hòa, Long Thành, Nhơn Trạch, Trảng Bom… —
  là TRONG vùng; chỉ phần Bình Phước cũ — Đồng Xoài, Bình Long, Phước Long… — dù nay thuộc Đồng Nai vẫn là NGOÀI vùng).
  ngoai_vung = tên tỉnh / thành của căn KHI khách đã nói rõ địa danh nằm ngoài vùng (vd "quận Đống Đa, Hà Nội" → "Hà Nội"; "nhà
  ở Đà Nẵng" → "Đà Nẵng"; "Đồng Xoài, Bình Phước" → "Bình Phước"). Tên thành phố / thị xã / quận / huyện / đảo đủ biết tỉnh là ĐÃ
  RÕ, điền luôn dù khách không nói tên tỉnh (21/10, SRS-5.1zzzzzzz100: "Trần Phú, Nha Trang" → "Khánh Hòa"; "Ngô Quyền, Hải Phòng" →
  "Hải Phòng"; Đà Lạt → "Lâm Đồng"; Phú Quốc → "Kiên Giang"). Chỉ có tên đường (trùng ở nhiều tỉnh) hay chưa rõ nơi nào → bỏ
  trống, KHÔNG đoán. Có điền thì ngoai_vung_trich_dan = NGUYÊN VĂN cụm địa danh khách nói.
- KHÁCH BẢO ĐĂNG (20/10/2026, SRS-5.1zzzzzzz86): xin_dang = NGUYÊN VĂN cụm khách bảo đăng tin / lên tin / xin xem bản tin hoàn chỉnh
  (vd "ok em đăng đi", "đăng giúp anh", "soạn tin cho chị xem"). Chỉ hỏi phí, hỏi link web, hay đang kể thông tin căn → bỏ trống.
- KHÁCH DẶN CÁCH VIẾT BẢN TIN (27/10/2026, SRS-5.1zzzzzzz218): yeu_cau_viet = danh sách cụm NGUYÊN VĂN trong tin khách vừa nhắn dặn bot
  viết / sửa bản tin THẾ NÀO — không phải dữ liệu căn: nhấn mạnh hay bớt ý nào ("mặt tiền 5m xứng đáng để nói", "đừng đem lên tiêu đề"),
  không lặp ("bàn giao tức thì nói 2 lần"), thêm / bớt icon ("cho dùm anh 2-3 cái hình tượng"), ngắn / dài hơn, đổi giọng, đổi tiêu đề.
  Mỗi ý MỘT cụm, chép đúng chữ khách. Khách chỉ ĐÍNH CHÍNH số liệu ("mặt tiền có 5m thôi") thì đó là dữ liệu → ghi ô, KHÔNG phải yeu_cau_viet.
  Không dặn gì → [].
- GIÁ TRỊ Ô LÀ CỤM DỮ LIỆU, KHÔNG PHẢI CẢ CÂU KHÁCH: ghi "đang cho thuê, bàn giao ngay được" — KHÔNG ghi nguyên câu "Người ta thuê 1 năm
  nhưng mà anh có thể bàn giao tức thì mà em". Câu khách NHỜ / YÊU CẦU bot làm gì ("cho dùm anh 2-3 cái hình", "em rao lại xem") KHÔNG
  BAO GIỜ là giá trị ô (hinh_anh, mo_ta…) — để yeu_cau_viet hoặc bỏ. Ô mà câu khách hỏi ("?") không phải dữ liệu → bỏ.
- XÁC NHẬN XOÁ: chỉ khi tin NGAY TRƯỚC của bot hỏi xác nhận ẩn / bỏ / chỉ giữ căn: xac_nhan_xoa = "dong_y" (khách đồng ý làm) hoặc
  "tu_choi" (khách không muốn, giữ nguyên), kèm xac_nhan_trich_dan = NGUYÊN VĂN cụm đó. Nói chuyện khác → bỏ trống.
- ĐỊA CHỈ ĐẦY ĐỦ: fields.dia_chi luôn là địa chỉ ĐẦY ĐỦ của căn sau khi GHÉP phần khách vừa nói (số nhà, hẻm, phường, quận) vào
  phần ĐANG GHI (khối "ĐỊA CHỈ ĐANG GHI" bên dưới, nếu có) và SỬA theo lời đính chính mới nhất — không trả một mảnh rời.
- TIN HỆ THỐNG trong ngoặc vuông: "[Tin nhắn thoại của khách]: "…"" là lời khách NÓI, đọc như chữ khách gõ (chữ chép từ giọng
  nói có thể sai chính tả); "[khách gửi sticker]" / "[khách gửi sticker: …]" là nhãn dán, không có thông tin BĐS.

{SLANG_NOTES}

Trả về JSON đúng schema."""
# 18/10/2026: chuỗi trên không phải f-string nên model từng nhận nguyên chữ "{SLANG_NOTES}" — thay ở đây (trong chuỗi còn
# ngoặc nhọn của ví dụ JSON nên không đổi cả chuỗi thành f-string).
OPERATIONS_SYSTEM = OPERATIONS_SYSTEM.replace("{SLANG_NOTES}", SLANG_NOTES)
# SRS-5.1zzzzzzz176: danh mục khoá pháp lý lấy từ phap_ly.MAC_DINH (khoá cố định trong code; DB chỉ sửa câu trả lời).
OPERATIONS_SYSTEM = OPERATIONS_SYSTEM.replace("{DANH_MUC_PHAP_LY}", phap_ly.danh_muc_cho_prompt())


# ── Scoping a price-list import by what the seller actually sells ─────────────────────
# A bảng giá lists the WHOLE project inventory, but a broker usually sells only SOME căn
# ("tôi bán 2 căn Cosmo Gen 2 trong này"). The full list is kept as a reference doc; only
# the căn the seller rao go into their basket. The model maps the seller's words → mã lô.
INVENTORY_SCOPE_SYSTEM = """Người bán gửi một BẢNG GIÁ (rổ hàng của CẢ dự án) kèm một lời nhắn.
Nhiệm vụ: xác định NGƯỜI BÁN CÓ Ý RAO BÁN căn nào KHÔNG, và nếu có thì căn nào TRONG BẢNG.

CỰC KỲ QUAN TRỌNG — GỬI BẢNG GIÁ ≠ RAO BÁN. Chỉ đưa căn vào rổ khi lời nhắn thể hiện RÕ Ý MUỐN
RAO/BÁN ("tôi bán...", "tôi rao...", "gửi bán...", "cho lên tin căn..."). Nếu lời nhắn KHÔNG có ý
rao (chỉ gửi file, hoặc là câu HỎI/TRA CỨU như "xem diện tích các căn trong đó", "dự án này có gì",
"tham khảo giúp anh"), thì đặt co_y_rao=false và cac_ma_lo=[] — KHÔNG tự ý cho căn nào vào rổ.
Nếu CÓ ý rao thì đặt co_y_rao=true và:
- Nếu ý nói rao CẢ bảng / tất cả / mọi căn → đặt ban_tat_ca=true.
- Nếu chỉ rao MỘT SỐ căn — theo MẪU NHÀ (vd "bán Cosmo Gen 2", "rao mấy căn Office") HOẶC theo
  MÃ LÔ (vd "bán căn 42 và 50", "rao lô 3, 7") — liệt kê MÃ LÔ tương ứng vào cac_ma_lo, dựa trên
  bảng đã cho. Chỉ chọn mã lô CÓ trong bảng.
- "Cosmo" và "Cosmo Gen 2" là hai MẪU NHÀ RIÊNG BIỆT, NGANG HÀNG (anh em), chỉ CHUNG gốc tên
  "Cosmo" — KHÔNG phải cái này là phiên bản/con của cái kia. Khi khách nói một tên NGẮN/GỐC
  ("Cosmo") mà bảng có NHIỀU mẫu cùng bắt đầu bằng tên đó (Cosmo, Cosmo Gen 2...), khách có thể ý
  nói CẢ NHÓM các mẫu anh em đó; khi khách nói tên ĐẦY ĐỦ ("Cosmo Gen 2") thì chỉ đúng mẫu đó.
- DÙNG SỐ LƯỢNG khách nêu để chọn cho khớp: vd bảng có lô 42=Cosmo Gen 2, lô 50=Cosmo Gen 2, lô
  3=Cosmo; khách nói "3 căn Cosmo" → đúng bằng 3 căn nhóm tên Cosmo (42, 50, 3). Khách nói "2 căn
  Cosmo Gen 2" → chỉ 42, 50. Ưu tiên cách hiểu cho ra ĐÚNG số căn khách nói.
- Nếu KHÔNG CHẮC CHẮN phạm vi (lời nhắn mơ hồ; số lượng không khớp rõ; tên mẫu vừa có thể là 1
  mẫu vừa có thể là cả nhóm mà không có số lượng chốt lại) → đặt khong_chac=true, VẪN đưa cách
  hiểu KHẢ DĨ NHẤT vào cac_ma_lo (để bot hỏi lại khách xác nhận).
ĐỪNG nhầm số ĐẾM ("2 căn", "3 căn") là mã lô. Trả JSON đúng schema."""


def inventory_scope_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "co_y_rao": {"type": "boolean",
                         "description": "true nếu lời nhắn thể hiện RÕ ý MUỐN RAO/BÁN. false nếu chỉ "
                         "gửi file / hỏi / tra cứu (khi đó KHÔNG cho căn nào vào rổ)."},
            "ban_tat_ca": {"type": "boolean",
                           "description": "true nếu người bán rao CẢ bảng / không giới hạn căn nào."},
            "cac_ma_lo": {"type": "array", "items": {"type": "string"},
                          "description": "Danh sách MÃ LÔ mà người bán thực sự rao (khi chỉ bán một số căn)."},
            "khong_chac": {"type": "boolean",
                           "description": "true nếu KHÔNG chắc phạm vi (mơ hồ) — bot sẽ hỏi lại xác nhận."},
        },
        "required": [],
    }


def operations_schema() -> dict[str, Any]:
    """Schema for the operation-plan the model returns: an ordered list of basket operations,
    each self-describing (op kind + target(s) + a `fields` data payload), plus the sticky
    conversation attributes (seller_role, is_rental)."""
    op = {
        "type": "object",
        "properties": {
            "op": {
                "type": "string",
                "enum": ["update", "add", "set_status", "remove", "keep_only", "clear"],
                "description": "Loại thao tác. update=sửa/bổ sung 1 căn; add=thêm căn mới; "
                "set_status=đổi trạng thái giao dịch; remove=bỏ vài căn; keep_only=chỉ giữ vài "
                "căn; clear=xóa cả rổ.",
            },
            "target": {
                "type": "string",
                "description": "Mã số căn HOẶC địa chỉ của căn bị tác động. Bỏ trống nếu là căn "
                "đang khai (update) hoặc chưa chỉ rõ căn nào.",
            },
            "targets": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Nhiều mã số căn khi thao tác áp cho NHIỀU căn (add nhiều căn cùng "
                "mẫu, remove/keep_only nhiều căn). Vd ['42','41'].",
            },
            "fields": {
                "type": "object",
                "properties": property_field_props(),
                "description": "Dữ liệu BĐS của thao tác này (du_an, unit_type, gia, diện tích, "
                "ma_so_can...). Chỉ dùng cho update/add.",
            },
            "bang_chung": {
                "type": "object",
                "additionalProperties": {"type": "string"},
                "description": "Với MỖI ô trong fields: tên ô -> NGUYÊN VĂN cụm trong lời KHÁCH (không phải lời bot) cho thấy giá trị "
                "đó (vd {\"gia\": \"giá 8,5 tỷ\", \"dien_tich\": \"4,5x11\"}). Ô khách chưa tự nói — chỉ bot hỏi / đề xuất, hoặc "
                "em tự suy — thì KHÔNG đưa vào fields.",
            },
            "can_khac_trich": {
                "type": "string",
                "description": "CHỈ cho op add (1 căn): NGUYÊN VĂN cụm trong lời KHÁCH nói đây là căn KHÁC căn đang khai (vd \"còn một "
                "căn nữa\", \"anh có thêm miếng đất Củ Chi\", một địa chỉ khác hẳn). Khách nói thêm loại đất, pháp lý, diện tích, mô tả "
                "của căn đang khai KHÔNG phải căn khác — đó là update. Không có cụm như vậy thì KHÔNG dùng add.",
            },
            "status": {
                "type": "string",
                "enum": ["da_ban", "dung_ban", "da_cho_thue", "da_coc", "khong_rao",
                         "thoi_dang_ky", "rao"],
                "description": "Trạng thái — chỉ dùng cho op set_status. rao=đăng/rao lại; "
                "khong_rao=ngưng rao (ẩn, vẫn giữ); thoi_dang_ky=rút tin; da_coc=khách đã đặt cọc "
                "(chưa sang tên); da_ban/da_cho_thue=đã xong.",
            },
        },
        "required": ["op"],
    }
    return {
        "type": "object",
        "properties": {
            "operations": {"type": "array", "items": op, "description": "Danh sách thao tác theo thứ tự."},
            "seller_role": {
                "type": "string",
                "enum": ["chu_nha", "luot_song", "moi_gioi", "san", "chu_dau_tu"],
                "description": "Vai trò người rao khi khách TỰ NÓI RA vai (\"a là môi giới\", \"nhà chính chủ\", \"bên sàn\"). Bỏ trống nếu chưa chắc.",
            },
            "seller_role_trich_dan": {"type": "string", "description": "Nguyên văn cụm khách tự nói vai (bắt buộc khi có seller_role); "
                                      "\"a cần đăng tin\", \"nhà em\" KHÔNG phải vai → bỏ trống cả hai."},
            "is_rental": {"type": "boolean", "description": MO_TA_CHO_THUE},
            # SRS-5.1zzzzzzz241 (OPEN-59 a): một căn vừa bán vừa cho thuê → hai tin chung căn.
            "ca_ban_ca_thue": {"type": "boolean", "description": "true CHỈ KHI khách nói CÙNG căn đang nói muốn VỪA bán VỪA cho thuê (\"bán "
                               "hay cho thuê đều được\", \"ai thuê cũng cho, mua cũng bán\"). \"Đang cho thuê 30 triệu\" khi rao bán là hiện trạng → bỏ trống."},
            "ca_ban_ca_thue_trich_dan": {"type": "string", "description": "Nguyên văn cụm khách nói vừa bán vừa cho thuê (bắt buộc khi có ca_ban_ca_thue)."},
            "duyet_ban_nhap": {
                "type": "string",
                "enum": ["dong_y", "khong_dong_y"],
                # Theo TRẠNG THÁI, không theo vị trí tin (SRS-5.1zzzzzzz94): bản cũ "Chỉ khi bot vừa gửi bản tin nháp" trái luật DUYỆT
                # của OPERATIONS_SYSTEM (đổi 20/10) — bắn thử KB3 21/10: bot vừa ghi nhận phí quản lý, khách "ok đăng đi", ô bỏ trống.
                "description": "Chỉ khi có dòng 'TRẠNG THÁI: bot ĐÃ gửi bản tin nháp' (kể cả khi sau bản nháp bot đã nhắc, hỏi lại hay "
                "ghi thêm ý): dong_y = khách đồng ý / bảo đăng; khong_dong_y = khách không đồng ý / chưa muốn đăng / muốn sửa trước. "
                "Còn lại bỏ trống.",
            },
            "duyet_trich_dan": {
                "type": "string",
                "description": "Nguyên văn cụm trong tin khách vừa nhắn cho thấy đồng ý / không đồng ý (bắt buộc khi có duyet_ban_nhap).",
            },
            "loi_xa_giao": {
                "type": "string",
                "enum": ["chao", "dong_y"],
                "description": "chao = tin khách CHỈ là lời chào hỏi, chưa nói nhu cầu; dong_y = tin khách CHỈ là lời đáp ngắn đồng ý / cảm ơn "
                "(ok, vâng, ừ…), không kèm thông tin hay câu hỏi mới. Còn lại bỏ trống.",
            },
            "loi_xa_giao_trich_dan": {
                "type": "string",
                "description": "Nguyên văn cụm trong tin khách vừa nhắn (bắt buộc khi có loi_xa_giao).",
            },
            "hoi_ve": {
                "type": "string",
                "enum": ["phi", "uy_tin", "link_web", "tinh_hinh_ban", "dinh_gia"],
                "description": "Khách vừa hỏi về: phi = phí / hoa hồng của bên mình; uy_tin = công ty / uy tín / lừa đảo; "
                "link_web = link tin / xem tin trên web; tinh_hinh_ban = chủ nhà hỏi đã có ai hỏi / quan tâm / xem căn mình chưa, "
                "bán tới đâu; dinh_gia = chủ nhà hỏi giá mình đưa cao hay thấp, giá thị trường khu đó bao nhiêu. Không hỏi những điều "
                "đó thì bỏ trống.",
            },
            "hoi_ve_trich_dan": {"type": "string", "description": "Nguyên văn cụm câu hỏi trong tin khách (bắt buộc khi có hoi_ve)."},
            "hoi_phap_ly": {"type": "string", "enum": list(phap_ly.KHOA) + [phap_ly.KHAC],
                            "description": "Khách hỏi pháp lý / thủ tục / thuế phí nhà đất nói chung: khoá trong DANH MỤC PHÁP LÝ, "
                            "hoặc khac khi không mục nào hợp. Không hỏi thì bỏ trống."},
            "phap_ly_trich_dan": {"type": "string", "description": "Nguyên văn câu hỏi pháp lý của khách (bắt buộc khi có hoi_phap_ly)."},
            "phap_ly_nhay_cam": {"type": "boolean", "description": "true khi câu pháp lý thuộc nhóm tranh chấp / thừa kế / ly hôn / nghi "
                                 "giấy tờ giả / tránh thuế / hồ sơ cụ thể cần người đọc."},
            "xung_ho": {
                "type": "string",
                "enum": ["em", "anh", "chi", "chau", "chu_co_bac"],
                "description": "Khách TỰ XƯNG là gì (em / anh / chị / cháu-con / chú-cô-bác-dì; gõ tắt e / a / c cũng tính). Khách tự xưng "
                               "cháu / con → chau; khách GỌI bot là con / cháu → chu_co_bac; \"chú bán nhà…\" / \"cô có căn…\" (chữ chú / cô / bác làm "
                               "chủ ngữ) → chu_co_bac. Chưa thấy thì bỏ trống.",
            },
            "xung_ho_trich_dan": {"type": "string", "description": "Nguyên văn cụm chứa chữ khách tự xưng / gọi bot (bắt buộc khi có xung_ho)."},
            "bot_vua_hoi": {"type": "array", "items": {"type": "string"},
                            "description": "Khoá các ô mà tin GẦN NHẤT của bot thật sự hỏi khách (vd [\"phuong\"]). Không hỏi ô nào → []."},
            "xin_xem_ban_ve": {"type": "string", "description": "Nguyên văn cụm khách xin xem / xin gửi bản vẽ, mặt bằng (bản "
                               "vẽ), sơ đồ, phối cảnh, layout, brochure. Không xin thì bỏ trống."},
            "ban_do_du_an": {"type": "boolean", "description": "Có xin_xem_ban_ve VÀ thứ khách xin là bản đồ / phân lô / quy "
                             "hoạch / mặt bằng tổng thể của cả dự án (không phải bản vẽ một căn)."},
            "cau_hoi_du_an": {"type": "string", "description": "Nguyên văn câu khách HỎI thông tin dự án / mẫu nhà / lô / gói. "
                              "Khách kể thông tin căn của mình thì bỏ trống."},
            "mo_ta_du_an": {"type": "string", "description": "Nguyên văn cụm khách TẢ kiến thức chung của dự án / mẫu nhà. "
                            "Không có thì bỏ trống."},
            "can_nguoi_that": {"type": "string", "description": "Nguyên văn cụm khách XIN nói chuyện / gặp / gọi điện với người "
                               "thật (nhân viên, quản lý). Không xin thì bỏ trống."},
            "ngoai_vung": {"type": "string", "description": "Tên tỉnh / thành của căn khi khách đã nói rõ căn nằm NGOÀI vùng nhận "
                           "tin (TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu, Long An, Tây Ninh, Đồng Nai). Trong vùng hoặc chưa rõ thì bỏ "
                           "trống."},
            "ngoai_vung_trich_dan": {"type": "string", "description": "Nguyên văn cụm địa danh khách nói (bắt buộc khi có ngoai_vung)."},
            "xin_dang": {"type": "string", "description": "Nguyên văn cụm khách bảo đăng tin / xin xem bản tin hoàn chỉnh. Không có thì "
                         "bỏ trống."},
            "yeu_cau_viet": {"type": "array", "items": {"type": "string"},
                             "description": "Cụm NGUYÊN VĂN khách dặn CÁCH VIẾT / SỬA bản tin (nhấn ý nào, bớt gì, icon, không lặp, "
                             "ngắn hơn, đổi tiêu đề) — không phải dữ liệu căn, không phải đính chính số liệu. Không dặn thì []."},
            "xac_nhan_xoa": {"type": "string", "enum": ["dong_y", "tu_choi"],
                             "description": "Chỉ khi bot vừa hỏi xác nhận ẩn / bỏ / chỉ giữ căn: khách đồng ý hay từ chối."},
            "xac_nhan_trich_dan": {"type": "string", "description": "Nguyên văn cụm khách đồng ý / từ chối (bắt buộc khi có xac_nhan_xoa)."},
            # SRS-5.1zzzzzzz104: khách chấm sao cho AI — đọc theo nghĩa, code kiểm trích dẫn + lời bot trước là câu xin chấm sao.
            "danh_gia_sao": {"type": "integer", "minimum": 1, "maximum": 5,
                             "description": "CHỈ khi lời bot ngay trước xin khách chấm 1–5 sao và khách trả lời: số sao khách cho, "
                             "đọc theo nghĩa (\"5 sao\", \"⭐⭐⭐⭐\" = 4, \"tốt lắm\" ≈ 5, \"tạm được\" ≈ 3, \"tệ quá\" ≈ 1). "
                             "Khách không chấm thì bỏ trống."},
            "danh_gia_trich_dan": {"type": "string", "description": "Nguyên văn cụm khách chấm (bắt buộc khi có danh_gia_sao)."},
            "xong_viec_mua": {"type": "string", "description": "KHÁCH MUA cho biết đã nhận đủ thông tin căn, không cần hỏi thêm (vd "
                              "\"ok cảm ơn em, vậy đủ rồi\", \"để anh sắp xếp đi xem\"): chép NGUYÊN VĂN cụm đó. Khách còn hỏi "
                              "hay đang là người bán thì bỏ trống."},
            "mua": {
                "type": "object",
                "properties": {
                    "ma_can": {"type": "array", "items": {"type": "string"}, "description": "Mã căn khách đang nói tới."},
                    "quan_tam": {"type": "boolean", "description": "Khách tỏ ý quan tâm / muốn xem căn đó."},
                    "hen_xem": {"type": "string", "description": "Nguyên văn cụm thời gian khách hẹn đi xem."},
                    "hoi_chu_nha": {"type": "string", "description": "Nguyên văn câu khách hỏi mà dữ liệu căn không có."},
                    "xin_anh": {"type": "boolean", "description": "Khách xin xem ảnh / hình của căn (kể cả xin gửi lại)."},
                    "khong_hop": {"type": "boolean", "description": "Khách chê / từ chối căn đang nói tới (không hợp, bỏ qua căn này)."},
                    "ly_do": {"type": "string", "description": "Nguyên văn cụm khách nêu lý do căn không hợp (nếu có)."},
                    "ngung_bao": {"type": "string", "enum": ["tat", "bat"],
                                  "description": "tat = khách bảo đừng gửi / báo căn mới nữa; bat = khách xin được báo khi có căn mới."},
                    "hoi_du_an": {"type": "string", "description": "Nguyên văn tên dự án khách MUA hỏi thông tin (chủ đầu tư, tiện ích, pháp lý, giá, bàn giao)."},
                    "du_an_khu_vuc": {"type": "string", "description": "Nguyên văn khu vực khi khách hỏi khu đó có những dự án nào."},
                    "du_an_khu_vuc_chuan": {"type": "string", "description": "Tên hành chính đầy đủ của khu vực ở du_an_khu_vuc (vd \"Quận 7\")."},
                    "tim_du_an": {"type": "string", "description": "Nguyên văn tên dự án khách muốn tìm căn đang rao / xin bảng căn còn bán trong đó."},
                    "can_cu_the": {"type": "string", "description": "Nguyên văn cụm khách tả MỘT căn cụ thể đã thấy (không mã) và hỏi về chính căn đó."},
                    "xin_anh_trich": {"type": "string", "description": "Nguyên văn cụm khách xin ảnh trong tin vừa nhắn."},
                    "khong_hop_trich": {"type": "string", "description": "Nguyên văn cụm khách chê / từ chối căn trong tin vừa nhắn."},
                    "ngung_bao_trich": {"type": "string", "description": "Nguyên văn cụm khách bảo đừng / xin báo căn mới trong tin vừa nhắn."},
                    "trich_dan": {"type": "string", "description": "Nguyên văn cụm trong tin khách VỪA nhắn làm căn cứ."},
                },
                "description": "Việc của khách mua (quan tâm, hẹn xem, hỏi chủ nhà) — xem VIỆC CỦA KHÁCH MUA.",
            },
            "tra_loi_khach_hoi": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "id câu khách hỏi (trong khối CÂU KHÁCH MUA ĐANG HỎI CHỦ NHÀ)."},
                    "tra_loi": {"type": "string", "description": "Nguyên văn câu trả lời của người rao."},
                },
                "description": "Người rao vừa trả lời một câu khách mua hỏi.",
            },
            "hoi_ngoai_viec": {"type": "string", "description": "Nguyên văn câu khách hỏi / kể việc ngoài mua bán, thuê nhà đất khi chưa "
                               "tỏ ý bán hay mua (đồng hồ nước, điện, hành chính khu dân cư…). Không có thì bỏ trống."},
            "user_intent": {
                "type": "string",
                "enum": ["sell", "buy", "unknown"],
                "description": "Ý định của khách: sell=gửi bán/cho thuê; buy=tìm mua/thuê; unknown=chưa rõ.",
            },
            "buyer_lead": {
                "type": "object",
                "properties": {
                    "loai_giao_dich": {"type": "string", "enum": ["mua", "thue"]},
                    "loai_bds": {"type": "string", "description": "nha_pho, chung_cu, du_an, dat_tho_cu... Khách nói nhà hẻm / nhà mặt tiền "
                                 "/ nhà phố / nhà riêng / nhà đất → nha_pho; căn hộ / chung cư → chung_cu. Chỉ nói \"mua nhà\" chung chung thì bỏ trống."},
                    "ngan_sach": {"type": "string", "description": "Ngân sách tối đa (vd: 5 tỷ, 10-15 tỷ, 15 tr/tháng)"},
                    "khu_vuc": {"type": "string", "description": "Quận, huyện, tên dự án tìm kiếm"},
                    "so_phong_ngu": {"type": "string", "description": "Số phòng ngủ (vd: 2PN, 3PN)"},
                    "yeu_cau_xe_hoi": {"type": "string", "description": "Hẻm xe hơi, xe hơi vào nhà, chỗ đậu ô tô..."},
                    "huong": {"type": "string", "description": "Hướng phong thủy mong muốn"},
                    "muc_dich": {"type": "string", "description": "ở, đầu tư lướt, đầu tư cho thuê, kinh doanh"},
                    "tien_do_mua": {"type": "string", "description": "mua ngay trong tháng, chuẩn bị tài chính, tham khảo"},
                    "vay_ngan_hang": {"type": "string", "description": "nhu cầu vay ngân hàng"},
                    "moi_truong_song": {"type": "string", "description": "khu muốn sống như thế nào (yên tĩnh, gần chợ / trường…)"},
                    "thanh_vien": {"type": "string", "description": "nhà gồm những ai sẽ ở (vợ chồng, con nhỏ, ông bà…) — không ghi họ tên"},
                    "noi_lam_viec": {"type": "string", "description": "khu vực đi làm / con đi học"},
                    "dien_tich_mong_muon": {"type": "string", "description": "số phòng, diện tích mong muốn"},
                    "so_tang_mong_muon": {"type": "string", "description": "CHỈ con số tổng số tầng khách muốn, tính cả trệt, không tính lửng "
                                          "(\"nhà 4 tầng\" → \"4\"; \"1 trệt 3 lầu\" → \"4\"). Khách không nói số tầng thì bỏ trống."},
                    "tien_ich_mong_muon": {"type": "string", "description": "NGUYÊN VĂN cụm khách nói muốn gần tiện ích nào: trường học, bệnh viện, "
                                           "chợ, siêu thị, công viên (vd \"gần trường học\", \"gần chợ với bệnh viện\"). Không nói thì bỏ trống."},
                    "thang_may": {"type": "string", "description": "có cần thang máy không"},
                    "nguoi_quyet_dinh": {"type": "string", "description": "ai cùng quyết định mua (vợ / chồng / bố mẹ…) — không ghi họ tên"},
                },
                "description": "Dữ liệu nhu cầu người mua/thuê khi khách có ý định mua hoặc thuê.",
            },
        },
        "required": ["operations"],
    }


# ── Ảnh / tài liệu là kiến thức CHUNG của dự án hay ảnh của MỘT căn (19/10/2026, SRS-5.1zzzzzzz55) ──────────────────
# Thay bộ dò từ khoá _looks_like_reference_doc ("phân lô", "sơ đồ", "mặt bằng"… trên bản đọc ảnh): đọc theo nghĩa bản đọc.
TAI_LIEU_CHUNG_SYSTEM = """Dưới đây là BẢN ĐỌC (mô tả) một hoặc vài ảnh / tài liệu người rao vừa gửi. Cho biết đây có phải TÀI LIỆU
CHUNG của dự án (bản đồ phân lô, mặt bằng tổng thể / tầng, sơ đồ, quy hoạch, quy cách bàn giao, phụ lục, tiện ích, phối cảnh,
brochure) — thứ mọi căn trong dự án dùng chung — hay là ẢNH CỦA MỘT CĂN cụ thể (phòng, mặt tiền, giấy tờ của căn). Trả về JSON."""


def tai_lieu_chung_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "tai_lieu_chung": {"type": "boolean", "description": "true = tài liệu chung của dự án; false = ảnh của một căn."},
        },
        "required": ["tai_lieu_chung"],
    }



_SDT = re.compile(r"(?<!\d)(?:\+?84|0)(?:[\s.\-]?\d){8,10}(?!\d)")
_AI_CAU_CHUAN = {"buyer": "Khách", "seller": "Khách", "bot": "Bot", "human": "Người thật"}


# Câu mở lượt kiểu ghi nhận ("Em ghi nhận…", "Chị đã ghi giá…", "Em lưu…") — chủ dự án bỏ hẳn kiểu này (SRS-5.1zzzzzzz131); chủ ngữ theo mọi
# cách bot xưng (SRS-214). MỘT nguồn: lưới `engine._mo_dau_ghi_nhan` và bộ lọc ví dụ câu chuẩn dưới đây cùng dùng (SRS-5.1zzzzzzz215).
MO_DAU_GHI_NHAN_RE = re.compile(r"(?i)\s*(?:em|anh|chị|cô|chú|cháu|mình)\s+(?:đã\s+)?(?:ghi(?![\wà-ỹđ])|nhận\s+thông\s+tin|lưu(?![\wà-ỹđ])|"
                                r"nắm\s+(?:rồi|được)|thêm\s+vào\s+tin|lên\s+thông\s+tin)")
_MAU_PHAM_LUAT_RE = re.compile(r"(?i)^\s*dạ(?![a-zà-ỹđ])|đã\s+(?:được\s+)?(?:đăng|hiển\s+thị)")


def mau_cau_chuan_hop_le(cau: str | None) -> bool:
    """Ví dụ câu chuẩn được đưa cho model phải không TỰ phạm luật hình thức đang áp (SRS-5.1zzzzzzz215, chủ dự án 27/10: "con của mình cứ em
    ghi nhận hoài"): 67/376 dòng `cau_chuan` mở bằng "Em ghi rồi / Em nhận thông tin…" (sửa tay 21/10, trước khi bỏ kiểu ghi nhận 22/10) nên prompt
    vừa cấm vừa dạy. Loại: mở bằng ghi nhận, mở bằng "Dạ", tự nói tin "đã đăng / đã hiển thị" (trạng thái web do khối hệ thống quyết)."""
    c = " ".join(str(cau or "").split())
    return bool(c) and not MO_DAU_GHI_NHAN_RE.match(c) and not _MAU_PHAM_LUAT_RE.search(c)


def khoi_cau_chuan(rows: list[dict] | None) -> str:
    """Câu chuẩn người chấm sửa / chấm ở CRM (`cau_chuan`, SRS-5.1zzzzzzz88) → khối ví dụ cho lượt trả lời. Mỗi ví dụ kèm NGỮ CẢNH
    (3 tin trước câu bot), câu bot cũ, điểm, câu chuẩn, ghi chú. Ví dụ là hội thoại của khách khác: che SĐT, dặn model không nhắc lại
    dữ kiện trong ví dụ. Không có dòng → "" (prompt như cũ)."""
    if not rows:
        return ""
    cat = lambda x, n: (lambda t: t if len(t) <= n else t[:n].rstrip() + "…")(_SDT.sub("0xxxxxxxxx", " ".join(str(x or "").split())))
    # SRS-5.1zzzzzzz215: ví dụ "nên nói" (câu chuẩn, hoặc câu bot cũ được giữ) phải hợp luật hình thức đang áp; câu bot cũ chỉ in khi có
    # ĐIỂM (để model biết đó là cách nói cần tránh) — in không điểm là dạy thêm một lần nữa kiểu ghi nhận.
    def _nen_noi(r: dict) -> str | None:   # câu được trình là "nên nói": câu chuẩn sửa tay, hoặc câu bot cũ chấm ≥ 4; câu điểm thấp là cách cần tránh
        return r.get("cau_chuan") or (r.get("cau_bot") if (r.get("diem") or 0) >= 4 else None)
    rows = [r for r in rows if (_nen_noi(r) is None and r.get("diem")) or mau_cau_chuan_hop_le(_nen_noi(r))]
    if not rows:
        return ""
    khoi = []
    for i, r in enumerate(rows, 1):
        dong = [f"[{i}]" + (f" Điểm câu bot cũ: {r['diem']}/5" if r.get("diem") else "")]
        for t in (r.get("ngu_canh") or [])[-3:]:
            if isinstance(t, dict) and t.get("noi_dung"):
                dong.append(f"  {_AI_CAU_CHUAN.get(t.get('ai'), 'Khách')}: {cat(t['noi_dung'], 300)}")
        if r.get("diem") or not r.get("cau_chuan") or cat(r["cau_chuan"], 900) == cat(r.get("cau_bot"), 900):
            dong.append(f"  Câu bot cũ: {cat(r.get('cau_bot'), 500)}")
        if r.get("cau_chuan") and cat(r["cau_chuan"], 900) != cat(r.get("cau_bot"), 900):
            dong.append(f"  CÂU CHUẨN (nên nói thế này): {cat(r['cau_chuan'], 900)}")
        elif r.get("cau_chuan") or (r.get("diem") or 0) >= 4:
            dong.append("  → Câu bot cũ đã chuẩn, giữ cách nói này.")
        if r.get("ghi_chu"):
            dong.append(f"  Ghi chú người chấm: {cat(r['ghi_chu'], 300)}")
        khoi.append("\n".join(dong))
    return ("\n\n=== CÂU CHUẨN NGƯỜI CHẤM ĐÃ SỬA / CHẤM (học giọng và cách xử lý; gặp tình huống giống thì làm như câu chuẩn; điểm thấp "
            "là cách nói cần tránh) ===\nĐây là hội thoại của KHÁCH KHÁC: KHÔNG nhắc lại địa chỉ, giá, tên, số liệu trong ví dụ.\n"
            + "\n".join(khoi) + "\n")


def khoi_tin_tra_loi(trich: str | None) -> str:
    """SRS-5.1zzzzzzz270 (chủ dự án 29/10: "người ta bấm nút trả lời thì bot có đọc chính xác hơn dc ko"): khách bấm "Trả lời" một tin trên
    Zalo → bridge chuyển nội dung tin được trích (`quote_text`). Lượt này đọc lời khách theo ĐÚNG tin đó. Nội dung tin trích KHÔNG phải lời
    khách (thường là tin bot) — không vào `loi_khach_luot`, không làm bằng chứng ghi ô."""
    t = (trich or "").strip()
    if not t:
        return ""
    t = t[:1500]
    return ("\n\nKHÁCH BẤM \"TRẢ LỜI\" (TRÍCH) MỘT TIN khi nhắn lượt này — lời khách lượt này là đáp lại ĐÚNG tin đó:\n«" + t + "»\n"
            "Đọc lời khách theo tin được trích: tin là bản nháp 📋 thì lời đồng ý / sửa là cho CHÍNH bản nháp đó (căn đó); tin là câu em "
            "hỏi thì lời khách là câu trả lời câu đó; tin là căn em gợi ý thì khách đang nói về căn đó. Nội dung tin trích KHÔNG phải lời "
            "khách — không lấy chữ trong đó làm bằng chứng ghi ô tin, không coi là khách vừa nói.\n")
