#!/usr/bin/env python3
"""khach-ao.py — 5 KHÁCH ẢO CÓ CẢM XÚC do model đóng vai, chat với lõi production, rồi giám khảo chấm (SRS-5.1zzzzzzz213, chủ dự án
26/10/2026: "cho bot test có cảm xúc thì nó sẽ đánh giá cách nói chuyện cách rao của bot mình ntn"). Khác `ban-thu-5-khach.sh` (lời khách
viết sẵn): ở đây khách ĐỔI lời theo câu bot, có tâm trạng, bỏ đi khi chán; cuối cuộc chat khách tự chấm sao, và một giám khảo riêng đọc
toàn bộ hội thoại chấm theo rubric (3 lỗi bài UX Qualitative Interview + tin rao + trung thực + đáp cảm xúc), mỗi lỗi phải TRÍCH nguyên văn
và đoán lỗi "do đâu" (giọng anh Luận / câu mẫu / code / khác). Kết luận là gợi ý để người đọc, không phải phép đạt / trượt.

Chạy từ `bot/tests/ban-thu-khach-ao.sh` (GitHub Actions, ô `ban-thu-khach-ao`): CORE_URL = đường hầm ssh tới lõi, ANTHROPIC_API_KEY từ Vault.
Khách đóng vai bằng Haiku (rẻ); giám khảo Sonnet, lỗi thì rơi về Haiku. Tiền thật: ~5 × 10 lượt × (lõi ~2,5 lượt + khách 1 lượt) + 5 lượt chấm.
ID thử `thu-ka-<n>-<run>` — shell dọn. Không in tên / số thật: mọi persona là hư cấu."""
from __future__ import annotations

import json
import os
import re
import sys
import time
import threading
import urllib.request

import anthropic

CORE = os.environ.get("CORE_URL", "http://127.0.0.1:18000")
RUN = os.environ.get("RUN_ID", str(int(time.time())))
MODEL_KHACH = os.environ.get("KHACH_AO_MODEL", "claude-haiku-5-5")
MODEL_CHAM = os.environ.get("KHACH_AO_JUDGE_MODEL", "claude-sonnet-5-5")
MAX_LUOT = int(os.environ.get("KHACH_AO_MAX_LUOT", "10"))
client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], timeout=90.0, max_retries=2)

# (số, số Zalo nhắn: "" ký gửi / "tu_van", tên hiện Zalo, mô tả vai + cảm xúc + dữ kiện ẩn)
PERSONA = [
    (1, "", "Cô Sáu", """Bạn là cô Sáu, 62 tuổi, ở Quận 8 TP.HCM, lần đầu dùng Zalo để rao bán nhà. Tâm trạng: buồn và hơi bối rối — bán căn nhà
đã ở 30 năm vì con gái đi định cư, cô ở một mình. Cách gõ: có dấu nhưng chậm, câu dài, hay kể chuyện ngoài lề (con cái, hàng xóm), xưng "cô",
gọi bot là "con". Không rành thuật ngữ (không biết "hoàn công", "lộ giới" là gì — phải hỏi lại). Dễ tủi thân nếu bot hỏi dồn hoặc máy móc;
nếu bot ấm áp thì cô kể thêm. Dữ kiện ẩn (chỉ nói khi được hỏi đúng ý, mỗi lần một ít): nhà hẻm 4m đường Phạm Thế Hiển, Quận 8, phường
cũ là phường 4; ngang 4m dài 15m; một trệt một lầu, 3 phòng ngủ; sổ hồng riêng đứng tên cô; muốn bán 5 tỷ 8, có thương lượng chút;
nhà đang ở, bán xong mới dọn; không có ảnh sẵn, phải nhờ cháu chụp."""),
    (2, "", "Khoa BĐS", """Bạn là anh Khoa, 35 tuổi, môi giới nhà đất 8 năm, đang gửi tin cho 3 nền tảng cùng lúc. Tâm trạng: sốt ruột, hơi khinh
khỉnh với "bot", thử thách ("bên em có gì hơn batdongsan?"), cáu nếu bị hỏi lại điều đã nói hoặc bị hỏi Có/Không vô nghĩa. Cách gõ: viết tắt
dày đặc (MT, HXH, SHR, HC, TL, PN, WC, tr, tỷ), không dấu một phần, mỗi tin ngắn, đôi khi nhắn hai tin liền. Xưng "a", gọi bot "e". Dữ kiện
ẩn: căn hộ chung cư Era Town Đức Khải, Quận 7, block A3 tầng 12, 2PN 2WC, 85m2, sổ hồng riêng, nội thất cơ bản, đang trống, giá 2 tỷ 350
TL; anh là môi giới, phí đã biết là 0.5%; có 5 ảnh nhưng "lát gửi". Anh muốn tin lên nhanh, hỏi link tin, hỏi "khi nào có khách"."""),
    (3, "tu_van", "Hạnh", """Bạn là chị Hạnh, 29 tuổi, nhân viên văn phòng, mua nhà lần đầu cùng chồng. Tâm trạng: LO LẮNG — sợ bị lừa, sợ
mua hớ, sợ thủ tục; cần được trấn an, nhưng cũng dễ tin nếu bot trả lời thật thà. Cách gõ: có dấu, lịch sự, xưng "chị" hoặc "mình", hay
hỏi "có chắc không", "nếu … thì sao". Dữ kiện ẩn (nói dần): ngân sách tối đa 4 tỷ (đã vay được 1 tỷ), muốn nhà phố hoặc căn hộ ở Gò Vấp
hoặc Phú Nhuận gần chỗ làm ở Phan Đăng Lưu, cần 2 phòng ngủ, có bé 3 tuổi nên muốn gần trường mầm non, sợ nhà hẻm tối. Chị sẽ hỏi: mua
qua bên em có mất phí không, có bị lừa không, giấy tờ cần gì, có xem nhà được cuối tuần không. Nếu bot gợi căn, chị hỏi kỹ căn đó."""),
    (4, "tu_van", "Dũng", """Bạn là anh Dũng, 45 tuổi, nhà đầu tư bất động sản, đã mua 6 căn. Tâm trạng: lạnh, dứt khoát, bận; đánh giá
người đối diện qua việc họ có nói số liệu chính xác hay vòng vo. Bỏ đi (nhắn "thôi, cảm ơn") nếu bot hỏi quá 2 câu nhu cầu liên tiếp, hứa
suông, hoặc bịa số. Cách gõ: ngắn, không dấu hoặc có dấu lẫn lộn, xưng "anh"/"tôi", không chào hỏi. Dữ kiện ẩn: tìm nhà phố mặt tiền
hoặc hẻm xe hơi Quận 10 / Quận 3 / Phú Nhuận, ngân sách 15–18 tỷ, mục đích cho thuê, thích căn đang có hợp đồng thuê, hỏi giá/m², hỏi
pháp lý, muốn xem 2–3 căn một buổi sáng thứ 7."""),
    (5, "tu_van", "Thư 🌸", """Bạn là Thư, 22 tuổi, mới đi làm ở Quận 7, tìm thuê căn hộ. Tâm trạng: vui vẻ, hơi lan man, hay đổi ý, dễ bị cuốn
theo câu chuyện; hơi ngại nếu bot quá nghiêm túc hoặc dài dòng. Cách gõ: teen code (hok, dc, ko, á, nè, hihi, kkk), nhiều icon, xưng "e"
gọi "a/c" tuỳ bot xưng gì. Dữ kiện ẩn: thuê căn hộ 1PN hoặc studio Quận 7 hoặc Quận 4, 7–9 triệu/tháng, có nuôi mèo, muốn có ban công,
dọn vào đầu tháng sau, ở ghép với bạn thân nên có thể đổi sang 2PN tầm 11 triệu; hay hỏi "có ảnh hok", "có gần chợ hok"."""),
]

LUAT_KHACH = """
CÁCH CHƠI VAI:
- Bạn là KHÁCH đang nhắn Zalo cho một trợ lý nhà đất (tin của trợ lý ở vai assistant trong hội thoại; lời bạn ở vai user). Viết đúng tính cách,
  tâm trạng, cách gõ ở trên. Mỗi lượt 1–2 tin ngắn như người thật nhắn Zalo (ngăn hai tin bằng một dòng trống), không viết đoạn dài, không giải thích.
- Chỉ tiết lộ dữ kiện ẩn khi trợ lý hỏi đúng ý hoặc khi tự nhiên muốn kể; đừng dồn hết một lượt. Được phép nói sai / nói thiếu / hỏi lại như người thật.
- PHẢN ỨNG THẬT với cách trợ lý nói: bị hỏi lặp thì bực, được đồng cảm thì mở lòng, bị hứa suông thì nghi ngờ, bị hỏi Có/Không cụt thì trả lời cụt.
- Khi đã xong việc, hoặc chán, hoặc đã đủ 1 bản tin / 1 căn gợi ý và lịch xem, kết thúc bằng một tin cuối tự nhiên rồi dòng cuối cùng ghi đúng
  "[XONG]". Không bao giờ nói bạn là AI, không nói về "kịch bản".
"""

LUAT_CAM_NHAN = """Bạn vừa chat xong với trợ lý nhà đất (hội thoại ở trên). Vẫn trong vai khách, trả lời JSON thuần (không markdown):
{"sao": <1-5>, "cam_nhan": "<2–3 câu nói như khách thật: thích gì, khó chịu gì>", "diem_khong_hieu": "<câu nào của trợ lý bạn thấy khó hiểu / máy móc, trích nguyên văn, hoặc rỗng>"}"""

RUBRIC = """Bạn là giám khảo UX cho trợ lý nhà đất nhắn Zalo. Đọc hội thoại (KHÁCH / BOT) và chấm BOT. Khách là người ảo có tâm trạng; mô tả vai khách:
{vai}

Chấm 1–5 từng mục (5 = như môi giới giỏi, 1 = khách bỏ đi):
- tu_nhien: lời như người thật nhắn Zalo, ngắn, không văn mẫu, không lặp mở đầu ("Em ghi nhận…", "Dạ…").
- dap_cam_xuc: có đọc tâm trạng khách (lo, buồn, cáu, vui) và đáp vào đó trước khi hỏi tiếp.
- cau_hoi_mo: theo bài phỏng vấn định tính — tránh (1) câu Có/Không khi hỏi NHU CẦU/Ý KIẾN, (2) câu dẫn dắt (gài tính từ cảm xúc, "đúng không"),
  (3) đặt vấn đề quá sớm (kể sản phẩm trước khi hiểu khách). Câu hỏi DỮ KIỆN căn (sổ, giá) được phép đóng; câu mời xem nhà được phép.
- khong_lap: không hỏi lại điều khách đã nói, không hỏi cùng một ý nhiều lần, không hỏi hai câu một lượt.
- trung_thuc: không hứa việc hệ thống không chắc làm (gửi ảnh, hỏi chủ nhà, lên Top, điểm thưởng), không bịa số liệu / tiện ích / giá thị trường,
  không nói "đã đăng" khi chưa.
- tin_rao: (chỉ khi có bản tin 📋) đúng dữ liệu khách nói, hấp dẫn, không bịa, không khoe suông, câu kết hợp lý; không có bản tin thì ghi null.

Rồi liệt kê LỖI — mỗi lỗi PHẢI trích nguyên văn một đoạn lời BOT, ghi loại (lap / co_khong / dan_dat / som / hua_suong / bia / mau_moc / xung_ho / khac),
mức (nang / vua / nhe) và đoán nguồn: "giong_luan" (luật giọng / bối cảnh kinh doanh lấy từ bản anh Luận: khen trước hỏi sau, khích lệ đăng
≥10 căn, điểm uy tín / hạng Đồng-Bạc-Vàng, giọng rao chợ), "cau_mau" (câu cố định: chào, hỏi phí, duyệt tin, mở bản nháp), "code" (hệ thống
chọn ô hỏi / lặp / không ghi), "khac". Trả JSON thuần (không markdown):
{"diem": {"tu_nhien":n,"dap_cam_xuc":n,"cau_hoi_mo":n,"khong_lap":n,"trung_thuc":n,"tin_rao":n|null},
 "loi": [{"trich":"…","loai":"…","muc":"…","nguon":"…","vi_sao":"…"}],
 "tot": ["<1–3 câu BOT làm tốt, trích ngắn>"], "tom_tat": "<2 câu>"}"""


def _goi(model: str, system: str, messages: list[dict], max_tokens: int = 2000) -> str:
    """Lượt đầu (run 40375813417): lời khách ảo bị CẮT giữa chữ ("tìm nhà phố q10 hoặc", "sao hỏi l"), có lượt rỗng, JSON chấm cụt — max_tokens 300
    quá thấp cho model đời 5 (phần suy nghĩ ẩn cũng tính vào trần). Nay trần rộng và chạm trần thì gọi lại một lần với trần gấp 4."""
    chu = ""
    for mt in (max_tokens, max_tokens * 4):
        r = client.messages.create(model=model, max_tokens=mt, system=system, messages=messages)
        chu = "".join(b.text for b in r.content if b.type == "text").strip()
        if getattr(r, "stop_reason", None) != "max_tokens":
            return chu
        print(f"   (model {model} chạm trần {mt} token — gọi lại)", file=sys.stderr)
    return chu


def _cham(system: str, messages: list[dict]) -> tuple[str, str]:
    """Giám khảo: thử model chấm, lỗi (không có quyền model / quá tải) thì rơi về model khách."""
    for m in (MODEL_CHAM, MODEL_KHACH):
        try:
            return _goi(m, system, messages, max_tokens=6000), m
        except Exception as e:  # noqa: BLE001
            print(f"   (giám khảo {m} lỗi: {type(e).__name__} — thử model kế)", file=sys.stderr)
    return "", ""


def _json(chu: str) -> dict:
    chu = chu.strip()
    chu = re.sub(r"^```(?:json)?\s*|\s*```$", "", chu)
    m = re.search(r"\{.*\}", chu, re.S)
    try:
        return json.loads(m.group(0) if m else chu)
    except Exception:  # noqa: BLE001
        return {"loi_doc": chu[:400]}


def _bot(uid: str, so_nhan: str, ten: str, text: str) -> tuple[list[str], float]:
    body = {"external_user_id": uid, "text": text, "sender_name": ten}
    if so_nhan:
        body["so_nhan"] = so_nhan
    req = urllib.request.Request(f"{CORE}/chat-reply", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    t = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode())
    return [x for x in (d.get("replies") or []) if isinstance(x, str)], time.time() - t


def _nhan_cau_hoi(loi: str) -> list[str]:
    ra = []
    for c in re.findall(r"[^.!?\n]*\?", loi):
        c = c.strip()
        if not c:
            continue
        t, nhan = c.lower(), []
        if re.search(r"(không|chưa|hông|hok|ko|đúng không|phải không|được không)\s*(ạ|nhỉ|nha|nhé|vậy ạ|vậy|ha)?\s*\?$", t):
            nhan.append("CÓ/KHÔNG")
        if re.search(r"hấp dẫn|tuyệt|đẹp|ưng|thích|phiền|đúng không|phải không|chắc là|chắc hẳn|có phải", t):
            nhan.append("DẪN DẮT")
        if re.search(r"\b(hay|hoặc)\b", t) and "CÓ/KHÔNG" not in nhan:
            nhan.append("CHỌN")
        ra.append(f"      ? [{' '.join(nhan) or 'MỞ'}] {c}")
    return ra


def chay_mot(n: int, so_nhan: str, ten: str, vai: str) -> dict:
    uid = f"thu-ka-{n}-{RUN}"
    hoi: list[dict] = []          # góc nhìn KHÁCH: user = lời bot, assistant = lời khách
    ban_ghi: list[str] = [f"=== KHÁCH ẢO {n} — {ten} (số {'tư vấn' if so_nhan else 'ký gửi'})"]
    chu_bot_moi = "(Bạn mở đầu cuộc chat — nhắn tin đầu tiên cho trợ lý.)"
    xong = False
    for luot in range(1, MAX_LUOT + 1):
        hoi.append({"role": "user", "content": chu_bot_moi})
        try:
            khach = _goi(MODEL_KHACH, vai + LUAT_KHACH, hoi, max_tokens=1500)
        except Exception as e:  # noqa: BLE001
            ban_ghi.append(f"  (khách ảo lỗi lượt {luot}: {type(e).__name__})")
            break
        hoi.append({"role": "assistant", "content": khach})
        if "[XONG]" in khach:
            khach, xong = khach.replace("[XONG]", "").strip(), True
        if not khach:
            break
        bong = [b.strip() for b in re.split(r"\n\s*\n", khach) if b.strip()] or [khach]
        for b in bong:
            ban_ghi.append(f"\n  KHÁCH: {b}")
        # Khách nhắn nhiều tin liền thì trên Zalo thật bridge GOM trong 2,5 s thành một tin (index.mjs "BỘ ĐỆM GOM TIN") — gửi lõi MỘT lượt.
        # Lượt đầu gửi từng tin: bot trả lời tin 1 (hỏi khu vực) trong khi tin 2 đã có khu vực → khách thấy "hỏi lại" oan (chị H. bực 2 lần).
        try:
            tra, giay = _bot(uid, so_nhan, ten, "\n".join(bong))
        except Exception as e:  # noqa: BLE001
            ban_ghi.append(f"  BOT:   (lỗi gọi lõi: {type(e).__name__})")
            tra, giay = [], 0.0
        loi_bot = "\n\n".join(tra)
        if tra:
            for x in tra:
                ban_ghi.append("  BOT:   " + x.replace("\n", "\n         "))
        else:
            ban_ghi.append("  BOT:   (im lặng)")
        ban_ghi += _nhan_cau_hoi(loi_bot)
        ban_ghi.append(f"      [{giay:.0f} s · {len(loi_bot.split())} từ · {loi_bot.count('?')} câu hỏi]")
        if xong:
            break
        chu_bot_moi = loi_bot or "(trợ lý không trả lời)"
    # Khách tự chấm
    hoi.append({"role": "user", "content": LUAT_CAM_NHAN})
    try:
        cam_nhan = _json(_goi(MODEL_KHACH, vai, hoi, max_tokens=1500))
    except Exception as e:  # noqa: BLE001
        cam_nhan = {"loi": type(e).__name__}
    # Giám khảo riêng
    doan = "\n".join(l for l in ban_ghi[1:] if l.startswith(("  KHÁCH:", "  BOT:", "         ")))
    cham_chu, model_cham = _cham(RUBRIC.replace("{vai}", vai.strip()), [{"role": "user", "content": "HỘI THOẠI:\n" + doan}])
    cham = _json(cham_chu) if cham_chu else {"loi": "giám khảo không chạy"}
    return {"n": n, "ten": ten, "uid": uid, "ban_ghi": ban_ghi, "cam_nhan": cam_nhan, "cham": cham, "model_cham": model_cham,
            "so_luot": sum(1 for l in ban_ghi if l.startswith("\n  KHÁCH:")), "xong": xong}


def main() -> None:
    ket: dict[int, dict] = {}

    def _t(p):
        n, so_nhan, ten, vai = p
        try:
            ket[n] = chay_mot(n, so_nhan, ten, vai)
        except Exception as e:  # noqa: BLE001
            ket[n] = {"n": n, "ten": ten, "ban_ghi": [f"=== KHÁCH ẢO {n} — {ten}: hỏng ({type(e).__name__}: {e})"], "cham": {}, "cam_nhan": {}}

    ths = [threading.Thread(target=_t, args=(p,)) for p in PERSONA]
    for t in ths:
        t.start()
    for t in ths:
        t.join()
    tong: dict[str, list] = {}
    for n in sorted(ket):
        k = ket[n]
        print("\n".join(k["ban_ghi"]))
        print(f"\n  ⭐ KHÁCH TỰ CHẤM: {json.dumps(k.get('cam_nhan'), ensure_ascii=False)}")
        print(f"  ⚖️ GIÁM KHẢO ({k.get('model_cham') or '?'}): {json.dumps(k.get('cham'), ensure_ascii=False, indent=1)}\n")
        for kh, v in (k.get("cham") or {}).get("diem", {}).items():
            if isinstance(v, (int, float)):
                tong.setdefault(kh, []).append(v)
        for loi in (k.get("cham") or {}).get("loi", []) or []:
            if isinstance(loi, dict):
                tong.setdefault("nguon:" + str(loi.get("nguon")), []).append(1)
                tong.setdefault("loai:" + str(loi.get("loai")), []).append(1)
    print("=== TỔNG (giám khảo chấm, gợi ý để người đọc — không phải phép đạt / trượt)")
    for kh in ("tu_nhien", "dap_cam_xuc", "cau_hoi_mo", "khong_lap", "trung_thuc", "tin_rao"):
        v = tong.get(kh) or []
        print(f"  {kh}: {sum(v) / len(v):.1f}/5 ({len(v)} khách)" if v else f"  {kh}: —")
    for kh, v in sorted(tong.items()):
        if kh.startswith(("nguon:", "loai:")):
            print(f"  {kh}: {len(v)} lỗi")
    sao = [k.get("cam_nhan", {}).get("sao") for k in ket.values() if isinstance(k.get("cam_nhan", {}).get("sao"), (int, float))]
    print(f"  khách tự chấm: {', '.join(str(s) for s in sao)} sao" if sao else "  khách tự chấm: —")


if __name__ == "__main__":
    main()
