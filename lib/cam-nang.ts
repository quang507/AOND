// SRS-5.1zzzzzzz443 (chủ dự án 12/11/2026 "lấy mấy cái này thì lấy lun"): mục /cam-nang. Lấy DANH SÁCH ĐỀ TÀI và cách dựng bài
// (mỗi mục có link sang trang khu) từ /tin-tuc của NhaDat-Radar; NỘI DUNG viết mới, vì:
//   - nhadatradar.com đang chạy thật, chép nguyên văn là trùng nội dung, Google chỉ xếp một bên;
//   - bài bên đó có số không nguồn (lãi suất 5,5–7,5%…) và giọng văn mẫu.
// Luật viết: không đưa con số nào không kiểm được. Con số theo luật thì ghi văn bản gốc VÀ nhắc hỏi lại nơi làm thủ tục, vì luật đổi.
// Không đánh số tiêu đề mục, không chấm cuối tiêu đề.

export type MucBai = {
  h2: string;
  doan?: string[];
  ds?: string[];
  lienKet?: { nhan: string; href: string }[];
};

export type BaiCamNang = {
  slug: string;
  tieuDe: string;
  moTa: string;
  ngay: string;
  muc: MucBai[];
};

export const CAM_NANG: BaiCamNang[] = [
  {
    slug: "kiem-tra-phap-ly-truoc-khi-dat-coc",
    tieuDe: "Kiểm tra pháp lý nhà phố trước khi đặt cọc",
    moTa: "Những gì cần xem trên sổ, ở phường và ở văn phòng công chứng trước khi đưa tiền cọc, và hợp đồng cọc nên ghi gì.",
    ngay: "2026-11-12",
    muc: [
      {
        h2: "Xem sổ bản gốc và người đứng tên",
        doan: [
          "Bản chụp gửi qua Zalo chỉ để xem sơ. Trước khi cọc, hẹn xem sổ bản gốc, đối chiếu tên, năm sinh, số giấy tờ tùy thân trên sổ với căn cước của người đang bán.",
          "Nhà mua trong thời kỳ hôn nhân thường là tài sản chung, cần cả vợ và chồng cùng ký. Nhà thừa kế chưa chia, hoặc sổ đứng tên nhiều người, thì phải đủ tất cả những người có tên đồng ý bán. Người đứng ra bán chỉ có giấy ủy quyền thì đọc kỹ phạm vi ủy quyền: được bán, được nhận tiền, hay chỉ được dẫn đi xem.",
        ],
      },
      {
        h2: "Đọc các trang biến động phía sau",
        doan: [
          "Các trang cuối của sổ ghi những lần đổi chủ, tách thửa, và thế chấp. Nhà đang thế chấp ngân hàng vẫn mua được, nhưng phải giải chấp trước khi công chứng, hoặc làm thỏa thuận ba bên với ngân hàng: tiền của người mua trả thẳng cho ngân hàng để lấy sổ ra.",
        ],
      },
      {
        h2: "Hỏi quy hoạch và lộ giới",
        doan: [
          "Phần đất nằm trong lộ giới hay trong quy hoạch mở đường có thể bị thu hồi sau này, và thường bị hạn chế xây sửa. Hỏi thông tin quy hoạch ở phường, hoặc tra trên cổng thông tin quy hoạch của TP.HCM, rồi so với vị trí thửa đất ghi trên sổ.",
          "Trên sổ đời mới thường có ghi chú phần diện tích thuộc lộ giới. Diện tích công nhận và diện tích thực tế lệch nhau nhiều thì hỏi cho ra lý do.",
        ],
      },
      {
        h2: "So hiện trạng với giấy tờ",
        ds: [
          "Số tầng, diện tích xây dựng thực tế có khớp giấy phép và hoàn công không. Phần xây thêm chưa hoàn công thì khi sang tên chỉ ghi phần đã được công nhận, ngân hàng cũng định giá theo đó.",
          "Ranh đất với hai nhà bên cạnh: tường chung hay tường riêng, có phần nào lấn sang không.",
          "Lối đi: nhà trong hẻm thì lối đi ra đường là đất công, lối đi chung có ghi trên sổ, hay đi nhờ đất người khác.",
        ],
      },
      {
        h2: "Hỏi văn phòng công chứng về tranh chấp, ngăn chặn",
        doan: [
          "Văn phòng công chứng có tra cứu được thông tin ngăn chặn giao dịch (đang bị kê biên, đang có tranh chấp được tòa án hay cơ quan thi hành án báo). Hỏi tra trước khi cọc, không đợi tới ngày ký. Hỏi thêm hàng xóm, tổ trưởng khu phố về chuyện nhà đó.",
        ],
      },
      {
        h2: "Hợp đồng cọc nên ghi gì",
        ds: [
          "Số sổ, địa chỉ, diện tích, giá bán, số tiền cọc và các đợt trả tiếp theo.",
          "Hạn ra công chứng, và việc gì phải xong trước hạn đó (giải chấp, hoàn công, đủ người ký).",
          "Ai nộp thuế thu nhập cá nhân, lệ phí trước bạ, phí công chứng.",
          "Phạt cọc: theo Bộ luật Dân sự 2015 (Điều 328), bên nhận cọc từ chối bán thì trả lại tiền cọc và một khoản bằng tiền cọc, bên đặt cọc từ chối mua thì mất cọc, trừ khi hai bên thỏa thuận khác. Ghi rõ trong hợp đồng để khỏi cãi.",
        ],
        doan: [
          "Cọc ở văn phòng công chứng hoặc có người làm chứng thì đỡ rủi ro hơn giấy tay hai bên.",
        ],
        lienKet: [
          { nhan: "Xem nhà đang bán", href: "/mua-ban" },
          { nhan: "Tính trước tiền vay", href: "/tinh-lai-vay" },
        ],
      },
    ],
  },
  {
    slug: "mua-nha-hem-sai-gon",
    tieuDe: "Mua nhà hẻm Sài Gòn: đo hẻm, hỏi lộ giới, xem lúc mưa",
    moTa: "Chữ \"hẻm xe hơi\" trên tin rao chưa nói đủ. Cách tự đo hẻm, hỏi lộ giới hẻm, và vài chuyện chỉ thấy khi tới tận nơi.",
    ngay: "2026-11-12",
    muc: [
      {
        h2: "Đo hẻm bằng thước, đừng chỉ đọc chữ trên tin",
        doan: [
          "\"Hẻm xe hơi\" có thể là xe vào được tới cửa, cũng có thể là xe vào được tới đầu hẻm rồi lùi ra. Xe vào được tới cửa, hai xe tránh nhau được, xe quay đầu được là ba chuyện khác nhau. Mang thước đo chỗ hẹp nhất của cả đoạn từ đường chính vào tới nhà, không đo ngay trước cửa.",
          "Đếm luôn số lần rẽ và khoảng cách ra đường chính. Hẻm sâu ba bốn lớp thì đi lại, chở hàng, gọi xe cứu thương đều chậm hơn, và giá thường thấp hơn hẻm một lớp cùng khu.",
        ],
      },
      {
        h2: "Hỏi lộ giới của hẻm",
        doan: [
          "TP.HCM có quy định riêng về lộ giới đường hẻm. Hẻm hiện rộng ba mét nhưng lộ giới sáu mét thì khi xây mới hay sửa lớn, phần nằm trong lộ giới phải chừa ra. Hỏi phường lộ giới hẻm của căn mình nhắm, rồi tính lại diện tích còn xây được.",
        ],
      },
      {
        h2: "Hẻm cụt, hẻm thông và lối đi chung",
        ds: [
          "Hẻm thông thì thoáng, đi tắt được, nhưng xe qua lại nhiều hơn. Hẻm cụt yên hơn, đổi lại chỉ có một lối ra.",
          "Hẻm nằm trên đất công hay là lối đi chung của vài nhà. Lối đi chung nên có ghi trên sổ, kẻo sau này có người rào lại.",
          "Đầu hẻm có quán, chợ tự phát, chỗ đậu xe chiếm lối không. Đi vào giờ cao điểm sáng và tối để thấy.",
        ],
      },
      {
        h2: "Đi xem lúc mưa lớn hoặc triều cường",
        doan: [
          "Nhiều khu ở Sài Gòn ngập khi mưa lớn hoặc khi triều lên. Nền nhà thấp hơn mặt hẻm là dấu hiệu dễ thấy. Hỏi hàng xóm nước lên tới đâu, rút mất bao lâu, và xem chân tường, cửa cuốn có vết nước cũ không.",
        ],
      },
      {
        h2: "So giá với nhà cùng phường",
        doan: [
          "Nhà hẻm thường rẻ hơn nhà mặt tiền cùng tuyến, hẻm nhỏ rẻ hơn hẻm lớn. So giá mỗi mét vuông với các căn cùng phường, cùng kiểu đường vào, thay vì so với một căn bất kỳ trong quận.",
          "Mỗi tin trên AI Ơi Nhà Đất ghi đường vào là mặt tiền, hẻm xe tải, hẻm xe hơi hay hẻm xe máy, kèm bề rộng hẻm và khoảng cách ra đường khi chủ nhà có cung cấp.",
        ],
        lienKet: [
          { nhan: "Nhà hẻm xe hơi Sài Gòn", href: "/ban-nha-hem-xe-hoi-sai-gon" },
          { nhan: "Giá theo phường", href: "/thong-ke" },
        ],
      },
    ],
  },
  {
    slug: "nha-so-chung-vi-bang",
    tieuDe: "Nhà sổ chung, vi bằng: rẻ vì đâu, rủi ro ở chỗ nào",
    moTa: "Vì sao nhà sổ chung, mua bán bằng vi bằng hay giấy tay thường rẻ hơn, và người mua gánh những rủi ro gì.",
    ngay: "2026-11-12",
    muc: [
      {
        h2: "Sổ chung là gì",
        doan: [
          "Sổ chung là một giấy chứng nhận cho một thửa đất mà nhiều người cùng đứng tên, hoặc một căn nhà lớn đã chia thành nhiều căn nhỏ nhưng chưa tách sổ. Người mua một căn trong đó thực chất mua một phần quyền trên cả thửa.",
          "Thửa nhỏ hơn diện tích tối thiểu được tách thửa của thành phố thì không tách sổ riêng được. Khi đó người mua khó vay ngân hàng, khó bán lại, và mỗi lần giao dịch cần các đồng sở hữu khác đồng ý.",
        ],
      },
      {
        h2: "Vi bằng không thay được hợp đồng công chứng",
        doan: [
          "Vi bằng do thừa phát lại lập để ghi nhận một sự việc, ví dụ hai bên giao nhận tiền. Nghị định 08/2020 nói rõ vi bằng không thay thế văn bản công chứng, chứng thực. Mua nhà bằng vi bằng thì không dùng vi bằng đó để sang tên được, người bán vẫn là chủ trên giấy tờ.",
          "Giấy tay còn yếu hơn: không ai xác nhận, dễ bị bán cho nhiều người, người bán mất thì phải làm việc với người thừa kế.",
        ],
      },
      {
        h2: "Nếu vẫn muốn mua",
        ds: [
          "Gặp đủ những người đứng tên trên sổ, không chỉ người đang ở trong nhà.",
          "Hỏi phường xem thửa đất có đủ điều kiện tách sổ không, nếu có thì tách trước rồi mới mua.",
          "Giá phải thấp hơn hẳn nhà sổ riêng cùng khu, đủ bù cho rủi ro và chuyện khó bán lại.",
          "Nhờ luật sư đọc giấy tờ. Chi phí nhỏ so với số tiền mua nhà.",
        ],
      },
      {
        h2: "Trên AI Ơi Nhà Đất",
        doan: [
          "Tin rao ghi loại giấy tờ theo lời chủ nhà: sổ hồng riêng, sổ chung, giấy tay, đang chờ sổ. Điều chưa xác minh được thì ghi là chưa xác minh. Hỏi thêm về một căn thì nhắn mã tin qua Zalo.",
        ],
        lienKet: [{ nhan: "Xem nhà đang bán", href: "/mua-ban" }],
      },
    ],
  },
  {
    slug: "cong-chung-sang-ten-nha-dat",
    tieuDe: "Công chứng và sang tên nhà đất: các bước từ cọc tới cầm sổ",
    moTa: "Thứ tự các bước mua bán nhà đã có sổ ở Sài Gòn, giấy tờ cần mang, và cách chia đợt trả tiền cho an toàn.",
    ngay: "2026-11-12",
    muc: [
      {
        h2: "Chuẩn bị giấy tờ",
        ds: [
          "Bên bán: sổ bản gốc, căn cước của những người đứng tên, giấy tờ về hôn nhân (đăng ký kết hôn, hoặc xác nhận độc thân), giấy ủy quyền nếu có người bán thay.",
          "Bên mua: căn cước, giấy tờ về hôn nhân.",
          "Văn phòng công chứng sẽ báo thêm giấy tờ riêng theo từng trường hợp (thừa kế, nhà đang thế chấp, người bán ở nước ngoài). Gọi hỏi trước để khỏi đi hai lần.",
        ],
      },
      {
        h2: "Ký hợp đồng mua bán ở văn phòng công chứng",
        doan: [
          "Hợp đồng mua bán nhà đất phải công chứng hoặc chứng thực. Với nhà đất, văn phòng công chứng phải ở cùng tỉnh, thành nơi có nhà. Công chứng viên đọc hợp đồng, kiểm tra giấy tờ, tra thông tin ngăn chặn, rồi hai bên ký trước mặt công chứng viên.",
        ],
      },
      {
        h2: "Khai thuế, lệ phí và nộp hồ sơ sang tên",
        doan: [
          "Sau khi công chứng, nộp hồ sơ đăng ký biến động (sang tên) ở bộ phận một cửa hoặc chi nhánh văn phòng đăng ký đất đai nơi có nhà, kèm tờ khai thuế thu nhập cá nhân và lệ phí trước bạ. Cơ quan thuế ra thông báo số tiền, hai bên nộp, rồi nhận sổ đã cập nhật tên người mua.",
          "Thời gian mỗi nơi một khác, thường tính bằng tuần. Hỏi chỗ nộp hồ sơ ngày hẹn trả.",
        ],
        lienKet: [{ nhan: "Thuế phí khi mua bán nhà", href: "/cam-nang/thue-phi-mua-ban-nha" }],
      },
      {
        h2: "Chia đợt trả tiền",
        ds: [
          "Đợt cọc: vừa đủ để giữ căn, đừng cọc phần lớn giá trị.",
          "Đợt công chứng: phần lớn số tiền, trả ngay tại văn phòng công chứng hoặc chuyển khoản có ghi nội dung rõ ràng.",
          "Đợt cuối: giữ lại một phần tới khi nhận sổ mới đứng tên mình.",
          "Mua bằng tiền vay thì ngân hàng giải ngân theo lịch riêng, thường sau khi hồ sơ sang tên đã nộp. Thỏa thuận lịch này với người bán từ lúc cọc.",
        ],
        lienKet: [{ nhan: "Tính tiền vay mỗi tháng", href: "/tinh-lai-vay" }],
      },
    ],
  },
  {
    slug: "thue-phi-mua-ban-nha",
    tieuDe: "Thuế phí khi mua bán nhà: ai trả khoản nào",
    moTa: "Thuế thu nhập cá nhân, lệ phí trước bạ, phí công chứng: luật đặt cho ai, khi nào được miễn, và vì sao nên ghi rõ trong hợp đồng cọc.",
    ngay: "2026-11-12",
    muc: [
      {
        h2: "Thuế thu nhập cá nhân, phía người bán",
        doan: [
          "Cách tính đã áp dụng nhiều năm là 2% trên giá chuyển nhượng ghi trong hợp đồng (Thông tư 111/2013 của Bộ Tài chính). Giá trong hợp đồng thấp hơn bảng giá đất của nhà nước thì tính theo bảng giá.",
          "Luật thuế thu nhập cá nhân đang được sửa đổi và có thể đổi cách tính với bất động sản. Trước khi ký, hỏi công chứng viên hoặc chi cục thuế mức đang áp dụng đúng ngày ký.",
        ],
      },
      {
        h2: "Lệ phí trước bạ, phía người mua",
        doan: [
          "Mức lệ phí trước bạ nhà đất theo Nghị định 10/2022 là 0,5% giá trị tính lệ phí. Cũng như thuế, nên hỏi lại mức đang áp dụng khi làm hồ sơ.",
        ],
      },
      {
        h2: "Phí công chứng và các phí khác",
        doan: [
          "Phí công chứng hợp đồng tính theo giá trị hợp đồng, theo biểu phí của Bộ Tài chính, cộng tiền soạn thảo nếu nhờ văn phòng soạn. Ngoài ra có phí thẩm định hồ sơ, phí cấp hoặc chỉnh lý giấy chứng nhận theo mức của từng tỉnh. Văn phòng công chứng báo được tổng số trước khi ký.",
        ],
      },
      {
        h2: "Ai trả là do hai bên thỏa thuận",
        doan: [
          "Luật đặt người bán nộp thuế thu nhập, người mua nộp lệ phí trước bạ. Nhưng trên thực tế hai bên hay thỏa thuận khác: \"bán giá ròng\" nghĩa là người mua chịu hết. Ghi rõ trong hợp đồng cọc ai trả khoản nào để khỏi cãi nhau ở văn phòng công chứng.",
        ],
      },
      {
        h2: "Trường hợp được miễn",
        doan: [
          "Luật hiện hành miễn thuế thu nhập cá nhân khi chuyển nhượng giữa vợ chồng, cha mẹ với con, ông bà với cháu, anh chị em ruột với nhau, và khi người bán chỉ có duy nhất một nhà ở, kèm điều kiện về thời gian sở hữu. Có miễn hay không do cơ quan thuế xét theo hồ sơ, hỏi trước khi chốt giá.",
        ],
      },
      {
        h2: "Ghi giá thấp trong hợp đồng",
        doan: [
          "Ghi giá thấp hơn giá thật để giảm thuế là chuyện hay gặp, nhưng người mua chịu rủi ro: có tranh chấp thì hợp đồng chỉ chứng minh được số tiền ghi trên giấy, bán lại sau này thì phần chênh tính vào lần bán đó.",
        ],
        lienKet: [
          { nhan: "Thuê hay mua, đường nào lợi hơn", href: "/thue-hay-mua" },
          { nhan: "Tính lãi vay", href: "/tinh-lai-vay" },
        ],
      },
    ],
  },
  {
    slug: "nhan-biet-tin-ao-va-tra-gia",
    tieuDe: "Nhận ra tin rao ảo và trả giá nhà cho có cơ sở",
    moTa: "Vài dấu hiệu của tin rao câu khách, và cách chuẩn bị số liệu trước khi trả giá để người bán chịu nghe.",
    ngay: "2026-11-12",
    muc: [
      {
        h2: "Dấu hiệu tin câu khách",
        ds: [
          "Giá thấp hơn hẳn các căn cùng phường, cùng kiểu đường vào, mà tin không nói lý do.",
          "Không có tên đường, chỉ ghi chung chung \"trung tâm quận\".",
          "Ảnh đẹp như ảnh mẫu, hoặc cùng bộ ảnh xuất hiện ở nhiều tin khác giá khác nhau. Tìm ảnh ngược trên Google là ra.",
          "Gọi tới thì căn đó \"vừa bán\", người nghe máy mời xem căn khác đắt hơn.",
          "Mời đi xem đất ở tỉnh xa, có xe đưa đón, giục cọc ngay trong ngày.",
        ],
      },
      {
        h2: "Biết giá khu trước khi đi xem",
        doan: [
          "Mỗi trang khu trên AI Ơi Nhà Đất có giá rao mỗi mét vuông ở giữa: nửa số căn rao cao hơn, nửa thấp hơn. Đây là giá rao, chưa phải giá đã giao dịch, nhưng đủ để biết một căn đang rao cao hay thấp so với xung quanh.",
        ],
        lienKet: [
          { nhan: "Bán nhà Quận 8", href: "/ban-nha-quan-8" },
          { nhan: "Bán nhà Bình Thạnh", href: "/ban-nha-binh-thanh" },
          { nhan: "Giá theo phường", href: "/thong-ke" },
        ],
      },
      {
        h2: "Gom lý do cụ thể",
        ds: [
          "Phần diện tích nằm trong lộ giới, phần xây chưa hoàn công.",
          "Hẻm hẹp hơn tin ghi, ngập khi mưa, nhà tóp hậu.",
          "Chi phí phải sửa: thấm dột, điện nước cũ, kết cấu yếu. Hỏi thợ báo giá sơ bộ.",
          "Căn đã rao bao lâu, đã giảm giá lần nào chưa.",
        ],
        doan: [
          "Trả giá kèm lý do nghe dễ hơn một con số đưa ra không giải thích. Chê nhà trước mặt chủ thì ngược lại, thường làm họ cứng giá hơn.",
        ],
      },
      {
        h2: "Thứ người bán cần ngoài giá",
        doan: [
          "Hỏi vì sao bán. Người cần tiền gấp quan tâm trả nhanh, người đổi nhà quan tâm có thời gian dọn. Trả đủ tiền nhanh, đặt cọc ngay khi đã kiểm tra xong pháp lý, hay cho ở lại thêm vài tháng đôi khi đổi được một khoản giảm giá.",
        ],
        lienKet: [{ nhan: "Kiểm tra pháp lý trước khi đặt cọc", href: "/cam-nang/kiem-tra-phap-ly-truoc-khi-dat-coc" }],
      },
    ],
  },
];

export const baiBySlug = (slug: string) => CAM_NANG.find((b) => b.slug === slug);
