-- 0026 최고강화자 셀프조인 인덱스.
-- championCatalogIds / liberatedItemRanks의 NOT EXISTS 서브쿼리는 catalog_item_id별로
-- (max_enhance_level, max_enhance_reached_at, user_id)를 비교한다. 인덱스가 없어 user_equipment
-- 전체 seq scan → 유저·아이템 증가 시 O(n^2)-ish. 이 복합 인덱스로 index scan 전환.
-- 쿼리가 max_enhance_level > 0만 다루므로 partial index(작고 빠름). 멱등.
create index if not exists ue_catalog_rank_idx
  on public.user_equipment (catalog_item_id, max_enhance_level desc, max_enhance_reached_at, user_id)
  where max_enhance_level > 0;
