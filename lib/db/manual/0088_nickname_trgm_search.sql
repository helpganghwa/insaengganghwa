-- 0088_nickname_trgm_search.sql — 친구 검색 닉네임 부분일치 인덱스(감사 F3-mail). 멱등.
-- friends.searchUsers가 `nickname ILIKE '%term%'`로 검색하는데, characters의 UNIQUE btree
-- (characters_nickname_uq)는 양끝 와일드카드 부분일치엔 무용 → seq scan. serverId 스코프 +
-- LIMIT 20으로 현재(서버당 수천)는 무해하나, 서버당 1만+ 캐릭터부터 비용이 커진다.
-- pg_trgm GIN 인덱스로 ILIKE '%...%'를 인덱스 스캔으로 전환(코드 변경 불필요).
create extension if not exists pg_trgm;
create index if not exists characters_nickname_trgm_gin
  on characters using gin (nickname gin_trgm_ops);
