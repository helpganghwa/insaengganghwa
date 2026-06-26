-- 0083_catalog_active_idx.sql — 활성 카탈로그 조회 부분 인덱스(감사 LOW, 베스트프랙티스).
-- getActiveCatalog는 600s 캐시라 실영향은 작지만, where active=true 스캔 제거. 멱등.
create index if not exists catalog_items_active_idx on catalog_items (active) where active = true;
