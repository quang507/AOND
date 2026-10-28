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

CAP_NHAT = "2026-10-28"          # ngày soạn / soát lại với nguyên văn Công báo (SRS-5.1zzzzzzz231) — bot nói "theo bản em có cập nhật tháng 10/2026"
KIEM_DUYET = "chua"              # chưa người có chuyên môn duyệt (chủ dự án 25/10/2026)
NHO_GIAY = 60

# khoá → (tiêu đề ngắn cho AI chọn, câu trả lời bot nói, nguồn, nhóm)
MAC_DINH: dict[str, tuple[str, str, str, str]] = {
    "so_do_so_hong": (
        "Sổ đỏ, sổ hồng khác gì nhau; sổ cũ còn giá trị không",
        "Sổ đỏ hay sổ hồng chỉ là tên gọi theo màu bìa của các mẫu Giấy chứng nhận qua từng thời kỳ; về pháp lý đều là Giấy chứng nhận "
        "quyền sử dụng đất, quyền sở hữu tài sản gắn liền với đất. Mẫu giấy mới theo Luật Đất đai 2024 áp dụng từ 01/08/2024 (phôi mẫu cũ "
        "dùng tới hết năm 2024). Sổ cũ đã cấp vẫn có giá trị, không bắt buộc đổi. Khi sang tên, cơ quan đăng ký thường xác nhận thay đổi "
        "ngay trên sổ cũ, hoặc cấp sổ mới nếu chủ sổ muốn hay thuộc trường hợp phải cấp mới như tách, hợp thửa.",
        "Luật Đất đai 2024 (Điều 256 khoản 3, Điều 133 khoản 2); Thông tư 10/2024/TT-BTNMT (Điều 29, 43, 44), sửa đổi bởi Thông tư "
        "23/2025/TT-BNNMT", "giay_to"),
    "thue_phi_sang_ten": (
        "Mua bán nhà đất phải nộp những thuế phí gì, bên nào chịu",
        "Một giao dịch mua bán thường có: thuế thu nhập cá nhân của bên bán (2% giá chuyển nhượng, trừ trường hợp được miễn), lệ phí "
        "trước bạ của bên mua (0,5%), phí công chứng hợp đồng (tính theo biểu giá trị, căn vài tỷ thường vài triệu), và lệ phí cấp sổ, "
        "phí thẩm định hồ sơ do từng tỉnh, thành quy định. Thuế và trước bạ tính theo giá trong hợp đồng; nếu giá đó thấp hơn bảng giá "
        "Nhà nước thì tính theo bảng giá. Luật quy định bên bán nộp thuế thu nhập cá nhân, bên đứng tên mới nộp trước bạ, nhưng hai bên "
        "được thoả thuận bên nào chịu hoặc nộp thay, nên ghi rõ trong hợp đồng đặt cọc; thực tế hay gặp là bên bán chịu thuế thu nhập cá "
        "nhân, bên mua chịu trước bạ và phí công chứng.",
        "Luật Thuế thu nhập cá nhân số 109/2025/QH15 (Điều 14); Nghị định 253/2026/NĐ-CP (Điều 57); Nghị định 10/2022/NĐ-CP sửa đổi bởi "
        "Nghị định 175/2025/NĐ-CP (Điều 4, 7, 8); Thông tư 257/2016/TT-BTC sửa đổi bởi Thông tư 111/2017/TT-BTC (Điều 4)", "thue_phi"),
    "thue_tncn": (
        "Thuế thu nhập cá nhân khi bán nhà đất, trường hợp được miễn",
        "Bên bán nộp thuế thu nhập cá nhân 2% trên giá chuyển nhượng ghi trong hợp đồng; nếu giá đất ghi thấp hơn bảng giá đất của Nhà "
        "nước thì phần đất tính theo bảng giá, phần nhà theo giá tính trước bạ của tỉnh. Được miễn trong hai nhóm chính: chuyển nhượng "
        "giữa vợ chồng, cha mẹ (đẻ, nuôi, cha mẹ chồng hoặc vợ) với con (kể cả dâu, rể), ông bà với cháu nội, cháu ngoại, anh chị em "
        "ruột; hoặc người bán chỉ có duy nhất một nhà ở hay một thửa đất ở tại Việt Nam, đã có sổ tối thiểu 183 ngày và bán toàn bộ "
        "(không áp dụng cho nhà hình thành trong tương lai, người bán tự kê khai, khai sai bị truy thu). Luật thuế thu nhập cá nhân mới "
        "áp dụng từ 01/07/2026 vẫn giữ mức 2%; nên kiểm lại với cơ quan thuế trước khi ký.",
        "Luật Thuế thu nhập cá nhân số 109/2025/QH15 (Điều 4 khoản 1, 2; Điều 14); Nghị định 253/2026/NĐ-CP (Điều 18, 19, 57); Thông tư "
        "87/2026/TT-BTC", "thue_phi"),
    "le_phi_truoc_ba": (
        "Lệ phí trước bạ nhà đất là bao nhiêu",
        "Lệ phí trước bạ nhà đất là 0,5% giá tính lệ phí: đất theo bảng giá đất, nhà theo giá tỉnh ban hành; nếu giá trong hợp đồng cao "
        "hơn thì tính theo giá hợp đồng. Bên nhận chuyển nhượng nộp khi đăng ký sang tên. Được miễn khi nhận thừa kế hoặc được tặng cho "
        "nhà đất giữa vợ chồng, cha mẹ (đẻ, nuôi, cha mẹ chồng hoặc vợ) với con (kể cả dâu, rể), ông bà với cháu nội, cháu ngoại, anh chị "
        "em ruột; thừa kế hay tặng cho ngoài các quan hệ này vẫn phải nộp.",
        "Nghị định 10/2022/NĐ-CP (Điều 4; Điều 7 khoản 1; Điều 8 khoản 1; Điều 10 khoản 10), sửa đổi bởi Nghị định 175/2025/NĐ-CP", "thue_phi"),
    "phi_cong_chung": (
        "Phí công chứng hợp đồng mua bán tính như thế nào",
        "Phí công chứng hợp đồng mua bán tính theo giá trị hợp đồng theo biểu của Bộ Tài chính: giao dịch từ 1 tới 3 tỷ là 1 triệu đồng "
        "cộng 0,06% phần vượt 1 tỷ; từ 3 tới 5 tỷ là 2,2 triệu cộng 0,05% phần vượt 3 tỷ; từ 5 tới 10 tỷ là 3,2 triệu cộng 0,04% phần "
        "vượt 5 tỷ. Nếu giá ghi trong hợp đồng thấp hơn giá Nhà nước thì phí tính theo giá Nhà nước. Ngoài phí này, văn phòng công chứng "
        "thu thêm tiền dịch vụ soạn thảo, đánh máy, sao chụp (không vượt mức tối đa tỉnh ban hành, phải niêm yết), và chi phí nếu công "
        "chứng ngoài văn phòng hoặc ngoài giờ theo thoả thuận, nên hỏi báo giá trước.",
        "Thông tư 257/2016/TT-BTC (Điều 4 khoản 2 điểm a, d) sửa đổi bởi Thông tư 111/2017/TT-BTC; Luật Công chứng số 46/2024/QH15 (Điều "
        "70, 71, 72)", "thue_phi"),
    "quy_trinh_mua_ban": (
        "Các bước mua bán nhà đất từ đặt cọc tới sang tên",
        "Thứ tự thường gặp: (1) kiểm tra sổ, quy hoạch, chủ sở hữu và tình trạng thế chấp, tranh chấp; (2) ký hợp đồng đặt cọc, ghi rõ "
        "giá, thời hạn, bên chịu thuế phí; (3) ký hợp đồng chuyển nhượng có công chứng (tại tổ chức công chứng ở tỉnh, thành có nhà đất) "
        "hoặc chứng thực, thanh toán phần lớn tiền; (4) nộp hồ sơ sang tên kèm tờ khai thuế tại nơi tiếp nhận hồ sơ đất đai, rồi nộp thuế "
        "thu nhập cá nhân, lệ phí trước bạ theo thông báo; (5) nhận sổ đã cập nhật tên mới, thanh toán phần còn lại, bàn giao nhà.",
        "Luật Đất đai 2024 (Điều 27 khoản 3, Điều 45, Điều 133); Luật Công chứng 2024 (Điều 44)", "thu_tuc"),
    "ho_so_ban_nha": (
        "Người bán cần chuẩn bị giấy tờ gì để công chứng",
        "Thường cần: bản chính Giấy chứng nhận (sổ hồng / sổ đỏ); căn cước của người đứng tên và vợ hoặc chồng; giấy đăng ký kết hôn, "
        "hoặc giấy xác nhận tình trạng hôn nhân nếu độc thân, hoặc giấy tờ chứng minh tài sản riêng; nếu nhờ người khác ký thì cần hợp "
        "đồng uỷ quyền công chứng. Nhà có nhiều đồng sở hữu thì tất cả phải ký hoặc uỷ quyền. Văn phòng công chứng sẽ báo thêm giấy tờ "
        "theo từng hồ sơ.",
        "Luật Công chứng 2024 (Điều 42); Luật Hôn nhân và gia đình 2014 (Điều 33, Điều 35); Luật Đất đai 2024 (Điều 27)", "thu_tuc"),
    "dat_coc": (
        "Đặt cọc bao nhiêu, bỏ cọc hoặc chủ đổi ý thì xử lý sao",
        "Mức cọc do hai bên thoả thuận, thực tế hay từ vài chục triệu tới khoảng 5–10% giá bán; riêng mua căn của chủ đầu tư dự án thì "
        "luật chỉ cho thu cọc tối đa 5% và chỉ khi dự án đủ điều kiện bán. Theo Bộ luật Dân sự, nếu bên mua từ chối ký hoặc thực hiện hợp "
        "đồng thì mất tiền cọc; nếu bên bán từ chối thì phải trả lại cọc và một khoản tiền bằng cọc, trừ khi hợp đồng thoả thuận khác. "
        "Hợp đồng đặt cọc không bắt buộc công chứng nhưng nên lập văn bản, có người làm chứng hoặc công chứng để dễ xử lý khi có tranh "
        "cãi.",
        "Bộ luật Dân sự 2015 (Điều 328); Luật Kinh doanh bất động sản 2023 (Điều 23 khoản 5)", "thu_tuc"),
    "vi_bang": (
        "Mua nhà bằng vi bằng thừa phát lại có an toàn không",
        "Vi bằng chỉ là văn bản ghi nhận một sự kiện, hành vi có thật (ví dụ việc giao tiền), do Thừa hành viên (trước 01/07/2026 gọi là "
        "thừa phát lại) lập. Nó không thay thế hợp đồng công chứng, nên không dùng để sang tên sổ được. Pháp luật cũng cấm lập vi bằng để "
        "ghi nhận việc chuyển nhượng nhà đất không có giấy tờ chứng minh quyền sở hữu, sử dụng. Mua bán qua vi bằng rủi ro cao, bên em "
        "không khuyến khích.",
        "Luật Thi hành án dân sự số 106/2025/QH15; Nghị định 151/2026/NĐ-CP (Điều 27, Điều 28), thay Nghị định 08/2020/NĐ-CP; Luật Đất "
        "đai 2024 (Điều 27)", "giay_to"),
    "chua_hoan_cong": (
        "Nhà xây xong chưa hoàn công có bán được không",
        "Chưa hoàn công nghĩa là căn nhà đã xây nhưng chưa được đăng ký ghi nhận vào Giấy chứng nhận; sổ mới công nhận đất (hoặc ngôi nhà "
        "cũ). Vẫn chuyển nhượng được phần đã có trên sổ, nhưng phần nhà chưa ghi nhận thì khó vay ngân hàng và bên mua phải tự làm thủ "
        "tục ghi nhận sau: nhà có giấy phép xây dựng (kể cả giấy phép đứng tên chủ cũ) hoặc nhà không phải xin phép thì thường xin được, "
        "còn nhà xây sai phép, không phép thì có thể bị xử lý và khó được ghi nhận. An toàn hơn là chủ nhà đăng ký bổ sung căn nhà lên sổ "
        "trước khi bán.",
        "Luật Đất đai 2024 (Điều 148); Nghị định 101/2024/NĐ-CP (Điều 23 khoản 4); Luật Nhà ở 2023 (Điều 160); Luật Xây dựng số "
        "135/2025/QH15", "giay_to"),
    "dat_chua_so": (
        "Đất chưa có sổ, mua bán giấy tay có được không",
        "Muốn chuyển nhượng đất thì phải có Giấy chứng nhận (trừ vài trường hợp như thừa kế), đất không tranh chấp, không bị kê biên, và "
        "hợp đồng phải công chứng hoặc chứng thực. Mua đất chưa có sổ bằng giấy tay thì không sang tên được, bên mua rất khó bảo vệ quyền "
        "lợi khi có tranh chấp. Chỉ một số giao dịch giấy tay làm trước 01/08/2024, đất có giấy tờ gốc và không tranh chấp, mới có đường "
        "xin cấp sổ. Bên em không nhận rao những tin không có giấy tờ rõ ràng.",
        "Luật Đất đai 2024 (Điều 27 khoản 3, Điều 45 khoản 1, Điều 137 khoản 5)", "giay_to"),
    "tra_quy_hoach": (
        "Kiểm tra quy hoạch, lộ giới của một thửa đất ở đâu",
        "Có vài cách: tra trên trang Thông tin quy hoạch của TP.HCM theo số tờ, số thửa ghi trên sổ; hỏi trực tiếp UBND phường, xã nơi có "
        "đất; hoặc gửi yêu cầu cung cấp thông tin quy hoạch bằng văn bản tới UBND phường, xã hoặc cơ quan quản lý quy hoạch của Thành phố "
        "(còn quy hoạch sử dụng đất thì hỏi Văn phòng đăng ký đất đai). Thông tin trên bản đồ số chỉ để tham khảo, muốn chắc thì xin văn "
        "bản trả lời.",
        "Luật Quy hoạch đô thị và nông thôn 2024 số 47/2024/QH15, sửa đổi bởi Luật 144/2025/QH15 (Điều 55); Luật Đất đai 2024 (Điều 24)", "quy_hoach"),
    "lo_gioi": (
        "Nhà dính lộ giới, quy hoạch đường nghĩa là gì",
        "Lộ giới là cách gọi quen của ranh giới đường theo quy hoạch (chỉ giới đường đỏ). Phần nhà đất nằm trong lộ giới vẫn thuộc chủ sử "
        "dụng và vẫn giao dịch được, trừ khi đã có quyết định thu hồi đất hoặc thông báo giải toả. Khi Nhà nước mở đường thì phần đó bị "
        "thu hồi, có bồi thường nếu đủ điều kiện; khi đất đã nằm trong kế hoạch thu hồi thì không được xây mới, chỉ được sửa chữa hoặc "
        "xây theo giấy phép có thời hạn. Vì vậy phần dính lộ giới thường được định giá thấp hơn; nên xem bản đồ quy hoạch trước khi mua.",
        "Luật Đất đai 2024 (Điều 76, Điều 95); Luật Nhà ở 2023 (Điều 160); Luật Xây dựng số 135/2025/QH15 (Điều 44); Luật Quy hoạch đô "
        "thị và nông thôn 2024", "quy_hoach"),
    "thoi_han_sang_ten": (
        "Sang tên mất bao lâu, hạn đăng ký biến động là bao nhiêu ngày",
        "Sau khi công chứng, người nhận chuyển nhượng phải đăng ký biến động (sang tên) trong 30 ngày kể từ ngày có biến động. Không đăng "
        "ký thì cá nhân có thể bị phạt 2–3 triệu đồng. Thời gian giải quyết nay do từng tỉnh, thành quy định, chưa tính thời gian nộp "
        "thuế, nên hỏi nơi nhận hồ sơ để biết hạn cụ thể. Hồ sơ nộp tại Văn phòng đăng ký đất đai hoặc nơi tiếp nhận hồ sơ đất đai ở "
        "phường, xã.",
        "Luật Đất đai 2024 (Điều 133 khoản 3); Nghị định 123/2024/NĐ-CP (Điều 16 khoản 2, sửa đổi bởi Nghị định 281/2026/NĐ-CP); Nghị "
        "định 49/2026/NĐ-CP (Điều 14, 15)", "thu_tuc"),
    "nha_the_chap": (
        "Nhà đang thế chấp ngân hàng có mua bán được không",
        "Được, nhưng phải có sự đồng ý của ngân hàng: luật không cho chủ nhà tự bán tài sản đang thế chấp, và sổ thường cũng đang do ngân "
        "hàng giữ. Cách phổ biến: bên mua chuyển một phần tiền để chủ nhà trả nợ, ngân hàng xoá thế chấp và trả sổ, rồi hai bên công "
        "chứng và sang tên; hoặc ký thoả thuận ba bên tại ngân hàng để tiền mua được dùng trả nợ trực tiếp. Nên làm việc tại ngân hàng và "
        "ghi rõ các bước trong hợp đồng đặt cọc.",
        "Bộ luật Dân sự 2015 (Điều 320, Điều 321)", "thu_tuc"),
    "tai_san_chung_vo_chong": (
        "Nhà chỉ một người đứng tên, bán có cần vợ hoặc chồng ký không",
        "Nhà đất có được trong thời kỳ hôn nhân mặc định là tài sản chung của vợ chồng dù sổ chỉ ghi tên một người, nên khi bán cần cả "
        "hai đồng ý bằng văn bản và ký, hoặc người kia uỷ quyền. Ngoại lệ là tài sản riêng: mua trước khi kết hôn, được thừa kế hay tặng "
        "cho riêng, mua bằng tiền riêng, hoặc đã chia riêng theo thoả thuận. Khi đó phải có giấy tờ chứng minh (thường là văn bản xác "
        "nhận tài sản riêng được công chứng), không chứng minh được thì vẫn bị coi là tài sản chung.",
        "Luật Hôn nhân và gia đình 2014 (Điều 33, Điều 34, Điều 35, Điều 43)", "giay_to"),
    "uy_quyen_ban": (
        "Mua bán nhà qua hợp đồng uỷ quyền có rủi ro gì",
        "Hợp đồng uỷ quyền chỉ cho phép người được uỷ quyền thay mặt chủ làm thủ tục, không chuyển quyền sở hữu cho họ. Rủi ro: uỷ quyền "
        "chấm dứt khi một trong hai bên chết, khi hết thời hạn, hoặc khi người uỷ quyền đơn phương chấm dứt, lúc đó người mua vẫn chưa "
        "đứng tên; còn uỷ quyền toàn quyền như chủ sở hữu thì thuế coi là một lần chuyển nhượng, người uỷ quyền phải nộp thuế thu nhập cá "
        "nhân 2%. Nếu bên bán không trực tiếp ký được, nên uỷ quyền có phạm vi rõ và thanh toán theo tiến độ sang tên.",
        "Bộ luật Dân sự 2015 (Điều 140 khoản 3, Điều 562 tới Điều 569); Nghị định 253/2026/NĐ-CP (Điều 11, Điều 57 khoản 6 điểm b)", "giay_to"),
    "chung_cu_so_hong": (
        "Sổ hồng chung cư có thời hạn không, căn hộ chưa có sổ mua bán thế nào",
        "Luật Nhà ở 2023 không đặt thời hạn sở hữu căn hộ cho người Việt Nam (người nước ngoài thì tối đa 50 năm, gia hạn được); luật chỉ "
        "quy định thời hạn sử dụng của toà nhà theo hồ sơ thiết kế và kết quả kiểm định, nhà hết hạn hoặc hư hỏng nguy hiểm thì phải kiểm "
        "định, có thể phải cải tạo, xây lại. Sổ hồng ghi thời hạn sử dụng đất, đất ở là lâu dài. Căn mua của chủ đầu tư chưa có sổ thì "
        "mua bán bằng chuyển nhượng hợp đồng mua bán: hồ sơ cấp sổ cho căn đó phải chưa nộp, hợp đồng không tranh chấp, căn không bị thế "
        "chấp (trừ khi ngân hàng đồng ý); hai bên công chứng văn bản chuyển nhượng, nộp thuế, rồi chủ đầu tư xác nhận, không được thu "
        "phí. Nhà ở xã hội không áp dụng cách này.",
        "Luật Nhà ở 2023 (Điều 20, Điều 58, Điều 59); Luật Kinh doanh bất động sản 2023 (Điều 49 tới Điều 51); Nghị định 96/2024/NĐ-CP "
        "(Điều 13, sửa đổi bởi Nghị định 54/2026/NĐ-CP)", "chung_cu"),
    "phi_bao_tri": (
        "Phí bảo trì 2% chung cư là gì, ai giữ",
        "Người mua căn hộ của chủ đầu tư phải đóng kinh phí bảo trì bằng 2% giá trị căn hộ, tính riêng ngoài tiền mua và ghi rõ trong hợp "
        "đồng, nộp trước khi nhận bàn giao vào tài khoản riêng chủ đầu tư mở tại ngân hàng (chưa đóng thì chưa được nhận nhà). Khi toà "
        "nhà có Ban quản trị được công nhận, chủ đầu tư phải bàn giao khoản này kèm lãi cho Ban quản trị, chỉ dùng để bảo trì phần sở hữu "
        "chung. Khác với phí quản lý vận hành đóng hằng tháng.",
        "Luật Nhà ở 2023 (Điều 151 tới Điều 155)", "chung_cu"),
    "nguoi_nuoc_ngoai": (
        "Người nước ngoài, Việt kiều có được mua nhà ở Việt Nam không",
        "Người nước ngoài được phép nhập cảnh được mua căn hộ, nhà ở riêng lẻ thuộc dự án nhà ở thương mại (không thuộc khu vực quốc "
        "phòng, an ninh), mua của chủ đầu tư hoặc mua lại của người nước ngoài đã sở hữu; tối đa 30% số căn hộ một toà, nhà riêng lẻ tối "
        "đa 250 căn trên khu vực cỡ một phường; sở hữu tối đa 50 năm từ ngày cấp sổ, gia hạn được một lần; không mua được nhà phố ngoài "
        "dự án. Người nước ngoài lấy vợ hoặc chồng là công dân Việt Nam sống ở Việt Nam thì được sở hữu như người Việt. Việt kiều còn "
        "quốc tịch Việt Nam có quyền như người trong nước; người gốc Việt không còn quốc tịch nhưng được nhập cảnh cũng được sở hữu nhà ở "
        "gắn với đất ở, chi tiết nên hỏi công chứng viên.",
        "Luật Nhà ở 2023 (Điều 17 tới Điều 20); Luật Đất đai 2024 (Điều 4 khoản 3, Điều 44)", "giay_to"),
    "hop_dong_thue": (
        "Hợp đồng thuê nhà có cần công chứng không, tiền cọc thuê, thuế cho thuê",
        "Hợp đồng thuê nhà ở không bắt buộc công chứng, nhưng nên lập văn bản ghi rõ giá, thời hạn, cọc, điều kiện chấm dứt; muốn chắc "
        "hơn thì công chứng. Tiền cọc thuê do hai bên thoả thuận, phổ biến 1 tới 2 tháng tiền thuê. Về thuế, theo quy định áp dụng từ năm "
        "2026, cá nhân cho thuê có tổng doanh thu cho thuê từ 1 tỷ đồng/năm trở xuống không phải nộp thuế giá trị gia tăng và thuế thu "
        "nhập cá nhân; trên 1 tỷ thì nộp thuế giá trị gia tăng 5% trên doanh thu và thuế thu nhập cá nhân 5% trên phần doanh thu vượt 1 "
        "tỷ. Ngưỡng này do Chính phủ điều chỉnh theo từng thời kỳ, nên kiểm lại với cơ quan thuế.",
        "Luật Nhà ở 2023 (Điều 164 khoản 2); Luật Thuế thu nhập cá nhân số 109/2025/QH15 (Điều 7 khoản 1, 4) sửa đổi bởi Luật "
        "09/2026/QH16; Luật Thuế giá trị gia tăng số 48/2024/QH15 (Điều 5 khoản 25, Điều 12 khoản 2) sửa đổi bởi Luật 149/2025/QH15 và "
        "Luật 09/2026/QH16; Nghị định 68/2026/NĐ-CP (Điều 3, 4) sửa đổi bởi Nghị định 141/2026/NĐ-CP", "cho_thue"),
    "giay_phep_xay_dung": (
        "Xây mới hoặc sửa nhà có cần giấy phép xây dựng không",
        "Xây mới nhà ở riêng lẻ ở phường, khu đô thị phải có giấy phép xây dựng; hồ sơ nộp trực tuyến trên Cổng Dịch vụ công quốc gia, do "
        "UBND phường, xã cấp (từ 01/07/2025 không còn cấp huyện), khoảng 7 ngày làm việc khi hồ sơ hợp lệ. Sửa chữa bên trong, hoặc sửa "
        "mặt ngoài không giáp đường đô thị có yêu cầu quản lý kiến trúc, mà không đổi công năng, không ảnh hưởng kết cấu chịu lực thì "
        "được miễn; nhà dưới 7 tầng, sàn dưới 500 m² chỉ được miễn khi nằm ngoài khu đô thị, khu dân cư đã có quy hoạch. Nhà xây sai phép "
        "hoặc không phép có thể bị xử lý và khó hoàn công, nên kiểm giấy phép trước khi mua nhà mới xây.",
        "Luật Xây dựng số 135/2025/QH15 (Điều 43); Nghị định 217/2026/NĐ-CP (Điều 53, Điều 54); Luật Tổ chức chính quyền địa phương số "
        "72/2025/QH15 (Điều 51)", "quy_hoach"),
    "len_tho_cu": (
        "Chuyển đất nông nghiệp, đất vườn lên đất thổ cư làm sao, tốn bao nhiêu",
        "Phải nộp đơn xin chuyển mục đích sử dụng đất; chỉ được cho phép khi thửa đất phù hợp quy hoạch sử dụng đất cấp xã hoặc quy hoạch "
        "đô thị là đất ở. Khi được duyệt phải nộp tiền sử dụng đất tính theo chênh lệch giữa giá đất ở và giá đất nông nghiệp trên bảng "
        "giá đất. Từ 2026, hộ gia đình, cá nhân chuyển đất vườn, ao lên đất ở có thể được tính mức thấp hơn, nhưng chỉ áp một lần cho một "
        "thửa; lần sau tính đủ 100%. Nên hỏi UBND phường, xã về quy hoạch và cách tính tiền trước khi mua đất chờ lên thổ cư.",
        "Luật Đất đai 2024 (Điều 116 khoản 5, Điều 121); Nghị định 102/2024/NĐ-CP (Điều 44); Nghị định 103/2024/NĐ-CP sửa đổi bởi Nghị "
        "định 50/2026/NĐ-CP; Nghị quyết 254/2025/QH15 (Điều 10); Nghị định 50/2026/NĐ-CP (Điều 6)", "quy_hoach"),
    "dat_nong_nghiep_mua": (
        "Mua đất nông nghiệp có xây nhà được không, ai được mua",
        "Đất nông nghiệp phải dùng đúng mục đích. Không được xây nhà ở, chỉ được làm công trình phục vụ trực tiếp sản xuất. Xây trái phép "
        "bị phạt và buộc khôi phục lại hiện trạng đất. Cá nhân không trực tiếp làm nông vẫn nhận chuyển nhượng đất trồng lúa được trong "
        "hạn mức (ở Đông Nam Bộ tối đa 3 ha). Vượt hạn mức thì phải lập tổ chức kinh tế và có phương án sử dụng đất được duyệt. Muốn ở "
        "thì phải xin chuyển mục đích lên đất ở và được chấp thuận.",
        "Luật Đất đai 2024 (Điều 31, Điều 45 khoản 7, Điều 121, Điều 176, Điều 182); Nghị định 49/2026/NĐ-CP (Điều 14); Nghị định "
        "123/2024/NĐ-CP sửa đổi bởi Nghị định 281/2026/NĐ-CP", "quy_hoach"),
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


# ── Thuế phí tính theo giá căn (SRS-5.1zzzzzzz179 mục 3, 25/10/2026; MOSO AI nhân ra số theo giá căn đang xem, mình chỉ nói tỷ lệ) ──
# Tỷ lệ là quy định chung (TNCN 2 % giá chuyển nhượng — Luật Thuế TNCN; trước bạ 0,5 % — NĐ 10/2022; công chứng theo biểu giá trị tài sản —
# TT 257/2016/TT-BTC Điều 4). Cũng như MAC_DINH: bản AI soạn, CHƯA người có chuyên môn duyệt — bot luôn nói "tham khảo". Chỉ tính khi khách hỏi
# đúng các mục dưới và hội thoại có căn đã biết giá; không có căn thì giữ câu tỷ lệ.
PHI_THEO_GIA = ("thue_phi_sang_ten", "thue_tncn", "le_phi_truoc_ba", "phi_cong_chung")
TY_LE_TNCN = 0.02
TY_LE_TRUOC_BA = 0.005
# Biểu phí công chứng hợp đồng theo giá trị (TT 257/2016, Điều 4 khoản 2 điểm a): (ngưỡng trên, phí cố định, tỷ lệ phần vượt ngưỡng dưới).
_BIEU_CONG_CHUNG = (
    (50_000_000, 50_000, 0.0),
    (100_000_000, 100_000, 0.0),
    (1_000_000_000, 0, 0.001),                 # 0,1 % giá trị
    (3_000_000_000, 1_000_000, 0.0006),        # 1 triệu + 0,06 % phần vượt 1 tỷ
    (5_000_000_000, 2_200_000, 0.0005),        # 2,2 triệu + 0,05 % phần vượt 3 tỷ
    (10_000_000_000, 3_200_000, 0.0004),       # 3,2 triệu + 0,04 % phần vượt 5 tỷ
    (100_000_000_000, 5_200_000, 0.0003),      # 5,2 triệu + 0,03 % phần vượt 10 tỷ
)
_CONG_CHUNG_TOI_DA = 70_000_000


def phi_cong_chung(gia: float) -> int:
    """Phí công chứng hợp đồng mua bán theo biểu TT 257/2016 (tham khảo). gia ≤ 0 → 0."""
    if gia <= 0:
        return 0
    duoi = 0
    for tran, co_dinh, ty_le in _BIEU_CONG_CHUNG:
        if gia <= tran:
            if ty_le == 0.001:
                return int(round(gia * ty_le))
            return int(round(co_dinh + (gia - duoi) * ty_le))
        duoi = tran
    return min(_CONG_CHUNG_TOI_DA, int(round(32_200_000 + (gia - 100_000_000_000) * 0.0002)))


def tinh_phi(gia_vnd: float) -> dict[str, int]:
    """Ba khoản theo giá căn: thuế TNCN bên bán, lệ phí trước bạ bên mua, phí công chứng (tham khảo)."""
    gia = float(gia_vnd or 0)
    return {"tncn": int(round(gia * TY_LE_TNCN)), "truoc_ba": int(round(gia * TY_LE_TRUOC_BA)), "cong_chung": phi_cong_chung(gia)}


def tien(v: float) -> str:
    """Số tiền đọc như môi giới nhắn: 100 triệu, 4,2 triệu, 2,5 tỷ, 350 nghìn."""
    v = float(v or 0)
    def _s(x: float) -> str:
        return (f"{x:.1f}".rstrip("0").rstrip(".")).replace(".", ",")
    if v >= 1_000_000_000:
        return f"{_s(v / 1_000_000_000)} tỷ"
    if v >= 1_000_000:
        return f"{_s(v / 1_000_000)} triệu"
    return f"{_s(v / 1_000)} nghìn"


def khoi_phi_theo_can(khoa: str | None, gia_vnd: float | None, ma_can: str | None = None) -> str:
    """Dòng số tính sẵn theo giá căn — chỉ cho 4 mục thuế phí và khi đã biết giá; khoá khác / không giá → ""."""
    if khoa not in PHI_THEO_GIA or not gia_vnd or float(gia_vnd) <= 0:
        return ""
    p = tinh_phi(float(gia_vnd))
    ten = f"căn {ma_can}" if ma_can else "căn khách đang xem"
    dong = []
    if khoa in ("thue_phi_sang_ten", "thue_tncn"):
        dong.append(f"thuế TNCN bên bán 2 % ≈ {tien(p['tncn'])}")
    if khoa in ("thue_phi_sang_ten", "le_phi_truoc_ba"):
        dong.append(f"lệ phí trước bạ bên mua 0,5 % ≈ {tien(p['truoc_ba'])}")
    if khoa in ("thue_phi_sang_ten", "phi_cong_chung"):
        dong.append(f"phí công chứng theo biểu ≈ {tien(p['cong_chung'])}")
    return (f"SỐ TÍNH THEO CĂN (giá {tien(float(gia_vnd))} của {ten}, tham khảo — code tính, được nói đúng các số này): "
            + "; ".join(dong) + ". Hồ sơ cụ thể có thể khác; không tự tính thêm số nào ngoài các số này.\n")


TIEU_DE_DIEU_LUAT = "ĐIỀU LUẬT TRA ĐƯỢC"
CAT_DIEU = 900   # ký tự mỗi điều đưa cho model — đủ khoản liên quan, không nhồi cả điều dài


def khoi_dieu_luat(dieu: list[dict] | None, ngoai_kho: bool = False) -> str:
    """Nguyên văn điều luật tra theo nghĩa (SRS-5.1zzzzzzz231, chủ dự án 28/10: "24 câu + trích điều"). `ngoai_kho`: câu hỏi không có trong
    24 mục — model chỉ được tóm đúng điều luật, không suy diễn. Không có điều → ""."""
    ds = [d for d in (dieu or []) if isinstance(d, dict) and d.get("noi_dung")]
    if not ds:
        return ""
    dong = "\n".join(
        f"- {d.get('ten_van_ban') or d.get('so_hieu')} ({d.get('so_hieu')}), {d.get('tieu_de')}"
        f"{' (phần ' + str(d.get('phan')) + ')' if (d.get('phan') or 1) > 1 else ''}: «{str(d['noi_dung'])[:CAT_DIEU]}»"
        for d in ds)
    if ngoai_kho:
        return (f"\n\n=== ƯU TIÊN LƯỢT NÀY — KHÁCH HỎI PHÁP LÝ NGOÀI TÀI LIỆU SOẠN SẴN; {TIEU_DE_DIEU_LUAT} (nguyên văn, tìm theo nghĩa): ===\n"
                + dong + "\n"
                "Nếu một điều trên trả lời ĐÚNG câu khách hỏi: tóm ĐÚNG điều đó nói (1–3 câu, lời thường), nêu tên văn bản và số điều, KHÔNG "
                "suy diễn sang trường hợp riêng của khách, KHÔNG thêm điều kiện / con số / thời hạn không có trong nguyên văn, nói đây là tham khảo "
                "theo nguyên văn luật, hồ sơ cụ thể cần kiểm lại với văn phòng công chứng hoặc văn phòng đăng ký đất đai. Nếu không điều nào trả "
                "lời đúng câu khách hỏi: nói thật tài liệu bên em chưa có, KHÔNG đoán, hỏi MỘT câu khách có muốn em nối anh/chị phụ trách không.\n")
    return (f"{TIEU_DE_DIEU_LUAT} liên quan (nguyên văn, tìm theo nghĩa — để dẫn căn cứ):\n" + dong + "\n"
            "Khách hỏi nguồn / căn cứ thì nêu tên văn bản và số điều ở trên. Nếu điều luật trên NÓI KHÁC nội dung tham khảo ở trên ở điểm nào "
            "thì KHÔNG khẳng định điểm đó, nói quy định có thể đã thay đổi và đề nghị nối anh/chị phụ trách kiểm lại.\n")


def khoi_luot(khoa: str | None, nhay_cam: bool = False, gia_can: float | None = None, ma_can: str | None = None,
              dieu: list[dict] | None = None) -> str:
    """Khối dặn model ở lượt trả lời khi lượt lập thao tác đọc được khách hỏi pháp lý. `khoa` None → "". `gia_can` (SRS-5.1zzzzzzz179):
    giá căn đang nói tới — có thì nối dòng số tính sẵn cho các mục thuế phí. `dieu` (SRS-5.1zzzzzzz231): điều luật nguyên văn tra theo
    nghĩa câu khách — nối kèm câu soạn sẵn; câu ngoài kho mà có điều khớp thì model tóm điều đó thay vì nói "chưa có"."""
    if not khoa:
        return ""
    if nhay_cam:
        return ("\n\n=== ƯU TIÊN LƯỢT NÀY — CÂU HỎI PHÁP LÝ NHẠY CẢM (hệ thống ĐÃ BÁO người phụ trách): ===\n"
                "Việc này (tranh chấp / thừa kế / ly hôn / nghi giấy tờ giả / thuế hồ sơ cụ thể) cần người có chuyên môn đọc hồ sơ, em KHÔNG tư "
                "vấn nội dung, KHÔNG đoán hướng xử lý. Nói ngắn, ấm: em đã báo anh/chị phụ trách liên hệ hỗ trợ; khách có thể gửi sẵn giấy tờ "
                "liên quan. KHÔNG hứa giờ cụ thể, KHÔNG xin số điện thoại.\n")
    d = tra_loi(khoa)
    if d is None and khoi_dieu_luat(dieu):
        return khoi_dieu_luat(dieu, ngoai_kho=True)
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
            + (f" (nguồn: {d['nguon']})" if d.get("nguon") else "") + ".\n"
            + khoi_phi_theo_can(khoa, gia_can, ma_can) + khoi_dieu_luat(dieu))
