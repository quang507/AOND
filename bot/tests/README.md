# bot/tests — test hồi quy

18/10/2026 (docs/07 SRS-5.1zzzzzzz46): bot TypeScript (`chat-reply`, `zalo-webhook`…) đã gỡ; bộ não là lõi Python
`src/aioi/` (bộ pytest `tests/` gỡ 13/11/2026, SRS-5.1zzzzzzz469). Thư mục này chỉ còn bài kiểm code ĐANG SỐNG: web (`lib/`),
ba edge function (`escalation-feed`, `geocode-listings`, `media-cleanup`), `_shared/` còn lại, script vận hành và DB.
Các bộ cũ (`e2e/run.mjs`, `webhook.mjs`, `giong/`, `do-boc/`, `mo-phong/`, `phat-lai/`, `chat/`) đã xoá — xem lịch sử git.

## Chạy cái gì, bằng lệnh nào

Đừng gõ lệnh rời. Người và CI dùng chung script trong `package.json`.

```bash
bun run kiem       # kiểm tra toàn bộ, khi cần (không bắt buộc — CLAUDE.md §7.1): kieu (tsc) → kieu:bot (deno) → build → test:bot → test:rohang → truyvet
bun run test:sql   # trigger / hàm SQL thật trên Postgres tạm (bot/tests/sql/chay.sh)
bun run test:sec   # TS-SEC thật, DB thật — KHÔNG nằm trong `kiem`, cần Internet
```

`test:bot` liệt kê từng file trong `package.json`. Bảng phường / phường cũ thật cho bài kiểm nạp qua `lib/phuong-that.mjs`
(mock e2e TypeScript gỡ 19/10/2026). Hỏng thì thoát với mã khác 0. **Thoát 2 của `test:sec` / `test:sql` nghĩa là "chưa kiểm được", không phải "đạt".**
