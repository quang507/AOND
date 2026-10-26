"""SRS-5.1zzzzzzz166 — prompt caching theo ranh giới ổn định / đổi mỗi lượt.
Trước: cả chuỗi system là MỘT khối có điểm cache ở cuối, nên đuôi đổi mỗi lượt (ô hỏi tiếp, khối căn…) làm mọi lượt ghi lại cả chuỗi
(23/10: cache_write 1,73M token ≥ cache_read 1,41M). Nay chỗ dựng prompt đặt `RANH_GIOI_CACHE` sau đoạn chữ cố định; bản Claude cắt hai khối,
điểm cache ở cuối khối ổn định + cuối cả chuỗi; bản Gemini / Groq bỏ dấu đi. Đỏ khi bỏ dấu ở builder / lượt lập thao tác, khi `_sys` không
cắt, hoặc khi dấu lọt tới model ngoài Claude."""
from aioi import prompts as p
from aioi.engine import Property
from aioi.llm.base import RANH_GIOI_CACHE, bo_ranh_gioi, tach_on_dinh
from aioi.llm.claude import ClaudeProvider
from aioi.llm import du_phong
from aioi.prompts import BuyerLead


def test_tach_on_dinh_va_bo_dau():
    assert tach_on_dinh("a" + RANH_GIOI_CACHE + "b") == ("a", "b")
    assert tach_on_dinh("khong dau") == ("khong dau", "")
    assert bo_ranh_gioi("a" + RANH_GIOI_CACHE + "b") == "ab"


def test_sys_mot_khoi_khi_khong_co_dau_va_hai_khoi_khi_co():
    mot = ClaudeProvider._sys("chi mot khoi")
    assert len(mot) == 1 and mot[0]["cache_control"] == {"type": "ephemeral"}
    hai = ClaudeProvider._sys("on dinh" + RANH_GIOI_CACHE + "doi moi luot")
    assert [k["text"] for k in hai] == ["on dinh", "doi moi luot"]
    # SRS-5.1zzzzzzz213: chỉ khối ổn định có điểm cache; đuôi đổi mỗi lượt KHÔNG ghi cache (ghi đắt 1,25x, không ai đọc lại).
    assert hai[0]["cache_control"] == {"type": "ephemeral"} and "cache_control" not in hai[1]
    assert RANH_GIOI_CACHE not in "".join(k["text"] for k in hai)


def test_sys_khong_gui_khoi_rong():
    """API từ chối khối text rỗng — dấu ở cuối chuỗi / đầu chuỗi chỉ ra một khối."""
    assert [k["text"] for k in ClaudeProvider._sys("on dinh" + RANH_GIOI_CACHE)] == ["on dinh"]
    assert [k["text"] for k in ClaudeProvider._sys(RANH_GIOI_CACHE + "chi doi")] == ["chi doi"]


def test_prompt_ban_chung_phan_on_dinh_qua_cac_luot():
    a = p.build_chat_system("Lan", Property(), "gia")
    b = p.build_chat_system("Lan", Property(), "duong", project_block="=== DỰ ÁN X ===")
    (ta, da), (tb, db) = tach_on_dinh(a), tach_on_dinh(b)
    assert ta == tb and len(ta) > 5000        # phần chính sách dài đứng yên dù ô hỏi tiếp / khối dự án đổi
    assert "Thông tin cần hỏi tiếp theo" in da and "DỰ ÁN X" in db and RANH_GIOI_CACHE not in da + db
    assert "Thông tin cần hỏi tiếp theo" not in ta


def test_prompt_mua_va_lap_thao_tac_co_ranh_gioi():
    mua = p.build_buyer_chat_system("Lan", BuyerLead(), "ngan_sach")
    on_dinh, dong = tach_on_dinh(mua)
    assert on_dinh and "Thông tin cần khai thác tiếp theo" in dong
    # lượt lập thao tác: 16 nghìn chữ OPERATIONS_SYSTEM đứng trước dấu (engine nối đuôi đổi sau dấu)
    assert RANH_GIOI_CACHE not in p.OPERATIONS_SYSTEM
    import inspect
    from aioi import engine
    assert "OPERATIONS_SYSTEM + RANH_GIOI_CACHE" in inspect.getsource(engine.Engine._lap_ke_hoach)


def test_model_du_phong_khong_nhan_dau():
    gui = {}

    def goi(nguon, khoa, than, han):
        gui["body"] = than
        return {"choices": [{"message": {"content": "ok"}}]}

    dp = du_phong.DuPhongProvider(None, [du_phong.Nguon("Gemini", "http://x", ["k"], ["m"], True)], goi=goi)
    dp._hoi(dp._nguon[0], "m", "k", "A" + RANH_GIOI_CACHE + "B", [], 100)
    assert gui["body"]["messages"][0]["content"] == "AB"


def test_prompt_ban_nhap_va_sau_duyet_co_ranh_gioi():
    """SRS-5.1zzzzzzz213 (nhật ký 5 khách 26/10: lượt bản nháp / lượt sau duyệt cache_w ~14.000, cache_r = 0 vì không có dấu — cả chuỗi
    ghi lại mỗi lần): hai prompt này cũng cắt khối; khuôn tin rao + luật đứng trước dấu, dữ liệu căn + khối dự án sau dấu."""
    pr = Property()
    pr.fields["gia"] = "8 tỷ 123"
    a = p.build_listing_proposal_system("Lan", pr, project_block="=== DỰ ÁN X ===")
    on, dong = tach_on_dinh(a)
    assert p.AD_FORMAT in on and "DỰ ÁN X" in dong and "8 tỷ 123" in dong and "8 tỷ 123" not in on
    b = p.build_fee_followup_system("Lan", pr, web={"len_web": True})
    on_b, dong_b = tach_on_dinh(b)
    assert on_b and "NHIỆM VỤ" in dong_b
