// chat-reply — "bộ não" hội thoại B-side tách khỏi kênh (NFR-12).
// Kênh nào (OA webhook, bridge zca-js test, web chat sau này) cũng gọi vào đây.
// POST { external_user_id, text, msg_id?, channel? }
//   → { reply, replies[], conversation_id }
// Nhánh BUYER theo FR-130: hồ sơ nhu cầu tích luỹ (buyers.preferences), mỗi
// lượt hỏi đúng MỘT tiêu chí thiếu, trả lời tách tối đa 2 bong bóng.
import { z } from "npm:zod@4";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import {
  anthropicClient,
  anthropicTrucTiep,
  bangNhau,
  type DemLuuLuong,
  docBiMat,
  doTien,
  ghiLoi,
  jsonResponse,
  MODEL,
  secretOf,
  serviceClient,
  tomTatLuuLuong,
} from "../_shared/claude.ts";
import {
  AGREE_RULES,
  BUYER_FEWSHOT,
  FEE_RULES,
  BUYER_PROFILE_FIELDS,
  FACT_LABELS,
  nhanTheoLoai,
  HUMAN_CHAT_RULES,
  SELLER_FEWSHOT, SELLER_SCRIPT_RULES, cauHoiMau as cauHoiMauGoc, cauPhuongNgan, docCauHoiMau, docCauTienDinh, dienCau, LOI_CHAO,
  SLANG_NOTES,
  TONE_RULES, CAU_HOI_MAU_TEXT, CAU_TIEN_DINH_TEXT, CAU_HOI_MAU as CAU_HOI_MAU_GOC,
  dienTen, tenTroLy, // FR-181: mỗi khách một tên trợ lý (T•ai, Kh•ai…)
  cauBaoPhi, cauPhi, // SRS-5.1zzq: câu phí MỘT NGUỒN theo vai + loại giao dịch
  coCauPhi, coCauPhiChuaRoVai, coCauPhiTheoVai, vaiPhi, phanTramPhi, viDuPhi, // SRS-5.1zzzze: lượt đã nói phí chưa — đối chiếu đúng chữ cauPhi() sinh
  tenHang, // SRS-5.1zzs: tên hạng Đồng / Bạc / Vàng cho câu lên kệ
  AD_FORMAT, FEE_VALUE_POINTS,
} from "../_shared/prompts.ts";
import { SPEC_COLS, thongSoNgan, type SpecRow } from "../_shared/thong_so.ts";
import { chuanY, type FactNhap, soanTinNhapHaiBong, tenDuAnKho, type TinNhapRow } from "../_shared/tin-nhap.ts";
// 11/09/2026: báo lại cho người bán thứ ĐÃ LƯU trong DB (công tắc app_config.bao_lai_da_luu).
import {
  aiDocThem, bocTachTaoTin, boBaoLai, BOC_YEU_CAU, bongTrichXuat, bongYeuCau, COT_BAO_LAI, DAU_BAO_LAI, docCheDo, dongFact, dongVuaLuu, HIEU_LUOT, KHONG_BOC, NGUON_AI, nhanNgan, phuongKemQuanCu, timNguyenMau, traLoiCauBot, TU_ANH, vuaLuuBan, vuaLuuMua,
  type CheDoBaoLai, type DongBaoLai, type FactBaoLai,
} from "../_shared/bao_lai.ts";
import { bocRaoBangModel, CAU_KHONG_PHAI_O } from "../_shared/ai/boc-rao.ts";
import { soatNhanXetBangModel } from "../_shared/ai/kiem-khen.ts";
import { vietKhenNhapBangModel } from "../_shared/ai/khen-nhap.ts";
import { cauDuAnCoNguon, khenHopLe, loiNhanGiayToHopLe, tienIchNoiBatHopLe, tieuDeHopLe } from "../_shared/extraction/khen-hop-le.ts";
import { gopDuAnTrung, tienIchDuAnSach } from "../_shared/extraction/du-an-kho.ts";
import { docYLuotBangModel, type YLuotLLM } from "../_shared/ai/doc-y-luot.ts";
import { ganManhBangModel } from "../_shared/ai/gan-manh.ts"; // FR-214 b/d: một người nhiều căn
import { bocGhiAi, chayCoDoGio, chayCoGhiAi, gioAiHienTai, type DongGhiAi } from "../_shared/ai/ghi-luot-ai.ts"; // SRS-5.1zzzzzd: ghi đầu ra model của ID thử
import { canGanManh, donManh } from "../_shared/extraction/gan-manh-loc.ts";
// 05/10/2026 (demo AOND, SRS-5.1zzj…zzm): file / link người bán gửi, tài liệu dự án, nhập rổ hàng, nhịp gửi.
import { base64, docCsv, docLinkDrive, docXlsx, loaiTep, m2TuChu, taiTep, tangTuChu, timLinkTrongChu, transcribeVoiceUrl, type TepTai } from "../_shared/kho_tep.ts";
import { docTaiLieuDuAn, type NguonTaiLieu, type TaiLieuDoc } from "../_shared/ai/doc-tai-lieu-du-an.ts";
import { bangThanhTin, cauRaoTuDong } from "../_shared/nhap-ro-hang.ts";
import { nhipGui } from "../_shared/nhip-gui.ts";
import { laNgungHangLoat, suaGiaTrongLoi } from "../_shared/extraction/khop-cau-tra-loi.ts";
import { docKhongBiet, docNgungHangLoat, khongBietCua, giaTriKhongDoi, vaiTuCau, laChiGat, laCauHoiXacNhan } from "../_shared/extraction/kiem-bang-chung.ts";
import { LOAI_VI, loaiDoc } from "../_shared/tin-nhap.ts";
import { type AiChinh, chonDeGhi, datKiemNhe, docCamXuc, docCauKe, docDongY, docLaiHopLe, docKhongCanHoi, docMuaKem, docYeuCau, docTuXung, docVai, docYDinh, yLuotLech, type YLuot, type GoiYXacNhan, KHOA_XAC_NHAN, kiemXacNhan, nangXacNhanChac, chonViTri, coMuiDuLieuRao, coNoiDungTraLoi, type DeXuat, docAiChinh, type DongDb, giaTriChoCauTreo, KHOA_FACT_AI_BIET, kichThuoc, kiemCapNhat, traLoiThuocOKhac, khoaTraLoiCau, type CapNhatDeXuat, kiemDeXuat, kiemYCuocRao, KHOA_Y_CUOC_RAO, kiemKienThuc, kiemTraLoiCau, laTrongCapNhat, soSanhVoiDb, boSungDiaChiTuKienThuc } from "../_shared/extraction/kiem-bang-chung.ts";
import { chonGiaRao, dealCauRao, dienTichCauRao, duAnLaTenDuong, DUOI_GIA, ghepSoNhaHem, gotDiaChi, laSoNhaHem, ngangDaiCauRao, ngangNhanDai, phuongTenCauRao, phuongTenKhongDau, tachSoNhaHem, TRUOC_LA_SAN } from "../_shared/extraction/boc-cau-rao.ts";
import { cauHoiPhuongGan, laTenPhuongChu, nghiaDuChac, type Phuong, chiLaDonViHanhChinh, phuongChuan, phuongNhacTrongCau, tenDayDu, phuongCot, tenPhuongCot, viTriGhiDuoc } from "../_shared/extraction/khop-phuong.ts";
import { bocQuan, cacQuanTrong, vungNgoai } from "../_shared/dia_ban.ts"; // FR-174: quận/huyện từ câu rao (+ vùng ngoài, 11/09)
// FR-209 (15/09): tra PHƯỜNG MỚI từ tên đường (Nominatim → bảng `wards`), hỏi xác nhận rồi mới ghi.
import { cauChonPhuongQuan, cauNhieuNoiPhuong, cauXacNhanPhuong, chuanTenDuong, cauTraPhuong, docCacPhuongNominatim, duongTraDuoc, phuongCuaDuongTrongQuan, phuongQuanCuaDuong, tachTienToPhuong } from "../_shared/extraction/tra-phuong.ts";
// FR-212 (21/09/2026): từ điển tên đường — chọn kết quả `tim_duong`, thay tên trong địa chỉ, câu hỏi xác nhận (thuần).
import { catTenDuong, cauXacNhanDuong, chonDuong, chonPhuongGanNhat, duongNhacKem, type GoiYDuong, khoaDuongSo, theTenDuong, type UngVienDuong } from "../_shared/extraction/tra-duong.ts";
import { tenDuong } from "../_shared/geocode.ts";
// FR-228 (25/09/2026): bộ câu tư vấn người mua của chủ dự án.
import { cauTuVanKe, laHoiNyah, NHAN_TU_VAN } from "../_shared/extraction/tu-van-mua.ts";
// Tầng bốn (11/09): luật tiền và luật che liên hệ MỘT NGUỒN — web, bot và bộ
// bóc tách cùng nhập từ đây, SQL `parse_vnd` thì đối chiếu trên cùng bảng ca.
import { CO_TIEN_KD, TIEN_KD, TIEN_CD, TIEN_T_KEP, docTien, donViGiaDep, giaTheoM2, gonGiaKyHan, laDonViTy, vndThanhChu } from "../_shared/extraction/luat-tien.ts";
import { soChuThanhSo } from "../_shared/extraction/so-chu.ts";
import { boHoaHong, coSdt, SDT_NGUON, thayLienHe, thayLienHeCoId } from "../_shared/extraction/luat-lien-he.ts";
// 11/09/2026: khách mua muốn ở GẦN đâu — model hiểu nghĩa (boc-gan), regex dự
// phòng (tien-ich), mốc + khoảng cách do SQL tính (tim-moc → tin_gan_moc).
import { coMuiViTri, docGanTienIch, nhanGan, type GanTienIch } from "../_shared/extraction/tien-ich.ts";
import { bocGanBangModel, thanhGan } from "../_shared/ai/boc-gan.ts";
import { nhungCauTim, xepTheoNghia } from "../_shared/ai/nhung.ts"; // FR-216
import { chonUngVienNghia, tenGan, TU_CHUNG_DU_AN, TU_CHUNG_DUONG } from "../_shared/extraction/khop-ten-nghia.ts";
import { docHoiLai, type HoiLaiDoc, locGiaTriHoSo, trichCoTrongTin } from "../_shared/extraction/kiem-bang-chung.ts";
import { chonDiaDanh, coChuPhuong, cungQuan, type DiaDanhChon, nhacTenQuan, type NhomDiaDanh, phuongTrungTenQuan, tenDiaDanhTron, type UngVienDiaDanh } from "../_shared/extraction/dia-danh.ts";
import { soanLenhJson } from "../_shared/lenh-json.ts"; // FR-217
import { timTienIchQuanh, timTinGanMoc, type TinGan } from "../_shared/tim-moc.ts";
import { cauKhoangCachKhongNguon, chayTroLyMua, DAU_RA_CONG_CU, doiLenhCuoiTroLy, LENH_CUOI_JSON, type PhanHoiModel } from "../_shared/ai/tro-ly.ts";
// FR-176: câu chủ nhà nhắn có phải câu trả lời không — tầng tiền định, không model.
import {
  batXungHo, bocViTriRao, chonCanTheoCau, gonGiaTriFact, laChiDonViHanhChinh, chonCauKe, cungHoFact, HOI_MOT_LAN, laBaoDang, laCauHoiTron, laDongY, laThaCamXuc, laStickerTrungTinh, laTinRongNghia, laDuRoi, laGap, laHoanLai, laKhongGiHet, laNgungRao, docTraLoiConBan, laRaoLai, laRutLoiBan, NHAN_HOI_LAI, nhanDienFact,
  loaiTuChu, nhanDienNhieuCan, nhanDienNhieuFact, laChiLenhDang, phanLoaiCauTraLoi, tachCauHoiNguoc, tachTheoCan, tuXungTuCau, vungPhuDinh, cheoPhuDinh, catDapAn, type KetQuaKhop, type NgungRao,
  suyTuXungHo, tuXungBot, laChaoChau, hocXungHoTuLichSu, cachGoiKhach, XUNG_HO_LON_TUOI, XUNG_HO_HOP_LE, type XungHo, boLoiChaoDau,
} from "../_shared/extraction/khop-cau-tra-loi.ts";
import { chanPhiChuaXacNhan, boCauNoiHeThong, boCauTroNguocDauBong, boChaoLai, boViTriBia, suaGapTheoDeal, goiDat, LOAI_DAT, boHuaHoiChuNha, boHoiLaiDaCo, boGhiNhanSuong, boKhenThiTruong, boTienBia, goiCanHo, boCauLapLai, giuVeCauMau, boCauHoiDo, boCauKhen, boDacDiemKhongCo, type CanDuLieu, boMaTinKhach, boMenhDeKhenSai, boCauNhanXet, nhanXetKhongCanCu, cauHoiGoiYKhongNguon, boCauHoiGoiY, loiKhongCanSoat, bongBongGoiYCan, type CanGoiY, coNhacCan, doiTuXung, themXinLoiKhiHieuNham, vuaKhen, anCauDaDap } from "../_shared/extraction/van-tra-loi.ts";
import { ganNhan, tenNhan } from "../_shared/extraction/nhan.ts";
import { ghepMotChieu, gonLoiSua, laBoSungRac, laCauChungChung, laCauCoKhong, laSoNhaTenDuong, laTraLoiTronKhoa, laChiQuan, laGatHoiVai, laBoSungTrung, LOAI_DUONG_VAO_RE, laNoiDaTraLoi, soNhaDau, soPhongNguTheoTang, themTangPhu, TIEU_TU_DAU, soTamCanHoiLung, lungChuaRoDem, docTraLoiLung, ketCauTheoLung, soTangTrongDapLung, phanNgoaiCauLung, timPhuongTrongCau, type PhuongDs } from "../_shared/extraction/khop-cau-tra-loi.ts";
// Đáp án ô `loai_bds` khi hàm DB đoán ra loại từ một câu dài (16/09/2026).
// Câu treo có đường ghi riêng — AI đọc trước KHÔNG thay đáp án (17/09/2026).
// Cột dự án bot đọc (02/10/2026, giảm egress): `match_projects` trả SETOF projects, không chọn cột thì mỗi dòng kéo theo
// `nhung` vector(768) (~9 KB dạng chữ) + `images`/`floor_plans` jsonb mà bot không dùng tới. Bot dùng cột nào mới thì thêm vào đây.
// Một chuỗi liền (không nối "+") để bộ đọc select của supabase-js còn suy được kiểu.
const COT_DU_AN = "id, name, slug, developer, district, ward, province, location_raw, lat, lng, legal_status, status_text, handover, handover_date, description, price_min, price_max, is_partner, priority, amenities, specs, unit_types, source, source_url";
// Câu hỏi mà câu trả lời LÀ một số tiền nhưng không phải giá bán (FR-223): số tiền kèm theo không được ghi thành `gia`.
const CAU_HOI_TIEN = new Set(["doanh_thu", "tien_coc", "phi_quan_ly", "phi_gui_xe", "gia_dien_nuoc"]);
// 27/09/2026 (test Zalo): câu "sổ đứng tên ai" — AI đọc "ba a thôi" (ba anh) thành "ba người", và bác "Anh đứng tên chính nhé"
// (câu rơi bổ sung, bot xin HỌ TÊN người đứng sổ). Giữ nguyên chữ khách nói.
/** Câu trong bảng theo loại mà có căn không áp dụng — danh mục đưa AI ở lượt câu rao (`khong_can_hoi`). */
const CAU_TUY_CAN = ["so_phong_ngu", "so_wc", "ket_cau", "tang", "do_rong_hem", "do_rong_duong", "noi_that", "phi_quan_ly", "huong",
  "thang_may", "hien_trang", "tho_cu", "mat_tien", "cach_mat_tien", "san_vuon", "chieu_cao", "duong_container"];
/** Câu NHÁNH `re-nhanh` có thể mở theo câu trả lời — đưa AI cùng danh sách câu còn hỏi (đợt 3). */
const CAU_NHANH = ["hoan_cong", "du_kien_ra_so", "giay_to_hien_co", "han_hop_dong_thue", "doanh_thu", "dong_so_huu_voi", "dong_y_ban",
  "ban_giao", "len_tho_cu", "no_hau", "do_rong_duong"];
/** Nhãn ngắn cho dòng 📝 "Em ghi vào…" — cùng bảng với 🤖 (`nhanNgan`, bao_lai.ts); FACT_LABELS là câu hỏi. */
const nhanGhi = (q: string): string => nhanNgan(q, FACT_LABELS);
/** Câu hỏi ĐỊA CHỈ: trả lời câu này mới được đổi quận đã ghi của tin. */
const CAU_DIA_CHI = new Set(["vi_tri", "phuong", "phuong@chua_quan", "quan"]);
/** Câu mà một cú thả cảm xúc (👍 ❤️) trả lời được: xin ĐỒNG Ý, không xin nội dung. */
const CAU_GAT_DUOC = new Set(["duyet_tin", "xac_nhan_lich", "con_ban", "xac_nhan_ngung_hang_loat"]);
const CAU_KHONG_LAY_AI = new Set(["phuong", "vi_tri", "loai_bds", "hinh_anh", "duyet_tin", "danh_gia", "ngung_rao_can_nao", "xac_nhan_lich", "con_ban", "nguoi_dung_ten", "xac_nhan_ngung_hang_loat", "tai_lieu_du_an_nao"]);
// 21/09/2026 (Zalo thật): ở chế độ `chinh`, câu VỊ TRÍ / PHƯỜNG vẫn để AI đọc trước — AI có tên đường /
// số phường sạch thì lấy; AI trống thì luật đỡ như cũ (không hạ "khớp" thành "lệch" như các khoá khác).
const CAU_AI_DOC_TRUOC_LUAT_DO = new Set(["vi_tri", "phuong"]);
/** SRS-5.1zzzzz: câu treo mà "không biết" là lời đáp hợp lệ (câu dữ kiện) — câu chốt luồng (duyệt, lịch, còn bán…) thì không. */
const CAU_KHONG_BIET_DUOC = (q: string) =>
  !["duyet_tin", "xac_nhan_lich", "con_ban", "ngung_rao_can_nao", "xac_nhan_ngung_hang_loat", "danh_gia", "tai_lieu_du_an_nao", "loai_bds"].includes(q);
// 01/10/2026 (bắn thử lx-hn-62): chỉ dẫn trả lời câu khách HỎI LẠI theo chủ đề AI đọc ra (`hoi_lai.chu_de`). Hệ thống KHÔNG
// có số liệu giá khu vực / thời gian bán — nói thật, không đưa con số, không hứa suông "em kiểm tra rồi báo lại".
/** Câu đỡ khi model không viết được (lỗi / im) mà khách có hỏi lại: hỏi thị trường thì nói thật không có số liệu. */
const cauHoiLaiDuPhong = (chuDe: string | null | undefined, ac: string): string =>
  chuDe === "thi_truong"
    ? `Dạ giá khu vực bên em chưa có số liệu giao dịch đủ chắc để báo ${ac}, em không dám nói bừa ạ. `
    // SRS-5.1zzh (05/10/2026): hỏi về một dự án — khách có thể sắp rao căn khác ở đó.
    : chuDe === "du_an"
    ? `Dạ dự án đó em xác nhận lại rồi báo ${ac} ạ. ${ac} có căn ở đó cần bán không, em mở tin riêng cho căn đó nha? `
    : `Câu ${ac} hỏi em kiểm tra rồi báo lại ngay nha. `;
const CHI_DAN_CHU_DE: Record<string, string> = {
  thi_truong: " Đây là câu hỏi về THỊ TRƯỜNG (giá khu vực, dễ bán không, nên rao giá nào): hệ thống CHƯA có số liệu giao dịch khu vực — nói thật là bên em chưa có số liệu chốt đủ chắc để báo, KHÔNG đưa bất kỳ con số nào, KHÔNG nói lại giá căn mình như câu trả lời, KHÔNG hứa sẽ gửi số liệu.",
  phi: " Đây là câu hỏi về TIỀN phải trả cho bên em: trả lời theo luật phí — không thu đồng nào trước, phí chỉ thu khi giao dịch thành công (con số theo luật phí, chưa rõ chủ nhà hay môi giới thì không nói số); KHÔNG nói phải nhờ người phụ trách.",
  // SRS-5.1zzzzzh (bắn production 12/10, thu-kb-thue): "khi nao co khach thi bao minh nha" → AI xếp dich_vu → "câu này em nhờ anh chị phụ trách"
  // + việc ❓ cho admin, trong khi chính bot vừa hứa "có khách quan tâm là em báo liền". Việc bên em LÀM với tin là thứ hệ thống có câu trả lời.
  quy_trinh: " Chủ nhà nhờ / hỏi việc bên em SẼ LÀM với tin: nhờ báo khi có khách thì nhận lời ngắn — có khách quan tâm là em báo liền; bao lâu bán được thì nói thật tuỳ giá và khu vực, KHÔNG hứa số ngày; tin lên kệ là bên em rao ngay. KHÔNG nói phải nhờ người phụ trách.",
  dich_vu: " Đây là câu hỏi về CÁCH BÊN EM LÀM VIỆC: phí / đăng tin / gửi ảnh trả lời theo hướng dẫn hệ thống; bao lâu bán được thì nói thật là tuỳ giá và khu vực, tin lên kệ là bên em rao ngay và báo khi có khách quan tâm — KHÔNG hứa số ngày.",
  ve_bot: " Đây là câu hỏi về BOT: nói thật em là trợ lý AI của AI Ơi Nhà Đất, việc cần người thật có anh chị phụ trách.",
  // SRS-5.1zzzzy (khách mô phỏng 11/10: bác hỏi "cái chữ 'pháp lý' là sao cháu" → "Dạ tin ghi pháp lý sổ hồng riêng ạ"): hỏi NGHĨA
  // một từ là xin giải thích, không phải hỏi lại giá trị tin.
  nghia_tu: " Chủ nhà hỏi NGHĨA một từ / thuật ngữ: giải thích bằng lời thường, MỘT câu ngắn đúng kiến thức phổ thông (vd pháp lý = giấy tờ nhà đất, sổ hồng riêng = sổ đứng tên riêng một chủ, thổ cư = đất ở, hoàn công = giấy xác nhận nhà xây xong đúng phép), KHÔNG đọc lại giá trị đang ghi như một câu trả lời, KHÔNG khen.",
  // SRS-5.1zzzzzb (khách mô phỏng 11/10: "hẻm Quang Trung ở phường nào nhỉ" → model tự trả lời "phường Thạnh Lộc", sai quận).
  dia_danh: " Chủ nhà hỏi ĐỊA DANH (đường / hẻm thuộc phường, quận nào): chỉ trả lời đúng theo khối DỮ LIỆU TRA CỨU — nhiều phường thì kể đúng các phường đó và hỏi gần đoạn nào; khối đó nói chưa tra được thì nói thật em chưa tra được, xin chủ nhà xem trên sổ hồng. KHÔNG nêu tên phường / quận nào ngoài khối đó, KHÔNG hỏi gợi ý \"ở phường X đúng không\".",
  // SRS-5.1zzzzzc (khách mô phỏng lần năm: "ngoài 1% đó còn mất thuế, phí gì không" → bot lặp nguyên câu phí ba lần, rồi tự nói "thuế
  // chuyển nhượng … là của người mua và người bán", "lệ phí trích nước ngoài"). Thuế / phí nhà nước là quy định, em không có nguồn.
  thue_phi: " Chủ nhà hỏi THUẾ / phí sang tên / chi phí ngoài phí bên em: nói đúng hai ý — bên em chỉ thu đúng khoản phí khi giao dịch thành công, không thu thêm gì; thuế, phí sang tên là theo quy định nhà nước, em không tư vấn con số hay ai chịu khoản nào, chủ nhà hỏi bên công chứng. KHÔNG nêu loại thuế, mức thuế, ai chịu.",
  tin_cua_minh: " Đây là câu hỏi về CHÍNH TIN của chủ nhà: chỉ trả lời bằng thông tin tin đang ghi ở trên, không có thì nói thật là chưa ghi.",
  // 05/10/2026 (Zalo thật 18:09, SRS-5.1zzh; chủ dự án: "người ta đang hỏi về dự án mà có thể họ sẽ hỏi để bán nhà khác"): hỏi
  // về một DỰ ÁN là dò đường — trả lời bằng kiến thức kho (khối DỰ ÁN) hoặc nói thật chưa nắm, rồi hỏi họ có căn ở đó cần bán không.
  du_an: " Đây là câu hỏi về MỘT DỰ ÁN / KHU: nếu khối DỰ ÁN ở trên có đúng dự án đó thì trả lời 1–2 ý mở bằng 'Theo em biết, dự án <tên> …'; không có thì nói thật em chưa nắm rõ dự án đó, KHÔNG đoán quận, chủ đầu tư, giá. Dự án đó KHÔNG phải căn đang rao: không ghi, không gắn vào tin, không hỏi về căn này dựa trên nó. Rồi hỏi đúng MỘT câu: nếu tin đang rao CHƯA có địa chỉ / khu (khối ĐÃ BIẾT không có vị trí) thì hỏi căn đang rao có nằm trong khu / dự án đó không (có thì em ghi làm vị trí); còn tin đã có địa chỉ thì hỏi chủ nhà có căn ở dự án đó cần bán / cho thuê không (có thì em mở tin riêng) — câu này THAY cho câu hỏi kế của lượt. Không chèn 'Vâng ạ.' trống giữa hai câu.",
  // 02/10/2026 (test tay chủ dự án: "nếu lấy thông tin ra thì phải ghi vì sao có cái này, người ta hỏi sao em biết nhà 4-6 tầng nó ko
  // trả lời dc"; SRS-5.1ze): bot từng đáp "Dạ em là trợ lý AI…". Điều bot nói phải nói được NGUỒN.
  nguon: " Chủ nhà hỏi em SAO BIẾT / lấy đâu ra điều em vừa nói. Nói thật NGUỒN, một câu: chủ nhà đã nói (nhắc lại đúng lời), hoặc em xem trong KHO DỰ ÁN bên em (nói 'Theo em biết, dự án <tên> …' — đó là thông tin chung của cả dự án, không phải căn của chủ nhà), hoặc không có nguồn nào thì nhận là em nói nhầm và xin lỗi. Nếu em CHƯA HỀ nói điều đó (chỉ mới HỎI) thì nói thật em chưa biết, em đang hỏi để ghi cho đúng — KHÔNG chối là em chưa hỏi khi lịch sử có câu em đã hỏi. Rồi hỏi lại đúng thông tin của căn chủ nhà nếu còn thiếu. KHÔNG trả lời kiểu 'em là trợ lý AI'.",
};
/**
 * Lời dặn model TRẢ LỜI câu chủ nhà hỏi em trước rồi mới hỏi tiếp — một nguồn cho lượt hỏi lại (r2) và lượt chăm sóc chung (r3).
 * SRS-5.1zzzj (chat thử 08/10, …w44h): "em có nhận rao bán cho anh ở quận 8 không em" → r3 không được dặn gì về câu hỏi, model
 * đáp "Dạ anh chị nhận rao được chứ" (đảo chủ ngữ). Nói rõ "em" trong câu khách là EM.
 */
const danTraLoiHoiNguoc = (cau: string, chuDe: string | null | undefined): string =>
  `Chủ nhà còn HỎI NGƯỢC: "${cau}" ("em" trong câu đó là EM, bên AI Ơi Nhà Đất; người hỏi là chủ nhà).${CHI_DAN_CHU_DE[chuDe ?? ""] ?? ""} TRẢ LỜI câu đó TRƯỚC bằng 1–2 câu ngắn, CHỈ từ thông tin dự án/khu vực đã có ở trên; hỏi về cách làm việc (gửi ảnh, phí, đăng tin) thì trả lời theo hướng dẫn hệ thống; chưa nắm thì nói "em kiểm tra rồi báo lại" — KHÔNG bịa tiện ích, trường, chợ, giá; hỏi "em biết dự án / chỗ X không" mà phần trên không có X thì nói thật em chưa nắm rõ X, KHÔNG đoán X ở quận nào, của chủ đầu tư nào. Rồi mới hỏi tiếp. `;
// FR-224: câu hỏi SỐ CHẶT — giá trị ghi lấy từ ô AI đã chuẩn hoá + kiểm khoảng (`giaTriChoCauTreo`), không lấy câu trả lời
// chữ của AI ("năm tỷ hai" / "5,2 tỷ" đều phải thành một con số đúng đơn vị). AI vẫn quyết CÓ / KHÔNG trả lời.
/** FR-226: giá trị đang ghi của các ô chữ AI gộp / sửa được, đọc từ cột tin (đã nạp cùng câu chờ). */
const TEN_PHAP_LY: Record<string, string> = { so_hong_rieng: "sổ hồng riêng", so_hong_chung: "sổ hồng chung", so_hong: "sổ hồng", hdmb: "hợp đồng mua bán", giay_tay: "giấy tay" };
const TEN_DUONG_VAO: Record<string, string> = { hem_xe_hoi: "hẻm xe hơi", hem_xe_tai: "hẻm xe tải", hem_xe_may: "hẻm xe máy", mat_tien: "mặt tiền" };
const TEN_NOI_THAT: Record<string, string> = { full: "full nội thất", co_ban: "nội thất cơ bản", khong: "không nội thất" };
function dangGhiCua(l: { location_raw?: string | null; floors_text?: string | null; legal_status?: string | null; access_type?: string | null; alley_width_m?: number | string | null; furnishing?: string | null; price_raw?: string | null; area_m2?: number | string | null; ward?: string | null; district?: string | null } | null | undefined): Record<string, string> {
  if (!l) return {};
  const hem = [l.access_type ? TEN_DUONG_VAO[l.access_type] : null, l.alley_width_m != null && l.alley_width_m !== "" ? `${l.access_type === "mat_tien" ? "đường" : "hẻm"} ${Number(l.alley_width_m)}m` : null]
    .filter(Boolean).join(", ");
  const ra: Record<string, string> = {};
  // SRS-5.1zzzzzza (Zalo thật 13/10 16:44–16:53: "Điều chỉnh cho mình giá 6,950 tỷ", "Sửa cho chị giá từ 1,2 tỷ thành 6,950 tỷ" × 4 → 🤖 "Không
  // trích xuất được gì"): danh sách "Thông tin đang ghi" không có GIÁ / diện tích / phường / quận nên model không có ô để sửa (`cap_nhat`), và
  // `kiemCapNhat` cũng bỏ vì không có giá trị cũ. Bốn ô lõi vào danh sách.
  if (l.price_raw?.trim()) ra.gia = l.price_raw.trim();
  if (l.area_m2 != null && l.area_m2 !== "" && Number(l.area_m2) > 0) ra.dien_tich = `${Number(l.area_m2)}m2`;
  if (l.ward?.trim()) ra.phuong = l.ward.trim();
  if (l.district?.trim()) ra.quan = l.district.trim();
  if (l.location_raw?.trim()) ra.vi_tri = l.location_raw.trim();
  if (l.floors_text?.trim()) ra.ket_cau = l.floors_text.trim();
  if (l.legal_status && TEN_PHAP_LY[l.legal_status]) ra.phap_ly = TEN_PHAP_LY[l.legal_status];
  if (hem) ra.do_rong_hem = hem;
  if (l.furnishing && TEN_NOI_THAT[l.furnishing]) ra.noi_that = TEN_NOI_THAT[l.furnishing];
  return ra;
}
const CAU_SO_CHAT = new Set(["gia", "gia_m2", "tien_coc", "doanh_thu", "dien_tich", "dien_tich_dat", "dien_tich_tim_tuong", "dien_tich_san", "mat_tien"]);
const LOAI_DAP_AN: Record<string, string> = {
  nha_pho: "nhà phố", nha_cap4: "nhà cấp 4", chung_cu: "căn hộ chung cư", dat: "đất", biet_thu: "biệt thự",
  phong_tro: "phòng trọ", mat_bang: "mặt bằng", toa_nha: "toà nhà", dat_nong_nghiep: "đất nông nghiệp",
  dat_kinh_doanh: "đất kinh doanh", kho_xuong: "kho xưởng",
};
// FR-185: ảnh chủ nhà gửi → phân loại (model) + cất vào kho (Storage + listing_media).
import { lechDienTich, phanLoaiAnh, type LoaiAnh } from "../_shared/ai/phan-loai-anh.ts";
import { bocDuAnBangModel, coMuiDuAn, donKetQua } from "../_shared/ai/boc-du-an.ts";
import { phanVaiBangModel } from "../_shared/ai/phan-vai.ts";
import { coMuiBDS, donVai, nenHoiModelVai, type VaiModel } from "../_shared/extraction/phan-vai-loc.ts";
import { boKeRieng, canTheoAi, cungNoiDungDiaChi } from "../_shared/extraction/kiem-bang-chung.ts";
import { coCauHoi, coMenhDeDaDang, damBaoCauHoi, suaTenRiengLechDau } from "../_shared/extraction/van-tra-loi.ts";
// 13/09/2026: van sau lời model — kho trống không được hứa có hàng, ghi chú không lặp, không ghi nhận hai lần.
import { type ConThieu, dapBaoLauBan, dapHoiVeTin, hoiVeTin, LEGAL_VI, type LoaiHoiTin, type TinTom } from "../_shared/extraction/hoi-ve-tin.ts";
import { thieuCoReNhanh } from "../_shared/re_nhanh.ts";
import { nhanhCuaKhoa } from "../_shared/extraction/re-nhanh.ts";
import { boCauGhiTienKhongCo, boCauM2KhongCo, boGachDai, M2_TRONG_CAU, boCanBia, boCauVongLai, boDoanPhuongDiaDanh, chanBiaDuKien, chanHuaGuiHinh, laHuaCoHang as laHuaCoHangCau, laHuaGuiHinh, laHuaHoiChu, suaBotXungNhamKhach, suaKhenNguocNghia } from "../_shared/extraction/van-tra-loi.ts";
import { boCauHoiLap, boCauHuaLoc, boHuaTuKiemTra, boLapCum, chuanKhuVucMua, loaiKhoTuHoSo, loaiNhaTrongCau, boCauGhiNhan, boCauTrung, boDoanGioiDauCau, boGoiCuoiVaOi, boGoiDoanGioi, boHoiHoanCong, boHuaDaDang, boKhenViTri, botXungEm, laHoiLechKhoa, thayCauHoiLech, boGachCheo, boHoiMucDich, boKhenKhongCanCu, boMauThuanCan, boTenRiengBia, chanHuaCoHang, chanNhanLaNguoi, dapHoiNguocTienDinh, gopGhiChu, laCauGhiNhan, laHoiCoHang, laLoiMeta, laNoiVoiBot, laXinBoTruong, laXinSoKhach, laXinXoaDuLieu, O_XIN_BO, boYGhiChu, boCauSuaLaiModel, locHoSoMua, suaTuXungMua, motCauHoi, motCauHoiLuot } from "../_shared/extraction/van-tra-loi.ts";
import { moSoVan, theoDoiVan, apVan, tenVanKich } from "../_shared/extraction/so-van.ts";
import { catAnhVaoKho, taiAnh, type LoaiMedia } from "../_shared/kho_anh.ts";
import { goNhamDau } from "../_shared/extraction/go-nham-dau.ts";
import { boOTin, ghiFact as ghiFactMotCua, nhacGiaTriKhac, O_XOA_DUOC, viTriLaPhuong, type ThamSoFact } from "../_shared/ghi-fact.ts";
import { diaChiHienThi, duongGiuaCau, duongHienThi } from "../_shared/extraction/hien-thi-dia-chi.ts";

// SRS-5.1zzzzm: hai dấu của dòng "lượt này em ghi gì" trong câu lệnh model người bán — bất biến e2e GHI NHẬN đọc đúng hai chuỗi này.
const VUA_GHI_CO = "EM VỪA GHI ở lượt này";
const VUA_GHI_KHONG = "Lượt này em KHÔNG ghi thêm gì mới";

// Đơn vị dưới quận/huyện là XÃ chứ không phải phường (huyện, thị xã, tỉnh lân cận).
const laNgoaiDoThi = (quan?: string | null): boolean =>
  !!quan && /^(huyện|thị xã|tỉnh)\s|long an|bình dương|đồng nai|tây ninh/i.test(quan);

// FR-161 — RẤT NHIỀU người nhắn Zalo không bỏ dấu, mà mọi cổng regex ở đây
// từng viết bằng chữ có dấu: "ban nha quan 5 gia 5 ty" trượt cổng rao im lặng,
// "toi muon mua nha" không tách được vai, "chieu gui anh" không thành lời hứa.
// Chữa ở GỐC chứ không vá từng mẫu: chuẩn hoá đầu vào một lần rồi khớp.
//
// Luật hai chế độ: tin CÓ DẤU thì khớp bằng bộ regex có dấu như cũ (dấu của
// người gõ là thông tin — "đang bàn" khác "đang bán", đừng vứt đi); tin KHÔNG
// DẤU mới rơi về bộ regex đã bỏ dấu, chấp nhận nhập nhằng vốn có của tiếng
// Việt không dấu (ban = bán/bàn/bạn). Model thì đọc text GỐC — model không mù
// dấu, chỉ regex là mù.
const boDau = (s: string): string =>
  goNhamDau(s).toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** SRS-5.1zk: tên đường AI đọc nằm ở đâu trong địa chỉ đã ghi (bỏ dấu khi so) → trả đúng chữ trong địa chỉ (đã qua từ điển
 *  `duong`, có dấu chuẩn). Không nằm trong địa chỉ → null (không ghi street lệch với địa chỉ). */
const tenTrongDiaChi = (diaChi: string, ten: string): string | null => {
  const phang = (x: string) => x.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const kyTu = [...diaChi.normalize("NFC")];
  const dong = kyTu.map((c) => phang(c) || c).join("");
  // "đường 3/2" (tên bằng số giữ chữ "đường") — địa chỉ viết "hẻm 18 3/2" thì so phần tên trần.
  for (const t of [ten.normalize("NFC").trim(), ten.normalize("NFC").trim().replace(/^đường\s+/i, "")]) {
    const i = t ? dong.indexOf(phang(t)) : -1;
    if (i >= 0) return kyTu.slice(i, i + [...t].length).join("").trim();
  }
  return null;
};
// Fallback quy tắc khi model lỗi/hết quota (hướng parseVnd của NhaDat-Radar):
// bắt tối thiểu ngân sách + hẻm/mặt tiền bằng regex để hồ sơ không mất dữ liệu,
// và trả lời template thay vì im lặng hay đổ lỗi cho khách.
// ĐƠN VỊ TIỀN — MỘT nguồn cho năm chỗ từng chép riêng (FR-171 k: fallback hồ
// sơ, khoảng giá, cổng "có chi tiết", lời sửa giá, giá trong câu rao). Bản
// không dấu (KD) chạy trên `tKD`; bản có dấu (CD) chạy trên text gốc. "toi" là
// tỏi (tỷ) CHỈ khi sau nó không có số — "5 toi 6 ty" là "5 TỚI 6". "tr" viết
// tắt của triệu, nhưng \b sau "tr" khớp luôn "TRệt" (dấu tiếng Việt không phải
// \w) — từng làm price_raw thành "1 trệt 2 lầu"; lookahead chặn mọi chữ cái
// (kể cả có dấu) đứng sau. Sửa luật tiền là sửa ở đây, không đi tìm năm chỗ.
// (Hai hằng TIEN_KD / TIEN_CD nay nhập từ `_shared/extraction/luat-tien.ts`.)
// SỐ PHƯỜNG trong một chuỗi ĐÃ BỎ DẤU: "phường 4", "phuong4", "p.4", "P4". Chỉ
// lấy con số nên bỏ dấu không mất gì. Dùng cho câu rao, hồ sơ khách và so
// "căn khác phường" ở nhánh bán.
const PHUONG_KD = /phuong\s*\.?\s*(\d{1,2})|(?:^|[^a-z0-9])p\.?\s*(\d{1,2})(?![0-9])/;
const soPhuong = (kd: string): string | null => {
  const m = PHUONG_KD.exec(kd);
  return m ? (m[1] ?? m[2]) : null;
};
function regexProfileFallback(text: string): Record<string, string> {
  // Chạy trên bản BỎ DẤU (FR-161): fallback này chỉ nhặt số + từ khoá thô,
  // và bản không dấu phủ được cả hai kiểu gõ. "thuế" → "thue" vẫn dính nhầm
  // như trước, chấp nhận — đây là lưới cuối khi model đã hỏng.
  const t = boDau(text);
  const delta: Record<string, string> = {};
  // "5 ty 8" / "5 ty ruoi": giữ cả phần lẻ, vì budgetRangeVnd đọc được nó. Bản
  // cũ cắt còn "5 tỷ" → cận trên 5,75 tỷ → căn 5,8 tỷ khách đang hỏi bị lọc mất.
  // "toi" là "tỏi" (tỷ) CHỈ khi sau nó không có số: "5 toi 6 ty" là "5 TỚI 6".
  const money = new RegExp(
    `([\\d][\\d.,]*)\\s*(${TIEN_KD})(?![a-z])(\\s*(?:ruoi|\\d{1,3}(?![\\d.,]|\\s*m)))?`,
  ).exec(t);
  if (money) {
    const unit = /^(tr|trieu|cu)$/.test(money[2]) ? "triệu" : "tỷ";
    delta.budget = `${money[1]} ${unit}${money[3] ? ` ${money[3].trim()}` : ""}`;
  }
  if (/hxh|hem xe hoi/.test(t)) delta.alley = "hẻm xe hơi";
  else if (/mat tien|\bmt\b/.test(t)) delta.alley = "mặt tiền";
  if (/(^|[^a-z])thue(?![a-z])/.test(t)) delta.deal = "thue";
  else if (/\bmua\b/.test(t)) delta.deal = "ban";
  return delta;
}

// 23/09/2026 (FR-214 a, 20260923b): MỘT hội thoại mỗi người — tin người đó gửi lúc ở vai mua (`buyer`) lẫn
// vai bán (`seller`) nằm chung một dòng `conversations`. Mọi chỗ tách "tin người" với "tin bot" dùng hàm này;
// so riêng `=== "seller"` / `=== "buyer"` là coi tin người ở vai kia thành lời BOT.
const laTinNguoi = (s: string | null | undefined): boolean => s === "seller" || s === "buyer";
// 23/09/2026: câu khách hỏi TIẾP về một căn (không phải câu tìm mới) — hẻm, giá bớt, hướng, quy hoạch, hình,
// xem nhà, số chủ, "căn đó / nhà này". "anh" trần KHÔNG có ở đây (đại từ), chỉ "hình".
const HOI_TIEP_VE_CAN_RE = /\?|\b(?:huong|quy hoach|lo gioi|hem|bot|thuong luong|phap ly|so hong|so do|hinh|xem nha|di xem|qua xem|tang|lau|dien tich|mat tien|can do|can nay|can kia|nha do|nha nay|chu nha|so chu|con khong|o dau|bao nhieu|nam xay|noi that|dau xe|gan cho|gan truong)\b/;
// 23/09/2026: hồ sơ TẠM cho lượt này — hồ sơ đã lưu, chỗ nào trống thì lấy từ chính câu khách bằng luật
// tiền định (không gọi model). Chỉ dùng để LỌC KHO lượt này; không ghi vào DB.
//   · khu vực: quận ("q5", "quận 5"), phường ("p2"), hoặc "đường <tên>" — kho chỉ lọc theo số phường,
//     nên tên đường chỉ để biết khách đã nói nơi chốn.
//   · giá: MỆNH ĐỀ chứa cụm tiền (cắt ~25 ký tự trước số) để `budgetRangeVnd` đọc được "tầm/dưới/7 tới 8".
//   · phòng ngủ: "3 phòng ngủ" / "3pn".
export function hoSoTamTuCau(prefs: Record<string, unknown>, text: string, tKD: string): Record<string, unknown> {
  const p: Record<string, unknown> = { ...prefs };
  if (p.area == null || p.area === "") {
    const quan = bocQuan(tKD, text);
    const phuong = /\b(?:phuong|p)\s*(\d{1,2})\b/.exec(tKD);
    const duong = /\b(?:duong|pho)\s+([a-z]{2,}(?:\s+[a-z]{2,}){1,3})/.exec(tKD);
    if (quan || phuong || duong) {
      p.area = [phuong ? `Phường ${Number(phuong[1])}` : null, quan, !quan && !phuong && duong ? `đường ${duong[1]}` : null]
        .filter(Boolean).join(", ");
    }
  }
  // 30/09/2026 (bắn thật lx-mua-e2): khách đã lưu "dưới 5 tỷ" rồi nới "vậy có căn 6 tỷ rưỡi cũng được" — kho lượt này vẫn lọc
  // theo ngân sách CŨ → 0 căn, bot chỉ hứa "em sẽ để ý" dù kho có 3 căn khớp. Câu có số tiền + lời đổi ngân sách thì lấy
  // ngân sách MỚI ngay lượt này (hồ sơ lưu vẫn do lượt model ghi).
  const doiNganSach = CO_TIEN_KD.test(tKD) &&
    /\b(?:cung (?:duoc|dc|ok|oke|chiu)|tam|khoang|duoi|toi da|ngan sach|nang (?:len|ngan sach)|tang (?:len|ngan sach)|len (?:toi|den)|co the (?:len|toi))\b/.test(tKD);
  if (p.budget == null || p.budget === "" || doiNganSach) {
    for (const menhDe of text.split(/[,.;\n!?]+/)) {
      const kd = boDau(menhDe);
      const m = CO_TIEN_KD.exec(kd);
      if (m) { p.budget = menhDe.slice(Math.max(0, m.index - 25)).trim(); break; }
    }
  }
  // 30/09/2026 (bắn thử mua lx-mua-c1): loại nhà nói CHẮC trong câu ("căn hộ", "đất nền") — kho lọc theo loại ngay lượt này.
  if (p.property_type == null || p.property_type === "") {
    const loai = loaiNhaTrongCau(tKD);
    if (loai) p.property_type = loai;
  }
  // Phòng ngủ chỉ lấy từ câu khi hồ sơ lưu còn thiếu khu vực/giá (lượt đầu) — hồ sơ đã đủ thì lọc như cũ.
  if (typeof p.bedrooms !== "number" && (prefs.area == null || prefs.budget == null)) {
    const pn = /\b(\d{1,2})\s*(?:phong ngu|pn)\b/.exec(tKD);
    if (pn && Number(pn[1]) >= 1 && Number(pn[1]) <= 10) p.bedrooms = Number(pn[1]);
  }
  if (p.deal == null || p.alley == null || p.alley === "") {
    const tam = regexProfileFallback(text);
    if (p.deal == null && tam.deal) p.deal = tam.deal;
    // "hẻm cách mặt tiền 50m" / "gần mặt tiền" KHÔNG phải đòi nhà mặt tiền — chỉ nhận "nhà/căn/mua mặt tiền".
    const muonMatTien = /\b(?:nha|can|mua|tim|lo|dat|mb|mat bang) mat tien\b/.test(tKD) && !/\b(?:cach|gan|sat|ra) mat tien\b/.test(tKD);
    if ((p.alley == null || p.alley === "") && tam.alley && (tam.alley !== "mặt tiền" || muonMatTien)) p.alley = tam.alley;
  }
  return p;
}

// 23/09/2026 (FR-216 b): hồ sơ mua có `alley` ("hẻm xe hơi" / "mặt tiền") từ lâu mà kho KHÔNG lọc theo nó — bot
// gợi căn hẻm xe máy cho khách đòi hẻm xe hơi. Trả mệnh đề `.or()` PostgREST cho `access_type`, hoặc null (không
// lọc: khách không nói, nói "không quan trọng", hay chỉ cần hẻm xe máy). Hẻm xe hơi nhận cả mặt tiền, hẻm xe tải
// và căn chủ nói "xe hơi vào tận nhà" (`car_in_house`).
export function locLoaiHem(alley: unknown): string | null {
  if (typeof alley !== "string" || !alley.trim()) return null;
  const t = boDau(alley);
  if (/\b(?:khong|ko|k)\b.*\b(?:quan trong|can|bat buoc)\b|\b(?:sao cung duoc|gi cung duoc|dau cung duoc)\b/.test(t)) return null;
  // "hẻm xe hơi hoặc mặt tiền" → tập rộng (đã gồm mặt tiền); chỉ "mặt tiền" mới hẹp về mặt tiền.
  if (/xe hoi|\bhxh\b|o to|\boto\b|xe tai|7 cho|4 cho/.test(t)) {
    return "access_type.eq.mat_tien,access_type.eq.hem_xe_tai,access_type.eq.hem_xe_hoi,car_in_house.is.true";
  }
  if (/mat tien|\bmt\b/.test(t)) return "access_type.eq.mat_tien";
  return null;
}

// FR-133: "chiều/mai/tối… em gửi" → hẹn giờ nhắc (giờ VN = UTC+7)
function mapDue(when: string): string {
  // Bản bỏ dấu (FR-161) phủ cả hai kiểu gõ: "chieu mai" hẹn được y như
  // "chiều mai". Đổi lại "tôi"/"tối" nhập một — chỉ lệch GIỜ nhắc, không mất nhắc.
  const t = boDau(when);
  const now = Date.now();
  const vn = new Date(now + 7 * 3600e3);
  let day = 0;
  if (/mai|hom sau/.test(t)) day = 1;
  // "thứ 7", "chủ nhật/CN" → số ngày tới thứ đó (trùng hôm nay thì lấy hôm nay)
  const wd = /thu\s*([2-7])/.exec(t);
  if (wd) day = ((parseInt(wd[1], 10) - 1) - vn.getUTCDay() + 7) % 7;
  else if (/chu nhat|\bcn\b/.test(t)) day = (7 - vn.getUTCDay()) % 7;
  let hour = 15;
  let minute = 0;
  // SRS-5.1zzzzzzi: "8 giờ 45", "8h30", "8:45", "8 giờ rưỡi" — phút đi theo giờ (bản trước bỏ phút).
  const hm = /(\d{1,2})\s*(?:h|gio|:)\s*(\d{1,2})?(?:\s*(ruoi))?/.exec(t);
  if (hm) {
    hour = Math.min(23, Math.max(0, parseInt(hm[1], 10)));
    minute = hm[2] ? Math.min(59, parseInt(hm[2], 10)) : hm[3] ? 30 : 0;
    // "3h chiều", "8h tối" — giờ kèm buổi thì cộng 12, kẻo thành 3h/8h SÁNG
    if (hour < 12 && /chieu|toi|dem/.test(t)) hour += 12;
  } else if (/sang/.test(t)) hour = 9;
  else if (/trua/.test(t)) hour = 12;
  else if (/chieu/.test(t)) hour = 15;
  else if (/toi|dem/.test(t)) hour = 19;
  else if (/cuoi tuan/.test(t)) { day = ((6 - vn.getUTCDay()) + 7) % 7 || 6; hour = 10; }
  let due = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + day, hour - 7, minute);
  if (due <= now) due = now + 2 * 3600e3; // đã qua giờ đó → nhắc sau 2 tiếng
  return new Date(due).toISOString();
}
/**
 * SRS-5.1zzzzzzi (Zalo thật 14/10 08:39: "giờ anh bận, mai nói tiếp 8 giờ 45 sáng" → bot chỉ "Dạ em nghe rồi ạ", không hẹn, không
 * nhắc): lời HOÃN có HẸN GIỜ → mốc nhắc (`mapDue`, FR-133) + cách nói lại mốc đó cho khách ("mai 8h45"). Không có chữ chỉ giờ / buổi /
 * ngày → null (hoãn trơn, không hẹn). Bỏ dấu nên "tối" lẫn "tôi" — chỉ lệch GIỜ nhắc, cùng bẫy đã ghi ở `mapDue`.
 */
const HEN_GIO_RE = /(?:^|[^a-z])(?:mai|hom sau|sang|chieu|toi|trua|cuoi tuan|thu\s*[2-7]|chu nhat|cn|\d{1,2}\s*(?:h|gio|:\d{1,2}))(?![a-z])/;
function henTuLoiHoan(text: string): { due: string; moTa: string } | null {
  if (!HEN_GIO_RE.test(boDau(text))) return null;
  const due = mapDue(text);
  const d = new Date(Date.parse(due) + 7 * 3600e3);
  const nay = new Date(Date.now() + 7 * 3600e3);
  const ngayCua = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const lech = Math.round((ngayCua(d) - ngayCua(nay)) / 86400e3);
  const ngay = lech === 0 ? "hôm nay" : lech === 1 ? "mai" : `ngày ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  const gio = `${d.getUTCHours()}h${d.getUTCMinutes() ? String(d.getUTCMinutes()).padStart(2, "0") : ""}`;
  return { due, moTa: `${ngay} ${gio}` };
}
// Regex bắt lời hứa cho nhánh seller (không qua parse có cấu trúc).
// Hai bản có-dấu / không-dấu, chọn theo tin (FR-161).
const PROMISE_RE = /(sáng mai|chiều|tối|trưa|mai|cuối tuần)[^.,;!?]{0,30}?(gửi|chụp|báo|đưa|bổ sung|cho em|check|coi lại)|(gửi|chụp|báo|đưa|bổ sung|check|coi lại)[^.,;!?]{0,30}?(sáng mai|chiều|tối|trưa|mai|cuối tuần)/i;
const PROMISE_RE_KD = /(sang mai|chieu|toi|trua|mai|cuoi tuan)[^.,;!?]{0,30}?(gui|chup|bao|dua|bo sung|cho em|check|coi lai)|(gui|chup|bao|dua|bo sung|check|coi lai)[^.,;!?]{0,30}?(sang mai|chieu|toi|trua|mai|cuoi tuan)/;

// SRS-3.3/SRS-5.2: khoảng giá trong hồ sơ → biên VND để lọc kho bằng price_vnd
// (bản cũ ghi "SRS-4.5" — đó là POST /api/search, trích nhầm)
// (cột số, parse_vnd phía DB — hướng parseVnd của NhaDat-Radar).
// "tầm/dưới 5 tỷ" → cận trên ×1.15; "trên/từ 4 tỷ" → cận DƯỚI; "5-6 tỷ" → cả hai.
//
// Soát 01/09 (vai người mua) — ba cách nói giá RẤT thường gặp từng bị đọc sai:
//   "5 tỷ 8"        → đọc thành 5 tỷ → cận trên 5,75 tỷ → căn 5,8 tỷ khách đang
//                     hỏi bị LỌC KHỎI KHO. Phía DB `parse_vnd` đọc đúng "5 tỷ 8"
//                     cho GIÁ TIN từ 25/08, nên tin ghi 5,8 tỷ và khách nói
//                     5 tỷ 8 không bao giờ gặp nhau.
//   "từ 5 đến 6 tỷ" → bắt "6 tỷ" + "từ" thành CẬN DƯỚI 5,7 tỷ — loại hết
//                     5,0–5,69 tỷ, đúng khoảng khách muốn.
//   "5 tới 6 tỷ"    → "tới" bị đọc thành "tỏi" (lóng của tỷ) → "5 tỏi".
// Luật phần lẻ chép từ parse_vnd: 1 chữ số sau "tỷ" là phần mười, 2-3 chữ số là
// triệu; "rưỡi" = +0,5. Một luật, hai chỗ — cố ý, vì hàm DB trả MỘT số còn ở
// đây cần KHOẢNG; đổi luật thì đổi cả hai.
function budgetRangeVnd(budget: unknown): { min?: number; max?: number } | null {
  if (typeof budget !== "string") return null;
  // Bỏ dấu một lần (FR-161): hồ sơ do model bóc thì có dấu, do fallback regex
  // thì không — hàm này phải nuốt được cả hai mà không nhân đôi bảng mẫu.
  const bd = boDau(budget);
  const num = (s: string) => parseFloat(s.replace(",", "."));
  // Một lượng tiền: số + đơn vị + phần lẻ tuỳ chọn. "toi" là tỏi (tỷ) chỉ khi
  // sau nó KHÔNG có số — "5 toi 6" là "tới". Phần lẻ không được dính "m" (m2).
  const TIEN = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(${TIEN_KD})(?![a-z])(?:\\s*(ruoi)|\\s*(\\d{1,3})(?![\\d.,]|\\s*m))?`,
    "g",
  );
  const doc = (m: RegExpMatchArray): number => {
    const laTy = laDonViTy(m[2]);
    let v = num(m[1]) * (laTy ? 1e9 : 1e6);
    if (laTy && Number.isInteger(num(m[1]))) {
      if (m[3]) v += 0.5e9;
      else if (m[4]) v += m[4].length === 1 ? Number(m[4]) * 1e8 : Number(m[4]) * 1e6;
    }
    return v;
  };
  const cac: number[] = [];
  for (const m of bd.matchAll(TIEN)) {
    const v = doc(m);
    if (Number.isFinite(v) && v > 0) cac.push(v);
  }
  // "5-6 tỷ", "từ 5 đến 6 tỷ", "5 tới 6 tỷ", "khoảng 5 6 tỷ": số đầu KHÔNG mang
  // đơn vị, mượn đơn vị của số sau.
  const chung = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(?:-|–|~|den|toi|hoac|hay|\\s)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${TIEN_KD})(?![a-z])`,
  ).exec(bd);
  if (chung) {
    const u = laDonViTy(chung[3]) ? 1e9 : 1e6;
    const a = num(chung[1]) * u, b = num(chung[2]) * u;
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b >= a) {
      return { min: Math.round(a * 0.95), max: Math.round(b * 1.1) };
    }
  }
  // "5 tỷ đến 6 tỷ", "5 tỷ 8 - 6 tỷ": hai lượng tiền đủ đơn vị.
  if (cac.length >= 2) {
    const a = Math.min(cac[0], cac[1]), b = Math.max(cac[0], cac[1]);
    return { min: Math.round(a * 0.95), max: Math.round(b * 1.1) };
  }
  if (!cac.length) return null;
  const base = cac[0];
  // 30/09/2026 (bắn thử mua lx-mua-c1): "quận 7 2 phòng ngủ dưới 3 tỷ" → {min 2,85 tỷ} — chữ "hon" không ranh giới khớp
  // trong "p-HÒN-g ngủ", "dưới" bị lờ, kho ra nhà 8 tỷ 8. Ranh giới từ, và "dưới / tối đa" thắng.
  if (/\b(?:duoi|toi da|khong qua|nho hon)\b/.test(bd)) return { max: Math.round(base * 1.15) };
  if (/\b(?:tren|hon|tu|toi thieu|it nhat)\b/.test(bd)) return { min: Math.round(base * 0.95) };
  return { max: Math.round(base * 1.15) };
}

// HAI BẢNG TỪ VỰNG cho cùng một khái niệm mua/thuê, đừng lẫn:
//   · cột DB `listings.deal` là enum `ban | cho_thue`;
//   · hồ sơ khách (buyers.preferences, JSON) và schema model dùng từ ngắn `thue`.
// Chạm vào CỘT thì phải quy đổi, không thì INSERT tin cho thuê nổ vì sai enum,
// còn bộ lọc kho .eq("deal","thue") lỗi truy vấn → khách tìm thuê không bao giờ
// được gợi ý căn nào.
const dealCol = (v: unknown): "ban" | "cho_thue" =>
  v === "thue" || v === "cho_thue" ? "cho_thue" : "ban";

// FR-29: mã căn khách nhắc ("#BDS-Q5-0115", từ web bấm sang) — chào đúng căn đó
const CODE_RE = /(?:#\s*)?\b([A-Za-z]{2,5}(?:-[A-Za-z0-9]{1,15}){1,4})\b/g;
// Mã tin trước khi nhét vào chuỗi `.or("code.ilike.X,legacy_code.ilike.X")` của
// PostgREST: ở đó dấu phẩy / ngoặc là NGỮ PHÁP và %/_ là wildcard. Ba chỗ dùng
// (hỏi chủ, hẹn xem, chốt) lấy mã từ ĐẦU RA MODEL — không bị CODE_RE ràng buộc —
// nên model trả "BDS-NP-Q5-0001, BDS-NP-Q5-0002" là PostgREST 400, `{ data }`
// thành null và bot lặng lẽ đi nhánh "không thấy tin". Chỉ nhận [A-Z0-9-].
const maTinSach = (s: string | null | undefined): string => {
  const v = (s ?? "").trim().toUpperCase();
  return /^[A-Z0-9-]{3,40}$/.test(v) ? v : "";
};

/**
 * Tên căn để ĐỌC LÊN cho chủ nhà, đứng sau chữ "căn" ở nơi gọi (SRS-5.1zh — bắn thử 02/10: "chúc mừng anh đã bán được căn căn chưa
 * rõ địa chỉ" dù tin đã có Quận Tân Bình). Đường / phường / quận; chỉ có quận → "ở Quận …"; không có gì → theo loại.
 */
function tenCanDocLen(c: { location_raw?: string | null; street?: string | null; ward?: string | null; district?: string | null; property_type?: string | null }): string {
  // SRS-5.1zzzzj: in qua MỘT nguồn `diaChiHienThi` (đường chuẩn hoá, phường / quận từ cột) — đứng sau chữ "căn" nên từ loại viết thường.
  const duong = duongGiuaCau(c.location_raw, c.street);
  const dc = [duong, c.ward].filter(Boolean).join(", ");
  if (dc) return c.district && !dc.includes(c.district) ? `${dc}, ${c.district}` : dc;
  if (c.district) return `ở ${c.district}`;
  return c.property_type === "chung_cu" ? "chung cư của mình" : "của mình";
}

/** Nhãn loại tiện ích của công cụ `tim_tien_ich_quanh` (tro-ly.ts) → chữ đưa vào link Google Maps. */
const TEN_LOAI_TIEN_ICH: Record<string, string> = {
  benh_vien: "bệnh viện", truong_hoc: "trường học", cho: "chợ", sieu_thi: "siêu thị", cong_vien: "công viên", tat_ca: "tiện ích",
};

// Hồ sơ + trả lời trong MỘT lượt gọi model (FR-130)
const BuyerTurn = z.object({
  profile: z.object({
    name: z.string().nullable().describe("Tên khách nếu khách vừa xưng tên"),
    deal: z.enum(["ban", "thue"]).nullable().describe("ban = khách muốn MUA, thue = muốn THUÊ"),
    area: z.string().nullable().describe("Khu vực khách muốn TÌM (quận/phường/đường), nguyên văn kiểu nói; nơi muốn ở GẦN (bệnh viện, trường) KHÔNG ghi vào đây"),
    budget: z.string().nullable().describe("Khoảng giá, nguyên văn kiểu nói ('tầm 5 tỷ'); khách nói mơ hồ ('rẻ thôi') thì null"),
    purpose: z.string().nullable().describe("CHỈ khi khách NÓI THẲNG: để ở / đầu tư / kinh doanh / cho thuê lại. KHÔNG suy ra từ hoàn cảnh, loại nhà hay chữ 'gấp'"),
    property_type: z.string().nullable().describe("Loại nhà khách nói: nhà hẻm / nhà mặt tiền / căn hộ / đất / phòng trọ…"),
    bedrooms: z.number().nullable(),
    alley: z.string().nullable().describe("Hẻm xe hơi / mặt tiền / không quan trọng"),
    timeline: z.string().nullable().describe("Mốc CẦN DỌN VÀO / CHỐT MUA ('trong tháng này', 'trước Tết'). Giờ đi XEM NHÀ không phải timeline (đó là viewing)"),
    notes: z.string().nullable().describe("Hoàn cảnh SỐNG đáng nhớ: người ở cùng, con học trường nào, sức khoẻ, thú nuôi, số người ở. KHÔNG chép lại câu khách, KHÔNG ghi thái độ/cảm xúc hay câu khách đang hỏi"),
    // FR-228 (25/09/2026): bộ câu tư vấn người mua của chủ dự án — mỗi câu một khoá, chỉ ghi điều khách NÓI RÕ.
    khu_song: z.string().nullish().describe("Kiểu khu khách muốn SỐNG (yên tĩnh, an ninh, gần chợ, khu dân trí…), nguyên văn ngắn; KHÔNG phải quận/phường"),
    nguoi_o_cung: z.string().nullish().describe("Nhà gồm những ai ở cùng (vợ chồng, 2 con nhỏ, ông bà…), ngắn gọn"),
    noi_lam: z.string().nullish().describe("Khu vực khách ĐI LÀM (quận/đường/công ty ở đâu)"),
    dien_tich_mong_muon: z.string().nullish().describe("Diện tích khách muốn ('tầm 60m2', 'trên 50m2')"),
    thang_may: z.string().nullish().describe("Ý khách về thang máy: 'cần thang máy' / 'không cần' / 'phòng ngủ dưới trệt'"),
    nguoi_quyet_dinh: z.string().nullish().describe("Ai cùng quyết định mua ngoài khách (vợ/chồng, bố mẹ…); 'một mình' nếu khách nói tự quyết"),
    can_vay: z.boolean().nullish().describe("true khi khách nói CẦN tư vấn vay ngân hàng, false khi nói không cần; chưa nói thì null"),
    // SRS-5.1zzzzb: yêu cầu số tầng ("2 lầu", "trệt 2 lầu", "tối thiểu 3 tầng") từng không có ô nào để ghi — rơi mất.
    so_tang: z.string().nullish().describe("Số tầng / lầu khách muốn, nguyên văn ngắn ('2 lầu', 'trệt 2 lầu', 'tối thiểu 3 tầng')"),
  }).describe("CHỈ ghi điều khách NÓI RÕ trong câu vừa nhắn hoặc hội thoại. Không suy diễn. Chưa biết để null — null KHÔNG xoá thứ đã biết."),
  replies: z.array(z.string()).min(1).max(2)
    .describe("1-2 bong bóng tin nhắn gửi khách, theo đúng nhịp nhắn giống người"),
  promise: z.object({
    when: z.string().describe("Mốc hẹn nguyên văn: 'chiều nay', 'mai', 'tối', 'cuối tuần'…"),
    what: z.string().describe("Khách hứa làm gì: 'gửi ảnh sổ', 'báo lại tài chính'…"),
  }).nullable().describe("CHỈ điền khi khách chủ động hứa sẽ gửi/báo gì đó vào một mốc thời gian. Không suy diễn."),
  viewing: z.object({
    listing_code: z.string().nullable().describe("Mã căn muốn xem, ví dụ 'BDS-NP-BINHTAN-0001', 'BDS-NP-Q5-0001' (không có # đầu)"),
    when: z.string().describe("Khung giờ khách chốt, nguyên văn: 'mai 9h sáng', 'chiều thứ 7'…"),
    phone: z.string().nullable().describe("SĐT khách TỰ cho ở bước chốt lịch; không có thì null"),
  }).nullable().describe("CHỈ điền khi khách chốt/đề nghị lịch xem nhà cụ thể (UF-06). Không suy diễn."),
  agreed_deal: z.object({
    listing_code: z.string().nullable().describe("Mã căn khách vừa đồng ý chốt, ví dụ 'BDS-NP-BINHTAN-0001', 'BDS-NP-Q5-0001'; không rõ mã thì null"),
  }).nullable().describe("CHỈ điền khi tin NGAY TRƯỚC của EM có đề nghị chốt hợp đồng/cọc và khách vừa ĐỒNG Ý theo AGREE_RULES (bằng chữ, emoji vui, like/tim). Không suy diễn."),
  send_photos: z.string().nullable().describe("Mã căn cần gửi hình kèm tin này - CHỈ điền khi khách xin hình và khối căn ghi 'có hình sẵn'; không thì null"),
  // SRS-5.1zg (02/10/2026): hai ô ý khách đọc theo NGHĨA, thay từ khoá `KHACH_XIN_HINH_RE`; code kiểm cụm trích có trong lời khách.
  xin_hinh: z.string().nullish().describe("Khách XIN xem hình / ảnh căn nhà ở tin này: chép NGUYÊN VĂN cụm khách xin (vd 'gửi hình căn đó em'). Không xin thì null"),
  hoi_tien_ich: z.object({
    loai: z.string().describe("Thứ khách hỏi có gần không, ngắn gọn: 'chợ', 'trường tiểu học', 'bệnh viện', 'siêu thị'…"),
    khu_vuc: z.string().nullable().describe("Chỗ khách hỏi quanh, NGUYÊN VĂN lời khách (tên đường / phường / quận); khách hỏi quanh căn đang nói thì null"),
  }).nullish().describe("CHỈ khi khách HỎI gần đó có tiện ích / nơi chốn gì (chợ, trường, bệnh viện…). Không hỏi thì null"),
  ask_owner: z.object({
    listing_code: z.string().nullable().describe("Mã căn cần hỏi, ví dụ 'BDS-NP-BINHTAN-0001', 'BDS-NP-Q5-0001' (không có # đầu)"),
    question: z.string().describe("Điều cần hỏi/xin từ chủ tin, ngắn gọn: 'hình + địa chỉ chi tiết', 'pháp lý', 'còn bán không'…"),
  }).nullable().describe("CHỈ điền khi em vừa hứa 'để em hỏi lại chủ nhà / xin hình rồi gửi anh chị' về MỘT căn cụ thể. Không suy diễn."),
  need_human: z.boolean().describe(
    "true CHỈ khi: khách đòi gặp người thật/quản lý, khách bức xúc thật sự, đàm phán giá vào hồi kết, hoặc đã 'để em hỏi lại' 2 lần cùng một chuyện. Câu hỏi khó thường ngày thì false.",
  ),
  // FR-79 (v48): khách đòi gọi điện / voice / "alo được không" → cờ riêng để hệ
  // thống mở việc VOICE cho người thật gọi lại (kèm need_human).
  voice_request: z.boolean().describe(
    "true khi khách muốn GỌI ĐIỆN / voice / nói chuyện qua điện thoại hoặc xin số để gọi bên em. Khách CHO số của họ ở bước chốt lịch thì false.",
  ),
});

// ─── FR-171 h: thứ giống nhau cho MỌI tin thì dựng MỘT lần ở tầng module.
// Isolate của edge function sống qua nhiều request, nên hằng, schema đã biên
// dịch và các thứ nhớ tạm dưới đây chỉ tốn công ở request đầu.
const BUYER_FORMAT = zodOutputFormat(BuyerTurn);
// 14/09/2026 (đo thật cùng câu lệnh, Haiku 4.5, nhớ tạm đã trúng): gọi CÓ khuôn JSON
// `output_config.format` mất 4,1–5,4 s cho ~140 token ra; KHÔNG khuôn, dặn JSON bằng
// lời mất 1,8–3,5 s và 8/8 lượt ra JSON hợp lệ đúng từng trường. Giải mã có ràng
// buộc chậm gấp đôi. Nhánh mua nay đưa JSON Schema vào khối system NHỚ TẠM (đọc lại
// 1/10 giá), tự đọc + kiểm bằng zod; hỏng thì rơi về đường dự phòng như model chết.
// Khuôn vẫn đi kèm dưới tên `_khuon_du_phong` cho riêng lưới Groq (FR-194).
const BUYER_SCHEMA_TXT = JSON.stringify(z.toJSONSchema(BuyerTurn));
const DAU_RA_JSON =
  "ĐẦU RA: trả về DUY NHẤT một object JSON (không markdown, không chữ nào ngoài JSON) đúng JSON Schema sau — " +
  "mô tả từng trường nằm trong \"description\":\n" + BUYER_SCHEMA_TXT;
/** Đọc lượt người mua từ chữ model trả: cắt từ "{" đầu tới "}" cuối, kiểm bằng zod. */
function docLuotMuaTuChu(chu: string): z.infer<typeof BuyerTurn> | null {
  const dau = chu.indexOf("{"), cuoi = chu.lastIndexOf("}");
  if (dau < 0 || cuoi <= dau) return null;
  try {
    const kq = BuyerTurn.safeParse(JSON.parse(chu.slice(dau, cuoi + 1)));
    return kq.success ? kq.data : null;
  } catch {
    return null;
  }
}
// Khối "căn khách đang nhắc" (FR-29): trạng thái nói bằng lời cho model.
const STATUS_VI: Record<string, string> = {
  cho_thong_tin: "đang chờ bổ sung thông tin, chưa lên kệ",
  dang_ban: "đang bán",
  dang_quan_tam: "đang được nhiều khách quan tâm",
  da_chot: "ĐÃ CHỐT GIAO DỊCH - báo thật với khách là căn này đã chốt rồi gợi ý căn tương tự trong KHO",
  an: "đã gỡ khỏi kệ",
};
const PHOTO_URL_RE = /https?:\/\/\S+/g;

// ─── FR-105 (v48): LỌC LIÊN HỆ PHÍA BOT. Áp cho mọi chuỗi mô tả/fact đưa vào
// KHO gửi model và mọi bong bóng gửi NGƯỜI MUA. KHÔNG áp cho nhánh người bán /
// CTV / admin — họ cần thấy số để làm việc.
// Luật SĐT/mạng xã hội nay là MỘT NGUỒN với web (`luat-lien-he.ts`, tầng bốn
// 11/09). Bản cũ chép tay từ `lib/format.ts` kèm lời dặn "sửa regex một bên
// thì sửa bên kia" — đồng bộ bằng trí nhớ. Chiều ngược lại import được: web
// nhập thẳng file đó qua `@/bot/...`.
// Số nhà trước tên đường trong MÔ TẢ/FACT: "số 12 Trần Hưng Đạo", "572/12
// Nguyễn Trãi", "12 đường Nguyễn Trãi". Chỉ áp khi `soNha=true` (mô tả/fact)
// — `location_raw` của tin và câu chốt lịch xem UF-06 giữ nguyên [giả định BA,
// theo OPEN-36: lưu hết, khai khi khách hỏi; SĐT/Zalo mới là thứ giữ tới UF-06].
const SO_NHA_RE =
  /(?<![\p{L}\d.,/])(?:số\s*\d{1,4}[a-z]?(?:\/\d{1,4}[a-z]?)*|\d{1,4}[a-z]?(?:\/\d{1,4}[a-z]?)+|\d{1,4}[a-z]?(?=\s+(?:đường|hẻm)\s))(?=[\s,.;]|$)/giu;
function locLienHe(s: string, soNha = false): string {
  let t = thayLienHe(s, " [liên hệ qua Zalo] ");
  if (soNha) t = t.replace(SO_NHA_RE, "");
  return t.replace(/[ \t]{2,}/g, " ").trim();
}
// 22/09/2026 (bộ đo giọng M03): câu BOT TỰ NÓI với người mua ("anh chị phụ trách sẽ liên hệ
// qua Zalo") đi qua `locLienHe` thành "liên hệ qua [liên hệ qua Zalo]" — chữ "Zalo" trần là
// lời bot, không phải kênh liên hệ của ai. Bong bóng bot chỉ che SĐT và kênh CÓ ID (model lỡ
// chép từ kho); chữ KHÁCH gửi và mô tả/fact vẫn qua `locLienHe` đủ.
function locLienHeBot(s: string): string {
  return thayLienHeCoId(s, " [liên hệ qua Zalo] ").replace(/[ \t]{2,}/g, " ").trim();
}

// ─── FR-114/116 (v48): tin thuộc dự án — mã căn trong câu ("căn A12-05", "mã
// căn B2.07", "căn 1205") và tình trạng căn (enum `unit_status` của DB) nói
// bằng lời. Quá 7 ngày chưa chủ xác nhận (FR-116) thì bot KHÔNG được khẳng
// định còn/hết, phải "để em xác nhận lại chủ" + ask_owner.
const MA_CAN_RE =
  /(?:mã\s*căn|ma\s*can|căn\s*hộ|can\s*ho|căn|can)\s*(?:số|so)?\s*:?\s*([A-Za-z]{0,2}\d{1,2}[-.]\d{2,3}[A-Za-z]?|[A-Za-z]\d{2,4}|\d{4})\b/i;
const UNIT_VI: Record<string, string> = {
  con_ban: "còn bán", giu_cho: "đang giữ chỗ", da_coc: "đã cọc", da_ban: "đã bán",
};
const TTL_XAC_NHAN_MS = 7 * 24 * 3600e3;
const xacNhanCu = (at: string | null | undefined): boolean =>
  !at || Date.now() - Date.parse(at) > TTL_XAC_NHAN_MS;
type DuAnRow = {
  project_id?: string | null; unit_code?: string | null; unit_status?: string | null;
  last_confirmed_at?: string | null; projects?: { name?: string | null } | null;
};
function duAnNgan(l: DuAnRow): string {
  if (!l.project_id) return "";
  const p = [`dự án ${l.projects?.name ?? "(chưa rõ tên)"}${l.unit_code ? ` căn ${l.unit_code}` : ""}`];
  if (l.unit_status) p.push(`tình trạng căn: ${UNIT_VI[l.unit_status] ?? l.unit_status}`);
  p.push(xacNhanCu(l.last_confirmed_at)
    ? "chủ xác nhận lần cuối QUÁ 7 NGÀY (hoặc chưa từng) - nói 'để em xác nhận lại chủ rồi báo anh/chị' và điền ask_owner, KHÔNG khẳng định còn/hết"
    : `chủ xác nhận ${Math.max(0, Math.round((Date.now() - Date.parse(l.last_confirmed_at!)) / 864e5))} ngày trước - nói được theo tình trạng trên`);
  return " · " + p.join(" · ");
}

// ─── FR-27/31/65/79 (v48): các cổng regex trên bản BỎ DẤU (`tKD`, FR-161).
// "xem thêm" hình — chỉ có nghĩa khi lượt trước bot vừa gửi hình còn dư.
const XEM_THEM_RE_KD = /xem them|them (hinh|anh|tam)|con (hinh|anh|tam) (nao )?(nua|khac)|tam nua|gui them|hinh khac|(hinh|anh) tiep/;
// Khách hỏi căn "giống giống vầy" → nạp CĂN TƯƠNG TỰ.
const GIONG_RE_KD = /giong (giong )?(vay|nay|kieu nay|nhu vay|the nay)|tuong tu|na na|kieu (vay|nay|do)|nhu (vay|nay|the)|can (nao )?khac (giong|tuong tu)/;
// Khách đòi gọi điện / voice (FR-79). "sđt tôi 0909…" (khách CHO số ở bước
// chốt lịch) không khớp — chỉ khớp khi khách xin SỐ CỦA BÊN EM hay đòi gọi.
// 20/09/2026 (bắn thật mau-y-C): khách mua "cho mình xin số chủ nhà đi" — đường đi là qua người phụ
// trách (FR-173), không đưa SĐT chủ nhà qua chat (DH-02). Bản trước chỉ nói "chưa có căn nào khớp".
/** Nhãn tìm kiếm mà chính là giá trị của một ô tin (nhãn → [ô, giá trị ghi]) — gắn nhãn thì điền ô đó khi ô còn trống (FR-236, SRS-5.1zzzzzh). */
export const NHAN_LA_O: Record<string, [string, string]> = {
  tho_cu_100: ["tho_cu", "100%"],
  noi_that_full: ["noi_that", "full nội thất"],
};
const XIN_SO_CHU_RE = /\b(?:xin|cho|lay|gui|co|inbox)\b[^.?!]{0,25}\b(?:so|sdt|so dien thoai|zalo|lien he)\b[^.?!]{0,20}\b(?:chu nha|chu|nguoi ban|chinh chu|ben ban)\b|\bso\s+(?:dt\s+|dien thoai\s+)?(?:cua\s+)?chu\s*(?:nha)?\b|\blien he\s+(?:truc tiep\s+)?(?:voi\s+)?chu nha\b/;
const VOICE_RE_KD = /goi dien|goi (cho|lai) (em|anh|chi|toi|minh|tui)|\balo\b(?=[^.!?]*\b(?:duoc|dc|khong|ko|goi|nghe|may)\b)|\bvoice\b|\bcall\b|goi zalo|goi video|noi chuyen (dien thoai|qua dien thoai)|dien thoai cho (em|anh|chi|toi)|so (dien thoai|dt) (cua )?(em|be|ben em|ben minh|shop)/;
// Khách chấm sao sau buổi xem (FR-65): "4 sao", "3/5", "chấm 4", "5 điểm".
const SAO_RE_KD = /(?:^|[^\d])([1-5])\s*(?:sao\b|\/\s*5\b|diem\b)|cham\s*(?:cho\s*)?(?:em\s*)?([1-5])\b/;
// "Hiện thông báo cho người ta" (02/09): vừa gán nhãn thì nói thẳng cho họ
// nhãn gì và cách sửa nếu sai. FR-176 (07/09): BỎ biểu phí khỏi câu này —
// người ta vừa nhắn một câu rao, chưa hỏi gì mà nhận ngay một đoạn "1% giá
// chốt, 3/4 tháng tiền thuê" là giọng máy phát tờ rơi. Phí nói khi họ HỎI
// (FEE_RULES) và nhắc một câu lúc tin lên web. Admin vẫn nhận đủ nhãn + phí.
const cauNhan = (t: "ccrb" | "nmg") =>
  t === "nmg"
    ? "Em ghi nhận anh/chị là môi giới nha. Nếu là chính chủ thì nhắn em một tiếng để em sửa lại."
    : "Em ghi nhận anh/chị là chính chủ nha. Nếu là môi giới thì nhắn em một tiếng để em sửa lại.";

// FR-195: khoá nào nói về CẢ DỰ ÁN chứ không riêng một căn. Chủ nhà kể "toà này
// phí quản lý 16 nghìn/m2", "khu có hồ bơi tràn bờ", "bàn giao quý 2/2025" — đó
// là chuyện của dự án, tin sau của người khác trong cùng dự án cũng cần biết.
// Chép sang `project_facts` ở trạng thái CHỜ DUYỆT; ghi thẳng vào `projects` là
// một người nhớ nhầm thì cả kho sai theo (xem 20260910f).
/**
 * Tên dự án người ta vừa nhắc, dùng khi KHO CHƯA CÓ dự án đó (FR-195, 10/09).
 * Chỉ lấy phần sau chữ "dự án / khu / khu đô thị" và cắt ở dấu câu — không đoán
 * từ cả câu, vì đoán sai thì hàng chờ duyệt đầy rác và admin thôi nhìn nó.
 */
// Chữ mở đầu một MIÊU TẢ, không bao giờ mở đầu TÊN dự án. Bắt 10/09: câu "phí
// quản lý 14 nghìn/m2, khu có công viên ven sông" vào hàng chờ duyệt với tên dự
// án là "có công viên ven sông" — mồi dính chữ "khu" trần. Nay "khu" một mình
// không còn là mồi, và dù có khớp thì mấy chữ dưới đây cũng chặn lại.
const KHONG_PHAI_TEN = new Set([
  "có", "co", "gần", "gan", "này", "nay", "đó", "do", "đấy", "day", "kia",
  "bên", "là", "thì", "thi", "cũng", "cung", "rất", "rat",
  "nhiều", "nhieu", "được", "duoc", "vẫn", "đang", "dang", "sẽ", "se",
  "ở", "o", "trong", "ngoài", "ngoai", "nội", "toàn",
]);

// Bản KHÔNG DẤU của mấy chữ trên lại trùng chữ đầu của tên dự án THẬT: kho
// 1.639 dự án có LA ASTORIA, La Bonita, La Partenza, La Premier, La Maison De
// Cần Giờ, Van Phuc Riverside, Bến Cát Center City 2 — xếp thẳng "la"/"ben"/
// "van" vào danh sách cấm là bỏ sót đúng những cái tên kho CHƯA CÓ, tức đúng
// việc FR-195 sinh ra để làm. Nên chúng chỉ bị chặn khi chữ KẾ THEO viết
// thường ("dự án van phòng cho thuê", "dự án bên quận 7"); chữ kế viết hoa là
// dấu hiệu tên riêng ("dự án La Astoria") thì cho qua. Câu rao gõ toàn chữ
// thường vẫn bị chặn — thà thiếu một tên còn hơn đổ rác vào hàng chờ duyệt.
const MO_HO_KHONG_DAU = new Set(["la", "ben", "van", "noi", "toan"]);

function tenDuAnTrongCau(t: string): string | null {
  const m = /(?:dự án|du an|khu đô thị|khu do thi|khu dân cư|khu dan cu)\s+([\p{L}\p{N}'’.\- ]{3,45})/iu.exec(t);
  // Cắt luôn phần địa bàn dính đuôi: "Lam Sơn Riverside quận 4" → "Lam Sơn Riverside".
  let ten = (m?.[1]?.split(/[,.;\n]/)[0] ?? "")
    .replace(/\s+(quận|quan|phường|phuong|huyện|huyen|thành phố|tp)\b.*$/iu, "")
    .trim();
  // 30/09/2026: câu rao không phẩy ("dự án vinhome gran park 2pn 70m2 giá 3 tỷ") — cắt ở thông số đầu tiên (số kèm đơn vị,
  // "giá / tầm / diện tích"), kẻo cả câu thành tên (quá 6 chữ → null) và tìm theo nghĩa không có tên để tìm.
  const DON_VI = /^(?:pn|m2|m²|m|tỷ|ty|tỉ|ti|tr|triệu|trieu|tầng|tang|lầu|lau|phòng|phong|wc)$/iu;
  const tuTho = ten.split(/\s+/);
  // Chữ không dấu ("gia", "tam") trùng chữ trong tên dự án thật (Gia Hòa, Saigon Gia Định) → chỉ dừng khi SỐ theo ngay sau.
  const cat = tuTho.findIndex((w, i) => /^(?:giá|tầm|khoảng|diện|dt)$/iu.test(w) ||
    (/^(?:gia|tam|khoang|dien)$/i.test(w) && /^\d/.test(tuTho[i + 1] ?? "")) ||
    /^\d+(?:[.,]\d+)?(?:pn|m2|m²|m|tỷ|ty|tỉ|ti|tr|triệu|trieu|tầng|tang|lầu|lau|wc)$/iu.test(w) ||
    (/^\d+(?:[.,]\d+)?$/.test(w) && DON_VI.test(tuTho[i + 1] ?? "")));
  if (cat > 0) ten = tuTho.slice(0, cat).join(" ");
  const tu = ten.split(/\s+/);
  const dauTien = tu[0]?.toLowerCase() ?? "";
  if (KHONG_PHAI_TEN.has(dauTien)) return null;
  if (MO_HO_KHONG_DAU.has(dauTien) && !/^\p{Lu}/u.test(tu[1] ?? "")) return null;
  return ten.length >= 3 && tu.length <= 6 ? ten : null;
}

// 30/09/2026 (bắn thật "bán căn hộ sunrize city 2pn 70m2 giá 3 tỷ", AI im): tên không đứng sau "dự án" nên
// `tenDuAnTrongCau` ra null và tìm theo nghĩa không có gì để tìm. Tên sau "căn hộ / chung cư" — CHỈ làm đầu vào tìm theo
// nghĩa (máy xác nhận lọc tiếp), KHÔNG ghi thành fact tên dự án ("căn hộ chính chủ" không phải dự án "chính chủ").
const DEM_SAU_CAN_HO = new Set([
  "chinh", "can", "ban", "gia", "tang", "lau", "view", "goc", "full", "noi", "moi", "dep", "cao", "cap", "quan", "phuong",
  "tai", "o", "gan", "duong", "mat", "hem", "so", "nha", "dang", "cho", "thue", "khu", "vuc", "toa", "block", "thap", "mini",
  "dich", "vu", "trung", "tam", "ngay", "sat", "ben", "rong", "duplex", "penthouse", "studio", "officetel", "shophouse",
  "chung", "cu", "ho", "cc",
]);
function tenSauCanHo(t: string): string | null {
  const m = /(?:căn hộ|can ho|chung cư|chung cu)\s+([\p{L}\p{N}'’.\- ]{3,45})/iu.exec(t);
  const ten = m ? tenDuAnTrongCau(`dự án ${m[1]}`) : null;
  const dau = boDau(ten?.split(/\s+/)[0] ?? "");
  return ten && dau && !/^(?:\d|q\d)/.test(dau) && !DEM_SAU_CAN_HO.has(dau) ? ten : null;
}

// ─── 30/09/2026 (chủ dự án: "2 hàm tìm theo nghĩa cho địa danh và dự án đang nằm không trong DB … làm đi") ───
// Tên DỰ ÁN / tên ĐƯỜNG khách gõ sai mà khớp chữ (`match_projects`, `tim_duong` lệch ≤ 2 ký tự) không ra → tìm theo NGHĨA
// (vector, `tim_du_an_theo_nghia` / `tim_dia_danh_theo_nghia`, 20260930a), rồi MÁY xác nhận tên còn gần chữ khách gõ và ra
// đúng MỘT tên (`chonUngVienNghia`). Tắt tìm theo nghĩa / không ứng viên nào đạt → null, bot đi đường cũ (đường đi bình
// thường, không vào sổ). Gemini nhúng hỏng / quá giờ là SỰ CỐ → vào sổ (bắn thật 30/09: tin "sunrize city" không gắn dự
// án mà không để lại dấu vết gì, trong khi chính câu nhúng đó chạy tay ra Sunrise City đứng đầu).
/** Khoá Gemini theo thứ tự thử: GEMINI_API_KEY rồi GEMINI_API_KEY_2 (30/09/2026, khoá dự phòng khi chạm trần 429). */
async function khoaGemini(client: ReturnType<typeof serviceClient>): Promise<string[]> {
  return (await Promise.all([secretOf(client, "GEMINI_API_KEY"), secretOf(client, "GEMINI_API_KEY_2")])).filter((k): k is string => !!k);
}
/**
 * 01/10/2026 (bắn thử v316: mỗi lượt một dòng "Gemini embed 429" trong sổ lỗi): Gemini hết hạn mức (429 ở MỌI khoá) là một
 * SỰ CỐ kéo dài, không phải lỗi của từng lượt. Đặt mốc tạm dừng CHUNG với việc nhúng nền (`nhung_tam_dung_den`, 60 phút) —
 * `tim_nghia_san_sang()` thôi mở cửa nên các lượt sau không gọi Gemini nữa — và ghi sổ MỘT lần khi vừa đặt mốc. Mốc đang
 * còn hạn thì chỉ console.log. Lỗi khác vẫn ghi sổ như cũ.
 */
async function loiNhung(client: ReturnType<typeof serviceClient>, cho: string, e: unknown): Promise<void> {
  const msg = e instanceof Error ? e.message : String(e);
  if (!/^Gemini embed 429\b/.test(msg)) { await ghiLoi(client, cho, e); return; }
  const isoGiay = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const den = isoGiay(new Date(Date.now() + 60 * 60e3));
  // Cùng khuôn chuỗi 'YYYY-MM-DDTHH:MI:SSZ' với hàm SQL nên so chuỗi = so thời gian; '' (không dừng) nhỏ hơn mọi mốc.
  const { data, error } = await client.from("app_config").update({ value: den })
    .eq("key", "nhung_tam_dung_den").lt("value", isoGiay(new Date())).select("key");
  if (error) await ghiLoi(client, `${cho} (dat tam dung)`, error.message);
  else if (data?.length) await ghiLoi(client, cho, `${msg.slice(0, 120)} — tạm dừng tìm theo nghĩa tới ${den}`);
  else console.log(`${cho}: Gemini 429, đang trong đợt tạm dừng`);
}
async function sanSangNghia(client: ReturnType<typeof serviceClient>): Promise<string[] | null> {
  const { data: sang, error } = await client.rpc("tim_nghia_san_sang");
  if (error || sang !== true) return null;
  const ds = await khoaGemini(client);
  return ds.length ? ds : null;
}
type DuAnNghia = { id: string; name: string; district: string | null; ward: string | null };
async function timDuAnTheoNghia(client: ReturnType<typeof serviceClient>, ten: string | null | undefined): Promise<DuAnNghia | null> {
  const go = (ten ?? "").trim();
  if (go.length < 3) return null;
  try {
    const khoa = await sanSangNghia(client);
    if (!khoa) return null;
    const vec = await nhungCauTim(khoa, `Dự án ${go}`);
    const { data, error } = await client.rpc("tim_du_an_theo_nghia", { p_vec: vec, p_limit: 5 });
    if (error) { await ghiLoi(client, "chat-reply tim_du_an_theo_nghia", error.message); return null; }
    const u = chonUngVienNghia(go, ((data ?? []) as Array<{ id: string; name: string; do_gan: number }>).map((d) => ({ ...d, ten: d.name })), TU_CHUNG_DU_AN);
    if (!u) return null;
    const { data: p, error: pErr } = await client.from("projects").select("id, name, district, ward").eq("id", u.id).maybeSingle();
    if (pErr) { await ghiLoi(client, "chat-reply doc du an (theo nghia)", pErr.message); return null; }
    if (p) console.log(`du an theo nghia: "${go}" → ${u.name} (${u.do_gan.toFixed(3)})`);
    return (p as DuAnNghia | null) ?? null;
  } catch (e) {
    await loiNhung(client, "chat-reply tim du an theo nghia", e);
    return null;
  }
}
async function timDuongTheoNghia(client: ReturnType<typeof serviceClient>, ten: string, quan: string | null | undefined): Promise<string | null> {
  try {
    const khoa = await sanSangNghia(client);
    if (!khoa) return null;
    const vec = await nhungCauTim(khoa, `Đường ${ten}${quan ? `, ${quan}` : ""}, Thành phố Hồ Chí Minh`);
    const { data, error } = await client.rpc("tim_dia_danh_theo_nghia", { p_vec: vec, p_loai: ["duong", "so"], p_limit: 8 });
    if (error) { await ghiLoi(client, "chat-reply tim_dia_danh_theo_nghia", error.message); return null; }
    const ds = ((data ?? []) as Array<{ ten: string; quan_cu: string | null; do_gan: number }>)
      .filter((d) => !quan || !d.quan_cu || boDau(d.quan_cu) === boDau(quan));
    const u = chonUngVienNghia(ten, ds, TU_CHUNG_DUONG);
    if (u) console.log(`duong theo nghia: "${ten}" → ${u.ten} (${u.do_gan.toFixed(3)})`);
    return u?.ten ?? null;
  } catch (e) {
    await loiNhung(client, "chat-reply tim duong theo nghia", e);
    return null;
  }
}

/** SRS-5.1zzzzo: cột tin cho ảnh chụp "trước lượt" (`docTruocLuot`) và lượt chốt tin — đủ cho `giaTriKhongDoi` / `soSanhVoiDb`. */
const COT_TRUOC_LUOT = "deal, property_type, price_vnd, price_raw, price_per_m2_vnd, area_m2, frontage_m, length_m, rear_width_m, alley_width_m, " +
  "distance_to_street_m, bedrooms, bathrooms, floors, floor, floors_text, district, ward, street, location_raw, unit_code, direction, legal_status, " +
  "gap, negotiable, rent_income_vnd";
const KHOA_DU_AN = new Set([
  "phi_quan_ly", "phi_gui_xe", "tien_ich_gan", "ha_tang", "khu_compound",
  "thang_may", "pccc", "nam_xay", "xay_dung", "mat_do_xd", "tang_cao_toi_da",
  "so_huu", "thoi_han_su_dung", "gia_dien_nuoc",
]);

// NHỚ TẠM CẤU HÌNH 60 giây: bí mật cổng, trần lượt model/ngày và bảng
// `bot_prompts`. Trước bản này ba thứ đó là ba vòng đi về DB ở ĐẦU MỌI TIN
// (secret → Vault decrypt, prompts → select) cho những giá trị đổi vài lần
// một tháng. Hệ quả duy nhất: FR-138 "sửa prompt ở dashboard là bot đổi ngay
// lượt sau" thành "trong vòng một phút" — ghi rõ trong docs.
// Client Supabase KHÔNG nhớ tạm: dựng nó rẻ, và bộ e2e thay DB giả giữa các
// kịch bản bằng cách dựng client mới.
/**
 * SRS-5.1zzz: mục còn thiếu do `diem_tin` liệt kê (chữ cố định trong hàm SQL) → ô hỏi tương ứng, để mở ô chờ khi bot hỏi mục
 * đó. Tiềm năng không có ô trước bản nháp (hỏi bù sau đăng) → null. Thêm chữ mới ở `diem_tin` thì thêm dòng ở đây.
 */
function khoaCuaMucThieu(muc: string, loai: string | null | undefined): string | null {
  const m = muc.trim();
  const dat = ["dat", "dat_nong_nghiep", "dat_kinh_doanh"].includes(loai ?? "");
  if (/^hẻm rộng/.test(m)) return "do_rong_hem";
  if (/^đường vào rộng/.test(m)) return loai === "kho_xuong" ? "duong_container" : loai === "dat_nong_nghiep" ? "duong_vao" : "do_rong_duong";
  if (/^chiều ngang mặt tiền/.test(m)) return "mat_tien";
  if (m === "diện tích") return dat || ["phong_tro", "mat_bang", "kho_xuong"].includes(loai ?? "") ? "dien_tich" : loai === "chung_cu" ? "dien_tich_tim_tuong" : "dien_tich_dat";
  if (/^mấy tầng/.test(m)) return "ket_cau";
  if (/^mấy phòng ngủ/.test(m)) return "so_phong_ngu";
  if (/^thổ cư/.test(m)) return "tho_cu";
  if (/^quy hoạch, có lên thổ cư/.test(m)) return "quy_hoach";
  if (/^thời hạn sử dụng đất/.test(m)) return "thoi_han_su_dung";
  if (/^nội thất/.test(m)) return "noi_that";
  if (/^chiều cao thông thủy/.test(m)) return "chieu_cao";
  if (/^tải trọng sàn/.test(m)) return "tai_trong_san";
  if (/^pháp lý/.test(m)) return "phap_ly";
  if (m === "giá") return "gia";
  if (/ảnh/.test(m)) return "hinh_anh";
  return null;
}
const NHO_TAM_MS = 60e3;
type CauHinh = {
  at: number; gate: string | null; gateLoi: string | null; cap: number; P: Record<string, string>;
  /** FR-180: mẫu câu chuẩn mới nhất theo phía (mau_cau_fewshot), rỗng khi chưa có. */
  mauBan: string; mauMua: string;
  /** SRS-5.1zzm: `app_config.nhip_go = bat` → nghỉ gõ theo độ dài tin trước; mặc định 300 ms như quyết định 25/08. */
  nhipGo: boolean;
};
let nhoCauHinh: CauHinh | null = null;
// SRS-5.1zl (03/10/2026, giảm egress Supabase): bản prompt trong code theo khoá `bot_prompts`. Lượt bot gửi mã băm SHA-256
// của chúng cho `doc_prompt_khac` và chỉ nhận về khoá DB KHÁC code (bản sửa tay đè code) — trước đây kéo nguyên bảng ~38 KB
// mỗi lượt (60–80% byte của lượt; mỗi lượt là một isolate mới nên nhớ tạm trong bộ nhớ không giúp được).
const PROMPT_CODE: Record<string, string> = {
  tone_rules: TONE_RULES, cau_hoi_mau: CAU_HOI_MAU_TEXT, cau_tien_dinh: CAU_TIEN_DINH_TEXT, loi_chao: LOI_CHAO,
  human_chat_rules: HUMAN_CHAT_RULES, fee_rules: FEE_RULES, seller_script_rules: SELLER_SCRIPT_RULES, slang_notes: SLANG_NOTES,
  buyer_fewshot: BUYER_FEWSHOT, agree_rules: AGREE_RULES, seller_fewshot: SELLER_FEWSHOT,
};
let bamPromptCode: Record<string, string> | null = null;
async function napPrompt(client: ReturnType<typeof serviceClient>): Promise<Record<string, string>> {
  if (!bamPromptCode) {
    const hex = async (t: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    bamPromptCode = Object.fromEntries(await Promise.all(Object.entries(PROMPT_CODE).map(async ([k, v]) => [k, await hex(v)])));
  }
  const { data, error } = await client.rpc("doc_prompt_khac", { p_bam: bamPromptCode });
  if (!error) return Object.fromEntries(((data ?? []) as Array<{ key: string; content: string }>).map((r) => [r.key, r.content]));
  // RPC hỏng (vd chưa áp migration) → đọc nguyên bảng như cũ: thà tốn byte còn hơn bot chạy prompt sai bản.
  await ghiLoi(client, "chat-reply doc_prompt_khac", error.message);
  const { data: rows } = await client.from("bot_prompts").select("key, content");
  return Object.fromEntries((rows ?? []).map((r) => [r.key, r.content]));
}
async function napCauHinh(client: ReturnType<typeof serviceClient>): Promise<CauHinh> {
  // `globalThis.__khongNhoCauHinh` (chỉ bộ e2e): đọc lại mỗi lượt để ca kiểm đổi công tắc giữa chừng (nhip_go…).
  if (nhoCauHinh && Date.now() - nhoCauHinh.at < NHO_TAM_MS && !(globalThis as { __khongNhoCauHinh?: boolean }).__khongNhoCauHinh) return nhoCauHinh;
  // FR-180: mẫu câu chuẩn (anh/sếp sửa tay ở /admin/mau-cau) đi cùng lượt nạp
  // — sửa xong, trong vòng một phút bot đã bắt chước. Lỗi RPC thì coi như
  // chưa có mẫu, ghi sổ, không chặn lượt trả lời.
  // 23/09/2026 (bắn 6 tin song song): một lượt đọc BRIDGE_SECRET hụt → `gate` null được NHỚ
  // cùng cả gói 60 s → mọi tin tới isolate đó trong một phút đều 503 (tin khách thật mất theo).
  // Nay: đọc hụt thì đọc lại ngay một lần; vẫn hụt/trống thì KHÔNG nhớ gói (lượt sau đọc lại) —
  // cùng luật `gate.ts`: nhớ tạm chỉ giữ giá trị ĐÚNG, không bao giờ nhớ cái hụt.
  const docCong = async () => {
    const r1 = await docBiMat(client, "BRIDGE_SECRET");
    return r1.loi ? await docBiMat(client, "BRIDGE_SECRET") : r1;
  };
  const [cong, capRaw, promptP, mBan, mMua, nhipGoRaw] = await Promise.all([
    docCong(),
    secretOf(client, "DAILY_MODEL_CALL_CAP"),
    napPrompt(client),
    client.rpc("mau_cau_fewshot", { p_phia: "ban", p_n: 12 }),
    client.rpc("mau_cau_fewshot", { p_phia: "mua", p_n: 12 }),
    client.rpc("cau_hinh", { p_key: "nhip_go" }), // SRS-5.1zzm: công tắc nhịp gõ, đọc cùng gói 60 s
  ]);
  if (mBan.error) await ghiLoi(client, "chat-reply mau_cau_fewshot(ban)", mBan.error.message);
  if (mMua.error) await ghiLoi(client, "chat-reply mau_cau_fewshot(mua)", mMua.error.message);
  const gate = cong.giaTri;
  const goi: CauHinh = {
    at: Date.now(),
    gate,
    gateLoi: cong.loi,
    cap: Number(capRaw) > 0 ? Number(capRaw) : 1000,
    P: promptP,
    mauBan: String(mBan.data ?? "").trim(),
    mauMua: String(mMua.data ?? "").trim(),
    nhipGo: String(nhipGoRaw.data ?? "").trim() === "bat",
  };
  if (gate) nhoCauHinh = goi;
  return goi;
}
// Client model nhớ 5 phút: `anthropicClient` đọc khoá qua secretOf (Vault khi
// không có env) rồi `new Anthropic()` — mỗi tin một lần là thừa. Key đổi thì
// tối đa 5 phút sau isolate tự nạp lại; key HỎNG thì lượt gọi ném lỗi và đi
// đúng đường lưới đỡ như cũ (hàm này chỉ dựng client, không gọi mạng).
type ModelClient = Awaited<ReturnType<typeof anthropicClient>>;
let nhoModel: { at: number; client: ModelClient } | null = null;
async function napModel(client: ReturnType<typeof serviceClient>): Promise<ModelClient> {
  if (nhoModel && Date.now() - nhoModel.at < 5 * NHO_TAM_MS) return nhoModel.client;
  const c = bocGhiAi(await anthropicClient(client));
  nhoModel = { at: Date.now(), client: c };
  return c;
}
// Câu dặn khi kho căn chưa định vị được nơi khách muốn ở gần. Chế độ trợ lý đổi câu này (bắn thật 02/10: khách hỏi
// "quanh chợ An Đông có trường tiểu học nào" → bot hỏi ngược "chợ An Đông ở đường nào" vì câu dặn ép hỏi lại khách).
const HOI_LAI_NOI_DO = "- hỏi lại khách nơi đó ở đường nào / quận nào, KHÔNG đoán vị trí.";
const HOI_LAI_NOI_DO_TRO_LY = "- khách hỏi tiện ích / nơi chốn quanh đó thì gọi tim_tien_ich_quanh TRƯỚC; công cụ cũng không định vị được thì mới hỏi lại khách đường nào / quận nào, KHÔNG đoán vị trí.";
// SRS-5.1y: trợ lý có công cụ gọi THẲNG Claude (lưới dự phòng bỏ `tools`), nhớ tạm như `napModel`.
let nhoTroLy: { at: number; client: Awaited<ReturnType<typeof anthropicTrucTiep>> } | null = null;
async function napTroLy(client: ReturnType<typeof serviceClient>) {
  if (nhoTroLy && Date.now() - nhoTroLy.at < 5 * NHO_TAM_MS) return nhoTroLy.client;
  const c = bocGhiAi(await anthropicTrucTiep(client));
  nhoTroLy = { at: Date.now(), client: c };
  return c;
}
/**
 * Công tắc `app_config.tro_ly` (SRS-5.1y): `tat` (mặc định, không có dòng cũng là tắt) · `thu` = chỉ ID thử
 * (`la_id_thu`, chỗ duy nhất giữ tiền tố) · `bat` = mọi khách mua. Đọc hụt thì coi là tắt — đường cũ vẫn chạy.
 */
async function troLyBat(client: ReturnType<typeof serviceClient>, zalo: string): Promise<boolean> {
  const { data, error } = await client.rpc("cau_hinh", { p_key: "tro_ly" });
  if (error) return false;
  const v = String(data ?? "tat").trim();
  if (v === "bat") return true;
  if (v !== "thu") return false;
  const { data: thu, error: thuErr } = await client.rpc("la_id_thu", { p: zalo });
  return !thuErr && thu === true;
}
// FR-99 (v48): giá trung bình phường (triệu/m²) tính từ CHÍNH KHO — cùng
// deal + phường, tin đang lên kệ hoặc đã chốt, có giá số và diện tích. Một
// truy vấn gộp, nhớ tạm 60 s theo `deal|phường` ở tầng module như `bot_prompts`
// (FR-171 h): khách cùng phường trong một phút dùng chung một dòng. Không có
// đủ dữ liệu thì trả chuỗi rỗng — bot được dặn nói "chưa đủ dữ liệu để so".
// Đây là ước tính từ kho, KHÔNG phải thẩm định (OPEN-10 vẫn treo phần nguồn
// giá thị trường ngoài).
const nhoGiaTB = new Map<string, { at: number; line: string }>();
async function giaTBPhuong(
  client: ReturnType<typeof serviceClient>, deal: "ban" | "cho_thue", wardNum: string,
): Promise<string> {
  const key = `${deal}|${wardNum}`;
  const c = nhoGiaTB.get(key);
  if (c && Date.now() - c.at < NHO_TAM_MS) return c.line;
  const { data, error } = await client.from("listings").select("price_vnd, area_m2")
    .eq("deal", deal).ilike("ward", `Phường ${wardNum}`)
    .in("status", ["dang_ban", "dang_quan_tam", "da_chot"])
    .not("price_vnd", "is", null).not("area_m2", "is", null).limit(200);
  if (error) {
    await ghiLoi(client, "chat-reply gia tb phuong", error.message);
    return "";
  }
  const dv = (data ?? [])
    .map((r) => Number(r.price_vnd) / Number(r.area_m2))
    .filter((v) => Number.isFinite(v) && v > 0);
  const line = dv.length
    ? `giá TB phường ${wardNum} (${deal === "ban" ? "bán" : "thuê"}): ${
      Math.round(dv.reduce((a, b) => a + b, 0) / dv.length / 1e6)
    } tr/m² (${dv.length} tin)`
    : "";
  // Chỉ nhớ khi có số: phường chưa có tin nào là hiếm và truy vấn rẻ, còn nhớ
  // chuỗi rỗng là khoá luôn 60 s kể cả khi tin vừa lên kệ.
  if (line) nhoGiaTB.set(key, { at: Date.now(), line });
  return line;
}

// SEC-08 — danh sách host được phép cho `image_url`.
// Ảnh khách gửi qua Zalo luôn nằm trên CDN của Zalo. Mọi URL khác là URL do
// người gọi bịa: hoặc để hạ tầng model đi lấy hộ một địa chỉ nội bộ, hoặc để
// trỏ vào file khổng lồ cho treo hàm, hoặc để nhét một beacon vào
// `listing_facts` — bảng mà anon đọc được và trang tin hiển thị.
// Danh sách CHO PHÉP chứ không phải danh sách cấm: thứ không biết thì từ chối.
// Zalo phát ảnh qua nhiều tên miền CDN khác nhau; thiếu một cái là ảnh khách
// gửi bị chặn sạch mà bot vẫn trả lời tử tế — đúng kiểu hỏng im lặng. Bản đầu
// của danh sách này chỉ có `zadn.vn` và quên `zdn.vn`, bộ e2e bắt được ngay.
const HOST_ANH = [
  "zalo.me", "zadn.vn", "zdn.vn", "zaloapp.com", "zmdcdn.me", "zingmp3.vn",
];
function anhHopLe(url: string | null): string | null {
  if (!url) return null;
  if (url.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  const ok = HOST_ANH.some((d) => h === d || h.endsWith(`.${d}`));
  return ok ? url : null;
}

// 18/10/2026 (SRS-5.1zzzzzzz20) — VOICE trên Zalo CÁ NHÂN (bridge zca-js). Lớp lỗi: pipeline giải mã thoại
// (`transcribeVoiceUrl`, Groq Whisper → Gemini Flash) trước đây CHỈ được nối ở `zalo-webhook`
// (kênh OA); nhánh bridge gửi placeholder "[Khách gửi tin nhắn thoại/ghi âm]" + `file_url`
// (`tin_nhan_thoai.m4a`), file âm thanh rơi vào `loaiTep` → "khac" → bot trả "em chưa đọc được
// định dạng". Nay chat-reply nhận diện file thoại bằng ĐUÔI (và tên `tin_nhan_thoai`) rồi giải mã bằng
// CÙNG hàm. OA vẫn giải mã ở zalo-webhook (tới đây đã là chữ, không có `file_url` thoại → không giải mã hai lần).
const DUOI_THOAI = /\.(m4a|aac|mp3|mpeg|wav|ogg|oga|opus|amr)(?:$|[?#])/i;
function laTepThoai(url: string | null, ten: string | null): boolean {
  return DUOI_THOAI.test(url ?? "") || DUOI_THOAI.test(ten ?? "") || /tin_nhan_thoai/i.test(ten ?? "");
}

const xuLyLuot = async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  // 14/09/2026: đồng hồ theo chặng — lượt đầu người mua chậm 10–12 s mà không ai biết
  // chậm ở đâu. Mốc (ms từ đầu lượt) đi kèm payload `_ms` và log; không đổi hành vi.
  const t0Luot = Date.now();
  const moc: Record<string, number> = {};
  const danhDau = (k: string) => { moc[k] = Date.now() - t0Luot; };
  // SRS-5.1zzzzm (chủ dự án test Zalo 09/10/2026: khách "đúng em ơi" → bot "Dạ, nhà phố em ghi rồi ạ…" — nhà phố ghi từ lượt TRƯỚC):
  // SỔ GHI CỦA LƯỢT. Mọi fact lượt này ghi được đi qua cửa `ghiFactMotCua` (ghi-fact.ts) bằng hàm bọc dưới, nên đây là MỘT nguồn
  // của câu "lượt này em vừa ghi gì". Câu lệnh model chỉ được cho ghi nhận đúng những thứ trong sổ này (`dongVuaGhi`); sổ rỗng là
  // nói thẳng "không ghi thêm gì" — ghi nhận lại thứ trong ĐÃ BIẾT là lời máy ("em ghi rồi" cho điều khách không vừa nói).
  // SRS-5.1zzzzn: sổ ghi còn giữ ỨNG VIÊN NGUYÊN MẪU của từng fact — `goc` (cụm khách gõ AI chỉ ra, nơi gọi đưa kèm) và `vao` (chữ
  // đưa vào cửa ghi, trước khi cửa chuẩn hoá phường) — để bong bóng 🤖 in "Đã trích xuất "<cụm khách gõ>" → làm chuẩn "<chữ lưu>"".
  // `goc` KHÔNG bao giờ tới RPC (cửa ghi chỉ nhận `ThamSoFact`).
  // SRS-5.1zzzzo (bắn production 09/10/2026: khách chỉ hỏi phí, 🤖 in lại phường / kết cấu / giá / diện tích của câu rao): `doi` = giá
  // trị KHÁC thứ tin mang TRƯỚC lượt (`giaTriKhongDoi`, kiem-bang-chung.ts — một chủ). Ghi lại một giá trị không đổi (lượt chốt tin, khách
  // nhắc lại) vẫn đi DB như cũ (cửa ghi còn đồng bộ cột), nhưng KHÔNG phải "lượt này trích xuất được": dòng EM VỪA GHI, câu mẫu "Dạ em ghi
  // rồi ạ" và bong bóng 🤖 chỉ đọc mục `doi`.
  const ghiLuot: Array<{ listing_id: string; question: string; ghi: string; vao: string; goc: string | null; doi: boolean }> = [];
  // Trạng thái TRƯỚC lượt của từng tin (cột + fact mới nhất mỗi ô): đọc MỘT lần, ngay trước lượt ghi fact đầu tiên vào tin đó — mọi lượt
  // ghi sau trong cùng lượt so với cùng ảnh chụp. Tin không có trong danh sách tin đầu lượt (`idsTinDauLuot`, tin vừa tạo) → trước lượt là
  // rỗng: mọi giá trị đều mới. Đọc hỏng → coi như rỗng (đường cũ: mọi mục là mới), không chặn lượt ghi.
  // Cột tin đầu lượt đi chung truy vấn danh sách tin của người bán (`tinCuaNguoi`, đã có sẵn) — ảnh chụp chỉ tốn MỘT truy vấn fact.
  type DongTruoc = DongDb & { location_raw?: string | null; floors_text?: string | null; price_raw?: string | null };
  let idsTinDauLuot: Map<string, DongTruoc> | null = null;
  type TruocLuot = { dong: DongTruoc; facts: Record<string, string> };
  const truocLuot = new Map<string, Promise<TruocLuot | null>>();
  const docTruocLuot = (c: Parameters<typeof ghiFactMotCua>[0], lid: string): Promise<TruocLuot | null> => {
    let p = truocLuot.get(lid);
    if (!p) {
      p = (async () => {
        if (idsTinDauLuot && !idsTinDauLuot.has(lid)) return null;
        const [{ data: l, error: lErr }, { data: fs, error: fErr }] = await Promise.all([
          idsTinDauLuot ? Promise.resolve({ data: idsTinDauLuot.get(lid) ?? null, error: null }) : c.from("listings").select(COT_TRUOC_LUOT).eq("id", lid).maybeSingle(),
          c.from("listing_facts").select("question, answer").eq("listing_id", lid).order("created_at", { ascending: false }).limit(200),
        ]);
        if (lErr || fErr || !l) return null;
        const facts: Record<string, string> = {};
        for (const f of (fs ?? []) as Array<{ question: string; answer: string | null }>) if (f.answer && !(f.question in facts)) facts[f.question] = f.answer;
        return { dong: l as unknown as TruocLuot["dong"], facts };
      })().catch(() => null);
      truocLuot.set(lid, p);
    }
    return p;
  };
  const ghiFact = async (c: Parameters<typeof ghiFactMotCua>[0], a: ThamSoFact & { goc?: string | null }) => {
    const { goc, ...tham } = a;
    const lid = tham.p_listing_id ? String(tham.p_listing_id) : null;
    // Ô GHI NỐI (nhãn tìm kiếm chỉ ghi nhãn MỚI, ghi chú bổ sung nối thêm) — luôn là điều mới, không cần ảnh chụp.
    const laONoi = tham.p_question === "nhan" || tham.p_question === "bo_sung";
    const truoc = lid && !laONoi ? await docTruocLuot(c, lid) : null;
    const kq = await ghiFactMotCua(c, tham);
    if (!kq.error && !kq.boQua && lid) {
      const laPhuong = tham.p_question === "phuong" || (tham.p_question === "vi_tri" && viTriLaPhuong(String(tham.p_answer ?? "")));
      const question = laPhuong ? "phuong" : tham.p_question;
      const ghi = kq.ghi ?? String(tham.p_answer ?? "");
      ghiLuot.push({
        listing_id: lid, question, ghi, vao: String(tham.p_answer ?? ""), goc: goc ?? null,
        doi: !truoc || !giaTriKhongDoi(question, ghi, truoc.dong, truoc.facts),
      });
    }
    return kq;
  };
  /** Cụm khách gõ AI chỉ ra cho một fact (DeGhi.goc) — fact của luật không có. */
  const gocCua = (f: unknown): string | null => (f as { goc?: string | null } | null)?.goc ?? null;
  // SEC-06 — chặn body khổng lồ TRƯỚC khi parse. Trần model đếm LƯỢT, nhưng
  // tiền tính theo TOKEN: một request kèm `text` 500 KB là ~125.000 token đầu
  // vào cho đúng một "lượt", nên trần 1000 lượt/ngày không giữ được ví. Cầu
  // chì cũ đặt đúng chỗ nhưng nhìn nhầm đại lượng.
  const cl = Number(req.headers.get("content-length") ?? 0);
  if (cl > 128 * 1024) return jsonResponse({ error: "payload_too_large" }, 413);
  const tho = await req.text();
  if (tho.length > 128 * 1024) return jsonResponse({ error: "payload_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(tho || "{}");
  } catch {
    return jsonResponse({ error: "body phải là JSON" }, 400);
  }

  const externalUserId = String(body.external_user_id ?? "").trim().slice(0, 128);
  // Chế độ test "hello" (20260909b): câu báo đã xoá, gửi kèm lượt trả lời đầu.
  let thongBaoNhanTest: string | null = null;
  // SEC-06 — cắt cứng ở cửa vào. 4.000 ký tự đã dài gấp nhiều lần câu rao dài
  // nhất từng thấy; cắt ở đây thay vì ở từng chỗ dùng, vì chuỗi này đi thẳng
  // vào prompt model.
  // `let`: SRS-5.1zzzzzzg — nhánh bán GỘP CỤM tin chủ nhà nhắn giật cục vào `text` của lượt cuối (gán lại sau khi ghi tin vào sổ;
  // câu lưu vào `messages` vẫn là tin đơn). Mọi chỗ đọc `text` phía sau thấy bản gộp; cổng phân vai ở trên đọc tin đơn như cũ.
  let text = String(body.text ?? "").trim().slice(0, 12000); // 14/10/2026: 4.000 cắt mất cuối bài rao dán kèm tiện ích dự án
  const msgId = body.msg_id ? String(body.msg_id).slice(0, 200) : null;
  const channel = String(body.channel ?? "zalo_oa").slice(0, 40);
  // SEC-08 — chỉ nhận ảnh từ host của Zalo. Bản trước đưa URL thô của người
  // gọi thẳng vào `{type:"image", source:{type:"url"}}` của Anthropic: hạ tầng
  // của họ đi lấy hộ (SSRF gián tiếp, ký bằng khoá API của dự án), URL trỏ file
  // khổng lồ thì treo hàm và đốt token, và chuỗi đó còn được ghi vào
  // `listing_facts` — bảng anon đọc được — nên thành nội dung lạ đứng tên tin
  // của người khác.
  const imageUrl = anhHopLe(body.image_url ? String(body.image_url) : null);
  // SRS-5.1zzj (05/10/2026, demo AOND): FILE (PDF / CSV / XLSX) từ CDN Zalo cùng danh sách máy chủ với ảnh; LINK người bán
  // dán (`link_url` từ webhook, hoặc nằm trong chữ) — tải về có rào SSRF ở `kho_tep.ts`, chỉ nhánh NGƯỜI BÁN đọc.
  // `let`: fix VOICE 18/10 — file thoại được giải mã thành `text` sau cổng rồi XOÁ file_url/file_name
  // để lượt chạy như tin chữ (không rơi xuống nhánh tài liệu).
  let fileUrl = anhHopLe(body.file_url ? String(body.file_url) : null);
  let fileName = typeof body.file_name === "string" && body.file_name.trim() ? body.file_name.trim().slice(0, 200) : null;
  const linkUrl = typeof body.link_url === "string" && /^https?:\/\//i.test(body.link_url) && body.link_url.length <= 2048 ? body.link_url.trim() : null;
  // `mark_sent` là cửa ghi sổ, không phải tin nhắn — nó không có người gửi lẫn
  // nội dung. Xử ở dưới, SAU cổng bí mật.
  if (!body.mark_sent && (!externalUserId || (!text && !imageUrl && !fileUrl && !linkUrl))) {
    return jsonResponse({ error: "external_user_id và text (hoặc image_url / file_url / link_url) bắt buộc" }, 400);
  }
  let textOrTag = text || (fileUrl ? "[khách gửi file]" : linkUrl ? "[khách gửi link]" : "[khách gửi ảnh]");

  // FR-161: người ta gõ LẪN dấu suốt — "ban nha q5 giá 5 ty" có đúng một chữ
  // có dấu. Bản trước dò một cờ "câu này có dấu không" (bật khi câu chứa BẤT KỲ
  // ký tự có dấu nào) rồi chọn MỘT bộ regex theo cờ đó, nên câu lẫn dấu bị dồn
  // hết vào bộ CÓ DẤU và "ban", "nha" không khớp "bán", "nhà" — câu rơi im
  // lặng. Cờ đó nay bỏ hẳn: giữ lại là mời người sau dùng lại đúng cái bẫy.
  // `khop` thử CẢ HAI rồi lấy hợp: bộ không dấu chạy trên `tKD` (đã bỏ dấu)
  // nên phủ luôn câu gõ đủ dấu, bộ có dấu giữ cụm chỉ đúng khi có dấu. Chỉ nới
  // thêm, không bỏ mất khớp nào. Model vẫn nhận `text` gốc.
  // 11/09/2026 (42 ca): câu gõ bằng giọng nói đọc số bằng chữ ("quận năm, năm
  // mươi mét vuông, bốn tỷ rưỡi") → đổi sang chữ số TRƯỚC khi dò. Chỉ dùng để DÒ
  // và BÓC; câu lưu vào sổ và câu đưa model vẫn là `text` gốc.
  let textBoc = soChuThanhSo(text);
  let tKD = boDau(textBoc);
  const khop = (coDau: RegExp, khongDau: RegExp) =>
    coDau.test(text) || khongDau.test(tKD);

  // 03/10/2026 (giảm egress Supabase): đếm số lần gọi + byte phản hồi của lượt, ghi vào sổ inbound (`_luu_luong`).
  const demLuuLuong: DemLuuLuong = { so: 0, byte: 0, theo: {} };
  const client = serviceClient(demLuuLuong);

  // ─── CỔNG 1: bí mật dùng chung (tuỳ chọn, cùng khuôn với escalation-feed).
  // chat-reply KHÔNG phải endpoint công khai: chỉ bridge (máy local) và
  // zalo-webhook (server-to-server) gọi nó, không trình duyệt nào cả. Nhưng nó
  // đang mở cho bất kỳ ai cầm anon key — mà anon key nằm sẵn trong bundle JS
  // của web VÀ trong bot/bridge-zca/index.mjs của repo PUBLIC này.
  // BA ĐƯỜNG VÀO, không hơn: (1) service_role key ở header `authorization` —
  // đường của zalo-webhook, luôn qua; (2) `x-bridge-secret` khớp BRIDGE_SECRET
  // trong Vault — đường của bridge; (3) không có gì cả → KHÔNG QUA.
  // Câu cũ ở đây nói "chưa đặt secret thì chạy như cũ, không làm gãy bridge" —
  // đó chính là chỗ hỏng SEC-02 đã vá bên dưới; giữ lại câu đó thì lần sau có
  // người đọc comment rồi sửa code cho khớp comment, và cửa mở lại.
  // FR-171 h: bí mật cổng + trần lượt + bot_prompts đi chung một lượt nạp,
  // nhớ tạm 60 giây ở tầng module (xem `napCauHinh`).
  const { gate, gateLoi, cap: dailyCap, P, mauBan, mauMua, nhipGo } = await napCauHinh(client);
  // SRS-5.1zzm: nhịp gõ giữa các bong bóng (demo AOND delivery.py) — chat-reply tính một lần, webhook OA và bridge cùng dùng.
  const nhipGoBat = nhipGo;
  danhDau("cau_hinh");
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  // SEC-11: so hằng thời gian cả hai đường (service key và bí mật cổng).
  const isService = !!svcKey && auth.startsWith("Bearer ") &&
    await bangNhau(auth.slice(7), svcKey);

  // SEC-02 — FAIL-CLOSED. Bản trước: `if (gate && …)` nghĩa là `gate` rỗng thì
  // BỎ QUA cổng hoàn toàn, chỉ ghi một dòng sổ. Mà `gate` rỗng xảy ra không chỉ
  // khi chưa đặt secret: Vault lỗi, DB quá tải, timeout, hết kết nối — đều cho
  // ra `null`. Kẻ tấn công không cần gây sự cố, chỉ cần thăm dò mỗi phút và đợi
  // đúng khoảnh khắc DB nghẹn. Ghi sổ vẫn xảy ra, nhưng là ghi SAU KHI cho qua.
  if (!isService) {
    if (!gate) {
      if (Deno.env.get("GATE_MO_KHI_CHUA_CO_BI_MAT") !== "1") {
        await ghiLoi(client, "chat-reply CONG DONG",
          (gateLoi ? `Đọc BRIDGE_SECRET hụt hai lần (${gateLoi}) - TỪ CHỐI. ` : "Không có BRIDGE_SECRET (chưa đặt) - TỪ CHỐI. ") +
          "Đặt secret vào " +
          "Vault, hoặc bật tạm GATE_MO_KHI_CHUA_CO_BI_MAT=1 nếu cố ý chạy không cổng.");
        return jsonResponse({ error: "gate_unavailable" }, 503);
      }
      await ghiLoi(client, "chat-reply CONG MO",
        "GATE_MO_KHI_CHUA_CO_BI_MAT=1 - cổng đang MỞ có chủ ý, ai cũng gọi được.");
    } else if (!await bangNhau(req.headers.get("x-bridge-secret") ?? "", gate)) {
      return jsonResponse({ error: "forbidden" }, 403);
    }
  }

  // ─── FIX VOICE (SRS-5.1zzzzzzz20, 18/10/2026): giải mã tin thoại TẠI chat-reply, SAU cổng (không ai chưa qua cổng
  // đốt credit Groq/Gemini), TRƯỚC khi tách vai / bóc tách. Giải mã xong thay `text` = lời nói và
  // XOÁ file_url/file_name để lượt chạy như tin chữ thường (cả nhánh mua lẫn bán). Một lượt / turn
  // (chạy một lần trong `xuLyLuot`, không lặp). Keys đọc qua Vault như zalo-webhook. Hỏng im / câm
  // tiếng → GIỮ nguyên file_url: rơi về nhánh tài liệu cũ (nhánh bán nói "em đọc được PDF/ảnh/CSV…"),
  // không chặn lượt.
  if (!body.mark_sent && fileUrl && laTepThoai(fileUrl, fileName)) {
    try {
      // Cùng bộ khoá Vault với zalo-webhook (GEMINI_API_KEY_2 là khoá dự phòng khi khoá chính 429).
      const [groqKey, geminiKey, geminiKey2, geminiModelRaw] = await Promise.all([
        secretOf(client, "GROQ_API_KEY"),
        secretOf(client, "GEMINI_API_KEY"),
        secretOf(client, "GEMINI_API_KEY_2"),
        secretOf(client, "GEMINI_MODEL"),
      ]);
      const loiNoi = await transcribeVoiceUrl(fileUrl, {
        groqApiKey: groqKey,
        geminiApiKey: geminiKey || geminiKey2,
        geminiModel: geminiModelRaw || "gemini-1.5-flash",
      });
      if (loiNoi) {
        text = loiNoi.slice(0, 12000);
        textBoc = soChuThanhSo(text);
        tKD = boDau(textBoc);
        textOrTag = text;
        fileUrl = null;
        fileName = null;
      }
    } catch (e) {
      await ghiLoi(client, "chat-reply transcribe voice", e);
    }
  }

  // FR-162 — CỬA GHI NHẬN ĐÃ GỬI, cho người gọi không cầm service key.
  // `zalo-webhook` có service key nên tự ghi `sent_bubbles`/`sent_at` vào sổ.
  // Bridge (máy local) chỉ có publishable key + bí mật cổng, không đụng bảng
  // được — nên bên kênh `zalo_personal_test`, `sent_at` KHÔNG BAO GIỜ được ghi
  // và `already_sent` vĩnh viễn false. Tức cờ chống-gửi-đúp của FR-162 là chữ
  // chết ở đúng cái kênh đang chạy thật: một `msg_id` giao hai lần — hai lượt
  // thả tim cùng map về `react-<tid>-<gMsgID>` — là khách nhận lại nguyên loạt
  // bong bóng. Cửa này trả cho bridge đúng nửa còn thiếu.
  if (body.mark_sent) {
    const soDaGui = Number(body.sent_bubbles ?? 0);
    const xong = body.done !== false;
    // SEC-13 — RÀNG hai điều kiện. Bản trước cho phép đặt `sent_at` lên BẤT KỲ
    // `zalo_msg_id` nào: đánh dấu "đã gửi" cho các tin thật chưa gửi là câu trả
    // lời không bao giờ tới khách (luật chống-gửi-đúp FR-162 nuốt nó), mà mọi
    // mã HTTP trên đường đều 200 — đúng loại hỏng im lặng nhất.
    //   · `.is("sent_at", null)` — không đụng được dòng ĐÃ chốt gửi.
    //   · dòng phải mới trong 15 phút — bridge chỉ chốt việc nó vừa làm; không
    //     ai có lý do chính đáng để chốt một tin của hôm qua.
    const cat = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: dong, error: msErr } = await client.from("inbound_ledger").update({
      sent_bubbles: Number.isFinite(soDaGui) ? soDaGui : 0,
      ...(xong
        ? { sent_at: new Date().toISOString(), send_error: null }
        : { send_error: "gửi hụt giữa chừng - bridge báo lại" }),
      updated_at: new Date().toISOString(),
    })
      .eq("zalo_msg_id", String(body.mark_sent).slice(0, 200))
      .is("sent_at", null)
      .gte("created_at", cat)
      .select("zalo_msg_id");
    if (msErr) await ghiLoi(client, "chat-reply mark_sent", msErr.message);
    const dungDong = (dong?.length ?? 0) > 0;
    if (!msErr && !dungDong) {
      await ghiLoi(client, "chat-reply mark_sent tu choi",
        `không có dòng hợp lệ cho msg_id=${String(body.mark_sent).slice(0, 60)} ` +
        "(đã chốt gửi rồi, hoặc quá 15 phút, hoặc không tồn tại)");
    }
    return jsonResponse({ ok: !msErr && dungDong, marked: String(body.mark_sent), done: xong });
  }

  // CHẾ ĐỘ TEST (20260909b, chủ dự án 09/09/2026): ai nhắn đúng chữ "hello" là
  // xoá sạch dữ liệu số Zalo đó rồi tiếp đón như khách mới. Đứng SAU cổng bí
  // mật (người lạ không xoá được ai), TRƯỚC mọi lượt tra vai. Công tắc
  // `app_config.test_reset_hello` đọc mỗi lần gặp "hello" — không cache, tắt là
  // hết ngay. Chạy thật phải đặt 0: khách thật chào "hello" mà mất tin là sự cố.
  if (!body.human_note && /^\s*hello\s*[.!]*\s*$/i.test(text)) {
    const { data: congTac } = await client.rpc("cau_hinh", { p_key: "test_reset_hello" });
    if (String(congTac ?? "") === "1") {
      // FR-245 (29/09/2026): `reset_nguoi_test` nay chỉ xoá ID thử (lx-, do-…) — chủ dự án test bằng Zalo THẬT của mình qua
      // "hello" (công tắc bật tay), nên đường này gọi thẳng hàm xoá lõi.
      const { data: daXoa, error: xoaErr } = await client.rpc("xoa_nguoi_theo_zalo", { p_zalo: externalUserId });
      if (xoaErr) await ghiLoi(client, "chat-reply xoa_nguoi_theo_zalo", xoaErr.message);
      else console.log(`TEST reset "hello" ${externalUserId.slice(-4)}: ${JSON.stringify(daXoa)}`);
      thongBaoNhanTest = daXoa ? `(TEST) Em đã xoá dữ liệu cũ của mình: ${(daXoa as { listings?: number }).listings ?? 0} tin, ${(daXoa as { messages?: number }).messages ?? 0} tin nhắn. Bắt đầu lại như khách mới nha.` : null;
    }
  }

  // FR-141: bridge báo NGƯỜI THẬT (CTV/admin gõ tay từ acc clone) vừa nhắn cho
  // khách này → ghi tin sender='human' + đặt human_touch_at; bot nhường sân
  // 30 phút, hết yên ắng thì tự tiếp sức lại như thường.
  //
  // Tin gõ tay KHÔNG mang theo vai, mà một Zalo có thể vừa bán vừa mua
  // (OPEN-22/FR-157). Trước bản này `if (!hSeller)` bỏ qua SẠCH người bán —
  // tức `human_touch_at` không bao giờ được đặt trên hội thoại người bán, nên
  // cổng nhường sân bên nhánh seller là code chết: CTV đang thương lượng với
  // chủ nhà mà chủ nhắn tiếp thì bot vẫn chen ngang. Giờ đóng cổng ở MỌI hội
  // thoại đang có của người này.
  if (body.human_note) {
    const now141 = new Date().toISOString();
    const cham: string[] = [];
    const chamVao = async (convId: string, vai: string) => {
      const { error: hErr } = await client.from("messages").insert({
        conversation_id: convId, sender: "human", body: text,
      });
      if (hErr) await ghiLoi(client, `chat-reply human_note messages(${vai})`, hErr.message);
      // FR-147: người thật đã vào tay → hạ cờ cần-người-thật, khỏi leo lên admin
      await client.from("conversations").update({
        human_touch_at: now141, last_message_at: now141, needs_human: false,
      }).eq("id", convId);
      cham.push(vai);
    };

    const { data: hSeller } = await client.from("sellers").select("id")
      .eq("zalo_user_id", externalUserId).maybeSingle();

    if (hSeller) {
      const { data: hsc, error: hscErr } = await client
        .rpc("ensure_seller_conversation", {
          p_seller_id: hSeller.id, p_channel: channel,
        }).single();
      const hsConvId = (hsc as { c_id?: string } | null)?.c_id ?? null;
      if (hscErr || !hsConvId) {
        await ghiLoi(client, "chat-reply human_note ensure_seller_conversation",
          hscErr?.message ?? "không trả về c_id");
      } else {
        await chamVao(hsConvId, "seller");
      }

      // Người đang bán VẪN có thể đang có hội thoại mua (FR-157) — cổng phải
      // phủ luôn nhánh đó. Nhưng chỉ đụng hội thoại ĐÃ CÓ: tạo mới buyer cho
      // một người đang bán là bịa ra một đơn khách không tồn tại.
      const { data: hBuyer } = await client.from("buyers").select("id")
        .eq("zalo_user_id", externalUserId).maybeSingle();
      if (hBuyer) {
        const { data: hbConv } = await client.from("conversations").select("id")
          .eq("buyer_id", hBuyer.id).order("started_at", { ascending: false })
          .limit(1).maybeSingle();
        if (hbConv) {
          await chamVao(hbConv.id, "buyer");
          await client.from("reminders").update({ status: "cancelled" })
            .eq("buyer_id", hBuyer.id).eq("kind", "escalation").eq("status", "pending");
        }
      }
    } else {
      const { data: hbc, error: hbcErr } = await client.rpc("ensure_buyer_conversation", {
        p_zalo_user_id: externalUserId, p_channel: channel,
      }).single();
      const hConvId = (hbc as { c_id?: string } | null)?.c_id ?? null;
      const hBuyerId = (hbc as { b_id?: string } | null)?.b_id ?? null;
      if (hbcErr || !hConvId) {
        await ghiLoi(client, "chat-reply human_note ensure_buyer_conversation",
          hbcErr?.message ?? "không trả về c_id");
      } else {
        await chamVao(hConvId, "buyer");
        if (hBuyerId) {
          await client.from("reminders").update({ status: "cancelled" })
            .eq("buyer_id", hBuyerId).eq("kind", "escalation").eq("status", "pending");
        }
      }
    }
    return jsonResponse({ ok: true, human_note: true, cham });
  }

  // AOND Sync Turn: Đồng bộ trực tiếp tin nhắn và phản hồi từ Python Core vào CRM
  // mà không kích hoạt duplicate AI model của Supabase Deno Edge Function.
  if (body.sync_turn) {
    const nowSync = new Date().toISOString();
    const botReplies: string[] = Array.isArray(body.bot_replies) && body.bot_replies.length
      ? body.bot_replies
      : (body.bot_reply ? [String(body.bot_reply)] : []);

    const userText = String(text || "");
    const imgUrl = body.image_url || (Array.isArray(body.image_urls) ? body.image_urls[0] : null);

    let convId: string | null = null;
    let senderRole = "seller";

    const { data: hSeller } = await client.from("sellers").select("id")
      .eq("zalo_user_id", externalUserId).maybeSingle();

    if (hSeller) {
      const { data: hsc } = await client.rpc("ensure_seller_conversation", {
        p_seller_id: hSeller.id, p_channel: channel,
      }).single();
      convId = (hsc as { c_id?: string } | null)?.c_id ?? null;
      senderRole = "seller";
    } else {
      const { data: hbc } = await client.rpc("ensure_buyer_conversation", {
        p_zalo_user_id: externalUserId, p_channel: channel,
      }).single();
      convId = (hbc as { c_id?: string } | null)?.c_id ?? null;
      senderRole = "buyer";
    }

    if (convId) {
      if (userText || imgUrl) {
        const bodyContent = imgUrl ? `${userText} [ảnh: ${imgUrl}]` : userText;
        await client.from("messages").insert({
          conversation_id: convId,
          sender: senderRole,
          body: bodyContent,
          zalo_msg_id: msgId || null,
        });
      }

      if (botReplies.length) {
        await client.from("messages").insert(
          botReplies.map((r) => ({
            conversation_id: convId,
            sender: "bot",
            body: r,
          }))
        );
      }

      await client.from("conversations").update({
        last_message_at: nowSync,
      }).eq("id", convId);
    }

    return jsonResponse({ ok: true, sync_turn: true, conversation_id: convId });
  }

  // ─── SỔ INBOUND (FR-162): mỗi zalo_msg_id là MỘT vòng đời xử lý
  // received → processing → completed/failed, lưu nguyên payload trả lời.
  // Đứng TRƯỚC cổng quota là cố ý: tin duplicate không được đốt lượt model.
  //   * completed → PHÁT LẠI payload đã lưu. Kênh gửi hụt (Zalo lỗi, bridge
  //     timeout) cứ gọi lại cùng msg_id là lấy lại được câu trả lời — retry
  //     outbound không cần chạy lại AI.
  //   * in_flight → bản sao thứ hai của cùng tin đang được lượt khác xử lý
  //     NGAY LÚC NÀY (race hai bản sao). Đứng ngoài, không xử lý đôi; bridge
  //     thấy cờ này thì chờ rồi hỏi lại.
  //   * claimed  → làm như thường. r_attempts > 1 nghĩa là lượt trước
  //     failed/chết giữa chừng — tin có thể ĐÃ nằm trong `messages`, nên 23505
  //     ở dưới không được nuốt nữa mà phải đi tiếp trả lời nốt.
  // Sổ hỏng (RPC lỗi) thì chạy như cũ — unique index messages.zalo_msg_id vẫn
  // là lưới đỡ cuối — nhưng phải vào bot_errors (FR-152).
  let coSo = false;      // lượt này có cầm sổ không
  let soAttempts = 1;    // lần thử thứ mấy của msg_id này
  if (msgId) {
    const { data: so, error: soErr } = await client
      .rpc("claim_inbound", { p_msg_id: msgId }).single();
    // Kiểu phải khớp RETURNS TABLE của `claim_inbound` — thiếu `r_dead` thì
    // `deno check` kêu TS2339 ở nhánh "đã chết 8 lượt" (bật kiểm kiểu 11/09).
    const soRow = so as {
      r_state?: string; r_reply?: Record<string, unknown> | null; r_attempts?: number;
      r_sent_at?: string | null; r_dead?: boolean;
    } | null;
    if (soErr || !soRow?.r_state) {
      await ghiLoi(client, "chat-reply claim_inbound",
        soErr?.message ?? "không trả về r_state");
    } else if (soRow.r_state === "completed") {
      // `already_sent` = lần trước MỌI bong bóng đã tới Zalo (webhook ghi
      // sent_at). Kênh dựa vào cờ này để exactly-once chiều gửi: provider giao
      // trùng thì im (khách không nhận đúp), gửi hụt lần trước thì gửi lại.
      return jsonResponse({
        reply: null, replies: [], ...(soRow.r_reply ?? {}),
        deduped: true, replayed: true, already_sent: !!soRow.r_sent_at,
      });
    } else if (soRow.r_state === "in_flight") {
      return jsonResponse({ reply: null, replies: [], deduped: true, in_flight: true });
    } else if (soRow.r_state === "dead" || soRow.r_dead) {
      // FR-166 bất biến 7: đã hỏng đủ 8 lượt, ĐỪNG THỬ NỮA. Trước bản này
      // `dead` rơi tuột vào nhánh `else` bên dưới và được xử như việc mới:
      //   * đốt một lượt gọi model đầy đủ cho một dòng đã bị bỏ,
      //   * `baoHong` sau đó va guard `inbound_ledger_giu_completed` nên không
      //     ghi được gì — hỏng im lặng,
      //   * và vì nhánh này KHÔNG cầm hợp đồng thuê, hai lượt giao cùng lúc của
      //     cùng msg_id đều chạy tới cuối và ĐỀU GỬI, phá đúng cái bất biến
      //     exactly-once mà cả FR-162 dựng lên để giữ.
      // Không giành sổ (`coSo` giữ false) nên mọi đường ra phía sau không đụng
      // vào dòng thư chết nữa.
      await ghiLoi(client, "chat-reply dead",
        `msg_id ${msgId} đã ở thư chết sau ${soRow.r_attempts ?? "?"} lượt - bỏ qua, ` +
          `không gọi model. Xem /admin để xử tay.`);
      return jsonResponse({
        reply: null, replies: [], deduped: true, dead: true,
        already_sent: !!soRow.r_sent_at,
      });
    } else {
      coSo = true;
      soAttempts = soRow.r_attempts ?? 1;
    }
  }
  // MỌI đường ra phía sau phải đi qua một trong hai cửa này, để sổ không bao
  // giờ kẹt ở processing oan (kẹt thật — function chết — thì claim_inbound tự
  // reclaim sau 150s). Ghi sổ hụt không được chặn đường trả lời: chỉ ghiLoi.
  // SRS-5.1zzzzzq (Zalo thật 13/10/2026: "mình cần mua" 11:12:49, "ngân sách tầm 15 tỷ" 11:12:56, bot trả lời tin 1 lúc 11:12:59 bằng
  // câu "có khoảng giá nào không ạ?" rồi tin 2 lúc 11:13:08): check nhường lượt FR-131 chạy ở ĐẦU lượt, tin 2 vào trong 10 giây model
  // chạy thì không ai nhìn lại. Nhánh mua đặt hàm này sau khi biết seq tin của mình; `viecGhiTraLoi` gọi nó NGAY TRƯỚC KHI ghi lời bot
  // vào `messages` (ghi xong là lịch sử lượt sau coi như bot đã nói): có tin khách mới hơn → không ghi, không gửi (completed-rỗng),
  // lượt của tin cuối trả lời trên ngữ cảnh gộp. Hồ sơ / việc khác vẫn ghi, chỉ bớt một câu lạc nhịp.
  let kiemTinMoiHon: (() => Promise<boolean>) | null = null;
  const hoanTatGoc = async (payload: Record<string, unknown>, code = 200) => {
    moc.tong = Date.now() - t0Luot;
    const gioAi = gioAiHienTai();
    payload = { ...payload, _ms: { ...moc, ...(gioAi.length ? { ai: gioAi } : {}) }, _luu_luong: tomTatLuuLuong(demLuuLuong) };
    if (Array.isArray(payload.replies) && (payload.replies as unknown[]).length > 1) {
      payload = { ...payload, nhip_go: nhipGui(payload.replies as string[], nhipGoBat) };
    }
    console.log("chat-reply _ms", JSON.stringify(moc), gioAi.join(" | "));
    if (coSo) {
      const { error: soErr2 } = await client.from("inbound_ledger").update({
        status: "completed", reply: payload, updated_at: new Date().toISOString(),
      }).eq("zalo_msg_id", msgId);
      if (soErr2) await ghiLoi(client, "chat-reply hoanTat ledger", soErr2.message);
    }
    return jsonResponse(payload, code);
  };
  // 20260909b: câu "(TEST) Em đã xoá…" đi kèm lượt trả lời đầu sau khi reset.
  const hoanTat = async (payload: Record<string, unknown>, code = 200) => {
    if (thongBaoNhanTest && Array.isArray(payload.replies)) {
      const replies = [thongBaoNhanTest, ...(payload.replies as string[])];
      payload = { ...payload, replies, reply: replies.join("\n"), test_reset: true };
      thongBaoNhanTest = null;
    }
    return await hoanTatGoc(payload, code);
  };
  const baoHong = async (payload: Record<string, unknown>, code: number, detail: string) => {
    if (coSo) {
      // FR-166: PHẢI đi qua `bao_hong_inbound`, đừng ghi thẳng `status='failed'`.
      // Hàm đó mới là chỗ đặt `next_retry_at = now() + lan_thu_ke(attempts)` và
      // tự chuyển thư chết ở lượt thứ 8. Ghi tay như trước là bỏ mất giờ hẹn:
      // `inbound-sweep` quét `failed` với `next_retry_at` NULL thì coi là tới
      // giờ NGAY, nên nó cứu lại mỗi phút một lượt — một tin gặp lỗi hết hạn
      // mức (quota) đốt sạch 8 lượt trong 8 phút rồi nằm `dead` vĩnh viễn,
      // đúng ngược lại lời hứa "lùi dần" ghi trong chính comment cũ.
      // Hàm này cũng tự né dòng đã `completed` (guard FR-163), nên không cần
      // kiểm trước ở đây.
      const { error: soErr3 } = await client.rpc("bao_hong_inbound", {
        p_msg_id: msgId, p_detail: detail.slice(0, 500),
      });
      if (soErr3) await ghiLoi(client, "chat-reply baoHong ledger", soErr3.message);
    }
    return jsonResponse(payload, code);
  };

  // FR-217 (23/09/2026): lệnh TEST "/json" — in thứ bot đã lưu cho chính người nhắn (cột, fact, bóc tách, văn bản
  // đã nhúng vector). Công tắc riêng `app_config.lenh_json` (bat | tat, 20260923f); tắt thì "/json" đi như tin thường. Không gọi model,
  // không tính trần lượt, không ghi vào hội thoại.
  if (!body.human_note && /^\s*\/json\s*$/i.test(text)) {
    const { data: congTacJ } = await client.rpc("cau_hinh", { p_key: "lenh_json" });
    if (String(congTacJ ?? "").trim() === "bat") {
      try {
        const bong = await soanLenhJson(client, externalUserId);
        return await hoanTat({ reply: bong.join("\n"), replies: bong, lenh_json: true });
      } catch (e) {
        await ghiLoi(client, "chat-reply lenh /json", e);
        const loi = "(TEST /json) Em đọc dữ liệu bị lỗi, đã ghi sổ ạ.";
        return await hoanTat({ reply: loi, replies: [loi], lenh_json: true });
      }
    }
  }

  // ─── CỔNG 2a: trần THEO TỪNG NGƯỜI (SEC-05, migration 20260905d).
  // Trần toàn cục bên dưới chặn được ví nhưng KHÔNG chặn được kẻ phá: gửi 1000
  // request rác trong vài phút là bot im với tất cả mọi người tới nửa đêm —
  // cầu chì giữ tiền hoá ra là nút tắt dịch vụ ai cũng bấm được.
  //
  // Bình luận cũ ở đây nói đếm theo `external_user_id` là vô nghĩa vì chuỗi đó
  // người gọi tự đặt. ĐÚNG khi webhook chưa kiểm chữ ký. Sau SEC-01 thì
  // `sender.id` do Zalo ký, không bịa được, nên đếm theo uid mới có nghĩa.
  // 30 lượt/giờ và 120 lượt/ngày cho uid lạ, nới gấp 4 cho người đã quen
  // (có trong sellers/ctvs/admins) — chủ nhà rao một căn nhắn hàng chục lượt
  // liền là chuyện thường, chặn nhầm họ là hỏng việc thật.
  const { data: duoiTranNguoi } = await client.rpc("bump_user_quota", { p_uid: externalUserId });
  if (duoiTranNguoi === false) {
    // Im với RIÊNG người này; những người khác không bị ảnh hưởng.
    return await baoHong(
      { reply: null, replies: [], user_quota_exceeded: true }, 429, "trần cá nhân đã chạm",
    );
  }

  // ─── CỔNG 2b: trần TOÀN CỤC lượt gọi model mỗi ngày.
  // Giữ nguyên làm chốt chặn cuối về TIỀN: trần cá nhân chặn một kẻ, trần này
  // chặn một nghìn kẻ. Chỉnh bằng secret DAILY_MODEL_CALL_CAP trong Vault;
  // mặc định 1000/ngày (đọc kèm cấu hình ở đầu hàm, nhớ tạm 60 giây).
  const { data: underQuota } = await client.rpc("bump_model_quota", { p_limit: dailyCap });
  if (underQuota === false) {
    // Im lặng hoàn toàn: trả lời thì vẫn tốn lượt model, mà đây đúng là thứ
    // đang cần chặn. bump_model_quota đã báo admin đúng một lần trong ngày.
    // Sổ ghi failed chứ không completed: sang ngày quota reset, kênh gửi lại
    // cùng msg_id thì tin ĐƯỢC xử lý thật chứ không bị phát lại cái rỗng.
    return await baoHong(
      { reply: null, replies: [], quota_exceeded: true }, 429, "quota ngày đã chạm trần",
    );
  }

  // Qua hết các cổng — từ đây là xử lý thật. Sổ đã ở `processing` từ lúc
  // `claim_inbound` (hàm DB đặt trạng thái đó ngay khi giành được sổ), nên
  // không còn câu UPDATE riêng ở đây nữa (FR-171 h); trượt trần quota ở trên
  // thì `baoHong` ghi đè bằng `failed` như cũ.

  // FR-138: "não" cấu hình được từ dashboard — bảng bot_prompts đè lên mặc định
  // trong prompts.ts. Chủ dự án sửa content ở Table Editor là bot đổi trong
  // vòng một phút (nhớ tạm `napCauHinh`), không cần deploy. Không có dòng nào
  // thì dùng bản trong code.
  // FR-181 (09/09/2026 chiều): MỖI KHÁCH MỘT TÊN TRỢ LÝ, gán tất định theo Zalo
  // ID và giữ suốt (T•ai, Kh•ai, M•ai…). Prompt/lời chào viết "{ten}", điền ở đây.
  const tenBot = tenTroLy(externalUserId);
  // 14/09/2026 (đo thật): khối system được NHỚ TẠM mà lại chứa tên trợ lý riêng của
  // từng khách (20 tên •ai) → mỗi khách một bản, lượt nào cũng `cache_read 0`,
  // `cache_write 16.058` token: model đọc lại 16 nghìn token mỗi lượt (chậm) và trả
  // tiền GHI nhớ tạm (2 lần giá) mà không bao giờ được đọc lại. Khối nhớ tạm nay
  // dùng chữ giữ chỗ chung; tên thật đi ở phần KHÔNG nhớ tạm (`DONG_TEN`).
  const TEN_GIU_CHO = "«tên em»";
  const DONG_TEN = `TÊN EM trong cuộc trò chuyện này là "${tenBot}" — chỗ nào ở trên ghi ${TEN_GIU_CHO} thì là tên này; không đổi, không xưng tên khác.`;
  const TONE = dienTen(P.tone_rules ?? TONE_RULES, TEN_GIU_CHO);
  // 09/09/2026: câu hỏi mẫu + lời chào khách mới đọc từ bot_prompts (đè lên code).
  const { bang: BANG_CAU, loi: loiCauMau } = docCauHoiMau(P.cau_hoi_mau);
  // 05/10/2026 (văn phong demo AOND, SRS-5.1zzi): câu lệnh cho model chỉ đưa Ý cần hỏi, model tự đặt câu. Câu mẫu
  // chỉ đi kèm khi chủ dự án ĐÃ SỬA câu đó ở dashboard — quyền kiểm soát 09/09 giữ nguyên. `bot_prompts.cau_hoi_mau`
  // chứa CẢ BẢNG (seed từ code), nên "đã sửa" = chữ trong DB KHÁC chữ trong code, không phải "có khoá trong DB".
  const CAU_MAU_DB = ((): Set<string> => {
    try {
      const o = JSON.parse(P.cau_hoi_mau ?? "{}") as Record<string, unknown>;
      return new Set(Object.keys(o).filter((k) => typeof o[k] === "string" && (o[k] as string).trim() !== (CAU_HOI_MAU_GOC[k] ?? "").trim()));
    } catch { return new Set(); }
  })();
  const cauMauDaSua = (k: string, loai?: string | null): boolean => CAU_MAU_DB.has(k) || (!!loai && CAU_MAU_DB.has(`${k}@${loai}`));
  /** Dòng ĐÃ BIẾT về căn cho model (khuôn demo AOND): chỉ cột đã có, viết kiểu nói — model không được đọc lại số này. */
  const daBietNgan = (l: { property_type?: string | null; street?: string | null; location_raw?: string | null; ward?: string | null; district?: string | null;
    floors_text?: string | null; bedrooms?: number | null; price_vnd?: number | string | null; area_m2?: number | string | null; legal_status?: string | null;
    deal?: string | null } | null | undefined): string => {
    if (!l) return "";
    const p: string[] = [];
    // SRS-5.1zzzzzh (bắn production 12/10, thu-kb-thue): khách nói "cho thuê căn hộ" từ lượt đầu, lượt hai bot hỏi "Anh chị định bán hay cho thuê
    // căn này vậy?" — dòng ĐÃ BIẾT không có bán / thuê nên model tưởng chưa biết. Điều đã biết phải có mặt trong ĐÃ BIẾT.
    if (l.deal === "cho_thue") p.push("cho thuê");
    else if (l.deal === "ban") p.push("bán");
    if (l.property_type) p.push(loaiDoc(l.property_type));
    // SRS-5.1zzzzj: địa chỉ qua MỘT nguồn in (`diaChiHienThi`) — model chép lại chữ nào thì khách đọc chữ đó, nên không đưa chữ khách gõ thô.
    const dc = diaChiHienThi({ location_raw: l.location_raw ?? l.street, street: l.street, ward: l.ward, district: l.district });
    if (dc) p.push(dc);
    if (l.area_m2 != null && l.area_m2 !== "") p.push(`${l.area_m2}m2`);
    if (l.floors_text) p.push(l.floors_text);
    if (l.bedrooms) p.push(`${l.bedrooms} phòng ngủ`);
    const g = Number(l.price_vnd);
    if (g > 0) p.push(g >= 1e9 ? `${String(+(g / 1e9).toFixed(2)).replace(".", ",")} tỷ` : `${Math.round(g / 1e6)} triệu`);
    const phapLy: Record<string, string> = { so_hong_rieng: "sổ riêng", so_hong_chung: "sổ chung", so_hong: "có sổ hồng", hdmb: "hợp đồng mua bán", giay_tay: "giấy tay" };
    if (l.legal_status) p.push(phapLy[l.legal_status] ?? l.legal_status);
    return p.join(" · ");
  };
  // FR-138 b (10/09): chữ TIỀN ĐỊNH cũng sửa được ở Dashboard — chủ dự án:
  // "chuyển mấy câu đó vào bot_prompts luôn đi để tao còn kiểm soát".
  const { bang: CAU_TD, loi: loiCauTD } = docCauTienDinh(P.cau_tien_dinh);
  if (loiCauTD) await ghiLoi(client, "bot_prompts.cau_tien_dinh hỏng JSON", loiCauTD);
  if (loiCauMau) await ghiLoi(client, "chat-reply bot_prompts.cau_hoi_mau JSON", loiCauMau);
  // FR-186: câu riêng theo loại BĐS ("huong@chung_cu") — truyền `loai` khi biết.
  // 13/09/2026: tin ở HUYỆN / thị xã / tỉnh lân cận thì hỏi XÃ, ở MỌI lượt — bản
  // trước chỉ đổi ở câu hỏi đầu, lượt sau vẫn "Nhà mình ở phường nào" cho đất Củ Chi.
  // 14/09/2026: câu "gấp" của tin CHO THUÊ khác tin bán — truyền `deal` khi biết.
  // 17/09/2026 (chủ dự án): hỏi phường khi tin ĐÃ có địa chỉ thì nhắc địa chỉ đó, ngắn:
  // "Hẻm 4m Trần Hưng Đạo đó phường mấy cô nhỉ?" — truyền `diaChi` khi biết.
  const cauHoiMauTho = (k: string, ac: string, loai?: string | null, quan?: string | null, deal?: string | null, diaChi?: string | null) =>
    k === "phuong" && diaChi && !laNgoaiDoThi(quan)
      ? cauPhuongNgan(duongHienThi(diaChi), ac) // SRS-5.1zzzzj: in địa chỉ qua MỘT nguồn, không chép chữ khách thô
      : cauHoiMauGoc(
        k === "phuong" && laNgoaiDoThi(quan) ? "phuong@huyen" : k === "gap" && deal === "cho_thue" ? "gap@cho_thue"
          : k === "do_rong_hem" && laSoNhaHem(diaChi) ? "do_rong_hem@so_nha_hem"
          // 27/09/2026 (chủ dự án: "hỏi hơi nhiều"): tin bán — câu pháp lý gộp (`phap_ly@ban`, `quy_hoach@ban`).
          : (k === "phap_ly" || k === "quy_hoach") && deal === "ban" ? `${k}@ban` : k,
        ac, BANG_CAU, loai,
      // 30/09/2026: "137/28 …" là hẻm 137, nhà số 28 (quy ước TP.HCM) — câu hỏi hẻm gọi đúng số hẻm.
      ).replace(/trong hẻm(?!\s*\d)/, (s) => k === "do_rong_hem" && tachSoNhaHem(diaChi) ? `${s} ${tachSoNhaHem(diaChi)!.hem}` : s);
  // SRS-5.1zzy: câu mẫu viết "Nhà mình …" cho mọi loại — tin đất / căn hộ gọi đúng loại ngay tại đây, không chờ van sau lượt.
  const cauHoiMau = (k: string, ac: string, loai?: string | null, quan?: string | null, deal?: string | null, diaChi?: string | null) => {
    const c = cauHoiMauTho(k, ac, loai, quan, deal, diaChi);
    return LOAI_DAT.has(loai ?? "") ? goiDat(c) : loai === "chung_cu" ? goiCanHo(c) : c;
  };
  const LOI_CHAO_DB = dienTen((P.loi_chao ?? LOI_CHAO).trim(), tenBot);
  const HUMAN = P.human_chat_rules ?? HUMAN_CHAT_RULES;
  const FEES = P.fee_rules ?? FEE_RULES;
  const SELLER_SCRIPT = P.seller_script_rules ?? SELLER_SCRIPT_RULES;
  const SLANG = P.slang_notes ?? SLANG_NOTES;
  // FR-180: mẫu chuẩn thật (nếu có) nối sau few-shot soạn tay, cả hai phía.
  const MAU_CHUAN_TD = "Ví dụ CHUẨN do anh/sếp sửa tay từ hội thoại thật (FR-180) - ưu tiên bắt chước giọng này hơn mọi ví dụ khác:";
  const FEWSHOT = (P.buyer_fewshot ?? BUYER_FEWSHOT) + (mauMua ? "\n\n" + MAU_CHUAN_TD + "\n" + mauMua : "");
  const AGREE = P.agree_rules ?? AGREE_RULES;
  // MỘT prefix cho cả ba lượt gọi phía người bán (FR-171 h). Bản cũ r1/r2 dùng
  // TONE+SELLER_SCRIPT còn r3 thêm FEES → hai ô nhớ tạm khác nhau cho một
  // nhánh vốn thưa lượt, gần như luôn trượt và mỗi lần trượt trả 1,25 giá.
  // 170 chữ-máy FEES thừa ở r1/r2 rẻ hơn hẳn một ô nhớ tạm riêng.
  // FR-178: few-shot người bán (giọng AI Ơi Nhà Đất + kịch bản sếp) đi cùng luật.
  const SELLER_FEW = dienTen(P.seller_fewshot ?? SELLER_FEWSHOT, TEN_GIU_CHO) + (mauBan ? "\n\n" + MAU_CHUAN_TD + "\n" + mauBan : "");
  const SELLER_SYSTEM = TONE + "\n\n" + SELLER_SCRIPT + "\n\n" + SELLER_FEW + "\n\n" + FEES + "\n\n" + AD_FORMAT + "\n\n" + FEE_VALUE_POINTS;

  // ─── FR-173 d: NGƯỜI NỘI BỘ (CTV/admin) nhắn "#mã tin: câu trả lời" ──────────
  // Câu khách hỏi đi về CTV (quyết định 03/09/2026); CTV hỏi chủ xong nhắn lại
  // bot theo mẫu này → ghi fact nguồn `ctv`/`admin`, đóng câu hỏi, trigger DB
  // `info_request_bao_lai_khach` báo lại khách. Chỉ tra `nguoi_noi_bo` khi tin
  // MỞ ĐẦU bằng mã tin, nên người mua hỏi "#BDS-… còn không em" chỉ tốn thêm
  // đúng một lượt RPC rồi rơi xuống nhánh mua như thường (FR-171 h).
  const noiBo = text.match(/^\s*#?\s*(BDS-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)\s*[:\-–]?\s*([\s\S]+)$/i);
  if (noiBo) {
    const { data: nb } = await client.rpc("nguoi_noi_bo", { p_zalo: externalUserId }).maybeSingle();
    const vai = (nb as { vai?: string; id?: string | null; name?: string | null } | null)?.vai ?? null;
    if (vai) {
      const maTin = noiBo[1].toUpperCase();
      const traLoi = noiBo[2].trim();
      const { data: lst } = await client.from("listings").select("id, seller_id")
        .or(`code.ilike.${maTin},legacy_code.ilike.${maTin}`).limit(1).maybeSingle();
      if (!lst) {
        const khong = `Em không thấy tin #${maTin} trong kho ạ, anh/chị xem lại mã giúp em.`;
        return await hoanTat({ reply: khong, replies: [khong], noi_bo: vai });
      }
      // FR-189 (chat Gemini 21/06 lượt 33, chủ dự án 10/09/2026): NGƯỜI THẬT CƯỚP
      // QUYỀN / TRẢ LẠI BOT bằng lệnh — "#mã giữ" → bot im với chủ căn đó tới khi
      // "#mã trả bot". Cột `conversations.human_hold`; nhãn ở /admin/tin-nhan.
      const lenhGiu = /^(giu|giữ|giu khach|giữ khách|cuop|cướp|takeover|take over)\s*$/i.test(traLoi);
      const lenhTra = /^(tra|trả|tra bot|trả bot|tha|thả|release|tra lai|trả lại)\s*$/i.test(traLoi);
      if ((lenhGiu || lenhTra) && lst.seller_id) {
        // Chủ căn chưa có hội thoại (mở hồ sơ bằng form admin) thì tạo trước rồi giữ.
        await client.rpc("ensure_seller_conversation", { p_seller_id: lst.seller_id, p_channel: channel });
        const { error: gErr } = await client.from("conversations")
          .update({ human_hold: lenhGiu, ...(lenhGiu ? { needs_human: false, human_touch_at: new Date().toISOString() } : {}) })
          .eq("seller_id", lst.seller_id);
        if (gErr) await ghiLoi(client, "chat-reply human_hold", gErr.message);
        const rep = lenhGiu
          ? `Em im với chủ căn #${maTin} rồi ạ, anh/chị nói chuyện trực tiếp nha. Xong thì nhắn "#${maTin} trả bot" để em tiếp tục.`
          : `Em tiếp tục chăm chủ căn #${maTin} rồi ạ.`;
        return await hoanTat({ reply: rep, replies: [rep], noi_bo: vai, human_hold: lenhGiu });
      }
      // Câu khách hỏi CŨ NHẤT đang chờ của căn này là câu được trả lời; không
      // có câu nào thì vẫn ghi làm fact bổ sung (CTV đi hỏi rồi, đừng bỏ).
      const { data: pend } = await client.from("info_requests").select("id, question")
        .eq("listing_id", lst.id).eq("status", "pending").eq("source", "buyer_ask")
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      const { error: fErr } = await ghiFact(client, {
        p_listing_id: lst.id, p_question: pend?.question ?? "bo_sung",
        p_answer: traLoi, p_source: vai,
      });
      if (fErr) await ghiLoi(client, "chat-reply ghi_fact_listing(noi_bo)", fErr.message);
      if (pend) {
        const { error: uErr } = await client.from("info_requests").update({
          status: "answered", answer: traLoi, answered_at: new Date().toISOString(),
        }).eq("id", pend.id);
        if (uErr) await ghiLoi(client, "chat-reply info_requests answered(noi_bo)", uErr.message);
      }
      const rep = pend
        ? `Em ghi nhận rồi ạ, em báo lại khách hỏi #${maTin} liền.`
        : `Em ghi vào tin #${maTin} rồi ạ, hiện không có câu khách nào đang chờ căn này.`;
      return await hoanTat({ reply: rep, replies: [rep], noi_bo: vai, answered: !!pend });
    }
  }

  // NGƯỜI BÁN nhắn? (FR-129 — hỏi nhỏ giọt): nếu khớp sellers.zalo_user_id và
  // đang có câu hỏi chờ, coi tin nhắn là CÂU TRẢ LỜI → lưu fact, hỏi câu kế.
  // Hồ sơ bán và cờ hỏi-vai bên mua đọc CÙNG LÚC (FR-171 h): hai truy vấn độc
  // lập, trước đây nối đuôi nhau; tốn thêm một câu nhẹ khi là người bán, đổi
  // lại mọi người mua bớt một vòng.
  type SellerRow = {
    id: string; name: string | null; active_listing_id: string | null;
    seller_type?: string | null;
    // SRS-5.1zzzzj (20261009c): nhãn trên từ đâu — suy_doan (bot gán lúc mở hồ sơ, FR-159) / tu_nhan / admin. Con số phí chỉ nói khi
    // không phải suy_doan (`vaiPhi`, prompts.ts).
    seller_type_source?: string | null;
    xung_ho?: XungHo | null; // FR-176: chủ nhà dặn gọi anh/chị/chú/cô/bác (16/09: thêm ba từ lớn tuổi)
    nhom_tuoi?: "tre" | "lon_tuoi" | null; // 22/09: "chào cháu" → lớn tuổi dù chưa biết chú hay cô
    ten_tro_ly?: string | null;      // FR-181: tên trợ lý riêng (CRM đọc cột này)
  };
  const [{ data: sellerDoc, error: sellerErr }, { data: bCu }] = await Promise.all([
    client.from("sellers").select("id, name, active_listing_id, seller_type, seller_type_source, xung_ho, nhom_tuoi, ten_tro_ly")
      .eq("zalo_user_id", externalUserId).maybeSingle(),
    client.from("buyers").select("preferences")
      .eq("zalo_user_id", externalUserId).maybeSingle(),
  ]);
  // Hàm deploy trước migration 20261009c (cột chưa có, 42703) thì đọc như cũ — không để mọi người bán thành người lạ.
  let sellerCu = sellerDoc;
  if (sellerErr) {
    await ghiLoi(client, "chat-reply doc sellers", sellerErr.message);
    const { data: lai } = await client.from("sellers").select("id, name, active_listing_id, seller_type, xung_ho, nhom_tuoi, ten_tro_ly")
      .eq("zalo_user_id", externalUserId).maybeSingle();
    sellerCu = lai as typeof sellerDoc;
  }
  let sellerRow = (sellerCu ?? null) as SellerRow | null;
  // Người này VỪA được mở hồ sơ bán trong lượt này (FR-159) — nhánh bán cần
  // biết để không chăm sóc như khách quen "đang rao các tin".
  let sellerMoi = false;
  // Nhãn VỪA gán trong lượt này (mở hồ sơ từ chat, hoặc hồ sơ tạo tay được gán)
  // — để nhánh bán báo cho chính người đó biết nhãn + mức phí (02/09).
  let nhanVuaGan: "ccrb" | "nmg" | null = null;

  // OPEN-22 / FR-157: một Zalo VỪA BÁN VỪA MUA. Nhận diện người vẫn theo
  // zalo_user_id (quyết định chủ dự án 27/08/2026), nhưng VAI thì xét từng
  // lượt: có dòng `sellers` không có nghĩa cả đời người này chỉ được bán.
  // Trước bản này, hễ khớp `sellers` là chốt vai bán cho MỌI tin — chính chủ
  // vừa rao xong muốn hỏi mua căn khác thì không có đường nào đi tới nhánh
  // buyer, bot cứ hỏi ngược lại về căn của họ.
  // Câu hỏi chờ KHÔNG mất khi rẽ sang nhánh mua: `info_requests` vẫn
  // `pending`, cron drip sẽ hỏi lại.
  // Cổng này quyết định NGƯỜI BÁN nhắn có được rẽ sang nhánh mua hay không, nên
  // trượt vì gõ lẫn dấu là nặng nhất trong ba chỗ: "toi muon mua nha q5, giá
  // tốt ko" có đúng hai chữ có dấu, bản trước dồn vào bộ có dấu, không khớp vế
  // nào, và người hỏi mua bị bot hỏi ngược về căn của chính họ.
  //
  // Soát 01/09 (vai người bán): bản cũ nhận "muốn/cần + nhà/căn" và "xem nhà"/
  // "coi nhà" TRẦN là hỏi mua, nên "có khách nào coi nhà chưa em?", "tôi muốn
  // nhà mình lên web sớm", "cần căn này bán nhanh", "em đang xem nhà tôi tới
  // đâu rồi" — toàn câu CHỦ NHÀ hỏi về căn của họ — bị đẩy sang nhánh mua, bot
  // mở hồ sơ mua cho họ rồi hỏi ngược "anh tìm khu nào ạ?". Đo được 5/7 câu
  // chủ nhà thường nói bị rẽ nhầm. Nay: động từ phải là mua/thuê/tìm/kiếm
  // (không nhận danh từ làm tân ngữ); "xem/coi nhà" chỉ khi CHÍNH HỌ xin/hẹn
  // xem; và câu đang nói về KHÁCH/AI xem-mua thì không phải mình muốn mua.
  // Cổng này chỉ có tác dụng với người ĐÃ có hồ sơ bán, nên mập mờ thì nghiêng
  // về vai bán là đúng chiều.
  const hoiMuaTho =
    (khop(
      /(muốn|cần|đang|định|đi)\s*(mua|thu[êe]|tìm|kiếm)\b/i,
      /(muon|can|dang|dinh|di)\s*(mua|thue|tim|kiem)\b/,
    ) ||
      khop(
        /\b(tìm|kiếm|mua)\s*(nhà|căn|đất|phòng|mặt bằng|chung cư|q\s*\d|quận|phường|khu|chỗ|gần)|(?<!cho\s)thu[êe]\s*(nhà|căn|phòng|mặt bằng)/i,
        /\b(tim|kiem|mua)\s*(nha|can|dat|phong|mat bang|chung cu|q\s*\d|quan|phuong|khu|cho|gan)|(?<!cho\s)thue\s*(nha|can|phong|mat bang)/,
      ) ||
      khop(
        /(có|còn)\s*căn nào|tư vấn (mua|thu[êe])/i,
        /(co|con)\s*can nao|tu van (mua|thue)/,
      ) ||
      // 14/09/2026 (bắn thật): "mua để cho thuê lại, khu nào quận 5 dòng tiền tốt",
      // "mua qua bên em có mất phí gì không" rơi về hỏi vai. "mua lại" KHÔNG nhận —
      // "anh mua lại căn này 3 năm trước, giờ bán" là chủ nhà kể chuyện.
      khop(
        /(?:^|[\s,.])mua\s+(để|qua|bên|về ở|trả góp)\b|\bkhi\s+mua\b|\bmua\s+nhà\s+bên\s+em\b/i,
        /(?:^|[\s,.])mua\s+(de|qua|ben|ve o|tra gop)\b|\bkhi\s+mua\b|\bmua\s+nha\s+ben\s+em\b/,
      ) ||
      khop(
        /(cho|xin|muốn|được|đi|qua|tới|hẹn|đặt lịch)\s*(em|anh|chị|tôi|mình)?\s*(xem|coi)\s*(nhà|căn)/i,
        /(cho|xin|muon|duoc|di|qua|toi|hen|dat lich)\s*(em|anh|chi|toi|minh)?\s*(xem|coi)\s*(nha|can)/,
      )) &&
    !khop(
      /(khách|ai|người)\s*(nào)?\s*(đã|có|tới|đến)?\s*(xem|coi|mua|thu[êe]|hỏi)/i,
      /(khach|ai|nguoi)\s*(nao)?\s*(da|co|toi|den)?\s*(xem|coi|mua|thue|hoi)/,
    ) &&
    // 09/09 tối lần 4: "sổ đỏ, đất thuê nhà nước tới 2058" khớp "thuê nhà" → tin
    // NGƯỜI BÁN bị đẩy sang nhánh mua, fact pháp lý mất. Đất thuê nhà nước / thuê
    // đất / cho thuê là lời người bán, không phải ý định đi thuê.
    !khop(
      /thu[êe]\s*(nhà nước|đất)|đất thu[êe]|tiền thu[êe] đất|đang cho thu[êe]|khách thu[êe]|người thu[êe]|thu[êe] tối thiểu|thu[êe] dài hạn/i,
      /thue\s*(nha nuoc|dat)|dat thue|tien thue dat|dang cho thue|khach thue|nguoi thue|thue toi thieu|thue dai han/,
    );

  // ─── CỔNG CÂU RAO MỚI (dùng ở khối `wantsSell` trong nhánh bán; tính SỚM vì
  // (1) bộ bắt-lời-sửa FR-164 phải biết "đây có phải câu rao mới không" — câu
  // rao cũng chứa "giá …", "phường …", không hỏi cổng này trước thì câu rao mới
  // bị hiểu thành lời sửa tin cũ; (2) FR-159 ngay dưới cần nó để nhận ra người
  // LẠ đang tự rao nhà — nên cổng đứng TRƯỚC cả nhánh bán).
  //
  // \b cuối cụm chặn "cho thuê": "ê" ngoài ASCII nên sau nó không bao giờ là
  // biên từ → MỌI câu rao CHO THUÊ từng rơi âm thầm, không tạo tin.
  // FR-158 — cổng KHÔNG còn bắt buộc có giá/diện tích: câu rao trần trụi
  // ("anh muốn bán căn nhà") từng trượt vế thứ ba và bay mất, trong khi cả
  // điểm của vòng drip là hỏi cho ĐỦ những thứ còn thiếu. Nới thì phải có thứ
  // khác gánh dương-tính-giả — thứ đó là THỨ TỰ TỪ: "nhà mình bán chưa em?"
  // có đủ "bán" lẫn "nhà" nhưng không có cặp "bán nhà"/"muốn bán".
  // FR-161: tin gõ LẪN dấu là chuyện thường — "ban nha q5 giá 5 ty" có đúng
  // MỘT chữ có dấu. Thử CẢ HAI bộ rồi lấy hợp (`khop`): bộ không dấu chạy trên
  // `tKD` nên phủ luôn câu gõ đủ dấu; phép hợp chỉ NỚI THÊM.
  const coChiTiet = khop(
    new RegExp(`[\\d][\\d.,]*\\s*(${TIEN_CD})|\\d+\\s*m2|hẻm|mặt tiền|phường`, "i"),
    new RegExp(`[\\d][\\d.,]*\\s*(${TIEN_KD})|\\d+\\s*m2|\\bhem\\b|mat tien|phuong`),
  );
  const coYDinhRao =
    khop(
      // 16/09/2026 (Zalo thật): "chú có căn nhà này cần GIAO bán" — chữ "giao/gửi/nhờ" chen
      // giữa làm luật cũ trượt, câu rao rơi vào câu đang hỏi của tin cũ.
      /(muốn|cần|đang|nhờ|ký gửi)\s+(?:giao\s+|gửi\s+|nhờ\s+)?(bán|cho thu[êe]|sang nhượng|nhượng lại|sang lại)|\b(giao|gửi|ký gửi)\s+bán\b/i,
      /(muon|can|dang|nho|ky gui)\s+(?:giao\s+|gui\s+|nho\s+)?(ban|cho thue|sang nhuong|nhuong lai|sang lai)\b|\b(giao|gui|ky gui)\s+ban\b/,
    ) ||
    khop(
      /(bán|rao|cho thu[êe]|sang nhượng|nhượng lại|sang lại)\s+(nhà|căn hộ|chung cư|đất|mặt bằng|phòng trọ|biệt thự|căn)/i,
      /(ban|rao|cho thue|sang nhuong|nhuong lai|sang lai)\s+(nha|can ho|chung cu|dat|mat bang|phong tro|biet thu|can)\b/,
    );
  // Chỉ chặn câu hỏi tình trạng khi câu KHÔNG kèm chi tiết thật nào.
  const laCauHoiTinhTrang = khop(
    /(chưa|sao r[oồ]i|th[eế] n[aà]o|ra sao|đư[ơợ]c không|đc ko|xong ch[uư]a)/i,
    /(chua|sao roi|the nao|ra sao|duoc khong|dc ko|xong chua)/,
  );
  // 09/09 tối (chạy kịch bản thật): "Cho thuê kho xưởng 1000m2 KCN Tân Tạo" và
  // "Em là môi giới, có căn nhà hẻm 100 Nguyễn Trãi, 40m2, 5 tỷ" đều KHÔNG tạo
  // tin — danh sách loại thiếu kho/xưởng/toà nhà, và câu môi giới giới thiệu
  // hàng không có chữ "bán". Nới: đủ loại trong enum; môi giới/sale "có căn" +
  // chi tiết; người bán quen nói "còn căn nữa" + chi tiết.
  const coLoaiBDS = khop(
    /(nhà|căn hộ|chung cư|đất|mặt bằng|phòng trọ|biệt thự|căn\b|kho|xưởng|toà|tòa|khách sạn|chdv|building|villa|shophouse|officetel|penthouse|lô\b)/i,
    /(nha|can ho|chung cu|dat|mat bang|phong tro|biet thu|\bcan\b|\bkho\b|xuong|\btoa\b|khach san|chdv|building|villa|shophouse|officetel|penthouse|\blo\b)/,
  );
  // Chỉ khi có DẤU HIỆU NGHỀ ("môi giới", "sale", "bên sàn", "bên em có hàng")
  // hoặc người bán quen nói "còn căn nữa" — "tôi có căn nhà ở phường 4" một
  // mình vẫn mập mờ (FR-159: người mua kể hoàn cảnh), giữ nguyên đường hỏi vai.
  const moiGioiCoHang = khop(
    /(môi giới|\bsale\b|bên sàn|sàn bđs|bên em có)[^.!?]{0,60}?(có|còn)?\s*(một |1 )?(căn|nhà|đất|lô|mặt bằng|chung cư|kho|xưởng|toà|tòa)/i,
    /(moi gioi|\bsale\b|ben san|san bds|ben em co)[^.!?]{0,60}?(co|con)?\s*(mot |1 )?(can|nha|dat|\blo\b|mat bang|chung cu|kho|xuong|\btoa\b)/,
  ) ||
    // "Còn căn nữa: 7 Hồng Bàng …" / "thêm căn …" — người bán quen rao căn thứ hai
    // (10/09: lần 4 kịch bản thật câu này bị hiểu là lời SỬA phường của căn cũ).
    khop(
      /^\s*(còn|thêm|có thêm)\s*(một |1 )?(căn|lô|nhà|miếng)\s*(nữa|khác|thứ \d)?\s*[:,.-]?/i,
      /^\s*(con|them|co them)\s*(mot |1 )?(can|lo|nha|mieng)\s*(nua|khac|thu \d)?\s*[:,.-]?/,
    );
  // 10/09 lần 6 (chân dung nhà đầu tư): "Anh đầu tư mua nhà cũ sửa lại bán, giờ có căn
  // hẻm 45 Trần Phú …, 4x14, 5 tỷ 9" — có hàng + có GIÁ/M² là câu rao, dù không có
  // chữ "bán" đứng trước loại và dù có chữ "mua" (kể chuyện) trong câu.
  // 11/09/2026 (42 ca): "có căn nào q5 tầm 5 tỷ không em" là NGƯỜI MUA hỏi kho —
  // bản trước mở thành tin rao (loại chưa rõ, 5 tầng). "căn nào", dấu hỏi, lời
  // ngân sách ("tầm/khoảng/dưới … tỷ"), "… không em?" cuối câu, "cần nhà …" là
  // dấu hiệu MUA. Chỉ chặn các cổng NỚI (không cần chữ "bán"), không đụng cổng gốc.
  // 30/09/2026 (bắn thật lx-mua-e): khách MUA nới ngân sách "vậy có căn 6 tỷ rưỡi cũng được" — "có căn" + giá
  // lọt `coHangCoGia` → mở hồ sơ bán, tạo tin "BĐS bán" rồi hỏi "nhà mình là nhà phố hay chung cư". "… cũng được"
  // là lời CHẤP NHẬN của người mua, người rao không nói vậy về căn của mình.
  const coDauHieuMua = /\?/.test(text) || khop(
    /\b(tìm|cần mua|muốn mua|đang mua|hỏi mua|cần thuê|muốn thuê|ngân sách)\b|\b(căn|nhà|lô|đất|phòng)\s+nào\b|\b(tầm|khoảng|dưới)\s+\d|\bkhông\s+(em|ạ|anh|chị|bạn)\s*$|^\s*cần\s+(một\s+|1\s+)?(nhà|căn|lô|đất|phòng|mặt bằng)\b|\bcũng\s+(được|đc|ok|oke|chịu)\b/i,
    /\b(tim|can mua|muon mua|dang mua|hoi mua|can thue|muon thue|ngan sach)\b|\b(can|nha|lo|dat|phong)\s+nao\b|\b(tam|khoang|duoi)\s+\d|\b(khong|ko|k)\s+(em|a|anh|chi|ban)\s*$|^\s*can\s+(mot\s+|1\s+)?(nha|can|lo|dat|phong|mat bang)\b|\bcung\s+(duoc|dc|ok|oke|chiu)\b/,
  );
  // Người đang có hồ sơ MUA (chưa có hồ sơ bán) nói "có căn … tỷ" là đang bàn căn trong kho, không phải rao:
  // cổng NỚI `coHangCoGia` (không cần chữ "bán") không mở hồ sơ bán cho họ. Muốn rao thì có chữ "bán"/"rao"
  // (cổng gốc) hoặc model phân vai — đoán nhầm người mua thành người bán là chiều sai đắt (FR-159).
  const dangLaNguoiMua = !sellerRow && BUYER_PROFILE_FIELDS.some(([k]) => {
    const v = (bCu?.preferences as Record<string, unknown> | null)?.[k];
    return v != null && v !== "";
  });
  // "anh có 2 căn: …" là rao nhiều căn — cho phép con số đứng trước "căn".
  const coHangCoGia = khop(
    /\b(có|còn|đang có)\s*(một |1 |\d{1,2} )?(căn|nhà|lô|miếng|mảnh)\b(?!\s+nào)/i,
    /\b(co|con|dang co)\s*(mot |1 |\d{1,2} )?(can|nha|lo|mieng|manh)\b(?!\s+nao)/,
  ) && khop(/\d\s*(tỷ|tỉ|tỏi|triệu|tr)\b|\d+\s*m2/i, /\d\s*(ty|ti|toi|trieu|tr)\b|\d+\s*m2/) && !coDauHieuMua && !dangLaNguoiMua;
  // 11/09/2026 (42 ca): câu rao THẬT không có chữ "bán" rơi về lời chào khuôn
  // "đang muốn mua, thuê hay bán": "Nhà mặt tiền Hùng Vương Q5, DT 5x20, 5 tầng,
  // giá 32 tỏi", "Nhà cấp 4 Bình Chánh 5x25 thổ cư 100% 1ty9", "căn hộ Hà Đô
  // Centrosa quận 10 1PN+1 giá 4,1 tỷ bao sang tên", câu kể dài "… hẻm 5m, 4x15,
  // quận 5, giá 10 tỷ". Người rao LIỆT KÊ hàng; người mua HỎI. Nên: loại BĐS + giá
  // + chi tiết của CĂN (≥ 3, hoặc ≥ 2 khi có chữ "giá") + không dấu hiệu mua.
  const coGiaRo = khop(
    new RegExp(`[\\d][\\d.,]*\\s*(?:${TIEN_CD})(?![a-zA-ZÀ-ỹ])|${TIEN_T_KEP}`, "i"),
    new RegExp(`[\\d][\\d.,]*\\s*(?:${TIEN_KD})(?![a-z])|${TIEN_T_KEP}`),
  );
  const soChiTietCan = [
    /\d+(?:[.,]\d+)?\s*m2|\d+(?:[.,]\d+)?\s*x\s*\d+/.test(tKD),
    !!bocQuan(tKD, text) || !!vungNgoai(tKD),
    /\b(?:phuong|p)\.?\s*\d{1,2}\b/.test(tKD),
    /\bhem\b|\bhxh\b|mat tien/.test(tKD),
    /\d\s*(?:lau|tang|tam)\b|\btret\b/.test(tKD),
    /\d\s*(?:pn|phong ngu)\b/.test(tKD),
    /\btho cu\b|\bso hong\b|\bso rieng\b|\bshr\b|\bhdmb\b|\bsang ten\b/.test(tKD),
  ].filter(Boolean).length;
  const coChuGia = /\bgia\s*:?\s*\d/.test(tKD);
  const raoKhongChuBan = coLoaiBDS && coGiaRo && !coDauHieuMua && !dangLaNguoiMua &&
    (soChiTietCan >= 3 || (coChuGia && soChiTietCan >= 2));
  // 15/09/2026 (bắn thật D1): "chào BẠN mình tìm nhà cho ba mẹ… tầm 5 tỷ" — bỏ dấu
  // thành "chao ban" và \bban\b khớp → người MUA bị mở hồ sơ bán + tạo tin rao.
  // Chữ CÓ DẤU mà không phải "bán"/"rao" (bạn, bàn, bản, bận, rào…) thì che trước
  // khi bỏ dấu; câu gõ không dấu thì "ban" vẫn mập mờ như cũ, không siết thêm.
  // 23/09/2026 (bắn thật, căn hộ): "ban công hướng Đông nha em" — "ban" KHÔNG DẤU của "ban công/ban ngày/ban quản lý"
  // thành "bán" → cùng chữ "nha" (hạt câu) thành "nhà" → mở nhầm một tin nhà phố mới. Che các cụm đó trước khi dò.
  const tKDBan = boDau(text.replace(/\b(bạn|bàn|bản|bận|bẩn|bắn|rào|rảo|rão)\b/gi, "_"))
    .replace(/\bban (?:cong|ngay|dem|dau|quan ly|qlda|giam doc|to chuc|dieu hanh)\b/g, "_");
  const coChuBan = /\b(bán|rao)\b|cho thu[êe]|sang nhượng|nhượng lại|sang lại/i.test(text) ||
    /\b(ban|rao)\b|cho thue|sang nhuong|nhuong lai|sang lai/.test(tKDBan);
  // 22/09/2026 (bộ đo giọng M04): "căn 12 Trần Hưng Đạo phường 4 còn bán không" — khách MUA hỏi
  // tình trạng một căn. Có "phường" nên `coChiTiet`, có "bán" + "căn" → mở hồ sơ bán rồi hỏi "nhà
  // mình là nhà phố hay chung cư" (lạc vai). Hỏi còn bán / bán chưa / còn không mà KHÔNG kèm giá
  // là câu HỎI, không phải câu rao — chặn ở cả nhánh có chi tiết.
  const hoiConBan = !coGiaRo && khop(
    /\b(?:còn|đã|hết)\s+bán\s+(?:không|ko|k|chưa|chua)\b|\bbán\s+chưa\b|\bcòn\s+(?:không|ko|k)\s*(?:em|ạ|anh|chị|bạn)?\s*\??\s*$/i,
    /\b(?:con|da|het)\s+ban\s+(?:khong|ko|k|chua)\b|\bban\s+chua\b|\bcon\s+(?:khong|ko|k)\s*(?:em|a|anh|chi|ban)?\s*\??\s*$/,
  );
  // 30/09/2026 (chat thử): người lạ được hỏi vai, đáp "hẻm 3m, 3x15, 2 lầu, bán 6 tỷ thương lượng" — có "bán", có giá, có
  // ba chi tiết của CĂN mà thiếu chữ loại ("nhà / căn") nên không cổng nào nhận → thành KHÁCH MUA ngân sách 6 tỷ. Chữ
  // "bán" + giá + ≥ 2 chi tiết căn + không dấu hiệu mua là câu rao, không cần chữ loại.
  const raoKhongChuLoai = coChuBan && coGiaRo && !coDauHieuMua && !hoiConBan && soChiTietCan >= 2;
  const wantsSellLuat =
    (coChuBan && coLoaiBDS && !hoiConBan &&
      (coChiTiet || (coYDinhRao && !laCauHoiTinhTrang))) ||
    (moiGioiCoHang && coChiTiet && !khop(/\b(tìm|cần mua|muốn mua|thuê)\b/i, /\b(tim|can mua|muon mua)\b/)) ||
    coHangCoGia || raoKhongChuBan || raoKhongChuLoai;
  // ─── FR-205 (11/09/2026): LUẬT KHÔNG KẾT LUẬN ĐƯỢC THÌ HỎI MODEL ─────────────
  // Chủ dự án: "có thể dùng AI vào các chỗ quá cứng trong code không" → "gật".
  // Luật trên chỉ bắt KIỂU câu đã gặp: lượt bắn 42 câu có 6 câu rao không chữ
  // "bán" rơi về câu chào khuôn; PR #104 vá luật cho đúng 6 câu đó, câu thứ bảy
  // nói khác đi ("gia đình cần tiền nên để lại căn…") lại rơi. Nên: luật KHÔNG ra
  // bán cũng không ra mua + người lạ + câu có mùi nhà đất → một lượt model trả
  // `ban | mua | chua_ro` kèm cụm chữ làm bằng; `donVai` đòi cụm đó có nguyên
  // trong câu, bịa cớ thì coi như chưa rõ. Model hỏng / chưa rõ → hỏi vai như cũ.
  // Model chỉ CHỌN ĐƯỜNG; giá / diện tích / quận vẫn do luật tiền định bóc.
  // Cờ `hoi_vai` đọc TRƯỚC lượt model phân vai (SRS-5.1zzze): tin trả lời câu hỏi vai thì model đọc kèm câu đó.
  let dangTraLoiHoiVai: false | true | "nmg" = false;
  if (!sellerRow) {
    const hv = (bCu?.preferences as Record<string, unknown> | null)?.hoi_vai;
    dangTraLoiHoiVai = hv === "nmg" ? "nmg" : !!hv;
  }
  // Câu hỏi vai đúng như bot đã gửi (lời chào bản DB đè code; hỏi lại "Dạ, anh cần rao bán…" cũng cùng câu hỏi này).
  const CAU_HOI_VAI = (LOI_CHAO_DB.match(/[^.!?\n]*\?/g)?.pop() ?? "Anh/chị cần rao bán bất động sản đúng không ạ?").trim();
  // Luật ĐÁP câu hỏi vai — chỉ xét khi đang trả lời câu đó. Luật ra thì không tốn lượt model; không ra thì model đọc.
  const vaiDapLuat = !!dangTraLoiHoiVai && (
    // "tôi có căn nhà…" / "có nhà" (đầu câu, không cần đại từ)
    khop(
      /(?:^|(?:tôi|em|mình|anh|chị|tui|bên mình|nhà mình|gia đình)\s*)(đang\s*)?có\s*(một\s*|1\s*)?(căn|nhà|đất|bất động sản|bđs|mặt bằng|chung cư|phòng trọ|biệt thự|lô)(?!\s*nào)/i,
      /(?:^|(?:toi|em|minh|anh|chi|tui|ben minh|nha minh|gia dinh)\s*)(dang\s*)?co\s*(mot\s*|1\s*)?(can|nha|dat|bat dong san|bds|mat bang|chung cu|phong tro|biet thu|lo)(?!\s*nao)/,
    ) ||
    // 27/09/2026 (câu chào mới "anh chị cần rao bán bất động sản đúng không ạ?"): GẬT trơn — "đúng rồi", "dạ",
    // "ừ", "vâng em" — là người bán. Chỉ nhận khi CẢ câu là lời gật + tiểu từ ("đúng rồi, anh muốn mua" không phải).
    laGatHoiVai(text) ||
    // Trả lời cụt: "bán", "muốn bán", "tôi bán", "bên bán", "cho thuê" — đang
    // trả lời "mua hay bán?" thì một chữ là đủ (tự kiểm 02/09: bản cũ đòi cả
    // câu rao nên "bán" trơ bị xếp vào hàng mua).
    khop(
      /^\s*(tôi|em|mình|anh|chị)?\s*(muốn|cần|bên|là bên)?\s*(bán|cho thu[êe]|rao)\b/i,
      /^\s*(toi|em|minh|anh|chi)?\s*(muon|can|ben|la ben)?\s*(ban|cho thue|rao)\b/,
    )
  );
  let vaiModel: VaiModel | null = null;
  const hoSoMuaSom = (bCu?.preferences ?? null) as Record<string, unknown> | null;
  const daCoHoSoMuaSom = BUYER_PROFILE_FIELDS.some(([k]) => hoSoMuaSom?.[k] != null && hoSoMuaSom?.[k] !== "");
  const nhacMaSom = new RegExp(CODE_RE.source).test(textOrTag);
  // SRS-5.1zzzzzzz18 (chủ dự án 14/10: "xoá hết mấy cái code đi đọc bằng ai hết luôn"). Lớp lỗi: VAI người lạ (rao bán / hỏi mua /
  // gật câu hỏi vai) đoán bằng từ khoá — luật đã kết luận thì model không bao giờ được hỏi, nên "chào bạn mình tìm nhà" ("ban"),
  // "ban công hướng Đông", "tôi tìm nhà chính chủ" ("chính chủ") đều từng mở nhầm hồ sơ bán, và mỗi lần vá là thêm một từ vào regex.
  // Chế độ `boc_tach_ai = ai`: người lạ có câu luật ĐÃ kết luận (bán / mua / đáp vai) cũng qua lượt model phân vai, và model trả
  // được (`donVai` khác null, cụm làm bằng có nguyên trong tin) thì MODEL quyết — luật chỉ đỡ khi model hỏng.
  const coTheAiVai = !sellerRow && !imageUrl && !nhacMaSom && !VOICE_RE_KD.test(tKD) &&
    (wantsSellLuat || (hoiMuaTho && !daCoHoSoMuaSom) || (!!dangTraLoiHoiVai && vaiDapLuat));
  let cheDoAiVai = false;
  if (coTheAiVai) {
    const { data: cd, error: cdErr } = await client.rpc("cau_hinh", { p_key: "boc_tach_ai" });
    if (cdErr) await ghiLoi(client, "chat-reply cau_hinh(boc_tach_ai) vai", cdErr.message);
    cheDoAiVai = String(cd ?? "tat").trim() === "ai";
  }
  if (cheDoAiVai || nenHoiModelVai({
    coHoSoBan: !!sellerRow,
    raoTheoLuat: wantsSellLuat,
    muaTheoLuat: hoiMuaTho,
    daCoHoSoMua: daCoHoSoMuaSom,
    coAnh: !!imageUrl,
    nhacMaCan: nhacMaSom,
    doiGoi: VOICE_RE_KD.test(tKD),
    text,
    traLoiCauVai: !!dangTraLoiHoiVai,
    dapVaiTheoLuat: vaiDapLuat,
  })) {
    try {
      const ai = await napModel(client);
      const r = await phanVaiBangModel(ai as unknown as Parameters<typeof phanVaiBangModel>[0], MODEL, text,
        dangTraLoiHoiVai ? CAU_HOI_VAI : null);
      if (r) {
        await doTien(client, r.usage as Parameters<typeof doTien>[1]);
        vaiModel = donVai(r.ket, text, dangTraLoiHoiVai ? 2 : 4);
      }
    } catch (e) {
      await ghiLoi(client, "chat-reply phan vai (model)", e);
    }
  }
  // Model đã quyết vai ở chế độ ai → mọi kết luận vai bằng từ khoá bên dưới (rao / mua / đáp vai / "chính chủ") không tính.
  const vaiAiQuyet = cheDoAiVai && vaiModel !== null;
  if (vaiAiQuyet) console.log("chat-reply: AI phan vai nguoi la", vaiModel);
  // SRS-5.1zzzzze (khách mô phỏng lần bảy: chủ nhà đã rao hỏi "phí 1% đó lấy từ chị hay từ bên mua nhà vậy?" → luật `hoiMuaTho` thấy
  // "mua nhà", rẽ người bán sang nhánh MUA, ghi hồ sơ mua "mua hay thuê: mua"). Lớp lỗi: đoán Ý đổi vai bằng từ khoá. Người ĐÃ có hồ sơ
  // bán mà luật thấy chữ mua / thuê / tìm → AI phân vai quyết (đọc theo nghĩa, có trích dẫn); luật chỉ đỡ khi model hỏng.
  let muaTuLuat = hoiMuaTho;
  if (sellerRow && hoiMuaTho && !wantsSellLuat && !imageUrl) {
    try {
      const ai = await napModel(client);
      const r = await phanVaiBangModel(ai as unknown as Parameters<typeof phanVaiBangModel>[0], MODEL, text, null, true);
      if (r) {
        await doTien(client, r.usage as Parameters<typeof doTien>[1]);
        const v = donVai(r.ket, text);
        if (v) { muaTuLuat = v === "mua"; console.log("chat-reply: nguoi ban + chu mua, AI phan vai", v); }
      }
    } catch (e) {
      await ghiLoi(client, "chat-reply phan vai nguoi ban (model)", e);
    }
  }
  // Model gật vai cho một câu KHÔNG tả căn ("đúng rồi e") chỉ mở hồ sơ bán (`gatVaiAi`), không coi câu đó là câu rao.
  const gatVaiAi = !!dangTraLoiHoiVai && vaiModel === "ban";
  // `let`: SRS-5.1zzzg — người bán ĐÃ CÓ tin mở thì "câu rao căn mới" do AI quyết (`can_khac`), sửa lại sau khi lượt AI chạy.
  let wantsSell = (!vaiAiQuyet && wantsSellLuat) || (vaiModel === "ban" && (!dangTraLoiHoiVai || coMuiBDS(text)));
  // Câu rao thì KHÔNG phải ý định mua, dù có chữ "mua" kể chuyện ("mua nhà cũ sửa lại bán").
  const hoiMua = ((!vaiAiQuyet && muaTuLuat) || vaiModel === "mua") && !wantsSell;
  // Phường trong câu rao, bắt trên bản bỏ dấu — chỉ lấy CON SỐ nên bỏ dấu
  // không mất gì. Tự kiểm 02/09 (bơm câu rao qua handler thật): "bán nhà P4
  // giá 5 tỷ 8 50m2" tạo tin với phường RỖNG — bản cũ chỉ hiểu "phường 4",
  // trong khi "P4"/"p.4" là cách gõ nhiều nhất, và nhánh MUA hiểu từ lâu.
  // Dùng chung cho tạo tin lẫn cho phép so "căn khác phường" ở nhánh bán.
  const wardNo = soPhuong(tKD);

  // ─── FR-159 (nửa 1/2): người CHƯA có hồ sơ bán mà TỰ NHẬN có bất động sản →
  // mở hồ sơ bán NGAY lượt này rồi đi tiếp vào nhánh bán như người bán quen.
  // Trước bản này cổng câu rao nằm bên trong `if (sellerRow …)`, mà dòng
  // `sellers` chỉ được tạo bằng form admin — nên NGƯỜI LẠ nhắn "tôi muốn bán
  // nhà q5 giá 5 tỷ" rơi thẳng xuống nhánh MUA: bot bóc "khu vực q5, ngân sách
  // 5 tỷ" thành hồ sơ NGƯỜI MUA rồi hỏi "anh tìm khu nào ạ?". Câu rao mất.
  //
  // Ranh giới giữ đúng chữ FR-158/159, và CHIỀU của sai số: FR-159 nói rõ đoán
  // nhầm NGƯỜI MUA thành người bán là lỗi đắt ("nhà mình ở đâu ạ?" với một
  // người đang đi tìm nhà), còn chiều ngược lại chỉ tốn một câu hỏi thừa. Nên
  // chỉ mở hồ sơ bán ở hai mức:
  //   * TỰ NHẬN RÕ, ở bất kỳ tin nào: câu rao thật (wantsSell), "chính chủ",
  //     "ký gửi", "cần rao", "đăng bán" — người mua không nói mấy chữ này.
  //   * "tôi có căn nhà / nhà mình có…" — CHỈ khi đang trả lời câu hỏi vai
  //     (cờ `hoi_vai`). Đứng một mình thì mập mờ: "tôi có căn nhà ở Q10, giờ
  //     tìm Q5" là người mua kể hoàn cảnh, mở hồ sơ bán cho họ là sai chiều đắt.
  // KHÔNG mở vì một chữ "bán" lẻ hay từ câu chào — câu chào đi hỏi vai ở nửa
  // 2/2 dưới nhánh mua. `(?!\s*nào)` chặn "anh có nhà nào 2PN không em" (khách
  // hỏi kho), `!hoiMua` chặn "tôi có nhà rồi, giờ muốn mua thêm".
  // Đọc cờ `hoi_vai` trước khi có dòng buyer (nhánh mua mới nạp): một truy vấn
  // nhỏ, chỉ với người chưa có hồ sơ bán.
  // Cờ giữ NGUYÊN giá trị: `true` = đã hỏi; `"nmg"` = đã hỏi VÀ tin đầu của
  // người này có dấu hiệu môi giới ("em là sale bên sàn…") — để lượt trả lời
  // "có căn cần bán" vẫn nhận đúng nhãn, không rơi về chính chủ vì câu trả lời
  // không nhắc lại chữ "môi giới" (tự kiểm 02/09).
  const tuNhanCoBDS = wantsSell || gatVaiAi || (!vaiAiQuyet && (
    khop(
      /chính chủ|ký gửi|cần rao|muốn rao|đăng tin bán|đăng bán/i,
      /chinh chu|ky gui|can rao|muon rao|dang tin ban|dang ban/,
    ) ||
    vaiDapLuat));
  // SRS-5.1zzzf: tin này chỉ là câu TRẢ LỜI câu hỏi vai (không tả căn) → bong bóng 🤖 nói đã hiểu gì, kèm câu bot đã hỏi.
  const cauVaiDaHoi = boGachCheo(CAU_HOI_VAI);
  const hieuTraLoiVai = dangTraLoiHoiVai && !wantsSell && ((!vaiAiQuyet && vaiDapLuat) || gatVaiAi) ? "cần rao bán, em mở hồ sơ người bán" : null;
  // ─── NHÃN chính chủ / môi giới — gán NGAY lúc bóc tách (quyết định chủ dự
  // án 02/09/2026: "gán nhãn khi bóc tách là họ có BĐS muốn bán"). Ai nói mình
  // CÓ bất động sản muốn bán là CHÍNH CHỦ; chỉ khi tự xưng môi giới mới là NMG
  // — môi giới không "có" nhà, họ bán nhà người khác, và họ hay tự xưng ("em
  // là sale", "bán giúp chủ", "hàng ký gửi"). Không đoán từ hành vi (số tin) ở
  // đây — đó là FR-160/OPEN-28. Nhãn quyết định mức phí (BR-05) nên phải có
  // ngay khi hồ sơ mở: hồ sơ không nhãn là deal không phí (FR-170 f).
  // Cố ý KHÔNG dùng "bên em có…": với người bán, "em" là bot ("bên em có khách
  // chưa?"), bắt cụm đó là dán nhãn môi giới lên chính chủ.
  const tinHieuMoiGioi = khop(
    /môi giới|\bsale\b|sàn (giao dịch|bđs|bất động sản)|nhân viên kinh doanh|chuyên viên (bđs|bất động sản|kinh doanh)|bán (giúp|hộ|giùm|dùm)|chủ nhà (gửi|nhờ)|khách gửi bán|hàng ký gửi/i,
    /moi gioi|\bsale\b|san (giao dich|bds|bat dong san)|nhan vien kinh doanh|chuyen vien (bds|bat dong san|kinh doanh)|ban (giup|ho|gium|dum)|chu nha (gui|nho)|khach gui ban|hang ky gui/,
  );
  const nhanNguoiBan: "ccrb" | "nmg" =
    tinHieuMoiGioi || dangTraLoiHoiVai === "nmg" ? "nmg" : "ccrb";
  const canMoHoSo = !sellerRow && tuNhanCoBDS && !hoiMua;
  // Hồ sơ đã có nhưng chưa nhãn (tạo tay mà không ghi loại) → gán khi họ tự
  // nhận hoặc tự xưng. Hàm DB chỉ nâng `unknown`, không ghi đè nhãn đã có.
  const canGanNhan = !!sellerRow && sellerRow.seller_type === "unknown" && !hoiMua &&
    (tuNhanCoBDS || tinHieuMoiGioi);
  if (canMoHoSo || canGanNhan) {
    const { data: moi, error: moiErr } = await client
      .rpc("mo_ho_so_nguoi_ban", {
        p_zalo_user_id: externalUserId, p_seller_type: nhanNguoiBan,
      }).maybeSingle();
    if (moiErr || !moi) {
      // Mở hụt thì đi tiếp như cũ — tệ hơn nhưng không câm; và vào sổ.
      await ghiLoi(client, "chat-reply mo_ho_so_nguoi_ban",
        moiErr?.message ?? "không trả về dòng");
    } else {
      sellerMoi = !sellerRow;
      sellerRow = moi as SellerRow;
      nhanVuaGan = sellerRow.seller_type === "nmg" ? "nmg" : "ccrb";
      // 18/09/2026 (chủ dự án: "xóa cái thông báo cho admin đi"): bỏ tin 🆕 "Hồ sơ người bán MỞ TỪ
      // CHAT…" từng đẩy vào hàng escalation (quyết định 02/09). Hồ sơ mới vẫn thấy ở /admin và 💾
      // của chính khách (dòng 👤 Hồ sơ); chữ "Bot đã báo họ nhãn và mức phí" cũng đã sai từ 09/09.
    }
  }

  // 30/09/2026 (chủ dự án: "nhiều quy tắc quá … cái nào cần thì để lại cho AI nó làm"): công tắc `app_config.luat_loi_bot`.
  // 06/10/2026 (SRS-5.1zzn, chủ dự án "làm bước 1 và 2"): đưa lên tầng handler để NHÁNH MUA cũng đọc được, và `gon` (mặc định,
  // không có dòng cũng là gọn) nay TẮT TOÀN BỘ van SỬA VĂN — xưng hô / gạch chéo / gạch dài / "mình" / câu ghi nhận trùng /
  // câu lặp / khen / chào lại / hỏi mục đích / "hệ thống" — vì prompt đã dặn, model tự lo; chỉ còn lưới AN TOÀN (bịa số, giá,
  // vị trí, tên, lời hứa, nhận là người, che liên hệ) và lưới GHI ĐÚNG Ô (một câu hỏi, câu lệch khoá, hỏi lại ô đã có, hoàn
  // công, gấp theo deal). `du` bật lại hết ở Table Editor, không cần deploy. Van nào kích đều vào sổ `van_kich` để đo.
  let luatLoiBotP: Promise<boolean> | null = null;
  const loiBotDu = () => (luatLoiBotP ??= (async () => {
    const { data, error } = await client.rpc("cau_hinh", { p_key: "luat_loi_bot" });
    if (error) await ghiLoi(client, "chat-reply cau_hinh(luat_loi_bot)", error.message);
    return String(data ?? "gon").trim() === "du";
  })().catch(() => false));
  // SRS-5.1zzn: SỔ VAN — ghi lại van nào ĐỔI lời model trong lượt này (trước / sau), chèn `van_kich` MỘT câu ở cuối lượt.
  const soVan = moSoVan(sellerRow && !hoiMua ? "ban" : "mua");

  if (sellerRow && !hoiMua) {
    // OPEN-30 → đóng: model là NGƯỜI SOẠN CÂU CHỮ, không phải điều kiện sống
    // của nhánh. Key hỏng/hết credit thì mọi lệnh gọi bên dưới rơi về câu mẫu
    // tất định — chủ nhà không bao giờ nhận im lặng + 500 như trước, và lỗi
    // vào sổ qua ghiLoi (FR-152) thay vì xuyên thẳng ra ngoài không dấu vết.
    // Nhánh mua đã làm đúng bài này từ đầu; đây là đưa nhánh bán về cùng chuẩn.
    let anthropicS: ModelClient | null = null;
    try {
      anthropicS = await napModel(client);
    } catch (e) {
      await ghiLoi(client, "chat-reply anthropic(seller)", e);
    }

    // FR-141/FR-152 — hội thoại NGƯỜI BÁN cũng phải vào sổ.
    // Trước bản này nhánh seller trả lời rồi `return` thẳng, không ghi dòng nào
    // vào `messages`: CTV mở hội thoại chủ nhà thấy trống trơn, không có gì để
    // bàn giao khi người thật tiếp quản. `conversations.seller_id` vốn đã có
    // sẵn kèm khoá ngoại — chỉ là chưa đường code nào ghi vào.
    // Hàm get-or-create ở migration 20260827i_hoi_thoai_nguoi_ban.sql, có
    // advisory lock như bên mua (chủ nhà gõ vụn 3 tin là 3 lượt gọi đồng thời).
    const { data: convS, error: convSErr } = await client
      .rpc("ensure_seller_conversation", {
        p_seller_id: sellerRow.id,
        p_channel: channel,
      }).single();
    const convSRow = convS as
      { c_id?: string; c_human_touch_at?: string | null; c_human_hold?: boolean | null } | null;
    const convSId = convSRow?.c_id ?? null;
    // Hàm thiếu / mất quyền / DB nghẽn mà đi tiếp thì bot vẫn trả lời trong khi
    // KHÔNG ghi được dòng nào: dedup 23505 tắt (Zalo gửi lại là bóc fact hai
    // lần, câu rao gửi lại là đẻ thêm một tin rao trùng), cổng nhường sân tắt, mà
    // HTTP vẫn 200 nên bot_health_tick không thấy gì. Nhánh mua ở đây trả 500 —
    // nhánh bán phải cùng ngữ nghĩa (FR-152).
    if (convSErr || !convSId) {
      const detail = convSErr?.message ?? "không trả về c_id";
      await ghiLoi(client, "chat-reply ensure_seller_conversation", detail);
      return await baoHong({ error: detail }, 500, detail);
    }

    // Ghi tin CHỦ NHÀ trước khi gọi model: model lỗi giữa chừng thì vẫn còn dấu
    // vết chủ nhà đã nhắn gì. Trùng `zalo_msg_id` (23505) = kênh gửi lại tin cũ
    // → đã trả lời rồi, đừng trả lời lần hai. Cùng ngữ nghĩa với nhánh mua.
    const { data: msgSRow, error: msgSErr } = await client.from("messages").insert({
      conversation_id: convSId,
      sender: "seller",
      body: imageUrl ? `${textOrTag} [ảnh: ${imageUrl}]` : fileUrl ? `${textOrTag} [file: ${fileName ?? fileUrl.slice(0, 80)}]` : linkUrl ? `${textOrTag} [link: ${linkUrl.slice(0, 120)}]` : text,
      zalo_msg_id: msgId,
    }).select("created_at, seq").maybeSingle();
    /** Giờ DB của tin chủ nhà vừa ghi — gộp album ảnh so "có tin nào mới hơn không" theo đồng hồ DB, không theo máy chạy hàm. */
    const lucTinChu = (msgSRow as { created_at?: string } | null)?.created_at ?? null;
    /** SRS-5.1zzzzzzg: giờ DB của tin ĐẦU CỤM (chuỗi tin chủ nhà liền trước, chưa có lời bot chen) — mốc của bong bóng 🤖; null = không có cụm. */
    let lucDauCum: string | null = null;
    /** SRS-5.1zzzzzzg: `seq` các tin trước đã GỘP vào `text` lượt này — bỏ khỏi lịch sử đưa model (chúng nằm trong tin vừa nhắn). */
    const seqGop = new Set<number>();
    /** Tin chủ nhà vừa nhắn, NGUYÊN BẢN đơn (trước gộp cụm) — đúng dòng đã ghi `messages`. */
    const textTinNay = text;
    /**
     * SRS-5.1zzzzzzp (Zalo thật 14/10 09:59, tin Trần Bình Trọng): khách nhắn ba tin liền ("hẻm xe hơi 5m" / "hướng Đông Nam" / "đang để
     * trống"); lượt của tin giữa MỞ câu chờ `hien_trang_su_dung` rồi nhường lượt trước khi gửi — câu hỏi không bao giờ tới khách, lượt sau
     * đã ghi "đang để trống", vậy mà câu chờ còn `pending` mãi: hỏi bù (drip một-câu-một-lúc) bị chặn vĩnh viễn, tin kế của khách dễ bị đọc
     * làm câu trả lời cho câu không ai hỏi. MỌI câu chờ lượt này mở đi qua đây; nhường lượt trước khi gửi thì rút đúng những câu này
     * (thay khối chỉ rút `duyet_tin` của SRS-5.1zzzzzzb). Index `info_requests_mot_cau_cho_idx` (một câu pending mỗi tin + câu) bảo đảm
     * câu pending cùng khoá tạo sau mốc tin chủ nhà là câu của chính lượt này.
     */
    const cauMoLuot: Array<{ listing_id: string; question: string }> = [];
    const moCauTreo = async (row: Record<string, unknown>): Promise<{ error: { code?: string; message: string } | null }> => {
      const { error } = await client.from("info_requests").insert(row);
      if (!error && typeof row.listing_id === "string" && typeof row.question === "string") cauMoLuot.push({ listing_id: row.listing_id, question: row.question });
      return { error };
    };
    /**
     * Nhường lượt: rút mọi câu chờ lượt này mở (xem `cauMoLuot`). Trả `true` nếu có rút câu duyệt bản nháp.
     * SRS-5.1zzzzzzy (người test thật 14/10 07:57, căn hộ Phạm Thế Hiển): bản đầu đặt câu rút thành `expired` — mà `expired` nghĩa là "khách
     * đã NÉ câu này", vòng hỏi trong lượt bỏ qua mọi câu expired (`hetHanSet`, `tiepSauGhi`) và nhắc giữ kết nối coi là đã né. Câu số phòng
     * ngủ bị rút khi khách nhắn giật cục nên bot không bao giờ hỏi nữa. Câu bị rút CHƯA từng tới khách — không phải dữ liệu của khách, không
     * phải lần né: xoá đúng dòng đó, trạng thái về như chưa mở.
     */
    const rutCauMoLuot = async (): Promise<boolean> => {
      let nhapRut = false;
      if (!lucTinChu) return false;
      for (const c of cauMoLuot) {
        const { error: rutErr } = await client.from("info_requests").delete()
          .eq("listing_id", c.listing_id).eq("question", c.question).eq("status", "pending").gte("created_at", lucTinChu);
        if (rutErr) await ghiLoi(client, "chat-reply rut cau cho (nhuong luot)", rutErr.message);
        else if (c.question === "duyet_tin") nhapRut = true;
      }
      return nhapRut;
    };
    /**
     * SRS-5.1zzzzzzu (Zalo thật 14/10/2026 14:24, tin cho thuê Q8): "đăng giúp chị nội dung này nhé" → lượt này ĐĂNG tin ("đăng đi"),
     * rồi bài rao tới 10 giây sau → nhường lượt trước khi gửi: câu báo đã lên kệ, câu phí, câu xin đánh giá đều bỏ; lượt bài rao
     * thấy tin đã đăng nên chỉ nói "em ghi … vào tin rồi". Tin lên kệ mà chủ nhà không hề biết. Đóng dấu duyệt (đưa tin lên kệ) là
     * việc KHÔNG rút lại được — lượt đã đóng dấu thì không nhường, phải nói ra. (Đường "đăng đi" kiểm tin mới hơn NGAY TRƯỚC khi đóng
     * dấu, để phần lớn ca nhường TRƯỚC khi đăng.)
     * SRS-5.1zzzzzzz4: cờ này nghĩa rộng là "lượt đã ghi một thay đổi trạng thái khách phải được nghe" — cả "đủ rồi" (đóng mọi câu
     * treo + `chu_noi_du_at`) cũng bật nó: đóng câu xong mà nhường im thì khách không biết bot đã thôi hỏi.
     */
    let daDuyetLuot = false;
    // SRS-5.1zzzzzq (Zalo thật 13/10/2026 11:42: "Cháu đăng giúp Bác thông tin này nhé!" rồi 12 giây sau cả bài rao; lượt tin 1 đang chạy
    // model, đọc "đăng giúp" là đủ rồi → "thôi hỏi", đóng câu treo, đóng dấu `chu_noi_du_at`; lượt tin 2 chạy song song ghi fact nhưng
    // không còn câu nào để hỏi, không nháp): nhánh bán chưa từng có check nhường lượt FR-131. Hàm này được gọi (a) trước quyết định
    // ĐÓNG của "đủ rồi" và (b) trước khi ghi / gửi lời bot — có tin chủ nhà mới hơn thì lượt này im, lượt của tin cuối trả lời gộp.
    {
      const seqChu = (msgSRow as { seq?: number } | null)?.seq;
      if (typeof seqChu === "number") {
        kiemTinMoiHon = async () => {
          // SRS-5.1zzzzzzl (người test thật 14/10 11:26): tin rao dài chạy 40 s, giữa chừng khách THẢ TIM → cú thả tim bị đếm là "tin mới
          // hơn", lượt rao nhường (không gửi gì), lượt thả tim tự nó cũng im → khách chờ 12 phút không thấy bot. Thả cảm xúc không mang
          // chữ để trả lời và lượt của nó không gửi gì, nên không bao giờ được thay lượt đang chạy (`laThaCamXuc`, cùng cách gộp cụm).
          const { data, error } = await client.from("messages").select("seq, body").eq("conversation_id", convSId)
            .in("sender", ["buyer", "seller"]).gt("seq", seqChu).limit(5);
          if (error) { await ghiLoi(client, "chat-reply kiem tin moi hon (ban)", error.message); return false; }
          return ((data ?? []) as Array<{ body: string | null }>).some((m) => !laTinRongNghia(m.body ?? ""));
        };
      }
    }
    if (msgSErr?.code === "23505" && !(coSo && soAttempts > 1)) {
      // Trùng từ THỜI TRƯỚC SỔ (sổ chưa có dòng nào cho msg_id này mà messages
      // đã có): lượt cũ đã trả lời rồi — dừng, và chốt sổ completed-rỗng để
      // các retry sau không quay lại đây nữa.
      return await hoanTat({ reply: null, replies: [], role: "seller", deduped: true });
    }
    if (msgSErr && msgSErr.code !== "23505") {
      // Mọi lỗi KHÁC 23505 (khoá ngoại, timeout, enum sai…) trước đây rơi im:
      // bot vẫn trả lời vào một hội thoại thiếu đúng dòng chủ nhà vừa nhắn.
      await ghiLoi(client, "chat-reply messages seller", msgSErr.message);
      return await baoHong({ error: msgSErr.message }, 500, msgSErr.message);
    }
    // 23505 khi soAttempts > 1: lượt trước của CHÍNH msg_id này chết giữa chừng
    // — tin chủ nhà đã nằm trong sổ messages rồi. Đi tiếp trả lời nốt, đừng
    // nuốt (đây đúng là ca "AI chưa kịp chạy / Zalo chưa kịp gửi thì hỏng").
    // (`conversations.last_message_at` do trigger trên `messages` đẩy — migration
    //  20260902d — không còn UPDATE tay ở đây.)

    // FR-141 — người thật gõ tay trong 30 phút gần đây thì bot im.
    // Cổng này trước chỉ có ở nhánh mua, nên CTV đang thương lượng với chủ nhà
    // mà chủ nhắn tiếp là bot nhảy vào nói chen giữa cuộc.
    // Trả về NGAY tại đây là bỏ luôn khúc bóc fact bên dưới: câu trả lời của
    // chủ nhà không vào `listing_facts`, `info_requests` nằm `pending` mãi, và
    // vòng drip hỏi lại đúng câu người ta vừa trả lời — CTV vào tay một cái là
    // dữ liệu căn đó đứng hình. Nên cổng chỉ khoá ĐƯỜNG RA (traLoiSeller) và
    // khoá lượt gọi model, không khoá đường ghi.
    // ─── SRS-5.1zzzzzzg (chủ dự án 13/10 tối, "gật"): KHÁCH NHẮN GIẬT CỤC → GỘP CỤM ─────────────────────────────────────────
    // Zalo thật 13/10 17:20–17:23 (đất Q8): "Đường 156 An Dương Vương" rồi 11 giây sau "Phường Phú Định"; "xây được 6 tầng" / "Đất có sổ
    // đỏ chính chủ" / ảnh cách nhau 8–10 giây. Mỗi tin một lượt: lượt trước ghi fact rồi IM (nhường lượt), lượt cuối trả lời — fact của
    // lượt im không được 🤖 nào báo (mốc 🤖 là giờ tin cuối), và lượt cuối đọc câu kế trên DB lúc nó chạy, lượt trước ghi xong SAU đó.
    // Nay: (1) sau khi ghi tin, CHỜ `app_config.gop_cum` giây (mặc định 3; `tat` = không chờ) rồi soi tin CHỮ mới hơn của khách — có thì
    // THOÁT SẠCH (chưa ghi gì ngoài dòng `messages`), lượt của tin cuối đọc cả cụm; tin mới hơn là ẢNH / FILE thì không thoát (lượt ảnh
    // không gộp chữ). (2) Lượt đi tiếp đọc cụm tin chủ nhà liền trước (không lời bot chen, cách nhau ≤ 90 s): mốc 🤖 = tin đầu cụm, và
    // GỘP VĂN BẢN những tin mà lượt của nó CHẮC đã thoát ở cổng (1) — tin kế tới trong lúc nó còn chờ (cách < gop_cum − 0,5 s); vùng mập
    // mờ ±1 s tra sổ `inbound_ledger` (completed + `dau_luot`); tin có lượt đang chạy / đã trả lời KHÔNG gộp (đọc hai lần là tạo tin
    // trùng), fact của nó vẫn vào 🤖 qua mốc đầu cụm. Chuỗi gộp dừng ở tin đầu không gộp được. Lượt ảnh / file / link và lượt chạy lại
    // (`soAttempts > 1`) đi như cũ. e2e: `globalThis.__nguGopCum` thay giấc chờ.
    if (!imageUrl && !fileUrl && !linkUrl && lucTinChu && !(coSo && soAttempts > 1)) {
      const seqChu = (msgSRow as { seq?: number } | null)?.seq;
      const { data: cfgGop, error: cfgErr } = await client.rpc("cau_hinh", { p_key: "gop_cum" });
      if (cfgErr) await ghiLoi(client, "chat-reply cau_hinh(gop_cum)", cfgErr.message);
      const chuoiGop = String(cfgGop ?? "").trim();
      // SRS-5.1zzzzzzz (chủ dự án 14/10 "giảm độ trễ đi"): mặc định 3 → 1,5 giây. Tin giật cục thật (14/10: cách nhau 8–16 giây) nằm ngoài cả
      // cửa sổ 3 giây, nên chờ 3 giây chủ yếu là trễ thêm; tin tới muộn hơn vẫn được cổng nhường lượt trước khi gửi bắt.
      const giayGop = chuoiGop === "tat" ? 0 : Math.min(8, Math.max(0, Number(chuoiGop) || 1.5));
      const laTinMedia = (b: string | null | undefined) => /\[(?:ảnh|file|link): /.test(b ?? "");
      type DongCum = { sender: string; body: string | null; seq: number; created_at: string | null; zalo_msg_id?: string | null };
      let truocDo: DongCum[] = [];
      if (typeof seqChu === "number") {
        if (giayGop > 0) {
          const ngu = (globalThis as { __nguGopCum?: (ms: number) => Promise<void> }).__nguGopCum
            ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
          await ngu(giayGop * 1000);
        }
        // MỘT truy vấn sau giấc chờ: dòng seq > tin này = tin mới hơn (cổng thoát); dòng seq < = cụm liền trước.
        const { data: lanCan, error: lcErr } = await client.from("messages").select("sender, body, seq, created_at, zalo_msg_id")
          .eq("conversation_id", convSId).neq("seq", seqChu).order("seq", { ascending: false }).limit(12);
        if (lcErr) await ghiLoi(client, "chat-reply gop cum (doc lan can)", lcErr.message);
        const ds = (lanCan ?? []) as DongCum[];
        if (giayGop > 0 && ds.some((m) => m.seq > seqChu && laTinNguoi(m.sender) && !laTinMedia(m.body))) {
          console.log("chat-reply: tin chữ mới hơn tới trong lúc chờ gộp cụm → thoát, lượt tin cuối đọc cả cụm");
          return await hoanTat({ reply: null, replies: [], role: "seller", superseded: true, superseded_luc: "dau_luot" });
        }
        truocDo = ds.filter((m) => m.seq < seqChu);
      }
      const giayCach = (sau: string, truoc: string) => (Date.parse(sau) - Date.parse(truoc)) / 1000;
      const cum: DongCum[] = []; // mới → cũ
      let sau = lucTinChu;
      for (const r of truocDo) {
        if (!laTinNguoi(r.sender) || !r.created_at) break;
        // Ảnh / file / link và thả cảm xúc giữa hai câu chữ không cắt cụm, cũng không gộp (không mang chữ để đọc).
        if (laTinMedia(r.body) || laTinRongNghia(r.body ?? "")) continue;
        if (giayCach(sau, r.created_at) > 90) break;
        cum.push(r); sau = r.created_at;
      }
      if (cum.length) {
        lucDauCum = cum[cum.length - 1].created_at;
        const gop: DongCum[] = [];
        let ke = lucTinChu;
        for (const r of cum) {
          const cach = giayCach(ke, r.created_at!);
          let duocGop = giayGop > 0 && cach <= giayGop - 0.5;
          if (!duocGop && giayGop > 0 && cach <= giayGop + 1 && r.zalo_msg_id) {
            try {
              const { data: so } = await client.from("inbound_ledger").select("status, reply").eq("zalo_msg_id", r.zalo_msg_id).maybeSingle();
              const soRow = so as { status?: string; reply?: { superseded_luc?: string } | null } | null;
              duocGop = soRow?.status === "completed" && soRow.reply?.superseded_luc === "dau_luot";
            } catch (e) { await ghiLoi(client, "chat-reply gop cum (so inbound)", e); }
          }
          if (!duocGop) break;
          gop.push(r); ke = r.created_at!;
        }
        if (gop.length) {
          gop.reverse();
          for (const g of gop) seqGop.add(g.seq);
          text = [...gop.map((g) => (g.body ?? "").trim()), text].filter(Boolean).join("\n").slice(-12000); // giữ phần MỚI NHẤT
          textBoc = soChuThanhSo(text);
          tKD = boDau(textBoc);
          console.log(`chat-reply: gộp ${gop.length} tin trước vào lượt này (cụm ${cum.length} tin)`);
        }
      }
    }

    const nguoiThatDangCham = convSRow?.c_human_touch_at;
    // FR-189 (10/09/2026): người thật GIỮ khách ("#mã giữ") → bot im vô thời hạn
    // tới khi "trả bot"; ngoài ra vẫn nhường sân 30 phút sau tin gõ tay (FR-141).
    const humanActive = convSRow?.c_human_hold === true || (!!nguoiThatDangCham &&
      Date.now() - Date.parse(nguoiThatDangCham) < 30 * 60e3);

    // MỌI đường ra của nhánh này phải đi qua đây — trả lời của bot cũng là một
    // dòng trong sổ. Thêm `return jsonResponse(...)` trần ở nhánh seller là
    // thủng lại đúng chỗ vừa vá, và thủng im lặng.
    // FR-164: lời cảm ơn cho phần SỬA FACT, gắn vào bong bóng ĐẦU của bất kỳ
    // đường ra nào phía sau. Để ở đây (trước `traLoiSeller`) vì nhánh người bán
    // có sáu lối thoát khác nhau — chép câu cảm ơn ra từng lối là kiểu bỏ sót
    // đúng một chỗ rồi không ai thấy.
    // FR-193 b (10/09): quận nói ở LƯỢT SAU cũng phải vào cột. Chủ dự án rao
    // "bán căn ho ở Hà đô centrosa garden" (không quận) rồi lượt sau nói "quận 10
    // phường 12" — trước bản này chỉ phường vào cột, còn district giữ nguyên mặc
    // định "Quận 5", tức kho có một căn hộ Quận 10 nằm trong rổ Quận 5.
    // "cả 2 căn / cả lô / đều" — quận nói cho MỌI tin đang mở (20/09/2026, bắn thật mau-y-A:
    // "ca 2 can deu quan 10 nhe" từng bị bỏ qua vì câu chờ là loại BĐS).
    const CA_LO_RE = /\b(?:ca|het)\s+(?:2|3|4|hai|ba|bon|lo|may|cac)\b|\bdeu\b|\bca lo\b/;
    /** Trả về chữ đã ghi ("Quận 10", "Quận 10 cho 2 căn") hay null khi không đổi gì. */
    // 25/09/2026 (bắn thật lx-30): "quận 5 em" ghi quận vào cột (không qua fact) → 🤖 báo "Không bóc tách được gì".
    let quanVuaGhi: string | null = null;
    // SRS-5.1zzzzm: quận lượt này THẬT SỰ ghi (đổi cột, hay bỏ dấu "mặc định") — `quanVuaGhi` là quận đọc được, có thể không ghi
    // (quận nhắc lúc hỏi hướng / giá là nơi gần đó). Dòng "em vừa ghi" chỉ đọc biến này (bất biến e2e GHI NHẬN bắt được chỗ lệch).
    let quanGhiLuot: string | null = null;
    // SRS-5.1zzzzm: dòng "lượt này em vừa ghi gì" cho câu lệnh model — đọc sổ `ghiLuot` (+ quận `capNhatQuan`) của ĐÚNG căn đang
    // nói. Phường kèm quận CŨ tra từ bảng phường (dữ liệu hệ thống, không phải đoán) để model có một câu đáp có căn cứ.
    const dongVuaGhi = (listingId: string | null | undefined): string => {
      const muc: string[] = [];
      for (const g of ghiLuot) {
        // SRS-5.1zzzzo: giá trị ghi lại mà không đổi (lượt chốt tin, khách nhắc lại) không phải điều lượt này vừa ghi.
        if (g.listing_id !== listingId || g.question === "nhan" || g.question === "kien_thuc" || !g.doi) continue;
        // SRS-5.1zzzzn: phường + quận cũ in qua MỘT hàm (`phuongKemQuanCu`, bao_lai.ts) — cùng chữ với phần "làm chuẩn" của 🤖.
        const p = g.question === "phuong" ? phuongKemQuanCu(g.ghi) : null;
        const nhan = g.question === "loai_bds" ? g.ghi
          : p ? p
          : g.question === "bo_sung" ? "ghi chú điều chủ nhà vừa kể"
          : (FACT_LABELS[g.question] ?? g.question).replace(/\s*\(.*\)\s*$/, "");
        if (!muc.includes(nhan)) muc.push(nhan);
      }
      if (quanGhiLuot && !muc.some((m) => m.includes(quanGhiLuot!))) muc.push(quanGhiLuot);
      return muc.length
        ? `${VUA_GHI_CO}: ${muc.join("; ")}. Ghi nhận (nếu đáng) chỉ những điều này, vài chữ, không đọc lại số; điều khác trong ĐÃ BIẾT là chuyện các lượt trước — không nói "em ghi" cho nó.\n`
        : `${VUA_GHI_KHONG} (chủ nhà chỉ gật, hỏi hay nói chuyện khác): KHÔNG nói "em ghi / em lưu / em ghi nhận", không nhắc lại điều trong ĐÃ BIẾT; đáp một tiếng ("Dạ", "Vâng ạ") hoặc trả lời điều họ hỏi, rồi vào câu hỏi.\n`;
    };
    const capNhatQuan = async (listingId: string | null): Promise<string | null> => {
      if (!listingId) return null;
      // Truyền cả bản THÔ: "quán 2 tầng" bỏ dấu thành "quan 2 tang", không có
      // bản thô thì không tài nào biết đó không phải Quận 2 (tầng ba, 10/09).
      // FR-214: câu đã chia mảnh theo tin → quận ở mảnh căn KHÁC không phải quận của căn đang hỏi.
      // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): hàm này chạy với MỌI câu trả lời câu treo và `bocQuan` dò tên quận trên
      // CẢ câu rồi GHI ĐÈ quận của tin — "hướng Đông, ra Quận 1 có 5 phút" cho căn Quận 4 thành Quận 1. AI đã đọc thì quận
      // là quận AI đọc ra là NƠI CĂN NHÀ (qua kiểm bằng chứng); AI không nói quận → không đổi. Luật chỉ còn khi AI không chạy.
      const ai = await aiLuot();
      const q = ai !== undefined ? ai.quan
        : textTreo !== null ? bocQuan(boDau(textTreo), textTreo) : bocQuan(tKD, text);
      if (!q) return null;
      quanVuaGhi = q;
      const ids: string[] = [listingId];
      if (CA_LO_RE.test(tKD)) {
        const { data: dsLo } = await client.from("listings").select("id, district, boc_tach").eq("seller_id", sellerRow.id)
          .in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"]).limit(20);
        for (const r of (dsLo ?? []) as Array<{ id: string; district: string | null; boc_tach: unknown }>) {
          if (r.id !== listingId && (!r.district || (r.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh === true)) ids.push(r.id);
        }
      }
      let soDoi = 0;
      for (const id of ids) {
        const { data: cu } = await client.from("listings").select("district, boc_tach").eq("id", id).maybeSingle();
        if (!cu) continue;
        if (cu.district === q) {
          // Chủ nhà xác nhận đúng quận đang ghi (vd "quận 5" khi cột đang mặc định Quận 5):
          // không đổi cột, chỉ bỏ dấu "mặc định" (11/09/2026).
          if ((cu.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh === true) {
            const { error: bt0 } = await client.rpc("ghi_boc_tach", { p_listing_id: id, p: { quan: q, quan_mac_dinh: false } });
            if (bt0) await ghiLoi(client, "chat-reply ghi_boc_tach(quan xac nhan)", bt0.message);
            else quanGhiLuot = q;
          }
          continue;
        }
        // Tin ĐÃ có quận thật (không phải mặc định) mà câu không phải trả lời câu địa chỉ → không đè: quận nhắc lúc đang hỏi
        // hướng / giá / tiện ích thường là nơi GẦN đó, không phải nơi căn nhà nằm.
        const daCoQuan = !!cu.district && (cu.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh !== true;
        if (ai !== undefined && daCoQuan && !CAU_DIA_CHI.has(pendingReq?.question ?? "")) continue;
        const { error: qErr } = await client.from("listings").update({ district: q }).eq("id", id);
        if (qErr) { await ghiLoi(client, "chat-reply cap nhat quan", qErr.message); continue; }
        soDoi++;
        const { error: btErr } = await client.rpc("ghi_boc_tach", { p_listing_id: id, p: { quan: q, quan_mac_dinh: false } });
        if (btErr) await ghiLoi(client, "chat-reply ghi_boc_tach(quan)", btErr.message);
      }
      if (soDoi) quanGhiLuot = q;
      return soDoi ? `${q}${soDoi > 1 ? ` cho ${soDoi} căn` : ""}` : null;
    };

    // 01/10/2026 (bắn thật lx-tam-12; chủ dự án: "trong data có danh sách quận đường phường xã rồi mà nếu gần giống thì lôi
    // ra"): "156 đường 59 Tây Thông Hội" — AI đoán "Xã Tân Thông Hội" (Củ Chi), ghi phường Xã Củ Chi cho tin Gò Vấp. Tên
    // phường/xã khách GÕ trong câu (đúng, đảo chữ, sai ≤ 1 ký tự) dò theo bảng `wards` → ghi phường đó (seller_chat, đè phường
    // AI đoán). Phường khác quận đã biết của tin thì không ghi.
    let dsPhuongTuDien: PhuongDs[] | null = null;
    // Phường từ điển dò ra trong tin này mà thuộc QUẬN KHÁC quận tin đang ghi ("tay thnh" cho tin Quận 5) — không ghi,
    // để luồng câu phường hỏi lại khách (01/10/2026, bắn thử v309 lx-lq-61: chữ gõ sai không tra lại được bằng tên đúng).
    let phuongLechLuot: { ten_day_du: string; quan_cu: string } | null = null;
    // 01/10/2026 (chủ dự án: "làm hàm dò địa danh chung đi, dò bằng schematic"): tin chỉ là MỘT tên trơn ("tan dinh",
    // "phường tây thạnh nha", "ở gò vấp á") mà bảng `wards` dò trong câu không ra → dò cả bốn từ điển (`tim_dia_danh`:
    // phường mới, phường cũ → phường mới, quận cũ, tên đường; đúng chữ / đảo chữ / sai 1 ký tự). Chữ không ra gì thì tìm
    // theo NGHĨA (`tim_dia_danh_theo_nghia`, vector) — chỉ nhận khi rất gần (≥ 0,9) và tên còn gần chữ khách gõ. Phường →
    // ghi phường; quận → ghi quận khi tin chưa có quận chắc; đường → để đường địa chỉ cũ lo. Mập mờ thì không ghi.
    const TU_CHUNG_DIA_DANH: ReadonlySet<string> = new Set([...TU_CHUNG_DUONG, "phuong", "xa", "quan", "huyen", "thi", "tran"]);
    const giaiDiaDanh = async (ten: string, chon: { tienTo: NhomDiaDanh | null; cauHoi: NhomDiaDanh | null; quanBiet: string | null }): Promise<DiaDanhChon | null> => {
      const { data, error } = await client.rpc("tim_dia_danh", { p_ten: ten });
      if (error) { await ghiLoi(client, "chat-reply tim_dia_danh", error.message); return null; }
      const ds = (data ?? []) as UngVienDiaDanh[];
      if (ds.length) return chonDiaDanh(ds, chon);
      try {
        const khoa = await sanSangNghia(client);
        if (!khoa) return null;
        const vec = await nhungCauTim(khoa, `${ten}, Thành phố Hồ Chí Minh`);
        const { data: nd, error: nErr } = await client.rpc("tim_dia_danh_theo_nghia", {
          p_vec: vec, p_loai: ["phuong_moi", "phuong_cu", "quan_cu", "duong", "so"], p_limit: 8,
        });
        if (nErr) { await ghiLoi(client, "chat-reply tim_dia_danh_theo_nghia(chung)", nErr.message); return null; }
        const gan = ((nd ?? []) as Array<Omit<UngVienDiaDanh, "khoang_cach"> & { do_gan: number }>)
          .filter((u) => u.do_gan >= 0.9 && tenGan(ten, u.ten, TU_CHUNG_DIA_DANH));
        const kq = chonDiaDanh(gan.map((u) => ({ ...u, khoang_cach: 0 })), chon);
        if (kq) console.log(`dia danh theo nghia: "${ten}" → ${kq.nhom} ${kq.ten}`);
        return kq;
      } catch (e) {
        await loiNhung(client, "chat-reply dia danh theo nghia", e);
        return null;
      }
    };
    const ghiPhuongTrongCau = async (
      listingId: string | null, tin: string, dongBiet: { ward?: string | null; district?: string | null; boc_tach?: unknown } | null = null,
      cauDangHoi: string | null = null,
    ): Promise<string | null> => {
      if (!listingId || !tin?.trim()) return null;
      if (!dsPhuongTuDien) {
        const { data, error } = await client.from("wards").select("ten, ten_day_du, loai, quan_cu").limit(400);
        if (error) { await ghiLoi(client, "chat-reply wards(tu dien phuong)", error.message); return null; }
        dsPhuongTuDien = (data ?? []) as PhuongDs[];
      }
      // SRS-5.1zzzzq (bắn production 09/10, thu-thuong2/6): "ở củ chi, xã tân thạnh đông" → bảng `wards` (chỉ tên MỚI) khớp phần đầu
      // "tân thạnh" với Phường Tân Thành (Phú Mỹ) và ghi phường đó, trong khi xã CŨ Tân Thạnh Đông nay là Xã Phú Hòa Đông. Bộ dò chung
      // `phuongNhacTrongCau` (tên mới + tên cũ, tên dài trùm tên ngắn) là chủ của "câu nhắc phường nào": bảng `wards` khớp ra một
      // phường mà bộ chung đọc ra phường KHÁC → theo bộ chung. Bảng `wards` vẫn lo chữ gõ đảo / sai một ký tự bộ chung không đọc.
      // SRS-5.1zzzzzh: khớp GẦN ĐÚNG (đảo chữ / sai một ký tự) chỉ tin được khi khách đang trả lời câu PHƯỜNG — ở câu khác, chữ gần giống
      // tên phường thường là tên đường ("Trần Hưng" ≈ "Tân Hưng"). Gần đúng ngoài câu phường → không ghi (bot sẽ hỏi phường).
      const tpTho = timPhuongTrongCau(tin, dsPhuongTuDien);
      const tpBang = tpTho && (!tpTho.ganDung || cauDangHoi === "phuong") ? tpTho : null;
      const pnChung = tpBang ? phuongNhacTrongCau(tin) : null;
      const pn = pnChung && pnChung.ten_day_du !== tpBang?.phuong.ten_day_du ? pnChung : null;
      const tp = pn ? null : tpBang;
      const tron = pn || tp ? null : tenDiaDanhTron(tin);
      if (!pn && !tp && !tron) return null;
      let l = dongBiet;
      if (!l) {
        const { data, error: lErr } = await client.from("listings").select("ward, district, boc_tach").eq("id", listingId).maybeSingle();
        if (lErr) { await ghiLoi(client, "chat-reply phuong tu dien(doc)", lErr.message); return null; }
        l = data;
      }
      if (!l) return null;
      const quanMacDinh = (l.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh === true;
      // SRS-5.1zzzzzh: quận khách nói NGAY TRONG CÂU này cũng là quận đã biết ("… quận 5" cùng lượt — cột quận chưa kịp ghi).
      const quanCot = l.district && !quanMacDinh ? String(l.district) : null;
      const quanBiet = quanCot ?? bocQuan(boDau(tin), tin);
      let ten = pn?.ten_day_du ?? tp?.phuong.ten_day_du ?? null;
      let quanPhuong = pn?.quan_cu ?? tp?.phuong.quan_cu ?? null;
      if (tron) {
        const cauHoi: NhomDiaDanh | null = cauDangHoi === "phuong" ? "phuong" : cauDangHoi === "vi_tri" ? "duong" : null;
        const dd = await giaiDiaDanh(tron.ten, { tienTo: tron.tienTo, cauHoi, quanBiet });
        if (!dd || dd.nhom === "duong") return null;
        if (dd.nhom === "quan") {
          if (quanCot) return null;
          const { error: qErr } = await client.from("listings").update({ district: dd.ten }).eq("id", listingId);
          if (qErr) { await ghiLoi(client, "chat-reply cap nhat quan (dia danh)", qErr.message); return null; }
          const { error: bErr } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { quan: dd.ten, quan_mac_dinh: false } });
          if (bErr) await ghiLoi(client, "chat-reply ghi_boc_tach(quan dia danh)", bErr.message);
          console.log("chat-reply: quan dia danh", tron.ten, "→", dd.ten);
          return null;
        }
        ten = dd.ten;
        quanPhuong = dd.quan_cu;
      }
      if (!ten || l.ward === ten) return null;
      if (quanBiet && quanPhuong && !cungQuan(quanBiet, String(quanPhuong))) {
        phuongLechLuot = { ten_day_du: ten, quan_cu: String(quanPhuong) };
        return null;
      }
      const { error, boQua } = await ghiFact(client, { p_listing_id: listingId, p_question: "phuong", p_answer: ten, p_source: "seller_chat" });
      if (error) { await ghiLoi(client, "chat-reply ghi_fact_listing(phuong tu dien)", error.message); return null; }
      if (boQua) return null;
      console.log("chat-reply: phuong tu dien", pn ? "(bo chung)" : tp?.khop ?? tron?.ten, "→", ten);
      return ten;
    };
    // SRS-5.1zzzzzh (bắn production 12/10, thu-kb-thue): "căn hộ Sunrise City quận 7" — căn đã gắn dự án trong kho, kho có phường của dự án,
    // vậy mà bot hỏi phường bốn lần và bảo khách "xem trên sổ hồng". Phường của căn trong dự án là phường của DỰ ÁN: lấy từ kho (qua cửa
    // chuẩn `tenPhuongCot`, tên cũ → tên mới), không hỏi khách. Tin đã có phường thì thôi (không đè lời chủ nhà).
    const phuongTuDuAn = async (listingId: string | null | undefined, da: { ward?: string | null; district?: string | null } | null | undefined,
      wardDangCo: string | null | undefined, loai: string | null | undefined = null): Promise<string | null> => {
      if (!listingId || wardDangCo || !da?.ward) return null;
      // SRS-5.1zzzzzzm (người test thật 14/10 11:26, nhà phố Cao Lỗ Quận 8): bài rao dài nhắc nhiều địa danh → `match_projects` khớp một dự
      // án Quận 7, phường của dự án (Tân Hưng) chép vào tin nhà phố → tin công khai sai phường. Phường của DỰ ÁN chỉ là phường của CĂN khi
      // căn nằm trong dự án (căn hộ); nhà phố / đất chỉ "gần" dự án — phường tra từ tên đường (cùng lớp "địa chỉ một cửa").
      if (loai && loai !== "chung_cu") { console.log("chat-reply: phuong tu kho du an — bo qua vi loai", loai); return null; }
      const ten = tenPhuongCot(da.ward, da.district ?? null);
      if (!ten) return null;
      const { error, boQua } = await ghiFact(client, { p_listing_id: listingId, p_question: "phuong", p_answer: ten, p_source: "du_an_kho" });
      if (error) { await ghiLoi(client, "chat-reply phuong tu du an", error.message); return null; }
      if (boQua) return null;
      console.log("chat-reply: phuong tu kho du an →", ten);
      return ten;
    };

    // ─── FR-209 (15/09/2026): tra PHƯỜNG MỚI từ TÊN ĐƯỜNG ─────────────────────
    // Chủ dự án (Zalo thật): "nếu có địa chỉ và tên đường rồi thì tự search phường
    // quận được không chứ". Nominatim trả phường MỚI (sau 07/2025, OSM bỏ ranh giới
    // quận); quận cũ tra ở bảng `wards` (NQ 1685). Bot HỎI XÁC NHẬN, chưa ghi —
    // gợi ý nằm ở `boc_tach.phuong_goi_y`, chủ nhà gật thì mới vào cột (RSK-03).
    // Tra hỏng / hết giờ (4 s) là đường đi bình thường → console.log, không vào sổ lỗi.
    // `doi_quan` (01/10/2026): gợi ý sinh ra vì phường khách nói thuộc QUẬN KHÁC quận tin đang ghi — gật thì đổi luôn quận.
    type GoiYPhuong = { phuong: string; quan: string; duong: string; doi_quan?: boolean };
    const timWard = async (ten: string): Promise<{ ten_day_du: string; quan_cu: string } | null> => {
      if (!ten || /\d/.test(ten)) return null;
      const { data, error } = await client.from("wards").select("ten_day_du, quan_cu").ilike("ten", ten).limit(1).maybeSingle();
      if (error) await ghiLoi(client, "chat-reply doc wards", error.message);
      return (data as { ten_day_du: string; quan_cu: string } | null) ?? null;
    };
    // Lưới đỡ khi khớp chữ không ra ("an hoi tai"): tìm phường gần NGHĨA nhất bằng vector (`tim_phuong_theo_nghia`,
    // 20260930a). Chỉ để HỎI XÁC NHẬN, không bao giờ ghi thẳng. Tắt tìm theo nghĩa / chưa nhúng / Gemini hỏng → null,
    // bot đi đường cũ (đây là đường đi bình thường, không vào sổ lỗi — trừ RPC hỏng).
    const NGUONG_PHUONG_NGHIA = 0.8;
    // Trả ứng viên nhất + nhì để biết có "đủ chắc để sửa luôn" không (`nghiaDuChac`: ≥ 0,9, bỏ xa nhì, đúng quận đã biết).
    const timPhuongTheoNghia = async (ten: string): Promise<{ top: Phuong & { do_gan: number }; nhi: { do_gan: number } | null } | null> => {
      try {
        const { data: sang, error: sErr } = await client.rpc("tim_nghia_san_sang");
        if (sErr || sang !== true) return null;
        const khoa = await khoaGemini(client);
        if (!khoa.length) return null;
        const vec = await nhungCauTim(khoa, `Phường ${ten}, Thành phố Hồ Chí Minh`);
        const { data, error } = await client.rpc("tim_phuong_theo_nghia", { p_vec: vec, p_limit: 2 });
        if (error) { await ghiLoi(client, "chat-reply tim_phuong_theo_nghia", error.message); return null; }
        const ds = (data ?? []) as Array<Phuong & { do_gan: number }>;
        return ds[0] && ds[0].do_gan >= NGUONG_PHUONG_NGHIA ? { top: ds[0], nhi: ds[1] ?? null } : null;
      } catch (e) {
        if (/^Gemini embed 429\b/.test((e as Error)?.message ?? "")) await loiNhung(client, "chat-reply tim phuong theo nghia", e);
        else console.log(`tim phuong theo nghia: ${(e as Error)?.message ?? e}`);
        return null;
      }
    };
    const traPhuongTuDuong = async (duongTho: string): Promise<GoiYPhuong | { nhieuNoi: string[]; duong: string } | null> => {
      const duong = chuanTenDuong(duongTho);
      if (!duongTraDuoc(duong)) return null;
      let json: unknown = null;
      try {
        // 25/09/2026 (FR-227): gọi thẳng từ edge thì Nominatim trả "Access denied" — nhờ DB gọi, cùng câu tra, chờ ≤ 4 s.
        const { data, error } = await client.rpc("tra_nominatim", { p_q: cauTraPhuong(duong), p_limit: 10, p_chi_tiet: true, p_cho_giay: 4 });
        if (error) { console.log(`tra phuong: nominatim ${error.message} cho "${duong}"`); return null; }
        json = data;
      } catch (e) {
        console.log(`tra phuong: nominatim hỏng cho "${duong}": ${(e as Error)?.message ?? e}`);
        return null;
      }
      const cac = docCacPhuongNominatim(json);
      if (!cac.length) return null;
      if (cac.length === 1) {
        const w = await timWard(cac[0].ten);
        return w ? { phuong: w.ten_day_du, quan: w.quan_cu, duong: duong.trim() } : null;
      }
      // 23/09/2026: đường có ở nhiều phường (Trần Bình Trọng: Q5, Q10, Bình Thạnh…) → không đoán; kể các quận cũ.
      const quan: string[] = [];
      for (const p of cac.slice(0, 6)) {
        const w = await timWard(p.ten);
        if (w?.quan_cu && !quan.includes(w.quan_cu)) quan.push(w.quan_cu);
      }
      return quan.length ? { nhieuNoi: quan, duong: duong.trim() } : null;
    };
    /** Tin đang ở quận MẶC ĐỊNH và có tên đường → tra, cất gợi ý, trả câu hỏi xác nhận (null = hỏi như cũ). */
    const cauHoiPhuongGoiY = async (listingId: string, duongBiet: string | null, cachGoiNguoi: string, textKem: string | null = null): Promise<string | null> => {
      const { data: l } = await client.from("listings").select("district, street, location_raw, boc_tach").eq("id", listingId).maybeSingle();
      if (!l) return null;
      const duong = (duongBiet ?? "").trim() || (l.street ?? "").trim() || tenDuong(l.location_raw ?? "");
      const quanBiet = l.district && (l.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh !== true ? l.district : null;
      const hoiXacNhan = async (goiY: GoiYPhuong, noiDuong: string): Promise<string | null> => {
        const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { phuong_goi_y: goiY, phuong_lua_chon: false } });
        if (error) { await ghiLoi(client, "chat-reply ghi_boc_tach(phuong goi y vi tri)", error.message); return null; }
        return cauXacNhanPhuong(cauHoiMau("phuong@goi_y", cachGoiNguoi).replace("đường {duong}", "{duong}"), cachGoiNguoi, noiDuong, goiY.phuong, goiY.quan);
      };
      // 30/09/2026 (chủ dự án: "còn mấy hẻm khác còn nhiều / nhỏ và nhỏ hơn nữa … kết hợp với vị trí nữa, để biết đường nào
      // gần đường nào"). Hai nguồn VỊ TRÍ đi trước tra tên đường trơn:
      // (a) SỐ HẺM — "137/28 đường số 59": từ điển `duong` có hẻm OSM kèm đường mẹ + toạ độ (`tim_hem`, hẻm nhỏ nhất trước
      //     rồi lùi ra hẻm lớn). Đúng MỘT phường → hỏi xác nhận phường đó.
      const sh = tachSoNhaHem(l.location_raw ?? "");
      const duongTra = catTenDuong(chuanTenDuong(duong));
      if (sh && duongTra) {
        const { data: hs, error: hErr } = await client.rpc("tim_hem", { p_cap_hem: sh.capHem, p_duong_me: duongTra, p_phuong: null });
        if (hErr) await ghiLoi(client, "chat-reply tim_hem", hErr.message);
        const cac = [...new Map(((hs ?? []) as Array<{ phuong: string | null; quan_cu: string | null }>)
          .filter((h) => h.phuong && (!quanBiet || h.quan_cu === quanBiet)).map((h) => [h.phuong!, h.quan_cu ?? ""])).entries()];
        if (cac.length === 1) return await hoiXacNhan({ phuong: cac[0][0], quan: cac[0][1], duong: duongTra }, `hẻm ${sh.hem} ${duongTra}`);
      }
      // (b) HAI CON ĐƯỜNG — "hẻm Lê Văn Sỹ gần Trần Huy Liệu", "góc Nguyễn Trãi": phường nào có cả hai đường mà tâm cách
      //     nhau ≤ 1,2 km (`phuong_giao_hai_duong`, toạ độ OSM). Đường có ở nhiều phường thì câu này thu về một.
      const kem = duongNhacKem([textKem, l.location_raw].filter(Boolean).join(" "), duongTra);
      if (kem && duongTra) {
        const { data: gs, error: gErr } = await client.rpc("phuong_giao_hai_duong", { p_duong1: duongTra, p_duong2: kem, p_ban_kinh_m: 1200 });
        if (gErr) await ghiLoi(client, "chat-reply phuong_giao_hai_duong", gErr.message);
        const gn = chonPhuongGanNhat(((gs ?? []) as Array<{ phuong: string; quan_cu: string | null; cach_m: number }>)
          .filter((g) => !quanBiet || g.quan_cu === quanBiet));
        if (gn) return await hoiXacNhan({ phuong: gn.phuong, quan: gn.quan_cu ?? "", duong: duongTra }, `đường ${duongTra} (gần ${kem})`);
      }
      // 25/09/2026 (chủ dự án: "người ta đưa số nhà và tên đường và quận rồi nhưng mà lại cố hỏi là phường nào"): tra bảng `duong`
      // (OSM, phường mới theo quận cũ): một phường → hỏi xác nhận; 2–4 phường → hỏi chọn; nhiều hơn → kể các quận.
      // SRS-5.1zzzzzzm (người test thật 14/10): bản trước chỉ tra bảng khi ĐÃ BIẾT quận, chưa biết thì đi Nominatim — Nominatim trả
      // MỘT phường cho "Huỳnh Tấn Phát" (bảng `duong` biết 3 phường Quận 7 + Nhà Bè) → bot hỏi có/không một phường đoán, khách sửa
      // "Phường Phú Thuận nhé" mà tin vẫn ghi Tân Thuận. Nay TỪ ĐIỂN LUÔN TRA TRƯỚC, bất kể quận; chưa biết quận thì các phường kể
      // kèm quận cũ của chúng và cất quận theo từng phường (`phuong_lua_chon_quan`) để lúc khách chọn ghi luôn quận. Nominatim chỉ
      // còn là lưới đỡ khi từ điển không có con đường đó.
      {
        const ten = chuanTenDuong(duong);
        // 30/09/2026: đường SỐ ("đường số 59") trùng khắp thành phố nên trước đây không tra; đã biết QUẬN thì nó chỉ còn
        // một hai chỗ, và từ điển nay có đường số theo phường (nap-duong.mjs giữ loại `so`). Chưa biết quận thì đường số không tra.
        const khoaSo = khoaDuongSo(ten);
        if (!duongTraDuoc(ten) && !(khoaSo && quanBiet)) return null;
        const { data: dd, error: ddErr } = await client.from("duong").select("phuong, quan_cu").eq("ten_khong_dau", khoaSo ?? boDau(ten)).limit(80);
        if (ddErr) { await ghiLoi(client, "chat-reply tra duong theo quan", ddErr.message); return null; }
        // Chỉ phường / quận có trong bảng `wards` TP.HCM (bảng `duong` còn chứa Bình Dương, Đồng Nai, Bà Rịa…).
        const cac = phuongQuanCuaDuong((dd ?? []) as Array<{ phuong: string | null; quan_cu: string | null }>, quanBiet, (p, q) => !!phuongCot(p, q));
        if (cac.length === 1) {
          const goiY = { phuong: cac[0].phuong, quan: cac[0].quan, duong: ten };
          const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { phuong_goi_y: goiY, phuong_lua_chon: false, phuong_lua_chon_quan: false } });
          if (error) { await ghiLoi(client, "chat-reply ghi_boc_tach(phuong goi y theo quan)", error.message); return null; }
          return cauXacNhanPhuong(cauHoiMau("phuong@goi_y", cachGoiNguoi), cachGoiNguoi, goiY.duong, goiY.phuong, goiY.quan);
        }
        // SRS-5.1zzzzzi: cất các phường vừa kể (`phuong_lua_chon`) — khách chọn bằng thứ tự / mô tả ("cái thứ 2") thì AI đọc theo câu
        // bot vừa hỏi, code chỉ nhận khi phường AI nói nằm trong đúng danh sách này.
        if (cac.length >= 2 && cac.length <= 4) {
          const ds = cac.slice(0, 4);
          const p = { phuong_lua_chon: ds.map((x) => x.phuong), phuong_lua_chon_quan: Object.fromEntries(ds.map((x) => [x.phuong, x.quan])), phuong_goi_y: false };
          const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p });
          if (error) await ghiLoi(client, "chat-reply ghi_boc_tach(phuong lua chon)", error.message);
          return cauChonPhuongQuan(cachGoiNguoi, ten, ds);
        }
        if (cac.length > 4) return cauNhieuNoiPhuong(cachGoiNguoi, ten, [...new Set(cac.map((x) => x.quan))]);
        // Từ điển không có đường này: đã biết quận → hỏi như cũ; chưa biết → Nominatim (lưới đỡ).
        if (quanBiet) return null;
      }
      const goiY = await traPhuongTuDuong(duong);
      if (!goiY) return null;
      if ("nhieuNoi" in goiY) return cauNhieuNoiPhuong(cachGoiNguoi, goiY.duong, goiY.nhieuNoi);
      const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { phuong_goi_y: goiY, phuong_lua_chon: false } });
      if (error) { await ghiLoi(client, "chat-reply ghi_boc_tach(phuong goi y)", error.message); return null; }
      return cauXacNhanPhuong(cauHoiMau("phuong@goi_y", cachGoiNguoi), cachGoiNguoi, goiY.duong, goiY.phuong, goiY.quan);
    };
    /**
     * Sau khi chủ nhà trả lời phường: gật gợi ý → quận gợi ý; tự nói TÊN phường mới →
     * tra `wards` lấy quận. Gợi ý dùng xong thì xoá. Trả về tên phường CHUẨN ("Phường
     * Long Trường") khi tra được, để fact ghi đúng chữ chứ không phải "phường long trường".
     */
    const capNhatQuanTuPhuong = async (listingId: string, goiY: GoiYPhuong | null, dapAnPhuong: string, textGoc: string = dapAnPhuong): Promise<string | null> => {
      const { data: cu } = await client.from("listings").select("district, boc_tach").eq("id", listingId).maybeSingle();
      const bt = (cu?.boc_tach ?? {}) as { quan_mac_dinh?: unknown; phuong_goi_y?: unknown; phuong_lua_chon?: unknown; phuong_lua_chon_quan?: unknown };
      // 20260917a: quận trống (không còn mặc định Quận 5) cũng là "chưa rõ" như cờ cũ.
      const chuaQuan = !cu?.district || bt.quan_mac_dinh === true;
      const p: Record<string, unknown> = {
        ...(bt.phuong_goi_y ? { phuong_goi_y: false } : {}), ...(bt.phuong_lua_chon ? { phuong_lua_chon: false } : {}),
        ...(bt.phuong_lua_chon_quan ? { phuong_lua_chon_quan: false } : {}),
      };
      let quan = goiY?.quan ?? null;
      let tenChuan: string | null = goiY ? goiY.phuong : null;
      // 30/09/2026: chốt với bảng `wards` trước — "phường an hội tây quận gò vấp" ra đúng Phường An Hội Tây + quận Gò Vấp.
      // 30/09/2026 (chủ dự án: "để AI nhận"): tên phường do AI đọc (đã qua kiểm bằng chứng) — máy chỉ tra đúng tên trong danh sách.
      // SRS-5.1zzzzj: MỘT cửa `phuongCot` (tên mới / cũ / số cũ + quận cũ) thay ba đường cũ (phuongChuan → tra `wards` → "Xã Tân Kiên"
      // viết hoa chữ khách). Không ra phường mới → null: không ghi, câu phường còn treo.
      const tachP = goiY ? null : tachTienToPhuong(dapAnPhuong);
      const chot = goiY ? phuongCot(goiY.phuong, goiY.quan) : phuongCot(tachP?.ten_day_du ?? dapAnPhuong, chuaQuan ? null : cu?.district ?? null);
      tenChuan = chot ? tenDayDu(chot) : null;
      if (chot && !goiY) quan = chuaQuan ? chot.quan_cu ?? null : null;
      if (quan && (chuaQuan || goiY?.doi_quan)) {
        const { error: qErr } = await client.from("listings").update({ district: quan }).eq("id", listingId);
        if (qErr) await ghiLoi(client, "chat-reply cap nhat quan tu phuong", qErr.message);
        else { p.quan = quan; p.quan_mac_dinh = false; }
      }
      if (Object.keys(p).length) {
        const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p });
        if (error) await ghiLoi(client, "chat-reply ghi_boc_tach(quan tu phuong)", error.message);
      }
      return tenChuan;
    };

    // ─── FR-212 (21/09/2026): TỪ ĐIỂN TÊN ĐƯỜNG ────────────────────────────────
    // Chủ dự án: "khách viết tên đường ko dấu hoặc sai 1 vài kí tự nhận ra dc ko" → bảng
    // `duong` (OSM theo phường mới, `20260921b`) + RPC `tim_duong`. Khớp đúng sau bỏ dấu →
    // viết đúng dấu theo từ điển, không hỏi; khớp gần (1–2 phép sửa, MỘT ứng viên) → HỎI
    // XÁC NHẬN, gợi ý cất ở `boc_tach.duong_goi_y`, chủ nhà gật mới ghi (RSK-03, cùng cách
    // FR-209 hỏi phường). Không khớp → giữ nguyên chữ khách gõ: từ điển vùng ven còn mỏng,
    // "không có trong từ điển" không có nghĩa là "gõ sai". RPC hỏng là SỰ CỐ (ghi sổ) nhưng
    // địa chỉ vẫn ghi như cũ — từ điển là lớp phụ, không được chặn đường ghi.
    const suaTenDuong = async (viTri: string, quan: string | null | undefined, phuong?: string | null): Promise<{ viTri: string; goiY: GoiYDuong | null }> => {
      const goc = catTenDuong(chuanTenDuong(tenDuong(viTri)));
      if (!duongTraDuoc(goc)) return { viTri, goiY: null };
      const { data, error } = await client.rpc("tim_duong", { p_ten: goc, p_quan: quan ?? null });
      if (error) { await ghiLoi(client, "chat-reply tim_duong", error.message); return { viTri, goiY: null }; }
      const kq = chonDuong(goc, (data ?? null) as UngVienDuong[] | null, quan ?? null, phuong ?? null);
      if (kq.loai === "sua") return { viTri: theTenDuong(viTri, goc, kq.ten), goiY: null };
      if (kq.loai === "hoi") return { viTri, goiY: { goc, ten: kq.ten, vi_tri: theTenDuong(viTri, goc, kq.ten) } };
      // SRS-5.1zzzzzy: tên đã KHỚP ĐÚNG từ điển (một hay nhiều tên cùng chữ bỏ dấu) thì không có gì để tìm theo nghĩa — tìm theo nghĩa chỉ
      // cho tên KHÔNG có trong từ điển. 13/10: "Trương Đình Hội" khớp hai tên → tìm theo nghĩa ra "Trương Định", khách gật → đường sai.
      if (kq.khop) return { viTri, goiY: null };
      // 30/09/2026: lệch hơn 2 ký tự ("huyn tanphat") → tìm theo nghĩa; ra tên đường thì chỉ HỎI XÁC NHẬN như gợi ý thường.
      const tenNghia = await timDuongTheoNghia(client, goc, quan);
      if (tenNghia && boDau(tenNghia) !== boDau(goc)) return { viTri, goiY: { goc, ten: tenNghia, vi_tri: theTenDuong(viTri, goc, tenNghia) } };
      return { viTri, goiY: null };
    };
    /** Cất gợi ý vào `boc_tach.duong_goi_y` rồi trả câu hỏi xác nhận (null = không cất được → hỏi như cũ). */
    const cauHoiDuongGoiY = async (listingId: string, goiY: GoiYDuong, cachGoiNguoi: string): Promise<string | null> => {
      const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { duong_goi_y: goiY } });
      if (error) { await ghiLoi(client, "chat-reply ghi_boc_tach(duong goi y)", error.message); return null; }
      return cauXacNhanDuong(cauHoiMau("duong@goi_y", cachGoiNguoi), cachGoiNguoi, goiY.goc, goiY.ten);
    };

    // Chế độ `ai` (01/10/2026, chủ dự án: "xhr có thể người ta nhắn shr nhưng viết nhầm, có thể hỏi lại xác nhận"): AI đánh
    // dấu chữ viết tắt / gõ sai không chắc nghĩa (`xac_nhan`) → cất `boc_tach.xac_nhan_goi_y`, hỏi lại; chủ gật mới ghi (cùng
    // cách gợi ý tên đường FR-212).
    const goiYXacNhanAi = async (tinKiem: string): Promise<GoiYXacNhan | null> => {
      if (!bongAi) return null;
      const kq = await bongAi;
      return laCheDoAi && kq ? kiemXacNhan(kq.xacNhan ?? [], tinKiem) : null;
    };
    const cauHoiXacNhanAi = async (listingId: string, g: GoiYXacNhan, cachGoiNguoi: string): Promise<string | null> => {
      const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { xac_nhan_goi_y: g } });
      if (error) { await ghiLoi(client, "chat-reply ghi_boc_tach(xac nhan goi y)", error.message); return null; }
      return `Dạ "${g.trich_dan}" là ${g.gia_tri} đúng không ${cachGoiNguoi} ạ?`;
    };

    // 01/10/2026 (chủ dự án: "nhà nếu có 4 tấm, tầng thì hỏi có tính gác lửng ko" — tấm / tầng / lửng gọi chung là KẾT CẤU):
    // tin vừa nhắn nói kết cấu bằng SỐ tấm/tầng trơn ("4 tấm") → câu kế là "kết cấu 4 tấm đó có tính cả gác lửng không".
    // Mỗi tin hỏi MỘT lần (`boc_tach.lung_goi_y` đặt false sau khi dùng). Đã có lửng / không phải nhà thì thôi.
    // 02/10/2026 (test tay, SRS-5.1ze): khách HỎI "Sao em biết nhà 4-6 tầng" → regex đọc "6 tầng" thành kết cấu, bot hỏi "kết cấu
    // 6 tầng đó có tính cả gác lửng không". Chế độ `ai`: chỉ hỏi khi AI đọc ra kết cấu / số tầng THEO NGHĨA trong tin này (lấy
    // đúng cụm AI trích); AI không đọc ra thì không hỏi. Regex chỉ đỡ khi AI không chạy.
    const cauHoiLung = async (listingId: string, tinGoc: string, cachGoiNguoi: string): Promise<string | null> => {
      let tinKiem = tinGoc;
      if (laCheDoAi && bongAi) {
        const kq = await bongAi;
        if (kq?.ket) {
          tinKiem = kq.truong.filter((t) => t.khoa === "ket_cau" || t.khoa === "so_tang")
            .map((t) => (t.khoa === "so_tang" && /^\d+$/.test((t.trich_dan ?? "").trim()) ? `${t.gia_tri} tầng` : (t.trich_dan || t.gia_tri))).join(", ");
          if (!tinKiem.trim()) return null;
        }
      }
      const g = soTamCanHoiLung(tinKiem);
      if (!g) return null;
      const { data: l, error } = await client.from("listings").select("floors_text, property_type, boc_tach").eq("id", listingId).maybeSingle();
      if (error) { await ghiLoi(client, "chat-reply hoi lung(doc)", error.message); return null; }
      // SRS-5.1zzzzzg: kết cấu đã có lửng thì thôi hỏi — TRỪ khi chính lời khách nói lửng mà chưa rõ trong hay ngoài số tầng ("3 tầng có
      // lửng"): kết cấu đang ghi khi đó là đoán của tầng dưới, không phải điều khách nói.
      if (!l || ["chung_cu", "dat", "phong_tro"].includes(String(l.property_type ?? "")) ||
        (/lửng/iu.test(String(l.floors_text ?? "")) && !lungChuaRoDem(tinKiem))) return null;
      if ((l.boc_tach as { lung_goi_y?: unknown } | null)?.lung_goi_y !== undefined) return null;
      // SRS-5.1zzzzzg: khách đã nói CÓ lửng → câu đáp "không" là "không tính lửng vào số tầng", không phải "không có lửng" (`co_lung`).
      const { error: gErr } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { lung_goi_y: lungChuaRoDem(tinKiem) ? { ...g, co_lung: true } : g } });
      if (gErr) { await ghiLoi(client, "chat-reply ghi_boc_tach(lung goi y)", gErr.message); return null; }
      return `Dạ ${g.n} ${g.dv} đó có tính cả gác lửng không ${cachGoiNguoi} ạ?`;
    };

    // Tầng tiền định đã ghi được fact dự án nào trong lượt này chưa. Lưới vét
    // bằng model (FR-199) chỉ chạy khi chỗ này còn `false` — hai tầng cùng ghi
    // là hàng chờ duyệt có hai dòng gần giống nhau cho cùng một câu.
    let daGhiFactDuAn = false;

    // FR-195: chép một fact sang kho dự án nếu tin có gắn dự án và khoá đó là
    // chuyện của cả dự án. Việc phụ: hỏng thì ghi sổ rồi đi tiếp.
    const chepSangDuAn = async (khoa: string, giaTri: string): Promise<void> => {
      if (!KHOA_DU_AN.has(khoa) || !giaTri?.trim()) return;
      const lid = pendingReq?.listing_id ?? sellerRow.active_listing_id ?? null;
      if (!lid) return;
      const { data: l } = await client.from("listings").select("project_id").eq("id", lid).maybeSingle();
      // Kho CHƯA CÓ dự án đó thì vẫn ghi nhận, kèm tên khách nhắc (20260910h) —
      // chủ dự án 10/09: "người ta chat dự án mà không có trong chỗ mình có cũng
      // ghi nhận được đúng ko". Admin thêm dự án vào kho rồi gật sau.
      let tenNhac: string | null = null;
      if (!l?.project_id) {
        const { data: fDuAn } = await client.from("listing_facts")
          .select("answer").eq("listing_id", lid).eq("question", "du_an_ten")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        // Tên ĐÃ NHỚ của chính tin này đứng TRƯỚC tên đoán từ câu vừa nhắn: câu
        // đang nói về phí, tiện ích thì chữ sau "dự án/khu" trong đó phần nhiều
        // là miêu tả, còn tên nhớ từ câu rao là tên chủ nhà tự gõ ra.
        tenNhac = duAnNoi[0]?.name ?? fDuAn?.answer ?? tenDuAnTrongCau(text) ?? null;
        if (!tenNhac) return;
      }
      // Cắt về MỆNH ĐỀ ĐẦU: "phí quản lý 14 nghìn/m2, khu có công viên ven sông"
      // mang hai thông tin, nhưng ô phí quản lý chỉ nên giữ phần phí — admin duyệt
      // đọc một dòng gọn thì gật nhanh, đọc cả câu thì phải tự cắt bằng mắt.
      const gonGon = giaTri.split(/[,;\n]/)[0].trim() || giaTri.trim();
      const { error } = await client.rpc("ghi_fact_du_an", {
        p_project_id: l?.project_id ?? null, p_khoa: khoa, p_gia_tri: gonGon,
        p_nguon: "seller_chat", p_listing_id: lid, p_conversation_id: convSId ?? null,
        p_ten_du_an: tenNhac,
      });
      if (error) await ghiLoi(client, "chat-reply ghi_fact_du_an", error.message);
      else daGhiFactDuAn = true;
    };

    // FR-199: LƯỚI VÉT bằng model, đứng SAU tầng tiền định.
    //
    // Chủ dự án 10/09: "ủa cái nào cũng phải viết hàm như này chứ ko dùng ai tự
    // bóc tách ra specs rồi viết vào dc hả" → "lắp đi". Được dùng model ở ĐÂY
    // (mà không được dùng cho giá / diện tích / phường) vì thứ bóc ra chỉ vào
    // `project_facts` ở trạng thái CHỜ DUYỆT — model bịa thì chết ở hàng chờ,
    // không chết trong rổ hàng.
    //
    // Ba cái van cho khỏi đốt tiền: chỉ chạy khi tầng tiền định KHÔNG ghi được
    // gì; chỉ khi câu có mùi dự án (`coMuiDuAn`); và chỉ một lượt mỗi tin.
    let daVetDuAn = false;
    // FR-208: lượt AI bóc tách chạy bóng (khởi động sau khi biết câu đang hỏi).
    let bongAi: Promise<{ truong: DeXuat[]; kienThuc: string[]; traLoi?: { co_tra_loi: boolean; gia_tri: string | null; trich_dan: string | null } | null; capNhat?: CapNhatDeXuat[]; xacNhan?: GoiYXacNhan[]; hoiLai?: { co_hoi: boolean; cau_hoi: string | null; chu_de: string | null } | null; camXuc?: { muc?: string | null; trich_dan?: string | null } | null; khongCanHoi?: Array<{ khoa?: string; ly_do?: string; trich_dan?: string }>; yDinh?: { loai?: string | null; trich_dan?: string | null } | null; vai?: { la?: string | null; trich_dan?: string | null } | null; tuXung?: { la?: string | null; trich_dan?: string | null } | null; cauKe?: { khoa?: string | null; ly_do?: string | null } | null; canKhac?: boolean | null; ket: unknown; usage: unknown; ms: number; cauDangHoi: string | null; cheDo: string } | null> | null = null;
    // SRS-5.1zf: lượt AI NHỎ đọc ý của lượt (gật / không / bảo đăng), song song với bóc tách — `_shared/ai/doc-y-luot.ts`.
    let yLuotAi: Promise<YLuotLLM | undefined> | null = null;
    // Công tắc `app_config.boc_tach_ai` đọc MỘT lần, tách khỏi lượt model để đường ra biết
    // phải chờ (chế độ `ghi`) hay chạy nền (chế độ `bong`) mà không đợi model xong.
    let cheDoBocAi: Promise<string> | null = null;
    // Chế độ `ai` (01/10/2026, chủ dự án: "bỏ luật, dùng AI bóc tách"): đi chung đường `chinh` (`cheDoBocAi` trả "chinh")
    // nhưng máy chỉ chặn bịa (`datKiemNhe`), AI chuẩn hoá đồng nghĩa / gõ sai, luật thôi đỡ khoá AI biết khi AI im.
    let laCheDoAi = false;
    // 01/10/2026 (chủ dự án: "sửa từ cái gốc nguyên nhân"): khách có HỎI LẠI bên mình không, hỏi chủ đề gì — AI đọc theo
    // nghĩa (`hoi_lai`), thay ba bộ từ khoá (`laCauHoiTron`, `hoiVeTin`, `dapHoiNguocTienDinh`) vốn thiếu cách nói mới và
    // đụng chữ khi bỏ dấu. `undefined` = không ở chế độ `ai` / AI không chạy → nơi gọi giữ luật cũ làm lưới đỡ.
    // Câu khách hỏi mà hệ thống KHÔNG có dữ liệu để trả lời (giá khu vực; chính sách dịch vụ ngoài phí / ảnh): không để model tự
    // trả lời (bắn thử v312: model hứa "kiểm tra rồi nhắn lại", tự khẳng định "không độc quyền"). Nói thật + chuyển cho người
    // phụ trách (reminder `escalation`, một lần / 24 giờ / câu) — lời "em nhờ anh chị phụ trách" có việc thật đi kèm.
    const dapChuaCoDuLieu = async (cau: string, chuDe: string | null | undefined): Promise<string | null> => {
      if (chuDe !== "thi_truong" && chuDe !== "dich_vu") return null;
      const dau = `❓ Zalo …${externalUserId.slice(-4)} hỏi`;
      const cauSach = thayLienHe(cau, "[liên hệ]").slice(0, 160);
      const { count, error: cErr } = await client.from("reminders").select("id", { count: "exact", head: true })
        .eq("kind", "escalation").in("status", ["pending", "sent"])
        .ilike("note", `${dau}%${cauSach.slice(0, 40).replace(/[%_\\]/g, "")}%`)
        .gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString());
      if (cErr) await ghiLoi(client, "chat-reply hoi chua co du lieu(dem)", cErr.message);
      if (!cErr && (count ?? 0) === 0) {
        // KHÔNG gắn `seller_id`: dòng việc có seller_id là tin GỬI CHỦ NHÀ (FR-144) — đây là tin cho người phụ trách.
        const { error: rErr } = await client.from("reminders").insert({
          kind: "escalation", due_at: new Date().toISOString(),
          listing_id: pendingReq?.listing_id ?? sellerRow.active_listing_id ?? null,
          note: `${dau}: "${cauSach}" — câu ${chuDe === "thi_truong" ? "thị trường" : "về dịch vụ"} bot không có dữ liệu để trả lời, nhắn lại khách giúp.`,
        });
        if (rErr) await ghiLoi(client, "chat-reply hoi chua co du lieu(ghi)", rErr.message);
      }
      return chuDe === "thi_truong"
        ? `Dạ chuyện thị trường khu này bên em chưa có số liệu giao dịch đủ chắc để nói với ${cachGoi}, em không dám nói bừa. Em đã nhờ anh chị phụ trách xem giúp rồi nhắn lại mình nha.`
        : `Dạ câu này em nhờ anh chị phụ trách trả lời chính xác cho ${cachGoi} nha, em không dám nói sai.`;
    };
    const hoiLaiAi = async (tinKiem: string): Promise<HoiLaiDoc | null | undefined> => {
      if (!bongAi) return undefined;
      const k = await bongAi;
      if (!laCheDoAi || !k?.ket) return undefined;
      const coDuLieu = k.truong.length > 0 || k.kienThuc.length > 0 || !!k.traLoi?.co_tra_loi || (k.capNhat?.length ?? 0) > 0;
      // SRS-5.1zzo: khách TỰ NÓI VAI trong tin (qua `docVai`) → câu đó là lời tự giới thiệu, không phải câu hỏi về bot.
      return docHoiLai(k.hoiLai, tinKiem, coDuLieu, !!docVai(k.vai, tinKiem));
    };
    // 01/10/2026 (chủ dự án: "nó có nhận ra cảm xúc của khách để báo về admin ko" → "sửa cả 4 đi"): AI đọc giọng chủ nhà
    // (`cam_xuc`, đọc theo nghĩa, có ngữ cảnh), code kiểm trích dẫn (`docCamXuc`). Bực / nghi ngờ / muốn dừng → việc
    // `escalation` cho người phụ trách (một lần / 24 giờ / người). Bực thì thôi hỏi lượt này (nhánh hoãn).
    let camXucDaXet = false;
    let camXucLuot: ReturnType<typeof docCamXuc> = null;
    // SRS-5.1zk (03/10/2026, chủ dự án: "mấy hàm sql ngu quá thay bằng AI tự ghi đi"): chế độ `ai` — tên đường AI đọc
    // (`ten_duong`, có trích dẫn) ghi thẳng cột `street`, thay cho `boc_ten_duong()` đoán từ chữ địa chỉ. Ghi ở `traLoiSeller`
    // (sau khi fact vị trí đã vào cột), chỉ khi tên đó nằm trong địa chỉ đã ghi.
    let duongAiGhi: { id: string; ten: string } | null = null;
    const camXucAi = async (): Promise<ReturnType<typeof docCamXuc>> => {
      if (camXucDaXet) return camXucLuot;
      if (!bongAi) return null; // chưa tới chỗ gọi AI (đường ra sớm) — không đánh dấu đã xét
      camXucDaXet = true;
      const k = await bongAi;
      if (!laCheDoAi || !k?.ket) return null;
      camXucLuot = docCamXuc(k.camXuc, textTreo || text);
      if (!camXucLuot) return null;
      // Một lần / 24 giờ / người / MỨC: bực rồi nghi ngờ là hai chuyện, người phụ trách cần biết cả hai.
      const nhan = camXucLuot.muc === "buc" ? "có vẻ bực" : camXucLuot.muc === "nghi_ngo" ? "đang nghi ngờ bên mình" : "muốn dừng";
      const dau = `😟 Zalo …${externalUserId.slice(-4)} ${nhan}`;
      const { count, error: cErr } = await client.from("reminders").select("id", { count: "exact", head: true })
        .eq("kind", "escalation").ilike("note", `${dau}%`)
        .gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString());
      if (cErr) await ghiLoi(client, "chat-reply cam xuc(dem)", cErr.message);
      if (!cErr && (count ?? 0) === 0) {
        // KHÔNG gắn `seller_id`: dòng việc có seller_id là tin GỬI CHỦ NHÀ (FR-144) — đây là tin cho người phụ trách.
        const { error: rErr } = await client.from("reminders").insert({
          kind: "escalation", due_at: new Date().toISOString(),
          listing_id: pendingReq?.listing_id ?? sellerRow.active_listing_id ?? null,
          note: `${dau}: "${thayLienHe(camXucLuot.trich, "[liên hệ]").slice(0, 120)}" — anh chị phụ trách xem lại cuộc chat, nhắn khách giúp.`,
        });
        if (rErr) await ghiLoi(client, "chat-reply cam xuc(ghi)", rErr.message);
        if (convSId && (camXucLuot.muc === "buc" || camXucLuot.muc === "muon_dung")) {
          await client.from("conversations").update({
            needs_human: true,
            needs_human_at: new Date().toISOString(),
          }).eq("id", convSId);
        }
      }
      return camXucLuot;
    };
    // SRS-5.1zzzzv: MỘT chỗ quyết câu lệnh model nói gì về câu hỏi ngược / lời trấn an — r1 (câu rao), r2 / r2b (câu treo), r3 (chăm sóc)
    // cùng gọi. AI đọc ra nghi ngờ → bong bóng trấn an tiền định ở `traLoiSeller` là chủ của lời trấn an, model không nói lại (kể cả
    // khi khách không hỏi thành câu). Không nghi ngờ → dặn trả lời câu hỏi ngược như cũ (`danTraLoiHoiNguoc`).
    const DAN_DA_TRAN_AN = `Chủ nhà đang nghi ngờ bên em — hệ thống GỬI TRƯỚC tin em một bong bóng trấn an (bên em không thu đồng nào trước, phí chỉ thu khi giao dịch thành công, đã báo người phụ trách nhắn lại). Em KHÔNG nói lại các ý đó, không trấn an thêm, không nhắc phí; chỉ đáp ngắn rồi đi tiếp. `;
    const danHoiNguocLuot = async (hoi: { cau: string; chuDe: string | null | undefined } | null): Promise<string> =>
      (await camXucAi())?.muc === "nghi_ngo" ? DAN_DA_TRAN_AN : hoi ? danTraLoiHoiNguoc(hoi.cau, hoi.chuDe) : "";
    // Đợt 2 chuyển luật sang AI (02/10/2026): ý định của tin (đã bán / ngưng rao / rao lại / hoãn) và vai người rao tự nói (chính
    // chủ / môi giới) — AI đọc theo nghĩa, code kiểm trích dẫn. `undefined` = AI không chạy (từ khoá đỡ như cũ); null = AI nói
    // không có. Bắn thử lx-cx-14: "mấy bên môi giới hối chị gấp gấp rồi lừa" từng báo admin đổi nhãn MÔI GIỚI (từ khoá "môi giới").
    const yDinhAi = async (): Promise<ReturnType<typeof docYDinh> | undefined> => {
      if (!bongAi) return undefined;
      const k = await bongAi;
      if (!laCheDoAi || !k?.ket) return undefined;
      const yd = docYDinh(k.yDinh, textTreo || text);
      // SRS-5.1zzu (bắn lại thu-ai-0610): "ok đăng đi" khi bot đang hỏi gấp → Haiku `binh_thuong` → bot lờ, hỏi tiếp phòng ngủ. CẢ
      // TIN chỉ là câu lệnh đăng mà AI nói không có ý định nào → luật chắc (tiền lệ "cả tin chỉ là một số tiền"); câu có thêm ý
      // thì vẫn theo AI. Prompt Ý ĐỊNH cũng đã nói rõ "bảo đăng lúc nào cũng là du_roi" — lưới này chỉ đỡ khi model vẫn trượt.
      if (!yd && laChiLenhDang(textTreo || text)) return { loai: "du_roi", trich: (textTreo || text).trim() };
      return yd;
    };
    /**
     * 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): kết quả AI của lượt, đã qua kiểm bằng chứng — `undefined` = AI không chạy
     * (công tắc không phải `ai`, model lỗi). Chỗ nào còn đọc nghĩa câu bằng regex thì hỏi hàm này trước.
     */
    let aiLuotNho: Promise<AiChinh | undefined> | null = null;
    const aiLuot = (): Promise<AiChinh | undefined> => aiLuotNho ??= (async () => {
      if (!bongAi) return undefined;
      const k = await bongAi;
      if (!laCheDoAi || !k?.ket) return undefined;
      const chinh = docAiChinh(kiemDeXuat(k.truong, textTreo || textBongAi).dat, null);
      // SRS-5.1zzzzzza: lời SỬA một ô đang ghi ("Điều chỉnh giá 6,950 tỷ") model đưa qua `cap_nhat` (FR-226) — kiểm rồi gộp vào `ghi` như
      // đường câu treo, để nhánh duyệt / lời sửa cũng thấy. Ô đang hỏi thì để đường trả lời câu treo lo.
      const cn = kiemCapNhat(k.capNhat ?? [], textTreo || textBongAi, dangGhiCua(pendingReq?.listings))
        .filter((c) => !(pendingReq && c.question === pendingReq.question));
      if (!cn.length) return chinh;
      return { ...chinh, ghi: [...chinh.ghi.filter((g) => !cn.some((c) => c.question === g.question)), ...cn.map((c) => ({ ...c, khoa: "cap_nhat" }))] };
    })();
    const vaiAi = async (): Promise<ReturnType<typeof docVai> | undefined> => {
      if (!bongAi) return undefined;
      const k = await bongAi;
      if (!laCheDoAi || !k?.ket) return undefined;
      return docVai(k.vai, textTreo || textBongAi);
    };
    /**
     * Đợt 1 bỏ luật từ khoá (02/10/2026, SRS-5.1zf): GẬT / không đồng ý / bảo đăng do AI đọc (có trích dẫn, `docDongY`).
     * `undefined` = AI không chạy → nơi gọi dùng luật (`laDongY`, `laBaoDang`) làm lưới đỡ.
     */
    const dongYAi = async (): Promise<ReturnType<typeof docDongY> | undefined> => {
      if (!yLuotAi) return undefined;
      const k = await yLuotAi;
      if (!laCheDoAi || k?.dongY === undefined) return undefined;
      // SRS-5.1zzzzzzz4 (Zalo thật 14/10/2026): "đăng giúp chị theo nội dung này nhé" khi nội dung CHƯA gửi — AI đọc cả gật-đăng lẫn
      // "báo nội dung sắp gửi". Hai ý đó trái nhau; báo sắp gửi thắng: chưa có nội dung thì chưa có gì để gật. Một chỗ quyết cho mọi
      // nơi hỏi gật / bảo đăng (gatLuot, baoDangLuot, gatKemNoiThem).
      const yc = k?.yeuCau !== undefined ? docYeuCau(k.yeuCau, textTreo || text) : null;
      if (yc?.loai === "gui_noi_dung_sau") return null;
      return docDongY(k.dongY, textTreo || text);
    };
    /**
     * Đợt 3 bỏ luật từ khoá (02/10/2026, SRS-5.1zg): chủ nhà HỎI về tin / XIN gì (bao lâu bán, số khách, xoá dữ liệu, bỏ ô) — AI
     * đọc (có trích dẫn, `docYeuCau`). `undefined` = AI không chạy → nơi gọi dùng luật (`hoiVeTin`, `laXin…`) làm lưới đỡ.
     */
    const yeuCauAi = async () => {
      if (!yLuotAi) return undefined;
      const k = await yLuotAi;
      if (!laCheDoAi || k?.yeuCau === undefined) return undefined;
      return docYeuCau(k.yeuCau, textTreo || text);
    };
    /** Gật: AI trước; `luat` chỉ chạy khi AI không chạy. */
    /** SRS-5.1zzl: ý NGƯNG NHIỀU CĂN / CHỈ GIỮ (doc-y-luot). undefined = AI không chạy (luật đỡ); null = AI nói không có ý này. */
    const ngungHangLoatAi = async () => {
      if (!yLuotAi) return undefined;
      const k = await yLuotAi;
      if (!laCheDoAi || k?.ngungHangLoat === undefined) return undefined;
      return docNgungHangLoat(k.ngungHangLoat, textTreo || text);
    };
    /** SRS-5.1zzzzz: chủ nhà KHÔNG BIẾT điều bot vừa hỏi (doc-y-luot, trích dẫn đã kiểm). undefined = AI không chạy; null = không có. */
    const khongBietAi = async (): Promise<string | null | undefined> => {
      if (!yLuotAi) return undefined;
      const k = await yLuotAi;
      if (!laCheDoAi || k?.khongBiet === undefined) return undefined;
      return docKhongBiet(k.khongBiet, textTreo || text);
    };
    const gatLuot = async (luat: () => boolean): Promise<boolean> => {
      const d = await dongYAi();
      return d !== undefined ? d?.la === "dong_y" : luat();
    };
    /** Bảo đăng: AI trước; `luat` chỉ chạy khi AI không chạy. */
    const baoDangLuot = async (luat: () => boolean): Promise<boolean> => {
      const d = await dongYAi();
      return d !== undefined ? !!d?.dangDi : luat();
    };
    /**
     * Gật kèm nói thêm ("đúng rồi em, phường 2 quận 5"): AI quyết có gật; CẢ tin chỉ là gật khi AI không đọc ra dữ liệu nào
     * (ô / kiến thức); phần sau cụm gật AI trích là phần còn lại. `undefined` = AI không chạy (nơi gọi cắt vế bằng luật).
     */
    const gatTach = async (cau: string): Promise<{ gat: boolean; ca: boolean; conLai: string } | undefined> => {
      const d = await dongYAi();
      if (d === undefined) return undefined;
      if (d?.la !== "dong_y") return { gat: false, ca: false, conLai: cau };
      const k = await bongAi;
      const coDuLieu = !!k && ((k.truong?.length ?? 0) > 0 || (k.kienThuc?.length ?? 0) > 0);
      const i = d.trich ? cau.indexOf(d.trich) : -1;
      const conLai = i >= 0 ? cau.slice(i + d.trich.length).replace(/^[\s,;.!?]+/u, "").replace(/^(?:mà|ma|nhưng|nhung|và|va|với|voi)\s+/iu, "").trim() : "";
      return { gat: true, ca: !coDuLieu, conLai: conLai || cau };
    };
    /** SRS-5.1zb: AI nói tin rao / tả căn KHÁC căn đang hỏi — `undefined` = AI không chạy hoặc không nói (luật quyết). */
    const canKhacLuot = async (): Promise<boolean | undefined> => {
      if (!bongAi) return undefined;
      const k = await bongAi;
      if (!laCheDoAi || !k?.ket || typeof k.canKhac !== "boolean") return undefined;
      return k.canKhac;
    };
    /**
     * SRS-5.1zh: tin này có Ý RAO (bán / cho thuê một căn) không — AI đọc: đề xuất `loai_giao_dich` / `loai_bds` (đã qua kiểm trích
     * dẫn ở `bongAi`) hoặc `can_khac`. `undefined` = AI không chạy → nơi gọi dùng từ khoá.
     */
    const aiDocRaoLuot = async (): Promise<boolean | undefined> => {
      if (!bongAi) return undefined;
      const k = await bongAi;
      if (!laCheDoAi || !k?.ket) return undefined;
      return k.canKhac === true || k.truong.some((t) => t.khoa === "loai_giao_dich" || t.khoa === "loai_bds");
    };
    /** Đợt 3: câu kế AI chọn, chỉ khi nằm trong `hopLe`; null = AI không chạy / không chọn / chọn ngoài danh sách → luật chọn. */
    const cauKeAi = async (hopLe: Iterable<string>): Promise<string | null> => {
      if (!bongAi) return null;
      const k = await bongAi;
      if (!laCheDoAi || !k?.ket) return null;
      return docCauKe(k.cauKe, hopLe);
    };
    // 01/10/2026 (bắn thử lx-tt-08: "Nhà phố hẻm sâu…" — chủ không nói hẻm sâu): AI liệt kê câu NHẬN XÉT trong lời bot kèm căn cứ
    // chép từ lời chủ nhà (`soatNhanXetBangModel`), code kiểm căn cứ (`nhanXetKhongCanCu`) rồi bỏ câu không căn cứ — câu hỏi
    // giữ nguyên. Chế độ `ai` mới chạy (một lượt model nhỏ); AI hỏng thì lưới danh sách cũ vẫn chạy sau.
    // SRS-5.1zzzzp: lượt AI soát nhận xét vừa chạy XONG cho lời đang xét → danh sách từ khoá cũ (boKhenKhongCanCu /
    // boMenhDeKhenSai) chỉ còn soát số đo / kết cấu bịa (so số, tất định); phần "khen theo từ khoá" là lưới đỡ khi AI hỏng.
    let nhanXetAiXong = false;
    /**
     * SRS-5.1zzzzzc (khách mô phỏng lần năm: bot hỏi lại điều khách vừa nói, khách "chị vừa nói rồi mà … chị muốn đăng tin mau" → bot "em hỏi
     * dồn quá. Lúc nào chị rảnh nhắn em" — đẩy khách đi đúng lúc khách muốn làm tiếp). BỰC không phải HOÃN: khách bực mà tin vẫn mang dữ liệu
     * (AI đọc ra ô / câu trả lời), có câu hỏi cho em, hay bảo đăng (`du_roi`) là khách muốn làm tiếp — đi đường thường. MỘT chỗ quyết cho mọi
     * nhánh đổi bực thành hoãn (câu treo và không câu treo).
     */
    const bucMaLamTiep = async (yd: { loai?: string | null } | null | undefined): Promise<boolean> => {
      const k = bongAi ? await bongAi : null;
      return !!k?.ket && (!!k.truong?.length || !!k.traLoi?.co_tra_loi || !!k.hoiLai?.co_hoi || yd?.loai === "du_roi");
    };
    // SRS-5.1zzzzzc: dòng khối DỰ ÁN của lượt (kho đã xác thực) — cũng là NGUỒN hợp lệ cho lời bot ("Theo em biết, dự án X có hồ bơi"),
    // TONE_RULES cho phép nói theo khối đó nên lượt soát phải thấy nó, không thì câu đúng nguồn bị bỏ.
    let duAnNguon = "";
    const soatNhanXet = async (loi: string | null, bangChung: string, daGhi = ""): Promise<string | null> => {
      nhanXetAiXong = false;
      if (!loi || !anthropicS || !laCheDoAi) return loi;
      // SRS-5.1zzzzzzz: lời không có khẳng định nào để soát (dạ / ghi nhận + một câu hỏi mở) → bỏ lượt AI soát (~1,5 s); lưới code vẫn chạy.
      if (loiKhongCanSoat(loi)) return loi;
      try {
        // SRS-5.1zzzzzb: căn cứ hợp lệ có BA nguồn — lời chủ nhà, đã ghi, dữ liệu tra (cùng khối model đã thấy khi viết, `duLieuTra`).
        const tra = [await duLieuTra(), duAnNguon].filter(Boolean).join("\n");
        // SRS-5.1zzzzze (khách mô phỏng lần bảy: "phí 1% lấy từ bên bán hay bên mua?" — model trả lời đúng "lấy từ bên bán, bên mua miễn
        // phí", lượt soát bỏ cả câu vì chính sách phí không nằm trong nguồn nào, khách nhận "Vâng ạ." cụt hai lần). Chính sách thật của
        // bên em (luật phí model được dặn) là nguồn hợp lệ — cùng một bản với bản model đã thấy khi viết.
        // SRS-5.1zzzzzf: sổ ghi của lượt (cùng nguồn với dòng EM VỪA GHI của câu lệnh) — căn cứ duy nhất cho câu "em ghi X rồi".
        // (Lượt 5.1zzzzze merge thiếu đối số FEES ở đây — lượt soát không thấy luật phí; nay e2e ZZZZZE-01 soi câu lệnh soát.)
        const vuaGhi = [...ghiLuot.filter((g) => g.doi && g.question !== "nhan" && g.question !== "kien_thuc")
          .map((g) => `${(FACT_LABELS[g.question] ?? g.question).replace(/\s*\(.*\)\s*$/, "")}: ${g.ghi}`), ...(quanGhiLuot ? [quanGhiLuot] : [])].join("\n");
        const { nhanXet, usage } = await soatNhanXetBangModel(anthropicS as unknown as Parameters<typeof soatNhanXetBangModel>[0], MODEL, loi, bangChung, daGhi, "chu_nha", tra, FEES, vuaGhi);
        nhanXetAiXong = true;
        await doTien(client, usage as Parameters<typeof doTien>[1]);
        for (const n of nhanXet) if (n.noi_trang_thai_tin === true && n.cau?.trim() && !/\?/.test(n.cau)) aiNoiTrangThai.push(n.cau.trim());
        for (const n of nhanXet) if (n.noi_chua_len_ke === true && n.cau?.trim() && !/\?/.test(n.cau)) aiNoiChuaLenKe.push(n.cau.trim());
        const nguon = `${bangChung}\n${daGhi}\n${tra}\n${FEES}`;
        const bo = nhanXetKhongCanCu(nhanXet, nguon, vuaGhi);
        const boHoi = cauHoiGoiYKhongNguon(nhanXet, nguon);
        if (!bo.length && !boHoi.length) return loi;
        console.log("chat-reply: bo khang dinh khong nguon", [...bo, ...boHoi].join(" | "));
        const sach = bo.length ? boCauNhanXet(loi, bo) : loi;
        return boHoi.length ? boCauHoiGoiY(sach, boHoi) : sach;
      } catch (e) {
        await ghiLoi(client, "chat-reply soat nhan xet", e);
        return loi;
      }
    };
    /**
     * SRS-5.1zzzzzl (chủ dự án 13/10: "Tin nháp phải có khen nữa" — chọn "AI viết, có soát"): câu khen dưới bản nháp. AI viết trên CHÍNH
     * bản tin vừa dựng, code kiểm cụm dựa vào + số (`khenHopLe`), rồi lượt soát nhận xét đọc lại: soát bỏ bất kỳ vế nào, hay soát không
     * chạy được, thì bỏ cả câu khen. Chỉ chế độ `ai`; không có câu khen thay thế.
     */
    type KhenNhap = { khen: string | null; quyMo: string[]; tienIch: string[]; tienIchNoiBat: Array<{ goc: string; in: string }>; tieuDeAi: string | null };
    const khenChoNhap = async (banTin: string, yThem: string[] = []): Promise<KhenNhap> => {
      if (!anthropicS || !laCheDoAi) return { khen: null, quyMo: [], tienIch: [], tienIchNoiBat: [], tieuDeAi: null };
      try {
        const kq = await vietKhenNhapBangModel(anthropicS as unknown as Parameters<typeof vietKhenNhapBangModel>[0], MODEL, banTin, cachGoi, yThem);
        await doTien(client, kq.usage as Parameters<typeof doTien>[1]);
        // SRS-5.1zzzzzn: ý AI xếp vào "Quy mô" chỉ nhận khi có đúng trong danh sách ý thêm (tin-nhap.ts so lại lần nữa khi in).
        // SRS-5.1zzzzzo: so lỏng (`chuanY`: bỏ dấu, bỏ "có" đầu) — AI hay chép thiếu chữ "có"; trả lại đúng chữ ý thêm gốc.
        const khopY = (ds: string[]) => yThem.filter((y) => ds.some((q) => chuanY(q) === chuanY(y)));
        const quyMo = khopY(kq.quyMo);
        // SRS-5.1zzzzzz: tiện ích AI chọn lọc để khoe (≤ 4, chữ gọn) — code kiểm từng ý; ý được chọn cũng là tiện ích.
        const tienIchNoiBat = tienIchNoiBatHopLe(kq.tienIchNoiBat, yThem.filter((y) => !quyMo.includes(y)));
        const tienIch = [...new Set([...khopY(kq.tienIch), ...tienIchNoiBat.map((x) => x.goc)])].filter((y) => !quyMo.includes(y));
        // SRS-5.1zzzzzr: tiêu đề AI qua kiểm số + chữ cấm; không qua thì tiêu đề máy.
        const tieuDeAi = tieuDeHopLe(kq.tieuDe, banTin);
        const k = khenHopLe(kq.khen, kq.duaTren, banTin);
        if (!k) return { khen: null, quyMo, tienIch, tienIchNoiBat, tieuDeAi };
        const loiChu = [...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? ""), text].join("\n");
        const sach = await soatNhanXet(k, loiChu, banTin);
        return { khen: nhanXetAiXong && sach === k ? k : null, quyMo, tienIch, tienIchNoiBat, tieuDeAi };
      } catch (e) {
        await ghiLoi(client, "chat-reply khen ban nhap", e);
        return { khen: null, quyMo: [], tienIch: [], tienIchNoiBat: [], tieuDeAi: null };
      }
    };
    // 01/10/2026 (chủ dự án: "câu hỏi riêng cho từng loại bds … cần AI hiểu"): câu trong bảng theo loại mà AI thấy KHÔNG áp dụng cho
    // căn này (kèm trích dẫn lời chủ nhà, `docKhongCanHoi`) → cất `boc_tach.khong_hoi`; câu kế và vòng hỏi bù bỏ qua.
    const khongHoiAi = async (listingId: string, bocTachCu: unknown, conHoi: string[]): Promise<Set<string>> => {
      const cu = new Set<string>(((bocTachCu as { khong_hoi?: unknown } | null)?.khong_hoi as string[] | undefined) ?? []);
      // SRS-5.1zzzzz: ô chủ nhà đã nói không biết cũng không hỏi nữa (danh sách riêng — `docKhongCanHoi` không cho bỏ câu lõi).
      const khongBiet = khongBietCua(bocTachCu);
      if (!bongAi) return new Set([...cu, ...khongBiet]);
      const k = await bongAi;
      if (!laCheDoAi || !k?.ket || !k.khongCanHoi?.length) return new Set([...cu, ...khongBiet]);
      const loiChu = [...lichSuRows.filter((m) => laTinNguoi(m.sender)).slice(-6).map((m) => m.body ?? ""), text].join("\n");
      const moi = docKhongCanHoi(k.khongCanHoi, loiChu, conHoi).filter((x) => !cu.has(x.khoa));
      if (!moi.length) return new Set([...cu, ...khongBiet]);
      for (const x of moi) cu.add(x.khoa);
      console.log("chat-reply: AI bo cau khong ap dung", moi.map((x) => `${x.khoa} («${x.trich}»)`).join(", "));
      const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { khong_hoi: [...cu] } });
      if (error) await ghiLoi(client, "chat-reply ghi_boc_tach(khong hoi)", error.message);
      return new Set([...cu, ...khongBiet]);
    };
    /** SRS-5.1zzzzz: ghi ô chủ nhà nói không biết vào `boc_tach.khong_biet` (cộng dồn). */
    const ghiKhongBiet = async (listingId: string, bocTachCu: unknown, khoa: string) => {
      const ds = [...new Set([...khongBietCua(bocTachCu), khoa])];
      const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { khong_biet: ds } });
      if (error) await ghiLoi(client, "chat-reply ghi_boc_tach(khong biet)", error.message);
    };
    /** SRS-5.1zzzzc: quận tin đã biết CHẮC (không phải cờ quận mặc định) — ngữ cảnh cho kiểm bằng chứng phường số cũ. */
    const quanChacCua = (l: { district?: string | null; boc_tach?: unknown } | null | undefined): string | null =>
      l?.district && (l.boc_tach as { quan_mac_dinh?: unknown } | null | undefined)?.quan_mac_dinh !== true ? String(l.district) : null;
    // FR-226: ô chữ AI đã GỘP / SỬA lượt này (đã qua `kiemCapNhat`) — đường ra không ghi lại mẩu đó làm "bổ sung".
    let capNhatLuot: Array<{ question: string; answer: string }> = [];
    // Địa chỉ luật vừa ghép số nhà lượt này ("45 Ngô Y Linh") — kiến thức AI "số 45" không vào bổ sung.
    let soNhaGhep: string | null = null;
    // FR-208 bước 2 (17/09/2026): chế độ `ghi` — trường AI đọc ra, qua kiểm bằng chứng +
    // kiểm khoảng (`chonDeGhi`), mà luật tiền định KHÔNG ghi và tin còn trống → ghi fact
    // nguồn `ai_kiem`, trả dòng 🤖 để gắn sau 💾. Chế độ `bong` chỉ ghi sổ đo, trả null.
    const ghiBongBocTach = async (extra: Record<string, unknown>): Promise<string | null> => {
      if (!bongAi) return null;
      const kq = await bongAi;
      bongAi = null;
      if (!kq) return null;
      try {
        await doTien(client, kq.usage as Parameters<typeof doTien>[1]);
        // Tin nào: như 💾 — mã vừa tạo lượt này > active_listing_id đọc lại.
        const ma = typeof extra.listing_code === "string" && extra.listing_code ? extra.listing_code : null;
        const { data: sNow } = await client.from("sellers").select("active_listing_id").eq("id", sellerRow.id).maybeSingle();
        const lid = (sNow as { active_listing_id?: string | null } | null)?.active_listing_id ?? null;
        const chon = client.from("listings")
          .select("id, deal, property_type, price_vnd, price_per_m2_vnd, area_m2, frontage_m, length_m, rear_width_m, alley_width_m, distance_to_street_m, bedrooms, bathrooms, floors, floor, district, ward, street, unit_code, direction, legal_status, gap, negotiable, rent_income_vnd, floors_text, access_type, nhan, boc_tach, projects(name)")
          .eq("seller_id", sellerRow.id);
        const { data: dong, error: dErr } = await (ma ? chon.eq("code", ma) : lid ? chon.eq("id", lid) : chon.order("created_at", { ascending: false }))
          .limit(1).maybeSingle();
        if (dErr) await ghiLoi(client, "chat-reply boc_tach_bong(listings)", dErr.message);
        const d = (dong ?? null) as (DongDb & { id: string }) | null;
        const facts: Record<string, string> = {};
        if (d) {
          const { data: fs } = await client.from("listing_facts").select("question, answer")
            .eq("listing_id", d.id).order("created_at", { ascending: true }).limit(80);
          for (const f of (fs ?? []) as Array<{ question: string; answer: string | null }>) if (f.answer) facts[f.question] = f.answer;
        }
        // SRS-5.1zzzzc: quận tin đã biết chắc → kiểm bằng chứng đối chiếu được "phường 13" (tên cũ dạng số) với phường mới AI đổi.
        const { dat, bo } = kiemDeXuat(kq.truong, text, { quan: quanChacCua(d), cauDangHoi: kq.cauDangHoi });
        const soCan = (kq.ket as { so_can?: number } | null)?.so_can ?? null;
        const soSanh = soSanhVoiDb(dat, d, facts);
        // Chế độ `ghi`: chỉ khi tin xác định được và tin rao MỘT căn (nhiều căn: DB chỉ có một tin để so).
        const daGhi: Array<{ question: string; answer: string; khoa: string; goc?: string }> = [];
        let boGhi: unknown[] = [];
        // Kiến thức thêm (17/09/2026): ý khách nói về căn mà không có khoá → fact `bo_sung`, ra tin
        // vào dòng "📝 Thêm" của bản nháp (`soanTinNhap`).
        const kienThucGhi: string[] = [];
        if ((kq.cheDo === "ghi" || kq.cheDo === "chinh") && d && (soCan ?? 0) <= 1) {
          const chon = chonDeGhi(dat, soSanh, d, facts);
          boGhi = chon.bo;
          // 01/10/2026 (bắn thử lx-dd-51/53): phường AI đọc thuộc QUẬN KHÁC quận tin đang ghi chắc → không ghi ở đây; luồng
          // trả lời câu phường hỏi lại khách "nhà mình ở quận nào" (gợi ý `doi_quan`).
          const btD = (d as { boc_tach?: { quan_mac_dinh?: unknown; phuong_goi_y?: { doi_quan?: unknown } | null } | null }).boc_tach;
          const quanChac = d.district && btD?.quan_mac_dinh !== true ? String(d.district) : null;
          // Đang chờ khách trả lời "nhà mình ở quận Y hay Z" → phường / quận để luồng câu phường quyết (bắn thử lx-lq-61:
          // "tân phú em" → AI ghi "Phường Tân Phú").
          const choLechQuan = btD?.phuong_goi_y?.doi_quan === true;
          for (const g of chon.ghi) {
            if (choLechQuan && (g.question === "phuong" || g.question === "quan")) continue;
            // Bắn thử v310 (lx-lq-72): "bình thạnh mà em" (đang nói QUẬN) → AI ghi "Phường Bình Thạnh". Phường trùng tên quận
            // cũ mà khách không gõ chữ "phường" thì không ghi ở đây.
            const pcG = g.question === "phuong" ? phuongChuan(g.answer) : null;
            if (pcG && phuongTrungTenQuan(pcG.ten, pcG.quan_cu) && !coChuPhuong(text)) { console.log("chat-reply: phuong trung ten quan, khong ghi", g.answer); continue; }
            const qP = g.question === "phuong" && quanChac ? pcG?.quan_cu : null;
            if (qP && !cungQuan(qP, quanChac)) { console.log("chat-reply: phuong AI lech quan, de hoi lai", g.answer, qP, quanChac); continue; }
            const { error: gErr } = await ghiFact(client, {
              p_listing_id: d.id, p_question: g.question, p_answer: g.answer, p_source: NGUON_AI, goc: g.goc,
            });
            if (gErr) await ghiLoi(client, `chat-reply ghi_fact_listing(ai_kiem ${g.question})`, gErr.message);
            else daGhi.push(g);
          }
          // SRS-5.1zzv (bắn lại thu-ai-0610 13:56): "4x16, 1 trệt 2 lầu" khi câu treo là LOẠI nhà → nhánh đó trả lời sớm, chỉ đường
          // bóng này ghi; `chonDeGhi` không ghép ngang × dài (docAiChinh mới ghép) → kết cấu có, diện tích mất. Ngang và dài AI đọc
          // ra mà tin chưa có diện tích → ghi "AxB" (trigger nhân ra m², giữ hai chiều), cùng luật với docAiChinh.
          const ktB = kichThuoc(dat);
          if (ktB.ngang != null && ktB.dai != null && d.area_m2 == null && !facts.dien_tich && !facts.dien_tich_dat && !daGhi.some((g) => /^dien_tich/.test(g.question))) {
            const dtB = `${ktB.ngang}x${ktB.dai}`;
            const { error: dtErr } = await ghiFact(client, { p_listing_id: d.id, p_question: "dien_tich", p_answer: dtB, p_source: NGUON_AI });
            if (dtErr) await ghiLoi(client, "chat-reply ghi_fact_listing(ai_kiem dien_tich ngang x dai)", dtErr.message);
            else daGhi.push({ question: "dien_tich", answer: dtB, khoa: "ngang_x_dai" });
          } else if (ktB.dai != null && ktB.ngang == null && (d as { length_m?: number | null }).length_m == null && !daGhi.some((g) => g.question === "chieu_dai")) {
            // SRS-5.1zzzzzf: dài nói riêng (chưa có ngang) — cùng luật với docAiChinh, fact `chieu_dai` chỉ điền length_m.
            const { error: cdErr } = await ghiFact(client, { p_listing_id: d.id, p_question: "chieu_dai", p_answer: `dài ${ktB.dai}m`, p_source: NGUON_AI });
            if (cdErr) await ghiLoi(client, "chat-reply ghi_fact_listing(ai_kiem chieu_dai)", cdErr.message);
            else daGhi.push({ question: "chieu_dai", answer: `dài ${ktB.dai}m`, khoa: "dai" });
          }
          const { data: boSungCu } = await client.from("listing_facts").select("answer")
            .eq("listing_id", d.id).eq("question", "bo_sung").limit(40);
          const daCoBoSung = new Set(((boSungCu ?? []) as Array<{ answer: string | null }>).map((x) => boDau((x.answer ?? "").trim())));
          // Ý luật ĐÃ ghi vào một ô (tiện ích gần, hiện trạng…) không thành "bổ sung" lần hai.
          // 21/09/2026 (e2e AIBOC-08): fact NGẮN ("2" phòng ngủ) nằm trong mọi cụm có chữ số → "bàn giao quý 2
          // năm sau" bị coi là đã có. Chỉ so với fact ≥ 4 ký tự.
          const daCoTrongFact = (kt: string) => Object.values(facts).some((a) => a.trim().length >= 4 && (boDau(a).includes(boDau(kt)) || boDau(kt).includes(boDau(a))));
          // SRS-5.1zzzzy: ý chủ nhà đã xin bỏ khỏi dòng "Thêm" (`boc_tach.y_da_bo`) không ghi lại — cùng cửa với lượt chốt tin.
          const yDaBoB = ((d as { boc_tach?: { y_da_bo?: unknown } | null }).boc_tach?.y_da_bo as string[] | undefined) ?? [];
          for (const kt of boKeRieng(kiemKienThuc(kq.kienThuc ?? [], text, dat), yDaBoB)) {
            // 24/09/2026 (tin thật: "mới", "Quận 1 em ơi" vào "📝 Thêm"): mảnh rác không ghi.
            // 25/09/2026 (chủ dự án "ko ghi trùng"): mảnh chỉ nói lại điều ô có cấu trúc đã giữ ("xe hơi không vào
            // được" khi đã ghi hẻm 3m, "sân thượng" khi kết cấu đã có) → không ghi.
            const dx = d as unknown as { floors_text?: string | null; access_type?: string | null; alley_width_m?: number | null; legal_status?: string | null; nhan?: string[] | null };
            const ngCanh = { facts: { ...facts, ...Object.fromEntries(daGhi.map((g) => [g.question, g.answer])) }, floors_text: dx.floors_text, access_type: dx.access_type, alley_width_m: dx.alley_width_m, legal_status: dx.legal_status,
              // Nhãn tin đang mang + nhãn gắn từ chính tin vừa nhắn (ganNhanChoTin chạy trên cùng câu).
              nhan: [...(dx.nhan ?? []), ...ganNhan(text)] };
            if (daCoBoSung.has(boDau(kt)) || daCoTrongFact(kt) || laBoSungRac(kt) || laBoSungTrung(kt, ngCanh) || laTrongCapNhat(kt, [...capNhatLuot, ...(soNhaGhep ? [{ answer: soNhaGhep }] : [])])) continue;
            const { error: kErr } = await ghiFact(client, {
              p_listing_id: d.id, p_question: "bo_sung", p_answer: kt, p_source: NGUON_AI,
            });
            if (kErr) await ghiLoi(client, "chat-reply ghi_fact_listing(ai_kiem bo_sung)", kErr.message);
            else kienThucGhi.push(kt);
          }
        }
        // 21/09/2026 (bắn thật mau-v-03): jsonb Postgres từ chối "\u0000" trong chuỗi model trả về
        // ("unsupported Unicode escape sequence") → mất một dòng sổ đo. Lọc trước khi ghi.
        const sachJson = <T>(x: T): T => JSON.parse(JSON.stringify(x).replace(/\\u0000/g, "")) as T;
        const { error: bErr } = await client.from("boc_tach_bong").insert(sachJson({
          seller_id: sellerRow.id, listing_id: d?.id ?? null,
          // SRS-5.1zzzzo: model THẬT đã trả lời (lớp bọc gắn vào `usage.model`: "Gemini:…" / "Groq:…" / tên Claude) — cột này từng ghi
          // MODEL cấu hình, nên lượt 76 giây ghi "claude-haiku" dù có thể là nguồn dự phòng trả lời sau khi chờ / đổi nguồn.
          tin: thayLienHe(text, "[liên hệ]").slice(0, 2000), cau_dang_hoi: kq.cauDangHoi, model: (kq.usage as { model?: string } | null)?.model ?? MODEL, ms: kq.ms,
          so_can: soCan,
          de_xuat: kq.truong, dat, bo, so_sanh: soSanh, da_ghi: { che_do: kq.cheDo, ghi: daGhi, bo: boGhi, kien_thuc: kienThucGhi, hoi_lai: kq.hoiLai ?? null,
            // 02/10/2026 (SRS-5.1ze): AI trả rỗng với câu gấp đứng riêng — cần thấy AI xếp câu vào đâu (sổ đo, không phải dữ liệu tin).
            ai_khac: { tra_loi: kq.traLoi ?? null, khong_can_hoi: kq.khongCanHoi ?? [], y_dinh: kq.yDinh ?? null, cam_xuc: kq.camXuc ?? null } },
        }));
        if (bErr) await ghiLoi(client, "chat-reply boc_tach_bong(ghi)", bErr.message);
        const dongGhi = [
          ...daGhi.map((g) => ({ question: g.question, answer: g.answer, source: NGUON_AI, goc: [g.goc] })),
          ...(kienThucGhi.length ? [{ question: "bo_sung", answer: kienThucGhi.join(" · "), source: NGUON_AI }] : []),
        ];
        return dongGhi.length ? aiDocThem(dongGhi, FACT_LABELS, { tin: text, dong: d as unknown as DongBaoLai }) : null;
      } catch (e) {
        await ghiLoi(client, "chat-reply boc_tach_bong", e);
        return null;
      }
    };
    const vetDuAnBangModel = async (): Promise<void> => {
      if (daVetDuAn || !anthropicS) return;
      // SRS-5.1zzzzzzd: tin vừa tạo trong lượt (`tinTrongLuot`) đứng trước — `active_listing_id` đọc đầu lượt chưa trỏ tới nó.
      const lid = tinTrongLuot ?? pendingReq?.listing_id ?? sellerRow.active_listing_id ?? null;
      if (!lid) return;
      // SRS-5.1zzzzzze (chủ dự án 13/10, Khu dân cư Cầu Tràm: "nó có lưu thêm thông tin dự án được không"): tin THUỘC DỰ ÁN (có
      // `project_id` hay chủ nhà đã nêu tên dự án) mà chủ nhà gửi BÀI RAO DÀI (≥ 200 chữ) thì luôn vét — tiện ích, hạ tầng, bàn giao,
      // phí… vào hàng chờ duyệt `project_facts` (nguồn `llm`, admin gật mới vào kho `projects`). Van cũ (mùi dự án + luật chưa ghi gì)
      // giữ cho mọi tin khác.
      // Van rẻ trước (không truy vấn): tin ngắn không mùi dự án / luật đã ghi → thôi, như cũ (TOIUU-07 giữ số truy vấn).
      const baiDai = text.replace(/\s+/g, " ").trim().length >= 200;
      if (!baiDai && (daGhiFactDuAn || !coMuiDuAn(text))) return;
      const { data: l } = await client.from("listings").select("project_id").eq("id", lid).maybeSingle();
      const { data: fDuAn } = l?.project_id ? { data: null } : await client.from("listing_facts")
        .select("answer").eq("listing_id", lid).eq("question", "du_an_ten")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const thuocDuAn = !!l?.project_id || !!fDuAn?.answer;
      const baiRaoDuAn = thuocDuAn && baiDai;
      if (!baiRaoDuAn && (daGhiFactDuAn || !coMuiDuAn(text))) return;
      daVetDuAn = true;
      const r = await bocDuAnBangModel(anthropicS as unknown as Parameters<typeof bocDuAnBangModel>[0], MODEL, text, baiRaoDuAn);
      if (!r) return;
      await doTien(client, r.usage as Parameters<typeof doTien>[1]);
      const k = donKetQua(r.ket);
      // Chỉ có TÊN mà không có fact nào thì thôi: tên dự án đã có đường riêng
      // (`du_an_ten` lúc tạo tin), thêm một dòng trống nghĩa vào hàng chờ duyệt
      // chỉ làm admin mỏi mắt.
      if (!k.facts.length) return;
      let tenNhac: string | null = null;
      if (!l?.project_id) {
        tenNhac = fDuAn?.answer ?? k.ten_du_an ?? null;
        if (!tenNhac) return;
      }
      for (const f of k.facts) {
        const { error } = await client.rpc("ghi_fact_du_an", {
          p_project_id: l?.project_id ?? null, p_khoa: f.khoa, p_gia_tri: f.gia_tri,
          // `nguon = 'llm'` chứ không phải 'seller_chat': admin duyệt phải thấy
          // dòng này do MÁY đọc ra, để soi kỹ hơn dòng người nói thẳng.
          p_nguon: "llm", p_listing_id: lid, p_conversation_id: convSId ?? null,
          p_ten_du_an: tenNhac,
        });
        if (error) await ghiLoi(client, "chat-reply ghi_fact_du_an(llm)", error.message);
      }
    };

    // SRS-5.1zzzzk: tin ĐANG NÓI trong lượt (tin vừa tạo ở r1, tin của câu treo ở r2) và các câu AI soát chỉ ra là "nói trạng thái tin" —
    // cho lưới trạng thái ở đường ra (`traLoiSeller`) đối chiếu đúng tin, đúng câu.
    let tinTrongLuot: string | null = null;
    const aiNoiTrangThai: string[] = [];
    const aiNoiChuaLenKe: string[] = []; // SRS-5.1zzzzzzz16: câu nói tin SẼ / CHƯA lên kệ — sai khi tin đang lên kệ
    let ackSua: string | null = null;
    /** SRS-5.1zzzzzzc: ô vừa SỬA theo lời sửa FR-164 trong lượt (để 🤖 in dòng yêu cầu `BOC_YEU_CAU` của bao_lai.ts). */
    let suaLuotKhoa: string[] = [];
    // SRS-5.1zzzzg: nội dung lời GHI THÊM (không phải sửa) của `ackSua` — lượt có model viết lời thì đưa vào câu lệnh để model ghi nhận
    // gộp một lần, bong bóng code bỏ (một ý một nguồn).
    let ackGhiGop: string | null = null;
    // FR-185: bong bóng nhận ảnh (loại ảnh, đối chiếu sổ) — đứng trước lời đáp
    // chính, cùng chỗ với lời cảm ơn sửa fact.
    let ackAnh: string[] = [];
    // "Hiện thông báo cho người ta" (02/09): vừa gán nhãn thì nói thẳng cho họ
    // (`cauNhan`, tầng module). Đứng CUỐI loạt bong bóng (sau lời chào/câu hỏi
    // của model) để đúng nhịp: chào trước, giấy tờ sau.
    // Chủ dự án 09/09/2026 tối: "sẽ không báo nhãn và mức phí cho người bán nữa,
    // chỉ tự ghi nhận thôi" — nhãn CCRB/NMG gán im lặng (admin vẫn nhận việc 🆕
    // kèm nhãn), người bán chỉ thấy bong bóng "📝 Em ghi nhận" liệt kê thứ đã bóc.
    // `cauNhan` giữ lại cho khi cần bật lại; `void` để không thành biến chết.
    void cauNhan;
    let thongBaoNhan: string | null = null;
    void nhanVuaGan;
    // 11/09/2026 (giai đoạn test): đọc LẠI dòng tin từ DB sau khi mọi nhánh đã
    // ghi, để người bán thấy đúng cái hệ thống đang giữ — không phải chữ họ gõ.
    // Tắt (mặc định) thì chỉ tốn đúng MỘT lượt rpc đọc công tắc rồi dừng.
    // Hỏng ở đâu cũng không chặn lời đáp: ghi sổ lỗi rồi coi như tắt.
    // 17/09/2026 (chủ dự án): 💾 phải nói cả HỒ SƠ vừa lưu — Zalo ID (che, 4 số cuối) lượt mở hồ sơ,
    // cách gọi ("cô") lượt vừa ghi. Gán ở khối xưng hô bên dưới, đọc ở đây.
    let xungHoVuaGhi: string | null = null;
    // ─── SRS-5.1zzzr (08/10/2026, chủ dự án: "làm tiếp 4 việc còn lại … sửa từ gốc"): MỘT đường ghi dữ liệu cho tin VỪA MỞ ──────────
    // Tạo tin một căn và tạo từng căn của tin nhiều căn từng là hai đoạn ghi riêng, mỗi đoạn một danh sách khoá bỏ qua và một cách
    // ghi diện tích: nhánh nhiều căn có ngang × dài mà không ghi ô diện tích (bot hỏi lại ba lượt, vá ở SRS-5.1zzzm), ghi hẻm / mặt
    // tiền bằng regex trên chữ kể cả khi AI đã đọc ("mặt tiền Hồng Bàng" → độ rộng hẻm "mặt tiền"). Nay cả hai gọi hàm này.
    /** Khoá do nơi gọi tính (cột lúc insert, hoặc tham số lõi bên dưới) — fact kèm cùng khoá bỏ, không ghi hai lần. */
    const KHOA_LOI_TIN_MOI = new Set(["gia", "gap", "phuong", "quan", "dien_tich", "dien_tich_dat", "so_phong_ngu", "vi_tri", "bo_sung", "du_an_ten", "loai_giao_dich", "loai_bds"]);
    const ghiDuLieuTinMoi = async (lid: string, nhan: string, o: {
      viTri?: string | null; dienTich?: string | null; soPhongNgu?: string | number | null; duAnTen?: string | null;
      kem: ReadonlyArray<{ question: string; answer: string }>;
    }): Promise<void> => {
      const dt = o.dienTich?.trim() ? `${o.dienTich.trim().replace(",", ".").replace(/\s*m2$/i, "")}m2` : null;
      // SRS-5.1zzzzn: fact kèm của AI mang cụm khách gõ (`goc`) — để 🤖 lượt tạo tin in được nguyên mẫu.
      for (const [k, v, goc] of [
        ["vi_tri", o.viTri ?? null, null], ["dien_tich", dt, null], ["so_phong_ngu", o.soPhongNgu != null ? String(o.soPhongNgu) : null, null], ["du_an_ten", o.duAnTen ?? null, null],
        ...o.kem.filter((f) => !KHOA_LOI_TIN_MOI.has(f.question)).map((f) => [f.question, f.answer, gocCua(f)]),
      ] as Array<[string, string | null, string | null]>) {
        // SRS-5.1zzzzd: ô vị trí không nhận kích thước / tên hành chính trơn (một hàm chung `viTriGhiDuoc`).
        const vv = k === "vi_tri" ? viTriGhiDuoc(v) : v;
        if (!vv) continue;
        const { error } = await ghiFact(client, { p_listing_id: lid, p_question: k, p_answer: vv, p_source: "seller_chat", goc });
        if (error) await ghiLoi(client, `chat-reply ghi_fact_listing(${nhan}:${k})`, error.message);
      }
    };
    // FR-211 (18/09/2026, chủ dự án: "làm cái gắn nhãn để tìm được luôn đi"): ý khách nói trong tin
    // này khớp từ điển nhãn đóng (`ganNhan`, tiền định) → gộp vào `listings.nhan` (RPC them_nhan_tin,
    // không trùng) và ghi fact `nhan` để 💾 báo "nhãn tìm kiếm: …". Chạy ở đường ra, sau khi mọi luật
    // đã ghi, nên tin MỚI tạo trong lượt cũng được gắn (mã ở extra.listing_code).
    // 20/09/2026 (bắn thật mau-y-A): "can 1 so hong rieng hoan cong du, can 2 tho cu 100% 2 mat tien" —
    // nhãn của CẢ câu từng dồn hết vào căn đang chăm (căn 2 mang "đã hoàn công" của căn 1). Đường
    // ghi theo căn gắn nhãn riêng từng mảnh (`rieng`) rồi bật cờ để đường ra không gắn lại cả câu.
    let nhanTheoCanDaGan = false;
    const ganNhanChoTin = async (extra: Record<string, unknown>, rieng?: { lid: string; text: string }): Promise<void> => {
      if (!rieng && nhanTheoCanDaGan) return;
      const nhanCau = ganNhan(rieng?.text ?? text);
      if (!nhanCau.length) return;
      try {
        const ma = typeof extra.listing_code === "string" && extra.listing_code ? extra.listing_code : null;
        let lid: string | null = rieng?.lid ?? null;
        if (!lid && ma) {
          const { data: lm } = await client.from("listings").select("id").eq("code", ma).eq("seller_id", sellerRow.id).maybeSingle();
          lid = (lm as { id?: string } | null)?.id ?? null;
        }
        // Tin đang chăm (active_listing_id, trigger đặt khi mở câu hỏi) > tin mới nhất của người này.
        // KHÔNG đọc `pendingReq` ở đây: closure này chạy cả ở các nhánh trả lời TRƯỚC khi nó được khai báo.
        if (!lid && !rieng) lid = sellerRow.active_listing_id ?? null;
        if (!lid) {
          const { data: ml } = await client.from("listings").select("id").eq("seller_id", sellerRow.id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          lid = (ml as { id?: string } | null)?.id ?? null;
        }
        if (!lid) return;
        const { data: cu } = await client.from("listings").select("nhan, deal").eq("id", lid).maybeSingle();
        const daCo = new Set(((cu as { nhan?: string[] | null } | null)?.nhan) ?? []);
        // SRS-5.1zzzzzzw: "đang cho thuê, có dòng tiền" là nhãn cho người MUA đầu tư — tin CHO THUÊ không mang nhãn này.
        const choThue = (cu as { deal?: string | null } | null)?.deal === "cho_thue";
        const them = nhanCau.filter((n) => !daCo.has(n) && !(choThue && n === "dong_tien"));
        if (!them.length) return;
        const { error: nErr } = await client.rpc("them_nhan_tin", { p_listing_id: lid, p_nhan: them });
        if (nErr) { await ghiLoi(client, "chat-reply them_nhan_tin", nErr.message); return; }
        const { error: fErr } = await ghiFact(client, {
          p_listing_id: lid, p_question: "nhan", p_answer: tenNhan(them), p_source: "seller_chat",
        });
        if (fErr) await ghiLoi(client, "chat-reply ghi_fact_listing(nhan)", fErr.message);
        // FR-236 (bắn thật lx-43, 28/09): "sổ hồng riêng full thổ cư" chỉ thành NHÃN, ô thổ cư vẫn trống → điểm tin báo thiếu
        // "thổ cư bao nhiêu" và bot gợi ý hỏi lại thứ khách vừa nói. Nhãn thổ cư 100% điền ô thổ cư — chỉ khi ô còn trống.
        // SRS-5.1zzzzzh (bắn production 12/10, thu-kb-thue): "full noi that, view ho boi" → nhãn "full nội thất", ô nội thất trống, bot vẫn
        // coi nội thất là chưa biết. Cùng lớp với thổ cư: nhãn mà CHÍNH LÀ giá trị của một ô thì điền ô đó — một bảng `NHAN_LA_O`, không vá từng nhãn.
        for (const [maNhan, [o, giaTri]] of Object.entries(NHAN_LA_O)) {
          if (!them.includes(maNhan)) continue;
          const { data: co, error: coErr } = await client.from("listing_facts").select("id").eq("listing_id", lid).eq("question", o).limit(1);
          if (coErr) { await ghiLoi(client, `chat-reply doc ${o}`, coErr.message); continue; }
          if ((co ?? []).length) continue;
          const { error: gErr } = await ghiFact(client, { p_listing_id: lid, p_question: o, p_answer: giaTri, p_source: "seller_chat" });
          if (gErr) await ghiLoi(client, `chat-reply ghi_fact_listing(${o} tu nhan)`, gErr.message);
        }
      } catch (e) {
        await ghiLoi(client, "chat-reply gan nhan", e);
      }
    };
    // Khai trước `baoLaiDaLuu` (closure đọc nó; gán ở `xetDoiNhan`) — khai sau là lỗi TDZ ở các đường trả lời sớm.
    let vaiTuNoiLuot: "chinh_chu" | "moi_gioi" | null = null;
    const baoLaiDaLuu = async (
      extra: Record<string, unknown>,
    ): Promise<{ bong: string | null; cheDo: CheDoBaoLai }> => {
      try {
        // Nhánh đã tự soạn 💾 theo từng căn (fact theo căn) → không dựng 💾 chung nữa.
        const { data: cd, error: cdErr } = await client.rpc("cau_hinh", { p_key: "bao_lai_da_luu" });
        if (cdErr) await ghiLoi(client, "chat-reply cau_hinh(bao_lai_da_luu)", cdErr.message);
        const cheDo = docCheDo(cd);
        // SRS-5.1zzzm: nhánh tự soạn 🤖 vẫn cần biết CHẾ ĐỘ thật để bong bóng đó đi đúng chỗ (admin → chỉ /admin).
        if (extra.bao_lai_tat === true) return { bong: null, cheDo };
        if (cheDo === "tat") return { bong: null, cheDo };
        // Tin nào: mã vừa tạo trong lượt này > active_listing_id đọc LẠI (trigger
        // đổi nó ngay khi mở câu chờ mới, bản `sellerRow` đầu lượt đã cũ) > tin mới nhất.
        const ma = typeof extra.listing_code === "string" && extra.listing_code ? extra.listing_code : null;
        let lid: string | null = null;
        if (!ma) {
          const { data: sNow, error: sErr } = await client.from("sellers")
            .select("active_listing_id").eq("id", sellerRow.id).maybeSingle();
          if (sErr) await ghiLoi(client, "chat-reply bao_lai_da_luu(sellers)", sErr.message);
          lid = (sNow as { active_listing_id?: string | null } | null)?.active_listing_id ?? null;
        }
        const coTin = () => client.from("listings").select(COT_BAO_LAI).eq("seller_id", sellerRow.id);
        const { data: lRow, error: lErr } = await (
          ma ? coTin().eq("code", ma).limit(1).maybeSingle()
            : lid ? coTin().eq("id", lid).limit(1).maybeSingle()
            : coTin().order("created_at", { ascending: false }).limit(1).maybeSingle()
        );
        if (lErr) {
          await ghiLoi(client, "chat-reply bao_lai_da_luu(listings)", lErr.message);
          return { bong: null, cheDo };
        }
        const dong = (lRow ?? null) as DongBaoLai | null;
        // 14/09/2026: đúng thứ TIN KHÁCH VỪA NHẮN đã lưu — fact có `created_at` ≥ giờ
        // ghi tin đó. Cả hai mốc đều là đồng hồ DB, không so với đồng hồ edge.
        // SRS-5.1zzzzzr (Zalo thật 13/10/2026 04:59Z, Nhà Bè): "Dtsd: 42,8m, 2pn, 1 trệt, 1 lầu." rồi 9 giây sau "DT 3x14" — fact lượt 1 ghi lúc
        // :11, mốc lấy TIN CHỦ NHÀ MỚI NHẤT (:13) → không fact nào ≥ mốc → "🤖 Không trích xuất được gì" dù đã ghi ba ô. Mốc phải là giờ ghi
        // CHÍNH TIN LƯỢT NÀY (`lucTinChu`); chỉ khi không có (tin trùng zalo_msg_id) mới lấy tin mới nhất như cũ.
        // SRS-5.1zzzzzzg: khách nhắn giật cục → mốc là tin ĐẦU CỤM, fact các lượt im (nhường lượt) trong cụm cũng vào bong bóng này.
        let moc: string | null = lucDauCum ?? lucTinChu;
        if (!moc) {
          const { data: mMsg, error: mErr } = await client.from("messages").select("created_at")
            .eq("conversation_id", convSId).eq("sender", "seller")
            .order("seq", { ascending: false }).limit(1).maybeSingle();
          if (mErr) await ghiLoi(client, "chat-reply bao_lai_da_luu(moc)", mErr.message);
          moc = (mMsg as { created_at?: string | null } | null)?.created_at ?? null;
        }
        let factLuot: FactBaoLai[] = [];
        if (moc) {
          const { data: fs, error: fErr } = await client.from("listing_facts")
            .select("question, answer, created_at, source, listings!inner(seller_id)")
            .eq("listings.seller_id", sellerRow.id).gte("created_at", moc)
            .order("created_at", { ascending: false }).limit(40);
          if (fErr) await ghiLoi(client, "chat-reply bao_lai_da_luu(facts)", fErr.message);
          // 21/09/2026 (chủ dự án): fact AI đọc (ai_kiem) nằm CHUNG bong bóng "🤖 Đã lưu", không tách dòng.
          // SRS-5.1zzzzn: ứng viên NGUYÊN MẪU của từng fact đọc từ sổ ghi của lượt (`ghiLuot`, cùng câu hỏi + cùng chữ đã ghi) — cụm
          // AI chỉ ra, rồi chữ đưa vào cửa ghi. Không đọc lại DB, không đoán: bao_lai chỉ in đoạn tìm lại được trong tin khách.
          // SRS-5.1zzzzo: fact ghi lại GIÁ TRỊ KHÔNG ĐỔI (mọi lượt ghi khớp nó trong sổ đều `doi = false`) không phải thứ tin này trích
          // xuất được — bỏ khỏi 🤖 (bất biến e2e KHÔNG ĐỔI). Fact không có trong sổ (đường ghi ngoài hàm bọc) giữ như cũ.
          // SRS-5.1zzzzzzg: fact LƯỢT ANH EM trong cụm ghi (created_at trước tin lượt này) là thứ cụm này trích xuất được — giữ, dù lượt này
          // ghi lại cùng giá trị (`doi = false`); dòng ghi lại của chính lượt này thì bỏ như cũ (một fact in một lần).
          const luotAnhEm = (f: FactBaoLai) => !!lucDauCum && !!lucTinChu && !!f.created_at && Date.parse(f.created_at) < Date.parse(lucTinChu);
          factLuot = ((fs ?? []) as FactBaoLai[]).flatMap((f) => {
            const g = ghiLuot.filter((x) => x.question === f.question && x.ghi === f.answer);
            if (g.length && g.every((x) => !x.doi) && !luotAnhEm(f)) {
              // SRS-5.1zzzzzzx (chủ dự án 14/10: "phải in ra hết" — bài rao gửi lại, 🤖 chỉ in "quận" trong khi câu chữ kể 11 ô): ô CHÍNH TIN
              // NÀY nói (cụm tìm lại được trong tin khách) vẫn in, đánh dấu "(như cũ)". Ô lượt chốt tin đọc lại từ lịch sử (không có trong
              // tin này) vẫn bỏ như SRS-5.1zzzzo.
              const gocG = g.flatMap((x) => [x.goc, x.vao]);
              return timNguyenMau(text, ...gocG) ? [{ ...f, goc: gocG, nhuCu: true }] : [];
            }
            return [g.length ? { ...f, goc: g.flatMap((x) => [x.goc, x.vao]) } : f];
          });
        }
        const hoSo = [
          sellerMoi ? `Zalo: "…${String(externalUserId).slice(-4)}"` : null,
          xungHoVuaGhi ? `cách gọi: "${xungHoVuaGhi}"` : null,
        ].filter(Boolean).join(" · ");
        const dongHoSo = hoSo ? `👤 Hồ sơ: ${hoSo}` : null;
        // 24/09/2026 (chủ dự án: "đừng đưa đã lưu nữa, mà là đã bóc tách được gì trong tin nhắn đó, tin nhắn nào
        // của khách ko bóc tách được gì thì ghi là ko bóc tách được gì"): 🤖 chỉ nói thứ bóc từ CHÍNH tin vừa nhắn,
        // giá trị trong ngoặc kép — không in lại cả tin đang nằm trong DB (quyết định 21 + 23/09 thay bằng câu này).
        // Lượt TẠO tin: cả dòng tin là thứ bóc từ câu rao → từng cột + fact lượt này mà cột chưa nói.
        // SRS-5.1zzzzn: "Đã trích xuất "<cụm khách gõ>" → làm chuẩn "<chữ lưu>"" — nguyên mẫu tìm trong chính tin khách vừa nhắn.
        if (ma) {
          return { bong: [bocTachTaoTin(dong, { tin: text, facts: factLuot, nhan: FACT_LABELS }), dongHoSo].filter(Boolean).join("\n") || null, cheDo };
        }
        const ngu = { tin: text, dong };
        const dongLuot = dongVuaLuu(factLuot, FACT_LABELS, ngu);
        // Quận ghi thẳng cột (không qua fact) — cùng kiểu dòng, nguyên mẫu là cụm quận khách gõ.
        if (quanVuaGhi && !dongLuot.some((d) => /^• quận:/.test(d))) dongLuot.push(dongFact({ question: "quan", answer: quanVuaGhi }, { quan: "quận" }, ngu));
        // SRS-5.1zzzzzn (test Zalo 13/10/2026: "ok" duyệt bản nháp → "🤖 Không trích xuất được gì từ tin này."): lượt không có dữ liệu
        // để trích nhưng em ĐÃ hiểu đúng việc của nó (gật bản nháp, khách hỏi em, khách tự nói vai) → 🤖 nói điều đã hiểu.
        const hoiNguocX = typeof extra.hoi_nguoc === "string" ? extra.hoi_nguoc.replace(/\s+/g, " ").trim().slice(0, 80) : "";
        // SRS-5.1zzzzzq (chủ dự án 13/10: "hiểu yêu cầu thì … ghi yêu cầu của khách ở chỗ bong bóng trích xuất"): khách hỏi / xin về tin của
        // mình → 🤖 ghi yêu cầu đã hiểu (nhãn tiền định theo loại), không "Không trích xuất được gì".
        const NHAN_YEU_CAU: Record<string, string> = {
          noi_dung: "xin xem lại nội dung tin đăng", khach: "hỏi có khách nào hỏi chưa", gia: "hỏi lại giá đã ghi", dien_tich: "hỏi lại diện tích đã ghi",
          dia_chi: "hỏi lại địa chỉ đã ghi", tang: "hỏi lại tầng đã ghi", huong: "hỏi lại hướng đã ghi", phap_ly: "hỏi lại pháp lý đã ghi",
          trang_thai: "hỏi tin đã đăng chưa", ban_chua: "hỏi căn đã bán chưa", noi_dang: "hỏi tin đăng ở đâu", bao_lau_ban: "hỏi bao lâu thì bán được",
        };
        const yeuCauX = typeof extra.hoi_ve_tin === "string" ? NHAN_YEU_CAU[extra.hoi_ve_tin] ?? null : null;
        const hieuKhac = extra.duyet === true ? "đồng ý bản nháp, em đăng tin"
          : extra.gat_tron === true ? `${cachGoi} xác nhận, không có thông tin mới` // SRS-5.1zzzzzv
          : vaiTuNoiLuot ? `tự nói là ${vaiTuNoiLuot === "moi_gioi" ? "môi giới" : "chính chủ"}`
          : hoiNguocX ? `hỏi em "${hoiNguocX}", em trả lời câu đó`
          : null;
        // SRS-5.1zzzzzs: yêu cầu của khách in khuôn "• ghi nhận yêu cầu của {ac}: …" (chủ dự án 13/10).
        // SRS-5.1zzzzzzc (chủ dự án 13/10 tối, xác nhận "đúng"): lượt khách ra LỆNH cho bot (sửa ô lúc duyệt, bỏ ô / ý đã ghi, dùng tiêu đề
        // của khách, chuyển sang căn khác) → đầu bong bóng "🤖 Đã trích xuất yêu cầu cho bot thực hiện: "<lệnh>"", dưới là dòng dữ liệu
        // lượt đó (nếu có). Lệnh đọc từ meta của chính đường xử lý (không đoán lại chữ khách).
        const boY = Array.isArray(extra.bo_y) ? (extra.bo_y as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
        const nhanO = (q: string) => nhanNgan(q, FACT_LABELS);
        const yeuCauLenh: string | null = (() => {
          if (boY.length) return `bỏ ý "${boY[0]}"${boY.length > 1 ? ` và ${boY.length - 1} ý nữa` : ""} khỏi tin`;
          if (extra.tieu_de_khach === true) return `dùng tiêu đề ${cachGoi} đưa cho bản tin`;
          if (typeof extra.chuyen_can === "string" && extra.chuyen_can) return `chuyển sang căn ${extra.chuyen_can}`;
          if (typeof extra.xin_bo_truong === "string" && extra.xin_bo_truong !== "?") return `bỏ ${nhanO(extra.xin_bo_truong)} đã ghi`;
          // Lời sửa FR-164 ("à giá 7 tỷ 5 nha em") — ô sửa THẬT (tin đã có giá trị khác trước đó); ghi mới thì là dữ liệu, không phải lệnh.
          const suaKhoa = extra.sua_that === true && Array.isArray(extra.sua_fact) ? (extra.sua_fact as string[]) : suaLuotKhoa;
          if (suaKhoa.length) return `sửa ${[...new Set(suaKhoa)].map(nhanO).join(", ")} đã ghi`;
          if (extra.sua_nhap === true) {
            const o = [...new Set(factLuot.map((f) => f.question))].filter((q) => q !== "bo_sung").map(nhanO);
            return o.length ? `sửa ${o.join(", ")} đã ghi` : "sửa bản tin";
          }
          return null;
        })();
        const bocYeuCau = yeuCauLenh ? bongYeuCau(yeuCauLenh, dongLuot) : yeuCauX ? `${BOC_YEU_CAU}\n• ghi nhận yêu cầu của ${cachGoi}: ${yeuCauX}` : null;
        const bocDu = (yeuCauLenh ? bocYeuCau : null) ?? bongTrichXuat(dongLuot) ??
          (hieuTraLoiVai && sellerMoi ? traLoiCauBot(cauVaiDaHoi, hieuTraLoiVai, text) : hieuKhac ? `${HIEU_LUOT} ${hieuKhac}.` : bocYeuCau ?? KHONG_BOC);
        return { bong: [bocDu, dongHoSo].filter(Boolean).join("\n"), cheDo };
      } catch (e) {
        await ghiLoi(client, "chat-reply bao_lai_da_luu", e);
        return { bong: null, cheDo: "tat" };
      }
    };
    // 30/09/2026 (chủ dự án: "nhiều quy tắc quá … quy tắc nhiều ngu con bot ra, cái nào cần thì để lại cho AI nó làm"):
    // công tắc `app_config.luat_loi_bot`. `gon` (mặc định, không có dòng cũng là gọn) TẮT năm luật SỬA VĂN mà câu lệnh
    // model đã dặn sẵn — chèn câu xin lỗi, cắt khen vị trí / khen ngược nghĩa / khen lặp / đoán thanh khoản (luật cuối
    // còn cắt đúng câu mẫu prompt dạy: "hẻm xe hơi tới cửa là khách chuộng lắm"). `du` bật lại cả năm, không cần deploy.
    // Luật chống BỊA (giá, số đo, vị trí, hứa đã đăng / có hàng / hỏi chủ), khớp câu hỏi với ô đang hỏi, xưng hô: luôn giữ.
    // Tin đang hỏi còn RỖNG: vừa mở từ "em cần bán nhà", chưa có giá, diện tích, địa chỉ, dự án (30/09/2026).
    const laTinRong = (l: { status?: string | null; price_raw?: string | null; price_vnd?: number | string | null; area_m2?: number | null;
      district?: string | null; ward?: string | null; location_raw: string | null; project_id?: string | null; unit_code?: string | null }) =>
      l.status === "cho_thong_tin" && !l.price_raw && l.price_vnd == null && l.area_m2 == null && !l.district && !l.ward &&
      !l.location_raw && !l.project_id && !l.unit_code;
    /**
     * 03/10/2026 (bộ đo X04, SRS-5.1zt): "em bán căn hộ q7 3 tỷ để mua nhà Bình Thạnh 6 tỷ" — câu có ý bán thì cổng `hoiMua`
     * đóng (`&& !wantsSell`), cả câu vào nhánh bán, vế MUA rơi mất. AI lượt nhỏ đọc vế mua (có trích dẫn, `docMuaKem`) → ghi hồ
     * sơ mua của CÙNG người (một người một hội thoại, `ensure_buyer_conversation`). Trả câu báo đã ghi khi có ô mới; AI không
     * chạy thì không làm gì (không đoán vế mua bằng từ khoá).
     */
    const ghiMuaKem = async (): Promise<string | null> => {
      if (!yLuotAi || !laCheDoAi) return null;
      const mk = docMuaKem((await yLuotAi)?.muaKem, textTreo || text);
      if (!mk) return null;
      const { data: bcMk, error: bcMkErr } = await client
        .rpc("ensure_buyer_conversation", { p_zalo_user_id: externalUserId, p_channel: channel }).single();
      if (bcMkErr || !bcMk) {
        await ghiLoi(client, "chat-reply ensure_buyer_conversation(mua kem)", bcMkErr?.message ?? "rỗng");
        return null;
      }
      const bMk = bcMk as unknown as { b_id: string; b_prefs: Record<string, unknown> | null };
      const cu = bMk.b_prefs ?? {};
      const delta: Record<string, unknown> = {};
      if (mk.area) delta.area = chuanKhuVucMua(mk.area);
      if (mk.budget) delta.budget = mk.budget;
      if (mk.property_type) delta.property_type = mk.property_type;
      for (const k of Object.keys(delta)) if (cu[k] === delta[k]) delete delta[k];
      if (!Object.keys(delta).length) return null;
      const { error: mkErr } = await client.rpc("merge_buyer_prefs", { p_buyer_id: bMk.b_id, p_delta: delta });
      if (mkErr) {
        await ghiLoi(client, "chat-reply merge_buyer_prefs(mua kem)", mkErr.message);
        return null;
      }
      const goi = sellerRow.xung_ho ?? cachGoi; // SRS-5.1zzzze: không "anh/chị" gạch chéo trong câu soạn sẵn
      const ta = [mk.property_type, mk.area].filter(Boolean).join(" ") || "căn";
      // Không mở bằng "Dạ em ghi/lưu …": `boCauGhiNhan` gọt câu đó khi đã có 🤖 — mà 🤖 chỉ in dữ liệu TIN BÁN, không in hồ sơ mua.
      return `Dạ còn nhu cầu mua của ${goi} (${ta}${mk.budget ? `, tầm ${mk.budget.replace(/^\s*(?:tầm|khoảng|tam|khoang)\s+/i, "")}` : ""}), em cũng lưu vào hồ sơ rồi ạ.`;
    };
    const traLoiSeller = async (
      replies: string[],
      extra: Record<string, unknown> = {},
    ) => {
      // Đường ra DUY NHẤT của nhánh người bán → chỗ nối lưới vét (FR-199). Tới
      // đây thì mọi nhánh tiền định đã ghi xong, nên `daGhiFactDuAn` đã đúng.
      await vetDuAnBangModel();
      // Cảm xúc chủ nhà: mọi đường ra đều xét (báo người phụ trách một lần / 24 giờ / mức).
      await camXucAi();
      // Ghi hồ sơ mua ngay; câu báo gắn SAU các bộ lọc lời model (`boCauGhiTienKhongCo` gọt câu "lưu … 6 tỷ" vì 6 tỷ không
      // phải giá tin bán) — xem chỗ gắn `cauMuaKem` trước khi ghi sổ bot.
      const cauMuaKem = await ghiMuaKem();
      if (duongAiGhi) {
        const { id, ten } = duongAiGhi;
        duongAiGhi = null;
        const { data: lDuong, error: lDErr } = await client.from("listings").select("location_raw, street").eq("id", id).maybeSingle();
        if (lDErr) await ghiLoi(client, "chat-reply listings(ten duong ai)", lDErr.message);
        const st = lDuong?.location_raw ? tenTrongDiaChi(lDuong.location_raw, ten) : null;
        if (st && st !== lDuong?.street) {
          const { error: stErr } = await client.from("listings").update({ street: st }).eq("id", id);
          if (stErr) await ghiLoi(client, "chat-reply listings.street(ai)", stErr.message);
        }
      }
      // 01/10/2026 (bắn thử lx-cx-01: "bên em có phải lừa đảo không vậy" → bot chỉ nói "em là trợ lý AI"): chủ nhà NGHI NGỜ
      // (AI đọc, có trích dẫn) → bong bóng TRẤN AN tiền định đứng trước, chỉ nói điều có thật: phí chỉ thu khi giao dịch thành
      // công (FEE_RULES), không thu trước; đã báo người phụ trách (việc 😟 vừa mở ở `camXucAi`).
      // SRS-5.1zzzze (bắn production 09/10/2026, thu-kg5: "… bên em lấy phí sao, mà sao tin em được"): lưới trùng cũ dò `/phí chỉ thu
      // khi/` nên câu phí hỏi ngược ("Dạ phí BÊN EM chỉ thu khi…") lọt, khách đọc phí HAI lần trong một lượt; câu này còn viết "anh/chị"
      // gạch chéo và gạch dài — van sửa văn tắt (`luat_loi_bot` gọn) nên ra nguyên văn. Một ý một nguồn: lượt đã có câu phí (bong bóng
      // hỏi ngược, lời model chép câu phí — đối chiếu đúng chữ `cauPhi()` sinh, không dò từ khoá) thì bong bóng trấn an không nói phí lại;
      // chưa có thì nó nói. Gọi khách bằng cách gọi thật của người này (`cachGoi`), không gạch chéo, không gạch dài.
      if (camXucLuot?.muc === "nghi_ngo") {
        const goi = sellerRow.xung_ho ?? cachGoi;
        const daNoiPhi = replies.some(coCauPhi);
        replies = [`Dạ ${goi} yên tâm nha, bên em là AI Ơi Nhà Đất, rao tin cho ${goi} không thu đồng nào trước${daNoiPhi ? "" : `, ${cauPhi(vaiPhi(sellerRow), dealNguoi)}`}. Em cũng đã báo anh chị phụ trách nhắn lại ${goi} cho rõ ạ.`, ...replies];
      }
      if (humanActive) {
        // FR-141 — người thật đang cầm cuộc: không gửi, không ghi dòng bot nào.
        return await hoanTat({
          reply: null, replies: [], role: "seller", human_active: true, ...extra,
        });
      }
      // Model đã tự mở bằng lời ghi nhận (thường ĐỦ hơn bong bóng code: "sửa lại
      // 6 tỷ 5 và Phường 9" so với "sửa lại Phường 9") → bỏ bong bóng code, kẻo
      // chủ nhà đọc hai lần "Dạ em sửa lại…" liền nhau (lượt bắn 12/09).
      // 22/09/2026 (bộ đo giọng B04, chủ dự án chốt): lời SỬA THẬT ("Dạ em sửa lại giá 7 tỷ 5 rồi ạ") là
      // lời xác nhận chủ nhà cần sau câu "à nhầm" — giữ nó, bỏ câu ghi nhận của model thay vì ngược lại.
      const luatDu = await loiBotDu();
      if (ackSua && replies.length && laCauGhiNhan(replies[0])) {
        if (/^Dạ em sửa lại/.test(ackSua)) { if (luatDu) replies = apVan(soVan, "boCauGhiNhan", replies, boCauGhiNhan(replies)); }
        else ackSua = null;
      }
      // 22/09/2026 (kịch bản C): "Dạ em sửa lại Phường 2 rồi ạ." + model "Phường 2 em sửa lại rồi ạ." — câu
      // model không mở bằng "Dạ em" nên `laCauGhiNhan` không thấy, và ngắn hơn ngưỡng `boCauTrung`. Đã có lời
      // sửa tiền định thì mọi câu "sửa lại … rồi" của model là lần hai.
      if (luatDu && ackSua && /^Dạ em sửa lại/.test(ackSua)) replies = apVan(soVan, "boCauSuaLaiModel", replies, boCauSuaLaiModel(replies));
      replies = apVan(soVan, "chanNhanLaNguoi", replies, chanNhanLaNguoi(replies, cachGoiKhach(goiNguoi, sellerRow.nhom_tuoi)));
      const ackDau = ackSua;
      let sach = [...(ackSua ? [ackSua] : []), ...ackAnh, ...replies, ...(thongBaoNhan ? [thongBaoNhan] : [])]
        // Model lỡ chép nguyên chữ giữ chỗ của khối nhớ tạm → thay bằng tên thật.
        .map((r) => r.split(TEN_GIU_CHO).join(tenBot).trim()).filter(Boolean);
      const mocVan = theoDoiVan(soVan, () => sach);
      // SRS-5.1zzzzj: con số phí chỉ do `cauPhi(vaiPhi(…))` nói — lời model (hay câu nào) nói "1%" / "0,5%" khi vai chưa xác nhận (hoặc
      // sai số của vai) → thay bằng đúng câu `cauPhi`. Lưới chống bịa, luôn bật; không đụng câu hỏi.
      sach = chanPhiChuaXacNhan(sach, phanTramPhi(vaiPhi(sellerRow), dealNguoi), cauPhi(vaiPhi(sellerRow), dealNguoi), vaiPhi(sellerRow) === "unknown" && dealNguoi !== "cho_thue"); mocVan("chanPhiChuaXacNhan");
      // 06/10/2026 (bắn thử thu-srd-b1, SRS-5.1zzo): "Tin căn Trần Phú của anh đang rao" khi người này KHÔNG còn tin nào mở (căn
      // duy nhất vừa ẩn, căn Trần Phú chưa từng được mở). Lớp lỗi: lời khẳng định TRẠNG THÁI TIN do model (hay câu tiền định) viết
      // mà không đối chiếu DB — `boHuaDaDang` trước chỉ áp ở r2 khi tin chưa lên kệ, r3 (chăm sóc) không qua. Đây là đường ra DUY
      // NHẤT của nhánh bán nên lưới đặt ở đây, luôn bật: lời có mệnh đề "đã đăng / đang rao / lên kệ" → đọc số tin còn mở (một
      // truy vấn, CHỈ khi lời có mệnh đề đó) → không còn tin mở thì mọi khẳng định như vậy là sai, bỏ mệnh đề.
      // SRS-5.1zzzzk (bắn production 09/10: câu rao đầu → "Em vừa đăng tin rồi ạ." khi tin CHỜ THÔNG TIN, chưa có bản nháp): lưới này là
      // CHỦ DUY NHẤT của mọi câu nói trạng thái tin. Bản cũ chỉ xét "không còn tin mở" (r1 / r2 có lưới riêng, và lưới riêng trả LẠI câu
      // sai khi câu sai là cả lời). Nay: câu nói trạng thái (AI soát chỉ ra — `aiNoiTrangThai`; luật `coMenhDeDaDang` đỡ khi AI không
      // chạy) → đọc trạng thái THẬT: tin đang nói trong lượt (hay tin đang hoạt động) chưa lên kệ, hoặc không tin nào lên kệ → câu sai, bỏ.
      const aiTT = aiNoiTrangThai.filter((c) => sach.some((r) => boDau(r).includes(boDau(c).replace(/[.!…\s]+$/u, ""))));
      const aiCLK = aiNoiChuaLenKe.filter((c) => sach.some((r) => boDau(r).includes(boDau(c).replace(/[.!…\s]+$/u, ""))));
      if (coMenhDeDaDang(sach) || aiTT.length || aiCLK.length) {
        const { data: tinTT, error: tmErr } = await client.from("listings").select("id, status").eq("seller_id", sellerRow.id).limit(50);
        if (tmErr) await ghiLoi(client, "chat-reply doc trang thai tin", tmErr.message);
        else {
          const LEN_KE = ["dang_ban", "dang_quan_tam"];
          const ds = (tinTT ?? []) as Array<{ id: string; status: string | null }>;
          const tieuDiem = ds.find((t) => t.id === (tinTrongLuot ?? sellerRow.active_listing_id));
          const dung = tieuDiem ? LEN_KE.includes(tieuDiem.status ?? "") : ds.some((t) => LEN_KE.includes(t.status ?? ""));
          // SRS-5.1zzzzzzz16: chiều ngược — tin ĐANG lên kệ mà câu nói "sẽ lên kệ / chưa đăng / chờ duyệt" → bỏ câu đó.
          if (dung && aiCLK.length) {
            sach = sach.map((r) => /^\s*(?:🤖|💾|📝|📋)/u.test(r) ? r : boCauNhanXet(r, aiCLK) ?? "").filter((r) => r.trim());
            if (!sach.length) sach = ["Dạ em ghi nhận rồi ạ."];
            mocVan("boNoiChuaLenKe(trang_thai_that)");
          }
          if (!dung) {
            sach = boHuaDaDang(sach);
            if (aiTT.length) sach = sach.map((r) => /^\s*(?:🤖|💾|📝|📋)/u.test(r) ? r : boCauNhanXet(r, aiTT) ?? "").filter((r) => r.trim());
            if (!sach.length) sach = ["Dạ em ghi nhận rồi ạ."];
            mocVan("boHuaDaDang(trang_thai_that)");
          }
        }
      }
      // SRS-5.1zzzzv (bắn production 10/10, thu-cmp46-2): lô đất mà bot hỏi "Nhà mình ở đường nào, số mấy". Gọi đúng loại (đất / căn
      // hộ) từng rải ba chỗ (câu mẫu, r2, r2b), chỗ nào cũng đọc loại từ ẢNH CHỤP đầu lượt (`pendingReq.listings`) — đúng lượt loại vừa
      // ghi thì ảnh chụp còn `chua_ro`. Chủ duy nhất ở đường ra: lời có "nhà anh / chị / mình…" → đọc loại THẬT của tin đang nói.
      if (sach.some((r) => !/^\s*(?:🤖|💾|📝|📋)/u.test(r) && /(?<![\p{L}])[Nn]hà (?:anh|chị|mình|chú|cô|bác|em)(?![\p{L}])/u.test(r))) {
        const idLoai = tinTrongLuot ?? sellerRow.active_listing_id;
        const { data: lLoai, error: llErr } = idLoai
          ? await client.from("listings").select("property_type").eq("id", idLoai).maybeSingle()
          : { data: null, error: null };
        if (llErr) await ghiLoi(client, "chat-reply doc loai tin (goi dung loai)", llErr.message);
        const pt = (lLoai as { property_type?: string | null } | null)?.property_type ?? null;
        if (LOAI_DAT.has(pt ?? "") || pt === "chung_cu") {
          sach = sach.map((r) => /^\s*(?:🤖|💾|📝|📋)/u.test(r) ? r : LOAI_DAT.has(pt ?? "") ? goiDat(r) : goiCanHo(r));
          mocVan("goiDungLoai");
        }
      }
      // 23/09/2026 (FR-218 b): khách nói bot hiểu / ghi nhầm mà không câu nào xin lỗi → chèn lời xin lỗi (trước đổi xưng hô).
      if (luatDu) sach = themXinLoiKhiHieuNham(text, sach, goiNguoi); mocVan("themXinLoiKhiHieuNham");
      // 30/09/2026 (chủ dự án chat thử): "Mình cho mình xin địa chỉ" (bot tự xưng "mình"), "vị trí khá thuận tiện" (khen suông).
      if (luatDu) sach = sach.map(botXungEm); mocVan("botXungEm");
      if (luatDu) sach = boKhenViTri(sach); mocVan("boKhenViTri");
      // 02/10/2026 (test tay chủ dự án, SRS-5.1ze): "Ừ anh đang muốn bán…" mà bot gọi "anh chị" suốt — luật tự xưng là danh sách mẫu
      // câu. Chế độ `ai`: chưa biết cách gọi mà AI đọc ra khách tự xưng (code kiểm trích dẫn, `docTuXung`) → ghi hồ sơ, gọi đúng
      // NGAY lượt này. Luật (`tuXungTuCau`) vẫn chạy ở đầu nhánh làm lưới đỡ.
      let goiLuot = goiNguoi;
      // 05/10/2026 (SRS-5.1zx): không gài theo chế độ `ai` nữa — có lượt bóc tách là đọc; trích dẫn được nằm trong tin cũ.
      if (!goiLuot && bongAi) {
        const kqX = await bongAi;
        const tx = kqX?.ket ? docTuXung(kqX.tuXung, text, tinChuNhaGoc()) : null;
        if (tx) {
          const xh = tx.la as XungHo;
          const { error: txErr } = await client.from("sellers").update({ xung_ho: xh, ...suyTuXungHo(xh) }).eq("id", sellerRow.id);
          if (txErr) await ghiLoi(client, "chat-reply sellers.xung_ho(ai)", txErr.message);
          else {
            sellerRow.xung_ho = xh;
            sellerRow.nhom_tuoi = suyTuXungHo(xh).nhom_tuoi;
            goiLuot = xh;
            sach = sach.map((r) => r.replace(/anh\/chị|Anh\/chị|anh chị|Anh chị/g, (m) => /^A/.test(m) ? (xh.charAt(0).toUpperCase() + xh.slice(1)) : xh));
          }
        }
      }
      mocVan("goiTheoTuXungAi");
      // 16/09/2026: khách là chú/cô/bác → mọi "em" (câu tiền định lẫn model) thành "cháu".
      sach = doiTuXung(sach, sellerRow.xung_ho ?? null, sellerRow.nhom_tuoi ?? null); mocVan("doiTuXung");
      // 22/09/2026: người lớn tuổi chưa rõ chú hay cô → không "anh chị", gọi "mình" (câu tiền định lẫn model).
      if (!goiLuot && sellerRow.nhom_tuoi === "lon_tuoi") sach = sach.map((r) => r.replace(/anh\/chị|Anh\/chị|anh chị|Anh chị/g, (m) => /^[AĐ]/.test(m) ? "Cô chú" : "cô chú")); mocVan("coChuLonTuoi");
      // 22/09/2026 (kịch bản E): khách xưng "tui" mà model hỏi "…vậy anh?" — đoán giới tính. Chưa biết cách gọi thì
      // "anh"/"chị" đứng cuối câu (trước dấu hỏi/chấm) thành "ạ"; "anh chị" (đủ cặp) và "anh Thu" không đụng.
      // 02/10/2026: gom vào `boGoiCuoiVaOi` (dùng chung với nhánh mua), thêm dạng gọi "anh ơi / chị ơi".
      if (luatDu && !goiLuot) sach = sach.map(boGoiCuoiVaOi); mocVan("boGoiCuoiVaOi");
      // 21/09/2026 (chủ dự án "làm cả 4"): chưa biết cách gọi → "anh/chị" gạch chéo là chữ máy; người bán
      // hàng thật nói "anh chị". Áp cho mọi bong bóng (tiền định lẫn model) ở một chỗ.
      // SRS-5.1zzzzj: gạch chéo / gạch dài là CHỮ IN (không phải văn phong) — luôn chuẩn ở đây, mọi nguồn (câu code, lời model) đều qua.
      // TONE_RULES cấm cả hai, nên lưới này chỉ giữ đúng điều prompt nói; công tắc `luat_loi_bot` vẫn tắt các van sửa VĂN khác.
      if (!goiLuot) sach = sach.map(boGachCheo); mocVan("boGachCheo");
      if (luatDu && !goiLuot && sellerRow.nhom_tuoi !== "lon_tuoi") sach = sach.map(boDoanGioiDauCau); mocVan("boDoanGioiDauCau");
      // 22/09/2026 (bộ đo giọng B08): câu tiền định "Dạ em là trợ lý AI…" đứng trước, model chép lại gần
      // nguyên văn ở bong bóng sau → chủ nhà đọc hai lần. Câu ≥ 6 từ trùng nhau chỉ giữ lần đầu.
      if (luatDu) sach = boCauTrung(sach); mocVan("boCauTrung");
      // SRS-5.1zi: không nói "hệ thống đã gửi…" với khách; câu khen mở đầu trỏ ngược ("điểm này") mà không có gì để trỏ thì bỏ.
      // 05/10/2026: hai van SỬA VĂN này theo công tắc `luat_loi_bot` (gọn = tắt) — prompt đã dặn, không cắt lời model nữa.
      if (luatDu) { const sHt = boCauTroNguocDauBong(boCauNoiHeThong(sach)); if (sHt.length) sach = sHt; } mocVan("boCauNoiHeThong+boCauTroNguocDauBong");
      // 02/10/2026 (bắn lại thu-gapc-03, SRS-5.1ze): sau chuỗi lọc, một bong bóng chỉ còn ")" (mảnh của ":)" khi câu trước bị cắt).
      // Dòng không còn chữ / số / biểu tượng nào thì bỏ — áp chung cho mọi lọc phía trên, không đi tìm từng lọc.
      sach = sach.map((r) => r.split("\n").filter((d) => !d.trim() || /[\p{L}\d\p{Extended_Pictographic}]/u.test(d)).join("\n").trim()).filter(Boolean); mocVan("boDongRong");
      // 24/09/2026 (chủ dự án): model không tự hỏi hoàn công — cắt mệnh đề hỏi hoàn công trong lời bot, TRỪ KHI
      // bảng rẽ nhánh (FR-223) vừa mở câu `hoan_cong` cho người này (sổ riêng, chưa nhắc hoàn công).
      if (sach.some((r) => /\?/.test(r) && /\bhoan cong\b/.test(boDau(r)))) {
        const { data: lsHc, error: lsHcErr } = await client.from("listings").select("id").eq("seller_id", sellerRow.id).limit(30);
        const idsHc = (lsHc ?? []).map((x: { id: string }) => x.id);
        let coCauHc = false;
        if (lsHcErr) await ghiLoi(client, "chat-reply doc tin (hoan cong)", lsHcErr.message);
        else if (idsHc.length) {
          const { data: hc, error: hcErr } = await client.from("info_requests").select("id").in("listing_id", idsHc)
            .eq("question", "hoan_cong").eq("status", "pending").limit(1);
          if (hcErr) await ghiLoi(client, "chat-reply doc cau hoan cong", hcErr.message);
          coCauHc = (hc ?? []).length > 0;
        }
        sach = boHoiHoanCong(sach, coCauHc); mocVan("boHoiHoanCong");
      }
      sach = sach.map(boGachDai); mocVan("boGachDai");
      // SRS-5.1zm (03/10/2026): cả lượt chỉ một bong bóng hỏi (2–3 ý gần nhau gộp trong bong bóng đó vẫn được).
      sach = motCauHoiLuot(sach); mocVan("motCauHoiLuot");
      // SRS-5.1zzzzzy (Zalo thật 13/10: bot "Căn Trương Đình Hối này…"): tên riêng của căn trong lời bot lệch DẤU so với tên đã biết (cột
      // tin đầu lượt + ô vị trí / phường vừa ghi lượt này) → thay đúng tên. Lưới an toàn luôn bật, không phải van sửa văn.
      {
        const tenBiet: Array<string | null | undefined> = [];
        const tenTran = (dc: string | null | undefined) => dc ? tenDuong(dc).replace(/^(?:đường|duong|phố|pho)\s+/iu, "") : null;
        for (const t of idsTinDauLuot?.values() ?? []) tenBiet.push(t.street, t.ward, tenTran(t.location_raw));
        for (const g of ghiLuot) if (g.question === "vi_tri") tenBiet.push(tenTran(g.ghi)); else if (g.question === "phuong") tenBiet.push(g.ghi);
        sach = suaTenRiengLechDau(sach, tenBiet); mocVan("suaTenRiengLechDau");
      }
      // 23/09/2026 (bắn 26 tin): "Căn góc view thoáng khó bán lắm cô" — khen mà nói ngược nghĩa.
      if (luatDu) sach = suaKhenNguocNghia(sach); mocVan("suaKhenNguocNghia");
      ackSua = null;
      ackGhiGop = null;
      ackAnh = [];
      thongBaoNhan = null;
      // 14/09/2026 — chủ dự án: "nhắn tin lại cho khách LIỀN SAU tin nhắn đó đã bóc
      // tách (thật vào db) gì luôn". Bong bóng 💾 luôn là tin ĐẦU TIÊN của lượt. Lượt
      // tạo tin thì "📝 Em ghi nhận" (ghép từ chữ khách gõ) trùng với 💾 (đọc DB) —
      // bỏ 📝 (câu "Sai chỗ nào … nhắn lại" đã bỏ hẳn 23/09/2026 — chủ dự án).
      // FR-208 bước 2: chế độ `ghi` phải CHỜ lượt AI (đã chạy song song từ đầu nhánh) để ghi
      // fact rồi báo ngay trong lượt này — "đã lưu thì phải ghi rõ lưu vào trường nào" (17/09).
      const cheDoAi = cheDoBocAi ? await cheDoBocAi : "tat";
      let bongAdmin: string | null = null;
      // 21/09/2026: ghi fact AI TRƯỚC khi 💾 đọc lại DB — dòng 🤖 riêng đã bỏ, fact AI hiện chung trong "🤖 Đã lưu".
      if (cheDoAi === "ghi" || cheDoAi === "chinh") await ghiBongBocTach(extra);
      await ganNhanChoTin(extra);
      // FR-214 (e) — SAU khi mọi đường (kể cả AI chế độ ghi/chinh) đã ghi DB: câu "cháu ghi 7 tỷ căn Quận 11" phải khớp giá thật của một tin người này đang có.
      // SRS-5.1zzj/zzk: bong bóng tài liệu dự án / nhập bảng là CHỮ CODE ghép từ dữ liệu vừa ghi (giá niêm yết, m² trong kho) — không
      // phải lời model, không đối chiếu với tin của người này.
      const bongDuLieu = extra.tai_lieu_du_an === true || extra.nhap_ro_hang === true;
      if (!bongDuLieu && sach.some((r) => /\b(?:ghi|luu|cap nhat|sua)\b/.test(boDau(r)) && CO_TIEN_KD.test(boDau(r)))) {
        const { data: giaTin, error: gtErr } = await client.from("listings").select("price_vnd").eq("seller_id", sellerRow.id).not("price_vnd", "is", null).limit(20);
        if (gtErr) await ghiLoi(client, "chat-reply doi chieu gia da ghi", gtErr.message);
        else {
          const truoc = sach;
          sach = boCauGhiTienKhongCo(sach, ((giaTin ?? []) as Array<{ price_vnd: number | string }>).map((g) => Number(g.price_vnd)), docTien); mocVan("boCauGhiTienKhongCo");
          if (sach !== truoc) console.log("chat-reply: bỏ câu 'đã ghi' có số tiền không có trong DB");
        }
      }
      // 24/09/2026 (bắn lại người bán Gò Vấp): khách nhắn "137/28 nhé em…" (số nhà), DB đúng (diện tích trống) mà model
      // vẫn viết "137m2 trên sổ, khuôn đất này dễ xây lắm". Câu model nói số m² KHÔNG có trong tin của người này và
      // khách cũng không gõ → bỏ câu đó. Lượt ẢNH (sổ đỏ: "sổ ghi 60m2, tin ghi 50m2") là bong bóng code đọc từ ảnh — không đụng.
      if (extra.anh !== true && !bongDuLieu && !imageUrl && sach.some((r) => !/^\s*(?:🤖|💾|📝|📋)/u.test(r) && M2_TRONG_CAU.test(r))) {
        const { data: dtTin, error: dtErr } = await client.from("listings").select("area_m2").eq("seller_id", sellerRow.id).not("area_m2", "is", null).limit(20);
        if (dtErr) await ghiLoi(client, "chat-reply doi chieu m2", dtErr.message);
        else {
          const truoc = sach;
          sach = boCauM2KhongCo(sach, ((dtTin ?? []) as Array<{ area_m2: number | string }>).map((d) => Number(d.area_m2)), text); mocVan("boCauM2KhongCo");
          if (sach !== truoc) console.log("chat-reply: bỏ câu model nói số m² không có trong DB");
        }
      }
      if (sach.length) {
        const bl = await baoLaiDaLuu(extra);
        // 01/10/2026 (chủ dự án test Zalo, gửi album ảnh): lượt ẢNH không có chữ để bóc — "🤖 Không bóc tách được gì" là ồn.
        if (extra.anh === true && (!bl.bong || bl.bong.startsWith(KHONG_BOC))) {
          const loaiAnh = Array.isArray(extra.anh_loai) ? (extra.anh_loai as string[]) : [];
          const soAnh = typeof extra.so_anh === "number" && extra.so_anh > 1 ? `${extra.so_anh} ảnh: ` : "";
          // SRS-5.1zzzzzs: bìa sổ đọc ra loại sổ → 🤖 in thêm dòng pháp lý (cùng khuôn "• nhãn: giá trị" của lượt chữ).
          const plAnh = typeof extra.anh_phap_ly === "string" && extra.anh_phap_ly ? `\n• pháp lý: "${extra.anh_phap_ly}"` : "";
          bl.bong = bl.cheDo !== "tat" && loaiAnh.length ? `${TU_ANH} ${soAnh}${loaiAnh.join(", ")}${plAnh}` : null;
        }
        // FR-239 g: lượt này không lưu được gì mà model "Dạ, em ghi lại rồi anh" → bỏ câu ghi nhận suông.
        // Bỏ xong không còn câu nào ("dạ em" → "Dạ em ghi nhận rồi ạ.") thì đáp một lời gật, không để khách chỉ thấy 🤖.
        if (bl.bong?.startsWith(KHONG_BOC) || bl.bong?.startsWith(HIEU_LUOT)) { const bo = boGhiNhanSuong(sach); sach = bo.length ? bo : sach.length ? ["Dạ vâng ạ."] : sach; } mocVan("boGhiNhanSuong");
        // 05/10/2026 (văn phong demo AOND, SRS-5.1zzi): chế độ `admin` — 🤖 chỉ ghi `messages` cho /admin, KHÔNG gửi khách;
        // lời ghi nhận của model vì thế là lời xác nhận duy nhất, giữ nguyên (không `boCauGhiNhan`).
        if (bl.bong && bl.cheDo === "admin") bongAdmin = bl.bong;
        // SRS-5.1zzzm (08/10, bắn thử …kb3mgioi): nhánh "căn 1 …, căn 2 …" TỰ SOẠN bong bóng 🤖 (bao_lai_tat) — nó đi thẳng tới
        // khách kể cả khi công tắc là `admin` (🤖 chỉ cho /admin). Chế độ admin: mọi bong bóng 🤖 trong lời đáp về /admin. (`tat` giữ như cũ: nhánh đó là lời xác nhận duy nhất ghi gì cho căn nào.)
        if (bl.cheDo === "admin") {
          const tuSoan = sach.filter((r) => r.startsWith(DAU_BAO_LAI));
          if (tuSoan.length) {
            sach = sach.filter((r) => !r.startsWith(DAU_BAO_LAI));
            bongAdmin = [bongAdmin, ...tuSoan].filter(Boolean).join("\n");
          }
        }
        if (bl.bong && bl.cheDo !== "admin") {
          // 14/09/2026 (bắn thật): 💾 đã nói lưu gì, nên "Dạ em ghi số phòng ngủ 4 rồi ạ"
          // (bong bóng code) và "Dạ em ghi 1 trệt 3 lầu… rồi" (model) là ghi nhận lần hai,
          // lần ba. Bỏ bong bóng ghi nhận của code và câu ghi nhận CÓ nội dung của model.
          // 22/09/2026 (bộ đo giọng B04, chủ dự án chốt): lời SỬA THẬT ("Dạ em sửa lại giá 7 tỷ 5 rồi ạ")
          // giữ lại dù 🤖 đã in giá mới — chủ nhà vừa nói "à nhầm" cần một lời xác nhận ngắn; chỉ bỏ lời
          // "Dạ em ghi … rồi ạ" (ghi thêm) vì 🤖 đã nói đúng điều đó.
          if (ackDau && !/^Dạ em sửa lại/.test(ackDau)) sach = sach.filter((x) => x !== ackDau.trim());
          if (luatDu) sach = boCauGhiNhan(sach); mocVan("boCauGhiNhan");
          // 20/09/2026 (bắn thật mau-y-B): lượt đầu "Chào em, chị có…" → lời chào + "📝 Em ghi nhận" nằm
          // CHUNG một bong bóng ("Dạ em chào chị ạ!\n📝 Em ghi nhận: …"), startsWith không thấy → khách
          // đọc hai lần. Tìm dòng 📝 ở bất kỳ bong bóng nào: bỏ dòng đó, phần còn lại nối sau 💾.
          // 21/09/2026 (bắn thật kiem-cc, chú lớn tuổi): `doiTuXung` chạy TRƯỚC đoạn này nên dòng đã thành
          // "📝 Cháu ghi nhận" → startsWith("📝 Em…") không thấy → chú đọc hai lần. So theo dấu 📝 + "ghi nhận".
          const laDongGN = (d: string) => /^📝 \S+ ghi nhận/u.test(d);
          const iGN = sach.findIndex((x) => x.split("\n").some(laDongGN));
          if (iGN >= 0) {
            const dong = sach[iGN].split("\n");
            const j = dong.findIndex(laDongGN);
            const duoi = dong.slice(j + 1).join(" ").trim();
            const truoc = dong.slice(0, j).join("\n").trim();
            if (truoc) sach.splice(iGN, 1, truoc); else sach.splice(iGN, 1);
            sach.unshift(duoi ? `${bl.bong}\n${duoi}` : bl.bong);
          } else if (!sach.length) sach = [bl.bong];
          else sach.unshift(bl.bong);
          // 23/09/2026 (bắn 26 tin): lượt đầu "Chào em, chị cần bán…" → "🤖 Đã lưu …" rồi mới "Dạ em chào chị ạ!".
          // Câu chào trơn đứng sau dòng 🤖 thì đưa lên đầu.
          const iChao = sach.findIndex((x, i) => i > 0 && /^(?:Dạ,?\s+)?(?:em|cháu)\s+chào\s+[^.!?\n]{0,25}[.!]?\s*$/iu.test(x.trim()));
          if (iChao > 0 && sach[0].startsWith(DAU_BAO_LAI)) { const [chao] = sach.splice(iChao, 1); sach.unshift(chao); }
        }
      }
      // SRS-5.1zt: câu báo đã lưu nhu cầu mua — đứng trước câu hỏi cuối (nếu có), để lượt vẫn kết bằng câu hỏi.
      if (cauMuaKem) {
        const iHoi = sach.length && /\?\s*$/.test(sach.at(-1)!) ? sach.length - 1 : sach.length;
        sach.splice(iHoi, 0, cauMuaKem);
      }
      // SRS-5.1zzzzzq: tin chủ nhà mới hơn tới trong lúc lượt này chạy → không ghi, không gửi (xem `kiemTinMoiHon`).
      // SRS-5.1zzzzzzu: lượt đã đưa tin lên kệ (`daDuyetLuot`) thì không nhường — chủ nhà phải biết tin đã đăng.
      if (sach.length && kiemTinMoiHon && !daDuyetLuot) {
        let moiHon = false;
        try { moiHon = await kiemTinMoiHon(); } catch (e) { await ghiLoi(client, "chat-reply kiem tin moi hon (ban)", e); }
        if (moiHon) {
          console.log("chat-reply: tin chủ nhà mới hơn tới trước khi gửi → nhường lượt");
          // SRS-5.1zzzzzzb (Zalo thật 13/10/2026 17:22–17:23): lượt "Đất có sổ đỏ chính chủ" soạn BẢN NHÁP và đã mở câu chờ `duyet_tin`,
          // rồi nhường lượt vì ảnh tới — bản nháp KHÔNG tới khách mà câu chờ vẫn mở; lượt ảnh thấy `duyet_tin` nên nói "Bản nháp ở trên…
          // nhắn ok" trong khi chưa có bản nháp nào. Trạng thái phải khớp điều khách thấy: nhường lượt mà lời mang bản nháp thì đóng
          // câu chờ duyệt vừa mở (chỉ câu mở TRONG lượt này — câu duyệt của bản nháp đã gửi trước đó giữ nguyên); lượt sau hết câu
          // hỏi sẽ soạn và gửi bản nháp lại như thường.
          // SRS-5.1zzzzzzp: tổng quát — rút MỌI câu chờ lượt này mở (`cauMoLuot`), không chỉ câu duyệt bản nháp.
          const nhapRut = await rutCauMoLuot();
          return await hoanTat({ reply: null, replies: [], role: "seller", superseded: true, superseded_luc: "truoc_gui", ...(nhapRut ? { nhap_rut: true } : {}), ...extra });
        }
      }
      // MỘT câu INSERT cho cả loạt bong bóng (FR-171 h): `seq` là identity nên
      // vẫn tăng theo thứ tự mảng trong một INSERT.
      if (sach.length) {
        const { error: botErr } = await client.from("messages").insert(
          [...(bongAdmin ? [bongAdmin] : []), ...sach].map((r) => ({ conversation_id: convSId, sender: "bot", body: r })),
        );
        // Ghi hụt câu bot vừa nói = sổ một chiều (có trả lời, không có câu hỏi).
        // Không chặn đường trả lời chủ nhà, nhưng phải vào bot_errors (FR-152).
        if (botErr) await ghiLoi(client, "chat-reply messages bot(seller)", botErr.message);
      }
      // SRS-5.1zzn: sổ van — MỘT câu insert, chỉ khi có van đổi lời. Ghi hụt vào bot_errors, không chặn trả lời.
      if (soVan.ds.length) {
        const { error: vkErr } = await client.from("van_kich").insert(soVan.ds.map((d) => ({ conversation_id: convSId, nhanh: soVan.nhanh, ...d })));
        if (vkErr) await ghiLoi(client, "chat-reply van_kich(seller)", vkErr.message);
      }
      // FR-208: ghi sổ bóng SAU khi mọi luật đã ghi DB — chạy nền nếu runtime cho phép
      // (khách không phải chờ lượt model bóng), không thì chờ ngay tại đây.
      if (cheDoAi !== "ghi" && cheDoAi !== "chinh") {
        const viecBong = ghiBongBocTach(extra);
        const nen = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
        if (nen?.waitUntil) nen.waitUntil(viecBong);
        else await viecBong;
      }
      return await hoanTat({
        reply: sach.join("\n") || null, replies: sach, role: "seller", van_kich: tenVanKich(soVan), ...(bongAdmin ? { bao_lai_admin: bongAdmin } : {}), ...extra,
      });
    };

    // ─── FR-176: NGỮ CẢNH CHUNG cho mọi lượt gọi model của nhánh người bán.
    // Trước bản này mỗi lượt là một cuộc gọi CỤT: model chỉ thấy đúng một câu
    // lệnh "chủ nhà vừa trả lời X, khen rồi hỏi Y", không thấy 5 tin trước —
    // nên tin nào cũng cùng khuôn (khen + mã căn + hỏi + "khách hay hỏi lắm"),
    // và "kêu chị nha" sống đúng một lượt rồi câu sau lại "anh". Sếp đọc log
    // 07/09/2026: "con AI nhắn không tự nhiên". Nay: 8 tin gần nhất + cách gọi
    // đã dặn (`sellers.xung_ho`, migration 20260907d) đi vào MỌI lượt.
    // 11/09/2026 (42 ca): khách TỰ XƯNG ("anh bận", "e oi a can ban nha", "chị Lan
    // đây em") cũng là lời dặn — chưa biết gọi sao thì nhận luôn, lời dặn tường
    // minh ("kêu chị nha") vẫn thắng và vẫn đổi được cách gọi cũ.
    // 16/09/2026 (Zalo thật): "Chào cháu chú có căn nhà…" → gọi "chú", tự xưng "cháu", và
    // ghi luôn giới tính + nhóm tuổi suy từ cách gọi (`sellers.gioi_tinh/nhom_tuoi`, 20260916a).
    // 17/09/2026 (Zalo thật): khách đổi "chú" → "cô" giữa chừng mà bot vẫn gọi "chú" — cách tự
    // xưng MỚI NHẤT thắng, không chỉ nhận lần đầu.
    const xungHoMoi = batXungHo(text) ?? tuXungTuCau(text);
    if (xungHoMoi && xungHoMoi !== sellerRow.xung_ho) {
      const { error: xhErr } = await client.from("sellers")
        .update({ xung_ho: xungHoMoi, ...suyTuXungHo(xungHoMoi) }).eq("id", sellerRow.id);
      if (xhErr) await ghiLoi(client, "chat-reply sellers.xung_ho", xhErr.message);
      else { sellerRow.xung_ho = xungHoMoi; xungHoVuaGhi = xungHoMoi; }
    }
    // 22/09/2026 (chủ dự án: "cô chào cháu nó vẫn đáp anh chị"): "chào cháu" mà không xưng chú/cô → biết là
    // người lớn tuổi, chưa biết chú hay cô: bot xưng cháu, gọi "mình", không "anh chị" (`nhom_tuoi` ghi trước,
    // `xung_ho` chờ câu có xưng). Hồ sơ bán vừa mở từ hàng mua thì mang cách gọi đã học ở lượt chào sang.
    if (!xungHoMoi && !sellerRow.xung_ho) {
      let nhomMoi: "lon_tuoi" | null = laChaoChau(text) ? "lon_tuoi" : null;
      let xhTuMua: XungHo | null = null;
      if (sellerMoi) {
        const { data: bPref } = await client.from("buyers").select("preferences").eq("zalo_user_id", externalUserId).maybeSingle();
        const p = (bPref?.preferences ?? {}) as { xung_ho?: unknown; nhom_tuoi?: unknown };
        if (typeof p.xung_ho === "string" && XUNG_HO_HOP_LE.has(p.xung_ho)) xhTuMua = p.xung_ho as XungHo;
        else if (p.nhom_tuoi === "lon_tuoi") nhomMoi = "lon_tuoi";
      }
      if (xhTuMua) {
        const { error: xmErr } = await client.from("sellers").update({ xung_ho: xhTuMua, ...suyTuXungHo(xhTuMua) }).eq("id", sellerRow.id);
        if (xmErr) await ghiLoi(client, "chat-reply sellers.xung_ho(tu mua)", xmErr.message);
        else { sellerRow.xung_ho = xhTuMua; sellerRow.nhom_tuoi = suyTuXungHo(xhTuMua).nhom_tuoi; }
      } else if (nhomMoi && sellerRow.nhom_tuoi !== "lon_tuoi") {
        const { error: ntErr } = await client.from("sellers").update({ nhom_tuoi: nhomMoi }).eq("id", sellerRow.id);
        if (ntErr) await ghiLoi(client, "chat-reply sellers.nhom_tuoi", ntErr.message);
        else sellerRow.nhom_tuoi = nhomMoi;
      }
    }
    // FR-181: ghi tên trợ lý vào hồ sơ người bán — CRM và `so.nguoi_ban` đọc cột này để biết ai đang chăm khách.
    // SRS-5.1zzzzzzz9: kho tên đổi (14/10/2026) thì cột lưu tên cũ — ghi lại khi khác tên đang dùng, không chỉ khi trống.
    if (sellerRow.ten_tro_ly !== tenBot) {
      const { error: tenErr } = await client.from("sellers")
        .update({ ten_tro_ly: tenBot }).eq("id", sellerRow.id);
      if (tenErr) await ghiLoi(client, "chat-reply sellers.ten_tro_ly", tenErr.message);
      else sellerRow.ten_tro_ly = tenBot;
    }
    // 02/10/2026 (chủ dự án: "để AI có cache để đọc lại nguyên tin nhắn của khách để ko mất"): đọc 40 tin gần nhất (một truy
    // vấn như cũ) — 9 tin cuối làm lịch sử lượt như trước, phần tin CHỦ NHÀ làm "bộ nhớ" nguyên văn cho AI bóc tách.
    const [{ data: lichSuDaiTho }, { data: tinCuaNguoi }] = await Promise.all([
      // SRS-5.1zzzzo: `created_at` để đếm khách đã nhắn mấy lượt từ lúc câu đang treo mở (`soLuotTreo`, lượt bên lề).
      client.from("messages").select("sender, body, seq, created_at")
        .eq("conversation_id", convSId).order("seq", { ascending: false }).limit(40),
      // FR-214 b: danh sách tin người này đang rao — `nhieuCan` đếm, bộ gán mảnh đọc mã/loại/nơi chốn/giá.
      // SRS-5.1zzzzo: thêm vài cột số / chữ của tin — ảnh chụp "trước lượt" (`docTruocLuot`) đọc cột từ đây, không tốn truy vấn riêng.
      client.from("listings").select(`id, code, status, project_id, ${COT_TRUOC_LUOT}`)
        .eq("seller_id", sellerRow.id).order("created_at", { ascending: true }).limit(10),
    ]);
    // SRS-5.1zzzzzzg: tin trước đã GỘP vào `text` lượt này không còn là lịch sử — bỏ, không thì model đọc chúng hai lần.
    const lichSuDai = ((lichSuDaiTho ?? []) as Array<{ sender: string; body: string | null; seq: number; created_at?: string | null }>)
      .filter((m) => !seqGop.has(m.seq));
    // SRS-5.1zzzzo: tin có từ ĐẦU lượt (cột lúc đầu lượt) — tin không nằm trong đây là tin vừa tạo lượt này (ảnh chụp "trước lượt" rỗng).
    // Danh sách bị cắt ở 10 tin thì không kết luận được — để null (ảnh chụp đọc cột bằng truy vấn riêng).
    idsTinDauLuot = (tinCuaNguoi ?? []).length < 10
      ? new Map(((tinCuaNguoi ?? []) as unknown as Array<DongTruoc & { id: string }>).map((t) => [t.id, { ...t }]))
      : null;
    const lichSuS = ((lichSuDai ?? []) as Array<{ sender: string; body: string | null; seq: number; created_at?: string | null }>).slice(0, 9);
    /** Tin chủ nhà TRƯỚC tin này, NGUYÊN VĂN, cũ → mới (bỏ tin vừa nhắn — câu lệnh dẫn riêng), tổng ≤ 6.000 chữ. Trước đây AI
     *  bóc tách chỉ thấy 4 lượt, mỗi lượt cắt 220 chữ. */
    const tinChuNhaGoc = (): string[] => {
      const nguoi = ((lichSuDai ?? []) as Array<{ sender: string; body: string | null }>).filter((m) => laTinNguoi(m.sender));
      const ds = nguoi.map((m) => thayLienHe((m.body ?? "").trim(), "[liên hệ]")).filter((b) => b && !laTinRongNghia(b));
      if (ds.length && ds[0] === thayLienHe(textTinNay.trim(), "[liên hệ]")) ds.shift(); // SRS-5.1zzzzzzg: so với tin đơn đã ghi sổ, không so bản gộp
      const ra: string[] = [];
      let tong = 0;
      for (const b of ds) {
        if (tong + b.length > 6000) break;
        ra.unshift(b);
        tong += b.length;
      }
      return ra;
    };
    // 05/10/2026 (SRS-5.1zx, hội thoại test 02/10: khách "Anh nói đó…", "Nhà a 4 tầng…" mà hỏi bù 04/10 vẫn "mình"): chưa biết
    // cách gọi thì học lại từ TIN CŨ của khách (luật, miễn phí) — lượt có câu tự xưng bị bỏ sót không còn làm hồ sơ trống mãi.
    // AI đọc tự xưng (có trích dẫn, kể cả trích từ tin cũ) chạy ở `traLoiSeller` và ghi đè nếu đọc ra.
    if (!sellerRow.xung_ho) {
      const xhLs = hocXungHoTuLichSu(tinChuNhaGoc());
      if (xhLs) {
        const { error: lsErr } = await client.from("sellers").update({ xung_ho: xhLs, ...suyTuXungHo(xhLs) }).eq("id", sellerRow.id);
        if (lsErr) await ghiLoi(client, "chat-reply sellers.xung_ho(lich su)", lsErr.message);
        else { sellerRow.xung_ho = xhLs; sellerRow.nhom_tuoi = suyTuXungHo(xhLs).nhom_tuoi; }
      }
    }
    const goiNguoi = sellerRow.xung_ho ?? null;
    const lonTuoiChuaRo = !goiNguoi && sellerRow.nhom_tuoi === "lon_tuoi";
    const cachGoi = goiNguoi ?? (lonTuoiChuaRo ? "cô chú" : "anh chị");
    // Bot tự xưng "cháu" với chú/cô/bác (mọi câu tiền định viết "em" → đổi ở đường ra `sach`).
    const tuXung = lonTuoiChuaRo ? "cháu" : tuXungBot(goiNguoi);
    // Câu phí tiền định cho hỏi ngược (FEE_RULES, theo nhãn) — 15/09/2026.
    // SRS-5.1zzq: loại giao dịch của người này để câu phí nói đúng (thuê = 3/4 tháng). Ưu tiên căn đang chăm; mọi căn cùng một
    // loại thì lấy loại đó; lẫn bán và thuê thì null (câu phí nói chung, không bịa).
    const dealNguoi: string | null = (() => {
      const ds = ((tinCuaNguoi ?? []) as Array<{ id: string; deal?: string | null }>);
      const dang = ds.find((t) => t.id === sellerRow.active_listing_id)?.deal;
      if (dang) return dang;
      const cac = [...new Set(ds.map((t) => t.deal).filter((d): d is string => !!d))];
      return cac.length === 1 ? cac[0] : null;
    })();
    const phiCauSeller = cauPhi(vaiPhi(sellerRow), dealNguoi, { benEm: true });
    const CachGoi = goiNguoi ? goiNguoi.charAt(0).toUpperCase() + goiNguoi.slice(1) : lonTuoiChuaRo ? "Cô chú" : "Anh chị";
    // Điền ô cho câu tiền định (FR-138 b). Ô thiếu dữ liệu → câu rỗng, tầng gọi bỏ.
    const cauTD = (khoa: string, o: Record<string, string | number | null | undefined> = {}) =>
      dienCau(CAU_TD[khoa] ?? "", { ac: cachGoi, Ac: CachGoi, web: "AI Ơi Nhà Đất", ten: tenBot, ...o });
    /**
     * SRS-5.1zzzzzo (chủ dự án 13/10/2026: "mà chú biết phí bên cháu chưa ạ, thì nói là xin phép báo mức phí của bên cháu khi giao dịch
     * thành công luôn"): lúc tin lên kệ BÁO THẲNG phí thay cho câu hỏi "biết phí bên em chưa" (khoá `dang_xong_phi` cũ). Con số chỉ do
     * `cauPhi(vaiPhi(…))` nói; vai chưa xác nhận thì câu không số + câu hỏi vai (lượt khách nói vai báo số — `dapPhiRoVai` / `dapPhiR3`).
     */
    // Vai chưa rõ: câu phí đã nêu cả hai mức (PHI_THAN.chung) — không hỏi thêm vai. Chữ câu ở `cauBaoPhi` (prompts.ts), một nguồn.
    const cauBaoPhiLenKe = (deal: string | null | undefined): string => cauBaoPhi(vaiPhi(sellerRow), deal);
    /**
     * SRS-5.1zzzzz: chủ nhà đã duyệt / bảo đăng mà tin chưa lên kệ (`listing_du_dang_tin`: giá, diện tích, phường) — MỘT chỗ nói còn
     * thiếu gì. Thiếu phường: mở câu phường; tra được từ tên đường (và chủ nhà chưa nói không biết) → hỏi xác nhận; không thì nói
     * chỗ tìm phường. Trước đây nhánh gật bản nháp nói "tin còn thiếu một chút" không nêu thứ gì.
     */
    const noiThieuDeDang = async (listingId: string): Promise<{ cau: string; meta: Record<string, unknown> }> => {
      const { data: sau } = await client.from("listings").select("ward, area_m2, price_vnd, boc_tach").eq("id", listingId).maybeSingle();
      const thieuDang = [!sau?.ward ? "phường" : null, sau?.area_m2 == null ? "diện tích" : null, sau && sau.price_vnd == null ? "giá" : null]
        .filter(Boolean).join(" và ") || "vài thông tin";
      // SRS-5.1zzzzze (chủ dự án 12/10/2026 chọn (b): giữ bắt buộc phường; khách mô phỏng lần bảy: khách không biết phường, không tìm thấy
      // sổ, bảo "cứ đăng trước" → bot hứa "chị cứ đăng trước được" rồi vẫn hỏi phường mãi). Khách đã nói không biết phường, hoặc em đã nói
      // "chỉ còn thiếu phường" rồi → nói thẳng MỘT lần: chưa đăng được vì thiếu phường, em giữ tin, biết thì nhắn — không mở lại câu phường.
      // Còn thiếu cả diện tích / giá thì câu "còn thiếu …" dưới nói đủ mọi thứ, nhưng vẫn không mở lại câu phường khách đã nói không biết.
      const daNoiThieuPhuong = botDaNoiGan().includes(cauTD("dang_luon_thieu_phuong").slice(0, 30));
      const khongBietP = khongBietCua(sau?.boc_tach).includes("phuong");
      if (sau && !sau.ward && sau.area_m2 != null && sau.price_vnd != null && (khongBietP || daNoiThieuPhuong)) {
        return { cau: cauTD("dang_giu_thieu_phuong"), meta: { thieu_dang: thieuDang, loai_cau: "giu_thieu_phuong" } };
      }
      if (sau && !sau.ward && !khongBietP) {
        const { error: pErr } = await moCauTreo({ listing_id: listingId, question: "phuong", status: "pending" });
        if (pErr && pErr.code !== "23505") await ghiLoi(client, "chat-reply thieu de dang(mo phuong)", pErr.message);
        if (sau.area_m2 != null && sau.price_vnd != null) {
          // SRS-5.1zzy: đã có tên đường thì tự tra phường.
          const goiY = await cauHoiPhuongGoiY(listingId, null, cachGoi);
          if (goiY) return { cau: cauTD("dang_luon_goi_y_phuong", { goi_y: goiY }), meta: { thieu_dang: thieuDang, reask: "phuong", loai_cau: "goi_y_phuong" } };
          return { cau: cauTD("dang_luon_thieu_phuong"), meta: { thieu_dang: thieuDang, reask: "phuong", loai_cau: "thieu_phuong" } };
        }
      }
      return { cau: cauTD("dang_luon_thieu", { thieu: thieuDang }), meta: { thieu_dang: thieuDang } };
    };
    // Mã căn chỉ đáng nhắc khi người này rao TỪ HAI CĂN trở lên (FR-157 c sinh
    // ra cho người nhiều căn). Chính chủ một căn mà tin nào cũng "#BDS-Q5-0174"
    // là giọng máy đọc mã.
    const nhieuCan = (tinCuaNguoi ?? []).length >= 2;
    // Tin chủ nhà VỪA nhắn đã nằm trong sổ (ghi trước khi gọi model) — bỏ nó
    // khỏi lịch sử vì câu lệnh dẫn riêng.
    const lichSuRows = ((lichSuS ?? []) as Array<{ sender: string; body: string | null; seq: number; created_at?: string | null }>)
      .slice().reverse();
    /** Em đã nói phí với người này chưa (bất kỳ dạng: % giá chốt, tháng tiền thuê, câu dẫn phí) — để không dẫn phí lần hai. */
    // SRS-5.1zzzzj: câu phí KHÔNG số (vai chưa xác nhận — "mức tuỳ chính chủ hay môi giới") cũng là đã nói phí: đối chiếu đúng chữ `cauPhi()`
    // sinh (`coCauPhi`), không chỉ dò con số.
    /** SRS-5.1zzzzzc: lời bot gần đây nguyên văn — câu soạn sẵn (phí, thuế) đã nói y hệt thì không nói lại nguyên câu. */
    const botDaNoiGan = () => lichSuRows.filter((m) => !laTinNguoi(m.sender)).slice(-8).map((m) => m.body ?? "").join("\n");
    const daNoiPhiRoi = () => lichSuRows.some((m) => !laTinNguoi(m.sender) && (coCauPhi(m.body ?? "") || /giá chốt|0,5%|0\.5%|\b1%|tháng tiền thuê|biết phí bên em chưa/.test(m.body ?? "")));
    if (lichSuRows.length && laTinNguoi(lichSuRows[lichSuRows.length - 1].sender)) lichSuRows.pop();
    /** Lời bot NGAY TRƯỚC tin này, nguyên văn (bỏ bong bóng 🤖 báo lại) — câu bot thật sự vừa hỏi, không phải câu mẫu. */
    const cauBotThat = boBaoLai(lichSuRows.filter((m) => !laTinNguoi(m.sender)).map((m) => m.body ?? "").filter((b) => !!boBaoLai(b)?.trim()).at(-1) ?? null);
    // 30/09/2026: người CHƯA có tin nào — các tin họ nhắn trước câu rao (≤ 9 tin gần nhất) cũng là lời về căn sắp rao
    // (địa chỉ nói trước, giá nói sau). Nhánh tạo tin đọc thêm ở đây những gì câu rao không nói.
    const truocTin = (tinCuaNguoi ?? []).length === 0
      ? lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => (m.body ?? "").trim()).filter(Boolean).join("\n")
      : "";
    let textBongAi = text;
    // Bong bóng 💾 (báo lại thứ đã lưu) là bảng số liệu cho người bán, không
    // phải lời em nói — bỏ khỏi lịch sử, không thì model bắt chước in bảng.
    // 18/09/2026 (chủ dự án: "tắt cái mỗi câu trả lời đều khen đi, lâu lâu thì khen thôi"): 3 tin gần
    // nhất của bot đã có câu khen → lượt này dặn model KHÔNG khen, và lọc tiền định câu khen lọt.
    // FR-240 a (phát lại test 28/09 trên production): mỗi lượt bot gửi 2 tin (🤖 bóc tách + lời đáp), 🤖 bị `boBaoLai` làm rỗng
    // nên "3 tin gần nhất" chỉ còn hơn một lượt — khen ở lượt 3 rồi khen lại ở lượt 6. Đếm 3 LỜI ĐÁP thật.
    const khenGanDay = vuaKhen(lichSuRows.filter((m) => !laTinNguoi(m.sender)).map((m) => boBaoLai(m.body)).filter((b) => !!b?.trim()));
    const lichSuText = lichSuRows.map((m) => ({ ...m, body: boBaoLai(m.body) })).filter((m) => m.body)
      .map((m) =>
        `${laTinNguoi(m.sender) ? "CHỦ NHÀ" : m.sender === "human" ? "EM (người thật bên mình nhắn tay)" : "EM"}: ${
          (m.body ?? "").slice(0, 300)
        }`)
      .join("\n");
    /** Dòng "Gọi chủ nhà là …" của NGỮ CẢNH — tách ra để lượt nào AI vừa đọc ra khách tự xưng thì thay dòng này trước khi model viết. */
    const dongGoiChuNha = (goi: string | null): string => {
      const cg = goi ?? cachGoi;
      const tx = goi ? tuXungBot(goi) : tuXung;
      return `- Gọi chủ nhà là "${cg}"${
        goi ? ` - chủ nhà đã dặn, tuyệt đối không đổi, không dùng "anh/chị"` : ` (chưa biết nam hay nữ - KHÔNG tự đoán "anh" hay "chị"; gọi "${cg}" hoặc bỏ đại từ, KHÔNG gọi "mình")`
      }${tx === "cháu" ? `; tự xưng "cháu" (chủ nhà lớn tuổi), KHÔNG xưng "em"` : ""}.\n`;
    };
    let boiCanh =
      `NGỮ CẢNH (đọc kỹ trước khi viết):\n` +
      dongGoiChuNha(goiNguoi) +
      `- Lịch sử gần nhất, tin mới ở cuối. KHÔNG lặp lại khuôn câu, lời khen, hay lý do "khách hay hỏi" đã dùng trong đó; tin trước của em mở bằng "Dạ" thì tin này đổi cách mở ("Dạ vâng", "Vâng ạ", hoặc vào thẳng) nhưng vẫn lễ phép, câu hỏi kết bằng "ạ"; viết như người thật nhắn tay, mỗi tin một giọng:\n` +
      `${lichSuText || "(chưa có tin nào trước đó)"}\n\n`;
    // SRS-5.1zzzj (chat thử 08/10, …w44h): NGỮ CẢNH dựng TRƯỚC khi AI đọc tin này — khách tự xưng ngay lượt này ("cho anh") mà
    // model vẫn được dặn gọi "anh chị". Mọi chỗ gọi model lấy ngữ cảnh qua hàm này: AI đã đọc ra tự xưng (qua kiểm trích dẫn) thì
    // dòng cách gọi đổi trước khi model viết, không sửa chữ sau.
    // SRS-5.1zzzq (08/10/2026, bắn thử …kc2chau / …kc4thue): câu khách hỏi đã có bong bóng TIỀN ĐỊNH trả lời (phí / ảnh / bot) bị
    // CẮT khỏi tin đưa model viết lời — model không thấy câu hỏi thì không trả lời lại. Nơi dựng bong bóng đặt `cauDaDap`; mọi câu
    // lệnh viết lời lấy tin khách qua `tinChoModel()` (kể cả dòng "em đọc là" trong ngữ cảnh).
    let cauDaDap: string | null = null;
    const tinChoModel = (): string =>
      (cauDaDap ? anCauDaDap(text, cauDaDap) : text) || "(tin chỉ có câu hỏi đó, đã trả lời ở bong bóng trước)";
    // ─── SRS-5.1zzzzzb (khách mô phỏng 11/10, người lớn tuổi: "hẻm Quang Trung ở phường nào nhỉ" → model tự trả lời "phường Thạnh Lộc"
    // — phường của Quận 12, tin ở Gò Vấp; khách gật, tin ghi sai phường lẫn quận). LỚP LỖI: model viết lời có kiến thức riêng và trả
    // lời câu hỏi SỰ THẬT (địa danh, giá khu, quy hoạch) bằng trí nhớ, trong khi hệ thống CÓ bảng tra mà không đưa cho nó. Nguồn sự
    // thật của lời bot chỉ có ba: lời chủ nhà, thông tin đã ghi, và DỮ LIỆU TRA do code tra — khối này đưa phần thứ ba vào MỌI lượt
    // model viết (`boiCanhLuot`), và cũng là căn cứ hợp lệ cho lượt soát (`soatNhanXet`). Không tra ra thì nói rõ là không tra ra.
    let duLieuTraP: Promise<string> | null = null;
    const duLieuTra = (): Promise<string> => duLieuTraP ??= (async () => {
      const lid = pendingReq?.listing_id ?? sellerRow?.active_listing_id ?? null;
      if (!lid) return "";
      // Tin của câu đang treo đã nạp sẵn đủ cột (không đọc lại); không có câu treo mới đọc tin đang neo.
      const l = (pendingReq?.listings as { district?: string | null; ward?: string | null; street?: string | null; location_raw?: string | null; boc_tach?: unknown } | null | undefined) ??
        (await client.from("listings").select("district, ward, street, location_raw, boc_tach").eq("id", lid).maybeSingle()).data;
      if (!l) return "";
      const quanBiet = l.district && (l.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh !== true ? String(l.district) : null;
      if (l.ward) return `- Phường của tin: ${l.ward}${quanBiet ? `, ${quanBiet}` : ""} (đã ghi theo lời chủ nhà).\n`;
      const ten = chuanTenDuong((l.street ?? "").trim() || tenDuong(l.location_raw ?? ""));
      const chuaTra = `- Phường của tin: chưa có, và em CHƯA tra được phường${ten ? ` của đường ${ten}` : ""} — chủ nhà hỏi thì nói em chưa tra được, ` +
        `xin chủ nhà xem trên sổ hồng; KHÔNG tự nêu tên phường nào.\n`;
      const khoaSo = ten ? khoaDuongSo(ten) : null;
      // SRS-5.1zzzzzzm: chưa biết quận vẫn tra (bảng `duong` kể phường kèm quận cũ); đường SỐ thì phải biết quận.
      if (!ten || (!duongTraDuoc(ten) && !(khoaSo && quanBiet))) return chuaTra;
      const { data: dd, error } = await client.from("duong").select("phuong, quan_cu").eq("ten_khong_dau", khoaSo ?? boDau(ten)).limit(80);
      if (error) { await ghiLoi(client, "chat-reply du lieu tra (duong)", error.message); return chuaTra; }
      const cac = phuongQuanCuaDuong((dd ?? []) as Array<{ phuong: string | null; quan_cu: string | null }>, quanBiet, (p, q) => !!phuongCot(p, q));
      if (!cac.length) return chuaTra;
      const o = quanBiet ? ` ở ${quanBiet}` : "";
      const ke = (x: { phuong: string; quan: string }) => quanBiet ? x.phuong : `${x.phuong} (${x.quan} cũ)`;
      return cac.length === 1
        ? `- Bảng tên đường: đường ${ten}${o} thuộc ${ke(cac[0])}.\n`
        : `- Bảng tên đường: đường ${ten}${o} đi qua ${cac.length} phường: ${cac.slice(0, 8).map(ke).join(", ")} — chưa biết đoạn nhà chủ nhà thuộc phường nào; ` +
          `chủ nhà hỏi thì kể đúng các phường này và hỏi gần đoạn nào, KHÔNG tự chọn một phường.\n`;
    })().catch(() => "");
    const khoiDuLieuTra = async (): Promise<string> => {
      const d = await duLieuTra();
      return d ? `DỮ LIỆU TRA CỨU (hệ thống tra, chỉ nói địa danh / sự thật theo đây):\n${d}\n` : "";
    };
    const boiCanhLuot = async (): Promise<string> => (await boiCanhLuot0()) + (await khoiDuLieuTra());
    const boiCanhLuot0 = async (): Promise<string> => {
      if (!bongAi) return boiCanh;
      const k = await bongAi;
      const tx = !goiNguoi && k?.ket ? docTuXung(k.tuXung, text, tinChuNhaGoc()) : null;
      const bc = tx ? boiCanh.replace(dongGoiChuNha(null), dongGoiChuNha(tx.la)) : boiCanh;
      // SRS-5.1zzzn: tin gõ không dấu / tắt → bản AI đọc (qua `docLaiHopLe`) đứng đầu ngữ cảnh, model hiểu theo bản đó.
      // SRS-5.1zzzu: bản đọc lại lấy từ lượt "ý của lượt" (khuôn bóc tách không còn chỗ — giới hạn grammar, DC-13).
      const yk = yLuotAi ? await yLuotAi : undefined;
      const dl0 = yk?.docLai ? docLaiHopLe(yk.docLai, text) : null;
      const dl = dl0 && cauDaDap ? anCauDaDap(dl0, cauDaDap) : dl0;
      return dl ? bc.replace("NGỮ CẢNH (đọc kỹ trước khi viết):\n", `NGỮ CẢNH (đọc kỹ trước khi viết):\n- Tin chủ nhà vừa nhắn gõ không dấu / tắt ("${tinChoModel().slice(0, 200)}"); em đọc là: "${dl.slice(0, 300)}" — hiểu theo bản này, đừng đoán nghĩa khác (chữ không dấu không phải tên người).\n`) : bc;
    };

    // ─── 06/10/2026 (bước 3, SRS-5.1zzp; chủ dự án: "làm 3 bước đi… prompt làm sao cho nó tự nhiên hơn") ─────────────────
    // Lời model lệch Ô CHỜ (không hỏi / hỏi chuyện khác / rút vế bắt buộc / hỏi lại ô đã có) trước đây bị thay bằng CÂU MẪU
    // (chữ code) ngay — đúng ô nhưng giọng máy chen giữa lời model. Nay: gọi lại model MỘT lần với ghi chú vì sao câu vừa viết
    // chưa dùng được, rồi mới qua các van cũ; câu mẫu chỉ còn là lưới cuối khi lần hai vẫn lệch hay model hỏng. Chỉ tốn thêm
    // một lượt ở lượt lệch — sổ `van_kich` (`goiLaiChoDungO`) đếm được bao nhiêu phần trăm.
    const lyDoLechO = (reply: string, khoa: string | null | undefined, cauMau: string | null, daCo?: ReadonlySet<string>): string | null => {
      if (!coCauHoi(reply)) return "tin chưa có câu hỏi nào, mà lượt này em phải hỏi tiếp một ý";
      if (khoa && laHoiLechKhoa(reply, khoa)) return "câu hỏi đang hỏi chuyện khác, không phải ý cần hỏi";
      if (khoa && cauMau && giuVeCauMau(reply, khoa, cauMau) !== reply) return "câu hỏi thiếu một ý bắt buộc (câu bên em hay dùng có đủ các ý, đừng rút)";
      if (daCo && boHoiLaiDaCo(reply, daCo, khoa, cauMau) !== reply) return "câu hỏi hỏi lại điều chủ nhà đã nói (đã có trong ĐÃ BIẾT)";
      return null;
    };
    const goiLaiChoDungO = async (reply: string, lyDo: string, nhan: string, cauMau: string | null): Promise<string | null> => {
      if (!anthropicS) return null;
      try {
        const r = await anthropicS.messages.create({
          model: MODEL, max_tokens: 300, output_config: { effort: "low" },
          system: [{ type: "text", text: SELLER_SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: DONG_TEN }],
          messages: [{
            role: "user",
            content: `${await boiCanhLuot()}Em vừa soạn tin này cho chủ nhà: "${reply}"\nTin đó chưa dùng được: ${lyDo}.\n` +
              `Viết LẠI một tin ngắn như người thật nhắn Zalo: giữ phần ghi nhận nếu có (không khen thêm), rồi hỏi đúng MỘT ý: ${nhan}` +
              (cauMau ? ` — ý đó bên em hay hỏi là "${cauMau}", nói lại cho tự nhiên nhưng giữ đủ các ý trong đó` : "") +
              `. Không hỏi ý khác, không đọc lại số liệu, không cảm ơn.`,
          }],
        });
        await doTien(client, r.usage);
        const t = r.content.find((b) => b.type === "text")?.text?.trim() ?? null;
        // SRS-5.1zzzzzb: lời viết lại cũng là lời model — qua cùng lượt soát nguồn như lời đầu (từng là đường duy nhất không soát).
        return t && !laLoiMeta(t) ? await soatNhanXet(t, [...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? ""), text].join("\n")) : null;
      } catch (e) {
        await ghiLoi(client, "chat-reply goi lai cho dung o", e);
        return null;
      }
    };

    // Người bán ĐÃ có nhãn mà tự xưng ngược lại ("em là môi giới mà" khi đang
    // CHÍNH CHỦ; "tôi là chính chủ" khi đang MÔI GIỚI) → KHÔNG tự lật (nhãn có
    // thể do admin gán), mà báo admin xác nhận + nói với họ là đã báo. Tối đa
    // một lần mỗi 24h cho mỗi người, kẻo mỗi câu "em là sale" là một việc.
    // Đợt 2 (02/10/2026): chế độ `ai` → AI đọc vai người nhắn TỰ NÓI (`vaiAi`, có trích dẫn); từ khoá chỉ đỡ khi AI không chạy.
    // Chạy SAU khi lượt AI đã khởi động (gọi ở dưới, cạnh `bongAi`) — trước đây chạy ở đây, chưa có AI để đọc.
    // SRS-5.1zzzzo: lượt này khách TỰ NÓI vai (qua `docVai` / `vaiTuCau` — cụm gọi tên vai) — lời tự giới thiệu, không phải câu trả lời
    // cho câu đang treo (`luotBenLe`), và là lúc báo con số phí nếu trước đó em chỉ nói được câu phí không số (`dapPhiRoVai`).
    const xetDoiNhan = async (): Promise<void> => {
    const vai = await vaiAi();
    // SRS-5.1zzzzk: vai TỰ NÓI có MỘT chủ — cụm phải GỌI TÊN vai (`vaiTuCau`, kiem-bang-chung.ts): AI đọc thì `docVai` kiểm trích dẫn bằng
    // nó; AI không chạy thì chính nó đọc cả tin (thay hai bộ từ khoá cũ chép tay ở đây).
    const vaiLuat = vai === undefined ? vaiTuCau(text) : null;
    const tuXungMoiGioi = vai !== undefined ? vai?.la === "moi_gioi" : vaiLuat === "moi_gioi";
    const tuXungChinhChu = vai !== undefined ? vai?.la === "chinh_chu" : vaiLuat === "chinh_chu";
    vaiTuNoiLuot = tuXungChinhChu ? "chinh_chu" : tuXungMoiGioi ? "moi_gioi" : null;
    // SRS-5.1zzzzj (20261009c): người rao TỰ NÓI đúng vai đang ghi → nhãn thành ĐÃ XÁC NHẬN (`tu_nhan`): từ đây câu phí mới được nói
    // con số. Nhãn vừa gán lượt này từ chính lời tự xưng môi giới cũng là tự nói. Vai ngược nhãn → giữ đường báo admin bên dưới.
    const tuNoiDung = (sellerRow.seller_type === "nmg" && (tuXungMoiGioi || (nhanVuaGan === "nmg" && (vaiTuCau(text) === "moi_gioi" || dangTraLoiHoiVai === "nmg")))) ||
      (sellerRow.seller_type === "ccrb" && tuXungChinhChu);
    if (tuNoiDung && (sellerRow.seller_type_source ?? "suy_doan") === "suy_doan") {
      const { error: nErr } = await client.from("sellers").update({ seller_type_source: "tu_nhan" }).eq("id", sellerRow.id);
      if (nErr) await ghiLoi(client, "chat-reply sellers.seller_type_source", nErr.message);
      else sellerRow.seller_type_source = "tu_nhan";
    }
    const xinDoiNhan: "ccrb" | "nmg" | null = nhanVuaGan
      ? null
      : sellerRow.seller_type === "ccrb" && tuXungMoiGioi
      ? "nmg"
      : sellerRow.seller_type === "nmg" && tuXungChinhChu
      ? "ccrb"
      : null;
    if (xinDoiNhan) {
      const dau = `✏️ Zalo …${externalUserId.slice(-4)}`;
      const { count: daBao } = await client.from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("kind", "escalation").in("status", ["pending", "sent"])
        .ilike("note", `${dau}%`)
        .gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString());
      if ((daBao ?? 0) === 0) {
        const { error: xErr } = await client.from("reminders").insert({
          kind: "escalation", due_at: new Date().toISOString(),
          note: `${dau}${sellerRow.name ? ` (${sellerRow.name})` : ""} đang nhãn ${
            sellerRow.seller_type === "nmg" ? "MÔI GIỚI" : "CHÍNH CHỦ"
          } nhưng tự xưng ${xinDoiNhan === "nmg" ? "MÔI GIỚI" : "CHÍNH CHỦ"}: "${text.slice(0, 120)}". Xác nhận rồi đổi ở /admin.`,
        });
        if (xErr) await ghiLoi(client, "chat-reply xin doi nhan", xErr.message);
      }
      // SRS-5.1zzzzj: câu này không nói con số phí — nhãn chưa đổi (chờ admin), con số phí chỉ do `cauPhi(vaiPhi(…))` nói.
      thongBaoNhan = xinDoiNhan === "nmg"
        ? `Dạ em ghi nhận ${cachGoi} là môi giới, em đã báo bên quản lý cập nhật lại nha.`
        : `Dạ em ghi nhận ${cachGoi} là chính chủ, em đã báo bên quản lý cập nhật lại nha.`;
    }
    };

    // NEO NGỮ CẢNH THEO CĂN, không theo "câu hỏi mới nhất" (FR-157).
    // Người bán 2-3 căn, cả hai đều đang thiếu thông tin: bot vừa hỏi căn B,
    // chủ nhớ ra chuyện căn A và nhắn "căn A hoàn công 2020 nha em" — lấy
    // `limit 1` theo created_at là ghi thẳng dữ liệu căn A vào căn B. Sai kiểu
    // này KHÔNG bao giờ tự lộ: fact vẫn có, tin vẫn lên web, chỉ là sai nhà.
    // Thứ tự tin cậy: mã tin chủ tự nhắc > căn bot vừa hỏi > câu mới nhất.
    // Một dãy mã duy nhất kể từ FR-158 — nhánh `CCRB-` cũ bỏ đi vì kho chưa bao
    const codeInText =
      /(bds-[a-z0-9]+(?:-[a-z0-9]+)+)/.exec(tKD)?.[1]?.toUpperCase() ?? null;
    // Câu hỏi chờ + huỷ nhắc-lời-hứa cũ (FR-133) chạy song song: hai việc
    // không nhìn nhau (FR-171 h). Embed lấy luôn `status` của tin để khối drip
    // bên dưới khỏi hỏi lại.
    type PendRow = {
      id: string; listing_id: string; question: string; answer?: string | null;
      created_at?: string | null;
      listings: {
        code: string | null; status?: string | null;
        location_raw: string | null; ward?: string | null; unit_code?: string | null;
        property_type?: string | null; project_id?: string | null; area_m2?: number | null;
        district?: string | null; deal?: string | null;
        frontage_m?: number | string | null; length_m?: number | string | null; // 24/09: ghép "dài 16m" với ngang đã có
        boc_tach?: unknown; // FR-212: đọc `duong_goi_y` không tốn thêm truy vấn
        // FR-226: giá trị đang ghi của các ô AI gộp / sửa được (cùng truy vấn nhúng, không thêm lượt DB).
        floors_text?: string | null; legal_status?: string | null; access_type?: string | null;
        alley_width_m?: number | string | null; furnishing?: string | null;
        price_vnd?: number | string | null; // 27/09: lưới `boTienBia` — giá đã ghi là bằng chứng
        price_raw?: string | null; // FR-239 c: "cái giá hồi nãy đó" → nhắc lại đúng giá đã ghi
      };
    };
    const [{ data: pendings }] = await Promise.all([
      client
        .from("info_requests")
        .select("id, listing_id, question, answer, created_at, listings!inner(seller_id, code, status, location_raw, ward, district, deal, unit_code, property_type, gap, project_id, area_m2, frontage_m, length_m, boc_tach, floors_text, legal_status, access_type, alley_width_m, furnishing, price_vnd, price_raw)")
        .eq("listings.seller_id", sellerRow.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20),
      client.from("reminders").update({ status: "cancelled" })
        .eq("seller_id", sellerRow.id).eq("kind", "promise").eq("status", "pending"),
    ]);
    const ds = (pendings ?? []) as unknown as PendRow[];
    // 22/09/2026 (kịch bản E): câu CHẤM ĐIỂM treo sau "bán rồi" nuốt "mở lại căn 2", "rao lại căn chung cư" thành
    // điểm chấm. Câu điểm chỉ nhận ĐIỂM (số/10) hoặc nhận xét ngắn không mang việc; câu khác → thôi câu điểm
    // (hỏi một lần là đủ), tin đi đường thường.
    const laDiemCham = (s: string) => {
      const kd = boDau(s);
      if (/(?:^|[^\d])(10|[0-9])\s*(?:\/\s*10|diem|d\b)/.test(kd)) return true;
      return kd.split(/\s+/).length <= 8 && !/\b(?:rao|dang|mo|xoa|sua|len|bo|go|gui|hoi|can \d)\b/.test(kd) &&
        /\b(?:tot|hay|on|duoc|ok|giong nguoi|tu nhien|hai long|nhiet tinh|cham|kha|te|do|cam on)\b/.test(kd);
    };
    /**
     * SRS-5.1zzzzzv: ghi điểm chấm + đóng câu `danh_gia` + câu cảm ơn — MỘT chủ cho nhánh câu treo danh_gia và cho lúc chờ duyệt (Zalo
     * thật 13/10 14:53: "mình chấm 6/10 nhé" tới khi câu điểm đã hết hạn vì bản nháp vừa gửi lại → từng vào ghi chú "📝 Thêm").
     */
    const ghiDiemDanhGia = async (listingId: string, reqId: string | null, dap: string): Promise<string> => {
      const { error: dgErr } = await ghiFact(client, { p_listing_id: listingId, p_question: "danh_gia", p_answer: dap, p_source: "seller_chat" });
      if (dgErr) await ghiLoi(client, "chat-reply ghi_fact_listing(danh gia)", dgErr.message);
      if (reqId) await client.from("info_requests").update({ status: "answered", answer: dap, answered_at: new Date().toISOString() }).eq("id", reqId);
      const diemM = /(?:^|[^\d])(10|[0-9])\s*(?:\/\s*10|diem|d\b|\/10)/.exec(boDau(dap));
      return diemM ? `Dạ em cảm ơn ${cachGoi} đã chấm em ${diemM[1]} điểm ạ.` : `Dạ em cảm ơn ${cachGoi} đã góp ý ạ, em sẽ cố gắng hơn.`;
    };
    // Câu HỎI ("có khách nào hỏi chưa em") không phải điểm nhưng cũng không đóng câu điểm — `hoiVeTin` đỡ rồi hỏi lại.
    const boDiem = ds.filter((p) => p.question === "danh_gia" && !laDiemCham(text) && !laCauHoiTron(text) && !hoiVeTin(text));
    if (boDiem.length) {
      const { error: bdErr } = await client.from("info_requests").update({ status: "expired" }).in("id", boDiem.map((p) => p.id));
      if (bdErr) await ghiLoi(client, "chat-reply thoi cau danh_gia", bdErr.message);
    }
    // SRS-5.1zzzzzzi (Zalo thật 14/10 08:39, cùng hội thoại của gộp cụm): lượt anh em (tin "có sổ đỏ chính chủ nha") đang soạn bản
    // nháp đã MỞ câu `duyet_tin` nhưng chưa gửi 📋; tin "giờ anh bận…" tới sau → lượt này đọc câu đó, đáp "Bản nháp ở trên anh thấy
    // được thì nhắn ok" trong khi khách chưa thấy bản nháp nào — rồi lượt anh em nhường lượt (`nhap_rut`) và câu đó bị thu hồi. Câu
    // duyệt mới mở (≤ 2 phút), lịch sử KHÔNG có 📋 từ lúc mở, và có tin chủ nhà trước tin này còn chưa được bot trả lời → đó là câu của
    // một lượt đang bay: bỏ qua, như chưa có câu treo (lượt kia sẽ tự thu hồi hoặc tự gửi nháp). Bản nháp được nhắc tới phải là bản
    // nháp khách ĐÃ THẤY — "ở trên" chỉ nói khi 📋 có trong lịch sử.
    const nhapDangBay = (p: PendRow): boolean => {
      if (p.question !== "duyet_tin" || !p.created_at) return false;
      const moc = Date.parse(p.created_at);
      if (Date.now() - moc > 120_000) return false;
      const coNhap = lichSuDai.some((m) => !laTinNguoi(m.sender) && /📋/u.test(m.body ?? "") && !!m.created_at && Date.parse(m.created_at) >= moc - 60_000);
      if (coNhap) return false;
      const lucBotCuoi = Math.max(0, ...lichSuDai.filter((m) => !laTinNguoi(m.sender) && !!m.created_at).map((m) => Date.parse(m.created_at!)));
      const lucTinNay = lucTinChu ? Date.parse(lucTinChu) : Date.now();
      return lichSuDai.some((m) => laTinNguoi(m.sender) && !!m.created_at && Date.parse(m.created_at) < lucTinNay &&
        Date.parse(m.created_at) > lucBotCuoi && Date.parse(m.created_at) <= moc);
    };
    const dsDung = ds.filter((p) => !boDiem.some((b) => b.id === p.id) && !nhapDangBay(p));
    const pendingReq: PendRow | null =
      (codeInText ? dsDung.find((p) => p.listings?.code?.toUpperCase() === codeInText) : null) ??
      (sellerRow.active_listing_id
        ? dsDung.find((p) => p.listing_id === sellerRow.active_listing_id)
        : null) ??
      dsDung[0] ?? null;
    /**
     * SRS-5.1zzzzzzi: hoãn có HẸN GIỜ ("mai 8 giờ 45 sáng") → đặt nhắc `promise` (FR-133; `nudge` tới hẹn nhắn một tin, chủ nhà nhắn lại
     * trước đó thì nhắc tự huỷ ở đầu lượt) và trả câu nói lại mốc để nối vào lời chờ. MỘT chủ cho mọi nhánh hoãn (câu treo, không câu
     * treo, lúc chờ duyệt) — thêm nhánh hoãn mới thì gọi hàm này, đừng chép câu. Không có giờ → "" (hoãn trơn như cũ).
     */
    const datHenHoan = async (goi: string): Promise<string> => {
      const hen = henTuLoiHoan(text);
      if (!hen) return "";
      const { error: henErr } = await client.from("reminders").insert({
        kind: "promise", seller_id: sellerRow.id, due_at: hen.due,
        note: `hẹn nói tiếp về tin rao (chủ nhà bận): "${text.slice(0, 160)}"`,
      });
      if (henErr) { await ghiLoi(client, "chat-reply hen hoan", henErr.message); return ""; }
      return ` ${hen.moTa.charAt(0).toUpperCase()}${hen.moTa.slice(1)} em nhắn lại ${goi} nha.`;
    };

    // 02/10/2026 (test Zalo, ảnh chủ dự án): "[khách thả cảm xúc /-strong]" ngay sau tin rao bị lấy làm câu trả lời câu
    // "loại nhà" → bot hỏi lại lần ba. Thả cảm xúc chỉ là GẬT (FR-142): có nghĩa với câu xin đồng ý; câu cần NỘI DUNG thì im.
    // SRS-5.1zzzzzzz22 (18/10/2026): sticker trung tính (`laStickerTrungTinh`) KHÁC thả cảm xúc — không bao giờ là gật, kể cả lúc chờ duyệt:
    // im lặng, không ghi gì, không coi là yêu cầu sửa tin (trước đó nó rơi xuống "sửa bản tin" → bo_sung → bài rao).
    if (!imageUrl && laStickerTrungTinh(text)) {
      return await traLoiSeller([], { sticker: true });
    }
    if (!imageUrl && laThaCamXuc(text) && !(pendingReq && CAU_GAT_DUOC.has(pendingReq.question))) {
      return await traLoiSeller([], { tha_cam_xuc: true });
    }

    // FR-235 (chủ dự án 28/09/2026, test Zalo: "nói nó bận rồi cái nó im luôn" … "ok e" → bot hỏi tiếp "Lô đất mình hướng nào
    // anh?"): tin trước của bot là lời HOÃN ("lúc nào … rảnh nhắn em", "em chờ … nha", "không hỏi lại") mà chủ nhà chỉ GẬT
    // ("ok e", "ừ", "👍") → đáp một câu ngắn, KHÔNG hỏi tiếp. Nói gì có dữ liệu / bảo đăng thì đi đường thường.
    // Đợt 1 bỏ luật từ khoá (SRS-5.1zf): khối này dời xuống SAU lúc khởi động lượt AI (`gatSauHoan`) — AI quyết có phải chỉ gật.

    // ─── FR-214 (b)(d), 23/09/2026 — MỘT NGƯỜI NHIỀU CĂN. "15 tỉ nhé cháu còn nhà ở quận 11 cũ muốn 7 tỉ" trả lời
    // câu giá của lô đất VÀ nói giá căn nhà Q11; bản cũ ghi cả câu vào lô đất (kèm "Quận 11"), rồi model nói
    // "cháu ghi 7 tỷ căn Quận 11" trong khi chẳng có gì được ghi. Người rao ≥ 2 tin mà câu có dấu hiệu nói tới
    // căn khác (`canGanManh`, tiền định) → một lượt model ĐỌC LẠI hội thoại + danh sách tin, chia câu thành
    // mảnh theo mã tin (chủ dự án: "nếu bot confusion chỗ nào thì có thể đọc lại cả hội thoại"). Mảnh của
    // căn KHÁC ghi thẳng vào căn đó (chỉ dữ kiện mới — không vị trí/quận/loại, đó là lời GỌI căn); mảnh "MOI"
    // mở tin mới; phần còn lại mới là câu trả lời cho câu đang treo — và AI bóc tách chỉ đọc phần đó.
    type TinMo = { id: string; code: string | null; status?: string | null; property_type?: string | null; district?: string | null; ward?: string | null; street?: string | null; location_raw?: string | null; price_raw?: string | null; area_m2?: number | string | null };
    const dsMo = ((tinCuaNguoi ?? []) as TinMo[])
      .filter((t) => !!t.code && ["cho_thong_tin", "dang_ban", "dang_quan_tam"].includes(t.status ?? ""));
    // SRS-5.1zzzzzv: ví dụ con số phí (code tính từ giá tin đã ghi, vai đã rõ) — một chỗ gọi `viDuPhi`; người đang có đúng MỘT tin mở thì
    // lấy giá tin đó khi không có câu treo chỉ tin.
    const tinPhiMotCan = dsMo.length === 1 ? ((tinCuaNguoi ?? []) as Array<{ id: string; price_vnd?: number | string | null; deal?: string | null }>).find((t) => t.id === dsMo[0].id) ?? null : null;
    const viDuPhiNguoi = (deal: string | null | undefined, gia: number | string | null | undefined): string | null =>
      viDuPhi(vaiPhi(sellerRow), deal ?? dealNguoi, gia != null && gia !== "" ? Number(gia) : null);
    // SRS-5.1zzzg: căn người này ĐANG CÓ — đưa cho lượt AI để nó biết tin nói về căn nào (kể cả khi không có câu đang hỏi).
    const moTaCanDangCo = (t: TinMo) =>
      `${t.code}: ${LOAI_VI[t.property_type ?? ""] ?? "chưa rõ loại"}, ${tenCanDocLen(t)}${t.price_raw ? `, giá ${donViGiaDep(t.price_raw)}` : ""}`;
    let textTreo: string | null = null;
    /** Tin ĐÃ CÓ vừa nhận dữ kiện từ một mảnh (để không hỏi tiếp một tin vỏ rỗng khi khách đang nói về tin này). */
    let tinGhiManh: { id: string; code: string | null; property_type?: string | null; district?: string | null } | null = null;
    /** SRS-5.1zzzzzza: tin ĐÃ CÓ được mảnh GỌI TÊN ("Mình cần sửa căn 311 An Dương Vương…") dù mảnh không mang dữ kiện — để chuyển neo sang căn đó. */
    let tinNhacManh: { id: string; code: string | null; property_type?: string | null; district?: string | null } | null = null;
    let daTraCauTreo = false; // mảnh ghi theo tin đã trả lời luôn câu đang treo (vd "80m2 giá 15 tỷ" khi đang hỏi diện tích)
    const maTreo = pendingReq?.listings?.code?.toUpperCase() ?? null;
    if (anthropicS && !codeInText && canGanManh(text, dsMo.map((t) => ({ ...t, code: t.code! })), maTreo)) {
      try {
        const { data: lsDai, error: lsErr } = await client.from("messages").select("sender, body, seq")
          .eq("conversation_id", convSId).order("seq", { ascending: false }).limit(40);
        if (lsErr) await ghiLoi(client, "chat-reply gan manh(lich su)", lsErr.message);
        const hoiThoai = ((lsDai ?? []) as Array<{ sender: string; body: string | null }>).reverse()
          .map((m) => `${laTinNguoi(m.sender) ? "CHỦ NHÀ" : "EM"}: ${(boBaoLai(m.body ?? "") ?? "").slice(0, 300)}`).join("\n");
        const moTaTin = (t: TinMo) => [LOAI_VI[t.property_type ?? ""] ?? t.property_type ?? "chưa rõ loại",
          [t.location_raw ?? t.street, t.ward, t.district].filter(Boolean).join(", ") || "chưa rõ nơi chốn",
          t.price_raw ? donViGiaDep(t.price_raw) : "chưa có giá", t.area_m2 ? `${Number(t.area_m2)}m2` : null].filter(Boolean).join(" · ");
        const dsTin = dsMo.map((t) => `${t.code} · ${moTaTin(t)}`).join("\n");
        const cauTreo = pendingReq && maTreo ? `${maTreo} — ${(FACT_LABELS[pendingReq.question] ?? pendingReq.question).replace(/\s*\(.*\)\s*$/, "")}` : null;
        const r = await ganManhBangModel(anthropicS as unknown as Parameters<typeof ganManhBangModel>[0], MODEL, { hoiThoai, dsTin, cauTreo, text });
        if (r) {
          await doTien(client, r.usage as Parameters<typeof doTien>[1]);
          const manh0 = donManh(r.ket, text, dsMo.map((t) => t.code!));
          // SRS-5.1zzzzz (khách mô phỏng 11/10, môi giới 3 căn: bot hỏi loại căn hẻm Nguyễn Trãi, khách "nhà phố anh, hẻm Nguyễn Trãi quận
          // 5 ạ" → lượt gán mảnh nói MOI, mở tin trùng BDS-NP-XX-0002 rồi hỏi loại lần nữa). Code kiểm đầu ra của AI: mảnh "MOI" mà gọi
          // đúng TÊN ĐƯỜNG của căn đang được hỏi là trả lời căn đó, không phải căn mới (bản nháp chờ duyệt thì không — khách có thể đang tả căn khác).
          const tinTreoM = maTreo ? dsMo.find((t) => t.code!.toUpperCase() === maTreo) : undefined;
          const duongTreoM = boDau(tinTreoM?.street?.trim() || tenDuong(tinTreoM?.location_raw ?? "") || "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
          const manh = manh0.map((m) => {
            if (m.ma !== "MOI" || !maTreo || duongTreoM.length < 3 || pendingReq?.question === "duyet_tin") return m;
            const kdM = ` ${boDau(m.trich).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
            if (!kdM.includes(` ${duongTreoM} `)) return m;
            console.log("chat-reply: manh MOI goi dung duong can dang hoi — ve can treo", maTreo);
            return { ...m, ma: maTreo };
          });
          // Bắn thật 23/09: đang hỏi DIỆN TÍCH lô đất, "15 tỉ nhé cháu" model gán đúng lô đất nhưng đó là GIÁ chứ không
          // phải câu trả lời diện tích → bản trước để nó làm câu trả lời, ra "thông tin bổ sung: 15 tỉ nhé cháu". Mảnh
          // của căn đang treo mà có SỐ TIỀN rõ trong lúc câu đang treo không phải giá thì ghi như mảnh căn khác.
          const TIEN_RO = /\d+(?:[.,]\d+)?\s*(?:tỷ|tỉ|ty|ti|tỏi|toi|triệu|trieu|tr)(?![\p{L}])/iu;
          const laTreo = (m: { ma: string; trich: string }) => m.ma === "KHONG" ||
            (!!maTreo && m.ma === maTreo && !(pendingReq?.question !== "gia" && TIEN_RO.test(m.trich)));
          if (manh.some((m) => !laTreo(m))) {
            const dongGhi: string[] = [];
            // 02/10/2026 (test Zalo, ảnh chủ dự án; "xóa luôn mấy luật này đi… để AI viết"): khách dán NGUYÊN tin rao căn đã có
            // → mảnh về đúng tin, nhưng ô do luật regex `nhanDienNhieuFact` ghi: tiêu đề "BÁN NHÀ PHỐ 6 TẦNG…" thành kết cấu,
            // "Diện tích đất 4m x 11m" / "6 tầng" rơi mất. Nay AI đọc mảnh (cùng lớp kiểm bằng chứng như câu rao), luật chỉ đỡ
            // khi AI không chạy (công tắc tắt / model lỗi).
            const cheDoGan = await (async () => {
              const { data: cd, error: cdErr } = await client.rpc("cau_hinh", { p_key: "boc_tach_ai" });
              if (cdErr) { await ghiLoi(client, "chat-reply gan manh(cau_hinh)", cdErr.message); return null; }
              const v = String(cd ?? "tat").trim();
              return v === "ai" || v === "chinh" ? v : null;
            })();
            if (cheDoGan) datKiemNhe(cheDoGan === "ai");
            const docManhBangAi = async (manhChu: string): Promise<AiChinh | null> => {
              if (!cheDoGan) return null;
              try {
                const kq = await bocRaoBangModel(anthropicS as unknown as Parameters<typeof bocRaoBangModel>[0], MODEL, manhChu, null, null, null,
                  cheDoGan === "ai", { tinChuNha: tinChuNhaGoc() });
                await doTien(client, kq.usage as Parameters<typeof doTien>[1]);
                if (!kq.ket) return null;
                // SRS-5.1zzzzze: số căn AI đánh theo ngữ cảnh (`can: 3` cho một mảnh một căn) đã chuẩn hoá ở `bocRaoBangModel`.
                return docAiChinh(boSungDiaChiTuKienThuc(kiemDeXuat(kq.truong, manhChu).dat, kq.kienThuc, manhChu), null); // SRS-5.1zzzzzy
              } catch (e) {
                await ghiLoi(client, "chat-reply gan manh(ai)", e);
                return null;
              }
            };
            // SRS-5.1zzzzzy (Zalo thật 13/10/2026 16:15, Trương Đình Hội): một bài rao dán nguyên bị lượt gán mảnh cắt thành BA mảnh cùng về
            // một tin → mỗi mảnh một lượt AI đọc RỜI; mảnh "Bên trong hoàn thiện theo ý gia chủ tầm 1,2 tỷ" không thấy "chỉ 6.950 TỶ" ở mảnh
            // trước nên thành giá, fact giá đè giá thật. Mảnh cùng MÃ TIN (không phải MOI, không phải mảnh trả lời câu treo) gộp thành MỘT
            // mảnh theo thứ tự xuất hiện — AI đọc cả đoạn như một câu rao, kiểm bằng chứng vẫn trên chính đoạn đó.
            const manhGop = (() => {
              const ra: typeof manh = []; const viTri = new Map<string, number>();
              for (const m of manh) {
                if (laTreo(m) || m.ma === "MOI") { ra.push(m); continue; }
                const i = viTri.get(m.ma);
                if (i == null) { viTri.set(m.ma, ra.length); ra.push({ ...m }); }
                else ra[i] = { ...ra[i], trich: `${ra[i].trich}\n${m.trich}` };
              }
              return ra;
            })();
            for (const m of manhGop.filter((x) => !laTreo(x))) {
              let tin = dsMo.find((t) => t.code!.toUpperCase() === m.ma) ?? null;
              const aiManh = await docManhBangAi(m.trich);
              const factAi = aiManh ? aiManh.ghi.map((g) => ({ question: g.question, answer: g.answer })) : null;
              if (m.ma === "MOI") {
                const kdM = boDau(m.trich);
                // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): AI đã đọc mảnh thì loại / quận / bán-thuê lấy của AI, tin mang dấu
                // `_thong_so_ai` để trigger DB không đoán lại bằng regex; luật chỉ khi AI không chạy.
                const { data: moi, error: moiErr } = await client.from("listings").insert(aiManh
                  ? {
                    code: null, seller_id: sellerRow.id, deal: aiManh.loaiGiaoDich ?? "ban", property_type: aiManh.loaiBds ?? "chua_ro",
                    status: "cho_thong_tin", can_chu_duyet: true, district: aiManh.quan ?? null, description: m.trich,
                    ...(cheDoGan === "ai" ? { boc_tach: { _thong_so_ai: true } } : {}),
                  }
                  : {
                    code: null, seller_id: sellerRow.id, deal: "ban", status: "cho_thong_tin", can_chu_duyet: true,
                    property_type: /\b(?:dat|manh dat|lo dat|dat nen)\b/.test(kdM) ? "dat" : /\b(?:can ho|chung cu)\b/.test(kdM) ? "chung_cu" : /\bnha\b/.test(kdM) ? "nha_pho" : "chua_ro",
                    district: bocQuan(kdM, m.trich) ?? vungNgoai(kdM)?.ten ?? null, description: m.trich,
                  }).select("id, code, status, property_type, district, location_raw, price_raw").single();
                const loaiM = moi?.property_type ?? "chua_ro";
                if (moiErr || !moi) { await ghiLoi(client, "chat-reply gan manh(mo tin)", moiErr?.message ?? "insert null"); continue; }
                let vt = aiManh ? aiManh.duong : bocViTriRao(m.trich);
                // Căn hộ ("còn căn hộ Sunrise City quận 7…") → tra kho dự án như đường rao thường (FR-114).
                if (loaiM === "chung_cu") {
                  const { data: daM, error: daMErr } = await client.rpc("match_projects", { p_text: m.trich }).select(COT_DU_AN);
                  if (daMErr) await ghiLoi(client, "chat-reply gan manh(du an)", daMErr.message);
                  const da = ((daM ?? []) as DuAnKho[])[0];
                  if (da) {
                    const { error: daUp } = await client.from("listings").update({ project_id: da.id, unit_status: "con_ban", last_confirmed_at: new Date().toISOString(), ...(da.district && !moi.district ? { district: da.district } : {}) }).eq("id", moi.id);
                    if (daUp) await ghiLoi(client, "chat-reply gan manh(gan du an)", daUp.message);
                    else await phuongTuDuAn(moi.id, da, null, (moi as { property_type?: string | null }).property_type ?? null);
                    if (!vt) vt = da.location_raw ? `${da.name}, ${da.location_raw}` : da.name;
                  }
                }
                vt = viTriGhiDuoc(vt); // SRS-5.1zzzzd
                if (vt) {
                  const { error: vtErr } = await ghiFact(client, { p_listing_id: moi.id, p_question: "vi_tri", p_answer: vt, p_source: "seller_chat" });
                  if (vtErr) await ghiLoi(client, "chat-reply gan manh(vi_tri moi)", vtErr.message);
                }
                tin = moi as TinMo;
              }
              if (!tin) continue;
              if (m.ma !== "MOI") tinNhacManh = tin;
              const nhan: string[] = [];
              // Vị trí / phường / quận / loại là lời GỌI căn đã có — chỉ ghi khi mảnh mở tin mới.
              const facts = (factAi ?? nhanDienNhieuFact(m.trich))
                .filter((f) => f.question !== "bo_sung" && (f.question !== "gia" || !!factAi) &&
                  (!["vi_tri", "phuong", "quan", "loai_bds", "loai_giao_dich"].includes(f.question) || m.ma === "MOI"));
              if (!factAi) {
                // Luật đỡ: giá chỉ lấy khi mảnh có SỐ TIỀN rõ ("muốn 7 tỉ") — bộ nhận fact đọc "quận 11 cũ muốn…" ra giá "11 cũ".
                const tienM = /(\d+(?:[.,]\d+)?\s*(?:tỷ|tỉ|ty|ti|tỏi|toi|triệu|trieu|tr)(?![\p{L}])(?:\s*\d{1,3})?)/iu.exec(m.trich);
                if (tienM && docTien(tienM[1]) != null) facts.push({ question: "gia", answer: tienM[1].trim() } as typeof facts[number]);
              }
              for (const f of facts) {
                if ((f.question === "vi_tri" || f.question === "loai_bds") && m.ma === "MOI") continue; // đã ghi ở trên
                const { error: fErr } = await ghiFact(client, { p_listing_id: tin.id, p_question: f.question, p_answer: f.answer, p_source: "seller_chat", goc: gocCua(f) });
                if (fErr) { await ghiLoi(client, `chat-reply gan manh(${f.question})`, fErr.message); continue; }
                // Bắn thật 23/09: fact pháp lý mang nguyên mảnh câu ("Nhà phố mà thổ cư full … shr") — cột đã đọc ra
                // `so_hong_rieng`, dòng 📝 thì in cột đó ("sổ hồng riêng"), không in lại cả câu khách gõ.
                // SRS-5.1zzzzh: giá đọc lại bằng luật hiển thị một nguồn ("2 ty 3" → "2 tỷ 3"), fact giữ chữ khách.
                let hienThi = f.question === "gia" ? donViGiaDep(f.answer) : f.answer;
                if (f.question === "phap_ly") {
                  const { data: lg } = await client.from("listings").select("legal_status").eq("id", tin.id).maybeSingle();
                  const ma = (lg as { legal_status?: string | null } | null)?.legal_status;
                  if (ma && LEGAL_VI[ma]) hienThi = LEGAL_VI[ma];
                }
                nhan.push(`${nhanGhi(f.question)}: ${hienThi}`);
                if (pendingReq && tin.id === pendingReq.listing_id && f.question === pendingReq.question) daTraCauTreo = true;
                const { error: irErr } = await client.from("info_requests").update({ status: "answered", answer: m.trich, answered_at: new Date().toISOString() })
                  .eq("listing_id", tin.id).eq("question", f.question).eq("status", "pending");
                if (irErr) await ghiLoi(client, "chat-reply gan manh(dong cau)", irErr.message);
              }
              const ten = [LOAI_VI[tin.property_type ?? ""] ?? null, tin.location_raw ?? tin.district ?? null].filter(Boolean).join(" ");
              if (nhan.length && m.ma !== "MOI") tinGhiManh = tin;
              if (m.ma === "MOI") dongGhi.push(`mở tin mới ${tin.code ?? ""}${ten ? ` (${ten})` : ""}${nhan.length ? `: ${nhan.join(" · ")}` : ""}`);
              else if (nhan.length) dongGhi.push(`tin ${tin.code}${ten ? ` (${ten})` : ""}: ${nhan.join(" · ")}`);
            }
            if (dongGhi.length) ackAnh.push(`📝 ${doiTuXung([`Em ghi vào ${dongGhi.join("; ")}.`], sellerRow.xung_ho ?? null, sellerRow.nhom_tuoi ?? null)[0]}`);
            textTreo = manh.filter(laTreo).map((m) => m.trich).join(". ").trim();
            console.log("chat-reply: gán mảnh theo tin", JSON.stringify(manh.map((m) => [m.ma, m.trich.slice(0, 40)])));
          }
        }
      } catch (e) {
        await ghiLoi(client, "chat-reply gan manh", e);
      }
    }
    // Mọi mảnh đã đi căn khác, không còn gì trả lời câu đang treo → nhắc lại câu đó (không ghi gì vào căn đang treo).
    if (textTreo === "" && pendingReq && !daTraCauTreo && !humanActive) {
      // 02/10/2026 (test Zalo, ảnh chủ dự án): khách dán nguyên tin rao của căn Trương Đình Hội — mọi mảnh về đúng căn đó, rồi
      // bot quay sang hỏi "nhà mình là nhà phố, chung cư hay đất" cho một tin VỎ RỖNG khác (chưa loại, chưa giá, chưa diện
      // tích, chưa địa chỉ) đang treo câu loại. Khách đọc ra là bot hỏi chính căn vừa tả. Tin treo là vỏ rỗng mà khách đang
      // nói về căn khác → thôi câu của vỏ, chuyển neo sang căn vừa nhận dữ kiện và hỏi tiếp câu của căn đó.
      const lv = pendingReq.listings;
      const voRong = (!lv?.property_type || lv.property_type === "chua_ro") && !lv?.price_raw && !lv?.area_m2 && !lv?.location_raw;
      // SRS-5.1zzzzy (khách mô phỏng 11/10, môi giới 3 căn): câu treo là bản nháp CĂN KHÁC đang chờ duyệt, khách nói tiếp về căn 3 →
      // bot nhắc lại câu duyệt của căn kia (lạc chỗ) và căn 3 không bao giờ được hỏi tiếp / soạn nháp. Cùng việc với vỏ rỗng: đi tiếp
      // căn vừa nhận dữ kiện. Khác vỏ rỗng ở chỗ bản nháp chờ duyệt GIỮ nguyên (khách gật lúc nào cũng được), chỉ đổi neo.
      const nhapCanKhac = pendingReq.question === "duyet_tin";
      // SRS-5.1zzzzzza (Zalo thật 13/10 16:59: "Mình cần sửa căn 311 An Dương Vương, Phường An Lạc, Quận Bình Tân" lúc đang chờ duyệt căn khác →
      // bot lặp "Bản nháp ở trên…" của căn cũ): mảnh chỉ GỌI TÊN căn khác (không dữ kiện) cũng là chuyển sang căn đó — đổi neo, đưa bản nháp /
      // câu kế của căn đó. Cùng một đường với mảnh có dữ kiện.
      const tinChuyen = tinGhiManh ?? (nhapCanKhac ? tinNhacManh : null);
      if ((voRong || nhapCanKhac) && tinChuyen && tinChuyen.id !== pendingReq.listing_id) {
        const tg = tinChuyen;
        const [{ error: exErr }, { error: neoErr }, { data: thieuG, error: thErr }] = await Promise.all([
          voRong ? client.from("info_requests").update({ status: "expired" }).eq("id", pendingReq.id) : Promise.resolve({ error: null }),
          client.from("sellers").update({ active_listing_id: tg.id }).eq("id", sellerRow.id),
          client.from("listing_missing_facts").select("fact_key, priority, nhom").eq("listing_id", tg.id).order("priority").limit(40),
        ]);
        if (exErr || neoErr || thErr) await ghiLoi(client, "chat-reply gan manh(bo vo rong)", (exErr ?? neoErr ?? thErr)!.message);
        const keG = chonCauKe([], ((thieuG ?? []) as Array<{ fact_key: string; priority?: number; nhom?: string }>).filter((f) => f.nhom !== "sau_dang"));
        const meta = { gan_manh: true, ...(voRong ? { bo_cau_vo_rong: pendingReq.question } : { giu_nhap: pendingReq.listing_id }), ...(tinGhiManh ? {} : { chuyen_can: tg.code }) };
        if (keG && keG !== "hinh_anh") {
          const { error: irG } = await moCauTreo({ listing_id: tg.id, question: keG, status: "pending" });
          if (irG && irG.code !== "23505") await ghiLoi(client, "chat-reply gan manh(cau ke)", irG.message);
          return await traLoiSeller([cauHoiMau(keG, cachGoi, tg.property_type, tg.district)], { ...meta, asked: keG });
        }
        // Hết câu trước nháp → bản nháp của chính căn này (một đường với mọi bản nháp khác).
        const nhapG = await guiBanNhap(tg.id, meta);
        if (!Array.isArray(nhapG)) return nhapG;
        return await traLoiSeller(nhapG.length ? [`Căn ${tg.code ?? "này"} ${cachGoi} cho em biết thêm ${nhapG[0]} nha?`] : [], meta);
      }
      return await traLoiSeller([cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal)], { gan_manh: true });
    }
    if (textTreo === "" && !humanActive) return await traLoiSeller([], { gan_manh: true });
    // Đã chia mảnh theo tin → phần còn lại chỉ là câu trả lời cho căn đang treo: các cờ "rao căn mới" bên dưới
    // (đọc CẢ câu) không được mở thêm tin — "cháu còn nhà ở quận 11 cũ" đã về đúng tin quận 11 rồi.
    const daGanManh = textTreo !== null;

    // FR-208 (14/09/2026): AI bóc tách CHẠY BÓNG, song song với toàn bộ luật bên dưới. Chỉ
    // khởi động ở đây (cần biết câu bot đang hỏi); kết quả kiểm + so với DB ghi ở đường ra
    // `traLoiSeller`, sau khi đã trả lời khách. Công tắc `app_config.boc_tach_ai`.
    const coMuiAi = coMuiDuLieuRao(text) || (!!pendingReq && coNoiDungTraLoi(text));
    // Chế độ `ai`: không dùng regex để quyết AI có được đọc hay không ("xhr", "c4" không có "mùi" dữ liệu với luật) — mọi tin
    // của người đang rao / đang trả lời câu treo đều qua AI. Công tắc đọc trước để biết có phải chế độ này không.
    // SRS-5.1zzl (05/10/2026): người đang rao TỪ HAI CĂN trở lên → mọi tin đều qua AI (ý gom căn "dẹp mấy căn kia", chuyển căn)
    // — demo AOND đọc ý mọi lượt; luật từ khoá chỉ là lưới đỡ, không phải cổng quyết AI có được đọc hay không.
    // Giá trị LUẬT của cổng câu rao, chụp trước lượt AI — lượt AI đọc giá trị này (không đọc `wantsSell` đã được AI sửa).
    const wantsSellTruocAi = wantsSell;
    // SRS-5.1zzzi (07/10/2026, chat thử …98iz): người bán CHƯA có tin, bot vừa hỏi "bất động sản ở đâu", khách "Ở Trần Bình
    // Trọng" — câu không có "mùi dữ liệu" theo luật, không có câu treo (chưa có tin để treo) → AI không được gọi, tên đường mất,
    // về sau bot hỏi lại "nhà ở đường nào". Chưa có tin mà bot vừa nói → tin này là câu TRẢ LỜI cho bot, AI phải đọc (kèm câu
    // bot vừa nói trong `hoiThoai`). Đọc ra địa chỉ / dữ kiện thì `raoNgam` mở tin như câu rao.
    // SRS-5.1zzzl (08/10, bắn thử …kb1tatt): ĐÃ có một tin, không câu treo (bot vừa hỏi "hiện trạng" — câu model tự đặt, code
    // không mở ô), khách "dang di" (đăng đi, không dấu) → AI không được gọi, model trả lời tự đoán "em ghi đang ở". Cổng cũ chỉ
    // mở cho người CHƯA có tin. Bot vừa nói gì thì tin này có thể là câu trả lời cho câu đó — AI luôn đọc, bất kể có mấy tin.
    const traLoiBot = !!cauBotThat?.trim();
    if (anthropicS && (coMuiAi || !!pendingReq || wantsSell || dsMo.length >= 2 || traLoiBot)) {
      // 30/09/2026 (chủ dự án, chat thử): "nhà chú ở 137/28 đường số 59 phường an hội tây nhé" nhắn TRƯỚC câu rao — lúc
      // đó chưa có tin nên không có chỗ ghi, tới lúc rao thì mất. Người chưa có tin nào mà nhắn câu rao: AI đọc cả các
      // tin khách nhắn trước đó (`truocTin`) cùng câu rao; bằng chứng kiểm trên chính đoạn gộp đó.
      if (!pendingReq && wantsSell && truocTin) textBongAi = `${truocTin}\n${text}`;
      const tBong = Date.now();
      const ai = anthropicS;
      cheDoBocAi = (async () => {
        const { data: cd, error: cdErr } = await client.rpc("cau_hinh", { p_key: "boc_tach_ai" });
        if (cdErr) await ghiLoi(client, "chat-reply cau_hinh(boc_tach_ai)", cdErr.message);
        const v = String(cd ?? "tat").trim();
        laCheDoAi = v === "ai";
        datKiemNhe(laCheDoAi);
        return laCheDoAi ? "chinh" : v;
      })().catch(() => "tat");
      bongAi = (async () => {
        const cheDo = await cheDoBocAi!;
        if (cheDo !== "bong" && cheDo !== "ghi" && cheDo !== "chinh") return null;
        if (!coMuiAi && !laCheDoAi) return null;
        // FR-214 b: đã chia mảnh theo căn → AI bóc tách chỉ đọc phần thuộc căn đang treo.
        // FR-224: đưa cả CHỮ câu bot vừa hỏi để AI hiểu câu hỏi theo nghĩa (khoá trần "do_rong_hem" không nói "ô tô vào tới cửa không").
        // 01/10/2026 (bắn thử lx-tt-11; chủ dự án: "ra luật nó phải đọc thêm 1 2 câu hoặc cả ngữ cảnh phía trước"): AI từng chỉ
        // thấy MỘT tin + câu hỏi MẪU, không thấy câu bot thật sự vừa nói ("gấp hay được giá thì thôi?") → "ừ" thành "được giá
        // thì thôi". Nay đưa: câu bot vừa nói NGUYÊN VĂN (thay câu mẫu), 4 lượt gần nhất, và câu bot còn định hỏi của căn đang
        // treo (để AI chỉ ra câu không áp dụng). Trích dẫn vẫn phải nằm trong tin (`kiem-bang-chung.ts`).
        const cauChu = pendingReq
          ? (cauBotThat?.trim() || cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal))
          : null;
        const hoiThoai = lichSuRows.slice(-4).map((m) => {
          const b = laTinNguoi(m.sender) ? (m.body ?? "") : (boBaoLai(m.body) ?? "");
          return b.trim() ? `${laTinNguoi(m.sender) ? "CHỦ NHÀ" : "BOT"}: ${thayLienHe(b.replace(/\s+/g, " ").trim(), "[liên hệ]").slice(0, 220)}` : "";
        }).filter(Boolean);
        let cauConHoi: string[] = [];
        // Lượt CÂU RAO (chưa có tin, chưa biết bảng câu): đưa danh mục câu hay đổi theo loại / theo căn để AI chỉ ra câu
        // không áp dụng ngay từ câu hỏi đầu (bắn thử lx-kh-01: căn officetel bị hỏi phòng ngủ trước tiên).
        if (laCheDoAi && !pendingReq && wantsSellTruocAi) {
          cauConHoi = CAU_TUY_CAN.map((k) => `${k}: ${FACT_LABELS[k] ?? k}`);
        }
        if (laCheDoAi && pendingReq?.listing_id) {
          const { data: thieuAi, error: thErr } = await client.from("listing_missing_facts").select("fact_key, priority")
            .eq("listing_id", pendingReq.listing_id).order("priority").limit(40);
          if (thErr) await ghiLoi(client, "chat-reply cau con hoi (ai)", thErr.message);
          // Đợt 3 (02/10/2026): danh sách cũng là nơi AI CHỌN câu kế (`cau_ke`) → gồm cả câu lõi (code `docKhongCanHoi` vẫn không
          // cho bỏ câu lõi) và các câu NHÁNH re-nhanh có thể mở (đánh dấu "(nhánh)" — AI chỉ chọn khi đúng hoàn cảnh).
          const coSan = new Set(((thieuAi ?? []) as Array<{ fact_key: string }>).map((f) => f.fact_key));
          cauConHoi = [
            ...((thieuAi ?? []) as Array<{ fact_key: string }>).map((f) => `${f.fact_key}: ${FACT_LABELS[f.fact_key] ?? f.fact_key}`),
            ...CAU_NHANH.filter((k) => !coSan.has(k)).map((k) => `${k}: ${FACT_LABELS[k] ?? k} (nhánh)`),
          ];
        }
        // SRS-5.1zzzzq: lời chào đầu tin cắt khỏi chữ AI đọc ("chào em, chị muốn bán lô đất" → AI rỗng); trích dẫn vẫn kiểm trên tin gốc.
        const tinAiDoc = boLoiChaoDau(textTreo || textBongAi);
        const nguCanhAi = laCheDoAi ? { hoiThoai, cauConHoi, tinChuNha: tinChuNhaGoc(), canDangCo: dsMo.slice(0, 5).map(moTaCanDangCo) } : null;
        let r0 = await bocRaoBangModel(ai as unknown as Parameters<typeof bocRaoBangModel>[0], MODEL, tinAiDoc, pendingReq?.question ?? null, cauChu, dangGhiCua(pendingReq?.listings), laCheDoAi, nguCanhAi);
        // SRS-5.1zzzzzzh (bắn production 14/10 thu-gc-01: đang hỏi mặt tiền đường, "Đất có sổ đỏ chính chủ" → AI trả RỖNG hoàn toàn, 🤖 "Không
        // trích xuất được gì", pháp lý mất, lời bot lại nói tiếp về giấy tờ): AI bảo "tin không mang gì" trong khi từ điển nghề tiền định thấy
        // cụm dữ liệu NGUYÊN VĂN trong tin → hai bên lệch → gọi lại model MỘT lần kèm gợi ý (AI vẫn quyết, code vẫn kiểm trích dẫn; luật
        // KHÔNG ghi thẳng — cùng khuôn `nangXacNhanChac` / `goiLaiChoDungO`). Chỉ chế độ `ai`, chỉ khi AI rỗng TOÀN BỘ.
        const aiRongHoanToan = (r: typeof r0) => !!r.ket && !r.truong.length && !r.kienThuc.length && !r.traLoi?.co_tra_loi && !r.hoiLai?.co_hoi &&
          !r.xacNhan?.length && !r.capNhat?.length && (!r.yDinh?.loai || r.yDinh.loai === "binh_thuong") && (!r.camXuc?.muc || r.camXuc.muc === "binh_thuong") &&
          (!r.vai?.la || r.vai.la === "khong_noi") && !r.canKhac;
        if (laCheDoAi && nguCanhAi && aiRongHoanToan(r0)) {
          const goiY = nhanDienNhieuFact(tinAiDoc).filter((f) => f.question !== "bo_sung" && f.answer.trim()).slice(0, 4)
            .map((f) => `"${f.answer.slice(0, 60)}" (có thể là ${FACT_LABELS[f.question] ?? f.question})`);
          if (goiY.length) {
            console.log("chat-reply: AI bóc tách rỗng mà từ điển thấy dữ liệu → gọi lại một lần", goiY.join(" | "));
            await doTien(client, r0.usage as Parameters<typeof doTien>[1]);
            r0 = await bocRaoBangModel(ai as unknown as Parameters<typeof bocRaoBangModel>[0], MODEL, tinAiDoc, pendingReq?.question ?? null, cauChu, dangGhiCua(pendingReq?.listings), laCheDoAi, { ...nguCanhAi, goiY });
          }
        }
        // SRS-5.1zzzzzzz10 (Zalo thật 14/10 10:04): câu treo không phải ô (chờ duyệt) mà AI vẫn đặt nội dung vào tra_loi, truong rỗng → dữ liệu
        // đặt sai chỗ, không ô nào ghi được. Gọi lại MỘT lần, nói rõ chỗ sai; AI vẫn quyết ô, code vẫn kiểm trích dẫn.
        const traLoiSaiCho = (r: typeof r0) => !!r.ket && !!pendingReq && CAU_KHONG_PHAI_O.has(pendingReq.question) &&
          !!r.traLoi?.co_tra_loi && !!r.traLoi.trich_dan?.trim() && !r.truong.length;
        if (laCheDoAi && nguCanhAi && traLoiSaiCho(r0)) {
          console.log("chat-reply: lời sửa lúc duyệt nằm trong tra_loi → gọi lại một lần");
          await doTien(client, r0.usage as Parameters<typeof doTien>[1]);
          r0 = await bocRaoBangModel(ai as unknown as Parameters<typeof bocRaoBangModel>[0], MODEL, tinAiDoc, pendingReq?.question ?? null, cauChu, dangGhiCua(pendingReq?.listings), laCheDoAi,
            { ...nguCanhAi, nhacLai: `Lượt đọc trước em đặt "${r0.traLoi!.trich_dan!.slice(0, 200)}" vào tra_loi — nhưng bot đang chờ DUYỆT BẢN NHÁP, không hỏi ô nào. Cụm đó là thông tin căn chủ nhà sửa: đưa vào đúng ô trong truong (trich_dan nguyên văn), tra_loi.co_tra_loi = false.` });
        }
        // 01/10/2026 (lx-tt-08): viết tắt AI đánh dấu "không chắc" mà từ điển tiền định đọc ra CÙNG ô ("shr" → pháp lý) là chắc —
        // ghi thẳng, không để rơi ở nhánh không hỏi xác nhận (`nangXacNhanChac`).
        const xnChac = laCheDoAi ? nangXacNhanChac(r0.xacNhan, textTreo || textBongAi, nhanDienNhieuFact) : null;
        const r = xnChac?.chac.length ? { ...r0, truong: [...r0.truong, ...xnChac.chac], xacNhan: xnChac.conLai } : r0;
        return { ...r, ms: Date.now() - tBong, cauDangHoi: pendingReq?.question ?? null, cheDo };
      })().catch(async (e) => {
        await ghiLoi(client, "chat-reply boc_tach_ai(bong)", e);
        return null;
      });
    }
    // SRS-5.1zf: lượt AI nhỏ "ý của lượt" — chỉ chế độ `ai`, chạy song song, hỏng thì `undefined` (luật đỡ).
    if (anthropicS && cheDoBocAi) {
      const aiY = anthropicS;
      // SRS-5.1zzzzzv: đang chờ duyệt → lượt ý ngắn đọc cả BẢN NHÁP 📋 vừa gửi (câu bot thật là bong bóng điểm, không có dòng Quy mô / Thêm),
      // để "Quy mô chỉ cần để: … là được" chỉ ra được ý cần bỏ (`bo_y`) đúng chữ trong bản nháp.
      const nhapVuaGui = pendingReq?.question === "duyet_tin"
        ? [...lichSuRows].reverse().find((m) => !laTinNguoi(m.sender) && (m.body ?? "").includes("📋"))?.body ?? null
        : null;
      const botNoi = nhapVuaGui ? [nhapVuaGui, cauBotThat].filter(Boolean).join("\n") : cauBotThat;
      // SRS-5.1zzzzzv (chủ dự án 13/10/2026: "khách yêu cầu, khách đưa phản hồi mà bot không rõ ý thì có thể đọc thêm chat phía bên trên,
      // ko hiểu nữa thì lên trên nữa"): lượt ý ngắn đọc lần đầu với câu bot vừa nói; KHÔNG RÕ Ý (không gật / không yêu cầu / không ý nào, và
      // lượt bóc tách cũng không thấy dữ liệu) → đọc lại kèm 10 tin gần nhất; vẫn không rõ → kèm 30 tin. Chỉ tốn thêm khi thật sự mù.
      const lichSuChu = (n: number) => lichSuRows.slice(-n)
        .map((m) => ({ ai: laTinNguoi(m.sender) ? "Chủ nhà" : "Bot", b: (boBaoLai(m.body ?? "") ?? "").replace(/\s+/g, " ").trim() }))
        .filter((x) => x.b).map((x) => `${x.ai}: ${x.b.slice(0, 400)}`).join("\n");
      const muY = (k: Awaited<ReturnType<typeof docYLuotBangModel>>["ket"]) =>
        !k || ((k.dongY === undefined || k.dongY.la === "khong_noi") && (k.yeuCau === undefined || k.yeuCau.loai === "khong") && !k.khongBiet && !k.tieuDe &&
          !k.ngungHangLoat && !k.muaKem);
      yLuotAi = (async () => {
        if ((await cheDoBocAi!) !== "chinh") return undefined;
        try {
          let kq = await docYLuotBangModel(aiY as unknown as Parameters<typeof docYLuotBangModel>[0], MODEL, textTreo || text, botNoi);
          await doTien(client, kq.usage as Parameters<typeof doTien>[1]);
          if (muY(kq.ket) && bongAi) {
            const kB = await bongAi;
            const khongDuLieu = !!kB?.ket && !kB.truong?.length && !kB.kienThuc?.length && !kB.traLoi?.co_tra_loi && !kB.hoiLai?.co_hoi;
            for (const n of khongDuLieu ? [10, 30] : []) {
              const ls = lichSuChu(n);
              if (!ls) break;
              console.log("chat-reply: y luot mu — doc them", n, "tin");
              kq = await docYLuotBangModel(aiY as unknown as Parameters<typeof docYLuotBangModel>[0], MODEL, textTreo || text, botNoi, ls);
              await doTien(client, kq.usage as Parameters<typeof doTien>[1]);
              if (!muY(kq.ket)) break;
              if (n === 10 && lichSuRows.length <= 10) break;
            }
          }
          return kq.ket ?? undefined;
        } catch (e) {
          await ghiLoi(client, "chat-reply y luot(ai)", e);
          return undefined;
        }
      })();
    }
    await xetDoiNhan();

    // ─── SRS-5.1zzzt (08/10/2026, bắn thử …kc1tatt "dang di"): hai lượt AI đọc CÙNG tin ra hai ý NGƯỢC nhau (ý của lượt: bảo
    // đăng; bóc tách: hoãn) → tin mơ hồ thật, hỏi lại khách bằng chính hai cách hiểu, không để nơi gọi nào hỏi AI trước thì
    // thắng. Chỉ khi tin không mang dữ liệu nào (có dữ liệu thì phần dữ liệu vẫn phải ghi) và câu bot vừa nói chưa phải câu hỏi
    // lại này (không hỏi hai lần liền — lượt sau mơ hồ nữa thì để các nhánh như cũ).
    // SRS-5.1zzzzzb (khách mô phỏng 11/10, bán cụt: bot vừa hoãn "lúc nào anh rảnh nhắn em", khách "tối em nhắn lại nhé" → "em chưa chắc ý:
    // đồng ý làm tiếp hay đang bận", rồi "anh đang bận, tối nói tiếp" → câu hoãn y nguyên lần hai, rồi "tối nhắn anh nhé" → bot hỏi tiếp
    // thổ cư). LỚP LỖI: trạng thái "đang hoãn" không được nhớ qua lượt — mỗi lượt tự đọc lại như hội thoại mới. Bot VỪA hoãn thì lượt
    // không mang dữ liệu nào (AI đọc) mà khách gật / hẹn lại / nói bận là cùng một ý: đáp một tiếng chờ, không hỏi gì, không xin lỗi lại.
    const botCuoiHoan = lichSuRows.filter((m) => !laTinNguoi(m.sender)).slice(-2).map((m) => m.body ?? "").join(" ");
    const vuaHoan = /lúc nào .{0,25}rảnh|cứ thong thả|cứ lo việc|em chờ .{0,25}nha|không hỏi lại/i.test(botCuoiHoan);
    if (vuaHoan && !imageUrl && !humanActive && laCheDoAi && bongAi) {
      const [kH, ydH, tgH0] = await Promise.all([bongAi, yDinhAi(), gatTach(text)]);
      const khongDuLieu = !!kH?.ket && !(kH.truong?.length) && !(kH.kienThuc?.length) && !(kH.capNhat?.length);
      const chiHenHayGat = ydH?.loai === "hoan" || (tgH0?.gat === true && tgH0.ca === true);
      if (khongDuLieu && chiHenHayGat && !(await baoDangLuot(() => false)) && !(kH?.hoiLai?.co_hoi)) {
        return await traLoiSeller([`Dạ vâng ạ, em chờ ${cachGoi} nha.`], { hoan: true, loai_cau: ydH?.loai === "hoan" ? "hoan_lai" : "hoan_gat" });
      }
    }
    if (!imageUrl && !humanActive && laCheDoAi && (dsMo.length > 0 || !!pendingReq) && !/em chưa chắc ý/.test(cauBotThat ?? "")) {
      const [dyL, ydL, kL] = await Promise.all([dongYAi(), yDinhAi(), bongAi]);
      const lech = yLuotLech(dyL, ydL);
      if (lech && !((kL?.truong?.length ?? 0) > 0 || (kL?.kienThuc?.length ?? 0) > 0)) {
        const Y_NGHIA: Record<YLuot, string> = {
          dang: "muốn em đăng tin lên luôn", gat: "đồng ý, muốn em làm tiếp luôn", hoan: "đang bận, để lúc khác mình nói tiếp", ngung_rao: "muốn tạm ngưng rao",
          ban_roi: "báo căn này bán rồi", khong_dang: "chưa muốn đăng",
        };
        const cau = `Dạ em chưa chắc ý ${cachGoi} ở câu "${(textTreo || text).trim().slice(0, 60)}" ạ: ${cachGoi} ${Y_NGHIA[lech[0]]}, hay ${Y_NGHIA[lech[1]]} vậy ạ?`;
        console.log(`chat-reply: hai luot AI doc lech (${lech.join(" / ")}) — hoi lai khach`);
        return await traLoiSeller([cau], { y_lech: lech, loai_cau: "y_lech" });
      }
    }

    // ─── SRS-5.1zzzg (07/10/2026, chat thử …gogt: tin đang rao đủ dữ kiện, khách "Mình cần bán gấp" → luật `wantsSell` (bỏ dấu
    // "cần" = "căn", có "bán") mở TIN MỚI rỗng, bot hỏi "nhà loại gì"): người bán ĐÃ CÓ tin mở thì câu này là rao căn MỚI hay nói
    // thêm về căn đang có là việc của AI (`can_khac`, đọc kèm danh sách căn đang có + câu bot vừa nói). AI chạy và nói rõ → AI
    // quyết; AI không chạy → luật như cũ. Tin đang có là vỏ rỗng (vừa mở từ "em cần bán nhà") thì để luật: câu rao đầy đủ kế tiếp
    // vẫn đi đường điền vào tin rỗng.
    if (wantsSell && dsMo.length && !dsMo.every((t) => laTinRong({ ...t, status: t.status ?? null, location_raw: t.location_raw ?? null, area_m2: t.area_m2 == null ? null : Number(t.area_m2) }))) {
      const ck = await canKhacLuot();
      if (ck === false) {
        console.log("chat-reply: AI doc la noi them ve can dang co, khong mo tin moi");
        wantsSell = false;
      }
    }

    // FR-235 (dời từ trên xuống, SRS-5.1zf): sau lời HOÃN của bot mà chủ nhà chỉ GẬT ("ok e", "ừ", "👍") → đáp ngắn, không hỏi
    // tiếp. AI quyết gật (không kèm dữ liệu, không bảo đăng); luật `laDongY` ≤ 4 chữ chỉ khi AI không chạy.
    {
      const botCuoiHoan = lichSuRows.filter((m) => !laTinNguoi(m.sender)).slice(-2).map((m) => m.body ?? "").join(" ");
      if (!imageUrl && !humanActive && /lúc nào .{0,25}rảnh|cứ thong thả|cứ lo việc|em chờ .{0,25}nha|không hỏi lại/i.test(botCuoiHoan)) {
        const tgH = await gatTach(text);
        const gatSauHoan = tgH !== undefined
          ? tgH.gat && tgH.ca && !(await baoDangLuot(() => false))
          : laDongY(text) && text.trim().split(/\s+/).length <= 4 && !laBaoDang(text);
        if (gatSauHoan) return await traLoiSeller([`Dạ vâng ạ, em chờ ${cachGoi} nha.`], { hoan: true, loai_cau: "hoan_gat" });
      }
    }

    // Seller hứa "chiều gửi ảnh…" → đặt hẹn nhắc (SAU khi huỷ nhắc cũ ở trên,
    // kẻo lệnh huỷ chạy sau lại huỷ luôn nhắc vừa đặt)
    if (khop(PROMISE_RE, PROMISE_RE_KD)) {
      await client.from("reminders").insert({
        kind: "promise", seller_id: sellerRow.id,
        due_at: mapDue(text), note: text.slice(0, 200),
      });
    }
    // (Cổng câu rao mới `wantsSell` tính ở TRÊN nhánh này — FR-159 cần nó trước
    //  khi biết người nhắn có phải người bán hay không.)

    // ─── SRS-5.1zzj (05/10/2026, demo AOND projects.py / handle_media_batch): TÀI LIỆU DỰ ÁN người bán gửi (bảng giá, phân
    // lô, brochure, mặt bằng) → model đọc → kho `du_an_can` CHUNG cho dự án; file cất bucket riêng tư + dòng `du_an_tai_lieu`.
    type DuAnGon = { id: string; name: string };
    const duAnCuaTinDangHoi = async (): Promise<DuAnGon | null> => {
      const pid = pendingReq?.listings?.project_id ?? null;
      if (!pid) return null;
      const { data } = await client.from("projects").select("id, name").eq("id", pid).maybeSingle();
      return (data as DuAnGon | null) ?? null;
    };
    const timDuAnTheoTen = async (ten: string | null): Promise<DuAnGon | null> => {
      if (!ten?.trim()) return null;
      const { data, error } = await client.rpc("match_projects", { p_text: ten }).select("id, name");
      if (error) { await ghiLoi(client, "chat-reply match_projects(tai lieu)", error.message); return null; }
      const d = (data as DuAnGon[] | null)?.[0];
      if (d) return { id: d.id, name: d.name };
      const n = await timDuAnTheoNghia(client, ten);
      return n ? { id: n.id, name: n.name } : null;
    };
    /** Cất tài liệu vào bucket riêng tư + dòng `du_an_tai_lieu` (giữ `noi_dung` khi chưa biết dự án). null khi không ghi được dòng. */
    const catTaiLieu = async (
      tep: { bytes: Uint8Array; mime: string; ten: string | null } | null, duAnId: string | null, kq: TaiLieuDoc | null, soCan: number,
    ): Promise<string | null> => {
      const duoi = tep ? ({ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[tep.mime] ?? "bin" : "bin";
      const path = `du-an/${duAnId ?? "chua-ro"}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${duoi}`;
      let daCat = false;
      if (tep && tep.bytes.byteLength) {
        const { error: upErr } = await client.storage.from("listing-private").upload(path, tep.bytes, { contentType: tep.mime, upsert: false });
        if (upErr) await ghiLoi(client, "chat-reply cat tai lieu du an", upErr.message);
        else daCat = true;
      }
      const { data, error } = await client.from("du_an_tai_lieu").insert({
        project_id: duAnId, seller_id: sellerRow.id, bucket: "listing-private", storage_path: daCat ? path : "",
        ten_tep: tep?.ten ?? null, mime: tep?.mime ?? null, loai: kq?.loai ?? "khac", so_can_doc: soCan,
        tom_tat: kq?.ghi_chu ?? null, noi_dung: duAnId ? null : kq,
      }).select("id").single();
      if (error) { await ghiLoi(client, "chat-reply du_an_tai_lieu", error.message); return null; }
      return (data as { id: string }).id;
    };
    /** Ghi từng căn đọc được vào kho (upsert theo dự án + mã) và mẫu nhà vào `projects.unit_types`. Trả số căn ghi. */
    const ghiCanDuAn = async (duAnId: string, kq: TaiLieuDoc, taiLieuId: string | null): Promise<number> => {
      if (kq.can.length) {
        const dong = kq.can.map((c) => ({
          project_id: duAnId, ma_can: c.ma_can, mau_nha: c.mau_nha, dien_tich_m2: m2TuChu(c.dien_tich), dien_tich_dat_m2: m2TuChu(c.dien_tich_dat),
          gia_raw: c.gia, huong: c.huong, tang: tangTuChu(c.tang),
          thuoc_tinh: { ...(c.ghi_chu ? { ghi_chu: c.ghi_chu } : {}), tu: kq.loai },
          nguon: "tai_lieu", tai_lieu_id: taiLieuId, seller_id: sellerRow.id, updated_at: new Date().toISOString(),
        }));
        const { error } = await client.from("du_an_can").upsert(dong, { onConflict: "project_id,ma_can" });
        if (error) { await ghiLoi(client, "chat-reply du_an_can upsert", error.message); return 0; }
      }
      if (kq.mau_nha.length) {
        const { data: pj } = await client.from("projects").select("unit_types").eq("id", duAnId).maybeSingle();
        const cu = Array.isArray((pj as { unit_types?: unknown } | null)?.unit_types) ? (pj as { unit_types: Array<Record<string, unknown>> }).unit_types : [];
        const daCo = new Set(cu.map((m) => String(m.ten ?? m.name ?? "").toLowerCase()));
        const them = kq.mau_nha.filter((m) => !daCo.has(m.ten.toLowerCase())).map((m) => ({ ten: m.ten, thong_so: m.thong_so, nguon: "tai_lieu" }));
        if (them.length) {
          const { error: utErr } = await client.from("projects").update({ unit_types: [...cu, ...them] }).eq("id", duAnId);
          if (utErr) await ghiLoi(client, "chat-reply projects.unit_types", utErr.message);
        }
      }
      return kq.can.length;
    };
    const TEN_LOAI_TL: Record<string, string> = { bang_gia: "bảng giá", phan_lo: "sơ đồ phân lô", brochure: "brochure", mat_bang: "mặt bằng", khac: "tài liệu" };
    /** Model đọc tài liệu → kho dự án. Trả các bong bóng nói với chủ nhà. */
    const nhanTaiLieuDuAn = async (nguon: NguonTaiLieu, tep: { bytes: Uint8Array; mime: string; ten: string | null } | null): Promise<string[]> => {
      if (!anthropicS) return [`Dạ em nhận được tài liệu rồi ạ, mà hiện em chưa đọc được. Em nhờ anh Thu phụ trách xem giúp rồi báo lại ${cachGoi} nha.`];
      const duAnTin = await duAnCuaTinDangHoi();
      let kq: TaiLieuDoc | null = null;
      try {
        const r = await docTaiLieuDuAn(anthropicS as unknown as Parameters<typeof docTaiLieuDuAn>[0], MODEL, nguon, duAnTin?.name ?? null);
        kq = r.kq;
        await doTien(client, r.usage as Parameters<typeof doTien>[1]);
      } catch (e) {
        await ghiLoi(client, "chat-reply doc tai lieu du an", e);
        return [`Dạ em nhận được tài liệu rồi mà đọc bị lỗi ạ. ${CachGoi} gửi lại giúp em, hoặc nhắn thẳng mã căn với giá cũng được.`];
      }
      if (!kq || kq.loai === "khac" || (!kq.can.length && !kq.mau_nha.length && !kq.tien_ich.length)) {
        await catTaiLieu(tep, duAnTin?.id ?? null, kq, 0);
        return [`Dạ em xem rồi mà không thấy bảng giá hay sơ đồ phân lô trong tài liệu này ạ. ${CachGoi} có bảng giá từng căn thì gửi em, em nhập vào kho dự án liền.`];
      }
      let duAn: DuAnGon | null = duAnTin ?? await timDuAnTheoTen(kq.ten_du_an);
      let duAnMoi = false;
      if (!duAn && kq.ten_du_an) {
        const { data: pj, error: pjErr } = await client.from("projects").insert({
          name: kq.ten_du_an, developer: kq.chu_dau_tu, source: "nguoi_ban", is_partner: false, amenities: kq.tien_ich.length ? kq.tien_ich : null,
        }).select("id, name").single();
        if (pjErr) await ghiLoi(client, "chat-reply tao du an tu tai lieu", pjErr.message);
        else { duAn = pj as DuAnGon; duAnMoi = true; }
      }
      const tenLoai = TEN_LOAI_TL[kq.loai] ?? "tài liệu";
      if (!duAn) {
        await catTaiLieu(tep, null, kq, kq.can.length);
        return [`Em đọc được ${tenLoai} có ${kq.can.length} căn${kq.mau_nha.length ? ` và ${kq.mau_nha.length} mẫu nhà` : ""} rồi ạ. Mà đây là dự án nào vậy ${cachGoi}? ${CachGoi} nhắn tên dự án là em nhập vào kho liền.`];
      }
      const tlId = await catTaiLieu(tep, duAn.id, kq, kq.can.length);
      const soCan = await ghiCanDuAn(duAn.id, kq, tlId);
      const mau = kq.mau_nha.slice(0, 3).map((m) => m.ten).join(", ");
      const vd = kq.can.slice(0, 3).map((c) => `${c.ma_can}${c.dien_tich ? ` ${c.dien_tich}` : ""}${c.gia ? ` · ${c.gia}` : ""}`).join("; ");
      return [
        `Em đọc ${tenLoai} dự án ${duAn.name}${duAnMoi ? " (dự án mới, em vừa thêm vào kho)" : ""} rồi ạ: ${soCan} căn${mau ? `, mẫu ${mau}` : ""}${vd ? `, ví dụ ${vd}` : ""}.${kq.ro_net ? "" : " Vài chỗ chữ mờ nên em chỉ ghi những căn đọc rõ."}`,
        `${CachGoi} rao căn nào thì nhắn mã căn với giá mình muốn bán, em điền diện tích và mẫu nhà từ ${tenLoai} luôn.`,
      ];
    };
    /** Tin rao "căn A5" của dự án có kho căn → điền diện tích / tầng còn trống từ kho, ghi chú mẫu nhà + giá niêm yết (không thành giá rao). */
    const dienTuKhoDuAn = async (listingId: string, projectId: string, maCan: string): Promise<void> => {
      const { data: c, error } = await client.from("du_an_can").select("ma_can, mau_nha, dien_tich_m2, dien_tich_dat_m2, gia_raw, huong, tang, thuoc_tinh")
        .eq("project_id", projectId).ilike("ma_can", maCan).limit(1).maybeSingle();
      if (error) { await ghiLoi(client, "chat-reply du_an_can(dien)", error.message); return; }
      const can = c as { ma_can: string; mau_nha: string | null; dien_tich_m2: number | null; dien_tich_dat_m2: number | null; gia_raw: string | null; huong: string | null; tang: number | null; thuoc_tinh: Record<string, unknown> | null } | null;
      if (!can) return;
      const { data: l } = await client.from("listings").select("area_m2, floor").eq("id", listingId).maybeSingle();
      const lr = (l ?? {}) as { area_m2?: number | string | null; floor?: number | null };
      const cap: Record<string, unknown> = {};
      if (can.dien_tich_m2 && lr.area_m2 == null) cap.area_m2 = can.dien_tich_m2;
      if (can.tang != null && lr.floor == null) cap.floor = can.tang;
      if (Object.keys(cap).length) {
        const { error: uErr } = await client.from("listings").update(cap).eq("id", listingId);
        if (uErr) await ghiLoi(client, "chat-reply dien tu kho du an", uErr.message);
      }
      const ghi = [
        can.mau_nha ? `mẫu ${can.mau_nha}` : null, can.dien_tich_m2 ? `${can.dien_tich_m2}m2` : null, can.dien_tich_dat_m2 ? `đất ${can.dien_tich_dat_m2}m2` : null,
        can.tang != null ? `tầng ${can.tang}` : null, can.huong ? `hướng ${can.huong}` : null, can.gia_raw ? `giá niêm yết ${can.gia_raw}` : null,
        typeof can.thuoc_tinh?.ghi_chu === "string" ? can.thuoc_tinh.ghi_chu : null,
      ].filter(Boolean).join(", ");
      if (ghi) {
        const { error: fErr } = await ghiFact(client, { p_listing_id: listingId, p_question: "bo_sung", p_answer: `theo kho dự án, căn ${can.ma_can}: ${ghi}`, p_source: "kho_du_an" });
        if (fErr) await ghiLoi(client, "chat-reply ghi_fact_listing(kho du an)", fErr.message);
      }
    };

    // ─── FR-114 mở rộng (09/09/2026, chat Gemini 21/06 "Sunrise City có hồ bơi
    // Olympic"): bot TỰ LÔI KIẾN THỨC DỰ ÁN ra khi chủ nhà nhắc tên dự án có
    // trong kho, hoặc căn đang hỏi đã gắn dự án. Kho là bảng `projects` (admin
    // nhập) — không có trong kho thì không bịa. Chỉ gọi `match_projects` khi câu
    // có dấu hiệu tên dự án, kẻo mỗi tin chủ nhà tốn thêm một vòng DB (FR-171 h).
    type DuAnKho = {
      id: string; name: string; developer?: string | null; district?: string | null; ward?: string | null;
      location_raw?: string | null; amenities?: unknown; description?: string | null; status_text?: string | null;
    };
    // 14/10/2026 (test tay "Bạn có thông tin về Conic Boulevard không?" — tên dự án không chứa chữ nào trong danh sách từ khoá
    // "du an / chung cu / city / garden…", kho không được tra, bot không trả lời): chế độ `ai` tra kho khi AI đọc ra TÊN dự án của căn
    // (ô `du_an`, tra bằng chính tên đó) hoặc AI hiểu khách đang HỎI về một dự án (`hoi_lai.chu_de = du_an`). Không tra trên mọi tin:
    // match_projects khớp gần đúng, tên đường giống tên dự án ("Phan Xích Long Phú Nhuận") sẽ kéo kiến thức dự án SAI vào lời bot.
    // Từ khoá chỉ đỡ khi AI không chạy. Tin đã lên kệ (không còn câu treo) vẫn mang dự án của căn đang neo.
    const coDauHieuDuAn = /\b(du an|chung cu|can ho|khu|city|plaza|residence|residences|tower|towers|park|garden|riverside|home|homes|villa|villas|ny'?ah|sunrise|vinhomes|masteri|akari|carina)\b/.test(tKD);
    const tenDuAnAi = laCheDoAi && bongAi ? (await bongAi)?.truong?.find((f) => f.khoa === "du_an")?.gia_tri?.trim() || null : null;
    const hoiVeDuAnAi = laCheDoAi && !tenDuAnAi ? (await hoiLaiAi(text))?.chuDe === "du_an" : false;
    const traKhoDuAn = laCheDoAi ? !!tenDuAnAi || hoiVeDuAnAi || pendingReq?.question === "du_an_ten" : coDauHieuDuAn;
    const duAnCanNeo = pendingReq?.listings?.project_id ??
      ((tinCuaNguoi ?? []) as Array<{ id: string; project_id?: string | null }>).find((t) => t.id === sellerRow.active_listing_id)?.project_id ?? null;
    const [duAnNoi, duAnCanHoi] = await Promise.all([
      traKhoDuAn
        ? client.rpc("match_projects", { p_text: tenDuAnAi ?? text }).select(COT_DU_AN).then((r) => ((r.data ?? []) as DuAnKho[]).slice(0, 1))
        : Promise.resolve([] as DuAnKho[]),
      duAnCanNeo
        ? client.from("projects").select("id, name, developer, district, ward, location_raw, amenities, description, status_text, specs")
          .eq("id", duAnCanNeo).maybeSingle().then((r) => (r.data ? [r.data as DuAnKho] : []))
        : Promise.resolve([] as DuAnKho[]),
    ]);
    const duAnBiet = [...duAnNoi, ...duAnCanHoi.filter((d) => !duAnNoi.some((x) => x.id === d.id))].slice(0, 2);
    if (duAnBiet.length) {
      const dong = duAnBiet.map((p) => {
        const tienIch = Array.isArray(p.amenities) ? (p.amenities as string[]).slice(0, 12).join(", ") : "";
        // 02/10/2026 (test tay, SRS-5.1ze): chủ nhà nhắc "khu Ny'ah Phú Định" → khối này mang `specs` của CẢ dự án ("nhà phố 4-6
        // tầng, thang máy") → bot hỏi "Nhà phố 4-6 tầng có thang máy thì bao nhiêu phòng ngủ" như thể đó là căn của chủ nhà. Đây là
        // nhánh NGƯỜI BÁN: thông số dự án không dùng để hỏi căn này — bỏ `specs`, mô tả cắt ngắn, và nói rõ trong lệnh.
        return `• ${p.name}${p.developer ? ` - CĐT ${p.developer}` : ""}${p.location_raw || p.district ? ` · ${p.location_raw ?? p.district}` : ""}${tienIch ? ` · tiện ích: ${tienIch}` : ""}${p.status_text ? ` · ${p.status_text}` : ""}${p.description ? ` · ${String(p.description).slice(0, 200)}` : ""}`;
      }).join("\n");
      duAnNguon = dong;
      boiCanh += `DỰ ÁN (kiến thức ĐÃ XÁC THỰC trong kho về CẢ dự án, KHÔNG phải căn của chủ nhà) - khen bằng đúng MỘT tiện ích của dự án ở đây khi hợp mạch, KHÔNG bịa tiện ích khác. TUYỆT ĐỐI không dùng khối này để nói, đoán hay hỏi về căn của chủ nhà (số tầng, diện tích, thang máy, kết cấu, phòng ngủ, giá): đặc điểm căn CHỈ lấy từ lời chủ nhà và THÔNG TIN ĐÃ GHI. Nhắc tới thông tin ở khối này (thông tin chung của dự án / khu, không phải lời chủ nhà) thì LUÔN mở bằng 'Theo em biết, dự án <tên> …' để chủ nhà biết đó là thông tin chung bên em nắm. Chủ nhà hỏi con số dự án mà ở đây không có thì nói thẳng 'con số đó em xác nhận lại rồi báo anh/chị' — không lấy từ trí nhớ của mình:\n${dong}\n\n`;
      // SRS-5.1zzj: kho CĂN DỰ ÁN (đọc từ bảng giá / phân lô người bán gửi) — model trả lời "căn góc lớn nhất?", "mẫu Cosmo
      // mấy tầng?" từ danh sách này, không bịa căn ngoài; giá là giá NIÊM YẾT, không phải giá chủ nhà rao.
      for (const p of duAnBiet.slice(0, 1)) {
        const { data: dsCan, error: dsErr } = await client.rpc("can_du_an", { p_project_id: p.id, p_gioi_han: 40 });
        if (dsErr) { await ghiLoi(client, "chat-reply can_du_an", dsErr.message); continue; }
        const kho = (dsCan ?? []) as Array<{ ma_can: string; mau_nha: string | null; dien_tich_m2: number | null; dien_tich_dat_m2: number | null; gia_raw: string | null; huong: string | null; tang: number | null; thuoc_tinh: Record<string, unknown> | null }>;
        if (!kho.length) continue;
        const dongKho = kho.map((c) => [
          c.ma_can, c.mau_nha, c.dien_tich_m2 ? `${c.dien_tich_m2}m2` : null, c.dien_tich_dat_m2 ? `đất ${c.dien_tich_dat_m2}m2` : null,
          c.tang != null ? `tầng ${c.tang}` : null, c.huong, c.gia_raw ? `niêm yết ${c.gia_raw}` : null,
          typeof c.thuoc_tinh?.ghi_chu === "string" ? c.thuoc_tinh.ghi_chu : null,
        ].filter(Boolean).join(" · ")).join("\n");
        boiCanh += `CĂN TRONG DỰ ÁN ${p.name} (kho ${kho.length} căn từ bảng giá / phân lô người bán gửi — giá là giá NIÊM YẾT, không phải giá chủ nhà rao; chỉ nói về căn / mẫu CÓ trong danh sách, không bịa căn khác):\n${dongKho}\n\n`;
      }
      // SRS-5.1zzj: tài liệu gửi lượt trước mà chưa rõ dự án → chủ nhà vừa nhắc tên → gắn và ghi căn từ `noi_dung`.
      if (duAnNoi[0]) {
        const { data: treo, error: treoErr } = await client.from("du_an_tai_lieu").select("id, noi_dung").eq("seller_id", sellerRow.id).is("project_id", null)
          .gte("created_at", new Date(Date.now() - 6 * 3600e3).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (treoErr) await ghiLoi(client, "chat-reply tai lieu treo", treoErr.message);
        const nd = treo as { id: string; noi_dung: TaiLieuDoc | null } | null;
        if (nd?.noi_dung?.can?.length) {
          const so = await ghiCanDuAn(duAnNoi[0].id, nd.noi_dung, nd.id);
          const { error: gErr } = await client.from("du_an_tai_lieu").update({ project_id: duAnNoi[0].id, noi_dung: null }).eq("id", nd.id);
          if (gErr) await ghiLoi(client, "chat-reply gan tai lieu treo", gErr.message);
          ackAnh.push(`Dạ em gắn ${so} căn từ ${TEN_LOAI_TL[nd.noi_dung.loai] ?? "tài liệu"} hôm trước vào dự án ${duAnNoi[0].name} rồi ạ.`);
        }
      }
      // Căn đang hỏi chưa gắn dự án mà chủ nhà vừa nhắc đúng tên → gắn luôn.
      // SRS-5.1zzh (05/10/2026): "em biết dự án X không" là câu HỎI về X, không phải căn này ở X — AI nói cả tin là câu hỏi thì
      // không gắn (từng gắn Ny'ah Phú Định / Vinhomes Grand Park vào tin đang hỏi chỉ vì khách hỏi bot có biết không).
      const hoiDuAn = await hoiLaiAi(text);
      // 14/10/2026: match_projects nay chạy trên mọi tin (bỏ cổng từ khoá) → chế độ AI chỉ gắn khi AI đọc ra tên dự án LÀ của căn
      // (ô du_an) hoặc khách đang trả lời câu tên dự án; tên đường trùng tên dự án không còn kéo dự án vào tin.
      const aiNoiDuAn = !laCheDoAi || pendingReq?.question === "du_an_ten" || !!tenDuAnAi;
      if (duAnNoi[0] && aiNoiDuAn && pendingReq && !pendingReq.listings?.project_id && !wantsSell && !hoiDuAn?.caTin && hoiDuAn?.chuDe !== "du_an") {
        const { error: gdErr } = await client.from("listings").update({ project_id: duAnNoi[0].id })
          .eq("id", pendingReq.listing_id).is("project_id", null);
        if (gdErr) await ghiLoi(client, "chat-reply gan du an", gdErr.message);
        else if (pendingReq.listings) pendingReq.listings.project_id = duAnNoi[0].id;
      }
      // SRS-5.1zzzzzh: căn đã / vừa gắn dự án mà chưa có phường → phường của dự án. Câu phường đang treo thì không chen (lời khách lượt này
      // đang trả lời câu đó; lượt sau sẽ có phường trước khi chọn câu kế).
      if (pendingReq?.listings && pendingReq.question !== "phuong") {
        const daCuaTin = duAnCanHoi[0] ?? (pendingReq.listings.project_id === duAnNoi[0]?.id ? duAnNoi[0] : null);
        const tenP = await phuongTuDuAn(pendingReq.listing_id, daCuaTin, pendingReq.listings.ward, pendingReq.listings.property_type ?? null);
        if (tenP) pendingReq.listings.ward = tenP;
      }
    }

    // ─── SRD §IV.3 (05/10/2026, SRS-5.1zzf): trần số căn theo hạng — hỏi DB một lần mỗi lượt (`con_duoc_rao`, hạng Đồng tối đa
    // 5 căn). RPC hỏng → không chặn, ghi sổ. Dùng ở hai chỗ mở tin mới (câu rao thường, câu rao nhiều căn).
    type TranHang = { duoc: boolean; hang: string; so_dang_rao: number; tran: number | null; diem: number | null };
    let tranHangNho: Promise<TranHang | null> | null = null;
    const tranHangRao = (): Promise<TranHang | null> => tranHangNho ??= (async () => {
      const { data, error } = await client.rpc("con_duoc_rao", { p_seller_id: sellerRow.id });
      if (error) { await ghiLoi(client, "chat-reply con_duoc_rao", error.message); return null; }
      return (data as TranHang | null) ?? null;
    })();
    const cauTranHang = (tr: TranHang) =>
      `Dạ ${cachGoi} đang có ${tr.so_dang_rao} tin trên hệ thống, hạng Đồng hiện tối đa ${tr.tran ?? 5} căn nên em chưa mở thêm được ạ.\n` +
      `${CachGoi} bổ sung đủ thông tin và ảnh cho các tin của mình để điểm lên 50 (hạng Bạc) là em mở rổ không giới hạn liền.`;
    // SRS-5.1zzs (AOND §IV gamification, 06/10/2026): tin lên kệ thì nói HẠNG người rao (Đồng / Bạc / Vàng — dữ liệu đã có từ
    // `con_duoc_rao`, trước đây không bao giờ nói ra). Một câu, một lần, ở cả nhánh duyệt thường lẫn "đăng đi". Câu nhắc
    // "chuẩn môi giới 10 căn" đã bỏ cùng ngày theo chủ dự án — không hứa, không rao thêm việc.
    const dongHangRao = async (): Promise<string> => {
      const tr = await tranHangRao();
      if (!tr?.hang) return "";
      const diem = Number(tr.diem ?? 0);
      const lyDo = tr.hang === "vang"
        ? `đạt ${diem}/100 điểm đầy đủ và uy tín, được ưu tiên giới thiệu đầu tiên cho khách mua`
        : tr.hang === "bac"
        ? `đạt ${diem}/100 điểm, gửi thêm ảnh hoặc sổ đỏ để lên hạng Vàng ưu tiên hiển thị`
        : `đạt ${diem}/100 điểm thông số cơ bản, bổ sung thêm ảnh và kết cấu để lên hạng Bạc/Vàng`;
      // SRS-5.1zzzzzzz2: câu khích lệ có quyền lợi thật — môi giới chưa Vàng, dưới 10 căn (hệ số điểm chỉ tăng tới 10 căn).
      const khichLe = sellerRow.seller_type === "nmg" && tr.hang !== "vang" && tr.so_dang_rao < 10 ? cauTD("dang_xong_khich_le") : "";
      return [cauTD("dang_xong_hang", { hang: tenHang(tr.hang), ly_do: lyDo }), khichLe].filter(Boolean).join(" ");
    };

    // ─── SRD §VI 2.4 (05/10/2026, SRS-5.1zzc): câu keep-alive "còn bán không" đang treo. AI đọc theo NGHĨA: gật với câu bot vừa
    // hỏi = còn; `y_dinh` ban_roi / ngung_rao; không đồng ý mà không nói bán rồi = tạm ngưng (đảo ngược được). `docTraLoiConBan`
    // chỉ khi AI không chạy. Thăm dò 05/10 trước bản sửa: "còn em" → answered nhưng không đóng dấu, đáp "em ghi nhận"; "vẫn đang
    // bán nha" → hỏi "căn đó hay căn khác"; "ừ" → câu bị thôi; "bán rồi em" → hỏi "căn nào" dù câu hỏi đã gắn căn.
    let ngungTuConBan: NgungRao | null = null;
    if (pendingReq?.question === "con_ban" && !imageUrl && !humanActive) {
      const ydCB = await yDinhAi();
      const dyCB = await dongYAi();
      const kqCB: "con" | NgungRao | null = ydCB !== undefined || dyCB !== undefined
        ? (ydCB?.loai === "ban_roi" ? "ban_roi" : ydCB?.loai === "ngung_rao" ? "rut"
          : dyCB?.la === "dong_y" ? "con" : dyCB?.la === "khong_dong_y" ? "rut" : null)
        : docTraLoiConBan(text);
      if (kqCB === "con") {
        const luc = new Date().toISOString();
        const [{ error: cbErr }, { error: lcErr }, { error: evErr }] = await Promise.all([
          client.from("info_requests").update({ status: "answered", answer: "còn", answered_at: luc }).eq("id", pendingReq.id),
          client.from("listings").update({ last_confirmed_at: luc }).eq("id", pendingReq.listing_id),
          client.from("property_events").insert({ listing_id: pendingReq.listing_id, event_type: "status", meta: { con_ban: true, nguon: "keep_alive" } }),
        ]);
        if (cbErr) await ghiLoi(client, "chat-reply con_ban(answered)", cbErr.message);
        if (lcErr) await ghiLoi(client, "chat-reply con_ban(last_confirmed_at)", lcErr.message);
        if (evErr) await ghiLoi(client, "chat-reply con_ban(property_events)", evErr.message);
        const tenCB = tenCanDocLen(pendingReq.listings ?? {});
        const thueCB = pendingReq.listings?.deal === "cho_thue";
        return await traLoiSeller(
          [`Dạ em cảm ơn ${cachGoi}, em giữ tin căn ${tenCB} và tiếp tục tìm khách ${thueCB ? "thuê" : "mua"}. Có khách hỏi em báo ${cachGoi} liền ạ.`],
          { con_ban: true, can: pendingReq.listings?.code ?? pendingReq.listing_id },
        );
      }
      if (kqCB) ngungTuConBan = kqCB;
      // null → chủ nhà nói chuyện khác: đi đường thường, câu còn treo (lượt kế hỏi lại).
    }

    // ─── FR-184 (chat Gemini 21/06, chủ dự án chốt 09/09/2026): CHỦ NHÀ BÁO
    // "BÁN RỒI" / "NGƯNG BÁN". Tiền định (`laNgungRao`), không model. Một căn
    // đang rao → đóng ngay (bán rồi → `da_chot`, trigger FR-108 báo khách đang
    // chờ; rút → `an`), đóng mọi câu treo, huỷ nhắc, ghi `boc_tach.ket_thuc`.
    // Nhiều căn → liệt kê hỏi căn nào (câu chờ `ngung_rao_can_nao`, đáp án đọc
    // bằng `chonCanTheoCau`: số thứ tự hoặc địa chỉ). "Chốt rồi / ok đăng đi" lúc
    // đang DUYỆT BẢN NHÁP là gật, không phải báo bán — nhường cho khối duyệt.
    // ─── SRS-5.1zzl (05/10/2026, demo AOND `_DESTRUCTIVE_OPS` + `pending_destructive`): GOM NHIỀU CĂN một câu — "chỉ giữ căn A,
    // ẩn hết còn lại", "gỡ hết đi", "ngưng rao hết trừ căn Trần Hưng Đạo". AI đọc ý (`ngung_hang_loat`, doc-y-luot), luật
    // `laNgungHangLoat` chỉ đỡ khi AI không chạy. KHÔNG ẩn ngay: liệt kê căn sẽ ẩn và hỏi xác nhận; gật ở lượt sau mới ẩn (đảo
    // ngược được bằng "rao lại"). Khối FR-184 bên dưới vẫn lo trường hợp MỘT căn.
    type CanGom = { id: string; code: string | null; location_raw: string | null; ward: string | null; district: string | null; deal: string | null; property_type: string | null };
    const dangXacNhanNHL = pendingReq?.question === "xac_nhan_ngung_hang_loat";
    if (dangXacNhanNHL && pendingReq && !humanActive) {
      let ke: { an: string[]; giu: string[] } = { an: [], giu: [] };
      try { ke = { an: [], giu: [], ...JSON.parse(pendingReq.answer ?? "{}") }; } catch { /* câu treo hỏng → bỏ qua */ }
      const gat = await gatLuot(() => laDongY(text));
      const dy = await dongYAi();
      const tuChoi = !gat && (dy !== undefined ? dy?.la === "khong_dong_y" : /\b(khong|ko|k|thoi|khoan|dung|huy|giu nguyen)\b/.test(boDau(text)));
      const dongCau = async (st: "answered" | "expired", ans?: string) => {
        const { error } = await client.from("info_requests").update({ status: st, ...(ans ? { answer: ans, answered_at: new Date().toISOString() } : {}) }).eq("id", pendingReq.id);
        if (error) await ghiLoi(client, "chat-reply xac_nhan_ngung_hang_loat", error.message);
      };
      if (gat && ke.an.length) {
        const luc = new Date().toISOString();
        const [{ error: e1 }, { error: e2 }, { error: e3 }] = await Promise.all([
          client.from("listings").update({ status: "an", chu_noi_du_at: luc }).in("id", ke.an),
          client.from("info_requests").update({ status: "expired" }).in("listing_id", ke.an).eq("status", "pending"),
          client.from("reminders").update({ status: "cancelled" }).in("listing_id", ke.an).eq("status", "pending"),
        ]);
        if (e1) await ghiLoi(client, "chat-reply listings(an hang loat)", e1.message);
        if (e2) await ghiLoi(client, "chat-reply info_requests(an hang loat)", e2.message);
        if (e3) await ghiLoi(client, "chat-reply reminders(an hang loat)", e3.message);
        for (const id of ke.an) {
          const { error } = await client.rpc("ghi_boc_tach", { p_listing_id: id, p: { ket_thuc: "rut", ket_thuc_luc: luc, ket_thuc_loi: `hàng loạt: ${text.slice(0, 120)}` } });
          if (error) await ghiLoi(client, "chat-reply ghi_boc_tach(an hang loat)", error.message);
        }
        await dongCau("answered", JSON.stringify({ ...ke, da_an: true }));
        return await traLoiSeller([
          `Dạ em đã ngưng rao ${ke.an.length} căn theo ý ${cachGoi}${ke.giu.length ? `, giữ lại ${ke.giu.length} căn` : ""}. Lúc nào muốn rao lại căn nào thì nhắn em, em mở lại liền.`,
        ], { ngung_hang_loat: ke.an.length, giu: ke.giu.length });
      }
      if (tuChoi) {
        await dongCau("expired");
        return await traLoiSeller([`Dạ vậy em giữ nguyên, không ẩn căn nào ạ.`], { ngung_hang_loat: 0, giu_nguyen: true });
      }
      // Nói chuyện khác → bỏ câu xác nhận, không ẩn gì, đi tiếp như thường.
      await dongCau("expired");
    }
    if (!dangXacNhanNHL && !humanActive && !imageUrl && !fileUrl && !linkUrl) {
      const nhlAi = await ngungHangLoatAi();
      const nhl = nhlAi !== undefined ? nhlAi : laNgungHangLoat(text);
      if (nhl) {
        const { data: moRaw, error: moErr } = await client.from("listings").select("id, code, location_raw, ward, district, deal, property_type")
          .eq("seller_id", sellerRow.id).in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"]).order("created_at", { ascending: true }).limit(10);
        if (moErr) await ghiLoi(client, "chat-reply ngung hang loat (doc tin)", moErr.message);
        const mo = (moRaw ?? []) as CanGom[];
        if (mo.length >= 2) {
          const giu = nhl.kieu === "chi_giu" ? nhl.giu.map((g) => chonCanTheoCau(g, mo)).filter((c): c is CanGom => !!c) : [];
          const giuIds = new Set(giu.map((c) => c.id));
          if (nhl.kieu === "chi_giu" && !giu.length) {
            return await traLoiSeller([
              `Dạ ${cachGoi} muốn giữ lại căn nào ạ? Em đang giữ ${mo.length} tin của ${cachGoi}:\n${mo.map((c, i) => `${i + 1}. ${tenCanDocLen(c)}`).join("\n")}\nNhắn số thứ tự hoặc địa chỉ giúp em, mấy căn còn lại em sẽ ngưng rao sau khi ${cachGoi} xác nhận.`,
            ], { ngung_hang_loat: "hoi_giu" });
          }
          const an = mo.filter((c) => !giuIds.has(c.id));
          if (an.length) {
            const { error: irErr } = await moCauTreo({
              listing_id: mo[0].id, question: "xac_nhan_ngung_hang_loat", status: "pending",
              answer: JSON.stringify({ an: an.map((c) => c.id), giu: giu.map((c) => c.id) }),
            });
            if (irErr && irErr.code !== "23505") await ghiLoi(client, "chat-reply mo xac_nhan_ngung_hang_loat", irErr.message);
            return await traLoiSeller([
              `Em sẽ ngưng rao ${an.length} căn:\n${an.map((c, i) => `${i + 1}. ${tenCanDocLen(c)}`).join("\n")}${giu.length ? `\nGiữ lại: ${giu.map((c) => tenCanDocLen(c)).join("; ")}.` : ""}\n${CachGoi} chắc chưa ạ? Nhắn "ừ" là em ẩn, "thôi" là em giữ nguyên.`,
            ], { ngung_hang_loat: "hoi_xac_nhan", so_an: an.length, so_giu: giu.length });
          }
        }
      }
    }
    const dangChonCanNgung = pendingReq?.question === "ngung_rao_can_nao";
    // Xin chủ nhà chấm điểm cách chăm sóc — MỘT lần cho mỗi tin. 09/09/2026 đặt ở cuối vòng hỏi
    // ("đủ rồi" / hết câu); 22/09/2026 (bắn thật, chủ dự án "mục 5 dời đi"): hỏi ngay sau khi vừa
    // đăng tin đứng sai chỗ về giọng và nuốt câu hỏi kế của chủ nhà — nay chỉ hỏi sau SỰ KIỆN THẬT:
    // chủ nhà báo BÁN ĐƯỢC (chúc mừng xong mới xin điểm). Mở câu chờ `danh_gia`; đã từng mở thì thôi.
    // SRS-5.1zzzzzl (chủ dự án 13/10/2026: "Sau khi giao tiếp mấy phút chị đánh giá cho em là em trả lời tốt chưa", chọn "Sau khi tin lên
    // kệ, lưu điểm"): hỏi thêm ở bong bóng cuối lúc tin LÊN KỆ — chỉ khi lượt đó không còn câu hỏi nào khác (dẫn phí, trả lời câu hỏi kèm),
    // MỘT lần cho mỗi người rao (mọi tin của họ). Câu trả lời đi đường `danh_gia` cũ: ghi fact `danh_gia` + đóng câu; tin không phải điểm
    // thì câu điểm hết hạn, tin đi đường thường (không nuốt câu kế — bài học 22/09).
    const xinChamDiem = async (listingId: string): Promise<string | null> => {
      const idsNguoi = [...new Set([listingId, ...((tinCuaNguoi ?? []) as Array<{ id: string }>).map((t) => t.id)])];
      const { data: daXin } = await client.from("info_requests").select("id")
        .in("listing_id", idsNguoi).eq("question", "danh_gia").limit(1);
      if (daXin?.length) return null;
      const { error: irErr } = await moCauTreo({
        listing_id: listingId, question: "danh_gia", status: "pending",
      });
      if (irErr) {
        if (irErr.code !== "23505") await ghiLoi(client, "chat-reply mo danh_gia", irErr.message);
        return null;
      }
      return cauHoiMau("danh_gia", cachGoi);
    };
    // Đợt 2 (02/10/2026): chế độ `ai` → AI đọc ý định (đã bán / thôi bán, có trích dẫn); từ khoá chỉ đỡ khi AI không chạy.
    const ydNgung = dangChonCanNgung || ngungTuConBan ? undefined : await yDinhAi();
    const kieuNgung: NgungRao | null = ngungTuConBan ?? (dangChonCanNgung
      ? ((pendingReq?.answer === "rut" ? "rut" : "ban_roi") as NgungRao)
      : (pendingReq?.question === "duyet_tin" && await gatLuot(() => laDongY(text))) ? null
      : ydNgung !== undefined ? (ydNgung?.loai === "ban_roi" ? "ban_roi" : ydNgung?.loai === "ngung_rao" ? "rut" : null)
      : laNgungRao(text));
    if (kieuNgung) {
      type CanRao = { id: string; code: string | null; location_raw: string | null; ward: string | null; district?: string | null; deal?: string | null; property_type?: string | null };
      // 22/09/2026 (kịch bản E): "căn 1 bán rồi, còn căn 2" từng gỡ CĂN 2 — danh sách xếp mới→cũ nên "căn 1" là
      // căn mở SAU. Số thứ tự chủ nhà nói là thứ tự MỞ (như bong bóng "Em mở 2 tin riêng"): cũ → mới.
      const { data: dangRao } = await client.from("listings").select("id, code, location_raw, ward, district, deal, property_type")
        .eq("seller_id", sellerRow.id).in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"])
        .order("created_at", { ascending: true }).limit(10);
      const cans = (dangRao ?? []) as CanRao[];
      const tenCan = tenCanDocLen;
      const dongCauChon = async () => {
        if (!dangChonCanNgung || !pendingReq) return;
        await client.from("info_requests").update({ status: "expired" }).eq("id", pendingReq.id);
      };
      if (!cans.length) {
        await dongCauChon();
        return await traLoiSeller([`Dạ hiện em không thấy tin nào của ${cachGoi} đang rao. Khi nào có căn khác ${cachGoi} nhắn em nha.`], { ngung_rao: kieuNgung, can: null });
      }
      // Câu keep-alive đã gắn căn → đóng đúng căn đó, không hỏi "căn nào" (SRS-5.1zzc).
      const canConBan = ((): CanRao | null => ngungTuConBan && pendingReq ? cans.find((c) => c.id === pendingReq.listing_id) ?? null : null)();
      const chon = canConBan ?? (dangChonCanNgung ? chonCanTheoCau(text, cans) : (cans.length === 1 ? cans[0] : chonCanTheoCau(text, cans)));
      if (!chon) {
        if (!dangChonCanNgung) {
          const { error: irErr } = await moCauTreo({
            listing_id: cans[0].id, question: "ngung_rao_can_nao", status: "pending", answer: kieuNgung,
          });
          if (irErr && irErr.code !== "23505") await ghiLoi(client, "chat-reply mo ngung_rao_can_nao", irErr.message);
        }
        const ds = cans.map((c, i) => `${i + 1}. ${tenCan(c)}`).join("\n");
        const hoi = `${CachGoi} đang có ${cans.length} tin bên em, mình ${kieuNgung === "ban_roi" ? "đã bán" : "ngưng rao"} căn nào ạ?\n${ds}\nNhắn số thứ tự hoặc địa chỉ giúp em.`;
        return await traLoiSeller([hoi], { ngung_rao: kieuNgung, hoi_can: cans.length });
      }
      const luc = new Date().toISOString();
      const trangThai = kieuNgung === "ban_roi" ? "da_chot" : "an";
      if (ngungTuConBan && pendingReq) {
        const { error: cbErr } = await client.from("info_requests")
          .update({ status: "answered", answer: kieuNgung === "ban_roi" ? "bán rồi" : "ngưng", answered_at: luc }).eq("id", pendingReq.id);
        if (cbErr) await ghiLoi(client, "chat-reply con_ban(dong)", cbErr.message);
      }
      const [{ error: upErr }] = await Promise.all([
        client.from("listings").update({ status: trangThai, chu_noi_du_at: luc }).eq("id", chon.id),
        client.from("info_requests").update({ status: "expired" }).eq("listing_id", chon.id).eq("status", "pending"),
        client.from("reminders").update({ status: "cancelled" }).eq("listing_id", chon.id).eq("status", "pending"),
        client.rpc("ghi_boc_tach", { p_listing_id: chon.id, p: { ket_thuc: kieuNgung, ket_thuc_luc: luc, ket_thuc_loi: text.slice(0, 200) } }),
        dongCauChon(),
      ]);
      if (upErr) await ghiLoi(client, "chat-reply ngung rao", upErr.message);
      const thue = chon.deal === "cho_thue";
      // 22/09/2026 (bộ đo giọng B13): "đã báo các khách đang chờ" khi CHƯA có khách nào là câu khuôn bịa —
      // đếm `interests` của căn, không có thì không nói.
      const { count: soKhachCho, error: kcErr } = await client.from("interests")
        .select("listing_id", { count: "exact", head: true }).eq("listing_id", chon.id);
      if (kcErr) await ghiLoi(client, "chat-reply dem interests(ban roi)", kcErr.message);
      const baoKhach = (soKhachCho ?? 0) > 0 ? " và báo các khách đang chờ" : "";
      const cau = kieuNgung === "ban_roi"
        ? `Dạ chúc mừng ${cachGoi} đã ${thue ? "cho thuê được" : "bán được"} căn ${tenCan(chon)}!\nEm đã gỡ tin khỏi kệ${baoKhach}. Khi nào có căn khác ${cachGoi} cứ nhắn em nha.`
        : `Dạ em đã ngưng rao căn ${tenCan(chon)} theo ý ${cachGoi} và không hỏi thêm nữa.\nLúc nào muốn rao lại ${cachGoi} nhắn em một tiếng là em mở lại liền.`;
      const xinDiemBan = kieuNgung === "ban_roi" ? await xinChamDiem(chon.id) : null;
      return await traLoiSeller(xinDiemBan ? [cau, xinDiemBan] : [cau], { ngung_rao: kieuNgung, can: chon.code ?? chon.id, listing_status: trangThai, xin_danh_gia: !!xinDiemBan || undefined });
    }

    // ─── 22/09/2026 (bắn thật căn hộ Hùng Vương Plaza): chủ nhà HỎI VỀ CHÍNH TIN CỦA MÌNH — "hồi nãy
    // anh nói giá bao nhiêu nhỉ" từng được đáp "em kiểm tra rồi báo lại" dù giá nằm trong DB; "có khách
    // nào hỏi chưa em" bị nuốt làm câu trả lời chấm điểm. Thứ hệ thống đang giữ thì trả lời tiền định
    // từ DB (giá, diện tích, địa chỉ, tầng, hướng, pháp lý, tình trạng, số khách quan tâm), rồi hỏi lại
    // câu đang treo nếu có. Nhận diện chặt (`hoiVeTin`): dáng hỏi + không có số kèm đơn vị.
    // Đợt 3 (02/10/2026, SRS-5.1zg): lượt AI nhỏ đọc yêu cầu theo nghĩa (`yeuCauAi`); `hoiVeTin` + phủ quyết `hoiLaiAi` chỉ
    // còn là lưới đỡ khi AI không chạy.
    const ycLuot = await yeuCauAi();
    /** Xin xoá dữ liệu: AI quyết cho cả lượt; luật chỉ khi AI không chạy. */
    const xinXoaLuot = (cau: string): boolean => ycLuot !== undefined ? ycLuot?.loai === "xin_xoa_du_lieu" : laXinXoaDuLieu(cau); // lưới đỡ
    /** SRS-5.1zzzzzzr: câu trả lời cho câu hỏi về tin mà khách hỏi KÈM lời gật bản nháp — nối vào lượt đăng. */
    let dapHoiKemDuyet: string | null = null;
    {
      let loaiHoiTin: LoaiHoiTin | null = ycLuot !== undefined
        ? (ycLuot?.loai.startsWith("hoi_") ? ycLuot.loai.slice(4) as LoaiHoiTin : null)
        : hoiVeTin(text); // lưới đỡ
      // AI đọc nghĩa: không phải câu hỏi, hay hỏi chuyện khác (giá KHU VỰC, phí…) → không đáp bằng dữ liệu tin (bắn thử
      // lx-hn-62: "giá khu này giờ sao em" — bỏ dấu "này" = "nãy" — từng được đáp "giá mình đang rao là 15 tỷ").
      if (loaiHoiTin) {
        const h = await hoiLaiAi(text);
        // Bắn thử v312 (lx-hn-92): "tin của anh ai xem được vậy" (hỏi AI XEM ĐƯỢC — dịch vụ) từng được đáp số khách quan tâm.
        // SRS-5.1zzzzy: lượt AI nhỏ đọc "cái chữ pháp lý là sao" thành hỏi lại pháp lý của tin; lượt bóc tách (cùng tin, không gọi
        // thêm model) nói là hỏi NGHĨA từ → không đáp bằng dữ liệu tin, để model giải thích (CHI_DAN_CHU_DE.nghia_tu).
        if (ycLuot === undefined ? h !== undefined && (!h || h.chuDe !== "tin_cua_minh") : h?.chuDe === "nghia_tu") {
          console.log("chat-reply: hoi ve tin — AI noi khong phai", loaiHoiTin, h?.chuDe ?? "khong hoi");
          loaiHoiTin = null;
        }
      }
      // SRS-5.1zzzzzc (khách mô phỏng lần năm: "Phường Cầu Kiệu em ơi, mà chị còn muốn hỏi là em có giúp chị đăng tin đó không" → nhánh này
      // trả lời câu hỏi rồi HỎI LẠI câu đang treo "Nhà mình phường mấy chị nhỉ?" — phần trả lời phường trong cùng tin chưa từng được xử lý,
      // vì nhánh này trả về TRƯỚC đường câu treo). Tin vừa trả lời / đưa dữ liệu vừa hỏi: AI bóc tách đọc ra ô hay câu trả lời → đi đường
      // chính (ghi trước, câu hỏi được trả lời ở đó như mọi câu hỏi kèm); nhánh này chỉ cho tin CHỈ hỏi về tin.
      if (loaiHoiTin && laCheDoAi && bongAi) {
        const kD = await bongAi;
        if (kD?.ket && (kD.truong?.length || kD.traLoi?.co_tra_loi)) {
          console.log("chat-reply: hoi ve tin kem du lieu — di duong chinh", loaiHoiTin);
          loaiHoiTin = null;
        }
      }
      const lidHoi = loaiHoiTin ? (pendingReq?.listing_id ?? sellerRow.active_listing_id ?? null) : null;
      const hoiLaiTreoTin = () => pendingReq && !["danh_gia", "duyet_tin", "hinh_anh"].includes(pendingReq.question)
        ? cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal)
        : null;
      // SRS-5.1zzzzzq: xin NỘI DUNG tin → bản tin dựng từ cột + fact (`guiBanNhap` chế độ chỉ xem), không để model viết. Chưa có tin → nói thật.
      if (loaiHoiTin === "noi_dung") {
        if (!lidHoi) return await traLoiSeller([`Dạ ${cachGoi} chưa có tin nào đang mở với em ạ. ${cachGoi.charAt(0).toUpperCase() + cachGoi.slice(1)} nhắn em thông tin căn nhà là em soạn tin liền ạ.`], { hoi_ve_tin: loaiHoiTin });
        const xem = await guiBanNhap(lidHoi, { hoi_ve_tin: loaiHoiTin, chi_xem: true });
        if (!Array.isArray(xem)) return xem;
        const treo = hoiLaiTreoTin();
        return await traLoiSeller([`Dạ tin mình chưa đủ để dựng bản tin, còn thiếu ${xem.slice(0, 3).join(", ") || "vài thông tin"} ạ.`, ...(treo ? [treo] : [])], { hoi_ve_tin: loaiHoiTin, thieu: xem });
      }
      // "Bao lâu bán được" khi chưa có tin nào: vẫn trả lời (không chuyển người phụ trách).
      if (loaiHoiTin === "bao_lau_ban" && !lidHoi) {
        const treo = hoiLaiTreoTin();
        return await traLoiSeller(treo ? [dapBaoLauBan(cachGoi), treo] : [dapBaoLauBan(cachGoi)], { hoi_ve_tin: loaiHoiTin });
      }
      if (loaiHoiTin && lidHoi) {
        const [{ data: tinHoi, error: thErr }, { count: soQuanTam }, { count: soHoi }] = await Promise.all([
          client.from("listings").select("code, status, price_raw, price_vnd, area_m2, location_raw, ward, district, floor, direction, legal_status, bedrooms, property_type, chu_duyet_at").eq("id", lidHoi).maybeSingle(),
          client.from("interests").select("listing_id", { count: "exact", head: true }).eq("listing_id", lidHoi),
          client.from("info_requests").select("id", { count: "exact", head: true }).eq("listing_id", lidHoi).eq("source", "buyer_ask"),
        ]);
        if (thErr) await ghiLoi(client, "chat-reply hoi ve tin", thErr.message);
        if (tinHoi) {
          // Tin chưa lên kệ: hỏi trạng thái / nơi đăng / bao lâu bán thì nói luôn còn thiếu gì (cùng nguồn với lời "chỉ cần thêm…" khi
          // chủ bảo đăng: `diem_tin` + giá chưa đọc ra số).
          let conThieu: ConThieu | null = null;
          if (tinHoi.status === "cho_thong_tin" && ["trang_thai", "noi_dang", "bao_lau_ban"].includes(loaiHoiTin)) {
            const { data: dt, error: dtErr } = await client.rpc("diem_tin", { p_listing_id: lidHoi });
            if (dtErr) await ghiLoi(client, "chat-reply hoi ve tin(diem_tin)", dtErr.message);
            const d = (dt ?? null) as DiemTin | null;
            if (d) {
              const caGi = /^dat/.test(String(tinHoi.property_type ?? "")) ? "cả lô" : "cả căn";
              const thieu = tinHoi.price_vnd == null
                ? [`giá ${caGi} bằng con số`, ...(d.thieu ?? []).filter((t) => !/^giá/i.test(t))]
                : d.diem < 70 ? (d.thieu ?? []) : [];
              // SRS-5.1zzzzzc: "duyệt bản nháp em gửi" chỉ đúng khi bản nháp ĐÃ gửi (câu duyệt đang treo / lịch sử có 📋).
              const nhapDaGui = pendingReq?.question === "duyet_tin" || lichSuRows.some((m) => !laTinNguoi(m.sender) && /📋/.test(m.body ?? ""));
              conThieu = { thieu, daDuyet: !!tinHoi.chu_duyet_at, nhapDaGui };
            }
          }
          const dap = dapHoiVeTin(loaiHoiTin, tinHoi as TinTom, { quan_tam: soQuanTam ?? 0, hoi: soHoi ?? 0 }, cachGoi, conThieu);
          // SRS-5.1zzzzzzr (Zalo thật 14/10 10:08: "hồi nãy anh nói giá bao nhiêu ok đăng đi" lúc chờ duyệt → tin lên kệ, câu hỏi giá không ai
          // trả lời): gật bản nháp KÈM câu hỏi về tin thì không nuốt bên nào — câu trả lời đi cùng lượt đăng (`dapKemDuyet`), không dừng ở đây.
          // Hỏi trạng thái / nội dung tin thì lượt đăng chính là câu trả lời, không cần bong bóng riêng.
          if (pendingReq?.question === "duyet_tin" && !["trang_thai", "noi_dung"].includes(loaiHoiTin) && (await dongYAi())?.la === "dong_y") {
            dapHoiKemDuyet = dap;
            console.log("chat-reply: hoi ve tin kem gat duyet — tra loi cung luot dang", loaiHoiTin);
          } else {
            const hoiLaiTreo = hoiLaiTreoTin();
            return await traLoiSeller(hoiLaiTreo ? [dap, hoiLaiTreo] : [dap], { hoi_ve_tin: loaiHoiTin, ...(conThieu?.thieu ? { thieu: conThieu.thieu } : {}) });
          }
        }
      }
    }

    /** Câu hỏi treo nhắc lại sau một bong bóng tiền định (không nhắc câu duyệt/điểm/ảnh; duyệt thì nhắc "ok"). */
    const nhacCauTreo = (): string | null => pendingReq?.question === "duyet_tin"
      ? `Bản nháp ở trên ${cachGoi} thấy được thì nhắn "ok" là em đăng liền ạ.`
      : pendingReq && !["danh_gia", "hinh_anh"].includes(pendingReq.question)
      ? cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal)
      : null;
    // ─── 22/09/2026 (kịch bản C, bắn thật): "em xoá cái hẻm 4m ghi nhầm đi" — chủ nhà xin BỎ một thứ đã
    // ghi. Bản trước đọc thành ĐỊA CHỈ (street = nguyên câu, tin lên web như thế) và "hẻm 4m" trong câu đè
    // lại hẻm 3.5m vừa sửa. Đây là lời nói với bot, không phải dữ liệu: không ghi gì, đọc lại ô đang giữ và
    // xin giá trị đúng. SRS-5.1zzzzzzq: chỉ còn đúng cho ô LÕI (giá, diện tích, địa chỉ, phường, số tầng); ô không bắt buộc
    // (`O_XOA_DUOC`: hướng, hẻm, phòng ngủ, pháp lý) thì bỏ thật (`boOTin`) — "bỏ cái hướng Đông Nam ra" mà tin vẫn đăng hướng là sai.
    {
      const xinBo = ycLuot !== undefined
        ? (ycLuot?.loai === "xin_bo_o" ? { truong: ycLuot.o, nhan: O_XIN_BO.find(([k]) => k === ycLuot.o)?.[2] ?? null } : null)
        : laXinBoTruong(text); // lưới đỡ
      const lidBo = xinBo ? (pendingReq?.listing_id ?? sellerRow.active_listing_id ?? null) : null;
      // SRS-5.1zzzzy (khách mô phỏng 11/10: "xoá mấy dòng về con chị ở Úc với sẽ tăng giá đi" → "chỗ nào ghi nhầm" hai lần): bỏ ý ở dòng
      // "Thêm" — ghi chú tự do, bỏ không mất dữ liệu căn. AI chỉ ra cụm (`bo_y`), `boYGhiChu` chỉ bỏ mảnh có thật; rồi gửi lại bản nháp
      // nếu đang chờ duyệt. Không mảnh nào khớp → rơi về câu hỏi lại như cũ.
      if (xinBo?.truong === "bo_sung" && lidBo && ycLuot?.boY?.length) {
        const { data: gc, error: gcErr } = await client.from("listing_facts").select("id, answer").eq("listing_id", lidBo).eq("question", "bo_sung").limit(60);
        if (gcErr) await ghiLoi(client, "chat-reply bo y ghi chu(doc)", gcErr.message);
        const { doi, daBo } = boYGhiChu((gc ?? []) as Array<{ id: string; answer: string | null }>, ycLuot.boY);
        if (daBo.length) {
          for (const d of doi) {
            const { error: dErr } = d.answer
              ? await client.from("listing_facts").update({ answer: d.answer }).eq("id", d.id)
              : await client.from("listing_facts").delete().eq("id", d.id);
            if (dErr) await ghiLoi(client, "chat-reply bo y ghi chu(ghi)", dErr.message);
          }
          console.log("chat-reply: bo y ghi chu", daBo.join(" | "));
          const { data: btBo } = await client.from("listings").select("boc_tach").eq("id", lidBo).maybeSingle();
          const yDaBoCu = ((btBo?.boc_tach as { y_da_bo?: unknown } | null)?.y_da_bo as string[] | undefined) ?? [];
          const { error: ybErr } = await client.rpc("ghi_boc_tach", { p_listing_id: lidBo, p: { y_da_bo: [...yDaBoCu, ...daBo].slice(-30) } });
          if (ybErr) await ghiLoi(client, "chat-reply bo y ghi chu(dau)", ybErr.message);
          if (pendingReq?.question === "duyet_tin") {
            const nhapCu = [...lichSuRows].reverse().find((m) => !laTinNguoi(m.sender) && (m.body ?? "").includes("📋"))?.body ?? null;
            const lai = await guiBanNhap(lidBo, { reask: "duyet_tin", sua_nhap: true, nhap_cu: nhapCu, bo_y: daBo }, true);
            if (!Array.isArray(lai)) return lai;
          }
          return await traLoiSeller([`Dạ em bỏ ${daBo.length > 1 ? "mấy ý đó" : `ý "${daBo[0]}"`} khỏi tin rồi ạ.`, ...(nhacCauTreo() ? [nhacCauTreo()!] : [])],
            { xin_bo_truong: "bo_sung", bo_y: daBo });
        }
      }
      if (xinBo && lidBo) {
        const { data: tinBo, error: tbErr } = await client.from("listings")
          .select("alley_width_m, price_raw, ward, district, area_m2, bedrooms, floors_text, legal_status, direction, location_raw")
          .eq("id", lidBo).maybeSingle();
        if (tbErr) await ghiLoi(client, "chat-reply xin bo truong", tbErr.message);
        const hienTai: Record<string, string | null> = {
          do_rong_hem: tinBo?.alley_width_m != null ? `hẻm ${tinBo.alley_width_m}m` : null,
          gia: tinBo?.price_raw ? `giá ${donViGiaDep(tinBo.price_raw)}` : null,
          phuong: tinBo?.ward ?? null,
          quan: tinBo?.district ?? null,
          dien_tich: tinBo?.area_m2 != null ? `diện tích ${tinBo.area_m2}m²` : null,
          so_phong_ngu: tinBo?.bedrooms != null ? `${tinBo.bedrooms} phòng ngủ` : null,
          ket_cau: tinBo?.floors_text ?? null,
          phap_ly: tinBo?.legal_status ? (LEGAL_VI[tinBo.legal_status] ?? tinBo.legal_status) : null,
          huong: tinBo?.direction ? `hướng ${tinBo.direction}` : null,
          vi_tri: tinBo?.location_raw ?? null,
        };
        const ht = xinBo.truong ? hienTai[xinBo.truong] : null;
        // SRS-5.1zzzzzzq: ô không bắt buộc đang có giá trị → bỏ thật, báo đã bỏ; đang chờ duyệt thì gửi lại bản nháp không còn ô đó.
        if (xinBo.truong && O_XOA_DUOC[xinBo.truong] && ht && !nhacGiaTriKhac(xinBo.truong, text, ht)) {
          const { daBo, error: boErr } = await boOTin(client, lidBo, xinBo.truong, ht);
          if (boErr) await ghiLoi(client, "chat-reply bo o tin", boErr.message);
          if (daBo) {
            console.log("chat-reply: bo o tin", xinBo.truong, daBo);
            const cauBo = `Dạ em bỏ ${daBo} khỏi tin rồi ạ.`;
            if (pendingReq?.question === "duyet_tin") {
              const nhapCu = [...lichSuRows].reverse().find((m) => !laTinNguoi(m.sender) && (m.body ?? "").includes("📋"))?.body ?? null;
              const lai = await guiBanNhap(lidBo, { reask: "duyet_tin", sua_nhap: true, nhap_cu: nhapCu, xin_bo_truong: xinBo.truong, o_da_bo: daBo }, true, [cauBo]);
              if (!Array.isArray(lai)) return lai;
            }
            return await traLoiSeller([cauBo, ...(nhacCauTreo() ? [nhacCauTreo()!] : [])],
              { xin_bo_truong: xinBo.truong, o_da_bo: daBo, ...(pendingReq ? { reask: pendingReq.question } : {}) });
          }
        }
        const dap = !xinBo.truong
          ? `Dạ chỗ nào ghi nhầm ${cachGoi} nhắn lại giúp em nha, em sửa liền ạ.`
          : ht
          ? `Dạ tin mình đang ghi ${ht} ạ, ${cachGoi} nhắn ${xinBo.nhan} đúng là em sửa lại liền.`
          : `Dạ tin mình chưa ghi ${xinBo.nhan} nào ạ, ${cachGoi} cứ nhắn ${xinBo.nhan} đúng là em ghi.`;
        const duoi = pendingReq?.question === "duyet_tin"
          ? `Bản nháp ở trên ${cachGoi} thấy được thì nhắn "ok" là em đăng liền ạ.`
          : pendingReq && !["danh_gia", "hinh_anh"].includes(pendingReq.question)
          ? cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal)
          : null;
        return await traLoiSeller(duoi ? [dap, duoi] : [dap], { xin_bo_truong: xinBo.truong ?? "?", ...(pendingReq ? { reask: pendingReq.question } : {}) });
      }
    }

    // ─── 22/09/2026 (kịch bản E): môi giới "khách nào hỏi thì cho tui số của họ" — bot từng gật "Dạ em hiểu anh
    // chị tự liên hệ khách rồi". Người mua bên này KHÔNG để lại số (bất biến DH); nói thật một lần, không ghi gì.
    if (ycLuot !== undefined ? ycLuot?.loai === "xin_so_khach" : laXinSoKhach(text) && !nhanDienFact(text) /* lưới đỡ */) {
      const dap = `Dạ khách mua bên em không để lại số ạ, mọi trao đổi đi qua em và anh Thu phụ trách. Có khách quan tâm em báo ${cachGoi} liền và sắp lịch xem nhà cho mình.`;
      const duoi = nhacCauTreo();
      return await traLoiSeller(duoi ? [dap, duoi] : [dap], { xin_so_khach: true, ...(pendingReq ? { reask: pendingReq.question } : {}) });
    }

    // ─── 22/09/2026 (kịch bản E): "xoá căn 1 khỏi hệ thống của tui" khi KHÔNG có câu treo → từng rơi vào model
    // ("Dạ em ghi nhận rồi ạ"). Bot không tự xoá dữ liệu: nói thật, nhờ người phụ trách (cùng câu với đường duyệt).
    if (ycLuot !== undefined
      ? ycLuot?.loai === "xin_xoa_du_lieu"
      : laXinXoaDuLieu(text) && !nhanDienFact(text) && !laRaoLai(text) && !(pendingReq?.question === "danh_gia" && laDiemCham(text)) /* lưới đỡ */) {
      const dap = `Dạ việc xoá dữ liệu em không tự làm được, để em nhờ anh Thu phụ trách xử lý giúp ${cachGoi} ạ.`;
      const duoi = nhacCauTreo();
      return await traLoiSeller(duoi ? [dap, duoi] : [dap], { xin_xoa_du_lieu: true, ...(pendingReq ? { reask: pendingReq.question } : {}) });
    }

    // ─── 22/09/2026 (kịch bản E): "mở lại căn 2", "rao lại căn chung cư đi, căn đó chưa bán" — bot hứa "nhắn em
    // một tiếng là em mở lại liền" mà chưa có luật nào nhận (câu này từng bị nuốt làm điểm chấm). Tin đã gỡ
    // (da_chot/an) của người này: một căn thì mở luôn, nhiều căn thì chọn theo số thứ tự / loại / địa chỉ, không
    // rõ thì hỏi. Đã duyệt trước đó → lên kệ lại (dang_ban); chưa → cho_thong_tin.
    // 29/09/2026 (kịch bản K7): "à không, chưa bán, vẫn bán nha" ngay sau lượt bot gỡ tin → rút lại lời báo bán, mở lại tin.
    const botVuaGoTin = /gỡ tin khỏi kệ|đã ngưng rao căn/.test(lichSuRows.filter((m) => !laTinNguoi(m.sender)).slice(-3).map((m) => m.body ?? "").join(" "));
    const ydRaoLai = await yDinhAi();
    // 05/10/2026 (chat thử "nhà bình thường", SRS-5.1zzc): đang DUYỆT BẢN NHÁP mà chủ nhà "ừ còn bán, em cứ đăng đi" → luật
    // `laRaoLai` ("còn bán" + "đăng") đọc thành RAO LẠI, bot đáp "không thấy tin nào đang gỡ" thay vì duyệt. Lời bảo đăng khi đang
    // duyệt là GẬT (khối duyệt lo), không phải mở lại tin đã gỡ. AI chạy thì `y_dinh` đã quyết.
    const baoDangKhiDuyet = pendingReq?.question === "duyet_tin" && await baoDangLuot(() => laBaoDang(text));
    if (ydRaoLai !== undefined ? ydRaoLai?.loai === "rao_lai" : (!baoDangKhiDuyet && (laRaoLai(text) || (botVuaGoTin && laRutLoiBan(text))) && !laNgungRao(text))) {
      type CanGo = { id: string; code: string | null; location_raw: string | null; ward: string | null; district: string | null; property_type: string | null; chu_duyet_at: string | null };
      const { data: daGo, error: dgoErr } = await client.from("listings").select("id, code, location_raw, ward, district, property_type, chu_duyet_at")
        .eq("seller_id", sellerRow.id).in("status", ["da_chot", "an"]).order("created_at", { ascending: true }).limit(10);
      if (dgoErr) await ghiLoi(client, "chat-reply rao lai(doc tin)", dgoErr.message);
      const cans = (daGo ?? []) as CanGo[];
      const tenCan = tenCanDocLen;
      if (!cans.length) {
        return await traLoiSeller([`Dạ em không thấy tin nào của ${cachGoi} đang gỡ để mở lại ạ. ${cachGoi.charAt(0).toUpperCase() + cachGoi.slice(1)} muốn rao căn nào thì nhắn em địa chỉ, giá và diện tích nha.`], { rao_lai: null });
      }
      const chon = cans.length === 1 ? cans[0] : chonCanTheoCau(text, cans);
      if (!chon) {
        const dsC = cans.map((c, i) => `${i + 1}. ${tenCan(c)}`).join("\n");
        return await traLoiSeller([`Dạ ${cachGoi} muốn mở lại căn nào ạ?\n${dsC}\nNhắn số thứ tự hoặc địa chỉ giúp em.`], { rao_lai: null, hoi_can: cans.length });
      }
      const trangThaiMoi = chon.chu_duyet_at ? "dang_ban" : "cho_thong_tin";
      const [{ error: rlErr }] = await Promise.all([
        client.from("listings").update({ status: trangThaiMoi }).eq("id", chon.id),
        client.rpc("ghi_boc_tach", { p_listing_id: chon.id, p: { ket_thuc: "mo_lai", mo_lai_luc: new Date().toISOString(), mo_lai_loi: text.slice(0, 200) } }),
        client.from("sellers").update({ active_listing_id: chon.id }).eq("id", sellerRow.id),
      ]);
      if (rlErr) await ghiLoi(client, "chat-reply rao lai", rlErr.message);
      const cau = trangThaiMoi === "dang_ban"
        ? `Dạ em mở lại tin căn ${tenCan(chon)} rồi ạ, tin lên kệ lại như cũ. Có gì đổi (giá, tình trạng) ${cachGoi} nhắn em nha.`
        : `Dạ em mở lại tin căn ${tenCan(chon)} rồi ạ. Tin còn thiếu vài thông tin, em hỏi tiếp rồi gửi bản nháp ${cachGoi} duyệt nha.`;
      return await traLoiSeller([cau], { rao_lai: chon.code ?? chon.id, listing_status: trangThaiMoi });
    }

    // ─── 22/09/2026 (kịch bản D): chủ nhà GỬI SĐT kèm lời dặn ("đừng đăng số của cô lên mạng") — bot từng im, gửi
    // bản nháp như không có gì; số không vào hồ sơ. Nay: số vào `sellers.phone` (chỉ admin đọc — RLS), nói rõ
    // không đăng số lên web, không ghi câu này vào tin. Câu có kèm dữ liệu căn thì chỉ lưu số + một dòng báo,
    // phần dữ liệu đi tiếp đường thường.
    {
      const mSdt = new RegExp(SDT_NGUON).exec(text);
      if (mSdt) {
        const sdt = mSdt[0].replace(/[\s.\-]/g, "").replace(/^\+?84/, "0");
        let daLuu = false;
        const { error: sdtErr } = await client.from("sellers").update({ phone: sdt }).eq("id", sellerRow.id).is("phone", null);
        // 23505: số đã thuộc hồ sơ khác — không ghi đè, không đưa số vào sổ lỗi (log_loi che, nhưng đừng thử).
        if (sdtErr && sdtErr.code !== "23505") await ghiLoi(client, "chat-reply sellers.phone", sdtErr.code ?? "update");
        else if (!sdtErr) daLuu = true;
        const conLai = text.replace(mSdt[0], " ").replace(/\s+/g, " ").trim();
        const dap = `${daLuu ? "Dạ em lưu số " + cachGoi + " rồi ạ, em" : "Dạ em"} không đăng số lên web đâu ạ. Khách quan tâm em nhắn ${cachGoi} rồi anh Thu bên em liên hệ mình.`;
        if (!nhanDienNhieuFact(conLai).length && !nhanDienFact(conLai)) {
          const duoi = nhacCauTreo();
          return await traLoiSeller(duoi ? [dap, duoi] : [dap], { sdt_luu: daLuu, ...(pendingReq ? { reask: pendingReq.question } : {}) });
        }
        if (!thongBaoNhan) thongBaoNhan = dap;
      }
    }

    // ─── 10/09 (chân dung đại diện CĐT / môi giới rao theo lô): MỘT tin liệt kê
    // NHIỀU CĂN "căn A5 8x20 giá 18 tỷ, căn A7 …, căn B2 góc 10x20 giá 22 tỷ" → mỗi
    // căn một tin riêng (mã căn, ngang×dài, giá), kế thừa dự án/quận/phường/loại
    // của căn đang nói. Trước đây câu này bị FR-164 hiểu là "sửa giá" của tin cũ.
    // ─── 16/09/2026 (Zalo thật): chủ nhà ĐÃ có tin đang rao nhắn "Chào cháu chú có căn nhà
    // này cần giao bán" — câu rao KHÔNG chi tiết. Bản trước coi nó là câu trả lời cho câu
    // đang hỏi của tin cũ (ghi "Chào cháu…" vào bổ sung), rồi mọi dữ kiện sau đó gộp vào
    // tin cũ — hai căn thành một. Nay hỏi thẳng: căn đó hay căn khác? Câu hỏi mang DẤU
    // (`DAU_CAN_CU_MOI`) để lượt sau đọc lịch sử biết mình đang hỏi gì, không cần cột mới.
    const botCuoi = [...lichSuRows].reverse().find((m) => !laTinNguoi(m.sender))?.body ?? "";
    const dangHoiCanCuMoi = /là căn đó hay căn khác/i.test(botCuoi);
    const dangXinCanMoi = /(?:địa chỉ|diện tích|giá) (?:của |cho )?căn (?:khác|mới)/i.test(botCuoi);
    // 14/10/2026 (test tay: "em rao thêm cho chị tiện ích trong khu chung cư này chứ" → bot hỏi "căn đó hay căn khác"): căn ĐÓ hay căn
    // KHÁC là câu hỏi về NGHĨA — chế độ `ai` lấy `can_khac` của AI (đọc cả câu, có khối căn đang có); từ khoá chỉ đỡ khi AI không nói.
    const canKhacAi = await canKhacLuot(); // undefined khi AI không chạy (canKhacLuot tự kiểm laCheDoAi)
    const laCanKhac = canKhacAi !== undefined ? canKhacAi
      : /căn khác|căn mới|nhà khác|cái khác|khác ạ|khác em|khác cháu|^\s*khác\b|căn nữa|căn thứ/i.test(text) ||
        /\bcan khac|can moi|nha khac|^\s*khac\b/.test(tKD);
    const laCanDo = canKhacAi !== undefined ? dangHoiCanCuMoi && !canKhacAi
      : /căn đó|căn cũ|cùng căn|vẫn căn|căn này|căn đang rao|đúng rồi|đúng căn|là nó|vẫn là|căn hồi/i.test(text) ||
        /\bcan do|can cu|cung can|van can|dung roi|dung can\b/.test(tKD);
    // Xác nhận "căn khác" (hoặc đang được xin chi tiết căn mới và câu này có chi tiết) → mở tin mới.
    const raoCanMoiXacNhan = (dangHoiCanCuMoi && laCanKhac && !laCanDo) || (dangXinCanMoi && coChiTiet);
    // Bắn thật sau deploy #145: "ngang 5m còn dọc 16m cần bán gấp" (trả lời câu diện tích) bị
    // coi là rao suông vì có "cần bán". Suông = có ý rao + có chữ loại BĐS, KHÔNG số, không fact
    // nào ngoài gấp ("chú có căn nhà cần bán gấp" vẫn là suông; "cần bán gấp" trần thì không).
    // `coLoaiBDS` bỏ dấu nhận "cần" (can) như "căn" — ở đây đòi chữ loại RÕ: "căn"/"lô" chỉ khi còn dấu.
    const coLoaiRo = khop(
      /(nhà|căn hộ|chung cư|đất|mặt bằng|phòng trọ|biệt thự|căn\b|kho|xưởng|to[àa] nhà|khách sạn|villa|shophouse|lô\b)/i,
      /(nha|can ho|chung cu|dat|mat bang|phong tro|biet thu|\bkho\b|xuong|toa nha|khach san|villa|shophouse)/,
    );
    // Zalo thật 16/09 13:36: "cô có căn nhà này Ở QUẬN 5 cần giao bán gấp" — số của quận/phường
    // không phải chi tiết căn; câu này từng đổi QUẬN của tin cũ (capNhatQuan) thay vì hỏi căn nào.
    const textKhongSoQuan = text.replace(/(?:quận|quan|phường|phuong|\bq|\bp)\s*\.?\s*\d{1,2}\b/gi, "");
    // 02/10/2026 (bắn thử thu-kb-s04, SRS-5.1zh): "anh đang bận tí nói sau nha" — bỏ dấu thì "đang bận" = "đang bán" (`coYDinhRao`)
    // và "nha" = "nhà" (`coLoaiRo`) → coi là rao căn mới, bot hỏi "căn đó hay căn khác" thay vì hoãn. Chế độ `ai`: ý RAO do AI
    // đọc (đề xuất loại giao dịch / loại BĐS có trích dẫn, hoặc `can_khac`); từ khoá chỉ là lưới đỡ khi AI không chạy.
    const aiRao = await aiDocRaoLuot();
    // SRS-5.1zzv (e2e RN-07e): bot đang hỏi LOẠI nhà, khách đáp "nhà phố" → AI đọc ra loai_bds → từng thành "câu rao suông" và bot
    // hỏi "căn đó hay căn khác". Câu treo là loại mà tin KHÔNG có ý rao (bán / cho thuê / có căn / rao) thì tên loại là CÂU TRẢ
    // LỜI, không phải rao căn mới; "chú có căn nhà cần bán" (CHU-6) vẫn là rao suông như cũ.
    const coChuRao = /\b(?:ban|cho thue|rao|co (?:mot |1 )?can|can ban|muon ban|sang nhuong|nhuong lai)\b/.test(tKD);
    const traLoiLoai = pendingReq?.question === "loai_bds" && !coChuRao;
    // SRS-5.1zzzzzzz7 (Zalo thật 14/10 16:33): bot hỏi tên dự án, khách "Dự án Green river" → AI đọc loại / tên dự án nên `aiRao` = có,
    // tin không số → "rao suông" → bot hỏi "căn đó hay căn khác", không ghi tên dự án. Lớp lỗi: câu TRẢ LỜI câu treo bị đọc là RAO CĂN MỚI
    // vì cổng chỉ miễn cho câu loại BĐS. Nay AI đọc ra ô của chính câu treo (hoặc nói có trả lời) và tin không có chữ rao → không phải rao.
    const traLoiTreoAi = !!pendingReq && !coChuRao && laCheDoAi && !!bongAi && await bongAi.then((k) =>
      !!k?.ket && (!!k.traLoi?.co_tra_loi || k.truong.some((t) => khoaTraLoiCau(t.khoa, pendingReq.question)))).catch(() => false);
    // AI nói rõ tin này KHÔNG phải căn khác (nói thêm về căn đang có) → không phải rao suông, dù tin có chữ loại BĐS.
    const raoSuong = !traLoiLoai && !traLoiTreoAi && canKhacAi !== false && (aiRao !== undefined ? aiRao : coYDinhRao && coLoaiRo /* lưới đỡ */) && !coChiTiet && !/\d/.test(textKhongSoQuan) && !laCauHoiTinhTrang && !raoCanMoiXacNhan &&
      nhanDienNhieuFact(text).every((f) => f.question === "gap" || f.question === "phuong");
    if (!sellerMoi && (raoSuong || (dangHoiCanCuMoi && (laCanDo || laCanKhac)))) {
      type CanRao = { id: string; code: string | null; location_raw: string | null; ward: string | null; district: string | null; property_type: string | null; price_raw: string | null; area_m2?: number | null; boc_tach?: unknown };
      const { data: dangRao, error: drErr } = await client.from("listings").select("id, code, location_raw, ward, district, property_type, price_raw, area_m2, boc_tach")
        .eq("seller_id", sellerRow.id).in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"])
        .order("created_at", { ascending: false }).limit(5);
      if (drErr) await ghiLoi(client, "chat-reply listings(can cu hay moi)", drErr.message);
      // 07/10/2026 (chủ dự án chat thử: "a bán nhà" → tin mới chưa có gì; "đúng rồi e. a bán nhà quận 5" → bot hỏi "trước đó anh có
      // căn mã BDS-Q5-0006, căn đó hay căn khác?"): tin "cũ" là cái vỏ rỗng vừa mở từ chính câu rao suông trước — không địa chỉ,
      // giá, diện tích, phường, quận (quận mặc định không tính) — thì không có gì để nhầm hai căn: câu này là nói tiếp căn đó, đi
      // đường câu treo bình thường (ghi quận, hỏi tiếp). Còn một tin có chi tiết thì vẫn hỏi như 16/09.
      const voRong = (c: CanRao) => !c.location_raw && !c.price_raw && !c.ward && c.area_m2 == null &&
        (!c.district || (c.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh === true);
      const cans = ((dangRao ?? []) as CanRao[]).filter((c) => !(raoSuong && !dangHoiCanCuMoi && voRong(c)));
      const tenCan = (c: CanRao) => [c.location_raw, c.ward, c.district].some(Boolean) || !c.code ? tenCanDocLen(c) : `mã ${c.code}`;
      // "căn Căn số 14 ở…" (bắn thật mau-chu-q8): địa chỉ đã mở đầu bằng "căn" thì không thêm chữ "căn".
      const canTen = (c: CanRao) => { const t = tenCan(c); return /^căn\b/i.test(t) ? t : `căn ${t}`; };
      if (cans.length) {
        if (dangHoiCanCuMoi && laCanDo && !laCanKhac) {
          // Cùng căn → tiếp tục câu đang treo của căn đó (không ghi gì từ câu này).
          const cauKe = pendingReq
            ? cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal)
            : `Có gì thêm về căn này ${cachGoi} cứ nhắn em nha.`;
          return await traLoiSeller([`Dạ, vậy em tiếp tục với ${canTen(cans[0])} nha. ${cauKe}`], { can_cu_hay_moi: "can_cu" });
        }
        if (dangHoiCanCuMoi && laCanKhac) {
          // Căn khác nhưng chưa có chi tiết → xin chi tiết; câu này mang dấu `dangXinCanMoi`.
          return await traLoiSeller(
            [`Dạ, ${cachGoi} cho em xin địa chỉ, diện tích và giá của căn khác nha, em mở tin riêng cho căn đó.`],
            { can_cu_hay_moi: "can_khac" },
          );
        }
        // Câu rao suông (lần đầu, hoặc lặp lại mà chưa trả lời căn đó/căn khác) → hỏi.
        if (raoSuong && !(dangHoiCanCuMoi && (laCanDo || laCanKhac))) {
          const ds = cans.length === 1
            ? `trước đó ${cachGoi} có ${canTen(cans[0])}${cans[0].price_raw ? ` giá ${donViGiaDep(cans[0].price_raw)}` : ""}`
            : `trước đó ${cachGoi} đang có ${cans.length} tin bên em: ${cans.map(tenCan).join(" · ")}`;
          return await traLoiSeller(
            [`Dạ ${cachGoi}, ${ds}. Căn ${cachGoi} vừa nhắc là căn đó hay căn khác ạ? Căn khác thì ${cachGoi} cho em xin địa chỉ, diện tích và giá nha.`],
            { can_cu_hay_moi: "hoi" },
          );
        }
      }
    }
    let nhieuCanTrongTin = nhanDienNhieuCan(text);
    // 06/10/2026 (bắn thử thu-srd-b1, SRS-5.1zzo): cổng "tin có nhiều căn" từng do regex quyết — "căn 1 …, 4x12, 6.9 tỷ; căn 2 …"
    // cắt theo dấu phẩy nên không thấy căn nào, trong khi AI đã trả `so_can = 2` và đánh số `can`. Chế độ `ai`: AI đọc ra ≥ 2 căn
    // có đánh số → chia theo AI (`canTheoAi`); regex chỉ đỡ khi AI không chạy / không đánh số.
    // 14/10/2026 (SRS-5.1zzzzzzz17): chiều ngược cũng vậy — AI đọc tin và nói rõ MỘT căn (`so_can` ≤ 1) thì regex đếm "căn A…, căn B…"
    // không được chia tin; "có mấy căn" là ý theo NGHĨA.
    const kCan = laCheDoAi && bongAi ? await bongAi : null;
    const datCanAi = kCan?.ket ? kiemDeXuat(kCan.truong, textBongAi).dat : null;
    if (kCan?.ket && datCanAi) {
      const soCanAi = (kCan.ket as { so_can?: number }).so_can ?? null;
      const tuAi = canTheoAi(textBongAi, datCanAi, soCanAi);
      if (tuAi.length >= 2) { console.log(`chat-reply: AI đọc ${tuAi.length} căn, regex ${nhieuCanTrongTin.length} — chia theo AI`); nhieuCanTrongTin = tuAi; }
      else if (typeof soCanAi === "number" && soCanAi <= 1 && nhieuCanTrongTin.length >= 2) {
        console.log(`chat-reply: regex đếm ${nhieuCanTrongTin.length} căn, AI đọc ${soCanAi} — không chia`);
        nhieuCanTrongTin = [];
      }
    }
    // ─── 15/09/2026 (bắn thật N2): người rao nhiều căn nói FACT theo số thứ tự — "căn 2 sổ
    // hồng riêng, có thương lượng. căn 1 đúc 3 tấm". Trước đây câu này mở thêm 2 tin RỖNG.
    // Nay: mỗi mảnh "căn N …" ghi fact vào căn thứ N (theo thứ tự mở); mảnh nào trả lời
    // đúng câu đang treo của căn đó thì đóng câu và hỏi câu kế; còn lại nhắc lại câu treo.
    // (Không chặn theo `wantsSell`: "căn 2 đang cho thuê 80 triệu/tháng" có chữ "cho thuê" + tiền
    // nên cổng rao khớp, nhưng đây vẫn là fact cho căn đã mở — bắn thật C2 15/09.)
    const nhomCan = nhieuCanTrongTin.length < 2 ? tachTheoCan(text) : [];
    if (nhomCan.length) {
      const { data: dsCan } = await client.from("listings").select("id, code, property_type, district, deal")
        .eq("seller_id", sellerRow.id).in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"])
        .order("created_at", { ascending: true }).limit(20);
      const cans = (dsCan ?? []) as Array<{ id: string; code: string | null; property_type: string | null; district: string | null; deal: string | null }>;
      if (cans.length >= 2) {
        const daGhi: string[] = [];
        const daDong = new Set<string>();
        for (const g of nhomCan) {
          const l = cans[g.thu - 1];
          if (!l) continue;
          await ganNhanChoTin({}, { lid: l.id, text: g.manh });
          nhanTheoCanDaGan = true;
          // SRS-5.1zzzzzzz17: AI đã đọc tin → fact của "căn N" là các ô AI đánh số `can = N` (qua kiểm trích dẫn); luật tìm-chuỗi trên
          // mảnh chỉ đỡ khi AI không chạy.
          // AI không đánh số căn nào (`can` trống hết) thì chưa có cách gán ô cho từng căn — luật đỡ như cũ.
          const factAiCan = datCanAi?.some((d) => d.can != null)
            ? docAiChinh(datCanAi.filter((d) => d.can === g.thu).map((d) => ({ ...d, can: null })), null).ghi.map((f) => ({ question: f.question, answer: f.answer }))
            : null;
          const nhieu = factAiCan ?? nhanDienNhieuFact(g.manh);
          const mot = nhieu.length || factAiCan ? null : nhanDienFact(g.manh);
          for (const f of nhieu.length ? nhieu : mot ? [mot] : []) {
            const { error: fcErr } = await ghiFact(client, { p_listing_id: l.id, p_question: f.question, p_answer: f.answer, p_source: "seller_chat" });
            if (fcErr) { await ghiLoi(client, "chat-reply ghi_fact_listing(theo can)", fcErr.message); continue; }
            // SRS-5.1zzzzn: cùng kiểu dòng với 🤖 chung — nguyên mẫu tìm trong mảnh "căn N …" của chính căn đó.
            daGhi.push(dongFact({ question: f.question, answer: f.answer }, FACT_LABELS, { tin: g.manh }, `căn ${g.nhan ?? g.thu} `));
            // Mọi câu treo của CĂN ĐÓ cùng họ với fact vừa ghi thì đóng (không chỉ câu đang chọn).
            for (const q of ds) {
              if (q.listing_id === l.id && !daDong.has(q.id) && cungHoFact(f.question, q.question)) {
                await client.from("info_requests").update({ status: "answered", answer: g.manh, answered_at: new Date().toISOString() }).eq("id", q.id);
                daDong.add(q.id);
              }
            }
          }
        }
        if (daGhi.length) {
          let cauKe = "";
          // Câu treo còn lại: ưu tiên căn đang nói (pendingReq), rồi tới căn khác.
          const conTreo = ds.filter((q) => !daDong.has(q.id));
          const keTreo = (pendingReq && !daDong.has(pendingReq.id) ? pendingReq : null) ?? conTreo[0] ?? null;
          if (keTreo) {
            cauKe = cauHoiMau(keTreo.question, cachGoi, keTreo.listings?.property_type, keTreo.listings?.district, keTreo.listings?.deal);
          } else {
            const canKe = pendingReq?.listing_id ?? cans[0].id;
            const { data: thieu } = await client.from("listing_missing_facts").select("fact_key, priority, nhom")
              .eq("listing_id", canKe).order("priority").limit(40);
            const ke = chonCauKe([...(pendingReq ? [pendingReq.question] : [])], (await thieuCoReNhanh(client, canKe, (thieu ?? []) as Array<{ fact_key: string; priority: number; nhom: string | null }>, pendingReq ? [pendingReq.question] : [], text)).filter((f) => f.nhom !== "sau_dang"));
            if (ke) {
              const { error: irErr } = await moCauTreo({ listing_id: canKe, question: ke, status: "pending" });
              if (irErr && irErr.code !== "23505") await ghiLoi(client, "chat-reply mo cau ke(theo can)", irErr.message);
              const lKe = cans.find((c) => c.id === canKe);
              cauKe = cauHoiMau(ke, cachGoi, lKe?.property_type, lKe?.district, lKe?.deal);
            }
          }
          // 💾 chung chỉ đọc MỘT tin (căn đang chăm) nên in pháp lý của căn 1 dưới tin căn 2 — bong bóng
          // tiền định ở đây đã nói rõ từng căn, tắt 💾 cho lượt này (20/09/2026).
          // SRS-5.1zzzm: câu hỏi kế là lời của EM với khách — bong bóng riêng, không nằm trong bong bóng 🤖 (báo lại, có thể chỉ cho /admin).
          return await traLoiSeller([bongTrichXuat(daGhi)!, ...(cauKe ? [cauKe] : [])], { fact_theo_can: daGhi.length, dong_cau_treo: daDong.size, bao_lai_tat: true });
        }
      }
    }
    if (nhieuCanTrongTin.length >= 2) {
      const { data: goc } = await client.from("listings")
        .select("id, deal, district, ward, property_type, project_id, location_raw, street")
        .eq("seller_id", sellerRow.id).in("status", ["cho_thong_tin", "dang_ban"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const daMo: string[] = [];
      let dau: { id: string; property_type: string | null } | null = null;
      // 20/09/2026 (bắn thật mau-y-A): "e la moi gioi ben q10, co 2 can…" — quận nói CHUNG cho cả tin
      // phải vào từng căn (trước chỉ lấy `c.quan` của mảnh → hai tin mang mã XX). Kế thừa địa chỉ căn
      // cũ chỉ khi cùng quận. Mảnh "dat 5x20" không dấu là ĐẤT (trigger đoán loại không đọc chữ không dấu).
      // SRS-5.1zu: câu nhắc nhiều quận thì không có "quận của cả câu" để căn thiếu quận mượn.
      const quanCau = cacQuanTrong(text, boDau).length > 1 ? null : bocQuan(tKD, text);
      const DAT_KD_RE = /(?:^|[^a-z])dat(?=\s+(?:\d|nen|tho cu|mat tien|hem|duong|vuon|nong nghiep|trong|thanh|sxkd|kinh doanh|cong nghiep|o\b))/;
      // 23/09/2026 (bắn thật, môi giới): "đang giữ 2 căn hộ The Everrich Infinity q5: căn A …, căn B …" —
      // loại + dự án nói ở ĐẦU CÂU (trước mốc căn đầu tiên) là của CẢ LÔ; căn B không tự nhắc thì kế thừa.
      // Mảnh không thuộc căn nào ("full nội thất, sổ hồng lâu dài") cũng là của cả lô → ghi cho từng căn.
      const viTriDau = nhieuCanTrongTin[0].theoLoai ? text.indexOf(nhieuCanTrongTin[0].goc) : -1;
      const dauTin = viTriDau >= 0 ? text.slice(0, viTriDau)
        : text.split(/(?:căn|can|lô|lo|nhà|nha)\s+(?:số\s+|so\s+|thứ\s+|thu\s+)?(?:\d{1,2}(?!\d)|[A-H](?![\p{L}\d]))/u)[0] ?? "";
      const kdDauTin = boDau(dauTin);
      // 23/09/2026 (bắn thật): "Chú có 2 lô đất ở Củ Chi …, lô 1 500m2 giá 3 tỷ, lô 2 …" — loại nói ở đầu câu là của cả
      // lô; bản trước chỉ đọc chữ "đất" trong mảnh từng lô → hai tin "chưa rõ loại", bot hỏi lại "nhà phố hay đất".
      const loaiDauTin = loaiTuChu(kdDauTin.replace(/\b(?:ban|can ban|muon ban)\b/g, ""));
      // Tách theo LOẠI: mọi chữ sau mốc căn đầu đã thuộc một căn — chỉ phần ĐẦU CÂU là chung (bắn thật 23/09: "2PN"
      // của căn hộ từng ghi sang căn nhà vì mảnh phẩy "với 1 căn hộ … 2PN …" không nằm nguyên trong goc đã gọt).
      const manhChung = (nhieuCanTrongTin[0].theoLoai ? dauTin : text).split(/[,;\n]/).map((x) => x.trim())
        .filter((x) => x.length >= 2 && !nhieuCanTrongTin.some((c) => c.goc.includes(x)));
      const factChung = manhChung.length ? nhanDienNhieuFact(manhChung.join(", ")) : [];
      let duAnLo: DuAnKho | null | undefined;
      // SRS-5.1zp (03/10/2026, bộ đo N06): "nhà 1 ở Tân Bình …, nhà 2 ở Gò Vấp …" — luật tách không đọc được quận viết
      // không có chữ "quận", nên cả hai căn lấy `quanCau` (quận ĐẦU TIÊN của cả câu) → căn 2 mang Tân Bình, trong khi AI đã
      // đọc đúng từng căn. Chế độ `ai`: số liệu từng căn (quận, giá, diện tích, loại, fact) lấy của AI — đề xuất gắn số căn
      // (`can`), hoặc (AI không đánh số) đề xuất có trích dẫn nằm trong mảnh của căn đó; đề xuất không thuộc căn nào là của
      // cả lô. Luật tách chỉ còn chia mảnh để mở đúng số tin; luật đọc số liệu chỉ đỡ khi AI không chạy.
      const datNhieu = await (async () => {
        if (!laCheDoAi || !bongAi) return null;
        const k = await bongAi;
        return k?.ket ? kiemDeXuat(k.truong, textBongAi).dat : null;
      })();
      const coSoCan = !!datNhieu?.some((d) => d.can != null);
      const aiCanThu = (thu: number, goc: string): AiChinh | null => {
        if (!datNhieu) return null;
        const thuoc = (d: DeXuat) => coSoCan ? d.can === thu : !!d.trich_dan && boDau(goc).includes(boDau(d.trich_dan));
        const cua = datNhieu.filter(thuoc);
        const caLo = datNhieu.filter((d) => (coSoCan ? d.can == null : !nhieuCanTrongTin.some((x) => !!d.trich_dan && boDau(x.goc).includes(boDau(d.trich_dan))))
          && !cua.some((x) => x.khoa === d.khoa));
        return docAiChinh([...cua, ...caLo].map((d) => ({ ...d, can: null })), null);
      };
      // SRD §IV.3 (SRS-5.1zzf): hạng Đồng tối đa 5 căn — câu nhiều căn chỉ mở tới trần, phần dư nói thật.
      const trNhieu = await tranHangRao();
      const conSlotRao = trNhieu && trNhieu.tran != null ? Math.max(0, trNhieu.tran - trNhieu.so_dang_rao) : Infinity;
      let chanTranRao = false;
      for (const [iCan, c] of nhieuCanTrongTin.entries()) {
        if (daMo.length >= conSlotRao) { chanTranRao = true; break; }
        const acCan = aiCanThu(c.thu ?? iCan + 1, c.goc);
        if (acCan) {
          c.quan = acCan.quan ?? undefined;
          if (acCan.gia) c.gia = acCan.gia;
          if (acCan.dienTich) c.dt = String(acCan.dienTich);
          if (acCan.ngang && acCan.dai) { c.ngang = String(acCan.ngang); c.dai = String(acCan.dai); }
        }
        // AI chạy mà căn này không có quận (riêng hoặc cả lô) → để trống (hỏi sau), không mượn quận đầu câu của căn khác.
        // SRS-5.1zu: căn thiếu chữ "quận" ("1 lô đất Long An 2 tỷ") đọc quận trong ĐOẠN của chính căn trước, mới mượn quận cả câu.
        const quanDoan = (() => { const ds = cacQuanTrong(c.goc, boDau); return ds.length === 1 ? ds[0] : null; })();
        const quanCan = acCan ? acCan.quan : c.quan ?? quanDoan ?? quanCau ?? null;
        const keThua = !quanCan || quanCan === (goc?.district ?? null);
        // SRS-5.1zzzzzf (khách mô phỏng lần bảy, môi giới: "còn 2 căn nữa, hẻm Nguyễn Trãi …, và hẻm An Dương Vương …" cùng Quận 5 với
        // căn đầu → hai tin mới mang cột street "Trần Hưng Đạo" + phường của căn đầu). Cùng quận không phải cùng địa chỉ: căn có đường
        // riêng (AI đọc ra cho đúng căn đó, hoặc luật thấy địa chỉ trong đoạn của căn) thì không mượn đường / phường / địa chỉ căn cũ.
        const coDiaChiRieng = !!(acCan?.duong || acCan?.tenDuong || bocViTriRao(c.goc));
        const keThuaDiaChi = keThua && !coDiaChiRieng;
        // Không mở trùng mã căn cho cùng người bán.
        if (c.ma) {
          const { data: trung } = await client.from("listings").select("id")
            .eq("seller_id", sellerRow.id).ilike("unit_code", c.ma).in("status", ["cho_thong_tin", "dang_ban"]).limit(1).maybeSingle();
          if (trung) continue;
        }
        const { data: moi, error: moiErr } = await client.from("listings").insert({
          code: null, seller_id: sellerRow.id, deal: goc?.deal ?? "ban",
          // 11/09: căn nói rõ quận riêng ("1 căn q11 …") thì không kế thừa địa chỉ căn cũ.
          district: quanCan ?? goc?.district ?? null, ward: keThuaDiaChi ? tenPhuongCot(goc?.ward, goc?.district) : null,
          location_raw: keThuaDiaChi ? goc?.location_raw ?? null : null, street: keThuaDiaChi ? goc?.street ?? null : (acCan?.tenDuong ?? null),
          description: c.goc, price_raw: c.gia ?? null,
          property_type: acCan?.loaiBds ?? c.loai ?? (DAT_KD_RE.test(boDau(c.goc)) ? "dat" : loaiDauTin ?? goc?.property_type ?? "chua_ro"), status: "cho_thong_tin",
          can_chu_duyet: true, unit_code: c.ma ?? null,
          ...(c.dt ? { area_m2: Number(c.dt.replace(",", ".")) } : {}),
          ...(c.ngang && c.dai ? { frontage_m: Number(c.ngang.replace(",", ".")), length_m: Number(c.dai.replace(",", ".")) } : {}),
          ...(goc?.project_id && keThua ? { project_id: goc.project_id, unit_status: "con_ban", last_confirmed_at: new Date().toISOString() } : {}),
        }).select("id, code, property_type").single();
        if (moiErr || !moi) { await ghiLoi(client, "chat-reply mo tin nhieu can", moiErr?.message ?? "insert null"); continue; }
        // 15/09/2026 (bắn thật N1): địa chỉ của TỪNG căn ("căn 1 hẻm 7m Hồng Bàng…, căn 2
        // mặt tiền Nguyễn Chí Thanh…") — trước đây cả hai căn trống location_raw.
        let vtCan = bocViTriRao(c.goc);
        // 22/09/2026 (kịch bản E): "căn 2 chung cư Hùng Vương Plaza 78m2 tầng 15" từng mở tin nhà phố, không địa
        // chỉ, không dự án — rồi model bịa "hai căn cùng địa chỉ". Từng căn: loại theo chữ, dự án tra kho
        // (`match_projects`, FR-114), địa chỉ lấy của dự án khi câu không có đường; fact kèm (tầng, phòng ngủ,
        // pháp lý, hướng…) ghi cho đúng căn.
        const kdLoai = boDau(c.goc);
        const LOAI_CH_RE = /\b(?:chung cu|can ho|cc|ch)\b/;
        const tuNoiLoai = LOAI_CH_RE.test(kdLoai) || /\b(?:nha|dat|mat tien|hem|pho)\b/.test(kdLoai.replace(kdDauTin, ""));
        // 14/10/2026: AI đã đọc loại của căn này thì AI quyết; từ khoá "cc / ch / căn hộ" chỉ đỡ khi AI không nói.
        const laCanHo = acCan?.loaiBds ? acCan.loaiBds === "chung_cu" : LOAI_CH_RE.test(kdLoai) || (!tuNoiLoai && LOAI_CH_RE.test(kdDauTin));
        if (laCanHo && moi.property_type !== "chung_cu") {
          const { error: ptErr } = await client.from("listings").update({ property_type: "chung_cu", property_type_source: "chu_xac_nhan" }).eq("id", moi.id);
          if (ptErr) await ghiLoi(client, "chat-reply nhieu can(loai)", ptErr.message);
          else moi.property_type = "chung_cu";
        }
        let daKho: DuAnKho | undefined;
        if (laCanHo || /\b(?:du an|plaza|tower|towers|residence|residences|city|park|garden|riverside|khu)\b/.test(kdLoai)) {
          const { data: daCan, error: daCanErr } = await client.rpc("match_projects", { p_text: c.goc }).select(COT_DU_AN);
          if (daCanErr) await ghiLoi(client, "chat-reply match_projects(nhieu can)", daCanErr.message);
          let da: DuAnKho | undefined = ((daCan ?? []) as DuAnKho[])[0];
          // Căn không tự nhắc dự án → dự án nói ở đầu câu (tra một lần cho cả lô).
          if (!da && kdDauTin.trim()) {
            if (duAnLo === undefined) {
              const { data: daLo, error: daLoErr } = await client.rpc("match_projects", { p_text: dauTin }).select(COT_DU_AN);
              if (daLoErr) await ghiLoi(client, "chat-reply match_projects(dau tin)", daLoErr.message);
              duAnLo = ((daLo ?? []) as DuAnKho[])[0] ?? null;
            }
            da = duAnLo ?? undefined;
          }
          daKho = da;
          if (da) {
            const { error: daUpErr } = await client.from("listings").update({ project_id: da.id, unit_status: "con_ban", last_confirmed_at: new Date().toISOString(), ...(da.district ? { district: da.district } : {}) }).eq("id", moi.id);
            if (daUpErr) await ghiLoi(client, "chat-reply nhieu can(du an)", daUpErr.message);
            else await phuongTuDuAn(moi.id, da, null, (moi as { property_type?: string | null }).property_type ?? null);
            if (!vtCan) vtCan = da.location_raw ? `${da.name}, ${da.location_raw}` : da.name;
          }
        }
        // 23/09/2026 (bắn thật): nhãn đọc theo TỪNG căn, bỏ mốc số thứ tự trước — "nha 2 mat tien …" là nhà THỨ HAI mặt
        // tiền, bản trước đọc cả câu rồi gắn "căn góc / 2 mặt tiền" cho tin mới nhất.
        await ganNhanChoTin({}, { lid: moi.id, text: c.goc.replace(/(?:căn|can|lô|lo|nhà|nha)\s+(?:số\s+|so\s+|thứ\s+|thu\s+)?(?:\d{1,2}|[A-H])(?![\p{L}\d])/gu, " ") });
        nhanTheoCanDaGan = true;
        // SRS-5.1zzzr: ghi qua đường chung với tạo tin một căn. AI đọc được căn này → fact của AI (kể cả hẻm / đường vào / mặt tiền,
        // đã qua kiểm chủ đề số đo SRS-5.1zzzp). Luật (AI không chạy) giữ như cũ: fact theo mảnh của căn + fact chung cả lô, hẻm đọc
        // bằng mẫu "hẻm Nm" / "mặt tiền" của chính mảnh (fact hẻm của cả lô có thể là của căn khác).
        const factCan = acCan ? acCan.ghi.map((g) => ({ question: g.question, answer: g.answer })) : nhanDienNhieuFact(c.goc);
        const kemCan = acCan ? factCan : [...factCan, ...factChung.filter((g) => !factCan.some((x) => x.question === g.question))]
          .filter((f) => !["do_rong_hem", "mat_tien", "dien_tich_tim_tuong"].includes(f.question));
        await ghiDuLieuTinMoi(moi.id, "nhieu can", {
          viTri: vtCan, dienTich: c.dt ?? (c.ngang && c.dai ? `${c.ngang}x${c.dai}` : null),
          soPhongNgu: acCan ? acCan.soPhongNgu : factCan.find((f) => f.question === "so_phong_ngu")?.answer ?? null,
          duAnTen: daKho ? null : acCan ? acCan.duAn : factCan.find((f) => f.question === "du_an_ten")?.answer ?? null,
          kem: kemCan,
        });
        // 22/09/2026 (bộ đo giọng B11): "căn 1 hẻm 4m …, căn 2 mặt tiền …" — đường vào nói riêng cho từng căn. Hẻm phải có đơn vị mét
        // ("hẻm 123 Trần…" là địa chỉ); "mặt tiền" ghi chữ, trigger đọc ra access_type. Chỉ khi AI không chạy (SRS-5.1zzzr).
        const kdCan = boDau(c.goc);
        const mHem = acCan ? null : /\bhem\s*(?:rong\s*)?(?:la\s*|tam\s*|khoang\s*)?(\d{1,2}(?:[.,]\d)?)\s*(?:m|met)\b/.exec(kdCan);
        const duongVao = acCan ? null : mHem ? `hẻm ${mHem[1].replace(",", ".")}m` : /\bmat tien\b/.test(kdCan) && !/\bcach\s*mat tien\b/.test(kdCan) ? "mặt tiền" : null;
        if (duongVao) {
          const { error: dvErr } = await ghiFact(client, { p_listing_id: moi.id, p_question: "do_rong_hem", p_answer: duongVao, p_source: "seller_chat" });
          if (dvErr) await ghiLoi(client, "chat-reply ghi_fact_listing(do_rong_hem nhieu can)", dvErr.message);
        }
        daMo.push(`${c.ma ?? (vtCan ? duongGiuaCau(vtCan) || null : null) ?? (c.thu ? `căn ${c.thu}` : null) ?? c.quan ?? `căn ${daMo.length + 1}`}${c.dt ? ` ${c.dt}m2` : ""}${c.gia ? ` ${c.gia}` : ""}`);
        dau = dau ?? { id: moi.id, property_type: moi.property_type };
      }
      // SRS-5.1zzzzy (khách mô phỏng 11/10, môi giới 3 căn): "dạ ổn rồi bạn, đăng giúp em. Em còn 2 căn nữa - …" lúc bản nháp căn 1
      // đang chờ duyệt → nhánh này mở 2 tin mới rồi trả lời, lời GẬT của căn 1 mất: căn 1 kẹt `duyet_tin` mãi, về sau bot nhắc lại câu
      // duyệt lạc chỗ. Gật (AI đọc, `gatTach`) trong cùng tin rao căn mới vẫn là gật cho bản nháp đang chờ: đóng dấu như nhánh duyệt.
      let dongDuyetCu: string | null = null;
      const tgNhieu = daMo.length && pendingReq?.question === "duyet_tin" ? await gatTach(text) : undefined;
      if (daMo.length && pendingReq?.question === "duyet_tin" && (tgNhieu !== undefined ? tgNhieu.gat : laDongY(text.split(/[.,;:!?\n]/)[0] ?? "") /* lưới đỡ */)) {
        const luc = new Date().toISOString();
        const [{ error: gdErr }, { error: gdIr }] = await Promise.all([
          client.from("listings").update({ chu_duyet_at: luc }).eq("id", pendingReq.listing_id),
          client.from("info_requests").update({ status: "answered", answer: text.slice(0, 500), answered_at: luc }).eq("id", pendingReq.id),
        ]);
        if (gdErr || gdIr) await ghiLoi(client, "chat-reply duyet kem rao can moi", (gdErr ?? gdIr)!.message);
        if (!gdErr) daDuyetLuot = true; // SRS-5.1zzzzzzu
        const [{ data: lDuyet }, { data: dDuyet }] = await Promise.all([
          client.from("listings").select("status, property_type").eq("id", pendingReq.listing_id).maybeSingle(),
          client.rpc("diem_tin", { p_listing_id: pendingReq.listing_id }),
        ]);
        const dd = (dDuyet ?? null) as DiemTin | null;
        dongDuyetCu = lDuyet && lDuyet.status !== "cho_thong_tin"
          ? cauTD("dang_xong", { diem: dd?.diem, loai: loaiDoc(lDuyet.property_type) })
          : `Dạ em ghi nhận ${cachGoi} duyệt bản nháp rồi, tin còn thiếu ${(dd?.thieu ?? []).slice(0, 2).join(" và ") || "một chút"} là tự lên kệ ạ.`;
      }
      if (daMo.length) {
        await client.from("sellers").update({ active_listing_id: dau!.id }).eq("id", sellerRow.id);
        // Hỏi MỘT câu chung cho cả lô (kết cấu / pháp lý…) — mở trên căn đầu, câu trả lời
        // kế tiếp áp cho căn đó; các căn còn lại vòng hỏi bù hỏi sau.
        const { data: thieuLo } = await client.from("listing_missing_facts").select("fact_key, priority, nhom")
          .eq("listing_id", dau!.id).order("priority").limit(40);
        const keLo = chonCauKe(["gia", "dien_tich"], (await thieuCoReNhanh(client, dau!.id, thieuLo)).filter((f) => f.nhom !== "sau_dang" && !["vi_tri", "phuong", "gap"].includes(f.fact_key)));
        if (keLo) {
          const { error: irLo } = await moCauTreo({ listing_id: dau!.id, question: keLo, status: "pending" });
          if (irLo && irLo.code !== "23505") await ghiLoi(client, "chat-reply mo cau ke(nhieu can)", irLo.message);
        }
        return await traLoiSeller([
          ...(dongDuyetCu ? [dongDuyetCu] : []),
          `📝 Em mở ${daMo.length} tin riêng: ${daMo.join(" · ")}.` +
            (chanTranRao ? `\nCòn ${nhieuCanTrongTin.length - daMo.length} căn em chưa mở được: hạng Đồng tối đa ${trNhieu?.tran ?? 5} căn ạ, ${cachGoi} bổ sung đủ thông tin các căn đang rao để lên hạng Bạc là em mở tiếp.` : ""),
          keLo ? `${cauHoiMau(keLo, cachGoi, dau!.property_type)} (giống nhau cả lô thì ${cachGoi} nói "cả lô" giúp em)` : `Cả lô đủ thông tin rồi, em soạn bản nháp gửi ${cachGoi} xem nha.`,
        ], { nhieu_can: daMo.length, asked: keLo ?? null, tran_hang: chanTranRao || undefined, ...(dongDuyetCu ? { duyet: true } : {}) });
      }
      if (chanTranRao && trNhieu) return await traLoiSeller([cauTranHang(trNhieu)], { tran_hang: trNhieu.hang, so_dang_rao: trNhieu.so_dang_rao });
    }

    // ─── FR-164: CHỦ NHÀ SỬA THÔNG TIN GIỮA CHỪNG.
    // "à giá 6.8 tỷ nha em", "nhà ở phường 12 chứ không phải 8" — trước bản này
    // KHÔNG có đường nào nhận: đang có câu hỏi chờ thì lời sửa bị ghi thành câu
    // TRẢ LỜI cho câu hỏi đó (sai chỗ), không có thì rơi xuống nhánh chăm sóc
    // chung rồi bay mất. Mà giá và phường là hai trong ba trường quyết định tin
    // có được lên kệ hay không.
    //
    // CHỈ bắt khi câu có NHÃN tường minh ("giá …", "phường …", "… phòng ngủ",
    // "diện tích …"). Câu trả lời cho drip thường KHÔNG lặp nhãn ("50m2", "sổ
    // hồng") nên hai đường không giẫm chân nhau; ai có lặp nhãn đúng lúc đang
    // được hỏi chính trường đó thì nhường hẳn cho đường drip bên dưới.
    // Ghi qua `ghi_fact_listing` — cửa fact duy nhất; chuẩn hoá, kiểm giá trị và
    // đo bậc ưu tiên đều nằm ở tầng DB, không chép luật lên đây.
    const suaFacts: Array<[string, string]> = [];
    // Vị trí các đoạn đã được nhận là "lời sửa". Bóc chúng ra khỏi câu thì phần
    // CÒN LẠI cho biết câu này có kèm câu trả lời cho câu hỏi đang treo không.
    const nhipSua: Array<[number, number]> = [];
    const batSua = (
      m: RegExpExecArray | null,
      key: string,
      lay: (m: RegExpExecArray) => string,
    ) => {
      if (!m) return;
      suaFacts.push([key, lay(m)]);
      nhipSua.push([m.index, m.index + m[0].length]);
    };
    // 11/09/2026 (42 ca): "sai rồi em, phường 9 chứ không phải phường 4" → bản
    // trước ghi Phường 4 (vế SAI) vào ô phường, rác vào vị trí, rồi báo "đã cập
    // nhật Phường 9". Che vế phủ định trước khi bắt lời sửa (cùng độ dài nên chỉ
    // số vẫn đúng trên `text`); câu là lời sửa thì bóc luôn vế đó khỏi phần còn lại.
    const textSua = cheoPhuDinh(text);
    const nhipPhuDinh = vungPhuDinh(text);
    // 16/09/2026: chi tiết căn MỚI sau câu "căn đó hay căn khác" (không có chữ "bán") cũng là
    // câu rao, không phải lời sửa tin cũ — e2e CHU-5 từng đè giá tin cũ 6 tỷ → 7 tỷ.
    if (!wantsSell && !raoCanMoiXacNhan) {
      const mGia = new RegExp(
        `gi[áa]\\s*[^0-9]{0,12}?([\\d][\\d.,]*\\s*(?:${TIEN_CD})(?![a-zA-ZÀ-ỹ])[^,.;\\n]*)`,
        "i",
      ).exec(textSua);
      // Đuôi `[^,.;\n]*` giữ phần CÓ NGHĨA đi sau đơn vị ("6 tỷ 8", "5 tỷ
      // thương lượng"), nhưng cũng vơ luôn tiểu từ cuối câu ("6.8 tỷ nha em").
      // KHÔNG cắt ở đây: chuỗi này là bằng chứng thô, còn `price_raw` do
      // `chuan_hoa_gia_raw()` ở tầng DB gọt — một luật, một chỗ, và mọi cửa ghi
      // (form admin, câu trả lời drip) đều đi qua nó chứ không riêng cửa này.
      batSua(mGia, "gia", (m) => m[1].trim());
      batSua(/(?:phường|phuong)\s*\.?\s*(\d{1,2})\b/i.exec(textSua), "phuong",
        (m) => `Phường ${m[1]}`);
      // 30/09/2026 (bắn thử vector v288): "nhà có 1 phòng ngủ ngay tầng trệt cho người già" không phải lời SỬA số phòng ngủ —
      // phòng ngủ theo tầng (soPhongNguTheoTang) đi đường thông tin bổ sung.
      const mPnSua = /(\d{1,2})\s*(?:phòng ngủ|phong ngu|\bpn\b)/i.exec(textSua);
      batSua(mPnSua && !soPhongNguTheoTang(text).includes(Number(mPnSua[1])) ? mPnSua : null, "so_phong_ngu",
        (m) => m[1]);
      // 16/09/2026 (bắn thật sau deploy #144): "nhà 4 tấm diện tích TỔNG 240m2" là SÀN — lời sửa
      // từng đè area_m2 = 240 và nuốt luôn fact `dien_tich_san`. Sàn/sử dụng/tổng-của-nhà-có-tầng
      // không phải lời sửa diện tích đất (cùng luật `dienTichCauRao`).
      const mDtSua = /(?:diện tích|dien tich|\bdt\b)\s*[^0-9]{0,8}?(\d{1,4}(?:[.,]\d+)?)\s*m2?/i.exec(textSua);
      const dtLaSan = !!mDtSua && (
        TRUOC_LA_SAN.test(boDau(mDtSua[0])) ||
        (/\btong\b/.test(boDau(mDtSua[0])) && !/\bdat\b/.test(boDau(mDtSua[0])) && /\b(?:tam|tang|lau|tret)\b/.test(tKD))
      );
      batSua(dtLaSan ? null : mDtSua, "dien_tich", (m) => `${m[1]}m2`);
      // FR-240 b (phát lại test 28/09 trên production): "diện tích 425m2 thổ cư. dài 22m ngang 19m" — lời ghi diện tích cắt mất
      // "425m2", phần còn lại "thổ cư" không có số nên rơi ghi chú và cuối hội thoại bot hỏi "thổ cư bao nhiêu". Diện tích kèm
      // ngay chữ thổ cư là thổ cư bằng chừng ấy — ghi cả ô thổ cư, cắt luôn chữ đó khỏi phần còn lại.
      if (mDtSua && !dtLaSan) {
        const cuoi = mDtSua.index + mDtSua[0].length;
        const tc = /^\s*(?:đất\s+|dat\s+)?(?:thổ cư|tho cu)(?:\s+(?:full|hết|het|100\s*%?|toàn bộ|toan bo))?(?![\p{L}\d])(?!\s*(?:\d|là|la\b|được|duoc|khoảng|khoang|tầm|tam\b|chỉ|chi\b))/iu.exec(textSua.slice(cuoi));
        if (tc) {
          suaFacts.push(["tho_cu", `${mDtSua[1]}m2`]);
          nhipSua.push([cuoi, cuoi + tc[0].length]);
        }
      }
      // 11/09/2026 (Zalo thật, dự án ehome 3): "Bạn phải ghi dự án chung cư ehome 3
      // chứ ở hồ ngọc lãm" — chủ nhà nói RÕ loại khi sửa mà bản trước bỏ qua: tin vẫn
      // "nhà phố", bot hỏi "diện tích đất, ngang dài" cho một căn hộ. Chỉ bắt khi câu
      // có dấu hiệu SỬA/DẶN; vế sau "không phải" đã bị che trong `textSua`.
      if (/\b(?:phai ghi|ghi lai|ghi la|sua lai|sua thanh|chu khong phai|khong phai|nham|la can ho|la chung cu)\b/.test(boDau(text))) {
        batSua(
          /(chung cư|chung cu|căn hộ|can ho|nhà phố|nha pho|nhà cấp 4|nha cap 4|đất nền|dat nen|biệt thự|biet thu|mặt bằng|mat bang|phòng trọ|phong tro|kho xưởng|kho xuong)/i.exec(textSua),
          "loai_bds", (m) => m[1]);
      }
    }
    // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): lời sửa bắt bằng NHÃN + regex chạy TRƯỚC AI, và ô luật đã ghi thì AI không
    // đè (`chonDeGhi`) — "căn kế bên giá 9 tỷ đó em, anh để 8 tỷ 5 thôi" từng ghi giá 9 tỷ. AI đã đọc thì chỉ giữ ô AI cũng
    // đọc ra, và lấy GIÁ TRỊ của AI; ô AI không thấy thì bỏ (kèm đoạn chữ của nó, để phần còn lại vẫn là câu trả lời).
    const aiSua = suaFacts.length ? await aiLuot() : undefined;
    if (aiSua !== undefined) {
      const giaTriAi = new Map(aiSua.ghi.map((g) => [g.question, g.answer]));
      for (let i = suaFacts.length - 1; i >= 0; i--) {
        const v = giaTriAi.get(suaFacts[i][0]);
        if (v) suaFacts[i] = [suaFacts[i][0], v];
        else { suaFacts.splice(i, 1); nhipSua.splice(i, 1); }
      }
    }
    if (suaFacts.length) nhipSua.push(...nhipPhuDinh);
    // Trường nào đang là câu hỏi chờ thì để đường drip xử — tránh vừa ghi lời
    // sửa vừa bỏ lửng câu hỏi đang treo.
    const suaThat = suaFacts.filter(([k]) =>
      !(pendingReq &&
        (k === pendingReq.question ||
          (k === "dien_tich" && /^dien_tich/.test(pendingReq.question)))));

    // Bóc các đoạn "lời sửa" ra, cắt từ PHẢI sang TRÁI để chỉ số không trượt.
    const conLai = nhipSua.length
      ? nhipSua.slice().sort((a, b) => b[0] - a[0])
        .reduce((s, [i, j]) => `${s.slice(0, i)} ${s.slice(j)}`, text)
        .replace(/\s+/g, " ").replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, "").replace(TIEU_TU_DAU, "").trim()
      : text;
    // Tiểu từ đứng trơ một mình KHÔNG phải câu trả lời: "à giá 6.8 tỷ nha em"
    // bóc xong còn "à em" — đó vẫn chỉ là lời sửa. Lọc sau `boDau` nên danh
    // sách chỉ cần bản không dấu.
    const conChu = boDau(conLai)
      .replace(
        /\b(a|u|o|da|vang|em|anh|chi|nha|nhe|nhen|ha|hen|ok|oke|roi|thi|ma|voi|va|do|luon|sai|nham|lon|xin loi|sorry|chu|la)\b/gi,
        "",
      )
      .replace(/[^a-z0-9]+/gi, "");
    // Câu VỪA sửa một trường VỪA trả lời câu hỏi đang treo. Hai việc, không
    // được chọn một: đây chính là chỗ bản trước làm rơi câu trả lời drip.
    const vuaTraLoiVuaSua = !!pendingReq && conChu.length >= 2;

    if (suaThat.length) {
      // Neo đúng CĂN theo cùng thứ tự tin cậy của FR-157: mã chủ tự nhắc > căn
      // bot đang hỏi > căn của câu hỏi chờ > tin mới nhất của người này.
      let suaId: string | null = null;
      if (codeInText) {
        const { data: cl } = await client.from("listings").select("id")
          .eq("code", codeInText).eq("seller_id", sellerRow.id).maybeSingle();
        suaId = cl?.id ?? null;
      }
      suaId = suaId ?? sellerRow.active_listing_id ?? pendingReq?.listing_id ?? null;
      if (!suaId) {
        const { data: ml } = await client.from("listings").select("id")
          .eq("seller_id", sellerRow.id).order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        suaId = ml?.id ?? null;
      }
      if (suaId) {
        await capNhatQuan(suaId);
        const NHAN: Record<string, string> = {
          gia: "giá", phuong: "phường",
          so_phong_ngu: "số phòng ngủ", dien_tich: "diện tích", loai_bds: "loại", tho_cu: "thổ cư",
        };
        // 10/09 lần 7: "1 trệt 2 lầu, 3 phòng ngủ" (tin CHƯA có phòng ngủ) mà bot
        // báo "em cập nhật lại rồi" — nghe như chủ nhà vừa nói sai cái gì. Đọc
        // giá trị CŨ trước khi ghi: có rồi mới là sửa, trống thì chỉ là ghi thêm.
        const { data: truoc } = await client.from("listings")
          .select("price_raw, price_vnd, ward, district, bedrooms, area_m2, frontage_m, length_m, floors, floors_text, location_raw, property_type, legal_status, deal").eq("id", suaId).maybeSingle();
        const daCoTruoc = (k: string) =>
          k === "gia"
            ? !!truoc?.price_raw
            : k === "phuong"
            ? !!truoc?.ward
            : k === "so_phong_ngu"
            ? truoc?.bedrooms != null
            : k === "dien_tich"
            ? truoc?.area_m2 != null
            : k === "loai_bds"
            ? !!truoc?.property_type && truoc.property_type !== "chua_ro"
            : k === "tho_cu"
            ? false
            : true;
        const laSuaThat = suaThat.some(([k]) => daCoTruoc(k));
        const daGhi: string[] = [];
        // 22/09/2026 (kịch bản C): "gia 7 ti 5 chu ko phai 7 ty 2" — luật tiền không đọc ra "7 ti 5" (đã vá),
        // nhưng bot vẫn nói "Dạ em sửa lại giá 7 ti 5 rồi ạ" trong khi DB giữ 7ty2 và bản nháp in giá cũ.
        // Cùng luật với L1 (FR-177 o): giá chưa đọc ra số thì KHÔNG ghi, KHÔNG nói đã sửa — nói thật, xin gõ lại.
        let giaKhongDoc: string | null = null;
        for (const [k, v] of suaThat) {
          if (k === "gia" && docTien(v) == null) { giaKhongDoc = v; continue; }
          // SRS-5.1zzzzz (khách mô phỏng 11/10: tin đã 90m², khách kể lại "căn này diện tích 90m2" → "Dạ em sửa lại diện tích 90m2 rồi
          // ạ"): nói lại đúng giá trị tin đang mang không phải lời sửa — không ghi, không báo đã sửa (một bộ so với 🤖, `giaTriKhongDoi`).
          if (truoc && giaTriKhongDoi(k, v, truoc as Parameters<typeof giaTriKhongDoi>[2], {})) continue;
          const { error: fErr, boQua: suaBo, ghi: suaGhi } = await ghiFact(client, {
            p_listing_id: suaId, p_question: k, p_answer: v, p_source: "seller_chat",
          });
          if (fErr) await ghiLoi(client, `chat-reply ghi_fact_listing(${k})`, fErr.message);
          // SRS-5.1zzzzj: không ghi được (phường không ra phường mới) thì KHÔNG nói "đã sửa" — lời xác nhận chỉ đọc điều đã ghi.
          else if (suaBo) continue;
          // Giá trị đã tự mang nhãn ("Phường 3") thì đừng dán nhãn lần nữa —
          // "phường Phường 3" đọc như máy hỏng.
          else {
            const nhan = NHAN[k] ?? k;
            // 22/09/2026 (bộ đo giọng B04): "giá 7 tỷ 5 nha em" — tiểu từ cuối câu là bằng chứng thô cho
            // DB gọt (`chuan_hoa_gia_raw`), nhưng lời xác nhận đọc lên thì bỏ.
            const hien = v.replace(/(?:\s+(?:nha|nhé|nhe|nghen|em|anh|chị|ạ|ơi|đó|á|nè|hen|ha|nhá|cháu|chú|cô|bác|ông|bà|dì|cậu|mợ|thím|dượng|thôi|luôn|nghe))+\s*$/iu, "");
            // 22/09/2026 (kịch bản C): lời xác nhận đọc đơn vị có dấu ("7 tỷ 5"), DB vẫn giữ chữ khách gõ.
            // SRS-5.1zzzzj: phường đọc đúng tên ĐÃ ghi ("phường 9" + Quận 5 → "Phường An Đông"), không đọc chữ khách gõ.
            const hienDep = k === "gia" ? donViGiaDep(hien) : k === "phuong" && suaGhi ? suaGhi : hien;
            daGhi.push(
              boDau(hienDep).startsWith(boDau(nhan)) ? hienDep : `${nhan} ${hienDep}`,
            );
          }
        }
        if (giaKhongDoc && !daGhi.length) {
          return await traLoiSeller(
            [`Dạ giá "${giaKhongDoc}" em chưa đọc ra số ạ, ${cachGoi} ghi giúp em kiểu "7 tỷ 5" hay "7,5 tỷ" nha.`],
            { gia_khong_doc: giaKhongDoc, ...(pendingReq ? { reask: pendingReq.question } : {}) },
          );
        }
        if (daGhi.length) {
          const cau = (laSuaThat
            ? `Dạ em sửa lại ${daGhi.join(", ")} rồi ạ.`
            : `Dạ em ghi ${daGhi.join(", ")} rồi ạ.`) +
            (giaKhongDoc ? ` Còn giá "${giaKhongDoc}" em chưa đọc ra số, ${cachGoi} ghi giúp em kiểu "7 tỷ 5" nha.` : "");
          // FR-177 c: đang chờ duyệt bản nháp thì lời sửa KHÔNG dừng ở đây —
          // xuống khối duyet_tin để gửi lại bản nháp với số mới.
          // 09/09 tối: đang có câu hỏi treo mà chỉ sửa ("6 phòng ngủ" khi em đang
          // hỏi tầng) thì cũng KHÔNG dừng — ghi xong bot im, chủ nhà ngồi chờ.
          // Đi tiếp xuống khối câu chờ để hỏi lại thứ còn thiếu.
          if (!vuaTraLoiVuaSua && !pendingReq) {
            const meta = { sua_fact: suaThat.map(([k]) => k), ...(laSuaThat ? { sua_that: true } : {}) };
            // SRS-5.1zzzzzzv: tin chưa lên kệ → hỏi câu kế / bản nháp / nói thiếu gì, không kết lượt bằng lời ghi suông. Ô KHÁC AI đọc
            // ra từ cùng bài rao (kết cấu, hẻm, địa chỉ…) ghi TRƯỚC khi chọn câu kế / dựng nháp — không thì bot hỏi đúng điều vừa nói
            // và bản nháp thiếu dòng (cùng thứ tự với đường fact rời bên dưới).
            // Đọc lại đề xuất AI VỚI dòng tin (loại giao dịch, loại BĐS): `aiLuot` đọc không kèm dòng tin nên giá THUÊ "6 triệu" bị coi là giá bán.
            const kqAiSua = bongAi && laCheDoAi ? await bongAi : null;
            const aiDoc = kqAiSua?.ket && truoc ? docAiChinh(kiemDeXuat(kqAiSua.truong, textTreo || textBongAi).dat, truoc as unknown as DongDb) : (aiSua ?? await aiLuot());
            const aiThem: Array<{ question: string; answer: string; goc?: string | null }> = (aiDoc?.ghi ?? []).filter((g) => !suaThat.some(([k]) => k === g.question));
            // Giá AI đọc nằm ở cột lõi (`gia`), không ở `ghi` — thiếu nó thì bot hỏi lại giá vừa nằm trong bài rao.
            if (aiDoc?.gia && !suaThat.some(([k]) => k === "gia") && !aiThem.some((g) => g.question === "gia")) aiThem.push({ question: "gia", answer: aiDoc.gia });
            for (const g of aiThem) {
              const { error: gErr } = await ghiFact(client, { p_listing_id: suaId, p_question: g.question, p_answer: g.answer, p_source: "seller_chat", goc: gocCua(g) });
              if (gErr) await ghiLoi(client, "chat-reply ghi_fact_listing(sua + ai)", gErr.message);
            }
            const tiep = await tiepSauGhi(suaId, [...suaThat.map(([k]) => k), ...aiThem.map((g) => g.question)], cau, meta, [cau]);
            if (tiep) return tiep;
            return await traLoiSeller([cau], meta);
          }
          // KHÔNG dừng ở đây. Trước bản này khối này `return` thẳng, nên câu
          // "sổ hồng rồi em, à giá 6.8 tỷ nha" (đang treo câu hỏi pháp lý) chỉ
          // ghi được GIÁ: câu trả lời pháp lý bay mất, `info_requests` kẹt
          // `pending`, và nhịp drip sau lại hỏi đúng cái chủ nhà vừa trả lời —
          // bot hỏi lại điều vừa được đáp là kiểu mất mặt FR-144 sinh ra để
          // tránh. Gắn lời cảm ơn vào đường ra chung rồi đi tiếp xuống khối
          // `pendingReq` để câu trả lời cũng vào sổ.
          ackSua = cau;
          if (laSuaThat) suaLuotKhoa = suaThat.map(([k]) => k);
          ackGhiGop = !laSuaThat && !giaKhongDoc ? daGhi.join(", ") : null;
        }
      }
    }

    // ─── FR-185 (09/09/2026, chủ dự án: "ảnh phải gắn vào kho chứ"): ẢNH CHỦ
    // NHÀ GỬI → (1) model nhìn xem là ảnh gì (mặt tiền / trong nhà / hẻm / giấy
    // tờ / bản vẽ), (2) tải về kho của mình + `listing_media` — giấy tờ vào
    // bucket RIÊNG TƯ, ảnh nhà vào bucket công khai; không phân loại được thì
    // cất riêng tư (OPEN-32 đóng), (3) ảnh giấy tờ đọc diện tích trên sổ, đối
    // chiếu với số chủ nhà nói: chưa có thì lấy, lệch >5% thì hỏi lại + báo admin.
    // Kho hỏng (không tải/cất được) → rơi về đường cũ: fact `hinh_anh` giữ URL
    // Zalo tạm + ghi sổ lỗi, để tấm ảnh không mất hẳn. Neo căn theo thứ tự FR-157;
    // tin rao MỚI (wantsSell) thì căn chưa tồn tại — gọi sau khi tạo, ở dưới.
    const LOAI_ANH_VI: Record<LoaiAnh, string> = {
      mat_tien: "mặt tiền", trong_nha: "trong nhà", phong_ngu: "phòng ngủ", bep: "bếp", wc: "nhà vệ sinh",
      san_thuong: "sân thượng", view: "view", hem: "hẻm", giay_to: "giấy tờ", ban_ve: "bản vẽ", tai_lieu_du_an: "tài liệu dự án", khong_lien_quan: "", khac: "",
    };
    const LOAI_MEDIA: Record<LoaiAnh, LoaiMedia> = {
      mat_tien: "mat_tien", trong_nha: "trong_nha", phong_ngu: "phong_ngu", bep: "bep", wc: "wc", san_thuong: "san_thuong",
      view: "view", hem: "hem", giay_to: "giay_to", ban_ve: "khac", tai_lieu_du_an: "khac", khong_lien_quan: "khac", khac: "khac",
    };
    /** Điểm mạnh model thấy trong ảnh của lượt này (gộp album dùng làm câu khen). */
    let khenAnhLuot: string | null = null;
    let anhLaGiayTo = false;
    /** SRS-5.1zzzzzs: pháp lý ghi từ bìa sổ trong lượt ảnh này ("sổ hồng" / "sổ đỏ[, đồng sở hữu]") — để 🤖 in "pháp lý: …". */
    let phapLyTuAnh: string | null = null;
    /** Trả `true` khi ảnh KHÔNG liên quan tới nhà (đã hỏi "gửi nhầm ảnh không", không cất vào tin). */
    // ─── SRS-5.1zzk (05/10/2026, demo AOND bulk.py): BẢNG RỔ HÀNG (CSV / XLSX) của môi giới → mỗi dòng một tin, ánh xạ cột tất
    // định, không model; trần hạng vẫn áp; cột tên / SĐT chủ nhà cố ý bỏ (§5). Thiếu ô thì tin vẫn mở, hỏi bù lo sau.
    const nhapRoHangTuBang = async (bang: string[][], tenTep: string | null): Promise<string[]> => {
      const kq = bangThanhTin(bang, { deal: "ban" });
      if (kq.loi || !kq.dong.length) {
        return [`Dạ em mở được file${tenTep ? ` ${tenTep}` : ""} mà ${kq.loi ?? "không thấy dòng nào có địa chỉ, giá hay diện tích"} ạ. ${CachGoi} để hàng đầu là tiêu đề cột (địa chỉ, phường, quận, diện tích, giá, pháp lý…) giúp em nha.`];
      }
      const tr = await tranHangRao();
      if (tr && !tr.duoc) return [cauTranHang(tr)];
      const dong = kq.dong.slice(0, 50);
      const conCho = tr?.tran != null ? Math.max(0, tr.tran - tr.so_dang_rao) : dong.length;
      const nhap = dong.slice(0, Math.max(1, Math.min(dong.length, conCho || dong.length)));
      let soTao = 0;
      const tenCan: string[] = [];
      const thieu: string[] = [];
      for (const d of nhap) {
        const duAnD = d.du_an ? await timDuAnTheoTen(d.du_an) : null;
        const dongTinNhap = {
          code: null, seller_id: sellerRow.id, deal: d.deal, district: d.district, ward: tenPhuongCot(d.ward, d.district), location_raw: d.location_raw,
          description: cauRaoTuDong(d), price_raw: d.price_raw, property_type: d.property_type, status: "cho_thong_tin", gap: null, can_chu_duyet: true,
          ...(d.area_m2 ? { area_m2: d.area_m2 } : {}), ...(d.bedrooms ? { bedrooms: d.bedrooms } : {}),
          ...(d.legal_status ? { legal_status: d.legal_status } : {}), ...(d.floors_text ? { floors_text: d.floors_text } : {}),
          ...(duAnD ? { project_id: duAnD.id, unit_code: d.ma_can, unit_status: "con_ban", last_confirmed_at: new Date().toISOString() } : {}),
        };
        let { data: nl, error } = await client.from("listings").insert(dongTinNhap).select("id").single();
        if (error?.code === "23505" && /listings_project_unit_uniq/.test(error.message) && dongTinNhap.unit_code) {
          ({ data: nl, error } = await client.from("listings").insert({ ...dongTinNhap, unit_code: null }).select("id").single());
        }
        if (error || !nl) { await ghiLoi(client, "chat-reply nhap ro hang", error?.message ?? "không có id"); continue; }
        soTao++;
        const idMoi = (nl as { id: string }).id;
        const { error: btErr } = await client.rpc("ghi_boc_tach", { p_listing_id: idMoi, p: { nguon: "bang_nhap", ten_tep: tenTep, dong: d.stt } });
        if (btErr) await ghiLoi(client, "chat-reply ghi_boc_tach(bang nhap)", btErr.message);
        if (duAnD && d.ma_can) await dienTuKhoDuAn(idMoi, duAnD.id, d.ma_can);
        tenCan.push(`${d.stt}. ${[d.location_raw ?? (d.du_an ? `${d.ma_can ? `căn ${d.ma_can} ` : ""}${d.du_an}` : null), d.area_m2 ? `${d.area_m2}m2` : null, d.price_raw ? donViGiaDep(d.price_raw) : null].filter(Boolean).join(" · ")}`);
        if (d.thieu.length) thieu.push(`dòng ${d.stt} thiếu ${d.thieu.join(", ")}`);
      }
      if (!soTao) return [`Dạ em đọc được bảng mà chưa nhập được căn nào, em đã ghi sổ để anh Thu xem. ${CachGoi} nhắn từng căn giúp em cũng được ạ.`];

      // Cơ chế giống anh Luân (_drop_stub_listings): Khi đã nhập được các căn thật từ bảng hàng,
      // tự động dọn bỏ căn nháp rỗng khởi tạo ban đầu để giỏ hàng không bị sót căn rác vô danh.
      try {
        const { data: tinRongCu } = await client.from("listings").select("id, status, price_raw, price_vnd, area_m2, district, ward, location_raw, project_id, unit_code")
          .eq("seller_id", sellerRow.id).eq("status", "cho_thong_tin");
        if (Array.isArray(tinRongCu)) {
          for (const trc of tinRongCu) {
            if (laTinRong({ ...trc, location_raw: trc.location_raw ?? null, area_m2: trc.area_m2 == null ? null : Number(trc.area_m2) })) {
              await client.from("listings").delete().eq("id", trc.id);
            }
          }
        }
      } catch (eRong) {
        await ghiLoi(client, "chat-reply xoa tin rong sau nhap bang", eRong);
      }
      return [
        `📥 Em nhập ${soTao} căn từ bảng${tenTep ? ` ${tenTep}` : ""} vào rổ của ${cachGoi}:\n${tenCan.join("\n")}` +
        (kq.laCot.length ? `\nCột em chưa nhận: ${kq.laCot.slice(0, 5).join(", ")}.` : "") +
        (thieu.length ? `\n${thieu.slice(0, 5).join("; ")} — em hỏi thêm sau.` : "") +
        (dong.length > nhap.length ? `\nCòn ${dong.length - nhap.length} dòng em chưa nhập vì hạng Đồng tối đa ${tr?.tran ?? 5} căn.` : ""),
        `Căn nào cần sửa thì ${cachGoi} nhắn địa chỉ kèm chỗ sửa, em cập nhật liền.`,
      ];
    };
    // ─── SRS-5.1zzj/zzk/zzl: file hoặc link → tải về (rào SSRF ở kho_tep) → nhận diện bằng byte đầu → đúng đường.
    const nhanTepVaLink = async (ds: Array<{ url: string; ten: string | null; kieu: "file" | "link" }>) => {
      const cau: string[] = [];
      const extra: Record<string, unknown> = { tep: ds.length };
      for (const n of ds.slice(0, 3)) {
        let urls: Array<{ url: string; ten: string | null }> = [{ url: n.url, ten: n.ten }];
        const drive = n.kieu === "link" ? docLinkDrive(n.url) : null;
        if (drive) {
          // SRS-5.1zzl (demo drive.py): file chia sẻ công khai tải được không cần khoá; THƯ MỤC cần GOOGLE_API_KEY (Vault).
          const key = (await docBiMat(client, "GOOGLE_API_KEY")).giaTri;
          if (drive.loai === "thu_muc") {
            if (!key) { cau.push(`Dạ link thư mục Google Drive em chưa mở được ạ. ${CachGoi} gửi thẳng file (PDF, ảnh, Excel) hoặc link từng file giúp em nha.`); continue; }
            const r = await fetch(`https://www.googleapis.com/drive/v3/files?q='${drive.id}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&pageSize=20&key=${key}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
            const j = r?.ok ? await r.json().catch(() => null) : null;
            const files = ((j as { files?: Array<{ id: string; name: string; mimeType: string }> } | null)?.files ?? []).filter((f) => !f.mimeType.startsWith("application/vnd.google-apps"));
            if (!files.length) { cau.push(`Dạ thư mục Drive này em không đọc được ạ (chưa chia sẻ công khai hoặc đang trống).`); continue; }
            urls = files.slice(0, 10).map((f) => ({ url: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${key}`, ten: f.name }));
          } else {
            urls = [{ url: key ? `https://www.googleapis.com/drive/v3/files/${drive.id}?alt=media&key=${key}` : `https://drive.google.com/uc?export=download&id=${drive.id}`, ten: n.ten }];
          }
        }
        for (const u of urls) {
          const tep: TepTai | null = await taiTep(u.url);
          if (!tep) { cau.push(`Dạ em tải ${u.ten ?? "file"} về không được ạ (link hết hạn, cần đăng nhập, hoặc file quá 20 MB).`); continue; }
          const ten = u.ten ?? tep.ten;
          const loai = loaiTep(tep.bytes, tep.mime, ten);
          if (loai === "csv" || loai === "xlsx") {
            let bang: string[][] = [];
            try { bang = loai === "csv" ? docCsv(new TextDecoder("utf-8").decode(tep.bytes)) : await docXlsx(tep.bytes); } catch (e) { await ghiLoi(client, "chat-reply doc bang", e); }
            cau.push(...await nhapRoHangTuBang(bang, ten));
            extra.nhap_ro_hang = true;
            continue;
          }
          if (loai === "pdf") {
            cau.push(...await nhanTaiLieuDuAn({ kind: "pdf_b64", data: base64(tep.bytes) }, { bytes: tep.bytes, mime: "application/pdf", ten }));
            extra.tai_lieu_du_an = true;
            continue;
          }
          if (loai === "anh") {
            cau.push(...await nhanTaiLieuDuAn({ kind: "anh_b64", data: base64(tep.bytes), mime: tep.mime.startsWith("image/") ? tep.mime : "image/jpeg" }, { bytes: tep.bytes, mime: tep.mime, ten }));
            extra.tai_lieu_du_an = true;
            continue;
          }
          cau.push(`Dạ ${ten ?? "file này"} em chưa đọc được định dạng ạ. Em đọc được PDF, ảnh, CSV và Excel.`);
        }
      }
      return await traLoiSeller(cau, extra);
    };
    const nhanAnh = async (listingId: string | null): Promise<boolean | "tai_lieu"> => {
      if (!imageUrl) return false;
      let id = listingId;
      if (!id) {
        // Tin MỚI NHẤT còn đang rao — tin đã gỡ / đã chốt không nhận ảnh mới.
        const { data: ml } = await client.from("listings").select("id")
          .eq("seller_id", sellerRow!.id).in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"])
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        id = ml?.id ?? null;
      }
      if (!id) return false;
      const { data: l } = await client.from("listings")
        .select("location_raw, ward, area_m2, property_type").eq("id", id).maybeSingle();
      const boiCanhAnh = [l?.property_type, l?.location_raw, l?.ward, l?.area_m2 ? `diện tích đang ghi ${l.area_m2}m2` : "chưa ghi diện tích", `cách gọi chủ nhà: ${cachGoi}`]
        .filter(Boolean).join(" · ");
      let kq: Awaited<ReturnType<typeof phanLoaiAnh>>["kq"] = null;
      if (anthropicS) {
        try {
          const r = await phanLoaiAnh(anthropicS as unknown as Parameters<typeof phanLoaiAnh>[0], MODEL, imageUrl, boiCanhAnh);
          kq = r.kq;
          await doTien(client, r.usage as Parameters<typeof doTien>[1]);
        } catch (e) {
          await ghiLoi(client, "chat-reply phan loai anh", e);
        }
      }
      // 24/09/2026 (chủ dự án: "ảnh ko liên quan thì nhận xét luôn bảo à anh có gửi nhầm ảnh ko"): không cất vào tin.
      if (kq?.loai === "khong_lien_quan") {
        const moTaNham = kq.mo_ta?.trim().replace(/\.$/, "").replace(/^hình như (?:là )?/iu, "");
        ackAnh.push(`Dạ ảnh này ${moTaNham ? `hình như là ${moTaNham.charAt(0).toLowerCase()}${moTaNham.slice(1)}, ` : ""}em thấy không phải ảnh nhà. ${cachGoi.charAt(0).toUpperCase()}${cachGoi.slice(1)} có gửi nhầm ảnh không ạ?`);
        return true;
      }
      // SRS-5.1zzj: ảnh là BẢNG GIÁ / PHÂN LÔ / BROCHURE → không phải ảnh căn, đọc vào kho dự án (không cất `listing_media`).
      if (kq?.loai === "tai_lieu_du_an") {
        const taiTL = await taiAnh(imageUrl);
        ackAnh.push(...await nhanTaiLieuDuAn({ kind: "anh_url", url: imageUrl }, taiTL ? { bytes: taiTL.bytes, mime: taiTL.mime, ten: null } : null));
        return "tai_lieu";
      }
      const loai: LoaiMedia = kq ? LOAI_MEDIA[kq.loai] : "khac";
      const tai = await taiAnh(imageUrl);
      // Không phân loại được → cất RIÊNG TƯ (ghi `giay_to` để CHECK bucket bắt buộc
      // riêng): thà web thiếu một tấm còn hơn sổ đỏ người ta nằm trên CDN công khai.
      const cat = tai
        ? await catAnhVaoKho(client, {
          listingId: id, bytes: tai.bytes, mime: tai.mime,
          loai: kq ? loai : "giay_to", moTa: kq?.mo_ta ?? null, ocr: kq?.giay_to ?? null,
        })
        : null;
      if (!cat) {
        await ghiLoi(client, "chat-reply anh vao kho",
          `không ${tai ? "cất" : "tải"} được ảnh ${imageUrl.slice(0, 80)} - giữ URL tạm trong fact hinh_anh`);
        const { error: aErr } = await ghiFact(client, {
          p_listing_id: id, p_question: "hinh_anh", p_answer: `[ảnh] ${imageUrl}`, p_source: "seller_chat",
        });
        if (aErr) await ghiLoi(client, "chat-reply ghi_fact_listing(anh)", aErr.message);
      }
      // Câu hỏi "gửi ảnh" đang treo thì đóng — ảnh đã có, hỏi nữa là hỏi thừa.
      const treoAnh = ds.find((p) => p.listing_id === id && p.question === "hinh_anh");
      if (treoAnh) {
        await client.from("info_requests").update({
          status: "answered", answer: cat ? `[kho] ${cat.bucket}/${cat.path}` : `[ảnh] ${imageUrl}`,
          answered_at: new Date().toISOString(),
        }).eq("id", treoAnh.id);
      }
      // Lời đáp: nói ảnh gì, và với giấy tờ thì đối chiếu diện tích.
      if (kq?.loai === "giay_to") {
        anhLaGiayTo = true;
        const g = kq.giay_to;
        const soM2 = g?.dien_tich_m2 ?? null;
        const lech = lechDienTich(soM2, l?.area_m2);
        // SRS-5.1zzzzzn: lời nhận do AI viết (qua `loiNhanGiayToHopLe`); diện tích LỆCH thì câu hỏi xác nhận + báo admin giữ soạn sẵn.
        const loiAi = lech !== null && lech > 5 ? null : loiNhanGiayToHopLe((kq as { loi_nhan?: string | null }).loi_nhan, soM2, Number(l?.area_m2) || null);
        const cau: string[] = [loiAi ?? `Em nhận được ảnh ${g?.loai_giay ?? "giấy tờ"} rồi ạ, em cất riêng, không đưa lên web.`];
        if (g && !soM2 && !g?.dia_chi && !loiAi) {
          cau.push(`Ảnh này hơi mờ hoặc thiếu trang sơ đồ thửa đất, nếu tiện ${cachGoi} chụp giúp em trang 2-3 bên trong rõ nét hơn xíu nha để em lấy đúng kích thước ạ.`);
        }
        if (soM2 && !l?.area_m2) {
          const { error: dtErr } = await ghiFact(client, {
            p_listing_id: id, p_question: "dien_tich", p_answer: `${soM2}m2`, p_source: "so_do_ocr",
          });
          if (dtErr) await ghiLoi(client, "chat-reply ghi_fact_listing(ocr dien tich)", dtErr.message);
          if (!loiAi) cau.push(`Sổ ghi ${soM2}m2, em lấy số đó làm diện tích nha.`);
        } else if (lech !== null && lech > 5) {
          cau.push(`Sổ ghi ${soM2}m2 mà mình đang ghi ${l?.area_m2}m2, ${cachGoi} xác nhận giúp em số nào đúng ạ?`);
          await Promise.all([
            ghiFact(client, {
              p_listing_id: id, p_question: "bo_sung",
              p_answer: `sổ ghi ${soM2}m2, lệch ${lech}% so với ${l?.area_m2}m2 chủ nhà nói (OCR)`, p_source: "so_do_ocr",
            }),
            client.from("reminders").insert({
              kind: "escalation", listing_id: id, due_at: new Date().toISOString(),
              note: `📐 Ảnh sổ tin ${pendingReq?.listings?.code ?? ""} ghi ${soM2}m2, chủ nhà nói ${l?.area_m2}m2 (lệch ${lech}%). Bot đã hỏi lại chủ; admin soát ảnh ở kho riêng.`,
            }),
          ]);
        } else if (soM2) {
          if (!loiAi) cau.push(`Sổ ghi ${soM2}m2, khớp với số em đã ghi.`);
        }
        if (g?.dia_chi) {
          const { error: dcErr } = await ghiFact(client, {
            p_listing_id: id, p_question: "bo_sung", p_answer: `địa chỉ trên sổ: ${g.dia_chi}`, p_source: "so_do_ocr",
          });
          if (dcErr) await ghiLoi(client, "chat-reply ghi_fact_listing(ocr dia chi)", dcErr.message);
        }
        // SRS-5.1zzzzzs (chủ dự án 13/10: "người ta gửi ảnh nó biết sổ các thứ mà, làm sao cho nó biết sổ đỏ sổ hồng khác nhau"): loại sổ
        // đọc từ TIÊU ĐỀ bìa là câu trả lời pháp lý — ghi ô pháp lý đúng chữ ("sổ đỏ" ≠ "sổ hồng", bìa ghi cùng sử dụng → ", đồng sở hữu")
        // khi tin CHƯA có pháp lý (chủ nhà đã nói chữ gì thì giữ chữ đó), đóng câu pháp lý đang treo. Không ghi tên người.
        const loaiSo = (g?.loai_giay ?? "").trim().toLowerCase();
        if (/^sổ (?:hồng|đỏ)$/.test(loaiSo)) {
          const { data: plCu, error: plErr } = await client.from("listing_facts").select("id").eq("listing_id", id).eq("question", "phap_ly").limit(1);
          if (plErr) await ghiLoi(client, "chat-reply listing_facts(ocr phap ly)", plErr.message);
          if (!plErr && !(plCu ?? []).length) {
            const phapLySo = `${loaiSo}${(g as { dong_so_huu?: boolean | null })?.dong_so_huu === true ? ", đồng sở hữu" : ""}`;
            const { error: plGhi } = await ghiFact(client, { p_listing_id: id, p_question: "phap_ly", p_answer: phapLySo, p_source: "so_do_ocr" });
            if (plGhi) await ghiLoi(client, "chat-reply ghi_fact_listing(ocr phap ly)", plGhi.message);
            else {
              phapLyTuAnh = phapLySo;
              const treoPl = ds.find((p) => p.listing_id === id && p.question === "phap_ly");
              if (treoPl) {
                await client.from("info_requests").update({ status: "answered", answer: phapLySo, answered_at: new Date().toISOString() }).eq("id", treoPl.id);
              }
              if (!loiAi) cau.push(`Trên bìa là ${phapLySo}, em ghi pháp lý vậy nha.`);
            }
          }
        }
        ackAnh.push(cau.join("\n"));
      } else if (kq) {
        const nhan = LOAI_ANH_VI[kq.loai];
        const moTa = kq.mo_ta?.trim() ? `, ${kq.mo_ta.trim().replace(/\.$/, "").toLowerCase()}` : "";
        // 10/09 (chủ dự án): ảnh đã được model ĐỌC trước khi cất kho → khen bằng
        // điểm mạnh THẬT nhìn thấy (`khen`), không khen suông.
        const khen = (kq as { khen?: string | null }).khen?.trim()?.replace(/\.$/, "");
        khenAnhLuot = khen || null;
        ackAnh.push(khen
          ? `Em nhận được ảnh${nhan ? ` ${nhan}` : ""} rồi ạ. ${khen.charAt(0).toUpperCase() + khen.slice(1)}, khách lướt qua là để ý liền.`
          : `Em nhận được ảnh${nhan ? ` ${nhan}` : ""} rồi ạ${moTa}. Ảnh này giúp khách hình dung căn nhà nhanh hơn nhiều.`);
      } else {
        ackAnh.push("Dạ em nhận được ảnh rồi ạ, em bổ sung vào tin ngay.");
      }
      return false;
    };
    // Seller gửi ẢNH không kèm chữ → nhận ảnh rồi dừng; TUYỆT ĐỐI không coi chuỗi
    // rỗng là "câu trả lời" cho câu hỏi đang chờ (từng làm mất fact pháp lý).
    // ─── SRS-5.1zzj/zzk/zzl: FILE (PDF / CSV / XLSX) hoặc LINK người bán gửi — chỉ nhánh người bán; ảnh thường vẫn đi `nhanAnh`.
    // Link tới mạng xã hội / trang tin / bản đồ thì bỏ qua (không phải tài liệu để đọc).
    {
      const linkTrongChu = fileUrl || imageUrl
        ? []
        : timLinkTrongChu(text).filter((u) => !anhHopLe(u) && u !== linkUrl && !/facebook\.com|fb\.com|youtube\.com|youtu\.be|tiktok\.com|nhadat\.cc|batdongsan\.com|mogi\.vn|google\.com\/maps|maps\.app\.goo\.gl|zalo\.me/i.test(u));
      const nguonTep = [
        ...(fileUrl ? [{ url: fileUrl, ten: fileName, kieu: "file" as const }] : []),
        ...(linkUrl && !/facebook\.com|youtube\.com|tiktok\.com|google\.com\/maps|maps\.app\.goo\.gl/i.test(linkUrl) ? [{ url: linkUrl, ten: null, kieu: "link" as const }] : []),
        ...linkTrongChu.slice(0, 2).map((u) => ({ url: u, ten: null, kieu: "link" as const })),
      ];
      if (nguonTep.length && !humanActive) return await nhanTepVaLink(nguonTep);
    }
    if (!text && imageUrl) {
      const idNeoAnh = pendingReq?.listing_id ?? sellerRow.active_listing_id ?? null;
      const nham = await nhanAnh(idNeoAnh);
      if (nham === "tai_lieu") return await traLoiSeller([], { anh: true, tai_lieu_du_an: true });
      if (nham) return await traLoiSeller([], { anh: true, anh_nham: true });
      // 01/10/2026 (chủ dự án test Zalo: album 4 ảnh → 4 lần "🤖 Không bóc tách được gì" + 4 câu khen; "gộp lại khen 1 2 câu
      // thôi, nhận ảnh cần hỏi cái gì nữa thì hỏi"): mỗi ảnh của album là một lượt gọi chạy SONG SONG. Ảnh nào cũng vào kho,
      // nhưng chỉ lượt ảnh CUỐI của đợt trả lời: chờ một nhịp, có tin chủ nhà mới hơn thì lượt này im (lượt sau lo).
      const choAlbum = Number((globalThis as { __choAlbumMs?: number }).__choAlbumMs ?? 8000);
      if (choAlbum > 0) await new Promise((r) => setTimeout(r, choAlbum));
      let soAnhDot = 1;
      if (lucTinChu) {
        const { data: sauAnh, error: sauErr } = await client.from("messages").select("id")
          .eq("conversation_id", convSId).eq("sender", "seller").gt("created_at", lucTinChu).limit(1);
        if (sauErr) await ghiLoi(client, "chat-reply gop album (tin sau)", sauErr.message);
        else if ((sauAnh ?? []).length) {
          ackAnh = [];
          return await traLoiSeller([], { anh: true, anh_gop: "luot_sau_tra_loi" });
        }
        // Đếm ảnh của đợt: tin chủ nhà liền trước, cách nhau ≤ 2 phút, đều là ảnh trơn.
        const { data: dot, error: dotErr } = await client.from("messages").select("sender, body, created_at")
          .eq("conversation_id", convSId).lte("created_at", lucTinChu)
          .gte("created_at", new Date(Date.parse(lucTinChu) - 120_000).toISOString())
          .order("created_at", { ascending: false }).limit(30);
        if (dotErr) await ghiLoi(client, "chat-reply gop album (dem anh)", dotErr.message);
        else {
          soAnhDot = 0;
          for (const m of (dot ?? []) as Array<{ sender: string; body: string | null }>) {
            if (m.sender !== "seller" || !/\[ảnh: /.test(m.body ?? "") || (m.body ?? "").replace(/\[ảnh: [^\]]*\]/g, "").replace(/\[[^\]]*\]/g, "").trim()) break;
            soAnhDot++;
          }
          soAnhDot = Math.max(1, soAnhDot);
        }
      }
      // Chủ dự án 01/10: "tin nhắn cho người test, đã bóc tách ảnh bếp phòng tắm,... và tin nhắn dưới khen đẹp là được" —
      // 🤖 liệt kê loại ảnh của cả đợt (đọc `listing_media` vừa cất), dưới là MỘT câu khen. Ảnh giấy tờ giữ lời đối chiếu sổ.
      let loaiDot: string[] = [];
      if (idNeoAnh) {
        const tuDot = lucTinChu ? new Date(Date.parse(lucTinChu) - 120_000).toISOString() : new Date(Date.now() - 120_000).toISOString();
        const { data: md, error: mdErr } = await client.from("listing_media").select("media_type").eq("listing_id", idNeoAnh).gte("created_at", tuDot);
        if (mdErr) await ghiLoi(client, "chat-reply gop album (loai anh)", mdErr.message);
        loaiDot = [...new Set(((md ?? []) as Array<{ media_type: string }>).map((m) => (LOAI_ANH_VI as Record<string, string>)[m.media_type] ?? "").filter(Boolean))];
      }
      if (!(anhLaGiayTo as boolean)) {
        const khenL = khenAnhLuot as string | null; // gán trong `nhanAnh` (closure) — TS thu hẹp nhầm thành null
        const khenGon = khenL ? `, ${khenL.charAt(0).toLowerCase()}${khenL.slice(1)}` : "";
        ackAnh = [`Dạ em nhận được ảnh${loaiDot.length === 1 ? ` ${loaiDot[0]}` : ""} rồi ạ${khenGon}.`];
      }
      // Hỏi tiếp câu đang chờ (câu "gửi ảnh" thì nhanAnh đã đóng) — nhận ảnh xong không để hội thoại đứng.
      // SRS-5.1zzzzzs: câu pháp lý vừa được bìa sổ trả lời trong chính lượt này → không nhắc lại điều vừa đọc trên bìa.
      const qAnh = pendingReq && pendingReq.question !== "hinh_anh" && pendingReq.listing_id === idNeoAnh && !(phapLyTuAnh && pendingReq.question === "phap_ly") ? pendingReq.question : null;
      const cauSauAnh0 = qAnh
        ? cauHoiMau(qAnh, cachGoi, pendingReq?.listings?.property_type, pendingReq?.listings?.district, pendingReq?.listings?.deal, pendingReq?.listings?.location_raw)
        : null;
      // SRS-5.1zzzzzn (test Zalo 13/10/2026: ba lượt ảnh liền, lượt nào cũng "Bản nháp ở trên … nhắn ok là em đăng liền ạ."): câu treo
      // nhắc lại sau ảnh chỉ khi mấy tin bot gần nhất chưa nói đúng câu đó — chủ nhà đang gửi ảnh, không cần nghe lại mỗi tấm.
      const cauSauAnh = cauSauAnh0 && !lichSuRows.filter((m) => !laTinNguoi(m.sender)).slice(-4).some((m) => (m.body ?? "").includes(cauSauAnh0)) ? cauSauAnh0 : null;
      return await traLoiSeller(cauSauAnh ? [cauSauAnh] : [], { anh: true, so_anh: soAnhDot, anh_loai: loaiDot, ...(phapLyTuAnh ? { anh_phap_ly: phapLyTuAnh } : {}), ...(qAnh ? { reask: qAnh } : {}) });
    }
    // Soát 01/09 (vai người bán): ảnh KÈM CHÚ THÍCH từng rơi mất — chữ là câu
    // trả lời, ảnh vẫn phải vào kho. Neo căn theo thứ tự FR-157.
    if (!wantsSell && imageUrl) {
      await nhanAnh(pendingReq?.listing_id ?? sellerRow.active_listing_id ?? null);
    }
    // ─── FR-177 c: BẢN NHÁP TIN + "như vậy được chưa?".
    // Tiền định, KHÔNG model: số liệu trong bản nháp phải đúng từng chữ với
    // cột — model chỉ được nói, không được bịa số. Điểm đầy đủ do `diem_tin`
    // (DB) chấm; dưới 70 thì chưa gửi nháp, trả về danh sách còn thiếu để
    // tầng trên hỏi tiếp. Mở câu chờ `duyet_tin` để lượt sau biết chủ nhà đang
    // trả lời bản nháp chứ không phải một câu hỏi thông số.
    type DiemTin = { diem: number; chi_tiet: Record<string, number>; thieu: string[]; co_anh: boolean; so_anh?: number };
    const goiYTiemNang = (l: SpecRow & { property_type?: string | null; bedrooms?: number | null }): string | null => {
      if (l.property_type === "chung_cu") return "ở gia đình hoặc cho thuê";
      if (l.property_type === "mat_bang") return "kinh doanh, mở shop, văn phòng";
      if (l.property_type === "phong_tro") return "cho thuê";
      if (l.access_type === "mat_tien" || (l.alley_width_m ?? 0) >= 4) return "ở kết hợp kinh doanh hoặc cho thuê";
      if ((l.floors ?? 0) >= 3 || (l.bedrooms ?? 0) >= 3) return "ở gia đình đông người hoặc cho thuê CHDV";
      return null;
    };
    // 21/09/2026 (bắn thật mau-tdt): "sổ hồng riêng, hoàn công đủ. mà em là người hay máy vậy?" → đủ điểm,
    // bản nháp gửi luôn và câu hỏi của chủ nhà bị NUỐT. `truoc` = bong bóng đứng trước bản nháp (đáp án
    // tiền định cho câu hỏi ngược).
    // FR-234 (chủ dự án 27–28/09/2026: "mấy cái mày ko ghi được vào db thì để AI nó xét qua … sau nó tự bóc ra luôn"): trước
    // khi soạn bản nháp, AI đọc lại các GHI CHÚ chủ nhà (fact `bo_sung` nguồn chat, FR-233) chưa đọc lần nào — cả cụm, không
    // có câu đang hỏi — rồi ghi vào ô CÒN TRỐNG (qua đúng lớp kiểm bằng chứng `kiemDeXuat`; không bao giờ đè ô đã có). Chỉ
    // chạy khi công tắc `boc_tach_ai` là ghi / chinh; ghi chú đã đọc đánh dấu trong `boc_tach.ghi_chu_da_doc`.
    async function docLaiGhiChu(listingId: string): Promise<void> {
      if (!anthropicS) return;
      try {
        const cheDo = cheDoBocAi ? await cheDoBocAi : String((await client.rpc("cau_hinh", { p_key: "boc_tach_ai" })).data ?? "tat").trim();
        if (cheDo !== "ghi" && cheDo !== "chinh" && cheDo !== "ai") return;
        const [{ data: lRow, error: lErr }, { data: fRows, error: fErr }] = await Promise.all([
          client.from("listings").select("boc_tach").eq("id", listingId).maybeSingle(),
          client.from("listing_facts").select("id, question, answer, source").eq("listing_id", listingId),
        ]);
        if (lErr || fErr) { await ghiLoi(client, "chat-reply doc lai ghi chu(doc)", (lErr ?? fErr)!.message); return; }
        const daDoc = ((lRow?.boc_tach as { ghi_chu_da_doc?: unknown } | null)?.ghi_chu_da_doc as string[] | undefined) ?? [];
        const facts = (fRows ?? []) as Array<{ id: string; question: string; answer: string | null; source: string | null }>;
        const ghiChu = facts.filter((f) => f.question === "bo_sung" && f.source === "seller_chat" && (f.answer ?? "").trim() && !daDoc.includes(f.id));
        if (!ghiChu.length) return;
        const coRoi = new Set(facts.filter((f) => f.question !== "bo_sung").map((f) => f.question));
        const tinGop = ghiChu.map((f) => (f.answer ?? "").trim()).join(". ").slice(0, 1200);
        const kq = await bocRaoBangModel(anthropicS as unknown as Parameters<typeof bocRaoBangModel>[0], MODEL, tinGop, null, null, null);
        await doTien(client, kq.usage as Parameters<typeof doTien>[1]);
        const ai = docAiChinh(kiemDeXuat(kq.truong, tinGop).dat, null);
        for (const g of ai.ghi) {
          if (coRoi.has(g.question) || g.question === "bo_sung") continue;
          const { error: gErr } = await ghiFact(client, { p_listing_id: listingId, p_question: g.question, p_answer: g.answer, p_source: NGUON_AI, goc: g.goc });
          if (gErr) await ghiLoi(client, "chat-reply doc lai ghi chu(ghi)", gErr.message);
          else coRoi.add(g.question);
        }
        const { error: dErr } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { ghi_chu_da_doc: [...daDoc, ...ghiChu.map((f) => f.id)] } });
        if (dErr) await ghiLoi(client, "chat-reply doc lai ghi chu(danh dau)", dErr.message);
      } catch (e) {
        await ghiLoi(client, "chat-reply doc lai ghi chu", e);
      }
    }
    // SRS-5.1zzzd (07/10/2026, chủ dự án: "phần bóc tách có vấn đề… để AI bóc tách kiểu dify nhiều hơn… đến khi ra tin thì AI đọc
    // và lọc rác"): AI CHỐT TIN trước mỗi bản nháp. Bóc tách từng lượt (cơ chế 1) ghi ngay và các lớp code sau nó dồn lỗi theo lượt
    // (địa chỉ rác, bổ sung rác, loại nhà không đổi); bước này là cơ chế 2 — đọc TOÀN BỘ tin chủ nhà một lần, đưa trạng thái cuối
    // qua ĐÚNG bộ bóc tách + lớp kiểm trích dẫn hiện có (`kiemDeXuat` → `docAiChinh`). Giá trị qua kiểm mà khác giá trị đang ghi →
    // AI thắng (địa chỉ qua `chonViTri` để không mất số nhà); AI để trống thì GIỮ, không xoá. Bổ sung: ý thêm AI lọc (`kiemKienThuc`)
    // ghi nguồn ai_kiem, bản nháp bỏ ghi chú thô `seller_chat`. Chỉ chạy ở chế độ `ai` (production); người rao nhiều căn: xem
    // SRS-5.1zzzzzzz21 ngay dưới. Không chốt được → `docLaiGhiChu` như cũ. Một lượt model mỗi bản nháp.
    async function chotTinAi(listingId: string): Promise<boolean> {
      if (!anthropicS) return false;
      try {
        // `cheDoBocAi` trả "chinh" cho công tắc `ai` (đường câu treo dùng chung) — chế độ thật nằm ở `laCheDoAi`, đặt khi nó chạy xong.
        const laAi = cheDoBocAi ? (await cheDoBocAi, laCheDoAi) : String((await client.rpc("cau_hinh", { p_key: "boc_tach_ai" })).data ?? "tat").trim() === "ai";
        if (!laAi) return false;
        // SRS-5.1zzzzzzz21 (18/10/2026) — MỞ CHỐT TIN CHO NGƯỜI RAO NHIỀU CĂN (bỏ chặn cứng `nhieuCan`). Lý do guard cũ: lượt chốt đọc CẢ hội
        // thoại (`tinChuNhaGoc()`) rồi dồn vào MỘT căn — nhiều căn thì fact căn B lẫn sang căn A. Nay vẫn chốt theo đúng
        // `listingId` đang soạn, nhưng khi nhiều căn thì CHỈ đọc tin chủ nhà VỪA nhắn lượt này (đã qua `gan-manh` định tuyến
        // về đúng căn), KHÔNG đọc lại cả hội thoại — facts từng căn đã lưu riêng, lớp dedup (`giaTriKhongDoi`,
        // `cungNoiDungDiaChi`, `docTien`) vẫn chặn ghi đè chéo. Một căn (cũ) giữ nguyên: đọc cả hội thoại để vá fact rớt.
        const nguonChot = nhieuCan ? [thayLienHe(text.trim(), "[liên hệ]")] : [...tinChuNhaGoc(), thayLienHe(text.trim(), "[liên hệ]")];
        const tinKhach = nguonChot.filter((b) => b && !laTinRongNghia(b));
        if (!tinKhach.length) return false;
        const tinGop = tinKhach.map((b) => b.replace(/\s*\n+\s*/g, " / ")).join("\n").slice(-6000);
        const [{ data: lRow, error: lErr }, { data: fRows, error: fErr }] = await Promise.all([
          client.from("listings").select(`${COT_TRUOC_LUOT}, boc_tach`).eq("id", listingId).maybeSingle(),
          client.from("listing_facts").select("question, answer, source, created_at").eq("listing_id", listingId).order("created_at", { ascending: false }),
        ]);
        if (lErr || fErr) { await ghiLoi(client, "chat-reply chot tin(doc)", (lErr ?? fErr)!.message); return false; }
        if (!lRow) return false;
        // SRS-5.1zzzzo (độ trễ, bắn production 09/10): lượt chốt đọc lại TOÀN BỘ tin chủ nhà — một lượt model lớn trước MỖI bản nháp,
        // kể cả khi từ lần chốt trước tới giờ tin không có fact nào mới (khách chỉ hỏi phí, chỉ gật). Không fact mới = đầu vào của lượt
        // chốt về căn này không đổi so với lần trước → giữ kết quả lần trước (đã ghi), không gọi lại. Đếm fact thay vì so giờ: giờ ghi
        // `chot_ai.luc` là đồng hồ edge, `created_at` là đồng hồ DB.
        const chotCu = ((lRow as { boc_tach?: { chot_ai?: { so_fact?: unknown } } | null }).boc_tach?.chot_ai?.so_fact);
        if (typeof chotCu === "number" && chotCu === (fRows ?? []).length) {
          console.log("chat-reply: chot tin — khong co fact moi tu lan chot truoc, bo qua luot model");
          return true;
        }
        const kq = await bocRaoBangModel(anthropicS as unknown as Parameters<typeof bocRaoBangModel>[0], MODEL, tinGop, null, null, null, true, null, true);
        await doTien(client, kq.usage as Parameters<typeof doTien>[1]);
        if (!kq.ket) return false;
        const dat = kiemDeXuat(kq.truong, tinGop).dat;
        const ai = docAiChinh(dat, lRow as unknown as DongDb);
        const facts = (fRows ?? []) as Array<{ question: string; answer: string | null; source: string | null }>;
        const hienCo = new Map<string, string>();
        for (const f of facts) if (f.answer && !hienCo.has(f.question)) hienCo.set(f.question, f.answer);
        const gon = (x: string) => boDau(x).replace(/\s+/g, " ").trim();
        const sua: string[] = [];
        let soGhi = 0; // fact lượt chốt này ghi thêm — để `so_fact` của dấu chốt khớp số đếm lần sau
        for (const g of ai.ghi) {
          if (g.question === "bo_sung") continue;
          const lr = lRow as { property_type?: string | null; deal?: string | null; street?: string | null; location_raw?: string | null };
          const cu = g.question === "loai_bds" ? (lr.property_type && lr.property_type !== "chua_ro" ? lr.property_type : null)
            : g.question === "loai_giao_dich" ? lr.deal ?? null : hienCo.get(g.question) ?? (g.question === "vi_tri" ? lr.location_raw ?? null : null);
          const moi = g.question === "vi_tri" && cu ? (chonViTri(cu, g.answer) ?? g.answer) : g.answer;
          if (cu && gon(cu) === gon(moi)) continue;
          // SRS-5.1zzzzzzk: địa chỉ lượt chốt đọc ra chỉ khác bản đã ghi ở thứ tự / hoa thường ("đường huỳnh tấn phát số 1235" ↔ "1235 Huỳnh
          // Tấn Phát") → giữ bản đã ghi (đã qua từ điển đường, số nhà đứng trước), không ghi đè bằng bản thô.
          if (g.question === "vi_tri" && cu && cungNoiDungDiaChi(cu, moi)) continue;
          // SRS-5.1zzzh: giá cùng số tiền, chỉ khác cách viết ("21 tỉ 300 triệu" / "21 tỷ 300 triệu") → không ghi lại.
          if (cu && g.question === "gia" && docTien(cu) != null && docTien(cu) === docTien(moi)) continue;
          // SRS-5.1zzzzo: giá trị câu rao giữ ở CỘT (phường, giá, diện tích, số tầng — tạo tin không ghi fact cho chúng) là "đang có", không
          // phải "trống": so qua MỘT chủ `giaTriKhongDoi` (cột + fact). Bản trước chỉ so fact → mỗi bản nháp ghi lại cả bốn ô.
          if (giaTriKhongDoi(g.question, moi, lRow as Parameters<typeof giaTriKhongDoi>[2], Object.fromEntries(hienCo))) continue;
          const { error: gErr, boQua: gBo } = await ghiFact(client, { p_listing_id: listingId, p_question: g.question, p_answer: moi, p_source: NGUON_AI, goc: g.goc });
          if (gErr) await ghiLoi(client, "chat-reply chot tin(ghi)", gErr.message);
          else if (!gBo) { sua.push(g.question); soGhi++; }
        }
        if (ai.tenDuong && ai.tenDuong !== (lRow as { street?: string | null }).street) {
          const { error: sErr } = await client.from("listings").update({ street: ai.tenDuong }).eq("id", listingId);
          if (sErr) await ghiLoi(client, "chat-reply chot tin(duong)", sErr.message);
          else sua.push("ten_duong");
        }
        // SRS-5.1zzzzzg (test Zalo 12/10: "📝 Thêm: rộng thoải mái · đường lớn 2 chiều em rộng thoải mái"): ý thêm của lượt chốt so với ý thêm
        // AI đã ghi (từng lượt lẫn lượt chốt trước) theo CÙNG Ý (`trungY` qua `boKeRieng`), không theo chuỗi bằng nhau. Ý chữ khách ghi tay
        // (seller_chat) không tính: đó có thể là rác lượt chốt đang sửa ("không có, mặt tiền đẹp" → "mặt tiền đẹp", SRS-5.1zzzd).
        const yCu = facts.filter((f) => f.question === "bo_sung" && f.source === NGUON_AI && f.answer).map((f) => f.answer as string);
        // SRS-5.1zzzzy: ý chủ nhà đã xin bỏ khỏi dòng "Thêm" không quay lại ở lượt chốt sau (lượt này đọc lại cả hội thoại cũ).
        const yDaBo = ((lRow as { boc_tach?: { y_da_bo?: unknown } | null }).boc_tach?.y_da_bo as string[] | undefined) ?? [];
        const yThem = boKeRieng(kiemKienThuc(kq.kienThuc ?? [], tinGop, dat,
          facts.filter((f) => f.question !== "bo_sung" && f.answer).map((f) => f.answer as string)).filter((y) => !yCu.some((c) => gon(c) === gon(y))),
          [...yCu, ...yDaBo]); // chuỗi bằng nhau vẫn là trùng — `trungY` bỏ qua cụm toàn hư từ ("đang ở")
        for (const y of yThem) {
          const { error: yErr } = await ghiFact(client, { p_listing_id: listingId, p_question: "bo_sung", p_answer: y, p_source: NGUON_AI });
          if (yErr) await ghiLoi(client, "chat-reply chot tin(y them)", yErr.message);
          else soGhi++;
        }
        const { error: bErr } = await client.rpc("ghi_boc_tach", { p_listing_id: listingId, p: { chot_ai: { luc: new Date().toISOString(), sua, y_them: yThem.length, so_fact: (fRows ?? []).length + soGhi } } });
        if (bErr) await ghiLoi(client, "chat-reply chot tin(dau)", bErr.message);
        if (sua.length) console.log("chat-reply: AI chot tin sua", sua.join(", "));
        return true;
      } catch (e) {
        await ghiLoi(client, "chat-reply chot tin", e);
        return false;
      }
    }
    // Khai báo `function` (được nâng lên đầu khối): nhánh bỏ ý dòng "Thêm" và nhánh gán mảnh sang căn khác (SRS-5.1zzzzy, ở trên) gọi
    // bản nháp trước chỗ này. Chỉ nhánh `dangLuon` đọc `dongHangRao` (khai báo sau gán mảnh) — nơi gọi sớm không bật `dangLuon`.
    async function guiBanNhap(
      listingId: string, extra: Record<string, unknown>, lai = false, truoc: string[] = [], dangLuon = false,
    ): Promise<Awaited<ReturnType<typeof traLoiSeller>> | string[]> {
      // SRS-5.1zzzzzq: `chi_xem` — khách xin xem lại nội dung tin: dựng bản tin từ DB, không chốt AI, không mở câu duyệt, không đổi trạng thái.
      const chiXem = extra.chi_xem === true;
      const daChot = chiXem ? true : await chotTinAi(listingId);
      if (!daChot) await docLaiGhiChu(listingId);
      const [{ data: l }, { data: dt, error: dErr }, { data: facts }] = await Promise.all([
        client.from("listings")
          .select(`code, location_raw, ward, district, deal, area_m2, price_raw, price_vnd, bedrooms, property_type, gap, negotiable, furnishing, floor, rear_width_m, rent_income_vnd, boc_tach, project_id, ${SPEC_COLS}`)
          .eq("id", listingId).maybeSingle(),
        client.rpc("diem_tin", { p_listing_id: listingId }),
        client.from("listing_facts").select("question, answer, source, created_at")
          .eq("listing_id", listingId)
          .order("created_at", { ascending: false }),
      ]);
      if (dErr) await ghiLoi(client, "chat-reply diem_tin", dErr.message);
      // SRS-5.1zzzd: đã chốt tin → "📝 Thêm" chỉ lấy ý thêm AI đã lọc, bỏ ghi chú thô chủ nhà (rác "đúng rồi e…" từng vào đây).
      const factsNhap = ((facts ?? []) as Array<{ question: string; answer: string | null; source?: string | null }>)
        .filter((f) => !(daChot && f.question === "bo_sung" && f.source === "seller_chat"));
      // SRS-5.1zzzzzzz13 (Zalo thật 14/10 10:00: căn hộ đã gắn dự án Conic Boulevard trong kho, bản nháp không có tên chung cư ở tiêu đề lẫn 📍 —
      // chỉ ô `du_an_ten` mới được in). Tên dự án có hai nguồn cùng nghĩa: lời chủ nhà (ô) và dự án kho đã gắn. Ô của chủ nhà thắng; không có thì
      // dùng tên dự án kho — một chỗ, mọi dòng của bản nháp (tiêu đề, 📍) đọc cùng ô.
      const pidNhap = (l as { project_id?: string | null } | null)?.project_id ?? null;
      if (pidNhap && (l as { property_type?: string | null }).property_type === "chung_cu" && !factsNhap.some((f) => f.question === "du_an_ten" && f.answer?.trim())) {
        const { data: pj, error: pjErr } = await client.from("projects").select("name").eq("id", pidNhap).maybeSingle();
        if (pjErr) await ghiLoi(client, "chat-reply ten du an (ban nhap)", pjErr.message);
        const tenKho = tenDuAnKho((pj as { name?: string | null } | null)?.name);
        if (tenKho) factsNhap.push({ question: "du_an_ten", answer: tenKho, source: "du_an_kho" });
      }
      const d = (dt ?? null) as DiemTin | null;
      if (!l || !d) return [];
      // 20/09/2026 (bắn thật mau-y-D): "giá 250 triệu/m2 thương lượng" — price_raw có chữ nhưng
      // parse_vnd không ra số → tin không bao giờ lên kệ, mà điểm vẫn 75 và bản nháp vẫn gửi với
      // "giá 250…". Chưa đọc ra GIÁ CẢ CĂN thì chưa gửi nháp: báo thiếu giá để hỏi lại.
      const lg = l as { price_vnd?: number | null; price_raw?: string | null; area_m2?: number | null; ward?: string | null; street?: string | null; location_raw?: string | null };
      if (lg.price_vnd == null) {
        // FR-239 f (phát lại test 28/09): tin đất báo thiếu "giá cả căn" — đất là "cả lô".
        const caGi = /^dat/.test(String((l as { property_type?: string | null }).property_type ?? "")) ? "cả lô" : "cả căn";
        const thieuGia = `giá ${caGi} bằng con số${lg.price_raw ? ` (em chưa đọc ra số từ "${lg.price_raw}")` : ""}`;
        return [thieuGia, ...(d.thieu ?? []).filter((t) => !/^giá/i.test(t))];
      }
      // Khớp cơ chế anh Luân (SUMMARY_READY_COMPLETENESS = 0.55): Có đủ bộ nhận diện (giá + diện tích + địa chỉ đường/phường)
      // thì từ điểm ≥ 50 đã kích hoạt bản nháp sớm để giữ chân chủ nhà, không bắt đợi tới 70 điểm mới được thấy bài rao.
      const coDinhDanhCoBan = !!lg.price_vnd && (lg.area_m2 != null && lg.area_m2 > 0) && !!(lg.ward || lg.street || lg.location_raw);
      const nguongDiemNhap = coDinhDanhCoBan ? 50 : 70;
      if (d.diem < nguongDiemNhap && !chiXem) return d.thieu ?? [];
      // SRS-5.1zzzzzl: tiêu đề chủ nhà gửi lúc duyệt (đã qua kiểm trích dẫn khi ghi) + câu khen AI viết trên chính bản tin rồi soát.
      const tieuDeKhach = (() => { const v = (l as { boc_tach?: { tieu_de_khach?: unknown } | null }).boc_tach?.tieu_de_khach; return typeof v === "string" && v.trim() ? v.trim() : null; })();
      const thamNhap = { l: l as TinNhapRow, facts: factsNhap as FactNhap[], diem: d.diem, thieu: d.thieu ?? [], soAnh: d.so_anh ?? 0, cauTD, tieuDeKhach };
      // Gọi ngay trước khi gửi (không gọi khi nhánh dưới không gửi bản nháp).
      const yThemNhap = (factsNhap as FactNhap[]).filter((f) => f.question === "bo_sung" && f.answer).map((f) => String(f.answer).replace(/\s+/g, " ").trim());
      const layKhen = () => khenChoNhap(soanTinNhapHaiBong({ ...thamNhap, lai, daDang: dangLuon }).than, yThemNhap);
      if (chiXem) {
        const { data: ttXem } = await client.from("listings").select("status").eq("id", listingId).maybeSingle();
        const daDangXem = !!ttXem && ttXem.status !== "cho_thong_tin";
        // Chủ dự án 13/10: "không phải nháp mà là bên em sẽ đăng như vậy nhé".
        const nhapXem = soanTinNhapHaiBong({ ...thamNhap, lai: false, daDang: true, tieuDeDau: `📋 Bên em ${daDangXem ? "đang đăng" : "sẽ đăng"} như vậy nhé ${cachGoi}:` });
        const { chi_xem: _cx, ...extraXem } = extra;
        return await traLoiSeller([nhapXem.than], { ...extraXem, xem_tin: true, diem: d.diem });
      }
      // Chủ dự án 09/09/2026 tối: "bản nháp gửi lại khách phải ghi rõ ràng và tốt
      // như MỘT TIN RAO THẬT, nhưng không bịa". Mọi dòng dưới đây đều từ cột hoặc
      // fact chủ nhà đã nói (fact mới nhất mỗi khoá); không có thì không có dòng,
      // KHÔNG đoán tiềm năng thay chủ nhà.
      // 12/09/2026: bản nháp dựng ở `_shared/tin-nhap.ts` — viết như TIN RAO
      // THẬT theo mẫu tin lẻ mogi.vn (tiêu đề gộp · địa chỉ · GIÁ · thông số),
      // và tách ra để `scripts/xem-tin-nhap.mjs` dựng thử trên dữ liệu thật mà
      // không phải deploy, `bot/tests/tin-nhap-rao.mjs` kiểm offline.
      // 24/09/2026 (chủ dự án: "nếu khách nói kiểu đăng đi thì ko hỏi nữa đưa tin luôn"): chủ đã nói "đăng đi" và tin đủ
      // điểm → đóng dấu duyệt NGAY (trigger đưa lên kệ), gửi tin đã đăng, không hỏi "ổn chưa". Chưa lên kệ được (thiếu
      // phường / diện tích — `listing_du_dang_tin`) thì nói thật còn thiếu gì; dấu duyệt giữ lại, có đủ là tự lên kệ.
      if (dangLuon) {
        // SRS-5.1zzzzzzu: "đăng giúp chị nội dung này nhé" rồi bài rao tới sau → có tin chủ nhà mới hơn thì KHÔNG đăng, nhường lượt
        // (lượt tin cuối đọc nội dung và gửi bản nháp như thường). Kiểm ngay trước khi đóng dấu — sau lượt chốt tin AI ~10 giây.
        if (kiemTinMoiHon && await kiemTinMoiHon().catch(() => false)) {
          console.log("chat-reply: dang luon nhung co tin moi hon → nhuong, khong dang");
          const nhapRut = await rutCauMoLuot();
          return await hoanTat({ reply: null, replies: [], role: "seller", superseded: true, superseded_luc: "truoc_dang", ...(nhapRut ? { nhap_rut: true } : {}) });
        }
        const { error: dlErr } = await client.from("listings").update({ chu_duyet_at: new Date().toISOString() }).eq("id", listingId);
        if (dlErr) await ghiLoi(client, "chat-reply dang luon", dlErr.message);
        else daDuyetLuot = true;
        const { data: sau } = await client.from("listings").select("status, ward, area_m2").eq("id", listingId).maybeSingle();
        const { error: dtErr } = await client.from("info_requests").update({ status: "answered", answer: "đăng đi", answered_at: new Date().toISOString() })
          .eq("listing_id", listingId).eq("question", "duyet_tin").eq("status", "pending");
        if (dtErr) await ghiLoi(client, "chat-reply dang luon(dong duyet)", dtErr.message);
        if (sau && sau.status !== "cho_thong_tin") {
          const nhapDang = soanTinNhapHaiBong({ ...thamNhap, lai: false, daDang: true, ...(await layKhen()) });
          // SRS-5.1zzq: "đăng đi" lên kệ ngay cũng DẪN PHÍ một lần như nhánh duyệt thường (trước đây nhánh này quên).
          const cauDanPhiDL = daNoiPhiRoi() ? "" : cauBaoPhiLenKe((l as { deal?: string | null }).deal ?? dealNguoi);
          const dongHangDL = await dongHangRao();
          const xinDiemDL = cauDanPhiDL ? null : await xinChamDiem(listingId); // SRS-5.1zzzzzl
          return await traLoiSeller([...truoc, nhapDang.than, ...(nhapDang.duoi ? [nhapDang.duoi] : []), ...(nhapDang.hoi ? [nhapDang.hoi] : []), cauTD("dang_luon_cuoi") + (dongHangDL ? `\n${dongHangDL}` : "") + (cauDanPhiDL ? `\n${cauDanPhiDL}` : ""), ...(xinDiemDL ? [xinDiemDL] : [])],
            { ...extra, duyet: true, dang_luon: true, diem: d.diem, listing_status: sau.status, ...(cauDanPhiDL ? { dan_phi: true } : {}), ...(xinDiemDL ? { xin_danh_gia: true } : {}) });
        }
        // SRS-5.1zzy (chat thử 07/10: "anh không nhớ nữa em tự search xem, đăng đi" — tin có "đường Thạnh Lộc 41", Quận 12): đã có
        // tên đường thì TỰ TRA phường và hỏi xác nhận một câu; gật là ghi phường, dấu duyệt đã đóng nên tin tự lên kệ (`noiThieuDeDang`).
        const thieuDL = await noiThieuDeDang(listingId);
        return await traLoiSeller([...truoc, thieuDL.cau], { ...extra, dang_luon: true, ...thieuDL.meta });
      }
      // 13/10/2026: bản nháp HAI bong bóng — tin rao / phần nói với chủ nhà (`soanTinNhapHaiBong`).
      const tin = soanTinNhapHaiBong({ ...thamNhap, lai }).than;
      // 30/09/2026 (bắn thử bán lx-ban-292a): lời sửa không đổi dòng nào của bản nháp (vd "người đứng tên" không in trong nháp)
      // → từng gửi lại nguyên bản cũ kèm "Em sửa lại rồi". Thân nháp (trước dòng điểm) y hệt thì chỉ báo đã ghi.
      // Tin bot lưu có thể gộp nhiều bong bóng (🤖 … rồi 📋 …) — so từ dấu 📋.
      // Luật xưng hô đổi "anh/chị" → "anh chị" trước khi lưu — so sau khi bỏ "/" và gộp khoảng trắng.
      const thanNhap = (s: string) => s.slice(Math.max(0, s.indexOf("📋"))).split(/\n(?=Độ đầy đủ)/u)[0].replace(/\s*\/\s*/g, " ").replace(/\s+/g, " ").trim();
      if (lai && typeof extra.nhap_cu === "string" && thanNhap(extra.nhap_cu) === thanNhap(tin)) {
        const { nhap_cu: _bo, ...extraGon } = extra;
        return await traLoiSeller([`Dạ em ghi thêm rồi ạ. Bản nháp ở trên ${cachGoi} thấy được thì nhắn "ok" là em đăng liền ạ.`], { ...extraGon, loai_cau: "ghi_them" });
      }
      // 23505 = câu duyệt đã mở từ lượt trước (gửi lại bản nháp) — không phải sự cố.
      const { error: irErr } = await moCauTreo({
        listing_id: listingId, question: "duyet_tin", status: "pending",
      });
      if (irErr && irErr.code !== "23505") await ghiLoi(client, "chat-reply mo duyet_tin", irErr.message);
      const { nhap_cu: _nc, ...extraGui } = extra;
      const nhapHai = soanTinNhapHaiBong({ ...thamNhap, lai, ...(await layKhen()) });
      // SRS-5.1zzzzzzb: `nhap_cua` để đường nhường lượt biết câu duyệt nào vừa mở cho bản nháp này.
      return await traLoiSeller([...truoc, nhapHai.than, ...(nhapHai.duoi ? [nhapHai.duoi] : []), ...(nhapHai.hoi ? [nhapHai.hoi] : [])], { ...extraGui, ban_nhap: true, nhap_cua: listingId, diem: d.diem });
    }
    /**
     * SRS-5.1zzzzzzv (Zalo thật 14/10/2026 14:20, tin cho thuê Q8): chủ nhà dán bài rao vào tin CHƯA lên kệ lúc không có câu chờ →
     * đường bắt lời sửa (FR-164) ghi giá / phòng ngủ / diện tích rồi kết lượt bằng "Dạ em ghi giá 6 triệu, … rồi ạ." — không câu hỏi,
     * không bản nháp; đường fact rời chưa đủ điểm thì nói "Có khách quan tâm là em báo liền" như thể tin đã đăng. Tin chưa lên kệ thì
     * sau khi ghi luôn có MỘT việc kế: hỏi câu kế (tiền định) → hết câu thì gửi bản nháp → chưa đủ điểm thì nói thật còn thiếu gì và mở
     * câu cho mục thiếu đầu. Trả `null` khi tin đã lên kệ (lời ghi nhận đứng một mình là đúng). Khai báo `function` để đường sửa (ở trên
     * chỗ này) gọi được.
     */
    async function tiepSauGhi(
      listingId: string, khoaVuaGhi: string[], cauGhi: string, extra: Record<string, unknown>, truocNhap: string[] = [],
    ): Promise<Awaited<ReturnType<typeof traLoiSeller>> | null> {
      const { data: tin, error: tErr } = await client.from("listings")
        .select("id, status, can_chu_duyet, chu_duyet_at, property_type, district, deal").eq("id", listingId).maybeSingle();
      if (tErr) await ghiLoi(client, "chat-reply tiep sau ghi(doc tin)", tErr.message);
      if (!tin || !(tin.status === "cho_thong_tin" || (tin.can_chu_duyet && !tin.chu_duyet_at))) return null;
      const [{ data: thieu }, { data: hetHan }] = await Promise.all([
        client.from("listing_missing_facts").select("fact_key, priority, nhom").eq("listing_id", listingId).order("priority").limit(40),
        client.from("info_requests").select("question").eq("listing_id", listingId).eq("status", "expired"),
      ]);
      const hh = new Set((hetHan ?? []).map((q) => q.question));
      const ke = chonCauKe(khoaVuaGhi, (await thieuCoReNhanh(client, listingId, thieu, khoaVuaGhi, text)).filter((f) => !hh.has(f.fact_key) && f.nhom !== "sau_dang"));
      if (ke && ke !== "hinh_anh") {
        const { error: irErr } = await moCauTreo({ listing_id: listingId, question: ke, status: "pending" });
        if (irErr && irErr.code !== "23505") await ghiLoi(client, "chat-reply mo cau ke(tiep sau ghi)", irErr.message);
        return await traLoiSeller([`${cauGhi}\n${cauHoiMau(ke, cachGoi, tin.property_type, tin.district, tin.deal)}`], { ...extra, asked: ke });
      }
      const nhap = await guiBanNhap(listingId, extra, false, truocNhap);
      if (!Array.isArray(nhap)) return nhap;
      const khoaThieu = nhap.map((m) => khoaCuaMucThieu(m, tin.property_type)).find(Boolean) ?? null;
      if (khoaThieu) {
        const { error: kErr } = await moCauTreo({ listing_id: listingId, question: khoaThieu, status: "pending" });
        if (kErr && kErr.code !== "23505") await ghiLoi(client, "chat-reply mo cau thieu(tiep sau ghi)", kErr.message);
      }
      const thieuVan = nhap.slice(0, 2).join(" và ");
      return await traLoiSeller([
        `${cauGhi}\nTin mình chỉ cần thêm ${thieuVan || "vài thông tin"} là đủ điều kiện lên kệ ạ.${khoaThieu ? `\n${cauHoiMau(khoaThieu, cachGoi, tin.property_type, tin.district, tin.deal)}` : ""}`,
      ], { ...extra, thieu_de_dang: nhap.slice(0, 3), ...(khoaThieu ? { asked: khoaThieu } : {}) });
    }
    /**
     * SRS-5.1zzzy (bắn production 09/10/2026): HẾT câu để hỏi trước bản nháp → việc kế là MỘT: gửi bản nháp; chưa đủ điểm thì
     * mở ô chờ cho mục thiếu đầu tiên ứng được một ô (`khoaCuaMucThieu`, chữ `diem_tin` sinh ra — tất định) để bot hỏi nó.
     * Trước đây chỉ nhánh trả lời câu treo làm việc này; câu rao đủ ý ngay lượt đầu thì rơi vào lời model "báo sẽ đăng lên
     * web ngay" — hứa đăng mà tin vẫn `cho_thong_tin`, không nháp, không câu hỏi. Nhánh trả lời câu treo và nhánh câu rao gọi
     * chung hàm này; nhánh tin nhiều căn (chạy trước chỗ khai báo này) còn câu hứa "em soạn bản nháp" — ghi ở docs/07 SRS-5.1zzzy.
     */
    const hetCauTruocNhap = async (
      listingId: string, loai: string | null | undefined, extra: Record<string, unknown>, truoc: string[] = [],
      khoaVuaThoi: Set<string> = new Set(), dangTreo: Set<string> = new Set(),
    ): Promise<{ res: Awaited<ReturnType<typeof traLoiSeller>> } | { thieu: string[]; khoaMo: string | null }> => {
      const nhap = await guiBanNhap(listingId, extra, false, truoc);
      if (!Array.isArray(nhap)) return { res: nhap };
      const iMuc = nhap.findIndex((m) => { const k = khoaCuaMucThieu(m, loai); return !!k && !khoaVuaThoi.has(k); });
      const thieu = iMuc > 0 ? [nhap[iMuc], ...nhap.filter((_, i) => i !== iMuc)] : nhap;
      const khoaMo = iMuc >= 0 ? khoaCuaMucThieu(nhap[iMuc], loai) : null;
      if (khoaMo && !dangTreo.has(khoaMo)) {
        const { error: gErr } = await moCauTreo({ listing_id: listingId, question: khoaMo, status: "pending" });
        if (gErr && gErr.code !== "23505") await ghiLoi(client, "chat-reply mo cau thieu diem", gErr.message);
      }
      return { thieu, khoaMo };
    };
    /**
     * SRS-5.1zzzzzzd: câu rao có đáng gửi bản nháp NGAY không — công tắc `app_config.nhap_som` (mặc định bật, `tat` để về đường cũ),
     * `diem_tin` ≥ 70 và giá đã đọc ra số (bản nháp không gửi khi `price_vnd` trống — cùng luật `guiBanNhap`). Không gọi model, không đổi DB.
     */
    /** Ô CỨNG phải có trước khi nháp sớm: còn thiếu một trong các ô này thì hỏi như cũ (địa chỉ chưa chắc, hẻm / pháp lý / giá chưa có → bản nháp sai bản chất). */
    const KHOA_CUNG_TRUOC_NHAP = new Set(["vi_tri", "phuong", "quan", "loai_bds", "dien_tich", "dien_tich_dat", "gia", "phap_ly", "do_rong_hem", "loai_duong_vao", "ket_cau", "so_tang", "tho_cu"]);
    const nhapSomDuDiem = async (listingId: string): Promise<boolean> => {
      const { data: cd } = await client.rpc("cau_hinh", { p_key: "nhap_som" });
      if (String(cd ?? "").trim().toLowerCase() === "tat") return false;
      const [{ data: dt, error: dErr }, { data: l }] = await Promise.all([
        client.rpc("diem_tin", { p_listing_id: listingId }),
        client.from("listings").select("price_vnd").eq("id", listingId).maybeSingle(),
      ]);
      if (dErr) { await ghiLoi(client, "chat-reply diem_tin(nhap som)", dErr.message); return false; }
      const d = (dt ?? null) as { diem?: number } | null;
      const du = (d?.diem ?? 0) >= 70 && (l as { price_vnd?: number | null } | null)?.price_vnd != null;
      if (du) console.log("chat-reply: cau rao du diem, gui nhap ngay", d?.diem);
      return du;
    };
    // Tự kiểm 02/09: chủ nhà đang bị hỏi dở (pendingReq) mà nhắn RAO THÊM CĂN
    // KHÁC → bản cũ ghi cả câu rao làm CÂU TRẢ LỜI cho câu hỏi đang treo, vì
    // khối pendingReq đứng trước khối wantsSell và không hỏi gì thêm. Câu rao
    // thật KÈM dấu hiệu "căn khác" (thêm/nữa/căn khác, hoặc phường KHÁC phường
    // căn đang hỏi) thì đi tạo tin. "bán 5 tỷ nhà này" trả lời câu hỏi giá thì
    // không có dấu hiệu đó → vẫn là câu trả lời, không đẻ tin trùng.
    // 16/09/2026: đã xác nhận "căn khác" ở câu hỏi căn-cũ-hay-mới thì là rao MỚI dù không có
    // chữ thêm/nữa; câu có chi tiết lúc đang được xin chi tiết căn mới cũng vậy.
    // 17/09/2026 (Zalo thật): đang hỏi phường căn "hẻm 4m Nguyễn Trãi" mà chủ nhà nhắn "cô có căn
    // nhà hẻm 4m Trần Hưng Đạo quận 5, 50m2, giá 5 tỷ 8…" → bản trước ghi cả câu làm vị trí của
    // tin cũ (location_raw = nguyên câu, street = "Chào cháu"). Câu rao mang địa chỉ ở ĐƯỜNG KHÁC
    // căn đang hỏi là căn khác.
    const duongMoi = tenDuong(bocViTriRao(text) ?? "");
    const duongCu = tenDuong(pendingReq?.listings?.location_raw ?? "");
    // 24/09/2026 (chủ dự án test Zalo): câu có nhắc lại ĐÚNG tên đường căn đang hỏi ("…ngay nút giao Trần Đình Xu") thì
    // vẫn là căn đó, dù luật bắt được một cụm "đường" khác trước.
    const khacDuong = !!duongMoi && !!duongCu && boDau(duongMoi) !== boDau(duongCu) && !boDau(text).includes(boDau(duongCu));
    // FR-214 b (23/09/2026, Zalo chủ dự án): đang hỏi phường căn nhà Kênh Tân Hóa (Q11) mà nhắn "Đúng rồi và cô
    // muốn rao bán 1 mảnh đất ở xã Cần Giuộc tỉnh Long An ở đường tỉnh lộ 830" → căn nhà chưa có tên đường chuẩn
    // nên `khacDuong` không bắt, cả câu thành câu trả lời phường, lô đất đè lên căn nhà. Câu rao nhắc QUẬN/TỈNH
    // khác hoặc LOẠI khác (đất ↔ nhà ↔ căn hộ) với căn đang hỏi cũng là căn khác.
    const quanRaoMoi = bocQuan(tKD, text) ?? vungNgoai(tKD)?.ten ?? null;
    const quanCanCu = pendingReq?.listings?.district ?? null;
    const khacQuan = !!quanRaoMoi && !!quanCanCu && boDau(quanRaoMoi).replace(/,.*$/, "") !== boDau(quanCanCu).replace(/,.*$/, "");
    const nhomLoai = (l: string | null | undefined) => l === "dat" ? "dat" : l === "chung_cu" ? "chung_cu" : l && l !== "chua_ro" ? "nha" : null;
    // 23/09/2026: câu CÓ DẤU thì "nha" (hạt câu: "hướng Đông nha em") không phải "nhà", "dat" không phải "đất" — dò trên chữ
    // có dấu; câu gõ không dấu mới đoán trên bản bỏ dấu như cũ.
    const coDauCau = /[À-ỹđĐ]/.test(text);
    const coNha = coDauCau ? /(?<![\p{L}])nhà(?![\p{L}])/iu.test(text) : /\bnha\b/.test(tKD);
    const coDat = coDauCau ? /(?<![\p{L}])(?:mảnh đất|lô đất|đất nền|miếng đất|đất)(?![\p{L}])/iu.test(text) : /\b(?:manh dat|lo dat|dat nen|mieng dat|dat)\b/.test(tKD);
    const loaiRaoMoi = coDat && !coNha ? "dat"
      : /\b(?:can ho|chung cu)\b/.test(tKD) ? "chung_cu" : coNha ? "nha" : null;
    const khacLoai = !!loaiRaoMoi && !!nhomLoai(pendingReq?.listings?.property_type) && loaiRaoMoi !== nhomLoai(pendingReq?.listings?.property_type);
    // Câu "muốn rao bán 1 mảnh đất ở …" chưa có giá/diện tích nên luật rao (`wantsSell`) chưa nhận; có chữ bán +
    // loại BĐS + khác nơi/khác loại căn đang hỏi thì đó vẫn là căn mới, đi đường tạo tin.
    const raoMoiCanKhac = !daGanManh && !wantsSell && !!pendingReq && coChuBan && coLoaiBDS && !hoiConBan && (khacQuan || khacLoai);
    // 30/09/2026 (bắn thật thu-groq-02): "em cần bán nhà" mở tin RỖNG, câu rao đủ chi tiết kế tiếp ("nhà hẻm xe hơi 137/28 …, 4x15,
    // 3 tầng, giá 6 tỷ 2") bị coi là câu trả lời ĐỊA CHỈ → AI chết thì cả câu vào "bổ sung", không ra giá / diện tích. Tin đang hỏi
    // còn rỗng mà câu là câu rao → đi đường tạo tin (điền vào tin rỗng, `tinRongId`).
    const tinDangHoiRong = !!pendingReq?.listings && laTinRong(pendingReq.listings);
    // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): "mở tin mới" từng do từ khoá quyết — "bán nhà này 5 tỷ nữa là chốt" (chữ "nữa")
    // mở tin trùng, "nhà bán vì chuyển qua quận 7 ở" (quận khác) mở tin Quận 7. AI đã đọc và nói rõ `can_khac` thì AI quyết;
    // AI không nói (null) → luật như cũ. Khách xác nhận "căn khác" và tin đang hỏi còn rỗng vẫn đi đường tạo tin.
    // `canKhacAi` đọc một lần ở cổng "căn đó hay căn khác" phía trên (cùng `canKhacLuot()`).
    const raoMoiKhiDangHoi = canKhacAi !== undefined
      ? !daGanManh && !!pendingReq && (canKhacAi || raoCanMoiXacNhan || (tinDangHoiRong && wantsSell && coChiTiet))
      : !daGanManh && !!pendingReq && (wantsSell || raoCanMoiXacNhan || raoMoiCanKhac) && (
      (tinDangHoiRong && wantsSell && coChiTiet) ||
      raoCanMoiXacNhan || khacDuong || khacQuan || khacLoai ||
      // 15/09/2026: "còn căn 2 mặt tiền trần phú 4x20 giá 18 tỷ thì sao em" — "còn căn <số>"
      // cũng là căn KHÁC (bản trước hiểu là sửa căn 1). Số kèm đơn vị (căn 2 pn) thì không.
      khop(
        /\b(thêm|nữa|căn khác|căn thứ|còn (một|1) căn|lô khác|còn (?:căn|lô) (?:số )?\d{1,2}\b(?!\s*(?:pn|phòng|x\s*\d|m2|tỷ|triệu|lầu|tầng|tấm)))\b/i,
        /\b(them|nua|can khac|can thu|con (mot|1) can|lo khac|con (?:can|lo) (?:so )?\d{1,2}\b(?!\s*(?:pn|phong|x\s*\d|m2|ty|trieu|lau|tang|tam)))\b/,
      ) ||
      // SRS-5.1zzzzj: cột phường mang tên MỚI — so phường số trong câu sau khi qua cùng cửa chuẩn hoá (không ra phường mới = chưa biết,
      // không tính là căn khác; bản cũ so "Phường 6" với "Phường Xuân Hòa" thì câu nào có phường số cũng thành căn mới).
      (!!wardNo && !!pendingReq.listings?.ward && !!tenPhuongCot(`Phường ${wardNo}`, [pendingReq.listings?.district, ...cacQuanTrong(text, boDau)]) &&
        tenPhuongCot(`Phường ${wardNo}`, [pendingReq.listings?.district, ...cacQuanTrong(text, boDau)]) !== pendingReq.listings.ward)
    );
    // FR-214 b: "Đúng rồi và cô muốn rao bán mảnh đất …" — nửa đầu GẬT phường bot gợi ý cho căn đang hỏi, nửa
    // sau là căn mới (đi tiếp đường rao bên dưới). Bản cũ nuốt cả câu vào ô phường, phường gợi ý không được ghi.
    if (raoMoiKhiDangHoi && pendingReq?.question === "phuong" && !humanActive &&
        await gatLuot(() => /^\s*(?:da\s+)?(?:dung roi|dung vay|dung|u|uh|um|ok|oke|vang|phai|chinh xac)\b/.test(tKD))) {
      const g = (pendingReq.listings?.boc_tach as { phuong_goi_y?: { phuong?: unknown } } | null)?.phuong_goi_y;
      if (g && typeof g === "object" && typeof g.phuong === "string" && g.phuong) {
        const { error: pgErr, boQua: pgBo } = await ghiFact(client, {
          p_listing_id: pendingReq.listing_id, p_question: "phuong", p_answer: g.phuong, p_source: "seller_chat",
        });
        if (pgErr) await ghiLoi(client, "chat-reply gat phuong + rao moi", pgErr.message);
        else if (!pgBo) {
          const { error: irErr } = await client.from("info_requests").update({ status: "answered", answer: g.phuong, answered_at: new Date().toISOString() }).eq("id", pendingReq.id);
          if (irErr) await ghiLoi(client, "chat-reply gat phuong + rao moi(dong cau)", irErr.message);
          // Gợi ý mang cả quận ("Phường Bình Thới (Quận 11 cũ)") → ghi quận khi căn chưa có, và xoá gợi ý (bắn thật 23/09:
          // bản trước chỉ xoá gợi ý, căn nhà nằm "chưa rõ quận").
          await capNhatQuanTuPhuong(pendingReq.listing_id, typeof (g as { quan?: unknown }).quan === "string" ? g as GoiYPhuong : null, g.phuong);
          const tenCu = pendingReq.listings?.location_raw ? ` căn ${duongGiuaCau(pendingReq.listings.location_raw)}` : "";
          ackAnh.push(doiTuXung([`Dạ em ghi ${g.phuong} cho${tenCu} rồi ạ.`], sellerRow.xung_ho ?? null, sellerRow.nhom_tuoi ?? null)[0]);
        }
      }
    }
    if (pendingReq && !raoMoiKhiDangHoi) {
      // FR-164: KHÔNG còn ghi thẳng cột ở đây nữa.
      // Trước bản này khối này tự UPDATE `area_m2` rồi `property_type` trước khi
      // ghi fact — một nhà chức trách THỨ HAI ghi đúng những cột mà trigger fact
      // đang ghi, và nó lách được hai luật:
      //   * bậc ưu tiên: ghi đè bất kể cột đang do admin giữ, lại không đặt
      //     `property_type_source` nên giá trị mới đội lốt nhãn nguồn cũ;
      //   * luật tim-tường FR-163: `/^dien_tich/` khớp luôn `dien_tich_tim_tuong`
      //     nên diện tích tim tường vẫn đè area_m2 của nhà phố — đúng cái chỗ
      //     FR-163 vừa bịt ở tầng DB, thủng lại từ phía app.
      // Nay chỉ ghi FACT; `listing_facts_sync_cols` lo chuẩn hoá, kiểm giá trị,
      // đo bậc ưu tiên và đặt nhãn nguồn. Một luật, một chỗ.
      //
      // Riêng loai_bds vẫn hỏi hàm DB TRƯỚC, nhưng chỉ để quyết định có HỎI LẠI
      // không — không ghi cột. Dùng hàm DB (FR-150/FR-164) nên câu có phủ định
      // ("nhà phố chứ không phải chung cư") cũng đọc đúng.
      // Câu có kèm lời sửa thì phần ĐÃ BÓC mới là câu trả lời. Giữ nguyên cả
      // câu là nhét "giá 6.8 tỷ" vào fact pháp lý — bằng chứng sai chỗ còn tệ
      // hơn thiếu bằng chứng, vì nó trông như chủ nhà đã xác nhận.
      let dapAn = textTreo
        ? textTreo
        : ackSua
        ? conLai
        : nhipPhuDinh.length && suaFacts.length ? cheoPhuDinh(text).replace(/\s+/g, " ").trim() : text;
      // 11/09/2026 (42 ca): câu CHỈ là lời sửa ("sai rồi em, phường 9 chứ không phải
      // phường 4") → phần còn lại "sai rồi em" không phải câu trả lời; bản trước đem
      // nó đi phân loại và nó thành ĐỊA CHỈ. Nhận lời sửa rồi hỏi lại câu đang treo
      // trong CÙNG một bong bóng.
      // SRS-5.1zzzzu: đang hỏi loại, khách chỉ nói giá ("gia 3 ty ruoi") mà loại đã nằm ở tin trước ("lo dat nen") → không dừng ở lời
      // sửa, đi tiếp xuống câu treo loại để ghi loại từ tin trước (`kiemYCuocRao`), khỏi hỏi lại điều khách đã nói.
      let loaiTuTinCu = false;
      if (ackSua && conChu.length < 2 && pendingReq.question === "loai_bds" && bongAi && cheDoBocAi && (await cheDoBocAi) === "chinh") {
        const kL = await bongAi;
        loaiTuTinCu = !!(kL?.ket && docAiChinh(kiemYCuocRao(kL.truong, text, tinChuNhaGoc().join("\n")).dat, null).loaiBds);
      }
      if (ackSua && conChu.length < 2 && pendingReq.question !== "duyet_tin" && !humanActive && !loaiTuTinCu) {
        const cauSua = `${ackSua} ${cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal)}`;
        ackSua = null;
        return await traLoiSeller([cauSua], { sua_fact: true, reask: pendingReq.question });
      }
      // FR-177 g: chủ nhà nói "đủ rồi / vậy thôi / đừng hỏi nữa" giữa vòng hỏi
      // (không phải lúc duyệt bản nháp — ở đó "đủ rồi" là GẬT, xử ở dưới) →
      // đóng dấu chu_noi_du_at, đóng mọi câu đang treo của căn, KHÔNG hỏi nữa.
      // Điểm giữ nguyên theo dữ liệu thật; chủ nhà nhắn thêm gì sau này thì
      // FR-164 vẫn ghi. Tiền định (laDuRoi), không tốn model.
      // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): "xây kín hết rồi em" (trả lời câu kết cấu) khớp "hết rồi" của `laDuRoi` → đóng
      // MỌI câu, bot thôi hỏi luôn. AI đã đọc thì "đủ rồi" là ý định AI đọc ra (`du_roi`, có trích dẫn); từ khoá chỉ khi AI không chạy.
      const ydDu = await yDinhAi();
      const noiDuRoi = ydDu !== undefined ? ydDu?.loai === "du_roi" : laDuRoi(dapAn);
      // 02/10/2026 (bắn thử thu-kb-s10, SRS-5.1zh): chế độ `ai` đọc "ok đăng đi" là `du_roi` — CÙNG tín hiệu với nhánh bảo đăng
      // (`chuMuonDang`) ở dưới, nên nhánh này luôn chặn trước: bot nói "em rao" mà tin không lên kệ. Bảo ĐĂNG (lượt AI nhỏ
      // `dong_y_dang`; luật `laBaoDang` khi AI không chạy) thì nhường cho nhánh đăng.
      // SRS-5.1zzzzzt (Zalo thật 13/10/2026 13:36: "đăng cho mình với nội dung này" khi tin vừa mở còn RỖNG, nội dung tới 46 giây sau →
      // AI đọc "đủ rồi", bot "Dạ em thôi hỏi ạ. Tin mình chưa lên kệ được vì còn thiếu…" rồi đóng mọi câu): tin chưa có gì mà khách nói
      // "đủ rồi / đăng" là khách SẮP GỬI nội dung, không phải xong (tin rỗng không có gì để đăng) — mời gửi, giữ câu đang hỏi, không đóng.
      if (noiDuRoi && pendingReq.question !== "duyet_tin" && laTinRong(pendingReq.listings as Parameters<typeof laTinRong>[0]) && !nhanDienFact(dapAn)) {
        return await traLoiSeller([`Dạ ${cachGoi} gửi nội dung tin qua đây giúp em nha, em đọc rồi soạn lại cho mình ạ.`], { sap_gui_noi_dung: true, reask: pendingReq.question });
      }
      // SRS-5.1zzzzzv (Zalo thật 13/10 14:41: "Đăng bán giúp mình với nội dung sau" khi tin đã có quận → "tin chỉ còn thiếu loại nhà… em đăng luôn
      // không hỏi lại"): AI đọc ra khách SẮP GỬI nội dung (`gui_noi_dung_sau`, trích dẫn đã kiểm) và lượt bóc tách không thấy ô nào → mời
      // gửi, giữ câu đang hỏi; không coi là "đủ rồi" / bảo đăng, bất kể tin rỗng hay không.
      if (ycLuot?.loai === "gui_noi_dung_sau" && pendingReq.question !== "duyet_tin") {
        const aiGui = await aiLuot();
        if (aiGui === undefined ? !nhanDienFact(dapAn) : !aiGui.ghi.some((g) => g.question !== "bo_sung")) {
          return await traLoiSeller([`Dạ ${cachGoi} gửi nội dung tin qua đây giúp em nha, em đọc rồi soạn lại cho mình ạ.`], { sap_gui_noi_dung: true, reask: pendingReq.question });
        }
      }
      const baoDangDu = noiDuRoi && await baoDangLuot(() => laBaoDang(dapAn));
      if (pendingReq.question !== "duyet_tin" && pendingReq.question !== "loai_bds" && noiDuRoi && !baoDangDu) {
        // SRS-5.1zzzzzq: "đăng giúp bác thông tin này nhé" + bài rao tới 12 giây sau — quyết định ĐÓNG (đóng câu treo, chu_noi_du_at) dựa
        // trên một tin đã có tin mới hơn nối theo thì sai ngay từ gốc: nhường lượt, lượt của tin cuối đọc cả hai.
        if (kiemTinMoiHon && await kiemTinMoiHon().catch(() => false)) {
          console.log("chat-reply: đủ rồi nhưng có tin mới hơn → nhường lượt");
          return await hoanTat({ reply: null, replies: [], role: "seller", superseded: true, superseded_luc: "du_roi" });
        }
        // SRS-5.1zzzzze (khách mô phỏng lần bảy: "không biết phường … đăng đi em" cùng một tin): nhánh này đóng mọi câu trước khi khối
        // `khong_biet` chạy, nên ô khách không biết bị quên và lúc duyệt bot lại hỏi đúng câu đó. Nhớ ô trước khi đóng.
        if (await khongBietAi()) await ghiKhongBiet(pendingReq.listing_id, pendingReq.listings?.boc_tach, pendingReq.question);
        const luc = new Date().toISOString();
        const { error: duErr } = await client.from("listings")
          .update({ chu_noi_du_at: luc }).eq("id", pendingReq.listing_id);
        if (duErr) await ghiLoi(client, "chat-reply chu noi du", duErr.message);
        const { error: dongErr } = await client.from("info_requests")
          .update({ status: "expired" })
          .eq("listing_id", pendingReq.listing_id).eq("status", "pending");
        if (dongErr) await ghiLoi(client, "chat-reply dong cau treo(du roi)", dongErr.message);
        daDuyetLuot = true; // SRS-5.1zzzzzzz4: đã đóng câu — lượt này phải nói ra, không nhường im
        const [{ data: dDu }, { data: tDu, error: tDuErr }] = await Promise.all([
          client.rpc("diem_tin", { p_listing_id: pendingReq.listing_id }),
          client.from("listings").select("status, chu_duyet_at").eq("id", pendingReq.listing_id).maybeSingle(),
        ]);
        if (tDuErr) await ghiLoi(client, "chat-reply chu noi du(doc tin)", tDuErr.message);
        const diemDu = (dDu as { diem?: number } | null)?.diem;
        // SRS-5.1zh: "em rao với thông tin hiện tại" chỉ đúng khi tin ĐÃ lên kệ (`chu_noi_du_at` chỉ ngừng hỏi bù, không đăng).
        // Chưa lên kệ, chưa duyệt: đủ điểm → gửi bản nháp để chủ duyệt; chưa đủ → nói thật còn thiếu gì.
        if (tDu?.status === "cho_thong_tin" && !tDu.chu_duyet_at) {
          const nhap = await guiBanNhap(pendingReq.listing_id, { du_roi: true, diem: diemDu ?? null });
          if (!Array.isArray(nhap)) return nhap;
          const thieuDu = nhap.slice(0, 3).join(", ");
          return await traLoiSeller([
            `Dạ em thôi hỏi ạ. Tin mình chưa lên kệ được vì còn thiếu ${thieuDu || "vài thông tin"}; lúc nào có ${cachGoi} nhắn em là em đăng liền ạ.`,
          ], { du_roi: true, diem: diemDu ?? null, thieu: nhap });
        }
        const cauDu = `Dạ em hiểu rồi, em rao với thông tin hiện tại nha${
          typeof diemDu === "number" ? ` (tin mình ${diemDu}/100)` : ""
        }.\nLúc nào có thêm ảnh hay thông tin, ${cachGoi} nhắn em là em cập nhật liền ạ.`;
        // 22/09/2026: KHÔNG xin chấm điểm ở đây nữa (dời sang lúc chủ nhà báo bán được — xem `xinChamDiem`).
        return await traLoiSeller([cauDu], { du_roi: true, diem: diemDu ?? null });
      }
      // Chế độ `ai`: lượt trước bot hỏi "Dạ "xhr" là sổ hồng riêng đúng không ạ?" (gợi ý ở `boc_tach.xac_nhan_goi_y`). Gật →
      // ghi ô đó. Ô đó KHÁC câu đang treo → báo đã ghi rồi hỏi lại câu treo; CHÍNH là câu đang treo → coi như khách trả lời bằng
      // giá trị đã xác nhận, để luồng thường ghi và hỏi câu kế. Không gật → bỏ gợi ý, câu đi đường thường. Gợi ý dùng một lần.
      // Tên phường/xã gõ trong câu (từ điển `wards`) → ghi trước mọi nhánh (nhánh phường bên dưới trả lời sớm).
      // 05/10/2026 (Zalo thật 18:09, SRS-5.1zzh): "em biết dự án ny'ah phú định không" → từ điển bắt "Phú Định" rồi ghi PHƯỜNG
      // dù khách chỉ HỎI. LỚP LỖI: từ điển địa danh ghi thẳng từ chữ, không hỏi kết quả AI của lượt. Nay AI quyết trước: cả tin là
      // câu hỏi → không ghi; AI đọc ra ô phường / địa chỉ / quận (khách KHAI nơi chốn) thì từ điển mới chuẩn hoá tên; AI không
      // chạy → luật như cũ.
      // Bot đang HỎI phường / địa chỉ, hoặc câu có nhãn tường minh ("phường X", "quận Y", "xã Z") → tên trong câu là lời khai,
      // từ điển đọc như cũ (AI im / sai tên vẫn ghi đúng — TDP-01, DD-02…07); chỉ chặn khi AI nói cả tin là câu hỏi. Tên phường
      // đứng trần trong câu nói về chuyện khác → chỉ ghi khi AI đọc ra ô phường / địa chỉ / quận.
      const coNhanDiaDanh = /\b(?:phuong|xa|quan|huyen|thi tran|p|q)\s*\.?\s*[a-z0-9]/.test(boDau(text));
      const aiChoPhuong = await (async (): Promise<boolean> => {
        if (!laCheDoAi || !bongAi) return true;
        const k = await bongAi;
        if (!k?.ket) return true;
        if ((await hoiLaiAi(text))?.caTin) return false;
        if (pendingReq.question === "phuong" || pendingReq.question === "vi_tri" || coNhanDiaDanh) return true;
        return kiemDeXuat(k.truong, text).dat.some((d) => d.khoa === "phuong" || d.khoa === "vi_tri" || d.khoa === "quan");
      })();
      const phuongTuDien = aiChoPhuong && !humanActive && pendingReq.question !== "duyet_tin" && (pendingReq.question === "phuong" || !pendingReq.listings?.ward)
        ? await ghiPhuongTrongCau(pendingReq.listing_id, text, pendingReq.listings ?? null, pendingReq.question) : null;
      let lungDaGhi = false; // câu lửng vừa sửa kết cấu lượt này → fact kết cấu / số tầng của cùng tin không ghi đè
      // Lượt trước bot hỏi "kết cấu 4 tấm đó có tính cả gác lửng không" (`boc_tach.lung_goi_y`). Đáp có / không / có lửng
      // thêm → sửa kết cấu (floors + floors_text) rồi hỏi lại câu đang treo. Câu dài (kèm thông tin khác) thì sửa kết cấu xong
      // đi tiếp luồng thường. Không rõ → bỏ gợi ý. Gợi ý dùng một lần.
      {
        const gL = (pendingReq.listings?.boc_tach as { lung_goi_y?: unknown } | null | undefined)?.lung_goi_y as { n?: unknown; co_lung?: unknown } | undefined;
        if (gL && typeof gL === "object" && typeof gL.n === "number" && !humanActive && pendingReq.question !== "duyet_tin") {
          const { error: lErr } = await client.rpc("ghi_boc_tach", { p_listing_id: pendingReq.listing_id, p: { lung_goi_y: false } });
          if (lErr) await ghiLoi(client, "chat-reply ghi_boc_tach(xoa lung goi y)", lErr.message);
          // SRS-5.1zzzzzc (khách mô phỏng lần năm: "không bạn, 2 tầng đủ rồi" — từ khoá không nhận ra, cả câu rơi vào ô kết cấu): AI đọc
          // câu trả lời câu lửng theo NGHĨA (`tra_loi` — câu bot vừa hỏi nguyên văn chính là câu lửng), code chỉ chuyển câu AI viết lại
          // gọn ("không có lửng") thành có / thêm / không. Từ khoá trên chữ khách chỉ còn đỡ khi AI không chạy.
          const tlL = laCheDoAi && bongAi ? kiemTraLoiCau((await bongAi)?.traLoi, text, cauBotThat) : null;
          // 14/10/2026 (SRS-5.1zzzzzzz17, đợt 2 gỡ đoán nghĩa): AI đã đọc (tlL khác null) thì AI quyết — AI nói "không trả lời câu lửng"
          // là không trả lời, luật từ khoá trên chữ khách không được ghi số tầng thay. Luật chỉ đỡ khi AI không chạy.
          const cauLung = tlL ? (tlL.co && tlL.giaTri ? tlL.giaTri : null) : dapAn;
          const dapL0 = cauLung ? docTraLoiLung(cauLung) : null;
          // SRS-5.1zzzzzg: khách đã nói CÓ lửng ("3 tầng có lửng") → "không" là lửng NGOÀI số tầng, nhà vẫn có lửng.
          // Trừ khi câu trả lời nói rõ "không có lửng" (rút lại) — khi đó vẫn là không lửng (soi trên câu AI viết lại khi AI chạy).
          const dapL = gL.co_lung === true && dapL0 === "khong" && !/\b(?:khong|ko|k|chua|hong)\s+(?:co\s+)?(?:gac\s+)?(?:lung|gac)\b/.test(boDau(cauLung ?? "")) ? "them" : dapL0;
          if (dapL) {
            // Khách nói lại SỐ tầng trong câu đáp ("Nhà a 4 tầng tính cả lửng") → số khách vừa nói thắng số bot hỏi.
            const kcL = ketCauTheoLung(soTangTrongDapLung(dapAn) ?? gL.n, dapL);
            const { error: uErr } = await client.from("listings").update(kcL).eq("id", pendingReq.listing_id);
            if (uErr) await ghiLoi(client, "chat-reply lung(ghi)", uErr.message);
            else lungDaGhi = true;
            // SRS-5.1zzzzy: mảnh nói lửng / số tầng đã trả lời câu lửng — không đi tiếp luồng thường (luồng đó ghi nguyên văn câu vào ô
            // kết cấu). Còn mảnh khác ("…, phường 5 nha") thì chỉ phần đó đi tiếp.
            // AI đọc câu lửng: tin còn ô KHÁC (ngoài kết cấu / số tầng / tầng phụ) thì cả tin đi tiếp luồng thường (AI quyết từng ô);
            // không thì câu lửng là cả tin. Từ khoá cắt mảnh chỉ khi AI không chạy.
            const khacLung = tlL?.co ? ((await bongAi)?.truong ?? []).some((t) => !["ket_cau", "so_tang", "tang_phu"].includes(t.khoa)) : false;
            const conLaiL = tlL?.co ? (khacLung ? dapAn : null) : phanNgoaiCauLung(dapAn);
            if (conLaiL) dapAn = conLaiL;
            else {
              const cauTreoL = cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal, pendingReq.listings?.location_raw);
              return await traLoiSeller([`Dạ vậy quy mô nhà mình là ${kcL.floors_text} ạ. ${cauTreoL}`], { lung: dapL, reask: pendingReq.question, loai_cau: "xac_nhan" });
            }
          }
        }
      }
      let xacNhanGhi: GoiYXacNhan | null = null;
      {
        const gX = (pendingReq.listings?.boc_tach as { xac_nhan_goi_y?: unknown } | null | undefined)?.xac_nhan_goi_y as GoiYXacNhan | undefined;
        if (gX && typeof gX === "object" && typeof gX.khoa === "string" && typeof gX.gia_tri === "string" && KHOA_XAC_NHAN.has(gX.khoa)) {
          const { error: xErr } = await client.rpc("ghi_boc_tach", { p_listing_id: pendingReq.listing_id, p: { xac_nhan_goi_y: false } });
          if (xErr) await ghiLoi(client, "chat-reply ghi_boc_tach(xoa xac nhan goi y)", xErr.message);
          const veDauX = dapAn.split(/[,;.!?]|\s+(?:mà|ma|nhưng|nhung|và|va|với|voi)\s+/u)[0]?.trim() ?? "";
          const tgX = await gatTach(dapAn); // SRS-5.1zf: AI quyết gật; luật chỉ khi AI không chạy
          const gatCaX = tgX ? tgX.gat && tgX.ca : laDongY(dapAn);
          const gatDauX = tgX ? tgX.gat && !tgX.ca : !gatCaX && veDauX.length > 0 && veDauX !== dapAn.trim() && laDongY(veDauX);
          if ((gatCaX || gatDauX) && !humanActive && pendingReq.question !== "duyet_tin") {
            const { error: gErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: gX.khoa, p_answer: gX.gia_tri, p_source: "seller_chat",
            });
            if (gErr) await ghiLoi(client, "chat-reply ghi_fact_listing(xac nhan)", gErr.message);
            if (gX.khoa === pendingReq.question) {
              xacNhanGhi = gX;
              dapAn = gX.gia_tri;
            } else if (gatCaX) {
              const cauTreoX = cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal, pendingReq.listings?.location_raw);
              return await traLoiSeller([`Dạ em ghi ${gX.gia_tri} rồi ạ. ${cauTreoX}`], { xac_nhan: gX.khoa, reask: pendingReq.question, loai_cau: "xac_nhan" });
            } else {
              dapAn = tgX ? tgX.conLai : dapAn.slice(dapAn.indexOf(veDauX) + veDauX.length).replace(/^[\s,;.!?]+/u, "").replace(/^(?:mà|ma|nhưng|nhung|và|va|với|voi)\s+/iu, "").trim() || dapAn;
            }
          }
        }
      }
      // FR-212: lượt trước bot hỏi "Đường mình là X phải không?" (tên đường gõ sai 1–2 ký tự,
      // gợi ý ở `boc_tach.duong_goi_y`). Gật → ghi địa chỉ đã sửa (fact vi_tri, trigger đồng bộ
      // location_raw/street), hỏi lại câu đang treo. Không gật → bỏ gợi ý, câu vừa nhắn đi đường
      // thường (thường chính là câu trả lời câu đang treo). Gợi ý dùng đúng một lần.
      {
        const gD = (pendingReq.listings?.boc_tach as { duong_goi_y?: unknown } | null | undefined)?.duong_goi_y;
        if (gD && typeof gD === "object" && typeof (gD as GoiYDuong).ten === "string" && typeof (gD as GoiYDuong).vi_tri === "string") {
          const goiY = gD as GoiYDuong;
          const { error: xErr } = await client.rpc("ghi_boc_tach", { p_listing_id: pendingReq.listing_id, p: { duong_goi_y: false } });
          if (xErr) await ghiLoi(client, "chat-reply ghi_boc_tach(xoa duong goi y)", xErr.message);
          // Bắn thật 21/09 (mau-tdt2): "đúng rồi em, phường 2 quận 5" — gật ở VẾ ĐẦU kèm thông tin: gật vẫn
          // là gật (sửa đường), phần còn lại đi đường thường như một câu trả lời.
          const veDauD = dapAn.split(/[,;.!?]|\s+(?:mà|ma|nhưng|nhung|và|va|với|voi)\s+/u)[0]?.trim() ?? "";
          const tgD = await gatTach(dapAn); // SRS-5.1zf
          const gatCa = tgD ? tgD.gat && tgD.ca : laDongY(dapAn);
          const gatDau = tgD ? tgD.gat && !tgD.ca : !gatCa && veDauD.length > 0 && veDauD !== dapAn.trim() && laDongY(veDauD);
          if ((gatCa || gatDau) && !humanActive && pendingReq.question !== "duyet_tin") {
            const { error: vErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: "vi_tri", p_answer: goiY.vi_tri, p_source: "seller_chat",
            });
            if (vErr) await ghiLoi(client, "chat-reply ghi_fact_listing(vi_tri sua duong)", vErr.message);
            if (gatCa) {
              const cauKeDuong = cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal, goiY.vi_tri);
              return await traLoiSeller([`Dạ em sửa lại ${goiY.ten} rồi ạ. ${cauKeDuong}`], { sua_duong: goiY.ten, reask: pendingReq.question, loai_cau: "sua_duong" });
            }
            // Cắt vế gật, phần còn lại là câu trả lời (bong bóng 🤖 của lượt đã báo "vị trí cụ thể" đổi).
            dapAn = tgD ? tgD.conLai : dapAn.slice(dapAn.indexOf(veDauD) + veDauD.length).replace(/^[\s,;.!?]+/u, "").replace(/^(?:mà|ma|nhưng|nhung|và|va|với|voi)\s+/iu, "").trim() || dapAn;
          }
        }
      }
      let loaiDapAn: string | null = null;
      if (pendingReq.question === "loai_bds") {
        // 21/09/2026 (chủ dự án: "các trường khác cũng vậy, để AI nhận diện nó thuộc trường nào"): chế độ
        // `chinh` — AI đọc loại BĐS trước (qua kiểm bằng chứng), RPC đoán loại chỉ đỡ khi AI trống.
        // 02/10/2026 (chủ dự án: "xóa luôn mấy luật này đi… để AI viết"): AI đã đọc tin thì AI QUYẾT — AI không thấy loại nào
        // thì hỏi lại, không đem câu đi đoán bằng regex `guess_property_type_answer` (nó xét "đất" trước "nhà phố", nên tin
        // "BÁN NHÀ PHỐ… Diện tích đất 4m x 11m" ra ĐẤT). Luật đoán chỉ còn đỡ khi AI không chạy (công tắc tắt / model lỗi).
        let pt: string | null = null;
        let aiDaDoc = false;
        if (bongAi && cheDoBocAi && (await cheDoBocAi) === "chinh") {
          const kqAi = await bongAi;
          if (kqAi?.ket) {
            aiDaDoc = true;
            // SRS-5.1zzzzu: đang hỏi loại = ô loại trống → nhận trích dẫn loại ở tin chủ nhà trước ("e co mieng dat can ban").
            pt = docAiChinh(kiemYCuocRao(kqAi.truong, text, tinChuNhaGoc().join("\n")).dat, null).loaiBds;
          }
        }
        if (!pt && !aiDaDoc) {
          const { data: ptLuat, error: ptErr } = await client.rpc("guess_property_type_answer", { p_text: dapAn });
          if (ptErr) await ghiLoi(client, "chat-reply guess_property_type_answer", ptErr.message);
          pt = ptLuat ? String(ptLuat) : null;
        }
        // 16/09/2026 (bắn thật): "Nhà trong hẻm 2 xẹc nhưng hẻm rộng 5m nhà 4 tấm" → ô loại BĐS ghi
        // NGUYÊN câu (rồi DB đọc "nhà trong" ra nhà trống). Đáp án ô loại là TÊN LOẠI đọc ra.
        // Chỉ thay đáp án GHI vào ô loại; `dapAn` giữ nguyên để nhặt fact kèm (hẻm, tầng, sàn).
        if (pt && LOAI_DAP_AN[String(pt)]) loaiDapAn = LOAI_DAP_AN[String(pt)];
        if (!pt) {
          // Không đọc ra loại → HỎI LẠI, giữ nguyên câu hỏi pending. TUYỆT ĐỐI
          // không ghi fact `loai_bds`: ghi xong là listing_missing_facts hết
          // hỏi, tin nằm `chua_ro` vĩnh viễn — đúng kiểu chết lặng FR-150 diệt.
          // 20/09/2026 (mau-y-A): câu chỉ nói QUẬN ("ca 2 can deu quan 10 nhe") thì ghi quận rồi hỏi lại.
          // SRS-5.1zzv (bắn lại thu-ai-0610 13:56): câu treo LOẠI từng là cổng chặn tuyệt đối — AI không ra loại ở câu địa chỉ,
          // tin `chua_ro`, rồi NĂM lượt liền ("4x16…", "5 tỷ 2, shr", "anh đứng tên…", "ok đăng đi", "phí sao em") đều nhận
          // nguyên văn một câu "Dạ em chưa rõ lắm ạ, nhà mình thuộc loại nào ta…": "ok đăng đi" (AI đọc đúng du_roi) bị nuốt,
          // "phí sao em" không được trả lời. Vẫn KHÔNG đoán loại bằng luật (ZR-06, chủ dự án 02/10) — nhưng nhánh này phải:
          // (a) trả lời câu khách HỎI NGƯỢC trước; (b) khách bảo ĐĂNG → "em đăng liền, chỉ còn thiếu loại nhà" (câu
          // `dang_luon_thieu`), không lặp câu hỏi; (c) hỏi lại lần 2 trở đi bằng câu NGẮN khác, không nguyên văn.
          const qGhi = await capNhatQuan(pendingReq.listing_id);
          const [ydLoai, hoiLoai] = await Promise.all([yDinhAi(), hoiLaiAi(dapAn)]);
          const daHoiLoai = lichSuRows.filter((m) => !laTinNguoi(m.sender) && /loại nào ta|nhà phố, nhà cấp 4|nhà phố hay nhà cấp 4|nhà phố hay biệt thự|nhà phố, chung cư hay đất/i.test(boBaoLai(m.body) ?? "")).length;
          // SRS-5.1zzy (chat thử 07/10: "nhà 4 lầu" → "nhà phố hay nhà cấp 4"): nhà cấp 4 chỉ một trệt, không có lầu. Chỉ đổi LỰA
          // CHỌN trong câu hỏi (không ghi loại — ZR-06): khách đã nói lầu / từ 2 tầng thì hỏi nhà phố hay biệt thự.
          const coLau = /(?<![\p{L}])(?:lầu|lau|tấm|tam)(?![\p{L}])|(?<!\d)[2-9]\s*(?:tầng|tang)(?![\p{L}])/iu
            .test([dapAn, pendingReq.listings?.floors_text ?? ""].join(" "));
          const haiLoai = coLau ? "nhà phố hay biệt thự" : "nhà phố hay nhà cấp 4";
          if (ydLoai?.loai === "du_roi") {
            return await traLoiSeller([cauTD("dang_luon_thieu", { thieu: `loại nhà (${haiLoai})` })],
              { reask: "loai_bds", dang_luon: true, thieu_dang: "loại nhà", ...(qGhi ? { quan: qGhi } : {}) });
          }
          const dapNguoc = hoiLoai
            ? dapHoiNguocTienDinh(hoiLoai.cau, cachGoi, cauPhi(vaiPhi(sellerRow), pendingReq.listings?.deal ?? dealNguoi, { benEm: true }), hoiLoai.chuDe, botDaNoiGan(), viDuPhiNguoi(pendingReq.listings?.deal, pendingReq.listings?.price_vnd))
              ?? await dapChuaCoDuLieu(hoiLoai.cau, hoiLoai.chuDe)
            : null;
          const again = daHoiLoai >= 1
            ? `Dạ ${cachGoi} cho em biết nhà mình là ${haiLoai} để em ghi đúng loại nha.`
            : coLau
            ? `Dạ ${qGhi ? `em ghi ${qGhi} rồi ạ. ` : ""}Nhà mình là ${haiLoai} vậy ${cachGoi}?`
            : qGhi
            ? `Dạ em ghi ${qGhi} rồi ạ. Còn nhà mình thuộc loại nào ta: nhà phố, nhà cấp 4, chung cư, đất, biệt thự, phòng trọ hay mặt bằng ạ?`
            : "Dạ em chưa rõ lắm ạ, nhà mình thuộc loại nào ta: nhà phố, nhà cấp 4, chung cư, đất, biệt thự, phòng trọ hay mặt bằng ạ?";
          return await traLoiSeller([...(dapNguoc ? [dapNguoc] : []), again],
            { reask: "loai_bds", ...(dapNguoc ? { hoi_nguoc: hoiLoai!.cau } : {}), ...(qGhi ? { quan: qGhi } : {}) });
        }
      }

      // FR-176: CÂU VỪA NHẮN CÓ PHẢI CÂU TRẢ LỜI KHÔNG? Trước bản này khối
      // này lấy NGUYÊN câu chat làm đáp án: "Kêu chị nha" đóng câu pháp lý,
      // "16m nha" thành hướng nhà, "Ngang 5" đóng câu diện tích mà area_m2 vẫn
      // trống — và bot không bao giờ hỏi lại. Luật: thà hỏi lại một câu thừa
      // còn hơn đóng một câu hỏi bằng rác. Phân loại ở tầng tiền định
      // (`_shared/extraction/khop-cau-tra-loi.ts`), model chỉ lo NÓI.
      // FR-177 c: đang chờ chủ nhà DUYỆT BẢN NHÁP. Gật (AGREE_RULES, bản tiền
      // định `laDongY`) → khớp, xuống dưới đóng dấu `chu_duyet_at`. Sửa → ghi
      // (lời sửa có nhãn đã vào sổ ở khối FR-164; phần còn lại nhận ra fact
      // nào thì ghi fact đó, không thì `bo_sung`) rồi GỬI LẠI bản nháp, câu
      // duyệt vẫn treo. Hỏi ngược / ừ / dặn xưng hô → đường hỏi lại chung.
      let kqDuyet: KetQuaKhop | null = null;
      let huaSauDuyet = false; // FR-234 c: gật duyệt bằng "cứ đăng … chiều gửi thêm" — kèm lời hẹn, không hỏi thêm
      if (pendingReq.question === "duyet_tin") {
        const chiSua = !!ackSua && conChu.length < 2;
        // FR-177 g: "đủ rồi, đăng đi" lúc duyệt là GẬT, và là lời "đủ rồi".
        // 21/09/2026 (bắn thật mau-tdt): "ok em đăng đi, mà cái dòng phù hợp đọc kỳ quá" — gật nằm ở VẾ ĐẦU,
        // vế sau là lời bình về bản nháp, không phải dữ liệu căn nhà; bản trước coi cả câu là lời sửa, nhét
        // nguyên câu vào "📝 Thêm" rồi gửi lại nháp kèm "Em sửa lại rồi". Vế sau có fact thật thì vẫn là sửa.
        const veDau = dapAn.split(/[,;.!?]|\s+(?:mà|ma|nhưng|nhung)\s+/u)[0]?.trim() ?? "";
        // Có LỜI SỬA trong câu ("ok đăng đi, mà giá 9 tỷ 8") thì vẫn theo FR-177 c: ghi rồi gửi lại nháp, chưa duyệt.
        const gatVeDau = !ackSua && veDau.length > 0 && veDau !== dapAn.trim() && (laDongY(veDau) || laDuRoi(veDau)) && // lưới đỡ
          !nhanDienFact(dapAn.slice(dapAn.indexOf(veDau) + veDau.length));
        // SRS-5.1zf: AI đọc tin → AI quyết duyệt: gật mà không kèm dữ liệu (kèm dữ liệu là lời sửa), hoặc ý định "đủ rồi".
        const tgDuyet = await gatTach(dapAn);
        const ydDuyet = tgDuyet !== undefined ? await yDinhAi() : undefined;
        // SRS-5.1zzzzzzi: HOÃN lúc chờ duyệt ("giờ anh bận, mai nói tiếp 8 giờ 45 sáng") — bản trước rơi xuống câu meta "Dạ em nghe
        // rồi ạ. Bản nháp ở trên… nhắn ok" (ép duyệt khi khách vừa nói bận) và không hẹn gì. Hoãn là hoãn ở mọi nhánh (16/09): một câu
        // chờ, có giờ thì đặt nhắc (FR-133) và nói lại mốc, câu duyệt vẫn treo. AI quyết (`y_dinh = hoan`), luật `laHoanLai` chỉ đỡ.
        const ydHoanDuyet = await yDinhAi(); // không treo theo lượt gật (`gatTach`) — ý định hoãn đọc từ lượt bóc tách
        if (!chiSua && (ydHoanDuyet !== undefined ? ydHoanDuyet?.loai === "hoan" : laHoanLai(dapAn)) && !(await baoDangLuot(() => laBaoDang(dapAn)))) {
          const hen = await datHenHoan(cachGoi);
          return await traLoiSeller(
            [`Dạ ${cachGoi} cứ lo việc nha.${hen} Bản nháp ở trên lúc nào rảnh ${cachGoi} xem lại rồi nhắn "ok" là em đăng ạ.`],
            { reask: "duyet_tin", hoan: true, loai_cau: "hoan", ...(hen ? { hen_nhac: true } : {}) },
          );
        }
        // SRS-5.1zzzzzv (Zalo thật 13/10 14:52: "sửa lại theo nội dung này giúp mình" → gật → tin lên kệ; "Sửa lại giúp mình nhé!" → ghi chú
        // "📝 Thêm"): lời VỀ BẢN NHÁP do AI đọc (`xin_sua` / `gui_noi_dung_sau`, trích dẫn đã kiểm) — không bao giờ là gật; không kèm dữ
        // liệu thì không ghi gì, không gửi lại nháp, câu duyệt vẫn treo. Kèm dữ liệu ("sửa lại, giá 9 tỷ") thì đi đường ghi như lời sửa.
        const ycDuyet = ycLuot?.loai === "xin_sua" || ycLuot?.loai === "gui_noi_dung_sau" ? ycLuot.loai : null;
        const aiDuyet = ycDuyet ? await aiLuot() : undefined;
        const coODuyet = aiDuyet !== undefined ? aiDuyet.ghi.some((g) => g.question !== "bo_sung") : nhanDienFact(dapAn) !== null;
        if (!chiSua && ycDuyet && !coODuyet) {
          const Ac = cachGoi.charAt(0).toUpperCase() + cachGoi.slice(1);
          return ycDuyet === "gui_noi_dung_sau"
            ? await traLoiSeller([`Dạ ${cachGoi} gửi nội dung qua đây giúp em, em sửa bản nháp theo đó rồi gửi lại ${cachGoi} xem ạ.`], { reask: "duyet_tin", sap_gui_noi_dung: true })
            : await traLoiSeller([`Dạ ${cachGoi} nói giúp em chỗ cần sửa (sửa thành gì, hay bỏ ý nào) là em sửa liền ạ. ${Ac} chưa ưng chỗ nào thì cứ chỉ em nha.`], { reask: "duyet_tin", loai_cau: "xin_sua" });
        }
        const gatDuyet = !ycDuyet && (tgDuyet !== undefined ? (tgDuyet.gat && tgDuyet.ca) || ydDuyet?.loai === "du_roi" : (laDongY(dapAn) || laDuRoi(dapAn) || gatVeDau));
        // SRS-5.1zzzzzl (test Zalo 13/10: "Tiêu đề như vầy hay hơn nè: Chỉ với 7,6 tỷ ô tô tận cửa tại Bình Hưng Hòa Bình Tân" lúc chờ duyệt
        // → bot coi là gật, đăng luôn). Chủ nhà ĐƯA TIÊU ĐỀ là sửa bản nháp: AI đọc ra câu tiêu đề (`tieu_de`), code kiểm câu đó nằm nguyên
        // văn trong tin → ghi `boc_tach.tieu_de_khach`, gửi lại bản nháp với tiêu đề của khách, câu duyệt vẫn treo. Đứng TRƯỚC mọi nhánh gật.
        const tieuDeMoi = await (async () => {
          const t = (yLuotAi ? (await yLuotAi)?.tieuDe : null)?.replace(/\s+/g, " ").trim();
          return t && t.length >= 8 && t.length <= 160 && trichCoTrongTin(t, dapAn) ? t : null;
        })();
        if (!chiSua && tieuDeMoi) {
          const { error: tdErr } = await client.rpc("ghi_boc_tach", { p_listing_id: pendingReq.listing_id, p: { tieu_de_khach: tieuDeMoi } });
          if (tdErr) await ghiLoi(client, "chat-reply ghi_boc_tach(tieu de khach)", tdErr.message);
          const lai = await guiBanNhap(pendingReq.listing_id, { reask: "duyet_tin", sua_nhap: true, tieu_de_khach: true }, true);
          if (!Array.isArray(lai)) return lai;
          kqDuyet = { loai: "lech" };
        } else if (!chiSua && gatDuyet) {
          kqDuyet = { loai: "khop" };
        } else if (!chiSua && await baoDangLuot(() => laBaoDang(dapAn))) {
          // FR-234 c (bắn thật lx-41, 28/09/2026): "Bảo cứ đăng như này trước đi chiều anh gửi thêm thông tin với ảnh các
          // thứ h đang bận" lúc chờ duyệt → nhánh LỜI HỨA bên dưới trả "nhắn ok là em đăng liền" mà không đăng. Bảo đăng là
          // GẬT; lời hứa (nhắc đã đặt ở trên) chỉ thêm câu hẹn.
          kqDuyet = { loai: "khop" };
          huaSauDuyet = khop(PROMISE_RE, PROMISE_RE_KD);
        } else if (!chiSua && !/[\p{L}\p{N}]/u.test(dapAn)) {
          // 22/09/2026 (kịch bản C): "😂😂" lúc chờ duyệt → model từng nói "Em thấy anh chị đồng ý rồi ạ" rồi
          // hỏi lại. Emoji vui (👍❤️😊) đã là gật ở `laDongY`; emoji khác không phải gật cũng không phải sửa —
          // câu tiền định, không gọi model, câu duyệt vẫn treo.
          return await traLoiSeller([`Dạ 😊 Bản nháp ở trên ${cachGoi} thấy được thì nhắn "ok" là em đăng liền, muốn sửa chỗ nào thì nhắn em nha.`], { reask: "duyet_tin", loai_cau: "emoji" });
        } else if (!chiSua && laNoiVoiBot(dapAn) && !nhanDienFact(dapAn)) {
          // 21/09/2026 (bắn thật): "xóa sạch data của anh đi để anh test lại" / "cái dòng phù hợp đọc kỳ quá" lúc
          // duyệt → từng vào `bo_sung` rồi gửi lại nháp kèm "Em sửa lại rồi". Lời nói với bot không phải dữ liệu
          // căn nhà: không ghi, không gửi lại nháp, nói thật điều bot không tự làm được; câu duyệt vẫn treo.
          const cauMeta = xinXoaLuot(dapAn)
            ? "Dạ việc xoá dữ liệu em không tự làm được, để em nhờ anh chị phụ trách xử lý ạ."
            : "Dạ em nghe rồi ạ.";
          return await traLoiSeller([`${cauMeta} Bản nháp ở trên ${cachGoi} thấy được thì nhắn "ok" là em đăng liền ạ.`], { reask: "duyet_tin", loai_cau: "meta" });
        } else if (!chiSua && khop(PROMISE_RE, PROMISE_RE_KD)) {
          // 09/09 tối: "tối đi làm về chụp hình gửi em" lúc đang chờ duyệt là LỜI
          // HỨA (nhắc đã đặt ở trên), không phải lời sửa — đừng gửi lại bản nháp,
          // chỉ cảm ơn và giữ câu duyệt treo.
          return await traLoiSeller(
            [`Dạ em chờ ảnh của ${cachGoi} nha. Bản nháp ở trên ${cachGoi} thấy được thì nhắn "ok" là em đăng liền ạ.`],
            { reask: "duyet_tin", loai_cau: "hua" },
          );
        } else {
          const k = chiSua ? { loai: "lech" as const } : phanLoaiCauTraLoi("duyet_tin", dapAn);
          if (k.loai === "khop" || k.loai === "lech") {
            if (!chiSua) {
              // 30/09/2026 (bắn thử bán lx-ban-292a): "chính chủ đứng tên, không thế chấp" lúc chờ duyệt → chỉ MỘT fact được
              // ghi (cả câu vào ô đứng tên), thế chấp mất. Câu có từ hai ý luật nhận ra thì ghi từng ý.
              // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): "bỏ dòng 4 phòng ngủ đi, chỉ 3 phòng thôi" — regex nhặt số ĐẦU tiên
              // (4). AI đã đọc thì ô sửa là ô AI đọc ra (qua kiểm); AI không thấy ô nào thì câu là ghi chú thêm. Regex chỉ khi AI
              // không chạy.
              const aiN = await aiLuot();
              let ds: Array<{ question: string; answer: string }>;
              if (aiN !== undefined) {
                const oAi = aiN.ghi.filter((g) => g.question !== "bo_sung").map((g) => ({ question: g.question, answer: g.answer }));
                // SRS-5.1zzzzzv: AI đã đọc mà không thấy ô nào → chỉ ghi KIẾN THỨC AI đọc ra (nếu có), KHÔNG ghi nguyên câu làm ghi chú
                // ("Sửa lại giúp mình nhé!", "Phần quy mô vẫn chưa đúng ý mình", "mình chấm 6/10 nhé" từng vào "📝 Thêm"). Không có gì →
                // lời về bản nháp / với bot: điểm chấm (câu điểm đã hết hạn vì nháp vừa gửi lại) thì ghi điểm, còn lại nói thật, câu duyệt treo.
                const kB = await bongAi;
                const ktAi = kB?.ket ? kiemKienThuc(kB.kienThuc ?? [], dapAn, kiemDeXuat(kB.truong, dapAn).dat) : [];
                ds = oAi.length ? oAi : ktAi.map((a) => ({ question: "bo_sung", answer: a }));
                // SRS-5.1zzzzzza: AI đọc mà không ra ô nào, câu lại là LỆNH SỬA GIÁ kèm số ("Điều chỉnh cho mình giá 6,950 tỷ") → lưới đỡ tất định ghi giá mới.
                if (!ds.length) {
                  const giaMoi = suaGiaTrongLoi(dapAn, pendingReq.listings?.price_raw);
                  if (giaMoi) { ds = [{ question: "gia", answer: giaMoi }]; console.log("chat-reply: luoi do sua gia luc duyet", giaMoi); }
                }
                if (!ds.length) {
                  const { data: dgReq } = await client.from("info_requests").select("id, status").eq("listing_id", pendingReq.listing_id).eq("question", "danh_gia").limit(1).maybeSingle();
                  if (dgReq && laDiemCham(dapAn)) {
                    const camOn = await ghiDiemDanhGia(pendingReq.listing_id, dgReq.status === "answered" ? null : (dgReq.id as string), dapAn);
                    return await traLoiSeller([`${camOn} Bản nháp ở trên ${cachGoi} thấy được thì nhắn "ok" là em đăng liền ạ.`], { reask: "duyet_tin", saved_fact: "danh_gia", danh_gia: dapAn });
                  }
                  return await traLoiSeller([`Dạ em nghe rồi ạ. Bản nháp ở trên ${cachGoi} thấy được thì nhắn "ok" là em đăng liền, muốn sửa chỗ nào thì nói em chỗ đó nha.`], { reask: "duyet_tin", loai_cau: "meta" });
                }
              } else {
                const nhieu = nhanDienNhieuFact(dapAn).filter((f) => f.question !== "bo_sung");
                const motY = k.chuyenSang ?? nhanDienFact(dapAn) ?? { question: "bo_sung", answer: dapAn };
                ds = nhieu.length >= 2 ? nhieu : [motY];
              }
              for (const nd of ds) {
                const { error: sErr } = await ghiFact(client, {
                  p_listing_id: pendingReq.listing_id, p_question: nd.question,
                  p_answer: nd.answer, p_source: "seller_chat",
                });
                if (sErr) await ghiLoi(client, "chat-reply ghi_fact_listing(sua nhap)", sErr.message);
              }
            }
            // Bản nháp vừa gửi (tin bot gần nhất có "📋") — nháp mới y hệt thì không gửi lại kèm "Em sửa lại rồi".
            const nhapCu = [...lichSuRows].reverse().find((m) => !laTinNguoi(m.sender) && (m.body ?? "").includes("📋"))?.body ?? null;
            const lai = await guiBanNhap(pendingReq.listing_id, { reask: "duyet_tin", sua_nhap: true, nhap_cu: nhapCu }, true);
            if (!Array.isArray(lai)) return lai;
            kqDuyet = { loai: "lech" }; // điểm tụt dưới 70 sau khi sửa (hiếm) → hỏi lại
          } else {
            kqDuyet = k;
          }
        }
      }
      // FR-209: bot đã gợi ý phường tra từ tên đường ("…đúng không anh?"); chủ nhà
      // GẬT ("đúng rồi", "ừ", 👍) → đáp án CHÍNH LÀ phường gợi ý, đi đường khớp như
      // chủ nhà tự gõ. Không gật → gợi ý bỏ, câu trả lời đi đường thường.
      let goiYPhuong: GoiYPhuong | null = null;
      let nhanGoiYPhuong = false;
      if (pendingReq.question === "phuong") {
        const { data: btRow } = await client.from("listings").select("boc_tach").eq("id", pendingReq.listing_id).maybeSingle();
        const btP = (btRow?.boc_tach ?? {}) as { phuong_goi_y?: unknown; phuong_lua_chon?: unknown; phuong_lua_chon_quan?: unknown; quan_mac_dinh?: unknown };
        const g = btP.phuong_goi_y;
        if (g && typeof g === "object" && typeof (g as GoiYPhuong).phuong === "string") goiYPhuong = g as GoiYPhuong;
        const luaChon: string[] = Array.isArray(btP.phuong_lua_chon) ? (btP.phuong_lua_chon as unknown[]).map(String) : [];
        const luaChonQuan = (btP.phuong_lua_chon_quan && typeof btP.phuong_lua_chon_quan === "object" ? btP.phuong_lua_chon_quan : {}) as Record<string, string>;
        // 01/10/2026: gợi ý "phường X thuộc quận Y, nhà mình ở Y hay Z" — khách gọi tên quận Y cũng là gật.
        // SRS-5.1zzzzzb (khách mô phỏng 11/10: "Quận 12 hay Quận Gò Vấp?" → "dạ, nhà bác ở Gò Vấp đó cháu…" → "dạ" bị đọc là gật, tin ghi
        // phường của Quận 12): câu lệch quận hỏi CHỌN quận — khách gọi tên quận tin đang ghi là chọn vế đó, lời "dạ / đúng rồi" kèm theo không
        // phải gật gợi ý. Gật trơn hay gọi tên quận của phường gợi ý thì nhận như cũ (LQ-02/03).
        const quanTinGoiY = pendingReq.listings?.district && btP.quan_mac_dinh !== true ? pendingReq.listings.district : null;
        const chonQuanTin = !!goiYPhuong?.doi_quan && nhacTenQuan(dapAn, quanTinGoiY) && !nhacTenQuan(dapAn, goiYPhuong.quan);
        // SRS-5.1zzzzzzm (14/10/2026, người test thật 10:37; thay 5.1zzzzzzk `noiPhuongKhac` và 5.1zzzzzi nhánh chọn): câu trả lời câu phường
        // khi bot vừa GỢI Ý / KỂ phường có MỘT quyết định, theo thứ tự: (1) khách GỌI TÊN một phường (AI đọc ra — `truong` phuong hay `tra_loi`,
        // trích dẫn có trong tin; luật đỡ: tiền tố "phường …" / tên phường trong câu) qua cửa `phuongCot` → đó là câu trả lời, kể cả khi lời
        // có "nhé / đúng rồi" kèm; nằm trong danh sách đã kể thì lấy quận đã cất theo phường đó (`phuong_lua_chon_quan` — chưa biết quận vẫn
        // ghi được), không nằm trong danh sách vẫn nhận (khách biết nhà mình hơn từ điển), quận theo bảng `wards`; (2) không gọi tên gì mà GẬT →
        // phường gợi ý (chỉ khi có gợi ý một phường; kể 2–4 phường mà gật trơn thì câu còn treo). Bản trước: gật và tên AI đọc là HAI chỗ
        // ghi trong một lượt, cái sau đè cái trước (fact 10:37:01 Phú Thuận → 10:37:02 Tân Thuận).
        const quanDoiChieu = goiYPhuong?.quan ?? quanTinGoiY;
        const coGoiY = !!goiYPhuong || luaChon.length > 0;
        const tenNgan = (s: string | null | undefined) => boDau(String(s ?? "")).replace(/^(?:phuong|xa|dac khu|quan|huyen|thanh pho|thi xa)\s+/, "").trim();
        const trongDanhSach = (ten: string) => luaChon.some((x) => boDau(x) === boDau(ten) || tenNgan(x) === tenNgan(ten));
        // Tên phường có NẰM TRONG CHỮ KHÁCH không (bỏ dấu) — AI chọn một phường ngoài danh sách đã kể thì chỉ nhận khi khách thật sự gõ tên đó
        // ("cái đầu" → AI đoán Bến Thành: không nhận, ZZZZZI-03).
        const khachGoTen = (ten: string) => { const k = tenNgan(ten); return k.length >= 3 && boDau(text).includes(k); };
        let phuongNoi: Phuong | null = null;
        if (coGoiY && laCheDoAi && bongAi) {
          const kqLc = await bongAi;
          // Bắn production 12/10: model thật đặt phường khách chọn vào `tra_loi` (trả lời câu phường đang treo), không vào `truong` — đọc cả hai.
          const ungVien = kqLc?.ket ? [
            ...(kqLc.truong ?? []).filter((t) => t.khoa === "phuong").map((t) => ({ gia_tri: t.gia_tri, trich_dan: t.trich_dan })),
            ...(kqLc.traLoi?.co_tra_loi ? [{ gia_tri: kqLc.traLoi.gia_tri, trich_dan: kqLc.traLoi.trich_dan }] : []),
          ] : [];
          for (const t of ungVien) {
            if (!trichCoTrongTin(t.trich_dan ?? "", text)) continue;
            const v = String(t.gia_tri ?? "");
            const pc = trongDanhSach(v) ? phuongCot(v, luaChonQuan[v] ?? luaChonQuan[`Phường ${v}`] ?? quanDoiChieu) ?? phuongCot(v, null) : null;
            phuongNoi = pc ?? (khachGoTen(v) ? phuongCot(v, quanDoiChieu) ?? phuongCot(v, null) : null);
            if (phuongNoi) break;
          }
        }
        if (coGoiY && !phuongNoi) {
          const tachKhach = tachTienToPhuong(dapAn);
          phuongNoi = (tachKhach ? phuongCot(tachKhach.ten_day_du, quanDoiChieu) ?? phuongCot(tachKhach.ten_day_du, null) : null) ?? phuongNhacTrongCau(dapAn, quanDoiChieu);
        }
        // Tên phường TRÙNG TÊN QUẬN đang được nhắc như quận ("bình thạnh mà em" khi hỏi chọn quận, "tân phú em" khi gợi ý Tây Thạnh thuộc Quận Tân
        // Phú): khách đang nói QUẬN, không phải phường cùng tên — nhường cho đường chọn quận (SRS-5.1zzzzzb) / gật gợi ý. Chỉ khi khách gõ rõ
        // tiền tố "phường …" mới là phường.
        const gatQuanGoiY = !!goiYPhuong?.doi_quan && nhacTenQuan(dapAn, goiYPhuong.quan);
        if (phuongNoi && !tachTienToPhuong(dapAn) &&
          ((chonQuanTin && tenNgan(phuongNoi.ten) === tenNgan(quanTinGoiY)) || (gatQuanGoiY && tenNgan(phuongNoi.ten) === tenNgan(goiYPhuong!.quan)))) {
          phuongNoi = null;
        }
        if (phuongNoi) {
          const ten = tenDayDu(phuongNoi);
          const quan = luaChonQuan[ten] ?? (goiYPhuong?.phuong === ten ? goiYPhuong.quan : null) ?? phuongNoi.quan_cu ?? quanTinGoiY ?? "";
          const doiQuan = !!quanTinGoiY && !!quan && !cungQuan(quan, quanTinGoiY);
          if (goiYPhuong && goiYPhuong.phuong !== ten) console.log("chat-reply: khach goi ten phuong khac phuong goi y", goiYPhuong.phuong, "->", ten);
          goiYPhuong = { phuong: ten, quan, duong: goiYPhuong?.duong ?? "", ...(doiQuan ? { doi_quan: true } : {}) };
          dapAn = ten; nhanGoiYPhuong = true;
        } else if (goiYPhuong && !chonQuanTin &&
          (await gatLuot(() => laDongY(dapAn)) || (!!goiYPhuong.doi_quan && nhacTenQuan(dapAn, goiYPhuong.quan)))) {
          dapAn = goiYPhuong.phuong; nhanGoiYPhuong = true;
        }
        // SRS-5.1zk (bắn thử thu-dc4-08: hỏi phường, khách "nhà ở 77 hẻm 3m Xô Viết Nghệ Tĩnh" → địa chỉ luật giữ "3m"): chế độ
        // `ai` — địa chỉ trong câu trả lời câu phường lấy của AI (bỏ bề rộng), tên đường AI ghi cột street; luật chỉ khi AI hỏng.
        const kqAiPhuong = laCheDoAi && bongAi ? await bongAi : null;
        const acPhuong = kqAiPhuong?.ket ? docAiChinh(kiemDeXuat(kqAiPhuong.truong, text, { quan: quanChacCua(pendingReq.listings) }).dat, null) : null;
        const viTriTuCau = (s: string): string | null => {
          if (!acPhuong) return bocViTriRao(s);
          if (acPhuong.duong && acPhuong.tenDuong) duongAiGhi = { id: pendingReq.listing_id, ten: acPhuong.tenDuong };
          return acPhuong.duong;
        };
        // Từ điển đã tìm ra phường trong câu ("156 đường 59 Tây Thông Hội") → câu phường đã trả lời; phần địa chỉ ghi vào vị
        // trí nếu tin chưa có địa chỉ.
        if (!nhanGoiYPhuong && phuongTuDien) {
          const viTriPd = !pendingReq.listings?.location_raw ? viTriGhiDuoc(viTriTuCau(dapAn)) : null;
          if (viTriPd) {
            const { error: vpErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: "vi_tri", p_answer: viTriPd, p_source: "seller_chat",
            });
            if (vpErr) await ghiLoi(client, "chat-reply ghi_fact_listing(vi_tri kem phuong tu dien)", vpErr.message);
          }
          dapAn = phuongTuDien;
        }
        // FR-209 b: bot hỏi phường mà chủ nhà trả lời bằng ĐỊA CHỈ ("hẻm 12 Lê Văn Việt")
        // → đó là vị trí, không phải phường (bản trước ghi nguyên địa chỉ vào cột phường).
        // Ghi vi_tri, tra phường từ tên đường rồi hỏi xác nhận; câu phường vẫn treo.
        const coPhuongSo = /(?:phường|phuong|(?<![\p{L}])p)\s*\.?\s*\d{1,2}(?!\d)/iu.test(dapAn);
        // 17/09/2026 (Zalo thật): "Nhà trong hẻm 2 xẹc nhưng hẻm rộng 5m…" trả lời câu phường
        // từng ĐÈ địa chỉ "Căn số 14 ở Ny'ah Phú Định" đã có. Địa chỉ đã có thì không ghi
        // lại từ câu lệch; muốn sửa địa chỉ thì nói rõ (FR-164).
        if (!nhanGoiYPhuong && !kqDuyet && !humanActive && !coPhuongSo && !tachTienToPhuong(dapAn) && !pendingReq.listings?.location_raw) {
          const viTriTL = viTriGhiDuoc(viTriTuCau(dapAn));
          // FR-212: đối chiếu tên đường với từ điển trước khi ghi.
          const duongTL = viTriTL ? await suaTenDuong(viTriTL, pendingReq.listings?.district, pendingReq.listings?.ward) : null;
          const viTri = duongTL?.viTri ?? viTriTL;
          if (viTri) {
            const { error: vtErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: "vi_tri", p_answer: viTri, p_source: "seller_chat",
            });
            if (vtErr) await ghiLoi(client, "chat-reply ghi_fact_listing(vi_tri thay phuong)", vtErr.message);
            // 15/09/2026 (bắn thật C3): "hẻm 5m Cách Mạng Tháng 8, 4x14 nở hậu 5m" trả lời
            // câu phường → chỉ vi_tri được ghi, "4x14" và "nở hậu 5m" rơi mất. Fact khác
            // đi kèm ghi luôn như nhánh khớp ở dưới; vi_tri/phường đã có đường riêng.
            for (const f of nhanDienNhieuFact(dapAn)) {
              if (f.question === "vi_tri" || f.question === "phuong" || f.question === "bo_sung") continue;
              const { error: kErr } = await ghiFact(client, {
                p_listing_id: pendingReq.listing_id, p_question: f.question, p_answer: f.answer, p_source: "seller_chat", goc: gocCua(f),
              });
              if (kErr) await ghiLoi(client, "chat-reply ghi_fact_listing(kem vi_tri)", kErr.message);
              else await chepSangDuAn(f.question, f.answer);
            }
            const cauDuong = duongTL?.goiY ? await cauHoiDuongGoiY(pendingReq.listing_id, duongTL.goiY, cachGoi) : null;
            const cauGoiY = cauDuong ? null : await cauHoiPhuongGoiY(pendingReq.listing_id, tenDuong(viTri), cachGoi, text);
            const quanMacDinh = (btRow?.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh === true || !pendingReq.listings?.district;
            const cauPhuong = cauDuong ?? cauGoiY ?? cauHoiMau(quanMacDinh ? "phuong@chua_quan" : "phuong", cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, undefined, viTri);
            return await traLoiSeller([`Dạ em ghi địa chỉ ${viTri} rồi ạ. ${cauPhuong}`], {
              saved_fact: "vi_tri", reask: "phuong", loai_cau: cauGoiY ? "goi_y_phuong" : "hoi_lai",
            });
          }
        }
      }
      // 24/09/2026 (chủ dự án test Zalo, trả lời bằng TRÍCH tin cũ: "đã trả lời rồi này"): câu phàn nàn từng thành "thông tin
      // bổ sung" và bot hỏi lại lần ba. Nay đọc lại ≤ 3 tin gần nhất của chủ nhà, tin nào trả lời được câu đang treo thì
      // lấy làm câu trả lời; không có thì xin lỗi và hỏi lại MỘT câu, không ghi gì vào tin.
      let dapAnTuTinTruoc = false;
      // SRS-5.1zzzzzzz18: "đã trả lời rồi" do AI đọc (y_dinh da_noi_roi, có trích dẫn) — từ khoá ≤ 8 chữ chỉ đỡ khi AI không chạy.
      const ydDaNoi = await yDinhAi();
      if ((ydDaNoi !== undefined ? ydDaNoi?.loai === "da_noi_roi" : laNoiDaTraLoi(dapAn)) && !humanActive) {
        const tinTruoc = lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => boBaoLai(m.body) ?? "")
          // 27/09/2026 (test Zalo): "Giá 8.000.000.000" nằm cách "Cái giá hồi nãy đó" năm tin — đọc lại 8 tin.
          .map((b) => b.replace(/\[ảnh:[^\]]*\]/giu, " ").trim()).filter(Boolean).slice(-8).reverse();
        // 27/09/2026 (test Zalo): hỏi "lên thổ cư được không", khách "nói ở trên rồi mà" → vơ tin "ko có gì hết" (trả lời câu HẠ
        // TẦNG) làm đáp án. Câu CÓ / KHÔNG thì tin cũ phải nói đúng chủ đề (luật nhận ra cùng họ), không chỉ "khớp" trơn.
        // FR-239 c: câu giá thì tin cũ phải có SỐ TIỀN ("Chưa xây gì hết em nhà cấp 4" từng thành giá).
        const cu = tinTruoc.find((b) => !laNoiDaTraLoi(b) && phanLoaiCauTraLoi(pendingReq.question, b).loai === "khop" &&
          (pendingReq.question !== "gia" || docTien(b) != null) &&
          (!laCauCoKhong(pendingReq.question) || nhanDienNhieuFact(b).some((f) => cungHoFact(f.question, pendingReq.question))));
        // FR-239 c (phát lại test 27/09): đang hỏi hạ tầng, khách "Cái giá hồi nãy đó" → bot xin lỗi "chưa thấy lô đất có
        // vướng cột điện…" — khách nhắc GIÁ chứ không nói về câu đang hỏi. Câu nhắc tới giá mà tin đã có giá → nhắc lại đúng
        // giá đã ghi rồi hỏi lại câu đang treo, không ghi gì.
        const nhacGia = pendingReq.question !== "gia" && /\bgia\b/.test(boDau(dapAn)) && pendingReq.listings?.price_raw;
        if (!cu && nhacGia) {
          return await traLoiSeller(
            [`Dạ giá ${cachGoi} nói hồi nãy là ${donViGiaDep(String(pendingReq.listings!.price_raw))}, em ghi rồi ạ. ${cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal)}`],
            { reask: pendingReq.question, loai_cau: "nhac_gia" },
          );
        }
        if (cu) {
          dapAn = cu;
          dapAnTuTinTruoc = true;
        } else {
          return await traLoiSeller(
            [`Dạ em xin lỗi ${cachGoi}, em đọc lại mà chưa thấy ${NHAN_HOI_LAI[pendingReq.question] ?? FACT_LABELS[pendingReq.question] ?? "câu đó"}. ${CachGoi} nhắn lại giúp em một chút nha.`],
            { reask: pendingReq.question, loai_cau: "da_tra_loi" },
          );
        }
      }
      // 24/09/2026 (chủ dự án test Zalo: "sao nó ko biết và tự nhân 5x16 vậy, nó dài 16 mà đưa vào thông tin bổ sung à"):
      // đang hỏi diện tích, lượt trước đã nói "ngang 5m" → "dài 16m" trần là chiều còn lại, không phải câu lệch.
      {
        const ghep = ghepMotChieu(pendingReq.question, dapAn, pendingReq.listings?.frontage_m, pendingReq.listings?.length_m);
        if (ghep) dapAn = ghep;
      }
      // 24/09/2026 (chủ dự án: "137/28 nghĩa là đường số 59 hẻm 137 và nhà số 28"): tin đã có tên đường mà chưa có số,
      // chủ nhắn số nhà có gạch chéo ở đầu câu → ghép "137/28 Đường số 59" vào địa chỉ; phần còn lại mới là câu trả lời
      // câu đang treo (bản trước: đang hỏi diện tích, "137/28" thành "137m2").
      // Fact số nhà ghép TRONG lượt này không phải "lượt trước chủ né câu hỏi" (đếm `daNe` bên dưới) — từng làm câu diện
      // tích hết hạn ngay lần hỏi đầu (bắn lại 24/09 k1-ban-gv2). Đánh dấu bằng cờ, không so giờ (giờ edge ≠ giờ DB).
      let ghiSoNhaLuot = false;
      {
        const sn = pendingReq.question !== "vi_tri" ? soNhaDau(dapAn) : null;
        const lr = (pendingReq.listings?.location_raw ?? "").trim();
        if (sn && lr && !/^\d/.test(lr) && !/\d\/\d/.test(lr)) {
          const { error: snErr } = await ghiFact(client, {
            p_listing_id: pendingReq.listing_id, p_question: "vi_tri", p_answer: `${sn.soNha} ${lr}`, p_source: "seller_chat",
          });
          if (snErr) await ghiLoi(client, "chat-reply ghi_fact_listing(so nha)", snErr.message);
          else {
            ghiSoNhaLuot = true;
            soNhaGhep = `${sn.soNha} ${lr}`;
            // Tin CHỈ có số nhà ("số 45 nha") → không còn gì để trả lời câu đang hỏi (bản trước: "số 45" thành phường).
            // Câu đáp để model viết (chủ dự án 25/09: "ko cần khóa câu cố định"), nhưng dặn đúng ý ở `viSao` bên dưới —
            // lời dặn chung "có thể hiểu nhầm" từng ra "Số 45 là số nhà hả anh, em hiểu nhầm" (bắn thật lx-21).
            dapAn = sn.conLai;
          }
        }
      }
      let kq: KetQuaKhop = pendingReq.question === "loai_bds"
        ? { loai: "khop" }
        : kqDuyet ?? phanLoaiCauTraLoi(pendingReq.question, dapAn);
      // 01/10/2026: từ điển địa danh đã ra tên phường CHUẨN cho tin này (`phuongTuDien`) — luật tìm-chuỗi nhận câu là
      // "nói sang ô phường" thì lấy tên chuẩn, không ghi lại chữ thô khách gõ ("phường thảo điền" → Phường An Khánh).
      if (phuongTuDien && kq.chuyenSang?.question === "phuong") kq = { ...kq, chuyenSang: { ...kq.chuyenSang, answer: phuongTuDien } };
      // 01/10/2026: AI đọc tin có HỎI LẠI không (đọc sớm: cả đường "AI im → luật đọc ô khác" lẫn đường ghi bổ sung cần biết).
      const hoiAi = await hoiLaiAi(dapAn);
      // 01/10/2026: AI đọc thấy chủ nhà BỰC (có trích dẫn) mà tin không trả lời câu đang hỏi → hoãn: xin lỗi, thôi hỏi lượt này.
      const camAi = await camXucAi();
      // Đợt 2 (02/10/2026): chế độ `ai` → HOÃN khi AI nói hoãn (bận / để sau, có trích dẫn) hoặc bực; luật tìm-chuỗi nhận
      // "hoãn" một mình không đủ (AI đã đọc cả câu). AI không chạy → như cũ.
      const ydHoan = kqDuyet ? undefined : await yDinhAi();
      // SRS-5.1zzzzzc: bực mà khách muốn làm tiếp (`bucMaLamTiep`) thì không hoãn.
      const bucLui = camAi?.muc === "buc" && !(await bucMaLamTiep(ydHoan));
      if (ydHoan !== undefined) {
        if ((ydHoan?.loai === "hoan" || bucLui) && kq.loai !== "khop") kq = { loai: "hoan" };
        else if (kq.loai === "hoan") kq = { loai: "lech" };
      } else if (camAi?.muc === "buc" && kq.loai !== "khop" && !kqDuyet) kq = { loai: "hoan" };
      // 20/09/2026 (bắn thật mau-y-D): "à sửa lại, dài 16 chứ không phải 15" là LỜI SỬA kích thước —
      // đang hỏi giá thì vào bổ sung, đang hỏi kết cấu thì bị nhận là kết cấu (có số). Xử TRƯỚC mọi
      // luật: ghi ô ngang/dài (fact `mat_tien` đủ hai chiều, ngang lấy từ tin nếu câu không nói — DB
      // đọc "dài 16m" trần sẽ lấy 16 làm ngang), rồi coi câu là LỆCH để câu treo giữ nguyên.
      let suaKtDaGhi = false;
      {
        // 14/10/2026 (SRS-5.1zzzzzzz17): AI đã đọc tin thì lời sửa kích thước do AI quyết (ô `mat_tien` / `chieu_dai` / `cap_nhat`, qua
        // kiểm trích dẫn) — luật từ khoá "sửa lại / chứ không phải" chỉ đỡ khi AI không chạy.
        const aiDocTinNay = laCheDoAi && !!bongAi && !!(await bongAi)?.ket;
        const sua = aiDocTinNay ? { laSua: false, ngang: null, dai: null, con: dapAn } : gonLoiSua(dapAn);
        if (sua.laSua && (sua.ngang || sua.dai) && !kqDuyet && !/^dien_tich/.test(pendingReq.question) && pendingReq.question !== "mat_tien") {
          const { data: kt } = await client.from("listings").select("frontage_m, length_m").eq("id", pendingReq.listing_id).maybeSingle();
          const cu = kt as { frontage_m?: number | string | null; length_m?: number | string | null } | null;
          const ngang = sua.ngang ?? (cu?.frontage_m != null ? String(cu.frontage_m) : null);
          const dai = sua.dai ?? (cu?.length_m != null ? String(cu.length_m) : null);
          const dapKt = ngang && dai ? `ngang ${ngang}m dài ${dai}m` : ngang ? `${ngang}m` : null;
          if (dapKt) {
            const { error: ktErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: "mat_tien", p_answer: dapKt, p_source: "seller_chat",
            });
            if (ktErr) await ghiLoi(client, "chat-reply ghi_fact_listing(sua kich thuoc)", ktErr.message);
            else { suaKtDaGhi = true; kq = { loai: "lech" }; }
          }
        }
      }
      // 17/09/2026 (chủ dự án: "đừng tách AI và luật xa nhau, AI đọc trước và trả kiến thức cho luật
      // lưu"): chế độ `ghi` — AI (đã chạy song song, qua kiểm bằng chứng + khoảng) đọc ra giá trị cho
      // ĐÚNG câu bot đang hỏi → luật lấy giá trị đó ghi ("shr, nhà ở từ 2019" → pháp lý "sổ hồng
      // riêng"). Luật đang khớp với mảnh ngắn, sạch thì giữ của luật; câu có đường riêng (phường,
      // vị trí, loại, ảnh, duyệt, chấm điểm, chọn căn) không đụng. Fact luật nhận ra lệch ô vẫn ghi.
      // 21/09/2026 (chủ dự án: "đảo tầng: AI đọc là đường chính có kiểm bằng chứng"): chế độ `chinh` —
      // CHỜ lượt AI (đã chạy song song) TRƯỚC khi luật quyết. AI đọc ra giá trị cho câu đang hỏi → lấy
      // của AI, bất kể luật nói khớp/lệch/ừ (trừ hoãn, xưng hô). AI chạy xong mà KHÔNG thấy bằng chứng
      // cho khoá đang hỏi trong khi luật nói "khớp" → coi là LỆCH ("có làm hợp đồng phân phối không"
      // từng thành pháp lý). Fact kèm do AI quyết (`factKem`): luật chỉ còn đỡ khoá AI không có chỗ nói.
      // Model hỏng / trả rỗng → `aiChinh` null → toàn bộ đường luật y như cũ.
      // 24/09/2026 (chủ dự án test Zalo): "4x14, trệt 1 lầu" khi hỏi diện tích — AI chỉ trả diện tích, luật đọc được
      // "trệt 1 lầu" nhưng kết cấu là khoá AI nói → rơi mất, bot hỏi lại "mấy tầng". Kết cấu dạng CHẮC (trệt…, N tầng/
      // N lầu/N tấm) mà câu không có chữ giả định ("được xây", "xây thêm", "tối đa", "cách … là nhà") thì luật nói thay.
      const ketCauChac = (f: { question: string; answer: string }, cau: string) => f.question === "ket_cau" &&
        /^(?:nh[aà]\s+)?(?:h[ầa]m\s*\+?\s*)?(?:tr[ệe]t\b|\d{1,2}\s*(?:t[ầa]ng|l[ầa]u|t[ấa]m)\b)/iu.test(f.answer.trim()) &&
        !/\b(?:duoc xay|xay duoc|xay them|dinh xay|se xay|toi da|cho phep|quy hoach|cach|ben canh|ke ben|hang xom)\b/.test(boDau(cau));
      // 24/09/2026 (chủ dự án test Zalo): "ngang 5m daifm shr, hxh quay đầu" — AI bỏ sót "shr", pháp lý là khoá AI nói → rơi.
      // "shr / sổ hồng riêng / sổ riêng" không mơ hồ; câu không có "chưa / đang làm / chờ / chung" thì luật nói thay.
      const phapLyChac = (f: { question: string; answer: string }) => f.question === "phap_ly" &&
        /\b(?:shr|so hong rieng|so rieng)\b/.test(boDau(f.answer)) && !/\b(?:chua|dang lam|cho|khong|ko|chung)\b/.test(boDau(f.answer));
      // FR-223 (bắn thật 24/09, rn-test-c): "chưa có sổ em, đang chờ ra sổ" khi đang hỏi pháp lý — AI im, luật "AI im = lệch"
      // gạt vào bổ sung, câu pháp lý treo mãi và nhánh "chưa sổ → hỏi bao giờ ra sổ" không chạy. Cụm CHƯA SỔ rõ ràng là câu trả
      // lời pháp lý chắc (giữ nguyên chữ khách, KHÔNG đổi thành "sổ hồng riêng" — F2).
      const phapLyChuaSo = (f: { question: string; answer: string }) => f.question === "phap_ly" &&
        /\b(?:chua co so|chua ra so|cho so|cho ra so|dang lam so|hdmb|hop dong mua ban|vi bang|giay tay)\b/.test(boDau(f.answer));
      // 30/09/2026 (bắn thử bán lx-ban-292b): "sổ hồng rồi em, phí quản lý 15k/m2" khi hỏi phí — AI chỉ trả phí, im về pháp lý;
      // luật đọc "sổ hồng" bị gạt → bot hỏi lại "đã ra sổ hồng chưa". Có sổ (không phủ định / chưa / chung) là câu pháp lý chắc;
      // giữ đúng chữ khách ("sổ hồng"), KHÔNG tự thêm "riêng".
      const phapLyCoSo = (f: { question: string; answer: string }) => f.question === "phap_ly" &&
        /^\s*(?:(?:co|da co|da ra)\s+)?(?:so hong|so do|so)(?:\s+(?:roi|a|nha|nhe|em|anh|chi))*\s*$/.test(boDau(f.answer)) &&
        !/\b(?:chua|dang lam|cho|khong|ko|chung)\b/.test(boDau(f.answer));
      // 24/09/2026 (chủ dự án: "sao nó hỏi lại vậy … nếu trường hợp tương tự nó hiểu ko"): "4 tầng, 4 phòng ngủ nhé" khi đang
      // hỏi kết cấu — AI chỉ trả phòng ngủ, im về kết cấu → luật "AI im = lệch" gạt mất "4 tầng", vào bổ sung, bot hỏi lại.
      // Luật đọc CHẮC cho đúng câu đang hỏi (kết cấu dạng chắc, "shr") thì AI im không gạt được — cho mọi khoá có luật chắc.
      /** Cả tin chỉ là MỘT số tiền ("8 tỉ", "9 tỷ rưỡi nha em", "giá 12 tỏi", "Giá 8.000.000.000") — luật đọc giá là chắc. */
      const laTienTron = (f: { question: string }, s: string) => f.question === "gia" &&
        /^\s*(?:gia\s*)?(?:la\s*)?(?:\d+(?:[.,]\d+)?\s*(?:ty|ti|toi|trieu|tr|cu)(?:\s*\d+|\s+ruoi|\s+mot|\s+hai)?|[1-9]\d{0,2}(?:[.,]\d{3}){2,}\s*(?:d|dong|vnd)?)(?:\s+(?:nha|nhe|em|a|thoi|anh|chi|do|nhen|nhe em))*\s*$/
          .test(boDau(s).replace(/[^a-z0-9.,\s]/g, " "));
      // Chế độ `ai`: AI im / nói "không trả lời" là AI quyết — luật không gỡ lại.
      const luatChacCauTreo = (q: string, s: string) => !laCheDoAi && (
        nhanDienNhieuFact(s).some((f) => f.question === q && (ketCauChac(f, s) || phapLyChac(f) || phapLyChuaSo(f))) ||
        (q === "phap_ly" && phapLyChuaSo({ question: q, answer: s })) ||
        // FR-241 o: cả tin là đúng một câu pháp lý / một tên phường ("sổ chung", "xã Vĩnh Lộc A") trả lời đúng câu đang hỏi.
        laTraLoiTronKhoa(q, s) ||
        // FR-223 (bắn thật 24/09, rn-test-h): hỏi tiền thuê, khách đáp "150 triệu một tháng" — AI xếp vào gia hoặc im → câu rơi
        // bổ sung. Số tiền đơn vị triệu trả lời câu tiền thuê là chắc.
        (q === "doanh_thu" && /\d+(?:[.,]\d+)?\s*(?:trieu|tr)\b/.test(boDau(s))) ||
        // 25/09/2026 (ảnh chat thật): hỏi hẻm, khách đáp "hxh" / "hẻm xe hơi" / "ô tô vô tận nhà" — AI được dặn "không có số
        // mét thì không phải độ rộng hẻm" nên im, luật gạt vào bổ sung rồi hỏi lại số mét ba lần. Loại đường vào là câu trả lời chắc.
        ((q === "do_rong_hem" || q === "do_rong_duong") && LOAI_DUONG_VAO_RE.test(boDau(s))));
      let aiChinh: (AiChinh & { kienThuc: string[] }) | null = null;
      let khongBietCau: string | null = null; // SRS-5.1zzzzz: cụm "không biết" điều đang hỏi (AI, trích dẫn đã kiểm)
      const cheDoAiTreo = bongAi && cheDoBocAi ? await cheDoBocAi : "tat";
      // Câu có đường riêng (`CAU_KHONG_LAY_AI`: phường, vị trí, ảnh…): AI không quyết GIÁ TRỊ câu treo,
      // nhưng ở chế độ `chinh` vẫn quyết FACT KÈM (bắn thật 21/09 mau-v-03: trả lời câu phường bằng
      // "ngang 5 dài 20, hẻm xe hơi" → luật ghi độ rộng hẻm = "hẻm xe hơi").
      const layChoCauTreo = !CAU_KHONG_LAY_AI.has(pendingReq.question) || (cheDoAiTreo === "chinh" && CAU_AI_DOC_TRUOC_LUAT_DO.has(pendingReq.question));
      if (!suaKtDaGhi && !xacNhanGhi && bongAi && !kqDuyet && ((cheDoAiTreo === "ghi" && layChoCauTreo) || cheDoAiTreo === "chinh")) {
        const kqAi = await bongAi;
        const dongTreo = (pendingReq.listings ?? null) as unknown as DongDb | null;
        // SRS-5.1zzzzu: loại tin còn trống → trích dẫn loại / ý giao dịch ở tin chủ nhà trước cũng nhận (`kiemYCuocRao`).
        const loaiTrong = !pendingReq.listings?.property_type || pendingReq.listings.property_type === "chua_ro";
        // SRS-5.1zzzzzy: "Tại đường Trương Đình Hội" model xếp vào kien_thuc → thành đề xuất duong (code kiểm như đề xuất của model).
        const datAi = !kqAi ? [] : boSungDiaChiTuKienThuc(loaiTrong
          ? kiemYCuocRao(kqAi.truong, text, tinChuNhaGoc().join("\n"), { quan: quanChacCua(pendingReq.listings), cauDangHoi: pendingReq.question }).dat
          : kiemDeXuat(kqAi.truong, text, { quan: quanChacCua(pendingReq.listings), cauDangHoi: pendingReq.question }).dat, kqAi.kienThuc, text);
        // FR-224 (25/09/2026, chủ dự án: "bắt theo nguyên cả câu của khách để AI đọc lại"): chế độ `chinh`, AI đọc NGUYÊN tin
        // và trả lời thẳng câu đang hỏi (`tra_loi`, đã kiểm trích dẫn + con số). Câu SỐ CHẶT (tiền, diện tích, kích thước) vẫn
        // lấy giá trị ô đã chuẩn hoá của AI (`giaTriChoCauTreo`); câu khác lấy nguyên câu trả lời của AI ("hẻm xe hơi vào tận
        // nhà", "chưa có sổ, đang chờ ra sổ") — DB tự đọc cột từ chữ. Vị trí / phường giữ đường riêng.
        const traLoiAi0 = cheDoAiTreo === "chinh" && kqAi?.ket && layChoCauTreo && !dapAnTuTinTruoc && !CAU_AI_DOC_TRUOC_LUAT_DO.has(pendingReq.question)
          ? kiemTraLoiCau(kqAi.traLoi, text, cauBotThat, { cauHoi: pendingReq.question, loai: pendingReq.listings?.property_type ?? null }) : null;
        // SRS-5.1zzw: một cụm chỉ trả lời một ô — cụm trích của câu trả lời mà cùng lượt đã thuộc ô KHÁC (đề xuất AI + fact luật) thì
        // AI nói "có trả lời" cũng không tính ("anh đứng tên, không thế chấp" khi hỏi gấp / hỏi hẻm). Câu treo đi đường lệch như AI nói không.
        const traLoiAi1 = traLoiAi0?.co && traLoiThuocOKhac(kqAi?.traLoi?.trich_dan, pendingReq.question, datAi, laCheDoAi ? [] /* SRS-5.1zzzzzzz17: chỉ cụm AI trích */ : nhanDienNhieuFact(text), traLoiAi0.giaTri)
          ? (console.log("chat-reply: tra_loi thuoc o khac", pendingReq.question), { co: false, giaTri: null })
          : traLoiAi0;
        // SRS-5.1zzzzzd: hai lượt AI nói ngược nhau — bóc tách đưa câu trả lời ("ko biết cái" cho ô thổ cư) trong khi lượt ý ngắn đọc ra
        // chủ nhà KHÔNG BIẾT điều đang hỏi (trích dẫn đã kiểm). Lời không biết không bao giờ là giá trị: tín hiệu chuyên của AI thắng, câu
        // treo đi đường "không biết" bên dưới. Thay luật từ khoá `laLoiKhongBiet` (5.1zzzzzc) — đoán nghĩa bằng danh sách chữ.
        const oAi0 = kqAi && layChoCauTreo ? giaTriChoCauTreo(datAi, pendingReq.question, dongTreo) : null;
        const aiKhongBiet = (traLoiAi1?.giaTri || oAi0) ? !!(await khongBietAi()) : false;
        if (aiKhongBiet) console.log("chat-reply: AI dua gia tri nhung AI doc khong biet", pendingReq.question);
        const traLoiAi = aiKhongBiet ? { co: false, giaTri: null } : traLoiAi1;
        const oAi = aiKhongBiet ? null : oAi0;
        // SRS-5.1zzzzzx: câu SỐ CHẶT lấy ô chuẩn hoá của AI; khách chỉ GẬT câu bot XÁC NHẬN ("… 80m² đó có đúng không ạ?") thì không có ô nào
        // (số không nằm trong lời khách) — giá trị đã qua `kiemTraLoiCau` (đối chiếu số với câu bot) là bằng chứng duy nhất, lấy nó.
        const gatCauXacNhanBot = laChiGat(text) && laCauHoiXacNhan(cauBotThat);
        const dapAnAi0 = CAU_SO_CHAT.has(pendingReq.question) ? (oAi ?? (gatCauXacNhanBot ? traLoiAi?.giaTri ?? null : null)) : (traLoiAi?.giaTri ?? oAi);
        // 22/09/2026: câu treo VỊ TRÍ — bản luật chứa bản AI mà dài hơn (có số nhà / hẻm) thì lấy luật.
        // 30/09/2026 (bắn thật lx-ban-f): AI trả "o q10" cho câu địa chỉ — chỉ có quận, không phải địa chỉ; luật để câu treo.
        // Khách vừa gật phường bot gợi ý (`nhanGoiYPhuong`) → phường là phường gợi ý, AI không đè ("tân phú em" ≠ Phường Tân Phú).
        const dapAnAi = pendingReq.question === "phuong" && (phuongTuDien || nhanGoiYPhuong) ? null
          : pendingReq.question === "vi_tri" && laChiDonViHanhChinh(dapAn) ? null
          // SRS-5.1zk: chế độ `ai` — địa chỉ AI viết (số nhà, số hẻm, tên đường; bỏ bề rộng) đi thẳng, luật không ghép thêm.
          : pendingReq.question === "vi_tri" && dapAnAi0 ? (laCheDoAi ? dapAnAi0 : chonViTri(bocViTriRao(dapAn), dapAnAi0)) : dapAnAi0;
        if (cheDoAiTreo === "chinh" && kqAi?.ket) {
          aiChinh = { ...docAiChinh(datAi, dongTreo), kienThuc: kiemKienThuc(kqAi.kienThuc ?? [], text, datAi) };
          if (laCheDoAi && aiChinh.tenDuong) duongAiGhi = { id: pendingReq.listing_id, ten: aiChinh.tenDuong };
          // FR-226: khách nói thêm / sửa một phần ô đang ghi ("số 45 nha" khi địa chỉ đang là "Ngô Y Linh") → AI gộp, code
          // kiểm, rồi đi chung đường fact kèm (câu khớp lẫn câu lệch). Ô đang hỏi thì để đường trả lời câu treo lo.
          capNhatLuot = kiemCapNhat(kqAi.capNhat ?? [], text, dangGhiCua(pendingReq.listings))
            .filter((c) => c.question !== pendingReq.question && !(c.question === "vi_tri" && ghiSoNhaLuot));
          if (capNhatLuot.length) {
            aiChinh = {
              ...aiChinh,
              ghi: [...aiChinh.ghi.filter((g) => !capNhatLuot.some((c) => c.question === g.question)), ...capNhatLuot.map((c) => ({ ...c, khoa: "cap_nhat" }))],
              kienThuc: aiChinh.kienThuc.filter((k) => !laTrongCapNhat(k, capNhatLuot)),
            };
          }
          // SRS-5.1zzzzzc (11/10/2026, khách mô phỏng lần năm): bỏ nhánh "AI IM HẲN → luật đọc fact kèm" (01/10, lx-tam-02/03). AI im
          // là AI đã đọc mà không thấy ô nào — chính câu luật của chế độ này ("AI im / nói không trả lời là AI quyết"). Nhánh đó là lỗ:
          // mọi lượt AI không đưa ô (trả lời câu lửng "không bạn, 2 tầng đủ rồi", câu gật, câu kể chuyện) thì luật tìm-chuỗi ghi NGUYÊN
          // CÂU vào ô nó đoán ("kết cấu: không bạn, 2 tầng đủ rồi") rồi câu đó ra tin công khai. Ca gốc của nhánh ("không gấp em" khi
          // hỏi phường) nay AI đọc được — luật bóc tách dặn đọc `gap` theo nghĩa "kể cả khi bot đang hỏi câu khác".
        }
        const aiThang = !!dapAnAi && (aiChinh
          ? kq.loai !== "hoan" && kq.loai !== "xung_ho"
          : (kq.loai === "lech" || kq.loai === "ack" || (kq.loai === "khop" && (dapAn.length > 40 || /[,;]/.test(dapAn)))));
        if (aiThang) {
          if (!aiChinh && kq.chuyenSang && kq.chuyenSang.question !== pendingReq.question) {
            const { error: csErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: kq.chuyenSang.question, p_answer: kq.chuyenSang.answer, p_source: "seller_chat",
            });
            if (csErr) await ghiLoi(client, "chat-reply ghi_fact_listing(kem ai truoc)", csErr.message);
          }
          const hoiKem = kq.hoiNguoc ?? (kq.loai === "hoi" ? dapAn : undefined);
          kq = { loai: "khop", ...(hoiKem ? { hoiNguoc: hoiKem } : {}) };
          loaiDapAn = dapAnAi;
        } else if (aiChinh && layChoCauTreo && kq.loai === "khop" &&
          // FR-224: AI nói thẳng "tin này KHÔNG trả lời câu đang hỏi" → lệch, với MỌI câu (kể cả câu theo loại nhà AI không có ô).
          // AI nói CÓ mà câu trả lời không qua kiểm → để luật đọc. AI không nói gì (bản cũ) → như trước: chỉ khoá AI có ô.
          // SRS-5.1zzzzzo (test Zalo 13/10: hỏi địa chỉ, khách "Con đăng theo nội dung này cho Chú" → luật thấy "cho" = "chợ", ghi làm
          // địa chỉ): vị trí / phường cũng theo AI khi AI ĐÃ nói không trả lời; chỉ khi AI im hẳn thì luật mới đỡ (`CAU_AI_DOC_TRUOC_LUAT_DO`).
          (traLoiAi ? !traLoiAi.co
            : pendingReq.question === "vi_tri"
            ? cheDoAiTreo === "chinh" && !!kqAi?.ket && kqAi.traLoi?.co_tra_loi === false && !datAi.some((d) => ["vi_tri", "duong", "phuong", "quan"].includes(d.khoa))
            : !CAU_AI_DOC_TRUOC_LUAT_DO.has(pendingReq.question) && KHOA_FACT_AI_BIET.has(pendingReq.question)) &&
          !dapAnTuTinTruoc && !luatChacCauTreo(pendingReq.question, dapAn)) {
          kq = { loai: "lech" };
        }
        // SRS-5.1zzzzz (11/10/2026, khách mô phỏng ban-cut: hỏi đường, khách "ko biết cụ thể đường, chỉ biết xã thôi" → AI không
        // đưa địa chỉ, luật địa chỉ thấy chữ "xã" nên ghi địa chỉ = "Ko biết cụ thể đường", in lên tiêu đề tin). AI đọc ra chủ nhà
        // KHÔNG BIẾT điều đang hỏi và không đưa giá trị nào cho câu đó → câu treo không lấy chữ của luật, với MỌI câu (vị trí /
        // phường vốn "AI trống thì luật đỡ" — `CAU_AI_DOC_TRUOC_LUAT_DO`). Fact kèm của AI vẫn đi đường lệch như cũ.
        if (cheDoAiTreo === "chinh" && kqAi?.ket && !dapAnAi && CAU_KHONG_BIET_DUOC(pendingReq.question)) {
          khongBietCau = await khongBietAi() ?? null;
          if (khongBietCau && kq.loai !== "hoan") {
            console.log("chat-reply: khach khong biet cau treo", pendingReq.question, `«${khongBietCau}»`);
            kq = { loai: "lech" };
          }
        }
        // 27/09/2026 (chủ dự án test Zalo): "Ngang có 3 m" rồi "Nhưng dài tới 14 m" khi bot đang hỏi kết cấu — chiều dài trơn
        // ghép với ngang đã có thành diện tích, không rơi vào bổ sung.
        if (kq.loai === "lech" && kq.chuyenSang && /^dien_tich/.test(kq.chuyenSang.question)) {
          const ghepLech = ghepMotChieu("dien_tich", kq.chuyenSang.answer, pendingReq.listings?.frontage_m, null);
          if (ghepLech) kq = { ...kq, chuyenSang: { question: "dien_tich", answer: ghepLech } };
        }
        if (aiChinh && kq.loai === "lech") {
          // Luật nhận "một nẻo" ra khoá X mà AI không thấy X → thay bằng fact AI đọc được (nếu có);
          // không có gì thì bỏ `chuyenSang` để rơi về ghi nguyên văn (`bo_sung`), câu vẫn treo.
          const kem = aiChinh.ghi.filter((g) => g.question !== pendingReq.question);
          // Giữ NGUYÊN tham chiếu phần tử của `aiChinh.ghi` để chỗ ghi biết nguồn là ai_kiem.
          // 27/09/2026 (chủ dự án test Zalo, căn Botanic): đang hỏi hẻm, khách nhắn "8 tỉ" — AI im, luật đọc ra giá mà bị gạt
          // (khoá AI biết) → câu vào "bổ sung", bot phải hỏi giá lại. Cả tin CHỈ là một số tiền thì luật chắc, giữ.
          // Chế độ `ai`: luật không giữ gì — AI im là AI quyết (SRS-5.1zzzzzc bỏ nhánh "AI im hẳn").
          const giuLuat = !!kq.chuyenSang && !kem.some((f) => f.question === kq.chuyenSang!.question) && (
            !laCheDoAi && (laTienTron(kq.chuyenSang, dapAn) || (kq.chuyenSang.question === "dien_tich" && /^ngang \S+m dài \S+m$/.test(kq.chuyenSang.answer)) ||
              // 27/09/2026 (test Zalo): "312 Nguyễn Thuơbgj Hiền" khi đang hỏi hẻm — số nhà + tên đường là địa chỉ chắc.
              (kq.chuyenSang.question === "vi_tri" && laSoNhaTenDuong(dapAn)) ||
              // FR-241 o (bắn lại 28/09, lx-85/87): cả tin là đúng một câu pháp lý ("sổ chung") hay một tên phường/xã ("xã Vĩnh
              // Lộc A") — AI im thì luật bị gạt, pháp lý rơi bổ sung, phường mất hẳn (bổ sung coi tên phường là rác).
              laTraLoiTronKhoa(kq.chuyenSang.question, dapAn)));
          // 01/10/2026 (lx-tt-08): luật và AI cùng đọc ra MỘT ô ("shr" → pháp lý) — giá trị AI đã chuẩn hoá ("sổ hồng riêng")
          // thắng chữ thô của luật ("shr"); trước đây chữ thô đi thẳng vào tin.
          const cungKhoaAi = kq.chuyenSang ? kem.find((f) => f.question === kq.chuyenSang!.question) : undefined;
          if (cungKhoaAi) kq = { ...kq, chuyenSang: cungKhoaAi };
          else if (!giuLuat && kq.chuyenSang && !kem.some((f) => f.question === kq.chuyenSang!.question)) {
            kq = { ...kq, chuyenSang: kem[0] };
          } else if (!kq.chuyenSang && kem[0]) kq = { ...kq, chuyenSang: kem[0] };
        }
      }
      /** Fact KÈM trong câu trả lời: chế độ `chinh` (AI đã chạy) → AI quyết, luật chỉ đỡ khoá AI không biết. */
      // 22/09/2026 (bắn thật căn hộ): "sổ hồng riêng, full nội thất, có thang máy, view sông" — AI xếp "sổ hồng
      // riêng" vào KIẾN THỨC THÊM (thành bo_sung lúc ra) chứ không phải `phap_ly`, nên câu kế hỏi lại pháp lý.
      // AI KHÔNG NÓI ≠ AI PHỦ ĐỊNH: khoá AI biết mà AI không trả, và chính chữ đó nằm trong kiến thức thêm
      // của AI (AI thấy nhưng không xếp ô) thì luật xếp. AI có trả khoá đó thì AI vẫn thắng như FR-208 f.
      const aiKienThuc = (aiChinh?.kienThuc ?? []).map((k) => boDau(k));
      // 22/09/2026 (kịch bản D): "nở hậu 4m5", "đang thế chấp", "cho thuê 30 triệu/tháng" — AI không trả khoá, cũng
      // không xếp vào kiến thức thêm → rơi. Khoá có BẰNG CHỨNG rõ trong chữ khách (số đo / cụm chữ đặc thù) mà AI
      // im thì luật ghi; AI có trả khoá đó thì AI vẫn thắng.
      // 25/09/2026 (bắn thật lx-22): "hxh, 5x12, trệt 3 lầu" khi hỏi hẻm — AI im về diện tích, luật đọc "5x12" chắc chắn mà bị
      // gạt (khoá AI biết) → bot hỏi lại diện tích. Kích thước dạng "AxB" không mơ hồ → luật nói thay khi AI im.
      const kichThuocChac = (f: { question: string; answer: string }) =>
        (f.question === "dien_tich" || f.question === "dien_tich_dat") && /^\s*\d+(?:[.,]\d+)?\s*m?\s*x\s*\d+(?:[.,]\d+)?\s*m?\s*$/i.test(f.answer);
      // FR-241 e (10 ca test làm khó 28/09): "ngang 4 dài 15, 3 lầu 4 phòng, …" — AI xếp "3 lầu 4 phòng" vào kết cấu, im về phòng
      // ngủ; luật đọc 4 bị gạt → ô trống, bot hỏi lại số phòng ngủ khách vừa nói. Luật đọc "N phòng / N pn" là chắc.
      // SRS-5.1zzzo: `nguoi_dung_ten` nay là khoá AI — cùng nhóm câu sổ gộp với `the_chap`, luật có bằng chứng rõ ("đứng tên") nên đỡ như vậy.
      const KHOA_LUAT_DO_KHI_AI_IM = new Set(["no_hau", "doanh_thu", "so_wc", "cach_mat_tien", "nam_xay", "the_chap", "nguoi_dung_ten", "thang_may", "dien_tich_san", "do_rong_hem", "so_phong_ngu"]);
      // 27/09/2026 (bắn thật lx-36): "Ở cầu kho em ơi" khi hỏi phường → luật tiềm năng đọc "ở" là ĐỂ Ở và ghi kèm. Đang hỏi
      // địa chỉ thì "ở …" là NẰM Ở.
      const oLaNamO = (s: string) => cungHoFact("vi_tri", pendingReq.question) && /^\s*(?:nha\s+)?o\s/.test(boDau(s));
      const factKem = (s: string): Array<{ question: string; answer: string }> => (aiChinh
        ? [...aiChinh.ghi, ...nhanDienNhieuFact(s).filter((f) => f.question !== "bo_sung" && (
            !KHOA_FACT_AI_BIET.has(f.question) ||
            // SRS-5.1zzzzzr: căn hộ — AI `dien_tich_san` đã đổi khoá thành `dien_tich` (docAiChinh, SRS-5.1zr) thì luật đọc sàn cùng số
            // không được ghi thêm ô sàn (e2e AIBOC-11b trên căn hộ từng ra hai ô cùng một số).
            (!laCheDoAi && !aiChinh!.ghi.some((g) => g.question === f.question || (f.question === "dien_tich_san" && g.question === "dien_tich")) &&
              (aiKienThuc.some((k) => k.includes(boDau(f.answer)) || boDau(f.answer).includes(k)) ||
                KHOA_LUAT_DO_KHI_AI_IM.has(f.question) || ketCauChac(f, s) || phapLyChac(f) || phapLyChuaSo(f) || phapLyCoSo(f) || kichThuocChac(f)))))
            .map((f) => phapLyChac(f) ? { question: "phap_ly", answer: "sổ hồng riêng" } : f)]
        // 02/10/2026 (bắn thật thu-gap-04/06, SRS-5.1zd): AI im thì luật từng ghi ô CẦN HIỂU NGHĨA bằng mẩu câu — "hong có gấp gì hết"
        // → gấp = "gấp", "chưa cần tiền, bán chơi thôi" → gấp = "cần tiền" (mất phủ định). AI đã đọc mà không thấy thì khách không
        // nói rõ: luật chỉ còn được ghi ô dữ kiện chắc (số đo, số phòng, pháp lý…), không ghi ô phán đoán.
        : nhanDienNhieuFact(s)
      ).filter((f) => !(oLaNamO(s) && f.question === "tiem_nang"))
        // Từ điển đã ghi phường lượt này → phường / quận AI đoán không được đè (lx-tam-12: "Tây Thông Hội" → Xã Củ Chi).
        .filter((f) => !(phuongTuDien && (f.question === "phuong" || f.question === "quan")))
        .filter((f) => !(lungDaGhi && (f.question === "ket_cau" || f.question === "so_tang")));
      // 15/09/2026 (Zalo thật): vừa trả lời vừa HỎI NGƯỢC → ghi PHẦN trả lời, câu hỏi
      // của chủ nhà được trả lời TRƯỚC câu kế (không nuốt, không ghi cả câu vào ô).
      // 15/09/2026 (bắn thật A5): cả tin là MỘT câu hỏi ("bên bạn có cần mình gửi hình
      // không hay sao") → là hỏi ngược, KHÔNG phải "thông tin bổ sung" để ghi vào tin.
      // 01/10/2026: AI nói có hỏi không (`hoiLaiAi`) — luật từ khoá chỉ còn là lưới đỡ khi AI không chạy. Cả tin chỉ là câu
      // hỏi (AI không đọc ra dữ liệu nào) thì cả tin là câu hỏi: không ghi làm thông tin, không coi là câu trả lời.
      if (hoiAi?.caTin && kq.loai === "khop" && !kqDuyet && !xacNhanGhi) kq = { loai: "hoi" };
      const hoiNguoc = hoiAi !== undefined
        ? (hoiAi ? (hoiAi.caTin ? dapAn : (kq.hoiNguoc ?? hoiAi.cau)) : null)
        : kq.hoiNguoc ?? ((kq.loai === "hoi" || (kq.loai === "lech" && !kq.chuyenSang && laCauHoiTron(dapAn))) ? dapAn : null);
      if (kq.dapAn) dapAn = kq.dapAn;
      // 15/09/2026 (bắn thật F2): câu hỏi về ẢNH có đáp án của hệ thống → bong bóng tiền
      // định đứng trước, model chỉ hỏi tiếp (model từng bỏ qua lời dặn trả lời trước).
      const hoiNguocDap = hoiNguoc
        ? dapHoiNguocTienDinh(hoiNguoc, cachGoi, cauPhi(vaiPhi(sellerRow), pendingReq.listings?.deal ?? dealNguoi, { benEm: true }), hoiAi?.chuDe, botDaNoiGan(), viDuPhiNguoi(pendingReq.listings?.deal, pendingReq.listings?.price_vnd)) ?? await dapChuaCoDuLieu(hoiNguoc, hoiAi?.chuDe)
        : xinXoaLuot(dapAn) && !nhanDienFact(dapAn)
        ? "Dạ việc xoá dữ liệu em không tự làm được, để em nhờ anh chị phụ trách xử lý ạ."
        : null;
      if (hoiNguoc && hoiNguocDap) cauDaDap = hoiNguoc;
      // SRS-5.1zzzzz (khách mô phỏng 11/10, hoi-phi) từng nối câu hỏi vai sau câu phí không số khi khách hỏi lại. SRS-5.1zzzzzo (13/10) đổi
      // câu phí chưa rõ vai thành CẢ HAI mức, r3 đã bỏ câu hỏi vai; SRS-5.1zzzzzu bỏ nốt ở đây — câu phí là MỘT câu `cauPhi()`, không
      // nối thêm gì ở bất kỳ nhánh nào (lượt lên kệ nay mở câu `danh_gia`, nên câu hỏi phí sau đó đi vào nhánh câu treo này).
      // SRS-5.1zzzzv (bắn production 10/10, thu-cmp46-3: "sao chị biết em không lừa"): bong bóng trấn an tiền định (`traLoiSeller`, chủ của
      // lời trấn an) đã nói "không thu đồng nào trước, phí chỉ khi giao dịch thành công, đã báo người phụ trách" — model không biết nên
      // trấn an lại cùng ý. Một ý một nguồn: AI đọc ra nghi ngờ thì câu lệnh báo model ý đó đã được nói, model chỉ đi tiếp việc của lượt.
      const nghiNgoLuot = (await camXucAi())?.muc === "nghi_ngo";
      const hoiNguocPrompt = nghiNgoLuot
        ? DAN_DA_TRAN_AN
        : hoiNguoc
        ? hoiNguocDap
          ? `Tin chủ nhà có kèm một câu hỏi — câu đó đã được trả lời ở bong bóng gửi ngay trước tin em, và đã được bỏ khỏi tin chủ nhà dẫn trong câu lệnh này; em không biết và không nhắc tới nó, KHÔNG nói chữ "hệ thống". Tin em viết lúc này CHỈ gồm MỘT câu hỏi tiếp (được mở bằng "Dạ"), không câu ghi nhận. `
          : danTraLoiHoiNguoc(hoiNguoc, hoiAi?.chuDe)
        : "";
      // SRS-5.1zzzzo (bắn production 09/10/2026): "ủa mà bên em lấy phí nhiêu vậy" → câu phí KHÔNG số ("mức tuỳ chính chủ hay môi
      // giới" — vai chưa rõ, FEE_RULES), lượt sau "anh là chính chủ" → bot không nói gì về phí nữa, câu hỏi của khách bỏ lửng. Khách
      // vừa TỰ NÓI vai (nhãn đã thành `tu_nhan` ở `xetDoiNhan`) sau câu không số, chưa nghe câu có số → báo số NGAY, qua đúng chủ của
      // con số phí (`cauPhi(vaiPhi(…))`) — không chuỗi mới. Vai ngược nhãn (chờ admin đổi) thì `vaiPhi` vẫn "unknown" → không báo.
      const vaiPhiLuot = vaiPhi(sellerRow);
      const botDaNoi = lichSuRows.filter((m) => !laTinNguoi(m.sender)).map((m) => m.body ?? "");
      const dapPhiRoVai = !hoiNguoc && vaiTuNoiLuot && vaiPhiLuot !== "unknown" &&
          botDaNoi.some(coCauPhiChuaRoVai) && !botDaNoi.some(coCauPhiTheoVai)
        ? `Dạ vậy ${cauPhi(vaiPhiLuot, pendingReq.listings?.deal ?? dealNguoi, { benEm: true })} ạ.`
        : null;
      const phiRoVaiPrompt = dapPhiRoVai
        ? `Chủ nhà vừa cho biết mình là ${vaiTuNoiLuot === "moi_gioi" ? "môi giới" : "chính chủ"}; bong bóng gửi ngay trước tin em đã báo phí theo vai đó — KHÔNG nhắc phí, KHÔNG hỏi lại chủ nhà hay môi giới. `
        : "";
      // Chủ nhà CHẤM ĐIỂM cách chăm sóc (09/09/2026) → ghi fact + boc_tach, cảm
      // ơn ngắn, KHÔNG hỏi lại điểm, không gọi model. Câu hỏi ngược/ừ thì đường
      // hỏi lại chung ở dưới lo.
      // 22/09/2026: câu HỎI ("có khách nào hỏi chưa em") không phải điểm — `hoiVeTin` đã đỡ ở trên, đây chặn nốt.
      if (pendingReq.question === "danh_gia" && kq.loai === "khop" && !laCauHoiTron(dapAn) && !(ycLuot !== undefined ? !!ycLuot?.loai.startsWith("hoi_") : hoiVeTin(dapAn))) {
        const themXoa = xinXoaLuot(dapAn) ? `\nViệc xoá tin em không tự làm được, để em nhờ anh Thu xử lý giúp ${cachGoi} ạ.` : "";
        const camOn = `${await ghiDiemDanhGia(pendingReq.listing_id, pendingReq.id, dapAn)}\nCó khách quan tâm là em báo ${cachGoi} liền.` + themXoa;
        return await traLoiSeller([camOn], { saved_fact: "danh_gia", danh_gia: dapAn });
      }
      // 09/09 tối (chạy kịch bản lần 2): câu "địa chỉ cụ thể" treo MÃI — chủ nhà
      // cứ trả lời thứ khác (đều ghi đúng ô), bot cứ hỏi lại địa chỉ mỗi lượt,
      // không bao giờ tới bản nháp. Luật: câu hỏi bị NÉ 2 lần (2 fact khác đã
      // ghi từ lúc mở câu) hoặc chủ "ok/được/đăng đi" mà tin đã đủ điểm → THÔI
      // câu đó (expired), đi tiếp câu kế; vòng hỏi bù sẽ hỏi lại sau.
      let boQuaCauTreo = false;
      let ghiChuLech = false; // FR-233: câu lệch đã ghi chú, không hỏi lại — lời dặn model ở lượt đi tiếp
      let noiSangO: { question: string; answer: string } | null = null; // FR-234: câu trả lời thuộc ô khác, không hỏi lại
      let chuaTraLoi: string | null = null; // 01/10/2026: khách chưa trả lời câu treo (ừ, hỏi ngược, dặn xưng hô…) — thôi câu, không hỏi lại
      let gatDoanTp = false; // SRS-5.1zzzzm: khách chỉ gật phần ĐOÁN "ở Hồ Chí Minh đúng không" — câu địa chỉ chưa có trả lời, hỏi tiếp đường + phường
      // "ok / được / đăng đi" khi đang treo một câu thông số → chủ muốn ĐĂNG.
      // "ừ / dạ / vâng" trơ trọi chỉ là ừ (ack), KHÔNG phải muốn đăng (lần 3: "ừ"
      // làm hết hạn câu hẻm rồi đòi đăng tin 51 điểm).
      // 29/09/2026 (kịch bản K5): "đang trồng cây ăn trái" bỏ dấu là "dang trong…" — chữ "dang" khớp luật "đăng", bot đáp "em
      // đăng liền cho anh chị". Câu có dấu thì "đang" (không phải "đăng") thay bằng chữ không đọc được TRƯỚC khi bỏ dấu.
      const kdDang = boDau(dapAn.replace(/(?<![\p{L}])[đĐ]ang(?![\p{L}])/gu, "dxng")).replace(/[^a-z0-9\s]/g, " ").trim();
      // FR-229 (bắn e2e PL229-E3): câu "các bên đồng ý bán chưa" / "giá còn thương lượng không" — "đồng ý", "được", "ok" là
      // ĐÁP ÁN, không phải bảo đăng (trước đó "đồng ý hết rồi" bỏ luôn các câu pháp lý còn lại).
      // 27/09/2026 (test Zalo): bot hỏi "Ô tô vào được tận nhà không anh?", khách "Ok" → bị hiểu là "đăng đi". Câu bot vừa hỏi là
      // câu CÓ / KHÔNG thì "ok / được" là câu trả lời, không phải bảo đăng.
      const cauBotCuoi = boDau(lichSuRows.filter((m) => !laTinNguoi(m.sender)).map((m) => boBaoLai(m.body) ?? "").filter(Boolean).at(-1) ?? "");
      const botVuaHoiCoKhong = /\b(?:khong|chua)\s*(?:a|anh|chi|chu|co|bac|em|nhi|vay)?\s*[?]\s*$/.test(cauBotCuoi.trim());
      // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): "nha dang cho thue" (không dấu, trả lời câu hiện trạng) — chữ "dang" khớp
      // "đăng" → bỏ câu đang hỏi. AI đã đọc thì "bảo đăng" là ý định `du_roi` AI đọc ra; từ khoá chỉ khi AI không chạy.
      const ydDang = await yDinhAi();
      const chuMuonDang = pendingReq.question !== "duyet_tin" && pendingReq.question !== "loai_bds" &&
        pendingReq.question !== "danh_gia" && pendingReq.question !== "hinh_anh" &&
        pendingReq.question !== "dong_y_ban" && pendingReq.question !== "thuong_luong" && (ydDang !== undefined ? ydDang?.loai === "du_roi" :
        !(botVuaHoiCoKhong && !/\b(?:dang|len tin|len ke|post)\b/.test(kdDang)) &&
        (kdDang.split(/\s+/).length <= 6 &&
          (laDuRoi(dapAn) || /\b(dang|len tin|len ke|post)\b/.test(kdDang) ||
            (laDongY(dapAn) && /\b(ok|oke|okie|duoc|dc|chot|dong y|xong)\b/.test(kdDang))) || // lưới đỡ (AI không chạy)
          // 23/09/2026 (bắn thật căn hộ): "được giá thì bán em, ok đăng tin đi em" (9 chữ) — câu dài mà có lời
          // bảo ĐĂNG rõ ràng thì vẫn là muốn đăng; trước chỉ nhận câu ≤ 6 chữ nên cả câu thành "thông tin bổ sung".
          // 24/09/2026 (chủ dự án test Zalo): "…cần thông tin gì nữa không nếu không thì đăng bài đi" — "đăng bài" không
          // có trong danh sách nên cả câu thành câu trả lời hạn hợp đồng thuê, bot hỏi tiếp 3 câu.
          (/\b(?:dang tin|dang di|dang len|dang luon|dang bai|len tin|len ke|post tin|post bai|up tin|up bai)\b/.test(kdDang) &&
            !/\b(?:chua|khoan|dung|dung vo|khong|ko|dung co)\s+(?:dang|len)\b/.test(kdDang))));
      // FR-188 b (10/09): câu MỀM (gấp, lý do bán, thương lượng, tiềm năng) chỉ hỏi
      // MỘT lần — chủ dự án: "không hỏi lần thứ hai". Luật né-2-lần bên dưới đếm fact
      // ghi được sau khi mở câu, nên lần 7 đại diện CĐT bị hỏi "cần bán gấp không" ba
      // lượt liền (mỗi lượt chỉ ghi được một fact). Vòng hỏi bù hôm sau vẫn hỏi lại.
      // 20/09/2026 (bắn thật mau-y-B): "tối chị chụp ảnh gửi nhé, giờ đang bận" khi câu treo là GẤP
      // (câu mềm hỏi một lần) → câu bị hết hạn ở dưới rồi nhánh hoãn không tới lượt, bot hỏi tiếp thời
      // hạn thuê. Hoãn đứng TRƯỚC mọi luật hết hạn: đáp một câu, không hỏi thêm, câu vẫn treo.
      if (kq.loai === "hoan" && !humanActive) {
        const goi = cachGoiKhach(goiNguoi ?? kq.xungHo, sellerRow.nhom_tuoi);
        const phien = camAi?.muc === "buc" || /bận|mệt|hỏi (?:gì )?(?:hoài|lắm|nhiều|mãi)/i.test(text);
        const hua = khop(PROMISE_RE, PROMISE_RE_KD);
        // FR-234 (chủ dự án 28/09/2026: khách "cứ đăng như này trước đi, chiều anh gửi thêm thông tin với ảnh các thứ, h đang
        // bận"): vừa bảo ĐĂNG vừa hoãn → đăng luôn như hiện có (đóng dấu duyệt; đủ điểm là lên kệ), không hỏi thêm; lời hứa đã
        // có hẹn nhắc ở trên. Chưa đủ điểm thì nói thật còn thiếu gì — dấu duyệt giữ lại, đủ là tự lên kệ.
        if (await baoDangLuot(() => laBaoDang(text)) && pendingReq.question !== "duyet_tin" && pendingReq.question !== "danh_gia") {
          const loiHua = `Dạ ${goi} cứ lo việc nha, lúc nào ${goi} gửi thêm thông tin với ảnh là em cập nhật vào tin liền ạ.`;
          // FR-236 (bắn thật lx-43, 28/09): "hướng đông. đăng bài được chưa. a bận rồi" — hướng chỉ được ghi ở đường ra
          // (sau khi bản tin đã soạn) nên tin lên kệ thiếu dòng hướng. Thông tin đi kèm trong câu ghi TRƯỚC khi soạn tin.
          for (const f of factKem(dapAn)) {
            if (f.question === "gia" && pendingReq.question !== "gia" && CAU_HOI_TIEN.has(pendingReq.question)) continue;
            const { error: hkErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: f.question, p_answer: f.answer,
              p_source: aiChinh?.ghi.some((g) => g === f) ? NGUON_AI : "seller_chat", goc: gocCua(f),
            });
            if (hkErr) await ghiLoi(client, "chat-reply ghi_fact_listing(hoan dang)", hkErr.message);
            else await chepSangDuAn(f.question, f.answer);
          }
          const nhap = await guiBanNhap(pendingReq.listing_id, { hoan: true, loai_cau: "hoan", ...(hua ? { hua: true } : {}) }, false, [loiHua], true);
          if (!Array.isArray(nhap)) return nhap;
          const { error: ddErr } = await client.from("listings").update({ chu_duyet_at: new Date().toISOString() }).eq("id", pendingReq.listing_id);
          if (ddErr) await ghiLoi(client, "chat-reply dang luon(chua du diem)", ddErr.message);
          else daDuyetLuot = true; // SRS-5.1zzzzzzu
          const thieuN = nhap.slice(0, 2).join(" và ") || "vài thông tin";
          return await traLoiSeller(
            [`Dạ em ghi nhận ${goi} muốn đăng luôn. Tin mình còn thiếu ${thieuN} nên chưa lên được, lúc nào ${goi} rảnh gửi thêm thông tin với ảnh là em đăng liền, không hỏi lại ạ.`],
            { hoan: true, loai_cau: "hoan", dang_luon: true, thieu_dang: thieuN, ...(hua ? { hua: true } : {}) },
          );
        }
        const henTreo = hua ? "" : await datHenHoan(goi); // SRS-5.1zzzzzzi: lời hứa đã có nhắc riêng (4713) — không đặt hai lần
        const cauHoan = hua
          ? `Dạ em chờ ${goi} nha, lúc nào ${goi} rảnh gửi em là em cập nhật liền ạ.`
          : phien
          ? `Dạ em xin lỗi, em hỏi dồn quá.${henTreo} Lúc nào ${goi} rảnh nhắn em là em làm tiếp liền nha.`
          : `Dạ ${goi} cứ thong thả nha.${henTreo} Có gì ${goi} nhắn em là em làm tiếp liền.`;
        return await traLoiSeller([cauHoan], { hoan: true, loai_cau: "hoan", ...(hua ? { hua: true } : {}), ...(henTreo ? { hen_nhac: true } : {}) });
      }
      if (!boQuaCauTreo && kq.loai !== "khop" && HOI_MOT_LAN.has(pendingReq.question)) {
        const { error: mlErr } = await client.from("info_requests").update({ status: "expired" }).eq("id", pendingReq.id);
        if (mlErr) await ghiLoi(client, "chat-reply cau mem hoi mot lan", mlErr.message);
        boQuaCauTreo = true;
      }
      // 24/09/2026 (chủ dự án test Zalo): "6 tỷ 3 đăng đi" khi đang hỏi GIÁ — câu vừa TRẢ LỜI vừa bảo đăng. Bản
      // trước coi cả câu là "muốn đăng", bỏ qua câu treo → giá không đóng câu hỏi, bot nói "chỉ cần thêm…" rồi HỎI
      // LẠI GIÁ. Bỏ vỏ "đăng đi" mà phần còn lại khớp câu đang hỏi → ghi như câu trả lời, đóng câu, hỏi câu KẾ.
      const dapAnBoDang = dapAn.replace(/[\s,.]*(?:(?:ok|oke|okie|được|dc|rồi|thì)\s+)*(?:đăng|dang|lên|len|post|up)\s*(?:tin|bài|bai|đi|di|luôn|luon|kệ|ke|lên|len)?(?:\s+(?:đi|di|luôn|luon|em|e|nha|nhé|nhe|ạ|a|giúp|giùm|anh|chị|chi))*\s*[.!]*\s*$/iu, "").trim();
      // Phần còn lại là câu hỏi / điều kiện ("cần thông tin gì nữa không, nếu không thì") → không phải câu trả lời.
      const conLaHoi = /\?|\b(?:can|con)\s+(?:them\s+)?(?:thong tin\s+)?gi\s+nua\b|\b(?:neu\s+)?(?:khong|ko|k)\s+thi\s*$/.test(boDau(dapAnBoDang));
      const traLoiKemDang = chuMuonDang && dapAnBoDang.length >= 2 && dapAnBoDang !== dapAn.trim() && !conLaHoi &&
        phanLoaiCauTraLoi(pendingReq.question, dapAnBoDang).loai === "khop";
      if (traLoiKemDang) dapAn = dapAnBoDang;
      if (chuMuonDang && !traLoiKemDang) {
        // Chỉ bỏ câu treo khi tin ĐỦ điểm để gửi nháp; chưa đủ thì câu treo giữ nguyên
        // và nói rõ còn thiếu gì (xử ở dưới, sau khi đọc trạng thái tin).
        boQuaCauTreo = true;
      }
      // SRS-5.1zzzzm (chủ dự án test Zalo 09/10/2026: "đúng em ơi" → câu địa chỉ bị THÔI, bot hỏi "phường mấy, quận nào", đường
      // không được hỏi lại trước khi hết các câu khác): câu địa chỉ lần đầu KÈM PHỎNG ĐOÁN thành phố — gật là gật phần đoán, chưa
      // trả lời câu hỏi. Giữ câu địa chỉ, hỏi tiếp đường + phường trong MỘT câu (ô vẫn là `vi_tri`; phường trong câu trả lời địa chỉ
      // được ghi kèm). Gật do AI đọc (`gatLuot`, luật `laDongY` chỉ khi AI không chạy) — chế độ `ai` phân loại câu này là "lệch"
      // chứ không phải "ack", nên không dựa vào `kq.loai`. `cauBotCuoi` đã bỏ dấu.
      if (!boQuaCauTreo && pendingReq.question === "vi_tri" && kq.loai !== "khop" && !kq.chuyenSang && kq.loai !== "hoi" &&
          /(?:ho chi minh|sai gon|hcm)[^?]*dung khong/.test(cauBotCuoi)) {
        gatDoanTp = await gatLuot(() => laDongY(dapAn));
      }
      if (!boQuaCauTreo && kq.loai !== "khop" && pendingReq.question !== "duyet_tin" && pendingReq.question !== "loai_bds" &&
          pendingReq.question !== "danh_gia" && (kq.chuyenSang || kq.loai === "ack")) {
        let neQ = client.from("listing_facts")
          .select("id", { count: "exact", head: true })
          .eq("listing_id", pendingReq.listing_id)
          .neq("question", pendingReq.question)
          // FR-211: fact `nhan` do ganNhanChoTin ghi ở ĐƯỜNG RA của lượt trước (sau khi câu chờ
          // đã mở) — không phải khách né câu hỏi, đếm vào là hết hạn câu ngay lượt sau (e2e H3).
          .neq("question", "nhan")
          // FR-240 c (phát lại test 28/09 trên production): ghi chú (`bo_sung`) do đường ra của CHÍNH lượt mở câu ghi (AI đọc
          // "thổ cư" thành kiến thức thêm) cũng sau lúc mở câu — đếm vào là câu GIÁ hết hạn ngay lần né đầu, bot hỏi sang hướng
          // và không bao giờ hỏi lại giá. Ghi chú không phải "ô khác khách vừa trả lời".
          .neq("question", "bo_sung")
          .gt("created_at", pendingReq.created_at ?? new Date(0).toISOString());
        if (ghiSoNhaLuot) neQ = neQ.neq("question", "vi_tri");
        const { count: daNe } = await neQ;
        const gat = kq.loai === "ack" && await gatLuot(() => laDongY(dapAn));
        // 16/09/2026 (chủ dự án, sau khi câu phường bị hỏi 4 lượt liền ở mau-co-thue): một câu
        // hỏi TỐI ĐA 2 LẦN trong chat — hỏi, khách nói thứ khác, hỏi lại một lần, vẫn thứ khác
        // thì thôi, để vòng hỏi bù (ask-seller) hỏi hôm sau. Trước là né 2 lần (hỏi 3 lượt).
        // FR-234 (chủ dự án 28/09/2026 sau FR-233: bỏ luôn lần hỏi lại này): chủ nhà nói sang ô khác → ghi ô đó, thôi câu
        // đang hỏi, đi tiếp — không hỏi lại lần nào (trước: hỏi lại một lần, né lần hai mới thôi). `daNe` giữ cho sổ nhật ký.
        // Ô LÕI (diện tích, giá, vị trí, phường) thiếu thì tin không lên kệ được — nói sang ô khác vẫn hỏi lại MỘT lần như cũ
        // ("Ngang 5" khi hỏi diện tích là mới nửa câu trả lời). Ô khác thì thôi luôn.
        const CAU_LOI = ["dien_tich", "dien_tich_dat", "dien_tich_tim_tuong", "gia", "vi_tri", "phuong"];
        if ((kq.chuyenSang && (!CAU_LOI.includes(pendingReq.question) || (daNe ?? 0) >= 1)) || (gat && !gatDoanTp)) {
          if (kq.chuyenSang) console.log("chat-reply: noi sang o khac, thoi cau treo", pendingReq.question, "→", kq.chuyenSang.question, "da ne", daNe ?? 0);
          const { error: neErr } = await client.from("info_requests").update({ status: "expired" }).eq("id", pendingReq.id);
          if (neErr) await ghiLoi(client, "chat-reply bo qua cau treo", neErr.message);
          boQuaCauTreo = true;
          if (kq.chuyenSang) noiSangO = kq.chuyenSang;
        }
      }
      await capNhatQuan(pendingReq.listing_id);
      // 01/10/2026 (bắn thử lx-dd-51/53; chủ dự án: "có, hỏi lại được, tao muốn tương tác với khách nhiều hơn"): phường khách
      // nói thuộc QUẬN KHÁC quận tin đang ghi ("tay thnh" cho tin Quận 5 → Phường Tây Thạnh, Tân Phú) — không ghi thẳng, hỏi lại
      // "Phường X em thấy thuộc Y, mà tin mình đang ghi Z, nhà mình ở bên nào". Gật / gọi tên Y → ghi phường + đổi quận. Gọi
      // tên Z → giữ quận, hỏi lại phường.
      if (pendingReq.question === "phuong" && !humanActive && !kqDuyet) {
        const { data: lq, error: lqErr } = await client.from("listings").select("district, boc_tach").eq("id", pendingReq.listing_id).maybeSingle();
        if (lqErr) await ghiLoi(client, "chat-reply phuong lech quan(doc)", lqErr.message);
        const quanTin = lq?.district && (lq.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh !== true ? String(lq.district) : null;
        if (goiYPhuong?.doi_quan && !nhanGoiYPhuong && quanTin && nhacTenQuan(dapAn, quanTin)) {
          const { error: bErr } = await client.rpc("ghi_boc_tach", { p_listing_id: pendingReq.listing_id, p: { phuong_goi_y: false } });
          if (bErr) await ghiLoi(client, "chat-reply ghi_boc_tach(bo goi y lech quan)", bErr.message);
          return await traLoiSeller([`Dạ vậy nhà mình ở ${quanTin}, phường nào vậy ${cachGoiKhach(goiNguoi, sellerRow.nhom_tuoi)} ạ?`], { reask: "phuong", loai_cau: "phuong_lech_quan" });
        }
        if (quanTin && !nhanGoiYPhuong && kq.loai === "khop") {
          // Giá trị sắp ghi: của AI (`loaiDapAn`, đã kiểm bằng chứng — "tay thnh" → "Phường Tây Thạnh") hay chữ khách.
          const giaTriP = loaiDapAn ?? dapAn;
          const pc = phuongChuan(giaTriP);
          const tach = pc ? null : tachTienToPhuong(giaTriP);
          const w = (pc ? { ten_day_du: tenDayDu(pc), quan_cu: pc.quan_cu ?? null } : await timWard(((tach?.ten ?? giaTriP) || "").trim())) ?? phuongLechLuot;
          if (w?.quan_cu && !cungQuan(w.quan_cu, quanTin)) {
            const goiY: GoiYPhuong = { phuong: w.ten_day_du, quan: w.quan_cu, duong: "", doi_quan: true };
            const { error: gErr } = await client.rpc("ghi_boc_tach", { p_listing_id: pendingReq.listing_id, p: { phuong_goi_y: goiY } });
            if (gErr) await ghiLoi(client, "chat-reply ghi_boc_tach(phuong lech quan)", gErr.message);
            else {
              const g = cachGoiKhach(goiNguoi, sellerRow.nhom_tuoi);
              return await traLoiSeller(
                [`Dạ ${w.ten_day_du} em thấy thuộc ${w.quan_cu} cũ, mà tin nhà mình em đang ghi ${quanTin}. Nhà mình ở ${w.quan_cu} hay ${quanTin} vậy ${g}?`],
                { reask: "phuong", loai_cau: "phuong_lech_quan" },
              );
            }
          }
        }
      }
      if (pendingReq.question === "phuong" && (nhanGoiYPhuong || kq.loai === "khop")) {
        const chuan = await capNhatQuanTuPhuong(pendingReq.listing_id, nhanGoiYPhuong ? goiYPhuong : null, dapAn, text);
        if (chuan) dapAn = chuan;
      }
      if (kq.loai !== "khop" && !boQuaCauTreo) {
        // 11/09/2026 (42 ca): bận / để hỏi vợ / hỏi hoài → dừng THẬT: không ghi,
        // không hỏi, câu vẫn treo cho vòng hỏi bù sau. Câu tiền định, không model —
        // đường model bị dặn "câu hỏi cuối tin BẮT BUỘC" nên cứ hỏi tiếp (38 từ).
        if (kq.loai === "hoan" && !humanActive) {
          const goi = cachGoiKhach(goiNguoi ?? kq.xungHo, sellerRow.nhom_tuoi);
          const phien = camAi?.muc === "buc" || /bận|mệt|hỏi (?:gì )?(?:hoài|lắm|nhiều|mãi)/i.test(text);
          const henTreo2 = await datHenHoan(goi); // SRS-5.1zzzzzzi
          const cauHoan = phien
            ? `Dạ em xin lỗi, em hỏi dồn quá.${henTreo2} Lúc nào ${goi} rảnh nhắn em là em làm tiếp liền nha.`
            : `Dạ ${goi} cứ thong thả nha.${henTreo2} Có gì ${goi} nhắn em là em làm tiếp liền.`;
          return await traLoiSeller([cauHoan], { hoan: true, loai_cau: "hoan", ...(henTreo2 ? { hen_nhac: true } : {}) });
        }
        // 11/09/2026 (42 ca): một con số trần kèm mét ("4m") khi đang hỏi ĐỊA CHỈ /
        // PHƯỜNG — không biết là hẻm hay ngang. Bản trước ghi "4m" vào thông tin bổ
        // sung rồi model báo "em ghi nhận hẻm 4m rồi" (không cột nào mang giá trị
        // đó). Hỏi lại cho rõ; không ghi, không đoán. Câu khác (hướng, pháp lý…) giữ
        // đường hỏi lại cũ — "16m nha" khi hỏi hướng vẫn là câu lệch (e2e G3).
        const soTran = /^\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:m|mét|met)\s*(?:nha|nhe|nhé|ạ|a|em)?\s*[.!]?\s*$/i.exec(text);
        if (kq.loai === "lech" && !kq.chuyenSang && soTran && !humanActive &&
            (pendingReq.question === "vi_tri" || pendingReq.question === "phuong")) {
          return await traLoiSeller(
            [`${soTran[1]}m là hẻm trước nhà hay ngang mặt tiền vậy ${goiNguoi ?? "ạ"}?`],
            { reask: pendingReq.question, loai_cau: "so_tran" },
          );
        }
        // "Ngang 5" khi đang hỏi diện tích: vẫn là dữ liệu thật — ghi đúng
        // fact (mặt tiền) chứ không vứt, còn câu diện tích thì giữ treo.
        // 22/09/2026 (bắn lại kịch bản D, chế độ `chinh`): đang hỏi GIÁ, chủ nhà nói "đang cho thuê 30 triệu/tháng, đang
        // thế chấp, nở hậu 4m5" — AI không trả khoá nào → `chuyenSang` trống → cả câu rơi về bo_sung dù luật đọc được
        // ba fact có bằng chứng rõ (`KHOA_LUAT_DO_KHI_AI_IM` trong `factKem`). Lệch mà AI im thì vẫn hỏi luật.
        let daGhiChuLech = false; // FR-233: câu lệch không vào được ô nào nhưng đã ghi chú nguyên văn / kiến thức AI
        const kemLech = !kq.chuyenSang && aiChinh && kq.loai === "lech"
          ? factKem(dapAn).filter((f) => f.question !== pendingReq.question && f.question !== "bo_sung")
          : [];
        if (kq.chuyenSang || kemLech.length) {
          // Câu lệch mang NHIỀU fact ("Đường 12m, hướng Bắc") thì ghi hết, không
          // chỉ fact đầu (09/09 tối). Fact trùng khoá đang hỏi thì để đường khớp lo.
          const cacFact = (kq.chuyenSang
            ? [kq.chuyenSang, ...factKem(dapAn).filter((f) => f.question !== kq.chuyenSang!.question)]
            : kemLech).filter((f) => f.question !== pendingReq.question);
          for (const f of cacFact) {
            const { error: csErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: f.question,
              p_answer: f.answer, p_source: aiChinh?.ghi.some((g) => g === f) ? NGUON_AI : "seller_chat", goc: gocCua(f),
            });
            if (csErr) await ghiLoi(client, "chat-reply ghi_fact_listing(chuyen sang)", csErr.message);
            // FR-195: nhánh TRẢ LỜI LỆCH cũng phải chép sang kho dự án. Bắt 10/09:
            // chủ nhà đang được hỏi phường mà kể phí quản lý — fact vào tin đúng,
            // nhưng hàng chờ duyệt trống vì chỗ này chưa nối dây.
            else await chepSangDuAn(f.question, f.answer);
          }
        } else if (kq.loai === "lech" && pendingReq.question !== "duyet_tin" && hoiNguoc !== dapAn) {
          // FR-177 e: không nhận ra fact nào thì VẪN ghi nguyên văn (`bo_sung`)
          // — chủ dự án 07/09: "hỏi một đường trả lời một nẻo thì vẫn phải ghi
          // nhận câu trả lời của khách". Câu hỏi gốc vẫn treo. Cả tin là câu hỏi
          // (`hoiNguoc === dapAn`) thì không ghi — đó là câu để TRẢ LỜI.
          // 20/09/2026 (bắn thật mau-y-D): "à sửa lại, dài 16 chứ không phải 15" là LỜI SỬA kích
          // thước — vào ô ngang/dài (fact `mat_tien`, DB đọc "ngang 4m dài 16m"), không vào bổ sung;
          // lời sửa khác không nhận ra thì ghi phần dữ liệu đã bỏ vỏ "sửa lại … chứ không phải".
          const sua = gonLoiSua(dapAn);
          let ghiBoSung: string | null = dapAn;
          if (suaKtDaGhi) ghiBoSung = null;
          else if (gatDoanTp) ghiBoSung = null; // SRS-5.1zzzzm: gật phần đoán thành phố — không phải thông tin căn nhà
          else if (sua.laSua) ghiBoSung = sua.con.length >= 2 ? sua.con : null;
          // 21/09/2026 ("làm cả 4"): tin CHỈ có emoji/dấu ("😂😂", "👍👍") không phải thông tin căn nhà; lời nói
          // với bot ("xóa hết dữ liệu của anh đi", "cái câu này đọc kỳ") cũng không — không ghi `bo_sung`.
          else if (!/[\p{L}\p{N}]/u.test(dapAn)) ghiBoSung = null;
          else if (laNoiVoiBot(dapAn) && !nhanDienFact(dapAn)) ghiBoSung = null;
          // 22/09/2026 (kịch bản E): "tui là sale nha, ko phải chủ" là tự giới thiệu, không phải dữ liệu căn;
          // câu có SĐT thì không bao giờ vào bo_sung (§5 — bo_sung ra tin, tin ra web).
          else if (/\b(?:tui|toi|minh|em|e|anh|chi)\s+la\s+(?:sale|moi gioi|mg|chu|chinh chu|ccrb|nmg)\b|\b(?:ko|khong|k)\s+phai\s+(?:chu|chinh chu)\b/.test(boDau(dapAn)) && !nhanDienFact(dapAn)) ghiBoSung = null;
          else if (coSdt(dapAn)) ghiBoSung = null;
          // Đợt 2 (02/10/2026): chế độ `ai`, AI đã đọc câu này → chỉ ý AI đọc ra (`kien_thuc`, nguyên văn) vào bổ sung (đường ra ghi);
          // AI không thấy ý nào về căn nhà thì không ghi nguyên câu — thay chuỗi lọc từ khoá bên dưới (tự giới thiệu, nói với bot,
          // rác, câu hỏi…), vốn luôn thiếu cách nói mới.
          else if (laCheDoAi && aiChinh) ghiBoSung = null;
          // 24/09/2026 (tin thật: hỏi phường, khách đáp "Quận 1 em ơi"): còn < 2 chữ hoặc chỉ là tên quận / phường → rác.
          // 07/10/2026 (SRS-5.1zzza): "đúng rồi e. nhà a ở quận 5" — gật phần đoán + chỉ quận (quận đã vào cột), không phải ghi chú.
          else if (laBoSungRac(dapAn) || laChiDonViHanhChinh(dapAn)) ghiBoSung = null;
          // 01/10/2026: câu HỎI không bao giờ là thông tin căn nhà — AI nói hỏi, hoặc lưới từ khoá nhận ra dáng hỏi.
          else if (hoiAi || laCauHoiTron(dapAn)) ghiBoSung = null;
          // 01/10/2026 (e2e CX-05): câu bày tỏ cảm xúc (AI đọc có trích dẫn — bực, nghi ngờ, muốn dừng) không phải thông tin căn nhà
          // ("chắc bên này lừa rồi" từng vào "📝 Thêm" của tin, tức ra cả web).
          else if (camAi) ghiBoSung = null;
          // Bắn thử 01/10 (lx-tam-21): trả lời bản nháp bằng "3 phòng" → AI ghi phòng ngủ 3 mà câu vẫn vào "📝 Thêm: 3 phòng".
          // Tin NGẮN (≤ 4 chữ) mà AI đã ghi được ô từ đó → chính là ô đó, không phải thông tin thêm.
          else if (aiChinh?.ghi.length && dapAn.trim().split(/\s+/).length <= 4) ghiBoSung = null;
          // Chế độ `chinh`: AI đã đọc ra kiến thức từ câu này → đường ra ghi `bo_sung` nguồn ai_kiem
          // (`ghiBongBocTach`), không ghi nguyên văn lần hai. AI không đọc ra gì → nguyên văn như cũ.
          else if (aiChinh && aiChinh.kienThuc.length) ghiBoSung = null;
          if (ghiBoSung) {
            const { error: bsErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: "bo_sung",
              p_answer: ghiBoSung, p_source: "seller_chat",
            });
            if (bsErr) await ghiLoi(client, "chat-reply ghi_fact_listing(bo sung)", bsErr.message);
            else daGhiChuLech = true;
          } else if (aiChinh && aiChinh.kienThuc.length) daGhiChuLech = true;
        }
        if (humanActive) {
          return await traLoiSeller([], { reask: pendingReq.question, loai_cau: kq.loai });
        }
        // FR-233 (chủ dự án 27/09/2026: "mấy cái mày ko ghi được vào db thì để AI nó xét qua … chứ mày cứ hỏi nhiều quá
        // và ko được tự nhiên"): câu lệch KHÔNG đọc ra ô nào mà đã ghi chú nguyên văn (bo_sung — vào vector của tin, AI đọc
        // lại khi cần) → KHÔNG hỏi lại câu đó; thôi câu treo, đi tiếp câu kế như vừa trả lời xong. Hỏi ngược, chỉ nói
        // quận / số nhà, lời sửa… vẫn đường cũ.
        // 01/10/2026 (bắn thử lx-tt-01/02/05/06/08/10 — "phường nào" / "đường nào" hỏi hai lần liền; chủ dự án: "không được hỏi
        // lại lần nào hết"). LỚP LỖI: mặc định của đường này là HỎI LẠI câu treo khi khách chưa trả lời, rồi từng bản vá gỡ một
        // ngoại lệ (FR-233 câu lệch đã ghi chú, FR-234 nói sang ô khác trừ ô lõi) — ô lõi, câu ừ/ok, câu hỏi ngược, dặn xưng hô
        // vẫn bị hỏi lại. Nay ĐẢO mặc định: một câu chỉ hỏi MỘT lần trong chat; khách nói gì khác thì ghi được gì ghi nấy, thôi
        // câu đó, đi tiếp câu kế (câu đã thôi thì vòng hỏi bù cũng không hỏi lại — FR-186 o). Còn hỏi tiếp CHỈ khi khách trả lời MỘT PHẦN của chính câu đó
        // (chỉ nói quận khi hỏi phường, chỉ quận / số nhà khi hỏi địa chỉ, chỉ ngang khi hỏi diện tích) — câu kế hỏi phần còn thiếu,
        // không phải câu cũ — và các câu chốt luồng (duyệt bản nháp, loại BĐS, xác nhận lịch, còn bán, ngưng rao căn nào).
        const CAU_CHOT_LUONG = ["duyet_tin", "loai_bds", "xac_nhan_lich", "con_ban", "ngung_rao_can_nao", "xac_nhan_ngung_hang_loat"];
        const traLoiMotPhan = gatDoanTp || (pendingReq.question === "phuong" && laChiQuan(dapAn)) || (!!soNhaGhep && !dapAn.trim()) ||
          (pendingReq.question === "vi_tri" && laChiDonViHanhChinh(dapAn)) ||
          (/^dien_tich/.test(pendingReq.question) && kq.chuyenSang?.question === "mat_tien");
        // SRS-5.1zzzzo (bắn production 09/10/2026: đang hỏi "sổ riêng hay sổ chung", khách "ủa mà bên em lấy phí nhiêu vậy" → bot trả lời
        // phí rồi hỏi "mấy phòng ngủ"; câu sổ bị THÔI và không bao giờ được hỏi lại trước bản nháp). LƯỢT BÊN LỀ — khách hỏi bên em một
        // câu (`hoiNguoc`, AI đọc theo nghĩa) hay tự nói vai (`vaiTuNoiLuot`), không đưa dữ liệu nào: khách CHƯA trả lời câu đang hỏi,
        // cũng không né nó (không nói sang ô khác). Câu đó vẫn mở, trả lời chuyện bên lề rồi quay lại nó (r2b) — không chọn câu kế.
        // Chặn trên: đã có hai lượt khách từ lúc mở câu mà chưa trả lời (câu đã hỏi ba lần) → thôi như cũ, để không hỏi dồn.
        const moCau = pendingReq.created_at ?? null;
        // SRS-5.1zzzzzza (e2e H7 đỏ sau khi bản nháp thành BA bong bóng): đếm trên `lichSuDai` (40 dòng), không trên cửa sổ 9 dòng
        // `lichSuRows` — cửa sổ đó đếm cả bong bóng bot, bot nói nhiều bong bóng là lượt khách cũ rơi khỏi cửa sổ và số đếm sai.
        // Đếm lượt khách TRƯỚC lượt này (tin vừa nhắn đã nằm trong sổ ở dòng mới nhất — bỏ nó, như `lichSuRows` đã bỏ).
        const soLuotTreo = moCau
          ? ((lichSuDai ?? []) as Array<{ sender: string; created_at?: string | null }>)
            .filter((m, i) => !(i === 0 && laTinNguoi(m.sender)) && laTinNguoi(m.sender) && !!m.created_at && m.created_at > moCau).length
          : 0;
        const luotBenLe = !kq.chuyenSang && !kemLech.length && !daGhiChuLech && kq.loai !== "xung_ho" && kq.loai !== "ack" &&
          (!!hoiNguoc || !!vaiTuNoiLuot) && soLuotTreo < 2;
        // SRS-5.1zzzzz: chủ nhà nói KHÔNG BIẾT điều đang hỏi → thôi câu, kể cả khi họ có nói một phần (chỉ quận / chỉ xã) — hỏi tiếp
        // phần còn thiếu chính là hỏi lại điều họ vừa nói không biết.
        const khongHoiLai = !CAU_CHOT_LUONG.includes(pendingReq.question) && (!!khongBietCau || (!traLoiMotPhan && !luotBenLe));
        if (khongHoiLai) {
          const { error: klErr } = await client.from("info_requests").update({ status: "expired" }).eq("id", pendingReq.id);
          if (klErr) await ghiLoi(client, "chat-reply thoi cau lech (ghi chu)", klErr.message);
          boQuaCauTreo = true;
          // Fact của câu lệch đã ghi ở trên — đường ghi kèm phía dưới không ghi lại (`ghiChuLech` chặn), lời dặn model nói đúng chuyện.
          ghiChuLech = true;
          const oKhac = kq.chuyenSang ?? kemLech[0] ?? null;
          const nhanTreo = FACT_LABELS[pendingReq.question] ?? pendingReq.question;
          if (oKhac) noiSangO = oKhac;
          if (khongBietCau) {
            // Nhớ ô khách không biết (`boc_tach.khong_biet`): câu kế, vòng hỏi lại ô lõi và hỏi bù đều bỏ qua ô đó (`khongHoiAi`,
            // ask-seller). Ô lõi để lên kệ (phường) được nhắc lại MỘT lần lúc chủ nhà muốn đăng, kèm cách tìm (`cauThieuDeDang`).
            await ghiKhongBiet(pendingReq.listing_id, pendingReq.listings?.boc_tach, pendingReq.question);
            // SRS-5.1zzzzze: không biết PHƯỜNG mà bảo đăng → một chỗ nói chuyện thiếu phường (`noiThieuDeDang`, cách (b)); model không được
            // tự hứa "đăng trước được" hay hỏi lại phường.
            const ydKb = await yDinhAi();
            if (pendingReq.question === "phuong" && (ydKb?.loai === "du_roi" || await baoDangLuot(() => laChiLenhDang(text)))) {
              const tdKb = await noiThieuDeDang(pendingReq.listing_id);
              return await traLoiSeller([tdKb.cau], tdKb.meta);
            }
            chuaTraLoi = `Chủ nhà nói không biết "${nhanTreo}" («${khongBietCau}») — đáp nhẹ một tiếng là không sao, KHÔNG hỏi lại câu đó, ` +
              `KHÔNG nói đã ghi "${nhanTreo}". `;
          } else if (!oKhac && !daGhiChuLech) {
            chuaTraLoi = kq.loai === "xung_ho"
              ? `Chủ nhà dặn gọi họ là "${kq.xungHo}": nhận bằng một câu thật ngắn, từ nay gọi đúng vậy. KHÔNG hỏi lại câu "${nhanTreo}". `
              : `Chủ nhà chưa trả lời câu "${nhanTreo}" em vừa hỏi — KHÔNG hỏi lại câu đó, KHÔNG bảo chủ nhà hiểu nhầm, KHÔNG nói đã ghi "${nhanTreo}". `;
          }
          console.log("chat-reply: khong hoi lai cau treo", pendingReq.question, kq.loai);
        } else {
        // 13/09/2026 (bắn thật): đất Củ Chi câu đầu hỏi xã, câu hỏi LẠI vẫn "phường
        // nào" — nhãn ở đây đọc thẳng bảng chung, không biết tin ở huyện.
        const xaThayPhuong = pendingReq.question === "phuong" && laNgoaiDoThi(pendingReq.listings?.district);
        const nhanDangHoi = xaThayPhuong ? "xã" : FACT_LABELS[pendingReq.question] ?? pendingReq.question;
        const nhanHoiLai = gatDoanTp ? "nhà mình ở đường nào, phường nào" : xaThayPhuong ? "chỗ mình thuộc xã nào" : NHAN_HOI_LAI[pendingReq.question] ?? nhanDangHoi;
        const chiSoNha = !!soNhaGhep && !dapAn.trim();
        // 25/09/2026 (bắn thật lx-29): hỏi phường/quận, chủ nói "quận 5 em" → quận đã ghi (`capNhatQuan` ở trên), hỏi
        // tiếp phường; biết quận rồi thì tra bảng `duong` (một phường → xác nhận, 2–3 phường → hỏi chọn).
        const chiQuan = pendingReq.question === "phuong" && laChiQuan(dapAn);
        const goiYSauQuan = chiQuan ? await cauHoiPhuongGoiY(pendingReq.listing_id, null, cachGoi) : null;
        // SRS-5.1zzzzv (bắn lại thu-cmp48-3): nghi ngờ thì câu hỏi ngược ĐÃ được bong bóng trấn an trả lời — dòng "trả lời thẳng câu đó
        // trước (phí theo luật phí)" mâu thuẫn với `hoiNguocPrompt` ("không nhắc phí"), model theo dòng này và nói phí lần hai.
        const viSao = luotBenLe
          ? hoiNguoc
            ? hoiNguocDap || nghiNgoLuot
              ? `Chủ nhà hỏi bên em một câu (đã trả lời ở bong bóng ngay trước), chưa trả lời câu em đang hỏi — không phải hiểu nhầm, không phải né. Quay lại đúng câu đang hỏi.`
              : `Chủ nhà đang HỎI NGƯỢC, chưa trả lời câu em đang hỏi: trả lời thẳng câu đó trước (phí thì theo luật phí; điều chưa nắm thì "để em kiểm tra rồi báo lại"), rồi quay lại đúng câu đang hỏi.`
            : `${phiRoVaiPrompt || `Chủ nhà vừa cho biết mình là ${vaiTuNoiLuot === "moi_gioi" ? "môi giới" : "chính chủ"}. `}Họ chưa trả lời câu em đang hỏi — không phải hiểu nhầm. Đáp một tiếng rồi quay lại đúng câu đang hỏi.`
          : gatDoanTp
          ? `Chủ nhà xác nhận nhà ở TP.HCM (gật phần em đoán), chưa nói đường, phường — không phải hiểu nhầm. Hỏi tiếp cả đường (số nhà hay hẻm nếu có) và phường trong MỘT câu ngắn.`
          : chiQuan
          ? `Chủ nhà mới nói QUẬN (em đã ghi quận), chưa nói phường — không phải hiểu nhầm, đừng hỏi lại quận. Báo ngắn đã ghi quận rồi hỏi phường` +
            (goiYSauQuan ? `, đúng ý câu này: "${goiYSauQuan}"` : ".")
          : chiSoNha
          ? `Chủ nhà bổ sung SỐ NHÀ, em đã ghi địa chỉ "${soNhaGhep}" — không phải hiểu nhầm, không hỏi lại số nhà. Báo ngắn đã ghi địa chỉ rồi hỏi tiếp.`
          : kq.loai === "xung_ho"
          ? `Chủ nhà dặn gọi họ là "${kq.xungHo}": nhận bằng một câu thật ngắn, từ nay gọi đúng vậy.`
          : kq.loai === "hoi" && !nghiNgoLuot
          ? `Chủ nhà đang HỎI NGƯỢC: trả lời thẳng câu đó trước (phí thì theo luật phí; điều chưa nắm thì "để em kiểm tra rồi báo lại").`
          : kq.loai === "ack"
          ? `Chủ nhà chỉ ừ/ok, chưa trả lời.`
          : kq.chuyenSang
          ? `Câu đó là ${FACT_LABELS[kq.chuyenSang.question] ?? kq.chuyenSang.question} (em đã ghi ${kq.chuyenSang.answer}), chưa phải ${nhanDangHoi}.`
          : pendingReq.question === "duyet_tin"
          ? `Chủ nhà chưa gật bản nháp, cũng chưa nói sửa gì rõ.`
          : `Câu đó KHÔNG trả lời được câu em hỏi - có thể chủ nhà hiểu nhầm, hoặc đang nói một thông số khác. Em đã ghi chú lại nguyên văn (không mất), nhắc lại ngắn gọn để xác nhận rồi hỏi lại.`;
        const promptLai =
          `${await boiCanhLuot()}Em vừa hỏi "${nhanDangHoi}", chủ nhà nhắn: "${tinChoModel()}". ${viSao}\n${dongVuaGhi(pendingReq.listing_id)}${hoiNguocPrompt}` +
          `Viết MỘT tin ngắn như người thật nhắn Zalo: xử lý ý trên, rồi ${gatDoanTp ? "hỏi" : "hỏi lại nhẹ nhàng, diễn đạt KHÁC câu hỏi trước"}: ${nhanHoiLai}? ` +
          `Ý hỏi chính vẫn là "${nhanDangHoi}" (hệ thống ghi câu trả lời kế vào ô này). ` +
          `Không xin lỗi dài, KHÔNG nhắc mã tin${nhieuCan ? " (nhiều căn thì gọi bằng địa chỉ)" : ""}.`;
        let hoiLai: string | null = null;
        if (anthropicS) {
          try {
            const r2b = await anthropicS.messages.create({
              model: MODEL, max_tokens: 400,
              output_config: { effort: "medium" },
              system: [{ type: "text", text: SELLER_SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: DONG_TEN }],
              messages: [{ role: "user", content: promptLai }],
            });
            hoiLai = r2b.content.find((b) => b.type === "text")?.text?.trim() ?? null;
            const mocR2b = theoDoiVan(soVan, () => hoiLai);
            if (hoiLai && laLoiMeta(hoiLai)) { console.log("chat-reply: r2b tra loi cau lenh, bo"); hoiLai = null; }
            if (hoiLai) hoiLai = motCauHoi([hoiLai])[0]; mocR2b("motCauHoi");
            if (hoiLai) hoiLai = boHuaHoiChuNha([hoiLai])[0]?.trim() || null; mocR2b("boHuaHoiChuNha");
            // SRS-5.1zzo: lượt hỏi LẠI mà model không hỏi → nối câu mẫu của ô đang treo (ô vẫn mở, phải có câu hỏi đi kèm).
            if (hoiLai) hoiLai = damBaoCauHoi(hoiLai, cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal, pendingReq.listings?.location_raw)); mocR2b("damBaoCauHoi");
            // 27/09/2026 (test Zalo): hỏi lại câu đứng tên thành "cho em xin tên người đứng tên trên sổ" → câu mẫu (hỏi quan hệ).
            if (hoiLai) hoiLai = giuVeCauMau(hoiLai, pendingReq.question,
              cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal));
            // SRS-5.1zzzzo: câu hỏi lại của model mang chủ đề ô KHÁC ô đang mở ("Sổ và hẻm…" khi ô là phòng ngủ) → câu trả lời kế rơi sai ô.
            // Cùng lưới ghi đúng ô của r1 / r2 (`thayCauHoiLech`), trước đây r2b không có.
            if (hoiLai) hoiLai = thayCauHoiLech(hoiLai, pendingReq.question,
              cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal, pendingReq.listings?.location_raw));
            mocR2b("thayCauHoiLech");
            // 27/09/2026: quận / khu chủ nhà chưa nói là bịa ("Botanic ở Quận 1, dự án Phú Mỹ Hưng") — xem `boViTriBia`.
            if (hoiLai) {
              const vt = boViTriBia([hoiLai], [text, ...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? ""),
                pendingReq.listings?.district ?? ""].join(" "));
              if (vt.bo.length) console.log("chat-reply: r2b bo vi tri bia", vt.bo.join(", "));
              hoiLai = vt.replies[0]?.trim() || null;
              // 27/09/2026: bỏ câu bịa mà khách đang HỎI chỗ đó ("Em biết Botanic không") → nói thật chưa nắm, không lờ câu hỏi.
              if (vt.bo.length && hoiNguoc && hoiLai) hoiLai = `Dạ chỗ này em chưa nắm rõ ạ. ${hoiLai}`;
              mocR2b("boViTriBia");
            }
            if (hoiLai) {
              const tb = boTienBia([hoiLai], [text, ...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? "")].join("\n"),
                [pendingReq.listings?.price_vnd]);
              if (tb.bo.length) console.log("chat-reply: r2b bo tien bia", tb.bo.join(", "));
              hoiLai = tb.replies[0]?.trim() || null; mocR2b("boTienBia");
            }
            // SRS-5.1zzzzx: lượt AI soát nhận xét từng chỉ chạy ở r1 / r2 — lời hỏi lại (r2b) cũng do model viết, cùng một lưới.
            if (hoiLai) {
              hoiLai = await soatNhanXet(hoiLai, [...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? ""), text].join("\n"),
                pendingReq.listings?.location_raw ?? "");
              mocR2b("soatNhanXet");
            }
            await doTien(client, r2b.usage);
          } catch (e) {
            await ghiLoi(client, "chat-reply model r2b(hoi lai)", e);
          }
        }
        // Bắn thật lx-30: model được đưa câu gợi ý phường nhưng viết lại mất tên phường ("nhà anh thuộc phường nào vậy
        // anh?"). Như câu xác nhận ở lượt rao: model lo phần ghi nhận, câu hỏi phường giữ nguyên văn gợi ý.
        if (hoiLai && chiQuan && goiYSauQuan) hoiLai = `${hoiLai.replace(/[^.!?]*\?\s*$/u, "").trim()} ${goiYSauQuan}`.trim();
        if (!hoiLai) {
          hoiLai = (hoiNguoc && !hoiNguocDap ? cauHoiLaiDuPhong(hoiAi?.chuDe, cachGoi) : "") + (kq.loai === "xung_ho"
            ? `Dạ em nhớ rồi, em gọi ${kq.xungHo} nha. `
            : chiQuan
            ? `Dạ em ghi quận rồi ạ. `
            : chiSoNha
            ? `Dạ em ghi địa chỉ ${soNhaGhep} rồi ạ. `
            : kq.chuyenSang
            ? `Em ghi "${kq.chuyenSang.answer}" rồi ạ. `
            : "") + (chiQuan && goiYSauQuan ? goiYSauQuan
            : gatDoanTp ? cauHoiMau("vi_tri@sau_gat_tp", cachGoi, pendingReq.listings?.property_type)
            // SRS-5.1zzzzo: lượt bên lề — câu đang hỏi chưa ai trả lời, hỏi lại đúng câu của ô (không "cho em hỏi lại" như khách trả lời lệch).
            : luotBenLe ? `${hoiNguoc && !hoiNguocDap ? "" : "Dạ. "}${cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal, pendingReq.listings?.location_raw)}`
            : `${CachGoi} cho em hỏi lại chút, ${nhanHoiLai} ạ?`);
        }
        return await traLoiSeller([...(hoiNguocDap ? [hoiNguocDap] : []), ...(dapPhiRoVai ? [dapPhiRoVai] : []), hoiLai],
          { reask: pendingReq.question, loai_cau: luotBenLe ? "ben_le" : kq.loai, ...(hoiNguoc ? { hoi_nguoc: hoiNguoc } : {}), ...(dapPhiRoVai ? { phi_ro_vai: true } : {}) });
        }
      }

      // Câu hỏi treo bị bỏ qua (né 2 lần / chủ gật): KHÔNG ghi câu này vào ô đang
      // hỏi — chỉ ghi fact nhận ra được (nếu có), rồi đi tiếp như vừa trả lời xong.
      let goiYDuongKe: GoiYDuong | null = null; // FR-212: tên đường khớp gần → câu kế hỏi xác nhận
      if (!boQuaCauTreo) {
        // 11/09/2026 (Zalo thật, ehome 3): câu trả lời địa chỉ kèm lời dặn ("Bạn phải
        // ghi dự án … chứ ở hồ ngọc lãm") từng vào NGUYÊN câu làm vị trí → location_raw
        // và street thành rác. Chỉ giữ cụm địa chỉ; câu phường có số thì "Phường N".
        let dapAnGhi = gonGiaTriFact(pendingReq.question, loaiDapAn ?? catDapAn(pendingReq.question, dapAn));
        // FR-212: câu trả lời ĐỊA CHỈ → đối chiếu tên đường với từ điển `duong` trước khi ghi. Kể cả khi
        // AI đã đọc ra tên đường (`loaiDapAn` — bắn thật 21/09 mau-tdt: "Trần Đình Trọng" của AI đi thẳng
        // vào tin, không ai hỏi "Trần Bình Trọng phải không").
        if (pendingReq.question === "vi_tri" && dapAnGhi) {
          // 30/09/2026 (chat thử): "nhà ở 137/28 đường số 59 phường an hội tây gò vấp" vào nguyên câu làm vị trí. Gọt còn
          // phần địa chỉ; phường / quận trong câu đi ô riêng (ngay dưới, sau khi ghi).
          // SRS-5.1zk: địa chỉ của AI (`loaiDapAn`, chế độ `ai`) đã sạch — không gọt / ghép bằng luật.
          if (!(laCheDoAi && loaiDapAn)) dapAnGhi = gotDiaChi(ghepSoNhaHem(dapAnGhi, text) ?? dapAnGhi);
          const sd = await suaTenDuong(dapAnGhi, pendingReq.listings?.district, pendingReq.listings?.ward);
          dapAnGhi = sd.viTri;
          goiYDuongKe = sd.goiY;
        }
        // 30/09/2026 (chủ dự án, chat thử): khách "phường an hội tây quận gò vấp", AI đọc "Phường An Hội" và giá trị AI
        // (`loaiDapAn`) đi thẳng vào tin — không ai đối chiếu với phường có thật. Nay chốt với bảng `wards`: tên dài nhất
        // nằm trọn trong câu khách thắng. Không khớp chữ mà là một tên phường chữ → tìm theo NGHĨA (vector) và HỎI XÁC
        // NHẬN (không ghi, câu phường vẫn treo; khách gật thì đường gợi ý FR-209 ghi).
        if (pendingReq.question === "phuong" && dapAnGhi && !nhanGoiYPhuong) {
          const quanTin = pendingReq.listings?.district ?? null;
          // Tên cũ đúng chữ ("thảo điền") khi AI im → phường mới luôn, không cần tìm theo nghĩa.
          const chot = phuongChuan(dapAnGhi) ?? phuongNhacTrongCau(dapAnGhi, quanTin);
          if (chot) dapAnGhi = tenDayDu(chot);
          else if (laTenPhuongChu(dapAnGhi) && !humanActive) {
            const kq = await timPhuongTheoNghia(dapAnGhi.replace(/^\s*(?:phường|phuong|xã|xa)\s+/iu, ""));
            // 30/09/2026 (chủ dự án: "nhắc tới gần đúng sẽ biết cái nào đúng và sửa vào, kết hợp với vị trí"): gần nghĩa
            // ≥ 0,9, bỏ xa ứng viên nhì, VÀ đúng quận cũ đã biết của căn → sửa luôn. Thiếu một điều → hỏi xác nhận.
            if (kq && nghiaDuChac(kq.top, kq.nhi, quanTin)) dapAnGhi = tenDayDu(kq.top);
            else if (kq) {
              const goiY: GoiYPhuong = { phuong: tenDayDu(kq.top), quan: kq.top.quan_cu ?? "", duong: "" };
              const { error: gyErr } = await client.rpc("ghi_boc_tach", { p_listing_id: pendingReq.listing_id, p: { phuong_goi_y: goiY } });
              if (gyErr) await ghiLoi(client, "chat-reply ghi_boc_tach(phuong theo nghia)", gyErr.message);
              else return await traLoiSeller([cauHoiPhuongGan(cachGoi, kq.top)], { reask: "phuong", loai_cau: "goi_y_phuong_nghia" });
            }
          }
        }
        // 30/09/2026 (bắn thật lx-dd-c2): "nhà ở vĩnh lộc b bình chánh, hẻm 5m" → ô "vị trí cụ thể" = "vĩnh lộc b bình chánh".
        // Địa chỉ chỉ có tên phường / quận thì KHÔNG ghi vào vị trí (phường + quận vẫn ghi ngay dưới); câu vị trí sẽ được hỏi lại.
        // 01/10/2026: tin chỉ là một tên phường mà từ điển địa danh vừa nhận ra (`phuongTuDien`, kể cả gõ sai "phường tay
        // thnh") cũng là đơn vị hành chính — không ghi chữ thô vào vị trí.
        // SRS-5.1zzzzd: cùng một hàm với mọi chỗ ghi ô vị trí — bỏ kích thước ("10x50"), còn lại chỉ là hành chính thì không ghi.
        if (pendingReq.question === "vi_tri" && dapAnGhi) dapAnGhi = viTriGhiDuoc(dapAnGhi) ?? dapAnGhi;
        // SRS-5.1zzzzzh (bắn production 12/10, thu-kb-dat): "đất ở đường Vườn Thơm, xã Bình Lợi, Bình Chánh" → AI đọc vị trí "đường Vườn Thơm",
        // nhưng vì câu có phường (`phuongTuDien`) mà "Vườn Thơm" là một tên trơn, vị trí bị coi là "chỉ hành chính" và không ghi — bot hỏi lại
        // đường. Tên trơn chỉ là hành chính khi nó CHÍNH LÀ phường vừa nhận ra (và khách không gõ "đường" trước nó).
        const tronViTri = phuongTuDien ? tenDiaDanhTron(dapAnGhi) : null;
        const tronLaPhuong = !!tronViTri && tronViTri.tienTo !== "duong" && boDau(String(phuongTuDien)).includes(boDau(tronViTri.ten));
        const viTriChiHanhChinh = pendingReq.question === "vi_tri" && (!viTriGhiDuoc(dapAnGhi) || chiLaDonViHanhChinh(dapAnGhi) || tronLaPhuong);
        if (viTriChiHanhChinh) console.log("chat-reply: vi tri chi co don vi hanh chinh, khong ghi");
        const { error: factErr, boQua: factBo } = viTriChiHanhChinh ? { error: null, boQua: false } : await ghiFact(client, {
          p_listing_id: pendingReq.listing_id,
          p_question: pendingReq.question,
          p_answer: dapAnGhi,
          p_source: "seller_chat",
        });
        // SRS-5.1zzzzze (khách mô phỏng lần bảy: hỏi phường, khách "Phường Nguyễn Trãi ạ" — không có phường đó ở Quận 5 mới). Cửa ghi từ chối
        // (không ra phường có thật) mà câu treo vẫn bị đóng "đã trả lời", bot hỏi sang sổ như thể đã có phường. Câu không ghi được thì chưa
        // trả lời: câu phường giữ nguyên, nói thẳng em chưa tìm thấy phường đó, gợi ý theo đường nếu tra được. Chỉ khi AI đọc ra khách NÓI
        // một tên phường (ô phường hay câu trả lời, trước kiểm bằng chứng — kiểm bỏ chính vì phường không có thật); chữ luật nhặt khi AI im
        // ("xhr") không phải khách nói tên phường.
        const kqP = factBo && pendingReq.question === "phuong" && laCheDoAi && bongAi ? await bongAi : null;
        const aiNoiPhuong = !!kqP?.ket && (kqP.truong.some((t) => t.khoa === "phuong" && !!t.gia_tri?.trim()) || (!!kqP.traLoi?.co_tra_loi && !!kqP.traLoi.gia_tri?.trim()));
        if (!factErr && factBo && pendingReq.question === "phuong" && aiNoiPhuong) {
          const goiY = await cauHoiPhuongGoiY(pendingReq.listing_id, null, cachGoi);
          const quanP = pendingReq.listings?.district && (pendingReq.listings?.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh !== true
            ? ` ở ${pendingReq.listings.district}` : "";
          const ten = dapAnGhi.replace(/^\s*(?:phường|phuong|xã|xa)\s+/iu, "").trim();
          const noi = `Dạ em chưa tìm thấy phường ${ten}${quanP} ${cachGoi} ơi.`;
          return await traLoiSeller([goiY ? `${noi} ${goiY}` : `${noi} Phường có ghi trên sổ hồng (dòng địa chỉ thửa đất), ${cachGoi} xem giúp em là phường nào nha?`],
            { reask: "phuong", loai_cau: "phuong_khong_co_that" });
        }
        if (factErr) await ghiLoi(client, "chat-reply ghi_fact_listing(drip)", factErr.message);
        else {
          // 30/09/2026 (chat thử): trả lời câu ĐỊA CHỈ kèm phường ("… phường an hội tây gò vấp") — phường từng rơi mất.
          // AI đọc phường trong câu (đã qua kiểm bằng chứng) → tin chưa có phường thì ghi luôn phường + quận cũ.
          if (pendingReq.question === "vi_tri" && !pendingReq.listings?.ward && !phuongTuDien) {
            // AI không trả phường (model lỗi / im) → tên phường mới / cũ đúng chữ, duy nhất, trong câu khách (như câu rao).
            const pk = phuongChuan(aiChinh?.ghi.find((g) => g.question === "phuong")?.answer) ??
              phuongNhacTrongCau(text, pendingReq.listings?.district ?? null);
            if (pk) {
              const { error: pkErr } = await ghiFact(client, {
                p_listing_id: pendingReq.listing_id, p_question: "phuong", p_answer: tenDayDu(pk), p_source: "seller_chat",
              });
              if (pkErr) await ghiLoi(client, "chat-reply ghi_fact_listing(phuong kem dia chi)", pkErr.message);
              else await capNhatQuanTuPhuong(pendingReq.listing_id, null, tenDayDu(pk), text);
            }
          }
          // 23/09/2026 (bắn thật): mở 2 lô rồi hỏi loại, "cả lô đều là đất thổ cư" → bản trước chỉ lô đang hỏi thành đất,
          // lô kia nằm "chưa rõ loại". "Cả lô / đều / cả 2" ở câu LOẠI áp cho mọi tin chưa rõ loại của người đó.
          if (pendingReq.question === "loai_bds" && loaiDapAn && CA_LO_RE.test(tKD)) {
            const { data: chuaRo, error: crErr } = await client.from("listings").select("id").eq("seller_id", sellerRow.id)
              .eq("property_type", "chua_ro").neq("id", pendingReq.listing_id).in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"]).limit(20);
            if (crErr) await ghiLoi(client, "chat-reply loai ca lo(doc)", crErr.message);
            for (const t of (chuaRo ?? []) as Array<{ id: string }>) {
              const { error: lErr } = await ghiFact(client, { p_listing_id: t.id, p_question: "loai_bds", p_answer: loaiDapAn, p_source: "seller_chat" });
              if (lErr) await ghiLoi(client, "chat-reply loai ca lo", lErr.message);
              const { error: irLErr } = await client.from("info_requests").update({ status: "answered", answer: dapAn, answered_at: new Date().toISOString() })
                .eq("listing_id", t.id).eq("question", "loai_bds").eq("status", "pending");
              if (irLErr) await ghiLoi(client, "chat-reply loai ca lo(dong cau)", irLErr.message);
            }
          }
          await chepSangDuAn(pendingReq.question, dapAn);
          // FR-220: "có lửng với sân thượng" → kết cấu chữ "trệt + lửng + 2 lầu + sân thượng" (bản tin, vector, web
          // đều đọc floors_text). "không có" chỉ là fact.
          if (pendingReq.question === "tang_phu") {
            const { data: kcRow, error: kcErr } = await client.from("listings").select("floors_text, floors").eq("id", pendingReq.listing_id).maybeSingle();
            if (kcErr) await ghiLoi(client, "chat-reply tang_phu(doc)", kcErr.message);
            const moi = kcRow ? themTangPhu(kcRow.floors_text as string | null, kcRow.floors as number | null, dapAn) : null;
            if (moi) {
              const { error: tpErr } = await client.from("listings").update({ floors_text: moi }).eq("id", pendingReq.listing_id);
              if (tpErr) await ghiLoi(client, "chat-reply tang_phu(ghi)", tpErr.message);
            }
          }
          // 16/09/2026 (bắn thật mau-chu-q8): "Căn số 14 ở Ny'ah Phú Định" trả lời câu VỊ TRÍ — tên dự
          // án trong kho chỉ được khớp lúc RAO, nên tin nằm "Quận 5 (chưa rõ quận)" dù dự án ở Quận 8.
          // Nay khớp cả ở đây; quận/phường lấy của dự án khi tin còn mặc định / trống.
          // SRS-5.1zo: chế độ `ai` — câu trả lời địa chỉ chỉ gắn dự án khi AI đọc ra tên dự án (`du_an_ten`); tra kho bằng tên đó.
          const tenDaAi = aiChinh?.ghi.find((g) => g.question === "du_an_ten")?.answer ?? null;
          const aiQuyetDaVt = laCheDoAi && !!aiChinh;
          if (pendingReq.question === "vi_tri" && !pendingReq.listings?.project_id && (!aiQuyetDaVt || tenDaAi)) {
            const { data: dsDA, error: daErr } = await client.rpc("match_projects", { p_text: aiQuyetDaVt ? tenDaAi! : dapAn }).select(COT_DU_AN);
            if (daErr) await ghiLoi(client, "chat-reply match_projects(vi_tri)", daErr.message);
            type DaKho = { id: string; name?: string; district?: string | null; ward?: string | null };
            let da: DaKho | null = ((dsDA ?? []) as DaKho[])[0] ?? null;
            // 30/09/2026: tên dự án gõ sai → tìm theo nghĩa, máy xác nhận tên (AI đọc tên dự án thì lấy tên AI đọc).
            if (!da) da = await timDuAnTheoNghia(client, aiQuyetDaVt ? tenDaAi : (tenDaAi ?? tenDuAnTrongCau(dapAn) ?? tenSauCanHo(dapAn)));
            if (da && !duAnLaTenDuong(da.name, dapAn)) {
              const { data: cu } = await client.from("listings").select("district, ward, boc_tach").eq("id", pendingReq.listing_id).maybeSingle();
              const macDinh = !cu?.district || (cu?.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh === true;
              const { error: gErr } = await client.from("listings").update({
                project_id: da.id,
                ...(macDinh && da.district ? { district: da.district } : {}),
                // Phường của dự án chỉ khi quận cũng lấy của dự án — tin đã nói rõ quận khác thì không lai.
                ...(macDinh && !cu?.ward && tenPhuongCot(da.ward, da.district) ? { ward: tenPhuongCot(da.ward, da.district) } : {}),
              }).eq("id", pendingReq.listing_id).is("project_id", null);
              if (gErr) await ghiLoi(client, "chat-reply gan du an(vi_tri)", gErr.message);
              else if (macDinh && da.district) {
                const { error: btErr } = await client.rpc("ghi_boc_tach", { p_listing_id: pendingReq.listing_id, p: { quan: da.district, quan_mac_dinh: false } });
                if (btErr) await ghiLoi(client, "chat-reply ghi_boc_tach(quan du an)", btErr.message);
              }
            }
          }
        }
      }
      // Câu khớp nhưng còn kèm fact khác ("3 lầu, 4 phòng ngủ" khi hỏi kết cấu;
      // "Đường 12m, hướng Bắc" khi hỏi đường) → ghi luôn, đỡ hỏi lại (09/09 tối).
      const daGhiKem = new Set<string>();
      // FR-233: câu lệch đã ghi chú (không có fact kèm — có thì đã đi nhánh ghi fact ở trên) → không ghi kèm gì nữa; nhất là
      // KHÔNG ghi luật đọc khoá đang hỏi mà AI đã bác (e2e AIBOC-09: "50 triệu" vào ô giá).
      if (!ghiChuLech && pendingReq.question !== "duyet_tin" && pendingReq.question !== "danh_gia" && pendingReq.question !== "hinh_anh") {
        // FR-234: nói sang ô khác (không hỏi lại) → fact của ô đó ghi TRƯỚC (luật đọc chắc như "8 tỉ" khi AI im không nằm
        // trong `factKem`); không bao giờ ghi vào ô đang hỏi ở đường này.
        const noi = noiSangO as { question: string; answer: string } | null;
        const kemDs = noi ? [noi, ...factKem(dapAn).filter((f) => f.question !== noi.question)] : factKem(dapAn);
        for (const f of kemDs) {
          // Cùng họ vẫn ghi ("phường Tân Hưng" trả lời địa chỉ thì phường cũng có), chỉ bỏ trùng khoá.
          if ((!boQuaCauTreo || noi) && f.question === pendingReq.question) continue;
          // FR-223 (bắn thật 24/09, rn-test-h): đang hỏi TIỀN THUÊ / cọc / phí, số tiền trong câu là câu trả lời cho câu đó —
          // KHÔNG ghi kèm thành GIÁ BÁN ("150 triệu một tháng" từng đè giá 25 tỷ thành 150 triệu).
          if (f.question === "gia" && pendingReq.question !== "gia" && CAU_HOI_TIEN.has(pendingReq.question)) continue;
          const { error: ndErr } = await ghiFact(client, {
            p_listing_id: pendingReq.listing_id, p_question: f.question, p_answer: f.answer,
            p_source: aiChinh?.ghi.some((g) => g === f) ? NGUON_AI : "seller_chat", goc: gocCua(f),
          });
          if (ndErr) await ghiLoi(client, "chat-reply ghi_fact_listing(kem)", ndErr.message);
          else {
            await chepSangDuAn(f.question, f.answer);
            daGhiKem.add(f.question);
          }
        }
      }
      // 27/09/2026 (chủ dự án: "hỏi hơi nhiều"): câu pháp lý gộp — "sổ riêng, anh đứng tên, cầm tay" ghi luôn đứng tên + thế
      // chấp; hỏi bù sau khi lên tin gom quy hoạch / tranh chấp / khớp sổ trong MỘT tin mà "không có gì hết" trả lời cả ba.
      // Câu treo khác của CĂN NÀY đã có đáp án trong tin này thì đóng, kẻo bot hỏi lại thứ khách vừa nói.
      if (!boQuaCauTreo) {
        const BA_PHAP_LY = ["quy_hoach", "tranh_chap", "dien_tich_khop_so"];
        const khongGiHet = BA_PHAP_LY.includes(pendingReq.question) && laKhongGiHet(dapAn);
        for (const q of ds) {
          if (q.id === pendingReq.id || q.listing_id !== pendingReq.listing_id) continue;
          const theoKhong = khongGiHet && BA_PHAP_LY.includes(q.question) && !daGhiKem.has(q.question);
          if (!daGhiKem.has(q.question) && !theoKhong) continue;
          if (theoKhong) {
            const { error: kgErr } = await ghiFact(client, {
              p_listing_id: pendingReq.listing_id, p_question: q.question, p_answer: dapAn, p_source: "seller_chat",
            });
            if (kgErr) { await ghiLoi(client, "chat-reply ghi_fact_listing(khong gi het)", kgErr.message); continue; }
          }
          const { error: dErr } = await client.from("info_requests").update({
            status: "answered", answer: dapAn, answered_at: new Date().toISOString(),
          }).eq("id", q.id);
          if (dErr) await ghiLoi(client, "chat-reply dong cau treo cung tin", dErr.message);
        }
      }
      if (!boQuaCauTreo) {
        await client.from("info_requests").update({
          status: "answered", answer: dapAn, answered_at: new Date().toISOString(),
        }).eq("id", pendingReq.id);
      }

      // FR-177 c: chủ nhà GẬT bản nháp → đóng dấu; trigger
      // `listings_quyet_dinh_dang_tin` (điểm ≥ 70 + dấu) đưa tin lên kệ.
      if (pendingReq.question === "duyet_tin") {
        const luc = new Date().toISOString();
        // FR-177 g: gật bằng "đủ rồi, đăng đi" thì cũng là lời "đủ rồi" — ghi luôn.
        const ydNoiDu = await yDinhAi(); // SRS-5.1zf
        const noiDu = ydNoiDu !== undefined ? ydNoiDu?.loai === "du_roi" : laDuRoi(dapAn);
        const { error: okErr } = await client.from("listings")
          .update({ chu_duyet_at: luc, ...(noiDu ? { chu_noi_du_at: luc } : {}) })
          .eq("id", pendingReq.listing_id);
        if (okErr) await ghiLoi(client, "chat-reply chu duyet tin", okErr.message);
        else daDuyetLuot = true; // SRS-5.1zzzzzzu
        // FR-177 f: chúc mừng kèm ĐIỂM và cách thêm điểm — "chúc mừng anh, điểm
        // của anh là X, làm sao thêm điểm". Điểm và danh sách thiếu là tiền định
        // (diem_tin), 5 phút sau cron seller-hoi-bu-tick hỏi bù câu đầu tiên.
        const [{ data: lstOk }, { data: dOk, error: dOkErr }] = await Promise.all([
          client.from("listings").select("code, status, property_type").eq("id", pendingReq.listing_id).maybeSingle(),
          client.rpc("diem_tin", { p_listing_id: pendingReq.listing_id }),
        ]);
        if (dOkErr) await ghiLoi(client, "chat-reply diem_tin(duyet)", dOkErr.message);
        const dk = (dOk ?? null) as DiemTin | null;
        const len = !!lstOk && lstOk.status !== "cho_thong_tin";
        // Mỗi ý một dòng (chủ dự án 09/09: "cái nào cần xuống dòng thì xuống dòng").
        // 22/09/2026 (bộ đo giọng B09, chủ dự án chốt): câu chúc mừng 92 từ một bong bóng → rút còn hai câu;
        // cách thêm điểm tách bong bóng riêng, bỏ câu hẹn "có thể em sẽ hỏi thêm" (câu chúc đã nói có khách
        // là báo). Khoá `dang_xong_hen` vẫn giữ trong CAU_TIEN_DINH cho bản DB cũ, không dùng ở đây nữa.
        const themDiem = dk && !noiDu && (dk.thieu ?? []).length
          ? cauTD("dang_xong_them_diem", { thieu: (dk.thieu ?? []).slice(0, 2).join(" và ") }) +
            ((dk.so_anh ?? 0) >= 3 ? "" : cauTD("dang_xong_them_anh")) + "."
          : "";
        // FR-183 (09/09/2026): ĐIỂM NGƯỜI RAO — trung bình điểm các tin đang rao
        // × hệ số quy mô (NMG). Chỉ nhắc khi rao từ 2 căn (một căn thì điểm người
        // = điểm tin, nói hai lần là thừa). Tiền định, RPC `diem_nguoi_ban`.
        let dongNguoiRao = "";
        if (len && nhieuCan) {
          const { data: dnb, error: dnbErr } = await client.rpc("diem_nguoi_ban", { p_seller_id: sellerRow.id });
          if (dnbErr) await ghiLoi(client, "chat-reply diem_nguoi_ban", dnbErr.message);
          const d = (dnb ?? null) as { diem?: number; so_tin?: number } | null;
          if (d && typeof d.diem === "number") {
            dongNguoiRao = `\nĐiểm người rao của ${cachGoi} hiện ${d.diem}/100 (${d.so_tin ?? "?"} tin); tin nào đủ hơn là điểm chung lên theo.`;
          }
        }
        // 05/10/2026 (demo AOND `build_fee_followup_system`): tin lên kệ → DẪN PHÍ một lần bằng câu hỏi, nếu em chưa từng nói phí với người này.
        // SRS-5.1zzzzz (khách mô phỏng hoi-phi: "Được rồi em ơi, rao đi. Mà … chị phải trả bao nhiêu tiền hoa hồng" → tin lên kệ, câu hỏi
        // phí bị bỏ qua): gật kèm câu hỏi thì câu hỏi được trả lời ở đây (bong bóng tiền định đã soạn, `hoiNguocDap`), không dẫn phí lần hai;
        // SRS-5.1zzzzzu: câu phí chưa rõ vai nêu cả hai mức, không nối câu hỏi vai (một luật với r1/r2/r3).
        const dapKemDuyet = hoiNguoc && hoiNguocDap ? hoiNguocDap : dapHoiKemDuyet; // SRS-5.1zzzzzzr: câu hỏi về tin kèm gật
        const cauDanPhi = len && !daNoiPhiRoi() && !(dapKemDuyet && coCauPhi(dapKemDuyet)) ? cauBaoPhiLenKe((lstOk as { deal?: string | null } | null)?.deal ?? dealNguoi) : "";
        // SRS-5.1zzs: dòng hạng đi cùng bong bóng "thêm điểm" (chuyện điểm / hạng ở một chỗ) — bong bóng đầu giữ hai câu ≤ 30 từ (H8e).
        const dongHang = len ? await dongHangRao() : "";
        // SRS-5.1zzzzz: gật mà chưa lên kệ được → nói đúng thứ còn thiếu (một chỗ với nhánh "đăng đi"), không "còn thiếu một chút".
        let thieuDuyet: { cau: string; meta: Record<string, unknown> } | undefined;
        const cau = len
          ? cauTD("dang_xong", { diem: dk?.diem, loai: loaiDoc(lstOk?.property_type) }) + dongNguoiRao + (cauDanPhi ? `\n${cauDanPhi}` : "")
          : huaSauDuyet
          ? `Dạ em ghi nhận ${cachGoi} muốn đăng luôn. Tin còn thiếu ${(dk?.thieu ?? []).slice(0, 2).join(" và ") || "một chút"} nên chưa lên được, lúc nào ${cachGoi} gửi thêm thông tin với ảnh là em đăng liền, không hỏi lại ạ.`
          : (thieuDuyet ??= await noiThieuDeDang(pendingReq.listing_id)).cau;
        const loiHuaDuyet = huaSauDuyet && len ? `Lúc nào ${cachGoi} gửi thêm thông tin với ảnh là em cập nhật vào tin liền ạ.` : "";
        const bongDiem = len && loiHuaDuyet ? loiHuaDuyet : len && themDiem ? themDiem : "";
        const bongDiemHang = dongHang ? (bongDiem ? `${bongDiem}\n${dongHang}` : dongHang) : bongDiem;
        // SRS-5.1zzzzzl: tin lên kệ, lượt không còn câu hỏi nào khác → xin chấm điểm (một lần mỗi người rao).
        // SRS-5.1zzzzzu (chủ dự án 13/10, nghi ngờ D: "sửa từ gốc"): xin chấm điểm ngay lượt lên kệ kể cả khi có câu phí — câu phí là bong bóng riêng.
        const xinDiemDuyet = len && !dapKemDuyet && !huaSauDuyet ? await xinChamDiem(pendingReq.listing_id) : null;
        return await traLoiSeller([cau, ...(bongDiemHang ? [bongDiemHang] : []), ...(dapKemDuyet ? [dapKemDuyet] : []), ...(xinDiemDuyet ? [xinDiemDuyet] : [])], {
          duyet: true, listing_status: lstOk?.status ?? null, diem: dk?.diem ?? null, du_roi: noiDu || undefined, ...(cauDanPhi ? { dan_phi: true } : {}), ...(thieuDuyet?.meta ?? {}),
          ...(xinDiemDuyet ? { xin_danh_gia: true } : {}),
        });
      }

      // Fact đã vào sổ — từ đây trở xuống là phần "nói". Người thật đang cầm
      // cuộc thì dừng: không gọi model, và KHÔNG mở câu hỏi pending mới (bot
      // có hỏi đâu mà chờ trả lời). Cron drip hỏi tiếp khi CTV buông tay.
      if (humanActive) {
        return await traLoiSeller([], { saved_fact: pendingReq.question });
      }

      // FR-144: tin ĐÃ ĐỦ ĐĂNG (auto-publish xong, hết cho_thong_tin) → NGỪNG
      // hỏi drip, để yên; khách quan tâm hỏi thêm thì FR-140 tự mở lại vòng hỏi.
      // Trạng thái phải đọc LẠI sau khi ghi fact (fact vừa ghi có thể là mảnh
      // cuối làm tin tự lên kệ) — nhưng đọc cùng lúc với câu kế tiếp, và danh
      // sách câu còn treo suy ra từ `ds` đã có (FR-171 h: 3 vòng → 1).
      const [{ data: lstNow }, { data: nextFactsTho }, { data: daHetHan }] = await Promise.all([
        client.from("listings").select("code, status, can_chu_duyet, chu_duyet_at, district, ward, deal, boc_tach, property_type, street, location_raw, floors_text, bedrooms, price_vnd, area_m2, legal_status")
          .eq("id", pendingReq.listing_id).maybeSingle(),
        // SRS-5.1zzzzzo: lấy đủ (40) — view xếp theo priority MỌI nhóm, 12 dòng đầu từng cắt mất câu phường (22) khi sau_dang 17–21 chen vào.
        client.from("listing_missing_facts").select("fact_key, priority, nhom")
          .eq("listing_id", pendingReq.listing_id).order("priority").limit(40),
        // Câu đã bị NÉ (expired) thì KHÔNG mở lại ngay trong cùng vòng — lần 3
        // kịch bản thật: địa chỉ hết hạn xong được chọn lại làm câu kế, hết hạn,
        // chọn lại… Vòng hỏi bù (cron) hỏi lại sau.
        client.from("info_requests").select("question").eq("listing_id", pendingReq.listing_id).eq("status", "expired"),
      ]);
      const hetHanSet = new Set((daHetHan ?? []).map((q) => q.question));
      // FR-223: câu nhánh theo câu trả lời (sổ riêng → hoàn công, chưa sổ → bao giờ ra sổ, đang cho thuê → bỏ hiện trạng…).
      // Chữ chủ nhà vài lượt gần đây: "nở hậu nhé" (chưa có số) ở lượt trước → câu kế hỏi nở hậu bao nhiêu mét (FR-225 a).
      const chuGanDay = [...lichSuRows.filter((m) => laTinNguoi(m.sender)).slice(-4).map((m) => m.body ?? ""), text].join(" · ");
      // 01/10/2026: câu AI thấy không áp dụng cho căn này (có trích dẫn) — bỏ khỏi danh sách hỏi (`khongHoiAi`).
      const khongHoi = await khongHoiAi(pendingReq.listing_id, lstNow?.boc_tach ?? pendingReq.listings?.boc_tach, (nextFactsTho ?? []).map((f) => f.fact_key));
      const nextFacts = (await thieuCoReNhanh(client, pendingReq.listing_id, nextFactsTho, [pendingReq.question], text, chuGanDay)).filter((f) => !hetHanSet.has(f.fact_key) && !khongHoi.has(f.fact_key));
      const published = !!lstNow && lstNow.status !== "cho_thong_tin";
      tinTrongLuot = pendingReq.listing_id; // SRS-5.1zzzzk: tin của câu treo là tin đang nói trong lượt (lưới trạng thái ở đường ra)
      // Chủ nói "đăng đi / ok / được" giữa vòng hỏi (09/09 tối lần 2): đủ 70 điểm
      // thì gửi BẢN NHÁP ngay (bỏ câu đang treo), dưới 70 thì nói rõ còn thiếu gì
      // rồi hỏi tiếp — không ghi "đăng đi" thành câu trả lời, không hỏi lại câu cũ.
      let dauDangThieu: string | null = null;
      if (chuMuonDang && !published && lstNow?.can_chu_duyet && !lstNow.chu_duyet_at) {
        const nhap = await guiBanNhap(pendingReq.listing_id, { saved_fact: null, chu_muon_dang: true }, false, [], true);
        if (!Array.isArray(nhap)) {
          // Nháp đã gửi → câu thông số đang treo thôi, câu duyệt thay chỗ.
          // SRS-5.1zzy: câu đang treo LÀ câu phường mà tin vẫn chưa có phường → nhánh "đăng đi" vừa hỏi lại / gợi ý phường và
          // dùng chính câu treo này (mở câu mới trùng thì 23505). Đóng nó là gật "đúng rồi em" rơi vào khoảng không.
          if (!(pendingReq.question === "phuong" && !pendingReq.listings?.ward)) {
            await client.from("info_requests").update({ status: "expired" }).eq("id", pendingReq.id);
          }
          return nhap;
        }
        // Chưa đủ điểm: giữ câu treo, nói còn thiếu gì rồi hỏi lại câu đó.
        const thieuVan = nhap.slice(0, 2).join(" và ");
        // Câu vừa trả lời xong (traLoiKemDang) → không hỏi lại nó; báo còn thiếu gì rồi đi tiếp câu KẾ ở dưới.
        if (traLoiKemDang) dauDangThieu = `Dạ tin mình chỉ cần thêm ${thieuVan || "vài thông tin"} là đủ điều kiện lên kệ ạ.`;
        else return await traLoiSeller(
          [`Dạ tin mình chỉ cần thêm ${thieuVan || "vài thông tin"} là đủ điều kiện lên kệ ạ.\n${cauHoiMau(pendingReq.question, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal)}`],
          { chu_muon_dang: true, thieu: nhap, reask: pendingReq.question },
        );
      }
      if (chuMuonDang && !traLoiKemDang) {
        // Tin đã lên kệ / không tự chốt: "ok" chỉ là ừ — thôi câu treo, đi tiếp.
        await client.from("info_requests").update({ status: "expired" }).eq("id", pendingReq.id);
      }
      // Câu còn treo của căn này = mọi câu chờ đã nạp ở đầu nhánh, trừ câu vừa
      // được trả lời.
      const pendSet = new Set(
        ds.filter((p) => p.listing_id === pendingReq.listing_id && p.id !== pendingReq.id)
          .map((p) => p.question),
      );
      // FR-177 a: câu kế = nhóm ưu tiên cao nhất còn thiếu, trong nhóm chọn câu
      // LIÊN QUAN tới điều chủ nhà vừa nói (`chonCauKe`, tiền định).
      // 20260909i: nhóm `sau_dang` (WC, cách mặt tiền, hẻm thông, ngập, thế chấp, lý do
      // bán…) chỉ hỏi SAU khi tin lên kệ (cron hỏi bù) — trước bản nháp chỉ đợi
      // co_ban + chuyen_mon, kẻo chủ nhà bị hỏi 15 câu mới thấy tin.
      const conHoi = (nextFacts ?? []).filter((f) => !pendSet.has(f.fact_key) && f.nhom !== "sau_dang");
      // 25/09/2026 (chủ dự án test Zalo: "an duong vương" → bot hỏi ô tô, "An Dương Vương nó 2 3 chỗ lận"): vừa trả lời
      // ĐỊA CHỈ mà quận chưa rõ → câu kế là phường/quận (tra OSM: đường ở nhiều nơi thì kể các quận), không để thứ tự
      // ưu tiên (phường 17) đẩy nó ra sau giá, pháp lý.
      const quanChuaRo = !lstNow?.district || (lstNow?.boc_tach as { quan_mac_dinh?: unknown } | null)?.quan_mac_dinh === true;
      // 25/09/2026 (chủ dự án test Zalo, tin An Dương Vương): trả lời "hoàn công rồi" → câu liên quan là ẢNH (`hoan_cong →
      // hinh_anh`), mà câu kế là ảnh thì code GỬI NHÁP — bỏ qua phường/quận còn thiếu, nháp ra không có quận. Còn thiếu
      // phường thì hỏi phường trước (câu gấp vẫn để nháp lo như cũ).
      // Đợt 3 (02/10/2026): chế độ `ai` → câu kế AI chọn (nối mạch điều chủ nhà vừa nói), chỉ nhận khoá có trong `conHoi`;
      // AI không chạy / chọn ngoài danh sách → bảng ưu tiên + câu liên quan như cũ.
      const chonKe = (await cauKeAi(conHoi.map((f) => f.fact_key))) ?? chonCauKe([pendingReq.question], conHoi);
      // SRS-5.1zzz (20261007a, ≤ 6 câu trước bản nháp): hết câu để hỏi mà tin còn thiếu một ô LÕI để lên kệ (giá, diện tích,
      // vị trí, phường) chỉ vì câu đó vừa bị lờ ở lượt này (`hetHanSet`) → vẫn hỏi lại nó (FR-234: ô lõi hỏi lại được). Trước
      // đây còn gấp / phòng ngủ / ảnh để hỏi nên không lộ; nay bot "cảm ơn" rồi im, hoặc gửi bản nháp không có phường / quận.
      // Câu sổ KHÔNG ép hỏi lại (FR-233/234: khách nói lệch câu sổ thì đi tiếp, bản nháp nhắc). Câu VỪA hỏi ở lượt này mà khách
      // nói chuyện khác thì cũng không hỏi lại ngay (FR-234, AIBOC-13) — nhưng còn thiếu ô lõi thì KHÔNG gửi bản nháp (`chanNhap`):
      // bản nháp không phường / quận là tin không lên kệ được (RENHANH-04b); lượt sau câu đó được hỏi lại.
      const LOI_HOI_LAI = ["vi_tri", "dien_tich", "dien_tich_dat", "dien_tich_tim_tuong", "gia", "phuong"];
      const loiThieu = ((nextFactsTho ?? []) as Array<{ fact_key: string; priority?: number; nhom?: string | null }>)
        .filter((f) => LOI_HOI_LAI.includes(f.fact_key) && f.nhom !== "sau_dang" && !khongHoi.has(f.fact_key))
        .sort((x, y) => (x.priority ?? 0) - (y.priority ?? 0));
      // SRS-5.1zzzzr: ô lõi hỏi lại tối đa SO_LAN_HOI_LOI lần mỗi ô (đếm mọi câu đã mở cho ô đó, mọi trạng thái). Ô đã hỏi đủ số
      // lần thì thôi hỏi VÀ thôi chặn bản nháp — một chỗ đếm cho cả hai đường hỏi lại (`loiConThieu` và nhánh hết câu ở dưới).
      const SO_LAN_HOI_LOI = 3;
      const hoiDuLan = new Set<string>();
      if (loiThieu.length) {
        const { data: daHoiRows, error: cErr } = await client.from("info_requests").select("question")
          .eq("listing_id", pendingReq.listing_id).in("question", loiThieu.map((f) => f.fact_key));
        if (cErr) await ghiLoi(client, "chat-reply dem lan hoi o loi", cErr.message);
        const dem = new Map<string, number>();
        for (const x of (daHoiRows ?? []) as Array<{ question: string }>) dem.set(x.question, (dem.get(x.question) ?? 0) + 1);
        for (const [k, n] of dem) if (n >= SO_LAN_HOI_LOI) hoiDuLan.add(k);
      }
      const loiConHoi = loiThieu.filter((f) => !hoiDuLan.has(f.fact_key));
      const loiConThieu = loiConHoi.find((f) => !pendSet.has(f.fact_key) && f.fact_key !== pendingReq.question)?.fact_key;
      let chanNhap = loiConHoi.length > 0;
      let nextKey = published
        ? undefined
        : pendingReq.question === "vi_tri" && quanChuaRo && conHoi.some((f) => f.fact_key === "phuong")
        ? "phuong"
        : chonKe === "hinh_anh" && conHoi.some((f) => f.fact_key === "phuong")
        ? "phuong"
        : chonKe ?? loiConThieu;
      // SRS-5.1zzzzr (bắn production 09/10, thu-thuong11/12: "sổ riêng em" → "Dạ vâng, sổ riêng gọn lắm chị ơi." rồi im; lượt sau
      // "ok em" → bot tự bịa "để em kiểm tra giá giao dịch rồi báo lại"): câu VỪA hỏi là ô LÕI, khách nói chuyện khác → FR-234 không hỏi
      // lại ngay, `chanNhap` chặn bản nháp vì thiếu chính ô đó, mà không còn câu nào khác → lượt không có bước tiếp, lượt sau không
      // còn câu treo để hỏi lại. Bất biến: lượt bán chưa lên kệ luôn có bước tiếp. Ô lõi còn thiếu được hỏi lại (ngoại lệ của luật
      // 01/10 "không hỏi lại", chủ dự án duyệt 10/10) tới SO_LAN_HOI_LOI lần cho mỗi ô (`hoiDuLan` ở trên); quá số đó thì thôi chặn —
      // bản nháp ra và nói rõ còn thiếu gì (`hetCauTruocNhap`).
      if (!published && !nextKey && chanNhap) {
        const loiHoiLai = loiConHoi.find((f) => !pendSet.has(f.fact_key))?.fact_key ?? null;
        if (loiHoiLai) nextKey = loiHoiLai;
        else chanNhap = false;
      }
      // FR-177 c: hết câu cơ bản + chuyên môn (ảnh xin trong bản nháp) và tin
      // đủ 70 điểm → gửi bản nháp thay vì hỏi tiếp. Dưới 70 thì hỏi tiếp và
      // nói rõ còn thiếu gì.
      let thieuDiem: string[] = [];
      if (!published && lstNow?.can_chu_duyet && !lstNow.chu_duyet_at && !chanNhap &&
          (!nextKey || nextKey === "hinh_anh")) {
        // SRS-5.1zzz (20261007a: ≤ 6 câu trước bản nháp): hết câu chính mà tin chưa đủ 70 điểm → bot hỏi thứ còn thiếu VÀ mở ô
        // chờ cho nó (bỏ ô vừa thôi hỏi ở lượt này — FR-234), đưa nó lên đầu danh sách cho model hỏi. SRS-5.1zzzy: chung hàm
        // `hetCauTruocNhap` với nhánh câu rao.
        const het = await hetCauTruocNhap(pendingReq.listing_id, pendingReq.listings?.property_type,
          { saved_fact: pendingReq.question, ...(hoiNguoc ? { hoi_nguoc: hoiNguoc } : {}) }, [...(hoiNguocDap ? [hoiNguocDap] : []), ...(dapPhiRoVai ? [dapPhiRoVai] : [])],
          new Set([...hetHanSet, pendingReq.question, ...hoiDuLan]), pendSet);
        if ("res" in het) return het.res;
        thieuDiem = het.thieu;
        // SRS-5.1zzzzo (bắn production 09/10: "Vâng ạ. Sổ và hẻm được không ạ?"): ô vừa mở cho mục thiếu đầu (`khoaMo`) LÀ ý cần hỏi kế —
        // đi đúng đường CẦN HỎI một ý như nhánh câu rao (`firstKey = het.khoaMo`), có đủ lưới ghi đúng ô (`laHoiLechKhoa`, `giuVeCauMau`,
        // `goiLaiChoDungO`). Bản trước đưa model HAI mục thiếu ("còn thiếu: A; B … hỏi thứ đầu") mà không có khoá nào để soát — model gộp hai
        // mục không liên quan thành một câu vô nghĩa, và câu đó không khớp ô đã mở.
        if (!nextKey && het.khoaMo) nextKey = het.khoaMo;
      }

      // Câu hỏi drip PHẢI vắt vai mã căn + địa chỉ (FR-157). Người bán nhiều
      // căn mà nghe "hoàn công năm nào ạ?" trống không thì họ trả lời về căn
      // đang nghĩ trong đầu, không phải căn bot đang hỏi — neo phía DB xong mà
      // câu chữ không neo thì vẫn lệch, chỉ là lệch ở đầu bên kia.
      // FR-176: neo mã căn CHỈ khi người này rao nhiều căn (FR-157 c sinh ra
      // cho ca đó). Một căn mà tin nào cũng "#BDS-Q5-0174" là giọng máy.
      // FR-178: neo bằng ĐỊA CHỈ, không đọc mã tin cho khách (mã chỉ ở web/CTV/admin).
      // 10/09 lần 8: rao theo lô thì neo bằng MÃ CĂN ("Căn A5 nha"), đừng đọc
      // "Căn Phường 16" — cả lô cùng một phường nên câu đó không chỉ ra căn nào.
      // SRS-5.1zzzzzzz11 (Zalo thật 14/10 09:55–09:59: "Căn Phường Tân Tạo mình bao nhiêu phòng ngủ / ở tầng mấy / sổ thế nào / hiện ở hay để
      // trống" — bốn câu liền gọi tên căn): (a) `nhieuCan` đếm MỌI tin của người này, kể cả tin rỗng / đã đóng — tin rỗng thừa làm người một căn
      // thành "nhiều căn"; (b) tên căn nhắc lại ở mọi câu dù đang hỏi liền mạch một căn. Gọi tên căn chỉ khi người này có từ HAI tin đang mở có dữ
      // liệu, và câu bot vừa nói chưa nhắc tên căn đó (vừa chuyển căn thì nhắc một lần, sau đó thôi).
      const soCanCoDuLieu = dsMo.filter((t) => !laTinRong({ ...t, status: t.status ?? null, location_raw: t.location_raw ?? null, area_m2: t.area_m2 == null ? null : Number(t.area_m2) })).length;
      const neoGoc = nhieuCan && soCanCoDuLieu >= 2
        ? (pendingReq.listings?.unit_code?.trim() ||
          duongGiuaCau(pendingReq.listings?.location_raw).split(",")[0]?.trim() ||
          pendingReq.listings?.ward || "")
        : "";
      const neo = neoGoc && !boDau(boBaoLai(cauBotThat ?? "") ?? "").includes(boDau(neoGoc)) ? neoGoc : "";
      const phiMotCau = cauPhi(vaiPhi(sellerRow), pendingReq.listings?.deal ?? dealNguoi);

      // FR-209: câu kế là PHƯỜNG mà tin còn ở quận mặc định và đã có tên đường → tra
      // Nominatim + `wards`, hỏi xác nhận thay vì "phường mấy, quận nào".
      // FR-212: tên đường vừa ghi khớp GẦN từ điển → câu kế là XÁC NHẬN tên đường (câu treo kế vẫn mở,
      // gật thì hỏi lại nó). Chỉ khi còn câu để hỏi — hết câu thì không cất gợi ý, kẻo "ok cảm ơn" sau
      // này bị đọc thành gật.
      const cauDuongKe = goiYDuongKe && nextKey ? await cauHoiDuongGoiY(pendingReq.listing_id, goiYDuongKe, cachGoi) : null;
      // Chế độ `ai`: tin vừa nhắn có chữ gõ sai / viết tắt AI không chắc ("xhr") → câu kế là XÁC NHẬN nghĩa.
      const xnKe = !cauDuongKe && nextKey && !xacNhanGhi ? await goiYXacNhanAi(text) : null;
      const cauXnKe = xnKe ? await cauHoiXacNhanAi(pendingReq.listing_id, xnKe, cachGoi) : null;
      const cauLungKe = !cauDuongKe && !cauXnKe && nextKey ? await cauHoiLung(pendingReq.listing_id, text, cachGoi) : null;
      const goiYKe = !cauDuongKe && !cauXnKe && !cauLungKe && nextKey === "phuong" ? await cauHoiPhuongGoiY(pendingReq.listing_id, null, cachGoi) : null;
      const nhanhKe = nextKey ? nhanhCuaKhoa(nextKey) : null;
      const cauKe = nextKey
        ? cauDuongKe ?? cauXnKe ?? cauLungKe ?? goiYKe ?? cauHoiMau(nextKey === "phuong" && quanChuaRo ? "phuong@chua_quan" : nextKey, cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal, pendingReq.listings?.location_raw)
        : "";
      // Bong bóng ghi nhận đã gửi trước tin này → đừng cảm ơn/ghi nhận lần nữa.
      // SRS-5.1zzzzg (bắn production 09/10/2026, thu-kg2): đang hỏi pháp lý, khách "sổ riêng, giá 9 tỷ 5" → bong bóng code "Dạ em ghi giá
      // 9 tỷ 5 rồi ạ." + model "Vâng ạ, em ghi sổ riêng và giá rồi anh…" — HAI lời ghi nhận một lượt. Lớp lỗi: một ý hai nguồn — code
      // đã ghi nhận phần GHI THÊM, rồi câu lệnh bảo model "không ghi nhận lại" trong khi khách VỪA trả lời câu hỏi (model phải ghi nhận
      // câu đó, và gộp luôn giá). Lưới cũ (`laCauGhiNhan` ở đường ra) chỉ nhận lời model mở bằng "Dạ em ghi…", "Vâng ạ, em ghi…" lọt.
      // Nay lời GHI THÊM (không phải sửa) đi vào câu lệnh — model ghi nhận gộp một lần; có lời model thì bong bóng code bỏ (dưới).
      const daAck = ackGhiGop
        ? `Lượt này ngoài câu trả lời cho câu em hỏi, em cũng vừa ghi thêm ${ackGhiGop}: ghi nhận GỘP một lần trong tin này (vài chữ, không đọc lại số), rồi hỏi tiếp. `
        : ackSua
        ? `Bong bóng NGAY TRƯỚC tin này đã ghi nhận số liệu rồi ("${ackSua.slice(0, 60)}…") — KHÔNG cảm ơn, KHÔNG ghi nhận lại, vào thẳng câu hỏi. `
        : chuaTraLoi
        ? chuaTraLoi
        : noiSangO
        ? `Câu chủ nhà vừa nhắn là ${FACT_LABELS[noiSangO.question] ?? noiSangO.question} (em đã ghi), chưa phải câu em hỏi — KHÔNG hỏi ` +
          `lại câu cũ, KHÔNG bảo chủ nhà hiểu nhầm: ghi nhận nhẹ một vế rồi hỏi tiếp. `
        : ghiChuLech
        ? `Câu chủ nhà vừa nhắn chưa khớp câu em hỏi — em đã ghi chú nguyên văn vào tin, KHÔNG hỏi lại câu cũ, KHÔNG nói đã ghi ` +
          `"${FACT_LABELS[pendingReq.question] ?? pendingReq.question}", KHÔNG bảo chủ nhà hiểu nhầm: ghi nhận nhẹ một vế rồi hỏi tiếp. `
        : "";
      // 05/10/2026 (văn phong demo AOND, SRS-5.1zzi): khuôn ngắn ĐÃ BIẾT / VỪA NHẮN / CẦN HỎI thay cho câu lệnh mười dòng
      // "KHÔNG…". Câu mẫu chỉ đi kèm khi (a) là câu xác nhận do CODE tra ra (tên đường, phường, nghĩa viết tắt — mang lựa
      // chọn cụ thể) hoặc (b) chủ dự án đã sửa câu đó ở dashboard. Còn lại model tự đặt câu từ Ý; luật cũ vẫn là lưới:
      // `laHoiLechKhoa` / `giuVeCauMau` / `boHoiLaiDaCo` thay câu mẫu khi câu model lệch ô.
      // Câu mang DỮ LIỆU code tra ra: xác nhận đường / phường / nghĩa viết tắt, và câu hẻm gọi đúng số hẻm ("105/12" → hẻm 105).
      const cauCodeTra = cauDuongKe ?? cauXnKe ?? cauLungKe ?? goiYKe ?? (nextKey === "do_rong_hem" && /trong hẻm \d/.test(cauKe) ? cauKe : null);
      const cauChuSua = nextKey && !cauCodeTra && cauMauDaSua(nextKey, pendingReq.listings?.property_type) ? cauKe : null;
      const nhanCanHoi = nextKey === "phuong" && quanChuaRo ? "phường và quận (tin chưa rõ quận)" : nextKey ? nhanTheoLoai(nextKey, pendingReq.listings?.property_type) : "";
      const dongCanHoi = nextKey
        ? `CẦN HỎI: ${nhanCanHoi}` +
          (cauCodeTra ? ` — hỏi đúng câu này (có lựa chọn cụ thể): "${cauCodeTra}"` : cauChuSua ? ` — câu bên em hay dùng: "${cauChuSua}", nói lại cho tự nhiên` : "") +
          (nhanhKe ? ` (hỏi thêm cho rõ chuyện "${nhanhKe.ten}" chủ nhà vừa nhắc — các ý của chuyện này: ${nhanhKe.cacY.map((k) => FACT_LABELS[k] ?? k).join("; ")}; ý nào họ đã nói thì không hỏi lại)` : "") +
          // SRS-5.1zzzzzo (chủ dự án 13/10: bot hỏi "Nhà chú trệt, lửng, mấy lầu" khi khách vừa nói "có gác lửng gỗ" — "nó hỏi có xem lại trước khi hỏi ko"):
          // đọc ĐÃ BIẾT rồi chỉ hỏi phần CÒN THIẾU của ý đó.
          `. Đọc ĐÃ BIẾT trước: phần nào của ý này chủ nhà đã nói thì không hỏi lại, chỉ hỏi phần còn thiếu (vd đã biết có gác lửng thì chỉ hỏi có lầu nào nữa không)`
        : "";
      // SRS-5.1zzzl (bắn thử …kb1tatt): nhánh không câu kế (`chanNhap`) từng chỉ dặn "không hỏi lại câu em vừa hỏi" — model tự hỏi
      // "hiện trạng", code không mở ô nên lượt sau không có câu treo. Nhánh đó nay cấm hỏi câu mới.
      // SRS-5.1zzzzm (chủ dự án test Zalo 09/10/2026, "rep chán quá"): câu lệnh cũ dặn "ghi nhận vài chữ" ở MỌI lượt mà không nói
      // lượt này ghi được gì — khách chỉ "đúng em ơi", model lấy thứ duy nhất có trong ĐÃ BIẾT ra ghi nhận ("Dạ, nhà phố em ghi rồi ạ").
      // Nay câu lệnh mang dòng `dongVuaGhi` (sổ ghi của lượt); bong bóng trước đã ghi nhận (`ackSua`, không phải ghi gộp) thì `daAck` đã nói.
      const vuaGhiR2 = ackSua && !ackGhiGop ? "" : dongVuaGhi(pendingReq.listing_id);
      const prompt = nextKey
        ? `${await boiCanhLuot()}${daAck}${hoiNguocPrompt}${phiRoVaiPrompt}` +
          `ĐÃ BIẾT về căn${neo ? ` ${neo}` : ""} (để hiểu, không đọc lại): ${daBietNgan(lstNow) || "(chưa có gì)"}\n` +
          `CHỦ NHÀ VỪA NHẮN (em vừa hỏi "${FACT_LABELS[pendingReq.question] ?? pendingReq.question}"): "${tinChoModel()}"\n` +
          vuaGhiR2 +
          `${dongCanHoi}\n` +
          `Viết MỘT tin ngắn như người thật nhắn Zalo: ${khenGanDay ? "không khen (mấy tin gần đây em khen rồi), " : ""}` +
          `đáp lại đúng điều chủ nhà vừa nhắn (theo dòng em vừa ghi ở trên) rồi hỏi đúng ý CẦN HỎI, không gắn thêm ý khác, không đọc lại số liệu` +
          (neo ? `; người này rao nhiều căn và vừa chuyển sang căn ${neo}: nói rõ đang hỏi căn đó (một lần)` : "") + `.`
        : published
        ? `${await boiCanhLuot()}${hoiNguocPrompt}${phiRoVaiPrompt}Chủ nhà vừa trả lời: "${tinChoModel()}". Tin${neo ? ` căn ${neo}` : ""} giờ đã đủ thông tin và ĐÃ LÊN WEB AI Ơi Nhà Đất. ` +
          `Viết MỘT tin ngắn: cảm ơn, báo tin đã đăng, có khách quan tâm là em báo liền. KHÔNG nhắc phí (chỉ nói khi họ hỏi: ${phiMotCau}). KHÔNG nhắc mã tin. KHÔNG hỏi thêm thông tin nào nữa.`
        : chanNhap && !thieuDiem.length
        ? `${await boiCanhLuot()}${daAck}${hoiNguocPrompt}${phiRoVaiPrompt}Chủ nhà vừa nhắn: "${tinChoModel()}".\n${vuaGhiR2}Viết MỘT tin rất ngắn đáp lại điều họ vừa nói (đúng chữ họ dùng, không diễn giải sang nghĩa khác); KHÔNG hỏi lại câu em vừa hỏi, KHÔNG đặt câu hỏi mới nào (lượt này hệ thống không mở câu hỏi — câu em tự đặt sẽ không ai ghi câu trả lời), KHÔNG nói tin đã đủ thông tin.`
        : thieuDiem.length
        // SRS-5.1zzzzo: mục thiếu không ứng ô nào (tiềm năng sử dụng…) — đưa ĐÚNG MỘT mục; hai mục là mời model gộp hai câu hỏi.
        ? `${await boiCanhLuot()}${daAck}${hoiNguocPrompt}${phiRoVaiPrompt}Chủ nhà vừa trả lời: "${tinChoModel()}".\n${vuaGhiR2}Tin chưa đủ điểm để đăng. CẦN HỎI: ${thieuDiem[0]}. Viết MỘT tin ngắn như người thật: đáp lại điều họ vừa nói, rồi hỏi đúng ý đó theo cách hợp với loại nhà này — một câu hỏi, không gắn thêm ý khác.`
        : `${await boiCanhLuot()}${hoiNguocPrompt}${phiRoVaiPrompt}Chủ nhà vừa trả lời câu hỏi cuối: "${tinChoModel()}". Viết MỘT tin ngắn cảm ơn, báo tin rao giờ đã đầy đủ thông tin, tụi em sẽ báo ngay khi có khách quan tâm. Kết thúc bằng một câu hỏi nhẹ xem ${cachGoi} còn muốn bổ sung gì không.`;
      // OPEN-30: model hỏng thì hỏi bằng câu mẫu tất định — vòng drip không
      // đứng lại chờ model sống. Câu mẫu CÓ hỏi thật (kèm neo căn) nên mở
      // info_request bên dưới vẫn đúng luật "không mở khi chưa hỏi được".
      let sellerReply: string | null = null;
      if (anthropicS) {
        try {
          const r2 = await anthropicS.messages.create({
            model: MODEL, max_tokens: 512,
            // FR-176: có lịch sử để đọc thì cho model đọc — "low" là đủ khi
            // câu lệnh cụt, giờ nó phải tránh lặp khuôn của 8 tin trước.
            output_config: { effort: "medium" },
            system: [{ type: "text", text: SELLER_SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: DONG_TEN }],
            messages: [{ role: "user", content: prompt }],
          });
          sellerReply = r2.content.find((b) => b.type === "text")?.text?.trim() ?? null;
          const mocR2 = theoDoiVan(soVan, () => sellerReply);
          // 15/09/2026 (bắn thật P2): model trả lời CÂU LỆNH ("Em hiểu rồi ạ… Sẵn sàng nhận
          // hội thoại") → bỏ, dùng câu tiền định.
          if (sellerReply && laLoiMeta(sellerReply)) { console.log("chat-reply: r2 tra loi cau lenh, bo"); sellerReply = null; }
          // SRS-5.1zzp (bước 3): lệch ô → gọi lại model một lần TRƯỚC mọi van (lời lần hai đi qua đủ chuỗi van như lời lần một;
          // đặt giữa chuỗi thì lời mới né được các van đã chạy — e2e KHEN-03 bắt được). Câu mẫu bên dưới chỉ là lưới cuối.
          if (sellerReply && !(cauDuongKe ?? cauXnKe ?? cauLungKe ?? goiYKe)) {
            const l0 = lstNow as { street?: string | null; location_raw?: string | null; floors_text?: string | null; bedrooms?: number | null; price_vnd?: number | null; area_m2?: number | string | null; legal_status?: string | null } | null;
            const daCo0 = new Set<string>([
              ...(l0?.street || l0?.location_raw ? ["vi_tri"] : []), ...(l0?.floors_text ? ["ket_cau"] : []), ...(l0?.bedrooms != null ? ["so_phong_ngu"] : []),
              ...(l0?.price_vnd ? ["gia"] : []), ...(l0?.area_m2 ? ["dien_tich"] : []), ...(l0?.legal_status ? ["phap_ly"] : []),
            ]);
            const cauMau0 = nextKey ? `${neo ? `Căn ${neo} nha. ` : ""}${cauKe}` : thieuDiem.length && thieuDiem[0].startsWith("giá")
              ? cauHoiMau("gia", cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal, pendingReq.listings?.location_raw) : null;
            const nhan0 = nextKey ? nhanCanHoi : thieuDiem[0] ?? "";
            const lyDo = (nextKey || thieuDiem.length) ? lyDoLechO(sellerReply, nextKey, cauMau0, nextKey ? daCo0 : undefined) : null;
            if (lyDo) {
              console.log(`chat-reply: r2 lệch ô (${lyDo}) — gọi lại model`);
              const lai = await goiLaiChoDungO(sellerReply, lyDo, nhan0, cauMau0);
              if (lai) sellerReply = lai;
              mocR2("goiLaiChoDungO", true);
            }
          }
          const luatDuR2 = await loiBotDu();
          if (sellerReply && khenGanDay && luatDuR2) sellerReply = boCauKhen(sellerReply); mocR2("boCauKhen");
          // 22/09/2026 (bộ đo giọng B01/B15/B16): "ô tô vào được", "xuyên thoáng", "nở hậu" khi chủ nhà CHƯA
          // nói — TONE_RULES cấm khen điều khách không nói nhưng model vẫn lọt. Chỉ áp cho lời MODEL (bản
          // nháp / bảng tiền định đọc từ DB có thứ chủ nhà nói ở lượt trước). Bằng chứng = chữ chủ nhà đã gõ
          // (tin này + lịch sử gần nhất); câu hỏi ("ô tô vào được không anh?") giữ nguyên.
          if (sellerReply) {
            sellerReply = await soatNhanXet(sellerReply, [...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? ""), text].join("\n"),
              [lstNow?.floors_text, lstNow?.street, lstNow?.location_raw].filter(Boolean).join(" · ")); mocR2("soatNhanXet");
          }
          if (sellerReply) {
            sellerReply = boKhenKhongCanCu([sellerReply], [text, ...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? "")].join(" "), nhanXetAiXong)[0] ?? null;
            if (sellerReply) sellerReply = boMenhDeKhenSai([sellerReply], [text, ...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? "")].join(" "), nhanXetAiXong)[0] ?? null; mocR2("boMenhDeKhenSai");
            if (sellerReply) sellerReply = boHoiHoanCong([sellerReply], nextKey === "hoan_cong")[0] ?? null; mocR2("boHoiHoanCong");
            if (sellerReply) sellerReply = suaGapTheoDeal(sellerReply, pendingReq.listings?.deal); mocR2("suaGapTheoDeal");
            if (sellerReply && luatDuR2) sellerReply = boKhenThiTruong([sellerReply])[0]?.trim() || null; mocR2("boKhenThiTruong");
            // 27/09/2026 (chủ dự án test Zalo: "Em biết Botanic không" → "Botanic ở Quận 1, dự án Phú Mỹ Hưng"): quận / khu
            // chủ nhà chưa nói và tin không có là bịa → bỏ câu đó. Bằng chứng = chữ chủ nhà + cột địa bàn của tin (lstNow).
            if (sellerReply) {
              const vt = boViTriBia([sellerReply], [text, ...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? ""),
                lstNow?.district ?? "", pendingReq.listings?.district ?? ""].join(" "));
              if (vt.bo.length) console.log("chat-reply: bo vi tri bia", vt.bo.join(", "));
              sellerReply = vt.replies[0]?.trim() || null;
              if (vt.bo.length && hoiNguoc && sellerReply) sellerReply = `Dạ chỗ này em chưa nắm rõ ạ. ${sellerReply}`;
              mocR2("boViTriBia");
            }
            // 27/09/2026 (test Zalo): "Em nhớ anh muốn 5 tỷ 2 ạ" — khách đã nói 8 tỷ. Số tiền chủ nhà chưa nói → bỏ câu đó.
            if (sellerReply) {
              const tb = boTienBia([sellerReply], [text, ...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? "")].join("\n"),
                [pendingReq.listings?.price_vnd]);
              if (tb.bo.length) console.log("chat-reply: bo tien bia", tb.bo.join(", "));
              sellerReply = tb.replies[0]?.trim() || null; mocR2("boTienBia");
            }
          }
          // FR-177: một lượt một câu hỏi — cắt câu hỏi thứ hai của model (15/09/2026).
          // Chỉ áp cho lời MODEL: câu tiền định (xin chấm điểm, liệt kê căn) có chủ ý.
          if (sellerReply) sellerReply = motCauHoi([sellerReply])[0]; mocR2("motCauHoi");
          // 25/09/2026 (bắn thật lx-09): code mở ô chờ `gap` mà model hỏi "hẻm rộng mấy mét" — câu trả lời kế rơi sai ô.
          // Câu hỏi model mang chủ đề khoá KHÁC (không mang chủ đề khoá code chọn) → thay bằng câu mẫu của khoá đó.
          if (sellerReply && nextKey && !(cauDuongKe ?? cauXnKe ?? cauLungKe ?? goiYKe) && laHoiLechKhoa(sellerReply, nextKey)) {
            console.log(`chat-reply: câu hỏi model lệch khoá ${nextKey}, thay câu mẫu`);
            sellerReply = thayCauHoiLech(sellerReply, nextKey, `${neo ? `Căn ${neo} nha. ` : ""}${cauKe}`); mocR2("thayCauHoiLech");
          }
          // Câu mẫu hai vế (đứng tên + đồng sở hữu, khớp sổ + hoàn công) bị model rút mất vế bắt buộc → câu mẫu nguyên văn.
          if (sellerReply && nextKey && !(cauDuongKe ?? cauXnKe ?? cauLungKe ?? goiYKe)) sellerReply = giuVeCauMau(sellerReply, nextKey, `${neo ? `Căn ${neo} nha. ` : ""}${cauKe}`); mocR2("giuVeCauMau");
          // Câu nhận xét lặp y nguyên câu bot vừa nói ở lượt trước ("Sổ riêng thì bán nhanh hơn.") → bỏ.
          if (sellerReply && luatDuR2) sellerReply = boCauLapLai(sellerReply, lichSuRows.filter((m) => !laTinNguoi(m.sender)).slice(-3).map((m) => m.body)); mocR2("boCauLapLai");
          // SRS-5.1zzy (chat thử 07/10: tin đất mà "Nhà mình ở phường nào"): gọi đúng LOẠI căn là ghi đúng sự thật, không phải sửa
          // văn — hai van này luôn bật, không treo theo `luat_loi_bot` (06/10 lỡ tắt cùng van sửa văn).
          if (sellerReply) sellerReply = boHuaHoiChuNha([sellerReply])[0]?.trim() || null; mocR2("boHuaHoiChuNha");
          if (sellerReply) {
            const truocTk = sellerReply;
            sellerReply = boHuaTuKiemTra(sellerReply, nextKey ? `${neo ? `Căn ${neo} nha. ` : ""}${cauKe}` : null) || null;
            if (sellerReply !== truocTk) console.log("chat-reply: bỏ câu bot tự hứa kiểm tra"); mocR2("boHuaTuKiemTra");
          }
          // FR-241 i: câu hỏi của model hỏi lại ô đã có dữ liệu (số lầu, phòng ngủ, đường, giá, diện tích, sổ) → câu mẫu của khoá kế.
          if (sellerReply && !(cauDuongKe ?? cauXnKe ?? cauLungKe ?? goiYKe)) {
            const l = lstNow as { street?: string | null; location_raw?: string | null; floors_text?: string | null; bedrooms?: number | null; price_vnd?: number | null; area_m2?: number | string | null; legal_status?: string | null } | null;
            const daCo = new Set<string>([
              ...(l?.street || l?.location_raw ? ["vi_tri"] : []), ...(l?.floors_text ? ["ket_cau"] : []), ...(l?.bedrooms != null ? ["so_phong_ngu"] : []),
              ...(l?.price_vnd ? ["gia"] : []), ...(l?.area_m2 ? ["dien_tich"] : []), ...(l?.legal_status ? ["phap_ly"] : []),
            ]);
            const truocHL = sellerReply;
            sellerReply = boHoiLaiDaCo(sellerReply, daCo, nextKey, nextKey ? `${neo ? `Căn ${neo} nha. ` : ""}${cauKe}` : null);
            if (sellerReply !== truocHL) console.log("chat-reply: bỏ câu hỏi lại ô đã có", [...daCo].join(",")); mocR2("boHoiLaiDaCo");
          }
          // SRS-5.1zzzzk: câu "đã đăng / lên web" do lưới trạng thái ở đường ra (`traLoiSeller`, `tinTrongLuot`) lo.
          // 25/09/2026 (bắn thật lx-05): câu xác nhận / chọn phường, xác nhận tên đường do CODE tra ra → thay câu hỏi của
          // model bằng câu đó NGUYÊN VĂN (model từng nói lại thành "phường nào vậy ạ?", rơi mất lựa chọn).
          if (sellerReply && (cauDuongKe ?? cauXnKe ?? cauLungKe ?? goiYKe)) {
            sellerReply = `${sellerReply.replace(/[^.!?]*\?\s*$/u, "").trim()} ${cauDuongKe ?? cauXnKe ?? cauLungKe ?? goiYKe}`.trim(); mocR2("gheCauXacNhanCode");
          }
          // 06/10/2026 (bắn thử thu-srd-a1, SRS-5.1zzo): model trả "Dạ em cảm ơn anh." KHÔNG hỏi gì trong lúc code mở ô chờ cho câu
          // kế (hoặc mở lại ô giá vì tin thiếu điểm). Ô mở mà không ai hỏi → khách im, lượt sau rơi sai ô. Lưới ghi đúng ô (luôn bật):
          // không có câu hỏi thì nối câu hỏi của ô đã mở.
          if (sellerReply) {
            sellerReply = damBaoCauHoi(sellerReply, nextKey
              ? `${neo ? `Căn ${neo} nha. ` : ""}${cauKe}`
              : thieuDiem.length ? (thieuDiem[0].startsWith("giá") ? cauHoiMau("gia", cachGoi, pendingReq.listings?.property_type, pendingReq.listings?.district, pendingReq.listings?.deal, pendingReq.listings?.location_raw) : `Để tin đủ điều kiện đăng, ${cachGoi} cho em hỏi thêm ${thieuDiem[0]} nha?`)
              : null); mocR2("damBaoCauHoi");
          }
          await doTien(client, r2.usage);
        } catch (e) {
          await ghiLoi(client, "chat-reply model r2(seller)", e);
        }
      }
      // SRS-5.1zzzzg: model đã viết lời (đã được dặn ghi nhận gộp phần ghi thêm) → bong bóng ghi nhận của code không gửi nữa.
      if (sellerReply && ackGhiGop && prompt.includes(daAck)) ackSua = null;
      if (!sellerReply) {
        // FR-178: câu mẫu cũng phải là câu người nói, không đọc tên trường.
        // 10/09 lần 7: bong bóng trước đã nói "Dạ em ghi rồi ạ: …" mà bong bóng
        // này mở đầu y hệt — hai câu ghi nhận liền nhau đọc như máy. Đã có bong
        // bóng ghi nhận thì vào thẳng câu hỏi.
        // SRS-5.1zzzzm: "Dạ em ghi rồi ạ." chỉ khi lượt này ghi được thứ gì vào căn đang nói (sổ `ghiLuot`) — khách chỉ gật / hỏi thì "Dạ.".
        const coGhiLuot = ghiLuot.some((g) => g.listing_id === pendingReq.listing_id && g.question !== "nhan" && g.doi) || !!quanGhiLuot;
        const moDau = (hoiNguoc && !hoiNguocDap ? cauHoiLaiDuPhong(hoiAi?.chuDe, cachGoi) : "") + (ackSua ? "" : coGhiLuot ? "Dạ em ghi rồi ạ. " : "Dạ. ");
        sellerReply = nextKey
          ? `${moDau}${neo ? `Căn ${neo} nha. ` : ""}${cauKe}`
          : thieuDiem.length
          ? `${moDau}Để tin đủ điều kiện đăng, ${cachGoi} cho em hỏi thêm ${thieuDiem[0]} nha?`
          : published
          ? `Dạ em cảm ơn ${cachGoi}! Tin ${neo ? `căn ${neo} ` : `${loaiDoc(lstNow?.property_type)} mình `}đã đủ thông tin và lên web rồi ạ, có khách quan tâm là em báo liền.`
          : `Dạ em cảm ơn ${cachGoi}, tin rao giờ đã đầy đủ thông tin. Có khách quan tâm là em báo ${cachGoi} ngay ạ.`;
      }

      // 22/09/2026: hết câu để hỏi thì để yên, không xin chấm điểm ở đây nữa (dời sang lúc báo bán được).
      const xinDiemCuoi: string | null = null;
      if (nextKey && sellerReply) {
        // 23505 = `ask-seller` (nhịp drip :22/:52) vừa mở đúng câu này. Không
        // phải sự cố — bỏ qua. Mã khác thì vào sổ (FR-152 d).
        const { error: irErr } = await moCauTreo({
          listing_id: pendingReq.listing_id, question: nextKey, status: "pending",
        });
        if (irErr && irErr.code !== "23505") {
          await ghiLoi(client, "chat-reply mo cau hoi tiep", irErr.message);
        }
      }
      // SRS-5.1zzq: tin đã duyệt từ trước, lượt này mới đủ thông tin để trigger đưa lên kệ → dẫn phí một lần (nhánh duyệt
      // thường đã có, đường "lên kệ muộn" này trước đây không có).
      // Nối CÙNG bong bóng với lời báo đã đăng (như nhánh duyệt thường): `motCauHoiLuot` chỉ giữ câu hỏi ở bong bóng
      // hỏi cuối, tách bong bóng riêng là nó cắt câu hỏi của bong bóng trước (GOVAP-06 bắt được).
      const cauDanPhiR2 = published && pendingReq.listings?.status === "cho_thong_tin" && !daNoiPhiRoi()
        ? cauBaoPhiLenKe(pendingReq.listings?.deal ?? dealNguoi) : "";
      if (cauDanPhiR2) sellerReply = sellerReply ? `${sellerReply}\n${cauDanPhiR2}` : cauDanPhiR2;
      return await traLoiSeller([...(hoiNguocDap ? [hoiNguocDap] : []), ...(dapPhiRoVai ? [dapPhiRoVai] : []), ...(dauDangThieu ? [dauDangThieu] : []), sellerReply, ...(xinDiemCuoi ? [xinDiemCuoi] : [])], {
        ...(dauDangThieu ? { chu_muon_dang: true } : {}),
        saved_fact: boQuaCauTreo ? null : pendingReq.question, ...(xinDiemCuoi ? { xin_danh_gia: true } : {}), ...(hoiNguoc ? { hoi_nguoc: hoiNguoc } : {}),
        ...(cauDanPhiR2 ? { dan_phi: true } : {}),
      });
    }
    // FR-144: chính chủ nhắn CÂU RAO MỚI → tạo tin nháp cho_thong_tin ngay + mở
    // vòng hỏi nhỏ giọt, hỏi tới khi đủ-để-đăng (giá + diện tích + phường) thì
    // nghỉ; khách quan tâm hỏi thêm thì FR-140 mở lại vòng hỏi.
    // (Cổng `wantsSell` tính ở trên — FR-164 cần nó sớm để bộ bắt-lời-sửa không
    //  nuốt mất câu rao mới.)
    // 16/09/2026 (bắn thật mau-co-thue): "thôi để cô hỏi lại con cô đã" lúc KHÔNG có câu treo
    // (câu gấp vừa hỏi chưa mở IR) → rơi xuống nhánh chăm sóc, model đáp "cháu chờ" rồi hỏi
    // luôn câu mới. Hoãn là hoãn ở mọi nhánh: đáp một câu, không hỏi thêm.
    const ydHoanTu = !wantsSell && !pendingReq && sellerRow.active_listing_id ? await yDinhAi() : undefined;
    if (!wantsSell && !pendingReq && sellerRow.active_listing_id &&
      ((ydHoanTu !== undefined ? ydHoanTu?.loai === "hoan" : laHoanLai(text)) || ((await camXucAi())?.muc === "buc" && !(await bucMaLamTiep(ydHoanTu))))) {
      const goi = cachGoiKhach(goiNguoi, sellerRow.nhom_tuoi);
      // FR-236 (bắn thật lx-43, 28/09): không có câu nào đang hỏi mà "giờ anh bận rồi em" → "em hỏi dồn quá" nghe lạc (bot
      // có hỏi gì đâu). Chỉ xin lỗi hỏi dồn khi khách than HỎI nhiều; bận thì chúc lo việc, tin đã lên kệ thì nói vẫn đang rao.
      const thanHoi = (camXucLuot as ReturnType<typeof docCamXuc>)?.muc === "buc" || /hỏi (?:gì )?(?:hoài|lắm|nhiều|mãi)/i.test(text);
      const ttTin = ((tinCuaNguoi ?? []) as Array<{ id: string; status?: string | null }>).find((t) => t.id === sellerRow.active_listing_id)?.status ?? null;
      const dangRao = !!ttTin && ttTin !== "cho_thong_tin" && ttTin !== "an" && ttTin !== "da_chot";
      const henTu = khop(PROMISE_RE, PROMISE_RE_KD) ? "" : await datHenHoan(goi); // SRS-5.1zzzzzzi: hoãn có hẹn giờ → nhắc + nói lại mốc
      return await traLoiSeller([thanHoi
        ? `Dạ em xin lỗi, em hỏi dồn quá.${henTu} Lúc nào ${goi} rảnh nhắn em là em làm tiếp liền nha.`
        : dangRao
        ? `Dạ ${goi} cứ lo việc nha.${henTu} Tin mình vẫn đang rao, có khách quan tâm là em báo ${goi} liền ạ.`
        : `Dạ ${goi} cứ thong thả nha.${henTu} Có gì ${goi} nhắn em là em làm tiếp liền.`], { hoan: true, loai_cau: "hoan", ...(henTu ? { hen_nhac: true } : {}) });
    }
    // SRS-5.1zzt (06/10/2026, bắn thử thu-ai-0610): người vừa GẬT câu hỏi vai ("đúng rồi") rồi tả căn — "nhà anh ở hẻm 137
    // Nguyễn Trãi, P. Nguyễn Cư Trinh, Q1", "4x16, 1 trệt 2 lầu", "5 tỷ 2, shr" — không có chữ "bán"/"rao" nên `wantsSell`
    // (luật) không nhận; model phân vai không được hỏi khi đã có hồ sơ bán (`nenHoiModelVai`); đường "fact rời" bên dưới cần
    // tin có sẵn để neo. AI đọc ra đủ dữ kiện mà không có chỗ ghi: tám lượt "🤖 Không bóc tách được gì", bot "ghi rồi" miệng,
    // hỏi sổ riêng / chung ba lần, hứa "sẽ rao căn nhà" một tin không tồn tại. Người bán CHƯA CÓ tin mở, không câu treo,
    // không hỏi ngược, mà AI (đã chạy song song) đọc ra loại / địa chỉ / dữ kiện căn → đó LÀ câu rao: đi đúng đường tạo tin
    // bên dưới (cột lõi của AI, vòng hỏi nhỏ giọt). AI không chạy → luật đỡ: câu có địa chỉ hoặc giá.
    let raoNgam = false;
    if (!wantsSell && !hoiMua && !pendingReq && !daGanManh && dsMo.length === 0 && !humanActive && !imageUrl) {
      const kqNgam = bongAi && cheDoBocAi && (await cheDoBocAi) === "chinh" ? await bongAi : null;
      if (kqNgam?.ket) {
        if (!kqNgam.hoiLai?.co_hoi && ((kqNgam.ket as { so_can?: number }).so_can ?? 1) <= 1) {
          const aiNgam = docAiChinh(kiemDeXuat(kqNgam.truong, textBongAi).dat, null);
          raoNgam = !!(aiNgam.loaiBds || aiNgam.duong || aiNgam.gia || aiNgam.dienTich != null || aiNgam.ngang != null ||
            aiNgam.ghi.some((g) => g.question !== "du_an_ten" && g.question !== "bo_sung"));
        }
      } else {
        raoNgam = nhanDienNhieuFact(text).some((f) => f.question === "vi_tri" || f.question === "gia");
      }
    }
    if (!daGanManh && (wantsSell || raoNgam || raoMoiCanKhac || (dangXinCanMoi && coChiTiet))) {
      // Loại BĐS KHÔNG hỏi: trigger trg_listings_fill_property_type đọc chính
      // câu rao (description) mà điền (FR-150). Chỉ tin nào câu chữ không đủ
      // để đoán mới nằm lại 'chua_ro' và bị hỏi ở vòng drip.
      // Cùng một mẫu với cổng wantsSell ở trên — lệch một chữ là câu rao lọt
      // cổng "cho thue" nhưng bị ghi thành tin BÁN.
      // 14/09/2026 (bắn 14 tin bán): "bán nhà mặt tiền…, đang cho thuê 45 triệu/tháng, giá
      // 32 tỷ" từng thành tin CHO THUÊ giá 45 triệu — chữ "cho thuê" ở đâu cũng lật deal.
      // `dealCauRao`: thu nhập thuê của căn bán không lật; "sang nhượng mặt bằng" là thuê.
      // 21/09/2026 chế độ `chinh`: AI đọc CÂU RAO trước (lượt đã chạy song song từ đầu nhánh), qua kiểm
      // bằng chứng → giá trị cột lõi + fact; luật chỉ đỡ chỗ AI không đọc ra (giá, diện tích, quận,
      // phường) hoặc khi model hỏng. Riêng ĐỊA CHỈ và fact kèm: AI đã chạy thì luật không bóc nữa —
      // đó là hai chỗ đẻ ra "quý 2 năm sau" làm tên đường (TS-VAN-11). Tin rao nhiều căn: AI đứng ngoài.
      // SRS-5.1zzzzzzz11 (Zalo thật 14/10 09:53: "Anh cần bán gấp chung cư mặt tiền quốc lộ 1A" mở tin RỖNG, bot hỏi tên chung cư bằng lời model
      // — không mở câu treo; bài rao kế mở tin THỨ HAI, người có hai tin mở nên mọi câu hỏi sau đều gọi "Căn Phường Tân Tạo mình…"). Ba chỗ
      // từng dò "tin rỗng đang điền" chỉ qua câu treo. MỘT chỗ dò: tin của câu treo; không câu treo thì tin đang NEO của người này, nếu rỗng.
      const tinRongDangDien = ((): ({ id: string; deal?: string | null; property_type?: string | null; gap?: boolean | null }) | null => {
        if (pendingReq?.listings && laTinRong(pendingReq.listings)) return { ...(pendingReq.listings as { deal?: string | null; property_type?: string | null; gap?: boolean | null }), id: pendingReq.listing_id };
        if (pendingReq || !sellerRow.active_listing_id) return null;
        const neo = ((tinCuaNguoi ?? []) as unknown as Array<Parameters<typeof laTinRong>[0] & { id: string; deal?: string | null; property_type?: string | null; gap?: boolean | null }>)
          .find((t) => t.id === sellerRow.active_listing_id);
        return neo && laTinRong({ ...neo, location_raw: neo.location_raw ?? null, area_m2: neo.area_m2 == null ? null : Number(neo.area_m2) }) ? neo : null;
      })();
      let aiRao: (AiChinh & { kienThuc: string[] }) | null = null;
      if (bongAi && cheDoBocAi && (await cheDoBocAi) === "chinh") {
        const kqAi = await bongAi;
        if (kqAi?.ket && ((kqAi.ket as { so_can?: number }).so_can ?? 1) <= 1) {
          const kdAi = kiemDeXuat(kqAi.truong, textBongAi);
          // SRS-5.1zzzw (chủ dự án chat thử …vxii): câu rao điền vào TIN RỖNG mở từ câu trước ("Tôi cần bán đất mặt tiền") — AI đọc
          // cả hội thoại, trích "cần bán" / "bán đất" ở CÂU TRƯỚC đó; kiểm trích dẫn chỉ tìm trong câu này nên bỏ, rồi luật từ khoá đoán
          // "cho thuê" từ "xây căn hộ cho thuê". Ý giao dịch và loại BĐS là ý của cả cuộc rao: cho phép trích từ các tin chủ nhà trước,
          // chỉ hai khoá đó, chỉ khi đang điền tin rỗng mở từ chính các tin đó.
          const laTinRongDangDien = !!tinRongDangDien;
          // SRS-5.1zzzzzc (khách mô phỏng lần năm, môi giới: "có mấy căn quận 5 cần đăng" rồi "căn thứ 2 hẻm Nguyễn Trãi …" → tin mới
          // "chưa rõ quận", bot hỏi lại quận khách đã nói). Người đã có tin với em mà câu này rao căn THÊM: quận CHUNG khách nói ở tin
          // trước là của cả lô — AI được trích quận từ đó (code vẫn kiểm cụm có thật trong lời khách); loại / giá / địa chỉ thì không.
          const raoCanThem = !laTinRongDangDien && (tinCuaNguoi ?? []).length >= 1;
          // SRS-5.1zzzzzzz14: quận AI trích từ tin trước ("có mấy căn quận 5 cần đăng" rồi tin rỗng nhận câu rao) cũng là ý của cả cuộc rao — AI
          // quyết (trích dẫn có thật trong lời khách); trước đây luật đọc quận cả câu lấp chỗ này.
          const datAi = boSungDiaChiTuKienThuc(laTinRongDangDien ? kiemYCuocRao(kqAi.truong, textBongAi, tinChuNhaGoc().join("\n"), {}, [...KHOA_Y_CUOC_RAO, "quan"]).dat
            : raoCanThem ? kiemYCuocRao(kqAi.truong, textBongAi, tinChuNhaGoc().join("\n"), {}, ["quan"]).dat : kdAi.dat, kqAi.kienThuc, textBongAi); // SRS-5.1zzzzzy
          // SRS-5.1zb: chế độ `ai` không đưa loại giao dịch đoán bằng từ khoá vào — "Chào bạn, mình cho thuê…" ("bạn" → "bán")
          // từng làm khoảng giá thành khoảng giá BÁN, giá thuê của AI bị bỏ vì ngoài khoảng.
          aiRao = { ...docAiChinh(datAi, { deal: laCheDoAi ? null : dealCauRao(tKD) }), kienThuc: kiemKienThuc(kqAi.kienThuc ?? [], textBongAi, datAi) };
          // FR-212 (bắn thật 21/09): khách gõ "pham the hier" → AI đọc "Phạm Thế Hiển" (sửa chính tả) → kiểm
          // bằng chứng BỎ vì đổi chữ cái (FR-208 h) → tin không có địa chỉ, không ai hỏi. Nhưng TRÍCH DẪN
          // của đề xuất đó chính là địa chỉ khách gõ, đã kiểm là nằm trong câu: lấy trích dẫn làm địa chỉ,
          // phần sửa để từ điển `duong` lo (khớp gần thì HỎI, không tự đổi chữ).
          if (!aiRao.duong) {
            const td = kdAi.bo.find((b) => b.khoa === "duong" && b.ly_do === "gia_tri_khong_nam_trong_trich_dan")?.trich_dan?.trim();
            if (td && td.length >= 4 && td.length <= 80 && /[\p{L}]{2}/u.test(td)) aiRao.duong = td;
          }
        }
      }
      // SRS-5.1zzzw (08/10/2026, chủ dự án chat thử …vxii: "Tôi cần bán đất mặt tiền" rồi câu rao dài "… phù hợp xây căn hộ cho
      // thuê" → tin thành "BĐS cho thuê", bản nháp "Cho thuê đất … 8,8 tỷ/tháng"): câu rao điền vào TIN RỖNG đã mở từ câu trước
      // mang sẵn loại giao dịch / loại BĐS khách đã nói; AI không nói lại ở câu này (trích "cần bán" nằm ở câu trước nên bị bỏ) thì
      // GIỮ, không đoán lại. AI đã chạy thì không đoán bán / thuê bằng từ khoá trên câu này (chữ "cho thuê" trong "xây căn hộ cho
      // thuê" không phải ý giao dịch) — mặc định bán như câu chào hỏi; luật `dealCauRao` chỉ còn khi AI không chạy.
      const tinRongCu = tinRongDangDien;
      // SRS-5.1zzzzzt (Zalo thật 13/10/2026 13:36: "Mình cần cho thuê nhà" → AI im về loại giao dịch → mặc định BÁN, 🤖 "BĐS bán", tới bài
      // rao mới đổi): câu MỞ ĐẦU nói thẳng "cần / muốn / có nhà cho thuê" (không có chữ bán, không phải "xây … cho thuê") là ý giao dịch
      // rõ — luật đỡ đúng khuôn câu đó khi AI im; prompt cũng đã dặn AI đọc câu chào này là cho_thue.
      const moCauChoThue = /\b(?:can|muon|co nhu cau|dang can|co)\s+(?:nha|can ho|chung cu|phong|mat bang|dat|kho|van phong)?\s*cho\s+thue\b/.test(tKD) && !/\b(?:ban|can ban|de lai|thanh ly)\b/.test(tKD);
      const sDeal = aiRao
        ? aiRao.loaiGiaoDich ?? (tinRongCu?.deal as "ban" | "cho_thue" | null | undefined) ?? (dealNguoi as "ban" | "cho_thue" | null) ?? (moCauChoThue ? "cho_thue" : "ban")
        : dealCauRao(tKD);
      // (wardNo — số phường trong câu rao — tính ở trên, trước nhánh bán.)
      // price_raw cắt từ text GỐC (giữ nguyên chữ người gõ); đơn vị tiền lấy từ
      // TIEN_CD (đủ cả dạng có dấu lẫn không dấu — "giá 5 ti" gõ lẫn vẫn khớp).
      // parse_vnd phía DB đã nuốt được "ty"/"trieu" (kiểm 27/08).
      // Đuôi `[^,.;\n]*` giữ phần lẻ ("5 tỷ 8", "5 tỷ thương lượng") nhưng
      // từng vơ luôn diện tích đứng sau ("5 tỷ 8 50m2" → price_raw dính "50m2");
      // `chuan_hoa_gia_raw` phía DB chỉ gọt tiểu từ, không gọt "50m2". Dừng
      // TRƯỚC một cụm số+m2.
      // (`DUOI_GIA` nay ở boc-cau-rao.ts — một nguồn với bài kiểm; 15/09 thêm dừng
      // trước chữ của thứ khác: "6ty2 shr thanh khoan…" chỉ còn "6ty2".)
      // 11/09/2026 (42 ca): bắt thêm lóng "9t5"/"4t2" (TIEN_T_KEP), đọc trên
      // `textBoc` (số đọc bằng chữ đã thành chữ số).
      // 14/09/2026: con số tiền ĐẦU TIÊN từng là giá — "đang cho thuê 45 triệu…, giá 32 tỷ"
      // ra 45 triệu, "thuê 60 triệu/tháng, phí sang 350 triệu" suýt ra 350 triệu. `chonGiaRao`
      // bỏ cọc / phí / hoa hồng / tiền thuê đang thu, ưu tiên số sau chữ "giá / tổng".
      // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): chế độ `ai` mà AI đã đọc câu rao → ô AI không nói là khách KHÔNG nói, luật
      // không tự điền thay: "nhà mua 3 tỷ năm 2018, giờ muốn bán" từng ra giá 3 tỷ, "chưa cần bán gấp đâu em" ra GẤP. Ô trống
      // thì bot hỏi. Luật chỉ còn khi AI không chạy.
      const chiAi = laCheDoAi && !!aiRao;
      const giaDoan = aiRao?.gia ?? aiRao?.giaM2Raw ?? (chiAi ? null : chonGiaRao(textBoc, sDeal, DUOI_GIA));
      const priceM = giaDoan ? [giaDoan, giaDoan] : null;
      // Diện tích + số phòng ngủ có sẵn trong câu rao thì ghi luôn qua cửa fact
      // (FR-164) sau khi tạo tin — không thì vòng nhỏ giọt hỏi lại đúng cái chủ
      // nhà vừa nói ("nhà 50m2" rồi bot hỏi "diện tích bao nhiêu ạ?"), kiểu mất
      // mặt FR-144 sinh ra để tránh. Giá/phường vào cột ngay lúc insert như cũ.
      // 14/09/2026: "diện tích 62,5m²" từng không ra diện tích (chỉ biết "m2").
      const dtRao = aiRao?.dienTich ?? (aiRao?.ngang != null && aiRao?.dai != null || chiAi ? null : dienTichCauRao(tKD));
      // 29/09/2026 (kịch bản K3/K8/K9/K10): AI im thì "4x12" trong câu rao không vào diện tích (chỉ đọc "m2") → bot hỏi lại.
      const ndRao = aiRao?.ngang != null && aiRao?.dai != null ? [aiRao.ngang, aiRao.dai] : !aiRao && dtRao == null ? ngangDaiCauRao(tKD) : null;
      const areaM = dtRao != null
        ? [String(dtRao), String(dtRao)]
        : ndRao ? [`${ndRao[0]}x${ndRao[1]}`, `${ndRao[0]}x${ndRao[1]}`] : null;
      const pnM = aiRao?.soPhongNgu != null
        ? [String(aiRao.soPhongNgu), String(aiRao.soPhongNgu)]
        : chiAi ? null : /(\d{1,2})\s*(?:phong ngu|pn(?![a-z]))/.exec(tKD);
      // 11/09/2026 (42 ca): "giá 75 triệu/m2, diện tích 50m2" → căn lên web giá 75
      // triệu. parse_vnd nay trả NULL cho giá mỗi m²; có diện tích thì ghi giá CẢ
      // CĂN (75 triệu × 50m2) và nói rõ trong bong bóng ghi nhận là em đã nhân.
      const giaM2 = giaTheoM2(priceM?.[1]);
      // "5x20, giá 95 triệu/m2": không có chữ m2 nhưng ngang × dài vẫn nhân được (14/09).
      const dtSo = dtRao ?? (giaM2 ? (aiRao?.ngang != null && aiRao?.dai != null ? aiRao.ngang * aiRao.dai : ngangNhanDai(tKD)) : null);
      const giaGhi = giaM2 && dtSo ? vndThanhChu(giaM2 * dtSo) : priceM?.[1] ? gonGiaKyHan(priceM[1].trim()) : null;
      const giaNoi = giaM2 && dtSo ? `${priceM![1].trim()} (≈ ${giaGhi} cho ${dtSo}m2)` : giaGhi;
      // FR-158: mã do trigger `trg_listings_fill_code` cấp, nối tiếp đúng dãy
      // BDS-Q5-#### mà admin và web đang dùng. Đưa `code: null` xuống là cố ý —
      // bộ đúc mã `CCRB-<base36>` cũ ở đây là dãy thứ hai không ai cần, lại
      // không khoá gì nên hai chủ nhà rao cùng lúc là có cửa trùng mã.
      // FR-174: quận/huyện lấy từ chính câu rao ("Tân Bình", "q4", "Bến Lức
      // Long An"); không nói thì mặc định cụm khởi điểm Quận 5 — kho 173/173
      // tin ở đó và người rao ở đó chỉ nói "P4" [giả định BA, OPEN-27 nửa sau].
      // FR-114 (v48): câu rao có tên dự án trong kho (`match_projects`) → gắn
      // tin vào dự án + bóc mã căn ("căn A12-05", "mã căn B2.07"); không khớp
      // dự án nào thì tin là hàng lẻ như cũ. Tin vừa rao coi như "còn bán" và
      // chủ vừa xác nhận lúc rao [giả định BA] — FR-116 đếm TTL 7 ngày từ đây.
      // SRS-5.1zo (03/10/2026, bắn thử thu-dc4-11): "hẻm xe hơi 6 mét Phan Xích Long Phú Nhuận" khớp gần đúng "KDC Phước Long B
      // - Phú Nhuận" (so cả câu) → tin nhận dự án + phường Phước Long B (Thủ Đức). Chế độ `ai`: chỉ gắn dự án khi AI đọc ra tên dự
      // án (có trích dẫn) — tra kho bằng TÊN đó, không bằng cả câu; AI không nói dự án thì tin là hàng lẻ.
      const aiQuyetDuAn = !!aiRao && laCheDoAi;
      const { data: duAnRao, error: duAnRaoErr } = aiQuyetDuAn && !aiRao?.duAn ? { data: [], error: null }
        : await client.rpc("match_projects", { p_text: aiQuyetDuAn ? aiRao!.duAn! : text }).select(COT_DU_AN);
      if (duAnRaoErr) await ghiLoi(client, "chat-reply match_projects(rao)", duAnRaoErr.message);
      // Dự án trong kho có quận/phường riêng (Ny'ah Phú Định ở Quận 8) — câu rao
      // không nói quận thì lấy của dự án, đừng mặc định Quận 5 (10/09 lần 6).
      const duAnKhop = ((duAnRao ?? []) as Array<{ id: string; name?: string; district?: string | null; ward?: string | null }>)[0] ?? null;
      // 14/09/2026: "nhà phố quận 7 đường Huỳnh Tấn Phát" khớp dự án "Căn Hộ Cao Cấp Huỳnh Tấn
      // Phát" chỉ vì trùng tên đường — tin nhận luôn phường của dự án. Trùng tên đường mà câu
      // không nhắc dự án / chung cư / căn hộ thì không phải dự án.
      let duAn: { id: string; name?: string; district?: string | null; ward?: string | null } | null =
        duAnKhop && !duAnLaTenDuong(duAnKhop.name, text) ? duAnKhop : null;
      // 30/09/2026: tên dự án gõ sai ("vinhome gran park") khớp chữ không ra → tìm theo nghĩa, máy xác nhận tên.
      if (!duAn) duAn = await timDuAnTheoNghia(client, aiQuyetDuAn ? aiRao?.duAn : (aiRao?.duAn ?? tenDuAnTrongCau(text) ?? tenSauCanHo(text)));
      // Phường khách NÓI trong câu rao (ĐỌC — chưa chuẩn hoá): AI (đã qua kiểm bằng chứng) → phường số → tên sau chữ "phường / xã"
      // (có dấu, rồi không dấu — bắn thật B1 15/09) → tên phường mới / cũ nhắc đúng chữ trong câu (Thảo Điền, 30/09, chỉ khi AI im).
      const phuongTho: string | null = aiRao?.phuong ?? (wardNo ? `Phường ${wardNo}` : phuongTenCauRao(text)) ??
        (!/[À-ỹ]/.test(text) ? phuongTenKhongDau(tKD) : null);
      // SRS-5.1zzzzj: CHUẨN HOÁ ở MỘT cửa `phuongCot` — tên mới / cũ / số cũ + quận cũ trong câu → phường MỚI có thật, không thì null
      // (không ghi; bot hỏi). Thay ba đường cũ ghép "Phường " + số (bắn production 09/10: "phường 6 quận 3 cũ" → cột "Phường 6"),
      // tra bảng `wards` bằng so bỏ dấu, và `phuongChuan` chỉ nhận tên mới.
      const quanCauRao = [aiRao?.quan, bocQuan(tKD, text), ...cacQuanTrong(text, boDau), duAn?.district];
      let phuongChot: Phuong | null = phuongCot(phuongTho, quanCauRao);
      if (!phuongChot && !phuongTho) phuongChot = phuongNhacTrongCau(text, aiRao?.quan ?? bocQuan(tKD, text));
      const phuongRao: string | null = phuongChot ? tenDayDu(phuongChot) : null;
      const maCanRao = duAn ? (aiRao?.maCan ?? MA_CAN_RE.exec(text)?.[1]?.toUpperCase() ?? null) : null;
      // Tình trạng GẤP (chủ dự án 09/09/2026 — cần cột riêng): nói gấp → true,
      // nói rõ "không gấp" → false, không nhắc → null (chưa rõ, không ép).
      const gapCol: boolean | null = chiAi ? aiRao!.gap : aiRao?.gap ?? (laGap(text)
        ? true
        : /\b(khong|ko|k|chua|dau co|chang)\s*(?:can\s*)?gap\b/.test(tKD) ? false : null);
      // FR-193 (10/09, chủ dự án nhắn thật): "bán căn ho ở Hà đô centrosa garden"
      // → bot đáp "Em ghi nhận: bán · Quận 5". Không ai nói Quận 5 cả; "Quận 5" là
      // giá trị mặc định của cột `listings.district` từ thời chỉ làm chợ Quận 5.
      // Cột vẫn NOT NULL nên DB vẫn nhận mặc định, nhưng lời NÓI với khách chỉ được
      // nhắc địa bàn khi ĐỌC ĐƯỢC thật (từ câu rao hoặc từ dự án khớp trong kho).
      // 11/09/2026 (42 ca): "bán nhà ở Hà Nội quận Cầu Giấy" từng thành tin QUẬN 5.
      // Vùng xa → nói thật là chưa nhận, không mở tin. Vùng lân cận → quận ghi đúng
      // tên tỉnh.
      const quanAi = aiRao?.quan ?? null;
      // 14/10/2026 (chủ dự án: "đọc bằng AI hết"): chữ "Hà Nội" ở bất kỳ đâu trong tin ("con chị ở Hà Nội") từng làm bot TỪ CHỐI căn.
      // Chế độ `ai`: chỉ soi vùng ngoài trong các cụm AI trích làm ĐỊA CHỈ của căn (vị trí / đường / phường / quận).
      const kdDiaChiAi = laCheDoAi && bongAi
        ? boDau(((await bongAi)?.truong ?? []).filter((t) => ["vi_tri", "duong", "ten_duong", "phuong", "quan"].includes(t.khoa))
          .map((t) => t.trich_dan).join(" "))
        : null;
      const vung = quanAi || bocQuan(tKD, text) || duAn?.district ? null : vungNgoai(kdDiaChiAi ?? tKD);
      if (vung?.xa) {
        return await traLoiSeller([
          `Dạ bên em hiện chỉ nhận nhà ở Sài Gòn và Long An thôi ạ, em xin lỗi chưa hỗ trợ được căn ở ${vung.ten}.`,
        ], { ngoai_dia_ban: vung.ten });
      }
      // 03/10/2026 (bắn thử thu-x04-r, SRS-5.1zu): AI bóc tách hỏng lượt đó → luật đọc quận ĐẦU TIÊN của cả câu "bán căn hộ q7 … để
      // mua nhà Bình Thạnh" → tin bán mang Bình Thạnh. Câu nhắc NHIỀU quận thì luật không đoán: bỏ vế MUA AI lượt nhỏ đọc ra (nếu
      // có) rồi đọc lại; còn đúng một quận thì dùng, còn nhiều thì để trống (bot hỏi).
      // SRS-5.1zzzzzzz14 (chủ dự án 14/10: "xoá code đi để AI đọc schematic thôi"): quận là ý theo NGHĨA (nơi căn nằm hay nơi đi tới — "vào quận 5
      // khoản 20 phút" là tiện ích). AI đã đọc câu rao (chế độ `ai`) thì AI quyết, không đưa quận = chưa biết quận (bot hỏi); luật đọc quận ĐẦU
      // TIÊN cả câu chỉ đỡ khi AI không chạy.
      const quanLuat = aiRao && laCheDoAi ? null : await (async () => {
        const ds = cacQuanTrong(text, boDau);
        if (ds.length <= 1) return bocQuan(tKD, text);
        const mk = yLuotAi && laCheDoAi ? docMuaKem((await yLuotAi)?.muaKem, text) : null;
        const con = mk ? cacQuanTrong(text.replace(mk.trich, " "), boDau) : ds;
        return con.length === 1 ? con[0] : null;
      })();
      // SRS-5.1zzzzzzz12 (Zalo thật 14/10 09:54: căn hộ Conic Boulevard — kho ghi Huyện Bình Chánh — mà bài rao "vào quận 5 khoảng 20 phút"
      // → AI trích "vào quận 5", tin thành "Phường Tân Tạo, Quận 5": phường của dự án, quận của câu chỉ đường, hai cột lệch nhau). Căn HỘ đã
      // gắn dự án trong kho thì nằm ở quận của DỰ ÁN — cùng nguồn với phường của dự án ở dưới; chữ quận trong bài rao chỉ dùng khi kho không có.
      const laCanHoDuAn = !!duAn?.district && (aiRao?.loaiBds ?? tinRongCu?.property_type) === "chung_cu";
      const quanDoc = (laCanHoDuAn ? duAn!.district : null) ?? quanAi ?? quanLuat ?? duAn?.district ?? vung?.ten ?? phuongChot?.quan_cu ?? null;
      // 17/09/2026 (chủ dự án: "chỗ nào cứ mặc định quận 5 xóa sạch đi", 20260917a): chưa rõ
      // quận thì ĐỂ TRỐNG — bot hỏi "phường mấy, quận nào", hoặc suy từ phường / dự án.
      const quanRao: string | null = quanDoc ?? null;
      // 23/09/2026 (bắn thật, môi giới): "còn căn B 2pn 80m2 giá 7 tỷ 1 nữa em ơi" sau căn A The Everrich —
      // tin mới mở "BĐS bán · (chưa rõ quận)", mất loại, quận, dự án. Căn THÊM của cùng lô (còn/thêm căn, nữa)
      // mà câu không tự nói nơi chốn hay loại → kế thừa loại + quận của tin gần nhất; dự án (và phường của
      // dự án) chỉ khi tin đó là căn hộ. Địa chỉ nhà phố KHÔNG kế thừa — căn nhà khác là địa chỉ khác.
      let loCu: { property_type: string | null; district: string | null; ward: string | null; project_id: string | null } | null = null;
      if (!quanRao && !phuongRao && !duAn && !aiRao?.loaiBds && /\b(?:con|them)\s+(?:(?:mot|1)\s+)?(?:can|lo)\b|\bnua\b/.test(tKD)) {
        const { data: lc, error: lcErr } = await client.from("listings").select("property_type, district, ward, project_id")
          .eq("seller_id", sellerRow.id).in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"])
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (lcErr) await ghiLoi(client, "chat-reply ke thua lo", lcErr.message);
        loCu = lc ?? null;
      }
      const loCanHo = loCu?.property_type === "chung_cu" && !!loCu.project_id;
      const dongTin = {
        code: null, seller_id: sellerRow.id, deal: sDeal, district: quanRao ?? loCu?.district ?? null,
        ward: phuongRao ?? tenPhuongCot(duAn?.ward, duAn?.district) ?? (loCanHo ? tenPhuongCot(loCu!.ward, loCu!.district) : null),
        description: text, price_raw: giaGhi,
        // SRS-5.1zzzx (bắn production 09/10/2026): "anh muốn bán căn nhà" mở tin rỗng nha_pho (AI trích "căn nhà"); câu rao kế
        // AI không nhắc lại loại → dòng này từng ghi "chua_ro" đè lên, trigger không đoán lại (`_thong_so_ai`), bot hỏi lại loại.
        // Chế độ `ai` mà AI đã đọc câu này: im về loại = khách không đổi loại → GIỮ loại tin rỗng (cùng luật với `sDeal` ở trên).
        // AI không chạy / chế độ khác: vẫn "chua_ro" để trigger đoán lại từ câu rao mới (FR250-E1: "bán nhà" rồi "căn hộ").
        property_type: aiRao?.loaiBds ??
          (chiAi && tinRongCu?.property_type && tinRongCu.property_type !== "chua_ro" ? tinRongCu.property_type : null) ??
          (loCu?.property_type && loCu.property_type !== "chua_ro" ? loCu.property_type : "chua_ro"),
        status: "cho_thong_tin",
        // SRS-5.1zzzx — cùng lớp: "gấp" khách nói ở câu mở tin rỗng, câu rao kế AI im về gấp → GIỮ, không đè null.
        gap: gapCol ?? (chiAi ? tinRongCu?.gap ?? null : null),
        // FR-177 d: tin từ chat chỉ lên kệ khi đủ điểm VÀ chủ nhà gật bản nháp.
        can_chu_duyet: true,
        // 02/10/2026 (đợt 1 chuyển luật sang AI): chế độ `ai` mà AI đọc được câu rao → THÔNG SỐ của tin do AI quyết.
        // Trigger DB thấy dấu này thì không đọc câu rao bằng regex (`boc_thong_so` từng ghi "không có hẻm" thành hẻm), và
        // câu trả lời chỉ điền đúng cột của khoá đó (migration 20261002a).
        ...(laCheDoAi && aiRao ? { boc_tach: { _thong_so_ai: true } } : {}),
        ...(duAn
          ? {
            project_id: duAn.id, unit_code: maCanRao, unit_status: "con_ban",
            last_confirmed_at: new Date().toISOString(),
          }
          : loCanHo
          ? { project_id: loCu!.project_id, unit_code: null as string | null, unit_status: "con_ban", last_confirmed_at: new Date().toISOString() }
          : {}),
      };
      // 30/09/2026 (bắn thật thu-td-01): "em cần bán nhà" mở một tin RỖNG (loại nhà, chưa gì khác); câu rao kế nói "căn hộ"
      // → `khacLoai` coi là căn khác → tin THỨ HAI, tin rỗng nằm lại. Tin đang hỏi của chính người này mà chưa có giá, diện
      // tích, địa chỉ, dự án → điền câu rao vào nó (đóng câu hỏi cũ của nó), không mở tin mới.
      const tinRongId = tinRongDangDien?.id ?? null;
      let newLst: { id: string; code: string | null; property_type: string | null } | null = null;
      let newLstErr: { code?: string; message: string } | null = null;
      // SRD §IV.3 (05/10/2026, SRS-5.1zzf): hạng Đồng tối đa 5 căn — hỏi DB trước khi mở tin MỚI (điền tin rỗng thì không).
      if (!tinRongId) {
        const tr = await tranHangRao();
        if (tr && !tr.duoc) return await traLoiSeller([cauTranHang(tr)], { tran_hang: tr.hang, so_dang_rao: tr.so_dang_rao });
      }
      if (tinRongId) {
        const { error: dongErr } = await client.from("info_requests").update({ status: "expired" })
          .eq("listing_id", tinRongId).eq("status", "pending");
        if (dongErr) await ghiLoi(client, "chat-reply dong cau tin rong", dongErr.message);
        const { code: _ma, seller_id: _nb, boc_tach: thongSoAi, ...capNhat } = dongTin as typeof dongTin & { boc_tach?: Record<string, unknown> };
        // Dấu `_thong_so_ai` phải có TRƯỚC khi câu rao vào `description` (trigger đọc ở lượt cập nhật đó) — gộp, không đè boc_tach.
        if (thongSoAi) {
          const { error: tsErr } = await client.rpc("ghi_boc_tach", { p_listing_id: tinRongId, p: thongSoAi });
          if (tsErr) await ghiLoi(client, "chat-reply dau thong so ai", tsErr.message);
        }
        ({ data: newLst, error: newLstErr } = await client.from("listings").update(capNhat).eq("id", tinRongId)
          .select("id, code, property_type").single());
      } else {
        ({ data: newLst, error: newLstErr } = await client.from("listings").insert(dongTin)
          .select("id, code, property_type").single());
      }
      // 14/09/2026 (bắn lại 14 tin bán): căn S1.02 Vinhomes Grand Park đã có trong kho (lượt
      // trước) → `listings_project_unit_uniq` chặn → tin MẤT, chủ nhà nhận câu chào khuôn như
      // chưa từng rao. Hai người rao cùng một căn là chuyện thường (chủ + môi giới, hai môi
      // giới) — vẫn tạo tin, bỏ mã căn trùng, ghi lại trong boc_tach để admin gộp.
      let maCanTrung: string | null = null;
      if (newLstErr?.code === "23505" && /listings_project_unit_uniq/.test(newLstErr.message) && dongTin.unit_code) {
        maCanTrung = dongTin.unit_code;
        ({ data: newLst, error: newLstErr } = await client.from("listings").insert({ ...dongTin, unit_code: null })
          .select("id, code, property_type").single());
      }
      // Tạo tin hỏng mà đi tiếp là NUỐT MẤT CÂU RAO: chủ nhà nhận một câu chăm
      // sóc chung chung ở nhánh dưới, tưởng đã rao xong, còn kho thì không có
      // gì. Vào sổ rồi mới đi tiếp (FR-152).
      if (newLstErr) {
        await ghiLoi(client, "chat-reply tao tin rao", newLstErr.message);
      }
      // SRS-5.1zzzzzh: căn rao trong dự án có trong kho → phường của dự án (cùng quận mới lấy; khách đã nói phường thì giữ lời khách).
      if (newLst && duAn && (!dongTin.district || !duAn.district || cungQuan(String(dongTin.district), String(duAn.district)))) {
        await phuongTuDuAn(newLst.id, duAn, (dongTin as { ward?: string | null }).ward ?? (tinRongId ? pendingReq?.listings?.ward : null),
          (dongTin as { property_type?: string | null }).property_type ?? (newLst as { property_type?: string | null }).property_type ?? null);
      }
      if (newLst) {
        tinTrongLuot = newLst.id; // SRS-5.1zzzzk: tin đang nói trong lượt (lưới trạng thái ở đường ra đối chiếu đúng tin này)
        // SRS-5.1zzj: căn có trong KHO DỰ ÁN → điền diện tích / tầng còn trống, ghi chú mẫu nhà + giá niêm yết (không thành giá rao).
        if (duAn && maCanRao) await dienTuKhoDuAn(newLst.id, duAn.id, maCanRao);
        // FR-177 h: bóc được gì thì LƯU NGAY dạng JSON (ghi_boc_tach bỏ null),
        // trước khi bàn tới cột nào có hay chưa. Fact chủ nhà trả lời sau này
        // trigger trg_zz_fact_vao_boc_tach gộp vào cùng chỗ.
        const { error: btErr } = await client.rpc("ghi_boc_tach", {
          p_listing_id: newLst.id,
          p: {
            // 11/09/2026 (Zalo thật): "sao cái nào cũng ghi Q5" — quận không đọc được thì
            // cột vẫn nhận mặc định Quận 5 (NOT NULL), nhưng boc_tach nói rõ đó là MẶC
            // ĐỊNH; bong bóng 💾 in "(chưa rõ quận)" và câu hỏi đầu hỏi thêm quận.
            // SRS-5.1zzzz (bắn production 09/10/2026): cờ ghi TƯỜNG MINH cả hai chiều. `ghi_boc_tach` gộp và bỏ null, nên bản cũ
            // (chỉ ghi `true` khi thiếu quận) để câu rao điền vào TIN RỖNG giữ nguyên `quan_mac_dinh: true` của lượt mở tin dù đã
            // đọc ra "Quận 5" — mọi nơi đọc "quận đã chắc chưa" coi như chưa biết: bot tra đường cả thành phố, hỏi lại quận, 🤖 in
            // "(chưa rõ quận)".
            nguon: aiRao ? "cau_rao+ai_chinh" : "cau_rao", loai_giao_dich: sDeal, quan: quanDoc, quan_mac_dinh: !quanDoc,
            phuong: phuongRao,
            gia_raw: priceM?.[1]?.trim() ?? null, ...(giaM2 ? { gia_m2: giaM2 } : {}),
            dien_tich: areaM ? `${areaM[1].replace(",", ".")}m2` : null,
            so_phong_ngu: pnM ? Number(pnM[1]) : null,
            gap: gapCol, du_an: duAn?.name ?? null, ma_can: maCanRao, ...(maCanTrung ? { ma_can_trung_tin_khac: maCanTrung } : {}),
            du_an_chua_co: duAn ? null : tenDuAnTrongCau(text),
            co_anh_kem: imageUrl ? true : null,
          },
        });
        if (btErr) await ghiLoi(client, "chat-reply ghi_boc_tach(rao)", btErr.message);
        // Diện tích / phòng ngủ đã nói trong câu rao → vào fact ngay, trước khi
        // hỏi câu nhỏ giọt đầu tiên (view thiếu-thông-tin đọc cột đã sync).
        // Vị trí cụ thể đã nói trong câu rao ("hẻm trần bình trọng", "đường
        // Nguyễn Trãi", "123/4 An Dương Vương") → fact vi_tri ngay, khỏi hỏi
        // lại thứ chủ nhà vừa nói (FR-144). Giữ nguyên chữ có dấu của người gõ.
        // 10/09 lần 7: hai hình địa chỉ THẬT bị bỏ sót, nên bot hỏi lại địa chỉ
        // vòng vòng dù chủ nhà đã nói ngay câu đầu — "hẻm 100 Nguyễn Trãi" (có số
        // nhà sau chữ hẻm) và "7 Hồng Bàng phường 12" (số nhà trần, không có chữ
        // hẻm/đường). Mẫu 1 nay cho phép số nhà; mẫu 2 bắt số nhà trần nhưng CHỈ
        // khi ngay sau là phường/quận, để "5 tỷ" hay "40m2" không thành địa chỉ.
        // 12/09/2026 (bắn 20 tin thật): luật bóc vị trí chuyển sang
        // `bocViTriRao` — bản cũ vứt nguyên cụm khi sau "hẻm/đường" là chữ tả
        // đường, nên "hẻm xe hơi 5m NGUYỄN TRÃI" mất sạch và 7/7 tin của lượt
        // bắn không có địa chỉ, bot hỏi vòng vòng, bản nháp không bao giờ bung.
        // 22/09/2026 (bắn thật sau deploy #181): AI trả tên đường trần "Trần Hưng Đạo", luật trả "hẻm 6m 12
        // Trần Hưng Đạo" — số nhà rơi vì AI đứng trước. Bản chứa bản kia mà dài hơn thì thắng (`chonViTri`).
        // Đợt 2 (02/10/2026, bắn thử lx-t6-04: "không có hẻm gì hết" → địa chỉ "hẻm gì hết"): chế độ `ai` mà AI không đọc ra
        // đường → không lấy địa chỉ luật đoán; câu địa chỉ sẽ được hỏi. AI có đường thì luật chỉ góp số nhà (`chonViTri`).
        // SRS-5.1zk (03/10/2026): chế độ `ai` — địa chỉ AI viết đi thẳng (không chonViTri / ghepSoNhaHem / gotDiaChi);
        // tên đường AI đọc ghi cột street (`duongAiGhi`).
        const aiDiaChi = !!aiRao && laCheDoAi;
        const viTriCau = aiRao ? (aiDiaChi ? aiRao.duong : chonViTri(bocViTriRao(text), aiRao.duong)) : bocViTriRao(text);
        // 30/09/2026 (chủ dự án, chat thử): câu rao không nói địa chỉ mà tin nhắn TRƯỚC câu rao có ("nhà chú ở 137/28 đường
        // số 59 …") → lấy ở đó. Số nhà hẻm luật làm rơi thì ghép lại: "137/28 đường số 59" (hẻm 137, nhà số 28).
        const viTriGhep = aiDiaChi ? viTriCau : viTriCau
          ? ghepSoNhaHem(viTriCau, textBongAi)
          : truocTin ? ghepSoNhaHem(bocViTriRao(truocTin), truocTin) : null;
        // Bỏ chữ nối / lời dẫn còn dính ("hẻm xe hơi nguyen van cu gần").
        // SRS-5.1zzzzd: kích thước / tên hành chính trơn không phải địa chỉ (cùng hàm `viTriGhiDuoc` với mọi chỗ ghi ô vị trí).
        const viTriTho = viTriGhep ? viTriGhiDuoc(aiDiaChi ? viTriGhep : gotDiaChi(viTriGhep)) : null;
        if (aiDiaChi && aiRao?.tenDuong) duongAiGhi = { id: newLst.id, ten: aiRao.tenDuong };
        // FR-212: đối chiếu tên đường với từ điển `duong` — không dấu → có dấu ngay; sai 1–2 ký tự → gợi ý, hỏi ở câu đầu.
        const duongRao = viTriTho ? await suaTenDuong(viTriTho, quanDoc, phuongRao) : null;
        const viTriRao = duongRao?.viTri ?? viTriTho;
        // FR-241 e (10 ca test làm khó 28/09): "bán nhà Âu Cơ Tân Phú" — tên đường 5 ký tự bị ngưỡng "≥ 6" gạt, địa chỉ trống,
        // lượt sau bot hỏi lại "nhà mình ở đường nào". Tên đường hai chữ trở lên ("Âu Cơ", "Ba Vì") là đủ.
        const viTriDu = (v: string | null | undefined): v is string => !!v && (v.length >= 6 || (v.trim().split(/\s+/).length >= 2 && v.trim().length >= 4));
        // FR-177 n (10/09): câu rao DÀI mang 5–10 thông số → bóc HẾT ngay lúc tạo tin
        // (hướng, pháp lý, WC, nội thất, năm xây, hẻm thông, ngập, cách mặt tiền, lý do
        // bán, thương lượng…), không bắt chủ nhà nói lại. Giá/gấp đã vào cột lúc insert.
        // Tên dự án kho CHƯA CÓ: giữ lại làm fact của tin để những lượt sau còn
        // biết chủ nhà đang nói về dự án nào (FR-195).
        const tenLa = duAn ? null : aiRao ? aiRao.duAn : tenDuAnTrongCau(text);
        // SRS-5.1zzzr: ghi qua đường chung với tạo từng căn của tin nhiều căn (`ghiDuLieuTinMoi`).
        // Căn hộ: tên dự án khách nói (fact `du_an_ten`) là câu trả lời vị trí — trigger `trg_vi_tri_vao_cot` điền `location_raw`
        // (20261008a, SRS-5.1zzzs; thay chỗ vá SRS-5.1zzzm chỉ có ở nhánh này).
        await ghiDuLieuTinMoi(newLst.id, "rao", {
          viTri: viTriDu(viTriRao) && !/^(hẻm|hem|hxh)\s+\d+\s*(m|mét|met)?$/i.test(viTriRao) ? viTriRao : null,
          dienTich: areaM?.[1] ?? null, soPhongNgu: pnM?.[1] ?? null, duAnTen: tenLa,
          kem: aiRao ? [...aiRao.ghi, ...nhanDienNhieuFact(text).filter((f) => !KHOA_FACT_AI_BIET.has(f.question))] : nhanDienNhieuFact(text),
        });
        await ghiPhuongTrongCau(newLst.id, text);
        // Ảnh gửi kèm câu rao → là ảnh của chính căn vừa tạo (FR-185: vào kho).
        await nhanAnh(newLst.id);
        // Tin nháp vẫn phải tạo (không được đánh rơi câu rao), nhưng người thật
        // đang cầm cuộc thì không hỏi, không nói.
        if (humanActive) {
          return await traLoiSeller([], { listing_code: newLst.code });
        }
        // FR-177 a: câu đầu bám theo điều câu rao vừa nói (phường → hỏi diện
        // tích, diện tích → hỏi giá…), trong nhóm cơ bản.
        const { data: firstFacts } = await client.from("listing_missing_facts")
          // FR-229: 12 như các chỗ khác — thêm 4 câu pháp lý thì 8 câu đầu không còn tới câu phường (gia → phuong).
          .select("fact_key, nhom").eq("listing_id", newLst.id).order("priority").limit(40);
        const vuaRao = [phuongRao ? "phuong" : "", areaM ? "dien_tich" : "", priceM ? "gia" : ""].filter(Boolean);
        // 01/10/2026: câu AI thấy không áp dụng cho căn này (lời chủ nhà trong câu rao) — bỏ từ câu hỏi ĐẦU (`khongHoiAi`).
        const khongHoiDau = await khongHoiAi(newLst.id, null, (firstFacts ?? []).map((f) => f.fact_key));
        const thieuDau = (await thieuCoReNhanh(client, newLst.id, firstFacts)).filter((f) => f.nhom !== "sau_dang" && !khongHoiDau.has(f.fact_key));
        // FR-239 i (phát lại test 27/09): "Anh muốn bán căn nhà ở đặng Văn ngữ" — có đường, chưa rõ quận → bot hỏi diện tích,
        // tầng, hẻm… mà không bao giờ hỏi quận (phường ưu tiên 22, gần cuối). Có địa chỉ mà chưa rõ quận → hỏi phường/quận trước.
        let firstKey: string | null = (!quanDoc && viTriRao && thieuDau.some((f) => f.fact_key === "phuong") ? "phuong" : null) ??
          chonCauKe(vuaRao, thieuDau) ?? null;
        // SRS-5.1zzzzzzd: ô chờ câu đầu chỉ mở SAU khi biết câu rao có đủ điểm để gửi bản nháp ngay không (gửi nháp thì không hỏi).
        let cauDauDaMo = false;
        const moCauDau = async () => {
          if (!firstKey || cauDauDaMo) return;
          cauDauDaMo = true;
          const { error: ir1Err } = await moCauTreo({
            listing_id: newLst.id, question: firstKey, status: "pending",
          });
          if (ir1Err && ir1Err.code !== "23505") {
            await ghiLoi(client, "chat-reply mo cau hoi dau", ir1Err.message);
          }
        };
        // Chủ dự án 09/09/2026: "đã bóc tách được cái gì, viết gửi lại cho khách
        // luôn" — bong bóng TIỀN ĐỊNH liệt kê những gì vừa ghi (không liệt kê
        // thứ trống), đứng trước lời chào/câu hỏi của model. Số liệu đúng từng
        // chữ với cột, chủ nhà thấy sai thì sửa ngay (FR-164 bắt lời sửa).
        const LOAI_GHI: Record<string, string> = {
          nha_pho: "nhà phố", nha_cap4: "nhà cấp 4", chung_cu: "căn hộ", dat: "đất",
          biet_thu: "biệt thự", phong_tro: "phòng trọ", mat_bang: "mặt bằng",
          toa_nha: "toà nhà / CHDV", dat_nong_nghiep: "đất nông nghiệp", dat_kinh_doanh: "đất kinh doanh", kho_xuong: "kho xưởng",
        };
        const loaiRao = LOAI_GHI[(newLst as { property_type?: string | null }).property_type ?? ""] ?? null;
        const ghiNhan = [
          `${sDeal === "cho_thue" ? "cho thuê" : "bán"}${loaiRao ? ` ${loaiRao}` : ""}`,
          // SRS-5.1zzzzj: địa chỉ in qua MỘT nguồn `diaChiHienThi` — chữ khách "duong Phạm Văn Chiêu" → "Đường Phạm Văn Chiêu"; phường chỉ
          // là tên chuẩn đã ghi cột (`phuongRao` qua `phuongCot`), không bao giờ chữ khách gõ.
          diaChiHienThi({ location_raw: viTriDu(viTriRao) ? viTriRao : null, ward: phuongRao, district: quanDoc }) || null,
          areaM ? (/x/.test(areaM[1]) ? `${areaM[1]}m` : `${areaM[1].replace(",", ".")}m2`) : null,
          pnM ? `${pnM[1]} phòng ngủ` : null,
          // SRS-5.1zzzzh (thu-kg4: "gia 6 ty" → 📝 "giá 6 ty"): đọc lại cho khách bằng luật hiển thị MỘT NGUỒN (`donViGiaDep`,
          // luat-tien.ts) như 🤖 / bản nháp — `price_raw` trong DB vẫn giữ nguyên chữ khách gõ.
          giaNoi ? `giá ${donViGiaDep(giaNoi)}` : null,
          gapCol === true ? "cần gấp" : gapCol === false ? "không gấp" : null,
          duAn?.name ? `dự án ${duAn.name}${maCanRao ? ` căn ${maCanRao}` : ""}` : null,
        ].filter((x): x is string => !!x);
        // Khách mở lời bằng câu chào thì chào lại rồi mới ghi nhận — bong bóng này
        // là tiền định (đi TRƯỚC câu của model), nên nếu nó vào thẳng "Em ghi nhận"
        // thì cả đoạn mở đầu đọc như máy, kể cả lúc model còn sống.
        const khachChao = /^\s*(dạ\s*)?(xin\s*)?(chào|chao|hi|hello|alo|a lô|hế lô)\b/i.test(text);
        // 21/09/2026 (bắn thật mau-tdt): "Dạ em chào anh ạ!" (tiền định) + "Chào anh, em R•ai bên…" (model) là
        // chào HAI LẦN. Câu của model ĐÃ có lời chào thì thôi chào tiền định; model không chào / hỏng thì chào.
        // SRS-5.1zzzzm (chủ dự án test Zalo 09/10/2026: "ừ em" → "📝 Em ghi nhận: bán."): 📝 để khách SOÁT LẠI thứ đã bóc. Chỉ có mỗi
        // loại giao dịch (khách gật câu chào / "cần bán", chưa nói loại nhà, nơi chốn, số nào) thì không có gì để soát — lời của
        // model đã nhận ý đó. Có từ hai mục, hay có loại nhà ("bán nhà phố"), 📝 giữ nguyên như cũ.
        const ghiNhanTrong = ghiNhan.length === 1 && !loaiRao;
        const bongGhiNhanCho = (loiModel: string | null) =>
          ((khachChao && !/(?<![\p{L}])(chào|xin chào|hello)(?![\p{L}])/iu.test(loiModel ?? "") ? cauTD("chao_lai") + "\n" : "") +
            (ghiNhanTrong ? "" : cauTD("ghi_nhan", { ds: ghiNhan.join(" · ") }))).trim();
        // 15/09/2026 (bắn thật P1): câu rao kèm hỏi ngược ("…, mà bên em là bot hả?") —
        // trước đây câu hỏi bị nuốt. Có đáp án hệ thống (bot / phí / ảnh) thì bong bóng
        // tiền định đứng trước; không thì dặn model trả lời trước rồi mới hỏi.
        // SRS-5.1zzzj: AI nói tin có hỏi em không (`hoiLaiAi`, đọc theo nghĩa, kiểm trích dẫn); luật `tachCauHoiNguoc` chỉ đỡ khi AI không chạy.
        const hoiAiRao = await hoiLaiAi(text);
        const hoiRao = hoiAiRao !== undefined ? (hoiAiRao ? (hoiAiRao.caTin ? text : hoiAiRao.cau) : null) : tachCauHoiNguoc(text).hoi;
        const dapRao = hoiRao ? dapHoiNguocTienDinh(hoiRao, cachGoi, cauPhi(vaiPhi(sellerRow), sDeal ?? dealNguoi, { benEm: true }), hoiAiRao?.chuDe, botDaNoiGan(), viDuPhiNguoi(sDeal ?? tinPhiMotCan?.deal, tinPhiMotCan?.price_vnd)) : null;
        if (hoiRao && dapRao) cauDaDap = hoiRao;
        const hoiRaoPrompt = hoiRao
          ? dapRao
            ? `Tin chủ nhà có kèm một câu hỏi — câu đó đã được trả lời ở bong bóng gửi ngay trước tin em, và đã được bỏ khỏi tin chủ nhà dẫn trong câu lệnh này; em không biết và không nhắc tới nó, KHÔNG nói chữ "hệ thống". `
            : await danHoiNguocLuot({ cau: hoiRao, chuDe: hoiAiRao?.chuDe })
          : await danHoiNguocLuot(null);
        // SRS-5.1zzzy (bắn production 09/10/2026): câu rao đủ mọi ý hỏi trước bản nháp ("hẻm xe hơi … Chợ Quán, ngang 4 dài 15,
        // 3 lầu, sổ hồng riêng, giá 8 tỷ") → không còn câu để hỏi. Trước đây câu lệnh model ở đây dặn "báo sẽ đăng lên web ngay":
        // bot hứa "Em lên tin đăng cho nhà mình liền nha" trong khi tin vẫn chờ, không bản nháp, không câu hỏi. Nay đi cùng đường với
        // nhánh trả lời câu treo: gửi bản nháp; chưa đủ điểm thì mở ô cho mục còn thiếu và hỏi nó. Tên đường còn chờ xác nhận thì để
        // câu xác nhận đi trước (bản nháp không gửi khi địa chỉ chưa chắc).
        if (!duongRao?.goiY) {
          const truocNhap = [bongGhiNhanCho(null), ...(dapRao ? [dapRao] : [])].filter(Boolean);
          if (!firstKey) {
            const het = await hetCauTruocNhap(newLst.id, (newLst as { property_type?: string | null }).property_type,
              { listing_code: newLst.code, ghi_nhan: ghiNhan }, truocNhap);
            if ("res" in het) return het.res;
            firstKey = het.khoaMo;
            cauDauDaMo = true; // `hetCauTruocNhap` đã mở ô cho mục thiếu
          } else if (quanDoc && !thieuDau.some((f) => KHOA_CUNG_TRUOC_NHAP.has(f.fact_key)) && await nhapSomDuDiem(newLst.id)) {
            // SRS-5.1zzzzzzd (chủ dự án 13/10: "tin đợt trước nó đọc đủ thông tin rồi mà không ra tin nháp mà ra cái bảng nhỏ nhỏ là vì
            // sao"): câu rao ĐÃ đủ điểm (≥ 70, giá đọc ra số) → bản nháp NGAY, không hỏi thêm; mục còn thiếu nằm ở dòng "Độ đầy đủ" và
            // hỏi bù sau khi lên kệ (`seller_hoi_bu_tick`). Chỉ áp cho lượt CÂU RAO; trả lời từng câu vẫn hỏi hết nhóm cơ bản trước nháp.
            const nhap = await guiBanNhap(newLst.id, { listing_code: newLst.code, ghi_nhan: ghiNhan, nhap_som: true, cau_bo_qua: firstKey }, false, truocNhap);
            if (!Array.isArray(nhap)) return nhap;
          }
        }
        await moCauDau();
        // OPEN-30: tin rao ĐÃ tạo xong (mã đã cấp) — model chỉ soạn lời chào.
        // Model hỏng thì chào bằng câu mẫu, kèm luôn câu hỏi đầu nếu có.
        // 11/09/2026 (42 ca): lý do "để em kiểm tra giá khu vực" chỉ nói ở lần hỏi
        // địa chỉ ĐẦU (câu mẫu `vi_tri@lan_dau`); các lần hỏi lại dùng câu ngắn —
        // khuôn 25 từ kèm lý do từng lặp nguyên văn 22/52 câu bot.
        const loaiMoi = (newLst as { property_type?: string | null }).property_type;
        // 11/09/2026 (Zalo thật): câu rao không nói quận → hỏi địa chỉ KÈM quận, để
        // tin không nằm lại Quận 5 mặc định (mã tin đi theo quận: migration 20260911f).
        // FR-209: câu rao có tên đường mà không có quận → tra phường mới, hỏi xác nhận.
        // FR-212: tên đường gõ sai 1–2 ký tự → câu hỏi đầu là XÁC NHẬN tên đường (đứng trước gợi ý phường).
        const cauDuongDau = duongRao?.goiY && newLst ? await cauHoiDuongGoiY(newLst.id, duongRao.goiY, cachGoi) : null;
        // Chế độ `ai`: câu rao có chữ gõ sai / viết tắt AI không chắc ("xhr") → câu đầu là XÁC NHẬN nghĩa.
        const xnDau = !cauDuongDau && newLst && firstKey ? await goiYXacNhanAi(textBongAi) : null;
        const cauXnDau = xnDau && newLst ? await cauHoiXacNhanAi(newLst.id, xnDau, cachGoi) : null;
        // 25/09/2026: câu rao ĐÃ có quận cũng tra (bảng `duong` trong quận đó) — `cauHoiPhuongGoiY` tự chọn đường tra.
        const cauLungDau = !cauDuongDau && !cauXnDau && newLst && firstKey ? await cauHoiLung(newLst.id, textBongAi, cachGoi) : null;
        const goiYDau = !cauDuongDau && !cauXnDau && !cauLungDau && firstKey === "phuong" && viTriRao && newLst
          ? await cauHoiPhuongGoiY(newLst.id, tenDuong(viTriRao), cachGoi, textBongAi)
          : null;
        const cauXacNhanDau = cauDuongDau ?? cauXnDau ?? cauLungDau ?? goiYDau;
        const cauHoiDau = cauDuongDau ?? cauXnDau ?? cauLungDau ?? goiYDau ?? (firstKey
          // 12/09/2026: tin ở HUYỆN / thị xã / tỉnh lân cận thì đơn vị dưới là XÃ —
          // hỏi "thuộc phường mấy" cho đất Củ Chi là lộ ra máy đọc mẫu câu.
          ? (firstKey === "phuong" && laNgoaiDoThi(quanDoc)
            ? cauHoiMau("phuong@huyen", cachGoi, loaiMoi)
            : !quanDoc && (firstKey === "vi_tri" || firstKey === "phuong")
            ? cauHoiMau(firstKey === "phuong" ? "phuong@chua_quan" : "vi_tri@chua_quan", cachGoi, loaiMoi)
            : firstKey === "vi_tri" && loaiMoi !== "chung_cu" && loaiMoi !== "dat"
            ? cauHoiMau("vi_tri@lan_dau", cachGoi, loaiMoi)
            : cauHoiMau(firstKey, cachGoi, loaiMoi, quanDoc, sDeal, viTriRao))
          : null);
        let raoReply: string | null = null;
        if (anthropicS) {
          try {
            const r1 = await anthropicS.messages.create({
              model: MODEL, max_tokens: 512,
              output_config: { effort: "low" },
              system: [{ type: "text", text: SELLER_SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: DONG_TEN }],
              messages: [{
                role: "user",
                content:
                  `${await boiCanhLuot()}Chủ nhà vừa nhắn rao: "${tinChoModel()}". Em đã ghi tin NHÁP — CHƯA đăng, chưa lên web (không nói đã đăng / lên tin / đang rao). ${hoiRaoPrompt}` +
                  `Viết MỘT tin ngắn như người thật nhắn Zalo: nhận câu rao${khenGanDay ? " (không khen, mấy tin gần đây em khen rồi)" : " (có điểm mạnh thật thì khen một ý, không thì thôi)"}, không cảm ơn / không nói "tin tưởng", không đọc lại số liệu, không xác nhận lại địa điểm` +
                  (cauXacNhanDau
                    // 25/09/2026 (bắn thật lx-05): câu gợi ý "thuộc Phường Bến Thành hay Phường Cầu Ông Lãnh" bị model nói lại
                    // thành "phường nào vậy ạ?" — rơi mất lựa chọn. Câu xác nhận / chọn do CODE tra ra thì gửi NGUYÊN VĂN
                    // ngay sau; model chỉ nhận câu rao, không hỏi gì.
                    ? `. Không hỏi gì (hệ thống tự gửi câu hỏi xác nhận ngay sau). Không nhắc phí, không nhận xét giá.`
                    : firstKey
                    // 05/10/2026 (văn phong demo AOND): chỉ đưa Ý cần hỏi; câu mẫu đi kèm khi chủ dự án đã sửa ở dashboard.
                    ? `.\nCẦN HỎI: ${firstKey === "phuong" && !quanDoc ? "phường và quận (tin chưa rõ quận)" : FACT_LABELS[firstKey] ?? firstKey}${
                      // Câu hẻm gọi đúng số hẻm ("105/12" → hẻm 105) là câu MANG DỮ LIỆU code tra ra → đưa nguyên; câu chủ dự án đã sửa ở dashboard → đưa làm gợi ý.
                      firstKey === "do_rong_hem" && cauHoiDau && /trong hẻm \d/.test(cauHoiDau) ? ` — hỏi đúng câu này: "${cauHoiDau}"`
                        : cauMauDaSua(firstKey, loaiMoi) ? ` — câu bên em hay dùng: "${cauHoiDau}", nói lại cho tự nhiên` : ""}\nHỏi đúng ý đó, không gắn thêm ý khác; không nhắc phí, không nhận xét giá.`
                    // SRS-5.1zzzy: không còn câu nào để hỏi mà bản nháp cũng chưa gửi được → KHÔNG hứa đăng (tin chưa lên kệ).
                    : `. Không hỏi gì, KHÔNG hứa đăng / lên tin (tin chưa lên kệ, chưa có bản nháp). Không nhắc phí, không nhận xét giá.`),
              }],
            });
            raoReply = r1.content.find((b) => b.type === "text")?.text?.trim() ?? null;
            const mocR1 = theoDoiVan(soVan, () => raoReply);
            if (raoReply && laLoiMeta(raoReply)) { console.log("chat-reply: r1 tra loi cau lenh, bo"); raoReply = null; }
            // SRS-5.1zzp (bước 3): câu đầu lệch ô → gọi lại model một lần; câu mẫu bên dưới chỉ là lưới cuối.
            if (raoReply && !cauXacNhanDau && firstKey && cauHoiDau) {
              const lyDo = lyDoLechO(raoReply, firstKey, cauHoiDau);
              if (lyDo) {
                console.log(`chat-reply: r1 lệch ô (${lyDo}) — gọi lại model`);
                const lai = await goiLaiChoDungO(raoReply, lyDo, FACT_LABELS[firstKey] ?? firstKey, cauHoiDau);
                if (lai) raoReply = lai;
                mocR1("goiLaiChoDungO", true);
              }
            }
            if (raoReply) raoReply = motCauHoi([raoReply])[0]; mocR1("motCauHoi");
            // 23/09/2026 (bắn thật): "hẻm 2m5 … rất được khách tìm", "ô tô đậu trước cửa" → "ô tô vào tận nhà".
            if (raoReply) raoReply = await soatNhanXet(raoReply, textBongAi); mocR1("soatNhanXet");
            if (raoReply) raoReply = boMenhDeKhenSai([raoReply], text, nhanXetAiXong)[0] ?? null; mocR1("boMenhDeKhenSai");
            // 25/09/2026 (bắn thật lx-08) → SRS-5.1zzzzk: tin vừa tạo luôn `cho_thong_tin`; câu "đã đăng" do lưới trạng thái ở đường ra
            // lo (`tinTrongLuot` = tin vừa tạo) — lưới riêng ở đây từng trả lại nguyên câu sai khi câu sai là cả lời.
            if (raoReply && (await loiBotDu())) raoReply = boKhenThiTruong([raoReply])[0]?.trim() || null; mocR1("boKhenThiTruong");
            if (raoReply) raoReply = boHuaHoiChuNha([raoReply])[0]?.trim() || null; mocR1("boHuaHoiChuNha");
            // FR-239 d: tỉnh / quận / khu khách chưa nói (bằng chứng = câu rao) → bỏ câu đó, như đường hỏi tiếp.
            if (raoReply) {
              const vt = boViTriBia([raoReply], text);
              if (vt.bo.length) console.log("chat-reply: bo vi tri bia (rao)", vt.bo.join(", "));
              raoReply = vt.replies[0]?.trim() || null; mocR1("boViTriBia");
            }
            if (raoReply && !cauXacNhanDau && firstKey && cauHoiDau) raoReply = thayCauHoiLech(raoReply, firstKey, cauHoiDau); mocR1("thayCauHoiLech");
            // 27/09/2026 (bắn thật lx-38, FR-232): câu hỏi ĐẦU sau câu rao là câu sổ gộp mà model rút còn "Sổ nhà mình riêng
            // hay chung ạ?" (lời dặn "đừng gắn thêm ý khác") → mất hai ô đứng tên / thế chấp. Thiếu vế bắt buộc → câu mẫu.
            if (raoReply && !cauXacNhanDau && firstKey && cauHoiDau) raoReply = giuVeCauMau(raoReply, firstKey, cauHoiDau); mocR1("giuVeCauMau");
            // SRS-5.1zzo: ô chờ `firstKey` sắp mở — lời model không hỏi thì nối câu hỏi của ô đó (câu xác nhận code tra ra đã gửi riêng).
            if (raoReply && !cauXacNhanDau && firstKey && cauHoiDau) raoReply = damBaoCauHoi(raoReply, cauHoiDau); mocR1("damBaoCauHoi");            await doTien(client, r1.usage);
          } catch (e) {
            await ghiLoi(client, "chat-reply model r1(seller)", e);
          }
        }
        if (!raoReply) {
          raoReply = `Dạ em nhận tin rao rồi ạ.` +
            (cauHoiDau ? ` ${cauHoiDau}` : "");
        } else if (cauXacNhanDau) {
          // Model đã bị dặn không hỏi; lỡ còn câu hỏi thì cắt, rồi nối câu xác nhận nguyên văn.
          raoReply = `${raoReply.replace(/[^.!?]*\?\s*$/u, "").trim()} ${cauXacNhanDau}`.trim();
        }
        if (dapRao) raoReply = `${dapRao}\n${raoReply}`;
        return await traLoiSeller([bongGhiNhanCho(raoReply), raoReply].filter(Boolean), { listing_code: newLst.code, ghi_nhan: ghiNhan });
      }
    }
    // Seller nhắn nhưng KHÔNG có câu chờ → vẫn trả lời ĐÚNG VAI người bán
    // (trước đây rơi xuống luồng mua → bot hỏi "anh tìm khu nào" với chính chủ nhà)
    // Không có câu chờ mà người thật đang cầm cuộc → im, khỏi tốn lượt model.
    if (humanActive) return await traLoiSeller([]);

    // 09/09 tối lần 3: KHÔNG có câu chờ mà chủ nhà vẫn nhắn thông số ("sổ đỏ,
    // đất thuê nhà nước tới 2058") → trước đây rơi xuống chăm sóc chung, fact BAY
    // MẤT. Nay: ghi mọi fact nhận ra vào căn đang neo (tin mới nhất chưa chốt), và
    // nếu tin chưa lên kệ thì mở luôn câu kế (tiền định) thay vì tán gẫu.
    // 21/09/2026 chế độ `chinh`: AI đọc trước cả ở đây (thông số rơi ngoài câu chờ).
    let factRoi: Array<{ question: string; answer: string }> = wantsSell ? [] : nhanDienNhieuFact(text).filter((f) => f.question !== "bo_sung");
    const factLuatRoi = factRoi;
    const kqAiRoi = !wantsSell && bongAi && cheDoBocAi && (await cheDoBocAi) === "chinh" ? await bongAi : null;
    const docAiRoi = (dong: DongDb | null) => {
      if (!kqAiRoi?.ket) return;
      const ai = docAiChinh(kiemDeXuat(kqAiRoi.truong, text).dat, dong);
      factRoi = [...ai.ghi, ...factLuatRoi.filter((f) => !KHOA_FACT_AI_BIET.has(f.question))];
    };
    docAiRoi(null);
    if (factRoi.length || kqAiRoi?.ket) {
      const { data: canNeo } = await client.from("listings")
        .select("id, code, status, can_chu_duyet, chu_duyet_at, property_type, district, deal")
        .eq("seller_id", sellerRow.id).in("status", ["cho_thong_tin", "dang_ban"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      // SRS-5.1zzzzzzv: đọc lại đề xuất AI KÈM tin đang neo (loại giao dịch) — đọc không kèm dòng tin thì giá THUÊ "6 triệu" bị coi là giá bán.
      if (canNeo) docAiRoi(canNeo as unknown as DongDb);
      if (canNeo && factRoi.length) {
        for (const f of factRoi) {
          const { error: frErr } = await ghiFact(client, {
            p_listing_id: canNeo.id, p_question: f.question, p_answer: f.answer, p_source: "seller_chat", goc: gocCua(f),
          });
          if (frErr) await ghiLoi(client, "chat-reply ghi_fact_listing(roi)", frErr.message);
        }
        // SRS-5.1zzzzz (khách mô phỏng 11/10: "Dạ em ghi độ rộng hẻm trước nhà, đường vào (mặt tiền hay hẻm) rồi ạ"): FACT_LABELS là
        // CÂU HỎI — lời ghi nhận đọc nhãn ngắn (`nhanGhi`, cùng bảng với 🤖), mỗi nhãn một lần.
        const daGhi = [...new Set(factRoi.map((f) => nhanGhi(f.question)))].join(", ");
        // SRS-5.1zzzzzzv: tin chưa lên kệ → câu kế / bản nháp / nói thật còn thiếu gì (MỘT hàm `tiepSauGhi`, chung với đường sửa).
        // Trước đây hết câu mà chưa đủ điểm thì rơi xuống câu "Có khách quan tâm là em báo liền" như thể tin đã đăng.
        const tiepRoi = await tiepSauGhi(canNeo.id, factRoi.map((f) => f.question), `Dạ em ghi ${daGhi} rồi ạ.`, { saved_fact: factRoi.map((f) => f.question) });
        if (tiepRoi) return tiepRoi;
        return await traLoiSeller([`Dạ em ghi ${daGhi} vào tin rồi ạ. Có khách quan tâm là em báo ${cachGoi} liền.`], { saved_fact: factRoi.map((f) => f.question) });
      }
    }

    // FR-183 b (10/09): chủ nhà nói "đủ thông tin rồi" ngoài vòng hỏi — đó là
    // lời CHỐT, không phải câu chăm sóc chung. Đóng dấu `chu_noi_du_at`, đọc lại
    // điểm rồi trả lời đúng việc: rao như vậy, điểm bao nhiêu, muốn thêm điểm
    // thì gửi gì. Trước bản này rơi vào câu mẫu "em kiểm tra rồi báo lại".
    const ydChot = await yDinhAi(); // SRS-5.1zf: "đủ rồi" ngoài vòng hỏi do AI đọc; luật khi AI không chạy
    if (ydChot !== undefined ? ydChot?.loai === "du_roi" : laDuRoi(text)) {
      // SRS-5.1zzzzzzu: cùng hai cửa với nhánh "đủ rồi" trong vòng hỏi (SRS-5.1zzzzzq / 5.1zzzzzv) mà nhánh ngoài vòng hỏi thiếu —
      // (1) khách báo SẮP GỬI nội dung ("đăng giúp chị nội dung này nhé") → mời gửi, không đóng dấu, không đăng;
      // (2) tin chủ nhà mới hơn đã tới → nhường lượt, lượt tin cuối đọc nội dung.
      if (ycLuot?.loai === "gui_noi_dung_sau") {
        return await traLoiSeller([`Dạ ${cachGoi} gửi nội dung tin qua đây giúp em nha, em đọc rồi soạn lại cho mình ạ.`], { sap_gui_noi_dung: true });
      }
      if (kiemTinMoiHon && await kiemTinMoiHon().catch(() => false)) {
        console.log("chat-reply: đủ rồi (ngoài vòng hỏi) nhưng có tin mới hơn → nhường lượt");
        return await hoanTat({ reply: null, replies: [], role: "seller", superseded: true, superseded_luc: "du_roi" });
      }
      const { data: tinChot } = await client.from("listings")
        .select("id, code, status")
        .eq("seller_id", sellerRow.id)
        .in("status", ["dang_ban", "dang_quan_tam", "cho_thong_tin"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (tinChot) {
        const luc = new Date().toISOString();
        const { error: duErr } = await client.from("listings")
          .update({ chu_noi_du_at: luc })
          .eq("id", tinChot.id);
        if (duErr) await ghiLoi(client, "chat-reply chu noi du roi", duErr.message);
        daDuyetLuot = true; // SRS-5.1zzzzzzz4
        // SRS-5.1zzzzr (bắn production 09/10, thu-thuong12: "đăng giúp chú" → "Dạ vâng, vậy em rao như vậy nhé…" mà tin vẫn
        // `cho_thong_tin`, không bản nháp): nhánh này từng đóng dấu duyệt rồi nói "em rao" bất kể tin có lên kệ được không. Tin CHƯA
        // lên kệ đi đúng một đường với "đăng đi" trong vòng hỏi (`guiBanNhap(…, dangLuon)`): đủ điểm thì đóng dấu và nói theo trạng
        // thái ĐỌC LẠI sau khi ghi; chưa đủ thì nói thật còn thiếu gì và mở câu hỏi cho mục thiếu đầu.
        if (tinChot.status === "cho_thong_tin") {
          const nhap = await guiBanNhap(tinChot.id, { du_roi: true }, false, [], true);
          if (!Array.isArray(nhap)) return nhap;
          const { data: lLoai } = await client.from("listings").select("property_type, district, deal").eq("id", tinChot.id).maybeSingle();
          const khoaThieu = nhap.map((m) => khoaCuaMucThieu(m, lLoai?.property_type)).find(Boolean) ?? null;
          if (khoaThieu) {
            const { error: tErr } = await moCauTreo({ listing_id: tinChot.id, question: khoaThieu, status: "pending" });
            if (tErr && tErr.code !== "23505") await ghiLoi(client, "chat-reply du roi(mo cau thieu)", tErr.message);
          }
          const thieuVan = nhap.slice(0, 2).join(" và ");
          return await traLoiSeller([
            `Dạ tin mình chỉ cần thêm ${thieuVan || "vài thông tin"} là đủ điều kiện lên kệ ạ.${khoaThieu ? `\n${cauHoiMau(khoaThieu, cachGoi, lLoai?.property_type, lLoai?.district, lLoai?.deal)}` : ""}`,
          ], { du_roi: true, thieu: nhap, ...(khoaThieu ? { asked: khoaThieu } : {}) });
        }
        const { data: dk } = await client.rpc("diem_tin", { p_listing_id: tinChot.id });
        const d = dk as { diem?: number; thieu?: string[] } | null;
        const thieu = (d?.thieu ?? []).slice(0, 2);
        return await traLoiSeller([
          [
            cauTD("du_roi"),
            cauTD("du_roi_diem", { diem: d?.diem }),
            thieu.length ? cauTD("du_roi_them", { thieu: thieu.join(" và ") }) : "",
            cauTD("du_roi_dong"),
          ].filter(Boolean).join("\n"),
        ], { du_roi: true, diem: d?.diem ?? null });
      }
    }

    // 06/10/2026 (bắn thử thu-srd-b1, SRS-5.1zzo): danh sách này từng lấy MỌI tin của người bán, kể cả tin đã ẩn / đã chốt →
    // khối "đang rao các tin" kể cả căn vừa ngưng, model nói "tin của anh đang rao". Chỉ tin còn MỞ; không có thì nói thẳng.
    const { data: sellerLst } = await client.from("listings")
      .select("code, location_raw, ward, price_raw, status")
      .eq("seller_id", sellerRow.id).in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"])
      .order("created_at", { ascending: false }).limit(5);
    // SRS-5.1zzzn (08/10, bắn thử …kc1tatt: "dang di" → "em đang rao tích cực" khi tin còn CHỜ THÔNG TIN): khối này từng gọi mọi
    // tin mở là "đang rao" — model nói theo tiêu đề. Mỗi dòng mang TRẠNG THÁI THẬT: chưa lên kệ thì nói rõ là chưa rao.
    const lstLines = (sellerLst ?? [])
      .map((l) => `${diaChiHienThi({ location_raw: l.location_raw, ward: l.ward }, null) || "(chưa rõ địa chỉ)"} · ${l.price_raw ? donViGiaDep(l.price_raw) : "?"} — ${
        (l as { status?: string }).status === "cho_thong_tin" ? "CHƯA LÊN KỆ (đang hỏi thêm thông tin, CHƯA rao — không nói đang rao / đã đăng)" : "ĐANG RAO trên web"}`)
      .join("\n");
    // OPEN-30: chăm sóc chung — model hỏng thì ghi nhận bằng câu mẫu.
    let sReply: string | null = null;
    const bongR3Truoc: string[] = []; // SRS-5.1zzzzzn: bong bóng tiền định (phí) đi trước lời model r3
    // SRS-5.1zzzzzv (chủ dự án 13/10/2026: "nếu sau khi bot cảm ơn, khách oke rồi thì ko có lặp lại nữa" — Zalo thật 14:57: "ok" → "Dạ vâng, em
    // cảm ơn chị ạ." ba lượt liền, một lượt còn kể lại điểm 95/100): khách CHỈ GẬT (AI đọc gật, lượt bóc tách không thấy dữ liệu / câu hỏi)
    // khi không có câu treo → câu bot vừa nói là câu ĐÓNG (không hỏi gì) thì im, không gửi gì; chưa đóng thì "Dạ vâng ạ." một câu, không gọi model.
    {
      const gatTron = (await dongYAi())?.la === "dong_y";
      const kG = gatTron && bongAi ? await bongAi : null;
      const khongGiMoi = !!kG?.ket && !kG.truong?.length && !kG.kienThuc?.length && !kG.traLoi?.co_tra_loi && !kG.hoiLai?.co_hoi && !kG.capNhat?.length;
      if (gatTron && khongGiMoi && !(await hoiLaiAi(text))) {
        const botDong = !!cauBotThat && !/\?/.test(cauBotThat) && /cảm ơn|dạ vâng|báo .{0,12}liền|rao như vậy|nghe rồi/iu.test(cauBotThat);
        return await traLoiSeller(botDong ? [] : ["Dạ vâng ạ."], { gat_tron: true, ...(botDong ? { im: true } : {}) });
      }
    }
    if (anthropicS) {
      try {
        // SRS-5.1zzzj (chat thử 08/10, …w44h: "ừ em có nhận rao bán cho anh ở quận 8 không em" → "Dạ anh chị nhận rao được chứ…"):
        // lời r3 được soạn bằng NGỮ CẢNH dựng TRƯỚC khi AI đọc tin — cách gọi theo luật ("anh chị"), câu khách hỏi em không tới
        // model. Điều AI đã hiểu (tự xưng, câu hỏi — đều qua kiểm trích dẫn) phải vào câu lệnh trước khi model viết, không sửa sau.
        const hoiR3 = await hoiLaiAi(text);
        const camR3 = ({ buc: "đang bực", nghi_ngo: "nghi ngờ", muon_dung: "muốn dừng" } as Record<string, string>)[(await camXucAi())?.muc ?? ""] ?? null;
        // SRS-5.1zzzzzn (test Zalo 13/10/2026: tin lên kệ, bot hỏi "Mà anh chị biết phí bên em chưa ạ?", khách "Phí như thế nào em ?" →
        // model tự hỏi vai, khách "Mình là chính chủ" → "Dạ vâng anh chị.", phí không bao giờ được báo): r3 là đường DUY NHẤT trả lời câu
        // hỏi ngược mà không qua bong bóng tiền định — câu phí phải do `cauPhi(vaiPhi(…))` nói như r1 / r2; chưa rõ vai thì câu không số +
        // câu hỏi vai, và lượt khách tự nói vai sau đó báo số (`dapPhiRoVai`, cùng điều kiện nhánh câu treo).
        const cauHoiR3 = hoiR3 ? (hoiR3.caTin ? text : hoiR3.cau) : null;
        // SRS-5.1zzzzzo: câu phí chưa rõ vai nay nêu cả hai mức — không nối câu hỏi vai.
        const dapR3 = cauHoiR3 ? dapHoiNguocTienDinh(cauHoiR3, cachGoi, cauPhi(vaiPhi(sellerRow), tinPhiMotCan?.deal ?? dealNguoi, { benEm: true }), hoiR3?.chuDe, botDaNoiGan(), viDuPhiNguoi(tinPhiMotCan?.deal, tinPhiMotCan?.price_vnd)) : null;
        if (dapR3 && cauHoiR3) cauDaDap = cauHoiR3;
        if (dapR3 && hoiR3?.caTin) return await traLoiSeller([dapR3], { hoi_nguoc: cauHoiR3 });
        const vaiPhiR3 = vaiPhi(sellerRow);
        const botDaNoiR3 = lichSuRows.filter((m) => !laTinNguoi(m.sender)).map((m) => m.body ?? "");
        const dapPhiR3 = !cauHoiR3 && vaiTuNoiLuot && vaiPhiR3 !== "unknown" && botDaNoiR3.some(coCauPhiChuaRoVai) && !botDaNoiR3.some(coCauPhiTheoVai)
          ? `Dạ vậy ${cauPhi(vaiPhiR3, dealNguoi, { benEm: true })} ạ.`
          : null;
        if (dapPhiR3) bongR3Truoc.push(dapPhiR3);
        if (dapR3) bongR3Truoc.push(dapR3);
        const hoiR3Prompt = dapPhiR3
          ? `Chủ nhà vừa cho biết mình là ${vaiTuNoiLuot === "moi_gioi" ? "môi giới" : "chính chủ"}; bong bóng gửi ngay trước tin em đã báo phí theo vai đó — KHÔNG nhắc phí, KHÔNG hỏi lại chủ nhà hay môi giới. `
          : dapR3
          ? `Tin chủ nhà có kèm một câu hỏi — câu đó đã được trả lời ở bong bóng gửi ngay trước tin em; em không nhắc lại nó, KHÔNG nói chữ "hệ thống". `
          : await danHoiNguocLuot(hoiR3 ? { cau: cauHoiR3 ?? text, chuDe: hoiR3.chuDe } : null);
        const r3 = await anthropicS.messages.create({
          model: MODEL, max_tokens: 512,
          output_config: { effort: "low" },
          system: [{ type: "text", text: SELLER_SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: DONG_TEN }],
          messages: [{
            role: "user",
            content:
              `${await boiCanhLuot()}NGƯỜI BÁN${sellerRow.name ? ` (${sellerRow.name})` : ""} có các tin (trạng thái ghi cuối mỗi dòng):\n${lstLines || "(KHÔNG CÓ tin nào đang rao — không nói tin nào đang rao / đã đăng / có khách; họ nhắc một căn thì nói thật em chưa có thông tin căn đó và xin địa chỉ, diện tích, giá để mở tin)"}\n\n` +
              hoiR3Prompt +
              (sellerMoi
                // 27/09/2026 (chủ dự án test Zalo: "Chào em" → câu chào hỏi vai → "Anh bán" → bot "Dạ em chào anh! Anh muốn
                // rao bán hay cho thuê ạ?"): đã chào ở tin trước thì KHÔNG chào lại; khách đã nói bán / cho thuê thì không hỏi lại.
                // 07/10/2026 (SRS-5.1zzze, test os6o): câu mời cũ xin "địa chỉ, diện tích và giá" một lượt — trái luật một ý mỗi
                // lượt (FR-177); khách trả lời một ý rồi bot hỏi dần các ý kia, nên câu ba ý chỉ làm khách gõ một tràng.
                ? `Người này VỪA cho biết đang có bất động sản muốn rao ("${textOrTag}") nhưng chưa nói chi tiết. Soạn MỘT tin NGẮN ${lichSuRows.some((m) => !laTinNguoi(m.sender)) ? "(em ĐÃ chào ở tin trước — KHÔNG chào lại, mở bằng \"Dạ\")" : "chào"} + hỏi đúng MỘT ý: bất động sản của họ ở đâu (một câu hỏi, không gộp diện tích / giá / loại nhà — các ý đó em hỏi dần sau; họ đã nói một phần vị trí - quận, phường hay đường - thì hỏi phần CÒN THIẾU, không hỏi lại phần đã nói) - KHÔNG hỏi lại muốn bán hay cho thuê (họ vừa nói rồi; câu họ không nói rõ thì hiểu là bán), KHÔNG hỏi nhu cầu mua nhà, KHÔNG nhắc phí hay chính chủ/môi giới (hệ thống đã báo riêng ngay sau tin này).`
                // SRS-5.1zzzi (chat thử …lboq: bot hỏi "ở Hồ Chí Minh đúng không?", khách "chính xác em" → model "em sẽ rao tích cực cho
                // căn hộ này" — không có tin nào): model phải đọc câu EM vừa nói để hiểu tin khách là trả lời cho câu nào.
                : `${cauBotThat?.trim() ? `Câu em vừa nhắn họ (nguyên văn): "${cauBotThat.trim().slice(0, 300)}". Tin của họ có thể là câu trả lời cho câu đó — đọc theo câu đó mà đáp; chưa có tin rao nào thì không nói đã rao / sẽ rao căn nào, hỏi tiếp đúng MỘT ý còn thiếu để lên tin. ` : ""}` +
                  `Họ vừa nhắn: "${textOrTag}". Soạn MỘT tin trả lời NGẮN đúng vai chăm sóc NGƯỜI BÁN - tuyệt đối KHÔNG hỏi nhu cầu mua nhà. ` +
                  // SRS-5.1zzzzzn (chủ dự án 13/10/2026: "kết thúc câu chuyện xem cảm xúc của khách, rồi dạ vâng, cảm ơn anh chị là được. nó bị lặp").
                  `Cảm xúc khách lượt này (AI đọc): ${camR3 ?? "bình thường"}. Khách chỉ khép lại / xác nhận (không hỏi, không đưa thông tin mới) thì đáp đúng một câu ngắn "Dạ vâng, em cảm ơn ${cachGoi} ạ." — khách đang bực hay nghi ngờ thì xin lỗi ngắn / trấn an thay cho câu cảm ơn. Không lặp lại ý mấy tin gần đây em đã nói (có khách là em báo, bản nháp, phí, hạng). ` +
                  `Không bịa tình trạng tin/lượt khách quan tâm; điều chưa nắm thì nói "để em kiểm tra rồi báo lại anh/chị liền".`),
          }],
        });
        sReply = r3.content.find((b) => b.type === "text")?.text?.trim() ?? null;
        if (sReply && sellerMoi && lichSuRows.some((m) => !laTinNguoi(m.sender)) && (await loiBotDu())) sReply = apVan(soVan, "boChaoLai", sReply, boChaoLai(sReply));
        // SRS-5.1zzzzr (thu-thuong11: "ok em" → "Để em kiểm tra giá giao dịch khu Phú Hòa Đông gần đây rồi báo lại chị nhé."): lưới
        // lời hứa tự kiểm (lớp an toàn, luôn bật) trước đây chỉ chạy ở r2 — r3 cũng là lời model gửi chủ nhà.
        if (sReply) sReply = apVan<string | null>(soVan, "boHuaTuKiemTra(r3)", sReply, boHuaTuKiemTra(sReply, null) || null);
        // SRS-5.1zzzzx: lời chăm sóc (r3) cũng do model viết — cùng lượt AI soát nhận xét như r1 / r2 / r2b.
        if (sReply) sReply = await soatNhanXet(sReply, [...lichSuRows.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? ""), text].join("\n"), lstLines ?? "");
        await doTien(client, r3.usage);
      } catch (e) {
        await ghiLoi(client, "chat-reply model r3(seller)", e);
      }
    }
    return await traLoiSeller([
      ...bongR3Truoc,
      sReply ??
        (sellerMoi
          ? (lichSuRows.some((m) => !laTinNguoi(m.sender)) ? "Dạ, bất động sản của anh/chị" : "Dạ em chào anh/chị! Bất động sản của anh/chị") + " ở đâu vậy, ở Hồ Chí Minh đúng không ạ?"
          // SRS-5.1zzzzr: câu dự phòng không hứa "kiểm tra rồi báo lại" — không có việc nào đi kèm lời hứa đó.
          : `Dạ em ghi nhận rồi ạ.`),
    ]);
  }

  // Nhớ người trò chuyện (FR-21/26) + hồ sơ nhu cầu (FR-130).
  // Get-or-create buyer + conversation qua RPC advisory-lock (FR-131 —
  // 3 tin gõ vụn đến đồng thời không được tạo trùng buyer/conversation).
  danhDau("mua_vao");
  const { data: bc, error: bcErr } = await client
    .rpc("ensure_buyer_conversation", {
      p_zalo_user_id: externalUserId,
      p_channel: channel,
    }).single();
  if (bcErr || !bc) {
    const detail = bcErr?.message ?? "ensure_buyer_conversation";
    return await baoHong({ error: detail }, 500, detail);
  }
  // Kiểu khớp RETURNS TABLE của `ensure_buyer_conversation` (schema.sql).
  const bcRow = bc as unknown as {
    b_id: string; b_name: string | null; c_id: string; b_prefs: Record<string, unknown> | null;
    c_ctv_id: string | null; c_human_touch_at: string | null; c_human_hold: boolean | null;
  };
  const buyer = { id: bcRow.b_id, name: bcRow.b_name };
  const convId = bcRow.c_id;
  const prefs: Record<string, unknown> = bcRow.b_prefs ?? {};
  // FR-211 (18/09/2026): khách MUA nói ý có nhãn ("yên tĩnh", "gần chợ", "xe hơi vào nhà") → nhớ vào hồ
  // sơ (`preferences.nhan`) và lọc kho bằng contains — cùng từ điển với phía bán (`ganNhan`).
  const nhanMuon = ganNhan(text);
  const nhanLoc = [...new Set([...(Array.isArray(prefs.nhan) ? (prefs.nhan as string[]) : []), ...nhanMuon])];
  // Hai cột của hội thoại mà cổng nhường sân (FR-141) và các việc báo CTV cần
  // — RPC trả luôn từ 20260902d, khỏi SELECT `conversations` lần nữa (FR-171 h).
  const convRow = {
    ctv_id: bcRow.c_ctv_id ?? null,
    human_touch_at: bcRow.c_human_touch_at ?? null,
    human_hold: bcRow.c_human_hold === true,
  };

  // Dedupe theo msg_id (retry không tạo tin đôi)
  const { data: insMsg, error: msgErr } = await client.from("messages").insert({
    conversation_id: convId, sender: "buyer",
    body: imageUrl ? `${textOrTag} [ảnh: ${imageUrl}]` : text,
    zalo_msg_id: msgId,
  }).select("seq").single();
  if (msgErr?.code === "23505" && !(coSo && soAttempts > 1)) {
    // Trùng từ THỜI TRƯỚC SỔ — lượt cũ đã trả lời rồi, đừng trả lời lần hai.
    // Chốt sổ completed-rỗng để retry sau không quay lại đây.
    return await hoanTat({ reply: null, replies: [], deduped: true });
  }
  if (msgErr && msgErr.code !== "23505") {
    return await baoHong({ error: msgErr.message }, 500, msgErr.message);
  }
  // 23505 khi soAttempts > 1: lượt trước của chính msg_id này chết giữa chừng,
  // tin khách ĐÃ nằm trong messages — lấy lại seq dòng cũ (check nhường-lượt
  // FR-131 bên dưới cần nó) rồi đi tiếp trả lời nốt, đừng nuốt.
  let insMsgSeq = insMsg?.seq ?? null;
  if (insMsgSeq == null && msgId) {
    const { data: cu } = await client.from("messages").select("seq")
      .eq("zalo_msg_id", msgId).maybeSingle();
    insMsgSeq = cu?.seq ?? null;
  }
  // (`last_message_at` do trigger trên `messages` đẩy — 20260902d.)

  // FR-141: người thật nhắn tay trong 30 phút gần đây → bot im, chỉ ghi log
  // tin khách; người thật ngừng đủ lâu thì bot tự tiếp chuyện lại.
  if (convRow.human_hold || (convRow.human_touch_at &&
      Date.now() - Date.parse(convRow.human_touch_at) < 30 * 60e3)) {
    return await hoanTat({ reply: null, replies: [], human_active: true, human_hold: convRow.human_hold });
  }
  // SRS-5.1zzzzzq (Zalo thật 13/10/2026): khách mua thả 👍 hai lần → mỗi lần một lượt model + "🤖 Không trích xuất được gì" + câu
  // tư vấn lạc đề. Thả cảm xúc là GẬT (FR-142), bên mua không có câu nào đang xin đồng ý → im (tin đã ghi messages).
  if (!imageUrl && laTinRongNghia(text)) return await hoanTat({ reply: null, replies: [], tha_cam_xuc: true });

  // MỘT lượt đọc `messages` cho bốn việc từng là bốn truy vấn nối đuôi
  // (FR-171 h): trần 24h (FR-146), nhường lượt (FR-131), "tin đầu tiên?"
  // (FR-159) và lịch sử cho model. Lịch sử 12 tin mới nhất theo `seq` giảm dần
  // — đúng thứ tự identity DB cấp, không hoà.
  const [{ count: msg24h }, { data: lichSu }] = await Promise.all([
    client.from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convId).in("sender", ["buyer", "seller"])
      .gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString()),
    client.from("messages").select("sender, body, seq")
      .eq("conversation_id", convId).order("seq", { ascending: false }).limit(12),
  ]);
  const history = (lichSu ?? []) as Array<{ sender: string; body: string; seq: number }>;

  // FR-146: trần 100 tin/24h mỗi khách. Chống người ta lấy anon key gọi thẳng
  // function đốt tiền model; khách thật nhắn nhiều đến mức này thì cũng nên có
  // người thật vào. Chạm trần: trả lời MỘT lần + báo CTV/admin, sau đó im.
  const DAILY_LIMIT = 100;
  if ((msg24h ?? 0) > DAILY_LIMIT) {
    const { count: quotaEsc } = await client.from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", buyer.id).eq("kind", "escalation")
      .gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString());
    if ((quotaEsc ?? 0) > 0) {
      // đã báo rồi → im tới hết ngày, không tốn thêm lượt model nào
      return await hoanTat({ reply: null, replies: [], rate_limited: true });
    }
    const capMsg =
      "Dạ hôm nay mình trao đổi nhiều rồi, để em nhờ anh/chị phụ trách nhắn lại trực tiếp nha!";
    await client.from("messages").insert({
      conversation_id: convId, sender: "bot", body: capMsg,
    });
    await client.from("conversations").update({
      needs_human: true, needs_human_at: new Date().toISOString(),
    }).eq("id", convId);
    await client.from("reminders").insert({
      kind: "escalation", buyer_id: buyer.id,
      ctv_id: convRow.ctv_id,
      due_at: new Date().toISOString(),
      note: `khách nhắn hơn ${DAILY_LIMIT} tin trong 24h, bot tạm dừng trả lời. Anh/chị vào xem giúp`,
    });
    return await hoanTat({ reply: capMsg, replies: [capMsg], rate_limited: true });
  }

  // FR-131: KHÔNG delay nhân tạo (quyết định chủ dự án 25/08 — "càng nhanh càng
  // tốt"). Chỉ giữ check nhường-lượt: tin mới hơn của cùng khách đã vào trong
  // lúc xử lý thì lượt này im, lượt của tin cuối trả lời trên ngữ cảnh gộp.
  // "Tin mới nhất" xếp theo `seq` (identity DB cấp, không bao giờ hoà) chứ
  // không theo `created_at` — hai tin cùng mili-giây là created_at bốc thăm.
  // Lượt này vẫn xử lý ĐÚNG tin của nó (insMsgSeq), không lấy "tin mới nhất"
  // làm danh tính; câu này chỉ quyết định NHƯỜNG hay không. Tin mới nhất của
  // khách nằm ngay trong 12 tin vừa nạp (nạp SAU khi chèn tin này).
  const tinKhach = history.filter((m) => laTinNguoi(m.sender));
  const newest = tinKhach[0] ?? null;
  if (newest && insMsgSeq != null && newest.seq > insMsgSeq) {
    // Completed-rỗng là ĐÚNG cả với sổ: tin này được lượt của tin cuối trả lời
    // trên ngữ cảnh gộp — phát lại rỗng, không phát lại đôi.
    return await hoanTat({ reply: null, replies: [], superseded: true });
  }
  if (insMsgSeq != null) {
    const seqToi = insMsgSeq;
    kiemTinMoiHon = async () => {
      // SRS-5.1zzzzzzl: thả cảm xúc không thay lượt đang chạy (xem bản người bán).
      const { data, error } = await client.from("messages").select("seq, body").eq("conversation_id", convId)
        .in("sender", ["buyer", "seller"]).gt("seq", seqToi).limit(5);
      if (error) { await ghiLoi(client, "chat-reply kiem tin moi hon (mua)", error.message); return false; }
      return ((data ?? []) as Array<{ body: string | null }>).some((m) => !laTinRongNghia(m.body ?? ""));
    };
  }

  // ─── FR-159 (nửa 2/2): người LẠ nhắn câu KHÔNG rõ vai → HỎI, không đoán.
  // "Dạ em chào anh" / "nhà phường 4 tầm 5 tỷ" — câu đầu tiên của một người
  // chưa có hồ sơ nào có thể là người mua lẫn người bán. FR-159: đoán nhầm
  // người mua thành người bán là lượt khó chịu, chiều ngược lại chỉ tốn một câu
  // hỏi thừa → HỎI đúng một lần, không gọi model (đỡ một lượt tiền), mặc định
  // NGƯỜI MUA. Câu trả lời tự nhận có BĐS thì nửa 1/2 ở trên bắt ở lượt kế
  // (cờ `hoi_vai` mở đúng vế "tôi có căn nhà"); còn lại ở hàng người mua.
  // KHÔNG hỏi khi đã rõ: đang hỏi mua, nhắc mã căn (từ web sang), gửi ảnh (để
  // model đọc ảnh), hay đã có hồ sơ nhu cầu. Chỉ hỏi ở TIN ĐẦU TIÊN của hội
  // thoại, và đứng SAU kiểm tra nhường-lượt: khách gõ "chào em" rồi "tôi muốn
  // mua nhà" liền tay thì lượt đầu nhường, không hỏi vai thừa.
  // FR-29/30: khách nhắc mã căn (gõ tay hoặc bấm từ trang chi tiết web sang) —
  // bóc MỘT lần, dùng cho cả cổng hỏi-vai lẫn khối "căn khách đang nhắc".
  const mentioned = [...new Set(
    [...textOrTag.matchAll(CODE_RE)].map((m) => m[1].toUpperCase()),
  )].slice(0, 3);
  const nhacMaCan = mentioned.length > 0;
  const daCoHoSo = BUYER_PROFILE_FIELDS.some(([k]) => prefs[k] != null && prefs[k] !== "");
  // FR-79 (v48): người lạ mở đầu bằng "alo được không" là đang ĐÒI GỌI — đi
  // thẳng hàng người mua để mở việc VOICE, hỏi vai ở đây là nuốt mất yêu cầu.
  if (!sellerRow && !prefs.hoi_vai && !hoiMua && !nhacMaCan && !imageUrl && !daCoHoSo &&
      !VOICE_RE_KD.test(tKD)) {
    // "Tin đầu tiên?" đếm trên 12 tin đã nạp; chỉ khi cửa sổ đầy mà số tin
    // khách trong đó vẫn ≤ 1 (11 tin bot + 1 tin khách) mới phải đếm chính xác.
    let tinTruoc = tinKhach.length;
    if (history.length >= 12 && tinTruoc <= 1) {
      const { count } = await client.from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", convId).in("sender", ["buyer", "seller"]);
      tinTruoc = count ?? 0;
    }
    if (tinTruoc <= 1) {
      // 09/09/2026: lời chào ở bot_prompts.loi_chao (có chị Thu), code chỉ là dự phòng.
      // 21/09/2026 (Zalo thật, chủ dự án): tin đầu chưa biết nam/nữ → "anh/chị" gạch chéo → "anh chị".
      // 22/09/2026 (chủ dự án: "cô chào cháu nó vẫn đáp anh chị"): tin đầu đã xưng chú/cô/bác (hoặc anh/chị)
      // thì lời chào gọi đúng người và xưng cháu; "chào cháu" chưa rõ chú hay cô → xưng cháu, gọi "mình" và
      // hỏi luôn "cháu gọi chú hay cô". Cách gọi ghi vào hồ sơ mua để lượt sau (kể cả khi mở hồ sơ bán) còn nhớ.
      const xhDau = batXungHo(text) ?? tuXungTuCau(text);
      const chaoChau = !xhDau && laChaoChau(text);
      const hoaXh = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
      let cauHoiVai = LOI_CHAO_DB;
      if (xhDau) cauHoiVai = doiTuXung([cauHoiVai.replace(/anh\/chị/g, xhDau).replace(/Anh\/chị/g, hoaXh(xhDau))], xhDau)[0];
      else if (chaoChau) {
        cauHoiVai = doiTuXung([cauHoiVai.replace(/chào anh\/chị,?/, "chào ạ,").replace(/anh\/chị/g, "cô chú").replace(/Anh\/chị/g, "Cô chú")], null, "lon_tuoi")[0] +
          "\nCháu gọi chú hay cô cho tiện ạ?";
      }
      cauHoiVai = boGachCheo(cauHoiVai);
      const { error: hvErr } = await client.from("messages").insert({
        conversation_id: convId, sender: "bot", body: cauHoiVai,
      });
      if (hvErr) await ghiLoi(client, "chat-reply messages hoi_vai", hvErr.message);
      const { error: pErr } = await client
        .rpc("merge_buyer_prefs", { p_buyer_id: buyer.id, p_delta: { hoi_vai: tinHieuMoiGioi ? "nmg" : true, ...(xhDau ? { xung_ho: xhDau } : {}), ...(chaoChau ? { nhom_tuoi: "lon_tuoi" } : {}) } });
      if (pErr) await ghiLoi(client, "chat-reply merge_buyer_prefs(hoi_vai)", pErr.message);
      return await hoanTat({
        reply: cauHoiVai, replies: [cauHoiVai], conversation_id: convId, hoi_vai: true,
      });
    }
  }
  if (prefs.hoi_vai) {
    // 22/09/2026: "cô" / "chú nha" trơ trọi là câu trả lời cho "cháu gọi chú hay cô" — ghi cách gọi, hỏi lại
    // vai (câu này không phải câu trả lời mua/bán), cờ hỏi vai giữ nguyên.
    const xhTro = batXungHo(text);
    if (xhTro && boDau(text).trim().split(/\s+/).length <= 3) {
      const { error: xtErr } = await client.rpc("merge_buyer_prefs", { p_buyer_id: buyer.id, p_delta: { xung_ho: xhTro, ...(XUNG_HO_LON_TUOI.has(xhTro) ? { nhom_tuoi: "lon_tuoi" } : {}) } });
      if (xtErr) await ghiLoi(client, "chat-reply merge_buyer_prefs(xung_ho tro)", xtErr.message);
      prefs.xung_ho = xhTro;
      const Xh = xhTro.charAt(0).toUpperCase() + xhTro.slice(1);
      const cauVai = doiTuXung([`Dạ ${xhTro}. ${Xh} cần rao bán bất động sản đúng không ạ?`], xhTro)[0];
      const { error: cvErr } = await client.from("messages").insert({ conversation_id: convId, sender: "bot", body: cauVai });
      if (cvErr) await ghiLoi(client, "chat-reply messages hoi_vai(lai)", cvErr.message);
      return await hoanTat({ reply: cauVai, replies: [cauVai], conversation_id: convId, hoi_vai: true, xung_ho: xhTro });
    }
    // 27/09/2026 (test Zalo): "Hay quá" sau câu chào "… cần rao bán bất động sản đúng không ạ?" → bot sang hỏi "mua hay thuê".
    // Câu chung chung không trả lời câu vai → hỏi lại câu chào MỘT lần (cờ `hoi_vai_lai`), lần sau mới về hàng người mua.
    if (laCauChungChung(text) && !prefs.hoi_vai_lai && !imageUrl) {
      const { error: lErr } = await client.rpc("merge_buyer_prefs", { p_buyer_id: buyer.id, p_delta: { hoi_vai_lai: true } });
      if (lErr) await ghiLoi(client, "chat-reply merge_buyer_prefs(hoi_vai_lai)", lErr.message);
      const xhL = typeof prefs.xung_ho === "string" && prefs.xung_ho ? prefs.xung_ho : null;
      const cauLai = boGachCheo(doiTuXung([`Dạ, ${xhL ?? "anh/chị"} cần rao bán bất động sản đúng không ạ?`], xhL)[0]);
      const { error: clErr } = await client.from("messages").insert({ conversation_id: convId, sender: "bot", body: cauLai });
      if (clErr) await ghiLoi(client, "chat-reply messages hoi_vai(chung chung)", clErr.message);
      return await hoanTat({ reply: cauLai, replies: [cauLai], conversation_id: convId, hoi_vai: true });
    }
    // Đã hỏi; câu này không tự nhận có BĐS (nửa 1/2 đã xét, không mở hồ sơ bán)
    // → ở lại hàng người mua, xoá cờ để không hỏi lại. Model đọc câu trả lời
    // qua lịch sử hội thoại (câu hỏi vai đã nằm trong `messages`).
    const { error: pErr } = await client
      .rpc("merge_buyer_prefs", { p_buyer_id: buyer.id, p_delta: { hoi_vai: null } });
    if (pErr) await ghiLoi(client, "chat-reply merge_buyer_prefs(xoa hoi_vai)", pErr.message);
    delete prefs.hoi_vai;
  }

  danhDau("mua_truoc_boc_gan");
  // 23/09/2026 (bắn 26 tin): bot vừa giới thiệu căn Trần Bình Trọng, khách hỏi tiếp "hẻm đó rộng bao nhiêu,
  // giá còn bớt không?" / "nhà hướng gì, có dính quy hoạch không" — KHÔNG nhắc mã → khối "căn khách nhắc"
  // rỗng: model chỉ có dòng KHO (không fact, không biết ảnh) nên nói "để em hỏi lại chủ về giá" dù fact
  // "có thương lượng" có sẵn, hứa "gửi hình liền" cho tin 0 ảnh, và bịa hướng. Câu hỏi tiếp về CĂN mà không
  // nhắc mã, không phải câu tìm mới (không có tiền) → căn quan tâm gần nhất (3 ngày, còn trên kệ) coi như
  // căn khách đang nhắc.
  if (!mentioned.length && !docTien(text) && HOI_TIEP_VE_CAN_RE.test(tKD)) {
    const { data: qt, error: qtErr } = await client.from("interests").select("listing_id, created_at")
      .eq("buyer_id", buyer.id).gte("created_at", new Date(Date.now() - 3 * 86400e3).toISOString())
      .order("created_at", { ascending: false }).limit(3);
    if (qtErr) await ghiLoi(client, "chat-reply can dang ban(interests)", qtErr.message);
    const ids = ((qt ?? []) as Array<{ listing_id: string }>).map((q) => q.listing_id);
    if (ids.length) {
      const { data: lq, error: lqErr } = await client.from("listings").select("id, code")
        .in("id", ids).in("status", ["dang_ban", "dang_quan_tam"]);
      if (lqErr) await ghiLoi(client, "chat-reply can dang ban(listings)", lqErr.message);
      const ma = ids.map((id) => ((lq ?? []) as Array<{ id: string; code: string | null }>).find((l) => l.id === id)?.code).find(Boolean);
      if (ma) mentioned.push(ma.toUpperCase());
    }
  }
  // Buyer quay lại nhắn → hủy nhắc-lời-hứa + follow-up đang chờ (FR-133/FR-32)
  await client.from("reminders").update({ status: "cancelled" })
    .eq("buyer_id", buyer.id).in("kind", ["promise", "followup"]).eq("status", "pending");

  // Đủ tiêu chí tối thiểu (khu vực + giá) thì mới lọc kho gợi ý; chưa đủ thì
  // bot được dặn "chưa gợi ý căn", nên nạp kho là ~250 chữ-máy không nhớ tạm +
  // một truy vấn thừa mỗi lượt đầu (FR-171 i). Khách nhắc mã căn thì vẫn nạp,
  // để gợi căn tương tự khi căn đó đã chốt/đã gỡ.
  // 11/09/2026: khách muốn ở GẦN một nơi — câu mới đè điều kiện cũ, không nhắc
  // thì dùng điều kiện đã lưu trong hồ sơ. Điều kiện này cũng là "khu vực":
  // "gần chợ Bình Tây, tầm 5 tỷ" là đủ để lọc kho.
  //
  // Hiểu NGHĨA trước (người dùng 11/09: "không phải là gần bệnh viện 1 câu mà nó
  // phải hiểu nghĩa"): câu có mùi vị trí thì một lượt model đọc ý — "tiện đi
  // khám bệnh", "chỗ làm ở Landmark 81", "quanh Ehome 3". Model trả lời được thì
  // tin model: nó phân biệt được "căn đó gần chợ không?" là câu HỎI, không phải
  // điều kiện tìm. Model hỏng thì regex. Toạ độ và số mét vẫn do SQL tính.
  let ganMoi: GanTienIch | null = null;
  let boGan = false;
  const hoiGan = coMuiViTri(text)
    ? (async (): Promise<{ ganMoi: GanTienIch | null; boGan: boolean }> => {
      try {
        const ai = await napModel(client);
        const r = await bocGanBangModel(
          ai as unknown as Parameters<typeof bocGanBangModel>[0], MODEL, text,
          typeof prefs.gan_tien_ich === "string" ? prefs.gan_tien_ich : null,
        );
        if (r) {
          await doTien(client, r.usage as Parameters<typeof doTien>[1]);
          if (r.ket) return { ganMoi: thanhGan(r.ket), boGan: r.ket.bo_dieu_kien };
        }
      } catch (e) {
        await ghiLoi(client, "chat-reply bocGanBangModel", e);
      }
      return { ganMoi: docGanTienIch(text), boGan: false };
    })()
    : null;
  // 14/09/2026 (đo thật): lượt model đọc "gần đâu" chạy TRƯỚC model chính và chặn
  // 2,7–3,1 s. Kết quả của nó chỉ đổi được lượt NÀY khi hồ sơ đã có giá (lúc đó
  // "gần X" + giá = đủ tiêu chí → lọc kho theo khoảng cách). Hồ sơ chưa có giá —
  // lượt đầu điển hình — thì chạy SONG SONG với model chính, lấy kết quả sau để
  // ghi hồ sơ; lượt sau lọc kho theo điều kiện đã lưu như cũ.
  // 23/09/2026 (bắn 26 tin): "anh cần mua nhà hẻm xe hơi Q5 tầm 8 tỷ, 3 phòng ngủ" — đủ tiêu chí NGAY TIN ĐẦU mà
  // kho chỉ lọc theo hồ sơ ĐÃ LƯU (lúc đó còn trống) → bot hứa "em lọc kho liền" rồi im, không hàng đợi nào gửi
  // sau. Nay lượt này lọc theo hồ sơ TẠM = hồ sơ đã lưu + thứ đọc tiền định từ chính câu khách (quận/phường/
  // tên đường, cụm giá, số phòng ngủ, mua/thuê). Hồ sơ lưu vẫn do lượt model ghi như cũ.
  const prefsLoc = hoSoTamTuCau(prefs, text, tKD);
  const ganTruocModel = prefsLoc.budget != null;
  if (hoiGan && ganTruocModel) ({ ganMoi, boGan } = await hoiGan);
  danhDau("mua_sau_boc_gan");
  const gan: GanTienIch | null = boGan && !ganMoi ? null : ganMoi ??
    (prefs.gan_tien_ich_loc && typeof prefs.gan_tien_ich_loc === "object"
      ? prefs.gan_tien_ich_loc as GanTienIch
      : null);
  const minimumMet = (prefsLoc.area != null || gan != null) && prefsLoc.budget != null;
  // FR-216: tìm theo nghĩa sẵn sàng? (công tắc bật + có khoá + nhung-tick KHÔNG đang tạm dừng vì Gemini từ chối —
  // 20260923h) — chỉ hỏi khi kho được lọc thật (đủ tiêu chí), song song tới lúc dựng truy vấn.
  const timNghiaP = minimumMet
    ? (async () => {
      const { data, error } = await client.rpc("tim_nghia_san_sang");
      if (error) await ghiLoi(client, "chat-reply tim_nghia_san_sang", error.message);
      return data === true;
    })().catch(() => false)
    : Promise.resolve(false);
  // 14/09/2026 (bắn 16 hội thoại mua): "tìm nhà quận 5 tầm 6 tỷ" → bot vẫn dò "để ở hay
  // đầu tư?" (5/9 hội thoại). `minimumMet` đọc hồ sơ ĐẦU lượt — lúc đó còn trống — nên câu
  // lệnh bảo model "CÒN THIẾU, hỏi theo thứ tự" dù khách vừa nói đủ khu vực + giá. Câu
  // dặn ngừng dò hồ sơ đọc thêm chính câu khách (luật tiền + bóc quận, tiền định). Kho
  // vẫn lọc theo hồ sơ đã lưu như cũ.
  const duTieuChiDeNgungDo = minimumMet ||
    ((prefs.area != null || gan != null || !!bocQuan(tKD, text) || /\b(?:phuong|p)\s*\d{1,2}\b/.test(tKD)) &&
      (prefs.budget != null || docTien(text) != null));
  // 13/09/2026: cách gọi KHÁCH MUA. Nhánh người bán có `sellers.xung_ho` từ 07/09,
  // nhánh mua thì không — model tự đoán: "có căn nào quận 10 tầm 5 tỷ không em"
  // → "Anh tìm để ở…". Lời dặn ("kêu chị nha") thắng; khách tự xưng ("chị đang
  // tìm mua") thì nhận khi chưa biết. Lưu trong hồ sơ, không thêm cột.
  const xhMuaMoi = batXungHo(text) ?? tuXungTuCau(text);
  const goiMua = (xhMuaMoi ?? prefs.xung_ho ?? null) as XungHo | null;
  // Kho lọc theo hồ sơ: mua/thuê, phường (nếu bắt được), số PN, cận trên giá (SRS-5.2)
  // Cột dùng chung cho mọi dòng "căn" đưa vào prompt (KHO, căn khách nhắc, căn
  // tương tự, căn trong dự án): thông số FR-172 + dự án/tình trạng căn FR-116.
  const CAN_COLS =
    `code, seller_id, ward, district, deal, location_raw, price_raw, price_vnd, area_m2, bedrooms, property_type, ${SPEC_COLS}, project_id, unit_code, unit_status, last_confirmed_at, tien_ich_gan, nhan, boc_tach, description, projects(name)`;
  const timNghia = await timNghiaP;
  let khoQ = client
    .from("listings")
    .select(CAN_COLS) // FR-172 + FR-116
    .eq("deal", dealCol(prefsLoc.deal))
    .in("status", ["dang_ban", "dang_quan_tam"]) // FR-139: chỉ gợi ý tin đang lên kệ
    .not("price_raw", "is", null).neq("price_raw", "")
    // FR-188 (10/09): căn chủ CẦN BÁN GẤP lên đầu khi ghép khách, rồi mới tới mới nhất.
    .order("gap", { ascending: false, nullsFirst: false })
    // FR-216: bật tìm theo nghĩa thì lấy rộng 30 căn đã lọc cứng rồi xếp lại theo nghĩa, cắt còn 6.
    .order("created_at", { ascending: false }).limit(timNghia ? 30 : 6);
  const hemLoc = locLoaiHem(prefsLoc.alley);
  if (hemLoc) khoQ = khoQ.or(hemLoc);
  const wardNum = typeof prefsLoc.area === "string" ? soPhuong(boDau(prefsLoc.area)) : null;
  // Khớp ĐÚNG số phường (ilike không wildcard = so khớp nguyên chuỗi,
  // không phân biệt hoa thường) — '%1%' cũ khiến P1 dính cả P10-P16
  if (wardNum) khoQ = khoQ.ilike("ward", `Phường ${wardNum}`);
  // 30/09/2026 (bắn thử mua lx-mua-c1): "căn hộ quận 7 dưới 3 tỷ" từng ra nhà phố Quận 5 — kho chỉ lọc SỐ PHƯỜNG, không lọc
  // quận, không lọc loại. Khu vực nói MỘT quận (không "hoặc / và / ,") thì lọc quận; loại nói chắc thì lọc loại.
  const quanKho = !wardNum && typeof prefsLoc.area === "string" && !/\b(?:hoac|hay|va|voi)\b|[,/&]/.test(boDau(prefsLoc.area))
    ? bocQuan(boDau(prefsLoc.area), prefsLoc.area) : null;
  // Tin chưa ghi quận / loại (null, "chua_ro") vẫn giữ — lọc để BỎ căn chắc chắn sai, không để giấu căn thiếu dữ liệu.
  if (quanKho) khoQ = khoQ.or(`district.eq.${quanKho},district.is.null`);
  const loaiKho = loaiKhoTuHoSo(prefsLoc.property_type);
  const orLoai = loaiKho ? [...loaiKho, "chua_ro"].map((t) => `property_type.eq.${t}`).concat("property_type.is.null").join(",") : null;
  if (orLoai) khoQ = khoQ.or(orLoai);
  if (typeof prefsLoc.bedrooms === "number") khoQ = khoQ.gte("bedrooms", prefsLoc.bedrooms);
  if (nhanLoc.length) khoQ = khoQ.contains("nhan", nhanLoc);
  const budgetR = budgetRangeVnd(prefsLoc.budget);
  if (budgetR?.max) khoQ = khoQ.lte("price_vnd", budgetR.max);
  if (budgetR?.min) khoQ = khoQ.gte("price_vnd", budgetR.min);
  // 11/09: lọc theo khoảng cách thật (`timTinGanMoc` → `tin_gan_moc`, migration
  // 20260911g): mốc là tiện ích OSM, dự án có toạ độ, hoặc địa danh tra được.
  // RPC hỏng thì bỏ điều kiện này và ghi sổ — đừng để kho trống vì lỗi phía
  // mình. Không định vị được nơi khách nói thì cũng không lọc, bot hỏi lại.
  let ganKq: TinGan[] | null = null;
  let khongThayMoc = false;
  if (gan && minimumMet) {
    const kq = await timTinGanMoc(client as unknown as Parameters<typeof timTinGanMoc>[0], gan, dealCol(prefs.deal));
    if (kq.loi) {
      await ghiLoi(client, "chat-reply tin_gan_moc", kq.loi);
    } else if (kq.khongThayMoc) {
      khongThayMoc = true;
    } else {
      ganKq = kq.tin;
      khoQ = khoQ.in("code", ganKq.length ? ganKq.map((g) => g.code) : ["-"]);
    }
  }
  const ganTheoMa = new Map((ganKq ?? []).map((g) => [g.code, g]));

  // FR-65 (v48): khách chấm sao → chỉ khi vừa được hỏi cảm nhận (nhắc
  // `feedback` đã `sent` trong 48 giờ) mới là đánh giá buổi xem; tra căn từ
  // chính dòng nhắc đó. Regex khớp mới tốn truy vấn.
  const saoM = SAO_RE_KD.exec(tKD);
  const saoKhach = saoM ? Number(saoM[1] ?? saoM[2]) : null;
  const [
    { data: khoTho }, { data: partnerProj }, { data: matchedProjGoc }, { data: askedListings },
    { data: askedPhotos }, giaTB, { data: nhacFeedback },
  ] = await Promise.all([
    minimumMet || mentioned.length ? khoQ : Promise.resolve({ data: [] as never[] }),
    // FR-132: dự án nhà mình phân phối trực tiếp — luôn đứng đầu khối dự án
    client.from("projects")
      .select("name, developer, district, ward, location_raw, legal_status, status_text, amenities, specs, unit_types")
      .eq("is_partner", true).order("priority").limit(1),
    // Khách nhắc tên dự án nào trong kho (mogi/aond) thì nạp kiến thức dự án đó
    client.rpc("match_projects", { p_text: text }).select(COT_DU_AN),
    // Căn khách đang nhắc tới — kèm facts đã xác minh từ chủ nhà (FR-29).
    // Soát 01/09 (vai người mua đã nhắm căn): bản cũ KHÔNG lọc trạng thái, mà
    // mã tin là dãy đếm BDS-Q5-#### đoán được — gõ một mã bất kỳ là bot đọc ra
    // địa chỉ, giá, diện tích, fact đã xác minh và URL ảnh của tin CHƯA ĐĂNG
    // (`cho_thong_tin`) lẫn tin chủ nhà ĐÃ GỠ (`an`). Web đã chặn đúng những
    // tin này với người lạ từ FR-167c; bot phải cùng ranh giới. Tin chưa đăng
    // thì không ai có thể biết mã hợp lệ → coi như không có. Tin đã gỡ vẫn nạp
    // nhưng CHỈ mã + trạng thái (khối askedBlock cắt chi tiết), để bot nói
    // thật "căn đó đã gỡ" thay vì "em không thấy mã này".
    mentioned.length
      ? client.from("listings")
        .select(`status, ${CAN_COLS}, listing_facts(question, answer)`) // FR-172 + FR-116
        .in("code", mentioned)
        .in("status", ["dang_ban", "dang_quan_tam", "da_chot", "an"])
        .limit(3)
      : Promise.resolve({ data: [] as never[] }),
    // FR-148: kho ảnh thật up theo MÃ tin (bucket listing-photos/<mã>/…)
    mentioned.length
      ? client.from("listing_photos_v").select("code, url").in("code", mentioned).limit(24)
      : Promise.resolve({ data: [] as never[] }),
    // FR-99: giá TB phường — chỉ khi đã đủ hồ sơ để lọc kho và biết số phường
    minimumMet && wardNum
      ? giaTBPhuong(client, dealCol(prefs.deal), wardNum)
      : Promise.resolve(""),
    // FR-65: nhắc `feedback` gần nhất đã gửi cho khách này trong 48h
    saoKhach
      ? client.from("reminders").select("id, listing_id")
        .eq("buyer_id", buyer.id).eq("kind", "feedback").eq("status", "sent")
        .gte("sent_at", new Date(Date.now() - 48 * 3600e3).toISOString())
        .order("sent_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null as { id: string; listing_id: string | null } | null }),
  ]);
  let matchedProj: unknown[] | null = matchedProjGoc as unknown[] | null;
  // FR-216: xếp kho theo NGHĨA câu khách (vector Gemini ↔ `listings.nhung`) TRONG nhóm đã lọc cứng. Hỏng bất
  // cứ bước nào → giữ thứ tự cũ (gấp trước, mới trước), ghi sổ. Căn chưa có vector xếp sau căn có.
  let listings = khoTho;
  if (timNghia && (khoTho ?? []).length > 1) {
    try {
      const khoa = await khoaGemini(client);
      if (!khoa.length) throw new Error("thiếu GEMINI_API_KEY");
      // 24/09/2026: câu vừa nhắn thường cụt ("phòng cho ba mẹ riêng, có căn nào không") — ghép NHU CẦU ĐÃ LƯU (notes)
      // để vector mang đủ ý "phòng ngủ trệt, khỏi leo cầu thang" khách nói từ lượt trước.
      const cauTim = [text, typeof prefs.notes === "string" && prefs.notes.trim() ? prefs.notes.slice(0, 500) : null,
        typeof prefs.alley === "string" ? prefs.alley : null, nhanLoc.length ? tenNhan(nhanLoc) : null]
        .filter(Boolean).join(". ");
      const vec = await nhungCauTim(khoa, cauTim);
      const codes = (khoTho ?? []).map((l) => (l as { code: string }).code);
      const { data: hang, error: hangErr } = await client.rpc("tim_tin_theo_nghia", { p_vec: vec, p_codes: codes, p_limit: codes.length });
      if (hangErr) throw new Error(hangErr.message);
      listings = xepTheoNghia(khoTho ?? [], ((hang ?? []) as Array<{ code: string }>).map((h) => h.code));
    } catch (e) {
      await ghiLoi(client, "chat-reply tim_tin_theo_nghia", e);
    }
  }
  // SRD §IV.3 (05/10/2026, SRS-5.1zzf): khách MUA đã nét (đủ khu vực + ngân sách) → tin của người bán hạng VÀNG (cả chính chủ lẫn
  // môi giới — chủ dự án chốt 06/10, SRS-5.1zzx) lên đầu kho, thứ tự
  // còn lại giữ nguyên (gấp → nghĩa → mới). Hạng đọc một lượt cho cả nhóm người bán (`hang_cua_nguoi_ban`); RPC hỏng → giữ thứ tự, ghi sổ.
  if (minimumMet && (listings ?? []).length > 1) {
    const idsNb = [...new Set((listings ?? []).map((l) => (l as { seller_id?: string | null }).seller_id).filter((x): x is string => !!x))];
    if (idsNb.length) {
      const { data: hangNb, error: hnErr } = await client.rpc("hang_cua_nguoi_ban", { p_ids: idsNb });
      if (hnErr) await ghiLoi(client, "chat-reply hang_cua_nguoi_ban", hnErr.message);
      const vang = new Set(((hangNb ?? []) as Array<{ seller_id: string; hang: string }>).filter((h) => h.hang === "vang").map((h) => h.seller_id));
      if (vang.size) {
        const laVang = (l: unknown) => vang.has((l as { seller_id?: string | null }).seller_id ?? "") ? 0 : 1;
        listings = [...(listings ?? [])].sort((a, b) => laVang(a) - laVang(b));
      }
    }
  }
  listings = (listings ?? []).slice(0, 6);
  const danhGia = saoKhach && nhacFeedback?.listing_id
    ? { listing_id: nhacFeedback.listing_id as string, stars: saoKhach }
    : null;
  const ordered = history.slice().reverse();
  // Tin KHÁCH cắt 400 ký tự (FR-171 i): khách dán nguyên bài rao dài là mỗi lượt
  // sau gánh thêm cả nghìn chữ-máy không nhớ tạm suốt 12 tin. Tin bot đã bị
  // luật 30-90 từ khống chế.
  // Bong bóng 💾 (báo lại hồ sơ đã lưu) là bảng số liệu, không phải lời em nói —
  // bỏ khỏi lịch sử, không thì model bắt chước in bảng (như nhánh người bán).
  const convo = ordered
    .filter((m) => !(m.sender === "bot" && m.body.startsWith(DAU_BAO_LAI)))
    .map((m) =>
      `${laTinNguoi(m.sender) ? "KHÁCH" : m.sender === "human" ? "EM (người thật bên mình nhắn tay)" : "EM"}: ${
        laTinNguoi(m.sender) ? m.body.slice(0, 400) : m.body
      }`)
    .join("\n");
  // FR-172: kèm thông số có cấu trúc (ngang×dài, kết cấu, WC, đường vào, pháp
  // lý) — trước đây "hẻm xe hơi", "sổ hồng riêng" nằm trong mô tả mà KHO không
  // nạp mô tả, nên bot trả lời "để em hỏi lại chủ nhà" cho thứ tin rao đã ghi.
  // MỘT hàm viết dòng căn cho KHO / căn tương tự / căn trong dự án — địa chỉ
  // qua `locLienHe` (FR-105), thông số (FR-172), dự án + tình trạng căn (FR-116).
  type CanRow = SpecRow & DuAnRow & {
    code: string; ward?: string | null; district?: string | null; deal?: string | null;
    location_raw?: string | null; price_raw?: string | null; price_vnd?: number | null;
    area_m2?: number | null; bedrooms?: number | null; property_type?: string | null;
    tien_ich_gan?: Array<{ loai: string; ten: string; m: number }> | null;
    nhan?: string[] | null; boc_tach?: Record<string, unknown> | null; description?: string | null;
  };
  // 11/09: khoảng cách là đường chim bay từ CON ĐƯỜNG của căn (toạ độ không tới
  // số nhà) — làm tròn để model không đọc ra con số giả chính xác.
  const lamTronM = (m: number) =>
    m >= 1000 ? `${String(Math.round(m / 100) / 10).replace(".", ",")} km` : `${Math.max(50, Math.round(m / 50) * 50)} m`;
  const ganTxt = (l: CanRow) => {
    const g = ganTheoMa.get(l.code);
    return g ? ` · cách ${g.moc} khoảng ${lamTronM(g.khoang_cach_m)}` : "";
  };
  // 22/09/2026 (bắn thật sau deploy #181): dòng kho không mang tiện ích chủ nhà nói ("gần chợ Hoà Bình")
  // lẫn nhãn, khách hỏi "gần chợ không" → model tự đặt tên "chợ Hàng Thịt". Đưa fact tiện ích (qua
  // `boc_tach`, trigger fact→boc_tach) và nhãn tìm kiếm vào dòng kho để model có chữ thật mà dùng.
  const tienIchNgan = (l: CanRow) => {
    const ti = l.boc_tach?.tien_ich_gan;
    const a = typeof ti === "string" && ti.trim() ? ` · ${locLienHe(ti.trim(), true).slice(0, 80)}` : "";
    const b = l.nhan?.length ? ` · ${tenNhan(l.nhan)}` : "";
    return a + b;
  };
  // 24/09/2026 (chủ dự án test vai mua): dòng kho chỉ có thông số → model tự bịa "phòng trệt rộng 14m2", "trệt để ba
  // mẹ" cho căn mà chủ nói trệt là xưởng may. Kèm LỜI CHỦ TẢ (câu rao gốc, che SĐT + số nhà, ~200 chữ) để bot nói
  // đúng điều người bán nói; luật "không ghi thì hỏi lại chủ" nằm ở đầu khối KHO.
  const chuTa = (l: CanRow) => {
    const mt = locLienHe(boHoaHong((l.description ?? "").replace(/\s+/g, " ")), true);
    if (mt.length < 20) return "";
    return ` · chủ tả: "${mt.length > 200 ? mt.slice(0, 199).replace(/\s+\S*$/, "") + "…" : mt}"`;
  };
  const dongKho = (l: CanRow) =>
    `#${l.code} · ${locLienHe(l.location_raw ?? "")} ${l.ward ?? ""} · ${l.price_raw ? donViGiaDep(l.price_raw) : "giá đang cập nhật"} · ${l.area_m2 ?? "?"}m2${l.bedrooms ? ` · ${l.bedrooms}PN` : ""}${thongSoNgan(l)}${duAnNgan(l)}${ganTxt(l)}${tienIchNgan(l)}${chuTa(l)}`;
  const kho = ((listings ?? []) as CanRow[]).map(dongKho).join("\n");

  // Khối "căn khách đang nhắc" (FR-29): đủ chi tiết + facts đã xác minh + trạng
  // thái (`STATUS_VI` ở tầng module).
  type Asked = CanRow & {
    status?: string | null;
    listing_facts?: Array<{ question: string; answer: string }> | null;
  };
  // FR-143/148: hình sẵn có của một căn = ảnh up theo mã (bucket listing-photos)
  // + URL chính chủ gửi qua chat (facts hinh_anh). Ảnh kho đứng trước.
  const photoByCode: Record<string, string[]> = {};
  for (const p of (askedPhotos ?? []) as Array<{ code: string; url: string }>) {
    (photoByCode[p.code] ??= []).push(p.url);
  }
  const photosOf = (l: Asked): string[] =>
    l.status === "an" ? [] : [
      ...(photoByCode[l.code] ?? []),
      ...(l.listing_facts ?? [])
        .filter((f) => f.question === "hinh_anh")
        .flatMap((f) => f.answer.match(PHOTO_URL_RE) ?? []),
    ];
  const dongCanNhac = (l: Asked): string => {
      // Tin chủ nhà đã gỡ: chỉ nói trạng thái, KHÔNG lộ địa chỉ/giá/ảnh.
      if (l.status === "an") {
        return `#${l.code} · ${STATUS_VI.an} - KHÔNG nêu địa chỉ hay giá của căn này, báo thật là chủ nhà đã gỡ rồi gợi ý căn tương tự trong KHO`;
      }
      // Fact cắt 300 ký tự (FR-171 i): mỗi căn khách nhắc là một khối không nhớ
      // tạm; chủ nhà kể dài thì phần đầu (giá, pháp lý, diện tích) là phần đáng.
      // FR-105: fact chủ nhà kể có thể chứa SĐT/Zalo/số nhà → lọc trước khi
      // đưa model đọc (model không được biết thì không thể lỡ miệng).
      const facts = (l.listing_facts ?? [])
        .filter((f) => f.question !== "hinh_anh")
        .map((f) => `${f.question}: ${locLienHe(f.answer, true)}`).join("; ").slice(0, 300);
      const nPhotos = photosOf(l).length;
      // 11/09: tiện ích gần nhất mỗi loại (geocode-listings nạp từ OSM) — khách
      // hỏi "gần chợ không" thì trả lời được, kèm chữ "khoảng".
      const quanh = (l.tien_ich_gan ?? []).slice(0, 4)
        .map((x) => `${x.ten} ~${lamTronM(x.m)}`).join("; ");
      return `${dongKho(l)}${l.status ? ` · trạng thái: ${STATUS_VI[l.status] ?? l.status}` : ""}${facts ? ` · đã xác minh từ chủ nhà: ${facts}` : ""}${quanh ? ` · quanh căn (đường chim bay, ước tính): ${quanh}` : ""}${nPhotos ? ` · CÓ ${nPhotos} HÌNH SẴN (khách xin hình thì điền send_photos, hệ thống tự đính kèm tối đa 4 tấm/lượt và tự hỏi xem thêm - ĐỪNG hứa đi hỏi chủ nhà)` : " · chưa có hình sẵn"}`;
  };
  const askedBlock = ((askedListings ?? []) as Asked[]).map(dongCanNhac).join("\n");

  // Khối DỰ ÁN (FR-113…115/FR-132): kiến thức chung đã xác thực, bot trả lời
  // tầng dự án trực tiếp; Ny'ah (is_partner) luôn ở trên cùng.
  type Proj = {
    name: string; developer?: string | null; district?: string | null;
    location_raw?: string | null; legal_status?: string | null; status_text?: string | null;
    amenities?: unknown; specs?: unknown; unit_types?: unknown; description?: string | null;
  };
  const projLine = (p: Proj, full: boolean) => {
    const parts = [`${p.name} - CĐT ${p.developer ?? "?"} · ${p.location_raw ?? p.district ?? ""}`];
    if (p.legal_status) parts.push(`pháp lý: ${p.legal_status}`);
    if (p.status_text) parts.push(`tình trạng: ${p.status_text}`);
    const tienIch = tienIchDuAnSach(p.amenities);
    if (tienIch.length) parts.push(`tiện ích: ${tienIch.join(", ")}`);
    if (full && p.specs) parts.push(`thông số: ${JSON.stringify(p.specs)}`);
    if (full && p.unit_types) parts.push(`mẫu nhà/căn: ${JSON.stringify(p.unit_types)}`);
    if (!full && p.description) parts.push(String(p.description).slice(0, 280));
    return "• " + parts.join(" · ");
  };
  const partner = (partnerProj ?? [])[0] as Proj | undefined;
  // Tối đa 2 dự án khách nhắc (FR-171 i): mỗi dự án đủ thông số + mẫu căn là
  // ~1.350 ký tự không nhớ tạm; khách nhắc 3-4 tên một câu là hiếm và model
  // vẫn trả lời được từ hai dự án đầu.
  // 30/09/2026: khách mua gõ sai tên dự án ("sunrise siti") → khớp chữ không ra thì tìm theo nghĩa, máy xác nhận tên.
  if (!(matchedProj ?? []).length) {
    const dn = await timDuAnTheoNghia(client, tenDuAnTrongCau(text) ?? tenSauCanHo(text));
    if (dn) {
      const { data: pd, error: pdErr } = await client.from("projects").select(COT_DU_AN).eq("id", dn.id).limit(1);
      if (pdErr) await ghiLoi(client, "chat-reply doc du an (mua, theo nghia)", pdErr.message);
      else if (pd?.length) matchedProj = pd;
    }
  }
  // SRS-5.1zzzzzq (Zalo thật 13/10/2026): "Bên bạn có căn hộ Hà Đô Centrosa không?" → "Căn 3 phòng ngủ giá tầm bao nhiêu?" — câu sau
  // không có tên dự án nên khối DỰ ÁN trống, model bịa "5-6 tỷ". Dự án khách đang hỏi là NGỮ CẢNH của hội thoại: nhớ tên vào hồ sơ
  // (`preferences.du_an_nhac`, ghi ở `delta` dưới), lượt sau không gọi tên thì nạp lại dự án đó.
  const duAnNhacCu = typeof prefs.du_an_nhac === "string" && prefs.du_an_nhac.trim() ? prefs.du_an_nhac.trim() : null;
  if (!(matchedProj ?? []).length && duAnNhacCu) {
    const { data: pc, error: pcErr } = await client.rpc("match_projects", { p_text: duAnNhacCu }).select(COT_DU_AN);
    if (pcErr) await ghiLoi(client, "chat-reply match_projects(du an nhac)", pcErr.message);
    else if (Array.isArray(pc) && pc.length) matchedProj = pc as unknown[];
  }
  // Kho dự án có dòng TRÙNG (mogi nạp hai lần: "HaDo Centrosa Garden" / "Hà Đô Centrosa Garden") → gộp theo tên bỏ dấu bỏ cách,
  // giữ dòng nhiều thông tin hơn; ô tiện ích của mogi có khi là tiêu đề bài viết ("- Chủ đầu tư dự án này có uy tín hay không?") → bỏ.
  const matched = gopDuAnTrung((matchedProj ?? []) as Proj[])
    .filter((m) => m.name !== partner?.name).slice(0, 2);
  const duAnNhacMoi = matched[0]?.name ?? null;
  // Dự án nhà mình đứng RIÊNG khỏi khối kho: nó giống hệt nhau cho mọi khách và
  // gần như không đổi, nên chỗ của nó là trong phần được nhớ tạm (rẻ 1/10), chứ
  // không phải nằm chung với khối kho biến động theo từng hồ sơ. Riêng thông số
  // + mẫu căn đã là 1.350 ký tự, gửi đủ giá mỗi lượt cho cả khách chưa hỏi tới
  // dự án là phí. Xem bot/README §01/09.
  const duanNhaMinh = partner ? projLine(partner, true) : "";
  // Dự án khách vừa nhắc tên thì mới nạp — biến động, phải nằm sau điểm nhớ tạm.
  const duanBlock = matched.map((m) => projLine(m, true)).join("\n");

  // ─── FR-116 (v48): "căn X dự án Y còn không" → đọc `unit_status` của tin
  // thuộc dự án khách nhắc. Chỉ tốn một truy vấn khi `match_projects` có kết
  // quả (kể cả dự án nhà mình); có mã căn thì lọc đúng căn, không thì liệt kê
  // tối đa 5 căn của dự án. Tình trạng + TTL 7 ngày viết bởi `duAnNgan`.
  const maCanHoi = MA_CAN_RE.exec(text)?.[1]?.toUpperCase() ?? null;
  const duAnIds = ((matchedProj ?? []) as Array<{ id?: string }>)
    .map((m) => m.id).filter((x): x is string => !!x);
  let canDuAn: CanRow[] = [];
  if (duAnIds.length) {
    let uq = client.from("listings").select(CAN_COLS)
      .in("project_id", duAnIds).in("status", ["dang_ban", "dang_quan_tam", "da_chot"])
      .order("created_at", { ascending: false }).limit(5);
    if (maCanHoi) uq = uq.ilike("unit_code", maCanHoi);
    const { data: cd, error: cdErr } = await uq;
    if (cdErr) await ghiLoi(client, "chat-reply can du an", cdErr.message);
    canDuAn = (cd ?? []) as CanRow[];
  }
  const canDuAnBlock = duAnIds.length
    ? (canDuAn.length
      ? canDuAn.map(dongKho).join("\n")
      : maCanHoi
      ? `căn ${maCanHoi}: KHÔNG có trong kho - nói thật là em chưa có căn này, để em hỏi bộ phận dự án rồi báo lại`
      : "")
    : "";

  // ─── FR-114 (e) (22/09/2026, Zalo thật): "quận 5 có dự án gì không em" → bot chỉ biết dự án khi
  // khách GỌI TÊN (`match_projects`) hoặc dự án nhà mình (Quận 8), nên kể Ny'ah Phú Định cho khách
  // hỏi Quận 5 rồi "chưa có căn nào" — trong khi `projects` có 17 dự án Quận 5 đủ địa chỉ. Nay: khách
  // hỏi tới dự án / chung cư / căn hộ, hoặc kho tin trống mà đã đủ tiêu chí, thì nạp tối đa 5 dự án
  // CÙNG QUẬN khách tìm làm kiến thức tham khảo — không phải căn đang bán, model phải nói rõ thế.
  const quanKhach = bocQuan(tKD, text) ??
    (typeof prefs.area === "string" ? bocQuan(boDau(prefs.area), prefs.area) : null);
  const hoiDuAnKhu = /\b(?:du an|chung cu|can ho|cao oc|toa nha|khu dan cu|kdc)\b/.test(tKD);
  let duAnKhuBlock = "";
  // Kho tin có căn nào thuộc các dự án vừa nạp không — không có thì câu "chưa có căn nào đang rao" là thật.
  let coCanTrongDuAnKhu = false;
  if (quanKhach && (hoiDuAnKhu || (minimumMet && !(listings ?? []).length))) {
    const { data: dak, error: dakErr } = await client.from("projects")
      .select("id, name, developer, district, ward, location_raw, legal_status, status_text, amenities, unit_types")
      .eq("district", quanKhach).order("priority").limit(6);
    if (dakErr) await ghiLoi(client, "chat-reply du an trong khu", dakErr.message);
    const ds = ((dak ?? []) as Array<Proj & { id?: string }>).filter((p) => p.name !== partner?.name && !matched.some((m) => m.name === p.name)).slice(0, 5);
    duAnKhuBlock = ds.map((p) => projLine(p, false)).join("\n");
    const ids = new Set(ds.map((p) => p.id).filter(Boolean));
    coCanTrongDuAnKhu = ((listings ?? []) as CanRow[]).some((l) => l.project_id && ids.has(l.project_id));
  }

  // ─── FR-31 (v48): CĂN TƯƠNG TỰ khi căn khách hỏi đã chốt/đã gỡ, hoặc khách
  // hỏi "còn căn nào giống giống vầy không". Căn gốc = căn khách nhắc; không
  // có thì căn bot vừa nói tới gần nhất trong lịch sử (một truy vấn tra mã).
  // Cùng phường trước (≥3 thì đủ), thiếu thì mở ra cùng quận; giá 0,7×–1,3×
  // căn gốc, cùng deal; xếp: cùng phường > cùng đường vào > cùng loại nhà;
  // lấy 3. Không còn công thức trọng số SRS-5.2 giấy — thay bằng luật này.
  const askedArr = (askedListings ?? []) as Asked[];
  const muonTuongTu = GIONG_RE_KD.test(tKD);
  let canGoc: CanRow | null = askedArr.find((l) => l.status === "da_chot" || l.status === "an") ??
    (muonTuongTu ? askedArr[0] ?? null : null);
  if (!canGoc && muonTuongTu) {
    const maBotNoi = [...ordered].reverse()
      .filter((m) => m.sender === "bot")
      .flatMap((m) => [...m.body.matchAll(CODE_RE)].map((x) => x[1].toUpperCase()))[0];
    if (maBotNoi) {
      const { data: g } = await client.from("listings").select(CAN_COLS)
        .eq("code", maBotNoi).maybeSingle();
      canGoc = (g as CanRow | null) ?? null;
    } else {
      // 23/09/2026: bot không còn viết mã cho khách (FR-178 a) → căn vừa gợi là căn khách quan tâm gần nhất (FR-108).
      const { data: qt, error: qtErr } = await client.from("interests").select("listing_id")
        .eq("buyer_id", buyer.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (qtErr) await ghiLoi(client, "chat-reply can tuong tu (interests)", qtErr.message);
      if (qt?.listing_id) {
        const { data: g } = await client.from("listings").select(CAN_COLS).eq("id", qt.listing_id).maybeSingle();
        canGoc = (g as CanRow | null) ?? null;
      }
    }
  }
  let tuongTu: CanRow[] = [];
  if (canGoc) {
    const timGiong = async (theo: "ward" | "district") => {
      const gia = Number(canGoc!.price_vnd);
      let q = client.from("listings").select(CAN_COLS)
        .eq("deal", canGoc!.deal ?? "ban").in("status", ["dang_ban", "dang_quan_tam"])
        .neq("code", canGoc!.code).not("price_raw", "is", null)
        .order("created_at", { ascending: false }).limit(6);
      q = theo === "ward" ? q.eq("ward", canGoc!.ward) : q.eq("district", canGoc!.district);
      if (gia > 0) q = q.gte("price_vnd", Math.round(gia * 0.7)).lte("price_vnd", Math.round(gia * 1.3));
      const { data: r, error: rErr } = await q;
      if (rErr) await ghiLoi(client, `chat-reply can tuong tu(${theo})`, rErr.message);
      return (r ?? []) as CanRow[];
    };
    const ung: CanRow[] = canGoc.ward ? await timGiong("ward") : [];
    if (ung.length < 3 && canGoc.district) {
      const them = await timGiong("district");
      for (const t of them) if (!ung.some((u) => u.code === t.code)) ung.push(t);
    }
    const diem = (l: CanRow) =>
      (l.ward && l.ward === canGoc!.ward ? 4 : 0) +
      (l.access_type && l.access_type === canGoc!.access_type ? 2 : 0) +
      (l.property_type && l.property_type === canGoc!.property_type ? 1 : 0);
    tuongTu = ung.sort((a, b) => diem(b) - diem(a)).slice(0, 3);
  }
  const tuongTuBlock = tuongTu.map(dongKho).join("\n");

  // Chống hỏi cung: 2 tin gần nhất của bot đều là câu hỏi → lượt này đưa giá trị
  const botMsgs = ordered.filter((m) => m.sender === "bot");
  const interrogated = botMsgs.length >= 2 &&
    botMsgs.slice(-2).every((m) => m.body.trimEnd().endsWith("?"));
  // FR-228: câu tư vấn kế (bộ 7 câu của chủ dự án) — câu 5 đổi theo người ở cùng và theo dự án Ny'ah Phú Định.
  // SRS-5.1zzzzzq: khách đang HỎI về một dự án (có khối dự án + câu hỏi) → lượt này trả lời dự án, câu tư vấn để lượt sau; câu lệnh đã dặn
  // "khách đang hỏi việc khác thì để câu này lượt sau" mà model vẫn chen ("Anh chị muốn mình sống ở một khu như thế nào ạ?" thay câu trả lời).
  const dangHoiDuAn = matched.length > 0 && /\?|\b(?:bao nhieu|la gi|co gi|the nao|khong|ko|hong|khong a|xin thong tin|cho .*thong tin)\b/.test(tKD);
  const tuVanKe = dangHoiDuAn ? null : cauTuVanKe(prefs, laHoiNyah(matched.map((m) => m.name ?? ""), text));

  // Hồ sơ ĐÃ BIẾT / CÒN THIẾU theo thứ tự ưu tiên UF-04
  const known = [
    ...BUYER_PROFILE_FIELDS
      .filter(([k]) => prefs[k] != null && prefs[k] !== "")
      .map(([k, label]) => `- ${label}: ${prefs[k]}`),
    // 11/09: "gần tiện ích" KHÔNG nằm trong danh sách hỏi (đừng hỏi khách nào
    // cũng "cần gần gì không") — chỉ nhắc khi khách đã tự nói.
    ...(gan ? [`- muốn ở gần: ${nhanGan(gan)}`] : []),
    // SRS-5.1zzzzb: số tầng khách muốn — KHÔNG nằm trong danh sách hỏi dò (không hỏi ai cũng "mấy lầu"), chỉ nhắc khi khách đã nói.
    ...(prefs.so_tang != null && prefs.so_tang !== "" ? [`- số tầng mong muốn: ${prefs.so_tang}`] : []),
  ].join("\n");
  const missing = BUYER_PROFILE_FIELDS
    .filter(([k]) => prefs[k] == null || prefs[k] === "")
    .map(([, label]) => `- ${label}`).join("\n");
  // (`minimumMet` tính ở trên, trước khi quyết định có lọc kho không.)

  type LuotMua = {
      profile: Record<string, unknown>; replies: string[];
      promise?: { when: string; what: string } | null;
      viewing?: { listing_code: string | null; when: string; phone: string | null } | null;
      ask_owner?: { listing_code: string | null; question: string } | null;
      agreed_deal?: { listing_code: string | null } | null;
      send_photos?: string | null;
      xin_hinh?: string | null;
      hoi_tien_ich?: { loai: string; khu_vuc: string | null } | null;
      need_human?: boolean;
      voice_request?: boolean;
  };
  // Tên kiểu riêng: `as typeof out` ở dưới bị TS thu hẹp thành `null` theo luồng
  // (out vừa gán null), nên ép kiểu thành "chuyển sang null" — lỗi TS2352.
  let out: LuotMua | null = null;
  // Mọi lời khách trong hội thoại (12 tin gần nhất + tin này) — nguồn kiểm trích dẫn / giá trị hồ sơ mua.
  const loiKhachMua = [...history.filter((m) => laTinNguoi(m.sender)).map((m) => m.body ?? ""), text].join("\n");
  // SRS-5.1y: kết quả công cụ ĐỌC của trợ lý — lưới chặn bịa phía dưới coi là dữ liệu thật; `troLy` đi vào payload.
  const duLieuCongCu: string[] = [];
  // `vong` 0 = trợ lý bật mà rơi về đường JSON (`ly_do`).
  let troLy: {
    vong: number; cong_cu: string[]; van_goc?: string[]; du_lieu?: string[]; ly_do?: string; nhac_khoang_cach?: number; bo_cau?: string[];
  } | null = null;
  // SRS-5.1zg: trợ lý gọi công cụ tiện ích = khách hỏi tiện ích → cùng link Google Maps như đường JSON (`hoi_tien_ich`).
  let tienIchCongCu: { loai: string; khu_vuc: string | null } | null = null;
  const docCongCuMua = async (ten: "tim_tien_ich_quanh" | "xem_can", input: Record<string, unknown>): Promise<string> => {
    if (ten === "tim_tien_ich_quanh") {
      tienIchCongCu ??= { loai: TEN_LOAI_TIEN_ICH[String(input.loai ?? "")] ?? "tiện ích", khu_vuc: typeof input.khu_vuc === "string" ? input.khu_vuc : null };
      return await timTienIchQuanh(
        client as unknown as Parameters<typeof timTienIchQuanh>[0],
        String(input.khu_vuc ?? ""), String(input.loai ?? "tat_ca"), Number(input.ban_kinh_m) || 1000,
        typeof input.cap_truong === "string" ? input.cap_truong : null,
      );
    }
    const ma = String(input.ma_can ?? "").replace(/^#/, "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,40}$/.test(ma)) return "Mã căn không hợp lệ - hỏi lại khách mã căn.";
    const [{ data: l, error: lErr }, { data: ph }] = await Promise.all([
      client.from("listings").select(`status, ${CAN_COLS}, listing_facts(question, answer)`)
        .or(`code.ilike.${ma},legacy_code.ilike.${ma}`)
        .in("status", ["dang_ban", "dang_quan_tam", "da_chot", "an"]).limit(1).maybeSingle(),
      client.from("listing_photos_v").select("code, url").eq("code", ma).limit(24),
    ]);
    if (lErr) throw new Error(lErr.message);
    if (!l) return `Không có căn #${ma} trong kho - nói thật là em không thấy căn này, KHÔNG tả căn.`;
    const can = l as unknown as Asked;
    if (!photoByCode[can.code]) for (const p of (ph ?? []) as Array<{ code: string; url: string }>) (photoByCode[p.code] ??= []).push(p.url);
    return dongCanNhac(can);
  };
  // FR-27 (v48): "xem thêm" hình — offset nhớ ở `buyers.preferences.photo_offset`
  // = {code, n} (rẻ nhất: đi chung RPC `merge_buyer_prefs` đã có ở hậu kỳ,
  // không thêm cột, không tra `messages`). Có nghĩa CHỈ khi lượt trước còn dư.
  const offsetCu = (prefs.photo_offset ?? null) as { code?: string; n?: number } | null;
  const xemThemHinh = !!offsetCu?.code && XEM_THEM_RE_KD.test(tKD);
  try {
    danhDau("mua_truoc_model");
    // Dựng client TRONG try: thiếu key/hỏng model đều rơi về fallback regex bên
    // dưới thay vì 500 — không đổ lỗi cho khách (giữ đúng ý đồ fallback cũ).
    const thamSoMua = {
      model: MODEL,
      max_tokens: 1024,
      // effort low: nhanh hơn rõ rệt, few-shot + luật đã gánh chất lượng (nudge
      // chạy low được chấm 4.5-4.7/5); cần sâu hơn thì nâng lại "medium"
      output_config: { effort: "low" as const },
      _khuon_du_phong: BUYER_FORMAT,
      // Tách 2 khối theo GIÁ, không theo chủ đề: mọi thứ giống hệt nhau cho mọi
      // khách nằm trước điểm nhớ tạm (đọc lại chỉ tốn 1/10 giá); mọi thứ đổi
      // theo hồ sơ từng khách nằm sau (phải trả đủ giá dù có cache hay không).
      //
      // TTL 1 GIỜ, KHÔNG PHẢI 5 PHÚT MẶC ĐỊNH — và đây là lựa chọn theo LƯU
      // LƯỢNG, phải xem lại khi lưu lượng đổi. Khối tĩnh ~5.800 token. Nạp lại
      // tốn 1,25 lần giá gốc ở nhịp 5 phút, 2 lần ở nhịp 1 giờ; đọc lại tốn
      // 1/10. Đồng hồ đếm từ lúc BẮT ĐẦU mỗi lượt và mỗi lần đọc lại đặt lại
      // đồng hồ, nên cái quyết định là KHOẢNG CÁCH giữa hai lượt bất kỳ dùng
      // chung khối này — của mọi khách cộng lại, không phải của riêng một khách.
      //
      //   cách nhau < 5 phút  → để 5 phút: lượt nào cũng làm nóng lại, rẻ nhất
      //   cách nhau 5–60 phút → để 1 giờ: đây là khoảng DUY NHẤT bù nổi giá nạp
      //   cách nhau > 1 giờ   → cả hai đều không cứu; chịu lượt nguội
      //
      // Hôm nay khách thưa, khoảng cách rơi vào 5–60 phút. Ở nhịp đó để 5 phút
      // thì lượt nào cũng trượt, mà một lượt trượt (1,25) còn ĐẮT HƠN không
      // dùng nhớ tạm (1,0) — mất tiền để không được gì.
      //
      // ĐỔI NGƯỢC LẠI VỀ 5 PHÚT khi vượt ~12 lượt trả lời/giờ (cỡ 10 khách/ngày
      // trong giờ làm). Lúc đó lưu lượng tự giữ nóng và giá nạp gấp đôi thành
      // lỗ thuần. Đọc số thật ở cache_read_input_tokens trong usage.
      system: [{
        type: "text",
        text: TONE + "\n\n" + HUMAN + "\n\n" + FEES + "\n\n" + SLANG + "\n\n" + AGREE + "\n\n" + FEWSHOT +
          "\n\nBất biến: tối đa 3 listing một tin; không khẳng định còn/hết hay pháp lý khi chưa xác minh - nói 'để em hỏi lại chủ nhà'; tin chủ động kết thúc bằng MỘT câu hỏi. Chỉ dùng listing trong KHO ở khối sau, không bịa." +
          "\n\n" + DAU_RA_JSON +
          (duanNhaMinh
            ? "\n\nDỰ ÁN NHÀ MÌNH ĐANG PHÂN PHỐI TRỰC TIẾP (kiến thức chung ĐÃ XÁC THỰC - trả lời TRỰC TIẾP câu hỏi tầng dự án: vị trí, chủ đầu tư, pháp lý dự án, tiện ích, mẫu nhà, quy cách bàn giao - KHÔNG cần 'hỏi lại chủ nhà'. GIÁ từng căn KHÔNG có ở đây: khách hỏi giá thì nói 'để em kiểm tra giá lô đó rồi báo anh/chị liền'. Khách hợp nhu cầu (nhà phố xây mới, khu biệt lập an ninh, ~43-92m2, quanh Q5/Q6/Q8) thì chủ động giới thiệu MỘT lần như một lựa chọn; khách không quan tâm thì thôi, đừng lặp lại):\n" +
              duanNhaMinh
            : ""),
        cache_control: { type: "ephemeral", ttl: "1h" },
      }, {
        type: "text",
        text: DONG_TEN + "\n\nKHO HIỆN CÓ (mỗi căn chỉ nói điều CÓ trong dòng của nó - thông số hoặc lời 'chủ tả'; điều dòng không ghi như phòng ngủ ở tầng nào, diện tích từng phòng, công năng từng tầng thì nói 'để em hỏi lại chủ', KHÔNG tự suy theo nhu cầu khách):\n" +
          (kho || (minimumMet || mentioned.length
            ? "(trống)"
            : "(chưa lọc - chưa đủ khu vực + giá để lọc, đừng nói kho trống)")) +
          (giaTB
            ? `\n(${giaTB} - ước tính từ kho bên em, dùng để so khi khách hỏi "giá vậy ok không": nói rẻ/mắc hơn mặt bằng khoảng bao nhiêu %, KHÔNG gọi là thẩm định)`
            : "") +
          (gan && ganKq
            ? `\n(Đã lọc theo ý khách muốn ở gần ${nhanGan(gan)}. Khoảng cách là đường chim bay tính từ con đường của căn, ước tính - nói "khoảng", KHÔNG hứa chính xác, KHÔNG nói số nhà.${
              ganKq.length ? "" : " Không có căn nào đã định vị trong bán kính này - nói thật, gợi ý nới bán kính hoặc khu khác."
            })`
            : "") +
          (gan && khongThayMoc
            ? `\n(Khách muốn ở gần ${nhanGan(gan)} nhưng bên em CHƯA định vị được nơi đó ${HOI_LAI_NOI_DO})`
            : "") +
          (askedBlock
            ? "\n\nCĂN KHÁCH ĐANG NHẮC TỚI (khách vào từ web hoặc gõ mã - chào ĐÚNG căn này, trả lời thẳng vào nó; mục 'đã xác minh từ chủ nhà' được nói chắc, còn lại vẫn 'để em hỏi lại'):\n" +
              askedBlock
            : "") +
          (tuongTuBlock
            ? `\n\nCĂN TƯƠNG TỰ (cùng khu, giá 0,7–1,3 lần căn #${canGoc?.code ?? ""} - dùng khi căn khách hỏi đã chốt/đã gỡ hoặc khách hỏi "giống giống vầy"; nêu điểm giống, vẫn tối đa 3 căn một tin):\n` +
              tuongTuBlock
            : "") +
          (canDuAnBlock
            ? "\n\nCĂN TRONG DỰ ÁN KHÁCH HỎI (tình trạng từng căn đọc từ đây, KHÔNG đoán; dòng ghi 'QUÁ 7 NGÀY' thì 'để em xác nhận lại chủ' + ask_owner):\n" +
              canDuAnBlock
            : "") +
          (duAnKhuBlock
            ? `\n\nDỰ ÁN TRONG ${quanKhach?.toUpperCase() ?? "KHU VỰC"} KHÁCH ĐANG TÌM (kho kiến thức tham khảo, KHÔNG phải căn đang bán - khách hỏi "khu này có dự án gì" thì kể tối đa 3 tên kèm địa chỉ từ đây, đúng tên; nói rõ hiện bên em CHƯA có căn nào của các dự án này đang rao, có căn là báo; TUYỆT ĐỐI không kể dự án ngoài danh sách này):\n` +
              duAnKhuBlock
            : "") +
          (duanBlock
            ? "\n\nDỰ ÁN KHÁCH VỪA NHẮC TỚI (kiến thức chung ĐÃ XÁC THỰC - dùng trả lời TRỰC TIẾP câu hỏi tầng dự án: vị trí, chủ đầu tư, pháp lý dự án, tiện ích, mẫu nhà, quy cách bàn giao - KHÔNG cần 'hỏi lại chủ nhà'. Đây là KIẾN THỨC, không phải căn đang bán: không nói 'bên em có <dự án>'. KHÔNG nối dự án với khu / đường khách đang tìm ('gần Phạm Thế Hiển lắm') khi khối không ghi; dự án ở tỉnh / khu khác hẳn chỗ khách hỏi thì hỏi lại có đúng dự án đó không. " + "MỌI CON SỐ về dự án (diện tích từng loại căn, số căn, số tầng, giá, phí, năm bàn giao) CHỈ được lấy nguyên văn từ khối này. Không có ở đây thì nói thẳng 'con số đó em xác nhận lại rồi báo anh/chị' — TUYỆT ĐỐI không lấy từ trí nhớ của mình, kể cả khi thấy quen. " + "GIÁ từng căn KHÔNG có ở đây: khách hỏi giá thì nói 'để em kiểm tra giá lô đó rồi báo anh/chị liền'):\n" +
              duanBlock
            : ""),
      }],
      messages: [{
        role: "user" as const,
        content: [
          ...(imageUrl
            ? [{ type: "image" as const, source: { type: "url" as const, url: imageUrl } }]
            : []),
          { type: "text" as const, text:
          (goiMua
            ? `CÁCH GỌI KHÁCH: "${goiMua}" - khách đã tự xưng/dặn, giữ nguyên mọi tin, không dùng "anh/chị".\n`
            : `CÁCH GỌI KHÁCH: chưa biết nam hay nữ - KHÔNG tự đoán "anh" hay "chị"; gọi "${cachGoiKhach(null, prefs.nhom_tuoi)}" hoặc bỏ đại từ, KHÔNG gọi "mình".\n`) +
          `HỒ SƠ ĐÃ BIẾT về khách${buyer.name ? ` (tên: ${buyer.name})` : ""}:\n${known || "(chưa biết gì)"}\n\n` +
          (duTieuChiDeNgungDo
            ? `CHƯA BIẾT (chỉ NHẶT khi khách tự kể hoặc khi khách chê căn vừa gửi, TUYỆT ĐỐI không hỏi chủ động - đủ khu vực + giá là ngừng dò hồ sơ):\n${missing || "(đã đủ)"}\n\n`
            : `CÒN THIẾU (hỏi theo thứ tự ưu tiên; gộp 2-3 ý vào MỘT câu hỏi liền mạch cũng được, đừng thành bảng hỏi):\n${missing || "(đã đủ)"}\n\n`) +
          (duTieuChiDeNgungDo
            ? "Đã đủ tiêu chí tối thiểu (khu vực + giá) - NGỪNG hỏi các trường hồ sơ ở trên, chuyển sang gợi ý căn khớp (KHO trống thì nói thật em lọc rồi báo) và để khách dẫn chuyện.\n" +
              // FR-228 (chủ dự án 25/09/2026: "Mỗi lượt 1 câu, xen giữa"): bộ câu tư vấn hỏi dần sau khi đủ khu vực + giá.
              (tuVanKe && !interrogated
                ? `CÂU TƯ VẤN KẾ (bộ câu tư vấn của bên em - hỏi đúng ý câu này, TỐI ĐA MỘT câu hỏi trong tin, đặt CUỐI tin sau phần trả lời / gợi ý căn; đổi đại từ theo CÁCH GỌI KHÁCH; khách đang hỏi việc khác thì trả lời việc đó trước và để câu này lượt sau): "${tuVanKe.cau}"\n`
                : "")
            : "CHƯA đủ tiêu chí tối thiểu (khu vực + giá) - chưa gợi ý căn trừ khi khách hỏi thẳng một căn.\n") +
          // 14/09/2026 (bắn thật, FR-207): khách thấy "💾 Đã lưu nhu cầu: … để ở" rồi câu
          // ngay sau lại "chị muốn ở hay kinh doanh?" — model tự điền `purpose` từ "nhà có
          // mẹ già" rồi vẫn hỏi theo danh sách CÒN THIẾU (đọc từ hồ sơ ĐẦU lượt).
          "Trường nào em ĐIỀN vào profile ở CHÍNH lượt này (kể cả suy ra từ lời khách) là ĐÃ BIẾT - KHÔNG hỏi lại trường đó trong replies; khách sẽ thấy ngay dòng báo đã lưu.\n" +
          (interrogated
            ? "Hai tin trước em đều đã đặt câu hỏi - lượt này ĐƯA GIÁ TRỊ trước (gợi ý/thông tin), hỏi thật nhẹ hoặc không hỏi.\n"
            : "") +
          `\nHội thoại tới giờ:\n${convo}\n` +
          (imageUrl ? "\nKhách VỪA GỬI KÈM MỘT TẤM ẢNH (đính trên). Mô tả trung thực điều thấy được; đoán thì nói 'hình như là…' và xác nhận lại; KHÔNG suy diễn vật liệu/pháp lý từ ảnh.\n" : "") +
          (VOICE_RE_KD.test(tKD)
            ? "\nKhách VỪA XIN GỌI ĐIỆN/VOICE: trả lời 'để em nhờ anh/chị phụ trách gọi lại liền ạ', điền voice_request=true và need_human=true; KHÔNG đưa số điện thoại nào.\n"
            : "") +
          (danhGia
            ? `\nKhách VỪA CHẤM ${danhGia.stars}/5 SAO cho căn vừa xem (hệ thống đã ghi nhận, đừng hỏi lại điểm): cảm ơn ngắn${danhGia.stars <= 3 ? ", rồi hỏi đúng MỘT câu chưa ưng chỗ nào để em lọc tiếp" : ", hỏi có muốn xem thêm căn khác không"}.\n`
            : "") +
          (xemThemHinh
            ? "\nKhách VỪA XIN XEM THÊM HÌNH căn bot gửi lượt trước - hệ thống tự gửi 4 tấm kế, em chỉ nói ngắn 'dạ em gửi tiếp nè', KHÔNG hứa đi xin chủ nhà.\n"
            : "") +
          // SRS-5.1zzzzzh (bắn production 12/10, thu-kb-mua): "cho mình xin số chủ nhà" → hệ thống gửi câu giải thích soạn sẵn, model cũng tự giải
          // thích lần nữa bằng chữ khác ("bên em chăm sóc khách qua Zalo… cộng tác viên sẽ liên hệ") — hai bong bóng một ý. Ý này có MỘT chủ.
          (XIN_SO_CHU_RE.test(tKD)
            ? "\nKhách VỪA XIN SỐ CHỦ NHÀ: hệ thống ĐÃ gửi riêng câu giải thích (không gửi số qua chat, người phụ trách dẫn đi xem) — em KHÔNG giải thích lại chuyện số / liên hệ, chỉ nối tiếp bằng đúng MỘT câu hỏi nhu cầu còn thiếu (hoặc không nói gì thêm).\n"
            : "") +
          LENH_CUOI_JSON },
        ],
      }],
    };
    // SRS-5.1y (02/10/2026): TRỢ LÝ CÓ CÔNG CỤ — cùng ngữ cảnh, chỉ đổi lời dặn đầu ra; model viết thẳng lời nhắn và gọi
    // công cụ (tra tiện ích, xem căn, ghi hồ sơ/hẹn/hỏi chủ…). Công cụ ghi đổ vào đúng khuôn `out` nên mọi lưới dưới vẫn
    // chạy. Không ra câu trả lời (model chết, từ chối, hết vòng) → đường JSON cũ ngay trong lượt.
    if (await troLyBat(client, externalUserId)) {
      let hongTroLy: { ly_do: string; cong_cu: string[]; vong: number } | null = null;
      try {
        const ai = await napTroLy(client);
        if (ai) {
          const [k0, k1] = thamSoMua.system;
          const tl = await chayTroLyMua({
            goi: async (p) => {
              const r = await ai.messages.create(p as unknown as Parameters<typeof ai.messages.create>[0]) as unknown as PhanHoiModel;
              await doTien(client, r.usage ?? null);
              return r;
            },
            thamSo: {
              model: MODEL, max_tokens: 1024, output_config: { effort: "low" },
              system: [{ ...k0, text: k0.text.replace(DAU_RA_JSON, DAU_RA_CONG_CU) }, { ...k1, text: k1.text.replace(HOI_LAI_NOI_DO, HOI_LAI_NOI_DO_TRO_LY) }],
              // SRS-5.1zzzzzh (bắn production 12/10): lệnh cuối "…và cập nhật hồ sơ:" của đường JSON mời model VIẾT phần hồ sơ ra chữ —
              // ở chế độ trợ lý chữ đó đi thẳng tới khách ("Cập nhật hồ sơ: Khách đang chần chừ… Lý do không hỏi tiếp: …"). Việc ghi là
              // gọi công cụ, nên lệnh cuối chỉ đòi lời nhắn gửi khách.
              messages: doiLenhCuoiTroLy(thamSoMua.messages),
            },
            loiKhach: loiKhachMua,
            doc: docCongCuMua,
            // Nguồn hợp lệ cho con số khoảng cách: kho / căn khách nhắc (khối k1) + lời dặn có hội thoại (tin user).
            nguCanh: [k1.text, ...thamSoMua.messages[0].content.map((c) => ("text" in c ? c.text ?? "" : ""))].join("\n"),
            baoHong: (lyDo, congCu, vong) => { hongTroLy = { ly_do: lyDo, cong_cu: congCu, vong }; },
          });
          if (tl) {
            out = tl.out as LuotMua;
            duLieuCongCu.push(...tl.duLieu);
            // Lời GỐC của model (trước mọi lưới) + kết quả công cụ đọc — để bắn thử thấy được lưới nào đã sửa lời.
            troLy = {
              vong: tl.vong, cong_cu: tl.congCu, van_goc: [...tl.out.replies], du_lieu: tl.duLieu.map((d) => d.slice(0, 400)),
              ...(tl.nhac ? { nhac_khoang_cach: tl.nhac, bo_cau: tl.boCau } : {}),
            };
          } else troLy = hongTroLy ?? { vong: 0, cong_cu: [], ly_do: "khong_ra_cau_tra_loi" };
        } else troLy = { vong: 0, cong_cu: [], ly_do: "khong_co_khoa_anthropic" };
      } catch (e) {
        await ghiLoi(client, "chat-reply tro ly", e);
        troLy = { vong: 0, cong_cu: [], ly_do: "loi" };
      }
    }
    if (!out) {
    const anthropic = await napModel(client);
    const resp = await anthropic.messages.parse(thamSoMua as unknown as Parameters<typeof anthropic.messages.parse>[0]);
    moc.mua_tok_ra = resp.usage?.output_tokens ?? -1;
    moc.mua_tok_vao = resp.usage?.input_tokens ?? -1;
    moc.mua_tok_nho_doc = resp.usage?.cache_read_input_tokens ?? -1;
    moc.mua_tok_nho_ghi = resp.usage?.cache_creation_input_tokens ?? -1;
    if (resp.stop_reason !== "refusal") {
      // Lưới Groq vẫn trả `parsed_output` (nó dùng khuôn dự phòng); Anthropic trả chữ.
      const chu = (resp.content ?? []).map((b: { type: string; text?: string }) => b.type === "text" ? b.text ?? "" : "").join("");
      out = (resp.parsed_output as LuotMua | null) ?? (docLuotMuaTuChu(chu) as LuotMua | null);
      if (!out) await ghiLoi(client, "chat-reply model JSON hong", `stop=${resp.stop_reason} · ${chu.slice(0, 200)}`);
    }
    // Đo SAU khi đã cầm chắc câu trả lời trong tay: lượt buyer là lượt đắt nhất
    // (khối tĩnh ~5.800 chữ-máy), nên đây là con số quan trọng nhất của đồng hồ.
    await doTien(client, resp.usage);
    }
  } catch (e) {
    // Chỗ này nguy hơn vẻ ngoài: model hỏng thì khối dưới vẫn dựng câu trả lời
    // bằng regex và trả 200 tử tế. Khách không thấy gì lạ, mã HTTP không thấy
    // gì lạ, nên bot_health_tick cũng mù. Phải tự ghi sổ (FR-152).
    await ghiLoi(client, "chat-reply model", e);
  }

  if (hoiGan && !ganTruocModel) ({ ganMoi, boGan } = await hoiGan);
  danhDau("mua_sau_model");
  // Fallback quy tắc: model hỏng ≠ khách nói không rõ — đừng đổ lỗi cho khách,
  // vẫn bóc được ngân sách/hẻm bằng regex và hỏi tiếp tiêu chí thiếu kế tiếp.
  if (!out) {
    const delta = regexProfileFallback(text);
    const nextMissing = BUYER_PROFILE_FIELDS
      .find(([k]) => (prefs[k] == null || prefs[k] === "") && delta[k] == null);
    out = {
      profile: delta,
      replies: [
        VOICE_RE_KD.test(tKD)
          ? "Dạ để em nhờ anh/chị phụ trách gọi lại liền ạ."
          : nextMissing
          ? `Dạ em ghi nhận rồi ạ. ${buyer.name ? `Anh/chị ${buyer.name}` : "Anh/chị"} cho em xin thêm ${nextMissing[1]} để em lọc đúng căn nha?`
          : "Dạ em ghi nhận rồi ạ. Em xem kỹ rồi báo lại anh/chị liền nha, anh/chị chờ em xíu!",
      ],
    };
  }
  // FR-79 (v48): khách đòi gọi điện — theo cờ model HOẶC regex (model quên thì
  // vẫn mở việc VOICE). Cần người thật là hệ quả bắt buộc.
  // 13/09/2026: model KHÔNG có căn nào trong tay (kho trống/chưa lọc, không căn
  // khách nhắc, không căn tương tự, không căn dự án) mà vẫn "Dạ có em" / "em đang
  // có vài căn…" → bỏ câu đó, nói thật. Câu lệnh đã dặn "không bịa" mà vẫn lọt
  // ở lượt bắn 12/09 (2/2 khách mua), nên chặn bằng code.
  // SRS-5.1zzn: nhánh mua đọc cùng công tắc `luat_loi_bot`; van SỬA VĂN chỉ chạy ở `du`. Sổ van theo dõi out.replies.
  const luatDuMua = await loiBotDu();
  const mocMua = theoDoiVan(soVan, () => out.replies);
  if (!kho && !askedBlock && !tuongTuBlock && !canDuAn.length) {
    const ac = cachGoiKhach(goiMua, prefs.nhom_tuoi);
    // SRS-5.1zzzza / SRS-5.1zzzzb (bắn production 09/10/2026): không căn nào trong tay mà lời model (a) khen / nhận xét ("Hẻm xe hơi
    // tới cửa là khách chuộng lắm, vị trí tốt lắm" — lời khen dành cho căn của người BÁN) hoặc (b) nói có hàng bằng chữ mẫu từ khoá
    // chưa có ("Em đang lọc căn 2 lầu … cho anh", "Dạ còn chị. Em tìm thấy mấy căn…"). AI liệt kê các câu đó theo NGHĨA (lượt soát
    // nhận xét của nhánh bán, đối tượng người mua); code kiểm câu có thật trong lời bot rồi quyết: không căn nào làm căn cứ → bỏ hết,
    // câu hỏi giữ. Mẫu từ khoá `laHuaCoHang` lùi xuống lưới đỡ khi AI không chạy.
    let aiHuaHang: string[] = [], aiNhanXet: string[] = [], cauDuAn: string[] = [];
    // SRS-5.1zzzzzq: kiến thức dự án của lượt (khách nhắc tên, dự án nhà mình, dự án cùng khu) là NGUỒN cho câu nói về dự án.
    const nguonDuAn = [duanBlock, duanNhaMinh, duAnKhuBlock].filter(Boolean).join("\n");
    try {
      const ai = await napModel(client);
      const { nhanXet, usage } = await soatNhanXetBangModel(ai as unknown as Parameters<typeof soatNhanXetBangModel>[0], MODEL, out.replies.join("\n"), loiKhachMua, "", "nguoi_mua", nguonDuAn);
      await doTien(client, usage as Parameters<typeof doTien>[1]);
      cauDuAn = cauDuAnCoNguon(nhanXet, nguonDuAn);
      for (const n of nhanXet) {
        const c = (n.cau ?? "").trim();
        if (!c || /\?/.test(c) || cauDuAn.includes(c)) continue;
        (n.noi_co_hang === true ? aiHuaHang : aiNhanXet).push(c);
      }
    } catch (e) {
      await ghiLoi(client, "chat-reply soat nhan xet (mua)", e);
    }
    const chan = chanHuaCoHang(
      out.replies,
      minimumMet || mentioned.length
        ? `hiện bên em chưa có căn nào khớp đúng nhu cầu này ạ. Em ghi lại rồi, có căn mới hợp là em báo ${ac} liền nha.`
        // 23/09/2026: câu cũ "em lọc kho … rồi báo lại liền nha" là lời hứa không ai làm (không hàng đợi nào gửi
        // sau). Chưa đủ tiêu chí thì xin đúng thứ còn thiếu — lượt sau đủ là kho lọc ngay.
        : `${ac} cho em xin thêm ${[!(prefsLoc.area != null || gan != null) ? "khu vực" : null, prefsLoc.budget == null ? "tầm giá" : null].filter(Boolean).join(" và ") || "tiêu chí"} để em lọc đúng căn nha.`,
      laHoiCoHang(text),
      aiHuaHang,
      cauDuAn,
    );
    if (chan.daChan) {
      out.replies = chan.replies;
      console.log("chat-reply: chặn câu hứa có hàng khi kho trống"); mocMua("chanHuaCoHang");
    }
    if (aiNhanXet.length) {
      const sach = out.replies.map((r) => boCauNhanXet(r, aiNhanXet)).filter((r): r is string => !!r && !!r.trim());
      if (sach.length) { out.replies = sach; console.log("chat-reply: bo nhan xet khi chua co can (mua)", aiNhanXet.join(" | ")); }
      mocMua("soatNhanXet(mua)");
    }
    // 23/09/2026 (bắn lại sau deploy #193): kho trống mà model tả "căn này hẻm xe hơi 4m P12, 50m2, 7,9 tỷ" —
    // căn không tồn tại. Bỏ bong bóng tả căn; còn lại trống thì nói thật.
    const boBia = boCanBia(out.replies, cauDuAn);
    if (boBia !== out.replies) {
      out.replies = /chua co (?:can|tin) nao|chua co can/.test(boDau(boBia.join(" ")))
        ? boBia
        : [...boBia, `Dạ hiện bên em chưa có căn nào khớp đúng nhu cầu này ạ. Có căn mới hợp là em báo ${ac} liền nha.`];
      console.log("chat-reply: bỏ căn bịa khi kho trống"); mocMua("boCanBia");
    }
    // 30/09/2026 (bắn thật lx-mua-e): "nhà quận 5 dưới 5 tỷ" → "chưa có căn nào khớp" rồi thôi, trong khi kho có căn Q5 6,3 tỷ.
    // Đủ tiêu chí mà kho trống VÌ GIÁ → nói căn gần nhất vượt ngân sách (cùng khu, cùng lọc phòng ngủ / hẻm, tối đa 1,5×
    // trần), chữ lấy từ cột kho — khách tự quyết có nới không.
    if (minimumMet && budgetR?.max && !mentioned.length) {
      let gq = client.from("listings").select(CAN_COLS)
        .eq("deal", dealCol(prefsLoc.deal)).in("status", ["dang_ban", "dang_quan_tam"])
        .not("price_raw", "is", null).neq("price_raw", "")
        .gt("price_vnd", budgetR.max).lte("price_vnd", Math.round(budgetR.max * 1.5))
        .order("price_vnd", { ascending: true }).limit(1);
      const quanLoc = typeof prefsLoc.area === "string" ? bocQuan(boDau(prefsLoc.area), prefsLoc.area) : null;
      if (wardNum) gq = gq.ilike("ward", `Phường ${wardNum}`);
      else if (quanLoc) gq = gq.eq("district", quanLoc);
      if (hemLoc) gq = gq.or(hemLoc);
      if (orLoai) gq = gq.or(orLoai);
      // Phòng ngủ khách vừa nói trong CÂU NÀY ("3 phòng ngủ, hẻm xe hơi") cũng lọc — hồ sơ lưu chưa kịp có (lượt model ghi sau).
      const pnCau = /\b(\d{1,2})\s*(?:phong ngu|pn)\b/.exec(tKD);
      const pnLoc = typeof prefsLoc.bedrooms === "number" ? prefsLoc.bedrooms : pnCau ? Number(pnCau[1]) : null;
      if (pnLoc != null && pnLoc >= 1 && pnLoc <= 10) gq = gq.gte("bedrooms", pnLoc);
      const { data: gn, error: gnErr } = await gq;
      if (gnErr) await ghiLoi(client, "chat-reply can gan ngan sach", gnErr.message);
      const l0 = ((gn ?? []) as CanRow[])[0];
      if (l0 && !out.replies.some((r) => boDau(r).includes(boDau(l0.code)))) {
        const moTa = [`${locLienHe(l0.location_raw ?? "").trim()} ${l0.ward ?? ""}`.trim(), l0.price_raw ? donViGiaDep(l0.price_raw) : null, l0.area_m2 ? `${Number(l0.area_m2)}m2` : null, l0.bedrooms ? `${l0.bedrooms}PN` : null]
          .filter(Boolean).join(" · ");
        out.replies = [...out.replies, `Gần tầm giá nhất bên em có căn #${l0.code} · ${moTa}, ${ac} muốn xem thử không ạ?`];
        console.log(`chat-reply: gợi căn gần ngân sách ${l0.code}`);
      }
    }
  }
  // 23/09/2026 (bắn lại sau deploy #193): kho CÓ căn khớp (Trần Bình Trọng 8 tỷ 2, khách "dưới 9 tỷ") mà model chỉ
  // "Dạ em lọc kho cho mình xem" rồi hỏi thêm — khách không thấy căn nào. Không nhắc căn nào trong kho mà có câu
  // hứa lọc/tìm → thay câu hứa bằng căn đầu kho (tiền định, chỉ chữ có trong kho).
  if (kho && minimumMet && !mentioned.length) {
    const dsKho = (listings ?? []) as CanRow[];
    const vb = boDau(out.replies.join(" "));
    const daNoiCan = dsKho.some((l) => vb.includes(boDau(l.code)) || (() => { const dc = boDau(l.location_raw ?? ""); return dc.length >= 5 && vb.includes(dc); })());
    if (!daNoiCan && out.replies.some((r) => laHuaCoHangCau(r, false))) {
      const l0 = dsKho[0];
      const moTa = [`${locLienHe(l0.location_raw ?? "").trim()} ${l0.ward ?? ""}`.trim(), l0.price_raw ? donViGiaDep(l0.price_raw) : null, l0.area_m2 ? `${Number(l0.area_m2)}m2` : null, l0.bedrooms ? `${l0.bedrooms}PN` : null]
        .filter(Boolean).join(" · ");
      const chan = chanHuaCoHang(out.replies, `em có căn #${l0.code} · ${moTa}, ${cachGoiKhach(goiMua, prefs.nhom_tuoi)} xem thử nha?`, false);
      if (chan.daChan) {
        out.replies = chan.replies;
        console.log(`chat-reply: thay lời hứa lọc kho bằng căn ${l0.code}`);
      }
    }
  }
  // 30/09/2026 (bắn thử mua lx-mua-d1): "căn rẻ nhất là Nguyễn Trãi Nguyễn Trãi P2" — cụm lặp liền nhau do model viết.
  if (luatDuMua) out.replies = boLapCum(out.replies); mocMua("boLapCum");
  // 13/09/2026: khách hỏi "em là người hay máy" → model đáp "Em là người thật,
  // không phải máy đâu" (lượt bắn 13/09). Nói dối khách về bản chất trợ lý là
  // thứ không được phép lọt, dù câu lệnh dặn gì — chặn bằng code.
  out.replies = chanNhanLaNguoi(out.replies, cachGoiKhach(goiMua, prefs.nhom_tuoi)); mocMua("chanNhanLaNguoi");
  // 20/09/2026 (bắn thật mau-y-C): "cho mình xin số chủ nhà đi" → nói rõ đường đi qua người phụ trách.
  if (XIN_SO_CHU_RE.test(tKD)) {
    const ac = cachGoiKhach(goiMua, prefs.nhom_tuoi);
    out.replies = [
      `Dạ bên em không gửi số chủ nhà qua chat ạ. Có căn hợp, anh chị phụ trách bên em sẽ liên hệ ${ac} và dẫn ${ac} đi xem, làm việc trực tiếp với chủ nhà luôn.`,
      // 23/09/2026: "Dạ em chưa có SĐT chủ, bên em quản lý qua Zalo cho tiện ạ" — lời model nói ngược câu trên.
      ...out.replies.filter((r) => !/\b(?:so|sdt|so dien thoai|dien thoai)\b[^.?!]*\bchu\b/.test(boDau(r))),
    ];
  }
  // 23/09/2026 (FR-218 b): khách nói bot hiểu nhầm mà không câu nào xin lỗi → chèn lời xin lỗi (trước đổi xưng hô).
  if (luatDuMua) out.replies = themXinLoiKhiHieuNham(text, out.replies, goiMua); mocMua("themXinLoiKhiHieuNham");
  // 23/09/2026: khách là chú mà model tự xưng "chú ghi nhớ rồi ạ" → "cháu ghi nhớ".
  if (luatDuMua) out.replies = suaBotXungNhamKhach(out.replies, goiMua); mocMua("suaBotXungNhamKhach");
  // 16/09/2026: khách mua là chú/cô/bác → bot tự xưng "cháu" (cùng luật nhánh bán).
  out.replies = doiTuXung(out.replies, goiMua); mocMua("doiTuXung");
  // 22/09/2026 (bộ đo giọng B08, cùng lưới với nhánh bán): câu ≥ 6 từ lặp giữa hai bong bóng chỉ giữ lần đầu.
  if (luatDuMua) out.replies = boCauTrung(out.replies); mocMua("boCauTrung");
  let canDangNoi: { code: string } | null = null;
  // 22/09/2026 (bộ đo giọng M06): kho ghi căn 12 Trần Hưng Đạo hẻm 6m mà bot nói "mặt tiền kinh doanh".
  // Căn đang nói = căn khách nhắc mã, hoặc căn trong kho mà địa chỉ xuất hiện trong câu bot / câu khách /
  // câu bot lượt trước ("căn đó"). Câu khẳng định trái với cột kho (hẻm ↔ mặt tiền, sổ riêng ↔ chung) thì bỏ.
  {
    const botTruoc = [...ordered].reverse().find((m) => m.sender === "bot")?.body ?? "";
    const vanBan = boDau(`${out.replies.join(" ")} ${text} ${botTruoc}`);
    const ungVien = [...askedArr, ...((listings ?? []) as CanRow[])];
    const canNoi = ungVien.find((l) => { const dc = boDau(l.location_raw ?? ""); return dc.length >= 5 && vanBan.includes(dc); }) ??
      (askedArr.length === 1 ? askedArr[0] : null);
    canDangNoi = canNoi ?? null;
    if (canNoi) {
      const truoc = out.replies;
      out.replies = boMauThuanCan(out.replies, canNoi);
      if (out.replies !== truoc) console.log(`chat-reply: bỏ câu mâu thuẫn với căn ${canNoi.code}`); mocMua("boMauThuanCan");
    }
    // 23/09/2026 (bắn 26 tin): "Dạ căn này hướng Đông, thoáng và sáng lắm ạ. Chưa có quy hoạch gì…" — kho không có
    // hướng lẫn quy hoạch. Câu khẳng định dữ kiện KHÔNG có trong dữ liệu (kho, căn khách nhắc, dự án) thì bỏ, nói
    // thật "em chưa có thông tin" và mở việc hỏi chủ cho căn đang nói (model chưa mở thì code mở).
    const acMua = cachGoiKhach(goiMua, prefs.nhom_tuoi);
    // Đang nói về MỘT CĂN thì chỉ dữ liệu căn làm chứng (khối dự án đối tác luôn có chữ "quy hoạch 1/500" — bắn lại
    // sau deploy #193, "không có quy hoạch gì cả" lọt vì thế). Không có căn nào đang nói thì mọi khối.
    const nguCanhDuLieu = (canNoi
      ? [kho, askedBlock, tuongTuBlock, canDuAnBlock, ...duLieuCongCu]
      : [kho, askedBlock, tuongTuBlock, canDuAnBlock, duAnKhuBlock, duanBlock, duanNhaMinh, ...duLieuCongCu]).map(String).join("\n");
    const bia = chanBiaDuKien(out.replies, nguCanhDuLieu);
    if (bia.bo.length) {
      out.replies = bia.replies;
      const muc = bia.bo.join(" với ");
      const maHoi = out.ask_owner?.listing_code ?? canNoi?.code ?? null;
      // Câu hỏi chủ PHẢI gồm đúng mục vừa bỏ — bắn lại sau deploy #195: model tự điền ask_owner "hướng nhà (…)"
      // (chép từ lịch sử) khi khách hỏi năm xây, nên "năm xây" không bao giờ tới chủ nhà.
      if (maHoi) {
        const qCu = out.ask_owner?.question?.trim() ?? "";
        out.ask_owner = { listing_code: maHoi, question: qCu && boDau(qCu).includes(boDau(muc)) ? qCu : muc };
      }
      if (!laHuaHoiChu(out.replies)) {
        out.replies.push(maHoi
          ? `Dạ ${muc} của căn này em chưa có thông tin chắc chắn, em hỏi lại chủ nhà rồi báo ${acMua} ngay nha.`
          : `Dạ ${muc} thì em chưa có thông tin chắc chắn ạ.`);
      }
      console.log("chat-reply: bỏ dữ kiện bịa", bia.bo.join(",")); mocMua("chanBiaDuKien");
    }
    // 23/09/2026: "Về giá, để em hỏi lại chủ nhà rồi báo anh liền" mà model KHÔNG mở ask_owner → lời hứa không ai
    // làm. Có căn đang nói thì code mở việc hỏi chủ bằng chính câu khách.
    if (!out.ask_owner?.question && canNoi && laHuaHoiChu(out.replies)) {
      out.ask_owner = { listing_code: canNoi.code, question: text.slice(0, 200) };
      console.log("chat-reply: mở ask_owner cho lời hứa hỏi chủ");
    }
    // 23/09/2026: "chợ An Đông là khu P12 Quận 5 phải không ạ?" — phường của địa danh do model đoán.
    const doanPhuong = boDoanPhuongDiaDanh(out.replies, `${nguCanhDuLieu}\n${text}\n${history.map((m) => m.body ?? "").join("\n")}`);
    if (doanPhuong.bo) {
      out.replies = doanPhuong.replies.length ? doanPhuong.replies : [`Dạ ${acMua}, em ghi nhận rồi ạ.`];
      console.log("chat-reply: bỏ câu đoán phường địa danh", doanPhuong.bo); mocMua("boDoanPhuongDiaDanh");
    }
    // 23/09/2026: khách "mai 9h sáng em qua xem được không" → bot hỏi ngược "Mai 9h sáng có được không?".
    out.replies = boCauVongLai(out.replies, text); mocMua("boCauVongLai");
    // 22/09/2026 (bắn thật sau deploy #181): "gần chợ Hàng Thịt" khi kho chỉ nói "gần chợ Hoà Bình" — tên
    // riêng sau chợ / trường / bệnh viện… không có trong ngữ cảnh (kho, căn khách nhắc, dự án, lịch sử) thì
    // gọt tên, giữ loại ("gần chợ").
    const nguCanhTen = [kho, askedBlock, tuongTuBlock, canDuAnBlock, duAnKhuBlock, duanBlock, duanNhaMinh, ...duLieuCongCu, text, ...history.map((m) => m.body ?? "")].map(String).join("\n");
    // 02/10/2026 (bắn D1 "còn bệnh viện gần đó thì sao"): trợ lý hỏng → đường JSON cũ kể "Bệnh viện … khoảng 800m" mà không
    // tra gì; lưới khoảng cách chỉ nằm TRONG vòng trợ lý nên đường cũ lọt, rồi lưới gọt tên cắt cụt thành "Bệnh viện tế…".
    // Lưới khoảng cách chạy ở đây cho MỌI đường: câu nêu nơi chốn + khoảng cách không có trong kho / dữ liệu công cụ /
    // hội thoại thì bỏ cả câu.
    {
      const sai = out.replies.flatMap((r) => cauKhoangCachKhongNguon(r, nguCanhTen));
      if (sai.length) {
        out.replies = out.replies
          .map((r) => sai.reduce((acc, c) => acc.replace(c, ""), r).replace(/\s{2,}/g, " ").trim())
          .filter(Boolean);
        if (!out.replies.length) out.replies = ["Dạ phần khoảng cách tới đó em chưa tra được số liệu chắc nên không dám nói bừa ạ."];
        console.log("chat-reply: bỏ câu khoảng cách không nguồn", sai.length);
      }
    }
    const truocTen = out.replies;
    out.replies = boTenRiengBia(out.replies, nguCanhTen);
    if (out.replies !== truocTen) console.log("chat-reply: gọt tên riêng không có trong kho"); mocMua("boTenRiengBia");
    // FR-114 (e), bắn thật 22/09 sau deploy #184: model kể đúng ba dự án nhưng nói "bên em có vài dự án ĐANG
    // BÁN" (status_text của dự án) mà quên câu "chưa có căn nào đang rao" đã dặn — khách hiểu là có hàng.
    // Kho không có căn nào thuộc các dự án đó mà bong bóng nêu tên dự án thì nối một câu nói thật, tiền định, ngay sau nó.
    if (duAnKhuBlock && !coCanTrongDuAnKhu) {
      const tenDA = duAnKhuBlock.split("\n").map((d) => boDau(d.replace(/^• /, "").split(" - ")[0].trim())).filter((t) => t.length >= 4);
      const daNoi = out.replies.join(" ");
      if (!/chua co (?:can|tin) nao|chua co can/.test(boDau(daNoi))) {
        const i = out.replies.findIndex((r) => { const kd = boDau(r); return tenDA.some((t) => kd.includes(t)); });
        if (i >= 0) {
          out.replies.splice(i + 1, 0, `Hiện bên em chưa có căn nào của các dự án này đang rao, có căn là em báo ${cachGoiKhach(goiMua, prefs.nhom_tuoi)} liền ạ.`);
          console.log("chat-reply: nối câu 'chưa có căn nào đang rao' sau khối dự án trong quận");
        }
      }
    }
  }
  // 22/09/2026 (bộ đo giọng, ca M01/M02/M06 chạy model giả): câu dò tiền định "Anh/chị cho em xin thêm…"
  // và mọi câu model ở nhánh MUA chưa đi qua bộ lọc gạch chéo như nhánh bán (1952) → khách mua chưa
  // biết nam/nữ vẫn đọc "anh/chị". Cùng một lưới cho hai nhánh.
  // SRS-5.1zzzzj: gạch chéo là chữ in, không phải văn phong — luôn chuẩn (cùng luật nhánh bán).
  if (!goiMua) out.replies = out.replies.map(boGachCheo); mocMua("boGachCheo");
  // 02/10/2026 (bắn thật thu-trl-04: khách xưng "mình", bot "Dạ được chị ơi"): nhánh mua chưa có lưới đoán giới tính như
  // nhánh bán — dùng chung `boGoiDoanGioi`.
  if (luatDuMua && !goiMua) out.replies = out.replies.map(boGoiDoanGioi); mocMua("boGoiDoanGioi");
  // 15/09/2026 (bắn thật K2): "phòng riêng hay share…? Ngoài ra, có cần toilet riêng, điều hòa
  // không?" — HUMAN_CHAT_RULES cho gộp ý vào MỘT câu hỏi, không phải hai câu hỏi.
  out.replies = motCauHoi(out.replies); mocMua("motCauHoi");
  // 14/09/2026 (bắn 16 hội thoại lần 3): câu dặn "đủ khu + giá thì ngừng dò" và "không hỏi
  // người thuê về mục đích" vẫn lọt 2/16 — bỏ câu hỏi "để ở hay đầu tư" bằng code.
  if (luatDuMua && (duTieuChiDeNgungDo || prefs.deal === "thue" || out.profile?.deal === "thue")) {
    const bo = boHoiMucDich(out.replies);
    if (bo.daBo) {
      out.replies = bo.replies;
      console.log("chat-reply: bỏ câu dò mục đích (đủ tiêu chí / khách thuê)"); mocMua("boHoiMucDich");
    }
  }
  // FR-218 b (24/09/2026): đủ quận + giá, kho có căn, khách chưa từng được đưa căn nào trong kho này, mà model
  // lượt này CHỈ hỏi dò → bỏ câu hỏi dò, đưa 2 căn đầu (đã xếp theo nghĩa) bằng chữ tiền định.
  // 30/09/2026 (bắn thử mua lx-mua-d1, SRS-5.1h): "dưới 6 tỷ" rồi "vậy 7 tỷ cũng được em" — kho CÓ căn mà model chỉ hỏi
  // lại đúng câu "hẻm xe hơi hay mặt tiền". Lượt khách VỪA ĐỔI ngân sách đã lưu thì đưa căn như lượt đầu, kể cả đã đưa trước.
  const doiGia = prefs.budget != null && prefs.budget !== "" && prefsLoc.budget != null && prefsLoc.budget !== prefs.budget;
  if (minimumMet && (listings ?? []).length && (doiGia || (duTieuChiDeNgungDo && !(askedListings ?? []).length)) && !out.send_photos && !out.viewing && !out.agreed_deal) {
    const cans: CanGoiY[] = ((listings ?? []) as CanRow[]).map((l) => {
      const ten = (l.location_raw ? tenDuong(l.location_raw) : "") || l.ward || "";
      const dong = [
        [ten, l.ward].filter((x, i, a) => x && a.indexOf(x) === i).join(" "),
        l.price_raw ? donViGiaDep(l.price_raw) : null, l.area_m2 ? `${l.area_m2}m²` : null, l.floors_text, l.bedrooms ? `${l.bedrooms} phòng ngủ` : null,
      ].filter(Boolean).join(" · ");
      return { code: l.code, ten, dong };
    });
    const daDuaTruoc = coNhacCan(history.filter((m) => m.sender === "bot").map((m) => m.body), cans);
    // Chỉ khi model KHÔNG nói gì ngoài câu hỏi dò — khách hỏi chuyện khác ("quận 5 có dự án gì") mà model đã trả
    // lời thì để yên.
    const chiHoiDo = boCauHoiDo(out.replies.filter((x) => !/^\s*(?:🤖|💾|📝|📋)/u.test(x))).length === 0;
    if (!coNhacCan(out.replies, cans) && (doiGia || (chiHoiDo && !daDuaTruoc))) {
      const botTruoc = history.find((m) => m.sender === "bot")?.body ?? null; // history mới nhất trước
      out.replies = [...boCauHuaLoc(boCauHoiDo(boCauHoiLap(out.replies, botTruoc))), bongBongGoiYCan(cans, cachGoiKhach(goiMua, prefs.nhom_tuoi))];
      console.log(doiGia ? "chat-reply: khách đổi ngân sách - đưa 2 căn đầu kho" : "chat-reply: model chưa đưa căn dù đủ tiêu chí - đưa 2 căn đầu kho");
    }
  }
  // FR-218 c (24/09/2026, bắn thật sau #266): "Cả 2 căn đều có phòng ngủ ở tầng trệt" cho hai căn không ghi điều
  // đó — lời dặn trong prompt không đủ. Câu khẳng định đặc điểm mà dữ liệu căn không có → "em hỏi lại chủ".
  {
    const canDl: CanDuLieu[] = [...((listings ?? []) as CanRow[]), ...((askedListings ?? []) as Array<CanRow & { listing_facts?: Array<{ question: string; answer: string }> | null }>)]
      .map((l) => ({
        ten: (l.location_raw ? tenDuong(l.location_raw) : "") || "",
        du_lieu: [dongKho(l), l.description ?? "", l.floors_text ?? "",
          ...(("listing_facts" in l && Array.isArray(l.listing_facts)) ? l.listing_facts.map((f) => `${f.question}: ${f.answer}`) : [])].join(" · "),
      }));
    const dd = boDacDiemKhongCo(out.replies, canDl);
    if (dd.bo.length) {
      out.replies = dd.replies;
      console.log("chat-reply: bỏ câu khẳng định đặc điểm căn không ghi", dd.bo.join(",")); mocMua("boDacDiemKhongCo");
    }
  }
  const muonGoi = !!out.voice_request || VOICE_RE_KD.test(tKD);
  if (muonGoi) out.need_human = true;

  // Gộp hồ sơ: chỉ ghi đè trường model bóc được (không xoá điều đã biết).
  // Riêng notes (hoàn cảnh) là TÍCH LUỸ — nối thêm, đừng ghi đè mất "mẹ già ở
  // cùng" chỉ vì hôm nay khách nói "ưu tiên gần chợ".
  const delta: Record<string, unknown> = {};
  // SRS-5.1zzzzzq: dự án khách đang hỏi — ngữ cảnh cho lượt sau không gọi tên.
  if (duAnNhacMoi && duAnNhacMoi !== duAnNhacCu) delta.du_an_nhac = duAnNhacMoi;
  // FR-188 (10/09/2026): khách MUA nói "cần tìm gấp / mua gấp" → cờ gấp trong hồ
  // sơ (tiền định, laGap); "không gấp, từ từ" → false. CTV và ghép căn đọc cờ này.
  if (laGap(text)) delta.gap = true;
  else if (/\b(khong|ko|k|chua)\s*(?:can\s*)?(?:gap|voi)\b|\btu tu\b|\bkhong voi\b/.test(tKD)) delta.gap = false;
  // 14/09/2026 (bắn 16 hội thoại mua): mục đích / thời hạn / hoàn cảnh hay bị điền
  // bịa — chỉ giữ khi câu khách vừa nhắn có căn cứ (`locHoSoMua`). Trường bị gỡ thì
  // KHÔNG ghi (null = không đụng giá trị cũ), nên thứ đã biết từ trước vẫn còn.
  // 02/10/2026 (SRS-5.1y, bắn thật lần 2–3): giá trị hồ sơ phải là CHỮ khách nói — "nhà có 2 con nhỏ" không được thành
  // "vợ chồng + 2 con nhỏ" hay 2 phòng ngủ. Trợ lý đã kiểm khi gọi công cụ; đường JSON cũ chưa từng kiểm.
  const giaTriLoc = locGiaTriHoSo(out.profile, loiKhachMua);
  if (giaTriLoc.bo.length) console.log("chat-reply: gỡ trường hồ sơ có chữ khách không nói", giaTriLoc.bo.join(","));
  out.profile = giaTriLoc.profile;
  const hoSoLoc = locHoSoMua(out.profile, text);
  if (hoSoLoc.bo.length) console.log("chat-reply: gỡ trường hồ sơ không căn cứ", hoSoLoc.bo.join(","));
  for (const [k, v] of Object.entries(hoSoLoc.profile)) {
    if (v === null || v === "" || k === "name") continue;
    if (k === "notes" && typeof prefs.notes === "string" && prefs.notes) {
      // Gộp theo TỪNG Ý: model hay trả lại cả ghi chú cũ lẫn mới, so nguyên chuỗi
      // thì nối thêm cả đoạn cũ → "mẹ già ở cùng; mẹ già ở cùng; …" (13/09).
      const gop = gopGhiChu(prefs.notes, String(v));
      if (gop) delta.notes = gop;
    } else {
      // 30/09/2026 (bắn thử mua lx-mua-b1): "can mua nha q5…" → hồ sơ lưu khu vực "q5". Chuẩn "Quận 5" / "Phường 2".
      delta[k] = k === "area" && typeof v === "string" ? chuanKhuVucMua(v) : v;
    }
  }
  // 23/09/2026 (bắn 26 tin): "ưu tiên sổ hồng riêng" → model ghi vào HOÀN CẢNH (notes). Đó là yêu cầu pháp lý:
  // ghi khoá riêng `phap_ly`, bỏ ghi chú nếu nó chỉ nói lại chuyện sổ. Khoá này KHÔNG nằm trong danh sách hỏi dò.
  const plMua = /\b(so hong rieng|shr|so rieng|so hong|so do|phap ly (?:ro rang|sach|chuan|day du))\b/.exec(tKD);
  if (plMua) {
    const PL_MUA: Record<string, string> = { "so hong rieng": "sổ hồng riêng", shr: "sổ hồng riêng", "so rieng": "sổ hồng riêng", "so hong": "sổ hồng", "so do": "sổ đỏ" };
    delta.phap_ly = PL_MUA[plMua[1]] ?? "pháp lý rõ ràng";
  }
  // FR-228 d: "cần tư vấn vay" chỉ nhận khi câu khách nói tới vay / ngân hàng, hoặc khách đang trả lời câu hỏi vay của em.
  if (delta.can_vay != null) {
    const botHoiVay = /\bvay\b/.test(boDau(botMsgs.at(-1)?.body ?? ""));
    if (!/\b(?:vay|ngan hang|tra gop|goi vay|ho tro tai chinh)\b/.test(tKD) && !botHoiVay) delete delta.can_vay;
  }
  // Ghi chú chỉ nói lại chuyện sổ (model chép lại từ lịch sử ở lượt sau) → bỏ khi hồ sơ đã có pháp lý.
  {
    const nkd = typeof delta.notes === "string" ? boDau(delta.notes) : "";
    if (nkd && (delta.phap_ly || prefs.phap_ly) && /\b(?:so|phap ly|shr)\b/.test(nkd) && nkd.split(/\s+/).length <= 6) delete delta.notes;
  }
  // 23/09/2026: "em đang tìm mua căn hộ hoặc nhà nhỏ q5" — model bỏ trống loại hình. Câu nói rõ thì ghi.
  if (delta.property_type == null && (prefs.property_type == null || prefs.property_type === "")) {
    const muaCanHo = /\b(?:can ho|chung cu)\b/.test(tKD);
    const muaNha = /\bnha\s+(?:pho|hem|rieng|nho|mat tien|o|dat)\b/.test(tKD);
    if (muaCanHo) delta.property_type = muaNha ? "căn hộ hoặc nhà" : "căn hộ";
  }
  // 11/09: điều kiện gần tiện ích (regex, tien-ich.ts) — lưu cả nhãn đọc được
  // lẫn bản có cấu trúc để lượt sau lọc kho mà không cần khách nói lại.
  if (ganMoi) {
    delta.gan_tien_ich = nhanGan(ganMoi);
    delta.gan_tien_ich_loc = ganMoi;
  } else if (boGan) {
    // "thôi khỏi cần gần trường nữa" — gỡ hẳn, lượt sau không lọc theo nó.
    delta.gan_tien_ich = null;
    delta.gan_tien_ich_loc = null;
  }
  // FR-181: tên trợ lý của khách mua nằm trong hồ sơ (`preferences.ten_tro_ly`),
  // ghi một lần, đi chung RPC gộp hồ sơ — không thêm vòng DB nào.
  if (prefs.ten_tro_ly !== tenBot) delta.ten_tro_ly = tenBot; // SRS-5.1zzzzzzz9: kho tên đổi thì ghi lại
  if (xhMuaMoi && xhMuaMoi !== prefs.xung_ho) delta.xung_ho = xhMuaMoi;
  if (nhanMuon.length) delta.nhan = nhanLoc;
  // ─── HẬU KỲ: mọi việc ghi sổ sau khi đã có câu trả lời trong tay chạy SONG
  // SONG (FR-171 h). Trước bản này chúng nối đuôi nhau: ~8-12 vòng đi về DB
  // thành ~8-12 lần thời gian mạng, trong khi chẳng việc nào cần kết quả của
  // việc kia. Mỗi việc là một closure tự đủ; việc nào hỏng thì hỏng một mình
  // và đã có ghiLoi/lưới riêng bên trong. Thứ tự duy nhất phải giữ: tin KHÁCH
  // đã vào sổ từ đầu lượt, nên loạt bong bóng bot chèn ở đây luôn đứng sau.
  // FR-105: mọi bong bóng gửi NGƯỜI MUA qua bộ lọc liên hệ — model được dặn
  // không đưa số, nhưng dặn không phải là chặn.
  // 22/09/2026: khách mua là chú/cô/bác (hoặc "chào cháu" chưa rõ) → bot xưng cháu, cùng luật nhánh bán.
  if (luatDuMua) { const rHt = boCauNoiHeThong(out.replies); if (rHt.length) out.replies = rHt; } mocMua("boCauNoiHeThong"); // SRS-5.1zi — bỏ hết thì giữ bản cũ
  const truocHauKy = out.replies;
  const replies = doiTuXung(out.replies.map((r) => { const t = r.split(TEN_GIU_CHO).join(tenBot); return locLienHeBot((luatDuMua ? suaTuXungMua(t) : t).trim()); }).filter(Boolean), goiMua, prefs.nhom_tuoi === "lon_tuoi" ? "lon_tuoi" : null);
  apVan(soVan, "locLienHeBot+suaTuXungMua+doiTuXung", truocHauKy, replies);
  danhDau("mua_truoc_hau_ky");
  // FR-32: mã trong câu trả lời, không có thì lấy mã khách vừa nhắc (bot hay
  // gọi căn bằng tên đường thay vì lặp lại mã)
  const repliedCodes = [...replies.join("\n").matchAll(CODE_RE)]
    .map((m) => m[1].toUpperCase());
  const repliedCode = repliedCodes[0] ?? mentioned[0];
  // 23/09/2026 (bắn thật): model viết "#BDS-NP-Q5-0004 · Hùng Vương …" cho khách mua — FR-178 (a) cấm. Mã đã đọc
  // ở trên cho quan tâm / theo dõi / ảnh; giờ mới gỡ khỏi chữ gửi khách (thay bằng tên đường của căn nếu có).
  {
    const nhanCan: Record<string, string> = {};
    for (const l of [...((listings ?? []) as CanRow[]), ...((askedListings ?? []) as CanRow[])]) {
      const ten = tenDuong(l.location_raw ?? "") || l.ward || "";
      if (l.code && ten) nhanCan[l.code.toUpperCase()] = ten;
    }
    const truocMa = [...replies];
    replies.splice(0, replies.length, ...boMaTinKhach(replies, nhanCan).map(boGachDai));
    apVan(soVan, "boMaTinKhach+boGachDai", truocMa, replies);
  }
  let photos: string[] = [];

  // Hồ sơ: FR-163 trộn bằng `||` phía DB (merge_buyer_prefs) thay vì ghi đè cả
  // object {...prefs, ...delta} — bản ghi-đè là đọc-trộn-ghi kinh điển: hai
  // lượt gối nhau là lượt sau chôn mất delta lượt trước bằng prefs cũ.
  const viecHoSo = async () => {
    if (Object.keys(delta).length > 0) {
      const { error: prefErr } = await client
        .rpc("merge_buyer_prefs", { p_buyer_id: buyer.id, p_delta: delta });
      if (prefErr) await ghiLoi(client, "chat-reply merge_buyer_prefs", prefErr.message);
    }
    if (out.profile.name && !buyer.name) {
      await client.from("buyers").update({ name: out.profile.name }).eq("id", buyer.id);
    }
  };

  // Bot bí / khách đòi người thật → gắn cờ (FR-135) + BÁO NGAY cho CTV đang
  // chăm đơn (FR-147). Quá 30 phút chưa ai đụng tay thì nudge leo tiếp lên
  // admin. Chống báo lặp: đã có escalation pending cho khách này thì thôi.
  // FR-79 (v48): đòi gọi điện là một việc VOICE riêng — note mở đầu "VOICE: "
  // để tầng DB nhặt gửi email [VOICE] (SRS-5.5); chống lặp theo đúng tiền tố
  // trong 24h, không dính vào việc 🙋 thường (một khách có thể có cả hai).
  const viecNguoiThat = async () => {
    if (!out.need_human) return;
    // ĐUA: bản trước ĐẾM việc escalation đang chờ rồi mới GHI. Hai tin "cho anh
    // gặp người thật" liền nhau → hai lượt cùng đếm 0 → CTV nhận hai việc cho
    // một khách. Đã dựng lại được trong e2e (ĐUA-4) trước khi vá: 2 việc.
    //
    // KHÔNG vá được bằng chỉ mục duy nhất — luật ở đây là "24 GIỜ TRƯỢT"
    // (nhánh VOICE) và "còn pending" (nhánh thường), mà cửa sổ trượt thì
    // `create unique index` không phát biểu nổi. Còn khoá
    // `unique (buyer_id) where kind='escalation' and status='pending'` thì SAI
    // HẲN: khách đang có việc "cần người thật" mà chốt kèo là `viecChot` bị DB
    // từ chối, CTV không được báo về một giao dịch đã chốt.
    // Nên đẩy nguyên hai điều kiện lọc đó xuống `mo_viec_can_nguoi_that`
    // (20260905h) — khoá tư vấn theo từng khách, luật giữ nguyên từng chữ.
    // Zalo ID che còn 4 số cuối, và tin cuối đi qua `locLienHe` — y như hai chỗ
    // khác trong file này (1204, 1515). Bản cũ ghi NGUYÊN Zalo ID và nguyên văn
    // câu khách vào `note`, mà `note` chảy thẳng ra `escalation-feed` rồi ra
    // email [VOICE]; đúng ngữ cảnh này (khách xin gọi điện) câu đó thường chứa
    // số điện thoại của chính họ (review 10/09, mục A4).
    const uidChe = `Zalo …${externalUserId.slice(-4)}`;
    const tinCuoi = locLienHe(text.slice(0, 120), true);
    const note = muonGoi
      ? `VOICE: ${uidChe} muốn gọi điện${buyer.name ? ` (${buyer.name})` : ""}. Tin cuối: "${tinCuoi}". Anh/chị gọi lại giúp em`
      : `🙋 khách cần người thật${buyer.name ? ` (${buyer.name})` : ""}. Tin cuối: "${tinCuoi}"`;
    const [, { error: nhErr }] = await Promise.all([
      client.from("conversations")
        .update({ needs_human: true, needs_human_at: new Date().toISOString() })
        .eq("id", convId),
      client.rpc("mo_viec_can_nguoi_that", {
        p_buyer_id: buyer.id,
        p_ctv_id: convRow.ctv_id ?? null,
        p_note: note,
        p_voice: muonGoi,
      }),
    ]);
    if (nhErr) await ghiLoi(client, "chat-reply escalation(buyer)", nhErr.message);
  };

  // FR-228 d (chủ dự án 25/09/2026: vay ngân hàng "Ghi nhận, chuyển CTV"): khách vừa nói CẦN tư vấn vay → mở việc cho
  // CTV / người phụ trách qua cùng đường "cần người thật". Bot không tự tư vấn lãi suất, hạn mức.
  const viecVay = async () => {
    if (delta.can_vay !== true || prefs.can_vay === true) return;
    const { error: vayErr } = await client.rpc("mo_viec_can_nguoi_that", {
      p_buyer_id: buyer.id,
      p_ctv_id: convRow.ctv_id ?? null,
      p_note: `💰 khách cần tư vấn vay ngân hàng${buyer.name ? ` (${buyer.name})` : ""} - Zalo …${externalUserId.slice(-4)}`,
      p_voice: false,
    });
    if (vayErr) await ghiLoi(client, "chat-reply escalation(vay)", vayErr.message);
  };

  // FR-65 (v48): chấm sao sau buổi xem → RPC `ghi_danh_gia` (tầng DB, cùng
  // ngày do agent SQL tạo). Chưa có hàm thì lỗi vào sổ, khách vẫn được cảm ơn.
  const viecDanhGia = async () => {
    if (!danhGia) return;
    const { error: dgErr } = await client.rpc("ghi_danh_gia", {
      p_buyer_id: buyer.id, p_listing_id: danhGia.listing_id,
      p_stars: danhGia.stars, p_note: text.slice(0, 300),
    });
    if (dgErr) await ghiLoi(client, "chat-reply ghi_danh_gia", dgErr.message);
  };

  // FR-140: bot hứa "để em hỏi lại chủ nhà" → tạo info_request; trigger DB
  // định tuyến: chính chủ có Zalo → CTV còn liên lạc được → admin phụ trách
  // (kèm reminder escalation để nudge/bridge đi báo ngay).
  const viecHoiChu = async () => {
    if (!out.ask_owner?.question) return;
    const aoCode = maTinSach(out.ask_owner.listing_code ?? mentioned[0]);
    if (!aoCode) return;
    // .limit(1): một mã có thể khớp cả `code` của tin này lẫn `legacy_code` của
    // tin khác; maybeSingle() gặp 2 dòng là PGRST116 và cũng rơi về "không thấy".
    const { data: aoLst } = await client.from("listings").select("id")
      .or(`code.ilike.${aoCode},legacy_code.ilike.${aoCode}`).limit(1).maybeSingle();
    if (!aoLst) return;
    // chống hỏi trùng: đã có yêu cầu pending của KHÁCH NÀY cho căn này trong 24h thì thôi.
    // 23/09/2026 (bắn lại sau deploy #193): bản cũ chống trùng theo CĂN — khách A hỏi hướng, khách B hỏi giá
    // bớt cùng căn → câu của B bị nuốt, B không bao giờ nhận câu trả lời dù bot đã hứa "em hỏi lại chủ".
    const { data: aoCu, error: aoCuErr } = await client.from("info_requests")
      .select("id, question")
      .eq("listing_id", aoLst.id).eq("buyer_id", buyer.id).eq("status", "pending").eq("source", "buyer_ask")
      .gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString()).limit(1).maybeSingle();
    if (aoCuErr) await ghiLoi(client, "chat-reply hoi chu nha(doc cu)", aoCuErr.message);
    // 23/09/2026 (bắn lại sau deploy #194): cùng khách đã chờ "hướng nhà", nay hỏi thêm "quy hoạch" → bản trên
    // bỏ câu mới dù bot đã hứa hỏi. Câu CHƯA có trong việc đang chờ thì NỐI vào việc đó (chủ nhà đọc một tin).
    const aoCau = out.ask_owner.question.trim();
    if (aoCu && !boDau(String(aoCu.question ?? "")).includes(boDau(aoCau))) {
      const { error: aoNoiErr } = await client.from("info_requests")
        .update({ question: `${aoCu.question}; ${aoCau}`.slice(0, 500) }).eq("id", aoCu.id);
      if (aoNoiErr) await ghiLoi(client, "chat-reply hoi chu nha(noi cau)", aoNoiErr.message);
    }
    if (!aoCu && !aoCuErr) {
      // FR-140: câu khách hỏi chủ nhà. Hai khách cùng hỏi một câu về một căn
      // là chuyện thường — 23505 nghĩa là câu đó đang chờ chủ nhà trả lời rồi,
      // trả lời về sẽ tới cả hai khách. Không hỏi chồng.
      const { error: aoErr } = await client.from("info_requests").insert({
        listing_id: aoLst.id, buyer_id: buyer.id,
        question: out.ask_owner.question, status: "pending", source: "buyer_ask",
      });
      if (aoErr && aoErr.code !== "23505") {
        await ghiLoi(client, "chat-reply hoi chu nha", aoErr.message);
      }
    }
  };

  // Khách hứa gửi gì đó → đặt hẹn nhắc (FR-133)
  const viecLoiHua = async () => {
    if (!(out.promise?.when && out.promise?.what)) return;
    await client.from("reminders").insert({
      kind: "promise", buyer_id: buyer.id,
      due_at: mapDue(out.promise.when), note: `${out.promise.what} (hẹn: ${out.promise.when})`,
    });
  };

  // Khách chốt lịch xem nhà (UF-06 / FR-50…53) → ghi viewings + nhắc trước giờ.
  // Khách bổ sung SĐT / đổi giờ ở lượt sau là CẬP NHẬT lịch pending đang có,
  // không tạo lịch trùng (từng tạo 2 dòng cho 1 cuộc hẹn).
  const viecLichXem = async () => {
    if (!out.viewing?.when) return;
    // Soát 01/09 (vai người mua đã nhắm căn): mã do model điền chép theo cách
    // khách gõ — "bds-q5-0115" thường — mà kho lưu HOA và `.eq` phân biệt hoa
    // thường. Mọi cửa khác (ask_owner, agreed_deal, send_photos) đều `toUpperCase`
    // rồi, riêng cửa này thì không: lịch xem ghi thiếu `listing_id`, và lượt sau
    // khách bổ sung SĐT với mã viết hoa thì so sánh lệch → tạo lịch THỨ HAI, đúng
    // cái lỗi khối này từng được sửa để tránh.
    const vwCode = maTinSach(out.viewing.listing_code) || null;
    const slot = mapDue(out.viewing.when);
    const slotMs = Date.parse(slot);
    // Tra mã căn và lịch đang chờ cùng lúc — hai câu không nhìn nhau.
    const [{ data: lst }, { data: existVw }] = await Promise.all([
      vwCode
        ? client.from("listings").select("id").or(`code.ilike.${vwCode},legacy_code.ilike.${vwCode}`).limit(1).maybeSingle()
        : Promise.resolve({ data: null as { id: string } | null }),
      client.from("viewings")
        .select("id, listing_code")
        .eq("buyer_id", buyer.id).eq("status", "pending")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const listingId: string | null = lst?.id ?? null;
    const sameAppt = existVw &&
      (!vwCode || !existVw.listing_code ||
        String(existVw.listing_code).toUpperCase() === vwCode);
    let vwId: string | null = null;
    if (existVw && sameAppt) {
      const patch: Record<string, unknown> = { time_text: out.viewing.when, slot };
      if (out.viewing.phone) patch.phone = out.viewing.phone;
      if (vwCode && !existVw.listing_code) {
        patch.listing_code = vwCode;
        patch.listing_id = listingId;
      }
      vwId = existVw.id;
      await Promise.all([
        client.from("viewings").update(patch).eq("id", existVw.id),
        // dời giờ nhắc theo slot mới
        client.from("reminders")
          .update({ due_at: new Date(slotMs - 45 * 60e3).toISOString() })
          .eq("viewing_id", vwId).eq("kind", "viewing").eq("status", "pending"),
      ]);
    } else {
      // ĐUA: `existVw` đọc ở trên rồi mới ghi ở đây. Hai tin "mai 9h anh qua
      // xem nha" liền nhau → hai lượt cùng thấy "chưa có" → hai buổi xem cho
      // MỘT cuộc hẹn, rồi mỗi buổi đẻ một nhắc, khách bị nhắc hai lần.
      // `viewings_mot_hen_cho_moi_can_idx` chặn cú thứ hai; lượt thua đọc lại
      // dòng của lượt thắng để vẫn có `vwId` mà gắn nhắc — nếu bỏ trống thì
      // cuộc hẹn có mà không ai nhắc, tệ hơn cả trước khi vá.
      const { data: vw, error: vwErr } = await client.from("viewings").insert({
        buyer_id: buyer.id, listing_id: listingId,
        listing_code: vwCode, time_text: out.viewing.when,
        slot, phone: out.viewing.phone ?? null, status: "pending", source: "bot",
      }).select("id").maybeSingle();
      if (vwErr?.code === "23505") {
        const { data: lai } = await client.from("viewings")
          .select("id").eq("buyer_id", buyer.id).eq("status", "pending")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        vwId = lai?.id ?? null;
      } else if (vwErr) {
        await ghiLoi(client, "chat-reply ghi viewing", vwErr.message);
        vwId = null;
      } else {
        vwId = vw?.id ?? null;
      }
    }
    // Nhắc trước buổi xem ~45 phút (mẫu §6.8); lịch quá gần hoặc đã có nhắc thì thôi
    if (vwId && slotMs - Date.now() > 90 * 60e3) {
      const { count: remCnt } = await client.from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("viewing_id", vwId).eq("status", "pending");
      if ((remCnt ?? 0) === 0) {
        // Cùng kiểu đua với `viewings` ngay trên. 23505 nghĩa là lượt kia đã
        // đặt nhắc cho đúng buổi xem này — im lặng bỏ qua là ĐÚNG, mọi mã lỗi
        // khác thì phải vào sổ (FR-152 d).
        const { error: rmErr } = await client.from("reminders").insert({
          kind: "viewing", buyer_id: buyer.id, viewing_id: vwId,
          due_at: new Date(slotMs - 45 * 60e3).toISOString(),
          note: `lịch xem ${vwCode ? "#" + vwCode : "nhà"} lúc ${out.viewing.when}`,
        });
        if (rmErr && rmErr.code !== "23505") {
          await ghiLoi(client, "chat-reply nhac buoi xem", rmErr.message);
        }
      }
    }
  };

  // Loạt bong bóng bot vào sổ bằng MỘT câu INSERT (`seq` identity tăng theo
  // thứ tự mảng). Ghi hụt phải vào bot_errors (FR-152), không chặn trả lời.
  let nhuongTruocGui = false;
  const viecGhiTraLoi = async () => {
    if (!replies.length) return;
    // SRS-5.1zzzzzq: kiểm lại tin mới hơn NGAY TRƯỚC KHI ghi lời bot — xem chú thích ở `kiemTinMoiHon`.
    if (kiemTinMoiHon) {
      try {
        if (await kiemTinMoiHon()) { nhuongTruocGui = true; console.log("chat-reply: tin khách mới hơn tới trước khi gửi → nhường lượt"); return; }
      } catch (e) { await ghiLoi(client, "chat-reply kiem tin moi hon", e); }
    }
    const { error: botErr } = await client.from("messages").insert(
      replies.map((r) => ({ conversation_id: convId, sender: "bot", body: r })),
    );
    if (botErr) await ghiLoi(client, "chat-reply messages bot(buyer)", botErr.message);
    // SRS-5.1zzn: sổ van — MỘT câu insert, chỉ khi có van đổi lời.
    if (soVan.ds.length) {
      const { error: vkErr } = await client.from("van_kich").insert(soVan.ds.map((d) => ({ conversation_id: convId, nhanh: soVan.nhanh, ...d })));
      if (vkErr) await ghiLoi(client, "chat-reply van_kich(buyer)", vkErr.message);
    }
  };

  // FR-139: khách hỏi / bot đưa căn nào ra → đánh dấu "đang được quan tâm"
  // (7 ngày không ai hỏi nữa thì cron tự trả về đang bán)
  // FR-108 (v48): ghi luôn KHÁCH NÀO quan tâm (bảng `interests`) qua overload
  // `mark_listing_interest(p_codes, p_buyer_id)` (migration 20260904f của
  // agent SQL) — để lúc tin chốt còn biết báo ai. Căn khách xin hình / nhờ hỏi
  // chủ cũng là quan tâm. Overload chưa có (PGRST202) thì rơi về bản cũ chỉ
  // đổi trạng thái + ghi sổ, không được câm FR-139.
  const interestCodes = [...new Set([
    ...mentioned, ...repliedCodes,
    ...(out.send_photos ? [out.send_photos.toUpperCase()] : []),
    ...(out.ask_owner?.listing_code ? [out.ask_owner.listing_code.toUpperCase()] : []),
  ])];
  const viecQuanTam = async () => {
    if (!interestCodes.length) return;
    const { error: miErr } = await client.rpc("mark_listing_interest", {
      p_codes: interestCodes, p_buyer_id: buyer.id,
    });
    if (miErr) {
      await ghiLoi(client, "chat-reply mark_listing_interest(buyer)", miErr.message);
      await client.rpc("mark_listing_interest", { p_codes: interestCodes });
    }
  };

  // FR-142: khách ĐỒNG Ý chốt (chữ / emoji vui / like-tim theo AGREE_RULES) →
  // ghi deals + listing sang da_chot + báo gấp CTV/admin qua kênh escalation.
  const viecChot = async () => {
    if (!out.agreed_deal) return;
    const dealCode = maTinSach(out.agreed_deal.listing_code ?? mentioned[0] ?? repliedCode);
    if (!dealCode) return;
    // 15/09/2026: `sellers(...)` trần trên `listings` là PGRST201 (hai quan hệ, xem
    // ask-seller) — bản trước không đọc `error` nên khách "ok chốt" mà kèo KHÔNG
    // bao giờ vào `deals`, im lặng.
    const { data: dl, error: dlErr } = await client.from("listings")
      .select("id, price_vnd, seller_id, sellers!listings_seller_id_fkey(seller_type)")
      .or(`code.ilike.${dealCode},legacy_code.ilike.${dealCode}`).limit(1).maybeSingle();
    if (dlErr) await ghiLoi(client, "chat-reply chot keo doc listing", dlErr.message);
    if (!dl) return;
    const { count: dupDeal } = await client.from("deals")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", dl.id).eq("buyer_id", buyer.id);
    if ((dupDeal ?? 0) > 0) return;
    const sType = (dl.sellers as { seller_type?: string } | null)?.seller_type;
    // ĐUA: `count` ở trên đọc "chưa có" rồi mới ghi — hai tin "ok chốt nha" cách
    // nhau vài trăm ms là hai lượt cùng đọc 0. `deals_listing_buyer_key` chặn
    // được cú ghi thứ hai, nhưng bản trước KHÔNG đọc `error` nên lượt thua
    // tưởng mình ghi xong và vẫn chạy tiếp khối dưới: CTV nhận HAI tin "khách
    // vừa ĐỒNG Ý CHỐT, liên hệ gấp" cho cùng một kèo. Ràng buộc đã có sẵn, chỗ
    // hỏng nằm ở đây — đọc lỗi rồi dừng.
    const { error: dealErr } = await client.from("deals").insert({
      listing_id: dl.id, buyer_id: buyer.id,
      ctv_id: convRow.ctv_id,
      price_vnd: dl.price_vnd ?? null,
      // Chỉ hai loại có mức phí (BR-05: chính chủ 1%, môi giới 0,5%).
      // `unknown` — người bán mở từ chat (FR-159) chưa được phân loại —
      // phải để null chứ không được đổ về 0,5%: bản cũ `sType ? 0.5` coi
      // mọi giá trị khác `ccrb` là môi giới, tức chính chủ vào qua chat mà
      // chốt kèo trước khi phân loại là bị tính phí SAI một nửa. Xem OPEN-28.
      fee_pct: sType === "ccrb" ? 1.0 : sType === "nmg" ? 0.5 : null,
      closed_at: new Date().toISOString(),
    });
    if (dealErr) {
      // 23505 = lượt kia vừa ghi xong đúng kèo này. Không phải sự cố, nhưng
      // cũng KHÔNG được đi tiếp — đi tiếp là báo gấp lần hai.
      if (dealErr.code !== "23505") await ghiLoi(client, "chat-reply ghi deal", dealErr.message);
      return;
    }
    await Promise.all([
      client.from("listings").update({ status: "da_chot" }).eq("id", dl.id),
      client.from("reminders").insert({
        kind: "escalation", listing_id: dl.id, buyer_id: buyer.id,
        ctv_id: convRow.ctv_id, due_at: new Date().toISOString(),
        note: `🤝 khách vừa ĐỒNG Ý CHỐT căn #${dealCode}. Liên hệ làm hợp đồng gấp`,
      }),
    ]);
  };

  // FR-143: gửi hình thật kèm tin — nguồn là URL chính chủ đã gửi (facts
  // hinh_anh). Model điền send_photos; khách xin hình mà model quên thì vẫn
  // tự đính kèm theo mã khách nhắc.
  // "hinh" không dấu thêm vào (FR-161); "anh" trần thì KHÔNG — đó là đại từ,
  // thêm vào là mọi câu có chữ "anh" đều bị coi là xin ảnh.
  // FR-27 (v48): mỗi lượt ≤4 tấm; còn dư thì nhớ offset vào
  // `preferences.photo_offset` và câu trả lời kết bằng "xem thêm hình không
  // ạ?"; lượt sau "xem thêm" → gửi 4 tấm kế từ offset. Hết thì xoá offset.
  let conHinh = false;
  const KHACH_XIN_HINH_RE = /hình|ảnh|\bhinh\b|hinh anh|photo|\bpic\b/i;
  // SRS-5.1zg (đợt 3 bỏ từ khoá): khách xin hình — model đọc theo nghĩa (`xin_hinh`, cụm trích phải có trong tin khách);
  // từ khoá chỉ khi model không trả ô này (trợ lý có công cụ, Groq cũ).
  const khachXinHinhLuot = out!.xin_hinh !== undefined
    ? !!out!.xin_hinh && trichCoTrongTin(out!.xin_hinh, text)
    : KHACH_XIN_HINH_RE.test(text); // lưới đỡ
  let canXinHinh: string | null = null;
  const viecAnh = async () => {
    const photoWanted = out!.send_photos ??
      (xemThemHinh
        ? offsetCu!.code!
        : khachXinHinhLuot ? (mentioned[0] ?? repliedCode ?? canDangNoi?.code ?? null)
        // 23/09/2026: model hứa "em gửi hình liền" mà quên send_photos → đính kèm ảnh của căn đang nói (nếu có).
        : replies.some(laHuaGuiHinh) ? (repliedCode ?? canDangNoi?.code ?? null) : null);
    if (!photoWanted) return;
    canXinHinh = photoWanted;
    const pCode = photoWanted.toUpperCase();
    const inAsked = ((askedListings ?? []) as Asked[]).find((l) => l.code === pCode);
    let tatCa: string[];
    // Nhu cầu ảnh cụ thể của người mua đa dạng theo 5 loại BĐS:
    // - Nhà phố/CHDV: bếp, phòng ngủ, toilet, hẻm, sân thượng, mặt tiền, cầu thang, thang máy, PCCC
    // - Chung cư: view ban công, phòng khách, bếp, tiện ích nội khu (hồ bơi, công viên, sảnh)
    // - Đất nền: ranh đất/cọc mốc, đường trước đất, sơ đồ phân lô, bản đồ quy hoạch
    // - Kho xưởng: xưởng sản xuất, trạm điện 3 pha, đường xe container/bãi xe, văn phòng điều hành, PCCC
    // - Mặt bằng: mặt tiền kinh doanh, vỉa hè/chỗ để xe, lối đi riêng
    const textBuyer = String(text || "").toLowerCase();
    const loaiYeuCau = textBuyer.includes("bếp") || textBuyer.includes("bep") ? "bep"
      : textBuyer.includes("phòng ngủ") || textBuyer.includes("phong ngu") || textBuyer.includes("pn") ? "phong_ngu"
      : textBuyer.includes("mặt tiền") || textBuyer.includes("mat tien") || textBuyer.includes("cổng") || textBuyer.includes("vỉa hè") || textBuyer.includes("via he") ? "mat_tien"
      : textBuyer.includes("hẻm") || textBuyer.includes("hem") || textBuyer.includes("đường trước") || textBuyer.includes("container") || textBuyer.includes("xe tải") ? "hem"
      : textBuyer.includes("nhà vệ sinh") || textBuyer.includes("toilet") || textBuyer.includes("wc") ? "wc"
      : textBuyer.includes("view") || textBuyer.includes("ban công") || textBuyer.includes("cảnh") ? "view"
      : textBuyer.includes("sân thượng") || textBuyer.includes("san thuong") || textBuyer.includes("sân vườn") ? "san_thuong"
      : textBuyer.includes("phòng khách") || textBuyer.includes("trong nhà") || textBuyer.includes("xưởng") || textBuyer.includes("kho") || textBuyer.includes("mặt bằng") ? "trong_nha"
      : textBuyer.includes("sơ đồ") || textBuyer.includes("bản vẽ") || textBuyer.includes("mặt bằng tầng") || textBuyer.includes("phân lô") || textBuyer.includes("quy hoạch") ? "ban_ve"
      : null;

    if (inAsked) tatCa = photosOf(inAsked);
    else {
      // Cùng ranh giới với khối askedListings: `listing_photos_v` tự lọc tin đã lên kệ.
      // Khi khách hỏi cụ thể (ảnh bếp, ảnh mặt tiền...), truy vấn listing_media lọc đúng media_type trước!
      let pStoreUrls: string[] = [];
      if (loaiYeuCau) {
        const { data: pTheoLoai } = await client.from("listing_media")
          .select("storage_path, bucket, listings!inner(code, status)")
          .eq("listings.code", pCode)
          .eq("media_type", loaiYeuCau)
          .eq("bucket", "listing-public")
          .in("listings.status", ["dang_ban", "dang_quan_tam", "da_chot"])
          .limit(10);
        if (pTheoLoai && pTheoLoai.length) {
          const { data: baseCfg } = await client.rpc("cau_hinh", { p_key: "storage_public_base_url" });
          const baseUrl = (typeof baseCfg === "string" && baseCfg.trim()) ? baseCfg.trim().replace(/\/+$/, "") : `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public`;
          pStoreUrls = pTheoLoai.map((m) => `${baseUrl}/${m.bucket}/${m.storage_path}`);
        }
      }

      const [{ data: pStore }, { data: pFacts }] = await Promise.all([
        pStoreUrls.length ? Promise.resolve({ data: [] }) : client.from("listing_photos_v").select("url").eq("code", pCode).limit(24),
        client.from("listing_facts")
          .select("answer, listings!inner(code, status)")
          .eq("question", "hinh_anh").eq("listings.code", pCode)
          .in("listings.status", ["dang_ban", "dang_quan_tam", "da_chot"]).limit(8),
      ]);
      tatCa = [
        ...pStoreUrls,
        ...(pStore ?? []).map((p) => p.url as string),
        ...(pFacts ?? []).flatMap((f) => (f.answer as string).match(PHOTO_URL_RE) ?? []),
      ];
    }
    const bd = offsetCu?.code === pCode ? (offsetCu.n ?? 0) : 0;
    photos = tatCa.slice(bd, bd + 4);
    conHinh = tatCa.length - bd - photos.length > 0;
    if (conHinh) delta.photo_offset = { code: pCode, n: bd + photos.length };
    else if (offsetCu) delta.photo_offset = null;
  };
  // Ảnh tính TRƯỚC hậu kỳ (một vòng thêm chỉ khi khách xin hình): câu "xem
  // thêm hình không ạ?" phải vào bong bóng cuối trước khi ghi sổ, và offset
  // phải nằm trong `delta` trước khi `viecHoSo` gộp hồ sơ.
  await viecAnh();
  // SRS-5.1zg (chủ dự án 02/10: "hình căn đó ko có thì hỏi lại người mua là đúng luồng"): khách xin hình mà không biết căn nào
  // (không mã, không căn đang nói) → hỏi lại căn nào, không hứa suông.
  if (khachXinHinhLuot && !canXinHinh && !photos.length) {
    const hoiCan = doiTuXung([`Dạ anh/chị đang nói căn nào ạ? Anh/chị nhắn giúp em tên đường hoặc mã căn (trên web), em tìm hình căn đó cho ${cachGoiKhach(goiMua, prefs.nhom_tuoi)} nha.`], goiMua, prefs.nhom_tuoi === "lon_tuoi" ? "lon_tuoi" : null)[0];
    const bo = chanHuaGuiHinh(replies, null).filter((r) => !/căn nào/i.test(r));
    replies.splice(0, replies.length, ...bo, hoiCan);
    console.log("chat-reply: khách xin hình, chưa rõ căn → hỏi lại căn nào");
  }
  // SRS-5.1zg (chủ dự án 02/10: "gần tiện ích nào thì xem trên gg đi" → "dùng gửi link trước đi"): khách hỏi tiện ích quanh →
  // giữ câu trả lời từ kho / OSM, kèm link Google Maps tìm sẵn. Chỗ tìm: nơi khách nói (có trong lời khách), không thì căn
  // đang nói (tên đường + phường + quận, KHÔNG số nhà), không thì khu vực trong hồ sơ. Không biết chỗ nào thì không gửi link.
  {
    const h = out!.hoi_tien_ich ?? tienIchCongCu;
    const loai = (h?.loai ?? "").trim().slice(0, 40);
    if (loai && !replies.some((r) => r.includes("google.com/maps"))) {
      const ma = (canDangNoi?.code ?? repliedCode ?? "").toUpperCase();
      const can = ma ? [...((askedListings ?? []) as CanRow[]), ...((listings ?? []) as CanRow[])].find((l) => l.code?.toUpperCase() === ma) : null;
      const khuCan = can ? [...new Set([can.location_raw ? tenDuong(can.location_raw) : "", can.ward ?? "", can.district ?? ""].filter(Boolean))].join(", ") : "";
      const khuKhach = h?.khu_vuc && trichCoTrongTin(h.khu_vuc, loiKhachMua) ? h.khu_vuc.trim() : "";
      const khu = (khuKhach || khuCan || (typeof prefs.area === "string" ? prefs.area : "")).slice(0, 80);
      if (khu) {
        const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loai} gần ${khu}`)}`;
        replies.push(doiTuXung([`Anh/chị xem thêm ${loai} quanh ${khu} trên Google Maps nha: ${link}`], goiMua, prefs.nhom_tuoi === "lon_tuoi" ? "lon_tuoi" : null)[0]);
        console.log("chat-reply: khách hỏi tiện ích → kèm link Google Maps", loai);
      }
    }
  }
  // 23/09/2026 (bắn 26 tin): tin 0 ảnh, bot vẫn "Em gửi hình liền đây :)". Không có tấm nào để gửi → nói thật.
  if (!photos.length && replies.some(laHuaGuiHinh)) {
    // 30/09/2026: khách không xin hình thì chỉ bỏ câu hứa (xem chanHuaGuiHinh).
    // SRS-5.1zzzl (08/10, bắn thử …kb5mua): (a) "hẻm xe hơi" — model TỰ điền `send_photos` cho căn 0 ảnh → code coi là khách xin,
    // chen "Căn này chủ nhà chưa gửi hình" vào câu khách không hỏi. Ô hành động của model không phải bằng chứng ý KHÁCH. (b) "xem
    // hình được không" — model quên `xin_hinh`, chỉ trả "Dạ em gửi hình liền đây ạ." → bỏ câu hứa là hết lời, khách nhận tin RỖNG.
    // Câu hứa là cả lời đáp thì lời thật thay vào chỗ nó, không để im.
    const conLai = chanHuaGuiHinh(replies, null).filter((r) => r.trim());
    const khachXinHinh = !!xemThemHinh || khachXinHinhLuot || conLai.length === 0;
    const loiHinh = khachXinHinh
      ? doiTuXung([`Căn này chủ nhà chưa gửi hình ạ, ${cachGoiKhach(goiMua, prefs.nhom_tuoi)} muốn xem thì em hẹn đi xem trực tiếp nha.`], goiMua, prefs.nhom_tuoi === "lon_tuoi" ? "lon_tuoi" : null)[0]
      : null;
    replies.splice(0, replies.length, ...chanHuaGuiHinh(replies, loiHinh));
    console.log("chat-reply: chặn lời hứa gửi hình (không có ảnh)");
  }
  if (conHinh && !/xem thêm|thêm hình/i.test(replies.join(" "))) {
    if (replies.length) replies[replies.length - 1] += " Anh/chị xem thêm hình không ạ?";
    else replies.push("Dạ em gửi hình nè, anh/chị xem thêm hình không ạ?");
  }

  // FR-32: lượt này có nói về một căn cụ thể mà khách KHÔNG chốt lịch → nếu
  // khách im ~2,5 tiếng thì chủ động gửi thêm thông tin căn đó (tối đa 1 lần/24h;
  // khách nhắn lại thì reminder này bị hủy ở đầu lượt sau). Đếm + tra tin +
  // chèn nằm trong MỘT hàm DB `tao_followup` (20260902d) thay cho ba vòng.
  const viecFollowup = async () => {
    if (!repliedCode || out!.viewing) return;
    const { error: fuErr } = await client.rpc("tao_followup", {
      p_buyer_id: buyer.id, p_code: repliedCode,
    });
    if (fuErr) await ghiLoi(client, "chat-reply tao_followup", fuErr.message);
  };

  // 14/09/2026 — chủ dự án: "nhắn lại cho khách liền sau tin nhắn đó đã bóc tách
  // (thật vào db) gì". Bật công tắc `bao_lai_da_luu` thì hồ sơ phải ghi XONG trước
  // (không chạy song song nữa), đọc LẠI từ DB, rồi báo đúng khoá đã đổi ở bong bóng
  // ĐẦU TIÊN. Tắt thì y như cũ: một lượt rpc đọc công tắc, hồ sơ ghi song song.
  let hoSoDaGhi = false;
  if (replies.length) {
    try {
      const { data: cdMua, error: cdMuaErr } = await client.rpc("cau_hinh", { p_key: "bao_lai_da_luu" });
      if (cdMuaErr) await ghiLoi(client, "chat-reply cau_hinh(bao_lai_da_luu, mua)", cdMuaErr.message);
      if (docCheDo(cdMua) !== "tat") {
        await viecHoSo();
        hoSoDaGhi = true;
        const { data: bSau, error: bSauErr } = await client.from("buyers")
          .select("preferences").eq("id", buyer.id).maybeSingle();
        if (bSauErr) await ghiLoi(client, "chat-reply bao_lai_da_luu(buyers)", bSauErr.message);
        const bong = vuaLuuMua(prefs, (bSau as { preferences?: Record<string, unknown> } | null)?.preferences, [...BUYER_PROFILE_FIELDS, ...Object.entries(NHAN_TU_VAN)], text);
        // Qua bộ lọc liên hệ như mọi bong bóng gửi người mua (FR-105) — ghi chú hoàn cảnh do model viết.
        if (bong) {
          // 💾 đã báo lưu gì → "Dạ chị, em ghi lại: mua nhà Quận 5 tầm 7 tỷ…" là ghi nhận lần hai.
          const conLai = boCauGhiNhan(replies);
          replies.splice(0, replies.length, locLienHe(bong), ...conLai);
        } else {
          // 24/09/2026 (chủ dự án): tin không bóc được gì cũng nói ra. SRS-5.1zzzf: trừ khi tin là câu trả lời câu hỏi vai.
          replies.unshift(dangTraLoiHoiVai && hoiMua ? traLoiCauBot(cauVaiDaHoi, "đang tìm mua / thuê, em đi hàng người mua", text) : KHONG_BOC);
        }
      }
    } catch (e) {
      await ghiLoi(client, "chat-reply bao_lai_da_luu(mua)", e);
    }
  }

  await Promise.all([
    hoSoDaGhi ? Promise.resolve() : viecHoSo(), viecNguoiThat(), viecHoiChu(), viecLoiHua(), viecLichXem(),
    viecGhiTraLoi(), viecQuanTam(), viecChot(), viecFollowup(), viecDanhGia(), viecVay(),
  ]);
  if (nhuongTruocGui) return await hoanTat({ reply: null, replies: [], superseded: true, superseded_luc: "truoc_gui", conversation_id: convId });

  return await hoanTat({
    van_kich: tenVanKich(soVan),
    reply: replies.join("\n"), replies, photos, conversation_id: convId,
    ...(conHinh ? { more_photos: true } : {}),
    ...(muonGoi ? { voice_request: true } : {}),
    ...(danhGia ? { rated: danhGia.stars } : {}),
    // SRS-5.1y: lượt trợ lý có công cụ — số vòng, công cụ đã gọi, lời gốc model, kết quả công cụ đọc (dữ liệu kho/OSM
    // công khai); rơi về đường JSON thì `vong` 0 + `ly_do`. Sổ inbound lưu payload này — `ban-thu` in ra.
    ...(troLy ? { tro_ly: troLy } : {}),
  });
};

// SRS-5.1zzzzzd: lượt mang cờ `ghi_ai: true` (chỉ khách mô phỏng gửi — bridge / OA không bao giờ có; kênh `zalo_personal_test` thì
// khách thật qua bridge cũng dùng, nên không gác theo kênh) chạy trong ngữ cảnh ghi đầu ra model (`ghi-luot-ai.ts`); xong lượt, đầu ra
// đi `ghi_ai_thu` — hàm DB tự bỏ qua ID không phải ID thử (`la_id_thu`, chỗ duy nhất giữ tiền tố). Lượt thường: không thêm truy vấn
// nào. Thân request đọc MỘT lần ở đây rồi chuyền nguyên chữ cho lượt (cửa SEC-06 vẫn ở trong). Lượt bị chặn ở cổng không gọi model
// nào → không ghi gì.
Deno.serve((req) => chayCoDoGio(() => phucVu(req)));
async function phucVu(req: Request): Promise<Response> {
  if (req.method !== "POST") return await xuLyLuot(req);
  const tho = await req.text();
  const reqLai = { method: req.method, headers: req.headers, text: async () => tho } as unknown as Request;
  let b: { external_user_id?: unknown; ghi_ai?: unknown; text?: unknown } | null = null;
  try { b = tho.length <= 128 * 1024 && tho.includes('"ghi_ai"') ? JSON.parse(tho) : null; } catch { b = null; }
  if (b?.ghi_ai !== true || !b.external_user_id) return await xuLyLuot(reqLai);
  const so: DongGhiAi[] = [];
  const res = await chayCoGhiAi(so, () => xuLyLuot(reqLai));
  if (so.length) {
    const client = serviceClient();
    const { error } = await client.rpc("ghi_ai_thu", {
      p_zalo: String(b.external_user_id).slice(0, 128), p_tin: thayLienHe(String(b.text ?? ""), "[liên hệ]").slice(0, 4000), p_luot: so,
    });
    if (error) await ghiLoi(client, "chat-reply ghi_ai_thu", error.message);
  }
  return res;
}
