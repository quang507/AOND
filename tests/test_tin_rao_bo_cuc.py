"""19/10/2026 (SRS-5.1zzzzzzz64, theo anh Luận 802b957 + 0b31235 + ffd3684): bố cục tin rao MỘT nguồn `AD_FORMAT` — tiêu đề 15–25 từ,
mô tả 70–150 từ, 4–5 gạch không nhãn, một dòng trống giữa 3 khối — cho bản nháp và bản sửa sau khi xem nháp (từ 20/10, SRS-5.1zzzzzzz86, lượt
chat KHÔNG còn tự soạn bài đăng khi khách xin — bài đó không 📋, không ghi là bản nháp); tin rao có gạch đầu dòng đi MỘT bong bóng để giữ dòng trống. Đỏ khi một trong ba nơi tự viết luật riêng
(đúng 4 gạch, thiếu luật dòng trống) hay khi chunk_reply cắt tin rao ra nhiều bong bóng."""
from aioi import prompts
from aioi.delivery import chunk_reply
from aioi.schema import Property

P = Property(loai_hinh="nha_pho", fields={"gia": "5 tỷ", "dia_chi": "12 Lê Lợi", "dien_tich_dat": "60m2"})


def test_ad_format_mot_nguon_o_ca_ba_noi():
    assert "4–5 GẠCH ĐẦU DÒNG" in prompts.AD_FORMAT and "MỘT DÒNG TRỐNG" in prompts.AD_FORMAT
    assert "15–25 từ" in prompts.AD_FORMAT and "70–150 từ" in prompts.AD_FORMAT   # SRS-207: khuôn anh Luận (thay 20–25 từ của SRS-192)
    he_thong = [
        prompts.build_listing_proposal_system("Lan", P),
        prompts.build_fee_followup_system("Lan", P),
    ]
    for s in he_thong:
        assert prompts.AD_FORMAT in s
        assert "đúng 4 gạch" not in s.lower()


def test_chat_khong_tu_soan_bai_dang():
    # SRS-5.1zzzzzzz86: bắn thử KB1/KB2 "ok em đăng đi" khi tin còn thiếu → lượt chat soạn bài đăng không 📋, khách duyệt không ghi.
    s = prompts.build_chat_system("Lan", P, "phap_ly")
    assert prompts.AD_FORMAT not in s and "KHÔNG tự soạn bài đăng" in s and "khoảng 30 từ" in s


def test_tin_rao_di_mot_bong_giu_dong_trong():
    ad = ("🔥 TIÊU ĐỀ HẤP DẪN MÃ LÒ\n\n"
          "Căn nhà 2 mặt tiền ngay Mã Lò, kết nối thuận tiện, công năng linh hoạt.\n\n"
          "- 2 mặt tiền, ngang 12m\n- 6 tầng thang máy, 132m²\n- sổ hồng chính chủ\n- 19 tỷ (TL)")
    assert chunk_reply(ad) == [ad]
    thuong = "Nhà mình đẹp quá anh.\n\nAnh cho em xin giá mong muốn nhé?"
    assert len(chunk_reply(thuong)) == 2                     # lời chat thường vẫn chia bong bóng như cũ


def test_tran_lich_su_gui_model():
    from aioi.assistants import assign_assistant
    from aioi.engine import Conversation, Turn

    c = Conversation(user_key="u", assistant=assign_assistant("u"))
    c.history = [Turn("user" if i % 2 else "assistant", f"lượt {i}", float(i)) for i in range(305)]
    m = c.messages()
    assert len(m) == 30 and m[-1].content == "lượt 304"       # anh Luận e4cbf90: không gửi cả lịch sử nhiều tháng; 30 tin như
    # MAX_HISTORY_TURNS bản anh Luận (SRS-5.1zzzzzzz81)
