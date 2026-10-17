# Bộ đo bóc tách (TS-DO-BOC-01)

Đo bot ghi **đúng bao nhiêu phần trăm** trên một bộ câu cố định, để mỗi lần đổi code hay prompt biết con số
tăng hay tụt. Nó không thay e2e: e2e giữ những lỗi đã biết khỏi tái phát, còn bộ này cho con số tổng.

- `ca.jsonl`: 110 ca, 9 nhóm. Mỗi ca là chuỗi tin nhắn của **một** người (Zalo mới), kèm kỳ vọng: số tin bán,
  và từng tin có loại, quận, phường, giá, diện tích, phòng ngủ, pháp lý, số tầng, ngang; ca mua thì có hồ sơ mua.
  Kỳ vọng ghi thứ một môi giới giỏi sẽ ghi, **không** chép thứ bot đang làm. Trường mang giá trị `null` nghĩa là
  bot phải để TRỐNG (không được bịa, không được ghi nhầm sang từ căn khác).
- `cham.mjs`: hàm chấm thuần. Ghép cặp tin kỳ vọng với tin thật, rồi chấm từng trường.
  `bun bot/tests/do-boc/cham.mjs --tu-kiem`.
- `chay.mjs`: trình chạy, có ba đường, cả ba chấm chung một hàm.
- `nen.json`: bản nền của chế độ luật. `--nen` đỏ khi có ca từng đạt nay rớt, hoặc tổng số trường đúng giảm.

## Ba đường chạy

| Đường | Lệnh | Đo gì | Tốn |
|---|---|---|---|
| Luật một mình | `bun bot/tests/do-boc/chay.mjs` | tầng tiền định trên DB giả (model giả trả rỗng, như khi AI chết) | 0 đồng, khoảng 1 phút |
| Model thật | `bun bot/tests/do-boc/chay.mjs --that` | luật cộng AI trên DB giả; cần `ANTHROPIC_API_KEY` (lấy từ env hoặc `scripts/.env`) | token Haiku |
| Production | bắn thật rồi chạy `--tu-trang-thai` | bot đang chạy thật, DB thật (trigger, hàm SQL, prompt trong `bot_prompts`) | token Haiku; tạo dữ liệu thử, đo xong phải dọn |

Số đo của DB giả và DB thật có thể lệch nhau: mock chỉ mô phỏng một phần trigger và hàm SQL. Muốn kết luận
thì lấy số production.

## Đo trên production

**Kỷ luật tiền (04/10/2026, chủ dự án):** mỗi tin bắn lên production ≈ 3 lượt AI (bóc tách + ý-lượt + trả lời), cả bộ ≈ 450
lượt (149 tin × 3, chưa kể hỏi bù — workflow in số này trước khi bắn) — đây là credit thật, còn bộ e2e offline (912 ca) thì miễn phí. Nên: chỉ chạy `do-boc.yml` khi PR đụng bóc tách, và chọn
**một nhóm** liên quan (`nhom=ban1,sua…`); để trống `nhom` là chạy cả bộ, workflow bắt gõ đúng chữ `ca bo` vào ô `du_bo`
và in ước lượng số lượt trước khi bắn.

1. Bắn từng lượt cho các Zalo thử `do-<id ca viết thường>` qua `net.http_post` tới `chat-reply`, kênh
   `zalo_personal_test`, giống cách bắn thử ở CLAUDE.md. Mỗi lượt phải đợi **mọi** người trả lời xong rồi mới
   bắn lượt kế: bot chỉ xử lý một lượt cho mỗi người tại một thời điểm.
   - Bắn mẻ nhỏ, khoảng 20 người một lần. Bắn 110 cùng lúc thì `pg_net` báo hết giờ, dù bot vẫn trả lời đủ
     (23/09: 41/110 lượt báo timeout, cả 110 đều có trả lời trong `messages`). Muốn biết đã xong chưa thì
     đếm tin `sender='bot'` trong `messages`, đừng đếm `net._http_response`.
2. Đổ trạng thái ra JSON:

```sql
select jsonb_object_agg(upper(substr(u.z, 4)), jsonb_build_object(
  'tin', coalesce((select jsonb_agg(jsonb_build_object('code', l.code, 'property_type', l.property_type,
      'district', l.district, 'ward', l.ward, 'price_vnd', l.price_vnd, 'area_m2', l.area_m2, 'built_area_m2', l.built_area_m2,
      'bedrooms', l.bedrooms, 'legal_status', l.legal_status, 'floors', l.floors,
      'frontage_m', l.frontage_m, 'deal', l.deal, 'status', l.status) order by l.created_at)
    from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = u.z), '[]'::jsonb),
  'mua', (select b.preferences from buyers b where b.zalo_user_id = u.z)))
from (select zalo_user_id z from sellers where zalo_user_id like 'do-%'
      union select zalo_user_id from buyers where zalo_user_id like 'do-%') u;
```

3. Lưu kết quả vào `train/out/do-boc/production.json` (thư mục này đã gitignore), rồi chạy
   `bun bot/tests/do-boc/chay.mjs --tu-trang-thai train/out/do-boc/production.json`.
4. Dọn dữ liệu thử:
   `select public.reset_nguoi_test(z) from (select zalo_user_id z from sellers where zalo_user_id like 'do-%' union select zalo_user_id from buyers where zalo_user_id like 'do-%') u;`

## Kết quả đã đo

| Ngày | Bản bot | Đường | Ca đạt | Trường đúng | Ghi chú |
|---|---|---|---|---|---|
| 23/09/2026 | main sau #251 | luật một mình | 52/110 (47%) | 480/572 (84%) | mua 0/15: hồ sơ mua do AI đọc; tắt AI thì trống |
| 23/09/2026 | main sau #251 | production | 104/110 (94,5%) | 563/572 (98,4%) | 6 ca bắn lại mẻ nhỏ vì quá tải (xem dưới) |
| 03/10/2026 | main sau #424 | production, phía bán (bỏ nhóm `mua`, 95 ca) | 90/95 (94,7%) | 517/523 (98,9%) | chạy bằng workflow `do-boc.yml`; 5 ca rớt ở dưới |

Lần đo production đầu tiên bắn 110 người cùng lúc. DB gói Free bị huỷ vì quá giờ ở `match_projects` 20 lần và ở
`tao tin rao` 5 lần, nên 5 người nhận câu "Chưa có tin nào được lưu" dù đã nhắn đủ giá. Sáu ca có bằng chứng dính
tải (C06, S02, S10, X03, X04, R09) được xoá rồi bắn lại mẻ nhỏ, và cả sáu đều qua. Mấy ca rớt vì lý do khác thì
KHÔNG bắn lại. Điểm yếu này có thật: tạo tin hỏng thì bot không thử lại, mà hỏi lại khách đúng những gì khách vừa nói.

5 ca rớt ở lượt đo 03/10 (phía bán): N06 căn 2 Gò Vấp mang quận Tân Bình của căn 1; S01 căn 2 thiếu quận "Đồng Nai";
S07 thiếu số tầng; R02 thiếu diện tích 76m²; X04 (vừa bán vừa mua) mất hồ sơ mua (khu vực, ngân sách). Sổ lỗi có 20 dòng
`match_projects(rao)` — DB gói Free quá giờ khi 20 người tạo tin cùng lúc.

6 ca còn rớt ở production lượt 23/09 (lỗi thật):
- T09: giá theo m² (15 triệu/m² × 100m²) bị ghi thành 15 triệu.
- N06: nhà 2 ở Gò Vấp mang quận Tân Bình của nhà 1.
- S03: "căn nhà thì 7 tỷ" ghi vào lô đất; lô đất "chưa rõ loại".
- S06: "còn lô 1000m² ở Củ Chi" có chữ "lô" nhưng không có chữ "đất", nên chưa rõ loại.
- C05: "giảm còn 7 tỷ 8" không đổi giá.
- X04: một câu vừa bán căn hộ vừa mua nhà thì mất phần mua.

## Thêm ca

Thêm một dòng vào `ca.jsonl` với `id` chưa dùng, `nhom`, `luot` (mảng tin nhắn), `ky_vong` và `nguon`.
Câu lấy từ tin thật thì phải đổi số nhà, tên người và SĐT: repo đang PUBLIC (CLAUDE.md §5).
Thêm ca làm bản nền đổi theo. Chạy chế độ luật rồi cập nhật `nen.json` trong cùng PR.
