-- SRS-5.1zzzzzzz397 (08/11/2026): gỡ dòng "Hỗ trợ vay ngân hàng: Tối đa 70%" + "Vốn tự có tối thiểu: 30%" khỏi kho dự án.
-- Hai dòng này không lấy từ nguồn nào: scripts/crawl_moso_projects.py (bản 06/11) gắn cứng bank_support = true,
-- max_loan_ratio = 70 cho MỌI dự án (1.388/1.388 trong moso_projects_hcm.json), rồi thu-du-an-moso.mjs /
-- hop-nhat-nguon-du-an.mjs ghi vào thong_tin.thuoc_tinh của 1.111 dự án. Bot đọc thuoc_tinh như dữ kiện đã duyệt
-- nên sẽ khẳng định với khách một tỷ lệ vay không ai xác nhận.
-- Chỉ gỡ đúng cặp giá trị mặc định đó; dòng vay do người bán / admin nhập (giá trị khác) giữ nguyên.
-- Việc xoá nguồn (source / source_url / specs.moso) và gộp dự án của SRS-396 là quyết định của chủ dự án — KHÔNG khôi phục.
update public.projects
set thong_tin = jsonb_set(thong_tin, '{thuoc_tinh}',
                          (thong_tin->'thuoc_tinh') - 'Hỗ trợ vay ngân hàng' - 'Vốn tự có tối thiểu')
where thong_tin->'thuoc_tinh'->>'Hỗ trợ vay ngân hàng' = 'Tối đa 70%'
  and coalesce(thong_tin->'thuoc_tinh'->>'Vốn tự có tối thiểu', '30%') = '30%';
