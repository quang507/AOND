// TS-MODEL — lọc tham số theo model (đo thật trên API 10/09/2026).
//
// Vì sao có bài này: `output_config.effort` chỉ họ Claude 5 hiểu. Haiku 4.5 trả
// 400 `invalid_request_error`, mà `nenDoiSang()` không coi đó là cớ đổi sang
// Groq — nên nếu để lọt, MỌI lượt gọi ném, `chat-reply` rơi hết về câu mẫu
// tiền định và bot vẫn trả lời trơn tru như không có gì. Hỏng mà im.
import { locThamSo, CO_EFFORT } from "../supabase/functions/_shared/tham-so-model.ts";

let dat = 0, hong = 0;
const ok = (t) => { dat++; console.log(`✓ ${t}`); };
const ko = (t, chi) => { hong++; console.log(`✗ ${t}\n    ${chi}`); };
const la = (t, thuc, mong) => {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  a === b ? ok(t) : ko(t, `thật ${a}\n    mong ${b}`);
};

console.log("TS-MODEL — lọc tham số theo model\n");

// Haiku 4.5: bỏ effort, giữ nguyên phần còn lại.
la("haiku: bỏ effort, không còn output_config rỗng",
  locThamSo({ model: "claude-haiku-4-5-20251001", max_tokens: 512, output_config: { effort: "low" } }),
  { model: "claude-haiku-4-5-20251001", max_tokens: 512 });

la("haiku: bỏ effort NHƯNG giữ format (structured output vẫn chạy)",
  locThamSo({ model: "claude-haiku-4-5-20251001", output_config: { effort: "medium", format: { type: "json_schema" } } }),
  { model: "claude-haiku-4-5-20251001", output_config: { format: { type: "json_schema" } } });

// Opus 5: không đụng vào.
la("opus-5: giữ nguyên effort",
  locThamSo({ model: "claude-opus-5", output_config: { effort: "low" } }),
  { model: "claude-opus-5", output_config: { effort: "low" } });

la("sonnet-5: giữ nguyên effort",
  locThamSo({ model: "claude-sonnet-5", output_config: { effort: "medium" } }),
  { model: "claude-sonnet-5", output_config: { effort: "medium" } });

// Không khai model trong tham số → theo model mặc định của hệ thống.
la("thiếu model trong tham số: theo model mặc định (haiku → bỏ)",
  locThamSo({ output_config: { effort: "low" } }, "claude-haiku-4-5-20251001"),
  {});
la("thiếu model trong tham số: theo model mặc định (opus → giữ)",
  locThamSo({ output_config: { effort: "low" } }, "claude-opus-5"),
  { output_config: { effort: "low" } });

// Không có effort thì trả về CHÍNH object cũ, đừng chép thừa.
{
  const p = { model: "claude-haiku-4-5-20251001", messages: [] };
  locThamSo(p) === p ? ok("không có effort: giữ nguyên object, không chép thừa") : ko("không có effort", "bị chép lại");
}

// 14/09/2026: `_khuon_du_phong` (khuôn JSON chỉ cho lưới Groq) không bao giờ được tới SDK Anthropic.
{
  const p = { model: "claude-haiku-4-5-20251001", messages: [], output_config: { effort: "low" }, _khuon_du_phong: { type: "json_schema" } };
  const ra = locThamSo(p);
  !("_khuon_du_phong" in ra) && !ra.output_config ? ok("gỡ _khuon_du_phong + effort (Haiku) trước khi gửi Anthropic")
    : ko("gỡ _khuon_du_phong", JSON.stringify(ra));
  const p2 = { model: "claude-sonnet-5", messages: [], _khuon_du_phong: { type: "json_schema" } };
  !("_khuon_du_phong" in locThamSo(p2)) ? ok("gỡ _khuon_du_phong cả khi không có effort")
    : ko("gỡ _khuon_du_phong (không effort)", JSON.stringify(locThamSo(p2)));
}

// Nhận diện model: đừng để "claude-5-haiku" mai kia lọt nhầm.
[["claude-opus-5", true], ["claude-sonnet-5", true], ["claude-fable-5-1", true],
 ["claude-haiku-4-5-20251001", false], ["qwen/qwen3.8-27b", false], ["", false],
].forEach(([m, mong]) => {
  CO_EFFORT.test(m) === mong ? ok(`nhận diện "${m || "(rỗng)"}" → ${mong ? "có" : "không"} effort`)
    : ko(`nhận diện "${m}"`, `mong ${mong}`);
});

console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong) {
  console.log("TS-MODEL HỎNG — hạ model kiểu này là bot chết im, đừng deploy.");
  process.exitCode = 1;
} else {
  console.log("TS-MODEL ĐẠT");
}
