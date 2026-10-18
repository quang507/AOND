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
| **Dev** | `app/`, `bot/`, `lib/`, migration | Code có đúng FR không, có `catch` nào chưa nối sổ không? |
| **Tester** | `docs/10`, `bot/tests/`, `scripts/soat-truy-vet.sh` | Có bằng chứng nào cho câu "đã xong" ngoài lời kể không? |

Luật một dòng: **BA viết điều phải đúng, tester viết cách chứng minh nó đúng,
dev làm cho nó đúng.** Ba việc, ba lượt, theo thứ tự đó.

## 11.2 Vòng BA — từ ý muốn tới truy vết

**Từ 30/09/2026 (chủ dự án: "bỏ luôn giờ ko cần FR nữa, viết vào trong docs đi"): sửa lỗi / cải tiến bot và web KHÔNG cần cấp FR trước khi code.** Thay vào đó ghi thẳng vào tài liệu tầng liên quan (thường là `docs/07` — một mục SRS kèm ca gốc, nguyên nhân, chỗ sửa, cách kiểm; ví dụ SRS-5.1a), cùng commit với code và test. FR cũ giữ nguyên số, vẫn là tham chiếu; ai muốn cấp FR cho một tính năng lớn vẫn được, chỉ không còn là cổng bắt buộc. Các bước 3–6 dưới đây chỉ áp khi có cấp FR.

```
1. Nó đến từ đâu?
   ├─ Tài liệu gốc      → trích [nguồn: <file> §<mục>]
   ├─ Insight mới       → thêm INS-xx vào docs/01 TRƯỚC
   ├─ Vận hành/sự cố    → ghi bối cảnh vào docs/09 hoặc bot/README
   └─ Ý muốn tự phát    → DỪNG. Ghi OPEN-xx (2 phương án + khuyến nghị), hỏi chủ dự án.

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

7. bash scripts/soat-truy-vet.sh  → phải SẠCH mới commit.
```

**Vì sao bước 5 phải cùng commit:** một FR không có dòng truy vết là một FR
không ai biết phải kiểm bằng bài nào. Nó vẫn được code, vẫn được merge, và chỉ
lộ ra khi khách gặp lỗi. `scripts/soat-truy-vet.sh` chặn đúng chỗ này.

**Vì sao bước 1 có nhánh "DỪNG":** hai tài liệu gốc mâu thuẫn nhau thì BA không
có thẩm quyền chốt. Chốt bừa thì cái sai đi xuống tận SRS rồi tận code, và lúc
chủ dự án phát hiện thì phải bóc ngược năm tầng.

## 11.3 Vòng tester — từ FR tới bằng chứng

```
1. Đọc FR mới + AC liên quan (docs/07 §7). Không có AC → quay lại hỏi BA,
   đừng tự nghĩ ra tiêu chí đạt.

2. Nó rơi vào suite nào? (docs/10 §10.1 — TS-WEB / TS-BOT / TS-ASK / TS-VIEW /
   TS-RET / TS-ADM / TS-SEL / TS-BROKER / TS-PROJECT)

3. Kiểm được bằng MÁY không?
   ├─ Được → viết ca vào bot/tests/ hoặc bot/tests/e2e/run.mjs, nối vào CI
   └─ Chưa → viết ca chạy tay vào docs/10 §10.7, kèm LỆNH DÁN VÀO CHẠY ĐƯỢC
             (không phải mô tả), kỳ vọng, và cách dọn dữ liệu thử

4. Cấp ID TS-xxx-nn. Bất biến như FR.

5. Chạy. Ghi kết quả + NGÀY vào cột cuối docs/10 §10.7.
   ✅ đạt · ⚠ đạt một phần · ⏭ chưa chạy được (ghi rõ THIẾU GÌ) · ❌ hỏng

6. Hỏng → mở lại cho dev. Bug tìm thấy sau release phải có ca tái hiện TRƯỚC
   khi sửa — suite chỉ phình, không teo.
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

| Tầng | Ai kiểm | Ở đâu | Chặn merge? |
|---|---|---|---|
| Kiểu dữ liệu TypeScript | máy | CI job `web` | ⚠️ xem dưới |
| Web dựng được, trang tin còn trong cache (NFR-17) | máy dựng, người soi bảng route | CI job `web` | ⚠️ / không |
| 208 ca hội thoại + webhook + cổng, và 82 ca FR-159/161/164 | máy | CI job `bot` | ⚠️ |
| Xuất rổ hàng / đẩy masterDB không hụt im lặng (TS-ROHANG, TS-MASTERDB) | máy | CI job `rohang` | ⚠️ |
| ID gãy, truy vết thiếu, số đếm README, PII, khoá service_role | máy | CI job `truyvet` | ⚠️ |
| RLS / GRANT — tập không phá huỷ (TS-SEC-AUTO) | máy | CI job `baomat` | ⚠️ |
| RLS / GRANT — ma trận 5 vai (TS-SEC3) | người, SQL Editor | `bot/tests/vai-tro.sql` | có, tay |
| RLS / GRANT — bài phá huỷ (xoá thật nếu RLS hỏng) | người, SQL Editor | `docs/10 §10.7` | có, tay |
| Migration đã áp ↔ file trong repo, ảnh chụp schema còn mới | máy, chạy tay | `scripts/soat-migration.mjs` | có, tay |
| Thông tuyến Zalo thật (TS-LIVE); kịch bản người thật ba vai (TS-NGUOI, 15/09) | người, hai–ba điện thoại | `docs/10 §10.7` | có, tay |
| Tone giọng, a11y, Lighthouse, tải | người | `docs/10 §10.3–10.4` | chưa |
| Lint | **không có** — repo chưa cài eslint/biome/prettier | — | không |

**⚠️ CI CHẠY KHÔNG CÓ NGHĨA LÀ CHẶN ĐƯỢC MERGE.** Soát 06/09/2026 qua API
GitHub: nhánh `main` trả `"protected": false`. Nghĩa là sáu job kia có đỏ rực
thì nút *Merge* vẫn bấm được, và ai cũng push thẳng vào `main` được, không qua
PR nào. Bảng này trước đây ghi "có" ở năm dòng đầu — đó là **lời kể**, đúng thứ
CI sinh ra để thay thế. Muốn chữ "có" thành thật thì phải bật bảo vệ nhánh, xem
§11.5 Cổng 2.

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

**Cổng 1 — trước commit** (người, tại máy):

```bash
bun run kiem     # kiểu + dựng + e2e bot + soát truy vết, một lệnh
```

Đụng migration RLS/GRANT thì chạy thêm TS-SEC bằng tay.

**Cổng 2 — trước merge** (máy, GitHub Actions `.github/workflows/kiem.yml`):
năm job `web` / `bot` / `rohang` / `truyvet` / `baomat` phải xanh. Đỏ là không
merge — không "merge rồi sửa sau".

Nhưng tính tới 06/09/2026 câu trên mới là **kỷ luật, chưa phải hàng rào**:
`main` chưa bật bảo vệ nhánh, nên GitHub không ngăn ai merge PR đỏ hay push
thẳng. Cổng 2 chỉ có thật khi chủ dự án bật, ở
**Settings → Branches → Add branch protection rule** cho `main`:

- ✅ *Require a pull request before merging* — chặn push thẳng vào `main`.
- ✅ *Require status checks to pass before merging* + ✅ *Require branches to be
  up to date*, rồi chọn đúng năm tên check này (chép nguyên văn, kể cả dấu gạch
  dài và dấu tiếng Việt — GitHub so khớp theo TÊN, sai một ký tự là điều kiện
  không bao giờ thoả và PR kẹt vĩnh viễn):

  | Tên check | Job | Đỏ nghĩa là gì |
  |---|---|---|
  | `Web — kiểu dữ liệu + dựng` | `web` | TypeScript hoặc `next build` hỏng |
  | `Bot — e2e hội thoại` | `bot` | Hồi quy hội thoại / webhook / cổng vào gãy |
  | `Rổ hàng + masterDB — tự kiểm trên máy chủ giả` | `rohang` | Bản xuất rổ hàng ghi vào repo / nuốt dòng thiếu, hoặc đẩy masterDB hụt mà vẫn báo xong |
  | `Tài liệu — truy vết ID` | `truyvet` | ID gãy, số đếm lệch, PII hoặc khoá lọt vào file |
  | `Bảo mật — hồi quy RLS trên DB thật` | `baomat` | Vai `anon` với tới thứ nó không được với |

  (11/09/2026: bỏ `Sao lưu — tự kiểm trên PostgREST giả` và `Phục hồi — diễn
  tập trên Postgres thật` cùng sao lưu. Nếu đã chọn hai tên đó trong branch
  protection thì gỡ ra, không thì PR kẹt.)

**Đánh đổi phải biết trước khi bật `baomat`:** job đó cần đường ra Internet tới
`*.supabase.co` và DB đang chạy. Supabase bậc Free **ngủ khi không ai đụng** —
lúc đó `test:sec` thoát 2 ("chưa kiểm được"), job đỏ, và mọi PR kẹt cho tới khi
đánh thức DB. Đó là hành vi ĐÚNG (không kiểm được thì không được merge), nhưng
nó sẽ chặn thật, nên đừng ngạc nhiên rồi đi tắt nó lúc đang vội.

Không bật ✅ *Include administrators* thì chủ repo vẫn tự bỏ qua được — tuỳ chủ
dự án, nhưng phải là lựa chọn có ý thức, không phải mặc định quên bật.

**Cổng 3 — trước deploy edge function** (người, `bot/README.md §Deploy`):
bundle → deploy → kéo ngược → **so từng byte** → chạy e2e trên chính nội dung
kéo ngược → gọi thử một lượt thật rồi dọn. Bỏ bước so byte là bỏ cả cổng: chép
tay đo được một lỗi mỗi 7 KB, và lỗi rơi vào regex thì hỏng im lặng.

## 11.6 Định nghĩa XONG

Một FR chỉ được ghi ✅ trong `docs/02` khi đủ **cả bốn**:

1. Có dòng trong ma trận `docs/08`.
2. Có ít nhất một ca `TS-` trong `docs/10` — và ca đó đã chạy, có ngày.
3. Ba cổng ở §11.5 đã qua.
4. Có bằng chứng từ hệ thống thật, không chỉ từ test: dòng trong DB, log, ảnh
   màn hình, hoặc số ở `/admin`.

Thiếu (4) thì trạng thái cao nhất là 🟡. Tính đến 04/09/2026 phần lớn chuỗi
FR-129/140/153/165/172c/173 dừng ở 🟡 vì **chưa có giao dịch thật nào chảy
qua** (`docs/10 §10.8`).

## 11.7 Lệnh

| Việc | Lệnh | Có trong `kiem`? |
|---|---|---|
| Toàn bộ cổng 1 | `bun run kiem` | — |
| Chỉ kiểu dữ liệu | `bun run kieu` | có |
| Chỉ dựng web | `bun run build` | có |
| Chỉ e2e bot (208 ca + 82 ca regex + 4 cảnh tự kiểm) | `bun run test:bot` | có |
| Chỉ ba tiến trình e2e | `bun run e2e` | qua `test:bot` |
| Chỉ tự kiểm rổ hàng / masterDB | `bun run test:rohang` · `bun run test:masterdb` | có |
| Chỉ soát tài liệu | `bun run truyvet` | có |
| Hồi quy RLS trên DB thật (cần Internet) | `bun run test:sec` | **không** — cần mạng, để `kiem` không đỏ oan trên máy offline |
| Ma trận quyền 5 vai (cần quyền SQL) | dán `bot/tests/vai-tro.sql` vào SQL Editor | không |
| Soát trôi migration DB ↔ repo (cần khoá) | `node scripts/soat-migration.mjs` | không |
| Sinh lại ảnh chụp schema (cần khoá) | gọi RPC `xuat_schema()` — lệnh ở `CLAUDE.md §6` | không |
| Soát tài liệu chi tiết hơn (agent) | gọi agent `soat-truy-vet` |
| Review diff đụng `docs/` | gọi agent `reviewer` |

Cùng một lệnh cho người và cho CI (`package.json` là nguồn duy nhất) — không thì
"máy xanh, máy tao đỏ" và không ai biết bên nào đúng.
