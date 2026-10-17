// tro-ly.mjs — SRS-5.1y: trợ lý có công cụ (nhánh người mua). Model giả, không mạng, không DB.
//   bun bot/tests/tro-ly.mjs
//
// Thứ phải giữ: (1) công cụ ĐỌC chạy thật và kết quả về model trong MỘT tin user (mọi tool_result cùng lượt);
// (2) công cụ GHI điều khách nói phải có trích dẫn trong lời khách — không có thì KHÔNG ghi, model nhận lỗi;
// (3) model đã viết lời + chỉ gọi công cụ ghi (đều qua) → xong một vòng; (4) không có câu trả lời dùng được → null
// để chat-reply rơi về đường JSON cũ.
import { capTruong, laKhuVucQuaRong, timTienIchQuanh, ungVienKhuVuc } from "../supabase/functions/_shared/tim-moc.ts";
import { apCongCuGhi, cauKhoangCachKhongNguon, chayTroLyMua, CONG_CU_MUA, doiLenhCuoiTroLy, KHOA_HO_SO, LENH_CUOI_JSON, thanhBongBong } from "../supabase/functions/_shared/ai/tro-ly.ts";

let hong = 0, tong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };

/** Model giả: trả lần lượt từng phản hồi trong kịch bản, ghi lại tham số mỗi lượt. */
const modelGia = (kichBan) => {
  const goi = [];
  let i = 0;
  const f = async (p) => { goi.push(structuredClone(p)); const r = kichBan[Math.min(i++, kichBan.length - 1)]; if (r instanceof Error) throw r; return r; };
  f.goi = goi;
  return f;
};
const chu = (t) => ({ type: "text", text: t });
const dung = (id, name, input) => ({ type: "tool_use", id, name, input });
const thamSo = { model: "m", max_tokens: 1024, system: [{ type: "text", text: "S" }], messages: [{ role: "user", content: "U" }] };

// TL-01: khách hỏi tiện ích quanh khu — model gọi công cụ đọc, nhận kết quả, trả lời theo kết quả.
{
  const docGoi = [];
  const goi = modelGia([
    { stop_reason: "tool_use", content: [dung("t1", "tim_tien_ich_quanh", { khu_vuc: "Nguyễn Tri Phương quận 10", loai: "truong_hoc" })] },
    { stop_reason: "end_turn", content: [chu("Dạ quanh đó có trường Tiểu học A khoảng 300 m ạ.\n\nMình cần trường cấp mấy để em lọc kỹ hơn ạ?")] },
  ]);
  const kq = await chayTroLyMua({
    goi, thamSo, loiKhach: "quanh nguyễn tri phương q10 có trường nào không em",
    doc: async (ten, input) => { docGoi.push([ten, input]); return "Quanh X:\n- trường học: Tiểu học A ~300 m"; },
  });
  ok("TL-01 có kết quả", !!kq, JSON.stringify(kq));
  ok("TL-01 công cụ đọc được gọi đúng tham số", docGoi.length === 1 && docGoi[0][0] === "tim_tien_ich_quanh" && docGoi[0][1].loai === "truong_hoc", JSON.stringify(docGoi));
  ok("TL-01 lượt 2 gửi đúng một tin user chứa tool_result", (() => {
    const m = goi.goi[1].messages;
    const cuoi = m[m.length - 1];
    return m.length === 3 && m[1].role === "assistant" && cuoi.role === "user" && cuoi.content.length === 1 && cuoi.content[0].type === "tool_result" && cuoi.content[0].tool_use_id === "t1";
  })(), JSON.stringify(goi.goi[1].messages));
  ok("TL-01 mọi lượt gửi kèm danh sách công cụ", goi.goi.every((p) => p.tools?.map((t) => t.name).join() === CONG_CU_MUA.map((t) => t.name).join()));
  ok("TL-01 hai bong bóng", kq?.out.replies.length === 2, JSON.stringify(kq?.out.replies));
  ok("TL-01 dữ liệu đọc đưa ra cho lưới chặn bịa", kq?.duLieu[0]?.includes("Tiểu học A"), JSON.stringify(kq?.duLieu));
  ok("TL-01 ghi tên công cụ + số vòng", kq?.congCu.join() === "tim_tien_ich_quanh" && kq?.vong === 2, JSON.stringify(kq));
}

// TL-02: nhiều công cụ đọc cùng lượt → MỘT tin user mang đủ các tool_result (không tách tin).
{
  const goi = modelGia([
    { stop_reason: "tool_use", content: [dung("a", "xem_can", { ma_can: "BDS-Q5-0001" }), dung("b", "tim_tien_ich_quanh", { khu_vuc: "BDS-Q5-0001", loai: "cho" })] },
    { stop_reason: "end_turn", content: [chu("Dạ căn này gần chợ khoảng 400 m ạ.")] },
  ]);
  const kq = await chayTroLyMua({ goi, thamSo, loiKhach: "căn BDS-Q5-0001 gần chợ không", doc: async (t) => `kq ${t}: chợ Hoà Bình ~400 m` });
  const cuoi = goi.goi[1].messages.at(-1);
  ok("TL-02 hai tool_result trong một tin", cuoi.content.length === 2 && cuoi.content.map((k) => k.tool_use_id).join() === "a,b", JSON.stringify(cuoi));
  ok("TL-02 trả lời", kq?.out.replies[0] === "Dạ căn này gần chợ khoảng 400 m ạ.");
}

// TL-03: ghi hồ sơ — trích dẫn có trong lời khách → ghi; xong NGAY một vòng vì đã có lời nhắn.
{
  const goi = modelGia([
    { stop_reason: "tool_use", content: [chu("Dạ em ghi nhận quận 7, tầm 3 tỷ ạ. Mình cần mấy phòng ngủ ạ?"), dung("g", "ghi_ho_so_mua", { truong: [
      { khoa: "area", gia_tri: "quận 7", trich_dan: "quan 7" },
      { khoa: "budget", gia_tri: "tầm 3 tỷ", trich_dan: "tầm 3 tỷ" },
      { khoa: "deal", gia_tri: "ban", trich_dan: "mua nhà" },
    ] })] },
  ]);
  const kq = await chayTroLyMua({ goi, thamSo, loiKhach: "mình muốn mua nhà quận 7 tầm 3 tỷ", doc: async () => "" });
  ok("TL-03 một vòng", kq?.vong === 1 && goi.goi.length === 1, JSON.stringify(kq));
  ok("TL-03 hồ sơ ghi area/budget/deal", kq?.out.profile.area === "quận 7" && kq?.out.profile.budget === "tầm 3 tỷ" && kq?.out.profile.deal === "ban", JSON.stringify(kq?.out.profile));
  ok("TL-03 khoá chưa nói để null", kq?.out.profile.purpose === null && Object.keys(kq?.out.profile ?? {}).length === KHOA_HO_SO.length);
}

// TL-04 (BÀI ĐỎ KHI TẮT KIỂM TRÍCH DẪN): model ghi điều khách KHÔNG nói → không ghi, lỗi về model, model sửa lời.
{
  const goi = modelGia([
    { stop_reason: "tool_use", content: [chu("Dạ em ghi mình cần 3 phòng ngủ, để ở nha."), dung("g", "ghi_ho_so_mua", { truong: [
      { khoa: "bedrooms", gia_tri: "3", trich_dan: "3 phòng ngủ" },
      { khoa: "purpose", gia_tri: "để ở", trich_dan: "để ở" },
    ] })] },
    { stop_reason: "end_turn", content: [chu("Dạ mình cần mấy phòng ngủ ạ?")] },
  ]);
  const kq = await chayTroLyMua({ goi, thamSo, loiKhach: "nhà quận 7 tầm 3 tỷ", doc: async () => "" });
  const kqCongCu = goi.goi[1]?.messages.at(-1)?.content?.[0];
  ok("TL-04 không ghi trường bịa", kq?.out.profile.bedrooms === null && kq?.out.profile.purpose === null, JSON.stringify(kq?.out.profile));
  ok("TL-04 model nhận lỗi is_error", kqCongCu?.is_error === true && /không có trong lời khách/.test(kqCongCu?.content ?? ""), JSON.stringify(kqCongCu));
  ok("TL-04 lời 'em ghi rồi' KHÔNG đi tới khách — dùng lời đã sửa", kq?.out.replies.join() === "Dạ mình cần mấy phòng ngủ ạ?", JSON.stringify(kq?.out.replies));
}

// TL-04b: một trường đạt + một trường bịa trong CÙNG lệnh → trường đạt vẫn ghi, nhưng lệnh là lỗi để model viết lại lời.
{
  const goi = modelGia([
    { stop_reason: "tool_use", content: [chu("Dạ em ghi hẻm xe hơi, 3 phòng ngủ rồi nha."), dung("g", "ghi_ho_so_mua", { truong: [
      { khoa: "alley", gia_tri: "hẻm xe hơi", trich_dan: "hem xe hoi" },
      { khoa: "bedrooms", gia_tri: "3", trich_dan: "3 phòng ngủ" },
    ] })] },
    { stop_reason: "end_turn", content: [chu("Dạ em ghi hẻm xe hơi rồi ạ.")] },
  ]);
  const kq = await chayTroLyMua({ goi, thamSo, loiKhach: "anh cần hem xe hoi nha em", doc: async () => "" });
  ok("TL-04b trường có chứng vẫn ghi, trường bịa không", kq?.out.profile.alley === "hẻm xe hơi" && kq?.out.profile.bedrooms === null, JSON.stringify(kq?.out.profile));
  ok("TL-04b lệnh nửa đạt vẫn báo lỗi → model viết lại", goi.goi.length === 2 && kq?.out.replies.join() === "Dạ em ghi hẻm xe hơi rồi ạ.", JSON.stringify(kq?.out.replies));
}

// TL-04c (bắn thật 02/10 thu-trl-04): khách "nhà có 2 con nhỏ" → trợ lý ghi "vợ chồng + 2 con nhỏ" — trích dẫn đúng, giá
// trị thêm chữ khách không nói → bỏ; viết lại có dấu từ chữ không dấu của khách thì nhận.
{
  const out = { profile: {}, replies: [] };
  const loi = "minh tim nha hem xe hoi quan 5 tam 7 ty, nha co 2 con nho";
  const r = apCongCuGhi(out, "ghi_ho_so_mua", { truong: [
    { khoa: "nguoi_o_cung", gia_tri: "vợ chồng + 2 con nhỏ", trich_dan: "nha co 2 con nho" },
    { khoa: "alley", gia_tri: "hẻm xe hơi", trich_dan: "hem xe hoi" },
    { khoa: "notes", gia_tri: "có 2 con nhỏ", trich_dan: "co 2 con nho" },
  ] }, loi);
  ok("TL-04c 'vợ chồng' khách không nói → không ghi người ở cùng", out.profile.nguoi_o_cung === undefined && r.loi && /chữ khách KHÔNG nói/.test(r.ket), JSON.stringify({ out, r }));
  ok("TL-04c 'hẻm xe hơi' / 'có 2 con nhỏ' (có dấu từ chữ không dấu) → ghi", out.profile.alley === "hẻm xe hơi" && out.profile.notes === "có 2 con nhỏ", JSON.stringify(out.profile));
}

// TL-04d (bắn thật 02/10 thu-trl-06): "nhà có 2 con nhỏ" → trợ lý ghi 2 phòng ngủ — trích "2 con nhỏ" có thật nhưng không
// nói phòng. Số phòng ngủ chỉ nhận khi trích dẫn có "phòng"/"pn" kèm đúng số.
{
  const out = { profile: {}, replies: [] };
  const r = apCongCuGhi(out, "ghi_ho_so_mua", { truong: [{ khoa: "bedrooms", gia_tri: "2", trich_dan: "2 con nho" }] }, "nha co 2 con nho");
  ok("TL-04d '2 con nhỏ' → không ghi 2 phòng ngủ", out.profile.bedrooms === undefined && r.loi, JSON.stringify({ out, r }));
  const out2 = { profile: {}, replies: [] };
  apCongCuGhi(out2, "ghi_ho_so_mua", { truong: [{ khoa: "bedrooms", gia_tri: "3", trich_dan: "3PN" }] }, "can tim can 3PN quan 7");
  ok("TL-04d '3PN' (cách nói mới) → 3 phòng ngủ", out2.profile.bedrooms === 3, JSON.stringify(out2));
}

// TL-05: cách nói MỚI — khách nói không dấu, trích có dấu vẫn nhận (khớp sau bỏ dấu); giờ hẹn + SĐT khách tự cho.
{
  const out = { profile: {}, replies: [] };
  const loi = "chieu thu 7 minh qua xem can BDS-Q5-0002 duoc ko, sdt 0903 123 456";
  const r1 = apCongCuGhi(out, "hen_xem_nha", { ma_can: "#bds-q5-0002", khi: "chiều thứ 7", sdt: "0903123456", trich_dan: "chiều thứ 7" }, loi);
  ok("TL-05 hẹn xem ghi được", !r1.loi && out.viewing?.when === "chiều thứ 7" && out.viewing?.listing_code === "BDS-Q5-0002", JSON.stringify(out));
  ok("TL-05 SĐT khách tự cho thì giữ", out.viewing?.phone === "0903123456", JSON.stringify(out.viewing));
  const out2 = { profile: {}, replies: [] };
  apCongCuGhi(out2, "hen_xem_nha", { ma_can: null, khi: "mai 9h", sdt: "0911222333", trich_dan: "mai 9h" }, "mai 9h em qua xem nha");
  ok("TL-05 SĐT model tự điền (khách không cho) → null", out2.viewing?.phone === null, JSON.stringify(out2.viewing));
  const out3 = { profile: {}, replies: [] };
  const r3 = apCongCuGhi(out3, "chot_can", { ma_can: "BDS-Q5-0002", trich_dan: "ok chốt" }, "để anh suy nghĩ thêm");
  ok("TL-05 chốt căn không có lời khách → không chốt", r3.loi && !out3.agreed_deal, JSON.stringify(out3));
  const out4 = { profile: {}, replies: [] };
  apCongCuGhi(out4, "bao_nguoi_phu_trach", { ly_do: "khách muốn gọi", goi_dien: true }, "alo được không em");
  ok("TL-05 báo người phụ trách + gọi điện", out4.need_human === true && out4.voice_request === true, JSON.stringify(out4));
  const out5 = { profile: {}, replies: [] };
  const r5 = apCongCuGhi(out5, "ghi_ho_so_mua", { truong: [{ khoa: "bedrooms", gia_tri: "ba phòng", trich_dan: "ba phong ngu" }] }, "can ba phong ngu");
  ok("TL-05 bedrooms không phải số → bỏ", r5.loi && out5.profile.bedrooms === undefined, JSON.stringify(r5));
}

// TL-06: đường rơi về JSON cũ — từ chối, chữ rỗng, hết trần giữa công cụ, hết vòng.
{
  const tuChoi = await chayTroLyMua({ goi: modelGia([{ stop_reason: "refusal", content: [] }]), thamSo, loiKhach: "x", doc: async () => "" });
  ok("TL-06 từ chối → null", tuChoi === null);
  const rong = await chayTroLyMua({ goi: modelGia([{ stop_reason: "end_turn", content: [] }]), thamSo, loiKhach: "x", doc: async () => "" });
  ok("TL-06 không chữ → null", rong === null);
  const cut = await chayTroLyMua({ goi: modelGia([{ stop_reason: "max_tokens", content: [dung("c", "ghi_ho_so_mua", { truong: [{ khoa: "area" }] })] }]), thamSo, loiKhach: "x", doc: async () => "" });
  ok("TL-06 công cụ cụt vì hết trần → null", cut === null);
  const lap = modelGia([{ stop_reason: "tool_use", content: [dung("l", "xem_can", { ma_can: "BDS-Q5-0001" })] }]);
  const vong = await chayTroLyMua({ goi: lap, thamSo, loiKhach: "x", doc: async () => "kq", toiDaVong: 3 });
  ok("TL-06 gọi công cụ mãi → dừng ở trần vòng, null", vong === null && lap.goi.length === 3, String(lap.goi.length));
  let loiNem = null;
  try { await chayTroLyMua({ goi: modelGia([new Error("529 overloaded")]), thamSo, loiKhach: "x", doc: async () => "" }); } catch (e) { loiNem = e; }
  ok("TL-06 model ném → ném lên (chat-reply bắt, ghi sổ, đi đường cũ)", loiNem?.message === "529 overloaded");
}

// TL-07: công cụ đọc hỏng → tool_result is_error, model vẫn trả lời được (nói thật chưa tra được).
{
  const goi = modelGia([
    { stop_reason: "tool_use", content: [dung("e", "tim_tien_ich_quanh", { khu_vuc: "Q5", loai: "cho" })] },
    { stop_reason: "end_turn", content: [chu("Dạ em chưa tra được ạ.")] },
  ]);
  const kq = await chayTroLyMua({ goi, thamSo, loiKhach: "q5 có chợ nào", doc: async () => { throw new Error("db timeout"); } });
  const kr = goi.goi[1].messages.at(-1).content[0];
  ok("TL-07 lỗi tra cứu về model", kr.is_error === true && /chưa tra được/.test(kr.content), JSON.stringify(kr));
  ok("TL-07 vẫn có lời trả lời", kq?.out.replies[0] === "Dạ em chưa tra được ạ.");
}

// TL-08: tách bong bóng.
ok("TL-08 ba đoạn → hai bong bóng", JSON.stringify(thanhBongBong("A\n\nB\n\nC")) === JSON.stringify(["A", "B\nC"]));
ok("TL-08 một đoạn nhiều dòng giữ nguyên", JSON.stringify(thanhBongBong("A\nB")) === JSON.stringify(["A\nB"]));
// ZZZZZH-TL1 (bắn production 12/10): ghi chú nội bộ của model về khách đi thẳng tới Zalo. Đoạn mở bằng nhãn nội bộ bỏ cả đoạn; dòng
// nhãn nội bộ lẫn trong lời bỏ dòng đó. Cách nói mới chưa bắn: "Ghi chú: …", "- Lý do chưa gửi căn: …".
{
  const goc = thanhBongBong("Dạ không sao anh, khi nào anh cần cứ nhắn em nha.\n\nCập nhật hồ sơ:\nKhách đang chần chừ, chưa chốt khu vực.\nLý do không hỏi tiếp: khách bận.");
  ok("ZZZZZH-TL1 ca gốc: bỏ đoạn 'Cập nhật hồ sơ:'", goc.length === 1 && !/hồ sơ|Lý do/i.test(goc.join(" ")), JSON.stringify(goc));
  const moi = thanhBongBong("Dạ em tìm thêm cho anh nha.\nGhi chú: khách thích nhà hẻm xe hơi\n- Lý do chưa gửi căn: kho trống");
  ok("ZZZZZH-TL1 cách nói mới: dòng 'Ghi chú:' / '- Lý do …:' bị bỏ, lời khách giữ", JSON.stringify(moi) === JSON.stringify(["Dạ em tìm thêm cho anh nha."]), JSON.stringify(moi));
  const giu = thanhBongBong("Dạ căn này hồ sơ pháp lý đầy đủ ạ: sổ hồng riêng, hoàn công rồi.");
  ok("ZZZZZH-TL1 không bỏ nhầm câu có chữ 'hồ sơ' nói với khách", giu.length === 1, JSON.stringify(giu));
}
// ZZZZZH-TL2: lệnh cuối của đường JSON ("…và cập nhật hồ sơ:") mời model viết hồ sơ ra chữ — chế độ trợ lý thay bằng lệnh chỉ đòi lời nói với khách.
{
  const goc = [{ role: "user", content: [{ type: "image", source: {} }, { type: "text", text: `HỒ SƠ…${LENH_CUOI_JSON}` }] }];
  const moi = doiLenhCuoiTroLy(goc);
  const chu = moi[0].content[1].text;
  ok("ZZZZZH-TL2 chế độ trợ lý: lệnh cuối không còn 'cập nhật hồ sơ', đòi lời nói với khách; phần ảnh giữ nguyên",
    !/cập nhật hồ sơ/.test(chu) && /lời nhắn gửi khách/.test(chu) && chu.startsWith("HỒ SƠ…") && moi[0].content[0].type === "image" && goc[0].content[1].text.endsWith(LENH_CUOI_JSON), chu);
}

// TL-10 (bắn thật 02/10 thu-trl-05): "còn bệnh viện gần đó thì sao" → model KHÔNG gọi công cụ, tự kể "Bệnh viện Chợ Rẫy
// khoảng 500m". Khoảng cách không có trong nguồn → code nhắc một lần; model tra công cụ thì trả lời theo kết quả.
{
  const goi = modelGia([
    { stop_reason: "end_turn", content: [chu("Dạ gần đó có Bệnh viện Chợ Rẫy khoảng 500m ạ.")] },
    { stop_reason: "tool_use", content: [dung("b1", "tim_tien_ich_quanh", { khu_vuc: "chợ An Đông", loai: "benh_vien" })] },
    { stop_reason: "end_turn", content: [chu("Dạ gần chợ An Đông có Bệnh viện Hùng Vương khoảng 600 m ạ.")] },
  ]);
  const kq = await chayTroLyMua({
    goi, thamSo, loiKhach: "còn bệnh viện gần đó thì sao", nguCanh: "KHO: (trống)",
    doc: async () => "Quanh Chợ An Đông:\n- bệnh viện: Bệnh viện Hùng Vương ~600 m",
  });
  const nhacTin = goi.goi[1]?.messages.at(-1);
  ok("TL-10 lời có khoảng cách không nguồn → code nhắc model (tin user [HỆ THỐNG])", nhacTin?.role === "user" && /HỆ THỐNG/.test(JSON.stringify(nhacTin?.content)), JSON.stringify(nhacTin));
  ok("TL-10 sau khi nhắc model tra công cụ → trả lời theo kết quả", kq?.out.replies.join() === "Dạ gần chợ An Đông có Bệnh viện Hùng Vương khoảng 600 m ạ." && kq?.nhac === 1 && kq?.congCu.includes("tim_tien_ich_quanh"), JSON.stringify(kq));
  // Model vẫn bịa sau khi nhắc → bỏ câu đó.
  const goi2 = modelGia([
    { stop_reason: "end_turn", content: [chu("Dạ gần đó có bệnh viện khoảng 1km ạ. Mình cần mấy phòng ngủ ạ?")] },
    { stop_reason: "end_turn", content: [chu("Dạ gần đó có bệnh viện cách tầm 1,2 km ạ. Mình cần mấy phòng ngủ ạ?")] },
  ]);
  const kq2 = await chayTroLyMua({ goi: goi2, thamSo, loiKhach: "gần đó có bệnh viện không", nguCanh: "", doc: async () => "" });
  ok("TL-10b vẫn nêu khoảng cách không nguồn sau khi nhắc → bỏ câu đó, giữ phần còn lại", kq2?.out.replies.join() === "Mình cần mấy phòng ngủ ạ?" && kq2?.boCau.length === 1, JSON.stringify(kq2));
  // Nguồn có số → không nhắc; số đo nhà (không có chữ nơi chốn) → không nhắc.
  ok("TL-10c khoảng cách có trong ngữ cảnh kho ('~300 m') → không tính là bịa", cauKhoangCachKhongNguon("Căn này cách chợ Hoà Bình khoảng 300 mét ạ.", "quanh căn: Chợ Hoà Bình ~300 m").length === 0);
  ok("TL-10d số đo nhà 'hẻm 6m, ngang 4m' → không phải khoảng cách nơi chốn", cauKhoangCachKhongNguon("Căn này hẻm 6m, ngang 4m ạ.", "").length === 0);
  ok("TL-10f bán kính tìm 'trong ~1 km' không làm nguồn cho '900m'", cauKhoangCachKhongNguon("Gần căn có trường Nguyễn Du khoảng 900m ạ.", "muốn ở gần: trường học, trong ~1 km").length === 1);
  ok("TL-10e diện tích '50m2' không bị đọc là 50 m", cauKhoangCachKhongNguon("Căn gần chợ, 50m2 ạ.", "").length === 0);
}

// TL-09 (bắn thật 02/10 "chợ An Đông, Quận 5" không định vị được): thử thêm bản bỏ đuôi hành chính; tên đường có chữ
// "Phương" không bị cắt; "Phường An Đông" một mình giữ nguyên.
{
  const uv = (x) => JSON.stringify(ungVienKhuVuc(x));
  ok("TL-09 'chợ An Đông, Quận 5' → thêm 'chợ An Đông'", uv("chợ An Đông, Quận 5") === JSON.stringify(["chợ An Đông, Quận 5", "chợ An Đông"]), uv("chợ An Đông, Quận 5"));
  ok("TL-09 'bệnh viện chợ rẫy p12' → thêm 'bệnh viện chợ rẫy'", uv("bệnh viện chợ rẫy p12") === JSON.stringify(["bệnh viện chợ rẫy p12", "bệnh viện chợ rẫy"]), uv("bệnh viện chợ rẫy p12"));
  ok("TL-09 'nguyễn tri phương q10' → 'nguyễn tri phương' (không cắt ở chữ Phương)", uv("nguyễn tri phương q10") === JSON.stringify(["nguyễn tri phương q10", "nguyễn tri phương"]), uv("nguyễn tri phương q10"));
  ok("TL-09 'chợ bà chiểu q bình thạnh' → thêm 'chợ bà chiểu'", uv("chợ bà chiểu q bình thạnh") === JSON.stringify(["chợ bà chiểu q bình thạnh", "chợ bà chiểu"]), uv("chợ bà chiểu q bình thạnh"));
  ok("TL-09 'Phường An Đông' / 'Phương Mai' giữ nguyên", uv("Phường An Đông") === JSON.stringify(["Phường An Đông"]) && uv("Phương Mai") === JSON.stringify(["Phương Mai"]));
}

// TL-11 (bắn thật 02/10 thu-trl-07: khách hỏi trường TIỂU HỌC, bot gọi "Trường Trung học Cơ sở Lý Phong" là tiểu học): công cụ
// đọc cấp từ tên để ghi kèm từng dòng; tên không có cấp thì không đoán.
ok("TL-11 cấp trường đọc từ tên",
  capTruong("Trường Trung học Cơ sở Lý Phong") === "thcs" && capTruong("Trường Tiểu học Chương Dương") === "tieu_hoc" &&
  capTruong("Trường TH Nguyễn Du") === "tieu_hoc" && capTruong("Trường Trung học phổ thông Hoà Bình") === "thpt" &&
  capTruong("Trường Mầm non Phường 3") === "mam_non" && capTruong("Trường Dự bị Đại học TP.HCM") === "dai_hoc" &&
  capTruong("Trường Nguyễn Du") === null);

// TL-12 (02/10/2026, bắn D4/D7): "Quận 5" là cả quận — không lấy tiện ích có tên chứa "Quận 5" làm tâm.
ok("TL-12 cả quận/huyện/TP → quá rộng (kể cả cách viết mới 'q.10', 'quận Bình Thạnh, TP.HCM', 'quận 10 hcm')",
  ["Quận 5", "q5", "q.10", "quận Bình Thạnh, TP.HCM", "huyện Bình Chánh", "TP Thủ Đức", "quận 10 hcm"].every(laKhuVucQuaRong));
ok("TL-12b tên đường / phường / chợ / mã căn KHÔNG bị coi là cả quận (Quang Trung, Hùng Vương, phường Bến Thành…)",
  !["Quang Trung", "Hùng Vương", "Huỳnh Mẫn Đạt", "phường Bến Thành", "chợ An Đông", "Nguyễn Tri Phương quận 10", "BDS-Q5-0001"].some(laKhuVucQuaRong));
{
  let hoiDb = 0;
  const dbGia = { from: () => { hoiDb++; throw new Error("không được hỏi DB"); }, rpc: () => { hoiDb++; throw new Error("không được hỏi DB"); } };
  const kq = await timTienIchQuanh(dbGia, "Quận 5", "cong_vien");
  ok("TL-12c công cụ tiện ích với 'Quận 5' → nói quá rộng, hỏi khu cụ thể, KHÔNG đụng DB / Nominatim", /quá rộng/.test(kq) && hoiDb === 0, kq);
}
// TL-13: hết vòng công cụ → vòng cuối gửi tool_choice none; báo hỏng kèm lý do khi model vẫn không viết lời.
{
  const goi = modelGia([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "a", name: "tim_tien_ich_quanh", input: { khu_vuc: "chợ An Đông", loai: "benh_vien" } }] },
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "b", name: "tim_tien_ich_quanh", input: { khu_vuc: "chợ An Đông", loai: "benh_vien", ban_kinh_m: 2000 } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Dạ em chưa tra được bệnh viện quanh chợ An Đông ạ." }] },
  ]);
  const kq = await chayTroLyMua({ goi, thamSo, loiKhach: "còn bệnh viện gần đó thì sao", doc: async () => "kho dữ liệu bên em CHƯA có bệnh viện nào", toiDaVong: 3 });
  ok("TL-13 vòng cuối (3/3) gửi tool_choice none, các vòng trước không; có câu trả lời",
    goi.goi[2]?.tool_choice?.type === "none" && !goi.goi[0].tool_choice && !goi.goi[1].tool_choice && kq?.out.replies.length === 1, JSON.stringify(goi.goi.map((p) => p.tool_choice ?? null)));
  let bao = null;
  const goi2 = modelGia([{ stop_reason: "tool_use", content: [{ type: "tool_use", id: "c", name: "tim_tien_ich_quanh", input: { khu_vuc: "x", loai: "cho" } }] }]);
  const kq2 = await chayTroLyMua({ goi: goi2, thamSo, loiKhach: "x", doc: async () => "kq", toiDaVong: 2, baoHong: (l, c, v) => { bao = { l, c, v }; } });
  ok("TL-13b model vẫn gọi công cụ ở vòng cuối → null + baoHong('het_vong', công cụ đã gọi)", kq2 === null && bao?.l === "het_vong" && bao?.c.length === 2, JSON.stringify(bao));
}

// TL-14 (bắn lại D1): "…trong khoảng 1 km" nhắc lại bán kính đã tra → không phải khoảng cách bịa; bán kính KHÁC nguồn thì vẫn bắt.
{
  const nguon = "Quanh Chợ An Đông (bán kính ~1 km, đường chim bay):\n- trường học (tiểu học): Trường Tiểu học Trần Quang Cơ ~450 m";
  ok("TL-14 'mấy trường khác trong khoảng 1 km' khớp bán kính nguồn → không bỏ câu",
    cauKhoangCachKhongNguon("Có Trường Tiểu học Trần Quang Cơ và mấy trường khác trong khoảng 1 km.", nguon).length === 0);
  ok("TL-14b cách nói mới 'trong vòng 300m có bệnh viện' (bán kính khác nguồn) → vẫn bắt",
    cauKhoangCachKhongNguon("Trong vòng 300m có bệnh viện Chợ Rẫy.", nguon).length === 1);
}
// TL-15 (bắn lại D1 "còn bệnh viện gần đó"): tra xong, vòng 2 model chỉ kể việc "Ghi lại hồ sơ…:" + lệnh ghi → KHÔNG dừng; vòng
// 3 mới là lời trả lời.
{
  const goi = modelGia([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "r", name: "tim_tien_ich_quanh", input: { khu_vuc: "chợ An Đông", loai: "benh_vien" } }] },
    { stop_reason: "tool_use", content: [{ type: "text", text: "Ghi lại hồ sơ với thông tin khách đã nói rõ:" }, { type: "tool_use", id: "w", name: "ghi_ho_so_mua", input: { truong: [{ khoa: "area", gia_tri: "Quận 5", trich_dan: "quận 5" }] } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Dạ gần chợ An Đông có Bệnh viện Nguyễn Trãi khoảng 350 m ạ." }] },
  ]);
  const kq = await chayTroLyMua({ goi, thamSo, loiKhach: "mua nhà quận 5 tầm 6 tỷ. còn bệnh viện gần đó thì sao", doc: async () => "Quanh Chợ An Đông:\n- bệnh viện: Bệnh viện Nguyễn Trãi ~350 m" });
  ok("TL-15 đã tra rồi thì vòng chỉ-có-ghi không phải lời cuối → trả lời ở vòng 3", kq?.vong === 3 && /Nguyễn Trãi/.test(kq?.out.replies.join(" ") ?? ""), JSON.stringify(kq?.out.replies));
}

console.log(`\n${tong - hong}/${tong} đạt`);
if (hong) process.exit(1);
