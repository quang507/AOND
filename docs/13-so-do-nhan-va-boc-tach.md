# 13 — Sơ đồ: một tin Zalo đi qua lõi Python

Bản cũ (chat-reply TypeScript, `zalo-webhook`, `inbound_ledger`, `required_facts`, 09/09/2026) xem `git log -- docs/13-so-do-nhan-va-boc-tach.md`.

Viết lại 28/10/2026 theo lõi Python `src/aioi/` (bộ não duy nhất từ 18/10/2026, SRS-5.1zzzzzzz31 / SRS-5.1zzzzzzz46)
`[nguồn: chủ dự án 28/10/2026, chat]`. Mỗi ô là một hàm có thật ở HEAD: `src/aioi/server.py` (`chat_reply`),
`src/aioi/engine.py` (`Engine.handle`, `Engine._handle`). Chỉ ghi bước thấy trong code; không có ô nào là "sẽ làm".
Kiến trúc chung: `docs/07-srs.md` §2. Không sinh ID.

Nguyên tắc xuyên suốt: **AI đọc ý theo nghĩa, code kiểm trích dẫn.** Ô tin chỉ ghi điều KHÁCH nói (SRS-5.1zzzzzzz73);
lời bot lệch luật hình thức thì gọi lại model một lần, không tự sửa chữ (`_soat_hinh_thuc`).

## 13.1 Toàn cảnh: từ bridge tới lời trả về

Hàm `server.chat_reply`, theo đúng thứ tự trong code.

```mermaid
flowchart TD
  Z["Zalo cá nhân<br/>số ký gửi / số tư vấn"] --> BR["bridge zca-js<br/>bot/bridge-zca/index.mjs"]
  BR -->|"POST 127.0.0.1:8000/chat-reply<br/>text · ảnh · file · sticker · so_nhan · gioi_tinh"| MS{"mark_sent?"}
  MS -->|có| R0["trả rỗng"]
  MS -->|không| HM{"_han_muc.cho_phep<br/>trần lượt người / ngày"}
  HM -->|vượt| R0
  HM --> HN{"human_note?<br/>admin gõ tay trên acc clone"}
  HN -->|có| NT["_nguoi_that_noi<br/>ghi lịch sử + CRM, bot nhường sân"] --> R0
  HN --> GIU{"admin đang giữ hội thoại<br/>hoặc _dang_nhuong_san?"}
  GIU -->|có| CRM0["sync_to_supabase_async<br/>chỉ ghi lời khách"] --> R0
  GIU --> TH["tin thoại → transcribe_voice_url (Groq Whisper)<br/>ảnh / file → media_urls<br/>sticker → doc_sticker"]
  TH --> LZ{"lenh_zalo.ten_lenh?<br/>/quit /state /listings /whoami …"}
  LZ -->|có| LC["lenh_zalo.chay<br/>không qua model, không vào lịch sử"] --> RL["trả tin lệnh"]
  LZ -->|không| GOM["_xep_cho / _lay_cho: gom tin chờ<br/>Engine.khoa_luot: một lượt một lúc mỗi khách<br/>_dat_goi_y_xung_ho · _dat_so_nhan"]
  GOM -->|có media| HMB["Engine.handle_media_batch"]
  GOM -->|chữ| EH["Engine.handle → _handle<br/>§13.2"]
  HMB --> OK{"lượt hỏng?"}
  EH --> OK
  OK -->|có| GC["câu mẫu giu_cho<br/>_thu_lai_nen tự thử lại"] --> OUT
  OK -->|không| POST["chunk_reply + typing_delay → replies, nhip_go<br/>sync_to_supabase_async → messages (CRM)<br/>_bao_can_nguoi_nen · _ghi_danh_gia_nen<br/>followup_manager.schedule_followup (người bán)<br/>anh_gui_kem + anh_can_gui_kem → photos"]
  POST --> OUT["ZaloBridgeResponse<br/>replies · nhip_go · photos · tha_tim"]
  OUT --> BR
```

## 13.2 Một lượt trong `Engine._handle`

`Engine.handle` chỉ đặt model thử cho ID thử (`model_chat_thu`, SRS-5.1zzzzzzz234) rồi gọi `_handle`.

```mermaid
flowchart TD
  IN["tin khách"] --> URL{"có link ảnh / PDF / Drive / Sheets?"}
  URL -->|có| HL["Engine.handle_link"]
  URL -->|không| MA{"lenh_tra_loi '#35;mã: …'<br/>và la_nhan_vien?"}
  MA -->|có| TM["tra_loi_theo_ma<br/>(admin trả lời câu khách mua hỏi)"] --> BRS
  MA -->|không| KH["_lap_ke_hoach<br/>lượt AI lập thao tác (OPERATIONS_SYSTEM + RANH_GIOI_CACHE)<br/>ra: operations + vai + ý mua / bán + duyệt + hỏi về + y_luot"]
  KH --> VAI["định tuyến vai theo user_intent của lượt<br/>buy → buyer · sell → seller · mơ hồ: giữ vai / số tư vấn → buyer"]
  VAI --> TLK["tra_loi_cau_hoi<br/>(chủ nhà vừa trả lời câu khách mua hỏi)"]
  TLK --> DX{"đang chờ xác nhận ẩn tin?<br/>pending_destructive"}
  DX -->|đồng ý| AP["_apply_pending_destructive<br/>_receipt_reply"] --> BRS
  DX --> DA{"câu hỏi dự án / xin bản vẽ?"}
  DA -->|có| DOC["_answer_from_docs / _media_request_reply"] --> BRS
  DA -->|không| OPS["_ap_dung_ke_hoach → _apply_operation"]
  OPS --> GATE["CỔNG BẰNG CHỨNG<br/>_loc_o_tin → _gia_tri_ghi<br/>cụm trích phải nằm nguyên trong lời khách<br/>(lời bot, lời tả ảnh không tính)"]
  GATE --> UPD["ghi ô: Property.update<br/>ô bị bỏ ghi vào bo_luot"]
  UPD --> DUY["khách duyệt bản nháp → ghi_duyet · ghi_ban_tin"]
  DUY --> DD["địa danh: _nga_tu · phuong_theo_du_an<br/>_chuan_dia_danh · _phuong_tu_dia_chi (SRS-5.1zzzzzzz236)"]
  DD --> ROLE{"conv.role"}
  ROLE -->|buyer| B["§13.4 nhánh mua"]
  ROLE -->|seller, ngoài vùng| NV["build_ngoai_vung_system"] --> RP
  ROLE -->|seller| S["§13.3 nhánh bán"]
  S --> RP["model trả lời<br/>_agent_reply (dự án có rổ căn) hoặc _provider.reply"]
  B --> RP
  RP --> SO["_soat_hinh_thuc<br/>lệch luật hình thức → gọi lại model MỘT lần"]
  SO --> NH{"lượt trình bản nháp mà<br/>chưa ra bản tin 📋 / thiếu câu mời Zalo?"}
  NH -->|có| LAI["gọi lại MỘT lần; vẫn không ra → listing_proposed = False"] --> BRS
  NH -->|không| BRS["_build_result<br/>lưu: supabase_store.luu_nen / save<br/>(listings.boc_tach, conversations, …)"]
```

## 13.3 Nhánh bán: chọn prompt

```mermaid
flowchart TD
  S0["_o_hoi_ke(missing_fields)<br/>ô khách lờ 2 lần để sau"] --> S1["cum_hoi · xin_dang → thieu_toi_thieu"]
  S1 --> S2{"summary_ready()<br/>hoặc đã trình bản nháp<br/>hoặc khách bảo đăng đủ sàn?"}
  S2 -->|chưa| C1["build_chat_system<br/>khen + MỘT câu hỏi ô kế<br/>+ khoi_xin_dang + _khoi_diem_tin"]
  S2 -->|"đủ, chưa trình"| C2["build_listing_proposal_system<br/>bản tin 📋 theo AD_FORMAT"]
  S2 -->|"đã trình"| C3["build_fee_followup_system<br/>duyệt · phí · trạng thái web<br/>+ khoi_hoi_sau_dang (mỗi lượt một ô)"]
  C1 & C2 & C3 --> K["khối ghép thêm:<br/>khoi_dia_danh · _khoi_hoi_du_an · khoi_chao_lan_dau<br/>khoi_xung_ho · _ghep_cau_chuan (trước RANH_GIOI_CACHE)<br/>MỘT khối ưu tiên: khoi_can_nguoi > khoi_phap_ly > khoi_ngoai_viec > hỏi về<br/>_basket_block · _project_memory_block · _seller_price_block"]
```

## 13.4 Nhánh mua

```mermaid
flowchart TD
  B0["BuyerLead.next_question_field<br/>tối đa MAX_CAU_HOI_MUA câu nhu cầu"] --> B1["build_buyer_chat_system"]
  B1 --> B2["_viec_mua: lịch hẹn, số điện thoại,<br/>quan tâm, chê căn, xin ảnh (mua.py)<br/>căn gợi ý qua _can_goi_y → rpc tim_nha"]
  B2 --> B3["khoi_can_cho_khach · khoi_viec_vua_ghi · khoi_lich_dang_cho<br/>du_an_mua.khoi_du_an · khoi_chao_tu_van (số tư vấn, lượt đầu)<br/>MỘT khối ưu tiên: khoi_can_nguoi > khoi_phap_ly > khoi_hoi_ve_mua<br/>khoi_xung_ho · khoi_tai_chinh · _ghep_cau_chuan"]
  B3 --> B4["_provider.reply → _soat_hinh_thuc(can_mua)"]
```

Sau lượt, ảnh căn bot vừa dán link đi kèm qua `anh_can_gui_kem` (§13.1). Tin chủ động cho khách (nhắc, báo căn mới) không đi
đường này: lõi gửi qua `POST /send` của bridge (`gui_nhac.py`, `bao_can_moi.py`, `followup.py`), xem `docs/07-srs.md` §2.
