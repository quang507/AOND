#!/usr/bin/env bash
# doc-log-loi.sh — CHỈ ĐỌC: in nhật ký lõi Python trên máy 146 (SRS-5.1zzzzzzz195; chuyển từ VPS sang 146 ở SRS-5.1zzzzzzz405).
# Lý do: chat thật 26/10 mất giá giữa chừng mà DB chỉ giữ kết quả cuối — dòng "Kế hoạch" / "Bỏ ô" của lõi cho biết lượt nào ghi hoặc bỏ ô nào.
# Chỉ in dòng chứa tên ô / lý do bỏ ô (không có lời khách); số dài (SĐT, Zalo ID) bị che. Không ghi gì lên 146 hay DB.
#
# Chạy từ máy cá nhân ssh được vào 146 (mặc định nguye@192.168.1.146, đổi bằng MAY_146):   bash bot/tests/doc-log-loi.sh [SO_DONG]      (mặc định 3000 dòng cuối)
# Trên 146 nhật ký là tệp trong C:\aond\logs và dòng log Python mặc định KHÔNG có giờ (lõi không cấu hình logging), nên không lọc được
# theo khoảng giờ như journalctl trước đây — đọc N dòng cuối của tệp mới nhất rồi lọc.
set -euo pipefail

CHI_DOC_LOG_146=1
. "$(dirname "$0")/lib/may146.sh"

SO_DONG="${1:-3000}"
[[ "$SO_DONG" =~ ^[0-9]+$ ]] || { echo "SO_DONG phải là số"; exit 1; }
echo "== nhật ký lõi trên $MAY_146: $SO_DONG dòng cuối (đã che số dài)"
log_cuoi_146 "$SO_DONG" \
  | grep -E '^== |Kế hoạch|Xưng hô|Lời gửi khách|Hỏi về|Mua:|Bỏ ô|ô hỏi|💲|gom .* tin|thời gian lượt|khởi động|Started|Stopped|lệch luật|gọi lại|Traceback|Error' \
  | sed -E 's/[0-9]{9,}/#/g' | cut -c1-900 || true
