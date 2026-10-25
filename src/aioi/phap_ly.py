"""Kho kiến thức pháp lý / thủ tục nhà đất bot được phép trả lời (SRS-5.1zzzzzzz176, 25/10/2026).

Soát UX 25/10 (điểm A1): bot không có khối nào cho câu hỏi thủ tục / pháp lý — trả lời bằng kiến thức model, không nhãn nguồn, không
biết câu nào phải chuyển người. Chủ dự án chốt "nạp sẵn" thay cho tìm Google ("Nạp sẵn đi nạp vào luôn, tôi ko biết duyệt").

Nguyên tắc (ba lớp nguồn của đặc tả UX):
  1. Khách hỏi điều CÓ trong kho → bot trả lời ĐÚNG nội dung dòng đó, kèm "tham khảo theo bản em có cập nhật tháng …, anh kiểm lại với
     văn phòng công chứng / văn phòng đăng ký đất đai". Không thêm điều ngoài dòng.
  2. Hỏi điều KHÔNG có trong kho (`khac`) → nói thật chưa có, không đoán, hỏi khách có muốn nối người phụ trách.
  3. Câu NHẠY CẢM (tranh chấp, kiện tụng, thừa kế, ly hôn chia tài sản, nghi giấy tờ giả / lừa đảo, cách giảm hay tránh thuế, hồ sơ cụ thể
     cần người đọc giấy tờ) → không tư vấn, hệ thống báo admin như khách xin gặp người thật (`can_nguoi_that`).

AI (lượt lập thao tác) đọc câu khách theo NGHĨA và chọn khoá trong `MAC_DINH`; code kiểm cụm trích nằm trong lời khách. Không dò từ khoá.

NỘI DUNG DO AI SOẠN THEO LUẬT, CHƯA CÓ NGƯỜI CÓ CHUYÊN MÔN DUYỆT (chủ dự án 25/10: "tôi ko biết duyệt") — vì vậy mọi câu đều là
"tham khảo", có `nguon` để người sau tra lại, và chủ dự án / admin sửa được ở bảng `kien_thuc_phap_ly` (đè câu ở đây, nhớ 60 giây —
cùng cách `cau_mau`). Thêm câu mới = thêm khoá ở đây + chạy `scripts/sinh-migration-phap-ly.py` ra migration mới (test
`test_phap_ly.py::test_migration_nap_dung_kho` đỏ khi hai bên lệch)."""
from __future__ import annotations

import logging
import time
from typing import Callable

log = logging.getLogger(__name__)

CAP_NHAT = "2026-10-25"          # ngày soạn bản mặc định — bot nói "theo bản em có cập nhật tháng 10/2026"
KIEM_DUYET = "chua"              # chưa người có chuyên môn duyệt (chủ dự án 25/10/2026)
NHO_GIAY = 60

# khoá → (tiêu đề ngắn cho AI chọn, câu trả lời bot nói, nguồn, nhóm)
MAC_DINH: dict[str, tuple[str, str, str, str]] = {
    "so_do_so_hong": (
        "Sổ đỏ, sổ hồng khác gì nhau; sổ cũ còn giá trị không",
        "Sổ đỏ hay sổ hồng chỉ là tên gọi theo màu bìa của các mẫu Giấy chứng nhận qua từng thời kỳ; về pháp lý đều là Giấy chứng nhận "
        "quyền sử dụng đất, quyền sở hữu tài sản gắn liền với đất. Từ 01/01/2025 có mẫu giấy mới theo Luật Đất đai 2024, nhưng sổ cũ "
        "đã cấp vẫn có giá trị, không bắt buộc đổi; chỉ đổi khi có biến động hoặc chủ sổ muốn.",
        "Luật Đất đai 2024 (Điều 256); Thông tư 10/2024/TT-BTNMT về mẫu Giấy chứng nhận", "giay_to"),
    "thue_phi_sang_ten": (
        "Mua bán nhà đất phải nộp những thuế phí gì, bên nào chịu",
        "Một giao dịch mua bán thường có: thuế thu nhập cá nhân của bên bán (2% giá chuyển nhượng), lệ phí trước bạ của bên mua (0,5%), "
        "phí công chứng hợp đồng (tính theo giá trị, thường vài triệu), và lệ phí cấp sổ, phí thẩm định hồ sơ (vài trăm nghìn tới hơn một "
        "triệu tuỳ địa phương). Luật không bắt buộc bên nào chịu khoản nào ngoài nghĩa vụ thuế của từng bên, nên hai bên thoả thuận và ghi "
        "rõ trong hợp đồng đặt cọc; thực tế hay gặp là bên bán chịu thuế thu nhập cá nhân, bên mua chịu trước bạ và phí công chứng.",
        "Luật Thuế thu nhập cá nhân; Nghị định 10/2022/NĐ-CP về lệ phí trước bạ; Thông tư 257/2016/TT-BTC về phí công chứng", "thue_phi"),
    "thue_tncn": (
        "Thuế thu nhập cá nhân khi bán nhà đất, trường hợp được miễn",
        "Bên bán nộp thuế thu nhập cá nhân 2% trên giá chuyển nhượng ghi trong hợp đồng (nếu giá hợp đồng thấp hơn bảng giá đất của Nhà "
        "nước thì tính theo bảng giá). Được miễn trong vài trường hợp chính: bán nhà đất duy nhất (chỉ sở hữu một bất động sản, đã có quyền "
        "tối thiểu 183 ngày và bán toàn bộ), hoặc chuyển nhượng giữa vợ chồng, cha mẹ với con, ông bà với cháu, anh chị em ruột. Cách tính "
        "thuế có thể thay đổi theo luật thuế mới, nên kiểm lại với chi cục thuế trước khi ký.",
        "Luật Thuế thu nhập cá nhân (Điều 4, Điều 14); Thông tư 111/2013/TT-BTC", "thue_phi"),
    "le_phi_truoc_ba": (
        "Lệ phí trước bạ nhà đất là bao nhiêu",
        "Lệ phí trước bạ nhà đất là 0,5% giá tính lệ phí (giá ghi trong hợp đồng, nếu thấp hơn giá Nhà nước thì tính theo giá Nhà nước), "
        "do bên nhận chuyển nhượng nộp khi đăng ký sang tên. Một số trường hợp được miễn như nhận thừa kế, tặng cho giữa vợ chồng, cha mẹ "
        "và con, ông bà và cháu, anh chị em ruột.",
        "Nghị định 10/2022/NĐ-CP (Điều 8, Điều 10)", "thue_phi"),
    "phi_cong_chung": (
        "Phí công chứng hợp đồng mua bán tính như thế nào",
        "Phí công chứng tính theo giá trị hợp đồng theo biểu phí Nhà nước: ví dụ giao dịch từ 1 tới 3 tỷ là 1 triệu đồng cộng 0,06% phần vượt "
        "1 tỷ; từ 3 tới 5 tỷ là 2,2 triệu cộng 0,05% phần vượt 3 tỷ; từ 5 tới 10 tỷ là 3,2 triệu cộng 0,04% phần vượt 5 tỷ. Ngoài phí này, "
        "văn phòng công chứng thu thêm thù lao soạn thảo, đi lại, mỗi nơi niêm yết khác nhau, nên hỏi báo giá trước. Biểu phí có thể được "
        "điều chỉnh theo Luật Công chứng 2024.",
        "Thông tư 257/2016/TT-BTC (Điều 4); Luật Công chứng 2024 (hiệu lực 01/07/2025)", "thue_phi"),
    "quy_trinh_mua_ban": (
        "Các bước mua bán nhà đất từ đặt cọc tới sang tên",
        "Thứ tự thường gặp: (1) kiểm tra sổ, quy hoạch, chủ sở hữu và tình trạng thế chấp; (2) ký hợp đồng đặt cọc, nên ghi rõ giá, thời "
        "hạn, bên chịu thuế phí; (3) ký hợp đồng chuyển nhượng tại văn phòng công chứng nơi có bất động sản, thanh toán phần lớn tiền; "
        "(4) nộp thuế thu nhập cá nhân và lệ phí trước bạ; (5) nộp hồ sơ đăng ký biến động tại Văn phòng đăng ký đất đai hoặc bộ phận một "
        "cửa để sang tên; (6) nhận sổ đã cập nhật tên mới, thanh toán phần còn lại, bàn giao nhà.",
        "Luật Đất đai 2024 (Điều 45, Điều 133); Luật Công chứng 2024; Luật Kinh doanh bất động sản 2023", "thu_tuc"),
    "ho_so_ban_nha": (
        "Người bán cần chuẩn bị giấy tờ gì để công chứng",
        "Thường cần: bản chính Giấy chứng nhận (sổ hồng / sổ đỏ); căn cước của người đứng tên và vợ hoặc chồng; giấy đăng ký kết hôn, hoặc "
        "giấy xác nhận tình trạng hôn nhân nếu độc thân, hoặc giấy tờ chứng minh tài sản riêng; nếu nhờ người khác ký thì cần hợp đồng uỷ "
        "quyền công chứng. Nhà có nhiều đồng sở hữu thì tất cả phải ký hoặc uỷ quyền. Văn phòng công chứng sẽ báo thêm giấy tờ theo từng hồ sơ.",
        "Luật Công chứng 2024; Luật Hôn nhân và gia đình 2014 (Điều 33, Điều 35)", "thu_tuc"),
    "dat_coc": (
        "Đặt cọc bao nhiêu, bỏ cọc hoặc chủ đổi ý thì xử lý sao",
        "Mức cọc do hai bên thoả thuận, thực tế hay từ vài chục triệu tới khoảng 5–10% giá bán. Theo Bộ luật Dân sự, nếu bên mua từ chối "
        "giao kết thì mất tiền cọc; nếu bên bán từ chối thì phải trả lại cọc và một khoản tiền bằng cọc, trừ khi hợp đồng thoả thuận khác. "
        "Hợp đồng đặt cọc không bắt buộc công chứng nhưng nên lập văn bản, có người làm chứng hoặc công chứng để dễ xử lý khi có tranh cãi.",
        "Bộ luật Dân sự 2015 (Điều 328)", "thu_tuc"),
    "vi_bang": (
        "Mua nhà bằng vi bằng thừa phát lại có an toàn không",
        "Vi bằng chỉ là văn bản ghi nhận một sự kiện, hành vi (ví dụ việc giao tiền), do thừa phát lại lập; nó không phải hợp đồng công chứng "
        "và không có giá trị chuyển quyền sở hữu, nên không dùng để sang tên sổ được. Pháp luật cũng cấm lập vi bằng để ghi nhận việc chuyển "
        "nhượng nhà đất không đủ điều kiện. Mua bán qua vi bằng rủi ro cao, bên em không khuyến khích.",
        "Nghị định 08/2020/NĐ-CP (Điều 36, Điều 37)", "giay_to"),
    "chua_hoan_cong": (
        "Nhà xây xong chưa hoàn công có bán được không",
        "Chưa hoàn công nghĩa là phần nhà chưa được ghi nhận trên Giấy chứng nhận; sổ chỉ công nhận đất (hoặc công nhận ngôi nhà cũ). Vẫn có "
        "thể chuyển nhượng phần đã có trên sổ, nhưng bên mua không được công nhận quyền sở hữu phần nhà chưa hoàn công, khó vay ngân hàng, và "
        "nếu xây sai phép có thể bị xử lý. An toàn hơn là chủ hoàn công cập nhật tài sản lên sổ trước khi bán.",
        "Luật Xây dựng 2014 (sửa đổi 2020); Nghị định 101/2024/NĐ-CP về đăng ký, cấp Giấy chứng nhận", "giay_to"),
    "dat_chua_so": (
        "Đất chưa có sổ, mua bán giấy tay có được không",
        "Điều kiện để chuyển nhượng quyền sử dụng đất là phải có Giấy chứng nhận (trừ vài trường hợp như thừa kế). Đất chưa có sổ mua bằng "
        "giấy tay thì hợp đồng không có giá trị pháp lý để sang tên, bên mua không được công nhận quyền sử dụng và rất khó đòi lại tiền khi "
        "tranh chấp. Bên em không nhận rao những tin không có giấy tờ rõ ràng.",
        "Luật Đất đai 2024 (Điều 45)", "giay_to"),
    "tra_quy_hoach": (
        "Kiểm tra quy hoạch, lộ giới của một thửa đất ở đâu",
        "Có vài cách: tra trên ứng dụng / cổng thông tin quy hoạch của TP.HCM theo số tờ, số thửa ghi trên sổ; hỏi trực tiếp UBND phường "
        "hoặc Văn phòng đăng ký đất đai; hoặc nộp phiếu yêu cầu cung cấp thông tin quy hoạch tại cơ quan quản lý đất đai (có phí, có văn bản "
        "trả lời). Thông tin trên ứng dụng chỉ để tham khảo, muốn chắc thì xin văn bản.",
        "Luật Quy hoạch đô thị và nông thôn 2024; Luật Đất đai 2024 (quyền tiếp cận thông tin đất đai)", "quy_hoach"),
    "lo_gioi": (
        "Nhà dính lộ giới, quy hoạch đường nghĩa là gì",
        "Lộ giới là ranh giới dự kiến mở rộng đường theo quy hoạch. Phần nhà hoặc đất nằm trong lộ giới vẫn thuộc chủ sử dụng và vẫn giao dịch "
        "được, nhưng khi Nhà nước mở đường sẽ bị thu hồi phần đó, và khi xây mới thường không được xây kiên cố trên phần dính lộ giới. Giá "
        "trị phần đất dính lộ giới vì vậy thường thấp hơn phần còn lại. Nên xem bản đồ quy hoạch trước khi mua.",
        "Luật Quy hoạch đô thị và nông thôn 2024; Luật Xây dựng 2014 (sửa đổi 2020)", "quy_hoach"),
    "thoi_han_sang_ten": (
        "Sang tên mất bao lâu, hạn đăng ký biến động là bao nhiêu ngày",
        "Sau khi công chứng, hai bên phải đăng ký biến động (sang tên) trong 30 ngày kể từ ngày hợp đồng có hiệu lực; chậm có thể bị phạt "
        "hành chính. Cơ quan đăng ký giải quyết trong khoảng 10 ngày làm việc kể từ khi hồ sơ hợp lệ, thực tế tính cả bước nộp thuế thường mất "
        "2 tới 3 tuần. Hồ sơ nộp tại Văn phòng đăng ký đất đai hoặc bộ phận một cửa của phường, xã.",
        "Luật Đất đai 2024 (Điều 133); Nghị định 101/2024/NĐ-CP; Nghị định 123/2024/NĐ-CP về xử phạt", "thu_tuc"),
    "nha_the_chap": (
        "Nhà đang thế chấp ngân hàng có mua bán được không",
        "Được, nhưng phải có sự đồng ý của ngân hàng vì sổ đang do ngân hàng giữ. Cách phổ biến: bên mua chuyển một phần tiền để chủ nhà trả "
        "nợ, ngân hàng xoá thế chấp và trả sổ, rồi hai bên công chứng và sang tên; hoặc ký thoả thuận ba bên tại ngân hàng để tiền mua được "
        "dùng trả nợ trực tiếp. Nên làm việc tại ngân hàng và ghi rõ các bước trong hợp đồng đặt cọc.",
        "Bộ luật Dân sự 2015 (Điều 320, Điều 321); Luật Đất đai 2024", "thu_tuc"),
    "tai_san_chung_vo_chong": (
        "Nhà chỉ một người đứng tên, bán có cần vợ hoặc chồng ký không",
        "Nhà đất có được trong thời kỳ hôn nhân là tài sản chung của vợ chồng dù sổ chỉ ghi tên một người, nên khi bán cần cả hai đồng ý và ký, "
        "hoặc người kia có văn bản uỷ quyền, cam kết tài sản riêng được công chứng. Nếu mua trước khi kết hôn hoặc được thừa kế, tặng cho riêng "
        "thì là tài sản riêng, nhưng vẫn phải chứng minh bằng giấy tờ với công chứng viên.",
        "Luật Hôn nhân và gia đình 2014 (Điều 33, Điều 35, Điều 43)", "giay_to"),
    "uy_quyen_ban": (
        "Mua bán nhà qua hợp đồng uỷ quyền có rủi ro gì",
        "Hợp đồng uỷ quyền chỉ cho phép người được uỷ quyền thay mặt chủ làm thủ tục, không chuyển quyền sở hữu cho họ. Rủi ro: uỷ quyền chấm "
        "dứt khi người uỷ quyền chết hoặc đơn phương huỷ; cơ quan thuế có thể coi uỷ quyền toàn quyền là một lần chuyển nhượng và thu thêm "
        "thuế thu nhập cá nhân. Nếu bên bán không trực tiếp ký được, nên uỷ quyền có phạm vi rõ và thanh toán theo tiến độ sang tên.",
        "Bộ luật Dân sự 2015 (Điều 562 tới Điều 569); Thông tư 111/2013/TT-BTC (Điều 3 khoản 5)", "giay_to"),
    "chung_cu_so_hong": (
        "Sổ hồng chung cư có thời hạn không, căn hộ chưa có sổ mua bán thế nào",
        "Luật Nhà ở 2023 không quy định thời hạn sở hữu căn hộ; sổ hồng ghi thời hạn sử dụng đất của dự án (lâu dài hoặc theo thời hạn giao "
        "đất) và nhà chỉ phải kiểm định khi hết tuổi thọ công trình. Căn hộ chưa có sổ thì mua bán bằng cách chuyển nhượng hợp đồng mua bán với "
        "chủ đầu tư: công chứng văn bản chuyển nhượng, nộp thuế, rồi chủ đầu tư xác nhận; phải chưa nộp hồ sơ xin cấp sổ cho căn đó.",
        "Luật Nhà ở 2023 (Điều 58, Điều 160 tới Điều 162); Luật Kinh doanh bất động sản 2023", "chung_cu"),
    "phi_bao_tri": (
        "Phí bảo trì 2% chung cư là gì, ai giữ",
        "Người mua căn hộ nộp kinh phí bảo trì bằng 2% giá bán chưa gồm thuế giá trị gia tăng, thường nộp khi nhận bàn giao nhà. Khoản này "
        "chủ đầu tư phải gửi vào tài khoản riêng và bàn giao cho Ban quản trị khi toà nhà bầu được Ban quản trị, dùng để bảo trì phần sở hữu "
        "chung. Khác với phí quản lý vận hành đóng hằng tháng.",
        "Luật Nhà ở 2023 (Điều 152 tới Điều 155)", "chung_cu"),
    "nguoi_nuoc_ngoai": (
        "Người nước ngoài, Việt kiều có được mua nhà ở Việt Nam không",
        "Người nước ngoài được phép nhập cảnh được mua căn hộ và nhà ở riêng lẻ trong dự án nhà ở thương mại (không thuộc khu vực cần bảo đảm "
        "quốc phòng, an ninh), tối đa 30% số căn hộ một toà, sở hữu tối đa 50 năm và có thể gia hạn; không được mua nhà ngoài dự án như nhà "
        "phố thông thường. Người Việt định cư ở nước ngoài còn quốc tịch Việt Nam có quyền như người trong nước theo Luật Đất đai 2024.",
        "Luật Nhà ở 2023 (Điều 17 tới Điều 20); Luật Đất đai 2024 (Điều 4, Điều 44)", "giay_to"),
    "hop_dong_thue": (
        "Hợp đồng thuê nhà có cần công chứng không, tiền cọc thuê, thuế cho thuê",
        "Hợp đồng thuê nhà ở không bắt buộc công chứng, nhưng nên lập văn bản ghi rõ giá, thời hạn, cọc, điều kiện chấm dứt; muốn chắc hơn thì "
        "công chứng. Tiền cọc thuê do hai bên thoả thuận, phổ biến 1 tới 2 tháng tiền thuê. Chủ nhà có doanh thu cho thuê trên ngưỡng miễn "
        "thuế trong năm (ngưỡng theo Luật Thuế giá trị gia tăng 2024 là 200 triệu đồng/năm từ 2026) thì nộp thuế khoảng 10% doanh thu, gồm "
        "thuế giá trị gia tăng và thuế thu nhập cá nhân.",
        "Luật Nhà ở 2023 (Điều 164); Luật Thuế giá trị gia tăng 2024; Thông tư 40/2021/TT-BTC", "cho_thue"),
    "giay_phep_xay_dung": (
        "Xây mới hoặc sửa nhà có cần giấy phép xây dựng không",
        "Xây mới nhà ở riêng lẻ trong đô thị phải có giấy phép xây dựng, hồ sơ nộp tại UBND phường, xã (từ 01/07/2025 không còn cấp huyện). "
        "Sửa chữa không làm thay đổi kết cấu chịu lực, công năng, mặt ngoài tiếp giáp đường đô thị thì được miễn giấy phép. Nhà xây sai phép "
        "hoặc không phép có thể bị buộc tháo dỡ và khó hoàn công, nên kiểm giấy phép trước khi mua nhà mới xây.",
        "Luật Xây dựng 2014 (sửa đổi 2020, Điều 89); Nghị quyết 190/2025/QH15 về sắp xếp chính quyền hai cấp", "quy_hoach"),
    "len_tho_cu": (
        "Chuyển đất nông nghiệp, đất vườn lên đất thổ cư làm sao, tốn bao nhiêu",
        "Phải nộp đơn xin chuyển mục đích sử dụng đất; chỉ được chấp thuận khi thửa đất phù hợp quy hoạch sử dụng đất là đất ở và còn chỉ tiêu. "
        "Khi được duyệt phải nộp tiền sử dụng đất bằng chênh lệch giữa giá đất ở và giá đất nông nghiệp theo bảng giá đất của tỉnh, thành; "
        "bảng giá mới từ 2025–2026 cao hơn trước nhiều nên khoản này có thể rất lớn. Nên hỏi UBND phường, xã về quy hoạch trước khi mua đất "
        "chờ lên thổ cư.",
        "Luật Đất đai 2024 (Điều 121, Điều 122); Nghị định 103/2024/NĐ-CP về tiền sử dụng đất", "quy_hoach"),
    "dat_nong_nghiep_mua": (
        "Mua đất nông nghiệp có xây nhà được không, ai được mua",
        "Đất nông nghiệp chỉ được dùng đúng mục đích nông nghiệp, không được xây nhà ở; xây trái phép bị xử phạt và buộc tháo dỡ. Luật Đất đai "
        "2024 cho phép cá nhân không trực tiếp sản xuất nông nghiệp nhận chuyển nhượng đất trồng lúa rộng hơn trước, nhưng có điều kiện về hạn "
        "mức và phương án sử dụng. Muốn ở thì phải xin chuyển mục đích lên đất ở và được chấp thuận.",
        "Luật Đất đai 2024 (Điều 45, Điều 176, Điều 177)", "quy_hoach"),
}

KHOA = tuple(MAC_DINH)
KHAC = "khac"   # khách hỏi pháp lý nhưng kho không có câu hợp

NHOM_NHAY_CAM = ("tranh chấp, kiện tụng, khởi kiện", "thừa kế, chia di sản", "ly hôn, chia tài sản", "nghi giấy tờ giả, lừa đảo, bị chiếm "
                 "đoạt", "cách giảm, tránh, né thuế", "hồ sơ cụ thể cần người đọc giấy tờ mới trả lời được")

_doc: Callable[[], dict[str, dict]] | None = None
_nho: tuple[float, dict[str, dict]] | None = None


def dang_ky(doc: Callable[[], dict[str, dict]] | None) -> None:
    """Server gắn hàm đọc bảng `kien_thuc_phap_ly` (khoá → {tra_loi, cap_nhat}). Không gắn (test) thì dùng mặc định."""
    global _doc, _nho
    _doc, _nho = doc, None


def _da_sua() -> dict[str, dict]:
    global _nho
    if _doc is None:
        return {}
    if _nho is not None and time.time() - _nho[0] < NHO_GIAY:
        return _nho[1]
    try:
        bang = {k: v for k, v in (_doc() or {}).items() if k in MAC_DINH and isinstance(v, dict) and str(v.get("tra_loi") or "").strip()}
    except Exception as e:  # noqa: BLE001 — đọc bảng lỗi thì dùng mặc định
        log.warning("Đọc kien_thuc_phap_ly lỗi: %s", e)
        bang = _nho[1] if _nho else {}
    _nho = (time.time(), bang)
    return bang


def tra_loi(khoa: str) -> dict | None:
    """Dòng kiến thức đang dùng (DB đè mặc định): {tieu_de, tra_loi, nguon, cap_nhat}. Khoá lạ → None."""
    if khoa not in MAC_DINH:
        return None
    tieu_de, mac_dinh, nguon, _ = MAC_DINH[khoa]
    sua = _da_sua().get(khoa) or {}
    return {"tieu_de": tieu_de, "tra_loi": str(sua.get("tra_loi") or mac_dinh).strip(), "nguon": nguon,
            "cap_nhat": str(sua.get("cap_nhat") or CAP_NHAT)}


def danh_muc_cho_prompt() -> str:
    """Danh mục khoá cho lượt lập thao tác chọn (một dòng một khoá). Khoá là cố định trong code — DB chỉ sửa câu trả lời."""
    return "\n".join(f"  {k}: {v[0]}" for k, v in MAC_DINH.items()) + f"\n  {KHAC}: câu hỏi pháp lý / thủ tục khác, không có mục nào ở trên hợp"


def _thang(cap_nhat: str) -> str:
    p = cap_nhat.split("-")
    return f"tháng {int(p[1])}/{p[0]}" if len(p) >= 2 and p[1].isdigit() else cap_nhat


def khoi_luot(khoa: str | None, nhay_cam: bool = False) -> str:
    """Khối dặn model ở lượt trả lời khi lượt lập thao tác đọc được khách hỏi pháp lý. `khoa` None → ""."""
    if not khoa:
        return ""
    if nhay_cam:
        return ("\n\n=== ƯU TIÊN LƯỢT NÀY — CÂU HỎI PHÁP LÝ NHẠY CẢM (hệ thống ĐÃ BÁO người phụ trách): ===\n"
                "Việc này (tranh chấp / thừa kế / ly hôn / nghi giấy tờ giả / thuế hồ sơ cụ thể) cần người có chuyên môn đọc hồ sơ, em KHÔNG tư "
                "vấn nội dung, KHÔNG đoán hướng xử lý. Nói ngắn, ấm: em đã báo anh/chị phụ trách liên hệ hỗ trợ; khách có thể gửi sẵn giấy tờ "
                "liên quan. KHÔNG hứa giờ cụ thể, KHÔNG xin số điện thoại.\n")
    d = tra_loi(khoa)
    if d is None:
        return ("\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI PHÁP LÝ / THỦ TỤC MÀ TÀI LIỆU BÊN EM CHƯA CÓ: ===\n"
                "Nói thật là điều này chưa có trong tài liệu bên em, KHÔNG đoán, KHÔNG trả lời theo hiểu biết riêng, KHÔNG nêu con số. Hỏi "
                "MỘT câu ngắn: khách có muốn em nối anh/chị phụ trách để hỏi kỹ không. Vẫn trả lời phần việc khác của lượt nếu có.\n")
    return (f"\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI PHÁP LÝ / THỦ TỤC: {d['tieu_de']} ===\n"
            f"Nội dung tham khảo bên em có (bản cập nhật {_thang(d['cap_nhat'])}):\n\"{d['tra_loi']}\"\n"
            "Trả lời bằng ĐÚNG nội dung trên, diễn đạt ngắn gọn như môi giới nhắn Zalo (có thể bỏ ý phụ, KHÔNG thêm điều không có ở trên, "
            "KHÔNG thêm con số khác, KHÔNG nói mức phí môi giới). Kết bằng MỘT câu: đây là thông tin tham khảo theo quy định chung, hồ sơ cụ "
            "thể anh/chị kiểm lại với văn phòng công chứng hoặc văn phòng đăng ký đất đai; cần thì em nối người phụ trách. Không nêu tên văn "
            "bản luật trừ khi khách hỏi nguồn"
            + (f" (nguồn: {d['nguon']})" if d.get("nguon") else "") + ".\n")
