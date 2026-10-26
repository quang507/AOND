"""26/10/2026 (SRS-5.1zzzzzzz203; bắn thử `ban-thu-ban` bản fc99e52, ca Cao Lỗ TRƯỢT "sổ hồng riêng": cột `legal_status` rỗng). Gốc: khách
nói "nhà mình có sổ riêng" rồi "đã hoàn công đủ" — AI ghi cả hai vào MỘT ô `phap_ly_hoan_cong`, câu sau ĐÈ câu trước, và cột mã pháp lý
chỉ đọc ô `phap_ly` nên mất cả hai. Nay ý cũ bị đè được cất ở `_phap_ly_cu`, và cột mã đọc mọi chữ pháp lý đã nói, mới nhất trước.
Đỏ khi bỏ `_nho_phap_ly_cu` hoặc khi `legal_status` chỉ đọc ô `phap_ly`."""
from aioi.schema import Property


def _nha(**f):
    return Property(loai_hinh="nha_pho", fields=dict(f))


def test_y_phap_ly_cu_bi_de_van_con_trong_danh_sach():
    p = _nha(phap_ly_hoan_cong="sổ riêng")
    p.update({"phap_ly_hoan_cong": "đã hoàn công đủ"})
    assert p.fields["phap_ly_hoan_cong"] == "đã hoàn công đủ"
    assert p.phap_ly_da_noi() == ["đã hoàn công đủ", "sổ riêng"]          # mới nhất trước


def test_nhieu_o_phap_ly_deu_vao_danh_sach_va_khong_trung():
    p = _nha(phap_ly="sổ hồng riêng", phap_ly_hoan_cong="hoàn công")
    p.update({"phap_ly": "sổ hồng riêng"})                                   # không đổi → không cất lại
    assert p.phap_ly_da_noi() == ["sổ hồng riêng", "hoàn công"]
    assert "_phap_ly_cu" not in p.fields


def test_chi_nho_toi_da_nam_y_cu():
    p = _nha(phap_ly="a0")
    for i in range(1, 9):
        p.update({"phap_ly": f"a{i}"})
    assert len(p.fields["_phap_ly_cu"].split(" | ")) == 5 and p.phap_ly_da_noi()[0] == "a8"


def test_cot_ma_phap_ly_doc_ca_y_cu():
    # Hai câu của ca Cao Lỗ: chỉ "sổ riêng" đọc ra mã; "đã hoàn công đủ" thì không → mã lấy từ ý cũ, không rỗng.
    from aioi.supabase_store import SupabaseConversationStore
    p = _nha(phap_ly_hoan_cong="sổ riêng")
    p.update({"phap_ly_hoan_cong": "đã hoàn công đủ"})
    doc = lambda chu: "so_hong_rieng" if "sổ riêng" in chu else None      # thay cho RPC boc_thong_so
    ma = next((m for m in (doc(c) for c in p.phap_ly_da_noi()) if m), None)
    assert ma == "so_hong_rieng"
    assert hasattr(SupabaseConversationStore, "_ma_phap_ly")
