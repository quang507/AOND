"""SRS-5.1zzzzzzz155 (chat thử 23/10/2026, "Mr Thu Ngô"): khách chỉ nói "Lê Lai", "39m2, 1 trệt 3 lầu", "7 tỷ 3" — chưa hề nói hẻm hay mặt tiền, DB không có
loại đường vào — nhưng tiêu đề bản nháp ghi "Bán nhà hẻm Lê Lai Q.Tân Bình 39m²…" trong khi mô tả ghi "nằm trên đường Lê Lai". Nguyên nhân: luật viết tin
cho phép "mặt tiền / hẻm xe hơi" làm điểm mạnh và có ví dụ "nhà hẻm", model chép theo; ngoài giá và "MT" căn hộ không có lưới nào kiểm lời trong bản tin
với dữ liệu căn. Đỏ khi bản tin có hẻm / HXH / ngõ / mặt tiền / MT không có dữ liệu mà không bị gọi lại, hoặc khi bản tin có dữ liệu thật bị bắt oan."""
from aioi.assistants import assign_assistant
from aioi.engine import Conversation, Engine, Turn, _hem_mt_khong_co_du_lieu
from tests.test_khen_100 import _SpyHangDoi

TIN_BIA = ("📋 Em sẽ rao như vầy nhé anh chị:\n\nBán nhà hẻm Lê Lai Q.Tân Bình 39m², 1 trệt 3 lầu, 7,3 tỷ\n\n"
           "Nhà nằm trên đường Lê Lai, Phường 12, Quận Tân Bình, gần sân bay và thuận tiện đi lại về trung tâm.\n\n- 39m², 1 trệt 3 lầu\n- 7,3 tỷ\n\n"
           "Anh/chị thấy bản tin này hấp dẫn chưa ạ?")


def _conv(*loi_khach, **fields):
    conv = Conversation(user_key="hm-1", assistant=assign_assistant("hm-1"))
    conv.prop.fields.update(fields)
    for i, t in enumerate(loi_khach):
        conv.history.append(Turn("user", t, float(i)))
    return conv


def test_tieu_de_hem_khong_co_du_lieu_bi_bat():
    conv = _conv("a bán nhà", "Lê Lai e", "39m2 e.1 trệt 3 lầu", "7 tỷ 3", duong="Lê Lai", gia="7 tỷ 3")
    assert [x.lower() for x in _hem_mt_khong_co_du_lieu(TIN_BIA, conv)] == ["hẻm"]
    assert _hem_mt_khong_co_du_lieu(TIN_BIA.replace("nhà hẻm", "nhà MT"), conv) == ["mt"]
    assert _hem_mt_khong_co_du_lieu("Bản tin chưa có hẻm hay mặt tiền thì em hỏi: nhà mình hẻm hay mặt tiền vậy anh?", conv) == []   # không phải bản tin 📋


def test_co_du_lieu_hoac_khach_da_noi_thi_khong_bat():
    assert _hem_mt_khong_co_du_lieu(TIN_BIA, _conv("nhà trong hẻm Lê Lai 39m2", gia="7 tỷ 3")) == []                 # khách nói chữ hẻm
    assert _hem_mt_khong_co_du_lieu(TIN_BIA, _conv("nhà trong hem Le Lai", gia="7 tỷ 3")) == []                       # gõ không dấu
    assert _hem_mt_khong_co_du_lieu(TIN_BIA, _conv("Lê Lai", lo_gioi_hem="Nhà hẻm")) == []                           # ô đã ghi
    assert _hem_mt_khong_co_du_lieu(TIN_BIA.replace("nhà hẻm", "nhà MT"), _conv("nhà mặt tiền Lê Lai")) == []
    assert _hem_mt_khong_co_du_lieu(TIN_BIA.replace("nhà hẻm", "nhà HXH"), _conv("hẻm xe hơi đường Lê Lai")) == []
    # địa chỉ có dấu "/" là nhà hẻm (cùng luật `Property.update` gán lo_gioi_hem) — khách nói "12/3 Lê Lai" thì "hẻm" có cơ sở; "Lê Lai" trơn thì không
    assert _hem_mt_khong_co_du_lieu(TIN_BIA, _conv("nhà 12/3 Lê Lai, 39m2", gia="7 tỷ 3")) == []
    assert [x.lower() for x in _hem_mt_khong_co_du_lieu(TIN_BIA, _conv("nhà Lê Lai, 39m2 1 trệt 3 lầu", gia="7 tỷ 3"))] == ["hẻm"]
    # chữ trùng một phần không bị bắt: "MTA", "hẻm" nằm trong câu hỏi cuối bản tin
    assert _hem_mt_khong_co_du_lieu(TIN_BIA.replace("nhà hẻm", "căn hộ MTA"), _conv("Lê Lai")) == []
    assert _hem_mt_khong_co_du_lieu(TIN_BIA.replace("nhà hẻm ", "nhà ").replace("hấp dẫn chưa ạ?", "nhà mình hẻm hay mặt tiền vậy ạ?"),
                                    _conv("Lê Lai")) == []


def test_ban_tin_bia_hem_bi_goi_lai_mot_lan():
    spy = _SpyHangDoi([TIN_BIA.replace("nhà hẻm ", "nhà ")])
    eng = Engine(spy)
    conv = eng.conversation("hm-2")
    conv.prop.fields.update(duong="Lê Lai", gia="7 tỷ 3")
    conv.history.append(Turn("user", "Lê Lai e, 39m2 1 trệt 3 lầu, 7 tỷ 3", 0.0))
    ra = eng._soat_hinh_thuc(conv, "SYS", TIN_BIA)
    assert "hẻm" not in ra.lower().split("\n\n")[1]
    assert any("VIẾT LẠI LƯỢT NÀY" in s and "\"hẻm\"" in s and "CHƯA nói nhà ở hẻm" in s for s in spy.systems)
