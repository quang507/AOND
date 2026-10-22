"""SRS-5.1zzzzzzz141: lệnh `json` hiện 2 tầng, một tin duy nhất. Chủ dự án 22/10/2026: "sếp nhắn json nó ra nhiều quá, giờ làm nhiều tầng đi".
Lớp lỗi: danh sách ô phẳng ~20 khoá lẫn lộn, và khối ``` bị bộ tách tin dài cắt mỗi 100 ký tự. Test đỏ khi một ô của FIELD_LABELS chưa có tầng
(ô mới rơi vào `khac` mà không ai biết), khi tầng rỗng vẫn in, hoặc khi JSON bị cắt thành nhiều bong bóng."""
import json

from aioi import nhom_json
from aioi.delivery import chunk_reply
from aioi.prompts import FIELD_LABELS
from aioi.schema import O_NOI_BO
from tests.test_doc_y_khach import _eng

_O_DINH_DANH = {"loai_hinh", "du_an"}   # in thẳng ở tầng `tin`, không qua bảng nhóm


def test_moi_o_cua_field_labels_co_tang():
    chua = [k for k in FIELD_LABELS
            if k not in _O_DINH_DANH and k not in nhom_json.BO_QUA and k not in nhom_json.O_NGUOI_MUA and nhom_json.nhom_o(k) == "khac"]
    assert chua == [], f"ô chưa có tầng trong nhom_json.NHOM_O: {chua}"


def test_gom_nhom_hai_tang_bo_o_rong_va_o_rieng():
    tt = {"quan": "TP. HCM", "duong": "Cách Mạng Tháng Tám", "phuong": "P. Nhiêu Lộc", "kich_thuoc": "4x10", "gia": "6 tỷ",
          "phap_ly_hoan_cong": "sổ hồng", "hien_trang_su_dung": "đang ở", "dung_ten_so": "chính chủ", "hinh_anh": "x", "huong": "",
          "o_la_chua_biet": "abc"}
    n = nhom_json.gom_nhom(tt)
    assert list(n) == ["vi_tri", "quy_mo", "gia", "phap_ly", "su_dung", "khac"]            # đúng thứ tự tầng, tầng rỗng không in
    assert n["vi_tri"] == {"quan": "TP. HCM", "duong": "Cách Mạng Tháng Tám", "phuong": "P. Nhiêu Lộc"}
    assert n["quy_mo"] == {"kich_thuoc": "4x10"} and n["gia"] == {"gia": "6 tỷ"} and n["su_dung"] == {"hien_trang_su_dung": "đang ở"}
    assert n["khac"] == {"o_la_chua_biet": "abc"}                                           # ô lạ không rơi mất
    assert all(o not in O_NOI_BO and o != "hinh_anh" for tang in n.values() for o in tang)  # ô riêng của chủ không in ra


def test_lenh_json_ban_hai_tang_mot_tin():
    eng, _ = _eng({"operations": [{"op": "update", "fields": {"phuong": "P. Nhiêu Lộc", "gia": "6 tỷ"}, "bang_chung": {"phuong": "Nhiêu Lộc", "gia": "6 tỷ"}}],
                   "user_intent": "sell"})
    eng.handle("j1", "nhà ở Nhiêu Lộc giá 6 tỷ")
    r = eng.handle("j1", "json")
    assert r.reply.startswith("🧾") and "📋" not in r.reply
    d = json.loads(r.reply.split("```json\n", 1)[1].rsplit("\n```", 1)[0])
    assert d["vai_tro"] == "seller" and {"tin", "nhap"} <= set(d)
    assert "ma_can" in d["tin"] and set(d["nhap"]) >= {"do_day_du", "thieu", "hinh_anh", "du_soan_nhap"}
    assert "thong_tin" not in d and "thieu_truong" not in d                                 # hết danh sách phẳng cũ


def test_khoi_json_di_mot_tin_khong_bi_cat():
    dai = "🧾 Dữ liệu trích xuất hiện tại (JSON):\n```json\n" + json.dumps(
        {"tin": {"ma_can": "x" * 40}, "vi_tri": {"dia_chi": "348/31 Cách Mạng Tháng Tám, P. Nhiêu Lộc, TP. HCM", "duong": "Cách Mạng Tháng Tám"},
         "quy_mo": {"kich_thuoc": "4x10", "mat_tien": "4"}}, ensure_ascii=False, indent=2) + "\n```"
    assert len(dai) > 200 and chunk_reply(dai) == [dai.strip()]


def test_lenh_json_nguoi_mua_cung_hai_tang():
    d = nhom_json.json_nguoi_mua("L1", "new", "ban", "nha_pho", "5 tỷ", "Quận 5", {"muc_dich": "ở", "x": ""})
    assert d == {"tin": {"vai_tro": "buyer", "lead_id": "L1", "stage": "new"},
                 "nhu_cau": {"loai_giao_dich": "ban", "loai_bds": "nha_pho", "ngan_sach": "5 tỷ", "khu_vuc": "Quận 5"},
                 "them": {"muc_dich": "ở"}}
