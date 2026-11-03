// ghep-vanh.mjs — bài kiểm offline cho scripts/lib/ghep-vanh.mjs (SRS-5.1zzzzzzz360). Không gọi mạng / DB.
import { ghepVanh, relationThanhVong, trongVanh } from "../../scripts/lib/ghep-vanh.mjs";

let hong = 0;
const ok = (ten, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk ? "" : ` — ${ct}`}`); if (!dk) hong++; };
const g = (pts) => pts.map(([lng, lat]) => ({ lon: lng, lat }));

// Ô vuông chia 3 way, không theo thứ tự, way giữa ngược chiều.
const w1 = [[0, 0], [1, 0], [1, 1]], w2 = [[0, 1], [1, 1]], w3 = [[0, 1], [0, 0]];
const vanh = ghepVanh([w1, w3, w2]);
ok("ghép 3 đoạn lộn thứ tự / ngược chiều thành 1 vành kín", vanh?.length === 1 && vanh[0].length === 5, JSON.stringify(vanh));
ok("đoạn hở → null (không đoán)", ghepVanh([[[0, 0], [1, 0]], [[1, 0], [1, 1]]]) === null);
ok("trongVanh: tâm ô vuông", trongVanh(0.5, 0.5, vanh[0]));
ok("trongVanh: ngoài ô vuông", !trongVanh(1.5, 0.5, vanh[0]));

// Relation có lỗ → Polygon 2 vành; hai mảnh rời → MultiPolygon.
const relLo = { members: [
  { type: "way", role: "outer", geometry: g([[0, 0], [4, 0], [4, 4]]) },
  { type: "way", role: "outer", geometry: g([[4, 4], [0, 4], [0, 0]]) },
  { type: "way", role: "inner", geometry: g([[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]) },
  { type: "node", role: "admin_centre" },
] };
const a = relationThanhVong(relLo);
ok("relation có lỗ → Polygon, 2 vành", a?.vong.type === "Polygon" && a.vong.coordinates.length === 2, JSON.stringify(a?.vong.type));
ok("khung bao đúng", a && a.khung.min_lng === 0 && a.khung.max_lat === 4, JSON.stringify(a?.khung));
const relHaiManh = { members: [
  { type: "way", role: "outer", geometry: g([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]) },
  { type: "way", role: "outer", geometry: g([[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]) },
] };
ok("hai mảnh rời → MultiPolygon", relationThanhVong(relHaiManh)?.vong.type === "MultiPolygon");
ok("relation không ghép được → null", relationThanhVong({ members: [{ type: "way", role: "outer", geometry: g([[0, 0], [1, 0]]) }] }) === null);

console.log(hong ? `\nGHÉP VÀNH: ${hong} CA HỎNG` : "\nGHÉP VÀNH: ĐẠT");
process.exit(hong ? 1 : 0);
