# Chat Gemini "AI Ơi Nhà Đất" — 21/06 → 27/06/2026 (bản share, chưng cất)

Tài liệu gốc do chủ dự án tạo với Gemini Pro (tạo 11:39 21/06/2026, publish 16:19
07/09/2026, link share `share.gemini.google/EEX3PutTDZDt`; bản dán nguyên văn vào phiên
Claude Code 09/09/2026). CHỈ ĐỌC — đây là bản chưng cất theo lượt, không phải transcript.
Tên khách trong transcript giả lập ("anh Luân", "anh Hoàng") là nhân vật kịch bản của
chủ dự án, không phải khách thật. Diễn giải và quyết định nằm ở `docs/09` OPEN-55 và
`docs/02` FR-181…186, FR-173 a, FR-177 h, FR-114 d.

**Cách đọc**: chat này là NGUỒN Ý của SRD Aioinhadat (`AOND req + chat examples.docx`)
và đi trước kịch bản 07/09 của sếp. Hai chat tự mâu thuẫn nhau ở vài chỗ (tên bot, hỏi
hướng, 1 hay 2 yêu cầu mỗi tin, phí); chỗ nào hệ thống đi theo bên nào đã chốt ở OPEN-55
ngày 09/09/2026 — đừng đọc chat này rồi "sửa cho đúng chat".

## Các lượt chủ dự án nói (rút gọn, giữ ý quyết định)

1. Dịch vụ trên Zalo: khách gửi nhà đất cho công ty bán, lưu lại, khi cần hỏi thêm (hình?
   sổ đỏ?), khách trả lời bất cứ lúc nào, **không hỏi lần thứ hai**.
2. Bước 1 chỉ tiếp nhận; câu thoại rời rạc vẫn gom vào đúng một BĐS; **khách vào nói "tôi
   đã bán rồi"** được (Gemini: nhiều căn đang mở → hỏi căn nào). → FR-184.
3–6. Hỏi chọn chatbot/Dialogflow/chi phí/lưu trữ; quy mô **100.000 BĐS** → Gemini khuyên
   DB chuyên dụng + object storage (hệ thống hiện tại đúng hướng này).
7. **Nhận biết hình là hình gì; đọc ảnh giấy đỏ xem đúng không** (đối chiếu lời khách).
   → FR-185.
8. Gọi là "trợ lý AI", không gọi "chatbot".
9–10. Giả lập transcript; **"em là t•ai nhân viên nhận hàng của Ai Ơi Nhà Đất"** — tên
   thương hiệu và tên bot kiểu •ai xuất hiện lần đầu.
11. **Mỗi tin không quá 30 từ**, trừ bảng/gạch đầu dòng. → FR-178 (đã có).
13. **Phải hỏi địa chỉ đầu tiên**. (Hệ thống: loại BĐS trước, vị trí linh hoạt — GIỮ theo
    sếp 07/09, OPEN-55 dòng 3.)
17–18. **Khen điểm mạnh thật** (đường to, mặt tiền rộng), ngắn, **đặt 1–2 yêu cầu kế**.
    (Hệ thống: đúng MỘT thông tin — GIỮ.)
19. **Mỗi khách một nhân viên H•ai, T•ai, L•ai…** → FR-181 (chốt lại 09/09).
20–21. Hỏi mấy tầng, điểm đặc biệt, hợp ở hay kinh doanh ngành gì, pháp lý; **bộ câu hỏi
    theo loại**: chung cư (tầng, view hướng, phòng, tiện ích, sổ/HĐMB), đất (hướng, cột
    điện/hố ga, xây tự do/theo mẫu CĐT, sổ cá nhân/đất dự án), biệt thự (sân vườn, ô tô,
    compound, hoàn công). → FR-186.
22. Transcript 50 lượt: nhà phố → chung cư → đất nền; "bán rồi" → liệt kê 2 căn hỏi đóng căn nào.
23–24. Bot mua cần ảnh bếp → **bot chủ động hỏi người bán**; **"hình như là"** với thứ đoán
    từ ảnh, vật liệu phải hỏi chủ xác nhận. (09/09: chủ nhà trước 12 giờ rồi CTV → FR-173 a.)
28. **Đoạn trao đổi phí** với người bán (1% CCRB / 0,5% NMG, hỏi vai, xin đồng ý phí).
    (Hệ thống: gán nhãn tự động, không nêu phí — GIỮ, FR-159/176.)
29. Nhaadaat.com / nhadat.cc là tên cũ; **Ai Ơi Nhà Đất (Aioinhadat.com)** là tên mới;
    sau đó "**AI** Ơi Nhà Đất" viết hoa AI.
30–31. Hỏi SharePoint vs Drive; SRD lần 1.
32. **200–300 người gửi mới/cập nhật mỗi ngày.**
33. **Nhân viên thật theo dõi hội thoại** (nhãn AI_HANDLING / WAITING_HINT / NEED_HUMAN,
    Takeover/Release). (Chưa làm — OPEN-55 "còn treo".)
34. **Rất nhiều CTV, hệ thống chia tải** (geo, round-robin, trần 15 ca). (Chưa làm.)
35. Lưu ý **luật 7 ngày Zalo**: hỏi "còn bán không" là cớ tương tác; nhiều căn thì mỗi
    ngày hỏi vài căn. 36. **Thay vì chỉ hỏi còn bán không, nhờ bổ sung 1 thông tin còn
    thiếu thì rất tốt.** (Hệ thống: nhịp hỏi bù 5 phút / 30 phút / 3 câu mỗi ngày — GIỮ;
    keep-alive 7 ngày còn treo.)
38. **Rất nhiều loại BĐS** (villa, nhà phố, chung cư, đất, cấp 4, nông nghiệp, SKC…) +
    thông số quan trọng nhất từng loại; thông số cho thuê (hợp đồng, cọc, trượt giá, fit-out).
39. **Rao nhanh và tự nhiên nhất**, không bắt nhập hàng chục thông số; **chấm điểm mỗi BĐS**
    theo độ hoàn chỉnh và kịp thời. → FR-177 d (đã có).
40. **Trách nhiệm người rao** (đúng/đủ/kịp thời; thu xếp xem nhà); **người rao cũng được
    chấm điểm = trung bình điểm các BĐS đang rao**; BĐS mới lấy điểm người rao; NMG càng
    nhiều căn điểm càng cao: **10 căn đầu 5–7%, sau đó 3–5%, sau 30 căn 1–2%**. → FR-183.
41–43. Gamification cho cả NMG và CCRB; **tin nhắn khéo léo báo điểm, khen, bày cách tăng
    điểm**. → FR-177 f (chúc mừng kèm điểm) + FR-183.
44–47. **Kho tên trợ lý theo phụ âm tiếng Việt** (b•ai, c•ai, d•ai, đ•ai, g•ai, gi•ai,
    h•ai, k•ai, kh•ai, l•ai, m•ai, n•ai, nh•ai, ph•ai, q•ai, r•ai, s•ai, t•ai, tr•ai, v•ai);
    T có t•ai và tr•ai; K có kh•ai (chủ dự án giữ cả K•ai); P chỉ có ph•ai; **viết hoa
    chữ đầu: T•ai**. → `KHO_TEN_TRO_LY`.
48–52. Xuất SRD + transcript; kịch bản gửi bán lần đầu; 30 câu; format cửa sổ chat.
53. Hỏi: chạy local có đạt giọng này không → Gemini: có (Qwen 2.5, few-shot từ transcript).
56. **AI Ơi Nhà Đất**, không phải "Ai Ơi Nhà Đất".
57–60. Kịch bản đa phân khúc (nhà phố, biệt thự, chung cư, chủ đầu tư); **7 chân dung
    người rao** (chính chủ nhà phố, nhà đầu tư, đại diện CĐT, biệt thự Q3, căn hộ nghỉ
    dưỡng Vũng Tàu, mua sửa bán lại, chủ toà nhà dòng tiền).
63. **"Tại sao trong 1 cuộc trò chuyện mà trợ lý đổi tên? Chỉ 1 trợ lý xuyên suốt với 1
    người rao."** → FR-181 gán một lần theo Zalo ID.
64. **"Hệ thống lập tức lôi ra được thông tin của dự án: Sunrise City có hồ bơi Olympic."**
    → FR-114 d.
65–67. Chân dung 1 đào sâu: chính chủ tự xây, nhiều lần keep-alive; **hẻm xe hơi/xe tải,
    quay đầu xe, lấn chiếm, ngập nước, cách mặt tiền, trường học, công chứng, gym gần
    nhất**. (Nguồn câu hỏi cho few-shot sau này; chưa thành fact riêng.)

## Kịch bản Gemini đề xuất mà hệ thống KHÔNG nhận (và vì sao)

- Zalo OA + Power Automate + Microsoft Lists/SharePoint + Dialogflow/Copilot Studio →
  hệ thống dùng Supabase (Postgres + Storage + Edge) và bridge Zalo cá nhân; trùng với
  chính khuyến nghị lượt 6 của Gemini cho quy mô 100.000 tin.
- Nút bấm trong tin (`[Vẫn đang bán]`) → bridge zca-js chỉ gửi chữ (chờ OA).
- Bot mua (M•ai) và bot bán (T•ai) là hai người → một `chat-reply` tách vai từng lượt;
  cùng một khách gặp cùng một tên ở cả hai nhánh.
- Hỏi vai + xin đồng ý phí trước khi lên tin → gán nhãn tự động, phí nói khi hỏi.
- Gemini 1.5 Flash/Pro, ASUS Ascent GX10 local → Claude qua Edge Function; lộ trình
  fine-tune Qwen ở FR-180 / OPEN-54.
