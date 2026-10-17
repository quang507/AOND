export type CuratedListing = {
  id: string;
  code: string;
  kind: "nha" | "can_ho" | "biet_thu" | "mat_bang" | "dat" | "toa_nha";
  kindLabel: string;
  deal: "ban" | "cho_thue";
  title: string;
  price_vnd: number;
  price_display: string;
  price_sub?: string;
  area_m2: number;
  location: string;
  district: string;
  image: string;
  bullets: [string, string, string, string]; // Đúng 4 gạch đầu dòng cốt lõi
  badge?: string;
  featured?: boolean;
};

export const CURATED_LISTINGS: CuratedListing[] = [
  {
    id: "curated-1",
    code: "Q8-CL102",
    kind: "nha",
    kindLabel: "Nhà mặt tiền",
    deal: "ban",
    title: "Bán nhà mặt tiền đường Cao Lỗ Phường 4 Quận 8 vỉa hè rộng 4m tiện mở văn phòng công ty và kinh doanh đa ngành",
    price_vnd: 10_200_000_000,
    price_display: "10.2 tỷ",
    price_sub: "≈ 77.2 tr/m²",
    area_m2: 132,
    location: "Cao Lỗ, Phường 4, Quận 8",
    district: "Quận 8",
    image: "/img/house1.jpg",
    badge: "Mặt tiền 30m",
    featured: true,
    bullets: [
      "Mặt tiền đường Cao Lỗ lộ giới 30m, vỉa hè 4m, liền kề Đại học Công nghệ Sài Gòn và Bệnh viện Quận 8.",
      "Diện tích đất 132m² (5.2m × 25.4m), kết cấu 1 trệt 2 lầu sân thượng, 4 phòng ngủ, 5 WC, có giếng trời đón gió.",
      "Sổ hồng riêng hoàn công đầy đủ, pháp lý chuẩn chỉnh, sẵn sàng công chứng sang tên ngay trong ngày.",
      "10.2 tỷ (thương lượng trực tiếp chính chủ, hỗ trợ vay ngân hàng 70% với lãi suất ưu đãi).",
    ],
  },
  {
    id: "curated-2",
    code: "NB-SR485",
    kind: "can_ho",
    kindLabel: "Căn hộ cao cấp",
    deal: "ban",
    title: "Bán căn hộ 3 phòng ngủ Sunrise Riverside Novaland Nhà Bè view sông thoáng mát đã có sổ hồng nội thất cao cấp",
    price_vnd: 4_850_000_000,
    price_display: "4.85 tỷ",
    price_sub: "≈ 52.1 tr/m²",
    area_m2: 93,
    location: "Khu dân cư Sunrise Riverside, Phước Kiển, Nhà Bè",
    district: "Nhà Bè",
    image: "/img/house2.jpg",
    badge: "View sông mát",
    bullets: [
      "Khu đô thị Sunrise Riverside Phước Kiển Nhà Bè, giáp ranh Phú Mỹ Hưng, di chuyển sang Quận 1 chỉ 15 phút.",
      "Diện tích thông thuỷ 93m², 3 phòng ngủ, 2 WC, ban công thoáng nhìn trọn sông Rạch Đĩa và hồ bơi 2000m².",
      "Sổ hồng sở hữu lâu dài, pháp lý hoàn chỉnh, sang tên chuyển nhượng nhanh chóng.",
      "4.85 tỷ (bao toàn bộ thuế phí sang tên, tặng trọn gói nội thất gỗ An Cường cao cấp).",
    ],
  },
  {
    id: "curated-3",
    code: "BC-MZ145",
    kind: "biet_thu",
    kindLabel: "Biệt thự compound",
    deal: "ban",
    title: "Bán biệt thự đơn lập khu compound sinh thái Mizuki Park Bình Chánh bảo vệ an ninh ba lớp view công viên kênh đào",
    price_vnd: 14_500_000_000,
    price_display: "14.5 tỷ",
    price_sub: "≈ 72.5 tr/m²",
    area_m2: 200,
    location: "Khu đô thị Mizuki Park, Bình Hưng, Bình Chánh",
    district: "Bình Chánh",
    image: "/img/house3.jpg",
    badge: "Compound ven sông",
    featured: true,
    bullets: [
      "Khu compound biệt thự đảo Valora Island Mizuki Park, Nguyễn Văn Linh, Bình Chánh, an ninh khép kín 24/7.",
      "Diện tích đất 200m² (10m × 20m), sàn 268m², 1 trệt 2 lầu, 4 phòng ngủ master, sân vườn trước sau đỗ 2 ô tô.",
      "Sổ hồng riêng cá nhân, hoàn công đủ, không tranh chấp, không vướng quy hoạch.",
      "14.5 tỷ (giá chốt thiện chí, chủ nhà để lại toàn bộ thiết bị smart-home và nội thất nhập khẩu).",
    ],
  },
  {
    id: "curated-4",
    code: "Q5-TBT78",
    kind: "nha",
    kindLabel: "Nhà hẻm ô tô",
    deal: "ban",
    title: "Bán nhà hẻm xe hơi 6m Trần Bình Trọng Phường 4 Quận 5 ô tô 7 chỗ vào tận nhà gần ngã tư An Dương Vương",
    price_vnd: 7_800_000_000,
    price_display: "7.8 tỷ",
    price_sub: "≈ 134.4 tr/m²",
    area_m2: 58,
    location: "Trần Bình Trọng, Phường 4, Quận 5",
    district: "Quận 5",
    image: "/img/house4.jpg",
    badge: "Hẻm 6m ô tô",
    bullets: [
      "Hẻm nhựa 6m đường Trần Bình Trọng, Phường 4, Quận 5, xe 7 chỗ vào tận nhà, cách mặt tiền chỉ 30m.",
      "Diện tích đất 58m² (4.1m × 14.2m) vuông vức, đúc 1 trệt 2 lầu sân thượng, 3 phòng ngủ, 3 WC, nhà mới ở ngay.",
      "Sổ hồng riêng chính chủ lâu năm, hoàn công đầy đủ, công chứng mua bán ngay.",
      "7.8 tỷ (thương lượng lộc cho khách mua nhanh, hỗ trợ thủ tục vay ngân hàng 5.5 tỷ).",
    ],
  },
  {
    id: "curated-5",
    code: "Q5-NT45T",
    kind: "mat_bang",
    kindLabel: "Mặt bằng kinh doanh",
    deal: "cho_thue",
    title: "Cho thuê mặt bằng kinh doanh phố thời trang sầm uất Nguyễn Trãi Phường 3 Quận 5 vỉa hè rộng giao thông tấp nập",
    price_vnd: 45_000_000,
    price_display: "45 triệu/th",
    price_sub: "≈ 529k/m²",
    area_m2: 85,
    location: "Nguyễn Trãi, Phường 3, Quận 5",
    district: "Quận 5",
    image: "/img/house5.jpg",
    badge: "Phố thời trang",
    bullets: [
      "Vị trí đắc địa trên tuyến phố mua sắm Nguyễn Trãi, Phường 3, Quận 5, vỉa hè 3.5m, lưu lượng khách đông đúc.",
      "Diện tích sử dụng 85m² (4.2m × 20m), mặt tiền kính suốt hiện đại, hệ thống đèn chiếu sáng sẵn có, lối đi riêng.",
      "Hợp đồng thuê linh hoạt từ 2 đến 5 năm, pháp lý minh bạch, xuất hoá đơn VAT đầy đủ.",
      "45 triệu/tháng (cọc 3 tháng, hỗ trợ miễn phí 15 ngày sửa chữa và lắp đặt nhận diện thương hiệu).",
    ],
  },
  {
    id: "curated-6",
    code: "LA-BL185",
    kind: "dat",
    kindLabel: "Đất thổ cư đô thị",
    deal: "ban",
    title: "Bán lô đất thổ cư đô thị đường Hùng Vương thị trấn Bến Lức Long An cách nút giao cao tốc Trung Lương chỉ năm phút",
    price_vnd: 1_850_000_000,
    price_display: "1.85 tỷ",
    price_sub: "≈ 16.1 tr/m²",
    area_m2: 115,
    location: "Hùng Vương, Thị trấn Bến Lức, Long An",
    district: "Bến Lức, Long An",
    image: "/img/house1.jpg",
    badge: "Thổ cư 100%",
    bullets: [
      "Mặt tiền đường Hùng Vương nối dài, Thị trấn Bến Lức, Long An, kết nối Quốc lộ 1A và cao tốc Bến Lức chỉ 5 phút.",
      "Diện tích 115m² (5m × 23m), đất vuông vức cao ráo, đường nhựa trước đất 12m có vỉa hè và hạ tầng hoàn chỉnh.",
      "Sổ đỏ thổ cư 100% ODT (đất ở đô thị), công chứng sang tên ngay, xây dựng tự do.",
      "1.85 tỷ (giá niêm yết chính xác, bao toàn bộ thuế phí công chứng và đăng bộ đổi sổ mới).",
    ],
  },
  {
    id: "curated-7",
    code: "Q10-CT128",
    kind: "toa_nha",
    kindLabel: "Căn hộ dịch vụ / Dòng tiền",
    deal: "ban",
    title: "Bán toà nhà căn hộ dịch vụ mười phòng khép kín full nội thất Cao Thắng Phường 12 Quận 10 đang khai thác dòng tiền ổn định",
    price_vnd: 12_800_000_000,
    price_display: "12.8 tỷ",
    price_sub: "Dòng tiền 55tr/th",
    area_m2: 72,
    location: "Cao Thắng, Phường 12, Quận 10",
    district: "Quận 10",
    image: "/img/house2.jpg",
    badge: "Thu nét 55tr/th",
    bullets: [
      "Hẻm xe tải đường Cao Thắng, Phường 12, Quận 10, gần Vạn Hạnh Mall và tuyến Metro số 2 tương lai.",
      "Diện tích đất 72m² (4.5m × 16m), xây 1 trệt 4 lầu sân thượng, 10 phòng studio full nội thất có thang máy thẻ từ.",
      "Sổ hồng riêng hoàn công đủ 5 tầng, hệ thống phòng cháy chữa cháy PCCC đạt chuẩn an toàn.",
      "12.8 tỷ (đang full khách thuê thu 55 triệu/tháng, sẵn sàng bàn giao hợp đồng và quy trình quản trị).",
    ],
  },
];
