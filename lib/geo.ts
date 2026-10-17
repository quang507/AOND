// Toạ độ TÂM PHƯỜNG Quận 5 (xấp xỉ, địa giới cũ — INS-12) + jitter định trước
// theo mã tin. Cố ý KHÔNG dùng toạ độ chính xác: buyer chỉ được thấy khu vực
// mức phường cho tới khi hẹn xem nhà (FR-104). Bản đồ phải ghi rõ điều này.
export const WARD_CENTROIDS: Record<string, [number, number]> = {
  "Phường 1": [10.7592, 106.6825],
  "Phường 2": [10.7565, 106.6805],
  "Phường 3": [10.7541, 106.6779],
  "Phường 4": [10.7565, 106.6759],
  "Phường 5": [10.7593, 106.6737],
  "Phường 6": [10.7568, 106.6712],
  "Phường 7": [10.7508, 106.6748],
  "Phường 8": [10.7524, 106.6688],
  "Phường 9": [10.7599, 106.6689],
  "Phường 10": [10.7573, 106.6664],
  "Phường 11": [10.7541, 106.6641],
  "Phường 12": [10.7603, 106.6641],
  "Phường 13": [10.7526, 106.6614],
  "Phường 14": [10.7568, 106.6589],
  "Phường 15": [10.7534, 106.6559],
};

export const Q5_CENTER: [number, number] = [10.7561, 106.6703];

// Danh sách phường Quận 5 — MỘT nguồn (FR-171 j). Trước đây bốn bản lệch nhau
// (trang chủ 14, /quan-ly 15, form admin 16, bản đồ 15); 15 phường là đúng
// địa giới cũ đang dùng ở đây (INS-12), và là 15 phường có toạ độ.
export const WARDS: string[] = Object.keys(WARD_CENTROIDS);

// Băm chuỗi thành số 32-bit định trước — dùng cho jitter bản đồ và ảnh minh
// hoạ xoay vòng (lib/format), cùng một hàm thay vì hai bản chép.
export function hashSeed(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// Jitter ±~150m định trước theo mã tin — cùng tin luôn cùng chấm, không lộ số nhà
export function wardPoint(ward: string | null, seed: string): [number, number] | null {
  const c = ward ? WARD_CENTROIDS[ward] : null;
  if (!c) return null;
  const h = hashSeed(seed);
  const dx = ((h % 1000) / 1000 - 0.5) * 0.0028;
  const dy = (((h >> 10) % 1000) / 1000 - 0.5) * 0.0028;
  return [c[0] + dx, c[1] + dy];
}
