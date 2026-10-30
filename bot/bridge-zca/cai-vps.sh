#!/usr/bin/env bash
# cai-vps.sh — dựng bridge Zalo trên VPS Ubuntu 22.04/24.04 bằng MỘT lệnh.
# Gói đúng các bước 1, 2, 4 của VPS.md; bước 3 (quét QR) bắt buộc làm tay.
#
# Chạy trên VPS với quyền root (hoặc user có sudo):
#     curl -fsSL https://raw.githubusercontent.com/quang507/AOND/main/bot/bridge-zca/cai-vps.sh -o cai-vps.sh
#     sudo BRIDGE_SECRET='<giá trị trong Supabase → Vault → BRIDGE_SECRET>' bash cai-vps.sh
#
# Chạy lại được: máy đã có node/user/repo thì bỏ qua, chỉ `git pull` + `npm i`.
# Không có BRIDGE_SECRET trong env thì script hỏi (nhập không hiện chữ).
# Script KHÔNG in secret ra màn hình và KHÔNG ghi vào log.
set -euo pipefail

# 18/10/2026: code nằm ở repo AOND (gộp từ Nhadat.cc 17/10) — Nhadat.cc sắp xoá, máy cũ tự đổi origin ở bước 2.
REPO=https://github.com/quang507/AOND.git
# Nhánh lấy code (mặc định main). Cần chạy bản chưa merge thì NHANH=<tên nhánh>.
NHANH="${NHANH:-main}"
DIR=/opt/nhadat
BR=$DIR/bot/bridge-zca

buoc() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
xong() { printf '\033[32m✓ %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Chạy bằng root: sudo bash cai-vps.sh"; exit 1; }

buoc "1/5 Node 20 + git + tmux"
if command -v node >/dev/null && [ "$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')" -ge 20 ]; then
  xong "node $(node -v) đã có"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  xong "node $(node -v)"
fi
apt-get install -y -qq git tmux >/dev/null
command -v node >/dev/null && [ -x /usr/bin/node ] || ln -sf "$(command -v node)" /usr/bin/node

# 19/10/2026 (SRS-5.1zzzzzzz76): dấu vân code bridge TRƯỚC khi lấy code mới — bước 5 chỉ khởi động lại bridge khi nó đổi. Bridge tắt là
# acc Zalo rời mạng; tin khách tới trong lúc đó không qua bridge. Lượt cài chỉ đổi lõi Python không có lý do tắt nó.
van_bridge() { cat "$BR/index.mjs" "$BR/nhadat-bridge.service" "$BR/node_modules/zca-js/package.json" 2>/dev/null | sha256sum; }
# SRS-5.1zzzzzzz210: số tư vấn người mua — cùng code, thêm file unit riêng.
# `|| true`: lượt đầu file unit số tư vấn chưa có trên máy (code mới kéo về ở bước 2) — `cat` lỗi + `set -o pipefail` từng làm script dừng
# lặng lẽ ngay sau bước 1 (lượt cài 40303125818 và 40303450140, 26/10).
van_bridge_tv() { { cat "$BR/index.mjs" "$BR/nhadat-bridge-tu-van.service" "$BR/node_modules/zca-js/package.json" 2>/dev/null || true; } | sha256sum; }
VAN_TRUOC=$(van_bridge)
VAN_TRUOC_TV=$(van_bridge_tv)

buoc "2/5 user nhadat + $DIR"
id nhadat >/dev/null 2>&1 || useradd -m -s /bin/bash nhadat
mkdir -p "$DIR" && chown nhadat:nhadat "$DIR"
if [ -d "$DIR/.git" ]; then
  # Máy cài từ Nhadat.cc: trỏ origin sang AOND rồi lấy ĐÚNG bản của nhánh (`reset --hard`, không `pull --ff-only` — lịch sử hai
  # repo không nối nhau). File không track (.env, zalo-session.json) không bị đụng.
  # 18/10/2026: `checkout -f` — lượt cài đầu dừng ở "untracked .gitattributes would be overwritten" (file AOND track mà máy cũ
  # không) và vì chuỗi `a && b` không kích `set -e`, script chạy tiếp, khởi động lại bridge bằng CODE CŨ và vẫn báo xanh.
  # Mỗi lệnh git một dòng để hỏng là dừng.
  # Lượt thứ hai: "insufficient permission for adding an object to .git/objects" — có lần git chạy bằng root trong thư mục
  # này, để lại file của root. Trả cả cây về user nhadat trước khi git chạy dưới tên nó.
  chown -R nhadat:nhadat "$DIR"
  sudo -u nhadat git -C "$DIR" remote set-url origin "$REPO"
  sudo -u nhadat git -C "$DIR" fetch -q origin "$NHANH"
  sudo -u nhadat git -C "$DIR" checkout -q -f -B "$NHANH" FETCH_HEAD
  sudo -u nhadat git -C "$DIR" reset -q --hard FETCH_HEAD
  xong "repo đã có, nhánh $NHANH ($(sudo -u nhadat git -C "$DIR" rev-parse --short HEAD)) từ $REPO"
else
  sudo -u nhadat git clone -q -b "$NHANH" "$REPO" "$DIR" && xong "clone xong (nhánh $NHANH)"
fi

buoc "3/5 npm i zca-js@2.2.0"
sudo -u nhadat bash -c "cd '$BR' && { [ -f package.json ] || npm init -y >/dev/null; } && npm i --no-audit --no-fund zca-js@2.2.0 >/dev/null"   # ghim (SRS-5.1zzzzzzz177): bản mới đổi API gửi ảnh mà không ai thấy
xong "zca-js $(sudo -u nhadat bash -c "cd '$BR' && node -p 'require(\"zca-js/package.json\").version'" 2>/dev/null || echo '?')"

buoc "4/5 BRIDGE_SECRET → $BR/.env"
if [ -f "$BR/.env" ] && grep -qE '^BRIDGE_SECRET=.+' "$BR/.env" && [ -z "${BRIDGE_SECRET:-}" ]; then
  xong ".env đã có secret, giữ nguyên"
else
  if [ -z "${BRIDGE_SECRET:-}" ]; then
    read -r -s -p "Dán BRIDGE_SECRET (Supabase → Project Settings → Vault): " BRIDGE_SECRET; echo
  fi
  # bỏ nháy/ngoặc nhọn nếu lỡ dán kèm (VPS.md §2)
  BRIDGE_SECRET="${BRIDGE_SECRET#\"}"; BRIDGE_SECRET="${BRIDGE_SECRET%\"}"
  BRIDGE_SECRET="${BRIDGE_SECRET#<}";  BRIDGE_SECRET="${BRIDGE_SECRET%>}"
  [ -n "$BRIDGE_SECRET" ] || { echo "BRIDGE_SECRET rỗng — dừng."; exit 1; }
  umask 077
  printf 'BRIDGE_SECRET=%s\n' "$BRIDGE_SECRET" > "$BR/.env"
  chown nhadat:nhadat "$BR/.env"; chmod 600 "$BR/.env"
  xong ".env ghi xong (chmod 600), ${#BRIDGE_SECRET} ký tự"
fi

# 18/10/2026: bộ não là lõi Python (`aond-core.service`, /opt/aond_core — không phải bản git, dựng tay). Trước đây không có đường
# nào đưa code repo lên đó, nên bản vá lõi nằm trong repo mà VPS vẫn chạy bản cũ. Nay mỗi lượt cài chép `src/aioi` của repo sang,
# nén bản cũ vào /root trước (khôi phục: tar -xzf … -C /opt/aond_core/src), khởi động lại và đòi /health trả lời.
if [ -d /opt/aond_core/src/aioi ]; then
  buoc "lõi Python aond-core ← $DIR/src/aioi"
  LUU="/root/aond_core-aioi-$(date +%Y%m%d%H%M%S).tgz"
  tar -czf "$LUU" -C /opt/aond_core/src aioi
  ls -1t /root/aond_core-aioi-*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f   # giữ 5 bản lõi cũ gần nhất
  # 19/10/2026: chép GƯƠNG — tệp đã gỡ khỏi repo cũng bị gỡ trên VPS (bản `cp -r` cũ để lại sharepoint.py, vector_store.py,
  # llm/gemini.py sau khi repo xoá). Bản cũ vẫn nằm trong $LUU.
  rm -rf /opt/aond_core/src/aioi.moi
  cp -r --no-preserve=ownership "$DIR/src/aioi" /opt/aond_core/src/aioi.moi
  find /opt/aond_core/src/aioi.moi -name __pycache__ -type d -prune -exec rm -rf {} +
  rm -rf /opt/aond_core/src/aioi && mv /opt/aond_core/src/aioi.moi /opt/aond_core/src/aioi
  # 19/10/2026 (SRS-5.1zzzzzzz60): dọn tàn dư bản dựng tay — kho SharePoint giả, bộ test cũ, backup.py + bản sao SQLite của nó, tệp
  # .env.bak-gemini. Không thứ nào lõi đọc. Nén vào /root (chmod 600) trước khi xoá, lượt sau không còn gì thì bỏ qua.
  DON=(sharepoint_store tests .pytest_cache backup.py backup.log backups .env.bak-gemini aioi.db.bak_before_test_reset)
  CO=(); for f in "${DON[@]}"; do [ -e "/opt/aond_core/$f" ] && CO+=("$f"); done
  if [ ${#CO[@]} -gt 0 ]; then
    CAT="/root/aond_core-don-$(date +%Y%m%d%H%M%S).tgz"
    tar -czf "$CAT" -C /opt/aond_core "${CO[@]}"
    chmod 600 "$CAT"
    (cd /opt/aond_core && rm -rf -- "${CO[@]}")
    xong "dọn /opt/aond_core: ${CO[*]} (cất ở $CAT)"
  fi
  if crontab -l 2>/dev/null | grep -q 'aond_core/backup'; then
    crontab -l | grep -v 'aond_core/backup' | crontab -
    xong "gỡ lịch backup.py khỏi crontab root"
  fi
  grep -rls 'aond_core/backup' /etc/cron.d /etc/crontab /etc/systemd/system 2>/dev/null | sed 's/^/  còn nhắc backup.py: /' || true
  # 22/10/2026 (SRS-5.1zzzzzzz134): khoá Gemini chat MỘT NGUỒN = Vault (GEMINI_API_KEY, _2, _3, _4). Workflow đọc Vault, đưa qua stdin
  # thành GEMINI_API_KEYS_MOI; ở đây ghi đè đúng dòng GEMINI_API_KEYS trong .env lõi (dòng GEMINI_API_KEY giữ nguyên — lõi gộp cả hai,
  # bỏ trùng, `config._ds_khoa`). Không có biến (chạy tay) thì .env giữ nguyên. Không in giá trị khoá.
  if [ -n "${GEMINI_API_KEYS_MOI:-}" ] && [ -f /opt/aond_core/.env ]; then
    umask 077
    grep -vE '^GEMINI_API_KEYS=' /opt/aond_core/.env > /opt/aond_core/.env.moi || true
    printf 'GEMINI_API_KEYS=%s\n' "$GEMINI_API_KEYS_MOI" >> /opt/aond_core/.env.moi
    chown --reference=/opt/aond_core/.env /opt/aond_core/.env.moi; chmod 600 /opt/aond_core/.env.moi
    mv /opt/aond_core/.env.moi /opt/aond_core/.env
    xong "GEMINI_API_KEYS trong .env lõi ← Vault ($(awk -F, '{print NF}' <<<"$GEMINI_API_KEYS_MOI") khoá)"
  fi
  # SRS-5.1zzzzzzz135: khoá Claude cũng từ Vault. Khoá trong .env lõi hết số dư mà Vault đã có khoá còn dùng được → ghi đè dòng ANTHROPIC_API_KEY.
  if [ -n "${ANTHROPIC_KEY_MOI:-}" ] && [ -f /opt/aond_core/.env ]; then
    umask 077
    grep -vE '^ANTHROPIC_API_KEY=' /opt/aond_core/.env > /opt/aond_core/.env.moi || true
    printf 'ANTHROPIC_API_KEY=%s\n' "$ANTHROPIC_KEY_MOI" >> /opt/aond_core/.env.moi
    chown --reference=/opt/aond_core/.env /opt/aond_core/.env.moi; chmod 600 /opt/aond_core/.env.moi
    mv /opt/aond_core/.env.moi /opt/aond_core/.env
    xong "ANTHROPIC_API_KEY trong .env lõi ← Vault"
  fi
  # 28/10/2026 (SRS-5.1zzzzzzz235, chủ dự án: "đổi model chạy thật đang chạy cho khách là sonnet đi … để sonnet 5.5 đi, khi nào cần thì
  # thôi đổi lại"): model CHAT của lõi một nguồn ở dòng dưới — đổi lại Haiku thì sửa đúng dòng này (vd claude-haiku-5-5) rồi chạy cai-vps.
  # Chỉ lượt chat / trả lời; bóc tách (AIOI_EXTRACT_MODEL) và đọc ảnh giữ nguyên.
  # SRS-5.1zzzzzzz308: chủ dự án 30/10 chuyển Haiku ("dùng haiku hết luôn cũng dc") rồi cùng ngày quay lại Sonnet ("nếu chạy vậy thì ko tốn nhiều
  # đâu, chuyển sang sonnet 5.5 luôn" — kèm hướng agent công cụ). Bộ chấm 27 kịch bản: Sonnet 288/289, Haiku 284–288, Sonnet đắt ~10 lần.
  MODEL_CHAT="claude-sonnet-5-5"
  # SRS-5.1zzzzzzz239 (chủ dự án 28/10/2026: "nếu bắn product đổi sang key gemini bắn từ từ"): ID thử (`la_id_thu`, các ô ban-thu-*) gọi
  # model THẲNG Gemini, không tốn tiền Claude. Muốn bắn thử bằng đúng model khách thật thì đổi dòng này thành "tat" rồi chạy cai-vps.
  # 28/10/2026 (SRS-5.1zzzzzzz243, chủ dự án: "đổi thành claude sonnet 5.5 xem nó có nịnh tốt ko"): bắn thử bằng Sonnet 5.5 như khách thật
  # (bóc tách Haiku như khách thật). Quay lại Gemini cho đỡ tiền thì đổi thành "gemini".
  MODEL_CHAT_THU="claude-sonnet-5-5"
  # SRS-5.1zzzzzzz246 (chủ dự án 28/10/2026: "bạn thử tắt công cụ cố định xem"): "tat" = lời trả khách là chữ thường như bản anh Luận;
  # "bat" = lại ép công cụ hai ô gui_khach (tự soát + lời gửi, SRS-76). Áp cho mọi khách, kể cả ID thử.
  CONG_CU_GUI_KHACH="tat"
  # SRS-5.1zzzzzzz252 (chủ dự án 28/10/2026: "vẫn trong giai đoạn test có dòng $ đã trích xuất nữa đi"): "bat" = sau mỗi lượt gửi thêm tin
  # phụ "$$$$$ Đã trích xuất…" cho MỌI cuộc chat; chạy với khách thật thì đổi thành "tat" rồi chạy cai-vps.
  DONG_TRICH_XUAT="bat"
  # SRS-5.1zzzzzzz290 (chủ dự án 29/10/2026: "Ok thử … sang kiểu Suy nghĩ -> Chọn công cụ -> Thực thi -> Đánh giá"): lượt trả lời khách MUA có
  # công cụ chỉ đọc (tra căn / dự án), model tự quyết có tra không. "thu" = chỉ ID thử (bắn thử trước); "bat" = mọi khách; "tat" = như cũ.
  AGENT_MUA="bat"
  # SRS-5.1zzzzzzz293 (chủ dự án 29/10/2026: "bớt prompt dài đi, cấu trúc form json ngắn hơn"): lượt Haiku đọc ý khách MUA dùng form gọn (chỉ phần
  # phía mua, ≈ một nửa chữ). "thu" = chỉ ID thử; "bat" = mọi khách; "tat" = form đầy đủ như cũ.
  FORM_MUA_GON="bat"
  # SRS-5.1zzzzzzz303 (chủ dự án 30/10: "prompt bóc tách sao mà dài … ngắn lại dc ko"): lượt đọc ý NGƯỜI BÁN (vai đã rõ) bỏ mục việc khách mua
  # (form −15 % chữ, schema −24 %); đọc ra ý mua thì đọc lại bằng form đầy đủ. "thu" = chỉ ID thử; "bat" = mọi khách; "tat" = form đầy đủ.
  FORM_BAN_GON="bat"
  # SRS-5.1zzzzzzz298 (B2 bước 1, chủ dự án 29/10): soát lời chế độ gọn — luật giọng / lặp chỉ ghi log, tối đa MỘT lần gọi lại model, "Dạ" do code
  # bỏ. "thu" = chỉ ID thử; "bat" = mọi khách; "tat" = như cũ (gọi lại tới 2 lần, mọi luật).
  # SRS-5.1zzzzzzz304: bộ chấm kịch bản (15 kịch bản, Sonnet + Haiku) cho điểm như chế độ cũ, Haiku ít gọi lại hơn → bật cho mọi khách.
  SOAT_GON="bat"
  # SRS-5.1zzzzzzz307 (B2 bước 2, chủ dự án 30/10: "làm nốt b2 nhưng vẫn lưu các hàm để dễ gọi"): lượt viết lời NGƯỜI BÁN không nhét sẵn rổ hàng /
  # bộ nhớ dự án / giá đã gửi — model tự gọi công cụ tra (thân công cụ là hàm khối cũ). "thu" = chỉ ID thử; "bat" = mọi khách; "tat" = như cũ.
  # SRS-5.1zzzzzzz308 (chủ dự án 30/10: "làm đi thử thì trên cli" — thử bằng bộ chấm + chat tay quota CLI thay bắn production): mọi khách.
  AGENT_BAN="bat"
  # SRS-5.1zzzzzzz309 (kế hoạch bước 2): lượt thu thập của người bán viết từ "phiếu lượt" ngắn (giọng + dữ liệu căn + một việc) thay văn xuôi
  # build_chat_system. "thu" = chỉ ID thử; "bat" = mọi khách; "tat" = prompt cũ. Bật mọi khách: bộ chấm 40 kịch bản hai lần đều hơn prompt cũ.
  PHIEU_LUOT="bat"
  # SRS-5.1zzzzzzz310 (kế hoạch bước 3): lượt đọc ý người bán (vai đã rõ, form bán gọn bật) bằng agent gọi công cụ ghi (agent_boc.py) thay form JSON.
  # "thu" = chỉ ID thử; "bat" = mọi khách; "tat" = form cũ.
  AGENT_BOC="thu"
  MODEL_AGENT_BOC=""   # model của vòng agent bóc; trống = MODEL_CHAT
  # SRS-5.1zzzzzzz299 (30/10/2026, Claude hết tiền, Gemini dự phòng chỉ đỡ 1 lượt): model Gemini dự phòng MỘT NGUỒN ở đây → GEMINI_MODEL trong .env
  # lõi. gemini-3.8-flash / gemini-flash-latest quá giờ với khoá miễn phí (đo 30/10); 3.5-flash và 3.1-flash-lite trả lời 8–10 s một lượt.
  MODEL_GEMINI="gemini-3.5-flash,gemini-3.1-flash-lite"
  if [ -f /opt/aond_core/.env ]; then
    umask 077
    grep -vE '^AIOI_(CHAT_MODEL(_THU)?|CONG_CU_GUI_KHACH|DONG_TRICH_XUAT|AGENT_MUA|AGENT_BAN|PHIEU_LUOT|AGENT_BOC(_MODEL)?|FORM_MUA_GON|FORM_BAN_GON|SOAT_GON)=|^GEMINI_MODEL=' /opt/aond_core/.env > /opt/aond_core/.env.moi || true
    printf 'AIOI_CHAT_MODEL=%s\nAIOI_CHAT_MODEL_THU=%s\nAIOI_CONG_CU_GUI_KHACH=%s\nAIOI_DONG_TRICH_XUAT=%s\nAIOI_AGENT_MUA=%s\nAIOI_FORM_MUA_GON=%s\nAIOI_FORM_BAN_GON=%s\nAIOI_SOAT_GON=%s\nAIOI_AGENT_BAN=%s\nAIOI_PHIEU_LUOT=%s\nAIOI_AGENT_BOC=%s\nAIOI_AGENT_BOC_MODEL=%s\nGEMINI_MODEL=%s\n' "$MODEL_CHAT" "$MODEL_CHAT_THU" "$CONG_CU_GUI_KHACH" "$DONG_TRICH_XUAT" "$AGENT_MUA" "$FORM_MUA_GON" "$FORM_BAN_GON" "$SOAT_GON" "$AGENT_BAN" "$PHIEU_LUOT" "$AGENT_BOC" "$MODEL_AGENT_BOC" "$MODEL_GEMINI" >> /opt/aond_core/.env.moi
    chown --reference=/opt/aond_core/.env /opt/aond_core/.env.moi; chmod 600 /opt/aond_core/.env.moi
    mv /opt/aond_core/.env.moi /opt/aond_core/.env
    xong "AIOI_CHAT_MODEL trong .env lõi = $MODEL_CHAT, ID thử = $MODEL_CHAT_THU, công cụ gửi khách = $CONG_CU_GUI_KHACH, dòng trích xuất = $DONG_TRICH_XUAT, agent mua = $AGENT_MUA, form mua gọn = $FORM_MUA_GON, form bán gọn = $FORM_BAN_GON, soát gọn = $SOAT_GON, agent bán = $AGENT_BAN, phiếu lượt = $PHIEU_LUOT, agent bóc = $AGENT_BOC ($MODEL_AGENT_BOC), Gemini dự phòng = $MODEL_GEMINI"
  fi
  systemctl restart aond-core
  for i in $(seq 1 60); do curl -fsS -m 3 http://127.0.0.1:8000/health >/dev/null 2>&1 && break; sleep 1; done
  SUC_KHOE=$(curl -fsS -m 3 http://127.0.0.1:8000/health) || { echo "aond-core không trả /health sau khởi động lại — bản cũ ở $LUU"; exit 1; }
  # /health chỉ báo có / không (provider, model, stt, drive) — không mang giá trị khoá nào.
  xong "aond-core chạy code repo, /health: $SUC_KHOE (bản cũ: $LUU)"
fi

buoc "5/5 systemd nhadat-bridge"
cp "$BR/nhadat-bridge.service" /etc/systemd/system/nhadat-bridge.service
systemctl daemon-reload
systemctl enable nhadat-bridge >/dev/null 2>&1
if [ -f "$BR/zalo-session.json" ] && [ "$(van_bridge)" = "$VAN_TRUOC" ] && systemctl is-active --quiet nhadat-bridge; then
  xong "code bridge không đổi → không khởi động lại (acc Zalo giữ kết nối)"
elif [ -f "$BR/zalo-session.json" ]; then
  systemctl restart nhadat-bridge && xong "đã có zalo-session.json → service đang chạy"
  echo "  Xem log: journalctl -u nhadat-bridge -f"
else
  systemctl restart nhadat-bridge
  xong "service đang chạy và CHỜ QUÉT QR"
  cat <<'HD'

════════════════════════════════════════════════════════════════
CÒN MỘT BƯỚC LÀM TAY: quét QR bằng acc Zalo CLONE (VPS.md §3)

    journalctl -u nhadat-bridge -n 30 --no-pager
    # → có dòng "▶ QUÉT QR" kèm link http://<ip>:8787/qr-<token>.png
    # mở link đó trên điện thoại (hoặc trình duyệt máy tính), Zalo app → QR → quét
    # thấy "Bridge sẵn sàng" trong log là xong; service tự chạy tiếp, không cần làm gì thêm

Không mở được link → mở cổng 8787 ở Firewall của nhà cung cấp, hoặc:
    scp root@<ip>:/opt/nhadat/bot/bridge-zca/qr.png .   (rồi mở file mà quét)
Kiểm từ DB: select * from bot_health where who = 'bridge-zca'  → cột at phải nhích.
════════════════════════════════════════════════════════════════
HD
fi

# SRS-5.1zzzzzzz210 (chủ dự án 26/10/2026: "đặt trên VPS"): bridge thứ hai cho SỐ TƯ VẤN người mua. Chưa có phiên thì service chờ quét QR —
# mã hiện ở thẻ "Zalo tư vấn" trên /admin (dòng bridge_dang_nhap id = 2), KHÔNG in link ra đây (log workflow công khai). Quét bằng acc của
# số tư vấn. Code không đổi và phiên còn thì không khởi động lại (giữ kết nối, như số ký gửi).
buoc "thêm: systemd nhadat-bridge-tu-van (số tư vấn)"
if [ -f "$BR/nhadat-bridge-tu-van.service" ]; then
  cp "$BR/nhadat-bridge-tu-van.service" /etc/systemd/system/nhadat-bridge-tu-van.service
  systemctl daemon-reload
  systemctl enable nhadat-bridge-tu-van >/dev/null 2>&1
  if [ -f "$BR/zalo-session-tu-van.json" ] && [ "$(van_bridge_tv)" = "$VAN_TRUOC_TV" ] && systemctl is-active --quiet nhadat-bridge-tu-van; then
    xong "số tư vấn: code không đổi → không khởi động lại"
  else
    systemctl restart nhadat-bridge-tu-van
    if [ -f "$BR/zalo-session-tu-van.json" ]; then
      xong "số tư vấn: đã có phiên → service đang chạy (journalctl -u nhadat-bridge-tu-van -f)"
    else
      xong "số tư vấn: service đang chạy và CHỜ QUÉT QR — mở /admin, thẻ \"Zalo tư vấn\", quét bằng acc Zalo của số tư vấn"
    fi
  fi
fi
