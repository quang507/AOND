#!/usr/bin/env python3
"""unsloth_qwen.py — fine-tune LoRA Qwen2.5 trên mẫu câu chuẩn (FR-180).

Chạy trong WSL2 Ubuntu có CUDA (xem train/README.md). 4060 8 GB: 3B 4-bit,
batch 2, grad-accum 8, seq 2048 là vừa; 7B 4-bit chỉ vừa khi seq ≤ 1024.

  python train/unsloth_qwen.py --data <mau-cau.sharegpt.jsonl> \
      --model unsloth/Qwen2.5-3B-Instruct-bnb-4bit --out train/out/qwen25-3b-thai

Ra: <out>/lora, <out>/gguf (Q4_K_M), <out>/thu.txt (20 câu sinh thử trên tập kiểm).
"""
import argparse
import json
import os
import random

parser = argparse.ArgumentParser()
parser.add_argument("--data", required=True)
parser.add_argument("--model", default="unsloth/Qwen2.5-3B-Instruct-bnb-4bit")
parser.add_argument("--out", default="train/out/qwen25-3b-thai")
parser.add_argument("--epochs", type=float, default=3)
parser.add_argument("--seq", type=int, default=2048)
parser.add_argument("--lr", type=float, default=2e-4)
parser.add_argument("--seed", type=int, default=3407)
parser.add_argument("--no-gguf", action="store_true")
args = parser.parse_args()

random.seed(args.seed)
rows = [json.loads(l) for l in open(args.data, encoding="utf-8") if l.strip()]
if len(rows) < 30:
    raise SystemExit(f"Chỉ có {len(rows)} mẫu — quá ít để train, cần ≥ 300 (xem /admin/mau-cau).")
random.shuffle(rows)
n_kiem = max(10, len(rows) // 10)
kiem, hoc = rows[:n_kiem], rows[n_kiem:]
print(f"{len(hoc)} mẫu học · {len(kiem)} mẫu kiểm (không train)")

from unsloth import FastLanguageModel  # noqa: E402
from unsloth.chat_templates import get_chat_template, standardize_sharegpt  # noqa: E402
from datasets import Dataset  # noqa: E402
from trl import SFTTrainer  # noqa: E402
from transformers import TrainingArguments  # noqa: E402
import torch  # noqa: E402

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=args.model, max_seq_length=args.seq, dtype=None, load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model, r=16, lora_alpha=16, lora_dropout=0,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    bias="none", use_gradient_checkpointing="unsloth", random_state=args.seed,
)
tokenizer = get_chat_template(tokenizer, chat_template="qwen-2.5")

ds = Dataset.from_list([{"conversations": r["conversations"]} for r in hoc])
ds = standardize_sharegpt(ds)
ds = ds.map(lambda ex: {"text": tokenizer.apply_chat_template(ex["conversations"], tokenize=False, add_generation_prompt=False)})

trainer = SFTTrainer(
    model=model, tokenizer=tokenizer, train_dataset=ds, dataset_text_field="text",
    max_seq_length=args.seq, packing=False,
    args=TrainingArguments(
        per_device_train_batch_size=2, gradient_accumulation_steps=8,
        warmup_steps=10, num_train_epochs=args.epochs, learning_rate=args.lr,
        fp16=not torch.cuda.is_bf16_supported(), bf16=torch.cuda.is_bf16_supported(),
        logging_steps=5, optim="adamw_8bit", weight_decay=0.01, lr_scheduler_type="linear",
        seed=args.seed, output_dir=os.path.join(args.out, "ckpt"), report_to="none",
    ),
)
trainer.train()

os.makedirs(args.out, exist_ok=True)
model.save_pretrained(os.path.join(args.out, "lora"))
tokenizer.save_pretrained(os.path.join(args.out, "lora"))

# Sinh thử trên tập kiểm: cùng ngữ cảnh, xem giọng có "ra" không.
FastLanguageModel.for_inference(model)
with open(os.path.join(args.out, "thu.txt"), "w", encoding="utf-8") as f:
    for r in kiem[:20]:
        msgs = [m for m in r["conversations"]]
        chuan = msgs[-1]["value"]
        prompt = msgs[:-1]
        ids = tokenizer.apply_chat_template(
            [{"role": {"system": "system", "human": "user", "gpt": "assistant"}[m["from"]], "content": m["value"]} for m in prompt],
            tokenize=True, add_generation_prompt=True, return_tensors="pt",
        ).to("cuda")
        out = model.generate(input_ids=ids, max_new_tokens=120, temperature=0.7, top_p=0.9, do_sample=True)
        sinh = tokenizer.decode(out[0][ids.shape[1]:], skip_special_tokens=True).strip()
        khach = next((m["value"] for m in reversed(prompt) if m["from"] == "human"), "")
        f.write(f"KHÁCH: {khach}\nCHUẨN: {chuan}\nQWEN : {sinh}\n{'-' * 60}\n")
print("→", os.path.join(args.out, "thu.txt"))

if not args.no_gguf:
    model.save_pretrained_gguf(os.path.join(args.out, "gguf"), tokenizer, quantization_method="q4_k_m")
    print("→ GGUF Q4_K_M:", os.path.join(args.out, "gguf"))
