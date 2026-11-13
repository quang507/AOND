# 11 — Quy trình BA và tester

Hai vòng làm việc, viết cho người thật đọc và làm theo. Tầng 00–10 nói **sản
phẩm là gì**; file này nói **làm ra nó và kiểm nó thế nào**.

Không có ID mới ở đây — file này không sinh yêu cầu, nó chỉ mô tả cách các ID ở
tầng khác được sinh ra và được kiểm.

## 11.1 Ai làm gì

Dự án một người + agent, nên "vai" là **chiếc mũ đang đội**, không phải chức
danh. Quan trọng là: *đội mũ nào thì chịu trách nhiệm cái gì*, và **không đội
hai mũ trong cùng một lượt** — người vừa viết yêu cầu vừa nghiệm thu chính nó
thì gần như luôn nghiệm thu đạt.

| Mũ | Sở hữu | Câu hỏi phải trả lời |
|---|---|---|
| **BA** | `docs/00`–`09` | Yêu cầu này đến từ đâu, nó mâu thuẫn gì không, ai kiểm được nó? |
| **Dev** | `src/aioi/` (lõi Python), `app/`, `bot/`, `lib/`, migration | Code có đúng FR / mục SRS không, có `catch` nào chưa nối sổ không? |
| **Tester** | `docs/10`, `bot/tests/`, `tests/kich_ban/` (bộ chấm), `scripts/soat-truy-vet.sh` | Có bằng chứng nào cho câu "đã xong" ngoài lời kể không? |

Luật một dòng: **BA viết điều phải đúng, tester viết cách chứng minh nó đúng,
dev làm cho nó đúng.** Ba việc, ba lượt, theo thứ tự đó.

## 11.2 Vòng BA — từ ý muốn tới truy vết

**Từ 30/09/2026 (chủ dự án: "bỏ luôn giờ ko cần FR nữa, viết vào trong docs đi"): sửa lỗi / cải tiến bot và web KHÔNG cần cấp FR trước khi code.** Thay vào đó ghi thẳng vào tài liệu tầng liên quan (thường là `docs/07` — một mục SRS kèm ca gốc, nguyên nhân, chỗ sửa, cách kiểm; ví dụ SRS-5.1a), cùng commit với code và test. FR cũ giữ nguyên số, vẫn là tham chiếu; ai muốn cấp FR cho một tính năng lớn vẫn được, chỉ không còn là cổng bắt buộc. Các bước 3–6 dưới đây chỉ áp khi có cấp FR.

```
1. Nó đến từ đâu?
   ├─ Tài liệu gốc      → trích [nguồn: <file> §<mục>]
   ├─ Insight mới       → thêm INS-xx vào docs/01 TRƯỚC
   ├─ Vận hành/sự cố    → ghi bối cảnh vào docs/09 hoặc mục SRS ở docs/07
   ├─ Việc trong tầm    → kỹ thuật / UX / câu chữ / ngưỡng: soát code + docs, tự chọn phương án tốt nhất,
   │                      làm, ghi mục SRS "Quyết định (BA, uỷ quyền)" (CLAUDE.md §4 mục 2). Không dừng chờ.
   └─ Việc của chủ dự án → tiền / phí, pháp lý, thương hiệu, dữ liệu khách thật, đảo quyết định đã chốt:
                          DỪNG, hỏi MỘT câu. Mâu thuẫn tài liệu không tự giải được → OPEN-xx (2 phương án + khuyến nghị).

2. Ba câu hỏi chặn — sai một câu là bỏ, không phải "sửa cho hợp":
   ├─ Nó đẩy người dùng VỀ Zalo hay KÉO họ ra? (IA-P1 — kéo ra là sai hướng)
   ├─ Nó có phá lời hứa không-thu-số-điện-thoại? (NFR-07)
   └─ Nó có khiến hệ thống khẳng định điều chưa xác minh? (RSK-03)

3. Cấp FR-xxx TIẾP THEO trong docs/02 (M/S/C + nguồn). KHÔNG đánh số lại.
   Mục bỏ đi → đánh dấu [deprecated], giữ nguyên số.

4. Đi hết chuỗi — bỏ mắt xích nào là tài liệu vỡ:
   FR → UF (03) → WF (05) → SRS (07) → AC (07 §7)
   ├─ chạm cấu trúc trang / URL → cập nhật 04
   └─ chạm component / câu chữ   → cập nhật 06

5. Thêm dòng vào docs/08 §8.3 — CÙNG COMMIT, không để "commit sau".

6. Chuyển mũ: báo tester có FR mới (bước 11.3).

7. bun run truyvet  → chạy một lần trước khi push đụng docs/ (không chạy sau từng commit nhỏ, CLAUDE.md §7.1).
   Commit THẲNG main rồi push — không mở PR, không chờ CI (CLAUDE.md §7, SRS-5.1zzzzzzz464).
```

**Vì sao bước 5 phải cùng commit:** một FR không có dòng truy vết là một FR
không ai biết phải kiểm bằng bài nào. Nó vẫn được code, vẫn được đẩy lên `main`, và chỉ
lộ ra khi khách gặp lỗi. `scripts/soat-truy-vet.sh` chặn đúng chỗ này.

**Vì sao bước 1 chỉ "DỪNG" ở việc của chủ dự án:** chủ dự án uỷ quyền 28–29/10/2026
("bạn quyết thêm đi … làm luôn", SRS-5.1zzzzzzz266) — việc trong tầm mà cũng hỏi thì
chỉ làm chậm. Nhưng tiền, pháp lý, thương hiệu, dữ liệu khách thật hay một quyết
định đã chốt thì BA không có thẩm quyền: chốt bừa thì cái sai đi xuống tận SRS rồi
tận code, và lúc chủ dự án phát hiện thì phải bóc ngược năm tầng.

## 11.3 Vòng tester — từ FR tới bằng chứng

```
1. Đọc FR mới + AC liên quan (docs/07 §7). Không có AC → quay lại hỏi BA,
   đừng tự nghĩ ra tiêu chí đạt.

2. Nó rơi vào suite nào? (docs/10 §10.1 — TS-WEB / TS-BOT / TS-ASK / TS-VIEW /
   TS-RET / TS-ADM / TS-SEL / TS-BROKER / TS-PROJECT)

3. Kiểm được bằng MÁY không?
   ├─ Lõi Python (src/aioi/) → kiểm cú pháp + thử thật trên 146 (bộ pytest gỡ 13/11/2026, SRS-5.1zzzzzzz469)
   ├─ Web / edge function / script / SQL → bot/tests/*.mjs (thêm vào `test:bot`)
   │                                       hoặc bot/tests/sql/ (`test:sql`)
   ├─ Cần model thật → script bắn thử production chạy từ máy ssh được vào 146
   │                   (`bot/tests/ban-thu-*.sh`; đọc log bằng `doc-log-loi.sh`, SRS-405) —
   │                   tiền thật, ID thử `la_id_thu`, tự dọn (docs/10 §10.7.0)
   └─ Chưa → viết ca chạy tay vào docs/10 §10.7, kèm LỆNH DÁN VÀO CHẠY ĐƯỢC
             (không phải mô tả), kỳ vọng, và cách dọn dữ liệu thử

4. Cấp ID TS-xxx-nn. Bất biến như FR.

5. Chạy. Ghi kết quả + NGÀY vào cột cuối docs/10 §10.7.
   ✅ đạt · ⚠ đạt một phần · ⏭ chưa chạy được (ghi rõ THIẾU GÌ) · ❌ hỏng

6. Hỏng → mở lại cho dev. Bug tìm thấy sau release phải có ca tái hiện TRƯỚC
   khi sửa — suite chỉ phình, không teo.

7. Sửa lỗi bot / web: mục SRS ở docs/07 trả lời BA CÂU GỐC (CLAUDE.md §4 mục 8, từ
   01/10/2026): (1) lớp lỗi — cơ chế nào cho lỗi lọt; (2) chỗ khác cùng lớp đã
   soát, cái nào sửa, cái nào còn; (3) bài kiểm ĐỎ khi tắt bản sửa, kèm ít nhất
   một cách nói MỚI chưa từng bắn. Lỗi "máy đoán ý bằng từ khoá" không vá bằng
   thêm từ vào regex — đưa sang AI đọc nghĩa, code kiểm trích dẫn.

8. Bài kiểm với model giả (bộ pytest cũ, gỡ 13/11/2026) chỉ kiểm giả định của người sửa. Sửa hành vi model
   thì bắn lại script `ban-thu-*` liên quan sau khi đưa lõi lên 146 (`trien-khai-146.sh`) rồi mới ghi
   "xong".
```

**Ba luật của tester ở repo này:**

1. **`⏭` phải nói thiếu gì.** "Chưa chạy" là vô nghĩa; "cần bridge sống",
   "cần bản deploy", "cần tài khoản ntfy" là việc giao được cho người khác.
2. **Ca ghi trên DB thật phải tự cuộn lại.** Bọc `do $$ … raise exception 'KQ:
   %', o; end $$;` hoặc `begin … rollback`. `nhadat-cc` là môi trường CHÍNH,
   bậc Free không có backup tự động (OPEN-25) — làm hỏng là mất thật.
3. **Bí mật lấy bằng `get_secret()` ngay trong câu SQL, không in ra.** Khoá đã
   dán vào chat coi như lộ, phải xoay.
4. **Báo lỗi phải kèm NGUYÊN NHÂN, không chỉ triệu chứng.** [nguồn: chủ dự án 29/09/2026 "sau này khi test phải ghi rõ vì
   sao lỗi"] Mỗi lỗi trong báo cáo test (bắn thật hay chạy máy) ghi ba thứ: *triệu chứng* (khách nhắn gì → bot ghi/nói gì),
   *nguyên nhân* (luật / hàm / thứ tự xét nào gây ra, chỉ đúng tên trong mã), *cách sửa*. Chưa tìm ra nguyên nhân thì ghi
   "chưa rõ nguyên nhân" kèm việc đã kiểm — không đoán. Ca test tái hiện lỗi cũng ghi nguyên nhân trong dòng chú thích.

## 11.4 Máy kiểm gì, người kiểm gì

Trước 04/09/2026 repo không có CI: mọi câu "tsc sạch, e2e xanh" đều là **lời kể
của người đẩy commit**. Nay chia lại cho sòng phẳng.

| Tầng | Ai kiểm | Ở đâu | Chặn? |
|---|---|---|---|
| Kiểu dữ liệu TypeScript | máy | CI job `web` | ⚠️ xem dưới |
| Web dựng được, trang tin còn trong cache (NFR-17) | máy dựng, người soi bảng route | CI job `web` | ⚠️ / không |
| `test:bot` (code TypeScript còn sống); `test:sql` (trigger thật trên Postgres tạm) | máy | CI job `bot` | ⚠️ |
| Xuất rổ hàng không hụt im lặng (TS-ROHANG; TS-MASTERDB gỡ 19/10/2026) | máy | CI job `rohang` | ⚠️ |
| Kiểu ba edge function, luật tiền TS ↔ SQL, danh sách migration, trạng thái DB | máy | CI job `kieubot`, `doichieutien`, `doichieusdt` (luật SĐT), `migration`, `soatdb` | ⚠️ |
| Lời bot với model THẬT (TS-PROD-01…04) | máy bắn, người đọc log | `bot/tests/ban-thu-*.sh`, `doc-log-loi.sh` chạy từ máy ssh được vào 146 (SRS-405) | không, tay |
| ID gãy, truy vết thiếu, số đếm README, PII, khoá service_role | máy | CI job `truyvet` | ⚠️ |
| RLS / GRANT — tập không phá huỷ (TS-SEC-AUTO) | máy | CI job `baomat` | ⚠️ |
| RLS / GRANT — ma trận 5 vai (TS-SEC3) | người, SQL Editor | `bot/tests/vai-tro.sql` | có, tay |
| RLS / GRANT — bài phá huỷ (xoá thật nếu RLS hỏng) | người, SQL Editor | `docs/10 §10.7` | có, tay |
| Migration đã áp ↔ file trong repo, ảnh chụp schema còn mới | máy, chạy tay | `scripts/soat-migration.mjs` | có, tay |
| Thông tuyến Zalo thật (TS-LIVE); chat Zalo thật bằng ID thử (TS-NGUOI cũ có vai CTV — deprecated 28/10/2026) | người | `docs/10 §10.7` | có, tay |
| Tone giọng, a11y, Lighthouse, tải | người | `docs/10 §10.3–10.4` | chưa |
| Lint | **không có** — repo chưa cài eslint/biome/prettier | — | không |

**⚠️ = CI chỉ để tham khảo, KHÔNG chặn.** Từ 11/11/2026 (chủ dự án: "xóa cái luật cl pr", "sao cứ sửa là m
chạy") `kiem.yml` / `cham.yml` không tự chạy khi push / PR nữa — chỉ chạy tay (`workflow_dispatch`); không ai chờ
nó xanh. Agent và người commit THẲNG `main`, không mở PR (CLAUDE.md §7, SRS-5.1zzzzzzz464), nên `main` cố ý không
bật bảo vệ nhánh. Bằng chứng "đã chạy" là lệnh khoanh vùng người sửa tự chạy (§11.5 Cổng 1) và bắn thử / log
trên máy 146 (Cổng 3), không phải dấu xanh CI.

**Về lint:** repo không có eslint, biome, prettier hay oxlint — không trong
`devDependencies`, không có file cấu hình nào. `next lint` đòi eslint cài sẵn
nên cũng không chạy được. Vì vậy KHÔNG có script `lint` trong `package.json`:
thêm một câu lệnh không chạy được là dựng CI giả. Muốn có lint thì đó là một
quyết định thêm phụ thuộc, làm riêng, không lẫn vào cổng này.

Chỗ máy KHÔNG với tới được là chỗ nguy nhất, vì nó im lặng: RLS hở, bridge chết,
bot trả 200 kèm câu trả lời sai. Đó là lý do TS-SEC chạy sau **mọi** migration
đụng RLS/GRANT, và `bot_health_tick` + còi ntfy tồn tại (FR-152, NFR-18).

**Một bài kiểm im lặng còn tệ hơn không có bài nào.** Bản đầu của
`bot/tests/ts-sec-anon.mjs` coi "HTTP ≥ 400 = bị chặn = đạt". Chạy thử: 24/24
ĐẠT — trong khi không một request nào tới được Supabase, proxy trả 403 chữ trần.
Mất mạng, sai URL, project bị pause đều cho ra một bộ bảo mật xanh rờn. Luật rút
ra, áp cho mọi bài kiểm ở repo này:

> Trước khi tin một bài kiểm, hỏi: **nếu thứ nó giám sát chết ngay bây giờ, bài
> này có kêu không?** Không kêu thì nó đang đo sự im lặng, không đo sự đúng.

Nên mọi bài "phải bị chặn" giờ đòi đúng hình lỗi của thứ được kiểm (PostgREST
trả JSON có `message`), có bài dò đường chạy trước, và có mã thoát riêng cho
"chưa kiểm được" (2) khác với "đạt" (0). Và bài tự kiểm
`ts-sec-anon.tu-kiem.mjs` dựng PostgREST giả để bắt chính nó chứng minh điều đó
— chạy offline, nằm trong `test:bot`.

## 11.5 Ba cổng

Từ 11/11/2026 (chủ dự án: "giờ tôi bảo bạn sửa gì là bạn sửa luôn không có cl hay test xanh đỏ gì hết"; CLAUDE.md §7,
SRS-5.1zzzzzzz464): sửa → commit THẲNG `main` → push, không PR, không chờ CI. Ba cổng giữ để biết ai kiểm gì:
**Cổng 1 và Cổng 3 bắt buộc** (người / agent tự kiểm, cùng lượt); **Cổng 2 (CI) chỉ tham khảo**, không chặn.

**Cổng 1 — trước khi push** (người & agent, bắt buộc, kiểm tra khoanh vùng theo phạm vi — CLAUDE.md §7.1):
*Từ 06/11/2026 (SRS-5.1zzzzzzz387): Không chạy kiểm tra máy móc toàn bộ trước MỌI commit nhỏ làm tràn bộ nhớ token và chậm phiên. Phân bổ hợp lý theo phạm vi:*
- Commit nháp / lưu tiến độ (WIP): commit tự do không cần test.
- Đụng `docs/`: chỉ chạy `bun run truyvet` (1–2 giây) trước khi push.
- Đụng web (`app/`, `components/`): chỉ chạy `bun run kieu` khi hoàn tất phần web.
- Đụng lõi Python (`src/aioi/`): kiểm cú pháp (`ast.parse`); không còn pytest (gỡ 13/11/2026).
- Toàn bộ `bun run kiem`: không bắt buộc — chạy khi tự thấy cần (chủ dự án 11/11: không chờ test xanh đỏ).

```bash
bun run truyvet  # soát tài liệu nhanh (1-2s) trước khi push đụng docs/
bun run kiem     # kiểm tra toàn bộ — khi cần
```

Đụng migration RLS/GRANT thì chạy thêm TS-SEC bằng tay.

**Cổng 2 — CI trên GitHub Actions** (máy, chỉ tham khảo): `.github/workflows/kiem.yml` (10 job) và `cham.yml` (bộ
chấm offline, SRS-5.1zzzzzzz377) từ 11/11/2026 chỉ chạy tay (`workflow_dispatch`), KHÔNG tự chạy khi push, KHÔNG
chặn, không ai chờ xanh. Chạy khi muốn một lượt soát toàn bộ trên máy sạch; đỏ thì đọc và tự quyết sửa, không phải
điều kiện để push. `main` cố ý không bật bảo vệ nhánh (*Require a pull request*… sẽ chặn đúng vòng commit thẳng
`main` mà chủ dự án chọn). Tên job còn để tra:

| Tên check | Job | Đỏ nghĩa là gì |
|---|---|---|
| `Web — kiểu dữ liệu + dựng` | `web` | TypeScript hoặc `next build` hỏng |
| `Bot — e2e hội thoại` | `bot` | `test:bot` hoặc `test:sql` đỏ (tên giữ chữ "e2e" cũ) |
| `Rổ hàng + masterDB — tự kiểm trên máy chủ giả` | `rohang` | Bản xuất rổ hàng ghi vào repo / nuốt dòng thiếu (phần masterDB gỡ 19/10/2026, tên giữ nguyên) |
| `Tài liệu — truy vết ID` | `truyvet` | ID gãy, số đếm lệch, PII hoặc khoá lọt vào file |
| `Bảo mật — hồi quy RLS trên DB thật` | `baomat` | Vai `anon` với tới thứ nó không được với. Supabase Free ngủ khi không ai đụng → `test:sec` thoát 2 ("chưa kiểm được", không phải "đạt") |

(Còn `migration`, `soatdb`, `kieubot`, `doichieutien`, `doichieusdt` — soát 13/11/2026. Lịch sử: 06/09/2026 từng đề xuất bật branch
protection với năm check trên làm cổng chặn merge; bỏ hẳn từ 11/11/2026.)

**Cổng 3 — triển khai cùng lượt** (người / agent, bắt buộc — CLAUDE.md §7 bước 3–4: "sửa 1 lần là từ code repo db và
máy 146 đều dc sửa luôn"):
- **Lõi Python**: đổi `src/aioi/` → `bash scripts/trien-khai-146.sh` (sao lưu `src` cũ vào `C:\aond\backup\src_*`, chép,
  khởi động lại task "AOND Core", chờ `/health`; báo trước người đang chat thử — SRS-401). Sửa hành vi model thì chạy script
  `ban-thu-*` liên quan và `doc-log-loi.sh` (SRS-405).
- **Bridge**: đổi `bot/bridge-zca/` → chép tay lên `C:\aond\bridge-zca` trên 146 rồi khởi động lại hai task bridge.
- **Công tắc env**: sửa cả `bot/cau-hinh-loi.env` lẫn `C:\aond\aond_core\.env` trên 146, rồi khởi động lại lõi.
- **Migration**: file trong `bot/supabase/migrations/`, chạy thử trong giao dịch huỷ (`begin … rollback`), rồi ÁP LUÔN cùng
  lượt và commit file cùng lúc (CLAUDE.md §7 bước 4). Đụng RLS/GRANT thì chạy TS-SEC.
- **Edge function còn lại** (`escalation-feed`, `geocode-listings`, `media-cleanup`): workflow `deploy-bot.yml`
  (chạy tay, runner tự build và đẩy, bytes không qua tay ai). Bản cũ "bundle → kéo ngược → so từng byte" là của `chat-reply` đã gỡ.

## 11.6 Định nghĩa XONG

**Một thay đổi (sửa lỗi / cải tiến)** là XONG khi, trong cùng lượt (CLAUDE.md §7 vòng giao việc):

1. Code đã commit THẲNG `main` và push (không PR, không chờ CI).
2. DB và máy 146 đã theo: migration đã áp (nếu có), lõi / bridge / `.env` trên 146 đã cập nhật (Cổng 3).
3. Có MỘT mục SRS ở `docs/07` đi chung commit (ca gốc · lớp lỗi · sửa · kiểm; sửa lỗi thì trả lời ba câu của
   CLAUDE.md §4 mục 8).
4. Cổng 1 đã chạy theo phạm vi (§11.5). CI (Cổng 2) không phải điều kiện.

**Một FR** chỉ được ghi ✅ trong `docs/02` khi đủ **cả bốn**:

1. Có dòng trong ma trận `docs/08`.
2. Có ít nhất một ca `TS-` trong `docs/10` — và ca đó đã chạy, có ngày.
3. Cổng 1 và Cổng 3 ở §11.5 đã qua.
4. Có bằng chứng từ hệ thống thật, không chỉ từ test: dòng trong DB, log, ảnh
   màn hình, hoặc số ở `/admin`.

Thiếu (4) thì trạng thái cao nhất là 🟡. Tính đến 04/09/2026 phần lớn chuỗi
FR-129/140/153/165/172c/173 dừng ở 🟡 vì **chưa có giao dịch thật nào chảy
qua** (`docs/10 §10.8`).

## 11.7 Lệnh

| Việc | Lệnh | Có trong `kiem`? |
|---|---|---|
| Kiểm tra toàn bộ (không bắt buộc, khi cần) | `bun run kiem` | — |
| Chỉ kiểu dữ liệu | `bun run kieu` | có |
| Chỉ dựng web | `bun run build` | có |
| Lõi Python | kiểm cú pháp `ast.parse` + thử thật trên 146 | **không** — bộ pytest `tests/` gỡ 13/11/2026 (SRS-5.1zzzzzzz469) |
| Code TypeScript còn sống (web, edge function, script) | `bun run test:bot` | có |
| Trigger / hàm SQL trên Postgres tạm | `bun run test:sql` | không (cần Postgres; CI job `bot`) |
| Kiểu ba edge function | `bun run kieu:bot` | có |
| Chỉ tự kiểm rổ hàng | `bun run test:rohang` | có |
| Bắn thử lõi production bằng model thật (tiền thật) | `TOKEN=… bash bot/tests/ban-thu-<tên>.sh` / `doc-log-loi.sh` từ máy ssh được vào 146; đo tìm nhà: ô `do-tim-nha` | không |
| Chỉ soát tài liệu | `bun run truyvet` | có |
| Hồi quy RLS trên DB thật (cần Internet) | `bun run test:sec` | **không** — cần mạng, để `kiem` không đỏ oan trên máy offline |
| Ma trận quyền 5 vai (cần quyền SQL) | dán `bot/tests/vai-tro.sql` vào SQL Editor | không |
| Soát trôi migration DB ↔ repo (cần khoá) | `node scripts/soat-migration.mjs` | không |
| Sinh lại ảnh chụp schema (cần khoá `SUPABASE_SERVICE_ROLE_KEY` trong `scripts/.env`) | `node scripts/sinh-schema.mjs` (gọi RPC `xuat_schema()`) | không |
| Soát tài liệu chi tiết hơn (agent) | gọi agent `soat-truy-vet` |
| Review diff đụng `docs/` | gọi agent `reviewer` |

Cùng một lệnh cho người và cho CI chạy tay (`package.json` là nguồn duy nhất) — không thì
"máy xanh, máy tao đỏ" và không ai biết bên nào đúng.
