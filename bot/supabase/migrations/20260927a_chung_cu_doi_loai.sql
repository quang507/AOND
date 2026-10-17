-- 20260927a — khách nói "căn chung cư" / "căn hộ" khi tin đang là NHÀ mặc định → đổi sang căn hộ (FR-230 c).
--
-- Chủ dự án test Zalo 26/09/2026: "Anh bán nhà" (tin thành nhóm nhà, FR-226 a) → "Căn chung cư ở Botanic" → bot vẫn hỏi
-- "diện tích đất trên sổ, ngang dài", "nhà xây mấy tầng", "hẻm trước nhà rộng mấy mét"; khách phải nói "Chung cư mà em".
-- Cùng chỗ với luật "cấp 4" (20260925e): câu trả lời bất kỳ nói ĐÚNG loại căn hộ mà tin là nhà phố chưa có số tầng / chưa rõ
-- → căn hộ. Không đổi khi chỉ là mốc ("gần chung cư X", "đối diện chung cư") hay phủ định ("không phải chung cư").
do $$
declare d text;
begin
  d := pg_get_functiondef('public.listing_facts_sync_cols()'::regprocedure);
  if strpos(d, $a$    update listings set property_type = 'nha_cap4' where id = new.listing_id and property_type in ('nha_pho', 'chua_ro');
  end if;
$a$) = 0 then
    raise exception 'listing_facts_sync_cols: không thấy khối cấp 4 (20260925e)';
  end if;
  execute replace(d, $a$    update listings set property_type = 'nha_cap4' where id = new.listing_id and property_type in ('nha_pho', 'chua_ro');
  end if;
$a$, $b$    update listings set property_type = 'nha_cap4' where id = new.listing_id and property_type in ('nha_pho', 'chua_ro');
  end if;
  -- 20260927a: "căn chung cư ở Botanic", "chung cư mà em", "căn hộ tầng 6" → căn hộ (tin nhà phố chưa có số tầng / chưa rõ).
  if l.property_type in ('nha_pho', 'chua_ro') and l.floors is null
     and public.bo_dau(v_txt) ~ '(^\s*|\m(can|la|ban|o|dang|co|toi|minh|anh|chi|em|chu|cua)\s+)(chung cu|can ho|cc mini|chung cu mini)\M'
     and public.bo_dau(v_txt) !~ '(gan|canh|doi dien|sat|ke|ben|view|nhin ra|cach)\s+(cac\s+)?(chung cu|can ho)'
     and public.bo_dau(v_txt) !~ '(khong|ko|chua)\s*(phai\s*)?(la\s*)?(chung cu|can ho)' then
    update listings set property_type = 'chung_cu' where id = new.listing_id and property_type in ('nha_pho', 'chua_ro') and floors is null;
  end if;
$b$);
end $$;
