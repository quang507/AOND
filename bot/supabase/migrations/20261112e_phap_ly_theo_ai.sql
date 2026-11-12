-- SRS-5.1zzzzzzz432 (lỗ hổng 6): cột pháp lý theo trạng thái giấy tờ AI đọc — cùng luật `supabase_store.ma_phap_ly_theo_ai` / `hoan_cong_theo_ai`.
-- Chép bù cho tin bot đã ghi (`boc_tach._thong_so_ai`); từ nay lõi ghi mỗi lần lưu tin. 12/11: 1FBB8897 có sổ (co_so) mà legal_status trống.
update public.listings l set legal_status = case l.boc_tach->>'_phap_ly_trang_thai'
    when 'co_so' then case when l.legal_status in ('so_hong_rieng', 'so_hong_chung', 'so_hong') then l.legal_status else 'so_hong' end
    else 'hdmb' end
 where coalesce(l.boc_tach->>'_thong_so_ai', '') = 'true'
   and l.boc_tach->>'_phap_ly_trang_thai' in ('co_so', 'hdmb')
   and l.legal_status is distinct from case l.boc_tach->>'_phap_ly_trang_thai'
    when 'co_so' then case when l.legal_status in ('so_hong_rieng', 'so_hong_chung', 'so_hong') then l.legal_status else 'so_hong' end
    else 'hdmb' end;

update public.listings l set has_completion = (l.boc_tach->>'_hoan_cong' = 'da_hoan_cong')
 where coalesce(l.boc_tach->>'_thong_so_ai', '') = 'true'
   and (l.boc_tach->>'_hoan_cong' in ('da_hoan_cong', 'chua_hoan_cong') or l.boc_tach ? '_so_chua_co_nha')
   and l.has_completion is distinct from (l.boc_tach->>'_hoan_cong' = 'da_hoan_cong');
