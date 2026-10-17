# Chạy bridge Zalo trên VPS (FR-152 e — 04/09/2026)

Bridge là mắt xích duy nhất của cả hệ thống **không** chạy trên Supabase/Vercel:
nó phải sống trên một máy có Node, giữ session Zalo của acc clone. Chạy trên
máy local là chết theo máy local (sự cố 27/08 → 04/09/2026: bridge im 8 ngày,
kênh Zalo bằng 0, 117 lời cảnh báo không gửi được vì chính chúng đi qua bridge).
VPS nhỏ nhất là đủ (1 vCPU, 1 GB, Ubuntu 22.04/24.04).

## 0. Cách nhanh — một lệnh (07/09/2026, sửa QR 08/09)

`cai-vps.sh` gói mục 1, 2, 4 dưới đây, chạy lại được, không in secret:

```bash
curl -fsSL https://raw.githubusercontent.com/quang507/Nhadat.cc/main/bot/bridge-zca/cai-vps.sh -o cai-vps.sh
sudo BRIDGE_SECRET='<giá trị trong Supabase → Vault → BRIDGE_SECRET>' bash cai-vps.sh
```

Cần bản trên một nhánh chưa merge thì thêm `NHANH=<tên nhánh>` trước `bash`
(và tải `cai-vps.sh` từ đúng nhánh đó). Xong nó bật service ngay; chưa có
session Zalo thì service đứng chờ quét QR — link ảnh QR nằm trong log (mục 3).
Đổi máy thì chạy lại y vậy trên máy mới, rồi quét QR lại.

### 0b. Lười gõ: để Claude Code làm qua SSH

Claude Code desktop → menu chọn máy (cạnh ô nhập) → **SSH → Add SSH connection**
→ host `<ip VPS>`, user `root`, mật khẩu root. Phiên mới mở ra chạy NGAY TRÊN
VPS; dán cho nó câu: *"Chạy bot/bridge-zca/VPS.md §0 (nhánh main) rồi đọc
journalctl lấy link QR cho tôi"*. Nó sẽ hỏi `BRIDGE_SECRET` — giá trị đó đi vào
transcript của phiên, chấp nhận được thì dán, không thì tự gõ dòng `.env` (mục 2).
Bước quét QR (mục 3) vẫn là điện thoại của người.

## 1. Chuẩn bị máy (một lần)

```bash
# Node 20+ (zca-js cần ESM + fetch)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs git tmux
sudo useradd -m -s /bin/bash nhadat
sudo mkdir -p /opt/nhadat && sudo chown nhadat:nhadat /opt/nhadat
sudo -iu nhadat
git clone https://github.com/quang507/Nhadat.cc.git /opt/nhadat   # repo public
cd /opt/nhadat/bot/bridge-zca && npm init -y >/dev/null && npm i zca-js
```

## 2. Bí mật

`bot/bridge-zca/.env` (đã trong `.gitignore`), đúng một dòng:

```
BRIDGE_SECRET=<giá trị trong Supabase → Project Settings → Vault → BRIDGE_SECRET>
```

Dán trần, không nháy, không ngoặc nhọn. Sai một ký tự là mọi lượt gọi 401/403
và sổ lỗi ghi "bridge secret sai".

## 3. Quét QR lần đầu (bắt buộc làm tay — điện thoại)

**Từ 11/09 (FR-203): mở `/admin` → ô *Zalo clone* — mã QR hiện ngay đó**, tự đổi
khi hết hạn, quét xong ô chuyển *Đã đăng nhập*. Không cần ssh. Cách dưới đây
giữ làm đường dự phòng khi web hoặc mạng tới Supabase có chuyện.

zca-js **không in QR ra terminal** (nó ghi `qr.png` — tài liệu trước 08/09 nói
sai). Bridge nhận ảnh QR qua callback và phát tạm qua http ở một đường dẫn có
token ngẫu nhiên; đăng nhập xong là đóng.

```bash
journalctl -u nhadat-bridge -n 30 --no-pager      # tìm dòng "▶ QUÉT QR"
# → http://<ip>:8787/qr-<token>.png — mở trên điện thoại hoặc trình duyệt
```

Mở Zalo trên điện thoại **bằng acc clone** (không dùng acc chính — zca-js là API
không chính thức, Zalo có thể khoá), biểu tượng QR ở thanh tìm kiếm → quét ảnh
đó. Log hiện "Bridge sẵn sàng" là session đã lưu vào `zalo-session.json`, service
tự chạy tiếp. QR hết hạn (100 giây) thì bridge gọi `actions.retry()` sinh mã mới
ở cùng link — tải lại trang. (Trước 11/09 bridge chỉ in chữ "đang sinh mã mới"
rồi đứng im: zca-js 2.x có callback thì KHÔNG tự sinh lại.)
Không mở được link → mở cổng 8787 ở Firewall của nhà cung cấp, hoặc
`scp root@<ip>:/opt/nhadat/bot/bridge-zca/qr.png .` rồi mở file. Đổi cổng bằng
`QR_PORT` trong `.env`. Chạy tay không qua service (`node index.mjs`) cũng in
đúng dòng đó.

## 4. Bật thành service

```bash
sudo cp /opt/nhadat/bot/bridge-zca/nhadat-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now nhadat-bridge
journalctl -u nhadat-bridge -f       # phải thấy nhịp kéo escalation-feed mỗi 60 s–5 phút
```

Kiểm từ phía DB (Supabase SQL editor): `select * from bot_health where who = 'bridge-zca'`
— cột `at` phải nhích trong 15 phút. Trang `/admin` không còn dòng "bridge-zca im".

## 5. Khi session Zalo hết hạn

Từ 11/09 bridge TỰ nhận ra: lỗi `zpw_sek` (lúc khởi động, lúc gửi, lúc kéo
việc) → cất phiên sang `zalo-session.het-han.json`, thoát, systemd dựng lại vào
luồng QR, và mã QR hiện trên `/admin`. Muốn đổi acc hay ép quét lại thì bấm
*Đăng nhập lại* ở ô đó (bridge nhận ở lượt kéo việc kế tiếp, ≤ 5 phút).
Log vẫn hiện "Session cũ hết hạn — quét QR lại" rồi dòng "▶ QUÉT QR" với link mới.
Làm lại mục 3, không cần dừng service. Cảnh báo "bridge-zca đang im" sẽ tới
điện thoại qua ntfy (mục 6) sau 15 phút.

### 5b. KHÔNG mở Zalo Web / Zalo PC bằng acc clone (10/10/2026)

Bridge là một phiên "Zalo Web". Ai mở Zalo Web hay Zalo PC bằng **chính acc clone** thì Zalo đá phiên của bridge (mã 3000
"Another connection is opened") — bot thôi nghe tin. Trước 10/10 bridge không biết mình bị đá: tai nghe chết, vòng kéo việc
vẫn điểm danh nên /admin vẫn báo "sống" (acc clone im từ 09/10 10:39). Nay bridge báo ngay lên ô *Zalo clone* ở /admin
("acc clone đang mở ở Zalo Web / Zalo PC…"), chờ 2 phút rồi tự dựng lại — dựng lại sẽ đá phiên Zalo Web kia.
Người trong nhóm trả lời khách bằng **app Zalo trên điện thoại** đăng nhập acc clone (không đụng phiên bridge), bấm
**Giữ khách** ở /admin/tin-nhan để bot im với khách đó, xong bấm **Trả bot**. Gõ tay từ acc clone mà không bấm Giữ khách thì
bot tự nhường 30 phút (FR-141).

Mất kết nối vì lý do khác (mạng chớp, Zalo cắt) thì zca-js tự thử lại (`retryOnClose`); hết lượt thử thì bridge thoát và
systemd dựng lại bằng phiên đã lưu — không cần quét QR trừ khi phiên đã chết.

## 6. Cảnh báo tới điện thoại không qua bridge

Migration `20260904a` dựng kênh **ntfy.sh**: nhịp kiểm 15 phút của DB gọi thẳng
`https://ntfy.sh/<topic>` khi có lỗi mới hoặc bridge im — không đi qua bridge,
không cần token. Cài app ntfy (Android/iOS) hoặc mở `https://ntfy.sh/<topic>`
trên trình duyệt, đăng ký đúng tên topic trong `app_config` khoá `ntfy_topic`
(đọc bằng SQL editor). Tên topic ngẫu nhiên 24 ký tự — ai biết tên là đọc được,
nên đừng dán nó vào chỗ công khai.

## 7. Cập nhật code bridge

```bash
sudo -iu nhadat bash -c 'cd /opt/nhadat && git pull' && sudo systemctl restart nhadat-bridge
```

**Mỗi lần merge `main` là phải kéo ở đây** (chủ dự án 09/09/2026: một lần sửa
phải đồng bộ đủ ba nơi — OneDrive, GitHub, VPS). Chỉ restart service khi
`bot/bridge-zca/` có thay đổi; migration và edge function không chạy trên VPS.

Bẫy 09/09/2026: `git pull` báo `cannot open .git/FETCH_HEAD: Permission denied`
vì ai đó đã chạy `git` bằng **root** một lần, để lại file thuộc root trong
`.git/`. Sửa: `sudo chown -R nhadat:nhadat /opt/nhadat` rồi pull lại bằng
`nhadat`. Từ đây trở đi đừng chạy `git` trong `/opt/nhadat` bằng root.

## 8. Sao lưu — đã bỏ (11/09/2026)

Chủ dự án bỏ toàn bộ sao lưu; `scripts/sao-luu.mjs` không còn trong repo.
Soát trên VPS 11/09/2026: crontab của `root` và `nhadat` đều trống,
`/etc/cron.d` không có dòng nào của nhadat, không có systemd timer,
`/home/nhadat/.nhadat-backup.env` không tồn tại. Chỉ còn file `sao-luu.mjs`
nằm trong các bản checkout cũ (`/opt/nhadat`, `/root/work/…`) — không gì gọi
tới. Sau này thấy lại cron `sao-luu.mjs` thì xoá bằng `crontab -e`.
