-- nguon-admin-xac-minh.sql — SRS-5.1zzzzzzz241 (20261028f, OPEN-31 a). Đỏ khi ba cột nguồn của tin không nhận `admin_xac_minh`.
begin;
set local client_min_messages = warning;
set local session_replication_role = replica;
insert into sellers (id, zalo_user_id, seller_type) values ('00000000-0000-0000-0000-0000000000a9', 'zl-xm-1', 'ccrb');
insert into listings (id, code, seller_id, deal, district, description, status, property_type, price_source, ward_source, property_type_source)
values ('10000000-0000-0000-0000-0000000000a9', 'BDS-THU-SQL-XM', '00000000-0000-0000-0000-0000000000a9', 'ban', 'Quận 5', 'x', 'cho_thong_tin',
        'nha_pho', 'admin_xac_minh', 'admin_xac_minh', 'admin_xac_minh');
rollback;
