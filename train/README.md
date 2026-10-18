# train/ — fine-tune giọng bot từ mẫu câu chuẩn (FR-180)

Lộ trình chủ dự án chốt 09/09/2026:

1. **Thu thập** — mỗi ngày anh/sếp mở `/admin/mau-cau`, sửa câu bot thành câu
   mong muốn. Bot bắt chước mẫu mới trong vòng 1 phút (`mau_cau_fewshot` dán
   vào prompt). Mục tiêu đầu: **300 mẫu**.
2. **Thử rẻ** — đủ 300 thì `node scripts/xuat-mau-cau.mjs` rồi chạy
   `train/unsloth_qwen.py` trên máy có **RTX 4060 8 GB** với Qwen2.5-3B-Instruct
   (7B chỉ vừa 4-bit, chậm hơn). Chi phí 0 đồng. Đọc thử 20 câu sinh ra xem
   giọng có "ra" không.
3. **Chạy thật** — ưng thì đưa cùng `mau-cau.gemini.jsonl` lên Gemini Flash
   supervised tuning (AI Studio / Vertex), hoặc thuê VPS có GPU nếu muốn giữ
   model mở (Qwen). Hai đường cùng một bộ dữ liệu.

## Chạy trên Windows có 4060 (qua WSL2 Ubuntu)

Unsloth cần Linux + CUDA; máy này có WSL2 Ubuntu sẵn (Python 3.14 trên Windows
KHÔNG dùng được — Unsloth cần 3.10–3.12).

```bash
# trong WSL Ubuntu, một lần
sudo apt-get update && sudo apt-get install -y python3.11 python3.11-venv git
python3.11 -m venv ~/unsloth && source ~/unsloth/bin/activate
pip install --upgrade pip
pip install "unsloth[cu121-torch240] @ git+https://github.com/unslothai/unsloth.git"
pip install -r train/requirements.txt
nvidia-smi   # phải thấy RTX 4060 — driver Windows đã có CUDA cho WSL
```

```bash
# mỗi lần train (repo nằm ở OneDrive, WSL đọc qua /mnt/c/…)
cd "/mnt/c/Users/quang/OneDrive - Nha Dat Co Ltd/Team Mktg - CAG mktg/003-Content/Aioinhadat"
node scripts/xuat-mau-cau.mjs            # → train/out/mau-cau/mau-cau.sharegpt.jsonl
source ~/unsloth/bin/activate
python train/unsloth_qwen.py \
  --data train/out/mau-cau/mau-cau.sharegpt.jsonl \
  --model unsloth/Qwen2.5-3B-Instruct-bnb-4bit \
  --out train/out/qwen25-3b-thai
```

Ra gì: `train/out/<tên>/lora/` (adapter, vài chục MB), `…/gguf/` (Q4_K_M, chạy
được bằng Ollama/llama.cpp để nghe thử), và `…/thu.txt` — 20 câu sinh thử từ
ngữ cảnh trong tập kiểm (10 % giữ lại, không train). Đọc `thu.txt` là câu trả
lời cho "giọng có ra không".

`train/out/` gitignore: mẫu chứa chat thật (trước 11/09/2026 mẫu nằm ở
`nhadat-backup/`, thư mục đó bỏ cùng sao lưu).

## Gemini Flash tuning

`mau-cau.gemini.jsonl` đã đúng khuôn `contents[]` + `systemInstruction`. AI
Studio → Tuned models → tạo mới → tải file lên. Cùng bộ dữ liệu với Qwen nên so
được hai bên trên cùng 20 ngữ cảnh kiểm.

## Ngưỡng "ưng"

Chưa chốt bằng số (OPEN-54). Đề xuất: sếp chấm mù 20 câu (Qwen vs bot hiện tại
vs Gemini), ≥ 14/20 chọn bản mới thì đi tiếp.
