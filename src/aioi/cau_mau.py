"""Câu mẫu cố định bot nói nguyên văn — một nguồn, chủ dự án sửa ở CRM (SRS-5.1zzzzzzz106, 21/10/2026: "đưa thêm 1 bảng nhỏ ở 1 bên là
các câu đã sửa thành mẫu từ lúc lấy lại các yêu cầu của anh Luận đến bây giờ… có gì vào sửa tiếp").

Câu trong code (`MAC_DINH`) là MẶC ĐỊNH; dòng ở bảng `cau_mau` (trang /admin/cau-chuan, khung "Câu mẫu cố định") đè lên, đọc lại sau
60 giây. Chỗ giữ chữ: `{goi}` = cách gọi khách (anh / chị / anh/chị), `{Goi}` = như trên, viết hoa chữ đầu; vài câu có thêm chỗ giữ
riêng (ghi ở cột "dùng ở đâu", vd `{ten}` tên trợ lý, `{n}` số căn). Câu sửa hỏng (ngoặc nhọn lạ, rỗng, sai khung bắt buộc như dòng mở
bản nháp phải bắt đầu "📋" và kết thúc ":") thì dùng mặc định — bot không bao giờ gửi câu lỗi vì một lần sửa tay.

21/10/2026 (SRS-5.1zzzzzzz110, chủ dự án "đưa luôn mấy câu trước đó nữa đi"): thêm 22 câu nguyên văn có từ trước khi theo anh Luận —
chào / làm mới phiên, dòng mở + câu hỏi cuối bản nháp, ẩn / giữ rổ hàng, nhận ảnh, link / file không mở được, bản vẽ, bảng tính,
tin nhắc 5 phút.

21/10/2026 (SRS-5.1zzzzzzz111, chủ dự án "mấy câu mẫu đã sửa cũng cho lên trên câu mẫu lun"): câu báo phí tester sửa ở trang Câu chuẩn
thành câu mẫu `bao_phi` — hai câu tester sửa còn lại (nhắc bản nháp, duyệt tin) đã có sẵn."""
from __future__ import annotations

import logging
import time
from typing import Callable

log = logging.getLogger(__name__)

# khoá → (câu mặc định, dùng ở đâu, nguồn quyết định). Thứ tự = thứ tự hiện trên CRM.
MAC_DINH: dict[str, tuple[str, str, str]] = {
    "duyet_tin": ("Em xin phép đăng tin ạ!",
                  "Khách duyệt bản nháp — đoạn đầu lời đáp (tin đã lên web)", "SRS-5.1zzzzzzz103 · tester, chủ dự án 21/10"),
    "hoi_phi": ("{Goi} có thể vào aioinhadat.com để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?",
                "Ngay sau câu duyệt tin — tin nhắn thứ hai, câu hỏi phí (bot nói theo tinh thần câu này)",
                "SRS-5.1zzzzzzz81 / 98 · bản anh Luận + câu tester 21/10"),
    "bao_phi": ("Em xin phép báo phí bên em: phí môi giới bên em là {phi}. Chỉ thu khi giao dịch thành công. Mình cần biết thêm thông "
                "tin, nhắn em hỗ trợ ạ.",
                "Báo con số phí (khách chưa biết phí / hỏi phí). {phi} = mức phí theo vai + bán hay thuê, code điền (vd \"0.75 tháng "
                "tiền thuê\") — câu sửa phải giữ {phi}", "SRS-5.1zzzzzzz111 · câu tester sửa ở Câu chuẩn 21/10"),
    "nhac_ban_nhap": ("Em gửi {goi} bản nháp tin đăng, mình cần chỉnh sửa thêm nhắn em hỗ trợ ạ!",
                      "Tin nhắc sau 5 phút khách chưa trả lời bản nháp", "SRS-5.1zzzzzzz99 / 101 · câu tester 21/10"),
    "nhac_ban_nhap_em": ("Mình gửi em bản nháp tin đăng, em cần chỉnh sửa thêm nhắn mình hỗ trợ nhé!",
                         "Như trên, khi khách xưng \"em\" (bot xưng \"mình\")", "SRS-5.1zzzzzzz101"),
    "xin_cham_sao": ("{Goi} chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.",
                     "Xin khách chấm sao — một lần, sau khi tin lên web và nói xong phí / khách mua đủ thông tin căn",
                     "SRS-5.1zzzzzzz104 · chủ dự án chốt 21/10"),
    "xin_cham_sao_em": ("Em chấm giúp mình 1–5 sao cho lần hỗ trợ này nha, để mình làm tốt hơn nhé.",
                        "Như trên, khi khách xưng \"em\"", "SRS-5.1zzzzzzz104"),
    "giu_cho": ("Em đang xem kỹ thông tin anh/chị gửi, anh/chị chờ em một chút nhé, em trả lời ngay ạ.",
                "Lượt trả lời bị lỗi — giữ chỗ, bot tự làm lại sau 20 giây", "SRS-5.1zzzzzzz82 · đánh giá UX 20/10"),
    "thu_lai_hong": ("Em xin lỗi anh/chị, hệ thống bên em đang chậm. Em đã báo anh/chị phụ trách xem tin của mình, anh/chị ấy sẽ "
                     "nhắn lại sớm ạ.", "Làm lại vẫn lỗi — xin lỗi và báo người phụ trách", "SRS-5.1zzzzzzz82"),
    # --- Câu có từ trước khi theo anh Luận (SRS-5.1zzzzzzz110) ---
    "chao_lan_dau": ("Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨\n{Goi} đang cần gửi bán, cho thuê nhà, hay "
                     "đang tìm mua ạ?",
                     "Khách chào (hello / hi / alo / 👋) lần đầu. {ten} = tên trợ lý",
                     "Lời chào cũ (quyết định 20/10); 25/10 thêm \"tìm mua\" (SRS-174); 26/10 bỏ kể loại nhà — một câu hỏi (SRS-5.1zzzzzzz212)"),
    "chao_lam_moi": ("Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨\nEm đã làm mới cuộc trò chuyện rồi ạ. {Goi} "
                     "đang cần gửi bán, cho thuê nhà, hay đang tìm mua ạ?",
                     "Khách chào khi đã có chuyện cũ — làm mới phiên. {ten} = tên trợ lý",
                     "Quyết định 20/10: hello làm mới phiên; 25/10 thêm \"tìm mua\" (SRS-174); 26/10 bỏ kể loại nhà (SRS-5.1zzzzzzz212)"),
    "chao_tu_van": ("Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨\n{Goi} đang tìm căn như thế nào, kể em nghe "
                    "với ạ?",
                    "Khách chào lần đầu ở số Zalo TƯ VẤN người mua. {ten} = tên trợ lý",
                    "SRS-5.1zzzzzzz210 · chủ dự án 26/10: một số nhận ký gửi, một số tư vấn người mua; câu hỏi mở (SRS-5.1zzzzzzz212)"),
    "mo_dau_nhap": ("📋 Em sẽ rao như vầy nhé {goi}:",
                    "Dòng mở bản nháp tin rao — phải bắt đầu 📋 và kết thúc dấu \":\" (code cắt câu dẫn theo dòng này)",
                    "SRS-5.1zzzzzzz76 / 85 / 90"),
    "mo_dau_nhap_em": ("📋 Mình sẽ rao như vầy nhé em:", "Như trên, khi khách xưng \"em\" — phải bắt đầu 📋, kết thúc \":\"",
                       "SRS-5.1zzzzzzz76"),
    "hoi_ban_nhap": ("{Goi} muốn sửa chỗ nào, hay em đăng luôn ạ?", "Câu hỏi cuối bản nháp (bot được dặn kết bản nháp bằng câu này)",
                     "Kịch bản người bán; 26/10 bỏ câu dẫn dắt \"hấp dẫn chưa\" (SRS-5.1zzzzzzz212)"),
    "hoi_ban_nhap_em": ("Em muốn sửa chỗ nào, hay mình đăng luôn nhé?", "Như trên, khi khách xưng \"em\"",
                        "Kịch bản người bán; 26/10 bỏ câu dẫn dắt (SRS-5.1zzzzzzz212)"),
    "xac_nhan_an": ("{Goi} muốn em **{viec}** — đúng không ạ? Nhắn **\"đúng\"** để em làm, hoặc **\"thôi\"** để giữ nguyên nhé. (Em "
                    "KHÔNG xóa dữ liệu đâu — chỉ ẩn tin, rao lại lúc nào cũng được.)",
                    "Khách bảo gỡ / ẩn căn — hỏi xác nhận trước. {viec} = việc sắp làm (vd \"NGƯNG RAO căn A12\")",
                    "Hỏi trước khi ẩn"),
    "da_an_het": ("Em đã NGƯNG RAO toàn bộ rổ hàng ạ — các tin giờ ở trạng thái **không rao** (em vẫn giữ nguyên dữ liệu, {goi} muốn "
                  "rao lại căn nào cứ nhắn em). 🙈", "Khách đồng ý ẩn hết", "Hỏi trước khi ẩn"),
    "da_an_bot": ("Em đã cập nhật — giờ còn **{n} căn đang rao** ạ. Các căn kia em chuyển sang **không rao** (vẫn giữ dữ liệu, rao lại "
                  "được bất cứ lúc nào nha). ✅", "Khách đồng ý ẩn bớt / chỉ giữ vài căn. {n} = số căn còn rao", "Hỏi trước khi ẩn"),
    "da_cap_nhat_ro": ("Em đã cập nhật rổ hàng rồi ạ.", "Khách đồng ý, việc khác ngoài ẩn", "Hỏi trước khi ẩn"),
    "giu_nguyen_ro": ("Em giữ nguyên rổ hàng, không xóa gì đâu ạ 👍", "Khách không đồng ý ẩn", "Hỏi trước khi ẩn"),
    "nhan_anh": ("📎 Em đã nhận {n} ảnh của nhà mình rồi nhé! 📸✨", "Dòng đầu khi khách gửi ảnh (tên file là mã máy). {n} = số ảnh",
                 "Nhận ảnh"),
    "file_qua_lon": ("File to quá ạ (>20MB), xin lỗi em chưa xử lý được 😔. Em đã báo admin rồi ạ — {goi} không cần làm gì thêm đâu. "
                     "Admin của em sẽ vào chat này đọc file/link của mình rồi xử lý sau nhé!",
                     "Khách gửi file / ảnh quá 20 MB — đã báo admin", "Nhận tệp"),
    "link_thu_muc_drive": ("Đây là link thư mục Drive ạ. {Goi} gửi từng ảnh/file (hoặc link từng tấm) giúp em nhé!",
                           "Khách gửi link THƯ MỤC Google Drive (chưa đọc được)", "Nhận tệp"),
    "link_khong_mo_duoc": ("Em chưa mở được link này ạ. {Goi} chụp và gửi thẳng giúp em vài tấm nhé!",
                           "Khách gửi link ảnh / tệp không tải được", "Nhận tệp"),
    "link_web_trong": ("Em mở link nhưng chưa đọc được nội dung ạ 😅. {Goi} gửi link khác, hoặc dán nội dung giúp em nhé.",
                       "Khách gửi link trang web mà trang trống", "Nhận tệp"),
    "nhap_bang_tinh": ("Em nhận được bảng tính rồi, đã nhập {n} căn vào rổ hàng của mình ạ! 🎉 {Goi} xem lại giúp em nhé.",
                       "Khách gửi link bảng tính (rổ hàng). {n} = số căn đã nhập", "Nhận tệp"),
    "bang_tinh_trong": ("Em có nhận bảng tính nhưng chưa đọc ra căn nào — {goi} kiểm tra lại các cột (loại hình, địa chỉ, diện tích, "
                        "giá...) giúp em nhé.", "Bảng tính không đọc ra căn nào", "Nhận tệp"),
    "chua_co_ban_ve": ("Em CHƯA có bản vẽ/mặt bằng {can} ạ 😅. {Goi} gửi giúp em file bản vẽ, hoặc để em xin bên dự án rồi gửi lại "
                       "nhé! (Em không đụng gì tới rổ hàng đâu ạ.)",
                       "Khách xin bản vẽ / mặt bằng mà chưa có. {can} = căn đang nói (vd \"căn A12 (mẫu Fusion)\")", "Bản vẽ"),
    "nhac_hoi_lai": ("{Goi} ơi, {toi} hỏi lại chút nha: {hoi}",
                     "Tin nhắc sau 5 phút khách im — hỏi lại câu bot vừa hỏi. {toi} = em / mình, {hoi} = câu bot vừa hỏi",
                     "SRS-5.1zzzzzzz73"),
    "nhac_xin_anh": ("Khi nào tiện {goi} chụp gửi em vài tấm ảnh thực tế nhé, để tin đăng nổi bật và hút khách hơn ạ.",
                     "Tin nhắc sau 5 phút khi không còn câu chờ và căn chưa có ảnh", "SRS-5.1zzzzzzz73"),
    "nhac_xin_anh_em": ("Khi nào tiện em chụp gửi mình vài tấm ảnh thực tế nhé, để tin đăng nổi bật và hút khách hơn nè.",
                        "Như trên, khi khách xưng \"em\"", "SRS-5.1zzzzzzz73"),
    # --- Báo khách mua khi có căn mới vừa nhu cầu (SRS-5.1zzzzzzz150) ---
    "bao_can_moi": ("{Goi} ơi, {toi} đang có căn này hợp với nhu cầu của {goi} nè, {goi} xem qua nha.\n\n{Mo_ta}. {vi_sao}\n\n"
                    "Xem hình và chi tiết ở đây ạ: {link}\n\n{Goi} có muốn {toi} sắp lịch xem thử không ạ?",
                    "Tin chủ động báo khách mua có căn mới vừa nhu cầu (8–20 giờ, tối đa 1 tin / khách / 24 giờ). MỖI ĐOẠN cách nhau một dòng trống là "
                    "MỘT tin Zalo (ảnh căn gửi ngay sau đoạn có {link}). {toi} = em / mình, {Mo_ta} (hoặc {mo_ta}, chữ thường) = loại, đường, phường, quận, diện tích, "
                    "giá, phòng ngủ, {vi_sao} = vì sao hợp (khu, loại, ngân sách, xe hơi — code ghép từ dữ liệu), {link} = link căn",
                    "SRS-5.1zzzzzzz150 / 159 · chủ dự án 23/10"),
    "bao_can_moi_vuot": ("{Goi} ơi, {toi} đang có căn này gần với nhu cầu của {goi} nè, {goi} xem qua nha.\n\n{Mo_ta}. {vi_sao} Giá nhỉnh hơn "
                         "ngân sách {goi} nêu khoảng {pct}%.\n\nXem hình và chi tiết ở đây ạ: {link}\n\n{Goi} thấy sao, {toi} sắp lịch xem thử "
                         "giúp {goi} nhé?",
                         "Như trên, khi giá vượt ngân sách một chút (tới 15 %). {pct} = % vượt, code tính", "SRS-5.1zzzzzzz150 / 159 · chủ dự án 23/10"),
    # --- Biến thể tin báo căn mới: hai tin liền nhau cho một khách không được cùng văn phong (SRS-5.1zzzzzzz188) ---
    'bao_can_moi_2': ('Vừa có căn mới lên kệ, {toi} thấy khá sát chỗ {goi} đang tìm đó.\n\n{Mo_ta}. {vi_sao}\n\nHình với thông tin đầy đủ {toi} để ở đây nè: {link}\n\nNếu {goi} ưng thì {toi} giữ lịch cho {goi} qua xem nhé?',
        'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`',
        'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong'),
    'bao_can_moi_3': ('Hôm nay {toi} gặp một căn {goi} có thể thích đó.\n\n{Mo_ta}. {vi_sao}\n\n{Goi} bấm vào đây xem ảnh thật nha: {link}\n\nNếu {goi} thấy ổn, {toi} hẹn giờ cho {goi} đi xem luôn nha?',
        'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`',
        'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong'),
    'bao_can_moi_4': ('Mới có thêm một căn đúng gu {goi} tìm nè, {goi} xem thử nha.\n\n{Mo_ta}. {vi_sao}\n\nChi tiết và hình ảnh ở link này ạ: {link}\n\n{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?',
        'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`',
        'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong'),
    'bao_can_moi_vuot_2': ('Vừa có căn mới lên kệ, {toi} thấy khá gần chỗ {goi} đang tìm đó.\n\n{Mo_ta}. {vi_sao} Giá cao hơn mức {goi} đặt khoảng {pct}%.\n\nHình với thông tin đầy đủ {toi} để ở đây nè: {link}\n\nNếu {goi} thấy được thì {toi} giữ lịch cho {goi} qua xem nhé?',
        'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách',
        'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong'),
    'bao_can_moi_vuot_3': ('Hôm nay {toi} gặp một căn gần ý {goi}, có điều giá nhỉnh một chút.\n\n{Mo_ta}. {vi_sao} Giá vượt ngân sách khoảng {pct}%.\n\n{Goi} bấm vào đây xem ảnh thật nha: {link}\n\nNếu {goi} thấy chấp nhận được, {toi} hẹn giờ cho {goi} đi xem luôn nha?',
        'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách',
        'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong'),
    'bao_can_moi_vuot_4': ('Mới có thêm một căn gần gu {goi} tìm nè, {goi} xem thử nha.\n\n{Mo_ta}. {vi_sao} Lưu ý giá đang cao hơn ngân sách khoảng {pct}%.\n\nChi tiết và hình ảnh ở link này ạ: {link}\n\n{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?',
        'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách',
        'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong'),
    # --- Xác nhận lịch hẹn xem với khách mua (SRS-5.1zzzzzzz158) ---
    "xac_nhan_lich": ("{Goi} xác nhận giúp {toi}, {gio} mình đến xem căn {can} đúng không ạ?",
                      "Khách mua đã nói đủ ngày và giờ xem nhà — bot hỏi xác nhận MỘT lần (model chép câu này, chỉ điền chỗ giữ chữ). {toi} = em / "
                      "mình, {gio} = ngày giờ khách đã nói (vd \"4 giờ chiều nay\"), {can} = đường hoặc khu của căn — câu sửa phải giữ {gio} và {can}",
                      "SRS-5.1zzzzzzz158 · câu người xem chat chị Ngân góp ý 23/10"),
}

# Khung bắt buộc của vài câu — code dựa vào khung đó (dòng mở bản nháp: tìm tiêu đề, cắt câu dẫn). Câu sửa sai khung → mặc định.
# Chỗ giữ chữ câu sửa tay BẮT BUỘC giữ (thiếu thì bot nói câu không có con số) — kiểm trên câu sửa, trước khi điền.
_BAT_BUOC = {"bao_phi": ("{phi}",), "xac_nhan_lich": ("{gio}", "{can}")}

_KHUNG = {
    "mo_dau_nhap": lambda c: c.startswith("📋") and c.rstrip().endswith(":") and "\n" not in c,
    "mo_dau_nhap_em": lambda c: c.startswith("📋") and c.rstrip().endswith(":") and "\n" not in c,
}

NHO_GIAY = 60
_doc: Callable[[], dict[str, str]] | None = None
_nho: tuple[float, dict[str, str]] | None = None


def dang_ky(doc: Callable[[], dict[str, str]] | None) -> None:
    """Server gắn hàm đọc bảng `cau_mau` (khoá → câu). Không gắn (chạy thử / test) thì luôn dùng mặc định."""
    global _doc, _nho
    _doc, _nho = doc, None


def _da_sua() -> dict[str, str]:
    global _nho
    if _doc is None:
        return {}
    if _nho is not None and time.time() - _nho[0] < NHO_GIAY:
        return _nho[1]
    try:
        bang = {k: str(v) for k, v in (_doc() or {}).items() if k in MAC_DINH and str(v or "").strip()}
    except Exception as e:  # noqa: BLE001 — đọc bảng lỗi thì dùng mặc định, không làm hỏng lượt
        log.warning("Đọc cau_mau lỗi: %s", e)
        bang = _nho[1] if _nho else {}
    _nho = (time.time(), bang)
    return bang


def _dien(mau: str, goi: str, **bien) -> str:
    goi = (goi or "anh/chị").strip()
    return mau.format(goi=goi, Goi=goi[:1].upper() + goi[1:], **bien).strip()


def cau(khoa: str, goi: str = "anh/chị", **bien) -> str:
    """Câu mẫu đang dùng (đã sửa ở CRM nếu có), điền cách gọi khách và chỗ giữ riêng (`bien`). Câu sửa hỏng → mặc định."""
    mac_dinh = MAC_DINH[khoa][0]
    sua = _da_sua().get(khoa)
    if sua and any(c not in sua for c in _BAT_BUOC.get(khoa, ())):
        log.warning("Câu mẫu %s sửa tay thiếu chỗ giữ bắt buộc — dùng mặc định", khoa)
        sua = None
    if sua:
        try:
            ra = _dien(sua, goi, **bien)
            if ra and _KHUNG.get(khoa, lambda c: True)(ra):
                return ra
            log.warning("Câu mẫu %s sửa tay sai khung — dùng mặc định", khoa)
        except (KeyError, IndexError, ValueError) as e:
            log.warning("Câu mẫu %s sửa tay lỗi chỗ giữ chữ (%s) — dùng mặc định", khoa, e)
    return _dien(mac_dinh, goi, **bien)


def moi_cach_goi(khoa: str, goi_co: tuple[str, ...] = ("anh/chị", "anh", "chị"), **bien) -> list[str]:
    """Câu mẫu với mọi cách gọi — cả bản đang dùng lẫn bản mặc định (để nhận ra câu bot vừa gửi dù vừa sửa ở CRM)."""
    ra = []
    for goi in goi_co:
        ra += [cau(khoa, goi, **bien), _dien(MAC_DINH[khoa][0], goi, **bien)]
    return list(dict.fromkeys(ra))
