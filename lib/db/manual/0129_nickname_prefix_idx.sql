-- 0129: 멘션 자동완성 접두 검색 인덱스(2026-07-21)
-- 기존 trgm GIN은 3자 미만 접두에 비효율 — (server_id, lower(nickname)) text_pattern_ops로
-- 1자부터 인덱스 스캔 보장(수만 행 대비). 쿼리는 lower(nickname) like lower($q)||'%' 형태.
create index if not exists characters_nick_prefix_idx
  on characters (server_id, lower(nickname) text_pattern_ops);
