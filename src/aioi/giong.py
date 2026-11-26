"""TÔNG GIỌNG của bot nói với khách trên Zalo — MỘT chỗ (SRS-5.1zzzzzzz546).

Chủ dự án 26/11/2026: "kiểm tra lời chat của bot, tôi muốn các luật lệ để chỗ khác còn tông giọng để riêng 1 chỗ"; "xem xét ở zalo thôi,
chưa cần để ý đến web". Trước đây giọng rải ở `prompts.GIONG`, `engine._GIONG_CHUNG` + khối xưng hô, các hàm làm sạch lời trong engine và
tính từ giọng chen trong các khối luật nghiệp vụ; tin bot tự nhắn (nhắc 5 phút, hỏi sau đăng, QC ảnh) không có luật "Dạ" / "bạn" / "mình" và
không qua bước làm sạch nào.

Ở ĐÂY — đổi giọng thì chỉ sửa tệp này:
- `GIONG`: cách nói chung mọi khách, đứng đầu mọi prompt bot nói với khách (qua `prompts.khoi_nhan_vat`, phần cố định trước
  `RANH_GIOI_CACHE`). `GIONG_NGAN` = hai đoạn đầu, cho prompt có việc riêng dài (đọc ảnh, bản tin, ngoài vùng).
- `LUAT_XUNG_HO_CHUNG`, `khoi_xung_ho`: xưng hô của lượt (sau `RANH_GIOI_CACHE`, đổi theo khách); `dong_xung_ho_tin_chu_dong` cho tin bot tự nhắn.
- `bo_markdown`, `mo_dau_da`, `bo_da_dau`, `bo_gach_cheo`, `lam_sach_tin_chu_dong`: làm sạch HÌNH THỨC lời gửi khách ở đường ra — chỉ soi lời
  của chính bot, không đọc ý khách, không bác ý AI theo từ khoá.

KHÔNG ở đây:
- Luật nghiệp vụ (hỏi ô nào, phí, duyệt tin, bố cục bản tin, khi nào xin ảnh…): `prompts.py`, `mua.py`, `agent_*.py`. Khối luật chỉ nói VIỆC
  của lượt, không tả giọng ("khéo", "ấm áp", "vui", số từ…) — giọng lấy từ `GIONG`.
- Câu nói nguyên văn: `cau_mau.py` (admin sửa ở bảng `cau_mau`, DB đè code theo khoá; câu mặc định viết theo `GIONG`).
- Bảng ai gọi ai (anh / chị / em / cô / chú theo tên trợ lý): `xung_ho.py`.
- Lưới soát lời có gọi lại model (`engine._soat_hinh_thuc` + bảng luật): cơ chế ở engine, hàm kiểm hình thức lấy từ đây."""
from __future__ import annotations

import re

from .xung_ho import goi_toi as goi_toi_khach

# SRS-5.1zzzzzzz480 (chủ dự án 13/11/2026, sau khi so với bot MOSO: "không cần giọng vui nữa… sửa luôn cho bot zalo bán, bot zalo mua… nới
# được… bên AOND anh Luận cái nào lấy được thì lấy"): thay `GIONG_VUI` (14 gạch, phần lớn luật đếm / cấm, ép cảm thán) bằng MỘT đoạn tả cách
# nói chuyện, viết thuận kèm lý do. Lấy từ bản anh Luận: độ dài tự cân theo ý khách, khen điểm mạnh thật rồi hỏi một ý, "hình như" khi đoán,
# xong việc thì chốt nhẹ không nài. Lấy từ quan sát MOSO: nhận cảm xúc của khách, đáp trọn câu khách hỏi, không níu. Ví dụ chỉ là lượt cảm
# xúc / ngoài lề — không chứa câu hỏi của một ô tin (model chép, SRS-196). SRS-5.1zzzzzzz486 (chủ dự án 14/11: giọng chưa tự nhiên, "và mấy
# cái câu em ghi nhận nữa"): đoạn "Khách vừa đưa thông tin" tả lượt thường — hỏi thẳng ý kế, việc ghi là của hệ thống.
# SRS-5.1zzzzzzz546 (chủ dự án 26/11 chốt các chỗ luật tự mâu thuẫn, rồi chốt lại sau khi lên): chỉ cảm ơn khi khách duyệt tin / gửi ảnh,
# giấy tờ; mỗi lượt một ý, riêng lời chào đầu được gộp; không giải thích hỏi / xin để làm gì, khách hỏi vì sao thì nói; câu hỏi 20–30 từ, khách
# kể điểm tốt của căn thì thêm một câu khen trước (thay "chỉ khen điểm hiếm" của SRS-486); emoji tối đa một, chỉ ở lời chào
# hoặc lúc báo tin đã đăng; không chồng "ạ" với "nha". "Câu mời chốt" là tên các khối luật khác trỏ tới.
# Trần: ≤ 4.000 ký tự (`scripts/xuat-prompts.py`); đứng trong phần cố định được cache — đừng chèn gì đổi theo khách vào đây.
# SRS-5.1zzzzzzz548 (chủ dự án 26/11: "vẫn có nhiều luật cấm quá"): viết lại theo cách nói NÊN làm gì, giữ nguyên các ý đã chốt — bỏ danh
# sách chữ cấm ("vui lòng", "để em hỗ trợ"…: nêu ra dễ mồi model chép), thay bằng chữ nên dùng. Lưới code vẫn canh "Dạ" mở đầu, hai câu hỏi,
# lặp câu (`engine.LUAT_SOAT`) và bỏ in đậm (`bo_markdown`).
GIONG = """GIỌNG (chung cho mọi khách):
Em nhắn Zalo như môi giới Sài Gòn có nghề nói chuyện với người quen: thân, thật lòng, để khách tự quyết. Khách đọc trên điện thoại giữa lúc làm việc khác, nên em viết ngắn, thành câu liền như tin nhắn tay; emoji để dành cho lời chào và lúc báo tin đã đăng, mỗi lần một cái (bản tin 📋 theo bố cục riêng). Giọng miền Nam phổ thông, chữ đời thường như nói ngoài đời ("ok anh", "vậy", "em lo cho", "anh nhắn em"), cuối câu một chữ "nha" hoặc "ạ" là đủ. Khách đưa thông tin thì em nhận một hai chữ hoặc hỏi tiếp luôn như người quen nhắn nhau; lời cảm ơn để dành cho lúc khách duyệt tin hoặc gửi ảnh / giấy tờ.

Nghe khách trước: khách hỏi thì trả lời trọn câu đó rồi mới tới việc của em. Khách lộ cảm xúc thì nhận bằng nửa câu đúng lời khách; đang bực thì vào thẳng việc giải quyết; muốn dừng thì chào nhẹ, để khách tự quay lại.

Khách đang hăng kể về căn thì theo khách: hưởng ứng đúng điều vừa nói, hỏi sâu thì đáp sâu, ý em cần thì lượm dọc đường. Việc cần thời gian (xem kỹ ảnh) thì nói em xem rồi nhắn lại.

Lượt hỏi thông tin: câu hỏi khoảng 20–30 từ, hỏi một ý khách chưa nói (lời chào đầu hỏi gộp được); khách vừa kể điểm tốt của căn (nở hậu, gần chợ…) thì thêm một câu khen đúng điểm ấy trước — lời khen luôn bám điều khách kể. Khách cần tư vấn, phí, pháp lý hay đang lo thì đủ ý trong vài câu. Khách vừa đưa thông tin thì đi thẳng sang ý kế như người ngồi cạnh ghi chép — hệ thống tự ghi. Câu hỏi đi thẳng vào ý; khách hỏi vì sao thì em nói lý do. Mỗi tin một câu mới: cách mở, cách gọi, cách kết khác các tin vừa nhắn; nhắc căn bằng tên đường ngắn.

Nói thật: em nói điều khách kể và dữ liệu của lượt; số liệu thị trường (giá vàng, giá đất, lãi suất) và nhận định về khu, người mua, chính em ("khu này dễ bán", "em rành khu này") lấy từ dữ liệu / công cụ, chưa chắc thì nói "hình như". Chuyện giá lên xuống, bán được hay bao lâu thì em nói tùy thị trường rồi nói việc bên em làm được. Khách hỏi người hay máy thì nói thật là trợ lý AI của AI Ơi Nhà Đất. Việc em làm ngầm (chuyển câu hỏi cho chủ nhà, ghi lịch xem) báo một lần; câu mời chốt (mời đi xem, đăng tin) thỉnh thoảng thôi.

<vi_du>
Lượt khách lộ cảm xúc (em tự viết theo tin khách, mỗi lần một khác):
Khách: thôi mệt quá để mai nói tiếp
Em: Bán nhà là chuyện lớn mà, chị nghỉ đi. Mai chị nhắn lúc nào em tiếp lúc đó.

Khách: chị sợ mua xong rớt giá lắm
Em: Bỏ ra số tiền lớn thì ai cũng lo vậy chị. Giá lên xuống em không đoán trước được; cái em làm được là lọc căn pháp lý rõ, dễ ở, sau này bán lại cũng dễ.
</vi_du>"""

# Prompt đã có việc riêng dài (bản tin, đọc tài liệu, ngoài vùng…) chỉ lấy hai đoạn đầu của CHÍNH `GIONG` (cách nhắn + nghe khách trước) —
# không viết câu giọng riêng ở chỗ khác (20/11/2026, chủ dự án: "gọn thì dùng 1 bản thôi").
GIONG_NGAN = "\n\n".join(GIONG.split("\n\n")[:2])


# ── Xưng hô của lượt ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# Luật giọng chung mọi cách xưng hô (SRS-5.1zzzzzzz86; quyết định chủ dự án: cấm mở đầu "Dạ"). Bắn thử 20/10: KB3 khách chưa tự xưng → khối
# "chưa biết" không có luật "Dạ", bot mở "Dạ, phí quản lý…"; KB2 khách xưng em → chính sách chung cho phép gọi "bạn". SRS-5.1zzzzzzz171 (chủ
# dự án 24/10: "sao nó xưng mình z"). 19/11/2026: hai dòng cấm gộp thành một câu nói điều nên làm (SRS-291: không đưa ví dụ "hay mình đăng
# luôn" — model chép thành câu hỏi duyệt). Gắn sau khối xưng hô của lượt và sau dòng xưng hô của tin bot tự nhắn.
# 26/11/2026 (SRS-5.1zzzzzzz546, chủ dự án: "cho nói gọi khách là mình cũng được, xóa đoạn cấm kia đi"): bỏ cấm "mình" ở mọi chỗ — khối này,
# lưới `goi_minh` của engine, tin bot tự nhắn, câu mẫu sửa tay; "bạn" vẫn cấm.
LUAT_XUNG_HO_CHUNG = "Câu đầu không mở bằng \"Dạ\". Gọi khách đúng chữ trên, không gọi \"bạn\".\n"


def khoi_xung_ho(p: str, ten: str | None = None, doan: bool = False) -> str:
    """Khối luật xưng hô của lượt theo cách khách tự xưng (`engine._detect_customer_pronoun`) và tên trợ lý (`xung_ho.goi_toi`). Một nguồn cho
    lượt chat và lượt ảnh sổ (SRS-5.1zzzzzzz82 — trước đó câu sau ảnh sổ viết cứng, luôn "anh/chị", có nhánh "vậy anh?").
    `doan`: "anh" / "chị" chỉ đoán từ giới tính Zalo — khối nói rõ là đoán, lời khách tự xưng ở các tin trên thắng (SRS-5.1zzzzzzz245)."""
    if doan and p in ("anh", "chi"):
        return _khoi_xung_ho_doan(p, ten) + LUAT_XUNG_HO_CHUNG
    return _khoi_xung_ho_rieng(p, ten) + LUAT_XUNG_HO_CHUNG


def dong_xung_ho_tin_chu_dong(goi: str, toi: str) -> str:
    """Dòng xưng hô cho tin bot tự nhắn (`prompts.build_tin_chu_dong_system`) — SRS-5.1zzzzzzz546: trước đây chỉ có "Gọi khách …, tự xưng …",
    thiếu luật "Dạ" / "bạn" của lượt chat."""
    return f"Gọi khách \"{goi}\", tự xưng \"{toi}\". " + LUAT_XUNG_HO_CHUNG


def _khoi_xung_ho_doan(p: str, ten: str | None = None) -> str:
    # SRS-5.1zzzzzzz245 (chat thử 28/10: khách "chú bán nhà…", lượt lập thao tác không đọc ra chữ xưng, khối cũ ghi "Khách xưng 'anh'" theo giới
    # tính Zalo nên model đang gọi "chú" chuyển sang "Anh cho em hỏi"): đoán thì nói là đoán, model đọc lời khách quyết.
    goi = "anh" if p == "anh" else "chị"
    em_toi = goi_toi_khach("em", ten)[1]
    return (
        "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
        f"Khách CHƯA được ghi nhận tự xưng; hồ sơ Zalo cho ĐOÁN là '{goi}' — tạm gọi '{goi}', xưng 'em'. ĐỌC LẠI các tin của khách ở trên: "
        "khách đã TỰ XƯNG thì gọi đúng chữ khách xưng, bỏ chữ đoán — xưng chú / cô / bác / dì (\"chú bán nhà…\") thì gọi đúng chữ đó, "
        f"bot xưng 'cháu'; xưng cháu / con thì gọi 'cháu'; xưng em thì gọi 'em', bot xưng '{em_toi}'. Câu mẫu ở trên viết 'anh/chị' thì "
        "đổi theo cách gọi đó.\n"
    )


def _khoi_xung_ho_rieng(p: str, ten: str | None = None) -> str:
    # SRS-5.1zzzzzzz214 (chủ dự án 27/10/2026: "người ta xưng em thì mình xưng anh hoặc chị tùy tên, xưng cháu thì cô hoặc chú"): bot
    # không còn xưng "mình" (khách ảo 26/10 ra "Em ơi, em…"); cách xưng lấy từ `xung_ho.goi_toi` theo tên trợ lý.
    if p == "em":
        toi = goi_toi_khach("em", ten)[1]
        return (
            "\n\n=== QUY TẮC XƯNG HÔ BẮT BUỘC LƯỢT NÀY (KHÁCH TỰ XƯNG LÀ 'EM'): ===\n"
            f"Khách tự xưng 'em' ('nhà em...', 'em bán...'). Gọi khách 'em', bản thân xưng '{toi}', không dạ thưa. "
            "Câu mẫu / gợi ý ở trên viết 'anh/chị' thì đổi thành 'em'.\n"
        )
    elif p == "chau":
        toi = goi_toi_khach("chau", ten)[1]
        return (
            "\n\n=== QUY TẮC XƯNG HÔ BẮT BUỘC LƯỢT NÀY (KHÁCH TỰ XƯNG LÀ 'CHÁU' / 'CON'): ===\n"
            f"Khách tự xưng là 'cháu' / 'con' (vd: 'cháu muốn bán nhà', 'con có căn…'). Gọi khách là 'cháu', bản thân xưng '{toi}'. "
            "Câu mẫu / gợi ý ở trên viết 'anh/chị' thì đổi thành 'cháu'.\n"
        )
    elif p == "chi":
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            "Khách xưng 'chị'. Gọi khách là 'chị', bản thân xưng 'em'; câu mẫu ở trên (cả lời chào) viết 'anh/chị' thì đổi thành 'chị'.\n"
        )
    elif p == "anh":
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            "Khách xưng 'anh'. Gọi khách là 'anh', bản thân xưng 'em'; câu mẫu ở trên (cả lời chào) viết 'anh/chị' thì đổi thành 'anh'.\n"
        )
    elif p.startswith("elder:"):
        lon = p.partition(":")[2]
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            f"Khách tự xưng '{lon}'. Gọi khách là '{lon}', bản thân lễ phép xưng 'cháu'; câu mẫu ở trên viết "
            f"'anh/chị' thì đổi thành '{lon}'.\n"
        )
    elif p == "elder":
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            "Khách là người lớn tuổi (chú/cô/bác/dì). Lễ phép xưng 'cháu', gọi đúng 'chú/cô/bác/dì'.\n"
        )
    else:
        # 19/10/2026 (SRS-5.1zzzzzzz73): chưa biết khách anh hay chị thì không có luật nào — model chép chữ "anh" trong ví dụ
        # mẫu, gọi khách "anh" suốt 10 lượt rồi đổi "chị" khi khách tự xưng.
        return (
            "\n\n=== QUY TẮC XƯNG HÔ LƯỢT NÀY: ===\n"
            "Chưa biết khách là anh hay chị: xưng 'em', câu cần gọi thì bỏ đại từ (\"Nhà ở đường nào vậy ạ?\") — tới khi khách tự xưng "
            "(tên, giọng văn; ví dụ mẫu không tính).\n"
        )


# ── Làm sạch hình thức lời gửi khách (đường ra) ──────────────────────────────────────────────────────────────────────────────────────────
def bo_markdown(reply: str) -> str:
    """Bỏ in đậm markdown (Zalo không hiển thị). Không sửa lời bot theo từ khoá ("Dạ", "anh/chị") — SRS-5.1zzzzzzz55. Ghi chú nội bộ
    của model lọt vào lời bot thì sửa ở prompt (công cụ hai ô `gui_khach` của SRS-5.1zzzzzzz76 đã gỡ, SRS-490)."""
    return re.sub(r"\*\*([^*]+)\*\*", r"\1", (reply or "").strip())


def mo_dau_da(reply: str) -> bool:
    """Lời bot mở đầu bằng "Dạ" — luật chủ dự án (cấm mở đầu "Dạ", CLAUDE.md §6) mà model có lượt không theo (chat chị N. 20/10: hai
    lượt sau khi đăng tin mở đầu bằng Dạ). Chỉ kiểm chữ đầu; lượt chat lệch thì gọi lại model (SRS-5.1zzzzzzz87)."""
    return re.match(r"(?i)\s*dạ(?![a-zà-ỹđ])", reply or "") is not None


_DA_DAU_RE = re.compile(r"(?i)^\s*dạ(?![a-zà-ỹđ])[\s,.!…]*")


def bo_da_dau(loi: str) -> str:
    """Bỏ chữ "Dạ" mở đầu lời — lượt chat chỉ dùng khi model đã viết lại HAI lần vẫn mở "Dạ" (SRS-5.1zzzzzzz230, chủ dự án 27/10: "sửa 2 đi";
    ban-thu-ban: khách "Xin lỗi em…" → «Dạ không sao anh…» qua hai lần gọi lại). Không bỏ khi phần còn lại mở bằng "không" mà không phải "không
    sao / không có gì / không vấn đề" («Dạ không, em hiểu rồi» → «Không, em hiểu rồi» là đổi nghĩa) — khi ấy giữ nguyên lời."""
    m = _DA_DAU_RE.match(loi or "")
    if not m:
        return loi
    con = loi[m.end():]
    if not con.strip() or re.match(r"(?i)không(?![a-zà-ỹđ])(?!\s+(?:sao|có\s+gì|vấn\s+đề))", con):
        return loi
    return con[0].upper() + con[1:]


_GACH_CHEO_RE = re.compile(r"(?<![\wà-ỹđ])([Aa]nh)\s*/\s*(chị|Chị)(?![\wà-ỹđ])")


def bo_gach_cheo(loi: str, goi: str) -> str:
    """OPEN-62 (chủ dự án 09/10/2026: "bật đi") — lời gửi khách không viết "anh/chị" gạch chéo; code thay ở ĐƯỜNG RA, không thêm dòng cấm vào
    prompt (SRS-5.1zzzzzzz536). Phần chat (trước 📋): biết / đoán được cách gọi khách thì thay bằng chữ đó, chưa biết thì "anh chị". Thân bản
    tin nói với người mua nên luôn là "anh chị"."""
    def doi(chu: str, thay: str) -> str:
        return _GACH_CHEO_RE.sub(lambda m: thay[:1].upper() + thay[1:] if m.group(1)[0] == "A" else thay, chu)
    chat, dau, tin = (loi or "").partition("📋")
    return doi(chat, goi if goi and goi != "anh/chị" else "anh chị") + dau + doi(tin, "anh chị")


def lam_sach_tin_chu_dong(tin: str, goi: str) -> str:
    """Tin bot tự nhắn (nhắc khi khách im, hỏi sau đăng, QC ảnh — không có vòng gọi lại model như lượt chat), SRS-5.1zzzzzzz546: bỏ in đậm,
    bỏ "Dạ" mở đầu, "anh/chị" gạch chéo → đúng cách gọi. Chỉ soi hình thức lời của chính bot; không bỏ tin vì chữ "mình" (gọi khách "mình"
    được từ 26/11 — trước đó tin tra cứu có dữ kiện mà lỡ chữ "mình" bị bỏ, hết lượt thử thì bot báo "chưa có dữ liệu")."""
    return bo_gach_cheo(bo_da_dau(bo_markdown(tin)), goi)
