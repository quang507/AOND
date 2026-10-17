#!/usr/bin/env bash
# Đóng gói chat-reply (Deno) thành một file Node rồi bơm kịch bản qua handler thật.
# Cần: bun (đóng gói + chạy) và `bun install` trong thư mục này một lần. Toàn bộ bằng bun, không cần Node.
set -euo pipefail
cd "$(dirname "$0")"
SRC=../../supabase/functions/chat-reply/index.ts
bun build "$SRC" --target=node --external 'npm:*' --outfile=chat-reply.bundle.mjs >/dev/null
# Deno dùng specifier `npm:`; Node không hiểu. Đổi sang gói thật / gói giả.
sed -i.bak \
  -e 's#"npm:@supabase/supabase-js@2"#"./mock-supabase.mjs"#g' \
  -e 's#"npm:@anthropic-ai/sdk/helpers/zod"#"@anthropic-ai/sdk/helpers/zod"#g' \
  -e 's#"npm:@anthropic-ai/sdk"#"./mock-anthropic.mjs"#g' \
  -e 's#"npm:zod@4"#"zod"#g' chat-reply.bundle.mjs
rm -f chat-reply.bundle.mjs.bak
bun run.mjs

# zalo-webhook — cửa vào từ Internet (SEC-01, FR-166). Đóng gói riêng vì nó là
# hàm khác, dùng chung bộ mock.
WSRC=../../supabase/functions/zalo-webhook/index.ts
bun build "$WSRC" --target=node --external 'npm:*' --outfile=zalo-webhook.bundle.mjs >/dev/null
sed -i.bak \
  -e 's#"npm:@supabase/supabase-js@2"#"./mock-supabase.mjs"#g' \
  -e 's#"npm:@anthropic-ai/sdk/helpers/zod"#"@anthropic-ai/sdk/helpers/zod"#g' \
  -e 's#"npm:@anthropic-ai/sdk"#"./mock-anthropic.mjs"#g' \
  -e 's#"npm:zod@4"#"zod"#g' zalo-webhook.bundle.mjs
rm -f zalo-webhook.bundle.mjs.bak
bun webhook.mjs
# Ca "không có BRIDGE_SECRET" phải chạy TIẾN TRÌNH RIÊNG: `napCauHinh` nhớ tạm
# cấu hình 60 giây ở tầng module, nên trong run.mjs không dựng lại được cảnh
# `gate = null` sau lượt gọi đầu. Xem đầu file cong-thieu-bi-mat.mjs.
bun cong-thieu-bi-mat.mjs
